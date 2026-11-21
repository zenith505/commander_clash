// Lane B round B283: Uvilda, Dean of Perfection ("{T}: You may exile an instant or sorcery card from your hand and put three
// refine counters on it. It gains "At the beginning of your upkeep, if this card is exiled, remove a refine counter from it"
// and "When the last refine counter is removed from this card, if it's exiled, you may cast it. It costs {4} less to cast
// this way.""; CR 113.6, 113.8, 400.7, 601.2f, 603.4, 608.2g and its rulings).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const uvilda = (): CardDef => ({"oracleId":"63c4915f-5ad9-468f-95c5-d44f1b71631e","name":"Uvilda, Dean of Perfection // Nassari, Dean of Expression","manaCost":"{2}{U}","cmc":3,"typeLine":"Legendary Creature — Djinn Wizard // Legendary Creature — Efreet Shaman","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Djinn","Wizard"],"oracleText":"{T}: You may exile an instant or sorcery card from your hand and put three refine counters on it. It gains \"At the beginning of your upkeep, if this card is exiled, remove a refine counter from it\" and \"When the last refine counter is removed from this card, if it's exiled, you may cast it. It costs {4} less to cast this way.\"","power":"2","toughness":"2","colors":["U"],"colorIdentity":["R","U"],"keywords":[],"layout":"modal_dfc","faces":[{"name":"Uvilda, Dean of Perfection","manaCost":"{2}{U}","typeLine":"Legendary Creature — Djinn Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Djinn","Wizard"],"oracleText":"{T}: You may exile an instant or sorcery card from your hand and put three refine counters on it. It gains \"At the beginning of your upkeep, if this card is exiled, remove a refine counter from it\" and \"When the last refine counter is removed from this card, if it's exiled, you may cast it. It costs {4} less to cast this way.\"","power":"2","toughness":"2","colors":["U"]},{"name":"Nassari, Dean of Expression","manaCost":"{3}{R}{R}","typeLine":"Legendary Creature — Efreet Shaman","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Efreet","Shaman"],"oracleText":"At the beginning of your upkeep, exile the top card of each opponent's library. Until end of turn, you may cast spells from among those exiled cards, and you may spend mana as though it were mana of any color to cast those spells.\nWhenever you cast a spell from exile, put a +1/+1 counter on Nassari.","power":"4","toughness":"4","colors":["R"]}]}) as CardDef;
const concentrate = (): CardDef => ({"oracleId":"a3d287ec-1a39-4f91-acf1-7c1d2c00ed89","name":"Concentrate","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw three cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;

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
/** Activates Uvilda and answers its "you may exile" with `pick` (none if left out). */
const refine = (s: GameState, pid: PlayerId, uv: string, pick?: string) => {
  s = settle(run(s, planActivate(s, pid, uv, 0)));
  expect(s.pending).toMatchObject({ kind: "searchLibrary", player: pid, min: 0, max: 1 });
  return settle(act(s, { type: "searchLibrary", player: pid, found: pick ? [pick] : [] }));
};
/** On to `pid`'s next upkeep, its triggers resolved (stops at a question). */
const nextUpkeep = (s: GameState, pid: PlayerId) => settle(passUntil(passUntil(s, "end"), "upkeep", pid));
const untapped = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && !s.objects[id]!.tapped).length;

describe("Uvilda, Dean of Perfection", () => {
  it("is supported", () => {
    expect(isFullySupported(uvilda())).toBe(true);
  });

  it("exiles the chosen instant or sorcery card from your hand with three refine counters; only those cards are offered", () => {
    const { s: s0, ap, ids } = setup([concentrate(), bolt()]);
    const uv = putOnBattlefield(s0, ap, uvilda());
    let s = settle(run(s0, planActivate(s0, ap, uv, 0)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 1 });
    // The hand's Forests and Bears aren't instants or sorceries.
    const offered = s.pending!.kind === "searchLibrary" ? s.pending!.cards : [];
    expect([...offered].sort()).toEqual([ids[0]!, ids[1]!].sort());
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ids[0]!] }));
    expect(s.objects[uv]!.tapped).toBe(true);
    expect(zone(s, ids[0]!)).toBe("exile");
    expect(s.objects[ids[0]!]!.counters.refine).toBe(3);
    expect(s.objects[ids[0]!]!.refined).toBe(s.objects[ids[0]!]!.zoneChanges ?? 0);
  });

  it("you may exile nothing", () => {
    const { s: s0, ap, ids } = setup([concentrate()]);
    const uv = putOnBattlefield(s0, ap, uvilda());
    const s = refine(s0, ap, uv);
    expect(zone(s, ids[0]!)).toBe("hand");
    expect(s.objects[uv]!.tapped).toBe(true);
  });

  it("each of your upkeeps removes one; opponents' don't; the last lets you cast it for {4} less, generic mana only", () => {
    const { s: s0, ap, ids, opp } = setup([concentrate()]);
    const uv = putOnBattlefield(s0, ap, uvilda());
    let s = refine(s0, ap, uv, ids[0]!);
    // The opponent's upkeep: nothing.
    s = settle(passUntil(passUntil(s, "end"), "upkeep", opp));
    expect(s.objects[ids[0]!]!.counters.refine).toBe(3);
    s = nextUpkeep(s, ap);
    expect(s.objects[ids[0]!]!.counters.refine).toBe(2);
    s = nextUpkeep(s, ap);
    expect(s.objects[ids[0]!]!.counters.refine).toBe(1);
    s = nextUpkeep(s, ap);
    expect(s.objects[ids[0]!]!.counters.refine ?? 0).toBe(0);
    // Cast now, in the upkeep (timing ignored, rulings), for {U}{U}: Concentrate's {2} comes off, not more.
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: ids[0], how: "paid", less: 4 });
    const before = untapped(s, ap);
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(before - untapped(s, ap)).toBe(2);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
  });

  it("a cheaper card costs only its colored mana: Divination for {U}", () => {
    const { s: s0, ap, ids } = setup([divination()]);
    const uv = putOnBattlefield(s0, ap, uvilda());
    let s = refine(s0, ap, uv, ids[0]!);
    s.objects[ids[0]!]!.counters.refine = 1;
    s = nextUpkeep(s, ap);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: ids[0] });
    const before = untapped(s, ap);
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(before - untapped(s, ap)).toBe(1);
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });

  it("declined, the card stays exiled with no refine counters, and nothing more happens to it", () => {
    const { s: s0, ap, ids, opp } = setup([bolt()]);
    const uv = putOnBattlefield(s0, ap, uvilda());
    let s = refine(s0, ap, uv, ids[0]!);
    s.objects[ids[0]!]!.counters.refine = 1;
    s = nextUpkeep(s, ap);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: ids[0] });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(zone(s, ids[0]!)).toBe("exile");
    expect(s.objects[ids[0]!]!.counters.refine ?? 0).toBe(0);
    s = nextUpkeep(s, ap);
    expect(s.pending).toBeNull();
    expect(zone(s, ids[0]!)).toBe("exile");
    expect(s.players[opp]!.life).toBe(s0.players[opp]!.life);
  });

  it("Lightning Bolt cast this way has its target chosen as it's cast", () => {
    const { s: s0, ap, ids, opp } = setup([bolt()]);
    const uv = putOnBattlefield(s0, ap, uvilda());
    let s = refine(s0, ap, uv, ids[0]!);
    s.objects[ids[0]!]!.counters.refine = 1;
    s = nextUpkeep(s, ap);
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 3);
  });

  it("a card that leaves exile is a new object without the abilities (CR 400.7): exiled again, no counter comes off", () => {
    const { s: s0, ap, ids } = setup([concentrate()]);
    const uv = putOnBattlefield(s0, ap, uvilda());
    let s = refine(s0, ap, uv, ids[0]!);
    // Some other effect moves it out of exile and back.
    s.objects[ids[0]!]!.zoneChanges = (s.objects[ids[0]!]!.zoneChanges ?? 0) + 2;
    s = nextUpkeep(s, ap);
    expect(s.objects[ids[0]!]!.counters.refine).toBe(3);
    expect(s.log.some((l) => /loses a refine counter/.test(l.text))).toBe(false);
  });
});
