// Round 93: Etali, Primal Storm. "Whenever Etali attacks, exile the top card of each player's library, then you may cast
// any number of spells from among those cards without paying their mana costs." Cast as the trigger resolves, ignoring
// timing (CR 608.2g); lands and the cards not cast stay exiled (rulings). You control the spells you cast, whoever owns them.

import { describe, expect, it } from "vitest";
import { act, card, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { controllerOf, isFullySupported, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const etali = card("Etali, Primal Storm", "Legendary Creature — Elder Dinosaur", "{4}{R}{R}", { power: "6", toughness: "6", oracleText: "Whenever Etali attacks, exile the top card of each player's library, then you may cast any number of spells from among those cards without paying their mana costs." });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
const ogre = card("Gray Ogre", "Creature — Ogre", "{2}{R}", { power: "2", toughness: "2" });
const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });

function onTop(s: GameState, pid: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
}
const offered = (s: GameState) => (s.pending?.kind === "chooseOption" && s.pending.what === "castFromAmong" ? s.pending.options : []);

describe("Etali, Primal Storm", () => {
  it("parse", () => expect(isFullySupported(etali)).toBe(true));

  it("exiles the top card of each library and casts any of them for free; lands and the rest stay exiled", () => {
    const { s: s0, ap } = setup([]);
    const e = putOnBattlefield(s0, ap, etali);
    const [p1, p2, p3] = s0.turnOrder.filter((p) => p !== ap) as [PlayerId, PlayerId, PlayerId];
    const mine = onTop(s0, ap, divination);
    const theirs = onTop(s0, p1, ogre);
    const kept = onTop(s0, p2, giant);
    const land = onTop(s0, p3, forest);
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: e, defender: p1 }] });
    for (let i = 0; i < 20 && !offered(s).length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (const id of [mine, theirs, kept, land]) expect(s.objects[id]!.zone).toBe("exile");
    expect([...offered(s)].sort()).toEqual([mine, theirs, kept, "none"].sort());
    s = act(s, { type: "chooseOption", player: ap, choice: theirs });
    s = planCast(s, ap, theirs)!.reduce((x, a) => act(x, a), s);
    expect([...offered(s)].sort()).toEqual([mine, kept, "none"].sort());
    s = act(s, { type: "chooseOption", player: ap, choice: mine });
    s = planCast(s, ap, mine)!.reduce((x, a) => act(x, a), s);
    s = act(s, { type: "chooseOption", player: ap, choice: "none" });
    expect(s.pending).toBeNull();
    for (let i = 0; i < 20 && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
    expect(s.objects[theirs]!.owner).toBe(p1);
    expect(s.objects[mine]!.zone).toBe("graveyard");
    expect([s.objects[kept]!.zone, s.objects[land]!.zone]).toEqual(["exile", "exile"]);
  });
});
