// "Each player puts a creature card from their graveyard onto the battlefield" (Exhume), "... with mana value 3 or
// less ..." (Crypt Champion): not targeted, so each player chooses one of their own as it resolves, the active player
// first, then the others in turn order; a player with none does nothing, one with a single card has no choice; then
// they all enter at the same time, each under its owner's control (CR 101.4, 110.2a, rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, waitingOn, type CardDef, type GameState, type ManaType, type PlayerId } from "../src";
import { addMana } from "../src/spend";

// Real oracle text (Scryfall).
const exhume = card("Exhume", "Sorcery", "{1}{B}", { oracleText: "Each player puts a creature card from their graveyard onto the battlefield." });
const champion = card("Crypt Champion", "Creature — Zombie", "{3}{B}", { power: "2", toughness: "2", keywords: ["Double strike"], oracleText: "Double strike\nWhen this creature enters, each player puts a creature card with mana value 3 or less from their graveyard onto the battlefield.\nWhen this creature enters, sacrifice it unless {R} was spent to cast it." });
const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

/** A card in `pid`'s graveyard. */
function inYard(s: GameState, pid: PlayerId, def: CardDef): string {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
}
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const others = (s: GameState, ap: PlayerId) => [1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(ap) + i) % 4]!);
const choose = (s: GameState, pid: PlayerId, id: string) => settle(act(s, { type: "searchLibrary", player: pid, found: [id] }));

describe("each player puts a creature card from their graveyard onto the battlefield", () => {
  it("parses", () => [exhume, champion].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Exhume: each chooses their own in turn order, then they all enter under their owners' control", () => {
    let { s, ap, ids } = setup([exhume]);
    const [p1, p2] = others(s, ap);
    const mine = [inYard(s, ap, bear()), inYard(s, ap, giant)];
    inYard(s, ap, shock);
    const theirs = inYard(s, p1!, giant);
    const two = [inYard(s, p2!, bear()), inYard(s, p2!, giant)];
    addMana(s, ap, ["B", "C"] as ManaType[], {});
    s = act(s, { type: "castSpell", player: ap, objectId: ids[0]! });
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromGraveyard: "battlefield", min: 1, max: 1 });
    expect((s.pending as { cards: string[] }).cards.sort()).toEqual([...mine].sort());
    s = choose(s, ap, mine[1]!);
    // p1 has just one: no choice. p2 chooses; nothing has entered yet.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: p2 });
    expect(s.objects[mine[1]!]!.zone).toBe("graveyard");
    s = choose(s, p2!, two[0]!);
    expect([mine[1], theirs, two[0]].map((id) => s.objects[id!]!.zone)).toEqual(["battlefield", "battlefield", "battlefield"]);
    expect(s.objects[theirs]!.controller).toBe(p1);
    expect(s.objects[two[0]!]!.controller).toBe(p2);
    expect([mine[0], two[1]].map((id) => s.objects[id!]!.zone)).toEqual(["graveyard", "graveyard"]);
  });

  it("Crypt Champion: only mana value 3 or less, and it's sacrificed unless {R} was spent", () => {
    let { s, ap, ids } = setup([champion]);
    const [p1] = others(s, ap);
    const b = inYard(s, ap, bear());
    inYard(s, ap, giant);
    const big = inYard(s, p1!, giant);
    addMana(s, ap, ["B", "C", "C", "C"] as ManaType[], {});
    s = act(s, { type: "castSpell", player: ap, objectId: ids[0]! });
    s = settle(s);
    // Hill Giant (mana value 4) can't come back; the bear is the only choice.
    expect(s.pending).toBeFalsy();
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[big]!.zone).toBe("graveyard");
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });
});
