// Round 450 in the browser: Finale of Promise. Cast with X = 10 on Lightning Bolt and Mind Rot in your graveyard: choose
// the card cast first (Mind Rot), cast both free at Ana, then choose which spell each next copy is of and keep their
// targets; Ana takes 9 and discards, both cards are exiled after. With X = 3 only Night's Whisper can be chosen (not Fact or Fiction), and it's cast without an order question.
import { expect, test } from "@playwright/test";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, clickPlayer, controls, modal, resolveUntil } from "./ui";

test("Finale of Promise, X = 10: Mind Rot cast first, then Lightning Bolt, each copied twice in the order I choose", async ({ page }) => {
  const s = scene({ hand: ["Finale of Promise"], board: LANDS, yard: ["Lightning Bolt", "Mind Rot"] }, [{ hand: ["Grizzly Bears", "Hill Giant", "Llanowar Elves", "Forest", "Island", "Swamp", "Plains"] }]);
  const [bolt, rot, fin] = [one(s, "Lightning Bolt"), one(s, "Mind Rot"), one(s, "Finale of Promise")];
  await open(page, s);
  await card(page, "Finale of Promise", s).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("10");
  await x.getByRole("button", { name: "X = 10" }).click();
  await modal(page).locator(`[data-pick="${bolt}"]`).click();
  await modal(page).locator(`[data-pick="${rot}"]`).click();
  const bar = controls(page);
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "castFirst" && st.pending.player === 0);
  await expect(bar).toContainText("Finale of Promise: choose the card to cast first (the one cast later resolves first)");
  await bar.getByRole("button", { name: "Mind Rot" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.objectId === rot);
  await bar.getByRole("button", { name: "Cast it" }).click();
  await clickPlayer(page, 1);
  await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.objectId === bolt);
  await bar.getByRole("button", { name: "Cast it" }).click();
  await clickPlayer(page, 1);
  // Four copies: Bolt, Mind Rot, Bolt (then Mind Rot's last one with no question), each keeping its target.
  const order = [/^Lightning Bolt.*\(2 copies left\)$/, /^Mind Rot.*\(2 copies left\)$/, /^Lightning Bolt.*\(1 copy left\)$/];
  for (const name of order) {
    await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "copyNextOf");
    await expect(bar).toContainText("choose the spell the next copy is of (copies put on the stack later resolve first)");
    await bar.getByRole("button", { name }).click();
    await resolveUntil(page, (st) => st.pending?.kind === "copyTargets");
    await page.locator(".targeting").getByRole("button", { name: /^Keep target/ }).click();
  }
  const last = await resolveUntil(page, (st) => st.pending?.kind === "copyTargets");
  expect(last.pending?.kind === "copyTargets" && last.pending.copyOf).toMatch(/Mind Rot/);
  const life = last.players[1]!.life;
  await page.locator(".targeting").getByRole("button", { name: /^Keep target/ }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bolt]!.zone === "exile" && st.objects[rot]!.zone === "exile", 80);
  expect(after.players[1]!.life).toBe(life - 9);
  expect(after.players[1]!.hand.length).toBe(1);
  expect(after.objects[fin]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Finale of Promise, X = 3: no instant card to choose (Fact or Fiction is 4), so no order question; Night's Whisper is cast free and exiled", async ({ page }) => {
  const s = scene({ hand: ["Finale of Promise"], board: LANDS, yard: ["Night's Whisper", "Fact or Fiction"] });
  const [whisper, fof] = [one(s, "Night's Whisper"), one(s, "Fact or Fiction")];
  await open(page, s);
  await card(page, "Finale of Promise", s).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("3");
  await x.getByRole("button", { name: "X = 3" }).click();
  // Fact or Fiction (mana value 4) can't be the instant: no legal target, so choose none.
  await expect(modal(page)).toContainText("No legal targets.");
  await expect(modal(page).locator(`[data-pick="${fof}"]`)).toHaveCount(0);
  await modal(page).getByRole("button", { name: "Done" }).click();
  await modal(page).locator(`[data-pick="${whisper}"]`).click();
  const bar = controls(page);
  const offer = await resolveUntil(page, (st) => st.pending?.kind === "castFree" && st.pending.objectId === whisper);
  const hand = offer.players[0]!.hand.length;
  await bar.getByRole("button", { name: "Cast it" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[whisper]!.zone === "exile");
  expect(after.players[0]!.hand.length).toBe(hand + 2);
  expect(after.objects[fof]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
