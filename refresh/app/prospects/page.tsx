import { Suspense } from "react";
import AppShell from "@/components/AppShell";
import StatusBadge from "@/components/prospect/StatusBadge";
import ProspectFilters from "@/components/prospect/ProspectFilters";
import { createServerSupabase } from "@/lib/supabase/server";
import Link from "next/link";

export default async function ProspectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = stringParam(params.status);
  const industry = stringParam(params.industry);
  const source = stringParam(params.source);
  const needsReview = stringParam(params.needsReview) === "1";
  const minScore = Number(stringParam(params.minScore) || "");
  const maxScore = Number(stringParam(params.maxScore) || "");

  const supabase = await createServerSupabase();
  let query = supabase
    .from("prospects")
    .select("id, company_name, domain, industry, status, website_score, opportunity_score, product_fit_score, complexity_score, last_scan_at, source_type, needs_review")
    .eq("is_archived", false)
    .order("opportunity_score", { ascending: false, nullsFirst: false });

  if (status) query = query.eq("status", status);
  if (industry) query = query.ilike("industry", `%${industry}%`);
  if (source) query = query.eq("source_type", source);
  if (needsReview) query = query.eq("needs_review", true);
  if (!Number.isNaN(minScore) && stringParam(params.minScore)) {
    query = query.gte("opportunity_score", minScore);
  }
  if (!Number.isNaN(maxScore) && stringParam(params.maxScore)) {
    query = query.lte("opportunity_score", maxScore);
  }

  const { data: prospects } = await query;

  return (
    <AppShell>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-[var(--font-display)] text-2xl font-bold">Prospectlijst</h2>
          <p className="text-sm text-[#6a6573]">Standaard gesorteerd op Opportunity Score.</p>
        </div>
        {needsReview ? (
          <p className="rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-800">Needs Review</p>
        ) : null}
      </div>
      <Suspense>
        <ProspectFilters />
      </Suspense>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-[#e6dfd2] bg-[#fffcf7]">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-white/70 text-[#6a6573]">
            <tr>
              <th className="px-4 py-3">Company</th>
              <th>Domain</th>
              <th>Industry</th>
              <th>Status</th>
              <th>Website</th>
              <th>Opportunity</th>
              <th>Product Fit</th>
              <th>Complexity</th>
              <th>Last Scan</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {(prospects ?? []).map((prospect) => (
              <tr key={prospect.id} className="border-t border-[#e6dfd2]">
                <td className="px-4 py-3">
                  <Link href={`/prospects/${prospect.id}`} className="font-medium hover:underline">
                    {prospect.company_name || prospect.domain}
                  </Link>
                  {prospect.needs_review ? (
                    <span className="ml-2 text-xs text-amber-700">review</span>
                  ) : null}
                </td>
                <td>{prospect.domain}</td>
                <td>{prospect.industry ?? "—"}</td>
                <td>
                  <StatusBadge status={prospect.status} />
                </td>
                <td>{fmt(prospect.website_score)}</td>
                <td className="font-medium">{fmt(prospect.opportunity_score)}</td>
                <td>{fmt(prospect.product_fit_score)}</td>
                <td>{fmt(prospect.complexity_score)}</td>
                <td>{prospect.last_scan_at ? new Date(prospect.last_scan_at).toLocaleString("nl-NL") : "—"}</td>
                <td>{prospect.source_type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

function stringParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function fmt(value: number | string | null) {
  if (value == null) return "—";
  return Number(value).toFixed(0);
}
