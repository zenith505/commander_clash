// Paradigm (CR 702.192a): the spell is exiled as it resolves, and the first time a spell you control with its name
// resolves, at the beginning of each of your precombat main phases for the rest of the game a copy of it is created in
// exile, which you may cast without paying its mana cost. A copy not cast ceases to exist (CR 704.5e; rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, planCast, waitingOn, type Action, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const PARADIGM = "Paradigm (Then exile this spell. After you first resolve a spell with this name, you may cast a copy of it from exile without paying its mana cost at the beginning of each of your first main phases.)";
const practicum = () => card("Germination Practicum", "Sorcery — Lesson", "{3}{G}{G}", { keywords: ["Paradigm"], oracleText: `Put two +1/+1 counters on each creature you control.\n${PARADIGM}` });
const dissertation = card("Decorum Dissertation", "Sorcery — Lesson", "{3}{B}{B}", { keywords: ["Paradigm"], oracleText: `Target player draws two cards and loses 2 life.\n${PARADIGM}` });
const counterspell = card("Counterspell", "Instant", "{U}{U}", { oracleText: "Counter target spell." });
const island = card("Island", "Basic Land — Island");

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const counters = (s: GameState, id: string) => s.objects[id]!.counters["+1/+1"] ?? 0;
/** Pass to `pid`'s next precombat main phase and resolve the paradigm trigger up to its cast prompt. */
const nextMain = (s: GameState, pid: PlayerId) => settle(passUntil(passUntil(s, "end", pid), "main1", pid));

describe("paradigm", () => {
  it("parses", () => {
    expect(isFullySupported(practicum())).toBe(true);
    expect(isFullySupported(dissertation)).toBe(true);
  });

  it("Germination Practicum: exiled as it resolves, then a free copy at each of your precombat main phases", () => {
    const { s: s0, ap, ids } = setup([practicum()]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(counters(s, b)).toBe(2);
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    expect(s.pending).toBeFalsy(); // no copy this turn: the trigger waits for the next precombat main phase

    s = nextMain(s, ap);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap });
    const copy = s.pending?.kind === "castFree" ? s.pending.objectId : "";
    expect(copy).not.toBe(ids[0]);
    expect(s.objects[copy]!.zone).toBe("exile");
    s = settle(act(s, { type: "castSpell", player: ap, objectId: copy }));
    expect(counters(s, b)).toBe(4);
    expect(s.objects[copy]).toBeUndefined(); // the copy ceased to exist in exile (CR 704.5e)
    expect(s.pending).toBeFalsy();
    expect((s.delayed ?? []).filter((d) => d.when === "eachYourPrecombatMain")).toHaveLength(1);

    // Declining: the copy ceases to exist, and the trigger still comes back the turn after (rulings).
    s = nextMain(s, ap);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap });
    const copy2 = s.pending?.kind === "castFree" ? s.pending.objectId : "";
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[copy2]).toBeUndefined();
    expect(counters(s, b)).toBe(4);
    s = nextMain(s, ap);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap });
  });

  it("the card leaving exile doesn't stop the copies (rulings)", () => {
    const { s: s0, ap, ids } = setup([practicum()]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const p = s.players[ap]!;
    p.exile = p.exile.filter((x) => x !== ids[0]);
    s.objects[ids[0]!]!.zone = "graveyard";
    p.graveyard.push(ids[0]!);
    s = nextMain(s, ap);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap });
    s = settle(act(s, { type: "castSpell", player: ap, objectId: s.pending?.kind === "castFree" ? s.pending.objectId : "" }));
    expect(counters(s, b)).toBe(4);
  });

  it("only the first spell with that name sets up copies", () => {
    const { s: s0, ap, ids } = setup([practicum(), practicum()]);
    putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, ap, forest); // a second {G}{G}
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.objects[ids[1]!]!.zone).toBe("exile"); // still exiled
    expect((s.delayed ?? []).filter((d) => d.when === "eachYourPrecombatMain")).toHaveLength(1);
  });

  it("a countered paradigm spell goes to the graveyard and sets up nothing", () => {
    const { s: s0, ap, ids, opp } = setup([dissertation]);
    putOnBattlefield(s0, opp, island);
    putOnBattlefield(s0, opp, island);
    const cs = putOnBattlefield(s0, opp, counterspell);
    s0.battlefield.splice(s0.battlefield.indexOf(cs), 1);
    s0.objects[cs]!.zone = "hand";
    s0.players[opp]!.hand.push(cs);
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: ap }]));
    for (let i = 0; i < 4 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(run(s, planCast(s, opp, cs, [{ kind: "stack", id: s.stack.find((x) => x.kind === "spell")!.id }])));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.delayed ?? []).toHaveLength(0);
  });

  it("bots cast the free copy", () => {
    const { s: s0, ap, ids } = setup([practicum()]);
    putOnBattlefield(s0, ap, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = nextMain(s, ap);
    const copy = s.pending?.kind === "castFree" ? s.pending.objectId : "";
    expect(botActions(s, ap)).toContainEqual(expect.objectContaining({ type: "castSpell", objectId: copy }));
  });
});
