// "Can't be the target of nongreen spells or abilities from nongreen sources": while you choose Shock's target, Gaea's
// Revenge isn't highlighted and clicking it does nothing; Giant Growth can target it.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, resolveUntil } from "./ui";

test("Gaea's Revenge: Shock can't target it, Giant Growth can", async ({ page }) => {
  const s = scene({ hand: ["Shock", "Giant Growth"], board: [...LANDS, "Gaea's Revenge", "Grizzly Bears"] });
  const [revenge, bears] = [one(s, "Gaea's Revenge"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Shock", s).click();
  await expect(page.locator(`[data-obj="${bears}"]`)).toHaveClass(/targetable/);
  await expect(page.locator(`[data-obj="${revenge}"]`)).not.toHaveClass(/targetable/);
  await page.locator(`[data-obj="${revenge}"]`).click();
  await page.keyboard.press("Escape");
  await card(page, "Giant Growth", s).click();
  await expect(page.locator(`[data-obj="${revenge}"]`)).toHaveClass(/targetable/);
  await page.locator(`[data-obj="${revenge}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[one(s, "Giant Growth")]!.zone === "graveyard");
  expect(after.objects[one(s, "Shock")]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});
