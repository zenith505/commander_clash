// Round 103: All Will Be One ("whenever you put one or more counters on a permanent or player": counters on players
// too, once for each permanent or player, and toxic counters from several creatures at once are one event: rulings).

import { describe, expect, it } from "vitest";
import { act, activate, card, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, planCast, waitingOn, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const allWillBeOne = card("All Will Be One", "Enchantment", "{3}{R}{R}", { oracleText: "Whenever you put one or more counters on a permanent or player, this enchantment deals that much damage to target opponent, creature an opponent controls, or planeswalker an opponent controls." });
const growth = card("Battlegrowth", "Instant", "{G}", { oracleText: "Put a +1/+1 counter on target creature." });
const toxic = (name: string) => card(name, "Creature — Phyrexian", "{1}{B}", { power: "1", toughness: "1", keywords: ["Toxic"], oracleText: "Toxic 2 (Players dealt combat damage by this creature also get two poison counters.)" });
const energy = card("Glimmer of Genius", "Instant", "{3}{U}", { oracleText: "Scry 2. Draw two cards. You get {E}{E}." });

const laezel = card("Lae'zel, Vlaakith's Champion", "Legendary Creature — Gith Warrior", "{2}{W}", { power: "3", toughness: "3", oracleText: "If you would put one or more counters on a creature or planeswalker you control or on yourself, put that many plus one of each of those kinds of counters on that permanent or player instead.\nChoose a Background (You can have a Background as a second commander.)" });
const samson = card("Doc Samson, Super Psychiatrist", "Legendary Creature — Gamma Doctor Hero", "{4}{G}", { power: "5", toughness: "5", oracleText: "If you would put one or more counters on a permanent you control, put that many plus one of each of those kinds of counters on that permanent instead.\n{T}: Add X mana of any one color, where X is Doc Samson's power." });

const cleric = card("Cleric Class", "Enchantment — Class", "{W}", { oracleText: "(Gain the next level as a sorcery to add its ability.)\nIf you would gain life, you gain that much life plus 1 instead.\n{3}{W}: Level 2\nWhenever you gain life, put a +1/+1 counter on target creature you control.\n{4}{W}: Level 3\nWhen this Class becomes level 3, return target creature card from your graveyard to the battlefield. You gain life equal to that creature's toughness." });

const mantle = card("Mantle of the Ancients", "Enchantment — Aura", "{3}{W}{W}", { oracleText: "Enchant creature you control\nWhen this Aura enters, return any number of target Aura and/or Equipment cards from your graveyard to the battlefield attached to enchanted creature.\nEnchanted creature gets +1/+1 for each Aura and Equipment attached to it." });
const rancor = card("Ancestral Mask Test", "Enchantment — Aura", "{G}", { oracleText: "Enchant creature\nEnchanted creature gets +2/+2." });
const landAura = card("Utopia Sprawl", "Enchantment — Aura", "{G}", { oracleText: "Enchant Forest\nAs this Aura enters, choose a color.\nWhenever enchanted Forest is tapped for mana, its controller adds an additional one mana of the chosen color." });
const sword = card("Bonesplitter", "Artifact — Equipment", "{1}", { oracleText: "Equipped creature gets +2/+0.\nEquip {1}" });

const pass = (s: GameState) => act(s, { type: "passPriority", player: waitingOn(s)! });
const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = pass(s);
  return s;
};

describe("round 103: All Will Be One", () => {
  it("parse", () => expect(isFullySupported(allWillBeOne)).toBe(true));

  it("counters on a permanent: that much damage to an opponent", () => {
    const { s: s0, ap, ids, opp } = setup([growth]);
    putOnBattlefield(s0, ap, allWillBeOne);
    const mine = putOnBattlefield(s0, ap, card("Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [target(mine)])!) s = act(s, a);
    s = settle(s);
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(1);
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    s = settle(s);
    expect(s.players[opp]!.life).toBe(39);
  });

  it("energy counters on you trigger it too", () => {
    const { s: s0, ap, ids, opp } = setup([energy]);
    putOnBattlefield(s0, ap, allWillBeOne);
    const theirs = putOnBattlefield(s0, opp, card("Big Bear", "Creature — Bear", "{1}{G}", { power: "5", toughness: "5" }));
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    s = settle(s);
    if (s.pending?.kind === "arrangeTop") s = settle(act(s, { type: "arrangeTop", player: ap, top: s.pending.cards, away: [] }));
    expect(s.players[ap]!.energy).toBe(2);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(theirs)] }));
    expect(s.objects[theirs]!.damage).toBe(2);
  });

  it("toxic from two creatures at once: one trigger for all the poison counters", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, allWillBeOne);
    const a1 = putOnBattlefield(s0, ap, toxic("Toxic One"));
    const a2 = putOnBattlefield(s0, ap, toxic("Toxic Two"));
    let s = passUntil(s0, "beginCombat", ap);
    for (let i = 0; i < 20 && s.pending?.kind !== "declareAttackers"; i++) s = pass(s);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a1, defender: opp }, { attacker: a2, defender: opp }] });
    for (let i = 0; i < 40 && !(s.pending?.kind === "chooseTargets"); i++) {
      if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.players[opp]!.poison).toBe(4);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp as PlayerId }] }));
    expect(s.pending).toBeFalsy();
    expect(s.players[opp]!.life).toBe(40 - 2 - 4);
  });
});

describe("round 103: Lae'zel and Doc Samson", () => {
  it("parse", () => [laezel, samson].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Lae'zel: one more on your creature, and on you; not on an opponent's creature or a noncreature", () => {
    const { s: s0, ap, ids, opp } = setup([growth, growth, energy]);
    putOnBattlefield(s0, ap, laezel);
    const mine = putOnBattlefield(s0, ap, card("Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    const theirs = putOnBattlefield(s0, opp, card("Their Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [target(mine)])!) s = act(s, a);
    s = settle(s);
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(2);
    for (const a of planCast(s, ap, ids[1]!, [target(theirs)])!) s = act(s, a);
    s = settle(s);
    expect(s.objects[theirs]!.counters["+1/+1"]).toBe(1);
    for (const a of planCast(s, ap, ids[2]!)!) s = act(s, a);
    s = settle(s);
    if (s.pending?.kind === "arrangeTop") s = settle(act(s, { type: "arrangeTop", player: ap, top: s.pending.cards, away: [] }));
    expect(s.players[ap]!.energy).toBe(3);
  });

  it("Lae'zel: not on counters an opponent puts on your creature", () => {
    const { s: s0, ap, ids, opp } = setup([growth]);
    putOnBattlefield(s0, opp, laezel);
    const theirs = putOnBattlefield(s0, opp, card("Their Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [target(theirs)])!) s = act(s, a);
    s = settle(s);
    expect(s.objects[theirs]!.counters["+1/+1"]).toBe(1);
  });

  it("Doc Samson: one more on any permanent you control, not on you", () => {
    const { s: s0, ap, ids } = setup([growth, energy]);
    putOnBattlefield(s0, ap, samson);
    const mine = putOnBattlefield(s0, ap, card("Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [target(mine)])!) s = act(s, a);
    s = settle(s);
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(2);
    for (const a of planCast(s, ap, ids[1]!)!) s = act(s, a);
    s = settle(s);
    if (s.pending?.kind === "arrangeTop") s = settle(act(s, { type: "arrangeTop", player: ap, top: s.pending.cards, away: [] }));
    expect(s.players[ap]!.energy).toBe(2);
  });
});

describe("round 103: Cleric Class", () => {
  it("parse", () => expect(isFullySupported(cleric)).toBe(true));

  it("level 3 returns a creature card and gains life equal to its toughness on the battlefield, plus 1", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, cleric);
    s0.objects[c]!.classLevel = 2;
    const dead = putOnBattlefield(s0, ap, card("Wall Thing", "Creature — Wall", "{2}{W}", { power: "1", toughness: "4" }));
    s0.battlefield.splice(s0.battlefield.indexOf(dead), 1);
    s0.objects[dead]!.zone = "graveyard";
    s0.players[ap]!.graveyard.push(dead);
    // An anthem: its toughness on the battlefield counts (rulings).
    putOnBattlefield(s0, ap, card("Glorious Anthem", "Enchantment", "{1}{W}{W}", { oracleText: "Creatures you control get +1/+1." }));
    let s = activate(s0, ap, c, 1);
    s = settle(s);
    expect(s.objects[c]!.classLevel).toBe(3);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(dead)] }));
    expect(s.objects[dead]!.zone).toBe("battlefield");
    expect(s.players[ap]!.life).toBe(40 + 5 + 1);
    // Level 2: a +1/+1 counter for the life gained.
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(dead)] }));
    expect(s.objects[dead]!.counters["+1/+1"]).toBe(1);
  });
});

describe("round 103: Mantle of the Ancients", () => {
  it("parse", () => [mantle, rancor, sword].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("returns Auras and Equipment attached to the enchanted creature; one that can't enchant it stays", () => {
    const { s: s0, ap, ids } = setup([mantle]);
    const b = putOnBattlefield(s0, ap, card("Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    const yard = [rancor, landAura, sword].map((d) => {
      const id = putOnBattlefield(s0, ap, d);
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "graveyard";
      s0.players[ap]!.graveyard.push(id);
      return id;
    });
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [target(b)])!) s = act(s, a);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: yard.map(target) }));
    expect(s.objects[yard[0]!]!.attachedTo).toBe(b);
    expect(s.objects[yard[2]!]!.attachedTo).toBe(b);
    expect(s.objects[yard[1]!]!.zone).toBe("graveyard");
    // 2/2, +2/+2 and +2/+0, and +1/+1 for each of the three attached.
    expect(pt(s, b)).toBe("9/7");
  });
});
