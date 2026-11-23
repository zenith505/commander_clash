// Lane B round B302 in the browser: Battlefield Thaumaturge. With only an Island and a Mountain, Frost Breath ({2}{U})
// at two of Ana's creatures costs {U}: {1} less for each creature it targets, worked out after the targets are chosen
// (CR 601.2c, 601.2f), so the card can be cast with less mana than its mana cost.
import { expect, test } from "@playwright/test";
import { idsOf, one, open, pageErrors, scene } from "./scene";
import { card, resolveUntil } from "./ui";

test("Battlefield Thaumaturge: Frost Breath at two creatures costs {U}, paid with the Island alone", async ({ page }) => {
  const s = scene({ hand: ["Frost Breath"], board: ["Battlefield Thaumaturge", "Island", "Mountain"] }, [{ board: ["Grizzly Bears", "Hill Giant"] }]);
  const [breath, bears, giant] = [one(s, "Frost Breath"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  const [island, mountain] = [idsOf(s, "Island", "battlefield", 0)[0]!, idsOf(s, "Mountain", "battlefield", 0)[0]!];
  // Only these two lands: {2}{U} can't be paid without the reduction.
  expect(s.battlefield.filter((id) => s.objects[id]!.controller === 0 && s.cards[s.objects[id]!.cardId]!.types.includes("Land"))).toEqual([island, mountain]);
  await open(page, s);
  await card(page, "Frost Breath", s).click();
  const bar = page.locator(".targeting");
  await expect(bar).toBeVisible();
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[breath]!.zone === "graveyard");
  expect([bears, giant].map((id) => after.objects[id]!.tapped)).toEqual([true, true]);
  expect(after.objects[island]!.tapped).toBe(true);
  expect(after.objects[mountain]!.tapped).toBeFalsy();
  expect(pageErrors(page)).toEqual([]);
});
