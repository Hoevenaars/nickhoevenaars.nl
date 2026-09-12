import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isAllowedEmail } from "./allowlist";

export async function requireStaff() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Niet ingelogd" }, { status: 401 }) };
  }
  if (!isAllowedEmail(user.email)) {
    return { error: NextResponse.json({ error: "Geen toegang" }, { status: 403 }) };
  }
  return { supabase, user };
}
