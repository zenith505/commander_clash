// Khârn the Betrayer: "attacks or blocks each combat if able" (CR 508.1d, 509.1c; Relentless Raptor rulings: both
// requirements), and "If damage would be dealt to ~, prevent that damage and an opponent of your choice gains control
// of it" (CR 615.5: the control change happens right away; 615.12: also when the damage can't be prevented), with
// "When you lose control of ~, draw two cards" triggering for the player who lost it (rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { blockRequirementProblem, botActions, characteristics, compileCard, isFullySupported, waitingOn, type CardDef, type GameState } from "../src";
import { dealDamage, objectSource } from "../src/damage";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

// Real oracle text (Scryfall).
const kharn = card("Khârn the Betrayer", "Legendary Creature — Astartes Berserker", "{3}{R}", { power: "5", toughness: "1", oracleText: "Berzerker — Khârn the Betrayer attacks or blocks each combat if able.\nSigil of Corruption — When you lose control of Khârn the Betrayer, draw two cards.\nThe Betrayer — If damage would be dealt to Khârn the Betrayer, prevent that damage and an opponent of your choice gains control of it." });
const raptor = card("Relentless Raptor", "Creature — Dinosaur", "{R}{W}", { power: "3", toughness: "3", keywords: ["Vigilance"], oracleText: "Vigilance\nThis creature attacks or blocks each combat if able." });
const screen = card("Razorgrass Screen", "Artifact Creature — Wall", "{1}", { power: "2", toughness: "1", keywords: ["Defender"], oracleText: "Defender (This creature can't attack.)\nThis creature blocks each combat if able." });
const unpreventable = card("Test Unpreventable", "Enchantment", "{2}", { oracleText: "Damage can't be prevented." });

describe("Khârn the Betrayer", () => {
  it("parse", () => {
    supported(kharn, raptor, screen);
    const c = compileCard(kharn);
    expect(c.betrayer).toBe(true);
  });

  it("damage to it is prevented, the opponent with the most life gains control of it (a bot's choice), and you draw two", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kharn);
    const b = putOnBattlefield(s0, opp, bear());
    const rich = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    s0.players[rich]!.life = 50;
    const hand = s0.players[ap]!.hand.length;
    dealDamage(s0, objectSource(s0, s0.objects[b]!), { object: s0.objects[k]! }, 2);
    expect(s0.objects[k]!.damage).toBe(0);
    expect(characteristics(s0, s0.objects[k]!).controller).toBe(rich);
    const s = settle(act(s0, { type: "passPriority", player: waitingOn(s0)! }));
    expect(s.objects[k]!.zone).toBe("battlefield");
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("damage that can't be prevented is dealt, and control still changes (CR 615.12)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, unpreventable);
    const k = putOnBattlefield(s0, ap, kharn);
    const b = putOnBattlefield(s0, opp, bear());
    dealDamage(s0, objectSource(s0, s0.objects[b]!), { object: s0.objects[k]! }, 2);
    expect(s0.objects[k]!.damage).toBe(2);
    expect(characteristics(s0, s0.objects[k]!).controller).not.toBe(ap);
  });

  it("two separate damage events: a new controller each time, and each one who lost it draws two (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kharn);
    const b = putOnBattlefield(s0, opp, bear());
    dealDamage(s0, objectSource(s0, s0.objects[b]!), { object: s0.objects[k]! }, 1);
    const first = characteristics(s0, s0.objects[k]!).controller;
    dealDamage(s0, objectSource(s0, s0.objects[b]!), { object: s0.objects[k]! }, 1);
    const second = characteristics(s0, s0.objects[k]!).controller;
    expect(first).not.toBe(ap);
    expect(second).not.toBe(first);
    const hands = s0.players.map((p) => p.hand.length);
    let s = s0;
    for (let i = 0; i < 20 && (s.triggerQueue.length || s.stack.length || i === 0); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[ap]!.hand.length).toBe(hands[ap]! + 2);
    expect(s.players[first]!.hand.length).toBe(hands[first]! + 2);
  });

  it("blocked in combat: its controller chooses the opponent, and it leaves combat (CR 506.4)", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kharn);
    const b = putOnBattlefield(s0, opp, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [] })).toThrow(/attacks each combat if able/);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: k, defender: opp }] });
    s = passUntil(s, "declareBlockers", ap);
    while (s.pending?.player !== opp) s = act(s, { type: "declareBlockers", player: s.pending!.player, blocks: [] } as never);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b, attacker: k }] });
    for (let i = 0; i < 20 && !(s.pending?.kind === "chooseOption" && s.pending.what === "damageShield"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "damageShield" });
    const pend = s.pending as Extract<GameState["pending"], { kind: "chooseOption" }>;
    const third = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    const pick = pend.labels!.indexOf(s.players[third]!.name);
    s = act(s, { type: "chooseOption", player: ap, choice: pend.options[pick]! });
    expect(characteristics(s, s.objects[k]!).controller).toBe(third);
    expect(s.objects[k]!.damage).toBe(0);
    expect(s.objects[k]!.attacking).toBeUndefined();
    // Khârn dealt its damage at the same time: the bear died.
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("blocks each combat if able: Razorgrass Screen and Relentless Raptor must block", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, bear({ name: "Attacker" }));
    const sc = putOnBattlefield(s0, opp, screen);
    putOnBattlefield(s0, opp, raptor);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    s = passUntil(s, "declareBlockers", ap);
    while (s.pending?.player !== opp) s = act(s, { type: "declareBlockers", player: s.pending!.player, blocks: [] } as never);
    expect(blockRequirementProblem(s, opp, [])).toMatch(/must block/);
    const bot = botActions(s, opp)[0]!;
    expect(bot.type === "declareBlockers" && bot.blocks.some((x) => x.blocker === sc)).toBe(true);
  });
});
