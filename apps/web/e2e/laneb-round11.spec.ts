// Lane B round 11's prompt: See Beyond's "shuffle a card from your hand into your library", picked from the hand with
// a "Shuffle in" button.
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

test("See Beyond: draw two, then click a card in hand to shuffle into your library", async ({ page }) => {
  const s0 = scene({ board: LANDS, hand: ["See Beyond", "Opt"] });
  const opt = one(s0, "Opt");
  const s = passToPrompt(run(s0, planCast(s0, 0, one(s0, "See Beyond"), [])));
  expect(s.pending).toMatchObject({ kind: "handToTop", player: 0, count: 1, shuffle: true });
  const library = s.players[0]!.library.length;
  await open(page, s);
  await expect(controls(page)).toContainText("See Beyond: click 1 card to shuffle into your library.");
  const shuffle = controls(page).getByRole("button", { name: "Shuffle in" });
  await expect(shuffle).toBeDisabled();
  await page.locator(`[data-obj="${opt}"]`).click();
  await shuffle.click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0);
  expect(after.objects[opt]!.zone).toBe("library");
  expect(after.players[0]!.hand.length).toBe(2);
  expect(after.players[0]!.library.length).toBe(library + 1);
  expect(pageErrors(page)).toEqual([]);
});
