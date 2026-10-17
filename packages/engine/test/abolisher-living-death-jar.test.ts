// Grand Abolisher (opponents can't cast or activate abilities of artifacts, creatures or enchantments during your turn),
// Living Death (CR 608.2c: each part for every player at once), Parallax Wave (CR 607.2a: the cards it exiled come
// back when it leaves) and Memory Jar (hands exiled face down, back at the next end step).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { abilityProblem, castProblem, isFullySupported, manaAbilityProblem, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const grandAbolisher = card("Grand Abolisher", "Creature — Human Cleric", "{W}{W}", { power: "2", toughness: "2", oracleText: "During your turn, your opponents can't cast spells or activate abilities of artifacts, creatures, or enchantments." });
const myrel = card("Myrel, Shield of Argive", "Legendary Creature — Human Soldier", "{3}{W}", { power: "3", toughness: "4", oracleText: "During your turn, your opponents can't cast spells or activate abilities of artifacts, creatures, or enchantments.\nWhenever Myrel attacks, create X 1/1 colorless Soldier artifact creature tokens, where X is the number of Soldiers you control." });
const livingDeath = card("Living Death", "Sorcery", "{3}{B}{B}", { oracleText: "Each player exiles all creature cards from their graveyard, then sacrifices all creatures they control, then puts all cards they exiled this way onto the battlefield." });
const livingEnd = card("Living End", "Sorcery", "", { keywords: ["Suspend"], oracleText: "Suspend 3—{2}{B}{B}\nEach player exiles all creature cards from their graveyard, then sacrifices all creatures they control, then puts all cards they exiled this way onto the battlefield." });
const parallaxWave = card("Parallax Wave", "Enchantment", "{2}{W}{W}", { keywords: ["Fading"], oracleText: "Fading 5 (This enchantment enters with five fade counters on it. At the beginning of your upkeep, remove a fade counter from it. If you can't, sacrifice it.)\nRemove a fade counter from this enchantment: Exile target creature.\nWhen this enchantment leaves the battlefield, each player returns to the battlefield all cards they own exiled with it." });
const parallaxTide = card("Parallax Tide", "Enchantment", "{2}{U}{U}", { keywords: ["Fading"], oracleText: "Fading 5 (This enchantment enters with five fade counters on it. At the beginning of your upkeep, remove a fade counter from it. If you can't, sacrifice it.)\nRemove a fade counter from this enchantment: Exile target land.\nWhen this enchantment leaves the battlefield, each player returns to the battlefield all cards they own exiled with it." });
const memoryJar = card("Memory Jar", "Artifact", "{5}", { oracleText: "{T}, Sacrifice this artifact: Each player exiles all cards from their hand face down and draws seven cards. At the beginning of the next end step, each player discards their hand and returns to their hand each card they exiled this way." });
const magusJar = card("Magus of the Jar", "Creature — Human Wizard", "{3}{U}{U}", { power: "3", toughness: "3", oracleText: "{T}, Sacrifice this creature: Each player exiles all cards from their hand face down and draws seven cards. At the beginning of the next end step, each player discards their hand and returns to their hand each card they exiled this way." });
const llanowarElves = card("Llanowar Elves", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1", oracleText: "{T}: Add {G}." });
const solRing = card("Sol Ring", "Artifact", "{1}", { oracleText: "{T}: Add {C}{C}." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const disenchant = card("Disenchant", "Instant", "{1}{W}", { oracleText: "Destroy target artifact or enchantment." });
const pinger = card("Prodigal Pyromancer", "Creature — Human Wizard", "{2}{R}", { power: "1", toughness: "1", oracleText: "{T}: This creature deals 1 damage to any target." });
const cycler = card("Cycling Test", "Creature — Beast", "{3}{G}", { power: "3", toughness: "3", keywords: ["Cycling"], oracleText: "Cycling {2}" });

function toZone(s: GameState, pid: PlayerId, d: CardDef, zone: "hand" | "graveyard") {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  s.players[pid]![zone].push(id);
  return id;
}

describe("Grand Abolisher", () => {
  it("is supported", () => [grandAbolisher, myrel, livingDeath, livingEnd, parallaxWave, parallaxTide, memoryJar, magusJar].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("during your turn, opponents can't cast spells or activate abilities of artifacts and creatures, mana abilities too; lands and cards in hand are fine", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, grandAbolisher);
    const elves = putOnBattlefield(s0, opp, llanowarElves);
    const ring = putOnBattlefield(s0, opp, solRing);
    const ping = putOnBattlefield(s0, opp, pinger);
    const land = putOnBattlefield(s0, opp, card("Mountain", "Basic Land — Mountain"));
    const bolt = toZone(s0, opp, shock, "hand");
    const cyc = toZone(s0, opp, cycler, "hand");
    let s = act(s0, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    expect(castProblem(s, opp, bolt)).toMatch(/Grand Abolisher: opponents can't cast spells/);
    expect(manaAbilityProblem(s, opp, s.objects[elves]!, 0)).toMatch(/Grand Abolisher/);
    expect(manaAbilityProblem(s, opp, s.objects[ring]!, 0)).toMatch(/Grand Abolisher/);
    expect(abilityProblem(s, opp, ping, 0)).toMatch(/Grand Abolisher/);
    expect(manaAbilityProblem(s, opp, s.objects[land]!, 0)).toBeNull();
    // Cycling from a hand isn't stopped (rulings).
    expect(abilityProblem(s, opp, cyc, 0)).not.toMatch(/Grand Abolisher/);
    // On the opponent's own turn, all of it is fine.
    s = passUntil(s, "main1", opp);
    expect(manaAbilityProblem(s, opp, s.objects[elves]!, 0)).toBeNull();
    expect(abilityProblem(s, opp, ping, 0)).toBeNull();
    expect(castProblem(s, opp, bolt)).not.toMatch(/Grand Abolisher/);
  });

  it("you yourself can still cast and activate on your turn", () => {
    const { s, ap, ids } = setup([shock]);
    putOnBattlefield(s, ap, grandAbolisher);
    const elves = putOnBattlefield(s, ap, llanowarElves);
    expect(planCast(s, ap, ids[0]!, [{ kind: "player", id: s.turnOrder[1]! }])).not.toBeNull();
    expect(manaAbilityProblem(s, ap, s.objects[elves]!, 0)).toBeNull();
  });
});

describe("Living Death", () => {
  it("everyone's creature cards come back; the creatures that were on the battlefield go to the graveyard and stay there", () => {
    const { s: s0, ap, ids, opp } = setup([livingDeath]);
    const mine = toZone(s0, ap, bear({ name: "Yard Bear" }), "graveyard");
    const theirs = toZone(s0, opp, bear({ name: "Their Yard Bear" }), "graveyard");
    const land = toZone(s0, opp, card("Forest", "Basic Land — Forest"), "graveyard");
    const a = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const b = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const s = cast(s0, ap, ids[0]!);
    expect(s.objects[mine]).toMatchObject({ zone: "battlefield", controller: ap });
    expect(s.objects[theirs]).toMatchObject({ zone: "battlefield", controller: opp });
    expect(s.objects[land]!.zone).toBe("graveyard");
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.players[ap]!.graveyard).toContain(ids[0]);
  });

  it("a creature card you own in an opponent's control returns to you: each player's own graveyard", () => {
    const { s: s0, ap, ids, opp } = setup([livingDeath]);
    // Your bear, controlled by the opponent: it's sacrificed by them and goes to your graveyard, not back.
    const stolen = putOnBattlefield(s0, ap, bear({ name: "Stolen Bear" }));
    s0.objects[stolen]!.controller = opp;
    const s = cast(s0, ap, ids[0]!);
    expect(s.objects[stolen]!.zone).toBe("graveyard");
    expect(s.players[ap]!.graveyard).toContain(stolen);
  });
});

describe("Parallax Wave", () => {
  it("exiles creatures with its fade counters; when it leaves, each comes back under its owner's control", () => {
    const { s: s0, ap, opp, ids } = setup([disenchant]);
    const wave = putOnBattlefield(s0, ap, parallaxWave);
    s0.objects[wave]!.counters.fade = 5;
    const x = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const y = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    let s = activate(s0, ap, wave, 0, [target(x)]);
    s = activate(s, ap, wave, 0, [target(y)]);
    expect(s.objects[x]!.zone).toBe("exile");
    expect(s.objects[y]!.zone).toBe("exile");
    expect(s.objects[wave]!.counters.fade).toBe(3);
    s = cast(s, ap, ids[0]!, [target(wave)]);
    s = passUntilStackEmpty(s);
    expect(s.objects[x]).toMatchObject({ zone: "battlefield", controller: opp });
    expect(s.objects[y]).toMatchObject({ zone: "battlefield", controller: ap });
  });

  it("a creature exiled after the Wave left stays exiled (the leaves trigger already resolved)", () => {
    const { s: s0, ap, opp, ids } = setup([disenchant]);
    const wave = putOnBattlefield(s0, ap, parallaxWave);
    s0.objects[wave]!.counters.fade = 5;
    const x = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const plan = [{ type: "activateAbility" as const, player: ap, objectId: wave, index: 0, targets: [target(x)] }];
    let s = plan.reduce((t, a) => act(t, a), s0);
    expect(s.stack.length).toBe(1);
    // In response, destroy the Wave: its leaves trigger resolves first, with nothing to return.
    s = cast(s, ap, ids[0]!, [target(wave)]);
    s = passUntilStackEmpty(s);
    expect(s.objects[wave]!.zone).toBe("graveyard");
    expect(s.objects[x]!.zone).toBe("exile");
  });
});

describe("Memory Jar", () => {
  it("each player's hand is exiled face down and they draw seven; at the next end step, they discard and get their cards back", () => {
    const { s: s0, ap, opp, ids } = setup([shock, disenchant]);
    const jar = putOnBattlefield(s0, ap, memoryJar);
    const theirs = toZone(s0, opp, shock, "hand");
    const handBefore = Object.fromEntries(s0.turnOrder.map((p) => [p, [...s0.players[p]!.hand]]));
    let s = activate(s0, ap, jar, 0);
    expect(s.objects[jar]!.zone).toBe("graveyard");
    for (const pid of s.turnOrder) {
      expect(s.players[pid]!.hand.length).toBe(7);
      for (const id of handBefore[pid]!) expect(s.objects[id]).toMatchObject({ zone: "exile", hiddenExile: { seen: [] } });
    }
    const drawn = [...s.players[ap]!.hand];
    s = passUntil(s, "end", ap);
    s = passUntilStackEmpty(s);
    for (const pid of s.turnOrder) expect([...s.players[pid]!.hand].sort()).toEqual([...handBefore[pid]!].sort());
    expect(s.players[opp]!.hand).toContain(theirs);
    expect(ids.every((id) => s.players[ap]!.hand.includes(id))).toBe(true);
    for (const id of drawn) expect(s.objects[id]!.zone).toBe("graveyard");
  });
});

function passUntilStackEmpty(s: GameState): GameState {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
