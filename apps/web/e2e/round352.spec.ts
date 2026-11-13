// Round 352's prompts: Nethergoyf's escape cost (cards with four or more card types among them, Done only once they have
// them), Winter, Cynical Opportunist's end step exile and its pick of a permanent card among them, Ob Nixilis, the
// Adversary's casualty X, and Panoptic Mirror's imprint for X and its upkeep pick of the card to copy.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil, seat } from "./ui";

test("Nethergoyf: escape from your graveyard, clicking cards until they have four card types among them", async ({ page }) => {
  const s = scene({ board: LANDS, yard: ["Nethergoyf", "Lightning Bolt", "Sol Ring", "Grizzly Bears", "Divination"] });
  const [goyf, bolt, ring, bears, div] = [one(s, "Nethergoyf"), one(s, "Lightning Bolt"), one(s, "Sol Ring"), one(s, "Grizzly Bears"), one(s, "Divination")];
  await open(page, s);
  await seat(page, 0).locator(".zone", { hasText: "Graveyard" }).click();
  await modal(page).locator(`.card.playable`).click();
  await menu(page).getByRole("button", { name: /^Escape/ }).click();
  const pick = modal(page);
  await expect(pick).toContainText("Nethergoyf: exile any number of other cards from your graveyard with 4 or more card types among them");
  await expect(pick.locator(`[data-pick="${goyf}"]`)).toHaveCount(0);
  for (const id of [bolt, ring, bears]) await pick.locator(`[data-pick="${id}"]`).click();
  // An instant, an artifact and a creature: three card types, not enough.
  await expect(pick.getByRole("button", { name: "Done" })).toBeDisabled();
  await pick.locator(`[data-pick="${div}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[goyf]!.zone === "battlefield");
  for (const id of [bolt, ring, bears, div]) expect(after.objects[id]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});

test("Winter, Cynical Opportunist: at your end step exile four card types, then put Grizzly Bears onto the battlefield with a finality counter", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Winter, Cynical Opportunist"], yard: ["Lightning Bolt", "Sol Ring", "Grizzly Bears", "Divination"] }, [], { step: "main2" });
  const [bolt, ring, bears, div] = [one(s, "Lightning Bolt"), one(s, "Sol Ring"), one(s, "Grizzly Bears"), one(s, "Divination")];
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0 && !!st.pending.cardTypes);
  const pick = modal(page);
  await expect(pick).toContainText("Winter, Cynical Opportunist: you may exile any number of cards with 4 or more card types among them from your graveyard");
  for (const id of [bolt, ring, bears]) await pick.locator(`[data-pick="${id}"]`).click();
  await expect(pick).toContainText("with 3 card types among them");
  await expect(pick.getByRole("button", { name: "Done" })).toBeDisabled();
  await pick.locator(`[data-pick="${div}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0 && !st.pending.cardTypes);
  const put = modal(page);
  await expect(put).toContainText("to put onto the battlefield with a finality counter on it");
  await expect(put.locator(`[data-pick="${bolt}"]`)).toHaveClass(/dim/);
  await put.locator(`[data-pick="${bears}"]`).click();
  await put.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[bears]!.counters.finality).toBe(1);
  for (const id of [bolt, ring, div]) expect(after.objects[id]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});

test("Ob Nixilis, the Adversary: casualty X with Serra Angel; the nonlegendary copy has 4 loyalty", async ({ page }) => {
  const s = scene({ hand: ["Ob Nixilis, the Adversary"], board: [...LANDS, "Serra Angel"] });
  const [ob, angel] = [one(s, "Ob Nixilis, the Adversary"), one(s, "Serra Angel")];
  await open(page, s);
  await card(page, "Ob Nixilis, the Adversary", s).click();
  const bar = page.locator(".targeting", { hasText: "casualty X: you may sacrifice a creature to copy it; X is its power" });
  await expect(bar).toBeVisible();
  await page.locator(`[data-obj="${angel}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice and cast" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[ob]!.zone === "battlefield" && st.battlefield.some((id) => st.objects[id]!.isToken && st.cards[st.objects[id]!.cardId]!.name === "Ob Nixilis, the Adversary"));
  const token = after.battlefield.map((id) => after.objects[id]!).find((o) => o.isToken && after.cards[o.cardId]!.name === "Ob Nixilis, the Adversary")!;
  expect(token.counters.loyalty).toBe(4);
  expect(after.cards[token.cardId]!.supertypes).not.toContain("Legendary");
  expect(after.objects[ob]!.counters.loyalty).toBe(3);
  expect(after.objects[angel]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Panoptic Mirror: X = 1 imprints Lightning Bolt from your hand", async ({ page }) => {
  const s = scene({ hand: ["Lightning Bolt", "Divination"], board: [...LANDS, "Panoptic Mirror"] });
  const [mirror, bolt, div] = [one(s, "Panoptic Mirror"), one(s, "Lightning Bolt"), one(s, "Divination")];
  await open(page, s);
  await page.locator(`[data-obj="${mirror}"]`).click();
  await menu(page).getByRole("button", { name: /You may exile an instant or sorcery card with mana value X from your hand/ }).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("1");
  await x.getByRole("button", { name: "X = 1" }).click();
  const asked = await resolveUntil(page, (st) => (st.pending?.kind === "chooseMay" || st.pending?.kind === "searchLibrary") && st.pending.player === 0);
  if (asked.pending?.kind === "chooseMay") {
    await controls(page).getByRole("button", { name: "Yes" }).click();
    await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  }
  const pick = modal(page);
  await expect(pick.locator(`[data-pick="${div}"]`)).toHaveClass(/dim/);
  await pick.locator(`[data-pick="${bolt}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "exile");
  expect(after.linkedExile?.[`${mirror}@0`]?.map((l) => l.id)).toEqual([bolt]);
  expect(after.objects[div]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Panoptic Mirror: at your upkeep pick Lightning Bolt of its two cards, cast the copy free at Ana", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Panoptic Mirror"], exile: ["Lightning Bolt", "Divination"] });
  const [mirror, bolt, div] = [one(s0, "Panoptic Mirror"), one(s0, "Lightning Bolt"), one(s0, "Divination")];
  s0.linkedExile = { [`${mirror}@0`]: [bolt, div].map((id) => ({ id, zc: s0.objects[id]!.zoneChanges ?? 0 })) };
  const turn = s0.turn;
  const s = playUntil(s0, (st) => st.turn > turn && st.activePlayer === 0 && st.step === "upkeep");
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await expect(pick).toContainText("to copy (you may cast the copy without paying its mana cost)");
  await pick.locator(`[data-pick="${bolt}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  await expect(controls(page)).toContainText("cast Lightning Bolt without paying its mana cost?");
  await controls(page).getByRole("button", { name: "Cast it" }).click();
  await clickPlayer(page, 1);
  const life = s.players[1]!.life;
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life === life - 3);
  expect(after.objects[bolt]!.zone).toBe("exile");
  expect(after.objects[div]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});
