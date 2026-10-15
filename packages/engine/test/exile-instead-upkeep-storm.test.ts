// "If ~/a creature an opponent controls would die, exile it instead" (CR 614.1a, 700.4); "At the beginning of the
// upkeep of enchanted creature's controller" (CR 503.1a); commander storm, "copy it for each time you've cast your
// commander from the command zone this game" (copies, CR 707.10; Empyrial Storm); and this round's smaller lines.

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { characteristics, invalidateCharacteristics, isFullySupported, manaValue, objHasKeyword, spellCost, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const gloomshrieker = card("Gloomshrieker", "Enchantment Creature — Cat Beast", "{1}{B}{G}", {
  power: "2",
  toughness: "1",
  keywords: ["Menace"],
  oracleText: "Menace (This creature can't be blocked except by two or more creatures.)\nWhen this creature enters, return target permanent card from your graveyard to your hand.\nIf this creature would die, exile it instead.",
});
const stone = card("Stone of Erech", "Legendary Artifact", "{1}", { oracleText: "If a creature an opponent controls would die, exile it instead.\n{2}, {T}, Sacrifice Stone of Erech: Exile target player's graveyard. Draw a card." });
const vengeance = card("Akroma's Vengeance", "Sorcery", "{4}{W}{W}", { keywords: ["Cycling"], oracleText: "Destroy all artifacts, creatures, and enchantments.\nCycling {3} ({3}, Discard this card: Draw a card.)" });
const bond = card("Parasitic Bond", "Enchantment — Aura", "{3}{B}", { oracleText: "Enchant creature\nAt the beginning of the upkeep of enchanted creature's controller, this Aura deals 2 damage to that player." });
const bleed = card("Soul Bleed", "Enchantment — Aura", "{2}{B}", { oracleText: "Enchant creature\nAt the beginning of the upkeep of enchanted creature's controller, that player loses 1 life." });
const storm = card("Empyrial Storm", "Sorcery", "{4}{W}{W}", { oracleText: "When you cast this spell, copy it for each time you've cast your commander from the command zone this game.\nCreate a 4/4 white Angel creature token with flying." });
const bury = card("Bury in Books", "Instant", "{4}{U}", { oracleText: "This spell costs {2} less to cast if it targets an attacking creature.\nPut target creature into its owner's library second from the top." });
const boil = card("Boil", "Instant", "{3}{R}", { oracleText: "Destroy all Islands." });
const drifter = card("Tide Drifter", "Creature — Eldrazi Drone", "{1}{U}", { power: "0", toughness: "5", keywords: ["Devoid"], oracleText: "Devoid (This card has no color.)\nOther colorless creatures you control get +0/+1." });
const adventurer = card("Veteran Adventurer", "Creature — Human", "{5}{G}", {
  power: "5",
  toughness: "5",
  keywords: ["Vigilance"],
  oracleText: "Veteran Adventurer is also a Cleric, Rogue, Warrior, and Wizard.\nThis spell costs {1} less to cast for each creature in your party.\nVigilance",
});
const knife = card("Knife", "Artifact — Clue Equipment", "{R}", { keywords: ["Equip"], oracleText: "During your turn, equipped creature gets +1/+0 and has first strike.\n{2}, Sacrifice this Equipment: Draw a card.\nEquip {2}" });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const ornithopter = card("Ornithopter", "Artifact Creature — Thopter", "{0}", { power: "0", toughness: "2", keywords: ["Flying"] });
const island = card("Island", "Basic Land — Island");

const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const attach = (s: GameState, pid: PlayerId, def: CardDef, to: string) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = to;
  invalidateCharacteristics(s);
  return id;
};
const lifes = (s: GameState) => s.turnOrder.map((p) => s.players[p]!.life);

describe("exile it instead of dying", () => {
  it("compile", () => {
    for (const d of [gloomshrieker, stone, bond, bleed, storm, bury, boil, drifter, adventurer, knife]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Gloomshrieker is exiled instead of going to the graveyard", () => {
    const { s: s0, ap, ids } = setup([shock]);
    const g = putOnBattlefield(s0, ap, gloomshrieker);
    const s = settle(cast(s0, ap, ids[0]!, [target(g)]));
    expect(s.objects[g]!.zone).toBe("exile");
  });

  it("Stone of Erech exiles opponents' creatures, not yours", () => {
    const { s: s0, ap, ids, opp } = setup([shock, shock]);
    putOnBattlefield(s0, ap, stone);
    const theirs = putOnBattlefield(s0, opp, bear());
    const mine = putOnBattlefield(s0, ap, bear());
    let s = settle(cast(s0, ap, ids[0]!, [target(theirs)]));
    s = settle(cast(s, ap, ids[1]!, [target(mine)]));
    expect([s.objects[theirs]!.zone, s.objects[mine]!.zone]).toEqual(["exile", "graveyard"]);
  });

  it("dying at the same time as Stone of Erech, the creature is still exiled", () => {
    const { s: s0, ap, ids, opp } = setup([vengeance]);
    const st = putOnBattlefield(s0, ap, stone);
    const theirs = putOnBattlefield(s0, opp, bear());
    const s = settle(cast(s0, ap, ids[0]!));
    expect([s.objects[st]!.zone, s.objects[theirs]!.zone]).toEqual(["graveyard", "exile"]);
  });
});

describe("at the beginning of the upkeep of enchanted creature's controller", () => {
  it("Soul Bleed and Parasitic Bond trigger only on that player's upkeep", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, opp, bear());
    attach(s0, ap, bleed, b);
    attach(s0, ap, bond, b);
    const before = lifes(s0);
    const i = s0.turnOrder.indexOf(opp);
    let s = passUntil(s0, "draw", opp);
    expect(lifes(s)).toEqual(before.map((l, j) => (j === i ? l - 3 : l)));
    const third = s.turnOrder[(i + 1) % 4]!;
    s = passUntil(passUntil(s, "draw", third), "draw", ap);
    expect(lifes(s)).toEqual(before.map((l, j) => (j === i ? l - 3 : l)));
  });

  it("it follows the creature's controller, not the Aura's", () => {
    const { s: s0, ap, opp } = setup([]);
    const mine = putOnBattlefield(s0, ap, bear());
    attach(s0, opp, bleed, mine);
    const life = s0.players[ap]!.life;
    let s = passUntil(s0, "draw", opp);
    expect(s.players[ap]!.life).toBe(life);
    s = passUntil(s, "draw", ap);
    expect(s.players[ap]!.life).toBe(life - 1);
  });
});

describe("commander storm", () => {
  it("Empyrial Storm is copied once for each time you've cast your commander from the command zone", () => {
    const { s: s0, ap, ids } = setup([storm, storm]);
    const angels = (s: GameState) => s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Angel")).length;
    let s = settle(cast(structuredClone(s0), ap, ids[0]!));
    expect(angels(s)).toBe(1);
    s0.players[ap]!.commanderCasts = { c1: 2 };
    s = settle(cast(s0, ap, ids[1]!));
    expect(angels(s)).toBe(3);
  });
});

describe("smaller lines", () => {
  it("Bury in Books puts the creature second from the top of its owner's library", () => {
    const { s: s0, ap, ids, opp } = setup([bury]);
    const b = putOnBattlefield(s0, opp, bear());
    const top = s0.players[opp]!.library[0];
    const s = settle(cast(s0, ap, ids[0]!, [target(b)]));
    expect(s.players[opp]!.library.slice(0, 2)).toEqual([top, b]);
  });

  it("Boil destroys all Islands, whoever controls them", () => {
    const { s: s0, ap, ids, opp } = setup([boil]);
    const theirs = putOnBattlefield(s0, opp, island);
    const s = settle(cast(s0, ap, ids[0]!));
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.battlefield.some((id) => characteristics(s, s.objects[id]!).subtypes.includes("Island"))).toBe(false);
  });

  it("Tide Drifter: other colorless creatures you control get +0/+1", () => {
    const { s, ap } = setup([]);
    const d = putOnBattlefield(s, ap, drifter);
    const o = putOnBattlefield(s, ap, ornithopter);
    const g = putOnBattlefield(s, ap, bear());
    expect([pt(s, d), pt(s, o), pt(s, g)]).toEqual(["0/5", "0/3", "2/2"]);
  });

  it("Veteran Adventurer has its extra creature types and fills the whole party alone", () => {
    const { s: s0, ap, ids } = setup([adventurer]);
    const c = putOnBattlefield(s0, ap, bear({ name: "Cleric", typeLine: "Creature — Human Cleric", subtypes: ["Human", "Cleric"] }));
    const cost = () => {
      const x = spellCost(s0, ap, s0.objects[ids[0]!]!);
      return manaValue(x.cost) + x.extra;
    };
    expect(cost()).toBe(5);
    s0.battlefield.splice(s0.battlefield.indexOf(c), 1);
    s0.objects[c]!.zone = "graveyard";
    invalidateCharacteristics(s0);
    const s = settle(cast(s0, ap, ids[0]!));
    expect(characteristics(s, s.objects[ids[0]!]!).subtypes).toEqual(expect.arrayContaining(["Human", "Cleric", "Rogue", "Warrior", "Wizard"]));
  });

  it("Knife gives +1/+0 and first strike only during its controller's turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bear());
    attach(s0, ap, knife, b);
    expect([pt(s0, b), objHasKeyword(s0, s0.objects[b]!, "First strike")]).toEqual(["3/2", true]);
    const s = passUntil(s0, "upkeep", opp);
    expect([pt(s, b), objHasKeyword(s, s.objects[b]!, "First strike")]).toEqual(["2/2", false]);
  });
});
