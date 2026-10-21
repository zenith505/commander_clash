// "Counter target spell unless its controller pays {3}" (CR 118.12), energy counters (CR 122.1)
// and the monarch (CR 724).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, becomeMonarch, characteristics, compileCard, isFullySupported, objIsType, planActivate, planCast, planMana, parseManaCost, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return s;
};
/** Tap every untapped land `pid` has but `keep`. */
const tapLands = (s: GameState, pid: PlayerId, keep = 0) => {
  const lands = s.battlefield.filter((id) => s.objects[id]!.controller === pid && !s.objects[id]!.tapped && objIsType(s, s.objects[id]!, "Land"));
  for (const id of lands.slice(keep)) s.objects[id]!.tapped = true;
};
const pay = (s: GameState, pid: PlayerId) => {
  const pend = s.pending;
  if (pend?.kind !== "payUnless") throw new Error("nothing to pay");
  return settle(run(s, [...planMana(s, pid, parseManaCost(pend.cost))!, { type: "payUnless", player: pid, pay: true }]));
};

const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
const leak = card("Mana Leak", "Instant", "{1}{U}", { oracleText: "Counter target spell unless its controller pays {3}." });
const pierce = card("Spell Pierce", "Instant", "{U}", { oracleText: "Counter target noncreature spell unless its controller pays {2}." });
const lies = card("No More Lies", "Instant", "{W}{U}", {
  oracleText: "Counter target spell unless its controller pays {3}. If that spell is countered this way, exile it instead of putting it into its owner's graveyard.",
});
const winds = card("Countervailing Winds", "Instant", "{2}{U}", { oracleText: "Counter target spell unless its controller pays {1} for each card in your graveyard." });
const clash = card("Clash of Wills", "Instant", "{X}{U}", { oracleText: "Counter target spell unless its controller pays {X}." });
const hatchling = card("Spiketail Hatchling", "Creature — Drake", "{1}{U}", { power: "1", toughness: "1", oracleText: "Flying\nSacrifice this creature: Counter target spell unless its controller pays {1}.", keywords: ["Flying"] });
const mundungu = card("Mundungu", "Creature — Human Wizard", "{1}{U}{B}", { power: "1", toughness: "1", oracleText: "{T}: Counter target spell unless its controller pays {1} and 1 life." });
const voidCard = card("Nether Void", "World Enchantment", "{3}{B}", { oracleText: "Whenever a player casts a spell, counter it unless that player pays {3}." });
const sure = card("Sure Thing", "Sorcery", "{2}{U}", { oracleText: "This spell can't be countered.\nDraw two cards." });

/** `ap` casts Divination (or `first`), then the counterspell aimed at it. */
function counterOwn(counter: CardDef, first: CardDef = divination, x?: number) {
  const { s: s0, ap, ids } = setup([first, counter]);
  let s = run(s0, planCast(s0, ap, ids[0]!));
  const spell = s.stack[0]!.id;
  s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: spell }], undefined, undefined, x));
  return { s: settle(s), ap, ids };
}

describe('"counter target spell unless its controller pays" (CR 118.12)', () => {
  it("compiles the templates", () => {
    supported(leak, pierce, lies, winds, clash, hatchling, mundungu, voidCard);
    expect(compileCard(leak).spell!.effects[0]).toEqual({ type: "counterSpell", index: 0, unless: { cost: "{3}" } });
    expect(compileCard(lies).spell!.effects[0]).toMatchObject({ unless: { cost: "{3}" }, exile: true });
    expect(compileCard(winds).spell!.effects[0]).toMatchObject({ unless: { cost: "", generic: { count: { kind: "cardsInGraveyard" } } } });
  });

  it("asks the spell's controller as it resolves; unpaid, the spell is countered", () => {
    const { s: s0, ap, ids } = counterOwn(leak);
    expect(s0.pending).toMatchObject({ kind: "payUnless", player: ap, cost: "{3}", source: "Mana Leak", what: "Divination" });
    const s = settle(act(s0, { type: "payUnless", player: ap, pay: false }));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.stack).toHaveLength(0);
    expect(logged(s, /Mana Leak counters Divination/)).toBe(true);
  });

  it("paid, the spell resolves", () => {
    const { s: s0, ap, ids } = counterOwn(leak);
    const hand = s0.players[ap]!.hand.length;
    const s = settle(passAll(pay(s0, ap)));
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(zone(s, ids[0]!)).toBe("graveyard"); // resolved, then went to the graveyard
    expect(logged(s, /pays \{3\} for Mana Leak/)).toBe(true);
  });

  it("can't pay without the mana", () => {
    const { s, ap } = counterOwn(leak);
    tapLands(s, ap);
    expect(() => act(s, { type: "payUnless", player: ap, pay: true })).toThrow(/not enough mana/);
  });

  it("No More Lies exiles what it counters; Spell Pierce only targets noncreature spells", () => {
    const { s: s0, ap, ids } = counterOwn(lies);
    const s = settle(act(s0, { type: "payUnless", player: ap, pay: false }));
    expect(zone(s, ids[0]!)).toBe("exile");
    const bear = card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });
    const { s: t0, ap: p, ids: t } = setup([bear, pierce]);
    const t1 = run(t0, planCast(t0, p, t[0]!));
    expect(planCast(t1, p, t[1]!, [{ kind: "stack", id: t1.stack[0]!.id }])).toBeNull();
  });

  it("Countervailing Winds counts cards in your graveyard as it resolves, not counting itself", () => {
    const { s: s0, ap, ids } = setup([divination, winds]);
    for (const id of s0.players[ap]!.library.slice(0, 2)) {
      s0.players[ap]!.library.splice(s0.players[ap]!.library.indexOf(id), 1);
      s0.players[ap]!.graveyard.push(id);
      s0.objects[id]!.zone = "graveyard";
    }
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: s.stack[0]!.id }])));
    expect(s.pending).toMatchObject({ kind: "payUnless", cost: "{2}" });
  });

  it("Clash of Wills asks for X; with X = 0 it's paid automatically (CR 118.5)", () => {
    const { s } = counterOwn(clash, divination, 4);
    expect(s.pending).toMatchObject({ kind: "payUnless", cost: "{4}" });
    const { s: t, ids } = counterOwn(clash, divination, 0);
    expect(t.pending).toBeNull();
    expect(logged(t, /pays \{0\} for Clash of Wills/)).toBe(true);
    expect(zone(passAll(t), ids[0]!)).toBe("graveyard");
  });

  it("a spell that can't be countered isn't, and nobody is asked to pay", () => {
    const { s } = counterOwn(leak, sure);
    expect(s.pending).toBeNull();
    expect(logged(s, /can't be countered/)).toBe(true);
  });

  it("Spiketail Hatchling sacrifices itself; Mundungu asks for mana and life", () => {
    const { s: s0, ap, ids, opp } = setup([divination]);
    const h = putOnBattlefield(s0, opp, hatchling);
    let s = act(run(s0, planCast(s0, ap, ids[0]!)), { type: "passPriority", player: ap });
    s = settle(run(s, planActivate(s, opp, h, 0, [{ kind: "stack", id: s.stack[0]!.id }])!));
    expect(zone(s, h)).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, cost: "{1}", source: "Spiketail Hatchling" });

    const { s: m0, ap: p, ids: m, opp: o } = setup([divination]);
    const mu = putOnBattlefield(m0, o, mundungu);
    let t = act(run(m0, planCast(m0, p, m[0]!)), { type: "passPriority", player: p });
    t = settle(run(t, planActivate(t, o, mu, 0, [{ kind: "stack", id: t.stack[0]!.id }])!));
    expect(t.pending).toMatchObject({ kind: "payUnless", cost: "{1}", life: 1 });
    const life = t.players[p]!.life;
    t = pay(t, p);
    expect(t.players[p]!.life).toBe(life - 1);
    expect(logged(t, /pays \{1\} and 1 life for Mundungu/)).toBe(true);
  });

  it("Nether Void counters each spell unless its caster pays {3}", () => {
    const { s: s0, ap, ids, opp } = setup([divination]);
    putOnBattlefield(s0, opp, voidCard);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, cost: "{3}", source: "Nether Void", what: "Divination" });
    s = settle(act(s, { type: "payUnless", player: ap, pay: false }));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.stack).toHaveLength(0);
  });

  it("bots pay when they can, and only counter what the caster can't pay for", () => {
    const { s: s0, ap, ids } = counterOwn(leak);
    const acts = botActions(s0, ap);
    expect(acts[acts.length - 1]).toEqual({ type: "payUnless", player: ap, pay: true });

    // An opponent casts a big spell; the bot holds Mana Leak and responds only if they're tapped out.
    const big = card("Big Thing", "Sorcery", "{3}{U}", { oracleText: "Draw three cards." });
    const { s: b0, ap: caster, ids: b, opp } = setup([big]);
    const leakId = putOnBattlefield(b0, opp, leak);
    b0.battlefield.splice(b0.battlefield.indexOf(leakId), 1);
    b0.objects[leakId]!.zone = "hand";
    b0.players[opp]!.hand.push(leakId);
    for (const l of [card("Island", "Basic Land — Island"), card("Island", "Basic Land — Island")]) putOnBattlefield(b0, opp, l);
    let s = run(b0, planCast(b0, caster, b[0]!));
    s = act(s, { type: "passPriority", player: caster });
    expect(waitingOn(s)).toBe(opp);
    expect(botActions(s, opp).some((a) => a.type === "castSpell")).toBe(false); // they have mana left
    tapLands(s, caster);
    const plan = botActions(s, opp);
    expect(plan[plan.length - 1]).toMatchObject({ type: "castSpell", objectId: leakId });
  });
});

const puzzleknot = card("Glassblower's Puzzleknot", "Artifact", "{2}{U}", {
  oracleText: "When this artifact enters, scry 2, then you get {E}{E}.\n{2}{U}, Sacrifice this artifact: Scry 2, then you get {E}{E}.",
});
const battlewagon = card("Bespoke Battlewagon", "Artifact — Vehicle", "{5}{U}", {
  power: "4",
  toughness: "6",
  oracleText: "{T}: You get {E}{E}.\n{T}, Pay {E}{E}{E}: Draw a card.\nCrew 4",
});
const servo = card("Aether Hub Thing", "Artifact", "{1}", { oracleText: "{T}, Pay {E}: Add one mana of any color." });
const siphon = card("Electrosiphon", "Instant", "{U}{U}{B}{R}", { oracleText: "Counter target spell. You get an amount of {E} equal to its mana value." });
const reservoir = card("Reservoir Walker", "Artifact Creature — Construct", "{4}", { power: "3", toughness: "3", oracleText: "When this creature enters, you gain 3 life and get {E}{E}{E}." });
const sentinel = card("Throne Guard", "Creature — Human Soldier", "{3}{W}", { power: "2", toughness: "4", oracleText: "When this creature enters, you become the monarch." });
const brassMan = card("Brass Man", "Artifact Creature — Construct", "{1}", {
  power: "1",
  toughness: "3",
  oracleText: "This creature doesn't untap during your untap step.\nAt the beginning of your upkeep, you may pay {1}. If you do, untap this creature.",
});
const poet = card("Arrogant Poet", "Creature — Human Warlock", "{1}{B}", { power: "2", toughness: "1", oracleText: "Whenever this creature attacks, you may pay 2 life. If you do, it gains flying until end of turn." });
const dromar = card("Dromar Test", "Creature — Dragon", "{4}{W}{U}{B}", {
  power: "6",
  toughness: "6",
  oracleText: "Whenever this creature deals combat damage to a player, you may pay {2}{U}. If you do, choose a color, then return all creatures of that color to their owners' hands.",
});
const ivory = card("Ivory Cup", "Artifact", "{1}", { oracleText: "Whenever a player casts a white spell, you may pay {1}. If you do, you gain 1 life." });
const pacify = card("Pacify", "Instant", "{W}", { oracleText: "Target creature gets -1/-0 until end of turn." });

describe("energy (CR 107.14)", () => {
  it("compiles the templates", () => {
    supported(puzzleknot, battlewagon, servo, siphon, reservoir);
    expect(compileCard(battlewagon).activated[1]).toMatchObject({ tap: true, energyCost: 3, manaCost: "" });
    expect(compileCard(servo).mana[0]).toMatchObject({ energyCost: 1 });
    expect(isFullySupported(card("Big", "Artifact", "{1}", { oracleText: "{T}, Pay sixty {E}: Draw seven cards." }))).toBe(false);
  });

  it("you get energy, and pay it to activate", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, battlewagon);
    expect(planActivate(s0, ap, w, 1)).toBeNull(); // no energy yet
    let s = settle(passAll(run(s0, planActivate(s0, ap, w, 0)!)));
    expect(s.players[ap]!.energy).toBe(2);
    s.players[ap]!.energy = 3;
    s.objects[w]!.tapped = false;
    const hand = s.players[ap]!.hand.length;
    s = settle(passAll(run(s, planActivate(s, ap, w, 1)!)));
    expect(s.players[ap]!.energy).toBe(0);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it('"you gain 3 life and get {E}{E}{E}"; Electrosiphon counts the countered spell\'s mana value', () => {
    const { s: s0, ap, ids } = setup([reservoir, divination, siphon]);
    const life = s0.players[ap]!.life;
    let s = settle(passAll(run(s0, planCast(s0, ap, ids[0]!))));
    expect(s.players[ap]!.life).toBe(life + 3);
    expect(s.players[ap]!.energy).toBe(3);
    s = run(s, planCast(s, ap, ids[1]!));
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, U: 2, B: 1, R: 1 };
    s = settle(passAll(run(s, planCast(s, ap, ids[2]!, [{ kind: "stack", id: s.stack[0]!.id }]))));
    expect(zone(s, ids[1]!)).toBe("graveyard");
    expect(s.players[ap]!.energy).toBe(6);
  });

  it("a mana ability that costs energy", () => {
    const { s, ap } = setup([]);
    const hub = putOnBattlefield(s, ap, servo);
    expect(() => act(s, { type: "activateMana", player: ap, objectId: hub, mana: "R" })).toThrow(/can't produce \{R\} right now/);
    s.players[ap]!.energy = 1;
    const t = act(s, { type: "activateMana", player: ap, objectId: hub, mana: "R" });
    expect(t.players[ap]!.energy).toBe(0);
    expect(t.players[ap]!.manaPool.R).toBe(1);
  });
});

describe('"you may pay ... If you do"', () => {
  it("compiles, and keeps a whole \"If you do\" sentence together", () => {
    supported(brassMan, poet, ivory);
    expect(compileCard(brassMan).triggers[0]!.body.effects[0]).toMatchObject({ type: "may", pay: { mana: "{1}" } });
    // Choosing a color "then" returning creatures both depend on paying; we don't read that yet.
    expect(isFullySupported(dromar)).toBe(false);
  });

  it("Ivory Cup: paid from untapped lands, or declined", () => {
    const { s: s0, ap, ids } = setup([pacify, pacify]);
    putOnBattlefield(s0, ap, ivory);
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: b }])));
    expect(s.pending).toMatchObject({ kind: "chooseMay", pay: { mana: "{1}" } });
    expect(() => act(s, { type: "chooseMay", player: ap, yes: true })).toThrow(/not enough mana/);
    const life = s.players[ap]!.life;
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped && objIsType(s, s.objects[id]!, "Land"));
    const forest = lands.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest")!;
    s = act(s, { type: "activateMana", player: ap, objectId: forest, mana: "G" });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.players[ap]!.life).toBe(life + 1);
    expect(logged(s, /pays \{1\} for Ivory Cup/)).toBe(true);
    s = settle(passAll(s));
    // Can't pay: it isn't even asked.
    tapLands(s, ap);
    s.players[ap]!.manaPool.W = 1;
    const before = s.players[ap]!.life;
    s = settle(act(s, { type: "castSpell", player: ap, objectId: ids[1]!, targets: [{ kind: "object", id: b }] }));
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.life).toBe(before);
  });

  it("Arrogant Poet pays life; bots pay when it's worth it", () => {
    const { s: s0, ap, opp } = setup([]);
    const p = putOnBattlefield(s0, ap, poet);
    let s = passUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: p, defender: opp }] }));
    expect(s.pending).toMatchObject({ kind: "chooseMay", pay: { life: 2 } });
    const acts = botActions(s, ap);
    expect(acts).toEqual([{ type: "chooseMay", player: ap, yes: true }]);
    const life = s.players[ap]!.life;
    s = settle(act(s, acts[0]!));
    expect(s.players[ap]!.life).toBe(life - 2);
    expect(characteristics(s, s.objects[p]!).keywords).toContain("Flying");
  });

  it("Brass Man untaps at upkeep if you pay {1}", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, brassMan);
    s0.objects[m]!.tapped = true;
    let s = passUntil(s0, "end", ap);
    for (let i = 0; i < 200 && !(s.activePlayer === ap && s.pending?.kind === "chooseMay"); i++) {
      const pid = waitingOn(s)!;
      const pend = s.pending;
      s = act(s, pend?.kind === "declareAttackers" ? { type: "declareAttackers", player: pid, attacks: [] } : pend?.kind === "declareBlockers" ? { type: "declareBlockers", player: pid, blocks: [] } : pend?.kind === "discardToHandSize" ? { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, pend.count) } : { type: "passPriority", player: pid });
    }
    expect(s.step).toBe("upkeep");
    expect(s.objects[m]!.tapped).toBe(true); // it didn't untap in the untap step
    s = settle(run(s, [...botActions(s, ap)]));
    expect(s.objects[m]!.tapped).toBe(false);
  });
});

describe("the monarch (CR 725)", () => {
  it("compiles", () => {
    supported(sentinel);
    expect(compileCard(sentinel).triggers[0]!.body.effects).toEqual([{ type: "becomeMonarch", who: { ref: "you" } }]);
  });

  it("the monarch draws at the beginning of their end step", () => {
    const { s: s0, ap, ids } = setup([sentinel]);
    let s = settle(passAll(run(s0, planCast(s0, ap, ids[0]!))));
    expect(s.monarch).toBe(ap);
    expect(logged(s, /becomes the monarch/)).toBe(true);
    const hand = s.players[ap]!.hand.length;
    s = passUntil(s, "end", ap);
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(logged(s, /The monarch's ability triggers/)).toBe(true);
  });

  it("combat damage to the monarch makes the attacker's controller the monarch", () => {
    const { s: s0, ap, opp } = setup([]);
    becomeMonarch(s0, opp);
    const a = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    s = passUntil(s, "endCombat", ap);
    expect(s.monarch).toBe(ap);
  });

  it("when the monarch leaves the game, the active player becomes the monarch (725.4)", () => {
    const { s: s0, ap, opp } = setup([]);
    becomeMonarch(s0, opp);
    s0.players[opp]!.life = 0;
    const s = settle(act(s0, { type: "passPriority", player: ap }));
    expect(s.players[opp]!.lost).toBe(true);
    expect(s.monarch).toBe(ap);
  });

  it("bots attack the monarch", () => {
    const { s: s0, ap, opp } = setup([]);
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    becomeMonarch(s0, other);
    s0.players[opp]!.life = 30;
    putOnBattlefield(s0, ap, bear());
    const s = passUntil(s0, "declareAttackers", ap);
    const [a] = botActions(s, ap);
    expect(a).toMatchObject({ type: "declareAttackers", attacks: [{ defender: other }] });
  });
});
