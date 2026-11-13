// Round 339's prompts: Reservoir Kraken's "any opponent may tap an untapped creature they control" (the choice, then which
// creature), Kusari-Gama's defending player chosen when the equipped creature isn't attacking (CR 508.5a), and Godsend's
// "you may exile one of those creatures" (a pick among the creatures blocking it, or none).
import { expect, test } from "@playwright/test";
import { applyAction, botActions, invalidateCharacteristics, planActivate, waitingOn, type GameState, type PlayerId } from "@cc/engine";
import { LANDS, idsOf, one, open, pageErrors, playUntil, scene } from "./scene";
import { controls, resolveUntil } from "./ui";

/** In the engine: you attack with `attacks`; each defending player blocks as `blocks` says; on to the declare blockers step with an empty stack. */
function attackAndBlock(s: GameState, attacks: { attacker: string; defender: PlayerId }[], blocks: { blocker: string; attacker: string }[]): GameState {
  s = playUntil(s, (st) => st.pending?.kind === "declareAttackers" && st.pending.player === 0);
  s = applyAction(s, { type: "declareAttackers", player: 0, attacks });
  for (let i = 0; i < 300; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = applyAction(s, { type: "declareBlockers", player: p.player, blocks: blocks.filter((b) => s.objects[b.blocker]!.controller === p.player) });
    else if (p && p.player !== 0) s = applyAction(s, botActions(s, p.player)[0]!);
    else if (p) return s;
    else if (s.step === "declareBlockers" && !s.stack.length && !s.triggerQueue.length && waitingOn(s) === 0) return s;
    else s = applyAction(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error("never got to blocks");
}

test("Reservoir Kraken on your turn: tap your Elite Vanguard for it; Ana gets one Fish and the Kraken taps", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Grizzly Bears", "Elite Vanguard"] }, [{ board: ["Reservoir Kraken"] }]);
  const kraken = one(s0, "Reservoir Kraken");
  const bears = one(s0, "Grizzly Bears");
  const vanguard = one(s0, "Elite Vanguard");
  const s = playUntil(s0, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "punisher" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Tap an untapped creature you control? If anyone does, tap Reservoir Kraken and create a 1/1 blue Fish creature token");
  await expect(bar.getByRole("button", { name: "Don't" })).toBeVisible();
  await bar.getByRole("button", { name: "Tap an untapped creature you control" }).click();
  await resolveUntil(page, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0 && st.pending.action === "tap");
  await page.locator(`[data-obj="${vanguard}"]`).click();
  await bar.getByRole("button", { name: "Tap 1" }).click();
  const after = await resolveUntil(page, (st) => !!st.objects[kraken]!.tapped && st.stack.length === 0 && !st.pending);
  expect(after.objects[vanguard]!.tapped).toBe(true);
  expect(after.objects[bears]!.tapped).toBe(false);
  const fish = after.battlefield.filter((id) => after.objects[id]!.isToken && after.objects[id]!.controller === 1);
  expect(fish.length).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Kusari-Gama on Prodigal Pyromancer, not attacking: its ping at Ana's blocker lets you choose Ben as defending player", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Prodigal Pyromancer", "Kusari-Gama", "Grizzly Bears", "Elite Vanguard"] }, [{ board: ["Wall of Stone"] }, { board: ["Llanowar Elves"] }]);
  const pyro = one(s0, "Prodigal Pyromancer");
  s0.objects[one(s0, "Kusari-Gama")]!.attachedTo = pyro;
  invalidateCharacteristics(s0);
  const wall = one(s0, "Wall of Stone");
  const elves = one(s0, "Llanowar Elves");
  const bears = one(s0, "Grizzly Bears");
  let s = attackAndBlock(s0, [{ attacker: bears, defender: 1 }, { attacker: one(s0, "Elite Vanguard"), defender: 2 }], [{ blocker: wall, attacker: bears }]);
  for (const a of planActivate(s, 0, pyro, 0, [{ kind: "object", id: wall }])!) s = applyAction(s, a);
  s = playUntil(s, (st) => st.pending?.kind === "chooseOption" && st.pending.what === "defendingPlayer" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("Kusari-Gama: choose the defending player whose other creatures it deals the damage to");
  await expect(bar.getByRole("button", { name: "Ana" })).toBeVisible();
  await bar.getByRole("button", { name: "Ben" }).click();
  const after = await resolveUntil(page, (st) => st.objects[elves]!.zone === "graveyard");
  expect(after.objects[wall]!.damage).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});

test("Godsend: your Grizzly Bears blocked by Ana's two creatures; exile her Llanowar Elves", async ({ page }) => {
  const s0 = scene({ board: [...LANDS, "Grizzly Bears", "Godsend"] }, [{ board: ["Llanowar Elves", "Wall of Stone"] }]);
  const bears = one(s0, "Grizzly Bears");
  s0.objects[one(s0, "Godsend")]!.attachedTo = bears;
  invalidateCharacteristics(s0);
  const elves = one(s0, "Llanowar Elves");
  const wall = one(s0, "Wall of Stone");
  let s = attackAndBlock(s0, [{ attacker: bears, defender: 1 }], [{ blocker: elves, attacker: bears }, { blocker: wall, attacker: bears }]);
  s = playUntil(s, (st) => st.pending?.kind === "pickPermanents" && st.pending.player === 0);
  await open(page, s);
  const bar = controls(page);
  await expect(bar).toContainText("you may exile one of those creatures");
  await expect(bar.getByRole("button", { name: "Exile none" })).toBeVisible();
  await page.locator(`[data-obj="${elves}"]`).click();
  await bar.getByRole("button", { name: "Exile", exact: true }).click();
  const after = await resolveUntil(page, (st) => st.objects[elves]!.zone === "exile" && !st.pending);
  expect(after.objects[wall]!.zone).toBe("battlefield");
  expect(idsOf(after, "Llanowar Elves", "exile").length).toBe(1);
  expect(pageErrors(page)).toEqual([]);
});
