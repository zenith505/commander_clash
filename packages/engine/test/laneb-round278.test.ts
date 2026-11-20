// Lane B round B278: Land Equilibrium ("If an opponent who controls at least as many lands as you do would put a land onto
// the battlefield, that player instead puts that land onto the battlefield then sacrifices a land of their choice."; CR
// 614.1a, 614.5, 614.12, rulings).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { botActions } from "../src/bot";
import { applyAction, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const landEquilibrium = (): CardDef => ({"oracleId":"a3711453-b17d-4b1c-b726-9b41f36d07ab","name":"Land Equilibrium","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If an opponent who controls at least as many lands as you do would put a land onto the battlefield, that player instead puts that land onto the battlefield then sacrifices a land of their choice.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const rampantGrowth = (): CardDef => ({"oracleId":"8539f295-5d58-4436-a73a-b9277c4c7795","name":"Rampant Growth","manaCost":"{1}{G}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const explosiveVegetation = (): CardDef => ({"oracleId":"a0abd957-01a0-4aa9-8fc8-0e6840d21606","name":"Explosive Vegetation","manaCost":"{3}{G}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle.","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const forest = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"layout":"normal"}) as CardDef;

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
const lands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land")).length;
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
const ofName = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === name);
/** Basic lands in `pid`'s library (setup's decks are Forests and Bears). */
const libraryForests = (s: GameState, pid: PlayerId) => s.players[pid]!.library.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest");
/** `n` Forests for `pid` (no summoning sickness to worry about: lands). */
const giveLands = (s: GameState, pid: PlayerId, n: number) => {
  for (let i = 0; i < n; i++) putOnBattlefield(s, pid, forest());
  invalidateCharacteristics(s);
};

describe("Land Equilibrium", () => {
  it("is supported", () => {
    expect(isFullySupported(landEquilibrium())).toBe(true);
    expect(isFullySupported(rampantGrowth())).toBe(true);
    expect(isFullySupported(explosiveVegetation())).toBe(true);
  });

  /** You (14 lands) have a Forest in hand; the next player controls Land Equilibrium and `oppLands` lands. */
  const board = (oppLands: number, extra: CardDef[] = []) => {
    const { s, ap, opp, ids } = setup([forest(), ...extra]);
    putOnBattlefield(s, opp, landEquilibrium());
    giveLands(s, opp, oppLands);
    return { s, ap, opp, forestId: ids[0]!, ids };
  };

  it("an opponent with at least as many lands who plays a land puts it there, then sacrifices a land of their choice", () => {
    const { s: s0, ap, opp, forestId } = board(3);
    expect(lands(s0, ap)).toBe(14);
    let s = act(s0, { type: "playLand", player: ap, objectId: forestId });
    // The land is on the battlefield as the sacrifice is chosen; it's one of the choices (rulings).
    expect(zone(s, forestId)).toBe("battlefield");
    expect(s.pending?.kind).toBe("pickPermanents");
    const pend = s.pending as Extract<GameState["pending"], { kind: "pickPermanents" }>;
    expect(pend.player).toBe(ap);
    expect(pend.equilibrium).toBe(true);
    expect(pend.options).toContain(forestId);
    expect(pend.options.length).toBe(15);
    expect(waitingOn(s)).toBe(ap);
    const swamp = ofName(s, ap, "Swamp")[0]!;
    s = act(s, { type: "pickPermanents", player: ap, ids: [swamp] });
    expect(s.pending).toBeNull();
    expect(zone(s, swamp)).toBe("graveyard");
    expect(zone(s, forestId)).toBe("battlefield");
    expect(lands(s, ap)).toBe(14);
    expect(lands(s, opp)).toBe(3);
    expect(logged(s, /sacrifices Swamp \(Land Equilibrium\)/)).toBe(true);
    // Then the game goes on: you have priority in your main phase.
    expect(waitingOn(s)).toBe(ap);
    expect(s.stack.length).toBe(0);
  });

  it("may sacrifice the land just played", () => {
    const { s: s0, ap, forestId } = board(0);
    let s = act(s0, { type: "playLand", player: ap, objectId: forestId });
    s = act(s, { type: "pickPermanents", player: ap, ids: [forestId] });
    expect(zone(s, forestId)).toBe("graveyard");
    expect(lands(s, ap)).toBe(14);
  });

  it("only one land offered at a time: two of its lands or a land of another player's can't be chosen", () => {
    const { s: s0, ap, opp, forestId } = board(0);
    const s = act(s0, { type: "playLand", player: ap, objectId: forestId });
    const swamps = ofName(s, ap, "Swamp");
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: swamps.slice(0, 2) })).toThrow();
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: [ofName(s, opp, "Forest")[0] ?? "none"] })).toThrow();
  });

  it("no sacrifice when the opponent controls fewer lands than its controller", () => {
    const { s: s0, ap, forestId } = board(15);
    const s = act(s0, { type: "playLand", player: ap, objectId: forestId });
    expect(s.pending).toBeNull();
    expect(lands(s, ap)).toBe(15);
  });

  it("the same number of lands is enough (at least as many)", () => {
    const { s: s0, ap, forestId } = board(14);
    const s = act(s0, { type: "playLand", player: ap, objectId: forestId });
    expect(s.pending?.kind).toBe("pickPermanents");
  });

  it("doesn't affect its own controller", () => {
    const { s: s0, ap, ids } = setup([forest()]);
    const forestId = ids[0]!;
    putOnBattlefield(s0, ap, landEquilibrium());
    invalidateCharacteristics(s0);
    const s = act(s0, { type: "playLand", player: ap, objectId: forestId });
    expect(s.pending).toBeNull();
    expect(lands(s, ap)).toBe(15);
  });

  it("with only the new land, that land is sacrificed without a question", () => {
    const { s: s0, ap, forestId } = board(0);
    // You control no other land.
    for (const id of [...s0.battlefield]) if (s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.types.includes("Land")) {
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      delete s0.objects[id];
    }
    invalidateCharacteristics(s0);
    const s = act(s0, { type: "playLand", player: ap, objectId: forestId });
    expect(s.pending).toBeNull();
    expect(zone(s, forestId)).toBe("graveyard");
    expect(lands(s, ap)).toBe(0);
  });

  it("applies to a land a spell puts onto the battlefield, before the spell finishes resolving", () => {
    const { s: s0, ap, opp, ids } = board(2, [rampantGrowth()]);
    let s = run(s0, planCast(s0, ap, ids[1]!, []));
    s = settle(s);
    expect(s.pending?.kind).toBe("searchLibrary");
    const found = libraryForests(s, ap)[0]!;
    s = act(s, { type: "searchLibrary", player: ap, found: [found] });
    expect(zone(s, found)).toBe("battlefield");
    expect(s.pending?.kind).toBe("pickPermanents");
    expect((s.pending as { equilibrium?: true }).equilibrium).toBe(true);
    // Still resolving: Rampant Growth hasn't gone to the graveyard yet.
    expect(s.resolving).not.toBeNull();
    expect(zone(s, ids[1]!)).toBe("stack");
    const island = ofName(s, ap, "Island")[0]!;
    s = act(s, { type: "pickPermanents", player: ap, ids: [island] });
    expect(zone(s, island)).toBe("graveyard");
    s = settle(s);
    expect(zone(s, ids[1]!)).toBe("graveyard");
    expect(zone(s, found)).toBe("battlefield");
    expect(lands(s, opp)).toBe(2);
  });

  it("lands entering together are counted before the event: none owes a sacrifice when you had fewer lands", () => {
    const { s: s0, ap, ids } = board(15, [explosiveVegetation()]);
    let s = settle(run(s0, planCast(s0, ap, ids[1]!, [])));
    expect(s.pending?.kind).toBe("searchLibrary");
    const two = libraryForests(s, ap).slice(0, 2);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: two }));
    expect(s.pending).toBeNull();
    expect(two.map((id) => zone(s, id))).toEqual(["battlefield", "battlefield"]);
    expect(lands(s, ap)).toBe(16);
  });

  it("lands entering together with as many lands: one sacrifice for each of them", () => {
    const { s: s0, ap, ids } = board(14, [explosiveVegetation()]);
    let s = settle(run(s0, planCast(s0, ap, ids[1]!, [])));
    const two = libraryForests(s, ap).slice(0, 2);
    s = act(s, { type: "searchLibrary", player: ap, found: two });
    expect(s.pending?.kind).toBe("pickPermanents");
    const [m1, m2] = ofName(s, ap, "Mountain");
    s = act(s, { type: "pickPermanents", player: ap, ids: [m1!] });
    expect(s.pending?.kind).toBe("pickPermanents");
    expect((s.pending as { options: string[] }).options).not.toContain(m1);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [m2!] }));
    expect(lands(s, ap)).toBe(14);
    expect([zone(s, m1!), zone(s, m2!)]).toEqual(["graveyard", "graveyard"]);
  });

  it("two opponents' Land Equilibriums: a sacrifice for each", () => {
    const { s: s0, ap, forestId } = board(0);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    putOnBattlefield(s0, third, landEquilibrium());
    invalidateCharacteristics(s0);
    let s = act(s0, { type: "playLand", player: ap, objectId: forestId });
    const [a, b] = ofName(s, ap, "Plains");
    s = act(s, { type: "pickPermanents", player: ap, ids: [a!] });
    expect(s.pending?.kind).toBe("pickPermanents");
    s = act(s, { type: "pickPermanents", player: ap, ids: [b!] });
    expect(s.pending).toBeNull();
    expect(lands(s, ap)).toBe(13);
  });

  it("a bot sacrifices one of the lands offered", () => {
    const { s: s0, ap, forestId } = board(0);
    const s = act(s0, { type: "playLand", player: ap, objectId: forestId });
    const acts = botActions(s, ap);
    expect(acts.length).toBe(1);
    expect(acts[0]!.type).toBe("pickPermanents");
    const picked = (acts[0] as { ids: string[] }).ids;
    expect(picked.length).toBe(1);
    expect((s.pending as { options: string[] }).options).toContain(picked[0]);
    const after = act(s, acts[0]!);
    expect(after.pending).toBeNull();
    expect(lands(after, ap)).toBe(14);
  });
});
