// Round 438 (Lane A): Dawnhand Dissident ("During your turn, you may cast creature spells from among cards you own exiled
// with this creature by removing three counters from among creatures you control in addition to paying their other
// costs.": the cards its "{T}, Blight 2: Exile target card from a graveyard." exiled, CR 607.2a; the counters an
// additional cost, CR 601.2f-h; rulings).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, castProblem, invalidateCharacteristics, isFullySupported, moveObject, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const dissident = (): CardDef => ({"oracleId":"2cabf7a4-17af-45c7-b314-a84f5dc0d070","name":"Dawnhand Dissident","manaCost":"{B}","cmc":1,"typeLine":"Creature — Elf Warlock","supertypes":[],"types":["Creature"],"subtypes":["Elf","Warlock"],"oracleText":"{T}, Blight 1: Surveil 1.\n{T}, Blight 2: Exile target card from a graveyard.\nDuring your turn, you may cast creature spells from among cards you own exiled with this creature by removing three counters from among creatures you control in addition to paying their other costs.","power":"1","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":["Blight","Surveil"],"imageUrl":"https://cards.scryfall.io/normal/front/6/a/6ac1f765-f348-4813-88dc-26376e0f3f33.jpg?1783904467","artUrl":"https://cards.scryfall.io/art_crop/front/6/a/6ac1f765-f348-4813-88dc-26376e0f3f33.jpg?1783904467","commanderLegal":"legal","set":"ecl","releasedAt":"2026-01-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const wurm = (): CardDef => ({"oracleId":"6a462a69-3e42-41de-a3aa-a488d9f38d69","name":"Craw Wurm","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"","power":"6","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

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
const inYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  moveObject(s, id, "graveyard");
  invalidateCharacteristics(s);
  return id;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const tgt = (id: ObjectId) => ({ kind: "object" as const, id });

/** Dissident (not summoning sick) and a Craw Wurm (6/4) to blight; `card` exiled with Dissident's second ability. */
const exiled = (def: CardDef, owner?: "opp") => {
  const { s: s0, ap, opp } = setup([]);
  const d = putOnBattlefield(s0, ap, dissident());
  const helper = putOnBattlefield(s0, ap, wurm());
  const c = inYard(s0, owner ? opp : ap, def);
  const s = settle(run(s0, planActivate(s0, ap, d, 1, [tgt(c)], undefined, undefined, undefined, { counterOn: [helper] })));
  return { s, ap, opp, d, helper, c };
};

describe("round 438: Dawnhand Dissident", () => {
  it("is fully supported", () => {
    expect(isFullySupported(dissident())).toBe(true);
  });

  it("exiles a creature card from your graveyard, then casts it by removing three counters from among creatures you control", () => {
    let { s, ap, d, helper, c } = exiled(bears());
    expect(zone(s, c)).toBe("exile");
    expect(s.objects[helper]!.counters["-1/-1"]).toBe(2);
    expect(s.objects[d]!.tapped).toBe(true);
    // Two counters aren't enough.
    expect(planCast(s, ap, c)).toBeNull();
    expect(castProblem(s, ap, c)).toBeTruthy();
    const third = putOnBattlefield(s, ap, bears());
    s.objects[third]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s);
    s = run(s, planCast(s, ap, c, undefined, undefined, undefined, undefined, { counters: [{ id: helper, kind: "-1/-1" }, { id: helper, kind: "-1/-1" }, { id: third, kind: "+1/+1" }] }));
    expect(s.objects[helper]!.counters["-1/-1"] ?? 0).toBe(0);
    expect(s.objects[third]!.counters["+1/+1"] ?? 0).toBe(0);
    s = settle(s);
    expect(zone(s, c)).toBe("battlefield");
  });

  it("only creature cards you own, and only during your turn", () => {
    const a = exiled(divination());
    a.s.objects[a.helper]!.counters["-1/-1"] = 3;
    invalidateCharacteristics(a.s);
    expect(zone(a.s, a.c)).toBe("exile");
    expect(planCast(a.s, a.ap, a.c, undefined, undefined, undefined, undefined, { counters: [{ id: a.helper, kind: "-1/-1" }, { id: a.helper, kind: "-1/-1" }, { id: a.helper, kind: "-1/-1" }] })).toBeNull();
    const b = exiled(bears(), "opp");
    b.s.objects[b.helper]!.counters["-1/-1"] = 3;
    invalidateCharacteristics(b.s);
    expect(zone(b.s, b.c)).toBe("exile");
    expect(planCast(b.s, b.ap, b.c, undefined, undefined, undefined, undefined, { counters: [{ id: b.helper, kind: "-1/-1" }, { id: b.helper, kind: "-1/-1" }, { id: b.helper, kind: "-1/-1" }] })).toBeNull();
    // Your own creature card on another player's turn: not then (and not at instant speed).
    const e = exiled(bears());
    e.s.objects[e.helper]!.counters = { "+1/+1": 5 };
    invalidateCharacteristics(e.s);
    const next = e.s.turnOrder[(e.s.turnOrder.indexOf(e.ap) + 1) % 4]!;
    const t = passUntil(e.s, "main1", next);
    expect(castProblem(t, e.ap, e.c)).toBeTruthy();
  });

  it("not once Dawnhand Dissident has left the battlefield", () => {
    const { s, ap, d, helper, c } = exiled(bears());
    s.objects[helper]!.counters = { "+1/+1": 5 };
    moveObject(s, d, "graveyard");
    invalidateCharacteristics(s);
    expect(planCast(s, ap, c, undefined, undefined, undefined, undefined, { counters: [{ id: helper, kind: "+1/+1" }, { id: helper, kind: "+1/+1" }, { id: helper, kind: "+1/+1" }] })).toBeNull();
  });

  it("a bot casts the exiled creature card, removing three counters", () => {
    const { s, ap, helper, c } = exiled(bears());
    // Only +1/+1 counters (+1/+1 and -1/-1 counters on one permanent cancel as state-based actions, CR 704.5q).
    s.objects[helper]!.counters = { "+1/+1": 4 };
    s.players[ap]!.hand = [];
    s.players[ap]!.command = [];
    invalidateCharacteristics(s);
    const plan = botActions(s, ap);
    expect(plan.some((a) => a.type === "castSpell" && a.objectId === c)).toBe(true);
    const t = settle(run(s, plan));
    expect(zone(t, c)).toBe("battlefield");
    // The bot keeps a +1/+1 counter where it can: three of the four removed.
    expect(t.objects[helper]!.counters["+1/+1"]).toBe(1);
  });
});
