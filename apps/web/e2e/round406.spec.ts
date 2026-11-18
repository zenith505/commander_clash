// Round 406 in the browser: Lazav, Dimir Mastermind's "you may" copy of a creature card put into an opponent's graveyard,
// Quintorius, Loremaster's ability on a card exiled with it and that card cast for free, and Maralen, Fae Ascendant's free
// cast from among the cards it exiled this turn.
import { expect, test } from "@playwright/test";
import { characteristics, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil, seat } from "./ui";

const ch = (s: GameState, id: string) => characteristics(s, s.objects[id]!);

test("Lazav, Dimir Mastermind: Murder on Ana's Serra Angel, and Lazav becomes a copy of it, still Lazav", async ({ page }) => {
  const s = scene({ hand: ["Murder"], board: [...LANDS, "Lazav, Dimir Mastermind"] }, [{ board: ["Serra Angel"] }]);
  const [lazav, angel] = [one(s, "Lazav, Dimir Mastermind"), one(s, "Serra Angel")];
  await open(page, s);
  await card(page, "Murder", s).click();
  await page.locator(`[data-obj="${angel}"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("become a copy of that card");
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && !!st.objects[lazav]!.copyEffects?.length);
  expect(after.objects[angel]!.zone).toBe("graveyard");
  expect(ch(after, lazav).name).toBe("Lazav, Dimir Mastermind");
  expect(ch(after, lazav).subtypes).toEqual(["Angel"]);
  await expect(page.locator(`[data-obj="${lazav}"]`).first()).toContainText("4/4");
  expect(pageErrors(page)).toEqual([]);
});

test("Quintorius, Loremaster: sacrificing a Spirit, you choose the Lightning Bolt exiled with it and cast it for free; it goes to the bottom of your library", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Quintorius, Loremaster", "Kami of Ancient Law"], exile: ["Lightning Bolt"] });
  const [q, kami, bolt] = [one(s, "Quintorius, Loremaster"), one(s, "Kami of Ancient Law"), one(s, "Lightning Bolt")];
  // As its end step trigger left things: the Bolt exiled with it.
  s.linkedExile = { ...s.linkedExile, [`${q}@${s.objects[q]!.zoneChanges ?? 0}`]: [{ id: bolt, zc: s.objects[bolt]!.zoneChanges ?? 0 }] };
  await open(page, s);
  await card(page, "Quintorius, Loremaster", s).click();
  await menu(page).getByRole("button", { name: /Sacrifice a Spirit/ }).click();
  await expect(page.locator(".targeting")).toContainText("choose target card exiled with Quintorius, Loremaster");
  await modal(page).locator(`[data-pick="${bolt}"]`).click();
  // The Spirit to sacrifice.
  await page.locator(`[data-obj="${kami}"]`).first().click();
  await page.getByRole("button", { name: "Sacrifice and activate" }).click();
  const granted = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && !!st.objects[bolt]!.mayPlay);
  expect(granted.objects[kami]!.zone).toBe("graveyard");
  expect(granted.objects[q]!.tapped).toBe(true);
  await seat(page, 0).locator(".zone", { hasText: "Exile" }).click();
  await modal(page).locator(".card.playable", { hasText: "Lightning Bolt" }).click();
  const untapped = granted.battlefield.filter((id) => !granted.objects[id]!.tapped).length;
  await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "library");
  expect(after.players[1]!.life).toBe(37);
  expect(after.players[0]!.library.at(-1)).toBe(bolt);
  // Nothing paid for it.
  expect(after.battlefield.filter((id) => !after.objects[id]!.tapped).length).toBe(untapped);
  expect(pageErrors(page)).toEqual([]);
});

test("Maralen, Fae Ascendant: Llanowar Elves enters, Maralen exiles Ana's top two cards, and you cast her Grizzly Bears for free", async ({ page }) => {
  const s = scene({ hand: ["Llanowar Elves"], board: [...LANDS, "Maralen, Fae Ascendant"] }, [{ library: ["Grizzly Bears", "Divination"] }]);
  const [bears, div] = [one(s, "Grizzly Bears"), one(s, "Divination")];
  await open(page, s);
  await card(page, "Llanowar Elves", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseTargets" && st.pending.player === 0);
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "exile" && st.objects[div]!.zone === "exile");
  await seat(page, 1).locator(".zone", { hasText: "Exile" }).click();
  // Two Elves and Faeries: the Bears (mana value 2) can be cast, Divination (3) can't.
  await expect(modal(page).locator(".card.playable")).toHaveCount(1);
  await modal(page).locator(".card.playable", { hasText: "Grizzly Bears" }).click();
  await menu(page).getByRole("button", { name: "Cast it: without paying its mana cost" }).click();
  const after = await resolveUntil(page, (st) => st.objects[bears]!.zone === "battlefield" && st.stack.length === 0);
  expect(after.objects[bears]!.controller).toBe(0);
  expect(after.objects[div]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});
