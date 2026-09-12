import {
  DEFAULT_PRODUCT_FIT_RULES,
  type HardOverride,
  type ProductFitRules,
  type ProductFitSignals,
} from "@/types";

export type ProductFitResult = {
  productFitScore: number;
  complexityScore: number;
  standardProductFit: boolean;
  fitReason: string;
  overrides: HardOverride[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function evaluateProductFit(
  signals: ProductFitSignals,
  rules: ProductFitRules = DEFAULT_PRODUCT_FIT_RULES,
): ProductFitResult {
  const overrides: HardOverride[] = [];
  let score = 25;
  let complexity = 8;
  const reasons: string[] = [];

  if (signals.hasWebshop) {
    complexity += 40;
    score = 0;
    reasons.push("webshop gedetecteerd");
    if (!rules.allowWebshop) {
      overrides.push({
        kind: "rejected",
        reason: "webshop",
        message: "Webshops vallen buiten het standaard Website Refresh product.",
      });
    }
  }

  if (signals.hasCustomerPortal) {
    complexity += 40;
    score = Math.min(score, 2);
    reasons.push("klantportaal gedetecteerd");
    overrides.push({
      kind: "rejected",
      reason: "complex_website",
      message: "Een klantportaal valt buiten het standaardproduct.",
    });
  }

  if (signals.hasLogin) {
    complexity += 18;
    score -= 8;
    reasons.push("login aanwezig");
  }

  if (signals.hasBookingSystem) {
    complexity += 12;
    if (!rules.allowBooking) {
      score -= 10;
      reasons.push("boekingssysteem niet toegestaan");
      overrides.push({
        kind: "rejected",
        reason: "poor_product_fit",
        message: "Boekingssystemen zijn in de huidige productregels uitgesloten.",
      });
    } else {
      score -= 3;
      reasons.push("eenvoudig boekingssysteem");
    }
  }

  if (signals.hasComplexIntegrations) {
    complexity += 22;
    score -= 8;
    reasons.push("complexe koppelingen");
  }

  if (signals.hasMultipleLanguages) {
    complexity += 10;
    if (!rules.allowMultilingual) {
      score -= 8;
      reasons.push("meertaligheid niet toegestaan");
      overrides.push({
        kind: "rejected",
        reason: "unsupported_language",
        message: "Meertalige sites zijn in de huidige productregels uitgesloten.",
      });
    } else {
      score -= 4;
      reasons.push("meerdere talen");
    }
  }

  if (signals.hasLargeContentVolume) {
    complexity += 14;
    score -= 6;
    reasons.push("groot contentvolume");
  }

  if (signals.hasMultipleLocations) {
    complexity += 6;
    score -= 2;
    reasons.push("meerdere locaties");
  }

  if (signals.hasCustomCalculator) {
    complexity += 10;
    score -= 4;
    reasons.push("custom calculator");
  }

  const pages = signals.estimatedPageCount;
  if (pages > rules.maxPages) {
    complexity += 20;
    score -= 12;
    reasons.push(`meer dan ${rules.maxPages} pagina's`);
    overrides.push({
      kind: "review_required",
      reason: "page_count",
      message: `Geschat aantal pagina's (${pages}) is groter dan ${rules.maxPages}.`,
    });
  } else if (pages > 25) {
    complexity += 10;
    score -= 8;
    reasons.push("middelgrote site");
  } else if (pages > 10) {
    complexity += 4;
    score -= 3;
    reasons.push("beperkt aantal extra pagina's");
  } else {
    reasons.push("eenvoudige siteomvang");
  }

  const productFitScore = clamp(Math.round(score * 100) / 100, 0, 25);
  const complexityScore = clamp(Math.round(complexity * 100) / 100, 0, 100);
  const blocked = overrides.some((item) => item.kind === "rejected");
  const standardProductFit = !blocked && productFitScore >= 12 && pages <= rules.maxPages;

  const fitReason = blocked
    ? `Geen standaardproduct: ${reasons.join("; ")}.`
    : standardProductFit
      ? `Past binnen het standaardproduct: ${reasons.join("; ")}.`
      : `Twijfelachtige productfit: ${reasons.join("; ")}.`;

  return {
    productFitScore,
    complexityScore,
    standardProductFit,
    fitReason,
    overrides,
  };
}
