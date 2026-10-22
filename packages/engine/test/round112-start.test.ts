// Round 112, the most played cards left. First the bots' side of Gix, Yawgmoth Praetor (its "Discard X cards" ability
// and the shock land played from among the cards it exiled).

import { describe, expect, it } from "vitest";
import { act, card, passAll, passUntil, putOnBattlefield, setup, swamp } from "./helpers";
import { botActions, characteristics, compileCard, isFullySupported, manaAbilitiesOn, planActivate, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const gix = card("Gix, Yawgmoth Praetor", "Legendary Creature — Phyrexian Praetor", "{1}{B}{B}", {
  power: "3",
  toughness: "3",
  oracleText:
    "Whenever a creature deals combat damage to one of your opponents, its controller may pay 1 life. If they do, they draw a card.\n{4}{B}{B}{B}, Discard X cards: Exile the top X cards of target opponent's library. You may play lands and cast spells from among cards exiled this way without paying their mana costs.",
});
const shockland = card("Blood Crypt", "Land — Swamp Mountain", "", {
  oracleText: "({T}: Add {B} or {R}.)\nAs Blood Crypt enters, you may pay 2 life. If you don't, it enters tapped.",
});
const passage = card("Multiversal Passage", "Land", "", {
  oracleText: "As this land enters, choose a basic land type. Then you may pay 2 life. If you don't, it enters tapped.\nThis land is the chosen type.",
});
const big = (name: string) => card(name, "Creature — Giant", "{20}", { power: "9", toughness: "9" });

const toZone = (s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "library" | "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  return id;
};

/** Only these cards in the player's hand (the rest back on top of the library), and no commander to cast. */
const onlyInHand = (s: GameState, pid: PlayerId, ids: string[]) => {
  const p = s.players[pid]!;
  for (const id of p.hand.filter((x) => !ids.includes(x))) {
    s.objects[id]!.zone = "library";
    p.library.unshift(id);
  }
  p.hand = [...ids];
  p.command = [];
};

describe("bots and Gix, Yawgmoth Praetor", () => {
  it("in its second main phase a bot discards the cards it can't cast for Gix's ability", () => {
    const { s: s0, ap, ids } = setup([big("Giant One"), big("Giant Two"), swamp, swamp]);
    const g = putOnBattlefield(s0, ap, gix);
    putOnBattlefield(s0, ap, swamp);
    onlyInHand(s0, ap, ids);
    let s = passUntil(s0, "main2", ap);
    let activation: Extract<Action, { type: "activateAbility" }> | undefined;
    for (let i = 0; i < 30 && !activation && waitingOn(s) === ap; i++) {
      const acts = botActions(s, ap);
      activation = acts.find((a): a is Extract<Action, { type: "activateAbility" }> => a.type === "activateAbility" && a.objectId === g);
      for (const a of acts) s = act(s, a);
    }
    expect(activation).toBeDefined();
    // X = 3: both Giants and a Swamp; the other Swamp is the land played this turn.
    expect(activation!.x).toBe(3);
    expect(activation!.costs?.discard).toHaveLength(3);
    expect(ids.slice(0, 2).every((id) => activation!.costs!.discard!.includes(id))).toBe(true);
    expect(activation!.targets).toHaveLength(1);
    expect(activation!.targets![0]).not.toEqual({ kind: "player", id: ap });
  });

  it("not with only one card it can do without", () => {
    const { s: s0, ap, ids } = setup([big("Giant One"), swamp]);
    const g = putOnBattlefield(s0, ap, gix);
    putOnBattlefield(s0, ap, swamp);
    onlyInHand(s0, ap, ids);
    let s = passUntil(s0, "main2", ap);
    for (let i = 0; i < 30 && waitingOn(s) === ap && s.step === "main2"; i++) {
      const acts = botActions(s, ap);
      expect(acts.some((a) => a.type === "activateAbility" && a.objectId === g)).toBe(false);
      if (acts[0]?.type === "passPriority") break;
      for (const a of acts) s = act(s, a);
    }
  });

  it("a bot with life to spare pays 2 life for an untapped shock land played from among the exiled cards", () => {
    const { s: s0, ap, opp, ids } = setup([swamp]);
    const g = putOnBattlefield(s0, ap, gix);
    putOnBattlefield(s0, ap, swamp);
    const land = toZone(s0, opp, shockland, "library");
    let s = passAll(planActivate(s0, ap, g, 0, [{ kind: "player", id: opp }], undefined, undefined, 1, { discard: ids })!.reduce((x, a) => act(x, a), s0));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", options: [land, "none"] });
    for (let i = 0; i < 5 && s.pending; i++) for (const a of botActions(s, waitingOn(s)!)) s = act(s, a);
    expect(s.objects[land]!).toMatchObject({ zone: "battlefield", controller: ap, tapped: false });
    expect(s.players[ap]!.life).toBe(38);
  });

  it("with little life left it lets the land enter tapped", () => {
    const { s: s0, ap, opp, ids } = setup([swamp]);
    const g = putOnBattlefield(s0, ap, gix);
    putOnBattlefield(s0, ap, swamp);
    const land = toZone(s0, opp, shockland, "library");
    s0.players[ap]!.life = 10;
    let s = passAll(planActivate(s0, ap, g, 0, [{ kind: "player", id: opp }], undefined, undefined, 1, { discard: ids })!.reduce((x, a) => act(x, a), s0));
    for (let i = 0; i < 5 && s.pending; i++) for (const a of botActions(s, waitingOn(s)!)) s = act(s, a);
    expect(s.objects[land]!).toMatchObject({ zone: "battlefield", tapped: true });
    expect(s.players[ap]!.life).toBe(10);
  });
});

describe("Multiversal Passage", () => {
  it("parse", () => {
    expect(isFullySupported(passage)).toBe(true);
    expect(compileCard(passage)).toMatchObject({ entersChoose: [{ what: "basicLandType" }], entersTappedChoice: { kind: "payLife", n: 2 } });
  });

  it("pay 2 life: untapped, the chosen type, and it taps for that type's mana", () => {
    const { s: s0, ap, ids } = setup([passage]);
    let s = act(s0, { type: "playLand", player: ap, objectId: ids[0]!, untapped: true });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap });
    expect((s.pending as { options: string[] }).options).toEqual(["Plains", "Island", "Swamp", "Mountain", "Forest"]);
    s = act(s, { type: "chooseOption", player: ap, choice: "Island" });
    const o = s.objects[ids[0]!]!;
    expect(o).toMatchObject({ zone: "battlefield", tapped: false });
    expect(s.players[ap]!.life).toBe(38);
    expect(characteristics(s, o).subtypes).toEqual(["Island"]);
    expect(manaAbilitiesOn(s, o).map((m) => m.produces)).toEqual([{ kind: "fixed", mana: ["U"] }]);
  });

  it("don't pay: tapped", () => {
    const { s: s0, ap, ids } = setup([passage]);
    let s = act(s0, { type: "playLand", player: ap, objectId: ids[0]! });
    s = act(s, { type: "chooseOption", player: ap, choice: "Forest" });
    expect(s.objects[ids[0]!]).toMatchObject({ zone: "battlefield", tapped: true });
    expect(s.players[ap]!.life).toBe(40);
    expect(characteristics(s, s.objects[ids[0]!]!).subtypes).toEqual(["Forest"]);
  });

  it("a bot picks a type and plays it", () => {
    const { s: s0, ap, ids } = setup([passage]);
    onlyInHand(s0, ap, ids);
    const acts = botActions(s0, ap);
    expect(acts).toMatchObject([{ type: "playLand", objectId: ids[0] }]);
    let s = act(s0, acts[0]!);
    for (let i = 0; i < 4 && s.pending; i++) for (const a of botActions(s, waitingOn(s)!)) s = act(s, a);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(characteristics(s, s.objects[ids[0]!]!).subtypes).toHaveLength(1);
  });
});
