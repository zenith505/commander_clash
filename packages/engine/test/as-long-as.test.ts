// Static abilities that apply only "as long as" something is true (CR 604.1, 611.3): Kird Ape's
// "as long as you control a Forest", metalcraft, delirium, descend, "as long as it's attacking",
// "defending player controls", "no untapped lands", modified (CR 700.9), "during your turn".

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const unsupported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(false));
const creature = (name: string, text: string, p = "2", t = "2") => card(name, "Creature — Beast", "{2}", { power: p, toughness: t, oracleText: text });
const artifact = card("Bauble Test", "Artifact", "{1}");

const ape = creature("Ape Test", "This creature gets +1/+2 as long as you control a Forest.", "1", "1");
const metal = creature("Metal Test", "Metalcraft — This creature gets +2/+2 as long as you control three or more artifacts.");
const deli = creature("Delirium Test", "Delirium — This creature gets +1/+1 and has trample as long as there are four or more card types among cards in your graveyard.");
const descend = creature("Descend Test", "Descend 4 — This creature gets +2/+0 as long as there are four or more permanent cards in your graveyard.");
const scythe = creature("Scythe Test", "This creature has first strike as long as it's attacking.");
const beebles = creature("Beebles Test", "This creature can't be blocked as long as defending player controls an artifact.");
const cat = creature("Cat Test", "This creature gets +3/+3 as long as you control no untapped lands.");
const gargoyle = creature("Gargoyle Test", "This creature has flying as long as it's modified.");
const knight = creature("Knight Test", "During your turn, this creature has first strike.");
const kin = creature("Kin Test", "This creature has lifelink as long as you control another white creature.");
const wurm = creature("Wurm Test", "This creature gets +1/+1 as long as an opponent controls an Island.");

const has = (s: GameState, id: string, k: string) => objHasKeyword(s, s.objects[id]!, k);
const toGraveyard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};

describe("as long as", () => {
  it("parses the common forms", () => {
    supported(ape, metal, deli, descend, scythe, beebles, cat, gargoyle, knight, kin, wurm);
    // "This creature has flash as long as ..." works in your hand too: an ability that modifies how the object can be cast
    // functions in any zone it could be cast from (CR 113.6e; rulings on Colossal Rattlewurm), and on the battlefield
    // the permanent has the keyword (round 246).
    supported(creature("Flash Test", "This creature has flash as long as you control a Merfolk."));
    // Each attacking creature has its own defending player.
    unsupported(creature("Tangle Test", "Each creature you control can't be blocked as long as defending player controls an artifact land."));
  });

  it("you control a Forest", () => {
    const { s, ap, opp } = setup([]);
    const mine = putOnBattlefield(s, ap, ape); // setup gives the active player Forests
    const theirs = putOnBattlefield(s, opp, ape);
    expect(pt(s, mine)).toBe("2/3");
    expect(pt(s, theirs)).toBe("1/1");
  });

  it("metalcraft counts the artifacts you control right now", () => {
    const { s, ap } = setup([]);
    const m = putOnBattlefield(s, ap, metal);
    putOnBattlefield(s, ap, artifact);
    putOnBattlefield(s, ap, artifact);
    expect(pt(s, m)).toBe("2/2");
    const third = putOnBattlefield(s, ap, artifact);
    expect(pt(s, m)).toBe("4/4");
    // An effect that turns the third artifact into a non-artifact switches it off again (seen through layer 4).
    addEffect(s, ap, [third], [{ kind: "setTypes", types: ["Creature"], subtypes: [] }]);
    expect(pt(s, m)).toBe("2/2");
  });

  it("delirium counts card types, not cards; descend counts permanent cards", () => {
    const { s, ap } = setup([]);
    const d = putOnBattlefield(s, ap, deli);
    const de = putOnBattlefield(s, ap, descend);
    toGraveyard(s, ap, bear());
    toGraveyard(s, ap, bear());
    toGraveyard(s, ap, card("Shock Test", "Instant", "{R}"));
    toGraveyard(s, ap, card("Forest", "Basic Land — Forest"));
    expect(pt(s, d)).toBe("2/2"); // creature, instant, land: three types
    expect(pt(s, de)).toBe("2/2"); // two Bears and a land: three permanent cards
    toGraveyard(s, ap, card("Ornithopter Test", "Artifact Creature — Thopter", "{0}", { power: "0", toughness: "2" }));
    expect(pt(s, d)).toBe("3/3"); // artifact makes four
    expect(has(s, d, "Trample")).toBe(true);
    expect(pt(s, de)).toBe("4/2");
  });

  it("no untapped lands, another white creature, an opponent controls an Island", () => {
    const { s, ap, opp } = setup([]);
    const c = putOnBattlefield(s, ap, cat);
    const k = putOnBattlefield(s, ap, kin);
    const w = putOnBattlefield(s, ap, wurm);
    expect(pt(s, c)).toBe("2/2");
    for (const id of s.battlefield) if (characteristics(s, s.objects[id]!).types.includes("Land")) s.objects[id]!.tapped = true; // seen without invalidating
    expect(pt(s, c)).toBe("5/5");
    expect(has(s, k, "Lifelink")).toBe(false); // it's not white, and "another" leaves it out anyway
    putOnBattlefield(s, ap, bear({ name: "White Test", colors: ["W"] }));
    expect(has(s, k, "Lifelink")).toBe(true);
    expect(pt(s, w)).toBe("2/2");
    putOnBattlefield(s, opp, card("Island", "Basic Land — Island"));
    expect(pt(s, w)).toBe("3/3");
  });

  it("modified: a counter, or an Aura its controller controls (CR 700.9)", () => {
    const { s, ap, opp } = setup([]);
    const g = putOnBattlefield(s, ap, gargoyle);
    expect(has(s, g, "Flying")).toBe(false);
    const aura = putOnBattlefield(s, opp, card("Aura Test", "Enchantment — Aura", "{W}", { oracleText: "Enchant creature", keywords: ["Enchant"] }));
    s.objects[aura]!.attachedTo = g;
    invalidateCharacteristics(s);
    expect(has(s, g, "Flying")).toBe(false); // an opponent's Aura doesn't make it modified
    s.objects[g]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s);
    expect(has(s, g, "Flying")).toBe(true);
  });

  it("first strike as long as it's attacking; during your turn; can't be blocked if defending player controls an artifact", () => {
    const { s: s0, ap, opp } = setup([]);
    const sc = putOnBattlefield(s0, ap, scythe);
    const kn = putOnBattlefield(s0, ap, knight);
    const be = putOnBattlefield(s0, ap, beebles);
    const theirKnight = putOnBattlefield(s0, opp, knight);
    putOnBattlefield(s0, opp, artifact);
    const blocker = putOnBattlefield(s0, opp, bear());
    expect(has(s0, sc, "First strike")).toBe(false);
    expect(has(s0, kn, "First strike")).toBe(true);
    expect(has(s0, theirKnight, "First strike")).toBe(false);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: sc, defender: opp }, { attacker: be, defender: opp }] });
    expect(has(s, sc, "First strike")).toBe(true);
    for (let i = 0; i < 12 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.player).toBe(opp);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker: be }] })).toThrow(/can't be blocked/);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker: sc }] });
    expect(s.objects[blocker]!.blocking).toBeTruthy();
  });
});
