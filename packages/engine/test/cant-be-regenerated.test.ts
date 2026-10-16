// "Can't be regenerated" (CR 701.19c): regeneration shields don't replace the destruction. "It can't be regenerated
// this turn" after damage (Engulfing Flames), "a creature dealt damage this way" (Incinerate), "if it's a creature" with
// any target (Carbonize), "that creature can't be regenerated" after destroy (Nekrataal), "they" for two targets (Plague
// Spores) or all destroyed (Winds of Rath, Reiver Demon). And "if you cast it from your hand" (Reiver Demon, Phage):
// an intervening if (CR 603.4) that casting from the command zone or putting it onto the battlefield doesn't meet.

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, activate, passAll, passUntil, putOnBattlefield, setup, swamp, target } from "./helpers";
import { isFullySupported, moveObject, waitingOn, planCast, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const engulfingFlames = card("Engulfing Flames", "Instant", "{R}", { keywords: ["Flashback"], oracleText: "Engulfing Flames deals 1 damage to target creature. It can't be regenerated this turn.\nFlashback {3}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)" });
const incinerate = card("Incinerate", "Instant", "{1}{R}", { oracleText: "Incinerate deals 3 damage to any target. A creature dealt damage this way can't be regenerated this turn." });
const carbonize = card("Carbonize", "Instant", "{2}{R}", { oracleText: "Carbonize deals 3 damage to any target. If it's a creature, it can't be regenerated this turn, and if it would die this turn, exile it instead." });
const nekrataal = card("Nekrataal", "Creature — Human Assassin", "{2}{B}{B}", { power: "2", toughness: "1", keywords: ["First strike"], oracleText: "First strike\nWhen this creature enters, destroy target nonartifact, nonblack creature. That creature can't be regenerated." });
const reiverDemon = card("Reiver Demon", "Creature — Demon", "{4}{B}{B}{B}{B}", { power: "6", toughness: "6", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, if you cast it from your hand, destroy all nonartifact, nonblack creatures. They can't be regenerated." });
const phage = card("Phage the Untouchable", "Legendary Creature — Avatar Minion", "{3}{B}{B}{B}{B}", { power: "4", toughness: "4", oracleText: "When Phage enters, if you didn't cast it from your hand, you lose the game.\nWhenever Phage deals combat damage to a creature, destroy that creature. It can't be regenerated.\nWhenever Phage deals combat damage to a player, that player loses the game." });
const plagueSpores = card("Plague Spores", "Sorcery", "{4}{B}{R}", { oracleText: "Destroy target nonblack creature and target land. They can't be regenerated." });
const hurrJackal = card("Hurr Jackal", "Creature — Jackal", "{R}", { power: "1", toughness: "1", oracleText: "{T}: Target creature can't be regenerated this turn." });
const cohort = card("Lim-Dûl's Cohort", "Creature — Zombie", "{1}{B}{B}", { power: "2", toughness: "3", oracleText: "Whenever this creature blocks or becomes blocked by a creature, that creature can't be regenerated this turn." });
const bondOfRevival = card("Bond of Revival", "Sorcery", "{4}{B}", { oracleText: "Return target creature card from your graveyard to the battlefield. It gains haste until your next turn." });
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
/** A creature with a regeneration shield (CR 701.19a). */
function shielded(s: GameState, pid: PlayerId, def = bear()) {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.regenShields = 1;
  return id;
}
function settle(s: GameState, targets: string[][] = []): GameState {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: (targets.shift() ?? []).map(target) });
    else if (p) throw new Error(`unexpected ${p.kind}`);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
}
const blackMana = (s: GameState, pid: PlayerId, n: number) => {
  for (let i = 0; i < n; i++) putOnBattlefield(s, pid, swamp);
};

describe("can't be regenerated", () => {
  it("parses these", () => {
    supported(engulfingFlames, incinerate, carbonize, nekrataal, reiverDemon, phage, plagueSpores, hurrJackal, cohort, bondOfRevival);
  });

  it("a regeneration shield still saves a creature from plain destruction", () => {
    const { s: s0, ap, opp, ids } = setup([murder]);
    const b = shielded(s0, opp);
    const s = cast(s0, ap, ids[0]!, [target(b)]);
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[b]!.tapped).toBe(true);
  });

  it("Engulfing Flames: the damaged creature can't be regenerated", () => {
    const { s: s0, ap, opp, ids } = setup([engulfingFlames]);
    const b = shielded(s0, opp, bear({ power: "1", toughness: "1" }));
    const s = cast(s0, ap, ids[0]!, [target(b)]);
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("Incinerate: a creature dealt damage can't be regenerated; a player just takes 3", () => {
    const { s: s0, ap, opp, ids } = setup([incinerate, incinerate]);
    const b = shielded(s0, opp);
    let s = cast(s0, ap, ids[0]!, [target(b)]);
    expect(s.objects[b]!.zone).toBe("graveyard");
    const life = s.players[opp]!.life;
    s = cast(s, ap, ids[1]!, [{ kind: "player", id: opp }]);
    expect(s.players[opp]!.life).toBe(life - 3);
  });

  it("Carbonize: a creature can't be regenerated and is exiled if it would die this turn; a player takes 3", () => {
    const { s: s0, ap, opp, ids } = setup([carbonize, carbonize, murder]);
    const b = shielded(s0, opp);
    let s = cast(s0, ap, ids[0]!, [target(b)]);
    expect(s.objects[b]!.zone).toBe("exile");
    // It survives the damage, then dies later this turn: exiled, still no regeneration.
    const big = shielded(s, opp, bear({ name: "Big Bear", power: "4", toughness: "4" }));
    s = cast(s, ap, ids[1]!, [target(big)]);
    expect(s.objects[big]!.zone).toBe("battlefield");
    for (const id of s.battlefield) s.objects[id]!.tapped = false;
    s = cast(s, ap, ids[2]!, [target(big)]);
    expect(s.objects[big]!.zone).toBe("exile");
    const life = s.players[opp]!.life;
    s.objects[ids[0]!]!.zone = "hand";
    s.players[ap]!.graveyard = s.players[ap]!.graveyard.filter((x) => x !== ids[0]);
    s.players[ap]!.hand.push(ids[0]!);
    s = cast(s, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(s.players[opp]!.life).toBe(life - 3);
  });

  it("Nekrataal: the destroyed creature can't be regenerated", () => {
    const { s: s0, ap, opp, ids } = setup([nekrataal]);
    blackMana(s0, ap, 2);
    const b = shielded(s0, opp);
    const s = settle(cast(s0, ap, ids[0]!), [[b]]);
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("Plague Spores: both targets destroyed, neither regenerated", () => {
    const { s: s0, ap, opp, ids } = setup([plagueSpores]);
    const b = shielded(s0, opp);
    const land = putOnBattlefield(s0, opp, swamp);
    const s = cast(s0, ap, ids[0]!, [target(b), target(land)]);
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[land]!.zone).toBe("graveyard");
  });

  it("Hurr Jackal: the target can't be regenerated this turn", () => {
    const { s: s0, ap, opp, ids } = setup([murder]);
    const jackal = putOnBattlefield(s0, ap, hurrJackal);
    const b = shielded(s0, opp);
    let s = activate(s0, ap, jackal, 0, [target(b)]);
    s = settle(s);
    s = cast(s, ap, ids[0]!, [target(b)]);
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("Lim-Dûl's Cohort: the creature blocking it can't be regenerated", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, cohort);
    const b = shielded(s0, opp);
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: c, defender: opp }] });
    while (s.pending?.kind !== "declareBlockers" || s.pending.player !== opp)
      s = act(s, s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: s.pending.player, blocks: [] } : { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b, attacker: c }] });
    s = passUntil(s, "endCombat");
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[c]!.zone).toBe("battlefield");
  });

  it("Reiver Demon: cast from the hand, destroys all nonartifact, nonblack creatures, with no regeneration", () => {
    const { s: s0, ap, opp, ids } = setup([reiverDemon]);
    blackMana(s0, ap, 2);
    const b = shielded(s0, opp);
    const black = putOnBattlefield(s0, opp, card("Black Knight Test", "Creature — Human Knight", "{B}{B}", { power: "2", toughness: "2" }));
    const s = settle(cast(s0, ap, ids[0]!));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[black]!.zone).toBe("battlefield");
  });

  it("Reiver Demon returned from the graveyard doesn't trigger", () => {
    const { s: s0, ap, opp, ids } = setup([bondOfRevival]);
    const demon = putOnBattlefield(s0, ap, reiverDemon);
    moveObject(s0, demon, "graveyard");
    const b = putOnBattlefield(s0, opp, bear());
    const s = settle(cast(s0, ap, ids[0]!, [target(demon)]));
    expect(s.objects[demon]!.zone).toBe("battlefield");
    expect(s.objects[b]!.zone).toBe("battlefield");
  });

  it("Phage: cast from the hand is fine; returned from the graveyard or cast from the command zone, you lose", () => {
    const { s: s0, ap, ids } = setup([phage, bondOfRevival]);
    blackMana(s0, ap, 2);
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.players[ap]!.lost).toBe(false);
    moveObject(s, ids[0]!, "graveyard");
    for (const id of s.battlefield) s.objects[id]!.tapped = false;
    s = settle(cast(s, ap, ids[1]!, [target(ids[0]!)]));
    expect(s.players[ap]!.lost).toBe(true);

    // Phage as a commander, cast from the command zone (rulings).
    const { s: c0, ap: cp } = setup([]);
    blackMana(c0, cp, 2);
    const cmd = putOnBattlefield(c0, cp, phage, { commander: true });
    c0.battlefield.splice(c0.battlefield.indexOf(cmd), 1);
    c0.objects[cmd]!.zone = "command";
    c0.players[cp]!.command.push(cmd);
    let c = c0;
    for (const a of planCast(c, cp, cmd)!) c = act(c, a);
    c = settle(passAll(c));
    expect(c.players[cp]!.lost).toBe(true);
  });
});
