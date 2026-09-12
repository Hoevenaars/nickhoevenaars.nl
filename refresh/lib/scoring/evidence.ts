import type { FindingInput } from "@/types";

export function evidenceQualityScore(findings: FindingInput[]): number {
  const facts = findings.filter(
    (finding) =>
      finding.type === "FACT" &&
      Boolean(finding.evidenceReference || finding.evidenceType),
  );
  if (facts.length === 0) return 0;

  const weighted = facts.reduce((sum, finding) => {
    const severityWeight =
      finding.severity === "critical" ? 2 : finding.severity === "important" ? 1.4 : 1;
    return sum + severityWeight;
  }, 0);

  if (weighted >= 10) return 10;
  if (weighted >= 6) return 8;
  if (facts.length >= 6) return 10;
  if (facts.length >= 3) return 6;
  if (facts.length >= 1) return 3;
  return 0;
}
