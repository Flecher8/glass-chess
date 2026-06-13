import { describe, expect, it } from "vitest";

import { classifyMove } from "@/lib/analysis/move-classification";
import type { GameMove } from "@/lib/chess/types";
import type { EngineAnalysisResult } from "@/lib/engine/types";

const move: GameMove = {
  ply: 1,
  san: "e4",
  lan: "e2e4",
  uci: "e2e4",
  color: "w",
  from: "e2",
  to: "e4",
  piece: "p",
  before: "before",
  after: "after"
};

function result(bestMove: string, cp: number, fen = "8/8/8/8/8/8/8/8 w - - 0 1"): EngineAnalysisResult {
  return {
    fen,
    bestMove,
    lines: [{ depth: 10, multiPv: 1, score: { type: "cp", value: cp }, pv: [bestMove] }]
  };
}

describe("move classification", () => {
  it("marks engine top move as best", () => {
    const review = classifyMove(move, result("e2e4", 34), result("e7e5", -30, "8/8/8/8/8/8/8/8 b - - 0 1"));

    expect(review.classification).toBe("Best");
  });

  it("marks moderate losses as inaccuracies", () => {
    const review = classifyMove(move, result("g1f3", 75), result("e7e5", 10, "8/8/8/8/8/8/8/8 b - - 0 1"));

    expect(review.classification).toBe("Inaccuracy");
  });

  it("marks one-pawn losses as mistakes", () => {
    const review = classifyMove(move, result("g1f3", 90), result("e7e5", 50, "8/8/8/8/8/8/8/8 b - - 0 1"));

    expect(review.classification).toBe("Mistake");
  });

  it("marks large losses as blunders", () => {
    const review = classifyMove(move, result("g1f3", 300), result("e7e5", 50, "8/8/8/8/8/8/8/8 b - - 0 1"));

    expect(review.classification).toBe("Blunder");
  });

  it("detects missed wins", () => {
    const review = classifyMove(move, result("g1f3", 600), result("e7e5", -100, "8/8/8/8/8/8/8/8 b - - 0 1"));

    expect(review.classification).toBe("Miss");
  });

  it("does not mark ordinary top moves as brilliant", () => {
    const review = classifyMove(move, result("e2e4", 0), result("e7e5", -80, "8/8/8/8/8/8/8/8 b - - 0 1"));

    expect(review.classification).toBe("Best");
  });

  it("marks best sacrifice-like moves with improved evaluation as brilliant", () => {
    const sacrificeMove: GameMove = {
      ...move,
      san: "Nd5",
      lan: "f4d5",
      uci: "f4d5",
      from: "f4",
      to: "d5",
      piece: "n",
      before: "4k3/8/2p5/8/5N2/8/8/4K3 w - - 0 1",
      after: "4k3/8/2p5/3N4/8/8/8/4K3 b - - 1 1"
    };

    const review = classifyMove(
      sacrificeMove,
      result("f4d5", 0, sacrificeMove.before),
      result("c6d5", -80, sacrificeMove.after)
    );

    expect(review.classification).toBe("Brilliant");
  });
});
