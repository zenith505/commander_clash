// Lane B round B107 in the browser: Grimdancer's choice of two different counters out of three as it enters (CR 614.1c,
// 614.12), and Credit Voucher's pick of any number of cards from your hand to shuffle into your library.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Grimdancer: choose deathtouch and lifelink counters out of menace, deathtouch and lifelink as it enters", async ({ page }) => {
  const s = scene({ hand: ["Grimdancer"], board: LANDS });
  const grim = one(s, "Grimdancer");
  await open(page, s);
  await card(page, "Grimdancer", s).click();
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "Menace and deathtouch counters" })).toHaveCount(1);
  await expect(bar.getByRole("button", { name: "Menace and lifelink counters" })).toHaveCount(1);
  await bar.getByRole("button", { name: "Deathtouch and lifelink counters" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[grim]!.zone === "battlefield");
  expect(after.objects[grim]!.counters).toEqual({ deathtouch: 1, lifelink: 1 });
  expect(pageErrors(page)).toEqual([]);
});

test("Credit Voucher: shuffle two cards from your hand into your library, then draw two", async ({ page }) => {
  const s = scene({ hand: ["Shock", "Opt", "Divination"], board: [...LANDS, "Credit Voucher"] });
  const [voucher, shock, opt, div] = [one(s, "Credit Voucher"), one(s, "Shock"), one(s, "Opt"), one(s, "Divination")];
  await open(page, s);
  await card(page, "Credit Voucher", s).click();
  if (await menu(page).count()) await menu(page).locator("button", { hasText: /Shuffle any number/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick).toContainText("Credit Voucher: shuffle any number of cards from your hand into your library");
  await expect(pick.getByRole("button", { name: "Keep them all" })).toBeVisible();
  await pick.locator(`[data-pick="${shock}"]`).click();
  await pick.locator(`[data-pick="${opt}"]`).click();
  await pick.getByRole("button", { name: "Shuffle in" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[voucher]!.zone === "graveyard");
  expect(after.players[0]!.hand.length).toBe(3);
  expect(after.objects[div]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});
