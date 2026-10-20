// Round 94: "if you control the creature with the greatest power or tied for the greatest power" (Triumph of Ferocity:
// checked as it resolves, rulings) and Padeem's "the artifact with the greatest mana value or tied" (an intervening if,
// CR 603.4; among artifacts only, rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const ferocity = card("Triumph of Ferocity", "Enchantment", "{2}{G}", { oracleText: "At the beginning of your upkeep, draw a card if you control the creature with the greatest power or tied for the greatest power." });
const padeem = card("Padeem, Consul of Innovation", "Legendary Creature — Vedalken Artificer", "{3}{U}", { power: "1", toughness: "4", oracleText: "Artifacts you control have hexproof. (They can't be the targets of spells or abilities your opponents control.)\nAt the beginning of your upkeep, if you control the artifact with the greatest mana value or tied for the greatest mana value, draw a card." });
const beastmaster = card("Abzan Beastmaster", "Creature — Hound Shaman", "{2}{G}", { power: "2", toughness: "1", oracleText: "At the beginning of your upkeep, draw a card if you control the creature with the greatest toughness or tied for the greatest toughness." });
const ogre = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const tome = card("Jalum Tome", "Artifact", "{3}", { oracleText: "{2}, {T}: Draw a card, then discard a card." });
const ring = card("Sol Ring", "Artifact", "{1}", { oracleText: "{T}: Add {C}{C}." });
const titan = card("Wurmcoil Engine", "Artifact Creature — Phyrexian Wurm", "{6}", { power: "6", toughness: "6" });

/** Hand size after our next upkeep's triggers resolve. */
function upkeepDraws(s0: GameState, ap: PlayerId) {
  let s = passUntil(s0, "upkeep", ap);
  const before = s.players[ap]!.hand.length;
  for (let i = 0; i < 20 && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s.players[ap]!.hand.length - before;
}

describe("the one with the greatest power, toughness or mana value", () => {
  it("parse", () => {
    for (const d of [ferocity, padeem, beastmaster]) expect(isFullySupported(d), d.name).toBe(true);
  });

  for (const tied of [true, false])
    it(`Triumph of Ferocity: ${tied ? "tied for greatest draws" : "a bigger creature elsewhere doesn't"}`, () => {
      const { s, ap, opp } = setup([]);
      putOnBattlefield(s, ap, ferocity);
      putOnBattlefield(s, ap, ogre);
      putOnBattlefield(s, opp, tied ? ogre : titan);
      expect(upkeepDraws(s, ap)).toBe(tied ? 1 : 0);
    });

  it("Abzan Beastmaster: by toughness", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, beastmaster);
    putOnBattlefield(s, ap, card("Wall of Stone", "Creature — Wall", "{1}{R}{R}", { power: "0", toughness: "8" }));
    putOnBattlefield(s, opp, titan);
    expect(upkeepDraws(s, ap)).toBe(1);
  });

  for (const mine of [true, false])
    it(`Padeem: ${mine ? "our artifact has the greatest mana value" : "theirs is bigger"}`, () => {
      const { s, ap, opp } = setup([]);
      putOnBattlefield(s, ap, padeem); // a creature with mana value 4: not an artifact, so it doesn't count
      putOnBattlefield(s, ap, tome);
      putOnBattlefield(s, opp, ring);
      if (!mine) putOnBattlefield(s, opp, titan);
      putOnBattlefield(s, opp, bear());
      expect(upkeepDraws(s, ap)).toBe(mine ? 1 : 0);
    });
});
