// Round 260's prompts: Genesis Storm ("put Sol Ring onto the battlefield?", otherwise it goes to the bottom with the other
// revealed cards), Spectral Arcanist (cast an instant or sorcery spell from any graveyard, mana value up to your Spirits)
// and Smelting Vat (noncreature artifact cards with total mana value up to the sacrificed artifact's).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

test("Genesis Storm: two lands, then Sol Ring revealed; put it onto the battlefield and the lands go to the bottom", async ({ page }) => {
  const s = scene({ hand: ["Genesis Storm"], board: LANDS, library: ["Wastes", "Command Tower", "Sol Ring"] });
  const [storm, ring, wastes, tower] = ["Genesis Storm", "Sol Ring", "Wastes", "Command Tower"].map((n) => one(s, n)) as [string, string, string, string];
  await open(page, s);
  await card(page, "Genesis Storm", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Genesis Storm: Put Sol Ring onto the battlefield?");
  await expect(bar).toContainText("If you don't, it goes on the bottom of your library with the other revealed cards.");
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[storm]!.zone === "graveyard");
  expect(after.objects[ring]!.zone).toBe("battlefield");
  expect(after.players[0]!.library.slice(-2).sort()).toEqual([wastes, tower].sort());
  expect(pageErrors(page)).toEqual([]);
});

test("Spectral Arcanist: cast Ana's Lightning Bolt from Ana's graveyard for free (Divination's mana value is too high); it's exiled", async ({ page }) => {
  const s = scene({ hand: ["Spectral Arcanist"], board: LANDS }, [{ yard: ["Lightning Bolt", "Divination"] }]);
  const [bolt, div] = [one(s, "Lightning Bolt"), one(s, "Divination")];
  await open(page, s);
  await card(page, "Spectral Arcanist", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong");
  const bar = controls(page);
  await expect(bar).toContainText("cast an instant or sorcery spell from a graveyard without paying its mana cost (mana value 1 or less)?");
  await expect(bar.getByRole("button", { name: /^Divination/ })).toHaveCount(0);
  await bar.getByRole("button", { name: /^Lightning Bolt/ }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree");
  await controls(page).getByRole("button", { name: "Cast it" }).click();
  await clickPlayer(page, 2);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "exile");
  expect(after.players[2]!.life).toBe(37);
  expect(after.players[1]!.exile).toContain(bolt);
  expect(after.objects[div]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Smelting Vat: sacrifice Mind Stone (2); up to two cards, Sol Ring and Wayfarer's Bauble fit together, Arcane Signet would go over", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Smelting Vat", "Mind Stone"], library: ["Sol Ring", "Arcane Signet", "Solemn Simulacrum", "Wayfarer's Bauble"] });
  const [vat, stone, ring, signet, solemn, bauble] = ["Smelting Vat", "Mind Stone", "Sol Ring", "Arcane Signet", "Solemn Simulacrum", "Wayfarer's Bauble"].map((n) => one(s, n)) as [string, string, string, string, string, string];
  await open(page, s);
  await card(page, "Smelting Vat", s).click();
  await menu(page).locator("button", { hasText: "Reveal the top eight cards" }).click();
  const costBar = page.locator(".targeting");
  await expect(costBar).toContainText("sacrifice another artifact (click it)");
  await page.locator(`[data-obj="${stone}"]`).click();
  await costBar.getByRole("button", { name: "Sacrifice and activate" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary");
  const pick = modal(page);
  await expect(pick).toContainText("Smelting Vat: put up to 2 noncreature artifact cards with total mana value less than or equal to the sacrificed artifact's mana value onto the battlefield");
  // Solemn Simulacrum is a creature: shown with the others revealed, but it can't be picked.
  await expect(pick.locator(`[data-pick="${solemn}"]`)).toHaveClass(/dim/);
  await pick.locator(`[data-pick="${ring}"]`).click();
  await expect(pick.locator(`[data-pick="${signet}"]`)).toHaveClass(/dim/);
  await pick.locator(`[data-pick="${bauble}"]`).click();
  await expect(pick).toContainText("Total mana value 2 of at most 2.");
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[ring]!.zone === "battlefield");
  expect([ring, bauble, stone, vat].map((id) => after.objects[id]!.zone)).toEqual(["battlefield", "battlefield", "graveyard", "battlefield"]);
  expect([signet, solemn].map((id) => after.objects[id]!.zone)).toEqual(["library", "library"]);
  expect(pageErrors(page)).toEqual([]);
});
