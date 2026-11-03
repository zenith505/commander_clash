// Lane B round 92's choices in the browser: Mist of Stagnation's permanents to untap at your upkeep (anyone's), Temporal
// Firestorm's creatures to phase out (up to the times it was kicked), and Memory Theft's card with an Adventure from exile.
import { expect, test } from "@playwright/test";
import { applyAction, planCast, waitingOn, type Action, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { clickPlayer, card, controls, modal, resolveUntil } from "./ui";

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => applyAction(x, a), s);
};
/** Everyone passes until there's a prompt (or nothing left to resolve). */
const passToPrompt = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

test("Mist of Stagnation: at your upkeep, with two cards in your graveyard, untap your Grizzly Bears and Ana's Hill Giant", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Mist of Stagnation", "Grizzly Bears", "Llanowar Elves"], yard: ["Lightning Bolt", "Shock"] }, [{ board: ["Hill Giant"] }]);
  const [bears, elves, giant] = [one(s0, "Grizzly Bears"), one(s0, "Llanowar Elves"), one(s0, "Hill Giant")];
  for (const id of [bears, elves, giant]) s0.objects[id]!.tapped = true;
  const s = playUntil(s0, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  // Nothing untapped in your untap step.
  expect([bears, elves, giant].map((id) => s.objects[id]!.tapped)).toEqual([true, true, true]);
  await open(page, s);
  await expect(controls(page)).toContainText("choose a permanent for each card in your graveyard (anyone's): they untap");
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  await controls(page).getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && !st.objects[bears]!.tapped);
  expect([after.objects[bears]!.tapped, after.objects[giant]!.tapped, after.objects[elves]!.tapped]).toEqual([false, false, true]);
  expect(pageErrors(page)).toEqual([]);
});

test("Temporal Firestorm kicked twice: phase out Grizzly Bears; Llanowar Elves and Ana's Hill Giant take 5 damage", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Grizzly Bears", "Llanowar Elves"], hand: ["Temporal Firestorm"] }, [{ board: ["Hill Giant"] }]);
  const [firestorm, bears, elves, giant] = [one(s0, "Temporal Firestorm"), one(s0, "Grizzly Bears"), one(s0, "Llanowar Elves"), one(s0, "Hill Giant")];
  const s = passToPrompt(run(s0, planCast(s0, 0, firestorm, [], undefined, "auto", undefined, { kicks: [0, 1] })));
  expect(s.pending).toMatchObject({ kind: "pickPermanents", player: 0, count: 2 });
  await open(page, s);
  await expect(controls(page)).toContainText("choose creatures and/or planeswalkers you control to phase out, up to one for each time Temporal Firestorm was kicked");
  await page.locator(`[data-obj="${bears}"]`).click();
  await controls(page).getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[giant]!.zone === "graveyard");
  expect([after.objects[bears]!.zone, after.objects[elves]!.zone]).toEqual(["phasedOut", "graveyard"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Memory Theft at Ana: she discards Lightning Bolt, then Yes, and her exiled Bonecrusher Giant goes to her graveyard", async ({ page }) => {
  const s = scene({ board: LANDS, hand: ["Memory Theft"] }, [{ hand: ["Lightning Bolt"], exile: ["Bonecrusher Giant // Stomp", "Hill Giant"] }]);
  const [theft, bolt, bonecrusher, giant] = [one(s, "Memory Theft"), one(s, "Lightning Bolt"), one(s, "Bonecrusher Giant"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Memory Theft", s).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const discard = modal(page);
  await discard.locator(`[data-pick="${bolt}"]`).click();
  await discard.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  await controls(page).getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0 && st.objects[bolt]!.zone === "graveyard");
  const pick = modal(page);
  await expect(pick).toContainText("a card that has an Adventure");
  await expect(pick.locator(`[data-pick="${giant}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${bonecrusher}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[theft]!.zone === "graveyard");
  expect([after.objects[bonecrusher]!.zone, after.objects[giant]!.zone]).toEqual(["graveyard", "exile"]);
  expect(pageErrors(page)).toEqual([]);
});
