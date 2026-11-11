import { describe, expect, it } from "vitest";
import { optimizationHints } from "@/lib/dashboard/hints";

describe("optimization hints", () => {
  it("shows a hint only after the category crosses its threshold", () => {
    expect(optimizationHints([{ category: "tool_definitions", tokens: 40 }], 100)).toEqual([]);
    expect(optimizationHints([{ category: "tool_definitions", tokens: 41 }], 100)).toEqual([
      "Tool definitions are over 40% of input.",
    ]);
    expect(optimizationHints([{ category: "history", tokens: 50 }], 100)).toEqual([]);
    expect(optimizationHints([{ category: "history", tokens: 51 }], 100)).toEqual(["History is over 50% of input."]);
    expect(
      optimizationHints(
        [
          { category: "tool_definitions", tokens: 45 },
          { category: "history", tokens: 55 },
        ],
        100,
      ),
    ).toEqual(["Tool definitions are over 40% of input.", "History is over 50% of input."]);
  });
});
