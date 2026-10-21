// Round 97's prompts: Omniscience's "Cast it: without paying its mana cost" on a card in your hand, Mizzix's Mastery's
// copy of an instant from your graveyard, cast free as it resolves (pick it, Cast it, then its target), and Krav's
// "Sacrifice X creatures": choose X, the target, then the creatures to sacrifice.
import { expect, test } from "@playwright/test";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
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

test("Krav, the Unredeemed: choose X = 2, target yourself, sacrifice two creatures", async ({ page }) => {
  const s = scene({ board: ["Krav, the Unredeemed", "Grizzly Bears", "Grizzly Bears", "Hill Giant", "Swamp"] });
  const krav = one(s, "Krav, the Unredeemed");
  const bears = idsOf(s, "Grizzly Bears", "battlefield", 0);
  await open(page, s);
  const hand = s.players[0]!.hand.length;
  await card(page, "Krav, the Unredeemed", s).click();
  await menu(page).locator("button", { hasText: "Sacrifice X creatures" }).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("and sacrifice X creatures: choose X (up to 4)");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  await clickPlayer(page, 0);
  const bar = page.locator(".targeting", { hasText: "sacrifice 2 creatures" });
  await page.locator(`[data-obj="${bears[0]}"]`).click();
  await page.locator(`[data-obj="${bears[1]}"]`).click();
  await bar.getByRole("button", { name: /^Sacrifice/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[krav]!.counters["+1/+1"] === 2);
  expect(bears.map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
  expect(after.players[0]!.hand.length).toBe(hand + 2);
  expect(after.players[0]!.life).toBe(42);
  expect(pageErrors(page)).toEqual([]);
});
