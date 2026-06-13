import { Chess, validateFen } from "chess.js";

import type { ImportResult } from "./types";

export const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function loadFen(input: string): ImportResult<string> {
  const fen = input.trim();

  if (!fen) {
    return { ok: false, error: "Enter a FEN position first." };
  }

  const validation = validateFen(fen);
  if (!validation.ok) {
    return {
      ok: false,
      error: validation.error || "The FEN position is not valid."
    };
  }

  try {
    const chess = new Chess(fen);
    return { ok: true, value: chess.fen() };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "The FEN position is not valid."
    };
  }
}

export function isValidFen(input: string): boolean {
  return loadFen(input).ok;
}
