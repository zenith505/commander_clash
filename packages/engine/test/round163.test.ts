// Round 163: the most played cards, in popularity order, starting with Zurgo, Thunder's Decree.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, botActions, characteristics, legalActions, potentialAttackers, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; "you may" questions get `yes`. Stops at any other question. */
const resolveAll = (s: GameState, yes = true) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending?.kind === "chooseMay"); i++) {
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes });
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Answers a blight question (CR 701.68a): the -1/-1 counters go on `on`. */
const blight = (s: GameState, on: string) => {
  if (s.pending?.kind !== "pickPermanents") return s; // the only creature: no question
  expect(s.pending).toMatchObject({ counter: "-1/-1" });
  return act(s, { type: "pickPermanents", player: (s.pending as { player: PlayerId }).player, ids: [on] });
};
/** A card put straight into a zone, not from the battlefield. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Like `resolveAll`, and other players' questions are answered by the bot. */
const settle = (s: GameState, me: PlayerId, yes = true) => {
  for (let i = 0; i < 40; i++) {
    s = resolveAll(s, yes);
    if (!s.pending || s.pending.player === me) return s;
    s = run(s, botActions(s, s.pending.player));
  }
  return s;
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % s.turnOrder.length]!;
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) => act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks });
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId) => ({ kind: "player", id }) as TargetChoice;
const kw = (s: GameState, id: string, k: string) => objHasKeyword(s, s.objects[id]!, k);
const tokens = (s: GameState, pid: PlayerId, subtype: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).subtypes.includes(subtype));

// Real oracle text (Scryfall).
const aberrant = card("Aberrant Manawurm", "Creature — Wurm", "{3}{G}", { cmc: 4, power: "2", toughness: "5", keywords: ["Trample"], oracleText: "Trample\nWhenever you cast an instant or sorcery spell, this creature gets +X/+0 until end of turn, where X is the amount of mana spent to cast that spell." });
const aetherflux = card("Aetherflux Conduit", "Artifact", "{6}", { cmc: 6, oracleText: "Whenever you cast a spell, you get an amount of {E} (energy counters) equal to the amount of mana spent to cast that spell.\n{T}, Pay fifty {E}: Draw seven cards. You may cast any number of spells from your hand without paying their mana costs." });
const alpha = card("Alpha Deathclaw", "Creature — Lizard Mutant", "{4}{B}{G}", { cmc: 6, power: "6", toughness: "6", keywords: ["Trample","Menace","Monstrosity"], oracleText: "Menace, trample\nWhen this creature enters or becomes monstrous, destroy target permanent.\n{5}{B}{G}: Monstrosity 4. (If this creature isn't monstrous, put four +1/+1 counters on it and it becomes monstrous.)" });
const archangel = card("Archangel Elspeth", "Legendary Planeswalker — Elspeth", "{2}{W}{W}", { cmc: 4, loyalty: "4", oracleText: "+1: Create a 1/1 white Soldier creature token with lifelink.\n−2: Put two +1/+1 counters on target creature. It becomes an Angel in addition to its other types and gains flying.\n−6: Return all nonland permanent cards with mana value 3 or less from your graveyard to the battlefield." });
const aurora = card("Aurora Phoenix", "Creature — Phoenix", "{4}{R}{R}", { cmc: 6, power: "5", toughness: "3", keywords: ["Cascade","Flying"], oracleText: "Flying\nCascade (When you cast this spell, exile cards from the top of your library until you exile a nonland card that costs less. You may cast it without paying its mana cost. Put the exiled cards on the bottom in a random order.)\nWhenever you cast a spell with cascade, return this card from your graveyard to your hand." });
const blighted = card("Blighted Blackthorn", "Creature — Treefolk Warlock", "{4}{B}", { cmc: 5, power: "3", toughness: "7", keywords: ["Blight"], oracleText: "Whenever this creature enters or attacks, you may blight 2. If you do, you draw a card and lose 1 life. (To blight 2, put two -1/-1 counters on a creature you control.)" });
const boggart = card("Boggart Mischief", "Kindred Enchantment — Goblin", "{2}{B}", { cmc: 3, keywords: ["Blight"], oracleText: "When this enchantment enters, you may blight 1. If you do, create two 1/1 black and red Goblin creature tokens. (To blight 1, put a -1/-1 counter on a creature you control.)\nWhenever a Goblin creature you control dies, each opponent loses 1 life and you gain 1 life." });
const bounty = card("Bounty Board", "Artifact", "{3}", { cmc: 3, oracleText: "{T}: Add one mana of any color.\n{1}, {T}: Put a bounty counter on target creature. Activate only as a sorcery.\nWhenever a creature with a bounty counter on it dies, each of its controller's opponents draws a card and gains 2 life." });
const brood = card("Brood Sliver", "Creature — Sliver", "{4}{G}", { cmc: 5, power: "3", toughness: "3", oracleText: "Whenever a Sliver deals combat damage to a player, its controller may create a 1/1 colorless Sliver creature token." });
const dream = card("Dream Seizer", "Creature — Faerie Rogue", "{3}{B}", { cmc: 4, power: "3", toughness: "2", keywords: ["Blight","Flying"], oracleText: "Flying\nWhen this creature enters, you may blight 1. If you do, each opponent discards a card. (To blight 1, put a -1/-1 counter on a creature you control.)" });
const glacierwood = card("Glacierwood Siege", "Enchantment", "{1}{G}{U}", { cmc: 3, keywords: ["Mill"], oracleText: "As this enchantment enters, choose Temur or Sultai.\n• Temur — Whenever you cast an instant or sorcery spell, target player mills four cards.\n• Sultai — You may play lands from your graveyard." });
const gouged = card("Gouged Zealot", "Creature — Cyclops Berserker", "{3}{R}", { cmc: 4, power: "4", toughness: "3", keywords: ["Delirium","Reach"], oracleText: "Reach\nDelirium — Whenever this creature attacks, if there are four or more card types among cards in your graveyard, this creature deals 1 damage to each creature defending player controls." });
const gravelighter = card("Gravelighter", "Creature — Spirit", "{2}{B}", { cmc: 3, power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, draw a card if a creature died this turn. Otherwise, each player sacrifices a creature of their choice." });
const gutsplitter = card("Gutsplitter Gang", "Creature — Goblin Berserker", "{3}{B}", { cmc: 4, power: "6", toughness: "6", keywords: ["Blight"], oracleText: "At the beginning of your first main phase, you may blight 2. If you don't, you lose 3 life. (To blight 2, put two -1/-1 counters on a creature you control.)" });
const hall = card("Hall of Oracles", "Land", "", { cmc: 0, oracleText: "{T}: Add {C}.\n{1}, {T}: Add one mana of any color.\n{T}: Put a +1/+1 counter on target creature. Activate only as a sorcery and only if you've cast an instant or sorcery spell this turn." });
const haunting = card("Haunting Figment", "Creature — Illusion", "{1}{U}", { cmc: 2, power: "2", toughness: "1", keywords: ["Vigilance"], oracleText: "Vigilance\nThis creature can't be blocked as long as you've cast an instant or sorcery spell this turn." });
const jangling = card("Jangling Automaton", "Artifact Creature — Construct", "{3}", { cmc: 3, power: "3", toughness: "2", oracleText: "Whenever this creature attacks, untap all creatures defending player controls." });
const leapfrog = card("Leapfrog", "Creature — Frog", "{2}{U}", { cmc: 3, power: "3", toughness: "1", oracleText: "This creature has flying as long as you've cast an instant or sorcery spell this turn." });
const butcher = card("Lord Skitter's Butcher", "Creature — Rat Peasant", "{2}{B}", { cmc: 3, power: "2", toughness: "3", keywords: ["Scry"], oracleText: "When this creature enters, choose one —\n• Create a 1/1 black Rat creature token with \"This token can't block.\"\n• You may sacrifice another creature. If you do, scry 2, then draw a card.\n• Creatures you control gain menace until end of turn." });
const shatterskull = card("Lord of Shatterskull Pass", "Creature — Minotaur Shaman", "{3}{R}", { cmc: 4, power: "3", toughness: "3", keywords: ["Level Up"], oracleText: "Level up {1}{R} ({1}{R}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 1-5\n6/6\nLEVEL 6+\n6/6\nWhenever this creature attacks, it deals 6 damage to each creature defending player controls." });
const magebane = card("Magebane Lizard", "Creature — Lizard", "{1}{R}", { cmc: 2, power: "1", toughness: "4", oracleText: "Whenever a player casts a noncreature spell, this creature deals damage to that player equal to the number of noncreature spells they've cast this turn." });
const manaform = card("Manaform Hellkite", "Creature — Dragon", "{2}{R}{R}", { cmc: 4, power: "4", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nWhenever you cast a noncreature spell, create an X/X red Dragon Illusion creature token with flying and haste, where X is the amount of mana spent to cast that spell. Exile that token at the beginning of the next end step." });
const oriq = card("Oriq Loremage", "Creature — Human Warlock", "{2}{B}{B}", { cmc: 4, power: "3", toughness: "3", oracleText: "{T}: Search your library for a card, put it into your graveyard, then shuffle. If it's an instant or sorcery card, put a +1/+1 counter on this creature." });
const pistonFist = card("Piston-Fist Cyclops", "Creature — Cyclops", "{1}{U/R}{U/R}", { cmc: 3, power: "4", toughness: "3", keywords: ["Defender"], oracleText: "Defender\nAs long as you've cast an instant or sorcery spell this turn, this creature can attack as though it didn't have defender." });
const potioners = card("Potioner's Trove", "Artifact", "{3}", { cmc: 3, oracleText: "{T}: Add one mana of any color.\n{T}: You gain 2 life. Activate only if you've cast an instant or sorcery spell this turn." });
const pretenders = card("Pretender's Claim", "Enchantment — Aura", "{1}{B}", { cmc: 2, keywords: ["Enchant"], oracleText: "Enchant creature\nWhenever enchanted creature becomes blocked, tap all lands defending player controls." });
const protector = card("Protector of the Wastes", "Creature — Dragon", "{4}{W}{W}", { cmc: 6, power: "5", toughness: "5", keywords: ["Flying","Monstrosity"], oracleText: "Flying\nWhen this creature enters or becomes monstrous, exile up to two target artifacts and/or enchantments controlled by different players.\n{4}{W}: Monstrosity 3. (If this creature isn't monstrous, put three +1/+1 counters on it and it becomes monstrous.)" });
const rakdos = card("Rakdos, the Muscle", "Legendary Creature — Demon Mercenary", "{2}{B}{B}{R}", { cmc: 5, power: "6", toughness: "5", keywords: ["Flying","Trample"], oracleText: "Flying, trample\nWhenever you sacrifice another creature, exile cards equal to its mana value from the top of target player's library. Until your next end step, you may play those cards, and mana of any type can be spent to cast those spells.\nSacrifice another creature: Rakdos gains indestructible until end of turn. Tap it. Activate only once each turn." });
const ronin = card("Ronin Cliffrider", "Creature — Human Samurai", "{3}{R}{R}", { cmc: 5, power: "2", toughness: "2", keywords: ["Bushido"], oracleText: "Bushido 1 (Whenever this creature blocks or becomes blocked, it gets +1/+1 until end of turn.)\nWhenever this creature attacks, you may have it deal 1 damage to each creature defending player controls." });
const salvager = card("Salvager of Ruin", "Artifact Creature — Construct", "{3}", { cmc: 3, power: "2", toughness: "1", oracleText: "Sacrifice this creature: Choose target permanent card in your graveyard that was put there from the battlefield this turn. Return it to your hand." });
const samwise = card("Samwise the Stouthearted", "Legendary Creature — Halfling Peasant", "{1}{W}", { cmc: 2, power: "2", toughness: "1", keywords: ["Flash"], oracleText: "Flash\nWhen Samwise enters, choose up to one target permanent card in your graveyard that was put there from the battlefield this turn. Return it to your hand. Then the Ring tempts you." });
const scalding = card("Scalding Salamander", "Creature — Salamander", "{2}{R}", { cmc: 3, power: "2", toughness: "1", oracleText: "Whenever this creature attacks, you may have it deal 1 damage to each creature without flying defending player controls." });
const scuzzback = card("Scuzzback Scrounger", "Creature — Goblin Warrior", "{1}{R}", { cmc: 2, power: "3", toughness: "2", keywords: ["Blight","Treasure"], oracleText: "At the beginning of your first main phase, you may blight 1. If you do, create a Treasure token. (To blight 1, put a -1/-1 counter on a creature you control. A Treasure token is an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")" });
const silumgar = card("Silumgar, the Drifting Death", "Legendary Creature — Dragon", "{4}{U}{B}", { cmc: 6, power: "3", toughness: "7", keywords: ["Flying","Hexproof"], oracleText: "Flying, hexproof\nWhenever a Dragon you control attacks, creatures defending player controls get -1/-1 until end of turn." });
const sinister = card("Sinister Gnarlbark", "Creature — Treefolk Warlock", "{2}{B}", { cmc: 3, power: "0", toughness: "4", keywords: ["Blight"], oracleText: "At the beginning of your end step, draw a card and blight 1. (Put a -1/-1 counter on a creature you control.)" });
const sourbread = card("Sourbread Auntie", "Creature — Goblin Warrior", "{2}{R}{R}", { cmc: 4, power: "4", toughness: "3", keywords: ["Blight"], oracleText: "When this creature enters, you may blight 2. If you do, create two 1/1 black and red Goblin creature tokens. (To blight 2, put two -1/-1 counters on a creature you control.)" });
const storm = card("Storm of Souls", "Sorcery", "{4}{W}{W}", { cmc: 6, oracleText: "Return all creature cards from your graveyard to the battlefield. Each of them is a 1/1 Spirit with flying in addition to its other types. Exile Storm of Souls." });
const street = card("Street Wraith", "Creature — Wraith", "{3}{B}{B}", { cmc: 5, power: "3", toughness: "4", keywords: ["Landwalk","Swampwalk","Cycling"], oracleText: "Swampwalk (This creature can't be blocked as long as defending player controls a Swamp.)\nCycling—Pay 2 life. (Pay 2 life, Discard this card: Draw a card.)" });
const swathcutter = card("Swathcutter Giant", "Creature — Giant Soldier", "{4}{R}{W}", { cmc: 6, power: "5", toughness: "5", keywords: ["Vigilance"], oracleText: "Vigilance\nWhenever this creature attacks, it deals 1 damage to each creature defending player controls." });
const synapse = card("Synapse Sliver", "Creature — Sliver", "{4}{U}", { cmc: 5, power: "3", toughness: "3", oracleText: "Whenever a Sliver deals combat damage to a player, its controller may draw a card." });
const tend = card("Tend the Pests", "Instant", "{B}{G}", { cmc: 2, oracleText: "As an additional cost to cast this spell, sacrifice a creature.\nCreate X 1/1 black and green Pest creature tokens with \"When this token dies, you gain 1 life,\" where X is the sacrificed creature's power." });
const firstDoctor = card("The First Doctor", "Legendary Creature — Time Lord Doctor", "{1}{W}{U}", { cmc: 3, power: "2", toughness: "2", oracleText: "When The First Doctor enters, search your library and/or graveyard for a card named TARDIS, reveal it, and put it into your hand. If you search your library this way, shuffle.\nWhenever you cast a spell with cascade, put a +1/+1 counter on target artifact or creature." });
const thopter = card("Thopter Assembly", "Artifact Creature — Thopter", "{6}", { cmc: 6, power: "5", toughness: "5", keywords: ["Flying"], oracleText: "Flying\nAt the beginning of your upkeep, if you control no Thopters other than this creature, return this creature to its owner's hand and create five 1/1 colorless Thopter artifact creature tokens with flying." });
const tinybones = card("Tinybones, Trinket Thief", "Legendary Creature — Skeleton Rogue", "{1}{B}", { cmc: 2, power: "1", toughness: "2", oracleText: "At the beginning of each end step, if an opponent discarded a card this turn, you draw a card and you lose 1 life.\n{4}{B}{B}: Each opponent with no cards in hand loses 10 life." });
const transit = card("Transit Mage", "Creature — Human Wizard", "{2}{U}", { cmc: 3, power: "2", toughness: "2", oracleText: "When this creature enters, you may search your library for an artifact card with mana value 4 or 5, reveal it, put it into your hand, then shuffle." });
const uncover = card("Uncover the Moon-Letters", "Enchantment", "{3}{U}", { cmc: 4, oracleText: "Whenever you cast a noncreature spell, you may draw X cards, where X is the amount of mana spent to cast that spell. If you do, discard two cards." });
const wakka = card("Wakka, Devoted Guardian", "Legendary Creature — Human Warrior", "{2}{G}{W}", { cmc: 4, power: "4", toughness: "4", keywords: ["Reach","Trample","Blitzball Captain"], oracleText: "Reach, trample\nWhenever Wakka deals combat damage to a player, destroy up to one target artifact that player controls and put a +1/+1 counter on Wakka.\nBlitzball Captain — At the beginning of your end step, if a counter was put on Wakka this turn, put a +1/+1 counter on each other creature you control." });
const warren = card("Warren Torchmaster", "Creature — Goblin Warrior", "{1}{R}", { cmc: 2, power: "2", toughness: "2", keywords: ["Blight"], oracleText: "At the beginning of combat on your turn, you may blight 1. When you do, target creature gains haste until end of turn. (To blight 1, put a -1/-1 counter on a creature you control.)" });
const zurgo = card("Zurgo, Thunder's Decree", "Legendary Creature — Orc Warrior", "{R}{W}{B}", { cmc: 3, power: "2", toughness: "4", keywords: ["Mobilize"], oracleText: "Mobilize 2 (Whenever this creature attacks, create two tapped and attacking 1/1 red Warrior creature tokens. Sacrifice them at the beginning of the next end step.)\nDuring your end step, Warrior tokens you control have \"This token can't be sacrificed.\"" });
const sanar = card("Sanar, Unfinished Genius", "Legendary Creature — Goblin Sorcerer", "{U}{R}", { cmc: 2, power: "0", toughness: "4", oracleText: "Sanar enters prepared. (While it's prepared, you may cast a copy of its spell. Doing so unprepares it.)\n{T}: Create a Treasure token. Activate only if you've cast an instant or sorcery spell this turn." });

const shock = card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "Test Shock deals 2 damage to any target." });
const divination = card("Test Divination", "Sorcery", "{2}{U}", { cmc: 3, oracleText: "Draw two cards." });
const rock = card("Test Rock", "Artifact", "{1}", { cmc: 1 });
const sliver = card("Test Sliver", "Creature — Sliver", "{1}", { cmc: 1, power: "1", toughness: "1" });
const dragon = card("Test Dragon", "Creature — Dragon", "{1}", { cmc: 1, power: "2", toughness: "2" });
const cascader = card("Test Cascader", "Creature — Elemental", "{3}{R}", { cmc: 4, power: "3", toughness: "3", keywords: ["Cascade"], oracleText: "Cascade (When you cast this spell, exile cards from the top of your library until you exile a nonland card that costs less. You may cast it without paying its mana cost. Put the exiled cards on the bottom in a random order.)" });

describe("round 163 cards", () => {
  it("are fully supported", () =>
    supported(aberrant, aetherflux, alpha, archangel, aurora, blighted, boggart, bounty, brood, dream, glacierwood, gouged, gravelighter, gutsplitter, hall, haunting, jangling, leapfrog, butcher, shatterskull, magebane, manaform, oriq, pistonFist, potioners, pretenders, protector, rakdos, ronin, salvager, samwise, sanar, scalding, scuzzback, silumgar, sinister, sourbread, storm, street, swathcutter, synapse, tend, firstDoctor, thopter, tinybones, transit, uncover, wakka, warren, zurgo));
});

describe("Zurgo, Thunder's Decree", () => {
  it("keeps its mobilized Warriors: they can't be sacrificed during your end step, so the delayed sacrifice does nothing", () => {
    const { s: s0, ap } = setup([]);
    const z = putOnBattlefield(s0, ap, zurgo);
    let s = resolveAll(attack(s0, ap, [{ attacker: z, defender: next(s0, ap) }]));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "attackWhom" });
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: `all:${next(s0, ap)}` } as Action));
    const warriors = tokens(s, ap, "Warrior");
    expect(warriors.length).toBe(2);
    s = resolveAll(passUntil(s, "end", ap));
    s = resolveAll(s);
    for (const w of warriors) expect(zone(s, w)).toBe("battlefield");
  });

  it("without Zurgo the Warriors are sacrificed at the next end step", () => {
    const { s: s0, ap } = setup([]);
    const z = putOnBattlefield(s0, ap, zurgo);
    let s = resolveAll(attack(s0, ap, [{ attacker: z, defender: next(s0, ap) }]));
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: `all:${next(s0, ap)}` } as Action));
    const warriors = tokens(s, ap, "Warrior");
    s.battlefield.splice(s.battlefield.indexOf(z), 1);
    s.objects[z]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(z);
    invalidateCharacteristics(s);
    s = resolveAll(passUntil(s, "end", ap));
    for (const w of warriors) expect(zone(s, w)).not.toBe("battlefield");
  });
});

describe("Sinister Gnarlbark", () => {
  it("draws a card and blights 1 at the beginning of your end step", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, sinister);
    const b = putOnBattlefield(s0, ap, bear());
    const hand = s0.players[ap]!.hand.length;
    let s = resolveAll(passUntil(s0, "end", ap));
    s = resolveAll(blight(s, b));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.objects[b]!.counters["-1/-1"]).toBe(1);
    expect(s.objects[g]!.counters["-1/-1"]).toBeUndefined();
  });
});

describe("Scuzzback Scrounger", () => {
  it("may blight 1 at your first main phase for a Treasure", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, scuzzback);
    const b = putOnBattlefield(s0, ap, bear());
    let s = resolveAll(passUntil(passUntil(s0, "end", ap), "main1", ap));
    s = resolveAll(blight(s, b));
    expect(s.objects[b]!.counters["-1/-1"]).toBe(1);
    expect(tokens(s, ap, "Treasure").length).toBe(1);
  });

  it("no Treasure when you decline", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, scuzzback);
    const s = resolveAll(passUntil(passUntil(s0, "end", ap), "main1", ap), false);
    expect(tokens(s, ap, "Treasure").length).toBe(0);
  });
});

describe("Gutsplitter Gang", () => {
  it("you lose 3 life unless you blight 2", () => {
    for (const yes of [true, false]) {
      const { s: s0, ap } = setup([]);
      const g = putOnBattlefield(s0, ap, gutsplitter);
      let s = resolveAll(passUntil(passUntil(s0, "end", ap), "main1", ap), yes);
      s = resolveAll(blight(s, g));
      expect(s.players[ap]!.life).toBe(yes ? 40 : 37);
      expect(s.objects[g]!.counters["-1/-1"]).toBe(yes ? 2 : undefined);
    }
  });
});

describe("Rakdos, the Muscle", () => {
  it("exiles cards equal to the sacrificed creature's mana value from the target player's library; you may play them, with any mana", () => {
    const { s: s0, ap } = setup([]);
    const opp = next(s0, ap);
    const r = putOnBattlefield(s0, ap, rakdos);
    const fodder = putOnBattlefield(s0, ap, card("Test Ogre", "Creature — Ogre", "{2}{R}", { cmc: 3, power: "3", toughness: "3" }));
    const top = [into(s0, opp, shock, "library"), into(s0, opp, divination, "library"), into(s0, opp, bear(), "library")];
    const idx = abilitiesOf(s0, s0.objects[r]!).activated.findIndex((a) => !a.mana);
    let s = run(s0, planActivate(s0, ap, r, idx, undefined, undefined, undefined, undefined, { sacrifice: [fodder] }));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets" && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [player(opp)] } as Action));
    expect(zone(s, fodder)).toBe("graveyard");
    for (const id of top) expect(zone(s, id)).toBe("exile");
    expect(kw(s, r, "Indestructible")).toBe(true);
    expect(s.objects[r]!.tapped).toBe(true);
    // The Grizzly Bears ({1}{G}) can be cast, with any mana.
    expect(planCast(s, ap, top[2]!)).not.toBeNull();
  });
});

describe("Storm of Souls", () => {
  it("returns all your creature cards as 1/1 Spirits with flying, then exiles itself", () => {
    const { s: s0, ap, ids } = setup([storm]);
    const big = into(s0, ap, card("Test Giant", "Creature — Giant", "{5}", { cmc: 5, power: "5", toughness: "5" }), "graveyard");
    const b = into(s0, ap, bear(), "graveyard");
    const theirs = into(s0, next(s0, ap), bear(), "graveyard");
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    for (const id of [big, b]) {
      expect(zone(s, id)).toBe("battlefield");
      expect(pt(s, id)).toBe("1/1");
      expect(kw(s, id, "Flying")).toBe(true);
      expect(characteristics(s, s.objects[id]!).subtypes).toContain("Spirit");
    }
    expect(characteristics(s, s.objects[big]!).subtypes).toContain("Giant");
    expect(zone(s, theirs)).toBe("graveyard");
    expect(zone(s, ids[0]!)).toBe("exile");
  });
});

describe("Aurora Phoenix", () => {
  it("returns from your graveyard to your hand when you cast a spell with cascade", () => {
    const { s: s0, ap, ids } = setup([cascader]);
    const ph = into(s0, ap, aurora, "graveyard");
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, ph)).toBe("hand");
  });

  it("not for a spell without cascade", () => {
    const { s: s0, ap, ids } = setup([divination]);
    const ph = into(s0, ap, aurora, "graveyard");
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, ph)).toBe("graveyard");
  });
});

describe("Glacierwood Siege", () => {
  it("Sultai: you may play lands from your graveyard; Temur: you may not, and an instant makes the target player mill four", () => {
    for (const word of ["Sultai", "Temur"]) {
      const { s: s0, ap, ids } = setup([shock]);
      const g = putOnBattlefield(s0, ap, glacierwood);
      s0.objects[g]!.chosen = { ...(s0.objects[g]!.chosen ?? {}), anchor: word } as never;
      const land = into(s0, ap, forest, "graveyard");
      invalidateCharacteristics(s0);
      s0.players[ap]!.landsPlayedThisTurn = 0;
      expect(legalActions(s0, ap).some((a) => a.type === "playLand" && a.objectId === land), word).toBe(word === "Sultai");
      const opp = next(s0, ap);
      const lib = s0.players[opp]!.library.length;
      let s = run(s0, planCast(s0, ap, ids[0]!, [player(opp)]));
      for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets" && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      if (word === "Temur") {
        expect(s.pending).toMatchObject({ kind: "chooseTargets" });
        s = act(s, { type: "chooseTargets", player: ap, targets: [player(opp)] } as Action);
      }
      s = resolveAll(s);
      expect(s.players[opp]!.library.length).toBe(word === "Temur" ? lib - 4 : lib);
    }
  });
});

describe("Oriq Loremage", () => {
  it("puts any card from your library into your graveyard; a counter on it only for an instant or sorcery card", () => {
    for (const def of [shock, bear()]) {
      const { s: s0, ap } = setup([]);
      const o = putOnBattlefield(s0, ap, oriq);
      const c = into(s0, ap, def, "library");
      let s = run(s0, planActivate(s0, ap, o, 0));
      s = resolveAll(s);
      expect(s.pending).toMatchObject({ kind: "searchLibrary" });
      s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [c] }));
      expect(zone(s, c)).toBe("graveyard");
      expect(s.objects[o]!.counters["+1/+1"]).toBe(def === shock ? 1 : undefined);
    }
  });
});

describe("Dream Seizer and Tinybones, Trinket Thief", () => {
  it("Dream Seizer's blight makes each opponent discard; at the end step Tinybones draws you a card and you lose 1 life", () => {
    const { s: s0, ap, ids } = setup([dream]);
    putOnBattlefield(s0, ap, tinybones);
    const b = putOnBattlefield(s0, ap, bear());
    const opps = s0.turnOrder.filter((p) => p !== ap);
    for (const p of opps) into(s0, p, bear(), "hand");
    const hands = opps.map((p) => s0.players[p]!.hand.length);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(blight(s, b), ap);
    expect(opps.map((p) => s.players[p]!.hand.length)).toEqual(hands.map((h) => h - 1));
    const hand = s.players[ap]!.hand.length;
    s = settle(passUntil(s, "end", ap), ap);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.players[ap]!.life).toBe(39);
  });

  it("no card at an end step when no opponent discarded; its ability hurts only opponents with empty hands", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, tinybones);
    const [a, b] = s0.turnOrder.filter((p) => p !== ap) as [PlayerId, PlayerId];
    for (const id of [...s0.players[a]!.hand]) {
      s0.objects[id]!.zone = "graveyard";
      s0.players[a]!.graveyard.push(id);
    }
    s0.players[a]!.hand = [];
    into(s0, b, bear(), "hand");
    const hand = s0.players[ap]!.hand.length;
    let s = resolveAll(run(s0, planActivate(s0, ap, t, 0)));
    expect(s.players[a]!.life).toBe(30);
    expect(s.players[b]!.life).toBe(40);
    s = settle(passUntil(s, "end", ap), ap);
    expect(s.players[ap]!.hand.length).toBe(hand);
  });
});

describe("Bounty Board", () => {
  it("when a creature with a bounty counter dies, each of its controller's opponents draws a card and gains 2 life", () => {
    const { s: s0, ap, ids } = setup([shock]);
    const bb = putOnBattlefield(s0, ap, bounty);
    const opp = next(s0, ap);
    const b = putOnBattlefield(s0, opp, bear());
    const idx = abilitiesOf(s0, s0.objects[bb]!).activated.findIndex((a) => !a.mana);
    let s = resolveAll(run(s0, planActivate(s0, ap, bb, idx, [tgt(b)])));
    expect(s.objects[b]!.counters.bounty).toBe(1);
    const hands = s.turnOrder.map((p) => s.players[p]!.hand.length);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b)])), ap);
    expect(zone(s, b)).toBe("graveyard");
    s.turnOrder.forEach((p, i) => {
      // The Shock left ap's hand.
      const drew = p === opp ? 0 : 1;
      expect(s.players[p]!.hand.length, `player ${p}`).toBe(hands[i]! + drew - (p === ap ? 1 : 0));
      expect(s.players[p]!.life).toBe(p === opp ? 40 : 42);
    });
  });
});

describe("Brood Sliver", () => {
  it("any Sliver's combat damage to a player lets that Sliver's controller make a Sliver token", () => {
    const { s: s0, ap } = setup([]);
    const opp = next(s0, ap);
    putOnBattlefield(s0, opp, brood);
    const sl = putOnBattlefield(s0, ap, sliver);
    let s = attack(s0, ap, [{ attacker: sl, defender: opp }]);
    s = settle(passUntil(s, "combatDamage", ap), ap);
    s = settle(s, ap);
    expect(tokens(s, ap, "Sliver").length).toBe(1);
    expect(tokens(s, opp, "Sliver").length).toBe(0);
  });
});

describe("Samwise the Stouthearted", () => {
  it("returns a permanent card put into your graveyard from the battlefield this turn, and the Ring tempts you", () => {
    const { s: s0, ap, ids } = setup([shock, samwise]);
    const b = putOnBattlefield(s0, ap, bear());
    const old = into(s0, ap, bear(), "graveyard");
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(zone(s, b)).toBe("graveyard");
    // The bear that died this turn can be chosen, the one already there can't.
    s = run(s, planCast(s, ap, ids[1]!));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets" && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] } as Action), ap);
    if (s.pending) s = settle(run(s, botActions(s, ap)), ap);
    expect(zone(s, b)).toBe("hand");
    expect(zone(s, old)).toBe("graveyard");
    expect(s.players[ap]!.ring?.tempted).toBe(1);
  });
});

describe("Tend the Pests", () => {
  it("creates Pests equal to the sacrificed creature's power", () => {
    const { s: s0, ap, ids } = setup([tend]);
    const big = putOnBattlefield(s0, ap, card("Test Giant", "Creature — Giant", "{5}", { cmc: 5, power: "3", toughness: "5" }));
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { sacrifice: [big] } as never)));
    expect(zone(s, big)).toBe("graveyard");
    expect(tokens(s, ap, "Pest").length).toBe(3);
  });
});

describe("Street Wraith", () => {
  it("cycles for 2 life", () => {
    const { s: s0, ap, ids } = setup([street]);
    const idx = abilitiesOf(s0, s0.objects[ids[0]!]!).activated.findIndex((a) => a.cycling);
    const hand = s0.players[ap]!.hand.length;
    const s = resolveAll(run(s0, planActivate(s0, ap, ids[0]!, idx)));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(38);
    expect(s.players[ap]!.hand.length).toBe(hand);
  });
});

describe("Archangel Elspeth", () => {
  it("−2: two +1/+1 counters, and the creature becomes an Angel with flying as well", () => {
    const { s: s0, ap } = setup([]);
    const e = putOnBattlefield(s0, ap, archangel);
    s0.objects[e]!.counters.loyalty = 4;
    const b = putOnBattlefield(s0, ap, bear());
    const s = resolveAll(run(s0, planActivate(s0, ap, e, 1, [tgt(b)])));
    expect(pt(s, b)).toBe("4/4");
    expect(kw(s, b, "Flying")).toBe(true);
    expect(characteristics(s, s.objects[b]!).subtypes).toEqual(expect.arrayContaining(["Bear", "Angel"]));
  });
});

describe("Transit Mage", () => {
  it("may find an artifact card with mana value 4 or 5, not 3", () => {
    const { s: s0, ap, ids } = setup([transit]);
    const four = into(s0, ap, card("Test Four", "Artifact", "{4}", { cmc: 4 }), "library");
    const five = into(s0, ap, card("Test Five", "Artifact", "{5}", { cmc: 5 }), "library");
    const three = into(s0, ap, card("Test Three", "Artifact", "{3}", { cmc: 3 }), "library");
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary" });
    const legal = (s.pending as { cards: string[] }).cards;
    expect(legal).toEqual(expect.arrayContaining([four, five]));
    expect(legal).not.toContain(three);
  });
});

describe("Gravelighter", () => {
  it("draws a card if a creature died this turn; otherwise each player sacrifices a creature", () => {
    for (const died of [true, false]) {
      const { s: s0, ap, ids } = setup([shock, gravelighter]);
      const opp = next(s0, ap);
      const victim = putOnBattlefield(s0, opp, bear());
      const theirs = putOnBattlefield(s0, opp, bear());
      let s = s0;
      if (died) s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(victim)])));
      const hand = s.players[ap]!.hand.length;
      s = settle(run(s, planCast(s, ap, ids[1]!)), ap);
      const g = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Gravelighter");
      if (died) {
        expect(zone(s, theirs)).toBe("battlefield");
        expect(s.players[ap]!.hand.length).toBe(hand); // cast one, drew one
        expect(g).toBeDefined();
      } else {
        // Gravelighter is your only creature: you sacrifice it; the opponent sacrifices one of its two Bears.
        expect(g).toBeUndefined();
        expect([victim, theirs].filter((id) => zone(s, id) === "battlefield").length).toBe(1);
      }
    }
  });
});

describe("Hall of Oracles, Leapfrog, Haunting Figment and Piston-Fist Cyclops", () => {
  it("turn on once you've cast an instant or sorcery spell this turn", () => {
    const { s: s0, ap, ids } = setup([shock]);
    const h = putOnBattlefield(s0, ap, hall);
    const f = putOnBattlefield(s0, ap, leapfrog);
    const hf = putOnBattlefield(s0, ap, haunting);
    const counterIdx = abilitiesOf(s0, s0.objects[h]!).activated.findIndex((a) => !a.mana);
    expect(counterIdx).toBeGreaterThanOrEqual(0);
    expect(planActivate(s0, ap, h, counterIdx, [tgt(f)])).toBeNull();
    expect(kw(s0, f, "Flying")).toBe(false);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [player(next(s0, ap))])));
    expect(kw(s, f, "Flying")).toBe(true);
    s = resolveAll(run(s, planActivate(s, ap, h, counterIdx, [tgt(hf)])));
    expect(s.objects[hf]!.counters["+1/+1"]).toBe(1);
  });

  it("Piston-Fist Cyclops attacks only after an instant or sorcery", () => {
    const { s: s0, ap, ids } = setup([shock]);
    const c = putOnBattlefield(s0, ap, pistonFist);
    const can = (s: GameState) => potentialAttackers(s, ap).some((o) => o.id === c);
    expect(can(s0)).toBe(false);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [player(next(s0, ap))])));
    expect(can(s)).toBe(true);
  });
});

describe("Silumgar, the Drifting Death", () => {
  it("whenever a Dragon you control attacks, the defending player's creatures get -1/-1", () => {
    const { s: s0, ap } = setup([]);
    const opp = next(s0, ap);
    putOnBattlefield(s0, ap, silumgar);
    const d = putOnBattlefield(s0, ap, dragon);
    const theirs = putOnBattlefield(s0, opp, bear());
    const other = putOnBattlefield(s0, next(s0, opp), bear());
    const s = resolveAll(attack(s0, ap, [{ attacker: d, defender: opp }]));
    expect(pt(s, theirs)).toBe("1/1");
    expect(pt(s, other)).toBe("2/2");
  });
});

describe("Thopter Assembly", () => {
  it("returns to hand with five Thopters at your upkeep when you control no other Thopter, not otherwise", () => {
    for (const other of [false, true]) {
      const { s: s0, ap } = setup([]);
      const t = putOnBattlefield(s0, ap, thopter);
      if (other) putOnBattlefield(s0, ap, card("Test Thopter", "Artifact Creature — Thopter", "{1}", { power: "1", toughness: "1" }));
      const s = resolveAll(passUntil(passUntil(s0, "end", ap), "upkeep", ap));
      expect(zone(s, t)).toBe(other ? "battlefield" : "hand");
      expect(tokens(s, ap, "Thopter").length).toBe(other ? 0 : 5);
    }
  });
});

describe("Magebane Lizard", () => {
  it("deals damage to a player casting a noncreature spell equal to the noncreature spells they've cast this turn", () => {
    const { s: s0, ap, ids } = setup([shock, divination, bear()]);
    putOnBattlefield(s0, next(s0, ap), magebane);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [player(next(s0, ap))])));
    expect(s.players[ap]!.life).toBe(39);
    s = resolveAll(run(s, planCast(s, ap, ids[2]!)));
    expect(s.players[ap]!.life).toBe(39);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(s.players[ap]!.life).toBe(37);
  });
});

describe("Manaform Hellkite, Aberrant Manawurm and Aetherflux Conduit", () => {
  it("count the mana spent to cast the spell", () => {
    const { s: s0, ap, ids } = setup([divination]);
    const wurm = putOnBattlefield(s0, ap, aberrant);
    putOnBattlefield(s0, ap, manaform);
    putOnBattlefield(s0, ap, aetherflux);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    const dragons = tokens(s, ap, "Dragon");
    expect(dragons.length).toBe(1);
    expect(pt(s, dragons[0]!)).toBe("3/3");
    expect(kw(s, dragons[0]!, "Haste")).toBe(true);
    expect(pt(s, wurm)).toBe("5/5");
    expect(s.players[ap]!.energy).toBe(3);
    const s2 = resolveAll(passUntil(s, "end", ap));
    expect(zone(s2, dragons[0]!)).not.toBe("battlefield");
  });
});

describe("Uncover the Moon-Letters", () => {
  it("may draw cards equal to the mana spent, then discard two", () => {
    const { s: s0, ap, ids } = setup([divination]);
    putOnBattlefield(s0, ap, uncover);
    const hand = s0.players[ap]!.hand.length;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    for (let i = 0; i < 4 && s.pending; i++) s = resolveAll(run(s, botActions(s, ap)));
    // -1 cast, +3 drawn, -2 discarded, +2 Divination.
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3 - 2 + 2);
  });
});

describe("Lord Skitter's Butcher", () => {
  it("mode two: sacrifice another creature to scry 2 and draw a card", () => {
    const { s: s0, ap, ids } = setup([butcher]);
    const b = putOnBattlefield(s0, ap, bear());
    const hand = s0.players[ap]!.hand.length;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 10 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "chooseModes") s = act(s, { type: "chooseModes", player: ap, modes: [1] } as Action);
    for (let i = 0; i < 6; i++) {
      s = resolveAll(s);
      if (s.pending?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: ap, ids: [b] });
      else if (s.pending) s = run(s, botActions(s, ap));
      else break;
    }
    expect(zone(s, b)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
  });
});

describe("Wakka, Devoted Guardian", () => {
  it("at your end step, if a counter was put on Wakka this turn, a +1/+1 counter on each other creature you control", () => {
    for (const counter of [true, false]) {
      const { s: s0, ap } = setup([]);
      const w = putOnBattlefield(s0, ap, wakka);
      const b = putOnBattlefield(s0, ap, bear());
      let s = s0;
      if (counter) {
        const h = putOnBattlefield(s, ap, hall);
        // Hall of Oracles needs an instant or sorcery first.
        const sh = into(s, ap, shock, "hand");
        s = resolveAll(run(s, planCast(s, ap, sh, [player(next(s, ap))])));
        const idx = abilitiesOf(s, s.objects[h]!).activated.findIndex((a) => !a.mana);
        s = resolveAll(run(s, planActivate(s, ap, h, idx, [tgt(w)])));
      }
      s = settle(passUntil(s, "end", ap), ap);
      expect(s.objects[b]!.counters["+1/+1"]).toBe(counter ? 1 : undefined);
      expect(s.objects[w]!.counters["+1/+1"]).toBe(counter ? 1 : undefined);
    }
  });
});

describe("The First Doctor", () => {
  it("puts a +1/+1 counter on target artifact or creature when you cast a spell with cascade", () => {
    const { s: s0, ap, ids } = setup([cascader]);
    const d = putOnBattlefield(s0, ap, firstDoctor);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets" && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(d)] } as Action));
    expect(s.objects[d]!.counters["+1/+1"]).toBe(1);
  });
});

describe("Alpha Deathclaw and Protector of the Wastes", () => {
  it("trigger when they become monstrous", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, alpha);
    const r = putOnBattlefield(s0, next(s0, ap), rock);
    s0.players[ap]!.manaPool = { W: 0, U: 0, B: 5, R: 0, G: 5, C: 0 } as never;
    let s = run(s0, planActivate(s0, ap, a, 0));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets" && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[a]!.counters["+1/+1"]).toBe(4);
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(r)] } as Action));
    expect(zone(s, r)).toBe("graveyard");
  });
});

describe("Sanar, Unfinished Genius", () => {
  it("makes a Treasure only once you've cast an instant or sorcery spell this turn", () => {
    const { s: s0, ap, ids } = setup([shock]);
    const sn = putOnBattlefield(s0, ap, sanar);
    const idx = abilitiesOf(s0, s0.objects[sn]!).activated.findIndex((a) => !a.mana);
    expect(planActivate(s0, ap, sn, idx)).toBeNull();
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [player(next(s0, ap))])));
    s = resolveAll(run(s, planActivate(s, ap, sn, idx)));
    expect(tokens(s, ap, "Treasure").length).toBe(1);
  });
});

describe("Boggart Mischief", () => {
  it("blight 1 for two Goblins; a Goblin dying drains each opponent", () => {
    const { s: s0, ap, ids } = setup([boggart, shock]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    s = resolveAll(blight(s, b));
    const gobs = tokens(s, ap, "Goblin");
    expect(gobs.length).toBe(2);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(gobs[0]!)])), ap);
    expect(s.players[ap]!.life).toBe(41);
    for (const p of s.turnOrder.filter((p) => p !== ap)) expect(s.players[p]!.life).toBe(39);
  });
});

describe("Warren Torchmaster", () => {
  it("blight 1 at the beginning of combat: target creature gains haste", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, warren);
    const b = putOnBattlefield(s0, ap, bear(), { sick: true });
    let s = passUntil(s0, "beginCombat", ap);
    s = resolveAll(s);
    s = blight(s, w);
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets" && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] } as Action));
    expect(kw(s, b, "Haste")).toBe(true);
    expect(s.objects[w]!.counters["-1/-1"]).toBe(1);
  });
});

describe("Swathcutter Giant, Scalding Salamander and Jangling Automaton", () => {
  it("hit only the defending player's creatures as they attack", () => {
    const { s: s0, ap } = setup([]);
    const opp = next(s0, ap);
    const g = putOnBattlefield(s0, ap, swathcutter);
    const sal = putOnBattlefield(s0, ap, scalding);
    const j = putOnBattlefield(s0, ap, jangling);
    const theirs = putOnBattlefield(s0, opp, bear({ toughness: "4" }));
    const flier = putOnBattlefield(s0, opp, card("Test Bird", "Creature — Bird", "{1}", { power: "1", toughness: "3", keywords: ["Flying"], oracleText: "Flying" }));
    s0.objects[theirs]!.tapped = true;
    const other = putOnBattlefield(s0, next(s0, opp), bear());
    const s = resolveAll(attack(s0, ap, [g, sal, j].map((attacker) => ({ attacker, defender: opp }))));
    // Swathcutter 1 to each, Salamander 1 to each without flying.
    expect(s.objects[theirs]!.damage).toBe(2);
    expect(s.objects[flier]!.damage).toBe(1);
    expect(s.objects[other]!.damage ?? 0).toBe(0);
    expect(s.objects[theirs]!.tapped).toBe(false); // Jangling Automaton untapped it
  });
});

describe("Salvager of Ruin", () => {
  it("returns a permanent card put into your graveyard from the battlefield this turn, not an older one", () => {
    const { s: s0, ap, ids } = setup([shock]);
    const sv = putOnBattlefield(s0, ap, salvager);
    const b = putOnBattlefield(s0, ap, bear());
    const old = into(s0, ap, bear(), "graveyard");
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(planActivate(s, ap, sv, 0, [tgt(old)])).toBeNull();
    s = resolveAll(run(s, planActivate(s, ap, sv, 0, [tgt(b)])));
    expect(zone(s, b)).toBe("hand");
    expect(zone(s, sv)).toBe("graveyard");
  });
});

describe("Synapse Sliver", () => {
  it("a Sliver's controller may draw a card when it deals combat damage to a player", () => {
    const { s: s0, ap } = setup([]);
    const opp = next(s0, ap);
    putOnBattlefield(s0, opp, synapse);
    const sl = putOnBattlefield(s0, ap, sliver);
    let s = attack(s0, ap, [{ attacker: sl, defender: opp }]);
    s = settle(passUntil(s, "combatDamage", ap), ap);
    const hands = [s.players[ap]!.hand.length, s.players[opp]!.hand.length];
    s = settle(s, ap);
    expect(s.players[opp]!.life).toBe(39);
    expect([s.players[ap]!.hand.length, s.players[opp]!.hand.length]).toEqual(hands);
  });
});

describe("Lord of Shatterskull Pass", () => {
  it("at level 6 it deals 6 damage to each creature the defending player controls as it attacks", () => {
    const { s: s0, ap } = setup([]);
    const opp = next(s0, ap);
    const l = putOnBattlefield(s0, ap, shatterskull);
    s0.objects[l]!.counters.level = 6;
    const theirs = putOnBattlefield(s0, opp, card("Test Wall", "Creature — Wall", "{3}", { power: "0", toughness: "6" }));
    invalidateCharacteristics(s0);
    expect(pt(s0, l)).toBe("6/6");
    const s = resolveAll(attack(s0, ap, [{ attacker: l, defender: opp }]));
    expect(zone(s, theirs)).toBe("graveyard");
  });
});

describe("Potioner's Trove", () => {
  it("gains 2 life only once you've cast an instant or sorcery spell this turn", () => {
    const { s: s0, ap, ids } = setup([shock]);
    const p = putOnBattlefield(s0, ap, potioners);
    const idx = abilitiesOf(s0, s0.objects[p]!).activated.findIndex((a) => !a.mana);
    expect(planActivate(s0, ap, p, idx)).toBeNull();
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [player(next(s0, ap))])));
    s = resolveAll(run(s, planActivate(s, ap, p, idx)));
    expect(s.players[ap]!.life).toBe(42);
  });
});
