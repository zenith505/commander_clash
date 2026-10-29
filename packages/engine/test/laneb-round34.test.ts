// Lane B, round 34: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { attackProblem, botActions, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, spellCost, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
/** Passes to the declare attackers step of the active player's turn and declares `attackers` at `defender`; stops at the first question. */
const attackWith = (s: GameState, attackers: string[], defender: PlayerId) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  s = act(s, { type: "declareAttackers", player: s.activePlayer, attacks: attackers.map((attacker) => ({ attacker, defender })) });
  for (let i = 0; i < 50 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const choose = (s: GameState, yes: boolean) => act(s, { type: "chooseMay", player: s.pending!.player, yes });
const kws = (s: GameState, id: string, kw: string) => objHasKeyword(s, s.objects[id]!, kw);
const nextPlayer = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;
/** From the active player's turn to the upkeep of their next one, the triggers there not yet put on the stack. */
const toNextUpkeep = (s: GameState, pid: PlayerId) => passUntil(passUntil(s, "main1", nextPlayer(s, pid)), "upkeep", pid);

// Real oracle text (Scryfall).
const stormEntity = () => card("Storm Entity", "Creature — Elemental", "{1}{R}", { cmc: 2, colors: ["R"], power: "1", toughness: "1", keywords: ["Haste"], oracleText: "Haste\nThis creature enters with a +1/+1 counter on it for each other spell cast this turn." });
const predatorsGambit = () => card("Predator's Gambit", "Enchantment — Aura", "{B}", { cmc: 1, colors: ["B"], keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +2/+1.\nEnchanted creature has intimidate as long as its controller controls no other creatures. (It can't be blocked except by artifact creatures and/or creatures that share a color with it.)" });
const lingeringDeath = () => card("Lingering Death", "Enchantment — Aura", "{1}{B}", { cmc: 2, colors: ["B"], keywords: ["Enchant"], oracleText: "Enchant creature\nAt the beginning of the end step of enchanted creature's controller, that player sacrifices that creature." });
const crowdOfTrueBelievers = () => card("Crowd of True Believers", "Creature — Human Citizen", "{W}", { cmc: 1, colors: ["W"], power: "1", toughness: "2", oracleText: "{T}: Target creature you control that's attacking alone gets +1/+0 until end of turn. You gain 1 life." });
const viperCruelConspirator = () => card("Viper, Cruel Conspirator", "Legendary Creature — Human Assassin Villain", "{1}{B}", { cmc: 2, colors: ["B"], power: "2", toughness: "2", oracleText: "{B}: Target creature that's attacking alone gets +1/+1 until end of turn.\n{B}: Target creature that's attacking alone gains your choice of deathtouch or lifelink until end of turn." });
const aboroth = () => card("Aboroth", "Creature — Elemental", "{4}{G}{G}", { cmc: 6, colors: ["G"], power: "9", toughness: "9", keywords: ["Cumulative upkeep"], oracleText: "Cumulative upkeep—Put a -1/-1 counter on this creature. (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)" });
const sabotageStrategist = () => card("Sabotage Strategist", "Creature — Vedalken Ranger", "{2}{U}{U}", { cmc: 4, colors: ["U"], power: "2", toughness: "2", keywords: ["Flying","Vigilance","Exhaust"], oracleText: "Flying, vigilance\nWhenever one or more creatures attack you, those creatures get -1/-0 until end of turn.\nExhaust — {5}{U}{U}: Put three +1/+1 counters on this creature. (Activate each exhaust ability only once.)" });
const radiantKavu = () => card("Radiant Kavu", "Creature — Kavu", "{R}{G}{W}", { cmc: 3, colors: ["G","R","W"], power: "3", toughness: "3", oracleText: "{R}{G}{W}: Prevent all combat damage blue creatures and black creatures would deal this turn." });
const goblinSkiPatrol = () => card("Goblin Ski Patrol", "Creature — Goblin", "{1}{R}", { cmc: 2, colors: ["R"], power: "1", toughness: "1", oracleText: "{1}{R}: This creature gets +2/+0 and gains flying. Its controller sacrifices it at the beginning of the next end step. Activate only once and only if you control a snow Mountain." });
const godhunterOctopus = () => card("Godhunter Octopus", "Creature — Octopus", "{5}{U}", { cmc: 6, colors: ["U"], power: "5", toughness: "5", oracleText: "This creature can't attack unless defending player controls an enchantment or an enchanted permanent." });
const iriniSengir = () => card("Irini Sengir", "Legendary Creature — Vampire Dwarf", "{2}{B}{B}", { cmc: 4, colors: ["B"], power: "2", toughness: "2", oracleText: "Green enchantment spells and white enchantment spells cost {2} more to cast." });
const gravebaneZombie = () => card("Gravebane Zombie", "Creature — Zombie", "{3}{B}", { cmc: 4, colors: ["B"], power: "3", toughness: "2", oracleText: "If this creature would die, put it on top of its owner's library instead." });
const deepSpawn = () => card("Deep Spawn", "Creature — Homarid", "{5}{U}{U}{U}", { cmc: 8, colors: ["U"], power: "6", toughness: "6", keywords: ["Trample","Mill"], oracleText: "Trample\nAt the beginning of your upkeep, sacrifice this creature unless you mill two cards.\n{U}: This creature gains shroud until end of turn and doesn't untap during your next untap step. Tap this creature. (A creature with shroud can't be the target of spells or abilities.)" });
const serendibDjinn = () => card("Serendib Djinn", "Creature — Djinn", "{2}{U}{U}", { cmc: 4, colors: ["U"], power: "5", toughness: "6", keywords: ["Flying"], oracleText: "Flying\nAt the beginning of your upkeep, sacrifice a land. If you sacrifice an Island this way, this creature deals 3 damage to you.\nWhen you control no lands, sacrifice this creature." });
const formOfTheDinosaur = () => card("Form of the Dinosaur", "Enchantment", "{4}{R}{R}", { cmc: 6, colors: ["R"], oracleText: "When this enchantment enters, your life total becomes 15.\nAt the beginning of your upkeep, this enchantment deals 15 damage to target creature an opponent controls and that creature deals damage equal to its power to you." });
const sunflareShaman = () => card("Sunflare Shaman", "Creature — Elemental Shaman", "{1}{R}", { cmc: 2, colors: ["R"], power: "2", toughness: "1", oracleText: "{1}{R}, {T}: This creature deals X damage to any target and X damage to itself, where X is the number of Elemental cards in your graveyard." });
const decoratedGriffin = () => card("Decorated Griffin", "Creature — Griffin", "{4}{W}", { cmc: 5, colors: ["W"], power: "2", toughness: "3", keywords: ["Flying"], oracleText: "Flying\n{1}{W}: Prevent the next 1 combat damage that would be dealt to you this turn." });
const banshee = () => card("Banshee", "Creature — Spirit", "{2}{B}{B}", { cmc: 4, colors: ["B"], power: "0", toughness: "1", oracleText: "{X}, {T}: This creature deals half X damage, rounded down, to any target, and half X damage, rounded up, to you." });
const wallOfTombstones = () => card("Wall of Tombstones", "Creature — Wall", "{1}{B}", { cmc: 2, colors: ["B"], power: "0", toughness: "1", keywords: ["Defender"], oracleText: "Defender (This creature can't attack.)\nAt the beginning of your upkeep, this creature's base toughness becomes equal to 1 plus the number of creature cards in your graveyard. (This effect lasts indefinitely.)" });
const garenbrigSquire = () => card("Garenbrig Squire", "Creature — Human Soldier", "{1}{G}", { cmc: 2, colors: ["G"], power: "2", toughness: "2", oracleText: "Whenever you cast a creature spell that has an Adventure, this creature gets +1/+1 until end of turn. (It doesn't need to have gone on the adventure first.)" });
const edgewallInnkeeper = () => card("Edgewall Innkeeper", "Creature — Human Peasant", "{G}", { cmc: 1, colors: ["G"], power: "1", toughness: "1", oracleText: "Whenever you cast a creature spell that has an Adventure, draw a card. (It doesn't need to have gone on the adventure first.)" });
const wandermare = () => card("Wandermare", "Creature — Horse", "{1}{G}{W}", { cmc: 3, colors: ["G","W"], power: "3", toughness: "3", oracleText: "Whenever you cast a creature spell that has an Adventure, put a +1/+1 counter on this creature. (It doesn't need to have gone on the adventure first.)" });
const highSeas = () => card("High Seas", "Enchantment", "{2}{U}", { cmc: 3, colors: ["U"], oracleText: "Red creature spells and green creature spells cost {1} more to cast." });
const brazenBorrower = () => scry("adventure", [
  { name: "Brazen Borrower", mana_cost: "{1}{U}{U}", type_line: "Creature — Faerie Rogue", oracle_text: "Flash\nFlying\nThis creature can block only creatures with flying.", power: "3", toughness: "1" },
  { name: "Petty Theft", mana_cost: "{1}{U}", type_line: "Instant — Adventure", oracle_text: "Return target nonland permanent an opponent controls to its owner's hand." },
], { keywords: ["Flying", "Flash"] });

const creature = (name: string, typeLine: string, manaCost: string, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, manaCost, { power: String(p), toughness: String(t), ...extra });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2, { cmc: 2, colors: ["G"] });
const windDrake = () => creature("Wind Drake", "Creature — Drake", "{2}{U}", 2, 2, { cmc: 3, colors: ["U"], keywords: ["Flying"], oracleText: "Flying" });
const elementalShade = () => creature("Fire Elemental", "Creature — Elemental", "{3}{R}{R}", 5, 4, { cmc: 5, colors: ["R"] });
const shock = () => card("Shock", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Shock deals 2 damage to any target." });
const divination = () => card("Divination", "Sorcery", "{2}{U}", { cmc: 3, colors: ["U"], oracleText: "Draw two cards." });
const zombify = () => card("Zombify", "Sorcery", "{3}{B}", { cmc: 4, colors: ["B"], oracleText: "Return target creature card from your graveyard to the battlefield." });
const murder = () => card("Murder", "Instant", "{1}{B}{B}", { cmc: 3, colors: ["B"], oracleText: "Destroy target creature." });
const quietGrove = () => card("Quiet Grove", "Enchantment", "{G}", { cmc: 1, colors: ["G"] });
const whiteGrove = () => card("Pale Grove", "Enchantment", "{G}{W}", { cmc: 2, colors: ["G", "W"] });
const redGrove = () => card("Red Grove", "Enchantment", "{R}", { cmc: 1, colors: ["R"] });
const snowMountain = () => card("Snow-Covered Mountain", "Basic Snow Land — Mountain");
const auraWard = () => card("Spirit Ward", "Enchantment — Aura", "{W}", { cmc: 1, colors: ["W"], oracleText: "Enchant creature\nEnchanted creature gets +1/+1." });

describe("Lane B round 34", () => {
  it("compiles every card fully", () => {
    supported(stormEntity(), predatorsGambit(), lingeringDeath(), crowdOfTrueBelievers(), viperCruelConspirator(), aboroth(), sabotageStrategist(), radiantKavu());
    supported(goblinSkiPatrol(), godhunterOctopus(), iriniSengir(), gravebaneZombie(), deepSpawn(), serendibDjinn(), formOfTheDinosaur(), sunflareShaman());
    supported(decoratedGriffin(), banshee(), wallOfTombstones(), garenbrigSquire(), edgewallInnkeeper(), wandermare(), highSeas());
  });
});

describe("Spells cast and costs", () => {
  it("Storm Entity: a +1/+1 counter for each other spell cast this turn, every player's, one cast while it was on the stack too", () => {
    const { s: s0, ap, ids, opp } = setup([divination(), stormEntity()]);
    let s = settle(castNow(s0, ap, ids[0]!));
    s = castNow(s, ap, ids[1]!);
    // The opponent answers with Shock at you while Storm Entity is on the stack.
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const bolt = toZone(s, opp, shock(), "hand");
    s.players[opp]!.manaPool.R = 1;
    s = settle(castNow(s, opp, bolt, [ply(ap)]));
    expect(zone(s, ids[1]!)).toBe("battlefield");
    expect([s.objects[ids[1]!]!.counters["+1/+1"], pt(s, ids[1]!)]).toEqual([2, "3/3"]);
    expect(kws(s, ids[1]!, "Haste")).toBe(true);
  });

  it("Storm Entity: returned by another spell, it counts that spell too (only its own cast isn't counted)", () => {
    const { s: s0, ap, ids } = setup([divination(), zombify()]);
    const e = toZone(s0, ap, stormEntity(), "graveyard");
    let s = settle(castNow(s0, ap, ids[0]!));
    s = settle(castNow(s, ap, ids[1]!, [tgt(e)]));
    expect([zone(s, e), pt(s, e)]).toEqual(["battlefield", "3/3"]);
  });

  it("Irini Sengir: green and white enchantment spells cost {2} more, a green-white one only {2}; other spells don't", () => {
    const { s: s0, ap, ids, opp } = setup([quietGrove(), whiteGrove(), redGrove(), greenBear()]);
    const extra = (s: GameState) => ids.map((id) => spellCost(s, ap, s.objects[id]!).extra);
    const before = extra(s0);
    putOnBattlefield(s0, opp, iriniSengir());
    const after = extra(s0);
    expect(after.map((n, i) => n - before[i]!)).toEqual([2, 2, 0, 0]);
  });
});

describe("Auras about their creature's controller", () => {
  it("Predator's Gambit: +2/+1, and intimidate only while the enchanted creature's controller controls no other creatures", () => {
    const { s: s0, ap, ids, opp } = setup([predatorsGambit(), predatorsGambit()]);
    const mine = putOnBattlefield(s0, ap, greenBear());
    const theirs = putOnBattlefield(s0, opp, greenBear());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(mine)]));
    expect([pt(s, mine), kws(s, mine, "Intimidate")]).toEqual(["4/3", true]);
    // On the opponent's lone creature: their creatures count, not yours.
    s = settle(castNow(s, ap, ids[1]!, [tgt(theirs)]));
    expect([pt(s, theirs), kws(s, theirs, "Intimidate")]).toEqual(["4/3", true]);
    const other = putOnBattlefield(s, ap, windDrake());
    expect([kws(s, mine, "Intimidate"), kws(s, theirs, "Intimidate")]).toEqual([false, true]);
    s.objects[other]!.zone = "graveyard";
    s.battlefield.splice(s.battlefield.indexOf(other), 1);
    invalidateCharacteristics(s);
    expect(kws(s, mine, "Intimidate")).toBe(true);
  });

  it("Lingering Death: the enchanted creature's controller sacrifices it at the beginning of their end step, not yours", () => {
    const { s: s0, ap, ids, opp } = setup([lingeringDeath()]);
    const theirs = putOnBattlefield(s0, opp, greenBear());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(theirs)]));
    s = settle(passUntil(s, "end", ap));
    expect(zone(s, theirs)).toBe("battlefield");
    s = settle(passUntil(s, "end", opp));
    expect([zone(s, theirs), zone(s, ids[0]!)]).toEqual(["graveyard", "graveyard"]);
  });
});

describe("Combat", () => {
  it("Crowd of True Believers: only a creature you control that's attacking alone; +1/+0 and you gain 1 life", () => {
    const { s: s0, ap, opp } = setup([]);
    const crowd = putOnBattlefield(s0, ap, crowdOfTrueBelievers());
    const bear = putOnBattlefield(s0, ap, greenBear());
    const drake = putOnBattlefield(s0, ap, windDrake());
    let s = attackWith(s0, [bear, drake], opp);
    expect(planActivate(s, ap, crowd, 0, [tgt(bear)])).toBeNull();
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const crowd1 = putOnBattlefield(s1, ap1, crowdOfTrueBelievers());
    const bear1 = putOnBattlefield(s1, ap1, greenBear());
    s = attackWith(s1, [bear1], opp1);
    s = settle(run(s, planActivate(s, ap1, crowd1, 0, [tgt(bear1)])));
    expect([pt(s, bear1), life(s, ap1)]).toEqual(["3/2", 41]);
  });

  it("Sabotage Strategist: creatures attacking you get -1/-0; ones attacking another player don't", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, sabotageStrategist());
    const bear = putOnBattlefield(s0, ap, greenBear());
    const drake = putOnBattlefield(s0, ap, windDrake());
    const third = nextPlayer(s0, opp);
    let s = act(passUntil(s0, "declareAttackers"), { type: "declareAttackers", player: ap, attacks: [{ attacker: bear, defender: opp }, { attacker: drake, defender: third }] });
    s = settle(s);
    expect([pt(s, bear), pt(s, drake)]).toEqual(["1/2", "2/2"]);
  });

  it("Radiant Kavu: blue creatures and black creatures deal no combat damage this turn; others do", () => {
    const { s: s0, ap, opp } = setup([]);
    const kavu = putOnBattlefield(s0, ap, radiantKavu());
    const bear = putOnBattlefield(s0, ap, greenBear());
    const drake = putOnBattlefield(s0, ap, windDrake());
    let s = settle(run(s0, planActivate(s0, ap, kavu, 0)));
    s = attackWith(s, [bear, drake], opp);
    s = passUntil(s, "end");
    expect(life(s, opp)).toBe(38);
  });

  it("Godhunter Octopus: attacks only a player who controls an enchantment or an enchanted permanent", () => {
    const { s, ap, opp } = setup([]);
    const octo = putOnBattlefield(s, ap, godhunterOctopus());
    expect(attackProblem(s, s.objects[octo]!, opp)).not.toBeNull();
    const bear = putOnBattlefield(s, opp, greenBear());
    const ward = putOnBattlefield(s, ap, auraWard());
    s.objects[ward]!.attachedTo = bear;
    invalidateCharacteristics(s);
    // Enchanted by your Aura, the opponent's creature is an enchanted permanent they control.
    expect(attackProblem(s, s.objects[octo]!, opp)).toBeNull();
    const third = nextPlayer(s, opp);
    expect(attackProblem(s, s.objects[octo]!, third)).not.toBeNull();
    putOnBattlefield(s, third, quietGrove());
    expect(attackProblem(s, s.objects[octo]!, third)).toBeNull();
  });

  it("Goblin Ski Patrol: only with a snow Mountain, only once; +2/+0 and flying, then its controller sacrifices it at the next end step", () => {
    const { s: s0, ap } = setup([]);
    const patrol = putOnBattlefield(s0, ap, goblinSkiPatrol());
    expect(planActivate(s0, ap, patrol, 0)).toBeNull();
    putOnBattlefield(s0, ap, snowMountain());
    let s = settle(run(s0, planActivate(s0, ap, patrol, 0)));
    expect([pt(s, patrol), kws(s, patrol, "Flying")]).toEqual(["3/1", true]);
    expect(planActivate(s, ap, patrol, 0)).toBeNull();
    s = settle(passUntil(s, "end", ap));
    expect(zone(s, patrol)).toBe("graveyard");
  });
});

describe("Upkeeps", () => {
  it("Aboroth: cumulative upkeep in -1/-1 counters: one for each age counter, or it's sacrificed", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.hand = [];
    const ab = putOnBattlefield(s0, ap, aboroth());
    let s = settle(toNextUpkeep(s0, ap), at("chooseMay", ap));
    expect(s.pending?.kind === "chooseMay" && s.pending.prompt).toMatch(/1 -1\/-1 counter/);
    s = settle(choose(s, true));
    expect([s.objects[ab]!.counters.age, pt(s, ab)]).toEqual([1, "8/8"]);
    // A second time: two more. The bot keeps it while it survives with some toughness left.
    s = settle(toNextUpkeep(s, ap));
    expect([s.objects[ab]!.counters.age, pt(s, ab)]).toEqual([2, "6/6"]);
    s.objects[ab]!.counters.age = 5;
    s = settle(toNextUpkeep(s, ap));
    expect(zone(s, ab)).toBe("graveyard");
  });

  it("Aboroth: declining sacrifices it", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.hand = [];
    const ab = putOnBattlefield(s0, ap, aboroth());
    let s = settle(toNextUpkeep(s0, ap), at("chooseMay", ap));
    s = settle(choose(s, false));
    expect(zone(s, ab)).toBe("graveyard");
  });

  it("Deep Spawn: mill two cards to keep it; with fewer than two in the library it's sacrificed", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.hand = [];
    const spawn = putOnBattlefield(s0, ap, deepSpawn());
    let s = settle(toNextUpkeep(s0, ap), at("chooseMay", ap));
    const lib = s.players[ap]!.library.length;
    const yard = s.players[ap]!.graveyard.length;
    s = settle(choose(s, true));
    expect([zone(s, spawn), s.players[ap]!.library.length, s.players[ap]!.graveyard.length]).toEqual(["battlefield", lib - 2, yard + 2]);
    s.players[ap]!.library = s.players[ap]!.library.slice(0, 2);
    s = settle(toNextUpkeep(s, ap), at("chooseMay", ap));
    // Drew one: one card left, so it can't be kept.
    expect(s.players[ap]!.library.length).toBe(1);
    expect([zone(s, spawn), s.pending?.kind]).toEqual(["graveyard", undefined]);
  });

  it("Deep Spawn: {U} gives it shroud until end of turn, taps it, and it doesn't untap during your next untap step", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.hand = [];
    const spawn = putOnBattlefield(s0, ap, deepSpawn());
    let s = settle(run(s0, planActivate(s0, ap, spawn, 0)));
    expect([s.objects[spawn]!.tapped, kws(s, spawn, "Shroud")]).toEqual([true, true]);
    s = passUntil(passUntil(s, "main1", nextPlayer(s, ap)), "upkeep", ap);
    expect([s.objects[spawn]!.tapped, kws(s, spawn, "Shroud")]).toEqual([true, false]);
  });

  it("Serendib Djinn: sacrifice a land each upkeep; an Island deals 3 damage to you, another land doesn't", () => {
    for (const [sub, hurt] of [["Island", 3], ["Forest", 0]] as const) {
      const { s: s0, ap } = setup([]);
      s0.players[ap]!.hand = [];
      putOnBattlefield(s0, ap, serendibDjinn());
      let s = settle(toNextUpkeep(s0, ap), at("pickPermanents", ap));
      const p = s.pending;
      if (p?.kind !== "pickPermanents") throw new Error(`no pick: ${p?.kind}`);
      const land = p.options.find((id) => characteristics(s, s.objects[id]!).subtypes.includes(sub))!;
      const before = life(s, ap);
      s = settle(act(s, { type: "pickPermanents", player: ap, ids: [land] }));
      expect([zone(s, land), before - life(s, ap)]).toEqual(["graveyard", hurt]);
    }
  });

  it("Form of the Dinosaur: your life total becomes 15; each upkeep 15 damage to an opponent's creature, which deals its power to you", () => {
    const { s: s0, ap, ids, opp } = setup([formOfTheDinosaur()]);
    s0.players[ap]!.hand = [ids[0]!];
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(life(s, ap)).toBe(15);
    const fatty = putOnBattlefield(s, opp, elementalShade());
    s = settle(toNextUpkeep(s, ap));
    expect([zone(s, fatty), life(s, ap)]).toEqual(["graveyard", 10]);
  });

  it("Form of the Dinosaur: the target gone by then, you're dealt no damage (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    s0.players[ap]!.hand = [];
    putOnBattlefield(s0, ap, formOfTheDinosaur());
    const fatty = putOnBattlefield(s0, opp, elementalShade());
    let s = settle(toNextUpkeep(s0, ap), (x) => x.stack.length > 0);
    expect(s.stack.length).toBe(1);
    s.objects[fatty]!.zone = "graveyard";
    s.battlefield.splice(s.battlefield.indexOf(fatty), 1);
    s.players[opp]!.graveyard.push(fatty);
    invalidateCharacteristics(s);
    s = settle(s);
    expect(life(s, ap)).toBe(40);
  });
});

describe("Damage and dying", () => {
  it("Gravebane Zombie: dying, it's put on top of its owner's library instead", () => {
    const { s: s0, ap, ids, opp } = setup([murder()]);
    const z = putOnBattlefield(s0, opp, gravebaneZombie());
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(z)]));
    expect([zone(s, z), s.players[opp]!.library[0]]).toEqual(["library", z]);
  });

  it("Sunflare Shaman: X damage to any target and X to itself, X the Elemental cards in your graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    const shaman = putOnBattlefield(s0, ap, sunflareShaman());
    toZone(s0, ap, elementalShade(), "graveyard");
    toZone(s0, ap, sunflareShaman(), "graveyard");
    toZone(s0, ap, greenBear(), "graveyard");
    const s = settle(run(s0, planActivate(s0, ap, shaman, 0, [ply(opp)])));
    expect([life(s, opp), zone(s, shaman)]).toEqual([38, "graveyard"]);
  });
});

describe("More", () => {
  it("Decorated Griffin: each activation prevents the next 1 combat damage to you this turn, not other damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const griffin = putOnBattlefield(s0, opp, decoratedGriffin());
    const bear = putOnBattlefield(s0, ap, greenBear());
    const drake = putOnBattlefield(s0, ap, windDrake());
    s0.players[opp]!.manaPool.W = 2;
    s0.players[opp]!.manaPool.C = 2;
    s0.players[ap]!.manaPool.R = 1;
    let s = s0;
    for (let i = 0; i < 2; i++) {
      while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      s = settle(run(s, planActivate(s, opp, griffin, 0)));
    }
    // Shock isn't combat damage: it deals its full 2.
    s = settle(castNow(s, ap, toZone(s, ap, shock(), "hand"), [ply(opp)]));
    expect(life(s, opp)).toBe(38);
    s = attackWith(s, [bear, drake], opp);
    for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: opp, blocks: [] });
    // Two sources at once: the player picks which one each 1-point shield applies to (CR 615.7).
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let k = 0; k < 2; k++) {
      expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "damageShield" });
      s = act(s, { type: "chooseOption", player: opp, choice: (s.pending as { options: string[] }).options[0]! });
    }
    s = passUntil(s, "end");
    // 4 combat damage, 2 of it prevented.
    expect(life(s, opp)).toBe(36);
  });

  it("Banshee: half X rounded down to the target, half X rounded up to you", () => {
    const { s: s0, ap, opp } = setup([]);
    const banshee0 = putOnBattlefield(s0, ap, banshee());
    const s = settle(run(s0, planActivate(s0, ap, banshee0, 0, [ply(opp)], undefined, undefined, 5)));
    expect([life(s, opp), life(s, ap)]).toEqual([38, 37]);
  });

  it("Wall of Tombstones: each upkeep its base toughness becomes 1 plus the creature cards in your graveyard, locked in then", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.hand = [];
    const wall = putOnBattlefield(s0, ap, wallOfTombstones());
    toZone(s0, ap, greenBear(), "graveyard");
    toZone(s0, ap, windDrake(), "graveyard");
    toZone(s0, ap, shock(), "graveyard");
    let s = settle(toNextUpkeep(s0, ap));
    expect(pt(s, wall)).toBe("0/3");
    toZone(s, ap, greenBear(), "graveyard");
    expect(pt(s, wall)).toBe("0/3");
  });

  it("Garenbrig Squire: +1/+1 for a creature spell that has an Adventure, not the Adventure itself nor another creature spell", () => {
    const { s: s0, ap, ids, opp } = setup([brazenBorrower(), brazenBorrower(), greenBear()]);
    const squire = putOnBattlefield(s0, ap, garenbrigSquire());
    const victim = putOnBattlefield(s0, opp, quietGrove());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(victim)], undefined, "auto", undefined, { face: 1 })));
    expect([zone(s, victim), pt(s, squire)]).toEqual(["hand", "2/2"]);
    s = settle(castNow(s, ap, ids[2]!));
    expect(pt(s, squire)).toBe("2/2");
    s = settle(castNow(s, ap, ids[1]!));
    expect([zone(s, ids[1]!), pt(s, squire)]).toEqual(["battlefield", "3/3"]);
  });

  it("Edgewall Innkeeper and Wandermare: a card for, and a +1/+1 counter for, a creature spell that has an Adventure", () => {
    const { s: s0, ap, ids } = setup([brazenBorrower(), greenBear()]);
    putOnBattlefield(s0, ap, edgewallInnkeeper());
    const mare = putOnBattlefield(s0, ap, wandermare());
    const hand = s0.players[ap]!.hand.length;
    let s = settle(castNow(s0, ap, ids[1]!));
    expect([s.players[ap]!.hand.length, pt(s, mare)]).toEqual([hand - 1, "3/3"]);
    s = settle(castNow(s, ap, ids[0]!));
    expect([s.players[ap]!.hand.length, pt(s, mare)]).toEqual([hand - 1, "4/4"]);
  });

  it("High Seas: red creature spells and green creature spells cost {1} more; a green noncreature spell doesn't", () => {
    const { s: s0, ap, ids, opp } = setup([greenBear(), elementalShade(), windDrake(), quietGrove()]);
    const extra = (s: GameState) => ids.map((id) => spellCost(s, ap, s.objects[id]!).extra);
    const before = extra(s0);
    putOnBattlefield(s0, opp, highSeas());
    expect(extra(s0).map((n, i) => n - before[i]!)).toEqual([1, 1, 0, 0]);
  });
});
