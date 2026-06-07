import type { Metadata } from "next";

import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms for using Glass Chess as a free browser chess analysis application."
};

export default function TermsPage() {
  return (
    <main className="page">
      <article className={styles.legal}>
        <p className="eyebrow">Terms of Service</p>
        <h1>Terms of Service</h1>
        <p>
          Glass Chess is provided for educational chess analysis. The app may change, pause, or discontinue features
          over time.
        </p>

        <h2>Analysis results</h2>
        <p>
          Engine output and move classifications are estimates based on selected depth, time, and device performance.
          Glass Chess does not guarantee perfect analysis or coaching accuracy.
        </p>

        <h2>User content</h2>
        <p>
          You are responsible for PGN, FEN, and other content you import into the app. Do not import content that you
          do not have the right to use.
        </p>

        <h2>Affiliations</h2>
        <p>
          Glass Chess is not affiliated with Chess.com, Chessigma, Lichess, FIDE, or Stockfish. Stockfish is a
          third-party GPL v3 chess engine used under its license.
        </p>

        <h2>No warranty</h2>
        <p>
          The app is provided as is, without warranties. Use it at your own discretion and verify important analysis
          independently.
        </p>
      </article>
    </main>
  );
}
