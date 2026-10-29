// Lane B, round 36: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, nextRandom, objHasKeyword, planActivate, planCast, potentialAttackers, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const at = (kind: string, pid: PlayerId) => (s: GameState) => s.pending?.kind === kind && s.pending.player === pid;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = []) => run(s, planCast(s, pid, id, targets));
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
/** Puts `def` onto the battlefield under `pid`, attached to `host`. */
const attach = (s: GameState, pid: PlayerId, def: CardDef, host: string) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = host;
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
/** From an attack, to the defender's block declaration, which `blocks` makes. */
const blockWith = (s: GameState, defender: PlayerId, blocks: { blocker: string; attacker: string }[]) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(s.pending).toMatchObject({ kind: "declareBlockers", player: defender });
  return act(s, { type: "declareBlockers", player: defender, blocks });
};
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of s.players[pid]!.hand) s.objects[id]!.zone = "exile";
  s.players[pid]!.exile.push(...s.players[pid]!.hand);
  s.players[pid]!.hand = [];
};
/** Sets the game's random state so the next flips come out as `wins` (true: won). */
const rig = (s: GameState, ...wins: boolean[]) => {
  for (let x = 1; x < 1_000_000; x++) {
    const r = { rngState: x };
    if (wins.every((w) => nextRandom(r) < 0.5 === w)) {
      s.rngState = x;
      return;
    }
  }
  throw new Error("no such state");
};
const kws = (s: GameState, id: string, kw: string) => objHasKeyword(s, s.objects[id]!, kw);
const colorsOf = (s: GameState, id: string) => [...characteristics(s, s.objects[id]!).colors].sort();

// Real oracle text (Scryfall).
const descendantOfSoramaro = () => card("Descendant of Soramaro", "Creature — Human Wizard", "{3}{U}", { cmc: 4, colors: ["U"], power: "2", toughness: "3", oracleText: "{1}{U}: Look at the top X cards of your library, where X is the number of cards in your hand, then put them back in any order." });
const dreamSalvage = () => card("Dream Salvage", "Instant", "{U/B}", { cmc: 1, colors: ["B", "U"], oracleText: "Draw cards equal to the number of cards target opponent discarded this turn." });
const favoredHoplite = () => card("Favored Hoplite", "Creature — Human Soldier", "{W}", { cmc: 1, colors: ["W"], power: "1", toughness: "2", keywords: ["Heroic"], oracleText: "Heroic — Whenever you cast a spell that targets this creature, put a +1/+1 counter on this creature and prevent all damage that would be dealt to it this turn." });
const fractalize = () => card("Fractalize", "Instant", "{X}{U}", { cmc: 1, colors: ["U"], oracleText: "Until end of turn, target creature becomes a green and blue Fractal with base power and toughness each equal to X plus 1. (It loses all other colors and creature types.)" });
const frenzySliver = () => card("Frenzy Sliver", "Creature — Sliver", "{1}{B}", { cmc: 2, colors: ["B"], power: "1", toughness: "1", oracleText: "All Sliver creatures have frenzy 1. (Whenever a Sliver attacks and isn't blocked, it gets +1/+0 until end of turn.)" });
const gomazoa = () => card("Gomazoa", "Creature — Jellyfish", "{2}{U}", { cmc: 3, colors: ["U"], power: "0", toughness: "3", keywords: ["Flying", "Defender"], oracleText: "Defender, flying\n{T}: Put this creature and each creature it's blocking on top of their owners' libraries, then those players shuffle." });
const gravebaneZombie = () => card("Gravebane Zombie", "Creature — Zombie", "{3}{B}", { cmc: 4, colors: ["B"], power: "3", toughness: "2", oracleText: "If this creature would die, put it on top of its owner's library instead." });
const incrementalGrowth = () => card("Incremental Growth", "Sorcery", "{3}{G}{G}", { cmc: 5, colors: ["G"], oracleText: "Put a +1/+1 counter on target creature, two +1/+1 counters on another target creature, and three +1/+1 counters on a third target creature." });
const informationDealer = () => card("Information Dealer", "Creature — Human Wizard", "{1}{U}", { cmc: 2, colors: ["U"], power: "1", toughness: "1", oracleText: "{T}: Look at the top X cards of your library, where X is the number of Wizards on the battlefield, then put them back in any order." });
const lilianasIndignation = () => card("Liliana's Indignation", "Sorcery", "{X}{B}", { cmc: 1, colors: ["B"], keywords: ["Mill"], oracleText: "Mill X cards. Target player loses 2 life for each creature card put into your graveyard this way." });
const loxodonLifechanter = () => card("Loxodon Lifechanter", "Creature — Elephant Cleric", "{5}{W}", { cmc: 6, colors: ["W"], power: "4", toughness: "6", oracleText: "When this creature enters, you may have your life total become the total toughness of creatures you control.\n{5}{W}: This creature gets +X/+X until end of turn, where X is your life total." });
const mineWorker = () => card("Mine Worker", "Artifact Creature — Assembly-Worker", "{2}", { cmc: 2, colors: [], power: "2", toughness: "1", oracleText: "{T}: You gain 1 life. If you control creatures named Power Plant Worker and Tower Worker, you gain 3 life instead." });
const misinformation = () => card("Misinformation", "Instant", "{B}", { cmc: 1, colors: ["B"], oracleText: "Put up to three target cards from an opponent's graveyard on top of their library in any order." });
const murasaSproutling = () => card("Murasa Sproutling", "Creature — Plant Elemental", "{2}{G}", { cmc: 3, colors: ["G"], power: "3", toughness: "3", keywords: ["Kicker"], oracleText: "Kicker {1}{G} (You may pay an additional {1}{G} as you cast this spell.)\nWhen this creature enters, if it was kicked, return target card with a kicker ability from your graveyard to your hand." });
const nissasChosen = () => card("Nissa's Chosen", "Creature — Elf Warrior", "{G}{G}", { cmc: 2, colors: ["G"], power: "2", toughness: "3", oracleText: "If this creature would die, put it on the bottom of its owner's library instead." });
const noviceKnight = () => card("Novice Knight", "Creature — Human Knight", "{W}", { cmc: 1, colors: ["W"], power: "2", toughness: "3", keywords: ["Defender"], oracleText: "Defender (This creature can't attack.)\nAs long as this creature is enchanted or equipped, it can attack as though it didn't have defender." });
const pentarchPaladin = () => card("Pentarch Paladin", "Creature — Human Knight", "{2}{W}{W}{W}", { cmc: 5, colors: ["W"], power: "3", toughness: "3", keywords: ["Flanking"], oracleText: "Flanking (Whenever a creature without flanking blocks this creature, the blocking creature gets -1/-1 until end of turn.)\nAs this creature enters, choose a color.\n{W}{W}, {T}: Destroy target permanent of the chosen color." });
const powerPlantWorker = () => card("Power Plant Worker", "Artifact Creature — Assembly-Worker", "{5}", { cmc: 5, colors: [], power: "4", toughness: "4", oracleText: "{3}: This creature gets +2/+2 until end of turn. If you control creatures named Mine Worker and Tower Worker, put two +1/+1 counters on this creature instead. Activate only once each turn." });
const scoutingTrek = () => card("Scouting Trek", "Sorcery", "{1}{G}", { cmc: 2, colors: ["G"], oracleText: "Search your library for any number of basic land cards, reveal those cards, then shuffle and put them on top." });
const scrapbasket = () => card("Scrapbasket", "Artifact Creature — Scarecrow", "{4}", { cmc: 4, colors: [], power: "3", toughness: "2", oracleText: "{1}: This creature becomes all colors until end of turn." });
const sentinelsMark = () => card("Sentinel's Mark", "Enchantment — Aura", "{1}{W}", { cmc: 2, colors: ["W"], keywords: ["Addendum", "Enchant", "Flash"], oracleText: "Flash\nEnchant creature\nEnchanted creature gets +1/+2 and has vigilance.\nAddendum — When this Aura enters, if you cast it during your main phase, enchanted creature gains lifelink until end of turn." });
const shiftingSky = () => card("Shifting Sky", "Enchantment", "{2}{U}", { cmc: 3, colors: ["U"], oracleText: "As this enchantment enters, choose a color.\nAll nonland permanents are the chosen color." });
const spoilsOfEvil = () => card("Spoils of Evil", "Instant", "{2}{B}", { cmc: 3, colors: ["B"], oracleText: "For each artifact or creature card in target opponent's graveyard, add {C} and you gain 1 life." });
const towerWorker = () => card("Tower Worker", "Artifact Creature — Assembly-Worker", "{3}", { cmc: 3, colors: [], power: "1", toughness: "3", keywords: ["Reach"], oracleText: "Reach\n{T}: Add {C}. If you control creatures named Mine Worker and Power Plant Worker, add {C}{C}{C} instead." });
const volatileRig = () => card("Volatile Rig", "Artifact Creature — Construct", "{4}", { cmc: 4, colors: [], power: "4", toughness: "4", keywords: ["Trample"], oracleText: "Trample\nThis creature attacks each combat if able.\nWhenever this creature is dealt damage, flip a coin. If you lose the flip, sacrifice this creature.\nWhen this creature dies, flip a coin. If you lose the flip, it deals 4 damage to each creature and each player." });
const warchanterSkald = () => card("Warchanter Skald", "Creature — Dwarf Cleric", "{2}{W}", { cmc: 3, colors: ["W"], power: "2", toughness: "3", oracleText: "Whenever this creature becomes tapped, if it's enchanted or equipped, create a 2/1 red Dwarf Berserker creature token." });
const woollyRazorback = () => card("Woolly Razorback", "Creature — Boar Beast", "{2}{W}{W}", { cmc: 4, colors: ["W"], power: "7", toughness: "7", oracleText: "This creature enters with three ice counters on it.\nAs long as this creature has an ice counter on it, prevent all combat damage it would deal and it has defender.\nWhenever this creature blocks, remove an ice counter from it." });

const creature = (name: string, typeLine: string, manaCost: string, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, manaCost, { power: String(p), toughness: String(t), ...extra });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2, { cmc: 2, colors: ["G"] });
const hillGiant = () => creature("Hill Giant", "Creature — Giant", "{3}{R}", 3, 3, { cmc: 4, colors: ["R"] });
const bigOgre = () => creature("Big Ogre", "Creature — Ogre", "{4}{R}", 5, 5, { cmc: 5, colors: ["R"] });
const wizard = () => creature("Apprentice Wizard", "Creature — Human Wizard", "{1}{U}", 1, 1, { cmc: 2, colors: ["U"] });
const sliver = () => creature("Muscle Sliver", "Creature — Sliver", "{1}{G}", 1, 1, { cmc: 2, colors: ["G"], oracleText: "All Sliver creatures get +1/+1." });
const ornithopter = () => creature("Ornithopter", "Artifact Creature — Thopter", "{0}", 0, 2, { cmc: 0, colors: [], keywords: ["Flying"], oracleText: "Flying" });
const murder = () => card("Murder", "Instant", "{1}{B}{B}", { cmc: 3, colors: ["B"], oracleText: "Destroy target creature." });
const mindRot = () => card("Mind Rot", "Sorcery", "{2}{B}", { cmc: 3, colors: ["B"], oracleText: "Target player discards two cards." });
const giantGrowth = () => card("Giant Growth", "Instant", "{G}", { cmc: 1, colors: ["G"], oracleText: "Target creature gets +3/+3 until end of turn." });
const shock = () => card("Shock", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Shock deals 2 damage to any target." });
const bonesplitter = () => card("Bonesplitter", "Artifact — Equipment", "{1}", { cmc: 1, colors: [], keywords: ["Equip"], oracleText: "Equipped creature gets +2/+0.\nEquip {1}" });
const kickerSpell = () => card("Burst Lightning", "Instant", "{R}", { cmc: 1, colors: ["R"], keywords: ["Kicker"], oracleText: "Kicker {4} (You may pay an additional {4} as you cast this spell.)\nBurst Lightning deals 2 damage to any target. If this spell was kicked, it deals 4 damage instead." });
const multikicker = () => creature("Joraga Warcaller", "Creature — Elf Warrior", "{G}", 1, 1, { cmc: 1, colors: ["G"], keywords: ["Multikicker"], oracleText: "Multikicker {1}{G} (You may pay an additional {1}{G} any number of times as you cast this spell.)\nThis creature enters with a +1/+1 counter on it for each time it was kicked.\nOther Elf creatures you control get +1/+1 for each +1/+1 counter on this creature." });
const blackGrove = () => card("Black Grove", "Enchantment", "{B}", { cmc: 1, colors: ["B"] });
const swampCard = () => card("Swamp", "Basic Land — Swamp");
const islandCard = () => card("Island", "Basic Land — Island");
const manaRock = () => card("Mind Stone", "Artifact", "{2}", { cmc: 2, colors: [] });

describe("Lane B round 36", () => {
  it("compiles every card fully", () => {
    supported(descendantOfSoramaro(), dreamSalvage(), favoredHoplite(), fractalize(), frenzySliver(), gomazoa(), gravebaneZombie(), incrementalGrowth(), informationDealer());
    supported(lilianasIndignation(), loxodonLifechanter(), mineWorker(), misinformation(), murasaSproutling(), nissasChosen(), noviceKnight(), pentarchPaladin(), powerPlantWorker());
    supported(scoutingTrek(), scrapbasket(), sentinelsMark(), shiftingSky(), spoilsOfEvil(), towerWorker(), volatileRig(), warchanterSkald(), woollyRazorback());
  });
});

describe("Replacing dying", () => {
  it("Nissa's Chosen goes to the bottom of its owner's library instead of dying; Gravebane Zombie to the top", () => {
    const { s: s0, ap, ids, opp } = setup([murder(), murder()]);
    const chosen = putOnBattlefield(s0, opp, nissasChosen());
    const zombie = putOnBattlefield(s0, opp, gravebaneZombie());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(chosen)]));
    const lib = () => s.players[opp]!.library;
    expect([zone(s, chosen), lib()[lib().length - 1]]).toEqual(["library", chosen]);
    expect(s.players[opp]!.graveyard).not.toContain(chosen);
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 3, R: 0, G: 0, C: 0 };
    s = settle(castNow(s, ap, ids[1]!, [tgt(zombie)]));
    expect([zone(s, zombie), lib()[0]]).toEqual(["library", zombie]);
  });
});

describe("Counting", () => {
  it("Liliana's Indignation: 2 life for each creature card milled into your graveyard", () => {
    const { s: s0, ap, ids, opp } = setup([lilianasIndignation()]);
    for (const d of [hillGiant(), swampCard(), bigOgre()]) toZone(s0, ap, d, "library");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [ply(opp)], undefined, undefined, 3)));
    expect(s.players[ap]!.graveyard.length).toBeGreaterThanOrEqual(3);
    expect(life(s, opp)).toBe(36);
  });

  it("Spoils of Evil: {C} and 1 life for each artifact or creature card in that opponent's graveyard, an artifact creature once", () => {
    const { s: s0, ap, ids, opp } = setup([spoilsOfEvil()]);
    for (const d of [ornithopter(), hillGiant(), manaRock(), swampCard(), murder()]) toZone(s0, opp, d, "graveyard");
    const s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]));
    expect([s.players[ap]!.manaPool.C, life(s, ap)]).toEqual([3, 43]);
  });

  it("Dream Salvage: a card for each card that opponent discarded this turn", () => {
    const { s: s0, ap, ids, opp } = setup([mindRot(), dreamSalvage(), dreamSalvage()]);
    for (const d of [hillGiant(), bigOgre(), swampCard()]) toZone(s0, opp, d, "hand");
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    let s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]));
    expect(s.players[opp]!.graveyard.length).toBe(2);
    const hand = s.players[ap]!.hand.length;
    s = settle(castNow(s, ap, ids[1]!, [ply(opp)]));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
    s = settle(castNow(s, ap, ids[2]!, [ply(other)]));
    expect(s.players[ap]!.hand.length).toBe(hand - 2 + 2);
  });

  it("Information Dealer: looks at the top X cards, X the Wizards on the battlefield, anyone's", () => {
    const { s: s0, ap, opp } = setup([]);
    const dealer = putOnBattlefield(s0, ap, informationDealer());
    putOnBattlefield(s0, ap, wizard());
    putOnBattlefield(s0, opp, wizard());
    const s = settle(run(s0, planActivate(s0, ap, dealer, 0)), at("arrangeTop", ap));
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap, how: "order" });
    if (s.pending?.kind !== "arrangeTop") throw new Error("no arrangeTop");
    expect(s.pending.cards).toEqual(s.players[ap]!.library.slice(0, 3));
  });

  it("Descendant of Soramaro: X is the number of cards in your hand", () => {
    const { s: s0, ap } = setup([]);
    const descendant = putOnBattlefield(s0, ap, descendantOfSoramaro());
    emptyHand(s0, ap);
    for (const d of [hillGiant(), bigOgre()]) toZone(s0, ap, d, "hand");
    const s = settle(run(s0, planActivate(s0, ap, descendant, 0)), at("arrangeTop", ap));
    expect(s.pending?.kind === "arrangeTop" && s.pending.cards.length).toBe(2);
  });

  it("Loxodon Lifechanter: you may have your life total become the total toughness of creatures you control", () => {
    const { s: s0, ap, ids } = setup([loxodonLifechanter()]);
    putOnBattlefield(s0, ap, bigOgre());
    s0.players[ap]!.life = 5;
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseMay", ap));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(life(s, ap)).toBe(11);
  });
});

describe("The Assembly-Workers", () => {
  it("Mine Worker gains 1 life, or 3 with creatures named Power Plant Worker and Tower Worker; Tower Worker adds {C}{C}{C} with the other two", () => {
    const { s: s0, ap } = setup([]);
    const mine = putOnBattlefield(s0, ap, mineWorker());
    const tower = putOnBattlefield(s0, ap, towerWorker());
    let s = settle(run(s0, planActivate(s0, ap, mine, 0)));
    expect(life(s, ap)).toBe(41);
    expect(s.players[ap]!.manaPool.C).toBe(0);
    s = run(s, planActivate(s, ap, tower, 0));
    expect(s.players[ap]!.manaPool.C).toBe(1);
    const plant = putOnBattlefield(s, ap, powerPlantWorker());
    const mine2 = putOnBattlefield(s, ap, mineWorker());
    const tower2 = putOnBattlefield(s, ap, towerWorker());
    s = settle(run(s, planActivate(s, ap, mine2, 0)));
    expect(life(s, ap)).toBe(44);
    s = run(s, planActivate(s, ap, tower2, 0));
    expect(s.players[ap]!.manaPool.C).toBe(4);
    s = settle(run(s, planActivate(s, ap, plant, 0)));
    expect([s.objects[plant]!.counters["+1/+1"], pt(s, plant)]).toEqual([2, "6/6"]);
  });

  it("Power Plant Worker gets +2/+2 without the other two", () => {
    const { s: s0, ap } = setup([]);
    const plant = putOnBattlefield(s0, ap, powerPlantWorker());
    putOnBattlefield(s0, ap, mineWorker());
    const s = settle(run(s0, planActivate(s0, ap, plant, 0)));
    expect([s.objects[plant]!.counters["+1/+1"] ?? 0, pt(s, plant)]).toEqual([0, "6/6"]);
    expect(planActivate(s, ap, plant, 0)).toBeNull();
  });
});

describe("Targets", () => {
  it("Incremental Growth: one, two and three +1/+1 counters on three different creatures", () => {
    const { s: s0, ap, ids, opp } = setup([incrementalGrowth()]);
    const [a, b] = [putOnBattlefield(s0, ap, greenBear()), putOnBattlefield(s0, ap, hillGiant())];
    const c = putOnBattlefield(s0, opp, bigOgre());
    expect(planCast(s0, ap, ids[0]!, [tgt(a), tgt(a), tgt(b)])).toBeNull();
    expect(planCast(s0, ap, ids[0]!, [tgt(a), tgt(b)])).toBeNull();
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(a), tgt(b), tgt(c)]));
    expect([a, b, c].map((id) => s.objects[id]!.counters["+1/+1"])).toEqual([1, 2, 3]);
  });

  it("Misinformation: cards from one opponent's graveyard on top of their library, in the order its caster chooses", () => {
    const { s: s0, ap, ids, opp } = setup([misinformation()]);
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const [x, y, z] = [hillGiant(), bigOgre(), swampCard()].map((d) => toZone(s0, opp, d, "graveyard"));
    const theirs = toZone(s0, other, greenBear(), "graveyard");
    expect(planCast(s0, ap, ids[0]!, [tgt(x!), tgt(theirs)])).toBeNull();
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(x!), tgt(y!), tgt(z!)]), at("orderLibrary", ap));
    expect(s.pending).toMatchObject({ kind: "orderLibrary", player: ap, owner: opp });
    s = settle(act(s, { type: "orderLibrary", player: ap, order: [z!, x!, y!] }));
    expect(s.players[opp]!.library.slice(0, 3)).toEqual([z, x, y]);
  });

  it("Misinformation: the bot puts a land first in that opponent's library", () => {
    const { s: s0, ap, ids, opp } = setup([misinformation()]);
    const [x, y, z] = [hillGiant(), bigOgre(), swampCard()].map((d) => toZone(s0, opp, d, "graveyard"));
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(x!), tgt(y!), tgt(z!)]));
    expect(s.players[opp]!.library.slice(0, 3)).toEqual([z, y, x]);
  });

  it("Pentarch Paladin: destroys a permanent of the color chosen as it entered, and only that color", () => {
    const { s: s0, ap, ids, opp } = setup([pentarchPaladin()]);
    const red = putOnBattlefield(s0, opp, hillGiant());
    const black = putOnBattlefield(s0, opp, blackGrove());
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseOption", ap));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "color" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Black" }));
    s.objects[ids[0]!]!.controlledSinceTurn = -1;
    s.players[ap]!.manaPool = { W: 2, U: 0, B: 0, R: 0, G: 0, C: 0 };
    expect(planActivate(s, ap, ids[0]!, 0, [tgt(red)])).toBeNull();
    s = settle(run(s, planActivate(s, ap, ids[0]!, 0, [tgt(black)])));
    expect([zone(s, black), zone(s, red)]).toEqual(["graveyard", "battlefield"]);
  });

  it("Murasa Sproutling: kicked, it returns a card with kicker or multikicker from your graveyard", () => {
    const { s: s0, ap, ids } = setup([murasaSproutling(), murasaSproutling()]);
    const burst = toZone(s0, ap, kickerSpell(), "graveyard");
    const joraga = toZone(s0, ap, multikicker(), "graveyard");
    const plain = toZone(s0, ap, hillGiant(), "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, undefined, { kicks: [0] }));
    s = settle(s, at("chooseTargets", ap));
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(plain)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(joraga)] }));
    expect(zone(s, joraga)).toBe("hand");
    // Not kicked: no trigger.
    const before = s.players[ap]!.hand.length;
    s = settle(castNow(s, ap, ids[1]!));
    expect([zone(s, burst), s.players[ap]!.hand.length]).toEqual(["graveyard", before - 1]);
  });
});

describe("Libraries", () => {
  it("Scouting Trek: any number of basic lands found, shuffled, then put on top in the order you choose", () => {
    const { s: s0, ap, ids } = setup([scoutingTrek()]);
    const [i1, i2] = [toZone(s0, ap, islandCard(), "library"), toZone(s0, ap, swampCard(), "library")];
    let s = settle(castNow(s0, ap, ids[0]!), at("searchLibrary", ap));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0 });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [i1, i2] }), at("orderLibrary", ap));
    expect(s.pending).toMatchObject({ kind: "orderLibrary", player: ap });
    s = settle(act(s, { type: "orderLibrary", player: ap, order: [i2, i1] }));
    expect(s.players[ap]!.library.slice(0, 2)).toEqual([i2, i1]);
  });
});

describe("Combat", () => {
  it("Gomazoa: shuffles itself and the creature it's blocking into their owners' libraries", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHand(s0, ap);
    const giant = putOnBattlefield(s0, ap, hillGiant());
    const goma = putOnBattlefield(s0, opp, gomazoa());
    let s = attackWith(s0, [giant], opp);
    s = blockWith(s, opp, [{ blocker: goma, attacker: giant }]);
    for (let i = 0; i < 20 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const [apShuffles, oppShuffles] = [s.players[ap]!.shuffles ?? 0, s.players[opp]!.shuffles ?? 0];
    s = settle(run(s, planActivate(s, opp, goma, 0)));
    expect([zone(s, giant), zone(s, goma)]).toEqual(["library", "library"]);
    expect([s.players[ap]!.library.includes(giant), s.players[opp]!.library.includes(goma)]).toEqual([true, true]);
    expect([(s.players[ap]!.shuffles ?? 0) > apShuffles, (s.players[opp]!.shuffles ?? 0) > oppShuffles]).toEqual([true, true]);
  });

  it("Gomazoa: not blocking, only it goes, and only its owner shuffles (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const goma = putOnBattlefield(s0, ap, gomazoa());
    const bear = putOnBattlefield(s0, opp, greenBear());
    const shuffles = s0.players[opp]!.shuffles ?? 0;
    const s = settle(run(s0, planActivate(s0, ap, goma, 0)));
    expect([zone(s, goma), zone(s, bear), s.players[opp]!.shuffles ?? 0]).toEqual(["library", "battlefield", shuffles]);
  });

  it("Gomazoa: the bot doesn't use it on its own", () => {
    const { s: s0, ap } = setup([]);
    emptyHand(s0, ap);
    s0.players[ap]!.command = [];
    const goma = putOnBattlefield(s0, ap, gomazoa());
    const s = settle(passUntil(s0, "end", ap));
    expect(zone(s, goma)).toBe("battlefield");
  });

  it("Woolly Razorback: with an ice counter it has defender and deals no combat damage, and each block removes one", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHand(s0, ap);
    const boar = putOnBattlefield(s0, opp, woollyRazorback());
    s0.objects[boar]!.counters.ice = 1;
    invalidateCharacteristics(s0);
    expect(kws(s0, boar, "Defender")).toBe(true);
    const giant = putOnBattlefield(s0, ap, hillGiant());
    let s = attackWith(s0, [giant], opp);
    s = settle(blockWith(s, opp, [{ blocker: boar, attacker: giant }]));
    expect(s.objects[boar]!.counters.ice ?? 0).toBe(0);
    expect(kws(s, boar, "Defender")).toBe(false);
    s = settle(passUntil(s, "end", ap));
    // The last counter came off before damage, so its 7 damage killed the Giant (rulings).
    expect(zone(s, giant)).toBe("graveyard");
  });

  it("Woolly Razorback: while it keeps a counter, its combat damage is prevented but damage to it isn't", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHand(s0, ap);
    const boar = putOnBattlefield(s0, opp, woollyRazorback());
    s0.objects[boar]!.counters.ice = 3;
    const giant = putOnBattlefield(s0, ap, hillGiant());
    let s = attackWith(s0, [giant], opp);
    s = settle(blockWith(s, opp, [{ blocker: boar, attacker: giant }]));
    s = settle(passUntil(s, "end", ap));
    expect([s.objects[boar]!.counters.ice, zone(s, giant)]).toEqual([2, "battlefield"]);
    expect(s.objects[boar]!.damage).toBe(3);
  });

  it("Frenzy Sliver: each Sliver that attacks and isn't blocked gets +1/+0", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHand(s0, ap);
    putOnBattlefield(s0, opp, frenzySliver());
    const mine = putOnBattlefield(s0, ap, sliver());
    const bear = putOnBattlefield(s0, ap, greenBear());
    let s = attackWith(s0, [mine, bear], opp);
    s = settle(blockWith(s, opp, []));
    expect([pt(s, mine), pt(s, bear)]).toEqual(["3/2", "2/2"]);
  });

  it("Novice Knight: attacks only while enchanted or equipped", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHand(s0, ap);
    const knight = putOnBattlefield(s0, ap, noviceKnight());
    expect(potentialAttackers(s0, ap).map((o) => o.id)).not.toContain(knight);
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    emptyHand(s1, ap1);
    const knight1 = putOnBattlefield(s1, ap1, noviceKnight());
    attach(s1, ap1, bonesplitter(), knight1);
    expect(potentialAttackers(s1, ap1).map((o) => o.id)).toContain(knight1);
    const s = attackWith(s1, [knight1], opp1);
    expect(s.objects[knight1]!.attacking).toBe(opp1);
  });
});

describe("Damage and life", () => {
  it("Favored Hoplite: a spell targeting it gives it a +1/+1 counter and prevents all damage to it this turn", () => {
    const { s: s0, ap, ids, opp } = setup([giantGrowth(), shock()]);
    const hoplite = putOnBattlefield(s0, ap, favoredHoplite());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(hoplite)]));
    expect([s.objects[hoplite]!.counters["+1/+1"], pt(s, hoplite)]).toEqual([1, "5/6"]);
    s = settle(castNow(s, ap, ids[1]!, [tgt(hoplite)]));
    expect([s.objects[hoplite]!.counters["+1/+1"], s.objects[hoplite]!.damage ?? 0]).toEqual([2, 0]);
    void opp;
  });

  it("Volatile Rig: dying, a lost flip deals 4 damage to each creature and each player; a won one does nothing", () => {
    for (const won of [false, true]) {
      const { s: s0, ap, ids, opp } = setup([murder()]);
      const rigId = putOnBattlefield(s0, opp, volatileRig());
      const ogre = putOnBattlefield(s0, ap, bigOgre());
      const bear = putOnBattlefield(s0, opp, greenBear());
      let s = castNow(s0, ap, ids[0]!, [tgt(rigId)]);
      rig(s, won);
      s = settle(s);
      expect(zone(s, rigId)).toBe("graveyard");
      expect([life(s, ap), life(s, opp), zone(s, bear), s.objects[ogre]!.damage ?? 0]).toEqual(won ? [40, 40, "battlefield", 0] : [36, 36, "graveyard", 4]);
    }
  });
});

describe("Becoming", () => {
  it("Fractalize: a green and blue Fractal with base power and toughness X plus 1", () => {
    const { s: s0, ap, ids, opp } = setup([fractalize()]);
    const ogre = putOnBattlefield(s0, opp, bigOgre());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(ogre)], undefined, undefined, 2)));
    const c = characteristics(s, s.objects[ogre]!);
    expect([pt(s, ogre), [...c.colors].sort(), c.subtypes, c.types]).toEqual(["3/3", ["G", "U"], ["Fractal"], ["Creature"]]);
  });

  it("Scrapbasket: becomes all five colors until end of turn", () => {
    const { s: s0, ap } = setup([]);
    const basket = putOnBattlefield(s0, ap, scrapbasket());
    expect(colorsOf(s0, basket)).toEqual([]);
    let s = settle(run(s0, planActivate(s0, ap, basket, 0)));
    expect(colorsOf(s, basket)).toEqual(["B", "G", "R", "U", "W"]);
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(colorsOf(s, basket)).toEqual([]);
  });

  it("Shifting Sky: every nonland permanent is the chosen color, lands aren't", () => {
    const { s: s0, ap, ids, opp } = setup([shiftingSky()]);
    const bear = putOnBattlefield(s0, opp, greenBear());
    const thopter = putOnBattlefield(s0, ap, ornithopter());
    const land = s0.battlefield.find((id) => s0.objects[id]!.controller === ap && characteristics(s0, s0.objects[id]!).types.includes("Land"))!;
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseOption", ap));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "color" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Red" }));
    expect([colorsOf(s, bear), colorsOf(s, thopter), colorsOf(s, ids[0]!), colorsOf(s, land)]).toEqual([["R"], ["R"], ["R"], []]);
  });
});

describe("Attachments", () => {
  it("Warchanter Skald: becoming tapped while enchanted or equipped makes a 2/1 Dwarf Berserker", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHand(s0, ap);
    const skald = putOnBattlefield(s0, ap, warchanterSkald());
    const bare = putOnBattlefield(s0, ap, warchanterSkald());
    attach(s0, ap, bonesplitter(), skald);
    const tokens = (s: GameState) => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]?.name === "Dwarf Berserker Token").length;
    let s = attackWith(s0, [skald, bare], opp);
    s = settle(s);
    expect(tokens(s)).toBe(1);
  });

  it("Sentinel's Mark: cast in your main phase the creature gains lifelink; cast at another time, or put onto the battlefield, it doesn't", () => {
    const { s: s0, ap, ids, opp } = setup([sentinelsMark(), sentinelsMark()]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    const giant = putOnBattlefield(s0, ap, hillGiant());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(bear)]));
    expect([pt(s, bear), kws(s, bear, "Vigilance"), kws(s, bear, "Lifelink")]).toEqual(["3/4", true, true]);
    s = passUntil(s, "beginCombat", ap);
    s.players[ap]!.manaPool = { W: 1, U: 0, B: 0, R: 0, G: 0, C: 1 };
    for (let i = 0; i < 10 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(castNow(s, ap, ids[1]!, [tgt(giant)]));
    expect([pt(s, giant), kws(s, giant, "Lifelink")]).toEqual(["4/5", false]);
    void opp;
  });
});
