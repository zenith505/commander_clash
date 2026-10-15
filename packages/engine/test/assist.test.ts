// Assist (CR 702.132): another player may pay for any amount of the generic mana in the spell's total cost.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, putOnBattlefield, setup, target } from "./helpers";
import { botActions, isFullySupported, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tappedLands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.objects[id]!.tapped && s.cards[s.objects[id]!.cardId]!.types.includes("Land")).length;
/** Let `pid` answer with what a bot would do. */
const asBot = (s: GameState, pid: PlayerId) => {
  for (const a of botActions(s, pid)) s = act(s, a);
  return s;
};

// Real oracle text (Scryfall).
const chargingBinox = card("Charging Binox", "Creature — Beast", "{7}{G}", { power: "7", toughness: "5", keywords: ["Assist", "Trample"], oracleText: "Assist (Another player can pay up to {7} of this spell's cost.)\nTrample" });
const bringDown = card("Bring Down", "Sorcery", "{3}{W}", {
  keywords: ["Assist"],
  oracleText: "Assist (Another player can pay up to {3} of this spell's cost.)\nDestroy target creature with power 4 or greater.",
});
// Its "power X or less" target isn't supported yet; here only its cost matters.
const gangUp = card("Gang Up", "Instant", "{X}{B}", {
  keywords: ["Assist"],
  oracleText: "Assist (Another player can pay up to {X} of this spell's cost. You choose the value of X.)\nDestroy target creature with power X or less.",
});

describe("assist (CR 702.132)", () => {
  it("the other player may decline: then the caster pays all of it", () => {
    supported(chargingBinox, bringDown);
    const { s: s0, ap, ids, opp } = setup([chargingBinox]);
    let s = act(s0, { type: "castSpell", player: ap, objectId: ids[0]!, assist: opp });
    expect(s.pending).toMatchObject({ kind: "assist", player: opp, max: 7 });
    expect(waitingOn(s)).toBe(opp);
    s = asBot(s, opp); // bots are everyone's opponents: they don't help
    expect(s.pending).toMatchObject({ kind: "assistCast", player: ap, n: 0 });
    s = asBot(s, ap);
    expect(s.pending).toBeNull();
    expect(s.stack.at(-1)?.objectId).toBe(ids[0]);
    expect(tappedLands(s, ap)).toBe(8);
  });

  it("the helper activates mana abilities and pays generic mana; the caster pays the rest", () => {
    const { s: s0, ap, ids, opp } = setup([chargingBinox]);
    const theirs = [0, 1, 2].map(() => putOnBattlefield(s0, opp, forest));
    let s = act(s0, { type: "castSpell", player: ap, objectId: ids[0]!, assist: opp });
    for (const id of theirs) s = act(s, { type: "activateMana", player: opp, objectId: id, mana: "G" });
    // Not more than it has in its pool, nor more than the generic mana in the cost.
    expect(() => act(s, { type: "assist", player: opp, n: 4 })).toThrow(/not enough mana/);
    expect(() => act(s, { type: "assist", player: opp, n: 8 })).toThrow(/pay from 0 to 7/);
    s = act(s, { type: "assist", player: opp, n: 3 });
    s = asBot(s, ap);
    expect(s.stack.at(-1)?.objectId).toBe(ids[0]);
    expect(tappedLands(s, ap)).toBe(5); // {4}{G}
    expect(Object.values(s.players[opp]!.manaPool).reduce((a, b) => a + b, 0)).toBe(0);
    expect(s.log.some((l) => /pays \{3\} of Charging Binox's cost \(assist\)/.test(l.text))).toBe(true);
  });

  it("with X, the caster chooses X and the helper can pay up to X of it", () => {
    const { s: s0, ap, ids, opp } = setup([gangUp]);
    const big = putOnBattlefield(s0, opp, bear());
    const theirs = [0, 1, 2].map(() => putOnBattlefield(s0, opp, forest));
    let s = act(s0, { type: "castSpell", player: ap, objectId: ids[0]!, targets: [target(big)], x: 3, assist: opp });
    expect(s.pending).toMatchObject({ kind: "assist", max: 3 });
    for (const id of theirs) s = act(s, { type: "activateMana", player: opp, objectId: id, mana: "G" });
    s = act(s, { type: "assist", player: opp, n: 3 });
    s = asBot(s, ap);
    expect(tappedLands(s, ap)).toBe(1); // just {B}
    expect(s.stack.at(-1)?.objectId).toBe(ids[0]);
  });

  it("a sorcery with a target: Bring Down, half paid by the helper", () => {
    const { s: s0, ap, ids, opp } = setup([bringDown]);
    const big = putOnBattlefield(s0, opp, bear({ name: "Big Bear", power: "4", toughness: "4" }));
    const theirs = [0, 1].map(() => putOnBattlefield(s0, opp, forest));
    let s = act(s0, { type: "castSpell", player: ap, objectId: ids[0]!, targets: [target(big)], assist: opp });
    for (const id of theirs) s = act(s, { type: "activateMana", player: opp, objectId: id, mana: "G" });
    s = asBot(act(s, { type: "assist", player: opp, n: 2 }), ap);
    expect(tappedLands(s, ap)).toBe(2); // {1}{W}
    for (let i = 0; i < 8 && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[big]!.zone).toBe("graveyard");
  });

  it("the caster can still back out, and the spell stays in hand (CR 733.1)", () => {
    const { s: s0, ap, ids, opp } = setup([chargingBinox]);
    let s = asBot(act(s0, { type: "castSpell", player: ap, objectId: ids[0]!, assist: opp }), opp);
    s = act(s, { type: "finishAssistedCast", player: ap, cancel: true });
    expect(s.pending).toBeNull();
    expect(s.objects[ids[0]!]!.zone).toBe("hand");
    expect(tappedLands(s, ap)).toBe(0);
  });

  it("needs another player in the game, and a total cost with generic mana", () => {
    const noGeneric = card("Test Assist", "Instant", "{G}", { keywords: ["Assist"], oracleText: "Assist (Another player can pay up to {0} of this spell's cost.)\nDraw a card." });
    const { s, ap, ids, opp } = setup([chargingBinox, noGeneric]);
    expect(() => act(s, { type: "castSpell", player: ap, objectId: ids[0]!, assist: ap })).toThrow(/another player/);
    expect(() => act(s, { type: "castSpell", player: ap, objectId: ids[1]!, assist: opp })).toThrow(/no generic mana/);
    // The caster can't say how much the helper pays.
    expect(() => act(s, { type: "castSpell", player: ap, objectId: ids[0]!, assist: opp, assisted: 7 })).toThrow(/assisting player chooses/);
  });
});
