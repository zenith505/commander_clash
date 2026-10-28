// Lane B round 27 in the browser: grandeur, "Discard another card named Tarox Bladewing": only the other Tarox in hand
// can be picked to pay for it.
import { expect, test } from "@playwright/test";
import { idsOf, open, pageErrors, scene } from "./scene";
import { menu, modal, resolveUntil } from "./ui";

test("Tarox Bladewing: grandeur discards the other Tarox Bladewing, and it gets +X/+X for its power", async ({ page }) => {
  const s = scene({ hand: ["Tarox Bladewing", "Grizzly Bears"], board: ["Tarox Bladewing", "Mountain"] });
  const [onBoard] = idsOf(s, "Tarox Bladewing", "battlefield", 0) as [string];
  const [inHand] = idsOf(s, "Tarox Bladewing", "hand", 0) as [string];
  const [bears] = idsOf(s, "Grizzly Bears", "hand", 0) as [string];
  await open(page, s);
  await page.locator(`[data-obj="${onBoard}"]`).click();
  await menu(page).getByRole("button", { name: /gets \+X\/\+X/ }).click();
  const pick = modal(page);
  await expect(pick).toContainText("card named Tarox Bladewing");
  await expect(pick.locator(`[data-pick="${bears}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${inHand}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[inHand]!.zone === "graveyard");
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(after.log.some((l) => l.text.includes("Tarox Bladewing gets +4/+4"))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
