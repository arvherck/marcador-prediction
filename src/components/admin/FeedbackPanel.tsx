import { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type FeedbackRow = {
  id: string;
  user_id: string | null;
  display_name: string | null;
  category: "bug" | "suggestion" | "question" | "other";
  message: string;
  page: string | null;
  created_at: string;
  is_read: boolean;
  admin_notes: string | null;
};

const CATEGORY_META: Record<
  FeedbackRow["category"],
  { label: string; cls: string }
> = {
  bug: { label: "🐛 Bug", cls: "bg-destructive/15 text-destructive" },
  suggestion: { label: "💡 Suggestion", cls: "bg-amber-glow/15 text-amber-glow" },
  question: { label: "❓ Question", cls: "bg-blue-500/15 text-blue-500" },
  other: { label: "💬 Other", cls: "bg-muted text-muted-foreground" },
};

export function FeedbackPanel() {
  const qc = useQueryClient();
  const [categoryFilter, setCategoryFilter] = useState<"all" | FeedbackRow["category"]>("all");
  const [readFilter, setReadFilter] = useState<"all" | "unread" | "read">("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-feedback"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feedback")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as FeedbackRow[];
    },
  });

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel("feedback-admin")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "feedback" },
        () => {
          qc.invalidateQueries({ queryKey: ["admin-feedback"] });
          qc.invalidateQueries({ queryKey: ["feedback-unread"] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (categoryFilter !== "all" && r.category !== categoryFilter) return false;
      if (readFilter === "unread" && r.is_read) return false;
      if (readFilter === "read" && !r.is_read) return false;
      if (search && !r.message.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [rows, categoryFilter, readFilter, search]);

  const setRead = useMutation({
    mutationFn: async ({ id, is_read }: { id: string; is_read: boolean }) => {
      const { error } = await supabase
        .from("feedback")
        .update({ is_read })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-feedback"] });
      qc.invalidateQueries({ queryKey: ["feedback-unread"] });
    },
  });

  const saveNotes = useMutation({
    mutationFn: async ({ id, admin_notes }: { id: string; admin_notes: string }) => {
      const { error } = await supabase
        .from("feedback")
        .update({ admin_notes })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Notes saved");
      qc.invalidateQueries({ queryKey: ["admin-feedback"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("feedback")
        .update({ is_read: true })
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("All marked as read");
      qc.invalidateQueries({ queryKey: ["admin-feedback"] });
      qc.invalidateQueries({ queryKey: ["feedback-unread"] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as typeof categoryFilter)}
          className="rounded-md border border-border bg-background px-2 py-1 text-sm"
        >
          <option value="all">All categories</option>
          <option value="bug">🐛 Bug</option>
          <option value="suggestion">💡 Suggestion</option>
          <option value="question">❓ Question</option>
          <option value="other">💬 Other</option>
        </select>
        <select
          value={readFilter}
          onChange={(e) => setReadFilter(e.target.value as typeof readFilter)}
          className="rounded-md border border-border bg-background px-2 py-1 text-sm"
        >
          <option value="all">All</option>
          <option value="unread">Unread only</option>
          <option value="read">Read only</option>
        </select>
        <input
          type="search"
          placeholder="Search messages..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[140px] rounded-md border border-border bg-background px-2 py-1 text-sm"
        />
        <button
          onClick={() => markAllRead.mutate()}
          disabled={markAllRead.isPending}
          className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted/50"
        >
          Mark all as read
        </button>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">Loading...</p>
      )}
      {!isLoading && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">No feedback matches your filters.</p>
      )}

      <div className="space-y-2">
        {filtered.map((r) => {
          const meta = CATEGORY_META[r.category];
          const isOpen = expanded === r.id;
          return (
            <div
              key={r.id}
              className={`rounded-xl border bg-card transition ${
                r.is_read ? "border-border" : "border-amber-glow/40"
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  setExpanded(isOpen ? null : r.id);
                  if (!r.is_read && !isOpen) setRead.mutate({ id: r.id, is_read: true });
                }}
                className="w-full text-left px-4 py-3 flex flex-wrap items-center gap-3"
              >
                <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${meta.cls}`}>
                  {meta.label}
                </span>
                <span className={`text-xs ${r.is_read ? "text-muted-foreground" : "text-foreground font-semibold"}`}>
                  {r.display_name || "Guest"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()}
                </span>
                <span
                  className={`flex-1 min-w-[200px] truncate text-sm ${
                    r.is_read ? "text-muted-foreground" : "font-semibold"
                  }`}
                >
                  {r.message.slice(0, 100)}
                  {r.message.length > 100 ? "…" : ""}
                </span>
                {r.page && (
                  <span className="text-[11px] text-muted-foreground hidden sm:inline">
                    {r.page}
                  </span>
                )}
              </button>
              {isOpen && (
                <div className="border-t border-border px-4 py-3 space-y-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                      Message
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{r.message}</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-muted-foreground">User: </span>
                      <span>{r.display_name || "Guest"}</span>
                      {r.user_id && (
                        <div className="text-muted-foreground font-mono text-[10px]">
                          {r.user_id}
                        </div>
                      )}
                    </div>
                    <div>
                      <span className="text-muted-foreground">Page: </span>
                      <span className="font-mono">{r.page || "—"}</span>
                    </div>
                  </div>
                  <AdminNotes
                    initial={r.admin_notes ?? ""}
                    onSave={(v) => saveNotes.mutate({ id: r.id, admin_notes: v })}
                  />
                  <div className="flex items-center gap-2">
                    {r.is_read ? (
                      <button
                        onClick={() => setRead.mutate({ id: r.id, is_read: false })}
                        className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted/50"
                      >
                        Mark as unread
                      </button>
                    ) : (
                      <button
                        onClick={() => setRead.mutate({ id: r.id, is_read: true })}
                        className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-muted/50"
                      >
                        Mark as read
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AdminNotes({
  initial,
  onSave,
}: {
  initial: string;
  onSave: (v: string) => void;
}) {
  const [val, setVal] = useState(initial);
  useEffect(() => setVal(initial), [initial]);
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
        Admin notes
      </div>
      <textarea
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => {
          if (val !== initial) onSave(val);
        }}
        rows={3}
        placeholder="Internal notes (saved on blur)"
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
      />
    </div>
  );
}
