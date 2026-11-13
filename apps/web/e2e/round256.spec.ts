// Round 256's prompts: Chandra Ablaze's −7 (cast red instants and sorceries from your graveyard one at a time, then
// Done), Fishing Gear's "you may put it onto the battlefield under your control", Chandra, Flame's Catalyst's −8 (the
// "Cast it: without paying its mana cost" entry on a card in your hand this turn) and Kaya the Inexorable's emblem
// (cast a legendary spell from your graveyard at your upkeep).
import { expect, test } from "@playwright/test";
import { applyAction, invalidateCharacteristics, planActivate, type GameState } from "@cc/engine";
import { one, open, pageErrors, playUntil, scene, state } from "./scene";
import { attack, card, clickPlayer, controls, menu, passTo, resolveUntil } from "./ui";

test("Chandra Ablaze −7: cast Lightning Bolt from your graveyard for nothing, then Done", async ({ page }) => {
  const s = scene({ board: ["Chandra Ablaze"], yard: ["Lightning Bolt", "Lava Spike", "Counterspell"] });
  const [chandra, bolt, spike] = [one(s, "Chandra Ablaze"), one(s, "Lightning Bolt"), one(s, "Lava Spike")];
  s.objects[chandra]!.counters.loyalty = 7;
  await open(page, s);
  await page.locator(`[data-obj="${chandra}"]`).click();
  await menu(page).locator("button", { hasText: "Cast any number of red instant" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  const ctl = controls(page);
  await expect(ctl).toContainText("cast a red instant or sorcery spell from your graveyard without paying its mana cost?");
  await expect(ctl.getByRole("button", { name: "Counterspell" })).toHaveCount(0);
  await expect(ctl.getByRole("button", { name: "Lava Spike" })).toBeVisible();
  await ctl.getByRole("button", { name: "Lightning Bolt" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree");
  await ctl.getByRole("button", { name: "Cast it" }).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  await ctl.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life === 37);
  expect([after.objects[bolt]!.zone, after.objects[spike]!.zone]).toEqual(["graveyard", "graveyard"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Fishing Gear: the equipped Bears hit Ana; Yes puts her top card, Llanowar Elves, onto the battlefield under your control", async ({ page }) => {
  const s = scene({ board: ["Fishing Gear", "Grizzly Bears"] }, [{ library: ["Llanowar Elves"] }]);
  const [gear, bears, elves] = [one(s, "Fishing Gear"), one(s, "Grizzly Bears"), one(s, "Llanowar Elves")];
  s.objects[gear]!.attachedTo = bears;
  invalidateCharacteristics(s);
  await open(page, s);
  await passTo(page, "declareAttackers");
  await attack(page, [[bears, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0, 60);
  await expect(controls(page)).toContainText("Fishing Gear: Put the exiled card onto the battlefield under your control?");
  await controls(page).getByRole("button", { name: "Yes" }).click();
  await expect.poll(async () => (await state(page)).objects[elves]!.zone).toBe("battlefield");
  const after = await state(page);
  expect([after.objects[elves]!.controller, after.players[1]!.life]).toEqual([0, 38]);
  expect(pageErrors(page)).toEqual([]);
});

test("Chandra, Flame's Catalyst −8: draw seven, then cast Colossal Dreadmaw from your hand with no lands", async ({ page }) => {
  // The Dreadmaw is the seventh card drawn, the last one in the hand.
  const s = scene({ board: ["Chandra, Flame's Catalyst"], hand: ["Lightning Bolt"], library: ["Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes", "Colossal Dreadmaw"] });
  const [chandra, dreadmaw, bolt] = [one(s, "Chandra, Flame's Catalyst"), one(s, "Colossal Dreadmaw"), one(s, "Lightning Bolt")];
  s.objects[chandra]!.counters.loyalty = 8;
  await open(page, s);
  await page.locator(`[data-obj="${chandra}"]`).click();
  await menu(page).locator("button", { hasText: "Discard your hand, then draw seven cards" }).click();
  const mid = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[dreadmaw]!.zone === "hand");
  expect([mid.objects[bolt]!.zone, mid.players[0]!.hand.length]).toEqual(["graveyard", 7]);
  await card(page, "Colossal Dreadmaw", mid).click();
  await menu(page).getByRole("button", { name: "Cast it: without paying its mana cost" }).click();
  await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[dreadmaw]!.zone === "battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Kaya the Inexorable's emblem: at your upkeep, cast Isamaru from your graveyard for nothing", async ({ page }) => {
  let s: GameState = scene({ board: ["Kaya the Inexorable"], yard: ["Isamaru, Hound of Konda"] });
  const [kaya, isamaru] = [one(s, "Kaya the Inexorable"), one(s, "Isamaru, Hound of Konda")];
  s.objects[kaya]!.counters.loyalty = 7;
  for (const a of planActivate(s, 0, kaya, 2)!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.activePlayer === 0 && st.step === "upkeep" && st.turn > 1 && st.pending?.kind === "chooseOption");
  await open(page, s);
  const ctl = controls(page);
  await expect(ctl).toContainText("cast a legendary spell from your hand, graveyard or exile without paying its mana cost?");
  await ctl.getByRole("button", { name: "Isamaru, Hound of Konda (graveyard)" }).click();
  // The cast comes as the emblem's upkeep trigger resolves: checked on the state that poll saw. Once Isamaru has resolved
  // the app may auto-pass on into the draw step before the next poll, so the step isn't read after that (follow-up 7).
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "castFree");
  expect([asked.step, asked.activePlayer]).toEqual(["upkeep", 0]);
  await ctl.getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[isamaru]!.zone === "battlefield");
  expect([after.turn, after.activePlayer]).toEqual([asked.turn, 0]);
  expect(pageErrors(page)).toEqual([]);
});
