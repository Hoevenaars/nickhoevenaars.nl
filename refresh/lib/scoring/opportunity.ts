import type {
  CommercialFitInput,
  FindingInput,
  HardOverride,
  ProductFitRules,
  ProductFitSignals,
  QualityScores,
  ScoreDecision,
  ScoringWeights,
} from "@/types";
import { DEFAULT_PRODUCT_FIT_RULES, DEFAULT_SCORING_WEIGHTS } from "@/types";
import { commercialFitScore } from "./commercial";
import { evidenceQualityScore } from "./evidence";
import { evaluateProductFit } from "./product-fit";
import {
  applyHardOverrides,
  collectReviewReasons,
  rejectReasonForStatus,
  statusFromOpportunity,
} from "./status";
import { improvementPotential, websiteQualityLabel, websiteQualityScore } from "./website";

export type OpportunityInput = {
  quality: QualityScores;
  commercial: CommercialFitInput;
  productFit: ProductFitSignals;
  findings: FindingInput[];
  industryConfidence?: number | null;
  scanPartial?: boolean;
  complexityUnclear?: boolean;
  aiSuggestedStatus?: string | null;
  websiteUnreachable?: boolean;
  siteRecentAndHighQuality?: boolean;
  weights?: ScoringWeights;
  rules?: ProductFitRules;
  reviewMin?: number;
  reviewMax?: number;
};

export function calculateOpportunity(input: OpportunityInput): ScoreDecision {
  const weights = input.weights ?? DEFAULT_SCORING_WEIGHTS;
  const rules = input.rules ?? DEFAULT_PRODUCT_FIT_RULES;
  const quality = clampQuality(input.quality);
  const websiteScore = websiteQualityScore(quality);
  const websiteLabel = websiteQualityLabel(websiteScore);
  const improvement = improvementPotential(quality, weights);
  const commercial = commercialFitScore(input.commercial);
  const product = evaluateProductFit(input.productFit, rules);
  const evidence = evidenceQualityScore(input.findings);

  const recentHighQuality =
    input.siteRecentAndHighQuality ??
    (websiteScore >= 85 && quality.visual >= 80 && quality.technical >= 80);

  const extraOverrides = applyHardOverrides({
    hasWebshop: input.productFit.hasWebshop,
    hasCustomerPortal: input.productFit.hasCustomerPortal,
    estimatedPageCount: input.productFit.estimatedPageCount,
    maxPages: rules.maxPages,
    siteRecentAndHighQuality: recentHighQuality,
    websiteUnreachable: Boolean(input.websiteUnreachable),
    quality,
  });

  const overrides = dedupeOverrides([...product.overrides, ...extraOverrides]);
  const rawOpportunity =
    improvement.total + commercial.score + product.productFitScore + evidence;
  const opportunityScore = round2(Math.min(100, Math.max(0, rawOpportunity)));

  let suggestedStatus = statusFromOpportunity(opportunityScore);
  const rejected = overrides.find((item) => item.kind === "rejected");
  if (rejected) {
    suggestedStatus = "REJECTED";
  }

  const aiRulesConflict = Boolean(
    input.aiSuggestedStatus &&
      rejected &&
      !["REJECTED", "reject"].includes(input.aiSuggestedStatus),
  );

  const needsReviewReasons = collectReviewReasons({
    opportunityScore,
    industryConfidence: input.industryConfidence ?? null,
    scanPartial: Boolean(input.scanPartial),
    complexityUnclear: Boolean(input.complexityUnclear),
    aiRulesConflict,
    reviewMin: input.reviewMin ?? 75,
    reviewMax: input.reviewMax ?? 85,
    overrides,
  });

  return {
    opportunityScore,
    websiteScore,
    websiteLabel,
    websiteImprovementPotential: improvement.total,
    commercialFitScore: commercial.score,
    productFitScore: product.productFitScore,
    complexityScore: product.complexityScore,
    evidenceQualityScore: evidence,
    quality,
    suggestedStatus,
    rejectReason: rejectReasonForStatus(suggestedStatus, overrides, websiteScore),
    needsReview: needsReviewReasons.length > 0,
    needsReviewReasons,
    overrides,
    standardProductFit: product.standardProductFit && !rejected,
    fitReason: product.fitReason,
    breakdown: {
      mobileImprovement: improvement.parts.mobile,
      conversionImprovement: improvement.parts.conversion,
      visualImprovement: improvement.parts.visual,
      technicalImprovement: improvement.parts.technical,
      contentImprovement: improvement.parts.content,
      commercialSize: commercial.breakdown.companySize,
      commercialValue: commercial.breakdown.likelyCustomerValue,
      commercialAcquisition: commercial.breakdown.websiteImportance,
      productFit: product.productFitScore,
      evidence,
      websiteScore,
      complexity: product.complexityScore,
    },
  };
}

function clampQuality(quality: QualityScores): QualityScores {
  return {
    technical: clamp(quality.technical),
    mobile: clamp(quality.mobile),
    conversion: clamp(quality.conversion),
    visual: clamp(quality.visual),
    content: clamp(quality.content),
  };
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function dedupeOverrides(overrides: HardOverride[]): HardOverride[] {
  const seen = new Set<string>();
  const result: HardOverride[] = [];
  for (const item of overrides) {
    const key = `${item.kind}:${item.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}
