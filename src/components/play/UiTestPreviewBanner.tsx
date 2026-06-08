import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { adminGetUiTestPreviewFn, adminSetUiTestPreviewFn } from "@/lib/admin-tests.functions";

export function UiTestPreviewBanner({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["ui-test-preview"],
    queryFn: () => adminGetUiTestPreviewFn(),
    refetchInterval: 30_000,
    enabled: isAdmin,
  });
  const m = useMutation({
    mutationFn: () => adminSetUiTestPreviewFn({ data: { enabled: false } }),
    onSuccess: (r) => {
      qc.setQueryData(["ui-test-preview"], r);
      qc.invalidateQueries({ queryKey: ["all-matches"] });
      qc.invalidateQueries({ queryKey: ["matchdays-progress"] });
      toast.success("UI test preview disabled");
    },
  });
  if (!isAdmin || !q.data?.enabled || !q.data.expiresAt) return null;
  const minutesLeft = Math.max(
    0,
    Math.round((new Date(q.data.expiresAt).getTime() - Date.now()) / 60_000),
  );
  return (
    <div className="mb-4 rounded-xl border border-amber-glow/40 bg-amber-500/10 px-4 py-3 flex items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2 text-amber-glow font-semibold">
        <span aria-hidden>⚠️</span>
        <span>UI TEST MODE — test matches visible (auto-disables in {minutesLeft}m)</span>
      </div>
      <button
        type="button"
        onClick={() => m.mutate()}
        disabled={m.isPending}
        className="rounded-md border border-amber-glow/40 px-2.5 py-1 text-xs font-medium text-amber-glow hover:bg-amber-glow/10 disabled:opacity-50"
      >
        Disable now
      </button>
    </div>
  );
}
