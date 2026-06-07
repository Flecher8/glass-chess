import { expect, test } from "@playwright/test";

test("home page and analysis route load", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Glass Chess" })).toBeVisible();

  await page.getByRole("link", { name: /open analysis/i }).click();
  await expect(page.getByRole("heading", { name: /analyze positions and games locally/i })).toBeVisible();
  await expect(page.getByLabel("Current FEN")).toBeVisible();
});

test("analysis board exposes evaluation bar and navigation menu", async ({ page }) => {
  await page.goto("/analysis");

  await expect(page.getByLabel(/current position evaluation/i)).toBeVisible();

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
