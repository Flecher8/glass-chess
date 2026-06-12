"use client";

import { Chess, SQUARES } from "chess.js";
import clsx from "clsx";
import {
  BarChart3,
  BookOpen,
  ChevronsLeft,
  ChevronsRight,
  FlipHorizontal,
  Lightbulb,
  MoreVertical,
  RotateCcw,
  Settings,
  Square,
  StepBack,
  StepForward,
  Target,
  Trophy,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Chessboard, type PieceDropHandlerArgs, type SquareHandlerArgs, type SquareRenderer } from "react-chessboard";

import { classifyMove, type MoveClassification, type MoveReview } from "@/lib/analysis/move-classification";
import {
  buildCriticalMoments,
  buildPuzzleCandidates,
  buildRetryTargets,
  buildReviewSummary,
  explainReviewedMove,
  type PracticeTarget
} from "@/lib/analysis/review-insights";
import { STARTING_FEN, loadFen } from "@/lib/chess/fen";
import {
  applyManualMove,
  chessAtPly,
  createInitialGameState,
  fenAtPly,
  movePly,
  setGameFromFen,
  setGameFromMoves,
  uciToMove
} from "@/lib/chess/game-state";
import { findOpening, isBookMove } from "@/lib/chess/openings";
import { hasLongGameWarning, parsePgn } from "@/lib/chess/pgn";
import type { BoardOrientation, GameMove } from "@/lib/chess/types";
import { StockfishClient } from "@/lib/engine/stockfish-client";
import type { EngineAnalysisResult, EngineSettings, EngineStatus, UciScore } from "@/lib/engine/types";
import { formatScore, scoreForWhite } from "@/lib/engine/uci-parser";
import styles from "./AnalysisTool.module.css";
import { ScreenshotPositionImporter } from "./ScreenshotPositionImporter";

const defaultSettings: EngineSettings = {
  mode: "lite",
  depth: 25,
  multiPv: 3,
  showBestLine: true,
  evalFormat: "centipawn"
};

const PREFERENCES_VERSION = 2;
const chessSquareSet = new Set<string>(SQUARES);

type ChessSquare = (typeof SQUARES)[number];

function toChessSquare(square: string | null | undefined): ChessSquare | null {
  return square && chessSquareSet.has(square) ? (square as ChessSquare) : null;
}

const samplePgn = `[Event "Sample Game"]
[White "White"]
[Black "Black"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 *`;

const sampleFen = "r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4";

type MoveDisplayLabel = MoveClassification | "Reviewing";

type PracticeSession = {
  source: "retry" | "puzzle";
  ply: number;
  san: string;
  classification: MoveClassification;
  bestMove?: string;
  bestMoveSan?: string;
  revealed: boolean;
  feedback?: string;
};

type AnalysisToolMode = "analysis" | "review";

type AnalysisToolProps = {
  mode?: AnalysisToolMode;
};

const moveQualityMeta: Record<MoveClassification, { color: string; symbol: string; label: string }> = {
  Book: { color: "#9b6a43", symbol: "", label: "Book" },
  Best: { color: "#7fc766", symbol: "★", label: "Best" },
  Excellent: { color: "#86c96f", symbol: "👍", label: "Excellent" },
  Good: { color: "#97bb86", symbol: "✓", label: "Good" },
  Inaccuracy: { color: "#f4c84f", symbol: "?!", label: "Inaccuracy" },
  Mistake: { color: "#ff9d5a", symbol: "?", label: "Mistake" },
  Blunder: { color: "#ff5e55", symbol: "??", label: "Blunder" },
  Miss: { color: "#ff7d7d", symbol: "×", label: "Miss" },
  "Great Move": { color: "#7fa8c8", symbol: "!", label: "Great Move" },
  Brilliant: { color: "#25c7b8", symbol: "!!", label: "Brilliant" }
};

const neutralMoveMeta = { color: "#88a9c4", symbol: "", label: "Last move" };
const reviewingMoveMeta = { color: "#88a9c4", label: "Reviewing" };
const GAME_REVIEW_CONCURRENCY = 2;
const SUMMARY_LABELS: MoveClassification[] = ["Best", "Excellent", "Good", "Inaccuracy", "Mistake", "Blunder", "Miss", "Great Move", "Brilliant"];

function moveSignature(move: GameMove): string {
  return `${move.ply}:${move.uci}:${move.before}:${move.after}`;
}

function retainRecordThroughPly<T>(record: Record<number, T>, ply: number): Record<number, T> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => Number(key) <= ply)) as Record<number, T>;
}

function removeRecordPly<T>(record: Record<number, T>, ply: number): Record<number, T> {
  const next = { ...record };
  delete next[ply];
  return next;
}

function colorForMoveLabel(label: MoveDisplayLabel): string {
  return label === "Reviewing" ? reviewingMoveMeta.color : moveQualityMeta[label].color;
}

function buildReviewDepthPasses(targetDepth: number): number[] {
  const depth = Math.max(1, Math.floor(targetDepth));
  const candidates = [Math.min(4, depth), Math.min(10, depth), depth];
  return [...new Set(candidates)].sort((a, b) => a - b);
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        await worker(items[index], index);
      }
    })
  );
}

function formatSettingScore(score: UciScore | undefined, fen: string, format: EngineSettings["evalFormat"] = "centipawn"): string {
  if (!score) {
    return "Not analyzed";
  }

  const displayScore = scoreForWhite(score, fen);

  if (format === "mate") {
    return displayScore.type === "mate" ? formatScore(displayScore) : "No forced mate";
  }

  return formatScore(displayScore);
}

type PvDisplayMove = {
  uci: string;
  san: string;
};

function buildPvDisplayMoves(fen: string, pv: string[]): PvDisplayMove[] {
  const chess = new Chess(fen);
  const moves: PvDisplayMove[] = [];

  for (const uci of pv) {
    const parsed = uciToMove(uci);
    if (!parsed) {
      break;
    }

    try {
      const move = chess.move(parsed);
      moves.push({ uci, san: move.san });
    } catch {
      break;
    }
  }

  return moves;
}

function bestMoveToSan(fen: string, bestMove: string | undefined): string | undefined {
  if (!bestMove) {
    return undefined;
  }

  const parsed = uciToMove(bestMove);
  if (!parsed) {
    return bestMove;
  }

  try {
    return new Chess(fen).move(parsed)?.san ?? bestMove;
  } catch {
    return bestMove;
  }
}

function classifyCandidateMove(candidateIndex: number): MoveClassification {
  if (candidateIndex === 0) {
    return "Best";
  }

  if (candidateIndex === 1) {
    return "Excellent";
  }

  return "Good";
}

function isEngineCancellation(error: unknown): boolean {
  return error instanceof Error && /cancelled|stopped/i.test(error.message);
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildEvaluationBar(score: UciScore | undefined, fen: string) {
  if (!score) {
    return {
      label: "0.0",
      labelSide: "white" as const,
      whitePercent: 50
    };
  }

  const whiteScore = scoreForWhite(score, fen);

  if (whiteScore.type === "mate") {
    return {
      label: formatScore(whiteScore),
      labelSide: whiteScore.value >= 0 ? ("white" as const) : ("black" as const),
      whitePercent: whiteScore.value >= 0 ? 96 : 4
    };
  }

  const whitePercent = clamp(50 + Math.tanh(whiteScore.value / 520) * 45, 5, 95);

  return {
    label: formatScore(whiteScore),
    labelSide: whiteScore.value >= 0 ? ("white" as const) : ("black" as const),
    whitePercent
  };
}

function formatPawnSwing(value: number | undefined): string {
  if (value === undefined) {
    return "-";
  }

  return `${(value / 100).toFixed(1)}`;
}

export function AnalysisTool({ mode = "analysis" }: AnalysisToolProps) {
  const showReviewTools = mode === "review";
  const [game, setGame] = useState(createInitialGameState);
  const [fenInput, setFenInput] = useState(STARTING_FEN);
  const [pgnInput, setPgnInput] = useState(samplePgn);
  const [message, setMessage] = useState("Ready");
  const [orientation, setOrientation] = useState<BoardOrientation>("white");
  const [settings, setSettings] = useState<EngineSettings>(defaultSettings);
  const [showLegalMoveHints, setShowLegalMoveHints] = useState(true);
  const [selectedSquare, setSelectedSquare] = useState<{ fen: string; square: ChessSquare } | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNavMenuOpen, setIsNavMenuOpen] = useState(false);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>("idle");
  const [analysis, setAnalysis] = useState<EngineAnalysisResult | null>(null);
  const [reviews, setReviews] = useState<Record<number, MoveReview>>({});
  const [quickClassifications, setQuickClassifications] = useState<Record<number, MoveClassification>>({});
  const [pendingMoveReviews, setPendingMoveReviews] = useState<Record<number, string>>({});
  const [reviewProgress, setReviewProgress] = useState({ active: false, current: 0, total: 0 });
  const [practiceSession, setPracticeSession] = useState<PracticeSession | null>(null);
  const clientRef = useRef<StockfishClient | null>(null);
  const reviewBeforeClientRef = useRef<StockfishClient | null>(null);
  const reviewAfterClientRef = useRef<StockfishClient | null>(null);
  const cancelReviewRef = useRef(false);
  const autoAnalysisRef = useRef(0);
  const automaticReviewVersionRef = useRef(0);
  const activeReviewDisposersRef = useRef<Set<() => void>>(new Set());
  const gameRef = useRef(game);
  const navMenuRef = useRef<HTMLDivElement | null>(null);

  const currentFen = useMemo(() => fenAtPly(game), [game]);
  const currentChess = useMemo(() => chessAtPly(game), [game]);
  const selectedSquareForPosition = selectedSquare?.fen === currentFen ? selectedSquare.square : null;
  const legalTargetSquares = useMemo(() => {
    if (!selectedSquareForPosition) {
      return new Set<ChessSquare>();
    }

    try {
      return new Set(currentChess.moves({ square: selectedSquareForPosition, verbose: true }).map((move) => move.to));
    } catch {
      return new Set<ChessSquare>();
    }
  }, [currentChess, selectedSquareForPosition]);
  const currentMove = game.currentPly > 0 ? game.moves[game.currentPly - 1] : null;
  const currentOpening = useMemo(() => findOpening(game.moves.slice(0, game.currentPly)), [game.currentPly, game.moves]);
  const currentMoveClassification = currentMove
    ? (reviews[currentMove.ply]?.classification ?? quickClassifications[currentMove.ply] ?? (isBookMove(game.moves, currentMove.ply) ? "Book" : undefined))
    : undefined;
  const currentMoveReview = currentMove ? reviews[currentMove.ply] : undefined;
  const currentMoveMeta = currentMoveClassification ? moveQualityMeta[currentMoveClassification] : neutralMoveMeta;
  const activeAnalysis = analysis?.fen === currentFen ? analysis : null;
  const currentLine = activeAnalysis?.lines[0];
  const candidateLines = activeAnalysis?.lines.slice(0, 3) ?? [];
  const currentScore = formatSettingScore(currentLine?.score, currentFen, settings.evalFormat);
  const displayScore = !currentLine && (engineStatus === "loading" || engineStatus === "analyzing") ? "Analyzing..." : currentScore;
  const analyzedDepth = currentLine?.depth ?? 0;
  const depthLabel = analyzedDepth > 0 ? `Depth ${analyzedDepth}/${settings.depth}` : `Depth ${settings.depth}`;
  const evaluationBar = useMemo(() => buildEvaluationBar(currentLine?.score, currentFen), [currentFen, currentLine?.score]);
  const topLineMoves = useMemo(() => (currentLine ? buildPvDisplayMoves(currentFen, currentLine.pv) : []), [currentFen, currentLine]);
  const legalCandidateCount = useMemo(() => Math.min(3, currentChess.moves().length), [currentChess]);
  const engineBusy = engineStatus === "loading" || engineStatus === "analyzing" || reviewProgress.active;
  const emptyAnalysisState = !showReviewTools && game.moves.length === 0 && currentFen === STARTING_FEN;
  const reviewSummary = useMemo(() => buildReviewSummary(game.moves, reviews), [game.moves, reviews]);
  const criticalMoments = useMemo(() => buildCriticalMoments(game.moves, reviews), [game.moves, reviews]);
  const retryTargets = useMemo(() => buildRetryTargets(game.moves, reviews), [game.moves, reviews]);
  const puzzleCandidates = useMemo(() => buildPuzzleCandidates(game.moves, reviews), [game.moves, reviews]);
  const currentMoveExplanation = useMemo(() => {
    if (!currentMove || !currentMoveReview) {
      return null;
    }

    return explainReviewedMove(currentMove, currentMoveReview, bestMoveToSan(currentMove.before, currentMoveReview.bestMove));
  }, [currentMove, currentMoveReview]);
  const engineAnalysisSettings = useMemo<EngineSettings>(
    () => ({
      mode: settings.mode,
      depth: settings.depth,
      multiPv: settings.multiPv,
      showBestLine: true,
      evalFormat: "centipawn"
    }),
    [settings.depth, settings.mode, settings.multiPv]
  );
  const moveRows = useMemo(() => {
    const rowCount = Math.ceil(game.moves.length / 2);
    return Array.from({ length: rowCount }, (_, index) => ({
      number: index + 1,
      white: game.moves[index * 2],
      black: game.moves[index * 2 + 1]
    }));
  }, [game.moves]);

  const moveLabel = useCallback(
    (move: GameMove | undefined): MoveDisplayLabel | undefined => {
      if (!move) {
        return undefined;
      }

      return (
        reviews[move.ply]?.classification ??
        (pendingMoveReviews[move.ply] === moveSignature(move) ? "Reviewing" : undefined) ??
        quickClassifications[move.ply] ??
        (isBookMove(game.moves, move.ply) ? "Book" : undefined)
      );
    },
    [game.moves, pendingMoveReviews, quickClassifications, reviews]
  );

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    const stored = window.localStorage.getItem("glass-chess-preferences");
    if (!stored) {
      return;
    }

    try {
      const preferences = JSON.parse(stored) as Partial<{
        version: number;
        orientation: BoardOrientation;
        settings: EngineSettings;
        showLegalMoveHints: boolean;
      }>;
      if (preferences.version !== PREFERENCES_VERSION) {
        window.localStorage.removeItem("glass-chess-preferences");
        return;
      }
      window.setTimeout(() => {
        if (preferences.orientation === "white" || preferences.orientation === "black") {
          setOrientation(preferences.orientation);
        }
        if (preferences.settings) {
          setSettings((current) => ({ ...current, ...preferences.settings, mode: "lite", multiPv: 3 }));
        }
        if (typeof preferences.showLegalMoveHints === "boolean") {
          setShowLegalMoveHints(preferences.showLegalMoveHints);
        }
      }, 0);
    } catch {
      window.localStorage.removeItem("glass-chess-preferences");
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      "glass-chess-preferences",
      JSON.stringify({
        version: PREFERENCES_VERSION,
        orientation,
        settings,
        showLegalMoveHints
      })
    );
  }, [orientation, settings, showLegalMoveHints]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isSettingsOpen || isNavMenuOpen) {
        return;
      }

      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }

      if (isTextEditingTarget(event.target)) {
        return;
      }

      event.preventDefault();
      setGame((current) => movePly(current, current.currentPly + (event.key === "ArrowRight" ? 1 : -1)));
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isNavMenuOpen, isSettingsOpen]);

  useEffect(() => {
    if (!isNavMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (event.target instanceof Node && navMenuRef.current?.contains(event.target)) {
        return;
      }

      setIsNavMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsNavMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isNavMenuOpen]);

  useEffect(() => {
    const activeReviewDisposers = activeReviewDisposersRef.current;

    return () => {
      clientRef.current?.dispose();
      reviewBeforeClientRef.current?.dispose();
      reviewAfterClientRef.current?.dispose();
      activeReviewDisposers.forEach((dispose) => dispose());
      activeReviewDisposers.clear();
    };
  }, []);

  const getClient = useCallback(() => {
    if (!clientRef.current) {
      clientRef.current = new StockfishClient();
    }
    return clientRef.current;
  }, []);

  const getReviewBeforeClient = useCallback(() => {
    if (!reviewBeforeClientRef.current) {
      reviewBeforeClientRef.current = new StockfishClient();
    }
    return reviewBeforeClientRef.current;
  }, []);

  const getReviewAfterClient = useCallback(() => {
    if (!reviewAfterClientRef.current) {
      reviewAfterClientRef.current = new StockfishClient();
    }
    return reviewAfterClientRef.current;
  }, []);

  const disposeReviewClients = useCallback(() => {
    reviewBeforeClientRef.current?.dispose();
    reviewAfterClientRef.current?.dispose();
    reviewBeforeClientRef.current = null;
    reviewAfterClientRef.current = null;
    activeReviewDisposersRef.current.forEach((dispose) => dispose());
    activeReviewDisposersRef.current.clear();
  }, []);

  const analyzeFen = useCallback(
    async (fen: string, engineSettings: EngineSettings, onUpdate?: (result: EngineAnalysisResult) => void) => {
      const client = getClient();
      setEngineStatus("loading");
      await client.init();
      setEngineStatus("analyzing");
      const result = await client.analyze(fen, engineSettings, { onUpdate });
      setEngineStatus("ready");
      return result;
    },
    [getClient]
  );

  const clearMoveQualityState = useCallback(() => {
    automaticReviewVersionRef.current += 1;
    disposeReviewClients();
    setReviews({});
    setQuickClassifications({});
    setPendingMoveReviews({});
    setPracticeSession(null);
  }, [disposeReviewClients]);

  const reviewMoveProgressively = useCallback(
    async (
      move: GameMove,
      movesSnapshot: GameMove[],
      reviewVersion: number,
      options: { afterClient?: StockfishClient; beforeClient?: StockfishClient; depth?: number } = {}
    ) => {
      if (isBookMove(movesSnapshot, move.ply)) {
        const review: MoveReview = { ply: move.ply, classification: "Book", pv: [] };
        setReviews((current) => ({ ...current, [move.ply]: review }));
        return review;
      }

      const signature = moveSignature(move);
      const reviewSettings: EngineSettings = {
        ...engineAnalysisSettings,
        depth: options.depth ?? engineAnalysisSettings.depth,
        multiPv: 1,
        showBestLine: true,
        evalFormat: "centipawn"
      };

      setPendingMoveReviews((current) => ({ ...current, [move.ply]: signature }));
      if (reviewVersion !== automaticReviewVersionRef.current) {
        setPendingMoveReviews((current) => (current[move.ply] === signature ? removeRecordPly(current, move.ply) : current));
        return null;
      }

      const beforeByDepth = new Map<number, EngineAnalysisResult>();
      const afterByDepth = new Map<number, EngineAnalysisResult>();
      let publishedDepth = 0;
      let latestReview: MoveReview | null = null;

      const isStillActive = () => {
        const activeMove = gameRef.current.moves[move.ply - 1];
        return reviewVersion === automaticReviewVersionRef.current && Boolean(activeMove && moveSignature(activeMove) === signature);
      };

      const rememberResult = (collection: Map<number, EngineAnalysisResult>, result: EngineAnalysisResult) => {
        const depth = result.lines[0]?.depth;
        if (depth) {
          collection.set(depth, result);
        }
      };

      const publishBestAvailableReview = (force = false) => {
        if (!isStillActive()) {
          return;
        }

        const matchingDepths = [...beforeByDepth.keys()].filter((depth) => afterByDepth.has(depth));
        const depth = matchingDepths.length > 0 ? Math.max(...matchingDepths) : 0;

        if (!depth || (!force && depth <= publishedDepth)) {
          return;
        }

        const before = beforeByDepth.get(depth);
        const after = afterByDepth.get(depth);
        if (!before || !after) {
          return;
        }

        publishedDepth = depth;
        const review = classifyMove(move, before, after);
        latestReview = review;
        setReviews((current) => ({ ...current, [move.ply]: review }));
        setQuickClassifications((current) => removeRecordPly(current, move.ply));
        setMessage(`${review.classification} at depth ${depth}`);
      };

      try {
        const beforeClient = options.beforeClient ?? getReviewBeforeClient();
        const afterClient = options.afterClient ?? getReviewAfterClient();
        await Promise.all([beforeClient.init(), afterClient.init()]);

        if (!isStillActive()) {
          return null;
        }

        const [before, after] = await Promise.all([
          beforeClient.analyze(move.before, reviewSettings, {
            minimumLineCount: 1,
            multiPv: 1,
            onUpdate: (result) => {
              rememberResult(beforeByDepth, result);
              publishBestAvailableReview();
            }
          }),
          afterClient.analyze(move.after, reviewSettings, {
            minimumLineCount: 1,
            multiPv: 1,
            onUpdate: (result) => {
              rememberResult(afterByDepth, result);
              publishBestAvailableReview();
            }
          })
        ]);

        rememberResult(beforeByDepth, before);
        rememberResult(afterByDepth, after);
        publishBestAvailableReview(true);
        return latestReview;
      } catch (error) {
        if (!isEngineCancellation(error) && reviewVersion === automaticReviewVersionRef.current) {
          setMessage(error instanceof Error ? error.message : "Move review failed.");
        }
        return null;
      } finally {
        setPendingMoveReviews((current) => (current[move.ply] === signature ? removeRecordPly(current, move.ply) : current));
      }
    },
    [engineAnalysisSettings, getReviewAfterClient, getReviewBeforeClient]
  );

  const queueMoveReview = useCallback(
    (move: GameMove, movesSnapshot: GameMove[]) => {
      automaticReviewVersionRef.current += 1;
      disposeReviewClients();
      void reviewMoveProgressively(move, movesSnapshot, automaticReviewVersionRef.current);
    },
    [disposeReviewClients, reviewMoveProgressively]
  );

  useEffect(() => {
    let isActive = true;
    const requestId = autoAnalysisRef.current + 1;
    autoAnalysisRef.current = requestId;

    const timer = window.setTimeout(async () => {
      try {
        setMessage("Analyzing position");
        const result = await analyzeFen(currentFen, engineAnalysisSettings, (partialResult) => {
          if (!isActive || autoAnalysisRef.current !== requestId) {
            return;
          }

          setAnalysis(partialResult);
          setMessage(`Analyzing depth ${partialResult.lines[0]?.depth ?? ""}`.trim());
        });

        if (!isActive || autoAnalysisRef.current !== requestId) {
          return;
        }

        setAnalysis(result);
        setMessage("Position analyzed");
      } catch (error) {
        if (!isActive || autoAnalysisRef.current !== requestId) {
          return;
        }

        if (isEngineCancellation(error)) {
          setEngineStatus("ready");
          setMessage("Analysis stopped");
          return;
        }

        setEngineStatus("error");
        setMessage(error instanceof Error ? error.message : "Engine analysis failed.");
      }
    }, 250);

    return () => {
      isActive = false;
      window.clearTimeout(timer);
      clientRef.current?.stop();
    };
  }, [analyzeFen, currentFen, engineAnalysisSettings]);

  const classifyMoveFromCurrentCandidates = useCallback(
    (move: GameMove, moves = game.moves): MoveClassification | undefined => {
      if (isBookMove(moves.slice(0, move.ply), move.ply)) {
        return "Book";
      }

      if (analysis?.fen !== move.before) {
        return undefined;
      }

      const candidateIndex = analysis.lines.slice(0, 3).findIndex((line) => line.pv[0] === move.uci);

      if (candidateIndex >= 0) {
        return classifyCandidateMove(candidateIndex);
      }

      return undefined;
    },
    [analysis, game.moves]
  );

  const playCandidateSequence = useCallback(
    (pv: string[], clickedIndex: number, candidateIndex: number) => {
      if (analysis?.fen !== currentFen) {
        return;
      }

      let nextGame = game;
      const labels: Record<number, MoveClassification> = {};
      const playedMoves: GameMove[] = [];

      for (const uci of pv.slice(0, clickedIndex + 1)) {
        const parsed = uciToMove(uci);
        if (!parsed) {
          break;
        }

        const appliedGame = applyManualMove(nextGame, parsed.from, parsed.to, parsed.promotion ?? "q");
        if (!appliedGame) {
          break;
        }

        const playedMove = appliedGame.moves[appliedGame.currentPly - 1];
        if (playedMove) {
          playedMoves.push(playedMove);
          labels[playedMove.ply] = isBookMove(appliedGame.moves.slice(0, playedMove.ply), playedMove.ply)
            ? "Book"
            : Object.keys(labels).length === 0
              ? classifyCandidateMove(candidateIndex)
              : "Best";
        }

        nextGame = appliedGame;
      }

      if (nextGame !== game) {
        const retainedPly = game.currentPly;
        gameRef.current = nextGame;
        setGame(nextGame);
        setReviews((current) => retainRecordThroughPly(current, retainedPly));
        setPendingMoveReviews((current) => retainRecordThroughPly(current, retainedPly));
        setQuickClassifications((current) => ({
          ...retainRecordThroughPly(current, retainedPly),
          ...labels
        }));
        playedMoves.forEach((playedMove) => queueMoveReview(playedMove, nextGame.moves));
        setMessage("Candidate line played");
      }
    },
    [analysis, currentFen, game, queueMoveReview]
  );

  const startPracticeTarget = useCallback(
    (target: PracticeTarget, source: PracticeSession["source"]) => {
      const originalMove = game.moves[target.ply - 1];
      if (!originalMove) {
        return;
      }

      setPracticeSession({
        source,
        ply: target.ply,
        san: target.san,
        classification: target.classification,
        bestMove: target.bestMove,
        bestMoveSan: bestMoveToSan(originalMove.before, target.bestMove),
        revealed: false
      });
      setGame(movePly(game, target.ply - 1));
      setMessage(source === "puzzle" ? "Puzzle position loaded" : "Retry position loaded");
    },
    [game]
  );

  const revealPracticeMove = useCallback(() => {
    setPracticeSession((current) => (current ? { ...current, revealed: true, feedback: "Suggestion revealed." } : current));
  }, []);

  const playPracticeSuggestion = useCallback(() => {
    if (!practiceSession?.bestMove) {
      return;
    }

    const parsed = uciToMove(practiceSession.bestMove);
    if (!parsed) {
      return;
    }

    const baseGame = movePly(game, practiceSession.ply - 1);
    const nextGame = applyManualMove(baseGame, parsed.from, parsed.to, parsed.promotion ?? "q");
    if (!nextGame) {
      return;
    }

    const playedMove = nextGame.moves[nextGame.currentPly - 1];
    const retainedPly = practiceSession.ply - 1;
    gameRef.current = nextGame;
    setGame(nextGame);
    setReviews((current) => retainRecordThroughPly(current, retainedPly));
    setPendingMoveReviews((current) => retainRecordThroughPly(current, retainedPly));
    setQuickClassifications((current) => ({
      ...retainRecordThroughPly(current, retainedPly),
      ...(playedMove ? { [playedMove.ply]: "Best" as MoveClassification } : {})
    }));
    if (playedMove) {
      queueMoveReview(playedMove, nextGame.moves);
    }
    setPracticeSession((current) => (current ? { ...current, revealed: true, feedback: "Suggested move played on the board." } : current));
    setMessage("Practice suggestion played");
  }, [game, practiceSession, queueMoveReview]);

  const reviewMovesProgressively = useCallback(
    async (moves: GameMove[], startMessage = "Review running") => {
      if (moves.length === 0) {
        setMessage("Load a PGN or make moves before reviewing.");
        return;
      }

      cancelReviewRef.current = false;
      automaticReviewVersionRef.current += 1;
      const reviewVersion = automaticReviewVersionRef.current;
      disposeReviewClients();
      setReviews({});
      setQuickClassifications({});
      setPendingMoveReviews(
        Object.fromEntries(moves.filter((move) => !isBookMove(moves, move.ply)).map((move) => [move.ply, moveSignature(move)]))
      );
      const depthPasses = buildReviewDepthPasses(engineAnalysisSettings.depth);
      const totalReviewSteps = moves.length * depthPasses.length;
      let completedReviewSteps = 0;
      setReviewProgress({ active: true, current: 0, total: totalReviewSteps });
      setMessage(startMessage);

      try {
        for (const depth of depthPasses) {
          if (cancelReviewRef.current || reviewVersion !== automaticReviewVersionRef.current) {
            break;
          }

          setMessage(`Reviewing depth ${depth}/${engineAnalysisSettings.depth}`);

          await runWithConcurrency(moves, GAME_REVIEW_CONCURRENCY, async (move) => {
            if (cancelReviewRef.current || reviewVersion !== automaticReviewVersionRef.current) {
              return;
            }

            if (isBookMove(moves, move.ply)) {
              await reviewMoveProgressively(move, moves, reviewVersion, { depth });
            } else {
              const beforeClient = new StockfishClient();
              const afterClient = new StockfishClient();
              const disposeClients = () => {
                beforeClient.dispose();
                afterClient.dispose();
              };

              activeReviewDisposersRef.current.add(disposeClients);

              try {
                await reviewMoveProgressively(move, moves, reviewVersion, { afterClient, beforeClient, depth });
              } finally {
                activeReviewDisposersRef.current.delete(disposeClients);
                disposeClients();
              }
            }

            completedReviewSteps += 1;
            setReviewProgress({ active: true, current: completedReviewSteps, total: totalReviewSteps });
          });
        }

        if (reviewVersion === automaticReviewVersionRef.current) {
          setReviewProgress((progress) => ({ ...progress, active: false }));
          setMessage(cancelReviewRef.current ? "Review cancelled" : "Review complete");
        }
      } catch (error) {
        if (reviewVersion === automaticReviewVersionRef.current) {
          setEngineStatus("error");
          setReviewProgress((progress) => ({ ...progress, active: false }));
          setMessage(error instanceof Error ? error.message : "Game review failed.");
        }
      }
    },
    [disposeReviewClients, engineAnalysisSettings.depth, reviewMoveProgressively]
  );

  const loadFenText = useCallback(
    (value: string, successMessage = "FEN loaded") => {
      const result = loadFen(value);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      clearMoveQualityState();
      const nextGame = setGameFromFen(result.value);
      gameRef.current = nextGame;
      setFenInput(value);
      setGame(nextGame);
      setMessage(successMessage);
    },
    [clearMoveQualityState]
  );

  const loadPgnText = useCallback(
    (value: string, successMessage = "PGN loaded") => {
      const result = parsePgn(value);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }

      clearMoveQualityState();
      const nextGame = setGameFromMoves(result.value.initialFen, result.value.moves);
      gameRef.current = nextGame;
      setPgnInput(value);
      setGame(nextGame);

      if (nextGame.moves.length > 0) {
        void reviewMovesProgressively(
          nextGame.moves,
          hasLongGameWarning(nextGame.moves.length) ? `${successMessage}. Reviewing moves; long game may take time.` : `${successMessage}. Reviewing moves.`
        );
        return;
      }

      setMessage(successMessage);
    },
    [clearMoveQualityState, reviewMovesProgressively]
  );

  const handleFenLoad = () => {
    loadFenText(fenInput);
  };

  const handlePgnLoad = () => {
    loadPgnText(pgnInput);
  };

  const applyBoardMove = useCallback(
    (sourceSquare: string, targetSquare: string) => {
      const nextGame = applyManualMove(game, sourceSquare, targetSquare);
      if (!nextGame) {
        return false;
      }

      gameRef.current = nextGame;
      setGame(nextGame);
      const playedMove = nextGame.moves[nextGame.currentPly - 1];
      const classification = playedMove ? classifyMoveFromCurrentCandidates(playedMove, nextGame.moves) : undefined;
      const retainedPly = game.currentPly;
      setQuickClassifications((current) => {
        const retained = retainRecordThroughPly(current, retainedPly);
        return playedMove && classification ? { ...retained, [playedMove.ply]: classification } : retained;
      });
      setReviews((current) => retainRecordThroughPly(current, retainedPly));
      setPendingMoveReviews((current) => retainRecordThroughPly(current, retainedPly));
      if (playedMove) {
        queueMoveReview(playedMove, nextGame.moves);
      }
      if (playedMove && practiceSession && game.currentPly === practiceSession.ply - 1) {
        const isSuggestedMove = Boolean(practiceSession.bestMove && playedMove.uci === practiceSession.bestMove);
        const isStrongCandidate = classification === "Best" || classification === "Excellent";
        setPracticeSession((current) =>
          current && current.ply === practiceSession.ply
            ? {
                ...current,
                revealed: current.revealed || isSuggestedMove,
                feedback: isSuggestedMove || isStrongCandidate ? "Strong improvement found." : "Legal move added. Compare it with the suggestion or try another line."
              }
            : current
        );
      }
      setMessage("Move added");
      setSelectedSquare(null);
      return true;
    },
    [classifyMoveFromCurrentCandidates, game, practiceSession, queueMoveReview]
  );

  const handleDrop = useCallback(
    ({ sourceSquare, targetSquare }: PieceDropHandlerArgs) => {
      if (!targetSquare) {
        return false;
      }

      return applyBoardMove(sourceSquare, targetSquare);
    },
    [applyBoardMove]
  );

  const handleSquareClick = useCallback(
    ({ piece, square }: SquareHandlerArgs) => {
      const clickedSquare = toChessSquare(square);
      if (!clickedSquare) {
        setSelectedSquare(null);
        return;
      }

      if (selectedSquareForPosition) {
        if (clickedSquare === selectedSquareForPosition) {
          setSelectedSquare(null);
          return;
        }

        if (legalTargetSquares.has(clickedSquare)) {
          applyBoardMove(selectedSquareForPosition, clickedSquare);
          return;
        }

        setSelectedSquare(null);
        return;
      }

      if (!piece) {
        return;
      }

      const selectedPiece = currentChess.get(clickedSquare);
      if (!selectedPiece || selectedPiece.color !== currentChess.turn()) {
        return;
      }

      const hasLegalMoves = currentChess.moves({ square: clickedSquare, verbose: true }).length > 0;
      setSelectedSquare(hasLegalMoves ? { fen: currentFen, square: clickedSquare } : null);
    },
    [applyBoardMove, currentChess, currentFen, legalTargetSquares, selectedSquareForPosition]
  );

  const stopAnalysis = () => {
    cancelReviewRef.current = true;
    automaticReviewVersionRef.current += 1;
    clientRef.current?.stop();
    disposeReviewClients();
    setPendingMoveReviews({});
    setReviewProgress((progress) => ({ ...progress, active: false }));
    setEngineStatus("ready");
    setMessage("Analysis stopped");
  };

  const reviewGame = () => {
    void reviewMovesProgressively(game.moves);
  };

  const squareRenderer = useCallback<SquareRenderer>(
    ({ square, children }) => {
      const renderedSquare = toChessSquare(square);
      const isLastMoveSquare = Boolean(currentMove && (currentMove.from === square || currentMove.to === square));
      const isDestinationSquare = Boolean(currentMove && currentMove.to === square);
      const isSelectedSquare = Boolean(renderedSquare && renderedSquare === selectedSquareForPosition);
      const showLegalTarget = Boolean(renderedSquare && legalTargetSquares.has(renderedSquare) && showLegalMoveHints);

      return (
        <div
          className={clsx(
            styles.boardSquare,
            isLastMoveSquare && styles.lastMoveSquare,
            isDestinationSquare && styles.lastMoveDestination,
            isSelectedSquare && styles.selectedMoveSquare,
            showLegalTarget && styles.legalTargetSquare
          )}
          data-selected-square={isSelectedSquare ? "true" : undefined}
          data-legal-move-target={showLegalTarget ? "true" : undefined}
          style={{ "--last-move-color": currentMoveMeta.color } as CSSProperties}
        >
          {isLastMoveSquare ? <span className={styles.lastMoveWash} aria-hidden="true" /> : null}
          {children}
          {showLegalTarget ? <span className={styles.legalMoveDot} aria-hidden="true" /> : null}
          {isDestinationSquare && currentMoveClassification ? (
            <span
              className={clsx(styles.moveQualityBadge, currentMoveClassification === "Book" && styles.bookMoveQualityBadge)}
              aria-label={currentMoveMeta.label}
            >
              {currentMoveClassification === "Book" ? <BookOpen size={14} strokeWidth={3} aria-hidden="true" /> : currentMoveMeta.symbol}
            </span>
          ) : null}
        </div>
      );
    },
    [
      currentMove,
      currentMoveClassification,
      currentMoveMeta.color,
      currentMoveMeta.label,
      currentMoveMeta.symbol,
      legalTargetSquares,
      selectedSquareForPosition,
      showLegalMoveHints
    ]
  );

  const boardOptions = useMemo(
    () => ({
      id: "glass-chess-board",
      position: currentFen,
      boardOrientation: orientation,
      showNotation: true,
      animationDurationInMs: 120,
      allowDrawingArrows: true,
      onPieceDrop: handleDrop,
      onSquareClick: handleSquareClick,
      squareRenderer,
      boardStyle: {
        borderRadius: "8px",
        overflow: "hidden",
        boxShadow: "0 20px 70px rgba(0, 0, 0, 0.35)"
      },
      lightSquareStyle: { backgroundColor: "#d5e5dc" },
      darkSquareStyle: { backgroundColor: "#395f63" },
      dropSquareStyle: { boxShadow: "inset 0 0 0 4px rgba(126, 231, 184, 0.55)" }
    }),
    [currentFen, handleDrop, handleSquareClick, orientation, squareRenderer]
  );

  return (
    <section className={styles.workspace}>
      <div className={styles.header}>
        <div>
          <p className="eyebrow">{showReviewTools ? "Review workspace" : "Analysis workspace"}</p>
          <h1>{showReviewTools ? "Review games and practice mistakes" : "Analyze positions and games locally"}</h1>
        </div>
        <p className={styles.srStatus} aria-live="polite">
          {engineStatus}. {message}
        </p>
      </div>

      <div className={styles.grid}>
        <section className={styles.boardPanel} aria-label="Chess board">
          <div className={styles.boardWithEvaluation}>
            <div
              className={styles.evaluationBar}
              aria-label={`Current position evaluation ${evaluationBar.label}`}
              style={{ "--white-evaluation": `${evaluationBar.whitePercent}%` } as CSSProperties}
            >
              <span className={styles.evaluationTrack} aria-hidden="true">
                <span className={styles.evaluationWhite} />
                <span className={styles.evaluationMidline} />
                <span
                  className={clsx(
                    styles.evaluationLabel,
                    evaluationBar.labelSide === "white" ? styles.evaluationLabelWhite : styles.evaluationLabelBlack
                  )}
                >
                  {evaluationBar.label}
                </span>
              </span>
            </div>
            <div className={styles.boardFrame}>
              <Chessboard options={boardOptions} />
            </div>
          </div>
        </section>

        <aside className={styles.sidePanel}>
          <div className={styles.analysisTabs} role="tablist" aria-label="Analysis panel tabs">
            <button type="button" className={styles.activeTab} role="tab" aria-selected="true">
              {showReviewTools ? "Review" : "Analysis"}
            </button>
            <button type="button" role="tab" aria-selected="false" disabled>
              Coach
            </button>
          </div>

          <section className={styles.scorePanel} aria-label="Current analysis score">
            <div className={styles.scoreMain}>
              <span className={styles.scoreValue}>{displayScore}</span>
            </div>
            <div className={styles.engineMeta}>
              <strong>{depthLabel}</strong>
              <span>SF 18 Lite</span>
            </div>
            <button type="button" className={styles.iconButton} aria-label="Open Stockfish settings" onClick={() => setIsSettingsOpen(true)}>
              <Settings size={20} aria-hidden="true" />
            </button>
          </section>
          <section className={styles.openingPanel} aria-label="Current opening">
            <span>{currentOpening ? currentOpening.eco : "Opening"}</span>
            <strong>{currentOpening ? currentOpening.name : game.currentPly === 0 ? "Starting position" : "Out of book"}</strong>
          </section>
          <section className={styles.engineProgressPanel} aria-label="Engine progress">
            <div>
              <span>{reviewProgress.active ? "Review progress" : "Engine progress"}</span>
              <strong>
                {reviewProgress.active
                  ? `Reviewing ${reviewProgress.current} of ${reviewProgress.total}`
                  : engineBusy
                    ? `${message}`
                    : "Ready for the current position"}
              </strong>
            </div>
            <div>
              <span>Top move</span>
              <strong>{topLineMoves[0]?.san ?? (engineBusy ? "Calculating" : "Waiting")}</strong>
            </div>
            <button type="button" onClick={stopAnalysis} disabled={!engineBusy}>
              <Square size={14} aria-hidden="true" />
              Stop
            </button>
          </section>

          <div className={styles.analysisScroll}>
            <section className={styles.candidatePanel} aria-label="Best candidate moves">
              <ol className={styles.candidateList}>
                {[0, 1, 2].map((candidateIndex) => {
                  const line = candidateLines[candidateIndex];

                  if (!line) {
                    const hasLegalMoveSlot = candidateIndex < legalCandidateCount;
                    return (
                      <li key={`candidate-placeholder-${candidateIndex}`} className={styles.emptyCandidate}>
                        <div className={styles.candidatePrimary}>
                          <span>
                            {hasLegalMoveSlot
                              ? engineStatus === "loading" || engineStatus === "analyzing"
                                ? "Calculating"
                                : "Waiting"
                              : "No legal move"}
                          </span>
                          <strong>-</strong>
                        </div>
                        {settings.showBestLine ? <p>{hasLegalMoveSlot ? "Best move line will appear here." : "This position has fewer candidate moves."}</p> : null}
                      </li>
                    );
                  }

                  const pvMoves = buildPvDisplayMoves(currentFen, line.pv);
                  const firstMove = pvMoves[0];
                  const canPlayCandidate = Boolean(activeAnalysis);
                  return (
                    <li key={`${line.multiPv}-${line.pv.join("-")}`}>
                      <div className={styles.candidatePrimary}>
                        <button
                          type="button"
                          className={styles.candidateMoveButton}
                          disabled={!firstMove || !canPlayCandidate}
                          onClick={() => playCandidateSequence(line.pv, 0, candidateIndex)}
                        >
                          {firstMove?.san ?? line.pv[0] ?? "No move"}
                        </button>
                        <strong>{formatSettingScore(line.score, currentFen, settings.evalFormat)}</strong>
                      </div>
                      {settings.showBestLine ? (
                        <p className={styles.candidateContinuation}>
                          {pvMoves.length > 1
                            ? pvMoves.slice(1, 7).map((move, moveIndex) => (
                                <button
                                  type="button"
                                  key={`${move.uci}-${moveIndex}`}
                                  disabled={!canPlayCandidate}
                                  onClick={() => playCandidateSequence(line.pv, moveIndex + 1, candidateIndex)}
                                >
                                  {move.san}
                                </button>
                              ))
                            : "No continuation yet"}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </section>

            {emptyAnalysisState ? (
              <section className={styles.emptyStartPanel} aria-label="Start analysis options">
                <div>
                  <span>Start with a position</span>
                  <h2>Load a game, set a FEN, or play from the board.</h2>
                  <p>The board analyzes automatically as soon as a position changes.</p>
                </div>
                <div className={styles.emptyStartActions}>
                  <button type="button" onClick={() => loadPgnText(samplePgn, "Sample PGN loaded")}>
                    Load sample game
                  </button>
                  <button type="button" onClick={() => loadFenText(sampleFen, "Sample position loaded")}>
                    Load sample FEN
                  </button>
                </div>
              </section>
            ) : null}

            {showReviewTools ? (
              <>
                <section className={styles.reviewDashboard} aria-label="Review summary dashboard">
                  <div className={styles.sectionTitle}>
                    <span>
                      <BarChart3 size={16} aria-hidden="true" />
                      Review summary
                    </span>
                    <strong>{reviewSummary.reviewedCount > 0 ? `${reviewSummary.reviewedCount} moves` : "Waiting"}</strong>
                  </div>
                  <div className={styles.summaryGrid}>
                    <article>
                      <span>Accuracy</span>
                      <strong>{reviewSummary.accuracy === null ? "-" : `${reviewSummary.accuracy}%`}</strong>
                    </article>
                    <article>
                      <span>Strongest</span>
                      <strong>{reviewSummary.strongestMove ? `${reviewSummary.strongestMove.san}` : "-"}</strong>
                    </article>
                    <article>
                      <span>Weakest</span>
                      <strong>{reviewSummary.weakestMove ? `${reviewSummary.weakestMove.san}` : "-"}</strong>
                    </article>
                  </div>
                  <div className={styles.phaseGrid} aria-label="Game phase issue summary">
                    {Object.entries(reviewSummary.phases).map(([phase, stats]) => (
                      <span key={phase}>
                        {phase}: {stats.issues}/{stats.reviewed}
                      </span>
                    ))}
                  </div>
                  <div className={styles.qualityChips} aria-label="Move quality counts">
                    {SUMMARY_LABELS.filter((label) => reviewSummary.counts[label]).map((label) => (
                      <span key={label} style={{ "--classification-color": colorForMoveLabel(label) } as CSSProperties}>
                        {label} {reviewSummary.counts[label]}
                      </span>
                    ))}
                    {reviewSummary.reviewedCount === 0 ? <span>Load a PGN or make moves to build a review.</span> : null}
                  </div>
                </section>

                <section className={styles.insightPanel} aria-label="Selected move explanation">
                  <div className={styles.sectionTitle}>
                    <span>
                      <Lightbulb size={16} aria-hidden="true" />
                      Move insight
                    </span>
                    <strong>{currentMove ? currentMove.san : "Start"}</strong>
                  </div>
                  {currentMoveExplanation ? (
                    <>
                      <h2>{currentMoveExplanation.title}</h2>
                      <p>{currentMoveExplanation.detail}</p>
                      {currentMoveExplanation.bestMove ? <span className={styles.bestMoveHint}>Engine idea: {currentMoveExplanation.bestMove}</span> : null}
                    </>
                  ) : (
                    <p>Select a reviewed move to see a local explanation.</p>
                  )}
                </section>

                <section className={styles.practicePanel} aria-label="Mistake retry and puzzle practice">
                  <div className={styles.sectionTitle}>
                    <span>
                      <Target size={16} aria-hidden="true" />
                      Practice
                    </span>
                    <strong>
                      {retryTargets.length} retry / {puzzleCandidates.length} puzzle
                    </strong>
                  </div>
                  <div className={styles.practiceActions}>
                    <button type="button" disabled={retryTargets.length === 0} onClick={() => retryTargets[0] && startPracticeTarget(retryTargets[0], "retry")}>
                      Retry first issue
                    </button>
                    <button type="button" disabled={puzzleCandidates.length === 0} onClick={() => puzzleCandidates[0] && startPracticeTarget(puzzleCandidates[0], "puzzle")}>
                      Start puzzle
                    </button>
                  </div>
                  {practiceSession ? (
                    <div className={styles.activePractice}>
                      <span>{practiceSession.source === "puzzle" ? "Puzzle" : "Retry"} position</span>
                      <strong>
                        {practiceSession.ply}. {practiceSession.san} - {practiceSession.classification}
                      </strong>
                      {practiceSession.feedback ? <p>{practiceSession.feedback}</p> : <p>Try a better move from the current board position.</p>}
                      {practiceSession.revealed && practiceSession.bestMoveSan ? <span className={styles.bestMoveHint}>Suggestion: {practiceSession.bestMoveSan}</span> : null}
                      <div className={styles.practiceActions}>
                        <button type="button" onClick={revealPracticeMove} disabled={!practiceSession.bestMoveSan}>
                          Reveal
                        </button>
                        <button type="button" onClick={playPracticeSuggestion} disabled={!practiceSession.bestMove}>
                          Play suggestion
                        </button>
                        <button type="button" onClick={() => setGame(movePly(game, practiceSession.ply - 1))}>
                          Return
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {puzzleCandidates.length > 0 ? (
                    <ol className={styles.practiceList} aria-label="Extracted puzzle candidates">
                      {puzzleCandidates.slice(0, 3).map((target) => (
                        <li key={`puzzle-${target.ply}`}>
                          <button type="button" onClick={() => startPracticeTarget(target, "puzzle")}>
                            <Trophy size={14} aria-hidden="true" />
                            {target.ply}. {target.san}
                            <span>{target.reason}</span>
                          </button>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </section>

                <section className={styles.timelinePanel} aria-label="Critical moments timeline">
                  <div className={styles.sectionTitle}>
                    <span>Critical moments</span>
                    <strong>{criticalMoments.length}</strong>
                  </div>
                  {criticalMoments.length > 0 ? (
                    <>
                      <div className={styles.timelineRail} aria-hidden="true">
                        {criticalMoments.slice(0, 12).map((moment) => (
                          <span
                            key={`rail-${moment.ply}`}
                            style={
                              {
                                "--moment-position": `${game.moves.length > 1 ? ((moment.ply - 1) / (game.moves.length - 1)) * 100 : 0}%`,
                                "--classification-color": colorForMoveLabel(moment.classification)
                              } as CSSProperties
                            }
                          />
                        ))}
                      </div>
                      <ol className={styles.momentList}>
                        {criticalMoments.slice(0, 6).map((moment) => (
                          <li key={`moment-${moment.ply}`}>
                            <button
                              type="button"
                              style={{ "--classification-color": colorForMoveLabel(moment.classification) } as CSSProperties}
                              onClick={() => setGame(movePly(game, moment.ply))}
                            >
                              <span>{moment.label}</span>
                              <strong>{moment.loss ? `-${formatPawnSwing(moment.loss)}` : moment.gain ? `+${formatPawnSwing(moment.gain)}` : "0.0"}</strong>
                            </button>
                          </li>
                        ))}
                      </ol>
                    </>
                  ) : (
                    <p>No major swings found yet.</p>
                  )}
                </section>
              </>
            ) : null}

            <section className={styles.moveHistory} aria-label="Previous moves">
              <div className={styles.moveHeader}>
                <h2>Previous moves</h2>
                <span>{currentMove ? currentMove.san : "Start"}</span>
              </div>
              <div className={styles.positionMeta}>
                <span>{reviewProgress.active ? `Reviewing ${reviewProgress.current} of ${reviewProgress.total}` : `${currentChess.turn() === "w" ? "White" : "Black"} to move`}</span>
              </div>
              {reviewProgress.active ? (
                <progress className={styles.progress} value={reviewProgress.current} max={reviewProgress.total}>
                  {reviewProgress.current} of {reviewProgress.total}
                </progress>
              ) : null}
              <ol className={styles.moveTable}>
                {moveRows.map((row) => {
                  const whiteLabel = moveLabel(row.white);
                  const blackLabel = moveLabel(row.black);

                  return (
                    <li key={row.number}>
                      <span className={styles.moveNumber}>{row.number}.</span>
                      <button
                        type="button"
                        className={row.white && row.white.ply === game.currentPly ? styles.currentMoveButton : undefined}
                        disabled={!row.white}
                        onClick={() => row.white && setGame(movePly(game, row.white.ply))}
                      >
                        {row.white?.san ?? ""}
                        {whiteLabel ? (
                          <small style={{ "--classification-color": colorForMoveLabel(whiteLabel) } as CSSProperties}>{whiteLabel}</small>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        className={row.black && row.black.ply === game.currentPly ? styles.currentMoveButton : undefined}
                        disabled={!row.black}
                        onClick={() => row.black && setGame(movePly(game, row.black.ply))}
                      >
                        {row.black?.san ?? ""}
                        {blackLabel ? (
                          <small style={{ "--classification-color": colorForMoveLabel(blackLabel) } as CSSProperties}>{blackLabel}</small>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          </div>

          <div className={styles.panelNav} aria-label="Move navigation">
            <button type="button" onClick={() => setGame(movePly(game, 0))} aria-label="Go to start position">
              <ChevronsLeft size={22} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setGame(movePly(game, game.currentPly - 1))} aria-label="Previous move">
              <StepBack size={22} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setGame(movePly(game, game.currentPly + 1))} aria-label="Next move">
              <StepForward size={22} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setGame(movePly(game, game.moves.length))} aria-label="Go to final position">
              <ChevronsRight size={22} aria-hidden="true" />
            </button>
            <div className={styles.navMenuWrap} ref={navMenuRef}>
              <button
                type="button"
                aria-label="Move navigation settings"
                aria-haspopup="menu"
                aria-expanded={isNavMenuOpen}
                onClick={() => setIsNavMenuOpen((value) => !value)}
              >
                <MoreVertical size={22} aria-hidden="true" />
              </button>
              {isNavMenuOpen ? (
                <div className={styles.navMenu} role="menu" aria-label="Move navigation settings">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOrientation((value) => (value === "white" ? "black" : "white"));
                      setIsNavMenuOpen(false);
                    }}
                  >
                    <FlipHorizontal size={16} aria-hidden="true" />
                    Flip board
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </aside>

        <section className={styles.importPanel}>
          <div className={styles.currentFenPanel}>
            <label htmlFor="current-fen">Current FEN</label>
            <output id="current-fen" aria-label="Current FEN">
              {currentFen}
            </output>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelTitle}>
              <h2>FEN import</h2>
              <button type="button" onClick={handleFenLoad}>
                Load FEN
              </button>
            </div>
            <textarea value={fenInput} onChange={(event) => setFenInput(event.target.value)} aria-label="FEN input" />
          </div>

          <div className={styles.panel}>
            <div className={styles.panelTitle}>
              <h2>PGN import</h2>
              <button type="button" onClick={handlePgnLoad}>
                Load PGN
              </button>
            </div>
            <textarea value={pgnInput} onChange={(event) => setPgnInput(event.target.value)} aria-label="PGN input" />
          </div>

          <div className={styles.screenshotImportPanel}>
            <ScreenshotPositionImporter onLoadFen={(fen) => loadFenText(fen, "Screenshot position loaded")} />
          </div>
        </section>
      </div>

      {isSettingsOpen ? (
        <div className={styles.modalBackdrop} role="presentation" onClick={() => setIsSettingsOpen(false)}>
          <section
            className={styles.settingsModal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="stockfish-settings-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h2 id="stockfish-settings-title">Stockfish settings</h2>
              <button type="button" aria-label="Close Stockfish settings" onClick={() => setIsSettingsOpen(false)}>
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <label>
              Engine mode
              <select value={settings.mode} onChange={(event) => setSettings({ ...settings, mode: event.target.value as EngineSettings["mode"] })}>
                <option value="lite">Lite browser engine</option>
                <option value="strong" disabled>
                  Stronger mode planned
                </option>
              </select>
            </label>
            <label>
              Depth
              <input
                type="number"
                min="4"
                max="40"
                value={settings.depth}
                onChange={(event) => setSettings({ ...settings, depth: Number(event.target.value) })}
              />
            </label>
            <label>
              Evaluation display
              <select
                value={settings.evalFormat}
                onChange={(event) => setSettings({ ...settings, evalFormat: event.target.value as EngineSettings["evalFormat"] })}
              >
                <option value="centipawn">Centipawn</option>
                <option value="mate">Mate</option>
              </select>
            </label>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={settings.showBestLine}
                onChange={(event) => setSettings({ ...settings, showBestLine: event.target.checked })}
              />
              Show best line
            </label>
            <label className={styles.checkbox}>
              <input type="checkbox" checked={showLegalMoveHints} onChange={(event) => setShowLegalMoveHints(event.target.checked)} />
              Show legal move dots
            </label>
            <label>
              Board orientation
              <select value={orientation} onChange={(event) => setOrientation(event.target.value as BoardOrientation)}>
                <option value="white">White</option>
                <option value="black">Black</option>
              </select>
            </label>
            <div className={styles.modalActions}>
              <button type="button" onClick={() => setOrientation((value) => (value === "white" ? "black" : "white"))}>
                <FlipHorizontal size={16} aria-hidden="true" />
                Flip board
              </button>
              <button
                type="button"
                onClick={() => {
                  clearMoveQualityState();
                  const nextGame = createInitialGameState();
                  gameRef.current = nextGame;
                  setGame(nextGame);
                  setMessage("Board reset");
                }}
              >
                <RotateCcw size={16} aria-hidden="true" />
                Reset board
              </button>
              <button type="button" onClick={reviewGame} disabled={reviewProgress.active || game.moves.length === 0}>
                <BarChart3 size={16} aria-hidden="true" />
                Review game
              </button>
              <button type="button" onClick={stopAnalysis} disabled={!reviewProgress.active && engineStatus !== "analyzing"}>
                <Square size={16} aria-hidden="true" />
                Stop analysis
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
