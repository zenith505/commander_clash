// Round 157: Gilgamesh, Master-at-Arms puts Equipment from the top six onto the battlefield, then its reflexive trigger
// asks which one of them to attach to a Samurai, or none (CR 603.12): a button for each, hovering shows the card.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

test("Gilgamesh: put two Equipment onto the battlefield, then choose which one to attach", async ({ page }) => {
  const s = scene({ hand: ["Gilgamesh, Master-at-Arms"], board: LANDS, library: ["Bonesplitter", "Forest", "Lightning Greaves", "Island", "Swamp", "Plains"] });
  const [gil, bone, greaves] = [one(s, "Gilgamesh, Master-at-Arms"), one(s, "Bonesplitter"), one(s, "Lightning Greaves")];
  await open(page, s);
  await card(page, "Gilgamesh, Master-at-Arms", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await pick.locator(`[data-pick="${bone}"]`).click();
  await pick.locator(`[data-pick="${greaves}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  const bar = controls(page);
  await expect(bar).toContainText("choose one of them to attach to a Samurai you control, or none");
  for (const name of ["Bonesplitter", "Lightning Greaves", "Don't attach"]) await expect(bar.getByRole("button", { name, exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Bonesplitter", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[bone]?.attachedTo === gil);
  expect(after.objects[greaves]!.zone).toBe("battlefield");
  expect(after.objects[greaves]!.attachedTo).toBeUndefined();
  expect(pageErrors(page)).toEqual([]);
});
