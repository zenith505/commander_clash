// Rakdos Charm's third mode (round 91): "Each creature deals 1 damage to its controller." Each creature is the source of
// its own damage (CR 120.3), all dealt at once; a creature with lifelink gains its controller that life (CR 702.15b) and
// one with infect gives poison counters instead (CR 702.90b).

import { describe, expect, it } from "vitest";
import { bear, card, cast, putOnBattlefield, setup } from "./helpers";
import { chooseModes, compileCard, isFullySupported } from "../src";

// Real oracle text (Scryfall).
const charm = card("Rakdos Charm", "Instant", "{B}{R}", { oracleText: "Choose one —\n• Exile target player's graveyard.\n• Destroy target artifact.\n• Each creature deals 1 damage to its controller." });

describe("Rakdos Charm", () => {
  it("parses", () => expect(isFullySupported(charm)).toBe(true));

  it("each creature deals 1 damage to its controller", () => {
    const { s: s0, ap, ids, opp } = setup([charm]);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    putOnBattlefield(s0, ap, bear());
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, bear());
    putOnBattlefield(s0, opp, bear({ name: "Lifelinker", keywords: ["Lifelink"] }));
    putOnBattlefield(s0, third, bear({ name: "Plague Rat", keywords: ["Infect"] }));
    const life = (pid: number) => s0.players[pid]!.life;
    const [mine, theirs, thirds] = [life(ap), life(opp), life(third)];
    const s = cast(s0, ap, ids[0]!, [], [2]);
    expect(s.players[ap]!.life).toBe(mine - 1);
    // Four damage, one of it from a lifelinker: 4 lost, 1 gained.
    expect(s.players[opp]!.life).toBe(theirs - 4 + 1);
    // Infect: a poison counter, no life lost.
    expect(s.players[third]!.life).toBe(thirds);
    expect(s.players[third]!.poison).toBe(1);
  });

  it("bots choose it when the opponents control more creatures", () => {
    const { s, ap, opp } = setup([charm]);
    const body = compileCard(charm).spell!;
    putOnBattlefield(s, ap, bear());
    expect(chooseModes(s, ap, body)?.modes ?? []).not.toContain(2);
    for (let i = 0; i < 4; i++) putOnBattlefield(s, opp, bear());
    expect(chooseModes(s, ap, body)?.modes).toEqual([2]);
  });
});
