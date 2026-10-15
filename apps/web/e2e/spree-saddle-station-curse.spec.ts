// PR #26: Spree's costs in the mode menu, the Saddle picker and Saddled chip, the station picker, and a Curse
// targeting a player and showing in that player's area.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, clickPlayer, menu, resolveUntil, seat } from "./ui";

test("Spree: the mode menu shows each mode's added cost, and the spell costs the sum", async ({ page }) => {
  const s = scene({ hand: ["Explosive Derailment"], board: LANDS }, [{ board: ["Hill Giant", "Fist of Suns"] }]);
  const [giant, fist] = [one(s, "Hill Giant"), one(s, "Fist of Suns")];
  await open(page, s);
  await card(page, "Explosive Derailment", s).click();
  const modes = page.locator(".mode-menu");
  await expect(modes).toContainText("choose one or both");
  await expect(modes.getByRole("button", { name: /^\+ \{2\} — Explosive Derailment deals 4 damage/ })).toBeVisible();
  await modes.getByRole("button", { name: /^\+ \{2\} — Explosive Derailment deals 4 damage/ }).click();
  await modes.getByRole("button", { name: /^\+ \{2\} — Destroy target artifact/ }).click();
  await modes.getByRole("button", { name: "Done" }).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  await page.locator(`[data-obj="${fist}"]`).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending);
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(after.objects[fist]!.zone).toBe("graveyard");
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped)).toHaveLength(5); // {R} + {2} + {2}
  expect(pageErrors(page)).toEqual([]);
});

test("Saddle: pick the creatures to tap, and the Mount shows Saddled", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Venomsac Lagac", "Llanowar Elves", "Grizzly Bears"] });
  const [lagac, elves, bears] = [one(s, "Venomsac Lagac"), one(s, "Llanowar Elves"), one(s, "Grizzly Bears")];
  await open(page, s);
  await page.locator(`[data-obj="${lagac}"]`).click();
  await menu(page).getByRole("button", { name: /^Saddle 2/ }).click();
  const bar = page.locator(".targeting", { hasText: "Saddle Venomsac Lagac" });
  await expect(bar).toBeVisible();
  // The suggestion: just enough power, from the Bears. Take it back and pick by hand.
  await expect(bar).toContainText("(now 2)");
  await page.locator(`[data-obj="${bears}"]`).click();
  await expect(bar).toContainText("(now 0)");
  await page.locator(`[data-obj="${elves}"]`).click();
  await expect(bar).toContainText("(now 1)");
  await expect(bar.getByRole("button", { name: "Saddle", exact: true })).toBeDisabled();
  await page.locator(`[data-obj="${bears}"]`).click();
  await expect(bar).toContainText("(now 3)");
  await bar.getByRole("button", { name: "Saddle", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !!st.objects[lagac]!.saddled);
  expect(after.objects[elves]!.tapped && after.objects[bears]!.tapped).toBe(true);
  await expect(page.locator(`[data-obj="${lagac}"] .chip`, { hasText: "Saddled" })).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test("Station: tap another creature, and the Spacecraft gets charge counters equal to its power", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Galvanizing Sawship", "Grizzly Bears", "Hill Giant"] });
  const [ship, giant] = [one(s, "Galvanizing Sawship"), one(s, "Hill Giant")];
  await open(page, s);
  await page.locator(`[data-obj="${ship}"]`).click();
  await menu(page).getByRole("button", { name: /^Station/ }).click();
  const bar = page.locator(".targeting", { hasText: "Station Galvanizing Sawship" });
  // The suggestion is the creature with the greatest power.
  await expect(bar).toContainText("(Hill Giant, 3 charge counters)");
  await bar.getByRole("button", { name: "Station", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[ship]!.counters.charge === 3);
  expect(after.objects[giant]!.tapped).toBe(true);
  await expect(page.locator(`[data-obj="${ship}"] .chip`, { hasText: "3 charge" })).toBeVisible();
  // At 3+ it's a 6/5 artifact creature with flying and haste.
  await expect(page.locator(`[data-obj="${ship}"] .pt`)).toHaveText("6/5");
  expect(pageErrors(page)).toEqual([]);
});

test("Curse: target a player, and the Curse sits in that player's area", async ({ page }) => {
  const s = scene({ hand: ["Curse of the Bloody Tome"], board: LANDS });
  const curse = one(s, "Curse of the Bloody Tome");
  await open(page, s);
  await card(page, "Curse of the Bloody Tome", s).click();
  await expect(page.locator(".targeting")).toContainText("Curse of the Bloody Tome: choose");
  await clickPlayer(page, 2);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[curse]!.zone === "battlefield");
  expect(after.objects[curse]!.attachedToPlayer).toBe(2);
  await expect(seat(page, 2).locator(`[data-obj="${curse}"]`)).toBeVisible();
  await expect(seat(page, 0).locator(`[data-obj="${curse}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-obj="${curse}"] .chip`, { hasText: "On Ben" })).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});
