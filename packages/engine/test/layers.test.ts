// The layer system (CR 613) and the cards built on it: static abilities, Auras, Equipment,
// control changes, "loses all abilities", setting and switching power/toughness.
// Where the Comprehensive Rules give a worked example, the test reproduces it.

import { describe, expect, it } from "vitest";
import {
  abilityProblem,
  botActions,
  characteristics,
  compileCard,
  controllerOf,
  createGame,
  invalidateCharacteristics,
  isFullySupported,
  objHasKeyword,
  planActivate,
  planCast,
  potentialAttackers,
  power,
  setCharacteristicsCache,
  toughness,
  waitingOn,
  type CardDef,
  type GameState,
  type Modification,
  type PlayerId,
  type TargetChoice,
} from "../src";
import { act, activate, addEffect, bear, card, cast, commander, forest, island, mountain, passAll, passUntil, plainsCard, pt, putOnBattlefield, setup, target } from "./helpers";

const grayOgre = card("Gray Ogre", "Creature — Ogre", "{2}{R}", { power: "2", toughness: "2" });
const anthem02 = card("Wall Anthem", "Enchantment", "{1}{W}", { oracleText: "Creatures you control get +0/+2." });
const honor = card("Honor of the Pure", "Enchantment", "{1}{W}", { oracleText: "White creatures you control get +1/+1." });
const giantGrowth4 = card("Big Growth", "Instant", "{G}", { oracleText: "Target creature gets +4/+4 until end of turn." });
const shrink01 = card("Shrink", "Instant", "{U}", { oracleText: "Target creature has base power and toughness 0/1 until end of turn." });
const switcheroo = card("Switcheroo", "Instant", "{U}", { oracleText: "Switch target creature's power and toughness until end of turn." });
const whiten = card("Whiten", "Instant", "{W}", { oracleText: "Target creature becomes white until end of turn." });
const redden = card("Redden", "Instant", "{R}", { oracleText: "Target creature becomes red until end of turn." });
const frog = card("Turn to Frog", "Instant", "{1}{U}", {
  oracleText: "Until end of turn, target creature loses all abilities and becomes a blue Frog with base power and toughness 1/1.",
});
const treason = card("Act of Treason", "Sorcery", "{2}{R}", {
  oracleText: "Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn.",
});
const mindControl = card("Mind Control", "Enchantment — Aura", "{3}{U}{U}", { oracleText: "Enchant creature\nYou control enchanted creature.", keywords: ["Enchant"] });
const pacifism = card("Pacifism", "Enchantment — Aura", "{1}{W}", { oracleText: "Enchant creature\nEnchanted creature can't attack or block.", keywords: ["Enchant"] });
const rancor = card("Holy Strength", "Enchantment — Aura", "{W}", { oracleText: "Enchant creature\nEnchanted creature gets +1/+2.", keywords: ["Enchant"] });
const sword = card("Bonesplitter", "Artifact — Equipment", "{1}", { oracleText: "Equipped creature gets +2/+0.\nEquip {1}", keywords: ["Equip"] });
const elf = (name = "Llanowar Elf") => card(name, "Creature — Elf", "{G}", { power: "1", toughness: "1" });
const elfLord = card("Elvish Archdruid", "Creature — Elf Druid", "{1}{G}{G}", { power: "2", toughness: "2", oracleText: "Other Elf creatures you control get +1/+1." });
const elfFlier = card("Wing Lord", "Creature — Elf", "{2}{G}", { power: "2", toughness: "2", oracleText: "Elves you control have flying." });
const silence = card("Silence", "Instant", "{U}", { oracleText: "Target creature loses all abilities until end of turn." });

describe("layer 7: power and toughness", () => {
  it("CR 613.5 example: counter, +4/+4, +0/+2 anthem, then 'becomes 0/1' gives 5/8", () => {
    const { s: s0, ap, ids } = setup([giantGrowth4, anthem02, shrink01]);
    const ogre = putOnBattlefield(s0, ap, grayOgre);
    s0.objects[ogre]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    expect(pt(s0, ogre)).toBe("3/3");
    let s = cast(s0, ap, ids[0]!, [target(ogre)]);
    expect(pt(s, ogre)).toBe("7/7");
    s = cast(s, ap, ids[1]!);
    expect(pt(s, ogre)).toBe("7/9");
    s = cast(s, ap, ids[2]!, [target(ogre)]);
    expect(pt(s, ogre)).toBe("5/8"); // 0/1 (7b), then +4/+4, +0/+2 and +1/+1 (7c)
  });

  it("CR 613.4d examples: switching applies after all modifications", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, card("One Three", "Creature — Wall", "{1}", { power: "1", toughness: "3" }));
    const plus01 = addEffect(s0, ap, [c], [{ kind: "modifyPT", power: 0, toughness: 1 }]);
    const sw = addEffect(s0, ap, [c], [{ kind: "switchPT" }]);
    expect(pt(s0, c)).toBe("4/1");
    addEffect(s0, ap, [c], [{ kind: "modifyPT", power: 5, toughness: 0 }]);
    expect(pt(s0, c)).toBe("4/6"); // unswitched would be 6/4
    // If the +0/+1 ends before the switch does, it becomes 3/1 (ignoring the +5/+0 here).
    s0.effects = s0.effects.filter((e) => e === sw);
    invalidateCharacteristics(s0);
    expect(pt(s0, c)).toBe("3/1");
    // Two switches cancel out: 1/3 with +0/+1 becomes 1/4.
    s0.effects = [plus01, sw];
    addEffect(s0, ap, [c], [{ kind: "switchPT" }]);
    expect(pt(s0, c)).toBe("1/4");
  });

  it("switching via a spell: a 0/3 becomes 3/0 and dies to the state-based action (CR 704.5f)", () => {
    const { s: s0, ap, ids } = setup([switcheroo, switcheroo]);
    const wall = putOnBattlefield(s0, ap, card("Wall of Wood", "Creature — Wall", "{G}", { power: "0", toughness: "3" }));
    const b = putOnBattlefield(s0, ap, card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "1" }));
    let s = cast(s0, ap, ids[0]!, [target(wall)]);
    expect(s.objects[wall]!.zone).toBe("graveyard");
    s = cast(s, ap, ids[1]!, [target(b)]);
    expect(pt(s, b)).toBe("1/3");
    s = passUntil(s, "upkeep");
    expect(pt(s, b)).toBe("3/1");
  });

  it("setting base P/T (7b) happens before +N/+N (7c) regardless of timestamps", () => {
    const { s: s0, ap, ids } = setup([giantGrowth4, shrink01]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = cast(s0, ap, ids[0]!, [target(b)]); // +4/+4 first
    s = cast(s, ap, ids[1]!, [target(b)]); // then base 0/1
    expect(pt(s, b)).toBe("4/5");
  });
});

describe("static abilities (CR 611.3) and color (layer 5)", () => {
  it("CR 613.5 example: Honor of the Pure follows color changes as they happen", () => {
    const { s: s0, ap, ids } = setup([honor, whiten, redden]);
    const black = putOnBattlefield(s0, ap, card("Black Bear", "Creature — Bear", "{1}{B}", { power: "2", toughness: "2" }));
    let s = cast(s0, ap, ids[0]!);
    expect(pt(s, black)).toBe("2/2");
    s = cast(s, ap, ids[1]!, [target(black)]);
    expect(characteristics(s, s.objects[black]!).colors).toEqual(["W"]);
    expect(pt(s, black)).toBe("3/3");
    s = cast(s, ap, ids[2]!, [target(black)]);
    expect(pt(s, black)).toBe("2/2");
  });

  it("anthems apply to creatures that enter later; resolved pumps don't (CR 611.2c vs 611.3a)", () => {
    const rally = card("Rally", "Instant", "{W}", { oracleText: "Creatures you control get +1/+1 until end of turn." });
    const { s: s0, ap, ids } = setup([anthem02, rally, bear({ name: "Late Bear" })]);
    const early = putOnBattlefield(s0, ap, bear());
    let s = cast(s0, ap, ids[0]!);
    s = cast(s, ap, ids[1]!);
    expect(pt(s, early)).toBe("3/5");
    s = cast(s, ap, ids[2]!);
    expect(pt(s, ids[2]!)).toBe("2/4"); // anthem yes, Rally no
  });

  it("anthems only count your creatures, and follow control changes (layer 2 before 7c)", () => {
    const { s: s0, ap, ids, opp } = setup([anthem02, treason]);
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = cast(s0, ap, ids[0]!);
    expect(pt(s, theirs)).toBe("2/2");
    s = cast(s, ap, ids[1]!, [target(theirs)]);
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
    expect(pt(s, theirs)).toBe("2/4");
  });

  it("lords: 'other Elf creatures you control' excludes the lord and other players' elves", () => {
    const { s, ap, opp } = setup([]);
    const lord = putOnBattlefield(s, ap, elfLord);
    const mine = putOnBattlefield(s, ap, elf());
    const theirs = putOnBattlefield(s, opp, elf());
    expect([pt(s, lord), pt(s, mine), pt(s, theirs)]).toEqual(["2/2", "2/2", "1/1"]);
  });

  it("CR 613.9 example: the later of 'has flying' and 'loses flying' wins", () => {
    const { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, bear());
    addEffect(s, ap, [b], [{ kind: "addKeywords", keywords: ["Flying"] }]);
    addEffect(s, ap, [b], [{ kind: "removeKeywords", keywords: ["Flying"] }]);
    expect(objHasKeyword(s, s.objects[b]!, "Flying")).toBe(false);
    addEffect(s, ap, [b], [{ kind: "addKeywords", keywords: ["Flying"] }]);
    expect(objHasKeyword(s, s.objects[b]!, "Flying")).toBe(true);
  });
});

describe("layer 6: losing abilities", () => {
  it("Turn to Frog: loses flying, becomes a blue 1/1 Frog, keeps counters and other bonuses", () => {
    const { s: s0, ap, ids } = setup([anthem02, frog]);
    const drake = putOnBattlefield(s0, ap, card("Drake", "Creature — Drake", "{2}{U}", { power: "3", toughness: "3", keywords: ["Flying"] }));
    s0.objects[drake]!.counters["+1/+1"] = 1;
    let s = cast(s0, ap, ids[0]!);
    expect(pt(s, drake)).toBe("4/6");
    s = cast(s, ap, ids[1]!, [target(drake)]);
    const c = characteristics(s, s.objects[drake]!);
    expect(c.subtypes).toEqual(["Frog"]);
    expect(c.colors).toEqual(["U"]);
    expect(c.types).toEqual(["Creature"]);
    expect(objHasKeyword(s, s.objects[drake]!, "Flying")).toBe(false);
    expect(pt(s, drake)).toBe("2/4"); // 1/1 + counter + anthem
    s = passUntil(s, "upkeep");
    expect(pt(s, drake)).toBe("4/6");
    expect(objHasKeyword(s, s.objects[drake]!, "Flying")).toBe(true);
  });

  it("a lord that loses its abilities stops boosting (its static ability no longer exists)", () => {
    const { s: s0, ap, ids } = setup([silence]);
    const lord = putOnBattlefield(s0, ap, elfLord);
    const e = putOnBattlefield(s0, ap, elf());
    expect(pt(s0, e)).toBe("2/2");
    const s = cast(s0, ap, ids[0]!, [target(lord)]);
    expect(pt(s, e)).toBe("1/1");
  });

  it("dependency (CR 613.8): a later 'loses all abilities' on the source applies before an earlier ability-granting static", () => {
    // By timestamp alone, Wing Lord's grant (earlier) would apply first and the elves would keep flying.
    // But applying the loss changes whether the grant exists, so the grant depends on it and waits (CR 613.8a-b).
    const { s, ap } = setup([]);
    const lord = putOnBattlefield(s, ap, elfFlier);
    const e = putOnBattlefield(s, ap, elf());
    expect(objHasKeyword(s, s.objects[e]!, "Flying")).toBe(true);
    addEffect(s, ap, [lord], [{ kind: "loseAllAbilities" }]);
    expect(objHasKeyword(s, s.objects[e]!, "Flying")).toBe(false);
    expect(objHasKeyword(s, s.objects[lord]!, "Flying")).toBe(false);
  });

  it("a creature that lost its abilities doesn't trigger, even as it dies (last known information)", () => {
    const doomed = card("Doomed Traveler", "Creature — Human Soldier", "{W}", { power: "1", toughness: "1", oracleText: "When this creature dies, each opponent loses 2 life." });
    const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
    const { s: s0, ap, ids, opp } = setup([silence, bolt]);
    const d = putOnBattlefield(s0, ap, doomed);
    let s = cast(s0, ap, ids[0]!, [target(d)]);
    s = cast(s, ap, ids[1]!, [target(d)]);
    expect(s.objects[d]!.zone).toBe("graveyard");
    expect(s.triggerQueue).toHaveLength(0);
    expect(s.stack).toHaveLength(0);
    expect(s.players[opp]!.life).toBe(40);
  });

  it("'can't block' is an ability: losing all abilities lets it block", () => {
    const wall = card("Craven", "Creature — Goblin", "{R}", { power: "2", toughness: "2", oracleText: "This creature can't block." });
    const { s, ap } = setup([]);
    const c = putOnBattlefield(s, ap, wall);
    expect(characteristics(s, s.objects[c]!).cantBlock).toBe(true);
    addEffect(s, ap, [c], [{ kind: "loseAllAbilities" }]);
    expect(characteristics(s, s.objects[c]!).cantBlock).toBe(false);
  });
});

describe("layer 2: control", () => {
  it("Act of Treason: gain control, untap, haste; it can attack; control returns at cleanup (CR 613.6 example)", () => {
    const { s: s0, ap, ids, opp } = setup([treason]);
    const theirs = putOnBattlefield(s0, opp, bear());
    s0.objects[theirs]!.tapped = true;
    let s = cast(s0, ap, ids[0]!, [target(theirs)]);
    const o = () => s.objects[theirs]!;
    expect(controllerOf(s, o())).toBe(ap);
    expect(o().tapped).toBe(false);
    expect(objHasKeyword(s, o(), "Haste")).toBe(true);
    expect(potentialAttackers(s, ap).map((x) => x.id)).toContain(theirs);
    s = passUntil(s, "upkeep");
    expect(controllerOf(s, o())).toBe(opp);
    expect(objHasKeyword(s, o(), "Haste")).toBe(false);
  });

  it("without haste, a stolen creature is summoning sick for its new controller (CR 302.6)", () => {
    const steal = card("Steal", "Sorcery", "{2}{U}", { oracleText: "Gain control of target creature until end of turn." });
    const { s: s0, ap, ids, opp } = setup([steal]);
    const theirs = putOnBattlefield(s0, opp, bear());
    const s = cast(s0, ap, ids[0]!, [target(theirs)]);
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
    expect(potentialAttackers(s, ap).map((x) => x.id)).not.toContain(theirs);
  });

  it("Mind Control: control lasts while the Aura is attached, and ends when it leaves", () => {
    const naturalize = card("Naturalize", "Instant", "{1}{G}", { oracleText: "Destroy target artifact or enchantment." });
    const { s: s0, ap, ids, opp } = setup([mindControl, naturalize]);
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = cast(s0, ap, ids[0]!, [target(theirs)]);
    expect(s.objects[ids[0]!]!.attachedTo).toBe(theirs);
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
    s = cast(s, ap, ids[1]!, [target(ids[0]!)]);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(controllerOf(s, s.objects[theirs]!)).toBe(opp);
  });

  it("when a player leaves the game, effects giving them control end (CR 800.4a)", () => {
    const { s: s0, ap, ids, opp } = setup([treason]);
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = cast(s0, ap, ids[0]!, [target(theirs)]);
    s = act(s, { type: "concede", player: ap });
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[theirs]!)).toBe(opp);
  });
});

describe("paying mana with stolen permanents", () => {
  it("only the current controller can tap a stolen land for mana, including when paying automatically", () => {
    const { s, ap, opp } = setup([]);
    const land = putOnBattlefield(s, opp, plainsCard);
    addEffect(s, ap, [land], [{ kind: "control" }], "game");
    const glory = card("Small Glory", "Sorcery", "{W}", { oracleText: "You gain 1 life." });
    // The thief's automatic payment uses it (it used to look at the owner instead).
    s.cards[glory.oracleId] = glory;
    for (const id of s.battlefield) if (id !== land) s.objects[id]!.tapped = true; // only the stolen Plains is untapped
    const g = putOnBattlefield(s, ap, glory);
    s.battlefield.splice(s.battlefield.indexOf(g), 1);
    s.objects[g]!.zone = "hand";
    s.players[ap]!.hand.push(g);
    const plan = planCast(s, ap, g)!;
    expect(plan[0]).toEqual({ type: "activateMana", player: ap, objectId: land, mana: "W", ability: 0 });
  });
});

describe("Auras (CR 303.4) and Equipment (CR 301.5)", () => {
  it("compiles enchant, statics and equip; these cards count as supported", () => {
    expect(compileCard(pacifism).enchant?.types).toEqual(["Creature"]);
    expect(compileCard(pacifism).statics[0]!.mods.map((m) => m.kind)).toEqual(["cantAttack", "cantBlock"]);
    expect(compileCard(sword).activated[0]!.sorcerySpeed).toBe(true);
    for (const c of [pacifism, rancor, sword, mindControl, elfLord, honor, frog, treason]) expect(isFullySupported(c)).toBe(true);
  });

  it("an Aura spell targets; on resolution it enters attached and its static applies", () => {
    const { s: s0, ap, ids } = setup([rancor]);
    const b = putOnBattlefield(s0, ap, bear());
    const s = cast(s0, ap, ids[0]!, [target(b)]);
    expect(s.objects[ids[0]!]!.attachedTo).toBe(b);
    expect(pt(s, b)).toBe("3/4");
  });

  it("an Aura spell whose target is gone doesn't resolve and goes to the graveyard (CR 608.2b)", () => {
    const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
    const { s: s0, ap, ids } = setup([rancor, bolt]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [target(b)])!) s = act(s, a);
    for (const a of planCast(s, ap, ids[1]!, [target(b)])!) s = act(s, a); // in response
    s = passAll(s); // bolt resolves
    s = passAll(s); // aura tries to resolve
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.objects[ids[0]!]!.attachedTo).toBeUndefined();
  });

  it("Pacifism stops attacking and blocking; when the creature dies the Aura goes to the graveyard (CR 704.5m)", () => {
    const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
    const { s: s0, ap, ids } = setup([pacifism, bolt]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = cast(s0, ap, ids[0]!, [target(b)]);
    expect(potentialAttackers(s, ap).map((x) => x.id)).not.toContain(b);
    expect(characteristics(s, s.objects[b]!).cantBlock).toBe(true);
    s = cast(s, ap, ids[1]!, [target(b)]);
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("an Aura with 'enchant creature' falls off when its creature stops being a creature", () => {
    const { s: s0, ap, ids } = setup([rancor]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = cast(s0, ap, ids[0]!, [target(b)]);
    addEffect(s, ap, [b], [{ kind: "setTypes", types: ["Artifact"], subtypes: [] }]);
    s = act(s, { type: "passPriority", player: waitingOn(s)! }); // any action runs state-based actions
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("Equipment: equip at sorcery speed to your creature, moves on re-equip, stays when the creature dies (CR 704.5n)", () => {
    const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
    const { s: s0, ap, ids, opp } = setup([sword, bolt]);
    const b1 = putOnBattlefield(s0, ap, bear());
    const b2 = putOnBattlefield(s0, ap, bear({ name: "Other Bear" }));
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = cast(s0, ap, ids[0]!);
    const eq = ids[0]!;
    expect(abilityProblem(s, ap, eq, 0, [target(theirs)])).toMatch(/illegal target/); // only creatures you control
    s = activate(s, ap, eq, 0, [target(b1)]);
    expect(s.objects[eq]!.attachedTo).toBe(b1);
    expect(pt(s, b1)).toBe("4/2");
    s = activate(s, ap, eq, 0, [target(b2)]);
    expect([pt(s, b1), pt(s, b2)]).toEqual(["2/2", "4/2"]);
    s = cast(s, ap, ids[1]!, [target(b2)]);
    expect(s.objects[b2]!.zone).toBe("graveyard");
    expect(s.objects[eq]!.zone).toBe("battlefield");
    expect(s.objects[eq]!.attachedTo).toBeUndefined();
  });

  it("bots aim harmful Auras at opponents and equip their own creatures", () => {
    const { s: s0, ap, ids, opp } = setup([pacifism]);
    s0.players[ap]!.hand = [ids[0]!]; // nothing else to do
    s0.players[ap]!.command = [];
    putOnBattlefield(s0, ap, bear({ name: "Mine" }));
    const big = putOnBattlefield(s0, opp, card("Big Thing", "Creature — Beast", "{4}{G}", { power: "6", toughness: "6" }));
    const plan = botActions(s0, ap);
    const castIt = plan.find((a) => a.type === "castSpell");
    expect(castIt && castIt.type === "castSpell" && castIt.objectId === ids[0] && castIt.targets).toEqual([target(big)]);
  });
});

describe("caching", () => {
  it("bot games play out identically with and without the characteristics cache", () => {
    const pool = [anthem02, honor, pacifism, rancor, sword, mindControl, elfLord, elfFlier, treason, frog, silence, giantGrowth4, switcheroo];
    const run = (seed: number) => {
      const deck = () => [
        ...Array.from({ length: 38 }, () => forest),
        ...Array.from({ length: 6 }, () => plainsCard),
        ...Array.from({ length: 6 }, () => island),
        ...Array.from({ length: 6 }, () => mountain),
        ...pool.map((c) => ({ ...c, oracleId: `${c.oracleId}` })),
        ...Array.from({ length: 30 }, () => bear()),
      ];
      let s = createGame(["A", "B", "C", "D"].map((name, i) => ({ name, commander: commander(`C${i}`), deck: deck(), isBot: true })), seed);
      for (let i = 0; i < 3000 && !s.over; i++) for (const a of botActions(s, waitingOn(s)!)) s = act(s, a);
      return s.log.map((e) => e.text).join("\n");
    };
    for (const seed of [1, 2]) {
      const cached = run(seed);
      setCharacteristicsCache(false);
      try {
        expect(run(seed)).toBe(cached);
      } finally {
        setCharacteristicsCache(true);
      }
    }
  }, 180_000);
});
