// Round 120: round 119's rules gaps (Firebender Ascension and granted triggers, Aetherspouts asking the active player
// first, One with the Multiverse casting a prototype card prototyped), then the most played cards.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, attackProblem, botActions, castProblem, isFullySupported, potentialAttackers, planActivate, planCast, power, spellCost, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";
import { characteristics, controllerOf, invalidateCharacteristics } from "../src/layers";
import { moveObject } from "../src/game";
import { defOf, objHasKeyword, objIsType, toughness } from "../src/cards";

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

// "End the turn" (CR 724.1).
const sundial = card("Sundial of the Infinite", "Artifact", "{2}", { oracleText: "{1}, {T}: End the turn. Activate only during your turn. (Exile all spells and abilities from the stack. Discard down to your maximum hand size. Damage wears off, and \"this turn\" and \"until end of turn\" effects end.)" });
const gloriousEnd = card("Glorious End", "Instant", "{2}{R}", { oracleText: "End the turn. (Exile all spells and abilities from the stack, including this card. The player whose turn it is discards down to their maximum hand size. Damage wears off, and \"this turn\" and \"until end of turn\" effects end.)\nAt the beginning of your next end step, you lose the game." });
const discontinuity = card("Discontinuity", "Instant", "{3}{U}{U}", { oracleText: "During your turn, this spell costs {2}{U}{U} less to cast.\nEnd the turn. (Exile all spells and abilities from the stack, including this card. The player whose turn it is discards down to their maximum hand size. Damage wears off, and \"this turn\" and \"until end of turn\" effects end.)" });
const hurkyl = card("Hurkyl's Final Meditation", "Sorcery", "{3}{U}{U}{U}", { oracleText: "During turns other than yours, this spell costs {3} more to cast.\nReturn all nonland permanents to their owners' hands. End the turn. (Exile all spells and abilities from the stack, including this card. The player whose turn it is discards down to their maximum hand size. Damage wears off, and \"this turn\" and \"until end of turn\" effects end.)" });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
const endDraw = card("End Step Scribe", "Enchantment", "{1}", { oracleText: "At the beginning of your end step, draw a card." });

describe("ending the turn", () => {
  it("Sundial of the Infinite exiles the spell on the stack, skips the end step and its triggers, and the next turn begins", () => {
    supported(sundial, divination, endDraw);
    const { s: s0, ap, ids, opp } = setup([divination]);
    const dial = putOnBattlefield(s0, ap, sundial);
    putOnBattlefield(s0, ap, endDraw);
    const giant = putOnBattlefield(s0, opp, bear());
    s0.objects[giant]!.damage = 1;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.stack.length).toBe(1);
    s = run(s, planActivate(s, ap, dial, 0));
    const hand = s.players[ap]!.hand.length;
    s = passToStack(s);
    expect(s.objects[ids[0]!]!.zone).toBe("exile"); // CR 724.1b: exiled, not countered
    expect(s.stack.length).toBe(0);
    expect(s.step).toBe("cleanup");
    expect(s.pending?.kind).toBe("discardToHandSize"); // CR 514.1
    s = settle(s);
    expect(s.activePlayer).toBe(opp); // the cleanup step happened, then the next turn
    expect(s.objects[giant]!.damage).toBe(0); // CR 514.2
    expect(s.players[ap]!.hand.length).toBe(7); // neither Divination nor the end step trigger drew
    expect(hand).toBeGreaterThan(7);
    expect(s.log.some((l) => /The turn ends: Divination is exiled from the stack/.test(l.text))).toBe(true);
  });

  it("Sundial of the Infinite can only be activated during your turn", () => {
    const { s: s0, opp } = setup([]);
    const dial = putOnBattlefield(s0, opp, sundial);
    s0.priority = opp;
    expect(abilityProblem(s0, opp, dial, 0)).toMatch(/can't be activated now/);
  });

  it("Glorious End ends the turn, then you lose at your next end step", () => {
    supported(gloriousEnd);
    const { s: s0, ap, ids, opp } = setup([gloriousEnd]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    expect(s.activePlayer).toBe(opp);
    expect(s.players[ap]!.lost).toBeFalsy();
    s = passUntil(s, "end", ap);
    s = settle(s);
    expect(s.players[ap]!.lost).toBe(true);
  });

  it("Discontinuity costs {1} during your turn; Hurkyl's Final Meditation costs {3} more during others'", () => {
    supported(discontinuity, hurkyl);
    const { s, ap, ids } = setup([discontinuity, hurkyl]);
    const disc = spellCost(s, ap, s.objects[ids[0]!]!);
    expect(disc.cost.symbols.filter((y) => y.kind === "colored").length).toBe(0);
    expect(disc.extra + disc.cost.symbols.reduce((n, y) => n + (y.kind === "generic" ? y.amount : 0), 0)).toBe(1);
    const mine = spellCost(s, ap, s.objects[ids[1]!]!).extra;
    s.activePlayer = later(s, ap, 1);
    expect(spellCost(s, ap, s.objects[ids[0]!]!).cost.symbols.filter((y) => y.kind === "colored").length).toBe(2);
    expect(spellCost(s, ap, s.objects[ids[1]!]!).extra - mine).toBe(3);
  });

  it("Ultima: the dies triggers it caused cease to exist as the turn ends (CR 724.1a); bots don't cast it", () => {
    const ultima = card("Ultima", "Sorcery", "{3}{W}{B}", { oracleText: "Destroy all artifacts and creatures. End the turn. (Exile all spells and abilities from the stack, including this card. The player whose turn it is discards down to their maximum hand size. Damage wears off, and \"this turn\" and \"until end of turn\" effects end.)" });
    const mourner = card("Mourner", "Creature — Human", "{1}", { power: "1", toughness: "1", oracleText: "When this creature dies, draw a card." });
    supported(ultima, mourner);
    const { s: s0, ap, ids, opp } = setup([ultima]);
    const m = putOnBattlefield(s0, ap, mourner);
    expect(botActions(s0, ap).some((a) => a.type === "castSpell" && a.objectId === ids[0])).toBe(false);
    const library = s0.players[ap]!.library.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[m]!.zone).toBe("graveyard");
    expect(s.activePlayer).toBe(opp);
    expect(s.players[ap]!.library.length).toBe(library);
  });

  it("Hurkyl's Final Meditation bounces every nonland permanent, then the turn ends", () => {
    const { s: s0, ap, ids, opp } = setup([hurkyl]);
    const b = putOnBattlefield(s0, opp, bear());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[b]!.zone).toBe("hand");
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    expect(s.activePlayer).toBe(opp);
  });
});

describe("more popular cards", () => {
  it("Worldsoul's Rage puts up to X land cards from the hand and graveyard onto the battlefield tapped", () => {
    const rage = card("Worldsoul's Rage", "Sorcery", "{X}{R}{G}", { oracleText: "Worldsoul's Rage deals X damage to any target. Put up to X land cards from your hand and/or graveyard onto the battlefield tapped." });
    const land = card("Wastes", "Basic Land", "", { oracleText: "{T}: Add {C}." });
    supported(rage);
    const { s: s0, ap, ids, opp } = setup([rage, land, land, land]);
    const yard = putOnBattlefield(s0, ap, land);
    moveObject(s0, yard, "graveyard");
    const life = s0.players[opp]!.life;
    let s = passToStack(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, undefined, 2)));
    const p = s.pending;
    expect(p?.kind).toBe("searchLibrary");
    if (p?.kind !== "searchLibrary") return;
    expect(p.max).toBe(2);
    expect(p.what).toBe("up to 2 land cards from your hand and/or graveyard");
    expect(p.cards).toContain(yard);
    s = act(s, { type: "searchLibrary", player: ap, found: [ids[1]!, yard] });
    expect(s.players[opp]!.life).toBe(life - 2);
    for (const id of [ids[1]!, yard]) expect([s.objects[id]!.zone, s.objects[id]!.tapped]).toEqual(["battlefield", true]);
    expect(s.objects[ids[2]!]!.zone).toBe("hand");
  });
  it("Mind's Dilation: an opponent's first spell each turn exiles their top card, and you may cast it free", () => {
    const dilation = card("Mind's Dilation", "Enchantment", "{5}{U}{U}", { oracleText: "Whenever an opponent casts their first spell each turn, that player exiles the top card of their library. If it's a nonland card, you may cast it without paying its mana cost." });
    const thopter = card("Ornithopter", "Artifact Creature — Thopter", "{0}", { power: "0", toughness: "2", keywords: ["Flying"], oracleText: "Flying" });
    supported(dilation);
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, dilation);
    let s = passUntil(s0, "main1", opp);
    const [a, b] = [toHand(s, opp, thopter), toHand(s, opp, thopter)];
    const top = putOnBattlefield(s, opp, divination);
    moveObject(s, top, "library", { top: true });
    expect(s.players[opp]!.library[0]).toBe(top);
    const hand = s.players[ap]!.hand.length;
    s = run(s, planCast(s, opp, a));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseOption"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[top]!.zone).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", player: ap, options: [top, "none"] });
    s = act(s, { type: "chooseOption", player: ap, choice: top });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: top, player: ap });
    s = settle(run(s, planCast(s, ap, top)));
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(s.objects[top]!.zone).toBe("graveyard");
    // The second spell that turn doesn't trigger it.
    const next = s.players[opp]!.library[0]!;
    s = settle(run(s, planCast(s, opp, b)));
    expect(s.objects[next]!.zone).toBe("library");
  });
  it("Gilded Drake exchanges itself for an opponent's creature, or is sacrificed if it can't", () => {
    const drake = card("Gilded Drake", "Creature — Drake", "{1}{U}", { power: "3", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, exchange control of this creature and up to one target creature an opponent controls. If you don't or can't make an exchange, sacrifice this creature. This ability still resolves if its target becomes illegal." });
    supported(drake);
    const enter = (gone: "none" | "kept" | "left") => {
      const { s: s0, ap, ids, opp } = setup([drake]);
      const b = putOnBattlefield(s0, opp, bear());
      let s = run(s0, planCast(s0, ap, ids[0]!));
      for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
      s = act(s, { type: "chooseTargets", player: ap, targets: [gone === "none" ? { kind: "none" } : { kind: "object", id: b }] });
      if (gone === "left") moveObject(s, b, "graveyard"); // its target is illegal now: it still resolves (rulings)
      s = passToStack(s);
      return { s, ap, opp, drake: ids[0]!, b };
    };
    let { s, ap, opp, drake: d, b } = enter("kept");
    expect(s.objects[d]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[d]!)).toBe(opp);
    expect(controllerOf(s, s.objects[b]!)).toBe(ap);
    ({ s, drake: d } = enter("none"));
    expect(s.objects[d]!.zone).toBe("graveyard");
    ({ s, drake: d } = enter("left"));
    expect(s.objects[d]!.zone).toBe("graveyard");
  });
  it("Semester's End returns them at the next end step, a creature with a +1/+1 counter and a planeswalker with a loyalty counter", () => {
    const semester = card("Semester's End", "Instant", "{3}{W}", { oracleText: "Exile any number of target creatures and/or planeswalkers you control. At the beginning of the next end step, return each of them to the battlefield under its owner's control. Each of them enters with an additional +1/+1 counter on it if it's a creature and an additional loyalty counter on it if it's a planeswalker." });
    supported(semester);
    const { s: s0, ap, ids } = setup([semester]);
    const b = putOnBattlefield(s0, ap, bear());
    const w = putOnBattlefield(s0, ap, walker);
    s0.objects[w]!.counters.loyalty = 3;
    let s = passToStack(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: b }, { kind: "object", id: w }])));
    expect([s.objects[b]!.zone, s.objects[w]!.zone]).toEqual(["exile", "exile"]);
    s = settle(passUntil(s, "end", ap));
    expect([s.objects[b]!.zone, s.objects[w]!.zone]).toEqual(["battlefield", "battlefield"]);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[b]!.counters.loyalty ?? 0).toBe(0);
    expect(s.objects[w]!.counters.loyalty).toBe(4);
    expect(s.objects[w]!.counters["+1/+1"] ?? 0).toBe(0);
  });
  it("Flesh Duplicate has vanishing 3 as a copy of a creature without vanishing, and the copied vanishing otherwise", () => {
    const flesh = card("Flesh Duplicate", "Creature — Shapeshifter Rebel", "{U}{U}", { power: "0", toughness: "0", oracleText: "You may have this creature enter as a copy of any creature on the battlefield, except it has vanishing 3 if that creature doesn't have vanishing. (A permanent with vanishing 3 enters with three time counters on it. At the beginning of your upkeep, remove a time counter from it. When the last is removed, sacrifice it.)" });
    const fader = card("Chronozoa", "Creature — Illusion", "{3}{U}", { power: "3", toughness: "3", keywords: ["Flying", "Vanishing"], oracleText: "Flying\nVanishing 3 (This creature enters with three time counters on it. At the beginning of your upkeep, remove a time counter from it. When the last is removed, sacrifice it.)\nWhen this creature dies, if it had no time counters on it, create two tokens that are copies of it." });
    supported(flesh);
    const copyOf = (pick: (s: GameState, opp: PlayerId) => string) => {
      const { s: s0, ap, ids, opp } = setup([flesh]);
      const target = pick(s0, opp);
      let s = run(s0, planCast(s0, ap, ids[0]!));
      for (let i = 0; i < 40 && !(s.pending?.kind === "chooseOption" && s.pending.what === "copy"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      s = passToStack(act(s, { type: "chooseOption", player: ap, choice: target }));
      const o = s.objects[ids[0]!]!;
      return Object.assign(o, { vanishing: (defOf(s, o).oracleText.match(/^Vanishing/gm) ?? []).length });
    };
    const asBear = copyOf((s, opp) => putOnBattlefield(s, opp, bear()));
    expect(asBear.zone).toBe("battlefield");
    expect(asBear.counters.time).toBe(3);
    const asFader = copyOf((s, opp) => {
      const f = putOnBattlefield(s, opp, fader);
      s.objects[f]!.counters.time = 1;
      return f;
    });
    expect(asFader.counters.time).toBe(3); // Chronozoa's own vanishing 3, not a second one
    expect([asBear.vanishing, asFader.vanishing]).toEqual([1, 1]);
  });
  it("Zhulodok gives colorless spells with mana value 7 or more cast from the hand two cascade triggers", () => {
    const zhulodok = card("Zhulodok, Void Gorger", "Legendary Creature — Eldrazi", "{5}{C}", { power: "7", toughness: "4", oracleText: "Colorless spells you cast from your hand with mana value 7 or greater have \"Cascade, cascade.\" (When you cast one, exile cards from the top of your library until you exile a nonland card that costs less. You may cast it without paying its mana cost. Put the exiled cards on the bottom in a random order. Then do it again.)" });
    const titan = card("Test Titan", "Creature — Eldrazi", "{7}", { power: "7", toughness: "7" });
    const dragon = card("Test Dragon", "Creature — Dragon", "{6}{R}", { power: "7", toughness: "7" });
    supported(zhulodok);
    const cascades = (d: CardDef) => {
      const { s: s0, ap, ids } = setup([d]);
      putOnBattlefield(s0, ap, zhulodok);
      const s = run(s0, planCast(s0, ap, ids[0]!));
      return [...s.stack, ...s.triggerQueue].filter((x) => x.body?.text.startsWith("Cascade")).length;
    };
    expect(cascades(titan)).toBe(2);
    expect(cascades(dragon)).toBe(0);
  });
  it("Pain for All: the enchanted creature deals damage equal to its power to any other target", () => {
    const pain = card("Pain for All", "Enchantment — Aura", "{2}{R}", { oracleText: "Enchant creature you control\nWhen this Aura enters, enchanted creature deals damage equal to its power to any other target.\nWhenever enchanted creature is dealt damage, it deals that much damage to each opponent." });
    supported(pain);
    const { s: s0, ap, ids, opp } = setup([pain]);
    const giant = putOnBattlefield(s0, ap, bear({ name: "Hill Giant", power: "3", toughness: "3" }));
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: giant }]));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: giant }] })).toThrow();
    const life = s.players[opp]!.life;
    s = passToStack(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.log.some((l) => /Hill Giant deals 3 damage/.test(l.text))).toBe(true);
  });
  it("Brokers Ascendancy puts a +1/+1 counter on each creature and a loyalty counter on each planeswalker at your end step", () => {
    const brokers = card("Brokers Ascendancy", "Enchantment", "{G}{W}{U}", { oracleText: "At the beginning of your end step, put a +1/+1 counter on each creature you control and a loyalty counter on each planeswalker you control." });
    supported(brokers);
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, brokers);
    const b = putOnBattlefield(s0, ap, bear());
    const w = putOnBattlefield(s0, ap, walker);
    s0.objects[w]!.counters.loyalty = 3;
    const s = settle(passUntil(s0, "end", ap));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[w]!.counters.loyalty).toBe(4);
  });
  it("Weathered Sentinels can attack only players who attacked you during their last turn", () => {
    const sentinels = card("Weathered Sentinels", "Artifact Creature — Wall", "{3}", { power: "2", toughness: "5", keywords: ["Defender", "Reach", "Vigilance", "Trample"], oracleText: "Defender, reach, vigilance, trample\nThis creature can attack players who attacked you during their last turn as though it didn't have defender.\nWhenever this creature attacks, it gets +3/+3 and gains indestructible until end of turn." });
    supported(sentinels);
    const { s, ap, opp } = setup([]);
    const w = putOnBattlefield(s, ap, sentinels);
    const other = later(s, ap, 2);
    expect(potentialAttackers(s, ap).some((o) => o.id === w)).toBe(false);
    s.players[opp]!.turnBegan = s.turn - 1;
    s.players[opp]!.attackedInTurn = { turn: s.turn - 1, players: [ap] };
    expect(potentialAttackers(s, ap).some((o) => o.id === w)).toBe(true);
    expect(attackProblem(s, s.objects[w]!, opp)).toBeNull();
    expect(attackProblem(s, s.objects[w]!, other)).toMatch(/defender/);
    // Attacks in an earlier turn of theirs don't count.
    s.players[opp]!.turnBegan = s.turn - 1;
    s.players[opp]!.attackedInTurn = { turn: s.turn - 5, players: [ap] };
    expect(attackProblem(s, s.objects[w]!, opp)).toMatch(/defender/);
  });
  it("Rionya makes one plus the number of instant and sorcery spells you've cast this turn hasty token copies, exiled at end step", () => {
    const rionya = card("Rionya, Fire Dancer", "Legendary Creature — Human Wizard", "{3}{R}{R}", { power: "3", toughness: "4", oracleText: "At the beginning of combat on your turn, create X tokens that are copies of another target creature you control, where X is one plus the number of instant and sorcery spells you've cast this turn. They gain haste. Exile them at the beginning of the next end step." });
    supported(rionya);
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, rionya);
    const b = putOnBattlefield(s0, ap, bear());
    const sorcery = putOnBattlefield(s0, ap, divination);
    moveObject(s0, sorcery, "graveyard");
    const creature = s0.cards[s0.objects[b]!.cardId]!.oracleId;
    s0.castThisTurn = [{ player: ap, card: s0.cards[s0.objects[sorcery]!.cardId]!.oracleId }, { player: ap, card: creature }];
    let s = passUntil(s0, "beginCombat", ap);
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets" && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: b }] });
    s = passToStack(s);
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]!.name === s.cards[s.objects[b]!.cardId]!.name);
    expect(tokens.length).toBe(2);
    for (const id of tokens) expect(objHasKeyword(s, s.objects[id]!, "Haste")).toBe(true);
    s = settle(passUntil(s, "end", ap));
    expect(tokens.every((id) => !s.battlefield.includes(id))).toBe(true);
  });
  it("Witch-king of Angmar: each opponent sacrifices a creature that dealt you combat damage this turn, then the Ring tempts you", () => {
    const witch = card("Witch-king of Angmar", "Legendary Creature — Wraith Noble", "{3}{B}{B}", { power: "5", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nWhenever one or more creatures deal combat damage to you, each opponent sacrifices a creature of their choice that dealt combat damage to you this turn. The Ring tempts you.\nDiscard a card: Witch-king of Angmar gains indestructible until end of turn. Tap him." });
    supported(witch);
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, witch);
    s0.objects[w]!.tapped = true; // it doesn't block
    const hitter = putOnBattlefield(s0, opp, bear({ name: "Hitter" }));
    const stayer = putOnBattlefield(s0, opp, bear({ name: "Stayer" }));
    let s = passUntil(s0, "declareAttackers", opp);
    for (let i = 0; i < 5 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: hitter, defender: ap }] });
    s = settle(passUntil(s, "endCombat", opp));
    expect(s.objects[hitter]!.zone).toBe("graveyard");
    expect(s.objects[stayer]!.zone).toBe("battlefield");
    expect(s.players[ap]!.ring?.tempted).toBe(1);
  });
  it("Dance of the Manse returns artifact and non-Aura enchantment cards with mana value X or less, as 4/4 creatures if X is 6 or more", () => {
    const dance = card("Dance of the Manse", "Sorcery", "{X}{W}{U}", { oracleText: "Return up to X target artifact and/or non-Aura enchantment cards each with mana value X or less from your graveyard to the battlefield. If X is 6 or more, those permanents are 4/4 creatures in addition to their other types." });
    supported(dance);
    const rock = card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}." });
    const glow = card("Test Glow", "Enchantment", "{1}{W}", { oracleText: "" });
    const aura = card("Test Aura", "Enchantment — Aura", "{W}", { oracleText: "Enchant creature\nEnchanted creature gets +1/+1." });
    for (const x of [2, 6]) {
      const { s: s0, ap } = setup([]);
      const ids = [rock, glow, aura].map((d) => {
        const id = putOnBattlefield(s0, ap, d);
        moveObject(s0, id, "graveyard");
        return id;
      });
      for (let i = 0; i < x + 2; i++) putOnBattlefield(s0, ap, card(`Land ${i}`, "Land", "", { oracleText: "{T}: Add {W} or {U}." }));
      const spell = toHand(s0, ap, dance);
      // An Aura isn't a legal target: "non-Aura enchantment".
      expect(planCast(s0, ap, spell, [{ kind: "object", id: ids[2]! }], undefined, "auto", x)).toBeNull();
      let s = run(s0, planCast(s0, ap, spell, ids.slice(0, 2).map((id) => ({ kind: "object" as const, id })), undefined, "auto", x));
      s = settle(s);
      const back = [...named(s, "Mind Stone"), ...named(s, "Test Glow")];
      expect(back.length).toBe(2);
      for (const id of back) {
        const o = s.objects[id]!;
        expect(objIsType(s, o, "Creature"), `X=${x}`).toBe(x >= 6);
        if (x >= 6) expect([power(s, o), toughness(s, o)]).toEqual([4, 4]);
      }
    }
  });
  it("Settle the Wreckage exiles the target player's attackers, then they may search for that many basic lands", () => {
    const settleCard = card("Settle the Wreckage", "Instant", "{2}{W}{W}", { oracleText: "Exile all attacking creatures target player controls. That player may search their library for that many basic land cards, put those cards onto the battlefield tapped, then shuffle." });
    supported(settleCard);
    const { s: s0, ap, opp } = setup([]);
    const spell = toHand(s0, ap, settleCard);
    const a = putOnBattlefield(s0, opp, bear({ name: "Raider A" }));
    const b = putOnBattlefield(s0, opp, bear({ name: "Raider B" }));
    const home = putOnBattlefield(s0, opp, bear({ name: "Homebody" }));
    let s = passUntil(s0, "declareAttackers", opp);
    for (let i = 0; i < 5 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: a, defender: ap }, { attacker: b, defender: ap }] });
    for (let i = 0; i < 5 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === opp && objIsType(s, s.objects[id]!, "Land")).length;
    s = run(s, planCast(s, ap, spell, [{ kind: "player", id: opp }]));
    s = passToStack(s);
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(s);
    expect([a, b].map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile"]);
    expect(s.objects[home]!.zone).toBe("battlefield");
    const after = s.battlefield.filter((id) => s.objects[id]!.controller === opp && objIsType(s, s.objects[id]!, "Land"));
    expect(after.length).toBe(lands + 2);
    expect(after.filter((id) => s.objects[id]!.tapped).length).toBeGreaterThanOrEqual(2);
  });
  it("Staff of the Storyteller gets one story counter for each event that creates creature tokens; Akim makes a Bird only the first time each turn", () => {
    const staff = card("Staff of the Storyteller", "Artifact", "{1}{W}", { oracleText: "When this artifact enters, create a 1/1 white Spirit creature token with flying.\nWhenever you create one or more creature tokens, put a story counter on this artifact.\n{W}, {T}, Remove a story counter from this artifact: Draw a card." });
    const akim = card("Akim, the Soaring Wind", "Legendary Creature — Bird Dinosaur", "{2}{U}{R}{W}", { power: "3", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nWhenever you create one or more tokens for the first time each turn, create a 1/1 white Bird creature token with flying.\n{3}{U}{R}{W}: Creature tokens you control gain double strike until end of turn." });
    const alarm = card("Raise the Alarm", "Instant", "{1}{W}", { oracleText: "Create two 1/1 white Soldier creature tokens." });
    supported(staff, akim, alarm);
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, akim);
    const st = toHand(s0, ap, staff);
    const spells = [toHand(s0, ap, alarm), toHand(s0, ap, alarm)];
    let s = settle(run(s0, planCast(s0, ap, st)));
    // The Spirit: a counter, and Akim's Bird (another creature token, another event: another counter).
    expect(s.objects[st]!.counters?.story).toBe(2);
    expect(named(s, "Bird Token").length).toBe(1);
    for (const sp of spells) s = settle(run(s, planCast(s, ap, sp)));
    expect(s.objects[st]!.counters?.story).toBe(4);
    expect(named(s, "Soldier Token").length).toBe(4);
    expect(named(s, "Bird Token").length).toBe(1);
  });
  it("Ugin's Labyrinth imprints a colorless 7+ card, taps for {C}{C} while it has one, and returns it to hand", () => {
    const labyrinth = card("Ugin's Labyrinth", "Land", "", { oracleText: "Imprint — When this land enters, you may exile a colorless card with mana value 7 or greater from your hand.\n{T}: Add {C}. If a card is exiled with this land, add {C}{C} instead.\n{T}: Return the exiled card to its owner's hand." });
    const titan = card("Test Titan", "Creature — Eldrazi", "{7}", { power: "7", toughness: "7", oracleText: "" });
    supported(labyrinth);
    const { s: s0, ap } = setup([]);
    const land = toHand(s0, ap, labyrinth);
    const big = toHand(s0, ap, titan);
    let s = act(s0, { type: "playLand", player: ap, objectId: land });
    s = passToStack(s);
    // The imprint: "you may exile ..." then the card to exile.
    for (let i = 0; i < 4 && s.pending; i++) s = s.pending.kind === "chooseMay" ? act(s, { type: "chooseMay", player: ap, yes: true }) : botActions(s, ap).reduce((x, a) => act(x, a), s);
    s = settle(s);
    expect(s.objects[big]!.zone).toBe("exile");
    const before = s.players[ap]!.manaPool.C;
    s = act(s, { type: "activateMana", player: ap, objectId: land, mana: "C", ability: 0 });
    expect(s.players[ap]!.manaPool.C - before).toBe(2);
    s.objects[land]!.tapped = false;
    s = run(s, planActivate(s, ap, land, 0));
    s = settle(s);
    expect(s.objects[big]!.zone).toBe("hand");
    // Nothing exiled now: {C}.
    s.objects[land]!.tapped = false;
    const now = s.players[ap]!.manaPool.C;
    s = act(s, { type: "activateMana", player: ap, objectId: land, mana: "C", ability: 0 });
    expect(s.players[ap]!.manaPool.C - now).toBe(1);
  });
  it("Tragic Arrogance: you choose an artifact, a creature, an enchantment and a planeswalker for each player; the other nonland permanents are sacrificed", () => {
    const arrogance = card("Tragic Arrogance", "Sorcery", "{3}{W}{W}", { oracleText: "For each player, you choose from among the permanents that player controls an artifact, a creature, an enchantment, and a planeswalker. Then each player sacrifices all other nonland permanents they control." });
    supported(arrogance);
    const { s: s0, ap, opp } = setup([]);
    const spell = toHand(s0, ap, arrogance);
    const rock = card("Test Rock", "Artifact", "{1}", { oracleText: "" });
    const mine = [putOnBattlefield(s0, ap, bear({ name: "Mine A" })), putOnBattlefield(s0, ap, bear({ name: "Mine B" }))];
    const theirs = [putOnBattlefield(s0, opp, bear({ name: "Theirs A" })), putOnBattlefield(s0, opp, bear({ name: "Theirs B" }))];
    const rocks = [putOnBattlefield(s0, opp, rock), putOnBattlefield(s0, opp, rock)];
    let s = run(s0, planCast(s0, ap, spell));
    s = passToStack(s);
    const asked: (PlayerId | undefined)[] = [];
    for (let i = 0; i < 12 && s.pending; i++) {
      const p = s.pending;
      if (p.kind !== "pickPermanents") break;
      expect(p.player).toBe(ap); // you choose for everyone
      asked.push(p.of);
      s = act(s, { type: "pickPermanents", player: ap, ids: [p.options[0]!] });
    }
    s = settle(s);
    expect(asked).toContain(opp);
    expect(mine.filter((id) => s.objects[id]!.zone === "battlefield").length).toBe(1);
    expect(theirs.filter((id) => s.objects[id]!.zone === "battlefield").length).toBe(1);
    expect(rocks.filter((id) => s.objects[id]!.zone === "battlefield").length).toBe(1);
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && objIsType(s, s.objects[id]!, "Land")).length).toBeGreaterThan(5);
  });
  it("Tishana's Tidebinder counters an activated ability, and its creature loses all abilities while the Tidebinder stays", () => {
    const tidebinder = card("Tishana's Tidebinder", "Creature — Merfolk Wizard", "{2}{U}", { power: "3", toughness: "2", keywords: ["Flash"], oracleText: "Flash\nWhen this creature enters, counter up to one target activated or triggered ability. If an ability of an artifact, creature, or planeswalker is countered this way, that permanent loses all abilities for as long as this creature remains on the battlefield. (Mana abilities can't be targeted.)" });
    const pinger = card("Test Healer", "Creature — Cleric", "{1}{W}", { power: "1", toughness: "1", keywords: ["Vigilance"], oracleText: "Vigilance\n{T}: You gain 1 life." });
    supported(tidebinder, pinger);
    const { s: s0, ap, opp } = setup([]);
    const healer = putOnBattlefield(s0, opp, pinger);
    const tb = toHand(s0, ap, tidebinder);
    s0.priority = opp;
    const life = s0.players[opp]!.life;
    let s = run(s0, planActivate(s0, opp, healer, 0));
    const ability = s.stack[s.stack.length - 1]!.id;
    for (let i = 0; i < 4 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planCast(s, ap, tb));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "stack", id: ability }] });
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life);
    expect(objHasKeyword(s, s.objects[healer]!, "Vigilance")).toBe(false);
    expect(abilityProblem(s, opp, healer, 0)).toBeTruthy();
    moveObject(s, tb, "graveyard");
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[healer]!, "Vigilance")).toBe(true);
  });
  it("web-slinging: Spider-Sense cast for {U} by returning a tapped creature you control counters a triggered ability", () => {
    const sense = card("Spider-Sense", "Instant", "{1}{U}", { oracleText: "Web-slinging {U} (You may cast this spell for {U} if you also return a tapped creature you control to its owner's hand.)\nCounter target instant spell, sorcery spell, or triggered ability." });
    const trigger = card("Test Chanter", "Creature — Human", "{1}{W}", { power: "1", toughness: "1", oracleText: "At the beginning of your upkeep, you gain 5 life." });
    supported(sense);
    const { s: s0, ap, opp } = setup([]);
    const spell = toHand(s0, ap, sense);
    const tapped = putOnBattlefield(s0, ap, bear({ name: "Tired Bear" }));
    const fresh = putOnBattlefield(s0, ap, bear({ name: "Fresh Bear" }));
    s0.objects[tapped]!.tapped = true;
    putOnBattlefield(s0, opp, trigger);
    // Only a tapped creature can be returned.
    expect(castProblem(s0, ap, spell, undefined, undefined, undefined, undefined, undefined, { alt: "alternative", returnToHand: [fresh] })).toBeTruthy();
    let s = passUntil(s0, "upkeep", opp);
    for (let i = 0; i < 6 && !s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const life = s.players[opp]!.life;
    const ability = s.stack[s.stack.length - 1]!;
    expect(ability.kind).toBe("ability");
    for (let i = 0; i < 4 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const before = s.battlefield.filter((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped).length;
    s = run(s, planCast(s, ap, spell, [{ kind: "stack", id: ability.id }], undefined, "auto", undefined, { alt: "alternative", returnToHand: [tapped] }));
    expect(s.objects[tapped]!.zone).toBe("hand");
    // One land tapped for {U}.
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped).length).toBe(before - 1);
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life);
  });
  it("Beacon of Immortality doubles a life total and shuffles itself away; Fatal Push checks mana value and revolt as it resolves; Jumbo Cactuar's flavor word", () => {
    const beacon = card("Beacon of Immortality", "Instant", "{5}{W}", { oracleText: "Double target player's life total. Shuffle Beacon of Immortality into its owner's library." });
    const push = card("Fatal Push", "Instant", "{B}", { oracleText: "Destroy target creature if it has mana value 2 or less.\nRevolt — Destroy that creature if it has mana value 4 or less instead if a permanent left the battlefield under your control this turn." });
    const cactuar = card("Jumbo Cactuar", "Creature — Plant", "{5}{G}{G}", { power: "1", toughness: "7", oracleText: "10,000 Needles — Whenever Jumbo Cactuar attacks, it gets +9999/+0 until end of turn." });
    supported(beacon, push, cactuar);
    const { s: s0, ap, opp } = setup([]);
    const b = toHand(s0, ap, beacon);
    s0.players[ap]!.life = 27;
    let s = settle(run(s0, planCast(s0, ap, b, [{ kind: "player", id: ap }])));
    expect(s.players[ap]!.life).toBe(54);
    expect(s.objects[b]!.zone).toBe("library");
    // Fatal Push: a 3-drop survives without revolt, dies with it.
    const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3", oracleText: "" });
    for (const revolt of [false, true]) {
      const { s: t0, ap: me, opp: them, ids } = setup([push]);
      const target = putOnBattlefield(t0, them, ogre);
      const p = ids[0]!;
      if (revolt) {
        const clue = putOnBattlefield(t0, me, bear({ name: "Leaver" }));
        moveObject(t0, clue, "graveyard");
      }
      const t = settle(run(t0, planCast(t0, me, p, [{ kind: "object", id: target }])));
      expect(t.objects[target]!.zone, `revolt ${revolt}`).toBe(revolt ? "graveyard" : "battlefield");
    }
    void opp;
  });
  it("Farmer Cotton creates X Halflings and X Foods; The Goose Mother creates half X Foods, rounded up", () => {
    const cotton = card("Farmer Cotton", "Legendary Creature — Halfling Peasant", "{X}{G}{W}", { power: "1", toughness: "1", oracleText: "When Farmer Cotton enters, create X 1/1 white Halfling creature tokens and X Food tokens." });
    const goose = card("The Goose Mother", "Legendary Creature — Bird Hydra", "{X}{G}{U}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying\nThe Goose Mother enters with X +1/+1 counters on it.\nWhen The Goose Mother enters, create half X Food tokens, rounded up.\nWhenever The Goose Mother attacks, you may sacrifice a Food. If you do, draw a card." });
    supported(cotton, goose);
    const { s: s0, ap, ids } = setup([cotton, goose]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 2)));
    expect(named(s, "Halfling Token").length).toBe(2);
    expect(named(s, "Food Token").length).toBe(2);
    s = settle(run(s, planCast(s, ap, ids[1]!, undefined, undefined, "auto", 3)));
    expect(s.objects[ids[1]!]!.counters["+1/+1"]).toBe(3);
    expect(named(s, "Food Token").length).toBe(4);
  });
  it("Stormtide Leviathan: all lands are Islands too; creatures without flying or islandwalk can't attack", () => {
    const leviathan = card("Stormtide Leviathan", "Creature — Leviathan", "{8}{U}{U}{U}", { power: "8", toughness: "8", keywords: ["Islandwalk"], oracleText: "Islandwalk (This creature can't be blocked as long as defending player controls an Island.)\nAll lands are Islands in addition to their other types.\nCreatures without flying or islandwalk can't attack." });
    supported(leviathan);
    const { s: s0, ap, opp } = setup([]);
    const lev = putOnBattlefield(s0, ap, leviathan);
    const bears = putOnBattlefield(s0, ap, bear());
    const bird = putOnBattlefield(s0, ap, card("Test Bird", "Creature — Bird", "{U}", { power: "1", toughness: "1", keywords: ["Flying"], oracleText: "Flying" }));
    const forest = s0.battlefield.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Forest")!;
    invalidateCharacteristics(s0);
    expect(objIsType(s0, s0.objects[forest]!, "Land")).toBe(true);
    expect(characteristics(s0, s0.objects[forest]!).subtypes).toEqual(expect.arrayContaining(["Forest", "Island"]));
    for (const id of [lev, bears, bird]) s0.objects[id]!.summoningSick = false;
    const can = potentialAttackers(s0, ap).map((o) => o.id);
    expect(can).not.toContain(bears);
    expect(can).toEqual(expect.arrayContaining([lev, bird]));
    void opp;
  });
  it("Zurgo Stormrender: a creature token leaving draws a card if it was attacking, otherwise each opponent loses 1 life", () => {
    const zurgo = card("Zurgo Stormrender", "Legendary Creature — Orc Warrior", "{R}{W}{B}", { power: "3", toughness: "3", keywords: ["Mobilize"], oracleText: "Mobilize 1 (Whenever this creature attacks, create a tapped and attacking 1/1 red Warrior creature token. Sacrifice it at the beginning of the next end step.)\nWhenever a creature token you control leaves the battlefield, draw a card if it was attacking. Otherwise, each opponent loses 1 life." });
    supported(zurgo);
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, zurgo);
    const [a, b] = [putOnBattlefield(s0, ap, bear({ name: "Token A" })), putOnBattlefield(s0, ap, bear({ name: "Token B" }))];
    s0.objects[a]!.isToken = true;
    s0.objects[b]!.isToken = true;
    s0.objects[a]!.attacking = opp;
    const hand = s0.players[ap]!.hand.length;
    const life = s0.players[opp]!.life;
    moveObject(s0, a, "graveyard");
    let s = settle(s0);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.players[opp]!.life).toBe(life);
    moveObject(s, b, "graveyard");
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.players[opp]!.life).toBe(life - 1);
  });
});
