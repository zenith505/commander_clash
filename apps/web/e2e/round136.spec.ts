// Round 136's prompts: Angel of Serenity's targets from the battlefield and/or graveyards (a "From a graveyard" button
// beside the battlefield clicks), the ninjutsu Satoru Umezawa gives a creature card in your hand, and The Second Doctor's
// draw offer to an opponent, which says what drawing costs them.
import { expect, test } from "@playwright/test";
import { applyAction, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Angel of Serenity: Ana's creature on the battlefield and a creature card from your graveyard, then Yes", async ({ page }) => {
  const s = scene({ hand: ["Angel of Serenity"], board: [...LANDS, "Plains", "Plains"], yard: ["Hill Giant", "Lightning Bolt"] }, [{ board: ["Grizzly Bears"], yard: ["Goblin Piker"] }]);
  const [angel, giant, bolt, bears, piker] = [one(s, "Angel of Serenity"), one(s, "Hill Giant"), one(s, "Lightning Bolt"), one(s, "Grizzly Bears"), one(s, "Goblin Piker")];
  await open(page, s);
  await card(page, "Angel of Serenity", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets");
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("choose target creature or creature card from a graveyard");
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await bar.getByRole("button", { name: "From a graveyard" }).click();
  // Only creature cards: Hill Giant and Ana's Goblin Piker, not Lightning Bolt.
  const pick = modal(page);
  await expect(pick.locator(`[data-pick="${giant}"]`)).toBeVisible();
  await expect(pick.locator(`[data-pick="${piker}"]`)).toBeVisible();
  await expect(pick.locator(`[data-pick="${bolt}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${giant}"]`).click();
  await expect(modal(page)).toHaveCount(0);
  await bar.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay");
  await controls(page).getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect([after.objects[bears]!.zone, after.objects[giant]!.zone, after.objects[piker]!.zone]).toEqual(["exile", "exile", "graveyard"]);
  expect(after.objects[angel]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Satoru Umezawa: Hill Giant in your hand has ninjutsu; it swaps in for your unblocked Bears", async ({ page }) => {
  let s: GameState = scene({ hand: ["Hill Giant"], board: ["Satoru Umezawa", "Grizzly Bears", "Island", "Island", "Swamp", "Swamp"], library: ["Goblin Piker", "Lightning Bolt", "Shock"] });
  const [giant, bears] = [one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  // In the engine: you attack Ana with the Bears, and no one blocks.
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [{ attacker: bears, defender: 1 }] });
  s = playUntil(s, (st) => st.step === "declareBlockers" && !st.pending && st.priority === 0 && st.stack.length === 0);
  await open(page, s);
  await card(page, "Hill Giant", s).click();
  await menu(page).getByRole("button", { name: /Ninjutsu/ }).click();
  const bar = page.locator(".targeting", { hasText: "return an unblocked attacker you control to hand (click it)" });
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await bar.getByRole("button", { name: "Return and activate" }).click();
  // Satoru's trigger: look at the top three, one into your hand.
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await pick.locator(`[data-pick="${one(s, "Lightning Bolt")}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  // The other two on the bottom, in the order you like.
  await resolveUntil(page, (st) => st.pending?.kind === "arrangeTop");
  await page.locator(".modal.arrange").getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.objects[giant]!.zone === "battlefield" && st.stack.length === 0 && !st.pending);
  expect(after.objects[giant]!.attacking).toBe(1);
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(after.objects[one(s, "Lightning Bolt")]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("The Second Doctor: at Ana's end step you may draw, and the offer says you then can't attack her next turn", async ({ page }) => {
  let s: GameState = scene({}, [{ board: ["The Second Doctor"] }]);
  s = playUntil(s, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("If you do, you can't attack Ana or permanents Ana controls during your next turn.");
  const hand = s.players[0]!.hand.length;
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.players[0]!.hand.length === hand + 1);
  expect(after.players[0]!.attackBansNextTurn).toEqual([{ player: 1 }]);
  expect(pageErrors(page)).toEqual([]);
});
