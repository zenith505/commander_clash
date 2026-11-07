// Lane B round B132 in the browser: Carrion Wurm's "any player may exile three cards from their graveyard" (the choice,
// then the cards picked from your graveyard), Tainted Specter's "discards a card unless they put a card from their hand on
// top of their library" (the choice, then the card) and Ion Storm's "Remove a +1/+1 counter or a charge counter from a
// permanent you control" (only counters of those two kinds offered).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { attack, card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

test("Carrion Wurm: it attacks, you exile three cards from your graveyard, and it deals no combat damage", async ({ page }) => {
  const s = scene({ board: ["Carrion Wurm"], yard: ["Grizzly Bears", "Hill Giant", "Shock", "Lightning Bolt"] });
  const [wurm, bears, giant, shock, bolt] = ["Carrion Wurm", "Grizzly Bears", "Hill Giant", "Shock", "Lightning Bolt"].map((n) => one(s, n)) as [string, string, string, string, string];
  const life = s.players[1]!.life;
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  await attack(page, [[wurm, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "punisher" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Exile 3 cards from your graveyard? If anyone does, Carrion Wurm assigns no combat damage this turn.");
  await expect(bar.getByRole("button", { name: "Don't" })).toHaveCount(1);
  await bar.getByRole("button", { name: "Exile 3 cards from your graveyard" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick).toContainText("exile 3 cards from your graveyard");
  for (const id of [bears, giant, shock]) await pick.locator(`[data-pick="${id}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.step === "main2" && st.stack.length === 0 && !st.pending, 60);
  expect([bears, giant, shock, bolt].map((id) => after.objects[id]!.zone)).toEqual(["exile", "exile", "exile", "graveyard"]);
  expect(after.players[1]!.life).toBe(life);
  expect(pageErrors(page)).toEqual([]);
});

test("Tainted Specter: target yourself and put a card from your hand on top of your library instead of discarding", async ({ page }) => {
  const s = scene({ hand: ["Grizzly Bears", "Hill Giant"], board: [...LANDS, "Tainted Specter"] });
  const [specter, bears, giant] = [one(s, "Tainted Specter"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  const life = s.players[0]!.life;
  await open(page, s);
  await page.locator(`[data-obj="${specter}"]`).first().click();
  const item = menu(page).locator("button", { hasText: "Target player discards" });
  if (await item.count()) await item.click();
  await clickPlayer(page, 0);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "punisher" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "Discard a card" })).toHaveCount(1);
  await bar.getByRole("button", { name: "Put a card from your hand on top of your library" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "handToTop" && st.pending.player === 0);
  await page.locator(`[data-obj="${giant}"]`).click();
  await controls(page).getByRole("button", { name: "Put on top" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "library");
  expect(after.players[0]!.library[0]).toBe(giant);
  expect(after.objects[bears]!.zone).toBe("hand");
  // Nothing was discarded, so no damage.
  expect(after.players[0]!.life).toBe(life);
  expect(after.objects[specter]!.damage ?? 0).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Ion Storm: pick the charge counter to remove (a time counter isn't offered), and it deals 2 damage to Ana", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Ion Storm", "Grizzly Bears", "Ornithopter"] });
  const [storm, bears, thopter] = [one(s, "Ion Storm"), one(s, "Grizzly Bears"), one(s, "Ornithopter")];
  s.objects[bears]!.counters["+1/+1"] = 1;
  s.objects[thopter]!.counters.charge = 1;
  s.objects[thopter]!.counters.time = 2;
  const life = s.players[1]!.life;
  await open(page, s);
  await page.locator(`[data-obj="${storm}"]`).first().click();
  const item = menu(page).locator("button", { hasText: "deals 2 damage" });
  if (await item.count()) await item.click();
  await clickPlayer(page, 1);
  const pick = page.locator(".counter-pick");
  await expect(pick).toContainText("remove 1 +1/+1 or charge counter from among permanent you control");
  await expect(pick.locator(`[data-counter="${thopter}:time"]`)).toHaveCount(0);
  await expect(pick.locator(`[data-counter="${bears}:+1/+1"]`)).toHaveCount(1);
  await pick.locator(`[data-counter="${thopter}:charge"]`).getByRole("button", { name: "+" }).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life === life - 2);
  expect(after.objects[thopter]!.counters.charge ?? 0).toBe(0);
  expect(after.objects[thopter]!.counters.time).toBe(2);
  expect(after.objects[bears]!.counters["+1/+1"]).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
