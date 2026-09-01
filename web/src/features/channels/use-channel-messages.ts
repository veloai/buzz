import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  publishEvent,
  publishEventFast,
  queryEvents,
  subscribeEvents,
  warmPublishConnection,
  type NostrEvent,
} from "@/shared/lib/nostr-client";
import { relayWsUrl } from "@/shared/lib/relay-url";

export interface ChannelSummary {
  id: string;
  name: string;
  description: string;
  visibility?: "open" | "private";
  isVirtual?: boolean;
}

export interface ChannelMessage {
  id: string;
  author: string;
  content: string;
  createdAt: number;
}

export const DEFAULT_CHANNEL_ID = "00000000-0000-4000-8000-00000000a1fa";

const defaultChannel: ChannelSummary = {
  id: DEFAULT_CHANNEL_ID,
  name: "ALFA Control",
  description: "mac-air ALFA, Hermes, Buzz 작업 대화",
  visibility: "open",
};

function firstTag(event: NostrEvent, name: string): string | undefined {
  return event.tags.find((tag) => tag[0] === name)?.[1];
}

function hasTag(event: NostrEvent, name: string): boolean {
  return event.tags.some((tag) => tag[0] === name);
}

function eventToChannel(event: NostrEvent): ChannelSummary {
  const id = firstTag(event, "d") ?? event.id;
  const visibility =
    firstTag(event, "visibility") === "private" || hasTag(event, "private")
      ? "private"
      : "open";
  return {
    id,
    name: firstTag(event, "name") || "untitled-channel",
    description: firstTag(event, "about") || event.content || "",
    visibility,
  };
}

function eventToMessage(event: NostrEvent): ChannelMessage {
  return {
    id: event.id,
    author: event.pubkey,
    content: event.content,
    createdAt: event.created_at,
  };
}

function dedupById<T extends { id: string }>(items: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(item.id, item);
  }
  return [...map.values()];
}

function sortMessages(messages: ChannelMessage[]): ChannelMessage[] {
  return [...messages].sort((a, b) => a.createdAt - b.createdAt);
}

async function fetchChannels(): Promise<ChannelSummary[]> {
  const events = await queryEvents(relayWsUrl(), { kinds: [39000], limit: 50 });
  const channels = dedupById(
    events
      .filter((event) => firstTag(event, "archived") !== "true")
      .sort((a, b) => a.created_at - b.created_at)
      .map(eventToChannel),
  ).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );

  if (!channels.some((channel) => channel.id === defaultChannel.id)) {
    return [defaultChannel, ...channels];
  }

  return channels;
}

async function fetchMessages(channelId: string): Promise<ChannelMessage[]> {
  const events = await queryEvents(relayWsUrl(), {
    kinds: [9],
    "#h": [channelId],
    limit: 200,
  });
  return sortMessages(dedupById(events.map(eventToMessage)));
}

export function useChannels() {
  return useQuery({
    queryKey: ["channels"],
    queryFn: fetchChannels,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

export function useChannelMessages(
  channelId: string,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!(enabled && channelId)) return;

    const unsubscribe = subscribeEvents(
      relayWsUrl(),
      {
        kinds: [9],
        "#h": [channelId],
        since: Math.floor(Date.now() / 1000) - 5,
      },
      (event) => {
        queryClient.setQueryData<ChannelMessage[]>(
          ["channel-messages", channelId],
          (currentMessages = []) =>
            sortMessages(dedupById([...currentMessages, eventToMessage(event)])),
        );
      },
      (error) => {
        console.warn("Buzz channel subscription failed", error);
      },
    );
    warmPublishConnection(relayWsUrl());

    return unsubscribe;
  }, [channelId, enabled, queryClient]);

  return useQuery({
    queryKey: ["channel-messages", channelId],
    queryFn: () => fetchMessages(channelId),
    enabled: enabled && !!channelId,
    staleTime: 30_000,
  });
}

export function useSendChannelMessage(channelId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) {
        throw new Error("메시지를 입력하세요.");
      }
      return publishEventFast(relayWsUrl(), {
        kind: 9,
        tags: [["h", channelId]],
        content: trimmed,
      });
    },
    onMutate: async (content) => {
      const trimmed = content.trim();
      const tempId = `pending-${window.crypto.randomUUID()}`;
      void queryClient.cancelQueries({
        queryKey: ["channel-messages", channelId],
      });
      queryClient.setQueryData<ChannelMessage[]>(
        ["channel-messages", channelId],
        (currentMessages = []) =>
          sortMessages(
            dedupById([
              ...currentMessages,
              {
                id: tempId,
                author: "local-user",
                content: trimmed,
                createdAt: Math.floor(Date.now() / 1000),
              },
            ]),
          ),
      );
      return { tempId };
    },
    onError: (_error, _content, context) => {
      if (!context?.tempId) return;
      queryClient.setQueryData<ChannelMessage[]>(
        ["channel-messages", channelId],
        (currentMessages = []) =>
          currentMessages.filter((message) => message.id !== context.tempId),
      );
    },
    onSuccess: (event, _content, context) => {
      queryClient.setQueryData<ChannelMessage[]>(
        ["channel-messages", channelId],
        (currentMessages = []) =>
          sortMessages(
            dedupById([
              ...currentMessages.filter(
                (message) => message.id !== context?.tempId,
              ),
              eventToMessage(event),
            ]),
          ),
      );
    },
  });
}

export function useCreateChannel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      name,
      description,
      visibility,
    }: {
      id: string;
      name: string;
      description: string;
      visibility: "open" | "private";
    }) =>
      publishEvent(
        relayWsUrl(),
        {
          kind: 9007,
          tags: [
            ["h", id],
            ["name", name],
            ["about", description],
            ["visibility", visibility],
            ["channel_type", "stream"],
          ],
          content: "",
        },
        { requireNip07: visibility === "private" },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["channels"] });
    },
  });
}

export function useUpdateChannel(channelId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      name,
      description,
      visibility,
    }: {
      name: string;
      description: string;
      visibility: "open" | "private";
    }) =>
      publishEvent(
        relayWsUrl(),
        {
          kind: 9002,
          tags: [
            ["h", channelId],
            ["name", name],
            ["about", description],
            ["visibility", visibility],
          ],
          content: "",
        },
        { requireNip07: visibility === "private" },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["channels"] });
      void queryClient.invalidateQueries({
        queryKey: ["channel-messages", channelId],
      });
    },
  });
}

export function useArchiveChannel(channelId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () =>
      publishEvent(relayWsUrl(), {
        kind: 9002,
        tags: [
          ["h", channelId],
          ["archived", "true"],
        ],
        content: "",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["channels"] });
    },
  });
}
