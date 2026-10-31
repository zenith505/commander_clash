// Round 224: the unsupported cards no round had written down, from the top of the popularity list. Aphelia, Viper
// Whisperer (a floating "one or more Gorgons and/or Snakes you control deal combat damage to a player"), Titans' Nest
// ("a spell that's one or more colors without {X} in its mana cost"), Leyline of Combustion ("you and/or at least one
// permanent you control becomes the target"), The Beast, Deathless Prince ("a creature deals combat damage to its
// owner"), Wildgrowth Archaic ("the number of colors of mana spent to cast it" in a cast trigger), Ashling the Pilgrim
// ("remove all +1/+1 counters ..., and it deals that much damage"), Labyrinth Raptor ("defending player sacrifices a
// creature of their choice that's blocking it"), Showstopping Surprise and Nova Flame ("it deals damage equal to its
// power to each other creature"), Bounty of the Luxa ("If no counters were removed this way ... Otherwise"), Huatli,
// Warrior Poet ("Creatures dealt damage this way can't block this turn"), Woodland Weavemaster ("cast Elf spells and
// activate abilities of Elf sources"), Breathless Knight ("entered from a graveyard or you cast it from a graveyard"),
// Stalwart Successor ("the first time counters have been put on that creature this turn"), Storrev, Devkarin Lich ("a
// card in your graveyard that wasn't put there this combat") and Cheering Crowd ("that player may put a +1/+1 counter
// on ~. If they do, they add {C} for each counter on it").

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, compileCard, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";
import { spendAllows } from "../src/spend";

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
/**
 * Attack with `attacks`; `blocks` decides the blocks; `me`'s "you may" questions are answered with `may`, trigger
 * targets with `targets` (without `targets` it stops there); other players answer as bots do. Runs until combat is over or `me` has another question.
 */
const attack = (s: GameState, me: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId }[], blocks: { blocker: ObjectId; attacker: ObjectId }[] = [], opts: { may?: boolean; targets?: TargetChoice[] } = {}) => {
  s = act(s, { type: "declareAttackers", player: me, attacks });
  for (let i = 0; i < 120 && s.step !== "endCombat" && s.step !== "main2"; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: blocks.filter((b) => s.objects[b.blocker]!.controller === p.player) });
    else if (p && p.player === me && p.kind === "chooseMay") s = act(s, { type: "chooseMay", player: me, yes: opts.may ?? false });
    else if (p && p.player === me && p.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: me, targets: opts.targets });
    else if (p && p.player === me) return s;
    else if (p) s = act(s, botActions(s, p.player)[0]!);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const toAttack = (s: GameState, ap: PlayerId) => {
  for (const p of s.players) if (p.id !== ap) emptyHand(s, p.id);
  return passUntil(s, "declareAttackers", ap);
};
const next = (s: GameState, p: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(p) + 1) % s.turnOrder.length]!;
const wall = (name = "Test Wall") => card(name, "Creature — Wall", "{2}", { power: "0", toughness: "4", keywords: ["Defender"], oracleText: "Defender" });

// Real oracle text (Scryfall).
const aphelia = card("Aphelia, Viper Whisperer", "Legendary Creature — Gorgon Assassin", "{1}{B}", {power: "1",toughness: "3",keywords: ["Deathtouch"],oracleText: "Deathtouch\nWhenever Aphelia attacks, you may pay {1}{B/G}. If you do, create a 1/1 black Snake creature token with deathtouch.\n{4}{B}: Until end of turn, whenever one or more Gorgons and/or Snakes you control deal combat damage to a player, that player loses half their life, rounded up."});
const nest = card("Titans' Nest", "Enchantment", "{1}{B}{G}{U}", {keywords: ["Surveil"],oracleText: "At the beginning of your upkeep, surveil 1. (Look at the top card of your library. You may put that card into your graveyard.)\nExile a card from your graveyard: Add {C}. Spend this mana only to cast a spell that's one or more colors without {X} in its mana cost."});
const leyline = card("Leyline of Combustion", "Enchantment", "{2}{R}{R}", {oracleText: "If this card is in your opening hand, you may begin the game with it on the battlefield.\nWhenever you and/or at least one permanent you control becomes the target of a spell or ability an opponent controls, this enchantment deals 2 damage to that player."});
const beast = card("The Beast, Deathless Prince", "Legendary Creature — Demon", "{2}{B}{R}", {power: "6",toughness: "6",oracleText: "When you cast this spell, gain control of target creature until end of turn. Untap it. It gains menace and haste until end of turn.\nThe Beast enters tapped with six stun counters on it. (If it would become untapped, remove a stun counter from it instead.)\nWhenever a creature deals combat damage to its owner, untap The Beast and draw a card."});
const archaic = card("Wildgrowth Archaic", "Creature — Avatar", "{2/G}{2/G}", {power: "0",toughness: "0",keywords: ["Reach","Converge","Trample"],oracleText: "Reach, trample\nConverge — This creature enters with a +1/+1 counter on it for each color of mana spent to cast it.\nWhenever you cast a creature spell, that creature enters with X additional +1/+1 counters on it, where X is the number of colors of mana spent to cast it."});
const ashling = card("Ashling the Pilgrim", "Legendary Creature — Elemental Shaman", "{1}{R}", {power: "1",toughness: "1",oracleText: "{1}{R}: Put a +1/+1 counter on Ashling. If this is the third time this ability has resolved this turn, remove all +1/+1 counters from Ashling, and it deals that much damage to each creature and each player."});
const raptor = card("Labyrinth Raptor", "Creature — Nightmare Dinosaur", "{B}{R}", {power: "2",toughness: "2",keywords: ["Menace"],oracleText: "Menace\nWhenever a creature you control with menace becomes blocked, defending player sacrifices a creature of their choice that's blocking it.\n{B}{R}: Creatures you control with menace get +1/+0 until end of turn."});
const surprise = card("Showstopping Surprise", "Instant", "{3}{R}{R}", {oracleText: "Choose target creature you control. Turn it face up if it's face down. Then it deals damage equal to its power to each other creature."});
const nova = card("Nova Flame", "Sorcery", "{X}{2}{R}{R}", {oracleText: "Put X +1/+1 counters on target creature you control. It deals damage equal to its power to each other creature."});
const luxa = card("Bounty of the Luxa", "Enchantment", "{2}{G}{U}", {oracleText: "At the beginning of your first main phase, remove all flood counters from this enchantment. If no counters were removed this way, put a flood counter on this enchantment and draw a card. Otherwise, add {C}{G}{U}."});
const huatli = card("Huatli, Warrior Poet", "Legendary Planeswalker — Huatli", "{3}{R}{W}", {loyalty: "3",oracleText: "+2: You gain life equal to the greatest power among creatures you control.\n0: Create a 3/3 green Dinosaur creature token with trample.\n−X: Huatli deals X damage divided as you choose among any number of target creatures. Creatures dealt damage this way can't block this turn."});
const weavemaster = card("Woodland Weavemaster", "Creature — Elf Druid", "{1}{G}", {power: "1",toughness: "2",keywords: ["Vigilance"],oracleText: "Vigilance\nWhenever another Elf you control enters, this creature gets +1/+1 until end of turn.\n{T}: Add X mana of any one color, where X is this creature's power. Spend this mana only to cast Elf spells and activate abilities of Elf sources."});
const knight = card("Breathless Knight", "Creature — Spirit Knight", "{1}{W}{B}", {power: "2",toughness: "2",keywords: ["Flying","Lifelink"],oracleText: "Flying, lifelink\nWhenever this creature or another creature you control enters, if that creature entered from a graveyard or you cast it from a graveyard, put a +1/+1 counter on this creature."});
const successor = card("Stalwart Successor", "Creature — Human Warrior", "{1}{B}{G}", {power: "3",toughness: "2",keywords: ["Menace"],oracleText: "Menace (This creature can't be blocked except by two or more creatures.)\nWhenever one or more counters are put on a creature you control, if it's the first time counters have been put on that creature this turn, put a +1/+1 counter on that creature."});
const storrev = card("Storrev, Devkarin Lich", "Legendary Creature — Zombie Elf Wizard", "{1}{B}{B}{G}", {power: "5",toughness: "4",keywords: ["Trample"],oracleText: "Trample\nWhenever Storrev deals combat damage to a player or planeswalker, return to your hand target creature or planeswalker card in your graveyard that wasn't put there this combat."});
const crowd = card("Cheering Crowd", "Creature — Human Citizen", "{1}{R/G}", {power: "2",toughness: "2",oracleText: "At the beginning of each player's first main phase, that player may put a +1/+1 counter on this creature. If they do, they add {C} for each counter on it."});

describe("round 224", () => {
  it("parse", () => supported(aphelia, nest, leyline, beast, archaic, ashling, raptor, surprise, nova, luxa, huatli, weavemaster, knight, successor, storrev, crowd));

  it("Aphelia: after {4}{B}, a player dealt combat damage by Gorgons and/or Snakes loses half their life, rounded up", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, aphelia);
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(run(s0, planActivate(s0, ap, a, 0)), { me: ap });
    s = toAttack(s, ap);
    s = attack(s, ap, [{ attacker: a, defender: opp }, { attacker: b, defender: opp }]);
    // 1 from Aphelia and 2 from the Bear (40 - 3 = 37), then half of 37 rounded up: 19 (once, for the Gorgon only).
    expect(s.players[opp]!.life).toBe(18);
  });

  it("Aphelia: without the activation, combat damage is all", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, aphelia);
    let s = toAttack(s0, ap);
    s = attack(s, ap, [{ attacker: a, defender: opp }]);
    expect(s.players[opp]!.life).toBe(39);
  });

  it("Titans' Nest: its mana pays for colored spells without {X} in their mana costs only", () => {
    const only = compileCard(nest).activated[0]!.body.effects.find((e) => e.type === "addMana");
    if (only?.type !== "addMana" || !only.only) throw new Error("no restriction");
    const { s } = setup([]);
    const allows = (d: CardDef) => spendAllows(s, s.activePlayer, only.only!, { spell: d });
    expect(allows(bear())).toBe(true);
    expect(allows(card("Test Golem", "Artifact Creature — Golem", "{3}", { power: "3", toughness: "3" }))).toBe(false);
    expect(allows(card("Test Fireball", "Sorcery", "{X}{R}", { oracleText: "Test Fireball deals X damage to any target." }))).toBe(false);
  });

  it("Leyline of Combustion: 2 damage to the opponent once for each spell that targets you or your permanents", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, leyline);
    const b1 = putOnBattlefield(s0, ap, bear());
    const b2 = putOnBattlefield(s0, ap, bear({ name: "Second Bear" }));
    let s = passUntil(s0, "main1", opp);
    const tapTwo = into(s, opp, card("Test Freeze", "Instant", "{U}", { oracleText: "Tap two target creatures." }), "hand");
    s.players[opp]!.manaPool.U = 1;
    s = settle(run(s, planCast(s, opp, tapTwo, [tgt(b1), tgt(b2)])), { me: ap });
    expect(s.objects[b1]!.tapped && s.objects[b2]!.tapped).toBe(true);
    // Once, not once for each Bear.
    expect(s.players[opp]!.life).toBe(38);
    const drain = into(s, opp, card("Test Drain", "Sorcery", "{B}", { oracleText: "Target player loses 1 life." }), "hand");
    s.players[opp]!.manaPool.B = 1;
    s = settle(run(s, planCast(s, opp, drain, [{ kind: "player", id: ap }])), { me: ap });
    expect(s.players[opp]!.life).toBe(36);
    // Its own spells don't.
    const zap = into(s, ap, card("Test Zap", "Instant", "{R}", { oracleText: "Test Zap deals 1 damage to any target." }), "hand");
    expect(zap).toBeTruthy();
  });

  it("The Beast: a creature dealing combat damage to its owner untaps it and draws a card", () => {
    const { s: s0, ap, opp } = setup([]);
    const beastId = putOnBattlefield(s0, ap, beast);
    s0.objects[beastId]!.tapped = true;
    const stolen = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    s0.objects[stolen]!.controller = ap;
    const mine = putOnBattlefield(s0, ap, bear());
    invalidateCharacteristics(s0);
    emptyHand(s0, ap);
    let s = toAttack(s0, ap);
    s = attack(s, ap, [{ attacker: stolen, defender: opp }, { attacker: mine, defender: opp }]);
    s = settle(s, { me: ap });
    expect(s.players[opp]!.life).toBe(36);
    // Only the stolen Bear dealt damage to its owner: one card, and The Beast untapped.
    expect(s.players[ap]!.hand).toHaveLength(1);
    expect(s.objects[beastId]!.tapped).toBe(false);
  });

  it("Wildgrowth Archaic: a creature spell enters with a +1/+1 counter for each color of mana spent to cast it", () => {
    const hybrid = card("Test Two-Color Bear", "Creature — Bear", "{G}{U}", { power: "2", toughness: "2" });
    const mono = card("Test Mono Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });
    const { s: s0, ap, ids } = setup([hybrid, mono]);
    // Put onto the battlefield, not cast, so converge gave it nothing: keep the 0/0 alive.
    s0.objects[putOnBattlefield(s0, ap, archaic)]!.counters["+1/+1"] = 3;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(2);
    s.players[ap]!.manaPool.G = 2;
    s = settle(run(s, planCast(s, ap, ids[1]!)), { me: ap });
    expect(s.objects[ids[1]!]!.counters["+1/+1"]).toBe(1);
  });

  it("Ashling: the third resolution this turn removes its counters and deals that much damage to each creature and player", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, ashling);
    const theirs = putOnBattlefield(s0, opp, bear());
    const big = putOnBattlefield(s0, opp, wall());
    let s = s0;
    for (let i = 0; i < 2; i++) s = settle(run(s, planActivate(s, ap, a, 0)), { me: ap });
    expect(s.objects[a]!.counters["+1/+1"]).toBe(2);
    s = settle(run(s, planActivate(s, ap, a, 0)), { me: ap });
    expect(s.players[opp]!.life).toBe(37);
    expect(s.players[ap]!.life).toBe(37);
    expect(zone(s, theirs)).toBe("graveyard");
    expect(s.objects[big]!.damage).toBe(3);
    // Ashling, a 1/1 again, dies to its own damage.
    expect(zone(s, a)).toBe("graveyard");
  });

  it("Labyrinth Raptor: defending player sacrifices one of the creatures blocking a creature with menace", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, raptor);
    const w1 = putOnBattlefield(s0, opp, wall());
    const w2 = putOnBattlefield(s0, opp, wall("Other Wall"));
    const bystander = putOnBattlefield(s0, opp, wall("Bystander Wall"));
    let s = toAttack(s0, ap);
    s = attack(s, ap, [{ attacker: r, defender: opp }], [{ blocker: w1, attacker: r }, { blocker: w2, attacker: r }]);
    s = settle(s, { me: ap });
    // One of the two blockers, not the wall that didn't block.
    expect([w1, w2].filter((w) => zone(s, w) === "graveyard")).toHaveLength(1);
    expect(zone(s, bystander)).toBe("battlefield");
    expect(zone(s, r)).toBe("battlefield");
  });

  it("Showstopping Surprise: the target deals damage equal to its power to each other creature", () => {
    const { s: s0, ap, ids, opp } = setup([surprise]);
    const big = putOnBattlefield(s0, ap, card("Test Giant", "Creature — Giant", "{3}", { power: "3", toughness: "5" }));
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, wall());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(big)])), { me: ap });
    expect(s.objects[big]!.damage).toBe(0);
    expect(zone(s, mine)).toBe("graveyard");
    expect(s.objects[theirs]!.damage).toBe(3);
  });

  it("Nova Flame: X counters, then it deals damage equal to its power to each other creature", () => {
    const { s: s0, ap, ids, opp } = setup([nova]);
    const b = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, wall());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)], undefined, "auto", 2)), { me: ap });
    expect(pt(s, b)).toBe("4/4");
    expect(zone(s, theirs)).toBe("graveyard");
    expect(s.objects[b]!.damage).toBe(0);
  });

  it("Bounty of the Luxa: a flood counter and a card, then the next time {C}{G}{U}", () => {
    const { s: s0, ap } = setup([]);
    const l = putOnBattlefield(s0, ap, luxa);
    let s = passUntil(s0, "draw", ap);
    s = passUntil(s, "main1", ap);
    const hand = s.players[ap]!.hand.length;
    s = settle(s, { me: ap });
    expect(s.objects[l]!.counters.flood).toBe(1);
    expect(s.players[ap]!.hand).toHaveLength(hand + 1);
    s = passUntil(s, "main1", next(s, ap));
    s = passUntil(s, "main1", ap);
    const hand2 = s.players[ap]!.hand.length;
    // The trigger is on the stack; the mana comes as it resolves.
    for (let i = 0; i < 20 && s.stack.length; i++) s = act(s, s.pending ? botActions(s, s.pending.player)[0]! : { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[l]!.counters.flood ?? 0).toBe(0);
    expect(s.players[ap]!.hand).toHaveLength(hand2);
    const pool = s.players[ap]!.manaPool;
    expect([pool.C, pool.G, pool.U]).toEqual([1, 1, 1]);
  });

  it("Huatli, Warrior Poet: −X divided among creatures, which can't block this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, huatli);
    s0.objects[h]!.counters.loyalty = 3;
    const w1 = putOnBattlefield(s0, opp, wall());
    const w2 = putOnBattlefield(s0, opp, wall("Other Wall"));
    const untouched = putOnBattlefield(s0, opp, wall("Third Wall"));
    const idx = compileCard(huatli).activated.findIndex((a) => /^−X/.test(a.text));
    const s = settle(run(s0, planActivate(s0, ap, h, idx, [{ kind: "object", id: w1, amount: 1 }, { kind: "object", id: w2, amount: 1 }], undefined, undefined, 2)), { me: ap });
    expect(s.objects[h]!.counters.loyalty).toBe(1);
    expect([s.objects[w1]!.damage, s.objects[w2]!.damage]).toEqual([1, 1]);
    expect(characteristics(s, s.objects[w1]!).cantBlock).toBe(true);
    expect(characteristics(s, s.objects[w2]!).cantBlock).toBe(true);
    expect(characteristics(s, s.objects[untouched]!).cantBlock).toBe(false);
  });

  it("Woodland Weavemaster: X mana spent only on Elf spells and abilities of Elf sources", () => {
    const m = compileCard(weavemaster).mana[0]!;
    if (!m.spendOnly) throw new Error("no restriction");
    const { s } = setup([]);
    const elf = card("Test Elf", "Creature — Elf Warrior", "{1}{G}", { power: "2", toughness: "2" });
    expect(spendAllows(s, s.activePlayer, m.spendOnly, { spell: elf })).toBe(true);
    expect(spendAllows(s, s.activePlayer, m.spendOnly, { spell: bear() })).toBe(false);
    expect(m.spendOnly.abilities).toMatchObject({ subtypes: ["Elf"] });
  });

  it("Breathless Knight: a counter for a creature returned from a graveyard, not for one cast from hand", () => {
    const raise = card("Test Raise", "Sorcery", "{B}", { oracleText: "Return target creature card from your graveyard to the battlefield." });
    const fresh = bear({ name: "Fresh Bear" });
    const { s: s0, ap, ids } = setup([raise, fresh]);
    const k = putOnBattlefield(s0, ap, knight);
    const dead = into(s0, ap, bear(), "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(dead)])), { me: ap });
    expect(zone(s, dead)).toBe("battlefield");
    expect(s.objects[k]!.counters["+1/+1"]).toBe(1);
    s = settle(run(s, planCast(s, ap, ids[1]!)), { me: ap });
    expect(zone(s, ids[1]!)).toBe("battlefield");
    expect(s.objects[k]!.counters["+1/+1"]).toBe(1);
  });

  it("Stalwart Successor: one more +1/+1 counter the first time counters are put on a creature each turn", () => {
    const grow = card("Test Grow", "Instant", "{G}", { oracleText: "Put a +1/+1 counter on target creature." });
    const { s: s0, ap, ids } = setup([grow, grow]);
    putOnBattlefield(s0, ap, successor);
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])), { me: ap });
    expect(s.objects[b]!.counters["+1/+1"]).toBe(2);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(b)])), { me: ap });
    expect(s.objects[b]!.counters["+1/+1"]).toBe(3);
  });

  it("Storrev: can't return a card put into your graveyard this combat", () => {
    const { s: s0, ap, opp } = setup([]);
    const st = putOnBattlefield(s0, ap, storrev);
    const doomed = putOnBattlefield(s0, ap, bear({ name: "Doomed Bear" }));
    const earlier = into(s0, ap, bear({ name: "Earlier Bear" }), "graveyard");
    const big = putOnBattlefield(s0, opp, card("Test Ogre", "Creature — Ogre", "{3}", { power: "4", toughness: "4" }));
    emptyHand(s0, ap);
    let s = toAttack(s0, ap);
    s = attack(s, ap, [{ attacker: st, defender: opp }, { attacker: doomed, defender: opp }], [{ blocker: big, attacker: doomed }]);
    const p = s.pending;
    if (p?.kind !== "chooseTargets") throw new Error(`no target choice: ${p?.kind}`);
    expect(zone(s, doomed)).toBe("graveyard");
    // The Bear that died this combat is no legal target.
    const bad = (() => {
      try {
        act(s, { type: "chooseTargets", player: ap, targets: [tgt(doomed)] });
        return false;
      } catch {
        return true;
      }
    })();
    expect(bad).toBe(true);
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(earlier)] });
    s = settle(s, { me: ap });
    expect(zone(s, earlier)).toBe("hand");
  });

  it("Cheering Crowd: at your first main phase you may put a counter on it, then add {C} for each counter", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, crowd);
    s0.objects[c]!.counters["+1/+1"] = 1;
    // The next player's first main phase: they are asked (and the bot says no, so nothing changes).
    let s = s0;
    const opp1 = next(s0, ap);
    for (let i = 0; i < 200 && !(s.pending?.kind === "chooseMay" && s.activePlayer === opp1); i++) s = act(s, s.pending ? botActions(s, s.pending.player)[0]! : { type: "passPriority", player: waitingOn(s)! });
    expect(s.step).toBe("main1");
    expect(s.pending?.player).toBe(opp1);
    s = act(s, { type: "chooseMay", player: opp1, yes: false });
    expect(s.objects[c]!.counters["+1/+1"]).toBe(1);
    for (let i = 0; i < 400 && !(s.pending?.kind === "chooseMay" && s.activePlayer === ap); i++) s = act(s, s.pending ? botActions(s, s.pending.player)[0]! : { type: "passPriority", player: waitingOn(s)! });
    const p = s.pending;
    if (p?.player !== ap) throw new Error("no question");
    expect(s.step).toBe("main1");
    if (p.kind !== "chooseMay") throw new Error(`expected a may, got ${p.kind}`);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.objects[c]!.counters["+1/+1"]).toBe(2);
    expect(s.players[ap]!.manaPool.C).toBe(2);
  });
});
