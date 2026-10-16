// PR #42: a Role token created attached to the target (Monstrous Rage), the "Equip legendary creature {3}" menu entry
// (Blackblade Reforged) and an equip cost that sacrifices a creature (Demonmail Hauberk).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, menu, resolveUntil } from "./ui";

test("Monstrous Rage: a Monster Role token appears attached to the target creature", async ({ page }) => {
  const s = scene({ hand: ["Monstrous Rage"], board: ["Mountain", "Grizzly Bears"] });
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Monstrous Rage", s).click();
  await page.locator(`[data-obj="${bears}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.battlefield.some((id) => st.objects[id]!.attachedTo === bears));
  const role = after.battlefield.map((id) => after.objects[id]!).find((o) => o.attachedTo === bears)!;
  expect(after.cards[role.cardId]!.name).toBe("Monster Token");
  await expect(page.locator(`[data-obj="${role.id}"]`)).toBeVisible();
  await expect(page.locator(`[data-obj="${bears}"]`)).toContainText("5/3");
  expect(pageErrors(page)).toEqual([]);
});

test("Blackblade Reforged: its menu has both equip abilities; the {3} one targets only a legendary creature", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Blackblade Reforged", "Grizzly Bears", "Kodama of the West Tree"] });
  const [blade, bears, kodama] = [one(s, "Blackblade Reforged"), one(s, "Grizzly Bears"), one(s, "Kodama of the West Tree")];
  await open(page, s);
  await card(page, "Blackblade Reforged", s).click();
  await expect(menu(page).locator("button", { hasText: "Equip legendary creature" })).toHaveCount(1);
  await expect(menu(page).locator("button", { hasText: /^Equip(?! legendary)/ })).toHaveCount(1);
  await menu(page).locator("button", { hasText: "Equip legendary creature" }).click();
  // The bears aren't legendary: clicking them doesn't target them.
  await page.locator(`[data-obj="${bears}"]`).click();
  expect((await state(page)).stack).toHaveLength(0);
  await page.locator(`[data-obj="${kodama}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[blade]!.attachedTo === kodama);
  expect(after.objects[blade]!.attachedTo).toBe(kodama);
  expect(pageErrors(page)).toEqual([]);
});

test("Demonmail Hauberk: equip by sacrificing a creature, clicked on the battlefield", async ({ page }) => {
  const s = scene({ board: ["Demonmail Hauberk", "Grizzly Bears", "Hill Giant"] });
  const [hauberk, bears, giant] = [one(s, "Demonmail Hauberk"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Demonmail Hauberk", s).click();
  await menu(page).locator("button", { hasText: "Equip" }).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  const bar = page.locator(".targeting", { hasText: "sacrifice a creature (click it)" });
  await expect(bar.getByRole("button", { name: "Sacrifice and activate" })).toBeDisabled();
  await page.locator(`[data-obj="${bears}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice and activate" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[hauberk]!.attachedTo === giant);
  expect(after.objects[bears]!.zone).toBe("graveyard");
  await expect(page.locator(`[data-obj="${giant}"]`)).toContainText("7/5");
  expect(pageErrors(page)).toEqual([]);
});
