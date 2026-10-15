// Hideaway lands' conditions that look back over the turn: Spinerock Knoll's "if an opponent was dealt 7 or more damage
// this turn" (in total, from any sources, rulings) and Windbrisk Heights' "if you attacked with three or more creatures
// this turn" (different creatures you declared as attackers, rulings). The play is checked as the ability resolves
// (CR 702.75a, 608.2c).

import { describe, expect, it } from "vitest";
import { act, bear, card, mountain, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("can't do that");
  for (const a of plan) s = act(s, a);
  return s;
};
function settle(s: GameState) {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
const player = (pid: PlayerId) => ({ kind: "player" as const, id: pid });

// Real oracle text (Scryfall).
const hideaway = "Hideaway 4 (When this land enters, look at the top four cards of your library, exile one face down, then put the rest on the bottom in a random order.)\nThis land enters tapped.";
const knoll = card("Spinerock Knoll", "Land", "", { keywords: ["Hideaway"], oracleText: `${hideaway}\n{T}: Add {R}.\n{R}, {T}: You may play the exiled card without paying its mana cost if an opponent was dealt 7 or more damage this turn.` });
const heights = card("Windbrisk Heights", "Land", "", { keywords: ["Hideaway"], oracleText: `${hideaway}\n{T}: Add {W}.\n{W}, {T}: You may play the exiled card without paying its mana cost if you attacked with three or more creatures this turn.` });
const phoenix = card("Lightning Phoenix", "Creature — Phoenix", "{2}{R}", { power: "2", toughness: "2", oracleText: "Flying, haste\nThis creature can't block.\nAt the beginning of your end step, if an opponent was dealt 3 or more damage this turn, you may pay {R}. If you do, return this card from your graveyard to the battlefield." });
const minas = card("Minas Tirith", "Legendary Land", "", { oracleText: "Minas Tirith enters tapped unless you control a legendary creature.\n{T}: Add {W}.\n{1}{W}, {T}: Draw a card. Activate only if you attacked with two or more creatures this turn." });
const lavaAxe = card("Lava Axe", "Sorcery", "{4}{R}", { oracleText: "Lava Axe deals 5 damage to target player or planeswalker." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

/** Plays the hideaway land from the hand and hides away a creature card from the top four; the land is untapped. */
function hide(s0: GameState, ap: PlayerId, land: ObjectId) {
  s0.players[ap]!.landsPlayedThisTurn = 0;
  const creature = s0.players[ap]!.library.slice(0, 4).find((id) => s0.cards[s0.objects[id]!.cardId]!.typeLine.includes("Creature"))!;
  expect(creature).toBeDefined();
  let s = settle(act(s0, { type: "playLand", player: ap, objectId: land }));
  s = settle(act(s, { type: "searchLibrary", player: ap, found: [creature] }));
  expect(s.objects[creature]!.zone).toBe("exile");
  s.objects[land]!.tapped = false;
  const index = abilitiesOf(s, s.objects[land]!).activated.findIndex((a) => JSON.stringify(a.body).includes("playLinked"));
  return { s, creature, index };
}

describe("hideaway conditions that look back over the turn", () => {
  it("parses", () => {
    supported(knoll, heights, phoenix, minas);
  });

  it("Spinerock Knoll: plays the card once an opponent has been dealt 7 damage this turn, in total", () => {
    const { s: s0, ap, opp, ids } = setup([knoll, lavaAxe, shock]);
    let { s, creature, index } = hide(s0, ap, ids[0]!);
    for (let i = 0; i < 3; i++) putOnBattlefield(s, ap, mountain); // red for both spells and two activations
    s = settle(run(s, planCast(s, ap, ids[1]!, [player(opp)])));
    expect(s.damageThisTurn?.[opp]).toBe(5);
    s.objects[ids[0]!]!.tapped = false; // it may have paid for Lava Axe
    s = settle(run(s, planActivate(s, ap, ids[0]!, index)));
    expect(s.pending).toBeFalsy();
    expect(s.objects[creature]!.zone).toBe("exile");
    s = settle(run(s, planCast(s, ap, ids[2]!, [player(opp)])));
    s.objects[ids[0]!]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, ids[0]!, index)));
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: creature });
  });

  it("Spinerock Knoll: damage to two different opponents doesn't add up, and it's only this turn's", () => {
    const { s: s0, ap, opp, ids } = setup([knoll]);
    let { s, creature, index } = hide(s0, ap, ids[0]!);
    const other = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    s.damageThisTurn = { [opp]: 6, [other]: 6 };
    s = settle(run(s, planActivate(s, ap, ids[0]!, index)));
    expect(s.pending).toBeFalsy();
    expect(s.objects[creature]!.zone).toBe("exile");
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(s.damageThisTurn).toBeUndefined();
  });

  it("Windbrisk Heights: two attackers aren't enough; three are", () => {
    for (const n of [2, 3]) {
      const { s: s0, ap, opp, ids } = setup([heights]);
      let { s, creature, index } = hide(s0, ap, ids[0]!);
      const attackers = Array.from({ length: n }, () => putOnBattlefield(s, ap, bear()));
      s = passUntil(s, "declareAttackers", ap);
      s = act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((a) => ({ attacker: a, defender: opp })) });
      s = passUntil(s, "main2", ap);
      expect(s.players[ap]!.attackedWith?.keys).toHaveLength(n);
      s = settle(run(s, planActivate(s, ap, ids[0]!, index)));
      if (n === 2) {
        expect(s.pending).toBeFalsy();
        expect(s.objects[creature]!.zone).toBe("exile");
      } else expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: creature });
    }
  });
});
