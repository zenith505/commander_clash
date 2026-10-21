// Round 96: Opal Palace (mana spent on your commander: +1/+1 counters for each time it's been cast from the command zone,
// rulings), Veyran, Voice of Duality (CR 603.2d: casting or copying an instant or sorcery makes abilities trigger again),
// Spelunking and Horizon Explorer ("Lands you control enter untapped", CR 616.1: their controller orders it last).

import { describe, expect, it } from "vitest";
import { act, card, cast, mountain, passAll, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planCast, runStateBasedActions, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const opal = card("Opal Palace", "Land", "", {
  oracleText:
    "{T}: Add {C}.\n{1}, {T}: Add one mana of any color in your commander's color identity. If you spend this mana to cast your commander, it enters with a number of additional +1/+1 counters on it equal to the number of times it's been cast from the command zone this game.",
});
const veyran = card("Veyran, Voice of Duality", "Legendary Creature — Efreet Wizard", "{1}{U}{R}", {
  power: "2",
  toughness: "2",
  oracleText:
    "Magecraft — Whenever you cast or copy an instant or sorcery spell, Veyran gets +1/+1 until end of turn.\nIf you casting or copying an instant or sorcery spell causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.",
});
const pyromancer = card("Young Pyromancer", "Creature — Human Shaman", "{1}{R}", {
  power: "2",
  toughness: "1",
  oracleText: "Whenever you cast an instant or sorcery spell, create a 1/1 red Elemental creature token.",
});
const whisperer = card("Beast Whisperer", "Creature — Elf Druid", "{2}{G}{G}", { power: "2", toughness: "3", oracleText: "Whenever you cast a creature spell, draw a card." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const bear = card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });
const spelunking = card("Spelunking", "Enchantment", "{2}{G}", {
  oracleText:
    "When this enchantment enters, draw a card, then you may put a land card from your hand onto the battlefield. If you put a Cave onto the battlefield this way, you gain 4 life.\nLands you control enter untapped.",
});
const cataract = card("Hidden Cataract", "Land — Cave", "", { oracleText: "This land enters tapped.\n{T}: Add {U}.\n{4}{U}, {T}, Sacrifice this land: Discover 4. Activate only as a sorcery." });
const temple = card("Temple Garden", "Land — Forest Plains", "", { oracleText: "({T}: Add {G} or {W}.)\nAs this land enters, you may pay 2 life. If you don't, it enters tapped." });
const guildgate = card("Selesnya Guildgate", "Land — Gate", "", { oracleText: "This land enters tapped.\n{T}: Add {G} or {W}." });

const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const nextAfter = (s: GameState, p: number) => s.turnOrder[(s.turnOrder.indexOf(p) + 1) % 4]!;
const tokens = (s: GameState, pid: number) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid).length;

describe("Opal Palace", () => {
  it("parse", () => expect(isFullySupported(opal)).toBe(true));

  it("its mana spent on your commander: one more +1/+1 counter for each time it's been cast from the command zone", () => {
    const { s: s0, ap } = setup([]);
    const o = putOnBattlefield(s0, ap, opal);
    const m = putOnBattlefield(s0, ap, mountain);
    const cmd = s0.players[ap]!.command[0]!;
    // Mountain's {R} pays Opal Palace's {1}; Opal Palace makes {G}; the commander costs {1}{G}.
    let s = act(s0, { type: "activateMana", player: ap, objectId: m, mana: "R" });
    s = act(s, { type: "activateMana", player: ap, objectId: o, mana: "G", ability: 1 });
    for (const a of planCast(s, ap, cmd)!) s = act(s, a);
    s = settle(passAll(s));
    expect(s.objects[cmd]!.zone).toBe("battlefield");
    expect(s.objects[cmd]!.counters["+1/+1"]).toBe(1);
    // It dies and goes back to the command zone; the second cast (with tax) gets two.
    s.objects[cmd]!.damage = 9;
    runStateBasedActions(s);
    expect(s.objects[cmd]!.zone).toBe("command");
    s.objects[o]!.tapped = false;
    s.objects[m]!.tapped = false;
    s = act(s, { type: "activateMana", player: ap, objectId: m, mana: "R" });
    s = act(s, { type: "activateMana", player: ap, objectId: o, mana: "G", ability: 1 });
    for (const a of planCast(s, ap, cmd)!) s = act(s, a);
    s = settle(passAll(s));
    expect(s.objects[cmd]!.counters["+1/+1"]).toBe(2);
  });

  it("without its mana, no counters; its mana spent on another creature, none either", () => {
    const { s: s0, ap, ids } = setup([bear]);
    const o = putOnBattlefield(s0, ap, opal);
    const m = putOnBattlefield(s0, ap, mountain);
    let s = act(s0, { type: "activateMana", player: ap, objectId: m, mana: "R" });
    s = act(s, { type: "activateMana", player: ap, objectId: o, mana: "G", ability: 1 });
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    s = settle(passAll(s));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
    const cmd = s.players[ap]!.command[0]!;
    for (const a of planCast(s, ap, cmd)!) s = act(s, a);
    s = settle(passAll(s));
    expect(s.objects[cmd]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("Veyran, Voice of Duality", () => {
  it("parse", () => expect(isFullySupported(veyran)).toBe(true));

  it("casting an instant makes a triggered ability of your permanent trigger an additional time", () => {
    const { s: s0, ap, ids } = setup([shock]);
    putOnBattlefield(s0, ap, veyran);
    putOnBattlefield(s0, ap, pyromancer);
    const s = settle(cast(s0, ap, ids[0]!, [{ kind: "player", id: nextAfter(s0, ap) }]));
    expect(tokens(s, ap)).toBe(2);
  });

  it("not a creature spell's triggers, and not an opponent's casting", () => {
    const { s: s0, ap, ids } = setup([bear, shock]);
    putOnBattlefield(s0, ap, veyran);
    putOnBattlefield(s0, ap, whisperer);
    const hand0 = s0.players[ap]!.hand.length;
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.players[ap]!.hand.length).toBe(hand0 - 1 + 1); // one card for the creature spell
    // Another player's Veyran doesn't apply to my Young Pyromancer.
    const { s: t0, ap: bp, ids: tid } = setup([shock]);
    putOnBattlefield(t0, nextAfter(t0, bp), veyran);
    putOnBattlefield(t0, bp, pyromancer);
    s = settle(cast(t0, bp, tid[0]!, [{ kind: "player", id: nextAfter(t0, bp) }]));
    expect(tokens(s, bp)).toBe(1);
  });
});

describe("Spelunking", () => {
  it("parse", () => expect(isFullySupported(spelunking)).toBe(true));

  it("puts a Cave from your hand onto the battlefield untapped, and you gain 4 life", () => {
    const { s: s0, ap, ids } = setup([spelunking, cataract]);
    let s = cast(s0, ap, ids[0]!);
    for (let i = 0; i < 20 && (s.stack.length || s.pending); i++) {
      if (s.pending?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: ap, found: [ids[1]!] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[1]!]!.tapped).toBe(false);
    expect(s.players[ap]!.life).toBe(44);
  });

  it("lands enter untapped: a tapped land played, a shock land without paying life", () => {
    const { s: s0, ap, ids } = setup([guildgate, temple]);
    putOnBattlefield(s0, ap, spelunking);
    let s = act(s0, { type: "playLand", player: ap, objectId: ids[0]! });
    expect(s.objects[ids[0]!]!.tapped).toBe(false);
    s.players[ap]!.landsPlayedThisTurn = 0;
    s = act(s, { type: "playLand", player: ap, objectId: ids[1]! });
    expect(s.objects[ids[1]!]!.tapped).toBe(false);
    expect(s.players[ap]!.life).toBe(40);
  });
});
