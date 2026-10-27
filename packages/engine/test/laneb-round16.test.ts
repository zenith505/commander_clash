// Lane B, round 16: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, parseManaCost, planActivate, planCast, planMana, planTurnFaceUp, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/**
 * Everyone passes until the stack is empty. "You may" questions get `yes`; a pending target choice gets `targets`; a pick
 * gets `pick` (or the first ones offered); a discard the first cards in hand; a copy keeps its targets; a scry keeps the
 * cards on top. Stops at any other question.
 */
const settle = (s: GameState, opts: { yes?: boolean; targets?: TargetChoice[]; pick?: string[] } = {}) => {
  for (let i = 0; i < 200 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = run(s, [...((opts.yes ?? true) && p.pay?.mana ? planMana(s, p.player, parseManaCost(p.pay.mana))! : []), { type: "chooseMay", player: p.player, yes: opts.yes ?? true }]);
    else if (p?.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets } as Action);
    else if (p?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: p.player, ids: opts.pick ?? p.options.slice(0, p.count) });
    else if (p?.kind === "discard") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
    else if (p?.kind === "copyTargets") s = act(s, { type: "copyTargets", player: p.player });
    else if (p?.kind === "arrangeTop") s = act(s, { type: "arrangeTop", player: p.player, top: p.cards, away: [] } as Action);
    else if (p) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const counters = (s: GameState, id: string, k: string) => s.objects[id]!.counters[k] ?? 0;
const creature = (name: string, typeLine: string, manaCost: string, p: number, t: number, extra: Partial<CardDef> = {}) =>
  card(name, typeLine, manaCost, { power: String(p), toughness: String(t), ...extra });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2, { cmc: 2 });
const into = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" | "library" = "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Empties a player's hand into their library, then gives them these cards. */
const handOf = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  const p = s.players[pid]!;
  for (const id of p.hand) s.objects[id]!.zone = "library";
  p.library.push(...p.hand);
  p.hand = [];
  return defs.map((d) => into(s, pid, d));
};
const names = (s: GameState, ids: string[]) => ids.map((id) => s.cards[s.objects[id]!.cardId]!.name);
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));

// Real oracle text (Scryfall).
const grimRepriser = card("Grim Repriser", "Creature — Zombie Bard", "{B}{R}", {cmc: 2,power: "2",toughness: "2",keywords: ["Prowess"],oracleText: "Prowess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)\n{B}{R}: Return this card from your graveyard to the battlefield with a finality counter on it. Activate only if an opponent has been dealt noncombat damage this turn. (If a creature with a finality counter on it would die, exile it instead.)"});
const proctorOfPotential = card("Proctor of Potential", "Creature — Human Cleric", "{W}{U}", {cmc: 2,power: "3",toughness: "1",keywords: ["Surveil"],oracleText: "Whenever this creature or another creature you control enters, surveil 1. (Look at the top card of your library. You may put it into your graveyard.)\n{W}{U}: Return this card from your graveyard to the battlefield with a finality counter on it. Activate only if you've scried or surveilled this turn. (If a creature with a finality counter on it would die, exile it instead.)"});
const resurrectedCultist = card("Resurrected Cultist", "Creature — Human Cleric", "{2}{B}", {cmc: 3,power: "4",toughness: "1",keywords: ["Delirium"],oracleText: "Delirium — {2}{B}{B}: Return this card from your graveyard to the battlefield with a finality counter on it. Activate only if there are four or more card types among cards in your graveyard and only as a sorcery. (If a creature with a finality counter on it would die, exile it instead.)"});
const balustradeWurm = card("Balustrade Wurm", "Creature — Wurm", "{3}{G}{G}", {cmc: 5,power: "5",toughness: "5",keywords: ["Delirium","Haste","Trample"],oracleText: "This spell can't be countered.\nTrample, haste\nDelirium — {2}{G}{G}: Return this card from your graveyard to the battlefield with a finality counter on it. Activate only if there are four or more card types among cards in your graveyard and only as a sorcery."});
const sandGolem = card("Sand Golem", "Artifact Creature — Golem", "{5}", {cmc: 5,power: "3",toughness: "3",oracleText: "When a spell or ability an opponent controls causes you to discard this card, return this card from your graveyard to the battlefield with a +1/+1 counter on it at the beginning of the next end step."});
const mangarasBlessing = card("Mangara's Blessing", "Instant", "{2}{W}", {cmc: 3,oracleText: "You gain 5 life.\nWhen a spell or ability an opponent controls causes you to discard this card, you gain 2 life, and you return this card from your graveyard to your hand at the beginning of the next end step."});
const quagnoth = card("Quagnoth", "Creature — Beast", "{5}{G}", {cmc: 6,power: "4",toughness: "5",keywords: ["Shroud","Split second"],oracleText: "Split second (As long as this spell is on the stack, players can't cast spells or activate abilities that aren't mana abilities.)\nShroud (This creature can't be the target of spells or abilities.)\nWhen a spell or ability an opponent controls causes you to discard this card, return it to your hand."});
const spiritualFocus = card("Spiritual Focus", "Enchantment", "{1}{W}", {cmc: 2,oracleText: "Whenever a spell or ability an opponent controls causes you to discard a card, you gain 2 life and you may draw a card."});
const metrognome = card("Metrognome", "Artifact", "{4}", {cmc: 4,oracleText: "When a spell or ability an opponent controls causes you to discard this card, create four 1/1 colorless Gnome artifact creature tokens.\n{4}, {T}: Create a 1/1 colorless Gnome artifact creature token."});
const dodecapod = card("Dodecapod", "Artifact Creature — Golem", "{4}", {cmc: 4,power: "3",toughness: "3",oracleText: "If a spell or ability an opponent controls causes you to discard this card, put it onto the battlefield with two +1/+1 counters on it instead of putting it into your graveyard."});
const psychicPurge = card("Psychic Purge", "Sorcery", "{U}", {cmc: 1,oracleText: "Psychic Purge deals 1 damage to any target.\nWhen a spell or ability an opponent controls causes you to discard this card, that player loses 5 life."});
const guerrillaTactics = card("Guerrilla Tactics", "Instant", "{1}{R}", {cmc: 2,oracleText: "Guerrilla Tactics deals 2 damage to any target.\nWhen a spell or ability an opponent controls causes you to discard this card, it deals 4 damage to any target."});
const ajanisLastStand = card("Ajani's Last Stand", "Enchantment", "{2}{W}{W}", {cmc: 4,oracleText: "Whenever a creature or planeswalker you control dies, you may sacrifice this enchantment. If you do, create a 4/4 white Avatar creature token with flying.\nWhen a spell or ability an opponent controls causes you to discard this card, if you control a Plains, create a 4/4 white Avatar creature token with flying."});
const bonethornValesk = card("Bonethorn Valesk", "Creature — Beast", "{4}{R}", {cmc: 5,power: "4",toughness: "2",oracleText: "Whenever a permanent is turned face up, this creature deals 1 damage to any target."});
const avenFarseer = card("Aven Farseer", "Creature — Bird Soldier", "{1}{W}", {cmc: 2,power: "1",toughness: "1",keywords: ["Flying"],oracleText: "Flying\nWhenever a permanent is turned face up, put a +1/+1 counter on this creature."});
const aphettoRunecaster = card("Aphetto Runecaster", "Creature — Human Wizard", "{3}{U}", {cmc: 4,power: "2",toughness: "3",oracleText: "Whenever a permanent is turned face up, you may draw a card."});
const unblinkingBleb = card("Unblinking Bleb", "Creature — Illusion", "{3}{U}", {cmc: 4,power: "1",toughness: "3",keywords: ["Morph","Scry"],oracleText: "Morph {2}{U} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)\nWhenever this creature or another permanent is turned face up, you may scry 2. (Look at the top two cards of your library, then put any number of them on the bottom and the rest on top in any order.)"});
const trueIdentity = card("True Identity", "Enchantment", "{1}{W}", {cmc: 2,keywords: ["Disguise","Scry"],oracleText: "Whenever this enchantment or another permanent you control is turned face up, scry 1, then draw a card. This ability triggers only once each turn.\nDisguise {W} (You may cast this card face down for {3} as a 2/2 creature with ward {2}. Turn it face up any time for its disguise cost.)"});
const masteryOfTheUnseen = card("Mastery of the Unseen", "Enchantment", "{1}{W}", {cmc: 2,keywords: ["Manifest"],oracleText: "Whenever a permanent you control is turned face up, you gain 1 life for each creature you control.\n{3}{W}: Manifest the top card of your library. (Put it onto the battlefield face down as a 2/2 creature. Turn it face up any time for its mana cost if it's a creature card.)"});
const secretPlans = card("Secret Plans", "Enchantment", "{G}{U}", {cmc: 2,oracleText: "Face-down creatures you control get +0/+1.\nWhenever a permanent you control is turned face up, draw a card."});
const pineWalker = card("Pine Walker", "Creature — Elemental", "{3}{G}{G}", {cmc: 5,power: "5",toughness: "5",keywords: ["Morph"],oracleText: "Morph {4}{G} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)\nWhenever this creature or another creature you control is turned face up, untap that creature."});
const sumalaSentry = card("Sumala Sentry", "Creature — Elf Archer", "{G}{W}", {cmc: 2,power: "1",toughness: "3",keywords: ["Reach"],oracleText: "Reach\nWhenever a face-down permanent you control is turned face up, put a +1/+1 counter on it and a +1/+1 counter on this creature."});
const pyrotechnicPerformer = card("Pyrotechnic Performer", "Creature — Lizard Assassin", "{1}{R}", {cmc: 2,power: "3",toughness: "2",keywords: ["Disguise"],oracleText: "Disguise {R} (You may cast this card face down for {3} as a 2/2 creature with ward {2}. Turn it face up any time for its disguise cost.)\nWhenever this creature or another creature you control is turned face up, that creature deals damage equal to its power to each opponent."});
const saltRoadAmbushers = card("Salt Road Ambushers", "Creature — Dog Warrior", "{3}{G}", {cmc: 4,power: "3",toughness: "3",keywords: ["Megamorph"],oracleText: "Whenever another permanent you control is turned face up, if it's a creature, put two +1/+1 counters on it.\nMegamorph {3}{G}{G} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its megamorph cost and put a +1/+1 counter on it.)"});
const temurWarShaman = card("Temur War Shaman", "Creature — Human Shaman", "{4}{G}{G}", {cmc: 6,power: "4",toughness: "5",keywords: ["Manifest","Fight"],oracleText: "When this creature enters, manifest the top card of your library. (Put that card onto the battlefield face down as a 2/2 creature. Turn it face up any time for its mana cost if it's a creature card.)\nWhenever a permanent you control is turned face up, if it's a creature, you may have it fight target creature you don't control."});
const trailOfMystery = card("Trail of Mystery", "Enchantment", "{1}{G}", {cmc: 2,oracleText: "Whenever a face-down creature you control enters, you may search your library for a basic land card, reveal it, put it into your hand, then shuffle.\nWhenever a permanent you control is turned face up, if it's a creature, it gets +2/+2 until end of turn."});
const perimeterEnforcer = card("Perimeter Enforcer", "Creature — Human Detective", "{1}{W}", {cmc: 2,power: "1",toughness: "1",keywords: ["Flying","Lifelink"],oracleText: "Flying, lifelink\nWhenever another Detective you control enters and whenever a Detective you control is turned face up, this creature gets +1/+1 until end of turn."});
const projektorInspector = card("Projektor Inspector", "Creature — Human Detective", "{2}{U}", {cmc: 3,power: "3",toughness: "2",oracleText: "Whenever this creature or another Detective you control enters and whenever a Detective you control is turned face up, you may draw a card. If you do, discard a card."});
const caseOfThePilferedProof = card("Case of the Pilfered Proof", "Enchantment — Case", "{1}{W}", {cmc: 2,keywords: ["Solved"],oracleText: "Whenever a Detective you control enters or is turned face up, put a +1/+1 counter on it.\nTo solve — You control three or more Detectives. (If unsolved, solve at the beginning of your end step.)\nSolved — If one or more tokens would be created under your control, those tokens plus a Clue token are created instead. (It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")"});
const planeswalkersScorn = card("Planeswalker's Scorn", "Enchantment", "{2}{B}", {cmc: 3,oracleText: "{3}{B}: Target opponent reveals a card at random from their hand. Target creature gets -X/-X until end of turn, where X is the revealed card's mana value. Activate only as a sorcery."});
const planeswalkersMirth = card("Planeswalker's Mirth", "Enchantment", "{2}{W}", {cmc: 3,oracleText: "{3}{W}: Target opponent reveals a card at random from their hand. You gain life equal to that card's mana value."});
const hiredTorturer = card("Hired Torturer", "Creature — Human Rogue", "{2}{B}", {cmc: 3,power: "2",toughness: "3",keywords: ["Defender"],oracleText: "Defender\n{3}{B}, {T}: Target opponent loses 2 life, then reveals a card at random from their hand."});
const singemindOgre = card("Singe-Mind Ogre", "Creature — Ogre Mutant", "{2}{B}{R}", {cmc: 4,power: "3",toughness: "2",oracleText: "When this creature enters, target player reveals a card at random from their hand, then loses life equal to that card's mana value."});
const planeswalkersFavor = card("Planeswalker's Favor", "Enchantment", "{2}{G}", {cmc: 3,oracleText: "{3}{G}: Target opponent reveals a card at random from their hand. Target creature gets +X/+X until end of turn, where X is the revealed card's mana value."});
const planeswalkersFury = card("Planeswalker's Fury", "Enchantment", "{2}{R}", {cmc: 3,oracleText: "{3}{R}: Target opponent reveals a card at random from their hand. This enchantment deals damage equal to that card's mana value to that player. Activate only as a sorcery."});
const merfolkSpy = card("Merfolk Spy", "Creature — Merfolk Rogue", "{U}", {cmc: 1,power: "1",toughness: "1",keywords: ["Landwalk","Islandwalk"],oracleText: "Islandwalk (This creature can't be blocked as long as defending player controls an Island.)\nWhenever this creature deals combat damage to a player, that player reveals a card at random from their hand."});
const igniteMemories = card("Ignite Memories", "Sorcery", "{4}{R}", {cmc: 5,keywords: ["Storm"],oracleText: "Target player reveals a card at random from their hand. Ignite Memories deals damage to that player equal to that card's mana value.\nStorm (When you cast this spell, copy it for each spell cast before it this turn. You may choose new targets for the copies.)"});

const desperateFuturescribe = card("Desperate Futurescribe", "Creature — Kor Scout", "{2}{W}{U}", {cmc: 4,power: "3",toughness: "4",keywords: ["Flying"],oracleText: "Flying\nAt the beginning of combat on your turn, another target creature you control gets +1/+1 until end of turn. If you've scried or surveilled this turn, put a +1/+1 counter on that creature instead."});
const gastalThrillroller = card("Gastal Thrillroller", "Artifact — Vehicle", "{2}{R}", {cmc: 3,power: "4",toughness: "2",keywords: ["Haste","Crew","Trample"],oracleText: "Trample, haste\nWhen this Vehicle enters, it becomes an artifact creature until end of turn.\nCrew 2\n{2}{R}, Discard a card: Return this card from your graveyard to the battlefield with a finality counter on it. Activate only as a sorcery."});
const uchbenbakTheGreatMistake = card("Uchbenbak, the Great Mistake", "Legendary Creature — Skeleton Horror", "{3}{U}{B}", {cmc: 5,power: "6",toughness: "4",keywords: ["Vigilance","Descend","Menace"],oracleText: "Vigilance, menace\nDescend 8 — {4}{U}{B}: Return this card from your graveyard to the battlefield with a finality counter on it. Activate only if there are eight or more permanent cards in your graveyard and only as a sorcery. (If a creature with a finality counter on it would die, exile it instead.)"});
const surveillancePhantasm = card("Surveillance Phantasm", "Creature — Bird Illusion", "{1}{U}", {cmc: 2,power: "2",toughness: "3",keywords: ["Flying","Surveil","Vigilance","Defender"],oracleText: "Defender, flying, vigilance\nAs long as you've scried or surveilled this turn, this creature can attack as though it didn't have defender.\n{3}{U}: Surveil 1. (Look at the top card of your library. You may put it into your graveyard.)"});
const whiplashWordsmith = scry(
  "prepare",
  [
    { name: "Whiplash Wordsmith", mana_cost: "{3}{B/R}", type_line: "Creature — Vampire Sorcerer", oracle_text: "This creature enters prepared. (While it's prepared, you may cast a copy of its spell. Doing so unprepares it.)\nAs long as an opponent was dealt noncombat damage this turn, this creature has flying and haste.", power: "3", toughness: "3" },
    { name: "Vicious Verse", mana_cost: "{B/R}", type_line: "Sorcery", oracle_text: "Vicious Verse deals 1 damage to target opponent." },
  ],
  { keywords: ["Prepared"] },
);

const mindRot = () => card("Test Mind Rot", "Sorcery", "{B}", { cmc: 1, oracleText: "Target player discards a card." });
const looter = () => creature("Test Looter", "Creature — Human", "{U}", 1, 1, { cmc: 1, oracleText: "{1}, Discard a card: Draw a card." });
const bolt = () => card("Test Bolt", "Instant", "{R}", { cmc: 1, oracleText: "This spell deals 3 damage to any target." });
const opt = () => card("Test Opt", "Instant", "{U}", { cmc: 1, oracleText: "Scry 1.\nDraw a card." });
const morph = () => creature("Test Morph", "Creature — Beast", "{3}{G}", 3, 3, { cmc: 4, keywords: ["Morph"], oracleText: "Morph {1}" });
const detective = () => creature("Test Detective", "Creature — Human Detective", "{2}{U}", 2, 3, { cmc: 3, keywords: ["Disguise"], oracleText: "Disguise {1}" });
const faceDownMorph = (name: string) => card(name, "Enchantment", "{2}", { cmc: 2, keywords: ["Morph"], oracleText: "Morph {1}" });

/** Casts `id` face down and resolves it. */
const castFaceDown = (s: GameState, pid: PlayerId, id: string, opts: Parameters<typeof settle>[1] = {}) => settle(run(s, planCast(s, pid, id, undefined, undefined, "auto", undefined, { faceDown: true })), opts);
/** Turns `id` face up (a special action), then lets what it triggered resolve. */
const turnUp = (s: GameState, pid: PlayerId, id: string, opts: Parameters<typeof settle>[1] = {}) => settle(run(s, planTurnFaceUp(s, pid, id)), opts);

describe("graveyard returns with a finality counter: Grim Repriser, Proctor of Potential, Resurrected Cultist, Balustrade Wurm", () => {
  it("compiles them", () => supported(grimRepriser, proctorOfPotential, resurrectedCultist, balustradeWurm));

  it("Grim Repriser: only once an opponent was dealt noncombat damage this turn, then it returns with a finality counter", () => {
    let { s, ap, opp, ids } = setup([bolt()]);
    const g = into(s, ap, grimRepriser, "graveyard");
    expect(planActivate(s, ap, g, 0)).toBeNull();
    // Damage to a creature or to yourself doesn't count; damage to an opponent does, whenever it was dealt (rulings).
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(life(s, opp)).toBe(37);
    s = settle(run(s, planActivate(s, ap, g, 0)));
    expect(zone(s, g)).toBe("battlefield");
    expect(counters(s, g, "finality")).toBe(1);
    expect(s.objects[g]!.tapped).toBeFalsy();
  });

  it("Grim Repriser: combat damage isn't noncombat damage", () => {
    let { s, ap, opp } = setup([]);
    const g = into(s, ap, grimRepriser, "graveyard");
    const b = putOnBattlefield(s, ap, greenBear());
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    s = passUntil(s, "main2", ap);
    expect(life(s, opp)).toBe(38);
    expect(planActivate(s, ap, g, 0)).toBeNull();
  });

  it("Proctor of Potential: only once you've scried or surveilled this turn", () => {
    let { s, ap, ids } = setup([opt()]);
    const p = into(s, ap, proctorOfPotential, "graveyard");
    expect(planActivate(s, ap, p, 0)).toBeNull();
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 20 && s.pending?.kind !== "arrangeTop"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const pend = s.pending!;
    if (pend.kind !== "arrangeTop") throw new Error("no scry");
    s = settle(act(s, { type: "arrangeTop", player: ap, top: pend.cards, away: [] } as Action));
    s = settle(run(s, planActivate(s, ap, p, 0)));
    expect(zone(s, p)).toBe("battlefield");
    expect(counters(s, p, "finality")).toBe(1);
  });

  it("Resurrected Cultist and Balustrade Wurm: delirium, as a sorcery, untapped with a finality counter", () => {
    let { s, ap } = setup([]);
    const c = into(s, ap, resurrectedCultist, "graveyard");
    const w = into(s, ap, balustradeWurm, "graveyard");
    // Creature only so far.
    expect(planActivate(s, ap, c, 0)).toBeNull();
    into(s, ap, bolt(), "graveyard");
    into(s, ap, card("Test Land", "Land"), "graveyard");
    into(s, ap, card("Test Relic", "Artifact", "{1}", { cmc: 1 }), "graveyard");
    s = settle(run(s, planActivate(s, ap, c, 0)));
    expect(zone(s, c)).toBe("battlefield");
    expect(counters(s, c, "finality")).toBe(1);
    // Still delirium (the Wurm, an instant, a land and an artifact).
    s = settle(run(s, planActivate(s, ap, w, 0)));
    expect(zone(s, w)).toBe("battlefield");
    expect(s.objects[w]!.tapped).toBeFalsy();
    // A finality counter: if it would die, it's exiled instead (CR 122.1h).
    s.objects[w]!.damage = 5;
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(zone(s, w)).toBe("exile");
  });
});

describe("a discard an opponent's spell or ability causes: Sand Golem, Metrognome, Psychic Purge, Guerrilla Tactics, Quagnoth, Mangara's Blessing, Ajani's Last Stand, Spiritual Focus, Dodecapod", () => {
  it("compiles them", () => supported(sandGolem, metrognome, psychicPurge, guerrillaTactics, quagnoth, mangarasBlessing, ajanisLastStand, spiritualFocus, dodecapod));

  it("Sand Golem: discarded to an opponent's spell, it returns at the next end step with a +1/+1 counter", () => {
    let { s, ap, opp, ids } = setup([mindRot()]);
    const [g] = handOf(s, opp, [sandGolem]);
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(zone(s, g!)).toBe("graveyard");
    s = settle(passUntil(s, "end", ap));
    expect(zone(s, g!)).toBe("battlefield");
    expect(s.objects[g!]!.controller).toBe(opp);
    expect(counters(s, g!, "+1/+1")).toBe(1);
  });

  it("Sand Golem: not when you discard it to your own spell or to pay a cost (rulings on Psychic Purge)", () => {
    let { s, ap, ids } = setup([mindRot()]);
    const [g, l] = handOf(s, ap, [sandGolem, looter()]);
    s = settle(run(s, planCast(s, ap, l!)));
    s = settle(run(s, planActivate(s, ap, l!, 0, undefined, undefined, undefined, undefined, { discard: [g!] })));
    expect(zone(s, g!)).toBe("graveyard");
    s = settle(passUntil(s, "end", ap));
    expect(zone(s, g!)).toBe("graveyard");
    void ids;
  });

  it("Psychic Purge: the opponent whose spell made you discard it loses 5 life; Metrognome makes four Gnomes", () => {
    let { s, ap, opp, ids } = setup([mindRot(), mindRot()]);
    const [purge, gnome] = handOf(s, opp, [psychicPurge, metrognome]);
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(zone(s, purge!)).toBe("graveyard");
    expect(life(s, ap)).toBe(35);
    const before = s.battlefield.length;
    s = settle(run(s, planCast(s, ap, ids[1]!, [player(opp)])));
    expect(zone(s, gnome!)).toBe("graveyard");
    const gnomes = s.battlefield.filter((id) => s.objects[id]!.controller === opp && characteristics(s, s.objects[id]!).subtypes.includes("Gnome"));
    expect(gnomes.length).toBe(4);
    expect(s.battlefield.length - before).toBe(4);
  });

  it("Guerrilla Tactics: the card deals 4 damage to any target; Quagnoth returns to its owner's hand", () => {
    let { s, ap, opp, ids } = setup([mindRot(), mindRot()]);
    const [gt, q] = handOf(s, opp, [guerrillaTactics, quagnoth]);
    const b = putOnBattlefield(s, ap, creature("Big Bear", "Creature — Bear", "{3}{G}", 4, 4, { cmc: 4 }));
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])), { targets: [tgt(b)] });
    expect(zone(s, gt!)).toBe("graveyard");
    expect(zone(s, b)).toBe("graveyard");
    s = settle(run(s, planCast(s, ap, ids[1]!, [player(opp)])));
    expect(zone(s, q!)).toBe("hand");
    expect(s.players[opp]!.hand).toContain(q!);
  });

  it("Mangara's Blessing: 2 life now, back to its owner's hand at the next end step", () => {
    let { s, ap, opp, ids } = setup([mindRot()]);
    const [m] = handOf(s, opp, [mangarasBlessing]);
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(life(s, opp)).toBe(42);
    expect(zone(s, m!)).toBe("graveyard");
    s = settle(passUntil(s, "end", ap));
    expect(zone(s, m!)).toBe("hand");
  });

  it("Ajani's Last Stand: a 4/4 flying Avatar only if its owner controls a Plains", () => {
    let { s, ap, opp, ids } = setup([mindRot(), mindRot()]);
    const [a1, a2] = handOf(s, opp, [ajanisLastStand, ajanisLastStand]);
    const avatars = (x: GameState) => x.battlefield.filter((id) => x.objects[id]!.controller === opp && characteristics(x, x.objects[id]!).subtypes.includes("Avatar")).length;
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(zone(s, a1!)).toBe("graveyard");
    expect(avatars(s)).toBe(0);
    putOnBattlefield(s, opp, card("Plains", "Basic Land — Plains"));
    s = settle(run(s, planCast(s, ap, ids[1]!, [player(opp)])));
    expect(zone(s, a2!)).toBe("graveyard");
    expect(avatars(s)).toBe(1);
  });

  it("Spiritual Focus: 2 life and a card when an opponent's spell makes you discard, not your own", () => {
    let { s, ap, opp, ids } = setup([mindRot(), mindRot()]);
    putOnBattlefield(s, opp, spiritualFocus);
    handOf(s, opp, [greenBear(), greenBear()]);
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(life(s, opp)).toBe(42);
    expect(s.players[opp]!.hand.length).toBe(2); // one discarded, one drawn
    // Its controller's own spell: no trigger.
    const f2 = putOnBattlefield(s, ap, spiritualFocus);
    s = settle(run(s, planCast(s, ap, ids[1]!, [player(ap)])));
    expect(life(s, ap)).toBe(40);
    void f2;
  });

  it("Dodecapod: onto the battlefield with two +1/+1 counters instead, and still discarded", () => {
    let { s, ap, opp, ids } = setup([mindRot()]);
    putOnBattlefield(s, opp, spiritualFocus);
    const [d] = handOf(s, opp, [dodecapod]);
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(zone(s, d!)).toBe("battlefield");
    expect(counters(s, d!, "+1/+1")).toBe(2);
    expect(pt(s, d!)).toBe("5/5");
    // It was discarded all the same (rulings): Spiritual Focus triggers.
    expect(life(s, opp)).toBe(42);
  });
});

describe("more finality returns and scry/noncombat conditions: Gastal Thrillroller, Uchbenbak, Desperate Futurescribe, Surveillance Phantasm, Whiplash Wordsmith", () => {
  it("compiles them", () => supported(gastalThrillroller, uchbenbakTheGreatMistake, desperateFuturescribe, surveillancePhantasm, whiplashWordsmith));

  it("Gastal Thrillroller: discard a card to return it with a finality counter, as a sorcery", () => {
    let { s, ap } = setup([]);
    const [h] = handOf(s, ap, [greenBear()]);
    const g = into(s, ap, gastalThrillroller, "graveyard");
    // (Its first ability is crew.)
    s = settle(run(s, planActivate(s, ap, g, 1, undefined, undefined, undefined, undefined, { discard: [h!] })));
    expect(zone(s, g)).toBe("battlefield");
    expect(zone(s, h!)).toBe("graveyard");
    expect(counters(s, g, "finality")).toBe(1);
  });

  it("Desperate Futurescribe: +1/+1 until end of turn, or a +1/+1 counter once you've scried", () => {
    let { s, ap, ids } = setup([opt()]);
    putOnBattlefield(s, ap, desperateFuturescribe);
    const b = putOnBattlefield(s, ap, greenBear());
    s = passUntil(s, "beginCombat", ap);
    s = settle(s, { targets: [tgt(b)] });
    expect(pt(s, b)).toBe("3/3");
    expect(counters(s, b, "+1/+1")).toBe(0);
    // Next turn, scry first.
    s = passUntil(s, "main1", ap);
    s = run(s, planCast(s, ap, s.players[ap]!.hand.find((id) => names(s, [id])[0] === "Test Opt") ?? ids[0]!));
    for (let i = 0; i < 20 && s.pending?.kind !== "arrangeTop"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const pend = s.pending!;
    if (pend.kind !== "arrangeTop") throw new Error("no scry");
    s = settle(act(s, { type: "arrangeTop", player: ap, top: pend.cards, away: [] } as Action));
    s = passUntil(s, "beginCombat", ap);
    s = settle(s, { targets: [tgt(b)] });
    expect(counters(s, b, "+1/+1")).toBe(1);
    expect(pt(s, b)).toBe("3/3");
  });

  it("Surveillance Phantasm: attacks as though it didn't have defender once you've surveilled", () => {
    let { s, ap } = setup([]);
    const p = putOnBattlefield(s, ap, surveillancePhantasm);
    expect(characteristics(s, s.objects[p]!).canAttackDespiteDefender ?? false).toBe(false);
    s = settle(run(s, planActivate(s, ap, p, 0)));
    for (let i = 0; i < 20 && s.pending?.kind === "arrangeTop"; i++) s = settle(act(s, { type: "arrangeTop", player: ap, top: [], away: (s.pending as { cards: string[] }).cards } as Action));
    expect(s.turnLog?.scried).toContain(ap);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: p, defender: s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]! }] });
    expect(s.objects[p]!.attacking).toBeDefined();
  });

  it("Whiplash Wordsmith: flying and haste once an opponent was dealt noncombat damage this turn", () => {
    let { s, ap, opp, ids } = setup([bolt()]);
    const w = putOnBattlefield(s, ap, whiplashWordsmith);
    expect(objHasKeyword(s, s.objects[w]!, "Flying")).toBe(false);
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(objHasKeyword(s, s.objects[w]!, "Flying")).toBe(true);
    expect(objHasKeyword(s, s.objects[w]!, "Haste")).toBe(true);
  });
});

describe("a permanent turned face up: Aven Farseer, Bonethorn Valesk, Trail of Mystery, Pine Walker, the Detectives and the rest", () => {
  it("compiles them", () =>
    supported(bonethornValesk, avenFarseer, aphettoRunecaster, unblinkingBleb, trueIdentity, masteryOfTheUnseen, secretPlans, pineWalker, sumalaSentry, pyrotechnicPerformer, saltRoadAmbushers, temurWarShaman, trailOfMystery, perimeterEnforcer, projektorInspector, caseOfThePilferedProof));

  it("Aven Farseer: a +1/+1 counter whenever any permanent is turned face up, anyone's", () => {
    let { s, ap, opp, ids } = setup([morph()]);
    const f = putOnBattlefield(s, opp, avenFarseer);
    s = castFaceDown(s, ap, ids[0]!);
    expect(counters(s, f, "+1/+1")).toBe(0); // casting it face down isn't turning it face up
    s = turnUp(s, ap, ids[0]!);
    expect(counters(s, f, "+1/+1")).toBe(1);
  });

  it("Bonethorn Valesk: 1 damage to any target", () => {
    let { s, ap, opp, ids } = setup([morph()]);
    putOnBattlefield(s, ap, bonethornValesk);
    s = castFaceDown(s, ap, ids[0]!);
    s = turnUp(s, ap, ids[0]!, { targets: [player(opp)] });
    expect(life(s, opp)).toBe(39);
  });

  it("Trail of Mystery and Salt Road Ambushers: only if it's a creature (an intervening if, CR 603.4)", () => {
    let { s, ap, ids } = setup([morph()]);
    putOnBattlefield(s, ap, trailOfMystery);
    const sra = putOnBattlefield(s, ap, saltRoadAmbushers);
    s = castFaceDown(s, ap, ids[0]!, { yes: false }); // (Trail's land search: no)
    s = turnUp(s, ap, ids[0]!);
    expect(counters(s, ids[0]!, "+1/+1")).toBe(2);
    expect(pt(s, ids[0]!)).toBe("7/7");
    // Salt Road Ambushers' "another": not when it's turned face up itself.
    expect(counters(s, sra, "+1/+1")).toBe(0);
  });

  it("Pine Walker: untap the creature turned face up (itself too)", () => {
    let { s, ap, ids } = setup([morph()]);
    putOnBattlefield(s, ap, pineWalker);
    s = castFaceDown(s, ap, ids[0]!);
    s.objects[ids[0]!]!.tapped = true;
    s = turnUp(s, ap, ids[0]!);
    expect(s.objects[ids[0]!]!.tapped).toBe(false);
  });

  it("Sumala Sentry: a counter on the permanent turned face up and one on itself; Secret Plans and Aphetto Runecaster draw", () => {
    let { s, ap, ids } = setup([morph()]);
    const ss = putOnBattlefield(s, ap, sumalaSentry);
    putOnBattlefield(s, ap, secretPlans);
    putOnBattlefield(s, ap, aphettoRunecaster);
    s = castFaceDown(s, ap, ids[0]!);
    const hand = s.players[ap]!.hand.length;
    s = turnUp(s, ap, ids[0]!);
    expect(counters(s, ids[0]!, "+1/+1")).toBe(1);
    expect(counters(s, ss, "+1/+1")).toBe(1);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("Mastery of the Unseen: only permanents you control; 1 life for each creature you control", () => {
    let { s, ap, opp, ids } = setup([morph()]);
    putOnBattlefield(s, opp, masteryOfTheUnseen);
    s = castFaceDown(s, ap, ids[0]!);
    s = turnUp(s, ap, ids[0]!);
    expect(life(s, opp)).toBe(40);
    let g = setup([morph()]);
    putOnBattlefield(g.s, g.ap, masteryOfTheUnseen);
    putOnBattlefield(g.s, g.ap, greenBear());
    g.s = castFaceDown(g.s, g.ap, g.ids[0]!);
    g.s = turnUp(g.s, g.ap, g.ids[0]!);
    expect(life(g.s, g.ap)).toBe(42);
  });

  it("Pyrotechnic Performer: the creature turned face up deals damage equal to its power to each opponent", () => {
    let { s, ap, ids } = setup([morph()]);
    putOnBattlefield(s, ap, pyrotechnicPerformer);
    s = castFaceDown(s, ap, ids[0]!);
    s = turnUp(s, ap, ids[0]!);
    for (const p of s.turnOrder.filter((q) => q !== ap)) expect(life(s, p)).toBe(37);
  });

  it("True Identity: scry 1 and draw, only once each turn", () => {
    let { s, ap, ids } = setup([morph(), morph()]);
    putOnBattlefield(s, ap, trueIdentity);
    s = castFaceDown(s, ap, ids[0]!);
    s = castFaceDown(s, ap, ids[1]!);
    const hand = s.players[ap]!.hand.length;
    const answer = (x: GameState) => {
      for (let i = 0; i < 5 && x.pending?.kind === "arrangeTop"; i++) x = settle(act(x, { type: "arrangeTop", player: ap, top: (x.pending as { cards: string[] }).cards, away: [] } as Action));
      return x;
    };
    s = answer(turnUp(s, ap, ids[0]!));
    s = answer(turnUp(s, ap, ids[1]!));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("Perimeter Enforcer and Case of the Pilfered Proof: a Detective entering or turned face up", () => {
    let { s, ap, ids } = setup([detective(), detective()]);
    const pe = putOnBattlefield(s, ap, perimeterEnforcer);
    putOnBattlefield(s, ap, caseOfThePilferedProof);
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(pt(s, pe)).toBe("2/2"); // +1/+1 for the Detective that entered
    expect(counters(s, ids[0]!, "+1/+1")).toBe(1); // the Case's counter
    s = castFaceDown(s, ap, ids[1]!);
    expect(pt(s, pe)).toBe("2/2"); // a face-down creature isn't a Detective (CR 708.2)
    s = turnUp(s, ap, ids[1]!);
    expect(pt(s, pe)).toBe("3/3");
    expect(counters(s, ids[1]!, "+1/+1")).toBe(1);
  });

  it("Temur War Shaman: the creature turned face up may fight a creature you don't control", () => {
    let { s, ap, opp, ids } = setup([morph()]);
    putOnBattlefield(s, ap, temurWarShaman);
    const theirs = putOnBattlefield(s, opp, greenBear());
    s = castFaceDown(s, ap, ids[0]!);
    s = turnUp(s, ap, ids[0]!, { targets: [tgt(theirs)] });
    expect(zone(s, theirs)).toBe("graveyard");
    expect(s.objects[ids[0]!]!.damage).toBe(2);
  });

  it("Unblinking Bleb: a face-down permanent that isn't a creature counts too", () => {
    let { s, ap, ids } = setup([morph()]);
    putOnBattlefield(s, ap, unblinkingBleb);
    s = castFaceDown(s, ap, ids[0]!);
    s = turnUp(s, ap, ids[0]!, { yes: true });
    expect(logged(s, /scries 2/)).toBe(true);
    void faceDownMorph;
  });
});

describe("a card revealed at random from a hand: the Planeswalker's enchantments, Hired Torturer, Singe-Mind Ogre, Merfolk Spy, Ignite Memories", () => {
  it("compiles them", () => supported(planeswalkersScorn, planeswalkersMirth, hiredTorturer, singemindOgre, planeswalkersFavor, planeswalkersFury, merfolkSpy, igniteMemories));

  it("Planeswalker's Mirth: life equal to the revealed card's mana value; none from an empty hand", () => {
    let { s, ap, opp } = setup([]);
    const m = putOnBattlefield(s, ap, planeswalkersMirth);
    handOf(s, opp, [creature("Big Ogre", "Creature — Ogre", "{4}{R}", 6, 6, { cmc: 5 })]);
    s = settle(run(s, planActivate(s, ap, m, 0, [player(opp)])));
    expect(life(s, ap)).toBe(45);
    expect(s.players[opp]!.hand.length).toBe(1); // it stays in their hand
    expect(logged(s, /reveals Big Ogre at random from their hand/)).toBe(true);
    handOf(s, opp, []);
    s = settle(run(s, planActivate(s, ap, m, 0, [player(opp)])));
    expect(life(s, ap)).toBe(45);
  });

  it("Planeswalker's Scorn: -X/-X, X fixed as it resolves (CR 608.2h)", () => {
    let { s, ap, opp } = setup([]);
    const m = putOnBattlefield(s, ap, planeswalkersScorn);
    const big = putOnBattlefield(s, opp, creature("Big Ogre", "Creature — Ogre", "{4}{R}", 6, 6, { cmc: 5 }));
    const [h] = handOf(s, opp, [greenBear()]);
    s = settle(run(s, planActivate(s, ap, m, 0, [player(opp), tgt(big)])));
    expect(pt(s, big)).toBe("4/4");
    // The card leaving their hand changes nothing.
    s.players[opp]!.hand = [];
    s.objects[h!]!.zone = "graveyard";
    s.players[opp]!.graveyard.push(h!);
    invalidateCharacteristics(s);
    expect(pt(s, big)).toBe("4/4");
  });

  it("Planeswalker's Favor and Fury: +X/+X to a creature; damage to that player", () => {
    let { s, ap, opp } = setup([]);
    const fav = putOnBattlefield(s, ap, planeswalkersFavor);
    const fury = putOnBattlefield(s, ap, planeswalkersFury);
    const b = putOnBattlefield(s, ap, greenBear());
    handOf(s, opp, [card("Test Relic", "Artifact", "{3}", { cmc: 3 })]);
    s = settle(run(s, planActivate(s, ap, fav, 0, [player(opp), tgt(b)])));
    expect(pt(s, b)).toBe("5/5");
    s = settle(run(s, planActivate(s, ap, fury, 0, [player(opp)])));
    expect(life(s, opp)).toBe(37);
  });

  it("Hired Torturer: 2 life, then a card revealed at random; Singe-Mind Ogre: life equal to its mana value", () => {
    let { s, ap, opp, ids } = setup([singemindOgre]);
    const t = putOnBattlefield(s, ap, hiredTorturer);
    handOf(s, opp, [card("Test Relic", "Artifact", "{3}", { cmc: 3 })]);
    s = settle(run(s, planActivate(s, ap, t, 0, [player(opp)])));
    expect(life(s, opp)).toBe(38);
    expect(logged(s, /reveals Test Relic at random/)).toBe(true);
    s = settle(run(s, planCast(s, ap, ids[0]!)), { targets: [player(opp)] });
    expect(life(s, opp)).toBe(35);
  });

  it("Merfolk Spy: the player it dealt combat damage to reveals a card at random", () => {
    let { s, ap, opp } = setup([]);
    const m = putOnBattlefield(s, ap, merfolkSpy);
    handOf(s, opp, [card("Test Relic", "Artifact", "{3}", { cmc: 3 })]);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: m, defender: opp }] });
    s = settle(passUntil(s, "main2", ap));
    expect(life(s, opp)).toBe(39);
    expect(logged(s, /B reveals Test Relic at random|reveals Test Relic at random/)).toBe(true);
  });

  it("Ignite Memories: damage to that player equal to the revealed card's mana value, a copy for each spell before it", () => {
    let { s, ap, opp, ids } = setup([bolt(), igniteMemories]);
    handOf(s, opp, [card("Test Relic", "Artifact", "{3}", { cmc: 3 })]);
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    s = settle(run(s, planCast(s, ap, ids[1]!, [player(opp)])));
    expect(life(s, opp)).toBe(40 - 3 - 3 - 3);
  });
});
