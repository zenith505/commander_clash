// Cards the round-88 lines also made playable, and two readings it had to keep apart: "becomes a legendary ... creature.
// It's still an enchantment." keeps every prior type and adds the supertype (CR 205.1b, Cacophony Unleashed); "it" after
// another instruction in a cast trigger is the permanent, not the spell (Pristine Skywise stays unsupported).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { characteristics, compileCard, isFullySupported, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

function settle(s: GameState) {
  for (let i = 0; i < 60 && (s.stack.length || s.resolving || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
const inZone = (s: GameState, pid: PlayerId, def: CardDef, zone: "library" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]!.graveyard.push(id);
  return id;
};

// Real oracle text (Scryfall).
const cacophony = card("Cacophony Unleashed", "Enchantment", "{5}{B}{B}", { oracleText: "When this enchantment enters, if you cast it, destroy all nonenchantment creatures.\nWhenever this enchantment or another enchantment you control enters, until end of turn, this enchantment becomes a legendary 6/6 Nightmare God creature with menace and deathtouch. It's still an enchantment." });
const skywise = card("Pristine Skywise", "Creature — Dragon", "{4}{W}{U}", { power: "6", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nWhenever you cast a noncreature spell, untap this creature. It gains protection from the color of your choice until end of turn." });
const berserker = card("Bloodsky Berserker", "Creature — Vampire Warrior", "{1}{B}", { power: "2", toughness: "1", oracleText: "Whenever you cast your second spell each turn, put two +1/+1 counters on this creature. It gains menace until end of turn. (It can't be blocked except by two or more creatures.)" });
const font = card("Font of Mythos", "Artifact", "{4}", { oracleText: "At the beginning of each player's draw step, that player draws two additional cards." });
const kenrith = card("Kenrith, the Returned King", "Legendary Creature — Human Noble", "{4}{W}", { power: "5", toughness: "5", oracleText: "{R}: All creatures gain trample and haste until end of turn.\n{1}{G}: Put a +1/+1 counter on target creature.\n{2}{W}: Target player gains 5 life.\n{3}{U}: Target player draws a card.\n{4}{B}: Put target creature card from a graveyard onto the battlefield under its owner's control." });
const route = card("Circuitous Route", "Sorcery", "{3}{G}", { oracleText: "Search your library for up to two basic land cards and/or Gate cards, put them onto the battlefield tapped, then shuffle." });
const gate = card("Simic Guildgate", "Land — Gate", "", { oracleText: "This land enters tapped.\n{T}: Add {G} or {U}." });
const greathearted = card("Ajani, the Greathearted", "Legendary Planeswalker — Ajani", "{2}{G}{W}", { loyalty: "5", oracleText: "Creatures you control have vigilance.\n+1: You gain 3 life.\n−2: Put a +1/+1 counter on each creature you control and a loyalty counter on each other planeswalker you control." });
const otherWalker = card("Test Walker", "Legendary Planeswalker — Test", "{3}", { loyalty: "3", oracleText: "+1: You gain 1 life." });
const sol = card("Sol Ring", "Artifact", "{1}", { oracleText: "{T}: Add {C}{C}." });

describe("round 88: cards the new lines made playable", () => {
  it("compile, and the 'it' of a later instruction isn't the spell", () => {
    for (const d of [cacophony, font, kenrith, route, greathearted]) expect(isFullySupported(d), d.name).toBe(true);
    // Since Lane B round B109: "untap ~. It gains protection ..." reads "It" as ~ (the creature untapped), not the spell cast.
    expect(isFullySupported(skywise)).toBe(true);
    expect(compileCard(skywise).triggers[0]!.body.effects[2]).toMatchObject({ type: "continuous", what: { ref: "self" } });
    // Since round 164: after "put two +1/+1 counters on this creature", "It" is that creature, never the spell.
    expect(compileCard(berserker).triggers[0]!.body.effects[1]).toMatchObject({ type: "continuous", what: { ref: "self" } });
  });

  it("Cacophony Unleashed becomes a legendary 6/6 Nightmare God creature and is still an enchantment (CR 205.1b)", () => {
    // Another enchantment entering triggers it.
    const { s: s3, ap: ap3, ids } = setup([card("Cheap Enchantment", "Enchantment", "{1}")]);
    const c3 = putOnBattlefield(s3, ap3, cacophony);
    const after = settle(cast(s3, ap3, ids[0]!));
    const ch = characteristics(after, after.objects[c3]!);
    expect(ch.types.sort()).toEqual(["Creature", "Enchantment"]);
    expect(ch.supertypes).toEqual(["Legendary"]);
    expect(ch.subtypes.sort()).toEqual(["God", "Nightmare"]);
  });

  it("Font of Mythos: each player draws two more in their draw step", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, font);
    const hand = s0.players[opp]!.hand.length;
    let s = passUntil(s0, "draw", opp);
    s = settle(s);
    expect(s.players[opp]!.hand.length).toBe(hand + 3);
  });

  it("Kenrith: a creature card from an opponent's graveyard comes back under its owner's control", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kenrith);
    const theirs = inZone(s0, opp, bear(), "graveyard");
    const s = settle(activate(s0, ap, k, 4, [target(theirs)]));
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(s.objects[theirs]!.controller).toBe(opp);
  });

  it("Circuitous Route: basic lands and/or Gates, onto the battlefield tapped", () => {
    const { s: s0, ap, ids } = setup([route]);
    const g = inZone(s0, ap, gate, "library");
    const ring = inZone(s0, ap, sol, "library");
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 2 });
    if (s.pending?.kind !== "searchLibrary") throw new Error();
    expect(s.pending.cards).toContain(g);
    expect(s.pending.cards).not.toContain(ring);
    const forest = s.pending.cards.find((id) => id !== g)!;
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [g, forest] }));
    expect([s.objects[g]!.zone, s.objects[g]!.tapped, s.objects[forest]!.zone]).toEqual(["battlefield", true, "battlefield"]);
  });

  it("Ajani, the Greathearted's −2: a +1/+1 counter on each creature you control, a loyalty counter on each other planeswalker", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, greathearted);
    s0.objects[a]!.counters.loyalty = 5;
    const w = putOnBattlefield(s0, ap, otherWalker);
    s0.objects[w]!.counters.loyalty = 3;
    const b = putOnBattlefield(s0, ap, bear());
    const s = settle(activate(s0, ap, a, 1));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[w]!.counters.loyalty).toBe(4);
    expect(s.objects[a]!.counters.loyalty).toBe(3);
  });
});
