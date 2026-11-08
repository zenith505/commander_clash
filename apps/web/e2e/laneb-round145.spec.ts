// Lane B round B145 in the browser: Ana's Thelon's Curse keeps your blue creatures tapped, and at your upkeep you click
// the ones to untap and pay {U} for each, all at once, from your Islands.
import { expect, test } from "@playwright/test";
import { idsOf, open, pageErrors, playUntil, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

const atYourUpkeep = (you: string[]) => {
  const s0 = scene({ board: you }, [{ board: ["Thelon's Curse"] }]);
  const merfolk = [...idsOf(s0, "Merfolk of the Pearl Trident"), ...idsOf(s0, "Coral Merfolk")];
  for (const id of merfolk) s0.objects[id]!.tapped = true;
  const s = playUntil(s0, (x) => x.pending?.kind === "pickPermanents" && x.pending.player === 0);
  return { s, merfolk };
};

test("Thelon's Curse: at your upkeep you click two tapped blue creatures and pay {U}{U} to untap both", async ({ page }) => {
  const { s, merfolk } = atYourUpkeep(["Island", "Island", "Merfolk of the Pearl Trident", "Coral Merfolk"]);
  const islands = idsOf(s, "Island", "battlefield", 0);
  expect(s.step).toBe("upkeep");
  expect(merfolk.every((id) => s.objects[id]!.tapped)).toBe(true);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Thelon's Curse:");
  await expect(bar).toContainText("paying {U} for each");
  await expect(bar.getByRole("button", { name: "Untap none" })).toBeEnabled();
  for (const id of merfolk) await page.locator(`[data-obj="${id}"]`).click();
  await bar.getByRole("button", { name: "Pay {U}{U} and untap 2" }).click();
  const after = await resolveUntil(page, (x) => x.pending?.kind !== "pickPermanents" && merfolk.every((id) => !x.objects[id]!.tapped));
  expect(islands.every((id) => after.objects[id]!.tapped)).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Thelon's Curse: with one Island, two can't be paid for; you untap one", async ({ page }) => {
  const { s, merfolk } = atYourUpkeep(["Island", "Merfolk of the Pearl Trident", "Coral Merfolk"]);
  await open(page, s);
  const bar = controls(page);
  for (const id of merfolk) await page.locator(`[data-obj="${id}"]`).click();
  await expect(bar).toContainText("not enough mana for {U}{U}");
  await expect(bar.getByRole("button", { name: "Pay {U}{U} and untap 2" })).toBeDisabled();
  // Click the second one again to leave it out.
  await page.locator(`[data-obj="${merfolk[1]}"]`).click();
  await bar.getByRole("button", { name: "Pay {U} and untap 1" }).click();
  const after = await resolveUntil(page, (x) => x.pending?.kind !== "pickPermanents" && !x.objects[merfolk[0]!]!.tapped);
  expect(after.objects[merfolk[1]!]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
