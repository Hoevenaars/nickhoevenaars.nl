import { z } from "zod";
import {
  FINDING_CATEGORIES,
  FINDING_SEVERITIES,
  FINDING_TYPES,
  VALUE_LEVELS,
  COMPANY_SIZE_BUCKETS,
} from "@/types";

export const aiFindingSchema = z.object({
  type: z.enum(FINDING_TYPES),
  category: z.enum(FINDING_CATEGORIES),
  severity: z.enum(FINDING_SEVERITIES),
  title: z.string().min(3).max(160),
  description: z.string().min(8).max(800),
  confidence: z.number().min(0).max(1),
  evidence_reference: z.string().min(1).max(500),
});

export const aiAnalysisSchema = z.object({
  industry: z.string().min(2).max(80),
  industry_confidence: z.number().min(0).max(1),
  city: z.string().nullable(),
  country: z.string().nullable(),
  company_size_estimate: z.enum(COMPANY_SIZE_BUCKETS).nullable(),
  company_size_confidence: z.number().min(0).max(1),
  visual_score: z.number().min(0).max(100),
  conversion_score: z.number().min(0).max(100),
  content_score: z.number().min(0).max(100),
  likely_customer_value: z.enum(VALUE_LEVELS),
  website_importance_for_acquisition: z.enum(VALUE_LEVELS),
  commercial_fit: z.number().min(0).max(30),
  commercial_fit_reason: z.string().min(8).max(600),
  language: z.string().min(2).max(16),
  unsupported_language: z.boolean(),
  site_recent_and_high_quality: z.boolean(),
  recommendation: z.enum(["reject", "watchlist", "qualified", "sales_ready", "priority"]),
  findings: z.array(aiFindingSchema).max(20),
});

export type AiAnalysis = z.infer<typeof aiAnalysisSchema>;
