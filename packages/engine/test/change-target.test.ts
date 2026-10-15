// "Change the target of target spell with a single target" (CR 115.7a): Deflection, Shunt, Swerve, Divert, Imp's
// Mischief. The new target is chosen as it resolves, must be another legal target, and stays the same if there's none.

import { describe, expect, it } from "vitest";
import { act, bear, card, island, mountain, putOnBattlefield, setup, swamp, target } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const deflection = card("Deflection", "Instant", "{3}{U}", { oracleText: "Change the target of target spell with a single target." });
const shunt = card("Shunt", "Instant", "{1}{R}{R}", { oracleText: "Change the target of target spell with a single target." });
const swerve = card("Swerve", "Instant", "{U}{R}", { oracleText: "Change the target of target spell with a single target." });
const divert = card("Divert", "Instant", "{U}", { oracleText: "Change the target of target spell with a single target unless that spell's controller pays {2}." });
const imps = card("Imp's Mischief", "Instant", "{1}{B}", { oracleText: "Change the target of target spell with a single target. You lose life equal to that spell's mana value." });
const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
const growth = card("Giant Growth", "Instant", "{G}", { oracleText: "Target creature gets +3/+3 until end of turn." });
const fireball = card("Blaze", "Sorcery", "{X}{R}", { oracleText: "Blaze deals X damage to any target." });
const counterspell = card("Counterspell", "Instant", "{U}{U}", { oracleText: "Counter target spell." });
const twoTargets = card("Seeds of Strength", "Instant", "{G}{W}", { oracleText: "Target creature gets +1/+1 until end of turn.\nTarget creature gets +1/+1 until end of turn." });
const rancor = card("Holy Strength", "Enchantment — Aura", "{W}", { oracleText: "Enchant creature\nEnchanted creature gets +1/+2." });

const logged = (s: GameState, re: RegExp) => s.log.some((e) => re.test(e.text));
const run = (s: GameState, plan: Action[]) => plan.reduce((x, a) => act(x, a), s);
function castOnly(s: GameState, pid: PlayerId, id: string, targets?: TargetChoice[], x?: number) {
  const plan = planCast(s, pid, id, targets, undefined, "auto", x);
  if (!plan) throw new Error(`can't cast ${s.cards[s.objects[id]!.cardId]!.name}`);
  return run(s, plan);
}
/** Pass until `pid` has priority again, with the stack as it is. */
function priorityTo(s: GameState, pid: PlayerId) {
  if (waitingOn(s) === pid) s = act(s, { type: "passPriority", player: pid });
  for (let i = 0; i < 4 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
/** Everyone passes until the stack is empty or someone has a choice to make. */
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** A card in `pid`'s hand, with lands to cast it. */
function give(s: GameState, pid: PlayerId, def: CardDef, lands = 0, land = island) {
  for (let i = 0; i < lands; i++) putOnBattlefield(s, pid, land);
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
}
const stackTarget = (s: GameState, name: string): TargetChoice => ({ kind: "stack", id: s.stack.find((x) => x.description.startsWith(name))!.id });

describe("change the target of target spell with a single target", () => {
  it("compile", () => {
    for (const d of [deflection, shunt, swerve, divert, imps]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("the new target is chosen as it resolves, among the other legal ones", () => {
    const { s: s0, ap, ids, opp } = setup([bolt, deflection]);
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    let s = castOnly(s0, ap, ids[0]!, [target(mine)]);
    s = castOnly(s, ap, ids[1]!, [stackTarget(s, "Lightning Bolt")]);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "changeTarget", player: ap, spell: "Lightning Bolt" });
    const options = s.pending?.kind === "changeTarget" ? s.pending.options : [];
    expect(options).toContainEqual({ kind: "object", id: theirs });
    expect(options).toContainEqual({ kind: "player", id: opp });
    expect(options.some((o) => o.kind === "object" && o.id === mine)).toBe(false); // another target
    expect(() => act(s, { type: "changeTarget", player: ap, target: target(mine) })).toThrow(/legal new target/);
    s = settle(act(s, { type: "changeTarget", player: ap, target: target(theirs) }));
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.objects[mine]!.zone).toBe("battlefield");
    expect(logged(s, /Deflection changes the target of Lightning Bolt to Their Bear/)).toBe(true);
  });

  it("with one other legal target it's that one; with none, the target stays the same", () => {
    const { s: s0, ap, ids, opp } = setup([growth, swerve, growth, shunt]);
    const a = putOnBattlefield(s0, ap, bear({ name: "Bear A" }));
    const b = putOnBattlefield(s0, opp, bear({ name: "Bear B" }));
    let s = castOnly(s0, ap, ids[0]!, [target(a)]);
    s = settle(castOnly(s, ap, ids[1]!, [stackTarget(s, "Giant Growth")]));
    expect(s.pending).toBeNull();
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(logged(s, /Swerve changes the target of Giant Growth to Bear B/)).toBe(true);
    // Only one creature: nothing to change it to, so Giant Growth still gives it +3/+3.
    s.objects[b]!.zone = "graveyard";
    s.battlefield.splice(s.battlefield.indexOf(b), 1);
    invalidateCharacteristics(s);
    s = castOnly(s, ap, ids[2]!, [target(a)]);
    s = settle(castOnly(s, ap, ids[3]!, [stackTarget(s, "Giant Growth")]));
    expect(logged(s, /no other legal target, so its target stays the same/)).toBe(true);
  });

  it("can't target a spell with two targets, even with one of them gone", () => {
    const { s: s0, ap, ids, opp } = setup([twoTargets, deflection]);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, opp, bear());
    const s = castOnly(s0, ap, ids[0]!, [target(a), target(b)]);
    expect(planCast(s, ap, ids[1]!, [stackTarget(s, "Seeds of Strength")])).toBeNull();
  });

  it("a counterspell can be turned onto the spell changing it, and then does nothing", () => {
    const { s: s0, ap, ids, opp } = setup([bolt, deflection]);
    const theirs = putOnBattlefield(s0, opp, bear());
    const cs = give(s0, opp, counterspell, 2);
    let s = castOnly(s0, ap, ids[0]!, [target(theirs)]);
    s = priorityTo(s, opp);
    s = castOnly(s, opp, cs, [stackTarget(s, "Lightning Bolt")]);
    s = priorityTo(s, ap);
    s = castOnly(s, ap, ids[1]!, [stackTarget(s, "Counterspell")]);
    // Lightning Bolt is Counterspell's target now and the spell itself can't be: Deflection is the only other one.
    s = settle(s);
    expect(logged(s, /Deflection changes the target of Counterspell to Deflection/)).toBe(true);
    expect(s.objects[theirs]!.zone).toBe("graveyard"); // Lightning Bolt resolved
    expect(s.objects[cs]!.zone).toBe("graveyard");
  });

  it("an Aura spell's target can be changed: it enters attached to the new one", () => {
    const { s: s0, ap, ids, opp } = setup([rancor, swerve]);
    const a = putOnBattlefield(s0, ap, bear({ name: "Bear A" }));
    const b = putOnBattlefield(s0, opp, bear({ name: "Bear B" }));
    let s = castOnly(s0, ap, ids[0]!, [target(a)]);
    s = settle(castOnly(s, ap, ids[1]!, [stackTarget(s, "Holy Strength")]));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(b);
  });

  it("the new target must be legal for that spell: not an opponent's hexproof creature", () => {
    const { s: s0, ap, ids, opp } = setup([bolt, deflection]);
    const a = putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, opp, bear({ name: "Hexproof Bear", keywords: ["Hexproof"], oracleText: "Hexproof" }));
    let s = castOnly(s0, ap, ids[0]!, [target(a)]);
    s = settle(castOnly(s, ap, ids[1]!, [stackTarget(s, "Lightning Bolt")]));
    const options = s.pending?.kind === "changeTarget" ? s.pending.options : [];
    expect(options.some((o) => o.kind === "object" && s.cards[s.objects[o.id]!.cardId]!.name === "Hexproof Bear")).toBe(false);
  });

  it("becoming the new target triggers ward", () => {
    const { s: s0, ap, ids, opp } = setup([bolt, swerve]);
    const a = putOnBattlefield(s0, ap, bear());
    const w = putOnBattlefield(s0, opp, bear({ name: "Warded Bear", oracleText: "Ward {2}" }));
    let s = castOnly(s0, ap, ids[0]!, [target(a)]);
    s = castOnly(s, ap, ids[1]!, [stackTarget(s, "Lightning Bolt")]);
    s = settle(s);
    s = act(s, { type: "changeTarget", player: ap, target: target(w) });
    expect(s.stack.map((x) => x.kind)).toEqual(["spell", "ability"]);
    expect(s.stack[1]!.description).toMatch(/Warded Bear/);
  });

  it("Divert: unless that spell's controller pays {2}", () => {
    const { s: s0, ap, ids, opp } = setup([divert, divert]);
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const zap = give(s0, opp, card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." }), 6, mountain);
    const zap2 = give(s0, opp, card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." }));
    // It's the opponent's spell, cast on our turn.
    let s = priorityTo(s0, opp);
    s = castOnly(s, opp, zap, [{ kind: "player", id: ap }]);
    s = priorityTo(s, ap);
    s = settle(castOnly(s, ap, ids[0]!, [stackTarget(s, "Shock")]));
    expect(s.pending).toMatchObject({ kind: "payUnless", player: opp, cost: "{2}", otherwise: "Divert changes its target" });
    s = settle(act(s, { type: "payUnless", player: opp, pay: false }));
    s = settle(act(s, { type: "changeTarget", player: ap, target: target(theirs) }));
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    // Paid: it stays aimed at us.
    const life = s.players[ap]!.life;
    s = priorityTo(s, opp);
    s = castOnly(s, opp, zap2, [{ kind: "player", id: ap }]);
    s = priorityTo(s, ap);
    s = settle(castOnly(s, ap, ids[1]!, [stackTarget(s, "Shock")]));
    const pay = botActions(s, opp);
    expect(pay[pay.length - 1]).toMatchObject({ type: "payUnless", player: opp, pay: true });
    s = settle(run(s, pay));
    expect(s.players[ap]!.life).toBe(life - 2);
  });

  it("Imp's Mischief: you lose life equal to that spell's mana value, X included (CR 202.3e)", () => {
    const { s: s0, ap, ids, opp } = setup([fireball, imps]);
    for (const l of [swamp, swamp, mountain, mountain]) putOnBattlefield(s0, ap, l);
    const life = s0.players[ap]!.life;
    let s = castOnly(s0, ap, ids[0]!, [{ kind: "player", id: opp }], 3);
    s = settle(castOnly(s, ap, ids[1]!, [stackTarget(s, "Blaze")]));
    if (s.pending?.kind === "changeTarget") s = settle(act(s, { type: "changeTarget", player: ap, target: { kind: "player", id: s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]! } }));
    expect(s.players[ap]!.life).toBe(life - 4);
  });

  it("a bot turns a spell aimed at its creature onto one of ours", () => {
    const { s: s0, ap, ids, opp } = setup([bolt]);
    putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    give(s0, opp, deflection, 4);
    let s = castOnly(s0, ap, ids[0]!, [target(theirs)]);
    s = priorityTo(s, opp);
    const plan = botActions(s, opp);
    expect(plan[plan.length - 1]).toMatchObject({ type: "castSpell", player: opp, targets: [{ kind: "stack" }] });
    s = run(s, plan);
    for (let i = 0; i < 80 && (s.stack.length || s.pending); i++) {
      const pid = waitingOn(s)!;
      s = pid === ap && !s.pending ? act(s, { type: "passPriority", player: ap }) : run(s, botActions(s, pid));
    }
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(logged(s, /Deflection changes the target of Lightning Bolt to/)).toBe(true);
  });
});
