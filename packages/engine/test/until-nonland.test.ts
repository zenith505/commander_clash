// "Exile cards from the top of your library until you exile a nonland card" and "reveal cards ... until you reveal a
// nonland card", then cast that card without paying its mana cost now (Creative Technique, Transforming Flourish), or
// this turn with its usual timing (Stolen Goods, Territorial Bruntar; rulings), or put every revealed card into your
// hand (Treasure Hunt). A card not cast stays exiled, and so do the lands exiled with it (rulings on Stolen Goods).
// Also "Time Lord", one creature type of two words (CR 205.3m), for "Doctor's companion" (CR 702.124m).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, putOnBattlefield, setup, target } from "./helpers";
import { commanderPairProblem, isFullySupported, mayPlayFromExile, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";
import { parseTypeLine } from "../src/cards";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
/** Resolve everything: `cast` answers the free casts, any other "you may" (demonstrate's copy) is declined. */
function settle(s: GameState, cast = true): GameState {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    const p = s.pending;
    if (p?.kind === "castFree" && cast) s = run(s, planCast(s, pid, p.objectId));
    else s = act(s, p?.kind === "castFree" || p?.kind === "chooseMay" ? { type: "chooseMay", player: pid, yes: false } : { type: "passPriority", player: pid });
  }
  return s;
}
const nameOf = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
/** `pid`'s library starts with these cards: two Forests, then a Grizzly Bears (from their library). */
function landsThenBear(s: GameState, pid: PlayerId): string[] {
  const lib = s.players[pid]!.library;
  const pick = (name: string) => lib.splice(lib.findIndex((id) => nameOf(s, id) === name), 1)[0]!;
  const top = [pick("Forest"), pick("Forest"), pick("Grizzly Bears")];
  lib.unshift(...top);
  return top;
}

// Real oracle text (Scryfall).
const goods = card("Stolen Goods", "Sorcery", "{3}{U}", { oracleText: "Target opponent exiles cards from the top of their library until they exile a nonland card. Until end of turn, you may cast that card without paying its mana cost." });
const technique = card("Creative Technique", "Sorcery", "{4}{R}", { keywords: ["Demonstrate"], oracleText: "Demonstrate (When you cast this spell, you may copy it. If you do, choose an opponent to also copy it.)\nShuffle your library, then reveal cards from the top of it until you reveal a nonland card. Exile that card and put the rest on the bottom of your library in a random order. You may cast the exiled card without paying its mana cost." });
const flourish = card("Transforming Flourish", "Instant", "{2}{R}", { keywords: ["Demonstrate"], oracleText: "Demonstrate (When you cast this spell, you may copy it. If you do, choose an opponent to also copy it. Players may choose new targets for their copies.)\nDestroy target artifact or creature you don't control. If that permanent is destroyed this way, its controller exiles cards from the top of their library until they exile a nonland card, then they may cast that card without paying its mana cost." });
const hunt = card("Treasure Hunt", "Sorcery", "{1}{U}", { oracleText: "Reveal cards from the top of your library until you reveal a nonland card, then put all cards revealed this way into your hand." });
const bruntar = card("Territorial Bruntar", "Creature — Beast", "{4}{R}{R}", { power: "6", toughness: "6", keywords: ["Reach", "Landfall"], oracleText: "Reach\nLandfall — Whenever a land you control enters, exile cards from the top of your library until you exile a nonland card. You may cast that card this turn." });
const ace = card("Ace, Fearless Rebel", "Legendary Creature — Human Rebel", "{3}{G}", { power: "2", toughness: "2", keywords: ["Nitro-9", "Fight", "Doctor's companion"], oracleText: "Nitro-9 — Whenever Ace attacks, you may sacrifice an artifact. When you do, put a +1/+1 counter on Ace, then it fights up to one target creature defending player controls.\nDoctor's companion (You can have two commanders if the other is the Doctor.)" });
const eighth = card("The Eighth Doctor", "Legendary Creature — Time Lord Doctor", "{4}{W}{U}", { power: "4", toughness: "4", oracleText: "When The Eighth Doctor enters, mill three cards." });
const indestructible = card("Test Wall", "Creature — Wall", "{1}", { power: "0", toughness: "4", keywords: ["Indestructible"], oracleText: "Indestructible" });

describe("until a nonland card", () => {
  it("parse", () => supported(goods, technique, flourish, hunt, bruntar));

  it("Stolen Goods: their lands and the bear are exiled; you may cast the bear this turn for free, not later", () => {
    const { s: s0, ap, opp, ids } = setup([goods]);
    const [f1, f2, b] = landsThenBear(s0, opp);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    for (const id of [f1!, f2!, b!]) expect(s.objects[id]!.zone).toBe("exile");
    expect(mayPlayFromExile(s, s.objects[b!]!, ap)).toBe(true);
    expect(mayPlayFromExile(s, s.objects[f1!]!, ap)).toBe(false);
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land")) s.objects[id]!.tapped = true;
    s = settle(run(s, planCast(s, ap, b!)));
    expect(s.objects[b!]).toMatchObject({ zone: "battlefield", controller: ap, owner: opp });
  });

  it("Creative Technique: shuffle, reveal to a nonland card, exile it and cast it free; the lands go to the bottom", () => {
    const { s: s0, ap, ids } = setup([technique]);
    const before = s0.players[ap]!.library.length;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    const bears = s.battlefield.filter((id) => s.objects[id]!.controller === ap && nameOf(s, id) === "Grizzly Bears");
    expect(bears).toHaveLength(1);
    expect(s.players[ap]!.library.length).toBe(before - 1);
    expect(s.players[ap]!.exile).toHaveLength(0);
  });

  it("Creative Technique: not cast, it stays exiled", () => {
    const { s: s0, ap, ids } = setup([technique]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), false);
    expect(s.players[ap]!.exile.map((id) => nameOf(s, id))).toEqual(["Grizzly Bears"]);
  });

  it("Transforming Flourish: the destroyed creature's controller exiles to a nonland card and may cast it free", () => {
    const { s: s0, ap, opp, ids } = setup([flourish, flourish]);
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const [f1, , b] = landsThenBear(s0, opp);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(theirs)])));
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.objects[f1!]!.zone).toBe("exile");
    expect(s.objects[b!]).toMatchObject({ zone: "battlefield", controller: opp });
    // Not destroyed (indestructible): nothing more.
    const wall = putOnBattlefield(s, opp, indestructible);
    const exiled = s.players[opp]!.exile.length;
    s = settle(run(s, planCast(s, ap, ids[1]!, [target(wall)])));
    expect(s.objects[wall]!.zone).toBe("battlefield");
    expect(s.players[opp]!.exile.length).toBe(exiled);
  });

  it("Treasure Hunt: the lands on top and the first nonland card into your hand", () => {
    const { s: s0, ap, ids } = setup([hunt]);
    const top = landsThenBear(s0, ap);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    for (const id of top) expect(s.objects[id]!.zone).toBe("hand");
  });

  it("Territorial Bruntar: landfall exiles to a nonland card you may cast this turn, paying for it", () => {
    const { s: s0, ap } = setup([forest]);
    putOnBattlefield(s0, ap, bruntar);
    const [, , b] = landsThenBear(s0, ap);
    const land = s0.players[ap]!.hand.find((id) => nameOf(s0, id) === "Forest")!;
    let s = settle(act(s0, { type: "playLand", player: ap, objectId: land }));
    expect(s.objects[b!]!.zone).toBe("exile");
    expect(mayPlayFromExile(s, s.objects[b!]!, ap)).toBe(true);
    expect(s.objects[b!]!.mayPlay?.free).toBeUndefined();
    s = settle(run(s, planCast(s, ap, b!)));
    expect(s.objects[b!]!.zone).toBe("battlefield");
  });

  it("Time Lord is one creature type: The Eighth Doctor can be Ace's Doctor", () => {
    expect(parseTypeLine("Legendary Creature — Time Lord Doctor").subtypes).toEqual(["Time Lord", "Doctor"]);
    expect(commanderPairProblem(ace, eighth)).toBeNull();
  });
});
