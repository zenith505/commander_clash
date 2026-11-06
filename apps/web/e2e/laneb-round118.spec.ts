// Lane B round B118 in the browser: Vhati il-Dal's "target creature has base power 1 or base toughness 1", which of the two
// chosen as the ability resolves.
import { expect, test } from "@playwright/test";
import { applyAction, characteristics, planActivate, waitingOn, type Action, type GameState } from "@cc/engine";
import { one, open, pageErrors, scene } from "./scene";
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

test("Vhati il-Dal: choose base toughness 1 for an opponent's Hill Giant as the ability resolves", async ({ page }) => {
  const s0 = scene({ board: ["Vhati il-Dal"] }, [{ board: ["Hill Giant"] }]);
  const [vhati, giant] = [one(s0, "Vhati il-Dal"), one(s0, "Hill Giant")];
  const s = passToPrompt(run(s0, planActivate(s0, 0, vhati, 0, [{ kind: "object", id: giant }])));
  expect(s.pending).toMatchObject({ kind: "chooseOption", what: "either", player: 0 });
  await open(page, s);
  const bar = controls(page);
  for (const label of ["Its base power becomes 1", "Its base toughness becomes 1"]) await expect(bar.getByRole("button", { name: label })).toBeVisible();
  await bar.getByRole("button", { name: "Its base toughness becomes 1" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  const c = characteristics(after, after.objects[giant]!);
  expect([c.power, c.toughness]).toEqual([3, 1]);
  expect(pageErrors(page)).toEqual([]);
});
