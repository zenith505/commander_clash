// The Endeavors: "Roll two d4 and choose one result" (CR 706): the controller picks which die is "that result" as the
// spell resolves (CR 608.2d), and "the other result" is the other die. Both dice were rolled, so both trigger "whenever you
// roll"; with the same number on both there's nothing to choose.

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, putOnBattlefield, setup } from "./helpers";
import { compileCard, isFullySupported, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";
import { nextRandom } from "../src/rng";
import { moveObject } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** The next dice rolled come up `values`, in order (the game's seeded random numbers, CR 706.1b). */
function rig(s: GameState, sides: number, values: number[]) {
  for (let st = 1; st < 50_000_000; st++) {
    const t = { rngState: st };
    if (values.every((v) => 1 + Math.floor(nextRandom(t) * sides) === v)) {
      s.rngState = st;
      return;
    }
  }
  throw new Error("no such seed");
}
const tokens = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]?.name === `${name} Token`);
const choose = (s: GameState, pid: PlayerId, die: 0 | 1) => settle(act(s, { type: "chooseOption", player: pid, choice: String(die) }));

// Real oracle text (Scryfall).
const wild = card("Wild Endeavor", "Sorcery", "{4}{G}{G}", { oracleText: "Roll two d4 and choose one result. Create a number of 3/3 green Beast creature tokens equal to that result. Then search your library for a number of basic land cards equal to the other result, put them onto the battlefield tapped, then shuffle." });
const reckless = card("Reckless Endeavor", "Sorcery", "{5}{R}{R}", { keywords: ["Treasure"], oracleText: "Roll two d12 and choose one result. Reckless Endeavor deals damage equal to that result to each creature. Then create a number of Treasure tokens equal to the other result." });
const grave = card("Grave Endeavor", "Instant", "{5}{B}{B}", { oracleText: "Roll two d10 and choose one result. Return a creature card from your graveyard to the battlefield with a number of +1/+1 counters on it equal to that result. Then each opponent loses X life and you gain X life, where X is the other result." });
const pixie = card("Pixie Guide", "Creature — Faerie", "{1}{U}", { power: "1", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nGrant an Advantage — If you would roll one or more dice, instead roll that many dice plus one and ignore the lowest roll." });
const dwarf = card("Brazen Dwarf", "Creature — Dwarf Shaman", "{1}{R}", { power: "1", toughness: "3", oracleText: "Whenever you roll one or more dice, this creature deals 1 damage to each opponent." });

describe("the Endeavors", () => {
  it("parse", () => {
    supported(wild, reckless, grave);
    expect(compileCard(wild).spell!.effects[0]).toEqual({ type: "roll", sides: 4, n: 2, chooseOne: true });
  });

  it("Wild Endeavor: Beasts for the result chosen, basic lands for the other", () => {
    const { s: s0, ap, ids } = setup([wild]);
    rig(s0, 4, [1, 3]);
    let s = cast(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "rollResult", player: ap, options: ["0", "1"], labels: ["1", "3"] });
    s = choose(s, ap, 1);
    expect(tokens(s, ap, "Beast")).toHaveLength(3);
    expect(s.log.some((l) => l.text.includes("chooses 3 (the other result is 1)"))).toBe(true);
    // One basic land card, found as it resolves.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", max: 1 });
    const land = (s.pending as { cards: string[] }).cards[0]!;
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [land] }));
    expect(s.objects[land]).toMatchObject({ zone: "battlefield", tapped: true });
  });

  it("Reckless Endeavor: damage for one die, Treasures for the other", () => {
    const { s: s0, ap, ids, opp } = setup([reckless]);
    const theirs = putOnBattlefield(s0, opp, bear({ toughness: "3" }));
    const big = putOnBattlefield(s0, opp, bear({ name: "Big Test", toughness: "6" }));
    rig(s0, 12, [9, 2]);
    const s = choose(cast(s0, ap, ids[0]!), ap, 1);
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(s.objects[theirs]!.damage).toBe(2);
    expect(s.objects[big]!.damage).toBe(2);
    expect(tokens(s, ap, "Treasure")).toHaveLength(9);
  });

  it("Grave Endeavor: the creature returns with that many +1/+1 counters; the other drains each opponent", () => {
    const { s: s0, ap, ids, opp } = setup([grave]);
    const dead = putOnBattlefield(s0, ap, bear());
    moveObject(s0, dead, "graveyard");
    rig(s0, 10, [4, 7]);
    const life = s0.players[ap]!.life;
    const theirs = s0.players[opp]!.life;
    let s = choose(cast(s0, ap, ids[0]!), ap, 0);
    if (s.pending?.kind === "searchLibrary") s = settle(act(s, { type: "searchLibrary", player: ap, found: [dead] }));
    expect(s.objects[dead]).toMatchObject({ zone: "battlefield", counters: { "+1/+1": 4 } });
    expect(s.players[opp]!.life).toBe(theirs - 7);
    expect(s.players[ap]!.life).toBe(life + 7);
  });

  it("the same number on both dice: nothing to choose", () => {
    const { s: s0, ap, ids } = setup([reckless]);
    rig(s0, 12, [4, 4]);
    const s = cast(s0, ap, ids[0]!);
    expect(s.pending).toBeNull();
    expect(tokens(s, ap, "Treasure")).toHaveLength(4);
  });

  it("with advantage: three dice, the lowest ignored, then one of the two left chosen; each die rolled triggers", () => {
    const { s: s0, ap, ids, opp } = setup([wild]);
    putOnBattlefield(s0, ap, pixie);
    putOnBattlefield(s0, ap, dwarf);
    const theirs = s0.players[opp]!.life;
    rig(s0, 4, [2, 1, 4]);
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "rollResult", labels: ["2", "4"] });
    s = choose(s, ap, 0);
    expect(tokens(s, ap, "Beast")).toHaveLength(2);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", max: 4 });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    expect(s.players[opp]!.life).toBe(theirs - 1); // one roll of dice, once (Brazen Dwarf: "one or more dice")
  });
});
