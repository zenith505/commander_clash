// Round 120: round 119's rules gaps (Firebender Ascension and granted triggers, Aetherspouts asking the active player
// first, One with the Multiverse casting a prototype card prototyped), then the most played cards.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, botActions, castProblem, isFullySupported, planActivate, planCast, power, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";
import { invalidateCharacteristics } from "../src/layers";
import { moveObject } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState, yes = true) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes });
    else if (p) s = botActions(s, p.player).reduce((x, a) => act(x, a), s);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
const later = (s: GameState, ap: PlayerId, n: number) => s.turnOrder[(s.turnOrder.indexOf(ap) + n) % 4]!;
const toHand = (s: GameState, pid: PlayerId, d: CardDef) => {
  const id = putOnBattlefield(s, pid, d);
  moveObject(s, id, "hand");
  return id;
};
const named = (s: GameState, name: string) => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === name);
const passToStack = (s: GameState) => {
  for (let i = 0; i < 8 && s.stack.length && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

// Real oracle text (Scryfall).
const ascension = card("Firebender Ascension", "Enchantment", "{1}{R}", { oracleText: "When this enchantment enters, create a 2/2 red Soldier creature token with firebending 1.\nWhenever a creature you control attacking causes a triggered ability of that creature to trigger, put a quest counter on this enchantment. Then if it has four or more quest counters on it, you may copy that ability. You may choose new targets for the copy." });
const pickaxe = card("Diamond Pick-Axe", "Artifact — Equipment", "{R}", { oracleText: "Indestructible (Effects that say \"destroy\" don't destroy this Equipment.)\nEquipped creature gets +1/+1 and has \"Whenever this creature attacks, create a Treasure token.\" (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")\nEquip {1}" });
const aetherspouts = card("Aetherspouts", "Instant", "{3}{U}{U}", { oracleText: "For each attacking creature, its owner puts it on their choice of the top or bottom of their library." });
const multiverse = card("One with the Multiverse", "Enchantment", "{6}{U}{U}", { oracleText: "You may look at the top card of your library any time.\nYou may play lands and cast spells from the top of your library.\nOnce during each of your turns, you may cast a spell from your hand or the top of your library without paying its mana cost." });
const fleshgorger = card("Phyrexian Fleshgorger", "Artifact Creature — Phyrexian Wurm", "{7}", { power: "7", toughness: "5", keywords: ["Menace", "Lifelink", "Ward", "Prototype"], oracleText: "Prototype {1}{B}{B} — 3/3 (You may cast this spell with different mana cost, color, and size. It keeps its abilities and types.)\nMenace, lifelink\nWard—Pay life equal to this creature's power." });
const gandalf = card("Gandalf the White", "Legendary Creature — Avatar Wizard", "{3}{W}{W}", { power: "4", toughness: "5", keywords: ["Flash"], oracleText: "Flash\nYou may cast legendary spells and artifact spells as though they had flash.\nIf a legendary permanent or an artifact entering or leaving the battlefield causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time." });
const curio = card("Cloudstone Curio", "Artifact", "{3}", { oracleText: "Whenever a nonartifact permanent you control enters, you may return another permanent you control that shares a permanent type with it to its owner's hand." });
const ashiok = card("Ashiok, Dream Render", "Legendary Planeswalker — Ashiok", "{1}{U/B}{U/B}", { loyalty: "5", keywords: ["Mill"], oracleText: "Spells and abilities your opponents control can't cause their controller to search their library.\n−1: Target player mills four cards. Then exile each opponent's graveyard." });
const shadrix = card("Shadrix Silverquill", "Legendary Creature — Elder Dragon", "{3}{W}{B}", { power: "2", toughness: "5", keywords: ["Flying", "Double strike"], oracleText: "Flying, double strike\nAt the beginning of combat on your turn, you may choose two. Each mode must target a different player.\n• Target player creates a 2/1 white and black Inkling creature token with flying.\n• Target player draws a card and loses 1 life.\n• Target player puts a +1/+1 counter on each creature they control." });
const gauntlet = card("Ichormoon Gauntlet", "Artifact", "{2}{U}", { keywords: ["Proliferate"], oracleText: "Planeswalkers you control have \"[0]: Proliferate\" and \"[−12]: Take an extra turn after this one.\"\nWhenever you cast a noncreature spell, choose a counter on target permanent. Put an additional counter of that kind on that permanent." });
const chainVeil = card("The Chain Veil", "Legendary Artifact", "{4}", { oracleText: "At the beginning of your end step, if you didn't activate a loyalty ability of a planeswalker this turn, you lose 2 life.\n{4}, {T}: For each planeswalker you control, you may activate one of its loyalty abilities once this turn as though none of its loyalty abilities have been activated this turn." });
const shadow = card("Thousand-Faced Shadow", "Creature — Human Ninja", "{U}", { power: "1", toughness: "1", keywords: ["Flying", "Ninjutsu"], oracleText: "Ninjutsu {2}{U}{U} ({2}{U}{U}, Return an unblocked attacker you control to hand: Put this card onto the battlefield from your hand tapped and attacking.)\nFlying\nWhen this creature enters from your hand, if it's attacking, create a token that's a copy of another target attacking creature. The token enters tapped and attacking." });
const walker = card("Test Walker", "Legendary Planeswalker — Test", "{2}", { loyalty: "3", oracleText: "+1: You gain 1 life.\n−1: Draw a card." });
const rampant = card("Rampant Growth", "Sorcery", "{1}{G}", { oracleText: "Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle." });
const expel = card("Expel the Interlopers", "Sorcery", "{3}{W}{W}", { oracleText: "Choose a number between 0 and 10. Destroy all creatures with power greater than or equal to the chosen number." });

describe("round 119's gaps", () => {
  it("Firebender Ascension counts an Equipment's granted trigger (the creature's) but not an Aura's own", () => {
    const aura = card("Battle Aura", "Enchantment — Aura", "{R}", { oracleText: "Enchant creature\nWhenever enchanted creature attacks, you gain 1 life." });
    supported(ascension, pickaxe, aura);
    const { s: s0, ap, opp } = setup([]);
    const asc = putOnBattlefield(s0, ap, ascension);
    s0.objects[asc]!.counters.quest = 3;
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[putOnBattlefield(s0, ap, pickaxe)]!.attachedTo = b;
    s0.objects[putOnBattlefield(s0, ap, aura)]!.attachedTo = b;
    invalidateCharacteristics(s0);
    const life = s0.players[ap]!.life;
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    for (let i = 0; i < 80 && !(s.step === "declareBlockers" && !s.stack.length && !s.triggerQueue.length); i++) {
      const p = s.pending;
      if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: true });
      else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else if (p) s = act(s, botActions(s, waitingOn(s)!)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    // One quest counter (the Pick-Axe's granted ability is the creature's), copied: two Treasures; the Aura's once.
    expect(s.objects[asc]!.counters.quest).toBe(4);
    expect(named(s, "Treasure Token").length).toBe(2);
    expect(s.players[ap]!.life).toBe(life + 1);
  });

  it("Aetherspouts: the active player chooses for all of theirs first, then the others in turn order", () => {
    supported(aetherspouts);
    const { s: s0, ap, opp } = setup([]);
    const mine = putOnBattlefield(s0, ap, bear({ name: "Bear Mine" }));
    // A creature the active player controls but the next player owns: listed first on the battlefield.
    const borrowed = putOnBattlefield(s0, opp, bear({ name: "Bear Borrowed" }));
    s0.objects[borrowed]!.controller = ap;
    invalidateCharacteristics(s0);
    expect(s0.battlefield.indexOf(borrowed)).toBeLessThan(s0.battlefield.indexOf(mine));
    const caster = later(s0, ap, 2);
    for (let i = 0; i < 5; i++) putOnBattlefield(s0, caster, card("Island", "Basic Land — Island"));
    const spouts = toHand(s0, caster, aetherspouts);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [mine, borrowed].map((attacker) => ({ attacker, defender: caster })) });
    for (let i = 0; i < 8 && waitingOn(s) !== caster; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = passToStack(run(s, planCast(s, caster, spouts)));
    expect(s.pending?.kind === "chooseOption" && s.pending.player).toBe(ap);
    s = act(s, { type: "chooseOption", player: ap, choice: "top" });
    expect(s.pending?.kind === "chooseOption" && s.pending.player).toBe(opp);
    s = act(s, { type: "chooseOption", player: opp, choice: "bottom" });
    expect(s.players[ap]!.library[0]).toBe(mine);
    expect(s.players[opp]!.library.at(-1)).toBe(borrowed);
  });

  it("One with the Multiverse casts a prototype card prototyped without paying its mana cost", () => {
    supported(multiverse, fleshgorger);
    const { s: s0, ap, ids } = setup([fleshgorger]);
    putOnBattlefield(s0, ap, multiverse);
    const pool = JSON.stringify(s0.players[ap]!.manaPool);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { alt: "payZero", prototyped: true }));
    expect(s.log.at(-1)!.text).toMatch(/casts Phyrexian Fleshgorger prototyped for \{0\}/);
    s = passToStack(s);
    const o = s.objects[ids[0]!]!;
    expect(o.zone).toBe("battlefield");
    expect(power(s, o)).toBe(3);
    expect(JSON.stringify(s.players[ap]!.manaPool)).toBe(pool);
    // No land was tapped for it.
    expect(s.battlefield.filter((x) => s.objects[x]!.tapped).length).toBe(0);
  });
});

describe("round 120 cards", () => {
  it("Expel the Interlopers: choose a number as it resolves, destroy each creature with at least that power", () => {
    supported(expel);
    const { s: s0, ap, opp, ids } = setup([expel]);
    const small = putOnBattlefield(s0, opp, bear({ name: "Small", power: "2", toughness: "2" }));
    const big = putOnBattlefield(s0, opp, bear({ name: "Big", power: "5", toughness: "5" }));
    const mine = putOnBattlefield(s0, ap, bear({ name: "Mine", power: "3", toughness: "3" }));
    let s = passToStack(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("number");
    expect(s.pending?.kind === "chooseOption" && s.pending.numberRange).toEqual({ min: 0, max: 10 });
    expect(() => act(s, { type: "chooseOption", player: ap, choice: "11" })).toThrow();
    s = act(s, { type: "chooseOption", player: ap, choice: "3" });
    expect(s.objects[big]!.zone).toBe("graveyard");
    expect(s.objects[mine]!.zone).toBe("graveyard");
    expect(s.objects[small]!.zone).toBe("battlefield");
  });

  it("Expel the Interlopers: a bot picks the number that hurts the opponents most and spares its own", () => {
    const { s: s0, ap, opp, ids } = setup([expel]);
    putOnBattlefield(s0, opp, bear({ name: "Big", power: "6", toughness: "6" }));
    putOnBattlefield(s0, opp, bear({ name: "Bigger", power: "7", toughness: "7" }));
    const mine = putOnBattlefield(s0, ap, bear({ name: "Mine", power: "4", toughness: "4" }));
    let s = passToStack(run(s0, planCast(s0, ap, ids[0]!)));
    s = botActions(s, ap).reduce((x, a) => act(x, a), s);
    expect(s.objects[mine]!.zone).toBe("battlefield");
    expect(named(s, "Big").length + named(s, "Bigger").length).toBe(0);
  });
});

describe("round 120 cards from the brief", () => {
  it("Gandalf the White: legendary or artifact entering or leaving makes your abilities trigger twice", () => {
    const legend = card("Legend Healer", "Legendary Creature — Cleric", "{1}", { power: "1", toughness: "1", oracleText: "When this creature enters, you gain 2 life." });
    const healer = card("Plain Healer", "Creature — Cleric", "{1}", { power: "1", toughness: "1", oracleText: "When this creature enters, you gain 2 life." });
    const relic = card("Leaving Relic", "Artifact", "{1}", { oracleText: "When this artifact leaves the battlefield, draw a card." });
    const bounce = card("Unsummon Test", "Instant", "{U}", { oracleText: "Return target permanent to its owner's hand." });
    supported(gandalf, legend, healer, relic, bounce);
    const { s: s0, ap, ids } = setup([legend, healer, bounce]);
    putOnBattlefield(s0, ap, gandalf);
    const r = putOnBattlefield(s0, ap, relic);
    const life = s0.players[ap]!.life;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.life).toBe(life + 4);
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.players[ap]!.life).toBe(life + 6);
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[2]!, [{ kind: "object", id: r }])));
    // The relic back in hand, and two cards drawn; the Unsummon left the hand.
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1 + 2);
  });

  it("Gandalf the White: artifact and legendary spells have flash for you", () => {
    const trinket = card("Plain Trinket", "Artifact", "{1}");
    const { s: s0, ap, ids } = setup([trinket]);
    expect(planCast(s0, ap, ids[0]!)).not.toBeNull();
    let s = passUntil(s0, "upkeep", later(s0, ap, 1));
    for (let i = 0; i < 8 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(castProblem(s, ap, ids[0]!)).toMatch(/sorcery|timing|flash|main phase/i);
    putOnBattlefield(s, ap, gandalf);
    expect(planCast(s, ap, ids[0]!)).not.toBeNull();
  });

  it("Cloudstone Curio: you may return another permanent sharing a permanent type with the one that entered", () => {
    supported(curio);
    const { s: s0, ap, ids } = setup([bear({ name: "New Bear" })]);
    putOnBattlefield(s0, ap, curio);
    const old = putOnBattlefield(s0, ap, bear({ name: "Old Bear" }));
    const older = putOnBattlefield(s0, ap, bear({ name: "Older Bear" }));
    let s = passToStack(run(s0, planCast(s0, ap, ids[0]!)));
    for (let i = 0; i < 8 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    // Only the other creature: not the new one, the Curio (an artifact) or the lands.
    expect(s.pending?.kind === "pickPermanents" && [...s.pending.options].sort()).toEqual([old, older].sort());
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [old] }));
    expect(s.objects[old]!.zone).toBe("hand");
    expect(s.objects[older]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
  });

  it("Ashiok, Dream Render: an opponent's spell can't make them search their library, but they still shuffle", () => {
    supported(ashiok, rampant);
    const { s: s0, ap, opp, ids } = setup([rampant]);
    s0.objects[putOnBattlefield(s0, opp, ashiok)]!.counters.loyalty = 5;
    const lands = s0.battlefield.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeNull();
    expect(s.battlefield.length).toBe(lands);
    expect(s.log.some((l) => /can't search their library/.test(l.text))).toBe(true);
    expect(s.log.some((l) => /shuffles/.test(l.text))).toBe(true);
    // Its own controller's spells still can.
    const { s: t0, ap: ap2, ids: ids2 } = setup([rampant]);
    t0.objects[putOnBattlefield(t0, ap2, ashiok)]!.counters.loyalty = 5;
    const t = passToStack(run(t0, planCast(t0, ap2, ids2[0]!)));
    expect(t.pending?.kind).toBe("searchLibrary");
  });

  it("Shadrix Silverquill: none or two modes, each targeting a different player", () => {
    supported(shadrix);
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, shadrix);
    let s = passUntil(s0, "beginCombat", ap);
    for (let i = 0; i < 8 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind === "chooseModes" && s.pending.optional).toBe(true);
    expect(() => act(s, { type: "chooseModes", player: ap, modes: [0] })).toThrow();
    const none = act(s, { type: "chooseModes", player: ap, modes: [] });
    expect(none.triggerQueue.length + none.stack.length).toBe(0);
    s = act(s, { type: "chooseModes", player: ap, modes: [0, 1] });
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }, { kind: "player", id: opp }] })).toThrow();
    const hand = s.players[opp]!.hand.length;
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: ap }, { kind: "player", id: opp }] }));
    expect(named(s, "Inkling Token").filter((x) => s.objects[x]!.controller === ap).length).toBe(1);
    expect(s.players[opp]!.hand.length).toBe(hand + 1);
  });

  it("Shadrix Silverquill: the target player puts the +1/+1 counters on each creature they control", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, shadrix);
    const theirs = putOnBattlefield(s0, opp, bear());
    const mine = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "beginCombat", ap);
    for (let i = 0; i < 8 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "chooseModes", player: ap, modes: [1, 2] });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }, { kind: "player", id: ap }] }));
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[theirs]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Ichormoon Gauntlet: a noncreature spell puts one more counter of a kind chosen on the target", () => {
    const shock = card("Spark Test", "Instant", "{R}", { oracleText: "Spark Test deals 1 damage to any target." });
    supported(gauntlet, shock);
    const { s: s0, ap, opp, ids } = setup([shock]);
    putOnBattlefield(s0, ap, gauntlet);
    const w = putOnBattlefield(s0, ap, walker);
    s0.objects[w]!.counters = { loyalty: 3, charge: 1 };
    // The planeswalker has the granted abilities.
    expect(abilityProblem(s0, ap, w, 2)).toBeNull();
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    for (let i = 0; i < 8 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: w }] });
    s = passToStack(s);
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("counterKind");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "loyalty" }));
    expect(s.objects[w]!.counters.loyalty).toBe(4);
    expect(s.objects[w]!.counters.charge).toBe(1);
  });

  it("The Chain Veil: one more loyalty ability of each planeswalker; 2 life at your end step if you didn't use one", () => {
    supported(chainVeil, walker);
    const { s: s0, ap } = setup([]);
    const veil = putOnBattlefield(s0, ap, chainVeil);
    const w = putOnBattlefield(s0, ap, walker);
    s0.objects[w]!.counters.loyalty = 3;
    let s = settle(run(s0, planActivate(s0, ap, w, 0)));
    expect(s.objects[w]!.counters.loyalty).toBe(4);
    expect(abilityProblem(s, ap, w, 1)).toMatch(/already activated/);
    s = settle(run(s, planActivate(s, ap, veil, 0)));
    expect(abilityProblem(s, ap, w, 1)).toBeNull();
    s = settle(run(s, planActivate(s, ap, w, 1)));
    expect(s.objects[w]!.counters.loyalty).toBe(3);
    expect(abilityProblem(s, ap, w, 0)).toMatch(/two loyalty abilities/);
    const life = s.players[ap]!.life;
    s = passUntil(s, "cleanup", ap);
    expect(s.players[ap]!.life).toBe(life);
    // A turn without one: 2 life at its end step.
    const { s: t0, ap: ap2 } = setup([]);
    putOnBattlefield(t0, ap2, chainVeil);
    const life2 = t0.players[ap2]!.life;
    const t = passUntil(t0, "cleanup", ap2);
    expect(t.players[ap2]!.life).toBe(life2 - 2);
  });

  it("Thousand-Faced Shadow: entering from your hand attacking (ninjutsu), it copies another attacking creature", () => {
    supported(shadow);
    const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
    const { s: s0, ap, opp, ids } = setup([shadow]);
    const b = putOnBattlefield(s0, ap, bear());
    const g = putOnBattlefield(s0, ap, giant);
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [b, g].map((attacker) => ({ attacker, defender: opp })) });
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    while (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    for (let i = 0; i < 20 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planActivate(s, ap, ids[0]!, 0, undefined, undefined, undefined, undefined, { returnToHand: [b] }));
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    // The only other attacking creature: the giant.
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: g }] }));
    const token = named(s, "Hill Giant").find((x) => s.objects[x]!.isToken)!;
    expect(token).toBeTruthy();
    expect(s.objects[token]!.tapped).toBe(true);
    expect(s.objects[token]!.attacking).toBeDefined();
    expect(s.objects[ids[0]!]!.attacking).toBe(opp);
  });

  it("Thousand-Faced Shadow: cast from your hand it enters from the stack, so nothing is copied", () => {
    const { s: s0, ap, ids } = setup([shadow]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.battlefield.filter((x) => s.objects[x]!.isToken).length).toBe(0);
  });
});
