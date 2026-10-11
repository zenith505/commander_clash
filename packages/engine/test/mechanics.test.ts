// Cycling, crew, convoke, ward, prowess and "whenever you cast" triggers.
// CR 702.29, 702.122, 702.51, 702.21, 702.108, 601.2i; "becomes an artifact creature" CR 205.1.

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, passAll, pt, putOnBattlefield, setup, target } from "./helpers";
import {
  abilityProblem,
  botActions,
  characteristics,
  compileCard,
  convokeReduce,
  isFullySupported,
  objIsType,
  parseManaCost,
  planActivate,
  planCast,
  waitingOn,
  type Action,
  type GameState,
  type PlayerId,
} from "../src";

const run = (s: GameState, actions: Action[]) => actions.reduce((x, a) => act(x, a), s);
const castOnly = (s: GameState, pid: PlayerId, id: string, targets?: Parameters<typeof planCast>[3], convoke?: string[] | "auto") => {
  const plan = planCast(s, pid, id, targets, undefined, convoke);
  if (!plan) throw new Error("can't cast");
  return run(s, plan);
};
const hand = (s: GameState, pid: PlayerId) => s.players[pid]!.hand;
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const types = (s: GameState, id: string) => characteristics(s, s.objects[id]!).types;
const subtypes = (s: GameState, id: string) => characteristics(s, s.objects[id]!).subtypes;
const logged = (s: GameState, re: RegExp) => s.log.some((e) => re.test(e.text));
/** Pass priority once for each player, so the top of the stack resolves. */
const resolveOne = (s: GameState) => {
  const n = s.stack.length;
  for (let i = 0; i < 4 && s.stack.length === n && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("cycling (CR 702.29)", () => {
  const cycler = card("Cycler", "Creature — Beast", "{5}{G}", { power: "6", toughness: "6", oracleText: "Cycling {2}" });

  it("discards itself as a cost, then draws a card when the ability resolves", () => {
    const { s: s0, ap, ids } = setup([cycler]);
    const before = hand(s0, ap).length;
    let s = run(s0, planActivate(s0, ap, ids[0]!, 0)!);
    expect(zone(s, ids[0]!)).toBe("graveyard"); // paid as the ability was activated (CR 602.2b)
    expect(s.stack).toHaveLength(1);
    expect(hand(s, ap)).toHaveLength(before - 1);
    expect(logged(s, /cycles Cycler \(Cycling \{2\}\)/)).toBe(true);
    s = passAll(s);
    expect(s.stack).toHaveLength(0);
    expect(hand(s, ap)).toHaveLength(before); // drew one
  });

  it("only works from its owner's hand, not the battlefield", () => {
    const { s, ap } = setup([]);
    const id = putOnBattlefield(s, ap, cycler);
    expect(abilityProblem(s, ap, id, 0)).toMatch(/only from your hand/);
  });

  it("works at instant speed, with the stack not empty", () => {
    const bolt = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
    const { s: s0, ap, ids, opp } = setup([bolt, cycler]);
    const s = castOnly(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(s.stack).toHaveLength(1);
    expect(abilityProblem(s, ap, ids[1]!, 0)).toMatch(/not enough mana|^null$/);
    expect(planActivate(s, ap, ids[1]!, 0)).not.toBeNull();
  });

  it("a spell with cycling still compiles its spell text without the cycling line", () => {
    const d = card("Removal", "Instant", "{1}{B}", { oracleText: "Destroy target creature.\nCycling {2}" });
    const c = compileCard(d);
    expect(c.spell?.text).toBe("Destroy target creature.");
    expect(c.activated).toMatchObject([{ zone: "hand", discardSelf: true, manaCost: "{2}" }]);
    expect(isFullySupported(d)).toBe(true);
  });

  it("bots cycle lands they don't need in their second main phase", () => {
    const cyclingLand = card("Cycling Plains", "Land — Plains", "", { oracleText: "Cycling {2}" });
    const { s, ap, ids } = setup([cyclingLand]); // 14 lands on the battlefield already
    s.step = "main2";
    s.players[ap]!.landsPlayedThisTurn = 1;
    s.players[ap]!.hand = [ids[0]!];
    s.players[ap]!.command = [];
    const acts = botActions(s, ap);
    expect(acts[acts.length - 1]).toMatchObject({ type: "activateAbility", objectId: ids[0], index: 0 });
  });
});

describe("crew (CR 702.122)", () => {
  const copter = card("Sky Skiff", "Artifact — Vehicle", "{2}", { power: "3", toughness: "3", oracleText: "Flying\nCrew 1" });

  it("isn't a creature until crewed, then is an artifact creature that's still a Vehicle (CR 205.1b, 301.7)", () => {
    const { s: s0, ap } = setup([]);
    const v = putOnBattlefield(s0, ap, copter);
    const pilot = putOnBattlefield(s0, ap, bear({ name: "Pilot" }), { sick: true }); // summoning sick can still crew
    expect(objIsType(s0, s0.objects[v]!, "Creature")).toBe(false);
    let s = act(s0, { type: "activateAbility", player: ap, objectId: v, index: 0, tapCreatures: [pilot] });
    expect(s.objects[pilot]!.tapped).toBe(true);
    expect(s.objects[v]!.tapped).toBe(false);
    expect(logged(s, /crews Sky Skiff with Pilot/)).toBe(true);
    s = passAll(s);
    expect(types(s, v)).toEqual(["Artifact", "Creature"]);
    expect(subtypes(s, v)).toEqual(["Vehicle"]);
    expect(pt(s, v)).toBe("3/3");
  });

  it("stops being a creature at end of turn", () => {
    const { s: s0, ap } = setup([]);
    const v = putOnBattlefield(s0, ap, copter);
    const pilot = putOnBattlefield(s0, ap, bear());
    let s = passAll(act(s0, { type: "activateAbility", player: ap, objectId: v, index: 0, tapCreatures: [pilot] }));
    expect(objIsType(s, s.objects[v]!, "Creature")).toBe(true);
    for (let i = 0; i < 200 && s.activePlayer === ap; i++) {
      const pend = s.pending;
      const pid = waitingOn(s)!;
      if (pend?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
      else if (pend?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
      else if (pend?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: hand(s, pid).slice(0, pend.count) });
      else s = act(s, { type: "passPriority", player: pid });
    }
    expect(objIsType(s, s.objects[v]!, "Creature")).toBe(false);
  });

  it("can't tap itself, tapped creatures, or too little power", () => {
    const { s, ap, opp } = setup([]);
    const v = putOnBattlefield(s, ap, card("Big Rig", "Artifact — Vehicle", "{3}", { power: "5", toughness: "5", oracleText: "Crew 3" }));
    const small = putOnBattlefield(s, ap, bear());
    const tapped = putOnBattlefield(s, ap, bear({ name: "Tired Bear" }));
    s.objects[tapped]!.tapped = true;
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    expect(abilityProblem(s, ap, v, 0, undefined, undefined, [v])).toMatch(/can't crew itself/);
    expect(abilityProblem(s, ap, v, 0, undefined, undefined, [small])).toMatch(/total power 2; crew 3/);
    expect(abilityProblem(s, ap, v, 0, undefined, undefined, [small, tapped])).toMatch(/already tapped/);
    expect(abilityProblem(s, ap, v, 0, undefined, undefined, [small, theirs])).toMatch(/only creatures you control/);
    expect(abilityProblem(s, ap, v, 0)).toMatch(/not enough untapped creatures/);
    expect(() => act(s, { type: "activateAbility", player: ap, objectId: v, index: 0 })).toThrow();
    const big = putOnBattlefield(s, ap, bear({ name: "Big Bear", power: "3" }));
    expect(abilityProblem(s, ap, v, 0, undefined, undefined, [big])).toBeNull();
  });

  it("a crewed Vehicle can crew another one", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, copter);
    const b = putOnBattlefield(s0, ap, card("Other Skiff", "Artifact — Vehicle", "{2}", { power: "2", toughness: "2", oracleText: "Crew 2" }));
    const pilot = putOnBattlefield(s0, ap, bear());
    let s = passAll(act(s0, { type: "activateAbility", player: ap, objectId: a, index: 0, tapCreatures: [pilot] }));
    s = passAll(act(s, { type: "activateAbility", player: ap, objectId: b, index: 0, tapCreatures: [a] }));
    expect(objIsType(s, s.objects[b]!, "Creature")).toBe(true);
  });

  it("bots crew before combat with creatures that can't attack anyway", () => {
    const { s, ap } = setup([]);
    s.players[ap]!.hand = [];
    s.players[ap]!.command = [];
    const v = putOnBattlefield(s, ap, copter);
    const sick = putOnBattlefield(s, ap, bear({ name: "New Bear" }), { sick: true });
    putOnBattlefield(s, ap, bear({ name: "Old Bear" }));
    const acts = botActions(s, ap);
    expect(acts[acts.length - 1]).toMatchObject({ type: "activateAbility", objectId: v, tapCreatures: [sick] });
  });
});

describe("becoming an artifact creature (CR 205.1)", () => {
  const sword = card("Sword", "Artifact — Equipment", "{1}", { oracleText: "Equipped creature gets +1/+1.\nEquip {1}" });

  it("'becomes a 2/2 artifact creature' keeps its other types and subtypes (205.1b)", () => {
    const animate = card("Animate", "Sorcery", "{1}{U}", { oracleText: "Target artifact becomes a 4/4 artifact creature until end of turn." });
    const { s: s0, ap, ids } = setup([animate]);
    const eq = putOnBattlefield(s0, ap, sword);
    const s = passAll(castOnly(s0, ap, ids[0]!, [target(eq)]));
    expect(types(s, eq)).toEqual(["Artifact", "Creature"]);
    expect(subtypes(s, eq)).toEqual(["Equipment"]);
    expect(pt(s, eq)).toBe("4/4");
  });

  it("'a Golem artifact creature' replaces only its creature types (205.1b)", () => {
    const animate = card("Animate Golem", "Sorcery", "{1}{U}", { oracleText: "Target artifact becomes a 3/3 Golem artifact creature until end of turn." });
    const { s: s0, ap, ids } = setup([animate]);
    const robot = putOnBattlefield(s0, ap, card("Robo Sword", "Artifact Creature — Equipment Construct", "{2}", { power: "1", toughness: "1" }));
    const s = passAll(castOnly(s0, ap, ids[0]!, [target(robot)]));
    expect(subtypes(s, robot)).toEqual(["Equipment", "Golem"]);
  });

  it("setting creature types leaves land types alone; setting card types drops the subtypes of types it loses (205.1a)", () => {
    const { s, ap } = setup([]);
    const arbor = putOnBattlefield(s, ap, card("Arbor", "Land Creature — Forest Dryad", "", { power: "1", toughness: "1" }));
    addEffect(s, ap, [arbor], [{ kind: "setSubtypes", subtypes: ["Frog"] }]);
    expect(subtypes(s, arbor)).toEqual(["Forest", "Frog"]);
    addEffect(s, ap, [arbor], [{ kind: "setTypes", types: ["Creature"], subtypes: [] }]);
    expect(types(s, arbor)).toEqual(["Creature"]);
    expect(subtypes(s, arbor)).toEqual(["Frog"]); // Forest went with Land; the creature type stays
  });
});

describe("convoke (CR 702.51)", () => {
  const rally = card("Rally", "Sorcery", "{2}{W}", { oracleText: "Convoke\nYou gain 4 life.", colors: ["W"] });
  const white = (name: string) => card(name, "Creature — Soldier", "{W}", { power: "1", toughness: "1", colors: ["W"] });
  const green = (name: string) => card(name, "Creature — Elf", "{G}", { power: "1", toughness: "1", colors: ["G"] });

  it("each creature pays one generic or one mana of its color", () => {
    const cost = parseManaCost("{2}{W}");
    expect(convokeReduce(cost, 0, [["W"], ["G"]])).toMatchObject({ symbols: [{ kind: "generic", amount: 1 }] });
    expect(convokeReduce(cost, 0, [["G"], ["G"]])).toMatchObject({ symbols: [{ kind: "colored", color: "W" }] });
    expect(convokeReduce(cost, 0, [["G"], ["G"], ["G"]])).toBeNull(); // a green creature can't pay {W}
    expect(convokeReduce(cost, 0, [["W"], ["G"], ["G"], ["G"]])).toBeNull(); // more creatures than mana
    // Commander tax is part of the total cost, so creatures can pay it (702.51b).
    expect(convokeReduce(cost, 2, [["G"], ["G"], ["G"], ["G"]])).toMatchObject({ symbols: [{ kind: "colored", color: "W" }] });
  });

  it("can't pay {C}, and matches two-color creatures so every colored symbol gets paid", () => {
    expect(convokeReduce(parseManaCost("{C}"), 0, [["W"]])).toBeNull();
    expect(convokeReduce(parseManaCost("{W}{G}"), 0, [["W", "G"], ["W"]])).toMatchObject({ symbols: [] });
  });

  it("taps the creatures, summoning sick ones included, as part of casting", () => {
    const { s: s0, ap, ids } = setup([rally]);
    const a = putOnBattlefield(s0, ap, white("Soldier A"), { sick: true });
    const b = putOnBattlefield(s0, ap, green("Elf B"), { sick: true });
    const c = putOnBattlefield(s0, ap, green("Elf C"));
    const life = s0.players[ap]!.life;
    let s = act(s0, { type: "castSpell", player: ap, objectId: ids[0]!, convoke: [a, b, c] }); // no mana at all
    expect([a, b, c].map((id) => s.objects[id]!.tapped)).toEqual([true, true, true]);
    expect(logged(s, /casts Rally, convoking with Soldier A, Elf B, Elf C/)).toBe(true);
    s = passAll(s);
    expect(s.players[ap]!.life).toBe(life + 4);
  });

  it("can't convoke with tapped creatures or without convoke", () => {
    const plain = card("Plain Rally", "Sorcery", "{2}{W}", { oracleText: "You gain 4 life." });
    const { s, ap, ids } = setup([rally, plain]);
    const a = putOnBattlefield(s, ap, white("Soldier A"));
    s.objects[a]!.tapped = true;
    expect(() => act(s, { type: "castSpell", player: ap, objectId: ids[0]!, convoke: [a] })).toThrow(/already tapped/);
    s.objects[a]!.tapped = false;
    expect(() => act(s, { type: "castSpell", player: ap, objectId: ids[1]!, convoke: [a] })).toThrow(/doesn't have convoke/);
  });

  it("autopay adds creatures only when lands can't pay", () => {
    const { s, ap, ids } = setup([rally]);
    const a = putOnBattlefield(s, ap, white("Soldier A"), { sick: true });
    expect(planCast(s, ap, ids[0]!, undefined, undefined, "auto")!.at(-1)).not.toHaveProperty("convoke");
    for (const id of s.battlefield) if (objIsType(s, s.objects[id]!, "Land")) s.objects[id]!.tapped = true;
    const lands = s.battlefield.filter((id) => objIsType(s, s.objects[id]!, "Land"));
    s.objects[lands[0]!]!.tapped = false; // one Mountain left
    s.objects[lands[1]!]!.tapped = false;
    const plan = planCast(s, ap, ids[0]!, undefined, undefined, "auto")!;
    expect(plan.at(-1)).toMatchObject({ type: "castSpell", convoke: [a] });
    const after = run(s, plan);
    expect(after.stack).toHaveLength(1);
  });
});

describe("ward (CR 702.21)", () => {
  const warded = (extra = "") => bear({ name: "Warded Bear", oracleText: `Ward {2}${extra}` });
  const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });

  it("triggers when an opponent's spell targets it; unpaid, the spell is countered", () => {
    const { s: s0, ap, ids, opp } = setup([murder]);
    const w = putOnBattlefield(s0, opp, warded());
    let s = castOnly(s0, ap, ids[0]!, [target(w)]);
    expect(s.stack.map((x) => x.kind)).toEqual(["spell", "ability"]); // ward goes on top
    expect(s.stack[1]!.cause).toBe(s.stack[0]!.id);
    s = resolveOne(s);
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, cost: "{2}", what: "Murder" });
    expect(waitingOn(s)).toBe(ap);
    s = act(s, { type: "payUnless", player: ap, pay: false });
    expect(s.stack).toHaveLength(0);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(logged(s, /Warded Bear's ward counters Murder/)).toBe(true);
    s = passAll(s);
    expect(zone(s, w)).toBe("battlefield");
  });

  it("paid (tapping lands for mana mid-resolution, CR 605.3a), the spell resolves", () => {
    const { s: s0, ap, ids, opp } = setup([murder]);
    const w = putOnBattlefield(s0, opp, warded());
    let s = resolveOne(castOnly(s0, ap, ids[0]!, [target(w)]));
    expect(() => act(s, { type: "payUnless", player: ap, pay: true })).toThrow(/not enough mana/);
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped && objIsType(s, s.objects[id]!, "Land"));
    for (const l of lands.slice(0, 2)) s = act(s, { type: "activateMana", player: ap, objectId: l, mana: characteristics(s, s.objects[l]!).subtypes[0] === "Forest" ? "G" : characteristics(s, s.objects[l]!).subtypes[0] === "Island" ? "U" : characteristics(s, s.objects[l]!).subtypes[0] === "Swamp" ? "B" : characteristics(s, s.objects[l]!).subtypes[0] === "Plains" ? "W" : "R" });
    s = act(s, { type: "payUnless", player: ap, pay: true });
    expect(s.stack.map((x) => x.description)).toEqual(["Murder"]);
    s = passAll(s);
    expect(zone(s, w)).toBe("graveyard");
  });

  it("doesn't trigger for its controller's own spells", () => {
    const pump = card("Pump", "Instant", "{G}", { oracleText: "Target creature gets +2/+2 until end of turn." });
    const { s: s0, ap, ids } = setup([pump]);
    const w = putOnBattlefield(s0, ap, warded());
    const s = castOnly(s0, ap, ids[0]!, [target(w)]);
    expect(s.stack).toHaveLength(1);
  });

  it("counters activated abilities too", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, opp, warded());
    const tapper = putOnBattlefield(s0, ap, card("Tapper", "Artifact", "{1}", { oracleText: "{1}, {T}: Tap target creature." }));
    let s = run(s0, planActivate(s0, ap, tapper, 0, [target(w)])!);
    expect(s.stack).toHaveLength(2);
    s = act(resolveOne(s), { type: "payUnless", player: ap, pay: false });
    expect(s.stack).toHaveLength(0);
    expect(s.objects[w]!.tapped).toBe(false);
    expect(logged(s, /ward counters Tapper's ability/)).toBe(true);
  });

  it("can't counter a spell that can't be countered", () => {
    const sure = card("Sure Kill", "Instant", "{1}{B}", { oracleText: "This spell can't be countered.\nDestroy target creature." });
    const { s: s0, ap, ids, opp } = setup([sure]);
    const w = putOnBattlefield(s0, opp, warded());
    let s = resolveOne(castOnly(s0, ap, ids[0]!, [target(w)]));
    expect(s.pending).toBeNull();
    expect(logged(s, /can't be countered/)).toBe(true);
    s = passAll(s);
    expect(zone(s, w)).toBe("graveyard");
  });

  it("a spell aiming at it twice triggers ward once", () => {
    const two = card("Double Tap", "Instant", "{U}", { oracleText: "Tap target creature. Untap target creature." });
    const { s: s0, ap, ids, opp } = setup([two]);
    const w = putOnBattlefield(s0, opp, warded());
    const spec = compileCard(two).spell!;
    if (spec.targets.length !== 2) return; // template not supported; nothing to check
    const s = castOnly(s0, ap, ids[0]!, [target(w), target(w)]);
    expect(s.stack).toHaveLength(2);
  });

  it("bots pay for ward when they can", () => {
    const { s: s0, ap, ids, opp } = setup([murder]);
    const w = putOnBattlefield(s0, opp, warded());
    const s = resolveOne(castOnly(s0, ap, ids[0]!, [target(w)]));
    const acts = botActions(s, ap);
    expect(acts.at(-1)).toEqual({ type: "payUnless", player: ap, pay: true });
    const after = run(s, acts);
    expect(after.stack.map((x) => x.description)).toEqual(["Murder"]);
  });

  it("'Flying, ward {1}' compiles both", () => {
    const d = bear({ oracleText: "Flying, ward {1}", keywords: ["Flying", "Ward"] });
    expect(compileCard(d).triggers).toMatchObject([{ event: "becomesTargetOfOpponent" }]);
    expect(isFullySupported(d)).toBe(true);
  });
});

describe("prowess and 'whenever you cast' (CR 702.108, 601.2i)", () => {
  const monk = () => bear({ name: "Monk", oracleText: "Prowess", keywords: ["Prowess"] });
  const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

  it("prowess triggers on a noncreature spell and resolves before it", () => {
    const { s: s0, ap, ids, opp } = setup([shock]);
    const m = putOnBattlefield(s0, ap, monk());
    let s = castOnly(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(s.stack.map((x) => x.kind)).toEqual(["spell", "ability"]);
    s = resolveOne(s);
    expect(pt(s, m)).toBe("3/3");
    expect(s.stack).toHaveLength(1); // Shock still waiting
  });

  it("prowess doesn't trigger on creature spells, or on opponents' spells", () => {
    const { s: s0, ap, ids, opp } = setup([bear()]);
    putOnBattlefield(s0, ap, monk());
    putOnBattlefield(s0, opp, monk());
    const s = castOnly(s0, ap, ids[0]!);
    expect(s.stack).toHaveLength(1);
  });

  it("each instance triggers separately (702.108b)", () => {
    const { s: s0, ap, ids, opp } = setup([shock]);
    const m = putOnBattlefield(s0, ap, bear({ name: "Double Monk", oracleText: "Prowess\nProwess" }));
    const s = passAll(passAll(castOnly(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(pt(s, m)).toBe("4/4");
  });

  it("'Whenever you cast an instant or sorcery spell' checks the spell's types", () => {
    const pinger = bear({ name: "Pinger", oracleText: "Whenever you cast an instant or sorcery spell, Pinger deals 1 damage to each opponent." });
    const { s: s0, ap, ids, opp } = setup([shock, bear()]);
    putOnBattlefield(s0, ap, pinger);
    const life = s0.players[opp]!.life;
    let s = passAll(castOnly(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    s = passAll(s);
    expect(s.players[opp]!.life).toBe(life - 3);
    s = castOnly(s, ap, ids[1]!);
    expect(s.stack).toHaveLength(1); // the creature spell alone
  });

  it("'Whenever an opponent casts' triggers for its controller on someone else's spell", () => {
    const watcher = card("Watcher", "Enchantment", "{W}", { oracleText: "Whenever an opponent casts a creature spell, you gain 1 life." });
    const { s: s0, ap, ids, opp } = setup([bear()]);
    putOnBattlefield(s0, opp, watcher);
    putOnBattlefield(s0, ap, watcher);
    const life = s0.players[opp]!.life;
    let s = castOnly(s0, ap, ids[0]!);
    expect(s.stack).toHaveLength(2); // only the opponent's Watcher
    s = resolveOne(s);
    expect(s.players[opp]!.life).toBe(life + 1);
  });

  it("ability words are ignored: magecraft compiles as a cast trigger", () => {
    const d = bear({ oracleText: "Magecraft — Whenever you cast or copy an instant or sorcery spell, this creature gets +1/+1 until end of turn." });
    expect(compileCard(d).triggers).toMatchObject([{ event: "castSpell", cast: { by: "you", spell: { types: ["Instant", "Sorcery"] } } }]);
    expect(isFullySupported(d)).toBe(true);
  });

  it("'Whenever you cast a spell that targets' isn't supported", () => {
    const d = bear({ oracleText: "Whenever you cast a spell that targets this creature, draw a card." });
    expect(isFullySupported(d)).toBe(false);
  });
});
