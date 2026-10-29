// Lane B, round 38: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, moveObject, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, wardCosts, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty, answering choices as the bots would; the choices a test makes stop it. */
const settle = (s: GameState, stopAt: (s: GameState) => boolean = () => false) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (stopAt(s)) break;
    const p = s.pending;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Plays on (no attacks or blocks unless asked, the bots answering other questions) until `stop`. */
const goUntil = (s: GameState, stop: (s: GameState) => boolean) => {
  for (let i = 0; i < 3000; i++) {
    if (stop(s)) return s;
    const p = s.pending;
    const pid = waitingOn(s)!;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never got there");
};
const at = (kind: string, pid: PlayerId) => (s: GameState) => s.pending?.kind === kind && s.pending.player === pid;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}) => run(s, planCast(s, pid, id, targets, undefined, undefined, undefined, choices));
/** Moves a new card for `def` into `pid`'s hand, library (on top) or graveyard. */
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Passes to the declare attackers step of the active player's turn and declares `attackers` at `defender`; stops at the first question. */
const attackWith = (s: GameState, attackers: string[], defender: PlayerId) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  s = act(s, { type: "declareAttackers", player: s.activePlayer, attacks: attackers.map((attacker) => ({ attacker, defender })) });
  for (let i = 0; i < 50 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of s.players[pid]!.hand) s.objects[id]!.zone = "exile";
  s.players[pid]!.exile.push(...s.players[pid]!.hand);
  s.players[pid]!.hand = [];
};
/** Only lands left in `pid`'s library, so what a test puts on top is what's found. */
const landsOnly = (s: GameState, pid: PlayerId) => {
  const p = s.players[pid]!;
  p.library = p.library.filter((id) => characteristics(s, s.objects[id]!).types.includes("Land"));
};
const kws = (s: GameState, id: string, kw: string) => objHasKeyword(s, s.objects[id]!, kw);
const colorsOf = (s: GameState, id: string) => [...characteristics(s, s.objects[id]!).colors].sort();
const subtypesOf = (s: GameState, id: string) => characteristics(s, s.objects[id]!).subtypes;
const mine = (s: GameState, pid: PlayerId, sub: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && subtypesOf(s, id).includes(sub));

// Real oracle text (Scryfall).
const witheringWisps = () => card("Withering Wisps", "Enchantment", "{1}{B}{B}", { cmc: 3, colors: ["B"], oracleText: "At the beginning of the end step, if no creatures are on the battlefield, sacrifice this enchantment.\n{B}: This enchantment deals 1 damage to each creature and each player. Activate no more times each turn than the number of snow Swamps you control." });
const dralnusCrusade = () => card("Dralnu's Crusade", "Enchantment", "{1}{B}{R}", { cmc: 3, colors: ["B","R"], oracleText: "All Goblins get +1/+1.\nAll Goblins are black and are Zombies in addition to their other creature types." });
const enkira = () => card("Enkira, Hostile Scavenger", "Legendary Creature — Human Warrior", "{3}{B}{G}", { cmc: 5, colors: ["B","G"], power: "3", toughness: "3", oracleText: "When Enkira, Hostile Scavenger enters, create two Walker tokens. (They're 2/2 black Zombie creatures.)\nAs long as Enkira is equipped, it must be blocked if able.\nWhenever Enkira and at least two Zombies attack, Enkira gains indestructible until end of turn." });
const splittingThePowerstone = () => card("Splitting the Powerstone", "Sorcery", "{2}{U}", { cmc: 3, colors: ["U"], oracleText: "As an additional cost to cast this spell, sacrifice an artifact.\nCreate two tapped Powerstone tokens. If the sacrificed artifact was legendary, draw a card. (The tokens are artifacts with \"{T}: Add {C}. This mana can't be spent to cast a nonartifact spell.\")" });
const blessedReincarnation = () => card("Blessed Reincarnation", "Instant", "{3}{U}", { cmc: 4, colors: ["U"], keywords: ["Rebound"], oracleText: "Exile target creature an opponent controls. That player reveals cards from the top of their library until a creature card is revealed. The player puts that card onto the battlefield, then shuffles the rest into their library.\nRebound (If you cast this spell from your hand, exile it as it resolves. At the beginning of your next upkeep, you may cast this card from exile without paying its mana cost.)" });
const foster = () => card("Foster", "Enchantment", "{2}{G}{G}", { cmc: 4, colors: ["G"], oracleText: "Whenever a creature you control dies, you may pay {1}. If you do, reveal cards from the top of your library until you reveal a creature card. Put that card into your hand and the rest into your graveyard." });
const gigapede = () => card("Gigapede", "Creature — Insect", "{3}{G}{G}", { cmc: 5, colors: ["G"], power: "6", toughness: "1", keywords: ["Shroud"], oracleText: "Shroud (This creature can't be the target of spells or abilities.)\nAt the beginning of your upkeep, if this card is in your graveyard, you may discard a card. If you do, return this card to your hand." });
const treva = () => card("Treva, the Renewer", "Legendary Creature — Dragon", "{3}{G}{W}{U}", { cmc: 6, colors: ["G","U","W"], power: "6", toughness: "6", keywords: ["Flying"], oracleText: "Flying\nWhenever Treva deals combat damage to a player, you may pay {2}{W}. If you do, choose a color, then you gain 1 life for each permanent of that color." });
const alexWilder = () => card("Alex Wilder, Runaway", "Legendary Creature — Human Hero Villain", "{1}{R}", { cmc: 2, colors: ["R"], power: "1", toughness: "3", keywords: ["Escape"], oracleText: "Whenever Alex Wilder or another creature you control enters, if you cast it from anywhere other than your hand, it gets +2/+0 and gains haste until end of turn.\nEscape—{2}{R}, Exile three other cards from your graveyard. (You may cast this card from your graveyard for its escape cost.)" });
const stormTheCitadel = () => card("Storm the Citadel", "Sorcery", "{4}{G}", { cmc: 5, colors: ["G"], oracleText: "Until end of turn, creatures you control get +2/+2 and gain \"Whenever this creature deals combat damage to a player or planeswalker, destroy target artifact or enchantment defending player controls.\"" });
const undergrowth = () => card("Undergrowth", "Instant", "{G}", { cmc: 1, colors: ["G"], oracleText: "As an additional cost to cast this spell, you may pay {2}{R}.\nPrevent all combat damage that would be dealt this turn. If this spell's additional cost was paid, this effect doesn't affect combat damage that would be dealt by red creatures." });
const viviensInvocation = () => card("Vivien's Invocation", "Sorcery", "{5}{G}{G}", { cmc: 7, colors: ["G"], oracleText: "Look at the top seven cards of your library. You may put a creature card from among them onto the battlefield. Put the rest on the bottom of your library in a random order. When a creature is put onto the battlefield this way, it deals damage equal to its power to target creature an opponent controls." });
const outlawStitcher = () => card("Outlaw Stitcher", "Creature — Human Warlock", "{3}{U}", { cmc: 4, colors: ["U"], power: "1", toughness: "4", keywords: ["Plot"], oracleText: "When this creature enters, create a 2/2 blue and black Zombie Rogue creature token, then put two +1/+1 counters on that token for each spell you've cast this turn other than the first.\nPlot {4}{U} (You may pay {4}{U} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)" });
const spiderwoman = () => card("Spider-Woman, Secret Agent", "Legendary Creature — Spider Human Spy Hero", "{3}{W/U}", { cmc: 4, colors: ["U","W"], power: "1", toughness: "4", keywords: ["Flash"], oracleText: "Flash\nWhen Spider-Woman enters, tap target creature an opponent controls. That creature can't become untapped for as long as you control Spider-Woman." });
const deusOfCalamity = () => card("Deus of Calamity", "Creature — Spirit Avatar", "{R/G}{R/G}{R/G}{R/G}{R/G}", { cmc: 5, colors: ["G","R"], power: "6", toughness: "6", keywords: ["Trample"], oracleText: "Trample\nWhenever this creature deals 6 or more damage to an opponent, destroy target land that player controls." });
const dragonsDisciple = () => card("Dragon's Disciple", "Creature — Human Monk", "{1}{W}", { cmc: 2, colors: ["W"], power: "1", toughness: "3", oracleText: "As this creature enters, you may reveal a Dragon card from your hand. If you do or if you control a Dragon, this creature enters with a +1/+1 counter on it.\nDragons you control have ward {1}. (Whenever a Dragon you control becomes the target of a spell or ability an opponent controls, counter it unless that player pays {1}.)" });
const obscuraInterceptor = () => card("Obscura Interceptor", "Creature — Octopus Wizard", "{1}{W}{U}{B}", { cmc: 4, colors: ["B","U","W"], power: "3", toughness: "1", keywords: ["Lifelink","Flash","Connive"], oracleText: "Flash\nLifelink\nWhen this creature enters, it connives. When it connives this way, return up to one target spell to its owner's hand. (To have a creature connive, draw a card, then discard a card. If you discarded a nonland card, put a +1/+1 counter on that creature.)" });
const cloakedCadet = () => card("Cloaked Cadet", "Creature — Human Ranger", "{4}{G}", { cmc: 5, colors: ["G"], power: "2", toughness: "4", keywords: ["Training"], oracleText: "Training (Whenever this creature attacks with another creature with greater power, put a +1/+1 counter on this creature.)\nWhenever one or more +1/+1 counters are put on one or more Humans you control, draw a card. This ability triggers only once each turn." });
const enslavedHorror = () => card("Enslaved Horror", "Creature — Horror", "{3}{B}", { cmc: 4, colors: ["B"], power: "4", toughness: "4", oracleText: "When this creature enters, each other player may return a creature card from their graveyard to the battlefield." });
const loAndLi = () => card("Lo and Li, Royal Advisors", "Legendary Creature — Human Advisor", "{2}{B}{B}", { cmc: 4, colors: ["B"], power: "3", toughness: "3", keywords: ["Mill"], oracleText: "Whenever an opponent discards a card or mills one or more cards, put a +1/+1 counter on each Advisor you control.\n{2}{U/B}: Target player mills four cards. (They put the top four cards of their library into their graveyard.)" });
const chisei = () => card("Chisei, Heart of Oceans", "Legendary Creature — Spirit", "{2}{U}{U}", { cmc: 4, colors: ["U"], power: "4", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nAt the beginning of your upkeep, sacrifice Chisei unless you remove a counter from a permanent you control." });
const tokkaRahzar = () => card("Tokka & Rahzar, Terrible Twos", "Legendary Creature — Turtle Wolf Mutant", "{B/R}{B/R}", { cmc: 2, colors: ["B","R"], power: "3", toughness: "2", keywords: ["Menace"], oracleText: "This spell can't be countered.\nMenace\nWhenever a player casts a spell, if the amount of mana spent to cast it was less than its mana value, Tokka & Rahzar deal 3 damage to that player." });

const mindlockOrb = () => card("Mindlock Orb", "Artifact", "{3}{U}", { cmc: 4, colors: ["U"], oracleText: "Players can't search libraries." });
const psychicPickpocket = () => card("Psychic Pickpocket", "Creature — Octopus Rogue", "{4}{U}", { cmc: 5, colors: ["U"], power: "3", toughness: "2", keywords: ["Connive"], oracleText: "When this creature enters, it connives. When it connives this way, return up to one target nonland permanent to its owner's hand. (To have a creature connive, draw a card, then discard a card. If you discarded a nonland card, put a +1/+1 counter on that creature.)" });

const creature = (name: string, typeLine: string, cost: string, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, cost, { power: String(p), toughness: String(t), ...extra });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2, { cmc: 2, colors: ["G"] });
const hillGiant = () => creature("Hill Giant", "Creature — Giant", "{3}{R}", 3, 3, { cmc: 4, colors: ["R"] });
const goblin = () => creature("Goblin Piker", "Creature — Goblin Warrior", "{1}{R}", 2, 1, { cmc: 2, colors: ["R"] });
const whiteKnight = () => creature("White Knight", "Creature — Human Knight", "{W}{W}", 2, 2, { cmc: 2, colors: ["W"] });
const human = () => creature("Test Human", "Creature — Human Soldier", "{1}{W}", 2, 2, { cmc: 2, colors: ["W"] });
const dragon = () => creature("Test Dragon", "Creature — Dragon", "{4}{R}{R}", 5, 5, { cmc: 6, colors: ["R"], keywords: ["Flying"], oracleText: "Flying" });
const advisor = () => creature("Test Advisor", "Creature — Human Advisor", "{1}{U}", 1, 1, { cmc: 2, colors: ["U"] });
const demon = () => creature("Test Demon", "Creature — Demon", "{3}{B}", 4, 4, { cmc: 4, colors: ["B"] });
const snowSwamp = () => card("Snow-Covered Swamp", "Basic Snow Land — Swamp", "", { oracleText: "({T}: Add {B}.)" });
const escapee = () => creature("Test Escapee", "Creature — Human Rogue", "{1}{G}", 2, 2, { cmc: 2, colors: ["G"], keywords: ["Escape"], oracleText: "Escape—{1}{G}, Exile two other cards from your graveyard. (You may cast this card from your graveyard for its escape cost.)" });
const forestCard = () => card("Forest", "Basic Land — Forest");
const relic = () => card("Test Relic", "Legendary Artifact", "{1}", { cmc: 1 });
const trinket = () => card("Test Trinket", "Artifact", "{1}", { cmc: 1 });
const shrine = () => card("Test Shrine", "Enchantment", "{1}{W}", { cmc: 2, colors: ["W"] });
const murder = () => card("Murder", "Instant", "{1}{B}{B}", { cmc: 3, colors: ["B"], oracleText: "Destroy target creature." });
const study = () => card("Quick Study", "Sorcery", "{U}", { cmc: 1, colors: ["U"], oracleText: "Draw a card." });
const blessing = () => card("Test Blessing", "Sorcery", "{W}", { cmc: 1, colors: ["W"], oracleText: "Put a +1/+1 counter on each creature you control." });
const mindRot = () => card("Test Rot", "Sorcery", "{B}", { cmc: 1, colors: ["B"], oracleText: "Target player discards a card." });
const ramp = () => card("Ramp Test", "Sorcery", "{G}", { cmc: 1, colors: ["G"], oracleText: "Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle." });
const reducer = () => card("Test Reducer", "Artifact", "{2}", { cmc: 2, oracleText: "Creature spells you cast cost {1} less to cast." });

describe("Lane B round 38", () => {
  it("compiles every card fully", () => {
    supported(witheringWisps(), dralnusCrusade(), enkira(), splittingThePowerstone(), blessedReincarnation(), foster(), gigapede(), treva());
    supported(alexWilder(), stormTheCitadel(), undergrowth(), viviensInvocation(), outlawStitcher(), spiderwoman(), deusOfCalamity(), dragonsDisciple());
    supported(obscuraInterceptor(), cloakedCadet(), enslavedHorror(), loAndLi(), chisei(), tokkaRahzar(), psychicPickpocket());
    supported(mindlockOrb());
    supported(reducer(), blessing(), mindRot(), study(), escapee(), ramp());
  });
});

describe("Withering Wisps", () => {
  it("1 damage to each creature and each player, activated no more times each turn than your snow Swamps", () => {
    const { s: s0, ap, opp } = setup([]);
    const wisps = putOnBattlefield(s0, ap, witheringWisps());
    putOnBattlefield(s0, ap, snowSwamp());
    putOnBattlefield(s0, ap, snowSwamp());
    const giant = putOnBattlefield(s0, opp, hillGiant());
    let s = settle(run(s0, planActivate(s0, ap, wisps, 0)));
    expect([life(s, ap), life(s, opp), s.objects[giant]!.damage]).toEqual([39, 39, 1]);
    s = settle(run(s, planActivate(s, ap, wisps, 0)));
    expect([life(s, opp), s.objects[giant]!.damage]).toEqual([38, 2]);
    expect(planActivate(s, ap, wisps, 0)).toBeNull();
  });

  it("with no snow Swamps it can't be activated at all", () => {
    const { s, ap } = setup([]);
    const wisps = putOnBattlefield(s, ap, witheringWisps());
    expect(planActivate(s, ap, wisps, 0)).toBeNull();
  });

  it("is sacrificed at the beginning of an end step with no creatures on the battlefield, not with one", () => {
    const { s: s0, ap, opp } = setup([]);
    const wisps = putOnBattlefield(s0, ap, witheringWisps());
    const bear = putOnBattlefield(s0, opp, greenBear());
    let s = settle(passUntil(s0, "end", ap));
    expect(zone(s, wisps)).toBe("battlefield");
    s.objects[bear]!.zone = "graveyard";
    s.battlefield.splice(s.battlefield.indexOf(bear), 1);
    s.players[opp]!.graveyard.push(bear);
    invalidateCharacteristics(s);
    s = settle(passUntil(s, "end", opp));
    expect(zone(s, wisps)).toBe("graveyard");
  });
});

describe("Dralnu's Crusade", () => {
  it("Goblins get +1/+1, are black instead of their colors, and are Zombies too", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, dralnusCrusade());
    const gob = putOnBattlefield(s, opp, goblin());
    const bear = putOnBattlefield(s, opp, greenBear());
    expect([pt(s, gob), colorsOf(s, gob), subtypesOf(s, gob)]).toEqual(["3/2", ["B"], ["Goblin", "Warrior", "Zombie"]]);
    expect([pt(s, bear), colorsOf(s, bear), subtypesOf(s, bear)]).toEqual(["2/2", ["G"], ["Bear"]]);
  });
});

describe("Enkira, Hostile Scavenger", () => {
  const ready = () => {
    const { s: s0, ap, ids, opp } = setup([enkira()]);
    const s = settle(castNow(s0, ap, ids[0]!));
    const walkers = mine(s, ap, "Zombie");
    for (const id of [ids[0]!, ...walkers]) s.objects[id]!.controlledSinceTurn = -1;
    return { s, ap, opp, enk: ids[0]!, walkers };
  };
  it("enters with two 2/2 black Zombie Walker tokens; with them attacking too, it gains indestructible", () => {
    const { s: s0, opp, enk, walkers } = ready();
    expect(walkers.map((id) => [pt(s0, id), colorsOf(s0, id), s0.cards[s0.objects[id]!.cardId]!.name])).toEqual([
      ["2/2", ["B"], "Walker Token"],
      ["2/2", ["B"], "Walker Token"],
    ]);
    expect(kws(s0, enk, "Indestructible")).toBe(false);
    const s = settle(attackWith(s0, [enk, ...walkers], opp));
    expect(kws(s, enk, "Indestructible")).toBe(true);
  });

  it("with only one Zombie attacking with it, nothing", () => {
    const { s: s0, opp, enk, walkers } = ready();
    const s = settle(attackWith(s0, [enk, walkers[0]!], opp));
    expect(kws(s, enk, "Indestructible")).toBe(false);
  });
});

describe("Splitting the Powerstone", () => {
  for (const legendary of [true, false])
    it(`two tapped Powerstones; a card only if the sacrificed artifact was legendary (${legendary ? "it was" : "it wasn't"})`, () => {
      const { s: s0, ap, ids } = setup([splittingThePowerstone()]);
      const art = putOnBattlefield(s0, ap, legendary ? relic() : trinket());
      const hand = s0.players[ap]!.hand.length;
      const s = settle(castNow(s0, ap, ids[0]!, [], { sacrifice: [art] }));
      expect(zone(s, art)).toBe("graveyard");
      const stones = mine(s, ap, "Powerstone");
      expect(stones.map((id) => s.objects[id]!.tapped)).toEqual([true, true]);
      expect(s.players[ap]!.hand.length).toBe(hand - 1 + (legendary ? 1 : 0));
    });
});

describe("Blessed Reincarnation", () => {
  it("exiles the creature; its controller reveals until a creature card, puts it onto the battlefield, shuffles the rest in; rebound", () => {
    const { s: s0, ap, ids, opp } = setup([blessedReincarnation()]);
    const giant = putOnBattlefield(s0, opp, hillGiant());
    landsOnly(s0, opp);
    const bear = toZone(s0, opp, greenBear(), "library");
    const lands = [toZone(s0, opp, forestCard(), "library"), toZone(s0, opp, forestCard(), "library")];
    const size = s0.players[opp]!.library.length;
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(giant)]));
    expect([zone(s, giant), zone(s, bear), s.objects[bear]!.controller, zone(s, ids[0]!)]).toEqual(["exile", "battlefield", opp, "exile"]);
    expect(lands.map((id) => zone(s, id))).toEqual(["library", "library"]);
    expect(s.players[opp]!.library.length).toBe(size - 1);
  });
});

describe("Foster", () => {
  it("a creature of yours dies: pay {1} to reveal until a creature card, which goes to your hand and the rest to your graveyard", () => {
    const { s: s0, ap, ids } = setup([murder()]);
    putOnBattlefield(s0, ap, foster());
    const bear = putOnBattlefield(s0, ap, greenBear());
    landsOnly(s0, ap);
    const giant = toZone(s0, ap, hillGiant(), "library");
    const land = toZone(s0, ap, forestCard(), "library");
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(bear)]), at("chooseMay", ap));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 };
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect([zone(s, giant), zone(s, land), s.players[ap]!.manaPool.C]).toEqual(["hand", "graveyard", 0]);
  });

  it("not paying: nothing is revealed", () => {
    const { s: s0, ap, ids } = setup([murder()]);
    putOnBattlefield(s0, ap, foster());
    const bear = putOnBattlefield(s0, ap, greenBear());
    const top = s0.players[ap]!.library[0]!;
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(bear)]), at("chooseMay", ap));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.players[ap]!.library[0]).toBe(top);
  });
});

describe("Gigapede", () => {
  it("at your upkeep in your graveyard, you may discard a card to return it to your hand", () => {
    const { s: s0, ap } = setup([]);
    const pede = toZone(s0, ap, gigapede(), "graveyard");
    let s = goUntil(passUntil(s0, "end", ap), at("chooseMay", ap));
    expect(s.step).toBe("upkeep");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    if (s.pending?.kind === "discard") s = act(s, { type: "discard", player: ap, objectIds: [s.players[ap]!.hand[0]!] });
    s = settle(s);
    expect(zone(s, pede)).toBe("hand");
  });

  it("with no card to discard, it stays in the graveyard", () => {
    const { s: s0, ap } = setup([]);
    const pede = toZone(s0, ap, gigapede(), "graveyard");
    let s = passUntil(s0, "end", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 3) % 4]!);
    emptyHand(s, ap);
    s = goUntil(s, (x) => x.activePlayer === ap && x.step === "draw");
    expect(zone(s, pede)).toBe("graveyard");
  });
});

describe("Treva, the Renewer", () => {
  it("combat damage to a player: pay {2}{W} and choose a color to gain 1 life for each permanent of that color", () => {
    const { s: s0, ap, opp } = setup([]);
    const treva_ = putOnBattlefield(s0, ap, treva());
    putOnBattlefield(s0, ap, whiteKnight());
    putOnBattlefield(s0, opp, whiteKnight());
    putOnBattlefield(s0, opp, shrine());
    putOnBattlefield(s0, opp, greenBear());
    let s = goUntil(attackWith(s0, [treva_], opp), at("chooseMay", ap));
    const before = life(s, ap);
    s.players[ap]!.manaPool = { W: 1, U: 0, B: 0, R: 0, G: 0, C: 2 };
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s, at("chooseOption", ap));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "White" }));
    // Treva (green, white and blue), two White Knights and the white enchantment.
    expect(life(s, ap)).toBe(before + 4);
  });
});

describe("Alex Wilder, Runaway", () => {
  it("cast with escape from the graveyard, it gets +2/+0 and haste", () => {
    const { s: s0, ap } = setup([]);
    const alex = toZone(s0, ap, alexWilder(), "graveyard");
    const others = [greenBear(), forestCard(), forestCard()].map((d) => toZone(s0, ap, d, "graveyard"));
    const s = settle(castNow(s0, ap, alex, [], { via: "escape", exileCards: others }));
    expect([zone(s, alex), pt(s, alex), kws(s, alex, "Haste")]).toEqual(["battlefield", "3/3", true]);
  });

  it("another creature cast from your hand gets nothing; one cast from your graveyard does; one put onto the battlefield, nothing", () => {
    const { s: s0, ap, ids } = setup([greenBear()]);
    putOnBattlefield(s0, ap, alexWilder());
    let s = settle(castNow(s0, ap, ids[0]!));
    expect([pt(s, ids[0]!), kws(s, ids[0]!, "Haste")]).toEqual(["2/2", false]);
    const runner = toZone(s, ap, escapee(), "graveyard");
    const others = [greenBear(), forestCard()].map((d) => toZone(s, ap, d, "graveyard"));
    s = settle(castNow(s, ap, runner, [], { via: "escape", exileCards: others }));
    expect([zone(s, runner), pt(s, runner), kws(s, runner, "Haste")]).toEqual(["battlefield", "4/2", true]);
  });
});

describe("Storm the Citadel", () => {
  it("+2/+2, and combat damage to a player destroys target artifact or enchantment that player controls", () => {
    const { s: s0, ap, ids, opp } = setup([stormTheCitadel()]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    const art = putOnBattlefield(s0, opp, trinket());
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(pt(s, bear)).toBe("4/4");
    s = attackWith(s, [bear], opp);
    s = goUntil(s, (x) => at("chooseTargets", ap)(x) || zone(x, art) === "graveyard" || x.step === "main2");
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(art)] });
    s = settle(s);
    expect([zone(s, art), life(s, opp)]).toEqual(["graveyard", 36]);
  });
});

describe("Undergrowth", () => {
  for (const paid of [false, true])
    it(`prevents all combat damage this turn${paid ? "; with {2}{R} paid, not a red creature's" : ""}`, () => {
      const { s: s0, ap, ids, opp } = setup([undergrowth()]);
      const giant = putOnBattlefield(s0, ap, hillGiant());
      const bear = putOnBattlefield(s0, ap, greenBear());
      let s = settle(castNow(s0, ap, ids[0]!, [], paid ? { kicks: [0] } : {}));
      s = attackWith(s, [giant, bear], opp);
      s = goUntil(s, (x) => x.step === "main2");
      expect(life(s, opp)).toBe(paid ? 37 : 40);
    });
});

describe("Vivien's Invocation", () => {
  it("puts a creature card from the top seven onto the battlefield; it deals damage equal to its power to target creature an opponent controls", () => {
    const { s: s0, ap, ids, opp } = setup([viviensInvocation()]);
    landsOnly(s0, ap);
    const giant = toZone(s0, ap, hillGiant(), "library");
    for (let i = 0; i < 3; i++) toZone(s0, ap, forestCard(), "library");
    const bear = putOnBattlefield(s0, opp, creature("Wall", "Creature — Wall", "{2}", 0, 3, { cmc: 2 }));
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseTargets", ap));
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(bear)] });
    s = settle(s);
    expect([zone(s, giant), zone(s, bear)]).toEqual(["battlefield", "graveyard"]);
  });
});

describe("Vivien's Invocation, last known information", () => {
  it("the creature gone before the trigger resolves: it still deals damage equal to its power as it last existed", () => {
    const { s: s0, ap, ids, opp } = setup([viviensInvocation()]);
    landsOnly(s0, ap);
    const giant = toZone(s0, ap, hillGiant(), "library");
    const wall = putOnBattlefield(s0, opp, creature("Wall", "Creature — Wall", "{2}", 0, 3, { cmc: 2 }));
    putOnBattlefield(s0, opp, greenBear());
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseTargets", ap));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(wall)] });
    moveObject(s, giant, "graveyard");
    invalidateCharacteristics(s);
    s = settle(s);
    expect(zone(s, wall)).toBe("graveyard");
  });

  it("no creature card among them: nothing is dealt", () => {
    const { s: s0, ap, ids, opp } = setup([viviensInvocation()]);
    landsOnly(s0, ap);
    const bear = putOnBattlefield(s0, opp, greenBear());
    const s = settle(castNow(s0, ap, ids[0]!), at("chooseTargets", ap));
    expect(s.pending).toBeFalsy();
    expect(s.objects[bear]!.damage).toBe(0);
  });
});

describe("Outlaw Stitcher", () => {
  it("the Zombie Rogue gets two +1/+1 counters for each spell you've cast this turn other than the first", () => {
    const { s: s0, ap, ids } = setup([study(), study(), outlawStitcher()]);
    let s = settle(castNow(s0, ap, ids[0]!));
    s = settle(castNow(s, ap, ids[1]!));
    s = settle(castNow(s, ap, ids[2]!));
    const [token] = mine(s, ap, "Rogue");
    // Three spells: the first doesn't count, so two, and four counters.
    expect([s.objects[token!]!.counters["+1/+1"], pt(s, token!), colorsOf(s, token!)]).toEqual([4, "6/6", ["B", "U"]]);
  });

  it("as the first spell this turn, no counters", () => {
    const { s: s0, ap, ids } = setup([outlawStitcher()]);
    const s = settle(castNow(s0, ap, ids[0]!));
    const [token] = mine(s, ap, "Rogue");
    expect(pt(s, token!)).toBe("2/2");
  });
});

describe("Spider-Woman, Secret Agent", () => {
  it("taps the creature, which doesn't untap while you control her", () => {
    const { s: s0, ap, ids, opp } = setup([spiderwoman()]);
    const bear = putOnBattlefield(s0, opp, greenBear());
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseTargets", ap));
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(bear)] });
    s = settle(s);
    expect(s.objects[bear]!.tapped).toBe(true);
    s = passUntil(s, "upkeep", opp);
    expect(s.objects[bear]!.tapped).toBe(true);
    // Spider-Woman leaves: the creature untaps as usual.
    s.objects[ids[0]!]!.zone = "graveyard";
    s.battlefield.splice(s.battlefield.indexOf(ids[0]!), 1);
    s.players[ap]!.graveyard.push(ids[0]!);
    invalidateCharacteristics(s);
    s = passUntil(s, "draw", opp);
    s = passUntil(s, "upkeep", opp);
    expect(s.objects[bear]!.tapped).toBe(false);
  });
});

describe("Deus of Calamity", () => {
  for (const big of [true, false])
    it(`${big ? "6" : "5"} damage to an opponent: ${big ? "destroy target land that player controls" : "nothing"}`, () => {
      const { s: s0, ap, opp } = setup([]);
      const deus = putOnBattlefield(s0, ap, deusOfCalamity());
      if (!big) s0.effects.push({ id: "x1", timestamp: s0.nextTimestamp++, controller: ap, sourceName: "test", duration: "endOfTurn", affected: [deus], mods: [{ kind: "modifyPT", power: -1, toughness: 0 }] });
      invalidateCharacteristics(s0);
      const land = putOnBattlefield(s0, opp, forestCard());
      let s = attackWith(s0, [deus], opp);
      s = goUntil(s, (x) => at("chooseTargets", ap)(x) || x.step === "main2");
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(land)] });
      s = settle(s);
      expect([life(s, opp), zone(s, land)]).toEqual([big ? 34 : 35, big ? "graveyard" : "battlefield"]);
    });
});

describe("Dragon's Disciple", () => {
  it("reveal a Dragon card from your hand: it enters with a +1/+1 counter", () => {
    const { s: s0, ap, ids } = setup([dragonsDisciple(), dragon(), greenBear()]);
    let s = settle(castNow(s0, ap, ids[0]!), at("pickPermanents", ap));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "reveal", options: [ids[1]], count: 1 });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [ids[1]!] }));
    expect([pt(s, ids[0]!), zone(s, ids[1]!)]).toEqual(["2/4", "hand"]);
  });

  it("not revealing: no counter", () => {
    const { s: s0, ap, ids } = setup([dragonsDisciple(), dragon()]);
    let s = settle(castNow(s0, ap, ids[0]!), at("pickPermanents", ap));
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [] }));
    expect(pt(s, ids[0]!)).toBe("1/3");
  });

  it("controlling a Dragon: the counter without a question; Dragons you control have ward {1}", () => {
    const { s: s0, ap, ids, opp } = setup([dragonsDisciple(), dragon()]);
    const drake = putOnBattlefield(s0, ap, dragon());
    const s = settle(castNow(s0, ap, ids[0]!), (x) => !!x.pending);
    expect(s.pending).toBeFalsy();
    expect(pt(s, ids[0]!)).toBe("2/4");
    expect(wardCosts(s, opp, [tgt(drake)])).toEqual(["{1}"]);
    expect(wardCosts(s, opp, [tgt(ids[0]!)])).toEqual([]);
  });

  it("no Dragon anywhere: no question and no counter", () => {
    const { s: s0, ap, ids } = setup([dragonsDisciple(), greenBear()]);
    const s = settle(castNow(s0, ap, ids[0]!), (x) => !!x.pending);
    expect(s.pending).toBeFalsy();
    expect(pt(s, ids[0]!)).toBe("1/3");
  });
});

describe("Obscura Interceptor", () => {
  it("it connives as it enters; then up to one target spell returns to its owner's hand", () => {
    const { s: s0, ap, ids } = setup([study(), obscuraInterceptor()]);
    let s = castNow(s0, ap, ids[0]!);
    s = castNow(s, ap, ids[1]!);
    s = settle(s, at("chooseTargets", ap));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const spell = s.stack.find((i) => i.kind === "spell" && i.objectId === ids[0])!;
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "stack", id: spell.id }] }));
    expect([zone(s, ids[0]!), zone(s, ids[1]!)]).toEqual(["hand", "battlefield"]);
  });
});

describe("Psychic Pickpocket", () => {
  it("it connives as it enters; then up to one target nonland permanent returns to its owner's hand", () => {
    const { s: s0, ap, ids, opp } = setup([psychicPickpocket()]);
    const giant = putOnBattlefield(s0, opp, hillGiant());
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseTargets", ap));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(giant)] }));
    expect([zone(s, giant), zone(s, ids[0]!)]).toEqual(["hand", "battlefield"]);
  });
});

describe("Cloaked Cadet", () => {
  it("+1/+1 counters on Humans you control draw a card, only once each turn", () => {
    const { s: s0, ap, ids } = setup([blessing(), blessing()]);
    putOnBattlefield(s0, ap, cloakedCadet());
    putOnBattlefield(s0, ap, human());
    const hand = s0.players[ap]!.hand.length;
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
    s = settle(castNow(s, ap, ids[1]!));
    expect(s.players[ap]!.hand.length).toBe(hand - 2 + 1);
  });

  it("a counter on a non-Human: nothing", () => {
    const { s: s0, ap, ids } = setup([blessing()]);
    const cadet = putOnBattlefield(s0, ap, cloakedCadet());
    putOnBattlefield(s0, ap, greenBear());
    // Only the bear: the Cadet is a Human, so it's elsewhere.
    s0.battlefield.splice(s0.battlefield.indexOf(cadet), 1);
    s0.objects[cadet]!.zone = "exile";
    putOnBattlefield(s0, ap, creature("Watcher", "Creature — Human", "{1}{G}", 1, 1, { oracleText: "Whenever one or more +1/+1 counters are put on one or more Humans you control, draw a card. This ability triggers only once each turn." }));
    const hand = s0.players[ap]!.hand.length;
    const s = settle(castNow(s0, ap, ids[0]!));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
  });
});

describe("Enslaved Horror", () => {
  it("each other player may return a creature card from their graveyard to the battlefield", () => {
    const { s: s0, ap, ids } = setup([enslavedHorror()]);
    const others = s0.turnOrder.filter((p) => p !== ap);
    const giants = others.slice(0, 2).map((p) => toZone(s0, p, hillGiant(), "graveyard"));
    const mineToo = toZone(s0, ap, hillGiant(), "graveyard");
    const s = settle(castNow(s0, ap, ids[0]!));
    expect(giants.map((id) => [zone(s, id), s.objects[id]!.controller])).toEqual([
      ["battlefield", others[0]],
      ["battlefield", others[1]],
    ]);
    expect(zone(s, mineToo)).toBe("graveyard");
  });
});

describe("Lo and Li, Royal Advisors", () => {
  it("an opponent mills or discards: a +1/+1 counter on each Advisor you control; your own mill does nothing", () => {
    const { s: s0, ap, ids, opp } = setup([mindRot()]);
    const lo = putOnBattlefield(s0, ap, loAndLi());
    const adv = putOnBattlefield(s0, ap, advisor());
    let s = settle(run(s0, planActivate(s0, ap, lo, 0, [ply(opp)])));
    expect([s.objects[lo]!.counters["+1/+1"], s.objects[adv]!.counters["+1/+1"]]).toEqual([1, 1]);
    s = settle(run(s, planActivate(s, ap, lo, 0, [ply(ap)])));
    expect(s.objects[adv]!.counters["+1/+1"]).toBe(1);
    s = settle(castNow(s, ap, ids[0]!, [ply(opp)]));
    expect([s.objects[lo]!.counters["+1/+1"], pt(s, adv)]).toEqual([2, "3/3"]);
  });
});

describe("Chisei, Heart of Oceans", () => {
  const toUpkeep = (s: GameState, ap: PlayerId) => goUntil(passUntil(s, "end", ap), (x) => (x.activePlayer === ap && x.step === "upkeep" && (!!x.pending || x.stack.length > 0)) || (x.activePlayer === ap && x.step === "draw"));
  it("remove a counter from a permanent you control to keep it", () => {
    const { s: s0, ap } = setup([]);
    const chi = putOnBattlefield(s0, ap, chisei());
    const bear = putOnBattlefield(s0, ap, greenBear());
    s0.objects[bear]!.counters["+1/+1"] = 2;
    const stone = putOnBattlefield(s0, ap, trinket());
    s0.objects[stone]!.counters.charge = 1;
    let s = goUntil(toUpkeep(s0, ap), at("chooseMay", ap));
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s, at("pickPermanents", ap));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap });
    if (s.pending?.kind !== "pickPermanents") throw new Error("no pick");
    expect([...s.pending.options].sort()).toEqual([bear, stone].sort());
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [bear] }));
    expect([zone(s, chi), s.objects[bear]!.counters["+1/+1"], s.objects[stone]!.counters.charge]).toEqual(["battlefield", 1, 1]);
  });

  it("declining, it's sacrificed", () => {
    const { s: s0, ap } = setup([]);
    const chi = putOnBattlefield(s0, ap, chisei());
    const bear = putOnBattlefield(s0, ap, greenBear());
    s0.objects[bear]!.counters["+1/+1"] = 1;
    let s = goUntil(toUpkeep(s0, ap), at("chooseMay", ap));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect([zone(s, chi), s.objects[bear]!.counters["+1/+1"]]).toEqual(["graveyard", 1]);
  });

  it("with no counter on any permanent you control, it's sacrificed without a question", () => {
    const { s: s0, ap, opp } = setup([]);
    const chi = putOnBattlefield(s0, ap, chisei());
    const theirs = putOnBattlefield(s0, opp, greenBear());
    s0.objects[theirs]!.counters["+1/+1"] = 1;
    const s = goUntil(passUntil(s0, "end", ap), (x) => at("chooseMay", ap)(x) || (x.activePlayer === ap && x.step === "draw"));
    expect(s.pending).toBeFalsy();
    expect(zone(s, chi)).toBe("graveyard");
  });

  it("a bot keeps it when it can", () => {
    const { s: s0, ap } = setup([]);
    const chi = putOnBattlefield(s0, ap, chisei());
    const bear = putOnBattlefield(s0, ap, greenBear());
    s0.objects[bear]!.counters["+1/+1"] = 1;
    const s = goUntil(passUntil(s0, "end", ap), (x) => x.activePlayer === ap && x.step === "draw");
    expect([zone(s, chi), s.objects[bear]!.counters["+1/+1"] ?? 0]).toEqual(["battlefield", 0]);
  });
});

describe("Tokka & Rahzar, Terrible Twos", () => {
  it("a spell cast with less mana spent than its mana value: 3 damage to its caster; one paid in full, nothing", () => {
    const { s: s0, ap, ids } = setup([demon(), greenBear()]);
    putOnBattlefield(s0, ap, tokkaRahzar());
    putOnBattlefield(s0, ap, reducer());
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(life(s, ap)).toBe(37);
    s.effects = [];
    s.battlefield = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name !== "Test Reducer");
    invalidateCharacteristics(s);
    s = settle(castNow(s, ap, ids[1]!));
    expect(life(s, ap)).toBe(37);
  });
});

describe("Mindlock Orb", () => {
  it("no player can search a library, its controller included; with it gone, they can", () => {
    const { s: s0, ap, ids, opp } = setup([ramp(), ramp()]);
    const orb = putOnBattlefield(s0, ap, mindlockOrb());
    const lands = s0.battlefield.length;
    let s = settle(castNow(s0, ap, ids[0]!), at("searchLibrary", ap));
    expect(s.pending).toBeFalsy();
    expect(s.battlefield.length).toBe(lands);
    // An opponent's Orb stops you too.
    s.objects[orb]!.controller = opp;
    s.objects[orb]!.owner = opp;
    invalidateCharacteristics(s);
    s = settle(castNow(s, ap, ids[1]!), at("searchLibrary", ap));
    expect(s.pending).toBeFalsy();
    expect(s.battlefield.length).toBe(lands);
  });

  it("without it, the search happens", () => {
    const { s: s0, ap, ids } = setup([ramp()]);
    const s = settle(castNow(s0, ap, ids[0]!), at("searchLibrary", ap));
    expect(s.pending?.kind).toBe("searchLibrary");
  });
});
