import AppShell from "@/components/AppShell";
import StatusBadge from "@/components/prospect/StatusBadge";
import { createServerSupabase } from "@/lib/supabase/server";
import Link from "next/link";

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

export default async function DashboardPage() {
  const supabase = await createServerSupabase();
  const since = startOfToday();
  const [
    { count: total },
    { count: scannedToday },
    { count: salesReady },
    { count: priority },
    { count: rejected },
    { count: failures },
    { data: top },
    { data: recentFailures },
    { count: newCount },
    { count: qualified },
    { data: reviews },
    { data: previews },
    { data: costs },
  ] = await Promise.all([
    supabase.from("prospects").select("*", { count: "exact", head: true }).eq("is_archived", false),
    supabase.from("website_scans").select("*", { count: "exact", head: true }).gte("started_at", since),
    supabase.from("prospects").select("*", { count: "exact", head: true }).eq("status", "SALES_READY"),
    supabase.from("prospects").select("*", { count: "exact", head: true }).eq("status", "PRIORITY"),
    supabase.from("prospects").select("*", { count: "exact", head: true }).eq("status", "REJECTED"),
    supabase.from("prospects").select("*", { count: "exact", head: true }).eq("status", "SCAN_FAILED"),
    supabase
      .from("prospects")
      .select("id, company_name, domain, status, opportunity_score, industry")
      .eq("is_archived", false)
      .order("opportunity_score", { ascending: false, nullsFirst: false })
      .limit(8),
    supabase
      .from("website_scans")
      .select("id, prospect_id, error_code, error_message, started_at, prospects(company_name, domain)")
      .eq("status", "failed")
      .order("started_at", { ascending: false })
      .limit(6),
    supabase.from("prospects").select("*", { count: "exact", head: true }).eq("status", "NEW"),
    supabase.from("prospects").select("*", { count: "exact", head: true }).eq("status", "QUALIFIED"),
    supabase.from("manual_reviews").select("ai_recommendation, human_decision"),
    supabase.from("previews").select("generation_cost, qa_score"),
    supabase.from("cost_events").select("amount, prospect_id, cost_type"),
  ]);

  const agreement = agreementRate(reviews ?? []);
  const precision = salesReadyPrecision(reviews ?? []);
  const cards = [
    ["Total Prospects", total ?? 0],
    ["Scanned Today", scannedToday ?? 0],
    ["Sales Ready", salesReady ?? 0],
    ["Priority", priority ?? 0],
    ["Rejected", rejected ?? 0],
    ["Scan Failures", failures ?? 0],
  ];

  return (
    <AppShell>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {cards.map(([label, value]) => (
          <article key={String(label)} className="rounded-2xl border border-[#e6dfd2] bg-[#fffcf7] p-4">
            <p className="text-xs uppercase tracking-wide text-[#6a6573]">{label}</p>
            <p className="mt-2 font-[var(--font-display)] text-3xl font-bold">{value}</p>
          </article>
        ))}
      </section>

      <section className="mt-6 rounded-2xl border border-[#e6dfd2] bg-[#fffcf7] p-5">
        <h2 className="font-[var(--font-display)] text-lg font-bold">Funnel</h2>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <FunnelStep label="NEW" value={newCount ?? 0} />
          <span className="text-[#6a6573]">↓</span>
          <FunnelStep label="SCANNED" value={(total ?? 0) - (newCount ?? 0)} />
          <span className="text-[#6a6573]">↓</span>
          <FunnelStep label="QUALIFIED" value={qualified ?? 0} />
          <span className="text-[#6a6573]">↓</span>
          <FunnelStep label="SALES_READY" value={salesReady ?? 0} />
          <span className="text-[#6a6573]">↓</span>
          <FunnelStep label="PRIORITY" value={priority ?? 0} />
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <article className="rounded-2xl border border-[#e6dfd2] bg-[#fffcf7] p-5">
          <h2 className="font-[var(--font-display)] text-lg font-bold">Leer-KPI’s</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="flex justify-between">
              <dt>Human Agreement Rate</dt>
              <dd className="font-medium">{agreement}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Sales Ready Precision</dt>
              <dd className="font-medium">{precision}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Previews</dt>
              <dd className="font-medium">{previews?.length ?? 0}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Gem. preview QA</dt>
              <dd className="font-medium">
                {avg((previews ?? []).map((item) => Number(item.qa_score ?? 0))).toFixed(0)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt>Scan kosten (som)</dt>
              <dd className="font-medium">
                ${sum((costs ?? []).map((item) => Number(item.amount ?? 0))).toFixed(4)}
              </dd>
            </div>
          </dl>
        </article>
        <article className="rounded-2xl border border-[#e6dfd2] bg-[#fffcf7] p-5">
          <h2 className="font-[var(--font-display)] text-lg font-bold">Recente scan failures</h2>
          <ul className="mt-3 divide-y divide-[#e6dfd2] text-sm">
            {(recentFailures ?? []).length === 0 ? (
              <li className="py-3 text-[#6a6573]">Nog geen failures.</li>
            ) : (
              (recentFailures ?? []).map((scan) => (
                <li key={scan.id} className="py-3">
                  <Link href={`/prospects/${scan.prospect_id}`} className="font-medium hover:underline">
                    {(scan.prospects as { domain?: string } | null)?.domain ?? scan.prospect_id}
                  </Link>
                  <p className="text-[#6a6573]">{scan.error_code ?? "onbekend"}</p>
                </li>
              ))
            )}
          </ul>
        </article>
      </section>

      <section className="mt-6 rounded-2xl border border-[#e6dfd2] bg-[#fffcf7] p-5">
        <h2 className="font-[var(--font-display)] text-lg font-bold">Top prospects</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-[#6a6573]">
              <tr>
                <th className="py-2">Company</th>
                <th>Status</th>
                <th>Industry</th>
                <th>Opportunity</th>
              </tr>
            </thead>
            <tbody>
              {(top ?? []).map((prospect) => (
                <tr key={prospect.id} className="border-t border-[#e6dfd2]">
                  <td className="py-2">
                    <Link href={`/prospects/${prospect.id}`} className="font-medium hover:underline">
                      {prospect.company_name || prospect.domain}
                    </Link>
                  </td>
                  <td>
                    <StatusBadge status={prospect.status} />
                  </td>
                  <td>{prospect.industry ?? "—"}</td>
                  <td>{prospect.opportunity_score ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}

function FunnelStep({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white px-4 py-3 text-center shadow-sm">
      <div className="text-xs text-[#6a6573]">{label}</div>
      <div className="font-[var(--font-display)] text-2xl font-bold">{value}</div>
    </div>
  );
}

function agreementRate(reviews: Array<{ ai_recommendation: string | null; human_decision: string }>) {
  if (!reviews.length) return "n.v.t.";
  const comparable = reviews.filter((row) => row.ai_recommendation);
  if (!comparable.length) return "n.v.t.";
  const agreed = comparable.filter(
    (row) => normalize(row.ai_recommendation) === normalize(row.human_decision),
  ).length;
  return `${Math.round((agreed / comparable.length) * 100)}%`;
}

function salesReadyPrecision(
  reviews: Array<{ ai_recommendation: string | null; human_decision: string }>,
) {
  const predicted = reviews.filter((row) => normalize(row.ai_recommendation) === "sales_ready");
  if (!predicted.length) return "n.v.t.";
  const correct = predicted.filter((row) =>
    ["sales_ready", "priority"].includes(row.human_decision),
  ).length;
  return `${Math.round((correct / predicted.length) * 100)}%`;
}

function normalize(value: string | null) {
  return (value ?? "").toLowerCase().replace("qualified", "watchlist");
}

function avg(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}
