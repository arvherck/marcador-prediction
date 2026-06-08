import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type Category = "bug" | "suggestion" | "question" | "other";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "bug", label: "🐛 Bug report" },
  { value: "suggestion", label: "💡 Suggestion" },
  { value: "question", label: "❓ Question" },
  { value: "other", label: "💬 Other" },
];

const MIN = 10;
const MAX = 1000;

export function FeedbackModal({
  open,
  onOpenChange,
  displayName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  displayName?: string | null;
}) {
  const [category, setCategory] = useState<Category>("bug");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setMessage("");
      setError(null);
      setCategory("bug");
    }
  }, [open]);

  const count = message.length;
  const valid = count >= MIN && count <= MAX;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id ?? null;
      const page =
        typeof window !== "undefined"
          ? window.location.pathname + window.location.search
          : null;
      const { error: insErr } = await supabase.from("feedback").insert({
        user_id: uid,
        display_name: uid ? displayName ?? null : "Guest",
        category,
        message: message.trim(),
        page,
      });
      if (insErr) {
        if (insErr.message?.includes("rate_limit_exceeded")) {
          setError(
            "You've sent a lot of feedback today — thank you! Come back tomorrow if you have more to share."
          );
        } else if (insErr.message?.includes("feedback_message_check")) {
          setError("Message must be between 10 and 1000 characters.");
        } else {
          setError("Something went wrong. Please try again.");
        }
        return;
      }
      onOpenChange(false);
      toast.success("Thanks for your feedback! ⚽");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 overflow-hidden flex flex-col max-h-[90vh] w-full max-w-md
          left-0 right-0 bottom-0 top-auto translate-x-0 translate-y-0 rounded-t-2xl rounded-b-none data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom
          sm:left-[50%] sm:top-[50%] sm:bottom-auto sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg"
      >
        <form onSubmit={submit} className="flex flex-col min-h-0 flex-1">
          <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-border">
            <DialogTitle>Send feedback ⚽</DialogTitle>
            <DialogDescription>
              Found a bug? Got a suggestion? We'd love to hear from you.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Category
              </label>
              <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Message
              </label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, MAX))}
                placeholder="Tell us what's on your mind..."
                rows={5}
                maxLength={MAX}
              />
              <div className="flex justify-between text-xs">
                <span
                  className={
                    count > 0 && count < MIN ? "text-destructive" : "text-muted-foreground"
                  }
                >
                  {count < MIN && count > 0 ? `At least ${MIN} characters` : ""}
                </span>
                <span className="text-muted-foreground">
                  {count} / {MAX}
                </span>
              </div>
            </div>
            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                {error}
              </p>
            )}
          </div>

          <div
            className="shrink-0 border-t border-border bg-background px-6 py-4 flex items-center justify-end gap-3"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
          >
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <Button
              type="submit"
              disabled={!valid || submitting}
              className="bg-amber-glow text-primary-foreground hover:bg-amber-glow/90"
            >
              {submitting ? "Sending..." : "Send feedback"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
