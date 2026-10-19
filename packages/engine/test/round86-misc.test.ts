// Other cards round 86 brought in: "Reveal any number of red cards in your hand" (CR 701.20a) for X, discard
// triggers with a card filter ("whenever you discard a creature card"), "if it was a creature card" after exiling a
// card from a graveyard, "at least five other Mountains", entering as a copy of a creature card in a graveyard,
// cast triggers for "another spell that has convoke" and "a creature spell with infect", "look at target player's
// hand. You may choose a card from it", "unless its controller pays ... If they do", doubling power and toughness
// (CR 701.10b-c), putting cards from your hand on the bottom of your library, and "put ... from your graveyard on top
// of your library".

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, mountain, passUntil, pt, putOnBattlefield, scry, setup, target } from "./helpers";
import { isFullySupported, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const scavengingOoze = card("Scavenging Ooze", "Creature — Ooze", "{1}{G}", { power: "2", toughness: "2", oracleText: "{G}: Exile target card from a graveyard. If it was a creature card, put a +1/+1 counter on this creature and you gain 1 life." });
const eliteSpellbinder = card("Elite Spellbinder", "Creature — Human Cleric", "{2}{W}", { power: "3", toughness: "1", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, look at target opponent's hand. You may exile a nonland card from it. For as long as that card remains exiled, its owner may play it. A spell cast this way costs {2} more to cast." });
const scentOfCinder = card("Scent of Cinder", "Sorcery", "{1}{R}", { oracleText: "Reveal any number of red cards in your hand. Scent of Cinder deals X damage to any target, where X is the number of cards revealed this way." });
const cinderSeer = card("Cinder Seer", "Creature — Human Wizard", "{3}{R}", { power: "1", toughness: "1", oracleText: "{2}{R}, {T}: Reveal any number of red cards in your hand. This creature deals X damage to any target, where X is the number of cards revealed this way." });
const boneMiser = card("Bone Miser", "Creature — Zombie Wizard", "{4}{B}", { power: "4", toughness: "4", oracleText: "Whenever you discard a creature card, create a 2/2 black Zombie creature token.\nWhenever you discard a land card, add {B}{B}.\nWhenever you discard a noncreature, nonland card, draw a card." });
const wasteNot = card("Waste Not", "Enchantment", "{1}{B}", { oracleText: "Whenever an opponent discards a creature card, create a 2/2 black Zombie creature token.\nWhenever an opponent discards a land card, add {B}{B}.\nWhenever an opponent discards a noncreature, nonland card, draw a card." });
const valakutTheMoltenPinnacle = card("Valakut, the Molten Pinnacle", "Land", "", { oracleText: "This land enters tapped.\nWhenever a Mountain you control enters, if you control at least five other Mountains, you may have this land deal 3 damage to any target.\n{T}: Add {R}." });
const bodyDouble = card("Body Double", "Creature — Shapeshifter", "{4}{U}", { power: "0", toughness: "0", oracleText: "You may have this creature enter as a copy of any creature card in a graveyard." });
const kaslaTheBrokenHalo = card("Kasla, the Broken Halo", "Legendary Creature — Angel Ally", "{3}{U}{R}{W}", { power: "5", toughness: "4", keywords: ["Scry","Flying","Vigilance","Haste","Convoke"], oracleText: "Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nFlying, vigilance, haste\nWhenever you cast another spell that has convoke, scry 2, then draw a card." });
const handOfThePraetors = card("Hand of the Praetors", "Creature — Phyrexian Zombie", "{3}{B}", { power: "3", toughness: "2", keywords: ["Infect"], oracleText: "Infect (This creature deals damage to creatures in the form of -1/-1 counters and to players in the form of poison counters.)\nOther creatures you control with infect get +1/+1.\nWhenever you cast a creature spell with infect, target player gets a poison counter." });
const chiefEngineer = card("Chief Engineer", "Creature — Vedalken Artificer", "{1}{U}", { power: "1", toughness: "3", oracleText: "Artifact spells you cast have convoke. (Your creatures can help cast those spells. Each creature you tap while casting an artifact spell pays for {1} or one mana of that creature's color.)" });
const icefangCoatl = card("Ice-Fang Coatl", "Snow Creature — Snake", "{G}{U}", { power: "1", toughness: "1", keywords: ["Flying","Flash"], oracleText: "Flash\nFlying\nWhen this creature enters, draw a card.\nThis creature has deathtouch as long as you control at least three other snow permanents." });
const svyelunOfSeaAndSky = card("Svyelun of Sea and Sky", "Legendary Creature — Merfolk God", "{1}{U}{U}", { power: "3", toughness: "4", oracleText: "Svyelun has indestructible as long as you control at least two other Merfolk.\nWhenever Svyelun attacks, draw a card.\nOther Merfolk you control have ward {1}. (Whenever another Merfolk you control becomes the target of a spell or ability an opponent controls, counter it unless that player pays {1}.)" });
const crewCaptain = card("Crew Captain", "Creature — Human Warrior", "{B}{R}{G}", { power: "4", toughness: "2", keywords: ["Haste"], oracleText: "Haste\nThis creature has indestructible as long as it entered this turn." });
const keldonStrikeTeam = card("Keldon Strike Team", "Creature — Human Warrior", "{2}{R}", { power: "3", toughness: "1", keywords: ["Kicker"], oracleText: "Kicker {1}{W} (You may pay an additional {1}{W} as you cast this spell.)\nWhen this creature enters, if it was kicked, create two 1/1 white Soldier creature tokens.\nAs long as this creature entered this turn, creatures you control have haste." });
const oculusWhelp = card("Oculus Whelp", "Creature — Phyrexian Dragon", "{3}{U}", { power: "3", toughness: "2", keywords: ["Flying","Transform"], oracleText: "Flying\nAs long as you control a transformed permanent, this creature has \"When this creature dies, draw a card.\"" });
const theJollyBalloonMan = card("The Jolly Balloon Man", "Legendary Creature — Human Clown", "{1}{R}{W}", { power: "1", toughness: "4", keywords: ["Haste"], oracleText: "Haste\n{1}, {T}: Create a token that's a copy of another target creature you control, except it's a 1/1 red Balloon creature in addition to its other colors and types and it has flying and haste. Sacrifice it at the beginning of the next end step. Activate only as a sorcery." });
const clingToDust = card("Cling to Dust", "Instant", "{B}", { keywords: ["Escape"], oracleText: "Exile target card from a graveyard. If it was a creature card, you gain 3 life. Otherwise, you draw a card.\nEscape—{3}{B}, Exile five other cards from your graveyard. (You may cast this card from your graveyard for its escape cost.)" });
const etherealAbsolution = card("Ethereal Absolution", "Enchantment", "{4}{W}{B}", { oracleText: "Creatures you control get +1/+1.\nCreatures your opponents control get -1/-1.\n{2}{W}{B}: Exile target card from an opponent's graveyard. If it was a creature card, you create a 1/1 white and black Spirit creature token with flying." });
const generalsEnforcer = card("General's Enforcer", "Creature — Human Soldier", "{W}{B}", { power: "2", toughness: "3", oracleText: "Legendary Humans you control have indestructible.\n{2}{W}{B}: Exile target card from a graveyard. If it was a creature card, create a 1/1 white Human Soldier creature token." });
const lionSash = card("Lion Sash", "Artifact Creature — Equipment Cat", "{1}{W}", { power: "1", toughness: "1", keywords: ["Reconfigure"], oracleText: "{W}: Exile target card from a graveyard. If it was a permanent card, put a +1/+1 counter on this permanent.\nEquipped creature gets +1/+1 for each +1/+1 counter on this Equipment.\nReconfigure {2} ({2}: Attach to target creature you control; or unattach from a creature. Reconfigure only as a sorcery. While attached, this isn't a creature.)" });
const purgingStormbrood = scry("adventure", [
  { name: "Purging Stormbrood", mana_cost: "{4}{B}", type_line: "Creature — Dragon", power: "4", toughness: "4", oracle_text: "Flying\nWard—Pay 2 life.\nWhen this creature enters, remove all counters from up to one target creature." },
  { name: "Absorb Essence", mana_cost: "{1}{W}", type_line: "Instant — Omen", oracle_text: "Target creature gets +2/+2 and gains lifelink and hexproof until end of turn. (Then shuffle this card into its owner's library.)" },
], { keywords: ["Flying","Ward"] });
const swarmIntelligence = card("Swarm Intelligence", "Enchantment", "{6}{U}", { oracleText: "Whenever you cast an instant or sorcery spell, you may copy that spell. You may choose new targets for the copy." });
const surlyBadgersaur = card("Surly Badgersaur", "Creature — Badger Dinosaur", "{3}{R}", { power: "3", toughness: "3", keywords: ["Treasure","Fight"], oracleText: "Whenever you discard a creature card, put a +1/+1 counter on this creature.\nWhenever you discard a land card, create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")\nWhenever you discard a noncreature, nonland card, this creature fights up to one target creature you don't control." });
const greenGoblinNemesis = card("Green Goblin, Nemesis", "Legendary Creature — Goblin Human Villain", "{2}{B}{R}", { power: "3", toughness: "3", keywords: ["Flying","Treasure"], oracleText: "Flying\nWhenever you discard a nonland card, put a +1/+1 counter on target Goblin you control.\nWhenever you discard a land card, create a tapped Treasure token." });
const wharfInfiltrator = card("Wharf Infiltrator", "Creature — Human Horror", "{1}{U}", { power: "1", toughness: "1", keywords: ["Skulk"], oracleText: "Skulk (This creature can't be blocked by creatures with greater power.)\nWhenever this creature deals combat damage to a player, you may draw a card. If you do, discard a card.\nWhenever you discard a creature card, you may pay {2}. If you do, create a 3/2 colorless Eldrazi Horror creature token." });
const roilingCanopy = card("Roiling Canopy", "Land", "", { oracleText: "This land enters tapped.\nWhenever a Forest you control enters, if you control at least five other Forests, target creature you control gets +3/+3 until end of turn.\n{T}: Add {G}." });
const shardmagesRescue = card("Shardmage's Rescue", "Enchantment — Aura", "{W}", { keywords: ["Enchant","Flash"], oracleText: "Flash\nEnchant creature you control\nAs long as this Aura entered this turn, enchanted creature has hexproof.\nEnchanted creature gets +1/+1." });
const eirduCarrierOfDawn = scry("transform", [
  { name: "Eirdu, Carrier of Dawn", mana_cost: "{3}{W}{W}", type_line: "Legendary Creature — Elemental God", power: "5", toughness: "5", oracle_text: "Flying, lifelink\nCreature spells you cast have convoke. (Your creatures can help cast those spells. Each creature you tap while casting a creature spell pays for {1} or one mana of that creature's color.)\nAt the beginning of your first main phase, you may pay {B}. If you do, transform Eirdu." },
  { name: "Isilu, Carrier of Twilight", type_line: "Legendary Creature — Elemental God", power: "5", toughness: "5", color_indicator: ["B"], oracle_text: "Flying, lifelink\nEach other nontoken creature you control has persist. (When it dies, if it had no -1/-1 counters on it, return it to the battlefield under its owner's control with a -1/-1 counter on it.)\nAt the beginning of your first main phase, you may pay {W}. If you do, transform Isilu." },
], { keywords: ["Flying","Lifelink","Transform"] });
const dazzlingTheater = scry("split", [
  { name: "Dazzling Theater", mana_cost: "{3}{W}", type_line: "Enchantment — Room", oracle_text: "Creature spells you cast have convoke. (Your creatures can help cast those spells. Each creature you tap while casting a creature spell pays for {1} or one mana of that creature's color.)\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)" },
  { name: "Prop Room", mana_cost: "{2}{W}", type_line: "Enchantment — Room", oracle_text: "Untap each creature you control during each other player's untap step.\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)" },
]);
const gishathSunsAvatar = card("Gishath, Sun's Avatar", "Legendary Creature — Dinosaur Avatar", "{5}{R}{G}{W}", { power: "7", toughness: "6", keywords: ["Vigilance","Haste","Trample"], oracleText: "Vigilance, trample, haste\nWhenever Gishath deals combat damage to a player, reveal that many cards from the top of your library. Put any number of Dinosaur creature cards from among them onto the battlefield and the rest on the bottom of your library in a random order." });
const elvishVatkeeper = card("Elvish Vatkeeper", "Creature — Phyrexian Elf", "{1}{B}{G}", { power: "3", toughness: "3", keywords: ["Incubate","Transform","Double"], oracleText: "When this creature enters, incubate 2. (Create an Incubator token with two +1/+1 counters on it and \"{2}: Transform this token.\" It transforms into a 0/0 Phyrexian artifact creature.)\n{5}: Transform target Incubator token you control. Double the number of +1/+1 counters on it." });
const seedpodCaretaker = card("Seedpod Caretaker", "Creature — Phyrexian Cleric", "{2}{W}", { power: "2", toughness: "2", keywords: ["Transform"], oracleText: "When this creature enters, choose one —\n• Put a +1/+1 counter on target artifact or creature you control.\n• Transform target Incubator token you control." });
const waxingMoon = card("Waxing Moon", "Instant", "{1}{G}", { keywords: ["Transform"], oracleText: "Transform up to one target Werewolf you control. Creatures you control gain trample until end of turn." });
const divertDisaster = card("Divert Disaster", "Instant", "{1}{U}", { oracleText: "Counter target spell unless its controller pays {2}. If they do, you create a Lander token. (It's an artifact with \"{2}, {T}, Sacrifice this token: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.\")" });
const dontMakeASound = card("Don't Make a Sound", "Instant", "{1}{U}", { keywords: ["Surveil"], oracleText: "Counter target spell unless its controller pays {2}. If they do, surveil 2. (Look at the top two cards of your library, then put any number of them into your graveyard and the rest on top of your library in any order.)" });
const crackedSkull = card("Cracked Skull", "Enchantment — Aura", "{2}{B}", { keywords: ["Enchant"], oracleText: "Enchant creature\nWhen this Aura enters, look at target player's hand. You may choose a nonland card from it. That player discards that card.\nWhen enchanted creature is dealt damage, destroy it." });
const extractTheTruth = card("Extract the Truth", "Sorcery", "{1}{B}", { oracleText: "Choose one —\n• Target opponent reveals their hand. You may choose a creature, enchantment, or planeswalker card from it. That player discards that card.\n• Target opponent sacrifices an enchantment of their choice." });
const nightsnare = card("Nightsnare", "Sorcery", "{3}{B}", { oracleText: "Target opponent reveals their hand. You may choose a nonland card from it. If you do, that player discards that card. If you don't, that player discards two cards." });
const reckonerShakedown = card("Reckoner Shakedown", "Sorcery", "{2}{B}", { oracleText: "Target opponent reveals their hand. You may choose a nonland card from it. If you do, that player discards that card. If you don't, put two +1/+1 counters on a creature or Vehicle you control." });
const concealingCurtains = scry("transform", [
  { name: "Concealing Curtains", mana_cost: "{B}", type_line: "Creature — Wall", power: "0", toughness: "4", oracle_text: "Defender\n{2}{B}: Transform this creature. Activate only as a sorcery." },
  { name: "Revealing Eye", type_line: "Creature — Eye Horror", power: "3", toughness: "4", color_indicator: ["B"], oracle_text: "Menace\nWhen this creature transforms into Revealing Eye, target opponent reveals their hand. You may choose a nonland card from it. If you do, that player discards that card, then draws a card." },
], { keywords: ["Transform","Menace","Defender"] });
const woodlandAcolyte = scry("adventure", [
  { name: "Woodland Acolyte", mana_cost: "{2}{W}", type_line: "Creature — Human Cleric", power: "2", toughness: "2", oracle_text: "When this creature enters, draw a card." },
  { name: "Mend the Wilds", mana_cost: "{G}", type_line: "Instant — Adventure", oracle_text: "Put target permanent card from your graveyard on top of your library. (Then exile this card. You may cast the creature later from exile.)" },
]);
const fireProphecy = card("Fire Prophecy", "Instant", "{1}{R}", { oracleText: "Fire Prophecy deals 3 damage to target creature. You may put a card from your hand on the bottom of your library. If you do, draw a card." });
const amassTheComponents = card("Amass the Components", "Sorcery", "{3}{U}", { oracleText: "Draw three cards, then put a card from your hand on the bottom of your library." });
const manholeMissile = card("Manhole Missile", "Instant", "{1}{R}", { oracleText: "Manhole Missile deals 3 damage to target creature. You may put a card from your hand on the bottom of your library. If you do, draw a card." });
const sawtoothLoon = card("Sawtooth Loon", "Creature — Bird", "{2}{W}{U}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, return a white or blue creature you control to its owner's hand.\nWhen this creature enters, draw two cards, then put two cards from your hand on the bottom of your library." });
const castIntoTheFire = card("Cast into the Fire", "Instant", "{1}{R}", { oracleText: "Choose one —\n• Cast into the Fire deals 1 damage to each of up to two target creatures.\n• Exile target artifact." });
const brineSeer = card("Brine Seer", "Creature — Human Wizard", "{3}{U}", { power: "1", toughness: "1", oracleText: "{2}{U}, {T}: Reveal any number of blue cards in your hand. Counter target spell unless its controller pays {1} for each card revealed this way." });
const ivySeer = card("Ivy Seer", "Creature — Elf Wizard", "{3}{G}", { power: "1", toughness: "1", oracleText: "{2}{G}, {T}: Reveal any number of green cards in your hand. Target creature gets +X/+X until end of turn, where X is the number of cards revealed this way." });
const jasmineSeer = card("Jasmine Seer", "Creature — Human Wizard", "{3}{W}", { power: "1", toughness: "1", oracleText: "{2}{W}, {T}: Reveal any number of white cards in your hand. You gain 2 life for each card revealed this way." });
const nightshadeSeer = card("Nightshade Seer", "Creature — Human Wizard", "{3}{B}", { power: "1", toughness: "1", oracleText: "{2}{B}, {T}: Reveal any number of black cards in your hand. Target creature gets -X/-X until end of turn, where X is the number of cards revealed this way." });
const scentOfBrine = card("Scent of Brine", "Instant", "{1}{U}", { oracleText: "Reveal any number of blue cards in your hand. Counter target spell unless its controller pays {1} for each card revealed this way." });
const scentOfIvy = card("Scent of Ivy", "Instant", "{G}", { oracleText: "Reveal any number of green cards in your hand. Target creature gets +X/+X until end of turn, where X is the number of cards revealed this way." });
const scentOfJasmine = card("Scent of Jasmine", "Instant", "{W}", { oracleText: "Reveal any number of white cards in your hand. You gain 2 life for each card revealed this way." });
const scentOfNightshade = card("Scent of Nightshade", "Instant", "{1}{B}", { oracleText: "Reveal any number of black cards in your hand. Target creature gets -X/-X until end of turn, where X is the number of cards revealed this way." });
const chooseYourWeapon = card("Choose Your Weapon", "Instant", "{2}{G}", { keywords: ["Double"], oracleText: "Choose one —\n• Two-Weapon Fighting — Double target creature's power and toughness until end of turn.\n• Archery — This spell deals 5 damage to target creature with flying." });
const epicFight = card("Epic Fight", "Sorcery", "{2}{G}", { keywords: ["Fight","Double"], oracleText: "Choose one or both —\n• Double target creature's power and toughness until end of turn.\n• Target creature you control fights target creature an opponent controls." });
const mightformHarmonizer = card("Mightform Harmonizer", "Creature — Insect Druid", "{2}{G}{G}", { power: "4", toughness: "4", keywords: ["Warp","Double","Landfall"], oracleText: "Landfall — Whenever a land you control enters, double the power of target creature you control until end of turn.\nWarp {2}{G} (You may cast this card from your hand for its warp cost. Exile this creature at the beginning of the next end step, then you may cast it from exile on a later turn.)" });
const nyleasColossus = card("Nylea's Colossus", "Enchantment Creature — Giant", "{6}{G}", { power: "6", toughness: "6", keywords: ["Double","Constellation"], oracleText: "Constellation — Whenever this creature or another enchantment you control enters, double target creature's power and toughness until end of turn." });
const oildeepGearhulk = card("Oildeep Gearhulk", "Artifact Creature — Construct", "{U}{U}{B}{B}", { power: "4", toughness: "4", keywords: ["Lifelink","Ward"], oracleText: "Lifelink, ward {1}\nWhen this creature enters, look at target player's hand. You may choose a card from it. If you do, that player discards that card, then draws a card." });
const glowsporeShaman = card("Glowspore Shaman", "Creature — Elf Shaman", "{B}{G}", { power: "3", toughness: "1", keywords: ["Mill"], oracleText: "When this creature enters, mill three cards. You may put a land card from your graveyard on top of your library. (To mill a card, put the top card of your library into your graveyard.)" });
const sequesteredStash = card("Sequestered Stash", "Land", "", { keywords: ["Mill"], oracleText: "{T}: Add {C}.\n{4}, {T}, Sacrifice this land: Mill five cards. Then you may put an artifact card from your graveyard on top of your library." });

const ALL = [scavengingOoze, eliteSpellbinder, scentOfCinder, cinderSeer, boneMiser, wasteNot, valakutTheMoltenPinnacle, bodyDouble, kaslaTheBrokenHalo, handOfThePraetors, chiefEngineer, icefangCoatl, svyelunOfSeaAndSky, crewCaptain, keldonStrikeTeam, oculusWhelp, theJollyBalloonMan, clingToDust, etherealAbsolution, generalsEnforcer, lionSash, purgingStormbrood, swarmIntelligence, surlyBadgersaur, greenGoblinNemesis, wharfInfiltrator, roilingCanopy, shardmagesRescue, eirduCarrierOfDawn, dazzlingTheater, gishathSunsAvatar, elvishVatkeeper, seedpodCaretaker, waxingMoon, divertDisaster, dontMakeASound, crackedSkull, extractTheTruth, nightsnare, reckonerShakedown, concealingCurtains, woodlandAcolyte, fireProphecy, amassTheComponents, manholeMissile, sawtoothLoon, castIntoTheFire, brineSeer, ivySeer, jasmineSeer, nightshadeSeer, scentOfBrine, scentOfIvy, scentOfJasmine, scentOfNightshade, chooseYourWeapon, epicFight, mightformHarmonizer, nyleasColossus, oildeepGearhulk, glowsporeShaman, sequesteredStash];

const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const inZone = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  s.players[pid]![zone].push(id);
  return id;
};
const tokens = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid).length;
const mindRot = card("Mind Rot", "Sorcery", "{2}{B}", { oracleText: "Target player discards two cards." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const redBear = bear({ name: "Red Bear", manaCost: "{1}{R}", colors: ["R"] });

describe("other cards from round 86", () => {
  it("compiles them", () => {
    for (const d of ALL) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Scavenging Ooze: a counter and 1 life only if the exiled card was a creature card", () => {
    const { s: s0, ap, opp } = setup([]);
    const ooze = putOnBattlefield(s0, ap, scavengingOoze);
    const dead = inZone(s0, opp, bear(), "graveyard");
    const land = inZone(s0, opp, mountain, "graveyard");
    const t = activate(structuredClone(s0), ap, ooze, 0, [target(land)]);
    expect(t.objects[land]!.zone).toBe("exile");
    expect(pt(t, ooze)).toBe("2/2");
    expect(t.players[ap]!.life).toBe(40);
    const s = activate(s0, ap, ooze, 0, [target(dead)]);
    expect(s.objects[dead]!.zone).toBe("exile");
    expect(pt(s, ooze)).toBe("3/3");
    expect(s.players[ap]!.life).toBe(41);
  });

  it("Scent of Cinder: X damage, X the number of red cards revealed", () => {
    const { s: s0, ap, ids, opp } = setup([scentOfCinder, redBear, redBear, bear()]);
    let s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", reveal: true, fromHand: true, min: 0 });
    if (s.pending?.kind !== "searchLibrary") throw new Error();
    expect([...s.pending.cards].sort()).toEqual([ids[1]!, ids[2]!].sort());
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ids[1]!, ids[2]!] }));
    expect(s.players[opp]!.life).toBe(38);
    expect(s.players[ap]!.hand).toEqual(expect.arrayContaining([ids[1]!, ids[2]!]));
  });

  it("Bone Miser: a Zombie for a creature card, a card for a noncreature, nonland card", () => {
    const { s: s0, ap, ids } = setup([mindRot, bear(), shock]);
    putOnBattlefield(s0, ap, boneMiser);
    let s = cast(s0, ap, ids[0]!, [{ kind: "player", id: ap }]);
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 2 });
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "discard", player: ap, objectIds: [ids[1]!, ids[2]!] }));
    expect(tokens(s, ap)).toBe(1);
    expect(s.players[ap]!.hand.length).toBe(hand - 2 + 1);
  });

  it("Waste Not: a Zombie when an opponent discards a creature card, not when you do", () => {
    const { s: s0, ap, ids, opp } = setup([mindRot]);
    putOnBattlefield(s0, ap, wasteNot);
    const theirs = [inZone(s0, opp, bear(), "hand"), inZone(s0, opp, shock, "hand")];
    let s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(s.pending).toMatchObject({ kind: "discard", player: opp, count: 2 });
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "discard", player: opp, objectIds: theirs }));
    expect(tokens(s, ap)).toBe(1);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("Valakut, the Molten Pinnacle: only when you control at least five other Mountains", () => {
    const { s: s0, ap, ids, opp } = setup([mountain]);
    putOnBattlefield(s0, ap, valakutTheMoltenPinnacle);
    putOnBattlefield(s0, ap, mountain); // 4 other Mountains
    const four = settle(act(structuredClone(s0), { type: "playLand", player: ap, objectId: ids[0]! }));
    expect(four.pending).toBeFalsy();
    expect(four.stack.length).toBe(0);
    putOnBattlefield(s0, ap, mountain); // 5 other Mountains
    let s = settle(act(s0, { type: "playLand", player: ap, objectId: ids[0]! }));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.players[opp]!.life).toBe(37);
  });

  it("Body Double: may enter as a copy of a creature card in any graveyard", () => {
    const { s: s0, ap, ids, opp } = setup([bodyDouble]);
    const dead = inZone(s0, opp, bear({ name: "Dead Bear" }), "graveyard");
    let s = cast(s0, ap, ids[0]!);
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copy" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: dead }));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(pt(s, ids[0]!)).toBe("2/2");
    expect(s.objects[dead]!.zone).toBe("graveyard");
  });

  it("Kasla, the Broken Halo: another spell with convoke scries 2 and draws; a spell without it doesn't", () => {
    const { s: s0, ap, ids, opp } = setup([card("Stoke the Flames", "Instant", "{2}{R}{R}", { keywords: ["Convoke"], oracleText: "Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nStoke the Flames deals 4 damage to any target." }), shock]);
    putOnBattlefield(s0, ap, kaslaTheBrokenHalo);
    const t = settle(cast(structuredClone(s0), ap, ids[1]!, [{ kind: "player", id: opp }]));
    expect(t.pending).toBeFalsy();
    let s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap });
  });

  it("Hand of the Praetors: a poison counter when you cast a creature spell with infect", () => {
    const { s: s0, ap, ids, opp } = setup([card("Plague Stinger", "Creature — Phyrexian Insect Horror", "{1}{B}", { power: "1", toughness: "1", keywords: ["Flying", "Infect"], oracleText: "Flying\nInfect (This creature deals damage to creatures in the form of -1/-1 counters and to players in the form of poison counters.)" }), bear()]);
    putOnBattlefield(s0, ap, handOfThePraetors);
    const t = settle(cast(structuredClone(s0), ap, ids[1]!));
    expect(t.pending).toBeFalsy();
    let s = cast(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.poison).toBe(1);
  });

  it("Oildeep Gearhulk: you may choose a card from a player's hand; that player discards it, then draws", () => {
    const { s: s0, ap, ids, opp } = setup([oildeepGearhulk]);
    const theirs = inZone(s0, opp, bear(), "hand");
    let s = cast(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", min: 0, max: 1, hand: opp });
    const hand = s.players[opp]!.hand.length;
    const none = settle(act(structuredClone(s), { type: "searchLibrary", player: ap, found: [] }));
    expect(none.players[opp]!.hand.length).toBe(hand);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [theirs] }));
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.players[opp]!.hand.length).toBe(hand);
  });

  it("Mend the Wilds puts a permanent card from your graveyard on top of your library", () => {
    const { s: s0, ap, ids } = setup([woodlandAcolyte]);
    const dead = inZone(s0, ap, bear({ name: "Dead Bear" }), "graveyard");
    const plan = planCast(s0, ap, ids[0]!, [target(dead)], undefined, undefined, undefined, { face: 1 })!;
    let s = s0;
    for (const a of plan) s = act(s, a);
    s = settle(s);
    expect(s.players[ap]!.library[0]).toBe(dead);
  });
});
