import type { CommercialFitInput, CompanySizeBucket, ValueLevel } from "@/types";

const SIZE_POINTS: Record<CompanySizeBucket, number> = {
  "1": 2,
  "2-5": 5,
  "5-30": 10,
  "30-100": 7,
  "100+": 2,
};

const VALUE_POINTS: Record<ValueLevel, number> = {
  low: 2,
  medium: 5,
  high: 10,
};

export function commercialFitScore(input: CommercialFitInput): {
  score: number;
  breakdown: {
    companySize: number;
    likelyCustomerValue: number;
    websiteImportance: number;
  };
} {
  const companySize = input.companySize ? SIZE_POINTS[input.companySize] : 4;
  const likelyCustomerValue = input.likelyCustomerValue
    ? VALUE_POINTS[input.likelyCustomerValue]
    : 4;
  const websiteImportance = input.websiteImportanceForAcquisition
    ? VALUE_POINTS[input.websiteImportanceForAcquisition]
    : 4;

  const score = Math.min(
    30,
    companySize + likelyCustomerValue + websiteImportance,
  );

  return {
    score,
    breakdown: {
      companySize,
      likelyCustomerValue,
      websiteImportance,
    },
  };
}
