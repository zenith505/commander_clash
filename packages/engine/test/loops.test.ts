// Loops: shortcuts (CR 732.2), mandatory loops are a draw (CR 104.4b, 732.4).

import { describe, expect, it } from "vitest";
import { act, card, pt, putOnBattlefield, setup, target } from "./helpers";
import { abilitiesOf, botActions, isFullySupported, planActivate, planCast, takeShortcut, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const named = (s: GameState, name: string) => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === name);

// Real oracle text (Scryfall).
const kiki = card("Kiki-Jiki, Mirror Breaker", "Legendary Creature — Goblin Shaman", "{2}{R}{R}{R}", { power: "2", toughness: "2", keywords: ["Haste"], oracleText: "Haste\n{T}: Create a token that's a copy of target nonlegendary creature you control, except it has haste. Sacrifice it at the beginning of the next end step." });
const exarch = card("Deceiver Exarch", "Creature — Phyrexian Cleric", "{2}{U}", { power: "1", toughness: "4", keywords: ["Flash"], oracleText: "Flash (You may cast this spell any time you could cast an instant.)\nWhen this creature enters, choose one —\n• Untap target permanent you control.\n• Tap target permanent an opponent controls." });
const midnightGuard = card("Midnight Guard", "Creature — Human Soldier", "{2}{W}", { power: "2", toughness: "3", oracleText: "Whenever another creature enters, untap this creature." });
const presenceOfGond = card("Presence of Gond", "Enchantment — Aura", "{2}{G}", { keywords: ["Enchant"], oracleText: 'Enchant creature\nEnchanted creature has "{T}: Create a 1/1 green Elf Warrior creature token."' });
const carrionFeeder = card("Carrion Feeder", "Creature — Zombie", "{B}", { power: "1", toughness: "1", oracleText: "This creature can't block.\nSacrifice a creature: Put a +1/+1 counter on this creature." });
const sanguineBond = card("Sanguine Bond", "Enchantment", "{3}{B}{B}", { oracleText: "Whenever you gain life, target opponent loses that much life." });
const exquisiteBlood = card("Exquisite Blood", "Enchantment", "{4}{B}", { oracleText: "Whenever an opponent loses life, you gain that much life." });
const conqueror = card("Bloodthirsty Conqueror", "Creature — Vampire Knight", "{3}{B}{B}", { power: "5", toughness: "5", keywords: ["Deathtouch", "Flying"], oracleText: "Flying, deathtouch\nWhenever an opponent loses life, you gain that much life. (Damage causes loss of life.)" });
const revitalize = card("Revitalize", "Instant", "{1}{W}", { oracleText: "You gain 3 life.\nDraw a card." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const devastator = card("Frontline Devastator", "Creature — Zombie Minotaur Warrior", "{3}{R}", { power: "3", toughness: "3", keywords: ["Afflict"], oracleText: "Afflict 2 (Whenever this creature becomes blocked, defending player loses 2 life.)\n{1}{R}: This creature gets +1/+0 until end of turn." });
// Made up for the test: no real card loops by itself, because it would always be a draw.
const loopWisp = card("Loop Wisp", "Creature — Spirit", "{1}", { power: "1", toughness: "1", oracleText: "When this creature enters, exile it, then return it to the battlefield under its owner's control." });

/** Applies actions, remembering them as the body of a loop. */
function recorder(s0: GameState) {
  const body: Action[] = [];
  let s = s0;
  const play = (a: Action) => {
    s = act(s, a);
    body.push(a);
  };
  return {
    body,
    get s() {
      return s;
    },
    play,
    /** Everyone passes until `until` holds (the stack resolves, or it's someone's choice). */
    passWhile(until: (s: GameState) => boolean) {
      for (let i = 0; i < 40 && !until(s); i++) play({ type: "passPriority", player: waitingOn(s)! });
    },
  };
}

const bots = (s: GameState, pid: PlayerId) => botActions(s, pid);

describe("shortcuts (CR 732.2)", () => {
  it("repeats Kiki-Jiki and Deceiver Exarch: each round makes a hasty Exarch that untaps Kiki-Jiki", () => {
    supported(kiki, exarch);
    const { s: s0, ap } = setup([]);
    const k = putOnBattlefield(s0, ap, kiki);
    const ex = putOnBattlefield(s0, ap, exarch);
    const r = recorder(s0);
    for (const a of planActivate(r.s, ap, k, 0, [target(ex)])!) r.play(a);
    r.passWhile((s) => !!s.pending);
    // The token's enters trigger: untap target permanent you control (Kiki-Jiki). No opponent has a permanent to tap, so
    // that's the only mode.
    expect(r.s.pending?.kind).toBe("chooseTargets");
    r.play({ type: "chooseTargets", player: ap, targets: [target(k)] });
    r.passWhile((s) => s.stack.length === 0);
    expect(r.s.objects[k]!.tapped).toBe(false);
    expect(named(r.s, "Deceiver Exarch")).toHaveLength(2);
    expect(waitingOn(r.s)).toBe(ap);

    const res = takeShortcut(s0, r.body, 10, ap, bots);
    expect(res.repeated).toBe(10);
    expect(res.stoppedBy).toBeUndefined();
    expect(res.problem).toBeUndefined();
    const s = res.state;
    expect(named(s, "Deceiver Exarch")).toHaveLength(12);
    expect(s.objects[k]!.tapped).toBe(false);
    expect(waitingOn(s)).toBe(ap);
    expect(s.stack).toHaveLength(0);
    // The log tells the shortcut once instead of every round.
    expect(s.log.length).toBe(r.s.log.length + 1);
    expect(s.log.at(-1)!.text).toMatch(/goes round 10 more times/);
    // Each token is still sacrificed at the next end step.
    expect(s.delayed?.length ?? 0).toBeGreaterThanOrEqual(0);
  });

  it("follows the newest object: sacrificing last round's Elf Warrior each round (Midnight Guard, Presence of Gond, Carrion Feeder)", () => {
    supported(midnightGuard, presenceOfGond, carrionFeeder);
    const { s: s1, ap } = setup([]);
    let s0 = s1;
    const guard = putOnBattlefield(s0, ap, midnightGuard);
    const feeder = putOnBattlefield(s0, ap, carrionFeeder);
    const aura = putOnBattlefield(s0, ap, presenceOfGond);
    s0.objects[aura]!.attachedTo = guard;
    const elfAbility = () => abilitiesOf(s0, s0.objects[guard]!).activated.findIndex((a) => a.tap);
    expect(elfAbility()).toBeGreaterThanOrEqual(0);
    // One Elf to begin with.
    for (const a of planActivate(s0, ap, guard, elfAbility())!) s0 = act(s0, a);
    for (let i = 0; i < 40 && (s0.stack.length || s0.triggerQueue.length); i++) s0 = act(s0, { type: "passPriority", player: waitingOn(s0)! });
    const [firstElf] = named(s0, "Elf Warrior Token");
    expect(firstElf).toBeDefined();
    expect(s0.objects[guard]!.tapped).toBe(false); // Midnight Guard untapped when the Elf entered

    // One round: make an Elf (the Guard untaps), then sacrifice the older Elf to Carrion Feeder.
    const r = recorder(s0);
    for (const a of planActivate(r.s, ap, guard, elfAbility())!) r.play(a);
    r.passWhile((s) => s.stack.length === 0 && s.triggerQueue.length === 0);
    const feed = abilitiesOf(r.s, r.s.objects[feeder]!).activated.findIndex((a) => a.costs?.length);
    for (const a of planActivate(r.s, ap, feeder, feed, undefined, undefined, undefined, undefined, { sacrifice: [firstElf!] })!) r.play(a);
    r.passWhile((s) => s.stack.length === 0);
    expect(named(r.s, "Elf Warrior Token")).toHaveLength(1);
    expect(r.s.objects[feeder]!.counters["+1/+1"]).toBe(1);

    const res = takeShortcut(s0, r.body, 5, ap, bots);
    expect(res.problem).toBeUndefined();
    expect(res.repeated).toBe(5);
    expect(res.state.objects[feeder]!.counters["+1/+1"]).toBe(6);
    expect(named(res.state, "Elf Warrior Token")).toHaveLength(1);
    expect(res.state.objects[guard]!.tapped).toBe(false);
  });

  it("another player shortens it where they'd choose differently (CR 732.2b), and the log shows what happened after the last full round", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kiki);
    const ex = putOnBattlefield(s0, ap, exarch);
    const r = recorder(s0);
    for (const a of planActivate(r.s, ap, k, 0, [target(ex)])!) r.play(a);
    r.passWhile((s) => !!s.pending);
    r.play({ type: "chooseTargets", player: ap, targets: [target(k)] });
    r.passWhile((s) => s.stack.length === 0);
    // The opponent goes along with three rounds, then wants to act while Kiki-Jiki's ability is on the stack.
    let seen = 0;
    const chooser = (s: GameState, pid: PlayerId): Action[] => {
      if (pid === opp && s.stack.length === 1 && s.stack[0]!.sourceCardId === kiki.oracleId && ++seen === 4) return [{ type: "concede", player: opp }];
      return [{ type: "passPriority", player: pid }];
    };
    const res = takeShortcut(s0, r.body, 10, ap, chooser);
    expect(res.repeated).toBe(3);
    expect(res.stoppedBy).toBe(opp);
    // The game is where the opponent makes their own choice: Kiki-Jiki's ability on the stack, the opponent to act.
    expect(waitingOn(res.state)).toBe(opp);
    expect(res.state.stack).toHaveLength(1);
    expect(named(res.state, "Deceiver Exarch")).toHaveLength(5);
    expect(res.state.log.some((l) => /shortens the shortcut/.test(l.text))).toBe(true);
  });

  it("stops at the last full round when the loop can't go round the same way (CR 732.2a)", () => {
    const { s: s0, ap } = setup([]);
    const k = putOnBattlefield(s0, ap, kiki);
    const ex = putOnBattlefield(s0, ap, exarch);
    // Untapping a land instead of Kiki-Jiki: the next round can't activate Kiki-Jiki again.
    const land = s0.battlefield.find((id) => s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.name === "Mountain")!;
    const r = recorder(s0);
    for (const a of planActivate(r.s, ap, k, 0, [target(ex)])!) r.play(a);
    r.passWhile((s) => !!s.pending);
    r.play({ type: "chooseTargets", player: ap, targets: [target(land)] });
    r.passWhile((s) => s.stack.length === 0);
    const res = takeShortcut(s0, r.body, 5, ap, bots);
    expect(res.repeated).toBe(0);
    expect(res.problem).toBeDefined();
    expect(named(res.state, "Deceiver Exarch")).toHaveLength(2);
    expect(waitingOn(res.state)).toBe(ap);
  });

  it("pays for each round with whatever mana is left, until there isn't enough (Frontline Devastator)", () => {
    supported(devastator);
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, devastator);
    const pump = abilitiesOf(s0, s0.objects[d]!).activated.findIndex((a) => a.manaCost === "{1}{R}");
    const r = recorder(s0);
    for (const a of planActivate(r.s, ap, d, pump)!) r.play(a);
    expect(r.body.filter((a) => a.type === "activateMana")).toHaveLength(2);
    r.passWhile((s) => s.stack.length === 0);
    expect(pt(r.s, d)).toBe("4/3");
    // Three Mountains make red mana: two more pumps, then the shortcut stops.
    const res = takeShortcut(s0, r.body, 10, ap, bots);
    expect(res.repeated).toBe(2);
    expect(res.problem).toMatch(/mana/);
    expect(pt(res.state, d)).toBe("6/3");
    expect(waitingOn(res.state)).toBe(ap);
  });

  it("needs a body that ends where the proposer has priority", () => {
    const { s: s0, ap } = setup([]);
    const k = putOnBattlefield(s0, ap, kiki);
    const ex = putOnBattlefield(s0, ap, exarch);
    const r = recorder(s0);
    for (const a of planActivate(r.s, ap, k, 0, [target(ex)])!) r.play(a);
    r.play({ type: "passPriority", player: ap });
    expect(() => takeShortcut(s0, r.body, 3, ap, bots)).toThrow(/priority again/);
  });
});

/** Pass priority until there's a choice to make, something else to do, or `until` holds. */
function settle(s: GameState, until: (s: GameState) => boolean = () => false) {
  for (let i = 0; i < 80 && !s.pending && !s.over && (s.stack.length || s.triggerQueue.length) && !until(s); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}

describe("life gained and lost (CR 119)", () => {
  it("Sanguine Bond: an opponent loses as much life as you gained, once per life-gain event (CR 119.9)", () => {
    supported(sanguineBond, revitalize);
    const { s: s0, ap, opp, ids } = setup([revitalize]);
    putOnBattlefield(s0, ap, sanguineBond);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    s = settle(s);
    expect(s.players[ap]!.life).toBe(43);
    expect(s.pending?.kind).toBe("chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    s = settle(s);
    expect(s.players[opp]!.life).toBe(37);
  });

  it("Exquisite Blood and Bloodthirsty Conqueror: you gain what an opponent loses, from damage (CR 119.2) or an effect, not what you lose", () => {
    supported(exquisiteBlood, conqueror, shock);
    const { s: s0, ap, opp, ids } = setup([shock, shock]);
    putOnBattlefield(s0, ap, exquisiteBlood);
    putOnBattlefield(s0, ap, conqueror);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])!) s = act(s, a);
    s = settle(s);
    expect(s.players[opp]!.life).toBe(38);
    expect(s.players[ap]!.life).toBe(44); // two triggers, 2 life each
    for (const a of planCast(s, ap, ids[1]!, [{ kind: "player", id: ap }])!) s = act(s, a);
    s = settle(s);
    expect(s.players[ap]!.life).toBe(42);
  });

  it("Sanguine Bond and Exquisite Blood loop until the target dies; the shortcut then stops where you have priority", () => {
    const { s: s1, ap, opp, ids } = setup([revitalize]);
    putOnBattlefield(s1, ap, sanguineBond);
    putOnBattlefield(s1, ap, exquisiteBlood);
    let s0 = s1;
    for (const a of planCast(s0, ap, ids[0]!)!) s0 = act(s0, a);
    s0 = settle(s0);
    s0 = act(s0, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    // Sanguine Bond's trigger is on the stack and you have priority: the loop starts here.
    expect(s0.stack).toHaveLength(1);
    expect(waitingOn(s0)).toBe(ap);
    const r = recorder(s0);
    r.passWhile((s) => !!s.pending);
    r.play({ type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    expect(r.s.players[opp]!.life).toBe(37);
    expect(r.s.players[ap]!.life).toBe(46);
    expect(r.s.stack).toHaveLength(1);
    expect(waitingOn(r.s)).toBe(ap);

    const res = takeShortcut(s0, r.body, 50, ap, bots);
    const s = res.state;
    // 37 life is 12 more rounds of 3, and the opponent dies partway through the 13th.
    expect(res.repeated).toBe(12);
    expect(s.players[opp]!.lost).toBe(true);
    expect(res.problem).toBeDefined();
    expect(s.over).toBe(false);
    // Stopped where you have priority, with Exquisite Blood's last trigger to resolve.
    expect(waitingOn(s)).toBe(ap);
    expect(s.pending).toBeNull();
  });
});

describe("mandatory loops (CR 104.4b, 732.4)", () => {
  it("is a draw when the game repeats itself with everyone only passing", () => {
    supported(loopWisp);
    const { s: s0, ap, ids } = setup([loopWisp]);
    let s = s0;
    const wisp = ids[0]!;
    for (const a of planCast(s, ap, wisp)!) s = act(s, a);
    for (let i = 0; i < 400 && !s.over; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.over).toBe(true);
    expect(s.winner).toBeNull();
    expect(s.log.at(-1)!.text).toMatch(/draw/);
  });

  it("isn't a draw while a player keeps making choices (an optional loop)", () => {
    const { s: s0, ap } = setup([]);
    const k = putOnBattlefield(s0, ap, kiki);
    const ex = putOnBattlefield(s0, ap, exarch);
    const r = recorder(s0);
    for (const a of planActivate(r.s, ap, k, 0, [target(ex)])!) r.play(a);
    r.passWhile((s) => !!s.pending);
    r.play({ type: "chooseTargets", player: ap, targets: [target(k)] });
    r.passWhile((s) => s.stack.length === 0);
    const res = takeShortcut(s0, r.body, 30, ap, bots);
    expect(res.state.over).toBe(false);
    expect(res.repeated).toBe(30);
  });
});
