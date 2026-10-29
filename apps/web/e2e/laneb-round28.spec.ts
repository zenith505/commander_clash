// Lane B round 28 in the browser: "Remove X ki counters from this creature" as a cost (CR 107.3a, 602.2b): the X picker
// names the counters and goes up to how many there are.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { menu, resolveUntil } from "./ui";

test("Skullmane Baku: choose X = 2 of its 3 ki counters, the target creature gets -2/-2", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Skullmane Baku"] }, [{ board: ["Grizzly Bears"] }]);
  const [baku, bears] = [one(s, "Skullmane Baku"), one(s, "Grizzly Bears")];
  s.objects[baku]!.counters.ki = 3;
  await open(page, s);
  await page.locator(`[data-obj="${baku}"]`).first().click();
  await menu(page).locator("button", { hasText: "Remove X ki counters" }).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("remove X ki counters: choose X (up to 3)");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "graveyard");
  expect(after.objects[baku]!.counters.ki).toBe(1);
  expect(after.objects[baku]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
