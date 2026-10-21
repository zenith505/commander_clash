// Round 105, more popular cards: "discard any number of cards / up to two cards, then draw that many" (Colossus of the
// Blood Age, Fable of the Mirror-Breaker, Celes), "if one or more of them entered from a graveyard or was cast from a
// graveyard" (Kotis, Sibsig Champion; Celes), Goblin Welder (two targets swapped at once), Valakut Exploration (cards
// exiled with it, CR 607.2a).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup, target } from "./helpers";
import { blockProblem, castProblem, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const colossus = card("Colossus of the Blood Age", "Artifact Creature — Construct", "{4}{R}{W}", { power: "6", toughness: "6", oracleText: "When this creature enters, it deals 3 damage to each opponent and you gain 3 life.\nWhen this creature dies, discard any number of cards, then draw that many cards plus one." });
const celes = card("Celes, Rune Knight", "Legendary Creature — Human Wizard Knight", "{1}{R}{W}{B}", { power: "4", toughness: "4", oracleText: "When Celes enters, discard any number of cards, then draw that many cards plus one.\nWhenever one or more other creatures you control enter, if one or more of them entered from a graveyard or was cast from a graveyard, put a +1/+1 counter on each creature you control." });
const kotis = card("Kotis, Sibsig Champion", "Legendary Creature — Zombie Warrior", "{B}{G}{U}", { power: "3", toughness: "3", oracleText: "Once during each of your turns, you may cast a creature spell from your graveyard by exiling three other cards from your graveyard in addition to paying its other costs.\nWhenever one or more creatures you control enter, if one or more of them entered from a graveyard or was cast from a graveyard, put two +1/+1 counters on Kotis." });
const welder = card("Goblin Welder", "Creature — Goblin Artificer", "{R}", { power: "1", toughness: "1", oracleText: "{T}: Choose target artifact a player controls and target artifact card in that player's graveyard. If both targets are still legal as this ability resolves, that player simultaneously sacrifices the artifact and returns the artifact card to the battlefield." });
const valakut = card("Valakut Exploration", "Enchantment", "{2}{R}", { keywords: ["Landfall"], oracleText: "Landfall — Whenever a land you control enters, exile the top card of your library. You may play that card for as long as it remains exiled.\nAt the beginning of your end step, if there are cards exiled with this enchantment, put them into their owner's graveyard, then this enchantment deals that much damage to each opponent." });
const fable = card("Fable of the Mirror-Breaker", "Enchantment — Saga", "{2}{R}", { oracleText: "(As this Saga enters and after your draw step, add a lore counter.)\nI — Create a 2/2 red Goblin Shaman creature token with \"Whenever this token attacks, create a Treasure token.\"\nII — You may discard up to two cards. If you do, draw that many cards." });

// Test cards.
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
const raise = card("Test Raise", "Sorcery", "{2}{B}", { oracleText: "Return target creature card from your graveyard to the battlefield." });
const ox = card("Test Ox", "Creature — Ox", "{3}{G}", { power: "3", toughness: "3" });
const relic = (name: string) => card(name, "Artifact", "{2}", { oracleText: "" });
const hill = card("Test Hill", "Land", "", { oracleText: "{T}: Add {R}." });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  if (!plan) throw new Error("can't cast");
  for (const a of plan) s = act(s, a);
  return settle(s);
};
const toZone = (s: GameState, pid: PlayerId, d: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  return id;
};
const via = { via: "turnPermission" as const };
const counters = (s: GameState, id: string) => s.objects[id]!.counters["+1/+1"] ?? 0;
/** One step on: no attacks or blocks, discards to hand size from the left, otherwise pass. */
const step = (s: GameState) => {
  const p = s.pending;
  if (p?.kind === "declareAttackers") return act(s, { type: "declareAttackers", player: p.player, attacks: [] });
  if (p?.kind === "declareBlockers") return act(s, { type: "declareBlockers", player: p.player, blocks: [] });
  if (p?.kind === "discardToHandSize") return act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
  return act(s, { type: "passPriority", player: waitingOn(s)! });
};

describe("round 105: more popular cards", () => {
  it("parse", () => [colossus, celes, kotis, welder, valakut, fable].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Colossus of the Blood Age: dies, discard two of three, draw three", () => {
    const { s: s0, ap, ids } = setup([murder]);
    const c = putOnBattlefield(s0, ap, colossus);
    const hand = [toZone(s0, ap, ox, "hand"), toZone(s0, ap, ox, "hand"), toZone(s0, ap, ox, "hand")];
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(c)]));
    const n = s.players[ap]!.hand.length;
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: n, upTo: true });
    s = settle(act(s, { type: "discard", player: ap, objectIds: hand.slice(0, 2) }));
    expect(hand.slice(0, 2).map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
    expect(s.players[ap]!.hand.length).toBe(n - 2 + 3);
  });

  it("Colossus of the Blood Age: discarding none still draws one", () => {
    const { s: s0, ap, ids } = setup([murder]);
    const c = putOnBattlefield(s0, ap, colossus);
    toZone(s0, ap, ox, "hand");
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(c)]));
    const n = s.players[ap]!.hand.length;
    expect(() => act(s, { type: "discard", player: ap, objectIds: [...s.players[ap]!.hand, ...s.players[ap]!.hand] })).toThrow();
    s = settle(act(s, { type: "discard", player: ap, objectIds: [] }));
    expect(s.players[ap]!.hand.length).toBe(n + 1);
  });

  it("Fable of the Mirror-Breaker: chapter II discards up to two and draws that many", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, fable);
    s0.objects[f]!.counters.lore = 1;
    const hand = [toZone(s0, ap, ox, "hand"), toZone(s0, ap, ox, "hand"), toZone(s0, ap, ox, "hand")];
    // Up to its lore counter: put a second one as after the draw step (CR 714.3b).
    let s = s0;
    for (let i = 0; i < 400 && !(s.pending?.kind === "discard" && s.pending.player === ap); i++) s = step(s);
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 2, upTo: true });
    const before = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "discard", player: ap, objectIds: [hand[0]!] }));
    expect(s.objects[hand[0]!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(before);
  });

  it("Celes: enters, discard any number, draw that many plus one; a creature back from the graveyard pumps the team", () => {
    const { s: s0, ap, ids } = setup([celes, raise]);
    const b = putOnBattlefield(s0, ap, bear());
    const dead = toZone(s0, ap, ox, "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const n = s.players[ap]!.hand.length;
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: n, upTo: true });
    s = settle(act(s, { type: "discard", player: ap, objectIds: [] }));
    expect(s.players[ap]!.hand.length).toBe(n + 1);
    const cel = ids[0]!;
    s = run(s, planCast(s, ap, ids[1]!, [target(dead)]));
    expect(s.objects[dead]!.zone).toBe("battlefield");
    for (const id of [b, cel, dead]) expect(counters(s, id)).toBe(1);
  });

  it("Celes: a creature from the hand doesn't count", () => {
    const { s: s0, ap, ids } = setup([ox]);
    const cel = putOnBattlefield(s0, ap, celes);
    const s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(counters(s, cel)).toBe(0);
  });

  it("Kotis, Sibsig Champion: a creature cast from the graveyard by exiling three other cards; two counters on Kotis", () => {
    const { s: s0, ap } = setup([]);
    const k = putOnBattlefield(s0, ap, kotis);
    const o = toZone(s0, ap, ox, "graveyard");
    const fodder = [0, 1, 2].map(() => toZone(s0, ap, bear(), "graveyard"));
    const s = run(s0, planCast(s0, ap, o, undefined, undefined, "auto", undefined, { ...via, exileCards: fodder }));
    expect(s.objects[o]!.zone).toBe("battlefield");
    expect(fodder.map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile", "exile"]);
    expect(counters(s, k)).toBe(2);
  });

  it("Kotis, Sibsig Champion: not with fewer than three other cards", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, kotis);
    const o = toZone(s0, ap, ox, "graveyard");
    toZone(s0, ap, bear(), "graveyard");
    expect(planCast(s0, ap, o, undefined, undefined, "auto", undefined, via)).toBeNull();
  });

  it("Goblin Welder: swaps an artifact for an artifact card in its controller's graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, welder);
    const theirs = putOnBattlefield(s0, opp, relic("Their Relic"));
    const card2 = toZone(s0, opp, relic("Their Old Relic"), "graveyard");
    const mine = toZone(s0, ap, relic("My Old Relic"), "graveyard");
    // The card must be in the graveyard of the artifact's controller.
    expect(planActivate(s0, ap, w, 0, [target(theirs), target(mine)])).toBeNull();
    const plan = planActivate(s0, ap, w, 0, [target(theirs), target(card2)]);
    const s = settle(plan!.reduce((x, y) => act(x, y), s0));
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.objects[card2]!.zone).toBe("battlefield");
    expect(s.objects[card2]!.controller).toBe(opp);
  });

  it("Goblin Welder: if the card left the graveyard, nothing happens", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, welder);
    const a = putOnBattlefield(s0, ap, relic("Relic"));
    const c = toZone(s0, ap, relic("Old Relic"), "graveyard");
    let s = planActivate(s0, ap, w, 0, [target(a), target(c)])!.reduce((x, y) => act(x, y), s0);
    // Gone in response (as though exiled by another effect).
    s.players[ap]!.graveyard.splice(s.players[ap]!.graveyard.indexOf(c), 1);
    s.objects[c]!.zone = "exile";
    s.objects[c]!.zoneChanges = (s.objects[c]!.zoneChanges ?? 0) + 1;
    s.players[ap]!.exile.push(c);
    s = settle(s);
    expect(s.objects[a]!.zone).toBe("battlefield");
  });

  it("Valakut Exploration: a land exiles the top card; at the end step the cards still exiled go to the graveyard and deal that much", () => {
    const { s: s0, ap, opp, ids } = setup([hill]);
    putOnBattlefield(s0, ap, valakut);
    const top = toZone(s0, ap, ox, "library");
    let s = settle(act(s0, { type: "playLand", player: ap, objectId: ids[0]! }));
    expect(s.objects[top]!.zone).toBe("exile");
    expect(planCast(s, ap, top)).not.toBeNull();
    const life = s.players.map((p) => p.life);
    for (let i = 0; i < 100 && s.step !== "cleanup" && s.activePlayer === ap; i++) {
      s = step(s);
      if (s.step === "end" && !s.stack.length && !s.triggerQueue.length && s.objects[top]!.zone !== "exile") break;
    }
    expect(s.objects[top]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life[opp]! - 1);
    expect(s.players[ap]!.life).toBe(life[ap]!);
  });

  it("Valakut Exploration: a card played from exile isn't there at the end step, so nothing triggers", () => {
    const { s: s0, ap, opp, ids } = setup([hill]);
    putOnBattlefield(s0, ap, valakut);
    const top = toZone(s0, ap, ox, "library");
    let s = settle(act(s0, { type: "playLand", player: ap, objectId: ids[0]! }));
    s = run(s, planCast(s, ap, top));
    expect(s.objects[top]!.zone).toBe("battlefield");
    const life = s.players[opp]!.life;
    for (let i = 0; i < 100 && s.activePlayer === ap; i++) s = step(s);
    expect(s.players[opp]!.life).toBe(life);
  });
});

const winnower = card("Void Winnower", "Creature — Eldrazi", "{9}", { power: "11", toughness: "9", oracleText: "Your opponents can't cast spells with even mana values. (Zero is even.)\nYour opponents can't block with creatures with even mana values." });
const tetsuko = card("Tetsuko Umezawa, Fugitive", "Legendary Creature — Human Rogue", "{1}{U}", { power: "1", toughness: "3", oracleText: "Creatures you control with power or toughness 1 or less can't be blocked." });
const runAway = card("Run Away Together", "Instant", "{1}{U}", { oracleText: "Choose two target creatures controlled by different players. Return those creatures to their owners' hands." });

describe("round 105: Void Winnower, Tetsuko Umezawa, Run Away Together", () => {
  it("parse", () => [winnower, tetsuko, runAway].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Void Winnower: opponents can't cast even spells (X as chosen) or block with even creatures; its controller can", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, winnower);
    const two = toZone(s, opp, card("Two Drop", "Sorcery", "{1}{U}", { oracleText: "Draw a card." }), "hand");
    const three = toZone(s, opp, card("Three Drop", "Sorcery", "{2}{U}", { oracleText: "Draw a card." }), "hand");
    const xs = toZone(s, opp, card("Test Blast", "Sorcery", "{X}{R}", { oracleText: "Test Blast deals X damage to any target." }), "hand");
    expect(castProblem(s, opp, two)).toMatch(/even mana values/);
    expect(castProblem(s, opp, three) ?? "").not.toMatch(/even mana values/);
    expect(castProblem(s, opp, xs, [{ kind: "player", id: ap }], undefined, undefined, undefined, 2) ?? "").not.toMatch(/even mana values/);
    expect(castProblem(s, opp, xs, [{ kind: "player", id: ap }], undefined, undefined, undefined, 1)).toMatch(/even mana values/);
    const mine = toZone(s, ap, card("My Two Drop", "Sorcery", "{1}{U}", { oracleText: "Draw a card." }), "hand");
    expect(castProblem(s, ap, mine) ?? "").not.toMatch(/even mana values/);
    // Blocking: a 2-drop can't, a 3-drop can; X is 0 on the battlefield, so a {X}{G} creature can.
    const attacker = putOnBattlefield(s, ap, ox);
    s.objects[attacker]!.attacking = opp;
    const evenB = putOnBattlefield(s, opp, bear());
    const oddB = putOnBattlefield(s, opp, card("Test Elk", "Creature — Elk", "{2}{G}", { power: "2", toughness: "2" }));
    const xB = putOnBattlefield(s, opp, card("Test Hydra", "Creature — Hydra", "{X}{G}", { power: "0", toughness: "0" }));
    s.objects[xB]!.counters["+1/+1"] = 3;
    expect(blockProblem(s, s.objects[evenB]!, s.objects[attacker]!)).toMatch(/can't block/);
    expect(blockProblem(s, s.objects[oddB]!, s.objects[attacker]!)).toBeNull();
    expect(blockProblem(s, s.objects[xB]!, s.objects[attacker]!)).toBeNull();
  });

  it("Tetsuko Umezawa: creatures with power or toughness 1 or less can't be blocked", () => {
    const { s, ap, opp } = setup([]);
    const t = putOnBattlefield(s, ap, tetsuko);
    const wall = putOnBattlefield(s, ap, card("Test Wall", "Creature — Wall", "{1}", { power: "3", toughness: "1" }));
    const big = putOnBattlefield(s, ap, ox);
    const blocker = putOnBattlefield(s, opp, ox);
    for (const id of [t, wall, big]) s.objects[id]!.attacking = opp;
    expect(blockProblem(s, s.objects[blocker]!, s.objects[t]!)).toMatch(/can't be blocked/);
    expect(blockProblem(s, s.objects[blocker]!, s.objects[wall]!)).toMatch(/can't be blocked/);
    expect(blockProblem(s, s.objects[blocker]!, s.objects[big]!)).toBeNull();
  });

  it("Run Away Together: two creatures of different players go back to their owners' hands; not two of one player", () => {
    const { s: s0, ap, opp, ids } = setup([runAway]);
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const mine2 = putOnBattlefield(s0, ap, bear({ name: "My Other Bear" }));
    const theirs = putOnBattlefield(s0, opp, ox);
    expect(planCast(s0, ap, ids[0]!, [target(mine), target(mine2)])).toBeNull();
    const s = run(s0, planCast(s0, ap, ids[0]!, [target(mine), target(theirs)]));
    expect(s.players[ap]!.hand).toContain(mine);
    expect(s.players[opp]!.hand).toContain(theirs);
  });

  it("Run Away Together: if both end up with one controller, both targets are illegal", () => {
    const { s: s0, ap, opp, ids } = setup([runAway]);
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const theirs = putOnBattlefield(s0, opp, ox);
    let s = planCast(s0, ap, ids[0]!, [target(mine), target(theirs)])!.reduce((x, y) => act(x, y), s0);
    // Gained control in response.
    s.objects[theirs]!.controller = ap;
    invalidateCharacteristics(s);
    s = settle(s);
    expect(s.objects[mine]!.zone).toBe("battlefield");
    expect(s.objects[theirs]!.zone).toBe("battlefield");
  });
});
