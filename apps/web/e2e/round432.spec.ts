// Round 432: The Fourteenth Doctor (its cast trigger mills the Doctors off your top fourteen cards; it enters as a copy of
// Sickbay Orderly with haste and attacks), Lara Croft, Tomb Raider (attacking, she exiles Ana's Mox Amber or your Gaea's
// Cradle with a discovery counter, and you play it from exile) and Jacob Hauken, Inspector (exile Divination from your hand
// face down, pay {4}{U}{U} to transform, then cast Divination from exile for free with Hauken's Insight).
import { expect, test } from "@playwright/test";
import type { GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, scene } from "./scene";
import { attack, card, controls, menu, modal, passTo, resolveUntil, seat } from "./ui";

test("The Fourteenth Doctor: the Doctors revealed go to your graveyard, it enters as Sickbay Orderly with haste and attacks", async ({ page }) => {
  const s = scene({ hand: ["The Fourteenth Doctor"], board: LANDS, library: ["Sickbay Orderly", "Divination", "Emergency Medical Hologram"] });
  const doc = one(s, "The Fourteenth Doctor");
  const [orderly, holo, div] = ["Sickbay Orderly", "Emergency Medical Hologram", "Divination"].map((n) => idsOf(s, n, "library", 0)[0]!);
  await open(page, s);
  await card(page, "The Fourteenth Doctor", s).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "copy" && st.pending.player === 0);
  expect([orderly, holo, div].map((id) => asked.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "library"]);
  const bar = controls(page);
  // Divination isn't a Doctor: not offered.
  await expect(bar.getByRole("button", { name: "Divination" })).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "Emergency Medical Hologram" })).toHaveCount(1);
  await bar.getByRole("button", { name: "Sickbay Orderly" }).click();
  const entered = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[doc]!.zone === "battlefield");
  expect(entered.log.some((l) => /enters as a copy of Sickbay Orderly/.test(l.text))).toBe(true);
  // Haste: it attacks this turn, and its lifelink gains you 3.
  const [life, theirs] = [entered.players[0]!.life, entered.players[1]!.life];
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0, 60);
  await attack(page, [[doc, 1]]);
  const after = await resolveUntil(page, (st) => st.players[1]!.life === theirs - 3, 60);
  expect(after.players[0]!.life).toBe(life + 3);
  expect(pageErrors(page)).toEqual([]);
});

/** Lara Croft on your battlefield, there since the turn began, with Mox Amber and Sol Ring in Ana's graveyard. */
const laraScene = (): GameState => {
  const s = scene({ board: [...LANDS, "Lara Croft, Tomb Raider"], yard: ["Gaea's Cradle"] }, [{ yard: ["Mox Amber", "Sol Ring"] }]);
  s.objects[one(s, "Lara Croft, Tomb Raider")]!.controlledSinceTurn = -1;
  return s;
};

test("Lara Croft, Tomb Raider: attacking, she exiles Ana's Mox Amber with a discovery counter, and you cast it from Ana's exile", async ({ page }) => {
  const s = laraScene();
  const [lara, mox, ring] = [one(s, "Lara Croft, Tomb Raider"), one(s, "Mox Amber"), one(s, "Sol Ring")];
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0, 60);
  await attack(page, [[lara, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  // Sol Ring isn't legendary: not offered.
  await expect(modal(page).locator(`[data-pick="${ring}"]`)).toHaveCount(0);
  await modal(page).locator(`[data-pick="${mox}"]`).click();
  const exiled = await resolveUntil(page, (st) => st.objects[mox]!.zone === "exile" && st.stack.length === 0);
  expect(exiled.objects[mox]!.counters.discovery).toBe(1);
  await passTo(page, "main2");
  const exile = seat(page, 1).locator(".zone", { hasText: "Exile" });
  await exile.click();
  await expect(modal(page)).toContainText("Ana's exile");
  await modal(page).locator(".card.playable").first().click();
  if (await menu(page).isVisible()) await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[mox]!.zone === "battlefield");
  expect(after.objects[mox]!.controller).toBe(0);
  expect(after.objects[ring]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Lara Croft, Tomb Raider: she exiles your Gaea's Cradle, and you play it from exile as your land for the turn", async ({ page }) => {
  const s = laraScene();
  const [lara, cradle] = [one(s, "Lara Croft, Tomb Raider"), one(s, "Gaea's Cradle")];
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0, 60);
  await attack(page, [[lara, 1]]);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await modal(page).locator(`[data-pick="${cradle}"]`).click();
  await resolveUntil(page, (st) => st.objects[cradle]!.zone === "exile" && st.stack.length === 0);
  const before = await passTo(page, "main2");
  const lands = before.players[0]!.landsPlayedThisTurn;
  const exile = seat(page, 0).locator(".zone", { hasText: "Exile" });
  await exile.click();
  await modal(page).locator(".card.playable").first().click();
  if (await menu(page).isVisible()) await menu(page).getByRole("button", { name: /^Play/ }).first().click();
  const after = await resolveUntil(page, (st) => st.objects[cradle]!.zone === "battlefield");
  expect(after.players[0]!.landsPlayedThisTurn).toBe(lands + 1);
  expect(pageErrors(page)).toEqual([]);
});

test("Jacob Hauken, Inspector: exile Divination face down, pay {4}{U}{U} to transform, then cast it free with Hauken's Insight", async ({ page }) => {
  const s = scene({ hand: ["Divination"], board: [...LANDS, "Jacob Hauken, Inspector // Hauken's Insight"] });
  const [jacob, div] = [one(s, "Jacob Hauken, Inspector"), one(s, "Divination")];
  await open(page, s);
  await page.locator(`[data-obj="${jacob}"]`).first().click();
  const item = menu(page).locator("button", { hasText: "Draw" });
  if (await item.count()) await item.first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  await modal(page).locator(`[data-pick="${div}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Pay 4UU. If you do, transform Jacob Hauken, Inspector?");
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  const turned = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[jacob]!.face === 1);
  expect(turned.objects[div]!.zone).toBe("exile");
  expect(turned.objects[div]!.hiddenExile?.seen).toEqual([0]);
  const hand = turned.players[0]!.hand.length;
  const untapped = turned.battlefield.filter((id) => turned.objects[id]!.controller === 0 && !turned.objects[id]!.tapped).length;
  // Your exile shows the face-down Divination you may cast.
  const exile = seat(page, 0).locator(".zone", { hasText: "Exile" });
  await exile.click();
  await modal(page).locator(".card.playable").first().click();
  // Only for free: its mana cost can't be paid for it.
  await expect(menu(page).getByRole("button", { name: /^Cast it 2/ })).toBeDisabled();
  await menu(page).getByRole("button", { name: "Cast it: without paying its mana cost" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[div]!.zone === "graveyard");
  expect(after.players[0]!.hand.length).toBe(hand + 2);
  // Without paying its mana cost: no land tapped.
  expect(after.battlefield.filter((id) => after.objects[id]!.controller === 0 && !after.objects[id]!.tapped).length).toBe(untapped);
  expect(pageErrors(page)).toEqual([]);
});
