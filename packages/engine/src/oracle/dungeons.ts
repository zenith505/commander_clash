// Dungeons (CR 309): cards outside the game that venture into the dungeon brings into the command zone (CR 701.49).
// Each room has a room ability, "When you move your venture marker into this room, [effect]" (CR 309.4c).

import type { AbilityBody, TriggeredAbility } from "../abilities";
import type { CardDef } from "../types";
import { parseBody } from "./body";

export interface DungeonRoom {
  name: string;
  /** The room ability's effect, as printed. */
  text: string;
  /** The rooms its arrows point to (CR 309.5a); none for the bottommost room. */
  next: number[];
  /** Its effect when the text isn't one the compiler reads. */
  body?: AbilityBody;
}

export interface Dungeon {
  name: string;
  rooms: DungeonRoom[];
}

/**
 * Undercity (Commander Legends: Battle for Baldur's Gate), the dungeon the initiative ventures into (CR 726.2). Only
 * "venture into Undercity" can start it (CR 701.49d, rulings).
 */
export const UNDERCITY: Dungeon = {
  name: "Undercity",
  rooms: [
    { name: "Secret Entrance", text: "Search your library for a basic land card, reveal it, put it into your hand, then shuffle.", next: [1, 2] },
    { name: "Forge", text: "Put two +1/+1 counters on target creature.", next: [3, 4] },
    { name: "Lost Well", text: "Scry 2.", next: [4, 5] },
    { name: "Trap!", text: "Target player loses 5 life.", next: [6] },
    { name: "Arena", text: "Goad target creature.", next: [6, 7] },
    { name: "Stash", text: "Create a Treasure token.", next: [7] },
    { name: "Archives", text: "Draw a card.", next: [8] },
    { name: "Catacombs", text: "Create a 4/1 black Skeleton creature token with menace.", next: [8] },
    {
      name: "Throne of the Dead Three",
      text: "Reveal the top ten cards of your library. Put a creature card from among them onto the battlefield with three +1/+1 counters on it. It gains hexproof until your next turn. Then shuffle.",
      next: [],
      body: {
        targets: [],
        effects: [
          {
            type: "dig",
            n: 10,
            count: 1,
            upTo: false,
            required: true,
            filter: { kind: "card", types: ["Creature"], text: "creature card" },
            into: "battlefield",
            counters: { counter: "+1/+1", n: 3 },
            rest: "shuffle",
            reveal: true,
          },
          { type: "continuous", what: { ref: "created" }, mods: [{ kind: "addKeywords", keywords: ["Hexproof"] }], duration: "yourNextTurn" },
        ],
        text: "Reveal the top ten cards of your library. Put a creature card from among them onto the battlefield with three +1/+1 counters on it. It gains hexproof until your next turn. Then shuffle.",
      },
    },
  ],
};

/**
 * "Venture into the dungeon" lets its player choose Lost Mine of Phandelver, Dungeon of the Mad Mage or Tomb of
 * Annihilation (CR 701.49a). Some of their rooms aren't modeled yet (Tomb of Annihilation's "loses 2 life unless they
 * discard a card", the Mad Mage's last room), so cards that venture into the dungeon stay unsupported.
 */
export const DUNGEONS: Dungeon[] = [UNDERCITY];

export const dungeonByName = (name: string) => DUNGEONS.find((d) => d.name === name);

/** The room's ability (CR 309.4c), or null if it isn't modeled. */
export function roomBody(room: DungeonRoom): AbilityBody | null {
  return room.body ?? parseBody(room.text);
}

/** Every room ability of the dungeon can be compiled. */
export const dungeonSupported = (d: Dungeon) => d.rooms.every((r) => roomBody(r) !== null);

/** The dungeon card, which is the source of its room abilities (CR 309.4c). Its triggers are its rooms, in order. */
export function dungeonDef(d: Dungeon): CardDef {
  return {
    oracleId: `dungeon:${d.name}`,
    name: d.name,
    manaCost: "",
    cmc: 0,
    typeLine: "Dungeon",
    supertypes: [],
    types: ["Dungeon"],
    subtypes: [],
    oracleText: d.rooms.map((r) => `${r.name} — ${r.text}`).join("\n"),
    colors: [],
    colorIdentity: [],
    keywords: [],
  };
}

export function dungeonTriggers(oracleId: string): TriggeredAbility[] | undefined {
  const d = oracleId.startsWith("dungeon:") ? dungeonByName(oracleId.slice("dungeon:".length)) : undefined;
  return d?.rooms.map((r) => ({ event: "ventureRoom", body: { ...roomBody(r)!, text: `${r.name} — ${r.text}` } }));
}
