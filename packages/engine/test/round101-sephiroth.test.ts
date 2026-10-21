// Round 101: Sephiroth, Fabled SOLDIER // Sephiroth, One-Winged Angel. "If this is the fourth time this ability has
// resolved this turn, transform Sephiroth"; "Super Nova — As this creature transforms into Sephiroth, One-Winged Angel,
// you get an emblem with ..." (CR 712.20: done while it transforms, not if it enters transformed); "you may sacrifice any
// number of other creatures. If you do, draw that many cards." Also God-Eternal Bontu's "sacrifice any number of other
// permanents, then draw that many cards".

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, scry, setup, target } from "./helpers";
import { invalidateCharacteristics, isFullySupported, planCast, waitingOn, type GameState, type PlayerId } from "../src";

function settle(s: GameState, pid: PlayerId, opp: PlayerId) {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending?.kind === "chooseTargets"); i++) {
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: s.pending.player, targets: [{ kind: "player", id: opp }] });
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
}
const toHand = (s: GameState, pid: PlayerId, id: string) => {
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
};

// Real oracle text (Scryfall).
const sephiroth = scry("transform", [
  {
    name: "Sephiroth, Fabled SOLDIER",
    mana_cost: "{2}{B}",
    type_line: "Legendary Creature — Human Avatar Soldier",
    power: "3",
    toughness: "3",
    oracle_text:
      "Whenever Sephiroth enters or attacks, you may sacrifice another creature. If you do, draw a card.\nWhenever another creature dies, target opponent loses 1 life and you gain 1 life. If this is the fourth time this ability has resolved this turn, transform Sephiroth.",
  },
  {
    name: "Sephiroth, One-Winged Angel",
    type_line: "Legendary Creature — Angel Nightmare Avatar",
    power: "5",
    toughness: "5",
    color_indicator: ["B"],
    oracle_text:
      'Flying\nSuper Nova — As this creature transforms into Sephiroth, One-Winged Angel, you get an emblem with "Whenever a creature dies, target opponent loses 1 life and you gain 1 life."\nWhenever Sephiroth attacks, you may sacrifice any number of other creatures. If you do, draw that many cards.',
  },
]);
const bontu = card("God-Eternal Bontu", "Legendary Creature — Zombie God", "{3}{B}{B}", {
  power: "5",
  toughness: "6",
  keywords: ["Menace"],
  oracleText:
    "Menace\nWhen God-Eternal Bontu enters, sacrifice any number of other permanents, then draw that many cards.\nWhen God-Eternal Bontu dies or is put into exile from the battlefield, you may put it into its owner's library third from the top.",
});
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });

describe("round 101: Sephiroth", () => {
  it("parses", () => expect(isFullySupported(sephiroth)).toBe(true));

  it("the fourth drain in a turn transforms it, and it gets its controller an emblem as it does", () => {
    const { s: s0, ap, opp } = setup([]);
    const seph = putOnBattlefield(s0, ap, sephiroth);
    const bears = [0, 1, 2, 3, 4].map(() => putOnBattlefield(s0, opp, bear()));
    const oppLife = s0.players[opp]!.life;
    let s = s0;
    for (let i = 0; i < 5; i++) {
      const m = putOnBattlefield(s, ap, murder);
      toHand(s, ap, m);
      s.players[ap]!.manaPool.B += 3;
      for (const a of planCast(s, ap, m, [target(bears[i]!)])!) s = act(s, a);
      s = settle(s, ap, opp);
      if (i === 2) {
        expect(s.objects[seph]!.face).toBeUndefined();
        expect(s.emblems ?? []).toHaveLength(0);
      }
    }
    expect(s.objects[seph]!.face).toBe(1);
    // One emblem; the fifth death drains once, from the emblem (the back face has no such ability).
    expect((s.emblems ?? []).filter((id) => s.objects[id]!.owner === ap)).toHaveLength(1);
    expect(s.players[opp]!.life).toBe(oppLife - 5);
  });

  it("entering with its back face up gives no emblem", () => {
    const { s, ap } = setup([]);
    const seph = putOnBattlefield(s, ap, sephiroth);
    s.objects[seph]!.face = 1;
    invalidateCharacteristics(s);
    expect(s.emblems ?? []).toHaveLength(0);
  });

  it("One-Winged Angel attacks: sacrifice any number of other creatures, draw that many", () => {
    const { s: s0, ap, opp } = setup([]);
    const seph = putOnBattlefield(s0, ap, sephiroth);
    s0.objects[seph]!.face = 1;
    const mine = [0, 1, 2].map(() => putOnBattlefield(s0, ap, bear()));
    invalidateCharacteristics(s0);
    let s = s0;
    while (s.step !== "declareAttackers") s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: seph, defender: opp }] });
    const hand = s.players[ap]!.hand.length;
    for (let i = 0; i < 10 && s.pending?.kind !== "pickPermanents"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("pickPermanents");
    if (s.pending?.kind !== "pickPermanents") return;
    expect(s.pending.min).toBe(0);
    expect(s.pending.options.sort()).toEqual([...mine].sort());
    s = act(s, { type: "pickPermanents", player: ap, ids: [mine[0]!, mine[1]!] });
    expect(s.objects[mine[0]!]!.zone).toBe("graveyard");
    expect(s.objects[mine[2]!]!.zone).toBe("battlefield");
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });
});

describe("round 101: God-Eternal Bontu", () => {
  it("sacrifices the permanents picked and draws that many; none, none", () => {
    const { s: s0, ap, opp, ids } = setup([bontu, bontu]);
    const b = putOnBattlefield(s0, ap, bear());
    s0.players[ap]!.manaPool.B += 5;
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [])!) s = act(s, a);
    for (let i = 0; i < 10 && s.pending?.kind !== "pickPermanents"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("pickPermanents");
    const hand = s.players[ap]!.hand.length;
    // Lands count too ("other permanents"): pick the bear and two lands.
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land")).slice(0, 2);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [b, ...lands] }), ap, opp);
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
  });
});
