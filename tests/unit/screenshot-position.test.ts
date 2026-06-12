import { describe, expect, it } from "vitest";

import {
  createEmptyScreenshotBoard,
  createFenFromScreenshotBoard,
  mapVisualBoardToFenBoard,
  normalizeCastlingRights,
  type ScreenshotBoard
} from "@/lib/chess/screenshot-position";

describe("screenshot position helpers", () => {
  it("creates a valid board FEN from detected pieces", () => {
    const board = createEmptyScreenshotBoard();
    board[4] = "k";
    board[60] = "K";
    board[52] = "P";

    expect(
      createFenFromScreenshotBoard(board, {
        orientation: "white",
        turn: "w",
        castling: "-",
        halfmoveClock: 0,
        fullmoveNumber: 1
      })
    ).toBe("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1");
  });

  it("maps black-bottom visual orientation into FEN board order", () => {
    const visualBoard: ScreenshotBoard = createEmptyScreenshotBoard();
    visualBoard[0] = "K";
    visualBoard[63] = "k";

    const fenBoard = mapVisualBoardToFenBoard(visualBoard, "black");

    expect(fenBoard[63]).toBe("K");
    expect(fenBoard[0]).toBe("k");
  });

  it("normalizes castling rights in canonical order", () => {
    expect(normalizeCastlingRights("qKkQ")).toBe("KQkq");
    expect(normalizeCastlingRights("")).toBe("-");
  });
});
