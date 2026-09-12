import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyPageType } from "../lib/browser/classify-page";
import { detectFunctionality } from "../lib/browser/detect-functionality";

describe("classifyPageType", () => {
  it("maps common Dutch and English paths", () => {
    assert.equal(classifyPageType("https://example.com/", "Home"), "home");
    assert.equal(classifyPageType("https://example.com/over-ons", "Over ons"), "about");
    assert.equal(classifyPageType("https://example.com/diensten", "Diensten"), "services");
    assert.equal(classifyPageType("https://example.com/contact", "Contact"), "contact");
    assert.equal(classifyPageType("https://example.com/blog/hello", "Blog"), "other");
  });
});

describe("detectFunctionality", () => {
  it("detects a Shopify storefront", () => {
    const result = detectFunctionality({
      html: '<script src="cdn.shopify.com/storefront"></script><a href="/cart">Winkelwagen</a>',
      urls: ["https://shop.example.com/", "https://shop.example.com/products/kaas"],
      text: "Add to cart Checkout",
    });
    assert.equal(result.hasWebshop, true);
  });

  it("does not flag a simple brochure site", () => {
    const result = detectFunctionality({
      html: "<h1>Loodgieter Janssen</h1><a href='/contact'>Offerte</a>",
      urls: ["https://janssen.nl/", "https://janssen.nl/diensten", "https://janssen.nl/contact"],
      text: "Al 20 jaar ontstoppen in Utrecht. Bel ons.",
    });
    assert.equal(result.hasWebshop, false);
    assert.equal(result.hasLogin, false);
    assert.equal(result.hasCustomerPortal, false);
  });
});
