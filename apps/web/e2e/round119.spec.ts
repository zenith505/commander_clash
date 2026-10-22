// Round 119's prompts: Aminatou's Augury asks which type a card with two is cast as ("Cast it as an artifact ..." /
// "... a creature ..."); Powerbalance's free cast offers "Cast it prototyped" when only the prototyped spell has the
// right mana value; Tinybones, Bauble Burglar lets you cast an opponent's exiled card with a stash counter on it during
// your turn; Mari, the Killing Quill's "remove a hit counter from a card that player owns in exile" asks which card.
import { expect, test } from "@playwright/test";
import { applyAction, botActions, planCast, waitingOn, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, menu, modal, resolveUntil, seat } from "./ui";

test("Aminatou's Augury: Ornithopter can be cast as an artifact or as a creature; you pick artifact", async ({ page }) => {
  let s: GameState = scene({ hand: ["Aminatou's Augury"], board: LANDS, library: ["Ornithopter"] });
  const [augury, thopter] = [one(s, "Aminatou's Augury"), one(s, "Ornithopter")];
  // In the engine: cast the Augury and let it resolve (no land put onto the battlefield).
  for (const a of planCast(s, 0, augury)!) s = applyAction(s, a);
  for (let i = 0; i < 40 && s.objects[augury]!.zone !== "graveyard"; i++) {
    const pid = waitingOn(s)!;
    s = applyAction(s, s.pending ? botActions(s, pid)[0]! : { type: "passPriority", player: pid });
  }
  expect(s.objects[thopter]!.zone).toBe("exile");
  await open(page, s);
  await seat(page, 0).locator(".zone", { hasText: "Exile" }).click();
  await modal(page).locator(".card.playable").first().click();
  const m = menu(page);
  await expect(m.getByRole("button", { name: "Cast it as a creature without paying its mana cost" })).toBeVisible();
  await m.getByRole("button", { name: "Cast it as an artifact without paying its mana cost" }).click();
  const after = await resolveUntil(page, (st) => st.objects[thopter]!.zone === "battlefield" && st.stack.length === 0);
  expect(Object.values(after.byTypeCast ?? {}).flat(2)).toEqual(["Artifact"]);
  expect(pageErrors(page)).toEqual([]);
});

test("Powerbalance: Ana casts a three-mana spell; you cast the revealed Phyrexian Fleshgorger prototyped", async ({ page }) => {
  let s: GameState = scene({ board: ["Powerbalance"], library: ["Phyrexian Fleshgorger"] }, [{ hand: ["Centaur Courser"], board: ["Forest", "Forest", "Forest"] }]);
  const gorger = one(s, "Phyrexian Fleshgorger");
  // In the engine: on Ana's turn she casts Centaur Courser; you reveal the top card.
  s = playUntil(s, (st) => st.activePlayer === 1 && st.step === "main1" && st.priority === 1 && !st.pending && st.stack.length === 0);
  for (const a of planCast(s, 1, one(s, "Centaur Courser"))!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0);
  s = applyAction(s, { type: "chooseMay", player: 0, yes: true });
  // "Cast a spell from among the revealed cards": the Fleshgorger.
  expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", player: 0 });
  s = applyAction(s, { type: "chooseOption", player: 0, choice: gorger });
  expect(s.pending).toMatchObject({ kind: "castFree", player: 0, objectId: gorger });
  await open(page, s);
  const bar = controls(page);
  // Its mana value is 6 as it is; prototyped, 3.
  await expect(bar.getByRole("button", { name: "Cast it", exact: true })).toBeDisabled();
  await bar.locator('button[data-alt="prototype"]').click();
  const after = await resolveUntil(page, (st) => st.objects[gorger]!.zone === "battlefield" && st.stack.length === 0);
  expect(after.objects[gorger]!.prototyped).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Tinybones: during your turn you cast Ana's exiled Grizzly Bears with a stash counter on it, with any type of mana", async ({ page }) => {
  const s: GameState = scene({ board: ["Tinybones, Bauble Burglar", "Island", "Island"] }, [{ exile: ["Grizzly Bears"] }]);
  const bears = one(s, "Grizzly Bears");
  s.objects[bears]!.counters.stash = 1;
  await open(page, s);
  await seat(page, 1).locator(".zone", { hasText: "Exile" }).click();
  await modal(page).locator(".card.playable").click();
  await menu(page).getByRole("button", { name: /^Cast it/ }).first().click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && st.objects[bears]!.zone === "battlefield");
  expect(after.objects[bears]!.controller).toBe(0);
  expect(after.objects[bears]!.owner).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Mari, the Killing Quill: she (an Assassin) hits Ana; you remove a hit counter from the card of hers you choose", async ({ page }) => {
  let s: GameState = scene({ board: ["Mari, the Killing Quill"] }, [{ exile: ["Grizzly Bears", "Hill Giant"] }]);
  const [mari, bears, giant] = [one(s, "Mari, the Killing Quill"), one(s, "Grizzly Bears"), one(s, "Hill Giant")];
  s.objects[bears]!.counters.hit = 2;
  s.objects[giant]!.counters.hit = 1;
  // In the engine: Mari attacks Ana, unblocked; you say yes to removing a counter.
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks: [{ attacker: mari, defender: 1 }] });
  s = playUntil(s, (st) => st.pending?.kind === "chooseMay" && st.pending.player === 0 && /hit counter/.test(st.pending.prompt));
  s = applyAction(s, { type: "chooseMay", player: 0, yes: true });
  expect(s.pending).toMatchObject({ kind: "chooseOption", what: "enchant", player: 0 });
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("remove a hit counter from which card?");
  await bar.getByRole("button", { name: "Hill Giant (1)" }).click();
  const after = await resolveUntil(page, (st) => st.stack.length === 0 && !st.pending && (st.objects[giant]!.counters.hit ?? 0) === 0);
  expect(after.objects[bears]!.counters.hit).toBe(2);
  expect(after.battlefield.filter((id) => after.cards[after.objects[id]!.cardId]!.name === "Treasure Token").length).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});
