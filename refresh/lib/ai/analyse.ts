import OpenAI from "openai";
import { aiAnalysisSchema, type AiAnalysis } from "@/schemas/ai-analysis";
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisUserPrompt } from "@/prompts/analyse";
import type { FindingInput } from "@/types";

export async function analyseWithOpenAI(input: {
  apiKey: string;
  model: string;
  url: string;
  domain: string;
  companyName?: string | null;
  pages: Array<{
    url: string;
    pageType: string;
    title: string | null;
    metaDescription: string | null;
    wordCount: number;
    hasForm: boolean;
    hasPhone: boolean;
    hasEmail: boolean;
    hasPrimaryCta: boolean;
    textExcerpt: string;
  }>;
  metrics: Record<string, unknown>;
  productFit: Record<string, unknown>;
}): Promise<{ analysis: AiAnalysis; tokensInput: number; tokensOutput: number; model: string }> {
  const client = new OpenAI({ apiKey: input.apiKey });
  const completion = await client.chat.completions.create({
    model: input.model,
    temperature: 0.2,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "website_analysis",
        strict: false,
        schema: {
          type: "object",
          additionalProperties: false,
          required: [
            "industry",
            "industry_confidence",
            "city",
            "country",
            "company_size_estimate",
            "company_size_confidence",
            "visual_score",
            "conversion_score",
            "content_score",
            "likely_customer_value",
            "website_importance_for_acquisition",
            "commercial_fit",
            "commercial_fit_reason",
            "language",
            "unsupported_language",
            "site_recent_and_high_quality",
            "recommendation",
            "findings",
          ],
          properties: {
            industry: { type: "string" },
            industry_confidence: { type: "number" },
            city: { type: ["string", "null"] },
            country: { type: ["string", "null"] },
            company_size_estimate: {
              type: ["string", "null"],
              enum: ["1", "2-5", "5-30", "30-100", "100+", null],
            },
            company_size_confidence: { type: "number" },
            visual_score: { type: "number" },
            conversion_score: { type: "number" },
            content_score: { type: "number" },
            likely_customer_value: { type: "string", enum: ["low", "medium", "high"] },
            website_importance_for_acquisition: {
              type: "string",
              enum: ["low", "medium", "high"],
            },
            commercial_fit: { type: "number" },
            commercial_fit_reason: { type: "string" },
            language: { type: "string" },
            unsupported_language: { type: "boolean" },
            site_recent_and_high_quality: { type: "boolean" },
            recommendation: {
              type: "string",
              enum: ["reject", "watchlist", "qualified", "sales_ready", "priority"],
            },
            findings: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: [
                  "type",
                  "category",
                  "severity",
                  "title",
                  "description",
                  "confidence",
                  "evidence_reference",
                ],
                properties: {
                  type: { type: "string", enum: ["FACT", "OBSERVATION", "HYPOTHESIS"] },
                  category: { type: "string" },
                  severity: { type: "string", enum: ["critical", "important", "minor"] },
                  title: { type: "string" },
                  description: { type: "string" },
                  confidence: { type: "number" },
                  evidence_reference: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
    messages: [
      { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
      {
        role: "user",
        content: buildAnalysisUserPrompt({
          url: input.url,
          domain: input.domain,
          companyName: input.companyName,
          pages: input.pages,
          metrics: input.metrics,
          productFit: input.productFit,
        }),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw Object.assign(new Error("Lege AI-response"), { code: "AI_TIMEOUT" });
  }
  const parsed = aiAnalysisSchema.parse(JSON.parse(raw));
  return {
    analysis: parsed,
    tokensInput: completion.usage?.prompt_tokens ?? 0,
    tokensOutput: completion.usage?.completion_tokens ?? 0,
    model: input.model,
  };
}

export function aiFindingsToInput(analysis: AiAnalysis): FindingInput[] {
  return analysis.findings.map((finding) => ({
    type: finding.type,
    category: finding.category,
    severity: finding.severity,
    title: finding.title,
    description: finding.description,
    confidence: finding.confidence,
    evidenceType: "ai",
    evidenceReference: finding.evidence_reference,
    createdBy: "agent" as const,
  }));
}
