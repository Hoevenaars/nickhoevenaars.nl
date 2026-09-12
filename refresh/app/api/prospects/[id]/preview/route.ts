import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/staff";
import { generatePreviewWorkflow } from "@/workflows/generate-preview";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const staff = await requireStaff();
  if ("error" in staff) return staff.error;
  const { supabase, user } = staff;

  try {
    const preview = await generatePreviewWorkflow(supabase, id, user.id);
    return NextResponse.json({ previewId: preview.id, url: preview.preview_url });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Preview mislukt" },
      { status: 400 },
    );
  }
}
