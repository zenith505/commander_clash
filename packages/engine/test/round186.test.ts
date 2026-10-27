// Round 186: more of the harder cards both lanes skipped, from the most played down: "become ... in addition to their
// other types" for Clues and Treasures, "whenever ~ evolves", "whenever you scry ... X is the number of cards looked
// at", "counter target activated or triggered ability from an artifact source" (and what happens to that permanent),
// "Then transform ~ if ...", conditions after the instruction (Mayael's Aria), commanders from the command zone to
// your hand (Campfire), the chosen creature type for Vehicles (Lifecraft Engine) and more.

import { describe, expect, it } from "vitest";
import { act, bear, card, island, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, castProblem, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, moveObject, objHasKeyword, parseManaCost, planActivate, planCast, planMana, power, spellCost, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

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
/** Answers a target question for a trigger, if one is asked. */
const choose = (s: GameState, targets: TargetChoice[]) => (s.pending?.kind === "chooseTargets" ? resolveAll(act(s, { type: "chooseTargets", player: s.pending.player, targets })) : s);
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
/** A game where `ap` controls none of their lands: they're moved to the graveyard. */
const bare = (hand: CardDef[]) => {
  const g = setup(hand);
  for (const id of [...g.s.battlefield]) if (g.s.objects[id]!.controller === g.ap) moveObject(g.s, id, "graveyard");
  for (const id of g.s.players[g.ap]!.graveyard) delete g.s.objects[id]!.fromBattlefieldTurn;
  invalidateCharacteristics(g.s);
  return g;
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const stackTop = (s: GameState): TargetChoice => ({ kind: "stack", id: s.stack.at(-1)!.id });
const counters = (s: GameState, id: string, c = "+1/+1") => s.objects[id]!.counters[c] ?? 0;
const pt = (s: GameState, id: ObjectId) => [power(s, s.objects[id]!), toughness(s, s.objects[id]!)];
const chars = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!);
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && [name, `${name} Token`].includes(chars(s, id).name));
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const attack = (s: GameState, ap: PlayerId, opp: PlayerId, attackers: string[]) =>
  act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender: opp })) });
const big = card("Test Giant", "Creature — Giant", "{4}{G}", { cmc: 5, power: "5", toughness: "5" });
const relic = card("Test Relic", "Artifact", "{1}", { cmc: 1 });
const clue = card("Clue", "Artifact — Clue", "", { oracleText: "{2}, Sacrifice this artifact: Draw a card." });
const treasure = card("Treasure", "Artifact — Treasure", "", { oracleText: "{T}, Sacrifice this artifact: Add one mana of any color." });
const flyer = card("Test Bird", "Creature — Bird", "{1}{W}", { cmc: 2, power: "1", toughness: "1", keywords: ["Flying"], oracleText: "Flying" });
const spirit = card("Test Spirit", "Creature — Spirit", "{1}{W}", { cmc: 2, power: "1", toughness: "1" });
const aura = card("Test Charm", "Enchantment", "{1}", { cmc: 1 });
const opt = card("Test Opt", "Instant", "{U}", { cmc: 1, oracleText: "Draw a card." });
const bolt = card("Test Bolt", "Sorcery", "{2}{R}", { cmc: 3, oracleText: "Test Bolt deals 1 damage to any target." });
const scry2 = card("Test Scry", "Sorcery", "{U}", { cmc: 1, oracleText: "Scry 2." });
const pinger = card("Test Pinger", "Artifact", "{1}", { cmc: 1, oracleText: "{1}: This artifact deals 1 damage to any target.\n{T}: Add {C}." });
const pingerCreature = card("Test Imp", "Creature — Imp", "{1}{B}", { cmc: 2, power: "1", toughness: "1", oracleText: "{1}: This creature deals 1 damage to any target." });
const mapper = card("Test Map", "Artifact", "{1}", { cmc: 1, oracleText: "{T}: Target creature you control explores." });
const gainer = card("Test Salve", "Instant", "{W}", { cmc: 1, oracleText: "You gain 3 life." });
const blackKnight = card("Test Knight", "Creature — Knight", "{2}{B}", { cmc: 3, power: "2", toughness: "2", colors: ["B"] });
const golem = card("Test Golem", "Artifact Creature — Golem", "{4}", { cmc: 4, power: "3", toughness: "3" });
const greenBear = card("Test Bear", "Creature — Bear", "{1}{G}", { cmc: 2, power: "2", toughness: "2", colors: ["G"] });
const pilot = card("Test Pilot", "Creature — Human Pilot", "{2}{W}", { cmc: 3, power: "3", toughness: "3" });

// Real oracle text (Scryfall).
const tangletroveKelp = card("Tangletrove Kelp", "Artifact Creature — Clue Plant", "{5}{U}{U}", {"cmc": 7, "power": "6", "toughness": "6", "keywords": ["Ward"], "oracleText": "Ward {2}\nAt the beginning of each combat, other Clues you control become 6/6 Plant creatures in addition to their other types until end of turn.\n{2}, Sacrifice this creature: Draw a card.", "colors": ["U"], "layout": "normal"});
const vihaan = card("Vihaan, Goldwaker", "Legendary Creature — Dwarf Warlock", "{R}{W}{B}", {"cmc": 3, "power": "3", "toughness": "3", "oracleText": "Other outlaws you control have vigilance and haste. (Assassins, Mercenaries, Pirates, Rogues, and Warlocks are outlaws.)\nAt the beginning of combat on your turn, you may have Treasures you control become 3/3 Construct Assassin artifact creatures in addition to their other types until end of turn.", "colors": ["B", "R", "W"], "layout": "normal"});
const shadowPuppeteers = card("Shadow Puppeteers", "Creature — Faerie Wizard", "{6}{U}", {"cmc": 7, "power": "4", "toughness": "4", "keywords": ["Flying", "Ward"], "oracleText": "Flying, ward {2}\nWhen this creature enters, create two 1/1 black Faerie Rogue creature tokens with flying.\nWhenever a creature you control with flying attacks, you may have it become a red Dragon with base power and toughness 4/4 in addition to its other colors and types until end of turn.", "colors": ["U"], "layout": "normal"});
const katilda = card("Katilda, Dawnhart Martyr // Katilda's Rising Dawn", "Legendary Creature — Spirit Warlock // Legendary Enchantment — Aura", "{1}{W}{W}", {"cmc": 3, "power": "*", "toughness": "*", "keywords": ["Flying", "Lifelink", "Transform", "Protection", "Enchant", "Disturb"], "oracleText": "Flying, lifelink, protection from Vampires\nKatilda's power and toughness are each equal to the number of permanents you control that are Spirits and/or enchantments.\nDisturb {3}{W}{W} (You may cast this card from your graveyard transformed for its disturb cost.)", "colors": ["W"], "layout": "transform", "faces": [{"name": "Katilda, Dawnhart Martyr", "manaCost": "{1}{W}{W}", "typeLine": "Legendary Creature — Spirit Warlock", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Spirit", "Warlock"], "oracleText": "Flying, lifelink, protection from Vampires\nKatilda's power and toughness are each equal to the number of permanents you control that are Spirits and/or enchantments.\nDisturb {3}{W}{W} (You may cast this card from your graveyard transformed for its disturb cost.)", "power": "*", "toughness": "*", "colors": ["W"]}, {"name": "Katilda's Rising Dawn", "manaCost": "", "typeLine": "Legendary Enchantment — Aura", "supertypes": ["Legendary"], "types": ["Enchantment"], "subtypes": ["Aura"], "oracleText": "Enchant creature\nEnchanted creature has flying, lifelink, and protection from Vampires, and it gets +X/+X, where X is the number of permanents you control that are Spirits and/or enchantments.\nIf Katilda's Rising Dawn would be put into a graveyard from anywhere, exile it instead.", "colors": ["W"], "colorIndicator": ["W"]}]});
const oreskosExplorer = card("Oreskos Explorer", "Creature — Cat Scout", "{1}{W}", {"cmc": 2, "power": "2", "toughness": "2", "oracleText": "When this creature enters, search your library for up to X Plains cards, where X is the number of players who control more lands than you. Reveal those cards, put them into your hand, then shuffle.", "colors": ["W"], "layout": "normal"});
const elvishMariner = card("Elvish Mariner", "Creature — Elf Pilot", "{2}{U}", {"cmc": 3, "power": "3", "toughness": "2", "keywords": ["Scry"], "oracleText": "Whenever this creature attacks, scry 1.\nWhenever you scry, tap up to X target nonland permanents, where X is the number of cards looked at while scrying this way.", "colors": ["U"], "layout": "normal"});
const prewarFormalwear = card("Pre-War Formalwear", "Artifact — Equipment", "{2}{W}", {"cmc": 3, "keywords": ["Equip"], "oracleText": "When this Equipment enters, return target creature card with mana value 3 or less from your graveyard to the battlefield and attach this Equipment to it.\nEquipped creature gets +2/+2 and has vigilance.\nEquip {3}", "colors": ["W"], "layout": "normal"});
const fractalHarness = card("Fractal Harness", "Artifact — Equipment", "{X}{2}{G}", {"cmc": 3, "keywords": ["Equip", "Double"], "oracleText": "When this Equipment enters, create a 0/0 green and blue Fractal creature token. Put X +1/+1 counters on it and attach this Equipment to it.\nWhenever equipped creature attacks, double the number of +1/+1 counters on it.\nEquip {2}", "colors": ["G"], "layout": "normal"});
const fieldtestedFryingPan = card("Field-Tested Frying Pan", "Artifact — Equipment", "{2}{W}", {"cmc": 3, "keywords": ["Food", "Equip"], "oracleText": "When this Equipment enters, create a Food token, then create a 1/1 white Halfling creature token and attach this Equipment to it.\nEquipped creature has \"Whenever you gain life, this creature gets +X/+X until end of turn, where X is the amount of life you gained.\"\nEquip {2}", "colors": ["W"], "layout": "normal"});
const redDeath = card("Red Death, Shipwrecker", "Legendary Creature — Crab Mutant", "{U}{R}", {"cmc": 2, "power": "1", "toughness": "3", "keywords": ["Alluring Eyes", "Goad"], "oracleText": "Alluring Eyes — {T}: Goad target creature an opponent controls. That player draws a card. You add {R}. (Until your next turn, that creature attacks each combat if able and attacks a player other than you if able.)", "colors": ["R", "U"], "layout": "normal"});
const watchfulRadstag = card("Watchful Radstag", "Creature — Elk Mutant", "{2}{G}", {"cmc": 3, "power": "2", "toughness": "2", "keywords": ["Evolve"], "oracleText": "Evolve (Whenever a creature you control enters, if that creature has greater power or toughness than this creature, put a +1/+1 counter on this creature.)\nWhenever this creature evolves, create a token that's a copy of it.", "colors": ["G"], "layout": "normal"});
const eris = card("Eris, Roar of the Storm", "Legendary Creature — Elemental Warlock", "{8}{U}{R}", {"cmc": 10, "power": "4", "toughness": "4", "keywords": ["Flying", "Prowess"], "oracleText": "This spell costs {2} less to cast for each different mana value among instant and sorcery cards in your graveyard.\nFlying, prowess\nWhenever you cast your second spell each turn, create a 4/4 red Dragon Elemental creature token with flying and prowess.", "colors": ["R", "U"], "layout": "normal"});
const soldeviAdnate = card("Soldevi Adnate", "Creature — Human Cleric", "{1}{B}", {"cmc": 2, "power": "1", "toughness": "2", "oracleText": "{T}, Sacrifice a black or artifact creature: Add an amount of {B} equal to the sacrificed creature's mana value.", "colors": ["B"], "layout": "normal"});
const varchild = card("Varchild, Betrayer of Kjeldor", "Legendary Creature — Human Knight", "{2}{R}", {"cmc": 3, "power": "3", "toughness": "3", "oracleText": "Whenever Varchild deals combat damage to a player, that player creates that many 1/1 red Survivor creature tokens.\nSurvivors your opponents control can't block, and they can't attack you or planeswalkers you control.\nWhen Varchild leaves the battlefield, gain control of all Survivors.", "colors": ["R"], "layout": "normal"});
const hadanasClimb = card("Hadana's Climb // Winged Temple of Orazca", "Legendary Enchantment // Legendary Land", "{1}{G}{U}", {"cmc": 3, "keywords": ["Transform"], "oracleText": "At the beginning of combat on your turn, put a +1/+1 counter on target creature you control. Then if that creature has three or more +1/+1 counters on it, transform Hadana's Climb.", "colors": ["G", "U"], "layout": "transform", "faces": [{"name": "Hadana's Climb", "manaCost": "{1}{G}{U}", "typeLine": "Legendary Enchantment", "supertypes": ["Legendary"], "types": ["Enchantment"], "subtypes": [], "oracleText": "At the beginning of combat on your turn, put a +1/+1 counter on target creature you control. Then if that creature has three or more +1/+1 counters on it, transform Hadana's Climb.", "colors": ["G", "U"]}, {"name": "Winged Temple of Orazca", "manaCost": "", "typeLine": "Legendary Land", "supertypes": ["Legendary"], "types": ["Land"], "subtypes": [], "oracleText": "(Transforms from Hadana's Climb.)\n{T}: Add one mana of any color.\n{1}{G}{U}, {T}: Target creature you control gains flying and gets +X/+X until end of turn, where X is its power.", "colors": []}]});
const dowsingDevice = card("Dowsing Device // Geode Grotto", "Artifact // Land — Cave", "{1}{R}", {"cmc": 2, "keywords": ["Transform"], "oracleText": "Whenever this artifact or another artifact you control enters, up to one target creature you control gets +1/+0 and gains haste until end of turn. Then transform this artifact if you control four or more artifacts.", "colors": ["R"], "layout": "transform", "faces": [{"name": "Dowsing Device", "manaCost": "{1}{R}", "typeLine": "Artifact", "supertypes": [], "types": ["Artifact"], "subtypes": [], "oracleText": "Whenever this artifact or another artifact you control enters, up to one target creature you control gets +1/+0 and gains haste until end of turn. Then transform this artifact if you control four or more artifacts.", "colors": ["R"]}, {"name": "Geode Grotto", "manaCost": "", "typeLine": "Land — Cave", "supertypes": [], "types": ["Land"], "subtypes": ["Cave"], "oracleText": "(Transforms from Dowsing Device.)\n{T}: Add {R}.\n{2}{R}, {T}: Until end of turn, target creature gains haste and gets +X/+0, where X is the number of artifacts you control. Activate only as a sorcery.", "colors": []}]});
const greenSlime = card("Green Slime", "Creature — Ooze", "{2}{G}", {"cmc": 3, "power": "2", "toughness": "2", "keywords": ["Flash", "Foretell"], "oracleText": "Flash\nWhen this creature enters, counter target activated or triggered ability from an artifact or enchantment source. If a permanent's ability is countered this way, destroy that permanent.\nForetell {G} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)", "colors": ["G"], "layout": "normal"});
const trickbind = card("Trickbind", "Instant", "{1}{U}", {"cmc": 2, "keywords": ["Split second"], "oracleText": "Split second (As long as this spell is on the stack, players can't cast spells or activate abilities that aren't mana abilities.)\nCounter target activated or triggered ability. If a permanent's ability is countered this way, activated abilities of that permanent can't be activated this turn. (Mana abilities can't be targeted.)", "colors": ["U"], "layout": "normal"});
const nimbleObstructionist = card("Nimble Obstructionist", "Creature — Bird Wizard", "{2}{U}", {"cmc": 3, "power": "3", "toughness": "1", "keywords": ["Flying", "Flash", "Cycling"], "oracleText": "Flash\nFlying\nCycling {2}{U} ({2}{U}, Discard this card: Draw a card.)\nWhen you cycle this card, counter target activated or triggered ability you don't control.", "colors": ["U"], "layout": "normal"});
const campfire = card("Campfire", "Artifact", "{1}", {"cmc": 1, "oracleText": "{1}, {T}: You gain 2 life.\n{2}, {T}, Exile this artifact: Put all commanders you own from the command zone and from your graveyard into your hand. Then shuffle your graveyard into your library.", "layout": "normal"});
const radiantDestiny = card("Radiant Destiny", "Enchantment", "{2}{W}", {"cmc": 3, "keywords": ["Ascend"], "oracleText": "Ascend (If you control ten or more permanents, you get the city's blessing for the rest of the game.)\nAs this enchantment enters, choose a creature type.\nCreatures you control of the chosen type get +1/+1. As long as you have the city's blessing, they also have vigilance.", "colors": ["W"], "layout": "normal"});
const lifecraftEngine = card("Lifecraft Engine", "Artifact — Vehicle", "{3}", {"cmc": 3, "power": "4", "toughness": "4", "keywords": ["Crew"], "oracleText": "As this Vehicle enters, choose a creature type.\nVehicle creatures you control are the chosen creature type in addition to their other types.\nEach creature you control of the chosen type other than this Vehicle gets +1/+1.\nCrew 3", "layout": "normal"});
const nicanzil = card("Nicanzil, Current Conductor", "Legendary Creature — Merfolk Scout", "{G}{U}", {"cmc": 2, "power": "2", "toughness": "3", "keywords": ["Explore"], "oracleText": "Whenever a creature you control explores a land card, you may put a land card from your hand onto the battlefield tapped.\nWhenever a creature you control explores a nonland card, put a +1/+1 counter on Nicanzil.", "colors": ["G", "U"], "layout": "normal"});
const mayaelsAria = card("Mayael's Aria", "Enchantment", "{R}{G}{W}", {"cmc": 3, "oracleText": "At the beginning of your upkeep, put a +1/+1 counter on each creature you control if you control a creature with power 5 or greater. Then you gain 10 life if you control a creature with power 10 or greater. Then you win the game if you control a creature with power 20 or greater.", "colors": ["G", "R", "W"], "layout": "normal"});
const commodoreGuff = card("Commodore Guff", "Legendary Planeswalker — Guff", "{1}{U}{R}{W}", {"cmc": 4, "oracleText": "At the beginning of your end step, put a loyalty counter on another target planeswalker you control.\n+1: Create a 1/1 red Wizard creature token with \"{T}: Add {R}. Spend this mana only to cast a planeswalker spell.\"\n−3: You draw X cards and Commodore Guff deals X damage to each opponent, where X is the number of planeswalkers you control.\nCommodore Guff can be your commander.", "colors": ["R", "U", "W"], "layout": "normal", "loyalty": "5"});
const sigardasSummons = card("Sigarda's Summons", "Enchantment", "{4}{W}{W}", {"cmc": 6, "oracleText": "Creatures you control with +1/+1 counters on them have base power and toughness 4/4, have flying, and are Angels in addition to their other types.", "colors": ["W"], "layout": "normal"});
const brownOuphe = card("Brown Ouphe", "Creature — Ouphe", "{G}", {"cmc": 1, "power": "1", "toughness": "1", "oracleText": "{1}{G}, {T}: Counter target activated ability from an artifact source. (Mana abilities can't be targeted.)", "colors": ["G"], "layout": "normal"});
const rust = card("Rust", "Instant", "{G}", {"cmc": 1, "oracleText": "Counter target activated ability from an artifact source. (Mana abilities can't be targeted.)", "colors": ["G"], "layout": "normal"});
const elrond = card("Elrond, Master of Healing", "Legendary Creature — Elf Noble", "{2}{G}{U}", {"cmc": 4, "power": "4", "toughness": "4", "oracleText": "Whenever you scry, put a +1/+1 counter on each of up to X target creatures, where X is the number of cards looked at while scrying this way.\nWhenever a creature you control with a +1/+1 counter on it becomes the target of a spell or ability an opponent controls, you may draw a card.", "colors": ["G", "U"], "layout": "normal"});
const hurskaSweettooth = card("Hurska Sweet-Tooth", "Legendary Creature — Bear", "{2}{G}", {"cmc": 3, "power": "3", "toughness": "3", "keywords": ["Food"], "oracleText": "Whenever Hurska attacks, create a Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\nWhenever you gain life, you may pay {G/W}. When you do, target creature gets +X/+X until end of turn, where X is the amount of life you gained.", "colors": ["G"], "layout": "normal"});
const prismaticUndercurrents = card("Prismatic Undercurrents", "Enchantment", "{3}{G}", {"cmc": 4, "keywords": ["Vivid"], "oracleText": "Vivid — When this enchantment enters, search your library for up to X basic land cards, where X is the number of colors among permanents you control. Reveal those cards, put them into your hand, then shuffle.\nYou may play an additional land on each of your turns.", "colors": ["G"], "layout": "normal"});
const renegadeKrasis = card("Renegade Krasis", "Creature — Beast Mutant", "{1}{G}{G}", {"cmc": 3, "power": "3", "toughness": "2", "keywords": ["Evolve"], "oracleText": "Evolve (Whenever a creature you control enters, if that creature has greater power or toughness than this creature, put a +1/+1 counter on this creature.)\nWhenever this creature evolves, put a +1/+1 counter on each other creature you control with a +1/+1 counter on it.", "colors": ["G"], "layout": "normal"});
const urdnan = card("Urdnan, Dromoka Warrior", "Legendary Creature — Human Warrior", "{1}{W}", {"cmc": 2, "power": "1", "toughness": "1", "oracleText": "When Urdnan enters, put a +1/+1 counter on target creature.\nWhenever you attack, target attacking creature with a +1/+1 counter on it gains first strike until end of turn. If that creature has two or more +1/+1 counters on it, it gains double strike until end of turn instead.", "colors": ["W"], "layout": "normal"});

describe("round 186", () => {
  it("all compile", () => supported(tangletroveKelp, vihaan, shadowPuppeteers, katilda, oreskosExplorer, elvishMariner, prewarFormalwear, fractalHarness, fieldtestedFryingPan, redDeath, watchfulRadstag, eris, soldeviAdnate, varchild, hadanasClimb, dowsingDevice, greenSlime, trickbind, nimbleObstructionist, campfire, radiantDestiny, lifecraftEngine, nicanzil, mayaelsAria, commodoreGuff, sigardasSummons, brownOuphe, rust, elrond, hurskaSweettooth, prismaticUndercurrents, renegadeKrasis, urdnan));

  it("Tangletrove Kelp: other Clues become 6/6 Plant artifact creatures until end of turn, Kelp itself stays as it is", () => {
    let { s, ap } = setup([]);
    const k = putOnBattlefield(s, ap, tangletroveKelp);
    const c = putOnBattlefield(s, ap, clue);
    s = resolveAll(passUntil(s, "beginCombat", ap));
    expect(chars(s, c).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(chars(s, c).subtypes).toEqual(expect.arrayContaining(["Clue", "Plant"]));
    expect(pt(s, c)).toEqual([6, 6]);
    expect(pt(s, k)).toEqual([6, 6]);
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(chars(s, c).types).not.toContain("Creature");
  });

  it("Vihaan, Goldwaker: Treasures become 3/3 Construct Assassin artifact creatures, which as outlaws have haste", () => {
    for (const yes of [true, false]) {
      let { s, ap } = setup([]);
      putOnBattlefield(s, ap, vihaan);
      const t = putOnBattlefield(s, ap, treasure, { sick: true });
      s = resolveAll(passUntil(s, "beginCombat", ap), yes);
      expect(chars(s, t).types.includes("Creature")).toBe(yes);
      if (yes) {
        expect(chars(s, t).subtypes).toEqual(expect.arrayContaining(["Treasure", "Construct", "Assassin"]));
        expect(pt(s, t)).toEqual([3, 3]);
        expect(objHasKeyword(s, s.objects[t]!, "Haste")).toBe(true);
        expect(objHasKeyword(s, s.objects[t]!, "Vigilance")).toBe(true);
      }
    }
  });

  it("Shadow Puppeteers: an attacking flyer may become a red Dragon with base power and toughness 4/4, keeping its other colors and types", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, shadowPuppeteers);
    const b = putOnBattlefield(s, ap, flyer);
    const g = putOnBattlefield(s, ap, bear());
    s = resolveAll(attack(s, ap, opp, [b, g]));
    expect(pt(s, b)).toEqual([4, 4]);
    expect(chars(s, b).subtypes).toEqual(expect.arrayContaining(["Bird", "Dragon"]));
    expect(chars(s, b).colors).toEqual(expect.arrayContaining(["W", "R"]));
    expect(pt(s, g)).toEqual([2, 2]);
  });

  it("Katilda: power and toughness count permanents that are Spirits and/or enchantments, each once", () => {
    let { s, ap } = setup([]);
    const k = putOnBattlefield(s, ap, katilda);
    expect(pt(s, k)).toEqual([1, 1]); // Katilda herself is a Spirit
    putOnBattlefield(s, ap, spirit);
    putOnBattlefield(s, ap, aura);
    putOnBattlefield(s, ap, card("Test Spirit Shrine", "Enchantment Creature — Spirit", "{1}", { power: "1", toughness: "1" }));
    putOnBattlefield(s, ap, bear());
    invalidateCharacteristics(s);
    expect(pt(s, k)).toEqual([4, 4]);
  });

  it("Oreskos Explorer: X is the number of players who control more lands than you", () => {
    let { s, ap, ids } = bare([oreskosExplorer]);
    const [b, c, d] = s.turnOrder.filter((p) => p !== ap);
    for (const l of [island, island]) putOnBattlefield(s, b!, l);
    putOnBattlefield(s, c!, island);
    for (const l of [island, island]) putOnBattlefield(s, ap, l);
    for (const l of [island, island, island]) putOnBattlefield(s, d!, l);
    const plainsCards = [0, 1, 2].map(() => into(s, ap, card("Plains", "Basic Land — Plains"), "library"));
    for (const l of [card("Plains", "Basic Land — Plains"), card("Plains", "Basic Land — Plains")]) putOnBattlefield(s, ap, l);
    invalidateCharacteristics(s);
    // Ap: 4 lands; B: 2, C: 1, D: 3: no one has more, X = 0. Give D two more.
    for (const l of [island, island]) putOnBattlefield(s, d!, l);
    s = run(s, planCast(s, ap, ids[0]!));
    s = resolveAll(s);
    const p = s.pending;
    expect(p?.kind).toBe("searchLibrary");
    if (p?.kind !== "searchLibrary") return;
    expect(p.max).toBe(1);
    void plainsCards;
  });

  it("Elvish Mariner: scrying 2 taps up to two target nonland permanents; Elrond puts counters on up to that many creatures", () => {
    let { s, ap, ids, opp } = setup([scry2]);
    putOnBattlefield(s, ap, elvishMariner);
    const a = putOnBattlefield(s, opp, bear());
    const b = putOnBattlefield(s, opp, relic);
    const c = putOnBattlefield(s, opp, bear());
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 10 && s.pending?.kind !== "arrangeTop"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind !== "arrangeTop") throw new Error("no scry");
    s = act(s, { type: "arrangeTop", player: ap, top: s.pending.cards, away: [] });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", x: 2 });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(a), tgt(b), tgt(c)] })).toThrow();
    s = choose(s, [tgt(a), tgt(b)]);
    expect([a, b, c].map((id) => s.objects[id]!.tapped)).toEqual([true, true, false]);

    let g = setup([scry2]);
    putOnBattlefield(g.s, g.ap, elrond);
    const mine = putOnBattlefield(g.s, g.ap, bear());
    g.s = run(g.s, planCast(g.s, g.ap, g.ids[0]!));
    for (let i = 0; i < 10 && g.s.pending?.kind !== "arrangeTop"; i++) g.s = act(g.s, { type: "passPriority", player: waitingOn(g.s)! });
    if (g.s.pending?.kind !== "arrangeTop") throw new Error("no scry");
    g.s = act(g.s, { type: "arrangeTop", player: g.ap, top: [], away: g.s.pending.cards });
    g.s = choose(g.s, [tgt(mine)]);
    expect(counters(g.s, mine)).toBe(1);
  });

  it("Pre-War Formalwear returns a creature card with mana value 3 or less and is attached to it", () => {
    let { s, ap, ids } = setup([prewarFormalwear]);
    const b = into(s, ap, greenBear, "graveyard");
    s = run(s, planCast(s, ap, ids[0]!));
    s = choose(resolveAll(s), [tgt(b)]);
    expect(zone(s, b)).toBe("battlefield");
    expect(s.objects[ids[0]!]!.attachedTo).toBe(b);
    expect(pt(s, b)).toEqual([4, 4]);
    expect(objHasKeyword(s, s.objects[b]!, "Vigilance")).toBe(true);
  });

  it("Fractal Harness makes a Fractal with X counters, attached; attacking doubles its counters", () => {
    let { s, ap, ids, opp } = setup([fractalHarness]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [], undefined, undefined, 3)));
    const [f] = named(s, ap, "Fractal");
    expect(f).toBeDefined();
    expect(counters(s, f!)).toBe(3);
    expect(s.objects[ids[0]!]!.attachedTo).toBe(f);
    s.objects[f!]!.controlledSinceTurn = -1; // as if it had been there since the turn began
    s = resolveAll(attack(s, ap, opp, [f!]));
    expect(counters(s, f!)).toBe(6);
  });

  it("Field-Tested Frying Pan: a Food, then a Halfling it's attached to, which gets +X/+X when you gain X life", () => {
    let { s, ap, ids } = setup([fieldtestedFryingPan, gainer]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(named(s, ap, "Food")).toHaveLength(1);
    const [h] = named(s, ap, "Halfling");
    expect(s.objects[ids[0]!]!.attachedTo).toBe(h);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(pt(s, h!)).toEqual([4, 4]);
    // X is locked in as the ability resolves.
    s.players[ap]!.life = 1;
    invalidateCharacteristics(s);
    expect(pt(s, h!)).toEqual([4, 4]);
  });

  it("Hurska Sweet-Tooth: pay {G/W} when you gain life; the creature gets +X/+X for the life gained", () => {
    let { s, ap, ids } = setup([gainer]);
    const h = putOnBattlefield(s, ap, hurskaSweettooth);
    s = run(s, planCast(s, ap, ids[0]!));
    s = choose(resolveAll(s), [tgt(h)]);
    expect(pt(s, h)).toEqual([6, 6]);
  });

  it("Red Death, Shipwrecker goads an opponent's creature, its controller draws, and you add {R}", () => {
    let { s, ap, opp } = setup([]);
    const r = putOnBattlefield(s, ap, redDeath);
    const b = putOnBattlefield(s, opp, bear());
    const hand = s.players[opp]!.hand.length;
    s = resolveAll(run(s, planActivate(s, ap, r, 0, [tgt(b)])));
    expect(chars(s, b).goadedBy).toContain(ap);
    expect(s.players[opp]!.hand.length).toBe(hand + 1);
    expect(s.players[ap]!.manaPool.R).toBe(1);
  });

  it("Watchful Radstag: when it evolves, a token copy of it; a creature that doesn't make it evolve makes no copy", () => {
    let { s, ap, ids } = setup([big, bear()]);
    const w = putOnBattlefield(s, ap, watchfulRadstag);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(named(s, ap, "Watchful Radstag")).toHaveLength(1);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(counters(s, w)).toBe(1);
    const copies = named(s, ap, "Watchful Radstag").filter((id) => id !== w);
    expect(copies).toHaveLength(1);
    expect(s.objects[copies[0]!]!.isToken).toBe(true);
    expect(pt(s, copies[0]!)).toEqual([2, 2]);
  });

  it("Renegade Krasis: when it evolves, each other creature you control with a +1/+1 counter gets another", () => {
    let { s, ap, ids } = setup([big]);
    const k = putOnBattlefield(s, ap, renegadeKrasis);
    const a = putOnBattlefield(s, ap, bear());
    const b = putOnBattlefield(s, ap, bear());
    s.objects[a]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect([counters(s, k), counters(s, a), counters(s, b)]).toEqual([1, 2, 0]);
  });

  it("Eris, Roar of the Storm costs {2} less for each different mana value among instants and sorceries in your graveyard", () => {
    let { s, ap, ids } = setup([eris]);
    for (const d of [opt, opt, bolt, bear()]) into(s, ap, d, "graveyard");
    // Mana values 1 and 3 (twice 1 counts once; the creature not at all): {4} less.
    const c = spellCost(s, ap, s.objects[ids[0]!]!);
    expect(c.extra + c.cost.symbols.reduce((n, x) => n + (x.kind === "generic" ? x.amount : 0), 0)).toBe(4);
  });

  it("Soldevi Adnate: sacrifice a black or artifact creature for {B} equal to its mana value; a green one can't be", () => {
    let { s, ap } = setup([]);
    const a = putOnBattlefield(s, ap, soldeviAdnate);
    const k = putOnBattlefield(s, ap, blackKnight);
    const g = putOnBattlefield(s, ap, golem);
    const b = putOnBattlefield(s, ap, greenBear);
    expect(() => act(s, { type: "activateAbility", player: ap, objectId: a, index: 0, costs: { sacrifice: [b] } })).toThrow();
    s = act(s, { type: "activateAbility", player: ap, objectId: a, index: 0, costs: { sacrifice: [g] } });
    expect(zone(s, g)).toBe("graveyard");
    expect(s.players[ap]!.manaPool.B).toBe(4);
    s.objects[a]!.tapped = false;
    s = act(s, { type: "activateAbility", player: ap, objectId: a, index: 0, costs: { sacrifice: [k] } });
    expect(s.players[ap]!.manaPool.B).toBe(7);
  });

  it("Varchild: Survivors your opponents control can't block, and can't attack you, but can attack another player", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, varchild);
    const sv = putOnBattlefield(s, opp, card("Survivor", "Creature — Survivor", "", { power: "1", toughness: "1" }));
    const other = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    const b = putOnBattlefield(s, ap, bear());
    s = attack(s, ap, opp, [b]);
    s = resolveAll(s);
    s = passUntil(s, "declareBlockers", ap);
    expect(s.pending).toMatchObject({ kind: "declareBlockers", player: opp });
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: sv, attacker: b }] })).toThrow();
    s = passUntil(s, "declareAttackers", opp);
    expect(() => act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: sv, defender: ap }] })).toThrow();
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: sv, defender: other }] });
    expect(s.objects[sv]!.attacking).toBe(other);
  });

  it("Hadana's Climb transforms once the creature has three or more +1/+1 counters", () => {
    let { s, ap } = setup([]);
    const h = putOnBattlefield(s, ap, hadanasClimb);
    const b = putOnBattlefield(s, ap, bear());
    s.objects[b]!.counters["+1/+1"] = 1;
    s = choose(passUntil(s, "beginCombat", ap), [tgt(b)]);
    expect(counters(s, b)).toBe(2);
    expect(s.objects[h]!.face ?? 0).toBe(0);
    s = passUntil(s, "beginCombat", ap, 4000);
    s = passUntil(passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!), "main1", ap, 4000);
    s = choose(passUntil(s, "beginCombat", ap), [tgt(b)]);
    expect(counters(s, b)).toBe(3);
    expect(s.objects[h]!.face).toBe(1);
    expect(chars(s, h).types).toContain("Land");
  });

  it("Dowsing Device transforms if you control four or more artifacts as the ability resolves", () => {
    let { s, ap, ids } = setup([relic, relic]);
    const d = putOnBattlefield(s, ap, dowsingDevice);
    putOnBattlefield(s, ap, relic);
    s = choose(resolveAll(run(s, planCast(s, ap, ids[0]!))), [{ kind: "none" }]);
    expect(s.objects[d]!.face ?? 0).toBe(0); // three artifacts
    s = choose(resolveAll(run(s, planCast(s, ap, ids[1]!))), [{ kind: "none" }]);
    expect(s.objects[d]!.face).toBe(1);
    expect(chars(s, d).subtypes).toContain("Cave");
  });

  it("Rust and Brown Ouphe counter an artifact's activated ability; a creature's can't be targeted", () => {
    let { s, ap, ids, opp } = setup([rust]);
    const pg = putOnBattlefield(s, ap, pinger);
    const imp = putOnBattlefield(s, ap, pingerCreature);
    s = run(s, planActivate(s, ap, imp, 0, [player(opp)]));
    expect(planCast(s, ap, ids[0]!, [stackTop(s)])).toBeNull();
    s = run(s, planActivate(s, ap, pg, 0, [player(opp)]));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [stackTop(s)])));
    expect(life(s, opp)).toBe(39); // only the Imp's damage
    expect(zone(s, pg)).toBe("battlefield");

    let g = setup([]);
    const o = putOnBattlefield(g.s, g.ap, brownOuphe);
    const pg2 = putOnBattlefield(g.s, g.ap, pinger);
    g.s = run(g.s, planActivate(g.s, g.ap, pg2, 0, [player(g.opp)]));
    g.s = resolveAll(run(g.s, planActivate(g.s, g.ap, o, 0, [stackTop(g.s)])));
    expect(life(g.s, g.opp)).toBe(40);
  });

  it("Green Slime counters an artifact's ability and destroys that artifact", () => {
    let { s, ap, ids, opp } = setup([greenSlime]);
    const pg = putOnBattlefield(s, ap, pinger);
    s = run(s, planActivate(s, ap, pg, 0, [player(opp)]));
    const ability: TargetChoice = { kind: "stack", id: s.stack.at(-1)!.id };
    s = run(s, planCast(s, ap, ids[0]!));
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = choose(s, [ability]);
    expect(life(s, opp)).toBe(40);
    expect(zone(s, pg)).toBe("graveyard");
  });

  it("Trickbind: the permanent's activated abilities, mana abilities too, can't be activated this turn", () => {
    let { s, ap, ids, opp } = setup([trickbind]);
    const pg = putOnBattlefield(s, ap, pinger);
    s = run(s, planActivate(s, ap, pg, 0, [player(opp)]));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [stackTop(s)])));
    expect(life(s, opp)).toBe(40);
    expect(chars(s, pg).cantActivate).toBe("all");
    expect(planActivate(s, ap, pg, 0, [player(opp)])).toBeNull();
    expect(() => act(s, { type: "activateAbility", player: ap, objectId: pg, index: 1 })).toThrow();
    s = passUntil(s, "main1", opp);
    expect(chars(s, pg).cantActivate).toBe(false);
  });

  it("Nimble Obstructionist: cycling it counters an ability an opponent controls, not one of yours", () => {
    let { s, ap, ids, opp } = setup([nimbleObstructionist]);
    const theirs = putOnBattlefield(s, opp, pinger);
    const mine = putOnBattlefield(s, ap, pinger);
    s = run(s, planActivate(s, ap, mine, 0, [player(opp)]));
    // Only their ability can be its target: cycling it now, the trigger has none and is removed (CR 603.3d).
    s = resolveAll(run(s, planActivate(s, ap, ids[0]!, 0)));
    expect(s.pending).toBeFalsy();
    expect(life(s, opp)).toBe(39);
    // On their ability, it's countered.
    let g = setup([nimbleObstructionist]);
    const t2 = putOnBattlefield(g.s, g.opp, pinger);
    g.s = act(g.s, { type: "passPriority", player: g.ap });
    g.s.players[g.opp]!.manaPool.C = 1;
    g.s = act(g.s, { type: "activateAbility", player: g.opp, objectId: t2, index: 0, targets: [player(g.ap)] });
    for (let i = 0; i < 10 && waitingOn(g.s) !== g.ap; i++) g.s = act(g.s, { type: "passPriority", player: waitingOn(g.s)! });
    const theirAbility: TargetChoice = { kind: "stack", id: g.s.stack.at(-1)!.id };
    g.s = run(g.s, planActivate(g.s, g.ap, g.ids[0]!, 0));
    for (let i = 0; i < 10 && g.s.pending?.kind !== "chooseTargets"; i++) g.s = act(g.s, { type: "passPriority", player: waitingOn(g.s)! });
    g.s = choose(g.s, [theirAbility]);
    expect(life(g.s, g.ap)).toBe(40);
    expect(zone(g.s, g.ids[0]!)).toBe("graveyard");
    void theirs;
  });

  it("Campfire puts your commander from the command zone into your hand and shuffles your graveyard into your library", () => {
    let { s, ap } = setup([]);
    const c = putOnBattlefield(s, ap, campfire);
    const cmdr = s.players[ap]!.command.find((id) => s.objects[id]!.isCommander)!;
    const y = into(s, ap, opt, "graveyard");
    s = resolveAll(run(s, planActivate(s, ap, c, 1)));
    expect(zone(s, cmdr)).toBe("hand");
    expect(zone(s, y)).toBe("library");
    expect(zone(s, c)).toBe("exile");
  });

  it("Radiant Destiny: creatures of the chosen type get +1/+1, and with the city's blessing also have vigilance", () => {
    let { s, ap } = setup([]);
    const r = putOnBattlefield(s, ap, radiantDestiny);
    s.objects[r]!.chosen = { type: "Bear" };
    const b = putOnBattlefield(s, ap, bear());
    const k = putOnBattlefield(s, ap, blackKnight);
    invalidateCharacteristics(s);
    expect(pt(s, b)).toEqual([3, 3]);
    expect(pt(s, k)).toEqual([2, 2]);
    expect(objHasKeyword(s, s.objects[b]!, "Vigilance")).toBe(false);
    s.players[ap]!.citysBlessing = true;
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[b]!, "Vigilance")).toBe(true);
    expect(objHasKeyword(s, s.objects[k]!, "Vigilance")).toBe(false);
  });

  it("Lifecraft Engine: crewed, it's the chosen type too, but doesn't give itself +1/+1", () => {
    let { s, ap } = setup([]);
    const e = putOnBattlefield(s, ap, lifecraftEngine);
    s.objects[e]!.chosen = { type: "Bear" };
    const b = putOnBattlefield(s, ap, bear());
    const p = putOnBattlefield(s, ap, pilot);
    invalidateCharacteristics(s);
    expect(pt(s, b)).toEqual([3, 3]);
    expect(pt(s, p)).toEqual([3, 3]);
    expect(chars(s, e).subtypes).not.toContain("Bear");
    s = resolveAll(act(s, { type: "activateAbility", player: ap, objectId: e, index: 0, tapCreatures: [p] }));
    expect(chars(s, e).types).toContain("Creature");
    expect(chars(s, e).subtypes).toEqual(expect.arrayContaining(["Vehicle", "Bear"]));
    expect(pt(s, e)).toEqual([4, 4]);
  });

  it("Nicanzil: exploring a land lets you put a land from your hand onto the battlefield tapped; a nonland card gives it a counter", () => {
    for (const land of [true, false]) {
      let { s, ap } = setup([]);
      const n = putOnBattlefield(s, ap, nicanzil);
      const m = putOnBattlefield(s, ap, mapper);
      const b = putOnBattlefield(s, ap, bear());
      const top = into(s, ap, land ? island : opt, "library");
      const inHand = into(s, ap, island, "hand");
      s = run(s, planActivate(s, ap, m, 0, [tgt(b)]));
      for (let i = 0; i < 20 && (s.stack.length || s.pending); i++) {
        const p = s.pending;
        if (p?.kind === "chooseMay") s = may(s, true);
        else if (p?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: ap, found: [inHand] });
        else if (p) throw new Error(`unexpected ${p.kind}`);
        else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
      expect(zone(s, top)).toBe(land ? "hand" : "graveyard"); // the nonland card: "yes" puts it into the graveyard
      expect(counters(s, n)).toBe(land ? 0 : 1);
      expect(zone(s, inHand)).toBe(land ? "battlefield" : "hand");
      if (land) expect(s.objects[inHand]!.tapped).toBe(true);
    }
  });

  it("Mayael's Aria checks each power as it resolves: counters at 5, then 10 life at 10, then the game at 20", () => {
    const upkeep = (powers: number[]) => {
      let { s, ap } = setup([]);
      putOnBattlefield(s, ap, mayaelsAria);
      const ids = powers.map((p) => putOnBattlefield(s, ap, card("Test Beast", "Creature — Beast", "{1}", { power: String(p), toughness: "1" })));
      s = passUntil(s, "end", ap);
      s = resolveAll(passUntil(s, "upkeep", ap, 4000));
      s = resolveAll(s);
      return { s, ap, ids };
    };
    let r = upkeep([4, 2]); // a 4-power creature doesn't count
    expect(r.ids.map((id) => counters(r.s, id))).toEqual([0, 0]);
    expect(life(r.s, r.ap)).toBe(40);
    // With power 5 it does; 10 life needs power 10 after the counters.
    r = upkeep([5, 2]);
    expect(r.ids.map((id) => counters(r.s, id))).toEqual([1, 1]);
    expect(life(r.s, r.ap)).toBe(40);
    r = upkeep([9]);
    expect(counters(r.s, r.ids[0]!)).toBe(1);
    expect(life(r.s, r.ap)).toBe(50); // 9 + the counter = 10
    r = upkeep([19]);
    expect(r.s.winner).toBe(r.ap);
  });

  it("Commodore Guff's −3: draw X and X damage to each opponent, X the planeswalkers you control", () => {
    let { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, commodoreGuff);
    const w = putOnBattlefield(s, ap, card("Test Walker", "Legendary Planeswalker — Test", "{3}", { cmc: 3, loyalty: "5", oracleText: "+1: You gain 1 life." }));
    s.objects[g]!.counters.loyalty = 5;
    s.objects[w]!.counters.loyalty = 5;
    invalidateCharacteristics(s);
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planActivate(s, ap, g, 1)));
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    for (const p of s.turnOrder.filter((x) => x !== ap)) expect(life(s, p)).toBe(38);
  });

  it("Sigarda's Summons: creatures you control with +1/+1 counters are base 4/4 flying Angels (counters still apply)", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, sigardasSummons);
    const a = putOnBattlefield(s, ap, bear());
    const b = putOnBattlefield(s, ap, bear());
    s.objects[a]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s);
    expect(pt(s, a)).toEqual([5, 5]);
    expect(objHasKeyword(s, s.objects[a]!, "Flying")).toBe(true);
    expect(chars(s, a).subtypes).toEqual(expect.arrayContaining(["Bear", "Angel"]));
    expect(pt(s, b)).toEqual([2, 2]);
  });

  it("Prismatic Undercurrents: up to X basic lands, X the colors among permanents you control", () => {
    let { s, ap, ids } = setup([prismaticUndercurrents]);
    putOnBattlefield(s, ap, greenBear);
    putOnBattlefield(s, ap, blackKnight);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", max: 2 });
  });

  it("Urdnan: an attacker with a +1/+1 counter gains first strike, or double strike with two or more", () => {
    for (const n of [1, 2]) {
      let { s, ap, opp } = setup([]);
      putOnBattlefield(s, ap, urdnan);
      const b = putOnBattlefield(s, ap, bear());
      s.objects[b]!.counters["+1/+1"] = n;
      invalidateCharacteristics(s);
      s = choose(attack(s, ap, opp, [b]), [tgt(b)]);
      expect(objHasKeyword(s, s.objects[b]!, "Double strike")).toBe(n === 2);
      expect(objHasKeyword(s, s.objects[b]!, "First strike")).toBe(n === 1);
    }
  });
});
