import { describe, expect, it } from "vitest";

import { getMinimumAnalysisLineCount } from "@/lib/engine/stockfish-client";

describe("Stockfish analysis line publishing", () => {
  it("caps required candidate lines to the legal move count", () => {
    const fenAfterBishopCapture = "r1bqkbnr/pppp1Bpp/2n5/4p3/4P3/8/PPPP1PPP/RNBQK1NR b KQkq - 0 3";

    expect(getMinimumAnalysisLineCount(fenAfterBishopCapture, 3)).toBe(2);
  });

  it("keeps the normal three-line requirement when at least three legal moves exist", () => {
    expect(getMinimumAnalysisLineCount("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", 3)).toBe(3);
  });
});
