// A merged permanent leaving the battlefield (CR 730.3): each of its cards goes to the zone it goes to. An effect that
// finds the new object it became finds all of them and does the same to each (730.3c): "when this creature dies, return
// it to its owner's hand", persist, Luminous Broodmoth (rulings: "each card that was part of that merged creature is
// returned to the battlefield"). Put into its owner's graveyard or library, its owner arranges the cards (730.3a); in
// the library without revealing the order. And mutating onto or under a face-down creature (730.2e-f).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { applyAction, botActions, characteristics, isFullySupported, moveObject, planCast, planTurnFaceUp, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";
import { addMana } from "../src/spend";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const gemrazer = card("Gemrazer", "Creature — Beast", "{3}{G}", { power: "4", toughness: "4", keywords: ["Reach", "Mutate", "Trample"], oracleText: "Mutate {1}{G}{G} (If you cast this spell for its mutate cost, put it over or under target non-Human creature you own. They mutate into the creature on top plus all abilities from under it.)\nReach, trample\nWhenever this creature mutates, destroy target artifact or enchantment an opponent controls." });
const dreamtail = card("Dreamtail Heron", "Creature — Elemental Bird", "{4}{U}", { power: "3", toughness: "4", keywords: ["Flying", "Mutate"], oracleText: "Mutate {3}{U} (If you cast this spell for its mutate cost, put it over or under target non-Human creature you own. They mutate into the creature on top plus all abilities from under it.)\nFlying\nWhenever this creature mutates, draw a card." });
const cockroaches = card("Endless Cockroaches", "Creature — Insect", "{1}{B}{B}", { power: "1", toughness: "1", oracleText: "When this creature dies, return it to its owner's hand." });
const finks = card("Kitchen Finks", "Creature — Ouphe", "{1}{G/W}{G/W}", { power: "3", toughness: "2", keywords: ["Persist"], oracleText: "When this creature enters, you gain 2 life.\nPersist (When this creature dies, if it had no -1/-1 counters on it, return it to the battlefield under its owner's control with a -1/-1 counter on it.)" });
const broodmoth = card("Luminous Broodmoth", "Creature — Insect", "{2}{W}{W}", { power: "3", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nWhenever a creature you control without flying dies, return it to the battlefield under its owner's control with a flying counter on it." });
const locustGod = card("The Locust God", "Legendary Creature — God", "{4}{U}{R}", { power: "4", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nWhenever you draw a card, create a 1/1 blue and red Insect creature token with flying and haste.\n{2}{U}{R}: Draw a card, then discard a card.\nWhen The Locust God dies, return it to its owner's hand at the beginning of the next end step." });
const skeleton = card("Reassembling Skeleton", "Creature — Skeleton Warrior", "{1}{B}", { power: "1", toughness: "1", oracleText: "{1}{B}: Return this card from your graveyard to the battlefield tapped." });
const griptide = card("Griptide", "Instant", "{3}{U}", { oracleText: "Put target creature on top of its owner's library." });
const sphinx = card("Cerulean Sphinx", "Creature — Sphinx", "{4}{U}{U}", { power: "5", toughness: "5", keywords: ["Flying"], oracleText: "Flying\n{U}: This creature's owner shuffles it into their library." });
const portal = card("The Spot's Portal", "Instant", "{2}{B}", { oracleText: "Put target creature on the bottom of its owner's library. You lose 2 life unless you control a Villain." });
const survivalist = card("Ainok Survivalist", "Creature — Dog Shaman", "{1}{G}", { power: "2", toughness: "1", keywords: ["Megamorph"], oracleText: "Megamorph {1}{G} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its megamorph cost and put a +1/+1 counter on it.)\nWhen this creature is turned face up, destroy target artifact or enchantment an opponent controls." });
const digger = card("Soldevi Digger", "Artifact", "{2}", { oracleText: "{2}: Put the top card of your graveyard on the bottom of your library." });

const run = (s: GameState, actions: Action[] | null) => {
  if (!actions) throw new Error("no plan");
  return actions.reduce((x, a) => act(x, a), s);
};
const mutate = (s: GameState, pid: PlayerId, id: string, host: string) => passAll(run(s, planCast(s, pid, id, [target(host)], undefined, "auto", undefined, { alt: "mutate" })));
const choose = (s: GameState, pid: PlayerId, choice: "top" | "bottom") => act(s, { type: "chooseOption", player: pid, choice });
const resolveAll = (s: GameState) => {
  while (s.stack.length && !s.pending) s = passAll(s);
  return s;
};
/** It dies, then state-based actions and its triggers. */
const dies = (s: GameState, pid: PlayerId, id: string) => {
  moveObject(s, id, "graveyard");
  return resolveAll(act(s, { type: "passPriority", player: pid }));
};
const name = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;

describe("a merged permanent's cards when it leaves (CR 730.3)", () => {
  it("Endless Cockroaches merged under Gemrazer: both cards return to its owner's hand (730.3c)", () => {
    supported(cockroaches, finks, broodmoth, locustGod, skeleton, griptide, sphinx, portal, digger);
    const { s: s0, ap, ids } = setup([gemrazer]);
    const c = putOnBattlefield(s0, ap, cockroaches);
    let s = resolveAll(choose(mutate(s0, ap, ids[0]!, c), ap, "top"));
    expect(name(s, c)).toBe("Gemrazer");
    s = dies(s, ap, c);
    expect(s.objects[c]!.zone).toBe("hand");
    expect(s.objects[ids[0]!]!.zone).toBe("hand");
  });

  it("persist: each card returns, a creature of its own with a -1/-1 counter", () => {
    const { s: s0, ap, ids } = setup([gemrazer]);
    const f = putOnBattlefield(s0, ap, finks);
    let s = resolveAll(choose(mutate(s0, ap, ids[0]!, f), ap, "bottom"));
    s = dies(s, ap, f);
    expect(s.objects[f]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[f]!.merged).toBeUndefined();
    expect(pt(s, f)).toBe("2/1");
    expect(pt(s, ids[0]!)).toBe("3/3");
  });

  it("Luminous Broodmoth: each card of a merged creature without flying comes back with a flying counter", () => {
    const { s: s0, ap, ids } = setup([gemrazer]);
    putOnBattlefield(s0, ap, broodmoth);
    const b = putOnBattlefield(s0, ap, bear());
    let s = resolveAll(choose(mutate(s0, ap, ids[0]!, b), ap, "top"));
    s = dies(s, ap, b);
    for (const id of [b, ids[0]!]) {
      expect(s.objects[id]!.zone).toBe("battlefield");
      expect(s.objects[id]!.counters.flying).toBe(1);
    }
  });

  it("The Locust God: both cards return to hand at the beginning of the next end step", () => {
    const { s: s0, ap, ids } = setup([gemrazer]);
    const g = putOnBattlefield(s0, ap, locustGod);
    let s = resolveAll(choose(mutate(s0, ap, ids[0]!, g), ap, "bottom"));
    s = dies(s, ap, g);
    expect(s.objects[g]!.zone).toBe("graveyard");
    s = passUntil(s, "end", ap);
    s = resolveAll(s);
    expect(s.objects[g]!.zone).toBe("hand");
    expect(s.objects[ids[0]!]!.zone).toBe("hand");
  });

  it("only abilities triggered by its leaving find the other cards: Reassembling Skeleton returns alone later", () => {
    const { s: s0, ap, ids } = setup([gemrazer]);
    const k = putOnBattlefield(s0, ap, skeleton);
    let s = resolveAll(choose(mutate(s0, ap, ids[0]!, k), ap, "top"));
    s = dies(s, ap, k);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    s = passUntil(s, "main2", ap);
    addMana(s, ap, ["C", "B"], {});
    s = resolveAll(act(s, { type: "activateAbility", player: ap, objectId: k, index: 0 }));
    expect(s.objects[k]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("put on top of its owner's library: the owner arranges its cards there, and the order isn't logged", () => {
    const { s: s0, ap, ids } = setup([dreamtail, griptide]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = resolveAll(choose(mutate(s0, ap, ids[0]!, b), ap, "top")); // draws a card
    s = passAll(run(s, planCast(s, ap, ids[1]!, [target(b)], undefined, "auto")));
    expect(s.pending).toMatchObject({ kind: "orderLibrary", player: ap });
    const pend = s.pending!.kind === "orderLibrary" ? s.pending! : null;
    expect(pend!.bottom).toBeUndefined();
    expect(new Set(pend!.cards)).toEqual(new Set([b, ids[0]!]));
    expect(s.players[ap]!.library.slice(0, 2)).toEqual(pend!.cards);
    s = act(s, { type: "orderLibrary", player: ap, order: [b, ids[0]!] });
    expect(s.players[ap]!.library.slice(0, 2)).toEqual([b, ids[0]!]);
    expect(s.log.at(-1)).not.toContain("Grizzly Bears");
    // The other way round, chosen by a bot.
    let s2 = passAll(run(resolveAll(choose(mutate(s0, ap, ids[0]!, b), ap, "top")), planCast(resolveAll(choose(mutate(s0, ap, ids[0]!, b), ap, "top")), ap, ids[1]!, [target(b)], undefined, "auto")));
    expect(waitingOn(s2)).toBe(ap);
    s2 = applyAction(s2, botActions(s2, ap)[0]!);
    expect(s2.pending).toBeNull();
    expect(s2.players[ap]!.library.slice(0, 2)).toEqual([b, ids[0]!]); // the cheaper Grizzly Bears on top
  });

  it("on the bottom of its owner's library: arranged there too", () => {
    const { s: s0, ap, ids } = setup([gemrazer, portal]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = resolveAll(choose(mutate(s0, ap, ids[0]!, b), ap, "top"));
    s = passAll(run(s, planCast(s, ap, ids[1]!, [target(b)], undefined, "auto")));
    expect(s.pending).toMatchObject({ kind: "orderLibrary", player: ap, bottom: true });
    s = act(s, { type: "orderLibrary", player: ap, order: [ids[0]!, b] });
    expect(s.players[ap]!.library.slice(-2)).toEqual([ids[0]!, b]);
  });

  it("shuffled into its owner's library: nothing to arrange", () => {
    const { s: s0, ap, ids } = setup([gemrazer]);
    const x = putOnBattlefield(s0, ap, sphinx);
    let s = resolveAll(choose(mutate(s0, ap, ids[0]!, x), ap, "bottom"));
    const shuffles = s.players[ap]!.shuffles ?? 0;
    addMana(s, ap, ["U"], {});
    s = resolveAll(act(s, { type: "activateAbility", player: ap, objectId: x, index: 0 }));
    expect(s.pending).toBeNull();
    expect(s.objects[x]!.zone).toBe("library");
    expect(s.objects[ids[0]!]!.zone).toBe("library");
    expect(s.players[ap]!.shuffles).toBe(shuffles + 1);
  });

  it("into a graveyard where the order matters (Soldevi Digger): its owner arranges the cards", () => {
    const { s: s0, ap, ids } = setup([gemrazer]);
    putOnBattlefield(s0, ap, digger);
    const b = putOnBattlefield(s0, ap, bear());
    let s = resolveAll(choose(mutate(s0, ap, ids[0]!, b), ap, "top"));
    moveObject(s, b, "graveyard");
    s = act(s, { type: "passPriority", player: ap });
    expect(s.pending).toMatchObject({ kind: "orderGraveyard", player: ap });
    s = act(s, { type: "orderGraveyard", player: ap, order: [ids[0]!, b] });
    expect(s.players[ap]!.graveyard.slice(-2)).toEqual([b, ids[0]!]); // the last is the top
  });
});

describe("mutating onto or under a face-down creature (CR 730.2e-f)", () => {
  const relicFor = (s: GameState, pid: PlayerId) => putOnBattlefield(s, pid, card("Relic", "Artifact", "{1}"));
  const faceDownSurvivalist = (s: GameState, pid: PlayerId) => {
    const id = putOnBattlefield(s, pid, survivalist);
    s.objects[id]!.faceDown = "megamorph";
    return id;
  };

  it("underneath: still a face-down 2/2 with no abilities; turned face up, it's the top card with every card's abilities", () => {
    supported(survivalist);
    const { s: s0, ap, opp, ids } = setup([gemrazer]);
    const relic = relicFor(s0, opp);
    const f = faceDownSurvivalist(s0, ap);
    let s = resolveAll(choose(mutate(s0, ap, ids[0]!, f), ap, "bottom"));
    // A face-down permanent has no abilities (CR 708.2), so "whenever this creature mutates" didn't trigger.
    expect(s.objects[f]!.faceDown).toBe("megamorph");
    expect(s.objects[relic]!.zone).toBe("battlefield");
    let c = characteristics(s, s.objects[f]!);
    expect([c.power, c.toughness, c.keywords]).toEqual([2, 2, []]);
    // Turning it face up turns its face-down card face up (730.2f): the megamorph cost is the top card's.
    for (const a of planTurnFaceUp(s, ap, f)!) s = act(s, a);
    c = characteristics(s, s.objects[f]!);
    expect(c.name).toBe("Ainok Survivalist");
    expect(pt(s, f)).toBe("3/2"); // megamorph's +1/+1 counter
    expect(c.keywords).toEqual(expect.arrayContaining(["Reach", "Trample"]));
    // "When this creature is turned face up": destroy the opponent's artifact.
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [target(relic)] }));
    expect(s.objects[relic]!.zone).toBe("graveyard");
  });

  it("on top: face up as Gemrazer, not turned face up, so no 'turned face up' trigger (730.2e)", () => {
    const { s: s0, ap, opp, ids } = setup([gemrazer]);
    const relic = relicFor(s0, opp);
    const f = faceDownSurvivalist(s0, ap);
    let s = mutate(s0, ap, ids[0]!, f);
    s = choose(s, ap, "top");
    expect(s.objects[f]!.faceDown).toBeUndefined();
    expect(name(s, f)).toBe("Gemrazer");
    expect(pt(s, f)).toBe("4/4");
    // Only Gemrazer's mutate trigger.
    expect(s.pending).toMatchObject({ kind: "chooseTargets", description: "Gemrazer: destroy target artifact or enchantment an opponent controls." });
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [target(relic)] }));
    expect(s.stack.length).toBe(0);
    expect(s.pending).toBeNull();
  });
});
