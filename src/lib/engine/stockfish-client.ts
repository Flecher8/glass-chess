import { Chess } from "chess.js";

import { parseBestMove, parseInfoLine } from "./uci-parser";
import type { EngineAnalysisResult, EngineLine, EngineSettings } from "./types";

const LITE_ENGINE_PATH = "/vendor/stockfish/18/stockfish-18-lite-single.js";

type PendingAnalysis = {
  fen: string;
  lines: Map<number, EngineLine>;
  minimumLineCount: number;
  onUpdate?: (result: EngineAnalysisResult) => void;
  publishedDepth: number;
  targetMultiPv: number;
  resolve: (result: EngineAnalysisResult) => void;
  reject: (error: Error) => void;
};

type AnalyzeOptions = {
  minimumLineCount?: number;
  multiPv?: number;
  onUpdate?: (result: EngineAnalysisResult) => void;
};

function legalMoveCountForFen(fen: string): number {
  try {
    return new Chess(fen).moves().length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function getMinimumAnalysisLineCount(fen: string, targetMultiPv: number, requestedMinimum?: number): number {
  const requestedLineCount = Math.floor(requestedMinimum ?? Math.min(3, targetMultiPv));
  const legalMoveCount = Math.max(1, legalMoveCountForFen(fen));
  return Math.max(1, Math.min(legalMoveCount, targetMultiPv, requestedLineCount));
}

export class StockfishClient {
  private worker: Worker | null = null;
  private readyPromise: Promise<void> | null = null;
  private pendingReady: (() => void) | null = null;
  private pendingAnalysis: PendingAnalysis | null = null;
  private pendingStop: (() => void) | null = null;

  async init(): Promise<void> {
    if (this.readyPromise) {
      return this.readyPromise;
    }

    if (typeof Worker === "undefined") {
      throw new Error("This browser does not support Web Workers.");
    }

    this.worker = new Worker(LITE_ENGINE_PATH);
    this.worker.addEventListener("message", this.handleMessage);
    this.worker.addEventListener("error", this.handleError);

    this.readyPromise = new Promise((resolve) => {
      this.pendingReady = resolve;
      this.send("uci");
      this.send("isready");
    });

    return this.readyPromise;
  }

  async analyze(fen: string, settings: EngineSettings, options: AnalyzeOptions = {}): Promise<EngineAnalysisResult> {
    await this.init();

    if (this.pendingAnalysis) {
      const pending = this.pendingAnalysis;
      this.pendingAnalysis = null;
      pending.reject(new Error("Engine analysis cancelled."));
      this.send("stop");
      await this.waitForStop();
    }

    return new Promise((resolve, reject) => {
      const targetMultiPv = Math.max(1, Math.floor(options.multiPv ?? Math.max(3, settings.multiPv)));
      const minimumLineCount = getMinimumAnalysisLineCount(fen, targetMultiPv, options.minimumLineCount);

      this.pendingAnalysis = {
        fen,
        lines: new Map(),
        minimumLineCount,
        onUpdate: options.onUpdate,
        publishedDepth: 0,
        targetMultiPv,
        resolve,
        reject
      };

      this.send("ucinewgame");
      this.send(`setoption name MultiPV value ${targetMultiPv}`);
      this.send(`position fen ${fen}`);
      this.send(`go depth ${settings.depth}`);
    });
  }

  stop(): void {
    if (this.pendingAnalysis) {
      this.pendingAnalysis.reject(new Error("Engine analysis cancelled."));
      this.pendingAnalysis = null;
    }
    this.send("stop");
  }

  dispose(): void {
    if (this.pendingAnalysis) {
      this.pendingAnalysis.reject(new Error("Engine was stopped."));
      this.pendingAnalysis = null;
    }

    this.worker?.removeEventListener("message", this.handleMessage);
    this.worker?.removeEventListener("error", this.handleError);
    this.send("quit");
    this.worker?.terminate();
    this.worker = null;
    this.readyPromise = null;
    this.pendingReady = null;
    this.pendingStop = null;
  }

  private send(command: string): void {
    this.worker?.postMessage(command);
  }

  private handleMessage = (event: MessageEvent<string>): void => {
    const line = String(event.data);

    if (line === "readyok" || line === "uciok") {
      if (line === "readyok") {
        this.pendingReady?.();
        this.pendingReady = null;
      }
      return;
    }

    const info = parseInfoLine(line);
    if (info && this.pendingAnalysis) {
      this.pendingAnalysis.lines.set(info.multiPv, info);
      this.publishPartialAnalysis(this.pendingAnalysis, info.depth);
      return;
    }

    const bestMove = parseBestMove(line);
    if (bestMove && !this.pendingAnalysis) {
      this.pendingStop?.();
      this.pendingStop = null;
      return;
    }

    if (bestMove && this.pendingAnalysis) {
      const pending = this.pendingAnalysis;
      this.pendingAnalysis = null;
      pending.resolve({
        fen: pending.fen,
        bestMove: bestMove.bestMove,
        ponder: bestMove.ponder,
        lines: [...pending.lines.values()].sort((a, b) => a.multiPv - b.multiPv)
      });
    }
  };

  private handleError = (): void => {
    const error = new Error("Stockfish failed to load or crashed.");

    this.pendingReady = null;
    this.readyPromise = null;

    if (this.pendingAnalysis) {
      this.pendingAnalysis.reject(error);
      this.pendingAnalysis = null;
    }
  };

  private waitForStop(): Promise<void> {
    return new Promise((resolve) => {
      const complete = () => {
        window.clearTimeout(timeout);
        if (this.pendingStop === complete) {
          this.pendingStop = null;
        }
        resolve();
      };

      const timeout = window.setTimeout(() => {
        if (this.pendingStop === complete) {
          this.pendingStop = null;
        }
        resolve();
      }, 1000);

      this.pendingStop = complete;
    });
  }

  private publishPartialAnalysis(pending: PendingAnalysis, depth: number): void {
    if (depth <= pending.publishedDepth) {
      return;
    }

    const lines = [...pending.lines.values()]
      .filter((line) => line.depth === depth)
      .sort((a, b) => a.multiPv - b.multiPv)
      .slice(0, 3);

    if (lines.length < pending.minimumLineCount) {
      return;
    }

    pending.publishedDepth = depth;
    pending.onUpdate?.({
      fen: pending.fen,
      bestMove: lines[0]?.pv[0] ?? "",
      lines
    });
  }
}
