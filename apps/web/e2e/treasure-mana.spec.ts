// Mana from a Treasure (CR 106.3): Security Rhox's alternative cost paid only with it, and Hired Hexblade's enters
// trigger after you sacrifice a Treasure for mana yourself.
import { expect, test } from "@playwright/test";
import { idsOf, one, open, pageErrors, scene, state } from "./scene";
import { card, menu, resolveUntil } from "./ui";

test("Security Rhox: cast it for {R}{G} with two Treasures", async ({ page }) => {
  const s = scene({ hand: ["Security Rhox"], board: ["Forest"], tokens: ["Treasure", "Treasure"] });
  const rhox = one(s, "Security Rhox");
  const forest = one(s, "Forest");
  await open(page, s);
  await card(page, "Security Rhox", s).click();
  // Its mana cost can't be paid; the Treasures can pay {R}{G}.
  await expect(menu(page).getByRole("button", { name: /^Cast it 2 R G$/ })).toBeDisabled();
  const alt = menu(page).getByRole("button", { name: /mana from Treasures only/ });
  await expect(alt).toBeEnabled();
  await alt.click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[rhox]!.zone === "battlefield");
  expect(after.battlefield.filter((id) => after.cards[after.objects[id]!.cardId]!.name === "Treasure Token")).toHaveLength(0);
  expect(after.objects[forest]!.tapped).toBe(false);
  expect(pageErrors(page)).toEqual([]);
});

test("Hired Hexblade: sacrifice a Treasure for {B}, cast it, and it draws a card", async ({ page }) => {
  const s = scene({ hand: ["Hired Hexblade"], board: ["Swamp"], tokens: ["Treasure"], library: ["Island"] });
  const hexblade = one(s, "Hired Hexblade");
  const treasure = idsOf(s, "Treasure Token")[0]!;
  await open(page, s);
  await page.locator(`[data-obj="${treasure}"]`).click();
  await menu(page).locator("button", { has: page.locator('[title="{B}"]') }).click();
  await expect.poll(async () => (await state(page)).players[0]!.manaLots?.find((l) => l.mana === "B" && l.from?.includes("treasure"))?.n).toBe(1);
  await card(page, "Hired Hexblade", s).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.triggerQueue.length === 0 && st.objects[hexblade]!.zone === "battlefield" && st.players[0]!.life === 39);
  expect(after.objects[hexblade]!.treasureSpent).toBe(1);
  expect(after.players[0]!.hand).toHaveLength(1);
  expect(pageErrors(page)).toEqual([]);
});
