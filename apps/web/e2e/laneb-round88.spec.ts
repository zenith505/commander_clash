// Lane B round 88: Sarpadian Empires, Vol. VII's "As this artifact enters, choose white Citizen, blue Camarid, black
// Thrull, red Goblin, or green Saproling.": a color and a creature type picked together, then its tokens are of them.
import { expect, test } from "@playwright/test";
import { applyAction, planCast, waitingOn, type Action, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => applyAction(x, a), s);
};
/** Everyone passes until there's a prompt (or nothing left to resolve). */
const passToPrompt = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

test("Sarpadian Empires, Vol. VII: choose one of the five color and type pairs as it enters", async ({ page }) => {
  const s0 = scene({ hand: ["Sarpadian Empires, Vol. VII"], board: [...LANDS] });
  const book = one(s0, "Sarpadian Empires, Vol. VII");
  const s = passToPrompt(run(s0, planCast(s0, 0, book)));
  expect(s.pending).toMatchObject({ kind: "chooseOption", player: 0, what: "colorAndType" });
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Sarpadian Empires, Vol. VII: choose a color and creature type");
  await expect(bar.getByRole("button")).toHaveText([/White Citizen$/, /Blue Camarid$/, /Black Thrull$/, /Red Goblin$/, /Green Saproling$/]);
  await bar.getByRole("button", { name: /Black Thrull$/ }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[book]!.chosen?.type !== undefined);
  expect(after.objects[book]!.zone).toBe("battlefield");
  expect(after.objects[book]!.chosen).toMatchObject({ color: "B", type: "Thrull" });
  expect(pageErrors(page)).toEqual([]);
});
