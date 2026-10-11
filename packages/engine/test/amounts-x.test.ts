// X costs and counted amounts: "for each", "equal to the number of", "where X is", characteristic-
// defining power and toughness, and last known information.
// CR 107.3 (X), 107.1b (negative results), 202.3e, 601.2b, 604.3 and 613.4a (layer 7a), 608.2h, 611.3a.

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, cast, passAll, pt, putOnBattlefield, setup, target } from "./helpers";
import { botActions, castProblem, compileCard, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const o = (s: GameState, id: string) => s.objects[id]!;
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return passAll(s);
};
/** Resolve the stack, passing priority for everyone. */
function settle(s: GameState) {
  for (let i = 0; i < 40 && (s.stack.length || s.pending); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
const castX = (s: GameState, pid: PlayerId, id: string, x: number, targets?: ReturnType<typeof target>[]) => settle(run(s, planCast(s, pid, id, targets, undefined, undefined, x)));
const poolTotal = (s: GameState, pid: PlayerId) => Object.values(s.players[pid]!.manaPool).reduce((a, b) => a + b, 0);

const blaze = card("Blaze", "Sorcery", "{X}{R}", { oracleText: "Blaze deals X damage to any target." });
const hill = (extra: Partial<CardDef> = {}) => card(extra.name ?? "Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3", ...extra });

describe("X costs (CR 107.3)", () => {
  it("X is announced while casting and paid as generic mana; the spell uses it as it resolves", () => {
    supported(blaze);
    const { s, ap, ids, opp } = setup([blaze]);
    const giant = putOnBattlefield(s, opp, hill());
    const plan = planCast(s, ap, ids[0]!, [target(giant)], undefined, undefined, 3)!;
    // X=3 plus {R}: four lands tapped.
    expect(plan.filter((a) => a.type === "activateMana")).toHaveLength(4);
    expect(plan[plan.length - 1]).toMatchObject({ type: "castSpell", x: 3 });
    let t = s;
    for (const a of plan) t = act(t, a);
    expect(t.stack[t.stack.length - 1]).toMatchObject({ x: 3 });
    expect(t.log.some((l) => /casts Blaze with X=3/.test(l.text))).toBe(true);
    t = settle(t);
    expect(zone(t, giant)).toBe("graveyard");
  });

  it("can't choose an X it can't pay for, a negative or fractional X, or X for a spell without one", () => {
    const { s, ap, ids } = setup([blaze, bear()]);
    expect(castProblem(s, ap, ids[0]!, [{ kind: "player", id: ap }], undefined, undefined, undefined, 1)).toMatch(/not enough mana/);
    expect(planCast(s, ap, ids[0]!, [{ kind: "player", id: ap }], undefined, undefined, 20)).toBeNull(); // only 14 lands
    expect(castProblem(s, ap, ids[0]!, [{ kind: "player", id: ap }], undefined, undefined, undefined, -1)).toMatch(/whole number/);
    expect(castProblem(s, ap, ids[0]!, [{ kind: "player", id: ap }], undefined, undefined, undefined, 1.5)).toMatch(/whole number/);
    expect(castProblem(s, ap, ids[1]!, undefined, undefined, undefined, undefined, 2)).toMatch(/no X/);
  });

  it("cast without paying its mana cost, X can only be 0 (CR 107.3b)", () => {
    const { s, ap, ids } = setup([blaze]);
    s.pending = { kind: "castFree", player: ap, objectId: ids[0]!, source: "test" };
    expect(castProblem(s, ap, ids[0]!, [{ kind: "player", id: ap }], undefined, undefined, undefined, 2)).toMatch(/X is 0/);
    expect(castProblem(s, ap, ids[0]!, [{ kind: "player", id: ap }], undefined, undefined, undefined, 0)).toBeNull();
  });

  it("{X}{X} pays X twice", () => {
    const panacea = card("Panacea", "Artifact", "{4}", { oracleText: "{X}{X}, {T}: Prevent the next X damage that would be dealt to any target this turn." });
    supported(panacea);
    const { s, ap } = setup([]);
    const p = putOnBattlefield(s, ap, panacea);
    const plan = planActivate(s, ap, p, 0, [{ kind: "player", id: ap }], undefined, undefined, 3)!;
    expect(plan.filter((a) => a.type === "activateMana")).toHaveLength(6);
    const t = settle(run(s, plan));
    expect(t.players[ap]!.preventNext).toBe(3);
  });

  it("a permanent spell's X sets how many counters it enters with and what its enters ability does (CR 107.3m)", () => {
    const hydra = card("Endless One", "Creature — Avatar", "{X}", { power: "0", toughness: "0", oracleText: "This creature enters with X +1/+1 counters on it." });
    const anguish = card("Ajani's Anguish", "Enchantment", "{X}{R}", { oracleText: "When this enchantment enters, it deals X damage to any target.\nCreatures you control have trample." });
    supported(hydra, anguish);
    let { s, ap, ids, opp } = setup([hydra, anguish]);
    s = castX(s, ap, ids[0]!, 4);
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(o(s, ids[0]!).counters["+1/+1"]).toBe(4);
    expect(pt(s, ids[0]!)).toBe("4/4");
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 5, G: 0, C: 0 };
    let t = run(s, planCast(s, ap, ids[1]!, undefined, undefined, undefined, 4));
    // The enters trigger targets as it's put on the stack, with the spell's X.
    t = act(t, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    expect(t.stack[t.stack.length - 1]).toMatchObject({ x: 4 });
    const before = life(t, opp);
    t = settle(t);
    expect(life(t, opp)).toBe(before - 4);
  });

  it("an activated ability's X is chosen when it's activated", () => {
    const squad = card("Ballista Squad", "Creature — Human Rebel", "{3}{W}", { power: "2", toughness: "2", oracleText: "{X}{W}, {T}: This creature deals X damage to target attacking or blocking creature." });
    const dynamo = card("Goblin Dynamo", "Creature — Goblin", "{5}{R}{R}", { power: "4", toughness: "4", oracleText: "{X}{R}, {T}, Sacrifice this creature: It deals X damage to any target." });
    supported(squad, dynamo);
    const { s, ap, opp } = setup([]);
    const d = putOnBattlefield(s, ap, dynamo);
    const plan = planActivate(s, ap, d, 0, [{ kind: "player", id: opp }], undefined, undefined, 5)!;
    expect(plan[plan.length - 1]).toMatchObject({ type: "activateAbility", x: 5 });
    const before = life(s, opp);
    const t = settle(run(s, plan));
    expect(zone(t, d)).toBe("graveyard");
    expect(life(t, opp)).toBe(before - 5);
  });

  it("a bot casts an X spell with as big an X as its mana allows", () => {
    const { s, ap, ids, opp } = setup([blaze]);
    s.players[opp]!.life = 9;
    s.players[ap]!.hand = [...ids]; // nothing else to do with the mana
    s.players[ap]!.command = [];
    const plan = botActions(s, ap);
    const castA = plan.find((a) => a.type === "castSpell") as Extract<Action, { type: "castSpell" }> | undefined;
    expect(castA?.objectId).toBe(ids[0]);
    expect(castA?.x).toBe(13); // 14 lands, {R} for the rest
  });

  it("text that uses X with nothing to choose it isn't trusted", () => {
    const odd = card("Odd Sorcery", "Sorcery", "{2}{R}", { oracleText: "Odd Sorcery deals X damage to any target." });
    const oddStatic = card("Odd Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2", oracleText: "This creature gets +X/+X." });
    expect(isFullySupported(odd)).toBe(false);
    expect(isFullySupported(oddStatic)).toBe(false);
  });
});

describe("counted amounts (CR 608.2h)", () => {
  it('"for each": draws a card for each creature you control, gains 2 life for each', () => {
    const unconscious = card("Collective Unconscious", "Sorcery", "{4}{G}{G}", { oracleText: "Draw a card for each creature you control." });
    const festival = card("Festival of Trokin", "Instant", "{W}", { oracleText: "You gain 2 life for each creature you control." });
    supported(unconscious, festival);
    let { s, ap, ids } = setup([unconscious, festival]);
    putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, ap, bear());
    const hand = s.players[ap]!.hand.length;
    s = settle(cast(s, ap, ids[0]!));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3);
    const before = life(s, ap);
    s = settle(cast(s, ap, ids[1]!));
    expect(life(s, ap)).toBe(before + 6);
  });

  it('"where X is" is counted once, as it resolves: Craterhoof\'s pump doesn\'t grow later (CR 608.2h, 611.2c)', () => {
    const hoof = card("Craterhoof Behemoth", "Creature — Beast", "{5}{G}{G}{G}", {
      power: "5",
      toughness: "5",
      oracleText: "Haste\nWhen this creature enters, creatures you control gain trample and get +X/+X until end of turn, where X is the number of creatures you control.",
    });
    supported(hoof);
    let { s, ap, ids } = setup([hoof]);
    const b = putOnBattlefield(s, ap, bear());
    s = settle(cast(s, ap, ids[0]!));
    expect(pt(s, b)).toBe("4/4"); // two creatures
    const late = putOnBattlefield(s, ap, bear());
    expect(pt(s, b)).toBe("4/4");
    expect(pt(s, late)).toBe("2/2"); // the affected set was locked in too
  });

  it('"equal to the number of cards in that player\'s hand" counts the targeted player\'s hand', () => {
    const gaze = card("Gaze of Adamaro", "Instant", "{2}{R}{R}", { oracleText: "Gaze of Adamaro deals damage to target player equal to the number of cards in that player's hand." });
    supported(gaze);
    let { s, ap, ids, opp } = setup([gaze]);
    const n = s.players[opp]!.hand.length;
    const before = life(s, opp);
    s = settle(cast(s, ap, ids[0]!, [{ kind: "player", id: opp }]));
    expect(life(s, opp)).toBe(before - n);
  });

  it("a negative count is 0 (CR 107.1b)", () => {
    const tower = card("Ivory Tower", "Artifact", "{1}", { oracleText: "At the beginning of your upkeep, you gain X life, where X is the number of cards in your hand minus 4." });
    supported(tower);
    const k = compileCard(tower).triggers[0]!.body.effects[0]!;
    expect(k).toMatchObject({ type: "gainLife", n: { count: { kind: "cardsInHand" }, plus: -4 } });
  });

  it("puts X counters on the token it just created", () => {
    const fractal = card("Fractal Summoning", "Sorcery", "{X}{G/U}{G/U}", { oracleText: "Create a 0/0 green and blue Fractal creature token. Put X +1/+1 counters on it." });
    supported(fractal);
    let { s, ap, ids } = setup([fractal]);
    s = castX(s, ap, ids[0]!, 3);
    const token = s.battlefield.find((id) => s.cards[o(s, id).cardId]!.name === "Fractal Token");
    expect(token).toBeDefined();
    expect(pt(s, token!)).toBe("3/3");
  });

  it('"enters with a +1/+1 counter for each other creature" doesn\'t count itself', () => {
    const captain = card("Squad Captain", "Creature — Human Soldier", "{4}{W}", { power: "2", toughness: "2", oracleText: "Vigilance\nThis creature enters with a +1/+1 counter on it for each other creature you control." });
    supported(captain);
    let { s, ap, ids } = setup([captain]);
    putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, ap, bear());
    s = settle(cast(s, ap, ids[0]!));
    expect(o(s, ids[0]!).counters["+1/+1"]).toBe(2);
  });
});

describe("last known information (CR 608.2h)", () => {
  it("Swords to Plowshares: life equal to the exiled creature's power as it last existed, to its controller then", () => {
    const swords = card("Swords to Plowshares", "Instant", "{W}", { oracleText: "Exile target creature. Its controller gains life equal to its power." });
    supported(swords);
    let { s, ap, ids, opp } = setup([swords]);
    const giant = putOnBattlefield(s, opp, hill());
    addEffect(s, opp, [giant], [{ kind: "modifyPT", power: 2, toughness: 2 }]);
    const before = life(s, opp);
    s = settle(cast(s, ap, ids[0]!, [target(giant)]));
    expect(zone(s, giant)).toBe("exile");
    expect(life(s, opp)).toBe(before + 5);
  });

  it("a creature sacrificed to pay for its ability deals damage equal to its power as it last existed", () => {
    const shade = card("Cinder Shade", "Creature — Shade", "{1}{B}{R}", { power: "1", toughness: "1", oracleText: "{B}: This creature gets +1/+1 until end of turn.\n{R}, Sacrifice this creature: It deals damage equal to its power to target creature." });
    supported(shade);
    let { s, ap, opp } = setup([]);
    const sh = putOnBattlefield(s, ap, shade);
    const giant = putOnBattlefield(s, opp, hill());
    s = settle(run(s, planActivate(s, ap, sh, 0)));
    s = settle(run(s, planActivate(s, ap, sh, 0)));
    expect(pt(s, sh)).toBe("3/3");
    s = settle(run(s, planActivate(s, ap, sh, 1, [target(giant)])));
    expect(zone(s, sh)).toBe("graveyard");
    expect(zone(s, giant)).toBe("graveyard");
  });

  it("a dies trigger uses the creature's last power: Bottle Golems", () => {
    const golems = card("Bottle Golems", "Artifact Creature — Golem", "{4}", { power: "3", toughness: "3", oracleText: "Trample\nWhen this creature dies, you gain life equal to its power." });
    const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
    supported(golems, murder);
    let { s, ap, ids } = setup([murder]);
    const g = putOnBattlefield(s, ap, golems);
    addEffect(s, ap, [g], [{ kind: "modifyPT", power: 4, toughness: 0 }]);
    const before = life(s, ap);
    s = settle(cast(s, ap, ids[0]!, [target(g)]));
    expect(life(s, ap)).toBe(before + 7);
  });
});

describe("static abilities that count (CR 611.3a)", () => {
  it('"gets +1/+0 for each artifact you control" changes as artifacts come and go', () => {
    const akiri = card("Akiri, Line-Slinger", "Legendary Creature — Kor Soldier Ally", "{R}{W}", { power: "0", toughness: "3", oracleText: "First strike, vigilance\nAkiri gets +1/+0 for each artifact you control." });
    const rock = card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}." });
    supported(akiri);
    const { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, ap, akiri);
    expect(pt(s, a)).toBe("0/3");
    putOnBattlefield(s, ap, rock);
    putOnBattlefield(s, ap, rock);
    putOnBattlefield(s, opp, rock); // not ours
    expect(pt(s, a)).toBe("2/3");
  });

  it("Death's Shadow follows your life total, and a negative life total counts as 0", () => {
    const shadow = card("Death's Shadow", "Creature — Avatar", "{B}", { power: "13", toughness: "13", oracleText: "This creature gets -X/-X, where X is your life total." });
    supported(shadow);
    const { s, ap } = setup([]);
    const d = putOnBattlefield(s, ap, shadow);
    s.players[ap]!.life = 10;
    expect(pt(s, d)).toBe("3/3");
    s.players[ap]!.life = 4; // no invalidation: the cache notices the life total changed
    expect(pt(s, d)).toBe("9/9");
    s.players[ap]!.life = -3;
    expect(pt(s, d)).toBe("13/13"); // rulings: "If your life total is negative, X is considered to be 0"
  });

  it("*/* creatures: power and toughness defined by a count, in layer 7a (CR 604.3, 613.4a)", () => {
    const squadron = card("Battle Squadron", "Creature — Goblin", "{3}{R}{R}", { power: "*", toughness: "*", oracleText: "Flying\nBattle Squadron's power and toughness are each equal to the number of creatures you control." });
    const goyf = card("Lhurgoyf", "Creature — Lhurgoyf", "{2}{G}{G}", { power: "*", toughness: "1+*", oracleText: "Lhurgoyf's power is equal to the number of creature cards in all graveyards and its toughness is equal to that number plus 1." });
    supported(squadron, goyf);
    const { s, ap } = setup([]);
    const q = putOnBattlefield(s, ap, squadron);
    expect(pt(s, q)).toBe("1/1"); // counts itself
    putOnBattlefield(s, ap, bear());
    expect(pt(s, q)).toBe("2/2");
    // A later effect setting power and toughness (7b) overrides it; +1/+1 (7c) adds to it.
    addEffect(s, ap, [q], [{ kind: "modifyPT", power: 1, toughness: 1 }]);
    expect(pt(s, q)).toBe("3/3");
    addEffect(s, ap, [q], [{ kind: "setPT", power: 1, toughness: 1 }]);
    expect(pt(s, q)).toBe("2/2");
    const g = putOnBattlefield(s, ap, goyf);
    expect(pt(s, g)).toBe("0/1");
  });

  it("a */* creature that loses all abilities has no ability defining its power: 0 for each * (rulings)", () => {
    const squadron = card("Battle Squadron", "Creature — Goblin", "{3}{R}{R}", { power: "*", toughness: "*", oracleText: "Battle Squadron's power and toughness are each equal to the number of creatures you control." });
    let { s, ap } = setup([]);
    const q = putOnBattlefield(s, ap, squadron);
    putOnBattlefield(s, ap, bear());
    addEffect(s, ap, [q], [{ kind: "loseAllAbilities" }]);
    expect(pt(s, q)).toBe("0/0");
  });
});
