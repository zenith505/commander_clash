// Round 100: Forge Anew ("During your turn, you may activate equip abilities any time you could cast an instant", "You
// may pay {0} rather than pay the equip cost of the first equip ability you activate during each of your turns": an
// alternative cost, CR 118.9), Leonin Shikari, and Legion Leadership ("double target creature's power and it gains first
// strike", CR 701.10f-style doubling as +X/+0).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup, target } from "./helpers";
import { abilityProblem, isFullySupported, planActivate, planCast, power, objHasKeyword, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const forge = card("Forge Anew", "Enchantment", "{2}{W}", { oracleText: "When Forge Anew enters, return target Equipment card from your graveyard to the battlefield.\nDuring your turn, you may activate equip abilities any time you could cast an instant.\nYou may pay {0} rather than pay the equip cost of the first equip ability you activate during each of your turns." });
const shikari = card("Leonin Shikari", "Creature — Cat Soldier", "{1}{W}", { power: "2", toughness: "2", oracleText: "You may activate equip abilities any time you could cast an instant." });
const sword = card("Bonesplitter", "Artifact — Equipment", "{1}", { oracleText: "Equipped creature gets +2/+0.\nEquip {1}" });
const leadership = card("Legion Leadership", "Instant", "{1}{R}", { oracleText: "Until end of turn, double target creature's power and it gains first strike." });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  if (!plan) throw new Error("can't do that");
  return settle(plan.reduce((x, a) => act(x, a), s));
};
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

describe("round 100: Forge Anew, Leonin Shikari, Legion Leadership", () => {
  it("parse", () => {
    for (const d of [forge, shikari, leadership]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Forge Anew returns an Equipment card from your graveyard as it enters", () => {
    const { s: s0, ap, ids } = setup([forge]);
    const sw = putOnBattlefield(s0, ap, sword);
    s0.battlefield.splice(s0.battlefield.indexOf(sw), 1);
    s0.objects[sw]!.zone = "graveyard";
    s0.players[ap]!.graveyard.push(sw);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(sw)] }));
    expect(s.objects[sw]!.zone).toBe("battlefield");
  });

  it("Forge Anew: the first equip each of your turns costs {0}, and equip works with a spell on the stack", () => {
    const { s: s0, ap, ids } = setup([shock]);
    putOnBattlefield(s0, ap, forge);
    const sw = putOnBattlefield(s0, ap, sword);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    // A spell of ours on the stack: an instant-speed moment.
    s0.players[ap]!.manaPool.R = 1;
    let s = planCast(s0, ap, ids[0]!, [{ kind: "player", id: s0.turnOrder[1]! }])!.reduce((x, step) => act(x, step), s0);
    expect(s.stack.length).toBe(1);
    expect(abilityProblem(s, ap, sw, 0, [target(a)])).toBeNull(); // no mana in the pool, and it's free
    s = act(s, { type: "activateAbility", player: ap, objectId: sw, index: 0, targets: [target(a)] } as never);
    s = settle(s);
    expect(s.objects[sw]!.attachedTo).toBe(a);
    // The second one costs {1}.
    expect(abilityProblem(s, ap, sw, 0, [target(b)])).toMatch(/mana/);
  });

  it("Forge Anew: not during an opponent's turn; Leonin Shikari: any time", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, opp, forge);
    const sw = putOnBattlefield(s, opp, sword);
    const a = putOnBattlefield(s, opp, bear());
    s.priority = opp;
    s.players[opp]!.manaPool.C = 1;
    expect(abilityProblem(s, opp, sw, 0, [target(a)])).toMatch(/sorcery/);
    putOnBattlefield(s, opp, shikari);
    expect(abilityProblem(s, opp, sw, 0, [target(a)])).toBeNull();
    void ap;
  });

  it("Legion Leadership doubles power and gives first strike", () => {
    const { s: s0, ap, ids } = setup([leadership]);
    const a = putOnBattlefield(s0, ap, bear());
    const s = run(s0, planCast(s0, ap, ids[0]!, [target(a)]));
    expect(power(s, s.objects[a]!)).toBe(4);
    expect(objHasKeyword(s, s.objects[a]!, "First strike")).toBe(true);
  });
});
