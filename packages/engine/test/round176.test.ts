// Round 176: the most played cards still unsupported, in popularity order, from Bristlebud Farmer (rank 8,594) on, and
// the cards that share their mechanics.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, scry, setup } from "./helpers";
import { characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, parseManaCost, planActivate, planCast, planMana, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Says yes (or no) to a "you may" question, paying its mana first. */
const may = (s: GameState, yes: boolean) => {
  if (s.pending?.kind !== "chooseMay") throw new Error("no question");
  const pid = s.pending.player;
  if (yes && s.pending.pay?.mana) for (const a of planMana(s, pid, parseManaCost(s.pending.pay.mana))!) s = act(s, a);
  return act(s, { type: "chooseMay", player: pid, yes });
};
/** Everyone passes until the stack is empty; "you may" questions get `yes`. Stops at any other question. */
const resolveAll = (s: GameState, yes = true) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending?.kind === "chooseMay"); i++) {
    if (s.pending?.kind === "chooseMay") s = may(s, yes);
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** A card put straight into a zone, not from the battlefield. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else if (zone !== "exile") s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && [name, `${name} Token`].includes(characteristics(s, s.objects[id]!).name));
const counters = (s: GameState, id: string, c = "+1/+1") => s.objects[id]!.counters[c] ?? 0;
const kw = (s: GameState, id: string, k: string) => objHasKeyword(s, s.objects[id]!, k);
const option = (s: GameState, pid: PlayerId, choice: string) => act(s, { type: "chooseOption", player: pid, choice });
const black = card("Night Bear", "Creature — Bear", "{1}{B}", { cmc: 2, power: "2", toughness: "2", colors: ["B"] });
const vampire = card("Bat Lord", "Creature — Vampire", "{1}{B}", { cmc: 2, power: "2", toughness: "2", colors: ["B"] });
const ally = card("Pal", "Creature — Human Ally", "{1}{R}", { cmc: 2, power: "2", toughness: "2" });
const wolf = card("Pup", "Creature — Wolf", "{1}{G}", { cmc: 2, power: "2", toughness: "2" });
const giantGrowth = card("Giant Growth", "Instant", "{G}", { cmc: 1, oracleText: "Target creature gets +3/+3 until end of turn." });
const sprout = card("Sprout", "Sorcery", "{G}", { cmc: 1, oracleText: "Create a 1/1 green Saproling creature token." });
const shock = card("Shock", "Instant", "{R}", { cmc: 1, oracleText: "Shock deals 2 damage to any target." });

// Real oracle text (Scryfall).
const bristlebudFarmer = card("Bristlebud Farmer", "Creature — Plant Druid", "{2}{G}{G}", {cmc: 4,"power":"5","toughness":"5","keywords":["Food","Trample","Mill"],"oracleText":"Trample\nWhen this creature enters, create two Food tokens. (They're artifacts with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\nWhenever this creature attacks, you may sacrifice a Food. If you do, mill three cards. You may put a permanent card from among them into your hand."});
const kelsienThePlague = card("Kelsien, the Plague", "Legendary Creature — Human Assassin", "{R}{W}{B}", {cmc: 3,"power":"2","toughness":"2","keywords":["Vigilance","Haste"],"oracleText":"Vigilance, haste\nKelsien gets +1/+1 for each experience counter you have.\n{T}: Kelsien deals 1 damage to target creature you don't control. When that creature dies this turn, you get an experience counter."});
const runeOfMight = card("Rune of Might", "Enchantment — Aura Rune", "{1}{G}", {cmc: 2,"keywords":["Enchant"],"oracleText":"Enchant permanent\nWhen this Aura enters, draw a card.\nAs long as enchanted permanent is a creature, it gets +1/+1 and has trample.\nAs long as enchanted permanent is an Equipment, it has \"Equipped creature gets +1/+1 and has trample.\""});
const runeOfMortality = card("Rune of Mortality", "Enchantment — Aura Rune", "{1}{B}", {cmc: 2,"keywords":["Enchant"],"oracleText":"Enchant permanent\nWhen this Aura enters, draw a card.\nAs long as enchanted permanent is a creature, it has deathtouch.\nAs long as enchanted permanent is an Equipment, it has \"Equipped creature has deathtouch.\""});
const runeOfSpeed = card("Rune of Speed", "Enchantment — Aura Rune", "{1}{R}", {cmc: 2,"keywords":["Enchant"],"oracleText":"Enchant permanent\nWhen this Aura enters, draw a card.\nAs long as enchanted permanent is a creature, it gets +1/+0 and has haste.\nAs long as enchanted permanent is an Equipment, it has \"Equipped creature gets +1/+0 and has haste.\""});
const runeOfFlight = card("Rune of Flight", "Enchantment — Aura Rune", "{1}{U}", {cmc: 2,"keywords":["Enchant"],"oracleText":"Enchant permanent\nWhen this Aura enters, draw a card.\nAs long as enchanted permanent is a creature, it has flying.\nAs long as enchanted permanent is an Equipment, it has \"Equipped creature has flying.\""});
const runeOfSustenance = card("Rune of Sustenance", "Enchantment — Aura Rune", "{1}{W}", {cmc: 2,"keywords":["Enchant"],"oracleText":"Enchant permanent\nWhen this Aura enters, draw a card.\nAs long as enchanted permanent is a creature, it has lifelink.\nAs long as enchanted permanent is an Equipment, it has \"Equipped creature has lifelink.\""});
const greatHallOfTheBiblioplex = card("Great Hall of the Biblioplex", "Land", "", {cmc: 0,"oracleText":"{T}: Add {C}.\n{T}, Pay 1 life: Add one mana of any color. Spend this mana only to cast an instant or sorcery spell.\n{5}: If this land isn't a creature, it becomes a 2/4 Wizard creature with \"Whenever you cast an instant or sorcery spell, this creature gets +1/+0 until end of turn.\" It's still a land."});
const answeredPrayers = card("Answered Prayers", "Enchantment", "{1}{W}{W}", {cmc: 3,"oracleText":"Whenever a creature you control enters, you gain 1 life. If this enchantment isn't a creature, it becomes a 3/3 Angel creature with flying in addition to its other types until end of turn."});
const ironManArmor = card("Iron Man Armor", "Artifact — Equipment", "{3}", {cmc: 3,"keywords":["Equip"],"oracleText":"When this Equipment enters, attach it to target creature you control.\nEquipped creature gets +2/+1 and has flying.\n{2}: If this Equipment isn't a creature, it becomes a 0/0 Construct Hero artifact creature with flying and \"This creature gets +1/+1 for each artifact you control\" until end of turn.\nEquip {2}"});
const tawnossTinkering = card("Tawnos's Tinkering", "Instant", "{3}{G}", {cmc: 4,"oracleText":"Put two +1/+1 counters on target artifact, creature, or land you control. Untap that permanent. If it isn't a creature, it becomes a 0/0 creature in addition to its other types."});
const donatelloGadgetMaster = card("Donatello, Gadget Master", "Legendary Creature — Mutant Ninja Turtle", "{2}{U}", {cmc: 3,"power":"3","toughness":"2","keywords":["Sneak"],"oracleText":"Sneak {1}{U} (You may cast this spell for {1}{U} if you also return an unblocked attacker you control to hand during the declare blockers step. He enters tapped and attacking.)\nWhenever Donatello deals combat damage to a player, create a token that's a copy of target artifact you control."});
const questingDruidSeekTheBeast = scry("adventure", [{ name: "Questing Druid", mana_cost: "{1}{G}", type_line: "Creature — Human Druid", oracle_text: "Whenever you cast a spell that's white, blue, black, or red, put a +1/+1 counter on this creature.", power: "1", toughness: "1" }, { name: "Seek the Beast", mana_cost: "{1}{R}", type_line: "Instant — Adventure", oracle_text: "Exile the top two cards of your library. Until your next end step, you may play those cards." }]);
const worldslayer = card("Worldslayer", "Artifact — Equipment", "{5}", {cmc: 5,"keywords":["Equip"],"oracleText":"Whenever equipped creature deals combat damage to a player, destroy all permanents other than this Equipment.\nEquip {5} ({5}: Attach to target creature you control. Equip only as a sorcery.)"});
const progenitorExarch = card("Progenitor Exarch", "Creature — Phyrexian Cat Cleric", "{X}{X}{W}", {cmc: 1,"power":"1","toughness":"2","keywords":["Incubate","Transform"],"oracleText":"When this creature enters, incubate 3 X times. (To incubate 3, create an Incubator token with three +1/+1 counters on it and \"{2}: Transform this token.\" It transforms into a 0/0 Phyrexian artifact creature.)\n{T}: Transform target Incubator token you control."});
const divinerOfMist = card("Diviner of Mist", "Creature — Dragon", "{4}{U}", {cmc: 5,"power":"4","toughness":"5","keywords":["Flying","Mill"],"oracleText":"Flying\nWhenever this creature attacks, mill four cards. You may cast an instant or sorcery spell from your graveyard with mana value 4 or less without paying its mana cost. If that spell would be put into your graveyard, exile it instead."});
const anjeFalkenrath = card("Anje Falkenrath", "Legendary Creature — Vampire", "{1}{B}{R}", {cmc: 3,"power":"1","toughness":"3","keywords":["Haste"],"oracleText":"Haste\n{T}, Discard a card: Draw a card.\nWhenever you discard a card, if it has madness, untap Anje Falkenrath."});
const uniteTheCoalition = card("Unite the Coalition", "Instant", "{2}{W}{U}{B}{R}{G}", {cmc: 7,"oracleText":"Choose five. You may choose the same mode more than once.\n• Target permanent phases out.\n• Target player draws a card.\n• Exile target player's graveyard.\n• Unite the Coalition deals 2 damage to any target.\n• Destroy target artifact or enchantment."});
const planewideCelebration = card("Planewide Celebration", "Sorcery", "{5}{G}{G}", {cmc: 7,"keywords":["Proliferate"],"oracleText":"Choose four. You may choose the same mode more than once.\n• Create a 2/2 Citizen creature token that's all colors.\n• Return target permanent card from your graveyard to your hand.\n• Proliferate.\n• You gain 4 life."});
const zedruuTheGreathearted = card("Zedruu the Greathearted", "Legendary Creature — Minotaur Monk", "{1}{U}{R}{W}", {cmc: 4,"power":"2","toughness":"4","oracleText":"At the beginning of your upkeep, you gain X life and draw X cards, where X is the number of permanents you own that your opponents control.\n{U}{R}{W}: Target opponent gains control of target permanent you control."});
const lotuslightDancers = card("Lotuslight Dancers", "Creature — Zombie Bard", "{2}{B}{G}{U}", {cmc: 5,"power":"3","toughness":"6","keywords":["Lifelink"],"oracleText":"Lifelink\nWhen this creature enters, search your library for a black card, a green card, and a blue card. Put those cards into your graveyard, then shuffle."});
const dreamEater = card("Dream Eater", "Creature — Nightmare Sphinx", "{4}{U}{U}", {cmc: 6,"power":"4","toughness":"3","keywords":["Flying","Surveil","Flash"],"oracleText":"Flash\nFlying\nWhen this creature enters, surveil 4. When you do, you may return target nonland permanent an opponent controls to its owner's hand. (To surveil 4, look at the top four cards of your library, then put any number of them into your graveyard and the rest on top of your library in any order.)"});
const chandraFlamecaller = card("Chandra, Flamecaller", "Legendary Planeswalker — Chandra", "{4}{R}{R}", {cmc: 6,"loyalty":"4","oracleText":"+1: Create two 3/1 red Elemental creature tokens with haste. Exile them at the beginning of the next end step.\n0: Discard all the cards in your hand, then draw that many cards plus one.\n−X: Chandra deals X damage to each creature."});
const everwatchingThreshold = card("Ever-Watching Threshold", "Enchantment", "{2}{U}", {cmc: 3,"oracleText":"Whenever an opponent attacks, if they attacked you and/or a planeswalker you control, draw a card."});
const bondersOrnament = card("Bonder's Ornament", "Artifact", "{3}", {cmc: 3,"oracleText":"{T}: Add one mana of any color.\n{4}, {T}: Each player who controls a permanent named Bonder's Ornament draws a card."});
const alphaStatus = card("Alpha Status", "Enchantment — Aura", "{2}{G}", {cmc: 3,"keywords":["Enchant"],"oracleText":"Enchant creature\nEnchanted creature gets +2/+2 for each other creature on the battlefield that shares a creature type with it."});
const swallowedByLeviathan = card("Swallowed by Leviathan", "Instant", "{2}{U}", {cmc: 3,"keywords":["Surveil"],"oracleText":"Choose target spell. Surveil 2, then counter the chosen spell unless its controller pays {1} for each card in your graveyard. (To surveil 2, look at the top two cards of your library, then put any number of them into your graveyard and the rest on top of your library in any order.)"});
const faeOffering = card("Fae Offering", "Enchantment", "{2}{G}", {cmc: 3,"keywords":["Treasure","Food"],"oracleText":"At the beginning of each end step, if you've cast both a creature spell and a noncreature spell this turn, create a Clue token, a Food token, and a Treasure token."});
const deathTyrant = card("Death Tyrant", "Creature — Beholder Skeleton", "{4}{B}", {cmc: 5,"power":"4","toughness":"6","keywords":["Menace"],"oracleText":"Menace\nNegative Energy Cone — Whenever an attacking creature you control or a blocking creature an opponent controls dies, create a 2/2 black Zombie creature token.\n{5}{B}: Return this card from your graveyard to the battlefield tapped."});
const silverfurPartisan = card("Silverfur Partisan", "Creature — Wolf Warrior", "{2}{G}", {cmc: 3,"power":"2","toughness":"2","keywords":["Trample"],"oracleText":"Trample\nWhenever a Wolf or Werewolf you control becomes the target of an instant or sorcery spell, create a 2/2 green Wolf creature token."});
const wildDefiance = card("Wild Defiance", "Enchantment", "{2}{G}", {cmc: 3,"oracleText":"Whenever a creature you control becomes the target of an instant or sorcery spell, that creature gets +3/+3 until end of turn."});
const taintedIndulgence = card("Tainted Indulgence", "Instant", "{U}{B}", {cmc: 2,"oracleText":"Draw two cards. Then discard a card unless there are five or more mana values among cards in your graveyard."});
const theTabernacleAtPendrellVale = card("The Tabernacle at Pendrell Vale", "Legendary Land", "", {cmc: 0,"oracleText":"All creatures have \"At the beginning of your upkeep, destroy this creature unless you pay {1}.\""});
const publicThoroughfare = card("Public Thoroughfare", "Land", "", {cmc: 0,"oracleText":"This land enters tapped.\nWhen this land enters, sacrifice it unless you tap an untapped artifact or land you control.\n{T}: Add one mana of any color."});
const fearFireFoes = card("Fear, Fire, Foes!", "Sorcery", "{X}{R}", {cmc: 1,"oracleText":"Damage can't be prevented this turn. Fear, Fire, Foes! deals X damage to target creature and 1 damage to each other creature with the same controller."});
const scroungingBandar = card("Scrounging Bandar", "Creature — Cat Monkey", "{1}{G}", {cmc: 2,"power":"0","toughness":"0","oracleText":"This creature enters with two +1/+1 counters on it.\nAt the beginning of your upkeep, you may move any number of +1/+1 counters from this creature onto another target creature."});
const malboro = card("Malboro", "Creature — Plant Horror", "{4}{B}{B}", {cmc: 6,"power":"4","toughness":"4","keywords":["Landcycling","Bad Breath","Typecycling","Cycling","Swampcycling"],"oracleText":"Bad Breath — When this creature enters, each opponent discards a card, loses 2 life, and exiles the top three cards of their library.\nSwampcycling {2} ({2}, Discard this card: Search your library for a Swamp card, reveal it, put it into your hand, then shuffle.)"});
const kothophedSoulHoarder = card("Kothophed, Soul Hoarder", "Legendary Creature — Demon", "{4}{B}{B}", {cmc: 6,"power":"6","toughness":"6","keywords":["Flying"],"oracleText":"Flying\nWhenever a permanent owned by another player is put into a graveyard from the battlefield, you draw a card and you lose 1 life."});
const argentDais = card("Argent Dais", "Artifact", "{1}{W}", {cmc: 2,"oracleText":"This artifact enters with two oil counters on it.\nWhenever two or more creatures attack, put an oil counter on this artifact.\n{2}, {T}, Remove two oil counters from this artifact: Exile another target nonland permanent. Its controller draws two cards."});
const propagatorDrone = card("Propagator Drone", "Creature — Eldrazi Drone", "{1}{G}", {cmc: 2,"power":"2","toughness":"2","keywords":["Devoid"],"oracleText":"Devoid (This card has no color.)\nCreature tokens you control have evolve. (They have \"Whenever a creature you control enters, if it has greater power or toughness than this token, put a +1/+1 counter on this token.\" They see this creature enter.)\n{3}{G}: Create a 0/1 colorless Eldrazi Spawn creature token with \"Sacrifice this token: Add {C}.\""});
const elderArthurMaxson = card("Elder Arthur Maxson", "Legendary Creature — Human Knight", "{1}{W}{B}", {cmc: 3,"power":"4","toughness":"2","keywords":["Blind Betrayal"],"oracleText":"Creature tokens you control have training. (Whenever a creature token you control attacks with another creature with greater power, put a +1/+1 counter on that token.)\nBlind Betrayal — Sacrifice another creature: Elder Arthur Maxson gains indestructible until end of turn."});
const tyranidPrime = card("Tyranid Prime", "Creature — Tyranid", "{1}{G}{U}", {cmc: 3,"power":"0","toughness":"4","keywords":["Evolve","Synapse Creature"],"oracleText":"Evolve (Whenever a creature you control enters, if that creature has greater power or toughness than this creature, put a +1/+1 counter on this creature.)\nSynapse Creature — Other creatures you control have evolve."});
const warriorsResolve = card("Warrior's Resolve", "Enchantment", "{2}{W}", {cmc: 3,"oracleText":"Creatures you control have training. (Whenever a creature you control attacks with another creature with greater power, put a +1/+1 counter on the creature with lesser power.)\nAt the beginning of your end step, if you control a creature with a +1/+1 counter on it that attacked this turn, draw a card."});
const vampireNocturnus = card("Vampire Nocturnus", "Creature — Vampire", "{1}{B}{B}{B}", {cmc: 4,"power":"3","toughness":"3","oracleText":"Play with the top card of your library revealed.\nAs long as the top card of your library is black, this creature and other Vampire creatures you control get +2/+1 and have flying."});
const mulDayaChannelers = card("Mul Daya Channelers", "Creature — Elf Druid Shaman", "{1}{G}{G}", {cmc: 3,"power":"2","toughness":"2","oracleText":"Play with the top card of your library revealed.\nAs long as the top card of your library is a creature card, this creature gets +3/+3.\nAs long as the top card of your library is a land card, this creature has \"{T}: Add two mana of any one color.\""});
const lluwenImperfectNaturalist = card("Lluwen, Imperfect Naturalist", "Legendary Creature — Elf Druid", "{B/G}{B/G}", {cmc: 2,"power":"1","toughness":"3","keywords":["Mill"],"oracleText":"When Lluwen enters, mill four cards, then you may put a creature or land card from among the milled cards on top of your library.\n{2}{B/G}{B/G}{B/G}, {T}, Discard a land card: Create a 1/1 black and green Worm creature token for each land card in your graveyard."});
const wartimeProtestors = card("Wartime Protestors", "Creature — Human Rebel Ally", "{3}{R}", {cmc: 4,"power":"4","toughness":"4","keywords":["Haste"],"oracleText":"Haste\nWhenever another Ally you control enters, put a +1/+1 counter on that creature and it gains haste until end of turn."});
const hornedLochwhaleLagoonBreach = scry("adventure", [{ name: "Horned Loch-Whale", mana_cost: "{4}{U}{U}", type_line: "Creature — Whale", oracle_text: "Flash\nWard {2}\nThis creature enters tapped unless it's your turn.", power: "6", toughness: "6" }, { name: "Lagoon Breach", mana_cost: "{1}{U}", type_line: "Instant — Adventure", oracle_text: "The owner of target attacking creature you don't control puts it on their choice of the top or bottom of their library." }], { keywords: ["Flash", "Ward"] });
const sinkholeSurveyor = card("Sinkhole Surveyor", "Creature — Bird Scout", "{1}{B}", {cmc: 2,"power":"1","toughness":"3","keywords":["Endure","Flying"],"oracleText":"Flying\nWhenever this creature attacks, you lose 1 life and this creature endures 1. (Put a +1/+1 counter on it or create a 1/1 white Spirit creature token.)"});
const haliyaAscendantCadet = card("Haliya, Ascendant Cadet", "Legendary Creature — Human Soldier", "{2}{G}{W}{W}", {cmc: 5,"power":"3","toughness":"3","oracleText":"Whenever Haliya enters or attacks, put a +1/+1 counter on target creature you control.\nWhenever one or more creatures you control with +1/+1 counters on them deal combat damage to a player, draw a card."});
const realmSeekers = card("Realm Seekers", "Creature — Elf Scout", "{4}{G}{G}", {cmc: 6,"power":"0","toughness":"0","oracleText":"This creature enters with X +1/+1 counters on it, where X is the total number of cards in all players' hands.\n{2}{G}, Remove a +1/+1 counter from this creature: Search your library for a land card, reveal it, put it into your hand, then shuffle."});
const realityHeist = card("Reality Heist", "Instant", "{5}{U}{U}", {cmc: 7,"keywords":["Affinity"],"oracleText":"Affinity for artifacts (This spell costs {1} less to cast for each artifact you control.)\nLook at the top seven cards of your library. You may reveal up to two artifact cards from among them and put them into your hand. Put the rest on the bottom of your library in a random order."});

describe("Round 176 cards", () => {
  it("are fully supported", () =>
    supported(bristlebudFarmer, kelsienThePlague, runeOfMight, runeOfMortality, runeOfSpeed, runeOfFlight, runeOfSustenance, greatHallOfTheBiblioplex, answeredPrayers, ironManArmor, tawnossTinkering, donatelloGadgetMaster, questingDruidSeekTheBeast, worldslayer, progenitorExarch, divinerOfMist, anjeFalkenrath, uniteTheCoalition, planewideCelebration, zedruuTheGreathearted, lotuslightDancers, dreamEater, chandraFlamecaller, everwatchingThreshold, bondersOrnament, alphaStatus, swallowedByLeviathan, faeOffering, deathTyrant, silverfurPartisan, wildDefiance, taintedIndulgence, theTabernacleAtPendrellVale, publicThoroughfare, fearFireFoes, scroungingBandar, malboro, kothophedSoulHoarder, argentDais, propagatorDrone, elderArthurMaxson, tyranidPrime, warriorsResolve, vampireNocturnus, mulDayaChannelers, lluwenImperfectNaturalist, wartimeProtestors, hornedLochwhaleLagoonBreach, sinkholeSurveyor, haliyaAscendantCadet, realmSeekers, realityHeist));
});

describe("the top card of your library", () => {
  it("Vampire Nocturnus: ~ and other Vampires get +2/+1 and flying while the top card is black", () => {
    const { s, ap } = setup([]);
    const v = putOnBattlefield(s, ap, vampireNocturnus);
    const bat = putOnBattlefield(s, ap, vampire);
    const b = putOnBattlefield(s, ap, bear());
    into(s, ap, bear(), "library");
    expect(pt(s, v)).toBe("3/3");
    expect(kw(s, v, "Flying")).toBe(false);
    into(s, ap, black, "library");
    expect(pt(s, v)).toBe("5/4");
    expect(pt(s, bat)).toBe("4/3");
    expect(kw(s, bat, "Flying")).toBe(true);
    expect(pt(s, b)).toBe("2/2");
    // The order changes without anything else changing (a scry, a shuffle): the bonus follows the new top card.
    const lib = s.players[ap]!.library;
    [lib[0], lib[1]] = [lib[1]!, lib[0]!];
    expect(pt(s, v)).toBe("3/3");
    expect(kw(s, bat, "Flying")).toBe(false);
  });
  it("Mul Daya Channelers gets +3/+3 while the top card is a creature card", () => {
    const { s, ap } = setup([]);
    const m = putOnBattlefield(s, ap, mulDayaChannelers);
    into(s, ap, bear(), "library");
    expect(pt(s, m)).toBe("5/5");
    into(s, ap, card("Forest", "Basic Land — Forest", "", { cmc: 0 }), "library");
    expect(pt(s, m)).toBe("2/2");
  });
});

describe("Kelsien, the Plague", () => {
  it("gets an experience counter when the creature it damaged dies this turn", () => {
    let { s, ap, opp } = setup([]);
    const k = putOnBattlefield(s, ap, kelsienThePlague);
    const foe = putOnBattlefield(s, opp, bear({ toughness: "1" }));
    s = resolveAll(run(s, planActivate(s, ap, k, 0, [tgt(foe)])));
    expect(zone(s, foe)).toBe("graveyard");
    expect(s.players[ap]!.experience).toBe(1);
    expect(pt(s, k)).toBe("3/3");
    const tough = putOnBattlefield(s, opp, bear());
    s.objects[k]!.tapped = false;
    s = resolveAll(run(s, planActivate(s, ap, k, 0, [tgt(tough)])));
    expect(zone(s, tough)).toBe("battlefield");
    expect(s.players[ap]!.experience).toBe(1);
  });
});

describe("Runes on an Equipment", () => {
  it("Rune of Might on an Equipment gives the equipped creature +1/+1 and trample; on a creature, the creature itself", () => {
    let { s, ap, ids } = setup([runeOfMight, runeOfMight]);
    const b = putOnBattlefield(s, ap, bear());
    const eq = putOnBattlefield(s, ap, card("Short Sword", "Artifact — Equipment", "{1}", { cmc: 1, oracleText: "Equipped creature gets +1/+1.\nEquip {1}" }));
    s.objects[eq]!.attachedTo = b;
    invalidateCharacteristics(s);
    expect(pt(s, b)).toBe("3/3");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(eq)])));
    expect(pt(s, b)).toBe("4/4");
    expect(kw(s, b, "Trample")).toBe(true);
    const other = putOnBattlefield(s, ap, bear());
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(other)])));
    expect(pt(s, other)).toBe("3/3");
    expect(kw(s, other, "Trample")).toBe(true);
  });
});

describe("If ~ isn't a creature, it becomes ...", () => {
  it("Great Hall of the Biblioplex becomes a 2/4 Wizard once, and is still a land", () => {
    let { s, ap } = setup([]);
    const h = putOnBattlefield(s, ap, greatHallOfTheBiblioplex);
    s = resolveAll(run(s, planActivate(s, ap, h, 0)));
    let c = characteristics(s, s.objects[h]!);
    expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(c.subtypes).toContain("Wizard");
    expect(pt(s, h)).toBe("2/4");
    const effects = s.effects.length;
    s = resolveAll(run(s, planActivate(s, ap, h, 0)));
    expect(s.effects.length).toBe(effects);
    c = characteristics(s, s.objects[h]!);
    expect(c.types).toContain("Land");
  });
  it("Answered Prayers becomes a 3/3 Angel the first time a creature enters this turn, and you gain life each time", () => {
    let { s, ap, ids } = setup([bear(), bear()]);
    const a = putOnBattlefield(s, ap, answeredPrayers);
    const life = s.players[ap]!.life;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.players[ap]!.life).toBe(life + 1);
    expect(pt(s, a)).toBe("3/3");
    expect(kw(s, a, "Flying")).toBe(true);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(s.players[ap]!.life).toBe(life + 2);
    expect(pt(s, a)).toBe("3/3");
  });
  it("Tawnos's Tinkering makes a land a 0/0 creature with two +1/+1 counters, untapped", () => {
    let { s, ap, ids } = setup([tawnossTinkering]);
    const land = s.battlefield.find((id) => characteristics(s, s.objects[id]!).name === "Swamp")!;
    s.objects[land]!.tapped = true;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(land)])));
    expect(s.objects[land]!.tapped).toBe(false);
    expect(characteristics(s, s.objects[land]!).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(pt(s, land)).toBe("2/2");
  });
});

describe("Progenitor Exarch", () => {
  it("incubates 3 X times", () => {
    let { s, ap, ids } = setup([progenitorExarch]);
    const plan = planCast(s, ap, ids[0]!, undefined, undefined, undefined, 2);
    s = resolveAll(run(s, plan));
    const incubators = named(s, ap, "Incubator");
    expect(incubators.length).toBe(2);
    for (const i of incubators) expect(counters(s, i)).toBe(3);
  });
});

describe("modes chosen more than once", () => {
  it("Unite the Coalition deals 2 damage five times", () => {
    let { s, ap, ids, opp } = setup([uniteTheCoalition]);
    const life = s.players[opp]!.life;
    const t = { kind: "player" as const, id: opp };
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [t, t, t, t, t], [3, 3, 3, 3, 3])));
    expect(s.players[opp]!.life).toBe(life - 10);
  });
  it("Planewide Celebration: gain 4 life four times", () => {
    let { s, ap, ids } = setup([planewideCelebration]);
    const life = s.players[ap]!.life;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [], [3, 3, 3, 3])));
    expect(s.players[ap]!.life).toBe(life + 16);
  });
});

describe("Zedruu the Greathearted", () => {
  it("counts the permanents you own that your opponents control", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, zedruuTheGreathearted);
    const gift = putOnBattlefield(s, opp, bear());
    s.objects[gift]!.owner = ap;
    const gift2 = putOnBattlefield(s, opp, bear());
    s.objects[gift2]!.owner = ap;
    putOnBattlefield(s, opp, bear());
    invalidateCharacteristics(s);
    s = passUntil(s, "upkeep", ap);
    const life = s.players[ap]!.life;
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(s);
    expect(s.players[ap]!.life).toBe(life + 2);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });
});

describe("Bonder's Ornament", () => {
  it("each player who controls one draws", () => {
    let { s, ap, opp } = setup([]);
    const o = putOnBattlefield(s, ap, bondersOrnament);
    putOnBattlefield(s, opp, bondersOrnament);
    const third = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    const hands = s.turnOrder.map((p) => s.players[p]!.hand.length);
    s = resolveAll(run(s, planActivate(s, ap, o, 0)));
    expect(s.players[ap]!.hand.length).toBe(hands[s.turnOrder.indexOf(ap)]! + 1);
    expect(s.players[opp]!.hand.length).toBe(hands[s.turnOrder.indexOf(opp)]! + 1);
    expect(s.players[third]!.hand.length).toBe(hands[s.turnOrder.indexOf(third)]!);
  });
});

describe("Scrounging Bandar", () => {
  it("moves any number of its +1/+1 counters onto another target creature at upkeep", () => {
    let { s, ap } = setup([]);
    const band = putOnBattlefield(s, ap, scroungingBandar);
    s.objects[band]!.counters["+1/+1"] = 2;
    const b = putOnBattlefield(s, ap, bear());
    invalidateCharacteristics(s);
    s = passUntil(s, "upkeep", ap);
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets" && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] });
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "removeCounter" });
    s = resolveAll(option(s, ap, "+1/+1"));
    s = resolveAll(option(s, ap, "done"));
    expect(counters(s, band)).toBe(1);
    expect(counters(s, b)).toBe(1);
  });
});

describe("Fae Offering", () => {
  it("makes a Clue, a Food and a Treasure at the end step after a creature and a noncreature spell", () => {
    let { s, ap, ids } = setup([bear(), sprout]);
    putOnBattlefield(s, ap, faeOffering);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    s = resolveAll(passUntil(s, "end", ap));
    for (const n of ["Clue", "Food", "Treasure"]) expect(named(s, ap, n).length, n).toBe(1);
  });
  it("makes nothing after only a creature spell", () => {
    let { s, ap, ids } = setup([bear()]);
    putOnBattlefield(s, ap, faeOffering);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    s = resolveAll(passUntil(s, "end", ap));
    expect(named(s, ap, "Clue").length).toBe(0);
  });
});

describe("becomes the target of an instant or sorcery spell", () => {
  it("Silverfur Partisan: a Wolf targeted by an instant makes a Wolf token", () => {
    let { s, ap, ids } = setup([giantGrowth]);
    putOnBattlefield(s, ap, silverfurPartisan);
    const w = putOnBattlefield(s, ap, wolf);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(w)])));
    expect(named(s, ap, "Wolf").length).toBe(1);
  });
  it("Wild Defiance: +3/+3 more for an instant", () => {
    let { s, ap, ids } = setup([giantGrowth]);
    putOnBattlefield(s, ap, wildDefiance);
    const b = putOnBattlefield(s, ap, bear());
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    expect(pt(s, b)).toBe("8/8");
  });
});

describe("Tainted Indulgence", () => {
  it("discards unless there are five or more mana values among cards in your graveyard", () => {
    let { s, ap, ids } = setup([taintedIndulgence]);
    const hand = s.players[ap]!.hand.length;
    for (const mv of [1, 2, 3, 4, 5]) into(s, ap, card(`Mv${mv}`, "Sorcery", `{${mv}}`, { cmc: mv }), "graveyard");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.pending).toBeFalsy();
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
  });
  it("with four mana values you discard", () => {
    let { s, ap, ids } = setup([taintedIndulgence]);
    for (const mv of [1, 2, 3, 4, 4]) into(s, ap, card(`Mv${mv}`, "Sorcery", `{${mv}}`, { cmc: mv }), "graveyard");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.pending?.kind).toBe("discard");
  });
});

describe("The Tabernacle at Pendrell Vale", () => {
  it("each creature's upkeep trigger destroys it unless its controller pays {1}", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, theTabernacleAtPendrellVale);
    const b = putOnBattlefield(s, ap, bear());
    const b2 = putOnBattlefield(s, ap, bear());
    s = passUntil(s, "upkeep", ap);
    let asked = 0;
    for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      if (s.pending?.kind === "chooseMay") s = may(s, asked++ === 0);
      else if (s.pending) break;
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(asked).toBe(2);
    expect([zone(s, b), zone(s, b2)].sort()).toEqual(["battlefield", "graveyard"]);
  });
});

describe("Fear, Fire, Foes!", () => {
  it("deals X to the target and 1 to each other creature its controller controls", () => {
    let { s, ap, ids, opp } = setup([fearFireFoes]);
    const t = putOnBattlefield(s, opp, bear({ toughness: "3" }));
    const o1 = putOnBattlefield(s, opp, bear({ toughness: "1" }));
    const mine = putOnBattlefield(s, ap, bear({ toughness: "1" }));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(t)], undefined, undefined, 3)));
    expect(zone(s, t)).toBe("graveyard");
    expect(zone(s, o1)).toBe("graveyard");
    expect(zone(s, mine)).toBe("battlefield");
  });
});

describe("Kothophed and Malboro", () => {
  it("Kothophed draws and loses 1 life when a permanent another player owns goes to a graveyard", () => {
    let { s, ap, ids, opp } = setup([shock, shock]);
    putOnBattlefield(s, ap, kothophedSoulHoarder);
    const foe = putOnBattlefield(s, opp, bear());
    const mine = putOnBattlefield(s, ap, bear());
    const life = s.players[ap]!.life - 0;
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(foe)])));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
    expect(s.players[ap]!.life).toBe(life - 1);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(mine)])));
    expect(s.players[ap]!.hand.length).toBe(hand - 2 + 1);
  });
});

describe("Horned Loch-Whale", () => {
  it("enters untapped on your turn", () => {
    let { s, ap, ids } = setup([hornedLochwhaleLagoonBreach]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.tapped).toBe(false);
  });
  it("enters tapped on another player's turn", () => {
    let { s, ap, ids, opp } = setup([hornedLochwhaleLagoonBreach]);
    s = passUntil(s, "main1", opp);
    for (let i = 0; i < 10 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (const id of s.battlefield) if (controllerOf(s, s.objects[id]!) === ap) s.objects[id]!.tapped = false;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.tapped).toBe(true);
  });
});

describe("Wartime Protestors and Sinkhole Surveyor", () => {
  it("another Ally entering gets a +1/+1 counter and haste", () => {
    let { s, ap, ids } = setup([ally]);
    putOnBattlefield(s, ap, wartimeProtestors);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(counters(s, ids[0]!)).toBe(1);
    expect(kw(s, ids[0]!, "Haste")).toBe(true);
  });
  it("Sinkhole Surveyor: you lose 1 life and it endures 1 as it attacks", () => {
    let { s, ap, opp } = setup([]);
    const b = putOnBattlefield(s, ap, sinkholeSurveyor);
    s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    const life = s.players[ap]!.life;
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "endure" });
    s = resolveAll(option(s, ap, "counters"));
    expect(s.players[ap]!.life).toBe(life - 1);
    expect(counters(s, b)).toBe(1);
  });
});

describe("Realm Seekers and Lluwen", () => {
  it("Realm Seekers enters with a counter for each card in all players' hands", () => {
    let { s, ap, ids } = setup([realmSeekers]);
    s = run(s, planCast(s, ap, ids[0]!));
    const n = s.turnOrder.reduce((a, p) => a + s.players[p]!.hand.length, 0);
    s = resolveAll(s);
    expect(counters(s, ids[0]!)).toBe(n);
  });
  it("Lluwen mills four and may put a creature card from among them back on top", () => {
    let { s, ap, ids } = setup([lluwenImperfectNaturalist]);
    for (let i = 0; i < 3; i++) into(s, ap, card("Forest", "Basic Land — Forest", "", { cmc: 0 }), "library");
    const c = into(s, ap, bear({ name: "Top Bear" }), "library");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.pending?.kind).toBeDefined();
    expect(s.players[ap]!.graveyard).toContain(c);
  });
});

/** Plays on until `step`: nobody blocks, "you may" gets yes; stops at any other question. */
const toStep = (s: GameState, step: GameState["step"]) => {
  for (let i = 0; i < 300 && s.step !== step; i++) {
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    else if (s.pending?.kind === "chooseMay") s = may(s, true);
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const attack = (s: GameState, pid: PlayerId, attackers: string[], defender: PlayerId) =>
  act(passUntil(s, "declareAttackers", pid), { type: "declareAttackers", player: pid, attacks: attackers.map((a) => ({ attacker: a, defender })) });

describe("combat", () => {
  it("Haliya draws when a creature with a +1/+1 counter deals combat damage, not otherwise", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, haliyaAscendantCadet);
    const b = putOnBattlefield(s, ap, bear());
    s = attack(s, ap, [b], opp);
    let hand = s.players[ap]!.hand.length;
    s = toStep(s, "main2");
    expect(s.players[ap]!.hand.length).toBe(hand);
    s = passUntil(s, "main1", ap);
    s.objects[b]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s);
    s = attack(s, ap, [b], opp);
    hand = s.players[ap]!.hand.length;
    s = toStep(s, "main2");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
  it("Argent Dais gets an oil counter when a player attacks with two or more creatures", () => {
    let { s, ap, opp } = setup([]);
    const d = putOnBattlefield(s, ap, argentDais);
    s.objects[d]!.counters.oil = 2;
    const a = putOnBattlefield(s, opp, bear());
    const b = putOnBattlefield(s, opp, bear());
    s = attack(s, opp, [a, b], ap);
    s = resolveAll(s);
    expect(counters(s, d, "oil")).toBe(3);
  });
  it("Ever-Watching Threshold draws when an opponent attacks you, not when they attack someone else", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, everwatchingThreshold);
    const a = putOnBattlefield(s, opp, bear());
    const third = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    s = passUntil(s, "declareAttackers", opp);
    let hand = s.players[ap]!.hand.length;
    s = resolveAll(attack(s, opp, [a], third));
    expect(s.players[ap]!.hand.length).toBe(hand);
    s = passUntil(passUntil(toStep(s, "main2"), "main1", ap), "declareAttackers", opp);
    s.objects[a]!.tapped = false;
    hand = s.players[ap]!.hand.length;
    s = resolveAll(attack(s, opp, [a], ap));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
  it("Death Tyrant makes a Zombie when an attacking creature you control dies", () => {
    let { s, ap, ids, opp } = setup([shock]);
    putOnBattlefield(s, ap, deathTyrant);
    const b = putOnBattlefield(s, ap, bear());
    s = resolveAll(attack(s, ap, [b], opp));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    expect(zone(s, b)).toBe("graveyard");
    expect(named(s, ap, "Zombie").length).toBe(1);
  });
});

describe("granted evolve and training", () => {
  it("Propagator Drone: creature tokens you control evolve", () => {
    let { s, ap, ids } = setup([bear()]);
    putOnBattlefield(s, ap, propagatorDrone);
    const tok = putOnBattlefield(s, ap, card("Spawn", "Token Creature — Eldrazi Spawn", "", { cmc: 0, power: "0", toughness: "1" }));
    s.objects[tok]!.isToken = true;
    const nontoken = putOnBattlefield(s, ap, card("Tiny", "Creature — Elf", "{G}", { cmc: 1, power: "1", toughness: "1" }));
    invalidateCharacteristics(s);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(counters(s, tok)).toBe(1);
    expect(counters(s, nontoken)).toBe(0);
  });
  it("Warrior's Resolve: a creature attacking with a stronger one gets a +1/+1 counter", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, warriorsResolve);
    const small = putOnBattlefield(s, ap, card("Tiny", "Creature — Elf", "{G}", { cmc: 1, power: "1", toughness: "1" }));
    const big = putOnBattlefield(s, ap, bear());
    s = resolveAll(attack(s, ap, [small, big], opp));
    expect(counters(s, small)).toBe(1);
    expect(counters(s, big)).toBe(0);
  });
});

describe("more cards", () => {
  it("Malboro: each opponent discards a card, loses 2 life and exiles the top three cards of their library", () => {
    let { s, ap, ids, opp } = setup([malboro]);
    const life = s.players[opp]!.life;
    const lib = s.players[opp]!.library.length;
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "discard") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, 1) });
      else if (p) break;
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(s.players[opp]!.library.length).toBe(lib - 3);
  });
  it("Alpha Status: +2/+2 for each other creature that shares a creature type", () => {
    let { s, ap, ids, opp } = setup([alphaStatus]);
    const b = putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, opp, bear());
    putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, ap, wolf);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    expect(pt(s, b)).toBe("6/6");
  });
  it("Chandra, Flamecaller's 0 discards your hand and draws that many plus one", () => {
    let { s, ap } = setup([bear(), bear(), bear()]);
    const c = putOnBattlefield(s, ap, chandraFlamecaller);
    s.objects[c]!.counters.loyalty = 4;
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planActivate(s, ap, c, 1)));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
  it("Questing Druid gets a counter for a red spell, not a green one", () => {
    let { s, ap, ids } = setup([shock, giantGrowth]);
    const q = putOnBattlefield(s, ap, questingDruidSeekTheBeast);
    const foe = putOnBattlefield(s, s.turnOrder[1]!, bear());
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(foe)])));
    expect(counters(s, q)).toBe(1);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(q)])));
    expect(counters(s, q)).toBe(1);
  });
  it("Anje Falkenrath untaps when you discard a card with madness, not another card", () => {
    let { s, ap, ids } = setup([card("Fiery Temper", "Instant", "{1}{R}{R}", { cmc: 3, keywords: ["Madness"], oracleText: "Fiery Temper deals 3 damage to any target.\nMadness {R} (If you discard this card, discard it into exile. When you do, cast it for its madness cost or put it into your graveyard.)" }), bear()]);
    const a = putOnBattlefield(s, ap, anjeFalkenrath);
    s = resolveAll(run(s, planActivate(s, ap, a, 0, undefined, undefined, undefined, undefined, { discard: [ids[1]!] })), false);
    expect(s.objects[a]!.tapped).toBe(true);
    s.objects[a]!.tapped = false;
    s = resolveAll(run(s, planActivate(s, ap, a, 0, undefined, undefined, undefined, undefined, { discard: [ids[0]!] })), false);
    expect(s.objects[a]!.tapped).toBe(false);
  });
});

describe("Bristlebud Farmer", () => {
  it("mills nothing if you don't sacrifice a Food", () => {
    let { s, ap, opp } = setup([]);
    const f = putOnBattlefield(s, ap, bristlebudFarmer);
    for (let i = 0; i < 2; i++) putOnBattlefield(s, ap, card("Food", "Token Artifact — Food", "", { cmc: 0, oracleText: "{2}, {T}, Sacrifice this token: You gain 3 life." }));
    const lib = s.players[ap]!.library.length;
    s = resolveAll(attack(s, ap, [f], opp), false);
    expect(s.players[ap]!.library.length).toBe(lib);
    expect(named(s, ap, "Food").length).toBe(2);
  });
  it("saying yes sacrifices a Food and mills three; you may put a permanent card from among them into your hand", () => {
    let { s, ap, opp } = setup([]);
    const f = putOnBattlefield(s, ap, bristlebudFarmer);
    putOnBattlefield(s, ap, card("Food", "Token Artifact — Food", "", { cmc: 0, oracleText: "{2}, {T}, Sacrifice this token: You gain 3 life." }));
    into(s, ap, shock, "library");
    into(s, ap, shock, "library");
    const b = into(s, ap, bear({ name: "Milled Bear" }), "library");
    const lib = s.players[ap]!.library.length;
    s = resolveAll(attack(s, ap, [f], opp));
    const p = s.pending;
    if (p?.kind !== "searchLibrary") throw new Error("no pick");
    expect([...p.cards].sort()).toEqual([b]);
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [b] }));
    expect(named(s, ap, "Food").length).toBe(0);
    expect(s.players[ap]!.library.length).toBe(lib - 3);
    expect(zone(s, b)).toBe("hand");
  });
});
