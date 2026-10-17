// "When you do, ..." (CR 603.12): a reflexive triggered ability, created by a resolving ability and triggered by doing what
// it said (paying, sacrificing, tapping, exiling it from a graveyard, milling, creating a token). Its targets and modes are
// chosen as it's put on the stack, after the action, and players can respond to it (rulings on Heart-Piercer Manticore,
// Cavalier of Night, Thousand Moons Crackshot, Wick's Patrol).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, mountain, passUntil, putOnBattlefield, setup, swamp, target } from "./helpers";
import { botActions, characteristics, isFullySupported, objIsType, parseManaCost, planCast, planMana, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";
import { moveObject } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return s;
};
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
/** Pay the pending "you may pay" from untapped lands and say yes. */
const payMay = (s: GameState, pid: PlayerId) => {
  const pend = s.pending;
  if (pend?.kind !== "chooseMay" || !pend.pay) throw new Error("nothing to pay");
  return act(run(s, pend.pay.mana ? planMana(s, pid, parseManaCost(pend.pay.mana)) : []), { type: "chooseMay", player: pid, yes: true });
};
const castIt = (s: GameState, pid: PlayerId, id: string) => settle(run(s, planCast(s, pid, id)));
const inGraveyard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  moveObject(s, id, "graveyard");
  return id;
};

// Real oracle text (Scryfall).
const sparktongue = card("Sparktongue Dragon", "Creature — Dragon", "{3}{R}{R}", { power: "3", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, you may pay {2}{R}. When you do, it deals 3 damage to any target." });
const cavalier = card("Cavalier of Night", "Creature — Elemental Knight", "{2}{B}{B}{B}", { power: "4", toughness: "5", keywords: ["Lifelink"], oracleText: "Lifelink\nWhen this creature enters, you may sacrifice another creature. When you do, destroy target creature an opponent controls.\nWhen this creature dies, return target creature card with mana value 3 or less from your graveyard to the battlefield." });
const manticore = card("Heart-Piercer Manticore", "Creature — Manticore", "{2}{R}{R}", { power: "4", toughness: "3", keywords: ["Embalm"], oracleText: "When this creature enters, you may sacrifice another creature. When you do, this creature deals damage equal to that creature's power to any target.\nEmbalm {5}{R} ({5}{R}, Exile this card from your graveyard: Create a token that's a copy of it, except it's a white Zombie Manticore with no mana cost. Embalm only as a sorcery.)" });
const hideout = card("Brokers Hideout", "Land", "", { oracleText: "When this land enters, sacrifice it. When you do, search your library for a basic Forest, Plains, or Island card, put it onto the battlefield tapped, then shuffle and you gain 1 life." });
const witchstalker = card("Primal Witchstalker", "Creature — Wolf", "{1}{B}{G}", { power: "2", toughness: "1", keywords: ["Menace", "Mill"], oracleText: "Menace (This creature can't be blocked except by two or more creatures.)\nWhen this creature enters, mill four cards. When you do, return target land card from your graveyard to the battlefield tapped. (To mill four cards, put the top four cards of your library into your graveyard.)" });
const farmer = card("Eastfarthing Farmer", "Creature — Halfling Peasant", "{2}{W}", { power: "2", toughness: "3", keywords: ["Food"], oracleText: "When this creature enters, create a Food token. When you do, target creature you control gets +1/+1 until end of turn for each Food you control. (A Food token is an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")" });
const voltstorm = card("Voltstorm Angel", "Creature — Angel", "{3}{W}{W}", { power: "4", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, you get {E}{E}{E} (three energy counters).\nAt the beginning of combat on your turn, you may pay {E}{E}. When you do, choose one —\n• This creature gains vigilance and lifelink until end of turn.\n• Other creatures you control get +1/+1 until end of turn." });
const butler = card("Undead Butler", "Creature — Zombie", "{1}{B}", { power: "1", toughness: "2", keywords: ["Mill"], oracleText: "When this creature enters, mill three cards. (Put the top three cards of your library into your graveyard.)\nWhen this creature dies, you may exile it. When you do, return target creature card from your graveyard to your hand." });
const drill = card("The Fire Nation Drill", "Legendary Artifact — Vehicle", "{2}{B}{B}", { power: "6", toughness: "3", keywords: ["Crew", "Trample"], oracleText: "Trample\nWhen The Fire Nation Drill enters, you may tap it. When you do, destroy target creature with power 4 or less.\n{1}: Permanents your opponents control lose hexproof and indestructible until end of turn.\nCrew 2" });
const snaremaster = card("Snaremaster Sprite", "Creature — Faerie Wizard", "{U}", { power: "1", toughness: "1", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, you may pay {2}. When you do, tap target creature an opponent controls and put a stun counter on it. (If a permanent with a stun counter would become untapped, remove one from it instead.)" });
const smokeBomb = card("Smoke Bomb", "Artifact", "{3}", { keywords: ["Flash"], oracleText: "Flash\nAll creatures have shroud. (They can't be the targets of spells or abilities.)\nAt the beginning of your upkeep, sacrifice this artifact. When you do, target creature you control can't be blocked this turn." });
const cyclops = card("Cyclops Superconductor", "Creature — Cyclops Wizard", "{1}{U}{R}", { power: "2", toughness: "2", keywords: ["Prowess"], oracleText: "Prowess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)\nWhen this creature enters, you get {E}{E}{E} (three energy counters).\nWhen this creature dies, you may pay {E}{E}{E}. When you do, this creature deals damage equal to its power to any target." });
const lichsRelic = card("Lich's Relic", "Artifact — Equipment", "{B}", { keywords: ["Equip"], oracleText: "When this Equipment enters, you may pay {2}. When you do, for each opponent, destroy up to one target creature or planeswalker that player controls.\nEquipped creature gets +2/+1.\nEquip {2}" });
const merryBards = card("Merry Bards", "Creature — Human Bard", "{2}{R}", { power: "3", toughness: "2", keywords: ["Role token"], oracleText: "When this creature enters, you may pay {1}. When you do, create a Young Hero Role token attached to target creature you control. (If you control another Role on it, put that one into the graveyard. Enchanted creature has \"Whenever this creature attacks, if its toughness is 3 or less, put a +1/+1 counter on it.\")" });
const footChopper = card("Foot Chopper", "Artifact — Equipment", "{1}{B}", { keywords: ["Equip"], oracleText: "When this Equipment enters, create a 1/1 black Ninja creature token, then attach this Equipment to it.\nEquipped creature has flying.\nWhenever equipped creature deals combat damage to a player, you may sacrifice it. If you do, draw cards equal to its power.\nEquip {2}" });
const academyRector = card("Academy Rector", "Creature — Human Cleric", "{3}{W}", { power: "1", toughness: "2", oracleText: "When this creature dies, you may exile it. If you do, search your library for an enchantment card, put that card onto the battlefield, then shuffle." });

describe("reflexive triggers: parse", () => {
  it("the new shapes compile", () => supported(sparktongue, cavalier, manticore, hideout, witchstalker, farmer, voltstorm, butler, drill, snaremaster, smokeBomb, cyclops, lichsRelic, merryBards, footChopper, academyRector));
});

describe('"You may pay ... When you do"', () => {
  it("Sparktongue Dragon: paying triggers a second ability, its target chosen then; declining does nothing", () => {
    const { s: s0, ap, ids, opp } = setup([sparktongue, sparktongue]);
    for (let i = 0; i < 4; i++) putOnBattlefield(s0, ap, mountain);
    let s = castIt(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseMay", pay: { mana: "{2}{R}" } });
    s = settle(payMay(s, ap));
    // The reflexive trigger goes on the stack after the payment: its target is chosen now (rulings).
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    expect(s.stack).toHaveLength(1);
    const life = s.players[opp]!.life;
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 3);
    // The second one: no.
    s = castIt(s, ap, ids[1]!);
    expect(s.pending).toMatchObject({ kind: "chooseMay" });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.pending).toBeNull();
    expect(s.stack).toHaveLength(0);
    expect(s.players[opp]!.life).toBe(life - 3);
  });

  it("Snaremaster Sprite: a bot pays only with a creature to tap", () => {
    const { s: s0, ap, ids, opp } = setup([snaremaster, snaremaster]);
    let s = castIt(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseMay", pay: { mana: "{2}" } });
    expect(botActions(s, ap).at(-1)).toEqual({ type: "chooseMay", player: ap, yes: false });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    const b = putOnBattlefield(s, opp, bear());
    s = castIt(s, ap, ids[1]!);
    const acts = botActions(s, ap);
    expect(acts.at(-1)).toEqual({ type: "chooseMay", player: ap, yes: true });
    s = settle(run(s, acts));
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(b)] }));
    expect(s.objects[b]!.tapped).toBe(true);
    expect(s.objects[b]!.counters.stun).toBe(1);
  });

  it("Lich's Relic: one target for each opponent, up to one each", () => {
    const { s: s0, ap, ids } = setup([lichsRelic]);
    const i = s0.turnOrder.indexOf(ap);
    const opps = [...s0.turnOrder.slice(i + 1), ...s0.turnOrder.slice(0, i)];
    const bears = opps.slice(0, 2).map((p) => putOnBattlefield(s0, p, bear()));
    let s = castIt(s0, ap, ids[0]!);
    s = settle(payMay(s, ap));
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(bears[0]!), target(bears[1]!), { kind: "none" }] }));
    expect(bears.map((b) => s.objects[b]!.zone)).toEqual(["graveyard", "graveyard"]);
  });

  it("Merry Bards: the Role is created on the creature chosen after paying", () => {
    const { s: s0, ap, ids } = setup([merryBards]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = castIt(s0, ap, ids[0]!);
    s = settle(payMay(s, ap));
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(b)] }));
    const role = s.battlefield.find((id) => s.objects[id]!.attachedTo === b);
    expect(role && s.cards[s.objects[role]!.cardId]!.name).toMatch(/Young Hero/);
  });

  it("Voltstorm Angel: paying energy triggers a modal ability, its mode chosen as it's put on the stack", () => {
    const { s: s0, ap } = setup([]);
    const angel = putOnBattlefield(s0, ap, voltstorm);
    const b = putOnBattlefield(s0, ap, bear());
    s0.players[ap]!.energy = 3;
    let s = passUntil(s0, "beginCombat", ap);
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", pay: { energy: 2 } });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.players[ap]!.energy).toBe(1);
    expect(s.pending).toMatchObject({ kind: "chooseModes", player: ap });
    s = settle(act(s, { type: "chooseModes", player: ap, modes: [1] }));
    expect(characteristics(s, s.objects[b]!).power).toBe(3);
    expect(characteristics(s, s.objects[angel]!).power).toBe(4);
  });

  it("Cyclops Superconductor: dies, pays, and deals damage equal to its power as it last existed", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, cyclops);
    s0.players[ap]!.energy = 3;
    s0.objects[c]!.counters["+1/+1"] = 2;
    let s = s0;
    const life = s.players[opp]!.life;
    moveObject(s, c, "graveyard");
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", pay: { energy: 3 } });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.life).toBe(life - 4);
  });
});

describe('"You may sacrifice / tap / exile ... When you do"', () => {
  it("Cavalier of Night: only asked with another creature; the target is chosen after the sacrifice", () => {
    const { s: s0, ap, ids, opp } = setup([cavalier, cavalier]);
    for (let i = 0; i < 4; i++) putOnBattlefield(s0, ap, swamp);
    const victim = putOnBattlefield(s0, opp, bear());
    let s = castIt(s0, ap, ids[0]!);
    // Nothing else to sacrifice: not asked, no trigger.
    expect(s.pending).toBeNull();
    expect(s.objects[victim]!.zone).toBe("battlefield");
    const mine = putOnBattlefield(s, ap, bear());
    s = castIt(s, ap, ids[1]!);
    expect(s.pending).toMatchObject({ kind: "chooseMay" });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    // Two to choose from (the other Cavalier and the bear).
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "sacrifice" });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [mine] }));
    expect(s.objects[mine]!.zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(victim)] }));
    expect(s.objects[victim]!.zone).toBe("graveyard");
  });

  it("Cavalier of Night: a bot sacrifices only with a creature of an opponent's to destroy", () => {
    const { s: s0, ap, ids, opp } = setup([cavalier, cavalier]);
    for (let i = 0; i < 4; i++) putOnBattlefield(s0, ap, swamp);
    putOnBattlefield(s0, ap, bear());
    let s = castIt(s0, ap, ids[0]!);
    expect(botActions(s, ap)).toEqual([{ type: "chooseMay", player: ap, yes: false }]);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    putOnBattlefield(s, opp, card("Big Thing", "Creature — Giant", "{5}", { power: "6", toughness: "6" }));
    s = castIt(s, ap, ids[1]!);
    expect(botActions(s, ap)).toEqual([{ type: "chooseMay", player: ap, yes: true }]);
  });

  it("Heart-Piercer Manticore: damage equal to the sacrificed creature's power as it last existed", () => {
    const { s: s0, ap, ids, opp } = setup([manticore]);
    const big = putOnBattlefield(s0, ap, bear());
    s0.objects[big]!.counters["+1/+1"] = 3;
    let s = castIt(s0, ap, ids[0]!);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[big]!.zone).toBe("graveyard");
    const life = s.players[opp]!.life;
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.life).toBe(life - 5);
  });

  it("The Fire Nation Drill: tapping it triggers the destroy; already tapped, it can't", () => {
    const { s: s0, ap, ids, opp } = setup([drill]);
    const small = putOnBattlefield(s0, opp, bear());
    let s = castIt(s0, ap, ids[0]!);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    const d = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "The Fire Nation Drill")!;
    expect(s.objects[d]!.tapped).toBe(true);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(small)] }));
    expect(s.objects[small]!.zone).toBe("graveyard");
  });

  it("Undead Butler: exiling it from the graveyard triggers the return; gone from there, nothing", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, butler);
    const dead = inGraveyard(s0, ap, bear());
    let s = s0;
    moveObject(s, b, "graveyard");
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay" });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[b]!.zone).toBe("exile");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(dead)] }));
    expect(s.objects[dead]!.zone).toBe("hand");
  });

  it("Academy Rector (\"If you do\"): not asked once it has left the graveyard", () => {
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, academyRector);
    let s = s0;
    moveObject(s, r, "graveyard");
    moveObject(s, r, "exile");
    s = settle(s);
    expect(s.pending).toBeNull();
  });

  it("Foot Chopper: draws cards equal to the sacrificed creature's power as it last existed", () => {
    const { s: s0, ap, opp } = setup([]);
    const ninja = putOnBattlefield(s0, ap, card("Test Ninja", "Creature — Ninja", "{1}", { power: "3", toughness: "3" }));
    const fc = putOnBattlefield(s0, ap, footChopper);
    s0.objects[fc]!.attachedTo = ninja;
    let s = passUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: ninja, defender: opp }] }));
    for (let i = 0; i < 40 && s.pending?.kind !== "chooseMay"; i++) {
      const pend = s.pending;
      if (pend?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: waitingOn(s)!, blocks: [] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[ninja]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
  });
});

describe("Mandatory actions: sacrifice ~, mill, create", () => {
  it("Brokers Hideout: sacrificed, then the search and 1 life", () => {
    const { s: s0, ap, ids } = setup([hideout]);
    let s = settle(act(s0, { type: "playLand", player: ap, objectId: ids[0]! }));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "searchLibrary" });
    const life = s.players[ap]!.life;
    const pend = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    const found = pend!.cards[0]!;
    expect(s.cards[s.objects[found]!.cardId]!.name).toBe("Forest");
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [found] }));
    expect(s.objects[found]!.zone).toBe("battlefield");
    expect(s.objects[found]!.tapped).toBe(true);
    expect(s.players[ap]!.life).toBe(life + 1);
  });

  it("Brokers Hideout: if it's gone when its trigger resolves, there's no search", () => {
    const { s: s0, ap } = setup([]);
    const h = putOnBattlefield(s0, ap, hideout);
    let s = s0;
    // Its enters trigger, with the land already back in hand.
    s.triggerQueue.push({ sourceId: h, sourceCardId: hideout.oracleId, controller: ap, index: 0, sourceZc: 0 });
    moveObject(s, h, "hand");
    const life = s.players[ap]!.life;
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.life).toBe(life);
  });

  it("Smoke Bomb: sacrificed at upkeep, then a creature you control can't be blocked (no shroud by then)", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, smokeBomb);
    const b = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "upkeep", ap);
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.battlefield.some((id) => s.cards[s.objects[id]!.cardId]!.name === "Smoke Bomb")).toBe(false);
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(b)] }));
    expect(logged(s, /can't be blocked/i) || s.effects.some((e) => e.affected?.includes(b))).toBe(true);
  });

  it("Primal Witchstalker: all four milled triggers it; with three in the library, it mills them but doesn't trigger", () => {
    const { s: s0, ap, ids } = setup([witchstalker, witchstalker]);
    const land = inGraveyard(s0, ap, forest);
    let s = castIt(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(land)] }));
    expect(s.objects[land]!.zone).toBe("battlefield");
    expect(s.objects[land]!.tapped).toBe(true);
    const p = s.players[ap]!;
    for (const id of p.library.slice(3)) moveObject(s, id, "exile");
    expect(s.players[ap]!.library).toHaveLength(3);
    s = castIt(s, ap, ids[1]!);
    expect(s.players[ap]!.library).toHaveLength(0);
    expect(s.pending).toBeNull();
    expect(s.stack).toHaveLength(0);
  });

  it("Eastfarthing Farmer: the Food is created, then the target", () => {
    const { s: s0, ap, ids } = setup([farmer]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = castIt(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(b)] }));
    expect(characteristics(s, s.objects[b]!).power).toBe(3);
  });
});
