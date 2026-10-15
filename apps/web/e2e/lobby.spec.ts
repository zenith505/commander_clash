// The real game: pick a sample deck in the lobby and play a few turns against the bots.
import { expect, test } from "@playwright/test";
import type { GameState } from "@cc/engine";
import { pageErrors, state, watchErrors } from "./scene";
import { controls, resolveUntil } from "./ui";

test("a game from the lobby runs through a full round of turns", async ({ page }) => {
  watchErrors(page);
  await page.goto("/");
  await page.locator(".deck-choice").first().click();
  // Keep whatever we're dealt (bots decide their own mulligans first if they go first).
  await expect(controls(page).getByRole("button", { name: "Keep" })).toBeVisible({ timeout: 20_000 });
  await controls(page).getByRole("button", { name: "Keep" }).click();
  const start = await state(page);
  // Everyone gets a turn, or the game stops on a prompt only you can answer (a discard to hand size, a trigger's
  // target): either way the table kept going without the page breaking.
  const yours = (st: GameState) => st.pending?.player === 0 && st.pending.kind !== "declareAttackers" && st.pending.kind !== "declareBlockers";
  await resolveUntil(page, (st) => st.turn >= start.turn + 4 || st.over || yours(st), 400);
  expect((await state(page)).log.length).toBeGreaterThan(start.log.length);
  expect(pageErrors(page)).toEqual([]);
});
