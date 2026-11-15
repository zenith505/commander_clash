// Lane B, round 13: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, parseManaCost, planCast, planMana, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/**
 * Everyone passes until the stack is empty. "You may" questions get `yes`; a pending target choice gets `targets`; a pick
 * gets `pick` (or the first ones offered); a discard the first cards in hand. Stops at any other question.
 */
const settle = (s: GameState, opts: { yes?: boolean; targets?: TargetChoice[]; pick?: string[] } = {}) => {
  for (let i = 0; i < 200 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = run(s, [...((opts.yes ?? true) && p.pay?.mana ? planMana(s, p.player, parseManaCost(p.pay.mana))! : []), { type: "chooseMay", player: p.player, yes: opts.yes ?? true }]);
    else if (p?.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets } as Action);
    else if (p?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: p.player, ids: opts.pick ?? p.options.slice(0, p.count) });
    else if (p?.kind === "discard") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
    else if (p) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** A player gets priority: state-based actions and state triggers are checked (CR 117.5, 603.8), then all settles. */
const check = (s: GameState, opts: Parameters<typeof settle>[1] = {}) => settle(act(s, { type: "passPriority", player: waitingOn(s)! }), opts);
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const has = (s: GameState, id: string, k: string) => objHasKeyword(s, s.objects[id]!, k);
const chars = (s: GameState, id: string) => characteristics(s, s.objects[id]!);
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const ctl = (s: GameState, id: string) => chars(s, id).controller;
const creature = (name: string, typeLine: string, manaCost: string, p: number, t: number, extra: Partial<CardDef> = {}) =>
  card(name, typeLine, manaCost, { power: String(p), toughness: String(t), ...extra });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2);
const blackRat = () => creature("Black Rat", "Creature — Rat", "{B}", 1, 1);
const whiteKnight = () => creature("White Knight", "Creature — Human Knight", "{W}{W}", 2, 2);
const bigOgre = () => creature("Big Ogre", "Creature — Ogre", "{4}{R}", 6, 6);
const into = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" | "library" = "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const attach = (s: GameState, pid: PlayerId, def: CardDef, to: string) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = to;
  invalidateCharacteristics(s);
  return id;
};
/** Empties a player's hand into their library. */
const emptyHand = (s: GameState, pid: PlayerId) => {
  const p = s.players[pid]!;
  for (const id of p.hand) s.objects[id]!.zone = "library";
  p.library.push(...p.hand);
  p.hand = [];
};
/** The next upkeep of `pid`, with its triggers resolved. */
const toUpkeep = (s: GameState, pid: PlayerId, opts: Parameters<typeof settle>[1] = {}) => settle(passUntil(s, "upkeep", pid), opts);
/** Attackers declared, the game paused on the defending players' blocks. */
const toBlocks = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[], opts: Parameters<typeof settle>[1] = {}) => {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 40 && s.pending?.kind !== "declareBlockers"; i++) s = s.pending || s.stack.length ? settle(s, opts) : act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Blocks declared by `opp`; every other defending player declares none. Then the block triggers resolve. */
const block = (s: GameState, opp: PlayerId, blocks: { blocker: string; attacker: string }[]) => {
  s = act(s, { type: "declareBlockers", player: opp, blocks });
  for (let i = 0; i < 10 && s.pending?.kind === "declareBlockers"; i++) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
  return settle(s);
};

// Real oracle text (Scryfall).
const lurkingJackals = card("Lurking Jackals", "Enchantment", "{B}", {cmc: 1,oracleText: "When an opponent has 10 or less life, if this permanent is an enchantment, it becomes a 3/2 Jackal creature."});
const opalAvenger = card("Opal Avenger", "Enchantment", "{2}{W}", {cmc: 3,oracleText: "When you have 10 or less life, if this permanent is an enchantment, it becomes a 3/5 Soldier creature."});
const veiledCrocodile = card("Veiled Crocodile", "Enchantment", "{2}{U}", {cmc: 3,oracleText: "When a player has no cards in hand, if this permanent is an enchantment, it becomes a 4/4 Crocodile creature."});
const hiddenPredators = card("Hidden Predators", "Enchantment", "{G}", {cmc: 1,oracleText: "When an opponent controls a creature with power 4 or greater, if this permanent is an enchantment, it becomes a 4/4 Beast creature."});
const hiddenHerd = card("Hidden Herd", "Enchantment", "{G}", {cmc: 1,oracleText: "When an opponent plays a nonbasic land, if this permanent is an enchantment, it becomes a 3/3 Beast creature."});
const opalGuardian = card("Opal Guardian", "Enchantment", "{W}{W}{W}", {cmc: 3,oracleText: "When an opponent casts a creature spell, if this permanent is an enchantment, this enchantment becomes a 3/4 Gargoyle creature with flying and protection from red."});
const endangeredArmodon = card("Endangered Armodon", "Creature — Elephant", "{2}{G}{G}", {cmc: 4,power: "4",toughness: "5",oracleText: "When you control a creature with toughness 2 or less, sacrifice this creature."});
const synodCenturion = card("Synod Centurion", "Artifact Creature — Construct", "{4}", {cmc: 4,power: "4",toughness: "4",oracleText: "When you control no other artifacts, sacrifice this creature."});
const emperorCrocodile = card("Emperor Crocodile", "Creature — Crocodile", "{3}{G}", {cmc: 4,power: "5",toughness: "5",oracleText: "When you control no other creatures, sacrifice this creature."});
const goblinsOfTheFlarg = card("Goblins of the Flarg", "Creature — Goblin Warrior", "{R}", {cmc: 1,power: "1",toughness: "1",keywords: ["Landwalk","Mountainwalk"],oracleText: "Mountainwalk (This creature can't be blocked as long as defending player controls a Mountain.)\nWhen you control a Dwarf, sacrifice this creature."});
const loneRevenant = card("Lone Revenant", "Creature — Spirit", "{3}{U}{U}", {cmc: 5,power: "4",toughness: "4",keywords: ["Hexproof"],oracleText: "Hexproof (This creature can't be the target of spells or abilities your opponents control.)\nWhenever this creature deals combat damage to a player, if you control no other creatures, look at the top four cards of your library. Put one of them into your hand and the rest on the bottom of your library in any order."});
const thoughtboundPrimoc = card("Thoughtbound Primoc", "Creature — Bird Beast", "{2}{R}", {cmc: 3,power: "2",toughness: "3",keywords: ["Flying"],oracleText: "Flying\nAt the beginning of your upkeep, if a player controls more Wizards than each other player, the player who controls the most Wizards gains control of this creature."});
const wildMammoth = card("Wild Mammoth", "Creature — Elephant", "{2}{G}", {cmc: 3,power: "3",toughness: "4",oracleText: "At the beginning of your upkeep, if a player controls more creatures than each other player, the player who controls the most creatures gains control of this creature."});
const ghazbanOgre = card("Ghazbán Ogre", "Creature — Ogre", "{G}", {cmc: 1,power: "2",toughness: "2",oracleText: "At the beginning of your upkeep, if a player has more life than each other player, the player with the most life gains control of this creature."});
const wildDogs = card("Wild Dogs", "Creature — Dog", "{G}", {cmc: 1,power: "2",toughness: "1",keywords: ["Cycling"],oracleText: "At the beginning of your upkeep, if a player has more life than each other player, the player with the most life gains control of this creature.\nCycling {2} ({2}, Discard this card: Draw a card.)"});
const sokenzanRenegade = card("Sokenzan Renegade", "Creature — Ogre Samurai Mercenary", "{2}{R}", {cmc: 3,power: "3",toughness: "3",keywords: ["Bushido"],oracleText: "Bushido 1 (Whenever this creature blocks or becomes blocked, it gets +1/+1 until end of turn.)\nAt the beginning of your upkeep, if a player has more cards in hand than each other player, the player who has the most cards in hand gains control of this creature."});
const vaporousDjinn = card("Vaporous Djinn", "Creature — Djinn", "{2}{U}{U}", {cmc: 4,power: "3",toughness: "4",keywords: ["Flying"],oracleText: "Flying\nAt the beginning of your upkeep, this creature phases out unless you pay {U}{U}. (While it's phased out, it's treated as though it doesn't exist. It phases in before you untap during your next untap step.)"});
const warpingWurm = card("Warping Wurm", "Creature — Wurm", "{2}{G}{U}", {cmc: 4,power: "1",toughness: "1",keywords: ["Phasing"],oracleText: "Phasing (This phases in or out before you untap during each of your untap steps. While it's phased out, it's treated as though it doesn't exist.)\nAt the beginning of your upkeep, this creature phases out unless you pay {2}{G}{U}.\nWhenever this creature phases in, put a +1/+1 counter on it."});
const minionOfTeveshSzat = card("Minion of Tevesh Szat", "Creature — Demon Minion", "{4}{B}{B}{B}", {cmc: 7,power: "4",toughness: "4",oracleText: "At the beginning of your upkeep, this creature deals 2 damage to you unless you pay {B}{B}.\n{T}: Target creature gets +3/-2 until end of turn."});
const forceOfNature = card("Force of Nature", "Creature — Elemental", "{2}{G}{G}{G}{G}", {cmc: 6,power: "8",toughness: "8",keywords: ["Trample"],oracleText: "Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)\nAt the beginning of your upkeep, this creature deals 8 damage to you unless you pay {G}{G}{G}{G}."});
const heavyweightDemolisher = card("Heavyweight Demolisher", "Artifact Creature — Construct", "{7}", {cmc: 7,power: "8",toughness: "6",keywords: ["Unearth","Menace"],oracleText: "Menace\nAt the beginning of your upkeep, tap this creature unless you pay {3}.\nUnearth {6}{R}{R} ({6}{R}{R}: Return this card from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step or if it would leave the battlefield. Unearth only as a sorcery.)"});
const hasranOgress = card("Hasran Ogress", "Creature — Ogre", "{B}{B}", {cmc: 2,power: "3",toughness: "2",oracleText: "Whenever this creature attacks, it deals 3 damage to you unless you pay {2}."});
const teferisImp = card("Teferi's Imp", "Creature — Imp", "{2}{U}", {cmc: 3,power: "1",toughness: "1",keywords: ["Flying","Phasing"],oracleText: "Flying\nPhasing (This phases in or out before you untap during each of your untap steps. While it's phased out, it's treated as though it doesn't exist.)\nWhenever this creature phases out, discard a card.\nWhenever this creature phases in, draw a card."});
const shimmeringEfreet = card("Shimmering Efreet", "Creature — Efreet", "{2}{U}", {cmc: 3,power: "2",toughness: "2",keywords: ["Flying","Phasing"],oracleText: "Flying\nPhasing (This phases in or out before you untap during each of your untap steps. While it's phased out, it's treated as though it doesn't exist.)\nWhenever this creature phases in, target creature phases out. (It phases in before its controller untaps during their next untap step.)"});
const serraInquisitors = card("Serra Inquisitors", "Creature — Human Cleric", "{4}{W}", {cmc: 5,power: "3",toughness: "3",oracleText: "Whenever this creature blocks or becomes blocked by one or more black creatures, this creature gets +2/+0 until end of turn."});
const amphibiousKavu = card("Amphibious Kavu", "Creature — Kavu", "{2}{G}", {cmc: 3,power: "2",toughness: "2",oracleText: "Whenever this creature blocks or becomes blocked by one or more blue and/or black creatures, this creature gets +3/+3 until end of turn."});
const dwarvenSoldier = card("Dwarven Soldier", "Creature — Dwarf Soldier", "{1}{R}", {cmc: 2,power: "2",toughness: "1",oracleText: "Whenever this creature blocks or becomes blocked by one or more Orcs, this creature gets +0/+2 until end of turn."});
const rashkaTheSlayer = card("Rashka the Slayer", "Legendary Creature — Human Archer", "{3}{W}{W}", {cmc: 5,power: "3",toughness: "3",keywords: ["Reach"],oracleText: "Reach (This creature can block creatures with flying.)\nWhenever Rashka blocks one or more black creatures, Rashka gets +1/+2 until end of turn."});
const goblinRockSled = card("Goblin Rock Sled", "Creature — Goblin", "{1}{R}", {cmc: 2,power: "3",toughness: "1",keywords: ["Trample"],oracleText: "Trample\nThis creature doesn't untap during your untap step if it attacked during your last turn.\nThis creature can't attack unless defending player controls a Mountain."});
const giantTurtle = card("Giant Turtle", "Creature — Turtle", "{1}{G}{G}", {cmc: 3,power: "2",toughness: "4",oracleText: "This creature can't attack if it attacked during your last turn."});
const tangleKelp = card("Tangle Kelp", "Enchantment — Aura", "{U}", {cmc: 1,keywords: ["Enchant"],oracleText: "Enchant creature\nWhen this Aura enters, tap enchanted creature.\nEnchanted creature doesn't untap during its controller's untap step if it attacked during its controller's last turn."});
const hallsOfMist = card("Halls of Mist", "Land", "", {cmc: 0,keywords: ["Cumulative upkeep"],oracleText: "Cumulative upkeep {1} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nCreatures that attacked during their controller's last turn can't attack."});
const necraSanctuary = card("Necra Sanctuary", "Enchantment", "{2}{B}", {cmc: 3,oracleText: "At the beginning of your upkeep, if you control a green or white permanent, target player loses 1 life. If you control a green permanent and a white permanent, that player loses 3 life instead."});
const rakaSanctuary = card("Raka Sanctuary", "Enchantment", "{2}{R}", {cmc: 3,oracleText: "At the beginning of your upkeep, if you control a white or blue permanent, this enchantment deals 1 damage to target creature. If you control a white permanent and a blue permanent, this enchantment deals 3 damage instead."});
const cetaSanctuary = card("Ceta Sanctuary", "Enchantment", "{2}{U}", {cmc: 3,oracleText: "At the beginning of your upkeep, if you control a red or green permanent, draw a card, then discard a card. If you control a red permanent and a green permanent, instead draw two cards, then discard a card."});
const degaSanctuary = card("Dega Sanctuary", "Enchantment", "{2}{W}", {cmc: 3,oracleText: "At the beginning of your upkeep, if you control a black or red permanent, you gain 2 life. If you control a black permanent and a red permanent, you gain 4 life instead."});
const anaSanctuary = card("Ana Sanctuary", "Enchantment", "{2}{G}", {cmc: 3,oracleText: "At the beginning of your upkeep, if you control a blue or black permanent, target creature gets +1/+1 until end of turn. If you control a blue permanent and a black permanent, that creature gets +5/+5 until end of turn instead."});
const keeperOfTresserhorn = card("Keeper of Tresserhorn", "Creature — Avatar", "{5}{B}", {cmc: 6,power: "6",toughness: "6",oracleText: "Whenever this creature attacks and isn't blocked, it assigns no combat damage this turn and defending player loses 2 life."});
const limDulsPaladin = card("Lim-Dûl's Paladin", "Creature — Human Knight", "{2}{B}{R}", {cmc: 4,power: "0",toughness: "3",keywords: ["Trample"],oracleText: "Trample\nAt the beginning of your upkeep, you may discard a card. If you don't, sacrifice this creature and draw a card.\nWhenever this creature becomes blocked, it gets +6/+3 until end of turn.\nWhenever this creature attacks and isn't blocked, it assigns no combat damage this turn and defending player loses 4 life."});
const aislingLeprechaun = card("Aisling Leprechaun", "Creature — Faerie", "{G}", {cmc: 1,power: "1",toughness: "1",oracleText: "Whenever this creature blocks or becomes blocked by a creature, that creature becomes green. (This effect lasts indefinitely.)"});
const zealotsEnDal = card("Zealots en-Dal", "Creature — Human Soldier", "{3}{W}", {cmc: 4,power: "2",toughness: "4",oracleText: "At the beginning of your upkeep, if all nonland permanents you control are white, you gain 1 life."});
const wardenOfTheBeyond = card("Warden of the Beyond", "Creature — Human Wizard", "{2}{W}", {cmc: 3,power: "2",toughness: "2",keywords: ["Vigilance"],oracleText: "Vigilance (Attacking doesn't cause this creature to tap.)\nThis creature gets +2/+2 as long as an opponent owns a card in exile."});
const walkingDream = card("Walking Dream", "Creature — Illusion", "{3}{U}", {cmc: 4,power: "3",toughness: "3",oracleText: "This creature can't be blocked.\nThis creature doesn't untap during your untap step if an opponent controls two or more creatures."});
const rummage = card("Test Rummage", "Instant", "{R}", { cmc: 1, oracleText: "Target player discards a card, then draws a card." });

describe("state triggers (CR 603.8): the Hidden, Veiled and Opal enchantments, and 'When you control ...'", () => {
  it("compiles them", () => supported(lurkingJackals, opalAvenger, veiledCrocodile, hiddenPredators, hiddenHerd, opalGuardian, endangeredArmodon, synodCenturion, emperorCrocodile, goblinsOfTheFlarg, loneRevenant));

  it("Lurking Jackals: an opponent at 10 life makes it a 3/2 Jackal creature, no longer an enchantment, for good (rulings)", () => {
    let { s, ap, opp } = setup([]);
    const jackals = putOnBattlefield(s, ap, lurkingJackals);
    s.players[opp]!.life = 11;
    s = check(s);
    expect(chars(s, jackals).types).toEqual(["Enchantment"]);
    s.players[opp]!.life = 10;
    s = check(s);
    expect(chars(s, jackals).types).toEqual(["Creature"]);
    expect(chars(s, jackals).subtypes).toEqual(["Jackal"]);
    expect(pt(s, jackals)).toBe("3/2");
    // No longer an enchantment: the state doesn't trigger it again (an intervening if, CR 603.4).
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.length + s.triggerQueue.length).toBe(0);
    s.players[opp]!.life = 20;
    s = check(s);
    expect(chars(s, jackals).types).toEqual(["Creature"]);
  });

  it("Opal Avenger: you at 10 or less life", () => {
    let { s, ap, opp } = setup([]);
    const avenger = putOnBattlefield(s, ap, opalAvenger);
    s.players[opp]!.life = 5;
    s = check(s);
    expect(chars(s, avenger).types).toEqual(["Enchantment"]);
    s.players[ap]!.life = 9;
    s = check(s);
    expect(pt(s, avenger)).toBe("3/5");
    expect(chars(s, avenger).subtypes).toEqual(["Soldier"]);
  });

  it("Veiled Crocodile: a hand empty only partway through a resolution still triggers it (rulings)", () => {
    let { s, ap, opp, ids } = setup([rummage]);
    const croc = putOnBattlefield(s, ap, veiledCrocodile);
    emptyHand(s, opp);
    into(s, opp, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(s.players[opp]!.hand.length).toBe(1);
    expect(chars(s, croc).types).toEqual(["Creature"]);
    expect(pt(s, croc)).toBe("4/4");
  });

  it("Hidden Predators: an opponent's creature with power 4 or greater", () => {
    let { s, ap, opp } = setup([]);
    const predators = putOnBattlefield(s, ap, hiddenPredators);
    putOnBattlefield(s, ap, bigOgre());
    s = check(s);
    expect(chars(s, predators).types).toEqual(["Enchantment"]);
    putOnBattlefield(s, opp, bigOgre());
    s = check(s);
    expect(chars(s, predators).subtypes).toEqual(["Beast"]);
    expect(pt(s, predators)).toBe("4/4");
  });

  it("Hidden Herd: an opponent playing a nonbasic land, not a basic one", () => {
    let { s, ap, opp } = setup([]);
    const herd = putOnBattlefield(s, ap, hiddenHerd);
    s = passUntil(s, "main1", opp);
    const basic = into(s, opp, card("Forest", "Basic Land — Forest"));
    const wastes = into(s, opp, card("Test Barrens", "Land", "", { oracleText: "{T}: Add {C}." }));
    s = settle(act(s, { type: "playLand", player: opp, objectId: basic }));
    expect(chars(s, herd).types).toEqual(["Enchantment"]);
    s.players[opp]!.landsPlayedThisTurn = 0;
    s = settle(act(s, { type: "playLand", player: opp, objectId: wastes }));
    expect(chars(s, herd).types).toEqual(["Creature"]);
    expect(pt(s, herd)).toBe("3/3");
  });

  it("Opal Guardian: an opponent's creature spell makes it a 3/4 flier with protection from red", () => {
    let { s, ap, opp } = setup([]);
    const guardian = putOnBattlefield(s, ap, opalGuardian);
    s = passUntil(s, "main1", opp);
    for (const l of [card("Forest", "Basic Land — Forest"), card("Forest", "Basic Land — Forest")]) putOnBattlefield(s, opp, l);
    const bear = into(s, opp, greenBear());
    s = settle(run(s, planCast(s, opp, bear)));
    expect(chars(s, guardian).types).toEqual(["Creature"]);
    expect(pt(s, guardian)).toBe("3/4");
    expect(has(s, guardian, "Flying")).toBe(true);
    expect(has(s, guardian, "Protection from red")).toBe(true);
  });

  it("Endangered Armodon: sacrificed once you control a creature with toughness 2 or less", () => {
    let { s, ap } = setup([]);
    const armodon = putOnBattlefield(s, ap, endangeredArmodon);
    s = check(s);
    expect(zone(s, armodon)).toBe("battlefield");
    putOnBattlefield(s, ap, greenBear());
    s = check(s);
    expect(zone(s, armodon)).toBe("graveyard");
  });

  it("Emperor Crocodile and Synod Centurion: sacrificed with no other creature / artifact", () => {
    let { s, ap } = setup([]);
    const croc = putOnBattlefield(s, ap, emperorCrocodile);
    const centurion = putOnBattlefield(s, ap, synodCenturion);
    const relic = putOnBattlefield(s, ap, card("Test Relic", "Artifact", "{1}"));
    // The Centurion is the Crocodile's other creature, the Relic the Centurion's other artifact.
    s = check(s);
    expect(zone(s, croc)).toBe("battlefield");
    expect(zone(s, centurion)).toBe("battlefield");
    s.battlefield.splice(s.battlefield.indexOf(relic), 1);
    s.objects[relic]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(relic);
    invalidateCharacteristics(s);
    s = check(s);
    expect(zone(s, centurion)).toBe("graveyard");
    expect(zone(s, croc)).toBe("graveyard");
  });

  it("Goblins of the Flarg: sacrificed once you control a Dwarf", () => {
    let { s, ap, opp } = setup([]);
    const goblins = putOnBattlefield(s, ap, goblinsOfTheFlarg);
    putOnBattlefield(s, opp, creature("Test Dwarf", "Creature — Dwarf", "{R}", 1, 1));
    s = check(s);
    expect(zone(s, goblins)).toBe("battlefield");
    putOnBattlefield(s, ap, creature("Test Dwarf", "Creature — Dwarf", "{R}", 1, 1));
    s = check(s);
    expect(zone(s, goblins)).toBe("graveyard");
  });
});

describe("'the player who controls the most ... gains control of ~' (rulings on Sokenzan Renegade, Wild Dogs)", () => {
  it("compiles them", () => supported(thoughtboundPrimoc, wildMammoth, ghazbanOgre, wildDogs, sokenzanRenegade));

  it("Wild Mammoth: the player with the most creatures gains control of it in your upkeep", () => {
    let { s, ap, opp } = setup([]);
    const mammoth = putOnBattlefield(s, ap, wildMammoth);
    for (let i = 0; i < 3; i++) putOnBattlefield(s, opp, greenBear());
    s = toUpkeep(s, ap);
    expect(ctl(s, mammoth)).toBe(opp);
  });

  it("Wild Mammoth: tied for the most, it doesn't trigger", () => {
    let { s, ap, opp } = setup([]);
    const mammoth = putOnBattlefield(s, ap, wildMammoth);
    putOnBattlefield(s, opp, greenBear());
    s = passUntil(s, "upkeep", ap);
    expect(s.stack.length + s.triggerQueue.length).toBe(0);
    s = settle(s);
    expect(ctl(s, mammoth)).toBe(ap);
  });

  it("Ghazbán Ogre: the player with the most life; Sokenzan Renegade: the most cards in hand", () => {
    let { s, ap, opp } = setup([]);
    const ogre = putOnBattlefield(s, ap, ghazbanOgre);
    const renegade = putOnBattlefield(s, ap, sokenzanRenegade);
    const third = s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!;
    s.players[opp]!.life = 50;
    // Each player but you draws one before your upkeep; nobody has more than seven to discard.
    for (const p of s.turnOrder) emptyHand(s, p);
    for (let i = 0; i < 3; i++) into(s, third, greenBear());
    s = toUpkeep(s, ap);
    expect(ctl(s, ogre)).toBe(opp);
    expect(ctl(s, renegade)).toBe(third);
  });

  it("Thoughtbound Primoc: the player with the most Wizards; with the most of them yourself, it stays", () => {
    let { s, ap, opp } = setup([]);
    const primoc = putOnBattlefield(s, ap, thoughtboundPrimoc);
    const wizard = () => creature("Test Wizard", "Creature — Human Wizard", "{U}", 1, 1);
    putOnBattlefield(s, ap, wizard());
    s = toUpkeep(s, ap);
    expect(ctl(s, primoc)).toBe(ap);
    putOnBattlefield(s, opp, wizard());
    putOnBattlefield(s, opp, wizard());
    s = toUpkeep(passUntil(s, "main1", ap), ap);
    expect(ctl(s, primoc)).toBe(opp);
  });
});

describe("upkeep 'unless you pay' and phasing triggers (CR 702.26, 603.10b)", () => {
  it("compiles them", () => supported(vaporousDjinn, minionOfTeveshSzat, forceOfNature, heavyweightDemolisher, hasranOgress, teferisImp, shimmeringEfreet));

  it("Vaporous Djinn: paid, it stays; declined, it phases out and back in at your next untap step", () => {
    const { s: s0, ap } = setup([]);
    const djinn = putOnBattlefield(s0, ap, vaporousDjinn);
    const paid = toUpkeep(s0, ap);
    expect(zone(paid, djinn)).toBe("battlefield");
    expect(paid.battlefield.filter((id) => paid.objects[id]!.controller === ap && paid.objects[id]!.tapped).length).toBe(2);
    let s = toUpkeep(s0, ap, { yes: false });
    expect(zone(s, djinn)).toBe("phasedOut");
    s = passUntil(passUntil(s, "main1", ap), "upkeep", ap);
    expect(zone(s, djinn)).toBe("battlefield");
  });

  it("Warping Wurm is supported since round B214: its phase-in counter resolves before its upkeep phase-out (CR 603.3b)", () => {
    expect(isFullySupported(warpingWurm)).toBe(true);
  });

  it("Teferi's Imp: discard as it phases out, draw as it phases in", () => {
    const { s: s0, ap } = setup([]);
    const imp = putOnBattlefield(s0, ap, teferisImp);
    let s = passUntil(s0, "upkeep", ap);
    const hand = s.players[ap]!.hand.length;
    s = settle(s);
    expect(zone(s, imp)).toBe("phasedOut");
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    s = passUntil(passUntil(s, "main1", ap), "upkeep", ap);
    const before = s.players[ap]!.hand.length;
    s = settle(s);
    expect(zone(s, imp)).toBe("battlefield");
    expect(s.players[ap]!.hand.length).toBe(before + 1);
  });

  it("Shimmering Efreet: as it phases in, target creature phases out", () => {
    const { s: s0, ap, opp } = setup([]);
    const efreet = putOnBattlefield(s0, ap, shimmeringEfreet);
    const ogre = putOnBattlefield(s0, opp, bigOgre());
    let s = settle(passUntil(s0, "upkeep", ap));
    expect(zone(s, efreet)).toBe("phasedOut");
    s = settle(passUntil(passUntil(s, "main1", ap), "upkeep", ap), { targets: [tgt(ogre)] });
    expect(zone(s, efreet)).toBe("battlefield");
    expect(zone(s, ogre)).toBe("phasedOut");
  });

  it("Force of Nature and Minion of Tevesh Szat: pay, or take the damage", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, forceOfNature);
    putOnBattlefield(s0, ap, minionOfTeveshSzat);
    putOnBattlefield(s0, ap, card("Forest", "Basic Land — Forest"));
    const paid = toUpkeep(s0, ap);
    expect(life(paid, ap)).toBe(40);
    const declined = toUpkeep(s0, ap, { yes: false });
    expect(life(declined, ap)).toBe(30);
  });

  it("Heavyweight Demolisher: tapped unless you pay {3}", () => {
    const { s: s0, ap } = setup([]);
    const demolisher = putOnBattlefield(s0, ap, heavyweightDemolisher);
    expect(toUpkeep(s0, ap).objects[demolisher]!.tapped).toBe(false);
    expect(toUpkeep(s0, ap, { yes: false }).objects[demolisher]!.tapped).toBe(true);
  });

  it("Hasran Ogress: attacking, pay {2} or it deals 3 damage to you", () => {
    const { s: s0, ap, opp } = setup([]);
    const ogress = putOnBattlefield(s0, ap, hasranOgress);
    const declined = toBlocks(s0, ap, [{ attacker: ogress, defender: opp }], { yes: false });
    expect(life(declined, ap)).toBe(37);
    const paid = toBlocks(s0, ap, [{ attacker: ogress, defender: opp }]);
    expect(life(paid, ap)).toBe(40);
  });
});

describe("'blocks or becomes blocked by one or more black creatures' (once per combat, rulings)", () => {
  it("compiles them", () => supported(serraInquisitors, amphibiousKavu, dwarvenSoldier, rashkaTheSlayer, aislingLeprechaun));

  it("Serra Inquisitors: +2/+0 once, blocked by a black and a white creature", () => {
    let { s, ap, opp } = setup([]);
    const inq = putOnBattlefield(s, ap, serraInquisitors);
    const rat = putOnBattlefield(s, opp, blackRat());
    const knight = putOnBattlefield(s, opp, whiteKnight());
    s = block(toBlocks(s, ap, [{ attacker: inq, defender: opp }]), opp, [{ blocker: rat, attacker: inq }, { blocker: knight, attacker: inq }]);
    expect(pt(s, inq)).toBe("5/3");
  });

  it("Serra Inquisitors: nothing, blocked only by a white creature", () => {
    let { s, ap, opp } = setup([]);
    const inq = putOnBattlefield(s, ap, serraInquisitors);
    const knight = putOnBattlefield(s, opp, whiteKnight());
    s = block(toBlocks(s, ap, [{ attacker: inq, defender: opp }]), opp, [{ blocker: knight, attacker: inq }]);
    expect(pt(s, inq)).toBe("3/3");
  });

  it("Amphibious Kavu and Dwarven Soldier block; Rashka blocks black creatures", () => {
    let { s, ap, opp } = setup([]);
    const rat = putOnBattlefield(s, ap, blackRat());
    const orc = putOnBattlefield(s, ap, creature("Test Orc", "Creature — Orc", "{R}", 1, 1));
    const rat2 = putOnBattlefield(s, ap, blackRat());
    const kavu = putOnBattlefield(s, opp, amphibiousKavu);
    const dwarf = putOnBattlefield(s, opp, dwarvenSoldier);
    const rashka = putOnBattlefield(s, opp, rashkaTheSlayer);
    s = toBlocks(s, ap, [{ attacker: rat, defender: opp }, { attacker: orc, defender: opp }, { attacker: rat2, defender: opp }]);
    s = block(s, opp, [{ blocker: kavu, attacker: rat }, { blocker: dwarf, attacker: orc }, { blocker: rashka, attacker: rat2 }]);
    expect(pt(s, kavu)).toBe("5/5");
    expect(pt(s, dwarf)).toBe("2/3");
    expect(pt(s, rashka)).toBe("4/5");
  });

  it("Aisling Leprechaun: the creature blocking it becomes green for good", () => {
    let { s, ap, opp } = setup([]);
    const lep = putOnBattlefield(s, ap, aislingLeprechaun);
    const knight = putOnBattlefield(s, opp, whiteKnight());
    s = block(toBlocks(s, ap, [{ attacker: lep, defender: opp }]), opp, [{ blocker: knight, attacker: lep }]);
    expect(chars(s, knight).colors).toEqual(["G"]);
    s = passUntil(s, "main1", opp);
    expect(zone(s, knight)).toBe("battlefield");
    expect(chars(s, knight).colors).toEqual(["G"]);
  });
});

/** Everyone passes (answering as `settle` does) until the game reaches `step` of `pid`'s turn. */
const passTo = (s: GameState, step: GameState["step"], pid: PlayerId, opts: Parameters<typeof settle>[1] = {}) => {
  for (let i = 0; i < 600 && !(s.step === step && s.activePlayer === pid && !s.stack.length && (!s.pending || (step === "declareAttackers" && s.pending.kind === "declareAttackers"))); i++) {
    const p = s.pending;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
    else if (p || s.stack.length || s.triggerQueue.length) {
      const before = JSON.stringify([p, s.stack.length]);
      s = settle(s, opts);
      if (s.pending && JSON.stringify([s.pending, s.stack.length]) === before) throw new Error(`stuck on ${s.pending.kind}`);
    } else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Attacks with these, then plays the turn out to `pid`'s next declare attackers step (the attackers' own turn). */
const attackThenNextTurn = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) => {
  s = passTo(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  s = passTo(s, "main2", ap);
  return passTo(s, "upkeep", ap);
};

describe("'if it attacked during your last turn' (Giant Turtle, rulings)", () => {
  it("compiles them", () => supported(goblinRockSled, giantTurtle, tangleKelp, hallsOfMist));

  it("Giant Turtle: can't attack the turn after it attacked, can the one after that", () => {
    let { s, ap, opp } = setup([]);
    const turtle = putOnBattlefield(s, ap, giantTurtle);
    const bear = putOnBattlefield(s, ap, greenBear());
    s = passTo(attackThenNextTurn(s, ap, [{ attacker: turtle, defender: opp }]), "declareAttackers", ap);
    expect(s.pending?.kind).toBe("declareAttackers");
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: turtle, defender: opp }] })).toThrow();
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: bear, defender: opp }] });
    s = passTo(passTo(s, "main2", ap), "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: turtle, defender: opp }] });
    expect(s.objects[turtle]!.attacking).toBe(opp);
  });

  it("Halls of Mist: a creature that attacked during its controller's last turn can't attack", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, hallsOfMist);
    const bear = putOnBattlefield(s, ap, greenBear());
    const other = putOnBattlefield(s, ap, greenBear());
    s = passTo(attackThenNextTurn(s, ap, [{ attacker: bear, defender: opp }]), "declareAttackers", ap);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: bear, defender: opp }] })).toThrow();
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: other, defender: opp }] });
    expect(s.objects[other]!.attacking).toBe(opp);
  });

  it("Goblin Rock Sled and Tangle Kelp: they don't untap the turn after they attacked", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, opp, card("Mountain", "Basic Land — Mountain"));
    const sled = putOnBattlefield(s, ap, goblinRockSled);
    const bear = putOnBattlefield(s, ap, greenBear());
    attach(s, opp, tangleKelp, bear);
    const idle = putOnBattlefield(s, ap, greenBear());
    s.objects[idle]!.tapped = true;
    s = attackThenNextTurn(s, ap, [{ attacker: sled, defender: opp }, { attacker: bear, defender: opp }]);
    expect(s.objects[sled]!.tapped).toBe(true);
    expect(s.objects[bear]!.tapped).toBe(true);
    expect(s.objects[idle]!.tapped).toBe(false);
    // They didn't attack this turn: the untap step after it untaps them.
    s = passTo(passTo(s, "main2", ap), "upkeep", ap);
    expect(s.objects[sled]!.tapped).toBe(false);
    expect(s.objects[bear]!.tapped).toBe(false);
  });
});

describe("the Apocalypse Sanctuaries: one effect, or another one instead with both colors (rulings)", () => {
  it("compiles them", () => supported(necraSanctuary, rakaSanctuary, cetaSanctuary, degaSanctuary, anaSanctuary));

  it("Necra Sanctuary: 3 life with a green-and-white permanent, 1 with only green, nothing with neither", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, necraSanctuary);
    const both = toUpkeep(s0, ap, { targets: [player(opp)] });
    expect(life(both, opp)).toBe(40);
    let s = structuredClone(s0);
    putOnBattlefield(s, ap, creature("Test Selesnya", "Creature — Elf", "{G}{W}", 2, 2));
    s = toUpkeep(s, ap, { targets: [player(opp)] });
    expect(life(s, opp)).toBe(37);
    s = structuredClone(s0);
    putOnBattlefield(s, ap, greenBear());
    s = toUpkeep(s, ap, { targets: [player(opp)] });
    expect(life(s, opp)).toBe(39);
  });

  it("Dega Sanctuary: 2 life, or 4 with a black permanent and a red one", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, degaSanctuary);
    putOnBattlefield(s0, ap, blackRat());
    expect(life(toUpkeep(structuredClone(s0), ap), ap)).toBe(42);
    putOnBattlefield(s0, ap, creature("Test Goblin", "Creature — Goblin", "{R}", 1, 1));
    expect(life(toUpkeep(s0, ap), ap)).toBe(44);
  });
});

describe("more of the least played", () => {
  it("compiles them", () => supported(keeperOfTresserhorn, limDulsPaladin, zealotsEnDal, wardenOfTheBeyond, walkingDream));

  it("Keeper of Tresserhorn: unblocked, it deals no combat damage and the defending player loses 2 life", () => {
    let { s, ap, opp } = setup([]);
    const keeper = putOnBattlefield(s, ap, keeperOfTresserhorn);
    s = block(toBlocks(s, ap, [{ attacker: keeper, defender: opp }]), opp, []);
    s = passTo(s, "main2", ap);
    expect(life(s, opp)).toBe(38);
  });

  it("Zealots en-Dal: 1 life only while all your nonland permanents are white", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, zealotsEnDal);
    putOnBattlefield(s0, ap, whiteKnight());
    expect(life(toUpkeep(structuredClone(s0), ap), ap)).toBe(41);
    putOnBattlefield(s0, ap, card("Test Relic", "Artifact", "{1}"));
    expect(life(toUpkeep(s0, ap), ap)).toBe(40);
  });

  it("Warden of the Beyond: +2/+2 while an opponent owns a card in exile, yours don't count", () => {
    let { s, ap, opp } = setup([]);
    const warden = putOnBattlefield(s, ap, wardenOfTheBeyond);
    const mine = into(s, ap, greenBear(), "graveyard");
    s.players[ap]!.graveyard.splice(s.players[ap]!.graveyard.indexOf(mine), 1);
    s.objects[mine]!.zone = "exile";
    s.players[ap]!.exile.push(mine);
    invalidateCharacteristics(s);
    expect(pt(s, warden)).toBe("2/2");
    const theirs = into(s, opp, greenBear(), "graveyard");
    s.players[opp]!.graveyard.splice(s.players[opp]!.graveyard.indexOf(theirs), 1);
    s.objects[theirs]!.zone = "exile";
    s.players[opp]!.exile.push(theirs);
    invalidateCharacteristics(s);
    expect(pt(s, warden)).toBe("4/4");
  });

  it("Walking Dream: doesn't untap while an opponent controls two or more creatures", () => {
    let { s, ap, opp } = setup([]);
    const dream = putOnBattlefield(s, ap, walkingDream);
    s.objects[dream]!.tapped = true;
    putOnBattlefield(s, opp, greenBear());
    s = passTo(passTo(s, "main2", ap), "upkeep", ap);
    expect(s.objects[dream]!.tapped).toBe(false);
    s.objects[dream]!.tapped = true;
    putOnBattlefield(s, opp, greenBear());
    s = passTo(passTo(s, "main2", ap), "upkeep", ap);
    expect(s.objects[dream]!.tapped).toBe(true);
  });
});
