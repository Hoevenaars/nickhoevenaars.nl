const TYPE_STYLE: Record<string, string> = {
  FACT: "bg-slate-800 text-white",
  OBSERVATION: "bg-amber-100 text-amber-900",
  HYPOTHESIS: "bg-violet-100 text-violet-900",
};

export default function FindingsList({
  findings,
}: {
  findings: Array<{
    id: string;
    title: string;
    description: string;
    severity: string;
    finding_type: string;
    category: string;
    evidence_reference: string | null;
    confidence: number | null;
  }>;
}) {
  const groups = {
    critical: findings.filter((item) => item.severity === "critical"),
    important: findings.filter((item) => item.severity === "important"),
    minor: findings.filter((item) => item.severity === "minor"),
  };

  return (
    <div className="grid gap-4">
      {Object.entries(groups).map(([label, items]) => (
        <section key={label} className="rounded-2xl border border-[#e6dfd2] bg-[#fffcf7] p-5">
          <h3 className="font-[var(--font-display)] text-base font-bold capitalize">{label}</h3>
          {items.length === 0 ? (
            <p className="mt-2 text-sm text-[#6a6573]">Geen {label} findings.</p>
          ) : (
            <ul className="mt-3 grid gap-3">
              {items.map((item) => (
                <li key={item.id} className="rounded-xl bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${TYPE_STYLE[item.finding_type]}`}>
                      {item.finding_type}
                    </span>
                    <span className="text-xs uppercase tracking-wide text-[#6a6573]">{item.category}</span>
                  </div>
                  <p className="mt-1 font-medium">{item.title}</p>
                  <p className="text-sm text-[#6a6573]">{item.description}</p>
                  {item.evidence_reference ? (
                    <p className="mt-1 font-mono text-xs text-[#1d4ed8]">{item.evidence_reference}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
