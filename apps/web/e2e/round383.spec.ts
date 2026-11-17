// Round 383: Words of Waste's discard prompt when an opponent's draw is replaced (you choose the card, then the draws go
// on), and Travel Through Caradhras's vote buttons, then its search for each Redhorn Pass vote and its graveyard pick for
// each Mines of Moria vote.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

test("Words of Waste: Ana's next draw is replaced, so you discard a card of your choice; then Vision Skeins finishes", async ({ page }) => {
  const s = scene({ hand: ["Vision Skeins", "Grizzly Bears", "Hill Giant"], board: LANDS }, [{ board: ["Words of Waste"] }]);
  const [bears, giant] = [one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  // Ana activated Words of Waste this turn: her next draw this turn is replaced.
  s.players[1]!.nextDrawInstead = [{ turn: s.turn, source: "Words of Waste", sourceId: one(s, "Words of Waste"), sourceZc: 0, discard: true }];
  await open(page, s);
  await card(page, "Vision Skeins", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "discard" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("Words of Waste: click 1 card in your hand to discard.");
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await bar.getByRole("button", { name: "Discard" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[giant]!.zone === "graveyard");
  expect(after.objects[bears]!.zone).toBe("hand");
  // You drew two (Vision Skeins), Ana one: her first draw was replaced, her second drawn.
  expect(after.players[0]!.hand).toHaveLength(3);
  expect(after.players[1]!.hand).toHaveLength(1);
  expect(after.players[1]!.nextDrawInstead).toBeUndefined();
  expect(pageErrors(page)).toEqual([]);
});

test("Travel Through Caradhras: vote Mines of Moria; the bots' Redhorn Pass votes find three basic lands, your vote returns Hill Giant", async ({ page }) => {
  const s = scene({ hand: ["Travel Through Caradhras"], board: LANDS, yard: ["Hill Giant", "Grizzly Bears"] });
  const [giant, bears] = [one(s, "Hill Giant"), one(s, "Grizzly Bears")];
  const travel = one(s, "Travel Through Caradhras");
  const field = s.battlefield.length;
  await open(page, s);
  await card(page, "Travel Through Caradhras", s).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "vote" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "Redhorn Pass", exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Mines of Moria", exact: true }).click();
  const search = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  expect(search.log.filter((l) => / votes for /.test(l.text))).toHaveLength(4);
  const redhorn = search.log.filter((l) => / votes for Redhorn Pass/.test(l.text)).length;
  expect(redhorn).toBeGreaterThan(0);
  const pick = modal(page);
  await expect(pick).toContainText(`Travel Through Caradhras: search your library for up to ${redhorn} basic land cards`);
  // The Forests are one pile in the search window: each click finds the next one.
  const pile = pick.locator(".card.targetable", { hasText: "Forest" });
  for (let i = 0; i < redhorn; i++) await pile.click();
  await pick.getByRole("button", { name: "Done" }).click();
  const back = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0 && st.pending.cards.includes(giant));
  const forests = back.battlefield.filter((id) => !s.battlefield.includes(id) && back.cards[back.objects[id]!.cardId]!.name === "Forest");
  expect(back.battlefield.length).toBe(field + redhorn);
  expect(forests).toHaveLength(redhorn);
  expect(forests.every((id) => back.objects[id]!.tapped && back.objects[id]!.controller === 0)).toBe(true);
  const yard = modal(page);
  await yard.locator(`[data-pick="${giant}"]`).click();
  await yard.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[travel]!.zone === "exile");
  expect(after.objects[giant]!.zone).toBe("hand");
  expect(after.objects[bears]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
