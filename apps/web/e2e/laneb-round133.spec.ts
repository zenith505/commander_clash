// Lane B round B133 in the browser: Weight of Conscience's "Tap two untapped creatures you control that share a creature
// type" (the tap button waits for two that do), Illuminated Folio's "Reveal two cards from your hand that share a color"
// (the same for the cards picked), Haphazard Bombardment's choice of four permanents you don't control, and Bane Alley
// Broker's return of one of the cards exiled with it.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { controls, menu, modal, resolveUntil } from "./ui";

test("Weight of Conscience: two creatures without a creature type in common can't pay; two Bears can, exiling Ana's Hill Giant", async ({ page }) => {
  const s = scene({ board: ["Weight of Conscience", "Grizzly Bears", "Grizzly Bears", "Wind Drake"] }, [{ board: ["Hill Giant"] }]);
  const [weight, drake, giant] = [one(s, "Weight of Conscience"), one(s, "Wind Drake"), one(s, "Hill Giant")];
  const bears = idsOf(s, "Grizzly Bears", "battlefield", 0);
  s.objects[weight]!.attachedTo = giant;
  await open(page, s);
  // Attached under the giant: its visible corner.
  await page.locator(`[data-obj="${weight}"]`).first().click({ position: { x: 6, y: 6 } });
  const item = menu(page).locator("button", { hasText: "Exile enchanted creature" });
  if (await item.count()) await item.click();
  const bar = page.locator(".targeting", { hasText: "tap 2 untapped creatures you control that share a creature type" });
  await expect(bar).toHaveCount(1);
  await page.locator(`[data-obj="${bears[0]}"]`).click();
  await page.locator(`[data-obj="${drake}"]`).click();
  await expect(bar.getByRole("button", { name: "Tap and activate" })).toBeDisabled();
  await page.locator(`[data-obj="${drake}"]`).click();
  await page.locator(`[data-obj="${bears[1]}"]`).click();
  await bar.getByRole("button", { name: "Tap and activate" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "exile");
  expect(bears.map((id) => after.objects[id]!.tapped)).toEqual([true, true]);
  expect(after.objects[drake]!.tapped).toBe(false);
  expect(after.objects[weight]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Illuminated Folio: a red and a blue card can't be revealed together; two red cards can, and you draw a card", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt", "Shock", "Opt"], board: [...LANDS, "Illuminated Folio"] });
  const [folio, bolt, shock, opt] = [one(s, "Illuminated Folio"), one(s, "Lightning Bolt"), one(s, "Shock"), one(s, "Opt")];
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await page.locator(`[data-obj="${folio}"]`).first().click();
  const item = menu(page).locator("button", { hasText: "Draw a card" });
  if (await item.count()) await item.click();
  const pick = modal(page);
  await expect(pick).toContainText("reveal 2 cards from your hand that share a color");
  await pick.locator(`[data-pick="${bolt}"]`).click();
  await pick.locator(`[data-pick="${opt}"]`).click();
  await expect(pick.getByRole("button", { name: "Done" })).toBeDisabled();
  await pick.locator(`[data-pick="${opt}"]`).click();
  await pick.locator(`[data-pick="${shock}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.hand.length === hand + 1);
  expect([bolt, shock, opt].map((id) => after.objects[id]!.zone)).toEqual(["hand", "hand", "hand"]);
  expect(after.objects[folio]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Haphazard Bombardment: click four of the opponents' nonenchantment permanents to put aim counters on", async ({ page }) => {
  const s = scene({ hand: ["Haphazard Bombardment"], board: [...LANDS, "Grizzly Bears"] }, [{ board: ["Hill Giant", "Wind Drake"] }, { board: ["Ornithopter", "Pick Up the Pace"] }, { board: ["Memnite", "Llanowar Elves"] }]);
  const [mine, giant, drake, thopter, pace, memnite, elves] = ["Grizzly Bears", "Hill Giant", "Wind Drake", "Ornithopter", "Pick Up the Pace", "Memnite", "Llanowar Elves"].map((n) => one(s, n)) as [string, string, string, string, string, string, string];
  await open(page, s);
  await page.locator(`[data-obj="${one(s, "Haphazard Bombardment")}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("click four nonenchantment permanents you don't control. An aim counter goes on each of them.");
  for (const id of [giant, drake, thopter, memnite]) await page.locator(`[data-obj="${id}"]`).first().click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.objects[memnite]!.counters.aim ?? 0) === 1);
  expect([giant, drake, thopter, memnite].map((id) => after.objects[id]!.counters.aim ?? 0)).toEqual([1, 1, 1, 1]);
  expect(after.objects[pace]!.counters.aim ?? 0).toBe(0);
  expect(after.objects[elves]!.counters.aim ?? 0).toBe(0);
  expect(after.objects[mine]!.counters.aim ?? 0).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Bane Alley Broker: pick which of the two cards exiled with it comes back to your hand", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Bane Alley Broker"], exile: ["Lightning Bolt", "Opt"] });
  const [broker, bolt, opt] = [one(s, "Bane Alley Broker"), one(s, "Lightning Bolt"), one(s, "Opt")];
  // Exiled face down with it, and you may look at them.
  for (const id of [bolt, opt]) s.objects[id]!.hiddenExile = { by: broker, seen: [0], label: "Face down", at: 1 };
  s.linkedExile = { [`${broker}@0`]: [bolt, opt].map((id) => ({ id, zc: s.objects[id]!.zoneChanges ?? 0 })) };
  await open(page, s);
  await page.locator(`[data-obj="${broker}"]`).first().click();
  await menu(page).locator("button", { hasText: "Return a card exiled with" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick).toContainText("Bane Alley Broker");
  await pick.locator(`[data-pick="${opt}"]`).click();
  await pick.getByRole("button", { name: "Done", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[opt]!.zone === "hand");
  expect(after.objects[bolt]!.zone).toBe("exile");
  expect(after.objects[broker]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
