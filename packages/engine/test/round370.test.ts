// Round 370 (Lane A): a free spell as big as the life gained this turn (Bre of Clan Stoutarm), spells cast from exile made
// cheaper by the number of players attacked, and that many cards to cast this turn (Commander Liara Portyr), a look as deep
// as the creatures that convoked it (Knight-Errant of Eos) and a planeswalker that impulses after discarding its hand and
// searches graveyard and library for red spells to cast this turn (Chandra, Heart of Fire).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, invalidateCharacteristics, isFullySupported, manaValue, planActivate, planCast, spellCost, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions are answered as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes until `me` has a question of `kind`, other players' questions answered as the bots would (no attacks or blocks). */
const until = (s: GameState, me: PlayerId, kind: string, max = 3000) => {
  for (let i = 0; i < max; i++) {
    const p = s.pending;
    if (p?.player === me && p.kind === kind) return s;
    const who = waitingOn(s)!;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: who, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: who, blocks: [] });
    else if (p) for (const a of botActions(s, who)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: who });
  }
  throw new Error(`no ${kind} for ${me}`);
};
const moveTo = (zone: "graveyard" | "hand" | "library" | "exile") => (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const toYard = moveTo("graveyard");
const toHand = moveTo("hand");
const toLibrary = moveTo("library");
const toExile = moveTo("exile");
const tgt = (id: ObjectId) => ({ kind: "object" as const, id });
const costOf = (s: GameState, pid: PlayerId, id: ObjectId) => { const c = spellCost(s, pid, s.objects[id]!); return manaValue(c.cost) + c.extra; };
const others = (s: GameState, ap: PlayerId) => s.turnOrder.filter((p) => p !== ap);
const gained = (s: GameState, pid: PlayerId, n: number) => { ((s.turnLog ??= {}).lifeGained ??= {})[pid] = n; };

const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { cmc: 3, power: "3", toughness: "3" });
const giant = card("Test Giant", "Creature — Giant", "{3}{R}", { cmc: 4, power: "4", toughness: "4" });
const land = card("Test Land", "Land", "", { oracleText: "{T}: Add {C}." });
const murder = card("Test Murder", "Instant", "{B}", { cmc: 1, oracleText: "Destroy target creature." });
const shock = card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "Test Shock deals 2 damage to any target." });
const blaze = card("Test Blaze", "Sorcery", "{1}{R}", { cmc: 2, oracleText: "Test Blaze deals 3 damage to any target." });
const opt = card("Test Opt", "Instant", "{U}", { cmc: 1, oracleText: "Draw a card." });
const glance = card("Test Glance", "Sorcery", "{1}{G}", { cmc: 2, oracleText: "Draw a card." });

// Real oracle text (Scryfall).
const bre = (): CardDef => ({"oracleId":"59384481-3ca0-49dd-b94f-d3680b336f1e","name":"Bre of Clan Stoutarm","manaCost":"{2}{R}{W}","cmc":4,"typeLine":"Legendary Creature — Giant Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Giant","Warrior"],"oracleText":"{1}{W}, {T}: Another target creature you control gains flying and lifelink until end of turn.\nAt the beginning of your end step, if you gained life this turn, exile cards from the top of your library until you exile a nonland card. You may cast that card without paying its mana cost if the spell's mana value is less than or equal to the amount of life you gained this turn. Otherwise, put it into your hand.","power":"4","toughness":"4","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/1/013cefb7-a059-45c2-81b0-187f35aac4a2.jpg?1783904415","artUrl":"https://cards.scryfall.io/art_crop/front/0/1/013cefb7-a059-45c2-81b0-187f35aac4a2.jpg?1783904415","commanderLegal":"legal","set":"ecl","releasedAt":"2026-01-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const liara = (): CardDef => ({"oracleId":"fcc7ed01-ff64-4ffe-9b83-daa4132fd92d","name":"Commander Liara Portyr","manaCost":"{3}{R}{W}","cmc":5,"typeLine":"Legendary Creature — Human Soldier","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"Whenever you attack, spells you cast from exile this turn cost {X} less to cast, where X is the number of players being attacked. Exile the top X cards of your library. Until end of turn, you may cast spells from among those exiled cards.","power":"5","toughness":"3","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/c/6cb052fe-c834-4c72-a6b1-4cb64505e3ee.jpg?1783922629","artUrl":"https://cards.scryfall.io/art_crop/front/6/c/6cb052fe-c834-4c72-a6b1-4cb64505e3ee.jpg?1783922629","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const knight = (): CardDef => ({"oracleId":"4bd20d79-0861-494a-a8f2-f6ddb5088004","name":"Knight-Errant of Eos","manaCost":"{4}{W}","cmc":5,"typeLine":"Creature — Human Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"Convoke\nWhen this creature enters, look at the top six cards of your library. You may reveal up to two creature cards with mana value X or less from among them, where X is the number of creatures that convoked this creature. Put the revealed cards into your hand, then shuffle.","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Convoke"],"imageUrl":"https://cards.scryfall.io/normal/front/a/b/ab2ad652-2406-491a-9f22-23e974f943d7.jpg?1783917058","artUrl":"https://cards.scryfall.io/art_crop/front/a/b/ab2ad652-2406-491a-9f22-23e974f943d7.jpg?1783917058","commanderLegal":"legal","set":"mom","releasedAt":"2023-04-21","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const chandra = (): CardDef => ({"oracleId":"58ad45fc-b625-4484-8d49-ebc42db9040a","name":"Chandra, Heart of Fire","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Legendary Planeswalker — Chandra","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Chandra"],"oracleText":"+1: Discard your hand, then exile the top three cards of your library. Until end of turn, you may play cards exiled this way.\n+1: Chandra deals 2 damage to any target.\n−9: Search your graveyard and library for any number of red instant and/or sorcery cards, exile them, then shuffle. You may cast them this turn. Add six {R}.","loyalty":"5","colors":["R"],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/9/4/94e6a6bc-73ac-4000-967e-c37450665e03.jpg?1783930630","artUrl":"https://cards.scryfall.io/art_crop/front/9/4/94e6a6bc-73ac-4000-967e-c37450665e03.jpg?1783930630","commanderLegal":"legal","set":"m21","releasedAt":"2020-07-03","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;

describe("round 370: compiles", () => {
  it("every card of the round", () => supported(bre(), liara(), knight(), chandra()));
});

describe("Bre of Clan Stoutarm", () => {
  it("with 3 life gained this turn, a 3-mana-value card found may be cast free; the land before it stays exiled", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, bre());
    const o = toLibrary(s0, ap, ogre);
    const l = toLibrary(s0, ap, land);
    gained(s0, ap, 3);
    let s = passUntil(s0, "end", ap);
    s = until(s, ap, "castFree");
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: o, mv: { max: 3 } });
    s = settle(act(s, { type: "castSpell", player: ap, objectId: o }), ap);
    expect(s.objects[o]!.zone).toBe("battlefield");
    expect(s.objects[l]!.zone).toBe("exile");
  });

  it("with less life gained than its mana value, the card goes into your hand", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, bre());
    const o = toLibrary(s0, ap, ogre);
    gained(s0, ap, 2);
    let s = passUntil(s0, "end", ap);
    s = settle(s, ap);
    expect(s.pending?.kind === "castFree").toBe(false);
    expect(s.objects[o]!.zone).toBe("hand");
  });

  it("declined, the card goes into your hand (\"Otherwise\")", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, bre());
    const o = toLibrary(s0, ap, ogre);
    gained(s0, ap, 5);
    let s = passUntil(s0, "end", ap);
    s = until(s, ap, "castFree");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(s.objects[o]!.zone).toBe("hand");
  });

  it("with no life gained this turn it doesn't trigger (an intervening if, CR 603.4)", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, bre());
    const o = toLibrary(s0, ap, ogre);
    const s = settle(passUntil(s0, "end", ap), ap);
    expect(s.objects[o]!.zone).toBe("library");
    expect(s.players[ap]!.library[0]).toBe(o);
  });
});

describe("Commander Liara Portyr", () => {
  it("attacking two players: spells cast from exile cost {2} less this turn, and the top two cards may be cast this turn", () => {
    const { s: s0, ap } = setup([]);
    const [b, c] = others(s0, ap);
    putOnBattlefield(s0, ap, liara());
    const a1 = putOnBattlefield(s0, ap, bear());
    const a2 = putOnBattlefield(s0, ap, bear({ name: "Test Bear Two" }));
    const g = toLibrary(s0, ap, giant);
    const l = toLibrary(s0, ap, land);
    const inHand = toHand(s0, ap, giant);
    // A card exiled some other way, cast from exile by another permission: cheaper too (rulings).
    const other = toExile(s0, ap, giant);
    s0.objects[other]!.mayPlay = { player: ap, zc: s0.objects[other]!.zoneChanges ?? 0, until: "exiled", turn: s0.turn, castOnly: true };
    let s = act(until(s0, ap, "declareAttackers"), { type: "declareAttackers", player: ap, attacks: [{ attacker: a1, defender: b! }, { attacker: a2, defender: c! }] });
    s = settle(s, ap);
    expect(s.objects[g]!.zone).toBe("exile");
    expect(s.objects[l]!.zone).toBe("exile");
    expect(s.objects[g]!.mayPlay).toMatchObject({ player: ap, until: "thisTurn", castOnly: true });
    expect([costOf(s, ap, g), costOf(s, ap, other), costOf(s, ap, inHand)]).toEqual([2, 2, 4]);
    // The land exiled can't be played: only spells may be cast.
    s = passUntil(s, "main2", ap);
    expect(() => act(s, { type: "playLand", player: ap, objectId: l })).toThrow();
    s = run(s, planCast(s, ap, g));
    expect(s.objects[g]!.zone).toBe("stack");
    // Next turn the reduction is gone.
    s = passUntil(s, "upkeep", b);
    expect(costOf(s, ap, other)).toBe(4);
  });

  it("attacking one player: X is 1", () => {
    const { s: s0, ap } = setup([]);
    const [b] = others(s0, ap);
    putOnBattlefield(s0, ap, liara());
    const a1 = putOnBattlefield(s0, ap, bear());
    const a2 = putOnBattlefield(s0, ap, bear({ name: "Test Bear Two" }));
    const g1 = toLibrary(s0, ap, giant);
    const g2 = toLibrary(s0, ap, giant);
    let s = act(until(s0, ap, "declareAttackers"), { type: "declareAttackers", player: ap, attacks: [{ attacker: a1, defender: b! }, { attacker: a2, defender: b! }] });
    s = settle(s, ap);
    expect(s.objects[g2]!.zone).toBe("exile");
    expect(s.objects[g1]!.zone).toBe("library");
    expect(costOf(s, ap, g2)).toBe(3);
  });
});

describe("Knight-Errant of Eos", () => {
  const knightSetup = () => {
    const r = setup([knight(), murder]);
    const cs = [bear(), bear({ name: "Test Bear Two" }), bear({ name: "Test Bear Three" })].map((d) => putOnBattlefield(r.s, r.ap, d));
    // The top six are all known (the deck's own bears have mana value 0).
    const deep = toLibrary(r.s, r.ap, ogre);
    for (const d of [land, land]) toLibrary(r.s, r.ap, d);
    const three = toLibrary(r.s, r.ap, ogre);
    const four = toLibrary(r.s, r.ap, giant);
    toLibrary(r.s, r.ap, land);
    // Three creatures convoke {3}; the other {1}{W} is in the pool.
    r.s.players[r.ap]!.manaPool.W += 2;
    return { ...r, cs, three, four, deep };
  };

  it("convoked by three creatures: creature cards with mana value 3 or less may be revealed and put into hand, then shuffle", () => {
    const { s: s0, ap, ids, cs, three, four, deep } = knightSetup();
    let s = act(s0, { type: "castSpell", player: ap, objectId: ids[0]!, convoke: cs });
    s = until(s, ap, "searchLibrary");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 2 });
    const p = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect([...p.cards].sort()).toEqual([three, deep].sort());
    expect(p.cards).not.toContain(four);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [three, deep] }), ap);
    expect([s.objects[three]!.zone, s.objects[deep]!.zone]).toEqual(["hand", "hand"]);
    expect(s.objects[four]!.zone).toBe("library");
  });

  it("cast with no convoke, X is 0: no creature card can be taken", () => {
    const { s: s0, ap, ids, three } = knightSetup();
    s0.players[ap]!.manaPool.W -= 2;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.objects[ids[0]!]!.convoked).toBeUndefined();
    s = settle(s, ap);
    if (s.pending?.kind === "searchLibrary") {
      expect(s.pending.cards).toEqual([]);
      s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }), ap);
    }
    expect(s.objects[three]!.zone).toBe("library");
  });

  it("gone before its trigger resolves, it still counts the creatures that convoked it (CR 608.2h)", () => {
    const { s: s0, ap, ids, cs, three } = knightSetup();
    let s = act(s0, { type: "castSpell", player: ap, objectId: ids[0]!, convoke: cs });
    for (let i = 0; i < 20 && s.objects[ids[0]!]!.zone !== "battlefield"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    for (let i = 0; i < 20 && !s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(waitingOn(s)).toBe(ap);
    s = run(s, planCast(s, ap, ids[1]!, [tgt(ids[0]!)]));
    s = until(s, ap, "searchLibrary");
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect((s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>).cards).toContain(three);
  });
});

describe("Chandra, Heart of Fire", () => {
  it("+1: discards your hand, exiles the top three, and they may be played this turn (a land with your land play)", () => {
    const { s: s0, ap } = setup([]);
    const ch = putOnBattlefield(s0, ap, chandra());
    s0.objects[ch]!.counters.loyalty = 5;
    const h = toHand(s0, ap, opt);
    const g = toLibrary(s0, ap, giant);
    const l = toLibrary(s0, ap, land);
    const o = toLibrary(s0, ap, ogre);
    let s = settle(run(s0, planActivate(s0, ap, ch, 0)), ap);
    expect(s.objects[ch]!.counters.loyalty).toBe(6);
    expect(s.objects[h]!.zone).toBe("graveyard");
    expect([g, l, o].map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile", "exile"]);
    s = act(s, { type: "playLand", player: ap, objectId: l });
    expect(s.objects[l]!.zone).toBe("battlefield");
    s = run(s, planCast(s, ap, o));
    expect(s.objects[o]!.zone).toBe("stack");
  });

  it("−9: finds red instant and sorcery cards in graveyard and library, exiles them to cast this turn, adds six {R}", () => {
    const { s: s0, ap, opp } = setup([]);
    const ch = putOnBattlefield(s0, ap, chandra());
    s0.objects[ch]!.counters.loyalty = 10;
    const inYard = toYard(s0, ap, shock);
    const inLib = toLibrary(s0, ap, blaze);
    const blue = toLibrary(s0, ap, opt);
    const green = toYard(s0, ap, glance);
    let s = run(s0, planActivate(s0, ap, ch, 2));
    s = until(s, ap, "searchLibrary");
    const p = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect(p.cards).toEqual(expect.arrayContaining([inYard, inLib]));
    expect(p.cards).not.toContain(blue);
    expect(p.cards).not.toContain(green);
    expect(p.min).toBe(0);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [inYard, inLib] }), ap);
    expect(s.objects[ch]!.counters.loyalty).toBe(1);
    expect([s.objects[inYard]!.zone, s.objects[inLib]!.zone]).toEqual(["exile", "exile"]);
    expect(s.players[ap]!.manaPool.R).toBe(6);
    // Cast with the normal timing and their costs paid: the sorcery now, in the main phase.
    s = act(s, { type: "castSpell", player: ap, objectId: inLib, targets: [{ kind: "player", id: opp }] });
    expect(s.objects[inLib]!.zone).toBe("stack");
    expect(s.players[ap]!.manaPool.R).toBe(4);
  });

  it("−9 may find nothing (CR 701.23b) and still adds the mana", () => {
    const { s: s0, ap } = setup([]);
    const ch = putOnBattlefield(s0, ap, chandra());
    s0.objects[ch]!.counters.loyalty = 9;
    toYard(s0, ap, shock);
    let s = run(s0, planActivate(s0, ap, ch, 2));
    s = until(s, ap, "searchLibrary");
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }), ap);
    expect(s.players[ap]!.manaPool.R).toBe(6);
    expect(s.objects[ch]!.zone).toBe("graveyard");
  });
});
