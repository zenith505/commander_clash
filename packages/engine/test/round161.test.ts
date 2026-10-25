// Round 161: the most played cards, in popularity order, starting with Tithing Blade (craft).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { abilitiesOf, abilityProblem, botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

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

const rock = card("Test Rock", "Artifact", "{2}", { cmc: 2 });
const islandCard = card("Island", "Basic Land — Island");

describe("round 161 cards", () => {
  it("are fully supported", () => supported(tithing, visage, hulk, bricks, idol, iceberg, stonetree, needle, landmark));
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
