import type { PreviewContent } from "@/lib/preview/generate";

const THEMES: Record<string, string> = {
  modern: "bg-white text-slate-900",
  warm: "bg-[#f8efe6] text-[#3b2a1f]",
  premium: "bg-[#0c0c0f] text-[#f5f4f0]",
};

export default function PreviewCanvas({
  content,
  currentScreenshot,
  profile,
  qaScore,
}: {
  content: PreviewContent;
  currentScreenshot?: string | null;
  profile: string;
  qaScore?: number | null;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-4">
        <section className="rounded-2xl border border-[#e6dfd2] bg-[#fffcf7] p-4">
          <h3 className="text-sm font-bold">Huidige site</h3>
          {currentScreenshot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentScreenshot} alt="Huidige homepage" className="mt-2 rounded-lg" />
          ) : (
            <p className="mt-2 text-sm text-[#6a6573]">Geen screenshot.</p>
          )}
        </section>
        <section className="rounded-2xl border border-[#e6dfd2] bg-[#fffcf7] p-4">
          <h3 className="text-sm font-bold">Belangrijkste issues</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {content.issues.map((issue) => (
              <li key={issue.title}>
                <span className="text-xs uppercase text-[#6a6573]">{issue.type}</span>
                <div>{issue.title}</div>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border border-[#e6dfd2] bg-[#fffcf7] p-4 text-sm">
          <p>Profiel: {profile}</p>
          <p>Structuur: {content.structure.join(" → ")}</p>
          <p>Componenten: hero {content.components.hero}, services {content.components.services}</p>
          <p>QA score: {qaScore ?? "—"}</p>
        </section>
      </aside>
      <article className={`overflow-hidden rounded-3xl border border-[#e6dfd2] ${THEMES[profile] ?? THEMES.modern}`}>
        <header className="px-10 py-16">
          <p className="text-sm uppercase tracking-[0.2em] opacity-70">{content.companyName}</p>
          <h1 className="mt-4 max-w-3xl font-[var(--font-display)] text-4xl font-bold leading-tight">
            {content.tagline}
          </h1>
          <p className="mt-4 max-w-2xl text-base opacity-80">{content.hero}</p>
          <button className="mt-8 rounded-full bg-[#1d4ed8] px-5 py-3 text-white">{content.cta}</button>
        </header>
        <section className="px-10 py-10">
          <h2 className="font-[var(--font-display)] text-2xl font-bold">Diensten</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {content.services.map((service) => (
              <div key={service} className="rounded-2xl border border-black/10 bg-white/60 p-4">
                {service}
              </div>
            ))}
          </div>
        </section>
        <section className="px-10 py-10">
          <h2 className="font-[var(--font-display)] text-2xl font-bold">Over</h2>
          <p className="mt-3 max-w-2xl opacity-80">{content.about}</p>
        </section>
        <section className="px-10 py-10">
          <h2 className="font-[var(--font-display)] text-2xl font-bold">Contact</h2>
          <p className="mt-3">{content.trust}</p>
          <button className="mt-6 rounded-full border border-current px-5 py-3">{content.cta}</button>
        </section>
      </article>
    </div>
  );
}
