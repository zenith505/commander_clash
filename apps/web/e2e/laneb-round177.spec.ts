// Lane B round B177 in the browser: Mossbridge Troll's "Tap any number of untapped creatures you control other than ~ with
// total power 10 or greater" cost, picked like a crew cost but not crewing.
import { expect, test } from "@playwright/test";
import { power } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { menu, resolveUntil } from "./ui";

test("Mossbridge Troll: tap Craw Wurm, Hill Giant and Grizzly Bears (total power 11) for +20/+20", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Mossbridge Troll", "Craw Wurm", "Hill Giant", "Grizzly Bears"] });
  const [troll, wurm, giant, bears] = [one(s, "Mossbridge Troll"), one(s, "Craw Wurm"), one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  await open(page, s);
  await page.locator(`[data-obj="${troll}"]`).first().click();
  await menu(page).getByRole("button", { name: /Tap any number of untapped creatures you control other than Mossbridge Troll/ }).click();
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("Tap Mossbridge Troll:");
  await expect(bar).toContainText("tap creatures with total power 10 (now 11)");
  // Without the Bears it's 9: not enough.
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await expect(bar).toContainText("(now 9)");
  await expect(bar.getByRole("button", { name: "Tap", exact: true })).toBeDisabled();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await expect(bar).toContainText("(now 11)");
  await bar.getByRole("button", { name: "Tap", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && power(st, st.objects[troll]!) === 25);
  for (const id of [wurm, giant, bears]) expect(after.objects[id]!.tapped).toBe(true);
  expect(after.objects[troll]!.tapped).toBe(false);
  expect(pageErrors(page)).toEqual([]);
});
