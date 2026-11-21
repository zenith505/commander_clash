// Lane B round B279: Alaundo the Seer ("{T}: Draw a card, then exile a card from your hand and put a number of time counters
// on it equal to its mana value. It gains "When the last time counter is removed from this card, if it's exiled, you may cast
// it without paying its mana cost. If you cast a creature spell this way, it gains haste until end of turn." Then remove a
// time counter from each other card you own in exile."; CR 113.6, 400.7, 400.7a, 603.4, 608.2g, rulings).

import { describe, expect, it } from "vitest";
import { act, bear, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions } from "../src/bot";
import { applyAction, characteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const alaundo = (): CardDef => ({"oracleId":"1e048c15-50d6-4313-880a-e04348952a51","name":"Alaundo the Seer","manaCost":"{2}{G}{U}","cmc":4,"typeLine":"Legendary Creature — Human Shaman","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Shaman"],"oracleText":"{T}: Draw a card, then exile a card from your hand and put a number of time counters on it equal to its mana value. It gains \"When the last time counter is removed from this card, if it's exiled, you may cast it without paying its mana cost. If you cast a creature spell this way, it gains haste until end of turn.\" Then remove a time counter from each other card you own in exile.","power":"3","toughness":"5","colors":["G","U"],"colorIdentity":["G","U"],"keywords":[],"layout":"normal"}) as CardDef;
const riftBolt = (): CardDef => ({"oracleId":"2b8afa9f-4236-4c02-a8d5-3c145caecfd6","name":"Rift Bolt","manaCost":"{2}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Rift Bolt deals 3 damage to any target.\nSuspend 1—{R} (Rather than cast this card from your hand, you may pay {R} and exile it with a time counter on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost.)","colors":["R"],"colorIdentity":["R"],"keywords":["Suspend"],"layout":"normal"}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const forest = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"layout":"normal"}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && !s.over && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
/** `id` (in `pid`'s hand) moved to exile with `n` time counters, as if suspended. */
const exileWith = (s: GameState, pid: PlayerId, id: string, n: number) => {
  const p = s.players[pid]!;
  p.hand.splice(p.hand.indexOf(id), 1);
  p.exile.push(id);
  const o = s.objects[id]!;
  o.zone = "exile";
  o.zoneChanges = (o.zoneChanges ?? 0) + 1;
  o.counters.time = n;
};
/** Activates Alaundo and answers its exile with `pick`; stops at the next question or an empty stack. */
const activate = (s: GameState, pid: PlayerId, al: string, pick: string) => {
  s = settle(run(s, planActivate(s, pid, al, 0)));
  expect(s.pending).toMatchObject({ kind: "discard", player: pid, exile: true });
  return settle(act(s, { type: "discard", player: pid, objectIds: [pick] }));
};

describe("Alaundo the Seer", () => {
  it("is supported", () => {
    expect(isFullySupported(alaundo())).toBe(true);
    expect(isFullySupported(riftBolt())).toBe(true);
  });

  it("draws, exiles the chosen card with its mana value in time counters, and takes one off each other card you own in exile", () => {
    const { s: s0, ap, ids } = setup([bolt(), riftBolt(), bear()]);
    const al = putOnBattlefield(s0, ap, alaundo());
    // Rift Bolt suspended with two time counters; Grizzly Bears exiled with three (not suspended: no upkeep removes them).
    exileWith(s0, ap, ids[1]!, 2);
    exileWith(s0, ap, ids[2]!, 3);
    const hand = s0.players[ap]!.hand.length;
    let s = activate(s0, ap, al, ids[0]!);
    expect(s.objects[al]!.tapped).toBe(true);
    // Drew one, exiled one.
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(zone(s, ids[0]!)).toBe("exile");
    // The card it exiled keeps its counter; the others lose one each.
    expect(s.objects[ids[0]!]!.counters.time).toBe(1);
    expect(s.objects[ids[1]!]!.counters.time).toBe(1);
    expect(s.objects[ids[2]!]!.counters.time).toBe(2);
    expect(s.pending).toBeNull();
    expect(s.stack).toHaveLength(0);
  });

  it("the last time counter removed lets you cast the card free as the trigger resolves; Lightning Bolt hits an opponent", () => {
    const { s: s0, ap, ids, opp } = setup([bolt(), forest()]);
    const al = putOnBattlefield(s0, ap, alaundo());
    let s = activate(s0, ap, al, ids[0]!);
    expect(s.objects[ids[0]!]!.counters.time).toBe(1);
    // Next turn, Alaundo again: the Bolt loses its last counter, and its trigger asks.
    s = passUntil(passUntil(s, "upkeep", opp), "main1", ap);
    const life = s.players[opp]!.life;
    s = activate(s, ap, al, ids[1]!);
    expect(zone(s, ids[1]!)).toBe("exile");
    // A land has mana value 0: no counters (rulings), so its trigger never happens.
    expect(s.objects[ids[1]!]!.counters.time ?? 0).toBe(0);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: ids[0], hasteEot: true });
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life - 3);
  });

  it("a creature cast this way gains haste until end of turn; declined, the card stays in exile", () => {
    const { s: s0, ap, ids, opp } = setup([bear({ name: "Hasty Bears" }), bear({ name: "Slow Bears" }), forest(), forest()]);
    const al = putOnBattlefield(s0, ap, alaundo());
    // Two creature cards already exiled by Alaundo, one counter left on each.
    let s = activate(s0, ap, al, ids[0]!);
    s.objects[ids[0]!]!.counters.time = 1;
    s = passUntil(passUntil(s, "upkeep", opp), "main1", ap);
    s = activate(s, ap, al, ids[2]!);
    // Hasty Bears: cast free, and it can attack this turn.
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: ids[0] });
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(characteristics(s, s.objects[ids[0]!]!).keywords).toContain("Haste");
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: ids[0]!, defender: opp }] });
    expect(s.objects[ids[0]!]!.attacking).toBe(opp);
    // Its haste ends with the turn.
    s = passUntil(s, "upkeep", opp);
    expect(characteristics(s, s.objects[ids[0]!]!).keywords).not.toContain("Haste");
    // Slow Bears: exiled the same way, then declined: it stays exiled, with no counters.
    s = passUntil(s, "main1", ap);
    s = activate(s, ap, al, ids[1]!);
    s.objects[ids[1]!]!.counters.time = 1;
    s = passUntil(passUntil(s, "upkeep", opp), "main1", ap);
    s = activate(s, ap, al, ids[3]!);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: ids[1] });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(zone(s, ids[1]!)).toBe("exile");
    expect(s.objects[ids[1]!]!.counters.time ?? 0).toBe(0);
  });

  it("a suspended card that Alaundo exiled triggers both: suspend's cast and Alaundo's, the second finding it gone", () => {
    const { s: s0, ap, ids, opp } = setup([riftBolt(), forest()]);
    const al = putOnBattlefield(s0, ap, alaundo());
    let s = activate(s0, ap, al, ids[0]!);
    // Rift Bolt has suspend of its own, so it's suspended now: its upkeep removes its last counter (three, set to one).
    expect(s.objects[ids[0]!]!.counters.time).toBe(3);
    s.objects[ids[0]!]!.counters.time = 1;
    s = passUntil(s, "upkeep", opp);
    s = passUntil(s, "upkeep", ap);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: ids[0] });
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.pending).toBeNull();
  });

  it("a bot activates it and casts what comes off", () => {
    const { s: s0, ap, ids } = setup([bolt()]);
    const al = putOnBattlefield(s0, ap, alaundo());
    // Only the Bolt in hand, no commander.
    const p = s0.players[ap]!;
    for (const id of p.hand.filter((h) => h !== ids[0]!)) {
      p.hand.splice(p.hand.indexOf(id), 1);
      s0.objects[id]!.zone = "library";
      p.library.push(id);
    }
    p.command.splice(0);
    let s = s0;
    const exiled = (x: GameState) => x.players[ap]!.exile.filter((id) => x.objects[id]!.alaundoCast !== undefined);
    for (let i = 0; i < 600 && !exiled(s).length && !s.over; i++) {
      const acts = botActions(s, waitingOn(s)!);
      if (!acts.length) break;
      for (const a of acts) s = act(s, a);
    }
    // Within a round of turns it drew a card and exiled one from its hand with Alaundo.
    expect(exiled(s)).toHaveLength(1);
  });
});
