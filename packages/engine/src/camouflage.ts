// Camouflage (round 462): "Cast this spell only during your declare attackers step. This turn, instead of declaring
// blockers, each defending player chooses any number of creatures they control and divides them into a number of piles
// equal to the number of attacking creatures for whom that player is the defending player. Creatures those players
// control that can block additional creatures may likewise be put into additional piles. Assign each pile to a different
// one of those attacking creatures at random. Each creature in a pile that can block the creature that pile is assigned
// to does so. (Piles can be empty.)"
//
// It replaces the turn-based action of declaring blockers (CR 509.1) this turn, in each combat (GameState.camouflageTurn).
// How the engine reads it, with no rulings on the card to go by:
// - Each defending player (CR 506.2), in turn order from the active player (CR 101.4), makes their piles one at a time,
//   seeing the piles made before. A creature goes in one pile (CR 700.3a), or in as many as the creatures it can block
//   (maxBlocks: "can block additional creatures"). Piles can be empty (CR 700.3d).
// - Once every player has made their piles, each player's piles are assigned to that player's attackers in a random order
//   (rng.ts shuffle), one pile to each.
// - "Each creature in a pile that can block the creature that pile is assigned to does so": blocking still follows the
//   rules for blocks (CR 509.1a-b): an untapped creature (509.1a), not one that can't block or can't block that attacker
//   (blockProblem: evasion, protection, "can't block"), and the blocks together obey the restrictions (blockRestrictions:
//   menace and other minimum numbers of blockers, "can't be blocked by more than one creature", "can't block alone",
//   limits on blockers each combat). When not all of them can block together, as many block as can; when there's more
//   than one way to do that, the defending player chooses which (they'd otherwise have declared the blocks).
// - Nothing is declared, so no requirement makes a creature block (CR 509.1c: Lure's "able to block it do so" has no
//   declaration to check) and no cost to block is paid (509.1d-f): a creature that could block only by paying a cost
//   doesn't block. No other player declares these blocks for the defending player (Odric's effect replaces the
//   declaration Camouflage has already replaced).
// - The creatures that block become blocking creatures (CR 509.1g) and their attackers blocked (509.1h); "whenever ~
//   blocks" and "becomes blocked" abilities trigger once every player's blocks are made (CR 509.1i, 509.3a-d).

import { objIsType } from "./cards";
import { fireEvent } from "./effects/triggers";
import {
  attackers,
  blockCost,
  blockLifeCost,
  blockProblem,
  blockRestrictions,
  cantBlockNow,
  livingPlayers,
  log,
  markBlocks,
  maxBlocks,
  nameOf,
  obj,
  player,
  runStateBasedActions,
  turnOrderFrom,
  untappedForBlocking,
} from "./game";
import { characteristics, controllerOf } from "./layers";
import { shuffle } from "./rng";
import { RulesError, type GameObject, type GameState, type ObjectId, type PlayerId } from "./types";

type Block = { blocker: ObjectId; attacker: ObjectId };

/** Whether Camouflage's effect replaces declaring blockers now (CR 509.1). */
export const camouflageNow = (s: GameState): boolean => s.camouflageTurn === s.turn;

/** The creatures attacking this player, or a planeswalker they control or a battle they protect (CR 506.2). */
const attackersOf = (s: GameState, pid: PlayerId): GameObject[] => attackers(s).filter((a) => a.attacking === pid);

/** As the declare blockers step begins, Camouflage's piles instead of declarations: the defending players in turn order. */
export function beginCamouflage(s: GameState): void {
  const order = turnOrderFrom(s, s.activePlayer).filter((pid) => livingPlayers(s).includes(pid) && attackersOf(s, pid).length > 0);
  s.camouflage = { stage: "piles", queue: order, order, piles: {} };
  log(s, "Camouflage: instead of declaring blockers, each defending player divides creatures into piles.");
  nextCamouflage(s);
}

/** How many piles `o` is in already. */
const uses = (piles: ObjectId[][], id: ObjectId) => piles.filter((p) => p.includes(id)).length;

/** The next question of Camouflage's, or its blocks once every answer is in. */
function nextCamouflage(s: GameState): void {
  const c = s.camouflage!;
  while (c.stage === "piles") {
    const pid = c.queue[0];
    if (pid === undefined) {
      assignPiles(s);
      break;
    }
    const n = attackersOf(s, pid).length;
    const piles = (c.piles[pid] ??= []);
    if (player(s, pid).lost || piles.length >= n) {
      c.queue.shift();
      continue;
    }
    // Any creatures they control (CR 700.3a: each in one pile), one that can block more creatures in as many piles.
    const options = s.battlefield.filter((id) => {
      const o = obj(s, id);
      return controllerOf(s, o) === pid && objIsType(s, o, "Creature") && uses(piles, id) < Math.min(maxBlocks(s, o), n);
    });
    if (!options.length) {
      piles.push([]);
      continue;
    }
    const k = piles.length + 1;
    s.pending = {
      kind: "pickPermanents",
      player: pid,
      source: "Camouflage",
      action: "choose",
      what: "creature",
      options,
      count: options.length,
      min: 0,
      camouflage: true,
      prompt: `Camouflage: pile ${k} of ${n} (one for each creature attacking you): click any creatures you control to put in it, or none. Each pile is assigned to a different attacking creature at random, and the creatures in it that can block that creature do.${options.some((id) => maxBlocks(s, obj(s, id)) > 1) ? " A creature that can block additional creatures may go in more piles." : ""}`,
    };
    return;
  }
  if (c.stage === "blocks") nextBlocks(s);
}

/** The creatures picked for this player's next pile (pickPermanents with `camouflage`). */
export function chooseCamouflagePile(s: GameState, pid: PlayerId, ids: ObjectId[]): void {
  const pend = s.pending;
  const c = s.camouflage;
  if (pend?.kind !== "pickPermanents" || !pend.camouflage || pend.player !== pid || !c || c.stage !== "piles") throw new RulesError("nothing to pick");
  const piles = (c.piles[pid] ??= []);
  piles.push([...ids]);
  s.pending = null;
  log(s, `${player(s, pid).name} makes pile ${piles.length}${ids.length ? `: ${ids.map((id) => nameOf(s, id)).join(", ")}` : " (empty)"}.`);
  nextCamouflage(s);
}

/** Each defending player's piles assigned to their attacking creatures, a different one each, at random. */
function assignPiles(s: GameState): void {
  const c = s.camouflage!;
  c.assigned = {};
  for (const pid of c.order) {
    if (player(s, pid).lost) continue;
    const atk = attackersOf(s, pid).map((a) => a.id);
    shuffle(s, atk);
    const piles = c.piles[pid] ?? [];
    c.assigned[pid] = atk.map((attacker, i) => ({ attacker, pile: piles[i] ?? [] }));
    for (const [i, a] of c.assigned[pid]!.entries()) log(s, `${player(s, pid).name}'s pile ${i + 1}${a.pile.length ? ` (${a.pile.map((id) => nameOf(s, id)).join(", ")})` : " (empty)"} is assigned to ${nameOf(s, a.attacker)}.`);
  }
  c.stage = "blocks";
  c.queue = [...c.order];
}

/** Whether this creature can block this attacker on its own, with nothing to pay (CR 509.1a-b, d). */
function canBlock(s: GameState, pid: PlayerId, b: GameObject, at: GameObject): boolean {
  if (b.zone !== "battlefield" || controllerOf(s, b) !== pid || !objIsType(s, b, "Creature") || !untappedForBlocking(s, b) || cantBlockNow(s, b)) return false;
  if (at.zone !== "battlefield" || at.attacking !== pid || blockProblem(s, b, at)) return false;
  const one = [{ blocker: b.id, attacker: at.id }];
  return !blockCost(s, 1, [b.id], one) && !blockLifeCost(s, one) && !characteristics(s, b).ownBlockCosts.length;
}

/** Whether these blocks together obey every restriction (game.ts blockRestrictions). */
function legal(s: GameState, pid: PlayerId, blocks: Block[]): boolean {
  try {
    blockRestrictions(s, player(s, pid), player(s, pid), blocks);
    return true;
  } catch {
    return false;
  }
}

/** The largest sets of these blocks that obey the restrictions together: all of them, or each way of leaving out the fewest. */
export function largestLegalBlocks(s: GameState, pid: PlayerId, all: Block[]): Block[][] {
  if (legal(s, pid, all)) return [all];
  const n = all.length;
  let checks = 0;
  for (let k = n - 1; k >= 1; k--) {
    const found: Block[][] = [];
    // Every way of choosing k of them, in order (a few thousand checks at most for any board a game reaches).
    const pick = (from: number, chosen: number[]) => {
      if (checks > 20000) return;
      if (chosen.length === k) {
        checks++;
        const set = chosen.map((i) => all[i]!);
        if (legal(s, pid, set)) found.push(set);
        return;
      }
      for (let i = from; i <= n - (k - chosen.length); i++) pick(i + 1, [...chosen, i]);
    };
    pick(0, []);
    if (found.length) return found;
  }
  return [[]];
}

/** Each defending player's creatures that can block the attacker their pile is assigned to do so; then the blocks triggers. */
function nextBlocks(s: GameState): void {
  const c = s.camouflage!;
  while (c.queue.length) {
    const pid = c.queue[0]!;
    if (player(s, pid).lost) {
      c.queue.shift();
      continue;
    }
    const all: Block[] = [];
    for (const a of c.assigned?.[pid] ?? []) {
      const at = s.objects[a.attacker];
      for (const id of a.pile) {
        const b = s.objects[id];
        if (b && at && canBlock(s, pid, b, at)) all.push({ blocker: id, attacker: a.attacker });
      }
    }
    const sets = largestLegalBlocks(s, pid, all);
    if (sets.length > 1) {
      c.choices = sets;
      s.pending = {
        kind: "chooseOption",
        player: pid,
        source: "Camouflage",
        what: "camouflageBlocks",
        options: sets.map((_, i) => String(i)),
        labels: sets.map((set) => set.map((b) => `${nameOf(s, b.blocker)} blocks ${nameOf(s, b.attacker)}`).join(", ")),
        prompt: "Camouflage: not every creature in your piles can block together; choose which blocks are made (as many as can be)",
      };
      return;
    }
    blocksMade(s, pid, sets[0]!);
  }
  finishCamouflage(s);
}

/** This player's Camouflage blocks are made. */
function blocksMade(s: GameState, pid: PlayerId, blocks: Block[]): void {
  const c = s.camouflage!;
  const p = player(s, pid);
  markBlocks(s, p, p, blocks);
  if (!blocks.length) log(s, `None of ${p.name}'s creatures block.`);
  c.queue.shift();
  c.choices = undefined;
}

/** The blocks chosen among the largest sets (chooseOption `camouflageBlocks`). */
export function chooseCamouflageBlocks(s: GameState, pid: PlayerId, choice: string): void {
  const c = s.camouflage;
  const set = c?.choices?.[Number(choice)];
  if (!c || c.stage !== "blocks" || c.queue[0] !== pid || !set) throw new RulesError("nothing to choose");
  s.pending = null;
  blocksMade(s, pid, set);
  nextBlocks(s);
}

/** Every defending player's blocks are made: "blocks" and "becomes blocked" abilities trigger (CR 509.1i, 509.3). */
function finishCamouflage(s: GameState): void {
  s.camouflage = undefined;
  s.pending = null;
  fireEvent(s, { type: "blocksDeclared" });
  runStateBasedActions(s);
}

/** A player left the game while Camouflage was asking them (CR 800.4a): the others carry on. */
export function camouflageLeft(s: GameState, pid: PlayerId): void {
  const c = s.camouflage;
  if (!c) return;
  const asked = s.pending?.player === pid;
  c.queue = c.queue.filter((q) => q !== pid);
  c.order = c.order.filter((q) => q !== pid);
  if (asked) {
    s.pending = null;
    nextCamouflage(s);
  }
}
