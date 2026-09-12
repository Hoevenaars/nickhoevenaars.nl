export const SCORE_VERSION = "v1.0.0";
export const SCANNER_VERSION = "1.0.0";

export const PROSPECT_STATUSES = [
  "NEW",
  "VALIDATING",
  "SCANNING",
  "SCAN_FAILED",
  "ANALYSING",
  "QUALIFIED",
  "WATCHLIST",
  "SALES_READY",
  "PRIORITY",
  "REJECTED",
  "PREVIEW_READY",
  "ARCHIVED",
] as const;

export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

export const SOURCE_TYPES = [
  "manual",
  "browser_extension",
  "import",
  "automatic_discovery",
  "referral",
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

export const REJECT_REASONS = [
  "complex_website",
  "webshop",
  "large_enterprise",
  "central_franchise_site",
  "recent_modern_site",
  "low_commercial_value",
  "insufficient_information",
  "website_unreachable",
  "duplicate",
  "unsupported_language",
  "poor_product_fit",
  "manual_rejection",
] as const;

export type RejectReason = (typeof REJECT_REASONS)[number];

export const HUMAN_DECISIONS = [
  "reject",
  "watchlist",
  "sales_ready",
  "priority",
  "rescan",
] as const;

export type HumanDecision = (typeof HUMAN_DECISIONS)[number];

export const FINDING_TYPES = ["FACT", "OBSERVATION", "HYPOTHESIS"] as const;
export type FindingType = (typeof FINDING_TYPES)[number];

export const FINDING_CATEGORIES = [
  "technical",
  "mobile",
  "conversion",
  "visual",
  "content",
  "trust",
  "navigation",
  "seo",
  "performance",
  "accessibility",
  "complexity",
  "commercial",
] as const;

export type FindingCategory = (typeof FINDING_CATEGORIES)[number];

export const FINDING_SEVERITIES = ["critical", "important", "minor"] as const;
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export const PAGE_TYPES = [
  "home",
  "about",
  "services",
  "contact",
  "team",
  "pricing",
  "projects",
  "other",
] as const;

export type PageType = (typeof PAGE_TYPES)[number];

export const ACTOR_TYPES = ["system", "agent", "human", "workflow"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const DESIGN_PROFILES = ["modern", "warm", "premium"] as const;
export type DesignProfile = (typeof DESIGN_PROFILES)[number];

export const COMPANY_SIZE_BUCKETS = [
  "1",
  "2-5",
  "5-30",
  "30-100",
  "100+",
] as const;

export type CompanySizeBucket = (typeof COMPANY_SIZE_BUCKETS)[number];

export const VALUE_LEVELS = ["low", "medium", "high"] as const;
export type ValueLevel = (typeof VALUE_LEVELS)[number];

export type ScoringWeights = {
  mobile: number;
  conversion: number;
  visual: number;
  technical: number;
  content: number;
};

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  mobile: 10,
  conversion: 10,
  visual: 5,
  technical: 5,
  content: 5,
};

export type ProductFitSignals = {
  hasWebshop: boolean;
  hasLogin: boolean;
  hasBookingSystem: boolean;
  hasCustomerPortal: boolean;
  hasComplexIntegrations: boolean;
  hasMultipleLanguages: boolean;
  hasLargeContentVolume: boolean;
  hasMultipleLocations: boolean;
  hasCustomCalculator: boolean;
  estimatedPageCount: number;
};

export type ProductFitRules = {
  maxPages: number;
  allowBooking: boolean;
  allowMultilingual: boolean;
  allowWebshop: boolean;
};

export const DEFAULT_PRODUCT_FIT_RULES: ProductFitRules = {
  maxPages: 50,
  allowBooking: true,
  allowMultilingual: true,
  allowWebshop: false,
};

export type CommercialFitInput = {
  companySize: CompanySizeBucket | null;
  likelyCustomerValue: ValueLevel | null;
  websiteImportanceForAcquisition: ValueLevel | null;
};

export type QualityScores = {
  technical: number;
  mobile: number;
  conversion: number;
  visual: number;
  content: number;
};

export type FindingInput = {
  type: FindingType;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  description: string;
  confidence: number;
  evidenceType?: string | null;
  evidenceReference?: string | null;
  commercialRelevance?: string | null;
  createdBy?: ActorType;
};

export type HardOverride =
  | { kind: "rejected"; reason: RejectReason; message: string }
  | { kind: "review_required"; reason: string; message: string };

export type ScoreDecision = {
  opportunityScore: number;
  websiteScore: number;
  websiteLabel: "Poor" | "Weak" | "Average" | "Good" | "Strong";
  websiteImprovementPotential: number;
  commercialFitScore: number;
  productFitScore: number;
  complexityScore: number;
  evidenceQualityScore: number;
  quality: QualityScores;
  suggestedStatus: ProspectStatus;
  rejectReason: RejectReason | null;
  needsReview: boolean;
  needsReviewReasons: string[];
  overrides: HardOverride[];
  standardProductFit: boolean;
  fitReason: string;
  breakdown: Record<string, number | string | boolean | null>;
};

export type AppSettings = {
  max_pages_per_scan: number;
  desktop_viewport_width: number;
  desktop_viewport_height: number;
  mobile_viewport_width: number;
  mobile_viewport_height: number;
  scan_timeout_ms: number;
  retry_count: number;
  weight_mobile: number;
  weight_conversion: number;
  weight_visual: number;
  weight_technical: number;
  weight_content: number;
  max_pages_product_fit: number;
  allow_booking: boolean;
  allow_multilingual: boolean;
  allow_webshop: boolean;
  ai_model: string;
  ai_enabled: boolean;
  max_scan_cost_usd: number;
  needs_review_score_min: number;
  needs_review_score_max: number;
};
