import { LoaderCircle } from "lucide-react";

export function ChannelSaveStatus({
  error,
  pending,
  language,
}: {
  error: Error | null;
  pending: boolean;
  language: "ko" | "en";
}) {
  const korean = language === "ko";
  if (pending) {
    return (
      <div
        role="status"
        className="flex items-center gap-2 border-b border-white/10 px-4 py-3 text-sm text-white/70 md:px-6"
      >
        <LoaderCircle className="h-4 w-4 animate-spin" />
        {korean
          ? "변경 저장 및 서버 확인 중"
          : "Saving and verifying the channel"}
      </div>
    );
  }
  if (!error) return null;

  const unauthorized = /not authorized|permission|forbidden|restricted/i.test(
    error.message,
  );
  const unconfirmed =
    error.message === "Channel update was not confirmed by the relay.";
  const message = unauthorized
    ? korean
      ? "현재 브라우저 계정은 이 채널의 소유자 또는 관리자가 아닙니다. 공개범위를 변경하지 못했습니다. 채널 소유 계정으로 접속하거나 소유자에게 관리자 권한을 받아야 합니다."
      : "This browser account is not a channel owner or administrator. Visibility was not changed. Sign in with the channel owner's identity or ask the owner for administrator access."
    : unconfirmed
      ? korean
        ? "서버에서 변경된 설정을 확인하지 못했습니다. 저장 완료 상태가 아닙니다. 새로고침해 실제 공개범위를 확인하세요."
        : "The relay did not confirm the updated settings. The save is not confirmed. Refresh to check the actual visibility."
      : korean
        ? "채널 설정을 저장하지 못했습니다."
        : "Could not save channel settings.";

  return (
    <div
      role="alert"
      className="border-b border-red-400/30 bg-red-950/30 px-4 py-3 text-sm leading-6 text-red-200 md:px-6"
    >
      <p>{message}</p>
      {!unauthorized && !unconfirmed && (
        <p className="break-words text-xs">{error.message}</p>
      )}
    </div>
  );
}
