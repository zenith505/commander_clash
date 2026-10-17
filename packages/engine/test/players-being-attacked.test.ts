// "The number of players being attacked" (Pack Attack): players a creature is attacking; attacking only a planeswalker
// doesn't attack its controller (CR 506.2, 508.3b).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, power } from "../src";

// Real oracle text (Scryfall).
const packAttack = card("Pack Attack", "Instant", "{1}{R}", { oracleText: "Attacking creatures get +X/+0 until end of turn, where X is the number of players being attacked.\nDraw a card." });

describe("players being attacked", () => {
  it("compiles", () => expect(isFullySupported(packAttack)).toBe(true));

  it("Pack Attack counts each player attacked once", () => {
    let { s, ap, ids } = setup([packAttack]);
    const [o1, o2] = s.turnOrder.filter((p) => p !== ap);
    const a = putOnBattlefield(s, ap, bear({ name: "Bear A" }));
    const b = putOnBattlefield(s, ap, bear({ name: "Bear B" }));
    const c = putOnBattlefield(s, ap, bear({ name: "Bear C" }));
    s = passUntil(s, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: o1! }, { attacker: b, defender: o1! }, { attacker: c, defender: o2! }] });
    s = cast(s, ap, ids[0]!);
    for (const id of [a, b, c]) expect(power(s, s.objects[id]!)).toBe(4);
  });
});
