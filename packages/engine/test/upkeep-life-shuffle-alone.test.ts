// "Tap ~ unless you pay 1 life" (Carnophage): chosen as the upkeep trigger resolves, and paying while it's tapped
// doesn't untap it (rulings). "Choose target artifact or enchantment. Its owner shuffles it into their library"
// (Deglamer). "~ can't be blocked as long as it's attacking alone" (Dream Prowler): it's attacking and no other
// creature is (CR 506.5).

import { describe, expect, it } from "vitest";
import { act, card, cast, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const carnophage = card("Carnophage", "Creature — Zombie", "{B}", { power: "2", toughness: "2", oracleText: "At the beginning of your upkeep, tap this creature unless you pay 1 life." });
const sangrophage = card("Sangrophage", "Creature — Zombie", "{B}{B}", { power: "3", toughness: "3", oracleText: "At the beginning of your upkeep, tap this creature unless you pay 2 life." });
const deglamer = card("Deglamer", "Instant", "{1}{G}", { oracleText: "Choose target artifact or enchantment. Its owner shuffles it into their library." });
const unravel = card("Unravel the Aether", "Instant", "{1}{G}", { oracleText: "Choose target artifact or enchantment. Its owner shuffles it into their library." });
const prowler = card("Dream Prowler", "Creature — Illusion", "{2}{U}{U}", { power: "1", toughness: "5", oracleText: "This creature can't be blocked as long as it's attacking alone." });
const malison = card("Yuan-Ti Malison", "Creature — Snake Rogue", "{1}{U}", { power: "2", toughness: "1", keywords: ["Venture into the dungeon"], oracleText: "This creature can't be blocked as long as it's attacking alone.\nWhenever this creature deals combat damage to a player, venture into the dungeon. (Enter the first room or advance to the next room.)" });
const ring = card("Sol Ring", "Artifact", "{1}", { oracleText: "{T}: Add {C}{C}." });
const bear = card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });

/** Pass until `pid` is asked a "may" during their upkeep. */
function toUpkeepChoice(s: GameState, pid: PlayerId) {
  s = passUntil(s, "upkeep", pid);
  for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(s.pending?.kind === "chooseMay" && s.pending.player === pid).toBe(true);
  return s;
}

describe("tap unless you pay life, shuffle into its owner's library, attacking alone", () => {
  it("parse", () => {
    for (const d of [carnophage, sangrophage, deglamer, unravel, prowler, malison]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Carnophage: pay 1 life to keep it untapped, or it taps", () => {
    for (const pay of [true, false]) {
      const { s: s0, opp } = setup([]);
      const c = putOnBattlefield(s0, opp, carnophage);
      let s = toUpkeepChoice(s0, opp);
      const life = s.players[opp]!.life;
      s = act(s, { type: "chooseMay", player: opp, yes: pay });
      expect([s.objects[c]!.tapped, s.players[opp]!.life], `pay: ${pay}`).toEqual([!pay, pay ? life - 1 : life]);
    }
  });

  it("Sangrophage: paying while it's tapped doesn't untap it", () => {
    const { s: s0, opp } = setup([]);
    const c = putOnBattlefield(s0, opp, sangrophage);
    let s = toUpkeepChoice(s0, opp);
    s.objects[c]!.tapped = true;
    const life = s.players[opp]!.life;
    s = act(s, { type: "chooseMay", player: opp, yes: true });
    expect([s.objects[c]!.tapped, s.players[opp]!.life]).toEqual([true, life - 2]);
  });

  it("Deglamer: the owner shuffles it into their library", () => {
    const { s: s0, ap, opp, ids } = setup([deglamer]);
    const r = putOnBattlefield(s0, opp, ring);
    const s = cast(s0, ap, ids[0]!, [{ kind: "object", id: r }]);
    expect(s.objects[r]!.zone).toBe("library");
    expect(s.players[opp]!.library).toContain(r);
  });

  it("Dream Prowler: unblockable attacking alone, blockable with company", () => {
    for (const alone of [true, false]) {
      const { s: s0, ap, opp } = setup([]);
      const p = putOnBattlefield(s0, ap, prowler);
      const b = putOnBattlefield(s0, ap, bear);
      const wall = putOnBattlefield(s0, opp, bear);
      let s = passUntil(s0, "declareAttackers", ap);
      s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: p, defender: opp }, ...(alone ? [] : [{ attacker: b, defender: opp }])] });
      for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      while (s.pending?.kind === "declareBlockers" && s.pending.player !== opp) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
      const block = () => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: wall, attacker: p }] });
      if (alone) expect(block).toThrow();
      else expect(block().objects[wall]!.blocking).toBeDefined();
    }
  });
});
