// Kicker (CR 702.33) and additional costs (CR 601.2b, 601.2f-h).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, putOnBattlefield, setup } from "./helpers";
import { botActions, castProblem, compileCard, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return settle(passAll(s));
};
const pool = (s: GameState, pid: PlayerId) => Object.values(s.players[pid]!.manaPool).reduce((a, b) => a + b, 0);

const burst = card("Burst Lightning", "Instant", "{R}", { oracleText: "Kicker {4}\nBurst Lightning deals 2 damage to any target. If this spell was kicked, it deals 4 damage instead." });
const roil = card("Into the Roil", "Instant", "{1}{U}", { oracleText: "Kicker {1}{U}\nReturn target nonland permanent to its owner's hand. If this spell was kicked, draw a card." });
const drake = card("Academy Drake", "Creature — Drake", "{2}{U}", {
  power: "2",
  toughness: "2",
  oracleText: "Kicker {4}\nFlying\nIf this creature was kicked, it enters with two +1/+1 counters on it.",
});
const battlemage = card("Thornscape Battlemage", "Creature — Elf Wizard", "{2}{G}", {
  power: "2",
  toughness: "2",
  oracleText:
    "Kicker {R} and/or {W}\nWhen this creature enters, if it was kicked with its {R} kicker, it deals 2 damage to any target.\nWhen this creature enters, if it was kicked with its {W} kicker, destroy target artifact.",
});
const wolfbriar = card("Wolfbriar Elemental", "Creature — Elemental", "{2}{G}{G}", {
  power: "4",
  toughness: "4",
  oracleText: "Multikicker {G}\nWhen this creature enters, create a 2/2 green Wolf creature token for each time it was kicked.",
});
const fling = card("Fling", "Instant", "{1}{R}", { oracleText: "As an additional cost to cast this spell, sacrifice a creature.\nFling deals damage equal to the sacrificed creature's power to any target." });
const splinters = card("Bone Splinters", "Sorcery", "{B}", { oracleText: "As an additional cost to cast this spell, sacrifice a creature.\nDestroy target creature." });
const reunion = card("Cathartic Reunion", "Sorcery", "{1}{R}", { oracleText: "As an additional cost to cast this spell, discard two cards.\nDraw three cards." });
const boon = card("Withering Boon", "Instant", "{1}{B}", { oracleText: "As an additional cost to cast this spell, pay 3 life.\nCounter target creature spell." });
const bargain = card("Night's Bargain", "Sorcery", "{1}{B}", { oracleText: "As an additional cost to cast this spell, pay 3 life.\nDraw two cards." });

describe("kicker (CR 702.33)", () => {
  it("compiles kicker, multikicker and the kicked-only text", () => {
    supported(burst, roil, drake, battlemage, wolfbriar);
    expect(compileCard(battlemage).kicker).toEqual({ costs: ["{R}", "{W}"] });
    expect(compileCard(wolfbriar).kicker).toEqual({ costs: ["{G}"], multi: true });
    // "with its {W} kicker" is linked to the second kicker cost (CR 702.33f).
    expect(compileCard(battlemage).triggers[1]!.ifKicked).toEqual({ kind: "kicked", which: 1 });
    // Text about a kicker the card doesn't have isn't trusted.
    expect(isFullySupported(card("Odd", "Sorcery", "{R}", { oracleText: "Draw a card. If this spell was kicked, draw a card." }))).toBe(false);
  });

  it("the kicker cost is added to the total cost (601.2f), and the spell does the kicked thing instead", () => {
    const { s: s0, ap, ids, opp } = setup([burst]);
    const plain = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    expect(life(plain, opp)).toBe(life(s0, opp) - 2);
    const plan = planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, undefined, undefined, { kicks: [0] })!;
    expect(plan.filter((a) => a.type === "activateMana")).toHaveLength(5);
    expect(plan[plan.length - 1]).toMatchObject({ type: "castSpell", kicks: [0] });
    const kicked = run(s0, plan);
    expect(life(kicked, opp)).toBe(life(s0, opp) - 4);
    expect(logged(kicked, /casts Burst Lightning, kicked/)).toBe(true);
  });

  it("each kicker cost can be paid once; a card without kicker can't be kicked", () => {
    const { s, ap, ids } = setup([burst]);
    expect(castProblem(s, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { kicks: [0, 0] })).toMatch(/only once/);
    expect(castProblem(s, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { kicks: [1] })).toMatch(/no such kicker/);
    const { s: t, ap: p2, ids: ids2 } = setup([reunion]);
    expect(castProblem(t, p2, ids2[0]!, undefined, undefined, undefined, undefined, undefined, { kicks: [0] })).toMatch(/has no kicker/);
  });

  it('"if it was kicked" adds to what it does: Into the Roil draws a card', () => {
    const { s: s0, ap, ids, opp } = setup([roil]);
    const b = putOnBattlefield(s0, opp, bear());
    const hand = s0.players[ap]!.hand.length;
    const s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: b }], undefined, undefined, undefined, { kicks: [0] }));
    expect(s.objects[b]!.zone).toBe("hand");
    expect(s.players[ap]!.hand.length).toBe(hand); // cast one, drew one
  });

  it("a kicked permanent spell enters with counters, and remembers being kicked only while it's that permanent (CR 400.7)", () => {
    const { s: s0, ap, ids } = setup([drake]);
    const s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { kicks: [0] }));
    expect(s.objects[ids[0]!]).toMatchObject({ zone: "battlefield", counters: { "+1/+1": 2 }, kicked: [0] });
    const { s: t0, ap: ap2, ids: ids2 } = setup([drake]);
    const t = run(t0, planCast(t0, ap2, ids2[0]!));
    expect(t.objects[ids2[0]!]!.counters["+1/+1"]).toBeUndefined();
  });

  it("two kicker costs: each enters trigger checks its own (an intervening if, CR 603.4)", () => {
    const { s: s0, ap, ids, opp } = setup([battlemage]);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { kicks: [0] }));
    // Only the {R} kicker was paid: only the damage trigger, which asks for its target.
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(life(s, opp)).toBe(life(s0, opp) - 2);
    expect(s.pending).toBeNull();
  });

  it("multikicker: paid any number of times, counted by the enters trigger", () => {
    // Multikicker {1} rather than {G}, so the test lands can pay for it three times.
    const pack = card("Wolf Pack", "Creature — Elemental", "{2}{G}{G}", { power: "4", toughness: "4", oracleText: wolfbriar.oracleText.replace("{G}", "{1}") });
    const { s: s0, ap, ids } = setup([pack]);
    const plan = planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { kicks: [0, 0, 0] })!;
    expect(plan.filter((a) => a.type === "activateMana")).toHaveLength(7);
    const s = run(s0, plan);
    expect(s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Wolf Token")).toHaveLength(3);
    expect(logged(s, /kicked 3 times/)).toBe(true);
  });

  it("bots kick when they can afford it", () => {
    const { s, ap, ids } = setup([drake]);
    s.players[ap]!.hand = [...ids];
    s.players[ap]!.command = [];
    const cast = botActions(s, ap).find((a) => a.type === "castSpell");
    expect(cast).toMatchObject({ objectId: ids[0], kicks: [0] });
  });
});

describe("additional costs (CR 601.2b, 601.2f-h)", () => {
  it("compiles sacrifice, discard, pay life", () => {
    supported(fling, splinters, reunion, boon, bargain);
    expect(compileCard(reunion).additionalCosts).toEqual([{ kind: "discard", n: 2 }]);
    // "The sacrificed creature" needs a sacrifice cost to refer to.
    expect(isFullySupported(card("Odd", "Instant", "{R}", { oracleText: "Odd deals damage equal to the sacrificed creature's power to any target." }))).toBe(false);
  });

  it("can't be cast without something to sacrifice; the sacrifice is chosen and paid while casting", () => {
    const { s: s0, ap, ids, opp } = setup([splinters]);
    const victim = putOnBattlefield(s0, opp, bear());
    expect(castProblem(s0, ap, ids[0]!)).toMatch(/sacrifice a creature/);
    const mine = putOnBattlefield(s0, ap, bear());
    expect(castProblem(s0, ap, ids[0]!, [{ kind: "object", id: victim }], undefined, undefined, undefined, undefined, { sacrifice: [victim] })).toMatch(/choose a creature to sacrifice/);
    let s = s0;
    for (const a of planCast(s0, ap, ids[0]!, [{ kind: "object", id: victim }], undefined, undefined, undefined, { sacrifice: [mine] })!) s = act(s, a);
    // Paid as it's cast, before it resolves.
    expect(s.objects[mine]!.zone).toBe("graveyard");
    s = settle(passAll(s));
    expect(s.objects[victim]!.zone).toBe("graveyard");
  });

  it("Fling: damage equal to the sacrificed creature's power as it last existed (CR 608.2h)", () => {
    const { s: s0, ap, ids, opp } = setup([fling]);
    const big = putOnBattlefield(s0, ap, bear({ name: "Big", power: "5", toughness: "5" }));
    const s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, undefined, undefined, { sacrifice: [big] }));
    expect(life(s, opp)).toBe(life(s0, opp) - 5);
  });

  it("discard as a cost: not the spell itself (it's on the stack, CR 601.2a); pay life only with enough life (CR 119.4)", () => {
    const { s: s0, ap, ids } = setup([reunion]);
    s0.players[ap]!.hand = [ids[0]!, s0.players[ap]!.library[0]!];
    s0.objects[s0.players[ap]!.hand[1]!]!.zone = "hand";
    s0.players[ap]!.library.shift();
    expect(castProblem(s0, ap, ids[0]!)).toMatch(/discard 2 cards/);
    const { s: t, ap: p2, ids: ids2 } = setup([bargain]);
    t.players[p2]!.life = 2;
    expect(castProblem(t, p2, ids2[0]!)).toMatch(/can't pay 3 life/);
  });

  it("bots sacrifice a token or a cheap creature, never their commander", () => {
    const { s, ap, ids, opp } = setup([splinters]);
    s.players[ap]!.hand = [...ids];
    s.players[ap]!.command = [];
    putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    const cmd = putOnBattlefield(s, ap, bear({ name: "My Commander" }), { commander: true });
    expect(botActions(s, ap).some((a) => a.type === "castSpell")).toBe(false);
    const cheap = putOnBattlefield(s, ap, bear({ name: "Cheap" }));
    const cast = botActions(s, ap).find((a) => a.type === "castSpell");
    expect(cast).toMatchObject({ sacrifice: [cheap] });
    expect(pool(s, ap)).toBe(0);
    expect(cmd).not.toBe(cheap);
  });
});
