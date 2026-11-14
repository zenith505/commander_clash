// Lane B round B202 in the browser: Moorland Rescuer's "return any number of other creature cards with total power X or
// less from your graveyard to the battlefield", the picker dimming a card that would take the total over its power.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, modal, resolveUntil } from "./ui";

test("Moorland Rescuer: dies with power 4; Grizzly Bears and Gray Ogre fit together, Hill Giant would go over", async ({ page }) => {
  const s = scene({ hand: ["Doom Blade"], board: [...LANDS, "Moorland Rescuer"], yard: ["Grizzly Bears", "Hill Giant", "Gray Ogre", "Craw Wurm"] });
  const [rescuer, bears, giant, ogre, wurm] = ["Moorland Rescuer", "Grizzly Bears", "Hill Giant", "Gray Ogre", "Craw Wurm"].map((n) => one(s, n)) as [string, string, string, string, string];
  await open(page, s);
  await card(page, "Doom Blade", s).click();
  await page.locator(`[data-obj="${rescuer}"]`).click();
  const st = await resolveUntil(page, (x) => x.pending?.kind === "searchLibrary" && x.pending.player === 0);
  expect(st.pending?.kind === "searchLibrary" && st.pending.totalPower).toBe(4);
  const pick = modal(page);
  await expect(pick).toContainText("any number of other creature cards with total power 4 or less");
  // Craw Wurm (power 6) isn't offered.
  await expect(pick.locator(`[data-pick="${wurm}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${bears}"]`).click();
  // 2 + 3 would be 5.
  await expect(pick.locator(`[data-pick="${giant}"]`)).toHaveClass(/dim/);
  await pick.locator(`[data-pick="${ogre}"]`).click();
  await expect(pick).toContainText("Chosen 2, total power 4 of at most 4.");
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.objects[bears]!.zone === "battlefield");
  expect([bears, ogre, giant, wurm, rescuer].map((id) => after.objects[id]!.zone)).toEqual(["battlefield", "battlefield", "graveyard", "graveyard", "exile"]);
  expect(pageErrors(page)).toEqual([]);
});
