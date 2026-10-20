// "Choose any number —" on a trigger (CR 700.2): Done works with no mode chosen. And Eerie Ultimatum's pick of permanent
// cards with different names from your graveyard: one of each name is offered.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { attack, card, controls, modal, passTo, resolveUntil } from "./ui";

test("Rankle and Torbran: choose any number of modes, none at all included", async ({ page }) => {
  const s = scene({ board: ["Rankle and Torbran"] }, [{ board: ["Grizzly Bears"] }]);
  const rankle = one(s, "Rankle and Torbran");
  await open(page, s);
  await passTo(page, "declareAttackers");
  await attack(page, [[rankle, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseModes");
  const modes = page.locator(".mode-menu");
  await expect(modes).toContainText("choose up to three");
  await expect(modes).toContainText("Each player creates a Treasure token.");
  await modes.getByRole("button", { name: "Choose none" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.triggerQueue.length === 0 && st.stack.length === 0 && st.step !== "combatDamage");
  expect(after.players[1]!.life).toBe(37);
  expect(after.battlefield.filter((id) => after.objects[id]!.isToken)).toEqual([]);
  expect(after.objects[one(s, "Grizzly Bears")]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Rankle and Torbran: two modes chosen, a Treasure for each player and each sacrifices a creature", async ({ page }) => {
  const s = scene({ board: ["Rankle and Torbran", "Llanowar Elves"] }, [{ board: ["Grizzly Bears"] }]);
  const rankle = one(s, "Rankle and Torbran");
  await open(page, s);
  await passTo(page, "declareAttackers");
  await attack(page, [[rankle, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseModes");
  const modes = page.locator(".mode-menu");
  await modes.getByRole("button", { name: /Each player creates a Treasure token/ }).click();
  await modes.getByRole("button", { name: /Each player sacrifices a creature/ }).click();
  await modes.getByRole("button", { name: "Done" }).click();
  // You choose which of your two creatures to sacrifice.
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  await page.locator(`[data-obj="${one(s, "Llanowar Elves")}"]`).click();
  await controls(page).getByRole("button", { name: "Sacrifice", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.triggerQueue.length === 0 && st.stack.length === 0 && st.objects[one(s, "Grizzly Bears")]!.zone === "graveyard");
  expect(after.battlefield.filter((id) => after.objects[id]!.isToken)).toHaveLength(4);
  expect(after.objects[one(s, "Llanowar Elves")]!.zone).toBe("graveyard");
  expect(after.objects[rankle]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Eerie Ultimatum: one card of each name from your graveyard, any number of them", async ({ page }) => {
  const s = scene({ hand: ["Eerie Ultimatum"], board: LANDS, yard: ["Hill Giant", "Hill Giant", "Sol Ring", "Lightning Bolt"] });
  const giants = idsOf(s, "Hill Giant");
  await open(page, s);
  await card(page, "Eerie Ultimatum", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  await expect(modal(page)).toContainText("any number of permanent cards with different names");
  await expect(modal(page).locator(`[data-pick="${one(s, "Lightning Bolt")}"]`)).toHaveCount(0);
  await expect(modal(page).locator(giants.map((id) => `[data-pick="${id}"]`).join(", "))).toHaveCount(1);
  await modal(page).locator(`[data-pick="${one(s, "Sol Ring")}"]`).click();
  await modal(page).locator(giants.map((id) => `[data-pick="${id}"]`).join(", ")).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[one(s, "Sol Ring")]!.zone === "battlefield");
  expect(giants.filter((id) => after.objects[id]!.zone === "battlefield")).toHaveLength(1);
  expect(after.objects[one(s, "Lightning Bolt")]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
