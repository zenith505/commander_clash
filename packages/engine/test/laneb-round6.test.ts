// Lane B, round 6: the least played cards first, working up the popularity list (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, forest, island, mountain, passUntil, plainsCard, pt, putOnBattlefield, setup, swamp } from "./helpers";
import { blockProblem, botActions, characteristics, compileCard, harmfulTargets, invalidateCharacteristics, isFullySupported, objHasKeyword, parseManaCost, planActivate, planCast, planMana, planTurnFaceUp, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { potentialAttackers } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/**
 * Everyone passes until the stack is empty. "You may" questions get `yes`; a pending target choice gets `targets`; a
 * punisher's player in `payers` pays (with their lands), the others don't. Stops at any other question.
 */
const settle = (s: GameState, opts: { yes?: boolean; targets?: TargetChoice[]; payers?: PlayerId[] } = {}) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.yes ?? true });
    else if (p?.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets } as Action);
    else if (p?.kind === "chooseOption" && p.what === "punisher") s = act(s, { type: "chooseOption", player: p.player, choice: opts.payers?.includes(p.player) ? p.options[0]! : "none" });
    else if (p?.kind === "payUnless") {
      const yes = !!opts.payers?.includes(p.player);
      s = run(s, [...(yes && p.cost ? planMana(s, p.player, parseManaCost(p.cost))! : []), { type: "payUnless", player: p.player, pay: yes }]);
    } else if (p?.kind === "arrangeTop") s = act(s, { type: "arrangeTop", player: p.player, top: p.cards, away: [] });
    else if (p) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % s.turnOrder.length]!;
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const types = (s: GameState, id: string) => characteristics(s, s.objects[id]!).types;
const has = (s: GameState, id: string, k: string) => objHasKeyword(s, s.objects[id]!, k);
const creature = (name: string, typeLine: string, manaCost: string, p: number, t: number, extra: Partial<CardDef> = {}) =>
  card(name, typeLine, manaCost, { power: String(p), toughness: String(t), ...extra });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2);
const blueBird = () => creature("Blue Bird", "Creature — Bird", "{1}{U}", 1, 1, { keywords: ["Flying"], oracleText: "Flying" });
const into = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" = "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Attackers declared, the game paused on the defending player's blocks (or on a target for an attack trigger). */
const toBlocks = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[], targets?: TargetChoice[]) => {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 40 && s.pending?.kind !== "declareBlockers"; i++) {
    if (s.pending?.kind === "chooseTargets" && targets) s = act(s, { type: "chooseTargets", player: s.pending.player, targets } as Action);
    else if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes: true });
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Blocks declared by `opp`; every other defending player declares none. */
const block = (s: GameState, opp: PlayerId, blocks: { blocker: string; attacker: string }[]) => {
  s = act(s, { type: "declareBlockers", player: opp, blocks });
  for (let i = 0; i < 10 && s.pending?.kind === "declareBlockers"; i++) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
  return s;
};
/** The next upkeep of `pid`, with its triggers resolved. */
const toUpkeep = (s: GameState, pid: PlayerId, opts: Parameters<typeof settle>[1] = {}) => settle(passUntil(s, "upkeep", pid), opts);

const attach = (s: GameState, pid: PlayerId, def: CardDef, to: string) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = to;
  invalidateCharacteristics(s);
  return id;
};
/** The top spell on the stack, as a target. */
const topSpell = (s: GameState): TargetChoice => ({ kind: "stack", id: s.stack[s.stack.length - 1]!.id } as TargetChoice);

// Real oracle text (Scryfall).
const rayOfRuin = card("Ray of Ruin", "Sorcery", "{4}{B}", { cmc: 5, keywords: ["Scry"], oracleText: "Exile target creature, Vehicle, or nonbasic land. Scry 1. (Look at the top card of your library. You may put that card on the bottom.)" });
const electrostaticBolt = card("Electrostatic Bolt", "Instant", "{R}", { cmc: 1, oracleText: "Electrostatic Bolt deals 2 damage to target creature. If it's an artifact creature, Electrostatic Bolt deals 4 damage to it instead." });
const purifyingDragon = card("Purifying Dragon", "Creature — Dragon", "{3}{R}{R}", { cmc: 5, power: "4", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nWhenever this creature attacks, it deals 1 damage to target creature defending player controls. If that creature is a Zombie, this creature deals 2 damage to it instead." });
const rendingFlame = card("Rending Flame", "Instant", "{2}{R}", { cmc: 3, oracleText: "Rending Flame deals 5 damage to target creature or planeswalker. If that permanent is a Spirit, Rending Flame also deals 2 damage to that permanent's controller." });
const rayOfEnfeeblement = card("Ray of Enfeeblement", "Instant", "{B}", { cmc: 1, oracleText: "Target creature gets -4/-1 until end of turn. If that creature is white, it gets -4/-4 until end of turn instead." });
const wakandanRoyalGuard = card("Wakandan Royal Guard", "Creature — Human Soldier Hero", "{4}{G}", { cmc: 5, power: "4", toughness: "4", keywords: ["Vigilance"], oracleText: "Vigilance\nWhen this creature enters, put a +1/+1 counter on target creature. If that creature is another Hero, put two +1/+1 counters on it instead." });
const oversoulOfDusk = card("Oversoul of Dusk", "Creature — Spirit Avatar", "{G/W}{G/W}{G/W}{G/W}{G/W}", { cmc: 5, power: "5", toughness: "5", keywords: ["Protection"], oracleText: "Protection from blue, from black, and from red" });
const tsaboTavoc = card("Tsabo Tavoc", "Legendary Creature — Phyrexian Horror", "{5}{B}{R}", { cmc: 7, power: "7", toughness: "4", keywords: ["First strike","Protection"], oracleText: "First strike, protection from legendary creatures\n{B}{B}, {T}: Destroy target legendary creature. It can't be regenerated." });
const harbingerOfSpring = card("Harbinger of Spring", "Creature — Spirit", "{4}{G}", { cmc: 5, power: "2", toughness: "1", keywords: ["Protection","Soulshift"], oracleText: "Protection from non-Spirit creatures\nSoulshift 4 (When this creature dies, you may return target Spirit card with mana value 4 or less from your graveyard to your hand.)" });
const inOketrasName = card("In Oketra's Name", "Instant", "{1}{W}", { cmc: 2, oracleText: "Zombies you control get +2/+1 until end of turn. Other creatures you control get +1/+1 until end of turn." });
const sigilBlessing = card("Sigil Blessing", "Instant", "{G}{W}", { cmc: 2, oracleText: "Until end of turn, target creature you control gets +3/+3 and other creatures you control get +1/+1." });
const joinForces = card("Join Forces", "Instant", "{2}{W}", { cmc: 3, oracleText: "Untap up to two target creatures. They each get +2/+2 until end of turn." });
const ridingTheDiluHorse = card("Riding the Dilu Horse", "Sorcery", "{2}{G}", { cmc: 3, oracleText: "Target creature gets +2/+2 and gains horsemanship. (It can't be blocked except by creatures with horsemanship. This effect lasts indefinitely.)" });
const agility = card("Agility", "Enchantment — Aura", "{1}{R}", { cmc: 2, keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +1/+1 and has flanking. (Whenever a creature without flanking blocks this creature, the blocking creature gets -1/-1 until end of turn.)" });
const vectisGloves = card("Vectis Gloves", "Artifact — Equipment", "{2}", { cmc: 2, keywords: ["Equip"], oracleText: "Equipped creature gets +2/+0 and has artifact landwalk. (It can't be blocked as long as defending player controls an artifact land.)\nEquip {2}" });
const vex = card("Vex", "Instant", "{2}{U}", { cmc: 3, oracleText: "Counter target spell. That spell's controller may draw a card." });
const suffocatingBlast = card("Suffocating Blast", "Instant", "{1}{U}{U}{R}", { cmc: 4, oracleText: "Counter target spell and Suffocating Blast deals 3 damage to target creature." });
const outwit = card("Outwit", "Instant", "{U}", { cmc: 1, oracleText: "Counter target spell that targets a player." });
const turnToSlag = card("Turn to Slag", "Sorcery", "{3}{R}{R}", { cmc: 5, oracleText: "Turn to Slag deals 5 damage to target creature. Destroy all Equipment attached to that creature." });
const blastfireBolt = card("Blastfire Bolt", "Instant", "{5}{R}", { cmc: 6, oracleText: "Blastfire Bolt deals 5 damage to target creature. Destroy all Equipment attached to that creature." });
const hubris = card("Hubris", "Instant", "{1}{U}", { cmc: 2, oracleText: "Return target creature and all Auras attached to it to their owners' hands." });

describe("Riders checked as the spell resolves: what the creature or permanent is (CR 608.2c)", () => {
  it("are fully supported", () => supported(rayOfRuin, electrostaticBolt, purifyingDragon, rendingFlame, rayOfEnfeeblement, wakandanRoyalGuard));

  it("Ray of Ruin exiles a creature, a Vehicle or a nonbasic land, not a basic land, then scries 1", () => {
    let { s, ap, opp, ids } = setup([rayOfRuin, rayOfRuin]);
    const vehicle = putOnBattlefield(s, opp, card("Test Wagon", "Artifact — Vehicle", "{2}", { power: "3", toughness: "3", oracleText: "Crew 1", keywords: ["Crew"] }));
    const nonbasic = putOnBattlefield(s, opp, card("Test Fortress", "Land", "", { oracleText: "{T}: Add {C}." }));
    const basic = putOnBattlefield(s, opp, swamp);
    expect(planCast(s, ap, ids[0]!, [tgt(basic)])).toBeNull();
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(vehicle)])));
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(nonbasic)])));
    expect(zone(s, vehicle)).toBe("exile");
    expect(zone(s, nonbasic)).toBe("exile");
  });

  it("Electrostatic Bolt deals 4 to an artifact creature, 2 to another", () => {
    let { s, ap, opp, ids } = setup([electrostaticBolt, electrostaticBolt]);
    const golem = putOnBattlefield(s, opp, creature("Test Golem", "Artifact Creature — Golem", "{3}", 3, 3));
    const ogre = putOnBattlefield(s, opp, creature("Test Ogre", "Creature — Ogre", "{2}{R}", 3, 3));
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(golem)])));
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(ogre)])));
    expect(zone(s, golem)).toBe("graveyard");
    expect(s.objects[ogre]!.damage).toBe(2);
  });

  it("Purifying Dragon deals 2 to a Zombie, 1 to anything else", () => {
    for (const zombie of [false, true]) {
      let { s, ap, opp } = setup([]);
      const d = putOnBattlefield(s, ap, purifyingDragon);
      const c = putOnBattlefield(s, opp, creature("Test Walker", zombie ? "Creature — Zombie" : "Creature — Human", "{2}{B}", 1, 4));
      s = toBlocks(s, ap, [{ attacker: d, defender: opp }], [tgt(c)]);
      expect(s.objects[c]!.damage).toBe(zombie ? 2 : 1);
    }
  });

  it("Rending Flame also deals 2 to the controller of a Spirit", () => {
    for (const spirit of [false, true]) {
      let { s, ap, opp, ids } = setup([rendingFlame]);
      const c = putOnBattlefield(s, opp, creature("Test Ghost", spirit ? "Creature — Spirit" : "Creature — Bird", "{2}{W}", 6, 6));
      const life0 = life(s, opp);
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(c)])));
      expect(s.objects[c]!.damage).toBe(5);
      expect(life(s, opp)).toBe(life0 - (spirit ? 2 : 0));
    }
  });

  it("Ray of Enfeeblement gives a white creature -4/-4, any other -4/-1", () => {
    let { s, ap, opp, ids } = setup([rayOfEnfeeblement, rayOfEnfeeblement]);
    const white = putOnBattlefield(s, opp, creature("Test Knight", "Creature — Human Knight", "{3}{W}", 5, 5));
    const green = putOnBattlefield(s, opp, creature("Test Beast", "Creature — Beast", "{3}{G}", 5, 5));
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(white)])));
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(green)])));
    expect(pt(s, white)).toBe("1/1");
    expect(pt(s, green)).toBe("1/4");
  });

  it("Wakandan Royal Guard puts two counters on another Hero, one on itself or a non-Hero", () => {
    for (const on of ["hero", "self", "other"] as const) {
      let { s, ap, ids } = setup([wakandanRoyalGuard]);
      const hero = putOnBattlefield(s, ap, creature("Test Hero", "Creature — Human Hero", "{1}{W}", 2, 2));
      const bear0 = putOnBattlefield(s, ap, greenBear());
      s = run(s, planCast(s, ap, ids[0]!));
      const who = on === "hero" ? hero : on === "self" ? ids[0]! : bear0;
      s = settle(s, { targets: [tgt(who)] });
      expect(s.objects[who]!.counters["+1/+1"] ?? 0).toBe(on === "hero" ? 2 : 1);
    }
  });
});

describe("Protection lists, from legendary creatures and from non-Spirit creatures (CR 702.16)", () => {
  it("are fully supported", () => supported(oversoulOfDusk, tsaboTavoc, harbingerOfSpring));

  it("Oversoul of Dusk has protection from blue, black and red", () => {
    const { s, ap } = setup([]);
    const o = putOnBattlefield(s, ap, oversoulOfDusk);
    for (const c of ["blue", "black", "red"]) expect(has(s, o, `Protection from ${c}`)).toBe(true);
    expect(has(s, o, "Protection from green")).toBe(false);
  });

  it("Tsabo Tavoc can't be blocked by a legendary creature; Harbinger of Spring only by Spirits (and changelings)", () => {
    let { s, ap, opp } = setup([]);
    const tsabo = putOnBattlefield(s, ap, tsaboTavoc);
    const harb = putOnBattlefield(s, ap, harbingerOfSpring);
    const legend = putOnBattlefield(s, opp, creature("Test Legend", "Legendary Creature — Human", "{1}{W}", 2, 2));
    const plain = putOnBattlefield(s, opp, greenBear());
    const spirit = putOnBattlefield(s, opp, creature("Test Spirit", "Creature — Spirit", "{1}{W}", 1, 1));
    const shifter = putOnBattlefield(s, opp, creature("Test Shifter", "Creature — Shapeshifter", "{1}{U}", 1, 1, { keywords: ["Changeling"], oracleText: "Changeling (This card is every creature type.)" }));
    s = toBlocks(s, ap, [{ attacker: tsabo, defender: opp }, { attacker: harb, defender: opp }]);
    const o = (id: string) => s.objects[id]!;
    expect(blockProblem(s, o(legend), o(tsabo))).not.toBeNull();
    expect(blockProblem(s, o(plain), o(tsabo))).toBeNull();
    expect(blockProblem(s, o(plain), o(harb))).not.toBeNull();
    expect(blockProblem(s, o(legend), o(harb))).not.toBeNull();
    expect(blockProblem(s, o(spirit), o(harb))).toBeNull();
    expect(blockProblem(s, o(shifter), o(harb))).toBeNull();
  });

  it("damage from a legendary creature to Tsabo Tavoc is prevented", () => {
    let { s, ap, opp } = setup([]);
    const tsabo = putOnBattlefield(s, opp, tsaboTavoc);
    const legend = putOnBattlefield(s, ap, creature("Test Legend", "Legendary Creature — Human", "{1}{W}", 2, 2));
    s = toBlocks(s, ap, [{ attacker: legend, defender: opp }]);
    expect(blockProblem(s, s.objects[tsabo]!, s.objects[legend]!)).toBeNull();
    s = block(s, opp, [{ blocker: tsabo, attacker: legend }]);
    s = passUntil(s, "end", ap);
    expect(s.objects[tsabo]!.damage).toBe(0);
    expect(zone(s, legend)).toBe("graveyard");
  });
});

describe("Pumps: other creatures, two targets, no duration, and a granted flanking or artifact landwalk", () => {
  it("are fully supported", () => supported(inOketrasName, sigilBlessing, joinForces, ridingTheDiluHorse, agility, vectisGloves));

  it("In Oketra's Name: Zombies get +2/+1, your other creatures +1/+1", () => {
    let { s, ap, opp, ids } = setup([inOketrasName]);
    const z = putOnBattlefield(s, ap, creature("Test Zombie", "Creature — Zombie", "{1}{B}", 2, 2));
    const b = putOnBattlefield(s, ap, greenBear());
    const theirs = putOnBattlefield(s, opp, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(pt(s, z)).toBe("4/3");
    expect(pt(s, b)).toBe("3/3");
    expect(pt(s, theirs)).toBe("2/2");
  });

  it("Sigil Blessing: +3/+3 to the target, +1/+1 to your others, until end of turn", () => {
    let { s, ap, ids } = setup([sigilBlessing]);
    const a = putOnBattlefield(s, ap, greenBear());
    const b = putOnBattlefield(s, ap, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(a)])));
    expect(pt(s, a)).toBe("5/5");
    expect(pt(s, b)).toBe("3/3");
    s = passUntil(s, "upkeep", next(s, ap));
    expect(pt(s, a)).toBe("2/2");
  });

  it("Join Forces untaps two creatures and gives each +2/+2", () => {
    let { s, ap, ids } = setup([joinForces]);
    const a = putOnBattlefield(s, ap, greenBear());
    const b = putOnBattlefield(s, ap, greenBear());
    s.objects[a]!.tapped = true;
    s.objects[b]!.tapped = true;
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(a), tgt(b)])));
    for (const x of [a, b]) {
      expect(s.objects[x]!.tapped).toBe(false);
      expect(pt(s, x)).toBe("4/4");
    }
  });

  it("Riding the Dilu Horse lasts past the turn (CR 611.2a)", () => {
    let { s, ap, ids } = setup([ridingTheDiluHorse]);
    const a = putOnBattlefield(s, ap, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(a)])));
    s = passUntil(s, "upkeep", next(s, ap));
    expect(pt(s, a)).toBe("4/4");
    expect(has(s, a, "Horsemanship")).toBe(true);
  });

  it("Agility's flanking shrinks a blocker without flanking, not one with it", () => {
    for (const flanker of [false, true]) {
      let { s, ap, opp } = setup([]);
      const a = putOnBattlefield(s, ap, greenBear());
      attach(s, ap, agility, a);
      const blocker = putOnBattlefield(s, opp, creature("Test Squire", "Creature — Human", "{1}{W}", 1, 3, flanker ? { keywords: ["Flanking"], oracleText: "Flanking" } : {}));
      s = toBlocks(s, ap, [{ attacker: a, defender: opp }]);
      s = block(s, opp, [{ blocker, attacker: a }]);
      s = settle(s);
      expect(pt(s, a)).toBe("3/3");
      expect(pt(s, blocker)).toBe(flanker ? "1/3" : "0/2");
    }
  });

  it("Vectis Gloves: unblockable while the defending player controls an artifact land", () => {
    let { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, ap, greenBear());
    attach(s, ap, vectisGloves, a);
    const b = putOnBattlefield(s, opp, greenBear());
    s = toBlocks(s, ap, [{ attacker: a, defender: opp }]);
    expect(pt(s, a)).toBe("4/2");
    expect(blockProblem(s, s.objects[b]!, s.objects[a]!)).toBeNull();
    putOnBattlefield(s, opp, card("Test Vault", "Artifact Land", "", { oracleText: "{T}: Add {C}." }));
    invalidateCharacteristics(s);
    expect(blockProblem(s, s.objects[b]!, s.objects[a]!)).toMatch(/artifact landwalk/i);
  });
});

describe("Counterspells: may draw, and damage; spells that target a player", () => {
  it("are fully supported", () => supported(vex, suffocatingBlast, outwit));

  it("Vex counters the spell; its controller may draw a card", () => {
    for (const yes of [true, false]) {
      let { s, ap, opp, ids } = setup([electrostaticBolt]);
      const v = into(s, opp, vex);
      for (const l of [island, island, island]) putOnBattlefield(s, opp, l);
      const b = putOnBattlefield(s, opp, greenBear());
      s = run(s, planCast(s, ap, ids[0]!, [tgt(b)]));
      s = act(s, { type: "passPriority", player: ap });
      s = run(s, planCast(s, opp, v, [topSpell(s)]));
      const hand = s.players[ap]!.hand.length;
      s = settle(s, { yes });
      expect(zone(s, ids[0]!)).toBe("graveyard");
      expect(s.objects[b]!.damage).toBe(0);
      expect(s.players[ap]!.hand.length).toBe(hand + (yes ? 1 : 0));
    }
  });

  it("Suffocating Blast counters the spell and deals 3 damage to a creature", () => {
    let { s, ap, opp, ids } = setup([electrostaticBolt]);
    const sb = into(s, opp, suffocatingBlast);
    for (const l of [island, island, mountain, mountain]) putOnBattlefield(s, opp, l);
    const b = putOnBattlefield(s, opp, greenBear());
    const mine = putOnBattlefield(s, ap, creature("Test Ogre", "Creature — Ogre", "{2}{R}", 3, 3));
    s = run(s, planCast(s, ap, ids[0]!, [tgt(b)]));
    s = act(s, { type: "passPriority", player: ap });
    s = run(s, planCast(s, opp, sb, [topSpell(s), tgt(mine)]));
    s = settle(s);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(zone(s, mine)).toBe("graveyard");
    expect(zone(s, b)).toBe("battlefield");
  });

  it("Outwit can target a spell that targets a player, not one that targets only a creature", () => {
    let { s, ap, opp, ids } = setup([electrostaticBolt, card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." })]);
    const o = into(s, opp, outwit);
    putOnBattlefield(s, opp, island);
    const b = putOnBattlefield(s, opp, greenBear());
    s = run(s, planCast(s, ap, ids[0]!, [tgt(b)]));
    s = act(s, { type: "passPriority", player: ap });
    expect(planCast(s, opp, o, [topSpell(s)])).toBeNull();
    s = settle(s);
    s = run(s, planCast(s, ap, ids[1]!, [player(opp)]));
    s = act(s, { type: "passPriority", player: ap });
    const life0 = life(s, opp);
    s = settle(run(s, planCast(s, opp, o, [topSpell(s)])));
    expect(life(s, opp)).toBe(life0);
    expect(zone(s, ids[1]!)).toBe("graveyard");
  });
});

describe("Attached permanents: Equipment destroyed with the creature, Auras returned with it", () => {
  it("are fully supported", () => supported(turnToSlag, blastfireBolt, hubris));

  it("Turn to Slag deals 5 damage and destroys the Equipment attached to that creature, not other Equipment", () => {
    let { s, ap, opp, ids } = setup([turnToSlag]);
    const b = putOnBattlefield(s, opp, creature("Test Giant", "Creature — Giant", "{4}{R}", 6, 6));
    const eq = attach(s, opp, card("Test Blade", "Artifact — Equipment", "{1}", { oracleText: "Equip {1}", keywords: ["Equip"] }), b);
    const other = putOnBattlefield(s, opp, card("Test Shield", "Artifact — Equipment", "{1}", { oracleText: "Equip {1}", keywords: ["Equip"] }));
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    expect(s.objects[b]!.damage).toBe(5);
    expect(zone(s, eq)).toBe("graveyard");
    expect(zone(s, other)).toBe("battlefield");
  });

  it("Hubris returns the creature and every Aura on it, whoever controls the Aura", () => {
    let { s, ap, opp, ids } = setup([hubris]);
    const b = putOnBattlefield(s, opp, greenBear());
    const aura1 = attach(s, opp, card("Test Might", "Enchantment — Aura", "{G}", { oracleText: "Enchant creature\nEnchanted creature gets +1/+1.", keywords: ["Enchant"] }), b);
    const aura2 = attach(s, ap, card("Test Weakness", "Enchantment — Aura", "{B}", { oracleText: "Enchant creature\nEnchanted creature gets -1/-1.", keywords: ["Enchant"] }), b);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    expect(zone(s, b)).toBe("hand");
    expect(zone(s, aura1)).toBe("hand");
    expect(zone(s, aura2)).toBe("hand");
    expect(s.players[ap]!.hand).toContain(aura2);
  });
});
