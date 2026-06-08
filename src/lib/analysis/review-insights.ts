import type { GameMove } from "@/lib/chess/types";

import type { MoveClassification, MoveReview } from "./move-classification";

type PhaseName = "Opening" | "Middlegame" | "Endgame";

export type ReviewMoveInsight = {
  ply: number;
  san: string;
  classification: MoveClassification;
  loss?: number;
  gain?: number;
};

export type ReviewSummary = {
  reviewedCount: number;
  accuracy: number | null;
  counts: Partial<Record<MoveClassification, number>>;
  strongestMove?: ReviewMoveInsight;
  weakestMove?: ReviewMoveInsight;
  phases: Record<PhaseName, { reviewed: number; issues: number }>;
};

export type CriticalMoment = ReviewMoveInsight & {
  label: string;
};

export type MoveExplanation = {
  title: string;
  detail: string;
  bestMove?: string;
};

export type PracticeTarget = ReviewMoveInsight & {
  bestMove?: string;
  reason: string;
};

const CLASSIFICATION_SCORE: Record<MoveClassification, number> = {
  Book: 100,
  Best: 100,
  Excellent: 96,
  Good: 88,
  Inaccuracy: 70,
  Mistake: 45,
  Blunder: 15,
  Miss: 35,
  "Great Move": 98,
  Brilliant: 100
};

const ISSUE_CLASSIFICATIONS = new Set<MoveClassification>(["Inaccuracy", "Mistake", "Blunder", "Miss"]);
const POSITIVE_CLASSIFICATIONS = new Set<MoveClassification>(["Best", "Excellent", "Great Move", "Brilliant"]);
const RETRY_CLASSIFICATIONS = new Set<MoveClassification>(["Inaccuracy", "Mistake", "Blunder", "Miss"]);
const PUZZLE_CLASSIFICATIONS = new Set<MoveClassification>(["Mistake", "Blunder", "Miss"]);

function phaseForPly(ply: number): PhaseName {
  if (ply <= 16) {
    return "Opening";
  }

  if (ply <= 60) {
    return "Middlegame";
  }

  return "Endgame";
}

function reviewLoss(review: MoveReview): number | undefined {
  if (review.evalBefore === undefined || review.evalAfter === undefined) {
    return undefined;
  }

  return Math.max(0, review.evalBefore - review.evalAfter);
}

function reviewGain(review: MoveReview): number | undefined {
  if (review.evalBefore === undefined || review.evalAfter === undefined) {
    return undefined;
  }

  return Math.max(0, review.evalAfter - review.evalBefore);
}

function toInsight(move: GameMove, review: MoveReview): ReviewMoveInsight {
  return {
    ply: move.ply,
    san: move.san,
    classification: review.classification,
    loss: reviewLoss(review),
    gain: reviewGain(review)
  };
}

function reviewedMoveEntries(moves: GameMove[], reviews: Record<number, MoveReview>): Array<{ move: GameMove; review: MoveReview }> {
  return moves
    .map((move) => ({ move, review: reviews[move.ply] }))
    .filter((entry): entry is { move: GameMove; review: MoveReview } => Boolean(entry.review));
}

function issueRank(classification: MoveClassification): number {
  if (classification === "Blunder") {
    return 5;
  }

  if (classification === "Miss") {
    return 4;
  }

  if (classification === "Mistake") {
    return 3;
  }

  if (classification === "Inaccuracy") {
    return 2;
  }

  return 1;
}

export function buildReviewSummary(moves: GameMove[], reviews: Record<number, MoveReview>): ReviewSummary {
  const entries = reviewedMoveEntries(moves, reviews);
  const counts: Partial<Record<MoveClassification, number>> = {};
  const phases: ReviewSummary["phases"] = {
    Opening: { reviewed: 0, issues: 0 },
    Middlegame: { reviewed: 0, issues: 0 },
    Endgame: { reviewed: 0, issues: 0 }
  };
  let scoreTotal = 0;
  let scoredMoves = 0;
  let strongestMove: ReviewMoveInsight | undefined;
  let weakestMove: ReviewMoveInsight | undefined;

  for (const { move, review } of entries) {
    const classification = review.classification;
    const phase = phaseForPly(move.ply);
    const insight = toInsight(move, review);

    counts[classification] = (counts[classification] ?? 0) + 1;
    phases[phase].reviewed += 1;
    if (ISSUE_CLASSIFICATIONS.has(classification)) {
      phases[phase].issues += 1;
    }

    if (classification !== "Book") {
      scoreTotal += CLASSIFICATION_SCORE[classification];
      scoredMoves += 1;
    }

    if (POSITIVE_CLASSIFICATIONS.has(classification)) {
      const currentGain = insight.gain ?? 0;
      const strongestGain = strongestMove?.gain ?? 0;
      if (!strongestMove || currentGain > strongestGain || (currentGain === strongestGain && CLASSIFICATION_SCORE[classification] > CLASSIFICATION_SCORE[strongestMove.classification])) {
        strongestMove = insight;
      }
    }

    if (ISSUE_CLASSIFICATIONS.has(classification)) {
      const currentLoss = insight.loss ?? 0;
      const weakestLoss = weakestMove?.loss ?? 0;
      if (!weakestMove || issueRank(classification) > issueRank(weakestMove.classification) || (issueRank(classification) === issueRank(weakestMove.classification) && currentLoss > weakestLoss)) {
        weakestMove = insight;
      }
    }
  }

  return {
    reviewedCount: entries.length,
    accuracy: scoredMoves > 0 ? Math.round(scoreTotal / scoredMoves) : null,
    counts,
    strongestMove,
    weakestMove,
    phases
  };
}

export function buildCriticalMoments(moves: GameMove[], reviews: Record<number, MoveReview>): CriticalMoment[] {
  return reviewedMoveEntries(moves, reviews)
    .map(({ move, review }) => toInsight(move, review))
    .filter((insight) => ISSUE_CLASSIFICATIONS.has(insight.classification) || insight.classification === "Great Move" || insight.classification === "Brilliant" || (insight.loss ?? 0) >= 80 || (insight.gain ?? 0) >= 120)
    .map((insight) => ({
      ...insight,
      label: `${insight.ply}. ${insight.san} ${insight.classification}`
    }));
}

export function buildRetryTargets(moves: GameMove[], reviews: Record<number, MoveReview>): PracticeTarget[] {
  return reviewedMoveEntries(moves, reviews)
    .filter(({ review }) => RETRY_CLASSIFICATIONS.has(review.classification))
    .map(({ move, review }) => ({
      ...toInsight(move, review),
      bestMove: review.bestMove,
      reason: review.classification === "Miss" ? "Missed a stronger opportunity" : "Review this move again"
    }));
}

export function buildPuzzleCandidates(moves: GameMove[], reviews: Record<number, MoveReview>): PracticeTarget[] {
  return reviewedMoveEntries(moves, reviews)
    .filter(({ review }) => Boolean(review.bestMove) && PUZZLE_CLASSIFICATIONS.has(review.classification) && ((reviewLoss(review) ?? 0) >= 80 || review.classification === "Miss"))
    .map(({ move, review }) => ({
      ...toInsight(move, review),
      bestMove: review.bestMove,
      reason: review.classification === "Miss" ? "Find the forcing improvement" : "Find the engine improvement"
    }));
}

function formatPawnLoss(loss: number | undefined): string {
  if (loss === undefined) {
    return "The exact evaluation swing is still being refined.";
  }

  return `The move gave up about ${(loss / 100).toFixed(1)} pawns of evaluation at the current depth.`;
}

export function explainReviewedMove(move: GameMove, review: MoveReview, bestMoveSan?: string): MoveExplanation {
  const loss = reviewLoss(review);
  const bestMove = bestMoveSan ?? review.bestMove;

  if (review.classification === "Book") {
    return {
      title: "Book move",
      detail: "This move is still inside the local opening guide, so it is not scored as an engine mistake."
    };
  }

  if (review.classification === "Brilliant") {
    return {
      title: "Brilliant candidate",
      detail: "The move appears to be a strong sacrifice-like engine-approved idea that keeps or improves the position.",
      bestMove
    };
  }

  if (review.classification === "Great Move") {
    return {
      title: "Great move",
      detail: "The move seems to solve a difficult position and keeps the evaluation close to the engine recommendation.",
      bestMove
    };
  }

  if (review.classification === "Best" || review.classification === "Excellent") {
    return {
      title: `${review.classification} move`,
      detail: "The move stayed very close to the engine recommendation for this position.",
      bestMove
    };
  }

  if (review.classification === "Good") {
    return {
      title: "Good move",
      detail: "The move was playable, with only a small evaluation loss compared with the engine line.",
      bestMove
    };
  }

  if (review.classification === "Miss") {
    return {
      title: "Missed opportunity",
      detail: "The engine saw a much stronger continuation before this move. Try to find the forcing idea from the previous position.",
      bestMove
    };
  }

  if (move.captured && loss !== undefined && loss >= 80) {
    return {
      title: `${review.classification}: material swing`,
      detail: `${formatPawnLoss(loss)} The capture did not compensate enough compared with the engine line.`,
      bestMove
    };
  }

  return {
    title: `${review.classification} detected`,
    detail: `${formatPawnLoss(loss)} Compare the position with the suggested continuation and look for tactics, king safety, or piece activity.`,
    bestMove
  };
}
