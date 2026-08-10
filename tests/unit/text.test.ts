import { describe, expect, it } from "vitest";

import { normalizeDisplayText } from "@/lib/text";

describe("normalizeDisplayText", () => {
  it("normalizes whitespace and removes control and directionality characters", () => {
    expect(normalizeDisplayText("  Jesse\n\u202E  Guest\u0000 ", 100)).toBe(
      "Jesse Guest",
    );
  });

  it("bounds text by Unicode code points", () => {
    expect(normalizeDisplayText("🎉".repeat(10), 3)).toBe("🎉🎉🎉");
  });

  it("rejects an invalid bound", () => {
    expect(() => normalizeDisplayText("test", 0)).toThrow(RangeError);
  });
});
