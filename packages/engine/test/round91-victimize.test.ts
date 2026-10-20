// Victimize (round 91): "Choose two target creature cards in your graveyard. Sacrifice a creature. If you do, return
// the chosen cards to the battlefield tapped." The two cards are targets, chosen as it's cast (CR 601.2c); the creature
// is sacrificed as it resolves, and only then do they return (rulings). An illegal target is left out (CR 608.2b).

import { describe, expect, it } from "vitest";
import { bear, card, cast, putOnBattlefield, setup, target } from "./helpers";
import { invalidateCharacteristics, isFullySupported, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const victimize = card("Victimize", "Sorcery", "{2}{B}", { oracleText: "Choose two target creature cards in your graveyard. Sacrifice a creature. If you do, return the chosen cards to the battlefield tapped." });
const ogre = card("Hulking Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3" });
const elf = card("Elvish Mystic", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1" });

function toYard(s: GameState, pid: PlayerId, def: CardDef): string {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  Object.assign(s.objects[id]!, { zone: "graveyard", timestamp: s.nextTimestamp++ });
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
}

describe("Victimize", () => {
  it("parse", () => expect(isFullySupported(victimize)).toBe(true));

  it("sacrifice a creature, then both cards return tapped", () => {
    const { s: s0, ap, ids } = setup([victimize]);
    const b = putOnBattlefield(s0, ap, bear());
    const o = toYard(s0, ap, ogre);
    const e = toYard(s0, ap, elf);
    const s = cast(s0, ap, ids[0]!, [target(o), target(e)]);
    expect(s.battlefield).not.toContain(b);
    expect(s.players[ap]!.graveyard).toContain(b);
    for (const id of [o, e]) {
      const now = s.battlefield.map((x) => s.objects[x]!).find((x) => x.cardId === s0.objects[id]!.cardId);
      expect(now?.tapped).toBe(true);
    }
  });

  it("with no creature to sacrifice, nothing returns", () => {
    const { s: s0, ap, ids } = setup([victimize]);
    const o = toYard(s0, ap, ogre);
    const e = toYard(s0, ap, elf);
    const s = cast(s0, ap, ids[0]!, [target(o), target(e)]);
    const names = s.battlefield.map((x) => s.cards[s.objects[x]!.cardId]!.name);
    expect(names).not.toContain("Hulking Ogre");
    expect(names).not.toContain("Elvish Mystic");
  });
});
