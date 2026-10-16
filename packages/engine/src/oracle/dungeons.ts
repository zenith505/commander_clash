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
 * The dungeons "venture into the dungeon" can start (CR 701.49a), from Adventures in the Forgotten Realms. Dungeon of the
 * Mad Mage's text is the card data's; Lost Mine of Phandelver and Tomb of Annihilation aren't in it (Scryfall lists
 * them as tokens), so theirs is the printed cards'.
 */
export const LOST_MINE: Dungeon = {
  name: "Lost Mine of Phandelver",
  rooms: [
    { name: "Cave Entrance", text: "Scry 1.", next: [1, 2] },
    { name: "Goblin Lair", text: "Create a 1/1 red Goblin creature token.", next: [3, 4] },
    { name: "Mine Tunnels", text: "Create a Treasure token.", next: [4, 5] },
    { name: "Storeroom", text: "Put a +1/+1 counter on target creature.", next: [6] },
    { name: "Dark Pool", text: "Each opponent loses 1 life and you gain 1 life.", next: [6] },
    { name: "Fungi Cavern", text: "Target creature gets -4/-0 until your next turn.", next: [6] },
    { name: "Temple of Dumathoin", text: "Draw a card.", next: [] },
  ],
};

export const MAD_MAGE: Dungeon = {
  name: "Dungeon of the Mad Mage",
  rooms: [
    { name: "Yawning Portal", text: "You gain 1 life.", next: [1] },
    { name: "Dungeon Level", text: "Scry 1.", next: [2, 3] },
    { name: "Goblin Bazaar", text: "Create a Treasure token.", next: [4] },
    { name: "Twisted Caverns", text: "Target creature can't attack until your next turn.", next: [4] },
    { name: "Lost Level", text: "Scry 2.", next: [5, 6] },
    { name: "Runestone Caverns", text: "Exile the top two cards of your library. You may play them.", next: [7] },
    { name: "Muiral's Graveyard", text: "Create two 1/1 black Skeleton creature tokens.", next: [7] },
    { name: "Deep Mines", text: "Scry 3.", next: [8] },
    {
      name: "Mad Wizard's Lair",
      text: "Draw three cards and reveal them. You may cast one of them without paying its mana cost.",
      next: [],
      body: {
        targets: [],
        effects: [
          { type: "draw", who: { ref: "you" }, n: 3 },
          { type: "castFromHand", filter: { kind: "spell", text: "spell" }, drawn: true },
        ],
        text: "Draw three cards and reveal them. You may cast one of them without paying its mana cost.",
      },
    },
  ],
};

export const TOMB_OF_ANNIHILATION: Dungeon = {
  name: "Tomb of Annihilation",
  rooms: [
    { name: "Trapped Entry", text: "Each player loses 1 life.", next: [1, 2] },
    { name: "Veils of Fear", text: "Each player loses 2 life unless they discard a card.", next: [3] },
    { name: "Oubliette", text: "Discard a card and sacrifice an artifact, a creature, and a land.", next: [4] },
    { name: "Sandfall Cell", text: "Each player loses 2 life unless they sacrifice an artifact, a creature, or a land.", next: [4] },
    { name: "Cradle of the Death God", text: "Create The Atropal, a legendary 4/4 black God Horror creature token with deathtouch.", next: [] },
  ],
};

export const DUNGEONS: Dungeon[] = [UNDERCITY, LOST_MINE, MAD_MAGE, TOMB_OF_ANNIHILATION];

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
