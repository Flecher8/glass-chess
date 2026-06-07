import type { Metadata } from "next";

import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Open Source Notices",
  description: "Open source notices and Stockfish GPL v3 attribution for Glass Chess."
};

export default function LicensesPage() {
  return (
    <main className="page">
      <article className={styles.legal}>
        <p className="eyebrow">Open Source Notices</p>
        <h1>Open Source Notices</h1>
        <p>
          Glass Chess uses open source libraries and includes unmodified Stockfish.js v18 lite single-thread browser
          files for local analysis.
        </p>

        <h2>Stockfish</h2>
        <p>
          This application uses Stockfish, a GPL v3 chess engine. Stockfish runs locally in your browser for analysis.
          Stockfish.js is copyright (c) 2026, Chess.com, LLC, and is based on Stockfish by T. Romstad, M. Costalba, J.
          Kiiski, G. Linscott, and other contributors.
        </p>
        <p>
          The bundled GPL text is available at <code>/vendor/stockfish/18/Copying.txt</code>. The bundled Stockfish.js
          README is available at <code>/vendor/stockfish/18/README.md</code>. Source code for Stockfish is available
          from the official Stockfish project and the Stockfish.js project.
        </p>

        <h2>Application dependencies</h2>
        <p>
          The MVP uses Next.js, React, chess.js, react-chessboard, lucide-react, and clsx. Their license details are
          tracked in the package metadata and should be reviewed before production release.
        </p>
      </article>
    </main>
  );
}
