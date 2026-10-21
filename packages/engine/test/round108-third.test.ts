// Round 108, down the popularity list: Hero's Blade ("you may attach ~ to it"), Claim Jumper ("repeat this process
// once", one shuffle), Scheming Symmetry and Huddle Up (two target players), Sage's Reverie ("Aura you control that's
// attached to a creature"), Containment Construct (exile a discarded card, play it this turn), Wedding Ring, Arwen,
// Colossal Grave-Reaver ("put one of them onto the battlefield"), Multani and Quirion Ranger (returning lands as a cost),
// Kazuul ("if you're the defending player", "unless that creature's controller pays") and Phyrexian Obliterator
// ("whenever a source deals damage to ~": once for each source).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, forest, passUntil, plainsCard, putOnBattlefield, setup, target } from "./helpers";
import {
  characteristics,
  controllerOf,
  invalidateCharacteristics,
  isFullySupported,
  parseManaCost,
  planMana,
  planActivate,
  planCast,
  power,
  toughness,
  waitingOn,
  type CardDef,
  type GameState,
  type PlayerId,
} from "../src";

// Real oracle text (Scryfall).
const blade = card("Hero's Blade", "Artifact — Equipment", "{2}", {
  keywords: ["Equip"],
  oracleText: "Equipped creature gets +3/+2.\nWhenever a legendary creature you control enters, you may attach this Equipment to it.\nEquip {4} ({4}: Attach to target creature you control. Equip only as a sorcery.)",
});
const jumper = card("Claim Jumper", "Creature — Rabbit Mercenary", "{2}{W}", {
  power: "3",
  toughness: "3",
  keywords: ["Vigilance"],
  oracleText:
    "Vigilance\nWhen this creature enters, if an opponent controls more lands than you, you may search your library for a Plains card and put it onto the battlefield tapped. Then if an opponent controls more lands than you, repeat this process once. If you search your library this way, shuffle.",
});
const symmetry = card("Scheming Symmetry", "Sorcery", "{B}", {
  oracleText: "Choose two target players. Each of them searches their library for a card, then shuffles and puts that card on top.",
});
const huddle = card("Huddle Up", "Sorcery", "{2}{U}", { keywords: ["Assist"], oracleText: "Assist (Another player can pay up to {2} of this spell's cost.)\nTwo target players each draw a card." });
const reverie = card("Sage's Reverie", "Enchantment — Aura", "{3}{W}", {
  keywords: ["Enchant"],
  oracleText: "Enchant creature\nWhen this Aura enters, draw a card for each Aura you control that's attached to a creature.\nEnchanted creature gets +1/+1 for each Aura you control that's attached to a creature.",
});
const construct = card("Containment Construct", "Artifact Creature — Construct", "{2}", {
  power: "2",
  toughness: "1",
  oracleText: "Whenever you discard a card, you may exile that card from your graveyard. If you do, you may play that card this turn.",
});
const ring = card("Wedding Ring", "Artifact", "{2}{W}{W}", {
  oracleText:
    "When this artifact enters, if it was cast, target opponent creates a token that's a copy of it.\nWhenever an opponent who controls an artifact named Wedding Ring draws a card during their turn, you draw a card.\nWhenever an opponent who controls an artifact named Wedding Ring gains life during their turn, you gain that much life.",
});
const arwen = card("Arwen, Weaver of Hope", "Legendary Creature — Elf Noble", "{1}{G}{G}", {
  power: "2",
  toughness: "1",
  oracleText: "Each other creature you control enters with a number of additional +1/+1 counters on it equal to Arwen's toughness.",
});
const reaver = card("Colossal Grave-Reaver", "Creature — Dragon", "{6}{B}{G}", {
  power: "7",
  toughness: "6",
  keywords: ["Flying"],
  oracleText: "Flying\nWhenever this creature enters or attacks, mill three cards.\nWhenever one or more creature cards are put into your graveyard from your library, put one of them onto the battlefield.",
});
const multani = card("Multani, Yavimaya's Avatar", "Legendary Creature — Elemental Avatar", "{4}{G}{G}", {
  power: "0",
  toughness: "0",
  keywords: ["Reach", "Trample"],
  oracleText:
    "Reach, trample\nMultani gets +1/+1 for each land you control and each land card in your graveyard.\n{1}{G}, Return two lands you control to their owner's hand: Return this card from your graveyard to your hand.",
});
const ranger = card("Quirion Ranger", "Creature — Elf Ranger", "{G}", {
  power: "1",
  toughness: "1",
  oracleText: "Return a Forest you control to its owner's hand: Untap target creature. Activate only once each turn.",
});
const kazuul = card("Kazuul, Tyrant of the Cliffs", "Legendary Creature — Ogre Warrior", "{3}{R}{R}", {
  power: "5",
  toughness: "4",
  oracleText: "Whenever a creature an opponent controls attacks, if you're the defending player, create a 3/3 red Ogre creature token unless that creature's controller pays {3}.",
});
const obliterator = card("Phyrexian Obliterator", "Creature — Phyrexian Horror", "{B}{B}{B}{B}", {
  power: "5",
  toughness: "5",
  keywords: ["Trample"],
  oracleText: "Trample\nWhenever a source deals damage to this creature, that source's controller sacrifices that many permanents of their choice.",
});
// Test cards.
const legend = card("Test Legend", "Legendary Creature — Elf", "{2}{G}", { power: "2", toughness: "2" });
const charm = card("Test Charm", "Enchantment — Aura", "{W}", { keywords: ["Enchant"], oracleText: "Enchant creature" });
const loot = card("Test Loot", "Sorcery", "{U}", { oracleText: "Draw a card, then discard a card." });
const mill = card("Test Mill", "Sorcery", "{B}", { oracleText: "Mill three cards." });
const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." });
const balm = card("Test Balm", "Instant", "{W}", { oracleText: "You gain 3 life." });
const relic = card("Test Relic", "Artifact", "{1}");

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const named = (s: GameState, name: string) => s.battlefield.filter((id) => characteristics(s, s.objects[id]!).name === name);
const hand = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.length;
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;
const lands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).types.includes("Land")).length;
/** Put a card into its owner's graveyard straight from nowhere (a test shortcut). */
const inGraveyard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Put a card on top of its owner's library (a test shortcut). */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  invalidateCharacteristics(s);
  return id;
};
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};

describe("Hero's Blade", () => {
  it("a legendary creature of yours entering: you may attach it; a nonlegendary one doesn't trigger", () => {
    supported(blade);
    const { s: s0, ap, ids } = setup([legend, bear()]);
    let s = s0;
    const b = putOnBattlefield(s, ap, blade);
    s = settle(cast(s, ap, ids[1]!));
    expect(s.pending).toBeNull();
    s = settle(cast(s, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[b]!.attachedTo).toBe(ids[0]);
    expect(power(s, s.objects[ids[0]!]!)).toBe(5);
  });
});

describe("Claim Jumper", () => {
  it("searches twice while an opponent still has more lands, then shuffles once", () => {
    supported(jumper);
    const { s: s0, ap, ids, opp } = setup([jumper]);
    let s = s0;
    for (let i = 0; i < 17; i++) putOnBattlefield(s, opp, forest);
    const p1 = onTop(s, ap, plainsCard);
    const p2 = onTop(s, ap, plainsCard);
    s = settle(cast(s, ap, ids[0]!));
    const before = lands(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = act(s, { type: "searchLibrary", player: ap, found: [p1] });
    // Still behind (15 against 17): the process again.
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [p2] }));
    expect(lands(s, ap)).toBe(before + 2);
    for (const id of [p1, p2]) expect(s.objects[id]!.tapped).toBe(true);
    expect(s.log.filter((l) => /shuffles their library/.test(l.text))).toHaveLength(1);
  });

  it("no second search once you've caught up; declining both means no shuffle", () => {
    const { s: s0, ap, ids, opp } = setup([jumper, jumper]);
    let s = s0;
    for (let i = 0; i < 15; i++) putOnBattlefield(s, opp, forest);
    const p1 = onTop(s, ap, plainsCard);
    s = settle(cast(s, ap, ids[0]!));
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [p1] }));
    // 15 each now.
    expect(s.pending).toBeNull();
    expect(s.objects[p1]!.zone).toBe("battlefield");
    putOnBattlefield(s, opp, forest);
    s = settle(cast(s, ap, ids[1]!));
    const shuffles = s.log.filter((l) => /shuffles/.test(l.text)).length;
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    s = settle(s);
    if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.log.filter((l) => /shuffles/.test(l.text))).toHaveLength(shuffles);
  });
});

describe("two target players", () => {
  it("Scheming Symmetry: each of them, in turn order, finds a card and puts it on top after shuffling", () => {
    supported(symmetry, huddle);
    const { s: s0, ap, ids, opp } = setup([symmetry]);
    let s = s0;
    const mine = s.players[ap]!.library.at(-1)!;
    const theirs = s.players[opp]!.library.at(-1)!;
    expect(planCast(s, ap, ids[0]!, [{ kind: "player", id: ap }, { kind: "player", id: ap }])).toBeNull();
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: ap }, { kind: "player", id: opp }]));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = act(s, { type: "searchLibrary", player: ap, found: [mine] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp });
    s = settle(act(s, { type: "searchLibrary", player: opp, found: [theirs] }));
    expect(s.players[ap]!.library[0]).toBe(mine);
    expect(s.players[opp]!.library[0]).toBe(theirs);
  });

  it("Huddle Up: both draw", () => {
    const { s: s0, ap, ids, opp } = setup([huddle]);
    let s = s0;
    const [a, b] = [hand(s, ap), hand(s, opp)];
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: ap }, { kind: "player", id: opp }])));
    expect(hand(s, ap)).toBe(a); // the card cast, then one drawn
    expect(hand(s, opp)).toBe(b + 1);
  });
});

describe("Sage's Reverie", () => {
  it("counts your Auras attached to creatures: draws that many, and the enchanted creature gets that much", () => {
    supported(reverie);
    const { s: s0, ap, ids, opp } = setup([reverie]);
    let s = s0;
    const b = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    const c1 = putOnBattlefield(s, ap, charm);
    s.objects[c1]!.attachedTo = theirs; // yours, on their creature: it counts
    const loose = putOnBattlefield(s, opp, charm);
    s.objects[loose]!.attachedTo = b; // theirs: it doesn't
    invalidateCharacteristics(s);
    const before = hand(s, ap);
    s = settle(cast(s, ap, ids[0]!, [target(b)]));
    // Sage's Reverie and the charm on their bear.
    expect(hand(s, ap)).toBe(before - 1 + 2);
    expect(power(s, s.objects[b]!)).toBe(4);
    expect(toughness(s, s.objects[b]!)).toBe(4);
  });
});

describe("Containment Construct", () => {
  it("you may exile the discarded card, then play it this turn only", () => {
    supported(construct);
    const { s: s0, ap, ids } = setup([loot]);
    let s = s0;
    putOnBattlefield(s, ap, construct);
    const sh = inHand(s, ap, shock);
    s = settle(cast(s, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "discard", player: ap });
    s = settle(act(s, { type: "discard", player: ap, objectIds: [sh] }));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[sh]!.zone).toBe("exile");
    expect(planCast(s, ap, sh, [{ kind: "player", id: next(s, ap) }])).not.toBeNull();
    // No discard to hand size at cleanup (which would trigger it again): the extra cards go back to the library.
    for (const id of s.players[ap]!.hand.splice(0)) {
      s.objects[id]!.zone = "library";
      s.players[ap]!.library.push(id);
    }
    s = passUntil(s, "upkeep");
    expect(s.objects[sh]!.mayPlay).toBeUndefined();
  });
});

describe("Wedding Ring", () => {
  it("cast: the target opponent gets a copy; their draws and life gain on their own turn are yours too", () => {
    supported(ring);
    const { s: s0, ap, ids } = setup([ring]);
    let s = s0;
    const opp = next(s, ap);
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    expect(s.pending?.kind).toBe("chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    const rings = named(s, "Wedding Ring");
    expect(rings).toHaveLength(2);
    expect(rings.map((id) => controllerOf(s, s.objects[id]!)).sort()).toEqual([ap, opp].sort());
    // The token copy wasn't cast: no trigger of its own.
    expect(s.pending).toBeNull();
    // Their turn: their draw step draws me a card too.
    const mine = s.players[ap]!.library.length;
    s = settle(passUntil(s, "main1", opp));
    expect(s.players[ap]!.library.length).toBe(mine - 1);
    // Life gained on their turn.
    putOnBattlefield(s, opp, plainsCard);
    const balmId = inHand(s, opp, balm);
    const life = s.players[ap]!.life;
    s = settle(cast(s, opp, balmId));
    expect(s.players[ap]!.life).toBe(life + 3);
  });

  it("not on my own turn, and not for an opponent without one", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    putOnBattlefield(s, ap, ring);
    const opp = next(s, ap);
    const mine = s.players[ap]!.library.length;
    s = settle(passUntil(s, "main1", opp));
    expect(s.players[ap]!.library.length).toBe(mine);
    // With one of their own, it works both ways: my draw on my turn draws them a card.
    putOnBattlefield(s, opp, ring);
    const theirs = s.players[opp]!.library.length;
    s = settle(passUntil(s, "main1", ap));
    expect(s.players[opp]!.library.length).toBe(theirs - 1);
  });
});

describe("Arwen, Weaver of Hope", () => {
  it("other creatures of yours enter with counters equal to her toughness then", () => {
    supported(arwen);
    const { s: s0, ap, ids } = setup([bear(), bear()]);
    let s = s0;
    const a = putOnBattlefield(s, ap, arwen);
    s = settle(cast(s, ap, ids[0]!));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
    s.objects[a]!.counters["+1/+1"] = 2;
    invalidateCharacteristics(s);
    s = settle(cast(s, ap, ids[1]!));
    expect(s.objects[ids[1]!]!.counters["+1/+1"]).toBe(3);
    expect(s.objects[a]!.counters["+1/+1"]).toBe(2);
  });
});

describe("Colossal Grave-Reaver", () => {
  it("one or more creature cards milled: once, and you put one of them onto the battlefield", () => {
    supported(reaver);
    const { s: s0, ap, ids } = setup([mill]);
    let s = s0;
    putOnBattlefield(s, ap, reaver);
    const c1 = onTop(s, ap, bear({ name: "Bear One" }));
    const l = onTop(s, ap, forest);
    const c2 = onTop(s, ap, bear({ name: "Bear Two" }));
    const old = inGraveyard(s, ap, bear({ name: "Old Bear" }));
    s = settle(cast(s, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 1, max: 1 });
    expect([...(s.pending as { cards: string[] }).cards].sort()).toEqual([c1, c2].sort());
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [c2] }));
    expect(s.objects[c2]!.zone).toBe("battlefield");
    expect(s.objects[c1]!.zone).toBe("graveyard");
    expect(s.objects[l]!.zone).toBe("graveyard");
    expect(s.objects[old]!.zone).toBe("graveyard");
    expect(s.pending).toBeNull();
  });
});

describe("Multani and Quirion Ranger: returning lands as a cost", () => {
  it("Multani counts lands you control and land cards in your graveyard; from the graveyard it comes back for two lands", () => {
    supported(multani, ranger);
    const { s: s0, ap } = setup([]);
    let s = s0;
    const m = putOnBattlefield(s, ap, multani);
    inGraveyard(s, ap, forest);
    expect(power(s, s.objects[m]!)).toBe(15);
    s.battlefield.splice(s.battlefield.indexOf(m), 1);
    s.objects[m]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(m);
    invalidateCharacteristics(s);
    const plan = planActivate(s, ap, m, 0)!;
    expect(plan).not.toBeNull();
    const handBefore = hand(s, ap);
    const plains = s.battlefield.filter((id) => characteristics(s, s.objects[id]!).subtypes.includes("Plains")).slice(0, 2);
    s = settle(plan.reduce((x, a) => act(x, a.type === "activateAbility" ? { ...a, costs: { returnToHand: plains } } : a), s));
    expect(s.objects[m]!.zone).toBe("hand");
    // Two lands back to hand, and Multani.
    expect(hand(s, ap)).toBe(handBefore + 3);
  });

  it("Quirion Ranger: return a Forest to untap a creature, once each turn", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const r = putOnBattlefield(s, ap, ranger);
    const b = putOnBattlefield(s, ap, bear());
    s.objects[b]!.tapped = true;
    const forests = s.battlefield.filter((id) => characteristics(s, s.objects[id]!).subtypes.includes("Forest"));
    s = settle(act(s, { type: "activateAbility", player: ap, objectId: r, index: 0, targets: [target(b)], costs: { returnToHand: [forests[0]!] } }));
    expect(s.objects[b]!.tapped).toBe(false);
    expect(s.objects[forests[0]!]!.zone).toBe("hand");
    expect(() => act(s, { type: "activateAbility", player: ap, objectId: r, index: 0, targets: [target(b)], costs: { returnToHand: [forests[1]!] } })).toThrow();
    // A non-Forest can't pay.
  });
});

describe("Kazuul, Tyrant of the Cliffs", () => {
  it("each creature attacking you: an Ogre unless its controller pays {3}; attacks elsewhere don't count", () => {
    supported(kazuul);
    const { s: s0, ap } = setup([]);
    let s = s0;
    const opp = next(s, ap);
    const other = next(s, opp);
    putOnBattlefield(s, ap, kazuul);
    const atk = [0, 1, 2].map((i) => putOnBattlefield(s, opp, bear({ name: `Bear ${i}` })));
    for (let i = 0; i < 3; i++) putOnBattlefield(s, opp, forest);
    s = passUntil(s, "upkeep", opp);
    s = act(passUntil(s, "declareAttackers", opp), { type: "declareAttackers", player: opp, attacks: [{ attacker: atk[0]!, defender: ap }, { attacker: atk[1]!, defender: ap }, { attacker: atk[2]!, defender: other }] });
    s = settle(s);
    // Two triggers: the first pays {3}, the second doesn't.
    expect(s.pending).toMatchObject({ kind: "payUnless", player: opp, cost: "{3}" });
    s = settle([...planMana(s, opp, parseManaCost("{3}"))!, { type: "payUnless" as const, player: opp, pay: true }].reduce((x, a) => act(x, a), s));
    expect(s.pending).toMatchObject({ kind: "payUnless", player: opp });
    s = settle(act(s, { type: "payUnless", player: opp, pay: false }));
    expect(s.pending).toBeNull();
    expect(named(s, "Ogre Token")).toHaveLength(1);
  });
});

describe("Phyrexian Obliterator", () => {
  it("each source dealing it damage makes its controller sacrifice that many permanents", () => {
    supported(obliterator);
    const { s: s0, ap } = setup([]);
    let s = s0;
    const opp = next(s, ap);
    const o = putOnBattlefield(s, ap, obliterator);
    for (let i = 0; i < 3; i++) putOnBattlefield(s, opp, relic);
    putOnBattlefield(s, opp, card("Mountain", "Basic Land — Mountain"));
    const sh = inHand(s, opp, shock);
    s = passUntil(s, "upkeep", opp);
    s = settle(passUntil(s, "main1", opp));
    const before = s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === opp).length;
    s = settle(cast(s, opp, sh, [target(o)]));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: opp, count: 2 });
    const opts = (s.pending as { options: string[] }).options;
    s = settle(act(s, { type: "pickPermanents", player: opp, ids: opts.slice(0, 2) }));
    expect(s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === opp)).toHaveLength(before - 2);
    expect(s.objects[o]!.zone).toBe("battlefield");
  });
});
