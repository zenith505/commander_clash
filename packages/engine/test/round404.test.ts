// Round 404 (Lane A): Hero of Bretagard and Ranar the Ever-Watchful ("Whenever one or more cards are put into exile from
// your hand or a spell or ability you control exiles one or more permanents from the battlefield", CR 603.2c; Ranar's
// first foretelling each turn for {0}, CR 702.143a, 116.2h), Kraven the Hunter (a creature with the greatest power among
// its controller's creatures dying, looked at as it last existed, CR 603.10a) and Eriette, the Beguiler (control of a
// permanent for as long as an Aura you control is attached to it, CR 611.2b).

import { describe, expect, it } from "vitest";
import { act, bear, putOnBattlefield, setup } from "./helpers";
import { invalidateCharacteristics } from "../src/layers";
import { planForetell } from "../src/autopay";
import { applyAction, characteristics, foretellActionCost, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";
import { createToken } from "../src/effects/run-tokens";

// Real card data (Scryfall).
const hero = (): CardDef => ({"oracleId":"83f1408e-8270-49b4-9d3f-eacfd3645543","name":"Hero of Bretagard","manaCost":"{2}{W}","cmc":3,"typeLine":"Creature — Human Warrior","supertypes":[],"types":["Creature"],"subtypes":["Human","Warrior"],"oracleText":"Whenever one or more cards are put into exile from your hand or a spell or ability you control exiles one or more permanents from the battlefield, put that many +1/+1 counters on this creature.\nAs long as this creature has five or more counters on it, it has flying and is an Angel in addition to its other types.\nAs long as this creature has ten or more counters on it, it has indestructible and is a God in addition to its other types.","power":"1","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/4/4458c16c-b71d-481d-863b-f2e3b1320178.jpg?1783928340","artUrl":"https://cards.scryfall.io/art_crop/front/4/4/4458c16c-b71d-481d-863b-f2e3b1320178.jpg?1783928340","commanderLegal":"legal","set":"khc","releasedAt":"2021-02-05","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const ranar = (): CardDef => ({"oracleId":"c73a9939-0742-4919-94d6-c3b537697f17","name":"Ranar the Ever-Watchful","manaCost":"{2}{W}{U}","cmc":4,"typeLine":"Legendary Creature — Spirit Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Spirit","Warrior"],"oracleText":"Flying, vigilance\nThe first card you foretell each turn costs {0} to foretell.\nWhenever one or more cards are put into exile from your hand or a spell or ability you control exiles one or more permanents from the battlefield, create a 1/1 white Spirit creature token with flying.","power":"2","toughness":"3","colors":["U","W"],"colorIdentity":["U","W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/1/c/1c8c41dd-8551-4ce8-a9be-9b9f65718852.jpg?1783928341","artUrl":"https://cards.scryfall.io/art_crop/front/1/c/1c8c41dd-8551-4ce8-a9be-9b9f65718852.jpg?1783928341","commanderLegal":"legal","set":"khc","releasedAt":"2021-02-05","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const kraven = (): CardDef => ({"oracleId":"3e2bfa3a-ae83-453a-8e3f-ca6205a9af12","name":"Kraven the Hunter","manaCost":"{1}{B}{G}","cmc":3,"typeLine":"Legendary Creature — Human Warrior Villain","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warrior","Villain"],"oracleText":"Trample\nWhenever a creature an opponent controls with the greatest power among creatures that player controls dies, draw a card and put a +1/+1 counter on Kraven the Hunter.","power":"4","toughness":"3","colors":["B","G"],"colorIdentity":["B","G"],"keywords":["Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/a/f/afdab464-3674-449b-be01-1cbd21fced23.jpg?1783905315","artUrl":"https://cards.scryfall.io/art_crop/front/a/f/afdab464-3674-449b-be01-1cbd21fced23.jpg?1783905315","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const eriette = (): CardDef => ({"oracleId":"710a3499-64f8-4d2c-8c9c-d58950e47ea7","name":"Eriette, the Beguiler","manaCost":"{1}{W}{U}{B}","cmc":4,"typeLine":"Legendary Creature — Human Warlock","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warlock"],"oracleText":"Lifelink\nWhenever an Aura you control becomes attached to a nonland permanent an opponent controls with mana value less than or equal to that Aura's mana value, gain control of that permanent for as long as that Aura is attached to it.","power":"4","toughness":"4","colors":["B","U","W"],"colorIdentity":["B","U","W"],"keywords":["Lifelink"],"imageUrl":"https://cards.scryfall.io/normal/front/f/4/f46c133a-7ae4-431b-88f2-ec606a7baf69.jpg?1783911794","artUrl":"https://cards.scryfall.io/art_crop/front/f/4/f46c133a-7ae4-431b-88f2-ec606a7baf69.jpg?1783911794","commanderLegal":"legal","set":"otj","releasedAt":"2024-04-19","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const swords = (): CardDef => ({"oracleId":"b1544f21-7e98-461b-aed5-e748b0168c52","name":"Swords to Plowshares","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Exile target creature. Its controller gains life equal to its power.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/4/84a4a532-538e-428c-bd62-d0b997895c31.jpg?1790743598","artUrl":"https://cards.scryfall.io/art_crop/front/8/4/84a4a532-538e-428c-bd62-d0b997895c31.jpg?1790743598","commanderLegal":"legal","set":"sld","releasedAt":"2026-09-28","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const wrath = (): CardDef => ({"oracleId":"34515b16-c9a4-4f98-8c77-416a7a523407","name":"Wrath of God","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Destroy all creatures. They can't be regenerated.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/8/98890cd7-ebd5-4fea-814e-4f612abfe3a5.jpg?1783939131","artUrl":"https://cards.scryfall.io/art_crop/front/9/8/98890cd7-ebd5-4fea-814e-4f612abfe3a5.jpg?1783939131","commanderLegal":"legal","set":"v14","releasedAt":"2014-08-22","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const doomskar = (): CardDef => ({"oracleId":"38ece0fa-2c94-4eae-b6ab-74b783862f3e","name":"Doomskar","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Destroy all creatures.\nForetell {1}{W}{W} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)","colors":["W"],"colorIdentity":["W"],"keywords":["Foretell"],"imageUrl":"https://cards.scryfall.io/normal/front/1/3/130ee895-1e5e-4f82-bb66-e1275bac75dd.jpg?1783928285","artUrl":"https://cards.scryfall.io/art_crop/front/1/3/130ee895-1e5e-4f82-bb66-e1275bac75dd.jpg?1783928285","commanderLegal":"legal","set":"khm","releasedAt":"2021-02-05","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const disenchant = (): CardDef => ({"oracleId":"a7e97fa9-4b72-4548-b854-5be5f18a6f1a","name":"Disenchant","manaCost":"{1}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target artifact or enchantment.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/5/658c5caa-d739-4d30-a512-43ac4de900cb.jpg?1783920133","artUrl":"https://cards.scryfall.io/art_crop/front/6/5/658c5caa-d739-4d30-a512-43ac4de900cb.jpg?1783920133","commanderLegal":"legal","set":"bro","releasedAt":"2022-11-18","rarity":"common","layout":"normal","gameChanger":false} as CardDef);

const sphere = (): CardDef => ({"oracleId":"0a0b376d-7824-4ba5-8bc9-bc0be12800c5","name":"Detention Sphere","manaCost":"{1}{W}{U}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, you may exile target nonland permanent not named Detention Sphere and all other permanents with the same name as that permanent.\nWhen this enchantment leaves the battlefield, return the exiled cards to the battlefield under their owner's control.","colors":["U","W"],"colorIdentity":["U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/b/bb049418-44db-4f98-9d53-385c5cd0f5cc.jpg?1783911714","artUrl":"https://cards.scryfall.io/art_crop/front/b/b/bb049418-44db-4f98-9d53-385c5cd0f5cc.jpg?1783911714","commanderLegal":"legal","set":"otp","releasedAt":"2024-04-19","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; a "you may" is answered yes, and a trigger's target is `pick`. */
const settle = (s: GameState, pick?: ObjectId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes: true });
    else if (s.pending?.kind === "chooseTargets" && pick) s = act(s, { type: "chooseTargets", player: s.pending.player, targets: [tgt(pick)] });
    else if (s.pending) throw new Error(`unexpected question: ${s.pending.kind}`);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: ObjectId): TargetChoice => ({ kind: "object", id });
const castOn = (s: GameState, pid: PlayerId, id: ObjectId, targets: TargetChoice[] = [], pick?: ObjectId) => settle(run(s, planCast(s, pid, id, targets)), pick);
const counters = (s: GameState, id: ObjectId) => s.objects[id]!.counters["+1/+1"] ?? 0;
const spirits = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).subtypes.includes("Spirit")).length;
const handSize = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.length;

describe("round 404: parse", () => {
  it("every card of the round is fully supported", () => {
    for (const d of [hero(), ranar(), kraven(), eriette()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("round 404: Hero of Bretagard", () => {
  it("a spell you control exiling a permanent, an opponent's or a token, puts that many +1/+1 counters on it", () => {
    const { s: s0, ap, opp, ids } = setup([swords(), swords()]);
    const h = putOnBattlefield(s0, ap, hero());
    const b = putOnBattlefield(s0, opp, bear());
    let s = castOn(s0, ap, ids[0]!, [tgt(b)]);
    expect(s.objects[b]!.zone).toBe("exile");
    expect(counters(s, h)).toBe(1);
    const tok = createToken(s, opp, { name: "Soldier", power: 1, toughness: 1, colors: ["W"], types: ["Creature"], subtypes: ["Soldier"], keywords: [] } as never).id;
    s = castOn(s, ap, ids[1]!, [tgt(tok)]);
    expect(counters(s, h)).toBe(2);
  });

  it("an ability you control exiling several permanents at once puts that many; destroying them doesn't count", () => {
    const { s: s0, ap, opp, ids } = setup([sphere(), wrath()]);
    const h = putOnBattlefield(s0, ap, hero());
    const b = putOnBattlefield(s0, opp, bear());
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, opp, bear());
    // Detention Sphere's enters ability: the target and all other permanents with that name, at once.
    let s = castOn(s0, ap, ids[0]!, [], b);
    expect(s.objects[b]!.zone).toBe("exile");
    expect(counters(s, h)).toBe(3);
    putOnBattlefield(s, opp, bear());
    s = castOn(s, ap, ids[1]!);
    expect(s.objects[h]!.zone).toBe("graveyard");
  });

  it("an opponent's spell exiling your permanent doesn't count", () => {
    const { s: s0, ap, opp, ids } = setup([swords()]);
    const h = putOnBattlefield(s0, opp, hero());
    const b = putOnBattlefield(s0, opp, bear());
    const s = castOn(s0, ap, ids[0]!, [tgt(b)]);
    expect(s.objects[b]!.zone).toBe("exile");
    expect(counters(s, h)).toBe(0);
  });

  it("cards put into exile from your hand for any reason count: foretelling", () => {
    const { s: s0, ap, ids } = setup([doomskar()]);
    const h = putOnBattlefield(s0, ap, hero());
    const s = settle(run(s0, planForetell(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    expect(counters(s, h)).toBe(1);
  });

  it("with five counters it has flying and is an Angel", () => {
    const { s, ap } = setup([]);
    const h = putOnBattlefield(s, ap, hero());
    s.objects[h]!.counters["+1/+1"] = 5;
    invalidateCharacteristics(s);
    const c = characteristics(s, s.objects[h]!);
    expect(c.keywords).toContain("Flying");
    expect(c.subtypes).toContain("Angel");
  });
});

describe("round 404: Ranar the Ever-Watchful", () => {
  it("the first card you foretell each turn costs {0}, the next {2}; each foretelling makes a 1/1 flying Spirit", () => {
    const { s: s0, ap, ids } = setup([doomskar(), doomskar()]);
    putOnBattlefield(s0, ap, ranar());
    expect(foretellActionCost(s0, ap)).toBe("{0}");
    let s = settle(run(s0, planForetell(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    expect(spirits(s, ap)).toBe(1);
    expect(foretellActionCost(s, ap)).toBe("{2}");
    s = settle(run(s, planForetell(s, ap, ids[1]!)));
    expect(spirits(s, ap)).toBe(2);
  });

  it("a card foretold this turn before Ranar was there was the first", () => {
    const { s: s0, ap, ids } = setup([doomskar(), doomskar()]);
    let s = settle(run(s0, planForetell(s0, ap, ids[0]!)));
    putOnBattlefield(s, ap, ranar());
    expect(foretellActionCost(s, ap)).toBe("{2}");
  });

  it("an opponent's Ranar doesn't make yours free; your ability exiling several permanents makes one Spirit for the event", () => {
    const { s: s0, ap, opp, ids } = setup([sphere()]);
    putOnBattlefield(s0, opp, ranar());
    expect(foretellActionCost(s0, ap)).toBe("{2}");
    putOnBattlefield(s0, ap, ranar());
    const b = putOnBattlefield(s0, opp, bear());
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, opp, bear());
    const s = castOn(s0, ap, ids[0]!, [], b);
    expect(s.objects[b]!.zone).toBe("exile");
    expect(spirits(s, ap)).toBe(1); // once for the event (rulings)
    expect(spirits(s, opp)).toBe(0);
  });
});

describe("round 404: Kraven the Hunter", () => {
  it("an opponent's creature with the greatest power dying draws a card and puts a +1/+1 counter; a smaller one doesn't", () => {
    const { s: s0, ap, opp, ids } = setup([bolt(), bolt(), bolt()]);
    const k = putOnBattlefield(s0, ap, kraven());
    const g = putOnBattlefield(s0, opp, giant());
    const b = putOnBattlefield(s0, opp, bear());
    let s = castOn(s0, ap, ids[0]!, [tgt(b)]);
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(counters(s, k)).toBe(0);
    const hand = handSize(s, ap) - 1;
    s = castOn(s, ap, ids[1]!, [tgt(g)]);
    expect(s.objects[g]!.zone).toBe("graveyard");
    expect(counters(s, k)).toBe(1);
    expect(handSize(s, ap)).toBe(hand + 1);
  });

  it("tied for the greatest power counts; your own creatures don't", () => {
    const { s: s0, ap, opp, ids } = setup([bolt(), bolt()]);
    const k = putOnBattlefield(s0, ap, kraven());
    const b1 = putOnBattlefield(s0, opp, bear());
    putOnBattlefield(s0, opp, bear());
    const mine = putOnBattlefield(s0, ap, bear());
    let s = castOn(s0, ap, ids[0]!, [tgt(b1)]);
    expect(counters(s, k)).toBe(1);
    s = castOn(s, ap, ids[1]!, [tgt(mine)]);
    expect(counters(s, k)).toBe(1);
  });

  it("dying together, each is compared with the others as they last existed: only the greatest triggers", () => {
    const { s: s0, ap, opp, ids } = setup([wrath()]);
    putOnBattlefield(s0, ap, kraven());
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    putOnBattlefield(s0, opp, giant());
    putOnBattlefield(s0, opp, bear());
    putOnBattlefield(s0, other, bear());
    putOnBattlefield(s0, other, bear());
    const hand = handSize(s0, ap) - 1;
    const s = castOn(s0, ap, ids[0]!);
    // The Giant (opp's greatest) and both of the other player's tied Bears.
    expect(handSize(s, ap)).toBe(hand + 3);
  });

  it("Kraven dying at the same time still sees them die (CR 603.10a)", () => {
    const { s: s0, ap, opp, ids } = setup([wrath()]);
    putOnBattlefield(s0, ap, kraven());
    putOnBattlefield(s0, opp, giant());
    const hand = handSize(s0, ap) - 1;
    const s = castOn(s0, ap, ids[0]!);
    expect(handSize(s, ap)).toBe(hand + 1);
  });
});

describe("round 404: Eriette, the Beguiler", () => {
  it("your Aura attached to an opponent's permanent with no greater mana value: you control it while the Aura is attached", () => {
    const { s: s0, ap, opp, ids } = setup([pacifism(), disenchant()]);
    putOnBattlefield(s0, ap, eriette());
    const b = putOnBattlefield(s0, opp, bear());
    let s = castOn(s0, ap, ids[0]!, [tgt(b)]);
    expect(s.objects[ids[0]!]!.attachedTo).toBe(b);
    expect(characteristics(s, s.objects[b]!).controller).toBe(ap);
    s = castOn(s, ap, ids[1]!, [tgt(ids[0]!)]);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(characteristics(s, s.objects[b]!).controller).toBe(opp);
  });

  it("a permanent with a greater mana value isn't taken; nor is your own", () => {
    const { s: s0, ap, opp, ids } = setup([pacifism(), pacifism()]);
    putOnBattlefield(s0, ap, eriette());
    const g = putOnBattlefield(s0, opp, giant());
    const mine = putOnBattlefield(s0, ap, bear());
    let s = castOn(s0, ap, ids[0]!, [tgt(g)]);
    expect(s.objects[ids[0]!]!.attachedTo).toBe(g);
    expect(characteristics(s, s.objects[g]!).controller).toBe(opp);
    s = castOn(s, ap, ids[1]!, [tgt(mine)]);
    expect(characteristics(s, s.objects[mine]!).controller).toBe(ap);
  });

  it("an Aura no longer attached as the ability resolves gives nothing (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([pacifism(), disenchant()]);
    putOnBattlefield(s0, ap, eriette());
    const b = putOnBattlefield(s0, opp, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(b)]));
    // Pass until Pacifism has resolved and Eriette's trigger is on the stack, then answer it with Disenchant.
    for (let i = 0; i < 20 && !(s.stack.length === 1 && s.stack[0]!.kind === "ability"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[ids[0]!]!.attachedTo).toBe(b);
    expect(waitingOn(s)).toBe(ap);
    s = castOn(s, ap, ids[1]!, [tgt(ids[0]!)]);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.stack.length).toBe(0);
    expect(characteristics(s, s.objects[b]!).controller).toBe(opp);
  });

  it("Eriette leaving doesn't end it", () => {
    const { s: s0, ap, opp, ids } = setup([pacifism(), swords()]);
    const e = putOnBattlefield(s0, ap, eriette());
    const b = putOnBattlefield(s0, opp, bear());
    let s = castOn(s0, ap, ids[0]!, [tgt(b)]);
    s = castOn(s, ap, ids[1]!, [tgt(e)]);
    expect(s.objects[e]!.zone).toBe("exile");
    expect(characteristics(s, s.objects[b]!).controller).toBe(ap);
  });
});
