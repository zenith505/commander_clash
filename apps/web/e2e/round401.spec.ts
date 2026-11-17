// Round 401 in the browser: Ogre Battlecaster's attack trigger casting Lightning Bolt from your graveyard for its mana cost
// and {R}{R} more; Mairsil, the Pretender caging Shivan Dragon from your graveyard and using its ability once this turn;
// Kylox's Voltstrider collecting evidence, then casting a Bolt from among the cards it exiled as it attacks.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { attack, card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

test("Ogre Battlecaster: attack, target the Bolt in your graveyard, cast it for {R} and {R}{R} at Ana; +1/+0, Bolt exiled", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Ogre Battlecaster"], yard: ["Lightning Bolt", "Hill Giant"] }, [{}]);
  const [ogre, bolt] = [one(s, "Ogre Battlecaster"), one(s, "Lightning Bolt")];
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers");
  await attack(page, [[ogre, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  // Only the instant: the Hill Giant isn't a target.
  await expect(modal(page).locator(`[data-pick="${one(s, "Hill Giant")}"]`)).toHaveCount(0);
  await modal(page).locator(`[data-pick="${bolt}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree");
  await expect(controls(page)).toContainText("cast Lightning Bolt from your graveyard for");
  await expect(controls(page)).toContainText("its mana cost and");
  await controls(page).getByRole("button", { name: "Cast it" }).click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "exile" && st.effects.some((e) => e.affected.includes(ogre)));
  expect(after.players[1]!.life).toBe(37);
  // The Bolt's {R} and {R}{R} more: three Mountains tapped.
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped && after.cards[after.objects[id]!.cardId]!.name === "Mountain").length).toBe(3);
  expect(pageErrors(page)).toEqual([]);
});

test("Mairsil, the Pretender: cast it, cage Shivan Dragon from your graveyard, pump it once; the ability can't be used again this turn", async ({ page }) => {
  const s = scene({ hand: ["Mairsil, the Pretender"], board: LANDS, yard: ["Shivan Dragon", "Lightning Bolt"] });
  const [mairsil, dragon] = [one(s, "Mairsil, the Pretender"), one(s, "Shivan Dragon")];
  await open(page, s);
  await card(page, "Mairsil, the Pretender", s).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  // Artifact and creature cards only: the Shivan Dragon, not the Bolt.
  expect(asked.pending?.kind === "searchLibrary" && asked.pending.cards).toContain(dragon);
  expect(asked.pending?.kind === "searchLibrary" && asked.pending.cards).not.toContain(one(s, "Lightning Bolt"));
  const pick = modal(page);
  await expect(pick).toContainText("to exile with a cage counter on it");
  await pick.locator(`[data-pick="${dragon}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const caged = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[dragon]!.zone === "exile");
  expect(caged.objects[dragon]!.counters.cage).toBe(1);
  await card(page, "Mairsil, the Pretender", s).click();
  await menu(page).locator("button", { hasText: "gets +1/+0" }).first().click();
  const pumped = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && !!st.objects[mairsil]!.borrowedUsed?.length);
  expect(pumped.effects.some((e) => e.affected.includes(mairsil))).toBe(true);
  // Once each turn: no second activation.
  await card(page, "Mairsil, the Pretender", s).click();
  await expect(menu(page).locator("button:not([disabled])", { hasText: "gets +1/+0" })).toHaveCount(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Kylox's Voltstrider: collect evidence 6 with Lava Axe and the Bolt, attack, cast the Bolt from among them at Ana; it goes to the bottom of your library", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Kylox's Voltstrider"], yard: ["Lava Axe", "Lightning Bolt"] }, [{}]);
  const [kylox, axe, bolt] = [one(s, "Kylox's Voltstrider"), one(s, "Lava Axe"), one(s, "Lightning Bolt")];
  await open(page, s);
  await card(page, "Kylox's Voltstrider", s).click();
  await menu(page).locator("button", { hasText: "Collect evidence 6" }).first().click();
  const pick = modal(page);
  await pick.locator(`[data-pick="${axe}"]`).click();
  await pick.locator(`[data-pick="${bolt}"]`).click();
  await pick.getByRole("button", { name: /Collect|Done/ }).first().click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "exile");
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers");
  await attack(page, [[kylox, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.player === 0 && st.pending.what === "castFromAmong");
  await controls(page).getByRole("button", { name: "Lightning Bolt" }).click();
  await controls(page).getByRole("button", { name: "Cast it" }).click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "library");
  expect(after.players[0]!.library.at(-1)).toBe(bolt);
  expect(after.players[1]!.life).toBe(37);
  expect(after.objects[axe]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});
