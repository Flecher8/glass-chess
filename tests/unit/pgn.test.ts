import { describe, expect, it } from "vitest";

import { parsePgn, sanitizePgnHeaders } from "@/lib/chess/pgn";

describe("PGN parsing", () => {
  it("parses a valid PGN and returns moves", () => {
    const result = parsePgn("[Event \"Test\"]\n\n1. e4 e5 2. Nf3 *");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.moves).toHaveLength(3);
      expect(result.value.headers.Event).toBe("Test");
    }
  });

  it("rejects invalid PGN", () => {
    const result = parsePgn("1. e4 e5 2. ThisIsNotAMove *");

    expect(result.ok).toBe(false);
  });

  it("sanitizes unsafe header characters", () => {
    const headers = sanitizePgnHeaders({ Event: "<script>Test</script>" });

    expect(headers.Event).toBe("scriptTest/script");
  });
});
