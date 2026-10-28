// Lane B round 20 in the browser: forecast from your hand during your upkeep (Steeling Stance, CR 702.57), and Orcish
// Conscripts' "can't block unless at least two other creatures block" (CR 509.1b) holding back the Block button.
import { expect, test } from "@playwright/test";
import { applyAction, power, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Steeling Stance: forecast from your hand in your upkeep gives Grizzly Bears +1/+1; the card stays in your hand", async ({ page }) => {
  const s = scene({ hand: ["Steeling Stance"], board: [...LANDS, "Grizzly Bears"] }, [], { step: "upkeep" });
  const [stance, bears] = [one(s, "Steeling Stance"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Steeling Stance", s).click();
  await menu(page).locator("button", { hasText: "Forecast" }).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && power(st, st.objects[bears]!) === 3);
  expect(after.objects[stance]!.zone).toBe("hand");
  expect(after.players[0]!.hand).toContain(stance);
  // Only once each turn: the menu doesn't offer it again.
  await card(page, "Steeling Stance", s).click();
  await expect(menu(page).locator("button:enabled", { hasText: "Forecast" })).toHaveCount(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Orcish Conscripts blocks Hill Giant only once two other creatures block too", async ({ page }) => {
  let s: GameState = scene({ board: ["Orcish Conscripts", "Grizzly Bears", "Llanowar Elves"] }, [{ board: ["Hill Giant"] }]);
  const [orc, bears, elves, giant] = [one(s, "Orcish Conscripts"), one(s, "Grizzly Bears"), one(s, "Llanowar Elves"), one(s, "Hill Giant")];
  // Ana's turn, in the engine: she attacks you with the Hill Giant.
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 1);
  s = applyAction(s, { type: "declareAttackers", player: 1, attacks: [{ attacker: giant, defender: 0 }] });
  s = playUntil(s, (st) => st.pending?.kind === "declareBlockers" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  for (const id of [orc, bears]) {
    await page.locator(`[data-obj="${id}"]`).first().click();
    await page.locator(`[data-obj="${giant}"]`).first().click();
  }
  await expect(bar).toContainText("Orcish Conscripts can't block unless at least 2 other creatures block.");
  await expect(bar.getByRole("button", { name: /^Block with 2/ })).toBeDisabled();
  await page.locator(`[data-obj="${elves}"]`).first().click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await bar.getByRole("button", { name: /^Block with 3/ }).click();
  const after = await resolveUntil(page, (st) => st.pending?.kind !== "declareBlockers" && st.objects[orc]!.blocking !== undefined);
  expect([orc, bears, elves].every((id) => after.objects[id]!.blocking !== undefined)).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
