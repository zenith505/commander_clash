// Melee (CR 702.121): "Whenever this creature attacks, it gets +1/+1 until end of turn for each opponent you attacked
// with a creature this combat." Counted as it resolves; planeswalkers don't count (Wings of the Guard rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { characteristics, isFullySupported, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) =>
  settle(act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks }));

// Real oracle text (Scryfall).
const protester = card("Deputized Protester", "Creature — Human Warrior", "{2}{R}", {
  power: "2",
  toughness: "1",
  keywords: ["Menace", "Melee"],
  oracleText:
    "Menace (This creature can't be blocked except by two or more creatures.)\nMelee (Whenever this creature attacks, it gets +1/+1 until end of turn for each opponent you attacked this combat.)",
});
const adriana = card("Adriana, Captain of the Guard", "Legendary Creature — Human Knight", "{3}{R}{W}", {
  power: "4",
  toughness: "4",
  keywords: ["Melee"],
  oracleText:
    "Melee (Whenever this creature attacks, it gets +1/+1 until end of turn for each opponent you attacked this combat.)\nOther creatures you control have melee. (If a creature has multiple instances of melee, each triggers separately.)",
});

describe("melee", () => {
  it("+1/+1 for each opponent attacked, however many creatures attacked each", () => {
    supported(protester, adriana);
    const { s: s0, ap, opp } = setup([]);
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const d = putOnBattlefield(s0, ap, protester);
    const b1 = putOnBattlefield(s0, ap, bear());
    const b2 = putOnBattlefield(s0, ap, bear());
    const s = attack(s0, ap, [
      { attacker: d, defender: opp },
      { attacker: b1, defender: other },
      { attacker: b2, defender: other },
    ]);
    expect(characteristics(s, s.objects[d]!)).toMatchObject({ power: 4, toughness: 3 });
  });

  it("each instance triggers separately: Adriana's granted melee stacks with a creature's own", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, adriana);
    const d = putOnBattlefield(s0, ap, protester);
    const b = putOnBattlefield(s0, ap, bear());
    const s = attack(s0, ap, [
      { attacker: a, defender: opp },
      { attacker: d, defender: opp },
    ]);
    expect(characteristics(s, s.objects[a]!).power).toBe(5);
    expect(characteristics(s, s.objects[d]!).power).toBe(4); // two melee triggers, one opponent attacked
    expect(characteristics(s, s.objects[b]!).power).toBe(2); // didn't attack
  });
});
