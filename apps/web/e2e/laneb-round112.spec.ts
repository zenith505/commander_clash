// Lane B round B112 in the browser: "Sacrifice enchanted creature" as an Aura's activation cost (Betrothed of Fire,
// CR 602.2b, 601.2h). Only the creature the Aura is attached to can pay it.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { menu, resolveUntil } from "./ui";

test("Betrothed of Fire: sacrifice the enchanted Grizzly Bears; Hill Giant can't pay, then gets +2/+0", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Grizzly Bears", "Hill Giant", "Betrothed of Fire"] });
  const [bears, giant, aura] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Betrothed of Fire")];
  s.objects[aura]!.attachedTo = bears;
  await open(page, s);
  // Attached under the bears: its visible corner.
  await page.locator(`[data-obj="${aura}"]`).first().click({ position: { x: 6, y: 6 } });
  await menu(page).locator("button", { hasText: /Creatures you control get \+2\/\+0/ }).click();
  const bar = page.locator(".targeting", { hasText: "sacrifice the enchanted creature (click it)" });
  await expect(bar).toBeVisible();
  // Hill Giant isn't the enchanted creature: clicking it picks nothing.
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await expect(bar.getByRole("button", { name: "Sacrifice and activate" })).toBeDisabled();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await bar.getByRole("button", { name: "Sacrifice and activate" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "graveyard");
  expect(after.objects[aura]!.zone).toBe("graveyard");
  expect(after.objects[giant]!.zone).toBe("battlefield");
  await expect(page.locator(`[data-obj="${giant}"]`).first()).toContainText("5/3");
  expect(pageErrors(page)).toEqual([]);
});
