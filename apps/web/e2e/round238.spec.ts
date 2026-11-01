// Round 238 in the browser: Indominus Rex, Alpha's "As this creature enters, discard any number of creature cards. It
// enters with a flying counter on it if a card discarded this way has flying. The same is true for ..." (CR 614.12).
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

test("Indominus Rex: discard two creature cards as it enters, and it gets a counter for each of their keywords", async ({ page }) => {
  const s0 = scene({ board: LANDS, hand: ["Indominus Rex, Alpha", "Serra Angel", "Typhoid Rats", "Grizzly Bears"] });
  const [rex, angel, rats, bears] = [one(s0, "Indominus Rex, Alpha"), one(s0, "Serra Angel"), one(s0, "Typhoid Rats"), one(s0, "Grizzly Bears")];
  const s = passToPrompt(run(s0, planCast(s0, 0, rex)));
  expect(s.pending).toMatchObject({ kind: "pickPermanents", player: 0, action: "discard" });
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("discard any number of creature cards as it enters");
  await page.locator(`[data-obj="${angel}"]`).first().click();
  await page.locator(`[data-obj="${rats}"]`).first().click();
  await bar.getByRole("button", { name: "Discard 2" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[rex]!.zone === "battlefield");
  expect(after.objects[rex]!.counters).toMatchObject({ flying: 1, vigilance: 1, deathtouch: 1 });
  expect(after.objects[angel]!.zone).toBe("graveyard");
  expect(after.objects[rats]!.zone).toBe("graveyard");
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Indominus Rex: Discard none, and it enters without counters", async ({ page }) => {
  const s0 = scene({ board: LANDS, hand: ["Indominus Rex, Alpha", "Serra Angel"] });
  const [rex, angel] = [one(s0, "Indominus Rex, Alpha"), one(s0, "Serra Angel")];
  const s = passToPrompt(run(s0, planCast(s0, 0, rex)));
  await open(page, s);
  const bar = controls(page);
  await bar.getByRole("button", { name: "Discard none" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[rex]!.zone === "battlefield");
  expect(after.objects[rex]!.counters.flying ?? 0).toBe(0);
  expect(after.objects[angel]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});
