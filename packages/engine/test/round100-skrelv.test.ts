// Round 100: Skrelv, Defector Mite: "Choose a color. Another target creature you control gains toxic 1 and hexproof from
// that color until end of turn. It can't be blocked by creatures of that color this turn." The color is chosen as the
// ability resolves (CR 608.2d); hexproof from a color (CR 702.11d); toxic (CR 702.164).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { characteristics, isFullySupported, planActivate, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const skrelv = card("Skrelv, Defector Mite", "Legendary Artifact Creature — Phyrexian Mite", "{W}", { power: "1", toughness: "1", keywords: ["Toxic"], oracleText: "Toxic 1 (Players dealt combat damage by this creature also get a poison counter.)\nThis creature can't block.\n{W/P}, {T}: Choose a color. Another target creature you control gains toxic 1 and hexproof from that color until end of turn. It can't be blocked by creatures of that color this turn." });
const blueBear = card("Blue Bear", "Creature — Bear", "{1}{U}", { power: "2", toughness: "2", colors: ["U"] });
const redBear = card("Red Bear", "Creature — Bear", "{1}{R}", { power: "2", toughness: "2", colors: ["R"] });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("round 100: Skrelv, Defector Mite", () => {
  it("parse", () => expect(isFullySupported(skrelv)).toBe(true));

  it("toxic 1, hexproof from the chosen color, and unblockable by creatures of that color", () => {
    const { s: s0, ap, opp } = setup([]);
    const sk = putOnBattlefield(s0, ap, skrelv);
    const a = putOnBattlefield(s0, ap, bear());
    const blue = putOnBattlefield(s0, opp, blueBear);
    const red = putOnBattlefield(s0, opp, redBear);
    s0.players[ap]!.manaPool.W = 1;
    const plan = planActivate(s0, ap, sk, 0, [target(a)]);
    if (!plan) throw new Error("can't activate");
    let s = plan.reduce((x, step) => act(x, step), s0);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "color", player: ap });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Blue" }));
    expect(characteristics(s, s.objects[a]!).keywords).toEqual(expect.arrayContaining(["Toxic 1", "Hexproof from blue"]));
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    s = passUntil(s, "declareBlockers", ap);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: blue, attacker: a }] })).toThrow();
    // A red creature can block it.
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: red, attacker: a }] })).not.toThrow();
  });

  it("can't target itself (another target creature)", () => {
    const { s, ap } = setup([]);
    const sk = putOnBattlefield(s, ap, skrelv);
    s.players[ap]!.manaPool.W = 1;
    expect(planActivate(s, ap, sk, 0, [target(sk)])).toBeNull();
  });
});
