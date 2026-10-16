// "Distribute X +1/+1 counters among any number of creatures you control": no targets, so the counters are divided as
// it resolves (CR 608.2d, rulings on Blessing of Frost), among the creatures its controller controls then, any of
// them (protection doesn't stop it). Blessing of Frost's X is the snow mana spent to cast it (CR 107.4h); its draw
// counts power after the counters are on (rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, putOnBattlefield, setup, target } from "./helpers";
import { botActions, isFullySupported, waitingOn, type CardDef, type GameState, type ManaType, type PlayerId } from "../src";
import { addMana } from "../src/spend";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

// Real oracle text (Scryfall).
const blessing = card("Blessing of Frost", "Snow Sorcery", "{3}{G}", { oracleText: "Distribute X +1/+1 counters among any number of creatures you control, where X is the amount of {S} spent to cast this spell. Then draw a card for each creature you control with power 4 or greater." });
const hydra = card("Vastwood Hydra", "Creature — Hydra", "{X}{G}{G}", { power: "0", toughness: "0", oracleText: "This creature enters with X +1/+1 counters on it.\nWhen this creature dies, you may distribute a number of +1/+1 counters equal to the number of +1/+1 counters on this creature among any number of creatures you control." });
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });

/** Cast it from a pool of this mana, the first `snow` of it from snow sources. */
function castFrom(s: GameState, pid: PlayerId, id: string, mana: ManaType[], snow: number): GameState {
  if (snow) addMana(s, pid, mana.slice(0, snow), { from: ["snow"] });
  addMana(s, pid, mana.slice(snow), {});
  return passAll(act(s, { type: "castSpell", player: pid, objectId: id }));
}
const plusOnes = (s: GameState, id: string) => s.objects[id]!.counters["+1/+1"] ?? 0;

describe("distributing counters as it resolves", () => {
  it("parses", () => supported(blessing, hydra));

  it("Blessing of Frost: X is the snow mana spent; the counters are divided as it resolves, then it counts power 4 or greater", () => {
    const { s: s0, ap, ids } = setup([blessing]);
    const g = putOnBattlefield(s0, ap, giant);
    const b = putOnBattlefield(s0, ap, bear());
    const hand = s0.players[ap]!.hand.length;
    let s = castFrom(s0, ap, ids[0]!, ["G", "G", "C", "C"], 3);
    expect(s.pending).toMatchObject({ kind: "distribute", player: ap, total: 3, counter: "+1/+1" });
    const options = (s.pending as { options: string[] }).options;
    expect(options).toContain(g);
    expect(options).toContain(b);
    // Not all of them, not some other permanent, not a negative part.
    expect(() => act(s, { type: "distribute", player: ap, parts: { [g]: 2 } })).toThrow(/all 3/);
    expect(() => act(s, { type: "distribute", player: ap, parts: { [g]: 4, [b]: -1 } })).toThrow();
    s = act(s, { type: "distribute", player: ap, parts: { [g]: 1, [b]: 2 } });
    expect(plusOnes(s, g)).toBe(1);
    expect(plusOnes(s, b)).toBe(2);
    // Hill Giant is 4/4 and the bear 4/4 now: two cards (Blessing itself left the hand).
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
  });

  it("without snow mana, no counters and no question; the draw still counts", () => {
    const { s: s0, ap, ids } = setup([blessing]);
    const g = putOnBattlefield(s0, ap, card("Big Test", "Creature — Wurm", "{4}{G}", { power: "5", toughness: "5" }));
    const hand = s0.players[ap]!.hand.length;
    const s = castFrom(s0, ap, ids[0]!, ["G", "C", "C", "C"], 0);
    expect(s.pending).toBeNull();
    expect(plusOnes(s, g)).toBe(0);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
  });

  it("with only one creature, it gets them all without a question", () => {
    const { s: s0, ap, ids } = setup([blessing]);
    const b = putOnBattlefield(s0, ap, bear());
    const s = castFrom(s0, ap, ids[0]!, ["G", "G", "C", "C"], 4);
    expect(s.pending).toBeNull();
    expect(plusOnes(s, b)).toBe(4);
  });

  it("a bot lifts creatures to power 4 first", () => {
    const { s: s0, ap, ids } = setup([blessing]);
    const g = putOnBattlefield(s0, ap, giant);
    const b = putOnBattlefield(s0, ap, bear());
    let s = castFrom(s0, ap, ids[0]!, ["G", "G", "C", "C"], 3);
    const acts = botActions(s, ap);
    expect(acts).toEqual([{ type: "distribute", player: ap, parts: { [g]: 1, [b]: 2 } }]);
    s = act(s, acts[0]!);
    expect(s.pending).toBeNull();
  });

  it("Vastwood Hydra: as many as it had as it last existed, among your creatures, if you want", () => {
    const { s: s0, ap, ids } = setup([murder]);
    const h = putOnBattlefield(s0, ap, hydra);
    s0.objects[h]!.counters = { "+1/+1": 3 };
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(cast(s0, ap, ids[0]!, [target(h)]));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "distribute", total: 3 });
    expect((s.pending as { options: string[] }).options.sort()).toEqual([a, b].sort());
    s = settle(act(s, { type: "distribute", player: ap, parts: { [a]: 3 } }));
    expect(plusOnes(s, a)).toBe(3);
    expect(plusOnes(s, b)).toBe(0);
  });
});
