// Mana abilities with costs or more than one mana, explore, renown, bloodthirst, fabricate,
// modular, evolve, battle cry, counter annihilation, affinity, improvise, cascade.
// CR 605, 106.1, 903.4f, 701.44, 702.112, 702.54, 702.123, 702.43, 702.100, 702.91, 704.5q,
// 702.41, 702.126, 702.85.

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, passUntil, pt, putOnBattlefield, setup, target, forest } from "./helpers";
import {
  availableMana,
  botActions,
  castProblem,
  compileCard,
  isFullySupported,
  manaOptions,
  planCast,
  planMana,
  parseManaCost,
  parseTargetPhrase,
  spellCost,
  waitingOn,
  type CardDef,
  type GameState,
  type PlayerId,
} from "../src";

const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const o = (s: GameState, id: string) => s.objects[id]!;
const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const artifact = (name: string, oracleText: string, manaCost = "{2}") => card(name, "Artifact", manaCost, { oracleText });
const land = (name: string, oracleText: string) => card(name, "Land", "", { oracleText });

/** Take every land away from `pid`, so a test controls exactly what mana there is. */
function noLands(s: GameState, pid: PlayerId) {
  s.battlefield = s.battlefield.filter((id) => !(s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land")));
}

/** Put a card on top of `pid`'s library. */
function onTop(s: GameState, pid: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
}

/** Run actions for whoever we're waiting on (bots for everyone) until the stack is empty and nothing is pending. */
function settle(s: GameState) {
  for (let i = 0; i < 40 && (s.stack.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    for (const a of botActions(s, pid)) s = act(s, a);
  }
  return s;
}

describe("mana abilities (CR 605)", () => {
  it("pays a Signet's {1} with another source to get two colors (CR 605.3a)", () => {
    const signet = artifact("Azorius Signet", "{1}, {T}: Add {W}{U}.");
    const spell = card("Detention", "Sorcery", "{W}{U}", { oracleText: "Draw a card." });
    supported(signet, spell);
    const { s, ap, ids } = setup([spell]);
    noLands(s, ap);
    putOnBattlefield(s, ap, forest);
    const sig = putOnBattlefield(s, ap, signet);
    const plan = planCast(s, ap, ids[0]!)!;
    expect(plan.map((a) => a.type)).toEqual(["activateMana", "activateMana", "castSpell"]);
    expect(plan[1]).toMatchObject({ objectId: sig });
    let t = s;
    for (const a of plan) t = act(t, a);
    expect(zone(t, ids[0]!)).toBe("stack");
    expect(availableMana(s, ap)).toBe(2); // the Forest, plus the Signet's net one
  });

  it("an ability that adds {C}{C} pays a two-mana cost alone", () => {
    const rock = artifact("Sisay's Ring", "{T}: Add {C}{C}.", "{4}");
    supported(rock);
    const { s, ap } = setup([]);
    noLands(s, ap);
    const r = putOnBattlefield(s, ap, rock);
    const plan = planMana(s, ap, parseManaCost("{2}"))!;
    expect(plan).toEqual([{ type: "activateMana", player: ap, objectId: r, mana: "C", ability: 0 }]);
    const t = act(s, plan[0]!);
    expect(t.players[ap]!.manaPool.C).toBe(2);
  });

  it("a painland deals 1 damage only for colored mana, and auto-pay uses its {C} for generic costs", () => {
    const pain = land("Adarkar Wastes", "{T}: Add {C}.\n{T}: Add {W} or {U}. This land deals 1 damage to you.");
    supported(pain);
    const { s, ap } = setup([]);
    noLands(s, ap);
    const l = putOnBattlefield(s, ap, pain);
    expect(manaOptions(s, o(s, l)).map((x) => x.mana)).toEqual(["C", "W", "U"]);
    expect(planMana(s, ap, parseManaCost("{1}"))![0]).toMatchObject({ mana: "C" });
    const life = s.players[ap]!.life;
    const t = act(s, { type: "activateMana", player: ap, objectId: l, mana: "W" });
    expect(t.players[ap]!.life).toBe(life - 1);
    expect(t.players[ap]!.manaPool.W).toBe(1);
  });

  it("a land that doesn't untap during your next untap step stays tapped once", () => {
    const marsh = land("Cinder Marsh", "{T}: Add {C}.\n{T}: Add {B} or {R}. This land doesn't untap during your next untap step.");
    supported(marsh);
    const { s, ap } = setup([]);
    const l = putOnBattlefield(s, ap, marsh);
    let t = act(s, { type: "activateMana", player: ap, objectId: l, mana: "B" });
    t = passUntil(passUntil(t, "upkeep"), "upkeep", ap);
    expect(o(t, l).tapped).toBe(true);
    t = passUntil(passUntil(t, "draw"), "upkeep", ap);
    expect(o(t, l).tapped).toBe(false);
  });

  it("adds mana for each creature you control, and Mana Confluence costs 1 life", () => {
    const cradle = land("Gaea's Cradle", "{T}: Add {G} for each creature you control.");
    const confluence = land("Mana Confluence", "{T}, Pay 1 life: Add one mana of any color.");
    supported(cradle, confluence);
    const { s, ap, opp } = setup([]);
    const c = putOnBattlefield(s, ap, cradle);
    const m = putOnBattlefield(s, ap, confluence);
    putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, opp, bear()); // not yours
    let t = act(s, { type: "activateMana", player: ap, objectId: c, mana: "G" });
    expect(t.players[ap]!.manaPool.G).toBe(2);
    const life = t.players[ap]!.life;
    t = act(t, { type: "activateMana", player: ap, objectId: m, mana: "R" });
    expect(t.players[ap]!.life).toBe(life - 1);
    expect(t.players[ap]!.manaPool.R).toBe(1);
  });

  it("Arcane Signet makes only colors in your commander's color identity (CR 903.4f)", () => {
    const arcane = artifact("Arcane Signet", "{T}: Add one mana of any color in your commander's color identity.");
    supported(arcane);
    const { s, ap } = setup([]);
    const a = putOnBattlefield(s, ap, arcane);
    expect(manaOptions(s, o(s, a)).map((x) => x.mana)).toEqual(["G"]); // the test commanders are green
  });

  it("Eldrazi Spawn tokens get their quoted mana ability (CR 111.3)", () => {
    const spawner = card("Spawner", "Sorcery", "{1}", { oracleText: 'Create a 0/1 colorless Eldrazi Spawn creature token. It has "Sacrifice this creature: Add {C}."' });
    supported(spawner);
    const { s: s0, ap, ids } = setup([spawner]);
    const s = cast(s0, ap, ids[0]!);
    const spawn = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Eldrazi Spawn Token")!;
    expect(spawn).toBeDefined();
    const t = act(s, { type: "activateMana", player: ap, objectId: spawn, mana: "C" });
    expect(t.players[ap]!.manaPool.C).toBe(1);
    expect(t.objects[spawn]).toBeUndefined(); // sacrificed; a token ceases to exist (CR 704.5d)
  });
});

describe("explore (CR 701.44)", () => {
  const scout = bear({ name: "Scout", oracleText: "When this creature enters, it explores." });

  it("a land on top goes to your hand and there's no counter", () => {
    supported(scout);
    const { s: s0, ap, ids } = setup([scout]);
    const top = onTop(s0, ap, forest);
    const s = settle(cast(s0, ap, ids[0]!));
    expect(zone(s, top)).toBe("hand");
    expect(pt(s, ids[0]!)).toBe("2/2");
  });

  it("a nonland card: a +1/+1 counter, then you choose to keep it on top or mill it", () => {
    const { s: s0, ap, ids } = setup([scout]);
    const top = onTop(s0, ap, bear({ name: "Big Thing", manaCost: "{9}" }));
    let s = cast(s0, ap, ids[0]!);
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", card: top });
    expect(pt(s, ids[0]!)).toBe("3/3"); // the counter comes first
    const kept = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(kept.players[ap]!.library[0]).toBe(top);
    const milled = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(zone(milled, top)).toBe("graveyard");
  });
});

describe("counters as creatures enter or deal damage", () => {
  it("renown: counters and renowned the first time it deals combat damage to a player, never again (702.112a)", () => {
    const knight = bear({ name: "Renown Knight", oracleText: "Renown 2" });
    supported(knight);
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, knight);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: k, defender: opp }] });
    s = passUntil(s, "end", ap);
    expect(pt(s, k)).toBe("4/4");
    expect(o(s, k).renowned).toBe(true);
    // Next turn it connects again: no trigger (an intervening if, CR 603.4).
    s = passUntil(passUntil(s, "upkeep"), "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: k, defender: opp }] });
    s = passUntil(s, "end", ap);
    expect(pt(s, k)).toBe("4/4");
  });

  it("bloodthirst: enters with counters only if an opponent was dealt damage this turn (702.54a)", () => {
    const thirsty = bear({ name: "Thirsty", oracleText: "Bloodthirst 2" });
    const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
    supported(thirsty, shock);
    const { s: s0, ap, opp, ids } = setup([thirsty, thirsty, shock]);
    let s = cast(s0, ap, ids[0]!);
    expect(pt(s, ids[0]!)).toBe("2/2");
    s = cast(s, ap, ids[2]!, [{ kind: "player", id: opp }]);
    s = cast(s, ap, ids[1]!);
    expect(pt(s, ids[1]!)).toBe("4/4");
  });

  it("fabricate: counters, or Servos if you decline or it's gone (702.123a)", () => {
    const maker = bear({ name: "Maker", oracleText: "Fabricate 2" });
    supported(maker);
    const { s: s0, ap, ids } = setup([maker]);
    let s = cast(s0, ap, ids[0]!);
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const yes = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(pt(yes, ids[0]!)).toBe("4/4");
    const no = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(pt(no, ids[0]!)).toBe("2/2");
    expect(no.battlefield.filter((id) => no.cards[no.objects[id]!.cardId]!.name === "Servo Token")).toHaveLength(2);
  });

  it("modular: enters with counters, and moves them to an artifact creature when it dies (702.43a)", () => {
    const worker = card("Arcbound Worker", "Artifact Creature — Construct", "{1}", { oracleText: "Modular 2", power: "0", toughness: "0" });
    const golem = card("Golem", "Artifact Creature — Golem", "{3}", { power: "3", toughness: "3" });
    const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
    supported(worker, golem, murder);
    const { s: s0, ap, ids } = setup([worker, murder]);
    const g = putOnBattlefield(s0, ap, golem);
    let s = cast(s0, ap, ids[0]!);
    expect(pt(s, ids[0]!)).toBe("2/2");
    s.battlefield.forEach((id) => (s.objects[id]!.tapped = false));
    s = cast(s, ap, ids[1]!, [target(ids[0]!)]);
    s = settle(s);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(pt(s, g)).toBe("5/5");
  });

  it("evolve: a counter when a bigger creature enters, nothing for a smaller one (702.100a)", () => {
    const evolver = bear({ name: "Evolver", oracleText: "Evolve", power: "1", toughness: "1" });
    supported(evolver);
    const small = bear({ name: "Small", power: "1", toughness: "1", manaCost: "{G}" });
    const big = bear({ name: "Big", power: "1", toughness: "3", manaCost: "{G}" });
    const { s: s0, ap, ids } = setup([small, big]);
    const e = putOnBattlefield(s0, ap, evolver);
    let s = cast(s0, ap, ids[0]!);
    expect(s.stack).toHaveLength(0);
    expect(pt(s, e)).toBe("1/1");
    s = settle(cast(s, ap, ids[1]!));
    expect(pt(s, e)).toBe("2/2");
  });

  it("battle cry: each other attacking creature gets +1/+0 (702.91a)", () => {
    const crier = bear({ name: "Crier", oracleText: "Battle cry" });
    supported(crier);
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, crier);
    const a = putOnBattlefield(s0, ap, bear());
    const home = putOnBattlefield(s0, ap, bear({ name: "Home" }));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: c, defender: opp }, { attacker: a, defender: opp }] });
    s = settle(s);
    expect(pt(s, a)).toBe("3/2");
    expect(pt(s, c)).toBe("2/2");
    expect(pt(s, home)).toBe("2/2");
  });

  it("+1/+1 and -1/-1 counters cancel out (CR 704.5q)", () => {
    const { s: s0, ap, ids } = setup([card("Pass", "Instant", "{G}", { oracleText: "Draw a card." })]);
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[b]!.counters = { "+1/+1": 2, "-1/-1": 1 };
    const s = cast(s0, ap, ids[0]!);
    expect(s.objects[b]!.counters).toMatchObject({ "+1/+1": 1, "-1/-1": 0 });
  });
});

describe("other triggers and targets", () => {
  it('"artifact creature" means both types, not either', () => {
    expect(parseTargetPhrase("artifact creature")).toMatchObject({ allTypes: ["Artifact", "Creature"], types: [] });
    expect(parseTargetPhrase("artifact or creature")).toMatchObject({ types: ["Artifact", "Creature"] });
  });

  it("sacrifices itself when it becomes the target of a spell or ability", () => {
    const walker = bear({ name: "Frost Walker", oracleText: "When this creature becomes the target of a spell or ability, sacrifice it." });
    const giant = card("Giant Growth", "Instant", "{G}", { oracleText: "Target creature gets +3/+3 until end of turn." });
    supported(walker, giant);
    const { s: s0, ap, ids } = setup([giant]);
    const w = putOnBattlefield(s0, ap, walker);
    const s = settle(cast(s0, ap, ids[0]!, [target(w)]));
    expect(zone(s, w)).toBe("graveyard");
  });

  it("at the beginning of the end step (every turn's), it returns to its owner's hand", () => {
    const sand = bear({ name: "Sandscout", oracleText: "Haste\nAt the beginning of the end step, return this creature to its owner's hand.", keywords: ["Haste"] });
    supported(sand);
    const { s: s0, ap } = setup([]);
    const x = putOnBattlefield(s0, ap, sand);
    const s = settle(passUntil(s0, "end", ap));
    expect(zone(s, x)).toBe("hand");
  });

  it('"when it is put into a graveyard from the battlefield" works for a noncreature, and "it" is the card there', () => {
    const relic = artifact("Relic", "When this artifact is put into a graveyard from the battlefield, return it to its owner's hand.");
    const shatter = card("Shatter", "Instant", "{1}{R}", { oracleText: "Destroy target artifact." });
    supported(relic, shatter);
    const { s: s0, ap, ids } = setup([shatter]);
    const r = putOnBattlefield(s0, ap, relic);
    const s = settle(cast(s0, ap, ids[0]!, [target(r)]));
    expect(zone(s, r)).toBe("hand");
  });
});

describe("cost reductions and other ways to pay", () => {
  it("affinity for artifacts reduces generic mana only (702.41a)", () => {
    const frog = card("Frogmite", "Artifact Creature — Frog", "{4}", { oracleText: "Affinity for artifacts", power: "2", toughness: "2" });
    const myr = card("Somber Hoverguard", "Artifact Creature — Bird", "{5}{U}", { oracleText: "Affinity for artifacts\nFlying", power: "3", toughness: "2", keywords: ["Flying"] });
    supported(frog, myr);
    const { s, ap, ids } = setup([frog, myr]);
    for (let i = 0; i < 5; i++) putOnBattlefield(s, ap, artifact(`Bauble ${i}`, ""));
    expect(spellCost(s, ap, o(s, ids[0]!)).extra).toBe(0);
    const hover = spellCost(s, ap, o(s, ids[1]!));
    expect(hover.extra).toBe(0);
    expect(hover.cost.symbols).toEqual([{ kind: "colored", color: "U" }]);
    noLands(s, ap);
    expect(castProblem(s, ap, ids[0]!)).toBeNull(); // free
    expect(castProblem(s, ap, ids[1]!)).toMatch(/not enough mana/); // still needs {U}
  });

  it("improvise taps artifacts for generic mana when mana alone can't pay (702.126a)", () => {
    const spell = card("Inventive Thing", "Sorcery", "{3}{U}", { oracleText: "Improvise\nDraw two cards." });
    supported(spell);
    const { s, ap, ids } = setup([spell]);
    noLands(s, ap);
    putOnBattlefield(s, ap, card("Island", "Basic Land — Island"));
    const arts = [0, 1, 2].map((i) => putOnBattlefield(s, ap, artifact(`Gizmo ${i}`, "")));
    const plan = planCast(s, ap, ids[0]!, undefined, undefined, "auto")!;
    expect(plan[plan.length - 1]).toMatchObject({ type: "castSpell", improvise: arts.slice().reverse() });
    let t = s;
    for (const a of plan) t = act(t, a);
    expect(arts.every((id) => t.objects[id]!.tapped)).toBe(true);
    expect(zone(t, ids[0]!)).toBe("stack");
    // A creature tapped for convoke can't also improvise, and more artifacts than generic mana is illegal.
    expect(castProblem(s, ap, ids[0]!, undefined, undefined, undefined, [...arts, putOnBattlefield(s, ap, artifact("Extra", ""))])).toMatch(/more artifacts/);
  });

  it("cascade exiles until a cheaper nonland card, lets you cast it free, and bottoms the rest (702.85a)", () => {
    const cascader = card("Bloodbraid Thing", "Sorcery", "{2}{R}{G}", { oracleText: "Cascade\nDraw a card." });
    const hit = card("Cheap Draw", "Sorcery", "{1}{U}", { oracleText: "Draw two cards." });
    const pricey = card("Pricey", "Sorcery", "{7}", { oracleText: "Draw a card." });
    supported(cascader, hit);
    expect(compileCard(cascader).triggers[0]!.event).toBe("selfCast");
    const { s: s0, ap, ids } = setup([cascader]);
    const h = onTop(s0, ap, hit);
    const p = onTop(s0, ap, pricey);
    const l = onTop(s0, ap, forest);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    for (let i = 0; i < 10 && s.pending?.kind !== "castFree"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: h });
    expect(zone(s, l)).toBe("exile");
    expect(zone(s, p)).toBe("exile");
    expect(castProblem(s, ap, h)).toBeNull(); // from exile, mid-resolution, at no cost
    const cast1 = act(s, { type: "castSpell", player: ap, objectId: h });
    expect(zone(cast1, h)).toBe("stack");
    expect(cast1.stack.map((x) => x.description)).toEqual(["Bloodbraid Thing", "Cheap Draw"]); // above the cascade spell
    const lib = cast1.players[ap]!.library;
    expect(lib.slice(-2).sort()).toEqual([l, p].sort());
    // Declining: the hit goes to the bottom too.
    const declined = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(declined.players[ap]!.library.slice(-3).sort()).toEqual([h, l, p].sort());
    expect(passAll(cast1).stack.length).toBeLessThan(2);
  });
});
