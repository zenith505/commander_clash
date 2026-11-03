// Lane B round 94's choices in the browser: Sword-Point Diplomacy's revealed card to do next, Shattered Seraph's
// "exile this card from your hand" ability and casting it from exile, Rites of Initiation's number of cards, and Distant
// Memories' "have you put that card into your hand" for an opponent.
import { expect, test } from "@playwright/test";
import { applyAction, manaAbilitiesOn, planCast, power, waitingOn, type Action, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil, seat } from "./ui";

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => applyAction(x, a), s);
};
/** Everyone passes until there's a prompt (or nothing left to resolve). */
const passToPrompt = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

test("Sword-Point Diplomacy: you choose Hill Giant to go first, then Elvish Visionary; nothing is left in the library", async ({ page }) => {
  const s0 = scene({ board: LANDS, hand: ["Sword-Point Diplomacy"], library: ["Grizzly Bears", "Hill Giant", "Elvish Visionary"] });
  const [spd, bears, giant, visionary] = [one(s0, "Sword-Point Diplomacy"), one(s0, "Grizzly Bears"), one(s0, "Hill Giant"), one(s0, "Elvish Visionary")];
  const s = passToPrompt(run(s0, planCast(s0, 0, spd, [], undefined, "auto")));
  expect(s.pending).toMatchObject({ kind: "chooseOption", player: 0, what: "nextRevealed" });
  await open(page, s);
  await expect(controls(page)).toContainText("choose the revealed card to do next");
  await controls(page).getByRole("button", { name: "Hill Giant", exact: true }).click();
  // The opponents answer for Hill Giant, then the next card is yours to pick.
  const mid = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "nextRevealed" && st.pending.options.length === 2);
  // Hill Giant went to your hand, or stays on top until the end because an opponent paid 3 life.
  expect(mid.objects[giant]!.zone === "hand" || [1, 2, 3].some((p) => mid.players[p]!.life === 37)).toBe(true);
  expect([...(mid.pending as { options: string[] }).options].sort()).toEqual([bears, visionary].sort());
  await controls(page).getByRole("button", { name: "Elvish Visionary", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[spd]!.zone === "graveyard");
  for (const id of [bears, giant, visionary]) expect(["hand", "exile"]).toContain(after.objects[id]!.zone);
  expect(pageErrors(page)).toEqual([]);
});

test("Shattered Seraph: exile it from your hand so Wastes gains its mana ability, then cast it from exile", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Wastes"], hand: ["Shattered Seraph"] });
  const seraphId = one(s, "Shattered Seraph");
  const wastes = one(s, "Wastes");
  await open(page, s);
  await card(page, "Shattered Seraph", s).click();
  await menu(page).locator("button", { hasText: /land gains/ }).click();
  await page.locator(`[data-obj="${wastes}"]`).click();
  let now = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[seraphId]!.zone === "exile" && manaAbilitiesOn(st, st.objects[wastes]!).length === 2);
  expect(now.objects[seraphId]!.mayPlay).toMatchObject({ player: 0 });
  const exile = seat(page, 0).locator(".zone", { hasText: "Exile" });
  await exile.click();
  await modal(page).locator(".card.playable").click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  now = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[seraphId]!.zone === "battlefield");
  expect(manaAbilitiesOn(now, now.objects[wastes]!).length).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Rites of Initiation: choose to discard 2 of your 3 other cards at random; your Grizzly Bears gets +2/+0", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Grizzly Bears"], hand: ["Rites of Initiation", "Hill Giant", "Elvish Visionary", "Forest"] });
  const [rites, bears] = [one(s0, "Rites of Initiation"), one(s0, "Grizzly Bears")];
  const s = passToPrompt(run(s0, planCast(s0, 0, rites, [], undefined, "auto")));
  expect(s.pending).toMatchObject({ kind: "chooseOption", player: 0, what: "number", numberRange: { min: 0, max: 3 } });
  await open(page, s);
  await expect(controls(page)).toContainText("discard how many cards at random (0 to 3)?");
  const field = controls(page).locator("input[type=number]");
  if (await field.count()) {
    await field.fill("2");
    await controls(page).getByRole("button", { name: "Choose 2", exact: true }).click();
  } else await controls(page).getByRole("button", { name: "2", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[rites]!.zone === "graveyard");
  expect(after.players[0]!.hand.length).toBe(1);
  expect(after.players[0]!.graveyard.length).toBe(3);
  expect(power(after, after.objects[bears]!)).toBe(4);
  expect(pageErrors(page)).toEqual([]);
});

test("Distant Memories cast by Ana: you have her put the exiled Hill Giant into her hand", async ({ page }) => {
  const s0 = scene({ board: LANDS }, [{ board: LANDS, hand: ["Distant Memories"], library: ["Forest", "Hill Giant"] }]);
  const [dm, giant] = [one(s0, "Distant Memories"), one(s0, "Hill Giant")];
  // Ana's turn: she casts it and finds Hill Giant.
  let s = s0;
  for (let i = 0; i < 400 && !(s.activePlayer === 1 && s.step === "main1"); i++) {
    const w = waitingOn(s)!;
    if (s.pending?.kind === "declareAttackers") s = applyAction(s, { type: "declareAttackers", player: w, attacks: [] });
    else if (s.pending?.kind === "discardToHandSize") s = applyAction(s, { type: "discard", player: w, objectIds: s.players[w]!.hand.slice(0, s.pending.count) });
    else s = applyAction(s, { type: "passPriority", player: w });
  }
  s = passToPrompt(run(s, planCast(s, 1, dm, [], undefined, "auto")));
  expect(s.pending).toMatchObject({ kind: "searchLibrary", player: 1 });
  s = applyAction(s, { type: "searchLibrary", player: 1, found: [giant] });
  expect(s.pending).toMatchObject({ kind: "chooseOption", what: "punisher" });
  // The opponents in turn order after Ana: Ben and Cy (bots) say no; you are the last.
  for (let i = 0; i < 4 && s.pending?.kind === "chooseOption" && s.pending.player !== 0; i++) s = applyAction(s, { type: "chooseOption", player: s.pending.player, choice: "none" });
  expect(s.pending).toMatchObject({ kind: "chooseOption", player: 0, what: "punisher" });
  const hand = s.players[1]!.hand.length;
  await open(page, s);
  await controls(page).getByRole("button", { name: "Have them put it into their hand", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[dm]!.zone === "graveyard");
  expect(after.objects[giant]!.zone).toBe("hand");
  // No three cards drawn instead (Ana may have played a land since).
  expect(after.players[1]!.hand.length).toBeLessThanOrEqual(hand + 1);
  expect(pageErrors(page)).toEqual([]);
});
