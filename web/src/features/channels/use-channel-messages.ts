import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  publishEvent,
  queryEvents,
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

function eventToChannel(event: NostrEvent): ChannelSummary {
  const id = firstTag(event, "d") ?? event.id;
  const visibility =
    firstTag(event, "visibility") === "private" ? "private" : "open";
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

async function fetchChannels(): Promise<ChannelSummary[]> {
  const events = await queryEvents(relayWsUrl(), { kinds: [39000], limit: 50 });
  const channels = dedupById(events.map(eventToChannel)).sort((a, b) =>
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
  return dedupById(events.map(eventToMessage)).sort(
    (a, b) => a.createdAt - b.createdAt,
  );
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
  return useQuery({
    queryKey: ["channel-messages", channelId],
    queryFn: () => fetchMessages(channelId),
    enabled: enabled && !!channelId,
    staleTime: 5_000,
    refetchInterval: 5_000,
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
      return publishEvent(relayWsUrl(), {
        kind: 9,
        tags: [["h", channelId]],
        content: trimmed,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["channel-messages", channelId],
      });
    },
  });
}
