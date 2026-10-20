// Smaller cards from the most played Commander cards: Whispersilk Cloak ("can't be blocked and has shroud"), Return of
// the Wildspeaker ("the greatest power among non-Human creatures you control"), Aetherflux Reservoir ("for each spell
// you've cast this turn") and Idol of Oblivion ("Activate only if you created a token this turn").

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { abilityProblem, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type GameState } from "../src";

// Real oracle text (Scryfall).
const cloak = card("Whispersilk Cloak", "Artifact — Equipment", "{3}", { oracleText: "Equipped creature can't be blocked and has shroud. (It can't be the target of spells or abilities.)\nEquip {2}" });
const wildspeaker = card("Return of the Wildspeaker", "Instant", "{4}{G}", { oracleText: "Choose one —\n• Draw cards equal to the greatest power among non-Human creatures you control.\n• Non-Human creatures you control get +3/+3 until end of turn." });
const reservoir = card("Aetherflux Reservoir", "Artifact", "{4}", { oracleText: "Whenever you cast a spell, you gain 1 life for each spell you've cast this turn.\nPay 50 life: This artifact deals 50 damage to any target." });
const idol = card("Idol of Oblivion", "Artifact", "{2}", { oracleText: "{T}: Draw a card. Activate only if you created a token this turn.\n{8}, {T}, Sacrifice this artifact: Create a 10/10 colorless Eldrazi creature token." });
const ornithopter = card("Ornithopter", "Artifact Creature — Thopter", "{0}", { power: "0", toughness: "2", keywords: ["Flying"], oracleText: "Flying" });
const tokenMaker = card("Raise the Alarm", "Instant", "{1}{W}", { oracleText: "Create two 1/1 white Soldier creature tokens." });

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("smaller cards from the most played", () => {
  it("parse", () => {
    for (const d of [cloak, wildspeaker, reservoir, idol]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Whispersilk Cloak: equipped creature can't be blocked and has shroud", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, bear());
    const c = putOnBattlefield(s0, ap, cloak);
    const s = settle(run(s0, planActivate(s0, ap, c, 0, [target(b)])));
    expect(s.objects[c]!.attachedTo).toBe(b);
    const ch = characteristics(s, s.objects[b]!);
    expect(ch.keywords).toContain("Shroud");
    expect(ch.cantBeBlocked).toBeTruthy();
  });

  it("Return of the Wildspeaker draws cards equal to the greatest power among non-Humans", () => {
    const { s: s0, ap, ids } = setup([wildspeaker]);
    putOnBattlefield(s0, ap, bear({ power: "3" }));
    putOnBattlefield(s0, ap, card("Big Human", "Creature — Human", "{3}", { power: "6", toughness: "6" }));
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, [0])));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3);
  });

  it("Aetherflux Reservoir gains 1 life for each spell cast this turn, the one that triggered it included", () => {
    const { s: s0, ap, ids } = setup([ornithopter, ornithopter, ornithopter]);
    putOnBattlefield(s0, ap, reservoir);
    const life = s0.players[ap]!.life;
    let s = s0;
    for (const id of ids) s = settle(run(s, planCast(s, ap, id)));
    expect(s.players[ap]!.life).toBe(life + 1 + 2 + 3);
  });

  it("Idol of Oblivion draws only after you created a token this turn", () => {
    const { s: s0, ap, ids } = setup([tokenMaker]);
    const i = putOnBattlefield(s0, ap, idol);
    expect(abilityProblem(s0, ap, i, 0)).not.toBeNull();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(abilityProblem(s, ap, i, 0)).toBeNull();
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planActivate(s, ap, i, 0)));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    // Next turn, not any more.
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    s.objects[i]!.tapped = false;
    invalidateCharacteristics(s);
    expect(abilityProblem(s, ap, i, 0)).not.toBeNull();
  });
});
