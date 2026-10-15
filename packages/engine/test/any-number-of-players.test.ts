// "Any number of target players" and "any number of target opponents": as many as are chosen as it's cast, activated or
// put on the stack (CR 601.2c), none at all too (115.6); "those players" are all of them; strive's cost is paid for
// each beyond the first.

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup, bear } from "./helpers";
import { chooseTargets, compileCard, isFullySupported, moveObject, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("can't do that");
  for (const a of plan) s = act(s, a);
  return s;
};
function settle(s: GameState) {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
const pl = (id: PlayerId): TargetChoice => ({ kind: "player", id });

// Real oracle text (Scryfall).
const crystal = card("Stonespeaker Crystal", "Artifact", "{2}", { oracleText: "{T}: Add {C}{C}.\n{2}, {T}, Sacrifice this artifact: Exile any number of target players' graveyards. Draw a card." });
const coppercoats = card("Call the Coppercoats", "Instant", "{2}{W}", { keywords: ["Strive"], oracleText: "Strive — This spell costs {1}{W} more to cast for each target beyond the first.\nChoose any number of target opponents. Create X 1/1 white Human Soldier creature tokens, where X is the number of creatures those opponents control." });
const interrogation = card("Officious Interrogation", "Sorcery", "{W}{U}", { oracleText: "This spell costs {W}{U} more to cast for each target beyond the first.\nChoose any number of target players. Investigate X times, where X is the total number of creatures those players control." });
const tinybones = card("Tinybones Joins Up", "Legendary Enchantment", "{B}", { oracleText: "When Tinybones Joins Up enters, any number of target players each discard a card.\nWhenever a legendary creature you control enters, any number of target players each mill a card and lose 1 life." });
const court = card("Court of Cunning", "Enchantment", "{1}{U}{U}", { oracleText: "When this enchantment enters, you become the monarch.\nAt the beginning of your upkeep, any number of target players each mill two cards. If you're the monarch, each of those players mills ten cards instead." });

describe("any number of target players", () => {
  it("parses", () => {
    supported(crystal, coppercoats, interrogation, tinybones, court);
    expect(compileCard(coppercoats).spell!.targets).toMatchObject([{ kind: "player", opponent: true, many: "any" }]);
  });

  it("Stonespeaker Crystal: the graveyards of the players chosen", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, crystal);
    const others = s0.turnOrder.filter((p) => p !== ap && p !== opp);
    const yard = (p: PlayerId) => {
      const id = putOnBattlefield(s0, p, bear());
      moveObject(s0, id, "graveyard");
      return id;
    };
    const [a, b, c2] = [yard(opp), yard(others[0]!), yard(others[1]!)];
    const s = settle(run(s0, planActivate(s0, ap, c, 0, [pl(opp), pl(others[0]!)])));
    expect([s.objects[a]!.zone, s.objects[b]!.zone, s.objects[c2]!.zone]).toEqual(["exile", "exile", "graveyard"]);
  });

  it("the same player can't be chosen twice; none is fine", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, crystal);
    expect(planActivate(s0, ap, c, 0, [pl(opp), pl(opp)])).toBeNull();
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planActivate(s0, ap, c, 0, [])));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("Call the Coppercoats: opponents only, X from all of them, {1}{W} more for each beyond the first", () => {
    const { s: s0, ap, ids, opp } = setup([coppercoats]);
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    putOnBattlefield(s0, opp, bear());
    putOnBattlefield(s0, opp, bear());
    putOnBattlefield(s0, third, bear());
    expect(planCast(s0, ap, ids[0]!, [pl(ap)])).toBeNull();
    const plan = planCast(s0, ap, ids[0]!, [pl(opp), pl(third)])!;
    expect(plan.filter((a) => a.type === "activateMana")).toHaveLength(5); // {2}{W} + {1}{W}
    const s = settle(run(s0, plan));
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap)).toHaveLength(3);
  });

  it("Tinybones Joins Up: each chosen player mills a card and loses 1 life", () => {
    const { s: s0, ap, ids, opp } = setup([tinybones]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    // Its enters trigger: nobody.
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [] }));
    putOnBattlefield(s, ap, card("Legend", "Legendary Creature — Human", "{1}", { power: "1", toughness: "1" }));
    const legend = s.battlefield[0]!;
    moveObject(s, legend, "hand");
    moveObject(s, legend, "battlefield");
    s = settle(s);
    const life = s.players[opp]!.life;
    const library = s.players[opp]!.library.length;
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [pl(opp), { kind: "none" }, pl(ap)] }));
    expect(s.players[opp]!.life).toBe(life - 1);
    expect(s.players[opp]!.library.length).toBe(library - 1);
    expect(s.players[ap]!.life).toBe(life - 1);
  });

  it("a bot aims mill and counts at opponents", () => {
    const { s, ap } = setup([]);
    const mill = chooseTargets(s, ap, compileCard(court).triggers[1]!.body, true)!;
    const chosen = mill.filter((t) => t.kind === "player").map((t) => (t as { id: PlayerId }).id);
    expect(chosen.length).toBeGreaterThan(0);
    expect(chosen).not.toContain(ap);
    const counted = chooseTargets(s, ap, compileCard(interrogation).spell!, true)!;
    expect(counted.filter((t) => t.kind === "player" && t.id === ap)).toHaveLength(0);
  });
});
