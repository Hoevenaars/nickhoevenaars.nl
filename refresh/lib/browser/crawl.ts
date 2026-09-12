import { isSameSite } from "@/lib/validation/url";
import { classifyPageType } from "./classify-page";
import { detectFunctionality } from "./detect-functionality";
import {
  extractEmails,
  extractLinks,
  extractPhones,
  extractTitle,
  extractVisibleText,
  hasForm,
  hasPrimaryCta,
  wordCount,
} from "./extract";
import type { PageType } from "@/types";

export type CrawledPage = {
  url: string;
  pageType: PageType;
  title: string | null;
  metaDescription: string | null;
  httpStatus: number | null;
  wordCount: number;
  hasForm: boolean;
  hasPhone: boolean;
  hasEmail: boolean;
  hasPrimaryCta: boolean;
  extractedText: string;
  desktopScreenshotUrl?: string | null;
  mobileScreenshotUrl?: string | null;
};

export type CrawlResult = {
  homepageUrl: string;
  httpStatus: number | null;
  sslValid: boolean | null;
  pages: CrawledPage[];
  brokenLinks: Array<{ url: string; status: number | null }>;
  allInternalLinks: string[];
  functionality: ReturnType<typeof detectFunctionality>;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
};

const FETCH_TIMEOUT_MS = 12000;

export async function crawlWebsite(input: {
  url: string;
  maxPages: number;
}): Promise<CrawlResult> {
  const homepage = await fetchPage(input.url);
  if (!homepage.ok && (homepage.status === 0 || homepage.errorCode)) {
    return {
      homepageUrl: input.url,
      httpStatus: homepage.status,
      sslValid: homepage.sslValid,
      pages: [],
      brokenLinks: [],
      allInternalLinks: [],
      functionality: detectFunctionality({ html: "", urls: [input.url], text: "" }),
      errorCode: homepage.errorCode ?? "WEBSITE_TIMEOUT",
      errorMessage: homepage.errorMessage ?? "Website niet bereikbaar",
      retryable: homepage.retryable ?? true,
    };
  }

  const html = homepage.body ?? "";
  const origin = new URL(homepage.finalUrl ?? input.url).origin;
  const internal = extractLinks(html, homepage.finalUrl ?? input.url).filter((link) =>
    isSameSite(link, origin),
  );
  const ranked = rankLinks(internal, homepage.finalUrl ?? input.url).slice(0, input.maxPages);
  const uniqueTargets = uniqueUrls([homepage.finalUrl ?? input.url, ...ranked]).slice(
    0,
    input.maxPages,
  );

  const pages: CrawledPage[] = [];
  const combinedHtml: string[] = [html];
  const combinedText: string[] = [];
  const broken: Array<{ url: string; status: number | null }> = [];

  for (const target of uniqueTargets) {
    const page = target === (homepage.finalUrl ?? input.url) ? homepage : await fetchPage(target);
    if (!page.body) {
      if (page.status && page.status >= 400) broken.push({ url: target, status: page.status });
      continue;
    }
    combinedHtml.push(page.body);
    const text = extractVisibleText(page.body);
    combinedText.push(text);
    const title = extractTitle(page.body);
    pages.push({
      url: page.finalUrl ?? target,
      pageType: classifyPageType(page.finalUrl ?? target, title ?? ""),
      title,
      metaDescription: extractMetaDescription(page.body),
      httpStatus: page.status,
      wordCount: wordCount(text),
      hasForm: hasForm(page.body),
      hasPhone: extractPhones(text).length > 0,
      hasEmail: extractEmails(text).length > 0,
      hasPrimaryCta: hasPrimaryCta(page.body, text),
      extractedText: text.slice(0, 20000),
    });
    if (page.status && page.status >= 400) {
      broken.push({ url: target, status: page.status });
    }
  }

  const extraChecks = internal
    .filter((link) => !uniqueTargets.includes(link))
    .slice(0, 12);
  for (const link of extraChecks) {
    const result = await fetchPage(link, { method: "HEAD" });
    if (result.status && result.status >= 400) {
      broken.push({ url: link, status: result.status });
    }
  }

  const htmlBlob = combinedHtml.join("\n");
  const textBlob = combinedText.join("\n");
  return {
    homepageUrl: homepage.finalUrl ?? input.url,
    httpStatus: homepage.status,
    sslValid: homepage.sslValid,
    pages,
    brokenLinks: broken,
    allInternalLinks: uniqueUrls(internal),
    functionality: detectFunctionality({
      html: htmlBlob,
      urls: uniqueUrls([input.url, ...internal]),
      text: textBlob,
      estimatedPageCount: Math.max(internal.length, pages.length),
    }),
  };
}

function extractMetaDescription(html: string): string | null {
  const named = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  );
  if (named) return named[1];
  const reverse = html.match(
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["'][^>]*>/i,
  );
  return reverse ? reverse[1] : null;
}

async function fetchPage(
  url: string,
  options: { method?: "GET" | "HEAD" } = {},
): Promise<{
  ok: boolean;
  status: number | null;
  body: string | null;
  finalUrl: string | null;
  sslValid: boolean | null;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "WebsiteRefreshBot/1.0 (+https://nickhoevenaars.nl)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    const body = options.method === "HEAD" ? null : await response.text();
    return {
      ok: response.ok,
      status: response.status,
      body,
      finalUrl: response.url,
      sslValid: new URL(response.url).protocol === "https:",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fetch failed";
    const isAbort = error instanceof Error && error.name === "AbortError";
    const ssl = /certificate|ssl|tls/i.test(message);
    return {
      ok: false,
      status: 0,
      body: null,
      finalUrl: url,
      sslValid: ssl ? false : null,
      errorCode: ssl ? "SSL_ERROR" : isAbort ? "WEBSITE_TIMEOUT" : "WEBSITE_TIMEOUT",
      errorMessage: message,
      retryable: !ssl,
    };
  } finally {
    clearTimeout(timer);
  }
}

function rankLinks(links: string[], homepage: string): string[] {
  const preferred = [/over/, /about/, /dienst/, /service/, /contact/, /team/, /project/, /prijs/];
  return [...links].sort((a, b) => score(b, homepage, preferred) - score(a, homepage, preferred));
}

function score(url: string, homepage: string, preferred: RegExp[]): number {
  if (url === homepage) return 100;
  try {
    const path = new URL(url).pathname.toLowerCase();
    const hit = preferred.findIndex((pattern) => pattern.test(path));
    return hit === -1 ? 1 : 80 - hit;
  } catch {
    return 0;
  }
}

function uniqueUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const url of urls) {
    const normalized = url.replace(/\/$/, "") || url;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(url);
  }
  return result;
}
