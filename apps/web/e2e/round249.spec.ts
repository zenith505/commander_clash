// Round 249: Malik, Grim Manipulator's secret choices ("you and target opponent each secretly choose a creature that
// player controls"), and Ormos, Archive Keeper's "Discard three cards with different names" cost picker.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

test("Malik, Grim Manipulator: secretly choose a creature the target opponent controls; both chosen are sacrificed", async ({ page }) => {
  const s = scene({ hand: ["Malik, Grim Manipulator"], board: LANDS }, [{ board: ["Grizzly Bears", "Hill Giant", "Gray Ogre"] }]);
  const [bears, giant, ogre] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Gray Ogre")];
  await open(page, s);
  await card(page, "Malik, Grim Manipulator", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets");
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents");
  const bar = controls(page);
  await expect(bar).toContainText("secretly choose a creature Ana controls");
  await expect(bar.getByRole("button", { name: "Choose", exact: true })).toBeDisabled();
  await page.locator(`[data-obj="${giant}"]`).click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const treasures = (st: typeof s) => st.battlefield.filter((id) => st.objects[id]!.controller === 0 && st.objects[id]!.isToken).length;
  const after = await resolveUntil(page, (st) => !st.pending && st.triggerQueue.length === 0 && st.stack.length === 0 && st.objects[giant]!.zone === "graveyard" && treasures(st) > 0);
  expect(after.log.some((l) => /The choices are revealed: You chose Hill Giant, Ana chose/.test(l.text))).toBe(true);
  // Ana chose one of the other two, or the Hill Giant too.
  const gone = [bears, ogre].filter((id) => after.objects[id]!.zone === "graveyard").length;
  expect(gone).toBeLessThanOrEqual(1);
  expect(treasures(after)).toBe(1 + gone); // "Whenever an opponent sacrifices a creature, you create a Treasure token."
  expect(pageErrors(page)).toEqual([]);
});

test("Ormos, Archive Keeper: discard three cards with different names to draw five", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Ormos, Archive Keeper"], hand: ["Shock", "Shock", "Opt", "Lightning Bolt"] });
  const ormos = one(s, "Ormos, Archive Keeper");
  const me = s.players[0]!;
  const [shock1, shock2] = me.hand.filter((id) => s.cards[s.objects[id]!.cardId]?.name === "Shock") as [string, string];
  const [opt, bolt] = [one(s, "Opt"), one(s, "Lightning Bolt")];
  await open(page, s);
  await card(page, "Ormos, Archive Keeper", s).click();
  if (await menu(page).count()) await menu(page).locator("button", { hasText: "Draw five cards" }).click();
  const pick = modal(page);
  await expect(pick).toContainText("Ormos, Archive Keeper: discard 3 cards with different names");
  for (const id of [shock1, shock2, opt]) await pick.locator(`[data-pick="${id}"]`).click();
  await expect(pick.getByRole("button", { name: "Done" })).toBeDisabled(); // two Shocks
  await pick.locator(`[data-pick="${shock2}"]`).click();
  await pick.locator(`[data-pick="${bolt}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "graveyard");
  expect([shock1, opt].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
  expect(after.objects[shock2]!.zone).toBe("hand");
  expect(after.players[0]!.hand.length).toBe(1 + 5);
  expect(after.objects[ormos]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
