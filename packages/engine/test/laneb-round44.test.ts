// Lane B, round 44: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, scry, setup } from "./helpers";
import { botActions, compileCard, controllerOf, invalidateCharacteristics, isFullySupported, manaValue, moveObject, planActivate, planCast, power, spellCost, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty, answering choices as the bots would; the choices a test makes stop it. */
const settle = (s: GameState, stopAt: (s: GameState) => boolean = () => false) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (stopAt(s)) break;
    const p = s.pending;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Plays on (no attacks or blocks unless asked, the bots answering other questions) until `stop`. */
const goUntil = (s: GameState, stop: (s: GameState) => boolean) => {
  for (let i = 0; i < 3000; i++) {
    if (stop(s)) return s;
    const p = s.pending;
    const pid = waitingOn(s)!;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never got there");
};
const at = (kind: string, pid: PlayerId) => (s: GameState) => s.pending?.kind === kind && s.pending.player === pid;
const find = (s: GameState, pid: PlayerId, found: string[]) => act(s, { type: "searchLibrary", player: pid, found });
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}) => run(s, planCast(s, pid, id, targets, undefined, undefined, undefined, choices));
/** Moves a new card for `def` into `pid`'s hand, library (on top) or graveyard. */
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Passes to the declare attackers step of the active player's turn and declares `attackers` at `defender`; stops at the first question. */
const attackWith = (s: GameState, attackers: string[], defender: PlayerId) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  s = act(s, { type: "declareAttackers", player: s.activePlayer, attacks: attackers.map((attacker) => ({ attacker, defender })) });
  for (let i = 0; i < 50 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Leaves only `keep` in `pid`'s hand (setup's hand also holds the seven cards drawn). */
const onlyHand = (s: GameState, pid: PlayerId, keep: string[]) => {
  const p = s.players[pid]!;
  for (const id of p.hand.filter((id) => !keep.includes(id))) {
    s.objects[id]!.zone = "exile";
    p.exile.push(id);
  }
  p.hand = p.hand.filter((id) => keep.includes(id));
};
const counters = (s: GameState, id: string, kind = "+1/+1") => s.objects[id]!.counters?.[kind] ?? 0;
/** The total mana `pid` would pay for the card `id` now, with these targets. */
const costNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = []) => {
  const c = spellCost(s, pid, s.objects[id]!, 0, [], { targets });
  return manaValue(c.cost) + c.extra;
};

const tapLands = (s: GameState, pid: PlayerId, keep: string[] = []) => {
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid && !keep.includes(id) && s.cards[s.objects[id]!.cardId]!.typeLine.includes("Land")) s.objects[id]!.tapped = true;
};

// Real oracle text (Scryfall).
const harnessInfinity = () => card("Harness Infinity", "Instant", "{1}{B}{B}{B}{G}{G}{G}", { cmc: 7, colors: ["B","G"], oracleText: "Exchange your hand and graveyard.\nExile Harness Infinity." });
const lethalSting = () => card("Lethal Sting", "Sorcery", "{2}{B}", { cmc: 3, colors: ["B"], oracleText: "As an additional cost to cast this spell, put a -1/-1 counter on a creature you control.\nDestroy target creature." });
const fearOfAbduction = () => card("Fear of Abduction", "Enchantment Creature — Nightmare", "{4}{W}{W}", { cmc: 6, colors: ["W"], power: "5", toughness: "5", keywords: ["Flying"], oracleText: "As an additional cost to cast this spell, exile a creature you control.\nFlying\nWhen this creature enters, exile target creature an opponent controls.\nWhen this creature leaves the battlefield, put each card exiled with it into its owner's hand." });
const safeHaven = () => card("Safe Haven", "Land", "", { cmc: 0, oracleText: "{2}, {T}: Exile target creature you control.\nAt the beginning of your upkeep, you may sacrifice this land. If you do, return each card exiled with this land to the battlefield under its owner's control." });
const dreadlightMonstrosity = () => card("Dreadlight Monstrosity", "Creature — Crab Horror", "{4}{U}{U}", { cmc: 6, colors: ["U"], power: "5", toughness: "5", keywords: ["Ward"], oracleText: "Ward {2} (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {2}.)\n{3}{U}{U}: This creature can't be blocked this turn. Activate only if you own a card in exile." });
const throneOfMakindi = () => card("Throne of Makindi", "Land", "", { cmc: 0, oracleText: "{T}: Add {C}.\n{1}, {T}: Put a charge counter on this land.\n{T}, Remove a charge counter from this land: Add two mana of any one color. Spend this mana only to cast kicked spells." });
const unblinkingObserver = () => card("Unblinking Observer", "Creature — Homunculus", "{1}{U}", { cmc: 2, colors: ["U"], power: "2", toughness: "1", oracleText: "{T}: Add {U}. Spend this mana only to pay a disturb cost or cast an instant or sorcery spell." });
const burstLightning = () => card("Burst Lightning", "Instant", "{R}", { cmc: 1, colors: ["R"], keywords: ["Kicker"], oracleText: "Kicker {4} (You may pay an additional {4} as you cast this spell.)\nBurst Lightning deals 2 damage to any target. If this spell was kicked, it deals 4 damage instead." });
const baithookAngler = () => scry("transform", [{ name: "Baithook Angler", mana_cost: "{1}{U}", type_line: "Creature — Human Peasant", oracle_text: "Disturb {1}{U} (You may cast this card from your graveyard transformed for its disturb cost.)", power: "2", toughness: "1" }, { name: "Hook-Haunt Drifter", type_line: "Creature — Spirit", oracle_text: "Flying\nIf Hook-Haunt Drifter would be put into a graveyard from anywhere, exile it instead.", power: "1", toughness: "2", color_indicator: ["U"] }], { keywords: ["Flying", "Transform", "Disturb"] });

// Test cards.
const vanilla = (name: string, typeLine: string, cost: string, cmc: number, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, cost, { cmc, power: String(p), toughness: String(t), ...extra });
const bolt = () => card("Test Bolt", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Test Bolt deals 3 damage to any target." });
const opt = () => card("Test Opt", "Instant", "{U}", { cmc: 1, colors: ["U"], oracleText: "Draw a card." });
const murder = () => card("Test Murder", "Instant", "{1}{B}{B}", { cmc: 3, colors: ["B"], oracleText: "Destroy target creature." });
const swampCard = () => card("Swamp", "Basic Land — Swamp", "", { cmc: 0 });
const forestCard = () => card("Forest", "Basic Land — Forest", "", { cmc: 0 });

describe("Lane B round 44 cards", () => {
  it("are fully supported", () => {
    supported(harnessInfinity(), lethalSting(), fearOfAbduction(), safeHaven(), dreadlightMonstrosity(), throneOfMakindi(), unblinkingObserver());
  });
});

describe("Harness Infinity", () => {
  it("exchanges your hand and graveyard, then exiles itself", () => {
    const { s: s0, ap, ids } = setup([harnessInfinity(), opt(), bolt()]);
    onlyHand(s0, ap, ids);
    putOnBattlefield(s0, ap, swampCard());
    const dead = toZone(s0, ap, vanilla("Dead Bear", "Creature — Bear", "{1}{G}", 2, 2, 2), "graveyard");
    const s = settle(castNow(s0, ap, ids[0]!));
    expect([zone(s, ids[1]!), zone(s, ids[2]!), zone(s, dead), zone(s, ids[0]!)]).toEqual(["graveyard", "graveyard", "hand", "exile"]);
    expect(s.players[ap]!.hand).toEqual([dead]);
  });
});

describe("Lethal Sting", () => {
  it("puts a -1/-1 counter on a creature you control as it's cast and destroys the target", () => {
    const { s: s0, ap, ids, opp } = setup([lethalSting()]);
    const mine = putOnBattlefield(s0, ap, vanilla("My Beast", "Creature — Beast", "{2}{G}", 3, 3, 3));
    const theirs = putOnBattlefield(s0, opp, vanilla("Their Beast", "Creature — Beast", "{2}{G}", 3, 3, 3));
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(theirs)], { counterOn: [mine] }));
    expect([zone(s, theirs), counters(s, mine, "-1/-1"), pt(s, mine)]).toEqual(["graveyard", 1, "2/2"]);
  });
  it("can't be cast without a creature you control", () => {
    const { s, ap, ids, opp } = setup([lethalSting()]);
    const theirs = putOnBattlefield(s, opp, vanilla("Their Beast", "Creature — Beast", "{2}{G}", 3, 3, 3));
    expect(planCast(s, ap, ids[0]!, [tgt(theirs)])).toBeNull();
  });
});

describe("Fear of Abduction", () => {
  it("returns both the creature exiled for its cost and the one its enters ability exiled to their owners' hands when it leaves", () => {
    const { s: s0, ap, ids, opp } = setup([fearOfAbduction(), murder()]);
    const mine = putOnBattlefield(s0, ap, vanilla("My Beast", "Creature — Beast", "{2}{G}", 3, 3, 3));
    const theirs = putOnBattlefield(s0, opp, vanilla("Their Beast", "Creature — Beast", "{2}{G}", 3, 3, 3));
    let s = castNow(s0, ap, ids[0]!, [], { sacrifice: [mine] });
    expect(zone(s, mine)).toBe("exile");
    s = settle(s, (x) => x.pending?.kind === "chooseTargets");
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(theirs)] });
    s = settle(s);
    expect([zone(s, ids[0]!), zone(s, theirs)]).toEqual(["battlefield", "exile"]);
    s = settle(castNow(s, ap, ids[1]!, [tgt(ids[0]!)]));
    expect([zone(s, ids[0]!), zone(s, mine), zone(s, theirs)]).toEqual(["graveyard", "hand", "hand"]);
    expect([s.players[ap]!.hand.includes(mine), s.players[opp]!.hand.includes(theirs)]).toEqual([true, true]);
  });
});

describe("Safe Haven", () => {
  it("exiles a creature you control and returns it under its owner's control when sacrificed in your upkeep", () => {
    const { s: s0, ap, opp } = setup([]);
    const haven = putOnBattlefield(s0, ap, safeHaven());
    const mine = putOnBattlefield(s0, ap, vanilla("My Beast", "Creature — Beast", "{2}{G}", 3, 3, 3));
    const borrowed = putOnBattlefield(s0, opp, vanilla("Borrowed Beast", "Creature — Beast", "{2}{G}", 3, 3, 3));
    s0.objects[borrowed]!.controller = ap;
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planActivate(s0, ap, haven, 0, [tgt(mine)])));
    s.objects[haven]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, haven, 0, [tgt(borrowed)])));
    expect([zone(s, mine), zone(s, borrowed)]).toEqual(["exile", "exile"]);
    s = goUntil(s, (x) => at("chooseMay", ap)(x) && x.activePlayer === ap && x.step === "upkeep");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect([zone(s, haven), zone(s, mine), zone(s, borrowed)]).toEqual(["graveyard", "battlefield", "battlefield"]);
    expect([controllerOf(s, s.objects[mine]!), controllerOf(s, s.objects[borrowed]!)]).toEqual([ap, opp]);
  });
});

describe("Dreadlight Monstrosity", () => {
  it("can be made unblockable only while you own a card in exile, face down or not", () => {
    const { s, ap } = setup([]);
    const crab = putOnBattlefield(s, ap, dreadlightMonstrosity());
    expect(planActivate(s, ap, crab, 0)).toBeNull();
    const gone = toZone(s, ap, opt(), "hand");
    moveObject(s, gone, "exile");
    s.objects[gone]!.hiddenExile = { by: crab, seen: [ap] };
    expect(planActivate(s, ap, crab, 0)).not.toBeNull();
  });
  it("doesn't count a card another player owns in exile", () => {
    const { s, ap, opp } = setup([]);
    const crab = putOnBattlefield(s, ap, dreadlightMonstrosity());
    moveObject(s, toZone(s, opp, opt(), "hand"), "exile");
    expect(planActivate(s, ap, crab, 0)).toBeNull();
  });
});

describe("Throne of Makindi", () => {
  it("its two mana pays only for a kicked spell", () => {
    const { s, ap, ids } = setup([burstLightning(), vanilla("Big Red", "Creature — Giant", "{3}{R}{R}", 5, 5, 5)]);
    const throne = putOnBattlefield(s, ap, throneOfMakindi());
    s.objects[throne]!.counters.charge = 1;
    const mountains = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Mountain");
    tapLands(s, ap, [...mountains, throne]);
    expect(planCast(s, ap, ids[1]!)).toBeNull();
    const kicked = planCast(s, ap, ids[0]!, [ply(s.turnOrder.find((p) => p !== ap)!)], undefined, undefined, undefined, { kicks: [0] });
    expect(kicked).not.toBeNull();
    const after = settle(run(s, kicked));
    expect(counters(after, throne, "charge")).toBe(0);
  });
});

describe("Unblinking Observer", () => {
  it("its mana pays for an instant or a disturb cost, not a creature spell from your hand", () => {
    const { s, ap, ids } = setup([opt(), vanilla("Blue Bear", "Creature — Bear", "{U}", 1, 1, 1), baithookAngler()]);
    putOnBattlefield(s, ap, unblinkingObserver());
    putOnBattlefield(s, ap, unblinkingObserver());
    tapLands(s, ap);
    moveObject(s, ids[2]!, "graveyard");
    expect(planCast(s, ap, ids[1]!)).toBeNull();
    expect(planCast(s, ap, ids[0]!)).not.toBeNull();
    const disturb = planCast(s, ap, ids[2]!, undefined, undefined, "auto", undefined, { face: 1, via: "disturb" });
    expect(disturb).not.toBeNull();
    const after = settle(run(s, disturb));
    expect(zone(after, ids[2]!)).toBe("battlefield");
  });
});
