// Lane B, round 45: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, scry, setup } from "./helpers";
import { blockProblem, botActions, characteristics, gainLife, nameOf, controllerOf, dealDamage, invalidateCharacteristics, isFullySupported, loseLife, objectSource, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const find = (s: GameState, pid: PlayerId, found: string[]) => act(s, { type: "searchLibrary", player: pid, found });
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
/** Leaves only `keep` in `pid`'s hand (setup's hand also holds the seven cards drawn). */
const onlyHand = (s: GameState, pid: PlayerId, keep: string[]) => {
  const p = s.players[pid]!;
  for (const id of p.hand.filter((id) => !keep.includes(id))) {
    s.objects[id]!.zone = "exile";
    p.exile.push(id);
  }
  p.hand = p.hand.filter((id) => keep.includes(id));
};
const counters = (s: GameState, id: string, kind = "+1/+1") => s.objects[id]!.counters?.[kind] ?? 0;

const toBlocks = (s: GameState) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const tapLands = (s: GameState, pid: PlayerId, keep: string[] = []) => {
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid && !keep.includes(id) && s.cards[s.objects[id]!.cardId]!.typeLine.includes("Land")) s.objects[id]!.tapped = true;
};

// Real oracle text (Scryfall).
const thrabenExorcism = () => card("Thraben Exorcism", "Instant", "{1}{W}", { cmc: 2, colors: ["W"], oracleText: "Exile target Spirit, creature with disturb, or enchantment." });
const publicExecution = () => card("Public Execution", "Instant", "{5}{B}", { cmc: 6, colors: ["B"], oracleText: "Destroy target creature an opponent controls. Each other creature that player controls gets -2/-0 until end of turn." });
const standUnited = () => card("Stand United", "Instant", "{1}{G/W}", { cmc: 2, colors: ["G","W"], keywords: ["Scry"], oracleText: "Target creature gets +2/+2 until end of turn. If it's an Ally, scry 2. (Look at the top two cards of your library, then put any number of them on the bottom and the rest on top in any order.)" });
const willOfTheAllHunter = () => card("Will of the All-Hunter", "Instant", "{1}{W}", { cmc: 2, colors: ["W"], keywords: ["Cycling"], oracleText: "Target creature gets +2/+2 until end of turn. If it's blocking, instead put two +1/+1 counters on it.\nCycling {2} ({2}, Discard this card: Draw a card.)" });
const inflame = () => card("Inflame", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Inflame deals 2 damage to each creature dealt damage this turn." });
const executionersSwing = () => card("Executioner's Swing", "Instant", "{W}{B}", { cmc: 2, colors: ["B","W"], oracleText: "Target creature that dealt damage this turn gets -5/-5 until end of turn." });
const dragonHunter = () => card("Dragon Hunter", "Creature — Human Warrior", "{W}", { cmc: 1, colors: ["W"], power: "2", toughness: "1", keywords: ["Protection"], oracleText: "Protection from Dragons\nThis creature can block Dragons as though it had reach." });
const rixMaadiGuildmage = () => card("Rix Maadi Guildmage", "Creature — Human Shaman", "{B}{R}", { cmc: 2, colors: ["B","R"], power: "2", toughness: "2", oracleText: "{B}{R}: Target blocking creature gets -1/-1 until end of turn.\n{B}{R}: Target player who lost life this turn loses 1 life." });
const foeliage = () => card("Foe-liage", "Creature — Plant Mutant", "{3}{G}", { cmc: 4, colors: ["G"], power: "3", toughness: "3", oracleText: "Whenever a land enters during your turn, put a +1/+1 counter on this creature." });
const mysticDecree = () => card("Mystic Decree", "World Enchantment", "{2}{U}{U}", { cmc: 4, colors: ["U"], supertypes: ["World"], oracleText: "All creatures lose flying and islandwalk." });
const cabalSlaver = () => card("Cabal Slaver", "Creature — Human Cleric", "{2}{B}", { cmc: 3, colors: ["B"], power: "2", toughness: "1", oracleText: "Whenever a Goblin deals combat damage to a player, that player discards a card." });
const saprolingInfestation = () => card("Saproling Infestation", "Enchantment", "{1}{G}", { cmc: 2, colors: ["G"], oracleText: "Whenever a player kicks a spell, you create a 1/1 green Saproling creature token." });
const naturalEmergence = () => card("Natural Emergence", "Enchantment", "{2}{R}{G}", { cmc: 4, colors: ["G","R"], oracleText: "When this enchantment enters, return a red or green enchantment you control to its owner's hand.\nLands you control are 2/2 creatures with first strike. They're still lands." });
const yawgmothsAgenda = () => card("Yawgmoth's Agenda", "Enchantment", "{3}{B}{B}", { cmc: 5, colors: ["B"], oracleText: "You can't cast more than one spell each turn.\nYou may play lands and cast spells from your graveyard.\nIf a card would be put into your graveyard from anywhere, exile it instead." });
const veneratedTeacher = () => card("Venerated Teacher", "Creature — Human Wizard", "{2}{U}", { cmc: 3, colors: ["U"], power: "2", toughness: "2", oracleText: "When this creature enters, put two level counters on each creature you control with level up." });
const batteringRam = () => card("Battering Ram", "Artifact Creature — Construct", "{2}", { cmc: 2, power: "1", toughness: "1", oracleText: "At the beginning of combat on your turn, this creature gains banding until end of combat. (Any creatures with banding, and up to one without, can attack in a band. Bands are blocked as a group. If any creatures with banding you control are being blocked by a creature, you divide that creature's combat damage, not its controller, among any of the creatures it's blocking.)\nWhenever this creature becomes blocked by a Wall, destroy that Wall at end of combat." });
const maraxusOfKeld = () => card("Maraxus of Keld", "Legendary Creature — Human Warrior", "{4}{R}{R}", { cmc: 6, colors: ["R"], power: "*", toughness: "*", supertypes: ["Legendary"], oracleText: "Maraxus's power and toughness are each equal to the number of untapped artifacts, creatures, and lands you control." });
const tobias = () => card("Tobias, Doomed Conqueror", "Legendary Creature — Human Soldier", "{2}{W}{U}", { cmc: 4, colors: ["U","W"], power: "3", toughness: "2", keywords: ["Flash"], supertypes: ["Legendary"], oracleText: "Flash\nWhen Tobias dies, for each nontoken creature you controlled that died this turn, create a 2/2 black Zombie creature token." });
const mACH1 = () => card("MACH-1, Swooping Scoundrel", "Legendary Artifact Creature — Human Villain", "{1}{B}", { cmc: 2, colors: ["B"], power: "1", toughness: "3", keywords: ["Flying","Surveil"], supertypes: ["Legendary"], oracleText: "Flying\nWhen MACH-1 enters and whenever you gain life, surveil 1. This ability triggers only once each turn. (To surveil 1, look at the top card of your library. You may put it into your graveyard.)" });
const redGuardian = () => card("Red Guardian, Super-Soldier", "Legendary Creature — Human Soldier Villain", "{2}{W}", { cmc: 3, colors: ["W"], power: "2", toughness: "2", keywords: ["Flash"], supertypes: ["Legendary"], oracleText: "Flash\nWhen Red Guardian enters, destroy target creature an opponent controls that dealt damage this turn." });
const avengingArrow = () => card("Avenging Arrow", "Instant", "{2}{W}", { cmc: 3, colors: ["W"], oracleText: "Destroy target creature that dealt damage this turn." });
const restoreThePeace = () => card("Restore the Peace", "Instant", "{1}{W}{U}", { cmc: 3, colors: ["U","W"], oracleText: "Return each creature that dealt damage this turn to its owner's hand." });
const deathRattleOni = () => card("Death-Rattle Oni", "Creature — Demon Spirit", "{6}{B}", { cmc: 7, colors: ["B"], power: "5", toughness: "4", keywords: ["Flash"], oracleText: "Flash\nThis spell costs {2} less to cast for each creature that died this turn.\nWhen this creature enters, destroy all other creatures that were dealt damage this turn." });
const chainflailCentipede = () => card("Chainflail Centipede", "Artifact Creature — Equipment Insect", "{2}{B}", { cmc: 3, colors: ["B"], power: "2", toughness: "2", keywords: ["Reconfigure"], oracleText: "Whenever this creature or equipped creature attacks, it gets +2/+0 until end of turn.\nReconfigure {2} ({2}: Attach to target creature you control; or unattach from a creature. Reconfigure only as a sorcery. While attached, this isn't a creature.)" });
const swampbenders = () => card("Swampbenders", "Creature — Human Druid Ally", "{4}{G}{G}", { cmc: 6, colors: ["G"], power: "*", toughness: "*", oracleText: "Swampbenders's power and toughness are each equal to the number of Swamps on the battlefield.\nLands you control are Swamps in addition to their other types." });
const ghostflameSliver = () => card("Ghostflame Sliver", "Creature — Sliver", "{B}{R}", { cmc: 2, colors: ["B","R"], power: "2", toughness: "2", oracleText: "All Slivers are colorless." });
const flamesOfTheRazeBoar = () => card("Flames of the Raze-Boar", "Instant", "{5}{R}", { cmc: 6, colors: ["R"], oracleText: "Flames of the Raze-Boar deals 4 damage to target creature an opponent controls. Then Flames of the Raze-Boar deals 2 damage to each other creature that player controls if you control a creature with power 4 or greater." });
const treacherousGreed = () => card("Treacherous Greed", "Instant", "{1}{W}{B}", { cmc: 3, colors: ["B","W"], oracleText: "As an additional cost to cast this spell, sacrifice a creature that dealt damage this turn.\nDraw three cards. Each opponent loses 3 life and you gain 3 life." });
const beastbreaker = () => card("Beastbreaker of Bala Ged", "Creature — Human Warrior", "{1}{G}", { cmc: 2, colors: ["G"], power: "2", toughness: "2", keywords: ["Level Up","Trample"], oracleText: "Level up {2}{G} ({2}{G}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 1-3\n4/4\nLEVEL 4+\n6/6\nTrample" });
const burstLightning = () => card("Burst Lightning", "Instant", "{R}", { cmc: 1, colors: ["R"], keywords: ["Kicker"], oracleText: "Kicker {4} (You may pay an additional {4} as you cast this spell.)\nBurst Lightning deals 2 damage to any target. If this spell was kicked, it deals 4 damage instead." });
const baithookAngler = () => scry("transform", [{ name: "Baithook Angler", mana_cost: "{1}{U}", type_line: "Creature — Human Peasant", oracle_text: "Disturb {1}{U} (You may cast this card from your graveyard transformed for its disturb cost.)", power: "2", toughness: "1" }, { name: "Hook-Haunt Drifter", type_line: "Creature — Spirit", oracle_text: "Flying\nIf Hook-Haunt Drifter would be put into a graveyard from anywhere, exile it instead.", power: "1", toughness: "2", color_indicator: ["U"] }], { keywords: ["Flying", "Transform", "Disturb"] });

// Test cards.
const vanilla = (name: string, typeLine: string, cost: string, cmc: number, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, cost, { cmc, power: String(p), toughness: String(t), ...extra });
const opt = () => card("Test Opt", "Instant", "{U}", { cmc: 1, colors: ["U"], oracleText: "Draw a card." });
const growth = () => card("Test Growth", "Instant", "{G}", { cmc: 1, colors: ["G"], oracleText: "Target creature gets +3/+3 until end of turn." });
const forestCard = () => card("Forest", "Basic Land — Forest", "", { cmc: 0 });
const ench = () => card("Test Enchantment", "Enchantment", "{1}{W}", { cmc: 2, colors: ["W"] });

describe("Lane B round 45 cards", () => {
  it("are fully supported", () => {
    supported(thrabenExorcism(), publicExecution(), standUnited(), willOfTheAllHunter(), inflame(), executionersSwing(), dragonHunter(), rixMaadiGuildmage(), foeliage(), mysticDecree(), cabalSlaver(), saprolingInfestation(), naturalEmergence(), yawgmothsAgenda(), veneratedTeacher(), batteringRam(), maraxusOfKeld(), tobias(), mACH1(), redGuardian(), avengingArrow(), restoreThePeace(), deathRattleOni(), chainflailCentipede(), swampbenders(), ghostflameSliver(), flamesOfTheRazeBoar(), treacherousGreed());
  });
});

describe("Thraben Exorcism", () => {
  it("exiles a Spirit, a creature with disturb or an enchantment, not another creature", () => {
    const { s, ap, ids, opp } = setup([thrabenExorcism()]);
    const spirit = putOnBattlefield(s, opp, vanilla("Test Spirit", "Creature — Spirit", "{1}{W}", 2, 1, 1));
    const angler = putOnBattlefield(s, opp, baithookAngler());
    const e = putOnBattlefield(s, opp, ench());
    const bear = putOnBattlefield(s, opp, vanilla("Plain Bear", "Creature — Bear", "{1}{G}", 2, 2, 2));
    for (const id of [spirit, angler, e]) expect(planCast(s, ap, ids[0]!, [tgt(id)]), nameOf(s, id)).not.toBeNull();
    expect(planCast(s, ap, ids[0]!, [tgt(bear)])).toBeNull();
    const after = settle(castNow(s, ap, ids[0]!, [tgt(angler)]));
    expect(zone(after, angler)).toBe("exile");
  });
});

describe("Public Execution", () => {
  it("destroys the target and gives each other creature its controller controls -2/-0", () => {
    const { s: s0, ap, ids, opp } = setup([publicExecution()]);
    const victim = putOnBattlefield(s0, opp, vanilla("Victim", "Creature — Bear", "{1}{G}", 2, 3, 3));
    const other = putOnBattlefield(s0, opp, vanilla("Other", "Creature — Bear", "{1}{G}", 2, 3, 3));
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const bystander = putOnBattlefield(s0, third, vanilla("Bystander", "Creature — Bear", "{1}{G}", 2, 3, 3));
    const mine = putOnBattlefield(s0, ap, vanilla("Mine", "Creature — Bear", "{1}{G}", 2, 3, 3));
    expect(planCast(s0, ap, ids[0]!, [tgt(mine)])).toBeNull();
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(victim)]));
    expect([zone(s, victim), pt(s, other), pt(s, bystander), pt(s, mine)]).toEqual(["graveyard", "1/3", "3/3", "3/3"]);
  });
  it("still gives the others -2/-0 when the target survives, not the target itself", () => {
    const { s: s0, ap, ids, opp } = setup([publicExecution()]);
    const victim = putOnBattlefield(s0, opp, vanilla("Tough", "Creature — Bear", "{1}{G}", 2, 3, 3, { keywords: ["Indestructible"], oracleText: "Indestructible" }));
    const other = putOnBattlefield(s0, opp, vanilla("Other", "Creature — Bear", "{1}{G}", 2, 3, 3));
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(victim)]));
    expect([zone(s, victim), pt(s, victim), pt(s, other)]).toEqual(["battlefield", "3/3", "1/3"]);
  });
});

describe("Stand United", () => {
  it("gives +2/+2 and scries 2 only if the creature is an Ally", () => {
    const { s: s0, ap, ids } = setup([standUnited(), standUnited()]);
    const ally = putOnBattlefield(s0, ap, vanilla("Test Ally", "Creature — Human Ally", "{1}{W}", 2, 2, 2));
    const bear = putOnBattlefield(s0, ap, vanilla("Plain Bear", "Creature — Bear", "{1}{G}", 2, 2, 2));
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(bear)]), at("arrangeTop", ap));
    expect([s.pending ?? null, pt(s, bear)]).toEqual([null, "4/4"]);
    s = settle(castNow(s, ap, ids[1]!, [tgt(ally)]), at("arrangeTop", ap));
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap, how: "scry" });
    const top = s.players[ap]!.library.slice(0, 2);
    expect((s.pending as { cards: string[] }).cards).toEqual(top);
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [], away: top }));
    expect([pt(s, ally), s.players[ap]!.library.slice(-2)]).toEqual(["4/4", top]);
  });
});

describe("Will of the All-Hunter", () => {
  it("gives +2/+2 until end of turn, or two +1/+1 counters to a blocking creature", () => {
    const { s: s0, ap, ids, opp } = setup([willOfTheAllHunter()]);
    const theirs = toZone(s0, opp, willOfTheAllHunter(), "hand");
    const attacker = putOnBattlefield(s0, ap, vanilla("Attacker", "Creature — Bear", "{1}{G}", 2, 2, 2));
    const blocker = putOnBattlefield(s0, opp, vanilla("Blocker", "Creature — Bear", "{1}{G}", 2, 2, 2));
    // Not blocking: +2/+2 for the turn.
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(attacker)]));
    expect([pt(s, attacker), counters(s, attacker)]).toEqual(["4/4", 0]);
    s = attackWith(s, [attacker], opp);
    s = toBlocks(s);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker }] });
    for (let i = 0; i < 10 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s.players[opp]!.manaPool.W = 2;
    s.players[opp]!.manaPool.C = 1;
    s = run(s, planCast(s, opp, theirs, [tgt(blocker)]));
    s = settle(s);
    expect([counters(s, blocker), pt(s, blocker)]).toEqual([2, "4/4"]);
  });
});

describe("Inflame and Death-Rattle Oni", () => {
  it("Inflame deals 2 damage to each creature dealt damage this turn, and no other", () => {
    const { s: s0, ap, ids, opp } = setup([inflame()]);
    const hurt = putOnBattlefield(s0, opp, vanilla("Hurt", "Creature — Bear", "{1}{G}", 2, 2, 4));
    const fine = putOnBattlefield(s0, opp, vanilla("Fine", "Creature — Bear", "{1}{G}", 2, 2, 2));
    const src = putOnBattlefield(s0, ap, vanilla("Source", "Creature — Bear", "{1}{G}", 2, 2, 2));
    dealDamage(s0, objectSource(s0, s0.objects[src]!), { object: s0.objects[hurt]! }, 1);
    const s = settle(castNow(s0, ap, ids[0]!));
    expect([s.objects[hurt]!.damage, zone(s, fine), s.objects[fine]!.damage]).toEqual([3, "battlefield", 0]);
  });
  it("Death-Rattle Oni destroys all other creatures that were dealt damage this turn", () => {
    const { s: s0, ap, ids, opp } = setup([deathRattleOni()]);
    const hurt = putOnBattlefield(s0, opp, vanilla("Hurt", "Creature — Bear", "{1}{G}", 2, 2, 4));
    const fine = putOnBattlefield(s0, opp, vanilla("Fine", "Creature — Bear", "{1}{G}", 2, 2, 2));
    const src = putOnBattlefield(s0, ap, vanilla("Source", "Creature — Bear", "{1}{G}", 2, 2, 2));
    dealDamage(s0, objectSource(s0, s0.objects[src]!), { object: s0.objects[hurt]! }, 1);
    const s = settle(castNow(s0, ap, ids[0]!));
    expect([zone(s, ids[0]!), zone(s, hurt), zone(s, fine), zone(s, src)]).toEqual(["battlefield", "graveyard", "battlefield", "battlefield"]);
  });
});

describe("creatures that dealt damage this turn", () => {
  it("Executioner's Swing and Avenging Arrow target only a creature that dealt damage this turn", () => {
    const { s: s0, ap, ids, opp } = setup([executionersSwing(), avengingArrow()]);
    const dealer = putOnBattlefield(s0, opp, vanilla("Dealer", "Creature — Bear", "{1}{G}", 2, 3, 6));
    const idle = putOnBattlefield(s0, opp, vanilla("Idle", "Creature — Bear", "{1}{G}", 2, 3, 6));
    const victim = putOnBattlefield(s0, ap, vanilla("Victim", "Creature — Bear", "{1}{G}", 2, 1, 6));
    expect(planCast(s0, ap, ids[0]!, [tgt(dealer)])).toBeNull();
    dealDamage(s0, objectSource(s0, s0.objects[dealer]!), { object: s0.objects[victim]! }, 1);
    expect(planCast(s0, ap, ids[0]!, [tgt(idle)])).toBeNull();
    expect(planCast(s0, ap, ids[1]!, [tgt(idle)])).toBeNull();
    expect(planCast(s0, ap, ids[1]!, [tgt(victim)])).toBeNull();
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(dealer)]));
    expect(pt(s, dealer)).toBe("-2/1");
    s = settle(castNow(s, ap, ids[1]!, [tgt(dealer)]));
    expect(zone(s, dealer)).toBe("graveyard");
  });
  it("a creature that left and came back is a new object that hasn't dealt damage", () => {
    const { s, ap, ids, opp } = setup([avengingArrow()]);
    const dealer = putOnBattlefield(s, opp, vanilla("Dealer", "Creature — Bear", "{1}{G}", 2, 3, 6));
    dealDamage(s, objectSource(s, s.objects[dealer]!), { player: ap }, 1);
    expect(planCast(s, ap, ids[0]!, [tgt(dealer)])).not.toBeNull();
    s.objects[dealer]!.zoneChanges = (s.objects[dealer]!.zoneChanges ?? 0) + 2;
    expect(planCast(s, ap, ids[0]!, [tgt(dealer)])).toBeNull();
  });
  it("Red Guardian destroys target creature an opponent controls that dealt damage this turn", () => {
    const { s: s0, ap, ids, opp } = setup([redGuardian()]);
    const dealer = putOnBattlefield(s0, opp, vanilla("Dealer", "Creature — Bear", "{1}{G}", 2, 3, 6));
    const mine = putOnBattlefield(s0, ap, vanilla("Mine", "Creature — Bear", "{1}{G}", 2, 3, 6));
    dealDamage(s0, objectSource(s0, s0.objects[dealer]!), { player: ap }, 1);
    dealDamage(s0, objectSource(s0, s0.objects[mine]!), { player: opp }, 1);
    let s = settle(castNow(s0, ap, ids[0]!), (x) => x.pending?.kind === "chooseTargets");
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(mine)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(dealer)] }));
    expect([zone(s, dealer), zone(s, mine)]).toEqual(["graveyard", "battlefield"]);
  });
  it("Restore the Peace returns each creature that dealt damage this turn to its owner's hand", () => {
    const { s: s0, ap, ids, opp } = setup([restoreThePeace()]);
    const dealer = putOnBattlefield(s0, opp, vanilla("Dealer", "Creature — Bear", "{1}{G}", 2, 3, 6));
    const idle = putOnBattlefield(s0, opp, vanilla("Idle", "Creature — Bear", "{1}{G}", 2, 3, 6));
    const mine = putOnBattlefield(s0, ap, vanilla("Mine", "Creature — Bear", "{1}{G}", 2, 3, 6));
    dealDamage(s0, objectSource(s0, s0.objects[dealer]!), { object: s0.objects[mine]! }, 1);
    dealDamage(s0, objectSource(s0, s0.objects[mine]!), { player: opp }, 1);
    const s = settle(castNow(s0, ap, ids[0]!));
    expect([zone(s, dealer), zone(s, mine), zone(s, idle)]).toEqual(["hand", "hand", "battlefield"]);
  });
});

describe("Dragon Hunter", () => {
  it("can block Dragons with flying as though it had reach, not other flyers", () => {
    const { s, ap, opp } = setup([]);
    const hunter = putOnBattlefield(s, opp, dragonHunter());
    const dragon = putOnBattlefield(s, ap, vanilla("Test Dragon", "Creature — Dragon", "{4}{R}", 5, 4, 4, { keywords: ["Flying"], oracleText: "Flying" }));
    const drake = putOnBattlefield(s, ap, vanilla("Test Drake", "Creature — Drake", "{1}{U}", 2, 2, 2, { keywords: ["Flying"], oracleText: "Flying" }));
    s.objects[dragon]!.attacking = opp;
    s.objects[drake]!.attacking = opp;
    expect(blockProblem(s, s.objects[hunter]!, s.objects[drake]!)).toMatch(/flying/);
    // Its protection from Dragons doesn't stop it blocking one (CR 702.16f is about the blocker having protection).
    expect(blockProblem(s, s.objects[hunter]!, s.objects[dragon]!)).toBeNull();
  });
});

describe("Rix Maadi Guildmage", () => {
  it("targets only a player who lost life this turn", () => {
    const { s, ap, opp } = setup([]);
    const mage = putOnBattlefield(s, ap, rixMaadiGuildmage());
    expect(planActivate(s, ap, mage, 1, [ply(opp)])).toBeNull();
    loseLife(s, opp, 1);
    const before = life(s, opp);
    const after = settle(run(s, planActivate(s, ap, mage, 1, [ply(opp)])));
    expect(life(after, opp)).toBe(before - 1);
  });
});

describe("Foe-liage", () => {
  it("gets a counter when a land enters during your turn, anyone's, but not during another player's turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const plant = putOnBattlefield(s0, ap, foeliage());
    const mine = toZone(s0, ap, forestCard(), "hand");
    let s = settle(act(s0, { type: "playLand", player: ap, objectId: mine }));
    expect(counters(s, plant)).toBe(1);
    s = goUntil(s, (x) => x.activePlayer === opp && x.step === "main1" && !x.pending && !x.stack.length);
    const theirs = toZone(s, opp, forestCard(), "hand");
    s = settle(act(s, { type: "playLand", player: opp, objectId: theirs }));
    expect([zone(s, theirs), counters(s, plant)]).toEqual(["battlefield", 1]);
  });
});

describe("Mystic Decree", () => {
  it("all creatures lose flying and islandwalk", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, mysticDecree());
    const c = putOnBattlefield(s, opp, vanilla("Sea Flyer", "Creature — Bird", "{1}{U}", 2, 2, 2, { keywords: ["Flying", "Islandwalk"], oracleText: "Flying, islandwalk" }));
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[c]!).keywords).toEqual([]);
  });
});

describe("Cabal Slaver", () => {
  it("whenever anyone's Goblin deals combat damage to a player, that player discards a card", () => {
    const { s: s0, ap, opp } = setup([]);
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    putOnBattlefield(s0, third, cabalSlaver());
    const goblin = putOnBattlefield(s0, ap, vanilla("Test Goblin", "Creature — Goblin", "{R}", 1, 1, 1));
    const bear = putOnBattlefield(s0, ap, vanilla("Test Bear", "Creature — Bear", "{1}{G}", 2, 2, 2));
    const hand = s0.players[opp]!.hand.length;
    let s = attackWith(s0, [goblin, bear], opp);
    s = toBlocks(s);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [] });
    s = goUntil(s, (x) => x.step === "endCombat" || x.step === "main2");
    expect(s.players[opp]!.hand.length).toBe(hand - 1);
  });
});

describe("Saproling Infestation", () => {
  it("creates a Saproling for its controller whenever any player kicks a spell", () => {
    const { s: s0, ap, ids, opp } = setup([burstLightning(), burstLightning()]);
    putOnBattlefield(s0, opp, saprolingInfestation());
    const saps = (s: GameState) => s.battlefield.filter((id) => nameOf(s, id) === "Saproling Token" && controllerOf(s, s.objects[id]!) === opp).length;
    let s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]));
    expect(saps(s)).toBe(0);
    s = settle(castNow(s, ap, ids[1]!, [ply(opp)], { kicks: [0] }));
    expect(saps(s)).toBe(1);
  });
});

describe("Natural Emergence", () => {
  it("returns a red or green enchantment you control (itself if it's the only one) and makes your lands 2/2 first strikers", () => {
    const { s: s0, ap, ids, opp } = setup([naturalEmergence()]);
    const theirLand = putOnBattlefield(s0, opp, forestCard());
    const s = settle(castNow(s0, ap, ids[0]!));
    expect(zone(s, ids[0]!)).toBe("hand");
    const s2 = setup([naturalEmergence()]);
    const red = putOnBattlefield(s2.s, s2.ap, card("Red Ench", "Enchantment", "{R}", { cmc: 1, colors: ["R"] }));
    const land = s2.s.battlefield.find((id) => s2.s.objects[id]!.controller === s2.ap && nameOf(s2.s, id) === "Forest")!;
    let t = settle(castNow(s2.s, s2.ap, s2.ids[0]!), at("chooseTargets", s2.ap));
    t = settle(t);
    expect([zone(t, s2.ids[0]!) === "battlefield" || zone(t, red) === "battlefield", zone(t, s2.ids[0]!) === "hand" || zone(t, red) === "hand"]).toEqual([true, true]);
    if (zone(t, s2.ids[0]!) === "battlefield") {
      const c = characteristics(t, t.objects[land]!);
      expect([c.types, `${c.power}/${c.toughness}`, c.keywords]).toEqual([["Land", "Creature"], "2/2", ["First strike"]]);
    }
    expect(characteristics(s, s.objects[theirLand]!).types).toEqual(["Land"]);
  });
});

describe("Yawgmoth's Agenda", () => {
  it("lets you play lands and cast spells from your graveyard, one spell a turn, and exiles what would go to your graveyard", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, yawgmothsAgenda());
    const o = toZone(s0, ap, opt(), "graveyard");
    const o2 = toZone(s0, ap, opt(), "graveyard");
    const land = toZone(s0, ap, forestCard(), "graveyard");
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, o, undefined, undefined, undefined, undefined, { via: "permission" })));
    expect(zone(s, o)).toBe("exile");
    expect(planCast(s, ap, o2, undefined, undefined, undefined, undefined, { via: "permission" })).toBeNull();
    s = act(s, { type: "playLand", player: ap, objectId: land });
    expect(zone(s, land)).toBe("battlefield");
  });
});

describe("Venerated Teacher", () => {
  it("puts two level counters on each creature you control with level up", () => {
    const { s: s0, ap, ids, opp } = setup([veneratedTeacher()]);
    const lv = putOnBattlefield(s0, ap, beastbreaker());
    const theirs = putOnBattlefield(s0, opp, beastbreaker());
    const plain = putOnBattlefield(s0, ap, vanilla("Plain Bear", "Creature — Bear", "{1}{G}", 2, 2, 2));
    const s = settle(castNow(s0, ap, ids[0]!));
    expect([counters(s, lv, "level"), pt(s, lv), counters(s, theirs, "level"), counters(s, plain, "level")]).toEqual([2, "4/4", 0, 0]);
  });
});

describe("Battering Ram", () => {
  const blockedBy = (wall: boolean) => {
    const { s: s0, ap, opp } = setup([]);
    const ram = putOnBattlefield(s0, ap, batteringRam());
    const blocker = putOnBattlefield(s0, opp, wall ? vanilla("Test Wall", "Creature — Wall", "{1}", 1, 0, 8, { keywords: ["Defender"], oracleText: "Defender" }) : vanilla("Test Bear", "Creature — Bear", "{1}{G}", 2, 0, 8));
    let s = attackWith(s0, [ram], opp);
    s = toBlocks(s);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker: ram }] });
    s = settle(s);
    expect(zone(s, blocker)).toBe("battlefield");
    s = goUntil(s, (x) => x.step === "main2");
    return zone(s, blocker);
  };
  it("destroys a Wall that blocks it at end of combat", () => expect(blockedBy(true)).toBe("graveyard"));
  it("leaves another blocker alone", () => expect(blockedBy(false)).toBe("battlefield"));
});

describe("Maraxus of Keld", () => {
  it("counts untapped artifacts, creatures and lands you control, each once", () => {
    const { s, ap, opp } = setup([]);
    const m = putOnBattlefield(s, ap, maraxusOfKeld());
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap && nameOf(s, id) !== "Maraxus of Keld");
    putOnBattlefield(s, ap, vanilla("Artifact Creature", "Artifact Creature — Golem", "{2}", 2, 2, 2));
    putOnBattlefield(s, opp, vanilla("Their Bear", "Creature — Bear", "{1}{G}", 2, 2, 2));
    invalidateCharacteristics(s);
    expect(pt(s, m)).toBe(`${lands.length + 2}/${lands.length + 2}`);
    s.objects[lands[0]!]!.tapped = true;
    s.objects[m]!.tapped = true;
    invalidateCharacteristics(s);
    expect(pt(s, m)).toBe(`${lands.length}/${lands.length}`);
  });
});

describe("Tobias, Doomed Conqueror", () => {
  it("creates a Zombie for each nontoken creature you controlled that died this turn, Tobias included", () => {
    const { s: s0, ap, ids, opp } = setup([card("Test Wrath", "Sorcery", "{2}{W}{W}", { cmc: 4, colors: ["W"], oracleText: "Destroy all creatures." })]);
    putOnBattlefield(s0, ap, tobias());
    putOnBattlefield(s0, ap, vanilla("Mine", "Creature — Bear", "{1}{G}", 2, 2, 2));
    putOnBattlefield(s0, opp, vanilla("Theirs", "Creature — Bear", "{1}{G}", 2, 2, 2));
    const tok = putOnBattlefield(s0, ap, vanilla("Token Bear", "Creature — Bear", "", 0, 2, 2));
    s0.objects[tok]!.isToken = true;
    const s = settle(castNow(s0, ap, ids[0]!));
    const zombies = s.battlefield.filter((id) => nameOf(s, id) === "Zombie Token" && controllerOf(s, s.objects[id]!) === ap);
    expect(zombies.length).toBe(2);
  });
});

describe("MACH-1, Swooping Scoundrel", () => {
  it("surveils as it enters and whenever you gain life, only once each turn", () => {
    const { s: s0, ap, ids } = setup([mACH1(), card("Test Heal", "Instant", "{W}", { cmc: 1, colors: ["W"], oracleText: "You gain 3 life." })]);
    let s = settle(castNow(s0, ap, ids[0]!), at("arrangeTop", ap));
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "surveil" });
    s = settle(act(s, { type: "arrangeTop", player: ap, top: (s.pending as { cards: string[] }).cards, away: [] }));
    s = settle(castNow(s, ap, ids[1]!), at("arrangeTop", ap));
    expect(s.pending ?? null).toBeNull();
    // Next turn it can trigger again.
    s = goUntil(s, (x) => x.activePlayer !== ap && x.step === "main1" && !x.pending && !x.stack.length);
    gainLife(s, ap, 1);
    s = settle(s, at("arrangeTop", ap));
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap, how: "surveil" });
  });
});

describe("Chainflail Centipede", () => {
  it("gives +2/+0 to whichever attacked: itself, or the creature it's attached to", () => {
    const { s: s0, ap, opp } = setup([]);
    const centi = putOnBattlefield(s0, ap, chainflailCentipede());
    let s = attackWith(s0, [centi], opp);
    s = settle(s);
    expect(pt(s, centi)).toBe("4/2");
    const t = setup([]);
    const c2 = putOnBattlefield(t.s, t.ap, chainflailCentipede());
    const bear = putOnBattlefield(t.s, t.ap, vanilla("Bear", "Creature — Bear", "{1}{G}", 2, 2, 2));
    let u = settle(run(t.s, planActivate(t.s, t.ap, c2, 0, [tgt(bear)])));
    expect(t.s.objects[c2] && u.objects[c2]!.attachedTo).toBe(bear);
    u = settle(attackWith(u, [bear], t.opp));
    expect([pt(u, bear), pt(u, c2)]).toEqual(["4/2", "2/2"]);
  });
});

describe("Swampbenders", () => {
  it("makes lands you control Swamps and counts every Swamp on the battlefield", () => {
    const { s, ap, opp } = setup([]);
    const sb = putOnBattlefield(s, ap, swampbenders());
    const theirs = putOnBattlefield(s, opp, forestCard());
    const swamp2 = putOnBattlefield(s, opp, card("Swamp", "Basic Land — Swamp", "", { cmc: 0 }));
    invalidateCharacteristics(s);
    const mine = s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === ap && characteristics(s, s.objects[id]!).types.includes("Land"));
    expect(mine.every((id) => characteristics(s, s.objects[id]!).subtypes.includes("Swamp"))).toBe(true);
    expect(characteristics(s, s.objects[theirs]!).subtypes).toEqual(["Forest"]);
    expect(pt(s, sb)).toBe(`${mine.length + 1}/${mine.length + 1}`);
    expect(zone(s, swamp2)).toBe("battlefield");
  });
});

describe("Ghostflame Sliver", () => {
  it("makes every Sliver colorless, anyone's, and nothing else", () => {
    const { s, ap, opp } = setup([]);
    const g = putOnBattlefield(s, ap, ghostflameSliver());
    const theirs = putOnBattlefield(s, opp, vanilla("Red Sliver", "Creature — Sliver", "{R}", 1, 1, 1, { colors: ["R"] }));
    const bear = putOnBattlefield(s, opp, vanilla("Green Bear", "Creature — Bear", "{1}{G}", 2, 2, 2, { colors: ["G"] }));
    invalidateCharacteristics(s);
    expect([g, theirs, bear].map((id) => characteristics(s, s.objects[id]!).colors)).toEqual([[], [], ["G"]]);
  });
});

describe("Flames of the Raze-Boar", () => {
  it("deals 2 damage to each other creature the target's controller controls only if you control a creature with power 4 or greater", () => {
    const run2 = (big: boolean) => {
      const { s: s0, ap, ids, opp } = setup([flamesOfTheRazeBoar()]);
      const victim = putOnBattlefield(s0, opp, vanilla("Victim", "Creature — Bear", "{1}{G}", 2, 2, 6));
      const other = putOnBattlefield(s0, opp, vanilla("Other", "Creature — Bear", "{1}{G}", 2, 2, 6));
      const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
      const bystander = putOnBattlefield(s0, third, vanilla("Bystander", "Creature — Bear", "{1}{G}", 2, 2, 6));
      putOnBattlefield(s0, ap, vanilla("Mine", "Creature — Beast", "{3}{G}", 4, big ? 4 : 3, 4));
      const s = settle(castNow(s0, ap, ids[0]!, [tgt(victim)]));
      return [victim, other, bystander].map((id) => s.objects[id]!.damage);
    };
    expect(run2(true)).toEqual([4, 2, 0]);
    expect(run2(false)).toEqual([4, 0, 0]);
  });
});

describe("Treacherous Greed", () => {
  it("needs a creature that dealt damage this turn to sacrifice", () => {
    const { s: s0, ap, ids, opp } = setup([treacherousGreed()]);
    const idle = putOnBattlefield(s0, ap, vanilla("Idle", "Creature — Bear", "{1}{G}", 2, 2, 2));
    expect(planCast(s0, ap, ids[0]!, [], undefined, undefined, undefined, { sacrifice: [idle] })).toBeNull();
    const dealer = putOnBattlefield(s0, ap, vanilla("Dealer", "Creature — Bear", "{1}{G}", 2, 2, 2));
    dealDamage(s0, objectSource(s0, s0.objects[dealer]!), { player: opp }, 2);
    const before = life(s0, opp);
    const s = settle(castNow(s0, ap, ids[0]!, [], { sacrifice: [dealer] }));
    expect([zone(s, dealer), zone(s, idle), life(s, opp)]).toEqual(["graveyard", "battlefield", before - 3]);
  });
});
