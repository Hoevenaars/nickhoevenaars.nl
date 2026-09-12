import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateOpportunity } from "../lib/scoring/opportunity";
import { statusFromOpportunity } from "../lib/scoring/status";
import { evaluateProductFit } from "../lib/scoring/product-fit";
import { websiteQualityLabel } from "../lib/scoring/website";
import type { FindingInput, ProductFitSignals, QualityScores } from "../types";

const simpleSite: ProductFitSignals = {
  hasWebshop: false,
  hasLogin: false,
  hasBookingSystem: false,
  hasCustomerPortal: false,
  hasComplexIntegrations: false,
  hasMultipleLanguages: false,
  hasLargeContentVolume: false,
  hasMultipleLocations: false,
  hasCustomCalculator: false,
  estimatedPageCount: 8,
};

const weakQuality: QualityScores = {
  technical: 40,
  mobile: 28,
  conversion: 30,
  visual: 35,
  content: 42,
};

const fact = (title: string): FindingInput => ({
  type: "FACT",
  category: "technical",
  severity: "important",
  title,
  description: title,
  confidence: 0.9,
  evidenceType: "http",
  evidenceReference: "https://example.com/broken",
});

describe("statusFromOpportunity", () => {
  it("maps score bands", () => {
    assert.equal(statusFromOpportunity(0), "REJECTED");
    assert.equal(statusFromOpportunity(49), "REJECTED");
    assert.equal(statusFromOpportunity(50), "WATCHLIST");
    assert.equal(statusFromOpportunity(64), "WATCHLIST");
    assert.equal(statusFromOpportunity(65), "QUALIFIED");
    assert.equal(statusFromOpportunity(79), "QUALIFIED");
    assert.equal(statusFromOpportunity(80), "SALES_READY");
    assert.equal(statusFromOpportunity(89), "SALES_READY");
    assert.equal(statusFromOpportunity(90), "PRIORITY");
    assert.equal(statusFromOpportunity(100), "PRIORITY");
  });
});

describe("evaluateProductFit", () => {
  it("scores a simple brochure site highly", () => {
    const result = evaluateProductFit(simpleSite);
    assert.equal(result.standardProductFit, true);
    assert.equal(result.productFitScore, 25);
  });

  it("rejects webshops regardless of other signals", () => {
    const result = evaluateProductFit({ ...simpleSite, hasWebshop: true });
    assert.equal(result.productFitScore, 0);
    assert.equal(result.standardProductFit, false);
    assert.equal(result.overrides[0]?.kind, "rejected");
    assert.equal(result.overrides[0] && result.overrides[0].kind === "rejected" ? result.overrides[0].reason : null, "webshop");
  });

  it("flags page counts above the product maximum for review", () => {
    const result = evaluateProductFit({ ...simpleSite, estimatedPageCount: 80 });
    assert.ok(result.overrides.some((item) => item.kind === "review_required"));
    assert.equal(result.standardProductFit, false);
  });
});

describe("calculateOpportunity", () => {
  it("is reproducible for the same inputs", () => {
    const input = {
      quality: weakQuality,
      commercial: {
        companySize: "5-30" as const,
        likelyCustomerValue: "high" as const,
        websiteImportanceForAcquisition: "high" as const,
      },
      productFit: simpleSite,
      findings: [fact("404"), fact("no ssl"), fact("cta below fold")],
    };
    const a = calculateOpportunity(input);
    const b = calculateOpportunity(input);
    assert.deepEqual(a, b);
    assert.ok(a.opportunityScore >= 65);
  });

  it("lets hard overrides beat a high opportunity score", () => {
    const result = calculateOpportunity({
      quality: {
        technical: 20,
        mobile: 15,
        conversion: 18,
        visual: 22,
        content: 30,
      },
      commercial: {
        companySize: "5-30",
        likelyCustomerValue: "high",
        websiteImportanceForAcquisition: "high",
      },
      productFit: { ...simpleSite, hasWebshop: true },
      findings: [fact("cart"), fact("checkout"), fact("404")],
    });
    assert.equal(result.suggestedStatus, "REJECTED");
    assert.equal(result.rejectReason, "webshop");
  });

  it("rejects recent high-quality sites", () => {
    const result = calculateOpportunity({
      quality: {
        technical: 92,
        mobile: 90,
        conversion: 88,
        visual: 91,
        content: 89,
      },
      commercial: {
        companySize: "5-30",
        likelyCustomerValue: "high",
        websiteImportanceForAcquisition: "high",
      },
      productFit: simpleSite,
      findings: [],
      siteRecentAndHighQuality: true,
    });
    assert.equal(result.suggestedStatus, "REJECTED");
    assert.equal(result.rejectReason, "recent_modern_site");
  });

  it("labels website quality independently from opportunity", () => {
    assert.equal(websiteQualityLabel(10), "Poor");
    assert.equal(websiteQualityLabel(50), "Weak");
    assert.equal(websiteQualityLabel(70), "Average");
    assert.equal(websiteQualityLabel(80), "Good");
    assert.equal(websiteQualityLabel(95), "Strong");
  });
});
