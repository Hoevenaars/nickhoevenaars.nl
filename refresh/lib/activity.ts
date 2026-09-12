import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActorType, ProspectStatus } from "@/types";

export async function logActivity(
  supabase: SupabaseClient,
  input: {
    prospectId?: string | null;
    eventType: string;
    actorType: ActorType;
    actorId?: string | null;
    oldStatus?: ProspectStatus | string | null;
    newStatus?: ProspectStatus | string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const { error } = await supabase.from("activity_logs").insert({
    prospect_id: input.prospectId ?? null,
    event_type: input.eventType,
    actor_type: input.actorType,
    actor_id: input.actorId ?? null,
    old_status: input.oldStatus ?? null,
    new_status: input.newStatus ?? null,
    metadata: input.metadata ?? {},
  });
  if (error) console.error("activity log failed", error.message);
}

export async function setProspectStatus(
  supabase: SupabaseClient,
  input: {
    prospectId: string;
    from: ProspectStatus | string | null;
    to: ProspectStatus;
    actorType: ActorType;
    actorId?: string | null;
    extra?: Record<string, unknown>;
  },
) {
  const { error } = await supabase
    .from("prospects")
    .update({ status: input.to, ...input.extra })
    .eq("id", input.prospectId);
  if (error) throw error;
  await logActivity(supabase, {
    prospectId: input.prospectId,
    eventType: "status_change",
    actorType: input.actorType,
    actorId: input.actorId,
    oldStatus: input.from,
    newStatus: input.to,
    metadata: input.extra ?? {},
  });
}

export async function recordCost(
  supabase: SupabaseClient,
  input: {
    prospectId?: string | null;
    scanId?: string | null;
    costType: "ai" | "browser" | "hosting" | "data" | "preview" | "other";
    provider?: string;
    amount: number;
    tokensInput?: number;
    tokensOutput?: number;
  },
) {
  if (!input.amount && !input.tokensInput && !input.tokensOutput) return;
  await supabase.from("cost_events").insert({
    prospect_id: input.prospectId ?? null,
    scan_id: input.scanId ?? null,
    cost_type: input.costType,
    provider: input.provider ?? null,
    amount: input.amount,
    tokens_input: input.tokensInput ?? null,
    tokens_output: input.tokensOutput ?? null,
  });
}
