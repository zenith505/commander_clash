// Lane B round B291: Glyph of Delusion's "Put X glyph counters on target creature that target Wall blocked this turn,
// where X is the power of that blocked creature. The creature gains "This creature doesn't untap during your untap step if
// it has a glyph counter on it" and "At the beginning of your upkeep, remove a glyph counter from this creature."" The
// creature must be one that Wall blocked this turn, as the objects they are now (TurnLog.blocks, rulings), checked as the
// targets are chosen and as it resolves (CR 601.2c, 608.2b).

import { describe, expect, it } from "vitest";
import { act, island, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const glyphofDelusion = (): CardDef => ({"oracleId":"e23ba169-4eb5-4083-a199-ac7e3026e67f","name":"Glyph of Delusion","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Put X glyph counters on target creature that target Wall blocked this turn, where X is the power of that blocked creature. The creature gains \"This creature doesn't untap during your untap step if it has a glyph counter on it\" and \"At the beginning of your upkeep, remove a glyph counter from this creature.\"","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee39da13-4b8a-4796-a7c2-aaa11992d573.jpg?1783948075","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee39da13-4b8a-4796-a7c2-aaa11992d573.jpg?1783948075","commanderLegal":"legal","set":"leg","releasedAt":"1994-06-01","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const wallofStone = (): CardDef => ({"oracleId":"cd4cadb4-3156-49bd-b36e-12ba5c85938b","name":"Wall of Stone","manaCost":"{1}{R}{R}","cmc":3,"typeLine":"Creature — Wall","supertypes":[],"types":["Creature"],"subtypes":["Wall"],"oracleText":"Defender (This creature can't attack.)","power":"0","toughness":"8","colors":["R"],"colorIdentity":["R"],"keywords":["Defender"],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/140e567c-6e4a-42b0-8084-d6c9695ae802.jpg?1783948680","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/140e567c-6e4a-42b0-8084-d6c9695ae802.jpg?1783948680","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const giantGrowth = (): CardDef => ({"oracleId":"5748ebf1-24e3-499d-ab7c-c2cebd462a24","name":"Giant Growth","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +3/+3 until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes (questions answered the way a bot would, blocks and attacks declared empty) until `stop`. */
const goUntil = (s: GameState, stop: (s: GameState) => boolean) => {
  for (let i = 0; i < 3000; i++) {
    if (stop(s)) return s;
    const p = s.pending;
    const pid = waitingOn(s)!;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never stopped");
};
const attackWith = (s: GameState, attackers: string[], defender: PlayerId) => {
  s = goUntil(s, (x) => x.pending?.kind === "declareAttackers");
  s = act(s, { type: "declareAttackers", player: s.activePlayer, attacks: attackers.map((attacker) => ({ attacker, defender })) });
  return goUntil(s, (x) => x.pending?.kind === "declareBlockers");
};
const block = (s: GameState, pid: PlayerId, blocks: { blocker: string; attacker: string }[]) => act(s, { type: "declareBlockers", player: pid, blocks });
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
const obj = (s: GameState, id: string) => s.objects[id]!;

describe("Lane B round B291: Glyph of Delusion", () => {
  /** `ap` attacks the opponent with Grizzly Bears and Hill Giant; the opponent's Wall of Stone blocks the Bears; the opponent has Glyph of Delusion in hand and an Island. */
  const blocked = () => {
    const { s: s0, ap, opp } = setup([]);
    const bears = putOnBattlefield(s0, ap, grizzlyBears());
    const giant = putOnBattlefield(s0, ap, hillGiant());
    const wall = putOnBattlefield(s0, opp, wallofStone());
    const other = putOnBattlefield(s0, opp, wallofStone());
    putOnBattlefield(s0, opp, island);
    const glyph = inHand(s0, opp, glyphofDelusion());
    let s = block(attackWith(s0, [bears, giant], opp), opp, [{ blocker: wall, attacker: bears }]);
    // After combat damage, in the end of combat step or the second main phase, the opponent gets priority.
    s = goUntil(s, (x) => x.step === "main2" && !x.stack.length && waitingOn(x) === ap);
    s = act(s, { type: "passPriority", player: ap });
    s = goUntil(s, (x) => waitingOn(x) === opp && !x.pending);
    return { s, ap, opp, bears, giant, wall, other, glyph };
  };

  it("is fully supported", () => supported(glyphofDelusion()));

  it("can't be cast before a Wall has blocked a creature this turn", () => {
    const { s, opp } = setup([]);
    putOnBattlefield(s, opp, wallofStone());
    putOnBattlefield(s, s.activePlayer, grizzlyBears());
    putOnBattlefield(s, opp, island);
    const glyph = inHand(s, opp, glyphofDelusion());
    expect(planCast(s, opp, glyph, [{ kind: "object", id: s.battlefield.find((id) => s.cards[obj(s, id).cardId]!.name === "Wall of Stone")! }, { kind: "object", id: s.battlefield.find((id) => s.cards[obj(s, id).cardId]!.name === "Grizzly Bears")! }])).toBeNull();
  });

  it("targets only a creature that Wall blocked this turn, and the Wall that blocked it", () => {
    const { s, opp, bears, giant, wall, other, glyph } = blocked();
    expect(planCast(s, opp, glyph, [{ kind: "object", id: wall }, { kind: "object", id: giant }])).toBeNull();
    expect(planCast(s, opp, glyph, [{ kind: "object", id: other }, { kind: "object", id: bears }])).toBeNull();
    expect(planCast(s, opp, glyph, [{ kind: "object", id: wall }, { kind: "object", id: bears }])).not.toBeNull();
  });

  it("puts X glyph counters on it, X its power as it resolves; it doesn't untap while it has one, and loses one each upkeep", () => {
    const { s: s0, ap, opp, bears, wall, glyph } = blocked();
    let s = run(s0, planCast(s0, opp, glyph, [{ kind: "object", id: wall }, { kind: "object", id: bears }]));
    s = goUntil(s, (x) => !x.stack.length);
    expect(obj(s, bears).counters.glyph).toBe(2);
    expect(obj(s, bears).tapped).toBe(true);
    // Its controller's next turn: still tapped in the untap step, one counter removed in the upkeep.
    s = passUntil(s, "upkeep", ap);
    expect(obj(s, bears).tapped).toBe(true);
    s = goUntil(s, (x) => x.step === "draw" && x.activePlayer === ap);
    expect(obj(s, bears).counters.glyph).toBe(1);
    s = passUntil(s, "upkeep", ap);
    s = passUntil(s, "upkeep", ap);
    expect(obj(s, bears).tapped).toBe(true);
    s = goUntil(s, (x) => x.step === "draw" && x.activePlayer === ap);
    expect(obj(s, bears).counters.glyph ?? 0).toBe(0);
    // With no glyph counter left, it untaps as usual.
    s = passUntil(s, "upkeep", ap);
    s = passUntil(s, "upkeep", ap);
    expect(obj(s, bears).tapped).toBe(false);
  });

  it("counts the blocked creature's power as it resolves", () => {
    const { s: s0, opp, bears, wall, glyph } = blocked();
    let s = run(s0, planCast(s0, opp, glyph, [{ kind: "object", id: wall }, { kind: "object", id: bears }]));
    // Two +1/+1 counters put on it before it resolves: power 4.
    obj(s, bears).counters["+1/+1"] = 2;
    invalidateCharacteristics(s);
    s = goUntil(s, (x) => !x.stack.length);
    expect(obj(s, bears).counters.glyph).toBe(4);
  });

  it("does nothing if the creature has left the battlefield and come back (a new object, CR 400.7)", () => {
    const { s: s0, opp, bears, wall, glyph } = blocked();
    let s = run(s0, planCast(s0, opp, glyph, [{ kind: "object", id: wall }, { kind: "object", id: bears }]));
    // As if it had been flickered: a new object, which no Wall blocked.
    obj(s, bears).zoneChanges = (obj(s, bears).zoneChanges ?? 0) + 1;
    s = goUntil(s, (x) => !x.stack.length);
    expect(obj(s, bears).counters.glyph ?? 0).toBe(0);
    expect(obj(s, glyph).zone).toBe("graveyard");
  });
});
