export type ScreenshotPiece = "P" | "N" | "B" | "R" | "Q" | "K" | "p" | "n" | "b" | "r" | "q" | "k";

export type ScreenshotBoard = Array<ScreenshotPiece | null>;

export type ScreenshotBoardOrientation = "white" | "black";

export type ScreenshotFenOptions = {
  orientation: ScreenshotBoardOrientation;
  turn: "w" | "b";
  castling: string;
  halfmoveClock: number;
  fullmoveNumber: number;
};

export const screenshotPieces: ScreenshotPiece[] = ["P", "N", "B", "R", "Q", "K", "p", "n", "b", "r", "q", "k"];

export const screenshotPieceLabels: Record<ScreenshotPiece, string> = {
  P: "White pawn",
  N: "White knight",
  B: "White bishop",
  R: "White rook",
  Q: "White queen",
  K: "White king",
  p: "Black pawn",
  n: "Black knight",
  b: "Black bishop",
  r: "Black rook",
  q: "Black queen",
  k: "Black king"
};

export const screenshotPieceGlyphs: Record<ScreenshotPiece, string> = {
  P: "\u2659",
  N: "\u2658",
  B: "\u2657",
  R: "\u2656",
  Q: "\u2655",
  K: "\u2654",
  p: "\u265f",
  n: "\u265e",
  b: "\u265d",
  r: "\u265c",
  q: "\u265b",
  k: "\u265a"
};

export function createEmptyScreenshotBoard(): ScreenshotBoard {
  return Array.from({ length: 64 }, () => null);
}

export function visualIndexToBoardIndex(index: number, orientation: ScreenshotBoardOrientation): number {
  const row = Math.floor(index / 8);
  const column = index % 8;

  if (orientation === "white") {
    return row * 8 + column;
  }

  return (7 - row) * 8 + (7 - column);
}

export function mapVisualBoardToFenBoard(visualBoard: ScreenshotBoard, orientation: ScreenshotBoardOrientation): ScreenshotBoard {
  const board = createEmptyScreenshotBoard();

  visualBoard.forEach((piece, index) => {
    board[visualIndexToBoardIndex(index, orientation)] = piece;
  });

  return board;
}

export function cycleScreenshotPiece(piece: ScreenshotPiece | null): ScreenshotPiece | null {
  if (!piece) {
    return screenshotPieces[0];
  }

  const nextIndex = screenshotPieces.indexOf(piece) + 1;
  return nextIndex >= screenshotPieces.length ? null : screenshotPieces[nextIndex];
}

export function normalizeCastlingRights(value: string): string {
  const compact = value.trim();
  if (!compact || compact === "-") {
    return "-";
  }

  const ordered = ["K", "Q", "k", "q"].filter((right) => compact.includes(right)).join("");
  return ordered || "-";
}

export function createFenFromScreenshotBoard(board: ScreenshotBoard, options: ScreenshotFenOptions): string {
  const ranks: string[] = [];

  for (let row = 0; row < 8; row += 1) {
    let rank = "";
    let emptyCount = 0;

    for (let column = 0; column < 8; column += 1) {
      const piece = board[row * 8 + column];
      if (!piece) {
        emptyCount += 1;
        continue;
      }

      if (emptyCount > 0) {
        rank += String(emptyCount);
        emptyCount = 0;
      }

      rank += piece;
    }

    if (emptyCount > 0) {
      rank += String(emptyCount);
    }

    ranks.push(rank);
  }

  const halfmoveClock = Number.isFinite(options.halfmoveClock) ? Math.max(0, Math.floor(options.halfmoveClock)) : 0;
  const fullmoveNumber = Number.isFinite(options.fullmoveNumber) ? Math.max(1, Math.floor(options.fullmoveNumber)) : 1;

  return `${ranks.join("/")} ${options.turn} ${normalizeCastlingRights(options.castling)} - ${halfmoveClock} ${fullmoveNumber}`;
}
