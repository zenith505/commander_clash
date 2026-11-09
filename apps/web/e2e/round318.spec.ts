// Round 318's prompts: Curator of Destinies' face-down pile that you separate, Sauron's Ransom's face-down pile (shown as
// card backs) that you choose, and Hostile Negotiations' "Turn pile N face up".
import { expect, test } from "@playwright/test";
import { applyAction, botActions, planCast, waitingOn, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { controls, modal, resolveUntil } from "./ui";

const TOP = ["Hill Giant", "Shock", "Sol Ring", "Mind Stone", "Lightning Bolt", "Craw Wurm"];

/** In the engine: bots answer their prompts and everyone passes, until `done`. */
function botsUntil(s: GameState, done: (s: GameState) => boolean): GameState {
  for (let i = 0; i < 200 && !done(s); i++) {
    const pid = waitingOn(s)!;
    s = applyAction(s, pid === 0 ? { type: "passPriority", player: 0 } : botActions(s, pid)[0]!);
  }
  expect(done(s)).toBe(true);
  return s;
}

test("Curator of Destinies: you put Hill Giant and Shock in the face-down pile; Ana chooses the pile for your hand", async ({ page }) => {
  let s = scene({ hand: ["Curator of Destinies"], board: LANDS, library: TOP.slice(0, 5) });
  const five = TOP.slice(0, 5).map((n) => one(s, n));
  const [giant, shock] = [one(s, "Hill Giant"), one(s, "Shock")];
  for (const a of planCast(s, 0, one(s, "Curator of Destinies"))!) s = applyAction(s, a);
  s = botsUntil(s, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "opponent" && x.pending.player === 0);
  s = applyAction(s, { type: "chooseOption", player: 0, choice: "1" });
  expect(s.pending).toMatchObject({ kind: "searchLibrary", player: 0, piles: true });
  await open(page, s);
  const sep = modal(page);
  await expect(sep).toContainText("Curator of Destinies: separate your cards into a face-down pile and a face-up pile. Choose the cards for the face-down pile");
  await expect(sep).toContainText("The rest form the face-up pile");
  await sep.locator(`[data-pick="${giant}"]`).click();
  await sep.locator(`[data-pick="${shock}"]`).click();
  await expect(sep).toContainText("Face-down pile");
  await sep.getByRole("button", { name: "Done", exact: true }).click();
  // Ana's bot chooses which pile goes to your hand.
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && five.every((id) => x.objects[id]!.zone !== "library"));
  const zones = five.map((id) => after.objects[id]!.zone);
  expect(zones[0]).toBe(zones[1]);
  expect(new Set(zones.slice(2))).toEqual(new Set([zones[0] === "hand" ? "graveyard" : "hand"]));
  expect(after.log.some((l) => l.text === "You separates them into a face-down pile of 2 cards and a face-up pile: Sol Ring, Mind Stone, Lightning Bolt.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Sauron's Ransom: Ana separates the top four; the face-down pile shows only card backs; put the face-up pile into your hand", async ({ page }) => {
  let s = scene({ hand: ["Sauron's Ransom"], board: LANDS, library: TOP.slice(0, 4) });
  const four = TOP.slice(0, 4).map((n) => one(s, n));
  for (const a of planCast(s, 0, one(s, "Sauron's Ransom"))!) s = applyAction(s, a);
  s = botsUntil(s, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "opponent" && x.pending.player === 0);
  s = applyAction(s, { type: "chooseOption", player: 0, choice: "1" });
  // Ana looks and separates them; then you choose a pile.
  s = botsUntil(s, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "pile" && x.pending.player === 0);
  const piles = (s.pending as { piles: [string[], string[]] }).piles;
  await open(page, s);
  const picker = modal(page);
  await expect(picker).toContainText("Face-down pile");
  await expect(picker).toContainText("Face-up pile");
  const down = picker.locator('[data-pile="0"]');
  await expect(down.locator(".card.back")).toHaveCount(piles[0].length);
  for (const id of piles[0]) await expect(down).not.toContainText(s.cards[s.objects[id]!.cardId]!.name);
  await picker.getByRole("button", { name: "Put the face-up pile into your hand" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && four.every((id) => x.objects[id]!.zone !== "library"));
  expect(piles[1].every((id) => after.objects[id]!.zone === "hand")).toBe(true);
  expect(piles[0].every((id) => after.objects[id]!.zone === "graveyard")).toBe(true);
  expect(after.players[0]!.ring?.tempted).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Hostile Negotiations: Turn pile 2 face up, choose Ana, and she gives you one of the piles", async ({ page }) => {
  let s = scene({ hand: ["Hostile Negotiations"], board: LANDS, library: TOP });
  const six = TOP.map((n) => one(s, n));
  const life = s.players[0]!.life;
  for (const a of planCast(s, 0, one(s, "Hostile Negotiations"))!) s = applyAction(s, a);
  s = botsUntil(s, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "pile" && x.pending.player === 0);
  const piles = (s.pending as { piles: [string[], string[]] }).piles;
  expect(piles.map((p) => p.length)).toEqual([3, 3]);
  await open(page, s);
  const picker = modal(page);
  await expect(picker).toContainText("choose a pile to turn face up");
  // You looked at both piles: both show their cards.
  for (const id of [...piles[0], ...piles[1]]) await expect(picker).toContainText(s.cards[s.objects[id]!.cardId]!.name);
  await picker.getByRole("button", { name: "Turn pile 2 face up" }).click();
  const asked = await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "opponent" && x.pending.player === 0);
  expect(piles[1].every((id) => !asked.objects[id]!.hiddenExile)).toBe(true);
  expect(piles[0].every((id) => !!asked.objects[id]!.hiddenExile)).toBe(true);
  await controls(page).getByRole("button", { name: "Ana", exact: true }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && six.every((id) => x.objects[id]!.zone === "hand" || x.objects[id]!.zone === "graveyard"));
  const zones = six.map((id) => after.objects[id]!.zone);
  expect(new Set(piles[0].map((id) => after.objects[id]!.zone)).size).toBe(1);
  expect(new Set(piles[1].map((id) => after.objects[id]!.zone)).size).toBe(1);
  expect(zones.filter((z) => z === "hand").length).toBe(3);
  expect(after.players[0]!.life).toBe(life - 3);
  expect(pageErrors(page)).toEqual([]);
});
