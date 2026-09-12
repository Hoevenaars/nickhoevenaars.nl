const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

export type NormalizedUrl = {
  href: string;
  origin: string;
  hostname: string;
  domain: string;
  protocol: "https:" | "http:";
};

export class UrlValidationError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "UrlValidationError";
  }
}

export function extractRegistrableDomain(hostname: string): string {
  const host = hostname.replace(/\.$/, "").toLowerCase();
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;
  const last = parts[parts.length - 1];
  const second = parts[parts.length - 2];
  const compoundTlds = new Set([
    "co.uk",
    "org.uk",
    "ac.uk",
    "gov.uk",
    "co.nz",
    "com.au",
    "net.au",
    "co.za",
    "com.br",
  ]);
  const tail = `${second}.${last}`;
  if (compoundTlds.has(tail) && parts.length >= 3) {
    return `${parts[parts.length - 3]}.${tail}`;
  }
  return tail;
}

export function normalizeWebsiteUrl(input: string): NormalizedUrl {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new UrlValidationError("INVALID_URL", "URL is leeg.");
  }

  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new UrlValidationError("INVALID_URL", "URL is ongeldig.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new UrlValidationError("INVALID_URL", "Alleen http en https zijn toegestaan.");
  }

  if (parsed.protocol === "http:") {
    parsed.protocol = "https:";
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname.includes(".")) {
    throw new UrlValidationError("INVALID_URL", "Domein is ongeldig.");
  }
  if (BLOCKED_HOSTS.has(hostname) || hostname.endsWith(".local")) {
    throw new UrlValidationError("INVALID_URL", "Lokale adressen zijn niet toegestaan.");
  }

  parsed.hash = "";
  parsed.username = "";
  parsed.password = "";

  return {
    href: parsed.toString(),
    origin: parsed.origin,
    hostname,
    domain: extractRegistrableDomain(hostname),
    protocol: "https:",
  };
}

export function isSameSite(link: string, origin: string): boolean {
  try {
    const url = new URL(link, origin);
    const base = new URL(origin);
    return extractRegistrableDomain(url.hostname) === extractRegistrableDomain(base.hostname);
  } catch {
    return false;
  }
}
