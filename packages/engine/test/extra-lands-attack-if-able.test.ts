// "You may play an additional land this turn" (CR 305.2a: an effect can let a player play extra lands; this one lasts
// only for the turn it resolves in) and "target creature attacks this turn if able" (an attack requirement for each
// declare attackers step this turn, CR 508.1d).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, forest, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { compileCard, isFullySupported, legalActions, type CardDef } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const explore = card("Explore", "Sorcery", "{1}{G}", { oracleText: "You may play an additional land this turn.\nDraw a card." });
const summerBloom = card("Summer Bloom", "Sorcery", "{1}{G}", { oracleText: "You may play up to three additional lands this turn." });
const boilingBlood = card("Boiling Blood", "Instant", "{2}{R}", { oracleText: "Target creature attacks this turn if able.\nDraw a card." });
const trick = card("Chemister's Trick", "Instant", "{U}{R}", { oracleText: "Target creature you don't control gets -2/-0 until end of turn and attacks this turn if able.\nOverload {3}{U}{R} (You may cast this spell for its overload cost. If you do, change \"target\" in its text to \"each.\")" });
const impsTaunt = card("Imps' Taunt", "Instant", "{1}{B}", { oracleText: "Buyback {3} (You may pay an additional {3} as you cast this spell. If you do, put this card into your hand as it resolves.)\nTarget creature attacks this turn if able." });

describe("additional land plays and attacks this turn if able", () => {
  it("compiles them", () => {
    supported(explore, summerBloom, boilingBlood, impsTaunt, trick);
    // Chemister's Trick: one change until end of turn, the attack requirement with it (CR 508.1d).
    expect(compileCard(trick).spell!.effects).toEqual([{ type: "continuous", what: { ref: "target", index: 0 }, mods: [expect.objectContaining({ kind: "modifyPT" }), { kind: "attacksIfAble" }], duration: "endOfTurn" }]);
  });

  it("Explore lets you play a second land this turn only", () => {
    let { s, ap, ids } = setup([explore, forest, forest, forest]);
    const [ex, f1, f2, f3] = ids as [string, string, string, string];
    const canPlay = (id: string) => legalActions(s, ap).some((a) => a.type === "playLand" && a.objectId === id);
    s = act(s, { type: "playLand", player: ap, objectId: f1 });
    expect(canPlay(f2)).toBe(false);
    s = cast(s, ap, ex);
    expect(canPlay(f2)).toBe(true);
    s = act(s, { type: "playLand", player: ap, objectId: f2 });
    expect(canPlay(f3)).toBe(false);
    // Next turn the extra play is gone.
    const turn = s.turn;
    s = passUntil(passUntil(s, "end", ap), "main1", ap);
    expect(s.turn).toBeGreaterThan(turn);
    expect(s.players[ap]!.landsPlayedThisTurn).toBe(0);
    s = act(s, { type: "playLand", player: ap, objectId: f3 });
    expect(legalActions(s, ap).some((a) => a.type === "playLand")).toBe(false);
  });

  it("Summer Bloom gives three more land plays", () => {
    let { s, ap, ids } = setup([summerBloom, forest, forest, forest, forest, forest]);
    s = cast(s, ap, ids[0]!);
    for (const f of ids.slice(1, 5)) s = act(s, { type: "playLand", player: ap, objectId: f });
    expect(legalActions(s, ap).some((a) => a.type === "playLand" && a.objectId === ids[5])).toBe(false);
  });

  it("Boiling Blood makes the creature attack this turn, and not next turn", () => {
    let { s, ap, ids, opp } = setup([boilingBlood]);
    const b = putOnBattlefield(s, ap, bear());
    s = cast(s, ap, ids[0]!, [target(b)]);
    let at = passUntil(s, "declareAttackers", ap);
    expect(() => act(at, { type: "declareAttackers", player: ap, attacks: [] })).toThrow(/attacks each combat if able/);
    at = act(at, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    // The effect ends with the turn (CR 514.2).
    const next = passUntil(passUntil(at, "end", ap), "declareAttackers", ap);
    expect(next.turn).toBeGreaterThan(at.turn);
    expect(() => act(next, { type: "declareAttackers", player: ap, attacks: [] })).not.toThrow();
  });
});
