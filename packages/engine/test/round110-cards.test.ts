// Round 110, the most played cards left: Urabrask // The Great Work (exile, then return transformed; chapter III casts
// instants and sorceries from any graveyard, exiled instead of going to a graveyard), Monster Manual // Zoological Study
// ("return a creature card milled this way").

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, scry, setup, target } from "./helpers";
import { characteristics, graveyardWays, isFullySupported, planActivate, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const urabrask = scry("transform", [
  {
    name: "Urabrask",
    mana_cost: "{2}{R}{R}",
    type_line: "Legendary Creature — Phyrexian Praetor",
    oracle_text:
      "First strike\nWhenever you cast an instant or sorcery spell, Urabrask deals 1 damage to target opponent. Add {R}.\n{R}: Exile Urabrask, then return it to the battlefield transformed under its owner's control. Activate only as a sorcery and only if you've cast three or more instant and/or sorcery spells this turn.",
    power: "4",
    toughness: "4",
  },
  {
    name: "The Great Work",
    type_line: "Enchantment — Saga",
    color_indicator: ["R"],
    oracle_text:
      "(As this Saga enters and after your draw step, add a lore counter.)\nI — This Saga deals 3 damage to target opponent and each creature they control.\nII — Create three Treasure tokens.\nIII — Until end of turn, you may cast instant and sorcery spells from any graveyard. If a spell cast this way would be put into a graveyard, exile it instead. Exile this Saga, then return it to the battlefield (front face up).",
  },
]);
const manual = scry("adventure", [
  { name: "Monster Manual", mana_cost: "{3}{G}", type_line: "Artifact — Book", oracle_text: "{1}{G}, {T}: You may put a creature card from your hand onto the battlefield." },
  {
    name: "Zoological Study",
    mana_cost: "{2}{G}",
    type_line: "Sorcery — Adventure",
    oracle_text: "Mill five cards, then return a creature card milled this way to your hand. (Then exile this card. You may cast the artifact later from exile.)",
  },
]);
const commandeer = card("Commandeer", "Instant", "{5}{U}{U}", {
  oracleText:
    "You may exile two blue cards from your hand rather than pay this spell's mana cost.\nGain control of target noncreature spell. You may choose new targets for it. (If that spell is an artifact, enchantment, or planeswalker, the permanent enters under your control.)",
});
const aethersnatch = card("Aethersnatch", "Instant", "{4}{U}{U}", { oracleText: "Gain control of target spell. You may choose new targets for it. (If that spell becomes a permanent, it enters under your control.)" });
const jill = scry("transform", [
  {
    name: "Jill, Shiva's Dominant",
    mana_cost: "{2}{U}",
    type_line: "Legendary Creature — Human Noble Warrior",
    oracle_text: "When Jill enters, return up to one other target nonland permanent to its owner's hand.\n{3}{U}{U}, {T}: Exile Jill, then return it to the battlefield transformed under its owner's control. Activate only as a sorcery.",
    power: "2",
    toughness: "2",
  },
  {
    name: "Shiva, Warden of Ice",
    type_line: "Legendary Enchantment Creature — Saga Elemental",
    color_indicator: ["U"],
    oracle_text:
      "(As this Saga enters and after your draw step, add a lore counter.)\nI, II — Mesmerize — Target creature can't be blocked this turn.\nIII — Cold Snap — Tap all lands your opponents control. Exile Shiva, then return it to the battlefield (front face up).",
    power: "4",
    toughness: "5",
  },
]);
// Test cards.
const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." });
const ponder = card("Test Ponder", "Sorcery", "{U}", { oracleText: "Draw a card." });
const relic = card("Test Relic", "Artifact", "{3}");
const blueA = card("Blue A", "Instant", "{U}", { oracleText: "Draw a card." });
const islandCard = card("Island", "Basic Land — Island");

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  if (!plan) throw new Error("no plan");
  return plan.reduce((x, a) => act(x, a), s);
};
/** Answer the trigger's target prompt, then let everything resolve. */
const answer = (s: GameState, pid: PlayerId, opp: PlayerId) => {
  for (let i = 0; i < 20 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: s.pending.player, targets: [{ kind: "player", id: opp }] });
    else if (s.pending) throw new Error(`pending ${s.pending.kind}`);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const toZone = (s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "library" | "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  return id;
};

describe("Urabrask // The Great Work", () => {
  it("after three instants and sorceries, {R} exiles it and returns it transformed: chapter I hits an opponent and their creatures", () => {
    supported(urabrask);
    const { s: s0, ap, ids } = setup([shock, shock, ponder]);
    let s = s0;
    const opp = next(s, ap);
    const u = putOnBattlefield(s, ap, urabrask);
    const bear = putOnBattlefield(s, opp, card("Opp Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "3" }));
    // Not yet: no spells cast this turn.
    expect(planActivate(s, ap, u, 0)).toBeNull();
    s = answer(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: next(s, opp) }])), ap, opp);
    s = answer(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: next(s, opp) }])), ap, opp);
    expect(planActivate(s, ap, u, 0)).toBeNull();
    s = answer(run(s, planCast(s, ap, ids[2]!)), ap, opp);
    // Each cast: 1 damage to the opponent (and {R}).
    expect(s.players[opp]!.life).toBe(37);
    s = run(s, planActivate(s, ap, u, 0));
    s = answer(s, ap, opp);
    const work = s.battlefield.find((id) => characteristics(s, s.objects[id]!).name === "The Great Work")!;
    expect(work).toBeDefined();
    expect(s.objects[work]!.counters.lore).toBe(1);
    expect(s.players[opp]!.life).toBe(34);
    expect(s.objects[bear]!.zone).toBe("graveyard");
  });

  it("chapter III: cast an instant from an opponent's graveyard, exiled instead; then it's Urabrask again", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const opp = next(s, ap);
    const theirs = toZone(s, opp, shock, "graveyard");
    const u = putOnBattlefield(s, ap, urabrask);
    s.objects[u]!.face = 1;
    s.objects[u]!.counters.lore = 2;
    // Not yet.
    expect(graveyardWays(s, s.objects[theirs]!, ap)).toEqual([]);
    s = passUntil(s, "main1", next(s, next(s, next(s, ap))));
    s = passUntil(s, "main1", ap);
    const zc = s.objects[u]!.zoneChanges ?? 0;
    s = settle(s);
    // Exiled and back, front face up: a new object (CR 400.7).
    expect(s.objects[u]!.zoneChanges).toBe(zc + 2);
    expect(characteristics(s, s.objects[u]!).name).toBe("Urabrask");
    expect(s.objects[u]!.face ?? 0).toBe(0);
    // The opponent's Test Shock, cast by us.
    expect(graveyardWays(s, s.objects[theirs]!, ap).map((g) => g.kind)).toEqual(["permission"]);
    expect(graveyardWays(s, s.objects[theirs]!, opp)).toEqual([]);
    const life = s.players[opp]!.life;
    s = run(s, planCast(s, ap, theirs, [{ kind: "player", id: opp }], undefined, "auto", undefined, { via: "permission" }));
    expect(s.stack.at(-1)?.controller).toBe(ap);
    s = answer(s, ap, opp);
    // 2 from the Shock, 1 from Urabrask's cast trigger.
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.objects[theirs]!.zone).toBe("exile");
  });
});

describe("Monster Manual // Zoological Study", () => {
  it("Zoological Study mills five and returns a creature card milled this way; then the Manual is cast from exile", () => {
    supported(manual);
    const { s: s0, ap, ids } = setup([manual]);
    let s = s0;
    const lib = s.players[ap]!.library;
    // The top five: four lands and a creature.
    const beast = card("Milled Beast", "Creature — Beast", "{2}{G}", { power: "3", toughness: "3" });
    const b = toZone(s, ap, beast, "library");
    const land = card("Forest", "Basic Land — Forest");
    for (let i = 0; i < 4; i++) toZone(s, ap, land, "library");
    expect(lib.indexOf(b)).toBe(4);
    s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { face: 1 })));
    // Not optional: the one creature card milled is the only choice.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", cards: [b], min: 1, max: 1, fromGraveyard: "hand" });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [b] }));
    expect(s.objects[b]!.zone).toBe("hand");
    expect(s.players[ap]!.graveyard.length).toBe(4);
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    const m = ids[0]!;
    expect(s.objects[m]!.zone).toBe("battlefield");
    // {1}{G}, {T}: put the Beast onto the battlefield.
    s = settle(run(s, planActivate(s, ap, m, 0)));
    if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    if (s.pending?.kind === "searchLibrary") s = settle(act(s, { type: "searchLibrary", player: ap, found: [b] }));
    expect(s.objects[b]!.zone).toBe("battlefield");
  });
});

describe("Commandeer, Aethersnatch", () => {
  it("Commandeer takes an opponent's artifact spell: it enters under your control", () => {
    supported(commandeer, aethersnatch);
    const { s: s0, ap, ids } = setup([relic]);
    let s = s0;
    const opp = next(s, ap);
    const c = toZone(s, opp, commandeer, "hand");
    for (let i = 0; i < 7; i++) putOnBattlefield(s, opp, islandCard);
    s = run(s, planCast(s, ap, ids[0]!));
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    const spell = s.stack.at(-1)!;
    s = run(s, planCast(s, opp, c, [{ kind: "stack", id: spell.id }]));
    s = settle(s);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(characteristics(s, s.objects[ids[0]!]!).controller ?? s.objects[ids[0]!]!.controller).toBe(opp);
  });

  it("paid by exiling two blue cards; an instant taken over gets new targets and goes to its owner's graveyard", () => {
    const { s: s0, ap, ids } = setup([shock]);
    let s = s0;
    const opp = next(s, ap);
    const c = toZone(s, opp, commandeer, "hand");
    const [b1, b2] = [toZone(s, opp, blueA, "hand"), toZone(s, opp, blueA, "hand")];
    const mine = putOnBattlefield(s, ap, card("My Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    const theirs = putOnBattlefield(s, opp, card("Their Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    s = run(s, planCast(s, ap, ids[0]!, [target(theirs)]));
    s = act(s, { type: "passPriority", player: ap });
    const spell = s.stack.at(-1)!;
    const plan = planCast(s, opp, c, [{ kind: "stack", id: spell.id }], undefined, "auto", undefined, { alt: "alternative", exileFromHand: [b1, b2] });
    expect(plan).not.toBeNull();
    s = run(s, plan);
    expect(s.objects[b1]!.zone).toBe("exile");
    expect(s.objects[b2]!.zone).toBe("exile");
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "newTargets", player: opp });
    s = act(s, { type: "newTargets", player: opp, targets: [target(mine)] });
    expect(s.stack.at(-1)!.controller).toBe(opp);
    s = settle(s);
    expect(s.objects[mine]!.zone).toBe("graveyard");
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(s.players[ap]!.graveyard).toContain(ids[0]);
  });
});

describe("Jill, Shiva's Dominant", () => {
  it("{3}{U}{U}, {T}: exile and return transformed; at chapter III it taps opponents' lands and comes back as Jill", () => {
    supported(jill);
    const { s: s0, ap } = setup([]);
    let s = s0;
    const j = putOnBattlefield(s, ap, jill);
    s = settle(run(s, planActivate(s, ap, j, 0)));
    // Chapter I targets a creature: Shiva itself.
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(j)] }));
    expect(characteristics(s, s.objects[j]!).name).toBe("Shiva, Warden of Ice");
    expect(s.objects[j]!.counters.lore).toBe(1);
    s.objects[j]!.counters.lore = 2;
    const opp = next(s, ap);
    const oppLand = putOnBattlefield(s, opp, islandCard);
    s = passUntil(s, "main1", next(s, next(s, next(s, ap))));
    s = passUntil(s, "draw", ap);
    s = passUntil(s, "main1", ap);
    s = settle(s);
    expect(s.objects[oppLand]!.tapped).toBe(true);
    expect(characteristics(s, s.objects[j]!).name).toBe("Jill, Shiva's Dominant");
  });
});

void target;
