import { describe, expect, it } from "vitest";

import { applyManualMove, createInitialGameState, fenAtPly, movePly, uciToMove } from "@/lib/chess/game-state";
import { STARTING_FEN } from "@/lib/chess/fen";

describe("game state", () => {
  it("applies legal manual moves", () => {
    const result = applyManualMove(createInitialGameState(), "e2", "e4");

    expect(result).not.toBeNull();
    expect(result?.moves[0].uci).toBe("e2e4");
  });

  it("rejects illegal manual moves", () => {
    const result = applyManualMove(createInitialGameState(), "e2", "e5");

    expect(result).toBeNull();
  });

  it("navigates positions by ply", () => {
    const afterMove = applyManualMove(createInitialGameState(), "e2", "e4");
    expect(afterMove).not.toBeNull();

    const start = movePly(afterMove!, 0);
    expect(fenAtPly(start)).toBe(STARTING_FEN);
  });

  it("parses UCI moves", () => {
    expect(uciToMove("e7e8q")).toEqual({ from: "e7", to: "e8", promotion: "q" });
    expect(uciToMove("bad")).toBeNull();
  });
});
