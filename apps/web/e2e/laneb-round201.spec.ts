// Lane B round B201 in the browser: Liar's Pendulum's two new prompts, the guess (asked of you when a bot names a card) and
// "reveal your hand?" (asked of you after a bot guesses), and Delaying Shield's payment for each delay counter.
import { expect, test } from "@playwright/test";
import { applyAction, planActivate } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene, state } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Liar's Pendulum: name Lightning Bolt (not in your hand); Ana guesses it is, you reveal and draw", async ({ page }) => {
  const s = scene({ hand: ["Hill Giant"], board: [...LANDS, "Liar's Pendulum"], library: ["Lightning Bolt"] });
  const pendulum = one(s, "Liar's Pendulum");
  await open(page, s);
  await card(page, "Liar's Pendulum", s).click();
  const item = menu(page).getByRole("button", { name: /Choose a card name/ });
  if (await item.count()) await item.click();
  await page.locator(`[data-player="1"]`).first().click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "cardName");
  const pick = modal(page);
  await pick.locator("input").fill("lightning bolt");
  await pick.locator('[data-name="Lightning Bolt"]').click();
  // Ana guesses (Lightning Bolt hasn't been seen anywhere, so she guesses it's in your hand).
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  const hand = asked.players[0]!.hand.length;
  const bar = controls(page);
  await expect(bar).toContainText("Reveal your hand (Ana guessed Lightning Bolt is in your hand;");
  await bar.getByRole("button", { name: "Yes" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.players[0]!.hand.length === hand + 1);
  expect(after.objects[pendulum]!.tapped).toBe(true);
  expect(after.players[0]!.hand).toContain(one(s, "Lightning Bolt"));
  expect(after.log.some((e) => /Ana guessed wrong/.test(e.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Liar's Pendulum: Ana names a card and you guess on the prompt; she reveals and draws when you're wrong", async ({ page }) => {
  let s = scene({}, [{ hand: ["Hill Giant"], board: [...LANDS, "Liar's Pendulum"] }]);
  const pendulum = one(s, "Liar's Pendulum");
  // Ana's turn: she activates it at you, and names a card as it resolves (the bots' moves, made in the engine).
  s = playUntil(s, (st) => st.activePlayer === 1 && st.step === "main1" && !st.pending && st.priority === 1);
  for (const a of planActivate(s, 1, pendulum, 0, [{ kind: "player", id: 0 }])!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "liarGuess");
  const named = s.resolving!.chosen!.name!;
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText(`Ana named ${named}`);
  const before = await state(page);
  const inHand = before.players[1]!.hand.some((id) => before.cards[before.objects[id]!.cardId]!.name === named);
  // Guess wrong on purpose: Ana reveals her hand for the card.
  await bar.getByRole("button", { name: inHand ? `${named} isn't in their hand` : `${named} is in their hand` }).click();
  // Keep the state the poll saw: Ana plays on afterwards. Her draw is part of the same resolution as the guess's outcome.
  const after = await resolveUntil(page, (st) => st.log.some((e) => /You guessed wrong/.test(e.text)));
  const wrong = after.log.findIndex((e) => /You guessed wrong/.test(e.text));
  expect(after.log.slice(0, wrong).some((e) => /Ana reveals their hand/.test(e.text))).toBe(true);
  expect(after.log.slice(wrong).some((e) => /^Ana draws/.test(e.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Delaying Shield: at your upkeep, pay {1}{W} for one delay counter and lose 1 life for the other", async ({ page }) => {
  let s = scene({ board: [...LANDS, "Delaying Shield"] });
  const shield = one(s, "Delaying Shield");
  s.objects[shield]!.counters.delay = 2;
  s = playUntil(s, (st) => st.activePlayer === 0 && st.step === "upkeep" && st.turn > 1 && st.stack.length > 0);
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "payUnless" && st.pending.player === 0);
  const bar = controls(page);
  await expect(bar).toContainText("or lose 1 life");
  await bar.getByRole("button", { name: "Pay", exact: true }).click();
  // The second counter's payment, asked once the first is paid (two lands tapped for it).
  await resolveUntil(page, (st) => st.pending?.kind === "payUnless" && st.pending.player === 0 && st.battlefield.filter((id) => st.objects[id]!.tapped).length === 2);
  await bar.getByRole("button", { name: "Don't pay" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.players[0]!.life === 39);
  expect(after.objects[shield]!.counters.delay ?? 0).toBe(0);
  expect(pageErrors(page)).toEqual([]);
});
