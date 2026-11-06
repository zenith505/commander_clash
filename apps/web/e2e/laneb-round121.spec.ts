// Lane B round B121 in the browser: Standard Bearer. While an opponent controls a Flagbearer, choosing Shock's target
// highlights only the Flagbearer: Ken's own creature, the opponent's other creature and the players can't be picked.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, resolveUntil } from "./ui";

test("Standard Bearer: Shock must target the Flagbearer", async ({ page }) => {
  const s = scene({ hand: ["Shock"], board: [...LANDS, "Grizzly Bears"] }, [{ board: ["Standard Bearer", "Hill Giant"] }]);
  const [bearer, giant, bears] = [one(s, "Standard Bearer"), one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Shock", s).click();
  await expect(page.locator(`[data-obj="${bearer}"]`)).toHaveClass(/targetable/);
  await expect(page.locator(`[data-obj="${giant}"]`)).not.toHaveClass(/targetable/);
  await expect(page.locator(`[data-obj="${bears}"]`)).not.toHaveClass(/targetable/);
  // Clicking the Giant does nothing; the Bearer is the target.
  await page.locator(`[data-obj="${giant}"]`).click();
  await page.locator(`[data-obj="${bearer}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[one(s, "Shock")]!.zone === "graveyard");
  expect(after.objects[bearer]!.zone).toBe("graveyard");
  expect(after.objects[giant]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
