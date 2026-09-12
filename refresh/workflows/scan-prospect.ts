import { runProspectPipeline } from "@/lib/pipeline/run";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function scanProspectWorkflow(
  supabase: SupabaseClient,
  prospectId: string,
) {
  return runProspectPipeline(supabase, prospectId, { type: "workflow" });
}

export async function analyseProspectWorkflow(
  supabase: SupabaseClient,
  prospectId: string,
) {
  return runProspectPipeline(supabase, prospectId, { type: "workflow" });
}
