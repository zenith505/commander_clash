// Round 109, more of round 108's list: Divine Visitation and Draconic Visitor (tokens created as other tokens instead, CR
// 614.1a, 616.1e), Tree of Perdition and Tree of Redemption (a life total exchanged with a toughness, CR 701.12g), Gift of
// Immortality (the Aura back at the next end step, attached to the creature it returned), Hellkite Courser (a commander
// put onto the battlefield from the command zone, back at the next end step), As Foretold, Rooftop Storm and Darksteel
// Monolith ("pay {0} rather than pay the mana cost", CR 118.9), Hostage Taker (exiled until it leaves, castable with mana
// of any type, CR 609.4b) and Winds of Abandon (each controller searches for a basic land for each creature exiled).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, forest, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { altCostsFor, castProblem, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const visitation = card("Divine Visitation", "Enchantment", "{3}{W}{W}", {
  oracleText: "If one or more creature tokens would be created under your control, that many 4/4 white Angel creature tokens with flying and vigilance are created instead.",
});
const visitor = card("Draconic Visitor", "Enchantment", "{3}{R}{R}", {
  oracleText: "If one or more artifact tokens would be created under your control, that many 5/5 red Dragon creature tokens with flying are created instead.",
});
const perdition = card("Tree of Perdition", "Creature — Plant", "{3}{B}", {
  power: "0",
  toughness: "13",
  keywords: ["Defender"],
  oracleText: "Defender\n{T}: Exchange target opponent's life total with Tree of Perdition's toughness.",
});
const redemption = card("Tree of Redemption", "Creature — Plant", "{3}{G}", {
  power: "0",
  toughness: "13",
  keywords: ["Defender"],
  oracleText: "Defender\n{T}: Exchange your life total with Tree of Redemption's toughness.",
});
const gift = card("Gift of Immortality", "Enchantment — Aura", "{2}{W}", {
  keywords: ["Enchant"],
  oracleText: "Enchant creature\nWhen enchanted creature dies, return that card to the battlefield under its owner's control. Return Gift of Immortality to the battlefield attached to that creature at the beginning of the next end step.",
});
const courser = card("Hellkite Courser", "Creature — Dragon", "{4}{R}{R}", {
  power: "6",
  toughness: "5",
  keywords: ["Flying"],
  oracleText: "Flying\nWhen Hellkite Courser enters, you may put a commander you own from the command zone onto the battlefield. It gains haste. Return it to the command zone at the beginning of the next end step.",
});
const foretold = card("As Foretold", "Enchantment", "{2}{U}", {
  oracleText:
    "At the beginning of your upkeep, put a time counter on As Foretold.\nOnce each turn, you may pay {0} rather than pay the mana cost for a spell you cast with mana value X or less, where X is the number of time counters on As Foretold.",
});
const rooftop = card("Rooftop Storm", "Enchantment", "{5}{U}", { oracleText: "You may pay {0} rather than pay the mana cost for Zombie creature spells you cast." });
const monolith = card("Darksteel Monolith", "Artifact", "{7}", { keywords: ["Indestructible"], oracleText: "Indestructible\nOnce each turn, you may pay {0} rather than pay the mana cost for a colorless spell you cast from your hand." });
const taker = card("Hostage Taker", "Creature — Human Pirate", "{2}{U}{B}", {
  power: "2",
  toughness: "3",
  oracleText:
    "When Hostage Taker enters, exile another target creature or artifact until Hostage Taker leaves the battlefield. You may cast that card for as long as it remains exiled, and mana of any type can be spent to cast that spell.",
});
const winds = card("Winds of Abandon", "Sorcery", "{1}{W}", {
  keywords: ["Overload"],
  oracleText:
    'Exile target creature you don\'t control. For each creature exiled this way, its controller searches their library for a basic land card. Those players put those cards onto the battlefield tapped, then shuffle.\nOverload {4}{W}{W} (You may cast this spell for its overload cost. If you do, change "target" in its text to "each.")',
});
// Test cards.
const raise = card("Test Raise", "Sorcery", "{1}{G}", { oracleText: "Create two 1/1 green Saproling creature tokens." });
const treasure = card("Test Treasure", "Sorcery", "{R}", { oracleText: "Create a Treasure token." });
const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." });
const zombie = card("Test Zombie", "Creature — Zombie", "{4}{B}", { power: "5", toughness: "5" });
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3" });
const big = card("Test Titan", "Creature — Giant", "{5}{G}", { power: "6", toughness: "6" });
const golem = card("Test Golem", "Artifact Creature — Golem", "{4}", { power: "4", toughness: "4" });
const drake = card("Test Drake", "Creature — Drake", "{1}{U}{U}", { power: "2", toughness: "2" });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;
const named = (s: GameState, name: string) => s.battlefield.filter((id) => characteristics(s, s.objects[id]!).name.replace(/ Token$/, "") === name);
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};

describe("Divine Visitation and Draconic Visitor", () => {
  it("creature tokens you'd create are 4/4 Angels instead; an opponent's aren't", () => {
    supported(visitation, visitor);
    const { s: s0, ap, ids } = setup([raise]);
    let s = s0;
    putOnBattlefield(s, ap, visitation);
    s = settle(cast(s, ap, ids[0]!));
    const angels = named(s, "Angel");
    expect(angels).toHaveLength(2);
    expect(named(s, "Saproling")).toHaveLength(0);
    const a = s.objects[angels[0]!]!;
    expect(characteristics(s, a).power).toBe(4);
    expect(objHasKeyword(s, a, "Flying") && objHasKeyword(s, a, "Vigilance")).toBe(true);
  });

  it("with both, a Treasure becomes a Dragon, and that creature token an Angel (each replacement once, CR 616.1e)", () => {
    const { s: s0, ap, ids } = setup([treasure]);
    let s = s0;
    putOnBattlefield(s, ap, visitation);
    putOnBattlefield(s, ap, visitor);
    s = settle(cast(s, ap, ids[0]!));
    expect(named(s, "Treasure")).toHaveLength(0);
    expect(named(s, "Dragon")).toHaveLength(0);
    expect(named(s, "Angel")).toHaveLength(1);
  });
});

describe("Tree of Perdition", () => {
  it("exchanges an opponent's life total with its toughness; a toughness boost applies after the new one (rulings)", () => {
    supported(perdition, redemption);
    const { s: s0, ap } = setup([]);
    let s = s0;
    const tree = putOnBattlefield(s, ap, perdition);
    const opp = next(s, ap);
    s.players[opp]!.life = 27;
    s = settle(run(s, planActivate(s, ap, tree, 0, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(13);
    expect(toughness(s, s.objects[tree]!)).toBe(27);
  });

  it("does nothing if the Tree has left the battlefield", () => {
    const { s: s0, ap, ids } = setup([shock]);
    let s = s0;
    const tree = putOnBattlefield(s, ap, redemption);
    s.objects[tree]!.damage = 12;
    s.players[ap]!.life = 30;
    for (const a of planActivate(s, ap, tree, 0)!) s = act(s, a);
    // In response, the Tree is dealt lethal damage.
    for (const a of planCast(s, ap, ids[0]!, [target(tree)])!) s = act(s, a);
    s = settle(s);
    expect(s.objects[tree]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(30);
  });
});

describe("Gift of Immortality", () => {
  it("the creature returns at once; the Aura returns attached to it at the beginning of the next end step", () => {
    supported(gift);
    const { s: s0, ap, ids } = setup([shock]);
    let s = s0;
    const ogreId = putOnBattlefield(s, ap, ogre);
    const aura = putOnBattlefield(s, ap, gift);
    s.objects[aura]!.attachedTo = ogreId;
    invalidateCharacteristics(s);
    s.objects[ogreId]!.damage = 1;
    s = settle(cast(s, ap, ids[0]!, [target(ogreId)]));
    expect(s.objects[ogreId]!.zone).toBe("battlefield");
    expect(s.objects[aura]!.zone).toBe("graveyard");
    s = settle(passUntil(s, "end"));
    s = settle(s);
    expect(s.objects[aura]!.zone).toBe("battlefield");
    expect(s.objects[aura]!.attachedTo).toBe(ogreId);
  });

  it("a token doesn't return, and neither does the Aura (rulings)", () => {
    const { s: s0, ap, ids } = setup([shock]);
    let s = s0;
    const tok = putOnBattlefield(s, ap, ogre);
    s.objects[tok]!.isToken = true;
    const aura = putOnBattlefield(s, ap, gift);
    s.objects[aura]!.attachedTo = tok;
    s.objects[tok]!.damage = 1;
    invalidateCharacteristics(s);
    s = settle(cast(s, ap, ids[0]!, [target(tok)]));
    s = settle(passUntil(s, "end"));
    s = settle(s);
    expect(s.objects[aura]!.zone).toBe("graveyard");
    expect(s.delayed ?? []).toHaveLength(0);
  });
});

describe("Hellkite Courser", () => {
  it("you may put your commander onto the battlefield with haste; it goes back to the command zone at the next end step, without commander tax", () => {
    supported(courser);
    const { s: s0, ap, ids } = setup([courser]);
    let s = s0;
    const cmd = s.players[ap]!.command[0]!;
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    s = settle(s);
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[cmd]!.zone).toBe("battlefield");
    expect(objHasKeyword(s, s.objects[cmd]!, "Haste")).toBe(true);
    expect(s.players[ap]!.commanderCasts[cmd] ?? 0).toBe(0);
    s = settle(passUntil(s, "end"));
    s = settle(s);
    expect(s.objects[cmd]!.zone).toBe("command");
  });
});

describe("Pay {0} rather than pay the mana cost", () => {
  it("As Foretold: once each turn, a spell with mana value up to its time counters for {0}", () => {
    supported(foretold, rooftop, monolith);
    const { s: s0, ap, ids } = setup([ogre, drake]);
    let s = s0;
    const af = putOnBattlefield(s, ap, foretold);
    s.objects[af]!.counters.time = 3;
    expect(altCostsFor(s, ap, s.objects[ids[0]!]!).some((a) => a.kind === "payZero")).toBe(true);
    const before = s.battlefield.filter((id) => s.objects[id]!.tapped).length;
    s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "payZero" })));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.battlefield.filter((id) => s.objects[id]!.tapped).length).toBe(before);
    // Used up for this turn.
    expect(castProblem(s, ap, ids[1]!, undefined, undefined, undefined, undefined, undefined, { alt: "payZero" })).toMatch(/nothing lets you pay \{0\}/);
  });

  it("As Foretold: not for a spell with a greater mana value", () => {
    const { s: s0, ap, ids } = setup([big]);
    const s = s0;
    const af = putOnBattlefield(s, ap, foretold);
    s.objects[af]!.counters.time = 2;
    expect(altCostsFor(s, ap, s.objects[ids[0]!]!).some((a) => a.kind === "payZero")).toBe(false);
  });

  it("Rooftop Storm: every Zombie creature spell, any number of times; Darksteel Monolith: a colorless spell from your hand", () => {
    const { s: s0, ap, ids } = setup([zombie, zombie, golem, ogre]);
    let s = s0;
    putOnBattlefield(s, ap, rooftop);
    putOnBattlefield(s, ap, monolith);
    s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "payZero" })));
    s = settle(run(s, planCast(s, ap, ids[1]!, undefined, undefined, "auto", undefined, { alt: "payZero" })));
    s = settle(run(s, planCast(s, ap, ids[2]!, undefined, undefined, "auto", undefined, { alt: "payZero" })));
    expect([ids[0], ids[1], ids[2]].map((id) => s.objects[id!]!.zone)).toEqual(["battlefield", "battlefield", "battlefield"]);
    expect(s.battlefield.filter((id) => s.objects[id]!.tapped)).toHaveLength(0);
    expect(altCostsFor(s, ap, s.objects[ids[3]!]!).some((a) => a.kind === "payZero")).toBe(false);
  });
});

describe("Hostage Taker", () => {
  it("exiles another creature until it leaves; you may cast that card, with mana of any type", () => {
    supported(taker);
    const { s: s0, ap, ids } = setup([taker]);
    let s = s0;
    const opp = next(s, ap);
    const theirs = putOnBattlefield(s, opp, drake);
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    s = settle(s);
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(theirs)] }));
    expect(s.objects[theirs]!.zone).toBe("exile");
    // {1}{U}{U} paid with any lands: tap only Mountains and Forests.
    const plan = planCast(s, ap, theirs);
    expect(plan).not.toBeNull();
    s = settle(run(s, plan));
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(characteristics(s, s.objects[theirs]!).controller).toBe(ap);
  });

  it("if Hostage Taker leaves first, the card returns to its owner", () => {
    const { s: s0, ap, ids } = setup([taker, shock]);
    let s = s0;
    const opp = next(s, ap);
    const theirs = putOnBattlefield(s, opp, drake);
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    s = settle(s);
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(theirs)] }));
    s.objects[ids[0]!]!.damage = 2;
    s = settle(cast(s, ap, ids[1]!, [target(ids[0]!)]));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(characteristics(s, s.objects[theirs]!).controller).toBe(opp);
  });
});

describe("Winds of Abandon", () => {
  it("exiles a creature you don't control; its controller searches for a basic land and puts it onto the battlefield tapped", () => {
    supported(winds);
    const { s: s0, ap, ids } = setup([winds]);
    let s = s0;
    const opp = next(s, ap);
    const theirs = putOnBattlefield(s, opp, bear());
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === opp && characteristics(s, s.objects[id]!).types.includes("Land")).length;
    for (const a of planCast(s, ap, ids[0]!, [target(theirs)])!) s = act(s, a);
    s = settle(s);
    expect(s.pending?.kind).toBe("searchLibrary");
    const p = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect(p.player).toBe(opp);
    s = settle(act(s, { type: "searchLibrary", player: opp, found: [p.cards[0]!] }));
    expect(s.objects[theirs]!.zone).toBe("exile");
    const now = s.battlefield.filter((id) => s.objects[id]!.controller === opp && characteristics(s, s.objects[id]!).types.includes("Land"));
    expect(now.length).toBe(lands + 1);
    expect(now.some((id) => s.objects[id]!.tapped)).toBe(true);
  });

  it("overloaded: each opponent searches for as many basic lands as creatures they lost", () => {
    const { s: s0, ap, ids } = setup([winds]);
    let s = s0;
    const opp = next(s, ap);
    const third = next(s, opp);
    for (const pid of [opp, opp, third]) putOnBattlefield(s, pid, bear());
    const mine = putOnBattlefield(s, ap, bear());
    for (const a of planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "overload" })!) s = act(s, a);
    s = settle(s);
    const seen: { player: PlayerId; max: number }[] = [];
    for (let i = 0; i < 4 && s.pending?.kind === "searchLibrary"; i++) {
      const p = s.pending;
      seen.push({ player: p.player, max: p.max });
      s = settle(act(s, { type: "searchLibrary", player: p.player, found: p.cards.slice(0, p.max) }));
    }
    expect(seen).toEqual([
      { player: opp, max: 2 },
      { player: third, max: 1 },
    ]);
    expect(s.objects[mine]!.zone).toBe("battlefield");
    void forest;
  });
});
