// Round 161: the most played cards, in popularity order, starting with Tithing Blade (craft).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { abilitiesOf, abilityProblem, botActions, characteristics, invalidateCharacteristics, isFullySupported, moveObject, nextRandom, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; "you may" questions get `yes`. Stops at any other question. */
const resolveAll = (s: GameState, yes = true) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending?.kind === "chooseMay"); i++) {
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes });
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** A card put straight into a zone, not from the battlefield. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const nameOf = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % s.turnOrder.length]!;
const craftIndex = (s: GameState, id: string) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => a.keyword === "Craft");

// Real oracle text (Scryfall).
const tithing = scry("transform", [
  { name: "Tithing Blade", mana_cost: "{1}{B}", type_line: "Artifact", oracle_text: "When this artifact enters, each opponent sacrifices a creature of their choice.\nCraft with creature {4}{B} ({4}{B}, Exile this artifact, Exile a creature you control or a creature card from your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)" },
  { name: "Consuming Sepulcher", type_line: "Artifact", oracle_text: "At the beginning of your upkeep, each opponent loses 1 life and you gain 1 life." },
]);
const visage = scry("transform", [
  { name: "Visage of Dread", mana_cost: "{1}{B}", type_line: "Artifact", oracle_text: "When this artifact enters, target opponent reveals their hand. You choose an artifact or creature card from it. That player discards that card.\nCraft with two creatures {5}{B} ({5}{B}, Exile this artifact, Exile the two from among creatures you control and/or creature cards in your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)" },
  { name: "Dread Osseosaur", type_line: "Creature — Dinosaur Skeleton Horror", oracle_text: "Menace\nWhenever this creature enters or attacks, you may mill two cards. (You may put the top two cards of your library into your graveyard.)", power: "5", toughness: "4" },
]);
const hulk = scry("transform", [
  { name: "Waterlogged Hulk", mana_cost: "{U}", type_line: "Artifact", oracle_text: "{T}: Mill a card. (Put the top card of your library into your graveyard.)\nCraft with Island {3}{U} ({3}{U}, Exile this artifact, Exile an Island you control or an Island card from your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)" },
  { name: "Watertight Gondola", type_line: "Artifact — Vehicle", oracle_text: "Vigilance\nDescend 8 — This Vehicle can't be blocked as long as there are eight or more permanent cards in your graveyard.\nCrew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)", power: "4", toughness: "4" },
]);
const bricks = scry("transform", [
  { name: "Clay-Fired Bricks", mana_cost: "{1}{W}", type_line: "Artifact", oracle_text: "When this artifact enters, search your library for a basic Plains card, reveal it, put it into your hand, then shuffle. You gain 2 life.\nCraft with artifact {5}{W}{W} ({5}{W}{W}, Exile this artifact, Exile another artifact you control or an artifact card from your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)" },
  { name: "Cosmium Kiln", type_line: "Artifact", oracle_text: "When this artifact enters, create two 1/1 colorless Gnome artifact creature tokens.\nCreatures you control get +1/+1." },
]);
const idol = scry("transform", [
  { name: "Idol of the Deep King", mana_cost: "{2}{R}", type_line: "Artifact", oracle_text: "Flash\nWhen this artifact enters, it deals 2 damage to any target.\nCraft with artifact {2}{R} ({2}{R}, Exile this artifact, Exile another artifact you control or an artifact card from your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)" },
  { name: "Sovereign's Macuahuitl", type_line: "Artifact — Equipment", oracle_text: "When this Equipment enters, attach it to target creature you control.\nEquipped creature gets +2/+0.\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)" },
]);
const iceberg = scry("transform", [
  { name: "Inverted Iceberg", mana_cost: "{1}{U}", type_line: "Artifact", oracle_text: "When this artifact enters, mill a card, then draw a card. (To mill a card, put the top card of your library into your graveyard.)\nCraft with artifact {4}{U}{U} ({4}{U}{U}, Exile this artifact, Exile another artifact you control or an artifact card from your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)" },
  { name: "Iceberg Titan", type_line: "Artifact Creature — Golem", oracle_text: "Whenever this creature attacks, you may tap or untap target artifact or creature.", power: "6", toughness: "6" },
]);
const stonetree = scry("transform", [
  { name: "Kaslem's Stonetree", mana_cost: "{2}{G}", type_line: "Artifact", oracle_text: "When this artifact enters, look at the top six cards of your library. You may put a land card from among them onto the battlefield tapped. Put the rest on the bottom in a random order.\nCraft with Cave {5}{G} ({5}{G}, Exile this artifact, Exile a Cave you control or a Cave card from your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)" },
  { name: "Kaslem's Strider", type_line: "Artifact Creature — Golem", power: "5", toughness: "5" },
]);
const needle = scry("transform", [
  { name: "Lodestone Needle", mana_cost: "{1}{U}", type_line: "Artifact", oracle_text: "Flash\nWhen this artifact enters, tap up to one target artifact or creature and put two stun counters on it.\nCraft with artifact {2}{U} ({2}{U}, Exile this artifact, Exile another artifact you control or an artifact card from your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)" },
  { name: "Guidestone Compass", type_line: "Artifact", oracle_text: "{1}, {T}: Target creature you control explores. Activate only as a sorcery. (Reveal the top card of your library. Put that card into your hand if it's a land. Otherwise, put a +1/+1 counter on that creature, then put the card back or put it into your graveyard.)" },
]);
const landmark = scry("transform", [
  { name: "Oteclan Landmark", mana_cost: "{W}", type_line: "Artifact", oracle_text: "When this artifact enters, scry 2.\nCraft with artifact {2}{W} ({2}{W}, Exile this artifact, Exile another artifact you control or an artifact card from your graveyard: Return this card transformed under its owner's control. Craft only as a sorcery.)" },
  { name: "Oteclan Levitator", type_line: "Artifact Creature — Golem", oracle_text: "Flying\nWhenever this creature attacks, target attacking creature without flying gains flying until end of turn.", power: "1", toughness: "4" },
]);

const flamerush = card("Flamerush Rider", "Creature — Human Warrior", "{4}{R}", { cmc: 5, power: "3", toughness: "3", keywords: ["Dash"], oracleText: "Whenever this creature attacks, create a token that's a copy of another target attacking creature and that's tapped and attacking. Exile the token at end of combat.\nDash {2}{R}{R} (You may cast this spell for its dash cost. If you do, it gains haste, and it's returned from the battlefield to its owner's hand at the beginning of the next end step.)" });
const winota = card("Winota, Joiner of Forces", "Legendary Creature — Human Warrior", "{2}{R}{W}", { cmc: 4, power: "4", toughness: "4", oracleText: "Whenever a non-Human creature you control attacks, look at the top six cards of your library. You may put a Human creature card from among them onto the battlefield tapped and attacking. It gains indestructible until end of turn. Put the rest of the cards on the bottom of your library in a random order." });
const zara = card("Zara, Renegade Recruiter", "Legendary Creature — Human Pirate", "{3}{U}{R}", { cmc: 5, power: "4", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nWhenever Zara attacks, look at defending player's hand. You may put a creature card from it onto the battlefield under your control tapped and attacking that player or a planeswalker they control. Return that creature to its owner's hand at the beginning of the next end step." });

const rock = card("Test Rock", "Artifact", "{2}", { cmc: 2 });
const human = card("Test Squire", "Creature — Human Soldier", "{1}{W}", { cmc: 2, power: "2", toughness: "1" });
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) => act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks });
const islandCard = card("Island", "Basic Land — Island");

describe("round 161 cards", () => {
  it("are fully supported", () => supported(tithing, visage, hulk, bricks, idol, iceberg, stonetree, needle, landmark, flamerush, winota, zara));
});

describe("Craft (Tithing Blade)", () => {
  it("exiles it and a creature card from your graveyard, then returns it transformed under its owner's control", () => {
    const { s: s0, ap } = setup([]);
    const blade = putOnBattlefield(s0, ap, tithing);
    const dead = into(s0, ap, bear(), "graveyard");
    const i = craftIndex(s0, blade);
    expect(i).toBeGreaterThanOrEqual(0);
    // It has to say what it exiles (CR 602.2b).
    expect(() => run(structuredClone(s0), planActivate(s0, ap, blade, i))).toThrow(/choose what to pay the cost with|creature/);
    let s = run(s0, planActivate(s0, ap, blade, i, undefined, undefined, undefined, undefined, { craft: [dead] }));
    // Both exiled as the cost is paid (CR 702.167a).
    expect(zone(s, blade)).toBe("exile");
    expect(zone(s, dead)).toBe("exile");
    expect(s.stack.length).toBe(1);
    s = resolveAll(s);
    expect(zone(s, blade)).toBe("battlefield");
    expect(nameOf(s, blade)).toBe("Consuming Sepulcher");
    expect(s.objects[blade]!.controller).toBe(ap);
    // The card used to craft it is linked to the new permanent (CR 702.167c).
    expect(s.linkedExile?.[`${blade}@${s.objects[blade]!.zoneChanges ?? 0}`]?.map((l) => l.id)).toEqual([dead]);
    // Its upkeep trigger works: each opponent loses 1 life.
    const life = s.players[next(s, ap)]!.life;
    s = passUntil(s, "upkeep", ap);
    s = resolveAll(s);
    expect(s.players[next(s, ap)]!.life).toBe(life - 1);
  });

  it("can use a creature you control instead, a token included (it's gone), but not a card of another type or another player's", () => {
    const { s: s0, ap } = setup([]);
    const blade = putOnBattlefield(s0, ap, tithing);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, next(s0, ap), bear());
    const artifactCard = into(s0, ap, rock, "graveyard");
    const i = craftIndex(s0, blade);
    expect(abilityProblem(s0, ap, blade, i, undefined, undefined, undefined, undefined, { craft: [theirs] })).toMatch(/choose a creature to exile/);
    expect(abilityProblem(s0, ap, blade, i, undefined, undefined, undefined, undefined, { craft: [artifactCard] })).toMatch(/choose a creature to exile/);
    expect(abilityProblem(s0, ap, blade, i, undefined, undefined, undefined, undefined, { craft: [blade] })).toMatch(/choose a creature to exile/);
    let s = resolveAll(run(s0, planActivate(s0, ap, blade, i, undefined, undefined, undefined, undefined, { craft: [mine] })));
    expect(zone(s, mine)).toBe("exile");
    expect(nameOf(s, blade)).toBe("Consuming Sepulcher");
  });

  it("is only a sorcery-speed ability, and needs the material", () => {
    const { s: s0, ap } = setup([]);
    const blade = putOnBattlefield(s0, ap, tithing);
    const i = craftIndex(s0, blade);
    expect(abilityProblem(s0, ap, blade, i)).toMatch(/you need to exile a creature/);
    expect(planActivate(s0, ap, blade, i)).toBeNull();
    const dead = into(s0, ap, bear(), "graveyard");
    expect(planActivate(s0, ap, blade, i, undefined, undefined, undefined, undefined, { craft: [dead] })).not.toBeNull();
    // Not in another player's turn (CR 702.167a: "Craft only as a sorcery").
    const s = passUntil(s0, "main1", next(s0, ap));
    expect(planActivate(s, ap, blade, i, undefined, undefined, undefined, undefined, { craft: [dead] })).toBeNull();
  });

  it("doesn't return it if it left exile before the ability resolved", () => {
    const { s: s0, ap } = setup([]);
    const blade = putOnBattlefield(s0, ap, tithing);
    const dead = into(s0, ap, bear(), "graveyard");
    let s = run(s0, planActivate(s0, ap, blade, craftIndex(s0, blade), undefined, undefined, undefined, undefined, { craft: [dead] }));
    // Something exiles it again: a new object (CR 400.8), which the ability can't find.
    s.objects[blade]!.zoneChanges = (s.objects[blade]!.zoneChanges ?? 0) + 1;
    s = resolveAll(s);
    expect(zone(s, blade)).toBe("exile");
  });
});

describe("Craft with two creatures (Visage of Dread)", () => {
  it("takes two, any mix of creatures you control and creature cards in your graveyard", () => {
    const { s: s0, ap } = setup([]);
    const visageId = putOnBattlefield(s0, ap, visage);
    const mine = putOnBattlefield(s0, ap, bear());
    const dead = into(s0, ap, bear(), "graveyard");
    const i = craftIndex(s0, visageId);
    expect(abilityProblem(s0, ap, visageId, i, undefined, undefined, undefined, undefined, { craft: [dead] })).toMatch(/choose 2 creatures to exile/);
    let s = resolveAll(run(s0, planActivate(s0, ap, visageId, i, undefined, undefined, undefined, undefined, { craft: [mine, dead] })), false);
    expect(nameOf(s, visageId)).toBe("Dread Osseosaur");
    expect(zone(s, mine)).toBe("exile");
    expect(zone(s, dead)).toBe("exile");
  });
});

describe("Craft with a subtype (Waterlogged Hulk) and with artifact (Idol of the Deep King)", () => {
  it("an Island you control or an Island card; another artifact, not itself", () => {
    const { s: s0, ap } = setup([]);
    const hulkId = putOnBattlefield(s0, ap, hulk);
    const isl = into(s0, ap, islandCard, "graveyard");
    let s = resolveAll(run(s0, planActivate(s0, ap, hulkId, craftIndex(s0, hulkId), undefined, undefined, undefined, undefined, { craft: [isl] })));
    expect(nameOf(s, hulkId)).toBe("Watertight Gondola");
    const idolId = putOnBattlefield(s, ap, idol);
    const i = craftIndex(s, idolId);
    // The Gondola is an artifact; the Idol itself isn't a material of its own (its reminder text: "another artifact").
    expect(abilityProblem(s, ap, idolId, i, undefined, undefined, undefined, undefined, { craft: [idolId] })).toMatch(/choose an artifact to exile/);
    const r = putOnBattlefield(s, ap, rock);
    s = resolveAll(run(s, planActivate(s, ap, idolId, i, undefined, undefined, undefined, undefined, { craft: [r] })));
    expect(nameOf(s, idolId)).toBe("Sovereign's Macuahuitl");
  });

  it("bots craft with a card they have no use for in their graveyard", () => {
    const { s: s0, ap } = setup([]);
    const blade = putOnBattlefield(s0, ap, tithing);
    const dead = into(s0, ap, bear(), "graveyard");
    // Activated abilities wait for the second main phase, the hand being played first; then it crafts.
    let s = passUntil(s0, "main2", ap);
    let craft: Action | undefined;
    for (let i = 0; i < 60 && !craft && s.step === "main2" && !s.pending; i++) {
      const w = waitingOn(s)!;
      if (w !== ap) {
        s = act(s, { type: "passPriority", player: w });
        continue;
      }
      const acts = botActions(s, ap);
      craft = acts.find((a) => a.type === "activateAbility" && a.objectId === blade);
      if (!craft) s = run(s, acts);
    }
    expect(craft?.type === "activateAbility" && craft.costs?.craft).toEqual([dead]);
  });
});

describe("Flamerush Rider", () => {
  it("copies another attacking creature, tapped and attacking (not declared), and exiles the token at end of combat", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    const rider = putOnBattlefield(s0, ap, flamerush);
    const ogre = putOnBattlefield(s0, ap, bear({ name: "Test Ogre", power: "4", toughness: "4" }));
    let s = attack(s0, ap, [{ attacker: rider, defender: b }, { attacker: ogre, defender: b }]);
    // Its target: another attacking creature, not the Rider.
    expect(s.pending?.kind === "chooseTargets" ? s.pending : null).toBeTruthy();
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: ogre }] });
    for (let i = 0; i < 20 && (s.stack.length || s.pending); i++) {
      if (s.pending?.kind === "chooseOption" && s.pending.what === "attackWhom") s = act(s, { type: "chooseOption", player: ap, choice: String(b) });
      else if (s.pending) break;
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    const token = s.battlefield.find((id) => s.objects[id]!.isToken && nameOf(s, id) === "Test Ogre")!;
    expect(token).toBeDefined();
    expect(s.objects[token]!.tapped).toBe(true);
    expect(s.objects[token]!.attacking).toBe(b);
    s = passUntil(s, "main2", ap);
    s = resolveAll(s);
    expect(s.battlefield.includes(token)).toBe(false);
  });
});

describe("Winota, Joiner of Forces", () => {
  it("a non-Human attacking finds a Human in the top six, put onto the battlefield tapped, attacking and indestructible", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    putOnBattlefield(s0, ap, winota);
    const ogre = putOnBattlefield(s0, ap, bear({ name: "Test Ogre", power: "4", toughness: "4" }));
    const squire = into(s0, ap, human, "library");
    let s = attack(s0, ap, [{ attacker: ogre, defender: b }]);
    for (let i = 0; i < 20 && (s.stack.length || s.triggerQueue.length) && s.pending?.kind !== "searchLibrary"; i++) s = s.pending ? s : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, cards: [squire] });
    s = act(s, { type: "searchLibrary", player: ap, found: [squire] });
    // What it attacks is chosen as it enters (rulings), the defending player first.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "attackWhom" });
    s = act(s, { type: "chooseOption", player: ap, choice: String(next(s, b)) });
    expect(zone(s, squire)).toBe("battlefield");
    expect(s.objects[squire]!.tapped).toBe(true);
    expect(s.objects[squire]!.attacking).toBe(next(s, b));
    expect(characteristics(s, s.objects[squire]!).keywords).toContain("Indestructible");
    // The other five went to the bottom.
    expect(s.players[ap]!.library.slice(-5).length).toBe(5);
  });

  it("doesn't trigger for a Human attacking", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, winota);
    const squire = putOnBattlefield(s0, ap, human);
    const s = attack(s0, ap, [{ attacker: squire, defender: next(s0, ap) }]);
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
  });
});

describe("Zara, Renegade Recruiter", () => {
  it("puts a creature card from the defending player's hand onto the battlefield under your control attacking them, returned at the next end step", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    const z = putOnBattlefield(s0, ap, zara);
    const theirs = into(s0, b, bear({ name: "Test Ogre", power: "4", toughness: "4" }), "hand");
    const land = into(s0, b, islandCard, "hand");
    let s = attack(s0, ap, [{ attacker: z, defender: b }]);
    for (let i = 0; i < 20 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    // Their whole hand is shown; only the creature card can be taken.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, hand: b });
    const pend = s.pending?.kind === "searchLibrary" ? s.pending : undefined;
    expect(pend?.cards).toContain(theirs);
    expect(pend?.cards).not.toContain(land);
    expect(pend?.dig?.looked).toContain(land);
    s = act(s, { type: "searchLibrary", player: ap, found: [theirs] });
    expect(zone(s, theirs)).toBe("battlefield");
    expect(s.objects[theirs]!.controller).toBe(ap);
    expect(s.objects[theirs]!.tapped).toBe(true);
    expect(s.objects[theirs]!.attacking).toBe(b);
    s = passUntil(s, "end", ap);
    s = resolveAll(s);
    expect(zone(s, theirs)).toBe("hand");
    expect(s.players[b]!.hand).toContain(theirs);
  });
});

/** The next dice rolled come up `values`, in order (the game's seeded random numbers, CR 706.1b). */
function rig(s: GameState, sides: number, values: number[]) {
  for (let st = 1; st < 50_000_000; st++) {
    const t = { rngState: st };
    if (values.every((v) => 1 + Math.floor(nextRandom(t) * sides) === v)) {
      s.rngState = st;
      return;
    }
  }
  throw new Error("no such seed");
}

const chest = card("Treasure Chest", "Artifact", "{3}", { cmc: 3, oracleText: "{4}, Sacrifice this artifact: Roll a d20.\n1 | Trapped! — You lose 3 life.\n2—9 | Create five Treasure tokens.\n10—19 | You gain 3 life and draw three cards.\n20 | Search your library for a card. If it's an artifact card, you may put it onto the battlefield. Otherwise, put that card into your hand. Then shuffle." });
const crucible = card("Wondrous Crucible", "Artifact", "{7}", { cmc: 7, oracleText: "Permanents you control have ward {2}.\nAt the beginning of your end step, mill two cards, then exile a nonland card at random from your graveyard. Copy it. You may cast the copy without paying its mana cost. (A copy of a permanent spell becomes a token.)" });
const divination = card("Divination", "Sorcery", "{2}{U}", { cmc: 3, oracleText: "Draw two cards." });

describe("Treasure Chest", () => {
  it("is fully supported", () => supported(chest, crucible));

  const roll20 = (found: CardDef) => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, chest);
    const f = into(s0, ap, found, "library");
    rig(s0, 20, [20]);
    let s = resolveAll(run(s0, planActivate(s0, ap, c, 0)));
    expect(zone(s, c)).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = act(s, { type: "searchLibrary", player: ap, found: [f] });
    return { s, ap, f };
  };

  it("on a 20, an artifact card found may go onto the battlefield instead of into your hand", () => {
    const { s, ap, f } = roll20(rock);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    expect(zone(resolveAll(act(s, { type: "chooseMay", player: ap, yes: true })), f)).toBe("battlefield");
    expect(zone(resolveAll(act(s, { type: "chooseMay", player: ap, yes: false })), f)).toBe("hand");
  });

  it("on a 20, any other card goes into your hand, with no question", () => {
    const { s, f } = roll20(bear());
    expect(s.pending?.kind).not.toBe("chooseMay");
    expect(zone(resolveAll(s), f)).toBe("hand");
  });
});

describe("Wondrous Crucible", () => {
  it("at your end step mills two, exiles a nonland card at random and lets you cast a copy free; the card stays exiled", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, crucible);
    const d = into(s0, ap, divination, "graveyard");
    const lands = [into(s0, ap, islandCard, "library"), into(s0, ap, islandCard, "library")];
    const hand = s0.players[ap]!.hand.length;
    let s = passUntil(s0, "end", ap);
    for (let i = 0; i < 20 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    // The lands milled can't be chosen: only Divination is a nonland card there.
    expect(lands.map((l) => zone(s, l))).toEqual(["graveyard", "graveyard"]);
    expect(zone(s, d)).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", options: [d, "none"] });
    s = act(s, { type: "chooseOption", player: ap, choice: d });
    expect(s.pending?.kind).toBe("castFree");
    const copy = s.pending!.kind === "castFree" ? s.pending.objectId : "";
    s = resolveAll(run(s, planCast(s, ap, copy)));
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(zone(s, d)).toBe("exile");
  });

  it("declining the copy leaves the card exiled", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, crucible);
    const d = into(s0, ap, divination, "graveyard");
    into(s0, ap, islandCard, "library");
    into(s0, ap, islandCard, "library");
    let s = passUntil(s0, "end", ap);
    for (let i = 0; i < 20 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: "none" }));
    expect(zone(s, d)).toBe("exile");
    expect(s.pending).toBeFalsy();
  });
});

const nelly = card("Nelly Borca, Impulsive Accuser", "Legendary Creature — Human Detective", "{2}{R}{W}", { cmc: 4, power: "2", toughness: "4", keywords: ["Vigilance"], oracleText: "Vigilance\nWhenever Nelly Borca attacks, suspect target creature. Then goad all suspected creatures. (A suspected creature has menace and can't block.)\nWhenever one or more creatures an opponent controls deal combat damage to one or more of your opponents, you and the controller of those creatures each draw a card." });

describe("Nelly Borca, Impulsive Accuser", () => {
  it("is fully supported", () => supported(nelly));

  it("an opponent's creatures dealing combat damage to your opponents: you and that player each draw, once for the step", () => {
    const { s: s0, ap } = setup([]);
    const [b, c, d] = [next(s0, ap), next(s0, next(s0, ap)), next(s0, next(s0, next(s0, ap)))];
    putOnBattlefield(s0, c, nelly);
    putOnBattlefield(s0, d, { ...nelly, oracleId: "nelly2" });
    const x = putOnBattlefield(s0, ap, bear());
    const y = putOnBattlefield(s0, ap, bear());
    const z = putOnBattlefield(s0, ap, bear());
    const hands = () => [ap, b, c, d].map((p) => s.players[p]!.hand.length);
    let s = s0;
    const before = hands();
    // Two bears hit B (C's and D's opponent), one hits C (D's opponent, but not C's).
    s = attack(s, ap, [{ attacker: x, defender: b }, { attacker: y, defender: b }, { attacker: z, defender: c }]);
    s = passUntil(s, "endCombat", ap);
    s = resolveAll(s);
    const after = hands();
    // C's Nelly: AP and C draw; D's Nelly: AP and D draw, once each though two players were hit.
    expect(after.map((n, i) => n - before[i]!)).toEqual([2, 0, 1, 1]);
  });

  it("not for creatures dealing combat damage only to you, nor for your own creatures", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    putOnBattlefield(s0, b, nelly);
    putOnBattlefield(s0, ap, { ...nelly, oracleId: "nelly2" });
    const x = putOnBattlefield(s0, ap, bear());
    let s = attack(s0, ap, [{ attacker: x, defender: b }]);
    const before = s.players[ap]!.hand.length + s.players[b]!.hand.length;
    s = resolveAll(passUntil(s, "endCombat", ap));
    expect(s.players[ap]!.hand.length + s.players[b]!.hand.length).toBe(before);
  });
});

const artisans = card("Faerie Artisans", "Creature — Faerie Artificer", "{3}{U}", { cmc: 4, power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying\nWhenever a nontoken creature an opponent controls enters, create a token that's a copy of that creature except it's an artifact in addition to its other types. Then exile all other tokens created with this creature." });

describe("Faerie Artisans", () => {
  it("is fully supported", () => supported(artisans));

  it("copies an opponent's nontoken creature as an artifact, then exiles the other tokens it created, not another Artisans'", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    const mine = putOnBattlefield(s0, ap, artisans);
    let s = s0;
    const enter = (pid: PlayerId, def: CardDef) => {
      const id = into(s, pid, def, "hand");
      moveObject(s, id, "battlefield");
      s = resolveAll(s);
      return id;
    };
    const tokens = () => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap);
    enter(b, bear({ name: "First Bear" }));
    expect(tokens().map((id) => nameOf(s, id))).toEqual(["First Bear"]);
    const first = tokens()[0]!;
    expect(characteristics(s, s.objects[first]!).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    // Its own creature or a token entering doesn't trigger it.
    enter(ap, bear({ name: "Own Bear" }));
    expect(tokens()).toEqual([first]);
    // The next one: the first token is exiled, the new one stays.
    enter(b, bear({ name: "Second Bear" }));
    expect(tokens().map((id) => nameOf(s, id))).toEqual(["Second Bear"]);
    expect(s.objects[first]?.zone ?? "gone").not.toBe("battlefield");
    // A token another source created isn't "created with" it.
    const other = putOnBattlefield(s, ap, { ...artisans, oracleId: "artisans2" });
    s.objects[other]!.controller = ap;
    const second = tokens()[0]!;
    // The legend rule doesn't apply (not legendary); the second Artisans' copy leaves the first one's token alone.
    s.battlefield.splice(s.battlefield.indexOf(mine), 1);
    s.objects[mine]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(mine);
    invalidateCharacteristics(s);
    enter(b, bear({ name: "Third Bear" }));
    expect(tokens().map((id) => nameOf(s, id)).sort()).toEqual(["Second Bear", "Third Bear"]);
    expect(tokens()).toContain(second);
  });
});

const mog = card("Summon: Good King Mog XII", "Enchantment Creature — Saga Moogle", "{4}{W}", { cmc: 5, power: "4", toughness: "4", keywords: ["Flying", "Lifelink"], oracleText: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after IV.)\nI — Create two 1/2 white Moogle creature tokens with lifelink.\nII, III — Whenever you cast a noncreature spell this turn, create a token that's a copy of a non-Saga token you control.\nIV — Put two +1/+1 counters on each other Moogle you control.\nFlying, lifelink" });

describe("Summon: Good King Mog XII", () => {
  it("is fully supported", () => supported(mog));

  it("chapter II: this turn, each noncreature spell you cast copies a non-Saga token you control, chosen as it resolves", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, mog);
    s0.objects[m]!.counters = { lore: 1 };
    const moogle = putOnBattlefield(s0, ap, card("Moogle Token", "Token Creature — Moogle", "", { power: "1", toughness: "2", keywords: ["Lifelink"], oracleText: "Lifelink" }));
    s0.objects[moogle]!.isToken = true;
    const rockToken = putOnBattlefield(s0, ap, card("Treasure Token", "Token Artifact — Treasure", "", { oracleText: "{T}, Sacrifice this token: Add one mana of any color." }));
    s0.objects[rockToken]!.isToken = true;
    let s = passUntil(passUntil(s0, "end", ap), "main1", ap);
    s = resolveAll(s);
    expect(s.objects[m]!.counters?.lore).toBe(2);
    const named = (n: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && nameOf(s, id) === n).length;
    const d = into(s, ap, divination, "hand");
    s = run(s, planCast(s, ap, d));
    for (let i = 0; i < 10 && !s.pending && s.triggerQueue.length + s.stack.length > 1; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ player: ap });
    expect(JSON.stringify(s.pending)).toContain(moogle);
    expect(JSON.stringify(s.pending)).not.toContain(m);
    expect(botActions(s, ap).length).toBeGreaterThan(0);
    s = act(s, s.pending!.kind === "pickPermanents" ? { type: "pickPermanents", player: ap, ids: [moogle] } : { type: "chooseOption", player: ap, choice: moogle });
    s = resolveAll(s);
    expect(named("Moogle Token")).toBe(2);
    // A creature spell doesn't trigger it.
    const b = into(s, ap, bear(), "hand");
    s = resolveAll(run(s, planCast(s, ap, b)));
    expect(named("Moogle Token")).toBe(2);
    // It lasts until the turn ends (CR 603.7c).
    expect(s.floatingTriggers?.some((t) => t.sourceId === m)).toBe(true);
    s = passUntil(passUntil(s, "end", ap), "upkeep", next(s, ap));
    expect(s.floatingTriggers?.some((t) => t.sourceId === m) ?? false).toBe(false);
  });
});

const calligrapher = card("Combat Calligrapher", "Creature — Bird Cleric", "{3}{W}", { cmc: 4, power: "3", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nInklings can't attack you or planeswalkers you control.\nWhenever a player attacks one of your opponents, that attacking player creates a tapped 2/1 white and black Inkling creature token with flying that's attacking that opponent." });

describe("Combat Calligrapher", () => {
  it("is fully supported", () => supported(calligrapher));

  it("a player attacking one of your opponents gets a tapped Inkling attacking that opponent; attacking you gives nothing", () => {
    const { s: s0, ap } = setup([]);
    const [b, c] = [next(s0, ap), next(s0, next(s0, ap))];
    putOnBattlefield(s0, c, calligrapher);
    const x = putOnBattlefield(s0, ap, bear());
    const y = putOnBattlefield(s0, ap, bear());
    let s = attack(s0, ap, [{ attacker: x, defender: b }, { attacker: y, defender: c }]);
    s = resolveAll(s);
    const inklings = s.battlefield.filter((id) => s.objects[id]!.isToken && nameOf(s, id).startsWith("Inkling"));
    expect(inklings.length).toBe(1);
    const ink = s.objects[inklings[0]!]!;
    expect(ink.controller).toBe(ap);
    expect(ink.tapped).toBe(true);
    expect(ink.attacking).toBe(b);
  });
});
