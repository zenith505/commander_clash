// Lane B round B304's choice in the browser: Development's "unless any opponent has you draw a card", three times, cast
// from the split card's menu by you (the bots answer), and cast by Ana with you answering "Have them draw a card".
import { expect, test } from "@playwright/test";
import { applyAction, controllerOf, defOf, planCast, waitingOn, type Action, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => applyAction(x, a), s);
};
/** Everyone passes until there's a prompt (or nothing left to resolve). */
const passToPrompt = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const elementals = (s: GameState, pid: number) => s.battlefield.filter((id) => defOf(s, s.objects[id]!).name === "Elemental Token" && controllerOf(s, s.objects[id]!) === pid).length;

test("Development from the split card's menu: each time, an opponent has you draw or you get a 3/1 Elemental", async ({ page }) => {
  const s = scene({ hand: ["Research // Development"], board: LANDS });
  const rd = one(s, "Research // Development");
  await open(page, s);
  await card(page, "Research // Development", s).click();
  await menu(page).getByRole("button", { name: /^Cast Development/ }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[rd]!.zone === "graveyard");
  // Three times: a card drawn (it left your library) or a token each time.
  expect(s.players[0]!.library.length - after.players[0]!.library.length + elementals(after, 0)).toBe(3);
  expect(pageErrors(page)).toEqual([]);
});

test("Development cast by Ana: Ben and Cy say no, and you have her draw a card instead of making a token", async ({ page }) => {
  const s0 = scene({ board: LANDS }, [{ board: LANDS, hand: ["Research // Development"] }]);
  const rd = one(s0, "Research // Development");
  // Ana's turn: she casts Development.
  let s = s0;
  for (let i = 0; i < 400 && !(s.activePlayer === 1 && s.step === "main1"); i++) {
    const w = waitingOn(s)!;
    if (s.pending?.kind === "declareAttackers") s = applyAction(s, { type: "declareAttackers", player: w, attacks: [] });
    else if (s.pending?.kind === "discardToHandSize") s = applyAction(s, { type: "discard", player: w, objectIds: s.players[w]!.hand.slice(0, s.pending.count) });
    else s = applyAction(s, { type: "passPriority", player: w });
  }
  s = passToPrompt(run(s, planCast(s, 1, rd, [], undefined, "auto", undefined, { face: 1 })));
  expect(s.pending).toMatchObject({ kind: "chooseOption", what: "punisher" });
  // The first time, the opponents in turn order after Ana: Ben and Cy (bots) say no; you are the last.
  for (let i = 0; i < 4 && s.pending?.kind === "chooseOption" && s.pending.player !== 0; i++) s = applyAction(s, { type: "chooseOption", player: s.pending.player, choice: "none" });
  expect(s.pending).toMatchObject({ kind: "chooseOption", player: 0, what: "punisher" });
  // Her draws, counted from her library: she may play a land or cast a card she drew before the poll sees her hand.
  const library = s.players[1]!.library.length;
  await open(page, s);
  await expect(controls(page)).toContainText("they draw a card");
  await controls(page).getByRole("button", { name: "Have them draw a card", exact: true }).click();
  // The second and third times are the bots' and, if they say no, yours again: answer no to those.
  let after: GameState | undefined;
  for (let i = 0; i < 4 && !after; i++) {
    const st = await resolveUntil(page, (x) => (!x.pending && x.stack.length === 0 && x.objects[rd]!.zone === "graveyard") || (x.pending?.kind === "chooseOption" && x.pending.player === 0));
    if (st.pending) await controls(page).getByRole("button", { name: "Don't", exact: true }).click();
    else after = st;
  }
  expect(after).toBeDefined();
  // The first time she drew rather than making a token; three cards and tokens in all.
  const drawn = library - after!.players[1]!.library.length;
  expect(drawn + elementals(after!, 1)).toBe(3);
  expect(drawn).toBeGreaterThanOrEqual(1);
  expect(pageErrors(page)).toEqual([]);
});
