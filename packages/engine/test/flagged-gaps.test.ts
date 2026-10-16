// The gaps the batch triggers round left: "each player searches their library" (Field of Ruin, Avatar of Growth: each
// player chooses in APNAP order, then the lands enter together and everyone shuffles, CR 101.4, 701.23), "{1}, Exile ~"
// as a cost on the battlefield (Relic of Progenitus, CR 602.2b), "Equip—Pay {3} or discard a card" (Bloodthorn Flail,
// CR 702.6a), and "for each creature destroyed this way" (Decree of Pain: as they last existed, CR 608.2h; not the
// ones that weren't destroyed, but those that went elsewhere instead of the graveyard, per Fumigate's rulings).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passAll, pt, putOnBattlefield, setup, target } from "./helpers";
import { compileCard, invalidateCharacteristics, isFullySupported, planActivate, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const fieldOfRuin = card("Field of Ruin", "Land", "", { oracleText: "{T}: Add {C}.\n{2}, {T}, Sacrifice this land: Destroy target nonbasic land an opponent controls. Each player searches their library for a basic land card, puts it onto the battlefield, then shuffles." });
const avatar = card("Avatar of Growth", "Creature — Elemental Avatar", "{4}{G}{G}", { power: "4", toughness: "4", keywords: ["Trample"], oracleText: "This spell costs {1} less to cast for each opponent you have.\nTrample\nWhen this creature enters, each player searches their library for up to two basic land cards, puts them onto the battlefield, then shuffles." });
const relic = card("Relic of Progenitus", "Artifact", "{1}", { oracleText: "{T}: Target player exiles a card from their graveyard.\n{1}, Exile this artifact: Exile all graveyards. Draw a card." });
const executioner = card("Hanged Executioner", "Creature — Spirit", "{2}{W}{W}", { power: "1", toughness: "1", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, create a 1/1 white Spirit creature token with flying.\n{3}{W}, Exile this creature: Exile target creature." });
const flail = card("Bloodthorn Flail", "Artifact — Equipment", "{B}", { keywords: ["Equip"], oracleText: "Equipped creature gets +2/+1.\nEquip—Pay {3} or discard a card." });
const decree = card("Decree of Pain", "Sorcery", "{6}{B}{B}", { keywords: ["Cycling"], oracleText: "Destroy all creatures. They can't be regenerated. Draw a card for each creature destroyed this way.\nCycling {3}{B}{B} ({3}{B}{B}, Discard this card: Draw a card.)\nWhen you cycle this card, all creatures get -2/-2 until end of turn." });
const fumigate = card("Fumigate", "Sorcery", "{3}{W}{W}", { oracleText: "Destroy all creatures. You gain 1 life for each creature destroyed this way." });
const bloodMoney = card("Blood Money", "Sorcery", "{4}{B}{B}", { oracleText: "Destroy all creatures. For each nontoken creature destroyed this way, you create a tapped Treasure token." });
const tower = card("Command Tower", "Land", "", { oracleText: "{T}: Add one mana of any color in your commander's color identity." });
const indestructible = card("Darksteel Myr", "Artifact Creature — Myr", "{3}", { power: "0", toughness: "1", keywords: ["Indestructible"], oracleText: "Indestructible" });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
/** Answers every library search with the first card offered, recording who searched in order. */
function answerSearches(s: GameState, order: PlayerId[] = []) {
  while (s.pending?.kind === "searchLibrary") {
    order.push(s.pending.player);
    s = act(s, { type: "searchLibrary", player: s.pending.player, found: s.pending.cards.slice(0, s.pending.max) });
  }
  return s;
}
const lands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land")).length;

describe("the batch triggers round's gaps", () => {
  it("compiles them", () => {
    supported(fieldOfRuin, avatar, relic, executioner, flail, decree, fumigate, bloodMoney);
    expect(compileCard(relic).activated[1]).toMatchObject({ manaCost: "{1}", exileSelf: true, tap: false });
    expect(compileCard(relic).activated[1]!.zone).toBeUndefined();
    expect(compileCard(flail).activated.map((a) => [a.manaCost, a.costs?.[0]?.kind, a.equip])).toEqual([["{3}", undefined, true], ["", "discard", true]]);
  });

  it("Field of Ruin: each player searches for a basic land in APNAP order; the lands enter together and everyone shuffles", () => {
    let { s, ap, opp } = setup([]);
    const field = putOnBattlefield(s, ap, fieldOfRuin);
    const theirs = putOnBattlefield(s, opp, tower);
    const before = s.turnOrder.map((p) => lands(s, p));
    const libraries = s.turnOrder.map((p) => s.players[p]!.library.length);
    s = activate(s, ap, field, 0, [target(theirs)]);
    const order: PlayerId[] = [];
    // Nothing enters until everyone has chosen.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 1 });
    const first = s.pending!.kind === "searchLibrary" ? s.pending.cards[0]! : "";
    s = act(s, { type: "searchLibrary", player: ap, found: [first] });
    expect(s.objects[first]!.zone).toBe("library");
    s = answerSearches(s, order);
    expect([ap, ...order]).toEqual(s.turnOrder.slice(s.turnOrder.indexOf(ap)).concat(s.turnOrder.slice(0, s.turnOrder.indexOf(ap))));
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.objects[field]!.zone).toBe("graveyard");
    expect(s.objects[first]).toMatchObject({ zone: "battlefield", controller: ap });
    s.turnOrder.forEach((p, i) => {
      // The active player lost Field of Ruin, the opponent lost Command Tower; everyone got a basic land.
      expect(lands(s, p)).toBe(before[i]! + 1 - (p === ap || p === opp ? 1 : 0));
      expect(s.players[p]!.library.length).toBe(libraries[i]! - 1);
    });
  });

  it("Field of Ruin: an illegal target means no one searches (rulings)", () => {
    let { s, ap, opp } = setup([]);
    const field = putOnBattlefield(s, ap, fieldOfRuin);
    const theirs = putOnBattlefield(s, opp, tower);
    for (const a of planActivate(s, ap, field, 0, [target(theirs)])!) s = act(s, a);
    s.objects[theirs]!.controller = ap; // no longer an opponent's
    invalidateCharacteristics(s);
    s = passAll(s);
    expect(s.pending).toBeNull();
    expect(s.objects[theirs]!.zone).toBe("battlefield");
  });

  it("Avatar of Growth: each player puts up to two basic lands onto the battlefield", () => {
    let { s, ap, ids } = setup([avatar]);
    const before = s.turnOrder.map((p) => lands(s, p));
    s = cast(s, ap, ids[0]!);
    s = passAll(s); // the enters trigger
    s = answerSearches(s);
    s.turnOrder.forEach((p, i) => expect(lands(s, p)).toBe(before[i]! + 2));
    // Up to two: a player may take fewer.
    expect(compileCard(avatar).triggers[0]!.body.effects[0]).toMatchObject({ type: "search", upTo: true, n: 2, who: { ref: "eachPlayer" } });
  });

  it("Relic of Progenitus: {1}, exile it, exile all graveyards and draw; the exile is a cost", () => {
    let { s, ap, opp } = setup([]);
    const r = putOnBattlefield(s, ap, relic);
    const g = putOnBattlefield(s, opp, bear());
    s.battlefield.splice(s.battlefield.indexOf(g), 1);
    s.objects[g]!.zone = "graveyard";
    s.players[opp]!.graveyard.push(g);
    const hand = s.players[ap]!.hand.length;
    for (const a of planActivate(s, ap, r, 1)!) s = act(s, a);
    // Exiled as it's activated, before it resolves.
    expect(s.objects[r]!.zone).toBe("exile");
    expect(s.stack).toHaveLength(1);
    s = passAll(s);
    expect(s.objects[g]!.zone).toBe("exile");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    // Only from the battlefield: not from a graveyard.
    expect(planActivate(s, ap, r, 1)).toBeNull();
  });

  it("Hanged Executioner exiles itself to exile a creature", () => {
    let { s, ap, opp } = setup([]);
    const h = putOnBattlefield(s, ap, executioner);
    const b = putOnBattlefield(s, opp, bear());
    s = activate(s, ap, h, 0, [target(b)]);
    expect(s.objects[h]!.zone).toBe("exile");
    expect(s.objects[b]!.zone).toBe("exile");
  });

  it("Bloodthorn Flail: equip by paying {3} or by discarding a card, only as a sorcery", () => {
    let { s, ap, ids } = setup([bear()]);
    const f = putOnBattlefield(s, ap, flail);
    const b = putOnBattlefield(s, ap, bear());
    const c = putOnBattlefield(s, ap, bear());
    s = activate(s, ap, f, 0, [target(b)]);
    expect(s.objects[f]!.attachedTo).toBe(b);
    expect(pt(s, b)).toBe("4/3");
    // Discarding a card instead: no mana spent.
    const plan = planActivate(s, ap, f, 1, [target(c)], undefined, undefined, undefined, { discard: [ids[0]!] })!;
    expect(plan.filter((a) => a.type === "activateMana")).toHaveLength(0);
    for (const a of plan) s = act(s, a);
    expect(s.players[ap]!.graveyard).toContain(ids[0]);
    s = passAll(s);
    expect(s.objects[f]!.attachedTo).toBe(c);
    // With no card in hand, only the {3} works.
    s.players[ap]!.hand = [];
    expect(planActivate(s, ap, f, 1, [target(b)])).toBeNull();
    expect(planActivate(s, ap, f, 0, [target(b)])).not.toBeNull();
  });

  it("Decree of Pain draws a card for each creature destroyed: not the indestructible one", () => {
    let { s, ap, ids, opp } = setup([decree]);
    for (const p of [ap, opp, opp]) putOnBattlefield(s, p, bear());
    putOnBattlefield(s, opp, indestructible);
    const hand = s.players[ap]!.hand.length;
    s = cast(s, ap, ids[0]!);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3);
  });

  it("Fumigate counts a creature exiled instead of put into a graveyard, per its rulings", () => {
    let { s, ap, ids, opp } = setup([fumigate]);
    const bs = [putOnBattlefield(s, opp, bear()), putOnBattlefield(s, ap, bear())];
    s.objects[bs[0]!]!.exileIfDiesTurn = s.turn; // "if it would die this turn, exile it instead"
    const life = s.players[ap]!.life;
    s = cast(s, ap, ids[0]!);
    expect(bs.map((b) => s.objects[b]!.zone)).toEqual(["exile", "graveyard"]);
    expect(s.players[ap]!.life).toBe(life + 2);
  });

  it("Blood Money makes a tapped Treasure for each nontoken creature destroyed", () => {
    let { s, ap, ids, opp } = setup([bloodMoney]);
    putOnBattlefield(s, opp, bear());
    putOnBattlefield(s, opp, bear());
    const tok = putOnBattlefield(s, opp, bear({ name: "Bear Token" }));
    s.objects[tok]!.isToken = true;
    s = cast(s, ap, ids[0]!);
    const treasures = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Treasure Token" && s.objects[id]!.controller === ap);
    expect(treasures).toHaveLength(2);
    expect(treasures.every((id) => s.objects[id]!.tapped)).toBe(true);
  });
});
