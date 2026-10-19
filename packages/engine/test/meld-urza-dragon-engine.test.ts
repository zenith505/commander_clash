// The last meld pairs: Urza, Lord Protector and The Mightstone and Weakstone meld into Urza, Planeswalker, whose loyalty
// abilities can be activated twice each turn (CR 606.3, rulings) and whose +2 makes spells cheaper this turn (CR 601.2f);
// Phyrexian Dragon Engine's "when this creature enters from your graveyard" (CR 603.6a), with unearth.

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, compileCard, defOf, isFullySupported, manaValue, moveObject, planActivate, planCast, registerMeldResults, spellCost, waitingOn, type Action, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall), with the meld pairs as the card data has them.
const URZA = { meld: { parts: ["The Mightstone and Weakstone", "Urza, Lord Protector"], result: "Urza, Planeswalker" } };
const lordProtector = card("Urza, Lord Protector", "Legendary Creature — Human Artificer", "{1}{W}{U}", {
  power: "2",
  toughness: "4",
  cmc: 3,
  oracleText:
    "Artifact, instant, and sorcery spells you cast cost {1} less to cast.\n{7}: If you both own and control Urza, Lord Protector and an artifact named The Mightstone and Weakstone, exile them, then meld them into Urza, Planeswalker. Activate only as a sorcery.",
  ...URZA,
});
const stones = card("The Mightstone and Weakstone", "Legendary Artifact — Powerstone", "{5}", {
  cmc: 5,
  oracleText:
    "When The Mightstone and Weakstone enters, choose one —\n• Draw two cards.\n• Target creature gets -5/-5 until end of turn.\n{T}: Add {C}{C}. This mana can't be spent to cast nonartifact spells.\n(Melds with Urza, Lord Protector.)",
  ...URZA,
});
const planeswalker = card("Urza, Planeswalker", "Legendary Planeswalker — Urza", "", {
  cmc: 8,
  colors: ["W", "U"],
  loyalty: "7",
  oracleText:
    "You may activate the loyalty abilities of Urza twice each turn rather than only once.\n+2: Artifact, instant, and sorcery spells you cast this turn cost {2} less to cast. You gain 2 life.\n+1: Draw two cards, then discard a card.\n0: Create two 1/1 colorless Soldier artifact creature tokens.\n−3: Exile target nonland permanent.\n−10: Artifacts and planeswalkers you control gain indestructible until end of turn. Destroy all nonland permanents.",
  ...URZA,
});
const MISHRA = { meld: { parts: ["Mishra, Claimed by Gix", "Phyrexian Dragon Engine"], result: "Mishra, Lost to Phyrexia" } };
const engine = card("Phyrexian Dragon Engine", "Artifact Creature — Phyrexian Dragon", "{3}", {
  power: "2",
  toughness: "2",
  cmc: 3,
  keywords: ["Double strike", "Unearth"],
  oracleText: "Double strike\nWhen this creature enters from your graveyard, you may discard your hand. If you do, draw three cards.\nUnearth {3}{R}{R}\n(Melds with Mishra, Claimed by Gix.)",
  ...MISHRA,
});
const lost = card("Mishra, Lost to Phyrexia", "Legendary Artifact Creature — Phyrexian Artificer", "", {
  power: "9",
  toughness: "9",
  cmc: 7,
  colors: ["B", "R"],
  oracleText:
    "Whenever Mishra enters or attacks, choose three —\n• Target opponent discards two cards.\n• Mishra deals 3 damage to any target.\n• Destroy target artifact or planeswalker.\n• Creatures you control gain menace and trample until end of turn.\n• Creatures you don't control get -1/-1 until end of turn.\n• Create two tapped Powerstone tokens.",
  ...MISHRA,
});
registerMeldResults([planeswalker, lost]);
const oath = card("Oath of Teferi", "Legendary Enchantment", "{3}{W}{U}", {
  cmc: 5,
  oracleText:
    "When Oath of Teferi enters, exile another target permanent you control. Return it to the battlefield under its owner's control at the beginning of the next end step.\nYou may activate the loyalty abilities of planeswalkers you control twice each turn rather than only once.",
});
const walker = card("Test Walker", "Legendary Planeswalker — Test", "{3}", { cmc: 3, loyalty: "4", oracleText: "+1: You gain 1 life.\n−1: Draw a card." });
const divination = card("Divination", "Sorcery", "{2}{U}", { cmc: 3, oracleText: "Draw two cards." });
const triarch = card("Triarch Praetorian", "Artifact Creature — Necron", "{4}{B}", {
  power: "4",
  toughness: "3",
  cmc: 5,
  keywords: ["Flying", "Unearth"],
  oracleText: "Flying\nDynastic Codes — When this creature enters from a graveyard, you draw two cards and you lose 2 life.\nUnearth {4}{B}",
});

const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return settle(s);
};
/** What casting it costs now, in mana value: generic and colored together. */
const costNow = (s: GameState, pid: PlayerId, id: string) => {
  const c = spellCost(s, pid, s.objects[id]!);
  return manaValue(c.cost) + c.extra;
};
const toGraveyard = (s: GameState, pid: PlayerId, id: string) => {
  const p = s.players[pid]!;
  p.hand.splice(p.hand.indexOf(id), 1);
  p.graveyard.push(id);
  s.objects[id]!.zone = "graveyard";
};

describe("Urza, Lord Protector and The Mightstone and Weakstone (CR 701.42)", () => {
  it("supports Urza, Lord Protector now that Urza, Planeswalker is supported; Oath of Teferi too", () => {
    for (const d of [lordProtector, stones, oath, engine, triarch]) expect(isFullySupported(d), d.name).toBe(true);
    expect(compileCard(planeswalker).unsupported).toEqual([]);
    expect(compileCard(planeswalker).loyaltyTwice).toBe("self");
    expect(compileCard(oath).loyaltyTwice).toBe("yours");
  });

  it("melds into Urza, Planeswalker with 7 loyalty; two loyalty abilities each turn, and the +2 makes spells cheaper this turn", () => {
    const { s: s0, ap, ids } = setup([divination, divination]);
    const urza = putOnBattlefield(s0, ap, lordProtector);
    const stone = putOnBattlefield(s0, ap, stones);
    const index = compileCard(lordProtector).activated.findIndex((a) => /meld/.test(a.body.text));
    let s = run(s0, planActivate(s0, ap, urza, index));
    const o = s.objects[urza]!;
    expect(defOf(s, o).name).toBe("Urza, Planeswalker");
    expect(s.objects[stone]!.zone).toBe("merged");
    expect(o.counters.loyalty).toBe(7);
    // Divination costs {2}{U}; Urza, Lord Protector is gone, so nothing makes it cheaper yet.
    expect(costNow(s, ap, ids[0]!)).toBe(3);
    const life = s.players[ap]!.life;
    s = run(s, planActivate(s, ap, urza, 0));
    expect(s.players[ap]!.life).toBe(life + 2);
    expect(s.objects[urza]!.counters.loyalty).toBe(9);
    // "Artifact, instant, and sorcery spells you cast this turn cost {2} less": only generic mana comes off.
    expect(costNow(s, ap, ids[0]!)).toBe(1);
    // Twice each turn: the same ability again, then no more.
    s = run(s, planActivate(s, ap, urza, 0));
    expect(s.objects[urza]!.counters.loyalty).toBe(11);
    expect(costNow(s, ap, ids[0]!)).toBe(1);
    expect(abilityProblem(s, ap, urza, 1)).toMatch(/two loyalty abilities of Urza, Planeswalker were already activated this turn/);
    // The reduction is for the spells its controller casts.
    const opp = s.turnOrder.find((p) => p !== ap)!;
    expect(s.costModsThisTurn?.every((m) => m.player === ap)).toBe(true);
    expect(s.costModsThisTurn?.some((m) => m.player === opp)).toBe(false);
    s = run(s, planCast(s, ap, ids[0]!));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("other planeswalkers still activate one loyalty ability each turn, two with Oath of Teferi", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, walker);
    s0.objects[w]!.counters.loyalty = 4;
    let s = run(s0, planActivate(s0, ap, w, 0));
    expect(abilityProblem(s, ap, w, 1)).toMatch(/a loyalty ability of Test Walker was already activated this turn/);
    putOnBattlefield(s, ap, oath);
    expect(abilityProblem(s, ap, w, 1)).toBeNull();
    s = run(s, planActivate(s, ap, w, 1));
    expect(s.objects[w]!.counters.loyalty).toBe(4);
    expect(abilityProblem(s, ap, w, 0)).toMatch(/two loyalty abilities/);
  });
});

describe("\"When ~ enters from a graveyard\" (CR 603.6a)", () => {
  it("Phyrexian Dragon Engine unearthed: may discard its controller's hand to draw three", () => {
    const { s: s0, ap, ids } = setup([engine, divination, divination]);
    toGraveyard(s0, ap, ids[0]!);
    const unearth = compileCard(engine).activated.findIndex((a) => a.zone === "graveyard");
    let s = s0;
    for (const a of planActivate(s, ap, ids[0]!, unearth)!) s = act(s, a);
    s = settle(s);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.players[ap]!.hand.length).toBe(3);
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
  });

  it("with an empty hand, discarding it still counts: draw three (rulings on Moonveil Regent)", () => {
    const { s: s0, ap, ids } = setup([engine]);
    toGraveyard(s0, ap, ids[0]!);
    for (const id of s0.players[ap]!.hand) s0.objects[id]!.zone = "library";
    s0.players[ap]!.library.unshift(...s0.players[ap]!.hand.splice(0));
    const unearth = compileCard(engine).activated.findIndex((a) => a.zone === "graveyard");
    let s = run(s0, planActivate(s0, ap, ids[0]!, unearth));
    expect(s.players[ap]!.hand.length).toBe(0);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.players[ap]!.hand.length).toBe(3);
  });

  it("cast from the hand, it doesn't trigger", () => {
    const { s: s0, ap, ids } = setup([engine, divination]);
    const s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.hand).toContain(ids[1]);
  });

  it("\"from your graveyard\" is its owner's: under an opponent's control it doesn't trigger; \"from a graveyard\" does", () => {
    const { s: s0, ap, ids, opp } = setup([engine, triarch]);
    toGraveyard(s0, ap, ids[0]!);
    toGraveyard(s0, ap, ids[1]!);
    const s = structuredClone(s0);
    const hand = s.players[opp]!.hand.length;
    moveObject(s, ids[0]!, "battlefield", { controller: opp });
    moveObject(s, ids[1]!, "battlefield", { controller: opp });
    const t = settle(s);
    expect(t.objects[ids[0]!]!.controller).toBe(opp);
    // Triarch Praetorian's "from a graveyard": its controller draws two and loses 2 life; the Engine asks nothing.
    expect(t.pending).toBeNull();
    expect(t.players[opp]!.hand.length).toBe(hand + 2);
  });

});
