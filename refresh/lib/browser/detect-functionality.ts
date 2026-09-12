import type { ProductFitSignals } from "@/types";

export type FunctionalityEvidence = ProductFitSignals & {
  evidence: Record<keyof ProductFitSignals, string[]>;
};

const empty = (): FunctionalityEvidence => ({
  hasWebshop: false,
  hasLogin: false,
  hasBookingSystem: false,
  hasCustomerPortal: false,
  hasComplexIntegrations: false,
  hasMultipleLanguages: false,
  hasLargeContentVolume: false,
  hasMultipleLocations: false,
  hasCustomCalculator: false,
  estimatedPageCount: 0,
  evidence: {
    hasWebshop: [],
    hasLogin: [],
    hasBookingSystem: [],
    hasCustomerPortal: [],
    hasComplexIntegrations: [],
    hasMultipleLanguages: [],
    hasLargeContentVolume: [],
    hasMultipleLocations: [],
    hasCustomCalculator: [],
    estimatedPageCount: [],
  },
});

export function detectFunctionality(input: {
  html: string;
  urls: string[];
  text: string;
  estimatedPageCount?: number;
}): FunctionalityEvidence {
  const result = empty();
  const blob = `${input.html}\n${input.urls.join("\n")}\n${input.text}`.toLowerCase();
  const paths = input.urls.map((url) => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return url.toLowerCase();
    }
  });

  const add = (key: keyof ProductFitSignals, hit: string) => {
    if (key === "estimatedPageCount") return;
    result[key] = true as never;
    result.evidence[key].push(hit);
  };

  if (
    /cdn\.shopify|woocommerce|wp-content\/plugins\/woocommerce|magento|bigcommerce|snipcart|shopware/.test(blob) ||
    paths.some((path) => /\/(cart|winkelwagen|checkout|product|products|collectie)\b/.test(path)) ||
    /add to cart|in winkelwagen|naar de kassa/.test(blob)
  ) {
    add("hasWebshop", "storefront or cart signals");
  }

  if (
    /klantportaal|customer portal|\/portal\b|mijn-omgeving/.test(blob) ||
    paths.some((path) => /\/(portal|dashboard|klant)\b/.test(path))
  ) {
    add("hasCustomerPortal", "portal path or wording");
  }

  if (
    /<input[^>]+type=["']password["']/.test(input.html.toLowerCase()) ||
    paths.some((path) => /\/(login|signin|account|mijn-account|wp-login)\b/.test(path))
  ) {
    add("hasLogin", "password field or account path");
  }

  if (
    /calendly\.com|simplybook|salonized|amenitiz|acuityscheduling|bokun\.io/.test(blob) ||
    paths.some((path) => /\/(afspraak|boeking|booking|reserveren)\b/.test(path))
  ) {
    add("hasBookingSystem", "booking widget or path");
  }

  if (
    /salesforce|hubspot analytics|exact online|afassoftware|zapier|segment\.com/.test(blob) ||
    /iframe[^>]+(booking|portal|app)/.test(blob)
  ) {
    add("hasComplexIntegrations", "third-party business app");
  }

  if (
    /hreflang|lang=/.test(blob) &&
    (/\/(en|de|fr|nl)\b/.test(paths.join(" ")) || /taal|language selector|lang-switch/.test(blob))
  ) {
    add("hasMultipleLanguages", "language switcher or hreflang");
  }

  if ((input.estimatedPageCount ?? input.urls.length) > 40 || input.text.length > 80000) {
    add("hasLargeContentVolume", "page or text volume");
  }

  if ((input.text.match(/vestiging|locaties|onze locatie/gi) ?? []).length >= 3) {
    add("hasMultipleLocations", "multiple location mentions");
  }

  if (/calculator|offerte berekenen|prijs berekenen/.test(blob) && /<input/.test(blob)) {
    add("hasCustomCalculator", "interactive calculator");
  }

  result.estimatedPageCount = input.estimatedPageCount ?? Math.max(input.urls.length, 1);
  result.evidence.estimatedPageCount = [`${result.estimatedPageCount} urls`];
  return result;
}
