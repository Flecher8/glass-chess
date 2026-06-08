import { describe, expect, it } from "vitest";

import {
  buildCriticalMoments,
  buildPuzzleCandidates,
  buildRetryTargets,
  buildReviewSummary,
  explainReviewedMove
} from "@/lib/analysis/review-insights";
import type { MoveReview } from "@/lib/analysis/move-classification";
import type { GameMove } from "@/lib/chess/types";

function move(ply: number, san: string, uci = "e2e4"): GameMove {
  return {
    ply,
    san,
    lan: uci,
    uci,
    color: ply % 2 === 1 ? "w" : "b",
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    piece: "p",
    before: "before",
    after: "after"
  };
}

function review(partial: Partial<MoveReview> & Pick<MoveReview, "classification">): MoveReview {
  return {
    ply: partial.ply ?? 1,
    classification: partial.classification,
    bestMove: partial.bestMove,
    evalBefore: partial.evalBefore,
    evalAfter: partial.evalAfter,
    pv: partial.pv ?? []
  };
}

describe("review insights", () => {
  it("builds review summary with accuracy and phase issues", () => {
    const moves = [move(1, "e4"), move(2, "e5"), move(17, "Nf3", "g1f3")];
    const summary = buildReviewSummary(moves, {
      1: review({ ply: 1, classification: "Best", evalBefore: 20, evalAfter: 25 }),
      2: review({ ply: 2, classification: "Mistake", evalBefore: 80, evalAfter: -70 }),
      17: review({ ply: 17, classification: "Blunder", evalBefore: 120, evalAfter: -180 })
    });

    expect(summary.reviewedCount).toBe(3);
    expect(summary.accuracy).toBe(53);
    expect(summary.counts.Mistake).toBe(1);
    expect(summary.phases.Opening.issues).toBe(1);
    expect(summary.phases.Middlegame.issues).toBe(1);
    expect(summary.weakestMove?.san).toBe("Nf3");
  });

  it("extracts critical moments from issues and major swings", () => {
    const moves = [move(1, "e4"), move(2, "Qh4", "d8h4")];
    const moments = buildCriticalMoments(moves, {
      1: review({ ply: 1, classification: "Good", evalBefore: 20, evalAfter: 0 }),
      2: review({ ply: 2, classification: "Blunder", evalBefore: 200, evalAfter: -120 })
    });

    expect(moments).toHaveLength(1);
    expect(moments[0].label).toContain("Blunder");
  });

  it("creates retry and puzzle targets for serious reviewed issues", () => {
    const moves = [move(1, "Qh5", "d1h5"), move(2, "Nc6", "b8c6")];
    const reviews = {
      1: review({ ply: 1, classification: "Inaccuracy", bestMove: "g1f3", evalBefore: 40, evalAfter: -40 }),
      2: review({ ply: 2, classification: "Blunder", bestMove: "g8f6", evalBefore: 130, evalAfter: -90 })
    };

    expect(buildRetryTargets(moves, reviews).map((target) => target.san)).toEqual(["Qh5", "Nc6"]);
    expect(buildPuzzleCandidates(moves, reviews).map((target) => target.san)).toEqual(["Nc6"]);
  });

  it("explains reviewed mistakes with best move context", () => {
    const explanation = explainReviewedMove(
      move(1, "Qh5", "d1h5"),
      review({ classification: "Mistake", bestMove: "g1f3", evalBefore: 120, evalAfter: -40 }),
      "Nf3"
    );

    expect(explanation.title).toContain("Mistake");
    expect(explanation.detail).toContain("evaluation");
    expect(explanation.bestMove).toBe("Nf3");
  });
});
