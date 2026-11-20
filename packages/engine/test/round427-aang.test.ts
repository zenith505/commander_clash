// Round 427 (Lane A): Avatar Aang // Aang, Master of Elements. "Whenever you waterbend, earthbend, firebend, or airbend,
// draw a card. Then if you've done all four this turn, transform Avatar Aang." (CR 701.65b, 701.66b, 701.67a, 702.189b;
// rulings: a waterbend cost however paid, the whole turn counted), "Spells you cast cost {W}{U}{B}{R}{G} less to cast."
// (CR 118.7b-c) and "At the beginning of each upkeep, you may transform Aang, Master of Elements. If you do, ..."

import { describe, expect, it } from "vitest";
import { act, bear, passUntil, putOnBattlefield, setup, swamp } from "./helpers";
import { spellCost } from "../src/game";
import { invalidateCharacteristics } from "../src/layers";
import { transformPermanent } from "../src/effects/run-permanents";
import { applyAction, characteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const aang = (): CardDef => ({"oracleId":"b4872bac-5822-4c35-9b73-38c4e3ffa477","name":"Avatar Aang // Aang, Master of Elements","manaCost":"{R}{G}{W}{U}","cmc":4,"typeLine":"Legendary Creature — Human Avatar Ally // Legendary Creature — Avatar Ally","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Avatar","Ally"],"oracleText":"Flying, firebending 2\nWhenever you waterbend, earthbend, firebend, or airbend, draw a card. Then if you've done all four this turn, transform Avatar Aang.","power":"4","toughness":"4","colors":["G","R","U","W"],"colorIdentity":["B","G","R","U","W"],"keywords":["Flying","Transform","Firebending"],"commanderLegal":"legal","layout":"transform","faces":[{"name":"Avatar Aang","manaCost":"{R}{G}{W}{U}","typeLine":"Legendary Creature — Human Avatar Ally","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Avatar","Ally"],"oracleText":"Flying, firebending 2\nWhenever you waterbend, earthbend, firebend, or airbend, draw a card. Then if you've done all four this turn, transform Avatar Aang.","power":"4","toughness":"4","colors":["G","R","U","W"]},{"name":"Aang, Master of Elements","manaCost":"","typeLine":"Legendary Creature — Avatar Ally","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Avatar","Ally"],"oracleText":"Flying\nSpells you cast cost {W}{U}{B}{R}{G} less to cast. (This can reduce generic costs.)\nAt the beginning of each upkeep, you may transform Aang, Master of Elements. If you do, you gain 4 life, draw four cards, put four +1/+1 counters on him, and he deals 4 damage to each opponent.","power":"6","toughness":"6","colors":[]}]} as unknown as CardDef);
const waterbender = (): CardDef => ({"oracleId":"100771fd-07db-47be-ada3-935dc918fa33","name":"Ruthless Waterbender","manaCost":"{1}{B}","cmc":2,"typeLine":"Creature — Human Soldier Ally","supertypes":[],"types":["Creature"],"subtypes":["Human","Soldier","Ally"],"oracleText":"Waterbend {2}: This creature gets +1/+1 until end of turn. Activate only during your turn. (While paying a waterbend cost, you can tap your artifacts and creatures to help. Each one pays for {1}.)","power":"1","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":["Waterbend"],"commanderLegal":"legal","layout":"normal"} as unknown as CardDef);
const earthLesson = (): CardDef => ({"oracleId":"5e113f0f-4469-4276-82e1-0a804f3de444","name":"Earthbending Lesson","manaCost":"{3}{G}","cmc":4,"typeLine":"Sorcery — Lesson","supertypes":[],"types":["Sorcery"],"subtypes":["Lesson"],"oracleText":"Earthbend 4. (Target land you control becomes a 0/0 creature with haste that's still a land. Put four +1/+1 counters on it. When it dies or is exiled, return it to the battlefield tapped.)","colors":["G"],"colorIdentity":["G"],"keywords":["Earthbend"],"commanderLegal":"legal","layout":"normal"} as unknown as CardDef);
const airLesson = (): CardDef => ({"oracleId":"e101b744-9175-4aa5-bf80-d6944359e538","name":"Airbending Lesson","manaCost":"{2}{W}","cmc":3,"typeLine":"Instant — Lesson","supertypes":[],"types":["Instant"],"subtypes":["Lesson"],"oracleText":"Airbend target nonland permanent. (Exile it. While it's exiled, its owner may cast it for {2} rather than its mana cost.)\nDraw a card.","colors":["W"],"colorIdentity":["W"],"keywords":["Airbend"],"commanderLegal":"legal","layout":"normal"} as unknown as CardDef);
const fireSages = (): CardDef => ({"oracleId":"08d1940a-ddc6-4b6d-b6c9-9d2aa470b906","name":"Fire Sages","manaCost":"{1}{R}","cmc":2,"typeLine":"Creature — Human Cleric","supertypes":[],"types":["Creature"],"subtypes":["Human","Cleric"],"oracleText":"Firebending 1 (Whenever this creature attacks, add {R}. This mana lasts until end of combat.)\n{1}{R}{R}: Put a +1/+1 counter on this creature.","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Firebending"],"commanderLegal":"legal","layout":"normal"} as unknown as CardDef);
const waterLesson = (): CardDef => ({"oracleId":"3d28886c-46bf-4d2e-a257-cb9016cc3573","name":"Waterbending Lesson","manaCost":"{3}{U}","cmc":4,"typeLine":"Sorcery — Lesson","supertypes":[],"types":["Sorcery"],"subtypes":["Lesson"],"oracleText":"Draw three cards. Then discard a card unless you waterbend {2}. (While paying a waterbend cost, you can tap your artifacts and creatures to help. Each one pays for {1}.)","colors":["U"],"colorIdentity":["U"],"keywords":["Waterbend"],"commanderLegal":"legal","layout":"normal"} as unknown as CardDef);
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","layout":"normal"} as unknown as CardDef);

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
const nameOf = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).name;
const handSize = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.length;
const landOf = (s: GameState, pid: PlayerId) => s.battlefield.find((id) => s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).types.includes("Land") && !characteristics(s, s.objects[id]!).types.includes("Creature"))!;

/** The four kinds of bending, each its own way, with Avatar Aang on the battlefield (unless `late`). */
function scene() {
  const { s, ap, ids, opp } = setup([earthLesson(), airLesson()]);
  const wb = putOnBattlefield(s, ap, waterbender());
  const fs = putOnBattlefield(s, ap, fireSages());
  const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
  return { s, ap, opp, earth: ids[0]!, air: ids[1]!, wb, fs, theirs };
}
const waterbend = (s: GameState, ap: PlayerId, wb: ObjectId) => settle(run(s, planActivate(s, ap, wb, 0)));
const earthbend = (s: GameState, ap: PlayerId, card: ObjectId) => settle(run(s, planCast(s, ap, card, [tgt(landOf(s, ap))])));
const airbend = (s: GameState, ap: PlayerId, card: ObjectId, what: ObjectId) => settle(run(s, planCast(s, ap, card, [tgt(what)])));
/** On to combat, attacking `opp` with Fire Sages: its firebending trigger resolves; stops once it has. */
function firebend(s: GameState, ap: PlayerId, opp: PlayerId, fs: ObjectId) {
  for (let i = 0; i < 300; i++) {
    const p = s.pending;
    if (p?.kind === "declareAttackers") {
      s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: fs, defender: opp }] });
      return settle(s);
    }
    if (p) throw new Error(`unexpected ${p.kind}`);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error("no combat");
}

describe("round 427: Avatar Aang compiles", () => {
  it("both faces", () => {
    expect(isFullySupported(aang())).toBe(true);
  });
});

describe("Avatar Aang: whenever you waterbend, earthbend, firebend, or airbend", () => {
  it("draws a card for each, and transforms after the fourth kind", () => {
    let { s, ap, opp, earth, air, wb, fs, theirs } = scene();
    const a = putOnBattlefield(s, ap, aang());
    let hand = handSize(s, ap);
    s = waterbend(s, ap, wb);
    expect(handSize(s, ap)).toBe(hand + 1);
    expect(s.turnLog?.bent?.[ap]).toEqual(["water"]);
    hand = handSize(s, ap);
    s = earthbend(s, ap, earth);
    // The Lesson left the hand, Aang's trigger drew one.
    expect(handSize(s, ap)).toBe(hand);
    hand = handSize(s, ap);
    s = airbend(s, ap, air, theirs);
    expect(s.objects[theirs]!.zone).toBe("exile");
    // Airbending Lesson's own draw and Aang's.
    expect(handSize(s, ap)).toBe(hand + 1);
    expect(nameOf(s, a)).toBe("Avatar Aang");
    hand = handSize(s, ap);
    s = firebend(s, ap, opp, fs);
    expect(handSize(s, ap)).toBe(hand + 1);
    expect(s.turnLog?.bent?.[ap]?.sort()).toEqual(["air", "earth", "fire", "water"]);
    expect(nameOf(s, a)).toBe("Aang, Master of Elements");
  });

  it("the same kind twice draws twice but doesn't transform", () => {
    let { s, ap, wb } = scene();
    const a = putOnBattlefield(s, ap, aang());
    const hand = handSize(s, ap);
    s = waterbend(s, ap, wb);
    s = waterbend(s, ap, wb);
    expect(handSize(s, ap)).toBe(hand + 2);
    expect(nameOf(s, a)).toBe("Avatar Aang");
  });

  it("counts bending done this turn before it was on the battlefield (rulings)", () => {
    let { s, ap, opp, earth, air, wb, fs, theirs } = scene();
    s = waterbend(s, ap, wb);
    s = earthbend(s, ap, earth);
    s = airbend(s, ap, air, theirs);
    const a = putOnBattlefield(s, ap, aang());
    const hand = handSize(s, ap);
    s = firebend(s, ap, opp, fs);
    expect(handSize(s, ap)).toBe(hand + 1);
    expect(nameOf(s, a)).toBe("Aang, Master of Elements");
  });

  it("an opponent's bending doesn't trigger it", () => {
    const { s: s0, ap, opp } = scene();
    putOnBattlefield(s0, ap, aang());
    const theirWb = putOnBattlefield(s0, opp, waterbender());
    for (const l of [swamp, swamp]) putOnBattlefield(s0, opp, l);
    let s = passUntil(s0, "main1", opp, 4000);
    const hand = handSize(s, ap);
    s = waterbend(s, opp, theirWb);
    expect(s.turnLog?.bent?.[opp]).toEqual(["water"]);
    expect(s.turnLog?.bent?.[ap]).toBeUndefined();
    expect(handSize(s, ap)).toBe(hand);
  });

  it("paying \"unless you waterbend {2}\" waterbends; discarding instead doesn't", () => {
    for (const pay of [true, false]) {
      const { s: s0, ap, ids } = setup([waterLesson(), divination()]);
      putOnBattlefield(s0, ap, aang());
      let s = run(s0, planCast(s0, ap, ids[0]!));
      for (let i = 0; i < 50 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.pending?.kind).toBe("payUnless");
      if (pay) {
        const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped && characteristics(s, s.objects[id]!).subtypes.includes("Island"));
        s = act(s, { type: "activateMana", player: ap, objectId: lands[0]!, mana: "U" });
        s = act(s, { type: "activateMana", player: ap, objectId: lands[1]!, mana: "U" });
        s = act(s, { type: "payUnless", player: ap, pay: true } as Action);
      } else s = act(s, { type: "payUnless", player: ap, pay: false } as Action);
      for (let i = 0; i < 50 && s.pending?.kind === "discard"; i++) s = act(s, { type: "discard", player: ap, objectIds: [s.players[ap]!.hand[0]!] });
      s = settle(s);
      expect(s.turnLog?.bent?.[ap] ?? []).toEqual(pay ? ["water"] : []);
    }
  });
});

describe("Aang, Master of Elements", () => {
  const master = () => {
    const { s, ap, ids, opp } = setup([divination()]);
    const a = putOnBattlefield(s, ap, aang());
    expect(transformPermanent(s, s.objects[a]!)).toBe(true);
    invalidateCharacteristics(s);
    expect(nameOf(s, a)).toBe("Aang, Master of Elements");
    return { s, ap, ids, opp, a };
  };

  it("spells you cast cost {W}{U}{B}{R}{G} less, the colors it doesn't have off the generic mana (CR 118.7b-c)", () => {
    const { s, ap, ids } = master();
    // Divination {2}{U}: {U} off the blue, then {W}, {B}, {R}, {G} off the generic {2}: free.
    expect(spellCost(s, ap, s.objects[ids[0]!]!).cost.symbols).toEqual([]);
    const hand = putOnBattlefield(s, ap, bear());
    s.battlefield.splice(s.battlefield.indexOf(hand), 1);
    s.objects[hand]!.zone = "hand";
    s.players[ap]!.hand.push(hand);
    invalidateCharacteristics(s);
    // Grizzly Bears {1}{G}: {G} off the green, then {1} off by one of the rest.
    expect(spellCost(s, ap, s.objects[hand]!).cost.symbols).toEqual([]);
  });

  it("an opponent's spells cost the same as before", () => {
    const { s, opp } = master();
    const theirs = putOnBattlefield(s, opp, divination());
    s.battlefield.splice(s.battlefield.indexOf(theirs), 1);
    s.objects[theirs]!.zone = "hand";
    s.players[opp]!.hand.push(theirs);
    invalidateCharacteristics(s);
    expect(spellCost(s, opp, s.objects[theirs]!).cost.symbols.length).toBeGreaterThan(0);
  });

  it("at the beginning of each upkeep, transforming it back gains 4 life, draws four, puts four counters and deals 4 to each opponent", () => {
    let { s, ap, opp, a } = master();
    const life = s.players[ap]!.life;
    const theirLife = s.turnOrder.filter((p) => p !== ap).map((p) => s.players[p]!.life);
    // The next player's upkeep: "each upkeep".
    for (let i = 0; i < 500 && !(s.pending?.kind === "chooseMay" && s.pending.player === ap); i++) {
      const p = s.pending;
      if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
      else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
      else if (p) throw new Error(`unexpected ${p.kind}`);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.step).toBe("upkeep");
    expect(s.activePlayer).toBe(opp);
    const hand = handSize(s, ap);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(nameOf(s, a)).toBe("Avatar Aang");
    expect(s.players[ap]!.life).toBe(life + 4);
    expect(handSize(s, ap)).toBe(hand + 4);
    expect(s.objects[a]!.counters["+1/+1"]).toBe(4);
    expect(s.turnOrder.filter((p) => p !== ap).map((p) => s.players[p]!.life)).toEqual(theirLife.map((n) => n - 4));
  });

  it("declining leaves it as it is", () => {
    let { s, ap, a } = master();
    for (let i = 0; i < 500 && !(s.pending?.kind === "chooseMay" && s.pending.player === ap); i++) {
      const p = s.pending;
      if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
      else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
      else if (p) throw new Error(`unexpected ${p.kind}`);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    const life = s.players[ap]!.life;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(nameOf(s, a)).toBe("Aang, Master of Elements");
    expect(s.players[ap]!.life).toBe(life);
  });
});
