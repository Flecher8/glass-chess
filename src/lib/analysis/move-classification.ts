import { Chess } from "chess.js";

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

const MATE_SCORE_CAP = 1000;
const PIECE_VALUES: Record<GameMove["piece"], number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0
};

function scoreForPlayer(score: EngineAnalysisResult["lines"][number]["score"], fen: string, color: GameMove["color"]): number {
  const whiteScore = scoreToCentipawns(scoreForWhite(score, fen));
  const playerScore = color === "w" ? whiteScore : -whiteScore;

  return Math.max(-MATE_SCORE_CAP, Math.min(MATE_SCORE_CAP, playerScore));
}

function isSacrificeLike(move: GameMove): boolean {
  const movedValue = PIECE_VALUES[move.piece];
  const capturedValue = move.captured ? PIECE_VALUES[move.captured] : 0;

  if (movedValue <= capturedValue) {
    return false;
  }

  try {
    const opponentCanTakeMovedPiece = new Chess(move.after)
      .moves({ verbose: true })
      .some((reply) => reply.to === move.to && reply.captured === move.piece);

    return opponentCanTakeMovedPiece && movedValue - capturedValue >= 2;
  } catch {
    return false;
  }
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
  const gain = Math.max(0, afterEval - beforeEval);
  const isBestMove = move.uci === bestMove;
  const missedWin = beforeEval >= 450 && afterEval < 180 && !isBestMove;
  const brilliant = isBestMove && isSacrificeLike(move) && beforeEval >= -80 && afterEval >= beforeEval - 25 && gain >= 60;
  const greatMove = !isBestMove && beforeEval < -120 && afterEval >= -30 && loss <= 25;

  let classification: MoveClassification;

  if (brilliant) {
    classification = "Brilliant";
  } else if (greatMove) {
    classification = "Great Move";
  } else if (missedWin) {
    classification = "Miss";
  } else if (isBestMove || loss <= 2) {
    classification = "Best";
  } else if (loss <= 20) {
    classification = "Excellent";
  } else if (loss <= 50) {
    classification = "Good";
  } else if (loss <= 100) {
    classification = "Inaccuracy";
  } else if (loss <= 200) {
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
