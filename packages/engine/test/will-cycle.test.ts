// The rest of the Will cycle (Commander Legends / Tarkir: Dragonstorm), and what their modes needed: "Add {R} for each
// card in target opponent's hand" (a spell's mana, CR 605.5a), counts of what a target player controls, "the greatest
// mana value among permanents you control" (CR 202.3), "mills twice X cards", "Return all land cards from your
// graveyard to the battlefield tapped" (CR 110.2a), and "Each player may discard their hand and draw five cards"
// (each decides in APNAP order, CR 101.4).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup, target } from "./helpers";
import { compileCard, isFullySupported, planCast, power, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

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
const name = (s: GameState, id: ObjectId) => s.cards[s.objects[id]!.cardId]!.name;
const toYard = (s: GameState, pid: PlayerId, d: CardDef) => {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};
const player = (pid: PlayerId) => ({ kind: "player" as const, id: pid });

// Real oracle text (Scryfall).
const WILL = "Choose one. If you control a commander as you cast this spell, you may choose both instead.\n";
const jeska = card("Jeska's Will", "Sorcery", "{2}{R}", { oracleText: `${WILL}• Add {R} for each card in target opponent's hand.\n• Exile the top three cards of your library. You may play them this turn.` });
const mardu = card("Will of the Mardu", "Instant", "{2}{W}", { oracleText: `${WILL}• Create a number of 1/1 red Warrior creature tokens equal to the number of creatures target player controls.\n• Will of the Mardu deals damage to target creature equal to the number of creatures you control.` });
const sultai = card("Will of the Sultai", "Sorcery", "{4}{G}", { oracleText: `${WILL}• Target player mills three cards. Return all land cards from your graveyard to the battlefield tapped.\n• Put X +1/+1 counters on target creature, where X is the number of lands you control. It gains trample until end of turn.` });
const temur = card("Will of the Temur", "Sorcery", "{5}{U}", { oracleText: `${WILL}• Create a token that's a copy of target permanent, except it's a 4/4 Dragon creature with flying in addition to its other types.\n• Target player draws cards equal to the greatest mana value among permanents you control.` });
const drown = card("Drown in Dreams", "Instant", "{X}{2}{U}", { oracleText: `${WILL}• Target player draws X cards.\n• Target player mills twice X cards.` });
const jeskai = card("Will of the Jeskai", "Sorcery", "{3}{R}", { oracleText: `${WILL}• Each player may discard their hand and draw five cards.\n• Each instant and sorcery card in your graveyard gains flashback until end of turn. The flashback cost is equal to its mana cost.` });
const planarBirth = card("Planar Birth", "Sorcery", "{1}{W}", { oracleText: "Return all basic land cards from all graveyards to the battlefield tapped under their owners' control." });
const gibbon = card("Towering Gibbon", "Creature — Ape", "{3}{G}", { power: "*", toughness: "4", oracleText: "Reach\nTowering Gibbon's power is equal to the greatest mana value among creatures you control." });
const crypt = card("Crypt of Agadeem", "Land", "", { oracleText: "This land enters tapped.\n{T}: Add {B}.\n{2}, {T}: Add {B} for each black creature card in your graveyard." });
const forestCard = card("Forest", "Basic Land — Forest");
const wastes = card("Wastes", "Basic Land");
const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const titan = card("Big Titan", "Creature — Giant", "{5}{G}{G}", { power: "6", toughness: "6" });
const xThing = card("X Golem", "Artifact Creature — Golem", "{X}{X}{1}", { power: "1", toughness: "1" });

describe("the Will cycle", () => {
  it("parses", () => {
    supported(jeska, mardu, sultai, temur, drown, jeskai, planarBirth, gibbon);
  });

  it("Jeska's Will: adds {R} for each card in the target opponent's hand", () => {
    const { s: s0, ap, opp, ids } = setup([jeska]);
    const n = s0.players[opp]!.hand.length;
    expect(n).toBeGreaterThan(2);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [player(opp)], [0])));
    expect(s.players[ap]!.manaPool.R).toBe(n);
  });

  it("Will of the Mardu: a 1/1 Warrior for each creature the target player controls", () => {
    const { s: s0, ap, opp, ids } = setup([mardu]);
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, giant);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [player(opp)], [0])));
    const warriors = s.battlefield.filter((id) => s.objects[id]!.controller === ap && name(s, id).includes("Warrior"));
    expect(warriors).toHaveLength(3);
  });

  it("Will of the Temur: draws cards equal to the greatest mana value among your permanents (X counts as 0)", () => {
    const { s: s0, ap, ids } = setup([temur]);
    putOnBattlefield(s0, ap, giant); // 4
    putOnBattlefield(s0, ap, xThing); // {X}{X}{1}: 1 on the battlefield (CR 107.3)
    const before = s0.players[ap]!.hand.length - 1;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [player(ap)], [1])));
    expect(s.players[ap]!.hand.length).toBe(before + 4);
    // Only your own permanents count.
    const { s: s1, ap: ap1, opp: opp1, ids: ids1 } = setup([temur]);
    putOnBattlefield(s1, opp1, titan);
    const before1 = s1.players[ap1]!.hand.length - 1;
    s = settle(run(s1, planCast(s1, ap1, ids1[0]!, [player(ap1)], [1])));
    expect(s.players[ap1]!.hand.length).toBe(before1); // only lands: mana value 0
  });

  it("Will of the Sultai: target player mills three, then all land cards in your graveyard return tapped", () => {
    const { s: s0, ap, opp, ids } = setup([sultai]);
    const land = toYard(s0, ap, forestCard);
    const creature = toYard(s0, ap, giant);
    const theirs = toYard(s0, opp, forestCard);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [player(opp)], [0])));
    expect(s.players[opp]!.graveyard.length).toBeGreaterThanOrEqual(4); // milled three
    expect(s.objects[land]!.zone).toBe("battlefield");
    expect(s.objects[land]!.tapped).toBe(true);
    expect(s.objects[land]!.controller).toBe(ap);
    expect(s.objects[creature]!.zone).toBe("graveyard");
    expect(s.objects[theirs]!.zone).toBe("graveyard"); // only your graveyard
  });

  it("Drown in Dreams: mills twice X cards", () => {
    const { s: s0, ap, opp, ids } = setup([drown]);
    const lib = s0.players[opp]!.library.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [player(opp)], [1], undefined, 3)));
    expect(s.players[opp]!.library.length).toBe(lib - 6);
  });

  it("Will of the Jeskai: each player decides in turn order; those who chose to discard their hands and draw five", () => {
    const { s: s0, ap, ids } = setup([jeskai]);
    let s = run(s0, planCast(s0, ap, ids[0]!, [], [0]));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const order = [0, 1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(ap) + i) % 4]!);
    const hands = order.map((pid) => [...s.players[pid]!.hand]);
    const yes = [true, false, true, false];
    for (const [i, pid] of order.entries()) {
      expect(s.pending).toMatchObject({ kind: "chooseMay", player: pid, prompt: "discard your hand and draw five cards" });
      s = act(s, { type: "chooseMay", player: pid, yes: yes[i]! });
    }
    s = settle(s);
    for (const [i, pid] of order.entries()) {
      const p = s.players[pid]!;
      if (yes[i]) {
        expect(p.hand).toHaveLength(5);
        expect(hands[i]!.every((id) => s.objects[id]!.zone === "graveyard")).toBe(true);
      } else expect(p.hand).toEqual(hands[i]);
    }
  });
});

describe("returning all land cards, mana for each, greatest mana value", () => {
  it("Planar Birth: basic land cards from all graveyards, each under its owner's control, tapped", () => {
    const { s: s0, ap, opp, ids } = setup([planarBirth]);
    const mine = toYard(s0, ap, forestCard);
    const theirs = toYard(s0, opp, wastes);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[mine]!.zone).toBe("battlefield");
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(s.objects[theirs]!.controller).toBe(opp);
    expect(s.objects[theirs]!.tapped).toBe(true);
  });

  it("Towering Gibbon: its power is the greatest mana value among creatures you control", () => {
    const { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, gibbon);
    expect(power(s, s.objects[g]!)).toBe(4);
    putOnBattlefield(s, ap, titan);
    expect(power(s, s.objects[g]!)).toBe(7);
  });

  it("an activated ability with no target that adds mana is a mana ability (CR 605.1a), not one that uses the stack", () => {
    expect(compileCard(crypt).activated.every((a) => a.mana)).toBe(true);
  });
});
