/**
 * Minimal Nostr client with NIP-01 queries and NIP-42 AUTH.
 *
 * Uses NIP-07 when a browser extension is available, with an ephemeral
 * page-lifetime identity as the fallback for read-only queries on open relays.
 */

import { makeAuthEvent } from "nostr-tools/nip42";
import {
  type SignedNostrEvent,
  signNostrEvent,
} from "@/shared/lib/nostr-signer";

export interface NostrFilter {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  [tag: `#${string}`]: string[] | undefined;
}

export type NostrEvent = SignedNostrEvent;

const QUERY_TIMEOUT_MS = 10_000;
const UNAUTHENTICATED_GRACE_MS = 100;

type PublishTemplate = {
  kind: number;
  tags: string[][];
  content: string;
};

type PublishOptions = { requireNip07?: boolean };

interface PendingPublish {
  resolve: (event: NostrEvent) => void;
  reject: (error: Error) => void;
  event: NostrEvent;
  timeout: ReturnType<typeof setTimeout>;
}

interface SharedPublisher {
  ws: WebSocket;
  ready: Promise<void>;
  publish: (event: NostrEvent) => Promise<NostrEvent>;
}

const sharedPublishers = new Map<string, SharedPublisher>();

function publisherKey(wsUrl: string, options?: PublishOptions): string {
  return `${wsUrl}|nip07:${options?.requireNip07 === true ? "1" : "0"}`;
}

function createSharedPublisher(
  wsUrl: string,
  options?: PublishOptions,
): SharedPublisher {
  const pending = new Map<string, PendingPublish>();
  const ws = new WebSocket(wsUrl);
  let authEventId: string | null = null;
  let readySettled = false;
  let closed = false;
  let unauthenticatedReadyTimer: ReturnType<typeof setTimeout> | null = null;
  let resolveReady: () => void = () => {};
  let rejectReady: (error: Error) => void = () => {};

  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const markReady = () => {
    if (readySettled || closed) return;
    readySettled = true;
    if (unauthenticatedReadyTimer) {
      clearTimeout(unauthenticatedReadyTimer);
      unauthenticatedReadyTimer = null;
    }
    resolveReady();
  };

  const fail = (error: Error) => {
    if (!readySettled) {
      readySettled = true;
      rejectReady(error);
    }
    for (const item of pending.values()) {
      clearTimeout(item.timeout);
      item.reject(error);
    }
    pending.clear();
  };

  ws.addEventListener("open", () => {
    unauthenticatedReadyTimer = setTimeout(
      markReady,
      UNAUTHENTICATED_GRACE_MS,
    );
  });

  ws.addEventListener("message", async (msg) => {
    let data: unknown;
    try {
      data = JSON.parse(String(msg.data));
    } catch {
      return;
    }
    if (!Array.isArray(data)) return;

    if (data[0] === "AUTH" && typeof data[1] === "string") {
      if (unauthenticatedReadyTimer) {
        clearTimeout(unauthenticatedReadyTimer);
        unauthenticatedReadyTimer = null;
      }
      try {
        const signed = await signNostrEvent(
          makeAuthEvent(wsUrl, data[1]),
          options,
        );
        if (closed) return;
        authEventId = signed.id;
        ws.send(JSON.stringify(["AUTH", signed]));
      } catch (error) {
        fail(
          error instanceof Error
            ? error
            : new Error("Failed to sign relay authentication."),
        );
      }
      return;
    }

    if (data[0] === "OK" && data[1] === authEventId) {
      if (data[2] === true) {
        markReady();
      } else {
        fail(
          new Error(
            typeof data[3] === "string"
              ? data[3]
              : "Relay authentication failed.",
          ),
        );
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
      return;
    }

    if (data[0] === "OK" && typeof data[1] === "string") {
      const item = pending.get(data[1]);
      if (!item) return;
      pending.delete(data[1]);
      clearTimeout(item.timeout);
      if (data[2] === true) {
        item.resolve(item.event);
      } else {
        item.reject(
          new Error(
            typeof data[3] === "string"
              ? data[3]
              : "Relay rejected the event.",
          ),
        );
      }
    }
  });

  ws.addEventListener("error", () => {
    fail(new Error("WebSocket connection failed"));
    try {
      ws.close();
    } catch {
      // ignore
    }
  });

  ws.addEventListener("close", () => {
    closed = true;
    if (unauthenticatedReadyTimer) {
      clearTimeout(unauthenticatedReadyTimer);
      unauthenticatedReadyTimer = null;
    }
    fail(new Error("Relay connection closed."));
    sharedPublishers.delete(publisherKey(wsUrl, options));
  });

  return {
    ws,
    ready,
    publish: (event) =>
      new Promise((resolve, reject) => {
        if (closed || ws.readyState === WebSocket.CLOSING) {
          reject(new Error("Relay connection is closing."));
          return;
        }
        const timeout = setTimeout(() => {
          pending.delete(event.id);
          reject(
            new Error(`Relay publish timed out after ${QUERY_TIMEOUT_MS}ms`),
          );
        }, QUERY_TIMEOUT_MS);
        pending.set(event.id, { resolve, reject, event, timeout });
        ws.send(JSON.stringify(["EVENT", event]));
      }),
  };
}

function getSharedPublisher(
  wsUrl: string,
  options?: PublishOptions,
): SharedPublisher {
  const key = publisherKey(wsUrl, options);
  const existing = sharedPublishers.get(key);
  if (
    existing &&
    existing.ws.readyState !== WebSocket.CLOSING &&
    existing.ws.readyState !== WebSocket.CLOSED
  ) {
    return existing;
  }

  const publisher = createSharedPublisher(wsUrl, options);
  sharedPublishers.set(key, publisher);
  return publisher;
}

export async function publishEventFast(
  wsUrl: string,
  template: PublishTemplate,
  options?: PublishOptions,
): Promise<NostrEvent> {
  const event = await signNostrEvent(template, options);
  const publisher = getSharedPublisher(wsUrl, options);
  await publisher.ready;
  return publisher.publish(event);
}

export function subscribeEvents(
  wsUrl: string,
  filter: NostrFilter,
  onEvent: (event: NostrEvent) => void,
  onError?: (error: Error) => void,
): () => void {
  const subId = `s-${Date.now().toString(36)}`;
  let closed = false;
  let reqSent = false;
  let authEventId: string | null = null;
  let unauthenticatedReqTimer: ReturnType<typeof setTimeout> | null = null;
  const ws = new WebSocket(wsUrl);

  const cleanup = () => {
    closed = true;
    if (unauthenticatedReqTimer) {
      clearTimeout(unauthenticatedReqTimer);
    }
    try {
      ws.close();
    } catch {
      // ignore
    }
  };

  const sendReq = () => {
    if (!closed && !reqSent) {
      reqSent = true;
      ws.send(JSON.stringify(["REQ", subId, filter]));
    }
  };

  ws.addEventListener("open", () => {
    unauthenticatedReqTimer = setTimeout(() => sendReq(), 100);
  });

  ws.addEventListener("message", async (msg) => {
    let data: unknown;
    try {
      data = JSON.parse(String(msg.data));
    } catch {
      return;
    }
    if (!Array.isArray(data)) return;

    if (data[0] === "AUTH" && typeof data[1] === "string") {
      if (unauthenticatedReqTimer) {
        clearTimeout(unauthenticatedReqTimer);
        unauthenticatedReqTimer = null;
      }
      try {
        const signed = await signNostrEvent(makeAuthEvent(wsUrl, data[1]));
        if (closed) return;
        authEventId = signed.id;
        ws.send(JSON.stringify(["AUTH", signed]));
      } catch (error) {
        onError?.(
          error instanceof Error
            ? error
            : new Error("Failed to sign relay authentication."),
        );
      }
      return;
    }

    if (data[0] === "OK" && data[1] === authEventId) {
      if (data[2] === true) {
        sendReq();
      } else {
        onError?.(
          new Error(
            typeof data[3] === "string"
              ? data[3]
              : "Relay authentication failed.",
          ),
        );
      }
      return;
    }

    if (data[0] === "EVENT" && data[1] === subId && data[2]) {
      onEvent(data[2] as NostrEvent);
      return;
    }

    if (data[0] === "CLOSED" && data[1] === subId) {
      onError?.(
        new Error(
          typeof data[2] === "string"
            ? data[2]
            : "subscription closed by relay",
        ),
      );
    }
  });

  ws.addEventListener("error", () => {
    if (!closed) {
      onError?.(new Error("WebSocket connection failed"));
    }
  });

  return cleanup;
}

/**
 * Open a WebSocket to `wsUrl`, authenticate via NIP-42 if challenged,
 * send a REQ with the given filter, collect EVENTs until EOSE, then
 * close and return them.
 */
export function queryEvents(
  wsUrl: string,
  filter: NostrFilter,
): Promise<NostrEvent[]> {
  return new Promise((resolve, reject) => {
    const events: NostrEvent[] = [];
    const subId = `q-${Date.now().toString(36)}`;
    let settled = false;
    let reqSent = false;
    let authEventId: string | null = null;
    let unauthenticatedReqTimer: ReturnType<typeof setTimeout> | null = null;

    const ws = new WebSocket(wsUrl);

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        ws.close();
        reject(new Error(`Relay query timed out after ${QUERY_TIMEOUT_MS}ms`));
      }
    }, QUERY_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeout);
      if (unauthenticatedReqTimer) {
        clearTimeout(unauthenticatedReqTimer);
      }
      try {
        ws.close();
      } catch {
        // ignore
      }
    };

    const sendReq = () => {
      if (!reqSent) {
        reqSent = true;
        ws.send(JSON.stringify(["REQ", subId, filter]));
      }
    };

    ws.addEventListener("open", () => {
      // Wait briefly for an AUTH challenge before sending REQ.
      // Buzz relays always send AUTH, but other relays may not.
      unauthenticatedReqTimer = setTimeout(() => sendReq(), 100);
    });

    ws.addEventListener("message", async (msg) => {
      let data: unknown;
      try {
        data = JSON.parse(String(msg.data));
      } catch {
        return;
      }
      if (!Array.isArray(data)) return;

      const [type] = data;

      if (type === "AUTH" && typeof data[1] === "string") {
        // NIP-42: relay sent an AUTH challenge — sign and respond.
        if (unauthenticatedReqTimer) {
          clearTimeout(unauthenticatedReqTimer);
          unauthenticatedReqTimer = null;
        }
        const challenge = data[1];
        const template = makeAuthEvent(wsUrl, challenge);
        try {
          const signed = await signNostrEvent(template);
          if (settled) return;
          authEventId = signed.id;
          ws.send(JSON.stringify(["AUTH", signed]));
        } catch (error) {
          if (!settled) {
            settled = true;
            cleanup();
            reject(
              error instanceof Error
                ? error
                : new Error("Failed to sign relay authentication."),
            );
          }
        }
        return;
      }

      if (type === "OK" && data[1] === authEventId) {
        if (data[2] === true) {
          sendReq();
        } else if (!settled) {
          settled = true;
          cleanup();
          reject(
            new Error(
              typeof data[3] === "string"
                ? data[3]
                : "Relay authentication failed.",
            ),
          );
        }
        return;
      }

      if (type === "EVENT" && data[1] === subId && data[2]) {
        events.push(data[2] as NostrEvent);
      } else if (type === "EOSE" && data[1] === subId) {
        if (!settled) {
          settled = true;
          cleanup();
          resolve(events);
        }
      } else if (type === "CLOSED" && data[1] === subId) {
        // Subscription was rejected (e.g. auth failed).
        if (!settled) {
          settled = true;
          cleanup();
          const reason =
            typeof data[2] === "string"
              ? data[2]
              : "subscription closed by relay";
          reject(new Error(reason));
        }
      } else if (type === "NOTICE") {
        // Informational notice from relay — ignore for now.
      }
    });

    ws.addEventListener("error", () => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error("WebSocket connection failed"));
      }
    });

    ws.addEventListener("close", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(events);
      }
    });
  });
}

export function publishEvent(
  wsUrl: string,
  template: PublishTemplate,
  options?: PublishOptions,
): Promise<NostrEvent> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let signedEvent: NostrEvent | null = null;
    let authEventId: string | null = null;
    let publishAfterAuth = false;
    let unauthenticatedPublishTimer: ReturnType<typeof setTimeout> | null = null;

    const ws = new WebSocket(wsUrl);
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        ws.close();
        reject(new Error(`Relay publish timed out after ${QUERY_TIMEOUT_MS}ms`));
      }
    }, QUERY_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timeout);
      if (unauthenticatedPublishTimer) {
        clearTimeout(unauthenticatedPublishTimer);
      }
      try {
        ws.close();
      } catch {
        // ignore
      }
    };

    const sendEvent = async () => {
      if (signedEvent) {
        ws.send(JSON.stringify(["EVENT", signedEvent]));
        return;
      }
      try {
        signedEvent = await signNostrEvent(template, options);
        if (!settled) {
          ws.send(JSON.stringify(["EVENT", signedEvent]));
        }
      } catch (error) {
        if (!settled) {
          settled = true;
          cleanup();
          reject(
            error instanceof Error
              ? error
              : new Error("Failed to sign event."),
          );
        }
      }
    };

    ws.addEventListener("open", () => {
      unauthenticatedPublishTimer = setTimeout(() => {
        void sendEvent();
      }, 100);
    });

    ws.addEventListener("message", async (msg) => {
      let data: unknown;
      try {
        data = JSON.parse(String(msg.data));
      } catch {
        return;
      }
      if (!Array.isArray(data)) return;

      if (data[0] === "AUTH" && typeof data[1] === "string") {
        if (unauthenticatedPublishTimer) {
          clearTimeout(unauthenticatedPublishTimer);
          unauthenticatedPublishTimer = null;
        }
        const challenge = data[1];
        const template = makeAuthEvent(wsUrl, challenge);
        try {
          const signed = await signNostrEvent(template, options);
          if (settled) return;
          authEventId = signed.id;
          publishAfterAuth = true;
          ws.send(JSON.stringify(["AUTH", signed]));
        } catch (error) {
          if (!settled) {
            settled = true;
            cleanup();
            reject(
              error instanceof Error
                ? error
                : new Error("Failed to sign relay authentication."),
            );
          }
        }
        return;
      }

      if (data[0] === "OK" && data[1] === authEventId) {
        if (data[2] === true && publishAfterAuth) {
          publishAfterAuth = false;
          void sendEvent();
        } else if (!settled) {
          settled = true;
          cleanup();
          reject(
            new Error(
              typeof data[3] === "string"
                ? data[3]
                : "Relay authentication failed.",
            ),
          );
        }
        return;
      }

      if (data[0] === "OK" && signedEvent && data[1] === signedEvent.id) {
        if (!settled) {
          settled = true;
          if (data[2] === true) {
            const event = signedEvent;
            cleanup();
            resolve(event);
          } else {
            cleanup();
            reject(
              new Error(
                typeof data[3] === "string"
                  ? data[3]
                  : "Relay rejected the event.",
              ),
            );
          }
        }
      }
    });

    ws.addEventListener("error", () => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error("WebSocket connection failed"));
      }
    });

    ws.addEventListener("close", () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error("Relay closed before confirming the event."));
      }
    });
  });
}
