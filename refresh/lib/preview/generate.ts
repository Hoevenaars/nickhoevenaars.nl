import type { DesignProfile, FindingInput } from "@/types";

export type PreviewContent = {
  companyName: string;
  tagline: string;
  hero: string;
  cta: string;
  about: string;
  services: string[];
  trust: string;
  structure: string[];
  issues: Array<{ title: string; type: string; severity: string }>;
  designProfile: DesignProfile;
  components: {
    hero: "split" | "centered" | "photo";
    services: "grid" | "list" | "cards";
    about: "story" | "stats";
    trust: "logos" | "quote";
    reviews: "cards" | "single";
    cta: "banner" | "card";
    contact: "split" | "simple";
    footer: "compact" | "full";
  };
};

const PROFILE_COMPONENTS: Record<DesignProfile, PreviewContent["components"]> = {
  modern: {
    hero: "split",
    services: "grid",
    about: "stats",
    trust: "logos",
    reviews: "cards",
    cta: "banner",
    contact: "split",
    footer: "compact",
  },
  warm: {
    hero: "photo",
    services: "cards",
    about: "story",
    trust: "quote",
    reviews: "single",
    cta: "card",
    contact: "simple",
    footer: "full",
  },
  premium: {
    hero: "centered",
    services: "list",
    about: "story",
    trust: "logos",
    reviews: "cards",
    cta: "banner",
    contact: "split",
    footer: "compact",
  },
};

export function buildPreviewContent(input: {
  companyName: string;
  industry?: string | null;
  city?: string | null;
  pages: Array<{ pageType: string; title: string | null; extractedText: string }>;
  findings: FindingInput[] | Array<{ title: string; finding_type?: string; type?: string; severity: string }>;
  profile?: DesignProfile;
}): PreviewContent {
  const profile = input.profile ?? pickProfile(input.industry);
  const home = input.pages.find((page) => page.pageType === "home");
  const aboutPage = input.pages.find((page) => page.pageType === "about");
  const servicesPage = input.pages.find((page) => page.pageType === "services");
  const location = input.city ? ` in ${input.city}` : "";
  const industry = input.industry ?? "lokaal bedrijf";
  const services = extractServices(servicesPage?.extractedText || home?.extractedText || "");
  const issues = input.findings.slice(0, 6).map((finding) => {
    const record = finding as { title: string; type?: string; finding_type?: string; severity: string };
    return {
      title: record.title,
      type: record.finding_type ?? record.type ?? "FACT",
      severity: record.severity,
    };
  });

  return {
    companyName: input.companyName,
    tagline: `Duidelijker, sneller en klaar voor nieuwe aanvragen${location}.`,
    hero: `${input.companyName} helpt klanten met ${industry.toLowerCase()}. Deze preview toont een strakkere homepage met één duidelijke belofte en een zichtbare contactactie.`,
    cta: "Vraag een gesprek aan",
    about:
      firstSentences(aboutPage?.extractedText || home?.extractedText || "", 2) ||
      `${input.companyName} is een ${industry.toLowerCase()} dat online duidelijker gevonden en begrepen wil worden.`,
    services,
    trust: "Heldere belofte, korte paden naar contact, geen ruis op mobiel.",
    structure: ["Home", "Diensten", "Over", "Contact"],
    issues,
    designProfile: profile,
    components: PROFILE_COMPONENTS[profile],
  };
}

export function qaPreview(content: PreviewContent): { status: "pass" | "fail"; score: number; notes: string[] } {
  const notes: string[] = [];
  if (!content.companyName) notes.push("Bedrijfsnaam ontbreekt");
  if (!content.cta) notes.push("CTA ontbreekt");
  if (content.structure.length < 3) notes.push("Structuur te kort");
  if (content.services.length < 2) notes.push("Te weinig diensten");
  const blob = JSON.stringify(content).toLowerCase();
  if (blob.includes("lorem") || blob.includes("todo") || blob.includes("placeholder")) {
    notes.push("Placeholder-tekst gevonden");
  }
  const score = Math.max(0, 100 - notes.length * 20);
  return { status: notes.length ? "fail" : "pass", score, notes };
}

function pickProfile(industry?: string | null): DesignProfile {
  const value = (industry ?? "").toLowerCase();
  if (/advocaat|notaris|architect|finance|accountant/.test(value)) return "premium";
  if (/coach|salon|zorg|bakker|horeca|fotograaf/.test(value)) return "warm";
  return "modern";
}

function extractServices(text: string): string[] {
  const lines = text
    .split(/[\.!\n]/)
    .map((line) => line.trim())
    .filter((line) => line.length > 12 && line.length < 80);
  const unique = [...new Set(lines)].slice(0, 3);
  if (unique.length >= 2) return unique;
  return ["Advies op locatie", "Vaste bereikbaarheid", "Duidelijke opvolging na contact"];
}

function firstSentences(text: string, count: number): string {
  return text
    .split(/(?<=\.)\s+/)
    .slice(0, count)
    .join(" ")
    .trim();
}
