import { Chess, type Move } from "chess.js";

import { STARTING_FEN } from "./fen";
import type { GameMove, PromotionPiece } from "./types";

export type ChessGameState = {
  initialFen: string;
  moves: GameMove[];
  currentPly: number;
};

export function createInitialGameState(): ChessGameState {
  return {
    initialFen: STARTING_FEN,
    moves: [],
    currentPly: 0
  };
}

export function moveToRecord(move: Move, index: number): GameMove {
  const promotion = "promotion" in move && move.promotion ? move.promotion : undefined;

  return {
    ply: index + 1,
    san: move.san,
    lan: move.lan,
    uci: `${move.from}${move.to}${promotion ?? ""}`,
    color: move.color,
    from: move.from,
    to: move.to,
    piece: move.piece,
    before: move.before,
    after: move.after,
    captured: "captured" in move ? move.captured : undefined,
    promotion
  };
}

export function chessAtPly(state: ChessGameState, ply = state.currentPly): Chess {
  const chess = new Chess(state.initialFen);
  for (const move of state.moves.slice(0, ply)) {
    chess.move({ from: move.from, to: move.to, promotion: move.promotion ?? "q" });
  }
  return chess;
}

export function fenAtPly(state: ChessGameState, ply = state.currentPly): string {
  return chessAtPly(state, ply).fen();
}

export function setGameFromFen(fen: string): ChessGameState {
  return {
    initialFen: fen,
    moves: [],
    currentPly: 0
  };
}

export function setGameFromMoves(initialFen: string, moves: GameMove[]): ChessGameState {
  return {
    initialFen,
    moves,
    currentPly: moves.length
  };
}

export function applyManualMove(
  state: ChessGameState,
  sourceSquare: string,
  targetSquare: string,
  promotion: PromotionPiece = "q"
): ChessGameState | null {
  const chess = chessAtPly(state);

  try {
    const move = chess.move({
      from: sourceSquare,
      to: targetSquare,
      promotion
    });

    if (!move) {
      return null;
    }

    const retainedMoves = state.moves.slice(0, state.currentPly);
    const nextMove = moveToRecord(move, retainedMoves.length);

    return {
      initialFen: state.initialFen,
      moves: [...retainedMoves, nextMove],
      currentPly: retainedMoves.length + 1
    };
  } catch {
    return null;
  }
}

export function movePly(state: ChessGameState, nextPly: number): ChessGameState {
  return {
    ...state,
    currentPly: Math.max(0, Math.min(nextPly, state.moves.length))
  };
}

export function uciToMove(uci: string): { from: string; to: string; promotion?: PromotionPiece } | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
    return null;
  }

  const promotion = uci.length === 5 ? (uci[4] as PromotionPiece) : undefined;
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion
  };
}
