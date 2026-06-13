export type BoardOrientation = "white" | "black";
export type PlayerColor = "w" | "b";
export type PromotionPiece = "q" | "r" | "b" | "n";

export type GameMove = {
  ply: number;
  san: string;
  lan: string;
  uci: string;
  color: PlayerColor;
  from: string;
  to: string;
  piece: string;
  before: string;
  after: string;
  captured?: string;
  promotion?: string;
};

export type ParsedGame = {
  initialFen: string;
  currentFen: string;
  moves: GameMove[];
  headers: Record<string, string>;
};

export type ImportResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: string;
    };
