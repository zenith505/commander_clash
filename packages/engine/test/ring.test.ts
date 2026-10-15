// The Ring tempts you (CR 701.54).

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, passAll, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { botActions, characteristics, deckLimit, isFullySupported, planCast, ringBearer, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
type Answer = (s: GameState) => Action | null;
const bot: Answer = (s) => botActions(s, waitingOn(s)!)[0]!;
const run = (s: GameState, actions: Action[] | null) => {
  if (!actions) throw new Error("no plan");
  return actions.reduce((x, a) => act(x, a), s);
};
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const castNow = (s: GameState, pid: PlayerId, id: string, targets?: TargetChoice[]) => settle(run(s, planCast(s, pid, id, targets, undefined, "auto")));
const pickBearer = (s: GameState, id: string) => {
  expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "ringBearer" });
  return settle(act(s, { type: "pickPermanents", player: s.pending!.player, ids: [id] }));
};
/** Attack, then answer everything with `answer` (falling back on the bot) until combat is over. */
function attack(s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[], answer: Answer = bot) {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 200 && !(s.step === "main2" && !s.pending && !s.stack.length); i++)
    s = s.pending ? act(s, answer(s) ?? bot(s)!) : act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
/** Give `pid` the Ring, tempted `n` times, with `id` as their Ring-bearer. */
function withRing(s: GameState, pid: PlayerId, id: string, n: number) {
  s.players[pid]!.ring = { tempted: n, timestamp: s.nextTimestamp++, bearer: { id, zc: s.objects[id]!.zoneChanges ?? 0 } };
}

// Real oracle text (Scryfall).
const birthdayEscape = card("Birthday Escape", "Sorcery", "{U}", { oracleText: "Draw a card. The Ring tempts you." });
const claimThePrecious = card("Claim the Precious", "Sorcery", "{1}{B}{B}", { oracleText: "Destroy target creature. The Ring tempts you." });
const tookReaper = card("Took Reaper", "Creature — Halfling Peasant", "{1}{W}", { power: "2", toughness: "1", oracleText: "When this creature dies, the Ring tempts you." });
const nazgul = card("Nazgûl", "Creature — Wraith Knight", "{2}{B}", { power: "1", toughness: "2", keywords: ["Deathtouch"], oracleText: "Deathtouch\nWhen this creature enters, the Ring tempts you.\nWhenever the Ring tempts you, put a +1/+1 counter on each Wraith you control.\nA deck can have up to nine cards named Nazgûl." });
const callOfTheRing = card("Call of the Ring", "Enchantment", "{1}{B}", { oracleText: "At the beginning of your upkeep, the Ring tempts you.\nWhenever you choose a creature as your Ring-bearer, you may pay 2 life. If you do, draw a card." });
const dunedainRangers = card("Dúnedain Rangers", "Creature — Human Ranger", "{3}{G}", { power: "4", toughness: "4", keywords: ["Landfall"], oracleText: "Landfall — Whenever a land you control enters, if you don't control a Ring-bearer, the Ring tempts you." });
const frodoBaggins = card("Frodo Baggins", "Legendary Creature — Halfling Scout", "{G}{W}", { power: "1", toughness: "3", oracleText: "Whenever Frodo Baggins or another legendary creature you control enters, the Ring tempts you.\nAs long as Frodo Baggins is your Ring-bearer, it must be blocked if able." });
// Faramir, Field Commander's second ability, alone (its first isn't supported).
const faramir = card("Faramir, Field Commander", "Legendary Creature — Human Soldier", "{3}{W}", { power: "3", toughness: "3", oracleText: "Whenever the Ring tempts you, if you chose a creature other than Faramir as your Ring-bearer, create a 1/1 white Human Soldier creature token." });
const forestCard = card("Forest", "Basic Land — Forest");

describe("the Ring tempts you", () => {
  it("with no creature, it still tempts you: you get the Ring, with no Ring-bearer (CR 701.54c-d)", () => {
    supported(birthdayEscape, claimThePrecious, tookReaper, nazgul, callOfTheRing, dunedainRangers, frodoBaggins, faramir);
    const { s: s0, ap, ids } = setup([birthdayEscape]);
    const hand = s0.players[ap]!.hand.length;
    const s = castNow(s0, ap, ids[0]!);
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.players[ap]!.ring).toMatchObject({ tempted: 1 });
    expect(s.players[ap]!.ring!.bearer).toBeUndefined();
  });

  it("you choose one of your creatures; it's legendary and can't be blocked by creatures with greater power", () => {
    const { s: s0, ap, ids, opp } = setup([claimThePrecious]);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear({ name: "Other Bear" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const big = putOnBattlefield(s0, opp, bear({ name: "Big Bear", power: "3", toughness: "3" }));
    const small = putOnBattlefield(s0, opp, bear({ name: "Small Bear", power: "1", toughness: "1" }));
    let s = castNow(s0, ap, ids[0]!, [target(theirs)]);
    expect(s.pending?.kind === "pickPermanents" && s.pending.options).toEqual(expect.arrayContaining([a, b]));
    // Only one.
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: [a, b] })).toThrow();
    s = pickBearer(s, a);
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(ringBearer(s, ap)?.id).toBe(a);
    expect(characteristics(s, s.objects[a]!).supertypes).toContain("Legendary");
    expect(characteristics(s, s.objects[b]!).supertypes).not.toContain("Legendary");
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: big, attacker: a }] })).toThrow(/greater/);
    act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: small, attacker: a }] });
  });

  it("each time, you choose again; a new Ring-bearer replaces the old (CR 701.54a)", () => {
    const { s: s0, ap, ids } = setup([birthdayEscape, birthdayEscape]);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear({ name: "Other Bear" }));
    let s = pickBearer(castNow(s0, ap, ids[0]!), a);
    s = pickBearer(castNow(s, ap, ids[1]!), b);
    expect(ringBearer(s, ap)?.id).toBe(b);
    expect(s.players[ap]!.ring!.tempted).toBe(2);
    expect(characteristics(s, s.objects[a]!).supertypes).not.toContain("Legendary");
  });

  it("another player gaining control of it ends the designation, even if it comes back (CR 701.54a)", () => {
    const { s: s0, ap, ids, opp } = setup([birthdayEscape]);
    const a = putOnBattlefield(s0, ap, bear());
    let s = castNow(s0, ap, ids[0]!);
    expect(ringBearer(s, ap)?.id).toBe(a);
    const steal = addEffect(s, opp, [a], [{ kind: "control" }]);
    s = passAll(s);
    expect(characteristics(s, s.objects[a]!).supertypes).not.toContain("Legendary");
    s.effects = s.effects.filter((e) => e !== steal);
    s = passAll(s);
    expect(ringBearer(s, ap)).toBeUndefined();
    expect(characteristics(s, s.objects[a]!).supertypes).not.toContain("Legendary");
  });

  it("the legend rule applies to a Ring-bearer that shares a name; the bot avoids that", () => {
    const { s: s0, ap, ids } = setup([birthdayEscape]);
    // A legendary creature and a nonlegendary one with its name (a token copy "except it isn't legendary").
    const twin1 = putOnBattlefield(s0, ap, bear({ name: "Twin", power: "4", toughness: "4" }));
    const twin2 = putOnBattlefield(s0, ap, card("Twin", "Legendary Creature — Bear", "{1}{G}", { power: "4", toughness: "4", oracleId: "legendary-twin" }));
    putOnBattlefield(s0, ap, bear());
    const s = castNow(s0, ap, ids[0]!);
    // Not the nonlegendary one (the legendary one stays as it is).
    const pick = bot(s);
    expect(pick?.type === "pickPermanents" && pick.ids).not.toEqual([twin1]);
    // Chosen anyway, its controller keeps one of the two (CR 704.5j).
    const t = act(s, { type: "pickPermanents", player: ap, ids: [twin1] });
    expect([twin1, twin2].filter((id) => t.objects[id]!.zone === "battlefield")).toHaveLength(1);
  });
});

describe("the Ring's abilities", () => {
  it("twice: whenever your Ring-bearer attacks, draw a card, then discard a card", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, bear());
    withRing(s0, ap, a, 1);
    const handBefore = s0.players[ap]!.hand.length;
    let s = attack(s0, ap, [{ attacker: a, defender: opp }]);
    expect(s.players[ap]!.hand.length).toBe(handBefore);
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
    const { s: s1 } = setup([]);
    const b = putOnBattlefield(s1, ap, bear());
    withRing(s1, ap, b, 2);
    const hand = s1.players[ap]!.hand.length;
    const yard = s1.players[ap]!.graveyard.length;
    s = attack(s1, ap, [{ attacker: b, defender: opp }]);
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.players[ap]!.graveyard.length).toBe(yard + 1);
  });

  it("three times: a creature blocking it is sacrificed by its controller at end of combat", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, bear({ name: "Tough Bear", power: "2", toughness: "5" }));
    // It survives the combat damage, and its power isn't greater than the Ring-bearer's.
    const blocker = putOnBattlefield(s0, opp, bear({ name: "Wall Bear", power: "2", toughness: "4" }));
    withRing(s0, ap, a, 3);
    const s = attack(s0, ap, [{ attacker: a, defender: opp }], (x) => {
      if (x.pending?.kind !== "declareBlockers") return null;
      if (x.pending.player !== opp) return { type: "declareBlockers", player: x.pending.player, blocks: [] };
      return { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker: a }] };
    });
    expect(s.objects[blocker]!.damage).toBe(0);
    expect(s.objects[blocker]!.zone).toBe("graveyard");
    expect(s.log.some((e) => /sacrifices Wall Bear/.test(e.text))).toBe(true);
    expect(s.objects[a]!.zone).toBe("battlefield");
  });

  it("four times: when it deals combat damage to a player, each opponent loses 3 life", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, bear());
    withRing(s0, ap, a, 4);
    const others = s0.turnOrder.filter((p) => p !== ap && p !== opp);
    const before = Object.fromEntries(s0.turnOrder.map((p) => [p, s0.players[p]!.life]));
    const s = attack(s0, ap, [{ attacker: a, defender: opp }], (x) => (x.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: x.pending.player, blocks: [] } : null));
    expect(s.players[opp]!.life).toBe(before[opp]! - 2 - 3);
    for (const p of others) expect(s.players[p]!.life).toBe(before[p]! - 3);
    expect(s.players[ap]!.life).toBe(before[ap]);
  });
});

describe("cards that care", () => {
  it("Nazgûl: it tempts you as it enters, then counters on each Wraith; a deck can have nine", () => {
    const { s: s0, ap, ids } = setup([nazgul]);
    const s = castNow(s0, ap, ids[0]!);
    expect(ringBearer(s, ap)?.id).toBe(ids[0]);
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
    expect(deckLimit(nazgul)).toBe(9);
    expect(deckLimit(tookReaper)).toBe(1);
  });

  it("Took Reaper: when it dies, the Ring tempts you", () => {
    const { s: s0, ap, ids } = setup([claimThePrecious]);
    const reaper = putOnBattlefield(s0, ap, tookReaper);
    const other = putOnBattlefield(s0, ap, bear());
    const s = castNow(s0, ap, ids[0]!, [target(reaper)]);
    // The spell's own temptation: only the bear is left to choose. Then Took Reaper's.
    expect(ringBearer(s, ap)?.id).toBe(other);
    expect(s.players[ap]!.ring!.tempted).toBe(2);
  });

  it("Call of the Ring: at your upkeep; whenever you choose a Ring-bearer, you may pay 2 life to draw", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, callOfTheRing);
    const a = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "upkeep", ap);
    s = settle(s);
    expect(s.players[ap]!.ring!.tempted).toBe(1);
    expect(ringBearer(s, ap)?.id).toBe(a);
    expect(s.pending?.kind).toBe("chooseMay");
    const [life, hand] = [s.players[ap]!.life, s.players[ap]!.hand.length];
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.players[ap]!.life).toBe(life - 2);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("Dúnedain Rangers: only if you don't control a Ring-bearer", () => {
    const { s: s0, ap, ids } = setup([forestCard, forestCard]);
    s0.players[ap]!.landsPlayedThisTurn = 0;
    const r = putOnBattlefield(s0, ap, dunedainRangers);
    let s = settle(act(s0, { type: "playLand", player: ap, objectId: ids[0]! }));
    expect(s.players[ap]!.ring!.tempted).toBe(1);
    expect(ringBearer(s, ap)?.id).toBe(r);
    s.players[ap]!.landsPlayedThisTurn = 0;
    s = settle(act(s, { type: "playLand", player: ap, objectId: ids[1]! }));
    expect(s.players[ap]!.ring!.tempted).toBe(1);
  });

  it("Frodo Baggins: as long as it's your Ring-bearer, it must be blocked if able", () => {
    const { s: s0, ap, ids, opp } = setup([frodoBaggins]);
    let s = castNow(s0, ap, ids[0]!);
    const frodo = ids[0]!;
    expect(ringBearer(s, ap)?.id).toBe(frodo);
    const blocker = putOnBattlefield(s, opp, bear({ name: "Weak Bear", power: "1", toughness: "1" }));
    s.objects[frodo]!.controlledSinceTurn = -1;
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: frodo, defender: opp }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind === "declareBlockers" && s.pending.player).toBe(opp);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [] })).toThrow();
    act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker: frodo }] });
  });

  it("'if you chose a creature other than ~ as your Ring-bearer' (Faramir)", () => {
    const { s: s0, ap, ids } = setup([birthdayEscape, birthdayEscape]);
    const f = putOnBattlefield(s0, ap, faramir);
    const b = putOnBattlefield(s0, ap, bear());
    const tokens = (s: GameState) => s.battlefield.filter((id) => s.objects[id]!.isToken).length;
    let s = pickBearer(castNow(s0, ap, ids[0]!), f);
    expect(tokens(s)).toBe(0);
    s = pickBearer(castNow(s, ap, ids[1]!), b);
    expect(tokens(s)).toBe(1);
  });
});
