// Round 141: the most played cards, in popularity order, starting with prowl (Hunting Velociraptor).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, passUntil, putOnBattlefield, setup } from "./helpers";
import { altCostsFor, attackCost, attackProblem, botActions, castProblem, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, legalActions, manaOptions, moveObject, enterTogether, planActivate, abilitiesOf, manaValue, parseManaCost, planCast, planMana, spellCost, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const total = (c: { cost: Parameters<typeof manaValue>[0]; extra: number }) => manaValue(c.cost) + c.extra;

/** Attack `defender` with `attackers`, nobody blocks, through combat damage to the second main phase. */
function swing(s: GameState, ap: PlayerId, defender: PlayerId, attackers: string[]) {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((a) => ({ attacker: a, defender })) });
  for (let i = 0; i < 60 && s.step !== "main2"; i++) {
    const p = s.pending;
    s = act(s, p?.kind === "declareBlockers" ? { type: "declareBlockers", player: p.player, blocks: [] } : { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
}

// Real oracle text (Scryfall).
const velociraptor = card("Hunting Velociraptor", "Creature — Dinosaur", "{2}{R}", { power: "3", toughness: "2", keywords: ["First strike"], oracleText: "First strike\nDinosaur spells you cast have prowl {2}{R}. (You may cast a spell for its prowl cost if you dealt combat damage to a player this turn with a creature with any of its creature types.)" });
const latchkey = card("Latchkey Faerie", "Creature — Faerie Rogue", "{3}{U}", { power: "3", toughness: "1", keywords: ["Flying", "Prowl"], oracleText: "Flying\nProwl {2}{U} (You may cast this for its prowl cost if you dealt combat damage to a player this turn with a Faerie or Rogue.)\nWhen this creature enters, if its prowl cost was paid, draw a card." });
const enigmaThief = card("Enigma Thief", "Creature — Sphinx Rogue", "{5}{U}{U}", { power: "5", toughness: "5", keywords: ["Flying", "Prowl"], oracleText: "Prowl {3}{U} (You may cast this spell for its prowl cost if you dealt combat damage to a player this turn with a Sphinx or Rogue.)\nFlying\nWhen this creature enters, for each opponent, return up to one target nonland permanent that player controls to its owner's hand." });
const morselTheft = card("Morsel Theft", "Kindred Sorcery — Rogue", "{2}{B}{B}", { keywords: ["Prowl"], oracleText: "Prowl {1}{B} (You may cast this for its prowl cost if you dealt combat damage to a player this turn with a Rogue.)\nTarget player loses 3 life and you gain 3 life. If this spell's prowl cost was paid, draw a card." });
const thievesFortune = card("Thieves' Fortune", "Kindred Instant — Rogue", "{2}{U}", { keywords: ["Prowl"], oracleText: "Prowl {U} (You may cast this for its prowl cost if you dealt combat damage to a player this turn with a Rogue.)\nLook at the top four cards of your library. Put one of them into your hand and the rest on the bottom of your library in any order." });
const bigDino = bear({ name: "Test Giganotosaurus", typeLine: "Creature — Dinosaur", subtypes: ["Dinosaur"], manaCost: "{5}{R}{R}", power: "7", toughness: "7" });
const rogue = bear({ name: "Test Rogue", typeLine: "Creature — Human Rogue", subtypes: ["Human", "Rogue"] });
const shapeshifter = bear({ name: "Test Changeling", typeLine: "Creature — Shapeshifter", subtypes: ["Shapeshifter"], keywords: ["Changeling"], oracleText: "Changeling (This card is every creature type.)" });

describe("prowl (CR 702.76a)", () => {
  it("the cards are fully supported", () => supported(velociraptor, latchkey, enigmaThief, morselTheft, thievesFortune));

  it("Hunting Velociraptor: Dinosaur spells have prowl {2}{R} once a Dinosaur of yours dealt a player combat damage", () => {
    const { s: s0, ap, opp, ids } = setup([bigDino, bear()]);
    const raptor = putOnBattlefield(s0, ap, velociraptor);
    const how = { alt: "prowl" as const };
    // Only Dinosaur spells have it; and only after the damage.
    expect(altCostsFor(s0, ap, s0.objects[ids[0]!]!).map((a) => a.kind)).toEqual(["prowl"]);
    expect(altCostsFor(s0, ap, s0.objects[ids[1]!]!).map((a) => a.kind)).toEqual([]);
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, how)).toMatch(/can't be paid now/);
    expect(castProblem(s0, ap, ids[1]!, undefined, undefined, undefined, undefined, undefined, how)).toMatch(/doesn't have prowl/);
    const s = swing(s0, ap, opp, [raptor]);
    expect(s.players[opp]!.life).toBe(37);
    expect(planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, how)).not.toBeNull();
    expect(total(spellCost(s, ap, s.objects[ids[0]!]!, 0, [], how))).toBe(3);
    // The bot pays the cheaper prowl cost.
    s.players[ap]!.hand = [ids[0]!];
    const a = botActions(s, ap).find((x) => x.type === "castSpell");
    expect(a?.type === "castSpell" && a.objectId === ids[0] && a.alt === "prowl").toBe(true);
    const after = passAll(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, how)));
    expect(after.objects[ids[0]!]!.zone).toBe("battlefield");
  });

  it("a creature without a matching type, or another player's Dinosaur, doesn't enable it; the damage lasts the turn only", () => {
    const { s: s0, ap, opp, ids } = setup([bigDino]);
    putOnBattlefield(s0, ap, velociraptor, { sick: true });
    const b = putOnBattlefield(s0, ap, bear());
    const how = { alt: "prowl" as const };
    let s = swing(s0, ap, opp, [b]);
    expect(s.players[opp]!.life).toBe(38);
    expect(castProblem(s, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, how)).toMatch(/can't be paid now/);
    // An opponent's Dinosaur hitting a player counts for that opponent, not for us.
    const { s: s1, ap: ap1, opp: opp1, ids: ids1 } = setup([bigDino]);
    putOnBattlefield(s1, opp1, velociraptor);
    const theirs = putOnBattlefield(s1, opp1, bigDino);
    s = passUntil(s1, "main1", opp1);
    s.players[ap1]!.hand = [...s.players[ap1]!.hand];
    s = swing(s, opp1, ap1, [theirs]);
    expect(s.players[ap1]!.life).toBe(33);
    expect(s.turnLog?.combatDamageTypesBy?.[opp1]).toContain("Dinosaur");
    expect(s.turnLog?.combatDamageTypesBy?.[ap1]).toBeUndefined();
    expect(ids1.length).toBe(1);
    // Next turn, it's gone.
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(opp1) + 1) % 4]);
    expect(s.turnLog?.combatDamageTypesBy).toBeUndefined();
  });

  it("Latchkey Faerie: prowl after a Rogue's damage, and its enters trigger draws only then; a changeling counts", () => {
    const { s: s0, ap, opp, ids } = setup([latchkey, latchkey]);
    const r = putOnBattlefield(s0, ap, rogue);
    const how = { alt: "prowl" as const };
    // Cast normally: no card.
    let s = passAll(run(s0, planCast(s0, ap, ids[1]!)));
    const hand = s.players[ap]!.hand.length;
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    expect(s.players[ap]!.hand.length).toBe(hand);
    s = swing(s, ap, opp, [r]);
    expect(total(spellCost(s, ap, s.objects[ids[0]!]!, 0, [], how))).toBe(3);
    s = passAll(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, how)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.players[ap]!.hand.length).toBe(hand); // cast one, drew one
    // A changeling has every creature type (CR 702.73a).
    const { s: s1, ap: ap1, opp: opp1, ids: ids1 } = setup([latchkey]);
    const c = putOnBattlefield(s1, ap1, shapeshifter);
    s = swing(s1, ap1, opp1, [c]);
    expect(planCast(s, ap1, ids1[0]!, undefined, undefined, "auto", undefined, how)).not.toBeNull();
  });

  it("Morsel Theft: a Kindred Rogue sorcery; 'if this spell's prowl cost was paid' draws", () => {
    const { s: s0, ap, opp, ids } = setup([morselTheft]);
    const r = putOnBattlefield(s0, ap, rogue);
    let s = swing(s0, ap, opp, [r]);
    const hand = s.players[ap]!.hand.length;
    s = passAll(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, "auto", undefined, { alt: "prowl" })));
    expect(s.players[opp]!.life).toBe(35);
    expect(s.players[ap]!.hand.length).toBe(hand);
  });
});

const metalworker = card("Metalworker", "Artifact Creature — Construct", "{3}", { power: "1", toughness: "2", oracleText: "{T}: Reveal any number of artifact cards in your hand. Add {C}{C} for each card revealed this way." });
const ornithopter = card("Ornithopter", "Artifact Creature — Thopter", "{0}", { power: "0", toughness: "2", keywords: ["Flying"], oracleText: "Flying" });
const bigArtifact = card("Test Colossus", "Artifact Creature — Golem", "{4}", { power: "4", toughness: "4", oracleText: "" });

describe("Metalworker: reveal any number of artifact cards in your hand for {C}{C} each", () => {
  it("is fully supported", () => supported(metalworker));

  it("each number of artifact cards in hand is a way to activate it, from none (rulings); the cards are revealed", () => {
    const { s: s0, ap, ids } = setup([ornithopter, bigArtifact, bear()]);
    const mw = putOnBattlefield(s0, ap, metalworker);
    const o = s0.objects[mw]!;
    expect(manaOptions(s0, o).map((x) => x.adds.length)).toEqual([0, 2, 4]);
    const four = manaOptions(s0, o).find((x) => x.adds.length === 4)!;
    const s = act(s0, { type: "activateMana", player: ap, objectId: mw, mana: four.mana, ability: four.ability, combo: four.combo });
    expect(s.players[ap]!.manaPool.C).toBe(4);
    expect(s.objects[mw]!.tapped).toBe(true);
    expect(s.log.some((l) => /reveals Ornithopter, Test Colossus for Metalworker/.test(typeof l === "string" ? l : JSON.stringify(l)))).toBe(true);
    expect(ids.length).toBe(3);
  });

  it("automatic payment taps it for the mana it needs", () => {
    const { s: s0, ap, ids } = setup([bigArtifact, ornithopter]);
    for (const id of s0.battlefield) if (controllerOf(s0, s0.objects[id]!) === ap) s0.objects[id]!.tapped = true;
    const mw = putOnBattlefield(s0, ap, metalworker);
    const plan = planCast(s0, ap, ids[0]!);
    expect(plan).not.toBeNull();
    const s = passAll(run(s0, plan));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[mw]!.tapped).toBe(true);
  });
});

const nils = card("Nils, Discipline Enforcer", "Legendary Creature — Human Cleric", "{2}{W}", { power: "2", toughness: "2", oracleText: "At the beginning of your end step, for each player, put a +1/+1 counter on up to one target creature that player controls.\nEach creature with one or more counters on it can't attack you or planeswalkers you control unless its controller pays {X}, where X is the number of counters on that creature." });
const walker = card("Test Walker", "Legendary Planeswalker — Test", "{3}", { loyalty: "5", oracleText: "+1: You gain 1 life." });

describe("Nils, Discipline Enforcer", () => {
  it("is fully supported", () => supported(nils));

  it("at your end step, up to one target creature for each player, you first, gets a +1/+1 counter", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, nils);
    const mine = putOnBattlefield(s0, ap, bear());
    // The others in turn order after us.
    const others = [1, 2, 3].map((k) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + k) % 4]!).map((p) => putOnBattlefield(s0, p, bear({ name: `Bear ${p}` })));
    let s = passUntil(s0, "end", ap);
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("chooseTargets");
    // Ours and the first opponent's; none for the other two.
    const targets: TargetChoice[] = [{ kind: "object", id: mine }, { kind: "object", id: others[0]! }, { kind: "none" }, { kind: "none" }];
    // Each slot is that player's creature (CR 601.2c).
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: others[0]! }, { kind: "object", id: mine }, { kind: "none" }, { kind: "none" }] })).toThrow();
    s = act(s, { type: "chooseTargets", player: ap, targets });
    for (let i = 0; i < 10 && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[others[0]!]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[others[1]!]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("a creature with counters pays {X} to attack you or your planeswalkers, X all its counters; others are free", () => {
    const { s: s0, ap, opp } = setup([]);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    putOnBattlefield(s0, opp, nils);
    const pw = putOnBattlefield(s0, opp, walker);
    const countered = putOnBattlefield(s0, ap, bear());
    s0.objects[countered]!.counters = { "+1/+1": 1, oil: 1 };
    const plain = putOnBattlefield(s0, ap, bear({ name: "Plain Bear" }));
    invalidateCharacteristics(s0);
    const s = passUntil(s0, "declareAttackers", ap);
    expect(attackCost(s, [{ attacker: countered, defender: opp }])).toBe("{2}");
    expect(attackCost(s, [{ attacker: countered, defender: opp, planeswalker: pw }])).toBe("{2}");
    expect(attackCost(s, [{ attacker: plain, defender: opp }])).toBe("");
    expect(attackCost(s, [{ attacker: countered, defender: third }])).toBe("");
    expect(attackCost(s, [{ attacker: countered, defender: opp }, { attacker: plain, defender: opp }])).toBe("{2}");
    const attacks = [{ attacker: countered, defender: opp }];
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks })).toThrow(/costs \{2\}/);
    const after = [...planMana(s, ap, parseManaCost("{2}"))!, { type: "declareAttackers" as const, player: ap, attacks }].reduce((x, a) => act(x, a), s);
    expect(after.objects[countered]!.attacking).toBe(opp);
    expect(attackProblem(s, s.objects[countered]!, opp)).toBeNull();
  });
});

describe("Battle at the Helvault: for each player, exile up to one target permanent that player controls", () => {
  const helvault = card("Battle at the Helvault", "Enchantment — Saga", "{4}{W}{W}", { oracleText: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II — For each player, exile up to one target non-Saga, nonland permanent that player controls until this Saga leaves the battlefield.\nIII — Create Avacyn, a legendary 8/8 white Angel creature token with flying, vigilance, and indestructible." });

  it("is fully supported; chapter I offers a target for each player, and they return when it leaves", () => {
    supported(helvault);
    const { s: s0, ap, opp, ids } = setup([helvault]);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "none" }, { kind: "object", id: theirs }, { kind: "none" }, { kind: "none" }] });
    for (let i = 0; i < 10 && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[theirs]!.zone).toBe("exile");
    expect(s.objects[mine]!.zone).toBe("battlefield");
    // The Saga leaves: the card returns (CR 610.3).
    moveObject(s, ids[0]!, "graveyard");
    s = resolveAll(s);
    expect(s.objects[theirs]!.zone).toBe("battlefield");
  });
});

describe("Conformer Shuriken", () => {
  const shuriken = card("Conformer Shuriken", "Legendary Artifact — Equipment", "{2}", { oracleText: "Equipped creature has \"Whenever this creature attacks, tap target creature defending player controls. If that creature has greater power than this creature, put a number of +1/+1 counters on this creature equal to the difference.\"\nEquip {2}" });
  const big = bear({ name: "Big Blocker", power: "5", toughness: "5" });

  it("is fully supported; the equipped creature taps the target and gets the difference in counters when it's bigger", () => {
    supported(shuriken);
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bear());
    const eq = putOnBattlefield(s0, ap, shuriken);
    s0.objects[eq]!.attachedTo = b;
    const theirs = putOnBattlefield(s0, opp, big);
    const small = putOnBattlefield(s0, opp, bear({ name: "Small One", power: "1", toughness: "1" }));
    invalidateCharacteristics(s0);
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    expect(s.pending?.kind).toBe("chooseTargets");
    // Only the defending player's creatures.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: b }] })).toThrow();
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: theirs }] }));
    expect(s.objects[theirs]!.tapped).toBe(true);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(3);
    expect(small).toBeTruthy();
  });

  it("no counters when the target isn't bigger", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bear());
    const eq = putOnBattlefield(s0, ap, shuriken);
    s0.objects[eq]!.attachedTo = b;
    const small = putOnBattlefield(s0, opp, bear({ name: "Small One", power: "1", toughness: "1" }));
    invalidateCharacteristics(s0);
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: small }] });
    s = resolveAll(s);
    expect(s.objects[small]!.tapped).toBe(true);
    expect(s.objects[b]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("Orochi Soul-Reaver: manifest the top card of that player's library", () => {
  const orochi = card("Orochi Soul-Reaver", "Creature — Snake Ninja Rogue", "{5}{B}", { power: "5", toughness: "4", keywords: ["Manifest", "Treasure", "Ninjutsu"], oracleText: "Ninjutsu {3}{B} ({3}{B}, Return an unblocked attacker you control to hand: Put this card onto the battlefield from your hand tapped and attacking.)\nWhenever one or more creatures you control deal combat damage to a player, create a Treasure token and manifest the top card of that player's library. (Put it onto the battlefield face down as a 2/2 creature. Turn it face up any time for its mana cost if it's a creature card.)" });

  it("is fully supported; their top card becomes a face-down 2/2 you control and they own", () => {
    supported(orochi);
    const { s: s0, ap, opp } = setup([]);
    const o = putOnBattlefield(s0, ap, orochi);
    const top = s0.players[opp]!.library[0]!;
    let s = swing(s0, ap, opp, [o]);
    s = resolveAll(s);
    expect(s.objects[top]!.zone).toBe("battlefield");
    expect(s.objects[top]!.faceDown).toBe("manifest");
    expect(controllerOf(s, s.objects[top]!)).toBe(ap);
    expect(s.objects[top]!.owner).toBe(opp);
    expect(characteristics(s, s.objects[top]!).power).toBe(2);
    expect(s.battlefield.some((id) => controllerOf(s, s.objects[id]!) === ap && characteristics(s, s.objects[id]!).subtypes.includes("Treasure"))).toBe(true);
  });
});

describe("Mystic Reflection", () => {
  const reflection = card("Mystic Reflection", "Instant", "{1}{U}", { keywords: ["Foretell"], oracleText: "Choose target nonlegendary creature. The next time one or more creatures or planeswalkers enter this turn, they enter as copies of the chosen creature.\nForetell {U} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)" });
  const dragon = bear({ name: "Test Dragon", typeLine: "Creature — Dragon", subtypes: ["Dragon"], power: "6", toughness: "6", manaCost: "{4}{R}{R}", keywords: ["Flying"], oracleText: "Flying" });

  it("is fully supported; the next creatures to enter this turn enter as copies, only that once", () => {
    supported(reflection);
    const { s: s0, ap, ids } = setup([reflection, bear({ name: "First Bear" }), bear({ name: "Second Bear" })]);
    const d = putOnBattlefield(s0, ap, dragon);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: d }])));
    expect(s.nextEntersAsCopy?.length).toBe(1);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    expect(characteristics(s, s.objects[ids[1]!]!).name).toBe("Test Dragon");
    expect(characteristics(s, s.objects[ids[1]!]!).power).toBe(6);
    expect(s.nextEntersAsCopy ?? []).toEqual([]);
    s = resolveAll(run(s, planCast(s, ap, ids[2]!)));
    expect(characteristics(s, s.objects[ids[2]!]!).name).toBe("Second Bear");
  });

  it("a legendary creature isn't a legal target; the chosen creature gone, it's copied as it last existed", () => {
    const { s: s0, ap, ids } = setup([reflection, bear({ name: "First Bear" })]);
    const legend = putOnBattlefield(s0, ap, bear({ name: "Legend Bear", typeLine: "Legendary Creature — Bear", supertypes: ["Legendary"] }));
    expect(planCast(s0, ap, ids[0]!, [{ kind: "object", id: legend }])).toBeNull();
    const d = putOnBattlefield(s0, ap, dragon);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: d }])));
    moveObject(s, d, "graveyard");
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(characteristics(s, s.objects[ids[1]!]!).name).toBe("Test Dragon");
  });

  it("creatures entering at the same time all enter as copies; it lasts this turn only", () => {
    const { s: s0, ap, opp, ids } = setup([reflection, reflection, card("Forest", "Basic Land — Forest")]);
    const d = putOnBattlefield(s0, ap, dragon);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: d }])));
    // Two creature cards put onto the battlefield at once (as Living Death would): both are Dragons, and that's it.
    const a = putOnBattlefield(s, opp, bear({ name: "Yard A" }));
    const b = putOnBattlefield(s, opp, bear({ name: "Yard B" }));
    for (const id of [a, b]) moveObject(s, id, "graveyard");
    enterTogether(s, () => [a, b].forEach((id) => moveObject(s, id, "battlefield", { controller: opp })));
    expect([a, b].map((id) => characteristics(s, s.objects[id]!).name)).toEqual(["Test Dragon", "Test Dragon"]);
    expect(s.nextEntersAsCopy ?? []).toEqual([]);
    // A land isn't a creature or planeswalker: it doesn't use it up.
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: d }])));
    s = act(s, { type: "playLand", player: ap, objectId: ids[2]! });
    expect(characteristics(s, s.objects[ids[2]!]!).name).toBe("Forest");
    expect(s.nextEntersAsCopy?.length).toBe(1);
    // A later turn: gone.
    const later = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(later.nextEntersAsCopy ?? []).toEqual([]);
  });
});

describe("Tevesh Szat, Doom of Fools", () => {
  const tevesh = card("Tevesh Szat, Doom of Fools", "Legendary Planeswalker — Szat", "{4}{B}", { loyalty: "4", keywords: ["Partner"], oracleText: "+2: Create two 0/1 black Thrull creature tokens.\n+1: You may sacrifice another creature or planeswalker. If you do, draw two cards, then draw another card if the sacrificed permanent was a commander.\n−10: Gain control of all commanders. Put all commanders from the command zone onto the battlefield under your control.\nTevesh Szat, Doom of Fools can be your commander.\nPartner" });

  it("is fully supported", () => supported(tevesh));

  it("+1: sacrificing a commander draws three cards, another creature two", () => {
    for (const [cmd, n] of [[true, 3], [false, 2]] as const) {
      const { s: s0, ap } = setup([]);
      const t = putOnBattlefield(s0, ap, tevesh);
      const victim = putOnBattlefield(s0, ap, bear({ name: "Victim" }), { commander: cmd });
      const hand = s0.players[ap]!.hand.length;
      let s = run(s0, planActivate(s0, ap, t, 1));
      s = resolveAll(s);
      expect(s.pending?.kind).toBe("chooseMay");
      s = act(s, { type: "chooseMay", player: ap, yes: true });
      if (s.pending?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: ap, ids: [victim] });
      s = resolveAll(s);
      // A commander may go to the command zone instead (CR 903.9a).
      expect(s.objects[victim]!.zone).not.toBe("battlefield");
      expect(s.players[ap]!.hand.length).toBe(hand + n);
    }
  });

  it("−10: gain control of all commanders, and every commander in a command zone enters under your control", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, tevesh);
    s0.objects[t]!.counters.loyalty = 10;
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    // The opponent's commander is on the battlefield; the others' are in their command zones.
    const theirs = s0.players[opp]!.command.find((id) => s0.objects[id]!.isCommander)!;
    moveObject(s0, theirs, "battlefield", { controller: opp });
    const inZone = s0.turnOrder.filter((p) => p !== opp).map((p) => s0.players[p]!.command.find((id) => s0.objects[id]!.isCommander)!);
    invalidateCharacteristics(s0);
    let s = run(s0, planActivate(s0, ap, t, 2));
    s = resolveAll(s);
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
    for (const id of inZone) {
      expect(s.objects[id]!.zone).toBe("battlefield");
      expect(controllerOf(s, s.objects[id]!)).toBe(ap);
    }
    expect(s.objects[inZone.find((id) => s.objects[id]!.owner === third)!]!.owner).toBe(third);
    expect(s.objects[t]!.zone).toBe("graveyard");
  });
});

describe("Sorin, Imperious Bloodlord", () => {
  const sorin = card("Sorin, Imperious Bloodlord", "Legendary Planeswalker — Sorin", "{2}{B}", { loyalty: "4", oracleText: "+1: Target creature you control gains deathtouch and lifelink until end of turn. If it's a Vampire, put a +1/+1 counter on it.\n+1: You may sacrifice a Vampire. When you do, Sorin deals 3 damage to any target and you gain 3 life.\n−3: You may put a Vampire creature card from your hand onto the battlefield." });

  it("is fully supported", () => supported(sorin));

  it("+1: deathtouch and lifelink, and a +1/+1 counter only on a Vampire", () => {
    for (const [def, n] of [[bear({ name: "Test Vampire", typeLine: "Creature — Vampire", subtypes: ["Vampire"] }), 1], [bear(), undefined]] as const) {
      const { s: s0, ap } = setup([]);
      const t = putOnBattlefield(s0, ap, sorin);
      const c = putOnBattlefield(s0, ap, def);
      invalidateCharacteristics(s0);
      const s = resolveAll(run(s0, planActivate(s0, ap, t, 0, [{ kind: "object", id: c }])));
      expect(characteristics(s, s.objects[c]!).keywords).toEqual(expect.arrayContaining(["Deathtouch", "Lifelink"]));
      expect(s.objects[c]!.counters["+1/+1"]).toBe(n);
    }
  });
});

describe("Teferi, Hero of Dominaria", () => {
  const teferi = card("Teferi, Hero of Dominaria", "Legendary Planeswalker — Teferi", "{3}{W}{U}", { loyalty: "4", oracleText: "+1: Draw a card. At the beginning of the next end step, untap up to two lands.\n−3: Put target nonland permanent into its owner's library third from the top.\n−8: You get an emblem with \"Whenever you draw a card, exile target permanent an opponent controls.\"" });

  it("is fully supported", () => supported(teferi));

  it("+1: draws now, and at the next end step untaps up to two of the lands chosen then", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, teferi);
    const lands = s0.battlefield.filter((id) => s0.objects[id]!.owner === ap && id !== t).slice(0, 3);
    for (const id of lands) s0.objects[id]!.tapped = true;
    const hand = s0.players[ap]!.hand.length;
    let s = resolveAll(run(s0, planActivate(s0, ap, t, 0)));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(lands.every((id) => s.objects[id]!.tapped)).toBe(true);
    for (let i = 0; i < 200 && s.pending?.kind !== "pickPermanents"; i++) {
      const p = s.pending;
      s = act(s, p?.kind === "declareAttackers" ? { type: "declareAttackers", player: p.player, attacks: [] } : { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.step).toBe("end");
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, count: 2, min: 0 });
    s = resolveAll(act(s, { type: "pickPermanents", player: ap, ids: lands.slice(0, 2) }));
    expect(lands.map((id) => s.objects[id]!.tapped)).toEqual([false, false, true]);
  });
});

describe("Heartwood Storyteller and Standstill: each of that player's opponents", () => {
  const storyteller = card("Heartwood Storyteller", "Creature — Treefolk", "{1}{G}{G}", { power: "2", toughness: "3", oracleText: "Whenever a player casts a noncreature spell, each of that player's opponents may draw a card." });
  const standstill = card("Standstill", "Enchantment", "{1}{U}", { oracleText: "When a player casts a spell, sacrifice this enchantment. If you do, each of that player's opponents draws three cards." });
  const gift = card("Test Gift", "Sorcery", "{G}", { oracleText: "You gain 2 life." });

  it("are fully supported", () => supported(storyteller, standstill));

  it("Heartwood Storyteller: the caster's opponents may each draw, the caster doesn't", () => {
    const { s: s0, ap, opp, ids } = setup([gift]);
    putOnBattlefield(s0, opp, storyteller);
    invalidateCharacteristics(s0);
    const others = s0.turnOrder.filter((p) => p !== ap);
    const hands = s0.turnOrder.map((p) => s0.players[p]!.hand.length);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    const asked: PlayerId[] = [];
    for (let i = 0; i < 10 && s.pending?.kind === "chooseMay"; i++) {
      asked.push(s.pending.player);
      // The last opponent declines.
      s = resolveAll(act(s, { type: "chooseMay", player: s.pending.player, yes: s.pending.player !== others[2] }));
    }
    expect(asked.sort()).toEqual([...others].sort());
    expect(s0.turnOrder.map((p, i) => s.players[p]!.hand.length - hands[i]!)).toEqual(s0.turnOrder.map((p) => (p === ap ? -1 : p === others[2] ? 0 : 1)));
  });

  it("Standstill: sacrificed, and each of the caster's opponents (its controller too) draws three", () => {
    const { s: s0, ap, opp, ids } = setup([gift]);
    const st = putOnBattlefield(s0, opp, standstill);
    invalidateCharacteristics(s0);
    const hands = s0.turnOrder.map((p) => s0.players[p]!.hand.length);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[st]!.zone).toBe("graveyard");
    expect(s0.turnOrder.map((p, i) => s.players[p]!.hand.length - hands[i]!)).toEqual(s0.turnOrder.map((p) => (p === ap ? -1 : 3)));
  });
});

describe("Tromell, Seymour's Butler", () => {
  const tromell = card("Tromell, Seymour's Butler", "Legendary Creature — Elf Advisor", "{2}{G}", { power: "2", toughness: "2", oracleText: "Each other nontoken creature you control enters with an additional +1/+1 counter on it.\n{1}, {T}: Proliferate X times, where X is the number of nontoken creatures you control that entered this turn. (To proliferate, choose any number of permanents and/or players, then give each another counter of each kind already there.)" });

  it("is fully supported", () => supported(tromell));

  it("proliferates once for each nontoken creature of yours that entered this turn", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, tromell);
    // Two nontoken creatures entered this turn (one of them with a counter), one earlier, and a token now.
    const fresh = [putOnBattlefield(s0, ap, bear()), putOnBattlefield(s0, ap, bear())];
    const old = putOnBattlefield(s0, ap, bear());
    const token = putOnBattlefield(s0, ap, bear({ name: "Test Token" }));
    s0.objects[token]!.isToken = true;
    for (const id of [t, ...fresh, token]) s0.objects[id]!.enteredTurn = s0.turn;
    s0.objects[old]!.enteredTurn = s0.turn - 1;
    for (const id of [fresh[0]!, old]) s0.objects[id]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    let s = run(s0, planActivate(s0, ap, t, 0));
    s = resolveAll(s);
    // Tromell itself counts: three proliferate actions.
    expect(s.log.filter((l) => /proliferates/.test(JSON.stringify(l))).length).toBe(3);
    expect(s.objects[fresh[0]!]!.counters["+1/+1"]).toBe(4);
    expect(s.objects[old]!.counters["+1/+1"]).toBe(4);
  });
});

describe("\"If it's a <creature type>\"", () => {
  const eyeGouge = card("Eye Gouge", "Instant", "{B}", { oracleText: "Target creature gets -1/-1 until end of turn. If it's a Cyclops, destroy it." });
  const zeal = card("Vampire's Zeal", "Instant", "{W}", { oracleText: "Target creature gets +2/+2 until end of turn. If it's a Vampire, it gains first strike until end of turn." });
  const growth = card("Unchecked Growth", "Instant — Arcane", "{2}{G}", { oracleText: "Target creature gets +4/+4 until end of turn. If it's a Spirit, it gains trample until end of turn." });

  it("the cards are fully supported", () => supported(eyeGouge, zeal, growth));

  it("Eye Gouge destroys only a Cyclops; Vampire's Zeal gives first strike to a Vampire (a changeling is one)", () => {
    const { s: s0, ap, opp, ids } = setup([eyeGouge, eyeGouge, zeal, zeal]);
    const cyclops = putOnBattlefield(s0, opp, bear({ name: "Test Cyclops", typeLine: "Creature — Cyclops", subtypes: ["Cyclops"], power: "3", toughness: "3" }));
    const other = putOnBattlefield(s0, opp, bear({ name: "Test Ogre", power: "3", toughness: "3" }));
    const vamp = putOnBattlefield(s0, ap, shapeshifter);
    const plain = putOnBattlefield(s0, ap, bear());
    invalidateCharacteristics(s0);
    let s = s0;
    for (const [i, t] of [[0, cyclops], [1, other], [2, vamp], [3, plain]] as const) s = resolveAll(run(s, planCast(s, ap, ids[i]!, [{ kind: "object", id: t }])));
    expect(s.objects[cyclops]!.zone).toBe("graveyard");
    expect(s.objects[other]!.zone).toBe("battlefield");
    expect(characteristics(s, s.objects[vamp]!).keywords).toContain("First strike");
    expect(characteristics(s, s.objects[plain]!).keywords).not.toContain("First strike");
    expect(characteristics(s, s.objects[plain]!).power).toBe(4);
  });
});
