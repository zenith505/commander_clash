// "Can't be blocked except by creatures with flying / flying or reach / black creatures" (CR 509.1b); what happened
// this turn: "if a creature died this turn" (morbid, CR 700.4), "for each creature that died this turn", "for each
// creature that attacked this turn", "if an opponent lost life this turn"; Pestilence's "if no creatures are on the
// battlefield".

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, pt, putOnBattlefield, setup, swamp, target } from "./helpers";
import { blockProblem, isFullySupported, manaValue, spellCost, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const scout = card("Treetop Scout", "Creature — Elf Scout", "{G}", { power: "1", toughness: "1", oracleText: "This creature can't be blocked except by creatures with flying." });
const spirit = card("Orchard Spirit", "Creature — Spirit", "{2}{G}", { power: "2", toughness: "2", oracleText: "This creature can't be blocked except by creatures with flying or reach." });
const warlock = card("Dread Warlock", "Creature — Human Wizard Warlock", "{1}{B}{B}", { power: "2", toughness: "2", oracleText: "This creature can't be blocked except by black creatures." });
const riders = card("Elven Riders", "Creature — Elf", "{3}{G}{G}", { power: "3", toughness: "3", oracleText: "This creature can't be blocked except by Walls and/or creatures with flying." });
const pet = card("Prehistoric Pet", "Creature — Dinosaur Ninja", "{W}", {
  power: "1",
  toughness: "2",
  oracleText: "This creature can't be blocked by creatures with greater power.\n{1}{W}, {T}: Return another target creature you control to its owner's hand. Activate only during your turn.",
});
const picker = card("Bone Picker", "Creature — Bird", "{3}{B}", { power: "3", toughness: "2", keywords: ["Flying", "Deathtouch"], oracleText: "This spell costs {3} less to cast if a creature died this turn.\nFlying, deathtouch" });
const boar = card("Festerhide Boar", "Creature — Boar", "{3}{G}", { power: "3", toughness: "3", keywords: ["Trample"], oracleText: "Trample\nMorbid — This creature enters with two +1/+1 counters on it if a creature died this turn." });
const paladin = card("Bloodcrazed Paladin", "Creature — Vampire Knight", "{1}{B}", { power: "1", toughness: "1", keywords: ["Flash"], oracleText: "Flash\nThis creature enters with a +1/+1 counter on it for each creature that died this turn." });
const frenzy = card("Witchstalker Frenzy", "Instant", "{3}{R}", { oracleText: "This spell costs {1} less to cast for each creature that attacked this turn.\nWitchstalker Frenzy deals 5 damage to target creature." });
const cutthroat = card("Cindering Cutthroat", "Creature — Lizard Assassin", "{2}{B/R}", {
  power: "3",
  toughness: "2",
  oracleText: "This creature enters with a +1/+1 counter on it if an opponent lost life this turn.\n{1}{B/R}: This creature gains menace until end of turn. (It can't be blocked except by two or more creatures.)",
});
const embrace = card("Deadly Embrace", "Sorcery", "{3}{B}{B}", { oracleText: "Destroy target creature an opponent controls. Then draw a card for each creature that died this turn." });
const pestilence = card("Pestilence", "Enchantment", "{2}{B}{B}", { oracleText: "At the beginning of the end step, if no creatures are on the battlefield, sacrifice this enchantment.\n{B}: This enchantment deals 1 damage to each creature and each player." });
const doomBlade = card("Doom Blade", "Instant", "{1}{B}", { oracleText: "Destroy target nonblack creature." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

const flyer = card("Wind Drake", "Creature — Drake", "{2}{U}", { power: "2", toughness: "2", keywords: ["Flying"] });
const spider = card("Giant Spider", "Creature — Spider", "{3}{G}", { power: "2", toughness: "4", keywords: ["Reach"] });
const wall = card("Wall of Wood", "Creature — Wall", "{G}", { power: "0", toughness: "3", keywords: ["Defender"] });
const blackBear = card("Black Bear", "Creature — Bear", "{1}{B}", { power: "2", toughness: "2" });
const ogre = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });

const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const canBlock = (s: GameState, b: string, a: string) => blockProblem(s, s.objects[b]!, s.objects[a]!) === null;
const costOf = (s: GameState, pid: PlayerId, id: string) => {
  const c = spellCost(s, pid, s.objects[id]!);
  return manaValue(c.cost) + c.extra;
};

describe("can't be blocked except by", () => {
  it("compile", () => {
    for (const d of [scout, spirit, warlock, riders, pet, picker, boar, paladin, frenzy, cutthroat, embrace, pestilence]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("creatures with flying; flying or reach; black creatures; Walls and/or creatures with flying", () => {
    const { s, ap, opp } = setup([]);
    const [sc, sp, wl, rd] = [scout, spirit, warlock, riders].map((d) => putOnBattlefield(s, ap, d));
    const [b, f, r, w, k] = [bear(), flyer, spider, wall, blackBear].map((d) => putOnBattlefield(s, opp, d));
    expect([canBlock(s, b!, sc!), canBlock(s, f!, sc!), canBlock(s, r!, sc!)]).toEqual([false, true, false]);
    expect([canBlock(s, b!, sp!), canBlock(s, f!, sp!), canBlock(s, r!, sp!)]).toEqual([false, true, true]);
    expect([canBlock(s, b!, wl!), canBlock(s, k!, wl!)]).toEqual([false, true]);
    expect([canBlock(s, b!, rd!), canBlock(s, w!, rd!), canBlock(s, f!, rd!), canBlock(s, r!, rd!)]).toEqual([false, true, true, false]);
  });

  it("can't be blocked by creatures with greater power", () => {
    const { s, ap, opp } = setup([]);
    const p = putOnBattlefield(s, ap, pet);
    const small = putOnBattlefield(s, opp, card("Savannah Lions", "Creature — Cat", "{W}", { power: "1", toughness: "1" }));
    const big = putOnBattlefield(s, opp, bear());
    expect([canBlock(s, small, p), canBlock(s, big, p)]).toEqual([true, false]);
  });
});

describe("what happened this turn", () => {
  it("a creature died this turn: cost reduction and enters with counters (morbid)", () => {
    const { s: s0, ap, ids, opp } = setup([picker, boar, doomBlade]);
    expect(costOf(s0, ap, ids[0]!)).toBe(4);
    const victim = putOnBattlefield(s0, opp, bear());
    let s = cast(s0, ap, ids[2]!, [target(victim)]);
    expect(s.objects[victim]!.zone).toBe("graveyard");
    expect(costOf(s, ap, ids[0]!)).toBe(1);
    s = settle(cast(s, ap, ids[1]!));
    expect(pt(s, ids[1]!)).toBe("5/5");
    // Without a death, no counters; and it's forgotten the next turn.
    const plain = settle(cast(structuredClone(s0), ap, ids[1]!));
    expect(pt(plain, ids[1]!)).toBe("3/3");
    const later = passUntil(s, "upkeep", opp);
    expect(costOf(later, ap, ids[0]!)).toBe(4);
  });

  it("for each creature that died this turn: tokens count too; Deadly Embrace counts its own", () => {
    const { s: s0, ap, ids, opp } = setup([doomBlade, paladin, embrace]);
    const a = putOnBattlefield(s0, opp, bear());
    const b = putOnBattlefield(s0, opp, bear());
    for (let i = 0; i < 6; i++) putOnBattlefield(s0, ap, swamp);
    let s = cast(s0, ap, ids[0]!, [target(a)]);
    const hand = s.players[ap]!.hand.length;
    s = cast(s, ap, ids[2]!, [target(b)]);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2); // cast it, drew two
    s = settle(cast(s, ap, ids[1]!));
    expect(pt(s, ids[1]!)).toBe("3/3");
  });

  it("for each creature that attacked this turn", () => {
    const { s: s0, ap, ids, opp } = setup([frenzy]);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    expect(costOf(s0, ap, ids[0]!)).toBe(4);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [a, b].map((attacker) => ({ attacker, defender: opp })) });
    expect(costOf(s, ap, ids[0]!)).toBe(2);
  });

  it("if an opponent lost life this turn", () => {
    const { s: s0, ap, ids, opp } = setup([cutthroat, shock]);
    expect(pt(settle(cast(structuredClone(s0), ap, ids[0]!)), ids[0]!)).toBe("3/2");
    let s = cast(s0, ap, ids[1]!, [{ kind: "player", id: opp }]);
    s = settle(cast(s, ap, ids[0]!));
    expect(pt(s, ids[0]!)).toBe("4/3");
  });

  it("Pestilence is sacrificed at the end step only if no creatures are on the battlefield", () => {
    const { s: s0, ap } = setup([]);
    const p = putOnBattlefield(s0, ap, pestilence);
    const withCreature = structuredClone(s0);
    putOnBattlefield(withCreature, ap, ogre);
    const kept = passUntil(withCreature, "cleanup", ap);
    expect(kept.objects[p]!.zone).toBe("battlefield");
    // Every creature gone.
    for (const id of [...s0.battlefield]) if (s0.objects[id]!.cardId !== pestilence.oracleId && s0.cards[s0.objects[id]!.cardId]!.types.includes("Creature")) s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
    const gone = passUntil(s0, "cleanup", ap);
    expect(gone.objects[p]!.zone).toBe("graveyard");
  });
});
