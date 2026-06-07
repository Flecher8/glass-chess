import type { GameMove } from "./types";

export type OpeningMatch = {
  eco: string;
  name: string;
  bookDepth: number;
};

type OpeningLine = OpeningMatch & {
  moves: string[];
};

const openingLines: OpeningLine[] = [
  { eco: "A00", name: "Van't Kruijs Opening", bookDepth: 1, moves: ["e3"] },
  { eco: "A02", name: "Bird Opening", bookDepth: 1, moves: ["f4"] },
  { eco: "A04", name: "Reti Opening", bookDepth: 1, moves: ["Nf3"] },
  { eco: "A10", name: "English Opening", bookDepth: 1, moves: ["c4"] },
  { eco: "A40", name: "Queen's Pawn Opening", bookDepth: 1, moves: ["d4"] },
  { eco: "B00", name: "King's Pawn Opening", bookDepth: 1, moves: ["e4"] },
  { eco: "B01", name: "Scandinavian Defense", bookDepth: 2, moves: ["e4", "d5"] },
  { eco: "B06", name: "Modern Defense", bookDepth: 2, moves: ["e4", "g6"] },
  { eco: "B07", name: "Pirc Defense", bookDepth: 3, moves: ["e4", "d6", "d4", "Nf6"] },
  { eco: "B10", name: "Caro-Kann Defense", bookDepth: 2, moves: ["e4", "c6"] },
  { eco: "B20", name: "Sicilian Defense", bookDepth: 2, moves: ["e4", "c5"] },
  { eco: "B30", name: "Sicilian Defense: Open", bookDepth: 4, moves: ["e4", "c5", "Nf3", "Nc6"] },
  { eco: "B50", name: "Sicilian Defense", bookDepth: 4, moves: ["e4", "c5", "Nf3", "d6"] },
  { eco: "C00", name: "French Defense", bookDepth: 2, moves: ["e4", "e6"] },
  { eco: "C20", name: "Open Game", bookDepth: 2, moves: ["e4", "e5"] },
  { eco: "C23", name: "Bishop's Opening", bookDepth: 3, moves: ["e4", "e5", "Bc4"] },
  { eco: "C25", name: "Vienna Game", bookDepth: 3, moves: ["e4", "e5", "Nc3"] },
  { eco: "C30", name: "King's Gambit", bookDepth: 3, moves: ["e4", "e5", "f4"] },
  { eco: "C44", name: "King's Knight Opening", bookDepth: 3, moves: ["e4", "e5", "Nf3"] },
  { eco: "C50", name: "Italian Game", bookDepth: 5, moves: ["e4", "e5", "Nf3", "Nc6", "Bc4"] },
  { eco: "C60", name: "Ruy Lopez", bookDepth: 5, moves: ["e4", "e5", "Nf3", "Nc6", "Bb5"] },
  { eco: "C65", name: "Ruy Lopez: Berlin Defense", bookDepth: 6, moves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "Nf6"] },
  { eco: "C70", name: "Ruy Lopez: Morphy Defense", bookDepth: 6, moves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"] },
  { eco: "D00", name: "Queen's Pawn Game", bookDepth: 2, moves: ["d4", "d5"] },
  { eco: "D06", name: "Queen's Gambit", bookDepth: 3, moves: ["d4", "d5", "c4"] },
  { eco: "D20", name: "Queen's Gambit Accepted", bookDepth: 4, moves: ["d4", "d5", "c4", "dxc4"] },
  { eco: "D30", name: "Queen's Gambit Declined", bookDepth: 4, moves: ["d4", "d5", "c4", "e6"] },
  { eco: "D43", name: "Semi-Slav Defense", bookDepth: 6, moves: ["d4", "d5", "c4", "c6", "Nf3", "Nf6"] },
  { eco: "D80", name: "Grunfeld Defense", bookDepth: 6, moves: ["d4", "Nf6", "c4", "g6", "Nc3", "d5"] },
  { eco: "E00", name: "Indian Defense", bookDepth: 2, moves: ["d4", "Nf6"] },
  { eco: "E20", name: "Nimzo-Indian Defense", bookDepth: 6, moves: ["d4", "Nf6", "c4", "e6", "Nc3", "Bb4"] },
  { eco: "E60", name: "King's Indian Defense", bookDepth: 6, moves: ["d4", "Nf6", "c4", "g6", "Nc3", "Bg7"] }
];

function isPrefix(sequence: string[], line: string[]): boolean {
  return sequence.length <= line.length && sequence.every((move, index) => move === line[index]);
}

export function findOpening(moves: Pick<GameMove, "san">[]): OpeningMatch | null {
  const sequence = moves.map((move) => move.san);

  if (sequence.length === 0) {
    return null;
  }

  const match = openingLines
    .filter((line) => line.moves.length <= sequence.length && line.moves.every((move, index) => sequence[index] === move))
    .sort((a, b) => b.moves.length - a.moves.length)[0];

  if (!match) {
    return null;
  }

  return {
    eco: match.eco,
    name: match.name,
    bookDepth: match.bookDepth
  };
}

export function isBookMove(moves: Pick<GameMove, "san">[], ply: number): boolean {
  const sequence = moves.slice(0, ply).map((move) => move.san);
  const opening = openingLines.find((line) => isPrefix(sequence, line.moves));

  return Boolean(opening && ply <= opening.bookDepth);
}
