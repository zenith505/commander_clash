// "Activate only during your turn, before attackers are declared" and "Activate only during your turn" (CR 602.5b);
// discarding at random as a cost (CR 701.9b): "As an additional cost to cast ~, discard a card at random", "{R},
// Discard a card at random: ...", "sacrifice it unless you discard a card at random".

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, planActivate, planCast, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const veteran = card("Alaborn Veteran", "Creature — Human Knight", "{2}{W}", {
  power: "2",
  toughness: "2",
  oracleText: "{T}: Target creature gets +2/+2 until end of turn. Activate only during your turn, before attackers are declared.",
});
const scepter = card("Scepter of Fugue", "Artifact", "{B}{B}", { oracleText: "{1}{B}, {T}: Target player discards a card. Activate only during your turn." });
const sonicBurst = card("Sonic Burst", "Instant", "{1}{R}", { oracleText: "As an additional cost to cast this spell, discard a card at random.\nSonic Burst deals 4 damage to any target." });
const ogre = card("Frenetic Ogre", "Creature — Ogre", "{4}{R}", { power: "2", toughness: "3", oracleText: "{R}, Discard a card at random: This creature gets +3/+0 until end of turn." });
const horde = card("Balduvian Horde", "Creature — Human Barbarian", "{2}{R}{R}", { power: "5", toughness: "5", oracleText: "When this creature enters, sacrifice it unless you discard a card at random." });
const masticore = card("Masticore", "Artifact Creature — Masticore", "{4}", {
  power: "4",
  toughness: "4",
  oracleText: "At the beginning of your upkeep, sacrifice this creature unless you discard a card.\n{2}: This creature deals 1 damage to target creature.\n{2}: Regenerate this creature.",
});

const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Leave only these cards in `pid`'s hand: the opening hand goes back to the library. */
function onlyHand(s: GameState, pid: PlayerId, keep: string[]) {
  const p = s.players[pid]!;
  for (const id of p.hand.filter((x) => !keep.includes(x))) {
    s.objects[id]!.zone = "library";
    p.library.push(id);
  }
  p.hand = p.hand.filter((x) => keep.includes(x));
  return s;
}
function hand(cards: Parameters<typeof setup>[0]) {
  const r = setup(cards);
  onlyHand(r.s, r.ap, r.ids);
  return r;
}
const can = (s: GameState, pid: PlayerId, id: string, t: string) => !!planActivate(s, pid, id, 0, [target(t)]);
const canAtPlayer = (s: GameState, pid: PlayerId, id: string, t: PlayerId) => !!planActivate(s, pid, id, 0, [{ kind: "player", id: t }]);

describe("activation timing", () => {
  it("compile", () => {
    for (const d of [veteran, scepter, sonicBurst, ogre, horde, masticore]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("before attackers are declared: main phase and beginning of combat on your turn, not after or on others' turns", () => {
    const { s: s0, ap, opp } = setup([]);
    const vet = putOnBattlefield(s0, ap, veteran);
    expect(can(s0, ap, vet, vet)).toBe(true);
    let s = passUntil(structuredClone(s0), "beginCombat", ap);
    expect(can(s, ap, vet, vet)).toBe(true);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [] });
    expect(can(s, ap, vet, vet)).toBe(false);
    s = passUntil(s, "main2", ap);
    expect(can(s, ap, vet, vet)).toBe(false); // after the declare attackers step began (rulings)
    s = passUntil(s, "upkeep", opp);
    expect(can(s, ap, vet, vet)).toBe(false);
    // Used in time, it works.
    const used = activate(structuredClone(s0), ap, vet, 0, [target(vet)]);
    expect(pt(used, vet)).toBe("4/4");
  });

  it("only during your turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const sc = putOnBattlefield(s0, ap, scepter);
    expect(canAtPlayer(s0, ap, sc, opp)).toBe(true);
    const s = passUntil(structuredClone(s0), "upkeep", opp);
    expect(canAtPlayer(s, ap, sc, opp)).toBe(false);
  });
});

describe("discarding at random", () => {
  it("as an additional cost to cast a spell: a card other than the spell, chosen by the game", () => {
    const { s: s0, ap, ids, opp } = hand([sonicBurst, bear({ name: "Bear A" }), bear({ name: "Bear B" })]);
    const life = s0.players[opp]!.life;
    const s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(s.players[opp]!.life).toBe(life - 4);
    expect(s.players[ap]!.hand.length).toBe(1);
    const discarded = s.players[ap]!.graveyard.filter((id) => id !== ids[0]);
    expect(discarded.length).toBe(1);
    expect([ids[1], ids[2]]).toContain(discarded[0]);
    expect(s.log.some((e) => /discards Bear [AB] at random/.test(e.text))).toBe(true);
    // Choosing the card isn't allowed.
    expect(() => act(s0, { type: "castSpell", player: ap, objectId: ids[0]!, targets: [{ kind: "player", id: opp }], discard: [ids[1]!] })).toThrow();
  });

  it("with no other card in hand, it can't be cast", () => {
    const { s, ap, ids, opp } = hand([sonicBurst]);
    expect(planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])).toBeNull();
  });

  it("as part of an activated ability's cost", () => {
    const { s: s0, ap } = hand([bear(), bear()]);
    const o = putOnBattlefield(s0, ap, ogre);
    const s = activate(s0, ap, o, 0);
    expect(pt(s, o)).toBe("5/3");
    expect(s.players[ap]!.hand.length).toBe(1);
    const empty = hand([]);
    const o2 = putOnBattlefield(empty.s, empty.ap, ogre);
    expect(planActivate(empty.s, empty.ap, o2, 0)).toBeNull();
  });

  it("sacrifice it unless you discard a card at random: discard to keep it, decline or have no card and it's sacrificed", () => {
    const { s: s0, ap, ids } = hand([horde, bear(), bear()]);
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    const kept = settle(act(structuredClone(s), { type: "chooseMay", player: ap, yes: true }));
    expect(kept.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(kept.players[ap]!.hand.length).toBe(1);
    const declined = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(declined.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(declined.players[ap]!.hand.length).toBe(2);
    const alone = hand([horde]);
    s = settle(cast(alone.s, alone.ap, alone.ids[0]!));
    expect(s.pending).toBeNull();
    expect(s.objects[alone.ids[0]!]!.zone).toBe("graveyard");
  });
});
