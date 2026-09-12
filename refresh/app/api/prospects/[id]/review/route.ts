import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { HUMAN_DECISIONS } from "@/types";
import { humanDecisionToStatus } from "@/lib/scoring/status";
import { logActivity, setProspectStatus } from "@/lib/activity";
import { runProspectPipeline } from "@/lib/pipeline/run";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const decision = body.decision as (typeof HUMAN_DECISIONS)[number];
  if (!HUMAN_DECISIONS.includes(decision)) {
    return NextResponse.json({ error: "Ongeldige beslissing" }, { status: 400 });
  }

  const { data: prospect } = await supabase
    .from("prospects")
    .select("id, status, ai_recommendation")
    .eq("id", id)
    .single();
  if (!prospect) return NextResponse.json({ error: "Prospect ontbreekt" }, { status: 404 });

  const { data: latestScan } = await supabase
    .from("website_scans")
    .select("id")
    .eq("prospect_id", id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase.from("manual_reviews").insert({
    prospect_id: id,
    scan_id: latestScan?.id ?? null,
    reviewer_id: user.id,
    ai_recommendation: prospect.ai_recommendation,
    human_decision: decision,
    score_accuracy: body.scoreAccuracy ?? null,
    website_assessment_accuracy: body.websiteAssessmentAccuracy ?? null,
    commercial_fit_accuracy: body.commercialFitAccuracy ?? null,
    product_fit_accuracy: body.productFitAccuracy ?? null,
    notes: body.notes ?? null,
  });

  if (decision === "rescan") {
    const result = await runProspectPipeline(supabase, id, { type: "human", id: user.id });
    return NextResponse.json(result);
  }

  const nextStatus = humanDecisionToStatus(decision);
  await setProspectStatus(supabase, {
    prospectId: id,
    from: prospect.status,
    to: nextStatus,
    actorType: "human",
    actorId: user.id,
    extra:
      decision === "reject"
        ? { reject_reason: "manual_rejection", is_archived: false }
        : { reject_reason: null, manual_priority: decision === "priority" },
  });
  await logActivity(supabase, {
    prospectId: id,
    eventType: "human_review",
    actorType: "human",
    actorId: user.id,
    oldStatus: prospect.status,
    newStatus: nextStatus,
    metadata: {
      decision,
      agreed_with_ai: prospect.ai_recommendation
        ? normalize(prospect.ai_recommendation) === decision
        : null,
    },
  });
  return NextResponse.json({ status: nextStatus });
}

function normalize(value: string): string {
  return value.replace("sales_ready", "sales_ready").replace("qualified", "watchlist");
}
