// "You can't cast creature spells" (Steel Golem, Grid Monitor), "You can't cast noncreature spells" (Nikya, Nullhide
// Ferox): a "can't" for its controller only (CR 101.2; rulings). "Each player may play an additional land on each of
// their turns" (Rites of Flourishing, Ghirapur Orrery, CR 305.2a). "Players have no maximum hand size" (Price of
// Knowledge, CR 402.2). Ghirapur Orrery's "if that player has no cards in hand" at each player's upkeep (CR 603.4).

import { describe, expect, it } from "vitest";
import { activate, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { castProblem, hasNoMaxHandSize, isFullySupported, landsAllowed, planCast, type CardDef } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const steelGolem = card("Steel Golem", "Artifact Creature — Golem", "{3}", {"power":"3","toughness":"4","oracleText":"You can't cast creature spells."});
const nikyaoftheOldWays = card("Nikya of the Old Ways", "Legendary Creature — Centaur Druid", "{3}{R}{G}", {"power":"5","toughness":"5","oracleText":"You can't cast noncreature spells.\nWhenever you tap a land for mana, add one mana of any type that land produced."});
const ritesofFlourishing = card("Rites of Flourishing", "Enchantment", "{2}{G}", {"oracleText":"At the beginning of each player's draw step, that player draws an additional card.\nEach player may play an additional land on each of their turns."});
const priceofKnowledge = card("Price of Knowledge", "Enchantment", "{6}{B}", {"oracleText":"Players have no maximum hand size.\nAt the beginning of each opponent's upkeep, this enchantment deals damage to that player equal to the number of cards in that player's hand."});
const ghirapurOrrery = card("Ghirapur Orrery", "Artifact", "{4}", {"oracleText":"Each player may play an additional land on each of their turns.\nAt the beginning of each player's upkeep, if that player has no cards in hand, that player draws three cards."});
const gridMonitor = card("Grid Monitor", "Artifact Creature — Construct", "{4}", {"power":"4","toughness":"6","oracleText":"You can't cast creature spells."});
const nullhideFerox = card("Nullhide Ferox", "Creature — Beast", "{2}{G}{G}", {"power":"6","toughness":"6","keywords":["Hexproof"],"oracleText":"Hexproof\nYou can't cast noncreature spells.\n{2}: This creature loses all abilities until end of turn. Any player may activate this ability.\nIf a spell or ability an opponent controls causes you to discard this card, put it onto the battlefield instead of putting it into your graveyard."});
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const bears = card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2", oracleText: "" });

describe("can't cast, extra lands, no maximum hand size", () => {
  it("compiles", () => supported(steelGolem, nikyaoftheOldWays, ritesofFlourishing, priceofKnowledge, ghirapurOrrery, gridMonitor, nullhideFerox));

  it("Steel Golem: you can't cast creature spells; other spells, and other players' creatures, are fine", () => {
    const { s, ap, ids, opp } = setup([bears, shock]);
    putOnBattlefield(s, ap, steelGolem);
    expect(castProblem(s, ap, ids[0]!)).toMatch(/Steel Golem: you can't cast creature spells/);
    expect(planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])).not.toBeNull();
    // An opponent's Steel Golem doesn't stop you.
    const { s: t, ap: me, ids: mine, opp: them } = setup([bears]);
    putOnBattlefield(t, them, steelGolem);
    expect(planCast(t, me, mine[0]!)).not.toBeNull();
  });

  it("Nikya of the Old Ways: you can't cast noncreature spells", () => {
    const { s, ap, ids, opp } = setup([bears, shock]);
    putOnBattlefield(s, ap, nikyaoftheOldWays);
    expect(planCast(s, ap, ids[0]!)).not.toBeNull();
    expect(castProblem(s, ap, ids[1]!, [{ kind: "player", id: opp }])).toMatch(/Nikya of the Old Ways: you can't cast noncreature spells/);
  });

  it("Nullhide Ferox: once it loses all abilities, you can cast noncreature spells again this turn", () => {
    const { s: s0, ap, ids, opp } = setup([shock]);
    const f = putOnBattlefield(s0, ap, nullhideFerox);
    expect(castProblem(s0, ap, ids[0]!, [{ kind: "player", id: opp }])).toMatch(/can't cast noncreature spells/);
    const s = activate(s0, ap, f, 0);
    expect(planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])).not.toBeNull();
  });

  it("Rites of Flourishing: every player may play two lands on their own turn", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, ritesofFlourishing);
    expect(landsAllowed(s0, ap)).toBe(2);
    const s = passUntil(s0, "main1", opp);
    expect(landsAllowed(s, opp)).toBe(2);
    expect(landsAllowed(s, ap)).toBe(1); // not your turn: no land plays anyway (CR 305.1)
  });

  it("Price of Knowledge: no player has a maximum hand size", () => {
    const { s, ap, opp } = setup([]);
    expect(hasNoMaxHandSize(s, opp)).toBe(false);
    putOnBattlefield(s, ap, priceofKnowledge);
    for (const p of s.turnOrder) expect(hasNoMaxHandSize(s, p)).toBe(true);
  });

  it("Ghirapur Orrery: a player with no cards in hand draws three at their upkeep", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, ghirapurOrrery);
    for (const id of s0.players[opp]!.hand) {
      s0.objects[id]!.zone = "graveyard";
      s0.players[opp]!.graveyard.push(id);
    }
    s0.players[opp]!.hand = [];
    const s = passUntil(s0, "draw", opp);
    // Three at upkeep, then the draw step's card.
    expect(s.players[opp]!.hand.length).toBe(4);
    expect(landsAllowed(passUntil(s, "main1", opp), opp)).toBe(2);
  });
});
