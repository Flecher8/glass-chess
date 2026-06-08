import { expect, test } from "@playwright/test";

test("home page and analysis route load", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Glass Chess" })).toBeVisible();
  await expect(page.locator('[aria-label="Chess analysis product preview"]')).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();

  await page.getByRole("link", { name: /open analysis/i }).click();
  await expect(page.getByRole("heading", { name: /analyze positions and games locally/i })).toBeVisible();
  await expect(page.getByLabel("Current FEN")).toBeVisible();
});

test("review route loads review workspace", async ({ page }) => {
  await page.goto("/review");
  await expect(page.getByRole("heading", { name: /review games and practice mistakes/i })).toBeVisible();
  await expect(page.getByLabel("Review summary dashboard")).toBeVisible();
  await expect(page.getByLabel("Critical moments timeline")).toBeVisible();
});

test("analysis board exposes evaluation bar and navigation menu", async ({ page }) => {
  await page.goto("/analysis");

  await expect(page.getByLabel(/current position evaluation/i)).toBeVisible();
  await expect(page.getByLabel("Engine progress")).toBeVisible();
  await expect(page.getByLabel("Start analysis options")).toBeVisible();

  await page.getByRole("button", { name: /load sample fen/i }).click();
  await expect(page.getByLabel("Start analysis options")).toHaveCount(0);

  await page.getByRole("button", { name: /move navigation settings/i }).click();
  await expect(page.getByRole("menu", { name: /move navigation settings/i })).toBeVisible();

  await page.getByRole("menuitem", { name: /flip board/i }).click();
  await expect(page.getByRole("menu", { name: /move navigation settings/i })).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const stored = window.localStorage.getItem("glass-chess-preferences");
        return stored ? JSON.parse(stored).orientation : null;
      })
    )
    .toBe("black");
});

test("analysis board supports click move targets and hidden legal dots", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Board click behavior is a desktop interaction.");

  await page.goto("/analysis");

  const currentFen = page.getByLabel("Current FEN");

  await page.locator("#glass-chess-board-square-e2").click();
  await expect(page.locator('[data-selected-square="true"]')).toHaveCount(1);
  await expect(page.locator('[data-legal-move-target="true"]')).toHaveCount(2);

  await page.locator("#glass-chess-board-square-e4").click();
  await expect(currentFen).toContainText("4P3");
  await expect(page.locator('[data-selected-square="true"]')).toHaveCount(0);

  await page.getByLabel("Open Stockfish settings").click();
  await page.getByLabel("Show legal move dots").uncheck();
  await page.getByLabel("Close Stockfish settings").click();

  await page.locator("#glass-chess-board-square-g8").click();
  await expect(page.locator('[data-selected-square="true"]')).toHaveCount(1);
  await expect(page.locator('[data-legal-move-target="true"]')).toHaveCount(0);

  await page.locator("#glass-chess-board-square-f6").click();
  await expect(page.locator('ol[class*="moveTable"] button', { hasText: "Nf6" })).toBeVisible();
});

test("desktop arrow keys navigate loaded game moves", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Keyboard navigation is a desktop interaction.");

  await page.goto("/analysis");
  await page.getByRole("button", { name: /load pgn/i }).click();

  const currentFen = page.getByLabel("Current FEN");
  const finalPosition = await currentFen.textContent();

  await page.keyboard.press("ArrowLeft");
  await expect(currentFen).not.toHaveText(finalPosition ?? "");

  await page.keyboard.press("ArrowRight");
  await expect(currentFen).toHaveText(finalPosition ?? "");
});

test("PGN import starts automatic move review", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Engine review check runs only on desktop.");

  await page.goto("/analysis");
  await page.evaluate(() => {
    window.localStorage.setItem(
      "glass-chess-preferences",
      JSON.stringify({
        version: 2,
        orientation: "white",
        settings: { mode: "lite", depth: 4, multiPv: 3, showBestLine: true, evalFormat: "centipawn" }
      })
    );
  });
  await page.reload({ waitUntil: "networkidle" });

  await page
    .getByLabel("PGN input")
    .fill(`[Event "Auto Review"]\n[White "White"]\n[Black "Black"]\n[Result "*"]\n\n1. e4 e5 2. Ke2 *`);
  await page.getByRole("button", { name: /load pgn/i }).click();

  await expect(page.getByLabel("Review summary dashboard")).toHaveCount(0);

  const unusualMoveLabel = page.locator('ol[class*="moveTable"] button', { hasText: "Ke2" }).locator("small");
  await expect(unusualMoveLabel).toBeVisible({ timeout: 30000 });
  await expect(unusualMoveLabel).not.toHaveText("Reviewing", { timeout: 30000 });
});

test("review page exposes game review panels after PGN import", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "Engine review check runs only on desktop.");

  await page.goto("/review");
  await page.evaluate(() => {
    window.localStorage.setItem(
      "glass-chess-preferences",
      JSON.stringify({
        version: 2,
        orientation: "white",
        settings: { mode: "lite", depth: 4, multiPv: 3, showBestLine: true, evalFormat: "centipawn" }
      })
    );
  });
  await page.reload({ waitUntil: "networkidle" });

  await page
    .getByLabel("PGN input")
    .fill(`[Event "Review Panels"]\n[White "White"]\n[Black "Black"]\n[Result "*"]\n\n1. e4 e5 2. Ke2 *`);
  await page.getByRole("button", { name: /load pgn/i }).click();

  await expect(page.getByLabel("Review summary dashboard")).toBeVisible();
  await expect(page.getByLabel("Selected move explanation")).toBeVisible();
  await expect(page.getByLabel("Mistake retry and puzzle practice")).toBeVisible();
});
