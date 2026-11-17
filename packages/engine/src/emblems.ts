// Emblems (CR 114): markers in the command zone with abilities and no other characteristics.
//
// "[Player] gets an emblem with [ability]" puts one into the command zone, owned and controlled by that player (114.2).
// It has no types, no mana cost, no color (114.3), isn't a card or a permanent (114.5), and its abilities work in the
// command zone (114.4). Here an emblem is a GameObject in the "command" zone with `emblem` set, listed in
// GameState.emblems (not in its owner's command zone list, which holds the commanders). Its abilities are the text of
// its CardDef: layers.ts applies its static abilities, fireEvent (effects/triggers.ts) looks at its triggered abilities
// for the events in EMBLEM_EVENTS (oracle/grants.ts), and cost changes and "no maximum hand size" are read from it in
// game.ts. A player who leaves the game takes their emblems with them (CR 800.4a).

import type { CardDef, GameObject, GameState, PlayerId } from "./types";

/**
 * Oko, Shadowmoor Scion (round 387): an emblem whose abilities read "the chosen type", the creature type chosen as the
 * ability that made it resolved (kept on the emblem as GameObject.chosen).
 */
export const CHOSEN_TYPE_EMBLEM = "|chosenType";

/** The emblem's definition: no characteristics but its abilities (CR 114.3). Named for where it came from, for the log. */
export function emblemDef(abilities: string[], from: string, chosenType?: true): CardDef {
  const text = abilities.join("\n");
  return {
    oracleId: `emblem:${from}:${text}${chosenType ? CHOSEN_TYPE_EMBLEM : ""}`,
    name: `${from} emblem`,
    manaCost: "",
    cmc: 0,
    typeLine: "Emblem",
    supertypes: [],
    types: [],
    subtypes: [],
    oracleText: text,
    colors: [],
    colorIdentity: [],
    keywords: [],
  };
}

/** Put an emblem with these abilities into `pid`'s command zone (CR 114.2). */
export function createEmblem(s: GameState, pid: PlayerId, abilities: string[], from: string, chosenType?: string): GameObject {
  const d = emblemDef(abilities, from, chosenType !== undefined ? true : undefined);
  s.cards[d.oracleId] ??= d;
  const o: GameObject = {
    id: `o${s.nextId++}`,
    cardId: d.oracleId,
    owner: pid,
    controller: pid,
    zone: "command",
    timestamp: s.nextTimestamp++,
    tapped: false,
    controlledSinceTurn: 0,
    damage: 0,
    deathtouchDamage: false,
    counters: {},
    isCommander: false,
    isToken: false,
    emblem: true,
    ...(chosenType !== undefined ? { chosen: { type: chosenType } } : {}),
  };
  s.objects[o.id] = o;
  (s.emblems ??= []).push(o.id);
  return o;
}

/** The emblems whose abilities work now: those of players still in the game (CR 114.4, 800.4a). */
export function liveEmblems(s: GameState): GameObject[] {
  return (s.emblems ?? []).map((id) => s.objects[id]!).filter((o) => !s.players[o.owner]!.lost);
}
