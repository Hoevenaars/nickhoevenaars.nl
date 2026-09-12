import AppShell from "@/components/AppShell";
import { createServerSupabase } from "@/lib/supabase/server";
import SettingsForm from "@/components/settings/SettingsForm";

export default async function SettingsPage() {
  const supabase = await createServerSupabase();
  const { data: settings } = await supabase.from("app_settings").select("*").eq("id", 1).single();

  return (
    <AppShell>
      <h2 className="font-[var(--font-display)] text-2xl font-bold">Settings</h2>
      <p className="mt-1 text-sm text-[#6a6573]">
        V1: scanning, scoringgewichten, productregels, AI-model en kostenlimiet. Secrets blijven server-side.
      </p>
      {settings ? <SettingsForm settings={settings} /> : <p>Settings ontbreken.</p>}
    </AppShell>
  );
}
