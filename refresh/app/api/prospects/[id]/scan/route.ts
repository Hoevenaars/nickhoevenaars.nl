import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { runProspectPipeline } from "@/lib/pipeline/run";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });

  try {
    const result = await runProspectPipeline(supabase, id, { type: "human", id: user.id });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scan mislukt" },
      { status: 500 },
    );
  }
}
