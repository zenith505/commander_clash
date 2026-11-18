// Round 404 (Lane A), Kraven the Hunter dying together (review fix from Lane B round B250): "with the greatest power among
// creatures that player controls" looks back to just before the event (CR 603.10a), every creature that left in it at
// its power then, a lord's bonus included.

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup, swamp } from "./helpers";
import { applyAction, power, toughness, waitingOn, planCast, type Action, type CardDef, type GameState, type ObjectId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const kraven = (): CardDef => ({"oracleId":"3e2bfa3a-ae83-453a-8e3f-ca6205a9af12","name":"Kraven the Hunter","manaCost":"{1}{B}{G}","cmc":3,"typeLine":"Legendary Creature — Human Warrior Villain","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warrior","Villain"],"oracleText":"Trample\nWhenever a creature an opponent controls with the greatest power among creatures that player controls dies, draw a card and put a +1/+1 counter on Kraven the Hunter.","power":"4","toughness":"3","colors":["B","G"],"colorIdentity":["B","G"],"keywords":["Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/a/f/afdab464-3674-449b-be01-1cbd21fced23.jpg?1783905315","artUrl":"https://cards.scryfall.io/art_crop/front/a/f/afdab464-3674-449b-be01-1cbd21fced23.jpg?1783905315","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const goblinKing = (): CardDef => ({"oracleId":"d236b3fc-0d3f-4d99-875d-e32a33fe5767","name":"Goblin King","manaCost":"{1}{R}{R}","cmc":3,"typeLine":"Creature — Goblin","supertypes":[],"types":["Creature"],"subtypes":["Goblin"],"oracleText":"Other Goblins get +1/+1 and have mountainwalk.","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/5/455dff34-0ab2-4798-84a9-66dcf37f1789.jpg?1783931623","artUrl":"https://cards.scryfall.io/art_crop/front/4/5/455dff34-0ab2-4798-84a9-66dcf37f1789.jpg?1783931623","commanderLegal":"legal","set":"sld","releasedAt":"2019-12-07","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const piker = (): CardDef => ({"oracleId":"50608184-90d3-43d2-a221-deb186c78323","name":"Goblin Piker","manaCost":"{1}{R}","cmc":2,"typeLine":"Creature — Goblin Warrior","supertypes":[],"types":["Creature"],"subtypes":["Goblin","Warrior"],"oracleText":"","power":"2","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/7/2786834d-dbda-40ce-82a4-e518cd554312.jpg?1783946464","artUrl":"https://cards.scryfall.io/art_crop/front/2/7/2786834d-dbda-40ce-82a4-e518cd554312.jpg?1783946464","commanderLegal":"legal","set":"p02","releasedAt":"1998-06-24","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const wrath = (): CardDef => ({"oracleId":"34515b16-c9a4-4f98-8c77-416a7a523407","name":"Wrath of God","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Destroy all creatures. They can't be regenerated.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/8/98890cd7-ebd5-4fea-814e-4f612abfe3a5.jpg?1783939131","artUrl":"https://cards.scryfall.io/art_crop/front/9/8/98890cd7-ebd5-4fea-814e-4f612abfe3a5.jpg?1783939131","commanderLegal":"legal","set":"v14","releasedAt":"2014-08-22","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const murder = (): CardDef => ({"oracleId":"938b4e2c-88d9-4637-bc00-e228920c9a78","name":"Murder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false} as CardDef);

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length); i++) {
    if (s.pending) throw new Error(`unexpected question: ${s.pending.kind}`);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: ObjectId): TargetChoice => ({ kind: "object", id });
const pt = (s: GameState, id: ObjectId) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;

describe("round 404: Kraven the Hunter, several dying at once", () => {
  it("their powers just before the event, a lord's bonus included; tied ones each count; Kraven dying with them still sees them", () => {
    const { s: s0, ap, opp, ids } = setup([wrath()]);
    const k = putOnBattlefield(s0, ap, kraven());
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    // Grizzly Bears 2/2, Goblin Piker 3/2 with Goblin King's +1/+1, the King 2/2: only the Piker had the greatest power,
    // though the Bears had as much as it once the King was gone.
    putOnBattlefield(s0, opp, bears());
    const pk = putOnBattlefield(s0, opp, piker());
    putOnBattlefield(s0, opp, goblinKing());
    expect(pt(s0, pk)).toBe("3/2");
    // Two Grizzly Bears tied: both had the greatest power.
    putOnBattlefield(s0, third, bears());
    putOnBattlefield(s0, third, bears());
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[k]!.zone).toBe("graveyard");
    // Three triggers, each a draw; Kraven is gone, so no counters.
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3);
  });

  it("the look back is only for the event: a later death compares with what's left then", () => {
    const { s: s0, ap, opp, ids } = setup([murder(), murder()]);
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, ap, swamp);
    const k = putOnBattlefield(s0, ap, kraven());
    const king = putOnBattlefield(s0, opp, goblinKing());
    const pk = putOnBattlefield(s0, opp, piker());
    putOnBattlefield(s0, opp, giant());
    // The King dies alone: 2 power against the Piker's 3 and the Giant's 3, no trigger.
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(king)])));
    expect(s.objects[k]!.counters["+1/+1"] ?? 0).toBe(0);
    // Then the Piker, 2 power now against the Giant's 3: none either.
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(pk)])));
    expect(s.objects[k]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});
