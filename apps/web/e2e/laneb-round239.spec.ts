// Lane B round B239 in the browser: Charmed Pendant's menu button (tap it and mill a card), its picker for the milled card's
// hybrid symbols, and Silhouette keeping your creature from your own Lightning Bolt.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, controls, menu, resolveUntil } from "./ui";

test("Charmed Pendant: its menu mills Kitchen Finks; you choose {G}{W} for the two hybrid symbols", async ({ page }) => {
  const s = scene({ board: ["Charmed Pendant"], library: ["Kitchen Finks", "Grizzly Bears"] });
  const [pendant, finks] = [one(s, "Charmed Pendant"), one(s, "Kitchen Finks")];
  await open(page, s);
  await page.locator(`[data-obj="${pendant}"]`).first().click();
  const button = menu(page).getByRole("button", { name: "Mill a card: add one mana for each colored mana symbol in the milled card's mana cost" });
  await expect(button).toBeVisible();
  await button.click();
  const bar = controls(page).filter({ hasText: "choose the mana its milled card's hybrid symbols add" });
  await expect(bar.locator("[data-mana]")).toHaveCount(3);
  await bar.locator('[data-mana="WG"]').click();
  let after = s;
  await expect.poll(async () => (after = await state(page)).players[0]!.manaPool.G).toBe(1);
  expect(after.players[0]!.manaPool.W).toBe(1);
  expect(after.objects[finks]!.zone).toBe("graveyard");
  expect(after.objects[pendant]!.tapped).toBe(true);
  expect(after.pending).toBeNull();
  expect(after.log.some((l) => l.text === "You mills Kitchen Finks for Charmed Pendant.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Charmed Pendant: a card without hybrid symbols adds its mana at once (Lightning Bolt: {R})", async ({ page }) => {
  const s = scene({ board: ["Charmed Pendant"], library: ["Lightning Bolt"] });
  const [pendant, bolt] = [one(s, "Charmed Pendant"), one(s, "Lightning Bolt")];
  await open(page, s);
  await page.locator(`[data-obj="${pendant}"]`).first().click();
  await menu(page).getByRole("button", { name: "Mill a card: add one mana for each colored mana symbol in the milled card's mana cost" }).click();
  let after = s;
  await expect.poll(async () => (after = await state(page)).players[0]!.manaPool.R).toBe(1);
  expect(after.objects[bolt]!.zone).toBe("graveyard");
  expect(after.pending).toBeNull();
  expect(pageErrors(page)).toEqual([]);
});

test("Silhouette on your Grizzly Bears: your Lightning Bolt aimed at them deals no damage", async ({ page }) => {
  const s = scene({ hand: ["Silhouette", "Lightning Bolt"], board: [...LANDS, "Grizzly Bears"] });
  const [sil, bolt, bears] = [one(s, "Silhouette"), one(s, "Lightning Bolt"), one(s, "Grizzly Bears")];
  await open(page, s);
  await card(page, "Silhouette", s).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[sil]!.zone === "graveyard");
  await card(page, "Lightning Bolt", s).click();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[bolt]!.zone === "graveyard");
  expect(after.objects[bears]!.zone).toBe("battlefield");
  expect(after.objects[bears]!.damage).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});
