// Round 95's prompts: Fact or Fiction's and Steam Augury's two piles (separate the revealed cards, then choose a pile),
// Opposition Agent's control of an opponent's search, and Conduit of Worlds' "you may cast that card" from the
// graveyard, paying its cost as the ability resolves.
import { expect, test } from "@playwright/test";
import { applyAction, botActions, planCast, waitingOn, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

const TOP = ["Hill Giant", "Shock", "Sol Ring", "Mind Stone", "Lightning Bolt"];

test("Fact or Fiction: the opponent you choose separates the five cards, you pick the pile for your hand", async ({ page }) => {
  const s = scene({ hand: ["Fact or Fiction"], board: LANDS, library: TOP });
  const five = TOP.map((n) => one(s, n));
  await open(page, s);
  await card(page, "Fact or Fiction", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "opponent");
  await expect(controls(page)).toContainText("choose an opponent to separate the cards into two piles");
  await controls(page).getByRole("button", { name: "Ben", exact: true }).click();
  // Ben's bot separates them; then the piles are yours to choose from.
  const st = await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "pile");
  const piles = (st.pending as Extract<NonNullable<GameState["pending"]>, { kind: "chooseOption" }>).piles!;
  expect([...piles[0], ...piles[1]].sort()).toEqual([...five].sort());
  const picker = modal(page);
  await expect(picker).toContainText("Fact or Fiction: choose the pile to put into your hand (the other goes into the graveyard)");
  for (const id of piles[1]) await expect(picker.locator('[data-pile="1"]')).toContainText(st.cards[st.objects[id]!.cardId]!.name);
  await picker.getByRole("button", { name: "Put pile 2 into your hand" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && piles[1].every((id) => x.objects[id]!.zone === "hand"));
  expect(piles[0].every((id) => after.objects[id]!.zone === "graveyard")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Steam Augury: you separate the cards into two piles, and the opponent chooses which goes to your hand", async ({ page }) => {
  const s = scene({ hand: ["Steam Augury"], board: LANDS, library: TOP });
  const five = TOP.map((n) => one(s, n));
  await open(page, s);
  await card(page, "Steam Augury", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "opponent");
  await controls(page).getByRole("button", { name: "Ana", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && !!st.pending.piles);
  const sep = modal(page);
  await expect(sep).toContainText("Steam Augury: separate your revealed cards into two piles");
  await expect(sep).toContainText("An opponent chooses one for your hand");
  await sep.locator(`[data-pick="${five[0]}"]`).click();
  await sep.locator(`[data-pick="${five[2]}"]`).click();
  await expect(sep).toContainText("First pile");
  await sep.getByRole("button", { name: "Done", exact: true }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && five.every((id) => x.objects[id]!.zone !== "library"));
  const first = [five[0]!, five[2]!].map((id) => after.objects[id]!.zone);
  const second = [five[1]!, five[3]!, five[4]!].map((id) => after.objects[id]!.zone);
  // One pile in the hand, the other in the graveyard.
  expect(new Set(first).size).toBe(1);
  expect(new Set(second).size).toBe(1);
  expect(first[0]).not.toBe(second[0]);
  expect(pageErrors(page)).toEqual([]);
});

test("Opposition Agent: you choose what Ana finds with her Vampiric Tutor, and it's exiled for you to play", async ({ page }) => {
  let s: GameState = scene({ board: [...LANDS, "Opposition Agent"] }, [{ hand: ["Vampiric Tutor"], board: LANDS, library: ["Hill Giant", "Sol Ring"] }]);
  const [giant, ring] = [one(s, "Hill Giant"), one(s, "Sol Ring")];
  s = applyAction(s, { type: "passPriority", player: 0 });
  for (const a of planCast(s, 1, one(s, "Vampiric Tutor"))!) s = applyAction(s, a);
  for (let i = 0; i < 20 && !(s.pending?.kind === "searchLibrary" && s.pending.player === 0); i++) {
    const pid = waitingOn(s)!;
    s = applyAction(s, pid === 0 ? { type: "passPriority", player: 0 } : botActions(s, pid)[0]!);
  }
  expect(s.pending).toMatchObject({ kind: "searchLibrary", player: 0, controlling: 1, foundExiled: true });
  await open(page, s);
  const pick = modal(page);
  await expect(pick).toContainText("Vampiric Tutor: you control Ana's search. Find a card in their library");
  await expect(pick).toContainText("They're exiled, and you may play them.");
  await pick.locator(`[data-pick="${giant}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.objects[giant]!.zone === "exile");
  expect(after.objects[giant]!.mayPlay).toMatchObject({ player: 0, until: "exiled", anyType: true });
  expect(after.objects[ring]!.zone).toBe("library");
  expect(pageErrors(page)).toEqual([]);
});

test("Conduit of Worlds: cast a permanent card from your graveyard as the ability resolves, paying its cost", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Conduit of Worlds"], yard: ["Hill Giant"] });
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Conduit of Worlds", s).click();
  await menu(page).getByRole("button", { name: /Choose target nonland permanent card/ }).click();
  // Its target is a card in your graveyard: the picker opens on its own.
  await modal(page).locator(`[data-pick="${giant}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree");
  await expect(controls(page)).toContainText("Conduit of Worlds: cast Hill Giant from your graveyard for");
  await expect(controls(page)).toContainText("Only now, and then you can't cast other spells this turn.");
  await controls(page).getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[giant]!.zone === "battlefield");
  expect(after.objects[giant]!.controller).toBe(0);
  expect(after.cantCastThisTurn).toEqual([expect.objectContaining({ player: 0, turn: after.turn })]);
  expect(pageErrors(page)).toEqual([]);
});
