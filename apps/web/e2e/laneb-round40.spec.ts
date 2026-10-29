// Lane B round 40 in the browser: "Draw three cards, then discard one of them" (Soldevi Sage): only one of the cards
// just drawn can be picked, not a card that was in hand before.
import { expect, test } from "@playwright/test";
import { applyAction, planActivate, waitingOn, type Action, type GameState } from "@cc/engine";
import { idsOf, one, open, pageErrors, scene } from "./scene";
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

test("Soldevi Sage: draw three, then discard one of those three; a card that was already in hand can't be picked", async ({ page }) => {
  const s0 = scene({ hand: ["Shock"], board: ["Soldevi Sage", "Island", "Swamp", "Mountain"], library: ["Grizzly Bears", "Hill Giant", "Opt"] });
  const [sage, shock, bears, giant, opt] = ["Soldevi Sage", "Shock", "Grizzly Bears", "Hill Giant", "Opt"].map((n) => one(s0, n)) as [string, string, string, string, string];
  const lands = [...idsOf(s0, "Island", "battlefield", 0), ...idsOf(s0, "Swamp", "battlefield", 0)];
  const s = passToPrompt(run(s0, planActivate(s0, 0, sage, 0, [], undefined, undefined, undefined, { sacrifice: lands })));
  expect(s.pending).toMatchObject({ kind: "discard", player: 0, count: 1 });
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("of the ones you just drew");
  await expect(bar).toContainText("Hill Giant");
  const button = bar.getByRole("button", { name: "Discard" });
  await page.locator(`[data-obj="${shock}"]`).first().click();
  await expect(button).toBeDisabled();
  await page.locator(`[data-obj="${shock}"]`).first().click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await expect(button).toBeEnabled();
  await button.click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && x.objects[giant]!.zone === "graveyard");
  expect([shock, bears, giant, opt].map((id) => after.objects[id]!.zone)).toEqual(["hand", "hand", "graveyard", "hand"]);
  expect(pageErrors(page)).toEqual([]);
});
