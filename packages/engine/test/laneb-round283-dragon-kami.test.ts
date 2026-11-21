// Lane B round B283: The Dragon-Kami Reborn // Dragon-Kami's Egg ("I, II — You gain 2 life. Look at the top three cards of
// your library. Exile one of them face down with a hatching counter on it, then put the rest on the bottom of your library
// in any order." and the Egg's "Whenever this creature or a Dragon you control dies, you may cast a creature spell from
// among cards you own in exile with hatching counters on them without paying its mana cost."; CR 122.1, 406.3, 603.10a,
// 714.2b, 608.2g and its rulings).

import { describe, expect, it } from "vitest";
import { act, bear, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, destroyPermanent, invalidateCharacteristics, isFullySupported, setFace, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const dragonKami = (): CardDef => ({"oracleId":"c3a46eb3-38d9-4f47-9b71-26c9ea7ef1ce","name":"The Dragon-Kami Reborn // Dragon-Kami's Egg","manaCost":"{2}{G}","cmc":3,"typeLine":"Enchantment — Saga // Enchantment Creature — Egg","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter.)\nI, II — You gain 2 life. Look at the top three cards of your library. Exile one of them face down with a hatching counter on it, then put the rest on the bottom of your library in any order.\nIII — Exile this Saga, then return it to the battlefield transformed under your control.","colors":["G"],"colorIdentity":["G"],"keywords":["Transform"],"layout":"transform","faces":[{"name":"The Dragon-Kami Reborn","manaCost":"{2}{G}","typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter.)\nI, II — You gain 2 life. Look at the top three cards of your library. Exile one of them face down with a hatching counter on it, then put the rest on the bottom of your library in any order.\nIII — Exile this Saga, then return it to the battlefield transformed under your control.","colors":["G"]},{"name":"Dragon-Kami's Egg","manaCost":"","typeLine":"Enchantment Creature — Egg","supertypes":[],"types":["Enchantment","Creature"],"subtypes":["Egg"],"oracleText":"Whenever this creature or a Dragon you control dies, you may cast a creature spell from among cards you own in exile with hatching counters on them without paying its mana cost.","power":"0","toughness":"1","colors":["G"],"colorIndicator":["G"]}]}) as CardDef;
const shivan = (): CardDef => ({"oracleId":"711eea87-0fa3-46e0-a42b-fa5a86455f04","name":"Shivan Dragon","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\n{R}: This creature gets +1/+0 until end of turn.","power":"5","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"layout":"normal"}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && !s.over && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
/** `defs` on top of `pid`'s library, in order; their ids. */
const stackLibrary = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  const ids = defs.map((d) => {
    const id = putOnBattlefield(s, pid, d);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    return id;
  });
  s.players[pid]!.library.unshift(...ids);
  return ids;
};
/** A card in exile with a hatching counter, as the Saga leaves it. */
const hatching = (s: GameState, pid: PlayerId, d: CardDef) => {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "exile";
  s.objects[id]!.counters.hatching = 1;
  s.objects[id]!.hiddenExile = { by: "", seen: [pid], label: "Face down", at: 0 };
  s.players[pid]!.exile.push(id);
  return id;
};
/** Destroys the creature `id`; its dies triggers resolve (stops at a question). */
const kill = (s: GameState, id: string) => {
  s = structuredClone(s);
  destroyPermanent(s, s.objects[id]!, "test");
  return settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
};
/** Dragon-Kami's Egg on `pid`'s battlefield (the Saga's back face up). */
const putEgg = (s: GameState, pid: PlayerId) => {
  const egg = putOnBattlefield(s, pid, dragonKami());
  setFace(s, s.objects[egg]!, 1);
  invalidateCharacteristics(s);
  return egg;
};

describe("The Dragon-Kami Reborn", () => {
  it("is supported", () => {
    expect(isFullySupported(dragonKami())).toBe(true);
  });

  it("chapter I: you gain 2 life, exile one of the top three face down with a hatching counter, the rest on the bottom", () => {
    const { s: s0, ap, ids } = setup([dragonKami()]);
    const top = stackLibrary(s0, ap, [shivan(), bolt(), bear()]);
    const life = s0.players[ap]!.life;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 1, max: 1 });
    expect(s.players[ap]!.life).toBe(life + 2);
    s = act(s, { type: "searchLibrary", player: ap, found: [top[0]!] });
    // The other two go on the bottom in the order you choose.
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap, how: "bottom" });
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [top[2]!, top[1]!], away: [] }));
    expect(s.pending).toBeNull();
    expect(zone(s, top[0]!)).toBe("exile");
    expect(s.objects[top[0]!]!.counters.hatching).toBe(1);
    // Face down: you may look at it (rulings), the others may not.
    expect(s.objects[top[0]!]!.hiddenExile?.seen).toEqual([ap]);
    const lib = s.players[ap]!.library;
    expect(lib.slice(-2)).toEqual([top[2]!, top[1]!]);
  });

  it("the face-down card chapter I exiled is the one the Egg casts, face up, for free", () => {
    const { s: s0, ap, ids } = setup([dragonKami()]);
    const top = stackLibrary(s0, ap, [shivan(), bolt(), bear()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = act(s, { type: "searchLibrary", player: ap, found: [top[0]!] });
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [top[1]!, top[2]!], away: [] }));
    // As if chapter III had returned it transformed.
    s = structuredClone(s);
    setFace(s, s.objects[ids[0]!]!, 1);
    invalidateCharacteristics(s);
    s = kill(s, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "castFromAmong", options: [top[0]!, "none"] });
    s = act(s, { type: "chooseOption", player: ap, choice: top[0]! });
    const tapped = s.battlefield.filter((id) => s.objects[id]!.tapped).length;
    s = settle(run(s, planCast(s, ap, top[0]!)));
    expect(zone(s, top[0]!)).toBe("battlefield");
    expect(s.objects[top[0]!]!.hiddenExile).toBeUndefined();
    // Nothing was tapped to pay for it.
    expect(s.battlefield.filter((id) => s.objects[id]!.tapped).length).toBe(tapped);
  });

  it("the Egg dying lets you cast a creature card with a hatching counter free; noncreature cards aren't offered", () => {
    const { s: s0, ap } = setup([]);
    const egg = putEgg(s0, ap);
    const dragon = hatching(s0, ap, shivan());
    hatching(s0, ap, bolt());
    let s = kill(s0, egg);
    // Only the creature card is offered (CR 601.2: a creature spell).
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "castFromAmong", options: [dragon, "none"] });
    s = act(s, { type: "chooseOption", player: ap, choice: dragon });
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: dragon });
    s = settle(run(s, planCast(s, ap, dragon)));
    expect(zone(s, dragon)).toBe("battlefield");
    expect(s.objects[dragon]!.controller).toBe(ap);
  });

  it("a Dragon you control dying triggers it too; another player's Dragon doesn't", () => {
    const { s: s0, ap, opp } = setup([]);
    const egg = putEgg(s0, ap);
    const theirs = putOnBattlefield(s0, opp, shivan());
    const mine = putOnBattlefield(s0, ap, shivan());
    const hatchling = hatching(s0, ap, bear());
    let s = kill(s0, theirs);
    expect(s.pending).toBeNull();
    s = kill(s, mine);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "castFromAmong", options: [hatchling, "none"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }));
    expect(s.pending).toBeNull();
    expect(zone(s, hatchling)).toBe("exile");
  });

  it("only cards you own: an opponent's hatching card isn't offered", () => {
    const { s: s0, ap, opp } = setup([]);
    const egg = putEgg(s0, ap);
    hatching(s0, opp, bear());
    const s = kill(s0, egg);
    expect(s.pending).toBeNull();
  });
});
