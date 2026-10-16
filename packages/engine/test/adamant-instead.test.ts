// "If ... was spent to cast ~, instead ..." (CR 601.2h): what the spell does instead when the mana was spent. Devour
// Intellect's Treasure mana turns a discard into "you choose a nonland card" (both wait on a player); Sundering Stroke's
// seven red mana deals the full 7 to each target, though the damage was still divided as it was cast (rulings); Once
// and Future's adamant returns both target cards to your hand; Cauldron's Gift's choice isn't targeted, so it can take a
// creature card its own adamant just milled (rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, type CardDef, type GameState, type ManaType, type PlayerId, type TargetChoice } from "../src";
import { addMana } from "../src/spend";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const toGraveyard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};
const NONE: TargetChoice = { kind: "none" };
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });

// Real oracle text (Scryfall).
const devour = card("Devour Intellect", "Sorcery", "{B}", { oracleText: "Target opponent discards a card. If mana from a Treasure was spent to cast this spell, instead that player reveals their hand, you choose a nonland card from it, then that player discards that card." });
const stroke = card("Sundering Stroke", "Sorcery", "{6}{R}", { oracleText: "Sundering Stroke deals 7 damage divided as you choose among one, two, or three targets. If at least seven red mana was spent to cast this spell, instead Sundering Stroke deals 7 damage to each of those permanents and/or players." });
const future = card("Once and Future", "Instant", "{3}{G}", { oracleText: "Return target card from your graveyard to your hand. Put up to one other target card from your graveyard on top of your library. Exile Once and Future.\nAdamant — If at least three green mana was spent to cast this spell, instead return those cards to your hand and exile Once and Future." });
const gift = card("Cauldron's Gift", "Sorcery", "{4}{B}", { oracleText: "Adamant — If at least three black mana was spent to cast this spell, mill four cards.\nYou may choose a creature card in your graveyard. If you do, return it to the battlefield with an additional +1/+1 counter on it." });
const vadrok = card("Mythos of Vadrok", "Sorcery", "{2}{R}{R}", { oracleText: "Mythos of Vadrok deals 5 damage divided as you choose among any number of target creatures and/or planeswalkers. If {W}{U} was spent to cast this spell, until your next turn, those permanents can't attack or block and their activated abilities can't be activated." });
const vortex = card("Roiling Vortex", "Enchantment", "{1}{R}", { oracleText: "At the beginning of each player's upkeep, this enchantment deals 1 damage to them.\nWhenever a player casts a spell, if no mana was spent to cast that spell, this enchantment deals 5 damage to that player.\n{R}: Your opponents can't gain life this turn." });
const giant = card("Hill Giant Test", "Creature — Giant", "{2}{R}", { power: "3", toughness: "3" });

/** Cast it from a pool of exactly this mana (`treasure`: that much of it is from a Treasure). */
function castFrom(s: GameState, pid: PlayerId, id: string, mana: ManaType[], targets: TargetChoice[], treasure = 0): GameState {
  if (treasure) addMana(s, pid, mana.slice(0, treasure), { from: ["artifact", "treasure"] });
  addMana(s, pid, mana.slice(treasure), {});
  return act(s, { type: "castSpell", player: pid, objectId: id, targets });
}

describe("what a spell does instead when the mana was spent", () => {
  it("parses", () => supported(devour, stroke, future, gift, vadrok, vortex));

  it("Devour Intellect without Treasure mana: the opponent picks the discard", () => {
    let { s, ap, opp, ids } = setup([devour]);
    s = passAll(castFrom(s, ap, ids[0]!, ["B"], [player(opp)]));
    expect(s.pending).toMatchObject({ player: opp });
  });

  it("Devour Intellect with Treasure mana: you see their hand and pick a nonland card", () => {
    let { s, ap, opp, ids } = setup([devour]);
    const hand = s.players[opp]!.hand.length;
    s = passAll(castFrom(s, ap, ids[0]!, ["B"], [player(opp)], 1));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, hand: opp });
    const pick = (s.pending as { cards: string[] }).cards[0]!;
    expect(s.cards[s.objects[pick]!.cardId]!.typeLine).not.toContain("Land");
    s = passAll(act(s, { type: "searchLibrary", player: ap, found: [pick] }));
    expect(s.objects[pick]!.zone).toBe("graveyard");
    expect(s.players[opp]!.hand.length).toBe(hand - 1);
  });

  it("Sundering Stroke: divided damage, or 7 to each target with seven red mana spent", () => {
    for (const red of [6, 7]) {
      let { s, ap, opp, ids } = setup([stroke]);
      const [a, b] = [putOnBattlefield(s, opp, giant), putOnBattlefield(s, opp, card("Big Test", "Creature — Wurm", "{6}", { power: "7", toughness: "7" }))];
      const life = s.players[opp]!.life;
      const mana: ManaType[] = [...Array<ManaType>(red).fill("R"), ...Array<ManaType>(7 - red).fill("C")];
      s = passAll(castFrom(s, ap, ids[0]!, mana, [{ kind: "object", id: a, amount: 3 }, { kind: "object", id: b, amount: 3 }, { kind: "player", id: opp, amount: 1 }]));
      if (red === 7) {
        expect(s.objects[a]!.zone).toBe("graveyard");
        expect(s.objects[b]!.zone).toBe("graveyard");
        expect(s.players[opp]!.life).toBe(life - 7);
      } else {
        expect(s.objects[a]!.zone).toBe("graveyard");
        expect(s.objects[b]!.damage).toBe(3);
        expect(s.players[opp]!.life).toBe(life - 1);
      }
    }
  });

  it("Once and Future: one card to your hand and one on top, or both to your hand with three green mana spent", () => {
    for (const green of [2, 3]) {
      let { s, ap, ids } = setup([future]);
      const [x, y] = [toGraveyard(s, ap, bear()), toGraveyard(s, ap, giant)];
      const mana: ManaType[] = [...Array<ManaType>(green).fill("G"), ...Array<ManaType>(4 - green).fill("C")];
      s = passAll(castFrom(s, ap, ids[0]!, mana, [target(x), target(y)]));
      expect(s.objects[x]!.zone).toBe("hand");
      expect(s.objects[y]!.zone).toBe(green === 3 ? "hand" : "library");
      if (green === 2) expect(s.players[ap]!.library[0]).toBe(y);
      expect(s.objects[ids[0]!]!.zone).toBe("exile");
    }
  });

  it("Cauldron's Gift: mill four with adamant, then return a creature card with a +1/+1 counter", () => {
    let { s, ap, ids } = setup([gift]);
    const g = toGraveyard(s, ap, giant);
    s = passAll(castFrom(s, ap, ids[0]!, ["B", "B", "B", "C", "C"], []));
    expect(s.players[ap]!.graveyard.length).toBeGreaterThanOrEqual(5);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromGraveyard: "battlefield", min: 0, max: 1 });
    expect((s.pending as { cards: string[] }).cards).toContain(g);
    s = passAll(act(s, { type: "searchLibrary", player: ap, found: [g] }));
    expect(s.objects[g]!).toMatchObject({ zone: "battlefield", controller: ap });
    expect(s.objects[g]!.counters["+1/+1"]).toBe(1);
  });

  it("Cauldron's Gift: you may return nothing", () => {
    let { s, ap, ids } = setup([gift]);
    const g = toGraveyard(s, ap, giant);
    s = passAll(castFrom(s, ap, ids[0]!, ["B", "C", "C", "C", "C"], []));
    expect(s.players[ap]!.graveyard).toEqual([g]);
    s = passAll(act(s, { type: "searchLibrary", player: ap, found: [] }));
    expect(s.objects[g]!.zone).toBe("graveyard");
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("Mythos of Vadrok with {W}{U} spent: the damaged creatures can't attack or block until your next turn", () => {
    for (const wu of [false, true]) {
      let { s, ap, opp, ids } = setup([vadrok]);
      const big = card("Big Test", "Creature — Wurm", "{6}", { power: "7", toughness: "7" });
      const [a, b] = [putOnBattlefield(s, opp, big), putOnBattlefield(s, opp, big)];
      s = passAll(castFrom(s, ap, ids[0]!, wu ? ["R", "R", "W", "U"] : ["R", "R", "C", "C"], [{ kind: "object", id: a, amount: 2 }, { kind: "object", id: b, amount: 3 }, NONE, NONE, NONE]));
      expect([s.objects[a]!.damage, s.objects[b]!.damage]).toEqual([2, 3]);
      const detained = s.effects.filter((e) => e.duration === "yourNextTurn" && e.mods.some((m) => m.kind === "cantActivate"));
      expect(detained.flatMap((e) => e.affected ?? []).sort()).toEqual(wu ? [a, b].sort() : []);
    }
  });

  it("Roiling Vortex deals 1 damage to each player in their upkeep", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, vortex);
    const life = s.players[opp]!.life;
    s = passUntil(s, "draw", opp);
    expect(s.players[opp]!.life).toBe(life - 1);
  });
});
