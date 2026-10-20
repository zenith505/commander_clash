// Teferi, Temporal Archmage's emblem (CR 114, 606.3): with it, you activate a loyalty ability on an opponent's turn from
// the planeswalker's menu, still once per turn.
import { expect, test } from "@playwright/test";
import { applyAction, botActions, planActivate, waitingOn, type GameState } from "@cc/engine";
import { one, open, pageErrors, scene } from "./scene";
import { menu, modal, resolveUntil } from "./ui";

test("Teferi's emblem: his +1 on Ana's turn", async ({ page }) => {
  let s: GameState = scene({ board: ["Teferi, Temporal Archmage"] });
  const teferi = one(s, "Teferi, Temporal Archmage");
  s.objects[teferi]!.counters.loyalty = 12;
  // −10 now (the emblem), then on to Ana's turn with priority for you.
  for (const a of planActivate(s, 0, teferi, 2)!) s = applyAction(s, a);
  for (let i = 0; i < 400 && !(s.activePlayer === 1 && s.step === "main1" && !s.stack.length && !s.pending && waitingOn(s) === 0); i++) {
    const pid = waitingOn(s)!;
    s = applyAction(s, pid === 0 ? (s.pending?.player === 0 ? botActions(s, 0)[0]! : { type: "passPriority", player: 0 }) : botActions(s, pid)[0]!);
  }
  expect([s.activePlayer, s.step, (s.emblems ?? []).length, s.objects[teferi]!.counters.loyalty]).toEqual([1, "main1", 1, 2]);
  await open(page, s);
  await page.locator(`[data-obj="${teferi}"]`).click();
  await menu(page).locator("button", { hasText: "Look at the top two cards" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" || (st.stack.length === 0 && st.objects[teferi]!.counters.loyalty === 3));
  const mid = await resolveUntil(page, () => true);
  if (mid.pending?.kind === "searchLibrary") {
    await modal(page).locator("[data-pick]").first().click();
    await modal(page).getByRole("button", { name: "Done" }).click();
  }
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.hand.length === 1);
  expect(after.objects[teferi]!.counters.loyalty).toBe(3);
  expect(after.activePlayer).toBe(1);
  // Once a turn (CR 606.3): his abilities are greyed out in his menu.
  await page.locator(`[data-obj="${teferi}"]`).click();
  await expect(menu(page).locator("button", { hasText: "Look at the top two cards" })).toBeDisabled();
  expect(pageErrors(page)).toEqual([]);
});
