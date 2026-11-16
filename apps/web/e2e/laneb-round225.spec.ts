// Lane B round B225 in the browser: Heart of Bogardan's cumulative upkeep left unpaid and its target, Lesser Werewolf's
// ability on the creature blocking it, Goblin Flotilla's "pay {R}" question at the beginning of combat, and Acidic
// Dagger's target before combat.
import { expect, test } from "@playwright/test";
import { applyAction, waitingOn, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { clickPlayer, controls, menu, resolveUntil } from "./ui";

/** In the engine: you attack Ana with `attacker`, and Ana blocks it with `blocker`; then it's the declare blockers step with you to act. */
function blocked(s0: GameState, attacker: string, blocker: string): GameState {
  let s = playUntil(s0, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [{ attacker, defender: 1 }] });
  s = playUntil(s, (st) => st.pending?.kind === "declareBlockers" && st.pending.player === 1);
  s = applyAction(s, { type: "declareBlockers", player: 1, blocks: [{ blocker, attacker }] });
  return playUntil(s, (st) => st.step === "declareBlockers" && !st.pending && st.stack.length === 0 && waitingOn(st) === 0);
}

test("Heart of Bogardan: you don't pay its upkeep, and its trigger deals 2 to Ana and to her Hill Giant", async ({ page }) => {
  let s = scene({ board: [...LANDS, "Heart of Bogardan"] }, [{ board: ["Hill Giant"] }]);
  const heart = one(s, "Heart of Bogardan");
  const giant = idsOf(s, "Hill Giant", "battlefield", 1)[0]!;
  // One age counter already: two after this upkeep's, so X is 2 * 2 - 2 = 2.
  s.objects[heart]!.counters.age = 1;
  s = playUntil(s, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const life = s.players[1]!.life;
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("to keep Heart of Bogardan (cumulative upkeep)");
  await bar.getByRole("button", { name: "Don't pay" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await expect(page.locator(".targeting")).toContainText("target player or planeswalker");
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.players[1]!.life < life);
  expect(after.players[1]!.life).toBe(life - 2);
  expect(after.objects[giant]!.damage).toBe(2);
  expect(after.objects[heart]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Lesser Werewolf: blocked by Ana's Hill Giant, it gets -1/-0 and puts a -0/-1 counter on the Giant", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Lesser Werewolf"] }, [{ board: ["Hill Giant"] }]);
  const wolf = one(s0, "Lesser Werewolf");
  const giant = idsOf(s0, "Hill Giant", "battlefield", 1)[0]!;
  const s = blocked(s0, wolf, giant);
  await open(page, s);
  await page.locator(`[data-obj="${wolf}"]`).first().click();
  await menu(page).getByRole("button", { name: /If Lesser Werewolf's power is 1 or more/ }).click();
  await expect(page.locator(".targeting")).toContainText("Lesser Werewolf: {B}: If Lesser Werewolf's power is 1 or more, it gets -1/-0 until end of turn and put a -0/-1 counter on target creature blocking or blocked by Lesser Werewolf. Activate only during the declare blockers step.: choose target creature blocking or blocked by Lesser Werewolf");
  await page.locator(`[data-obj="${giant}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.objects[giant]!.counters["-0/-1"] ?? 0) === 1);
  expect(after.step).toBe("declareBlockers");
  expect(after.effects.some((e) => e.affected?.includes(wolf))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Goblin Flotilla: at the beginning of combat you don't pay {R}, so creatures in combat with it gain first strike", async ({ page }) => {
  let s = scene({ board: [...LANDS, "Goblin Flotilla"] });
  const flotilla = one(s, "Goblin Flotilla");
  s = playUntil(s, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0 && st.step === "beginCombat");
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Goblin Flotilla: Pay R so that Goblin Flotilla doesn't give first strike this combat?");
  await bar.getByRole("button", { name: "Don't pay" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && (st.floatingTriggers ?? []).some((t) => t.sourceId === flotilla));
  expect((after.floatingTriggers ?? []).find((t) => t.sourceId === flotilla)?.until).toBe("endOfCombat");
  expect(pageErrors(page)).toEqual([]);
});

test("Acidic Dagger: before combat it targets your Hill Giant, whose combat damage this turn destroys non-Wall creatures", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Acidic Dagger", "Hill Giant"] });
  const [dagger, giant] = [one(s, "Acidic Dagger"), one(s, "Hill Giant")];
  await open(page, s);
  await page.locator(`[data-obj="${dagger}"]`).first().click();
  await menu(page).getByRole("button", { name: /Whenever target creature deals combat damage to a non-Wall creature this turn/ }).click();
  await expect(page.locator(".targeting")).toContainText("target creature");
  await page.locator(`[data-obj="${giant}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.floatingTriggers ?? []).some((t) => t.sourceId === dagger));
  expect(after.objects[dagger]!.tapped).toBe(true);
  expect((after.floatingTriggers ?? []).find((t) => t.sourceId === dagger)?.about?.id).toBe(giant);
  expect(after.delayed?.some((d) => d.when === "leaves")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
