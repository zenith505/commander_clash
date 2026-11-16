// Lane B round B224 in the browser: a color chosen as a land is tapped for mana. Pulse of Llanowar's basic land offers each
// color; Naked Singularity's Taiga (a Mountain Forest) offers {U} or {B}; Harvest Mage's discard, then a land of yours
// makes one mana of the color picked.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { card, menu, modal, resolveUntil } from "./ui";

test("Pulse of Llanowar: tapping a Forest offers each color; pick {U}", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Pulse of Llanowar"] });
  const forest = idsOf(s, "Forest", "battlefield", 0).at(-1)!; // the top of the pile
  await open(page, s);
  await page.locator(`[data-obj="${forest}"]`).click();
  const m = menu(page);
  await expect(m).toBeVisible();
  for (const c of ["W", "U", "B", "R", "G"]) await expect(m.locator(`button:has([title='{${c}}'])`)).toHaveCount(1);
  await m.locator("button:has([title='{U}'])").click();
  const after = await resolveUntil(page, (st) => st.objects[forest]!.tapped === true);
  expect(after.objects[forest]!.tapped).toBe(true);
  expect(after.players[0]!.manaPool).toMatchObject({ U: 1, G: 0 });
  expect(pageErrors(page)).toEqual([]);
});

test("Naked Singularity: Taiga, a Mountain Forest, makes {U} or {B}; pick {B}", async ({ page }) => {
  const s = scene({ board: ["Taiga"] }, [{ board: ["Naked Singularity"] }]);
  const taiga = one(s, "Taiga");
  await open(page, s);
  await page.locator(`[data-obj="${taiga}"]`).click();
  const m = menu(page);
  await expect(m).toBeVisible();
  await expect(m.locator("button:has([title='{U}'])")).toHaveCount(1);
  await expect(m.locator("button:has([title='{B}'])")).toHaveCount(1);
  await expect(m.locator("button:has([title='{R}'])")).toHaveCount(0);
  await expect(m.locator("button:has([title='{G}'])")).toHaveCount(0);
  await m.locator("button:has([title='{B}'])").click();
  const after = await resolveUntil(page, (st) => st.objects[taiga]!.tapped === true);
  expect(after.players[0]!.manaPool).toMatchObject({ B: 1, R: 0, G: 0, U: 0 });
  expect(pageErrors(page)).toEqual([]);
});

test("Harvest Mage: discard Divination, then a Mountain makes one {G}", async ({ page }) => {
  const s = scene({ hand: ["Divination"], board: [...LANDS, "Harvest Mage"] });
  const [mage, divination] = [one(s, "Harvest Mage"), one(s, "Divination")];
  await open(page, s);
  await card(page, "Harvest Mage", s).click();
  const m = menu(page);
  await expect(m).toBeVisible();
  await m.getByRole("button", { name: /Discard a card: Until end of turn/ }).click();
  const pick = modal(page);
  await expect(pick).toContainText("Harvest Mage: discard a card");
  await expect(pick.getByRole("button", { name: "Done" })).toBeDisabled();
  await pick.locator(`[data-pick="${divination}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const done = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[divination]!.zone === "graveyard" && (st.landManaRules ?? []).length === 1);
  expect(done.objects[mage]!.tapped).toBe(true);
  // A Mountain still untapped: one mana of a color of your choice.
  const mountain = idsOf(done, "Mountain", "battlefield", 0).filter((id) => !done.objects[id]!.tapped).at(-1)!;
  const before = done.players[0]!.manaPool;
  await page.locator(`[data-obj="${mountain}"]`).click();
  await expect(m).toBeVisible();
  for (const c of ["W", "U", "B", "R", "G"]) await expect(m.locator(`button:has([title='{${c}}'])`)).toHaveCount(1);
  await m.locator("button:has([title='{G}'])").click();
  const after = await resolveUntil(page, (st) => st.objects[mountain]!.tapped === true);
  expect(after.objects[mountain]!.tapped).toBe(true);
  expect(after.players[0]!.manaPool.G).toBe(before.G + 1);
  expect(after.players[0]!.manaPool.R).toBe(before.R);
  expect(pageErrors(page)).toEqual([]);
});
