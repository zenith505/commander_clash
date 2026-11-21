// Round 437 (Lane A): Nathan Drake, Treasure Hunter ("You may spend mana as though it were mana of any color to cast spells
// you don't own or to activate abilities of permanents you control but don't own." CR 609.4b, 108.3; "Whenever Nathan Drake
// attacks, exile the top card of each player's library. You may cast a spell from among those cards." CR 608.2g).

import { describe, expect, it } from "vitest";
import { act, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, planActivate, planCast, invalidateCharacteristics, isFullySupported, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const nathan = (): CardDef => ({"oracleId":"ed69b907-272c-4a87-a943-06aaad976fb1","name":"Nathan Drake, Treasure Hunter","manaCost":"{U}{B}{R}","cmc":3,"typeLine":"Legendary Creature — Human Rogue","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Rogue"],"oracleText":"First strike\nYou may spend mana as though it were mana of any color to cast spells you don't own or to activate abilities of permanents you control but don't own.\nWhenever Nathan Drake attacks, exile the top card of each player's library. You may cast a spell from among those cards.","power":"3","toughness":"2","colors":["B","R","U"],"colorIdentity":["B","R","U"],"keywords":["First strike"],"imageUrl":"https://cards.scryfall.io/normal/front/1/b/1bb5f991-4d05-48b2-ac8d-81fd9ef7f4bb.jpg?1783905127","artUrl":"https://cards.scryfall.io/art_crop/front/1/b/1bb5f991-4d05-48b2-ac8d-81fd9ef7f4bb.jpg?1783905127","commanderLegal":"legal","set":"sld","releasedAt":"2025-10-27","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const shivan = (): CardDef => ({"oracleId":"711eea87-0fa3-46e0-a42b-fa5a86455f04","name":"Shivan Dragon","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\n{R}: This creature gets +1/+0 until end of turn.","power":"5","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/2/9/294ca89d-549a-4302-9284-df5b4e833a69.jpg?1789446860","artUrl":"https://cards.scryfall.io/art_crop/front/2/9/294ca89d-549a-4302-9284-df5b4e833a69.jpg?1789446860","commanderLegal":"legal","set":"sld","releasedAt":"2026-08-31","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes (no blocks) until `done` holds; any question of `me`'s stops it, others' answered as the bots would. */
const until = (s: GameState, done: (s: GameState) => boolean, me?: PlayerId) => {
  for (let i = 0; i < 600 && !done(s); i++) {
    const pid = waitingOn(s)!;
    const p = s.pending;
    if (p && p.player === me && p.kind !== "declareBlockers") return s;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p) s = run(s, botActions(s, p.player));
    else s = act(s, { type: "passPriority", player: pid });
  }
  return s;
};
/** Cards of `defs` owned by `pid` put on top of their library, the first on top. */
const onTop = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  const ids = defs.map((d) => {
    const id = putOnBattlefield(s, pid, d);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    return id;
  });
  s.players[pid]!.library.unshift(...ids);
  invalidateCharacteristics(s);
  return ids;
};
type Opt = Extract<NonNullable<GameState["pending"]>, { kind: "chooseOption" }>;
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const name = (s: GameState, id: ObjectId) => s.cards[s.objects[id]!.cardId]!.name;
/** Every land `pid` controls but its Islands tapped: only blue mana left. */
const islandsOnly = (s: GameState, pid: PlayerId) => {
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land") && name(s, id) !== "Island") s.objects[id]!.tapped = true;
};

/** Nathan Drake attacks the next player with only Islands untapped; the trigger has exiled each top card. */
const attack = () => {
  const { s: s0, ap } = setup([]);
  const order = s0.turnOrder;
  const [p1, p2, p3] = [1, 2, 3].map((i) => order[(order.indexOf(ap) + i) % 4]!) as [PlayerId, PlayerId, PlayerId];
  const n = putOnBattlefield(s0, ap, nathan());
  const tops = [onTop(s0, ap, [bolt()])[0]!, onTop(s0, p1, [bolt()])[0]!, onTop(s0, p2, [divination()])[0]!, onTop(s0, p3, [forest])[0]!];
  islandsOnly(s0, ap);
  invalidateCharacteristics(s0);
  let s = passUntil(s0, "declareAttackers", ap);
  // The untap step is behind us: keep only the Islands untapped.
  islandsOnly(s, ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: n, defender: p1 }] });
  s = until(s, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "castFromAmong", ap);
  return { s, ap, p1, n, tops };
};

describe("Nathan Drake, Treasure Hunter", () => {
  it("is fully supported", () => {
    expect(isFullySupported(nathan())).toBe(true);
  });

  it("exiles each player's top card; you cast an opponent's Lightning Bolt paying blue mana as though it were red, and only one spell", () => {
    let { s, ap, p1, tops } = attack();
    const [myBolt, theirBolt, theirDiv, land] = tops as [ObjectId, ObjectId, ObjectId, ObjectId];
    for (const id of tops) expect(zone(s, id)).toBe("exile");
    // The land can't be cast (CR 305.1: a land is never a spell). Your own Bolt is offered, but it needs red mana: only another player's can be paid
    // for with blue as though it were red.
    expect([...(s.pending as Opt).options].sort()).toEqual([myBolt, theirBolt, theirDiv, "none"].sort());
    const own = act(structuredClone(s), { type: "chooseOption", player: ap, choice: myBolt });
    expect(planCast(own, ap, myBolt, [{ kind: "player", id: p1 }])).toBeNull();
    s = act(s, { type: "chooseOption", player: ap, choice: theirBolt });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: theirBolt, how: "paid" });
    const untapped = s.battlefield.filter((id) => name(s, id) === "Island" && !s.objects[id]!.tapped).length;
    s = run(s, planCast(s, ap, theirBolt, [{ kind: "player", id: p1 }]));
    // One spell only: no second choice.
    expect(s.pending?.kind === "chooseOption" && s.pending.what === "castFromAmong").toBe(false);
    const life = s.players[p1]!.life;
    s = until(s, (x) => !x.stack.length && !x.triggerQueue.length && !x.pending, ap);
    expect(s.battlefield.filter((id) => name(s, id) === "Island" && !s.objects[id]!.tapped).length).toBe(untapped - 1);
    expect(s.players[p1]!.life).toBe(life - 3);
    // Into its owner's graveyard; the others stay exiled.
    expect(s.players[p1]!.graveyard).toContain(theirBolt);
    for (const id of [myBolt, theirDiv, land]) expect(zone(s, id)).toBe("exile");
  });

  it("casting none: all four stay exiled", () => {
    let { s, ap, tops } = attack();
    s = act(s, { type: "chooseOption", player: ap, choice: "none" });
    s = until(s, (x) => !x.stack.length && !x.triggerQueue.length && !x.pending, ap);
    for (const id of tops) expect(zone(s, id)).toBe("exile");
  });

  it("an ability of a permanent you control but don't own, paid with blue mana as though it were red; not one you own", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, nathan());
    const theirs = putOnBattlefield(s0, opp, shivan());
    const mine = putOnBattlefield(s0, ap, shivan());
    // Gained control of (CR 108.4): still its owner's.
    s0.objects[theirs]!.controller = ap;
    for (const id of s0.battlefield) if (s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.types.includes("Land")) s0.objects[id]!.tapped = true;
    s0.players[ap]!.manaPool.U = 2;
    invalidateCharacteristics(s0);
    expect(s0.objects[theirs]!.owner).toBe(opp);
    const pump = (s: GameState, id: ObjectId) => {
      const plan = planActivate(s, ap, id, 0);
      if (!plan) return null;
      try {
        for (const x of plan) s = applyAction(s, x);
        return s;
      } catch {
        return null;
      }
    };
    const a = pump(structuredClone(s0), theirs);
    expect(a?.stack.length).toBe(1);
    expect(a!.players[ap]!.manaPool.U).toBe(1);
    const b = pump(structuredClone(s0), mine);
    expect(b === null || b.stack.length === 0).toBe(true);
    // Without Nathan Drake, not theirs either.
    const s1 = structuredClone(s0);
    const nd = s1.battlefield.find((id) => name(s1, id) === "Nathan Drake, Treasure Hunter")!;
    s1.battlefield.splice(s1.battlefield.indexOf(nd), 1);
    s1.objects[nd]!.zone = "graveyard";
    invalidateCharacteristics(s1);
    const c = pump(s1, theirs);
    expect(c === null || c.stack.length === 0).toBe(true);
  });

  it("a bot attacking with it finishes the trigger", () => {
    let { s } = attack();
    s = until(s, (x) => !x.stack.length && !x.triggerQueue.length && !x.pending && x.step !== "declareAttackers");
    expect(s.pending).toBeNull();
  });
});
