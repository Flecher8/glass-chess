import type { EngineLine, UciScore } from "./types";

function parseScore(parts: string[]): UciScore | null {
  const scoreIndex = parts.indexOf("score");
  if (scoreIndex === -1) {
    return null;
  }

  const type = parts[scoreIndex + 1];
  const rawValue = parts[scoreIndex + 2];
  const value = Number(rawValue);

  if (!Number.isFinite(value)) {
    return null;
  }

  if (type === "cp") {
    return { type: "cp", value };
  }

  if (type === "mate") {
    return { type: "mate", value };
  }

  return null;
}

export function parseInfoLine(line: string): EngineLine | null {
  const parts = line.trim().split(/\s+/);

  if (parts[0] !== "info") {
    return null;
  }

  const depthIndex = parts.indexOf("depth");
  const pvIndex = parts.indexOf("pv");
  const multiPvIndex = parts.indexOf("multipv");
  const depth = depthIndex >= 0 ? Number(parts[depthIndex + 1]) : 0;
  const score = parseScore(parts);

  if (!score || !Number.isFinite(depth)) {
    return null;
  }

  return {
    depth,
    multiPv: multiPvIndex >= 0 ? Number(parts[multiPvIndex + 1]) || 1 : 1,
    score,
    pv: pvIndex >= 0 ? parts.slice(pvIndex + 1) : []
  };
}

export function parseBestMove(line: string): { bestMove: string; ponder?: string } | null {
  const parts = line.trim().split(/\s+/);

  if (parts[0] !== "bestmove" || !parts[1] || parts[1] === "(none)") {
    return null;
  }

  const ponderIndex = parts.indexOf("ponder");
  return {
    bestMove: parts[1],
    ponder: ponderIndex >= 0 ? parts[ponderIndex + 1] : undefined
  };
}

export function formatScore(score?: UciScore): string {
  if (!score) {
    return "Not analyzed";
  }

  if (score.type === "mate") {
    return `Mate ${score.value}`;
  }

  const pawns = score.value / 100;
  return `${pawns > 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

export function scoreToCentipawns(score: UciScore): number {
  if (score.type === "cp") {
    return score.value;
  }

  return score.value > 0 ? 100000 - score.value : -100000 - score.value;
}

export function scoreForWhite(score: UciScore, fen: string): UciScore {
  const sideToMove = fen.split(/\s+/)[1];

  if (sideToMove !== "b") {
    return score;
  }

  return {
    type: score.type,
    value: -score.value
  };
}
