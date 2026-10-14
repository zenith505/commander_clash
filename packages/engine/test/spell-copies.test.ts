// Copies of spells (CR 707.10): Twincast, storm (702.40), replicate (702.56), "whenever you cast ..., copy it".

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planCast, waitingOn, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const castOnly = (s: GameState, pid: PlayerId, id: string, targets?: TargetChoice[], kicks?: number[]) => {
  const plan = planCast(s, pid, id, targets, undefined, undefined, undefined, kicks ? { kicks } : {});
  expect(plan, `cast ${s.cards[s.objects[id]!.cardId]!.name}`).toBeTruthy();
  return plan!.reduce((x, a) => act(x, a), s);
};
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const lives = (s: GameState) => s.turnOrder.map((p) => s.players[p]!.life);

const shock = card("Shock Test", "Instant", "{R}", { oracleText: "Shock Test deals 2 damage to any target." });
const opt = card("Cantrip Test", "Sorcery", "{U}", { oracleText: "Draw a card." });
const grapeshot = card("Grapeshot Test", "Sorcery", "{1}{R}", { oracleText: "Grapeshot Test deals 1 damage to any target.\nStorm", keywords: ["Storm"] });
const twincast = card("Twincast Test", "Instant", "{U}{U}", { oracleText: "Copy target instant or sorcery spell. You may choose new targets for the copy." });

describe("copying spells", () => {
  it("all compile", () => supported(grapeshot, twincast));

  it("Twincast: the copy keeps the original's targets unless new ones are chosen; it isn't cast and vanishes", () => {
    const { s: s0, ap, opp, ids } = setup([shock, twincast]);
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    let s = castOnly(s0, ap, ids[0]!, [player(opp)]);
    const bolt = s.stack[s.stack.length - 1]!.id;
    s = castOnly(s, ap, ids[1]!, [{ kind: "stack", id: bolt }]);
    s = settle(s);
    expect(s.pending?.kind).toBe("copyTargets");
    // A new target must be legal; this one is.
    s = act(s, { type: "copyTargets", player: ap, targets: [player(third)] });
    expect(s.stack.map((x) => x.description)).toEqual(["Shock Test", "Shock Test (copy)"]);
    s = settle(s);
    expect(s.players[opp]!.life).toBe(40 - 2);
    expect(s.players[third]!.life).toBe(40 - 2);
    expect(Object.values(s.objects).filter((o) => o.spellCopy)).toHaveLength(0); // CR 707.10a
    expect(s.players[ap]!.graveyard).toEqual(expect.arrayContaining([ids[0], ids[1]]));
    expect(s.players[ap]!.graveyard).toHaveLength(2);
  });

  it("keeping the targets", () => {
    const { s: s0, ap, opp, ids } = setup([shock, twincast]);
    let s = castOnly(s0, ap, ids[0]!, [player(opp)]);
    s = castOnly(s, ap, ids[1]!, [{ kind: "stack", id: s.stack[s.stack.length - 1]!.id }]);
    s = settle(s);
    s = settle(act(s, { type: "copyTargets", player: ap }));
    expect(s.players[opp]!.life).toBe(40 - 4);
  });

  it("storm copies it once for each spell cast before it this turn", () => {
    const { s: s0, ap, opp, ids } = setup([opt, opt, grapeshot]);
    let s = settle(castOnly(s0, ap, ids[0]!));
    s = settle(castOnly(s, ap, ids[1]!));
    s = castOnly(s, ap, ids[2]!, [player(opp)]);
    s = settle(s);
    for (let i = 0; i < 2; i++) {
      expect(s.pending?.kind).toBe("copyTargets");
      s = settle(act(s, { type: "copyTargets", player: ap }));
    }
    expect(s.players[opp]!.life).toBe(40 - 3);
    expect(s.log.some((l) => /copies Grapeshot Test/.test(l.text))).toBe(true);
  });

  it("storm with no spells before it: no copies; a copy of a storm spell doesn't trigger storm (not cast)", () => {
    const { s: s0, ap, opp, ids } = setup([grapeshot]);
    const s = settle(castOnly(s0, ap, ids[0]!, [player(opp)]));
    expect(s.pending).toBeFalsy();
    expect(s.players[opp]!.life).toBe(40 - 1);
  });

  it("replicate: one copy for each time its replicate cost was paid", () => {
    const drain = card("Replicate Test", "Sorcery", "{1}{B}", { oracleText: "Replicate {1}\nTarget player loses 1 life." });
    supported(drain);
    const { s: s0, ap, opp, ids } = setup([drain]);
    let s = settle(castOnly(s0, ap, ids[0]!, [player(opp)], [0, 0, 0]));
    for (let i = 0; i < 3 && s.pending?.kind === "copyTargets"; i++) s = settle(act(s, { type: "copyTargets", player: ap }));
    expect(s.players[opp]!.life).toBe(40 - 4);
  });

  it("'whenever you cast an instant or sorcery spell, copy it' copies the cast spell", () => {
    const echo = card("Echo Test", "Enchantment", "{4}{U}{R}", { oracleText: "Whenever you cast an instant or sorcery spell, copy it. You may choose new targets for the copy." });
    supported(echo);
    const { s: s0, ap, opp, ids } = setup([shock]);
    putOnBattlefield(s0, ap, echo);
    let s = settle(castOnly(s0, ap, ids[0]!, [player(opp)]));
    expect(s.pending?.kind).toBe("copyTargets");
    s = settle(act(s, { type: "copyTargets", player: ap }));
    expect(s.players[opp]!.life).toBe(40 - 4);
  });

  it("a copy of a creature spell becomes a token (CR 608.3f)", () => {
    const major = card("Double Test", "Instant", "{G}{U}", { oracleText: "Copy target creature spell you control." });
    supported(major);
    const { s: s0, ap, ids } = setup([bear({ name: "Spell Bear" }), major]);
    let s = castOnly(s0, ap, ids[0]!);
    s = castOnly(s, ap, ids[1]!, [{ kind: "stack", id: s.stack[s.stack.length - 1]!.id }]);
    s = settle(s);
    const bears = s.battlefield.filter((x) => s.cards[s.objects[x]!.cardId]!.name === "Spell Bear");
    expect(bears).toHaveLength(2);
    expect(bears.filter((x) => s.objects[x]!.isToken)).toHaveLength(1);
    void lives;
  });
});
