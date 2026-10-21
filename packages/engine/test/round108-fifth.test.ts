// Round 108, more of the popularity list: Wound Reflection ("the life they lost this turn"), Maha ("have base toughness
// 1", layer 7b), Rise of the Witch-king ("if you sacrificed a creature this way ... another permanent card"), Witness
// Protection ("named Legitimate Businessperson", a text-changing effect in layer 3), Skrelv's Hive ("creatures you
// control with toxic"), Crippling Fear ("creatures that aren't of the chosen type"), Wake the Past ("they gain haste"
// after returning them all) and kicked cast triggers (Sowing Mycospawn, Wastescape Battlemage).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planCast, power, toughness, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const wound = card("Wound Reflection", "Enchantment", "{5}{B}", {
  oracleText: "At the beginning of each end step, each opponent loses life equal to the life they lost this turn. (Damage causes loss of life.)",
});
const maha = card("Maha, Its Feathers Night", "Legendary Creature — Elemental Bird", "{3}{B}{B}", {
  power: "6",
  toughness: "5",
  keywords: ["Flying", "Trample", "Ward"],
  oracleText: "Flying, trample\nWard—Discard a card.\nCreatures your opponents control have base toughness 1.",
});
const rise = card("Rise of the Witch-king", "Sorcery", "{2}{B}{G}", {
  oracleText: "Each player sacrifices a creature of their choice. If you sacrificed a creature this way, you may return another permanent card from your graveyard to the battlefield.",
});
const witness = card("Witness Protection", "Enchantment — Aura", "{U}", {
  keywords: ["Enchant"],
  oracleText:
    "Enchant creature\nEnchanted creature loses all abilities and is a green and white Citizen creature with base power and toughness 1/1 named Legitimate Businessperson. (It loses all other colors, card types, creature types, and names.)",
});
const hive = card("Skrelv's Hive", "Enchantment", "{1}{W}", {
  keywords: ["Corrupted"],
  oracleText:
    'At the beginning of your upkeep, you lose 1 life and create a 1/1 colorless Phyrexian Mite artifact creature token with toxic 1 and "This token can\'t block."\nCorrupted — As long as an opponent has three or more poison counters, creatures you control with toxic have lifelink.',
});
const fear = card("Crippling Fear", "Sorcery", "{2}{B}{B}", { oracleText: "Choose a creature type. Creatures that aren't of the chosen type get -3/-3 until end of turn." });
const wake = card("Wake the Past", "Sorcery", "{5}{R}{W}", { oracleText: "Return all artifact cards from your graveyard to the battlefield. They gain haste until end of turn." });
const mycospawn = card("Sowing Mycospawn", "Creature — Eldrazi Fungus", "{3}{G}", {
  power: "3",
  toughness: "3",
  keywords: ["Devoid", "Kicker"],
  oracleText:
    "Devoid (This card has no color.)\nKicker {1}{C} (You may pay an additional {1}{C} as you cast this spell.)\nWhen you cast this spell, search your library for a land card, put it onto the battlefield, then shuffle.\nWhen you cast this spell, if it was kicked, exile target land.",
});
const battlemage = card("Wastescape Battlemage", "Creature — Eldrazi Wizard", "{1}{C}", {
  power: "2",
  toughness: "2",
  keywords: ["Kicker"],
  oracleText:
    "Kicker {G} and/or {1}{U}\nWhen you cast this spell, if it was kicked with its {G} kicker, exile target artifact or enchantment an opponent controls.\nWhen you cast this spell, if it was kicked with its {1}{U} kicker, return target creature an opponent controls to its owner's hand.",
});
// Test cards.
const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." });
const relic = card("Test Relic", "Artifact", "{1}");
const toxic = card("Test Stinger", "Creature — Insect", "{1}{B}", { power: "1", toughness: "1", keywords: ["Toxic"], oracleText: "Toxic 2" });
const golem = card("Test Golem", "Artifact Creature — Golem", "{3}", { power: "3", toughness: "3" });
const elf = card("Test Elf", "Creature — Elf", "{G}", { power: "4", toughness: "4" });
const flyer = card("Test Flyer", "Legendary Artifact Creature — Bird", "{3}{U}", { power: "3", toughness: "3", keywords: ["Flying"], oracleText: "Flying" });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;
const inGraveyard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
};

describe("Wound Reflection", () => {
  it("at each end step, each opponent loses as much life again as they lost this turn; one who lost none loses none", () => {
    supported(wound);
    const { s: s0, ap, ids } = setup([shock]);
    let s = s0;
    putOnBattlefield(s, ap, wound);
    const opp = next(s, ap);
    const other = next(s, opp);
    s = settle(cast(s, ap, ids[0]!, [{ kind: "player", id: opp }]));
    const [a, b] = [s.players[opp]!.life, s.players[other]!.life];
    s = settle(passUntil(s, "end"));
    expect(s.players[opp]!.life).toBe(a - 2);
    expect(s.players[other]!.life).toBe(b);
  });
});

describe("Maha, Its Feathers Night", () => {
  it("opponents' creatures have base toughness 1; counters and pumps still apply; yours don't change", () => {
    supported(maha);
    const { s, ap } = setup([]);
    const opp = next(s, ap);
    const theirs = putOnBattlefield(s, opp, bear());
    const pumped = putOnBattlefield(s, opp, bear({ name: "Pumped Bear" }));
    s.objects[pumped]!.counters["+1/+1"] = 2;
    const mine = putOnBattlefield(s, ap, bear({ name: "My Bear" }));
    putOnBattlefield(s, ap, maha);
    expect([power(s, s.objects[theirs]!), toughness(s, s.objects[theirs]!)]).toEqual([2, 1]);
    expect([power(s, s.objects[pumped]!), toughness(s, s.objects[pumped]!)]).toEqual([4, 3]);
    expect([power(s, s.objects[mine]!), toughness(s, s.objects[mine]!)]).toEqual([2, 2]);
  });
});

describe("Rise of the Witch-king", () => {
  it("each player sacrifices a creature; then you may return another permanent card, not the one you sacrificed", () => {
    supported(rise);
    const { s: s0, ap, ids } = setup([rise]);
    let s = s0;
    const opp = next(s, ap);
    const mine = putOnBattlefield(s, ap, bear({ name: "My Bear" }));
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    const old = inGraveyard(s, ap, relic);
    const spell = inGraveyard(s, ap, shock);
    s = settle(cast(s, ap, ids[0]!));
    for (const id of [mine, theirs]) expect(s.objects[id]!.zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const cards = (s.pending as { cards: string[] }).cards;
    expect(cards).toContain(old);
    expect(cards).not.toContain(mine);
    expect(cards).not.toContain(spell);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [old] }));
    expect(s.objects[old]!.zone).toBe("battlefield");
  });

  it("no creature of yours to sacrifice: nothing comes back", () => {
    const { s: s0, ap, ids } = setup([rise]);
    let s = s0;
    const opp = next(s, ap);
    putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    const old = inGraveyard(s, ap, relic);
    s = settle(cast(s, ap, ids[0]!));
    expect(s.pending).toBeNull();
    expect(s.objects[old]!.zone).toBe("graveyard");
  });
});

describe("Witness Protection", () => {
  it("a 1/1 green and white Citizen creature named Legitimate Businessperson with no abilities; still legendary", () => {
    supported(witness);
    const { s: s0, ap, ids } = setup([witness]);
    let s = s0;
    const opp = next(s, ap);
    const f = putOnBattlefield(s, opp, flyer);
    s = settle(cast(s, ap, ids[0]!, [target(f)]));
    const c = characteristics(s, s.objects[f]!);
    expect(c.name).toBe("Legitimate Businessperson");
    expect(c.types).toEqual(["Creature"]);
    expect(c.subtypes).toEqual(["Citizen"]);
    expect([...c.colors].sort()).toEqual(["G", "W"]);
    expect(c.supertypes).toContain("Legendary");
    expect([c.power, c.toughness]).toEqual([1, 1]);
    expect(objHasKeyword(s, s.objects[f]!, "Flying")).toBe(false);
  });
});

describe("Skrelv's Hive", () => {
  it("your upkeep: lose 1 life and a Mite with toxic; with an opponent at three poison, your toxic creatures have lifelink", () => {
    supported(hive);
    const { s: s0, ap } = setup([]);
    let s = s0;
    putOnBattlefield(s, ap, hive);
    const sting = putOnBattlefield(s, ap, toxic);
    const plain = putOnBattlefield(s, ap, bear());
    const opp = next(s, ap);
    expect(objHasKeyword(s, s.objects[sting]!, "Lifelink")).toBe(false);
    s.players[opp]!.poison = 3;
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[sting]!, "Lifelink")).toBe(true);
    expect(objHasKeyword(s, s.objects[plain]!, "Lifelink")).toBe(false);
    s.players[opp]!.poison = 0;
    invalidateCharacteristics(s);
    const life = s.players[ap]!.life;
    s = passUntil(s, "upkeep", ap);
    s = settle(s);
    expect(s.players[ap]!.life).toBe(life - 1);
    const mite = s.battlefield.find((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Mite"))!;
    expect(mite).toBeDefined();
    s.players[opp]!.poison = 3;
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[mite]!, "Lifelink")).toBe(true);
  });
});

describe("Crippling Fear", () => {
  it("creatures that aren't of the chosen type get -3/-3; the chosen type's don't", () => {
    supported(fear);
    const { s: s0, ap, ids } = setup([fear]);
    let s = s0;
    const opp = next(s, ap);
    const e = putOnBattlefield(s, opp, elf);
    const b = putOnBattlefield(s, opp, bear({ toughness: "4" }));
    s = cast(s, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Elf" }));
    expect(toughness(s, s.objects[e]!)).toBe(4);
    expect([power(s, s.objects[b]!), toughness(s, s.objects[b]!)]).toEqual([-1, 1]);
  });
});

describe("Wake the Past", () => {
  it("returns every artifact card from your graveyard, and they have haste this turn", () => {
    supported(wake);
    const { s: s0, ap, ids } = setup([wake]);
    let s = s0;
    const g = inGraveyard(s, ap, golem);
    const r = inGraveyard(s, ap, relic);
    const b = inGraveyard(s, ap, bear());
    s = settle(cast(s, ap, ids[0]!));
    for (const id of [g, r]) expect(s.objects[id]!.zone).toBe("battlefield");
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(objHasKeyword(s, s.objects[g]!, "Haste")).toBe(true);
    s = passUntil(s, "upkeep");
    expect(objHasKeyword(s, s.objects[g]!, "Haste")).toBe(false);
  });
});

describe("Sowing Mycospawn", () => {
  it("kicked: its cast trigger exiles the target land; not kicked: no such trigger", () => {
    supported(mycospawn);
    for (const kicked of [false, true]) {
      const { s: s0, ap, ids } = setup([mycospawn]);
      let s = s0;
      const opp = next(s, ap);
      const land = putOnBattlefield(s, opp, card("Test Land", "Land"));
      putOnBattlefield(s, ap, card("Wastes", "Basic Land", "", { oracleText: "{T}: Add {C}." }));
      s = planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, kicked ? { kicks: [0] } : {})!.reduce((x, a) => act(x, a), s);
      for (let i = 0; i < 20 && s.pending; i++) {
        const p = s.pending!;
        if (p.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [target(land)] });
        else if (p.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: ap, found: [] });
        else throw new Error(p.kind);
        s = settle(s);
      }
      s = settle(s);
      expect(s.objects[land]!.zone).toBe(kicked ? "exile" : "battlefield");
    }
  });
});

describe("Wastescape Battlemage", () => {
  it("only the trigger for the kicker paid", () => {
    supported(battlemage);
    const { s: s0, ap, ids } = setup([battlemage]);
    let s = s0;
    const opp = next(s, ap);
    const r = putOnBattlefield(s, opp, relic);
    const b = putOnBattlefield(s, opp, bear());
    putOnBattlefield(s, ap, card("Wastes", "Basic Land", "", { oracleText: "{T}: Add {C}." }));
    s = planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { kicks: [0] })!.reduce((x, a) => act(x, a), s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(r)] }));
    expect(s.pending).toBeNull();
    expect(s.objects[r]!.zone).toBe("exile");
    expect(s.objects[b]!.zone).toBe("battlefield");
  });
});
