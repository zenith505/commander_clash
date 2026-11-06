// Lane B round B119 in the browser: Quarry Hauler's "for each kind of counter on target permanent, put another counter
// of that kind on it or remove one from it", one button pair per kind of counter.
import { expect, test } from "@playwright/test";
import { applyAction, invalidateCharacteristics, planCast, waitingOn, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

/** Everyone passes until there's a prompt (or nothing left to resolve). */
const passToPrompt = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

test("Quarry Hauler: add a +1/+1 counter and remove a charge counter from your Hill Giant", async ({ page }) => {
  let s = scene({ hand: ["Quarry Hauler"], board: ["Hill Giant", ...LANDS] });
  const [hauler, giant] = [one(s, "Quarry Hauler"), one(s, "Hill Giant")];
  s.objects[giant]!.counters = { "+1/+1": 1, charge: 2 };
  invalidateCharacteristics(s);
  const plan = planCast(s, 0, hauler);
  expect(plan).not.toBeNull();
  for (const a of plan!) s = applyAction(s, a);
  s = passToPrompt(s);
  expect(s.pending).toMatchObject({ kind: "chooseTargets", player: 0 });
  s = passToPrompt(applyAction(s, { type: "chooseTargets", player: 0, targets: [{ kind: "object", id: giant }] }));
  expect(s.pending).toMatchObject({ kind: "chooseOption", what: "addOrRemoveCounter", player: 0 });
  await open(page, s);
  const answers: Record<string, string> = { "+1/+1": "Put another +1/+1 counter on it", charge: "Remove a charge counter from it" };
  const asked: string[] = [];
  let st = s;
  while (st.pending?.kind === "chooseOption" && st.pending.what === "addOrRemoveCounter") {
    const kind = st.pending.counterKind!;
    asked.push(kind);
    const bar = controls(page);
    await expect(bar.getByRole("button", { name: `Put another ${kind} counter on it` })).toBeVisible();
    await expect(bar.getByRole("button", { name: `Remove a ${kind} counter from it` })).toBeVisible();
    await bar.getByRole("button", { name: answers[kind]! }).click();
    st = await resolveUntil(page, (x) => (x.pending?.kind === "chooseOption" && x.pending.what === "addOrRemoveCounter" && !asked.includes(x.pending.counterKind!)) || (x.stack.length === 0 && !x.pending));
  }
  expect(asked.sort()).toEqual(["+1/+1", "charge"]);
  expect(st.objects[giant]!.counters["+1/+1"]).toBe(2);
  expect(st.objects[giant]!.counters.charge).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
