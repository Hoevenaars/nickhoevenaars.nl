import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_SCORING_WEIGHTS, SCORE_VERSION, SCANNER_VERSION } from "@/types";
import type { AppSettings, FindingInput } from "@/types";
import { crawlWebsite } from "@/lib/browser/crawl";
import { analyseWithOpenAI, aiFindingsToInput } from "@/lib/ai/analyse";
import { calculateOpportunity } from "@/lib/scoring/opportunity";
import { findingsFromScan, qualityFromScan } from "@/lib/scoring/from-scan";
import { logActivity, recordCost, setProspectStatus } from "@/lib/activity";

const OPENAI_INPUT_PER_MILLION = 0.4;
const OPENAI_OUTPUT_PER_MILLION = 1.6;

export async function runProspectPipeline(
  supabase: SupabaseClient,
  prospectId: string,
  actor: { type: "human" | "workflow" | "system"; id?: string | null },
) {
  const started = Date.now();
  const { data: prospect, error: prospectError } = await supabase
    .from("prospects")
    .select("*")
    .eq("id", prospectId)
    .single();
  if (prospectError || !prospect) throw prospectError ?? new Error("Prospect ontbreekt");

  const settings = await loadSettings(supabase);
  const previous = prospect.status as string;

  await setProspectStatus(supabase, {
    prospectId,
    from: previous,
    to: "VALIDATING",
    actorType: actor.type,
    actorId: actor.id,
  });

  await setProspectStatus(supabase, {
    prospectId,
    from: "VALIDATING",
    to: "SCANNING",
    actorType: "workflow",
  });

  const { data: scan, error: scanError } = await supabase
    .from("website_scans")
    .insert({
      prospect_id: prospectId,
      status: "running",
      pages_requested: settings.max_pages_per_scan,
      scanner_version: SCANNER_VERSION,
    })
    .select("*")
    .single();
  if (scanError || !scan) throw scanError ?? new Error("Scanrecord ontbreekt");

  const crawl = await crawlWebsite({
    url: prospect.website_url,
    maxPages: settings.max_pages_per_scan,
  });

  if (crawl.errorCode && crawl.pages.length === 0) {
    await supabase
      .from("website_scans")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        http_status: crawl.httpStatus,
        ssl_valid: crawl.sslValid,
        error_code: crawl.errorCode,
        error_message: crawl.errorMessage,
        error_type: crawl.errorCode,
        retryable: crawl.retryable ?? true,
        scan_duration_ms: Date.now() - started,
      })
      .eq("id", scan.id);

    const rejectUnreachable = crawl.errorCode !== "WEBSITE_TIMEOUT";
    await supabase
      .from("prospects")
      .update({
        status: rejectUnreachable ? "REJECTED" : "SCAN_FAILED",
        reject_reason: rejectUnreachable ? "website_unreachable" : null,
        last_scan_at: new Date().toISOString(),
        needs_review: true,
        needs_review_reasons: ["scan_failed"],
      })
      .eq("id", prospectId);
    await logActivity(supabase, {
      prospectId,
      eventType: "scan_failed",
      actorType: "workflow",
      oldStatus: "SCANNING",
      newStatus: rejectUnreachable ? "REJECTED" : "SCAN_FAILED",
      metadata: { error_code: crawl.errorCode, message: crawl.errorMessage },
    });
    return { prospectId, scanId: scan.id, status: rejectUnreachable ? "REJECTED" : "SCAN_FAILED" };
  }

  const pageRows = crawl.pages.map((page) => ({
    scan_id: scan.id,
    url: page.url,
    page_type: page.pageType,
    title: page.title,
    meta_description: page.metaDescription,
    http_status: page.httpStatus,
    word_count: page.wordCount,
    has_form: page.hasForm,
    has_phone: page.hasPhone,
    has_email: page.hasEmail,
    has_primary_cta: page.hasPrimaryCta,
    extracted_text: page.extractedText,
  }));

  if (pageRows.length) {
    await supabase.from("scanned_pages").insert(pageRows);
  }

  const formsCount = crawl.pages.filter((page) => page.hasForm).length;
  await supabase
    .from("website_scans")
    .update({
      status: crawl.pages.length ? "completed" : "partial",
      completed_at: new Date().toISOString(),
      pages_requested: settings.max_pages_per_scan,
      pages_scanned: crawl.pages.length,
      broken_links_count: crawl.brokenLinks.length,
      forms_count: formsCount,
      forms_working_count: formsCount,
      http_status: crawl.httpStatus,
      ssl_valid: crawl.sslValid,
      scan_duration_ms: Date.now() - started,
    })
    .eq("id", scan.id);

  await setProspectStatus(supabase, {
    prospectId,
    from: "SCANNING",
    to: "ANALYSING",
    actorType: "workflow",
  });

  const metrics = {
    httpStatus: crawl.httpStatus,
    sslValid: crawl.sslValid,
    brokenLinksCount: crawl.brokenLinks.length,
    formsCount,
    formsWorkingCount: formsCount,
    hasPhone: crawl.pages.some((page) => page.hasPhone),
    hasEmail: crawl.pages.some((page) => page.hasEmail),
    hasPrimaryCta: crawl.pages.some((page) => page.hasPrimaryCta),
    hasContactPage: crawl.pages.some((page) => page.pageType === "contact"),
    pageCount: crawl.pages.length,
    wordCount: crawl.pages.reduce((sum, page) => sum + page.wordCount, 0),
  };

  const scanFindings = findingsFromScan(metrics);
  const quality = qualityFromScan(metrics);
  let findings: FindingInput[] = [...scanFindings];
  let industry: string | null = null;
  let industryConfidence: number | null = null;
  let city: string | null = null;
  let country: string | null = "NL";
  let companySize = null as "1" | "2-5" | "5-30" | "30-100" | "100+" | null;
  let companySizeConfidence: number | null = null;
  let likelyCustomerValue: "low" | "medium" | "high" = "medium";
  let websiteImportance: "low" | "medium" | "high" = "high";
  let aiRecommendation: string | null = null;
  let siteRecentAndHighQuality = false;
  let unsupportedLanguage = false;

  if (settings.ai_enabled && process.env.OPENAI_API_KEY) {
    try {
      const ai = await analyseWithOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        model: settings.ai_model,
        url: prospect.website_url,
        domain: prospect.domain,
        companyName: prospect.company_name,
        pages: crawl.pages.map((page) => ({
          url: page.url,
          pageType: page.pageType,
          title: page.title,
          metaDescription: page.metaDescription,
          wordCount: page.wordCount,
          hasForm: page.hasForm,
          hasPhone: page.hasPhone,
          hasEmail: page.hasEmail,
          hasPrimaryCta: page.hasPrimaryCta,
          textExcerpt: page.extractedText.slice(0, 2500),
        })),
        metrics,
        productFit: crawl.functionality,
      });
      const cost =
        (ai.tokensInput / 1_000_000) * OPENAI_INPUT_PER_MILLION +
        (ai.tokensOutput / 1_000_000) * OPENAI_OUTPUT_PER_MILLION;
      await recordCost(supabase, {
        prospectId,
        scanId: scan.id,
        costType: "ai",
        provider: "openai",
        amount: cost,
        tokensInput: ai.tokensInput,
        tokensOutput: ai.tokensOutput,
      });
      industry = ai.analysis.industry;
      industryConfidence = ai.analysis.industry_confidence;
      city = ai.analysis.city;
      country = ai.analysis.country;
      companySize = ai.analysis.company_size_estimate;
      companySizeConfidence = ai.analysis.company_size_confidence;
      likelyCustomerValue = ai.analysis.likely_customer_value;
      websiteImportance = ai.analysis.website_importance_for_acquisition;
      aiRecommendation = ai.analysis.recommendation;
      siteRecentAndHighQuality = ai.analysis.site_recent_and_high_quality;
      unsupportedLanguage = ai.analysis.unsupported_language;
      quality.visual = ai.analysis.visual_score;
      quality.conversion = ai.analysis.conversion_score;
      quality.content = ai.analysis.content_score;
      findings = [...findings, ...aiFindingsToInput(ai.analysis)];
    } catch (error) {
      await logActivity(supabase, {
        prospectId,
        eventType: "ai_failed",
        actorType: "workflow",
        metadata: {
          error_code: "AI_TIMEOUT",
          message: error instanceof Error ? error.message : "AI failed",
        },
      });
    }
  }

  if (unsupportedLanguage) {
    findings.push({
      type: "OBSERVATION",
      category: "content",
      severity: "important",
      title: "Taal waarschijnlijk niet ondersteund",
      description: "De AI schat dat de site niet in een ondersteunde taal is.",
      confidence: 0.6,
      evidenceType: "ai",
      evidenceReference: "unsupported_language=true",
      createdBy: "agent",
    });
  }

  const decision = calculateOpportunity({
    quality,
    commercial: {
      companySize,
      likelyCustomerValue,
      websiteImportanceForAcquisition: websiteImportance,
    },
    productFit: crawl.functionality,
    findings,
    industryConfidence,
    scanPartial: crawl.pages.length < 2,
    websiteUnreachable: false,
    siteRecentAndHighQuality,
    aiSuggestedStatus: aiRecommendation,
    weights: {
      mobile: settings.weight_mobile,
      conversion: settings.weight_conversion,
      visual: settings.weight_visual,
      technical: settings.weight_technical,
      content: settings.weight_content,
    },
    rules: {
      maxPages: settings.max_pages_product_fit,
      allowBooking: settings.allow_booking,
      allowMultilingual: settings.allow_multilingual,
      allowWebshop: settings.allow_webshop,
    },
    reviewMin: settings.needs_review_score_min,
    reviewMax: settings.needs_review_score_max,
  });

  if (unsupportedLanguage && !decision.overrides.some((item) => item.kind === "rejected")) {
    decision.suggestedStatus = "REJECTED";
    decision.rejectReason = "unsupported_language";
  }

  if (findings.length) {
    await supabase.from("findings").insert(
      findings.map((finding) => ({
        prospect_id: prospectId,
        scan_id: scan.id,
        category: finding.category,
        finding_type: finding.type,
        title: finding.title,
        description: finding.description,
        severity: finding.severity,
        confidence: finding.confidence,
        evidence_type: finding.evidenceType ?? null,
        evidence_reference: finding.evidenceReference ?? null,
        commercial_relevance: finding.commercialRelevance ?? null,
        created_by: finding.createdBy ?? "workflow",
      })),
    );
  }

  await supabase.from("prospect_scores").insert({
    prospect_id: prospectId,
    scan_id: scan.id,
    technical_score: decision.quality.technical,
    mobile_score: decision.quality.mobile,
    conversion_score: decision.quality.conversion,
    visual_score: decision.quality.visual,
    content_score: decision.quality.content,
    commercial_fit_score: decision.commercialFitScore,
    product_fit_score: decision.productFitScore,
    complexity_score: decision.complexityScore,
    opportunity_score: decision.opportunityScore,
    website_improvement_potential: decision.websiteImprovementPotential,
    evidence_quality_score: decision.evidenceQualityScore,
    website_score: decision.websiteScore,
    score_version: SCORE_VERSION,
    breakdown: decision.breakdown,
  });

  await supabase.from("product_fit_checks").insert({
    prospect_id: prospectId,
    scan_id: scan.id,
    has_webshop: crawl.functionality.hasWebshop,
    has_login: crawl.functionality.hasLogin,
    has_booking_system: crawl.functionality.hasBookingSystem,
    has_customer_portal: crawl.functionality.hasCustomerPortal,
    has_complex_integrations: crawl.functionality.hasComplexIntegrations,
    has_multiple_languages: crawl.functionality.hasMultipleLanguages,
    has_large_content_volume: crawl.functionality.hasLargeContentVolume,
    has_multiple_locations: crawl.functionality.hasMultipleLocations,
    has_custom_calculator: crawl.functionality.hasCustomCalculator,
    estimated_page_count: crawl.functionality.estimatedPageCount,
    standard_product_fit: decision.standardProductFit,
    fit_reason: decision.fitReason,
    complexity_score: decision.complexityScore,
  });

  const companyName =
    prospect.company_name ||
    crawl.pages.find((page) => page.pageType === "home")?.title?.split("|")[0]?.trim() ||
    prospect.domain;

  await supabase
    .from("prospects")
    .update({
      company_name: companyName,
      status: decision.suggestedStatus,
      website_score: decision.websiteScore,
      commercial_fit_score: decision.commercialFitScore,
      product_fit_score: decision.productFitScore,
      complexity_score: decision.complexityScore,
      opportunity_score: decision.opportunityScore,
      industry,
      industry_confidence: industryConfidence,
      city,
      country,
      company_size_estimate: companySize,
      company_size_confidence: companySizeConfidence,
      reject_reason: decision.rejectReason,
      needs_review: decision.needsReview,
      needs_review_reasons: decision.needsReviewReasons,
      ai_recommendation: aiRecommendation,
      last_scan_at: new Date().toISOString(),
    })
    .eq("id", prospectId);

  await logActivity(supabase, {
    prospectId,
    eventType: "analysis_completed",
    actorType: "workflow",
    oldStatus: "ANALYSING",
    newStatus: decision.suggestedStatus,
    metadata: {
      opportunity_score: decision.opportunityScore,
      overrides: decision.overrides,
      score_version: SCORE_VERSION,
    },
  });

  return {
    prospectId,
    scanId: scan.id,
    status: decision.suggestedStatus,
    opportunityScore: decision.opportunityScore,
  };
}

async function loadSettings(supabase: SupabaseClient): Promise<AppSettings> {
  const { data } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
  return {
    max_pages_per_scan: data?.max_pages_per_scan ?? 10,
    desktop_viewport_width: data?.desktop_viewport_width ?? 1440,
    desktop_viewport_height: data?.desktop_viewport_height ?? 900,
    mobile_viewport_width: data?.mobile_viewport_width ?? 390,
    mobile_viewport_height: data?.mobile_viewport_height ?? 844,
    scan_timeout_ms: data?.scan_timeout_ms ?? 120000,
    retry_count: data?.retry_count ?? 2,
    weight_mobile: data?.weight_mobile ?? DEFAULT_SCORING_WEIGHTS.mobile,
    weight_conversion: data?.weight_conversion ?? DEFAULT_SCORING_WEIGHTS.conversion,
    weight_visual: data?.weight_visual ?? DEFAULT_SCORING_WEIGHTS.visual,
    weight_technical: data?.weight_technical ?? DEFAULT_SCORING_WEIGHTS.technical,
    weight_content: data?.weight_content ?? DEFAULT_SCORING_WEIGHTS.content,
    max_pages_product_fit: data?.max_pages_product_fit ?? 50,
    allow_booking: data?.allow_booking ?? true,
    allow_multilingual: data?.allow_multilingual ?? true,
    allow_webshop: data?.allow_webshop ?? false,
    ai_model: data?.ai_model ?? "gpt-4.1-mini",
    ai_enabled: data?.ai_enabled ?? true,
    max_scan_cost_usd: Number(data?.max_scan_cost_usd ?? 1.5),
    needs_review_score_min: data?.needs_review_score_min ?? 75,
    needs_review_score_max: data?.needs_review_score_max ?? 85,
  };
}
