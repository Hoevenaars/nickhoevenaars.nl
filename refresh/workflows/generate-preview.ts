import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPreviewContent, qaPreview } from "@/lib/preview/generate";
import { canGeneratePreview } from "@/lib/scoring/status";
import { logActivity, recordCost, setProspectStatus } from "@/lib/activity";
import type { DesignProfile } from "@/types";

export async function generatePreviewWorkflow(
  supabase: SupabaseClient,
  prospectId: string,
  actorId?: string | null,
) {
  const { data: prospect, error } = await supabase
    .from("prospects")
    .select("*")
    .eq("id", prospectId)
    .single();
  if (error || !prospect) throw error ?? new Error("Prospect ontbreekt");
  if (!canGeneratePreview(prospect.status)) {
    throw new Error("Preview mag alleen bij SALES_READY of PRIORITY.");
  }

  const { data: latestScan } = await supabase
    .from("website_scans")
    .select("id")
    .eq("prospect_id", prospectId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [{ data: pages }, { data: findings }] = await Promise.all([
    latestScan
      ? supabase
          .from("scanned_pages")
          .select("page_type, title, extracted_text")
          .eq("scan_id", latestScan.id)
      : Promise.resolve({ data: [] }),
    supabase
      .from("findings")
      .select("title, finding_type, severity")
      .eq("prospect_id", prospectId)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  const content = buildPreviewContent({
    companyName: prospect.company_name ?? prospect.domain,
    industry: prospect.industry,
    city: prospect.city,
    pages: (pages ?? []).map((page) => ({
      pageType: page.page_type,
      title: page.title,
      extractedText: page.extracted_text ?? "",
    })),
    findings: findings ?? [],
    profile: pickProfile(prospect.industry),
  });
  const qa = qaPreview(content);
  const { data: preview, error: previewError } = await supabase
    .from("previews")
    .insert({
      prospect_id: prospectId,
      status: "ready",
      design_profile: content.designProfile,
      preview_url: "/previews/pending",
      generated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
      generation_cost: 0,
      qa_status: qa.status,
      qa_score: qa.score,
      content,
    })
    .select("*")
    .single();
  if (previewError || !preview) throw previewError ?? new Error("Preview opslaan mislukt");

  const previewUrl = `/previews/${preview.id}`;
  await supabase.from("previews").update({ preview_url: previewUrl }).eq("id", preview.id);
  await recordCost(supabase, {
    prospectId,
    costType: "preview",
    provider: "internal",
    amount: 0,
  });
  await setProspectStatus(supabase, {
    prospectId,
    from: prospect.status,
    to: "PREVIEW_READY",
    actorType: "human",
    actorId,
  });
  await logActivity(supabase, {
    prospectId,
    eventType: "preview_generated",
    actorType: "workflow",
    metadata: { preview_id: preview.id, qa },
  });
  return { ...preview, preview_url: previewUrl };
}

function pickProfile(industry?: string | null): DesignProfile {
  const value = (industry ?? "").toLowerCase();
  if (/advocaat|notaris|architect|finance|accountant/.test(value)) return "premium";
  if (/coach|salon|zorg|bakker|horeca|fotograaf/.test(value)) return "warm";
  return "modern";
}
