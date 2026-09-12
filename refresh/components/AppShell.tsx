import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import QuickAdd from "@/components/prospect/QuickAdd";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/prospects", label: "Prospects" },
  { href: "/prospects?needsReview=1", label: "Needs Review" },
  { href: "/previews", label: "Previews" },
  { href: "/settings", label: "Settings" },
];

export default async function AppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="border-b border-[#e6dfd2] bg-[#16141c] px-5 py-6 text-[#f5f4f0] md:border-b-0 md:border-r md:border-white/10">
        <Link href="/dashboard" className="font-[var(--font-display)] text-lg font-bold">
          Refresh<span className="text-[#60a5fa]">.</span>
        </Link>
        <p className="mt-1 text-xs text-white/50">Website Refresh intake</p>
        <nav className="mt-8 grid gap-1 text-sm">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-white/80 hover:bg-white/10 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <p className="mt-10 truncate text-xs text-white/40">{user?.email}</p>
      </aside>
      <div className="min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e6dfd2] bg-[#fffcf7] px-6 py-4">
          <div>
            <h1 className="font-[var(--font-display)] text-xl font-bold">Prospecting</h1>
            <p className="text-sm text-[#6a6573]">URL in, scan, score, menselijke check.</p>
          </div>
          <QuickAdd />
        </header>
        <main className="px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
