import { ArrowRight, Brain, ShieldCheck, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { HomeBoardPreview } from "@/components/chess/HomeBoardPreview";
import { HeroThreeScene } from "@/components/visual/HeroThreeScene";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Browser Chess Analysis",
  description:
    "Analyze chess games in the browser with local Stockfish evaluation, PGN import, FEN import, and engine-assisted move review."
};

const features = [
  {
    icon: Brain,
    title: "Engine review",
    text: "Evaluate positions, inspect the best move, and review candidate lines from local Stockfish analysis."
  },
  {
    icon: ShieldCheck,
    title: "Local by default",
    text: "PGN and FEN analysis runs in the browser. The MVP has no accounts, database, analytics, or tracking cookies."
  },
  {
    icon: Zap,
    title: "Static ready",
    text: "The app is built for static export and browser workers, keeping the public pages lightweight."
  }
];

export default function HomePage() {
  return (
    <main>
      <section className={styles.hero}>
        <HeroThreeScene />
        <div className={styles.heroInner}>
          <div className={styles.heroText}>
            <p className="eyebrow">Browser chess analysis</p>
            <h1>Glass Chess</h1>
            <p>
              Import games, inspect positions, review mistakes, and run Stockfish locally in a polished analysis
              workspace built for privacy-first chess improvement.
            </p>
            <div className={styles.actions}>
              <Link href="/analysis/" className={styles.primaryAction}>
                Open analysis
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link href="/review/" className={styles.secondaryAction}>
                Review a game
              </Link>
            </div>
          </div>
          <div className={styles.heroStats} aria-label="Product capabilities">
            <span>Local Stockfish</span>
            <span>PGN and FEN</span>
            <span>Move review</span>
          </div>
          <HomeBoardPreview />
        </div>
      </section>

      <section className={styles.featureGrid} aria-label="Product highlights">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <article key={feature.title} className={styles.feature}>
              <Icon size={22} aria-hidden="true" />
              <h2>{feature.title}</h2>
              <p>{feature.text}</p>
            </article>
          );
        })}
      </section>
    </main>
  );
}
