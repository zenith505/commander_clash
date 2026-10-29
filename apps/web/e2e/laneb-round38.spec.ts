// Lane B round 38 in the browser: Dragon's Disciple's "As this creature enters, you may reveal a Dragon card from your
// hand. If you do or if you control a Dragon, this creature enters with a +1/+1 counter on it."
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

test("Dragon's Disciple: reveal the Dragon card in your hand, and it enters with a +1/+1 counter", async ({ page }) => {
  const s0 = scene({ board: LANDS, hand: ["Dragon's Disciple", "Shivan Dragon", "Grizzly Bears"] });
  const [disciple, dragon, bears] = [one(s0, "Dragon's Disciple"), one(s0, "Shivan Dragon"), one(s0, "Grizzly Bears")];
  const s = passToPrompt(run(s0, planCast(s0, 0, disciple)));
  expect(s.pending).toMatchObject({ kind: "pickPermanents", player: 0, action: "reveal", count: 1 });
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("you may reveal a Dragon card from your hand (a +1/+1 counter)");
  await expect(page.locator(`[data-obj="${bears}"].targetable`)).toHaveCount(0);
  await page.locator(`[data-obj="${dragon}"]`).first().click();
  await bar.getByRole("button", { name: "Reveal 1" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[disciple]!.zone === "battlefield");
  expect(after.objects[disciple]!.counters["+1/+1"]).toBe(1);
  expect(after.objects[dragon]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Dragon's Disciple: Reveal none, and it enters without a counter", async ({ page }) => {
  const s0 = scene({ board: LANDS, hand: ["Dragon's Disciple", "Shivan Dragon"] });
  const disciple = one(s0, "Dragon's Disciple");
  const s = passToPrompt(run(s0, planCast(s0, 0, disciple)));
  await open(page, s);
  const bar = controls(page);
  await bar.getByRole("button", { name: "Reveal none" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[disciple]!.zone === "battlefield");
  expect(after.objects[disciple]!.counters["+1/+1"] ?? 0).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});
