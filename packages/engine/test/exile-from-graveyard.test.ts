// "Target player exiles a card from their graveyard" (Scrabbling Claws): that player chooses the card as it resolves
// (CR 608.2c, not targeted); "Exile a card from your graveyard" as a cost (CR 602.2b, 118.3): chosen as it's activated.
// "Whenever a land enters, ~ deals 2 damage to that land's controller" (Zo-Zu), "you may have that player lose 1 life"
// (Suture Priest): the entering permanent's controller.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passAll, putOnBattlefield, setup, target } from "./helpers";
import { botActions, characteristics, compileCard, isFullySupported, planActivate, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const toGraveyard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};

// Real oracle text (Scryfall).
const claws = card("Scrabbling Claws", "Artifact", "{1}", { oracleText: "{T}: Target player exiles a card from their graveyard.\n{1}, Sacrifice this artifact: Exile target card from a graveyard. Draw a card." });
const stonerise = card("Stonerise Spirit", "Creature — Spirit Bird", "{1}{W}", { power: "1", toughness: "2", keywords: ["Flying"], oracleText: "Flying\n{4}, Exile a card from your graveyard: Target creature gains flying until end of turn." });
const zozu = card("Zo-Zu the Punisher", "Legendary Creature — Goblin Warrior", "{1}{R}{R}", { power: "2", toughness: "2", oracleText: "Whenever a land enters, Zo-Zu deals 2 damage to that land's controller." });
const suture = card("Suture Priest", "Creature — Phyrexian Cleric", "{1}{W}", { power: "1", toughness: "1", oracleText: "Whenever another creature you control enters, you may gain 1 life.\nWhenever a creature an opponent controls enters, you may have that player lose 1 life." });

describe("exiling cards from a graveyard", () => {
  it("compiles them", () => {
    supported(claws, stonerise, zozu, suture);
    expect(compileCard(stonerise).activated[0]!.costs).toEqual([{ kind: "exileFromGraveyard", n: 1 }]);
  });

  it("Scrabbling Claws: the targeted player picks the card from their graveyard", () => {
    let { s, ap, opp } = setup([]);
    const c = putOnBattlefield(s, ap, claws);
    const [b, f] = [toGraveyard(s, opp, bear()), toGraveyard(s, opp, forest)];
    for (const a of planActivate(s, ap, c, 0, [{ kind: "player", id: opp }])!) s = act(s, a);
    s = passAll(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp, fromGraveyard: "exile", min: 1, max: 1 });
    expect((s.pending as { cards: string[] }).cards.sort()).toEqual([b, f].sort());
    s = act(s, { type: "searchLibrary", player: opp, found: [b] });
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.objects[f]!.zone).toBe("graveyard");
  });

  it("Stonerise Spirit: exiling a card from your graveyard is part of the cost", () => {
    let { s, ap } = setup([]);
    const sp = putOnBattlefield(s, ap, stonerise);
    const b = putOnBattlefield(s, ap, bear());
    expect(planActivate(s, ap, sp, 0, [target(b)])).toBeNull();
    const card1 = toGraveyard(s, ap, forest);
    for (const a of planActivate(s, ap, sp, 0, [target(b)], undefined, undefined, undefined, { exileCards: [card1] })!) s = act(s, a);
    expect(s.objects[card1]!.zone).toBe("exile");
    s = passAll(s);
    expect(characteristics(s, s.objects[b]!).keywords).toContain("Flying");
  });

  it("Zo-Zu hits the land's controller; Suture Priest makes that player lose 1 life", () => {
    let { s, ap, ids, opp } = setup([forest, bear()]);
    putOnBattlefield(s, opp, zozu);
    putOnBattlefield(s, opp, suture);
    const life = s.players[ap]!.life;
    s = act(s, { type: "playLand", player: ap, objectId: ids[0]! });
    s = passAll(s);
    expect(s.players[ap]!.life).toBe(life - 2);
    // A creature entering under the priest's opponent: the priest's controller (a bot) has that player lose 1 life.
    for (const a of planCast(s, ap, ids[1]!)!) s = act(s, a);
    for (let i = 0; i < 40 && (s.stack.length || s.pending); i++) s = act(s, s.pending ? botActions(s, waitingOn(s)!)[0]! : { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    expect(s.players[ap]!.life).toBe(life - 3);
  });
});
