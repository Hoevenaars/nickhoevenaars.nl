import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/staff";
import { runProspectPipeline } from "@/lib/pipeline/run";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const staff = await requireStaff();
  if ("error" in staff) return staff.error;
  const { supabase, user } = staff;

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
