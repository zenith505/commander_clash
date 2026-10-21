// Round 100: "Once during each of your turns, you may cast a creature spell from your graveyard" (Karador, Gisa and
// Geralf, Kess, Danitha) and Muldrotha's "During each of your turns, you may play a land and cast a permanent spell of each
// permanent type from your graveyard." The spell's costs and timing are the usual ones; an artifact creature uses one of
// its types (rulings); a new object gets a new permission (rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { castProblem, isFullySupported, mayPlayLandFromGraveyard, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const muldrotha = card("Muldrotha, the Gravetide", "Legendary Creature — Elemental Avatar", "{3}{B}{G}{U}", { power: "6", toughness: "6", oracleText: "During each of your turns, you may play a land and cast a permanent spell of each permanent type from your graveyard. (If a card has multiple permanent types, choose one as you play it.)" });
const karador = card("Karador, Ghost Chieftain", "Legendary Creature — Centaur Spirit", "{5}{B}{G}{W}", { power: "3", toughness: "4", oracleText: "This spell costs {1} less to cast for each creature card in your graveyard.\nOnce during each of your turns, you may cast a creature spell from your graveyard." });
const kess = card("Kess, Dissident Mage", "Legendary Creature — Human Wizard", "{1}{U}{B}{R}", { power: "3", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nOnce during each of your turns, you may cast an instant or sorcery spell from your graveyard. If a spell cast this way would be put into your graveyard, exile it instead." });
const golem = card("Bronze Golem", "Artifact Creature — Golem", "{2}", { power: "2", toughness: "2" });
const rock = card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}." });
const growth = card("Ancestral Recall", "Instant", "{U}", { oracleText: "Target player draws three cards." });
const land = card("Wastes", "Basic Land", "", { oracleText: "{T}: Add {C}." });

const toYard = (s: GameState, pid: PlayerId, d: CardDef) => {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};
const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  if (!plan) throw new Error("can't cast");
  for (const a of plan) s = act(s, a);
  return settle(s);
};
const via = { via: "turnPermission" as const };

describe("round 100: once-each-turn casting from a graveyard", () => {
  it("parse", () => {
    for (const d of [muldrotha, karador, kess]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Karador: one creature spell from the graveyard each turn", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, karador);
    const a = toYard(s0, ap, bear());
    const b = toYard(s0, ap, bear());
    expect(planCast(s0, ap, a, undefined, undefined, "auto", undefined, via)).not.toBeNull();
    let s = run(s0, planCast(s0, ap, a, undefined, undefined, "auto", undefined, via));
    expect(s.objects[a]!.zone).toBe("battlefield");
    expect(castProblem(s, ap, b, undefined, undefined, undefined, undefined, undefined, via)).toMatch(/doesn't have a once-each-turn permission/);
    // The next turn (the turn's record starts afresh), it can be used again.
    s.turnLog = undefined;
    expect(planCast(s, ap, b, undefined, undefined, "auto", undefined, via)).not.toBeNull();
  });

  it("Karador: not during an opponent's turn", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, opp, karador);
    const a = toYard(s, opp, bear());
    expect(castProblem(s, opp, a, undefined, undefined, undefined, undefined, undefined, via)).not.toBeNull();
    void ap;
  });

  it("Muldrotha: an artifact creature uses the artifact or the creature permission, and the other stays", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, muldrotha);
    const g = toYard(s0, ap, golem);
    const b = toYard(s0, ap, bear());
    const r = toYard(s0, ap, rock);
    const creature = `${m}@${s0.objects[m]!.zoneChanges ?? 0}:Creature`;
    let s = run(s0, planCast(s0, ap, g, undefined, undefined, "auto", undefined, { ...via, permit: creature }));
    expect(s.objects[g]!.zone).toBe("battlefield");
    expect(castProblem(s, ap, b, undefined, undefined, undefined, undefined, undefined, via)).toMatch(/doesn't have a once-each-turn permission/);
    s = run(s, planCast(s, ap, r, undefined, undefined, "auto", undefined, via));
    expect(s.objects[r]!.zone).toBe("battlefield");
  });

  it("Muldrotha: with no choice made, an artifact creature takes the slot nothing else in the graveyard needs", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, muldrotha);
    const g = toYard(s0, ap, golem);
    const b = toYard(s0, ap, bear());
    const s = run(s0, planCast(s0, ap, g, undefined, undefined, "auto", undefined, via));
    expect(s.objects[g]!.zone).toBe("battlefield");
    expect(planCast(s, ap, b, undefined, undefined, "auto", undefined, via)).not.toBeNull();
  });

  it("Muldrotha: one land from the graveyard each turn, as the turn's land play", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, muldrotha);
    const l1 = toYard(s0, ap, land);
    const l2 = toYard(s0, ap, land);
    s0.players[ap]!.landsPlayedThisTurn = 0;
    expect(mayPlayLandFromGraveyard(s0, s0.objects[l1]!, ap)).toBe(true);
    const s = act(s0, { type: "playLand", player: ap, objectId: l1 });
    expect(s.objects[l1]!.zone).toBe("battlefield");
    expect(mayPlayLandFromGraveyard(s, s.objects[l2]!, ap)).toBe(false);
  });

  it("Kess: the instant goes to exile instead of the graveyard", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, kess);
    const r = toYard(s0, ap, growth);
    const s = run(s0, planCast(s0, ap, r, [{ kind: "player", id: ap }], undefined, "auto", undefined, via));
    expect(s.objects[r]!.zone).toBe("exile");
  });
});
