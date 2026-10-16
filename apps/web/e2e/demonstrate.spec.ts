// Demonstrate (CR 702.144a): you may copy the spell; if you do, a bar asks which opponent also copies it.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Excavation Technique: copy it, keep the target, then pick Ben to copy it too", async ({ page }) => {
  const s = scene({ hand: ["Excavation Technique"], board: LANDS }, [{ board: ["Hill Giant"] }, {}, {}]);
  const [technique, giant] = [one(s, "Excavation Technique"), one(s, "Hill Giant")];
  await open(page, s);
  await card(page, "Excavation Technique", s).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay");
  await controls(page).getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "copyTargets");
  await page.locator(".targeting").getByRole("button", { name: /^Keep target/ }).click();
  const bar = page.locator(".demonstrate-pick");
  await expect(bar).toContainText("which opponent also copies it?");
  await expect(bar.getByRole("button")).toHaveText(["Ana", "Ben", "Cy"]);
  await bar.getByRole("button", { name: "Ben" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[technique]!.zone === "graveyard");
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(after.log.some((e) => /^Ben copies Excavation Technique/.test(e.text))).toBe(true);
  expect(after.log.some((e) => /^You copies Excavation Technique|^You copy Excavation Technique/.test(e.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
