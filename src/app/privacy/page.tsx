import type { Metadata } from "next";

import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy details for Glass Chess, including local browser analysis and preference storage."
};

export default function PrivacyPage() {
  return (
    <main className="page">
      <article className={styles.legal}>
        <p className="eyebrow">Privacy Policy</p>
        <h1>Privacy Policy</h1>
        <p>
          Glass Chess is designed as a browser-only MVP. Imported PGN and FEN data is processed in your browser for
          chess analysis and is not sent to an application backend.
        </p>

        <h2>Accounts and storage</h2>
        <p>
          The MVP does not provide user accounts, payments, database storage, or remote game storage. If preferences
          are saved, they are limited to local browser storage, such as board orientation and engine settings.
        </p>

        <h2>Local analysis</h2>
        <p>
          Stockfish runs locally in a browser worker. Analysis quality depends on selected settings and device
          performance. You should avoid pasting sensitive personal information into PGN metadata.
        </p>

        <h2>Hosting logs</h2>
        <p>
          When deployed, the hosting provider may process standard request information needed to serve static files,
          such as IP address, user agent, request URL, and timestamps. Glass Chess does not add analytics or tracking
          cookies in the MVP.
        </p>
      </article>
    </main>
  );
}
