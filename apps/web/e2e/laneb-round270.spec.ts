// Lane B round B270 in the browser: Draugr Necromancer (Ana's Hill Giant exiled with an ice counter instead of dying, then
// cast from her exile with snow Islands' blue mana as red), Spellweaver Helix (casting Lava Axe offers a free copy of the
// imprinted Divination), Abstract Performance (you cast it: Ana bins a pile and you cast from the other; Ana casts it:
// you choose which pile goes into her graveyard).
import { expect, test } from "@playwright/test";
import { applyAction, planCast, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil, seat } from "./ui";

test("Draugr Necromancer: Doom Blade exiles Ana's Hill Giant with an ice counter; cast it from her exile with snow Islands", async ({ page }) => {
  const s = scene({ hand: ["Doom Blade"], board: ["Draugr Necromancer", "Swamp", "Swamp", "Snow-Covered Island", "Snow-Covered Island", "Snow-Covered Island", "Snow-Covered Island"] }, [{ board: ["Hill Giant"] }]);
  const giant = one(s, "Hill Giant");
  await open(page, s);
  await card(page, "Doom Blade", s).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  const exiled = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "exile");
  expect(exiled.objects[giant]!.counters.ice).toBe(1);
  expect(exiled.players[1]!.exile).toContain(giant);
  const theirs = seat(page, 1).locator(".zone", { hasText: "Exile" });
  await expect(theirs.locator(".zone-title")).toHaveText("Exile ✦");
  await theirs.click();
  await modal(page).locator(".card.playable", { hasText: "Hill Giant" }).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast/ }).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "battlefield");
  expect(after.objects[giant]!.controller).toBe(0);
  expect(after.log.some((l) => /You casts? Hill Giant/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Spellweaver Helix: casting Lava Axe at Ana offers a free copy of the imprinted Divination; cast it and draw two", async ({ page }) => {
  const s: GameState = scene({ hand: ["Lava Axe"], board: [...LANDS, "Spellweaver Helix"] }, [{ exile: ["Lava Axe", "Divination"] }]);
  const helix = one(s, "Spellweaver Helix");
  const imprinted = s.players[1]!.exile.map((id) => ({ id, zc: s.objects[id]!.zoneChanges ?? 0 }));
  s.linkedExile = { ...(s.linkedExile ?? {}), [`${helix}@${s.objects[helix]!.zoneChanges ?? 0}`]: imprinted };
  const axe = s.players[0]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Lava Axe")!;
  await open(page, s);
  const hand = s.players[0]!.hand.length;
  await page.locator(`[data-obj="${axe}"]`).first().click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0);
  await expect(controls(page)).toContainText("cast Divination without paying its mana cost?");
  await controls(page).getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life === 35);
  // Lava Axe left the hand, the copy's two cards came in; the imprinted cards stay exiled.
  expect(after.players[0]!.hand.length).toBe(hand - 1 + 2);
  for (const { id } of imprinted) expect(after.objects[id]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});

const EIGHT = ["Hill Giant", "Grizzly Bears", "Forest", "Divination", "Grizzly Bears", "Lightning Bolt", "Plains", "Wind Drake"];

test("Abstract Performance: choose Ana; she bins one pile, and you cast Grizzly Bears from the other free and take the rest", async ({ page }) => {
  const s = scene({ hand: ["Abstract Performance"], board: LANDS, library: EIGHT });
  const top = s.players[0]!.library.slice(0, 8);
  await open(page, s);
  await card(page, "Abstract Performance", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "opponent" && st.pending.player === 0);
  await expect(controls(page)).toContainText("choose an opponent to choose a pile for your graveyard");
  await controls(page).getByRole("button", { name: "Ana", exact: true }).click();
  const offer = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && st.pending.player === 0);
  const binned = top.slice(0, 4).every((id) => offer.objects[id]!.zone === "graveyard") ? top.slice(0, 4) : top.slice(4);
  const kept = top.filter((id) => !binned.includes(id));
  for (const id of binned) expect(offer.objects[id]!.zone).toBe("graveyard");
  const bears = kept.find((id) => offer.cards[offer.objects[id]!.cardId]!.name === "Grizzly Bears")!;
  const bar = controls(page);
  await bar.getByRole("button", { name: "Grizzly Bears" }).click();
  await bar.getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  for (const id of kept.filter((id) => id !== bears)) expect(after.objects[id]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Ana's Abstract Performance: you put her face-down pile into her graveyard", async ({ page }) => {
  let s: GameState = scene({ board: LANDS }, [{ hand: ["Abstract Performance"], board: LANDS, library: ["Plains", ...EIGHT] }]);
  const spell = one(s, "Abstract Performance");
  s = playUntil(s, (x) => x.activePlayer === 1 && x.step === "main1" && !x.pending && x.stack.length === 0);
  for (const a of planCast(s, 1, spell)!) s = applyAction(s, a);
  s = playUntil(s, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "opponent" && x.pending.player === 1);
  s = applyAction(s, { type: "chooseOption", player: 1, choice: "0" });
  s = playUntil(s, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "pile" && x.pending.player === 0);
  const piles = s.pending?.kind === "chooseOption" ? s.pending.piles! : [[], []];
  await open(page, s);
  const pick = modal(page);
  await expect(pick).toContainText("Abstract Performance: choose the pile to put into Ana's graveyard");
  await expect(pick).toContainText("Face-down pile (4 cards)");
  await expect(pick).toContainText("Face-up pile (4 cards)");
  await pick.getByRole("button", { name: "Put the face-down pile into Ana's graveyard" }).click();
  const after = await resolveUntil(page, (x) => piles[0]!.every((id) => x.objects[id]!.zone === "graveyard") && x.stack.length === 0 && !x.pending);
  // Ana took the face-up pile (cast one of them free or put them all into her hand).
  for (const id of piles[1]!) expect(["hand", "battlefield", "graveyard", "stack"]).toContain(after.objects[id]!.zone);
  expect(after.log.some((l) => /You chooses face-down pile|You choose face-down pile/i.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
