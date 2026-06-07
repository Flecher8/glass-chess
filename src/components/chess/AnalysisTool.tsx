"use client";

import { Chess } from "chess.js";
import clsx from "clsx";
import {
  BarChart3,
  BookOpen,
  ChevronsLeft,
  ChevronsRight,
  FlipHorizontal,
  MoreVertical,
  RotateCcw,
  Settings,
  Square,
  StepBack,
  StepForward,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Chessboard, type PieceDropHandlerArgs, type SquareRenderer } from "react-chessboard";

import { classifyMove, type MoveClassification, type MoveReview } from "@/lib/analysis/move-classification";
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

const defaultSettings: EngineSettings = {
  mode: "lite",
  depth: 25,
  multiPv: 3,
  showBestLine: true,
  evalFormat: "centipawn"
};

const PREFERENCES_VERSION = 2;

const samplePgn = `[Event "Sample Game"]
[White "White"]
[Black "Black"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 *`;

type MoveDisplayLabel = MoveClassification | "Reviewing";

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

export function AnalysisTool() {
  const [game, setGame] = useState(createInitialGameState);
  const [fenInput, setFenInput] = useState(STARTING_FEN);
  const [pgnInput, setPgnInput] = useState(samplePgn);
  const [message, setMessage] = useState("Ready");
  const [orientation, setOrientation] = useState<BoardOrientation>("white");
  const [settings, setSettings] = useState<EngineSettings>(defaultSettings);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isNavMenuOpen, setIsNavMenuOpen] = useState(false);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>("idle");
  const [analysis, setAnalysis] = useState<EngineAnalysisResult | null>(null);
  const [reviews, setReviews] = useState<Record<number, MoveReview>>({});
  const [quickClassifications, setQuickClassifications] = useState<Record<number, MoveClassification>>({});
  const [pendingMoveReviews, setPendingMoveReviews] = useState<Record<number, string>>({});
  const [reviewProgress, setReviewProgress] = useState({ active: false, current: 0, total: 0 });
  const clientRef = useRef<StockfishClient | null>(null);
  const reviewClientRef = useRef<StockfishClient | null>(null);
  const cancelReviewRef = useRef(false);
  const autoAnalysisRef = useRef(0);
  const automaticReviewVersionRef = useRef(0);
  const reviewQueueRef = useRef<Promise<void>>(Promise.resolve());
  const gameRef = useRef(game);
  const navMenuRef = useRef<HTMLDivElement | null>(null);

  const currentFen = useMemo(() => fenAtPly(game), [game]);
  const currentChess = useMemo(() => chessAtPly(game), [game]);
  const currentMove = game.currentPly > 0 ? game.moves[game.currentPly - 1] : null;
  const currentOpening = useMemo(() => findOpening(game.moves.slice(0, game.currentPly)), [game.currentPly, game.moves]);
  const currentMoveClassification = currentMove
    ? (reviews[currentMove.ply]?.classification ?? quickClassifications[currentMove.ply] ?? (isBookMove(game.moves, currentMove.ply) ? "Book" : undefined))
    : undefined;
  const currentMoveMeta = currentMoveClassification ? moveQualityMeta[currentMoveClassification] : neutralMoveMeta;
  const activeAnalysis = analysis?.fen === currentFen ? analysis : null;
  const currentLine = activeAnalysis?.lines[0];
  const candidateLines = activeAnalysis?.lines.slice(0, 3) ?? [];
  const currentScore = formatSettingScore(currentLine?.score, currentFen, settings.evalFormat);
  const displayScore = !currentLine && (engineStatus === "loading" || engineStatus === "analyzing") ? "Analyzing..." : currentScore;
  const analyzedDepth = currentLine?.depth ?? 0;
  const depthLabel = analyzedDepth > 0 ? `Depth ${analyzedDepth}/${settings.depth}` : `Depth ${settings.depth}`;
  const evaluationBar = useMemo(() => buildEvaluationBar(currentLine?.score, currentFen), [currentFen, currentLine?.score]);
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
        settings
      })
    );
  }, [orientation, settings]);

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
    return () => {
      clientRef.current?.dispose();
      reviewClientRef.current?.dispose();
    };
  }, []);

  const getClient = useCallback(() => {
    if (!clientRef.current) {
      clientRef.current = new StockfishClient();
    }
    return clientRef.current;
  }, []);

  const getReviewClient = useCallback(() => {
    if (!reviewClientRef.current) {
      reviewClientRef.current = new StockfishClient();
    }
    return reviewClientRef.current;
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
    reviewClientRef.current?.stop();
    setReviews({});
    setQuickClassifications({});
    setPendingMoveReviews({});
  }, []);

  const queueMoveReview = useCallback(
    (move: GameMove, movesSnapshot: GameMove[]) => {
      if (isBookMove(movesSnapshot, move.ply)) {
        return;
      }

      const signature = moveSignature(move);
      const reviewVersion = automaticReviewVersionRef.current;
      const reviewSettings: EngineSettings = {
        ...engineAnalysisSettings,
        multiPv: 3,
        showBestLine: true,
        evalFormat: "centipawn"
      };

      setPendingMoveReviews((current) => ({ ...current, [move.ply]: signature }));

      const runReview = async () => {
        if (reviewVersion !== automaticReviewVersionRef.current) {
          return;
        }

        try {
          const client = getReviewClient();
          await client.init();
          const before = await client.analyze(move.before, reviewSettings);

          if (reviewVersion !== automaticReviewVersionRef.current) {
            return;
          }

          const after = await client.analyze(move.after, reviewSettings);

          if (reviewVersion !== automaticReviewVersionRef.current) {
            return;
          }

          const activeMove = gameRef.current.moves[move.ply - 1];
          if (!activeMove || moveSignature(activeMove) !== signature) {
            return;
          }

          const review = classifyMove(move, before, after);
          setReviews((current) => ({ ...current, [move.ply]: review }));
          setQuickClassifications((current) => removeRecordPly(current, move.ply));
          setMessage(`Move classified as ${review.classification}`);
        } catch (error) {
          if (!isEngineCancellation(error) && reviewVersion === automaticReviewVersionRef.current) {
            setMessage(error instanceof Error ? error.message : "Move review failed.");
          }
        } finally {
          setPendingMoveReviews((current) => (current[move.ply] === signature ? removeRecordPly(current, move.ply) : current));
        }
      };

      reviewQueueRef.current = reviewQueueRef.current.catch(() => undefined).then(runReview);
      void reviewQueueRef.current;
    },
    [engineAnalysisSettings, getReviewClient]
  );

  useEffect(() => {
    if (reviewProgress.active) {
      return;
    }

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
  }, [analyzeFen, currentFen, engineAnalysisSettings, reviewProgress.active]);

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

  const handleFenLoad = () => {
    const result = loadFen(fenInput);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    clearMoveQualityState();
    setGame(setGameFromFen(result.value));
    setMessage("FEN loaded");
  };

  const handlePgnLoad = () => {
    const result = parsePgn(pgnInput);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }

    clearMoveQualityState();
    setGame(setGameFromMoves(result.value.initialFen, result.value.moves));
    setMessage(hasLongGameWarning(result.value.moves.length) ? "PGN loaded. Long game analysis may take time." : "PGN loaded");
  };

  const handleDrop = useCallback(
    ({ sourceSquare, targetSquare }: PieceDropHandlerArgs) => {
      if (!targetSquare) {
        return false;
      }

      const nextGame = applyManualMove(game, sourceSquare, targetSquare);
      if (!nextGame) {
        return false;
      }

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
      setMessage("Move added");
      return true;
    },
    [classifyMoveFromCurrentCandidates, game, queueMoveReview]
  );

  const stopAnalysis = () => {
    cancelReviewRef.current = true;
    automaticReviewVersionRef.current += 1;
    clientRef.current?.stop();
    reviewClientRef.current?.stop();
    setPendingMoveReviews({});
    setReviewProgress((progress) => ({ ...progress, active: false }));
    setEngineStatus("ready");
    setMessage("Analysis stopped");
  };

  const reviewGame = async () => {
    if (game.moves.length === 0) {
      setMessage("Load a PGN or make moves before reviewing.");
      return;
    }

    cancelReviewRef.current = false;
    automaticReviewVersionRef.current += 1;
    reviewClientRef.current?.stop();
    setReviews({});
    setQuickClassifications({});
    setPendingMoveReviews({});
    setReviewProgress({ active: true, current: 0, total: game.moves.length });
    setMessage("Review running");

    try {
      for (const move of game.moves) {
        if (cancelReviewRef.current) {
          break;
        }

        if (isBookMove(game.moves, move.ply)) {
          setReviews((current) => ({ ...current, [move.ply]: { ply: move.ply, classification: "Book", pv: [] } }));
          setReviewProgress({ active: true, current: move.ply, total: game.moves.length });
          continue;
        }

        const before = await analyzeFen(move.before, engineAnalysisSettings);
        if (cancelReviewRef.current) {
          break;
        }

        const after = await analyzeFen(move.after, engineAnalysisSettings);
        const review = classifyMove(move, before, after);

        setReviews((current) => ({ ...current, [move.ply]: review }));
        setReviewProgress({ active: true, current: move.ply, total: game.moves.length });
      }

      setReviewProgress((progress) => ({ ...progress, active: false }));
      setMessage(cancelReviewRef.current ? "Review cancelled" : "Review complete");
    } catch (error) {
      setEngineStatus("error");
      setReviewProgress((progress) => ({ ...progress, active: false }));
      setMessage(error instanceof Error ? error.message : "Game review failed.");
    }
  };

  const squareRenderer = useCallback<SquareRenderer>(
    ({ square, children }) => {
      const isLastMoveSquare = Boolean(currentMove && (currentMove.from === square || currentMove.to === square));
      const isDestinationSquare = Boolean(currentMove && currentMove.to === square);

      return (
        <div
          className={clsx(styles.boardSquare, isLastMoveSquare && styles.lastMoveSquare, isDestinationSquare && styles.lastMoveDestination)}
          style={{ "--last-move-color": currentMoveMeta.color } as CSSProperties}
        >
          {isLastMoveSquare ? <span className={styles.lastMoveWash} aria-hidden="true" /> : null}
          {children}
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
    [currentMove, currentMoveClassification, currentMoveMeta.color, currentMoveMeta.label, currentMoveMeta.symbol]
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
    [currentFen, handleDrop, orientation, squareRenderer]
  );

  return (
    <section className={styles.workspace}>
      <div className={styles.header}>
        <div>
          <p className="eyebrow">Analysis workspace</p>
          <h1>Analyze positions and games locally</h1>
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
              Analysis
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

          <div className={styles.analysisScroll}>
            <section className={styles.candidatePanel} aria-label="Best candidate moves">
              <ol className={styles.candidateList}>
                {[0, 1, 2].map((candidateIndex) => {
                  const line = candidateLines[candidateIndex];

                  if (!line) {
                    return (
                      <li key={`candidate-placeholder-${candidateIndex}`} className={styles.emptyCandidate}>
                        <div className={styles.candidatePrimary}>
                          <span>{engineStatus === "loading" || engineStatus === "analyzing" ? "Calculating" : "Waiting"}</span>
                          <strong>-</strong>
                        </div>
                        {settings.showBestLine ? <p>Best move line will appear here.</p> : null}
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
                  setGame(createInitialGameState());
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
