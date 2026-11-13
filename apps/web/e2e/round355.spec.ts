// Round 355's prompts: Spelltwine's two graveyard targets and its "Cast the copies if able" (which copy first, then each
// copy cast with no way to decline), and Baral and Kari Zev's free cast from hand, offering only lesser spells that share
// a card type with the triggering spell.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, modal, resolveUntil } from "./ui";

test("Spelltwine: your Divination and Ana's Lightning Bolt; you pick which copy is cast first, and neither can be declined", async ({ page }) => {
  const s = scene({ hand: ["Spelltwine"], board: LANDS, yard: ["Divination"] }, [{ yard: ["Lightning Bolt"] }]);
  const [twine, div, bolt] = [one(s, "Spelltwine"), one(s, "Divination"), one(s, "Lightning Bolt")];
  await open(page, s);
  await card(page, "Spelltwine", s).click();
  await modal(page).locator(`[data-pick="${div}"]`).click();
  if (await modal(page).getByRole("button", { name: "Done", exact: true }).count()) await modal(page).getByRole("button", { name: "Done", exact: true }).click();
  await modal(page).locator(`[data-pick="${bolt}"]`).click();
  if (await modal(page).getByRole("button", { name: "Done", exact: true }).count()) await modal(page).getByRole("button", { name: "Done", exact: true }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromAmong" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("cast a copy of which card first, without paying its mana cost?");
  await expect(bar.getByRole("button", { name: "Done" })).toHaveCount(0);
  await bar.getByRole("button", { name: "Lightning Bolt (Ana's)" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0 && !!st.pending.must);
  await expect(bar).toContainText("You must cast it if you can.");
  await expect(bar.getByRole("button", { name: /^Don't/ })).toHaveCount(0);
  await bar.getByRole("button", { name: "Cast it" }).click();
  await clickPlayer(page, 1);
  // Divination's copy next, with no question of order.
  const next = await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.player === 0 && st.cards[st.objects[st.pending.objectId]!.cardId]!.name === "Divination");
  expect(next.stack.some((x) => !!next.objects[x.objectId!] && next.cards[next.objects[x.objectId!]!.cardId]!.name === "Lightning Bolt")).toBe(true);
  await bar.getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[twine]!.zone === "exile");
  expect(after.players[1]!.life).toBe(s.players[1]!.life - 3);
  expect(after.players[0]!.hand.length).toBe(s.players[0]!.hand.length - 1 + 2);
  for (const id of [div, bolt]) expect(after.objects[id]!.zone).toBe("exile");
  expect(pageErrors(page)).toEqual([]);
});

test("Baral and Kari Zev: after Divination, Ponder may be cast free, not Lightning Bolt; declining makes First Mate Ragavan", async ({ page }) => {
  const s = scene({ hand: ["Divination", "Ponder", "Lightning Bolt"], board: [...LANDS, "Baral and Kari Zev"] });
  const [ponder, bolt] = [one(s, "Ponder"), one(s, "Lightning Bolt")];
  await open(page, s);
  await card(page, "Divination", s).click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFromHand" && st.pending.player === 0);
  const options = asked.pending?.kind === "chooseOption" ? asked.pending.options : [];
  expect(options).toContain(ponder);
  expect(options).not.toContain(bolt);
  const bar = controls(page);
  await expect(bar).toContainText("spell with lesser mana value that shares a card type with it");
  await expect(bar.getByRole("button", { name: "Lightning Bolt" })).toHaveCount(0);
  await bar.getByRole("button", { name: "Don't cast" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.battlefield.some((id) => st.cards[st.objects[id]!.cardId]!.name === "First Mate Ragavan"));
  const rag = after.battlefield.map((id) => after.objects[id]!).find((o) => after.cards[o.cardId]!.name === "First Mate Ragavan")!;
  expect(rag.isToken).toBe(true);
  expect(rag.controller).toBe(0);
  expect(after.objects[ponder]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});
