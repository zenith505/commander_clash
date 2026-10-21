// Round 109's prompts: the legend rule's "Keep ..." buttons (CR 704.5j: you choose which of your legends with the same
// name stays), As Foretold's "Cast it for {0}" in a card's menu (CR 118.9), once each turn, and a graveyard card's
// alternative cost under Yawgmoth's Will ("Cast from graveyard: Evoke").
import { expect, test } from "@playwright/test";
import { applyAction, planCast, type GameState } from "@cc/engine";
import { idsOf, one, open, pageErrors, playWithBots, scene, state } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Legend rule: a second Isamaru resolves; keep the first one, which has a +1/+1 counter", async ({ page }) => {
  let s: GameState = scene({ hand: ["Isamaru, Hound of Konda"], board: ["Isamaru, Hound of Konda", "Plains"] });
  const inHand = s.players[0]!.hand[0]!;
  const onBoard = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Isamaru, Hound of Konda")!;
  s.objects[onBoard]!.counters["+1/+1"] = 1;
  for (const a of planCast(s, 0, inHand)!) s = applyAction(s, a);
  s = playWithBots(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "legend");
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Isamaru, Hound of Konda: legend rule: keep which one?");
  await expect(bar.getByRole("button", { name: "Keep Isamaru, Hound of Konda (newest)" })).toBeVisible();
  await bar.getByRole("button", { name: "Keep Isamaru, Hound of Konda (1 +1/+1 counter, oldest)" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.objects[inHand]!.zone === "graveyard");
  expect(after.objects[onBoard]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});

test("As Foretold with three time counters: cast Divination for {0} from its menu; the next spell costs its mana", async ({ page }) => {
  const s = scene({ hand: ["Divination", "Opt"], board: ["As Foretold", "Island"] });
  const [divination, opt, island] = [one(s, "Divination"), one(s, "Opt"), idsOf(s, "Island", "battlefield", 0)[0]!];
  s.objects[one(s, "As Foretold")]!.counters.time = 3;
  await open(page, s);
  await card(page, "Divination", s).click();
  await menu(page).locator("button", { hasText: "Cast it for" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && st.objects[divination]!.zone === "graveyard");
  // Two cards drawn, and the Island still untapped: nothing was paid.
  expect(after.players[0]!.hand).toHaveLength(3);
  expect(after.objects[island]!.tapped).toBe(false);
  // Once each turn: Opt can only be cast for its mana cost now, so a click casts it with the Island, no menu.
  await card(page, "Opt", s).click();
  await expect.poll(async () => (await state(page)).objects[opt]!.zone).not.toBe("hand");
  expect((await state(page)).objects[island]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Yawgmoth's Will: evoke Mulldrifter from your graveyard for {2}{U}; it draws two and is exiled", async ({ page }) => {
  let s: GameState = scene({ hand: ["Yawgmoth's Will"], board: ["Swamp", "Swamp", "Swamp", "Island", "Island", "Island"], yard: ["Mulldrifter"] });
  const drifter = one(s, "Mulldrifter");
  for (const a of planCast(s, 0, one(s, "Yawgmoth's Will"))!) s = applyAction(s, a);
  s = playWithBots(s, (st) => st.stack.length === 0 && !st.pending && st.priority === 0);
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await page.locator('[data-graveyard="0"]').click();
  await modal(page).locator(".card.playable", { hasText: "Mulldrifter" }).click();
  // Its mana cost needs five lands (three are left): only the evoke button can be used.
  await expect(menu(page).locator('button[data-alt="evoke"]')).toContainText("Cast from graveyard: Evoke");
  await menu(page).locator('button[data-alt="evoke"]').click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[drifter]!.zone === "exile");
  expect(after.players[0]!.hand.length).toBe(hand + 2);
  expect(pageErrors(page)).toEqual([]);
});
