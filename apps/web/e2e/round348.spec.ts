// Round 348's prompt: Tovolar, Dire Overlord's upkeep trigger makes it night, then asks which Human Werewolves you control
// to transform (any number, none too).
import { expect, test } from "@playwright/test";
import { invalidateCharacteristics, type GameState } from "@cc/engine";
import { one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

const TOVOLAR = "Tovolar, Dire Overlord // Tovolar, the Midnight Scourge";
const GATSTAF = "Gatstaf Shepherd // Gatstaf Howler";

/**
 * Your upkeep by day with Tovolar, Gatstaf Shepherd and Timber Wolves (three Wolves and/or Werewolves), the turn before
 * having had a spell cast (so day stays day and Gatstaf's own trigger doesn't): Tovolar's trigger has made it night and
 * waits on your choice.
 */
function upkeep(): { s: GameState; tov: string; gat: string } {
  let s = scene({ board: [TOVOLAR, GATSTAF, "Timber Wolves"] });
  const tov = one(s, "Tovolar, Dire Overlord");
  const gat = one(s, "Gatstaf Shepherd");
  s = playUntil(s, (st) => st.activePlayer === 3 && st.step === "end" && !st.pending && st.stack.length === 0);
  // Day and night went back and forth on the way round the table (nobody cast anything): back to day, both front face up.
  s.dayNight = "day";
  for (const id of [tov, gat]) s.objects[id]!.face = undefined;
  (s.castThisTurn ??= []).push({ player: 3, card: "test" });
  invalidateCharacteristics(s);
  s = playUntil(s, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  return { s, tov, gat };
}

test("Tovolar: it becomes night; click Gatstaf Shepherd and Choose, and it transforms into Gatstaf Howler", async ({ page }) => {
  const { s, tov, gat } = upkeep();
  expect(s.dayNight).toBe("night");
  expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "choose", anyNumber: true, options: [gat] });
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("click any number of Human Werewolves you control to transform them, then choose them (or choose none).");
  await expect(bar.getByRole("button", { name: "Choose none" })).toBeEnabled();
  await page.locator(`[data-obj="${gat}"]`).first().click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.objects[gat]!.face === 1);
  expect(after.objects[tov]!.face).toBe(1); // daybound: it transformed as it became night
  await expect(page.locator(`[data-obj="${gat}"]`).first()).toContainText("Gatstaf Howler");
  expect(pageErrors(page)).toEqual([]);
});

test("Tovolar: Choose none leaves Gatstaf Shepherd as it is", async ({ page }) => {
  const { s, gat } = upkeep();
  await open(page, s);
  await controls(page).getByRole("button", { name: "Choose none" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
  expect(after.objects[gat]!.face ?? 0).toBe(0);
  expect(after.dayNight).toBe("night");
  expect(pageErrors(page)).toEqual([]);
});
