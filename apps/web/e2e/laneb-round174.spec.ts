// Lane B round B174 in the browser: Liliana, the Necromancer's −7 destroys a target, then the graveyard picker takes up
// to two creature cards from any graveyards, the destroyed one among them; Predatory Focus asks whether your creatures
// assign their combat damage this turn as though they weren't blocked.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Liliana, the Necromancer −7: destroy Ana's Hill Giant, then put it and Ben's Grizzly Bears onto the battlefield under your control", async ({ page }) => {
  const s = scene({ board: ["Liliana, the Necromancer"] }, [{ board: ["Hill Giant"] }, { yard: ["Grizzly Bears", "Lightning Bolt"] }]);
  const [liliana, giant, bears, bolt] = [one(s, "Liliana, the Necromancer"), one(s, "Hill Giant"), one(s, "Grizzly Bears"), one(s, "Lightning Bolt")];
  s.objects[liliana]!.counters.loyalty = 7;
  await open(page, s);
  await page.locator(`[data-obj="${liliana}"]`).click();
  await menu(page).locator("button", { hasText: "Destroy up to two target creatures" }).click();
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("optional");
  await page.locator(`[data-obj="${giant}"]`).click();
  await bar.getByRole("button", { name: "Done" }).click();
  const pick = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const offered = (pick.pending as { cards: string[]; max: number }).cards;
  expect(offered).toEqual(expect.arrayContaining([giant, bears]));
  expect(offered).not.toContain(bolt);
  expect((pick.pending as { max: number }).max).toBe(2);
  await expect(modal(page)).toContainText("up to 2 creature cards");
  await modal(page).locator(`[data-pick="${giant}"]`).click();
  await modal(page).locator(`[data-pick="${bears}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield" && st.objects[bears]!.zone === "battlefield");
  expect([after.objects[giant]!.controller, after.objects[bears]!.controller]).toEqual([0, 0]);
  expect(after.objects[liliana]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Predatory Focus: Yes makes your creatures assign their combat damage this turn as though they weren't blocked", async ({ page }) => {
  const s = scene({ hand: ["Predatory Focus"], board: LANDS });
  await open(page, s);
  await card(page, "Predatory Focus", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("as though they weren't blocked");
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[one(s, "Predatory Focus")]!.zone === "graveyard");
  expect(after.turnLog?.unblockedDamage).toEqual([0]);
  expect(pageErrors(page)).toEqual([]);
});
