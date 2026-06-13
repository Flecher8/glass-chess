import Link from "next/link";

import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <main className="page">
      <section className={styles.panel}>
        <p className="eyebrow">Not Found</p>
        <h1>That position is not on the board.</h1>
        <p>The page you requested does not exist. Return to the analysis workspace or the home page.</p>
        <div className={styles.actions}>
          <Link href="/analysis/">Open analysis</Link>
          <Link href="/">Go home</Link>
        </div>
      </section>
    </main>
  );
}
