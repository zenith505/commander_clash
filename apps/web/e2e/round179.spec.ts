// Round 179: Resolute Strike (and Nahiri, Heir of the Ancients, Goldwardens' Gambit, Vow to Erebor) asks which Equipment
// you control to attach to the creature, or none: a button for each, hovering shows the card.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, resolveUntil } from "./ui";

test("Resolute Strike: target a Warrior, then choose Bonesplitter to attach to it", async ({ page }) => {
  const s = scene({ hand: ["Resolute Strike"], board: [...LANDS, "Elvish Warrior", "Bonesplitter"] });
  const [warrior, bone] = [one(s, "Elvish Warrior"), one(s, "Bonesplitter")];
  await open(page, s);
  await card(page, "Resolute Strike", s).click();
  await page.locator(`[data-obj="${warrior}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  const bar = controls(page);
  await expect(bar).toContainText("choose an Equipment to attach to Elvish Warrior, or none");
  for (const name of ["Bonesplitter", "Don't attach"]) await expect(bar.getByRole("button", { name, exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Bonesplitter", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
  expect(after.objects[bone]!.attachedTo).toBe(warrior);
  expect(pageErrors(page)).toEqual([]);
});

test("Resolute Strike: Don't attach leaves the Equipment where it is", async ({ page }) => {
  const s = scene({ hand: ["Resolute Strike"], board: [...LANDS, "Elvish Warrior", "Bonesplitter"] });
  const [warrior, bone] = [one(s, "Elvish Warrior"), one(s, "Bonesplitter")];
  await open(page, s);
  await card(page, "Resolute Strike", s).click();
  await page.locator(`[data-obj="${warrior}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  await controls(page).getByRole("button", { name: "Don't attach", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0);
  expect(after.objects[bone]!.attachedTo).toBeUndefined();
  expect(after.objects[warrior]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
