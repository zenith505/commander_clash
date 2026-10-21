// Round 100: "When ~ leaves the battlefield, you may pay {X}. When you do, he deals X damage to target player" (Electro,
// Assaulting Battery): X is chosen as the ability resolves, and paying triggers a reflexive ability with that X, its
// target chosen then (CR 603.12; rulings).

import { describe, expect, it } from "vitest";
import { act, card, cast, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const electro = card("Electro, Assaulting Battery", "Legendary Creature — Human Villain", "{1}{R}{R}", { power: "2", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nYou don't lose unspent red mana as steps and phases end.\nWhenever you cast an instant or sorcery spell, add {R}.\nWhen Electro leaves the battlefield, you may pay {X}. When you do, he deals X damage to target player." });
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("round 100: Electro", () => {
  it("parse", () => {
    expect(isFullySupported(electro)).toBe(true);
  });

  it("leaves the battlefield: pay X = 3, then 3 damage to the player chosen", () => {
    const { s: s0, ap, opp, ids } = setup([murder]);
    const e = putOnBattlefield(s0, ap, electro);
    Object.assign(s0.players[ap]!.manaPool, { B: 3, R: 2 });
    let s = settle(cast(s0, ap, ids[0]!, [target(e)]));
    expect(s.battlefield).not.toContain(e);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payX" });
    // B left over, R kept and one more from casting Murder: up to 4.
    expect(s.pending?.kind === "chooseOption" && s.pending.options).toContain("3");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "3" }));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const life = s.players[opp]!.life;
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.life).toBe(life - 3);
  });

  it("not paying: no reflexive ability", () => {
    const { s: s0, ap, ids } = setup([murder]);
    const e = putOnBattlefield(s0, ap, electro);
    Object.assign(s0.players[ap]!.manaPool, { B: 3 });
    let s = settle(cast(s0, ap, ids[0]!, [target(e)]));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }));
    expect(s.pending).toBeFalsy();
    expect(s.stack).toHaveLength(0);
  });
});
