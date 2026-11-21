// Lane B round B287: Mimeoplasm, Revered One's "As ~ enters, exile up to X creature cards from your graveyard. It enters
// with three +1/+1 counters on it for each creature card exiled this way." (a choice as it enters, CR 614.1c, 614.12a; X
// as it was cast, CR 107.3m) and "{2}: ~ becomes a copy of target creature card exiled with it, except it's 0/0 and has
// this ability." (the cards its replacement exiled, CR 607.2b; a copy effect, CR 707.9b, its counters kept, CR 122).

import { describe, expect, it } from "vitest";
import { act, setup } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { putOnBattlefield } from "./helpers";

// Real card data (Scryfall).
const mimeoplasmReveredOne = (): CardDef => ({"oracleId":"2b8c2882-dbca-466a-a0af-dd1d65edfe7c","name":"Mimeoplasm, Revered One","manaCost":"{X}{B}{G}{U}","cmc":3,"typeLine":"Legendary Creature — Ooze","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Ooze"],"oracleText":"As Mimeoplasm enters, exile up to X creature cards from your graveyard. It enters with three +1/+1 counters on it for each creature card exiled this way.\n{2}: Mimeoplasm becomes a copy of target creature card exiled with it, except it's 0/0 and has this ability.","power":"0","toughness":"0","colors":["B","G","U"],"colorIdentity":["B","G","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/4/34e4c342-dc22-4e9c-81fc-a691ae9e21c1.jpg?1783907855","artUrl":"https://cards.scryfall.io/art_crop/front/3/4/34e4c342-dc22-4e9c-81fc-a691ae9e21c1.jpg?1783907855","commanderLegal":"legal","set":"dft","releasedAt":"2025-02-14","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const serraAngel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const tgt = (id: string): TargetChoice => ({ kind: "object", id }) as TargetChoice;
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
/** A fresh copy of `def` in `zone` of `pid`. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const choose = (s: GameState, pid: PlayerId, choice: string) => settle(act(s, { type: "chooseOption", player: pid, choice }));
const options = (s: GameState) => [...(s.pending as { options: string[] }).options].sort();
/** Mimeoplasm cast for X with three creature cards in the graveyard and a Lightning Bolt. */
const cast = (x: number) => {
  const { s: s0, ap, ids, opp } = setup([mimeoplasmReveredOne()]);
  const [b, g, a, l] = [into(s0, ap, grizzlyBears(), "graveyard"), into(s0, ap, hillGiant(), "graveyard"), into(s0, ap, serraAngel(), "graveyard"), into(s0, ap, lightningBolt(), "graveyard")];
  const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, x)));
  return { s, ap, opp, m: ids[0]!, b, g, a, l };
};

describe("Mimeoplasm, Revered One", () => {
  it("compiles", () => expect(isFullySupported(mimeoplasmReveredOne())).toBe(true));

  it("X 2: up to two creature cards (not the instant), then three +1/+1 counters for each one exiled", () => {
    let { s, ap, m, b, g, a, l } = cast(2);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "exileFromYard", objectId: m });
    expect(options(s)).toEqual([b, g, a, "done"].sort());
    s = choose(s, ap, a);
    expect(options(s)).toEqual([b, g, "done"].sort());
    s = choose(s, ap, g);
    // Two chosen: nothing more to ask.
    expect(s.pending).toBeFalsy();
    expect([s.objects[a]!.zone, s.objects[g]!.zone, s.objects[b]!.zone, s.objects[l]!.zone]).toEqual(["exile", "exile", "graveyard", "graveyard"]);
    expect(s.objects[m]!.zone).toBe("battlefield");
    expect(s.objects[m]!.counters["+1/+1"]).toBe(6);
    expect(pt(s, m)).toBe("6/6");
  });

  it("up to: one and done is three counters; none is a 0/0 that dies (CR 704.5f)", () => {
    let { s, ap, m, b, g } = cast(3);
    s = choose(s, ap, b);
    s = choose(s, ap, "done");
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.objects[g]!.zone).toBe("graveyard");
    expect(pt(s, m)).toBe("3/3");
    let t = cast(2);
    t.s = choose(t.s, t.ap, "done");
    expect(t.s.objects[t.b]!.zone).toBe("graveyard");
    expect(t.s.objects[t.m]!.zone).toBe("graveyard");
  });

  it("X 0 asks nothing and exiles nothing (CR 107.3m)", () => {
    const { s, m, b } = cast(0);
    expect(s.pending).toBeFalsy();
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[m]!.zone).toBe("graveyard");
  });

  it("{2}: becomes a copy of a card it exiled, 0/0 with its counters, and keeps the ability to copy the other one", () => {
    let { s, ap, m, b, g, a } = cast(2);
    s = choose(s, ap, a);
    s = choose(s, ap, g);
    // Only the cards it exiled are targets: not the Bears still in the graveyard.
    const plan = planActivate(s, ap, m, 0, [tgt(a)]);
    expect(planActivate(s, ap, m, 0, [tgt(b)])).toBeNull();
    s = settle(run(s, plan));
    expect(characteristics(s, s.objects[m]!).name).toBe("Serra Angel");
    expect(characteristics(s, s.objects[m]!).keywords).toEqual(expect.arrayContaining(["Flying", "Vigilance"]));
    // 0/0 plus six +1/+1 counters (CR 707.9b, 122).
    expect(pt(s, m)).toBe("6/6");
    // It has this ability: the Hill Giant next, still a card exiled with it.
    s = settle(run(s, planActivate(s, ap, m, 0, [tgt(g)])));
    expect(characteristics(s, s.objects[m]!).name).toBe("Hill Giant");
    expect(characteristics(s, s.objects[m]!).keywords).not.toContain("Flying");
    expect(pt(s, m)).toBe("6/6");
    expect(s.objects[a]!.zone).toBe("exile");
  });

  it("a bot casts it with no more X than its creature cards in the graveyard and exiles them", () => {
    const { s: s0, ap, ids } = setup([mimeoplasmReveredOne()]);
    const [b, g] = [into(s0, ap, grizzlyBears(), "graveyard"), into(s0, ap, hillGiant(), "graveyard")];
    let s = s0;
    for (let i = 0; i < 60 && (s.objects[ids[0]!]!.zone !== "battlefield" || s.pending || s.stack.length); i++) {
      const who = s.pending ? (s.pending as { player: PlayerId }).player : waitingOn(s)!;
      const acts = botActions(s, who);
      if (!acts.length) break;
      for (const x of acts) s = act(s, x);
    }
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect([s.objects[b]!.zone, s.objects[g]!.zone]).toEqual(["exile", "exile"]);
    expect(pt(s, ids[0]!)).toBe("6/6");
  });
});
