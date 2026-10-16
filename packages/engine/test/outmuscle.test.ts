// Outmuscle: "the creature you control" names the one target described that way. Adamant gives it indestructible after
// the fight; state-based actions only run once the spell has resolved (CR 704.3), so the fight damage doesn't destroy it
// (ruling 2019-10-04). With fewer than three green mana spent, the creature dies.

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, planCast, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const outmuscle = card("Outmuscle", "Sorcery", "{3}{G}", { oracleText: "Put a +1/+1 counter on target creature you control, then it fights target creature you don't control. (Each deals damage equal to its power to the other.)\nAdamant — If at least three green mana was spent to cast this spell, the creature you control gains indestructible until end of turn." });
const forest = () => card("Forest", "Basic Land — Forest");
const mountain = () => card("Mountain", "Basic Land — Mountain");

function onlyLands(s: GameState, pid: PlayerId, lands: CardDef[]) {
  for (const id of [...s.battlefield]) if (s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.typeLine.includes("Land")) s.battlefield.splice(s.battlefield.indexOf(id), 1);
  lands.forEach((l) => putOnBattlefield(s, pid, l));
}

describe("Outmuscle", () => {
  it("parses", () => expect(isFullySupported(outmuscle)).toBe(true));

  it("three green mana spent: the creature you control survives the fight; otherwise it dies", () => {
    for (const [lands, survives] of [[[forest(), forest(), forest(), forest()], true], [[forest(), mountain(), mountain(), mountain()], false]] as const) {
      const { s: s0, ap, opp, ids } = setup([outmuscle]);
      onlyLands(s0, ap, [...lands]);
      const mine = putOnBattlefield(s0, ap, bear());
      const theirs = putOnBattlefield(s0, opp, card("Big", "Creature — Beast", "", { power: "5", toughness: "5" }));
      const s = passAll(planCast(s0, ap, ids[0]!, [target(mine), target(theirs)])!.reduce((x, a) => act(x, a), s0));
      expect(s.objects[theirs]!.damage).toBe(3);
      expect(s.objects[mine]!.zone).toBe(survives ? "battlefield" : "graveyard");
    }
  });
});
