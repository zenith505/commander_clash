// What a life swap's difference does next (Mister Negative, Profane Transfusion, Psychic Transfer; CR 701.12c), prevention
// only during your turn (Personal Sanctuary), "if ~ didn't attack this turn" (Air Nomad Student, Mad Dog, Erg Raiders),
// and ward costs that ask for mana and life, life equal to the creature's power, or a sacrifice (CR 702.21a).

import { describe, expect, it } from "vitest";
import { act, card, cast, passUntil, pt, putOnBattlefield, setup, swamp, target } from "./helpers";
import { isFullySupported, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const castAt = (s: GameState, pid: PlayerId, id: string, targets: Parameters<typeof planCast>[3]) => settle(planCast(s, pid, id, targets)!.reduce((x, a) => act(x, a), s));

// Real oracle text (Scryfall).
const negative = card("Mister Negative", "Legendary Creature — Human Villain", "{5}{W}{B}", { power: "5", toughness: "5", keywords: ["Vigilance", "Lifelink", "Darkforce Inversion"], oracleText: "Vigilance, lifelink\nDarkforce Inversion — When Mister Negative enters, you may exchange life totals with target opponent. If you lost life this way, draw that many cards." });
const transfusion = card("Profane Transfusion", "Sorcery", "{6}{B}{B}{B}", { oracleText: "Two target players exchange life totals. You create an X/X colorless Horror artifact creature token, where X is the difference between those players' life totals." });
const transfer = card("Psychic Transfer", "Sorcery", "{4}{U}", { oracleText: "If the difference between your life total and target player's life total is 5 or less, exchange life totals with that player." });
const sanctuary = card("Personal Sanctuary", "Enchantment", "{2}{W}", { oracleText: "During your turn, prevent all damage that would be dealt to you." });
const student = card("Air Nomad Student", "Creature — Human Monk", "{3}{W}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying\nAt the beginning of your end step, if this creature didn't attack this turn, put a +1/+1 counter on it." });
const madDog = card("Mad Dog", "Creature — Dog", "{1}{R}", { power: "2", toughness: "2", oracleText: "At the beginning of your end step, if this creature didn't attack or come under your control this turn, sacrifice it." });
const ergRaiders = card("Erg Raiders", "Creature — Human Warrior", "{1}{B}", { power: "2", toughness: "3", oracleText: "At the beginning of your end step, if this creature didn't attack this turn, it deals 2 damage to you unless it came under your control this turn." });
const gisa = card("Gisa, the Hellraiser", "Legendary Creature — Human Warlock", "{4}{B}{B}", { power: "4", toughness: "4", keywords: ["Ward"], oracleText: "Ward—{2}, Pay 2 life.\nSkeletons and Zombies you control get +1/+1 and have menace.\nWhenever you commit a crime, create two tapped 2/2 black Zombie Berserker creature tokens. This ability triggers only once each turn. (Targeting opponents, anything they control, and/or cards in their graveyards is a crime.)" });
const fleshgorger = card("Phyrexian Fleshgorger", "Creature — Phyrexian Wurm", "{5}{B}", { power: "7", toughness: "5", keywords: ["Ward", "Menace", "Lifelink", "Prototype"], oracleText: "Prototype {1}{B}{B} — 3/3 (You can cast this spell with different mana cost, color, and size. It keeps its abilities and types.)\nMenace, lifelink\nWard—Pay life equal to Phyrexian Fleshgorger's power." });
const veinRipper = card("Vein Ripper", "Creature — Vampire Assassin", "{3}{B}{B}{B}", { power: "6", toughness: "5", keywords: ["Flying", "Ward"], oracleText: "Flying\nWard—Sacrifice a creature.\nWhenever a creature dies, target opponent loses 2 life and you gain 2 life." });
const dreadsire = card("Ulamog's Dreadsire", "Creature — Eldrazi", "{10}", { power: "10", toughness: "10", keywords: ["Ward", "Vigilance"], oracleText: "Vigilance\nWard—Sacrifice a permanent with mana value 1 or greater.\n{T}: Create a 10/10 colorless Eldrazi creature token." });
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3", oracleText: "" });
const bears = card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2", oracleText: "" });

describe("what a life swap's difference does next", () => {
  it("compiles", () => supported(negative, transfusion, transfer, sanctuary, student, madDog, ergRaiders, gisa, fleshgorger, veinRipper, dreadsire));

  it("Mister Negative: you lose life to match the opponent, then draw that many cards", () => {
    const { s: s0, ap, ids, opp } = setup([negative]);
    s0.players[opp]!.life = 25;
    let s = cast(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.players[ap]!.life).toBe(25);
    expect(s.players[opp]!.life).toBe(40);
    expect(s.players[ap]!.hand.length).toBe(hand + 15);
  });

  it("Mister Negative: gaining life by the swap draws nothing", () => {
    const { s: s0, ap, ids, opp } = setup([negative]);
    s0.players[ap]!.life = 10;
    let s = cast(s0, ap, ids[0]!);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.players[ap]!.life).toBe(40);
    expect(s.players[opp]!.life).toBe(10);
    expect(s.players[ap]!.hand.length).toBe(hand);
  });

  it("Profane Transfusion: the Horror is X/X for the difference after the exchange", () => {
    const { s: s0, ap, ids, opp } = setup([transfusion]);
    putOnBattlefield(s0, ap, swamp);
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    s0.players[opp]!.life = 12;
    const s = castAt(s0, ap, ids[0]!, [{ kind: "player", id: opp }, { kind: "player", id: other }]);
    expect(s.players[opp]!.life).toBe(40);
    expect(s.players[other]!.life).toBe(12);
    const horror = s.battlefield.map((id) => s.objects[id]!).find((o) => s.cards[o.cardId]!.name.startsWith("Horror"));
    expect(horror).toBeDefined();
    expect(s.cards[horror!.cardId]!.types).toEqual(["Artifact", "Creature"]);
    expect(pt(s, horror!.id)).toBe("28/28");
  });

  it("Psychic Transfer swaps when the totals are 5 or less apart, as it resolves", () => {
    const { s: s0, ap, ids, opp } = setup([transfer]);
    s0.players[ap]!.life = 35;
    const s = castAt(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(s.players[ap]!.life).toBe(40);
    expect(s.players[opp]!.life).toBe(35);
  });

  it("Psychic Transfer does nothing when they're 6 apart", () => {
    const { s: s0, ap, ids, opp } = setup([transfer]);
    s0.players[ap]!.life = 34;
    const s = castAt(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(s.players[ap]!.life).toBe(34);
    expect(s.players[opp]!.life).toBe(40);
  });

  it("Psychic Transfer: exactly 5 apart is close enough", () => {
    const { s: s0, ap, ids, opp } = setup([transfer]);
    s0.players[ap]!.life = 1;
    s0.players[opp]!.life = 6;
    const s = castAt(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(s.players[ap]!.life).toBe(6);
    expect(s.players[opp]!.life).toBe(1);
  });
});

describe("Personal Sanctuary", () => {
  it("prevents damage to you during your turn only", () => {
    const { s: s0, ap, ids, opp } = setup([shock, shock]);
    putOnBattlefield(s0, opp, sanctuary);
    putOnBattlefield(s0, ap, sanctuary);
    // On ap's turn: Shock at the opponent hits, Shock at ap is prevented.
    let s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(s.players[opp]!.life).toBe(38);
    s = cast(s, ap, ids[1]!, [{ kind: "player", id: ap }]);
    expect(s.players[ap]!.life).toBe(40);
  });
});

describe("if ~ didn't attack this turn", () => {
  const toEnd = (s: GameState, ap: PlayerId) => settle(passUntil(s, "end", ap));

  it("Air Nomad Student gets a counter only on a turn it didn't attack", () => {
    const { s: s0, ap, opp } = setup([]);
    const idle = putOnBattlefield(s0, ap, student);
    const attacker = putOnBattlefield(s0, ap, student);
    const s = toEnd(act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker, defender: opp }] }), ap);
    expect(s.objects[idle]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[attacker]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Mad Dog is sacrificed unless it attacked or came under your control this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const idle = putOnBattlefield(s0, ap, madDog);
    const fresh = putOnBattlefield(s0, ap, madDog, { sick: true });
    const attacker = putOnBattlefield(s0, ap, madDog);
    const s = toEnd(act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker, defender: opp }] }), ap);
    expect(s.objects[idle]!.zone).toBe("graveyard");
    expect(s.objects[fresh]!.zone).toBe("battlefield");
    expect(s.objects[attacker]!.zone).toBe("battlefield");
  });

  it("Erg Raiders deals 2 damage to you if it didn't attack, unless it came under your control this turn", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, ergRaiders);
    putOnBattlefield(s0, ap, ergRaiders, { sick: true });
    const s = toEnd(s0, ap);
    expect(s.players[ap]!.life).toBe(38);
  });
});

describe("ward costs other than mana", () => {
  it("Gisa: ward asks for {2} and 2 life together", () => {
    const { s: s0, ap, ids, opp } = setup([murder]);
    const g = putOnBattlefield(s0, opp, gisa);
    const s = castAt(s0, ap, ids[0]!, [target(g)]);
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, cost: "{2}", life: 2 });
  });

  it("Phyrexian Fleshgorger: ward asks for life equal to its power", () => {
    const { s: s0, ap, ids, opp } = setup([murder]);
    const f = putOnBattlefield(s0, opp, fleshgorger);
    let s = castAt(s0, ap, ids[0]!, [target(f)]);
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, cost: "{0}", life: 7 });
    s = settle(act(s, { type: "payUnless", player: ap, pay: true }));
    expect(s.players[ap]!.life).toBe(33);
    expect(s.objects[f]!.zone).toBe("graveyard");
  });

  it("Vein Ripper: pay by sacrificing a creature of your choice, and the spell resolves", () => {
    const { s: s0, ap, ids, opp } = setup([murder]);
    const v = putOnBattlefield(s0, opp, veinRipper);
    const g = putOnBattlefield(s0, ap, giant);
    const b = putOnBattlefield(s0, ap, bears);
    let s = castAt(s0, ap, ids[0]!, [target(v)]);
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, sacrifice: { n: 1 } });
    s = act(s, { type: "payUnless", player: ap, pay: true });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "sacrifice", count: 1 });
    expect(s.pending?.kind === "pickPermanents" && [...s.pending.options].sort()).toEqual([g, b].sort());
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [b] }));
    // The Bears dying triggers Vein Ripper's own ability first.
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: opp });
    s = settle(act(s, { type: "chooseTargets", player: opp, targets: [{ kind: "player", id: ap }] }));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[g]!.zone).toBe("battlefield");
    expect(s.objects[v]!.zone).toBe("graveyard");
  });

  it("Vein Ripper: not paying counters the spell", () => {
    const { s: s0, ap, ids, opp } = setup([murder]);
    const v = putOnBattlefield(s0, opp, veinRipper);
    const b = putOnBattlefield(s0, ap, bears);
    let s = castAt(s0, ap, ids[0]!, [target(v)]);
    s = settle(act(s, { type: "payUnless", player: ap, pay: false }));
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[v]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("Vein Ripper: with no creature to sacrifice, the spell is countered without asking", () => {
    const { s: s0, ap, ids, opp } = setup([murder]);
    const v = putOnBattlefield(s0, opp, veinRipper);
    const s = castAt(s0, ap, ids[0]!, [target(v)]);
    expect(s.pending).toBeFalsy();
    expect(s.objects[v]!.zone).toBe("battlefield");
  });

  it("Ulamog's Dreadsire: a land (mana value 0) can't pay; with one other permanent, it's that one", () => {
    const { s: s0, ap, ids, opp } = setup([murder]);
    const d = putOnBattlefield(s0, opp, dreadsire);
    const b = putOnBattlefield(s0, ap, bears);
    let s = castAt(s0, ap, ids[0]!, [target(d)]);
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap });
    s = settle(act(s, { type: "payUnless", player: ap, pay: true }));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[d]!.zone).toBe("graveyard");
  });
});
