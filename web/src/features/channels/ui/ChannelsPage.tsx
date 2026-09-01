import {
  BookMarked,
  Hash,
  MessageSquareText,
  RefreshCw,
  Send,
  UsersRound,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { truncatePubkey } from "@/shared/lib/pubkey";
import { Button } from "@/shared/ui/button";
import {
  useChannelMessages,
  useChannels,
  useSendChannelMessage,
  type ChannelSummary,
} from "../use-channel-messages";

function formatTime(seconds: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(seconds * 1000));
}

function fallbackChannels(): ChannelSummary[] {
  return [
    {
      id: "00000000-0000-4000-8000-00000000a1fa",
      name: "ALFA Control",
      description: "mac-air ALFA, Hermes, Buzz 작업 대화",
      isVirtual: true,
    },
  ];
}

export function ChannelsPage() {
  const {
    data: loadedChannels,
    isLoading: channelsLoading,
    error: channelsError,
    refetch: refetchChannels,
  } = useChannels();
  const channels = loadedChannels && loadedChannels.length > 0
    ? loadedChannels
    : fallbackChannels();
  const [selectedChannelId, setSelectedChannelId] = useState(channels[0].id);

  useEffect(() => {
    if (!channels.some((channel) => channel.id === selectedChannelId)) {
      setSelectedChannelId(channels[0].id);
    }
  }, [channels, selectedChannelId]);

  const selectedChannel = useMemo(
    () =>
      channels.find((channel) => channel.id === selectedChannelId) ??
      channels[0],
    [channels, selectedChannelId],
  );

  const {
    data: messages = [],
    isLoading: messagesLoading,
    error: messagesError,
    refetch: refetchMessages,
  } = useChannelMessages(selectedChannel.id, {
    enabled: !selectedChannel.isVirtual,
  });
  const sendMessage = useSendChannelMessage(selectedChannel.id);
  const [draft, setDraft] = useState("");
  useEffect(() => {
    if (channelsError) {
      toast.error("채널 목록을 불러오지 못했습니다.", {
        description: (channelsError as Error).message,
      });
    }
  }, [channelsError]);

  useEffect(() => {
    if (messagesError && !selectedChannel.isVirtual) {
      toast.error("메시지를 불러오지 못했습니다.", {
        description: (messagesError as Error).message,
      });
    }
  }, [messagesError, selectedChannel.isVirtual]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;

    try {
      await sendMessage.mutateAsync(content);
      setDraft("");
    } catch (error) {
      toast.error("메시지를 보내지 못했습니다.", {
        description:
          error instanceof Error ? error.message : "릴레이가 전송을 거절했습니다.",
      });
    }
  }

  return (
    <div className="flex min-h-dvh bg-[#101112] text-white">
      <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-[#15130f] md:flex md:flex-col">
        <div className="border-b border-white/10 px-4 py-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ffb703]">
            Buzz
          </div>
          <h1 className="mt-1 text-lg font-semibold">하이브마인드</h1>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <div className="mb-2 flex items-center justify-between px-2 text-xs font-medium uppercase tracking-[0.14em] text-white/45">
            채널
            <Button
              aria-label="채널 새로고침"
              className="h-7 w-7 border-white/10 text-white/70 hover:bg-white/10"
              onClick={() => void refetchChannels()}
              size="icon"
              type="button"
              variant="ghost"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="space-y-1">
            {channels.map((channel) => {
              const active = channel.id === selectedChannel.id;
              return (
                <button
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition ${
                    active
                      ? "bg-[#ffb703] text-black"
                      : "text-white/70 hover:bg-white/10 hover:text-white"
                  }`}
                  key={channel.id}
                  onClick={() => setSelectedChannelId(channel.id)}
                  type="button"
                >
                  <Hash className="h-4 w-4 shrink-0" />
                  <span className="truncate">{channel.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <a
          className="m-3 flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white"
          href="/repos"
        >
          <BookMarked className="h-4 w-4" />
          저장소 보기
        </a>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-16 items-center justify-between border-b border-white/10 bg-[#171717] px-4 md:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Hash className="h-5 w-5 text-[#ffb703]" />
              <h2 className="truncate text-base font-semibold md:text-lg">
                {selectedChannel.name}
              </h2>
              {selectedChannel.isVirtual && (
                <span className="rounded border border-[#ffb703]/40 px-2 py-0.5 text-xs text-[#ffb703]">
                  기본
                </span>
              )}
            </div>
            <p className="mt-1 truncate text-xs text-white/50">
              {selectedChannel.description}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              aria-label="메시지 새로고침"
              className="border-white/10 text-white/70 hover:bg-white/10"
              onClick={() => void refetchMessages()}
              size="icon"
              type="button"
              variant="ghost"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              asChild
              className="hidden border-white/10 text-white/70 hover:bg-white/10 sm:inline-flex"
              variant="ghost"
            >
              <a href="/repos">
                <BookMarked className="h-4 w-4" />
                저장소
              </a>
            </Button>
          </div>
        </header>

        <section className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6">
              {channelsLoading || messagesLoading ? (
                <div className="space-y-4">
                  {["a", "b", "c"].map((item) => (
                    <div className="flex gap-3" key={item}>
                      <div className="h-9 w-9 animate-pulse rounded bg-white/10" />
                      <div className="w-full max-w-xl space-y-2">
                        <div className="h-4 w-32 animate-pulse rounded bg-white/10" />
                        <div className="h-16 animate-pulse rounded bg-white/10" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-full min-h-[360px] items-center justify-center">
                  <div className="max-w-md text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg border border-[#ffb703]/30 bg-[#ffb703]/10 text-[#ffb703]">
                      <MessageSquareText className="h-7 w-7" />
                    </div>
                    <h3 className="mt-4 text-xl font-semibold">
                      아직 대화가 없습니다
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-white/55">
                      아래 입력창에서 ALFA 작업 대화를 시작하세요. 릴레이가
                      쓰기를 요구하면 브라우저 서명 확장이 필요할 수 있습니다.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {messages.map((message) => (
                    <article className="flex gap-3" key={message.id}>
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[#2a2416] text-sm font-semibold text-[#ffb703]">
                        {truncatePubkey(message.author).charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-mono text-sm text-white/85">
                            {truncatePubkey(message.author)}
                          </span>
                          <time className="text-xs text-white/35">
                            {formatTime(message.createdAt)}
                          </time>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap break-words rounded-md bg-white/[0.04] px-3 py-2 text-sm leading-6 text-white/80">
                          {message.content}
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <form
              className="border-t border-white/10 bg-[#141414] p-3 md:p-4"
              onSubmit={handleSubmit}
            >
              <div className="flex gap-2 rounded-lg border border-white/10 bg-black/20 p-2 focus-within:border-[#ffb703]/70">
                <textarea
                  aria-label="메시지 입력"
                  className="min-h-12 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-6 text-white outline-none placeholder:text-white/35"
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder={`#${selectedChannel.name}에 메시지 보내기`}
                  rows={2}
                  value={draft}
                />
                <Button
                  className="self-end bg-[#ffb703] text-black hover:bg-[#f5a900]"
                  disabled={sendMessage.isPending || draft.trim().length === 0}
                  size="icon"
                  type="submit"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </div>

          <aside className="hidden w-80 shrink-0 border-l border-white/10 bg-[#151515] p-5 xl:block">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <UsersRound className="h-4 w-4 text-[#ffb703]" />
              작업 멤버
            </div>
            <p className="mt-3 text-sm leading-6 text-white/55">
              아직 등록된 사람이 없습니다. 메시지가 쌓이면 작성자와 에이전트
              활동이 이곳에 정리됩니다.
            </p>
          </aside>
        </section>
      </main>
    </div>
  );
}
