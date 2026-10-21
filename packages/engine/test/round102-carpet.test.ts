// Round 102: Carpet of Flowers ("if you haven't added mana with this ability this turn", an intervening if, CR 603.4;
// not a mana ability since it targets, CR 605.1b).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const carpet = card("Carpet of Flowers", "Enchantment", "{G}", { oracleText: "At the beginning of each of your main phases, if you haven't added mana with this ability this turn, you may add X mana of any one color, where X is the number of Islands target opponent controls." });
const island = card("Island", "Basic Land — Island");

const pass = (s: GameState) => act(s, { type: "passPriority", player: waitingOn(s)! });
/** Pass priority until the stack is empty, answering the trigger's prompts: the target, "may", the color. */
const resolveCarpet = (s: GameState, opp: PlayerId, yes: boolean) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (!p) s = pass(s);
    else if (p.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: [{ kind: "player", id: opp }] } as never);
    else if (p.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes });
    else if (p.kind === "chooseOption" && p.what === "color") s = act(s, { type: "chooseOption", player: p.player, choice: "Blue" });
    else throw new Error(`unexpected ${JSON.stringify(p)}`);
  }
  return s;
};

describe("round 102: Carpet of Flowers", () => {
  it("parse", () => expect(isFullySupported(carpet)).toBe(true));

  it("adds mana equal to the target opponent's Islands once per turn; declining keeps the second main phase open", () => {
    for (const yes of [true, false]) {
      const { s: s0, ap, opp } = setup([]);
      putOnBattlefield(s0, opp, island);
      putOnBattlefield(s0, opp, island);
      const next = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % s0.turnOrder.length]!;
      let s = passUntil(s0, "main1", next);
      putOnBattlefield(s, ap, carpet);
      s = passUntil(s, "main1", ap);
      s = resolveCarpet(s, opp, yes);
      expect(s.players[ap]!.manaPool.U).toBe(yes ? 2 : 0);
      s = passUntil(s, "main2", ap);
      // Added mana already: the ability doesn't trigger (CR 603.4); declined: it does.
      expect(s.triggerQueue.length + s.stack.length).toBe(yes ? 0 : 1);
      s = resolveCarpet(s, opp, true);
      expect(s.players[ap]!.manaPool.U).toBe(yes ? 0 : 2);
    }
  });
});
