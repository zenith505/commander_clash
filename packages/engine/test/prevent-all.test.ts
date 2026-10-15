// "Prevent all [combat] damage that would be dealt to/by X" as a static ability or until end of turn (CR 615.1a,
// 615.6); "Damage can't be prevented [this turn]" (CR 615.12); "Players can't gain life [this turn]" (CR 119.7).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { invalidateCharacteristics, isFullySupported, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const gomazoa = card("Guard Gomazoa", "Creature — Jellyfish", "{2}{U}", { power: "1", toughness: "3", keywords: ["Defender", "Flying"], oracleText: "Defender, flying\nPrevent all combat damage that would be dealt to this creature." });
const muzzle = card("Muzzle", "Enchantment — Aura", "{1}{W}", { oracleText: "Enchant creature\nPrevent all damage that would be dealt by enchanted creature." });
const maze = card("Maze of Ith", "Land", "", { oracleText: "{T}: Untap target attacking creature. Prevent all combat damage that would be dealt to and dealt by that creature this turn." });
const lancer = card("Champion Lancer", "Creature — Human Knight", "{4}{W}{W}", { power: "3", toughness: "3", oracleText: "Prevent all damage that would be dealt to this creature by creatures." });
const skullcrack = card("Skullcrack", "Instant", "{1}{R}", { oracleText: "Players can't gain life this turn. Damage can't be prevented this turn. Skullcrack deals 3 damage to target player or planeswalker." });
const ferocidon = card("Rampaging Ferocidon", "Creature — Dinosaur", "{2}{R}", {
  power: "3",
  toughness: "3",
  keywords: ["Menace"],
  oracleText: "Menace\nPlayers can't gain life.\nWhenever another creature enters, this creature deals 1 damage to that creature's controller.",
});
const mercy = card("Angel's Mercy", "Instant", "{2}{W}{W}", { oracleText: "You gain 7 life." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

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
const attack = (s: GameState, ap: PlayerId, opp: PlayerId, attackers: string[]) =>
  settle(act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender: opp })) }));
/** Blockers declared, then on to the second main phase (combat damage dealt). */
const blockAndFinish = (s: GameState, ap: PlayerId, b: { blocker: string; attacker: string }[] = []) => {
  for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  while (s.pending?.kind === "declareBlockers") {
    const pid = s.pending.player;
    s = act(s, { type: "declareBlockers", player: pid, blocks: b.filter((x) => s.objects[x.blocker]!.controller === pid) });
  }
  return passUntil(s, "main2", ap);
};

describe("prevent all damage", () => {
  it("compile", () => {
    for (const d of [gomazoa, muzzle, maze, lancer, skullcrack, ferocidon]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Guard Gomazoa: combat damage to it is prevented, noncombat damage isn't", () => {
    const { s: s0, ap, opp, ids } = setup([shock]);
    const a = putOnBattlefield(s0, ap, bear());
    const g = putOnBattlefield(s0, opp, gomazoa);
    const s = blockAndFinish(attack(s0, ap, opp, [a]), ap, [{ blocker: g, attacker: a }]);
    expect(s.objects[g]!.damage).toBe(0);
    expect(s.objects[a]!.damage).toBe(1);
    const shocked = cast(s, ap, ids[0]!, [target(g)]);
    expect(shocked.objects[g]!.damage).toBe(2);
  });

  it("Muzzle: all damage the enchanted creature would deal is prevented", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, bear());
    attach(s0, opp, muzzle, a);
    const life = s0.players[opp]!.life;
    const s = blockAndFinish(attack(s0, ap, opp, [a]), ap);
    expect(s.players[opp]!.life).toBe(life);
  });

  it("Maze of Ith: untaps the attacker, and combat damage to and by it is prevented this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, bear());
    const m = putOnBattlefield(s0, ap, maze);
    const b = putOnBattlefield(s0, opp, bear());
    let s = attack(s0, ap, opp, [a]);
    expect(s.objects[a]!.tapped).toBe(true);
    s = activate(s, ap, m, 0, [target(a)]);
    expect(s.objects[a]!.tapped).toBe(false);
    s = blockAndFinish(s, ap, [{ blocker: b, attacker: a }]);
    expect([s.objects[a]!.damage, s.objects[b]!.damage]).toEqual([0, 0]);
    expect(s.objects[a]!.zone).toBe("battlefield");
    // Next turn it's over.
    s = passUntil(s, "upkeep", opp);
    expect(s.effects.some((e) => e.affected.includes(a))).toBe(false);
  });

  it("Champion Lancer: damage from creatures is prevented, damage from a spell isn't", () => {
    const { s: s0, ap, opp, ids } = setup([shock]);
    const a = putOnBattlefield(s0, ap, bear());
    const l = putOnBattlefield(s0, opp, lancer);
    const s = blockAndFinish(attack(s0, ap, opp, [a]), ap, [{ blocker: l, attacker: a }]);
    expect(s.objects[l]!.damage).toBe(0);
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(cast(s, ap, ids[0]!, [target(l)]).objects[l]!.damage).toBe(2);
  });
});

describe("damage can't be prevented; players can't gain life", () => {
  it("Skullcrack: this turn, prevention stops working and nobody gains life", () => {
    const { s: s0, ap, opp, ids } = setup([skullcrack, mercy]);
    const a = putOnBattlefield(s0, ap, bear());
    attach(s0, opp, muzzle, a);
    const life = s0.players[opp]!.life;
    let s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(s.players[opp]!.life).toBe(life - 3);
    const mine = s.players[ap]!.life;
    s = cast(s, ap, ids[1]!);
    expect(s.players[ap]!.life).toBe(mine);
    s = blockAndFinish(attack(s, ap, opp, [a]), ap);
    expect(s.players[opp]!.life).toBe(life - 5); // Muzzle's prevention doesn't apply
  });

  it("Skullcrack wears off the next turn", () => {
    const { s: s0, ap, opp, ids } = setup([skullcrack, mercy]);
    let s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    s = passUntil(s, "upkeep", opp);
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const mine = s.players[ap]!.life;
    s = cast(s, ap, ids[1]!);
    expect(s.players[ap]!.life).toBe(mine + 7);
  });

  it("Rampaging Ferocidon: no player gains life while it's on the battlefield", () => {
    const { s: s0, ap, ids } = setup([mercy]);
    const f = putOnBattlefield(s0, ap, ferocidon);
    const mine = s0.players[ap]!.life;
    const s = cast(structuredClone(s0), ap, ids[0]!);
    expect(s.players[ap]!.life).toBe(mine);
    s0.battlefield.splice(s0.battlefield.indexOf(f), 1);
    s0.objects[f]!.zone = "graveyard";
    invalidateCharacteristics(s0);
    expect(cast(s0, ap, ids[0]!).players[ap]!.life).toBe(mine + 7);
  });
});
