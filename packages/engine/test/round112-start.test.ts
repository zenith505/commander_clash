// Round 112, the most played cards left. First the bots' side of Gix, Yawgmoth Praetor (its "Discard X cards" ability
// and the shock land played from among the cards it exiled).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, passUntil, pt, putOnBattlefield, setup, swamp } from "./helpers";
import { botActions, characteristics, compileCard, isFullySupported, manaAbilitiesOn, manaValue, spellCost, planActivate, waitingOn, type Action, type CardDef, type GameObject, type GameState, type PlayerId } from "../src";

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
