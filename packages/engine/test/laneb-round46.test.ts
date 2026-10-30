// Lane B, round 46: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, scry, setup } from "./helpers";
import { abilitiesOf, botActions, characteristics, controllerOf, dealDamage, invalidateCharacteristics, isFullySupported, legalTargets, nameOf, objectSource, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const wight = () => card("Wight", "Creature — Zombie Soldier", "{1}{B}", { cmc: 2, colors: ["B"], power: "3", toughness: "2", oracleText: "This creature enters tapped.\nLife Drain — Whenever a creature dealt damage by this creature this turn dies, create a tapped 2/2 black Zombie creature token and exile that card." });
const unscythe = () => card("Unscythe, Killer of Kings", "Legendary Artifact — Equipment", "{U}{B}{B}{R}", { cmc: 4, colors: ["B", "R", "U"], keywords: ["Equip"], supertypes: ["Legendary"], oracleText: "Equipped creature gets +3/+3 and has first strike.\nWhenever a creature dealt damage by equipped creature this turn dies, you may exile that card. If you do, create a 2/2 black Zombie creature token.\nEquip {2}" });
const hawkeye = () => card("Hawkeye, Avenging Archer", "Legendary Creature — Human Archer Hero", "{2}{U}{R}", { cmc: 4, colors: ["R", "U"], power: "3", toughness: "4", keywords: ["Reach"], supertypes: ["Legendary"], oracleText: "Reach\nWhenever a creature an opponent controls dies, if Hawkeye dealt damage to it this turn, draw a card.\n{T}: Hawkeye deals 1 damage to any target." });
const gracefulReprieve = () => card("Graceful Reprieve", "Instant", "{1}{W}", { cmc: 2, colors: ["W"], oracleText: "When target creature dies this turn, return that card to the battlefield under its owner's control." });
const cytoplastRootKin = () => card("Cytoplast Root-Kin", "Creature — Elemental Mutant", "{2}{G}{G}", { cmc: 4, colors: ["G"], power: "0", toughness: "0", keywords: ["Graft"], oracleText: "Graft 4 (This creature enters with four +1/+1 counters on it. Whenever another creature enters, you may move a +1/+1 counter from this creature onto it.)\nWhen this creature enters, put a +1/+1 counter on each other creature you control with a +1/+1 counter on it.\n{2}: Move a +1/+1 counter from target creature you control onto this creature." });
const silentGravestone = () => card("Silent Gravestone", "Artifact", "{1}", { cmc: 1, oracleText: "Cards in graveyards can't be the targets of spells or abilities.\n{4}, {T}: Exile this artifact and all cards from all graveyards. Draw a card." });
const giltLeafWinnower = () => card("Gilt-Leaf Winnower", "Creature — Elf Warrior", "{3}{B}{B}", { cmc: 5, colors: ["B"], power: "4", toughness: "3", keywords: ["Menace"], oracleText: "Menace (This creature can't be blocked except by two or more creatures.)\nWhen this creature enters, you may destroy target non-Elf creature whose power and toughness aren't equal." });
const soulTithe = () => card("Soul Tithe", "Enchantment — Aura", "{1}{W}", { cmc: 2, colors: ["W"], keywords: ["Enchant"], oracleText: "Enchant nonland permanent\nAt the beginning of the upkeep of enchanted permanent's controller, that player sacrifices it unless they pay {X}, where X is its mana value." });
const spinedSliver = () => card("Spined Sliver", "Creature — Sliver", "{R}{G}", { cmc: 2, colors: ["G", "R"], power: "2", toughness: "2", oracleText: "Whenever a Sliver becomes blocked, that Sliver gets +1/+1 until end of turn for each creature blocking it." });
const strongholdArena = () => card("Stronghold Arena", "Enchantment", "{1}{B}", { cmc: 2, colors: ["B"], keywords: ["Kicker"], oracleText: "Kicker {G} and/or {W} (You may pay an additional {G} and/or {W} as you cast this spell.)\nWhen this enchantment enters, you gain 3 life for each time it was kicked.\nWhenever one or more creatures you control deal combat damage to a player, you may reveal the top card of your library and put it into your hand. If you do, you lose life equal to its mana value." });
const odric = () => card("Odric, Blood-Cursed", "Legendary Creature — Vampire Soldier", "{1}{R}{W}", { cmc: 3, colors: ["R", "W"], power: "3", toughness: "3", keywords: ["Deathtouch", "Lifelink", "Reach", "Indestructible", "Hexproof", "First strike", "Haste", "Trample", "Menace", "Double strike"], supertypes: ["Legendary"], oracleText: "When Odric enters, create X Blood tokens, where X is the number of abilities from among flying, first strike, double strike, deathtouch, haste, hexproof, indestructible, lifelink, menace, reach, trample, and vigilance found among creatures you control. (Count each ability only once.)" });
const sarkhanTheMad = () => card("Sarkhan the Mad", "Legendary Planeswalker — Sarkhan", "{3}{B}{R}", { cmc: 5, colors: ["B", "R"], loyalty: "7", supertypes: ["Legendary"], oracleText: "0: Reveal the top card of your library and put it into your hand. Sarkhan deals damage to himself equal to that card's mana value.\n−2: Target creature's controller sacrifices it, then that player creates a 5/5 red Dragon creature token with flying.\n−4: Each Dragon creature you control deals damage equal to its power to target player or planeswalker." });
const portalOfSanctuary = () => card("Portal of Sanctuary", "Artifact", "{2}{U}", { cmc: 3, colors: ["U"], oracleText: "{1}, {T}: Return target creature you control and each Aura attached to it to their owners' hands. Activate only during your turn." });
const auxiliaryBoosters = () => card("Auxiliary Boosters", "Artifact — Equipment", "{4}{W}", { cmc: 5, colors: ["W"], keywords: ["Equip"], oracleText: "When this Equipment enters, create a 2/2 colorless Robot artifact creature token and attach this Equipment to it.\nEquipped creature gets +1/+2 and has flying.\nEquip {3} ({3}: Attach to target creature you control. Equip only as a sorcery.)" });
const kavLandseeker = () => card("Kav Landseeker", "Creature — Kavu Soldier", "{3}{R}", { cmc: 4, colors: ["R"], power: "4", toughness: "3", keywords: ["Menace"], oracleText: "Menace (This creature can't be blocked except by two or more creatures.)\nWhen this creature enters, create a Lander token. At the beginning of the end step on your next turn, sacrifice that token. (It's an artifact with \"{2}, {T}, Sacrifice this token: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.\")" });
const wKabi = () => card("W'Kabi, Shield of the Nation", "Legendary Creature — Human Warrior Hero", "{1}{G}", { cmc: 2, colors: ["G"], power: "2", toughness: "3", keywords: ["Vigilance"], supertypes: ["Legendary"], oracleText: "Vigilance\nWhenever you attack with your commander, if you control an artifact with mana value 4 or greater, create a 4/4 green Rhino creature token with trample." });
const devotedCaretaker = () => card("Devoted Caretaker", "Creature — Human Cleric", "{W}", { cmc: 1, colors: ["W"], power: "1", toughness: "2", oracleText: "{W}, {T}: Target permanent you control gains protection from instant spells and from sorcery spells until end of turn." });
const stensiaUprising = () => card("Stensia Uprising", "Enchantment", "{2}{R}{R}", { cmc: 4, colors: ["R"], oracleText: "At the beginning of your end step, create a 1/1 red Human creature token. Then if you control exactly thirteen permanents, you may sacrifice this enchantment. When you do, it deals 7 damage to any target." });
const teo = () => card("Teo, Spirited Glider", "Legendary Creature — Human Pilot Ally", "{3}{U}", { cmc: 4, colors: ["U"], power: "1", toughness: "4", keywords: ["Flying"], supertypes: ["Legendary"], oracleText: "Flying\nWhenever one or more creatures you control with flying attack, draw a card, then discard a card. When you discard a nonland card this way, put a +1/+1 counter on target creature you control." });
const vulture = () => card("Vulture, Feathered Fiend", "Legendary Creature — Human Artificer Villain", "{2}{U}{U}", { cmc: 4, colors: ["U"], power: "2", toughness: "4", keywords: ["Flying"], supertypes: ["Legendary"], oracleText: "Flying\nWhenever one or more creatures you control with flying deal combat damage to a player, put a +1/+1 counter on each of those creatures and draw a card." });
const meekAttack = () => card("Meek Attack", "Enchantment", "{2}{R}", { cmc: 3, colors: ["R"], oracleText: "{1}{R}: You may put a creature card with total power and toughness 5 or less from your hand onto the battlefield. That creature gains haste. At the beginning of the next end step, sacrifice that creature." });
const starkeOfRath = () => card("Starke of Rath", "Legendary Creature — Human Rogue", "{1}{R}{R}", { cmc: 3, colors: ["R"], power: "2", toughness: "2", supertypes: ["Legendary"], oracleText: "{T}: Destroy target artifact or creature. That permanent's controller gains control of Starke. (This effect lasts indefinitely.)" });
const deepwayNavigator = () => card("Deepway Navigator", "Creature — Merfolk Wizard", "{W}{U}", { cmc: 2, colors: ["U", "W"], power: "2", toughness: "2", keywords: ["Flash"], oracleText: "Flash\nWhen this creature enters, untap each other Merfolk you control.\nAs long as you attacked with three or more Merfolk this turn, Merfolk you control get +1/+0." });
const scytheOfTheWretched = () => card("Scythe of the Wretched", "Artifact — Equipment", "{2}", { cmc: 2, keywords: ["Equip"], oracleText: "Equipped creature gets +2/+2.\nWhenever a creature dealt damage by equipped creature this turn dies, return that card to the battlefield under your control. Attach this Equipment to that creature.\nEquip {4}" });
const heroesInAHalfShell = () => card("Heroes in a Half Shell", "Legendary Creature — Mutant Ninja Turtle", "{W}{U}{B}{R}{G}", { cmc: 5, colors: ["B", "G", "R", "U", "W"], power: "5", toughness: "5", keywords: ["Vigilance", "Haste", "Trample", "Menace"], supertypes: ["Legendary"], oracleText: "Vigilance, menace, trample, haste\nWhenever one or more Mutants, Ninjas, and/or Turtles you control deal combat damage to a player, put a +1/+1 counter on each of those creatures and draw a card." });
const berserkMurlodont = () => card("Berserk Murlodont", "Creature — Beast", "{4}{G}", { cmc: 5, colors: ["G"], power: "3", toughness: "3", oracleText: "Whenever a Beast becomes blocked, it gets +1/+1 until end of turn for each creature blocking it." });
const arcboundFiend = () => card("Arcbound Fiend", "Artifact Creature — Horror", "{6}", { cmc: 6, power: "0", toughness: "0", keywords: ["Modular", "Fear"], oracleText: "Fear (This creature can't be blocked except by artifact creatures and/or black creatures.)\nAt the beginning of your upkeep, you may move a +1/+1 counter from target creature onto this creature.\nModular 3 (This creature enters with three +1/+1 counters on it. When it dies, you may put its +1/+1 counters on target artifact creature.)" });
const consecrateConsume = () =>
  scry("split", [
    { name: "Consecrate", mana_cost: "{1}{W/B}", type_line: "Instant", oracle_text: "Exile target card from a graveyard.\nDraw a card." },
    { name: "Consume", mana_cost: "{2}{W}{B}", type_line: "Sorcery", oracle_text: "Target player sacrifices a creature with the greatest power among creatures they control. You gain life equal to its power." },
  ]);
// The card data lists keywords Angelic Skirmisher's text only names.
const angelicSkirmisher = () => card("Angelic Skirmisher", "Creature — Angel", "{4}{W}{W}", { cmc: 6, colors: ["W"], power: "4", toughness: "4", keywords: ["Flying", "Vigilance"], oracleText: "Flying\nAt the beginning of each combat, choose first strike, vigilance, or lifelink. Creatures you control gain that ability until end of turn." });

// Test cards.
const vanilla = (name: string, typeLine: string, cost: string, cmc: number, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, cost, { cmc, power: String(p), toughness: String(t), ...extra });
const kill = () => card("Test Kill", "Instant", "{1}", { cmc: 1, oracleText: "Destroy target creature." });
const opt = () => card("Test Opt", "Instant", "{U}", { cmc: 1, colors: ["U"], oracleText: "Draw a card." });
const growth = () => card("Test Growth", "Instant", "{G}", { cmc: 1, colors: ["G"], oracleText: "Target creature gets +3/+3 until end of turn." });
const rock = (cmc: number) => card(`Test Rock ${cmc}`, "Artifact", `{${cmc}}`, { cmc });
const flyer = (name = "Test Bird", p = 1, t = 1) => vanilla(name, "Creature — Bird", "{1}{U}", 2, p, t, { keywords: ["Flying"], oracleText: "Flying" });
const bearC = (name = "Plain Bear", p = 2, t = 2) => vanilla(name, "Creature — Bear", "{1}{G}", 2, p, t);
const merfolk = (name: string) => vanilla(name, "Creature — Merfolk", "{U}", 1, 1, 1);

const handSize = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.length;
const tokens = (s: GameState, pid: PlayerId, subtype: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).subtypes.includes(subtype));
const onField = (s: GameState, name: string) => s.battlefield.filter((id) => nameOf(s, id) === name);
const keywords = (s: GameState, id: string) => characteristics(s, s.objects[id]!).keywords;
const ability = (s: GameState, id: string, re: RegExp) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => re.test(a.text ?? ""));
const answerMay = (s: GameState, pid: PlayerId, yes: boolean) => act(s, { type: "chooseMay", player: pid, yes });

describe("Lane B round 46 cards", () => {
  it("are fully supported", () => {
    supported(wight(), unscythe(), hawkeye(), gracefulReprieve(), cytoplastRootKin(), silentGravestone(), giltLeafWinnower(), soulTithe(), spinedSliver(), strongholdArena(), odric(), sarkhanTheMad(), portalOfSanctuary(), auxiliaryBoosters(), kavLandseeker(), wKabi(), devotedCaretaker(), stensiaUprising(), teo(), vulture(), meekAttack(), starkeOfRath(), deepwayNavigator(), scytheOfTheWretched(), heroesInAHalfShell(), berserkMurlodont(), arcboundFiend(), consecrateConsume());
  });
});

describe("Wight", () => {
  it("makes a tapped Zombie and exiles a creature it dealt damage to this turn when that creature dies", () => {
    const { s: s0, ap, ids, opp } = setup([kill(), kill()]);
    const w = putOnBattlefield(s0, ap, wight());
    const hurt = putOnBattlefield(s0, opp, bearC("Hurt", 2, 4));
    const other = putOnBattlefield(s0, opp, bearC("Other"));
    dealDamage(s0, objectSource(s0, s0.objects[w]!), { object: s0.objects[hurt]! }, 1);
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(other)]));
    expect([zone(s, other), tokens(s, ap, "Zombie").length]).toEqual(["graveyard", 0]);
    s = settle(castNow(s, ap, ids[1]!, [tgt(hurt)]));
    const z = tokens(s, ap, "Zombie");
    expect([zone(s, hurt), z.length, s.objects[z[0]!]!.tapped, pt(s, z[0]!)]).toEqual(["exile", 1, true, "2/2"]);
  });
});

describe("Unscythe, Killer of Kings", () => {
  it("may exile a creature the equipped creature dealt damage to this turn and make a Zombie", () => {
    const { s: s0, ap, ids, opp } = setup([kill(), kill()]);
    const eq = putOnBattlefield(s0, ap, unscythe());
    const holder = putOnBattlefield(s0, ap, bearC("Holder"));
    s0.objects[eq]!.attachedTo = holder;
    invalidateCharacteristics(s0);
    expect([pt(s0, holder), keywords(s0, holder)]).toEqual(["5/5", ["First strike"]]);
    const a = putOnBattlefield(s0, opp, bearC("Victim A", 2, 4));
    const b = putOnBattlefield(s0, opp, bearC("Victim B", 2, 4));
    dealDamage(s0, objectSource(s0, s0.objects[holder]!), { object: s0.objects[a]! }, 1);
    dealDamage(s0, objectSource(s0, s0.objects[holder]!), { object: s0.objects[b]! }, 1);
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(a)]), at("chooseMay", ap));
    s = settle(answerMay(s, ap, true));
    expect([zone(s, a), tokens(s, ap, "Zombie").length]).toEqual(["exile", 1]);
    // Unequipped, the creature that dealt damage to B isn't the equipped creature any more.
    s.objects[eq]!.attachedTo = undefined;
    invalidateCharacteristics(s);
    s = settle(castNow(s, ap, ids[1]!, [tgt(b)]), at("chooseMay", ap));
    expect([s.pending ?? null, zone(s, b), tokens(s, ap, "Zombie").length]).toEqual([null, "graveyard", 1]);
  });
});

describe("Hawkeye, Avenging Archer", () => {
  it("draws a card when a creature an opponent controls that Hawkeye dealt damage to this turn dies", () => {
    const { s: s0, ap, ids, opp } = setup([kill()]);
    const hawk = putOnBattlefield(s0, ap, hawkeye());
    const small = putOnBattlefield(s0, opp, bearC("Small", 1, 1));
    const other = putOnBattlefield(s0, opp, bearC("Other"));
    const n = handSize(s0, ap);
    let s = settle(run(s0, planActivate(s0, ap, hawk, ability(s0, hawk, /deals 1 damage/), [tgt(small)])));
    expect([zone(s, small), handSize(s, ap)]).toEqual(["graveyard", n + 1]);
    s = settle(castNow(s, ap, ids[0]!, [tgt(other)]));
    expect([zone(s, other), handSize(s, ap)]).toEqual(["graveyard", n]);
  });
});

describe("Graceful Reprieve", () => {
  it("returns the creature to the battlefield under its owner's control when it dies this turn", () => {
    const { s: s0, ap, ids, opp } = setup([gracefulReprieve(), kill()]);
    putOnBattlefield(s0, opp, bearC("Their Bear"));
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(onField(s0, "Their Bear")[0]!)]));
    s = settle(castNow(s, ap, ids[1]!, [tgt(onField(s, "Their Bear")[0]!)]));
    const back = onField(s, "Their Bear");
    expect(back.length).toBe(1);
    expect(controllerOf(s, s.objects[back[0]!]!)).toBe(opp);
  });
  it("doesn't return it when it dies on a later turn", () => {
    const { s: s0, ap, ids } = setup([gracefulReprieve()]);
    const mine = putOnBattlefield(s0, ap, bearC("My Bear"));
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(mine)]));
    s = goUntil(s, (x) => x.activePlayer !== ap && x.step === "main1" && waitingOn(x) === ap && !x.pending);
    s.players[ap]!.manaPool.C = 1;
    const k = toZone(s, ap, kill(), "hand");
    s = settle(run(s, planCast(s, ap, k, [tgt(mine)])));
    expect([zone(s, mine), onField(s, "My Bear").length]).toEqual(["graveyard", 0]);
  });
});

describe("Cytoplast Root-Kin", () => {
  it("puts a counter on each other creature with one and moves counters onto itself", () => {
    const { s: s0, ap, ids } = setup([cytoplastRootKin()]);
    const grown = putOnBattlefield(s0, ap, bearC("Grown"));
    s0.objects[grown]!.counters["+1/+1"] = 1;
    const plain = putOnBattlefield(s0, ap, bearC("Plain"));
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseMay", ap));
    expect([counters(s, ids[0]!), counters(s, grown), counters(s, plain)]).toEqual([4, 2, 0]);
    s = settle(run(s, planActivate(s, ap, ids[0]!, ability(s, ids[0]!, /^\{2\}: Move/), [tgt(grown)])));
    expect([counters(s, ids[0]!), counters(s, grown), pt(s, ids[0]!)]).toEqual([5, 1, "5/5"]);
  });
});

describe("Silent Gravestone", () => {
  it("exiles itself and every graveyard card, then draws", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, silentGravestone());
    const theirs = toZone(s0, opp, bearC("Dead Bear"), "graveyard");
    const mine = toZone(s0, ap, bearC("My Dead Bear"), "graveyard");
    const n = handSize(s0, ap);
    const s = settle(run(s0, planActivate(s0, ap, g, 0)));
    expect([zone(s, g), zone(s, theirs), zone(s, mine), handSize(s, ap)]).toEqual(["exile", "exile", "exile", n + 1]);
  });
});

describe("Gilt-Leaf Winnower", () => {
  it("may destroy a non-Elf creature whose power and toughness aren't equal", () => {
    const { s: s0, ap, ids, opp } = setup([giltLeafWinnower()]);
    const uneven = putOnBattlefield(s0, opp, bearC("Uneven", 2, 3));
    const even = putOnBattlefield(s0, opp, bearC("Even", 2, 2));
    const elf = putOnBattlefield(s0, opp, vanilla("Test Elf", "Creature — Elf", "{G}", 1, 1, 2));
    let s = settle(castNow(s0, ap, ids[0]!), (x) => x.pending?.kind === "chooseTargets");
    expect(s.pending?.kind).toBe("chooseTargets");
    const options = legalTargets(s, (s.pending as { specs: Parameters<typeof legalTargets>[1][] }).specs[0]!, ap).map((t) => t.id);
    expect(options).toContain(uneven);
    expect(options).not.toContain(even);
    expect(options).not.toContain(elf);
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(uneven)] });
    s = settle(s, at("chooseMay", ap));
    if (s.pending?.kind === "chooseMay") s = settle(answerMay(s, ap, true));
    expect(zone(s, uneven)).toBe("graveyard");
  });
});

describe("Soul Tithe", () => {
  it("makes the enchanted permanent's controller pay its mana value at their upkeep or sacrifice it", () => {
    const { s: s0, ap, opp } = setup([]);
    const art = putOnBattlefield(s0, opp, rock(3));
    const aura = putOnBattlefield(s0, ap, soulTithe());
    s0.objects[aura]!.attachedTo = art;
    invalidateCharacteristics(s0);
    // The opponent has no lands, so can't pay.
    let s = goUntil(s0, (x) => x.activePlayer === opp && x.step === "upkeep" && !x.stack.length && !x.triggerQueue.length && !x.pending && zone(x, art) !== "battlefield" || (x.activePlayer === opp && x.step === "draw"));
    expect([zone(s, art), zone(s, aura)]).toEqual(["graveyard", "graveyard"]);
  });
  it("lets them pay to keep it", () => {
    const { s: s0, ap, opp } = setup([]);
    const art = putOnBattlefield(s0, opp, rock(2));
    const aura = putOnBattlefield(s0, ap, soulTithe());
    s0.objects[aura]!.attachedTo = art;
    invalidateCharacteristics(s0);
    const s = goUntil(s0, (x) => x.pending?.kind === "payUnless" && x.pending.player === opp);
    expect(s.pending).toMatchObject({ kind: "payUnless", cost: "{2}" });
    s.players[opp]!.manaPool.C = 2;
    const paid = settle(act(structuredClone(s), { type: "payUnless", player: opp, pay: true }));
    const declined = settle(act(structuredClone(s), { type: "payUnless", player: opp, pay: false }));
    expect([zone(paid, art), zone(declined, art)]).toEqual(["battlefield", "graveyard"]);
  });
});

describe("Spined Sliver and Berserk Murlodont", () => {
  it("give a blocked Sliver or Beast +1/+1 for each creature blocking it", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, spinedSliver());
    putOnBattlefield(s0, ap, berserkMurlodont());
    const sliver = putOnBattlefield(s0, ap, vanilla("Test Sliver", "Creature — Sliver", "{1}", 1, 1, 1));
    const beast = putOnBattlefield(s0, ap, vanilla("Test Beast", "Creature — Beast", "{1}", 1, 1, 1));
    const bear = putOnBattlefield(s0, ap, bearC("Test Bear", 1, 1));
    const bl = [0, 1, 2, 3, 4].map((i) => putOnBattlefield(s0, opp, bearC(`Blocker ${i}`, 0, 5)));
    let s = attackWith(s0, [sliver, beast, bear], opp);
    s = toBlocks(s);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: bl[0]!, attacker: sliver }, { blocker: bl[1]!, attacker: sliver }, { blocker: bl[2]!, attacker: beast }, { blocker: bl[3]!, attacker: bear }, { blocker: bl[4]!, attacker: bear }] });
    s = settle(s);
    expect([pt(s, sliver), pt(s, beast), pt(s, bear)]).toEqual(["3/3", "2/2", "1/1"]);
  });
});

describe("Stronghold Arena", () => {
  it("may put the top card into your hand when your creatures deal combat damage to a player, losing life equal to its mana value", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, strongholdArena());
    const a = putOnBattlefield(s0, ap, bearC("Attacker A"));
    const b = putOnBattlefield(s0, ap, bearC("Attacker B"));
    const top = toZone(s0, ap, rock(3), "library");
    const before = life(s0, ap);
    let s = attackWith(s0, [a, b], opp);
    s = goUntil(s, at("chooseMay", ap));
    s = settle(answerMay(s, ap, true));
    expect([zone(s, top), life(s, ap), life(s, opp), s.pending ?? null]).toEqual(["hand", before - 3, 40 - 4, null]);
  });
});

describe("Odric, Blood-Cursed", () => {
  it("makes a Blood token for each keyword among flying, ... and vigilance your creatures have, each counted once", () => {
    const { s: s0, ap, ids } = setup([odric()]);
    putOnBattlefield(s0, ap, vanilla("Sky Guard", "Creature — Bird", "{1}{W}", 2, 1, 1, { keywords: ["Flying", "Vigilance"], oracleText: "Flying, vigilance" }));
    putOnBattlefield(s0, ap, flyer());
    putOnBattlefield(s0, ap, vanilla("Test Snake", "Creature — Snake", "{G}", 1, 1, 1, { keywords: ["Deathtouch"], oracleText: "Deathtouch" }));
    const s = settle(castNow(s0, ap, ids[0]!));
    expect(keywords(s, ids[0]!)).toEqual([]);
    expect(tokens(s, ap, "Blood").length).toBe(3);
  });
  it("Angelic Skirmisher doesn't have the abilities its text only names", () => {
    const { s, ap } = setup([]);
    const angel = putOnBattlefield(s, ap, angelicSkirmisher());
    expect(keywords(s, angel)).toEqual(["Flying"]);
  });
});

describe("Sarkhan the Mad", () => {
  const walker = (s: GameState, ap: PlayerId) => {
    const id = putOnBattlefield(s, ap, sarkhanTheMad());
    s.objects[id]!.counters.loyalty = 7;
    return id;
  };
  it("0: puts the top card into your hand and deals damage to himself equal to its mana value", () => {
    const { s: s0, ap } = setup([]);
    const sk = walker(s0, ap);
    const top = toZone(s0, ap, rock(3), "library");
    const s = settle(run(s0, planActivate(s0, ap, sk, 0)));
    expect([zone(s, top), s.objects[sk]!.counters.loyalty]).toEqual(["hand", 4]);
  });
  it("−2: the creature's controller sacrifices it and creates a 5/5 flying Dragon", () => {
    const { s: s0, ap, opp } = setup([]);
    const sk = walker(s0, ap);
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    const s = settle(run(s0, planActivate(s0, ap, sk, 1, [tgt(theirs)])));
    const d = tokens(s, opp, "Dragon");
    expect([zone(s, theirs), d.length, pt(s, d[0]!), keywords(s, d[0]!), tokens(s, ap, "Dragon").length]).toEqual(["graveyard", 1, "5/5", ["Flying"], 0]);
  });
  it("−4: each Dragon creature you control deals damage equal to its power to the player", () => {
    const { s: s0, ap, opp } = setup([]);
    const sk = walker(s0, ap);
    putOnBattlefield(s0, ap, vanilla("Test Dragon", "Creature — Dragon", "{4}{R}", 5, 4, 4));
    putOnBattlefield(s0, ap, vanilla("Big Dragon", "Creature — Dragon", "{5}{R}", 6, 5, 5));
    putOnBattlefield(s0, ap, bearC("Not a Dragon", 3, 3));
    putOnBattlefield(s0, opp, vanilla("Their Dragon", "Creature — Dragon", "{4}{R}", 5, 6, 6));
    const s = settle(run(s0, planActivate(s0, ap, sk, 2, [ply(opp)])));
    expect([life(s, opp), s.objects[sk]!.counters.loyalty]).toEqual([40 - 9, 3]);
  });
});

describe("Portal of Sanctuary", () => {
  it("returns your creature and each Aura on it to their owners' hands, only during your turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const portal = putOnBattlefield(s0, ap, portalOfSanctuary());
    const mine = putOnBattlefield(s0, ap, bearC("Mine"));
    const aura = putOnBattlefield(s0, opp, card("Test Shackle", "Enchantment — Aura", "{W}", { cmc: 1, oracleText: "Enchant creature\nEnchanted creature can't attack." }));
    s0.objects[aura]!.attachedTo = mine;
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planActivate(s0, ap, portal, 0, [tgt(mine)])));
    expect([zone(s, mine), s.players[ap]!.hand.includes(mine), zone(s, aura), s.players[opp]!.hand.includes(aura)]).toEqual(["hand", true, "hand", true]);
  });
});

describe("Auxiliary Boosters", () => {
  it("makes a Robot and attaches itself to it", () => {
    const { s: s0, ap, ids } = setup([auxiliaryBoosters()]);
    const s = settle(castNow(s0, ap, ids[0]!));
    const r = tokens(s, ap, "Robot");
    expect([r.length, s.objects[ids[0]!]!.attachedTo, pt(s, r[0]!), keywords(s, r[0]!)]).toEqual([1, r[0], "3/4", ["Flying"]]);
  });
});

describe("Kav Landseeker", () => {
  it("sacrifices the Lander at the beginning of the end step on your next turn, not this one", () => {
    const { s: s0, ap, ids } = setup([kavLandseeker()]);
    let s = settle(castNow(s0, ap, ids[0]!));
    const lander = tokens(s, ap, "Lander");
    expect(lander.length).toBe(1);
    s = goUntil(s, (x) => x.activePlayer !== ap);
    expect(zone(s, lander[0]!)).toBe("battlefield");
    s = goUntil(s, (x) => x.activePlayer === ap && x.step === "main2");
    expect(zone(s, lander[0]!)).toBe("battlefield");
    s = goUntil(s, (x) => x.activePlayer !== ap);
    expect(s.objects[lander[0]!]?.zone).not.toBe("battlefield");
  });
});

describe("W'Kabi, Shield of the Nation", () => {
  const big = () => card("Test Big Rock", "Artifact", "{4}", { cmc: 4 });
  it("makes a Rhino when you attack with your commander while you control an artifact with mana value 4 or greater", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, wKabi());
    putOnBattlefield(s0, ap, big());
    const cmdr = putOnBattlefield(s0, ap, bearC("My Commander"), { commander: true });
    const s = settle(attackWith(s0, [cmdr], opp));
    const r = tokens(s, ap, "Rhino");
    expect([r.length, pt(s, r[0]!), keywords(s, r[0]!)]).toEqual([1, "4/4", ["Trample"]]);
  });
  it("doesn't trigger for other attackers, or without the artifact", () => {
    const { s: s0, ap, opp } = setup([]);
    const wk = putOnBattlefield(s0, ap, wKabi());
    putOnBattlefield(s0, ap, big());
    const s = settle(attackWith(s0, [wk], opp));
    expect(tokens(s, ap, "Rhino").length).toBe(0);
    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    putOnBattlefield(t0, ap2, wKabi());
    putOnBattlefield(t0, ap2, rock(3));
    const cmdr = putOnBattlefield(t0, ap2, bearC("My Commander"), { commander: true });
    const t = settle(attackWith(t0, [cmdr], opp2));
    expect(tokens(t, ap2, "Rhino").length).toBe(0);
  });
});

describe("Devoted Caretaker", () => {
  it("gives your permanent protection from instants and sorceries", () => {
    const { s: s0, ap, ids } = setup([growth()]);
    const dc = putOnBattlefield(s0, ap, devotedCaretaker());
    const mine = putOnBattlefield(s0, ap, bearC("Mine"));
    expect(planCast(s0, ap, ids[0]!, [tgt(mine)])).not.toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, dc, 0, [tgt(mine)])));
    expect(planCast(s, ap, ids[0]!, [tgt(mine)])).toBeNull();
    expect(planCast(s, ap, ids[0]!, [tgt(dc)])).not.toBeNull();
  });
});

describe("Stensia Uprising", () => {
  const trimLands = (s: GameState, ap: PlayerId, n: number) => {
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.typeLine.includes("Land")).slice(0, n);
    for (const id of lands) {
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      s.objects[id]!.zone = "exile";
      s.players[ap]!.exile.push(id);
    }
    invalidateCharacteristics(s);
  };
  it("with exactly thirteen permanents after the Human, may sacrifice itself to deal 7 damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const su = putOnBattlefield(s0, ap, stensiaUprising());
    // 14 lands, the enchantment and the Human make 16.
    trimLands(s0, ap, 3);
    let s = goUntil(s0, at("chooseMay", ap));
    expect(tokens(s, ap, "Human").length).toBe(1);
    s = settle(answerMay(s, ap, true), (x) => x.pending?.kind === "chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [ply(opp)] }));
    expect([zone(s, su), life(s, opp)]).toEqual(["graveyard", 33]);
  });
  it("doesn't offer it with another number of permanents", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, stensiaUprising());
    trimLands(s0, ap, 2);
    const s = goUntil(s0, (x) => at("chooseMay", ap)(x) || x.activePlayer !== ap);
    expect([s.activePlayer === ap, tokens(s, ap, "Human").length]).toEqual([false, 1]);
  });
});

describe("Teo, Spirited Glider", () => {
  it("loots when creatures with flying attack and puts a counter on a creature when a nonland card is discarded", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, teo());
    const o = toZone(s0, ap, opt(), "hand");
    onlyHand(s0, ap, [o]);
    let s = attackWith(s0, [t], opp);
    s = settle(s, (x) => x.pending?.kind === "discard");
    expect(handSize(s, ap)).toBe(2);
    s = act(s, { type: "discard", player: ap, objectIds: [o] });
    s = settle(s, (x) => x.pending?.kind === "chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(t)] }));
    expect([zone(s, o), counters(s, t)]).toEqual(["graveyard", 1]);
  });
  it("doesn't trigger when only creatures without flying attack", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, teo());
    const b = putOnBattlefield(s0, ap, bearC());
    const n = handSize(s0, ap);
    const s = attackWith(s0, [b], opp);
    expect([s.stack.length, handSize(s, ap)]).toEqual([0, n]);
  });
});

describe("Vulture, Feathered Fiend and Heroes in a Half Shell", () => {
  it("Vulture puts a counter on each flyer that dealt combat damage to a player and draws once", () => {
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, ap, vulture());
    const bird = putOnBattlefield(s0, ap, flyer());
    const bear = putOnBattlefield(s0, ap, bearC());
    const n = handSize(s0, ap);
    let s = attackWith(s0, [v, bird, bear], opp);
    s = goUntil(s, (x) => x.step === "end" || x.step === "main2");
    expect([counters(s, v), counters(s, bird), counters(s, bear), handSize(s, ap)]).toEqual([1, 1, 0, n + 1]);
  });
  it("Heroes in a Half Shell does the same for Mutants, Ninjas and Turtles", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, heroesInAHalfShell());
    const turtle = putOnBattlefield(s0, ap, vanilla("Test Turtle", "Creature — Turtle", "{G}", 1, 1, 1));
    const bear = putOnBattlefield(s0, ap, bearC());
    const n = handSize(s0, ap);
    let s = attackWith(s0, [h, turtle, bear], opp);
    s = goUntil(s, (x) => x.step === "end" || x.step === "main2");
    expect([counters(s, h), counters(s, turtle), counters(s, bear), handSize(s, ap)]).toEqual([1, 1, 0, n + 1]);
  });
});

describe("Meek Attack", () => {
  it("puts a small creature from your hand onto the battlefield with haste and sacrifices it at the next end step", () => {
    const { s: s0, ap } = setup([]);
    const ma = putOnBattlefield(s0, ap, meekAttack());
    const small = toZone(s0, ap, bearC("Small Bear", 2, 3), "hand");
    const big = toZone(s0, ap, bearC("Big Bear", 3, 3), "hand");
    onlyHand(s0, ap, [small, big]);
    let s = run(s0, planActivate(s0, ap, ma, 0));
    s = settle(s, (x) => !!x.pending && x.pending.player === ap);
    const p = s.pending as { kind: string; cards?: string[]; options?: string[] };
    const offered = p.cards ?? p.options ?? [];
    expect(offered).toContain(small);
    expect(offered).not.toContain(big);
    s = settle(s);
    expect([zone(s, small), keywords(s, small)]).toEqual(["battlefield", ["Haste"]]);
    s = goUntil(s, (x) => x.activePlayer !== ap);
    expect([zone(s, small), zone(s, big)]).toEqual(["graveyard", "hand"]);
  });
});

describe("Starke of Rath", () => {
  it("destroys the target and gives Starke to that permanent's controller", () => {
    const { s: s0, ap, opp } = setup([]);
    const st = putOnBattlefield(s0, ap, starkeOfRath());
    const theirs = putOnBattlefield(s0, opp, rock(2));
    const s = settle(run(s0, planActivate(s0, ap, st, 0, [tgt(theirs)])));
    expect([zone(s, theirs), controllerOf(s, s.objects[st]!)]).toEqual(["graveyard", opp]);
  });
  it("still changes control when the permanent isn't destroyed", () => {
    const { s: s0, ap, opp } = setup([]);
    const st = putOnBattlefield(s0, ap, starkeOfRath());
    const theirs = putOnBattlefield(s0, opp, bearC("Tough", 2, 2, ), );
    s0.cards[s0.objects[theirs]!.cardId]!.keywords = ["Indestructible"];
    s0.cards[s0.objects[theirs]!.cardId]!.oracleText = "Indestructible";
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planActivate(s0, ap, st, 0, [tgt(theirs)])));
    expect([zone(s, theirs), controllerOf(s, s.objects[st]!)]).toEqual(["battlefield", opp]);
  });
});

describe("Deepway Navigator", () => {
  it("untaps your other Merfolk and gives Merfolk +1/+0 once you attacked with three or more", () => {
    const { s: s0, ap, ids, opp } = setup([deepwayNavigator()]);
    const m = [0, 1].map((i) => putOnBattlefield(s0, ap, merfolk(`Fish ${i}`)));
    const shifter = putOnBattlefield(s0, ap, vanilla("Test Shifter", "Creature — Shapeshifter", "{1}", 1, 1, 1, { keywords: ["Changeling"], oracleText: "Changeling" }));
    const theirFish = putOnBattlefield(s0, opp, merfolk("Their Fish"));
    for (const id of [...m, theirFish]) s0.objects[id]!.tapped = true;
    let s = settle(castNow(s0, ap, ids[0]!));
    expect([s.objects[m[0]!]!.tapped, s.objects[m[1]!]!.tapped, s.objects[theirFish]!.tapped]).toEqual([false, false, true]);
    expect(pt(s, ids[0]!)).toBe("2/2");
    s = attackWith(s, [...m, shifter], opp);
    expect([pt(s, ids[0]!), pt(s, m[0]!), pt(s, shifter), pt(s, theirFish)]).toEqual(["3/2", "2/1", "2/1", "1/1"]);
  });
  it("doesn't with two", () => {
    const { s: s0, ap, opp } = setup([]);
    const dn = putOnBattlefield(s0, ap, deepwayNavigator());
    const m = [0, 1].map((i) => putOnBattlefield(s0, ap, merfolk(`Fish ${i}`)));
    const bear = putOnBattlefield(s0, ap, bearC());
    const s = attackWith(s0, [...m, bear], opp);
    expect([pt(s, dn), pt(s, m[0]!)]).toEqual(["2/2", "1/1"]);
  });
});

describe("Scythe of the Wretched", () => {
  it("returns a creature the equipped creature dealt damage to under your control, with the Scythe on it", () => {
    const { s: s0, ap, ids, opp } = setup([kill()]);
    const sc = putOnBattlefield(s0, ap, scytheOfTheWretched());
    const holder = putOnBattlefield(s0, ap, bearC("Holder"));
    s0.objects[sc]!.attachedTo = holder;
    invalidateCharacteristics(s0);
    expect(pt(s0, holder)).toBe("4/4");
    putOnBattlefield(s0, opp, bearC("Their Bear", 2, 4));
    const victim = onField(s0, "Their Bear")[0]!;
    dealDamage(s0, objectSource(s0, s0.objects[holder]!), { object: s0.objects[victim]! }, 1);
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(victim)]));
    const back = onField(s, "Their Bear");
    expect(back.length).toBe(1);
    expect([controllerOf(s, s.objects[back[0]!]!), s.objects[sc]!.attachedTo, pt(s, back[0]!)]).toEqual([ap, back[0], "4/6"]);
  });
});

describe("Arcbound Fiend", () => {
  it("may move a +1/+1 counter from target creature onto itself at your upkeep", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, arcboundFiend());
    s0.objects[f]!.counters["+1/+1"] = 3;
    const theirs = putOnBattlefield(s0, opp, bearC("Grown"));
    s0.objects[theirs]!.counters["+1/+1"] = 2;
    let s = goUntil(s0, (x) => x.activePlayer !== ap);
    s = goUntil(s, (x) => x.activePlayer === ap && x.pending?.kind === "chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(theirs)] });
    s = settle(s, at("chooseMay", ap));
    if (s.pending?.kind === "chooseMay") s = answerMay(s, ap, true);
    s = settle(s);
    expect([counters(s, f), counters(s, theirs)]).toEqual([4, 1]);
  });
});

describe("Consecrate // Consume", () => {
  it("Consume: the player sacrifices their greatest-power creature and you gain life equal to its power", () => {
    const { s: s0, ap, ids, opp } = setup([consecrateConsume()]);
    const big = putOnBattlefield(s0, opp, bearC("Big", 4, 4));
    const small = putOnBattlefield(s0, opp, bearC("Small"));
    const before = life(s0, ap);
    const s = settle(castNow(s0, ap, ids[0]!, [ply(opp)], { face: 1 } as CostChoices));
    expect([zone(s, big), zone(s, small), life(s, ap)]).toEqual(["graveyard", "battlefield", before + 4]);
  });
});
