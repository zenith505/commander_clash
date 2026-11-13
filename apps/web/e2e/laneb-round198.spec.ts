// Lane B round B198 in the browser: Templar Knight's "Tap five untapped attacking creatures you control named Templar
// Knight" cost, picked like any tap cost, and Kadena, Slinking Sorcerer's first face-down creature spell each turn for {3}
// less: the Cast face down button shows what it costs now.
import { expect, test } from "@playwright/test";
import { applyAction, waitingOn } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { menu, modal, resolveUntil } from "./ui";

test("Templar Knight: five attacking Knights tap to put Akroma's Memorial onto the battlefield", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, ...Array.from({ length: 5 }, () => "Templar Knight")], library: ["Akroma's Memorial"] });
  const knights = s0.battlefield.filter((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Templar Knight");
  const memorial = one(s0, "Akroma's Memorial");
  let s = playUntil(s0, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: knights.map((k) => ({ attacker: k, defender: 1 })) });
  s = playUntil(s, (st) => st.step === "declareBlockers" && !st.pending && waitingOn(st) === 0);
  await open(page, s);
  await page.locator(`[data-obj="${knights[0]}"]`).first().click();
  await menu(page).getByRole("button", { name: /Search your library for a legendary artifact card/ }).click();
  const bar = page.locator(".targeting");
  await expect(bar).toContainText("tap 5 untapped attacking creatures you control named Templar Knight");
  const go = bar.getByRole("button", { name: "Tap and activate" });
  for (const k of knights.slice(0, 4)) await page.locator(`[data-obj="${k}"]`).first().click();
  // Four aren't enough.
  await expect(go).toBeDisabled();
  await page.locator(`[data-obj="${knights[4]}"]`).first().click();
  await go.click();
  await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  const pick = modal(page);
  await pick.locator(`[data-pick="${memorial}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.objects[memorial]!.zone === "battlefield");
  for (const k of knights) expect(after.objects[k]!.tapped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Kadena, Slinking Sorcerer: the first face-down spell this turn is free, then Kadena draws you a card", async ({ page }) => {
  const s = scene({ hand: ["Exalted Angel"], board: ["Kadena, Slinking Sorcerer", "Forest"] });
  const angel = one(s, "Exalted Angel");
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  await page.locator(`[data-obj="${angel}"]`).first().click();
  const button = menu(page).getByRole("button", { name: /Cast face down/ });
  await expect(button).toBeEnabled();
  await button.click();
  const after = await resolveUntil(page, (st) => st.objects[angel]!.zone === "battlefield" && st.stack.length === 0 && !st.pending);
  expect(after.objects[angel]!.faceDown).toBeTruthy();
  // No land was tapped: it cost {0}; Kadena's "whenever a face-down creature you control enters" drew a card.
  expect(after.battlefield.filter((id) => after.objects[id]!.tapped)).toEqual([]);
  expect(after.players[0]!.hand.length).toBe(hand);
  expect(pageErrors(page)).toEqual([]);
});
