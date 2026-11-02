// Lane B round 79 in the browser: Wand of Denial's look at the top card of another player's library, where taking the
// nonland card costs 2 life (the pick says so), and Cadaverous Bloom's {B}{B} or {G}{G}, only those two colors offered.
import { expect, test } from "@playwright/test";
import { applyAction, planActivate, waitingOn, type Action, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { controls, modal, resolveUntil } from "./ui";

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => applyAction(x, a), s);
};
/** Everyone passes until there's a prompt (or nothing left to resolve). */
const passToPrompt = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

test("Wand of Denial: pay 2 life to put the nonland card on top of Ana's library into her graveyard", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Wand of Denial"] }, [{ library: ["Lightning Bolt", "Forest"] }]);
  const s = passToPrompt(run(s0, planActivate(s0, 0, one(s0, "Wand of Denial"), 0, [{ kind: "player", id: 1 }])));
  expect(s.pending).toMatchObject({ kind: "searchLibrary", player: 0, min: 0, max: 1, dig: { payLife: 2 } });
  const top = s.players[1]!.library[0]!;
  const life = s.players[0]!.life;
  await open(page, s);
  const pick = modal(page);
  await expect(pick).toContainText("you pay 2 life for each");
  await pick.locator(`[data-pick="${top}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[top]!.zone).toBe("graveyard");
  expect(after.players[0]!.life).toBe(life - 2);
  expect(pageErrors(page)).toEqual([]);
});

test("Wand of Denial: taking nothing leaves the card on top and costs no life", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Wand of Denial"] }, [{ library: ["Lightning Bolt", "Forest"] }]);
  const s = passToPrompt(run(s0, planActivate(s0, 0, one(s0, "Wand of Denial"), 0, [{ kind: "player", id: 1 }])));
  expect(s.pending).toMatchObject({ kind: "searchLibrary", player: 0, dig: { payLife: 2 } });
  const top = s.players[1]!.library[0]!;
  const life = s.players[0]!.life;
  await open(page, s);
  await expect(modal(page)).toContainText("The top of Ana's library");
  await modal(page).getByRole("button", { name: "Take none" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.players[1]!.library[0]).toBe(top);
  expect(after.players[0]!.life).toBe(life);
  expect(pageErrors(page)).toEqual([]);
});

test("Cadaverous Bloom: exile a card from your hand, then choose Green for {G}{G}", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Cadaverous Bloom"], hand: ["Grizzly Bears"] });
  const bloom = one(s0, "Cadaverous Bloom");
  const bears = one(s0, "Grizzly Bears");
  const s = passToPrompt(run(s0, planActivate(s0, 0, bloom, 0, [], undefined, undefined, undefined, { exileFromHand: [bears] })));
  expect(s.pending).toMatchObject({ kind: "chooseOption", player: 0, what: "color" });
  const g = s.players[0]!.manaPool.G ?? 0;
  await open(page, s);
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "Green" })).toHaveCount(1);
  await expect(bar.getByRole("button", { name: "Black" })).toHaveCount(1);
  await expect(bar.getByRole("button", { name: "Red" })).toHaveCount(0);
  await bar.getByRole("button", { name: "Green" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[bears]!.zone).toBe("exile");
  expect((after.players[0]!.manaPool.G ?? 0) - g).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});
