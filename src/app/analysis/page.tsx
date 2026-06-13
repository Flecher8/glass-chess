import type { Metadata } from "next";

import { AnalysisTool } from "@/components/chess/AnalysisTool";

export const metadata: Metadata = {
  title: "Analysis",
  description:
    "Import PGN or FEN, navigate moves, make legal board moves, and run local Stockfish analysis in the browser."
};

export default function AnalysisPage() {
  return (
    <main>
      <AnalysisTool />
    </main>
  );
}
