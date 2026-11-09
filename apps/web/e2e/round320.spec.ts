// Round 320's prompts: Aerith Rescue Mission's "put a stun counter on one of them" among three targets, Read the Runes'
// permanents sacrificed instead of discarding, Insatiable Frugivore's "repeat this process", and the 3 life an opponent
// may pay so Sivriss, Nightmare Speaker's milled card stays in the graveyard.
import { expect, test } from "@playwright/test";
import { applyAction, botActions, planActivate, planCast, waitingOn, type GameState } from "@cc/engine";
import { idsOf, LANDS, one, open, pageErrors, scene } from "./scene";
import { controls, modal, resolveUntil } from "./ui";

/** In the engine: bots answer their prompts (or `answer` does) and everyone passes, until `done`. */
function botsUntil(s: GameState, done: (s: GameState) => boolean, answer?: (s: GameState) => GameState | undefined): GameState {
  for (let i = 0; i < 300 && !done(s); i++) {
    const mine = answer?.(s);
    if (mine) {
      s = mine;
      continue;
    }
    const pid = waitingOn(s)!;
    const pend = s.pending;
    if (pend?.kind === "declareAttackers") s = applyAction(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (pend?.kind === "declareBlockers") s = applyAction(s, { type: "declareBlockers", player: pid, blocks: [] });
    else s = applyAction(s, pid === 0 && !pend ? { type: "passPriority", player: 0 } : botActions(s, pid)[0]!);
  }
  expect(done(s)).toBe(true);
  return s;
}

test("Aerith Rescue Mission: three creatures tapped, and you click which one gets the stun counter", async ({ page }) => {
  let s = scene({ hand: ["Aerith Rescue Mission"], board: LANDS }, [{ board: ["Hill Giant", "Grizzly Bears"] }, { board: ["Craw Wurm"] }]);
  const [giant, bears, wurm] = [one(s, "Hill Giant"), one(s, "Grizzly Bears"), one(s, "Craw Wurm")];
  for (const a of planCast(s, 0, one(s, "Aerith Rescue Mission"), [giant, bears, wurm].map((id) => ({ kind: "object" as const, id })), [1])!) s = applyAction(s, a);
  s = botsUntil(s, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "splitTargets" && x.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("choose one of the creatures");
  await expect(bar.getByRole("button", { name: "Put a stun counter on Hill Giant", exact: true })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Put a stun counter on Grizzly Bears", exact: true })).toBeVisible();
  await bar.getByRole("button", { name: "Put a stun counter on Craw Wurm", exact: true }).click();
  const after = await resolveUntil(page, (x) => !x.stack.length && !x.pending && (x.objects[wurm]!.counters.stun ?? 0) === 1);
  expect([giant, bears, wurm].map((id) => after.objects[id]!.tapped)).toEqual([true, true, true]);
  expect([giant, bears].map((id) => after.objects[id]!.counters.stun ?? 0)).toEqual([0, 0]);
  expect(pageErrors(page)).toEqual([]);
});

test("Read the Runes: X=2, you click a Plains to sacrifice, then discard one card for the other", async ({ page }) => {
  let s = scene({ hand: ["Read the Runes", "Grizzly Bears", "Hill Giant"], board: LANDS, library: ["Craw Wurm", "Forest"] });
  const plains = idsOf(s, "Plains", "battlefield", 0)[0]!;
  const hand = s.players[0]!.hand.length - 1;
  for (const a of planCast(s, 0, one(s, "Read the Runes"), [], undefined, undefined, 2)!) s = applyAction(s, a);
  s = botsUntil(s, (x) => x.pending?.kind === "pickPermanents" && x.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("sacrifice permanents, up to one for each card drawn");
  await page.locator(`[data-obj="${plains}"]`).first().click();
  await bar.getByRole("button", { name: /^Sacrifice/ }).click();
  const asked = await resolveUntil(page, (x) => x.pending?.kind === "discard" && x.pending.player === 0);
  expect(asked.objects[plains]!.zone).toBe("graveyard");
  expect(asked.pending).toMatchObject({ kind: "discard", count: 1 });
  const bears = idsOf(asked, "Grizzly Bears", "hand", 0)[0]!;
  await page.locator(`[data-obj="${bears}"]`).first().click();
  await bar.getByRole("button", { name: /^Discard/ }).click();
  const after = await resolveUntil(page, (x) => !x.stack.length && !x.pending && x.objects[bears]!.zone === "graveyard");
  expect(after.players[0]!.hand.length).toBe(hand + 1);
  expect(pageErrors(page)).toEqual([]);
});

test("Insatiable Frugivore: you click Yes, pick three cards to exile, and get a second Food; two cards left end it", async ({ page }) => {
  let s = scene({ hand: ["Insatiable Frugivore"], board: LANDS, yard: ["Grizzly Bears", "Hill Giant", "Craw Wurm", "Forest", "Island"] });
  for (const a of planCast(s, 0, one(s, "Insatiable Frugivore"))!) s = applyAction(s, a);
  s = botsUntil(s, (x) => x.pending?.kind === "chooseMay" && x.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Insatiable Frugivore: Exile three cards from your graveyard?");
  await bar.getByRole("button", { name: "Yes", exact: true }).click();
  const pick = await resolveUntil(page, (x) => x.pending?.player === 0 && x.pending.kind !== "chooseMay");
  const yard = pick.players[0]!.graveyard;
  expect(pick.pending).toMatchObject({ kind: "searchLibrary", fromGraveyard: "exile", min: 3, max: 3 });
  const box = modal(page);
  await expect(box).toContainText("Insatiable Frugivore: exile 3 cards from your graveyard");
  for (const id of yard.slice(0, 3)) await box.locator(`[data-pick="${id}"]`).click();
  await box.getByRole("button", { name: "Done" }).click();
  // A second Food, then the offer again: with two cards left it isn't asked (rulings), so it's done.
  const after = await resolveUntil(page, (x) => !x.stack.length && !x.pending && x.players[0]!.exile.length === 3);
  expect(after.battlefield.filter((id) => after.cards[after.objects[id]!.cardId]!.name === "Food Token").length).toBe(2);
  expect(after.players[0]!.graveyard.length).toBe(2);
  expect(pageErrors(page)).toEqual([]);
});

test("Sivriss, Nightmare Speaker: Ana mills a card for you; you click Pay 3 life, and it stays in her graveyard", async ({ page }) => {
  let s = scene({ board: LANDS }, [{ board: ["Sivriss, Nightmare Speaker", "Sol Ring"], library: ["Craw Wurm", "Hill Giant"] }]);
  const [sivriss, ring] = [one(s, "Sivriss, Nightmare Speaker"), one(s, "Sol Ring")];
  // The card on top of Ana's library as she activates it (she has drawn for her turn by then).
  let giant = "";
  s = botsUntil(
    s,
    (x) => x.pending?.kind === "payUnless" && x.pending.player === 0,
    (x) => {
      // On Ana's turn, she activates Sivriss, sacrificing Sol Ring.
      if (x.activePlayer !== 1 || x.step !== "main1" || x.stack.length || x.pending || waitingOn(x) !== 1 || x.objects[ring]!.zone !== "battlefield") return undefined;
      const plan = planActivate(x, 1, sivriss, 0, [], undefined, undefined, undefined, { sacrifice: [ring] });
      if (!plan) return undefined;
      giant = x.players[1]!.library[0]!;
      for (const a of plan) x = applyAction(x, a);
      return x;
    },
  );
  expect(s.objects[giant]!.zone).toBe("graveyard");
  expect(s.cards[s.objects[giant]!.cardId]!.name).toBe("Hill Giant");
  const life = s.players[0]!.life;
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("3 life");
  await bar.getByRole("button", { name: /^Pay/ }).click();
  const after = await resolveUntil(page, (x) => x.players[0]!.life === life - 3 && !x.pending);
  expect(after.objects[giant]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
