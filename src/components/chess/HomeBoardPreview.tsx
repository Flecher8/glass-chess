"use client";

import { Chessboard } from "react-chessboard";

import { STARTING_FEN } from "@/lib/chess/fen";
import styles from "./HomeBoardPreview.module.css";

export function HomeBoardPreview() {
  return (
    <div className={styles.boardPreview} aria-hidden="true">
      <Chessboard
        options={{
          id: "glass-chess-home-preview",
          position: STARTING_FEN,
          boardOrientation: "white",
          showNotation: false,
          allowDragging: false,
          allowDrawingArrows: false,
          animationDurationInMs: 0,
          lightSquareStyle: { backgroundColor: "#d5e5dc" },
          darkSquareStyle: { backgroundColor: "#395f63" },
          boardStyle: {
            borderRadius: 0,
            overflow: "hidden"
          }
        }}
      />
    </div>
  );
}
