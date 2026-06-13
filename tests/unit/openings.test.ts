import { describe, expect, it } from "vitest";

import { findOpening, isBookMove } from "@/lib/chess/openings";
import type { GameMove } from "@/lib/chess/types";

function moves(sanMoves: string[]): GameMove[] {
  return sanMoves.map((san, index) => ({
    ply: index + 1,
    san,
    lan: san,
    uci: san,
    color: index % 2 === 0 ? "w" : "b",
    from: "e2",
    to: "e4",
    piece: "p",
    before: "before",
    after: "after"
  }));
}

describe("opening detection", () => {
  it("detects common opening prefixes", () => {
    const opening = findOpening(moves(["e4", "e5", "Nf3", "Nc6", "Bb5"]));

    expect(opening?.name).toBe("Ruy Lopez");
    expect(opening?.eco).toBe("C60");
  });

  it("marks early known opening moves as book moves", () => {
    const line = moves(["e4", "e5", "Nf3", "Nc6", "Bb5"]);

    expect(isBookMove(line, 1)).toBe(true);
    expect(isBookMove(line, 2)).toBe(true);
    expect(isBookMove(line, 5)).toBe(true);
  });

  it("does not mark unknown lines as book moves", () => {
    expect(isBookMove(moves(["h4", "h5"]), 2)).toBe(false);
  });
});
