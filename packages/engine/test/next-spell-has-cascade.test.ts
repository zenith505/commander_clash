// "The next noncreature spell you cast this turn has cascade" (Dark Apostle), "the next instant spell and the next sorcery
// spell you cast this turn each have cascade" (Smoldering Stagecoach): the spell gains cascade as it's cast, so its own
// cascade triggers (CR 702.85a); each such effect is one instance, and a spell of the wrong kind leaves it waiting
// (rulings).

import { describe, expect, it } from "vitest";
import { act, card, passAll, putOnBattlefield, setup } from "./helpers";
import { compileCard, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState } from "../src";
import { addMana } from "../src/spend";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const apostle = card("Dark Apostle", "Creature — Astartes Warlock", "{3}{R}", { power: "3", toughness: "3", oracleText: "Gift of Chaos — {3}, {T}: The next noncreature spell you cast this turn has cascade. (When you cast that spell, exile cards from the top of your library until you exile a nonland card that costs less. You may cast it without paying its mana cost. Put the exiled cards on the bottom in a random order.)" });
const bilepiper = card("Sloppity Bilepiper", "Creature — Demon", "{3}{B}", { power: "3", toughness: "3", oracleText: "Jolly Gutpipes — {2}, {T}, Sacrifice a creature: The next creature spell you cast this turn has cascade. (When you next cast a creature spell, exile cards from the top of your library until you exile a nonland card that costs less. You may cast it without paying its mana cost. Put the exiled cards on the bottom in a random order.)" });
const stagecoach = card("Smoldering Stagecoach", "Artifact — Vehicle", "{3}{R}", { power: "*", toughness: "3", oracleText: "Smoldering Stagecoach's power is equal to the number of instant and sorcery cards in your graveyard.\nWhenever this Vehicle attacks, the next instant spell and the next sorcery spell you cast this turn each have cascade.\nCrew 2" });

const giant = card("Hill Giant Test", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const sorcery = card("Test Sorcery", "Sorcery", "{3}{U}", { oracleText: "Draw a card." });

const cascades = (s: GameState) => s.log.filter((l) => / cascades: /.test(l.text)).length;
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
/** Resolve everything, declining cascade's free casts. */
function settle(s: GameState): GameState {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    s = act(s, s.pending?.kind === "castFree" ? { type: "chooseMay", player: pid, yes: false } : { type: "passPriority", player: pid });
  }
  return s;
}

describe("the next spell you cast this turn has cascade", () => {
  it("parse", () => {
    supported(apostle, bilepiper, stagecoach);
    expect(compileCard(apostle).activated[0]!.body.effects[0]).toMatchObject({ type: "nextCast", cascade: true, filter: { kind: "spell" } });
    expect(compileCard(stagecoach).triggers[0]!.body.effects).toHaveLength(2);
  });

  it("Dark Apostle: the creature spell doesn't get it, the noncreature spell after it does, and only that one", () => {
    const { s: s0, ap, ids } = setup([giant, sorcery, sorcery]);
    const a = putOnBattlefield(s0, ap, apostle);
    addMana(s0, ap, ["C", "C", "C"], {});
    let s = passAll(act(s0, { type: "activateAbility", player: ap, objectId: a, index: 0 }));
    expect(s.nextCast).toHaveLength(1);
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(cascades(s)).toBe(0);
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(cascades(s)).toBe(1);
    expect(s.log.some((l) => /^Test Sorcery cascades: /.test(l.text))).toBe(true);
    s = settle(run(s, planCast(s, ap, ids[2]!)));
    expect(cascades(s)).toBe(1);
  });

  it("two activations: two instances of cascade on the next noncreature spell (CR 702.85c)", () => {
    const { s: s0, ap, ids } = setup([sorcery]);
    const a = putOnBattlefield(s0, ap, apostle);
    const b = putOnBattlefield(s0, ap, apostle);
    addMana(s0, ap, ["C", "C", "C", "C", "C", "C"], {});
    let s = passAll(act(s0, { type: "activateAbility", player: ap, objectId: a, index: 0 }));
    s = passAll(act(s, { type: "activateAbility", player: ap, objectId: b, index: 0 }));
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(cascades(s)).toBe(2);
  });

  it("it ends with the turn", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, apostle);
    addMana(s0, ap, ["C", "C", "C"], {});
    const s = passAll(act(s0, { type: "activateAbility", player: ap, objectId: a, index: 0 }));
    const d = s.nextCast![0]!;
    expect(d.turn).toBe(s.turn);
  });
});
