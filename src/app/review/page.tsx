import type { Metadata } from "next";

import { AnalysisTool } from "@/components/chess/AnalysisTool";

export const metadata: Metadata = {
  title: "Review",
  description:
    "Review PGN games in the browser with local Stockfish analysis, move explanations, critical moments, retry practice, and puzzle candidates."
};

export default function ReviewPage() {
  return (
    <main>
      <AnalysisTool mode="review" />
    </main>
  );
}
