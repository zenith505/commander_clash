import type { Effect } from "../abilities";
import { log, player } from "../game";
import { invalidateCharacteristics } from "../layers";
import { DUNGEONS, INITIATIVE, UNDERCITY, dungeonByName, dungeonDef, type Dungeon } from "../oracle";
import type { GameState, Player, PlayerId } from "../types";
import { ResolveCtx, players } from "./resolve";

/** Venturing into the dungeon (CR 701.49) and taking the initiative (CR 726). */
export function runDungeonsEffect(s: GameState, e: Effect, ctx: ResolveCtx, src: string): "paused" | void {
  switch (e.type) {
    case "takeInitiative":
      for (const pid of players(s, e.who, ctx)) takeInitiative(s, pid);
      return;
    case "venture":
      return venture(s, ctx.controller, !!e.undercity, src);
  }
}

/**
 * Venture into the dungeon (CR 701.49a-c) or into Undercity (701.49d): move the venture marker to the next room,
 * choosing where arrows branch; from the bottommost room, complete that dungeon and start a new one. Choices are
 * kept in the resolution's scratch while it waits on them.
 */
function venture(s: GameState, pid: PlayerId, undercity: boolean, src: string): "paused" | void {
  const p = player(s, pid);
  if (p.lost) return;
  const sc = (s.resolving!.scratch ??= {});
  const cur = p.dungeon && dungeonByName(p.dungeon.name);
  const next = cur ? cur.rooms[p.dungeon!.room]!.next : [];
  if (cur && next.length) {
    let to = next[0]!;
    if (next.length > 1) {
      if (sc.venture === undefined) {
        s.pending = { kind: "chooseOption", player: pid, source: src, what: "venture", options: next.map((i) => cur.rooms[i]!.name), labels: next.map((i) => `${cur.rooms[i]!.name}: ${cur.rooms[i]!.text}`) };
        return "paused";
      }
      to = next.find((i) => cur.rooms[i]!.name === sc.venture) ?? to;
    }
    enterRoom(s, p, cur, to);
    return;
  }
  // From the bottommost room: that dungeon is completed as it's removed from the game (CR 701.49c, 309.7).
  if (cur) completeDungeon(s, p);
  // Only "venture into Undercity" can start Undercity, and it can start no other dungeon (CR 701.49d, rulings).
  const options: Dungeon[] = undercity ? [UNDERCITY] : DUNGEONS.filter((d) => d !== UNDERCITY);
  let d = options[0];
  if (options.length > 1) {
    if (sc.venture === undefined) {
      s.pending = { kind: "chooseOption", player: pid, source: src, what: "venture", options: options.map((x) => x.name) };
      return "paused";
    }
    d = options.find((x) => x.name === sc.venture) ?? d;
  }
  if (!d) return;
  log(s, `${p.name} ventures into ${d.name} (it goes into the command zone).`);
  enterRoom(s, p, d, 0); // the topmost room (CR 309.4a)
}

/** Move the venture marker into a room; its room ability triggers, controlled by the dungeon's owner (CR 309.4c). */
function enterRoom(s: GameState, p: Player, d: Dungeon, room: number) {
  const def = dungeonDef(d);
  s.cards[def.oracleId] ??= def;
  p.dungeon = { name: d.name, room };
  log(s, `${p.name} moves their venture marker into ${d.rooms[room]!.name}.`);
  s.triggerQueue.push({ sourceId: "", sourceCardId: def.oracleId, controller: p.id, index: room });
}

function completeDungeon(s: GameState, p: Player) {
  const name = p.dungeon!.name;
  p.dungeon = undefined;
  (p.completedDungeons ??= []).push(name);
  log(s, `${p.name} completes ${name}.`);
}

/**
 * CR 704.5t: a venture marker on a dungeon's bottommost room, with no room ability of that dungeon waiting to go on
 * the stack or on it, and the dungeon is removed from the game: its owner completes it (CR 309.6-7).
 */
export function dungeonSBAs(s: GameState): boolean {
  let changed = false;
  for (const p of s.players) {
    const d = !p.lost && p.dungeon ? dungeonByName(p.dungeon.name) : undefined;
    if (!d || d.rooms[p.dungeon!.room]!.next.length) continue;
    const id = dungeonDef(d).oracleId;
    const waiting = s.triggerQueue.some((t) => t.sourceCardId === id && t.controller === p.id) || s.stack.some((x) => x.sourceCardId === id && x.controller === p.id);
    if (waiting) continue;
    completeDungeon(s, p);
    changed = true;
  }
  return changed;
}

/**
 * A player takes the initiative (CR 726): whoever had it stops having it (726.3), and "whenever a player takes the
 * initiative, that player ventures into Undercity" triggers, even if they already had it (726.5).
 */
export function takeInitiative(s: GameState, pid: PlayerId) {
  const p = player(s, pid);
  if (p.lost) return;
  s.cards[INITIATIVE.oracleId] ??= INITIATIVE;
  if (s.initiative !== pid) {
    s.initiative = pid;
    invalidateCharacteristics(s);
  }
  log(s, `${p.name} takes the initiative.`);
  initiativeTrigger(s, 2, pid);
}

/**
 * One of the initiative's inherent triggered abilities (CR 726.2): no source, controlled by the player who had the
 * initiative when it triggered (for the third, the player who took it). `eventPlayer`: the controller of the creatures
 * that dealt combat damage to the player with the initiative.
 */
export function initiativeTrigger(s: GameState, index: 0 | 1 | 2, controller: PlayerId, eventPlayer?: PlayerId) {
  s.cards[INITIATIVE.oracleId] ??= INITIATIVE;
  s.triggerQueue.push({ sourceId: "", sourceCardId: INITIATIVE.oracleId, controller, index, ...(eventPlayer !== undefined ? { event: { player: eventPlayer } } : {}) });
}
