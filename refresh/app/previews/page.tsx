import AppShell from "@/components/AppShell";
import { createServerSupabase } from "@/lib/supabase/server";
import Link from "next/link";

export default async function PreviewsPage() {
  const supabase = await createServerSupabase();
  const { data: previews } = await supabase
    .from("previews")
    .select("id, status, design_profile, qa_score, generated_at, prospect_id, prospects(company_name, domain)")
    .order("generated_at", { ascending: false });

  return (
    <AppShell>
      <h2 className="font-[var(--font-display)] text-2xl font-bold">Previews</h2>
      <p className="text-sm text-[#6a6573]">Alleen intern. Delen met prospects komt later.</p>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-[#e6dfd2] bg-[#fffcf7]">
        <table className="w-full text-left text-sm">
          <thead className="text-[#6a6573]">
            <tr>
              <th className="px-4 py-3">Prospect</th>
              <th>Profile</th>
              <th>Status</th>
              <th>QA</th>
              <th>Generated</th>
            </tr>
          </thead>
          <tbody>
            {(previews ?? []).map((preview) => (
              <tr key={preview.id} className="border-t border-[#e6dfd2]">
                <td className="px-4 py-3">
                  <Link className="hover:underline" href={`/previews/${preview.id}`}>
                    {(preview.prospects as { company_name?: string; domain?: string } | null)?.company_name ||
                      (preview.prospects as { domain?: string } | null)?.domain ||
                      preview.prospect_id}
                  </Link>
                </td>
                <td>{preview.design_profile}</td>
                <td>{preview.status}</td>
                <td>{preview.qa_score ?? "—"}</td>
                <td>{preview.generated_at ? new Date(preview.generated_at).toLocaleString("nl-NL") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
