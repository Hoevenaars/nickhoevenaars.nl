import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { normalizeWebsiteUrl, UrlValidationError } from "@/lib/validation/url";
import { runProspectPipeline } from "@/lib/pipeline/run";
import { logActivity } from "@/lib/activity";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const websiteUrl = String(body.websiteUrl ?? body.website_url ?? "");
  const companyName = body.companyName || body.company_name || null;
  const notes = body.notes || null;

  let normalized;
  try {
    normalized = normalizeWebsiteUrl(websiteUrl);
  } catch (error) {
    const code = error instanceof UrlValidationError ? error.code : "INVALID_URL";
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ongeldige URL", code },
      { status: 400 },
    );
  }

  const { data: duplicate } = await supabase
    .from("prospects")
    .select("id, company_name, domain, status")
    .eq("is_archived", false)
    .ilike("domain", normalized.domain)
    .maybeSingle();
  if (duplicate) {
    return NextResponse.json(
      { error: "Dit domein staat al in de lijst.", code: "DUPLICATE", prospect: duplicate },
      { status: 409 },
    );
  }

  const { data: prospect, error } = await supabase
    .from("prospects")
    .insert({
      company_name: companyName,
      domain: normalized.domain,
      website_url: normalized.origin + new URL(normalized.href).pathname.replace(/\/$/, ""),
      source_type: "manual",
      source_reference: "quick_add",
      status: "NEW",
      notes,
    })
    .select("*")
    .single();
  if (error || !prospect) {
    return NextResponse.json({ error: error?.message ?? "Aanmaken mislukt" }, { status: 500 });
  }

  await supabase.from("prospect_sources").insert({
    prospect_id: prospect.id,
    source_type: "manual",
    source_url: normalized.href,
    source_name: "Quick Add",
    added_by: user.id,
    notes,
  });
  await logActivity(supabase, {
    prospectId: prospect.id,
    eventType: "prospect_created",
    actorType: "human",
    actorId: user.id,
    newStatus: "NEW",
    metadata: { url: normalized.href },
  });

  try {
    const result = await runProspectPipeline(supabase, prospect.id, {
      type: "human",
      id: user.id,
    });
    return NextResponse.json(result);
  } catch (pipelineError) {
    await supabase
      .from("prospects")
      .update({
        status: "SCAN_FAILED",
        needs_review: true,
        needs_review_reasons: ["scan_failed"],
      })
      .eq("id", prospect.id);
    return NextResponse.json(
      {
        prospectId: prospect.id,
        error: pipelineError instanceof Error ? pipelineError.message : "Scan mislukt",
        status: "SCAN_FAILED",
      },
      { status: 202 },
    );
  }
}
