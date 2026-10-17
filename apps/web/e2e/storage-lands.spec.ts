// Storage lands: the land's menu has a button for each number of storage counters to remove (CR 107.3a), and for two
// colors each split of that mana. Removing none still taps Bottomless Vault, so it can start storing counters.
import { expect, test } from "@playwright/test";
import { idsOf, one, open, pageErrors, scene, state } from "./scene";
import { card, menu } from "./ui";

test("Bottomless Vault: remove as many storage counters as you like for {B} each", async ({ page }) => {
  const s = scene({ board: ["Bottomless Vault"] });
  const vault = one(s, "Bottomless Vault");
  s.objects[vault]!.counters.storage = 2;
  await open(page, s);
  await card(page, "Bottomless Vault", s).click();
  await expect(menu(page).locator("button", { hasText: "Remove no storage counters from it: add no mana" })).toHaveCount(1);
  await expect(menu(page).locator("button", { hasText: "Remove a storage counter from it" })).toHaveCount(1);
  await menu(page).locator("button", { hasText: "Remove 2 storage counters from it" }).click();
  await expect.poll(async () => (await state(page)).players[0]!.manaPool.B).toBe(2);
  const after = await state(page);
  expect(after.objects[vault]!.counters.storage).toBe(0);
  expect(after.objects[vault]!.tapped).toBe(true);
  expect(after.stack).toHaveLength(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Calciform Pools: pick how the X mana splits between {W} and {U}; another land pays the {1}", async ({ page }) => {
  const s = scene({ board: ["Calciform Pools", "Mountain"] });
  const [pools, mountain] = [one(s, "Calciform Pools"), idsOf(s, "Mountain", "battlefield", 0)[0]!];
  s.objects[pools]!.counters.storage = 2;
  await open(page, s);
  await card(page, "Calciform Pools", s).click();
  // One counter: {W} or {U}; two: {W}{W}, {W}{U} or {U}{U}.
  await expect(menu(page).locator("button", { hasText: "Remove a storage counter from it" })).toHaveCount(2);
  const two = menu(page).locator("button", { hasText: "Remove 2 storage counters from it" });
  await expect(two).toHaveCount(3);
  await two.filter({ has: page.locator("[title='{W}']") }).filter({ has: page.locator("[title='{U}']") }).click();
  await expect.poll(async () => (await state(page)).players[0]!.manaPool.W).toBe(1);
  const after = await state(page);
  expect(after.players[0]!.manaPool).toMatchObject({ W: 1, U: 1, R: 0 });
  expect(after.objects[pools]!.counters.storage).toBe(0);
  expect(after.objects[pools]!.tapped).toBe(false);
  expect(after.objects[mountain]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
