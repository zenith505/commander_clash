// Lane B round B222 in the browser: Phyrexian Splicer's keyword choice and two targets; Elemental Expressionist's magecraft
// target, then the creature exiled instead of dying and the Elemental token; Time Reaper's target among Ana's cards in
// exile; Equipoise's target player and its two picks (lands, then creatures, with Sol Ring phasing out on its own).
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { attack, card, clickPlayer, controls, menu, modal, passTo, resolveUntil } from "./ui";
import { defOf, objHasKeyword, type GameState } from "@cc/engine";

const flies = (s: GameState, id: string) => objHasKeyword(s, s.objects[id]!, "Flying");

test("Phyrexian Splicer: choose flying; Ana's Serra Angel loses it and your Hill Giant gains it", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Phyrexian Splicer", "Hill Giant"] }, [{ board: ["Serra Angel"] }]);
  const [splicer, giant, angel] = [one(s, "Phyrexian Splicer"), one(s, "Hill Giant"), one(s, "Serra Angel")];
  await open(page, s);
  await page.locator(`[data-obj="${splicer}"]`).first().click();
  const ability = menu(page).getByRole("button", { name: /Choose flying, first strike, trample, or shadow/ });
  if (await ability.count()) await ability.first().click();
  const modes = page.locator(".mode-menu");
  await expect(modes).toContainText("Shadow: until end of turn, target creature with shadow loses it");
  await modes.getByRole("button", { name: /^Flying: until end of turn/ }).click();
  await page.locator(`[data-obj="${angel}"]`).first().click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && flies(st, giant));
  expect(flies(after, angel)).toBe(false);
  expect(after.objects[splicer]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Elemental Expressionist: Lightning Bolt's magecraft targets Hill Giant; the Bolt exiles it instead and makes a 4/4 Elemental", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt"], board: [...LANDS, "Elemental Expressionist", "Hill Giant"] });
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Lightning Bolt", s).click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0 && st.stack.length === 1);
  await page.locator(`[data-obj="${giant}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.triggerQueue.length === 0 && !st.pending && st.objects[giant]!.zone === "exile" && st.battlefield.some((id) => defOf(st, st.objects[id]!).name === "Elemental Token"));
  expect(after.players[0]!.graveyard).not.toContain(giant);
  expect(pageErrors(page)).toEqual([]);
});

test("Time Reaper: combat damage to Ana puts her Craw Wurm from exile on the bottom of her library; you gain 3 life", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Time Reaper"], exile: ["Hill Giant"] }, [{ exile: ["Craw Wurm"] }]);
  const reaper = one(s, "Time Reaper");
  const wurm = idsOf(s, "Craw Wurm", "exile", 1)[0]!;
  const mine = idsOf(s, "Hill Giant", "exile", 0)[0]!;
  await open(page, s);
  await passTo(page, "declareAttackers");
  await attack(page, [[reaper, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0, 100);
  // Only cards Ana owns: not your own Hill Giant.
  await expect(modal(page).locator(`[data-pick="${mine}"]`)).toHaveCount(0);
  await modal(page).locator(`[data-pick="${wurm}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[wurm]!.zone === "library");
  expect(after.players[1]!.library.at(-1)).toBe(wurm);
  expect(after.players[0]!.life).toBe(43);
  expect(after.players[1]!.life).toBe(36);
  expect(pageErrors(page)).toEqual([]);
});

test("Equipoise: at your upkeep, two of Ana's three lands, her Sol Ring and one of her two creatures phase out", async ({ page }) => {
  let s = scene({ board: ["Equipoise", "Forest", "Grizzly Bears"] }, [{ board: ["Plains", "Island", "Swamp", "Sol Ring", "Hill Giant", "Craw Wurm"] }]);
  const ana = (name: string) => idsOf(s, name, "battlefield", 1)[0]!;
  const [plains, island, swamp, ring, giant, wurm] = [ana("Plains"), ana("Island"), ana("Swamp"), ana("Sol Ring"), ana("Hill Giant"), ana("Craw Wurm")];
  s = playUntil(s, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await open(page, s);
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Ana controls 2 more lands than you: choose 2 of their lands to phase out");
  await page.locator(`[data-obj="${plains}"]`).first().click();
  await expect(bar.getByRole("button", { name: "Choose", exact: true })).toBeDisabled();
  await page.locator(`[data-obj="${island}"]`).first().click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  // Sol Ring phases out with no question (one artifact to none); then one of her two creatures to your one.
  const second = await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0 && st.pending.count === 1);
  expect(second.objects[ring]!.zone).toBe("phasedOut");
  await expect(bar).toContainText("Ana controls 1 more creature than you: choose 1 of their creatures to phase out");
  await page.locator(`[data-obj="${wurm}"]`).first().click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[wurm]!.zone === "phasedOut");
  expect([plains, island, ring, wurm].map((id) => after.objects[id]!.zone)).toEqual(["phasedOut", "phasedOut", "phasedOut", "phasedOut"]);
  expect([swamp, giant].map((id) => after.objects[id]!.zone)).toEqual(["battlefield", "battlefield"]);
  expect(pageErrors(page)).toEqual([]);
});
