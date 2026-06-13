import { Chess, type Move } from "chess.js";

import { STARTING_FEN } from "./fen";
import type { GameMove, ImportResult, ParsedGame } from "./types";

export const MAX_PGN_LENGTH = 50000;
export const LONG_GAME_PLY_WARNING = 160;

function moveToGameMove(move: Move, index: number): GameMove {
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

export function sanitizePgnHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers)
      .filter(([key]) => /^[A-Za-z0-9_ -]{1,40}$/.test(key))
      .map(([key, value]) => [
        key,
        value
          .replace(/[<>]/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 120)
      ])
      .filter(([, value]) => value.length > 0)
  );
}

export function parsePgn(input: string): ImportResult<ParsedGame> {
  const pgn = input.trim();

  if (!pgn) {
    return { ok: false, error: "Paste a PGN game first." };
  }

  if (pgn.length > MAX_PGN_LENGTH) {
    return {
      ok: false,
      error: `PGN is too long for the browser MVP limit of ${MAX_PGN_LENGTH} characters.`
    };
  }

  try {
    const chess = new Chess();
    chess.loadPgn(pgn, { strict: false });
    const moves = chess.history({ verbose: true }).map(moveToGameMove);
    const firstMove = moves.at(0);

    return {
      ok: true,
      value: {
        initialFen: firstMove?.before ?? STARTING_FEN,
        currentFen: chess.fen(),
        moves,
        headers: sanitizePgnHeaders(chess.getHeaders())
      }
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "The PGN could not be parsed."
    };
  }
}

export function hasLongGameWarning(moveCount: number): boolean {
  return moveCount > LONG_GAME_PLY_WARNING;
}
