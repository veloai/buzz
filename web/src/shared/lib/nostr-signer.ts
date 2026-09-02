import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
} from "nostr-tools/pure";

export type UnsignedNostrEvent = {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
};

export type SignedNostrEvent = UnsignedNostrEvent & {
  id: string;
  pubkey: string;
  sig: string;
};

type Nip07Provider = {
  getPublicKey(): Promise<string>;
  signEvent(event: UnsignedNostrEvent): Promise<SignedNostrEvent>;
};

declare global {
  interface Window {
    nostr?: Nip07Provider;
  }
}

export class Nip07UnavailableError extends Error {
  constructor() {
    super("A NIP-07 browser extension is required to join in the browser.");
    this.name = "Nip07UnavailableError";
  }
}

const PERSISTED_BROWSER_KEY = "buzz:nip07-fallback-secret-key";
let ephemeralSecretKey: Uint8Array | null = null;

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value: string): Uint8Array | null {
  if (!/^[0-9a-f]{64}$/i.test(value)) return null;
  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function getBrowserSecretKey(): Uint8Array {
  if (typeof window === "undefined") {
    return getEphemeralSecretKey();
  }

  try {
    const existing = window.localStorage.getItem(PERSISTED_BROWSER_KEY);
    const existingBytes = existing ? hexToBytes(existing) : null;
    if (existingBytes) {
      return existingBytes;
    }

    const generated = generateSecretKey();
    window.localStorage.setItem(PERSISTED_BROWSER_KEY, bytesToHex(generated));
    return generated;
  } catch {
    return getEphemeralSecretKey();
  }
}

function getEphemeralSecretKey(): Uint8Array {
  if (!ephemeralSecretKey) {
    ephemeralSecretKey = generateSecretKey();
  }
  return ephemeralSecretKey;
}

export function hasNip07Provider(): boolean {
  return typeof window !== "undefined" && window.nostr != null;
}

/** Return the public identity used for relay authentication, never the secret key. */
export async function getNostrPublicKey(): Promise<string> {
  const provider = typeof window === "undefined" ? undefined : window.nostr;
  const pubkey = provider
    ? await provider.getPublicKey()
    : getPublicKey(getBrowserSecretKey());
  if (!/^[0-9a-f]{64}$/i.test(pubkey)) {
    throw new Error("Invalid browser public key.");
  }
  return pubkey.toLowerCase();
}

function sameUnsignedEvent(
  expected: UnsignedNostrEvent,
  actual: SignedNostrEvent,
): boolean {
  return (
    actual.kind === expected.kind &&
    actual.created_at === expected.created_at &&
    actual.content === expected.content &&
    JSON.stringify(actual.tags) === JSON.stringify(expected.tags)
  );
}

/**
 * Sign with NIP-07 when available, otherwise use a browser-persisted key.
 *
 * The persisted fallback keeps channel ownership usable after reload in the
 * web-only client. If localStorage is unavailable, it falls back to a
 * page-lifetime key for read/write continuity inside the current tab.
 */
export async function signNostrEvent(
  template: Omit<UnsignedNostrEvent, "created_at"> & {
    created_at?: number;
  },
  options?: { requireNip07?: boolean },
): Promise<SignedNostrEvent> {
  const unsigned: UnsignedNostrEvent = {
    ...template,
    created_at: template.created_at ?? Math.floor(Date.now() / 1000),
  };
  const provider = typeof window === "undefined" ? undefined : window.nostr;

  if (provider) {
    const expectedPubkey = await provider.getPublicKey();
    const signed = await provider.signEvent(unsigned);
    if (
      signed.pubkey !== expectedPubkey ||
      !sameUnsignedEvent(unsigned, signed) ||
      typeof signed.id !== "string" ||
      typeof signed.sig !== "string"
    ) {
      throw new Error("The NIP-07 extension returned an invalid signed event.");
    }
    return signed;
  }

  if (options?.requireNip07) {
    return signWithSecretKey(unsigned, getBrowserSecretKey());
  }

  return signWithSecretKey(unsigned, getBrowserSecretKey());
}

function signWithSecretKey(
  unsigned: UnsignedNostrEvent,
  secretKey: Uint8Array,
): SignedNostrEvent {
  const signed = finalizeEvent(unsigned, secretKey);
  if (signed.pubkey !== getPublicKey(secretKey)) {
    throw new Error("Failed to create the browser identity.");
  }
  return signed;
}
