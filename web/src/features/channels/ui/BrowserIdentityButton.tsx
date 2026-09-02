import { Check, Copy, Fingerprint, X } from "lucide-react";
import { useRef, useState } from "react";
import { getNostrPublicKey } from "@/shared/lib/nostr-signer";
import { Button } from "@/shared/ui/button";

export function BrowserIdentityButton({ language }: { language: "ko" | "en" }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pubkey, setPubkey] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const korean = language === "ko";
  const title = korean ? "현재 브라우저 계정" : "Current browser account";

  async function open() {
    setPubkey("");
    setError("");
    setCopied(false);
    dialog.current?.showModal();
    try {
      setPubkey(await getNostrPublicKey());
    } catch {
      setError(
        korean
          ? "계정 정보를 확인하지 못했습니다."
          : "Could not read the account identity.",
      );
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(pubkey);
      setCopied(true);
      setError("");
    } catch {
      setError(
        korean
          ? "복사하지 못했습니다. 공개키를 직접 선택해 복사하세요."
          : "Copy failed. Select and copy the public key below.",
      );
    }
  }

  return (
    <>
      <Button
        aria-label={title}
        title={title}
        onClick={() => void open()}
        size="icon"
        variant="ghost"
        className="shrink-0 text-white/70 hover:bg-white/10"
      >
        <Fingerprint className="h-4 w-4" />
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby="browser-identity-title"
        className="m-auto w-[min(28rem,calc(100%_-_2rem))] rounded-lg border border-white/20 bg-[#171717] p-5 text-white backdrop:bg-black/60"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 id="browser-identity-title" className="text-base font-semibold">
            {title}
          </h2>
          <form method="dialog">
            <Button
              aria-label={korean ? "닫기" : "Close"}
              size="icon"
              variant="ghost"
            >
              <X className="h-4 w-4" />
            </Button>
          </form>
        </div>
        <p className="mt-4 text-sm text-white/60">
          {korean ? "공개키" : "Public key"}
        </p>
        <p
          data-testid="browser-public-key"
          className="mt-2 select-all break-all font-mono text-sm leading-6"
        >
          {pubkey || (korean ? "확인 중" : "Loading")}
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-300">
            {error}
          </p>
        )}
        <Button className="mt-4" disabled={!pubkey} onClick={() => void copy()}>
          {copied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          {copied
            ? korean
              ? "복사됨"
              : "Copied"
            : korean
              ? "공개키 복사"
              : "Copy public key"}
        </Button>
      </dialog>
    </>
  );
}
