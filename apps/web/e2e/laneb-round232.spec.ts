// Lane B round B232 in the browser: Butcher Orgg's division of its combat damage among Ana and her creatures (− and +
// for each, Ana among them, or "Assign it the usual way"), and Heroism's question to pay {2}{R} for your attacking red
// creature.
import { expect, test } from "@playwright/test";
import { applyAction, planActivate, waitingOn, type GameState } from "@cc/engine";
import { one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

/** You attack Ana with `attacker`; Ana doesn't block; then play goes on until your Orgg's damage question. */
function orggAttacks(s0: GameState, attacker: string): GameState {
  let s = playUntil(s0, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [{ attacker, defender: 1 }] });
  s = playUntil(s, (st) => st.pending?.kind === "declareBlockers" && st.pending.player === 1);
  s = applyAction(s, { type: "declareBlockers", player: 1, blocks: [] });
  return playUntil(s, (st) => st.pending?.kind === "divideDamage" && st.pending.player === 0);
}

test("Butcher Orgg: divide its 6 combat damage, 2 to Ana's Grizzly Bears, 3 to her Hill Giant and 1 to Ana", async ({ page }) => {
  const s0 = scene({ board: ["Butcher Orgg"] }, [{ board: ["Grizzly Bears", "Hill Giant"] }]);
  const [orgg, bears, giant] = [one(s0, "Butcher Orgg"), one(s0, "Grizzly Bears"), one(s0, "Hill Giant")];
  const s = orggAttacks(s0, orgg);
  expect(s.pending).toMatchObject({ kind: "divideDamage", combat: true, total: 6, toPlayer: 1 });
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Butcher Orgg: divide Butcher Orgg's 6 combat damage among any number of Ana and these creatures Ana controls (6 left)");
  const done = bar.getByRole("button", { name: "Done" });
  await expect(done).toBeDisabled();
  const plus = (key: string) => page.locator(`[data-divide-damage="${key}"]`).getByRole("button", { name: "+" });
  for (let i = 0; i < 2; i++) await plus(bears).click();
  for (let i = 0; i < 3; i++) await plus(giant).click();
  await plus("p1").click();
  await expect(bar).toContainText("(0 left)");
  await done.click();
  const after = await resolveUntil(page, (st) => st.objects[bears]!.zone === "graveyard" && st.objects[giant]!.zone === "graveyard");
  expect(after.players[1]!.life).toBe(39);
  expect(after.log.some((l) => /divides Butcher Orgg's 6 combat damage: 2 to Grizzly Bears, 3 to Hill Giant, 1 to Ana/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Butcher Orgg: assign its combat damage the usual way, all 6 to Ana", async ({ page }) => {
  const s0 = scene({ board: ["Butcher Orgg"] }, [{ board: ["Grizzly Bears"] }]);
  const [orgg, bears] = [one(s0, "Butcher Orgg"), one(s0, "Grizzly Bears")];
  const s = orggAttacks(s0, orgg);
  await open(page, s);
  const bar = controls(page);
  await bar.getByRole("button", { name: "Assign it the usual way" }).click();
  const after = await resolveUntil(page, (st) => st.players[1]!.life === 34);
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(after.log.some((l) => l.text === "You has Butcher Orgg assign its combat damage the usual way.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Heroism: Ana sacrifices a white creature as your Hill Giant attacks; you pay {2}{R}, so it deals its damage", async ({ page }) => {
  const s0 = scene({ board: ["Hill Giant", "Mountain", "Mountain", "Mountain"] }, [{ board: ["Heroism", "Savannah Lions"] }]);
  const [giant, hero, lions] = [one(s0, "Hill Giant"), one(s0, "Heroism"), one(s0, "Savannah Lions")];
  let s = playUntil(s0, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [{ attacker: giant, defender: 1 }] });
  s = playUntil(s, (st) => st.pending?.kind === "declareBlockers" && st.pending.player === 1);
  s = applyAction(s, { type: "declareBlockers", player: 1, blocks: [] });
  s = playUntil(s, (st) => st.step === "declareBlockers" && !st.pending && waitingOn(st) === 1);
  for (const a of planActivate(s, 1, hero, 0, undefined, undefined, undefined, undefined, { sacrifice: [lions] })!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.pending?.kind === "payUnless" && st.pending.player === 0);
  expect(s.objects[lions]!.zone).toBe("graveyard");
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Heroism: pay");
  await expect(bar).toContainText("or all combat damage Hill Giant would deal this turn is prevented.");
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.players[1]!.life === 37);
  expect(after.log.some((l) => l.text === "You pays {2}{R} for Hill Giant.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
