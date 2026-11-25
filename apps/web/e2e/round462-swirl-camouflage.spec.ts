// Round 462 in the browser: Swirl the Mists asks for a color word as it enters; Camouflage cast in your declare attackers
// step has the bots make piles; attacked under Camouflage, you make a pile for each attacker by clicking creatures, and
// choose which blocks are made when not all of them can block together.
import { expect, test } from "@playwright/test";
import { applyAction, characteristics, planCast, waitingOn, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Swirl the Mists: cast it, click Green; Ana's White Knight then has protection from green", async ({ page }) => {
  const s = scene({ hand: ["Swirl the Mists"], board: LANDS }, [{ board: ["White Knight"] }]);
  const [swirl, knight] = [one(s, "Swirl the Mists"), one(s, "White Knight")];
  await open(page, s);
  await card(page, "Swirl the Mists", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "color" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("choose a color word: every color word in the text of spells and permanents becomes it");
  await bar.getByRole("button", { name: /Green/ }).click();
  let after: GameState = s;
  await expect.poll(async () => (after = await state(page)).objects[swirl]!.chosen?.color).toBe("G");
  expect(characteristics(after, after.objects[knight]!).keywords).toContain("Protection from green");
  expect(characteristics(after, after.objects[knight]!).keywords).not.toContain("Protection from black");
  expect(pageErrors(page)).toEqual([]);
});

test("Camouflage: cast in your declare attackers step; Ana makes piles instead of declaring blockers", async ({ page }) => {
  let s = scene({ hand: ["Camouflage"], board: [...LANDS, "Grizzly Bears", "Hill Giant"] }, [{ board: ["Giant Badger", "Llanowar Elves"] }]);
  const [bears, giant, cam] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Camouflage")];
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [{ attacker: bears, defender: 1 }, { attacker: giant, defender: 1 }] });
  s = playUntil(s, (st) => st.step === "declareAttackers" && !st.pending && !st.stack.length && !st.triggerQueue.length && waitingOn(st) === 0);
  await open(page, s);
  await card(page, "Camouflage", s).click();
  const after = await resolveUntil(page, (st) => st.step === "declareBlockers" && !st.pending && !st.camouflage);
  expect(after.objects[cam]!.zone).toBe("graveyard");
  expect(after.camouflageTurn).toBe(after.turn);
  expect(after.log.some((l) => l.text.startsWith("Ana makes pile 1"))).toBe(true);
  expect(after.log.some((l) => /^Ana's pile 2 .* is assigned to (Grizzly Bears|Hill Giant)\.$/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

/** Ana attacks you with `attackers` and casts Camouflage in her declare attackers step; it stops at your first pile. */
function anaCamouflages(attackers: string[], yours: string[]) {
  let s = scene({ board: yours }, [{ hand: ["Camouflage"], board: [...LANDS, ...attackers] }]);
  s = playUntil(s, (st) => st.activePlayer === 1 && st.pending?.kind === "declareAttackers" && st.pending.player === 1);
  s = applyAction(s, { type: "declareAttackers", player: 1, attacks: attackers.map((n) => ({ attacker: one(s, n), defender: 0 })) });
  s = playUntil(s, (st) => st.step === "declareAttackers" && !st.pending && !st.stack.length && !st.triggerQueue.length && waitingOn(st) === 1);
  for (const a of planCast(s, 1, one(s, "Camouflage"))!) s = applyAction(s, a);
  return playUntil(s, (st) => st.pending?.kind === "pickPermanents" && !!st.pending.camouflage && st.pending.player === 0);
}

test("Camouflage against you: click Grizzly Bears for pile 1 and Llanowar Elves for pile 2; each blocks the attacker its pile meets", async ({ page }) => {
  const s = anaCamouflages(["Hill Giant", "Giant Badger"], ["Grizzly Bears", "Llanowar Elves"]);
  const [bears, elves, giant, badger] = [one(s, "Grizzly Bears"), one(s, "Llanowar Elves"), one(s, "Hill Giant"), one(s, "Giant Badger")];
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Camouflage: pile 1 of 2 (one for each creature attacking you)");
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await bar.getByRole("button", { name: /^Choose/ }).click();
  let mid: GameState = s;
  await expect.poll(async () => ((mid = await state(page)).pending?.kind === "pickPermanents" ? mid.pending.options : [])).toEqual([elves]);
  await expect(bar).toContainText("Camouflage: pile 2 of 2");
  await page.locator(`[data-obj="${elves}"]`).first().click();
  await bar.getByRole("button", { name: /^Choose/ }).click();
  let after: GameState = s;
  await expect.poll(async () => (after = await state(page)).objects[bears]!.blocking?.length ?? 0).toBe(1);
  const met = after.objects[bears]!.blocking![0]!;
  expect([giant, badger]).toContain(met);
  expect(after.objects[elves]!.blocking).toEqual([met === giant ? badger : giant]);
  expect(pageErrors(page)).toEqual([]);
});

test("Camouflage with Silent Arbiter: both your creatures in the one pile can't block together, so click which one blocks", async ({ page }) => {
  const s = anaCamouflages(["Hill Giant"], ["Grizzly Bears", "Llanowar Elves", "Silent Arbiter"]);
  const [bears, elves, giant] = [one(s, "Grizzly Bears"), one(s, "Llanowar Elves"), one(s, "Hill Giant")];
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Camouflage: pile 1 of 1");
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await page.locator(`[data-obj="${elves}"]`).first().click();
  await bar.getByRole("button", { name: /^Choose/ }).click();
  await expect.poll(async () => { const st = await state(page); return st.pending?.kind === "chooseOption" ? st.pending.what : undefined; }).toBe("camouflageBlocks");
  await expect(bar).toContainText("not every creature in your piles can block together");
  await bar.getByRole("button", { name: "Llanowar Elves blocks Hill Giant", exact: true }).click();
  let after: GameState = s;
  await expect.poll(async () => (after = await state(page)).objects[elves]!.blocking ?? []).toEqual([giant]);
  expect(after.objects[bears]!.blocking ?? []).toEqual([]);
  expect(pageErrors(page)).toEqual([]);
});
