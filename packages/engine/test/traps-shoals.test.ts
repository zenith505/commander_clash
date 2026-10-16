// The Traps whose alternative cost looks back over the turn (CR 118.9, 601.2b): what an opponent searched, had enter,
// gained, cast or put into their graveyard, what an opponent destroyed of yours, which creatures damaged you. Foil's
// "discard an Island card and another card", Land Grant's "reveal your hand", and the Shoals' "exile a red card with mana
// value X from your hand", where X is the spell's own X (CR 107.3a).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, island, mountain, passAll, putOnBattlefield, setup, swamp } from "./helpers";
import { castProblem, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const archive = card("Archive Trap", "Instant — Trap", "{3}{U}{U}", { oracleText: "If an opponent searched their library this turn, you may pay {0} rather than pay this spell's mana cost.\nTarget opponent mills thirteen cards." });
const baloth = card("Baloth Cage Trap", "Instant — Trap", "{3}{G}{G}", { oracleText: "If an opponent had an artifact enter the battlefield under their control this turn, you may pay {1}{G} rather than pay this spell's mana cost.\nCreate a 4/4 green Beast creature token." });
const cobra = card("Cobra Trap", "Instant — Trap", "{4}{G}{G}", { oracleText: "If a noncreature permanent under your control was destroyed this turn by a spell or ability an opponent controlled, you may pay {G} rather than pay this spell's mana cost.\nCreate four 1/1 green Snake creature tokens." });
const inferno = card("Inferno Trap", "Instant — Trap", "{3}{R}", { oracleText: "If you've been dealt damage by two or more creatures this turn, you may pay {R} rather than pay this spell's mana cost.\nInferno Trap deals 4 damage to target creature." });
const lavaball = card("Lavaball Trap", "Instant — Trap", "{6}{R}{R}", { oracleText: "If an opponent had two or more lands enter the battlefield under their control this turn, you may pay {3}{R}{R} rather than pay this spell's mana cost.\nDestroy two target lands. Lavaball Trap deals 4 damage to each creature." });
const needlebite = card("Needlebite Trap", "Instant — Trap", "{5}{B}{B}", { oracleText: "If an opponent gained life this turn, you may pay {B} rather than pay this spell's mana cost.\nTarget player loses 5 life and you gain 5 life." });
const permafrost = card("Permafrost Trap", "Instant — Trap", "{2}{U}{U}", { oracleText: "If an opponent had a green creature enter the battlefield under their control this turn, you may pay {U} rather than pay this spell's mana cost.\nTap up to two target creatures. Those creatures don't untap during their controller's next untap step." });
const ravenous = card("Ravenous Trap", "Instant — Trap", "{2}{B}{B}", { oracleText: "If an opponent had three or more cards put into their graveyard from anywhere this turn, you may pay {0} rather than pay this spell's mana cost.\nExile target player's graveyard." });
const ricochet = card("Ricochet Trap", "Instant — Trap", "{3}{R}", { oracleText: "If an opponent cast a blue spell this turn, you may pay {R} rather than pay this spell's mana cost.\nChange the target of target spell with a single target." });
const whiplash = card("Whiplash Trap", "Instant — Trap", "{3}{U}{U}", { oracleText: "If an opponent had two or more creatures enter the battlefield under their control this turn, you may pay {U} rather than pay this spell's mana cost.\nReturn two target creatures to their owners' hands." });
const foil = card("Foil", "Instant", "{2}{U}{U}", { oracleText: "You may discard an Island card and another card rather than pay this spell's mana cost.\nCounter target spell." });
const landGrant = card("Land Grant", "Sorcery", "{1}{G}", { oracleText: "If you have no land cards in hand, you may reveal your hand rather than pay this spell's mana cost.\nSearch your library for a Forest card, reveal that card, put it into your hand, then shuffle." });
const blazing = card("Blazing Shoal", "Instant — Arcane", "{X}{R}{R}", { oracleText: "You may exile a red card with mana value X from your hand rather than pay this spell's mana cost.\nTarget creature gets +X/+0 until end of turn." });
const disrupting = card("Disrupting Shoal", "Instant — Arcane", "{X}{U}{U}", { oracleText: "You may exile a blue card with mana value X from your hand rather than pay this spell's mana cost.\nCounter target spell if its mana value is X." });
const nourishing = card("Nourishing Shoal", "Instant — Arcane", "{X}{G}{G}", { oracleText: "You may exile a green card with mana value X from your hand rather than pay this spell's mana cost.\nYou gain X life." });
const sickening = card("Sickening Shoal", "Instant — Arcane", "{X}{B}{B}", { oracleText: "You may exile a black card with mana value X from your hand rather than pay this spell's mana cost.\nTarget creature gets -X/-X until end of turn." });

const rampant = card("Rampant Growth", "Sorcery", "{1}{G}", { oracleText: "Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle." });
const solRing = card("Sol Ring", "Artifact", "{1}", { oracleText: "{T}: Add {C}{C}." });
const shatter = card("Shatter", "Instant", "{1}{R}", { oracleText: "Destroy target artifact." });
const pyromancer = () => card("Prodigal Pyromancer", "Creature — Human Wizard", "{2}{R}", { power: "1", toughness: "1", oracleText: "{T}: This creature deals 1 damage to any target." });
const salve = card("Healing Salve", "Instant", "{W}", { oracleText: "Choose one —\n• Target player gains 3 life.\n• Prevent the next 3 damage that would be dealt to any target this turn." });
const scour = card("Thought Scour", "Instant", "{U}", { oracleText: "Target player mills two cards.\nDraw a card." });
const opt = card("Opt", "Instant", "{U}", { oracleText: "Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card." });
const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
const hammer = card("Hammer of Bogardan", "Sorcery", "{1}{R}{R}", { oracleText: "Hammer of Bogardan deals 3 damage to any target." });
const hillGiant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
const ornithopter = () => card("Ornithopter", "Artifact Creature — Thopter", "{0}", { power: "0", toughness: "2", keywords: ["Flying"], oracleText: "Flying" });
const islandCard = card("Island", "Basic Land — Island");

const alt = { alt: "alternative" as const };
const run = (s: GameState, plan: ReturnType<typeof planCast>) => plan!.reduce((x, a) => act(x, a), s);
const toHand = (s: GameState, pid: PlayerId, d: CardDef) => {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
const tapAll = (s: GameState, pid: PlayerId) => s.battlefield.forEach((id) => s.objects[id]!.controller === pid && (s.objects[id]!.tapped = true));
const giveLands = (s: GameState, pid: PlayerId, lands: CardDef[]) => lands.map((l) => putOnBattlefield(s, pid, l));
const untilPriority = (s: GameState, pid: PlayerId) => {
  while (waitingOn(s) !== pid) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const problem = (s: GameState, pid: PlayerId, id: string, targets?: TargetChoice[], more = {}) => castProblem(s, pid, id, targets, undefined, undefined, undefined, undefined, { ...alt, ...more });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const stackTop = (s: GameState): TargetChoice => ({ kind: "stack", id: s.stack.at(-1)!.id });
/** The opponent's own copy of a card, cast as a response during the active player's turn. */
const oppCasts = (s: GameState, opp: PlayerId, d: CardDef, targets?: TargetChoice[], modes?: number[]) => {
  const id = toHand(s, opp, d);
  giveLands(s, opp, [mountain, mountain, swamp, swamp, island]);
  s = untilPriority(s, opp);
  return passAll(run(s, planCast(s, opp, id, targets, modes)));
};

describe("Traps that look back over the turn", () => {
  it("is supported", () =>
    [archive, baloth, cobra, inferno, lavaball, needlebite, permafrost, ravenous, ricochet, whiplash, foil, landGrant, blazing, disrupting, nourishing, sickening].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Archive Trap: {0} once an opponent searched their library, found something or not; then Ravenous Trap for {0}", () => {
    const { s: s0, ap, ids, opp } = setup([rampant]);
    const trap = toHand(s0, opp, archive);
    const rav = toHand(s0, opp, ravenous);
    tapAll(s0, opp);
    expect(problem(s0, opp, trap, [player(ap)])).toMatch(/can't be paid now/);
    // Your own search doesn't count.
    s0.turnLog = { searched: [opp] };
    expect(problem(s0, opp, trap, [player(ap)])).toMatch(/can't be paid now/);
    s0.turnLog = undefined;
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!)));
    if (s.pending?.kind === "searchLibrary") s = passAll(act(s, { type: "searchLibrary", player: ap, found: [] }));
    expect(s.turnLog?.searched).toEqual([ap]);
    s = untilPriority(s, opp);
    expect(problem(s, opp, rav, [player(ap)])).toMatch(/can't be paid now/);
    const plan = planCast(s, opp, trap, [player(ap)], undefined, "auto", undefined, alt);
    expect(plan!.filter((a) => a.type === "activateMana")).toHaveLength(0);
    const library = s.players[ap]!.library.length;
    s = passAll(run(s, plan));
    expect(s.players[ap]!.library.length).toBe(library - 13);
    // Thirteen cards put into that opponent's graveyard: Ravenous Trap is free too.
    s = untilPriority(s, opp);
    s = passAll(run(s, planCast(s, opp, rav, [player(ap)], undefined, "auto", undefined, alt)));
    expect(s.players[ap]!.graveyard).toEqual([]);
  });

  it("Ravenous Trap: three cards, not tokens, into one opponent's graveyard", () => {
    const { s: s0, ap, ids, opp } = setup([scour, scour, ravenous, card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." })]);
    const token = putOnBattlefield(s0, opp, bear({ name: "Bear Token" }));
    s0.objects[token]!.isToken = true;
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!, [player(opp)])));
    expect(problem(s, ap, ids[2]!, [player(opp)])).toMatch(/can't be paid now/);
    s = passAll(run(s, planCast(s, ap, ids[3]!, [{ kind: "object", id: token }])));
    expect(problem(s, ap, ids[2]!, [player(opp)])).toMatch(/can't be paid now/); // two cards and a token
    s = passAll(run(s, planCast(s, ap, ids[1]!, [player(opp)])));
    expect(problem(s, ap, ids[2]!, [player(opp)])).toBeNull();
  });

  it("Baloth Cage Trap, Permafrost Trap, Whiplash Trap, Lavaball Trap: what entered under one opponent's control", () => {
    const { s: s0, ap, ids, opp } = setup([solRing, bear(), hillGiant, rampant, islandCard]);
    const [bal, perm, whip, lava] = [baloth, permafrost, whiplash, lavaball].map((d) => toHand(s0, opp, d));
    giveLands(s0, opp, [island, island, forest, forest, mountain, mountain, mountain]);
    const creatures: TargetChoice[] = [{ kind: "object", id: putOnBattlefield(s0, ap, bear()) }, { kind: "object", id: putOnBattlefield(s0, opp, bear()) }];
    const lands = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap).slice(-2).map((id): TargetChoice => ({ kind: "object", id }));
    // Just whether the alternative cost is allowed: it's not the opponent's priority.
    const check = (s: GameState) => [problem(s, opp, bal!), problem(s, opp, perm!, creatures), problem(s, opp, whip!, creatures), problem(s, opp, lava!, lands)].map((p) => !/can't be paid now/.test(p ?? ""));
    // The opponent's own permanents don't count.
    s0.turnLog = { entered: [{ controller: opp, types: ["Artifact"], colors: [] }] };
    expect(check(s0)).toEqual([false, false, false, false]);
    s0.turnLog = undefined;
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!))); // an artifact
    expect(check(s)).toEqual([true, false, false, false]);
    s = passAll(run(s, planCast(s, ap, ids[2]!))); // a red creature
    expect(check(s)).toEqual([true, false, false, false]);
    s = passAll(run(s, planCast(s, ap, ids[1]!))); // a green creature: two creatures now
    expect(check(s)).toEqual([true, true, true, false]);
    s = act(s, { type: "playLand", player: ap, objectId: ids[4]! });
    expect(check(s)).toEqual([true, true, true, false]);
    s = passAll(run(s, planCast(s, ap, ids[3]!)));
    if (s.pending?.kind === "searchLibrary") s = passAll(act(s, { type: "searchLibrary", player: ap, found: s.pending.cards.slice(0, 1) }));
    expect(check(s)).toEqual([true, true, true, true]);
  });

  it("Cobra Trap: a noncreature permanent of yours destroyed by an opponent's spell, not your own or a creature", () => {
    const { s: s0, ap, ids, opp } = setup([cobra, shatter]);
    const ring = putOnBattlefield(s0, ap, solRing);
    const ring2 = putOnBattlefield(s0, ap, solRing);
    // Destroying your own artifact doesn't count.
    let s = passAll(run(s0, planCast(s0, ap, ids[1]!, [{ kind: "object", id: ring2 }])));
    expect(s.objects[ring2]!.zone).toBe("graveyard");
    expect(problem(s, ap, ids[0]!)).toMatch(/can't be paid now/);
    // An opponent's creature kill on an artifact creature doesn't either.
    const thopter = putOnBattlefield(s, ap, ornithopter());
    s = oppCasts(s, opp, card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." }), [{ kind: "object", id: thopter }]);
    expect(s.objects[thopter]!.zone).toBe("graveyard");
    s = untilPriority(s, ap);
    expect(problem(s, ap, ids[0]!)).toMatch(/can't be paid now/);
    s = oppCasts(s, opp, shatter, [{ kind: "object", id: ring }]);
    expect(s.objects[ring]!.zone).toBe("graveyard");
    s = untilPriority(s, ap);
    tapAll(s, ap);
    putOnBattlefield(s, ap, card("Forest", "Basic Land — Forest"));
    const plan = planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, alt);
    expect(plan!.filter((a) => a.type === "activateMana")).toHaveLength(1);
    s = passAll(run(s, plan));
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap)).toHaveLength(4);
  });

  it("Cobra Trap: a permanent destroyed but exiled instead by a replacement still was destroyed (Fumigate, Bane of Progress rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([cobra]);
    const ring = putOnBattlefield(s0, ap, solRing);
    // "If it would leave the battlefield, exile it instead" (the unearth replacement): only where it goes changes.
    s0.objects[ring]!.exileIfLeaves = "battlefield";
    let s = oppCasts(s0, opp, shatter, [{ kind: "object", id: ring }]);
    expect(s.objects[ring]!.zone).toBe("exile");
    s = untilPriority(s, ap);
    tapAll(s, ap);
    putOnBattlefield(s, ap, card("Forest", "Basic Land — Forest"));
    s = passAll(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, alt)));
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap)).toHaveLength(4);
  });

  it("Inferno Trap: two different creatures, not one twice and not a spell", () => {
    const { s: s0, ap, ids, opp } = setup([inferno]);
    const [p1, p2] = [putOnBattlefield(s0, opp, pyromancer()), putOnBattlefield(s0, opp, pyromancer())];
    const victim: TargetChoice[] = [{ kind: "object", id: p1 }];
    let s = untilPriority(s0, opp);
    s = passAll(run(s, planActivate(s, opp, p1, 0, [player(ap)])));
    s = oppCasts(s, opp, bolt, [player(ap)]);
    s = untilPriority(s, ap);
    expect(problem(s, ap, ids[0]!, victim)).toMatch(/can't be paid now/);
    // The same creature again is still one creature.
    s.objects[p1]!.tapped = false;
    s = untilPriority(s, opp);
    s = passAll(run(s, planActivate(s, opp, p1, 0, [player(ap)])));
    s = untilPriority(s, ap);
    expect(problem(s, ap, ids[0]!, victim)).toMatch(/can't be paid now/);
    s = untilPriority(s, opp);
    s = passAll(run(s, planActivate(s, opp, p2, 0, [player(ap)])));
    s = untilPriority(s, ap);
    const plan = planCast(s, ap, ids[0]!, victim, undefined, "auto", undefined, alt);
    expect(plan!.filter((a) => a.type === "activateMana")).toHaveLength(1);
    s = passAll(run(s, plan));
    expect(s.objects[p1]!.zone).toBe("graveyard");
  });

  it("Needlebite Trap: an opponent gained life, even if they lost more", () => {
    const { s: s0, ap, ids, opp } = setup([salve, needlebite, salve, hammer]);
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!, [player(ap)], [0])));
    expect(problem(s, ap, ids[1]!, [player(opp)])).toMatch(/can't be paid now/); // your own life gain
    s = passAll(run(s, planCast(s, ap, ids[2]!, [player(opp)], [0])));
    s = passAll(run(s, planCast(s, ap, ids[3]!, [player(opp)])));
    tapAll(s, ap);
    putOnBattlefield(s, ap, card("Swamp", "Basic Land — Swamp"));
    const life = s.players[opp]!.life;
    s = passAll(run(s, planCast(s, ap, ids[1]!, [player(opp)], undefined, "auto", undefined, alt)));
    expect(s.players[opp]!.life).toBe(life - 5);
  });

  it("Ricochet Trap: an opponent's blue spell this turn, not a red one or your own", () => {
    const { s: s0, ap, ids, opp } = setup([card("Think Twice", "Instant", "{1}{U}", { oracleText: "Draw a card." }), ricochet, bolt]);
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!)));
    // Your own Bolt at the opponent stays at the bottom of the stack: Ricochet Trap's target later.
    s = run(s, planCast(s, ap, ids[2]!, [player(opp)]));
    const mine: TargetChoice[] = [{ kind: "stack", id: s.stack.find((x) => x.objectId === ids[2])!.id }];
    expect(problem(s, ap, ids[1]!, mine)).toMatch(/can't be paid now/);
    giveLands(s, opp, [mountain, island]);
    const redId = toHand(s, opp, bolt);
    s = untilPriority(s, opp);
    s = run(s, planCast(s, opp, redId, [player(ap)]));
    s = untilPriority(s, ap);
    expect(problem(s, ap, ids[1]!, mine)).toMatch(/can't be paid now/);
    const blueId = toHand(s, opp, opt);
    s = untilPriority(s, opp);
    s = run(s, planCast(s, opp, blueId));
    s = untilPriority(s, ap);
    expect(s.castThisTurn?.find((c) => c.player === opp && c.colors?.includes("U"))).toBeTruthy();
    const plan = planCast(s, ap, ids[1]!, mine, undefined, "auto", undefined, alt);
    expect(plan!.filter((a) => a.type === "activateMana")).toHaveLength(1);
  });
});

describe("Foil and Land Grant", () => {
  it("Foil: an Island card and another card, not two other cards", () => {
    const { s: s0, ap, ids } = setup([divination, foil, islandCard, opt, bolt]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    tapAll(s, ap);
    const t = [stackTop(s)];
    expect(problem(s, ap, ids[1]!, t, { discard: [ids[3]!, ids[4]!] })).toMatch(/Island card and another card/);
    expect(problem(s, ap, ids[1]!, t, { discard: [ids[2]!] })).toMatch(/Island card and another card/);
    s = passAll(run(s, planCast(s, ap, ids[1]!, t, undefined, "auto", undefined, { ...alt, discard: [ids[2]!, ids[4]!] })));
    expect([ids[2], ids[4]].map((id) => s.objects[id!]!.zone)).toEqual(["graveyard", "graveyard"]);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("Foil: with no Island card in hand it costs {2}{U}{U}", () => {
    const { s: s0, ap, ids } = setup([divination, foil, opt, bolt]);
    const s = run(s0, planCast(s0, ap, ids[0]!));
    expect(problem(s, ap, ids[1]!, [stackTop(s)])).toMatch(/Island card and another card/);
  });

  it("Land Grant: reveal your hand when it has no land cards", () => {
    const { s: s0, ap, ids } = setup([landGrant, bolt]);
    s0.players[ap]!.hand = [...ids]; // not the opening hand's Forests
    tapAll(s0, ap);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, alt));
    expect(s.log.some((e) => /reveals their hand: Lightning Bolt/.test(e.text))).toBe(true);
    s = passAll(s);
    expect(s.pending?.kind).toBe("searchLibrary");
    const { s: t, ap: ap2, ids: ids2 } = setup([landGrant, islandCard]);
    t.players[ap2]!.hand = [...ids2];
    expect(problem(t, ap2, ids2[0]!)).toMatch(/can't be paid now/);
  });
});

describe("the Shoals", () => {
  it("Blazing Shoal: X is the mana value of the red card exiled", () => {
    const { s: s0, ap, ids } = setup([blazing, hammer, bolt]);
    tapAll(s0, ap);
    const b = putOnBattlefield(s0, ap, bear());
    const t: TargetChoice[] = [{ kind: "object", id: b }];
    expect(castProblem(s0, ap, ids[0]!, t, undefined, undefined, undefined, 3, { ...alt, exileFromHand: [ids[2]!] })).toMatch(/red card with mana value 3/);
    expect(castProblem(s0, ap, ids[0]!, t, undefined, undefined, undefined, 1, { ...alt, exileFromHand: [ids[1]!] })).toMatch(/red card with mana value 1/);
    const plan = planCast(s0, ap, ids[0]!, t, undefined, "auto", 3, { ...alt, exileFromHand: [ids[1]!] });
    expect(plan!.filter((a) => a.type === "activateMana")).toHaveLength(0);
    const s = passAll(run(s0, plan));
    expect(s.objects[ids[1]!]!.zone).toBe("exile");
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.effects.some((e) => e.affected.includes(b))).toBe(true);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("Disrupting Shoal counters only a spell whose mana value is X; Nourishing Shoal gains X", () => {
    const { s: s0, ap, ids } = setup([divination, disrupting, divination, nourishing, card("Gigantosaurus", "Creature — Dinosaur", "{G}{G}{G}{G}{G}", { power: "10", toughness: "10" })]);
    const blue3 = toHand(s0, ap, card("Think Twice", "Instant", "{1}{U}{U}", { oracleText: "Draw a card." }));
    const blue2 = toHand(s0, ap, card("Counterspell", "Instant", "{U}{U}", { oracleText: "Counter target spell." }));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    tapAll(s, ap);
    // X = 2 against a mana value 3 spell: not countered.
    s = passAll(run(s, planCast(s, ap, ids[1]!, [stackTop(s)], undefined, "auto", 2, { ...alt, exileFromHand: [blue2] })));
    s = passAll(s);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.log.some((e) => /doesn't counter/.test(e.text))).toBe(true);
    expect(s.stack).toHaveLength(0);
    // Nourishing Shoal for the 5-mana-value green card: 5 life.
    const life = s.players[ap]!.life;
    s = passAll(run(s, planCast(s, ap, ids[3]!, undefined, undefined, "auto", 5, { ...alt, exileFromHand: [ids[4]!] })));
    expect(s.players[ap]!.life).toBe(life + 5);
    void blue3;
  });

  it("Disrupting Shoal with X = 3 counters a mana value 3 spell", () => {
    const { s: s0, ap, ids } = setup([divination, disrupting]);
    const blue3 = toHand(s0, ap, card("Think Twice", "Instant", "{1}{U}{U}", { oracleText: "Draw a card." }));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    tapAll(s, ap);
    s = passAll(run(s, planCast(s, ap, ids[1]!, [stackTop(s)], undefined, "auto", 3, { ...alt, exileFromHand: [blue3] })));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.log.some((e) => /Disrupting Shoal counters Divination/.test(e.text))).toBe(true);
  });

  it("an alternative cost without X makes X 0 (CR 107.3b)", () => {
    const fireball = card("Fireball", "Sorcery", "{X}{R}", { oracleText: "You may sacrifice two Mountains rather than pay this spell's mana cost.\nFireball deals X damage to any target." });
    const { s, ap, ids, opp } = setup([fireball]);
    expect(castProblem(s, ap, ids[0]!, [player(opp)], undefined, undefined, undefined, 3, alt)).toMatch(/X is 0/);
  });
});
