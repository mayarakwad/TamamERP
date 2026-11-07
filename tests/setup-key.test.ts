import { describe, expect, it } from "vitest";
import { generateSetupKey, hashSetupKey, normalizeSetupKey, setupKeyMatches } from "@/lib/system/setup-key";

describe("setup key", () => {
  it("looks like ABCD-EFGH-JKLM without confusable characters", () => {
    for (let i = 0; i < 50; i++) {
      const key = generateSetupKey();
      expect(key).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    }
  });
  it("accepts the key typed in lowercase, without dashes or with spaces", () => {
    const key = "K7QF-9XZ2-M4PD";
    const hash = hashSetupKey(key);
    expect(normalizeSetupKey("k7qf 9xz2 m4pd")).toBe(key);
    expect(setupKeyMatches("k7qf9xz2m4pd", hash)).toBe(true);
    expect(setupKeyMatches(" K7QF-9XZ2-M4PD ", hash)).toBe(true);
  });
  it("rejects wrong keys and missing hashes", () => {
    const hash = hashSetupKey("K7QF-9XZ2-M4PD");
    expect(setupKeyMatches("K7QF-9XZ2-M4PE", hash)).toBe(false);
    expect(setupKeyMatches("K7QF-9XZ2-M4PD", null)).toBe(false);
    expect(setupKeyMatches("", hash)).toBe(false);
  });
});
