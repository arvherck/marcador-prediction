import { useQuery } from "@tanstack/react-query";
import { getDonationStatsFn, type DonationStats } from "@/lib/donations.functions";

export function DonationsPanel() {
  const q = useQuery({
    queryKey: ["admin-donations"],
    queryFn: () => getDonationStatsFn(),
  });

  const stats = q.data as DonationStats | undefined;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !stats ? (
        <p className="text-sm text-muted-foreground">No data.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Stat label="Total received" value={`€${(stats.total_cents / 100).toFixed(2)}`} />
            <Stat label="Donors" value={String(stats.donor_count)} />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Recent donations
            </div>
            {stats.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No donations yet.</p>
            ) : (
              <div className="divide-y divide-border text-sm">
                {stats.recent.map((r) => (
                  <div key={r.id} className="py-2 flex items-center justify-between">
                    <div>
                      <div className="font-medium">{r.display_name ?? "Guest"}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="font-score font-bold text-amber-glow tabular-nums">
                      €{(r.amount_cents / 100).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-score font-bold text-xl text-amber-glow tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
