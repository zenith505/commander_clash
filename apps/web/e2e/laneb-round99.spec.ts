// Lane B round 99 in the browser: Darksteel Garrison's "Fortify {3}" menu entry and its land target, and Arcanum Wings'
// aura swap, picking the Aura card from your hand that takes its place.
import { expect, test } from "@playwright/test";
import { characteristics } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, menu, modal, resolveUntil } from "./ui";

test("Darksteel Garrison: Fortify {3} from its menu, a creature can't be the target, the land can; it has indestructible", async ({ page }) => {
  const s = scene({ board: ["Island", "Mountain", "Plains", "Wastes", "Darksteel Garrison", "Grizzly Bears"] });
  const [garrison, wastes, bears] = [one(s, "Darksteel Garrison"), one(s, "Wastes"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Darksteel Garrison", s).click();
  if (await menu(page).count()) await menu(page).locator("button", { hasText: /^Fortify/ }).click();
  // Only a land you control: clicking the bears doesn't target them.
  await page.locator(`[data-obj="${bears}"]`).click();
  expect((await state(page)).stack).toHaveLength(0);
  await page.locator(`[data-obj="${wastes}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[garrison]!.attachedTo === wastes);
  expect(after.objects[garrison]!.attachedTo).toBe(wastes);
  expect(characteristics(after, after.objects[wastes]!).keywords).toContain("Indestructible");
  expect(pageErrors(page)).toEqual([]);
});

test("Arcanum Wings: aura swap asks which Aura card from your hand to exchange it with; Rancor takes its place on the bears", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Grizzly Bears", "Arcanum Wings"], hand: ["Rancor"] });
  const [bears, wings, rancor] = [one(s, "Grizzly Bears"), one(s, "Arcanum Wings"), one(s, "Rancor")];
  s.objects[wings]!.attachedTo = bears;
  await open(page, s);
  // Attached under the bears: its visible corner.
  await page.locator(`[data-obj="${wings}"]`).first().click({ position: { x: 6, y: 6 } });
  if (await menu(page).count()) await menu(page).locator("button", { hasText: /^Aura swap/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  await expect(modal(page)).toContainText("you may exchange it with an Aura card from your hand (aura swap)");
  await modal(page).locator(`[data-pick="${rancor}"]`).click();
  await modal(page).getByRole("button", { name: "Done", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[rancor]!.zone === "battlefield");
  expect(after.objects[rancor]!.attachedTo).toBe(bears);
  expect(after.objects[wings]!.zone).toBe("hand");
  await expect(page.locator(`[data-obj="${bears}"]`)).toContainText("4/2");
  expect(pageErrors(page)).toEqual([]);
});
