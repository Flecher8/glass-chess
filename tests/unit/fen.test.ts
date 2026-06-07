import { describe, expect, it } from "vitest";

import { STARTING_FEN, loadFen } from "@/lib/chess/fen";

describe("FEN loading", () => {
  it("accepts a valid FEN", () => {
    const result = loadFen(STARTING_FEN);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(STARTING_FEN);
    }
  });

  it("rejects an invalid FEN", () => {
    const result = loadFen("8/8/8/8/8/8/8/8 w - - 0 1");

    expect(result.ok).toBe(false);
  });
});
