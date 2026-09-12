import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeWebsiteUrl, extractRegistrableDomain } from "../lib/validation/url";

describe("normalizeWebsiteUrl", () => {
  it("adds https and strips credentials", () => {
    const result = normalizeWebsiteUrl("Bakkerij-Voorbeeld.nl/contact");
    assert.equal(result.protocol, "https:");
    assert.equal(result.domain, "bakkerij-voorbeeld.nl");
    assert.equal(result.hostname, "bakkerij-voorbeeld.nl");
    assert.match(result.href, /^https:\/\/bakkerij-voorbeeld.nl\/contact/i);
  });

  it("upgrades http to https", () => {
    const result = normalizeWebsiteUrl("http://example.com");
    assert.equal(result.protocol, "https:");
    assert.equal(result.href, "https://example.com/");
  });

  it("rejects empty and local addresses", () => {
    assert.throws(() => normalizeWebsiteUrl(" "), /leeg/);
    assert.throws(() => normalizeWebsiteUrl("localhost"));
    assert.throws(() => normalizeWebsiteUrl("http://127.0.0.1"));
  });
});

describe("extractRegistrableDomain", () => {
  it("handles compound TLDs", () => {
    assert.equal(extractRegistrableDomain("shop.example.co.uk"), "example.co.uk");
    assert.equal(extractRegistrableDomain("www.studio.nl"), "studio.nl");
  });
});
