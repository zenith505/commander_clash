// Round 433: Jace's Machinations ("Until end of turn, you may activate loyalty abilities of Jace planeswalkers you control
// on any player's turn any time you could cast an instant." "Empower Jace 8.").
import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const machinations = (): CardDef => ({"oracleId":"89bd056d-8f5b-4d0e-b80a-58a984e21100","name":"Jace's Machinations","manaCost":"{2}{U}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Until end of turn, you may activate loyalty abilities of Jace planeswalkers you control on any player's turn any time you could cast an instant.\nEmpower Jace 8. (Put eight loyalty counters on a Jace token you control. If you don't control one, first create a blue Jace planeswalker token with \"[−1]: Surveil 1\" and \"[−3]: Draw a card.\")","colors":["U"],"colorIdentity":["U"],"keywords":["Surveil","Empower Jace"],"layout":"normal"}) as CardDef;
const beleren = (): CardDef => ({"oracleId":"cc2b6e58-2d6f-495e-95f3-9496105c4cba","name":"Jace Beleren","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Legendary Planeswalker — Jace","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Jace"],"oracleText":"+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards.","loyalty":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Mill"],"layout":"normal"}) as CardDef;
const ajani = (): CardDef => ({"oracleId":"1d5ff280-7f4d-4801-aefd-9b6e6b1f2818","name":"Ajani, Caller of the Pride","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Legendary Planeswalker — Ajani","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Ajani"],"oracleText":"+1: Put a +1/+1 counter on up to one target creature.\n−3: Target creature gains flying and double strike until end of turn.\n−8: Create X 2/2 white Cat creature tokens, where X is your life total.","loyalty":"4","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;

/** Everyone passes until the stack is empty or `me` is asked something; bots answer the others. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Passes until `pid` has priority with an empty stack in `opp`'s upkeep. */
const theirUpkeep = (s: GameState, opp: PlayerId, pid: PlayerId) => {
  s = passUntil(s, "upkeep", opp);
  for (let i = 0; i < 20 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(s.activePlayer).toBe(opp);
  expect(waitingOn(s)).toBe(pid);
  return s;
};
const jaceTokens = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).subtypes.includes("Jace"));
/** The index of the activated ability of `id` whose text starts with `start`. */
const ability = (s: GameState, id: ObjectId, start: string) => {
  const text = s.cards[s.objects[id]!.cardId]!.oracleText.split("\n");
  return text.findIndex((l) => l.startsWith(start));
};

describe("round 433: Jace's Machinations", () => {
  it("is fully supported", () => {
    expect(isFullySupported(machinations())).toBe(true);
  });

  it("cast in an opponent's upkeep: a Jace token with 8 loyalty, whose loyalty abilities you may activate that turn, once", () => {
    const { s: s0, ap, opp, ids } = setup([machinations()]);
    let s = theirUpkeep(s0, opp, ap);
    s = settle(run(s, planCast(s, ap, ids[0]!)), ap);
    const tok = jaceTokens(s, ap)[0]!;
    expect(tok).toBeDefined();
    expect(s.objects[tok]!.counters.loyalty).toBe(8);
    for (let i = 0; i < 20 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.activePlayer).toBe(opp);
    const surveil = planActivate(s, ap, tok, 0);
    expect(surveil).not.toBeNull();
    s = run(s, surveil);
    expect(s.objects[tok]!.counters.loyalty).toBe(7);
    s = settle(s, ap);
    if (s.pending?.kind) s = settle(act(s, botActions(s, ap)[0]!), ap);
    // Still one loyalty ability of each permanent each turn (CR 606.3).
    for (let i = 0; i < 20 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(planActivate(s, ap, tok, 1)).toBeNull();
  });

  it("covers your other Jace planeswalkers too, but not other planeswalkers, and only this turn", () => {
    const { s: s0, ap, opp, ids } = setup([machinations()]);
    const jace = putOnBattlefield(s0, ap, beleren());
    const aj = putOnBattlefield(s0, ap, ajani());
    s0.objects[jace]!.counters.loyalty = 3;
    s0.objects[aj]!.counters.loyalty = 4;
    invalidateCharacteristics(s0);
    let s = theirUpkeep(s0, opp, ap);
    // Not before the spell.
    expect(planActivate(s, ap, jace, ability(s, jace, "−1"))).toBeNull();
    s = settle(run(s, planCast(s, ap, ids[0]!)), ap);
    for (let i = 0; i < 20 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(planActivate(s, ap, jace, ability(s, jace, "−1"), [{ kind: "player", id: ap }])).not.toBeNull();
    expect(planActivate(s, ap, aj, ability(s, aj, "+1"), [])).toBeNull();
    // The next player's turn: no more.
    const next = s.turnOrder[(s.turnOrder.indexOf(opp) + 1) % 4]!;
    s = next === ap ? s : theirUpkeep(s, next, ap);
    if (next !== ap) expect(planActivate(s, ap, jace, ability(s, jace, "−1"), [{ kind: "player", id: ap }])).toBeNull();
  });
});
