// Round 457: Pulmonic Sliver, "All Slivers have "If this permanent would be put into a graveyard, you may put it on top of
// its owner's library instead."" (CR 614.1a): an optional replacement its controller chooses as the Sliver would be put
// there, wherever that happens (a state-based action, a resolving spell, a cost). The action stops to ask, and is applied
// again with the answer (move-questions.ts). Slivers of one owner put on top at once are arranged by that owner (CR 401.4,
// rulings), and the Slivers dying with Pulmonic Sliver have the ability too (rulings).

import { describe, expect, it } from "vitest";
import { act, passAll, putOnBattlefield, setup, target } from "./helpers";
import { applyInPlace, botActions, cloneState, invalidateCharacteristics, isFullySupported, moveObject, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const pulmonic = (): CardDef => ({"oracleId": "f578465d-f3a5-48da-bcab-cffbbdd88be8", "name": "Pulmonic Sliver", "manaCost": "{3}{W}{W}", "cmc": 5, "typeLine": "Creature — Sliver", "supertypes": [], "types": ["Creature"], "subtypes": ["Sliver"], "oracleText": "All Sliver creatures have flying.\nAll Slivers have \"If this permanent would be put into a graveyard, you may put it on top of its owner's library instead.\"", "colors": ["W"], "colorIdentity": ["W"], "keywords": [], "layout": "normal", "power": "3", "toughness": "3"}) as CardDef;
const muscle = (): CardDef => ({"oracleId": "06e0459f-d691-4470-884a-27c09b6612d2", "name": "Muscle Sliver", "manaCost": "{1}{G}", "cmc": 2, "typeLine": "Creature — Sliver", "supertypes": [], "types": ["Creature"], "subtypes": ["Sliver"], "oracleText": "All Sliver creatures get +1/+1.", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "layout": "normal", "power": "1", "toughness": "1"}) as CardDef;
const basal = (): CardDef => ({"oracleId": "18e7ba0d-88a5-466b-9228-d3f5aae8f83e", "name": "Basal Sliver", "manaCost": "{2}{B}", "cmc": 3, "typeLine": "Creature — Sliver", "supertypes": [], "types": ["Creature"], "subtypes": ["Sliver"], "oracleText": "All Slivers have \"Sacrifice this permanent: Add {B}{B}.\"", "colors": ["B"], "colorIdentity": ["B"], "keywords": [], "layout": "normal", "power": "2", "toughness": "2"}) as CardDef;
const wrath = (): CardDef => ({"oracleId": "34515b16-c9a4-4f98-8c77-416a7a523407", "name": "Wrath of God", "manaCost": "{2}{W}{W}", "cmc": 4, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Destroy all creatures. They can't be regenerated.", "colors": ["W"], "colorIdentity": ["W"], "keywords": [], "layout": "normal"}) as CardDef;
const bolt = (): CardDef => ({"oracleId": "4457ed35-7c10-48c8-9776-456485fdf070", "name": "Lightning Bolt", "manaCost": "{R}", "cmc": 1, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Lightning Bolt deals 3 damage to any target.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "layout": "normal"}) as CardDef;
const restInPeace = (): CardDef => ({"oracleId": "087f9ad7-e74f-40e2-8102-1ed2925d0418", "name": "Rest in Peace", "manaCost": "{1}{W}", "cmc": 2, "typeLine": "Enchantment", "supertypes": [], "types": ["Enchantment"], "subtypes": [], "oracleText": "When this enchantment enters, exile all graveyards.\nIf a card or token would be put into a graveyard from anywhere, exile it instead.", "colors": ["W"], "colorIdentity": ["W"], "keywords": [], "layout": "normal"}) as CardDef;
const seer = (): CardDef => ({"oracleId": "f82a4e85-526d-4456-b700-7760043a31be", "name": "Viscera Seer", "manaCost": "{B}", "cmc": 1, "typeLine": "Creature — Vampire Wizard", "supertypes": [], "types": ["Creature"], "subtypes": ["Vampire", "Wizard"], "oracleText": "Sacrifice a creature: Scry 1. (Look at the top card of your library. You may put that card on the bottom.)", "colors": ["B"], "colorIdentity": ["B"], "keywords": ["Scry"], "layout": "normal", "power": "1", "toughness": "1"}) as CardDef;
const bears = (): CardDef => ({"oracleId": "14c8f55d-d177-4c25-a931-ebeb9e6062a0", "name": "Grizzly Bears", "manaCost": "{1}{G}", "cmc": 2, "typeLine": "Creature — Bear", "supertypes": [], "types": ["Creature"], "subtypes": ["Bear"], "oracleText": "", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "layout": "normal", "power": "2", "toughness": "2"}) as CardDef;

const nameOf = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
const top = (s: GameState, pid: PlayerId, n = 1) => s.players[pid]!.library.slice(0, n).map((id) => nameOf(s, id));
const yard = (s: GameState, pid: PlayerId) => s.players[pid]!.graveyard.map((id) => nameOf(s, id));
const exiled = (s: GameState, pid: PlayerId) => s.players[pid]!.exile.map((id) => nameOf(s, id));
const castAt = (s: GameState, pid: PlayerId, id: string, to?: string) => {
  const plan = planCast(s, pid, id, to ? [target(to)] : undefined);
  if (!plan) throw new Error("can't cast");
  return passAll(plan.reduce((x, a) => act(x, a), s));
};
const answer = (s: GameState, choice: string) => {
  const p = s.pending;
  if (p?.kind !== "chooseOption" || p.what !== "moveInstead") throw new Error(`no move question: ${JSON.stringify(p)?.slice(0, 200)}`);
  return act(s, { type: "chooseOption", player: p.player, choice });
};

describe("Pulmonic Sliver (round 457)", () => {
  it("is fully supported, and grants the replacement to every Sliver", () => {
    expect(isFullySupported(pulmonic())).toBe(true);
  });

  it("asks as a Sliver dealt lethal damage would die, with the action undone until it's answered", () => {
    const { s: s0, ap, ids } = setup([bolt()]);
    putOnBattlefield(s0, ap, pulmonic());
    const m = putOnBattlefield(s0, ap, muscle());
    const s = castAt(s0, ap, ids[0]!, m);
    const p = s.pending;
    expect(p?.kind === "chooseOption" && p.what).toBe("moveInstead");
    if (p?.kind !== "chooseOption") return;
    expect(p.player).toBe(ap);
    expect(p.source).toBe("Muscle Sliver");
    expect(p.options).toEqual(["top", "graveyard"]);
    expect(p.labels).toEqual(["Put it on top of your library", "Put it into your graveyard"]);
    // Lightning Bolt hasn't resolved yet: the whole action waits on the answer.
    expect(s.stack.length).toBe(1);
    expect(s.objects[m]!.damage).toBe(0);
    const t = answer(s, "top");
    expect(t.pending).toBeNull();
    expect(t.stack.length).toBe(0);
    expect(top(t, ap)).toEqual(["Muscle Sliver"]);
    expect(yard(t, ap)).toEqual(["Lightning Bolt"]);
    expect(t.log.filter((l) => /deals 3 damage/.test(l.text)).length).toBe(1);
    expect(t.log.some((l) => l.text === "Muscle Sliver is put on top of its owner's library instead of into a graveyard.")).toBe(true);
    // Declined, it dies.
    const g = answer(s, "graveyard");
    expect(yard(g, ap)).toEqual(["Lightning Bolt", "Muscle Sliver"]);
    expect(top(g, ap)).not.toEqual(["Muscle Sliver"]);
  });

  it("doesn't ask for a creature that isn't a Sliver", () => {
    const { s: s0, ap, ids } = setup([bolt()]);
    putOnBattlefield(s0, ap, pulmonic());
    const b = putOnBattlefield(s0, ap, bears());
    const s = castAt(s0, ap, ids[0]!, b);
    expect(s.pending).toBeNull();
    expect(yard(s, ap)).toEqual(["Lightning Bolt", "Grizzly Bears"]);
  });

  it("applies to Pulmonic Sliver and the Slivers dying with it; their owner arranges the ones put on top", () => {
    const { s: s0, ap, ids } = setup([wrath()]);
    const pul = putOnBattlefield(s0, ap, pulmonic());
    const mus = putOnBattlefield(s0, ap, muscle());
    const bas = putOnBattlefield(s0, ap, basal());
    let s = castAt(s0, ap, ids[0]!);
    const asked: string[] = [];
    for (let i = 0; i < 5 && s.pending?.kind === "chooseOption" && s.pending.what === "moveInstead"; i++) {
      asked.push(s.pending.about!);
      s = answer(s, "top");
    }
    expect(asked.sort()).toEqual([pul, mus, bas].sort());
    // "That player chooses any of those Slivers and puts them on top of their library in any order." (rulings)
    const p = s.pending;
    expect(p?.kind).toBe("orderLibrary");
    if (p?.kind !== "orderLibrary") return;
    expect(p.player).toBe(ap);
    expect(p.bottom).toBeUndefined();
    expect(p.cards.map((id) => nameOf(s, id)).sort()).toEqual(["Basal Sliver", "Muscle Sliver", "Pulmonic Sliver"]);
    const want = ["Muscle Sliver", "Pulmonic Sliver", "Basal Sliver"];
    s = act(s, { type: "orderLibrary", player: ap, order: want.map((n) => p.cards.find((id) => nameOf(s, id) === n)!) });
    expect(top(s, ap, 3)).toEqual(want);
    expect(yard(s, ap)).toEqual(["Wrath of God"]);
    // The order isn't revealed (CR 401.4).
    expect(s.log.at(-1)?.text).not.toMatch(/Muscle|Basal|Pulmonic/);
  });

  it("asks only for the Slivers put on top; one declined goes to the graveyard", () => {
    const { s: s0, ap, ids } = setup([wrath()]);
    putOnBattlefield(s0, ap, pulmonic());
    const mus = putOnBattlefield(s0, ap, muscle());
    putOnBattlefield(s0, ap, bears());
    let s = castAt(s0, ap, ids[0]!);
    for (let i = 0; i < 3 && s.pending?.kind === "chooseOption"; i++) s = answer(s, s.pending.about === mus ? "graveyard" : "top");
    expect(s.pending).toBeNull();
    expect(top(s, ap)).toEqual(["Pulmonic Sliver"]);
    expect(yard(s, ap).sort()).toEqual(["Grizzly Bears", "Muscle Sliver", "Wrath of God"]);
  });

  it("is chosen by the Sliver's controller: a bot puts its own on top", () => {
    const { s: s0, ap, ids, opp } = setup([bolt()]);
    putOnBattlefield(s0, opp, pulmonic());
    const m = putOnBattlefield(s0, opp, muscle());
    let s = castAt(s0, ap, ids[0]!, m);
    const p = s.pending;
    expect(p?.kind === "chooseOption" && p.player).toBe(opp);
    expect(p?.kind === "chooseOption" && p.labels).toEqual(["Put it on top of your library", "Put it into your graveyard"]);
    expect(waitingOn(s)).toBe(opp);
    for (const a of botActions(s, opp)) s = act(s, a);
    expect(top(s, opp)).toEqual(["Muscle Sliver"]);
  });

  it("is asked of the controller of another player's Sliver, and it goes on top of its owner's library", () => {
    const { s: s0, ap, ids, opp } = setup([bolt()]);
    putOnBattlefield(s0, opp, pulmonic());
    const m = putOnBattlefield(s0, opp, muscle());
    s0.objects[m]!.owner = ap; // opp controls a Muscle Sliver ap owns
    invalidateCharacteristics(s0);
    const s = castAt(s0, ap, ids[0]!, m);
    const p = s.pending;
    expect(p?.kind === "chooseOption" && p.player).toBe(opp);
    const owner = s.players[ap]!.name;
    expect(p?.kind === "chooseOption" && p.labels).toEqual([`Put it on top of ${owner}'s library`, `Put it into ${owner}'s graveyard`]);
    const t = answer(s, "top");
    expect(top(t, ap)).toEqual(["Muscle Sliver"]);
  });

  it("goes before Rest in Peace if its controller takes it (CR 616.1); declined, Rest in Peace exiles it", () => {
    const { s: s0, ap, ids, opp } = setup([bolt()]);
    putOnBattlefield(s0, opp, restInPeace());
    putOnBattlefield(s0, ap, pulmonic());
    const m = putOnBattlefield(s0, ap, muscle());
    const s = castAt(s0, ap, ids[0]!, m);
    const t = answer(s, "top");
    expect(top(t, ap)).toEqual(["Muscle Sliver"]);
    const g = answer(s, "graveyard");
    expect(exiled(g, ap)).toContain("Muscle Sliver");
    expect(yard(g, ap)).toEqual([]);
  });

  it("asks as a Sliver is sacrificed to pay a cost: Basal Sliver's mana ability, and Viscera Seer's", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, pulmonic());
    const bas = putOnBattlefield(s0, ap, basal());
    let s = act(s0, { type: "activateMana", player: ap, objectId: bas, mana: "B" });
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("moveInstead");
    expect(s.players[ap]!.manaPool.B ?? 0).toBe(0);
    s = answer(s, "top");
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.manaPool.B).toBe(2);
    expect(top(s, ap)).toEqual(["Basal Sliver"]);

    const { s: s1, ap: ap1 } = setup([]);
    putOnBattlefield(s1, ap1, pulmonic());
    const vs = putOnBattlefield(s1, ap1, seer());
    const mus = putOnBattlefield(s1, ap1, muscle());
    let u = act(s1, { type: "activateAbility", player: ap1, objectId: vs, index: 0, costs: { sacrifice: [mus] } });
    expect(u.pending?.kind === "chooseOption" && u.pending.about).toBe(mus);
    u = answer(u, "top");
    expect(u.stack.length).toBe(1);
    expect(top(u, ap1)).toEqual(["Muscle Sliver"]);
  });

  it("doesn't let the answer outlive the action, and the bot's choice is made where nothing can ask", () => {
    const { s: s0, ap, ids } = setup([bolt()]);
    putOnBattlefield(s0, ap, pulmonic());
    const m = putOnBattlefield(s0, ap, muscle());
    const s = answer(castAt(s0, ap, ids[0]!, m), "top");
    expect(s.moveAnswers).toBeUndefined();
    // A move outside applyAction (an engine look ahead on a copy): a card goes on top, as a bot would choose.
    const c = cloneState(s0);
    moveObject(c, m, "graveyard");
    invalidateCharacteristics(c);
    expect(top(c, ap)).toEqual(["Muscle Sliver"]);
    // applyInPlace (a shortcut's repeat) doesn't ask either.
    const d = cloneState(s0);
    const plan = planCast(d, ap, ids[0]!, [target(m)])!;
    for (const a of plan) applyInPlace(d, a);
    for (let i = 0; i < 8 && d.stack.length; i++) applyInPlace(d, { type: "passPriority", player: waitingOn(d)! });
    expect(d.pending).toBeNull();
    expect(top(d, ap)).toEqual(["Muscle Sliver"]);
  });
});
