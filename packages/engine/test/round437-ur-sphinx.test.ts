// Round 437 (Lane A): The Ur-Sphinx ("Whenever one or more Sphinxes you control attack, each player mills that many cards.
// For each player, you may cast a card that player milled this way without paying its mana cost."; CR 608.2g, 118.9,
// 400.7, rulings: cast while the ability resolves, timing ignored).

import { describe, expect, it } from "vitest";
import { act, bear, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const sphinx = (): CardDef => ({"oracleId":"4a3fdb8e-4699-4bd9-84e6-3cc7fea0e1ef","name":"The Ur-Sphinx","manaCost":"{6}{W}{U}{B}","cmc":9,"typeLine":"Legendary Creature — Sphinx Avatar","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Sphinx","Avatar"],"oracleText":"Eminence — As long as The Ur-Sphinx is in the command zone or on the battlefield, other Sphinx spells you cast cost {1} less to cast.\nFlying\nWhenever one or more Sphinxes you control attack, each player mills that many cards. For each player, you may cast a card that player milled this way without paying its mana cost.","power":"10","toughness":"10","colors":["B","U","W"],"colorIdentity":["B","U","W"],"keywords":["Flying","Eminence","Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/d/9/d9e9d9a8-86c2-4e58-b818-466247725259.jpg?1789644369","artUrl":"https://cards.scryfall.io/art_crop/front/d/9/d9e9d9a8-86c2-4e58-b818-466247725259.jpg?1789644369","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const finalWord = (): CardDef => ({"oracleId":"d4246e4d-390d-4925-a5a8-89cd096a237c","name":"Sphinx of the Final Word","manaCost":"{5}{U}{U}","cmc":7,"typeLine":"Creature — Sphinx","supertypes":[],"types":["Creature"],"subtypes":["Sphinx"],"oracleText":"This spell can't be countered.\nFlying\nHexproof (This creature can't be the target of spells or abilities your opponents control.)\nInstant and sorcery spells you control can't be countered.","power":"5","toughness":"5","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Hexproof"],"imageUrl":"https://cards.scryfall.io/normal/front/8/6/866f92a3-2738-4e0f-adda-3ff9227dc17a.jpg?1783937917","artUrl":"https://cards.scryfall.io/art_crop/front/8/6/866f92a3-2738-4e0f-adda-3ff9227dc17a.jpg?1783937917","commanderLegal":"legal","set":"ogw","releasedAt":"2016-01-22","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const counterspell = (): CardDef => ({"oracleId":"cc187110-1148-4090-bbb8-e205694a39f5","name":"Counterspell","manaCost":"{U}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/c/0c9a7cb0-5bff-48ff-b620-2838816ac9b5.jpg?1783937618","artUrl":"https://cards.scryfall.io/art_crop/front/0/c/0c9a7cb0-5bff-48ff-b620-2838816ac9b5.jpg?1783937618","commanderLegal":"legal","set":"ema","releasedAt":"2016-06-10","rarity":"common","layout":"normal","gameChanger":false} as CardDef);

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

/** The Ur-Sphinx (and, with `two`, Sphinx of the Final Word) attack the next player; the trigger has milled. */
const attack = (two: boolean) => {
  const { s: s0, ap } = setup([]);
  const order = s0.turnOrder;
  const [p1, p2, p3] = [1, 2, 3].map((i) => order[(order.indexOf(ap) + i) % 4]!);
  const ur = putOnBattlefield(s0, ap, sphinx());
  const fw = two ? putOnBattlefield(s0, ap, finalWord()) : undefined;
  const mine = onTop(s0, ap, [divination(), counterspell(), divination()]);
  const theirs = onTop(s0, p1!, [bolt(), forest, bolt()]);
  const third = onTop(s0, p2!, [bear(), forest, bear()]);
  const fourth = onTop(s0, p3!, [forest, forest, forest]);
  // A card already in that player's graveyard wasn't milled this way.
  const old = putOnBattlefield(s0, p1!, divination());
  s0.battlefield.splice(s0.battlefield.indexOf(old), 1);
  s0.objects[old]!.zone = "graveyard";
  s0.players[p1!]!.graveyard.push(old);
  invalidateCharacteristics(s0);
  let s = passUntil(s0, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: [ur, ...(fw ? [fw] : [])].map((attacker) => ({ attacker, defender: p1! })) });
  s = until(s, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "castFromAmong", ap);
  return { s, ap, p1: p1!, mine, theirs, third, fourth, old };
};

describe("The Ur-Sphinx", () => {
  it("is fully supported", () => {
    expect(isFullySupported(sphinx())).toBe(true);
  });

  it("two Sphinxes attack: each player mills two; you cast one milled card of each player's for free", () => {
    let { s, ap, p1, mine, theirs, third, fourth, old } = attack(true);
    // Two cards from each library.
    for (const id of [mine[0], mine[1], theirs[0], theirs[1], third[0], third[1], fourth[0], fourth[1]]) expect(zone(s, id!)).toBe("graveyard");
    for (const id of [mine[2], theirs[2], third[2], fourth[2]]) expect(zone(s, id!)).toBe("library");
    const pend = s.pending as Opt;
    // Counterspell has nothing to target, lands can't be cast, the old card wasn't milled.
    expect([...pend.options].sort()).toEqual([mine[0]!, theirs[0]!, third[0]!, "none"].sort());
    expect(pend.options).not.toContain(old);
    const tapped = s.battlefield.filter((id) => s.objects[id]!.tapped).length;
    const hand = s.players[ap]!.hand.length;
    s = act(s, { type: "chooseOption", player: ap, choice: mine[0]! });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: mine[0] });
    s = act(s, { type: "castSpell", player: ap, objectId: mine[0]! });
    s = until(s, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "castFromAmong", ap);
    // One of yours is cast: the other players' are left.
    expect([...(s.pending as Opt).options].sort()).toEqual([theirs[0]!, third[0]!, "none"].sort());
    s = act(s, { type: "chooseOption", player: ap, choice: theirs[0]! });
    s = act(s, { type: "castSpell", player: ap, objectId: theirs[0]!, targets: [{ kind: "player", id: p1 }] });
    s = until(s, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "castFromAmong", ap);
    expect([...(s.pending as Opt).options].sort()).toEqual([third[0]!, "none"].sort());
    s = act(s, { type: "chooseOption", player: ap, choice: third[0]! });
    s = act(s, { type: "castSpell", player: ap, objectId: third[0]! });
    const life = s.players[p1]!.life;
    s = until(s, (x) => !x.stack.length && !x.triggerQueue.length && !x.pending, ap);
    // Free: no land tapped for them.
    expect(s.battlefield.filter((id) => s.objects[id]!.tapped).length).toBe(tapped);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(s.players[p1]!.life).toBe(life - 3);
    // Cast by you, the creature is yours; the cards keep their owners (CR 108.3).
    expect(zone(s, third[0]!)).toBe("battlefield");
    expect(s.objects[third[0]!]!.controller).toBe(ap);
    expect(zone(s, theirs[0]!)).toBe("graveyard");
    expect(s.players[p1]!.graveyard).toContain(theirs[0]!);
  });

  it("one Sphinx attacks: each player mills one", () => {
    const { s, mine, theirs, third, fourth } = attack(false);
    for (const id of [mine[0], theirs[0], third[0], fourth[0]]) expect(zone(s, id!)).toBe("graveyard");
    for (const id of [mine[1], theirs[1], third[1], fourth[1]]) expect(zone(s, id!)).toBe("library");
    expect([...(s.pending as Opt).options].sort()).toEqual([mine[0]!, theirs[0]!, third[0]!, "none"].sort());
  });

  it("casting none: the milled cards stay in their graveyards", () => {
    let { s, ap, mine, theirs, third } = attack(true);
    s = act(s, { type: "chooseOption", player: ap, choice: "none" });
    s = until(s, (x) => !x.stack.length && !x.triggerQueue.length && !x.pending, ap);
    for (const id of [mine[0], theirs[0], third[0]]) expect(zone(s, id!)).toBe("graveyard");
  });

  it("a bot casts what it can and finishes the trigger", () => {
    let { s, ap } = attack(true);
    s = until(s, (x) => !x.stack.length && !x.triggerQueue.length && !x.pending && x.step !== "declareAttackers");
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.graveyard.length).toBeGreaterThan(0);
  });
});
