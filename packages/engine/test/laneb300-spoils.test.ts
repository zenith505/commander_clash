// Lane B round B300: Share the Spoils ("When this enchantment enters and whenever an opponent loses the game, exile the top
// card of each player's library. During each player's turn, that player may play a land or cast a spell from among cards
// exiled with this enchantment, and they may spend mana as though it were mana of any color to cast that spell. When they
// do, exile the top card of their library."): CR 607.2a (the cards exiled with it), 609.4b (mana of any color), 800.4a
// (a player who loses leaves with what they own), and its rulings (one land or one spell a turn, the usual timing).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, passUntil, setup } from "./helpers";
import { applyAction, botActions, castProblem, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const spoils = (): CardDef => ({"oracleId":"d39af66c-4997-48b8-a704-f21d93247d7d","name":"Share the Spoils","manaCost":"{1}{R}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters and whenever an opponent loses the game, exile the top card of each player's library.\nDuring each player's turn, that player may play a land or cast a spell from among cards exiled with this enchantment, and they may spend mana as though it were mana of any color to cast that spell. When they do, exile the top card of their library.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/e/5e35d719-8766-47dc-8c0d-8e2b37b907a8.jpg?1783926244","artUrl":"https://cards.scryfall.io/art_crop/front/5/e/5e35d719-8766-47dc-8c0d-8e2b37b907a8.jpg?1783926244","commanderLegal":"legal","set":"afc","releasedAt":"2021-07-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const forestCard = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bearsCard = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ponder = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...ds: CardDef[]) => ds.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 400 && !s.over && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const ptgt = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
/** A fresh copy of `def` in one of `pid`'s zones (the library's top with "library"). */
const putIn = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" | "exile" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  return id;
};
/** Takes away all of `pid`'s lands, then gives them these. */
const lands = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  s.battlefield = s.battlefield.filter((id) => !(s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land")));
  return defs.map((d) => putOnBattlefield(s, pid, d));
};
const key = (s: GameState, id: string) => `${id}@${s.objects[id]!.zoneChanges ?? 0}`;
const linked = (s: GameState, src: string) => (s.linkedExile?.[key(s, src)] ?? []).map((l) => l.id);
/** Links an exiled card to the permanent it was exiled with (CR 607.2a), as its exile abilities would. */
const link = (s: GameState, src: string, card: string) => {
  ((s.linkedExile ??= {})[key(s, src)] ??= []).push({ id: card, zc: s.objects[card]!.zoneChanges ?? 0 });
};

describe("Share the Spoils", () => {
  it("is supported", () => supported(spoils()));

  it("as it enters, the top card of each player's library is exiled with it, face up", () => {
    const { s: s0, ap, ids } = setup([spoils()]);
    const tops = s0.turnOrder.map((p) => putIn(s0, p, bolt(), "library"));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const share = ids[0]!;
    expect(zone(s, share)).toBe("battlefield");
    for (const id of tops) {
      expect(zone(s, id)).toBe("exile");
      expect(s.objects[id]!.faceDown).toBeFalsy();
    }
    expect(linked(s, share).sort()).toEqual([...tops].sort());
  });

  it("on your turn, one land from among them as your land play; when you do, your top card is exiled with it too", () => {
    const { s: s0, ap, opp } = setup([]);
    const share = putOnBattlefield(s0, ap, spoils());
    const land = putIn(s0, opp, forestCard(), "exile");
    const spell = putIn(s0, opp, bolt(), "exile");
    link(s0, share, land);
    link(s0, share, spell);
    const top = putIn(s0, ap, bearsCard(), "library");
    let s = act(s0, { type: "playLand", player: ap, objectId: land });
    // The opponent's card, played by you: under your control (CR 305.1, 108.4).
    expect(zone(s, land)).toBe("battlefield");
    expect(s.objects[land]!.controller).toBe(ap);
    expect(s.players[ap]!.landsPlayedThisTurn).toBe(1);
    s = settle(s);
    expect(zone(s, top)).toBe("exile");
    expect(linked(s, share)).toContain(top);
    // One land or one spell a turn (rulings): not the Bolt now, nor the card it just exiled.
    expect(planCast(s, ap, spell, [ptgt(opp)])).toBeNull();
  });

  it("a spell from among them with mana of any color; when you do, your top card is exiled; then no other card this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const share = putOnBattlefield(s0, ap, spoils());
    const spell = putIn(s0, opp, bolt(), "exile");
    const land = putIn(s0, opp, forestCard(), "exile");
    link(s0, share, spell);
    link(s0, share, land);
    // Only Forests: green mana pays {R} (CR 609.4b).
    lands(s0, ap, [forestCard(), forestCard()]);
    const top = putIn(s0, ap, bearsCard(), "library");
    const life = s0.players[opp]!.life;
    let s = run(s0, planCast(s0, ap, spell, [ptgt(opp)]));
    // "When they do" triggers as it's cast, so it resolves first: the top card is exiled, then the Bolt hits.
    expect(s.stack.length).toBe(2);
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(zone(s, top)).toBe("exile");
    expect(linked(s, share)).toContain(top);
    // It goes to its owner's graveyard (CR 400.3).
    expect(s.players[opp]!.graveyard).toContain(spell);
    expect(() => act(s, { type: "playLand", player: ap, objectId: land })).toThrow();
  });

  it("a card played with another permission isn't played this way: no trigger, and the one card a turn is still there", () => {
    const { s: s0, ap, opp } = setup([]);
    const share = putOnBattlefield(s0, ap, spoils());
    const own = putIn(s0, opp, bolt(), "exile");
    const other = putIn(s0, opp, bolt(), "exile");
    link(s0, share, own);
    link(s0, share, other);
    // A permission of the card's own as well ("you may play that card this turn"): that one is used.
    s0.objects[own]!.mayPlay = { player: ap, zc: s0.objects[own]!.zoneChanges ?? 0, until: "thisTurn", turn: s0.turn };
    const top = putIn(s0, ap, bearsCard(), "library");
    let s = run(s0, planCast(s0, ap, own, [ptgt(opp)]));
    expect(s.stack.length).toBe(1);
    s = settle(s);
    expect(zone(s, top)).toBe("library");
    expect(planCast(s, ap, other, [ptgt(opp)])).not.toBeNull();
  });

  it("a land played as usual: not a second land this turn, and only in a main phase with the stack empty", () => {
    const { s: s0, ap, opp } = setup([]);
    const share = putOnBattlefield(s0, ap, spoils());
    const land = putIn(s0, opp, forestCard(), "exile");
    link(s0, share, land);
    s0.players[ap]!.landsPlayedThisTurn = 1;
    expect(() => act(s0, { type: "playLand", player: ap, objectId: land })).toThrow();
  });

  it("every player on their own turn, whoever controls it; not on another player's turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const share = putOnBattlefield(s0, ap, spoils());
    const shockCard = putIn(s0, ap, shock(), "exile");
    link(s0, share, shockCard);
    // An instant, but it isn't the opponent's turn.
    expect(castProblem(s0, opp, shockCard, [ptgt(ap)])).not.toBeNull();
    let s = passUntil(s0, "main1", opp);
    lands(s, opp, [forestCard()]);
    const top = putIn(s, opp, bolt(), "library");
    // Your card, cast by the opponent with green mana.
    expect(planCast(s, opp, shockCard, [ptgt(ap)])).not.toBeNull();
    const life = s.players[ap]!.life;
    s = settle(run(s, planCast(s, opp, shockCard, [ptgt(ap)])));
    expect(s.players[ap]!.life).toBe(life - 2);
    // "Their library": the player who cast it.
    expect(zone(s, top)).toBe("exile");
    expect(linked(s, share)).toContain(top);
  });

  it("not a card exiled another way, and nothing once it has left the battlefield", () => {
    const { s: s0, ap, opp } = setup([]);
    const share = putOnBattlefield(s0, ap, spoils());
    const unlinked = putIn(s0, opp, bolt(), "exile");
    const spell = putIn(s0, opp, bolt(), "exile");
    link(s0, share, spell);
    expect(planCast(s0, ap, unlinked, [ptgt(opp)])).toBeNull();
    expect(planCast(s0, ap, spell, [ptgt(opp)])).not.toBeNull();
    // Gone: no permission, even if it came back (a new object, CR 400.7; rulings).
    s0.battlefield.splice(s0.battlefield.indexOf(share), 1);
    s0.objects[share]!.zone = "graveyard";
    s0.players[ap]!.graveyard.push(share);
    expect(planCast(s0, ap, spell, [ptgt(opp)])).toBeNull();
  });

  it("a bot plays a land from among them on its turn when it has none in hand", () => {
    const { s: s0, ap } = setup([]);
    const share = putOnBattlefield(s0, ap, spoils());
    s0.players[ap]!.hand = [];
    const land = putIn(s0, ap === s0.turnOrder[0] ? s0.turnOrder[1]! : s0.turnOrder[0]!, forestCard(), "exile");
    link(s0, share, land);
    const acts = botActions(s0, ap);
    expect(acts.some((a) => a.type === "playLand" && a.objectId === land)).toBe(true);
  });

  it("whenever an opponent loses the game, the top card of each remaining player's library is exiled with it", () => {
    const { s: s0, ap, opp } = setup([]);
    const share = putOnBattlefield(s0, ap, spoils());
    const rest = s0.turnOrder.filter((p) => p !== opp);
    const tops = rest.map((p) => putIn(s0, p, bolt(), "library"));
    let s = settle(act(s0, { type: "concede", player: opp }));
    for (const id of tops) expect(zone(s, id)).toBe("exile");
    expect(linked(s, share).sort()).toEqual([...tops].sort());
  });

  it("an opponent's Share the Spoils you control leaves with them when they lose: no trigger (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const share = putOnBattlefield(s0, opp, spoils());
    s0.objects[share]!.controller = ap;
    const top = putIn(s0, ap, bolt(), "library");
    const s = settle(act(s0, { type: "concede", player: opp }));
    expect(zone(s, top)).toBe("library");
  });
});
