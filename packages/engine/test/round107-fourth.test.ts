// Round 107, more popular cards: Aurelia, the Law Above ("whenever a player attacks with three or more creatures"),
// Knuckles the Echidna ("thirty or more artifacts"), Battle Angels of Tyr ("if that player has more cards in hand than
// each other player"), Call Forth the Tempest ("the total mana value of other spells you've cast this turn") and Jarad,
// Golgari Lich Lord ("Sacrifice a Swamp and a Forest"), Massacre Girl ("whenever a creature dies this turn").

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, forest, passUntil, pt, putOnBattlefield, setup, swamp } from "./helpers";
import { abilitiesOf, abilityProblem, characteristics, botActions, isFullySupported, planActivate, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const aurelia = card("Aurelia, the Law Above", "Legendary Creature — Angel", "{3}{R}{W}", { power: "4", toughness: "4", keywords: ["Flying", "Vigilance", "Haste"], oracleText: "Flying, vigilance, haste\nWhenever a player attacks with three or more creatures, you draw a card.\nWhenever a player attacks with five or more creatures, Aurelia deals 3 damage to each of your opponents and you gain 3 life." });
const knuckles = card("Knuckles the Echidna", "Legendary Creature — Echidna Warrior", "{2}{R}{R}", { power: "2", toughness: "4", keywords: ["Treasure Hunter", "Treasure", "Haste", "Trample", "Double strike"], oracleText: "Double strike, trample, haste\nWhenever one or more creatures you control deal combat damage to a player, create a Treasure token.\nTreasure Hunter — At the beginning of your upkeep, if you control thirty or more artifacts, you win the game." });
const angels = card("Battle Angels of Tyr", "Creature — Angel Knight", "{2}{W}{W}", { power: "4", toughness: "4", keywords: ["Myriad", "Flying", "Treasure"], oracleText: "Flying, myriad\nWhenever this creature deals combat damage to a player, draw a card if that player has more cards in hand than each other player. Then you create a Treasure token if that player controls more lands than each other player. Then you gain 3 life if that player has more life than each other player." });
const tempest = card("Call Forth the Tempest", "Sorcery", "{5}{R}{R}{R}", { keywords: ["Cascade"], oracleText: "Cascade, cascade (When you cast this spell, exile cards from the top of your library until you exile a nonland card that costs less. You may cast it without paying its mana cost. Put the exiled cards on the bottom of your library in a random order. Then do it again.)\nCall Forth the Tempest deals damage to each creature your opponents control equal to the total mana value of other spells you've cast this turn." });
const jarad = card("Jarad, Golgari Lich Lord", "Legendary Creature — Zombie Elf", "{B}{B}{G}{G}", { power: "2", toughness: "2", oracleText: "Jarad gets +1/+1 for each creature card in your graveyard.\n{1}{B}{G}, Sacrifice another creature: Each opponent loses life equal to the sacrificed creature's power.\nSacrifice a Swamp and a Forest: Return this card from your graveyard to your hand." });
const massacre = card("Massacre Girl", "Legendary Creature — Human Assassin", "{3}{B}{B}", { power: "4", toughness: "4", keywords: ["Menace"], oracleText: "Menace\nWhen Massacre Girl enters, each other creature gets -1/-1 until end of turn. Whenever a creature dies this turn, each creature other than Massacre Girl gets -1/-1 until end of turn." });
// Test cards.
const relic = card("Test Relic", "Artifact", "{1}");
const tomb = card("Test Tomb", "Land — Swamp Forest");
const divination = card("Test Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("can't do it");
  for (const a of plan) s = act(s, a);
  return s;
};
const attack = (s: GameState, ap: PlayerId, attackers: string[], defender: PlayerId) =>
  settle(act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender })) }));
const creatures = (s: GameState, pid: PlayerId, n: number) => Array.from({ length: n }, (_, i) => putOnBattlefield(s, pid, bear({ name: `Bear ${i}` })));
const hand = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.length;
const treasures = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).subtypes.includes("Treasure")).length;
/** Move a card from the battlefield to its owner's graveyard, as if it had died. */
const toGraveyard = (s: GameState, id: string) => {
  const o = s.objects[id]!;
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  o.zone = "graveyard";
  s.players[o.owner]!.graveyard.push(id);
};

describe("Aurelia, the Law Above", () => {
  it("any player's attack with three or more creatures draws you a card; with five or more, 3 damage to each opponent and 3 life", () => {
    supported(aurelia);
    const { s: s0, ap, opp } = setup([]);
    const s = s0;
    putOnBattlefield(s, ap, aurelia);
    const mine = creatures(s, ap, 5);
    const before = hand(s, ap);
    const life = s.players[ap]!.life;
    const after = attack(s, ap, mine, opp);
    expect(hand(after, ap)).toBe(before + 1);
    expect(after.players[ap]!.life).toBe(life + 3);
    for (const p of after.turnOrder.filter((p) => p !== ap)) expect(after.players[p]!.life).toBe(37);
  });

  it("an opponent's attack counts too; two attackers don't", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const a = putOnBattlefield(s, ap, aurelia);
    // On the next player's turn, they attack us with three creatures.
    const theirs = creatures(s, opp, 3);
    s = passUntil(s, "upkeep", opp);
    const before = hand(s, ap);
    s = attack(s, opp, theirs, ap);
    expect(hand(s, ap)).toBe(before + 1);
    expect(s.players[opp]!.life).toBe(40);
    // Two attackers: no trigger.
    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    putOnBattlefield(t0, ap2, aurelia);
    const two = creatures(t0, ap2, 2);
    const h = hand(t0, ap2);
    const t = attack(t0, ap2, two, opp2);
    expect(hand(t, ap2)).toBe(h);
    expect(a).toBeDefined();
  });
});

describe("Knuckles the Echidna", () => {
  it("wins at the beginning of your upkeep with thirty or more artifacts, not with twenty-nine", () => {
    supported(knuckles);
    const { s: s0, ap } = setup([]);
    let s = s0;
    putOnBattlefield(s, ap, knuckles);
    for (let i = 0; i < 29; i++) putOnBattlefield(s, ap, relic);
    s = settle(passUntil(passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!), "upkeep", ap));
    expect(s.over).toBe(false);
    putOnBattlefield(s, ap, relic);
    s = settle(passUntil(passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!), "upkeep", ap));
    expect(s.over).toBe(true);
    expect(s.winner).toBe(ap);
  });
});

describe("Battle Angels of Tyr", () => {
  const hit = (s0: GameState, ap: PlayerId, opp: PlayerId, a: string) => {
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    // Myriad: no copies, to keep it to the one player hit.
    for (let i = 0; i < 80 && s.step !== "endCombat" && !s.over; i++) {
      if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes: false });
      else if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] } as Action);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return s;
  };

  it("each condition is checked as it resolves, for the player it hit", () => {
    supported(angels);
    const { s: s0, ap, opp } = setup([]);
    const s = s0;
    const a = putOnBattlefield(s, ap, angels);
    // That player: the most cards in hand and the most life, but not the most lands (we have 14).
    s.players[opp]!.hand.push(...s.players[opp]!.library.splice(0, 5));
    s.players[opp]!.life = 50;
    const before = hand(s, ap);
    const life = s.players[ap]!.life;
    const after = hit(s, ap, opp, a);
    expect(after.players[opp]!.life).toBe(46);
    expect(hand(after, ap)).toBe(before + 1);
    expect(after.players[ap]!.life).toBe(life + 3);
    expect(treasures(after, ap)).toBe(0);
  });

  it("tied isn't more: nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    const s = s0;
    const a = putOnBattlefield(s, ap, angels);
    for (let i = 0; i < 15; i++) putOnBattlefield(s, opp, forest);
    const life = s.players[ap]!.life;
    const before = hand(s, ap);
    const after = hit(s, ap, opp, a);
    // Life: 36 vs 40 for the others; hands tied; but 15 lands is the most.
    expect(hand(after, ap)).toBe(before);
    expect(after.players[ap]!.life).toBe(life);
    expect(treasures(after, ap)).toBe(1);
  });
});

describe("Call Forth the Tempest", () => {
  it("deals damage equal to the total mana value of the other spells you cast this turn", () => {
    supported(tempest);
    const { s: s0, ap, opp, ids } = setup([divination, tempest]);
    let s = s0;
    const big = putOnBattlefield(s, opp, bear({ name: "Big", power: "20", toughness: "20" }));
    const mine = putOnBattlefield(s, ap, bear({ name: "Mine", power: "1", toughness: "1" }));
    // The library holds only lands and Grizzly Bears (mana value 2): each cascade casts a Bear (CR 702.85a).
    s = settle(cast(s, ap, ids[0]!));
    s = cast(s, ap, ids[1]!);
    for (let i = 0; i < 200 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes: true });
      else if (s.pending) s = run(s, botActions(s, s.pending.player));
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    // Divination (3) and what the cascades cast (Bears, 2 each), not itself (8); only creatures opponents control.
    const cast2 = (s.castThisTurn ?? []).filter((c) => c.player === ap);
    expect(cast2.length).toBe(4);
    expect(cast2.map((c) => c.mv)).toEqual([3, 8, 2, 2]);
    expect(s.objects[big]!.damage).toBe(7);
    expect(s.objects[mine]!.zone).toBe("battlefield");
  });
});

describe("Jarad, Golgari Lich Lord", () => {
  const graveAbility = (s: GameState, id: string) => abilitiesOf(s, s.objects[id]!).activated.findIndex((ab) => /Sacrifice a Swamp and a Forest/.test(ab.text ?? ""));

  it("sacrifices a Swamp and a Forest to return from your graveyard to your hand; two Swamps won't do", () => {
    supported(jarad);
    const { s: s0, ap } = setup([]);
    let s = s0;
    const j = putOnBattlefield(s, ap, jarad);
    toGraveyard(s, j);
    const i = graveAbility(s, j);
    expect(i).toBeGreaterThanOrEqual(0);
    const lands = (name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.name === name);
    const [sw1, sw2] = lands("Swamp");
    const [fo] = lands("Forest");
    expect(abilityProblem(s, ap, j, i)).toBeNull();
    expect(abilityProblem(s, ap, j, i, undefined, undefined, undefined, undefined, { sacrifice: [sw1!, sw2!] })).toMatch(/Swamp and a Forest/);
    expect(abilityProblem(s, ap, j, i, undefined, undefined, undefined, undefined, { sacrifice: [sw1!, fo!] })).toBeNull();
    s = settle(run(s, planActivate(s, ap, j, i, undefined, undefined, undefined, undefined, { sacrifice: [sw1!, fo!] })));
    expect(s.objects[j]!.zone).toBe("hand");
    expect(s.objects[sw1!]!.zone).toBe("graveyard");
    expect(s.objects[fo!]!.zone).toBe("graveyard");
  });

  it("a land that's both is only one of them (rulings); the bot pays with a plain Swamp beside it", () => {
    const { s: s0, ap } = setup([]);
    const s = s0;
    // Only one of our lands is a Swamp or a Forest: the Swamp Forest.
    for (const id of [...s.battlefield]) if (s.objects[id]!.controller === ap && /^(Swamp|Forest)$/.test(s.cards[s.objects[id]!.cardId]!.name)) toGraveyard(s, id);
    const t = putOnBattlefield(s, ap, tomb);
    const j = putOnBattlefield(s, ap, jarad);
    toGraveyard(s, j);
    const i = graveAbility(s, j);
    expect(abilityProblem(s, ap, j, i)).toMatch(/you need to sacrifice/);
    expect(abilityProblem(s, ap, j, i, undefined, undefined, undefined, undefined, { sacrifice: [t, t] })).not.toBeNull();
    const sw = putOnBattlefield(s, ap, swamp);
    expect(abilityProblem(s, ap, j, i, undefined, undefined, undefined, undefined, { sacrifice: [sw, t] })).toBeNull();
  });
});

describe("Massacre Girl", () => {
  it("each death this turn gives every other creature another -1/-1, one trigger per creature that dies", () => {
    supported(massacre);
    const { s: s0, ap, opp, ids } = setup([massacre]);
    let s = s0;
    const [one, two, three, five] = [1, 2, 3, 5].map((n) => putOnBattlefield(s, opp, bear({ name: `Bear ${n}`, power: String(n), toughness: String(n) })));
    s = settle(cast(s, ap, ids[0]!));
    // Enters: the 1/1 dies; its trigger kills the 2/2, whose trigger kills the 3/3. The 5/5 ends at 1/1; Massacre Girl
    // is never affected ("other").
    for (const id of [one, two, three]) expect(s.objects[id!]!.zone).toBe("graveyard");
    expect(pt(s, five!)).toBe("1/1");
    expect(pt(s, ids[0]!)).toBe("4/4");
    // A creature dying later this turn still counts.
    const later = putOnBattlefield(s, opp, bear({ name: "Later", power: "1", toughness: "1" }));
    s.objects[later]!.damage = 1;
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.objects[later]!.zone).toBe("graveyard");
    expect(s.objects[five!]!.zone).toBe("graveyard");
    expect(pt(s, ids[0]!)).toBe("4/4");
    // Next turn the delayed trigger is gone (CR 603.7b).
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(s.floatingTriggers ?? []).toHaveLength(0);
  });
});
