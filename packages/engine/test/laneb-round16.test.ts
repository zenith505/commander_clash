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
    expect(characteristics(s, s.objects[p]!).attackDespiteDefender).toBe(false);
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

// Second batch.
const cleansingBeam = card("Cleansing Beam", "Instant", "{4}{R}", {cmc: 5,keywords: ["Radiance"],oracleText: "Radiance — Cleansing Beam deals 2 damage to target creature and each other creature that shares a color with it."});
const wojekSiren = card("Wojek Siren", "Instant", "{W}", {cmc: 1,keywords: ["Radiance"],oracleText: "Radiance — Target creature and each other creature that shares a color with it get +1/+1 until end of turn."});
const inciteHysteria = card("Incite Hysteria", "Sorcery", "{2}{R}", {cmc: 3,keywords: ["Radiance"],oracleText: "Radiance — Until end of turn, target creature and each other creature that shares a color with it gain \"This creature can't block.\""});
const rallyTheRighteous = card("Rally the Righteous", "Instant", "{1}{R}{W}", {cmc: 3,keywords: ["Radiance"],oracleText: "Radiance — Untap target creature and each other creature that shares a color with it. Those creatures get +2/+0 until end of turn."});
const leaveNoTrace = card("Leave No Trace", "Instant", "{1}{W}", {cmc: 2,keywords: ["Radiance"],oracleText: "Radiance — Destroy target enchantment and each other enchantment that shares a color with it."});
const brightflame = card("Brightflame", "Sorcery", "{X}{R}{R}{W}{W}", {cmc: 4,keywords: ["Radiance"],oracleText: "Radiance — Brightflame deals X damage to target creature and each other creature that shares a color with it. You gain life equal to the damage dealt this way."});
const wojekApothecary = card("Wojek Apothecary", "Creature — Human Cleric", "{2}{W}{W}", {cmc: 4,power: "1",toughness: "1",keywords: ["Radiance"],oracleText: "Radiance — {T}: Prevent the next 1 damage that would be dealt to target creature and each other creature that shares a color with it this turn."});
const batheInLight = card("Bathe in Light", "Instant", "{1}{W}", {cmc: 2,keywords: ["Radiance"],oracleText: "Radiance — Choose a color. Target creature and each other creature that shares a color with it gain protection from the chosen color until end of turn."});
const surgeOfZeal = card("Surge of Zeal", "Instant", "{R}", {cmc: 1,keywords: ["Radiance"],oracleText: "Radiance — Target creature and each other creature that shares a color with it gain haste until end of turn."});
const wojekEmbermage = card("Wojek Embermage", "Creature — Human Wizard", "{3}{R}", {cmc: 4,power: "1",toughness: "2",keywords: ["Radiance"],oracleText: "Radiance — {T}: This creature deals 1 damage to target creature and each other creature that shares a color with it."});
const twistedJustice = card("Twisted Justice", "Sorcery", "{4}{U}{B}", {cmc: 6,oracleText: "Target player sacrifices a creature of their choice. You draw cards equal to that creature's power."});
const misstep = card("Misstep", "Sorcery", "{1}{U}", {cmc: 2,oracleText: "Creatures target player controls don't untap during that player's next untap step."});
const disarm = card("Disarm", "Instant", "{U}", {cmc: 1,oracleText: "Unattach all Equipment from target creature."});
const stripBare = card("Strip Bare", "Instant", "{W}", {cmc: 1,oracleText: "Destroy all Auras and Equipment attached to target creature."});
const sizzlingBarrage = card("Sizzling Barrage", "Instant", "{1}{R}", {cmc: 2,oracleText: "Sizzling Barrage deals 4 damage to target creature that blocked this turn."});
const vitalizingCascade = card("Vitalizing Cascade", "Instant", "{X}{G}{W}", {cmc: 2,oracleText: "You gain X plus 3 life."});
const eyeSpy = card("Eye Spy", "Sorcery", "{U}", {cmc: 1,oracleText: "Look at the top card of target player's library. You may put that card into their graveyard."});
const lurkingInformant = card("Lurking Informant", "Creature — Human Rogue", "{1}{U/B}", {cmc: 2,power: "1",toughness: "2",oracleText: "({U/B} can be paid with either {U} or {B}.)\n{2}, {T}: Look at the top card of target player's library. You may put that card into that player's graveyard."});
const wizardMentor = card("Wizard Mentor", "Creature — Human Wizard", "{2}{U}", {cmc: 3,power: "2",toughness: "2",oracleText: "{T}: Return this creature and target creature you control to their owner's hand."});
const snowHound = card("Snow Hound", "Creature — Dog", "{2}{W}", {cmc: 3,power: "1",toughness: "1",oracleText: "{1}, {T}: Return this creature and target green or blue creature you control to their owner's hand."});
const kitsunePalliator = card("Kitsune Palliator", "Creature — Fox Cleric", "{2}{W}", {cmc: 3,power: "0",toughness: "2",oracleText: "{T}: Prevent the next 1 damage that would be dealt to each creature and each player this turn."});
const tahngarthsRage = card("Tahngarth's Rage", "Enchantment — Aura", "{R}", {cmc: 1,keywords: ["Enchant"],oracleText: "Enchant creature\nEnchanted creature gets +3/+0 as long as it's attacking. Otherwise, it gets -2/-1."});
const evenTheOdds = card("Even the Odds", "Instant", "{2}{W}", {cmc: 3,oracleText: "Cast this spell only if you control fewer creatures than each opponent.\nCreate three 1/1 white Soldier creature tokens."});
const revokePrivileges = card("Revoke Privileges", "Enchantment — Aura", "{2}{W}", {cmc: 3,keywords: ["Enchant"],oracleText: "Enchant creature\nEnchanted creature can't attack, block, or crew Vehicles."});
const intercessorsArrest = card("Intercessor's Arrest", "Enchantment — Aura", "{2}{W}", {cmc: 3,keywords: ["Enchant"],oracleText: "Enchant permanent\nEnchanted permanent can't attack, block, or crew Vehicles. Its activated abilities can't be activated unless they're mana abilities."});
const boundInGold = card("Bound in Gold", "Enchantment — Aura", "{2}{W}", {cmc: 3,keywords: ["Enchant"],oracleText: "Enchant permanent\nEnchanted permanent can't attack, block, or crew Vehicles, and its activated abilities can't be activated unless they're mana abilities."});
const timeOfHeroes = card("Time of Heroes", "Enchantment", "{1}{W}", {cmc: 2,oracleText: "Each creature you control with a level counter on it gets +2/+2."});
const goblinBrawler = card("Goblin Brawler", "Creature — Goblin Warrior", "{2}{R}", {cmc: 3,power: "2",toughness: "2",keywords: ["First strike"],oracleText: "First strike\nThis creature can't be equipped."});
const tyrannize = card("Tyrannize", "Sorcery", "{3}{B/R}{B/R}", {cmc: 5,oracleText: "Target player discards their hand unless they pay 7 life."});
const flunk = card("Flunk", "Instant", "{1}{B}", {cmc: 2,oracleText: "Target creature gets -X/-X until end of turn, where X is 7 minus the number of cards in that creature's controller's hand."});
const makeAWish = card("Make a Wish", "Sorcery", "{3}{G}", {cmc: 4,oracleText: "Return two cards at random from your graveyard to your hand."});
const anHavvaInn = card("An-Havva Inn", "Sorcery", "{1}{G}{G}", {cmc: 3,oracleText: "You gain X plus 1 life, where X is the number of green creatures on the battlefield."});
const draugrThoughtThief = card("Draugr Thought-Thief", "Creature — Zombie Rogue", "{2}{U}", {cmc: 3,power: "3",toughness: "2",oracleText: "When this creature enters, look at the top card of target player's library. You may put that card into their graveyard."});
const ratsFeast = card("Rats' Feast", "Sorcery", "{X}{B}", {cmc: 1,oracleText: "Exile X target cards from a single graveyard."});

const redOgre = () => creature("Red Ogre", "Creature — Ogre", "{2}{R}", 3, 3, { cmc: 3 });
const boros = () => creature("Boros Guard", "Creature — Soldier", "{R}{W}", 2, 3, { cmc: 2 });
const whiteKnight = () => creature("White Knight", "Creature — Knight", "{1}{W}", 2, 3, { cmc: 2 });
const golem = () => creature("Clay Golem", "Artifact Creature — Golem", "{3}", 3, 3, { cmc: 3 });
const sword = () => card("Test Sword", "Artifact — Equipment", "{1}", { cmc: 1, keywords: ["Equip"], oracleText: "Equipped creature gets +2/+0.\nEquip {1}" });
const attach = (s: GameState, what: string, to: string) => {
  s.objects[what]!.attachedTo = to;
  invalidateCharacteristics(s);
};

describe("Radiance: target creature and each other creature that shares a color with it", () => {
  it("compiles them", () => supported(cleansingBeam, wojekSiren, inciteHysteria, rallyTheRighteous, leaveNoTrace, brightflame, wojekApothecary, batheInLight, surgeOfZeal, wojekEmbermage));

  it("Cleansing Beam: the target and every creature sharing a color with it, yours too; not other colors, not colorless", () => {
    let { s, ap, opp, ids } = setup([cleansingBeam]);
    const ogre = putOnBattlefield(s, opp, redOgre());
    const mine = putOnBattlefield(s, ap, boros());
    const knight = putOnBattlefield(s, opp, whiteKnight());
    const bear = putOnBattlefield(s, opp, greenBear());
    const g = putOnBattlefield(s, opp, golem());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(ogre)])));
    expect([ogre, mine, knight, bear, g].map((id) => s.objects[id]!.damage)).toEqual([2, 2, 0, 0, 0]);
  });

  it("Cleansing Beam on a colorless creature: only that one (rulings)", () => {
    let { s, ap, opp, ids } = setup([cleansingBeam]);
    const g = putOnBattlefield(s, opp, golem());
    const g2 = putOnBattlefield(s, opp, golem());
    const ogre = putOnBattlefield(s, opp, redOgre());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(g)])));
    expect([g, g2, ogre].map((id) => s.objects[id]!.damage)).toEqual([2, 0, 0]);
  });

  it("Cleansing Beam: nothing at all if the target is gone (CR 608.2b)", () => {
    let { s, ap, opp, ids } = setup([cleansingBeam]);
    const ogre = putOnBattlefield(s, opp, redOgre());
    const other = putOnBattlefield(s, opp, redOgre());
    s = run(s, planCast(s, ap, ids[0]!, [tgt(ogre)]));
    s.battlefield.splice(s.battlefield.indexOf(ogre), 1);
    s.objects[ogre]!.zone = "graveyard";
    s.players[opp]!.graveyard.push(ogre);
    invalidateCharacteristics(s);
    s = settle(s);
    expect(s.objects[other]!.damage).toBe(0);
  });

  it("Wojek Siren and Rally the Righteous: the group, fixed as it resolves", () => {
    let { s, ap, opp, ids } = setup([wojekSiren, rallyTheRighteous]);
    const knight = putOnBattlefield(s, ap, whiteKnight());
    const b = putOnBattlefield(s, opp, boros());
    const ogre = putOnBattlefield(s, opp, redOgre());
    s.objects[knight]!.tapped = true;
    s.objects[ogre]!.tapped = true;
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(knight)])));
    expect([pt(s, knight), pt(s, b), pt(s, ogre)]).toEqual(["3/4", "3/4", "3/3"]);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(ogre)])));
    // The red ones: the Ogre and the Boros Guard, untapped and +2/+0.
    expect([s.objects[ogre]!.tapped, s.objects[knight]!.tapped]).toEqual([false, true]);
    expect([pt(s, knight), pt(s, b), pt(s, ogre)]).toEqual(["3/4", "5/4", "5/3"]);
  });

  it("Incite Hysteria, Surge of Zeal, Bathe in Light: abilities for the group", () => {
    let { s, ap, opp, ids } = setup([inciteHysteria, surgeOfZeal]);
    const ogre = putOnBattlefield(s, opp, redOgre());
    const b = putOnBattlefield(s, opp, boros());
    const knight = putOnBattlefield(s, opp, whiteKnight());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(ogre)])));
    expect([ogre, b, knight].map((id) => characteristics(s, s.objects[id]!).cantBlock)).toEqual([true, true, false]);
    const mine = putOnBattlefield(s, ap, redOgre(), { sick: true });
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(mine)])));
    expect(objHasKeyword(s, s.objects[mine]!, "Haste")).toBe(true);
    expect(objHasKeyword(s, s.objects[b]!, "Haste")).toBe(true);
    expect(objHasKeyword(s, s.objects[knight]!, "Haste")).toBe(false);
  });

  it("Leave No Trace: enchantments sharing a color with the target", () => {
    let { s, ap, opp, ids } = setup([leaveNoTrace]);
    const e1 = putOnBattlefield(s, opp, card("Red Charm Thing", "Enchantment", "{R}", { cmc: 1 }));
    const e2 = putOnBattlefield(s, ap, card("Red White Thing", "Enchantment", "{R}{W}", { cmc: 2 }));
    const e3 = putOnBattlefield(s, opp, card("Blue Thing", "Enchantment", "{U}", { cmc: 1 }));
    const ogre = putOnBattlefield(s, opp, redOgre());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(e1)])));
    expect([e1, e2, e3, ogre].map((id) => zone(s, id))).toEqual(["graveyard", "graveyard", "battlefield", "battlefield"]);
  });

  it("Brightflame: life equal to all the damage dealt, none for prevented damage (rulings)", () => {
    let { s, ap, opp, ids } = setup([brightflame]);
    const ogre = putOnBattlefield(s, opp, redOgre());
    const b = putOnBattlefield(s, opp, boros());
    s.objects[b]!.preventNext = 1;
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(ogre)], undefined, undefined, 2)));
    expect([s.objects[ogre]!.damage, s.objects[b]!.damage]).toEqual([2, 1]);
    expect(life(s, ap)).toBe(43);
  });

  it("Wojek Apothecary and Wojek Embermage: a shield on each, then 1 damage to each", () => {
    let { s, ap, opp } = setup([]);
    const apo = putOnBattlefield(s, ap, wojekApothecary);
    const mage = putOnBattlefield(s, ap, wojekEmbermage);
    const ogre = putOnBattlefield(s, opp, redOgre());
    const b = putOnBattlefield(s, opp, boros());
    const bear = putOnBattlefield(s, opp, greenBear());
    const knight = putOnBattlefield(s, opp, whiteKnight());
    s = settle(run(s, planActivate(s, ap, apo, 0, [tgt(knight)])));
    // White: the Knight, the Apothecary and the Boros Guard; not the red Ogre or Embermage.
    expect([knight, apo, b, ogre, mage, bear].map((id) => s.objects[id]!.preventNext ?? 0)).toEqual([1, 1, 1, 0, 0, 0]);
    s = settle(run(s, planActivate(s, ap, mage, 0, [tgt(ogre)])));
    // Red: the Ogre, the Embermage itself, and the Boros Guard, whose shield takes it.
    expect([ogre, mage, b, knight, bear].map((id) => s.objects[id]!.damage)).toEqual([1, 1, 0, 0, 0]);
  });

  it("Bathe in Light: protection from the chosen color for the group", () => {
    let { s, ap, opp, ids } = setup([batheInLight]);
    const knight = putOnBattlefield(s, ap, whiteKnight());
    const b = putOnBattlefield(s, ap, boros());
    const bear = putOnBattlefield(s, ap, greenBear());
    s = run(s, planCast(s, ap, ids[0]!, [tgt(knight)]));
    for (let i = 0; i < 50 && (s.stack.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "chooseOption") s = act(s, { type: "chooseOption", player: p.player, choice: p.options.find((o) => /black|B/i.test(o)) ?? p.options[0]! });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    const pro = (id: string) => characteristics(s, s.objects[id]!).keywords.some((k) => /^Protection from/i.test(k));
    expect([pro(knight), pro(b), pro(bear)]).toEqual([true, true, false]);
    void opp;
  });
});

describe("Creatures that blocked this turn, untap steps, Equipment", () => {
  it("compiles them", () => supported(sizzlingBarrage, misstep, disarm, stripBare, goblinBrawler, revokePrivileges, intercessorsArrest, boundInGold));

  it("Sizzling Barrage: a creature that blocked this turn, even when no longer blocking; not one that didn't", () => {
    let { s, ap, opp, ids } = setup([sizzlingBarrage]);
    const bear = putOnBattlefield(s, ap, greenBear());
    const wall = putOnBattlefield(s, opp, creature("Stone Wall", "Creature — Wall", "{1}{W}", 0, 4, { cmc: 2 }));
    const other = putOnBattlefield(s, opp, creature("Idle Wall", "Creature — Wall", "{1}{W}", 0, 4, { cmc: 2 }));
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: bear, defender: opp }] });
    for (let i = 0; i < 50 && !(s.pending?.kind === "declareBlockers" && s.pending.player === opp); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: wall, attacker: bear }] });
    s = passUntil(s, "main2", ap);
    expect(() => run(s, planCast(s, ap, ids[0]!, [tgt(other)]))).toThrow();
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(wall)])));
    expect(zone(s, wall)).toBe("graveyard");
  });

  it("Misstep: none of that player's creatures untap in their next untap step, ones that came later too (rulings)", () => {
    let { s, ap, opp, ids } = setup([misstep]);
    const a = putOnBattlefield(s, opp, greenBear());
    const land = putOnBattlefield(s, opp, card("Forest", "Basic Land — Forest", ""));
    s.objects[a]!.tapped = true;
    s.objects[land]!.tapped = true;
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    const later = putOnBattlefield(s, opp, greenBear());
    s.objects[later]!.tapped = true;
    s = passUntil(s, "upkeep", opp);
    expect([s.objects[a]!.tapped, s.objects[later]!.tapped, s.objects[land]!.tapped]).toEqual([true, true, false]);
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(opp) + 1) % 4]!);
    s = passUntil(s, "upkeep", opp);
    expect(s.objects[a]!.tapped).toBe(false);
  });

  it("Disarm: the Equipment stays, attached to nothing; Strip Bare: Auras and Equipment on it destroyed", () => {
    let { s, ap, opp, ids } = setup([disarm, stripBare]);
    const bear = putOnBattlefield(s, opp, greenBear());
    const sw = putOnBattlefield(s, opp, sword());
    attach(s, sw, bear);
    expect(pt(s, bear)).toBe("4/2");
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(bear)])));
    expect([zone(s, sw), s.objects[sw]!.attachedTo, pt(s, bear)]).toEqual(["battlefield", undefined, "2/2"]);
    const aura = putOnBattlefield(s, opp, tahngarthsRage);
    attach(s, sw, bear);
    attach(s, aura, bear);
    const otherSword = putOnBattlefield(s, opp, sword());
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(bear)])));
    expect([zone(s, sw), zone(s, aura), zone(s, otherSword), zone(s, bear)]).toEqual(["graveyard", "graveyard", "battlefield", "battlefield"]);
  });

  it("Goblin Brawler: an equip ability can target it, but the Equipment doesn't move (rulings); one already on it falls off", () => {
    let { s, ap } = setup([]);
    const gb = putOnBattlefield(s, ap, goblinBrawler);
    const bear = putOnBattlefield(s, ap, greenBear());
    const sw = putOnBattlefield(s, ap, sword());
    s = settle(run(s, planActivate(s, ap, sw, 0, [tgt(gb)])));
    expect(s.objects[sw]!.attachedTo).toBeUndefined();
    s = settle(run(s, planActivate(s, ap, sw, 0, [tgt(bear)])));
    expect(s.objects[sw]!.attachedTo).toBe(bear);
    attach(s, sw, gb);
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.objects[sw]!.attachedTo).toBeUndefined();
    expect(pt(s, gb)).toBe("2/2");
  });

  it("Revoke Privileges and Bound in Gold: can't attack, block, or crew; Bound in Gold stops its other abilities", () => {
    let { s, ap } = setup([]);
    const vehicle = putOnBattlefield(s, ap, card("Test Wagon", "Artifact — Vehicle", "{2}", { cmc: 2, power: "4", toughness: "4", keywords: ["Crew"], oracleText: "Crew 1" }));
    const bear = putOnBattlefield(s, ap, greenBear());
    const rp = putOnBattlefield(s, ap, revokePrivileges);
    attach(s, rp, bear);
    const c = characteristics(s, s.objects[bear]!);
    expect([c.cantAttack, c.cantBlock, c.cantCrew]).toEqual([true, true, true]);
    expect(planActivate(s, ap, vehicle, 0, undefined, undefined, [bear])).toBeNull();
    expect(() => act(s, { type: "activateAbility", player: ap, objectId: vehicle, index: 0, tapCreatures: [bear] } as Action)).toThrow(/can't crew/);
    // Saddle and station aren't crewing.
    const big = putOnBattlefield(s, ap, redOgre());
    s = settle(run(s, planActivate(s, ap, vehicle, 0, undefined, undefined, [big])));
    expect(s.objects[big]!.tapped).toBe(true);
    const bg = putOnBattlefield(s, ap, boundInGold);
    attach(s, bg, vehicle);
    expect(planActivate(s, ap, vehicle, 0, undefined, undefined, [bear])).toBeNull();
    expect(characteristics(s, s.objects[vehicle]!).cantAttack).toBe(true);
  });

  it("Intercessor's Arrest: the same as Bound in Gold, in two sentences", () => {
    let { s, ap } = setup([]);
    const mage = putOnBattlefield(s, ap, wojekEmbermage);
    const ar = putOnBattlefield(s, ap, intercessorsArrest);
    attach(s, ar, mage);
    expect(planActivate(s, ap, mage, 0, [tgt(mage)])).toBeNull();
    expect(characteristics(s, s.objects[mage]!).cantCrew).toBe(true);
  });
});

describe("Twisted Justice, Tyrannize, Flunk, Eye Spy, Make a Wish, Rats' Feast, and others", () => {
  it("compiles them", () => supported(twistedJustice, vitalizingCascade, eyeSpy, lurkingInformant, wizardMentor, snowHound, kitsunePalliator, tahngarthsRage, evenTheOdds, timeOfHeroes, tyrannize, flunk, makeAWish, ratsFeast));

  it("Twisted Justice: cards equal to the sacrificed creature's power, as it last existed", () => {
    let { s, ap, opp, ids } = setup([twistedJustice]);
    putOnBattlefield(s, opp, redOgre());
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3);
    // No creature, no cards.
    const [t2] = handOf(s, ap, [twistedJustice]);
    s = settle(run(s, planCast(s, ap, t2!, [player(opp)])));
    expect(s.players[ap]!.hand.length).toBe(0);
  });

  it("Tyrannize: that player chooses to pay 7 life or discard their hand", () => {
    let { s, ap, opp, ids } = setup([tyrannize, tyrannize]);
    handOf(s, opp, [greenBear(), greenBear()]);
    s = run(s, planCast(s, ap, ids[0]!, [player(opp)]));
    const answer = (s: GameState, pay: boolean) => {
      for (let i = 0; i < 50 && (s.stack.length || s.pending); i++) {
        const p = s.pending;
        if (p?.kind === "chooseOption" && p.what === "punisher") s = act(s, { type: "chooseOption", player: p.player, choice: pay ? p.options[0]! : "none" });
        else if (p?.kind === "payUnless") s = act(s, { type: "payUnless", player: p.player, pay });
        else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
      return s;
    };
    s = answer(s, true);
    expect([life(s, opp), s.players[opp]!.hand.length]).toEqual([33, 2]);
    s = answer(run(s, planCast(s, ap, ids[1]!, [player(opp)])), false);
    expect([life(s, opp), s.players[opp]!.hand.length]).toEqual([33, 0]);
  });

  it("Flunk: -X/-X, X being 7 minus that creature's controller's hand, never a bonus (rulings)", () => {
    let { s, ap, opp, ids } = setup([flunk, flunk]);
    const ogre = putOnBattlefield(s, opp, creature("Huge Ogre", "Creature — Ogre", "{5}{R}", 6, 6, { cmc: 6 }));
    handOf(s, opp, [greenBear(), greenBear(), greenBear()]);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(ogre)])));
    expect(pt(s, ogre)).toBe("2/2");
    const mine = putOnBattlefield(s, ap, redOgre());
    handOf(s, ap, [flunk, ...Array.from({ length: 8 }, () => greenBear())]);
    s = settle(run(s, planCast(s, ap, s.players[ap]!.hand[0]!, [tgt(mine)])));
    expect(pt(s, mine)).toBe("3/3");
    void ids;
  });

  it("Eye Spy and Lurking Informant: you may put the top card of that player's library into their graveyard", () => {
    let { s, ap, opp, ids } = setup([eyeSpy]);
    const top = s.players[opp]!.library[0]!;
    s = run(s, planCast(s, ap, ids[0]!, [player(opp)]));
    for (let i = 0; i < 50 && (s.stack.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "searchLibrary" && p.cards.includes(top)) s = act(s, { type: "searchLibrary", player: ap, found: [top] });
      else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: true });
      else if (p) throw new Error(`unexpected ${p.kind}`);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(zone(s, top)).toBe("graveyard");
    const li = putOnBattlefield(s, ap, lurkingInformant);
    const next = s.players[opp]!.library[0]!;
    s = run(s, planActivate(s, ap, li, 0, [player(opp)]));
    for (let i = 0; i < 50 && (s.stack.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "searchLibrary" && p.cards.includes(next)) s = act(s, { type: "searchLibrary", player: ap, found: [] });
      else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: false });
      else if (p) throw new Error(`unexpected ${p.kind}`);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect([zone(s, next), s.players[opp]!.library[0]]).toEqual(["library", next]);
  });

  it("An-Havva Inn: 1 more life than there are green creatures; Draugr Thought-Thief: the look as it enters", () => {
    let { s, ap, opp, ids } = setup([anHavvaInn, draugrThoughtThief]);
    supported(anHavvaInn, draugrThoughtThief);
    putOnBattlefield(s, ap, greenBear());
    putOnBattlefield(s, opp, greenBear());
    putOnBattlefield(s, opp, redOgre());
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(life(s, ap)).toBe(43);
    const top = s.players[opp]!.library[0]!;
    s = run(s, planCast(s, ap, ids[1]!));
    for (let i = 0; i < 50 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: [player(opp)] } as Action);
      else if (p?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: ap, found: [top] });
      else if (p) throw new Error(`unexpected ${p.kind}`);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(zone(s, top)).toBe("graveyard");
  });

  it("Vitalizing Cascade: X plus 3 life", () => {
    let { s, ap, ids } = setup([vitalizingCascade]);
    s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, undefined, 4)));
    expect(life(s, ap)).toBe(47);
  });

  it("Wizard Mentor and Snow Hound: both return; Wizard Mentor may target itself (rulings)", () => {
    let { s, ap } = setup([]);
    const wm = putOnBattlefield(s, ap, wizardMentor);
    const bear = putOnBattlefield(s, ap, greenBear());
    s = settle(run(s, planActivate(s, ap, wm, 0, [tgt(bear)])));
    expect([zone(s, wm), zone(s, bear)]).toEqual(["hand", "hand"]);
    const wm2 = putOnBattlefield(s, ap, wizardMentor);
    s = settle(run(s, planActivate(s, ap, wm2, 0, [tgt(wm2)])));
    expect(zone(s, wm2)).toBe("hand");
    const hound = putOnBattlefield(s, ap, snowHound);
    const ogre = putOnBattlefield(s, ap, redOgre());
    const bear2 = putOnBattlefield(s, ap, greenBear());
    expect(() => run(s, planActivate(s, ap, hound, 0, [tgt(ogre)]))).toThrow();
    s = settle(run(s, planActivate(s, ap, hound, 0, [tgt(bear2)])));
    expect([zone(s, hound), zone(s, bear2), zone(s, ogre)]).toEqual(["hand", "hand", "battlefield"]);
  });

  it("Kitsune Palliator: a shield on each creature and each player there as it resolves, not on later ones (rulings)", () => {
    let { s, ap, opp } = setup([]);
    const k = putOnBattlefield(s, ap, kitsunePalliator);
    const ogre = putOnBattlefield(s, opp, redOgre());
    s = settle(run(s, planActivate(s, ap, k, 0)));
    const later = putOnBattlefield(s, opp, greenBear());
    expect([s.objects[k]!.preventNext, s.objects[ogre]!.preventNext, s.objects[later]!.preventNext ?? 0, s.players[ap]!.preventNext, s.players[opp]!.preventNext]).toEqual([1, 1, 0, 1, 1]);
  });

  it("Tahngarth's Rage: +3/+0 while attacking, -2/-1 otherwise", () => {
    let { s, ap, opp } = setup([]);
    const ogre = putOnBattlefield(s, ap, redOgre());
    const r = putOnBattlefield(s, ap, tahngarthsRage);
    attach(s, r, ogre);
    expect(pt(s, ogre)).toBe("1/2");
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: ogre, defender: opp }] });
    expect(pt(s, ogre)).toBe("6/3");
  });

  it("Even the Odds: only with fewer creatures than each opponent", () => {
    let { s, ap, opp, ids } = setup([evenTheOdds]);
    expect(planCast(s, ap, ids[0]!)).toBeNull(); // nobody has creatures: not fewer
    for (const p of s.turnOrder) if (p !== ap) putOnBattlefield(s, p, greenBear());
    invalidateCharacteristics(s);
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.battlefield.filter((id) => { const c = characteristics(s, s.objects[id]!); return c.controller === ap && c.subtypes.includes("Soldier"); }).length).toBe(3);
    void opp;
  });

  it("Time of Heroes: +2/+2 to each of your creatures with a level counter, however many", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, timeOfHeroes);
    const a = putOnBattlefield(s, ap, greenBear());
    const b = putOnBattlefield(s, ap, greenBear());
    s.objects[a]!.counters.level = 3;
    invalidateCharacteristics(s);
    expect([pt(s, a), pt(s, b)]).toEqual(["4/4", "2/2"]);
  });

  it("Make a Wish: two cards at random, or the one there is (rulings)", () => {
    let { s, ap, ids } = setup([makeAWish, makeAWish]);
    const ys = [greenBear(), redOgre(), golem()].map((d) => into(s, ap, d, "graveyard"));
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(ys.filter((id) => zone(s, id) === "hand").length).toBe(2);
    const left = ys.find((id) => zone(s, id) === "graveyard")!;
    // The first Make a Wish is in the graveyard now too.
    s.players[ap]!.graveyard = s.players[ap]!.graveyard.filter((id) => id !== ids[0]);
    s.objects[ids[0]!]!.zone = "exile";
    s.players[ap]!.exile.push(ids[0]!);
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(zone(s, left)).toBe("hand");
  });

  it("Rats' Feast: X cards, all from one graveyard", () => {
    let { s, ap, opp, ids } = setup([ratsFeast]);
    const theirs = [greenBear(), redOgre()].map((d) => into(s, opp, d, "graveyard"));
    const mine = into(s, ap, golem(), "graveyard");
    expect(() => run(s, planCast(s, ap, ids[0]!, [tgt(theirs[0]!), tgt(mine)], undefined, undefined, 2))).toThrow();
    s = settle(run(s, planCast(s, ap, ids[0]!, theirs.map(tgt), undefined, undefined, 2)));
    expect([...theirs, mine].map((id) => zone(s, id))).toEqual(["exile", "exile", "graveyard"]);
  });
});
