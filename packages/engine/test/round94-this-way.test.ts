// Round 94: "For each creature exiled this way, its controller creates a 2/2 green Boar creature token" (Curse of the
// Swine) and the like: each player gets one for each of theirs that left, as it last existed (CR 608.2h). Not for one
// that wasn't destroyed (indestructible), and still for one destroyed but put somewhere other than a graveyard (rulings
// on Rampage of the Clans, Descent of the Dragons).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, planCast, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const swine = card("Curse of the Swine", "Sorcery", "{X}{U}{U}", { oracleText: "Exile X target creatures. For each creature exiled this way, its controller creates a 2/2 green Boar creature token." });
const rampage = card("Rampage of the Clans", "Instant", "{3}{G}", { oracleText: "Destroy all artifacts and enchantments. For each permanent destroyed this way, its controller creates a 3/3 green Centaur creature token." });
const cry = card("Martyr's Cry", "Sorcery", "{W}{W}", { oracleText: "Exile all white creatures. For each creature exiled this way, its controller draws a card." });
const march = card("March of Souls", "Sorcery", "{4}{W}", { oracleText: "Destroy all creatures. They can't be regenerated. For each creature destroyed this way, its controller creates a 1/1 white Spirit creature token with flying." });
const descent = card("Descent of the Dragons", "Sorcery", "{4}{R}{R}", { oracleText: "Destroy any number of target creatures. For each creature destroyed this way, its controller creates a 4/4 red Dragon creature token with flying." });
const rip = card("Rest in Peace", "Enchantment", "{1}{W}", { oracleText: "When this enchantment enters, exile all graveyards.\nIf a card or token would be put into a graveyard from anywhere, exile it instead." });
const darksteel = card("Darksteel Relic", "Artifact", "{0}", { keywords: ["Indestructible"], oracleText: "Indestructible" });
const relic = card("Jalum Tome", "Artifact", "{3}", { oracleText: "{2}, {T}: Draw a card, then discard a card." });
const knight = card("White Knight", "Creature — Human Knight", "{W}{W}", { power: "2", toughness: "2", colors: ["W"] });

const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name.replace(/ Token$/, "") === name);
const run = (s: GameState, plan: ReturnType<typeof planCast>) => settle(plan!.reduce((x, a) => act(x, a), s));

describe("for each one destroyed or exiled this way, its controller ...", () => {
  it("parse", () => {
    for (const d of [swine, rampage, cry, march, descent]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Curse of the Swine: a Boar for each creature's controller", () => {
    const { s: s0, ap, opp, ids } = setup([swine]);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(opp) + 1) % 4]!;
    const a = putOnBattlefield(s0, opp, bear());
    const b = putOnBattlefield(s0, opp, bear());
    const c = putOnBattlefield(s0, third, bear());
    const s = run(s0, planCast(s0, ap, ids[0]!, [target(a), target(b), target(c)], undefined, undefined, 3));
    for (const id of [a, b, c]) expect(s.objects[id]!.zone).toBe("exile");
    expect(named(s, opp, "Boar")).toHaveLength(2);
    expect(named(s, third, "Boar")).toHaveLength(1);
    expect(named(s, ap, "Boar")).toHaveLength(0);
  });

  it("Rampage of the Clans: none for an indestructible one; one for a token, and for one Rest in Peace exiles instead", () => {
    const { s: s0, ap, opp, ids } = setup([rampage]);
    putOnBattlefield(s0, opp, darksteel);
    putOnBattlefield(s0, opp, relic);
    putOnBattlefield(s0, ap, rip);
    const s = run(s0, planCast(s0, ap, ids[0]!));
    expect(named(s, opp, "Darksteel Relic")).toHaveLength(1);
    // Rest in Peace was destroyed too, and Jalum Tome was exiled instead of going to the graveyard.
    expect(named(s, opp, "Centaur")).toHaveLength(1);
    expect(named(s, ap, "Centaur")).toHaveLength(1);
  });

  it("Martyr's Cry: each player draws for their white creatures exiled", () => {
    const { s: s0, ap, opp, ids } = setup([cry]);
    putOnBattlefield(s0, opp, knight);
    putOnBattlefield(s0, opp, knight);
    putOnBattlefield(s0, opp, bear());
    const hand = s0.players[opp]!.hand.length;
    const s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.players[opp]!.hand.length).toBe(hand + 2);
  });
});
