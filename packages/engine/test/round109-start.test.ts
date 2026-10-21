// Round 109, from the top of the popularity list: the Archetypes ("lose flying and can't have or gain flying": effects of
// resolved spells and abilities that would give it aren't created, rulings), Breena, the Demagogue ("whenever a player
// attacks one of your opponents", CR 508.3e) and "whenever a creature attacks one of your opponents" (Calculating Lich,
// Genestealer Locus, Gahiji, Skyboon Evangelist, Soulblade Corrupter; CR 508.3a).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const imagination = card("Archetype of Imagination", "Enchantment Creature — Human Wizard", "{4}{U}{U}", {
  power: "3",
  toughness: "2",
  oracleText: "Creatures you control have flying.\nCreatures your opponents control lose flying and can't have or gain flying.",
});
const breena = card("Breena, the Demagogue", "Legendary Creature — Bird Warlock", "{1}{W}{B}", {
  power: "1",
  toughness: "3",
  keywords: ["Flying"],
  oracleText:
    "Flying\nWhenever a player attacks one of your opponents, if that opponent has more life than another of your opponents, that attacking player draws a card and you put two +1/+1 counters on a creature you control.",
});
const lich = card("Calculating Lich", "Creature — Zombie Wizard", "{4}{B}{B}", {
  power: "4",
  toughness: "4",
  keywords: ["Menace"],
  oracleText: "Menace\nWhenever a creature attacks one of your opponents, that player loses 1 life.",
});
const gahiji = card("Gahiji, Honored One", "Legendary Creature — Beast", "{2}{R}{G}{W}", {
  power: "4",
  toughness: "4",
  oracleText: "Whenever a creature attacks one of your opponents or a planeswalker an opponent controls, that creature gets +2/+0 until end of turn.",
});
const soulblade = card("Soulblade Corrupter", "Creature — Human Warrior", "{4}{B}", {
  power: "3",
  toughness: "3",
  keywords: ["Deathtouch"],
  oracleText: "Deathtouch\nWhenever a creature with a +1/+1 counter on it attacks one of your opponents, that creature gains deathtouch until end of turn.",
});
// Test cards.
const wings = card("Test Wings", "Instant", "{U}", { oracleText: "Target creature gains flying until end of turn." });
const cloak = card("Test Cloak", "Enchantment — Aura", "{U}", { keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature has flying." });
const bird = card("Test Bird", "Creature — Bird", "{1}{U}", { power: "1", toughness: "1", keywords: ["Flying"], oracleText: "Flying" });
const unsummon = card("Test Unsummon", "Instant", "{U}", { oracleText: "Return target creature to its owner's hand." });
const walker = card("Test Walker", "Legendary Planeswalker — Test", "{3}", { loyalty: "5", oracleText: "+1: Draw a card." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;
const flies = (s: GameState, id: string) => objHasKeyword(s, s.objects[id]!, "Flying");
const declare = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId; planeswalker?: string }[]) =>
  act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks });

describe("Archetype of Imagination", () => {
  it("your creatures fly; your opponents' creatures lose flying, can't gain it from a spell even after the Archetype leaves, and get a static grant back", () => {
    supported(imagination);
    const { s: s0, ap, ids } = setup([wings, unsummon]);
    let s = s0;
    const opp = next(s, ap);
    const mine = putOnBattlefield(s, ap, bear());
    const theirBird = putOnBattlefield(s, opp, bird);
    const theirBear = putOnBattlefield(s, opp, bear());
    const arch = putOnBattlefield(s, ap, imagination);
    const aura = putOnBattlefield(s, opp, cloak);
    s.objects[aura]!.attachedTo = theirBird;
    invalidateCharacteristics(s);
    expect(flies(s, mine)).toBe(true);
    expect(flies(s, arch)).toBe(true);
    expect(flies(s, theirBird)).toBe(false);
    // A resolved spell's grant isn't created for an opponent's creature (rulings), but works on yours.
    s = cast(s, ap, ids[0]!, [target(theirBear)]);
    s = settle(s);
    expect(flies(s, theirBear)).toBe(false);
    s = cast(s, ap, ids[1]!, [target(arch)]);
    s = settle(s);
    expect(s.objects[arch]!.zone).toBe("hand");
    // The Archetype is gone: the spell's effect still gives nothing, the Aura's static ability and the printed flying apply again.
    expect(flies(s, theirBear)).toBe(false);
    expect(flies(s, theirBird)).toBe(true);
    expect(flies(s, mine)).toBe(false);
  });

  it("each Archetype reads its own keyword", () => {
    supported(
      card("Archetype of Courage", "Enchantment Creature — Human Soldier", "{1}{W}{W}", { power: "2", toughness: "2", oracleText: "Creatures you control have first strike.\nCreatures your opponents control lose first strike and can't have or gain first strike." }),
      card("Archetype of Endurance", "Enchantment Creature — Boar", "{6}{G}{G}", { power: "6", toughness: "5", oracleText: "Creatures you control have hexproof.\nCreatures your opponents control lose hexproof and can't have or gain hexproof." }),
    );
  });
});

describe("Breena, the Demagogue", () => {
  it("you attack an opponent with more life than another opponent: you draw and put two +1/+1 counters on a creature you control", () => {
    supported(breena);
    const { s: s0, ap } = setup([]);
    let s = s0;
    const b = putOnBattlefield(s, ap, breena);
    const att = putOnBattlefield(s, ap, bear());
    const opp = next(s, ap);
    s.players[next(s, opp)]!.life = 30;
    s.players[opp]!.life = 35;
    const hand = s.players[ap]!.hand.length;
    s = settle(declare(s, ap, [{ attacker: att, defender: opp }]));
    expect(s.pending?.kind).toBeDefined();
    const pend = s.pending as { kind: string; options?: string[] };
    expect(pend.kind).toBe("pickPermanents");
    s = act(s, { type: "pickPermanents", player: ap, ids: [b] });
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(2);
  });

  it("doesn't trigger when the attacked opponent has the least life; an opponent attacking another opponent draws", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const opp = next(s, ap);
    const third = next(s, opp);
    const b = putOnBattlefield(s, ap, breena);
    const att = putOnBattlefield(s, ap, bear());
    s.players[opp]!.life = 10;
    let t = settle(declare(s, ap, [{ attacker: att, defender: opp }]));
    expect(t.pending).toBeFalsy();
    expect(t.objects[b]!.counters["+1/+1"] ?? 0).toBe(0);
    // On the opponent's turn: they attack the third player (40 life, more than the opponent's 10): they draw a card.
    s = passUntil(s, "main1", opp);
    const theirs = putOnBattlefield(s, opp, bear());
    const before = s.players[opp]!.hand.length;
    s = settle(declare(s, opp, [{ attacker: theirs, defender: third }]));
    s = act(s, { type: "pickPermanents", player: ap, ids: [att] });
    s = settle(s);
    expect(s.players[opp]!.hand.length).toBe(before + 1);
    expect(s.objects[att]!.counters["+1/+1"]).toBe(2);
  });
});

describe("Whenever a creature attacks one of your opponents", () => {
  it("Calculating Lich: each creature attacking one of your opponents makes that player lose 1 life; not one attacking you or a planeswalker", () => {
    supported(lich, gahiji, soulblade);
    const { s: s0, ap } = setup([]);
    let s = s0;
    const opp = next(s, ap);
    const third = next(s, opp);
    putOnBattlefield(s, ap, lich);
    const a1 = putOnBattlefield(s, ap, bear());
    const a2 = putOnBattlefield(s, ap, bear());
    const pw = putOnBattlefield(s, third, walker);
    s.objects[pw]!.counters.loyalty = 5;
    s = settle(declare(s, ap, [{ attacker: a1, defender: opp }, { attacker: a2, defender: third, planeswalker: pw }]));
    expect(s.players[opp]!.life).toBe(39);
    expect(s.players[third]!.life).toBe(40);
    // An opponent's creature attacking you: no trigger.
    s = passUntil(s, "main1", opp);
    const theirs = putOnBattlefield(s, opp, bear());
    s = settle(declare(s, opp, [{ attacker: theirs, defender: ap }]));
    expect(s.players[ap]!.life).toBe(40);
  });

  it("Gahiji: an attack on a planeswalker an opponent controls counts too; Soulblade Corrupter only for a creature with a +1/+1 counter", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const opp = next(s, ap);
    putOnBattlefield(s, opp, gahiji);
    putOnBattlefield(s, opp, soulblade);
    const third = next(s, opp);
    const pw = putOnBattlefield(s, third, walker);
    s.objects[pw]!.counters.loyalty = 5;
    const a1 = putOnBattlefield(s, ap, bear());
    const a2 = putOnBattlefield(s, ap, bear());
    const a3 = putOnBattlefield(s, ap, bear());
    s.objects[a3]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s);
    // a1 attacks Gahiji's controller: not one of their opponents. a2 attacks a planeswalker of the third player. a3 attacks the third player.
    s = settle(declare(s, ap, [{ attacker: a1, defender: opp }, { attacker: a2, defender: third, planeswalker: pw }, { attacker: a3, defender: third }]));
    const p = (id: string) => characteristics(s, s.objects[id]!).power;
    expect(p(a1)).toBe(2);
    expect(p(a2)).toBe(4);
    expect(p(a3)).toBe(5);
    expect(objHasKeyword(s, s.objects[a3]!, "Deathtouch")).toBe(true);
    expect(objHasKeyword(s, s.objects[a2]!, "Deathtouch")).toBe(false);
  });
});
