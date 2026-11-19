// Lane B round B265 in the browser: Reversal of Fortune asks which instant or sorcery card in the opponent's hand to copy
// and cast; Phyrexian Portal's face-down piles (you separate them for an opponent, or exile one unseen and search the
// other); Raging River's "left" and "right" piles (you divide your creatures, or label your attackers).
import { expect, test } from "@playwright/test";
import { applyAction, planActivate, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

test("Reversal of Fortune: Ana reveals her hand; copy her Lightning Bolt and cast the copy at her for free", async ({ page }) => {
  const s = scene({ hand: ["Reversal of Fortune"], board: LANDS }, [{ hand: ["Lightning Bolt", "Grizzly Bears"] }]);
  const bolt = one(s, "Lightning Bolt");
  await open(page, s);
  await card(page, "Reversal of Fortune", s).click();
  await clickPlayer(page, 1);
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && st.pending.player === 0);
  // Only the instant: not the creature card.
  expect(asked.pending?.kind === "chooseOption" ? asked.pending.options : []).toEqual([bolt, "none"]);
  const bar = controls(page);
  await expect(bar).toContainText("cast a copy of an instant or sorcery card in Ana's hand without paying its mana cost?");
  await bar.getByRole("button", { name: "Lightning Bolt" }).click();
  await bar.getByRole("button", { name: "Cast it" }).click();
  await clickPlayer(page, 1);
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.life === 37);
  // The card stays in Ana's hand; the copy is gone (CR 704.5e).
  expect(after.objects[bolt]!.zone).toBe("hand");
  expect(after.players[1]!.hand).toContain(bolt);
  expect(Object.values(after.objects).some((o) => o.spellCopy)).toBe(false);
  expect(pageErrors(page)).toEqual([]);
});

test("Phyrexian Portal: Ana separates your top ten cards face down; exile pile 1 unseen, then take a card from the other", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Phyrexian Portal"] }, [{}]);
  const portal = one(s, "Phyrexian Portal");
  const top = s.players[0]!.library.slice(0, 10);
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await page.locator(`[data-obj="${portal}"]`).click();
  const m = menu(page);
  if (await m.count()) await m.locator("button", { hasText: "If your library has ten or more cards in it" }).click();
  await clickPlayer(page, 1);
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "pile" && st.pending.player === 0);
  const piles = asked.pending?.kind === "chooseOption" ? asked.pending.piles! : ([[], []] as string[][]);
  const pick = modal(page);
  await expect(pick).toContainText("Phyrexian Portal: choose a face-down pile to exile");
  // Both piles face down: card backs only, no faces.
  await expect(pick.locator(".card.back")).toHaveCount(10);
  await expect(pick.locator(".card.big:not(.back)")).toHaveCount(0);
  await pick.getByRole("button", { name: "Exile pile 1" }).click();
  const search = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const others = search.pending?.kind === "searchLibrary" ? search.pending.cards : [];
  expect([...others].sort()).toEqual([...piles[1]!].sort());
  await expect(modal(page)).toContainText("Phyrexian Portal: put a card into your hand");
  await modal(page).locator(`[data-pick="${others[0]}"]`).click();
  await modal(page).getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[0]!.hand.length === hand + 1);
  for (const id of piles[0]!) expect(after.objects[id]!.zone).toBe("exile");
  expect(after.objects[others[0]!]!.zone).toBe("hand");
  expect(top.every((id) => piles[0]!.includes(id) || piles[1]!.includes(id))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Phyrexian Portal: Ana's targets you; separate her top ten cards into two face-down piles, three in the first", async ({ page }) => {
  let s: GameState = scene({}, [{ board: ["Phyrexian Portal", "Island", "Island", "Island"] }]);
  const portal = one(s, "Phyrexian Portal");
  s = playUntil(s, (st) => st.priority === 1 && !st.pending && st.stack.length === 0 && st.step === "main1");
  for (const a of planActivate(s, 1, portal, 0, [{ kind: "player", id: 0 }])!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const top = s.players[1]!.library.slice(0, 10);
  const hand = s.players[1]!.hand.length;
  await open(page, s);
  const pick = modal(page);
  await expect(pick).toContainText("Phyrexian Portal: separate Ana's top cards into two face-down piles");
  for (const id of top.slice(0, 3)) await pick.locator(`[data-pick="${id}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  // Ana (a bot) exiles the smaller pile and takes a card from the other.
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.players[1]!.hand.length === hand + 1);
  for (const id of top.slice(0, 3)) expect(after.objects[id]!.zone).toBe("exile");
  expect(after.log.some((l) => l.text === "Ana separates them into two face-down piles of 3 cards and 7 cards." || l.text === "You separates them into two face-down piles of 3 cards and 7 cards.")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Raging River: you attack Ana; she divides her creatures, and you choose \"left\" for one attacker and \"right\" for the other", async ({ page }) => {
  let s: GameState = scene({ board: ["Raging River", "Hill Giant", "Grizzly Bears"] }, [{ board: ["Grizzly Bears", "Grizzly Bears", "Wind Drake"] }]);
  const [giant, bears] = [one(s, "Hill Giant"), idsOf(s, "Grizzly Bears", "battlefield", 0)[0]!];
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [{ attacker: giant, defender: 1 }, { attacker: bears, defender: 1 }] });
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "riverSide");
  await open(page, s);
  const bar = controls(page);
  for (let i = 0; i < 2; i++) {
    await expect(bar).toContainText(`choose "left" or "right" for`);
    await bar.getByRole("button", { name: i === 0 ? /^"Left"/ : /^"Right"/ }).click();
    if (i === 0) await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "riverSide" && (st.resolving?.scratch?.river?.sides?.length ?? 0) === 1);
  }
  const after = await resolveUntil(page, (st) => !!st.objects[giant]!.riverOnly?.length && !!st.objects[bears]!.riverOnly?.length);
  expect(after.log.filter((l) => /^You chooses "(left|right)" for /.test(l.text)).length).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Raging River: Ana attacks you; divide your creatures without flying into a \"left\" and a \"right\" pile", async ({ page }) => {
  let s: GameState = scene({ board: ["Grizzly Bears", "Grizzly Bears", "Wind Drake"] }, [{ board: ["Raging River", "Hill Giant"] }]);
  const giant = one(s, "Hill Giant");
  const [b1, b2] = idsOf(s, "Grizzly Bears", "battlefield", 0);
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 1);
  s = applyAction(s, { type: "declareAttackers", player: 1, attacks: [{ attacker: giant, defender: 0 }] });
  s = playUntil(s, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText(`divide all creatures without flying you control into a "left" pile and a "right" pile`);
  await page.locator(`[data-obj="${b1}"]`).first().click();
  await bar.getByRole("button", { name: "Left: 1, right: 1", exact: true }).click();
  const after = await resolveUntil(page, (st) => !!st.objects[giant]!.riverOnly?.length);
  const allowed = after.objects[giant]!.riverOnly![0]!.allowed.map((x) => x.id);
  // The label Ana chose: one pile's Bears, never both.
  expect(allowed.length).toBe(1);
  expect([b1, b2]).toContain(allowed[0]);
  expect(after.log.some((l) => l.text === `You divides their creatures without flying into a "left" pile (Grizzly Bears) and a "right" pile (Grizzly Bears).`)).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});
