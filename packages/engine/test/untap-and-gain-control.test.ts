// "Untap target creature and gain control of it until end of turn" (Threaten): untapped, then yours until the turn
// ends (CR 613.1b, layer 2). Flash Conscription also grants, if {W} was spent to cast it, "Whenever this creature deals
// combat damage, you gain that much life" to "the creature", its one target.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { abilitiesOf, controllerOf, isFullySupported, objHasKeyword, waitingOn, type GameState, type ManaType, type PlayerId } from "../src";
import { addMana } from "../src/spend";

// Real oracle text (Scryfall).
const threaten = card("Threaten", "Sorcery", "{2}{R}", { oracleText: "Untap target creature and gain control of it until end of turn. That creature gains haste until end of turn. (It can attack and {T} this turn.)" });
const conscription = card("Flash Conscription", "Instant", "{5}{R}", { oracleText: "Untap target creature and gain control of it until end of turn. That creature gains haste until end of turn. If {W} was spent to cast this spell, the creature gains \"Whenever this creature deals combat damage, you gain that much life\" until end of turn." });
const spinal = card("Spinal Embrace", "Instant", "{3}{U}{U}{B}", { oracleText: "Cast this spell only during combat.\nUntap target creature you don't control and gain control of it. It gains haste until end of turn. At the beginning of the next end step, sacrifice it. If you do, you gain life equal to its toughness." });
const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });

function castWith(s: GameState, pid: PlayerId, id: string, mana: ManaType[], t: string): GameState {
  addMana(s, pid, mana, {});
  s = act(s, { type: "castSpell", player: pid, objectId: id, targets: [target(t)] });
  for (let i = 0; i < 8 && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}

describe("untap target creature and gain control of it", () => {
  it("parses", () => [threaten, conscription].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));
  it("Spinal Embrace stays out: its sacrifice isn't modeled", () => expect(isFullySupported(spinal)).toBe(false));

  it("Threaten: untapped, yours with haste until end of turn", () => {
    const { s: s0, ap, ids, opp } = setup([threaten]);
    const g = putOnBattlefield(s0, opp, giant);
    s0.objects[g]!.tapped = true;
    let s = castWith(s0, ap, ids[0]!, ["R", "C", "C"], g);
    expect(s.objects[g]!.tapped).toBe(false);
    expect(controllerOf(s, s.objects[g]!)).toBe(ap);
    expect(objHasKeyword(s, s.objects[g]!, "Haste")).toBe(true);
    s = passUntil(s, "upkeep", opp);
    expect(controllerOf(s, s.objects[g]!)).toBe(opp);
  });

  it("Flash Conscription with {W} spent: the creature gains life for you as it deals combat damage", () => {
    const { s: s0, ap, ids, opp } = setup([conscription]);
    const g = putOnBattlefield(s0, opp, giant);
    let s = castWith(s0, ap, ids[0]!, ["R", "W", "C", "C", "C", "C"], g);
    expect(abilitiesOf(s, s.objects[g]!).triggers.some((t) => t.event === "selfDealsCombatDamage")).toBe(true);
    const life = s.players[ap]!.life;
    s = passUntil(s, "declareAttackers", ap);
    const third = s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!;
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: g, defender: third }] });
    for (let i = 0; i < 60 && s.step !== "endCombat"; i++) s = act(s, s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: s.pending.player, blocks: [] } : { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[ap]!.life).toBe(life + 3);
  });

  it("Flash Conscription without {W}: no lifegain ability", () => {
    const { s: s0, ap, ids, opp } = setup([conscription]);
    const g = putOnBattlefield(s0, opp, giant);
    const s = castWith(s0, ap, ids[0]!, ["R", "C", "C", "C", "C", "C"], g);
    expect(controllerOf(s, s.objects[g]!)).toBe(ap);
    expect(abilitiesOf(s, s.objects[g]!).triggers).toHaveLength(0);
  });
});
