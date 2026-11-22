// Round 447 in the browser: Captain America, First Avenger's "Unattach an Equipment from ~", asked first with a button for
// each Equipment attached to it (its mana value the damage), then its targets and how that damage is divided.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { menu, resolveUntil } from "./ui";
import { invalidateCharacteristics } from "@cc/engine";

/** Your Captain America with Sword of Fire and Ice and Bonesplitter attached; Ana has Grizzly Bears and a Hill Giant. */
function equippedCaptain() {
  const s = scene({ board: [...LANDS, "Captain America, First Avenger", "Sword of Fire and Ice", "Bonesplitter"] }, [{ board: ["Grizzly Bears", "Hill Giant"] }]);
  const [cap, sword, split] = [one(s, "Captain America, First Avenger"), one(s, "Sword of Fire and Ice"), one(s, "Bonesplitter")];
  s.objects[sword]!.attachedTo = cap;
  s.objects[split]!.attachedTo = cap;
  invalidateCharacteristics(s);
  return { s, cap, sword, split, bears: one(s, "Grizzly Bears"), giant: one(s, "Hill Giant") };
}

test("Captain America: Throw the Sword of Fire and Ice, then its 3 damage divided between Ana's Grizzly Bears and Hill Giant", async ({ page }) => {
  const { s, cap, sword, split, bears, giant } = equippedCaptain();
  await open(page, s);
  await page.locator(`[data-obj="${cap}"]`).first().click();
  await menu(page).getByRole("button", { name: /Unattach an Equipment/ }).click();
  const pick = page.locator(".unattach-pick");
  await expect(pick).toContainText("choose an Equipment to unattach");
  await expect(pick.getByRole("button", { name: "Bonesplitter (1 damage)" })).toBeVisible();
  await pick.getByRole("button", { name: "Sword of Fire and Ice (3 damage)" }).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await page.locator(".targeting").getByRole("button", { name: "Done" }).click();
  const panel = page.locator(".targeting", { hasText: "divide the damage" });
  const bearsRow = panel.locator(".divide", { hasText: "Grizzly Bears" });
  const giantRow = panel.locator(".divide", { hasText: "Hill Giant" });
  // Two to the Bears, one to the Giant.
  for (let i = 0; i < 3 && (await bearsRow.locator("strong").textContent()) !== "2"; i++) {
    if ((await bearsRow.locator("strong").textContent()) === "1") {
      await giantRow.getByRole("button", { name: "−" }).click();
      await bearsRow.getByRole("button", { name: "+" }).click();
    }
  }
  await expect(bearsRow.locator("strong")).toHaveText("2");
  await expect(giantRow.locator("strong")).toHaveText("1");
  await panel.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "graveyard");
  expect(after.objects[sword]!.attachedTo).toBeUndefined();
  expect(after.objects[sword]!.zone).toBe("battlefield");
  expect(after.objects[split]!.attachedTo).toBe(cap);
  expect(after.objects[giant]!.damage).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Captain America: Throw Bonesplitter, its 1 damage to one target, Ana herself", async ({ page }) => {
  const { s, cap, sword, split } = equippedCaptain();
  await open(page, s);
  await page.locator(`[data-obj="${cap}"]`).first().click();
  await menu(page).getByRole("button", { name: /Unattach an Equipment/ }).click();
  await page.locator(".unattach-pick").getByRole("button", { name: "Bonesplitter (1 damage)" }).click();
  await page.locator('[data-player="1"]').first().click();
  // One damage, so one target: Done, then all of it to Ana.
  await expect(page.locator(".targeting")).toContainText("optional, up to 2 more");
  await page.locator(".targeting").getByRole("button", { name: "Done" }).click();
  const panel = page.locator(".targeting", { hasText: "divide the damage" });
  await expect(panel.locator(".divide", { hasText: "Ana" }).locator("strong")).toHaveText("1");
  await panel.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life === 39);
  expect(after.objects[split]!.attachedTo).toBeUndefined();
  expect(after.objects[sword]!.attachedTo).toBe(cap);
  expect(pageErrors(page)).toEqual([]);
});
