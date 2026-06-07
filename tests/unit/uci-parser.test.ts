import { describe, expect, it } from "vitest";

import { formatScore, parseBestMove, parseInfoLine, scoreForWhite, scoreToCentipawns } from "@/lib/engine/uci-parser";

describe("UCI parser", () => {
  it("parses centipawn info lines", () => {
    const line = parseInfoLine("info depth 10 multipv 1 score cp 42 pv e2e4 e7e5");

    expect(line).toEqual({
      depth: 10,
      multiPv: 1,
      score: { type: "cp", value: 42 },
      pv: ["e2e4", "e7e5"]
    });
  });

  it("parses mate scores and best move", () => {
    const line = parseInfoLine("info depth 12 score mate 3 pv e2e4");

    expect(line?.score).toEqual({ type: "mate", value: 3 });
    expect(formatScore({ type: "mate", value: 3 })).toBe("Mate 3");
    expect(parseBestMove("bestmove e2e4 ponder e7e5")).toEqual({ bestMove: "e2e4", ponder: "e7e5" });
  });

  it("normalizes mate scores into large centipawn values", () => {
    expect(scoreToCentipawns({ type: "mate", value: 2 })).toBeGreaterThan(90000);
  });

  it("normalizes engine score to white perspective by FEN side to move", () => {
    expect(scoreForWhite({ type: "cp", value: 40 }, "8/8/8/8/8/8/8/8 b - - 0 1")).toEqual({
      type: "cp",
      value: -40
    });
  });
});
