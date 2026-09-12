import type { FindingInput, QualityScores } from "@/types";

export type ScanMetrics = {
  httpStatus: number | null;
  sslValid: boolean | null;
  brokenLinksCount: number;
  formsCount: number;
  formsWorkingCount: number;
  hasPhone: boolean;
  hasEmail: boolean;
  hasPrimaryCta: boolean;
  hasContactPage: boolean;
  pageCount: number;
  wordCount: number;
  lighthouse?: {
    performance: number | null;
    accessibility: number | null;
    bestPractices: number | null;
    seo: number | null;
  };
};

export function qualityFromScan(metrics: ScanMetrics): QualityScores {
  const lighthouse = average([
    metrics.lighthouse?.performance,
    metrics.lighthouse?.accessibility,
    metrics.lighthouse?.bestPractices,
    metrics.lighthouse?.seo,
  ]);

  let technical = lighthouse ?? 55;
  if (metrics.sslValid === false) technical -= 25;
  if (metrics.httpStatus && metrics.httpStatus >= 400) technical -= 35;
  if (metrics.brokenLinksCount >= 3) technical -= 18;
  else if (metrics.brokenLinksCount >= 1) technical -= 8;

  let mobile = metrics.lighthouse?.performance ?? 48;
  if (!metrics.hasPrimaryCta) mobile -= 8;

  let conversion = 35;
  if (metrics.hasPrimaryCta) conversion += 18;
  if (metrics.hasPhone || metrics.hasEmail) conversion += 14;
  if (metrics.hasContactPage) conversion += 10;
  if (metrics.formsCount > 0) conversion += 12;
  if (metrics.formsCount > 0 && metrics.formsWorkingCount === 0) conversion -= 15;

  let visual = metrics.lighthouse?.bestPractices ?? 50;
  if (metrics.httpStatus && metrics.httpStatus >= 400) visual -= 20;

  let content = 40;
  if (metrics.wordCount > 250) content += 10;
  if (metrics.wordCount > 800) content += 8;
  if (metrics.hasContactPage) content += 8;
  if (metrics.pageCount >= 3) content += 8;
  if (metrics.wordCount < 80) content -= 15;

  return {
    technical: clamp(technical),
    mobile: clamp(mobile),
    conversion: clamp(conversion),
    visual: clamp(visual),
    content: clamp(content),
  };
}

export function findingsFromScan(metrics: ScanMetrics): FindingInput[] {
  const findings: FindingInput[] = [];

  if (metrics.sslValid === false) {
    findings.push({
      type: "FACT",
      category: "technical",
      severity: "critical",
      title: "Ongeldig of ontbrekend SSL-certificaat",
      description: "De website laadt niet betrouwbaar over HTTPS.",
      confidence: 0.99,
      evidenceType: "tls",
      evidenceReference: "ssl_valid=false",
      createdBy: "system",
    });
  }

  if (metrics.httpStatus && metrics.httpStatus >= 400) {
    findings.push({
      type: "FACT",
      category: "technical",
      severity: "critical",
      title: `Homepage geeft HTTP ${metrics.httpStatus}`,
      description: "De startpagina is niet correct bereikbaar.",
      confidence: 0.99,
      evidenceType: "http",
      evidenceReference: `http_status=${metrics.httpStatus}`,
      createdBy: "system",
    });
  }

  if (metrics.brokenLinksCount > 0) {
    findings.push({
      type: "FACT",
      category: "technical",
      severity: metrics.brokenLinksCount >= 3 ? "critical" : "important",
      title: `${metrics.brokenLinksCount} interne link(s) geven een foutstatus`,
      description: "Bezoekers lopen vast op dode pagina's.",
      confidence: 0.95,
      evidenceType: "http",
      evidenceReference: `broken_links_count=${metrics.brokenLinksCount}`,
      createdBy: "system",
    });
    findings.push({
      type: "HYPOTHESIS",
      category: "conversion",
      severity: "important",
      title: "Dode links kunnen aanvragen kosten",
      description:
        "Bezoekers kunnen hierdoor minder snel tot contact overgaan. Dit is geen bewezen omzetimpact.",
      confidence: 0.55,
      evidenceType: "derived",
      evidenceReference: `broken_links_count=${metrics.brokenLinksCount}`,
      createdBy: "system",
    });
  }

  if (!metrics.hasPrimaryCta) {
    findings.push({
      type: "OBSERVATION",
      category: "conversion",
      severity: "important",
      title: "Geen duidelijke primaire call-to-action gevonden",
      description: "Op de gescande pagina's ontbreekt een duidelijk contact- of offerte-CTA.",
      confidence: 0.7,
      evidenceType: "html",
      evidenceReference: "has_primary_cta=false",
      createdBy: "system",
    });
  }

  if (!metrics.hasPhone && !metrics.hasEmail && !metrics.hasContactPage) {
    findings.push({
      type: "FACT",
      category: "conversion",
      severity: "critical",
      title: "Geen contactkanaal gevonden",
      description: "Geen telefoonnummer, e-mailadres of contactpagina gedetecteerd.",
      confidence: 0.8,
      evidenceType: "html",
      evidenceReference: "contact_signals=none",
      createdBy: "system",
    });
  }

  if (metrics.lighthouse?.performance != null && metrics.lighthouse.performance < 50) {
    findings.push({
      type: "FACT",
      category: "performance",
      severity: "important",
      title: `Lighthouse performance ${Math.round(metrics.lighthouse.performance)}`,
      description: "De homepage scoort zwak op laadsnelheid. Score is input, geen oordeel op zich.",
      confidence: 0.9,
      evidenceType: "lighthouse",
      evidenceReference: `lighthouse_performance=${metrics.lighthouse.performance}`,
      createdBy: "system",
    });
  }

  if (metrics.wordCount < 80) {
    findings.push({
      type: "OBSERVATION",
      category: "content",
      severity: "important",
      title: "Zeer weinig zichtbare tekst",
      description: "De gescande pagina's bevatten nauwelijks inhoudelijke copy.",
      confidence: 0.75,
      evidenceType: "html",
      evidenceReference: `word_count=${metrics.wordCount}`,
      createdBy: "system",
    });
  }

  return findings;
}

function average(values: Array<number | null | undefined>): number | null {
  const usable = values.filter((value): value is number => typeof value === "number");
  if (!usable.length) return null;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function clamp(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)) * 100) / 100;
}
