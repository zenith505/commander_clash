// Lane B round B115 in the browser: Hipparion's cost to block a creature with power 3 or greater on the Block button
// (CR 509.1d), and no cost to block a smaller one.
import { expect, test } from "@playwright/test";
import { applyAction, type GameState } from "@cc/engine";
import { idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

test("Hipparion blocks Hill Giant only if you pay {1}: the Block button says so and taps a land", async ({ page }) => {
  let s: GameState = scene({ board: ["Hipparion", "Plains"] }, [{ board: ["Hill Giant"] }]);
  const [hip, giant] = [one(s, "Hipparion"), one(s, "Hill Giant")];
  const land = idsOf(s, "Plains", "battlefield", 0)[0]!;
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 1);
  s = applyAction(s, { type: "declareAttackers", player: 1, attacks: [{ attacker: giant, defender: 0 }] });
  s = playUntil(s, (st) => st.pending?.kind === "declareBlockers" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await page.locator(`[data-obj="${hip}"]`).first().click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await bar.getByRole("button", { name: "Block with 1 (pay {1})" }).click();
  const after = await resolveUntil(page, (st) => st.pending?.kind !== "declareBlockers" && st.objects[hip]!.blocking !== undefined);
  expect(after.objects[hip]!.blocking).toEqual([giant]);
  expect(after.objects[land]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Hipparion blocks Grizzly Bears for free", async ({ page }) => {
  let s: GameState = scene({ board: ["Hipparion", "Plains"] }, [{ board: ["Grizzly Bears"] }]);
  const [hip, bears] = [one(s, "Hipparion"), one(s, "Grizzly Bears")];
  const land = idsOf(s, "Plains", "battlefield", 0)[0]!;
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 1);
  s = applyAction(s, { type: "declareAttackers", player: 1, attacks: [{ attacker: bears, defender: 0 }] });
  s = playUntil(s, (st) => st.pending?.kind === "declareBlockers" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await page.locator(`[data-obj="${hip}"]`).first().click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await bar.getByRole("button", { name: "Block with 1", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.pending?.kind !== "declareBlockers" && st.objects[hip]!.blocking !== undefined);
  expect(after.objects[hip]!.blocking).toEqual([bears]);
  expect(after.objects[land]!.tapped).toBe(false);
  expect(pageErrors(page)).toEqual([]);
});
