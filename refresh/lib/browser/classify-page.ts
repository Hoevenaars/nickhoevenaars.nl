import type { PageType } from "@/types";

const RULES: Array<{ type: PageType; pattern: RegExp }> = [
  { type: "about", pattern: /(over-ons|overons|about|wie-zijn|ons-verhaal|team)/i },
  { type: "team", pattern: /(team|medewerkers|wie-zijn-wij|our-team)/i },
  { type: "services", pattern: /(diensten|services|aanbod|werkzaamheden|expertise)/i },
  { type: "contact", pattern: /(contact|afspraak|offerte|contacteer)/i },
  { type: "pricing", pattern: /(prijzen|pricing|tarieven|kosten)/i },
  { type: "projects", pattern: /(projecten|portfolio|realisaties|cases|werk)/i },
];

export function classifyPageType(url: string, title = ""): PageType {
  let pathname = "/";
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url;
  }
  const haystack = `${pathname} ${title}`.toLowerCase();
  if (pathname === "/" || pathname === "" || /^\/(index|home)?\/?$/.test(pathname)) {
    return "home";
  }
  for (const rule of RULES) {
    if (rule.pattern.test(haystack)) return rule.type;
  }
  return "other";
}
