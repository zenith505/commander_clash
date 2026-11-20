// Round 426 (Lane A): Jasmine Boreal of the Seven ("{T}: Add {G}{W}. Spend this mana only to cast creature spells with no
// abilities." and "Creatures you control with no abilities can't be blocked by creatures with abilities.", CR 106.6, 113.1,
// 509.1b, 708.2a; rulings: an ability given to the spell as it's cast counts) and Niko, Light of Hope ("Exile target
// nonlegendary creature you control. Shards you control become copies of it until the next end step. Return it ...",
// CR 707.2, 608.2h, 611.2a, 513.2, 603.7).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { blockProblem, castProblem } from "../src/game";
import { invalidateCharacteristics } from "../src/layers";
import { applyAction, characteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const reunion = (): CardDef => ({"oracleId":"ba0a815c-1dfe-47c1-890f-496c670124f3","name":"Celestial Reunion","manaCost":"{X}{G}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"As an additional cost to cast this spell, you may choose a creature type and behold two creatures of that type.\nSearch your library for a creature card with mana value X or less, reveal it, put it into your hand, then shuffle. If this spell's additional cost was paid and the revealed card is the chosen type, put that card onto the battlefield instead of putting it into your hand.","colors":["G"],"colorIdentity":["G"],"keywords":["Behold"],"commanderLegal":"legal","layout":"normal"} as CardDef);
const llanowar = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","layout":"normal"} as CardDef);
const jasmine = (): CardDef => ({"oracleId":"138201c0-556d-4c76-b383-90fc9dad0fe0","name":"Jasmine Boreal of the Seven","manaCost":"{1}{G}{W}","cmc":3,"typeLine":"Legendary Creature — Human Druid","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Druid"],"oracleText":"{T}: Add {G}{W}. Spend this mana only to cast creature spells with no abilities.\nCreatures you control with no abilities can't be blocked by creatures with abilities.","power":"2","toughness":"4","colors":["G","W"],"colorIdentity":["G","W"],"keywords":[],"commanderLegal":"legal","layout":"normal"} as CardDef);
const niko = (): CardDef => ({"oracleId":"f153e369-1d5b-4d8b-a2f6-d93b849cabb5","name":"Niko, Light of Hope","manaCost":"{2}{W}{U}","cmc":4,"typeLine":"Legendary Creature — Human Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"When Niko enters, create two Shard tokens. (They're enchantments with \"{2}, Sacrifice this token: Scry 1, then draw a card.\")\n{2}, {T}: Exile target nonlegendary creature you control. Shards you control become copies of it until the next end step. Return it to the battlefield under its owner's control at the beginning of the next end step.","power":"3","toughness":"4","colors":["U","W"],"colorIdentity":["U","W"],"keywords":["Scry"],"commanderLegal":"legal","layout":"normal"} as CardDef);
const zinnia = (): CardDef => ({"oracleId":"d8c16a3a-dd9d-410c-a5d5-06339a89970f","name":"Zinnia, Valley's Voice","manaCost":"{U}{R}{W}","cmc":3,"typeLine":"Legendary Creature — Bird Bard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Bird","Bard"],"oracleText":"Flying\nZinnia gets +X/+0, where X is the number of other creatures you control with base power 1.\nCreature spells you cast gain offspring {2} as you cast them. (You may pay an additional {2} as you cast a creature spell. If you do, when that creature enters, create a 1/1 token copy of it.)","power":"1","toughness":"3","colors":["R","U","W"],"colorIdentity":["R","U","W"],"keywords":["Flying"],"commanderLegal":"legal","layout":"normal"} as CardDef);
const exalted = (): CardDef => ({"oracleId":"2f6e9ab8-6951-4c5f-bcde-0e96e0fe87f2","name":"Exalted Angel","manaCost":"{4}{W}{W}","cmc":6,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nWhenever this creature deals damage, you gain that much life.\nMorph {2}{W}{W} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)","power":"4","toughness":"5","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Morph"],"commanderLegal":"legal","layout":"normal"} as CardDef);
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","layout":"normal"} as CardDef);
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","layout":"normal"} as CardDef);
const serra = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"commanderLegal":"legal","layout":"normal"} as CardDef);
const mystic = (): CardDef => ({"oracleId":"3f3b2c10-21f8-4e13-be83-4ef3fa36e123","name":"Elvish Mystic","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","layout":"normal"} as CardDef);
const plains = (): CardDef => ({"oracleId":"bc71ebf6-2056-41f7-be35-b2e5c34afa99","name":"Plains","manaCost":"","cmc":0,"typeLine":"Basic Land — Plains","supertypes":["Basic"],"types":["Land"],"subtypes":["Plains"],"oracleText":"({T}: Add {W}.)","colors":[],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","layout":"normal"} as CardDef);
const shardToken = (): CardDef => ({ oracleId: "test-shard-token", name: "Shard", manaCost: "", cmc: 0, typeLine: "Token Enchantment — Shard", supertypes: [], types: ["Enchantment"], subtypes: ["Shard"], oracleText: "{2}, Sacrifice this token: Scry 1, then draw a card.", colors: [], colorIdentity: [], keywords: [], layout: "token" } as unknown as CardDef);

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: ObjectId): TargetChoice => ({ kind: "object", id });
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** No lands for `pid`: only the mana sources a test puts down. */
function noLands(s: GameState, pid: PlayerId) {
  s.battlefield = s.battlefield.filter((id) => !(s.objects[id]!.owner === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land")));
  invalidateCharacteristics(s);
}
const name = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).name;
const pt = (s: GameState, id: ObjectId) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const token = (s: GameState, pid: PlayerId) => {
  const id = putOnBattlefield(s, pid, shardToken());
  s.objects[id]!.isToken = true;
  invalidateCharacteristics(s);
  return id;
};

describe("round 426: compiles", () => {
  it("every card of the round", () => {
    for (const d of [jasmine(), niko(), reunion()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("Jasmine Boreal of the Seven: its mana", () => {
  it("pays for Grizzly Bears, a creature spell with no abilities", () => {
    const { s: s0, ap, ids } = setup([bears()]);
    noLands(s0, ap);
    const j = putOnBattlefield(s0, ap, jasmine());
    const plan = planCast(s0, ap, ids[0]!);
    expect(plan).not.toBeNull();
    const s = settle(run(s0, plan));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[j]!.tapped).toBe(true);
  });

  it("can't pay for Elvish Mystic (it has an ability, CR 113.1)", () => {
    const { s: s0, ap, ids } = setup([mystic()]);
    noLands(s0, ap);
    putOnBattlefield(s0, ap, jasmine());
    expect(planCast(s0, ap, ids[0]!)).toBeNull();
  });

  it("can't pay for Grizzly Bears while Zinnia gives creature spells offspring as they're cast (rulings)", () => {
    const { s: s0, ap, ids } = setup([bears()]);
    noLands(s0, ap);
    putOnBattlefield(s0, ap, jasmine());
    putOnBattlefield(s0, ap, zinnia());
    expect(planCast(s0, ap, ids[0]!)).toBeNull();
  });

  it("pays for a face-down spell, a 2/2 creature with no abilities (CR 708.2a): Exalted Angel cast face down with a Plains", () => {
    const { s: s0, ap, ids } = setup([exalted()]);
    noLands(s0, ap);
    const j = putOnBattlefield(s0, ap, jasmine());
    putOnBattlefield(s0, ap, plains());
    const plan = planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { faceDown: true });
    expect(plan).not.toBeNull();
    const s = settle(run(s0, plan));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.faceDown).toBeTruthy();
    expect(s.objects[j]!.tapped).toBe(true);
  });
});

describe("Jasmine Boreal of the Seven: can't be blocked by creatures with abilities", () => {
  it("your Grizzly Bears can't be blocked by Serra Angel, can be by Hill Giant; Jasmine itself can be by either", () => {
    const { s, ap, opp } = setup([]);
    const j = putOnBattlefield(s, ap, jasmine());
    const b = putOnBattlefield(s, ap, bears());
    const angel = putOnBattlefield(s, opp, serra());
    const giant = putOnBattlefield(s, opp, hillGiant());
    s.objects[b]!.attacking = opp;
    s.objects[j]!.attacking = opp;
    invalidateCharacteristics(s);
    expect(blockProblem(s, s.objects[angel]!, s.objects[b]!)).toMatch(/creatures with abilities/);
    expect(blockProblem(s, s.objects[giant]!, s.objects[b]!)).toBeNull();
    expect(blockProblem(s, s.objects[angel]!, s.objects[j]!)).toBeNull();
    expect(blockProblem(s, s.objects[giant]!, s.objects[j]!)).toBeNull();
  });

  it("an opponent's creatures with no abilities aren't helped; nor is your creature once it has an ability", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, jasmine());
    const theirs = putOnBattlefield(s, opp, bears());
    const myAngel = putOnBattlefield(s, ap, serra());
    const myMystic = putOnBattlefield(s, ap, mystic());
    const angel = putOnBattlefield(s, opp, serra());
    s.objects[theirs]!.attacking = ap;
    s.objects[myMystic]!.attacking = opp;
    invalidateCharacteristics(s);
    expect(blockProblem(s, s.objects[myAngel]!, s.objects[theirs]!)).toBeNull();
    expect(blockProblem(s, s.objects[angel]!, s.objects[myMystic]!)).toBeNull();
  });

  it("in combat: the defending player can't declare Serra Angel blocking the Bears", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, jasmine());
    const b = putOnBattlefield(s0, ap, bears());
    const angel = putOnBattlefield(s0, opp, serra());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("declareBlockers");
    expect(() => applyAction(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: angel, attacker: b }] })).toThrow(/creatures with abilities/);
  });
});

describe("Niko, Light of Hope", () => {
  const nikoUp = (s: GameState, ap: PlayerId) => {
    const n = putOnBattlefield(s, ap, niko());
    return { n, shards: [token(s, ap), token(s, ap)] };
  };

  it("Hill Giant exiled: both Shards become Hill Giants until the next end step, as it returns", () => {
    const { s: s0, ap } = setup([]);
    const { n, shards } = nikoUp(s0, ap);
    const giant = putOnBattlefield(s0, ap, hillGiant());
    let s = settle(run(s0, planActivate(s0, ap, n, 0, [tgt(giant)])));
    expect(s.objects[giant]!.zone).toBe("exile");
    for (const sh of shards) {
      expect(name(s, sh)).toBe("Hill Giant");
      expect(pt(s, sh)).toBe("3/3");
      const c = characteristics(s, s.objects[sh]!);
      expect(c.types).toEqual(["Creature"]);
      expect(c.subtypes).toEqual(["Giant"]);
      expect(s.objects[sh]!.isToken).toBe(true);
    }
    // The next end step: the copies end as it begins (CR 611.2a), and the Giant comes back (CR 603.7).
    s = passUntil(s, "end", ap);
    s = settle(s);
    for (const sh of shards) {
      expect(name(s, sh)).toBe("Shard");
      expect(characteristics(s, s.objects[sh]!).types).toEqual(["Enchantment"]);
    }
    expect(s.objects[giant]!.zone).toBe("battlefield");
  });

  it("the copies are of the creature as it last existed: its copiable values, not its counters (rulings, CR 707.2)", () => {
    const { s: s0, ap } = setup([]);
    const { n, shards } = nikoUp(s0, ap);
    const b = putOnBattlefield(s0, ap, bears());
    s0.objects[b]!.counters = { "+1/+1": 2 };
    invalidateCharacteristics(s0);
    expect(pt(s0, b)).toBe("4/4");
    const s = settle(run(s0, planActivate(s0, ap, n, 0, [tgt(b)])));
    for (const sh of shards) {
      expect(name(s, sh)).toBe("Grizzly Bears");
      expect(pt(s, sh)).toBe("2/2");
    }
  });

  it("only Shards you control: an opponent's Shard stays a Shard; can't target a legendary creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const { n, shards } = nikoUp(s0, ap);
    const theirs = token(s0, opp);
    const giant = putOnBattlefield(s0, ap, hillGiant());
    expect(planActivate(s0, ap, n, 0, [tgt(n)])).toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, n, 0, [tgt(giant)])));
    expect(name(s, shards[0]!)).toBe("Hill Giant");
    expect(name(s, theirs)).toBe("Shard");
  });

  it("activated during the end step: the copies last until the next turn's end step, when the creature returns (CR 513.2)", () => {
    const { s: s0, ap } = setup([]);
    const { n, shards } = nikoUp(s0, ap);
    const giant = putOnBattlefield(s0, ap, hillGiant());
    let s = passUntil(s0, "end", ap);
    s = settle(run(s, planActivate(s, ap, n, 0, [tgt(giant)])));
    expect(s.objects[giant]!.zone).toBe("exile");
    expect(name(s, shards[0]!)).toBe("Hill Giant");
    // Still copies after this turn's cleanup (not "until end of turn") and through the next turn's main phase.
    const next = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s = passUntil(s, "main1", next);
    expect(name(s, shards[0]!)).toBe("Hill Giant");
    expect(s.objects[giant]!.zone).toBe("exile");
    s = settle(passUntil(s, "end", next));
    expect(name(s, shards[0]!)).toBe("Shard");
    expect(s.objects[giant]!.zone).toBe("battlefield");
  });
});

describe("Celestial Reunion", () => {
  /** `pid`'s cards put into their hand. */
  function inHand(s: GameState, pid: PlayerId, defs: CardDef[]) {
    return defs.map((def) => {
      const id = putOnBattlefield(s, pid, def);
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      s.objects[id]!.zone = "hand";
      s.players[pid]!.hand.push(id);
      invalidateCharacteristics(s);
      return id;
    });
  }
  /** Only these cards in `pid`'s hand: the ones drawn go back to the library. */
  function onlyInHand(s: GameState, pid: PlayerId, keep: ObjectId[]) {
    const p = s.players[pid]!;
    for (const id of p.hand.filter((x) => !keep.includes(x))) {
      s.objects[id]!.zone = "library";
      p.library.push(id);
    }
    p.hand = p.hand.filter((x) => keep.includes(x));
    invalidateCharacteristics(s);
  }
  /** The first Grizzly Bears in `pid`'s library (setup's decks have 39). */
  const libraryBear = (s: GameState, pid: PlayerId) => s.players[pid]!.library.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Grizzly Bears")!;
  /** Cast it with X = 2 and these choices, then find `found` in the search. */
  function castAndFind(s0: GameState, ap: PlayerId, id: ObjectId, choices: object, found: (s: GameState) => ObjectId) {
    let s = settle(run(s0, planCast(s0, ap, id, undefined, undefined, "auto", 2, choices)));
    expect(s.pending?.kind).toBe("searchLibrary");
    const f = found(s);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [f] }));
    return { s, f };
  }

  it("paid, beholding a Bear you control and a Bear card from your hand: the Bear found goes onto the battlefield", () => {
    const { s: s0, ap, ids } = setup([reunion()]);
    onlyInHand(s0, ap, ids);
    const mine = putOnBattlefield(s0, ap, bears());
    const [fromHand] = inHand(s0, ap, [bears()]);
    const { s, f } = castAndFind(s0, ap, ids[0]!, { kicks: [0], creatureType: "Bear", reveal: [mine, fromHand!] }, (s) => libraryBear(s, ap));
    expect(s.objects[f]!.zone).toBe("battlefield");
    expect(s.objects[fromHand!]!.zone).toBe("hand");
    expect(s.objects[mine]!.zone).toBe("battlefield");
    expect(s.log.some((l) => /choosing Bear/.test(l.text))).toBe(true);
  });

  it("paid with Elves, the card found a Bear: into your hand (not the chosen type)", () => {
    const { s: s0, ap, ids } = setup([reunion()]);
    onlyInHand(s0, ap, ids);
    const e1 = putOnBattlefield(s0, ap, llanowar());
    const e2 = putOnBattlefield(s0, ap, mystic());
    const { s, f } = castAndFind(s0, ap, ids[0]!, { kicks: [0], creatureType: "Elf", reveal: [e1, e2] }, (s) => libraryBear(s, ap));
    expect(s.objects[f]!.zone).toBe("hand");
  });

  it("not paid: the Bear found goes into your hand, and no type is asked for", () => {
    const { s: s0, ap, ids } = setup([reunion()]);
    onlyInHand(s0, ap, ids);
    putOnBattlefield(s0, ap, bears());
    putOnBattlefield(s0, ap, bears());
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, 2, { creatureType: "Bear" })).toMatch(/only with its additional cost paid/);
    const { s, f } = castAndFind(s0, ap, ids[0]!, {}, (s) => libraryBear(s, ap));
    expect(s.objects[f]!.zone).toBe("hand");
  });

  it("two creatures of the chosen type, two different ones: one Bear isn't enough, nor an Elf for a Bear, nor the same Bear twice", () => {
    const { s: s0, ap, ids } = setup([reunion()]);
    onlyInHand(s0, ap, ids);
    const mine = putOnBattlefield(s0, ap, bears());
    const elf = putOnBattlefield(s0, ap, llanowar());
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 2, { kicks: [0], creatureType: "Bear", reveal: [mine] })).toBeNull();
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 2, { kicks: [0], creatureType: "Bear", reveal: [mine, elf] })).toBeNull();
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 2, { kicks: [0], creatureType: "Bear", reveal: [mine, mine] })).toBeNull();
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 2, { kicks: [0], creatureType: "Bear" })).toBeNull();
  });

  it("planned without a type: a type with two creatures to behold is chosen (Elf or Druid here)", () => {
    const { s: s0, ap, ids } = setup([reunion()]);
    onlyInHand(s0, ap, ids);
    putOnBattlefield(s0, ap, llanowar());
    putOnBattlefield(s0, ap, mystic());
    putOnBattlefield(s0, ap, bears());
    const plan = planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 2, { kicks: [0] });
    expect(plan).not.toBeNull();
    const cast = plan!.find((a) => a.type === "castSpell") as Extract<Action, { type: "castSpell" }> | undefined;
    expect(["Druid", "Elf"]).toContain((cast as { creatureType?: string } | undefined)?.creatureType);
  });
});
