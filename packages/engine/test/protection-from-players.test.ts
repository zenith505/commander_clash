// Protection from a player (CR 702.16k): protection from each object that player controls. Spells and abilities they
// control can't target it, their Auras can't enchant it, their creatures can't block it, and damage from their sources
// is prevented. "Protection from each of your opponents" is that for each opponent (CR 702.16i). A player can have it
// too (Absolute Virtue).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passAll, pt, putOnBattlefield, setup, target } from "./helpers";
import { compileCard, isFullySupported, planCast, type CardDef, type GameState } from "../src";
import { addMana } from "../src/spend";
import { cardSource, dealDamage, objectSource } from "../src/damage";
import { blockProblem } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const nemesis = card("True-Name Nemesis", "Creature — Merfolk Rogue", "{1}{U}{U}", { power: "3", toughness: "1", keywords: ["Protection"], oracleText: "As this creature enters, choose a player.\nThis creature has protection from the chosen player." });
const fable = card("Figure of Fable", "Creature — Kithkin", "{G/W}", { power: "1", toughness: "1", oracleText: "{G/W}: This creature becomes a Kithkin Scout with base power and toughness 2/3.\n{1}{G/W}{G/W}: If this creature is a Scout, it becomes a Kithkin Soldier with base power and toughness 4/5.\n{3}{G/W}{G/W}{G/W}: If this creature is a Soldier, it becomes a Kithkin Avatar with base power and toughness 7/8 and protection from each of your opponents." });
const rescuer = card("Cliffside Rescuer", "Creature — Kor Soldier", "{1}{W}", { power: "2", toughness: "2", keywords: ["Vigilance"], oracleText: "Vigilance\n{T}, Sacrifice this creature: Target permanent you control gains protection from each of your opponents until end of turn. (It can't be blocked, targeted, dealt damage, enchanted, or equipped by anything controlled by those players.)" });
const virtue = card("Absolute Virtue", "Legendary Creature — Avatar Warrior", "{6}{W}{U}", { power: "8", toughness: "8", keywords: ["Flying"], oracleText: "This spell can't be countered.\nFlying\nYou have protection from each of your opponents. (You can't be dealt damage, enchanted, or targeted by anything controlled by your opponents.)" });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

/** `pid` holds a Shock: can they cast it at this target? */
function canShock(s: GameState, pid: number, t: Parameters<typeof planCast>[3]): boolean {
  s.cards[shock.oracleId] = shock;
  const id = `shock${s.nextId++}`;
  s.objects[id] = { id, cardId: shock.oracleId, owner: pid, controller: pid, zone: "hand", timestamp: s.nextTimestamp++, tapped: false, controlledSinceTurn: -1, damage: 0, deathtouchDamage: false, counters: {}, isCommander: false, isToken: false };
  s.players[pid]!.hand.push(id);
  addMana(s, pid, ["R"], {});
  const priority = s.priority;
  s.priority = pid; // an instant, cast whenever they have priority
  const ok = !!planCast(s, pid, id, t);
  s.priority = priority;
  s.players[pid]!.hand.pop();
  delete s.objects[id];
  s.players[pid]!.manaPool.R = 0;
  s.players[pid]!.manaLots = [];
  return ok;
}

describe("protection from players", () => {
  it("parse", () => {
    supported(nemesis, fable, rescuer, virtue);
    expect(compileCard(nemesis).entersChoosePlayer).toBe("player");
    expect(compileCard(virtue).youHave).toBe("protection");
  });

  it("True-Name Nemesis: its controller chooses a player as it enters; that player can't target, block or damage it", () => {
    const { s: s0, ap, opp, ids } = setup([nemesis]);
    let s = cast(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "player", player: ap });
    if (s.pending?.kind !== "chooseOption") throw new Error("no prompt");
    expect(s.pending.options).toHaveLength(4);
    s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    s = passAll(s);
    const n = ids[0]!;
    expect(s.objects[n]!.zone).toBe("battlefield");
    expect(s.objects[n]!.chosen?.player).toBe(opp);
    // The chosen player's spells can't target it; another opponent's can.
    const third = s.turnOrder.find((x) => x !== ap && x !== opp)!;
    expect(canShock(s, opp, [target(n)])).toBe(false);
    expect(canShock(s, third, [target(n)])).toBe(true);
    // Damage from the chosen player's sources is prevented; from anyone else's it isn't.
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    expect(dealDamage(s, objectSource(s, s.objects[theirs]!), { object: s.objects[n]! }, 2)).toBe(0);
    expect(s.objects[n]!.damage).toBe(0);
    expect(dealDamage(s, cardSource(shock, third), { object: s.objects[n]! }, 1)).toBe(1);
    // Their creatures can't block it.
    s.objects[n]!.attacking = opp;
    expect(blockProblem(s, s.objects[theirs]!, s.objects[n]!, opp)).toMatch(/protection/);
    const thirdBear = putOnBattlefield(s, third, bear({ name: "Third Bear" }));
    expect(blockProblem(s, s.objects[thirdBear]!, s.objects[n]!, third)).toBeNull();
  });

  it("Figure of Fable: the last step gives it protection from each of your opponents", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, fable);
    let s = activate(s0, ap, f, 0);
    s = activate(s, ap, f, 1);
    s = activate(s, ap, f, 2);
    expect(pt(s, f)).toBe("7/8");
    expect(canShock(s, opp, [target(f)])).toBe(false);
    expect(canShock(s, ap, [target(f)])).toBe(true);
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    expect(dealDamage(s, objectSource(s, s.objects[theirs]!), { object: s.objects[f]! }, 3)).toBe(0);
  });

  it("Cliffside Rescuer: protection from each opponent until end of turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, rescuer);
    const b = putOnBattlefield(s0, ap, bear());
    expect(canShock(s0, opp, [target(b)])).toBe(true);
    const s = activate(s0, ap, r, 0, [target(b)]);
    expect(s.objects[r]!.zone).toBe("graveyard");
    expect(canShock(s, opp, [target(b)])).toBe(false);
  });

  it("Absolute Virtue: opponents can't target its controller or damage them", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, virtue);
    const you = { kind: "player" as const, id: ap };
    expect(canShock(s0, opp, [you])).toBe(false);
    expect(canShock(s0, ap, [you])).toBe(true);
    const life = s0.players[ap]!.life;
    expect(dealDamage(s0, cardSource(shock, opp), { player: ap }, 3)).toBe(0);
    expect(s0.players[ap]!.life).toBe(life);
    // Its controller's own sources still deal damage to them.
    expect(dealDamage(s0, cardSource(shock, ap), { player: ap }, 1)).toBe(1);
  });
});
