// Bots weigh attacks and blocks with the damage each creature would really deal (CR 614.1a, 615): doublers like Furnace
// of Rath and Torbran, prevention like Temple Altisaur's "all but 1" and Fog. And they use coin flips whose loss costs
// them something when the gamble is worth it (CR 705): Bottle of Suleiman while losing wouldn't kill them, Frenetic Efreet
// when the creature would be destroyed anyway.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, planCast, waitingOn, type Action, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const torbran = card("Torbran, Thane of Red Fell", "Legendary Creature — Dwarf Noble", "{1}{R}{R}{R}", { power: "2", toughness: "4", oracleText: "If a red source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 2 instead." });
const furnace = card("Furnace of Rath", "Enchantment", "{1}{R}{R}{R}", { oracleText: "If a source would deal damage to a permanent or player, it deals double that damage to that permanent or player instead." });
const altisaur = card("Temple Altisaur", "Creature — Dinosaur", "{4}{W}", { power: "3", toughness: "4", oracleText: "If a source would deal damage to another Dinosaur you control, prevent all but 1 of that damage." });
const bottle = card("Bottle of Suleiman", "Artifact", "{4}", { oracleText: "{1}, Sacrifice this artifact: Flip a coin. If you win the flip, create a 5/5 colorless Djinn artifact creature token with flying. If you lose the flip, this artifact deals 5 damage to you." });
const efreet = card("Frenetic Efreet", "Creature — Efreet", "{1}{U}{R}", { power: "2", toughness: "1", keywords: ["Flying"], oracleText: "Flying\n{0}: Flip a coin. If you win the flip, this creature phases out. If you lose the flip, sacrifice this creature. (While it's phased out, it's treated as though it doesn't exist. It phases in before you untap during your next untap step.)" });
const sandswimmer = card("Viashino Sandswimmer", "Creature — Lizard", "{2}{R}{R}", { power: "3", toughness: "2", oracleText: "{R}: Flip a coin. If you win the flip, return this creature to its owner's hand. If you lose the flip, sacrifice this creature." });
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
const tap = card("Pressure Point", "Instant", "{1}{W}", { oracleText: "Tap target creature.\nDraw a card." });
const goblin = card("Goblin Raider", "Creature — Goblin Warrior", "{1}{R}", { power: "2", toughness: "2" });
const golem = card("Stone Golem", "Artifact Creature — Golem", "{3}", { power: "1", toughness: "3" });
const raptor = card("Test Raptor", "Creature — Dinosaur", "{2}{G}", { power: "3", toughness: "3" });
const ogre = card("Test Ogre", "Creature — Ogre", "{3}{G}", { power: "4", toughness: "4" });
const elf = card("Test Elf", "Creature — Elf", "{G}", { power: "1", toughness: "1" });
const bear = card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });

function toBlocks(s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[], opp: PlayerId) {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers" && s.step !== "endCombat"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  while (s.pending?.kind === "declareBlockers" && s.pending.player !== opp) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
  return s;
}
const blocksOf = (s: GameState, pid: PlayerId) => (botActions(s, pid)[0] as Extract<Action, { type: "declareBlockers" }>).blocks;
const attacksOf = (s: GameState, pid: PlayerId) => {
  s = passUntil(s, "declareAttackers", pid);
  const a = botActions(s, pid).find((x) => x.type === "declareAttackers") as Extract<Action, { type: "declareAttackers" }>;
  return a.attacks.map((x) => x.attacker);
};
/** Nothing in the bot's hand or command zone, so what it does next is about its permanents. */
function emptyHand(s: GameState, pid: PlayerId) {
  const p = s.players[pid]!;
  for (const id of p.hand) s.objects[id]!.zone = "library";
  p.library.push(...p.hand);
  p.hand = [];
  p.command = [];
}

describe("bots and damage amount replacements in combat", () => {
  it("parse", () => {
    for (const d of [torbran, furnace, altisaur, bottle, efreet, sandswimmer, murder, tap]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Torbran: a 1/3 doesn't block a red 2/2 that would deal it 4", () => {
    for (const withTorbran of [false, true]) {
      const { s: s0, ap, opp } = setup([]);
      if (withTorbran) putOnBattlefield(s0, ap, torbran);
      const g = putOnBattlefield(s0, ap, goblin);
      const wall = putOnBattlefield(s0, opp, golem);
      const s = toBlocks(s0, ap, [{ attacker: g, defender: opp }], opp);
      expect(blocksOf(s, opp).some((b) => b.blocker === wall), `with Torbran: ${withTorbran}`).toBe(!withTorbran);
    }
  });

  it("Furnace of Rath: at 3 life, a bot chump blocks a 2/2 that would deal it 4", () => {
    for (const withFurnace of [false, true]) {
      const { s: s0, ap, opp } = setup([]);
      if (withFurnace) putOnBattlefield(s0, ap, furnace);
      const b = putOnBattlefield(s0, ap, bear);
      const e = putOnBattlefield(s0, opp, elf);
      s0.players[opp]!.life = 3;
      const s = toBlocks(s0, ap, [{ attacker: b, defender: opp }], opp);
      expect(blocksOf(s, opp).some((x) => x.blocker === e), `with Furnace: ${withFurnace}`).toBe(withFurnace);
    }
  });

  it("Temple Altisaur: a 3/3 Dinosaur attacks into a 4/4 that could deal it only 1", () => {
    for (const withAltisaur of [false, true]) {
      const { s, ap, opp } = setup([]);
      emptyHand(s, ap);
      if (withAltisaur) putOnBattlefield(s, ap, altisaur, { sick: true });
      const r = putOnBattlefield(s, ap, raptor);
      putOnBattlefield(s, opp, ogre);
      s.players[opp]!.life = 30;
      expect(attacksOf(s, ap).includes(r), `with Altisaur: ${withAltisaur}`).toBe(withAltisaur);
    }
  });

  it("Fog: no attacks when all combat damage is prevented", () => {
    for (const fog of [false, true]) {
      const { s, ap } = setup([]);
      emptyHand(s, ap);
      const b = putOnBattlefield(s, ap, bear);
      if (fog) s.preventCombatDamage = true;
      expect(attacksOf(s, ap).includes(b), `fog: ${fog}`).toBe(!fog);
    }
  });
});

describe("bots and coin flips that cost something if lost", () => {
  it("Bottle of Suleiman: sacrificed for a Djinn while the 5 damage wouldn't kill the bot", () => {
    for (const life of [40, 5]) {
      const { s: s0, ap } = setup([]);
      emptyHand(s0, ap);
      const b = putOnBattlefield(s0, ap, bottle);
      s0.players[ap]!.life = life;
      const s = passUntil(s0, "main2", ap);
      const uses = botActions(s, ap).some((a) => a.type === "activateAbility" && a.objectId === b);
      expect(uses, `at ${life} life`).toBe(life > 5);
    }
  });

  it("Bottle of Suleiman: not at 10 life under Furnace of Rath (10 damage)", () => {
    const { s: s0, ap } = setup([]);
    emptyHand(s0, ap);
    const b = putOnBattlefield(s0, ap, bottle);
    putOnBattlefield(s0, ap, furnace);
    s0.players[ap]!.life = 10;
    const s = passUntil(s0, "main2", ap);
    expect(botActions(s, ap).some((a) => a.type === "activateAbility" && a.objectId === b)).toBe(false);
  });

  it("Frenetic Efreet and Viashino Sandswimmer: flipped in response to Murder, not for nothing or for a tap", () => {
    for (const def of [efreet, sandswimmer])
      for (const spell of [undefined, tap, murder]) {
        const { s: s0, ap, opp, ids } = setup(spell ? [spell] : []);
        const e = putOnBattlefield(s0, opp, def);
        for (const l of ["Mountain", "Mountain"]) putOnBattlefield(s0, opp, card(l, `Basic Land — ${l}`));
        let s = s0;
        if (spell) {
          for (const a of planCast(s, ap, ids[0]!, [{ kind: "object", id: e }])!) s = act(s, a);
        }
        s = act(s, { type: "passPriority", player: ap });
        expect(waitingOn(s)).toBe(opp);
        const uses = botActions(s, opp).some((a) => a.type === "activateAbility" && a.objectId === e);
        expect(uses, `${def.name} against ${spell?.name ?? "nothing"}`).toBe(spell === murder);
      }
  });
});
