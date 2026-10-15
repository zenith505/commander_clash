// "~ assigns no combat damage this turn" (CR 510.1): the Laccoliths' "whenever ~ becomes blocked, you may have it deal
// damage equal to its power to target creature. If you do, ~ assigns no combat damage this turn", and "whenever ~
// attacks and isn't blocked" (it triggers after blockers are declared if no creature blocks it, rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const grunt = card("Laccolith Grunt", "Creature — Beast", "{2}{R}", {
  power: "2",
  toughness: "2",
  oracleText: "Whenever this creature becomes blocked, you may have it deal damage equal to its power to target creature. If you do, this creature assigns no combat damage this turn.",
});
const zealot = card("Farrel's Zealot", "Creature — Human", "{1}{W}{W}", {
  power: "2",
  toughness: "2",
  oracleText: "Whenever this creature attacks and isn't blocked, you may have it deal 3 damage to target creature. If you do, this creature assigns no combat damage this turn.",
});
const ophidian = card("Ophidian", "Creature — Snake", "{2}{U}", {
  power: "1",
  toughness: "3",
  oracleText: "Whenever this creature attacks and isn't blocked, you may draw a card. If you do, this creature assigns no combat damage this turn.",
});

/** Pass until someone has a choice to make (a target, a may). */
const toChoice = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

function attack(attacker: ReturnType<typeof card>, blocked: boolean) {
  const { s: s0, ap, opp } = setup([]);
  const a = putOnBattlefield(s0, ap, attacker);
  const b = putOnBattlefield(s0, opp, bear());
  const other = putOnBattlefield(s0, opp, bear({ name: "Other Bear" }));
  let s = passUntil(s0, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
  for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  s = act(s, { type: "declareBlockers", player: opp, blocks: blocked ? [{ blocker: b, attacker: a }] : [] });
  for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return { s, ap, opp, a, b, other };
}

describe("assigns no combat damage (CR 510.1)", () => {
  it("compiles", () => {
    for (const d of [grunt, zealot, ophidian]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Laccolith Grunt: blocked, it deals its power to any creature and then no combat damage", () => {
    let { s, ap, opp, a, b, other } = attack(grunt, true);
    expect(s.pending?.kind).toBe("chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: other }] });
    s = toChoice(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.objects[other]!.zone).toBe("graveyard");
    s = passUntil(s, "endCombat");
    expect(s.objects[b]!.damage).toBe(0); // it assigned no combat damage
    expect(s.objects[a]!.zone).toBe("graveyard"); // the blocker still dealt its damage
    void opp;
  });

  it("declining keeps its combat damage", () => {
    let { s, ap, a, b, other } = attack(grunt, true);
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: other }] });
    s = toChoice(s);
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    s = passUntil(s, "endCombat");
    expect(s.objects[b]!.zone).toBe("graveyard");
    void a;
  });

  it("Ophidian: unblocked, draw a card instead of dealing combat damage; blocked, nothing triggers", () => {
    let { s, ap, opp } = attack(ophidian, false);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    const hand = s.players[ap]!.hand.length;
    const life = s.players[opp]!.life;
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    s = passUntil(s, "endCombat");
    expect(s.players[opp]!.life).toBe(life);
    const blocked = attack(ophidian, true);
    expect(blocked.s.pending?.kind).not.toBe("chooseMay");
  });
});
