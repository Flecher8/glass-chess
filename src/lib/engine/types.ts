export type EngineMode = "lite" | "strong";
export type EvalFormat = "centipawn" | "mate";

export type EngineSettings = {
  mode: EngineMode;
  depth: number;
  multiPv: number;
  showBestLine: boolean;
  evalFormat: EvalFormat;
};

export type UciScore =
  | {
      type: "cp";
      value: number;
    }
  | {
      type: "mate";
      value: number;
    };

export type EngineLine = {
  depth: number;
  multiPv: number;
  score: UciScore;
  pv: string[];
};

export type EngineAnalysisResult = {
  fen: string;
  bestMove: string;
  ponder?: string;
  lines: EngineLine[];
};

export type EngineStatus = "idle" | "loading" | "ready" | "analyzing" | "error";
