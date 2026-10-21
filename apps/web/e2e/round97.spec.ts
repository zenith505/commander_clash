// Round 97's prompts: Omniscience's "Cast it: without paying its mana cost" on a card in your hand, and Mizzix's
// Mastery's copy of an instant from your graveyard, cast free as it resolves (pick it, Cast it, then its target).
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

test("Omniscience: cast Colossal Dreadmaw from your hand without paying its mana cost", async ({ page }) => {
  const s = scene({ hand: ["Colossal Dreadmaw"], board: ["Omniscience", "Forest"] });
  const dreadmaw = one(s, "Colossal Dreadmaw");
  await open(page, s);
  await card(page, "Colossal Dreadmaw", s).click();
  await menu(page).getByRole("button", { name: "Cast it: without paying its mana cost" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[dreadmaw]!.zone === "battlefield");
  // The Forest stays untapped.
  expect(after.objects[one(s, "Forest")]!.tapped).toBe(false);
  expect(pageErrors(page)).toEqual([]);
});

test("Mizzix's Mastery: exile Lightning Bolt from your graveyard and cast a copy of it free", async ({ page }) => {
  const s = scene({ hand: ["Mizzix's Mastery"], board: LANDS, yard: ["Lightning Bolt"] });
  const bolt = one(s, "Lightning Bolt");
  await open(page, s);
  await card(page, "Mizzix's Mastery", s).click();
  await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  await expect(modal(page)).toContainText("choose target card that's an instant or sorcery from your graveyard");
  await modal(page).locator(`[data-pick="${bolt}"]`).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption");
  await expect(controls(page)).toContainText("cast a spell from among the exiled cards without paying its mana cost?");
  await controls(page).getByRole("button", { name: "Lightning Bolt" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree");
  await controls(page).getByRole("button", { name: "Cast it" }).click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.players[1]!.life === 37);
  expect(after.objects[bolt]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});
