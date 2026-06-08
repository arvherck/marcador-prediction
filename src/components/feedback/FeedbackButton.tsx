import { useState } from "react";
import { FeedbackModal } from "./FeedbackModal";

export function FeedbackButton({
  className,
  displayName,
}: {
  className?: string;
  displayName?: string | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ?? "hover:text-amber-glow transition-colors"
        }
      >
        Send feedback
      </button>
      <FeedbackModal open={open} onOpenChange={setOpen} displayName={displayName} />
    </>
  );
}
