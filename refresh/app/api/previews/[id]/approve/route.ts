import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/staff";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const staff = await requireStaff();
  if ("error" in staff) return staff.error;
  const { supabase } = staff;

  const { error } = await supabase
    .from("previews")
    .update({ approved_for_internal_use: true, qa_status: "approved" })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
