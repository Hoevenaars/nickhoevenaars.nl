import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/staff";

export async function PATCH(request: Request) {
  const staff = await requireStaff();
  if ("error" in staff) return staff.error;
  const { supabase } = staff;

  const body = await request.json().catch(() => ({}));
  const allowed = [
    "max_pages_per_scan",
    "desktop_viewport_width",
    "desktop_viewport_height",
    "mobile_viewport_width",
    "mobile_viewport_height",
    "scan_timeout_ms",
    "retry_count",
    "weight_mobile",
    "weight_conversion",
    "weight_visual",
    "weight_technical",
    "weight_content",
    "max_pages_product_fit",
    "allow_booking",
    "allow_multilingual",
    "allow_webshop",
    "ai_model",
    "ai_enabled",
    "max_scan_cost_usd",
    "needs_review_score_min",
    "needs_review_score_max",
  ] as const;

  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }
  const { data, error } = await supabase
    .from("app_settings")
    .update(patch)
    .eq("id", 1)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
