// A player gaining hexproof, shroud or protection until end of turn (CR 702.11d, 702.18d, 702.16b-e, 702.16k): Gilded
// Light, Lazotep Plating, Dawn's Truce, Seht's Tiger, and Guardian Archon's secretly chosen opponent, revealed as the cost
// of its ability (rulings: no ability without a chosen player; protection from that player for you and the target).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passAll, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { compileCard, isFullySupported, planCast, type CardDef, type GameState } from "../src";
import { addMana } from "../src/spend";
import { cardSource, dealDamage, objectSource } from "../src/damage";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const archon = card("Guardian Archon", "Creature — Archon", "{4}{W}{W}", { power: "5", toughness: "5", keywords: ["Flying"], oracleText: "Flying\nAs this creature enters, secretly choose an opponent.\nReveal the player you chose: You and target permanent you control each gain protection from the chosen player until end of turn. Activate only once." });
const gilded = card("Gilded Light", "Instant", "{1}{W}", { keywords: ["Cycling"], oracleText: "You gain shroud until end of turn. (You can't be the target of spells or abilities.)\nCycling {2} ({2}, Discard this card: Draw a card.)" });
const lazotep = card("Lazotep Plating", "Instant", "{1}{U}", { keywords: ["Amass"], oracleText: "Amass Zombies 1. (Put a +1/+1 counter on an Army you control. It's also a Zombie. If you don't control an Army, create a 0/0 black Zombie Army creature token first.)\nYou and permanents you control gain hexproof until end of turn. (You and they can't be the targets of spells or abilities your opponents control.)" });
const tiger = card("Seht's Tiger", "Creature — Cat", "{2}{W}{W}", { power: "3", toughness: "3", keywords: ["Flash"], oracleText: "Flash (You may cast this spell any time you could cast an instant.)\nWhen this creature enters, you gain protection from the color of your choice until end of turn. (You can't be targeted, dealt damage, or enchanted by anything of the chosen color.)" });
const truce = card("Dawn's Truce", "Instant", "{1}{W}", { keywords: ["Gift"], oracleText: "Gift a card (You may promise an opponent a gift as you cast this spell. If you do, they draw a card before its other effects.)\nYou and permanents you control gain hexproof until end of turn. If the gift was promised, permanents you control also gain indestructible until end of turn." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

/** `pid` holds a Shock: can they cast it at this target? */
function canShock(s: GameState, pid: number, t: Parameters<typeof planCast>[3]): boolean {
  s.cards[shock.oracleId] = shock;
  const id = `shock${s.nextId++}`;
  s.objects[id] = { id, cardId: shock.oracleId, owner: pid, controller: pid, zone: "hand", timestamp: s.nextTimestamp++, tapped: false, controlledSinceTurn: -1, damage: 0, deathtouchDamage: false, counters: {}, isCommander: false, isToken: false };
  s.players[pid]!.hand.push(id);
  addMana(s, pid, ["R"], {});
  const priority = s.priority;
  s.priority = pid;
  const ok = !!planCast(s, pid, id, t);
  s.priority = priority;
  s.players[pid]!.hand.pop();
  delete s.objects[id];
  s.players[pid]!.manaPool.R = 0;
  s.players[pid]!.manaLots = [];
  return ok;
}
const nextTurn = (s: GameState) => passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(s.activePlayer) + 1) % 4]);

describe("players gaining hexproof, shroud or protection until end of turn", () => {
  it("parse", () => {
    supported(archon, gilded, lazotep, tiger, truce);
    expect(compileCard(archon)).toMatchObject({ entersChoosePlayer: "opponent", entersChooseSecret: true });
    expect(compileCard(archon).activated[0]).toMatchObject({ revealChosen: true, onceEver: true });
  });

  it("Gilded Light: nobody can target you, until the turn ends", () => {
    const { s: s0, ap, opp, ids } = setup([gilded]);
    const you = { kind: "player" as const, id: ap };
    let s = cast(s0, ap, ids[0]!);
    expect(canShock(s, opp, [you])).toBe(false);
    expect(canShock(s, ap, [you])).toBe(false); // shroud: not even by you (CR 702.18d)
    s = nextTurn(s);
    expect(canShock(s, opp, [you])).toBe(true);
  });

  it("Lazotep Plating: you and your permanents have hexproof from opponents", () => {
    const { s: s0, ap, opp, ids } = setup([lazotep]);
    const b = putOnBattlefield(s0, ap, bear());
    const s = cast(s0, ap, ids[0]!);
    expect(canShock(s, opp, [{ kind: "player", id: ap }])).toBe(false);
    expect(canShock(s, opp, [target(b)])).toBe(false);
    expect(canShock(s, ap, [{ kind: "player", id: ap }])).toBe(true);
  });

  it("Seht's Tiger: damage from sources of the chosen color is prevented, and they can't target you", () => {
    const { s: s0, ap, opp, ids } = setup([tiger]);
    let s = cast(s0, ap, ids[0]!);
    for (let i = 0; i < 6 && s.pending?.kind !== "chooseOption"; i++) s = passAll(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "color", player: ap });
    s = passAll(act(s, { type: "chooseOption", player: ap, choice: "Red" }));
    const life = s.players[ap]!.life;
    expect(dealDamage(s, cardSource(shock, opp), { player: ap }, 2)).toBe(0);
    expect(canShock(s, opp, [{ kind: "player", id: ap }])).toBe(false);
    // A green source isn't red.
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    expect(dealDamage(s, objectSource(s, s.objects[theirs]!), { player: ap }, 2)).toBe(2);
    expect(s.players[ap]!.life).toBe(life - 2);
  });

  it("Guardian Archon: a secret choice, revealed to give you and a permanent protection from that opponent", () => {
    const { s: s0, ap, opp, ids } = setup([archon]);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(opp) + 1) % 4]!;
    const b = putOnBattlefield(s0, ap, bear());
    let s = cast(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "player", player: ap, prompt: "secretly choose an opponent" });
    if (s.pending?.kind !== "chooseOption") throw new Error("no prompt");
    expect(s.pending.options).not.toContain(String(ap));
    s = passAll(act(s, { type: "chooseOption", player: ap, choice: String(opp) }));
    const a = ids[0]!;
    expect(s.objects[a]!.chosen).toMatchObject({ player: opp, secret: true });
    // The log doesn't say who.
    expect(s.log.some((l) => /secretly chooses an opponent for Guardian Archon/.test(l.text))).toBe(true);
    expect(s.log.some((l) => /chooses .* for Guardian Archon/.test(l.text) && l.text.includes(s.players[opp]!.name + " "))).toBe(false);
    // Until it's revealed, the choice does nothing.
    expect(canShock(s, opp, [target(b)])).toBe(true);
    s = activate(s, ap, a, 0, [target(b)]);
    expect(s.objects[a]!.chosen?.secret).toBeUndefined();
    expect(s.log.some((l) => /reveals the player chosen for Guardian Archon/.test(l.text))).toBe(true);
    expect(canShock(s, opp, [target(b)])).toBe(false);
    expect(canShock(s, opp, [{ kind: "player", id: ap }])).toBe(false);
    expect(canShock(s, third, [target(b)])).toBe(true);
    expect(canShock(s, third, [{ kind: "player", id: ap }])).toBe(true);
    expect(dealDamage(s, cardSource(shock, opp), { player: ap }, 2)).toBe(0);
    expect(dealDamage(s, cardSource(shock, opp), { object: s.objects[b]! }, 2)).toBe(0);
    // Activate only once.
    expect(() => act(s, { type: "activateAbility", player: ap, objectId: a, index: 0, targets: [target(b)] })).toThrow(/only once/);
    // Both end with the turn.
    s = nextTurn(s);
    expect(canShock(s, opp, [target(b)])).toBe(true);
    expect(canShock(s, opp, [{ kind: "player", id: ap }])).toBe(true);
  });

  it("Guardian Archon: no chosen player (it didn't enter with a choice), no ability", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, archon);
    const b = putOnBattlefield(s0, ap, bear());
    expect(() => act(s0, { type: "activateAbility", player: ap, objectId: a, index: 0, targets: [target(b)] })).toThrow(/no player was chosen/);
  });
});
