// Round 394 in the browser: Rinoa, Angel Wing's pick of one of the attacking creatures that died, Lynde, Cheerful
// Tormentor's upkeep choice of a Curse and an opponent, and Crafty Cutpurse taking an opponent's token (with two players'
// effects, the would-be controller's choice of which applies first).
import { expect, test } from "@playwright/test";
import { applyAction, controllerOf, invalidateCharacteristics, planCast, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { attack, card, controls, menu, modal, resolveUntil } from "./ui";

const beastsOf = (st: GameState, pid: number) => st.battlefield.filter((id) => st.objects[id]!.isToken && controllerOf(st, st.objects[id]!) === pid && st.cards[st.objects[id]!.cardId]!.name === "Beast Token");

test("Rinoa, Angel Wing: Fiery Cannonade kills two attackers, you pick Grizzly Bears and it returns tapped with a flying counter", async ({ page }) => {
  const s = scene({ hand: ["Fiery Cannonade"], board: [...LANDS, "Rinoa, Angel Wing", "Grizzly Bears", "Llanowar Elves"] });
  const [rinoa, bears, elves] = [one(s, "Rinoa, Angel Wing"), one(s, "Grizzly Bears"), one(s, "Llanowar Elves")];
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  await attack(page, [
    [rinoa, 1],
    [bears, 1],
    [elves, 1],
  ]);
  await resolveUntil(page, (st) => st.step === "declareAttackers" && st.objects[bears]!.attacking === 1 && st.priority === 0 && !st.pending && st.stack.length === 0);
  await card(page, "Fiery Cannonade", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  const asked = await resolveUntil(page, (st) => st.pending?.kind === "searchLibrary" && st.pending.player === 0);
  expect(asked.pending?.kind === "searchLibrary" && [...asked.pending.cards].sort()).toEqual([bears, elves].sort());
  const pick = modal(page);
  await expect(pick).toContainText("you may return one of the attacking creature cards that died (tapped, with a flying counter on it) to the battlefield under its owner's control");
  await pick.locator(`[data-pick="${bears}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[bears]!.tapped).toBe(true);
  expect(after.objects[bears]!.counters.flying).toBe(1);
  expect(after.objects[elves]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});

test("Lynde, Cheerful Tormentor: at your upkeep you move Ana's Curse of Opulence from you to Ben and draw two cards", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Lynde, Cheerful Tormentor"] }, [{ board: ["Curse of Opulence"] }]);
  const curse = one(s0, "Curse of Opulence");
  s0.objects[curse]!.attachedToPlayer = 0;
  invalidateCharacteristics(s0);
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "curseMove" && st.pending.player === 0);
  const hand = s.players[0]!.hand.length;
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("you may attach a Curse attached to you to one of your opponents. If you do, draw two cards.");
  await expect(bar.getByRole("button", { name: "Don't attach a Curse" })).toBeVisible();
  await bar.getByRole("button", { name: "Attach Curse of Opulence to Ben" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[curse]!.attachedToPlayer === 2);
  expect(after.players[0]!.hand.length).toBe(hand + 2);
  expect(controllerOf(after, after.objects[curse]!)).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Crafty Cutpurse: flashed in, then Beast Within on Ana's Grizzly Bears: the Beast is created under your control", async ({ page }) => {
  const s = scene({ hand: ["Crafty Cutpurse", "Beast Within"], board: LANDS }, [{ board: ["Grizzly Bears"] }]);
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Crafty Cutpurse", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && !!st.turnLog?.tokenSteals?.length && st.priority === 0);
  await card(page, "Beast Within", s).click();
  if (await menu(page).count()) await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  await expect(page.locator(".targeting")).toBeVisible();
  await page.locator(`[data-obj="${bears}"]`).first().click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[bears]!.zone === "graveyard" && beastsOf(st, 0).length > 0);
  expect(beastsOf(after, 0)).toHaveLength(1);
  expect(beastsOf(after, 1)).toHaveLength(0);
  expect(pageErrors(page)).toEqual([]);
});

test("Crafty Cutpurse twice: you'd create a Beast, Ana's and Ben's effects both apply, you choose Ana's first and Ben ends up with it", async ({ page }) => {
  const s0 = scene({ hand: ["Beast Within"], board: [...LANDS, "Grizzly Bears"] });
  const bears = one(s0, "Grizzly Bears");
  // Ana's and Ben's Crafty Cutpurses resolved this turn.
  (s0.turnLog ??= {}).tokenSteals = [
    { player: 1, source: "Crafty Cutpurse" },
    { player: 2, source: "Crafty Cutpurse" },
  ];
  let s = s0;
  for (const a of planCast(s, 0, idsOf(s, "Beast Within", "hand", 0)[0]!, [{ kind: "object", id: bears }])!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "tokenInstead" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Crafty Cutpurse: tokens you would create are created under another player's control instead: whose effect applies first?");
  await bar.getByRole("button", { name: "Ana's Crafty Cutpurse (they end up under Ben's control)" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && beastsOf(st, 2).length > 0);
  expect(beastsOf(after, 2)).toHaveLength(1);
  expect(beastsOf(after, 0)).toHaveLength(0);
  expect(beastsOf(after, 1)).toHaveLength(0);
  expect(pageErrors(page)).toEqual([]);
});
