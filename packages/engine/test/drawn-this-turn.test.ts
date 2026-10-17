// "The number of cards you've drawn this turn" (Duelist of the Mind, Kydele, Inspired Fire) and "they've drawn this
// turn" (Cerebral Vortex): cards drawn (CR 121.1), counted as the ability resolves or the cost is worked out.

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, planCast, power, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const duelist = card("Duelist of the Mind", "Creature — Human Advisor", "{1}{U}", { power: "*", toughness: "3", keywords: ["Flying", "Vigilance"], oracleText: "Flying, vigilance\nDuelist of the Mind's power is equal to the number of cards you've drawn this turn.\nWhenever you commit a crime, you may draw a card. If you do, discard a card. This ability triggers only once each turn." });
const vortex = card("Cerebral Vortex", "Instant", "{1}{U}{R}", { oracleText: "Target player draws two cards, then Cerebral Vortex deals damage to that player equal to the number of cards they've drawn this turn." });
const fire = card("Inspired Fire", "Instant", "{3}{R}", { oracleText: "This spell costs {1} less to cast for each card you've drawn this turn.\nInspired Fire deals 4 damage to target creature." });
const kydele = card("Kydele, Chosen of Kruphix", "Legendary Creature — Human Wizard", "{2}{G}{U}", { power: "2", toughness: "3", keywords: ["Partner"], oracleText: "{T}: Add {C} for each card you've drawn this turn.\nPartner (You can have two commanders if both have partner.)" });
const knowledge = card("Knowledge Is Power", "Enchantment", "{3}{W}{U}", { oracleText: "Creatures you control get +X/+X, where X is the number of cards you've drawn this turn." });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });

const drawn = (s: GameState, pid: PlayerId) => (s.players[pid]!.draws?.turn === s.turn ? s.players[pid]!.draws!.n : 0);

describe("cards drawn this turn", () => {
  it("compiles them", () => {
    for (const d of [duelist, vortex, fire, kydele, knowledge]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Duelist of the Mind's power and Knowledge Is Power's bonus go up as you draw", () => {
    let { s, ap, ids } = setup([divination]);
    const d = putOnBattlefield(s, ap, duelist);
    putOnBattlefield(s, ap, knowledge);
    const before = drawn(s, ap);
    expect(power(s, s.objects[d]!)).toBe(before * 2);
    s = cast(s, ap, ids[0]!);
    expect(drawn(s, ap)).toBe(before + 2);
    expect(power(s, s.objects[d]!)).toBe((before + 2) * 2);
  });

  it("Cerebral Vortex counts the target player's draws, the two it made them draw included", () => {
    let { s, ap, opp, ids } = setup([vortex]);
    const life = s.players[opp]!.life;
    expect(drawn(s, opp)).toBe(0); // not their turn
    s = cast(s, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(s.players[opp]!.life).toBe(life - 2);
  });

  it("Inspired Fire costs {1} less for each card you've drawn this turn", () => {
    let { s, ap, opp, ids } = setup([divination, fire]);
    const b = putOnBattlefield(s, opp, bear());
    s = cast(s, ap, ids[0]!);
    const n = drawn(s, ap);
    expect(n).toBeGreaterThanOrEqual(2);
    // Tap all but one Mountain: {R} is all it should cost now.
    const plan = planCast(s, ap, ids[1]!, [target(b)])!;
    expect(plan.filter((a) => a.type === "activateMana")).toHaveLength(1);
    for (const a of plan) s = act(s, a);
    for (let i = 0; i < 10 && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.battlefield.includes(b)).toBe(false);
  });

  it("Kydele adds {C} for each card you've drawn this turn", () => {
    let { s, ap, ids } = setup([divination]);
    const k = putOnBattlefield(s, ap, kydele);
    s = cast(s, ap, ids[0]!);
    const n = drawn(s, ap);
    s = act(s, { type: "activateAbility", player: ap, objectId: k, index: 0 });
    for (let i = 0; i < 5 && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[ap]!.manaPool.C).toBe(n);
  });
});
