// Round 95: Hydroelectric Specimen: "When this creature enters, you may change the target of target instant or sorcery
// spell with a single target to this creature." (CR 115.7a) Only if it's a legal target for that spell (rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, planCast, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall), the front face.
const specimen = card("Hydroelectric Specimen", "Creature — Weird", "{2}{U}", { power: "1", toughness: "4", keywords: ["Flash"], oracleText: "Flash\nWhen this creature enters, you may change the target of target instant or sorcery spell with a single target to this creature." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const playerBolt = card("Lava Spike", "Sorcery", "{R}", { oracleText: "Lava Spike deals 3 damage to target player." });

const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  for (const a of plan!) s = act(s, a);
  return s;
};
/** Pass until the ability is on the stack and its targets are asked for, or everything has resolved. */
function step(s: GameState, specimenId: string, spellId: string): GameState {
  for (let i = 0; i < 60; i++) {
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: s.pending.player, targets: [{ kind: "stack", id: s.stack.find((x) => x.objectId === spellId)!.id }] });
    else if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes: true });
    else if (s.pending) break;
    else if (!s.stack.length && !s.triggerQueue.length) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  void specimenId;
  return s;
}

describe("Hydroelectric Specimen", () => {
  it("parse", () => expect(isFullySupported(specimen)).toBe(true));

  it("the Shock aimed at a Bear hits the Specimen instead", () => {
    const { s: s0, ap, ids, opp } = setup([shock, specimen]);
    const b = putOnBattlefield(s0, opp, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(b)]));
    s = run(s, planCast(s, ap, ids[1]!));
    s = step(s, ids[1]!, ids[0]!);
    expect(s.objects[b]!.damage).toBe(0);
    expect(s.objects[ids[1]!]!.damage).toBe(2);
  });

  it("a spell that can't target it keeps its target (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([playerBolt, specimen]);
    const life = s0.players[opp]!.life;
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    s = run(s, planCast(s, ap, ids[1]!));
    s = step(s, ids[1]!, ids[0]!);
    expect(s.players[opp]!.life).toBe(life - 3);
  });
});
