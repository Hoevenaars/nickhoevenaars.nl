import type { QualityScores } from "@/types";

export function websiteQualityScore(quality: QualityScores): number {
  const score =
    quality.mobile * 0.25 +
    quality.conversion * 0.25 +
    quality.visual * 0.15 +
    quality.technical * 0.2 +
    quality.content * 0.15;
  return Math.round(clamp(score, 0, 100) * 100) / 100;
}

export function websiteQualityLabel(
  score: number,
): "Poor" | "Weak" | "Average" | "Good" | "Strong" {
  if (score <= 39) return "Poor";
  if (score <= 59) return "Weak";
  if (score <= 74) return "Average";
  if (score <= 89) return "Good";
  return "Strong";
}

export function improvementPotential(
  quality: QualityScores,
  weights: { mobile: number; conversion: number; visual: number; technical: number; content: number },
): { total: number; parts: Record<keyof QualityScores, number> } {
  const parts = {
    mobile: weightScore(weights.mobile, quality.mobile),
    conversion: weightScore(weights.conversion, quality.conversion),
    visual: weightScore(weights.visual, quality.visual),
    technical: weightScore(weights.technical, quality.technical),
    content: weightScore(weights.content, quality.content),
  };
  const total = Object.values(parts).reduce((sum, value) => sum + value, 0);
  return { total: Math.round(total * 100) / 100, parts };
}

function weightScore(maxPoints: number, quality: number): number {
  return Math.round(maxPoints * (1 - clamp(quality, 0, 100) / 100) * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
