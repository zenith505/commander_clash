// Round 119, more of the most played cards: Folio of Fancies, Price of Progress, Aura Mutation, Raise the Past, Sulfuric
// Vortex, Kozilek's Unsealing, Heaped Harvest, Cyberman Patrol, Reyav, Emiel the Blessed, Urza's Bauble, Boseiju,
// Loading Zone, Fecund Greenshell, Repulsive Mutation, Aettir and Priwen, Danny Pink, Aetherspouts.

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, botActions, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState } from "../src";
import { gainLife, moveObject } from "../src/game";
import { invalidateCharacteristics } from "../src/layers";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState, yes = true) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    // Paying for a "may" and searching: as the bot would.
    if (p?.kind === "chooseMay" && (!yes || !p.pay)) s = act(s, { type: "chooseMay", player: p.player, yes });
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
const toHand = (s: GameState, pid: number, d: CardDef) => {
  const id = putOnBattlefield(s, pid, d);
  moveObject(s, id, "hand");
  return id;
};
const toYard = (s: GameState, pid: number, d: CardDef) => {
  const id = putOnBattlefield(s, pid, d);
  moveObject(s, id, "graveyard");
  return id;
};
const named = (s: GameState, name: string) => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === name);

// Real oracle text (Scryfall).
const folio = card("Folio of Fancies", "Artifact — Book", "{1}{U}", { oracleText: "Players have no maximum hand size.\n{X}{X}, {T}: Each player draws X cards.\n{2}{U}, {T}: Each opponent mills cards equal to the number of cards in their hand." });
const priceOfProgress = card("Price of Progress", "Instant", "{1}{R}", { oracleText: "Price of Progress deals damage to each player equal to twice the number of nonbasic lands that player controls." });
const auraMutation = card("Aura Mutation", "Instant", "{G}{W}", { oracleText: "Destroy target enchantment. Create X 1/1 green Saproling creature tokens, where X is that enchantment's mana value." });
const raiseThePast = card("Raise the Past", "Sorcery", "{2}{W}{W}", { oracleText: "Return all creature cards with mana value 2 or less from your graveyard to the battlefield." });
const vortex = card("Sulfuric Vortex", "Enchantment", "{1}{R}{R}", { oracleText: "At the beginning of each player's upkeep, this enchantment deals 2 damage to that player.\nIf a player would gain life, that player gains no life instead." });
const unsealing = card("Kozilek's Unsealing", "Enchantment", "{2}{U}", { keywords: ["Devoid"], oracleText: "Devoid (This card has no color.)\nWhenever you cast a creature spell with mana value 4, 5, or 6, create two 0/1 colorless Eldrazi Spawn creature tokens with \"Sacrifice this token: Add {C}.\"\nWhenever you cast a creature spell with mana value 7 or greater, draw three cards." });
const heapedHarvest = card("Heaped Harvest", "Artifact — Food", "{2}{G}", { oracleText: "When this artifact enters and when you sacrifice it, you may search your library for a basic land card, put it onto the battlefield tapped, then shuffle.\n{2}, {T}, Sacrifice this artifact: You gain 3 life." });
const cybermanPatrol = card("Cyberman Patrol", "Artifact Creature — Cyberman", "{2}", { power: "2", toughness: "2", oracleText: "Artifact creatures you control have afflict 3. (Whenever a creature with afflict 3 becomes blocked, defending player loses 3 life.)" });
const reyav = card("Reyav, Master Smith", "Legendary Creature — Dwarf Artificer", "{R}{W}", { power: "2", toughness: "2", oracleText: "Whenever a creature you control that's enchanted or equipped attacks, that creature gains double strike until end of turn." });
const emiel = card("Emiel the Blessed", "Legendary Creature — Unicorn", "{2}{W}{W}", { power: "4", toughness: "4", oracleText: "{3}: Exile another target creature you control, then return it to the battlefield under its owner's control.\nWhenever another creature you control enters, you may pay {G/W}. If you do, put a +1/+1 counter on it. If it's a Unicorn, put two +1/+1 counters on it instead. ({G/W} can be paid with either {G} or {W}.)" });
const bauble = card("Urza's Bauble", "Artifact", "{0}", { oracleText: "{T}, Sacrifice this artifact: Look at a card at random in target player's hand. You draw a card at the beginning of the next turn's upkeep." });
const boseiju = card("Boseiju, Who Shelters All", "Legendary Land", "", { oracleText: "Boseiju enters tapped.\n{T}, Pay 2 life: Add {C}. If that mana is spent on an instant or sorcery spell, that spell can't be countered." });
const bonesplitter = card("Bonesplitter", "Artifact — Equipment", "{1}", { oracleText: "Equipped creature gets +2/+0.\nEquip {1}" });
const glimmer = card("Test Aura", "Enchantment — Aura", "{3}", { oracleText: "Enchant creature" });
const temple = card("Temple Garden", "Land — Forest Plains", "", { oracleText: "({T}: Add {G} or {W}.)\nAs Temple Garden enters, you may pay 2 life. If you don't, it enters tapped." });
const unicorn = card("Lancer Unicorn", "Creature — Unicorn", "{1}{W}", { power: "2", toughness: "2" });
const quiet = card("Quiet Thought", "Instant", "{1}", { oracleText: "Draw a card." });
const loadingZone = card("Loading Zone", "Enchantment", "{3}{G}", { keywords: ["Warp"], oracleText: "If one or more counters would be put on a creature, Spacecraft, or Planet you control, twice that many of each of those kinds of counters are put on it instead.\nWarp {G} (You may cast this card from your hand for its warp cost. Exile this enchantment at the beginning of the next end step, then you may cast it from exile on a later turn.)" });
const greenshell = card("Fecund Greenshell", "Creature — Elemental Turtle", "{3}{G}{G}", { power: "4", toughness: "6", keywords: ["Reach"], oracleText: "Reach\nAs long as you control ten or more lands, creatures you control get +2/+2.\nWhenever this creature or another creature you control with toughness greater than its power enters, look at the top card of your library. If it's a land card, you may put it onto the battlefield tapped. Otherwise, put it into your hand." });
const repulsive = card("Repulsive Mutation", "Instant", "{X}{G}{U}", { oracleText: "Put X +1/+1 counters on target creature you control. Then counter up to one target spell unless its controller pays mana equal to the greatest power among creatures you control." });
const aettir = card("Aettir and Priwen", "Legendary Artifact — Equipment", "{6}", { keywords: ["Equip"], oracleText: "Equipped creature has base power and toughness X/X, where X is your life total.\nEquip {5}" });
const danny = card("Danny Pink", "Legendary Creature — Human Soldier Advisor", "{3}{U}", { power: "4", toughness: "3", keywords: ["Mentor"], oracleText: "Mentor (Whenever this creature attacks, put a +1/+1 counter on target attacking creature with lesser power.)\nCreatures you control have \"Whenever one or more counters are put on this creature for the first time each turn, draw a card.\"" });
const aetherspouts = card("Aetherspouts", "Instant", "{3}{U}{U}", { oracleText: "For each attacking creature, its owner puts it on their choice of the top or bottom of their library." });
const spacecraft = card("Test Spacecraft", "Artifact — Spacecraft", "{2}");
const relic = card("Test Relic", "Artifact", "{2}");
const charge = card("Charge Up", "Instant", "{1}", { oracleText: "Put two charge counters on target artifact." });
const grow = card("Grow Up", "Instant", "{1}", { oracleText: "Put a +1/+1 counter on target creature." });
const wall = card("Test Wall", "Creature — Wall", "{1}", { power: "0", toughness: "4", keywords: ["Defender"], oracleText: "Defender" });

describe("round 119 popular cards", () => {
  it("all supported", () => supported(folio, priceOfProgress, auraMutation, raiseThePast, vortex, unsealing, heapedHarvest, cybermanPatrol, reyav, emiel, bauble, boseiju, loadingZone, greenshell, repulsive, aettir, danny, aetherspouts));

  it("Folio of Fancies: each opponent mills as many cards as are in their own hand", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, folio);
    const o2 = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    const hands = s0.turnOrder.map((p) => s0.players[p]!.hand.length);
    s0.players[o2]!.hand = s0.players[o2]!.hand.slice(0, 1);
    const libs = Object.fromEntries(s0.turnOrder.map((p) => [p, s0.players[p]!.library.length]));
    const s = activate(s0, ap, f, 1);
    expect(s.players[opp]!.library.length).toBe(libs[opp]! - s.players[opp]!.hand.length);
    expect(s.players[o2]!.library.length).toBe(libs[o2]! - 1);
    expect(s.players[ap]!.library.length).toBe(libs[ap]!);
    expect(hands.length).toBe(4);
  });

  it("Price of Progress: twice each player's own nonbasic lands", () => {
    const { s: s0, ap, opp, ids } = setup([priceOfProgress]);
    putOnBattlefield(s0, opp, temple);
    putOnBattlefield(s0, opp, temple);
    putOnBattlefield(s0, ap, temple);
    const life = Object.fromEntries(s0.turnOrder.map((p) => [p, s0.players[p]!.life]));
    const s = cast(s0, ap, ids[0]!);
    expect(s.players[opp]!.life).toBe(life[opp]! - 4);
    expect(s.players[ap]!.life).toBe(life[ap]! - 2);
    const o2 = s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!;
    expect(s.players[o2]!.life).toBe(life[o2]!);
  });

  it("Aura Mutation: Saprolings equal to the destroyed enchantment's mana value", () => {
    const { s: s0, ap, opp, ids } = setup([auraMutation]);
    const e = putOnBattlefield(s0, opp, vortex);
    const s = cast(s0, ap, ids[0]!, [{ kind: "object", id: e }]);
    expect(s.objects[e]!.zone).toBe("graveyard");
    expect(named(s, "Saproling Token").length).toBe(3);
  });

  it("Raise the Past: only creature cards with mana value 2 or less", () => {
    const { s: s0, ap, ids } = setup([raiseThePast]);
    const small = toYard(s0, ap, bear());
    const big = toYard(s0, ap, emiel);
    const s = cast(s0, ap, ids[0]!);
    expect(s.objects[small]!.zone).toBe("battlefield");
    expect(s.objects[big]!.zone).toBe("graveyard");
  });

  it("Sulfuric Vortex: nobody gains life, and it's a replacement, not 'can't gain life'", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, opp, vortex);
    const life = s.players[ap]!.life;
    gainLife(s, ap, 5);
    expect(s.players[ap]!.life).toBe(life);
    expect(s.log.some((l) => /gains no life instead/.test(l.text ?? String(l)))).toBe(true);
  });

  it("Kozilek's Unsealing: two Spawn for mana value 4 to 6, three cards for 7 or more, nothing for 3", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, unsealing);
    const four = toHand(s0, ap, bear({ name: "Four Drop", manaCost: "{3}{G}" }));
    const three = toHand(s0, ap, bear({ name: "Three Drop", manaCost: "{2}{G}" }));
    const hand0 = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planCast(s0, ap, four)));
    expect(named(s, "Eldrazi Spawn Token").length).toBe(2);
    s = settle(run(s, planCast(s, ap, three)));
    expect(named(s, "Eldrazi Spawn Token").length).toBe(2);
    expect(s.players[ap]!.hand.length).toBe(hand0 - 2);
  });

  it("Heaped Harvest: a basic land when it enters and again when you sacrifice it", () => {
    const { s: s0, ap, ids } = setup([heapedHarvest]);
    const lands = () => s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.name === "Forest").length;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const before = lands();
    s = settle(s);
    expect(lands()).toBe(before + 1);
    s = settle(activate(s, ap, ids[0]!, 0));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(lands()).toBe(before + 2);
  });

  it("Cyberman Patrol: artifact creatures you control have afflict 3", () => {
    const { s, ap } = setup([]);
    const patrol = putOnBattlefield(s, ap, cybermanPatrol);
    const b = putOnBattlefield(s, ap, bear());
    invalidateCharacteristics(s);
    const afflict = (id: string) => abilitiesOf(s, s.objects[id]!).triggers.some((t) => t.event === "selfBecomesBlocked" && /Afflict 3/.test(t.body.text));
    expect(afflict(patrol)).toBe(true);
    expect(afflict(b)).toBe(false);
  });

  it("Reyav: an equipped or enchanted attacker gains double strike, a bare one doesn't", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, reyav);
    const geared = putOnBattlefield(s0, ap, bear({ name: "Geared Bear" }));
    const charmed = putOnBattlefield(s0, ap, bear({ name: "Charmed Bear" }));
    const bare = putOnBattlefield(s0, ap, bear());
    s0.objects[putOnBattlefield(s0, ap, bonesplitter)]!.attachedTo = geared;
    s0.objects[putOnBattlefield(s0, ap, glimmer)]!.attachedTo = charmed;
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [geared, charmed, bare].map((attacker) => ({ attacker, defender: opp })) });
    s = settle(s);
    expect(objHasKeyword(s, s.objects[geared]!, "Double strike")).toBe(true);
    expect(objHasKeyword(s, s.objects[charmed]!, "Double strike")).toBe(true);
    expect(objHasKeyword(s, s.objects[bare]!, "Double strike")).toBe(false);
  });

  it("Emiel the Blessed: pay {G/W} for one counter, two on a Unicorn; nothing if you decline", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, emiel);
    const u = toHand(s0, ap, unicorn);
    const b = toHand(s0, ap, bear());
    let s = settle(run(s0, planCast(s0, ap, u)));
    expect(s.objects[u]!.counters["+1/+1"]).toBe(2);
    s = settle(run(s, planCast(s, ap, b)), false);
    expect(s.objects[b]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Urza's Bauble: looks at a random card, then draws at the next upkeep", () => {
    const { s: s0, ap, opp } = setup([]);
    const u = putOnBattlefield(s0, ap, bauble);
    let s = run(s0, planActivate(s0, ap, u, 0, [{ kind: "player", id: opp }]));
    s = settle(s);
    expect(s.objects[u]!.zone).toBe("graveyard");
    expect(s.log.some((l) => /looks at a card at random/.test(l.text ?? String(l)))).toBe(true);
    const next = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    const from = s.log.length;
    s = passUntil(s, "draw", next);
    // (Its controller discards down to seven at their cleanup first.)
    const lines = s.log.slice(from).map((l) => l.text ?? String(l));
    const turn = lines.findIndex((l) => /^— Turn/.test(l));
    expect(lines.slice(turn).some((l) => l === `${s.players[ap]!.name} draws 1 card.`)).toBe(true);
  });

  it("Boseiju: its mana makes an instant or sorcery uncounterable, not a creature spell", () => {
    const { s: s0, ap } = setup([]);
    const land = putOnBattlefield(s0, ap, boseiju);
    s0.objects[land]!.tapped = false;
    const q = toHand(s0, ap, quiet);
    let s = act(s0, { type: "activateMana", player: ap, objectId: land, ability: 0, mana: "C" });
    expect(s.players[ap]!.manaPool.C).toBe(1);
    s = run(s, planCast(s, ap, q));
    expect(s.objects[q]!.uncounterableCast).toBe(true);
    s = settle(s);
    s.objects[land]!.tapped = false;
    const creature = toHand(s, ap, bear({ name: "Colorless Bear", manaCost: "{1}" }));
    s = act(s, { type: "activateMana", player: ap, objectId: land, ability: 0, mana: "C" });
    s = run(s, planCast(s, ap, creature));
    expect(s.objects[creature]!.uncounterableCast).toBeUndefined();
  });

  it("Loading Zone: twice the counters on a creature or Spacecraft you control, not on another artifact", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, loadingZone);
    const b = putOnBattlefield(s0, ap, bear());
    const craft = putOnBattlefield(s0, ap, spacecraft);
    const r = putOnBattlefield(s0, ap, relic);
    let s = cast(s0, ap, toHand(s0, ap, grow), [{ kind: "object", id: b }]);
    s = cast(s, ap, toHand(s, ap, charge), [{ kind: "object", id: craft }]);
    s = cast(s, ap, toHand(s, ap, charge), [{ kind: "object", id: r }]);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[craft]!.counters.charge).toBe(4);
    expect(s.objects[r]!.counters.charge).toBe(2);
  });

  it("Fecund Greenshell: a creature with toughness greater than its power looks at the top card; a land may go onto the battlefield, else to hand", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, greenshell);
    const lib = s0.players[ap]!.library;
    const top = lib[0]!;
    expect(s0.cards[s0.objects[top]!.cardId]!.name).toBe("Forest");
    // A 2/2 doesn't trigger it.
    let s = settle(run(s0, planCast(s0, ap, toHand(s0, ap, bear()))));
    expect(s.objects[top]!.zone).toBe("library");
    s = settle(run(s, planCast(s, ap, toHand(s, ap, wall))));
    expect(s.objects[top]!.zone).toBe("battlefield");
    expect(s.objects[top]!.tapped).toBe(true);
    // Declining puts the land into your hand (rulings).
    const next = s.players[ap]!.library[0]!;
    s = settle(run(s, planCast(s, ap, toHand(s, ap, wall))), false);
    expect(s.objects[next]!.zone).toBe("hand");
  });

  it("Repulsive Mutation: X counters, then counter the spell unless its controller pays the greatest power among your creatures", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, bear());
    const q = toHand(s0, ap, quiet);
    const r = toHand(s0, ap, repulsive);
    let s = run(s0, planCast(s0, ap, q));
    s = run(s, planCast(s, ap, r, [{ kind: "object", id: b }, { kind: "stack", id: s.stack[s.stack.length - 1]!.id }], undefined, undefined, 1));
    for (let i = 0; i < 8 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    expect(s.pending?.kind).toBe("payUnless");
    expect(s.pending?.kind === "payUnless" && s.pending.cost).toBe("{3}");
    s = act(s, { type: "payUnless", player: ap, pay: false });
    expect(s.objects[q]!.zone).toBe("graveyard");
  });

  it("Aettir and Priwen: equipped creature's base power and toughness follow your life total", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, bear());
    const a = putOnBattlefield(s0, ap, aettir);
    let s = activate(s0, ap, a, 0, [{ kind: "object", id: b }]);
    s = settle(s);
    expect(s.objects[a]!.attachedTo).toBe(b);
    const life = s.players[ap]!.life;
    expect(pt(s, b)).toBe(`${life}/${life}`);
    s.players[ap]!.life = 7;
    invalidateCharacteristics(s);
    expect(pt(s, b)).toBe("7/7");
  });

  it("Danny Pink: creatures you control draw a card the first time counters are put on them each turn", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, danny);
    const b = putOnBattlefield(s0, ap, bear());
    const hand = s0.players[ap]!.hand.length;
    let s = settle(cast(s0, ap, toHand(s0, ap, grow), [{ kind: "object", id: b }]));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    s = settle(cast(s, ap, toHand(s, ap, grow), [{ kind: "object", id: b }]));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(2);
  });

  it("Aetherspouts: each attacking creature's owner puts it on the top or bottom of their library", () => {
    const { s: s0, ap, opp } = setup([]);
    const a1 = putOnBattlefield(s0, ap, bear({ name: "Bear One" }));
    const a2 = putOnBattlefield(s0, ap, bear({ name: "Bear Two" }));
    const stay = putOnBattlefield(s0, ap, bear({ name: "Bear Home" }));
    for (let i = 0; i < 5; i++) putOnBattlefield(s0, opp, card("Island", "Basic Land — Island"));
    const spouts = toHand(s0, opp, aetherspouts);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [a1, a2].map((attacker) => ({ attacker, defender: opp })) });
    for (let i = 0; i < 8 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planCast(s, opp, spouts));
    for (let i = 0; i < 8 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("topOrBottom");
    s = act(s, { type: "chooseOption", player: ap, choice: "top" });
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("topOrBottom");
    s = act(s, { type: "chooseOption", player: ap, choice: "bottom" });
    const lib = s.players[ap]!.library;
    expect([a1, a2].filter((x) => s.objects[x]!.zone === "library").length).toBe(2);
    expect([lib[0], lib[lib.length - 1]].sort()).toEqual([a1, a2].sort());
    expect(s.objects[stay]!.zone).toBe("battlefield");
  });
});
