// Round 112, the most played cards left. First the bots' side of Gix, Yawgmoth Praetor (its "Discard X cards" ability
// and the shock land played from among the cards it exiled).

import { describe, expect, it } from "vitest";
import { act, activate, addEffect, bear, card, cast, passAll, passUntil, pt, putOnBattlefield, setup, swamp } from "./helpers";
import { isLegalTarget, legalTargets, sourceQuality, spellQuality } from "../src/effects/targeting";
import { botActions, characteristics, planCast, compileCard, controllerOf, isFullySupported, manaAbilitiesOn, manaValue, spellCost, planActivate, waitingOn, type Action, type CardDef, type GameObject, type GameState, type PlayerId } from "../src";

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
const anvil = card("Semblance Anvil", "Artifact", "{3}", {
  oracleText: "Imprint — When this artifact enters, you may exile a nonland card from your hand.\nSpells you cast that share a card type with the exiled card cost {2} less to cast.",
});
const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const artifactCreature = card("Steel Overseer", "Artifact Creature — Construct", "{2}", { power: "1", toughness: "1" });
const ogre = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
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

/** What casting it costs in all: its colored mana and the generic mana (CR 601.2f). */
const total = (s: GameState, pid: PlayerId, o: GameObject) => {
  const c = spellCost(s, pid, o);
  return manaValue(c.cost) + c.extra;
};

describe("Semblance Anvil", () => {
  it("parse", () => expect(isFullySupported(anvil)).toBe(true));

  it("imprints a creature card: creature spells cost {2} less, an artifact creature too, an instant not, and never colored mana", () => {
    const { s: s0, ap, ids } = setup([anvil, bear(), ogre, artifactCreature, bolt]);
    const [a, bearId, ogreId, steel, boltId] = ids as [string, string, string, string, string];
    onlyInHand(s0, ap, ids);
    let s = passAll(cast(s0, ap, a));
    for (let i = 0; i < 6 && s.pending?.kind !== "searchLibrary"; i++) {
      if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: true });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    // Any nonland card from the hand.
    expect((s.pending as { cards: string[] }).cards.sort()).toEqual([bearId, ogreId, steel, boltId].sort());
    s = passAll(act(s, { type: "searchLibrary", player: ap, found: [bearId] }));
    expect(s.objects[bearId]!.zone).toBe("exile");
    expect(total(s, ap, s.objects[ogreId]!)).toBe(2); // {3}{R} -> {1}{R}
    expect(total(s, ap, s.objects[steel]!)).toBe(0); // shares Creature
    expect(total(s, ap, s.objects[boltId]!)).toBe(1); // {R}: no creature, and no colored mana off
    // An opponent's spells aren't affected.
    const opp = s.turnOrder.find((p) => p !== ap)!;
    const theirs = putOnBattlefield(s, opp, ogre);
    s.objects[theirs]!.zone = "hand";
    s.battlefield.splice(s.battlefield.indexOf(theirs), 1);
    s.players[opp]!.hand.push(theirs);
    expect(total(s, opp, s.objects[theirs]!)).toBe(4);
  });

  it("imprints an instant: instants cost {2} less (but not below their colored mana); with nothing exiled, nothing", () => {
    const { s: s0, ap, ids } = setup([bolt, shock]);
    const anv = putOnBattlefield(s0, ap, anvil);
    expect(manaValue(spellCost(s0, ap, s0.objects[ids[1]!]!).cost)).toBe(1);
    // Exiled with it, linked (CR 607.2a).
    const key = `${anv}@${s0.objects[anv]!.zoneChanges ?? 0}`;
    s0.objects[ids[0]!]!.zone = "exile";
    s0.players[ap]!.hand = s0.players[ap]!.hand.filter((x) => x !== ids[0]);
    s0.players[ap]!.exile.push(ids[0]!);
    s0.linkedExile = { [key]: [{ id: ids[0]!, zc: s0.objects[ids[0]!]!.zoneChanges ?? 0 }] };
    expect(manaValue(spellCost(s0, ap, s0.objects[ids[1]!]!).cost)).toBe(1);
    const ogreId = putOnBattlefield(s0, ap, card("Brute Force", "Instant", "{3}{R}", { oracleText: "Target creature gets +3/+3 until end of turn." }));
    s0.objects[ogreId]!.zone = "hand";
    s0.battlefield.splice(s0.battlefield.indexOf(ogreId), 1);
    s0.players[ap]!.hand.push(ogreId);
    expect(total(s0, ap, s0.objects[ogreId]!)).toBe(2);
  });
});

const selvala = card("Selvala, Explorer Returned", "Legendary Creature — Elf Scout", "{1}{G}{W}", {
  power: "2",
  toughness: "4",
  oracleText:
    "Parley — {T}: Each player reveals the top card of their library. For each nonland card revealed this way, add {G} and you gain 1 life. Then each player draws a card. (Activate only as an instant.)",
});
const woodvine = card("Woodvine Elemental", "Creature — Elemental", "{4}{G}{W}", {
  power: "4",
  toughness: "4",
  keywords: ["Trample"],
  oracleText:
    "Trample\nParley — Whenever this creature attacks, each player reveals the top card of their library. For each nonland card revealed this way, attacking creatures you control get +1/+1 until end of turn. Then each player draws a card.",
});
const phabine = card("Phabine, Boss's Confidant", "Legendary Creature — Cat Advisor", "{3}{R}{G}{W}", {
  power: "3",
  toughness: "6",
  oracleText:
    "Creature tokens you control have haste.\nParley — At the beginning of combat on your turn, each player reveals the top card of their library. For each land card revealed this way, you create a 1/1 green and white Citizen creature token. Then creatures you control get +1/+1 until end of turn for each nonland card revealed this way. Then each player draws a card.",
});
const negotiator = card("Cutthroat Negotiator", "Creature — Orc Pirate", "{2}{U}{R}", {
  power: "4",
  toughness: "3",
  oracleText:
    "Parley — Whenever this creature attacks, each player reveals the top card of their library. For each nonland card revealed this way, you create a tapped Treasure token. Then each player draws a card.",
});

/** Declare these attackers at the next player. */
const attackWith = (s: GameState, ap: PlayerId, attackers: string[]) => {
  const defender = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % s.turnOrder.length]!;
  while (s.pending?.kind !== "declareAttackers") s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender })) });
};

/** The top of each player's library, in turn order from `ap`: a land (true) or a nonland card (false). */
const tops = (s: GameState, ap: PlayerId, lands: boolean[]) => {
  const order = [...s.turnOrder.slice(s.turnOrder.indexOf(ap)), ...s.turnOrder.slice(0, s.turnOrder.indexOf(ap))];
  return order.map((pid, i) => toZone(s, pid, lands[i] ? swamp : bear({ name: `Top Bear ${i}` }), "library"));
};

describe("parley", () => {
  it("parse", () => {
    for (const d of [selvala, woodvine, phabine, negotiator]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Selvala: {G} and 1 life for each nonland card revealed, then each player draws the card they revealed; not a mana ability", () => {
    const { s: s0, ap } = setup([]);
    const sel = putOnBattlefield(s0, ap, selvala);
    const top = tops(s0, ap, [false, true, false, false]);
    const hands = s0.turnOrder.map((p) => s0.players[p]!.hand.length);
    let s = act(s0, { type: "activateAbility", player: ap, objectId: sel, index: 0 } as Action);
    // It uses the stack (rulings: not a mana ability).
    expect(s.stack).toHaveLength(1);
    s = passAll(s);
    expect(s.players[ap]!.manaPool.G).toBe(3);
    expect(s.players[ap]!.life).toBe(43);
    expect(s.turnOrder.map((p) => s.players[p]!.hand.length)).toEqual(hands.map((n) => n + 1));
    for (const id of top) expect(s.objects[id]!.zone).toBe("hand");
    expect(s.log.slice(-12).filter((l) => / reveals .* from the top of their library\./.test(l.text))).toHaveLength(4);
  });

  it("Cutthroat Negotiator: a tapped Treasure for each nonland card", () => {
    const { s: s0, ap } = setup([]);
    const neg = putOnBattlefield(s0, ap, negotiator);
    tops(s0, ap, [true, false, true, false]);
    let s = attackWith(s0, ap, [neg]);
    s = passAll(s);
    const treasures = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Treasure"));
    expect(treasures).toHaveLength(2);
    expect(treasures.every((id) => s.objects[id]!.tapped)).toBe(true);
  });

  it("Woodvine Elemental: attacking creatures get +1/+1 for each nonland card, for the rest of the turn", () => {
    const { s: s0, ap } = setup([]);
    const wood = putOnBattlefield(s0, ap, woodvine);
    const other = putOnBattlefield(s0, ap, bear());
    const home = putOnBattlefield(s0, ap, bear({ name: "Home Bear" }));
    tops(s0, ap, [false, false, true, false]);
    let s = attackWith(s0, ap, [wood, other]);
    s = passAll(s);
    expect([wood, other, home].map((id) => pt(s, id))).toEqual(["7/7", "5/5", "2/2"]);
    // The revealed cards were drawn; the bonus stays (CR 608.2h: the number is locked in as it resolves).
    expect(s.resolving).toBeNull();
    expect(pt(s, wood)).toBe("7/7");
  });

  it("Phabine: a Citizen for each land card, then creatures you control (the new ones too) get +1/+1 for each nonland card", () => {
    const { s: s0, ap } = setup([]);
    const ph = putOnBattlefield(s0, ap, phabine);
    tops(s0, ap, [true, true, false, true]);
    let s = s0;
    for (let i = 0; i < 200 && !(s.step === "beginCombat" && s.stack.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = passAll(s);
    const citizens = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Citizen"));
    expect(citizens).toHaveLength(3);
    expect(citizens.map((id) => pt(s, id))).toEqual(["2/2", "2/2", "2/2"]);
    expect(pt(s, ph)).toBe("4/7");
  });
});

const nissa = card("Nissa, Resurgent Animist", "Legendary Creature — Elf Scout", "{2}{G}", {
  power: "3",
  toughness: "3",
  oracleText:
    "Landfall — Whenever a land you control enters, add one mana of any color. Then if this is the second time this ability has resolved this turn, reveal cards from the top of your library until you reveal an Elf or Elemental card. Put that card into your hand and the rest on the bottom of your library in a random order.",
});

describe("Nissa, Resurgent Animist", () => {
  it("parse", () => expect(isFullySupported(nissa)).toBe(true));

  it("each land: one mana of any color; the second time this turn also an Elf or Elemental card from the library; the third, only mana", () => {
    const { s: s0, ap, ids } = setup([swamp, swamp, swamp]);
    putOnBattlefield(s0, ap, nissa);
    const elf = toZone(s0, ap, card("Llanowar Elves", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1" }), "library");
    const misses = [toZone(s0, ap, bear({ name: "Miss One" }), "library"), toZone(s0, ap, swamp, "library")];
    const landfall = (s: GameState, land: string, color: string) => {
      s.players[ap]!.landsPlayedThisTurn = 0;
      s = act(s, { type: "playLand", player: ap, objectId: land });
      s = passAll(s);
      expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap });
      return act(s, { type: "chooseOption", player: ap, choice: color });
    };
    let s = landfall(s0, ids[0]!, "Green");
    expect(s.players[ap]!.manaPool.G).toBe(1);
    expect(s.objects[elf]!.zone).toBe("library");
    s = landfall(s, ids[1]!, "Blue");
    expect(s.players[ap]!.manaPool.U).toBe(1);
    // The second time: the cards above the Elf go to the bottom, the Elf into the hand.
    expect(s.objects[elf]!.zone).toBe("hand");
    const lib = s.players[ap]!.library;
    expect(misses.every((id) => lib.slice(-2).includes(id))).toBe(true);
    const hand = s.players[ap]!.hand.length;
    s = landfall(s, ids[2]!, "Red");
    expect(s.players[ap]!.manaPool.R).toBe(1);
    expect(s.players[ap]!.hand.length).toBe(hand - 1); // the land played, nothing drawn
  });
});

const thrasher = card("Party Thrasher", "Creature — Lizard Wizard", "{1}{R}", {
  power: "1",
  toughness: "4",
  oracleText:
    "Noncreature spells you cast from exile have convoke. (Each creature you tap while casting a noncreature spell from exile pays for {1} or one mana of that creature's color.)\nAt the beginning of your first main phase, you may discard a card. If you do, exile the top two cards of your library, then choose one of them. You may play that card this turn.",
});
const channeler = card("Magmatic Channeler", "Creature — Human Wizard", "{1}{R}", {
  power: "1",
  toughness: "3",
  oracleText:
    "As long as there are four or more instant and/or sorcery cards in your graveyard, Magmatic Channeler gets +3/+1.\n{T}, Discard a card: Exile the top two cards of your library, then choose one of them. You may play that card this turn.",
});
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });

describe("Party Thrasher", () => {
  it("parse", () => {
    expect(isFullySupported(thrasher)).toBe(true);
    expect(compileCard(channeler).activated[0]!.body.effects).toEqual([{ type: "impulse", n: 2, until: "thisTurn", choose: true }]);
  });

  it("first main phase: discard, exile the top two, choose one; only that one may be played, this turn", () => {
    const { s: s0, ap, ids } = setup([bolt]);
    putOnBattlefield(s0, ap, thrasher);
    let s = passUntil(s0, "upkeep", ap);
    // The cards on top as the trigger resolves (after the draw step's draw).
    for (let i = 0; i < 50 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.step).toBe("main1");
    const second = toZone(s, ap, divination, "library");
    const first = toZone(s, ap, swamp, "library");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "discard", player: ap });
    s = act(s, { type: "discard", player: ap, objectIds: [ids[0]!] });
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "impulseChoice", options: [first, second], labels: ["Swamp", "Divination"] });
    s = act(s, { type: "chooseOption", player: ap, choice: second });
    expect([first, second].map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile"]);
    expect(s.objects[second]!.mayPlay).toMatchObject({ player: ap, until: "thisTurn" });
    expect(s.objects[first]!.mayPlay).toBeUndefined();
    // The chosen sorcery is cast from exile with convoke: two creatures tapped and {U} paid.
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap && !characteristics(s, s.objects[id]!).types.includes("Creature")) s.objects[id]!.tapped = true;
    const islandId = putOnBattlefield(s, ap, card("Island", "Basic Land — Island"));
    const crew = [putOnBattlefield(s, ap, bear({ name: "Helper One" })), putOnBattlefield(s, ap, bear({ name: "Helper Two" }))];
    s = act(s, { type: "activateMana", player: ap, objectId: islandId, mana: "U" } as Action);
    s = act(s, { type: "castSpell", player: ap, objectId: second, convoke: crew } as Action);
    expect(s.stack.at(-1)?.objectId).toBe(second);
    expect(crew.every((id) => s.objects[id]!.tapped)).toBe(true);
  });

  it("a creature spell cast from exile doesn't get convoke", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, thrasher);
    const giant = toZone(s0, ap, ogre, "library");
    s0.players[ap]!.library = s0.players[ap]!.library.filter((x) => x !== giant);
    s0.objects[giant]!.zone = "exile";
    s0.players[ap]!.exile.push(giant);
    s0.objects[giant]!.mayPlay = { player: ap, zc: s0.objects[giant]!.zoneChanges ?? 0, until: "thisTurn", turn: s0.turn };
    const crew = [putOnBattlefield(s0, ap, bear({ name: "Helper One" }))];
    expect(() => act(s0, { type: "castSpell", player: ap, objectId: giant, convoke: crew } as Action)).toThrow(/convoke/);
  });

  it("a bot discards, then picks the card it can use", () => {
    const { s: s0, ap } = setup([bolt]);
    putOnBattlefield(s0, ap, thrasher);
    let s = passUntil(s0, "upkeep", ap);
    for (let i = 0; i < 50 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const second = toZone(s, ap, divination, "library");
    toZone(s, ap, card("Colossal Dreadmaw", "Creature — Dinosaur", "{4}{G}{G}{G}{G}{G}{G}{G}{G}{G}{G}{G}{G}", { power: "6", toughness: "6" }), "library");
    for (let i = 0; i < 6 && s.pending; i++) for (const a of botActions(s, waitingOn(s)!)) s = act(s, a);
    expect(s.objects[second]!.mayPlay).toMatchObject({ player: ap });
  });
});

const meriadoc = card("Meriadoc Brandybuck", "Legendary Creature — Halfling Citizen", "{1}{G}", {
  power: "2",
  toughness: "2",
  oracleText: "Whenever one or more Halflings you control attack a player, create a Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")",
});
const attuma = card("Attuma, Atlantean Warlord", "Legendary Creature — Merfolk Warrior Villain", "{2}{U}{U}", {
  power: "3",
  toughness: "4",
  oracleText: "Other Merfolk you control get +1/+1.\nWhenever one or more Merfolk you control attack a player, draw a card.",
});
const cowl = card("Crimson Cowl, Master of Evil", "Legendary Creature — Human Villain", "{2}{B}", {
  power: "1",
  toughness: "3",
  oracleText: "Whenever one or more nontoken Villains you control attack a player, you create a 2/1 black Villain creature token with menace. (It can't be blocked except by two or more creatures.)",
});
const halfling = (name: string) => card(name, "Creature — Halfling", "{G}", { power: "1", toughness: "1" });

describe("whenever one or more creatures you control attack a player", () => {
  it("parse: Meriadoc, Attuma and Crimson Cowl trigger once for each player attacked", () => {
    for (const d of [meriadoc, attuma, cowl]) {
      expect(isFullySupported(d), d.name).toBe(true);
      expect(compileCard(d).triggers.at(-1)).toMatchObject({ event: "creaturesYouControlAttack", perPlayer: true });
    }
  });

  it("Meriadoc: Halflings attacking two players make two Food, however many attack each; another creature type doesn't count", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, meriadoc);
    const h1 = putOnBattlefield(s0, ap, halfling("Halfling One"));
    const h2 = putOnBattlefield(s0, ap, halfling("Halfling Two"));
    const other = putOnBattlefield(s0, ap, bear());
    const [p1, p2, p3] = s0.turnOrder.filter((p) => p !== ap) as [PlayerId, PlayerId, PlayerId];
    let s = s0;
    while (s.pending?.kind !== "declareAttackers") s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: m, defender: p1 }, { attacker: h1, defender: p1 }, { attacker: h2, defender: p2 }, { attacker: other, defender: p3 }] });
    s = passAll(passAll(s));
    const food = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Food"));
    expect(food).toHaveLength(2);
  });

  it("Attuma: one card for each player Merfolk attack", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, attuma);
    const merfolk = putOnBattlefield(s0, ap, card("Merfolk Trickster", "Creature — Merfolk Wizard", "{U}{U}", { power: "2", toughness: "2" }));
    const [p1, p2] = s0.turnOrder.filter((p) => p !== ap) as [PlayerId, PlayerId];
    const hand = s0.players[ap]!.hand.length;
    let s = s0;
    while (s.pending?.kind !== "declareAttackers") s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: p1 }, { attacker: merfolk, defender: p2 }] });
    s = passAll(passAll(s));
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });
});

const stormdrake = card("Volatile Stormdrake", "Creature — Drake", "{1}{U}", {
  power: "3",
  toughness: "2",
  keywords: ["Flying", "Hexproof from"],
  oracleText:
    "Flying, hexproof from activated and triggered abilities\nWhen this creature enters, exchange control of this creature and target creature an opponent controls. If you do, you get {E}{E}{E}{E}, then sacrifice that creature unless you pay an amount of {E} equal to its mana value.",
});

describe("Volatile Stormdrake", () => {
  const enter = (big = false) => {
    const { s: s0, ap, opp, ids } = setup([stormdrake]);
    const theirs = putOnBattlefield(s0, opp, big ? card("Craw Wurm", "Creature — Wurm", "{4}{G}{G}", { power: "6", toughness: "4" }) : bear());
    let s = passAll(cast(s0, ap, ids[0]!));
    // The enters trigger: its target.
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: theirs }] } as Action);
    return { s, ap, opp, drake: ids[0]!, theirs };
  };

  it("parse; hexproof from activated and triggered abilities", () => {
    expect(isFullySupported(stormdrake)).toBe(true);
  });

  it("exchanges control, gives four energy, and you pay the creature's mana value in energy to keep it", () => {
    let { s, ap, opp, drake, theirs } = enter();
    s = passAll(s);
    expect(controllerOf(s, s.objects[drake]!)).toBe(opp);
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, pay: { energy: 2 } });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.players[ap]!.energy).toBe(2);
    expect(s.objects[theirs]!.zone).toBe("battlefield");
  });

  it("not paying, or not having enough energy, sacrifices it", () => {
    let { s, ap, theirs } = enter();
    s = act(passAll(s), { type: "chooseMay", player: ap, yes: false });
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.players[ap]!.energy).toBe(4);
    const big = enter(true);
    s = passAll(big.s);
    // Mana value 6, four energy: it can't be paid, so it's sacrificed without asking.
    expect(s.pending?.kind).not.toBe("chooseMay");
    expect(s.objects[big.theirs]!.zone).toBe("graveyard");
    expect(s.players[big.ap]!.energy).toBe(4);
  });

  it("with the Stormdrake gone before the trigger resolves, nothing happens: no exchange, no energy", () => {
    let { s, ap, drake, theirs, opp } = enter();
    const o = s.objects[drake]!;
    s.battlefield.splice(s.battlefield.indexOf(drake), 1);
    o.zone = "graveyard";
    o.zoneChanges = (o.zoneChanges ?? 0) + 1;
    s.players[ap]!.graveyard.push(drake);
    s = passAll(s);
    expect(controllerOf(s, s.objects[theirs]!)).toBe(opp);
    expect(s.players[ap]!.energy ?? 0).toBe(0);
  });

  it("can't be the target of an opponent's activated or triggered abilities, but can be of their spells", () => {
    const { s, opp } = setup([]);
    const drake = putOnBattlefield(s, s.activePlayer, stormdrake);
    const pinger = putOnBattlefield(s, opp, card("Prodigal Pyromancer", "Creature — Human Wizard", "{2}{R}", { power: "1", toughness: "1", oracleText: "{T}: Prodigal Pyromancer deals 1 damage to any target." }));
    const spec = { kind: "object" as const, types: ["Creature"], notTypes: [], notColors: [], text: "creature" };
    const ability = legalTargets(s, spec, opp, undefined, sourceQuality(s, pinger), pinger).map((t) => (t as { id: string }).id);
    expect(ability).not.toContain(drake);
    const spell = legalTargets(s, spec, opp, undefined, spellQuality(s, bolt.oracleId)).map((t) => (t as { id: string }).id);
    expect(spell).toContain(drake);
    // Its controller's own abilities can.
    expect(legalTargets(s, spec, s.activePlayer, undefined, sourceQuality(s, pinger), pinger).map((t) => (t as { id: string }).id)).toContain(drake);
  });
});

const weaver = card("Weaver of Harmony", "Enchantment Creature — Human Druid", "{1}{G}", {
  power: "1",
  toughness: "1",
  oracleText: "Other enchantment creatures you control get +1/+1.\n{G}, {T}: Copy target activated or triggered ability you control from an enchantment source. You may choose new targets for the copy. (Mana abilities can't be targeted.)",
});
const archaic = card("Abstruse Archaic", "Creature — Eldrazi", "{4}{U}", {
  power: "3",
  toughness: "5",
  oracleText: "Vigilance\n{1}, {T}: Copy target activated or triggered ability you control from a colorless source. You may choose new targets for the copy. (Mana abilities can't be targeted.)",
});
const echo = card("Echo, Perceptive Prodigy", "Legendary Creature — Human Wizard", "{1}{U}", {
  power: "1",
  toughness: "3",
  oracleText: "Vigilance\n{1}, {T}: Copy target activated or triggered ability you control from a creature source. You may choose new targets for the copy. (Mana abilities can't be targeted.)",
});

describe("copy target ability from a kind of source (Weaver of Harmony, Abstruse Archaic)", () => {
  const abilityOn = (s: GameState, pid: PlayerId, src: string) => {
    const o = s.objects[src]!;
    const item = { id: `st${s.nextId++}`, kind: "ability" as const, triggered: true as const, sourceId: src, sourceCardId: o.cardId, sourceZc: o.zoneChanges ?? 0, controller: pid, description: "test trigger" };
    s.stack.push(item);
    return item.id;
  };
  const spec = (def: CardDef) => compileCard(def).activated.find((a) => a.body.targets.length)!.body.targets[0]!;

  it("parse", () => {
    for (const d of [weaver, archaic, echo]) expect(isFullySupported(d), d.name).toBe(true);
    expect(spec(weaver).abilityFrom).toEqual({ types: ["Enchantment"] });
    expect(spec(archaic).abilityFrom).toEqual({ colorless: true });
  });

  it("Weaver of Harmony can target an enchantment's ability, not a creature's", () => {
    const { s, ap, opp } = setup([]);
    const ench = putOnBattlefield(s, ap, card("Test Aura Shrine", "Enchantment", "{1}{W}", {}));
    const crit = putOnBattlefield(s, ap, ogre);
    const fromEnch = abilityOn(s, ap, ench);
    const fromCrit = abilityOn(s, ap, crit);
    const theirs = abilityOn(s, opp, putOnBattlefield(s, opp, card("Their Shrine", "Enchantment", "{1}{W}", {})));
    const ok = (id: string) => isLegalTarget(s, spec(weaver), { kind: "stack", id }, ap);
    expect(ok(fromEnch)).toBe(true);
    expect(ok(fromCrit)).toBe(false);
    expect(ok(theirs)).toBe(false); // "you control"
  });

  it("the source's characteristics as they are now count (CR 113.7a, 613)", () => {
    const { s, ap } = setup([]);
    const crit = putOnBattlefield(s, ap, ogre);
    const id = abilityOn(s, ap, crit);
    expect(isLegalTarget(s, spec(weaver), { kind: "stack", id }, ap)).toBe(false);
    addEffect(s, ap, [crit], [{ kind: "addTypes", types: ["Enchantment"], subtypes: [] }]);
    expect(isLegalTarget(s, spec(weaver), { kind: "stack", id }, ap)).toBe(true);
    // A colorless artifact's ability for Abstruse Archaic; red Hill Giant's isn't.
    const art = putOnBattlefield(s, ap, artifactCreature);
    expect(isLegalTarget(s, spec(archaic), { kind: "stack", id: abilityOn(s, ap, art) }, ap)).toBe(true);
    expect(isLegalTarget(s, spec(archaic), { kind: "stack", id }, ap)).toBe(false);
  });

  it("an ability with no source (the monarch's) can't be targeted", () => {
    const { s, ap } = setup([]);
    s.stack.push({ id: "mon", kind: "ability", triggered: true, sourceId: "", sourceCardId: "monarch", controller: ap, description: "monarch" } as GameState["stack"][number]);
    expect(isLegalTarget(s, spec(archaic), { kind: "stack", id: "mon" }, ap)).toBe(false);
  });

  it("copies an enchantment creature's enters trigger", () => {
    const { s: s0, ap, ids } = setup([card("Test Nymph", "Enchantment Creature — Nymph", "{1}{W}", { power: "2", toughness: "2", oracleText: "When this creature enters, you gain 3 life." })]);
    const w = putOnBattlefield(s0, ap, weaver);
    const life = s0.players[ap]!.life;
    let t = s0;
    for (const x of planCast(t, ap, ids[0]!)!) t = act(t, x);
    for (let i = 0; i < 12 && !t.stack.some((x) => x.kind === "ability"); i++) t = act(t, { type: "passPriority", player: waitingOn(t)! });
    const trig = t.stack.find((x) => x.kind === "ability")!;
    expect(trig).toBeTruthy();
    t = activate(t, ap, w, 0, [{ kind: "stack", id: trig.id }]);
    for (let i = 0; i < 12 && t.stack.length; i++) t = passAll(t);
    expect(t.players[ap]!.life).toBe(life + 6);
  });
});
