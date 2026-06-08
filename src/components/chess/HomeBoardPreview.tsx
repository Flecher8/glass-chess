"use client";

import { BarChart3, Cpu, ShieldCheck } from "lucide-react";
import { useCallback, type CSSProperties } from "react";
import { Chessboard, type SquareRenderer } from "react-chessboard";

import styles from "./HomeBoardPreview.module.css";

const PREVIEW_FEN = "r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4";
const LAST_MOVE_SQUARES = new Set(["e2", "e4"]);

export function HomeBoardPreview() {
  const squareRenderer = useCallback<SquareRenderer>(({ square, children }) => {
    const isLastMove = LAST_MOVE_SQUARES.has(square);

    return (
      <div className={styles.square}>
        {isLastMove ? <span className={styles.lastMove} aria-hidden="true" /> : null}
        {children}
      </div>
    );
  }, []);

  return (
    <div className={styles.previewShell} aria-label="Chess analysis product preview">
      <div className={styles.previewTop}>
        <span>
          <Cpu size={15} aria-hidden="true" />
          Local engine
        </span>
        <strong>Depth 18</strong>
      </div>
      <div className={styles.previewGrid}>
        <div className={styles.boardColumn}>
          <div className={styles.evaluationBar} aria-hidden="true">
            <span className={styles.evaluationFill} />
            <strong>+0.6</strong>
          </div>
          <div className={styles.boardPreview} aria-hidden="true">
            <Chessboard
              options={{
                id: "glass-chess-home-preview",
                position: PREVIEW_FEN,
                boardOrientation: "white",
                showNotation: false,
                allowDragging: false,
                allowDrawingArrows: false,
                animationDurationInMs: 0,
                squareRenderer,
                lightSquareStyle: { backgroundColor: "#d5e5dc" },
                darkSquareStyle: { backgroundColor: "#395f63" },
                boardStyle: {
                  borderRadius: "8px",
                  overflow: "hidden"
                }
              }}
            />
          </div>
        </div>
        <div className={styles.sidePreview}>
          <div className={styles.scoreLine}>
            <span>Position</span>
            <strong>+0.64</strong>
          </div>
          <ol className={styles.candidates} aria-label="Preview candidate moves">
            {[
              ["Ba4", "+0.64", "Nf6 O-O Be7"],
              ["Nc3", "+0.48", "Nf6 d3 Be7"],
              ["Bxc6", "+0.31", "dxc6 Nxe5"]
            ].map(([move, score, line]) => (
              <li key={move} style={{ "--candidate-score": score } as CSSProperties}>
                <div>
                  <strong>{move}</strong>
                  <span>{line}</span>
                </div>
                <em>{score}</em>
              </li>
            ))}
          </ol>
          <div className={styles.previewFoot}>
            <span>
              <BarChart3 size={15} aria-hidden="true" />
              Review ready
            </span>
            <span>
              <ShieldCheck size={15} aria-hidden="true" />
              Browser local
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
