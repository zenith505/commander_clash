// Round 431: The Face of Boe (tap it: Rift Bolt cast from your hand for its suspend cost {R}), Skyway Robber (escaped, its
// combat damage lets you cast the Lightning Bolt its escape exiled, free) and Hama, the Bloodbender (Ana mills three, you
// exile her Divination and cast it from her exile by waterbending {3}).
import { expect, test } from "@playwright/test";
import { applyAction, planCast, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playWithBots, scene } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil, seat } from "./ui";

test("The Face of Boe: tap it, pick Rift Bolt, and cast it at Ana for its suspend cost {R}", async ({ page }) => {
  const s = scene({ hand: ["Rift Bolt", "Grizzly Bears"], board: [...LANDS, "The Face of Boe"] });
  const [boe, bolt] = [one(s, "The Face of Boe"), one(s, "Rift Bolt")];
  const life = s.players[1]!.life;
  await open(page, s);
  await page.locator(`[data-obj="${boe}"]`).first().click();
  const item = menu(page).locator("button", { hasText: "suspend" });
  if (await item.count()) await item.first().click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && st.pending.player === 0);
  expect(asked.objects[boe]!.tapped).toBe(true);
  const bar = controls(page);
  await expect(bar).toContainText("cast a spell from your hand by paying its suspend cost rather than paying its mana cost?");
  // Grizzly Bears has no suspend: not offered.
  await expect(bar.getByRole("button", { name: "Grizzly Bears" })).toHaveCount(0);
  await bar.getByRole("button", { name: "Rift Bolt" }).click();
  await expect(bar).toContainText("cast Rift Bolt from your hand by paying its suspend cost {R} rather than paying its mana cost?");
  const before = await resolveUntil(page, (st) => st.pending?.kind === "castFree");
  const untapped = before.battlefield.filter((id) => before.objects[id]!.controller === 0 && !before.objects[id]!.tapped).length;
  await bar.getByRole("button", { name: "Cast it" }).click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "graveyard");
  expect(after.players[1]!.life).toBe(life - 3);
  // One land for {R}, not three for {2}{R}.
  expect(after.battlefield.filter((id) => after.objects[id]!.controller === 0 && !after.objects[id]!.tapped).length).toBe(untapped - 1);
  expect(pageErrors(page)).toEqual([]);
});

test("Skyway Robber: escaped, it hits Ana and you cast the Lightning Bolt its escape exiled, free", async ({ page }) => {
  let s: GameState = scene({ board: LANDS, yard: ["Skyway Robber", "Lightning Bolt", "Sol Ring", "Divination", "Grizzly Bears", "Forest"] });
  const robber = one(s, "Skyway Robber");
  const [bolt, ring, div, bears, forest] = ["Lightning Bolt", "Sol Ring", "Divination", "Grizzly Bears", "Forest"].map((n) => idsOf(s, n, "graveyard", 0)[0]!);
  for (const a of planCast(s, 0, robber, undefined, undefined, undefined, undefined, { via: "escape", exileCards: [bolt!, ring!, div!, bears!, forest!] })!) s = applyAction(s, a);
  s = playWithBots(s, (st) => st.stack.length === 0 && st.objects[robber]!.zone === "battlefield");
  s.objects[robber]!.controlledSinceTurn = -1; // as if it had been there since the turn began
  s = playWithBots(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && st.pending.player === 0, [[robber, 1]]);
  const life = s.players[1]!.life;
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("cast a spell from among the exiled cards without paying its mana cost?");
  // The artifact, instant and sorcery cards are offered; Grizzly Bears and the Forest aren't.
  await expect(bar.getByRole("button", { name: "Grizzly Bears" })).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "Sol Ring" })).toHaveCount(1);
  await bar.getByRole("button", { name: "Lightning Bolt" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.objectId === bolt);
  const cast = bar.getByRole("button", { name: "Cast it" });
  if (await cast.count()) await cast.click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt!]!.zone === "graveyard");
  expect(after.players[1]!.life).toBe(life - 3);
  expect(after.objects[ring!]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});

test("Hama, the Bloodbender: Ana mills three, you exile her Divination and cast it from her exile by waterbending {3}", async ({ page }) => {
  const s = scene({ hand: ["Hama, the Bloodbender"], board: LANDS }, [{ library: ["Divination", "Grizzly Bears", "Sol Ring"] }]);
  const hama = one(s, "Hama, the Bloodbender");
  const [div, bears] = [idsOf(s, "Divination", "library", 1)[0]!, idsOf(s, "Grizzly Bears", "library", 1)[0]!];
  await open(page, s);
  await card(page, "Hama, the Bloodbender", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.objects[hama]!.zone === "battlefield");
  await clickPlayer(page, 1);
  const pick = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  expect(pick.objects[bears]!.zone).toBe("graveyard");
  await expect(modal(page)).toContainText("Divination");
  await expect(modal(page).locator(`[data-pick="${bears}"]`)).toHaveCount(0);
  await modal(page).locator(`[data-pick="${div}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  const exiled = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[div]!.zone === "exile");
  expect(exiled.objects[div]!.mayPlay).toMatchObject({ player: 0, cost: "{3}", waterbend: true, yourTurnOnly: true });
  const hand = exiled.players[0]!.hand.length;
  // Ana's exile shows the card you may cast.
  const exile = seat(page, 1).locator(".zone", { hasText: "Exile" });
  await exile.click();
  await expect(modal(page)).toContainText("Ana's exile");
  await modal(page).locator(".card.playable").first().click();
  if (await menu(page).isVisible()) await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[div]!.zone === "graveyard");
  expect(after.players[0]!.hand.length).toBe(hand + 2);
  expect(after.log.some((l) => /casts Divination from exile/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Hama, the Bloodbender: with one Island untapped, Divination is cast from exile by tapping Hama and Grizzly Bears to waterbend", async ({ page }) => {
  let s: GameState = scene({ hand: ["Hama, the Bloodbender"], board: [...LANDS, "Grizzly Bears"] }, [{ library: ["Divination", "Sol Ring", "Forest"] }]);
  const [hama, bears] = [one(s, "Hama, the Bloodbender"), one(s, "Grizzly Bears")];
  const div = idsOf(s, "Divination", "library", 1)[0]!;
  for (const a of planCast(s, 0, hama)!) s = applyAction(s, a);
  s = playWithBots(s, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  s = applyAction(s, { type: "chooseTargets", player: 0, targets: [{ kind: "player", id: 1 }] });
  s = playWithBots(s, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  s = applyAction(s, { type: "searchLibrary", player: 0, found: [div] });
  s = playWithBots(s, (st) => st.stack.length === 0 && !st.pending && st.objects[div]!.zone === "exile");
  // Every land tapped but one Island.
  const island = idsOf(s, "Island", "battlefield", 0).find((id) => !s.objects[id]!.tapped)!;
  for (const id of s.battlefield) if (s.objects[id]!.controller === 0 && id !== island && id !== hama && id !== bears) s.objects[id]!.tapped = true;
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  const exile = seat(page, 1).locator(".zone", { hasText: "Exile" });
  await exile.click();
  await modal(page).locator(".card.playable").first().click();
  if (await menu(page).isVisible()) await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[div]!.zone === "graveyard");
  expect(after.players[0]!.hand.length).toBe(hand + 2);
  expect([island, hama, bears].map((id) => after.objects[id]!.tapped)).toEqual([true, true, true]);
  expect(after.log.some((l) => /taps .* to waterbend/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
