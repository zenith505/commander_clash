import { describe, expect, it } from "vitest";
import { fourPlayerGame, passUntil } from "./helpers";

describe("the game log", () => {
  it("records the step each line happened in, so the log can group a turn by phase", () => {
    let s = fourPlayerGame();
    const first = s.activePlayer;
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(first) + 1) % 4]);
    // The first player discards down to seven in their cleanup step (CR 514.1), in turn 1's ending phase.
    const discard = s.log.find((e) => e.turn === 1 && / discards /.test(e.text));
    expect(discard?.step).toBe("cleanup");
    expect(s.log.find((e) => e.text.startsWith("Game start"))?.step).toBe("untap");
    expect(s.log.every((e) => e.step !== undefined)).toBe(true);
  });
});
