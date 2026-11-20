// Lane B round B279 in the browser: Emblazoned Golem (kick it: its X picker goes up to the number of colors your lands
// make, one mana of each color, and it enters with that many +1/+1 counters) and Alaundo the Seer (tap it: you draw, exile
// Lightning Bolt from your hand with a time counter, and the Hill Giant it exiled earlier loses its last time counter, so
// you cast it free, with haste).
import { expect, test } from "@playwright/test";
import { characteristics, invalidateCharacteristics } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Emblazoned Golem: kicked with X = 5, one mana of each color, it enters with five +1/+1 counters", async ({ page }) => {
  const s = scene({ hand: ["Emblazoned Golem"], board: LANDS });
  const golem = one(s, "Emblazoned Golem");
  await open(page, s);
  await card(page, "Emblazoned Golem", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  await page.getByRole("button", { name: "Kick it" }).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("Emblazoned Golem (kicked)");
  await expect(x).toContainText("choose X (up to 5 with your mana)");
  await x.getByLabel("X", { exact: true }).fill("5");
  await x.getByRole("button", { name: "X = 5" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[golem]!.zone === "battlefield");
  expect(after.objects[golem]!.counters["+1/+1"]).toBe(5);
  // Seven lands tapped: the {2} and one of each basic land type for X.
  const tapped = after.battlefield.filter((id) => after.objects[id]!.tapped).map((id) => after.cards[after.objects[id]!.cardId]!.name);
  expect(tapped).toHaveLength(7);
  for (const land of ["Plains", "Island", "Swamp", "Mountain", "Forest"]) expect(tapped).toContain(land);
  expect(pageErrors(page)).toEqual([]);
});

test("Emblazoned Golem: with only Mountains and Islands, X goes up to 2", async ({ page }) => {
  const s = scene({ hand: ["Emblazoned Golem"], board: ["Mountain", "Mountain", "Mountain", "Mountain", "Island", "Island"] });
  const golem = one(s, "Emblazoned Golem");
  await open(page, s);
  await card(page, "Emblazoned Golem", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  await page.getByRole("button", { name: "Kick it" }).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("choose X (up to 2 with your mana)");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[golem]!.zone === "battlefield");
  expect(after.objects[golem]!.counters["+1/+1"]).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Alaundo the Seer: exile Lightning Bolt with a time counter; the Hill Giant it exiled before comes back free, with haste", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt"], board: [...LANDS, "Alaundo the Seer"], exile: ["Hill Giant"] });
  const [alaundo, bolt, giant] = [one(s, "Alaundo the Seer"), one(s, "Lightning Bolt"), one(s, "Hill Giant")];
  // Exiled by Alaundo on an earlier turn: one time counter left on it.
  const g = s.objects[giant]!;
  g.counters.time = 1;
  g.alaundoCast = g.zoneChanges ?? 0;
  invalidateCharacteristics(s);
  await open(page, s);
  await page.locator(`[data-obj="${alaundo}"]`).first().click();
  await menu(page).getByRole("button", { name: /Draw a card, then exile a card from your hand/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "discard" && st.pending.player === 0);
  await page.locator(`[data-obj="${bolt}"]`).first().click();
  await controls(page).getByRole("button", { name: "Exile", exact: true }).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  expect(asked.objects[bolt]!.zone).toBe("exile");
  expect(asked.objects[bolt]!.counters.time).toBe(1);
  expect(asked.objects[giant]!.counters.time ?? 0).toBe(0);
  const bar = controls(page);
  await expect(bar).toContainText("Hill Giant: the last time counter is gone. Cast it without paying its mana cost? It gains haste until end of turn. If you don't, it stays in exile.");
  await bar.getByRole("button", { name: "Cast it", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield");
  invalidateCharacteristics(after);
  expect(characteristics(after, after.objects[giant]!).keywords).toContain("Haste");
  expect(after.objects[bolt]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});
