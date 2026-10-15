// "Its owner puts it on their choice of the top or bottom of their library", "can't block creatures with power 2 or
// greater" (CR 509.1b), "all creatures able to block target creature this turn do so" and Lure on an Aura (CR 509.1c),
// and "Untap ~ during each other player's untap step" (CR 502.3).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, putOnBattlefield, setup } from "./helpers";
import { blockProblem, botActions, isFullySupported, waitingOn, type Action, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const motes = card("Misleading Motes", "Instant", "{3}{U}", { oracleText: "Target creature's owner puts it on their choice of the top or bottom of their library." });
const runOut = card("Run Out of Town", "Instant", "{3}{U}", { oracleText: "The owner of target nonland permanent puts it on their choice of the top or bottom of their library." });
const brassclaw = card("Brassclaw Orcs", "Creature — Orc", "{2}{R}", { power: "3", toughness: "2", oracleText: "This creature can't block creatures with power 2 or greater." });
const sunweb = card("Sunweb", "Creature — Wall", "{3}{W}", {
  power: "5",
  toughness: "6",
  keywords: ["Defender", "Flying"],
  oracleText: "Defender (This creature can't attack.)\nFlying\nThis creature can't block creatures with power 2 or less.",
});
const taunting = card("Taunting Challenge", "Sorcery", "{1}{G}{G}", { oracleText: "All creatures able to block target creature this turn do so." });
const declare = card("Declare Dominance", "Sorcery", "{3}{G}{G}", { oracleText: "Target creature gets +3/+3 until end of turn. All creatures able to block it this turn do so." });
const lure = card("Lure", "Enchantment — Aura", "{1}{G}{G}", { oracleText: "Enchant creature\nAll creatures able to block enchanted creature do so." });
const umbra = card("Indrik Umbra", "Enchantment — Aura", "{4}{G}{W}", {
  oracleText:
    "Enchant creature\nEnchanted creature gets +4/+4 and has first strike, and all creatures able to block it do so.\nUmbra armor (If enchanted creature would be destroyed, instead remove all damage from it and destroy this Aura.)",
});
const muse = card("Seedborn Muse", "Creature — Spirit", "{3}{G}{G}", { power: "2", toughness: "4", oracleText: "Untap all permanents you control during each other player's untap step." });
const infantry = card("Thousand Moons Infantry", "Creature — Human Soldier", "{2}{W}", { power: "2", toughness: "4", oracleText: "Untap this creature during each other player's untap step." });

const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
function toBlocks(s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[], opp: PlayerId) {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers" && s.step !== "endCombat"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  while (s.pending?.kind === "declareBlockers" && s.pending.player !== opp) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
  return s;
}

describe("top or bottom of their library, the owner's choice", () => {
  it("compile", () => {
    for (const d of [motes, runOut, brassclaw, sunweb, taunting, declare, lure, umbra, muse, infantry]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("the owner chooses, not the caster: top", () => {
    const { s: s0, ap, ids, opp } = setup([motes]);
    const b = putOnBattlefield(s0, opp, bear());
    let s = cast(s0, ap, ids[0]!, [{ kind: "object", id: b }]);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "topOrBottom" });
    expect(() => act(s, { type: "chooseOption", player: ap, choice: "top" })).toThrow();
    s = settle(act(s, { type: "chooseOption", player: opp, choice: "top" }));
    expect(s.players[opp]!.library[0]).toBe(b);
  });

  it("bottom; and the bot owner picks one", () => {
    const { s: s0, ap, ids, opp } = setup([runOut, runOut]);
    const b = putOnBattlefield(s0, opp, bear());
    const mine = putOnBattlefield(s0, ap, card("Sign", "Artifact", "{1}"));
    let s = settle(cast(s0, ap, ids[0]!, [{ kind: "object", id: mine }]));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "bottom" }));
    const lib = s.players[ap]!.library;
    expect(lib[lib.length - 1]).toBe(mine);
    s = settle(cast(s, ap, ids[1]!, [{ kind: "object", id: b }]));
    const answer = botActions(s, opp)[0] as Action;
    expect(answer).toMatchObject({ type: "chooseOption", player: opp });
    s = settle(act(s, answer));
    expect(s.objects[b]!.zone).toBe("library");
  });
});

describe("blocking restrictions and requirements", () => {
  it("can't block creatures with power 2 or greater / 2 or less", () => {
    const { s, ap, opp } = setup([]);
    const orcs = putOnBattlefield(s, opp, brassclaw);
    const web = putOnBattlefield(s, opp, sunweb);
    const small = putOnBattlefield(s, ap, card("Elf", "Creature — Elf", "{G}", { power: "1", toughness: "1" }));
    const big = putOnBattlefield(s, ap, bear());
    s.objects[small]!.attacking = opp;
    s.objects[big]!.attacking = opp;
    expect(blockProblem(s, s.objects[orcs]!, s.objects[big]!)).toMatch(/can't block/);
    expect(blockProblem(s, s.objects[orcs]!, s.objects[small]!)).toBeNull();
    expect(blockProblem(s, s.objects[web]!, s.objects[big]!)).toMatch(/can't block/);
    expect(blockProblem(s, s.objects[web]!, s.objects[small]!)).toMatch(/can't block/); // 2 or less: a 2-power bear too
  });

  it("all creatures able to block target creature this turn do so", () => {
    const { s: s0, ap, ids, opp } = setup([taunting]);
    const a = putOnBattlefield(s0, ap, bear());
    const b1 = putOnBattlefield(s0, opp, bear());
    const b2 = putOnBattlefield(s0, opp, bear({ name: "Other Bear" }));
    let s = settle(cast(s0, ap, ids[0]!, [{ kind: "object", id: a }]));
    s = toBlocks(s, ap, [{ attacker: a, defender: opp }], opp);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [] })).toThrow(/must block/);
    const bot = botActions(s, opp)[0] as Extract<Action, { type: "declareBlockers" }>;
    expect(bot.blocks.map((x) => x.blocker).sort()).toEqual([b1, b2].sort());
  });

  it("Declare Dominance: +3/+3 and the requirement on the same creature", () => {
    const { s: s0, ap, ids, opp } = setup([declare]);
    const a = putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, opp, bear());
    let s = settle(cast(s0, ap, ids[0]!, [{ kind: "object", id: a }]));
    s = toBlocks(s, ap, [{ attacker: a, defender: opp }], opp);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [] })).toThrow(/must block/);
  });

  it("Lure and Indrik Umbra: on the enchanted creature", () => {
    for (const aura of [lure, umbra]) {
      const { s: s0, ap, ids, opp } = setup([aura]);
      const a = putOnBattlefield(s0, ap, bear());
      putOnBattlefield(s0, opp, bear());
      let s = settle(cast(s0, ap, ids[0]!, [{ kind: "object", id: a }]));
      expect(s.objects[ids[0]!]!.attachedTo).toBe(a);
      s = toBlocks(s, ap, [{ attacker: a, defender: opp }], opp);
      expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [] }), aura.name).toThrow(/must block/);
    }
  });
});

describe("untap during each other player's untap step", () => {
  it("Seedborn Muse untaps all your permanents; Thousand Moons Infantry only itself", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, muse);
    const land = s0.battlefield.find((id) => s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.name === "Forest")!;
    const inf = putOnBattlefield(s0, opp, infantry);
    const oppBear = putOnBattlefield(s0, opp, bear());
    for (const id of [m, land, inf, oppBear]) s0.objects[id]!.tapped = true;
    // Its controller's "doesn't untap during your untap step" doesn't stop it then (rulings).
    s0.objects[m]!.skipNextUntap = true;
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    let s = passUntil(s0, "upkeep", opp);
    // The opponent's own untap step untaps theirs; Seedborn Muse untaps ap's.
    expect(s.objects[land]!.tapped).toBe(false);
    expect(s.objects[m]!.tapped).toBe(false);
    expect(s.objects[m]!.skipNextUntap).toBe(true); // still applies to ap's next untap step
    expect(s.objects[inf]!.tapped).toBe(false);
    s.objects[inf]!.tapped = true;
    s.objects[oppBear]!.tapped = true;
    s = passUntil(s, "upkeep", third);
    expect(s.objects[inf]!.tapped).toBe(false);
    expect(s.objects[oppBear]!.tapped).toBe(true);
  });
});
