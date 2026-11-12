// Lane B round B181 in the browser: Qasali Ambusher cast for free, as though it had flash, while a creature attacks you
// and you control a Forest and a Plains (the alternative cost's flash, CR 601.3), then it blocks; Winter, Cursed Rider's
// "Exile X artifact cards from your graveyard" with no {X} to pay (X chosen, then the cards clicked).
import { expect, test } from "@playwright/test";
import { applyAction, waitingOn, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, controls, menu, modal, resolveUntil } from "./ui";

test("Qasali Ambusher: cast it without paying its mana cost in Ana's declare attackers step, then block with it", async ({ page }) => {
  let s: GameState = scene({ hand: ["Qasali Ambusher"], board: ["Forest", "Plains"] }, [{ board: ["Hill Giant"] }]);
  const [qasali, giant] = [one(s, "Qasali Ambusher"), one(s, "Hill Giant")];
  // Ana's turn, in the engine: she attacks you with the Hill Giant; you have priority in the declare attackers step.
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 1);
  s = applyAction(s, { type: "declareAttackers", player: 1, attacks: [{ attacker: giant, defender: 0 }] });
  s = playUntil(s, (st) => st.step === "declareAttackers" && !st.pending && !st.stack.length && waitingOn(st) === 0);
  await open(page, s);
  await card(page, "Qasali Ambusher", s).click();
  await menu(page).getByRole("button", { name: "Cast it: without paying its mana cost" }).click();
  const cast = await resolveUntil(page, (st) => st.objects[qasali]!.zone === "battlefield" && st.pending?.kind === "declareBlockers");
  expect(cast.battlefield.filter((id) => cast.objects[id]!.controller === 0 && cast.objects[id]!.tapped)).toHaveLength(0);
  await page.locator(`[data-obj="${qasali}"]`).first().click();
  await page.locator(`[data-obj="${giant}"]`).first().click();
  await controls(page).getByRole("button", { name: /^Block with 1/ }).click();
  const after = await resolveUntil(page, (st) => st.step === "main2" || st.objects[giant]!.damage > 0);
  expect(after.objects[giant]!.damage).toBe(2);
  expect(after.players[0]!.life).toBe(40);
  expect(pageErrors(page)).toEqual([]);
});

test("Qasali Ambusher: in your own main phase with nothing attacking you, only its mana cost can be paid", async ({ page }) => {
  const s = scene({ hand: ["Qasali Ambusher"], board: ["Forest", "Plains", "Forest"] });
  await open(page, s);
  await card(page, "Qasali Ambusher", s).click();
  // Offered but not usable: nothing is attacking you.
  await expect(menu(page).locator("button:enabled", { hasText: "without paying its mana cost" })).toHaveCount(0);
  await expect(menu(page).locator("button:enabled", { hasText: /^Cast it/ }).first()).toBeVisible();
  expect(pageErrors(page)).toEqual([]);
});

test("Winter, Cursed Rider: choose X = 2, click two artifact cards in your graveyard, and Ana's Grizzly Bears dies", async ({ page }) => {
  const s = scene({ board: [...LANDS, "Winter, Cursed Rider"], yard: ["Ornithopter", "Sol Ring", "Grizzly Bears", "Bonesplitter"] }, [{ board: ["Grizzly Bears", "Ornithopter"] }]);
  const winter = one(s, "Winter, Cursed Rider");
  const mine = (n: string) => s.players[0]!.graveyard.find((id) => s.cards[s.objects[id]!.cardId]!.name === n)!;
  const theirs = (n: string) => s.battlefield.find((id) => s.objects[id]!.controller === 1 && s.cards[s.objects[id]!.cardId]!.name === n)!;
  const [thopter, ring, yardBears, splitter] = ["Ornithopter", "Sol Ring", "Grizzly Bears", "Bonesplitter"].map(mine) as [string, string, string, string];
  const [anaBears, anaThopter] = [theirs("Grizzly Bears"), theirs("Ornithopter")];
  await open(page, s);
  await page.locator(`[data-obj="${winter}"]`).first().click();
  await menu(page).locator("button", { hasText: "Exile X artifact cards" }).click();
  const x = page.locator(".x-pick");
  await x.getByLabel("X", { exact: true }).fill("2");
  await x.getByRole("button", { name: "X = 2" }).click();
  const pick = modal(page);
  await expect(pick.locator(`[data-pick="${yardBears}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${thopter}"]`).click();
  await pick.locator(`[data-pick="${splitter}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[anaBears]!.zone === "graveyard");
  expect([thopter, ring, yardBears, splitter].map((id) => after.objects[id]!.zone)).toEqual(["exile", "graveyard", "graveyard", "exile"]);
  expect(after.objects[anaThopter]!.zone).toBe("battlefield");
  expect(after.objects[winter]!.zone).toBe("battlefield");
  expect(pageErrors(page)).toEqual([]);
});
