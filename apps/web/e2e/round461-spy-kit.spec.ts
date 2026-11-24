// Round 461: Spy Kit. Equipping a second Spy Kit to another legend: each has all names of nonlegendary creature cards, so
// the two share a name and the legend rule's "Keep ..." buttons come up (CR 612.7, 201.2a, 704.5j).
import { expect, test } from "@playwright/test";
import { invalidateCharacteristics } from "@cc/engine";
import { idsOf, one, open, pageErrors, scene } from "./scene";
import { controls, menu, resolveUntil } from "./ui";

test("Spy Kit: equip Barktooth Warbeard while Isamaru has one; keep Barktooth under the legend rule", async ({ page }) => {
  const s = scene({ board: ["Plains", "Plains", "Isamaru, Hound of Konda", "Barktooth Warbeard", "Spy Kit", "Spy Kit"] });
  const [isamaru, barktooth] = [one(s, "Isamaru, Hound of Konda"), one(s, "Barktooth Warbeard")];
  const [kitA, kitB] = idsOf(s, "Spy Kit", "battlefield", 0) as [string, string];
  s.objects[kitA]!.attachedTo = isamaru;
  invalidateCharacteristics(s);
  await open(page, s);
  await page.locator(`[data-obj="${kitB}"]`).click();
  await menu(page).locator("button", { hasText: "Equip" }).click();
  await page.locator(`[data-obj="${barktooth}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "legend");
  const bar = controls(page);
  await expect(bar).toContainText("legend rule: keep which one?");
  await expect(bar.getByRole("button", { name: "Keep Isamaru, Hound of Konda (Spy Kit, oldest)" })).toBeVisible();
  await bar.getByRole("button", { name: "Keep Barktooth Warbeard (Spy Kit, newest)" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[isamaru]!.zone === "graveyard");
  expect(after.objects[barktooth]!.zone).toBe("battlefield");
  expect(after.objects[kitB]!.attachedTo).toBe(barktooth);
  await expect(page.locator(`[data-obj="${barktooth}"]`)).toContainText("7/6");
  expect(pageErrors(page)).toEqual([]);
});
