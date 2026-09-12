const PHONE_RE = /(?:\+31|0)[\s-]?(?:\d[\s-]?){8,10}\d/g;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const HREF_RE = /href\s*=\s*["']([^"']+)["']/gi;

const CTA_WORDS =
  /(offerte|contact|bel ons|plan een|afspraak|neem contact|call us|get in touch|vraag aan)/i;

export function extractAttribute(html: string, attr: string): string | null {
  const match = html.match(new RegExp(`<meta[^>]+${attr}=["']([^"']+)["'][^>]*>`, "i"));
  if (match) return decode(match[1]);
  const reverse = html.match(
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["'][^"']+["'][^>]*>`, "i"),
  );
  return reverse ? decode(reverse[1]) : null;
}

export function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? decode(match[1]).trim() : null;
}

export function extractVisibleText(html: string): string {
  const without = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return decode(without).replace(/\s+/g, " ").trim();
}

export function extractLinks(html: string, baseUrl: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(HREF_RE)) {
    const href = match[1];
    if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) {
      continue;
    }
    try {
      const url = new URL(href, baseUrl);
      url.hash = "";
      if (!isCrawlable(url.toString())) continue;
      found.add(url.toString());
    } catch {
      /* ignore */
    }
  }
  return [...found];
}

export function isCrawlable(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return !/\.(png|jpe?g|gif|webp|svg|ico|css|js|mjs|woff2?|ttf|eot|pdf|zip|mp4|mp3)$/i.test(path);
  } catch {
    return false;
  }
}

export function extractEmails(text: string): string[] {
  return unique((text.match(EMAIL_RE) ?? []).map((item) => item.toLowerCase()));
}

export function extractPhones(text: string): string[] {
  return unique(text.match(PHONE_RE) ?? []);
}

export function hasForm(html: string): boolean {
  return /<form[\s>]/i.test(html);
}

export function hasPrimaryCta(html: string, text: string): boolean {
  if (CTA_WORDS.test(text)) return true;
  return /<(a|button)[^>]*>[^<]*(offerte|contact|bel|afspraak|plan)[^<]*<\/(a|button)>/i.test(html);
}

export function wordCount(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function decode(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
