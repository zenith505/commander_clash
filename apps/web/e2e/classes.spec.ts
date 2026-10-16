// Class enchantments (CR 716): the level abilities in the card's menu, only the next level enabled, and a "Level N" chip.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, menu, resolveUntil } from "./ui";

test("Wizard Class: gain level 2 from its menu, draw two, and the chip shows Level 2", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Island", "Island", "Island", "Wizard Class"] });
  const wizard = one(s, "Wizard Class");
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await card(page, "Wizard Class", s).click();
  await expect(menu(page).locator("button", { hasText: "Level 3" })).toBeDisabled();
  await menu(page).locator("button", { hasText: "Level 2" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.triggerQueue.length === 0 && st.objects[wizard]!.classLevel === 2 && st.players[0]!.hand.length === hand + 2);
  expect(after.objects[wizard]!.classLevel).toBe(2);
  await expect(page.locator(`[data-obj="${wizard}"]`)).toContainText("Level 2");
  // Now level 3 is the one to gain, and level 2 can't be again.
  await card(page, "Wizard Class", s).click();
  await expect(menu(page).locator("button", { hasText: "Level 2" })).toBeDisabled();
  await expect(menu(page).locator("button", { hasText: "Level 3" })).toBeEnabled();
  expect(pageErrors(page)).toEqual([]);
});
