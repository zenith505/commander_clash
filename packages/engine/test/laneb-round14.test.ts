// Lane B, round 14: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, parseManaCost, planActivate, planCast, planMana, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const battleCry = card("Battle Cry", "Instant", "{2}{W}", {cmc: 3,oracleText: "Untap all white creatures you control.\nWhenever a creature blocks this turn, it gets +0/+1 until end of turn."});
const burningPalmEfreet = card("Burning Palm Efreet", "Creature — Efreet", "{2}{R}{R}", {cmc: 4,power: "2",toughness: "2",oracleText: "{1}{R}{R}: This creature deals 2 damage to target creature with flying and that creature loses flying until end of turn."});
const chariotOfTheSun = card("Chariot of the Sun", "Artifact", "{3}", {cmc: 3,oracleText: "{2}, {T}: Until end of turn, target creature you control gains flying and has base toughness 1."});
const coldSnap = card("Cold Snap", "Enchantment", "{2}{W}", {cmc: 3,keywords: ["Cumulative upkeep"],oracleText: "Cumulative upkeep {2} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nAt the beginning of each player's upkeep, this enchantment deals damage to that player equal to the number of snow lands they control."});
const cursedLand = card("Cursed Land", "Enchantment — Aura", "{2}{B}{B}", {cmc: 4,keywords: ["Enchant"],oracleText: "Enchant land\nAt the beginning of the upkeep of enchanted land's controller, this Aura deals 1 damage to that player."});
const defilingTears = card("Defiling Tears", "Instant", "{2}{B}", {cmc: 3,keywords: ["Regenerate"],oracleText: "Until end of turn, target creature becomes black, gets +1/-1, and gains \"{B}: Regenerate this creature.\""});
const dragonsoulKnight = card("Dragonsoul Knight", "Creature — Human Knight", "{2}{R}", {cmc: 3,power: "2",toughness: "2",keywords: ["First strike"],oracleText: "First strike\n{W}{U}{B}{R}{G}: Until end of turn, this creature becomes a Dragon, gets +5/+3, and gains flying and trample."});
const duskworker = card("Duskworker", "Artifact Creature — Construct", "{4}", {cmc: 4,power: "2",toughness: "2",keywords: ["Regenerate"],oracleText: "Whenever this creature becomes blocked, regenerate it.\n{3}: This creature gets +1/+0 until end of turn."});
const electryte = card("Electryte", "Creature — Trilobite Beast", "{3}{R}{R}", {cmc: 5,power: "3",toughness: "3",oracleText: "Whenever this creature deals combat damage to defending player, it deals damage equal to its power to each blocking creature."});
const feedback = card("Feedback", "Enchantment — Aura", "{2}{U}", {cmc: 3,keywords: ["Enchant"],oracleText: "Enchant enchantment\nAt the beginning of the upkeep of enchanted enchantment's controller, this Aura deals 1 damage to that player."});
const fireAndBrimstone = card("Fire and Brimstone", "Instant", "{3}{W}{W}", {cmc: 5,oracleText: "Fire and Brimstone deals 4 damage to target player who attacked this turn and 4 damage to you."});
const gremlinInfestation = card("Gremlin Infestation", "Enchantment — Aura", "{3}{R}", {cmc: 4,keywords: ["Enchant"],oracleText: "Enchant artifact\nAt the beginning of your end step, this Aura deals 2 damage to enchanted artifact's controller.\nWhen enchanted artifact is put into a graveyard, create a 2/2 red Gremlin creature token."});
const indigoFaerie = card("Indigo Faerie", "Creature — Faerie Wizard", "{1}{U}", {cmc: 2,power: "1",toughness: "1",keywords: ["Flying"],oracleText: "Flying\n{U}: Target permanent becomes blue in addition to its other colors until end of turn."});
const jumpScare = card("Jump Scare", "Instant", "{W}", {cmc: 1,oracleText: "Until end of turn, target creature gets +2/+2, gains flying, and becomes a Horror enchantment creature in addition to its other types."});
const lairwatchGiant = card("Lairwatch Giant", "Creature — Giant Warrior", "{5}{W}", {cmc: 6,power: "5",toughness: "3",oracleText: "This creature can block an additional creature each combat.\nWhenever this creature blocks two or more creatures, it gains first strike until end of turn."});
const maChao = card("Ma Chao, Western Warrior", "Legendary Creature — Human Soldier Warrior", "{3}{R}{R}", {cmc: 5,power: "3",toughness: "3",keywords: ["Horsemanship"],oracleText: "Horsemanship (This creature can't be blocked except by creatures with horsemanship.)\nWhenever Ma Chao attacks alone, it can't be blocked this combat."});
const mageHuntersOnslaught = card("Mage Hunters' Onslaught", "Sorcery", "{2}{B}{B}", {cmc: 4,oracleText: "Destroy target creature or planeswalker.\nWhenever a creature blocks this turn, its controller loses 1 life."});
const marblePriest = card("Marble Priest", "Artifact Creature — Cleric", "{5}", {cmc: 5,power: "3",toughness: "3",oracleText: "All Walls able to block this creature do so.\nPrevent all combat damage that would be dealt to this creature by Walls."});
const maskOfIntolerance = card("Mask of Intolerance", "Artifact", "{2}", {cmc: 2,oracleText: "At the beginning of each player's upkeep, if there are four or more basic land types among lands that player controls, this artifact deals 3 damage to that player."});
const mistDragon = card("Mist Dragon", "Creature — Dragon", "{4}{U}{U}", {cmc: 6,power: "4",toughness: "4",oracleText: "{0}: This creature gains flying. (This effect lasts indefinitely.)\n{0}: This creature loses flying. (This effect lasts indefinitely.)\n{3}{U}{U}: This creature phases out. (While it's phased out, it's treated as though it doesn't exist. It phases in before you untap during your next untap step.)"});
const numbingDose = card("Numbing Dose", "Enchantment — Aura", "{3}{U}{U}", {cmc: 5,keywords: ["Enchant"],oracleText: "Enchant artifact or creature\nEnchanted permanent doesn't untap during its controller's untap step.\nAt the beginning of the upkeep of enchanted permanent's controller, that player loses 1 life."});
const pairedTactician = card("Paired Tactician", "Creature — Human Warrior", "{2}{W}", {cmc: 3,power: "3",toughness: "2",oracleText: "Whenever this creature and at least one other Warrior attack, put a +1/+1 counter on this creature."});
const paragonOfTheAmesha = card("Paragon of the Amesha", "Creature — Human Knight", "{2}{W}", {cmc: 3,power: "2",toughness: "2",keywords: ["First strike"],oracleText: "First strike\n{W}{U}{B}{R}{G}: Until end of turn, this creature becomes an Angel, gets +3/+3, and gains flying and lifelink."});
const powerTaint = card("Power Taint", "Enchantment — Aura", "{1}{U}", {cmc: 2,keywords: ["Enchant", "Cycling"],oracleText: "Enchant enchantment\nAt the beginning of the upkeep of enchanted enchantment's controller, that player loses 2 life unless they pay {2}.\nCycling {2} ({2}, Discard this card: Draw a card.)"});
const promisingDuskmage = card("Promising Duskmage", "Creature — Human Warlock", "{2}{B}", {cmc: 3,power: "2",toughness: "3",oracleText: "When this creature dies, if it had a +1/+1 counter on it, draw a card."});
const psychicAllergy = card("Psychic Allergy", "Enchantment", "{3}{U}{U}", {cmc: 5,oracleText: "As this enchantment enters, choose a color.\nAt the beginning of each opponent's upkeep, this enchantment deals X damage to that player, where X is the number of nontoken permanents of the chosen color they control.\nAt the beginning of your upkeep, destroy this enchantment unless you sacrifice two Islands."});
const ralsStaticaster = card("Ral's Staticaster", "Creature — Lizard Wizard", "{2}{U}{R}", {cmc: 4,power: "3",toughness: "3",keywords: ["Trample"],oracleText: "Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)\nWhenever this creature attacks, if you control a Ral planeswalker, this creature gets +1/+0 for each card in your hand until end of turn."});
const relicRunner = card("Relic Runner", "Creature — Human Rogue", "{1}{U}", {cmc: 2,power: "2",toughness: "1",oracleText: "This creature can't be blocked if you've cast a historic spell this turn. (Artifacts, legendaries, and Sagas are historic.)"});
const righteousIndignation = card("Righteous Indignation", "Enchantment", "{2}{W}", {cmc: 3,oracleText: "Whenever a creature blocks a black or red creature, the blocking creature gets +1/+1 until end of turn."});
const rookieMistake = card("Rookie Mistake", "Instant", "{U}", {cmc: 1,oracleText: "Until end of turn, target creature gets +0/+2 and another target creature gets -2/-0."});
const saprazzanOutrigger = card("Saprazzan Outrigger", "Creature — Merfolk", "{3}{U}", {cmc: 4,power: "5",toughness: "5",oracleText: "When this creature attacks or blocks, put it on top of its owner's library at end of combat."});
const sashAndWaistcoat = card("Sash and Waistcoat, Unmen", "Legendary Creature — Insect Rogue", "{1}{U}", {cmc: 2,power: "2",toughness: "2",keywords: ["Manifest"],oracleText: "Whenever a face-down creature attacks one of your opponents, it can't be blocked this combat.\n{3}: Manifest the top card of your library. Any player may activate this ability but only as a sorcery. (To manifest a card, put it onto the battlefield face down as a 2/2 creature. Turn it face up any time for its mana cost if it's a creature card.)"});
const sawtoothThresher = card("Sawtooth Thresher", "Artifact Creature — Construct", "{6}", {cmc: 6,power: "1",toughness: "1",keywords: ["Sunburst"],oracleText: "Sunburst (This creature enters with a +1/+1 counter on it for each color of mana spent to cast it.)\nRemove two +1/+1 counters from this creature: It gets +4/+4 until end of turn."});
const soldeviGolem = card("Soldevi Golem", "Artifact Creature — Golem", "{4}", {cmc: 4,power: "5",toughness: "3",oracleText: "This creature doesn't untap during your untap step.\nAt the beginning of your upkeep, you may untap target tapped creature an opponent controls. If you do, untap this creature."});
const soulNova = card("Soul Nova", "Instant", "{3}{W}{W}", {cmc: 5,oracleText: "Exile target attacking creature and all Equipment attached to it."});
const spiritualSanctuary = card("Spiritual Sanctuary", "Enchantment", "{2}{W}{W}", {cmc: 4,oracleText: "At the beginning of each player's upkeep, if that player controls a Plains, they gain 1 life."});
const stingingVitriol = card("Stinging Vitriol", "Sorcery", "{B}{R}", {cmc: 2,oracleText: "Stinging Vitriol deals 2 damage to target opponent. That player reveals their hand. You choose a nonland card from it. They discard that card."});
const strengthOfNight = card("Strength of Night", "Instant", "{2}{G}", {cmc: 3,keywords: ["Kicker"],oracleText: "Kicker {B} (You may pay an additional {B} as you cast this spell.)\nCreatures you control get +1/+1 until end of turn. If this spell was kicked, Zombie creatures you control get an additional +2/+2 until end of turn."});
const superiorNumbers = card("Superior Numbers", "Sorcery", "{G}{G}", {cmc: 2,oracleText: "Superior Numbers deals damage to target creature equal to the number of creatures you control in excess of the number of creatures target opponent controls."});
const talruumPiper = card("Talruum Piper", "Creature — Minotaur", "{4}{R}", {cmc: 5,power: "3",toughness: "3",oracleText: "All creatures with flying able to block this creature do so."});
const thoughtcutterAgent = card("Thoughtcutter Agent", "Artifact Creature — Human Rogue", "{U}{B}", {cmc: 2,power: "1",toughness: "1",oracleText: "{U}{B}, {T}: Target player loses 1 life and reveals their hand."});
const unforge = card("Unforge", "Instant", "{2}{R}", {cmc: 3,oracleText: "Destroy target Equipment. If that Equipment was attached to a creature, Unforge deals 2 damage to that creature."});
const warpArtifact = card("Warp Artifact", "Enchantment — Aura", "{B}{B}", {cmc: 2,keywords: ["Enchant"],oracleText: "Enchant artifact\nAt the beginning of the upkeep of enchanted artifact's controller, this Aura deals 1 damage to that player."});
const wingsOfVelisVel = card("Wings of Velis Vel", "Kindred Instant — Shapeshifter", "{1}{U}", {cmc: 2,keywords: ["Changeling"],oracleText: "Changeling (This card is every creature type.)\nUntil end of turn, target creature has base power and toughness 4/4, gains all creature types, and gains flying."});
const woeleecher = card("Woeleecher", "Creature — Elemental", "{5}{W}", {cmc: 6,power: "3",toughness: "5",oracleText: "{W}, {T}: Remove a -1/-1 counter from target creature. If you do, you gain 2 life."});
const wordOfBlasting = card("Word of Blasting", "Instant", "{1}{R}", {cmc: 2,oracleText: "Destroy target Wall. It can't be regenerated. Word of Blasting deals damage equal to that Wall's mana value to the Wall's controller."});
const wretchedBanquet = card("Wretched Banquet", "Sorcery", "{B}", {cmc: 1,oracleText: "Destroy target creature if it has the least power or is tied for least power among creatures on the battlefield."});
const yuanShaosInfantry = card("Yuan Shao's Infantry", "Creature — Human Soldier", "{3}{R}", {cmc: 4,power: "2",toughness: "2",oracleText: "Whenever this creature attacks alone, this creature can't be blocked this combat."});

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
const equipment = () => card("Test Blade", "Artifact — Equipment", "{1}", { oracleText: "Equipped creature gets +1/+0.\nEquip {1}" });
const wall = (mv: number) => creature("Test Wall", "Creature — Wall", `{${mv}}`, 0, 4, { cmc: mv, keywords: ["Defender"], oracleText: "Defender" });
const flier = () => creature("Test Bird", "Creature — Bird", "{1}{U}", 1, 1, { keywords: ["Flying"], oracleText: "Flying" });
const redGoblin = () => creature("Red Goblin", "Creature — Goblin", "{R}", 1, 1);

describe("spells that check as they resolve: Wretched Banquet, Unforge, Woeleecher, Superior Numbers", () => {
  it("compiles them", () => supported(wretchedBanquet, unforge, woeleecher, superiorNumbers, wordOfBlasting, soulNova));

  it("Wretched Banquet: destroys the creature with the least power, also when tied", () => {
    let { s, ap, opp, ids } = setup([wretchedBanquet]);
    const rat = putOnBattlefield(s, opp, blackRat());
    putOnBattlefield(s, ap, blackRat());
    putOnBattlefield(s, ap, bigOgre());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(rat)])));
    expect(zone(s, rat)).toBe("graveyard");
  });

  it("Wretched Banquet: does nothing if another creature has less power as it resolves (rulings)", () => {
    let { s, ap, opp, ids } = setup([wretchedBanquet]);
    const bear = putOnBattlefield(s, opp, greenBear());
    putOnBattlefield(s, ap, blackRat());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(bear)])));
    expect(zone(s, bear)).toBe("battlefield");
  });

  it("Unforge: the creature the Equipment was attached to as it was destroyed is dealt 2 damage", () => {
    let { s, ap, opp, ids } = setup([unforge]);
    const bear = putOnBattlefield(s, opp, greenBear());
    const blade = attach(s, opp, equipment(), bear);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(blade)])));
    expect(zone(s, blade)).toBe("graveyard");
    expect(zone(s, bear)).toBe("graveyard");
  });

  it("Unforge: an unattached Equipment is destroyed and nothing is dealt damage", () => {
    let { s, ap, opp, ids } = setup([unforge]);
    const blade = putOnBattlefield(s, opp, equipment());
    const bear = putOnBattlefield(s, opp, greenBear());
    const before = life(s, opp);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(blade)])));
    expect(zone(s, blade)).toBe("graveyard");
    expect(s.objects[bear]!.damage ?? 0).toBe(0);
    expect(life(s, opp)).toBe(before);
  });

  it("Woeleecher: removes a -1/-1 counter and you gain 2 life; with no counter to remove, no life", () => {
    let { s, ap, opp } = setup([]);
    const leech = putOnBattlefield(s, ap, woeleecher);
    const bear = putOnBattlefield(s, opp, greenBear());
    const ogre = putOnBattlefield(s, opp, bigOgre());
    s.objects[ogre]!.counters = { "-1/-1": 2 };
    invalidateCharacteristics(s);
    const start = life(s, ap);
    s = settle(run(s, planActivate(s, ap, leech, 0, [tgt(bear)])));
    expect(life(s, ap)).toBe(start);
    s.objects[leech]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, leech, 0, [tgt(ogre)])));
    expect(s.objects[ogre]!.counters?.["-1/-1"]).toBe(1);
    expect(life(s, ap)).toBe(start + 2);
  });

  it("Superior Numbers: damage equal to how many more creatures you control than the target opponent", () => {
    let { s, ap, opp, ids } = setup([superiorNumbers]);
    for (let i = 0; i < 4; i++) putOnBattlefield(s, ap, greenBear());
    putOnBattlefield(s, opp, greenBear());
    const ogre = putOnBattlefield(s, opp, bigOgre());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(ogre), player(opp)])));
    expect(s.objects[ogre]!.damage).toBe(2);
  });

  it("Superior Numbers: no damage when the opponent controls more creatures", () => {
    let { s, ap, opp, ids } = setup([superiorNumbers]);
    const bear = putOnBattlefield(s, ap, greenBear());
    for (let i = 0; i < 3; i++) putOnBattlefield(s, opp, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(bear), player(opp)])));
    expect(s.objects[bear]!.damage ?? 0).toBe(0);
    expect(zone(s, bear)).toBe("battlefield");
  });

  it("Word of Blasting: destroys the Wall, which can't be regenerated, and its controller is dealt its mana value", () => {
    let { s, ap, opp, ids } = setup([wordOfBlasting]);
    const w = putOnBattlefield(s, opp, wall(3));
    const before = life(s, opp);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(w)])));
    expect(zone(s, w)).toBe("graveyard");
    expect(life(s, opp)).toBe(before - 3);
  });
});

describe("each player's upkeep with an intervening if, and 'enchanted X's controller'", () => {
  it("compiles them", () => supported(maskOfIntolerance, spiritualSanctuary, coldSnap, cursedLand, feedback, warpArtifact, numbingDose, powerTaint, gremlinInfestation, psychicAllergy));

  it("Mask of Intolerance: the upkeep player with four or more basic land types is dealt 3, the others aren't", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, opp, maskOfIntolerance);
    putOnBattlefield(s, opp, card("Forest", "Basic Land — Forest"));
    const before = life(s, opp);
    s = toUpkeep(s, opp);
    expect(life(s, opp)).toBe(before);
    // You control all five basic land types (setup).
    const mine = life(s, ap);
    s = toUpkeep(s, ap);
    expect(life(s, ap)).toBe(mine - 3);
  });

  it("Spiritual Sanctuary: each upkeep player who controls a Plains gains 1 life", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, spiritualSanctuary);
    putOnBattlefield(s, opp, card("Forest", "Basic Land — Forest"));
    const before = life(s, opp);
    s = toUpkeep(s, opp);
    expect(life(s, opp)).toBe(before);
    const mine = life(s, ap);
    s = toUpkeep(s, ap);
    expect(life(s, ap)).toBe(mine + 1);
  });

  it("Cold Snap: each player is dealt damage equal to their snow lands in their upkeep", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, coldSnap);
    for (let i = 0; i < 2; i++) putOnBattlefield(s, opp, card("Snow-Covered Forest", "Basic Snow Land — Forest"));
    const before = life(s, opp);
    s = toUpkeep(s, opp);
    expect(life(s, opp)).toBe(before - 2);
  });

  it("Cursed Land: the enchanted land's controller is dealt 1 in their own upkeep only", () => {
    let { s, ap, opp } = setup([]);
    const land = putOnBattlefield(s, opp, card("Forest", "Basic Land — Forest"));
    attach(s, ap, cursedLand, land);
    const before = life(s, opp);
    const mine = life(s, ap);
    s = toUpkeep(s, opp);
    expect(life(s, opp)).toBe(before - 1);
    s = toUpkeep(s, ap);
    expect(life(s, ap)).toBe(mine);
    expect(life(s, opp)).toBe(before - 1);
  });

  it("Numbing Dose: the enchanted artifact's controller loses 1 life in their upkeep", () => {
    let { s, ap, opp } = setup([]);
    const relic = putOnBattlefield(s, opp, card("Test Relic", "Artifact", "{1}"));
    attach(s, ap, numbingDose, relic);
    const before = life(s, opp);
    s = toUpkeep(s, opp);
    expect(life(s, opp)).toBe(before - 1);
  });

  it("Gremlin Infestation: at your end step, 2 damage to the enchanted artifact's controller", () => {
    let { s, ap, opp } = setup([]);
    const relic = putOnBattlefield(s, opp, card("Test Relic", "Artifact", "{1}"));
    attach(s, ap, gremlinInfestation, relic);
    const before = life(s, opp);
    s = settle(passUntil(s, "end", ap));
    expect(life(s, opp)).toBe(before - 2);
  });

  it("Psychic Allergy: destroyed unless you sacrifice two Islands", () => {
    let { s, ap } = setup([]);
    const allergy = putOnBattlefield(s, ap, psychicAllergy);
    const islands = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Island" && s.objects[id]!.controller === ap);
    s = toUpkeep(s, ap, { yes: false });
    expect(zone(s, allergy)).toBe("graveyard");
    expect(islands.every((id) => zone(s, id) === "battlefield")).toBe(true);
  });
});

describe("block triggers: Righteous Indignation (CR 509.3b), Lairwatch Giant, Battle Cry, Mage Hunters' Onslaught", () => {
  it("compiles them", () => supported(righteousIndignation, lairwatchGiant, battleCry, mageHuntersOnslaught, duskworker, saprazzanOutrigger));

  it("Righteous Indignation: a creature blocking a black creature gets +1/+1; blocking a green one, nothing", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, opp, righteousIndignation);
    const rat = putOnBattlefield(s, ap, blackRat());
    const bear = putOnBattlefield(s, ap, greenBear());
    const k1 = putOnBattlefield(s, opp, whiteKnight());
    const k2 = putOnBattlefield(s, opp, whiteKnight());
    s = toBlocks(s, ap, [{ attacker: rat, defender: opp }, { attacker: bear, defender: opp }]);
    s = block(s, opp, [{ blocker: k1, attacker: rat }, { blocker: k2, attacker: bear }]);
    expect(pt(s, k1)).toBe("3/3");
    expect(pt(s, k2)).toBe("2/2");
  });

  it("Righteous Indignation: once for each black or red creature it blocks (CR 509.3b)", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, opp, righteousIndignation);
    const rat = putOnBattlefield(s, ap, blackRat());
    const goblin = putOnBattlefield(s, ap, redGoblin());
    const giant = putOnBattlefield(s, opp, lairwatchGiant);
    s = toBlocks(s, ap, [{ attacker: rat, defender: opp }, { attacker: goblin, defender: opp }]);
    s = block(s, opp, [{ blocker: giant, attacker: rat }, { blocker: giant, attacker: goblin }]);
    expect(pt(s, giant)).toBe("7/5");
  });

  it("Lairwatch Giant: first strike when it blocks two creatures, not one", () => {
    let { s, ap, opp } = setup([]);
    const b1 = putOnBattlefield(s, ap, greenBear());
    const b2 = putOnBattlefield(s, ap, greenBear());
    const giant = putOnBattlefield(s, opp, lairwatchGiant);
    s = block(toBlocks(s, ap, [{ attacker: b1, defender: opp }, { attacker: b2, defender: opp }]), opp, [{ blocker: giant, attacker: b1 }, { blocker: giant, attacker: b2 }]);
    expect(has(s, giant, "First strike")).toBe(true);
    let t = setup([]);
    const b3 = putOnBattlefield(t.s, t.ap, greenBear());
    const giant2 = putOnBattlefield(t.s, t.opp, lairwatchGiant);
    t.s = block(toBlocks(t.s, t.ap, [{ attacker: b3, defender: t.opp }]), t.opp, [{ blocker: giant2, attacker: b3 }]);
    expect(has(t.s, giant2, "First strike")).toBe(false);
  });

  it("Battle Cry: untaps your white creatures, and each creature that blocks this turn gets +0/+1", () => {
    let { s, ap, opp, ids } = setup([battleCry]);
    const knight = putOnBattlefield(s, ap, whiteKnight());
    s.objects[knight]!.tapped = true;
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[knight]!.tapped).toBe(false);
    const bear = putOnBattlefield(s, ap, greenBear());
    const blocker = putOnBattlefield(s, opp, whiteKnight());
    s = block(toBlocks(s, ap, [{ attacker: bear, defender: opp }]), opp, [{ blocker, attacker: bear }]);
    expect(pt(s, blocker)).toBe("2/3");
  });

  it("Mage Hunters' Onslaught: destroys the target, then each creature that blocks this turn costs its controller 1 life", () => {
    let { s, ap, opp, ids } = setup([mageHuntersOnslaught]);
    const ogre = putOnBattlefield(s, opp, bigOgre());
    const bear = putOnBattlefield(s, ap, greenBear());
    const k1 = putOnBattlefield(s, opp, whiteKnight());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(ogre)])));
    expect(zone(s, ogre)).toBe("graveyard");
    const before = life(s, opp);
    s = block(toBlocks(s, ap, [{ attacker: bear, defender: opp }]), opp, [{ blocker: k1, attacker: bear }]);
    expect(life(s, opp)).toBe(before - 1);
  });

  it("Duskworker: regenerates when it becomes blocked", () => {
    let { s, ap, opp } = setup([]);
    const dw = putOnBattlefield(s, ap, duskworker);
    const ogre = putOnBattlefield(s, opp, bigOgre());
    s = block(toBlocks(s, ap, [{ attacker: dw, defender: opp }]), opp, [{ blocker: ogre, attacker: dw }]);
    s = passTo(s, "main2", ap);
    expect(zone(s, dw)).toBe("battlefield");
    expect(s.objects[dw]!.tapped).toBe(true);
  });

  it("Saprazzan Outrigger: put on top of its owner's library at end of combat after it attacks", () => {
    let { s, ap, opp } = setup([]);
    const out = putOnBattlefield(s, ap, saprazzanOutrigger);
    s = toBlocks(s, ap, [{ attacker: out, defender: opp }]);
    s = block(s, opp, []);
    s = passTo(s, "main2", ap);
    expect(zone(s, out)).toBe("library");
    expect(s.players[ap]!.library[0]).toBe(out);
  });
});

describe("evasion and combat damage: Talruum Piper, Relic Runner, Yuan Shao's Infantry, Electryte", () => {
  it("compiles them", () => supported(talruumPiper, marblePriest, relicRunner, yuanShaosInfantry, maChao, electryte, pairedTactician, sashAndWaistcoat));

  it("Talruum Piper: each creature with flying able to block it must", () => {
    let { s, ap, opp } = setup([]);
    const piper = putOnBattlefield(s, ap, talruumPiper);
    const bird = putOnBattlefield(s, opp, flier());
    putOnBattlefield(s, opp, greenBear());
    s = toBlocks(s, ap, [{ attacker: piper, defender: opp }]);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [] })).toThrow(/creatures with flying/);
    s = block(s, opp, [{ blocker: bird, attacker: piper }]);
    expect(s.objects[bird]!.blocking).toEqual([piper]);
  });

  it("Relic Runner: unblockable only once you've cast a historic spell this turn", () => {
    let { s, ap, opp, ids } = setup([card("Test Relic", "Artifact", "{1}")]);
    const runner = putOnBattlefield(s, ap, relicRunner);
    const bear = putOnBattlefield(s, opp, greenBear());
    let t = toBlocks(structuredClone(s), ap, [{ attacker: runner, defender: opp }]);
    t = block(t, opp, [{ blocker: bear, attacker: runner }]);
    expect(t.objects[bear]!.blocking).toEqual([runner]);
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    s = toBlocks(s, ap, [{ attacker: runner, defender: opp }]);
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: bear, attacker: runner }] })).toThrow();
  });

  it("Yuan Shao's Infantry: attacking alone, it can't be blocked this combat; with another attacker it can", () => {
    let { s, ap, opp } = setup([]);
    const inf = putOnBattlefield(s, ap, yuanShaosInfantry);
    const bear = putOnBattlefield(s, opp, greenBear());
    const t = toBlocks(structuredClone(s), ap, [{ attacker: inf, defender: opp }]);
    expect(() => act(t, { type: "declareBlockers", player: opp, blocks: [{ blocker: bear, attacker: inf }] })).toThrow();
    const other = putOnBattlefield(s, ap, greenBear());
    s = toBlocks(s, ap, [{ attacker: inf, defender: opp }, { attacker: other, defender: opp }]);
    s = block(s, opp, [{ blocker: bear, attacker: inf }]);
    expect(s.objects[bear]!.blocking).toEqual([inf]);
  });

  it("Electryte: combat damage to a player deals its power to each blocking creature", () => {
    let { s, ap, opp } = setup([]);
    const el = putOnBattlefield(s, ap, electryte);
    const bear = putOnBattlefield(s, ap, greenBear());
    // The Wall survives the Bear's 2 damage, not the 3 more.
    const w = putOnBattlefield(s, opp, wall(2));
    const before = life(s, opp);
    s = block(toBlocks(s, ap, [{ attacker: el, defender: opp }, { attacker: bear, defender: opp }]), opp, [{ blocker: w, attacker: bear }]);
    s = passTo(s, "main2", ap);
    expect(life(s, opp)).toBe(before - 3);
    expect(zone(s, w)).toBe("graveyard");
  });

  it("Paired Tactician: a +1/+1 counter when it attacks with another Warrior", () => {
    let { s, ap, opp } = setup([]);
    const pt1 = putOnBattlefield(s, ap, pairedTactician);
    const warrior = putOnBattlefield(s, ap, creature("Test Warrior", "Creature — Human Warrior", "{1}{R}", 2, 1));
    s = block(toBlocks(s, ap, [{ attacker: pt1, defender: opp }, { attacker: warrior, defender: opp }]), opp, []);
    expect(s.objects[pt1]!.counters?.["+1/+1"]).toBe(1);
  });
});

describe("targets and riders: Fire and Brimstone, Soul Nova, Stinging Vitriol, Rookie Mistake, Thoughtcutter Agent", () => {
  it("compiles them", () => supported(fireAndBrimstone, stingingVitriol, rookieMistake, thoughtcutterAgent, burningPalmEfreet, soldeviGolem));

  it("Fire and Brimstone: only a player who attacked this turn can be the target; 4 damage to them and 4 to you", () => {
    let { s, ap, opp, ids } = setup([fireAndBrimstone]);
    const bear = putOnBattlefield(s, ap, greenBear());
    s = passUntil(s, "main1", opp);
    s = passUntil(s, "main1", ap);
    expect(planCast(s, ap, ids[0]!, [player(ap)])).toBeNull();
    s = block(toBlocks(s, ap, [{ attacker: bear, defender: opp }]), opp, []);
    s = passTo(s, "main2", ap);
    expect(planCast(s, ap, ids[0]!, [player(opp)])).toBeNull();
    const mine = life(s, ap);
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(ap)])));
    expect(life(s, ap)).toBe(mine - 8);
  });

  it("Soul Nova: exiles the attacking creature and the Equipment attached to it", () => {
    let { s, ap, opp } = setup([]);
    const bear = putOnBattlefield(s, opp, greenBear());
    const blade = attach(s, opp, equipment(), bear);
    s = passUntil(s, "main1", opp);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 20 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: bear, defender: ap }] });
    const nova = into(s, ap, soulNova);
    for (let i = 0; i < 10 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(run(s, planCast(s, ap, nova, [tgt(bear)])));
    expect(zone(s, bear)).toBe("exile");
    expect(zone(s, blade)).toBe("exile");
  });

  it("Stinging Vitriol: 2 damage, then you choose a nonland card from the revealed hand and they discard it", () => {
    let { s, ap, opp, ids } = setup([stingingVitriol]);
    emptyHand(s, opp);
    const land = into(s, opp, card("Forest", "Basic Land — Forest"));
    const ogre = into(s, opp, bigOgre());
    const before = life(s, opp);
    s = run(s, planCast(s, ap, ids[0]!, [player(opp)]));
    for (let i = 0; i < 20 && s.stack.length && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(life(s, opp)).toBe(before - 2);
    expect(s.pending?.player).toBe(ap);
    // Chosen from the revealed hand like a search: the land isn't offered.
    expect(s.pending?.kind === "searchLibrary" && s.pending.cards).toEqual([ogre]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ogre] }));
    expect(zone(s, ogre)).toBe("graveyard");
    expect(zone(s, land)).toBe("hand");
  });

  it("Rookie Mistake: +0/+2 to one target and -2/-0 to another", () => {
    let { s, ap, opp, ids } = setup([rookieMistake]);
    const bear = putOnBattlefield(s, ap, greenBear());
    const ogre = putOnBattlefield(s, opp, bigOgre());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(bear), tgt(ogre)])));
    expect(pt(s, bear)).toBe("2/4");
    expect(pt(s, ogre)).toBe("4/6");
  });

  it("Thoughtcutter Agent: the target player loses 1 life and reveals their hand", () => {
    let { s, ap, opp } = setup([]);
    const agent = putOnBattlefield(s, ap, thoughtcutterAgent);
    const before = life(s, opp);
    s = settle(run(s, planActivate(s, ap, agent, 0, [player(opp)])));
    expect(life(s, opp)).toBe(before - 1);
  });

  it("Burning Palm Efreet: 2 damage to a creature with flying, which loses flying until end of turn", () => {
    let { s, ap, opp } = setup([]);
    const efreet = putOnBattlefield(s, ap, burningPalmEfreet);
    const drake = putOnBattlefield(s, opp, creature("Test Drake", "Creature — Drake", "{3}{U}", 2, 4, { keywords: ["Flying"], oracleText: "Flying" }));
    const bear = putOnBattlefield(s, opp, greenBear());
    expect(planActivate(s, ap, efreet, 0, [tgt(bear)])).toBeNull();
    s = settle(run(s, planActivate(s, ap, efreet, 0, [tgt(drake)])));
    expect(s.objects[drake]!.damage).toBe(2);
    expect(has(s, drake, "Flying")).toBe(false);
  });

  it("Soldevi Golem: untapping an opponent's tapped creature untaps it too; with no tapped one, no trigger", () => {
    let { s, ap, opp } = setup([]);
    const golem = putOnBattlefield(s, ap, soldeviGolem);
    const bear = putOnBattlefield(s, opp, creature("Test Sleeper", "Creature — Bear", "{1}{G}", 2, 2, { oracleText: "This creature doesn't untap during your untap step." }));
    s.objects[golem]!.tapped = true;
    s = passUntil(s, "upkeep", ap);
    s = settle(s);
    expect(s.objects[golem]!.tapped).toBe(true);
    expect(s.log.some((l) => l.text.includes("no legal targets"))).toBe(true);
    s = passTo(s, "main1", ap);
    s.objects[bear]!.tapped = true;
    s = toUpkeep(s, ap, { targets: [tgt(bear)] });
    expect(s.objects[golem]!.tapped).toBe(false);
    expect(s.objects[bear]!.tapped).toBe(false);
  });
});

describe("'becomes' and P/T effects", () => {
  it("compiles them", () => supported(chariotOfTheSun, defilingTears, dragonsoulKnight, paragonOfTheAmesha, indigoFaerie, jumpScare, wingsOfVelisVel, mistDragon, strengthOfNight, ralsStaticaster, sawtoothThresher, promisingDuskmage));

  it("Chariot of the Sun: flying and base toughness 1 until end of turn", () => {
    let { s, ap } = setup([]);
    const chariot = putOnBattlefield(s, ap, chariotOfTheSun);
    const ogre = putOnBattlefield(s, ap, bigOgre());
    s = settle(run(s, planActivate(s, ap, chariot, 0, [tgt(ogre)])));
    expect(pt(s, ogre)).toBe("6/1");
    expect(has(s, ogre, "Flying")).toBe(true);
  });

  it("Defiling Tears: becomes black (only), +1/-1, and gains a regeneration ability", () => {
    let { s, ap, ids } = setup([defilingTears]);
    const bear = putOnBattlefield(s, ap, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(bear)])));
    expect(chars(s, bear).colors).toEqual(["B"]);
    expect(pt(s, bear)).toBe("3/1");
    expect(planActivate(s, ap, bear, 0)).not.toBeNull();
  });

  it("Paragon of the Amesha: an Angel only (rulings), +3/+3, flying and lifelink", () => {
    let { s, ap } = setup([]);
    const p = putOnBattlefield(s, ap, paragonOfTheAmesha);
    s = settle(run(s, planActivate(s, ap, p, 0)));
    expect(chars(s, p).subtypes).toEqual(["Angel"]);
    expect(pt(s, p)).toBe("5/5");
    expect(has(s, p, "Flying") && has(s, p, "Lifelink") && has(s, p, "First strike")).toBe(true);
  });

  it("Indigo Faerie: blue in addition to its other colors (rulings)", () => {
    let { s, ap, opp } = setup([]);
    const f = putOnBattlefield(s, ap, indigoFaerie);
    const bear = putOnBattlefield(s, opp, greenBear());
    const relic = putOnBattlefield(s, opp, card("Test Relic", "Artifact", "{1}"));
    s = settle(run(s, planActivate(s, ap, f, 0, [tgt(bear)])));
    s = settle(run(s, planActivate(s, ap, f, 0, [tgt(relic)])));
    expect([...chars(s, bear).colors].sort()).toEqual(["G", "U"]);
    expect(chars(s, relic).colors).toEqual(["U"]);
  });

  it("Jump Scare: +2/+2, flying, and a Horror enchantment creature in addition to its other types", () => {
    let { s, ap, ids } = setup([jumpScare]);
    const bear = putOnBattlefield(s, ap, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(bear)])));
    expect([...chars(s, bear).types].sort()).toEqual(["Creature", "Enchantment"]);
    expect([...chars(s, bear).subtypes].sort()).toEqual(["Bear", "Horror"]);
    expect(pt(s, bear)).toBe("4/4");
  });

  it("Wings of Velis Vel: base 4/4 and flying, counters still apply (rulings)", () => {
    let { s, ap, ids } = setup([wingsOfVelisVel]);
    const rat = putOnBattlefield(s, ap, blackRat());
    s.objects[rat]!.counters = { "+1/+1": 1 };
    invalidateCharacteristics(s);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(rat)])));
    expect(pt(s, rat)).toBe("5/5");
    expect(has(s, rat, "Flying")).toBe(true);
    expect(chars(s, rat).allCreatureTypes).toBe(true);
  });

  it("Mist Dragon: gains and loses flying indefinitely", () => {
    let { s, ap } = setup([]);
    const d = putOnBattlefield(s, ap, mistDragon);
    s = settle(run(s, planActivate(s, ap, d, 1)));
    expect(has(s, d, "Flying")).toBe(false);
    s = settle(run(s, planActivate(s, ap, d, 0)));
    s = passTo(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(has(s, d, "Flying")).toBe(true);
  });

  it("Strength of Night: +1/+1, and kicked, Zombies get +2/+2 more", () => {
    let { s, ap, ids } = setup([strengthOfNight]);
    const bear = putOnBattlefield(s, ap, greenBear());
    const zombie = putOnBattlefield(s, ap, creature("Test Zombie", "Creature — Zombie", "{1}{B}", 2, 2));
    s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { kicks: [0] })));
    expect(pt(s, bear)).toBe("3/3");
    expect(pt(s, zombie)).toBe("5/5");
  });

  it("Strength of Night unkicked: +1/+1 for everyone, the Zombie too", () => {
    let { s, ap, ids } = setup([strengthOfNight]);
    const zombie = putOnBattlefield(s, ap, creature("Test Zombie", "Creature — Zombie", "{1}{B}", 2, 2));
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(pt(s, zombie)).toBe("3/3");
  });

  it("Ral's Staticaster: +1/+0 for each card in your hand when it attacks, only if you control a Ral planeswalker", () => {
    let { s, ap, opp } = setup([]);
    const st = putOnBattlefield(s, ap, ralsStaticaster);
    emptyHand(s, ap);
    into(s, ap, greenBear());
    into(s, ap, greenBear());
    let t = block(toBlocks(structuredClone(s), ap, [{ attacker: st, defender: opp }]), opp, []);
    expect(pt(t, st)).toBe("3/3");
    const ral = putOnBattlefield(s, ap, card("Test Ral", "Legendary Planeswalker — Ral", "{2}{U}{R}", { loyalty: "4", oracleText: "+1: Draw a card." }));
    s.objects[ral]!.counters = { loyalty: 4 };
    s = block(toBlocks(s, ap, [{ attacker: st, defender: opp }]), opp, []);
    expect(pt(s, st)).toBe("5/3");
  });

  it("Sawtooth Thresher: remove two +1/+1 counters for +4/+4", () => {
    let { s, ap } = setup([]);
    const t = putOnBattlefield(s, ap, sawtoothThresher);
    s.objects[t]!.counters = { "+1/+1": 3 };
    invalidateCharacteristics(s);
    s = settle(run(s, planActivate(s, ap, t, 0)));
    expect(pt(s, t)).toBe("6/6");
    expect(planActivate(s, ap, t, 0)).toBeNull();
  });

  it("Promising Duskmage: draws a card if it died with a +1/+1 counter on it", () => {
    let { s, ap, opp } = setup([wretchedBanquet, wretchedBanquet]);
    const d1 = putOnBattlefield(s, ap, promisingDuskmage);
    s.objects[d1]!.counters = { "+1/+1": 1 };
    invalidateCharacteristics(s);
    const kill = card("Test Kill", "Instant", "{B}", { oracleText: "Destroy target creature." });
    const k = into(s, ap, kill);
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, k, [tgt(d1)])));
    expect(s.players[ap]!.hand.length).toBe(hand);
    const d2 = putOnBattlefield(s, opp, promisingDuskmage);
    const k2 = into(s, ap, kill);
    const oppHand = s.players[opp]!.hand.length;
    s = settle(run(s, planCast(s, ap, k2, [tgt(d2)])));
    expect(s.players[opp]!.hand.length).toBe(oppHand);
  });
});
