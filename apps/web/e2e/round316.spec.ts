// Round 316: Radiant Lotus's "Sacrifice one or more artifacts" (X picked, then the target player and the artifacts, then
// a color), Boreas Charger's "choose an opponent who controls more lands than you" (only those opponents are offered)
// and its search where the first Plains found goes onto the battlefield tapped, and Fiery Annihilation's "up to one
// target Equipment attached to that creature" (only Equipment on the creature it targets can be chosen).
import { expect, test } from "@playwright/test";
import type { GameState } from "@cc/engine";
import { one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

test("Radiant Lotus: X = 2, target yourself, sacrifice itself and Sol Ring, choose red for six red mana", async ({ page }) => {
  const s = scene({ board: ["Radiant Lotus", "Sol Ring", "Ornithopter"] });
  const [lotus, ring, thopter] = [one(s, "Radiant Lotus"), one(s, "Sol Ring"), one(s, "Ornithopter")];
  await open(page, s);
  await card(page, "Radiant Lotus", s).click();
  const item = menu(page).locator("button", { hasText: "Choose a color" });
  if (await item.count()) await item.click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("sacrifice X artifacts");
  await expect(x.getByLabel("X", { exact: true })).toHaveAttribute("min", "1");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("target player");
  await clickPlayer(page, 0);
  await expect(bar).toContainText("sacrifice 2 artifacts");
  for (const id of [lotus, ring]) await page.locator(`[data-obj="${id}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice and activate" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "color");
  await controls(page).getByRole("button", { name: "Red" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.players[0]!.manaPool.R === 6);
  expect([lotus, ring, thopter].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "battlefield"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Boreas Charger: it dies, choose Ana (four lands more than yours), find four Plains, the first onto the battlefield tapped", async ({ page }) => {
  const s = scene(
    { hand: ["Lightning Bolt"], board: ["Boreas Charger", "Mountain"] },
    [{ board: ["Forest", "Forest", "Forest", "Forest", "Forest"] }, { board: ["Forest", "Forest"] }, {}],
  );
  const boreas = one(s, "Boreas Charger");
  await open(page, s);
  await card(page, "Lightning Bolt", s).click();
  await page.locator(`[data-obj="${boreas}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "opponent");
  const bar = controls(page);
  await expect(bar).toContainText("Boreas Charger: choose an opponent who controls more lands than you");
  await expect(bar.getByRole("button", { name: "Ana", exact: true })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Ben", exact: true })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Cy", exact: true })).toHaveCount(0);
  await bar.getByRole("button", { name: "Ana", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const find = modal(page);
  await expect(find).toContainText("Boreas Charger: search your library for 4 Plains cards");
  await expect(find).toContainText("The first you find goes");
  // The Plains are one pile in the search window: a click finds the next one.
  const pile = find.locator(".card.targetable", { hasText: "Plains" });
  for (let i = 0; i < 4; i++) await pile.click();
  await expect(find).toContainText("×4");
  await find.getByRole("button", { name: "Done" }).click();
  const plainsOn = (st: GameState) => st.battlefield.filter((id) => st.objects[id]!.controller === 0 && st.cards[st.objects[id]!.cardId]!.name === "Plains");
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && plainsOn(st).length === 1);
  expect(after.objects[boreas]!.zone).toBe("graveyard");
  expect(after.objects[plainsOn(after)[0]!]!.tapped).toBe(true);
  expect(after.players[0]!.hand.map((id) => after.cards[after.objects[id]!.cardId]!.name)).toEqual(["Plains", "Plains", "Plains"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Fiery Annihilation: target Ana's Hill Giant, then only the Equipment attached to it; both are exiled", async ({ page }) => {
  const s = scene({ hand: ["Fiery Annihilation"], board: ["Mountain", "Mountain", "Mountain"] }, [{ board: ["Hill Giant", "Bonesplitter", "Short Sword"] }]);
  const [giant, splitter, sword] = [one(s, "Hill Giant"), one(s, "Bonesplitter"), one(s, "Short Sword")];
  s.objects[splitter]!.attachedTo = giant;
  await open(page, s);
  await card(page, "Fiery Annihilation", s).click();
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("target creature");
  await page.locator(`[data-obj="${giant}"]`).click();
  await expect(bar).toContainText("target Equipment attached to that creature");
  await expect(page.locator(`.targetable[data-obj="${sword}"]`)).toHaveCount(0);
  // Attached under the giant: its visible corner.
  await page.locator(`[data-obj="${splitter}"]`).first().click({ position: { x: 6, y: 6 } });
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "exile");
  expect(after.objects[splitter]!.zone).toBe("exile");
  expect(after.objects[sword]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
