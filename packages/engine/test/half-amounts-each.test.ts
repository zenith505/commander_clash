// More halves (CR 107.1a): "Round up each time." after several of them (Fraying Omnipotence, Peer into the Abyss, Hydroid
// Krasis), each player's own hand or permanents ("discards half the cards in their hand", "sacrifices half the creatures
// they control"), "pay half your life, rounded up" as a cost (rulings on Lurking Evil: 0 with 0 or less life), and the
// player-is-dealt-damage triggers that use them (Grievous Wound: once for damage dealt at the same time).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, passUntil, putOnBattlefield, setup, swamp, target } from "./helpers";
import { characteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Passes priority until the stack is empty, answering choices the simple way: yes, and the first cards offered. */
const settle = (s: GameState, max = 80) => {
  for (let i = 0; i < max && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    const pid = waitingOn(s)!;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: pid, yes: true });
    else if (p?.kind === "discard") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, p.count) });
    else if (p?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: pid, ids: p.options.slice(0, p.count) });
    else if (p?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: pid, found: p.cards.slice(0, p.max) });
    else if (p) throw new Error(`unexpected ${p.kind}`);
    else s = act(s, { type: "passPriority", player: pid });
  }
  return s;
};
const creatures = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).types.includes("Creature"));
/** Puts copies of `def` into `pid`'s hand. */
const toHand = (s: GameState, pid: PlayerId, def: CardDef, n: number) => {
  for (let i = 0; i < n; i++) {
    const id = putOnBattlefield(s, pid, def);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "hand";
    s.players[pid]!.hand.push(id);
  }
};
/** Puts `def` on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};

// Real oracle text (Scryfall).
const fraying = card("Fraying Omnipotence", "Sorcery", "{3}{B}{B}", { oracleText: "Each player loses half their life, then discards half the cards in their hand, then sacrifices half the creatures they control of their choice. Round up each time." });
const pox = card("Pox Plague", "Sorcery", "{B}{B}{B}{B}{B}", { oracleText: "Each player loses half their life, then discards half the cards in their hand, then sacrifices half the permanents they control of their choice. Round down each time." });
const peer = card("Peer into the Abyss", "Sorcery", "{4}{B}{B}{B}", { oracleText: "Target player draws cards equal to half the number of cards in their library and loses half their life. Round up each time." });
const krasis = card("Hydroid Krasis", "Creature — Jellyfish Hydra Beast", "{X}{G}{U}", { power: "0", toughness: "0", keywords: ["Flying", "Trample"], oracleText: "When you cast this spell, you gain half X life and draw half X cards. Round down each time.\nFlying, trample\nThis creature enters with X +1/+1 counters on it." });
const xander = card("Lord Xander, the Collector", "Legendary Creature — Vampire Demon Noble", "{4}{U}{B}{R}", { power: "6", toughness: "6", keywords: ["Mill"], oracleText: "When Lord Xander enters, target opponent discards half the cards in their hand, rounded down.\nWhenever Lord Xander attacks, defending player mills half their library, rounded down.\nWhen Lord Xander dies, target opponent sacrifices half the nonland permanents they control of their choice, rounded down." });
const rakdos = card("Rakdos the Defiler", "Legendary Creature — Demon", "{2}{B}{B}{R}{R}", { power: "7", toughness: "6", keywords: ["Flying", "Trample"], oracleText: "Flying, trample\nWhenever Rakdos attacks, sacrifice half the non-Demon permanents you control, rounded up.\nWhenever Rakdos deals combat damage to a player, that player sacrifices half the non-Demon permanents they control of their choice, rounded up." });
const vona = card("Vona's Hunger", "Instant", "{2}{B}", { keywords: ["Ascend"], oracleText: "Ascend (If you control ten or more permanents, you get the city's blessing for the rest of the game.)\nEach opponent sacrifices a creature of their choice. If you have the city's blessing, instead each opponent sacrifices half the creatures they control of their choice, rounded up." });
const rush = card("Rush of Dread", "Sorcery", "{1}{B}{B}", { keywords: ["Spree"], oracleText: "Spree (Choose one or more additional costs.)\n+ {1} — Target opponent sacrifices half the creatures they control of their choice, rounded up.\n+ {2} — Target opponent discards half the cards in their hand, rounded up.\n+ {2} — Target opponent loses half their life, rounded up." });
const lurking = card("Lurking Evil", "Enchantment", "{B}{B}{B}", { oracleText: "Pay half your life, rounded up: This enchantment becomes a 4/4 Phyrexian Horror creature with flying." });
const betrayal = card("Murderous Betrayal", "Enchantment", "{B}{B}{B}", { oracleText: "{B}{B}, Pay half your life, rounded up: Destroy target nonblack creature. It can't be regenerated." });
const wound = card("Grievous Wound", "Enchantment — Aura", "{3}{B}{B}", { keywords: ["Enchant"], oracleText: "Enchant player\nEnchanted player can't gain life.\nWhenever enchanted player is dealt damage, they lose half their life, rounded up." });
const hound = card("Blood Hound", "Creature — Dog", "{2}{R}", { power: "1", toughness: "1", oracleText: "Whenever you're dealt damage, you may put that many +1/+1 counters on this creature.\nAt the beginning of your end step, remove all +1/+1 counters from this creature." });
const droplet = card("Sun Droplet", "Artifact", "{2}", { oracleText: "Whenever you're dealt damage, put that many charge counters on this artifact.\nAt the beginning of each upkeep, you may remove a charge counter from this artifact. If you do, you gain 1 life." });
const slasher = card("Unstoppable Slasher", "Creature — Zombie Assassin", "{2}{B}", { power: "2", toughness: "3", keywords: ["Deathtouch"], oracleText: "Deathtouch\nWhenever this creature deals combat damage to a player, they lose half their life, rounded up.\nWhen this creature dies, if it had no counters on it, return it to the battlefield tapped under its owner's control with two stun counters on it." });
const mai = card("Mai, Scornful Striker", "Legendary Creature — Human Noble Ally", "{1}{B}", { power: "2", toughness: "2", keywords: ["First strike"], oracleText: "First strike\nWhenever a player casts a noncreature spell, they lose 2 life." });
const genesis = card("Genesis Hydra", "Creature — Plant Hydra", "{X}{G}{G}", { power: "0", toughness: "0", oracleText: "When you cast this spell, reveal the top X cards of your library. You may put a nonland permanent card with mana value X or less from among them onto the battlefield. Then shuffle the rest into your library.\nThis creature enters with X +1/+1 counters on it." });
const hatchery = card("Hatchery Spider", "Creature — Spider", "{5}{G}{G}", { power: "5", toughness: "7", keywords: ["Reach", "Undergrowth"], oracleText: "Reach\nUndergrowth — When you cast this spell, reveal the top X cards of your library, where X is the number of creature cards in your graveyard. You may put a green permanent card with mana value X or less from among them onto the battlefield. Put the rest on the bottom of your library in a random order." });
const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
const shock = card("Test Shock", "Instant", "{R}", { oracleText: "This spell deals 2 damage to any target." });
const blackKnight = card("Test Knight", "Creature — Human Knight", "{B}", { power: "2", toughness: "2" });
const troll = card("Test Troll", "Creature — Troll", "{2}{G}{G}", { power: "4", toughness: "4" });
const whiteDivination = card("Test Insight", "Sorcery", "{1}{W}", { oracleText: "Draw a card." });

describe("halves for each player", () => {
  it("parse", () => supported(fraying, pox, peer, krasis, xander, rakdos, vona, rush, lurking, betrayal, wound, hound, droplet, slasher, mai, genesis, hatchery));

  it("Fraying Omnipotence: each loses half their life, then discards half their hand, then sacrifices half their creatures, rounded up (rulings)", () => {
    const { s: s0, ap, ids } = setup([fraying]);
    const [p1, p2, p3] = s0.turnOrder.filter((p) => p !== ap) as PlayerId[];
    s0.players[ap]!.life = 39;
    s0.players[p1!]!.life = 5;
    s0.players[p2!]!.life = 3;
    toHand(s0, ap, bear(), 2); // 3 cards with the spell gone: discards 2
    toHand(s0, p1!, bear(), 5); // the bears and whatever they drew
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, bear());
    for (let i = 0; i < 5; i++) putOnBattlefield(s0, p1!, bear());
    putOnBattlefield(s0, p3!, bear());
    const hands = s0.turnOrder.map((p) => s0.players[p]!.hand.length - (p === ap ? 1 : 0));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect([life(s, ap), life(s, p1!), life(s, p2!), life(s, p3!)]).toEqual([19, 2, 1, 20]);
    expect(s0.turnOrder.map((p) => s.players[p]!.hand.length)).toEqual(hands.map((h) => h - Math.ceil(h / 2)));
    expect([creatures(s, ap).length, creatures(s, p1!).length, creatures(s, p3!).length]).toEqual([1, 2, 0]);
  });

  it("Pox Plague rounds down, and counts all the permanents they control", () => {
    const { s: s0, ap, ids } = setup([pox]);
    const opp = s0.turnOrder.find((p) => p !== ap)!;
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, swamp);
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, bear());
    const before = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap).length - 0;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[opp]!.life).toBe(20);
    expect(creatures(s, opp).length + s.battlefield.filter((id) => s.objects[id]!.controller === opp && !creatures(s, opp).includes(id)).length).toBe(2); // 3 permanents: sacrifices 1
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap).length).toBe(before - Math.floor(before / 2));
  });

  it("Peer into the Abyss: draws half their library and loses half their life, each rounded up", () => {
    const { s: s0, ap, opp, ids } = setup([peer]);
    putOnBattlefield(s0, ap, swamp);
    s0.players[opp]!.library.splice(0, s0.players[opp]!.library.length - 7);
    s0.players[opp]!.life = 7;
    const hand = s0.players[opp]!.hand.length;
    const s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(s.players[opp]!.hand.length).toBe(hand + 4);
    expect(s.players[opp]!.library.length).toBe(3);
    expect(life(s, opp)).toBe(3);
  });

  it("Hydroid Krasis: its cast trigger uses the X it was cast with, rounded down, and resolves first (rulings)", () => {
    const { s: s0, ap, ids } = setup([krasis]);
    const hand = s0.players[ap]!.hand.length - 1;
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 5));
    s = passAll(s); // the trigger
    expect(life(s, ap)).toBe(42);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(s.objects[ids[0]!]!.zone).toBe("stack");
    s = passAll(s);
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(5);
  });

  it("Lord Xander: the target opponent discards half their hand, rounded down", () => {
    const { s: s0, ap, opp, ids } = setup([xander]);
    toHand(s0, opp, bear(), 7 - s0.players[opp]!.hand.length);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = passAll(s);
    // The enters trigger targets an opponent.
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    s = settle(s);
    expect(s.players[opp]!.hand.length).toBe(4);
  });

  it("Rakdos the Defiler: attacking, you sacrifice half your non-Demon permanents, rounded up; Rakdos isn't one", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, rakdos);
    const mine = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && id !== r).length; // 14 lands
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: r, defender: opp }] });
    s = settle(s);
    expect(s.objects[r]!.zone).toBe("battlefield");
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && id !== r).length).toBe(mine - Math.ceil(mine / 2));
  });

  it("Vona's Hunger with the city's blessing: each opponent sacrifices half their creatures instead", () => {
    const { s: s0, ap, ids } = setup([vona]);
    const [p1, p2] = s0.turnOrder.filter((p) => p !== ap) as PlayerId[];
    for (let i = 0; i < 5; i++) putOnBattlefield(s0, p1!, bear());
    putOnBattlefield(s0, p2!, bear());
    s0.players[ap]!.citysBlessing = true; // and 14 lands: ascend would give it too
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect([creatures(s, p1!).length, creatures(s, p2!).length]).toEqual([2, 0]);
  });

  it("Vona's Hunger without it: one creature each", () => {
    const { s: s0, ap, ids } = setup([vona]);
    const [p1] = s0.turnOrder.filter((p) => p !== ap) as PlayerId[];
    // Fewer than ten permanents, so no city's blessing: keep the black mana and one more land.
    const keep = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && /Swamp|Mountain/.test(s0.cards[s0.objects[id]!.cardId]!.name)).slice(0, 3);
    s0.battlefield = s0.battlefield.filter((id) => s0.objects[id]!.controller !== ap || keep.includes(id));
    for (let i = 0; i < 5; i++) putOnBattlefield(s0, p1!, bear());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(creatures(s, p1!).length).toBe(4);
  });

  it("Rush of Dread: all three modes on one opponent", () => {
    const { s: s0, ap, opp, ids } = setup([rush]);
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, bear());
    s0.players[opp]!.hand.splice(5); // 5 cards: discards 3
    const t = [{ kind: "player", id: opp }, { kind: "player", id: opp }, { kind: "player", id: opp }] as const;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [...t], [0, 1, 2])));
    expect([creatures(s, opp).length, s.players[opp]!.hand.length, life(s, opp)]).toEqual([1, 2, 20]);
  });

  it("Murderous Betrayal: pays half the life, rounded up, as the cost", () => {
    const { s: s0, ap, opp } = setup([]);
    const mb = putOnBattlefield(s0, ap, betrayal);
    const victim = putOnBattlefield(s0, opp, bear());
    s0.players[ap]!.life = 39;
    const s = passAll(run(s0, planActivate(s0, ap, mb, 0, [target(victim)])));
    expect(life(s, ap)).toBe(19);
    expect(s.objects[victim]!.zone).toBe("graveyard");
  });

  it("Lurking Evil: 7 life pays 4; at 1 life you pay 1 (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const le = putOnBattlefield(s0, ap, lurking);
    s0.players[ap]!.life = 7;
    let s = passAll(run(s0, planActivate(s0, ap, le, 0)));
    expect(life(s, ap)).toBe(3);
    expect(characteristics(s, s.objects[le]!).types).toEqual(["Creature"]);
    const { s: t0, ap: ap2 } = setup([]);
    const le2 = putOnBattlefield(t0, ap2, lurking);
    t0.players[ap2]!.life = 1;
    s = run(t0, planActivate(t0, ap2, le2, 0));
    expect(life(s, ap2)).toBe(0);
  });

  it("Lurking Evil can't be paid while you can't lose life (CR 119.8)", () => {
    const { s: s0, ap } = setup([]);
    const le = putOnBattlefield(s0, ap, lurking);
    s0.turnRules = [{ turn: s0.turn, player: ap, rule: "cantLoseLife" }]; // as from Courageous Resolve
    expect(planActivate(s0, ap, le, 0)).toBeNull();
  });

  it("Grievous Wound: triggers once for combat damage from several creatures at once (rulings), and they lose half after the damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, wound);
    s0.objects[w]!.attachedToPlayer = opp;
    const a = putOnBattlefield(s0, ap, bear()), b = putOnBattlefield(s0, ap, bear());
    s0.players[opp]!.life = 14;
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }, { attacker: b, defender: opp }] });
    s = settle(passUntil(s, "combatDamage", ap));
    s = settle(s);
    expect(life(s, opp)).toBe(5); // 14 - 4 = 10, then half of 10
  });

  it("Grievous Wound: a spell's damage, and the player can't gain life", () => {
    const { s: s0, ap, opp, ids } = setup([bolt]);
    const w = putOnBattlefield(s0, ap, wound);
    s0.objects[w]!.attachedToPlayer = opp;
    s0.players[opp]!.life = 10;
    const s = settle(cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    expect(life(s, opp)).toBe(3); // 10 - 3 = 7, then 4 of it
  });

  it("Blood Hound and Sun Droplet: that many counters for each damage event to you; Sun Droplet trades one for 1 life each upkeep", () => {
    const { s: s0, ap, opp, ids } = setup([shock, shock]);
    const h = putOnBattlefield(s0, opp, hound);
    const d = putOnBattlefield(s0, opp, droplet);
    let s = settle(cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    s = settle(cast(s, ap, ids[1]!, [{ kind: "player", id: opp }]));
    expect(s.objects[h]!.counters["+1/+1"]).toBe(4);
    expect(s.objects[d]!.counters.charge).toBe(4);
    expect(life(s, opp)).toBe(36);
    // The next upkeep (the opponent's, next in turn order): remove one, gain 1.
    s = passUntil(s, "upkeep", opp);
    s = settle(s);
    expect(s.objects[d]!.counters.charge).toBe(3);
    expect(life(s, opp)).toBe(37);
  });

  it("Sun Droplet with no counter: removing none gains nothing", () => {
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, droplet);
    const before = life(s0, ap);
    const s = settle(passUntil(s0, "upkeep", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]));
    expect(s.objects[d]!.counters.charge ?? 0).toBe(0);
    expect(life(s, ap)).toBe(before);
  });

  it("Unstoppable Slasher: the damaged player loses half; it dies once and comes back tapped with stun counters, then stays dead", () => {
    const { s: s0, ap, opp, ids } = setup([bolt, bolt]);
    const sl = putOnBattlefield(s0, ap, slasher);
    s0.players[opp]!.life = 21;
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: sl, defender: opp }] });
    s = settle(passUntil(s, "main2", ap));
    expect(life(s, opp)).toBe(9); // 21 - 2 = 19, then 10 of it
    s = settle(cast(s, ap, ids[0]!, [target(sl)]));
    const back = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Unstoppable Slasher")!;
    expect(s.objects[back]!.tapped).toBe(true);
    expect(s.objects[back]!.counters.stun).toBe(2);
    s = settle(cast(s, ap, ids[1]!, [target(back)]));
    expect(s.battlefield.some((id) => s.cards[s.objects[id]!.cardId]!.name === "Unstoppable Slasher")).toBe(false);
  });

  it("Mai: the player who cast the noncreature spell loses 2 life", () => {
    const { s: s0, ap, ids } = setup([whiteDivination, blackKnight]);
    putOnBattlefield(s0, s0.turnOrder.find((p) => p !== ap)!, mai);
    let s = settle(cast(s0, ap, ids[0]!));
    expect(life(s, ap)).toBe(38);
    s = settle(cast(s, ap, ids[1]!));
    expect(life(s, ap)).toBe(38);
  });

  it("Genesis Hydra: reveals X and puts one with mana value X or less onto the battlefield, before the Hydra resolves", () => {
    const { s: s0, ap, ids } = setup([genesis]);
    const t = onTop(s0, ap, troll);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 4));
    s = settle(passAll(s), 4);
    expect(s.objects[t]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.zone).toBe("stack");
  });

  it("Genesis Hydra with a smaller X can't take the Troll", () => {
    const { s: s0, ap, ids } = setup([genesis]);
    const t = onTop(s0, ap, troll);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 3)));
    expect(s.objects[t]!.zone).toBe("library");
  });

  it("Hatchery Spider: X is the creature cards in your graveyard, for the count and for the mana value", () => {
    const { s: s0, ap, ids } = setup([hatchery]);
    const t = onTop(s0, ap, troll);
    const yard = (n: number, s: GameState) => {
      for (let i = 0; i < n; i++) {
        const id = putOnBattlefield(s, ap, bear());
        s.battlefield.splice(s.battlefield.indexOf(id), 1);
        s.objects[id]!.zone = "graveyard";
        s.players[ap]!.graveyard.push(id);
      }
    };
    const s1 = structuredClone(s0);
    yard(3, s1);
    expect(settle(run(s1, planCast(s1, ap, ids[0]!))).objects[t]!.zone).not.toBe("battlefield");
    yard(4, s0);
    expect(settle(run(s0, planCast(s0, ap, ids[0]!))).objects[t]!.zone).toBe("battlefield");
  });
});

describe("instead of a whole sentence, and removing a counter as the 'if you do'", () => {
  const thief = card("The Destined Thief", "Legendary Creature — Human Rogue", "{2}{U}", { power: "2", toughness: "2", oracleText: "The Destined Thief can't be blocked.\n{U}, {T}: Another target creature you control can't be blocked this turn.\nWhenever one or more creatures you control deal combat damage to one or more players, draw a card, then discard a card. If you have a full party, instead draw three cards." });
  const guiding = card("Guiding Hydra", "Creature — Hydra Horror", "{X}{W}", { power: "1", toughness: "0", oracleText: "This creature enters with X +1/+1 counters on it.\nAt the beginning of combat on your turn, you may remove a +1/+1 counter from this creature. If you do, put a +1/+1 counter on each other creature you control." });
  const attackWithThief = (party: boolean) => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, thief);
    if (party) for (const sub of ["Cleric", "Warrior", "Wizard"]) putOnBattlefield(s0, ap, card(`Test ${sub}`, `Creature — Human ${sub}`, "{1}", { power: "1", toughness: "1" }));
    const hand = s0.players[ap]!.hand.length;
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: t, defender: opp }] });
    s = passUntil(s, "combatDamage", ap);
    for (let i = 0; i < 20 && !s.pending && (s.stack.length || s.triggerQueue.length || s.step === "combatDamage"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, ap, hand };
  };

  it("parse", () => supported(thief, guiding));

  it("The Destined Thief with a full party draws three and doesn't discard (rulings)", () => {
    const { s, ap, hand } = attackWithThief(true);
    expect(s.pending).toBeFalsy();
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
  });

  it("The Destined Thief without one draws a card, then discards a card", () => {
    const { s, ap } = attackWithThief(false);
    expect(s.pending?.kind).toBe("discard");
    expect(s.players[ap]!.hand.length).toBeGreaterThan(0);
  });

  it("Guiding Hydra moves one of its counters onto each other creature", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, guiding);
    s0.objects[g]!.counters["+1/+1"] = 2;
    const b = putOnBattlefield(s0, ap, bear());
    const s = settle(passUntil(s0, "beginCombat", ap));
    expect([s.objects[g]!.counters["+1/+1"], s.objects[b]!.counters["+1/+1"]]).toEqual([1, 1]);
  });
});
