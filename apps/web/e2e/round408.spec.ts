// Round 408 in the browser: Valki, God of Lies's picks from each opponent's revealed hand and its {X} copy (with two cards
// of that mana value, the one you pick), Abstruse Appropriation's exiled card cast with colorless mana for its white, and
// Tibalt, Cosmic Impostor cast as Valki's back face, its +2 and a card its emblem lets you cast.
import { expect, test } from "@playwright/test";
import { characteristics, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil, seat } from "./ui";

const ch = (s: GameState, id: string) => characteristics(s, s.objects[id]!);

test("Valki, God of Lies: a creature card from each opponent's hand, then {X} with X = 2 and you pick Kami of Ancient Law to copy", async ({ page }) => {
  const s = scene({ hand: ["Valki, God of Lies // Tibalt, Cosmic Impostor"], board: LANDS }, [{ hand: ["Serra Angel", "Lightning Bolt"] }, { hand: ["Grizzly Bears"] }, { hand: ["Kami of Ancient Law"] }]);
  const [valki, angel, bolt, bears, kami] = [one(s, "Valki, God of Lies"), one(s, "Serra Angel"), one(s, "Lightning Bolt"), one(s, "Grizzly Bears"), one(s, "Kami of Ancient Law")];
  await open(page, s);
  await card(page, "Valki, God of Lies", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast Valki|^Cast it/ }).first().click();
  // Ana, Ben, then Cy (CR 101.4): a creature card from each revealed hand.
  for (const [who, pick] of [["Ana", angel], ["Ben", bears], ["Cy", kami]] as const) {
    await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0 && st.pending.cards.includes(pick));
    const m = modal(page);
    await expect(m).toContainText(`${who}'s hand`);
    if (who === "Ana") await expect(m.locator(`[data-pick="${bolt}"]`)).toHaveClass(/dim/);
    await m.locator(`[data-pick="${pick}"]`).click();
    await m.getByRole("button", { name: "Done" }).click();
  }
  const exiled = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[kami]!.zone === "exile");
  expect([angel, bears, kami, bolt].map((id) => exiled.objects[id]!.zone)).toEqual(["exile", "exile", "exile", "hand"]);
  // {X}: X = 2, Grizzly Bears or Kami of Ancient Law.
  await card(page, "Valki, God of Lies", exiled).click();
  await menu(page).getByRole("button", { name: /Choose a creature card exiled with/ }).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "aegisCopy" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("mana value 2 exiled with");
  await bar.getByRole("button", { name: "Kami of Ancient Law" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && !!st.objects[valki]!.copyEffects?.length);
  expect(ch(after, valki).name).toBe("Kami of Ancient Law");
  await expect(page.locator(`[data-obj="${valki}"]`).first()).toContainText("2/2");
  expect(pageErrors(page)).toEqual([]);
});

test("Abstruse Appropriation: exile Ana's Serra Angel, then cast it from exile with Wastes paying its {W}{W}", async ({ page }) => {
  const s = scene({ hand: ["Abstruse Appropriation"], board: ["Plains", "Swamp", "Mountain", "Mountain", "Wastes", "Wastes", "Wastes", "Wastes", "Wastes"] }, [{ board: ["Serra Angel"] }]);
  const [aa, angel] = [one(s, "Abstruse Appropriation"), one(s, "Serra Angel")];
  await open(page, s);
  await card(page, "Abstruse Appropriation", s).click();
  await page.locator(`[data-obj="${angel}"]`).first().click();
  const exiled = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[angel]!.zone === "exile" && st.objects[aa]!.zone === "graveyard");
  // No white source left: only colorless mana can pay the Angel's {W}{W}.
  const untapped = exiled.battlefield.filter((id) => exiled.objects[id]!.controller === 0 && !exiled.objects[id]!.tapped).map((id) => exiled.cards[exiled.objects[id]!.cardId]!.name);
  expect(untapped).not.toContain("Plains");
  expect(untapped).toHaveLength(5);
  await seat(page, 1).locator(".zone", { hasText: "Exile" }).click();
  await modal(page).locator(".card.playable", { hasText: "Serra Angel" }).click();
  await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[angel]!.zone === "battlefield");
  expect(after.objects[angel]!.controller).toBe(0);
  expect(after.objects[angel]!.owner).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Tibalt, Cosmic Impostor: cast as Valki's back face, +2 exiles Ana's Lightning Bolt, and its emblem lets you cast it at Ana", async ({ page }) => {
  const s = scene({ hand: ["Valki, God of Lies // Tibalt, Cosmic Impostor"], board: LANDS }, [{ library: ["Lightning Bolt"] }]);
  const [valki, bolt] = [one(s, "Valki, God of Lies"), one(s, "Lightning Bolt")];
  await open(page, s);
  await card(page, "Valki, God of Lies", s).click();
  await menu(page).getByRole("button", { name: /^Cast Tibalt, Cosmic Impostor/ }).click();
  const entered = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[valki]!.zone === "battlefield");
  expect(ch(entered, valki).name).toBe("Tibalt, Cosmic Impostor");
  expect((entered.emblems ?? []).filter((id) => entered.objects[id]!.owner === 0)).toHaveLength(1);
  await page.locator(`[data-obj="${valki}"]`).first().click();
  await menu(page).getByRole("button", { name: /^\+2: Exile the top card of each player's library/ }).click();
  const top = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "exile");
  expect(top.objects[valki]!.counters.loyalty).toBe(7);
  await seat(page, 1).locator(".zone", { hasText: "Exile" }).click();
  await modal(page).locator(".card.playable", { hasText: "Lightning Bolt" }).click();
  await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "graveyard");
  expect(after.players[1]!.life).toBe(37);
  expect(pageErrors(page)).toEqual([]);
});
