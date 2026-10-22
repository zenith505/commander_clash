// Round 111, more cards: Single Combat ("until the end of your next turn"), Generous Plunderer ("you may create a
// Treasure token. When you do, ..."; "the number of artifacts they control" for the defending player).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planCast, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const singleCombat = card("Single Combat", "Sorcery", "{3}{W}{W}", {
  oracleText:
    "Each player chooses a creature or planeswalker they control, then sacrifices the rest. Players can't cast creature or planeswalker spells until the end of your next turn.",
});
const plunderer = card("Generous Plunderer", "Creature — Human Rogue", "{1}{R}", {
  power: "2",
  toughness: "2",
  keywords: ["Menace"],
  oracleText:
    "Menace\nAt the beginning of your upkeep, you may create a Treasure token. When you do, target opponent creates a tapped Treasure token.\nWhenever this creature attacks, it deals damage to defending player equal to the number of artifacts they control.",
});
const treasure = card("Treasure", "Token Artifact — Treasure", "", { oracleText: "{T}, Sacrifice this token: Add one mana of any color." });

/** Pass along, answering every pending choice the dull way, until `stop` holds. */
function until(s: GameState, stop: (s: GameState) => boolean, max = 3000) {
  for (let i = 0; i < max && !stop(s); i++) {
    const pid = waitingOn(s)!;
    const p = s.pending;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, p.count) });
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: pid, yes: false });
    else s = act(s, { type: "passPriority", player: pid });
  }
  if (!stop(s)) throw new Error("never stopped");
  return s;
}

describe("Single Combat", () => {
  it("is supported, and no one casts creature spells until the end of the caster's next turn", () => {
    expect(isFullySupported(singleCombat)).toBe(true);
    let { s, ap, ids, opp } = setup([singleCombat, bear()]);
    const theirBear = putOnBattlefield(s, opp, bear());
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    s = passAll(s);
    expect(s.objects[theirBear]!.zone).toBe("battlefield");
    expect(planCast(s, ap, ids[1]!)).toBeNull();
    const start = s.turn;
    // An opponent's turn: still can't, and a creature put in their hand can't be cast either.
    s = until(s, (x) => x.activePlayer === opp && x.step === "main1");
    expect(s.cantCastThisTurn?.length).toBe(4);
    // The caster's next turn: still can't.
    s = until(s, (x) => x.activePlayer === ap && x.step === "main1" && x.turn > start);
    expect(planCast(s, ap, ids[1]!)).toBeNull();
    // After it: they can again.
    s = until(s, (x) => x.activePlayer === opp && x.step === "main1" && x.turn > start + 4);
    expect(s.cantCastThisTurn).toBeUndefined();
  });
});

describe("Generous Plunderer", () => {
  it("is supported; a Treasure for you means a tapped one for the opponent, and the attack counts their artifacts", () => {
    expect(isFullySupported(plunderer)).toBe(true);
    let { s, ap, opp } = setup([]);
    const p = putOnBattlefield(s, ap, plunderer);
    putOnBattlefield(s, opp, treasure);
    const start = s.turn;
    s = until(s, (x) => x.activePlayer === ap && x.turn > start && x.pending?.kind === "chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    // The reflexive trigger targets an opponent.
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const pend = s.pending as { kind: string };
    expect(pend.kind).toBe("chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] } as never);
    s = until(s, (x) => x.step === "main1" && x.activePlayer === ap);
    const treasures = (pid: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name.startsWith("Treasure"));
    expect(treasures(ap).length).toBe(1);
    expect(treasures(opp).length).toBe(2);
    expect(treasures(opp).filter((id) => s.objects[id]!.tapped).length).toBe(1);
    s = passUntil(s, "declareAttackers", ap);
    const life = s.players[opp]!.life;
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: p, defender: opp }] });
    for (let i = 0; i < 20 && s.players[opp]!.life === life; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[opp]!.life).toBe(life - 2);
  });
});
