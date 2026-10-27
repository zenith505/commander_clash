// Lane B, round 11: the least played cards first, working up the popularity list (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, addEffect, card, forest, island, mountain, passUntil, plainsCard, pt, putOnBattlefield, setup, swamp } from "./helpers";
import { characteristics, compileCard, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, potentialAttackers, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.yes ?? true });
    else if (p?.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets } as Action);
    else if (p?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: p.player, ids: opts.pick ?? p.options.slice(0, p.count) });
    else if (p?.kind === "discard") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
    else if (p) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const has = (s: GameState, id: string, k: string) => objHasKeyword(s, s.objects[id]!, k);
const chars = (s: GameState, id: string) => characteristics(s, s.objects[id]!);
const tokens = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid);
const creature = (name: string, typeLine: string, manaCost: string, p: number, t: number, extra: Partial<CardDef> = {}) =>
  card(name, typeLine, manaCost, { power: String(p), toughness: String(t), ...extra });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2);
const blueBird = () => creature("Blue Bird", "Creature — Bird", "{1}{U}", 1, 1);
const redGoblin = () => creature("Red Goblin", "Creature — Goblin", "{R}", 1, 1);
const gwElf = () => creature("Green-White Elf", "Creature — Elf", "{G}{W}", 2, 2, { colors: ["G", "W"] });
const bigOgre = () => creature("Big Ogre", "Creature — Ogre", "{4}{R}", 6, 6);
const into = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" = "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** A card put on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  invalidateCharacteristics(s);
  return id;
};
const attach = (s: GameState, pid: PlayerId, def: CardDef, to: string) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = to;
  invalidateCharacteristics(s);
  return id;
};
/** The next upkeep of `pid`, with its triggers resolved. */
const toUpkeep = (s: GameState, pid: PlayerId, opts: Parameters<typeof settle>[1] = {}) => settle(passUntil(s, "upkeep", pid), opts);
/** Attackers declared, the game paused on the defending players' blocks. */
const toBlocks = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) => {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Blocks declared by `opp`; every other defending player declares none. */
const block = (s: GameState, opp: PlayerId, blocks: { blocker: string; attacker: string }[]) => {
  s = act(s, { type: "declareBlockers", player: opp, blocks });
  for (let i = 0; i < 10 && s.pending?.kind === "declareBlockers"; i++) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
  return s;
};
/** Everyone passes (answering as `settle` does) until the game reaches `step` of `pid`'s turn. */
const passTo = (s: GameState, step: GameState["step"], pid: PlayerId, opts: Parameters<typeof settle>[1] = {}) => {
  for (let i = 0; i < 400 && !(s.step === step && s.activePlayer === pid && !s.stack.length && !s.pending); i++) {
    if (s.pending || s.stack.length || s.triggerQueue.length) {
      const before = JSON.stringify([s.pending, s.stack.length]);
      s = settle(s, opts);
      if (s.pending && JSON.stringify([s.pending, s.stack.length]) === before) throw new Error(`stuck on ${s.pending.kind}`);
    } else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** `pid`'s hand put on the bottom of their library. */
const emptyHand = (s: GameState, pid: PlayerId) => {
  const p = s.players[pid]!;
  for (const id of p.hand) s.objects[id]!.zone = "library";
  p.library.push(...p.hand);
  p.hand = [];
};
const testShock = () => card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "Test Shock deals 2 damage to any target." });
const testMill = () => card("Test Mill", "Sorcery", "{U}", { cmc: 1, oracleText: "Mill three cards." });
const testRaze = () => card("Test Raze", "Sorcery", "{B}", { cmc: 1, oracleText: "Destroy target creature." });
const wastes = card("Wastes", "Basic Land", "");
const vehicle = () => card("Test Cart", "Artifact — Vehicle", "{2}", { cmc: 2, power: "3", toughness: "3", keywords: ["Crew"], oracleText: "Crew 1" });


// Real oracle text (Scryfall).
const harvesterOfMisery = card("Harvester of Misery", "Creature — Spirit", "{3}{B}{B}", { cmc: 5, power: "5", toughness: "4", keywords: ["Menace"], oracleText: "Menace\nWhen this creature enters, other creatures get -2/-2 until end of turn.\n{1}{B}, Discard this card: Target creature gets -2/-2 until end of turn." });
const phthisis = card("Phthisis", "Sorcery", "{3}{B}{B}{B}{B}", { cmc: 7, keywords: ["Suspend"], oracleText: "Destroy target creature. Its controller loses life equal to its power plus its toughness.\nSuspend 5—{1}{B} (Rather than cast this card from your hand, you may pay {1}{B} and exile it with five time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost.)" });
const predatorsRapport = card("Predator's Rapport", "Instant", "{2}{G}", { cmc: 3, oracleText: "Choose target creature you control. You gain life equal to that creature's power plus its toughness." });
const turtleduck = card("Turtle-Duck", "Creature — Turtle Bird", "{G}", { cmc: 1, power: "0", toughness: "4", oracleText: "{3}: Until end of turn, this creature has base power 4 and gains trample." });
const championOfStraySouls = card("Champion of Stray Souls", "Creature — Skeleton Warrior", "{4}{B}{B}", { cmc: 6, power: "4", toughness: "4", oracleText: "{3}{B}{B}, {T}, Sacrifice X other creatures: Return X target creature cards from your graveyard to the battlefield.\n{5}{B}{B}: Put this card from your graveyard on top of your library." });
const fearsomeAwakening = card("Fearsome Awakening", "Sorcery", "{4}{B}", { cmc: 5, oracleText: "Return target creature card from your graveyard to the battlefield. If it's a Dragon, put two +1/+1 counters on it." });
const craterElemental = card("Crater Elemental", "Creature — Elemental", "{2}{R}", { cmc: 3, power: "0", toughness: "6", keywords: ["Formidable"], oracleText: "{R}, {T}, Sacrifice this creature: It deals 4 damage to target creature.\nFormidable — {2}{R}: This creature has base power 8 until end of turn. Activate only if creatures you control have total power 8 or greater." });
const defyDeath = card("Defy Death", "Sorcery", "{3}{W}{W}", { cmc: 5, oracleText: "Return target creature card from your graveyard to the battlefield. If it's an Angel, put two +1/+1 counters on it." });
const intimidationBolt = card("Intimidation Bolt", "Instant", "{1}{R}{W}", { cmc: 3, colors: ["R","W"], oracleText: "Intimidation Bolt deals 3 damage to target creature. Other creatures can't attack this turn." });
const islandOfWakwak = card("Island of Wak-Wak", "Land", "", { cmc: 0, oracleText: "{T}: Target creature with flying has base power 0 until end of turn." });
const singingTree = card("Singing Tree", "Creature — Plant", "{3}{G}", { cmc: 4, power: "0", toughness: "3", oracleText: "{T}: Target attacking creature has base power 0 until end of turn." });
const symmetrySage = card("Symmetry Sage", "Creature — Human Wizard", "{U}", { cmc: 1, power: "0", toughness: "2", keywords: ["Flying","Magecraft"], oracleText: "Flying\nMagecraft — Whenever you cast or copy an instant or sorcery spell, target creature you control has base power 2 until end of turn." });
const leylineOfSingularity = card("Leyline of Singularity", "Enchantment", "{2}{U}{U}", { cmc: 4, oracleText: "If this card is in your opening hand, you may begin the game with it on the battlefield.\nAll nonland permanents are legendary." });
const inBolassClutches = card("In Bolas's Clutches", "Legendary Enchantment — Aura", "{4}{U}{U}", { cmc: 6, keywords: ["Enchant"], oracleText: "Enchant permanent\nYou control enchanted permanent.\nEnchanted permanent is legendary." });
const hunterSliver = card("Hunter Sliver", "Creature — Sliver", "{1}{R}", { cmc: 2, power: "1", toughness: "1", oracleText: "All Sliver creatures have provoke. (Whenever a Sliver attacks, its controller may have target creature defending player controls untap and block it if able.)" });
const frozenInIce = card("Frozen in Ice", "Enchantment — Aura", "{2}{U}", { cmc: 3, keywords: ["Enchant"], oracleText: "Enchant creature\nWhen this Aura enters, tap enchanted creature.\nEnchanted creature loses all abilities and can't become untapped." });
const rope = card("Rope", "Artifact — Clue Equipment", "{G}", { cmc: 1, keywords: ["Equip"], oracleText: "Equipped creature gets +1/+2, has reach, and can't be blocked by more than one creature.\n{2}, Sacrifice this Equipment: Draw a card.\nEquip {3}" });
const kruphixsInsight = card("Kruphix's Insight", "Sorcery", "{2}{G}", { cmc: 3, oracleText: "Reveal the top six cards of your library. Put up to three enchantment cards from among them into your hand and the rest of the revealed cards into your graveyard." });
const glacialRevelation = card("Glacial Revelation", "Sorcery", "{2}{G}", { cmc: 3, oracleText: "Reveal the top six cards of your library. You may put any number of snow permanent cards from among them into your hand. Put the rest into your graveyard." });
const piecesOfThePuzzle = card("Pieces of the Puzzle", "Sorcery", "{2}{U}", { cmc: 3, oracleText: "Reveal the top five cards of your library. Put up to two instant and/or sorcery cards from among them into your hand and the rest into your graveyard." });
const spoilsOfVictory = card("Spoils of Victory", "Sorcery", "{2}{G}", { cmc: 3, oracleText: "Search your library for a Plains, Island, Swamp, Mountain, or Forest card and put that card onto the battlefield. Then shuffle." });
const specimenFreighter = card("Specimen Freighter", "Artifact — Spacecraft", "{5}{U}", { cmc: 6, power: "4", toughness: "7", keywords: ["Station","Mill"], oracleText: "When this Spacecraft enters, return up to two target non-Spacecraft creatures to their owners' hands.\nStation (Tap another creature you control: Put charge counters equal to its power on this Spacecraft. Station only as a sorcery. It's an artifact creature at 9+.)\n9+ | Flying\nWhenever this Spacecraft attacks, defending player mills four cards." });
const fanaticOfTheHarrowing = card("Fanatic of the Harrowing", "Creature — Human Cleric", "{3}{B}", { cmc: 4, power: "2", toughness: "2", oracleText: "When this creature enters, each player discards a card. If you discarded a card this way, draw a card." });
const doesMachines = card("Does Machines", "Enchantment — Class", "{1}{U}", { cmc: 2, keywords: ["Mill"], oracleText: "(Gain the next level as a sorcery to add its ability.)\nWhen this Class enters, mill two cards, draw two cards, then discard two cards.\n{1}{U}: Level 2\nWhen this Class becomes level 2, return up to two target artifact cards from your graveyard to your hand.\n{4}{U}: Level 3\nAt the beginning of combat on your turn, put three +1/+1 counters on target artifact you control. If it isn't a creature, it becomes a 0/0 Robot creature in addition to its other types." });
const theThanoscopter = card("The Thanos-Copter", "Legendary Artifact — Vehicle", "{6}", { cmc: 6, power: "5", toughness: "5", keywords: ["Flying","Haste","Crew"], oracleText: "Flying, haste\nWhen The Thanos-Copter enters, Vehicles you control become artifact creatures until end of turn.\nWhenever a Vehicle you control deals combat damage to a player, draw a card.\nCrew 2" });
const tectonicInstability = card("Tectonic Instability", "Enchantment", "{2}{R}", { cmc: 3, oracleText: "Whenever a land enters, tap all lands its controller controls." });
const sonarStrike = card("Sonar Strike", "Instant", "{1}{W}", { cmc: 2, oracleText: "Sonar Strike deals 4 damage to target attacking, blocking, or tapped creature. You gain 3 life if you control a Bat." });
const interpretTheSigns = card("Interpret the Signs", "Sorcery", "{5}{U}", { cmc: 6, keywords: ["Scry"], oracleText: "Scry 3, then reveal the top card of your library. Draw cards equal to that card's mana value. (To scry 3, look at the top three cards of your library, then put any number of them on the bottom and the rest on top in any order.)" });
const sifterWurm = card("Sifter Wurm", "Creature — Wurm", "{5}{G}{G}", { cmc: 7, power: "7", toughness: "7", keywords: ["Trample","Scry"], oracleText: "Trample\nWhen this creature enters, scry 3, then reveal the top card of your library. You gain life equal to that card's mana value." });
const triumphantChomp = card("Triumphant Chomp", "Sorcery", "{R}", { cmc: 1, oracleText: "Triumphant Chomp deals damage to target creature equal to 2 or the greatest power among Dinosaurs you control, whichever is greater." });
const goldenRatio = card("Golden Ratio", "Sorcery", "{1}{G}{U}", { cmc: 3, colors: ["G","U"], oracleText: "Draw a card for each different power among creatures you control." });
const corruptedResolve = card("Corrupted Resolve", "Instant", "{1}{U}", { cmc: 2, oracleText: "Counter target spell if its controller is poisoned." });
const hokoriDustDrinker = card("Hokori, Dust Drinker", "Legendary Creature — Spirit", "{2}{W}{W}", { cmc: 4, power: "2", toughness: "2", oracleText: "Lands don't untap during their controllers' untap steps.\nAt the beginning of each player's upkeep, that player untaps a land they control." });
const risingWaters = card("Rising Waters", "Enchantment", "{3}{U}", { cmc: 4, oracleText: "Lands don't untap during their controllers' untap steps.\nAt the beginning of each player's upkeep, that player untaps a land they control." });
const unexpectedlyAbsent = card("Unexpectedly Absent", "Instant", "{X}{W}{W}", { cmc: 2, oracleText: "Put target nonland permanent into its owner's library just beneath the top X cards of that library." });
const kirtarsWrath = card("Kirtar's Wrath", "Sorcery", "{4}{W}{W}", { cmc: 6, keywords: ["Threshold"], oracleText: "Destroy all creatures. They can't be regenerated.\nThreshold — If there are seven or more cards in your graveyard, instead destroy all creatures, then create two 1/1 white Spirit creature tokens with flying. Creatures destroyed this way can't be regenerated." });
// END CARDS

describe("Batch 1", () => {
  it("are fully supported", () => supported(harvesterOfMisery, phthisis, predatorsRapport, turtleduck, championOfStraySouls, fearsomeAwakening));

  it("Harvester of Misery gives every other creature -2/-2, anyone's, until end of turn", () => {
    let { s, ap, opp } = setup([]);
    const mine = putOnBattlefield(s, ap, bigOgre());
    const theirs = putOnBattlefield(s, opp, bigOgre());
    const bear = putOnBattlefield(s, opp, greenBear());
    s.players[ap]!.hand = [];
    const h = into(s, ap, harvesterOfMisery);
    putOnBattlefield(s, ap, swamp);
    putOnBattlefield(s, ap, swamp);
    s = settle(run(s, planCast(s, ap, h, [])));
    expect(zone(s, h)).toBe("battlefield");
    expect(pt(s, h)).toBe("5/4");
    expect(pt(s, mine)).toBe("4/4");
    expect(pt(s, theirs)).toBe("4/4");
    expect(zone(s, bear)).toBe("graveyard");
  });

  it("Phthisis: the controller loses life equal to the destroyed creature's power plus toughness", () => {
    let { s, ap, opp, ids } = setup([phthisis]);
    for (let i = 0; i < 2; i++) putOnBattlefield(s, ap, swamp);
    const ogre = putOnBattlefield(s, opp, bigOgre());
    addEffect(s, opp, [ogre], [{ kind: "modifyPT", power: 1, toughness: 0 }]);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(ogre)])));
    expect(zone(s, ogre)).toBe("graveyard");
    expect(life(s, opp)).toBe(40 - 13);
    expect(life(s, ap)).toBe(40);
  });

  it("Predator's Rapport gains power plus toughness", () => {
    let { s, ap, ids } = setup([predatorsRapport]);
    const ogre = putOnBattlefield(s, ap, bigOgre());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(ogre)])));
    expect(life(s, ap)).toBe(52);
  });

  it("Turtle-Duck has base power 4 and trample until end of turn; pumps still apply", () => {
    let { s, ap } = setup([]);
    const t = putOnBattlefield(s, ap, turtleduck);
    addEffect(s, ap, [t], [{ kind: "modifyPT", power: 1, toughness: 1 }]);
    expect(pt(s, t)).toBe("1/5");
    s = settle(run(s, planActivate(s, ap, t, 0, [])));
    expect(pt(s, t)).toBe("5/5");
    expect(has(s, t, "Trample")).toBe(true);
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(pt(s, t)).toBe("0/4");
  });

  it("Champion of Stray Souls goes from your graveyard to the top of your library", () => {
    let { s, ap } = setup([]);
    for (let i = 0; i < 2; i++) putOnBattlefield(s, ap, swamp);
    const c = into(s, ap, championOfStraySouls, "graveyard");
    s = settle(run(s, planActivate(s, ap, c, 1, [])));
    expect(s.players[ap]!.library[0]).toBe(c);
    expect(zone(s, c)).toBe("library");
  });

  it("Fearsome Awakening: two +1/+1 counters only on a Dragon", () => {
    let { s, ap, ids } = setup([fearsomeAwakening, fearsomeAwakening]);
    const dragon = into(s, ap, creature("Test Dragon", "Creature — Dragon", "{4}{R}", 4, 4), "graveyard");
    const bear = into(s, ap, greenBear(), "graveyard");
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(dragon)])));
    expect(zone(s, dragon)).toBe("battlefield");
    expect(pt(s, dragon)).toBe("6/6");
    putOnBattlefield(s, ap, swamp);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(bear)])));
    expect(zone(s, bear)).toBe("battlefield");
    expect(pt(s, bear)).toBe("2/2");
  });
});

describe("Batch 2", () => {
  it("are fully supported", () => supported(craterElemental, defyDeath, intimidationBolt, islandOfWakwak, singingTree, symmetrySage, leylineOfSingularity, inBolassClutches, hunterSliver, frozenInIce, rope));

  it("Intimidation Bolt: only its target can attack this turn, also over creatures that arrive later", () => {
    let { s, ap, opp, ids } = setup([intimidationBolt]);
    const ogre = putOnBattlefield(s, ap, bigOgre());
    const bear = putOnBattlefield(s, ap, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(ogre)])));
    expect(pt(s, ogre)).toBe("6/6");
    const late = putOnBattlefield(s, ap, greenBear(), { sick: false });
    expect(potentialAttackers(s, ap).map((o) => o.id)).toEqual([ogre]);
    expect([bear, late].every((id) => s.battlefield.includes(id))).toBe(true);
  });

  it("Intimidation Bolt: with its target dead, no creature can attack", () => {
    let { s, ap, opp, ids } = setup([intimidationBolt]);
    const bird = putOnBattlefield(s, ap, blueBird());
    const bear = putOnBattlefield(s, ap, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(bird)])));
    expect(zone(s, bird)).toBe("graveyard");
    expect(zone(s, bear)).toBe("battlefield");
    expect(potentialAttackers(s, ap)).toEqual([]);
  });

  it("Crater Elemental's formidable sets base power 8", () => {
    let { s, ap } = setup([]);
    const c = putOnBattlefield(s, ap, craterElemental);
    putOnBattlefield(s, ap, bigOgre());
    putOnBattlefield(s, ap, greenBear());
    s = settle(run(s, planActivate(s, ap, c, 1, [])));
    expect(pt(s, c)).toBe("8/6");
  });

  it("Singing Tree sets an attacker's base power to 0", () => {
    let { s, ap, opp } = setup([]);
    const ogre = putOnBattlefield(s, ap, bigOgre());
    const tree = putOnBattlefield(s, opp, singingTree);
    s = toBlocks(s, ap, [{ attacker: ogre, defender: opp }]);
    s = block(s, opp, []);
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(run(s, planActivate(s, opp, tree, 0, [tgt(ogre)])));
    expect(pt(s, ogre)).toBe("0/6");
  });

  it("Leyline of Singularity makes nonland permanents legendary, so the legend rule applies", () => {
    let { s, ap } = setup([]);
    const a = putOnBattlefield(s, ap, greenBear());
    const b = putOnBattlefield(s, ap, greenBear());
    putOnBattlefield(s, ap, leylineOfSingularity);
    const land = s.battlefield.find((id) => chars(s, id).types.includes("Land"))!;
    expect(chars(s, a).supertypes).toContain("Legendary");
    expect(chars(s, land).supertypes).not.toContain("Legendary");
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("legend");
    s = act(s, { type: "chooseOption", player: ap, choice: b });
    expect(zone(s, a)).toBe("graveyard");
    expect(zone(s, b)).toBe("battlefield");
  });

  it("In Bolas's Clutches takes the permanent and makes it legendary", () => {
    let { s, ap, opp, ids } = setup([inBolassClutches]);
    const ogre = putOnBattlefield(s, opp, bigOgre());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(ogre)])));
    expect(s.objects[ogre]!.controller === ap || chars(s, ogre).controller === ap).toBe(true);
    expect(chars(s, ogre).supertypes).toContain("Legendary");
  });

  it("Hunter Sliver gives Slivers provoke", () => {
    let { s, ap, opp } = setup([]);
    const hs = putOnBattlefield(s, ap, hunterSliver);
    const bear = putOnBattlefield(s, opp, greenBear());
    s.objects[bear]!.tapped = true;
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: hs, defender: opp }] });
    s = settle(s, { targets: [tgt(bear)] });
    expect(s.objects[bear]!.tapped).toBe(false);
  });

  it("Frozen in Ice: no abilities, and it can't become untapped", () => {
    let { s, ap, opp, ids } = setup([frozenInIce]);
    const elf = putOnBattlefield(s, opp, creature("Test Llanowar", "Creature — Elf", "{G}", 1, 1, { oracleText: "Flying" }));
    s.objects[elf]!.tapped = true;
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(elf)])));
    expect(has(s, elf, "Flying")).toBe(false);
    s = passUntil(s, "main1", opp);
    expect(s.objects[elf]!.tapped).toBe(true);
  });

  it("Rope: +1/+2, reach, and at most one blocker", () => {
    let { s, ap } = setup([]);
    const bear = putOnBattlefield(s, ap, greenBear());
    attach(s, ap, rope, bear);
    expect(pt(s, bear)).toBe("3/4");
    expect(has(s, bear, "Reach")).toBe(true);
    expect(chars(s, bear).maxOneBlocker).toBeTruthy();
  });
});

describe("Batch 3", () => {
  it("are fully supported", () => supported(kruphixsInsight, glacialRevelation, piecesOfThePuzzle, spoilsOfVictory, specimenFreighter, fanaticOfTheHarrowing, doesMachines, theThanoscopter, tectonicInstability, sonarStrike, interpretTheSigns, sifterWurm, triumphantChomp, goldenRatio, corruptedResolve, hokoriDustDrinker, risingWaters, unexpectedlyAbsent, kirtarsWrath));

  const ench = () => card("Test Aura", "Enchantment", "{W}", { cmc: 1, oracleText: "" });

  it("Kruphix's Insight takes up to three enchantment cards of the top six; the rest go to the graveyard", () => {
    let { s, ap, ids } = setup([kruphixsInsight]);
    const top = [ench(), greenBear(), ench(), ench(), ench(), greenBear()].reverse().map((d) => onTop(s, ap, d)).reverse();
    s = run(s, planCast(s, ap, ids[0]!, []));
    for (let i = 0; i < 10 && s.pending?.kind !== "searchLibrary"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind === "searchLibrary" && s.pending.max).toBe(3);
    s = act(s, { type: "searchLibrary", player: ap, found: [top[0]!, top[2]!, top[3]!] });
    s = settle(s);
    expect([top[0], top[2], top[3]].map((id) => zone(s, id!))).toEqual(["hand", "hand", "hand"]);
    expect([top[1], top[4], top[5]].map((id) => zone(s, id!))).toEqual(["graveyard", "graveyard", "graveyard"]);
  });

  it("Spoils of Victory puts a basic-land-typed card onto the battlefield", () => {
    let { s, ap, ids } = setup([spoilsOfVictory]);
    s = run(s, planCast(s, ap, ids[0]!, []));
    for (let i = 0; i < 10 && s.pending?.kind !== "searchLibrary"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const p = s.pending!;
    if (p.kind !== "searchLibrary") throw new Error("no search");
    expect(p.cards.length).toBeGreaterThan(0);
    s = act(s, { type: "searchLibrary", player: ap, found: [p.cards[0]!] });
    expect(zone(s, p.cards[0]!)).toBe("battlefield");
  });

  it("Fanatic of the Harrowing: everyone discards; you draw only if you discarded", () => {
    let { s, ap, opp } = setup([]);
    const f = into(s, ap, fanaticOfTheHarrowing);
    emptyHand(s, opp);
    into(s, opp, greenBear());
    s.players[ap]!.hand = [f];
    into(s, ap, greenBear());
    for (let i = 0; i < 2; i++) putOnBattlefield(s, ap, swamp);
    const libBefore = s.players[ap]!.library.length;
    s = settle(run(s, planCast(s, ap, f, [])));
    expect(s.players[opp]!.hand.length).toBe(0);
    expect(s.players[ap]!.library.length).toBe(libBefore - 1);
    expect(s.players[ap]!.hand.length).toBe(1);
  });

  it("Fanatic of the Harrowing: with an empty hand you don't draw", () => {
    let { s, ap } = setup([]);
    const f = into(s, ap, fanaticOfTheHarrowing);
    s.players[ap]!.hand = [f];
    for (let i = 0; i < 2; i++) putOnBattlefield(s, ap, swamp);
    const libBefore = s.players[ap]!.library.length;
    s = settle(run(s, planCast(s, ap, f, [])));
    expect(s.players[ap]!.library.length).toBe(libBefore);
  });

  it("Does Machines mills two, draws two, then discards two", () => {
    let { s, ap, ids } = setup([doesMachines]);
    const lib = s.players[ap]!.library.length;
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(s.players[ap]!.library.length).toBe(lib - 4);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2 - 2);
  });

  it("The Thanos-Copter makes your Vehicles artifact creatures until end of turn", () => {
    let { s, ap, opp } = setup([]);
    const cart = putOnBattlefield(s, ap, vehicle());
    const theirs = putOnBattlefield(s, opp, vehicle());
    const t = into(s, ap, theThanoscopter);
    s = settle(run(s, planCast(s, ap, t, [])));
    expect(chars(s, cart).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(chars(s, theirs).types).not.toContain("Creature");
    expect(chars(s, t).types).toContain("Creature");
  });

  it("Tectonic Instability taps all lands of the player whose land entered", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, tectonicInstability);
    const theirs = [putOnBattlefield(s, opp, forest), putOnBattlefield(s, opp, mountain)];
    const mine = s.battlefield.filter((id) => chars(s, id).types.includes("Land") && s.objects[id]!.controller === ap);
    const land = into(s, ap, forest);
    s = settle(act(s, { type: "playLand", player: ap, objectId: land } as Action));
    expect([...mine, land].every((id) => s.objects[id]!.tapped)).toBe(true);
    expect(theirs.some((id) => s.objects[id]!.tapped)).toBe(false);
  });

  it("Sonar Strike: an attacking, blocking, or tapped creature; 3 life only with a Bat", () => {
    let { s, ap, opp, ids } = setup([sonarStrike]);
    const untapped = putOnBattlefield(s, opp, bigOgre());
    const tapped = putOnBattlefield(s, opp, bigOgre());
    s.objects[tapped]!.tapped = true;
    expect(planCast(s, ap, ids[0]!, [tgt(untapped)])).toBeNull();
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(tapped)])));
    expect(s.objects[tapped]!.damage).toBe(4);
    expect(life(s, ap)).toBe(40);
    putOnBattlefield(s, ap, creature("Test Bat", "Creature — Bat", "{B}", 1, 1));
    const again = into(s, ap, sonarStrike);
    s = settle(run(s, planCast(s, ap, again, [tgt(tapped)])));
    expect(life(s, ap)).toBe(43);
  });

  it("Interpret the Signs draws cards equal to the revealed card's mana value", () => {
    let { s, ap, ids } = setup([interpretTheSigns]);
    putOnBattlefield(s, ap, island);
    const top = onTop(s, ap, bigOgre());
    s = run(s, planCast(s, ap, ids[0]!, []));
    for (let i = 0; i < 10 && s.pending?.kind !== "arrangeTop"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const p = s.pending!;
    if (p.kind !== "arrangeTop") throw new Error("no scry");
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [top, ...p.cards.filter((id) => id !== top)], away: [] }));
    expect(s.players[ap]!.hand.length).toBe(hand + 5);
    expect(zone(s, top)).toBe("hand");
  });

  it("Sifter Wurm gains life equal to the revealed card's mana value; a land gives none", () => {
    let { s, ap } = setup([]);
    const w = into(s, ap, sifterWurm);
    const top = onTop(s, ap, bigOgre());
    s = run(s, planCast(s, ap, w, []));
    for (let i = 0; i < 20 && s.pending?.kind !== "arrangeTop"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const p = s.pending!;
    if (p.kind !== "arrangeTop") throw new Error("no scry");
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [top, ...p.cards.filter((id) => id !== top)], away: [] }));
    expect(life(s, ap)).toBe(45);
    expect(s.players[ap]!.library[0]).toBe(top);
  });

  it("Triumphant Chomp deals 2, or the greatest Dinosaur power if greater", () => {
    let { s, ap, opp, ids } = setup([triumphantChomp, triumphantChomp]);
    const a = putOnBattlefield(s, opp, bigOgre());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(a)])));
    expect(s.objects[a]!.damage).toBe(2);
    putOnBattlefield(s, ap, creature("Test Dino", "Creature — Dinosaur", "{4}{G}", 5, 5));
    const b = putOnBattlefield(s, opp, bigOgre());
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    expect(s.objects[b]!.damage).toBe(5);
  });

  it("Golden Ratio draws one card per different power", () => {
    let { s, ap, ids } = setup([goldenRatio]);
    putOnBattlefield(s, ap, greenBear());
    putOnBattlefield(s, ap, greenBear());
    putOnBattlefield(s, ap, blueBird());
    putOnBattlefield(s, ap, bigOgre());
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3);
  });

  it("Corrupted Resolve counters only a poisoned player's spell", () => {
    let { s, ap, opp, ids } = setup([corruptedResolve, corruptedResolve]);
    const bolt = into(s, ap, testShock());
    s = run(s, planCast(s, ap, bolt, [player(opp)]));
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "stack", id: s.stack[0]!.id }]));
    s = settle(s);
    expect(life(s, opp)).toBe(38);
    s.players[ap]!.poison = 1;
    const bolt2 = into(s, ap, testShock());
    s = run(s, planCast(s, ap, bolt2, [player(opp)]));
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: s.stack[0]!.id }]));
    s = settle(s);
    expect(life(s, opp)).toBe(38);
    expect(zone(s, bolt2)).toBe("graveyard");
  });

  it("Rising Waters: lands stay tapped, but each player untaps one in their upkeep", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, risingWaters);
    const lands = s.battlefield.filter((id) => chars(s, id).types.includes("Land") && s.objects[id]!.controller === ap);
    for (const id of lands) s.objects[id]!.tapped = true;
    s = passUntil(s, "upkeep", ap);
    for (let i = 0; i < 20 && s.pending?.kind !== "pickPermanents"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const p = s.pending!;
    if (p.kind !== "pickPermanents") throw new Error("no pick");
    expect(p.player).toBe(ap);
    expect(p.count).toBe(1);
    s = act(s, { type: "pickPermanents", player: ap, ids: [lands[0]!] });
    expect(lands.filter((id) => !s.objects[id]!.tapped)).toEqual([lands[0]]);
  });

  it("Unexpectedly Absent puts the permanent just beneath the top X cards", () => {
    let { s, ap, opp, ids } = setup([unexpectedlyAbsent]);
    const ogre = putOnBattlefield(s, opp, bigOgre());
    const top3 = s.players[opp]!.library.slice(0, 3);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(ogre)], undefined, undefined, 2)));
    expect(s.players[opp]!.library.slice(0, 4)).toEqual([top3[0], top3[1], ogre, top3[2]]);
  });

  it("Kirtar's Wrath: with threshold, two Spirits too; no regeneration either way", () => {
    let { s, ap, opp, ids } = setup([kirtarsWrath]);
    for (let i = 0; i < 2; i++) putOnBattlefield(s, ap, plainsCard);
    const bear = putOnBattlefield(s, opp, greenBear());
    s.objects[bear]!.regenShields = 1;
    for (let i = 0; i < 7; i++) into(s, ap, greenBear(), "graveyard");
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(zone(s, bear)).toBe("graveyard");
    expect(tokens(s, ap).length).toBe(2);
  });
});
