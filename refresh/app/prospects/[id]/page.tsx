import AppShell from "@/components/AppShell";
import FindingsList from "@/components/findings/FindingsList";
import ReviewActions from "@/components/prospect/ReviewActions";
import StatusBadge from "@/components/prospect/StatusBadge";
import ScoreBar from "@/components/scores/ScoreBar";
import { createServerSupabase } from "@/lib/supabase/server";
import { canGeneratePreview, websiteQualityLabel } from "@/lib/scoring";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function ProspectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: prospect } = await supabase.from("prospects").select("*").eq("id", id).maybeSingle();
  if (!prospect) notFound();

  const { data: scan } = await supabase
    .from("website_scans")
    .select("*")
    .eq("prospect_id", id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [{ data: pages }, { data: findings }, { data: scores }, { data: fit }, { data: activities }, { data: previews }] =
    await Promise.all([
      scan
        ? supabase.from("scanned_pages").select("*").eq("scan_id", scan.id)
        : Promise.resolve({ data: [] }),
      supabase.from("findings").select("*").eq("prospect_id", id).order("created_at", { ascending: false }),
      scan
        ? supabase.from("prospect_scores").select("*").eq("scan_id", scan.id).maybeSingle()
        : Promise.resolve({ data: null }),
      scan
        ? supabase.from("product_fit_checks").select("*").eq("scan_id", scan.id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from("activity_logs")
        .select("*")
        .eq("prospect_id", id)
        .order("created_at", { ascending: false })
        .limit(12),
      supabase.from("previews").select("id, status, design_profile").eq("prospect_id", id).order("generated_at", { ascending: false }),
    ]);

  const home = (pages ?? []).find((page) => page.page_type === "home") ?? pages?.[0];

  return (
    <AppShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[#6a6573]">{prospect.domain}</p>
          <h2 className="font-[var(--font-display)] text-3xl font-bold">
            {prospect.company_name || prospect.domain}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={prospect.status} />
            {prospect.needs_review ? (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                Needs review: {(prospect.needs_review_reasons ?? []).join(", ") || "ja"}
              </span>
            ) : null}
            <a className="text-sm text-[#1d4ed8]" href={prospect.website_url} target="_blank" rel="noreferrer">
              Open website
            </a>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Metric label="Opportunity" value={prospect.opportunity_score} />
          <Metric
            label="Website"
            value={prospect.website_score}
            hint={prospect.website_score != null ? websiteQualityLabel(Number(prospect.website_score)) : undefined}
          />
          <Metric label="Product fit" value={prospect.product_fit_score} />
          <Metric label="Complexity" value={prospect.complexity_score} />
        </div>
      </div>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-[#e6dfd2] bg-[#fffcf7] p-5">
          <h3 className="font-[var(--font-display)] font-bold">Screenshots</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Screenshot label="Desktop" url={home?.desktop_screenshot_url} />
            <Screenshot label="Mobile" url={home?.mobile_screenshot_url} />
          </div>
          {!home?.desktop_screenshot_url ? (
            <p className="mt-2 text-sm text-[#6a6573]">
              Playwright-screenshots volgen zodra Chromium in Trigger.dev draait. Scan-tekst en scores staan al.
            </p>
          ) : null}
        </article>
        <article className="rounded-2xl border border-[#e6dfd2] bg-[#fffcf7] p-5">
          <h3 className="font-[var(--font-display)] font-bold">Score breakdown</h3>
          <div className="mt-4 grid gap-3">
            <ScoreBar label="Technical" value={Number(scores?.technical_score ?? 0)} />
            <ScoreBar label="Mobile" value={Number(scores?.mobile_score ?? 0)} />
            <ScoreBar label="Conversion" value={Number(scores?.conversion_score ?? 0)} />
            <ScoreBar label="Visual" value={Number(scores?.visual_score ?? 0)} />
            <ScoreBar label="Content" value={Number(scores?.content_score ?? 0)} />
            <ScoreBar label="Commercial Fit" value={Number(scores?.commercial_fit_score ?? 0)} max={30} />
            <ScoreBar label="Product Fit" value={Number(scores?.product_fit_score ?? 0)} max={25} />
          </div>
          <p className="mt-3 text-xs text-[#6a6573]">
            score_version {scores?.score_version ?? "—"} · scanner {scan?.scanner_version ?? "—"}
          </p>
        </article>
      </section>

      <section className="mt-6">
        <h3 className="mb-3 font-[var(--font-display)] text-lg font-bold">Findings</h3>
        <FindingsList findings={findings ?? []} />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-[#e6dfd2] bg-[#fffcf7] p-5">
          <h3 className="font-[var(--font-display)] font-bold">Product Fit</h3>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <Row label="Webshop" value={yn(fit?.has_webshop)} />
            <Row label="Login" value={yn(fit?.has_login)} />
            <Row label="Booking" value={yn(fit?.has_booking_system)} />
            <Row label="Customer portal" value={yn(fit?.has_customer_portal)} />
            <Row label="Multiple languages" value={yn(fit?.has_multiple_languages)} />
            <Row label="Complex integrations" value={yn(fit?.has_complex_integrations)} />
            <Row label="Estimated pages" value={String(fit?.estimated_page_count ?? "—")} />
            <Row label="Standard product fit" value={fit?.standard_product_fit ? "YES" : "NO"} />
          </dl>
          <p className="mt-3 text-sm text-[#6a6573]">{fit?.fit_reason}</p>
        </article>
        <article className="rounded-2xl border border-[#e6dfd2] bg-[#fffcf7] p-5">
          <h3 className="font-[var(--font-display)] font-bold">Scan & bedrijf</h3>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <Row label="Industry" value={prospect.industry ?? "—"} />
            <Row label="Industry confidence" value={fmt(prospect.industry_confidence)} />
            <Row label="City" value={prospect.city ?? "—"} />
            <Row label="HTTP" value={String(scan?.http_status ?? "—")} />
            <Row label="SSL" value={scan?.ssl_valid == null ? "—" : scan.ssl_valid ? "geldig" : "ongeldig"} />
            <Row label="Broken links" value={String(scan?.broken_links_count ?? 0)} />
            <Row label="Pages scanned" value={String(scan?.pages_scanned ?? 0)} />
            <Row label="AI recommendation" value={prospect.ai_recommendation ?? "—"} />
            <Row label="Reject reason" value={prospect.reject_reason ?? "—"} />
            <Row label="Source" value={prospect.source_type} />
          </dl>
        </article>
      </section>

      <div className="mt-6">
        <ReviewActions
          prospectId={id}
          canPreview={canGeneratePreview(prospect.status)}
        />
      </div>

      {(previews ?? []).length ? (
        <section className="mt-6 rounded-2xl border border-[#e6dfd2] bg-[#fffcf7] p-5">
          <h3 className="font-[var(--font-display)] font-bold">Previews</h3>
          <ul className="mt-2 text-sm">
            {(previews ?? []).map((preview) => (
              <li key={preview.id}>
                <Link className="text-[#1d4ed8] hover:underline" href={`/previews/${preview.id}`}>
                  {preview.design_profile} · {preview.status}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6 rounded-2xl border border-[#e6dfd2] bg-[#fffcf7] p-5">
        <h3 className="font-[var(--font-display)] font-bold">Activity</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {(activities ?? []).map((item) => (
            <li key={item.id} className="flex justify-between gap-4">
              <span>
                {item.event_type}
                {item.old_status && item.new_status ? ` · ${item.old_status} → ${item.new_status}` : ""}
              </span>
              <span className="text-[#6a6573]">
                {new Date(item.created_at).toLocaleString("nl-NL")}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string | null;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-[#e6dfd2] bg-white px-4 py-3">
      <div className="text-xs text-[#6a6573]">{label}</div>
      <div className="font-[var(--font-display)] text-2xl font-bold">
        {value == null ? "—" : Number(value).toFixed(0)}
      </div>
      {hint ? <div className="text-xs text-[#6a6573]">{hint}</div> : null}
    </div>
  );
}

function Screenshot({ label, url }: { label: string; url?: string | null }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#e6dfd2] bg-white">
      <div className="px-3 py-2 text-xs text-[#6a6573]">{label}</div>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={label} className="w-full object-cover" />
      ) : (
        <div className="flex h-40 items-center justify-center text-sm text-[#6a6573]">Nog geen screenshot</div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-[#6a6573]">{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function yn(value?: boolean | null) {
  if (value == null) return "—";
  return value ? "Yes" : "No";
}

function fmt(value: number | string | null) {
  if (value == null) return "—";
  return Number(value).toFixed(2);
}
