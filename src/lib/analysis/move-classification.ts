import type { GameMove } from "@/lib/chess/types";
import { scoreForWhite, scoreToCentipawns } from "@/lib/engine/uci-parser";
import type { EngineAnalysisResult } from "@/lib/engine/types";

export type MoveClassification =
  | "Book"
  | "Best"
  | "Excellent"
  | "Good"
  | "Inaccuracy"
  | "Mistake"
  | "Blunder"
  | "Miss"
  | "Great Move"
  | "Brilliant";

export type MoveReview = {
  ply: number;
  classification: MoveClassification;
  bestMove?: string;
  evalBefore?: number;
  evalAfter?: number;
  pv: string[];
};

function scoreForPlayer(score: EngineAnalysisResult["lines"][number]["score"], fen: string, color: GameMove["color"]): number {
  const whiteScore = scoreToCentipawns(scoreForWhite(score, fen));
  return color === "w" ? whiteScore : -whiteScore;
}

function isSacrificeLike(move: GameMove): boolean {
  return Boolean(move.captured) || move.piece !== "p";
}

export function classifyMove(
  move: GameMove,
  before: EngineAnalysisResult,
  after: EngineAnalysisResult
): MoveReview {
  const beforeLine = before.lines[0];
  const afterLine = after.lines[0];
  const bestMove = before.bestMove;
  const beforeEval = beforeLine?.score === undefined ? undefined : scoreForPlayer(beforeLine.score, before.fen, move.color);
  const afterEval = afterLine?.score === undefined ? undefined : scoreForPlayer(afterLine.score, after.fen, move.color);

  if (beforeEval === undefined || afterEval === undefined) {
    return {
      ply: move.ply,
      classification: "Good",
      bestMove,
      evalBefore: beforeEval,
      evalAfter: afterEval,
      pv: beforeLine?.pv ?? []
    };
  }

  const loss = Math.max(0, beforeEval - afterEval);
  const isBestMove = move.uci === bestMove;
  const missedWin = beforeEval >= 450 && afterEval < 180 && !isBestMove;
  const brilliant = isBestMove && beforeEval >= 120 && afterEval >= beforeEval - 30 && isSacrificeLike(move);
  const greatMove = !isBestMove && beforeEval < -120 && afterEval >= -30 && loss <= 25;

  let classification: MoveClassification;

  if (brilliant) {
    classification = "Brilliant";
  } else if (greatMove) {
    classification = "Great Move";
  } else if (missedWin) {
    classification = "Miss";
  } else if (isBestMove || loss <= 15) {
    classification = "Best";
  } else if (loss <= 35) {
    classification = "Excellent";
  } else if (loss <= 80) {
    classification = "Good";
  } else if (loss <= 150) {
    classification = "Inaccuracy";
  } else if (loss <= 300) {
    classification = "Mistake";
  } else {
    classification = "Blunder";
  }

  return {
    ply: move.ply,
    classification,
    bestMove,
    evalBefore: beforeEval,
    evalAfter: afterEval,
    pv: beforeLine?.pv ?? []
  };
}
