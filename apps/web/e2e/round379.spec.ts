// Round 379: attackers chosen by another player (Master Warcraft: you pick which of Ana's creatures attack; Ana picks
// yours and you choose what each attacks, or refuse to pay for them), Melee's blocks you declare and the unblocked
// attacker it removes from combat, In Too Deep's target, and Urza Assembles the Titans' chapter III letting a planeswalker
// activate two loyalty abilities this turn.
import { expect, test } from "@playwright/test";
import { applyAction, characteristics, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { attack, card, clickPlayer, controls, menu, resolveUntil } from "./ui";

/** Master Warcraft resolved this turn for `player` (as its "You choose which creatures attack this turn" does). */
const warcraftFor = (s: GameState, player: number) => {
  s.attacksChosenThisTurn = [{ player, turn: s.turn, timestamp: s.nextTimestamp++ }];
};

test("Master Warcraft: you choose which of Ana's creatures attack; she chooses what they attack", async ({ page }) => {
  let s = scene({ board: LANDS }, [{ board: ["Hill Giant", "Gray Ogre"] }]);
  const [giant, ogre] = [one(s, "Hill Giant"), one(s, "Gray Ogre")];
  s = playUntil(s, (st) => st.activePlayer === 1 && st.step === "beginCombat");
  warcraftFor(s, 0);
  s = playUntil(s, (st) => st.pending?.kind === "chooseAttackers");
  expect(s.pending).toEqual({ kind: "chooseAttackers", player: 0, attacker: 1 });
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("You choose which of Ana's creatures attack: click them, then confirm. Ana chooses what each attacks.");
  await expect(bar.getByRole("button", { name: "No attackers" })).toBeEnabled();
  await page.locator(`[data-obj="${giant}"]`).click();
  await bar.getByRole("button", { name: "Ana attacks with 1" }).click();
  const after = await resolveUntil(page, (st) => st.objects[giant]!.attacking !== undefined);
  expect(after.objects[ogre]!.attacking).toBeUndefined();
  expect(after.log.some((l) => l.text === "You chooses Hill Giant to attack.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Master Warcraft: Ana chose your Hill Giant to attack; you choose whom it attacks, and only it can", async ({ page }) => {
  let s = scene({ board: ["Hill Giant", "Gray Ogre"] }, [{}]);
  const [giant, ogre] = [one(s, "Hill Giant"), one(s, "Gray Ogre")];
  warcraftFor(s, 1);
  s = playUntil(s, (st) => st.pending?.kind === "chooseAttackers");
  s = applyAction(s, { type: "chooseAttackers", player: 1, attackers: [giant] });
  expect(s.pending).toEqual({ kind: "declareAttackers", player: 0, fixed: [giant], chooser: 1 });
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Ana chose your attackers: click Hill Giant, then what it attacks.");
  // Nothing to pay here, so nothing to refuse; and not until the Giant has somewhere to go.
  await expect(bar.getByRole("button", { name: "Don't pay" })).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "No attacks" })).toBeDisabled();
  // The Ogre wasn't chosen: clicking it does nothing.
  await page.locator(`[data-obj="${ogre}"]`).click();
  await expect(bar).toContainText("Ana chose your attackers");
  await page.locator(`[data-obj="${giant}"]`).click();
  await clickPlayer(page, 2);
  await bar.getByRole("button", { name: "Attack with 1" }).click();
  const after = await resolveUntil(page, (st) => st.objects[giant]!.attacking !== undefined);
  expect(after.objects[giant]!.attacking).toBe(2);
  expect(after.objects[ogre]!.attacking).toBeUndefined();
  expect(pageErrors(page)).toEqual([]);
});

test("Master Warcraft: every way to attack with what Ana chose costs something, so you don't pay and she chooses again", async ({ page }) => {
  let s = scene({ board: ["Hill Giant"] }, [{ board: ["Ghostly Prison"] }, { board: ["Ghostly Prison"] }, { board: ["Ghostly Prison"] }]);
  const giant = one(s, "Hill Giant");
  warcraftFor(s, 1);
  s = playUntil(s, (st) => st.pending?.kind === "chooseAttackers");
  s = applyAction(s, { type: "chooseAttackers", player: 1, attackers: [giant] });
  await open(page, s);
  const bar = controls(page);
  await bar.getByRole("button", { name: "Don't pay" }).click();
  // Ana can't choose the Giant again, so she chooses no attackers.
  const after = await resolveUntil(page, (st) => st.step !== "declareAttackers" && st.step !== "beginCombat");
  expect(after.objects[giant]!.attacking).toBeUndefined();
  expect(after.log.some((l) => l.text === "You won't pay for those attackers; Ana chooses again.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Melee: cast it after attacking, declare Ana's blocks; the unblocked Giant is untapped and removed from combat", async ({ page }) => {
  const s = scene({ hand: ["Melee"], board: [...LANDS, "Hill Giant", "Gray Ogre"] }, [{ board: ["Grizzly Bears"] }]);
  const [giant, ogre, bears] = [one(s, "Hill Giant"), one(s, "Gray Ogre"), one(s, "Grizzly Bears")];
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers");
  await attack(page, [[giant, 1], [ogre, 1]]);
  await resolveUntil(page, (st) => st.step === "declareAttackers" && st.priority === 0 && !st.pending && st.stack.length === 0);
  await card(page, "Melee", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "declareBlockers" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("You choose Ana's blocks");
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(`[data-obj="${ogre}"]`).click();
  await bar.getByRole("button", { name: "Block with 1" }).click();
  const after = await resolveUntil(page, (st) => st.step === "main2");
  expect(after.objects[giant]!.tapped).toBe(false);
  expect(after.players[1]!.life).toBe(40);
  expect(after.log.some((l) => /Melee removes Hill Giant from combat/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("In Too Deep: Ana's Serra Angel becomes a colorless Clue artifact", async ({ page }) => {
  const s = scene({ hand: ["In Too Deep"], board: LANDS }, [{ board: ["Serra Angel"] }]);
  const angel = one(s, "Serra Angel");
  await open(page, s);
  await card(page, "In Too Deep", s).click();
  await page.locator(`[data-obj="${angel}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && Object.values(st.objects).some((o) => o.attachedTo === angel));
  const c = characteristics(after, after.objects[angel]!);
  expect(c.types).toEqual(["Artifact"]);
  expect(c.subtypes).toEqual(["Clue"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Urza Assembles the Titans: read ahead to chapter III, then Chandra's +1 twice this turn", async ({ page }) => {
  const s = scene({ hand: ["Urza Assembles the Titans"], board: [...LANDS, "Chandra, Torch of Defiance"] });
  const chandra = one(s, "Chandra, Torch of Defiance");
  s.objects[chandra]!.counters.loyalty = 4;
  await open(page, s);
  await card(page, "Urza Assembles the Titans", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  await controls(page).getByRole("button", { name: "Chapter III" }).click();
  await resolveUntil(page, (st) => !!st.turnRules?.some((r) => r.rule === "loyaltyTwice") && st.stack.length === 0 && st.triggerQueue.length === 0 && !st.pending);
  for (const loyalty of [5, 6]) {
    await page.locator(`[data-obj="${chandra}"]`).click();
    await menu(page).locator("button", { hasText: "+1: Add" }).click();
    await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[chandra]!.counters.loyalty === loyalty);
  }
  expect(pageErrors(page)).toEqual([]);
});
