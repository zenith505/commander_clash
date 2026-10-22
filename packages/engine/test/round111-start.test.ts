// Round 111, the most played cards left: Gix, Yawgmoth Praetor and Edric ("whenever a creature deals combat damage to
// one of your opponents, its controller may ..."; "Discard X cards" as a cost; playing lands from among exiled cards as
// the ability resolves).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, putOnBattlefield, setup, swamp } from "./helpers";
import { abilityProblem, canBeCommander, characteristics, defOf, invalidateCharacteristics, isFullySupported, objIsType, planCast, planActivate, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const gix = card("Gix, Yawgmoth Praetor", "Legendary Creature — Phyrexian Praetor", "{1}{B}{B}", {
  power: "3",
  toughness: "3",
  oracleText:
    "Whenever a creature deals combat damage to one of your opponents, its controller may pay 1 life. If they do, they draw a card.\n{4}{B}{B}{B}, Discard X cards: Exile the top X cards of target opponent's library. You may play lands and cast spells from among cards exiled this way without paying their mana costs.",
});
const edric = card("Edric, Spymaster of Trest", "Legendary Creature — Elf Rogue", "{1}{G}{U}", {
  power: "2",
  toughness: "2",
  oracleText: "Whenever a creature deals combat damage to one of your opponents, its controller may draw a card.",
});
const grist = card("Grist, the Hunger Tide", "Legendary Planeswalker — Grist", "{1}{B}{G}", {
  loyalty: "3",
  oracleText:
    "As long as Grist isn't on the battlefield, it's a 1/1 Insect creature in addition to its other types.\n+1: Create a 1/1 black and green Insect creature token, then mill a card. If an Insect card was milled this way, put a loyalty counter on Grist and repeat this process.\n−2: You may sacrifice a creature. When you do, destroy target creature or planeswalker.\n−5: Each opponent loses life equal to the number of creature cards in your graveyard.",
});
const sunforger = card("Sunforger", "Artifact — Equipment", "{3}", {
  oracleText:
    "Equipped creature gets +4/+0.\n{R}{W}, Unattach this Equipment: Search your library for a red or white instant card with mana value 4 or less and cast that card without paying its mana cost. Then shuffle.\nEquip {3}",
});
const arixmethes = card("Arixmethes, Slumbering Isle", "Legendary Creature — Kraken", "{2}{G}{U}", {
  power: "12",
  toughness: "12",
  oracleText:
    "Arixmethes enters tapped with five slumber counters on it.\nAs long as Arixmethes has a slumber counter on it, it's a land. (It's not a creature.)\nWhenever you cast a spell, you may remove a slumber counter from Arixmethes.\n{T}: Add {G}{U}.",
});
// Test cards.
const opt = card("Test Opt", "Instant", "{U}", { oracleText: "Draw a card." });
const ponder = card("Test Ponder", "Sorcery", "{U}", { oracleText: "Draw a card." });
const shockland = card("Test Shockland", "Land — Swamp Mountain", "", { oracleText: "({T}: Add {B} or {R}.)\nAs this land enters, you may pay 2 life. If you don't, it enters tapped." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  return plan.reduce((x, a) => act(x, a), s);
};
const toZone = (s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "library" | "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  return id;
};
const attack = (s: GameState, ap: PlayerId, attackers: string[], defender: PlayerId) => {
  while (s.pending?.kind !== "declareAttackers") s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender })) });
};
/** Pass (no blocks) until a pending decision of this kind. */
const until = (s: GameState, kind: string) => {
  for (let i = 0; i < 60 && s.pending?.kind !== kind; i++) s = s.pending?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] }) : act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("Gix, Yawgmoth Praetor and Edric", () => {
  it("parse", () => supported(gix, edric));

  it("Gix: a creature you control hits an opponent, you may pay 1 life to draw", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, gix);
    const b = putOnBattlefield(s0, ap, bear());
    let s = until(attack(s0, ap, [b], opp), "chooseMay");
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, pay: { life: 1 } });
    const hand = s.players[ap]!.hand.length;
    const life = s.players[ap]!.life;
    s = passAll(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.players[ap]!.life).toBe(life - 1);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("Gix: another player's creature hitting one of your opponents lets that player pay and draw; not when it hits you", () => {
    const { s: s0, ap } = setup([]);
    const gixer = next(s0, ap);
    const third = next(s0, gixer);
    putOnBattlefield(s0, gixer, gix);
    const b = putOnBattlefield(s0, ap, bear());
    const b2 = putOnBattlefield(s0, ap, bear());
    let s = until(attack(s0, ap, [b], third), "chooseMay");
    // The attacker's controller decides, not Gix's.
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    const hand = s.players[ap]!.hand.length;
    s = passAll(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.players[ap]!.hand.length).toBe(hand);
    // Hitting Gix's controller: not one of their opponents.
    let s1 = attack(s0, ap, [b2], gixer);
    for (let i = 0; i < 60 && s1.step !== "end"; i++) s1 = s1.pending?.kind === "declareBlockers" ? act(s1, { type: "declareBlockers", player: s1.pending.player, blocks: [] }) : act(s1, { type: "passPriority", player: waitingOn(s1)! });
    expect(s1.pending).toBeNull();
    expect(s1.players[gixer]!.life).toBe(38);
  });

  it("Edric: the attacking creature's controller may draw", () => {
    const { s: s0, ap } = setup([]);
    const edricer = next(s0, ap);
    putOnBattlefield(s0, edricer, edric);
    const b = putOnBattlefield(s0, ap, bear());
    let s = until(attack(s0, ap, [b], next(s0, edricer)), "chooseMay");
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    const hand = s.players[ap]!.hand.length;
    s = passAll(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("Gix's ability: discard X, exile the top X of an opponent's library, play a land and cast a spell from among them for free", () => {
    const { s: s0, ap, opp, ids } = setup([ponder, ponder]);
    const g = putOnBattlefield(s0, ap, gix);
    putOnBattlefield(s0, ap, swamp);
    const spell = toZone(s0, opp, ponder, "library");
    const land = toZone(s0, opp, shockland, "library");
    const rest = toZone(s0, opp, bear({ name: "Third Bear" }), "library");
    // X = 3 needs three cards to discard.
    expect(abilityProblem(s0, ap, g, 0, [{ kind: "player", id: opp }], undefined, undefined, 3, { discard: ids })).not.toBeNull();
    let s = run(s0, planActivate(s0, ap, g, 0, [{ kind: "player", id: opp }], undefined, undefined, 2, { discard: ids }));
    expect(ids.map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
    s = passAll(s);
    expect([rest, land].map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile"]);
    expect(s.objects[spell]!.zone).toBe("library");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", options: [rest, land, "none"] });
    // The land: pay 2 life so it enters untapped.
    s = act(s, { type: "chooseOption", player: ap, choice: land });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    const life = s.players[ap]!.life;
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.objects[land]!).toMatchObject({ zone: "battlefield", controller: ap, tapped: false });
    expect(s.players[ap]!.life).toBe(life - 2);
    expect(s.players[ap]!.landsPlayedThisTurn).toBe(1);
    // Then the bear, cast without paying its mana cost.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", options: [rest, "none"] });
    s = act(s, { type: "chooseOption", player: ap, choice: rest });
    expect(s.pending?.kind).toBe("castFree");
    s = act(s, { type: "castSpell", player: ap, objectId: rest } as Action);
    s = passAll(passAll(s));
    expect(s.objects[rest]!).toMatchObject({ zone: "battlefield", controller: ap });
  });

  it("Gix's ability on an opponent's turn: lands can't be played", () => {
    const { s: s0, ap, opp, ids } = setup([ponder]);
    const g = putOnBattlefield(s0, ap, gix);
    putOnBattlefield(s0, ap, swamp);
    toZone(s0, opp, shockland, "library");
    s0.players[ap]!.landsPlayedThisTurn = 1;
    let s = passAll(run(s0, planActivate(s0, ap, g, 0, [{ kind: "player", id: opp }], undefined, undefined, 1, { discard: ids })));
    // No land play left: nothing to choose.
    expect(s.pending).toBeNull();
  });
});

describe("Grist, the Hunger Tide", () => {
  it("parse; it can be a commander", () => {
    supported(grist);
    expect(canBeCommander(grist)).toBe(true);
  });

  it("is a 1/1 Insect creature card off the battlefield, only a planeswalker on it", () => {
    const { s, ap, ids } = setup([grist]);
    const inHand = s.objects[ids[0]!]!;
    expect(defOf(s, inHand).types).toEqual(["Planeswalker", "Creature"]);
    expect(defOf(s, inHand).subtypes).toEqual(["Grist", "Insect"]);
    expect(characteristics(s, inHand).power).toBe(1);
    const g = putOnBattlefield(s, ap, grist);
    expect(objIsType(s, s.objects[g]!, "Creature")).toBe(false);
    expect(characteristics(s, s.objects[g]!).subtypes).toEqual(["Grist"]);
  });

  it("+1: an Insect token and a mill, again for each Insect card milled, with a loyalty counter each time", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, grist);
    s0.objects[g]!.counters.loyalty = 3;
    // From the top: an Insect card, another Grist (an Insect card in the library), then a land.
    toZone(s0, ap, card("Test Land", "Land"), "library");
    toZone(s0, ap, grist, "library");
    toZone(s0, ap, card("Test Beetle", "Creature — Insect", "{G}", { power: "1", toughness: "1" }), "library");
    const s = passAll(run(s0, planActivate(s0, ap, g, 0)));
    const insects = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Insect"));
    expect(insects.length).toBe(3);
    expect(s.players[ap]!.graveyard.length).toBe(3);
    expect(s.objects[g]!.counters.loyalty).toBe(3 + 1 + 2);
  });

  it("−5: Grist itself counts as a creature card in the graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, grist);
    s0.objects[g]!.counters.loyalty = 6;
    toZone(s0, ap, grist, "graveyard");
    toZone(s0, ap, bear(), "graveyard");
    const s = passAll(run(s0, planActivate(s0, ap, g, 2)));
    expect(s.players[opp]!.life).toBe(38);
  });
});

describe("Sunforger", () => {
  it("parse", () => supported(sunforger));

  it("unattach it: find a red or white instant with mana value 4 or less and cast it from the library for free", () => {
    const { s: s0, ap, opp } = setup([]);
    const sf = putOnBattlefield(s0, ap, sunforger);
    const b = putOnBattlefield(s0, ap, bear());
    const bolt = toZone(s0, ap, card("Test Bolt", "Instant", "{3}{R}", { oracleText: "Test Bolt deals 3 damage to any target." }), "library");
    const big = toZone(s0, ap, card("Big Bolt", "Instant", "{4}{R}", { oracleText: "Big Bolt deals 5 damage to any target." }), "library");
    toZone(s0, ap, card("Blue Draw", "Instant", "{U}", { oracleText: "Draw a card." }), "library");
    // Not attached: it can't be activated.
    expect(planActivate(s0, ap, sf, 0)).toBeNull();
    s0.objects[sf]!.attachedTo = b;
    let s = passAll(run(s0, planActivate(s0, ap, sf, 0)));
    expect(s.objects[sf]!.attachedTo).toBeUndefined();
    expect(s.pending).toMatchObject({ kind: "searchLibrary", cards: [bolt] });
    expect(big).toBeDefined();
    s = act(s, { type: "searchLibrary", player: ap, found: [bolt] });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: bolt });
    expect(s.objects[bolt]!.zone).toBe("library");
    s = act(s, { type: "castSpell", player: ap, objectId: bolt, targets: [{ kind: "player", id: opp }] });
    s = passAll(passAll(s));
    expect(s.players[opp]!.life).toBe(37);
    expect(s.objects[bolt]!.zone).toBe("graveyard");
  });
});

describe("Arixmethes, Slumbering Isle", () => {
  it("parse", () => supported(arixmethes));

  it("a legendary land while it has a slumber counter; a 12/12 Kraken creature once the last one is gone", () => {
    const { s: s0, ap, ids } = setup([opt, opt]);
    const a = putOnBattlefield(s0, ap, arixmethes);
    s0.objects[a]!.counters.slumber = 2;
    invalidateCharacteristics(s0);
    const c = () => characteristics(s0, s0.objects[a]!);
    expect(c().types).toEqual(["Land"]);
    expect(c().subtypes).toEqual([]);
    expect(c().supertypes).toEqual(["Legendary"]);
    expect(c().colors).toEqual(["G", "U"]);
    let s = s0;
    for (const id of ids) {
      s = passAll(run(s, planCast(s, ap, id)));
      expect(s.pending?.kind).toBe("chooseMay");
      s = passAll(passAll(act(s, { type: "chooseMay", player: ap, yes: true })));
    }
    expect(s.objects[a]!.counters.slumber ?? 0).toBe(0);
    expect(characteristics(s, s.objects[a]!).types).toEqual(["Creature"]);
    expect(characteristics(s, s.objects[a]!).subtypes).toEqual(["Kraken"]);
    expect(characteristics(s, s.objects[a]!).power).toBe(12);
  });
});
