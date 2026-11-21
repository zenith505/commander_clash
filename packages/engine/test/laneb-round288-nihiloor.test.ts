// Lane B round B288: Nihiloor's "When ~ enters, for each opponent, tap up to one untapped creature you control. When you
// do, gain control of target creature that player controls with power less than or equal to the tapped creature's power
// for as long as you control ~." (one reflexive trigger for each creature tapped, CR 603.12; the power checked as the
// target is chosen and as it resolves, rulings; control while you control ~, CR 611.2b) and "Whenever you attack with a
// creature an opponent owns, you gain 2 life and that player loses 2 life." (CR 508.3c).

import { describe, expect, it } from "vitest";
import { act, forest, passUntil, putOnBattlefield, setup, swamp } from "./helpers";
import { botActions, controllerOf, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const nihiloor = (): CardDef => ({"oracleId":"148271de-3351-41a1-bcf5-3ecaadc51540","name":"Nihiloor","manaCost":"{2}{W}{U}{B}","cmc":5,"typeLine":"Legendary Creature — Horror","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Horror"],"oracleText":"When Nihiloor enters, for each opponent, tap up to one untapped creature you control. When you do, gain control of target creature that player controls with power less than or equal to the tapped creature's power for as long as you control Nihiloor.\nWhenever you attack with a creature an opponent owns, you gain 2 life and that player loses 2 life.","power":"3","toughness":"5","colors":["B","U","W"],"colorIdentity":["B","U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/6/a652ac92-4e61-45ec-866e-baafefd355e5.jpg?1783926238","artUrl":"https://cards.scryfall.io/art_crop/front/a/6/a652ac92-4e61-45ec-866e-baafefd355e5.jpg?1783926238","commanderLegal":"legal","set":"afc","releasedAt":"2021-07-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const serraAngel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const giantGrowth = (): CardDef => ({"oracleId":"5748ebf1-24e3-499d-ab7c-c2cebd462a24","name":"Giant Growth","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +3/+3 until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const murder = (): CardDef => ({"oracleId":"938b4e2c-88d9-4637-bc00-e228920c9a78","name":"Murder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const unsummon = (): CardDef => ({"oracleId":"837182db-1bf3-4a2c-bd01-1af9d9873561","name":"Unsummon","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Return target creature to its owner's hand.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddad9f16-52d5-49de-82b0-b1a5294a9c44.jpg?1789556722","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddad9f16-52d5-49de-82b0-b1a5294a9c44.jpg?1789556722","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

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
const pick = (s: GameState, pid: PlayerId, ids: string[]) => settle(act(s, { type: "pickPermanents", player: pid, ids }));
const aim = (s: GameState, pid: PlayerId, id: string | null) => act(s, { type: "chooseTargets", player: pid, targets: [id ? tgt(id) : { kind: "none" }] as TargetChoice[] });

/**
 * Nihiloor cast with Hill Giant (3/3), Grizzly Bears (2/2) and Serra Angel (4/4) of ours; the first opponent has a Serra
 * Angel and Grizzly Bears, the second a Hill Giant, the third nothing.
 */
const cast = () => {
  const { s: s0, ap, ids } = setup([nihiloor()]);
  const opps = [1, 2, 3].map((k) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + k) % 4]!) as [PlayerId, PlayerId, PlayerId];
  const mine = { giant: putOnBattlefield(s0, ap, hillGiant()), bears: putOnBattlefield(s0, ap, grizzlyBears()), angel: putOnBattlefield(s0, ap, serraAngel()) };
  const theirs = { angel: putOnBattlefield(s0, opps[0], serraAngel()), bears: putOnBattlefield(s0, opps[0], grizzlyBears()), giant: putOnBattlefield(s0, opps[1], hillGiant()) };
  const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
  return { s, ap, opps, n: ids[0]!, mine, theirs };
};

describe("Nihiloor", () => {
  it("compiles", () => expect(isFullySupported(nihiloor())).toBe(true));

  it("asks for each opponent in turn order, a different untapped creature each, then taps them together", () => {
    let { s, ap, opps, n, mine } = cast();
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "tap", nihiloor: opps[0], count: 1, min: 0 });
    // Nihiloor itself is an untapped creature you control too.
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([mine.giant, mine.bears, mine.angel, n].sort());
    s = pick(s, ap, [mine.angel]);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", nihiloor: opps[1] });
    // Not tapped yet, but already chosen: not offered again.
    expect(s.objects[mine.angel]!.tapped).toBe(false);
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([mine.giant, mine.bears, n].sort());
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: [mine.angel] })).toThrow();
    s = pick(s, ap, [mine.giant]);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", nihiloor: opps[2] });
    // None for the third opponent (they have no creatures, but tapping one would still be allowed).
    s = pick(s, ap, []);
    expect([s.objects[mine.angel]!.tapped, s.objects[mine.giant]!.tapped, s.objects[mine.bears]!.tapped]).toEqual([true, true, false]);
    // Two reflexive triggers, one for each creature tapped.
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
  });

  it("each trigger takes a creature of its opponent with power up to the tapped creature's, for as long as you control Nihiloor", () => {
    let { s, ap, opps, n, mine, theirs } = cast();
    s = pick(s, ap, [mine.angel]);
    s = pick(s, ap, [mine.giant]);
    s = pick(s, ap, []);
    // Both triggers wait for targets, in the order its controller puts them on the stack.
    for (let i = 0; i < 2; i++) {
      expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
      const what = (s.pending as { description: string }).description;
      if (what.includes(s.players[opps[0]]!.name)) {
        // Serra Angel (4/4) tapped: the opponent's Serra Angel (4) fits, not their Hill Giant (another player's).
        expect(() => aim(s, ap, theirs.giant)).toThrow();
        s = aim(s, ap, theirs.angel);
      } else {
        // Hill Giant (3/3) tapped: their Hill Giant (3) fits, not the first opponent's Serra Angel.
        expect(() => aim(s, ap, theirs.angel)).toThrow();
        s = aim(s, ap, theirs.giant);
      }
    }
    s = settle(s);
    expect(controllerOf(s, s.objects[theirs.angel]!)).toBe(ap);
    expect(controllerOf(s, s.objects[theirs.giant]!)).toBe(ap);
    expect(controllerOf(s, s.objects[theirs.bears]!)).toBe(opps[0]);
    // Nihiloor leaves: the control ends (CR 611.2b).
    s = settle(run(s, planCast(s, ap, putInHand(s, ap, unsummon()), [tgt(n)])));
    expect(s.objects[n]!.zone).toBe("hand");
    expect(controllerOf(s, s.objects[theirs.angel]!)).toBe(opps[0]);
    expect(controllerOf(s, s.objects[theirs.giant]!)).toBe(opps[1]);
  });

  it("a creature too big for the tapped one can't be targeted; the power is checked again as it resolves", () => {
    let { s, ap, opps, mine, theirs } = cast();
    s = pick(s, ap, [mine.bears]);
    s = pick(s, ap, []);
    s = pick(s, ap, []);
    // Grizzly Bears (2) tapped: the opponent's Serra Angel (4) is too big, their Bears (2) fits.
    expect(() => aim(s, ap, theirs.angel)).toThrow();
    s = aim(s, ap, theirs.bears);
    expect(s.stack.length).toBe(1);
    // Giant Growth on the target in response: 5 power now, more than the tapped Bears' 2, so the target is illegal and
    // the ability does nothing (CR 608.2b).
    putOnBattlefield(s, opps[0], forest);
    const gg = putInHand(s, opps[0], giantGrowth());
    for (let i = 0; i < 4 && waitingOn(s) !== opps[0]; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planCast(s, opps[0], gg, [tgt(theirs.bears)]));
    expect(s.stack.length).toBe(2);
    s = settle(s);
    expect(s.objects[gg]!.zone).toBe("graveyard");
    expect(controllerOf(s, s.objects[theirs.bears]!)).toBe(opps[0]);
  });

  it("with the tapped creature gone, its power as it last existed on the battlefield counts (rulings)", () => {
    let { s, ap, opps, mine, theirs } = cast();
    s = pick(s, ap, [mine.angel]);
    s = pick(s, ap, []);
    s = pick(s, ap, []);
    s = aim(s, ap, theirs.angel);
    // Murder on our tapped Serra Angel in response: still 4 as it last existed, so the opponent's Angel is taken.
    for (let i = 0; i < 3; i++) putOnBattlefield(s, opps[0], swamp);
    const m = putInHand(s, opps[0], murder());
    for (let i = 0; i < 4 && waitingOn(s) !== opps[0]; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planCast(s, opps[0], m, [tgt(mine.angel)]));
    s = settle(s);
    expect(s.objects[mine.angel]!.zone).toBe("graveyard");
    expect(controllerOf(s, s.objects[theirs.angel]!)).toBe(ap);
  });

  it("attacking with a creature an opponent owns: you gain 2 life and its owner loses 2; not for your own creatures", () => {
    let { s, ap, opps, mine, theirs } = cast();
    s = pick(s, ap, []);
    s = pick(s, ap, [mine.giant]);
    s = pick(s, ap, []);
    s = settle(aim(s, ap, theirs.giant));
    expect(controllerOf(s, s.objects[theirs.giant]!)).toBe(ap);
    // Not summoning sick for the test: controlled since an earlier turn.
    s.objects[theirs.giant]!.controlledSinceTurn = -1;
    const life = [s.players[ap]!.life, s.players[opps[1]]!.life, s.players[opps[0]]!.life];
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: theirs.giant, defender: opps[0] }, { attacker: mine.bears, defender: opps[0] }] });
    s = settle(s);
    expect(s.players[ap]!.life).toBe(life[0]! + 2);
    expect(s.players[opps[1]]!.life).toBe(life[1]! - 2);
    // The defending player loses nothing to it.
    expect(s.players[opps[0]]!.life).toBe(life[2]!);
  });

  it("a bot takes the most valuable creature it can, tapping the smallest creature that's big enough", () => {
    let { s, ap, opps, mine, theirs } = cast();
    for (let i = 0; i < 40 && (s.pending || s.stack.length || s.triggerQueue.length); i++) {
      const who = s.pending ? (s.pending as { player: PlayerId }).player : waitingOn(s)!;
      const acts = botActions(s, who);
      if (!acts.length) break;
      for (const x of acts) s = act(s, x);
    }
    // For the first opponent: their Serra Angel (4/4), our Serra Angel the only creature big enough. For the second:
    // their Hill Giant, our Hill Giant (the Angel taken).
    expect(controllerOf(s, s.objects[theirs.angel]!)).toBe(ap);
    expect(controllerOf(s, s.objects[theirs.giant]!)).toBe(ap);
    expect([s.objects[mine.angel]!.tapped, s.objects[mine.giant]!.tapped, s.objects[mine.bears]!.tapped]).toEqual([true, true, false]);
    expect(opps.length).toBe(3);
  });
});

/** A fresh copy of `def` in `pid`'s hand. */
function putInHand(s: GameState, pid: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
}
