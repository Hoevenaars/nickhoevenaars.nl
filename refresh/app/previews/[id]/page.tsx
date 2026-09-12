import AppShell from "@/components/AppShell";
import ApprovePreviewButton from "@/components/preview/ApprovePreviewButton";
import PreviewCanvas from "@/components/preview/PreviewCanvas";
import type { PreviewContent } from "@/lib/preview/generate";
import { createServerSupabase } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

export default async function PreviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: preview } = await supabase.from("previews").select("*").eq("id", id).maybeSingle();
  if (!preview) notFound();

  const { data: prospect } = await supabase
    .from("prospects")
    .select("*")
    .eq("id", preview.prospect_id)
    .single();
  const { data: scan } = await supabase
    .from("website_scans")
    .select("id")
    .eq("prospect_id", preview.prospect_id)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: home } = scan
    ? await supabase
        .from("scanned_pages")
        .select("desktop_screenshot_url, title")
        .eq("scan_id", scan.id)
        .eq("page_type", "home")
        .maybeSingle()
    : { data: null };

  return (
    <AppShell>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-[#6a6573]">Interne preview · niet publiek</p>
          <h2 className="font-[var(--font-display)] text-2xl font-bold">
            {prospect?.company_name || prospect?.domain}
          </h2>
        </div>
        <ApprovePreviewButton previewId={id} approved={preview.approved_for_internal_use} />
      </div>
      <PreviewCanvas
        content={preview.content as PreviewContent}
        currentScreenshot={home?.desktop_screenshot_url}
        profile={preview.design_profile}
        qaScore={preview.qa_score}
      />
    </AppShell>
  );
}
