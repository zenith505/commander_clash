// Round 83's faces: a Room's locked door unlocked from its menu, a prepared creature's prepare spell cast from exile,
// and a Transformers card cast converted for its More Than Meets the Eye cost.
import { expect, test } from "@playwright/test";
import { characteristics } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, menu, modal, resolveUntil, seat } from "./ui";

test("Room: unlock Locker Room from the menu for {4}{U}; then only Bottomless Pool is left to unlock", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Bottomless Pool // Locker Room"] });
  const room = one(s, "Bottomless Pool // Locker Room");
  expect(s.objects[room]!.unlocked).toEqual([]);
  await open(page, s);
  await card(page, "Bottomless Pool // Locker Room", s).click();
  await expect(menu(page).getByRole("button", { name: /^Unlock Bottomless Pool/ })).toBeEnabled();
  await menu(page).getByRole("button", { name: /^Unlock Locker Room/ }).click();
  const now = await resolveUntil(page, (st) => st.objects[room]!.unlocked?.length === 1);
  expect(now.objects[room]!.unlocked).toEqual([1]);
  expect(characteristics(now, now.objects[room]!).name).toBe("Locker Room");
  expect(now.battlefield.filter((id) => now.objects[id]!.tapped)).toHaveLength(5);
  await card(page, "Bottomless Pool // Locker Room", s).click();
  await expect(menu(page).getByRole("button", { name: /^Unlock Locker Room/ })).toHaveCount(0);
  await expect(menu(page).getByRole("button", { name: /^Unlock Bottomless Pool/ })).toBeEnabled();
  expect(pageErrors(page)).toEqual([]);
});

test("Prepare: Adventurous Eater enters prepared; cast Have a Bite's copy from exile, and the chip goes", async ({ page }) => {
  const s = scene({ hand: ["Adventurous Eater // Have a Bite"], board: [...LANDS] });
  const eater = one(s, "Adventurous Eater");
  await open(page, s);
  await card(page, "Adventurous Eater", s).click();
  if (await menu(page).isVisible()) await menu(page).getByRole("button", { name: /^Cast it/ }).click();
  let now = await resolveUntil(page, (st) => st.objects[eater]!.zone === "battlefield" && st.stack.length === 0 && st.triggerQueue.length === 0);
  expect(now.objects[eater]!.prepared).toBeTruthy();
  await expect(page.locator(`[data-obj="${eater}"]`)).toContainText("Prepared");
  // The copy is in your exile, and you may cast it (CR 722.3c).
  await seat(page, 0).locator(".zone", { hasText: "Exile" }).click();
  await modal(page).locator(".card.playable").click();
  if (await menu(page).isVisible()) await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  await page.locator(`[data-obj="${eater}"]`).click();
  now = await resolveUntil(page, (st) => st.stack.length === 0 && (st.objects[eater]!.counters?.["+1/+1"] ?? 0) === 1);
  expect(now.objects[eater]!.prepared).toBeFalsy();
  expect(now.players[0]!.life).toBe(41);
  await expect(page.locator(`[data-obj="${eater}"]`)).not.toContainText("Prepared");
  expect(pageErrors(page)).toEqual([]);
});

test("More Than Meets the Eye: Goldbug cast converted for {W}{U} enters as Goldbug, Scrappy Scout", async ({ page }) => {
  const s = scene({ hand: ["Goldbug, Humanity's Ally // Goldbug, Scrappy Scout"], board: [...LANDS] });
  const goldbug = one(s, "Goldbug, Humanity's Ally");
  await open(page, s);
  await card(page, "Goldbug, Humanity's Ally", s).click();
  await menu(page).getByRole("button", { name: /^More Than Meets the Eye/ }).click();
  const now = await resolveUntil(page, (st) => st.objects[goldbug]!.zone === "battlefield" && st.stack.length === 0);
  expect(characteristics(now, now.objects[goldbug]!).name).toBe("Goldbug, Scrappy Scout");
  expect(now.battlefield.filter((id) => now.objects[id]!.tapped)).toHaveLength(2);
  expect((await state(page)).log.some((l) => /converted, for its More Than Meets the Eye cost/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
