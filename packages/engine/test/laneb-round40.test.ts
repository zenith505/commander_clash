// Lane B, round 40: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty, answering choices as the bots would; the choices a test makes stop it. */
const settle = (s: GameState, stopAt: (s: GameState) => boolean = () => false) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (stopAt(s)) break;
    const p = s.pending;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Plays on (no attacks or blocks unless asked, the bots answering other questions) until `stop`. */
const goUntil = (s: GameState, stop: (s: GameState) => boolean) => {
  for (let i = 0; i < 3000; i++) {
    if (stop(s)) return s;
    const p = s.pending;
    const pid = waitingOn(s)!;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never got there");
};
const at = (kind: string, pid: PlayerId) => (s: GameState) => s.pending?.kind === kind && s.pending.player === pid;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}) => run(s, planCast(s, pid, id, targets, undefined, undefined, undefined, choices));
/** Moves a new card for `def` into `pid`'s hand, library (on top) or graveyard. */
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Passes to the declare attackers step of the active player's turn and declares `attackers` at `defender`; stops at the first question. */
const attackWith = (s: GameState, attackers: string[], defender: PlayerId) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  s = act(s, { type: "declareAttackers", player: s.activePlayer, attacks: attackers.map((attacker) => ({ attacker, defender })) });
  for (let i = 0; i < 50 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const subtypesOf = (s: GameState, id: string) => characteristics(s, s.objects[id]!).subtypes;
const mine = (s: GameState, pid: PlayerId, sub: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && subtypesOf(s, id).includes(sub));
const yes = (s: GameState, pid: PlayerId) => act(s, { type: "chooseMay", player: pid, yes: true });
const find = (s: GameState, pid: PlayerId, found: string[]) => act(s, { type: "searchLibrary", player: pid, found });
/** Leaves only `keep` in `pid`'s hand (setup's hand also holds the seven cards drawn). */
const onlyHand = (s: GameState, pid: PlayerId, keep: string[]) => {
  const p = s.players[pid]!;
  for (const id of p.hand.filter((id) => !keep.includes(id))) {
    s.objects[id]!.zone = "exile";
    p.exile.push(id);
  }
  p.hand = p.hand.filter((id) => keep.includes(id));
};
const discard = (s: GameState, pid: PlayerId, objectIds: string[]) => act(s, { type: "discard", player: pid, objectIds });

// Real oracle text (Scryfall).
const mindMaggots = () => card("Mind Maggots", "Creature — Insect", "{3}{B}", { cmc: 4, colors: ["B"], power: "2", toughness: "2", oracleText: "When this creature enters, discard any number of creature cards. For each card discarded this way, put two +1/+1 counters on this creature." });
const cragganwickCremator = () => card("Cragganwick Cremator", "Creature — Giant Shaman", "{2}{R}{R}", { cmc: 4, colors: ["R"], power: "5", toughness: "4", oracleText: "When this creature enters, discard a card at random. If you discard a creature card this way, this creature deals damage equal to that card's power to target player or planeswalker." });
const revivingVapors = () => card("Reviving Vapors", "Instant", "{2}{W}{U}", { cmc: 4, colors: ["U", "W"], oracleText: "Reveal the top three cards of your library and put one of them into your hand. You gain life equal to that card's mana value. Put all other cards revealed this way into your graveyard." });
const soldeviSage = () => card("Soldevi Sage", "Creature — Human Wizard", "{1}{U}", { cmc: 2, colors: ["U"], power: "1", toughness: "1", oracleText: "{T}, Sacrifice two lands: Draw three cards, then discard one of them." });
const heightenedAwareness = () => card("Heightened Awareness", "Enchantment", "{3}{U}{U}", { cmc: 5, colors: ["U"], oracleText: "As this enchantment enters, discard your hand.\nAt the beginning of your draw step, draw an additional card." });
const castingOfBones = () => card("Casting of Bones", "Enchantment — Aura", "{2}{B}", { cmc: 3, colors: ["B"], keywords: ["Enchant"], oracleText: "Enchant creature\nWhen enchanted creature dies, draw three cards, then discard one of them." });
const krovikanSorcerer = () => card("Krovikan Sorcerer", "Creature — Human Wizard Sorcerer", "{2}{U}", { cmc: 3, colors: ["U"], power: "1", toughness: "1", oracleText: "{T}, Discard a nonblack card: Draw a card.\n{T}, Discard a black card: Draw two cards, then discard one of them." });
const malevolentNoble = () => card("Malevolent Noble", "Creature — Human Noble", "{1}{B}", { cmc: 2, colors: ["B"], power: "2", toughness: "2", oracleText: "{2}, Sacrifice an artifact or another creature: Put a +1/+1 counter on this creature." });
const gaeasBalance = () => card("Gaea's Balance", "Sorcery", "{3}{G}", { cmc: 4, colors: ["G"], oracleText: "As an additional cost to cast this spell, sacrifice five lands.\nSearch your library for a land card of each basic land type, put those cards onto the battlefield, then shuffle." });
const rhysticScrying = () => card("Rhystic Scrying", "Sorcery", "{2}{U}{U}", { cmc: 4, colors: ["U"], oracleText: "Draw three cards. Then if any player pays {2}, discard three cards." });
const soulStrings = () => card("Soul Strings", "Sorcery", "{X}{B}", { cmc: 1, colors: ["B"], oracleText: "Return two target creature cards from your graveyard to your hand unless any player pays {X}." });
const rhysticLightning = () => card("Rhystic Lightning", "Instant", "{2}{R}", { cmc: 3, colors: ["R"], oracleText: "Rhystic Lightning deals 4 damage to any target unless that permanent's controller or that player pays {2}. If they do, Rhystic Lightning deals 2 damage to the permanent or player." });
const monsoon = () => card("Monsoon", "Enchantment", "{2}{R}{G}", { cmc: 4, colors: ["G", "R"], oracleText: "At the beginning of each player's end step, tap all untapped Islands that player controls and this enchantment deals X damage to the player, where X is the number of Islands tapped this way." });
const winterBlast = () => card("Winter Blast", "Sorcery", "{X}{G}", { cmc: 1, colors: ["G"], oracleText: "Tap X target creatures. Winter Blast deals 2 damage to each of those creatures with flying." });
const tributeToUrborg = () => card("Tribute to Urborg", "Instant", "{1}{B}", { cmc: 2, colors: ["B"], keywords: ["Kicker"], oracleText: "Kicker {1}{U} (You may pay an additional {1}{U} as you cast this spell.)\nTarget creature gets -2/-2 until end of turn. If this spell was kicked, that creature gets an additional -1/-1 until end of turn for each instant and sorcery card in your graveyard." });
const gruesomeDiscovery = () => card("Gruesome Discovery", "Sorcery", "{2}{B}{B}", { cmc: 4, colors: ["B"], keywords: ["Morbid"], oracleText: "Target player discards two cards.\nMorbid — If a creature died this turn, instead that player reveals their hand, you choose two cards from it, then that player discards those cards." });
const druidOfHorns = () => card("Druid of Horns", "Creature — Human Druid", "{3}{G}", { cmc: 4, colors: ["G"], power: "2", toughness: "3", oracleText: "Whenever you cast an Aura spell that targets this creature, create a 3/3 green Beast creature token." });
const timeElemental = () => card("Time Elemental", "Creature — Elemental", "{2}{U}", { cmc: 3, colors: ["U"], power: "0", toughness: "2", oracleText: "When this creature attacks or blocks, at end of combat, sacrifice it and it deals 5 damage to you.\n{2}{U}{U}, {T}: Return target permanent that isn't enchanted to its owner's hand." });
const contempt = () => card("Contempt", "Enchantment — Aura", "{1}{U}", { cmc: 2, colors: ["U"], keywords: ["Enchant"], oracleText: "Enchant creature\nWhen enchanted creature attacks, return it and this Aura to their owners' hands at end of combat." });
const hypnox = () => card("Hypnox", "Creature — Nightmare Horror", "{8}{B}{B}{B}", { cmc: 11, colors: ["B"], power: "8", toughness: "8", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, if you cast it from your hand, exile all cards from target opponent's hand.\nWhen this creature leaves the battlefield, return the exiled cards to their owner's hand." });

const creature = (name: string, typeLine: string, cost: string, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, cost, { power: String(p), toughness: String(t), ...extra });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2, { cmc: 2, colors: ["G"] });
const hillGiant = () => creature("Hill Giant", "Creature — Giant", "{3}{R}", 3, 3, { cmc: 4, colors: ["R"] });
const study = () => card("Quick Study", "Sorcery", "{U}", { cmc: 1, colors: ["U"], oracleText: "Draw a card." });
const doom = () => card("Test Doom", "Instant", "{B}", { cmc: 1, colors: ["B"], oracleText: "Destroy target creature." });
const shock = () => card("Test Shock", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Test Shock deals 2 damage to any target." });

describe("Lane B round 40", () => {
  it("compiles every card fully", () => {
    supported(mindMaggots(), cragganwickCremator(), revivingVapors(), soldeviSage(), castingOfBones(), krovikanSorcerer(), heightenedAwareness());
    supported(malevolentNoble(), gaeasBalance(), rhysticScrying(), soulStrings(), rhysticLightning());
    supported(monsoon(), winterBlast(), tributeToUrborg(), gruesomeDiscovery(), druidOfHorns(), timeElemental(), contempt(), hypnox());
    supported(greenBear(), hillGiant(), study(), shock());
  });
});

describe("Discards that count", () => {
  it("Mind Maggots: discard any number of creature cards, two +1/+1 counters for each", () => {
    const { s: s0, ap, ids } = setup([mindMaggots()]);
    onlyHand(s0, ap, ids);
    const a = toZone(s0, ap, greenBear(), "hand");
    const b = toZone(s0, ap, hillGiant(), "hand");
    const c = toZone(s0, ap, study(), "hand");
    let s = settle(castNow(s0, ap, ids[0]!), at("discard", ap));
    expect(s.pending?.kind === "discard" && [s.pending.upTo, s.pending.filter?.text]).toEqual([true, "creature card"]);
    s = settle(discard(s, ap, [a, b]));
    expect([zone(s, a), zone(s, b), zone(s, c), pt(s, ids[0]!)]).toEqual(["graveyard", "graveyard", "hand", "6/6"]);
  });

  it("Mind Maggots: none is fine (rulings), and a noncreature card can't be discarded", () => {
    const { s: s0, ap, ids } = setup([mindMaggots()]);
    onlyHand(s0, ap, ids);
    const c = toZone(s0, ap, study(), "hand");
    const a = toZone(s0, ap, greenBear(), "hand");
    let s = settle(castNow(s0, ap, ids[0]!), at("discard", ap));
    expect(() => discard(s, ap, [c])).toThrow();
    s = settle(discard(s, ap, []));
    expect([zone(s, a), zone(s, c), pt(s, ids[0]!)]).toEqual(["hand", "hand", "2/2"]);
  });

  it("Cragganwick Cremator: a creature card discarded at random deals its power to the target player", () => {
    const { s: s0, ap, ids, opp } = setup([cragganwickCremator()]);
    onlyHand(s0, ap, ids);
    const giant = toZone(s0, ap, hillGiant(), "hand");
    let s = castNow(s0, ap, ids[0]!);
    s = settle(s, (x) => x.pending?.kind === "chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [ply(opp)] }));
    expect([zone(s, giant), life(s, opp)]).toEqual(["graveyard", 37]);
  });

  it("Cragganwick Cremator: a noncreature card discarded deals nothing, and an empty hand discards nothing", () => {
    const { s: s0, ap, ids, opp } = setup([cragganwickCremator()]);
    onlyHand(s0, ap, ids);
    const st = toZone(s0, ap, study(), "hand");
    let s = settle(castNow(s0, ap, ids[0]!), (x) => x.pending?.kind === "chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [ply(opp)] }));
    expect([zone(s, st), life(s, opp)]).toEqual(["graveyard", 40]);

    const { s: t0, ap: ap2, ids: ids2, opp: opp2 } = setup([cragganwickCremator()]);
    onlyHand(t0, ap2, ids2);
    let t = settle(castNow(t0, ap2, ids2[0]!), (x) => x.pending?.kind === "chooseTargets");
    t = settle(act(t, { type: "chooseTargets", player: ap2, targets: [ply(opp2)] }));
    expect([t.players[ap2]!.graveyard.length, life(t, opp2)]).toEqual([0, 40]);
  });
});

describe("Reviving Vapors", () => {
  it("one of the top three into your hand, life equal to its mana value, the other two into the graveyard", () => {
    const { s: s0, ap, ids } = setup([revivingVapors()]);
    const a = toZone(s0, ap, greenBear(), "library");
    const b = toZone(s0, ap, hillGiant(), "library");
    const c = toZone(s0, ap, study(), "library");
    let s = settle(castNow(s0, ap, ids[0]!), at("searchLibrary", ap));
    expect(s.pending?.kind === "searchLibrary" && [s.pending.min, s.pending.max, [...s.pending.cards].sort()]).toEqual([1, 1, [a, b, c].sort()]);
    s = settle(find(s, ap, [b]));
    expect([zone(s, a), zone(s, b), zone(s, c), life(s, ap)]).toEqual(["graveyard", "hand", "graveyard", 44]);
  });
});

describe("Soldevi Sage", () => {
  it("draw three cards, then discard one of them: only one of the three just drawn", () => {
    const { s: s0, ap } = setup([]);
    const sage = putOnBattlefield(s0, ap, soldeviSage());
    const a = toZone(s0, ap, greenBear(), "library");
    const b = toZone(s0, ap, hillGiant(), "library");
    const c = toZone(s0, ap, study(), "library");
    const old = s0.players[ap]!.hand[0]!;
    const lands = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.name === "Island").slice(0, 2);
    let s = run(s0, planActivate(s0, ap, sage, 0, [], undefined, undefined, undefined, { sacrifice: lands }));
    expect(lands.map((id) => zone(s, id))).toEqual(["graveyard", "graveyard"]);
    s = settle(s, at("discard", ap));
    expect(s.pending?.kind === "discard" && [s.pending.count, [...(s.pending.among ?? [])].sort()]).toEqual([1, [a, b, c].sort()]);
    expect(() => discard(s, ap, [old])).toThrow();
    s = settle(discard(s, ap, [b]));
    expect([zone(s, a), zone(s, b), zone(s, c), zone(s, old)]).toEqual(["hand", "graveyard", "hand", "hand"]);
  });

  it("the bot discards one of the cards it just drew", () => {
    const { s: s0, ap } = setup([]);
    const sage = putOnBattlefield(s0, ap, soldeviSage());
    const drawn = [greenBear(), hillGiant(), study()].map((d) => toZone(s0, ap, d, "library"));
    const lands = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.name === "Island").slice(0, 2);
    const before = [...s0.players[ap]!.hand];
    const s = settle(run(s0, planActivate(s0, ap, sage, 0, [], undefined, undefined, undefined, { sacrifice: lands })));
    expect(drawn.filter((id) => zone(s, id) === "graveyard").length).toBe(1);
    expect(before.every((id) => zone(s, id) === "hand")).toBe(true);
  });
});

describe("Heightened Awareness", () => {
  it("as it enters, you discard your hand; it's on the battlefield after", () => {
    const { s: s0, ap, ids } = setup([heightenedAwareness()]);
    const hand = s0.players[ap]!.hand.filter((id) => id !== ids[0]);
    expect(hand.length).toBeGreaterThan(0);
    const s = settle(castNow(s0, ap, ids[0]!));
    expect([zone(s, ids[0]!), s.players[ap]!.hand.length, hand.every((id) => zone(s, id) === "graveyard")]).toEqual(["battlefield", 0, true]);
  });
});

describe("Casting of Bones", () => {
  it("when the enchanted creature dies, draw three cards, then discard one of them", () => {
    const { s: s0, ap, ids } = setup([castingOfBones(), doom()]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    const drawn = [greenBear(), hillGiant(), study()].map((d) => toZone(s0, ap, d, "library"));
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(bear)]));
    s = castNow(s, ap, ids[1]!, [tgt(bear)]);
    s = settle(s, at("discard", ap));
    expect(s.pending?.kind === "discard" && [...(s.pending.among ?? [])].sort()).toEqual([...drawn].sort());
    s = settle(discard(s, ap, [drawn[0]!]));
    expect(drawn.map((id) => zone(s, id))).toEqual(["graveyard", "hand", "hand"]);
  });
});

describe("Malevolent Noble", () => {
  it("sacrifice an artifact or another creature: a +1/+1 counter; not itself", () => {
    const { s: s0, ap } = setup([]);
    const noble = putOnBattlefield(s0, ap, malevolentNoble());
    const bear = putOnBattlefield(s0, ap, greenBear());
    const rock = putOnBattlefield(s0, ap, card("Test Rock", "Artifact", "{1}", { cmc: 1, colors: [] }));
    expect(planActivate(s0, ap, noble, 0, [], undefined, undefined, undefined, { sacrifice: [noble] })).toBeNull();
    let s = settle(run(s0, planActivate(s0, ap, noble, 0, [], undefined, undefined, undefined, { sacrifice: [rock] })));
    s = settle(run(s, planActivate(s, ap, noble, 0, [], undefined, undefined, undefined, { sacrifice: [bear] })));
    expect([zone(s, rock), zone(s, bear), pt(s, noble)]).toEqual(["graveyard", "graveyard", "4/4"]);
  });
});

describe("Gaea's Balance", () => {
  it("a land card of each basic land type onto the battlefield, a dual land counting as only one of its types", () => {
    const { s: s0, ap, ids } = setup([gaeasBalance()]);
    const lib = (name: string, sub: string) => toZone(s0, ap, card(name, `Land — ${sub}`), "library");
    const [pl, is, sw, dual] = [lib("Lib Plains", "Plains"), lib("Lib Island", "Island"), lib("Lib Swamp", "Swamp"), lib("Lib Ground", "Mountain Forest")];
    const forestCard = s0.players[ap]!.library.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Forest")!;
    const mine = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap);
    const byName = (n: string) => mine.filter((id) => s0.cards[s0.objects[id]!.cardId]!.name === n);
    const sacs = [...byName("Swamp").slice(0, 2), ...byName("Plains")];
    let s = castNow(s0, ap, ids[0]!, [], { sacrifice: sacs });
    expect(sacs.map((id) => zone(s, id))).toEqual(Array(5).fill("graveyard"));
    s = settle(s, at("searchLibrary", ap));
    const forest2 = s.players[ap]!.library.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest" && id !== forestCard)!;
    expect(() => find(s, ap, [dual, forestCard, forest2])).toThrow(); // the dual land is the Mountain or the Forest, not both
    s = settle(find(s, ap, [pl, is, sw, dual, forestCard]));
    expect([pl, is, sw, dual, forestCard].map((id) => zone(s, id))).toEqual(Array(5).fill("battlefield"));
  });
});

describe("Rhystic cards", () => {
  it("Rhystic Lightning: 4 damage when its controller can't pay {2}", () => {
    const { s: s0, ap, ids, opp } = setup([rhysticLightning()]);
    const giant = putOnBattlefield(s0, opp, creature("Big Giant", "Creature — Giant", "{4}{R}", 5, 5, { cmc: 5, colors: ["R"] }));
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(giant)]));
    expect(s.objects[giant]!.damage).toBe(4);
  });

  it("Rhystic Lightning: 2 damage to the player who pays {2}", () => {
    const { s: s0, ap, ids, opp } = setup([rhysticLightning()]);
    s0.players[opp]!.manaPool.C = 2;
    let s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]), (x) => x.pending?.kind === "chooseOption" && x.pending.player === opp);
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("punisher");
    s = settle(act(s, { type: "chooseOption", player: opp, choice: "0" }));
    expect([life(s, opp), s.players[opp]!.manaPool.C ?? 0]).toEqual([38, 0]);
  });

  it("Rhystic Scrying: draw three; if any player pays {2}, discard three", () => {
    const { s: s0, ap, ids, opp } = setup([rhysticScrying()]);
    onlyHand(s0, ap, ids);
    let s = settle(castNow(s0, ap, ids[0]!), (x) => x.pending?.kind === "chooseOption" && x.pending.player === opp);
    expect(s.players[ap]!.hand.length).toBe(3);
    s.players[opp]!.manaPool.C = 2;
    s = act(s, { type: "chooseOption", player: opp, choice: "0" });
    expect(s.pending?.kind).toBe("payUnless");
    s = settle(act(s, { type: "payUnless", player: opp, pay: true }));
    expect([s.players[ap]!.hand.length, s.players[ap]!.graveyard.filter((id) => s.cards[s.objects[id]!.cardId]!.name !== "Rhystic Scrying").length]).toEqual([0, 3]);
  });

  it("Soul Strings: two creature cards back unless any player pays {X}", () => {
    const { s: s0, ap, ids } = setup([soulStrings()]);
    const a = toZone(s0, ap, greenBear(), "graveyard");
    const b = toZone(s0, ap, hillGiant(), "graveyard");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(a), tgt(b)], undefined, undefined, 3)));
    expect([zone(s, a), zone(s, b)]).toEqual(["hand", "hand"]); // nobody else has mana to pay {3}
  });
});

describe("Monsoon", () => {
  it("at each player's end step, taps their untapped Islands and deals that much damage to them", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, monsoon());
    const islands = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.name === "Island");
    s0.objects[islands[0]!]!.tapped = true; // already tapped: not tapped this way
    const turn = s0.turn;
    const s = goUntil(s0, (x) => x.step === "end" && !x.stack.length && !x.triggerQueue.length && x.log.some((l) => /Monsoon/.test(l.text) && l.turn === turn));
    expect([life(s, ap), islands.every((id) => s.objects[id]!.tapped)]).toEqual([38, true]);
  });

  it("no damage to a player with no untapped Islands", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, monsoon());
    for (const id of s0.battlefield) if (s0.cards[s0.objects[id]!.cardId]!.name === "Island") s0.objects[id]!.tapped = true;
    const turn = s0.turn;
    const s = goUntil(s0, (x) => x.turn > turn);
    expect(life(s, ap)).toBe(40);
  });
});

describe("Winter Blast", () => {
  it("taps X target creatures and deals 2 damage to each of those with flying", () => {
    const { s: s0, ap, ids, opp } = setup([winterBlast()]);
    const flyer = putOnBattlefield(s0, opp, creature("Sky Hawk", "Creature — Bird", "{1}{W}", 2, 2, { cmc: 2, colors: ["W"], keywords: ["Flying"], oracleText: "Flying" }));
    const walker = putOnBattlefield(s0, opp, hillGiant());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(flyer), tgt(walker)], undefined, undefined, 2)));
    expect([s.objects[walker]!.tapped, s.objects[walker]!.damage ?? 0, zone(s, flyer)]).toEqual([true, 0, "graveyard"]);
  });
});

describe("Tribute to Urborg", () => {
  it("-2/-2, and kicked an additional -1/-1 for each instant and sorcery card in your graveyard", () => {
    const { s: s0, ap, ids, opp } = setup([tributeToUrborg(), tributeToUrborg()]);
    toZone(s0, ap, study(), "graveyard");
    toZone(s0, ap, shock(), "graveyard");
    toZone(s0, ap, greenBear(), "graveyard");
    const big = putOnBattlefield(s0, opp, creature("Big Giant", "Creature — Giant", "{4}{R}", 8, 8, { cmc: 5, colors: ["R"] }));
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(big)]));
    expect(pt(s, big)).toBe("6/6");
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(big)], undefined, undefined, undefined, { kicks: [0] })));
    // The first Tribute is in the graveyard too now: three instants and sorceries.
    expect(pt(s, big)).toBe("1/1");
  });
});

describe("Gruesome Discovery", () => {
  it("without a creature dying this turn, the player discards two cards of their choice", () => {
    const { s: s0, ap, ids, opp } = setup([gruesomeDiscovery()]);
    const before = s0.players[opp]!.hand.length;
    const s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]));
    expect(s.players[opp]!.hand.length).toBe(before - 2);
  });

  it("morbid: you see their hand and choose the two cards", () => {
    const { s: s0, ap, ids, opp } = setup([doom(), gruesomeDiscovery()]);
    const bear = putOnBattlefield(s0, opp, greenBear());
    s0.players[ap]!.manaPool.B = 1;
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(bear)]));
    const hand = [...s.players[opp]!.hand];
    s = settle(castNow(s, ap, ids[1]!, [ply(opp)]), at("searchLibrary", ap));
    expect(s.pending?.kind === "searchLibrary" && [s.pending.min, s.pending.max]).toEqual([2, 2]);
    s = settle(find(s, ap, hand.slice(0, 2)));
    expect([zone(s, hand[0]!), zone(s, hand[1]!), s.players[opp]!.hand.length]).toEqual(["graveyard", "graveyard", hand.length - 2]);
  });
});

describe("Druid of Horns", () => {
  it("an Aura spell you cast that targets it makes a 3/3 Beast; another spell doesn't", () => {
    const { s: s0, ap, ids } = setup([castingOfBones(), card("Giant Growth Test", "Instant", "{G}", { cmc: 1, colors: ["G"], oracleText: "Target creature gets +3/+3 until end of turn." })]);
    const druid = putOnBattlefield(s0, ap, druidOfHorns());
    let s = settle(castNow(s0, ap, ids[1]!, [tgt(druid)]));
    expect(mine(s, ap, "Beast").length).toBe(0);
    s = settle(castNow(s, ap, ids[0]!, [tgt(druid)]));
    expect(mine(s, ap, "Beast").map((id) => pt(s, id))).toEqual(["3/3"]);
  });
});

describe("At end of combat", () => {
  const afterCombat = (s: GameState) => goUntil(s, (x) => x.step === "main2" && !x.stack.length && !x.triggerQueue.length && !x.pending);

  it("Time Elemental: after it attacks, it's sacrificed at end of combat and deals 5 damage to you", () => {
    const { s: s0, ap, opp } = setup([]);
    const te = putOnBattlefield(s0, ap, timeElemental());
    let s = attackWith(s0, [te], opp);
    expect(zone(s, te)).toBe("battlefield");
    s = afterCombat(s);
    expect([zone(s, te), life(s, ap)]).toEqual(["graveyard", 35]);
  });

  it("Time Elemental: the 5 damage still happens if it's gone by then (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([doom()]);
    const te = putOnBattlefield(s0, ap, timeElemental());
    s0.players[ap]!.manaPool.B = 1;
    let s = attackWith(s0, [te], opp);
    s = settle(castNow(s, ap, ids[0]!, [tgt(te)]));
    expect(zone(s, te)).toBe("graveyard");
    s = afterCombat(s);
    expect(life(s, ap)).toBe(35);
  });

  it("Contempt: the creature it enchants attacks, and both go back to their owners' hands at end of combat", () => {
    const { s: s0, ap, ids, opp } = setup([contempt()]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(bear)]));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(bear);
    s = attackWith(s, [bear], opp);
    expect(zone(s, bear)).toBe("battlefield");
    s = afterCombat(s);
    expect([zone(s, bear), zone(s, ids[0]!), life(s, opp)]).toEqual(["hand", "hand", 38]);
  });

  it("Contempt: if the creature dies first, the Aura goes to the graveyard and stays there", () => {
    const { s: s0, ap, ids, opp } = setup([contempt(), doom()]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    s0.players[ap]!.manaPool.B = 1;
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(bear)]));
    s = attackWith(s, [bear], opp);
    s = settle(castNow(s, ap, ids[1]!, [tgt(bear)]));
    // The Aura goes to the graveyard with nothing to enchant (CR 704.5m): it's a new object there and stays (CR 400.7).
    expect(zone(s, ids[0]!)).toBe("graveyard");
    s = afterCombat(s);
    expect([zone(s, bear), zone(s, ids[0]!)]).toEqual(["graveyard", "graveyard"]);
  });
});

describe("Hypnox", () => {
  it("cast from your hand, it exiles the opponent's hand; when it leaves, the cards go back", () => {
    const { s: s0, ap, ids } = setup([hypnox(), doom()]);
    Object.assign(s0.players[ap]!.manaPool, { B: 4 });
    const hands = s0.players.map((p) => [...p.hand]);
    let s = settle(castNow(s0, ap, ids[0]!));
    // The opponent it targeted (the bot's pick): their whole hand is in exile.
    const victim = s.players.findIndex((p, i) => i !== ap && !p.hand.length) as PlayerId;
    const hand = hands[victim]!;
    expect([victim >= 0, hand.length > 0, hand.every((id) => zone(s, id) === "exile")]).toEqual([true, true, true]);
    s = settle(castNow(s, ap, ids[1]!, [tgt(ids[0]!)]));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(hand.every((id) => zone(s, id) === "hand" && s.players[victim]!.hand.includes(id))).toBe(true);
  });

  it("put onto the battlefield without being cast, it exiles nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    const before = s0.players[opp]!.hand.length;
    putOnBattlefield(s0, ap, hypnox());
    const s = settle(s0);
    expect(s.players[opp]!.hand.length).toBe(before);
  });
});
