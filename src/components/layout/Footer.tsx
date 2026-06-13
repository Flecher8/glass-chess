import Link from "next/link";

import { navItems, siteConfig } from "@/lib/seo/site";
import styles from "./Footer.module.css";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.summary}>
          <strong>{siteConfig.name}</strong>
          <p>Browser-only chess analysis with local engine evaluation and privacy-focused defaults.</p>
        </div>
        <nav className={styles.links} aria-label="Footer navigation">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <p className={styles.notice}>
          This application uses Stockfish, a GPL v3 chess engine. Stockfish runs locally in your browser for
          analysis.
        </p>
        <p className={styles.copy}>Copyright (c) {year} Glass Chess.</p>
      </div>
    </footer>
  );
}
