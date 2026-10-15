// Champion (CR 702.72: two linked abilities, CR 607) and prototype (CR 702.160, 718: alternative characteristics on
// the stack and the battlefield, copiable values).

import { describe, expect, it } from "vitest";
import { act, bear, card, pt, putOnBattlefield, setup, swamp, target } from "./helpers";
import { botActions, castProblem, characteristics, defOf, isFullySupported, planCast, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const hero = card("Changeling Hero", "Creature — Shapeshifter", "{4}{W}", {
  power: "4",
  toughness: "4",
  keywords: ["Lifelink", "Champion", "Changeling"],
  oracleText:
    "Changeling (This card is every creature type.)\nChampion a creature (When this enters, sacrifice it unless you exile another creature you control. When this leaves the battlefield, that card returns to the battlefield.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)",
});
const chaser = card("Nova Chaser", "Creature — Elemental Warrior", "{3}{R}", {
  power: "10",
  toughness: "2",
  keywords: ["Trample", "Champion"],
  oracleText: "Trample\nChampion an Elemental (When this enters, sacrifice it unless you exile another Elemental you control. When this leaves the battlefield, that card returns to the battlefield.)",
});
const automaton = card("Blitz Automaton", "Artifact Creature — Construct", "{7}", {
  power: "6",
  toughness: "4",
  keywords: ["Haste", "Prototype"],
  oracleText: "Prototype {2}{R} — 3/2 (You may cast this spell with different mana cost, color, and size. It keeps its abilities and types.)\nHaste",
});
const clone = card("Clone", "Creature — Shapeshifter", "{3}{U}", { power: "0", toughness: "0", oracleText: "You may have this creature enter as a copy of any creature on the battlefield." });
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
const elemental = card("Flamekin Spark", "Creature — Elemental", "{R}", { power: "1", toughness: "1" });

const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
function castNow(s: GameState, pid: PlayerId, id: string, targets?: Parameters<typeof planCast>[3], choices?: Parameters<typeof planCast>[7]) {
  const plan = planCast(s, pid, id, targets, undefined, "auto", undefined, choices);
  if (!plan) throw new Error(`can't cast: ${castProblem(s, pid, id, targets, undefined, undefined, undefined, undefined, choices)}`);
  return plan.reduce((x, a) => act(x, a), s);
}

describe("champion", () => {
  it("compile", () => {
    for (const d of [hero, chaser, automaton]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("exiles another creature, which returns when the champion leaves", () => {
    const { s: s0, ap, ids, opp } = setup([hero, murder]);
    const b = putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, opp, bear());
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "champion", options: [b] });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [b] }));
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    for (let i = 0; i < 3; i++) putOnBattlefield(s, ap, swamp);
    s = settle(castNow(s, ap, ids[1]!, [target(ids[0]!)]));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[b]!.controller).toBe(ap);
  });

  it("sacrificed when its controller exiles nothing, or has nothing to exile", () => {
    const { s: s0, ap, ids } = setup([hero, chaser]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(castNow(s0, ap, ids[0]!));
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [] }));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.objects[b]!.zone).toBe("battlefield");
    // Nova Chaser needs another Elemental: a bear won't do.
    s = settle(castNow(s, ap, ids[1]!));
    expect(s.pending).toBeFalsy();
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
  });

  it("Nova Chaser exiles an Elemental; the bot picks one while the champion is still there", () => {
    const { s: s0, ap, ids } = setup([chaser]);
    const e = putOnBattlefield(s0, ap, elemental);
    putOnBattlefield(s0, ap, bear());
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", options: [e] });
    expect(botActions(s, ap)).toEqual([{ type: "pickPermanents", player: ap, ids: [e] }]);
    s = settle(act(s, botActions(s, ap)[0]!));
    expect(s.objects[e]!.zone).toBe("exile");
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
  });

  it("if the champion has left before its trigger resolves, the exiled card never returns (CR 607.2a)", () => {
    const { s: s0, ap, ids } = setup([hero, murder]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = castNow(s0, ap, ids[0]!);
    // Resolve the creature spell; its champion trigger goes on the stack.
    while (s.objects[ids[0]!]!.zone !== "battlefield") s = act(s, { type: "passPriority", player: waitingOn(s)! });
    while (s.triggerQueue.length && !s.stack.length) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    // Murder it in response.
    for (let i = 0; i < 3; i++) putOnBattlefield(s, ap, swamp);
    s = settle(castNow(s, ap, ids[1]!, [target(ids[0]!)]));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "champion" });
    // The bot exiles nothing for a champion that's gone; a player may anyway, and it stays exiled.
    expect(botActions(s, ap)).toEqual([{ type: "pickPermanents", player: ap, ids: [] }]);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [b] }));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.objects[b]!.zone).toBe("exile");
  });
});

describe("prototype", () => {
  it("cast prototyped: its prototype cost, color and size on the stack and battlefield; a card again elsewhere", () => {
    const { s: s0, ap, ids } = setup([automaton, murder]);
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, swamp);
    const lands = (s: GameState) => s.battlefield.filter((id) => s.objects[id]!.tapped).length;
    let s = castNow(s0, ap, ids[0]!, undefined, { alt: "prototype" });
    expect(lands(s)).toBe(3);
    const item = s.stack.at(-1)!;
    expect(defOf(s, s.objects[item.objectId!]!).manaCost).toBe("{2}{R}");
    s = settle(s);
    const o = s.objects[ids[0]!]!;
    expect(o.zone).toBe("battlefield");
    expect(pt(s, ids[0]!)).toBe("3/2");
    expect(characteristics(s, o).colors).toEqual(["R"]);
    expect(defOf(s, o).cmc).toBe(3);
    s = settle(castNow(s, ap, ids[1]!, [target(ids[0]!)]));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(defOf(s, s.objects[ids[0]!]!).manaCost).toBe("{7}");
    expect(characteristics(s, s.objects[ids[0]!]!).colors).toEqual([]);
  });

  it("cast normally it's the 6/4 colorless card", () => {
    const { s: s0, ap, ids } = setup([automaton]);
    const s = settle(castNow(s0, ap, ids[0]!));
    expect(pt(s, ids[0]!)).toBe("6/4");
    expect(characteristics(s, s.objects[ids[0]!]!).colors).toEqual([]);
  });

  it("a copy of a prototyped permanent is prototyped too (CR 718.3c, 707.2)", () => {
    const { s: s0, ap, ids } = setup([automaton, clone]);
    let s = settle(castNow(s0, ap, ids[0]!, undefined, { alt: "prototype" }));
    s = settle(castNow(s, ap, ids[1]!));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: ids[0]! }));
    expect(defOf(s, s.objects[ids[1]!]!).name).toBe("Blitz Automaton");
    expect(pt(s, ids[1]!)).toBe("3/2");
    expect(characteristics(s, s.objects[ids[1]!]!).colors).toEqual(["R"]);
  });
});
