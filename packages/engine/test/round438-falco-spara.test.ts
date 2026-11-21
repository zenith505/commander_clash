// Round 438 (Lane A): Falco Spara, Pactweaver ("You may cast spells from the top of your library by removing a counter from a
// creature you control in addition to paying their other costs.": an additional cost of each spell cast with the
// permission, CR 601.2f-h, a counter of any kind from one creature you control, rulings).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { botActions, castProblem, compileCard, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const falco = (): CardDef => ({"oracleId":"b9c1ca24-5696-4777-8465-13a8f78e4fb5","name":"Falco Spara, Pactweaver","manaCost":"{1}{G}{W}{U}","cmc":4,"typeLine":"Legendary Creature — Bird Demon","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Bird","Demon"],"oracleText":"Flying, trample\nFalco Spara enters with a shield counter on it.\nYou may look at the top card of your library any time.\nYou may cast spells from the top of your library by removing a counter from a creature you control in addition to paying their other costs.","power":"3","toughness":"3","colors":["G","U","W"],"colorIdentity":["G","U","W"],"keywords":["Flying","Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/1/7/17bbac59-da58-49d8-887e-272dd90724b4.jpg?1783923033","artUrl":"https://cards.scryfall.io/art_crop/front/1/7/17bbac59-da58-49d8-887e-272dd90724b4.jpg?1783923033","commanderLegal":"legal","set":"snc","releasedAt":"2022-04-29","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const pit = (): CardDef => ({"oracleId":"e330412f-46a1-4e7c-8766-f644606049e0","name":"Into the Pit","manaCost":"{2}{B}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"You may look at the top card of your library any time.\nYou may cast spells from the top of your library by sacrificing a nonland permanent in addition to paying their other costs.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bf2fe1f5-0df5-4126-b760-8f3fef9c2ccc.jpg?1783909658","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bf2fe1f5-0df5-4126-b760-8f3fef9c2ccc.jpg?1783909658","commanderLegal":"legal","set":"dsc","releasedAt":"2024-09-27","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; others' questions as the bots would. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p) s = run(s, botActions(s, p.player));
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** A fresh copy of `def` on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  invalidateCharacteristics(s);
  return id;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;

/** Falco Spara on the battlefield with its shield counter (it enters with one). */
const withFalco = () => {
  const { s, ap, opp } = setup([]);
  const f = putOnBattlefield(s, ap, falco());
  s.objects[f]!.counters.shield = 1;
  invalidateCharacteristics(s);
  return { s, ap, opp, f };
};

describe("round 438: Falco Spara, Pactweaver", () => {
  it("is fully supported, the permission's cost a counter from a creature you control", () => {
    expect(isFullySupported(falco())).toBe(true);
    expect(compileCard(falco()).fromTop).toEqual([{ lands: false, spells: "any", costs: [{ kind: "removeCounters", n: 1, filter: expect.objectContaining({ types: ["Creature"], controller: "you" }) }] }]);
  });

  it("casts a creature spell from the top of the library by removing Falco's own shield counter", () => {
    const { s: s0, ap, f } = withFalco();
    const b = onTop(s0, ap, bears());
    let s = run(s0, planCast(s0, ap, b, undefined, undefined, undefined, undefined, { counters: [{ id: f, kind: "shield" }] }));
    expect(s.objects[f]!.counters.shield ?? 0).toBe(0);
    expect(zone(s, b)).toBe("stack");
    s = settle(s);
    expect(zone(s, b)).toBe("battlefield");
  });

  it("any kind of counter from any creature you control: a +1/+1 counter from another creature, the shield counter kept", () => {
    const { s: s0, ap, f } = withFalco();
    const other = putOnBattlefield(s0, ap, bears());
    s0.objects[other]!.counters["+1/+1"] = 2;
    invalidateCharacteristics(s0);
    const d = onTop(s0, ap, divination());
    const hand = s0.players[ap]!.hand.length;
    let s = run(s0, planCast(s0, ap, d, undefined, undefined, undefined, undefined, { counters: [{ id: other, kind: "+1/+1" }] }));
    expect(s.objects[other]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[f]!.counters.shield).toBe(1);
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(zone(s, d)).toBe("graveyard");
  });

  it("not without a counter on a creature you control (an opponent's creature's counters don't count), nor a land", () => {
    const { s, ap, opp, f } = withFalco();
    s.objects[f]!.counters.shield = 0;
    const theirs = putOnBattlefield(s, opp, bears());
    s.objects[theirs]!.counters["+1/+1"] = 3;
    invalidateCharacteristics(s);
    const b = onTop(s, ap, bears());
    expect(castProblem(s, ap, b)).toBeTruthy();
    expect(planCast(s, ap, b)).toBeNull();
    expect(planCast(s, ap, b, undefined, undefined, undefined, undefined, { counters: [{ id: theirs, kind: "+1/+1" }] })).toBeNull();
  });

  it("only the top card, and an instant at instant speed as usual", () => {
    const { s: s0, ap, f } = withFalco();
    const under = onTop(s0, ap, bolt());
    onTop(s0, ap, bears());
    expect(planCast(s0, ap, under, [{ kind: "player", id: ap }])).toBeNull();
    const { s: s1, ap: ap1, opp, f: f1 } = withFalco();
    const top = onTop(s1, ap1, bolt());
    const s2 = run(s1, planCast(s1, ap1, top, [{ kind: "player", id: opp }], undefined, undefined, undefined, { counters: [{ id: f1, kind: "shield" }] }));
    expect(zone(s2, top)).toBe("stack");
    expect(f).toBeTruthy();
  });

  it("with Into the Pit too, the caster picks which permission's cost to pay: Falco's counter or Into the Pit's sacrifice", () => {
    const { s: s0, ap, f } = withFalco();
    const p = putOnBattlefield(s0, ap, pit());
    const fodder = putOnBattlefield(s0, ap, bears());
    invalidateCharacteristics(s0);
    const b = onTop(s0, ap, bears());
    const byCounter = run(structuredClone(s0), planCast(s0, ap, b, undefined, undefined, undefined, undefined, { counters: [{ id: f, kind: "shield" }] }));
    expect(zone(byCounter, b)).toBe("stack");
    expect(byCounter.objects[f]!.counters.shield ?? 0).toBe(0);
    expect(zone(byCounter, fodder)).toBe("battlefield");
    const bySacrifice = run(structuredClone(s0), planCast(s0, ap, b, undefined, undefined, undefined, undefined, { sacrifice: [fodder] }));
    expect(zone(bySacrifice, b)).toBe("stack");
    expect(zone(bySacrifice, fodder)).toBe("graveyard");
    expect(bySacrifice.objects[f]!.counters.shield).toBe(1);
    expect(zone(bySacrifice, p)).toBe("battlefield");
  });

  it("a bot casts the top card by removing a counter", () => {
    const { s, ap, f } = withFalco();
    const b = onTop(s, ap, bears());
    s.players[ap]!.hand = [];
    s.players[ap]!.command = [];
    const plan = botActions(s, ap);
    const castIt = plan.find((a) => a.type === "castSpell" && a.objectId === b);
    expect(castIt).toBeTruthy();
    const t = settle(run(s, plan));
    expect(zone(t, b)).toBe("battlefield");
    expect(t.objects[f]!.counters.shield ?? 0).toBe(0);
  });
});
