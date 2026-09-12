import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isAllowedEmail, parseAllowlist } from "../lib/auth/allowlist";

describe("allowlist", () => {
  it("parses comma-separated emails", () => {
    assert.deepEqual(parseAllowlist("A@x.nl, b@x.nl"), ["a@x.nl", "b@x.nl"]);
  });

  it("allows anyone when the list is empty", () => {
    assert.equal(isAllowedEmail("anyone@example.com", []), true);
  });

  it("rejects unknown emails when the list is set", () => {
    assert.equal(isAllowedEmail("other@example.com", ["nhoevenaars@gmail.com"]), false);
    assert.equal(isAllowedEmail("nhoevenaars@gmail.com", ["nhoevenaars@gmail.com"]), true);
  });
});
