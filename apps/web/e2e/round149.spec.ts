// Round 149's prompts: Compulsive Research's "discards two cards unless they discard a land card" (a filtered
// discard); Subtlety's trigger targeting a creature spell, whose owner chooses the top or bottom of their library;
// Realmbreaker putting a land card from an opponent's graveyard onto the battlefield; Highway Robbery's "discard a card
// or sacrifice a land"; Consuming Tide's choice of a nonland permanent to keep; Chandra, Hope's Beacon's +1 casting
// an instant from among the exiled cards.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene, state } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil, seat } from "./ui";

test("Compulsive Research: you draw three, then discard a land card instead of two cards", async ({ page }) => {
  const s = scene({ hand: ["Compulsive Research", "Grizzly Bears", "Shock"], board: LANDS });
  const [bears, shock] = [one(s, "Grizzly Bears"), one(s, "Shock")];
  await open(page, s);
  await card(page, "Compulsive Research", s).click();
  await clickPlayer(page, 0);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "punisher");
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "Discard 2 cards" })).toBeVisible();
  await bar.getByRole("button", { name: "Discard a land card" }).click();
  const st = await resolveUntil(page, (x) => x.pending?.kind === "discard");
  await expect(bar).toContainText("land card");
  // The last card drawn, on top of the fan.
  const land = st.players[0]!.hand.at(-1)!;
  expect([bears, shock]).not.toContain(land);
  await page.locator(`[data-obj="${land}"]`).click();
  await bar.getByRole("button", { name: "Discard" }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending);
  expect(after.objects[land]!.zone).toBe("graveyard");
  expect(after.objects[bears]!.zone).toBe("hand");
  expect(after.objects[shock]!.zone).toBe("hand");
  expect(after.players[0]!.hand).toHaveLength(4);
  expect(pageErrors(page)).toEqual([]);
});

test("Subtlety: flashed in over your own Hill Giant spell, its trigger targets the Giant; you put it on the bottom", async ({ page }) => {
  const s = scene({ hand: ["Hill Giant", "Subtlety"], board: LANDS });
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Hill Giant", s).click();
  await expect.poll(async () => (await state(page)).stack.length).toBe(1);
  await card(page, "Subtlety", s).click();
  if (await menu(page).isVisible()) await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  const st = await resolveUntil(page, (x) => x.pending?.kind === "chooseTargets");
  const top = st.stack.find((x) => x.objectId === giant)!.id;
  await page.locator(`[data-stack="${top}"]`).click();
  await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "topOrBottom");
  const bar = controls(page);
  await expect(bar).toContainText("put Hill Giant on the top or bottom of your library?");
  await bar.getByRole("button", { name: "Bottom" }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending);
  expect(after.objects[giant]!.zone).toBe("library");
  expect(after.players[0]!.library.at(-1)).toBe(giant);
  expect(after.objects[one(s, "Subtlety")]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("Realmbreaker: Ana mills three; you put one of her land cards onto the battlefield tapped under your control", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Realmbreaker, the Invasion Tree"] }, [{ library: ["Forest", "Island", "Swamp"] }]);
  const realm = one(s, "Realmbreaker, the Invasion Tree");
  await open(page, s);
  await page.locator(`[data-obj="${realm}"]`).click();
  await menu(page).getByRole("button", { name: /mills three/ }).click();
  await clickPlayer(page, 1);
  const st = await resolveUntil(page, (x) => x.pending?.kind === "searchLibrary" && x.pending.player === 0);
  await expect(modal(page)).toContainText("a land card in Ana's graveyard");
  const pick = st.pending?.kind === "searchLibrary" ? st.pending.cards[0]! : "";
  await modal(page).locator(`[data-pick="${pick}"]`).click();
  await modal(page).getByRole("button", { name: /^Choose|^Done|^Find/ }).first().click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending);
  expect(after.objects[pick]).toMatchObject({ zone: "battlefield", tapped: true });
  expect(after.battlefield.includes(pick)).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Highway Robbery: yes, sacrifice a land, then draw two", async ({ page }) => {
  const s = scene({ hand: ["Highway Robbery", "Shock"], board: LANDS });
  const shock = one(s, "Shock");
  await open(page, s);
  await card(page, "Highway Robbery", s).click();
  if (await menu(page).isVisible()) await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await bar.getByRole("button", { name: "Yes" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "either");
  await expect(bar.getByRole("button", { name: "Discard a card" })).toBeVisible();
  await bar.getByRole("button", { name: "Sacrifice a land" }).click();
  const st = await resolveUntil(page, (x) => x.pending?.kind === "pickPermanents");
  const land = st.pending?.kind === "pickPermanents" ? st.pending.options[0]! : "";
  await page.locator(`[data-obj="${land}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice" }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending);
  expect(after.objects[land]!.zone).toBe("graveyard");
  expect(after.objects[shock]!.zone).toBe("hand");
  expect(after.players[0]!.hand).toHaveLength(3);
  expect(pageErrors(page)).toEqual([]);
});

test("Consuming Tide: keep Sol Ring; your Grizzly Bears and Ana's other permanent return to their owners' hands", async ({ page }) => {
  const s = scene({ hand: ["Consuming Tide"], board: [...LANDS, "Grizzly Bears", "Sol Ring"] }, [{ board: ["Hill Giant", "Llanowar Elves"], hand: ["Forest"] }]);
  const [bears, ring, giant, elves] = [one(s, "Grizzly Bears"), one(s, "Sol Ring"), one(s, "Hill Giant"), one(s, "Llanowar Elves")];
  await open(page, s);
  await card(page, "Consuming Tide", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("The rest are returned to their owners' hands.");
  await page.locator(`[data-obj="${ring}"]`).click();
  await bar.getByRole("button", { name: "Keep 1" }).click();
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending);
  expect(after.objects[ring]!.zone).toBe("battlefield");
  expect(after.objects[bears]!.zone).toBe("hand");
  // Ana kept one of hers.
  expect([after.objects[giant]!.zone, after.objects[elves]!.zone].sort()).toEqual(["battlefield", "hand"]);
  // Ana has more cards in hand than you (two against one): you draw one.
  expect(after.players[0]!.hand).toHaveLength(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Chandra, Hope's Beacon: +1 exiles five; you cast Lightning Bolt from among them (copied), but not Hill Giant", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Chandra, Hope's Beacon"], library: ["Lightning Bolt", "Hill Giant", "Forest", "Forest", "Forest"] });
  const [chandra, bolt, giant] = [one(s, "Chandra, Hope's Beacon"), one(s, "Lightning Bolt"), one(s, "Hill Giant")];
  await open(page, s);
  await page.locator(`[data-obj="${chandra}"]`).click();
  await menu(page).getByRole("button", { name: /^\+1/ }).click();
  await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.objects[bolt]!.zone === "exile");
  await seat(page, 0).locator(".zone", { hasText: "Exile" }).click();
  // Only the instant can be cast: not Hill Giant, nor the Forests played.
  await expect(modal(page).locator(".card.playable")).toHaveCount(1);
  await modal(page).locator(".card.playable", { hasText: "Lightning Bolt" }).click();
  if (await menu(page).isVisible()) await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  await clickPlayer(page, 1);
  // Chandra's first ability copies it: the copy at Ben.
  await resolveUntil(page, (x) => x.pending?.kind === "copyTargets");
  await clickPlayer(page, 2);
  const after = await resolveUntil(page, (x) => x.stack.length === 0 && !x.pending && x.objects[bolt]!.zone === "graveyard");
  expect([after.players[1]!.life, after.players[2]!.life]).toEqual([37, 37]);
  expect(after.objects[giant]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});
