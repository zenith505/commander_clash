// Round 429: Evelyn, the Covetous: "Whenever Evelyn or another Vampire you control enters, exile the top card of each
// player's library with a collection counter on it." and "Once each turn, you may play a card from exile with a collection
// counter on it if it was exiled by an ability you controlled, and you may spend mana as though it were mana of any color
// to cast it." (CR 122.1, 305.1, 601.3, 609.4b).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const evelyn = (): CardDef => ({"oracleId":"4ab6f615-1f04-4ed2-88b2-49faa8356dd0","name":"Evelyn, the Covetous","manaCost":"{2}{U/B}{B}{B/R}","cmc":5,"typeLine":"Legendary Creature — Vampire Rogue","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Vampire","Rogue"],"oracleText":"Flash\nWhenever Evelyn or another Vampire you control enters, exile the top card of each player's library with a collection counter on it.\nOnce each turn, you may play a card from exile with a collection counter on it if it was exiled by an ability you controlled, and you may spend mana as though it were mana of any color to cast it.","power":"2","toughness":"5","colors":["B","R","U"],"colorIdentity":["B","R","U"],"keywords":["Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/7/a/7abd914b-4f66-4b80-8249-86f2e77f0452.jpg?1783923031","artUrl":"https://cards.scryfall.io/art_crop/front/7/a/7abd914b-4f66-4b80-8249-86f2e77f0452.jpg?1783923031","commanderLegal":"legal","set":"snc","releasedAt":"2022-04-29","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const island = (): CardDef => ({"oracleId":"b2c6aa39-2d2a-459c-a555-fb48ba993373","name":"Island","manaCost":"","cmc":0,"typeLine":"Basic Land — Island","supertypes":["Basic"],"types":["Land"],"subtypes":["Island"],"oracleText":"({T}: Add {U}.)","colors":[],"colorIdentity":["U"],"keywords":[],"producedMana":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const swamp = (): CardDef => ({"oracleId":"56719f6a-1a6c-4c0a-8d21-18f7d7350b68","name":"Swamp","manaCost":"","cmc":0,"typeLine":"Basic Land — Swamp","supertypes":["Basic"],"types":["Land"],"subtypes":["Swamp"],"oracleText":"({T}: Add {B}.)","colors":[],"colorIdentity":["B"],"keywords":[],"producedMana":["B"],"imageUrl":"https://cards.scryfall.io/normal/front/2/1/214a9e76-b7fd-4cc9-89e7-104a71919a84.jpg?1785981656","artUrl":"https://cards.scryfall.io/art_crop/front/2/1/214a9e76-b7fd-4cc9-89e7-104a71919a84.jpg?1785981656","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const vampire = (): CardDef => ({"oracleId":"feb244f8-bcb1-44cf-9940-2719221a7309","name":"Vampire Nighthawk","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Creature — Vampire Shaman","supertypes":[],"types":["Creature"],"subtypes":["Vampire","Shaman"],"oracleText":"Flying\nDeathtouch (Any amount of damage this deals to a creature is enough to destroy it.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)","power":"2","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":["Deathtouch","Flying","Lifelink"],"imageUrl":"https://cards.scryfall.io/normal/front/4/4/44f19fe3-7a17-4c45-adfa-590f73dfebfa.jpg?1783942148","artUrl":"https://cards.scryfall.io/art_crop/front/4/4/44f19fe3-7a17-4c45-adfa-590f73dfebfa.jpg?1783942148","commanderLegal":"legal","set":"zen","releasedAt":"2009-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const ptgt = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const putIn = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" | "exile" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Takes away all of `pid`'s lands, then gives them these. */
const lands = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  s.battlefield = s.battlefield.filter((id) => !(s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land")));
  const ids = defs.map((d) => putOnBattlefield(s, pid, d));
  invalidateCharacteristics(s);
  return ids;
};
const collected = (s: GameState, owner: PlayerId, by: PlayerId, def: CardDef) => {
  const id = putIn(s, owner, def, "exile");
  s.objects[id]!.counters = { collection: 1 };
  s.objects[id]!.exiledByPlayer = by;
  return id;
};

describe("round 429: Evelyn, the Covetous compiles", () => {
  it("is fully supported", () => expect(isFullySupported(evelyn())).toBe(true));
});

describe("Evelyn, the Covetous", () => {
  it("entering, and another Vampire entering: the top card of each player's library exiled with a collection counter, as exiled by you", () => {
    const { s: s0, ap, ids } = setup([evelyn(), vampire()]);
    const tops = s0.turnOrder.map((pid) => putIn(s0, pid, bears(), "library"));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    for (const id of tops) {
      expect(zone(s, id)).toBe("exile");
      expect(s.objects[id]!.counters.collection).toBe(1);
      expect(s.objects[id]!.exiledByPlayer).toBe(ap);
      expect(s.objects[id]!.faceDown).toBeFalsy();
    }
    const exiled = s.turnOrder.map((pid) => s.players[pid]!.exile.length);
    s.players[ap]!.manaPool.B = 3;
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.turnOrder.map((pid) => s.players[pid]!.exile.length)).toEqual(exiled.map((n) => n + 1));
  });

  it("once each turn: a spell cast with mana as though of any color, then no other card that turn", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, evelyn());
    const b = collected(s0, opp, ap, bolt());
    const g = collected(s0, opp, ap, bears());
    lands(s0, ap, [island(), island(), island()]);
    expect(planCast(s0, ap, g)).not.toBeNull();
    const life = s0.players[opp]!.life;
    let s = settle(run(s0, planCast(s0, ap, b, [ptgt(opp)])));
    expect(s.players[opp]!.life).toBe(life - 3);
    // Used up for this turn.
    expect(planCast(s, ap, g)).toBeNull();
    // Next turn of ours: again.
    for (let i = 0; i < 3000 && !(s.activePlayer === ap && s.step === "main1" && s.turn > s0.turn); i++) {
      const pid = waitingOn(s)!;
      if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
      else if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
      else if (s.pending?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, s.pending.count) });
      else s = act(s, { type: "passPriority", player: pid });
    }
    expect(s.activePlayer).toBe(ap);
    expect(planCast(s, ap, g)).not.toBeNull();
  });

  it("a land played as your land play, using up the turn's card", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, evelyn());
    const land = collected(s0, opp, ap, swamp());
    const b = collected(s0, opp, ap, bolt());
    const played = s0.players[ap]!.landsPlayedThisTurn;
    const s = act(s0, { type: "playLand", player: ap, objectId: land });
    expect(zone(s, land)).toBe("battlefield");
    expect(s.objects[land]!.controller).toBe(ap);
    expect(s.players[ap]!.landsPlayedThisTurn).toBe(played + 1);
    expect(planCast(s, ap, b, [ptgt(opp)])).toBeNull();
  });

  it("only a card an ability you controlled exiled, with a collection counter", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, evelyn());
    const theirs = collected(s0, opp, opp, bolt());
    const noCounter = putIn(s0, opp, bolt(), "exile");
    s0.objects[noCounter]!.exiledByPlayer = ap;
    const ok = collected(s0, opp, ap, bolt());
    const ok2 = collected(s0, opp, ap, bolt());
    expect(planCast(s0, ap, theirs, [ptgt(opp)])).toBeNull();
    expect(planCast(s0, ap, noCounter, [ptgt(opp)])).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ok, [ptgt(opp)])));
    expect(zone(s, ok)).toBe("graveyard");
    expect(planCast(s, ap, ok2, [ptgt(opp)])).toBeNull();
  });

  it("a bot plays a collected card", () => {
    const { s: s0, ap, opp } = setup([]);
    s0.players[ap]!.hand = [];
    putOnBattlefield(s0, ap, evelyn());
    const g = collected(s0, opp, ap, bears());
    lands(s0, ap, [island(), island()]);
    let s = s0;
    for (let i = 0; i < 20 && zone(s, g) === "exile"; i++) {
      const acts = botActions(s, waitingOn(s)!);
      if (!acts.length) break;
      for (const a of acts) s = act(s, a);
    }
    expect(zone(s, g)).not.toBe("exile");
  });
});
