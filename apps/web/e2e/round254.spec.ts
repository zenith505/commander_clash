// Round 254: Liesa, Shroud of Dusk as your commander (the command zone shows its tax in life, and casting it pays that
// life rather than mana), and Gemcutter Buccaneer's Treasures (the Treasure's menu has "Equip Pirate {1}", which only a
// Pirate can be aimed at).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, menu, resolveUntil, seat } from "./ui";

test("Liesa, Shroud of Dusk: the commander tax reads 2 life, and casting her from the command zone pays it in life", async ({ page }) => {
  const s = scene({ commander: "Liesa, Shroud of Dusk", board: LANDS });
  const liesa = one(s, "Liesa, Shroud of Dusk");
  s.players[0]!.commanderCasts[liesa] = 1;
  await open(page, s);
  await expect(seat(page, 0).locator(".zone", { hasText: "Command" })).toContainText("Tax 2 life");
  await card(page, "Liesa, Shroud of Dusk", s).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[liesa]!.zone === "battlefield");
  expect(after.players[0]!.life).toBe(38);
  expect(after.players[0]!.commanderCasts[liesa]).toBe(2);
  // {2}{W}{W}{B} and nothing more: five lands tapped.
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped && after.objects[id]!.controller === 0)).toHaveLength(5);
  expect(pageErrors(page)).toEqual([]);
});

test("Gemcutter Buccaneer: a Treasure's menu has Equip Pirate {1}; it equips only the Pirate, which gets +2/+0", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Gemcutter Buccaneer", "Grizzly Bears"], tokens: ["Treasure"] });
  const [gem, bears] = [one(s, "Gemcutter Buccaneer"), one(s, "Grizzly Bears")];
  const treasure = s.battlefield.find((id) => /Treasure/.test(s.cards[s.objects[id]!.cardId]!.name))!;
  await open(page, s);
  await page.locator(`[data-obj="${treasure}"]`).first().click();
  await expect(menu(page).locator("button", { hasText: "Equip Pirate" })).toHaveCount(1);
  await menu(page).locator("button", { hasText: "Equip Pirate" }).click();
  // The Bears aren't a Pirate: clicking them doesn't target them.
  await page.locator(`[data-obj="${bears}"]`).click();
  expect((await state(page)).stack).toHaveLength(0);
  await page.locator(`[data-obj="${gem}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[treasure]!.attachedTo === gem);
  expect(after.objects[treasure]!.attachedTo).toBe(gem);
  await expect(page.locator(`[data-obj="${gem}"]`)).toContainText("3/3");
  expect(pageErrors(page)).toEqual([]);
});
