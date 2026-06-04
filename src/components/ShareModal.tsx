import { useRef, useState } from "react";
import { toast } from "sonner";
import { X, Download, Copy } from "lucide-react";
import { toPng } from "html-to-image";
import { PicksShareCard } from "./PicksShareCard";
import type { MatchRow } from "@/lib/game.functions";

export function ShareModal({
  open,
  onClose,
  matchdayName,
  displayName,
  matches,
  drafts,
  boostedMatchId,
}: {
  open: boolean;
  onClose: () => void;
  matchdayName: string;
  displayName: string;
  matches: MatchRow[];
  drafts: Record<number, { home: number; away: number }>;
  boostedMatchId: number | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const download = async () => {
    if (!ref.current) return;
    setBusy(true);
    try {
      const dataUrl = await toPng(ref.current, { pixelRatio: 2, cacheBust: true });
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `marcador-${matchdayName.replace(/\s+/g, "-").toLowerCase()}.png`;
      a.click();
    } catch {
      toast.error("Couldn't generate the image.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!ref.current) return;
    setBusy(true);
    try {
      const dataUrl = await toPng(ref.current, { pixelRatio: 2, cacheBust: true });
      const blob = await (await fetch(dataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("Image copied to clipboard.");
    } catch {
      toast.error("Your browser can't copy images. Use Download.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative max-h-[92vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute -top-2 -right-2 z-10 size-9 rounded-full bg-background border border-border flex items-center justify-center hover:bg-secondary"
          aria-label="Close"
        >
          <X size={16} />
        </button>
        <PicksShareCard
          ref={ref}
          matchdayName={matchdayName}
          displayName={displayName}
          matches={matches}
          drafts={drafts}
          boostedMatchId={boostedMatchId}
        />
        <div className="mt-4 flex gap-2">
          <button
            onClick={copy}
            disabled={busy}
            className="flex-1 rounded-xl bg-secondary px-4 py-2.5 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40"
          >
            <Copy size={14} /> Copy
          </button>
          <button
            onClick={download}
            disabled={busy}
            className="flex-1 rounded-xl bg-amber-gradient px-4 py-2.5 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40"
          >
            <Download size={14} /> Download
          </button>
        </div>
      </div>
    </div>
  );
}
