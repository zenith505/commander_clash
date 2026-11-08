// Round 302's prompts: Sigarda's Vanguard's "choose any number of creatures with different powers" (OK held back while
// two share a power), Sivitri, Dragon Master's attack tax in life on the attack button, Cryptic Gateway's creature card
// sharing a type with each creature tapped, Osgir, the Reconstructor's X (the greatest that an artifact card in the
// graveyard fits), Archfiend of Spite's "unless they sacrifice that many permanents", Stick Together's party, and Lich's
// Mastery's exile for each 1 life lost, from the hand, the graveyard or the battlefield.
import { expect, test } from "@playwright/test";
import { applyAction, characteristics, planActivate, planCast, waitingOn, type Action, type GameState } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { card, clickPlayer, controls, menu, modal, resolveUntil } from "./ui";

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => applyAction(x, a), s);
};
/** Everyone passes until there's a prompt (or nothing left to resolve). */
const passToPrompt = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const keywords = (s: GameState, id: string) => characteristics(s, s.objects[id]!).keywords;

test("Sigarda's Vanguard: two creatures with the same power can't both be chosen; Grizzly Bears and Hill Giant get double strike", async ({ page }) => {
  const s0 = scene({ hand: ["Sigarda's Vanguard"], board: [...LANDS, "Grizzly Bears", "Elvish Warrior", "Hill Giant"] });
  const [bears, warrior, giant] = [one(s0, "Grizzly Bears"), one(s0, "Elvish Warrior"), one(s0, "Hill Giant")];
  const s = passToPrompt(run(s0, planCast(s0, 0, one(s0, "Sigarda's Vanguard"))));
  expect(s.pending).toMatchObject({ kind: "pickPermanents", player: 0, differentPowers: true });
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("click any number of creatures with different powers (anyone's), then choose them: they gain double strike until end of turn");
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(`[data-obj="${warrior}"]`).click();
  await expect(bar).toContainText("(two of them have the same power)");
  await expect(bar.getByRole("button", { name: "Choose", exact: true })).toBeDisabled();
  await page.locator(`[data-obj="${warrior}"]`).click();
  await page.locator(`[data-obj="${giant}"]`).click();
  await bar.getByRole("button", { name: "Choose", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.triggerQueue.length === 0);
  expect([bears, warrior, giant].map((id) => keywords(after, id).includes("Double strike"))).toEqual([true, false, true]);
  expect(pageErrors(page)).toEqual([]);
});

test("Sivitri, Dragon Master: after Ana's +1, attacking her costs 2 life a creature, shown on the attack button", async ({ page }) => {
  let s = scene({ board: ["Grizzly Bears", "Hill Giant"] }, [{ board: ["Sivitri, Dragon Master"] }]);
  const [bears, giant, sivitri] = [one(s, "Grizzly Bears"), one(s, "Hill Giant"), one(s, "Sivitri, Dragon Master")];
  s.objects[sivitri]!.counters.loyalty = 4;
  s = playUntil(s, (st) => st.activePlayer === 1 && st.step === "main1" && !st.stack.length);
  s = playUntil(run(s, planActivate(s, 1, sivitri, 0)), (st) => st.activePlayer === 0 && st.step === "main1" && !st.stack.length);
  expect(s.players[0]!.life).toBe(40);
  await open(page, s);
  await resolveUntil(page, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  const bar = controls(page);
  for (const id of [bears, giant]) {
    await page.locator(`[data-obj="${id}"]`).click();
    await clickPlayer(page, 1);
  }
  await bar.getByRole("button", { name: "Attack with 2 (pay 4 life)" }).click();
  const after = await resolveUntil(page, (st) => st.step === "declareBlockers" || st.step === "combatDamage" || st.step === "endCombat");
  expect(after.players[0]!.life).toBe(36);
  expect(after.objects[bears]!.attacking).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Cryptic Gateway: with two Elves tapped, only the Elf card in hand can be put onto the battlefield", async ({ page }) => {
  const s0 = scene({ hand: ["Elvish Warrior", "Hill Giant"], board: ["Cryptic Gateway", "Llanowar Elves", "Elvish Mystic"] });
  const [elves, mystic, warrior, giant] = [one(s0, "Llanowar Elves"), one(s0, "Elvish Mystic"), one(s0, "Elvish Warrior"), one(s0, "Hill Giant")];
  const s = passToPrompt(run(s0, planActivate(s0, 0, one(s0, "Cryptic Gateway"), 0, undefined, undefined, undefined, undefined, { tap: [elves, mystic] })));
  expect(s.pending?.player).toBe(0);
  await open(page, s);
  const pick = modal(page);
  await expect(pick).toContainText("Cryptic Gateway: you may put a creature card that shares a creature type with each creature tapped from your hand onto the battlefield");
  await expect(pick.locator(`[data-pick="${giant}"]`)).toHaveCount(0);
  await pick.locator(`[data-pick="${warrior}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[warrior]!.zone === "battlefield");
  expect(after.objects[giant]!.zone).toBe("hand");
  expect(pageErrors(page)).toEqual([]);
});

test("Osgir, the Reconstructor: X is offered up to Mind Stone's mana value, and two copies of it are made", async ({ page }) => {
  const s = scene({ board: ["Osgir, the Reconstructor", "Plains", "Mountain", "Island"], yard: ["Mind Stone"] });
  const stone = one(s, "Mind Stone");
  await open(page, s);
  await card(page, "Osgir, the Reconstructor", s).click();
  await menu(page).locator("button", { hasText: "Create two tokens" }).click();
  const x = page.locator(".x-pick");
  await expect(x).toContainText("exile an artifact card with mana value X from your graveyard: choose X (up to 2)");
  await x.getByRole("button", { name: "X = 2" }).click();
  const pick = modal(page);
  await expect(pick).toContainText("Osgir, the Reconstructor: exile from your graveyard an artifact card with mana value 2");
  await pick.locator(`[data-pick="${stone}"]`).click();
  await pick.getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[stone]!.zone === "exile");
  expect(idsOf(after, "Mind Stone", "battlefield", 0).filter((id) => after.objects[id]!.isToken)).toHaveLength(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Archfiend of Spite: Shock it, then choose to sacrifice two permanents rather than lose 2 life", async ({ page }) => {
  const s0 = scene({ hand: ["Shock"], board: ["Mountain", "Grizzly Bears", "Hill Giant", "Island"] }, [{ board: ["Archfiend of Spite"] }]);
  const [bears, giant, island] = [one(s0, "Grizzly Bears"), one(s0, "Hill Giant"), idsOf(s0, "Island", "battlefield", 0)[0]!];
  const s = passToPrompt(run(s0, planCast(s0, 0, one(s0, "Shock"), [{ kind: "object", id: one(s0, "Archfiend of Spite") }])));
  expect(s.pending).toMatchObject({ kind: "chooseOption", what: "punisher", player: 0 });
  await open(page, s);
  const bar = controls(page);
  await expect(bar.getByRole("button", { name: "Lose 2 life" })).toBeVisible();
  await bar.getByRole("button", { name: "Sacrifice 2 permanents" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  await page.locator(`[data-obj="${bears}"]`).click();
  await page.locator(`[data-obj="${island}"]`).click();
  await bar.getByRole("button", { name: "Sacrifice", exact: true }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[bears]!.zone === "graveyard");
  expect([island, giant].map((id) => after.objects[id]!.zone)).toEqual(["graveyard", "battlefield"]);
  expect(after.players[0]!.life).toBe(40);
  expect(pageErrors(page)).toEqual([]);
});

test("Stick Together: keep a Cleric, a Rogue and a Warrior; the second Warrior and the Elf are sacrificed", async ({ page }) => {
  const s0 = scene({ hand: ["Stick Together"], board: [...LANDS, "Soul Warden", "Merfolk Looter", "Centaur Courser", "Goblin Piker", "Llanowar Elves"] });
  const [warden, looter, courser, piker, elves] = ["Soul Warden", "Merfolk Looter", "Centaur Courser", "Goblin Piker", "Llanowar Elves"].map((n) => one(s0, n)) as [string, string, string, string, string];
  const s = passToPrompt(run(s0, planCast(s0, 0, one(s0, "Stick Together"))));
  expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "keep", player: 0 });
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("choose your party: click up to one Cleric of yours (then a Rogue, a Warrior, a Wizard). Creatures not in your party are sacrificed.");
  await page.locator(`[data-obj="${warden}"]`).click();
  await bar.getByRole("button", { name: "Keep 1" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0 && /Rogue of yours/.test(st.pending.prompt ?? ""));
  await page.locator(`[data-obj="${looter}"]`).click();
  await bar.getByRole("button", { name: "Keep 1" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0 && /Warrior of yours/.test(st.pending.prompt ?? ""));
  await page.locator(`[data-obj="${courser}"]`).click();
  await bar.getByRole("button", { name: "Keep 1" }).click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[elves]!.zone === "graveyard");
  expect([warden, looter, courser, piker].map((id) => after.objects[id]!.zone)).toEqual(["battlefield", "battlefield", "battlefield", "graveyard"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Lich's Mastery: Night's Whisper's 2 life lost, a card exiled from the graveyard and one from the hand", async ({ page }) => {
  const s0 = scene({ hand: ["Night's Whisper"], board: ["Lich's Mastery", "Swamp", "Swamp"], yard: ["Grizzly Bears"] });
  const [bears, mastery] = [one(s0, "Grizzly Bears"), one(s0, "Lich's Mastery")];
  const s = passToPrompt(run(s0, planCast(s0, 0, one(s0, "Night's Whisper"))));
  expect(s.pending).toMatchObject({ kind: "chooseOption", what: "exileHandOrPermanent", player: 0 });
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("exile a permanent you control or a card from your hand or graveyard (1 of 2)");
  await bar.getByRole("button", { name: "Grizzly Bears (graveyard)" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "chooseOption" && /\(2 of 2\)/.test(st.pending.prompt ?? ""));
  const hand = s.players[0]!.hand[0]!;
  await bar.locator("button", { hasText: "(hand)" }).first().click();
  const after = await resolveUntil(page, (st) => !st.pending && st.stack.length === 0 && st.objects[bears]!.zone === "exile");
  expect(after.players[0]!.life).toBe(38);
  expect(after.players[0]!.exile.filter((id) => after.objects[id]!.zone === "exile")).toHaveLength(2);
  expect(after.players[0]!.hand.length).toBe(s.players[0]!.hand.length - 1);
  expect(after.objects[mastery]!.zone).toBe("battlefield");
  expect(hand).toBeDefined();
  expect(pageErrors(page)).toEqual([]);
});
