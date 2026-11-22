// Lane B round B298 in the browser: Snowfall's mana pays its own cumulative upkeep. Pay taps a Snow-Covered Island taking
// Snowfall's {U}{U}; tapping an Island by hand offers "add {U}" or "add {U}{U}", the second {U} only for cumulative upkeep
// costs, so it can't help cast Divination.
import { expect, test } from "@playwright/test";
import { castProblem, planCast } from "@cc/engine";
import { idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, menu, resolveUntil } from "./ui";

const atUpkeep = (land: string) => {
  const s0 = scene({ board: ["Snowfall", land] });
  const snow = one(s0, "Snowfall");
  s0.objects[snow]!.counters.age = 1;
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  expect(s.pending).toMatchObject({ kind: "chooseMay", upkeepOf: snow, pay: { mana: "{U}{U}" } });
  // one() can return a library copy of a basic land: the one on the battlefield.
  return { s, snow, land: idsOf(s0, land, "battlefield", 0)[0]! };
};

test("Snowfall: Pay taps the Snow-Covered Island for {U} and Snowfall's {U}{U}, and Snowfall stays", async ({ page }) => {
  const { s, snow, land } = atUpkeep("Snow-Covered Island");
  await open(page, s);
  await expect(controls(page)).toContainText("Snowfall");
  const pay = controls(page).getByRole("button", { name: "Pay", exact: true });
  await expect(pay).toBeEnabled();
  await pay.click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && !!st.objects[land]!.tapped);
  expect(after.objects[snow]!.zone).toBe("battlefield");
  expect(after.objects[snow]!.counters.age).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Snowfall: tapping an Island by hand offers its extra {U}, only for cumulative upkeep, so it can't help cast Divination", async ({ page }) => {
  const s = scene({ hand: ["Divination"], board: ["Snowfall", "Island", "Swamp"] });
  const [isl, swamp] = [idsOf(s, "Island", "battlefield", 0)[0]!, idsOf(s, "Swamp", "battlefield", 0)[0]!];
  const div = idsOf(s, "Divination", "hand", 0)[0]!;
  await open(page, s);
  await page.locator(`[data-obj="${isl}"]`).first().click();
  const extra = menu(page).locator("button", { has: page.locator('[data-limited="U"]') });
  await expect(extra).toHaveCount(1);
  await expect(extra).toContainText("only to pay cumulative upkeep costs");
  await expect(menu(page).getByRole("button", { name: /add/ })).toHaveCount(2);
  await extra.click();
  const tapped = await resolveUntil(page, (st) => !!st.objects[isl]!.tapped && st.players[0]!.manaPool.U === 2);
  expect(tapped.players[0]!.manaLots?.filter((l) => l.only?.cumulativeUpkeep).reduce((n, l) => n + l.n, 0)).toBe(1);
  // {U}{U} and the Swamp's {B}: three mana, but only two of them can pay for Divination's {2}{U} (CR 106.6).
  await page.locator(`[data-obj="${swamp}"]`).first().click();
  const after = await resolveUntil(page, (st) => !!st.objects[swamp]!.tapped);
  expect(after.players[0]!.manaPool.B).toBe(1);
  expect(planCast(after, 0, div)).toBeNull();
  expect(castProblem(after, 0, div)).not.toBeNull();
  expect(pageErrors(page)).toEqual([]);
});
