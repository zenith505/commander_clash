// Abilities that work from the graveyard (round 91): the Incarnations' "As long as this card is in your graveyard and you
// control a Mountain, creatures you control have haste" (Anger) and Genesis's "At the beginning of your upkeep, if this
// creature is in your graveyard, you may pay {2}{G}. If you do, return target creature card from your graveyard to your
// hand." An ability that says which zone it works in works only there (CR 113.6b); its card's owner controls it there
// (CR 108.4a); its timestamp is when the card went to the graveyard (CR 613.7d, Anger rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, mountain, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, manaAbilitiesOn, objHasKeyword, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const anger = card("Anger", "Creature — Incarnation", "{3}{R}", { power: "2", toughness: "2", keywords: ["Haste"], oracleText: "Haste\nAs long as this card is in your graveyard and you control a Mountain, creatures you control have haste." });
const wonder = card("Wonder", "Creature — Incarnation", "{3}{U}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying\nAs long as this card is in your graveyard and you control an Island, creatures you control have flying." });
const brawn = card("Brawn", "Creature — Incarnation", "{3}{G}", { power: "3", toughness: "3", keywords: ["Trample"], oracleText: "Trample\nAs long as this card is in your graveyard and you control a Forest, creatures you control have trample." });
const filth = card("Filth", "Creature — Incarnation", "{3}{B}", { power: "2", toughness: "2", keywords: ["Swampwalk"], oracleText: "Swampwalk (This creature can't be blocked as long as defending player controls a Swamp.)\nAs long as this card is in your graveyard and you control a Swamp, creatures you control have swampwalk." });
const valor = card("Valor", "Creature — Incarnation", "{3}{W}", { power: "2", toughness: "2", keywords: ["First strike"], oracleText: "First strike\nAs long as this card is in your graveyard and you control a Plains, creatures you control have first strike." });
const genesis = card("Genesis", "Creature — Incarnation", "{4}{G}", { power: "4", toughness: "4", oracleText: "At the beginning of your upkeep, if this creature is in your graveyard, you may pay {2}{G}. If you do, return target creature card from your graveyard to your hand." });
const portal = card("Riftstone Portal", "Land", "", { oracleText: "{T}: Add {C}.\nAs long as this card is in your graveyard, lands you control have \"{T}: Add {G} or {W}.\"" });

function toYard(s: GameState, pid: PlayerId, def: CardDef): string {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  Object.assign(s.objects[id]!, { zone: "graveyard", timestamp: s.nextTimestamp++ });
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
}
const ownLands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land"));

describe("abilities that work from the graveyard", () => {
  it("parse", () => {
    for (const d of [anger, wonder, brawn, filth, valor, genesis, portal]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Anger in your graveyard gives your creatures haste while you control a Mountain", () => {
    const { s, ap, opp } = setup([]);
    const mine = putOnBattlefield(s, ap, bear(), { sick: true });
    const theirs = putOnBattlefield(s, opp, bear(), { sick: true });
    expect(objHasKeyword(s, s.objects[mine]!, "Haste")).toBe(false);
    toYard(s, ap, anger);
    expect(objHasKeyword(s, s.objects[mine]!, "Haste")).toBe(true);
    expect(objHasKeyword(s, s.objects[theirs]!, "Haste")).toBe(false);
    // No Mountain, no haste.
    for (const id of ownLands(s, ap).filter((id) => s.cards[s.objects[id]!.cardId]!.subtypes.includes("Mountain"))) s.battlefield.splice(s.battlefield.indexOf(id), 1);
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[mine]!, "Haste")).toBe(false);
    putOnBattlefield(s, ap, mountain);
    expect(objHasKeyword(s, s.objects[mine]!, "Haste")).toBe(true);
  });

  it("on the battlefield it's only Anger's own haste", () => {
    const { s, ap } = setup([]);
    const mine = putOnBattlefield(s, ap, bear(), { sick: true });
    const a = putOnBattlefield(s, ap, anger, { sick: true });
    expect(objHasKeyword(s, s.objects[a]!, "Haste")).toBe(true);
    expect(objHasKeyword(s, s.objects[mine]!, "Haste")).toBe(false);
  });

  it("in an opponent's graveyard it's their creatures, with their lands", () => {
    const { s, ap, opp } = setup([]);
    const mine = putOnBattlefield(s, ap, bear(), { sick: true });
    const theirs = putOnBattlefield(s, opp, bear(), { sick: true });
    toYard(s, opp, wonder);
    // The opponent controls no Island yet.
    expect(objHasKeyword(s, s.objects[theirs]!, "Flying")).toBe(false);
    putOnBattlefield(s, opp, card("Island", "Basic Land — Island"));
    expect(objHasKeyword(s, s.objects[theirs]!, "Flying")).toBe(true);
    expect(objHasKeyword(s, s.objects[mine]!, "Flying")).toBe(false);
  });

  it("Anger that dies gives haste from then on", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const a = putOnBattlefield(s, ap, anger, { sick: true });
    const mine = putOnBattlefield(s, ap, bear(), { sick: true });
    s.objects[a]!.damage = 5;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[ap]!.graveyard.map((id) => s.cards[s.objects[id]!.cardId]!.name)).toContain("Anger");
    expect(objHasKeyword(s, s.objects[mine]!, "Haste")).toBe(true);
  });

  it("Riftstone Portal in your graveyard: your lands tap for {G} or {W}", () => {
    const { s, ap } = setup([]);
    const m = ownLands(s, ap).find((id) => s.cards[s.objects[id]!.cardId]!.subtypes.includes("Mountain"))!;
    const before = manaAbilitiesOn(s, s.objects[m]!).length;
    toYard(s, ap, portal);
    expect(manaAbilitiesOn(s, s.objects[m]!).length).toBe(before + 1);
  });

  it("Genesis returns a creature card from your graveyard at your upkeep, if you pay", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const g = toYard(s, ap, genesis);
    const other = toYard(s, ap, bear());
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    s = passUntil(s, "upkeep", ap);
    // The trigger asks for its target as it's put on the stack (or the bot picks one).
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) {
      const pid = waitingOn(s)!;
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: pid, targets: [target(other)] });
      else s = act(s, { type: "passPriority", player: pid });
    }
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, pay: { mana: "{2}{G}" } });
    for (const a of botActions(s, ap)) s = act(s, a);
    expect(s.objects[other]!.zone).toBe("hand");
    expect(s.objects[g]!.zone).toBe("graveyard");
  });
});
