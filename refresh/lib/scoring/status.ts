import type {
  HardOverride,
  ProspectStatus,
  QualityScores,
  RejectReason,
} from "@/types";

export function statusFromOpportunity(score: number): ProspectStatus {
  if (score <= 49) return "REJECTED";
  if (score <= 64) return "WATCHLIST";
  if (score <= 79) return "QUALIFIED";
  if (score <= 89) return "SALES_READY";
  return "PRIORITY";
}

export function rejectReasonForStatus(
  status: ProspectStatus,
  overrides: HardOverride[],
  websiteScore: number,
): RejectReason | null {
  const rejected = overrides.find((item) => item.kind === "rejected");
  if (rejected && rejected.kind === "rejected") return rejected.reason;
  if (status !== "REJECTED") return null;
  if (websiteScore >= 85) return "recent_modern_site";
  return "low_commercial_value";
}

export function collectReviewReasons(input: {
  opportunityScore: number;
  industryConfidence: number | null;
  scanPartial: boolean;
  complexityUnclear: boolean;
  aiRulesConflict: boolean;
  reviewMin: number;
  reviewMax: number;
  overrides: HardOverride[];
}): string[] {
  const reasons: string[] = [];
  if (
    input.opportunityScore >= input.reviewMin &&
    input.opportunityScore <= input.reviewMax
  ) {
    reasons.push("opportunity_band");
  }
  if (input.industryConfidence !== null && input.industryConfidence < 0.5) {
    reasons.push("low_industry_confidence");
  }
  if (input.scanPartial) reasons.push("partial_scan");
  if (input.complexityUnclear) reasons.push("complexity_unclear");
  if (input.aiRulesConflict) reasons.push("ai_rules_conflict");
  for (const override of input.overrides) {
    if (override.kind === "review_required") reasons.push(override.reason);
  }
  return reasons;
}

export function applyHardOverrides(input: {
  hasWebshop: boolean;
  hasCustomerPortal: boolean;
  estimatedPageCount: number;
  maxPages: number;
  siteRecentAndHighQuality: boolean;
  websiteUnreachable: boolean;
  quality: QualityScores;
}): HardOverride[] {
  const overrides: HardOverride[] = [];
  if (input.hasWebshop) {
    overrides.push({
      kind: "rejected",
      reason: "webshop",
      message: "Webshop overrulet de opportunity score.",
    });
  }
  if (input.hasCustomerPortal) {
    overrides.push({
      kind: "rejected",
      reason: "complex_website",
      message: "Klantportaal overrulet de opportunity score.",
    });
  }
  if (input.estimatedPageCount > input.maxPages) {
    overrides.push({
      kind: "review_required",
      reason: "page_count",
      message: "Pagina-aantal vereist menselijke review.",
    });
  }
  if (input.siteRecentAndHighQuality) {
    overrides.push({
      kind: "rejected",
      reason: "recent_modern_site",
      message: "Recente, hoogwaardige site overrulet de opportunity score.",
    });
  }
  if (input.websiteUnreachable) {
    overrides.push({
      kind: "rejected",
      reason: "website_unreachable",
      message: "Website is niet bereikbaar.",
    });
  }
  return overrides;
}

export function humanDecisionToStatus(
  decision: "reject" | "watchlist" | "sales_ready" | "priority" | "rescan",
): ProspectStatus {
  switch (decision) {
    case "reject":
      return "REJECTED";
    case "watchlist":
      return "WATCHLIST";
    case "sales_ready":
      return "SALES_READY";
    case "priority":
      return "PRIORITY";
    case "rescan":
      return "NEW";
  }
}

export function canGeneratePreview(status: ProspectStatus): boolean {
  return status === "SALES_READY" || status === "PRIORITY" || status === "PREVIEW_READY";
}
