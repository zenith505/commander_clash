// Round 280's prompts: a life bid (Illicit Auction: the number, "Bid N life" and "Don't bid"), Truth or Tale's card from
// the chosen pile, Atris's face-down pile (shown as card backs), and Boneyard Parley's pile put onto the battlefield.
import { expect, test } from "@playwright/test";
import { applyAction, botActions, controllerOf, planCast, waitingOn, type GameState } from "@cc/engine";
import { LANDS, one, open, pageErrors, scene } from "./scene";
import { card, controls, modal, resolveUntil } from "./ui";

const TOP = ["Hill Giant", "Shock", "Sol Ring", "Mind Stone", "Lightning Bolt"];

/** In the engine: bots answer their prompts and everyone passes, until `done`. */
function botsUntil(s: GameState, done: (s: GameState) => boolean): GameState {
  for (let i = 0; i < 200 && !done(s); i++) {
    const pid = waitingOn(s)!;
    s = applyAction(s, pid === 0 ? { type: "passPriority", player: 0 } : botActions(s, pid)[0]!);
  }
  expect(done(s)).toBe(true);
  return s;
}

test("Illicit Auction: top the high bid with the number and Bid, then Don't bid; the high bidder takes the creature", async ({ page }) => {
  const s = scene({ hand: ["Illicit Auction"], board: LANDS }, [{ board: ["Grizzly Bears"] }]);
  const bears = one(s, "Grizzly Bears");
  await open(page, s);
  await card(page, "Illicit Auction", s).click();
  await card(page, "Grizzly Bears", s).click();
  // You start at 0; the bots top it in turn, and it comes back around to you.
  const st = await resolveUntil(page, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "bid" && x.pending.player === 0);
  const min = (st.pending as { numberRange: { min: number } }).numberRange.min;
  expect(min).toBeGreaterThan(1);
  const bar = controls(page);
  await expect(bar).toContainText("Illicit Auction:");
  await expect(bar).toContainText("the high bid is");
  await expect(bar.getByRole("button", { name: "Number minus one" })).toBeDisabled();
  await bar.getByRole("button", { name: "Number plus one" }).click();
  await bar.getByRole("button", { name: `Bid ${min + 1} life` }).click();
  // Once more round the table: either it's yours, or a bot topped you and you decline.
  const next = await resolveUntil(page, (x) => (x.pending?.kind === "chooseOption" && x.pending.what === "bid" && x.pending.player === 0) || (!x.pending && x.stack.length === 0));
  if (next.pending) await controls(page).getByRole("button", { name: "Don't bid" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0);
  const lost = after.players.map((p, i) => s.players[i]!.life - p.life);
  const winner = lost.findIndex((n) => n === Math.max(...lost));
  expect(controllerOf(after, after.objects[bears]!)).toBe(winner);
  expect(after.log.some((l) => /wins the bidding/.test(l.text))).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Truth or Tale: Ana chooses one of your piles, and you pick the card from it for your hand", async ({ page }) => {
  let s = scene({ hand: ["Truth or Tale"], board: LANDS, library: TOP });
  const five = TOP.map((n) => one(s, n));
  for (const a of planCast(s, 0, one(s, "Truth or Tale"))!) s = applyAction(s, a);
  s = botsUntil(s, (x) => x.pending?.kind === "searchLibrary" && x.pending.player === 0);
  // Your piles: Hill Giant and Shock, then the other three.
  s = applyAction(s, { type: "searchLibrary", player: 0, found: [five[0]!, five[1]!] });
  s = applyAction(s, { type: "chooseOption", player: 0, choice: "1" });
  s = botsUntil(s, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "pileCard");
  const options = (s.pending as { options: string[] }).options;
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Truth or Tale: choose a card from the chosen pile to put into your hand");
  const pick = options[0]!;
  await bar.getByRole("button", { name: s.cards[s.objects[pick]!.cardId]!.name, exact: true }).click();
  const mid = await resolveUntil(page, (x) => x.pending?.kind === "arrangeTop" || (!x.pending && x.stack.length === 0));
  if (mid.pending?.kind === "arrangeTop") await page.locator(".modal.arrange").getByRole("button", { name: "Done" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0);
  expect(after.objects[pick]!.zone).toBe("hand");
  expect(five.filter((id) => id !== pick).every((id) => after.objects[id]!.zone === "library")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Atris, Oracle of Half-Truths: the face-down pile shows only card backs; put it into your hand", async ({ page }) => {
  let s = scene({ hand: ["Atris, Oracle of Half-Truths"], board: LANDS, library: TOP.slice(0, 3) });
  const three = TOP.slice(0, 3).map((n) => one(s, n));
  for (const a of planCast(s, 0, one(s, "Atris, Oracle of Half-Truths"))!) s = applyAction(s, a);
  s = botsUntil(s, (x) => x.pending?.kind === "chooseTargets" && x.pending.player === 0);
  s = applyAction(s, { type: "chooseTargets", player: 0, targets: [{ kind: "player", id: 1 }] });
  // Ana looks and separates them; then you choose a pile.
  s = botsUntil(s, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "pile" && x.pending.player === 0);
  const piles = (s.pending as { piles: [string[], string[]] }).piles;
  await open(page, s);
  const picker = modal(page);
  await expect(picker).toContainText("Face-down pile");
  await expect(picker).toContainText("Face-up pile");
  const down = picker.locator('[data-pile="0"]');
  await expect(down.locator(".card.back")).toHaveCount(piles[0].length);
  for (const id of piles[0]) await expect(down).not.toContainText(s.cards[s.objects[id]!.cardId]!.name);
  await picker.getByRole("button", { name: "Put the face-down pile into your hand" }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0 && three.every((id) => x.objects[id]!.zone !== "library"));
  expect(piles[0].every((id) => after.objects[id]!.zone === "hand")).toBe(true);
  expect(piles[1].every((id) => after.objects[id]!.zone === "graveyard")).toBe(true);
  expect(pageErrors(page)).toEqual([]);
});

test("Boneyard Parley: put the pile of your choice onto the battlefield under your control", async ({ page }) => {
  let s = scene({ hand: ["Boneyard Parley"], board: LANDS, yard: ["Hill Giant"] }, [{ yard: ["Grizzly Bears", "Craw Wurm"] }]);
  const [giant, bears, wurm] = [one(s, "Hill Giant"), one(s, "Grizzly Bears"), one(s, "Craw Wurm")];
  const t = (id: string) => ({ kind: "object" as const, id });
  for (const a of planCast(s, 0, one(s, "Boneyard Parley"), [t(giant), t(bears), t(wurm), { kind: "none" }, { kind: "none" }])!) s = applyAction(s, a);
  s = botsUntil(s, (x) => x.pending?.kind === "chooseOption" && x.pending.player === 0);
  if (s.pending?.kind === "chooseOption" && s.pending.what === "opponent") s = applyAction(s, { type: "chooseOption", player: 0, choice: "2" });
  s = botsUntil(s, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "pile" && x.pending.player === 0);
  const piles = (s.pending as { piles: [string[], string[]] }).piles;
  await open(page, s);
  const picker = modal(page);
  await expect(picker).toContainText("choose the pile to put onto the battlefield under your control");
  const mine = piles[0].length >= piles[1].length ? 0 : 1;
  await picker.getByRole("button", { name: `Put pile ${mine + 1} onto the battlefield` }).click();
  const after = await resolveUntil(page, (x) => !x.pending && x.stack.length === 0);
  for (const id of piles[mine]) {
    expect(after.objects[id]!.zone).toBe("battlefield");
    expect(controllerOf(after, after.objects[id]!)).toBe(0);
  }
  for (const id of piles[mine === 0 ? 1 : 0]) expect(after.objects[id]!.zone).toBe("graveyard");
  expect(pageErrors(page)).toEqual([]);
});
