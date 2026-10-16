// Enchanted, equipped and modified permanents (CR 700.9: a modified permanent has a counter, is equipped, or is
// enchanted by an Aura its controller controls): "enchanted creatures you control get +2/+2", "equipped creatures you
// control get +1/+1", "modified creatures you control have trample", "enchant modified creature", "destroy target
// enchanted permanent", "destroy all creatures that aren't enchanted". A creature that dies is seen as it last existed.

import { describe, expect, it } from "vitest";
import { bear, card, cast, pt, putOnBattlefield, setup, target } from "./helpers";
import { invalidateCharacteristics, isFullySupported, objHasKeyword, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const taleForTheAges = card("A Tale for the Ages", "Enchantment", "{1}{W}", { oracleText: "Enchanted creatures you control get +2/+2." });
const outfitter = card("Stone Haven Outfitter", "Creature — Kor Artificer Ally", "{1}{W}", { power: "2", toughness: "2", oracleText: "Equipped creatures you control get +1/+1.\nWhenever an equipped creature you control dies, draw a card." });
const kodama = card("Kodama of the West Tree", "Legendary Creature — Spirit", "{2}{G}", { power: "3", toughness: "3", keywords: ["Reach"], oracleText: "Reach\nModified creatures you control have trample. (Equipment, Auras you control, and counters are modifications.)\nWhenever a modified creature you control deals combat damage to a player, search your library for a basic land card, put it onto the battlefield tapped, then shuffle." });
const lionUmbra = card("Lion Umbra", "Enchantment — Aura", "{G}{G}", { keywords: ["Umbra armor", "Enchant"], oracleText: "Enchant modified creature (Equipment, Auras its controller controls, and counters are modifications.)\nEnchanted creature gets +3/+3 and has reach and vigilance.\nUmbra armor (If enchanted creature would be destroyed, instead remove all damage from it and destroy this Aura.)" });
const emberKeeper = card("Akki Ember-Keeper", "Enchantment Creature — Goblin Warrior", "{1}{R}", { power: "2", toughness: "1", oracleText: "Whenever a nontoken modified creature you control dies, create a 1/1 colorless Spirit creature token. (Equipment, Auras you control, and counters are modifications.)" });
const upriser = card("Upriser Renegade", "Creature — Human Samurai", "{1}{R}", { power: "1", toughness: "3", oracleText: "This creature gets +2/+0 for each other modified creature you control. (Equipment, Auras you control, and counters are modifications.)" });
const venomousVines = card("Venomous Vines", "Sorcery", "{2}{G}{G}", { oracleText: "Destroy target enchanted permanent." });
const windsOfRath = card("Winds of Rath", "Sorcery", "{3}{W}{W}", { oracleText: "Destroy all creatures that aren't enchanted. They can't be regenerated." });
const korBlademaster = card("Kor Blademaster", "Creature — Kor Warrior", "{1}{W}", { power: "1", toughness: "1", keywords: ["Double strike"], oracleText: "Double strike\nEquipped Warriors you control have double strike." });
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
const shortSword = card("Short Sword", "Artifact — Equipment", "{1}", { keywords: ["Equip"], oracleText: "Equipped creature gets +1/+1.\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)" });
const pacifism = card("Pacifism", "Enchantment — Aura", "{1}{W}", { keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature can't attack or block." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
/** Puts `def` (an Aura or Equipment) onto the battlefield under `pid`, attached to `host`. */
function attach(s: GameState, pid: PlayerId, def: CardDef, host: string) {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = host;
  invalidateCharacteristics(s);
  return id;
}
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === name);

describe("enchanted, equipped and modified creatures", () => {
  it("parses these", () => {
    supported(taleForTheAges, outfitter, kodama, lionUmbra, emberKeeper, upriser, venomousVines, windsOfRath, korBlademaster);
  });

  it("A Tale for the Ages: only your creatures enchanted by an Aura get +2/+2, whoever controls the Aura", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, taleForTheAges);
    const mine = putOnBattlefield(s, ap, bear());
    const plain = putOnBattlefield(s, ap, bear({ name: "Plain Bear" }));
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    attach(s, opp, pacifism, mine);
    attach(s, ap, pacifism, theirs);
    expect(pt(s, mine)).toBe("4/4");
    expect(pt(s, plain)).toBe("2/2");
    expect(pt(s, theirs)).toBe("2/2");
  });

  it("Stone Haven Outfitter: equipped creatures get +1/+1, and one dying draws a card", () => {
    const { s: s0, ap, ids } = setup([murder]);
    putOnBattlefield(s0, ap, outfitter);
    const b = putOnBattlefield(s0, ap, bear());
    attach(s0, ap, shortSword, b);
    expect(pt(s0, b)).toBe("4/4");
    const hand = s0.players[ap]!.hand.length;
    const s = cast(s0, ap, ids[0]!, [target(b)]);
    expect(s.objects[b]!.zone).toBe("graveyard");
    // Murder left the hand; the trigger drew one.
    expect(s.players[ap]!.hand.length).toBe(hand);
  });

  it("Kodama of the West Tree: trample for a creature with a counter, an Equipment or your Aura, not an opponent's Aura", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, kodama);
    const [countered, equipped, enchanted, oppAura, plain] = ["A", "B", "C", "D", "E"].map((n) => putOnBattlefield(s, ap, bear({ name: `Bear ${n}` })));
    s.objects[countered!]!.counters = { "+1/+1": 1 };
    attach(s, ap, shortSword, equipped!);
    attach(s, ap, pacifism, enchanted!);
    attach(s, opp, pacifism, oppAura!);
    const trample = (id: string) => objHasKeyword(s, s.objects[id]!, "Trample");
    expect([countered, equipped, enchanted, oppAura, plain].map((id) => trample(id!))).toEqual([true, true, true, false, false]);
  });

  it("Upriser Renegade: +2/+0 for each other modified creature you control", () => {
    const { s, ap, opp } = setup([]);
    const u = putOnBattlefield(s, ap, upriser);
    const a = putOnBattlefield(s, ap, bear());
    const b = putOnBattlefield(s, ap, bear({ name: "Bear B" }));
    const c = putOnBattlefield(s, ap, bear({ name: "Bear C" }));
    expect(pt(s, u)).toBe("1/3");
    s.objects[a]!.counters = { "+1/+1": 1 };
    attach(s, ap, shortSword, b);
    attach(s, opp, pacifism, c);
    invalidateCharacteristics(s);
    expect(pt(s, u)).toBe("5/3");
    // Itself modified doesn't count ("other").
    s.objects[u]!.counters = { "+1/+1": 1 };
    invalidateCharacteristics(s);
    expect(pt(s, u)).toBe("6/4");
  });

  it("Lion Umbra can enchant only a modified creature", () => {
    const { s: s0, ap, ids } = setup([lionUmbra, lionUmbra]);
    const plain = putOnBattlefield(s0, ap, bear());
    const countered = putOnBattlefield(s0, ap, bear({ name: "Counter Bear" }));
    s0.objects[countered]!.counters = { "+1/+1": 1 };
    invalidateCharacteristics(s0);
    expect(() => cast(s0, ap, ids[0]!, [target(plain)])).toThrow(/can't cast/);
    const s = cast(s0, ap, ids[0]!, [target(countered)]);
    expect(s.objects[ids[0]!]!.attachedTo).toBe(countered);
    expect(pt(s, countered)).toBe("6/6");
  });

  it("Akki Ember-Keeper: a Spirit for a nontoken modified creature of yours that dies, seen as it last existed", () => {
    const { s: s0, ap, opp, ids } = setup([murder, murder, murder]);
    putOnBattlefield(s0, ap, emberKeeper);
    const countered = putOnBattlefield(s0, ap, bear());
    const equipped = putOnBattlefield(s0, ap, bear({ name: "Equipped Bear" }));
    const oppAura = putOnBattlefield(s0, ap, bear({ name: "Pacified Bear" }));
    s0.objects[countered]!.counters = { "+1/+1": 1 };
    attach(s0, ap, shortSword, equipped);
    attach(s0, opp, pacifism, oppAura);
    let s = cast(s0, ap, ids[0]!, [target(countered)]);
    expect(named(s, ap, "Spirit Token")).toHaveLength(1);
    for (const id of s.battlefield) s.objects[id]!.tapped = false;
    s = cast(s, ap, ids[1]!, [target(equipped)]);
    expect(named(s, ap, "Spirit Token")).toHaveLength(2);
    for (const id of s.battlefield) s.objects[id]!.tapped = false;
    s = cast(s, ap, ids[2]!, [target(oppAura)]);
    expect(named(s, ap, "Spirit Token")).toHaveLength(2);
  });

  it("Venomous Vines targets only an enchanted permanent", () => {
    const { s: s0, ap, opp, ids } = setup([venomousVines]);
    const plain = putOnBattlefield(s0, opp, bear());
    const enchanted = putOnBattlefield(s0, opp, bear({ name: "Enchanted Bear" }));
    attach(s0, ap, pacifism, enchanted);
    expect(() => cast(s0, ap, ids[0]!, [target(plain)])).toThrow(/can't cast/);
    const s = cast(s0, ap, ids[0]!, [target(enchanted)]);
    expect(s.objects[enchanted]!.zone).toBe("graveyard");
  });

  it("Winds of Rath: destroys every creature that isn't enchanted, with no regeneration", () => {
    const { s: s0, ap, opp, ids } = setup([windsOfRath]);
    const enchanted = putOnBattlefield(s0, opp, bear());
    const plain = putOnBattlefield(s0, opp, bear({ name: "Plain Bear" }));
    const shielded = putOnBattlefield(s0, ap, bear({ name: "Shielded Bear" }));
    attach(s0, ap, pacifism, enchanted);
    s0.objects[shielded]!.regenShields = 1;
    const s = cast(s0, ap, ids[0]!, []);
    expect(s.objects[enchanted]!.zone).toBe("battlefield");
    expect(s.objects[plain]!.zone).toBe("graveyard");
    expect(s.objects[shielded]!.zone).toBe("graveyard");
  });

  it("Kor Blademaster: equipped Warriors you control have double strike", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, korBlademaster);
    const warrior = putOnBattlefield(s, ap, card("Test Warrior", "Creature — Human Warrior", "{1}{R}", { power: "2", toughness: "2" }));
    const bearId = putOnBattlefield(s, ap, bear());
    expect(objHasKeyword(s, s.objects[warrior]!, "Double strike")).toBe(false);
    attach(s, ap, shortSword, warrior);
    attach(s, ap, shortSword, bearId);
    expect(objHasKeyword(s, s.objects[warrior]!, "Double strike")).toBe(true);
    expect(objHasKeyword(s, s.objects[bearId]!, "Double strike")).toBe(false);
  });
});
