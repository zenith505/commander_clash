// Lane B round B185 in the browser: Manifold Insights cast by Cy (you choose the first nonland card for Cy's hand, the
// next opponents the others); Volcano Hellion's amount of damage of your choice (the number box); Prince of Thralls's
// "unless that opponent pays 3 life" asked of you; Urza's Sylex ("you may pay {2}" as it's exiled, then click six lands
// of yours to keep).
import { expect, test } from "@playwright/test";
import { applyAction, planCast, waitingOn, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Manifold Insights cast by Cy: you choose Serra Angel for Cy's hand first; Ana and Ben choose the next two", async ({ page }) => {
  const top = ["Serra Angel", "Grizzly Bears", "Lightning Bolt", "Plains", "Hill Giant", "Island", "Island", "Island", "Island", "Island"];
  // Cy draws the Swamp on top first.
  let s: GameState = scene({}, [{}, {}, { hand: ["Manifold Insights"], board: LANDS, library: ["Swamp", ...top] }]);
  // Cy's main phase: Cy casts it in the engine, then everyone passes until you're asked.
  s = playUntil(s, (st) => st.activePlayer === 3 && st.step === "main1" && !st.pending && waitingOn(st) === 3 && st.stack.length === 0);
  const spell = one(s, "Manifold Insights");
  for (const a of planCast(s, 3, spell)!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pend = s.pending as Extract<NonNullable<GameState["pending"]>, { kind: "searchLibrary" }>;
  expect(pend).toMatchObject({ forPlayer: 3, min: 1, max: 1 });
  expect(pend.cards).toHaveLength(4);
  const angel = pend.cards.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Serra Angel")!;
  await open(page, s);
  await expect(modal(page)).toContainText("Manifold Insights: choose a different nonland card to put into Cy's hand");
  await expect(modal(page)).toContainText("The rest are left for the next opponent to choose from");
  await modal(page).locator(`[data-pick="${angel}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  // Ana's and Ben's bots choose the next two; the fourth nonland card goes to the bottom with the lands.
  const after = await resolveUntil(page, (st) => st.objects[spell]!.zone === "graveyard" && !st.pending);
  expect(after.objects[angel]!.zone).toBe("hand");
  const nonland = pend.cards.filter((id) => after.objects[id]!.zone === "hand");
  expect(nonland).toHaveLength(3);
  expect(after.players[3]!.hand).toEqual(expect.arrayContaining(nonland));
  expect(pageErrors(page)).toEqual([]);
});

test("Volcano Hellion: target Ana's Serra Angel and choose 4: 4 damage to you and to the Angel", async ({ page }) => {
  const s = scene({ hand: ["Volcano Hellion"], board: LANDS }, [{ board: ["Serra Angel"] }]);
  const [hellion, angel] = [one(s, "Volcano Hellion"), one(s, "Serra Angel")];
  await open(page, s);
  await card(page, "Volcano Hellion", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await page.locator(`[data-obj="${angel}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "number" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Volcano Hellion: choose how much damage it deals to you and to the target creature");
  await bar.getByRole("spinbutton", { name: "Number" }).fill("4");
  await bar.getByRole("button", { name: "Choose 4" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[angel]!.zone === "graveyard");
  expect(after.players[0]!.life).toBe(36);
  expect(after.objects[hellion]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Prince of Thralls: your Grizzly Bears dies with Ana's Prince out; pay 3 life to keep it from her", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt"], board: ["Mountain", "Grizzly Bears"] }, [{ board: ["Prince of Thralls"] }]);
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Lightning Bolt", s).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "payUnless" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Prince of Thralls:");
  await expect(bar).toContainText("let Ana put that card onto the battlefield");
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.players[0]!.life).toBe(37);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Urza's Sylex: pay {2} for Jace Beleren as it's exiled, then keep six lands; everything else is destroyed", async ({ page }) => {
  // Seven lands of different names (lands of one name stack), six of them to pay {2}{W}{W} and then {2}.
  const lands = ["Plains", "Snow-Covered Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes"];
  const s = scene({ board: [...lands, "Urza's Sylex", "Grizzly Bears"], library: ["Jace Beleren"] }, [{ board: ["Serra Angel", "Forest"] }]);
  const [sylex, bears, angel, jace] = [one(s, "Urza's Sylex"), one(s, "Grizzly Bears"), one(s, "Serra Angel"), one(s, "Jace Beleren")];
  const mine = lands.map((n) => idsOf(s, n, "battlefield", 0)[0]!);
  await open(page, s);
  await card(page, "Urza's Sylex", s).click();
  await menu(page).locator("button", { hasText: "Each player chooses six lands" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0 && st.pending.pay?.mana === "{2}");
  const bar = controls(page);
  await expect(bar).toContainText("Urza's Sylex");
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  await modal(page).locator(`[data-pick="${jace}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.action === "keep" && st.pending.player === 0);
  await expect(bar).toContainText("click 6 lands of yours to keep. The rest are destroyed.");
  const keep = mine.filter((id) => id !== idsOf(s, "Wastes", "battlefield", 0)[0]);
  for (const id of keep) await page.locator(`[data-obj="${id}"]`).click();
  await bar.getByRole("button", { name: "Keep 6" }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.objects[bears]!.zone === "graveyard");
  expect(after.objects[jace]!.zone).toBe("hand");
  expect(after.objects[sylex]!.zone).toBe("exile");
  expect(after.objects[angel]!.zone).toBe("graveyard");
  for (const id of keep) expect(after.objects[id]!.zone).toBe("battlefield");
  expect(after.objects[idsOf(s, "Wastes", "battlefield", 0)[0]!]!.zone).toBe("graveyard");
  expect(after.battlefield.filter((id) => after.objects[id]!.controller === 0)).toHaveLength(6);
  expect(pageErrors(page)).toEqual([]);
});
