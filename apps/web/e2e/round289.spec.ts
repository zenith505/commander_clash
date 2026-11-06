// Round 289's prompt: Goblin Game's secret number of items to hide starts at 1 (you must hide at least one), then each
// player loses that much life and the player with the fewest loses half their life, rounded up.
import { expect, test } from "@playwright/test";
import { LANDS, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Goblin Game: the number starts at 1; the fewest items lose half their life", async ({ page }) => {
  const s = scene({ hand: ["Goblin Game"], board: LANDS });
  await open(page, s);
  await card(page, "Goblin Game", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "secretNumber" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Goblin Game:");
  await expect(bar.getByRole("button", { name: "Number minus one" })).toBeDisabled();
  await expect(bar.getByRole("button", { name: "Choose 1" })).toBeVisible();
  const plus = bar.getByRole("button", { name: "Number plus one" });
  for (let i = 0; i < 4; i++) await plus.click();
  await bar.getByRole("button", { name: "Choose 5" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  // We hid 5 (40 - 5); the bots at 40 life hid 3 each, the fewest: 40 - 3 = 37, then half of 37 rounded up (19).
  expect(after.players[0]!.life).toBe(35);
  for (const p of [1, 2, 3]) expect(after.players[p]!.life).toBe(18);
  expect(after.log.some((l) => l.text.startsWith("The numbers are revealed:") && l.text.includes("5"))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
