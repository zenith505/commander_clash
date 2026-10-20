// Round 95: Conduit of Worlds: "{T}: Choose target nonland permanent card in your graveyard. If you haven't cast a spell
// this turn, you may cast that card. If you do, you can't cast additional spells this turn. Activate only as a sorcery."
// Cast as the ability resolves, paying its costs (CR 608.2g, 601.2), or not at all (rulings); spells cast earlier this
// turn count, even ones countered (rulings).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, planCast, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const conduit = card("Conduit of Worlds", "Artifact", "{2}{G}{G}", { oracleText: "You may play lands from your graveyard.\n{T}: Choose target nonland permanent card in your graveyard. If you haven't cast a spell this turn, you may cast that card. If you do, you can't cast additional spells this turn. Activate only as a sorcery." });
const ogre = card("Gray Ogre", "Creature — Ogre", "{2}{R}", { power: "2", toughness: "2" });

const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  for (const a of plan!) s = act(s, a);
  return s;
};
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
function inGraveyard(s: GameState, pid: PlayerId, id: string) {
  const p = s.players[pid]!;
  p.hand.splice(p.hand.indexOf(id), 1);
  p.graveyard.push(id);
  s.objects[id]!.zone = "graveyard";
}

describe("Conduit of Worlds", () => {
  it("parse", () => expect(isFullySupported(conduit)).toBe(true));

  it("casts the card from your graveyard as the ability resolves, paying its cost; then no more spells this turn", () => {
    const { s: s0, ap, ids } = setup([ogre, bear()]);
    const c = putOnBattlefield(s0, ap, conduit);
    inGraveyard(s0, ap, ids[0]!);
    let s = activate(s0, ap, c, 0, [target(ids[0]!)]);
    expect(s.pending).toMatchObject({ kind: "castFree", how: "paid", objectId: ids[0] });
    s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto")));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(planCast(s, ap, ids[1]!)).toBeNull();
    expect(s.cantCastThisTurn?.some((c) => c.player === ap && c.turn === s.turn)).toBe(true);
  });

  it("declining: the card stays, and other spells can still be cast", () => {
    const { s: s0, ap, ids } = setup([ogre, bear()]);
    const c = putOnBattlefield(s0, ap, conduit);
    inGraveyard(s0, ap, ids[0]!);
    let s = activate(s0, ap, c, 0, [target(ids[0]!)]);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(planCast(s, ap, ids[1]!)).not.toBeNull();
  });

  it("after a spell was cast this turn it does nothing", () => {
    const { s: s0, ap, ids } = setup([ogre, bear()]);
    const c = putOnBattlefield(s0, ap, conduit);
    inGraveyard(s0, ap, ids[0]!);
    let s = settle(run(s0, planCast(s0, ap, ids[1]!)));
    s = settle(activate(s, ap, c, 0, [target(ids[0]!)]));
    expect(s.pending).toBeNull();
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });
});
