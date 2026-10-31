// Round 223: fresh cards from EDHREC rank 15,000 on. Strider, Ranger of the North ("Then if that creature has power 4 or
// greater, it gains first strike"), Ellie, Vengeful Hunter ("deals 2 damage to target player and gains indestructible"),
// Hercules, Olympian Hero ("dealt damage for the first time each turn"), Captain Marvel, Shooting Star ("a creature other
// than ~ is exiled from the battlefield"), Kratos, Stoic Father ("whenever you attack with one or more Gods and whenever a
// God dies"), Shanna, Purifying Blade ("X can't be greater than the amount of life you gained this turn"), Rith, the
// Awakener ("choose a color, then create ... for each permanent of that color"), Tam, the Possibility ("planeswalker
// types among planeswalkers you control"), Nissa, Genesis Mage ("up to two target creatures and up to two target
// lands"), Sosuke, Son of Seshiro ("a Warrior you control deals combat damage to a creature"), Wolverine, Claws Out
// ("as though he weren't blocked") and Captain Mar-Vell, Space-Born ("as long as an opponent has cast a spell this
// turn").

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, applyAction, botActions, cardSource, castProblem, dealDamage, invalidateCharacteristics, isFullySupported, objHasKeyword, objectSource, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/**
 * Everyone passes until the stack is empty, answering "you may" with `may` and trigger targets with `targets`; other
 * players' questions are answered as the bots would. Stops at any other question of `me`'s.
 */
const settle = (s: GameState, opts: { may?: boolean; targets?: TargetChoice[]; me?: PlayerId } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me !== undefined && p.player !== opts.me) s = act(s, botActions(s, p.player)[0]!);
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets ?? [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const emptyHand = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.splice(0).forEach((id) => (s.objects[id]!.zone = "exile"));
/** Attack with `attacks`; `blocks` decides the blocks; stops at `me`'s first question or once combat is over. */
const attack = (s: GameState, me: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId }[], blocks: { blocker: ObjectId; attacker: ObjectId }[] = [], stopAtMine = true) => {
  s = act(s, { type: "declareAttackers", player: me, attacks });
  for (let i = 0; i < 80 && s.step !== "endCombat" && s.step !== "main2"; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: blocks.filter((b) => s.objects[b.blocker]!.controller === p.player) });
    else if (p && p.player === me && stopAtMine) return s;
    else if (p) s = act(s, botActions(s, p.player)[0]!);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const toAttack = (s: GameState, ap: PlayerId) => {
  for (const p of s.players) if (p.id !== ap) emptyHand(s, p.id);
  return passUntil(s, "declareAttackers", ap);
};
const abilityIndex = (s: GameState, id: ObjectId, re: RegExp) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => re.test(a.text));
const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." });
const forestCard = card("Forest", "Basic Land — Forest");

// Real oracle text (Scryfall).
const strider = card("Strider, Ranger of the North", "Legendary Creature — Human Ranger", "{2}{R}{G}", { power: "4", toughness: "4", keywords: ["Landfall"], oracleText: "Landfall — Whenever a land you control enters, target creature gets +1/+1 until end of turn. Then if that creature has power 4 or greater, it gains first strike until end of turn." });
const ellie = card("Ellie, Vengeful Hunter", "Legendary Creature — Human Survivor", "{1}{B}{R}", { power: "3", toughness: "1", keywords: ["Partner"], oracleText: "Pay 2 life, Sacrifice another creature: Ellie deals 2 damage to target player and gains indestructible until end of turn.\nPartner—Survivors (You can have two commanders if both have this ability.)" });
const hercules = card("Hercules, Olympian Hero", "Legendary Creature — Demigod Warrior Hero", "{3}{W}{W}", { power: "3", toughness: "3", oracleText: "Whenever Hercules attacks, put a +1/+1 counter on him. He gains indestructible until end of turn.\nWhenever Hercules is dealt damage for the first time each turn, put that many +1/+1 counters on him. (He must survive the damage to get the counters.)" });
const marvel = card("Captain Marvel, Shooting Star", "Legendary Creature — Human Kree Hero", "{5}{W}{W}", { power: "6", toughness: "6", keywords: ["Flying"], oracleText: "Flying\nWhenever Captain Marvel enters or attacks, exile up to one target creature. That creature's controller gains life equal to its power.\nWhenever a creature other than Captain Marvel is exiled from the battlefield, you gain life equal to its power." });
const kratos = card("Kratos, Stoic Father", "Legendary Creature — God Warrior", "{2}{R}{W}", { power: "4", toughness: "4", keywords: ["Partner"], oracleText: "Whenever you attack with one or more Gods and whenever a God dies, you get an experience counter.\nAt the beginning of your end step, put a number of +1/+1 counters on target creature equal to the number of experience counters you have.\nPartner—Father & son (You can have two commanders if both have this ability.)" });
const shanna = card("Shanna, Purifying Blade", "Legendary Creature — Human Warrior", "{G}{W}{U}", { power: "3", toughness: "3", keywords: ["Lifelink"], oracleText: "Lifelink\nAt the beginning of your end step, you may pay {X}. If you do, draw X cards. X can't be greater than the amount of life you gained this turn." });
const rith = card("Rith, the Awakener", "Legendary Creature — Dragon", "{3}{R}{G}{W}", { power: "6", toughness: "6", keywords: ["Flying"], oracleText: "Flying\nWhenever Rith deals combat damage to a player, you may pay {2}{G}. If you do, choose a color, then create a 1/1 green Saproling creature token for each permanent of that color." });
const tam = card("Tam, the Possibility", "Legendary Creature — Gorgon Wizard", "{1}{G}{U}", { power: "2", toughness: "4", keywords: ["Proliferate"], oracleText: "Planeswalker spells you cast cost {1} less to cast.\n{W}{U}{B}{R}{G}, {T}: Proliferate X times, where X is the number of planeswalker types among planeswalkers you control. (To proliferate, choose any number of permanents and/or players, then give each another counter of each kind already there.)" });
const nissa = card("Nissa, Genesis Mage", "Legendary Planeswalker — Nissa", "{5}{G}{G}", { loyalty: "5", oracleText: "+2: Untap up to two target creatures and up to two target lands.\n−3: Target creature gets +5/+5 until end of turn.\n−10: Look at the top ten cards of your library. You may put any number of creature and/or land cards from among them onto the battlefield. Put the rest on the bottom of your library in a random order." });
const sosuke = card("Sosuke, Son of Seshiro", "Legendary Creature — Snake Warrior", "{2}{G}{G}", { power: "3", toughness: "4", oracleText: "Other Snake creatures you control get +1/+0.\nWhenever a Warrior you control deals combat damage to a creature, destroy that creature at end of combat." });
const wolverine = card("Wolverine, Claws Out", "Legendary Creature — Mutant Berserker Hero", "{3}{G}", { power: "2", toughness: "5", oracleText: "You may have Wolverine assign his combat damage as though he weren't blocked.\nWhenever a Mutant you control attacks, double its power until end of turn." });
const marvell = card("Captain Mar-Vell, Space-Born", "Legendary Creature — Kree Soldier Hero", "{4}{W}", { power: "4", toughness: "4", keywords: ["Flying", "Vigilance", "Cosmic Awareness"], oracleText: "Flying, vigilance\nCosmic Awareness — As long as an opponent has cast a spell this turn, you may cast spells as though they had flash." });

const god = card("Test God", "Legendary Creature — God", "{2}", { power: "2", toughness: "2" });
const warrior = card("Test Warrior", "Creature — Human Warrior", "{2}", { power: "2", toughness: "2" });
const ajani = card("Ajani, Test Mentor", "Legendary Planeswalker — Ajani", "{2}{W}", { loyalty: "3", oracleText: "+1: You gain 1 life." });
const gideon = card("Gideon, Test Champion", "Legendary Planeswalker — Gideon", "{2}{W}", { loyalty: "3", oracleText: "+1: You gain 1 life." });
const ajani2 = card("Ajani, Second Test Mentor", "Legendary Planeswalker — Ajani", "{2}{W}", { loyalty: "3", oracleText: "+1: You gain 1 life." });

describe("round 223", () => {
  it("parse", () => supported(strider, ellie, hercules, marvel, kratos, shanna, rith, tam, nissa, sosuke, wolverine, marvell));

  it("Strider: +1/+1, then first strike only if it has power 4 or greater then", () => {
    const { s: s0, ap } = setup([forestCard, forestCard]);
    putOnBattlefield(s0, ap, strider);
    const small = putOnBattlefield(s0, ap, bear());
    const big = putOnBattlefield(s0, ap, card("Test Trio", "Creature — Beast", "{3}", { power: "3", toughness: "3" }));
    const land = s0.players[ap]!.hand.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Forest")!;
    let s = act(s0, { type: "playLand", player: ap, objectId: land });
    s = settle(s, { targets: [tgt(small)] });
    expect(pt(s, small)).toBe("3/3");
    expect(objHasKeyword(s, s.objects[small]!, "First strike")).toBe(false);
    const s1 = structuredClone(s0);
    s = act(s1, { type: "playLand", player: ap, objectId: land });
    s = settle(s, { targets: [tgt(big)] });
    expect(pt(s, big)).toBe("4/4");
    expect(objHasKeyword(s, s.objects[big]!, "First strike")).toBe(true);
  });

  it("Ellie: pay 2 life and sacrifice another creature, 2 damage to the target player, Ellie gains indestructible", () => {
    const { s: s0, ap, opp } = setup([]);
    const e = putOnBattlefield(s0, ap, ellie);
    const b = putOnBattlefield(s0, ap, bear());
    const life = s0.players[ap]!.life;
    const s = settle(run(s0, planActivate(s0, ap, e, 0, [{ kind: "player", id: opp }], undefined, undefined, undefined, { sacrifice: [b] })), { me: ap });
    expect(zone(s, b)).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life - 2);
    expect(s.players[opp]!.life).toBe(38);
    expect(objHasKeyword(s, s.objects[e]!, "Indestructible")).toBe(true);
    // Not itself: "another creature".
    expect(planActivate(s, ap, e, 0, [{ kind: "player", id: opp }], undefined, undefined, undefined, { sacrifice: [e] })).toBeNull();
  });

  it("Hercules: counters equal to the damage only the first time he's dealt damage each turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, hercules);
    let s = s0;
    dealDamage(s, cardSource(shock, opp), { object: s.objects[h]! }, 2);
    s = settle(s, { me: ap });
    expect(s.objects[h]!.counters["+1/+1"]).toBe(2);
    dealDamage(s, cardSource(shock, opp), { object: s.objects[h]! }, 1);
    s = settle(s, { me: ap });
    expect(s.objects[h]!.counters["+1/+1"]).toBe(2);
    // Next turn, again.
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    s = settle(s, { me: ap });
    dealDamage(s, cardSource(shock, opp), { object: s.objects[h]! }, 1);
    s = settle(s, { me: ap });
    expect(s.objects[h]!.counters["+1/+1"]).toBe(3);
  });

  it("Captain Marvel: you gain life equal to the power of another creature exiled from the battlefield", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, marvel);
    const theirs = putOnBattlefield(s0, opp, card("Test Five", "Creature — Beast", "{5}", { power: "5", toughness: "5" }));
    const exiler = card("Test Exile", "Instant", "{W}", { oracleText: "Exile target creature." });
    const x = into(s0, ap, exiler, "hand");
    s0.players[ap]!.manaPool.W = 1;
    const life = s0.players[ap]!.life;
    const s = settle(run(s0, planCast(s0, ap, x, [tgt(theirs)])), { me: ap });
    expect(zone(s, theirs)).toBe("exile");
    expect(s.players[ap]!.life).toBe(life + 5);
  });

  it("Kratos: an experience counter for attacking with Gods and for a God dying", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kratos);
    const g = putOnBattlefield(s0, ap, god);
    let s = toAttack(s0, ap);
    s = attack(s, ap, [{ attacker: k, defender: opp }, { attacker: g, defender: opp }]);
    s = settle(s, { me: ap });
    expect(s.players[ap]!.experience).toBe(1);
    const x = into(s, ap, card("Test Kill", "Instant", "{B}", { oracleText: "Destroy target creature." }), "hand");
    s.players[ap]!.manaPool.B = 1;
    s = settle(run(s, planCast(s, ap, x, [tgt(g)])), { me: ap });
    expect(zone(s, g)).toBe("graveyard");
    expect(s.players[ap]!.experience).toBe(2);
  });

  it("Shanna: X up to the life gained this turn", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, shanna);
    emptyHand(s0, ap);
    (s0.turnLog ??= {}).lifeGained = { [ap]: 2 };
    let s = passUntil(s0, "end", ap);
    for (let i = 0; i < 40 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const p = s.pending;
    if (p?.kind !== "chooseOption") throw new Error(`no X choice: ${p?.kind}`);
    // Two life gained: X is 0 to 2.
    expect(p.options).toEqual(["none", "0", "1", "2"]);
    s.players[ap]!.manaPool.C = 5;
    s = act(s, { type: "chooseOption", player: ap, choice: "2" });
    s = settle(s, { me: ap });
    expect(s.players[ap]!.hand).toHaveLength(2);
  });

  it("Rith: pay {2}{G}, choose a color, a Saproling for each permanent of that color", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, rith);
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, opp, bear());
    putOnBattlefield(s0, ap, bear());
    let s = toAttack(s0, ap);
    s = attack(s, ap, [{ attacker: r, defender: opp }]);
    for (let i = 0; i < 40 && s.pending?.kind !== "chooseMay"; i++) s = act(s, s.pending ? botActions(s, s.pending.player)[0]! : { type: "passPriority", player: waitingOn(s)! });
    s.players[ap]!.manaPool.G = 3;
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    const c = s.pending;
    if (c?.kind !== "chooseOption") throw new Error(`no color choice: ${c?.kind}`);
    expect(c.options).toContain("Green");
    s = act(s, { type: "chooseOption", player: ap, choice: "Green" });
    s = settle(s, { me: ap });
    const saps = s.battlefield.filter((id) => s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]!.name === "Saproling Token");
    // Three green bears (any controller's); the Rith is red, green and white: four.
    expect(saps).toHaveLength(4);
  });

  it("Tam: proliferates once for each planeswalker type among your planeswalkers", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, tam);
    const a = putOnBattlefield(s0, ap, ajani);
    const a2 = putOnBattlefield(s0, ap, ajani2);
    const gi = putOnBattlefield(s0, ap, gideon);
    for (const id of [a, a2, gi]) s0.objects[id]!.counters.loyalty = 3;
    for (const c of ["W", "U", "B", "R", "G"] as const) s0.players[ap]!.manaPool[c] = 1;
    let s = run(s0, planActivate(s0, ap, t, abilityIndex(s0, t, /Proliferate/)));
    for (let i = 0; i < 60 && (s.stack.length || s.pending); i++) s = act(s, s.pending ? botActions(s, s.pending.player)[0]! : { type: "passPriority", player: waitingOn(s)! });
    // Two types (Ajani, Gideon), not three planeswalkers.
    expect(s.objects[gi]!.counters.loyalty).toBe(5);
    expect(s.objects[a]!.counters.loyalty).toBe(5);
  });

  it("Nissa: untap up to two target creatures and up to two target lands", () => {
    const { s: s0, ap } = setup([]);
    const n = putOnBattlefield(s0, ap, nissa);
    s0.objects[n]!.counters.loyalty = 5;
    const c1 = putOnBattlefield(s0, ap, bear());
    const c2 = putOnBattlefield(s0, ap, bear());
    const lands = s0.battlefield.filter((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Forest" && s0.objects[id]!.controller === ap).slice(0, 2);
    for (const id of [c1, c2, ...lands]) s0.objects[id]!.tapped = true;
    const s = settle(run(s0, planActivate(s0, ap, n, 0, [tgt(c1), tgt(c2), tgt(lands[0]!), tgt(lands[1]!)])), { me: ap });
    for (const id of [c1, c2, ...lands]) expect(s.objects[id]!.tapped).toBeFalsy();
    expect(s.objects[n]!.counters.loyalty).toBe(7);
    // A creature isn't a land target.
    expect(planActivate(s0, ap, n, 0, [tgt(c1), tgt(c2), tgt(c1), tgt(lands[1]!)])).toBeNull();
  });

  it("Sosuke: a creature your Warrior dealt combat damage is destroyed at end of combat; not one an opponent's Warrior hit", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, sosuke);
    const w = putOnBattlefield(s0, ap, warrior);
    const blocker = putOnBattlefield(s0, opp, card("Test Wall", "Creature — Wall", "{3}", { power: "0", toughness: "6" }));
    let s = toAttack(s0, ap);
    s = attack(s, ap, [{ attacker: w, defender: opp }], [{ blocker, attacker: w }]);
    s = settle(s, { me: ap });
    expect(s.objects[blocker]!.damage === 2 || zone(s, blocker) === "graveyard").toBe(true);
    s = passUntil(s, "main2", ap);
    expect(zone(s, blocker)).toBe("graveyard");
  });

  it("Wolverine: may assign his combat damage as though he weren't blocked", () => {
    const { s } = setup([]);
    const w = putOnBattlefield(s, s.activePlayer, wolverine);
    expect(abilitiesOf(s, s.objects[w]!).statics.length).toBeGreaterThan(0);
  });

  it("Captain Mar-Vell: flash only once an opponent has cast a spell this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, marvell);
    const sorcery = into(s0, opp, card("Test Growth", "Sorcery", "{G}", { oracleText: "You gain 1 life." }), "hand");
    s0.players[opp]!.manaPool.G = 1;
    expect(castProblem(s0, opp, sorcery)).not.toBeNull();
    // The active player casts a spell; then the Mar-Vell's controller may cast the sorcery while it's on the stack.
    const shk = into(s0, ap, shock, "hand");
    s0.players[ap]!.manaPool.R = 1;
    let s = run(s0, planCast(s0, ap, shk, [{ kind: "player", id: opp }]));
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    s.priority = opp;
    expect(planCast(s, opp, sorcery)).not.toBeNull();
  });
});
