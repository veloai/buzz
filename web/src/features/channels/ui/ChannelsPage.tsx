import {
  BookMarked,
  Globe2,
  Hash,
  Lock,
  MessageSquareText,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Send,
  Settings,
  Trash2,
  Unlock,
  UsersRound,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { truncatePubkey } from "@/shared/lib/pubkey";
import { Button } from "@/shared/ui/button";
import {
  DEFAULT_CHANNEL_ID,
  useChannelMessages,
  useChannels,
  useSendChannelMessage,
  type ChannelMessage,
  type ChannelSummary,
} from "../use-channel-messages";

const DEFAULT_CHANNELS = fallbackChannels();
const LOCAL_CHANNELS_KEY = "buzz:local-channels";
const LOCAL_CHANNEL_MESSAGE_KEY_PREFIX = "buzz:local-channel-messages:";
const SETTINGS_KEY = "buzz:web-settings";

type BuzzWebLanguage = "ko" | "en";
type ChannelVisibility = "open" | "private";

interface BuzzWebSettings {
  language: BuzzWebLanguage;
  defaultVisibility: ChannelVisibility;
}

const DEFAULT_SETTINGS: BuzzWebSettings = {
  language: "ko",
  defaultVisibility: "private",
};

const COPY = {
  ko: {
    buzzName: "하이브마인드",
    channels: "채널",
    createChannel: "채널 만들기",
    refreshChannels: "채널 새로고침",
    editChannel: "채널 수정",
    refreshMessages: "메시지 새로고침",
    repos: "저장소",
    defaultBadge: "기본",
    localBadge: "로컬",
    open: "공개",
    private: "비공개",
    channelName: "채널 이름",
    channelDescription: "채널 설명",
    saveChannel: "채널 저장",
    deleteChannel: "채널 삭제",
    noMessagesTitle: "아직 대화가 없습니다",
    noMessagesBody:
      "아래 입력창에서 ALFA 작업 대화를 시작하세요. 기본 채널은 이 브라우저 화면에 먼저 저장됩니다.",
    messageInput: "메시지 입력",
    messagePlaceholder: (name: string) => `#${name}에 메시지 보내기`,
    channelTools: "채널 도구",
    settings: "설정",
    language: "표시 언어",
    newChannelVisibility: "새 채널 기본 공개범위",
    currentChannelVisibility: "현재 채널 공개범위",
    editNameDescription: "이름/설명 수정",
    webScope:
      "이 웹판 설정은 현재 브라우저에 저장됩니다. 실제 멤버 초대, 에이전트 투입, 공유 릴레이 권한은 다음 연결 대상입니다.",
    nameRequired: "채널 이름을 입력하세요.",
    defaultUpdated: "기본 채널 공개범위를 저장했습니다.",
    defaultRelayManaged:
      "기본 ALFA Control은 공유 릴레이 채널이라 웹 로컬 설정으로 바꾸지 않습니다.",
    defaultNotDeleted: "기본 ALFA Control은 삭제할 수 없습니다.",
    deleted: "채널을 삭제했습니다.",
    loadChannelsFailed: "채널 목록을 불러오지 못했습니다.",
    loadMessagesFailed: "메시지를 불러오지 못했습니다.",
    sendFailed: "메시지를 보내지 못했습니다.",
    relayRejected: "릴레이가 전송을 거절했습니다.",
    newChannelName: "새 작업방",
    newChannelDescription: "새 ALFA 작업 대화",
    noDescription: "설명 없음",
  },
  en: {
    buzzName: "Hivemind",
    channels: "Channels",
    createChannel: "Create channel",
    refreshChannels: "Refresh channels",
    editChannel: "Edit channel",
    refreshMessages: "Refresh messages",
    repos: "Repositories",
    defaultBadge: "Default",
    localBadge: "Local",
    open: "Open",
    private: "Private",
    channelName: "Channel name",
    channelDescription: "Channel description",
    saveChannel: "Save channel",
    deleteChannel: "Delete channel",
    noMessagesTitle: "No messages yet",
    noMessagesBody:
      "Start an ALFA work conversation below. The default channel is saved in this browser first.",
    messageInput: "Message input",
    messagePlaceholder: (name: string) => `Message #${name}`,
    channelTools: "Channel tools",
    settings: "Settings",
    language: "Language",
    newChannelVisibility: "New channel default visibility",
    currentChannelVisibility: "Current channel visibility",
    editNameDescription: "Edit name/description",
    webScope:
      "These web settings are saved in this browser. Member invites, agent assignment, and shared relay permissions are the next connection target.",
    nameRequired: "Enter a channel name.",
    defaultUpdated: "Default channel visibility saved.",
    defaultRelayManaged:
      "The default ALFA Control channel is shared on the relay and is not changed by local web settings.",
    defaultNotDeleted: "The default ALFA Control channel cannot be deleted.",
    deleted: "Channel deleted.",
    loadChannelsFailed: "Failed to load channels.",
    loadMessagesFailed: "Failed to load messages.",
    sendFailed: "Failed to send message.",
    relayRejected: "The relay rejected the message.",
    newChannelName: "New room",
    newChannelDescription: "New ALFA work conversation",
    noDescription: "No description",
  },
} as const;

function formatTime(seconds: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(seconds * 1000));
}

function displayAuthor(author: string): string {
  return author === "local-user" ? "나" : truncatePubkey(author);
}

function normalizeVisibility(value: unknown): ChannelVisibility {
  return value === "open" ? "open" : "private";
}

function readSettings(): BuzzWebSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<BuzzWebSettings>;
    return {
      language: parsed.language === "en" ? "en" : "ko",
      defaultVisibility: normalizeVisibility(parsed.defaultVisibility),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeSettings(settings: BuzzWebSettings) {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function fallbackChannels(): ChannelSummary[] {
  return [
    {
      id: DEFAULT_CHANNEL_ID,
      name: "ALFA Control",
      description: "mac-air ALFA, Hermes, Buzz 작업 대화",
      visibility: "open",
    },
  ];
}

function isChannelSummary(value: unknown): value is ChannelSummary {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ChannelSummary).id === "string" &&
    typeof (value as ChannelSummary).name === "string" &&
    typeof (value as ChannelSummary).description === "string"
  );
}

function readLocalChannels(): ChannelSummary[] {
  try {
    const raw = window.localStorage.getItem(LOCAL_CHANNELS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isChannelSummary)
      .filter((channel) => channel.id !== DEFAULT_CHANNEL_ID)
      .map((channel) => ({
        ...channel,
        visibility: normalizeVisibility(channel.visibility),
        isVirtual: true,
      }));
  } catch {
    return [];
  }
}

function writeLocalChannels(channels: ChannelSummary[]) {
  const persistedChannels = channels.filter(
    (channel) => channel.id !== DEFAULT_CHANNEL_ID,
  );
  window.localStorage.setItem(
    LOCAL_CHANNELS_KEY,
    JSON.stringify(persistedChannels),
  );
}

function readLocalMessages(channelId: string): ChannelMessage[] {
  try {
    const raw = window.localStorage.getItem(
      `${LOCAL_CHANNEL_MESSAGE_KEY_PREFIX}${channelId}`,
    );
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item): item is ChannelMessage =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as ChannelMessage).id === "string" &&
        typeof (item as ChannelMessage).author === "string" &&
        typeof (item as ChannelMessage).content === "string" &&
        typeof (item as ChannelMessage).createdAt === "number",
    );
  } catch {
    return [];
  }
}

function writeLocalMessages(channelId: string, messages: ChannelMessage[]) {
  window.localStorage.setItem(
    `${LOCAL_CHANNEL_MESSAGE_KEY_PREFIX}${channelId}`,
    JSON.stringify(messages),
  );
}

function removeLocalMessages(channelId: string) {
  window.localStorage.removeItem(
    `${LOCAL_CHANNEL_MESSAGE_KEY_PREFIX}${channelId}`,
  );
}

function mergeChannels(
  baseChannels: ChannelSummary[],
  localChannels: ChannelSummary[],
): ChannelSummary[] {
  const map = new Map<string, ChannelSummary>();
  for (const channel of [...baseChannels, ...localChannels]) {
    map.set(channel.id, channel);
  }
  return [...map.values()];
}

function visibilityLabel(
  visibility: ChannelVisibility,
  language: BuzzWebLanguage,
) {
  return COPY[language][visibility];
}

export function ChannelsPage() {
  const {
    data: loadedChannels,
    isLoading: channelsLoading,
    error: channelsError,
    refetch: refetchChannels,
  } = useChannels();
  const [localChannels, setLocalChannels] = useState<ChannelSummary[]>(() =>
    readLocalChannels(),
  );
  const baseChannels =
    loadedChannels && loadedChannels.length > 0
      ? loadedChannels
      : DEFAULT_CHANNELS;
  const channels = useMemo(
    () => mergeChannels(baseChannels, localChannels),
    [baseChannels, localChannels],
  );
  const [selectedChannelId, setSelectedChannelId] = useState(channels[0].id);
  const [isEditingChannel, setIsEditingChannel] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<BuzzWebSettings>(() =>
    readSettings(),
  );
  const [channelNameDraft, setChannelNameDraft] = useState("");
  const [channelDescriptionDraft, setChannelDescriptionDraft] = useState("");
  const [channelVisibilityDraft, setChannelVisibilityDraft] =
    useState<ChannelVisibility>("private");
  const text = COPY[settings.language];

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
  const isDefaultChannel = selectedChannel.id === DEFAULT_CHANNEL_ID;
  const selectedChannelVisibility = normalizeVisibility(
    selectedChannel.visibility,
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
  const [localMessages, setLocalMessages] = useState<ChannelMessage[]>(() =>
    readLocalMessages(channels[0].id),
  );
  const visibleMessages = selectedChannel.isVirtual ? localMessages : messages;

  useEffect(() => {
    if (selectedChannel.isVirtual) {
      setLocalMessages(readLocalMessages(selectedChannel.id));
    }
  }, [selectedChannel.id, selectedChannel.isVirtual]);

  useEffect(() => {
    setChannelNameDraft(selectedChannel.name);
    setChannelDescriptionDraft(selectedChannel.description);
    setChannelVisibilityDraft(selectedChannelVisibility);
  }, [
    selectedChannel.description,
    selectedChannel.name,
    selectedChannelVisibility,
  ]);

  useEffect(() => {
    if (channelsError) {
      toast.error(text.loadChannelsFailed, {
        description: (channelsError as Error).message,
      });
    }
  }, [channelsError, text.loadChannelsFailed]);

  useEffect(() => {
    if (messagesError && !selectedChannel.isVirtual) {
      toast.error(text.loadMessagesFailed, {
        description: (messagesError as Error).message,
      });
    }
  }, [messagesError, selectedChannel.isVirtual, text.loadMessagesFailed]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;

    if (selectedChannel.isVirtual) {
      const message: ChannelMessage = {
        id: window.crypto.randomUUID(),
        author: "local-user",
        content,
        createdAt: Math.floor(Date.now() / 1000),
      };
      setLocalMessages((currentMessages) => {
        const nextMessages = [...currentMessages, message];
        writeLocalMessages(selectedChannel.id, nextMessages);
        return nextMessages;
      });
      setDraft("");
      return;
    }

    try {
      await sendMessage.mutateAsync(content);
      setDraft("");
    } catch (error) {
      toast.error(text.sendFailed, {
        description:
          error instanceof Error ? error.message : text.relayRejected,
      });
    }
  }

  function updateSettings(nextSettings: BuzzWebSettings) {
    setSettings(nextSettings);
    writeSettings(nextSettings);
  }

  function handleUpdateLanguage(language: BuzzWebLanguage) {
    updateSettings({ ...settings, language });
  }

  function handleUpdateDefaultVisibility(visibility: ChannelVisibility) {
    updateSettings({ ...settings, defaultVisibility: visibility });
  }

  function updateLocalChannelState(nextChannels: ChannelSummary[]) {
    setLocalChannels(nextChannels);
    writeLocalChannels(nextChannels);
  }

  function handleCreateChannel() {
    const newChannel: ChannelSummary = {
      id: window.crypto.randomUUID(),
      name: text.newChannelName,
      description: text.newChannelDescription,
      visibility: settings.defaultVisibility,
      isVirtual: true,
    };
    const nextChannels = [...localChannels, newChannel];
    updateLocalChannelState(nextChannels);
    setSelectedChannelId(newChannel.id);
    setChannelNameDraft(newChannel.name);
    setChannelDescriptionDraft(newChannel.description);
    setChannelVisibilityDraft(normalizeVisibility(newChannel.visibility));
    setIsEditingChannel(true);
  }

  function handleSaveChannel() {
    const name = channelNameDraft.trim();
    if (!name) {
      toast.error(text.nameRequired);
      return;
    }

    if (isDefaultChannel) {
      toast.info(text.defaultRelayManaged);
      setIsEditingChannel(false);
      return;
    }

    const nextChannels = localChannels.map((channel) =>
      channel.id === selectedChannel.id
        ? {
            ...channel,
            name,
            description: channelDescriptionDraft.trim() || text.noDescription,
            visibility: channelVisibilityDraft,
            isVirtual: true,
          }
        : channel,
    );
    updateLocalChannelState(nextChannels);
    setIsEditingChannel(false);
  }

  function handleDeleteChannel() {
    if (isDefaultChannel) {
      toast.error(text.defaultNotDeleted);
      return;
    }
    const nextChannels = localChannels.filter(
      (channel) => channel.id !== selectedChannel.id,
    );
    updateLocalChannelState(nextChannels);
    removeLocalMessages(selectedChannel.id);
    setSelectedChannelId(DEFAULT_CHANNEL_ID);
    toast.success(text.deleted);
  }

  return (
    <div className="flex min-h-dvh bg-[#101112] text-white">
      <aside className="hidden w-64 shrink-0 border-r border-white/10 bg-[#15130f] md:flex md:flex-col">
        <div className="border-b border-white/10 px-4 py-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ffb703]">
            Buzz
          </div>
          <h1 className="mt-1 text-lg font-semibold">{text.buzzName}</h1>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <div className="mb-2 flex items-center justify-between px-2 text-xs font-medium uppercase tracking-[0.14em] text-white/45">
            {text.channels}
            <div className="flex items-center gap-1">
              <Button
                aria-label={text.createChannel}
                className="h-7 w-7 border-white/10 text-white/70 hover:bg-white/10"
                onClick={handleCreateChannel}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <Button
                aria-label={text.refreshChannels}
                className="h-7 w-7 border-white/10 text-white/70 hover:bg-white/10"
                onClick={() => void refetchChannels()}
                size="icon"
                type="button"
                variant="ghost"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
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
                  <span
                    className={`ml-auto h-2 w-2 shrink-0 rounded-full ${
                      normalizeVisibility(channel.visibility) === "open"
                        ? "bg-emerald-400"
                        : "bg-[#ffb703]"
                    }`}
                  />
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
          {text.repos}
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
                  {isDefaultChannel ? text.defaultBadge : text.localBadge}
                </span>
              )}
              <span
                className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs ${
                  selectedChannelVisibility === "open"
                    ? "border-emerald-400/30 text-emerald-300"
                    : "border-[#ffb703]/40 text-[#ffb703]"
                }`}
              >
                {selectedChannelVisibility === "open" ? (
                  <Unlock className="h-3 w-3" />
                ) : (
                  <Lock className="h-3 w-3" />
                )}
                {visibilityLabel(selectedChannelVisibility, settings.language)}
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-white/50">
              {selectedChannel.description}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              aria-label={text.settings}
              className="border-white/10 text-white/70 hover:bg-white/10"
              onClick={() => setIsSettingsOpen((current) => !current)}
              size="icon"
              type="button"
              variant="ghost"
            >
              {isSettingsOpen ? (
                <X className="h-4 w-4" />
              ) : (
                <Settings className="h-4 w-4" />
              )}
            </Button>
            <Button
              aria-label={text.editChannel}
              className="border-white/10 text-white/70 hover:bg-white/10"
              onClick={() => setIsEditingChannel((current) => !current)}
              size="icon"
              type="button"
              variant="ghost"
            >
              {isEditingChannel ? (
                <X className="h-4 w-4" />
              ) : (
                <Pencil className="h-4 w-4" />
              )}
            </Button>
            <Button
              aria-label={text.refreshMessages}
              className="border-white/10 text-white/70 hover:bg-white/10"
              onClick={() => {
                if (selectedChannel.isVirtual) {
                  setLocalMessages(readLocalMessages(selectedChannel.id));
                  return;
                }
                void refetchMessages();
              }}
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
                {text.repos}
              </a>
            </Button>
          </div>
        </header>

        <section className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            {isSettingsOpen && (
              <div className="border-b border-white/10 bg-[#161616] px-4 py-3 md:px-6">
                <div className="grid gap-3 lg:grid-cols-2">
                  <div>
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
                      <Globe2 className="h-4 w-4 text-[#ffb703]" />
                      {text.language}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(["ko", "en"] as const).map((language) => (
                        <Button
                          className={`border-white/10 ${
                            settings.language === language
                              ? "bg-[#ffb703] text-black hover:bg-[#f5a900]"
                              : "text-white/75 hover:bg-white/10"
                          }`}
                          key={language}
                          onClick={() => handleUpdateLanguage(language)}
                          type="button"
                          variant="ghost"
                        >
                          {language === "ko" ? "한국어" : "English"}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-white/45">
                      <Lock className="h-4 w-4 text-[#ffb703]" />
                      {text.newChannelVisibility}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(["private", "open"] as const).map((visibility) => (
                        <Button
                          className={`border-white/10 ${
                            settings.defaultVisibility === visibility
                              ? "bg-[#ffb703] text-black hover:bg-[#f5a900]"
                              : "text-white/75 hover:bg-white/10"
                          }`}
                          key={visibility}
                          onClick={() =>
                            handleUpdateDefaultVisibility(visibility)
                          }
                          type="button"
                          variant="ghost"
                        >
                          {visibility === "private" ? (
                            <Lock className="h-4 w-4" />
                          ) : (
                            <Unlock className="h-4 w-4" />
                          )}
                          {visibilityLabel(visibility, settings.language)}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
            {isEditingChannel && (
              <div className="border-b border-white/10 bg-[#181818] px-4 py-3 md:px-6">
                <div className="grid gap-2 md:grid-cols-[minmax(140px,240px)_1fr_minmax(180px,240px)_auto]">
                  <input
                    aria-label={text.channelName}
                    className="h-10 rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-[#ffb703]/70"
                    onChange={(event) =>
                      setChannelNameDraft(event.target.value)
                    }
                    value={channelNameDraft}
                  />
                  <input
                    aria-label={text.channelDescription}
                    className="h-10 rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-[#ffb703]/70"
                    onChange={(event) =>
                      setChannelDescriptionDraft(event.target.value)
                    }
                    value={channelDescriptionDraft}
                  />
                  <fieldset
                    aria-label={text.currentChannelVisibility}
                    className="grid grid-cols-2 gap-1 rounded-md border border-white/10 bg-black/20 p-1"
                  >
                    {(["private", "open"] as const).map((visibility) => (
                      <button
                        className={`inline-flex h-8 items-center justify-center gap-1 rounded px-2 text-xs font-semibold ${
                          channelVisibilityDraft === visibility
                            ? "bg-[#ffb703] text-black"
                            : "text-white/60 hover:bg-white/10 hover:text-white"
                        }`}
                        key={visibility}
                        onClick={() => setChannelVisibilityDraft(visibility)}
                        type="button"
                      >
                        {visibility === "private" ? (
                          <Lock className="h-3.5 w-3.5" />
                        ) : (
                          <Unlock className="h-3.5 w-3.5" />
                        )}
                        {visibilityLabel(visibility, settings.language)}
                      </button>
                    ))}
                  </fieldset>
                  <div className="flex gap-2">
                    <Button
                      aria-label={text.saveChannel}
                      className="border-white/10 text-white/80 hover:bg-white/10"
                      onClick={handleSaveChannel}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Save className="h-4 w-4" />
                    </Button>
                    <Button
                      aria-label={text.deleteChannel}
                      className="border-red-400/20 text-red-300 hover:bg-red-400/10"
                      disabled={isDefaultChannel}
                      onClick={handleDeleteChannel}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
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
              ) : visibleMessages.length === 0 ? (
                <div className="flex h-full min-h-[360px] items-center justify-center">
                  <div className="max-w-md text-center">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg border border-[#ffb703]/30 bg-[#ffb703]/10 text-[#ffb703]">
                      <MessageSquareText className="h-7 w-7" />
                    </div>
                    <h3 className="mt-4 text-xl font-semibold">
                      {text.noMessagesTitle}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-white/55">
                      {text.noMessagesBody}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  {visibleMessages.map((message) => (
                    <article className="flex gap-3" key={message.id}>
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-[#2a2416] text-sm font-semibold text-[#ffb703]">
                        {displayAuthor(message.author).charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-mono text-sm text-white/85">
                            {displayAuthor(message.author)}
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
                  aria-label={text.messageInput}
                  className="min-h-12 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-6 text-white outline-none placeholder:text-white/35"
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder={text.messagePlaceholder(selectedChannel.name)}
                  rows={2}
                  value={draft}
                />
                <Button
                  className="self-end bg-[#ffb703] text-black hover:bg-[#f5a900]"
                  disabled={
                    (!selectedChannel.isVirtual && sendMessage.isPending) ||
                    draft.trim().length === 0
                  }
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
              {text.channelTools}
            </div>
            <div className="mt-4 space-y-2">
              <Button
                className="w-full justify-start border-white/10 text-white/75 hover:bg-white/10"
                onClick={handleCreateChannel}
                type="button"
                variant="ghost"
              >
                <Plus className="h-4 w-4" />
                {text.createChannel}
              </Button>
              <Button
                className="w-full justify-start border-white/10 text-white/75 hover:bg-white/10"
                onClick={() => setIsEditingChannel(true)}
                type="button"
                variant="ghost"
              >
                <Pencil className="h-4 w-4" />
                {text.editNameDescription}
              </Button>
              <Button
                className="w-full justify-start border-red-400/20 text-red-300 hover:bg-red-400/10"
                disabled={isDefaultChannel}
                onClick={handleDeleteChannel}
                type="button"
                variant="ghost"
              >
                <Trash2 className="h-4 w-4" />
                {text.deleteChannel}
              </Button>
            </div>
            <div className="mt-6 border-t border-white/10 pt-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Settings className="h-4 w-4 text-[#ffb703]" />
                {text.settings}
              </div>
              <div className="mt-4 space-y-4">
                <div>
                  <div className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-white/45">
                    {text.language}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(["ko", "en"] as const).map((language) => (
                      <Button
                        className={`border-white/10 ${
                          settings.language === language
                            ? "bg-[#ffb703] text-black hover:bg-[#f5a900]"
                            : "text-white/75 hover:bg-white/10"
                        }`}
                        key={language}
                        onClick={() => handleUpdateLanguage(language)}
                        type="button"
                        variant="ghost"
                      >
                        {language === "ko" ? "한국어" : "English"}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-white/45">
                    {text.newChannelVisibility}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(["private", "open"] as const).map((visibility) => (
                      <Button
                        className={`border-white/10 ${
                          settings.defaultVisibility === visibility
                            ? "bg-[#ffb703] text-black hover:bg-[#f5a900]"
                            : "text-white/75 hover:bg-white/10"
                        }`}
                        key={visibility}
                        onClick={() =>
                          handleUpdateDefaultVisibility(visibility)
                        }
                        type="button"
                        variant="ghost"
                      >
                        {visibility === "private" ? (
                          <Lock className="h-4 w-4" />
                        ) : (
                          <Unlock className="h-4 w-4" />
                        )}
                        {visibilityLabel(visibility, settings.language)}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-5 text-sm leading-6 text-white/55">
              {text.webScope}
            </p>
          </aside>
        </section>
      </main>
    </div>
  );
}
