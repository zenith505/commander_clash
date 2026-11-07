// Lane B round B137: Hallowed Moonlight (creatures that weren't cast, tokens too, exiled instead, CR 614.1a), Voltage
// Surge (an optional sacrifice as an additional cost, CR 601.2b), Soulblast (sacrifice all creatures you control as a
// cost, their total power as they last existed, CR 608.2h), Interdict (an activated ability from an artifact, creature,
// enchantment or land countered, and its source's abilities stopped), Wood Sage, Flash Foliage (a token put onto the
// battlefield blocking), Cellar Door (the bottom card into the graveyard, not a mill, CR 701.17a), Mana Vortex (a cast
// trigger and a state trigger, CR 603.8), Tyrannical Pitlord (another creature chosen as it enters, CR 614.12) and
// Negative Zone Portal (cards exiled with it, CR 607.2a).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, castProblem, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const moonlight = card("Hallowed Moonlight", "Instant", "{1}{W}", { oracleText: "Until end of turn, if a creature would enter and it wasn't cast, exile it instead.\nDraw a card." });
const surge = card("Voltage Surge", "Instant", "{R}", { oracleText: "As an additional cost to cast this spell, you may sacrifice an artifact.\nVoltage Surge deals 2 damage to target creature or planeswalker. If this spell's additional cost was paid, Voltage Surge deals 4 damage instead." });
const soulblast = card("Soulblast", "Instant", "{3}{R}{R}{R}", { oracleText: "As an additional cost to cast this spell, sacrifice all creatures you control.\nSoulblast deals damage to any target equal to the total power of the sacrificed creatures." });
const interdict = card("Interdict", "Instant", "{1}{U}", { oracleText: "Counter target activated ability from an artifact, creature, enchantment, or land. That permanent's activated abilities can't be activated this turn. (Mana abilities can't be targeted.)\nDraw a card." });
const woodSage = card("Wood Sage", "Creature — Human Druid", "{G}{U}", { power: "1", toughness: "1", oracleText: "{T}: Choose a creature card name. Reveal the top four cards of your library and put all of them with that name into your hand. Put the rest into your graveyard." });
const foliage = card("Flash Foliage", "Instant", "{2}{G}", { oracleText: "Cast this spell only during combat after blockers are declared.\nCreate a 1/1 green Saproling creature token that's blocking target creature attacking you.\nDraw a card." });
const cellarDoor = card("Cellar Door", "Artifact", "{2}", { oracleText: "{3}, {T}: Target player puts the bottom card of their library into their graveyard. If it's a creature card, you create a 2/2 black Zombie creature token." });
const vortex = card("Mana Vortex", "Enchantment", "{1}{U}{U}", { oracleText: "When you cast this spell, counter it unless you sacrifice a land.\nAt the beginning of each player's upkeep, that player sacrifices a land of their choice.\nWhen there are no lands on the battlefield, sacrifice this enchantment." });
const pitlord = card("Tyrannical Pitlord", "Creature — Demon", "{4}{B}{B}", { power: "6", toughness: "6", keywords: ["Flying", "Trample"], oracleText: "Flying, trample\nAs this creature enters, choose another creature you control.\nThe chosen creature gets +3/+3 and has flying.\nWhen this creature leaves the battlefield, sacrifice the chosen creature." });
const portal = card("Negative Zone Portal", "Artifact", "{2}", { oracleText: "{2}, {T}: Exile target card from an opponent's graveyard. If it's a creature card, draw a card.\nAt the beginning of your upkeep, if there are four or more creature cards exiled with this artifact, flip a coin. If you lose the flip, sacrifice this artifact and return a card exiled with it at random to its owner's hand." });

// Helpers' cards.
const alarm = card("Raise the Alarm", "Instant", "{1}{W}", { oracleText: "Create two 1/1 white Soldier creature tokens." });
const treasureMaker = card("Test Treasure Spell", "Sorcery", "{1}", { oracleText: "Create a Treasure token." });
const zombify = card("Zombify", "Sorcery", "{3}{B}", { oracleText: "Return target creature card from your graveyard to the battlefield." });
const relic = card("Test Relic", "Artifact", "{1}");
const pinger = card("Test Pinger", "Artifact", "{1}", { oracleText: "{1}: This artifact deals 1 damage to any target.\n{T}: Add {C}." });
const walker = card("Test Walker", "Legendary Planeswalker — Testwalker", "{3}", { loyalty: "3", oracleText: "+1: You gain 1 life." });
const unsummon = card("Unsummon", "Instant", "{U}", { oracleText: "Return target creature to its owner's hand." });
const murder = card("Test Destroy", "Instant", "{1}", { oracleText: "Destroy target creature." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions of the players in `me` stop it, others the bots answer. */
const settle = (s: GameState, opts: { me?: PlayerId[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const castIt = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], opts: { me?: PlayerId[] } = {}) => settle(run(s, planCast(s, pid, id, targets)), opts);
/** A copy of `def` put into `pid`'s `zone` (the top of the library). */
const toZone = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const named = (s: GameState, name: string) => s.battlefield.filter((id) => characteristics(s, s.objects[id]!).name === name);
const zone = (s: GameState, id: string) => s.objects[id]?.zone;

describe("B137 cards compile", () => {
  it("all of them", () => supported(moonlight, surge, soulblast, interdict, woodSage, foliage, cellarDoor, vortex, pitlord, portal));
});

describe("Hallowed Moonlight: creatures that weren't cast are exiled instead of entering (CR 614.1a)", () => {
  it("tokens are exiled and cease to exist, a card put onto the battlefield is exiled, a cast creature enters", () => {
    const { s: s0, ap, ids } = setup([moonlight, alarm, zombify, treasureMaker, bear({ name: "Cast Bear" })]);
    const dead = toZone(s0, ap, bear({ name: "Dead Bear" }), "graveyard");
    let s = castIt(s0, ap, ids[0]!);
    const tokensBefore = Object.values(s.objects).filter((o) => o.isToken).length;
    s = castIt(s, ap, ids[1]!);
    expect(named(s, "Soldier Token")).toEqual([]);
    expect(Object.values(s.objects).filter((o) => o.isToken).length).toBe(tokensBefore);
    expect(s.log.some((l) => /Soldier.*exiled instead of entering/.test(l.text))).toBe(true);
    s = castIt(s, ap, ids[2]!, [tgt(dead)]);
    expect(zone(s, dead)).toBe("exile");
    // A noncreature token isn't affected.
    s = castIt(s, ap, ids[3]!);
    expect(named(s, "Treasure Token").length).toBe(1);
    // A creature spell that was cast enters (rulings).
    s = castIt(s, ap, ids[4]!);
    expect(zone(s, ids[4]!)).toBe("battlefield");
  });

  it("only this turn", () => {
    const { s: s0, ap, ids } = setup([moonlight, alarm]);
    let s = castIt(s0, ap, ids[0]!);
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    // The next turn: the others pass until it's our priority.
    for (let i = 0; i < 3 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(waitingOn(s)).toBe(ap);
    s.players[ap]!.manaPool.W = 2;
    s.players[ap]!.manaPool.C = 2;
    s = settle(act(s, { type: "castSpell", player: ap, objectId: ids[1]! }));
    expect(named(s, "Soldier Token").length).toBe(2);
  });
});

describe("Voltage Surge: an optional sacrifice as it's cast (CR 601.2b)", () => {
  it("2 damage without, 4 with the artifact sacrificed", () => {
    const { s: s0, ap, ids, opp } = setup([surge]);
    const ogre = putOnBattlefield(s0, opp, bear({ name: "Tough Ogre", toughness: "3" }));
    const s = castIt(s0, ap, ids[0]!, [tgt(ogre)]);
    expect(zone(s, ogre)).toBe("battlefield");
    expect(s.objects[ogre]!.damage).toBe(2);

    const g = setup([surge]);
    const ogre2 = putOnBattlefield(g.s, g.opp, bear({ name: "Tough Ogre", toughness: "4" }));
    const r = putOnBattlefield(g.s, g.ap, relic);
    const s2 = settle(run(g.s, planCast(g.s, g.ap, g.ids[0]!, [tgt(ogre2)], undefined, "auto", undefined, { kicks: [0], sacrifice: [r] })));
    expect(zone(s2, r)).toBe("graveyard");
    expect(zone(s2, ogre2)).toBe("graveyard");
  });

  it("only an artifact can be sacrificed for it", () => {
    const { s, ap, ids, opp } = setup([surge]);
    const ogre = putOnBattlefield(s, opp, bear());
    const mine = putOnBattlefield(s, ap, bear({ name: "My Bear" }));
    expect(planCast(s, ap, ids[0]!, [tgt(ogre)], undefined, "auto", undefined, { kicks: [0], sacrifice: [mine] })).toBeNull();
  });
});

describe("Soulblast: sacrifice all creatures you control as a cost", () => {
  it("deals the total power of the sacrificed creatures, as they last existed (CR 608.2h)", () => {
    const { s: s0, ap, ids, opp } = setup([soulblast]);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear({ name: "Big Bear", power: "5", toughness: "5" }));
    s0.objects[a]!.counters["+1/+1"] = 2;
    const r = putOnBattlefield(s0, ap, relic);
    invalidateCharacteristics(s0);
    const s = castIt(s0, ap, ids[0]!, [player(opp)]);
    expect(zone(s, a)).toBe("graveyard");
    expect(zone(s, b)).toBe("graveyard");
    expect(zone(s, r)).toBe("battlefield");
    expect(s.players[opp]!.life).toBe(40 - 9);
  });

  it("with no creatures it can still be cast, for 0", () => {
    const { s: s0, ap, ids, opp } = setup([soulblast]);
    s0.battlefield.filter((id) => controllerOf(s0, s0.objects[id]!) === ap && characteristics(s0, s0.objects[id]!).types.includes("Creature")).forEach((id) => {
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      delete s0.objects[id];
    });
    invalidateCharacteristics(s0);
    const s = castIt(s0, ap, ids[0]!, [player(opp)]);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(40);
  });
});

describe("Interdict", () => {
  it("counters an artifact's ability; its activated abilities, mana abilities too, can't be activated this turn", () => {
    const { s: s0, ap, ids, opp } = setup([interdict]);
    const pg = putOnBattlefield(s0, ap, pinger);
    let s = run(s0, planActivate(s0, ap, pg, 0, [player(opp)]));
    const hand = s.players[ap]!.hand.length;
    s = castIt(s, ap, ids[0]!, [{ kind: "stack", id: s.stack.at(-1)!.id }]);
    expect(s.players[opp]!.life).toBe(40);
    expect(s.players[ap]!.hand.length).toBe(hand); // Interdict left, a card drawn
    expect(characteristics(s, s.objects[pg]!).cantActivate).toBe("all");
    expect(planActivate(s, ap, pg, 0, [player(opp)])).toBeNull();
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(characteristics(s, s.objects[pg]!).cantActivate).toBe(false);
  });

  it("not a planeswalker's ability", () => {
    const { s: s0, ap, ids } = setup([interdict]);
    const w = putOnBattlefield(s0, ap, walker);
    s0.objects[w]!.counters.loyalty = 3;
    const s = run(s0, planActivate(s0, ap, w, 0));
    expect(castProblem(s, ap, ids[0]!, [{ kind: "stack", id: s.stack.at(-1)!.id }])).not.toBeNull();
  });
});

describe("Wood Sage", () => {
  it("every card with the chosen creature card name among the top four into the hand, the rest into the graveyard", () => {
    const { s: s0, ap } = setup([]);
    const sage = putOnBattlefield(s0, ap, woodSage);
    const lib = [bear({ name: "Runeclaw Bear" }), card("Test Forest", "Land"), bear({ name: "Runeclaw Bear" }), bear({ name: "Other Bear" }), bear({ name: "Runeclaw Bear" })].reverse().map((d) => toZone(s0, ap, d, "library")).reverse();
    let s = settle(run(s0, planActivate(s0, ap, sage, 0)), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "cardName" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Runeclaw Bear" }), { me: [ap] });
    expect(lib.map((id) => zone(s, id))).toEqual(["hand", "graveyard", "hand", "graveyard", "library"]);
  });
});

describe("Flash Foliage: a Saproling blocking target creature attacking you", () => {
  it("blocks the attacker, which deals its damage to it", () => {
    const { s: s0, ap, opp } = setup([]);
    const att = putOnBattlefield(s0, ap, bear({ name: "Attacking Bear", power: "3", toughness: "3" }));
    const ff = toZone(s0, opp, foliage, "hand");
    for (const l of ["Forest", "Swamp", "Island"]) putOnBattlefield(s0, opp, card(`Opp ${l}`, `Basic Land — ${l}`));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: att, defender: opp }] });
    // Before blockers it can't be cast.
    for (let i = 0; i < 20 && !(s.pending?.kind === "declareBlockers"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(castProblem(s, opp, ff, [tgt(att)])).not.toBeNull();
    s = act(s, { type: "declareBlockers", player: s.pending!.player, blocks: [] });
    for (let i = 0; i < 20 && s.pending?.kind === "declareBlockers"; i++) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    for (let i = 0; i < 10 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.step).toBe("declareBlockers");
    const hand = s.players[opp]!.hand.length;
    s = run(s, planCast(s, opp, ff, [tgt(att)]));
    for (let i = 0; i < 10 && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const sap = named(s, "Saproling Token")[0]!;
    expect(sap).toBeDefined();
    expect(controllerOf(s, s.objects[sap]!)).toBe(opp);
    expect(s.objects[sap]!.blocking).toEqual([att]);
    expect(s.objects[att]!.blockedBy).toContain(sap);
    expect(s.players[opp]!.hand.length).toBe(hand); // Flash Foliage left, a card drawn
    const life = s.players[opp]!.life;
    s = passUntil(s, "endCombat", ap);
    expect(s.players[opp]!.life).toBe(life);
    expect(zone(s, sap)).toBeUndefined(); // died, and the token ceased to exist
  });
});

describe("Cellar Door: the bottom card into the graveyard (not a mill, CR 701.17a)", () => {
  it("a creature card makes a Zombie; another card doesn't", () => {
    const { s: s0, ap, opp } = setup([]);
    const door = putOnBattlefield(s0, ap, cellarDoor);
    const lib = s0.players[opp]!.library;
    const bottom = lib[lib.length - 1]!;
    s0.objects[bottom]!.cardId = bear({ name: "Bottom Bear" }).oracleId;
    s0.cards[s0.objects[bottom]!.cardId] = bear({ name: "Bottom Bear" });
    s0.cards[s0.objects[bottom]!.cardId]!.oracleId = s0.objects[bottom]!.cardId;
    const top = lib[0]!;
    let s = settle(run(s0, planActivate(s0, ap, door, 0, [player(opp)])));
    expect(zone(s, bottom)).toBe("graveyard");
    expect(zone(s, top)).toBe("library");
    expect(named(s, "Zombie Token").length).toBe(1);
    expect(controllerOf(s, s.objects[named(s, "Zombie Token")[0]!]!)).toBe(ap);
    expect(s.log.some((l) => /mills/.test(l.text))).toBe(false);

    const g = setup([]);
    const door2 = putOnBattlefield(g.s, g.ap, cellarDoor);
    const l2 = g.s.players[g.opp]!.library;
    const b2 = putOnBattlefield(g.s, g.opp, card("Bottom Land", "Land"));
    g.s.battlefield.splice(g.s.battlefield.indexOf(b2), 1);
    g.s.objects[b2]!.zone = "library";
    l2.push(b2);
    invalidateCharacteristics(g.s);
    s = settle(run(g.s, planActivate(g.s, g.ap, door2, 0, [player(g.opp)])));
    expect(zone(s, b2)).toBe("graveyard");
    expect(named(s, "Zombie Token").length).toBe(0);
  });
});

describe("Mana Vortex", () => {
  it("cast trigger: sacrifice a land or it's countered", () => {
    const { s: s0, ap, ids } = setup([vortex]);
    const lands = () => s0.battlefield.filter((id) => controllerOf(s0, s0.objects[id]!) === ap && characteristics(s0, s0.objects[id]!).types.includes("Land")).length;
    const before = lands();
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: [ap] });
    if (s.pending?.kind === "pickPermanents") {
      const p = s.pending;
      s = settle(act(s, { type: "pickPermanents", player: ap, ids: [p.options.find((id) => s.objects[id]!.tapped) ?? p.options[0]!] }), { me: [ap] });
    }
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === ap && characteristics(s, s.objects[id]!).types.includes("Land")).length).toBe(before - 1);

    const g = setup([vortex]);
    let t = run(g.s, planCast(g.s, g.ap, g.ids[0]!));
    t = settle(t, { me: [g.ap] });
    t = settle(act(t, { type: "chooseMay", player: g.ap, yes: false }));
    expect(zone(t, g.ids[0]!)).toBe("graveyard");
  });

  it("sacrificed when there are no lands on the battlefield (a state trigger, CR 603.8)", () => {
    const { s: s0, ap } = setup([]);
    const v = putOnBattlefield(s0, ap, vortex);
    for (const id of s0.battlefield.filter((x) => characteristics(s0, s0.objects[x]!).types.includes("Land"))) {
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      delete s0.objects[id];
    }
    invalidateCharacteristics(s0);
    const s = settle(act(s0, { type: "passPriority", player: ap }));
    expect(zone(s, v)).toBe("graveyard");
  });
});

describe("Tyrannical Pitlord: another creature chosen as it enters (CR 614.12)", () => {
  it("the chosen creature gets +3/+3 and flying, even under another player's control, and is sacrificed when it leaves", () => {
    const { s: s0, ap, ids, opp } = setup([pitlord, unsummon]);
    const a = putOnBattlefield(s0, ap, bear({ name: "Bear A" }));
    const b = putOnBattlefield(s0, ap, bear({ name: "Bear B" }));
    let s = castIt(s0, ap, ids[0]!, [], { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "chooseCreature" });
    expect(s.pending?.kind === "chooseOption" && s.pending.options).toEqual(expect.arrayContaining([a, b]));
    expect(s.pending?.kind === "chooseOption" && s.pending.options).not.toContain(ids[0]!);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: b }));
    expect(pt(s, b)).toBe("5/5");
    expect(characteristics(s, s.objects[b]!).keywords).toContain("Flying");
    expect(pt(s, a)).toBe("2/2");
    // Bounced: the leaves trigger sacrifices the chosen creature.
    s = castIt(s, ap, ids[1]!, [tgt(ids[0]!)]);
    expect(zone(s, ids[0]!)).toBe("hand");
    expect(zone(s, b)).toBe("graveyard");
    expect(zone(s, a)).toBe("battlefield");
    void opp;
  });

  it("a lone other creature is chosen with no question; with none, nothing is chosen", () => {
    const { s: s0, ap, ids } = setup([pitlord, murder]);
    const a = putOnBattlefield(s0, ap, bear({ name: "Bear A" }));
    let s = castIt(s0, ap, ids[0]!, [], { me: [ap] });
    expect(s.pending).toBeFalsy();
    expect(pt(s, a)).toBe("5/5");
    s = castIt(s, ap, ids[1]!, [tgt(ids[0]!)]);
    expect(zone(s, a)).toBe("graveyard");

    const g = setup([pitlord]);
    const t = castIt(g.s, g.ap, g.ids[0]!, [], { me: [g.ap] });
    expect(zone(t, g.ids[0]!)).toBe("battlefield");
    expect(t.objects[g.ids[0]!]!.chosen?.creature).toBeUndefined();
  });

  it("not sacrificed if another player controls it as the trigger resolves (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([pitlord, murder]);
    const a = putOnBattlefield(s0, ap, bear({ name: "Bear A" }));
    let s = castIt(s0, ap, ids[0]!, [], { me: [ap] });
    // Another player takes the chosen creature: it keeps the bonus.
    s.objects[a]!.controller = opp;
    invalidateCharacteristics(s);
    expect(controllerOf(s, s.objects[a]!)).toBe(opp);
    expect(pt(s, a)).toBe("5/5");
    s = castIt(s, ap, ids[1]!, [tgt(ids[0]!)]);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(zone(s, a)).toBe("battlefield");
  });

  it("bots choose their strongest creature", () => {
    const { s: s0, ap, ids } = setup([pitlord]);
    putOnBattlefield(s0, ap, bear({ name: "Bear A" }));
    const big = putOnBattlefield(s0, ap, bear({ name: "Big Bear", power: "4", toughness: "4" }));
    let s = castIt(s0, ap, ids[0]!, [], { me: [ap] });
    s = run(s, botActions(s, ap));
    expect(s.objects[ids[0]!]!.chosen?.creature?.id).toBe(big);
  });
});

describe("Negative Zone Portal: cards exiled with it (CR 607.2a)", () => {
  it("exiles a card from an opponent's graveyard, drawing for a creature card", () => {
    const { s: s0, ap, opp } = setup([]);
    const p = putOnBattlefield(s0, ap, portal);
    const c = toZone(s0, opp, bear(), "graveyard");
    const l = toZone(s0, opp, card("Yard Land", "Land"), "graveyard");
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planActivate(s0, ap, p, 0, [tgt(c)])));
    expect(zone(s, c)).toBe("exile");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    s.objects[p]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, p, 0, [tgt(l)])));
    expect(zone(s, l)).toBe("exile");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    // Not a card from your own graveyard.
    const mine = toZone(s, ap, bear(), "graveyard");
    s.objects[p]!.tapped = false;
    expect(planActivate(s, ap, p, 0, [tgt(mine)])).toBeNull();
  });

  it("with four creature cards exiled with it, a lost flip sacrifices it and returns one of them at random to its owner's hand", () => {
    for (let seed = 1; seed < 40; seed++) {
      const { s: s0, ap, opp } = setup([], seed);
      const p = putOnBattlefield(s0, ap, portal);
      const cards = [0, 1, 2, 3].map(() => toZone(s0, opp, bear(), "graveyard"));
      let s = s0;
      for (const c of cards) {
        s.objects[p]!.tapped = false;
        s.players[ap]!.manaPool.C = 2;
        s = settle(run(s, planActivate(s, ap, p, 0, [tgt(c)])));
      }
      s.players[ap]!.hand = [];
      s = passUntil(s, "upkeep", ap, 4000);
      s = settle(s);
      if (zone(s, p) === "battlefield") {
        expect(s.log.some((l) => /flips? a coin/i.test(l.text))).toBe(true);
        continue;
      }
      expect(zone(s, p)).toBe("graveyard");
      expect(cards.filter((c) => zone(s, c) === "hand").length).toBe(1);
      expect(cards.filter((c) => zone(s, c) === "exile").length).toBe(3);
      expect(s.players[opp]!.hand).toEqual(expect.arrayContaining(cards.filter((c) => zone(s, c) === "hand")));
      return;
    }
    throw new Error("never lost the flip");
  });

  it("with three, no flip", () => {
    const { s: s0, ap, opp } = setup([]);
    const p = putOnBattlefield(s0, ap, portal);
    const cards = [0, 1, 2].map(() => toZone(s0, opp, bear(), "graveyard"));
    const land = toZone(s0, opp, card("Yard Land", "Land"), "graveyard");
    let s = s0;
    for (const c of [...cards, land]) {
      s.objects[p]!.tapped = false;
      s.players[ap]!.manaPool.C = 2;
      s = settle(run(s, planActivate(s, ap, p, 0, [tgt(c)])));
    }
    const flips = s.log.filter((l) => /flips? a coin/i.test(l.text)).length;
    s = passUntil(s, "upkeep", ap, 4000);
    s = settle(s);
    expect(s.log.filter((l) => /flips? a coin/i.test(l.text)).length).toBe(flips);
    expect(zone(s, p)).toBe("battlefield");
  });
});
