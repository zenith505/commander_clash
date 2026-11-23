// Lane B round B305: Panglacial Wurm ("While you're searching your library, you may cast ~ from your library."): its
// rulings (the normal rules for casting it except for timing and the zone; mana abilities to pay for it; before any card is
// found; it can't be found by the search; several may be cast in one search; only your own library, while you search it).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const wurm = (): CardDef => ({"oracleId":"49d4aef7-d2d1-4f66-bc2a-79ec8cc96565","name":"Panglacial Wurm","manaCost":"{5}{G}{G}","cmc":7,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"Trample\nWhile you're searching your library, you may cast this card from your library.","power":"9","toughness":"5","colors":["G"],"colorIdentity":["G"],"keywords":["Trample"],"commanderLegal":"legal","set":"csp","releasedAt":"2006-07-21","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const rampant = (): CardDef => ({"oracleId":"8539f295-5d58-4436-a73a-b9277c4c7795","name":"Rampant Growth","manaCost":"{1}{G}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bribery = (): CardDef => ({"oracleId":"6d194882-ca37-49bb-ac9f-a751c53850a8","name":"Bribery","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Search target opponent's library for a creature card and put that card onto the battlefield under your control. Then that player shuffles.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"cmm","releasedAt":"2023-08-04","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const mindcensor = (): CardDef => ({"oracleId":"d9517c5d-66d0-4178-96fb-a8c04f311ad8","name":"Aven Mindcensor","manaCost":"{2}{W}","cmc":3,"typeLine":"Creature — Bird Wizard","supertypes":[],"types":["Creature"],"subtypes":["Bird","Wizard"],"oracleText":"Flash\nFlying\nIf an opponent would search a library, that player searches the top four cards of that library instead.","power":"2","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Flash"],"commanderLegal":"legal","set":"akh","releasedAt":"2017-04-28","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** A copy of `def` put `at` cards from the top of `pid`'s library. */
const toLibrary = (s: GameState, pid: PlayerId, def: CardDef, at = 0) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.splice(at, 0, id);
  return id;
};
const forestIn = (s: GameState, pid: PlayerId) => s.players[pid]!.library.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest")!;

describe("Lane B round B305: Panglacial Wurm", () => {
  it("is fully supported", () => {
    expect(isFullySupported(wurm())).toBe(true);
  });

  it("is offered before the search finds anything, cast for its mana cost, can't be found, and resolves after the search's spell", () => {
    const { s: s0, ap, ids } = setup([rampant()]);
    const w = toLibrary(s0, ap, wurm(), 30);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto")));
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: w, how: "paid", whileSearching: true, source: "Rampant Growth" });
    // Cast it, tapping lands for it now (CR 605.3a).
    const plan = planCast(s, ap, w, undefined, undefined, "auto");
    expect(plan).not.toBeNull();
    s = run(s, plan);
    expect(s.objects[w]!.zone).toBe("stack");
    // The search goes on, without the Wurm.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    if (s.pending?.kind !== "searchLibrary") throw new Error();
    expect(s.pending.cards).not.toContain(w);
    const land = s.pending.cards.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest")!;
    s = act(s, { type: "searchLibrary", player: ap, found: [land] });
    // Rampant Growth is done; the Wurm is still on the stack, then resolves.
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.objects[land]!.zone).toBe("battlefield");
    expect(s.stack.map((i) => i.objectId)).toEqual([w]);
    s = settle(s);
    expect(s.objects[w]!.zone).toBe("battlefield");
    expect(s.objects[w]!.controller).toBe(ap);
  });

  it("declined, the search goes on and the Wurm may be found", () => {
    const { s: s0, ap, ids } = setup([rampant()]);
    const w = toLibrary(s0, ap, wurm(), 30);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto")));
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: w });
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = act(s, { type: "searchLibrary", player: ap, found: [forestIn(s, ap)] });
    s = settle(s);
    expect(s.objects[w]!.zone).toBe("library");
    expect(s.stack.length).toBe(0);
  });

  it("two Wurms are offered one after the other in one search", () => {
    const { s: s0, ap, ids } = setup([rampant()]);
    for (let i = 0; i < 6; i++) putOnBattlefield(s0, ap, s0.cards[s0.objects[s0.players[ap]!.library.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Forest")!]!.cardId]!);
    const w1 = toLibrary(s0, ap, wurm(), 10);
    const w2 = toLibrary(s0, ap, wurm(), 40);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto")));
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: w1 });
    s = run(s, planCast(s, ap, w1, undefined, undefined, "auto"));
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: w2 });
    s = run(s, planCast(s, ap, w2, undefined, undefined, "auto"));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [forestIn(s, ap)] }));
    expect(s.objects[w1]!.zone).toBe("battlefield");
    expect(s.objects[w2]!.zone).toBe("battlefield");
  });

  it("isn't offered for a search of another player's library, nor for an opponent's Wurm", () => {
    const { s: s0, ap, ids, opp } = setup([bribery()]);
    const theirs = toLibrary(s0, opp, wurm(), 5);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, "auto")));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    if (s.pending?.kind !== "searchLibrary") throw new Error();
    // Bribery finds it instead.
    expect(s.pending.cards).toContain(theirs);
  });

  it("with an opponent's Aven Mindcensor, only a Wurm among the top four cards is offered", () => {
    const { s: s0, ap, ids, opp } = setup([rampant()]);
    putOnBattlefield(s0, opp, mindcensor());
    toLibrary(s0, ap, wurm(), 10);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto")));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const { s: t0, ap: bp, ids: tids, opp: bopp } = setup([rampant()]);
    putOnBattlefield(t0, bopp, mindcensor());
    const w = toLibrary(t0, bp, wurm(), 2);
    const t = settle(run(t0, planCast(t0, bp, tids[0]!, undefined, undefined, "auto")));
    expect(t.pending).toMatchObject({ kind: "castFree", objectId: w });
  });

  it("a bot casts it when it can pay, and searches on", () => {
    const { s: s0, ap, ids } = setup([rampant()]);
    const w = toLibrary(s0, ap, wurm(), 30);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto")));
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: w });
    for (const a of botActions(s, ap)) s = act(s, a);
    expect(s.objects[w]!.zone).toBe("stack");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
  });
});
