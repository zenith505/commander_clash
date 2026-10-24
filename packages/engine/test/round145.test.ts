// Round 145: the most played cards, in popularity order, starting with Tezzeret, Betrayer of Flesh.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, island, passUntil, pt, putOnBattlefield, scry, setup } from "./helpers";
import { abilitiesOf, activationCost, botActions, characteristics, compileCard, invalidateCharacteristics, isFullySupported, manaValue, objIsType, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty or something asks a player to choose. */
const resolveAll = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** A card put straight into a zone, not from the battlefield. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "hand" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone !== "exile") s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};

// Real oracle text (Scryfall).
const tezzeret = card("Tezzeret, Betrayer of Flesh", "Legendary Planeswalker — Tezzeret", "{2}{U}{U}", { loyalty: "4", oracleText: "The first activated ability of an artifact you activate each turn costs {2} less to activate.\n+1: Draw two cards. Then discard two cards unless you discard an artifact card.\n−2: Target artifact becomes an artifact creature. If it isn't a Vehicle, it has base power and toughness 4/4.\n−6: You get an emblem with \"Whenever an artifact you control becomes tapped, draw a card.\"" });
const mindStone = card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." });
const jalumTome = card("Jalum Tome", "Artifact", "{3}", { oracleText: "{2}, {T}: Draw a card, then discard a card." });
const prism = card("Celestial Prism", "Artifact", "{3}", { oracleText: "{2}, {T}: Add one mana of any color." });
const vehicle = card("Test Cart", "Artifact — Vehicle", "{2}", { power: "3", toughness: "2", oracleText: "Crew 2" });
const withLoyalty = (s: GameState, id: string) => {
  s.objects[id]!.counters.loyalty = Number(s.cards[s.objects[id]!.cardId]!.loyalty);
  return id;
};
const mvOf = (s: GameState, pid: PlayerId, id: string, i: number) => manaValue(activationCost(s, pid, s.objects[id]!, abilitiesOf(s, s.objects[id]!).activated[i]!));

describe("Tezzeret, Betrayer of Flesh", () => {
  it("is fully supported; the first activated ability of an artifact you activate each turn costs {2} less", () => {
    supported(tezzeret, mindStone, jalumTome, prism);
    const { s: s0, ap, opp } = setup([]);
    withLoyalty(s0, putOnBattlefield(s0, ap, tezzeret));
    const tome = putOnBattlefield(s0, ap, jalumTome);
    const tome2 = putOnBattlefield(s0, ap, jalumTome);
    const theirs = putOnBattlefield(s0, opp, jalumTome);
    expect(mvOf(s0, ap, tome, 0)).toBe(0);
    expect(mvOf(s0, opp, theirs, 0)).toBe(2); // only yours
    let s = resolveAll(run(s0, planActivate(s0, ap, tome, 0)));
    expect(s.players[ap]!.manaPool.C).toBe(0);
    expect(s.battlefield.filter((id) => s.objects[id]!.tapped && objIsType(s, s.objects[id]!, "Land"))).toHaveLength(0); // it cost {0}
    expect(mvOf(s, ap, tome2, 0)).toBe(2); // the second one doesn't
  });

  it("a mana ability of an artifact counts as the first, unless it's paying for the artifact ability that follows (rulings)", () => {
    const { s: s0, ap } = setup([]);
    withLoyalty(s0, putOnBattlefield(s0, ap, tezzeret));
    const stone = putOnBattlefield(s0, ap, mindStone);
    const tome = putOnBattlefield(s0, ap, jalumTome);
    // Tapping Mind Stone for mana, then activating Jalum Tome: the Tome's ability can be the first, Mind Stone's mana
    // paying for it (rulings: the total cost is locked in before mana abilities are activated).
    let s = act(s0, { type: "activateMana", player: ap, objectId: stone, mana: "C" });
    expect(mvOf(s, ap, tome, 0)).toBe(0);
    // Doing something else first (playing a land): Mind Stone's ability was the first, and the discount is gone.
    let t = act(s, { type: "playLand", player: ap, objectId: into(s, ap, forest, "hand") });
    expect(mvOf(t, ap, tome, 0)).toBe(2);
    // Mind Stone's mana pays for the Tome's ability, which got the discount: the next artifact ability doesn't.
    s = resolveAll(run(s, planActivate(s, ap, tome, 0)));
    expect(mvOf(s, ap, stone, 0)).toBe(1);
  });

  it("a mana ability that costs mana gets it as the first ability (rulings)", () => {
    const { s: s0, ap } = setup([]);
    withLoyalty(s0, putOnBattlefield(s0, ap, tezzeret));
    const p = putOnBattlefield(s0, ap, prism);
    const tome = putOnBattlefield(s0, ap, jalumTome);
    const s = act(s0, { type: "activateMana", player: ap, objectId: p, mana: "B" });
    expect(s.players[ap]!.manaPool.B).toBe(1);
    expect(s.battlefield.filter((id) => s.objects[id]!.tapped && objIsType(s, s.objects[id]!, "Land"))).toHaveLength(0);
    expect(mvOf(s, ap, tome, 0)).toBe(2);
  });

  it("the mana abilities autopay activates to pay for an artifact's ability come after it, so that ability gets the reduction", () => {
    const signet = card("Dimir Signet", "Artifact", "{2}", { oracleText: "{1}, {T}: Add {U}{B}." });
    const book = card("Test Codex", "Artifact", "{4}", { oracleText: "{4}, {T}: Draw a card." });
    const { s: s0, ap } = setup([]);
    for (const id of s0.battlefield.filter((id) => objIsType(s0, s0.objects[id]!, "Land"))) s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
    putOnBattlefield(s0, ap, forest);
    withLoyalty(s0, putOnBattlefield(s0, ap, tezzeret));
    const sig = putOnBattlefield(s0, ap, signet);
    const codex = putOnBattlefield(s0, ap, book);
    invalidateCharacteristics(s0);
    expect(mvOf(s0, ap, codex, 0)).toBe(2);
    const hand = s0.players[ap]!.hand.length;
    const plan = planActivate(s0, ap, codex, 0);
    expect(plan?.some((a) => a.type === "activateMana" && a.objectId === sig)).toBe(true);
    const s = resolveAll(run(s0, plan));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.turnLog?.artifactAbility?.[ap]).toBe("used");
  });

  it("−2: target artifact becomes an artifact creature, 4/4 unless it's a Vehicle, which keeps its printed power and toughness", () => {
    const { s: s0, ap } = setup([]);
    const tz = withLoyalty(s0, putOnBattlefield(s0, ap, tezzeret));
    const tome = putOnBattlefield(s0, ap, jalumTome);
    const cart = putOnBattlefield(s0, ap, vehicle);
    const minus = abilitiesOf(s0, s0.objects[tz]!).activated.findIndex((a) => a.loyalty === -2);
    let s = resolveAll(run(s0, planActivate(s0, ap, tz, minus, [{ kind: "object", id: tome }])));
    expect(characteristics(s, s.objects[tome]!).types).toEqual(["Artifact", "Creature"]);
    expect(pt(s, tome)).toBe("4/4");
    // Next turn, still a creature (no duration).
    s.turn += 4;
    invalidateCharacteristics(s);
    expect(objIsType(s, s.objects[tome]!, "Creature")).toBe(true);
    const { s: s1 } = setup([]);
    const tz1 = withLoyalty(s1, putOnBattlefield(s1, ap, tezzeret));
    const cart1 = putOnBattlefield(s1, ap, vehicle);
    s = resolveAll(run(s1, planActivate(s1, ap, tz1, minus, [{ kind: "object", id: cart1 }])));
    expect(objIsType(s, s.objects[cart1]!, "Creature")).toBe(true);
    expect(pt(s, cart1)).toBe("3/2");
    void cart;
  });
});

const zur = card("Zur, Eternal Schemer", "Legendary Creature — Human Wizard", "{W}{U}{B}", { power: "1", toughness: "4", keywords: ["Flying", "Lifelink"], oracleText: "Flying\nEnchantment creatures you control have deathtouch, lifelink, and hexproof.\n{1}{W}: Target non-Aura enchantment you control becomes a creature in addition to its other types and has base power and base toughness each equal to its mana value." });
const xEnchantment = card("Test X Enchantment", "Enchantment", "{X}{2}{W}", { oracleText: "At the beginning of your upkeep, you gain 1 life." });

describe("Zur, Eternal Schemer", () => {
  it("is fully supported; the enchantment becomes a creature with base power and toughness equal to its mana value, X as 0, for good", () => {
    supported(zur);
    const { s: s0, ap } = setup([]);
    const z = putOnBattlefield(s0, ap, zur);
    const ench = putOnBattlefield(s0, ap, xEnchantment);
    let s = resolveAll(run(s0, planActivate(s0, ap, z, 0, [{ kind: "object", id: ench }])));
    expect(characteristics(s, s.objects[ench]!).types).toEqual(["Enchantment", "Creature"]);
    expect(pt(s, ench)).toBe("3/3");
    // Zur's own static: enchantment creatures you control have deathtouch, lifelink and hexproof.
    expect(characteristics(s, s.objects[ench]!).keywords).toEqual(expect.arrayContaining(["Deathtouch", "Lifelink", "Hexproof"]));
    s.turn += 4;
    invalidateCharacteristics(s);
    expect(objIsType(s, s.objects[ench]!, "Creature")).toBe(true);
  });

  it("can't target an Aura", () => {
    const aura = card("Test Aura", "Enchantment — Aura", "{W}", { keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +1/+1." });
    const { s: s0, ap } = setup([]);
    const z = putOnBattlefield(s0, ap, zur);
    const a = putOnBattlefield(s0, ap, aura);
    s0.objects[a]!.attachedTo = z;
    invalidateCharacteristics(s0);
    expect(planActivate(s0, ap, z, 0, [{ kind: "object", id: a }])).toBeNull();
  });
});

const ajanisChosen = card("Ajani's Chosen", "Creature — Cat Soldier", "{2}{W}{W}", { power: "3", toughness: "3", oracleText: "Whenever an enchantment you control enters, create a 2/2 white Cat creature token. If that enchantment is an Aura, you may attach it to the token." });
const pacifism = card("Test Might", "Enchantment — Aura", "{W}", { keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +2/+2." });
const landAura = card("Test Land Aura", "Enchantment — Aura", "{G}", { keywords: ["Enchant"], oracleText: "Enchant land\nEnchanted land has \"{T}: Add {G}{G}.\"" });

describe("Ajani's Chosen", () => {
  it("is fully supported; an enchantment entering makes a 2/2 Cat, and an Aura may move onto it", () => {
    supported(ajanisChosen);
    const { s: s0, ap, ids } = setup([pacifism]);
    const chosen = putOnBattlefield(s0, ap, ajanisChosen);
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: chosen }]));
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = resolveAll(act(s, { type: "chooseMay", player: ap, yes: true }));
    const cat = s.battlefield.find((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Cat"))!;
    expect(cat).toBeDefined();
    expect(s.objects[ids[0]!]!.attachedTo).toBe(cat);
    expect(pt(s, cat)).toBe("4/4");
    expect(pt(s, chosen)).toBe("3/3");
  });

  it("a nonAura enchantment makes a Cat with nothing to attach; an Aura that can't enchant the token stays where it is", () => {
    const { s: s0, ap, ids } = setup([xEnchantment, landAura]);
    putOnBattlefield(s0, ap, ajanisChosen);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, undefined)));
    expect(s.pending).toBeNull();
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken)).toHaveLength(1);
    const land = s.battlefield.find((id) => objIsType(s, s.objects[id]!, "Land") && !s.objects[id]!.tapped)!;
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: land }])));
    if (s.pending?.kind === "chooseMay") s = resolveAll(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken)).toHaveLength(2);
    expect(s.objects[ids[1]!]!.attachedTo).toBe(land);
  });
});

const bronzebeak = card("Bronzebeak Foragers", "Creature — Dinosaur", "{3}{W}", { power: "3", toughness: "4", oracleText: "When this creature enters, for each opponent, exile up to one target nonland permanent that player controls until this creature leaves the battlefield.\n{X}{W}: Put target card with mana value X exiled with this creature into its owner's graveyard. You gain X life." });

describe("Bronzebeak Foragers", () => {
  it("is fully supported; {X}{W} puts a card it exiled with mana value X into its owner's graveyard, and you gain X life", () => {
    supported(bronzebeak);
    const { s: s0, ap, ids, opp } = setup([bronzebeak]);
    const theirs = putOnBattlefield(s0, opp, bear());
    const other = putOnBattlefield(s0, opp, bear({ name: "Other Bear" }));
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending?.kind).toBe("chooseTargets");
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: theirs }, { kind: "none" }, { kind: "none" }] }));
    expect(s.objects[theirs]!.zone).toBe("exile");
    const fb = ids[0]!;
    // X must be the card's mana value, and only a card it exiled.
    expect(planActivate(s, ap, fb, 0, [{ kind: "object", id: theirs }], undefined, undefined, 1)).toBeNull();
    s.objects[other]!.zone = "exile";
    s.battlefield.splice(s.battlefield.indexOf(other), 1);
    invalidateCharacteristics(s);
    expect(planActivate(s, ap, fb, 0, [{ kind: "object", id: other }], undefined, undefined, 2)).toBeNull();
    const life = s.players[ap]!.life;
    s = resolveAll(run(s, planActivate(s, ap, fb, 0, [{ kind: "object", id: theirs }], undefined, undefined, 2)));
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.players[opp]!.graveyard).toContain(theirs);
    expect(s.players[ap]!.life).toBe(life + 2);
    // It doesn't come back when the Foragers leave (rulings).
    s.objects[fb]!.zone = "graveyard";
    s.battlefield.splice(s.battlefield.indexOf(fb), 1);
    invalidateCharacteristics(s);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
  });
});

const journal = scry("transform", [
  { name: "Tarrian's Journal", mana_cost: "{1}{B}", type_line: "Legendary Artifact — Book", oracle_text: "{T}, Sacrifice another artifact or creature: Draw a card. Activate only as a sorcery.\n{2}, {T}, Discard your hand: Transform Tarrian's Journal." },
  { name: "The Tomb of Aclazotz", type_line: "Legendary Land — Cave", oracle_text: "(Transforms from Tarrian's Journal.)\n{T}: Add {B}.\n{T}: You may cast a creature spell from your graveyard this turn. If you do, it enters with a finality counter on it and is a Vampire in addition to its other types. (If a creature with a finality counter on it would die, exile it instead.)" },
], { keywords: ["Transform"] });
const vampireWatcher = card("Test Vampire Watcher", "Creature — Vampire", "{1}{B}", { power: "1", toughness: "1", oracleText: "Whenever you cast a Vampire spell, you gain 1 life." });

describe("Tarrian's Journal // The Tomb of Aclazotz", () => {
  it("is fully supported; discarding your hand (even an empty one) is part of the cost to transform it", () => {
    supported(journal);
    const { s: s0, ap } = setup([bear(), bear()]);
    const j = putOnBattlefield(s0, ap, journal);
    const flip = abilitiesOf(s0, s0.objects[j]!).activated.findIndex((a) => a.discardHand);
    expect(flip).toBeGreaterThanOrEqual(0);
    const yard = s0.players[ap]!.graveyard.length + s0.players[ap]!.hand.length;
    let s = resolveAll(run(s0, planActivate(s0, ap, j, flip)));
    expect(s.players[ap]!.hand).toHaveLength(0);
    expect(s.players[ap]!.graveyard.length).toBe(yard);
    expect(characteristics(s, s.objects[j]!).name).toBe("The Tomb of Aclazotz");
    expect(objIsType(s, s.objects[j]!, "Land")).toBe(true);
    // With an empty hand it can still be activated (rulings).
    const { s: s1, ap: ap1 } = setup([]);
    s1.players[ap1]!.hand.length = 0;
    const j1 = putOnBattlefield(s1, ap1, journal);
    expect(planActivate(s1, ap1, j1, flip)).not.toBeNull();
  });

  it("the Tomb: cast a creature spell from your graveyard this turn; it's a Vampire on the stack and enters with a finality counter", () => {
    const { s: s0, ap } = setup([]);
    const j = putOnBattlefield(s0, ap, journal);
    s0.objects[j]!.face = 1;
    invalidateCharacteristics(s0);
    putOnBattlefield(s0, ap, vampireWatcher);
    const dead = into(s0, ap, bear({ name: "Dead Bear" }), "graveyard");
    const via = { via: "turnPermission" as const };
    expect(planCast(s0, ap, dead, undefined, undefined, "auto", undefined, via)).toBeNull();
    const tomb = abilitiesOf(s0, s0.objects[j]!).activated.findIndex((a) => a.body.effects.some((e) => e.type === "graveyardCastThisTurn"));
    let s = resolveAll(run(s0, planActivate(s0, ap, j, tomb)));
    const life = s.players[ap]!.life;
    s = run(s, planCast(s, ap, dead, undefined, undefined, "auto", undefined, via));
    expect(s.objects[dead]!.zone).toBe("stack");
    expect(characteristics(s, s.objects[dead]!).subtypes).toEqual(["Bear", "Vampire"]);
    s = resolveAll(s);
    expect(s.players[ap]!.life).toBe(life + 1); // a Vampire spell was cast
    expect(s.objects[dead]!.zone).toBe("battlefield");
    expect(s.objects[dead]!.counters.finality).toBe(1);
    expect(characteristics(s, s.objects[dead]!).subtypes).toEqual(["Bear", "Vampire"]);
    // Only one spell for the one activation.
    const dead2 = into(s, ap, bear({ name: "Dead Bear Two" }), "graveyard");
    expect(planCast(s, ap, dead2, undefined, undefined, "auto", undefined, via)).toBeNull();
  });
});

const mace = card("Nazgûl Battle-Mace", "Artifact — Equipment", "{5}", { keywords: ["Equip"], oracleText: "Equipped creature has menace, deathtouch, annihilator 1, and \"Whenever an opponent sacrifices a nontoken permanent, put that card onto the battlefield under your control unless that player pays 3 life.\" (Whenever a creature with annihilator 1 attacks, defending player sacrifices a permanent of their choice.)\nEquip {3}" });
const altar = card("Test Altar", "Artifact", "{1}", { oracleText: "Sacrifice a creature: You gain 1 life." });

describe("Nazgûl Battle-Mace", () => {
  const equipped = () => {
    const { s, ap, opp } = setup([]);
    const holder = putOnBattlefield(s, ap, bear({ name: "Mace Bearer" }));
    const m = putOnBattlefield(s, ap, mace);
    s.objects[m]!.attachedTo = holder;
    const outlet = putOnBattlefield(s, opp, altar);
    const victim = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    invalidateCharacteristics(s);
    s.priority = opp;
    return { s, ap, opp, holder, outlet, victim };
  };
  it("is fully supported; the equipped creature has menace, deathtouch and annihilator 1", () => {
    supported(mace);
    const { s, holder } = equipped();
    expect(characteristics(s, s.objects[holder]!).keywords).toEqual(expect.arrayContaining(["Menace", "Deathtouch"]));
    expect(abilitiesOf(s, s.objects[holder]!).triggers.some((t) => /annihilator/i.test(t.body.text))).toBe(true);
  });

  it("an opponent sacrificing a nontoken permanent: you put that card onto the battlefield unless they pay 3 life", () => {
    const { s: s0, ap, opp, outlet, victim } = equipped();
    let s = run(s0, planActivate(s0, opp, outlet, 0, undefined, undefined, undefined, undefined, { sacrifice: [victim] }));
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "payUnless", player: opp });
    const life = s.players[opp]!.life;
    let t = resolveAll(act(s, { type: "payUnless", player: opp, pay: false }));
    expect(t.objects[victim]!.zone).toBe("battlefield");
    expect(t.objects[victim]!.controller).toBe(ap);
    t = resolveAll(act(s, { type: "payUnless", player: opp, pay: true }));
    expect(t.objects[victim]!.zone).toBe("graveyard");
    expect(t.players[opp]!.life).toBe(life - 3 + 1); // and the Altar resolves after
  });

  it("a card that left the graveyard before it resolves stays where it is (rulings)", () => {
    const { s: s0, opp, outlet, victim } = equipped();
    let s = run(s0, planActivate(s0, opp, outlet, 0, undefined, undefined, undefined, undefined, { sacrifice: [victim] }));
    // Exiled from the graveyard in response.
    const card0 = s.objects[victim]!;
    s.players[opp]!.graveyard.splice(s.players[opp]!.graveyard.indexOf(victim), 1);
    card0.zone = "exile";
    card0.zoneChanges = (card0.zoneChanges ?? 0) + 1;
    s = resolveAll(s);
    if (s.pending?.kind === "payUnless") s = resolveAll(act(s, { type: "payUnless", player: opp, pay: false }));
    expect(s.objects[victim]!.zone).toBe("exile");
  });
});

const alania = card("Alania, Divergent Storm", "Legendary Creature — Otter Wizard", "{3}{U}{R}", { power: "3", toughness: "5", oracleText: "Whenever you cast a spell, if it's the first instant spell, the first sorcery spell, or the first Otter spell other than Alania you've cast this turn, you may have target opponent draw a card. If you do, copy that spell. You may choose new targets for the copy." });
const cantrip = card("Test Cantrip", "Instant", "{U}", { oracleText: "Draw a card." });
const sorceryCantrip = card("Test Sorcery Cantrip", "Sorcery", "{U}", { oracleText: "Draw a card." });
const otter = card("Test Otter", "Creature — Otter", "{1}{U}", { power: "1", toughness: "1" });

describe("Alania, Divergent Storm", () => {
  /** Cast `id`; answer Alania's trigger, if it asks, with `opp` and `yes`. Returns whether it asked. */
  const castWith = (s0: GameState, ap: PlayerId, id: string, opp: PlayerId, yes = true) => {
    let s = run(s0, planCast(s0, ap, id));
    let asked = false;
    for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      if (s.pending?.kind === "chooseTargets") {
        asked = true;
        s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
      } else if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes });
      else if (s.pending?.kind === "copyTargets") s = act(s, { type: "copyTargets", player: ap, targets: [] });
      else if (s.pending) throw new Error(`unexpected ${s.pending.kind}`);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return { s, asked };
  };

  it("is fully supported; the first instant, the first sorcery and the first Otter spell each turn are copied if an opponent draws", () => {
    supported(alania);
    const { s: s0, ap, ids, opp } = setup([cantrip, cantrip, sorceryCantrip, otter]);
    putOnBattlefield(s0, ap, alania);
    putOnBattlefield(s0, ap, island);
    putOnBattlefield(s0, ap, island);
    const hand = s0.players[ap]!.hand.length;
    const theirs = s0.players[opp]!.hand.length;
    let { s, asked } = castWith(s0, ap, ids[0]!, opp);
    expect(asked).toBe(true);
    expect(s.players[opp]!.hand.length).toBe(theirs + 1);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2); // the copy draws too
    // The second instant this turn: no trigger.
    ({ s, asked } = castWith(s, ap, ids[1]!, opp));
    expect(asked).toBe(false);
    // The first sorcery and the first Otter: each triggers.
    ({ s, asked } = castWith(s, ap, ids[2]!, opp));
    expect(asked).toBe(true);
    ({ s, asked } = castWith(s, ap, ids[3]!, opp));
    expect(asked).toBe(true);
    // The copy of the Otter spell became a token.
    expect(s.battlefield.filter((id) => characteristics(s, s.objects[id]!).name === "Test Otter")).toHaveLength(2);
  });

  it("if the opponent doesn't draw (you decline), nothing is copied; Alania cast earlier doesn't count as the first Otter", () => {
    const { s: s0, ap, ids, opp } = setup([cantrip, otter]);
    putOnBattlefield(s0, ap, alania);
    s0.castThisTurn = [...(s0.castThisTurn ?? []), { player: ap, card: s0.objects[into(s0, ap, alania, "graveyard")]!.cardId }];
    const hand = s0.players[ap]!.hand.length;
    let { s } = castWith(s0, ap, ids[0]!, opp, false);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
    const r = castWith(s, ap, ids[1]!, opp);
    expect(r.asked).toBe(true);
  });
});

const bolas = card("Nicol Bolas, Dragon-God", "Legendary Planeswalker — Bolas", "{U}{B}{B}{B}{R}", { loyalty: "4", oracleText: "Nicol Bolas has all loyalty abilities of all other planeswalkers on the battlefield.\n+1: You draw a card. Each opponent exiles a card from their hand or a permanent they control.\n−3: Destroy target creature or planeswalker.\n−8: Each opponent who doesn't control a legendary creature or planeswalker loses the game." });
const legend = card("Test Legend", "Legendary Creature — Human", "{2}", { power: "2", toughness: "2" });
const plainWalker = card("Test Walker", "Planeswalker — Test", "{2}", { loyalty: "3", oracleText: "+1: You gain 1 life." });

describe("Nicol Bolas, Dragon-God", () => {
  it("is fully supported; he has the loyalty abilities of the other planeswalkers, not their other abilities (rulings)", () => {
    supported(bolas);
    const { s: s0, ap, opp } = setup([]);
    const nb = withLoyalty(s0, putOnBattlefield(s0, ap, bolas));
    withLoyalty(s0, putOnBattlefield(s0, opp, tezzeret));
    const abs = abilitiesOf(s0, s0.objects[nb]!);
    expect(abs.activated.map((a) => a.loyalty)).toEqual([1, -3, -8, 1, -2, -6]);
    // Tezzeret's static ability isn't his: Bolas's own artifacts get no reduction.
    expect(abs.firstArtifactAbilityLess).toBeUndefined();
    const tome = putOnBattlefield(s0, ap, jalumTome);
    expect(mvOf(s0, ap, tome, 0)).toBe(2);
    // Tezzeret's +1 through Bolas: draw two, then discard two (no artifact card in hand).
    const hand = s0.players[ap]!.hand.length;
    let s = resolveAll(run(s0, planActivate(s0, ap, nb, 3)));
    for (let i = 0; i < 5 && s.pending; i++) s = resolveAll(botActions(s, s.pending.player).reduce(act, s));
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.objects[nb]!.counters.loyalty).toBe(5);
    // One loyalty ability of Bolas each turn, whatever he got it from (CR 606.3).
    expect(planActivate(s, ap, nb, 0)).toBeNull();
  });

  it("+1: you draw; each opponent in turn order picks a card in hand or a permanent they control, then all are exiled together", () => {
    const { s: s0, ap } = setup([]);
    const nb = withLoyalty(s0, putOnBattlefield(s0, ap, bolas));
    const order = [1, 2, 3].map((i) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + i) % 4]!);
    const theirLegend = putOnBattlefield(s0, order[1]!, legend);
    // The third has nothing to exile.
    for (const id of [...s0.players[order[2]!]!.hand]) {
      s0.players[order[2]!]!.hand.splice(s0.players[order[2]!]!.hand.indexOf(id), 1);
      s0.objects[id]!.zone = "graveyard";
      s0.players[order[2]!]!.graveyard.push(id);
    }
    const hand = s0.players[ap]!.hand.length;
    let s = resolveAll(run(s0, planActivate(s0, ap, nb, 0)));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "exileHandOrPermanent", player: order[0] });
    const pick0 = s.players[order[0]!]!.hand[0]!;
    s = act(s, { type: "chooseOption", player: order[0]!, choice: pick0 });
    // Not exiled yet: all at once, after the last choice.
    expect(s.objects[pick0]!.zone).toBe("hand");
    expect(s.pending).toMatchObject({ what: "exileHandOrPermanent", player: order[1] });
    expect((s.pending as { options: string[] }).options).toContain(theirLegend);
    s = resolveAll(act(s, { type: "chooseOption", player: order[1]!, choice: theirLegend }));
    expect(s.pending).toBeFalsy();
    expect(s.objects[pick0]!.zone).toBe("exile");
    expect(s.objects[theirLegend]!.zone).toBe("exile");
    expect(s.objects[nb]!.counters.loyalty).toBe(5);
  });

  it("−8: each opponent who controls no legendary creature and no legendary planeswalker loses the game (CR 205.4e)", () => {
    const { s: s0, ap } = setup([]);
    const nb = putOnBattlefield(s0, ap, bolas);
    s0.objects[nb]!.counters.loyalty = 8;
    const order = [1, 2, 3].map((i) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + i) % 4]!);
    putOnBattlefield(s0, order[0]!, legend);
    withLoyalty(s0, putOnBattlefield(s0, order[1]!, plainWalker)); // a nonlegendary planeswalker doesn't save them
    withLoyalty(s0, putOnBattlefield(s0, order[2]!, tezzeret)); // a legendary planeswalker does
    const s = resolveAll(run(s0, planActivate(s0, ap, nb, 2)));
    expect(order.map((p) => s.players[p]!.lost)).toEqual([false, true, false]);
    expect(s.players[ap]!.lost).toBe(false);
  });
});

const attack = (s: GameState, pid: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) => act(passUntil(s, "declareAttackers", pid), { type: "declareAttackers", player: pid, attacks });

const felothar = card("Felothar the Steadfast", "Legendary Creature — Human Warrior", "{1}{W}{B}{G}", { power: "0", toughness: "5", oracleText: "Each creature you control assigns combat damage equal to its toughness rather than its power.\nCreatures you control can attack as though they didn't have defender.\n{3}, {T}, Sacrifice another creature: Draw cards equal to the sacrificed creature's toughness, then discard cards equal to its power." });

describe("Felothar the Steadfast", () => {
  it("is fully supported; sacrificing a 2/4 draws four cards, then discards two, as it last existed (CR 608.2h)", () => {
    supported(felothar);
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, felothar);
    const wall = putOnBattlefield(s0, ap, card("Test Wall", "Creature — Wall", "{2}", { power: "2", toughness: "4" }));
    const hand = s0.players[ap]!.hand.length;
    let s = resolveAll(run(s0, planActivate(s0, ap, f, 0, undefined, undefined, undefined, undefined, { sacrifice: [wall] })));
    expect(s.objects[wall]!.zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "discard", player: ap });
    s = resolveAll(botActions(s, ap).reduce(act, s));
    expect(s.players[ap]!.hand.length).toBe(hand + 4 - 2);
  });
});

const levelUp = card("Level Up", "Enchantment — Aura", "{1}{G}", { oracleText: "Enchant creature\nWhen this Aura enters, put a +1/+1 counter on enchanted creature.\nEnchanted creature has \"Whenever this creature attacks, double the number of +1/+1 counters on it. Then if it has power 10 or greater, draw a card.\"" });

describe("Level Up", () => {
  it("is fully supported; attacking doubles the +1/+1 counters, then draws a card only at power 10 or greater", () => {
    supported(levelUp);
    const { s: s0, ap, opp } = setup([]);
    const bear0 = putOnBattlefield(s0, ap, bear());
    const aura = putOnBattlefield(s0, ap, levelUp);
    s0.objects[aura]!.attachedTo = bear0;
    s0.objects[bear0]!.counters["+1/+1"] = 3;
    invalidateCharacteristics(s0);
    const hand = s0.players[ap]!.hand.length;
    let s = resolveAll(attack(s0, ap, [{ attacker: bear0, defender: opp }]));
    expect(s.objects[bear0]!.counters["+1/+1"]).toBe(6);
    expect(pt(s, bear0)).toBe("8/8");
    expect(s.players[ap]!.hand.length).toBe(hand);
    // 4 counters double to 8: a 10/10 draws.
    const { s: s1 } = setup([]);
    const bear1 = putOnBattlefield(s1, ap, bear());
    const aura1 = putOnBattlefield(s1, ap, levelUp);
    s1.objects[aura1]!.attachedTo = bear1;
    s1.objects[bear1]!.counters["+1/+1"] = 4;
    invalidateCharacteristics(s1);
    const hand1 = s1.players[ap]!.hand.length;
    s = resolveAll(attack(s1, ap, [{ attacker: bear1, defender: opp }]));
    expect(pt(s, bear1)).toBe("10/10");
    expect(s.players[ap]!.hand.length).toBe(hand1 + 1);
  });
});

const stargaze = card("Stargaze", "Sorcery", "{X}{B}{B}", { oracleText: "Look at twice X cards from the top of your library. Put X cards from among them into your hand and the rest into your graveyard. You lose X life." });

describe("Stargaze", () => {
  it("is fully supported; X=3 looks at six, three go to your hand and three to your graveyard, and you lose 3 life", () => {
    supported(stargaze);
    const { s: s0, ap, ids } = setup([stargaze]);
    const top = s0.players[ap]!.library.slice(0, 6);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 3));
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", min: 3, max: 3 });
    s = resolveAll(botActions(s, ap).reduce(act, s));
    expect(top.filter((id) => s.objects[id]!.zone === "hand")).toHaveLength(3);
    expect(top.filter((id) => s.objects[id]!.zone === "graveyard")).toHaveLength(3);
    expect(s.players[ap]!.life).toBe(37);
  });

  it("with fewer than X cards in the library, all of them go to your hand (rulings)", () => {
    const { s: s0, ap, ids } = setup([stargaze]);
    const lib = s0.players[ap]!.library;
    for (const id of lib.splice(2)) s0.objects[id]!.zone = "exile";
    const two = [...lib];
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 3)));
    expect(s.pending).toBeFalsy();
    expect(two.map((id) => s.objects[id]!.zone)).toEqual(["hand", "hand"]);
    expect(s.players[ap]!.life).toBe(37);
  });
});

const firion = card("Firion, Wild Rose Warrior", "Legendary Creature — Human Rebel Warrior", "{2}{R}", { power: "3", toughness: "3", oracleText: "Equipped creatures you control have haste.\nWhenever a nontoken Equipment you control enters, create a token that's a copy of it, except it has \"This Equipment's equip abilities cost {2} less to activate.\" Sacrifice that token at the beginning of the next upkeep." });
const sword = card("Test Sword", "Artifact — Equipment", "{2}", { oracleText: "Equipped creature gets +2/+0.\nEquip {3}" });

describe("Firion, Wild Rose Warrior", () => {
  it("is fully supported; an Equipment entering makes a token copy whose equip costs {2} less, sacrificed at the next upkeep", () => {
    supported(firion);
    const { s: s0, ap, ids } = setup([sword]);
    putOnBattlefield(s0, ap, firion);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    const copy = s.battlefield.find((id) => s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]?.name === "Test Sword");
    expect(copy).toBeDefined();
    const equipOf = (st: GameState, id: string) => abilitiesOf(st, st.objects[id]!).activated.findIndex((a) => !!a.equip);
    expect(mvOf(s, ap, copy!, equipOf(s, copy!))).toBe(1);
    expect(mvOf(s, ap, ids[0]!, equipOf(s, ids[0]!))).toBe(3); // not the original's
    // Gone at the next upkeep, the next player's.
    const t = passUntil(s, "draw", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(t.objects[copy!]?.zone === "battlefield").toBe(false);
    expect(t.objects[ids[0]!]!.zone).toBe("battlefield");
  });
});

const cloud = card("Cloud, Ex-SOLDIER", "Legendary Creature — Human Soldier Mercenary", "{2}{R}{G}{W}", { power: "4", toughness: "4", keywords: ["Haste"], oracleText: "Haste\nWhen Cloud enters, attach up to one target Equipment you control to it.\nWhenever Cloud attacks, draw a card for each equipped attacking creature you control. Then if Cloud has power 7 or greater, create two Treasure tokens." });

describe("Cloud, Ex-SOLDIER (\"if ~ has power N or greater\", as Level Up's)", () => {
  it("is fully supported; equipped and at power 7 or greater, attacking draws and makes two Treasures", () => {
    supported(cloud);
    const big = card("Test Big Sword", "Artifact — Equipment", "{2}", { oracleText: "Equipped creature gets +3/+0.\nEquip {3}" });
    for (const [gear, treasures] of [[big, 2], [sword, 0]] as const) {
      const { s: s0, ap, opp } = setup([]);
      const c = putOnBattlefield(s0, ap, cloud);
      s0.objects[putOnBattlefield(s0, ap, gear)]!.attachedTo = c;
      invalidateCharacteristics(s0);
      const hand = s0.players[ap]!.hand.length;
      const s = resolveAll(attack(s0, ap, [{ attacker: c, defender: opp }]));
      expect(s.players[ap]!.hand.length).toBe(hand + 1);
      expect(s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Treasure"))).toHaveLength(treasures);
    }
  });
});
