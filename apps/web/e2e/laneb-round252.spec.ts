// Lane B round B252 in the browser: Elemental Resonance's mana for a hybrid mana cost, which colors chosen as its trigger
// resolves.
import { expect, test } from "@playwright/test";
import { applyAction, invalidateCharacteristics, waitingOn, type GameState } from "@cc/engine";
import { one, open, pageErrors, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

/** Everyone passes until there's a prompt. */
const passToPrompt = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending; i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

test("Elemental Resonance on Swans of Bryn Argoll: choose {W}{U}{C}{C} for its {2}{W/U}{W/U}", async ({ page }) => {
  const s0 = scene({ board: ["Elemental Resonance", "Swans of Bryn Argoll"] }, [], { step: "draw" });
  const [er, swans] = [one(s0, "Elemental Resonance"), one(s0, "Swans of Bryn Argoll")];
  s0.objects[er]!.attachedTo = swans;
  invalidateCharacteristics(s0);
  // As the first main phase begins, its trigger goes on the stack; it asks for the hybrid mana as it resolves.
  const s = passToPrompt(s0);
  expect(s.step).toBe("main1");
  expect(s.pending).toMatchObject({ kind: "chooseOption", what: "either", player: 0 });
  await open(page, s);
  const bar = controls(page);
  for (const label of ["Add {W}{W}{C}{C}", "Add {W}{U}{C}{C}", "Add {U}{U}{C}{C}"]) await expect(bar.getByRole("button", { name: label })).toBeVisible();
  await bar.getByRole("button", { name: "Add {W}{U}{C}{C}" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  const pool = after.players[0]!.manaPool;
  expect([pool.W, pool.U, pool.C, pool.B ?? 0, pool.R ?? 0, pool.G ?? 0]).toEqual([1, 1, 2, 0, 0, 0]);
  expect(pageErrors(page)).toEqual([]);
});
