// Blocking triggers and restrictions, lands that enter tapped unless..., persist/undying/soulshift,
// damage prevention, life-gain triggers, once-each-turn abilities and threshold.
// CR 509.1b, 509.3, 702.23, 702.25, 702.31, 702.45, 614.1d, 614.12, 702.79, 702.93, 702.46,
// 615.7, 119.10, 602.5b, 119.4.

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, forest, passAll, passUntil, pt, putOnBattlefield, setup, target, island, plainsCard, swamp } from "./helpers";
import { blockProblem, compileCard, isFullySupported, waitingOn, type GameState, type PlayerId } from "../src";

const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const logged = (s: GameState, re: RegExp) => s.log.some((e) => re.test(e.text));
const o = (s: GameState, id: string) => s.objects[id]!;

/** From the active player's main 1: declare attacks, then blocks; returns once the block triggers have resolved. */
function toBlocks(s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[], blocks: { blocker: string; attacker: string }[] = []) {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 12 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  while (s.pending?.kind === "declareBlockers") {
    const pid = s.pending.player;
    s = act(s, { type: "declareBlockers", player: pid, blocks: blocks.filter((b) => s.objects[b.blocker]!.controller === pid) });
  }
  for (let i = 0; i < 20 && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}

const untapAll = (s: GameState) => s.battlefield.forEach((id) => (s.objects[id]!.tapped = false));
const supported = (...defs: ReturnType<typeof card>[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));

describe("blocking triggers and restrictions", () => {
  it("horsemanship: only creatures with horsemanship can block it (702.31b)", () => {
    const { s, ap, opp } = setup([]);
    const rider = bear({ name: "Rider", oracleText: "Horsemanship", keywords: ["Horsemanship"] });
    supported(rider);
    const a = putOnBattlefield(s, ap, rider);
    const plain = putOnBattlefield(s, opp, bear());
    const other = putOnBattlefield(s, opp, bear({ name: "Other Rider", oracleText: "Horsemanship", keywords: ["Horsemanship"] }));
    o(s, a).attacking = opp;
    expect(blockProblem(s, o(s, plain), o(s, a))).toMatch(/horsemanship/);
    expect(blockProblem(s, o(s, other), o(s, a))).toBeNull();
  });

  it("bushido triggers when it blocks or becomes blocked, not when unblocked (702.45a)", () => {
    const samurai = bear({ name: "Samurai", oracleText: "Bushido 2", keywords: ["Bushido"] });
    supported(samurai);
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, samurai);
    const b = putOnBattlefield(s0, opp, bear());
    let s = toBlocks(s0, ap, [{ attacker: a, defender: opp }], [{ blocker: b, attacker: a }]);
    expect(pt(s, a)).toBe("4/4");
    s = passUntil(s, "endCombat", ap);
    expect(zone(s, b)).toBe("graveyard");
    expect(zone(s, a)).toBe("battlefield");

    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const a1 = putOnBattlefield(s1, ap1, samurai);
    const unblocked = toBlocks(s1, ap1, [{ attacker: a1, defender: opp1 }]);
    expect(pt(unblocked, a1)).toBe("2/2");

    // As a blocker.
    const { s: s2, ap: ap2, opp: opp2 } = setup([]);
    const att = putOnBattlefield(s2, ap2, bear({ name: "Big", power: "3", toughness: "3" }));
    const blk = putOnBattlefield(s2, opp2, samurai);
    const blocked = toBlocks(s2, ap2, [{ attacker: att, defender: opp2 }], [{ blocker: blk, attacker: att }]);
    expect(pt(blocked, blk)).toBe("4/4");
  });

  it("flanking gives each blocker without flanking -1/-1, which can kill it before damage (702.25a)", () => {
    const knight = bear({ name: "Knight", oracleText: "Flanking", keywords: ["Flanking"] });
    supported(knight);
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, knight);
    const small = putOnBattlefield(s0, opp, bear({ name: "Squire", power: "1", toughness: "1" }));
    const s = toBlocks(s0, ap, [{ attacker: a, defender: opp }], [{ blocker: small, attacker: a }]);
    expect(zone(s, small)).toBe("graveyard");
    // A blocker with flanking doesn't trigger it.
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const a1 = putOnBattlefield(s1, ap1, knight);
    const other = putOnBattlefield(s1, opp1, bear({ name: "Other Knight", oracleText: "Flanking", keywords: ["Flanking"] }));
    const s2 = toBlocks(s1, ap1, [{ attacker: a1, defender: opp1 }], [{ blocker: other, attacker: a1 }]);
    expect(pt(s2, other)).toBe("2/2");
  });

  it("rampage counts blockers beyond the first as it resolves (702.23)", () => {
    const wurm = bear({ name: "Wurm", power: "3", toughness: "3", oracleText: "Rampage 2", keywords: ["Rampage"] });
    supported(wurm);
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, wurm);
    const bs = [0, 1, 2].map(() => putOnBattlefield(s0, opp, bear()));
    const s = toBlocks(s0, ap, [{ attacker: a, defender: opp }], bs.map((b) => ({ blocker: b, attacker: a })));
    expect(pt(s, a)).toBe("7/7");
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const a1 = putOnBattlefield(s1, ap1, wurm);
    const b1 = putOnBattlefield(s1, opp1, bear());
    expect(pt(toBlocks(s1, ap1, [{ attacker: a1, defender: opp1 }], [{ blocker: b1, attacker: a1 }]), a1)).toBe("3/3");
  });

  it('"+1/+1 for each creature blocking it" and "becomes blocked, it gets"', () => {
    const berserker = bear({ name: "Berserker", power: "1", toughness: "1", oracleText: "Whenever Berserker becomes blocked, it gets +1/+1 until end of turn for each creature blocking it." });
    const warrior = bear({ name: "Warrior", oracleText: "Whenever Warrior becomes blocked, it gets +3/+0 until end of turn." });
    supported(berserker, warrior);
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, berserker);
    const w = putOnBattlefield(s0, ap, warrior);
    const bs = [0, 1].map(() => putOnBattlefield(s0, opp, bear()));
    const b3 = putOnBattlefield(s0, opp, bear());
    const s = toBlocks(s0, ap, [{ attacker: a, defender: opp }, { attacker: w, defender: opp }], [...bs.map((b) => ({ blocker: b, attacker: a })), { blocker: b3, attacker: w }]);
    expect(pt(s, a)).toBe("3/3");
    expect(pt(s, w)).toBe("5/2");
  });

  it('"blocks a creature with flying" checks the attacker; "becomes blocked by a creature" aims at that creature', () => {
    const archer = bear({ name: "Archer", oracleText: "Reach\nWhenever Archer blocks a creature with flying, Archer gets +3/+0 until end of turn.", keywords: ["Reach"] });
    const hound = bear({ name: "Hound", oracleText: "Whenever Hound blocks or becomes blocked by a creature, Hound deals 1 damage to that creature." });
    supported(archer, hound);
    const flyer = bear({ name: "Bird", oracleText: "Flying", keywords: ["Flying"] });
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, flyer);
    const g = putOnBattlefield(s0, ap, bear({ name: "Walker" }));
    const ar = putOnBattlefield(s0, opp, archer);
    const ar2 = putOnBattlefield(s0, opp, archer);
    const s = toBlocks(s0, ap, [{ attacker: f, defender: opp }, { attacker: g, defender: opp }], [{ blocker: ar, attacker: f }, { blocker: ar2, attacker: g }]);
    expect(pt(s, ar)).toBe("5/2");
    expect(pt(s, ar2)).toBe("2/2"); // blocked a creature without flying

    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const h = putOnBattlefield(s1, ap1, hound);
    const x = putOnBattlefield(s1, opp1, bear({ name: "Small", power: "1", toughness: "1" }));
    const y = putOnBattlefield(s1, opp1, bear());
    const s2 = toBlocks(s1, ap1, [{ attacker: h, defender: opp1 }], [{ blocker: x, attacker: h }, { blocker: y, attacker: h }]);
    expect(zone(s2, x)).toBe("graveyard");
    expect(o(s2, y).damage).toBe(1);
  });

  it("can't be blocked by creatures with power 2 or less, by Walls, or by more than one creature (509.1b)", () => {
    const wolf = bear({ name: "Wolf", oracleText: "Wolf can't be blocked by creatures with power 2 or less." });
    const rats = bear({ name: "Rats", oracleText: "Rats can't be blocked by Walls." });
    const brute = bear({ name: "Brute", oracleText: "Brute can't be blocked by more than one creature." });
    supported(wolf, rats, brute);
    const { s, ap, opp } = setup([]);
    const w = putOnBattlefield(s, ap, wolf);
    const r = putOnBattlefield(s, ap, rats);
    const small = putOnBattlefield(s, opp, bear());
    const big = putOnBattlefield(s, opp, bear({ name: "Big", power: "3", toughness: "3" }));
    const wall = putOnBattlefield(s, opp, card("Wall of Wood", "Creature — Wall", "{G}", { power: "0", toughness: "3", oracleText: "Defender", keywords: ["Defender"] }));
    for (const id of [w, r]) o(s, id).attacking = opp;
    expect(blockProblem(s, o(s, small), o(s, w))).toMatch(/power 2 or less/);
    expect(blockProblem(s, o(s, big), o(s, w))).toBeNull();
    expect(blockProblem(s, o(s, wall), o(s, r))).toMatch(/Walls/);
    expect(blockProblem(s, o(s, small), o(s, r))).toBeNull();

    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const b = putOnBattlefield(s1, ap1, brute);
    const x = putOnBattlefield(s1, opp1, bear());
    const y = putOnBattlefield(s1, opp1, bear());
    expect(() => toBlocks(s1, ap1, [{ attacker: b, defender: opp1 }], [{ blocker: x, attacker: b }, { blocker: y, attacker: b }])).toThrow(/more than one/);
    expect(() => toBlocks(s1, ap1, [{ attacker: b, defender: opp1 }], [{ blocker: x, attacker: b }])).not.toThrow();
  });
});

describe("lands that enter tapped unless ... (CR 614.1d, 614.12)", () => {
  const playIt = (s: GameState, pid: PlayerId, d: ReturnType<typeof card>, untapped?: boolean) => {
    const id = putOnBattlefield(s, pid, d);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    o(s, id).zone = "hand";
    s.players[pid]!.hand.push(id);
    s.players[pid]!.landsPlayedThisTurn = 0;
    return { s: act(s, { type: "playLand", player: pid, objectId: id, untapped }), id };
  };
  const fast = card("Fast Land", "Land", "", { oracleText: "Fast Land enters tapped unless you control two or fewer other lands.\n{T}: Add {B} or {R}." });
  const slow = card("Slow Land", "Land", "", { oracleText: "Slow Land enters tapped unless you control two or more other lands.\n{T}: Add {B} or {G}." });
  const check = card("Check Land", "Land", "", { oracleText: "Check Land enters tapped unless you control an Island or a Swamp.\n{T}: Add {U} or {B}." });
  const promenade = card("Promenade", "Land", "", { oracleText: "Promenade enters tapped unless you have two or more opponents.\n{T}: Add {G} or {W}." });
  const shock = card("Shock Land", "Land — Swamp Mountain", "", { oracleText: "({T}: Add {B} or {R}.)\nAs Shock Land enters, you may pay 2 life. If you don't, it enters tapped." });
  const snarl = card("Snarl", "Land", "", { oracleText: "As Snarl enters, you may reveal an Island or Swamp card from your hand. If you don't, Snarl enters tapped.\n{T}: Add {U} or {B}." });

  it("compiles them all", () => supported(fast, slow, check, promenade, shock, snarl));

  it("counts the other lands you control, not itself", () => {
    // setup() gives the active player 14 lands.
    const { s, ap } = setup([]);
    const fr = playIt(s, ap, fast);
    expect(o(fr.s, fr.id).tapped).toBe(true);
    const r = playIt(s, ap, slow);
    expect(o(r.s, r.id).tapped).toBe(false);
    const { s: s1, ap: ap1 } = setup([]);
    for (const id of [...s1.battlefield]) if (s1.objects[id]!.controller === ap1) s1.battlefield.splice(s1.battlefield.indexOf(id), 1);
    putOnBattlefield(s1, ap1, forest);
    putOnBattlefield(s1, ap1, forest);
    const f = playIt(s1, ap1, fast);
    expect(o(f.s, f.id).tapped).toBe(false); // two others
    const sl = playIt(s1, ap1, slow);
    expect(o(sl.s, sl.id).tapped).toBe(false);
    const c = playIt(s1, ap1, check);
    expect(o(c.s, c.id).tapped).toBe(true); // only Forests
    putOnBattlefield(s1, ap1, swamp);
    const c2 = playIt(s1, ap1, check);
    expect(o(c2.s, c2.id).tapped).toBe(false);
    const p = playIt(s1, ap1, promenade);
    expect(o(p.s, p.id).tapped).toBe(false); // three opponents
  });

  it("shock lands: pay 2 life to enter untapped, or don't", () => {
    const { s, ap } = setup([]);
    const paid = playIt(structuredClone(s), ap, shock, true);
    expect(o(paid.s, paid.id).tapped).toBe(false);
    expect(paid.s.players[ap]!.life).toBe(38);
    const not = playIt(s, ap, shock);
    expect(o(not.s, not.id).tapped).toBe(true);
    expect(not.s.players[ap]!.life).toBe(40);
  });

  it("reveal lands need a matching card in hand", () => {
    const { s, ap } = setup([]);
    expect(() => playIt(structuredClone(s), ap, snarl, true)).toThrow(/Island or Swamp/);
    const isl = putOnBattlefield(s, ap, island);
    s.battlefield.splice(s.battlefield.indexOf(isl), 1);
    o(s, isl).zone = "hand";
    s.players[ap]!.hand.push(isl);
    const r = playIt(s, ap, snarl, true);
    expect(o(r.s, r.id).tapped).toBe(false);
    expect(logged(r.s, /reveals Island/)).toBe(true);
  });
});

describe("persist, undying, soulshift", () => {
  const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
  const finks = bear({ name: "Finks", oracleText: "Persist" , keywords: ["Persist"] });
  const ghoul = bear({ name: "Ghoul", oracleText: "Undying", keywords: ["Undying"] });

  it("persist returns it with a -1/-1 counter, once (702.79a)", () => {
    supported(finks, ghoul);
    const { s: s0, ap, ids } = setup([murder, murder]);
    const f = putOnBattlefield(s0, ap, finks);
    let s = cast(s0, ap, ids[0]!, [target(f)]);
    expect(zone(s, f)).toBe("battlefield");
    expect(pt(s, f)).toBe("1/1");
    untapAll(s);
    s = cast(s, ap, ids[1]!, [target(f)]);
    expect(zone(s, f)).toBe("graveyard"); // it had a -1/-1 counter
  });

  it("undying returns it with a +1/+1 counter (702.93a)", () => {
    const { s: s0, ap, ids } = setup([murder, murder]);
    const g = putOnBattlefield(s0, ap, ghoul);
    let s = cast(s0, ap, ids[0]!, [target(g)]);
    expect(pt(s, g)).toBe("3/3");
    untapAll(s);
    s = cast(s, ap, ids[1]!, [target(g)]);
    expect(zone(s, g)).toBe("graveyard");
  });

  it("a token with persist doesn't come back (it ceased to exist, 704.5d)", () => {
    const { s: s0, ap, ids } = setup([murder]);
    const f = putOnBattlefield(s0, ap, finks);
    o(s0, f).isToken = true;
    const s = cast(s0, ap, ids[0]!, [target(f)]);
    expect(s.objects[f]).toBeUndefined();
  });

  it("soulshift returns a Spirit card with low enough mana value (702.46a)", () => {
    const shifter = card("Shifter", "Creature — Spirit", "{4}{G}", { power: "2", toughness: "2", oracleText: "Soulshift 3", keywords: ["Soulshift"] });
    supported(shifter);
    const small = card("Small Spirit", "Creature — Spirit", "{1}{G}", { power: "1", toughness: "1" });
    const big = card("Big Spirit", "Creature — Spirit", "{4}{G}{G}", { power: "5", toughness: "5" });
    const { s: s0, ap, ids } = setup([murder]);
    const sh = putOnBattlefield(s0, ap, shifter);
    const toGy = (d: ReturnType<typeof card>) => {
      const id = putOnBattlefield(s0, ap, d);
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      o(s0, id).zone = "graveyard";
      s0.players[ap]!.graveyard.push(id);
      return id;
    };
    const sm = toGy(small);
    toGy(big);
    let s = cast(s0, ap, ids[0]!, [target(sh)]);
    expect(s.pending?.kind).toBe("chooseTargets");
    if (s.pending?.kind !== "chooseTargets") return;
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [target(sh)] })).toThrow(); // mana value 5
    s = act(s, { type: "chooseTargets", player: ap, targets: [target(sm)] });
    s = passAll(s);
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(zone(s, sm)).toBe("hand");
  });
});

describe("damage prevention (CR 615)", () => {
  it("a shield prevents the next N damage this turn, then is used up, and ends at cleanup", () => {
    const acolyte = card("Acolyte", "Creature — Human Cleric", "{W}", { power: "1", toughness: "1", oracleText: "{T}: Prevent the next 2 damage that would be dealt to any target this turn." });
    const bolt = card("Bolt", "Instant", "{R}", { oracleText: "Bolt deals 3 damage to any target." });
    supported(acolyte);
    const { s: s0, ap, ids, opp } = setup([bolt, bolt]);
    const a = putOnBattlefield(s0, ap, acolyte);
    const b = putOnBattlefield(s0, opp, bear({ name: "Ward Bear", toughness: "4" }));
    let s = activate(s0, ap, a, 0, [target(b)]);
    expect(o(s, b).preventNext).toBe(2);
    s = cast(s, ap, ids[0]!, [target(b)]);
    expect(o(s, b).damage).toBe(1);
    expect(o(s, b).preventNext).toBe(0);
    s = cast(s, ap, ids[1]!, [target(b)]);
    expect(zone(s, b)).toBe("graveyard");
    // Players can be shielded too, and shields end at cleanup.
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const a1 = putOnBattlefield(s1, ap1, acolyte);
    let t = activate(s1, ap1, a1, 0, [{ kind: "player", id: opp1 }]);
    expect(t.players[opp1]!.preventNext).toBe(2);
    t = passUntil(t, "upkeep");
    expect(t.players[opp1]!.preventNext).toBeUndefined();
  });

  it("Fog prevents all combat damage this turn", () => {
    const fog = card("Fog", "Instant", "{G}", { oracleText: "Prevent all combat damage that would be dealt this turn." });
    supported(fog);
    const { s: s0, ap, ids, opp } = setup([fog]);
    const a = putOnBattlefield(s0, ap, bear());
    let s = cast(s0, ap, ids[0]!);
    s = toBlocks(s, ap, [{ attacker: a, defender: opp }]);
    s = passUntil(s, "endCombat", ap);
    expect(s.players[opp]!.life).toBe(40);
    expect(logged(s, /All combat damage is prevented/)).toBe(true);
  });
});

describe('"whenever you gain life" (CR 119.10)', () => {
  const pridemate = bear({ name: "Pridemate", oracleText: "Whenever you gain life, put a +1/+1 counter on Pridemate." });

  it("triggers for a life-gain spell", () => {
    supported(pridemate);
    const heal = card("Heal", "Instant", "{W}", { oracleText: "You gain 3 life." });
    const { s: s0, ap, ids } = setup([heal]);
    const p = putOnBattlefield(s0, ap, pridemate);
    const s = cast(s0, ap, ids[0]!);
    expect(pt(passAll(s), p)).toBe("3/3");
  });

  it("a lifelink creature's combat damage to several things is one event", () => {
    const { s: s0, ap, opp } = setup([]);
    const p = putOnBattlefield(s0, ap, pridemate);
    const ll = putOnBattlefield(s0, ap, bear({ name: "Linker", power: "4", toughness: "4", oracleText: "Lifelink, trample", keywords: ["Lifelink", "Trample"] }));
    const ll2 = putOnBattlefield(s0, ap, bear({ name: "Linker Two", oracleText: "Lifelink", keywords: ["Lifelink"] }));
    const blk = putOnBattlefield(s0, opp, bear());
    let s = toBlocks(s0, ap, [{ attacker: ll, defender: opp }, { attacker: ll2, defender: opp }], [{ blocker: blk, attacker: ll }]);
    s = passUntil(s, "endCombat", ap);
    expect(s.players[ap]!.life).toBe(46);
    expect(pt(s, p)).toBe("4/4"); // two sources, two events
  });
});

describe("activated ability costs and limits", () => {
  it('"Activate only once each turn" (602.5b), again next turn', () => {
    const rootwalla = bear({ name: "Rootwalla", oracleText: "{1}{G}: Rootwalla gets +2/+2 until end of turn. Activate only once each turn." });
    supported(rootwalla);
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, rootwalla);
    expect(compileCard(rootwalla).activated[0]!.oncePerTurn).toBe(true);
    let s = activate(s0, ap, r, 0);
    expect(pt(s, r)).toBe("4/4");
    expect(() => activate(s, ap, r, 0)).toThrow();
    s = passUntil(s, "main1", ap, 5000);
    s = passUntil(passUntil(s, "upkeep"), "main1", ap, 5000);
    expect(() => activate(s, ap, r, 0)).not.toThrow();
  });

  it("pay life as a cost, only with enough life (119.4)", () => {
    const contender = bear({ name: "Contender", oracleText: "Pay 1 life: Contender gets +1/+1 until end of turn. Activate only once each turn." });
    supported(contender);
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, contender);
    const s = activate(s0, ap, c, 0);
    expect(s.players[ap]!.life).toBe(39);
    const { s: s1, ap: ap1 } = setup([]);
    const c1 = putOnBattlefield(s1, ap1, contender);
    s1.players[ap1]!.life = 0;
    expect(() => activate(s1, ap1, c1, 0)).toThrow();
  });
});

describe("threshold", () => {
  it("applies only with seven or more cards in your graveyard", () => {
    const anurid = bear({ name: "Anurid", oracleText: "Threshold — Anurid gets +1/+1 as long as there are seven or more cards in your graveyard." });
    const crusader = bear({ name: "Crusader", oracleText: "Threshold — As long as there are seven or more cards in your graveyard, Crusader gets +1/+1 and has flying." });
    supported(anurid, crusader);
    const { s, ap } = setup([]);
    const a = putOnBattlefield(s, ap, anurid);
    const c = putOnBattlefield(s, ap, crusader);
    expect(pt(s, a)).toBe("2/2");
    const p = s.players[ap]!;
    for (let i = 0; i < 7; i++) {
      const id = p.library.shift()!;
      s.objects[id]!.zone = "graveyard";
      p.graveyard.push(id);
    }
    const after = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(pt(after, a)).toBe("3/3");
    expect(pt(after, c)).toBe("3/3");
    expect(after.log.length).toBeGreaterThan(0);
  });
});

// Keep unused helpers referenced for lint (plains used by other files).
void plainsCard;
