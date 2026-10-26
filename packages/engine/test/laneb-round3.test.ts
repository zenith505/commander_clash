// Lane B, round 3: the least played cards first, working up the popularity list (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { blockProblem, botActions, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, parseManaCost, planActivate, planCast, planMana, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { attackProblem } from "../src";
import { cantBlockNow, potentialAttackers } from "../src/game";

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
/** The player the game waits on answers the way a bot would. */
const botAnswer = (s: GameState) => act(s, botActions(s, s.pending!.player as PlayerId)[0]!);
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % s.turnOrder.length]!;
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const creature = (name: string, typeLine: string, manaCost: string, p: number, t: number, extra: Partial<CardDef> = {}) =>
  card(name, typeLine, manaCost, { power: String(p), toughness: String(t), ...extra });
const redBear = () => creature("Red Bear", "Creature — Bear", "{1}{R}", 2, 2);
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2);
const whiteBear = () => creature("White Bear", "Creature — Bear", "{1}{W}", 2, 2);
const blueBear = () => creature("Blue Bear", "Creature — Bear", "{1}{U}", 2, 2);
const blackBear = () => creature("Black Bear", "Creature — Bear", "{1}{B}", 2, 2);
const into = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" = "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const attach = (s: GameState, aura: string, to: string) => {
  s.objects[aura]!.attachedTo = to;
  invalidateCharacteristics(s);
};
/** Attackers declared, the game paused on the defending player's blocks. */
const toBlocks = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) => {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Blocks declared by `opp`; every other defending player declares none. */
const block = (s: GameState, opp: PlayerId, blocks: { blocker: string; attacker: string }[]) => {
  s = act(s, { type: "declareBlockers", player: opp, blocks });
  for (let i = 0; i < 10 && s.pending?.kind === "declareBlockers"; i++) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
  return s;
};

// Real oracle text (Scryfall).
const phyrexianBoon = card("Phyrexian Boon", "Enchantment — Aura", "{2}{B}", { cmc: 3, keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +2/+1 as long as it's black. Otherwise, it gets -1/-2." });
const serrasBoon = card("Serra's Boon", "Enchantment — Aura", "{2}{W}", { cmc: 3, keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +1/+2 as long as it's white. Otherwise, it gets -2/-1." });
const clutchOfUndeath = card("Clutch of Undeath", "Enchantment — Aura", "{3}{B}{B}", { cmc: 5, keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +3/+3 as long as it's a Zombie. Otherwise, it gets -3/-3." });
const nyxInfusion = card("Nyx Infusion", "Enchantment — Aura", "{2}{B}", { cmc: 3, keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +2/+2 as long as it's an enchantment. Otherwise, it gets -2/-2." });
const spectralCloak = card("Spectral Cloak", "Enchantment — Aura", "{U}{U}", { cmc: 2, keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature has shroud as long as it's untapped. (It can't be the target of spells or abilities.)" });
const intrepidAce = card("Intrepid Ace", "Creature — Human Pilot", "{R}", { cmc: 1, power: "2", toughness: "1", oracleText: "This creature gets +2/+0 as long as it isn't attacking or blocking." });
const mistformWall = card("Mistform Wall", "Creature — Illusion Wall", "{2}{U}", { cmc: 3, power: "1", toughness: "4", oracleText: "This creature has defender as long as it's a Wall.\n{1}: This creature becomes the creature type of your choice until end of turn." });
const sereneHeart = card("Serene Heart", "Instant", "{1}{G}", { cmc: 2, oracleText: "Destroy all Auras." });
const stenchOfDecay = card("Stench of Decay", "Instant", "{1}{B}{B}", { cmc: 3, oracleText: "Nonartifact creatures get -1/-1 until end of turn." });
const flashOfDefiance = card("Flash of Defiance", "Sorcery", "{1}{R}", { cmc: 2, keywords: ["Flashback"], oracleText: "Green creatures and white creatures can't block this turn.\nFlashback—{1}{R}, Pay 3 life. (You may cast this card from your graveyard for its flashback cost. Then exile it.)" });
const purge = card("Purge", "Instant", "{1}{W}", { cmc: 2, oracleText: "Destroy target artifact creature or black creature. It can't be regenerated." });
const surgeOfRighteousness = card("Surge of Righteousness", "Instant", "{1}{W}", { cmc: 2, oracleText: "Destroy target black or red creature that's attacking or blocking. You gain 2 life." });
const terminalCriticism = card("Terminal Criticism", "Instant", "{1}{B}", { cmc: 2, oracleText: "Destroy target creature or planeswalker that's blue or red. You gain 1 life." });
const essenceBurn = card("Essence Burn", "Instant", "{1}{R}", { cmc: 2, oracleText: "Essence Burn deals 5 damage to target black or green creature or planeswalker. If that permanent would die this turn, exile it instead." });
const exileIntoDarkness = card("Exile into Darkness", "Sorcery", "{4}{B}", { cmc: 5, oracleText: "Target player sacrifices a creature of their choice with mana value 3 or less.\nAt the beginning of your upkeep, if you have more cards in hand than each opponent, you may return this card from your graveyard to your hand." });
const selfinflictedWound = card("Self-Inflicted Wound", "Sorcery", "{1}{B}", { cmc: 2, oracleText: "Target opponent sacrifices a green or white creature of their choice. If that player does, they lose 2 life." });
const imperialEdict = card("Imperial Edict", "Sorcery", "{1}{B}", { cmc: 2, oracleText: "Target opponent chooses a creature they control. Destroy that creature." });
const ravingOniSlave = card("Raving Oni-Slave", "Creature — Ogre Warrior", "{1}{B}", { cmc: 2, power: "3", toughness: "3", oracleText: "When this creature enters or leaves the battlefield, you lose 3 life if you don't control a Demon." });
const takenumaBleeder = card("Takenuma Bleeder", "Creature — Ogre Shaman", "{2}{B}", { cmc: 3, power: "3", toughness: "3", oracleText: "Whenever this creature attacks or blocks, you lose 1 life if you don't control a Demon." });
const scourgeOfNumai = card("Scourge of Numai", "Creature — Demon Spirit", "{3}{B}", { cmc: 4, power: "4", toughness: "4", oracleText: "At the beginning of your upkeep, you lose 2 life if you don't control an Ogre." });
const riteOfTheSerpent = card("Rite of the Serpent", "Sorcery", "{4}{B}{B}", { cmc: 6, oracleText: "Destroy target creature. If that creature had a +1/+1 counter on it, create a 1/1 green Snake creature token." });
const starfall = card("Starfall", "Instant", "{4}{R}", { cmc: 5, oracleText: "Starfall deals 3 damage to target creature. If that creature is an enchantment, Starfall deals 3 damage to that creature's controller." });
const drudgeSentinel = card("Drudge Sentinel", "Creature — Skeleton Warrior", "{2}{B}", { cmc: 3, power: "2", toughness: "1", oracleText: "{3}: Tap this creature. It gains indestructible until end of turn. (Damage and effects that say \"destroy\" don't destroy it.)" });
const standTogether = card("Stand Together", "Instant", "{3}{G}{G}", { cmc: 5, oracleText: "Put two +1/+1 counters on target creature and two +1/+1 counters on another target creature." });
const grounded = card("Grounded", "Enchantment — Aura", "{1}{G}", { cmc: 2, keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature loses flying." });
const timberpackWolf = card("Timberpack Wolf", "Creature — Wolf", "{1}{G}", { cmc: 2, power: "2", toughness: "2", oracleText: "This creature gets +1/+1 for each other creature you control named Timberpack Wolf." });
const clericOfTheForwardOrder = card("Cleric of the Forward Order", "Creature — Human Cleric", "{1}{W}", { cmc: 2, power: "2", toughness: "2", oracleText: "When this creature enters, you gain 2 life for each creature you control named Cleric of the Forward Order." });
const trainingDrone = card("Training Drone", "Artifact Creature — Drone", "{3}", { cmc: 3, power: "4", toughness: "4", oracleText: "This creature can't attack or block unless it's equipped." });
const spitfireHandler = card("Spitfire Handler", "Creature — Goblin", "{1}{R}", { cmc: 2, power: "1", toughness: "1", oracleText: "This creature can't block creatures with power greater than this creature's power.\n{R}: This creature gets +1/+0 until end of turn." });
const junkGolem = card("Junk Golem", "Artifact Creature — Golem", "{4}", { cmc: 4, power: "0", toughness: "0", oracleText: "This creature enters with three +1/+1 counters on it.\nAt the beginning of your upkeep, sacrifice this creature unless you remove a +1/+1 counter from it.\n{1}, Discard a card: Put a +1/+1 counter on this creature." });
const pryingQuestions = card("Prying Questions", "Sorcery", "{2}{B}", { cmc: 3, oracleText: "Target opponent loses 3 life and puts a card from their hand on top of their library." });
const chimneyImp = card("Chimney Imp", "Creature — Imp", "{4}{B}", { cmc: 5, power: "1", toughness: "2", keywords: ["Flying"], oracleText: "Flying\nWhen this creature dies, target opponent puts a card from their hand on top of their library." });
const sadisticAugermage = card("Sadistic Augermage", "Creature — Human Wizard", "{2}{B}", { cmc: 3, power: "3", toughness: "1", oracleText: "When this creature dies, each player puts a card from their hand on top of their library." });
const stuntedGrowth = card("Stunted Growth", "Sorcery", "{3}{G}{G}", { cmc: 5, oracleText: "Target player chooses three cards from their hand and puts them on top of their library in any order." });
const perishTheThought = card("Perish the Thought", "Sorcery", "{2}{B}", { cmc: 3, oracleText: "Target opponent reveals their hand. You choose a card from it. That player shuffles that card into their library." });
const wuSpy = card("Wu Spy", "Creature — Human Soldier Rogue", "{1}{U}", { cmc: 2, power: "1", toughness: "1", oracleText: "When this creature enters, look at the top two cards of target player's library. Put one of them into their graveyard." });
const cruelFate = card("Cruel Fate", "Sorcery", "{4}{U}", { cmc: 5, oracleText: "Look at the top five cards of target opponent's library. Put one of those cards into that player's graveyard and the rest on top of their library in any order." });
const rhysticSyphon = card("Rhystic Syphon", "Sorcery", "{3}{B}{B}", { cmc: 5, oracleText: "Unless target player pays {3}, that player loses 5 life and you gain 5 life." });
const rhysticShield = card("Rhystic Shield", "Instant", "{1}{W}", { cmc: 2, oracleText: "Creatures you control get +0/+1 until end of turn. They get an additional +0/+2 until end of turn unless any player pays {2}." });
const wildMight = card("Wild Might", "Instant", "{1}{G}", { cmc: 2, oracleText: "Target creature gets +1/+1 until end of turn. That creature gets an additional +4/+4 until end of turn unless any player pays {2}." });
const vectisDominator = card("Vectis Dominator", "Artifact Creature — Human Wizard", "{1}{W}{B}", { cmc: 3, power: "0", toughness: "2", oracleText: "{T}: Tap target creature unless its controller pays 2 life." });
const soulRend = card("Soul Rend", "Instant", "{1}{B}", { cmc: 2, oracleText: "Destroy target creature if it's white. A creature destroyed this way can't be regenerated.\nDraw a card at the beginning of the next turn's upkeep." });
const redeem = card("Redeem", "Instant", "{1}{W}", { cmc: 2, oracleText: "Prevent all damage that would be dealt this turn to up to two target creatures." });
const laquatussDisdain = card("Laquatus's Disdain", "Instant", "{1}{U}", { cmc: 2, oracleText: "Counter target spell cast from a graveyard.\nDraw a card." });
const ertaisTrickery = card("Ertai's Trickery", "Instant", "{U}", { cmc: 1, oracleText: "Counter target spell if it was kicked." });
const graveServitude = card("Grave Servitude", "Enchantment — Aura", "{1}{B}", { cmc: 2, keywords: ["Enchant"], oracleText: "You may cast this spell as though it had flash. If you cast it any time a sorcery couldn't have been cast, the controller of the permanent it becomes sacrifices it at the beginning of the next cleanup step.\nEnchant creature\nEnchanted creature gets +3/-1 and is black." });
const templeThief = card("Temple Thief", "Creature — Human Rogue", "{1}{B}", { cmc: 2, power: "2", toughness: "2", oracleText: "This creature can't be blocked by enchanted creatures or enchantment creatures." });
const songOfSerenity = card("Song of Serenity", "Enchantment", "{1}{G}", { cmc: 2, oracleText: "Creatures that are enchanted can't attack or block." });
const swarmbornGiant = card("Swarmborn Giant", "Creature — Giant", "{2}{G}{G}", { cmc: 4, power: "6", toughness: "6", keywords: ["Monstrosity"], oracleText: "When you're dealt combat damage, sacrifice this creature.\n{4}{G}{G}: Monstrosity 2. (If this creature isn't monstrous, put two +1/+1 counters on it and it becomes monstrous.)\nAs long as this creature is monstrous, it has reach." });
const leylinePhantom = card("Leyline Phantom", "Creature — Illusion", "{4}{U}", { cmc: 5, power: "5", toughness: "5", oracleText: "When this creature deals combat damage, return it to its owner's hand. (Return it only if it survived combat.)" });
const seaDrake = card("Sea Drake", "Creature — Drake", "{2}{U}", { cmc: 3, power: "4", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, return two target lands you control to their owner's hand." });
const zhangLiaoHeroOfHefei = card("Zhang Liao, Hero of Hefei", "Legendary Creature — Human Soldier", "{4}{B}{B}", { cmc: 6, power: "3", toughness: "3", oracleText: "Whenever Zhang Liao deals damage to an opponent, that opponent discards a card." });

// Cards the same templates support too.
const benthicore = card("Benthicore", "Creature — Elemental", "{6}{U}", { cmc: 7, power: "5", toughness: "5", oracleText: "When this creature enters, create two 1/1 blue Merfolk Wizard creature tokens.\nTap two untapped Merfolk you control: Untap this creature. It gains shroud until end of turn. (It can't be the target of spells or abilities.)" });
const chitteringRats = card("Chittering Rats", "Creature — Rat", "{1}{B}{B}", { cmc: 3, power: "2", toughness: "2", oracleText: "When this creature enters, target opponent puts a card from their hand on top of their library." });
const devoutDecree = card("Devout Decree", "Sorcery", "{1}{W}", { cmc: 2, keywords: ["Scry"], oracleText: "Exile target creature or planeswalker that's black or red. Scry 1. (Look at the top card of your library. You may put that card on the bottom.)" });
const dropkickBomber = card("Dropkick Bomber", "Creature — Goblin Warrior", "{2}{R}", { cmc: 3, power: "2", toughness: "3", oracleText: "Other Goblins you control get +1/+1.\n{R}: Until end of turn, another target Goblin you control gains flying and \"When this creature deals combat damage, sacrifice it.\"" });
const fry = card("Fry", "Instant", "{1}{R}", { cmc: 2, oracleText: "This spell can't be countered.\nFry deals 5 damage to target creature or planeswalker that's white or blue." });
const giftOfFangs = card("Gift of Fangs", "Enchantment — Aura", "{B}", { cmc: 1, keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +2/+2 as long as it's a Vampire. Otherwise, it gets -2/-2." });
const gravitySphere = card("Gravity Sphere", "World Enchantment", "{2}{R}", { cmc: 3, oracleText: "All creatures lose flying." });
const necrite = card("Necrite", "Creature — Thrull", "{1}{B}{B}", { cmc: 3, power: "2", toughness: "2", oracleText: "Whenever this creature attacks and isn't blocked, you may sacrifice it. If you do, destroy target creature defending player controls. It can't be regenerated." });
const noxiousGrasp = card("Noxious Grasp", "Instant", "{1}{B}", { cmc: 2, oracleText: "Destroy target creature or planeswalker that's green or white. You gain 1 life." });
const rashelFistOfTorm = card("Rashel, Fist of Torm", "Legendary Creature — Human Knight", "{2}{W}{W}", { cmc: 4, power: "2", toughness: "4", keywords: ["Double strike"], oracleText: "Double strike\nAuras you control have exalted. (Whenever a creature you control attacks alone, it gets +1/+1 until end of turn for each instance of exalted among permanents you control.)" });
const refuteDestiny = card("Refute Destiny", "Sorcery", "{1}{W}", { cmc: 2, keywords: ["Surveil"], oracleText: "Exile target creature or planeswalker that's green or blue. Surveil 1. (Look at the top card of your library. You may put it into your graveyard.)" });
const ruthlessInvasion = card("Ruthless Invasion", "Sorcery", "{3}{R/P}", { cmc: 4, oracleText: "({R/P} can be paid with either {R} or 2 life.)\nNonartifact creatures can't block this turn." });
const seaLegs = card("Sea Legs", "Enchantment — Aura", "{U}", { cmc: 1, keywords: ["Enchant","Flash"], oracleText: "Flash\nEnchant creature\nEnchanted creature gets +0/+2 as long as it's a Pirate. Otherwise, it gets -2/-0." });
const seasonedHallowblade = card("Seasoned Hallowblade", "Creature — Human Warrior", "{1}{W}", { cmc: 2, power: "3", toughness: "1", oracleText: "Discard a card: Tap this creature. It gains indestructible until end of turn. (Damage and effects that say \"destroy\" don't destroy it.)" });
const sinisterStrength = card("Sinister Strength", "Enchantment — Aura", "{1}{B}", { cmc: 2, keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +3/+1 and is black." });
const volrathsDungeon = card("Volrath's Dungeon", "Enchantment", "{2}{B}{B}", { cmc: 4, oracleText: "Pay 5 life: Destroy this enchantment. Any player may activate this ability but only during their turn.\nDiscard a card: Target player puts a card from their hand on top of their library. Activate only as a sorcery." });
const simple = card("Simple", "Sorcery", "{1}{G}{W}", { cmc: 3, oracleText: "Destroy all Auras and Equipment." }); // Pure // Simple's right half

describe("Auras: gets +N/+N as long as it's X, otherwise -N/-N; shroud as long as it's untapped; loses flying; gets +3/-1 and is black (CR 613.1d, 613.4c)", () => {
  it("are fully supported", () => supported(phyrexianBoon, serrasBoon, clutchOfUndeath, nyxInfusion, spectralCloak, grounded, graveServitude));

  it("Phyrexian Boon, Serra's Boon, Clutch of Undeath and Nyx Infusion check the enchanted creature's color or type", () => {
    const { s, ap } = setup([]);
    const black = putOnBattlefield(s, ap, blackBear());
    const green = putOnBattlefield(s, ap, greenBear());
    const white = putOnBattlefield(s, ap, whiteBear());
    const zombie = putOnBattlefield(s, ap, creature("Zombie", "Creature — Zombie", "{1}{B}", 2, 2));
    const ench = putOnBattlefield(s, ap, creature("Nyx Bear", "Enchantment Creature — Bear", "{1}{G}", 2, 2));
    const pairs: [CardDef, string, string][] = [
      [phyrexianBoon, black, "4/3"], [phyrexianBoon, green, "1/0"],
      [serrasBoon, white, "3/4"], [serrasBoon, green, "0/1"],
      [clutchOfUndeath, zombie, "5/5"], [clutchOfUndeath, black, "-1/-1"],
      [nyxInfusion, ench, "4/4"], [nyxInfusion, white, "0/0"],
    ];
    for (const [def, to, want] of pairs) {
      const t = setup([]);
      const c = putOnBattlefield(t.s, t.ap, s.cards[s.objects[to]!.cardId]!);
      const a = putOnBattlefield(t.s, t.ap, def);
      attach(t.s, a, c);
      expect(pt(t.s, c), `${def.name} on ${s.cards[s.objects[to]!.cardId]!.name}`).toBe(want);
    }
  });

  it("the Boon follows a color change: Phyrexian Boon on a creature that becomes black", () => {
    const { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, greenBear());
    const a = putOnBattlefield(s, ap, phyrexianBoon);
    attach(s, a, g);
    expect(pt(s, g)).toBe("1/0");
    const gs = putOnBattlefield(s, ap, graveServitude);
    attach(s, gs, g);
    // Grave Servitude: +3/-1 and black, so Phyrexian Boon now gives +2/+1.
    expect(characteristics(s, s.objects[g]!).colors).toEqual(["B"]);
    expect(pt(s, g)).toBe("7/2");
  });

  it("Spectral Cloak gives shroud only while the creature is untapped; Grounded removes flying", () => {
    const { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, blueBear());
    const a = putOnBattlefield(s, ap, spectralCloak);
    attach(s, a, b);
    expect(objHasKeyword(s, s.objects[b]!, "Shroud")).toBe(true);
    s.objects[b]!.tapped = true;
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[b]!, "Shroud")).toBe(false);
    const bird = putOnBattlefield(s, ap, creature("Bird", "Creature — Bird", "{U}", 1, 1, { keywords: ["Flying"], oracleText: "Flying" }));
    const gr = putOnBattlefield(s, ap, grounded);
    expect(objHasKeyword(s, s.objects[bird]!, "Flying")).toBe(true);
    attach(s, gr, bird);
    expect(objHasKeyword(s, s.objects[bird]!, "Flying")).toBe(false);
  });
});

describe("~ gets or has ... as long as it isn't attacking or blocking, it's a Wall; +1/+1 for each other creature named ~", () => {
  it("are fully supported", () => supported(intrepidAce, mistformWall, timberpackWolf, clericOfTheForwardOrder));

  it("Intrepid Ace is 4/1 out of combat and 2/1 while attacking", () => {
    let { s, ap } = setup([]);
    const ace = putOnBattlefield(s, ap, intrepidAce);
    expect(pt(s, ace)).toBe("4/1");
    s = toBlocks(s, ap, [{ attacker: ace, defender: next(s, ap) }]);
    expect(pt(s, ace)).toBe("2/1");
  });

  it("Mistform Wall has defender while it's a Wall, and loses it as another creature type", () => {
    let { s, ap } = setup([]);
    const w = putOnBattlefield(s, ap, mistformWall);
    expect(objHasKeyword(s, s.objects[w]!, "Defender")).toBe(true);
    s = run(s, planActivate(s, ap, w, 0));
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap });
    s = act(s, { type: "chooseOption", player: ap, choice: "Bird" });
    expect(characteristics(s, s.objects[w]!).subtypes).toEqual(["Bird"]);
    expect(objHasKeyword(s, s.objects[w]!, "Defender")).toBe(false);
  });

  it("Timberpack Wolf counts the other Wolves named Timberpack Wolf; Cleric of the Forward Order counts itself too", () => {
    let { s, ap, ids } = setup([clericOfTheForwardOrder]);
    const w1 = putOnBattlefield(s, ap, timberpackWolf);
    expect(pt(s, w1)).toBe("2/2");
    putOnBattlefield(s, ap, timberpackWolf);
    putOnBattlefield(s, next(s, ap), timberpackWolf); // not yours
    expect(pt(s, w1)).toBe("3/3");
    putOnBattlefield(s, ap, clericOfTheForwardOrder);
    const life = s.players[ap]!.life;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.players[ap]!.life).toBe(life + 4);
  });
});

describe("Destroy all Auras; nonartifact creatures get -1/-1; green creatures and white creatures can't block", () => {
  it("are fully supported", () => supported(sereneHeart, stenchOfDecay, flashOfDefiance));

  it("Serene Heart destroys every Aura and nothing else", () => {
    let { s, ap, ids } = setup([sereneHeart]);
    const opp = next(s, ap);
    const b = putOnBattlefield(s, opp, greenBear());
    const a1 = putOnBattlefield(s, opp, grounded);
    attach(s, a1, b);
    const a2 = putOnBattlefield(s, ap, spectralCloak);
    attach(s, a2, b);
    const plain = putOnBattlefield(s, opp, card("Anthem", "Enchantment", "{W}"));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect([zone(s, a1), zone(s, a2), zone(s, plain), zone(s, b)]).toEqual(["graveyard", "graveyard", "battlefield", "battlefield"]);
  });

  it("Stench of Decay shrinks nonartifact creatures only", () => {
    let { s, ap, ids } = setup([stenchOfDecay]);
    const b = putOnBattlefield(s, next(s, ap), greenBear());
    const golem = putOnBattlefield(s, next(s, ap), creature("Golem", "Artifact Creature — Golem", "{3}", 3, 3));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect([pt(s, b), pt(s, golem)]).toEqual(["1/1", "3/3"]);
  });

  it("Flash of Defiance: green and white creatures can't block this turn, others can", () => {
    let { s, ap, ids } = setup([flashOfDefiance]);
    const opp = next(s, ap);
    const atk = putOnBattlefield(s, ap, redBear());
    const g = putOnBattlefield(s, opp, greenBear());
    const w = putOnBattlefield(s, opp, whiteBear());
    const u = putOnBattlefield(s, opp, blueBear());
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    s = toBlocks(s, ap, [{ attacker: atk, defender: opp }]);
    expect(blockProblem(s, s.objects[g]!, s.objects[atk]!)).not.toBeNull();
    expect(blockProblem(s, s.objects[w]!, s.objects[atk]!)).not.toBeNull();
    expect(blockProblem(s, s.objects[u]!, s.objects[atk]!)).toBeNull();
  });
});

describe("Destroy target artifact creature or black creature; black or red attacking or blocking creature; creature or planeswalker that's blue or red", () => {
  it("are fully supported", () => supported(purge, surgeOfRighteousness, terminalCriticism, essenceBurn, soulRend));
  const can = (s: GameState, pid: PlayerId, spell: string, t: string) => planCast(s, pid, spell, [tgt(t)]) !== null;

  it("Purge targets an artifact creature or a black creature, which can't be regenerated", () => {
    let { s, ap, ids } = setup([purge]);
    const opp = next(s, ap);
    const golem = putOnBattlefield(s, opp, creature("Golem", "Artifact Creature — Golem", "{3}", 3, 3));
    const blk = putOnBattlefield(s, opp, blackBear());
    const g = putOnBattlefield(s, opp, greenBear());
    const rock = putOnBattlefield(s, opp, card("Rock", "Artifact", "{1}"));
    expect([can(s, ap, ids[0]!, golem), can(s, ap, ids[0]!, blk), can(s, ap, ids[0]!, g), can(s, ap, ids[0]!, rock)]).toEqual([true, true, false, false]);
    s.objects[blk]!.regenShields = 1;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(blk)])));
    expect(zone(s, blk)).toBe("graveyard");
  });

  it("Surge of Righteousness needs a black or red creature in combat; Terminal Criticism a blue or red creature or planeswalker", () => {
    let { s, ap, ids } = setup([surgeOfRighteousness, terminalCriticism]);
    const opp = next(s, ap);
    const r = putOnBattlefield(s, ap, redBear());
    const r2 = putOnBattlefield(s, ap, redBear());
    const pw = putOnBattlefield(s, opp, card("Blue Walker", "Legendary Planeswalker — Jace", "{2}{U}", { loyalty: "3" }));
    const g = putOnBattlefield(s, opp, greenBear());
    expect(can(s, ap, ids[1]!, pw)).toBe(true);
    expect(can(s, ap, ids[1]!, g)).toBe(false);
    expect(can(s, ap, ids[1]!, r)).toBe(true);
    s = toBlocks(s, ap, [{ attacker: r, defender: opp }]);
    s = block(s, opp, []);
    for (let i = 0; i < 10 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(can(s, ap, ids[0]!, r)).toBe(true);
    expect(can(s, ap, ids[0]!, r2)).toBe(false); // not attacking
    const life = s.players[ap]!.life;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(r)])));
    expect([zone(s, r), s.players[ap]!.life]).toEqual(["graveyard", life + 2]);
  });

  it("Essence Burn deals 5 to a black or green creature or planeswalker and exiles it if it would die", () => {
    let { s, ap, ids } = setup([essenceBurn]);
    const opp = next(s, ap);
    const g = putOnBattlefield(s, opp, greenBear());
    const w = putOnBattlefield(s, opp, whiteBear());
    expect([can(s, ap, ids[0]!, g), can(s, ap, ids[0]!, w)]).toEqual([true, false]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(g)])));
    expect(zone(s, g)).toBe("exile");
  });

  it("Soul Rend destroys a white creature without regeneration, and nothing else; its controller draws next upkeep", () => {
    let { s, ap, ids } = setup([soulRend, soulRend]);
    const opp = next(s, ap);
    const w = putOnBattlefield(s, opp, whiteBear());
    const g = putOnBattlefield(s, opp, greenBear());
    s.objects[w]!.regenShields = 1;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(w)])));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(g)])));
    expect([zone(s, w), zone(s, g)]).toEqual(["graveyard", "battlefield"]);
    // Below the hand size, so nothing is discarded at cleanup.
    for (const id of s.players[ap]!.hand.splice(0)) (s.objects[id]!.zone = "graveyard"), s.players[ap]!.graveyard.push(id);
    s = passUntil(s, "draw", opp);
    expect(s.players[ap]!.hand.length).toBe(2);
  });
});

describe("Target player sacrifices a creature of their choice with mana value 3 or less; a green or white creature, and if they do; Imperial Edict", () => {
  it("are fully supported", () => supported(exileIntoDarkness, selfinflictedWound, imperialEdict));

  it("Exile into Darkness: the player sacrifices one with mana value 3 or less, never a bigger one", () => {
    let { s, ap, ids } = setup([exileIntoDarkness]);
    const opp = next(s, ap);
    const big = putOnBattlefield(s, opp, creature("Big", "Creature — Giant", "{4}{G}", 5, 5));
    const small = putOnBattlefield(s, opp, greenBear());
    const small2 = putOnBattlefield(s, opp, redBear());
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: opp });
    if (s.pending?.kind !== "pickPermanents") throw new Error();
    expect(new Set(s.pending.options)).toEqual(new Set([small, small2]));
    s = botAnswer(s);
    expect(zone(s, big)).toBe("battlefield");
    expect([zone(s, small), zone(s, small2)].filter((z) => z === "graveyard")).toHaveLength(1);
  });

  it("Self-Inflicted Wound: a green or white creature is sacrificed and its controller loses 2; with none, no life is lost", () => {
    let { s, ap, ids } = setup([selfinflictedWound, selfinflictedWound]);
    const opp = next(s, ap);
    const r = putOnBattlefield(s, opp, redBear());
    const life = s.players[opp]!.life;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect([zone(s, r), s.players[opp]!.life]).toEqual(["battlefield", life]);
    const w = putOnBattlefield(s, opp, whiteBear());
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [player(opp)])));
    if (s.pending) s = botAnswer(s);
    expect([zone(s, w), zone(s, r), s.players[opp]!.life]).toEqual(["graveyard", "battlefield", life - 2]);
  });

  it("Imperial Edict: the opponent chooses one of their creatures, and that one is destroyed (a bot gives up its least)", () => {
    let { s, ap, ids } = setup([imperialEdict]);
    const opp = next(s, ap);
    const big = putOnBattlefield(s, opp, creature("Big", "Creature — Giant", "{4}{G}", 5, 5));
    const small = putOnBattlefield(s, opp, creature("Tiny", "Creature — Elf", "{G}", 1, 1));
    putOnBattlefield(s, ap, greenBear()); // not theirs
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: opp, action: "choose", prompt: "click a creature you control. Imperial Edict destroys it." });
    if (s.pending?.kind !== "pickPermanents") throw new Error();
    expect(new Set(s.pending.options)).toEqual(new Set([big, small]));
    s = botAnswer(s);
    expect([zone(s, big), zone(s, small)]).toEqual(["battlefield", "graveyard"]);
  });

  it("Imperial Edict: a chosen indestructible creature survives (it's destroyed, not sacrificed)", () => {
    let { s, ap, ids } = setup([imperialEdict]);
    const opp = next(s, ap);
    const ind = putOnBattlefield(s, opp, creature("Stone", "Creature — Golem", "{G}", 1, 1, { keywords: ["Indestructible"], oracleText: "Indestructible" }));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    if (s.pending?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: opp, ids: [ind] });
    s = resolveAll(s);
    expect(zone(s, ind)).toBe("battlefield");
  });
});

describe("Destroy target creature; if it had a +1/+1 counter, if it's an enchantment; two targets get counters; prevent damage to up to two", () => {
  it("are fully supported", () => supported(riteOfTheSerpent, starfall, standTogether, redeem, drudgeSentinel));

  it("Rite of the Serpent makes a Snake only if the creature had a +1/+1 counter", () => {
    let { s, ap, ids } = setup([riteOfTheSerpent, riteOfTheSerpent]);
    const opp = next(s, ap);
    for (let i = 0; i < 2; i++) putOnBattlefield(s, ap, card("Swamp", "Basic Land — Swamp"));
    const a = putOnBattlefield(s, opp, greenBear());
    const b = putOnBattlefield(s, opp, greenBear());
    s.objects[b]!.counters["+1/+1"] = 1;
    const snakes = () => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]?.name === "Snake" || characteristics(s, s.objects[id]!).subtypes.includes("Snake")).length;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(a)])));
    expect([zone(s, a), snakes()]).toEqual(["graveyard", 0]);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    expect([zone(s, b), snakes()]).toEqual(["graveyard", 1]);
  });

  it("Starfall also hits the controller of an enchantment creature", () => {
    let { s, ap, ids } = setup([starfall, starfall]);
    const opp = next(s, ap);
    const plain = putOnBattlefield(s, opp, creature("Ox", "Creature — Ox", "{3}{W}", 2, 5));
    const ench = putOnBattlefield(s, opp, creature("Nyx Ox", "Enchantment Creature — Ox", "{3}{W}", 2, 5));
    const life = s.players[opp]!.life;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(plain)])));
    expect([s.objects[plain]!.damage, s.players[opp]!.life]).toEqual([3, life]);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(ench)])));
    expect([s.objects[ench]!.damage, s.players[opp]!.life]).toEqual([3, life - 3]);
  });

  it("Stand Together puts two counters on each of two different creatures", () => {
    let { s, ap, ids } = setup([standTogether]);
    const a = putOnBattlefield(s, ap, greenBear());
    const b = putOnBattlefield(s, ap, greenBear());
    expect(planCast(s, ap, ids[0]!, [tgt(a), tgt(a)])).toBeNull();
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(a), tgt(b)])));
    expect([pt(s, a), pt(s, b)]).toEqual(["4/4", "4/4"]);
  });

  it("Redeem prevents all damage this turn to its targets, up to two", () => {
    let { s, ap, ids } = setup([redeem, starfall]);
    const a = putOnBattlefield(s, ap, greenBear());
    const b = putOnBattlefield(s, ap, greenBear());
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(a), { kind: "none" }])));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(a)])));
    expect([zone(s, a), s.objects[a]!.damage]).toEqual(["battlefield", 0]);
    expect(zone(s, b)).toBe("battlefield");
  });

  it("Drudge Sentinel taps itself and gains indestructible until end of turn", () => {
    let { s, ap } = setup([]);
    const d = putOnBattlefield(s, ap, drudgeSentinel);
    s = resolveAll(run(s, planActivate(s, ap, d, 0)));
    expect(s.objects[d]!.tapped).toBe(true);
    expect(objHasKeyword(s, s.objects[d]!, "Indestructible")).toBe(true);
  });
});

describe("You lose N life if you don't control a Demon (or an Ogre); return two target lands you control", () => {
  it("are fully supported", () => supported(ravingOniSlave, takenumaBleeder, scourgeOfNumai, seaDrake));

  it("Raving Oni-Slave costs 3 life entering and leaving, but not while you control a Demon", () => {
    let { s, ap, ids } = setup([ravingOniSlave, ravingOniSlave]);
    const life = s.players[ap]!.life;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.players[ap]!.life).toBe(life - 3);
    putOnBattlefield(s, ap, scourgeOfNumai);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(s.players[ap]!.life).toBe(life - 3);
  });

  it("Takenuma Bleeder costs 1 life when it attacks without a Demon; Scourge of Numai 2 each upkeep without an Ogre", () => {
    let { s, ap } = setup([]);
    const tb = putOnBattlefield(s, ap, takenumaBleeder);
    const life = s.players[ap]!.life;
    s = toBlocks(s, ap, [{ attacker: tb, defender: next(s, ap) }]);
    expect(s.players[ap]!.life).toBe(life - 1);
    s = block(s, next(s, ap), []);
    s = passUntil(s, "end", ap);
    // An opponent's Scourge: no Ogre there, so it loses 2 at its upkeep; ap's Takenuma Bleeder doesn't help it.
    const opp = next(s, ap);
    putOnBattlefield(s, opp, scourgeOfNumai);
    const oppLife = s.players[opp]!.life;
    s = passUntil(s, "draw", opp);
    expect(s.players[opp]!.life).toBe(oppLife - 2);
    // ap's own Scourge with an Ogre (Takenuma Bleeder is one): no life lost.
    putOnBattlefield(s, ap, scourgeOfNumai);
    const apLife = s.players[ap]!.life;
    s = passUntil(s, "draw", ap);
    expect(s.players[ap]!.life).toBe(apLife);
  });

  it("Sea Drake returns two lands you control to their owner's hand", () => {
    let { s, ap, ids } = setup([seaDrake]);
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).types.includes("Land"));
    s = run(s, planCast(s, ap, ids[0]!));
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = botAnswer(s);
    s = resolveAll(s);
    expect(lands.filter((id) => zone(s, id) === "hand")).toHaveLength(2);
  });
});

describe("Can't attack or block unless it's equipped; can't block greater power; can't be blocked by enchanted or enchantment creatures; enchanted creatures can't attack or block", () => {
  it("are fully supported", () => supported(trainingDrone, spitfireHandler, templeThief, songOfSerenity));

  it("Training Drone attacks only while equipped", () => {
    let { s, ap } = setup([]);
    const d = putOnBattlefield(s, ap, trainingDrone);
    putOnBattlefield(s, ap, greenBear());
    s = passUntil(s, "declareAttackers", ap);
    expect(potentialAttackers(s, ap).map((o) => o.id)).not.toContain(d);
    expect(cantBlockNow(s, s.objects[d]!)).toBe(true);
    const eq = putOnBattlefield(s, ap, card("Bonesplitter", "Artifact — Equipment", "{1}", { keywords: ["Equip"], oracleText: "Equipped creature gets +2/+0.\nEquip {1}" }));
    attach(s, eq, d);
    expect(potentialAttackers(s, ap).map((o) => o.id)).toContain(d);
    expect(cantBlockNow(s, s.objects[d]!)).toBe(false);
  });

  it("Spitfire Handler can't block a creature with greater power, and its pump lets it", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const sh = putOnBattlefield(s, opp, spitfireHandler);
    const atk = putOnBattlefield(s, ap, redBear());
    const small = putOnBattlefield(s, ap, creature("Squirrel", "Creature — Squirrel", "{G}", 1, 1));
    s = toBlocks(s, ap, [{ attacker: atk, defender: opp }, { attacker: small, defender: opp }]);
    expect(blockProblem(s, s.objects[sh]!, s.objects[atk]!)).toMatch(/greater power/);
    expect(blockProblem(s, s.objects[sh]!, s.objects[small]!)).toBeNull();
    s.objects[sh]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s);
    expect(blockProblem(s, s.objects[sh]!, s.objects[atk]!)).toBeNull();
  });

  it("Temple Thief can't be blocked by enchanted creatures or enchantment creatures; Song of Serenity stops enchanted creatures", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const tt = putOnBattlefield(s, ap, templeThief);
    const plain = putOnBattlefield(s, opp, greenBear());
    const enchanted = putOnBattlefield(s, opp, greenBear());
    const nyx = putOnBattlefield(s, opp, creature("Nyx Bear", "Enchantment Creature — Bear", "{1}{G}", 2, 2));
    const aura = putOnBattlefield(s, opp, card("Aura", "Enchantment — Aura", "{G}", { keywords: ["Enchant"], oracleText: "Enchant creature" }));
    attach(s, aura, enchanted);
    s = toBlocks(s, ap, [{ attacker: tt, defender: opp }]);
    expect(blockProblem(s, s.objects[plain]!, s.objects[tt]!)).toBeNull();
    expect(blockProblem(s, s.objects[enchanted]!, s.objects[tt]!)).not.toBeNull();
    expect(blockProblem(s, s.objects[nyx]!, s.objects[tt]!)).not.toBeNull();
    putOnBattlefield(s, ap, songOfSerenity);
    invalidateCharacteristics(s);
    const bear = putOnBattlefield(s, ap, greenBear());
    expect(blockProblem(s, s.objects[enchanted]!, s.objects[bear]!)).not.toBeNull();
    expect(blockProblem(s, s.objects[plain]!, s.objects[bear]!)).toBeNull();
  });

  it("Song of Serenity: an enchanted creature can't attack", () => {
    let { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, greenBear());
    const b2 = putOnBattlefield(s, ap, greenBear());
    putOnBattlefield(s, next(s, ap), songOfSerenity);
    const aura = putOnBattlefield(s, ap, card("Aura", "Enchantment — Aura", "{G}", { keywords: ["Enchant"], oracleText: "Enchant creature" }));
    attach(s, aura, b);
    s = passUntil(s, "declareAttackers", ap);
    expect(potentialAttackers(s, ap).map((o) => o.id)).not.toContain(b);
    expect(potentialAttackers(s, ap).map((o) => o.id)).toContain(b2);
  });
});

describe("Sacrifice ~ unless you remove a counter; when you're dealt combat damage; when ~ deals combat damage; damage to an opponent makes them discard", () => {
  it("are fully supported", () => supported(junkGolem, swarmbornGiant, leylinePhantom, zhangLiaoHeroOfHefei));

  it("Junk Golem: each upkeep, remove a counter or sacrifice it", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const g = putOnBattlefield(s, opp, junkGolem);
    s.objects[g]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s);
    s = passUntil(s, "upkeep", opp);
    s = resolveAll(s);
    // Removing the last counter: it's a 0/0 and dies anyway (CR 704.5f).
    expect(s.objects[g]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(zone(s, g)).toBe("graveyard");
    const t = setup([]);
    let s2 = t.s;
    const mine = putOnBattlefield(s2, next(s2, t.ap), junkGolem);
    s2.objects[mine]!.counters["+1/+1"] = 3;
    invalidateCharacteristics(s2);
    s2 = passUntil(s2, "upkeep", next(s2, t.ap));
    s2 = resolveAll(s2, false);
    expect(zone(s2, mine)).toBe("graveyard"); // declined, so sacrificed
  });

  it("Swarmborn Giant is sacrificed when its controller is dealt combat damage, not other damage", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const giant = putOnBattlefield(s, opp, swarmbornGiant);
    const atk = putOnBattlefield(s, ap, redBear());
    s = toBlocks(s, ap, [{ attacker: atk, defender: opp }]);
    s = block(s, opp, []);
    s = passUntil(s, "endCombat", ap);
    s = resolveAll(s);
    expect(zone(s, giant)).toBe("graveyard");
  });

  it("Leyline Phantom returns to its owner's hand after dealing combat damage; Zhang Liao makes the opponent it damages discard", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const lp = putOnBattlefield(s, ap, leylinePhantom);
    const zl = putOnBattlefield(s, ap, zhangLiaoHeroOfHefei);
    const hand = s.players[opp]!.hand.length;
    s = toBlocks(s, ap, [{ attacker: lp, defender: opp }, { attacker: zl, defender: opp }]);
    s = block(s, opp, []);
    for (let i = 0; i < 40 && s.step !== "endCombat"; i++) s = s.pending ? botAnswer(s) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(zone(s, lp)).toBe("hand");
    expect(s.players[opp]!.hand.length).toBe(hand - 1);
  });

  it("Leyline Phantom blocked by a creature that kills it isn't returned (it didn't survive)", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const lp = putOnBattlefield(s, ap, leylinePhantom);
    const wall = putOnBattlefield(s, opp, creature("Big", "Creature — Giant", "{4}{G}", 6, 6));
    s = toBlocks(s, ap, [{ attacker: lp, defender: opp }]);
    s = block(s, opp, [{ blocker: wall, attacker: lp }]);
    s = passUntil(s, "endCombat", ap);
    s = resolveAll(s);
    expect(zone(s, lp)).toBe("graveyard");
  });
});

describe("Unless target player pays, unless any player pays, unless its controller pays 2 life (CR 118.12)", () => {
  it("are fully supported", () => supported(rhysticSyphon, rhysticShield, wildMight, vectisDominator));
  /** Everyone passes until the stack is empty. A player in `payers` pays every "unless" cost (with their lands); the others don't. */
  const settle = (s: GameState, payers: PlayerId[] = [], asked: PlayerId[] = []) => {
    for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "chooseOption" && p.what === "punisher") {
        asked.push(p.player);
        s = act(s, { type: "chooseOption", player: p.player, choice: payers.includes(p.player) ? p.options[0]! : "none" });
      } else if (p?.kind === "payUnless") {
        if (!payers.includes(p.player)) asked.push(p.player);
        const yes = payers.includes(p.player);
        s = run(s, [...(yes && p.cost ? planMana(s, p.player, parseManaCost(p.cost))! : []), { type: "payUnless", player: p.player, pay: yes }]);
      } else if (p) s = botAnswer(s);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return s;
  };

  it("Rhystic Syphon drains 5 unless the target player pays {3}", () => {
    let { s, ap, ids } = setup([rhysticSyphon, rhysticSyphon]);
    const opp = next(s, ap);
    for (let i = 0; i < 4; i++) putOnBattlefield(s, ap, card("Swamp", "Basic Land — Swamp"));
    for (let i = 0; i < 3; i++) putOnBattlefield(s, opp, card("Forest", "Basic Land — Forest"));
    const [me, them] = [s.players[ap]!.life, s.players[opp]!.life];
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(s.pending).toMatchObject({ kind: "payUnless", player: opp });
    s = settle(s);
    expect([s.players[ap]!.life, s.players[opp]!.life]).toEqual([me + 5, them - 5]);
    s = settle(run(s, planCast(s, ap, ids[1]!, [player(opp)])), [opp]);
    expect([s.players[ap]!.life, s.players[opp]!.life]).toEqual([me + 5, them - 5]);
  });

  it("Wild Might: +5/+5 unless any player pays {2}; once one pays, it's +1/+1", () => {
    let { s, ap, ids } = setup([wildMight, wildMight]);
    const opp = next(s, ap);
    const b = putOnBattlefield(s, ap, greenBear());
    const asked: PlayerId[] = [];
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b)])), [], asked);
    expect(pt(s, b)).toBe("7/7");
    expect(asked).toContain(ap); // each player is asked, the caster too (rulings)
    for (let i = 0; i < 2; i++) putOnBattlefield(s, opp, card("Forest", "Basic Land — Forest"));
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(b)])), [opp]);
    expect(pt(s, b)).toBe("8/8");
  });

  it("Rhystic Shield: +0/+1 to your creatures, and +0/+2 more unless any player pays {2}", () => {
    let { s, ap, ids } = setup([rhysticShield]);
    const b = putOnBattlefield(s, ap, greenBear());
    const theirs = putOnBattlefield(s, next(s, ap), greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect([pt(s, b), pt(s, theirs)]).toEqual(["2/5", "2/2"]);
  });

  it("Vectis Dominator taps the creature unless its controller pays 2 life", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const vd = putOnBattlefield(s, ap, vectisDominator);
    const a = putOnBattlefield(s, opp, greenBear());
    const life = s.players[opp]!.life;
    s = resolveAll(run(s, planActivate(s, ap, vd, 0, [tgt(a)])));
    expect(s.pending).toMatchObject({ kind: "payUnless", player: opp });
    s = settle(s, [opp]);
    expect([s.objects[a]!.tapped, s.players[opp]!.life]).toEqual([false, life - 2]);
  });
});

describe("Counter target spell cast from a graveyard; counter target spell if it was kicked", () => {
  it("are fully supported", () => supported(laquatussDisdain, ertaisTrickery));

  it("Laquatus's Disdain counters a flashback spell, not one cast from a hand", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const fb = card("Think Twice", "Instant", "{1}{U}", { keywords: ["Flashback"], oracleText: "Draw a card.\nFlashback {2}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)" });
    const g = into(s, ap, fb, "graveyard");
    const h = into(s, ap, fb);
    const ld = into(s, opp, laquatussDisdain);
    for (let i = 0; i < 2; i++) putOnBattlefield(s, opp, card("Island", "Basic Land — Island"));
    s = run(s, planCast(s, ap, h));
    const handSpell = s.stack[s.stack.length - 1]!;
    expect(planCast(s, opp, ld, [{ kind: "stack", id: handSpell.id } as TargetChoice])).toBeNull();
    s = resolveAll(s);
    s = run(s, planCast(s, ap, g, undefined, undefined, undefined, undefined, { via: "flashback" }));
    const gySpell = s.stack[s.stack.length - 1]!;
    s = act(s, { type: "passPriority", player: ap });
    s = run(s, planCast(s, opp, ld, [{ kind: "stack", id: gySpell.id } as TargetChoice]));
    s = resolveAll(s);
    expect(zone(s, g)).toBe("exile"); // countered, flashback exiles it (CR 702.34a)
  });
});

describe("Counter target spell if it was kicked", () => {
  const burst = card("Burst Lightning", "Instant", "{R}", { keywords: ["Kicker"], oracleText: "Kicker {4} (You may pay an additional {4} as you cast this spell.)\nBurst Lightning deals 2 damage to any target. If this spell was kicked, it deals 4 damage instead." });

  it("Ertai's Trickery counters a kicked spell; an unkicked one resolves, and a bot won't waste it on one", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const b1 = into(s, ap, burst);
    const b2 = into(s, ap, burst);
    const et1 = into(s, opp, ertaisTrickery);
    const et2 = into(s, opp, ertaisTrickery);
    for (let i = 0; i < 2; i++) putOnBattlefield(s, opp, card("Island", "Basic Land — Island"));
    const life = s.players[opp]!.life;
    s = run(s, planCast(s, ap, b1, [player(opp)]));
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    expect(botActions(s, opp).some((a) => a.type === "castSpell" && a.objectId === et1)).toBe(false);
    s = run(s, planCast(s, opp, et1, [{ kind: "stack", id: s.stack[s.stack.length - 1]!.id } as TargetChoice]));
    s = resolveAll(s);
    expect(s.players[opp]!.life).toBe(life - 2);
    s = run(s, planCast(s, ap, b2, [player(opp)], undefined, "auto", undefined, { kicks: [0] }));
    s = act(s, { type: "passPriority", player: ap });
    s = run(s, planCast(s, opp, et2, [{ kind: "stack", id: s.stack[s.stack.length - 1]!.id } as TargetChoice]));
    s = resolveAll(s);
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(zone(s, b2)).toBe("graveyard");
  });
});

describe("Put cards from a hand on top of a library: target opponent, each player, three in any order; shuffle a chosen card in", () => {
  it("are fully supported", () => supported(pryingQuestions, chimneyImp, sadisticAugermage, stuntedGrowth, perishTheThought));

  it("Prying Questions: the opponent loses 3 and puts a card of their choice from hand on top", () => {
    let { s, ap, ids } = setup([pryingQuestions]);
    const opp = next(s, ap);
    const life = s.players[opp]!.life;
    const hand = [...s.players[opp]!.hand];
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.pending).toMatchObject({ kind: "handToTop", player: opp, count: 1 });
    s = act(s, { type: "handToTop", player: opp, objectIds: [hand[2]!] });
    expect(s.players[opp]!.library[0]).toBe(hand[2]);
    expect(s.players[opp]!.hand).toHaveLength(hand.length - 1);
  });

  it("Chimney Imp: when it dies, its target opponent puts a card on top; a bot answers", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const imp = putOnBattlefield(s, ap, chimneyImp);
    const hand = s.players[opp]!.hand.length;
    s.objects[imp]!.damage = 5;
    s = act(s, { type: "passPriority", player: waitingOn(s)! }); // state-based actions, then the trigger
    for (let i = 0; i < 20 && (s.pending || s.stack.length || s.triggerQueue.length); i++) {
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [player(opp)] } as Action);
      else if (s.pending) s = botAnswer(s);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(zone(s, imp)).toBe("graveyard");
    expect(s.players[opp]!.hand).toHaveLength(hand - 1);
  });

  it("Sadistic Augermage: each player with cards in hand puts one on top, in turn order; one with none is skipped", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const aug = putOnBattlefield(s, ap, sadisticAugermage);
    for (const id of s.players[opp]!.hand.splice(0)) (s.objects[id]!.zone = "graveyard"), s.players[opp]!.graveyard.push(id);
    const sizes = s.turnOrder.map((p) => s.players[p]!.hand.length);
    s.objects[aug]!.damage = 5;
    const asked: PlayerId[] = [];
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 30 && (s.pending || s.stack.length || s.triggerQueue.length); i++) {
      if (s.pending?.kind === "handToTop") asked.push(s.pending.player);
      s = s.pending ? botAnswer(s) : act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    const order = [0, 1, 2, 3].map((k) => s.turnOrder[(s.turnOrder.indexOf(ap) + k) % 4]!).filter((p) => p !== opp);
    expect(asked).toEqual(order);
    expect(s.turnOrder.map((p) => s.players[p]!.hand.length)).toEqual(sizes.map((n) => Math.max(0, n - 1)));
  });

  it("Stunted Growth: the target player chooses three cards and orders them on top", () => {
    let { s, ap, ids } = setup([stuntedGrowth]);
    const opp = next(s, ap);
    const hand = [...s.players[opp]!.hand];
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(s.pending).toMatchObject({ kind: "handToTop", player: opp, count: 3 });
    s = act(s, { type: "handToTop", player: opp, objectIds: [hand[0]!, hand[1]!, hand[2]!] });
    expect(new Set(s.players[opp]!.library.slice(0, 3))).toEqual(new Set(hand.slice(0, 3)));
    expect(s.players[opp]!.hand).toHaveLength(hand.length - 3);
  });

  it("Perish the Thought: you choose a card from the opponent's revealed hand and they shuffle it into their library", () => {
    let { s, ap, ids } = setup([perishTheThought]);
    const opp = next(s, ap);
    const hand = [...s.players[opp]!.hand];
    const lib = s.players[opp]!.library.length;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = act(s, { type: "searchLibrary", player: ap, found: [hand[1]!] });
    s = resolveAll(s);
    expect(zone(s, hand[1]!)).toBe("library");
    expect(s.players[opp]!.library).toHaveLength(lib + 1);
    expect(s.players[opp]!.hand).toHaveLength(hand.length - 1);
  });
});

describe("Look at the top cards of target player's library and put one into their graveyard (the rest on top in any order)", () => {
  it("are fully supported", () => supported(wuSpy, cruelFate));

  it("Wu Spy: one of the top two goes to that player's graveyard, the other stays on top", () => {
    let { s, ap, ids } = setup([wuSpy]);
    const opp = next(s, ap);
    const [t1, t2] = s.players[opp]!.library.slice(0, 2);
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 20 && s.pending?.kind !== "searchLibrary"; i++) {
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [player(opp)] } as Action);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 1, max: 1 });
    s = act(s, { type: "searchLibrary", player: ap, found: [t2!] });
    s = resolveAll(s);
    expect(zone(s, t2!)).toBe("graveyard");
    expect(s.players[opp]!.graveyard).toContain(t2);
    expect(s.players[opp]!.library[0]).toBe(t1);
  });

  it("Cruel Fate: one of five to the graveyard, and you order the other four on top", () => {
    let { s, ap, ids } = setup([cruelFate]);
    const opp = next(s, ap);
    const top = s.players[opp]!.library.slice(0, 5);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = act(s, { type: "searchLibrary", player: ap, found: [top[0]!] });
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap, how: "order", owner: opp });
    const order = [top[4]!, top[3]!, top[2]!, top[1]!];
    s = act(s, { type: "arrangeTop", player: ap, top: order, away: [] });
    s = resolveAll(s);
    expect(zone(s, top[0]!)).toBe("graveyard");
    expect(s.players[opp]!.library.slice(0, 4)).toEqual(order);
  });

  it("Cruel Fate: a bot casting it answers both questions", () => {
    let { s, ap, ids } = setup([cruelFate]);
    const opp = next(s, ap);
    const top = s.players[opp]!.library.slice(0, 5);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    for (let i = 0; i < 5 && s.pending; i++) s = botAnswer(s);
    expect(top.filter((id) => zone(s, id) === "graveyard")).toHaveLength(1);
    expect(new Set(s.players[opp]!.library.slice(0, 4))).toEqual(new Set(top.filter((id) => zone(s, id) === "library")));
  });
});

describe("Cards the same templates support too", () => {
  it("are fully supported", () => supported(benthicore, chitteringRats, devoutDecree, dropkickBomber, fry, giftOfFangs, gravitySphere, necrite, noxiousGrasp, rashelFistOfTorm, refuteDestiny, ruthlessInvasion, seaLegs, seasonedHallowblade, sinisterStrength, volrathsDungeon, simple));

  it("Rashel: Auras you control have exalted, so a creature attacking alone gets +1/+1 for each", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, rashelFistOfTorm);
    const b = putOnBattlefield(s, ap, greenBear());
    const a1 = putOnBattlefield(s, ap, card("Aura", "Enchantment — Aura", "{G}", { keywords: ["Enchant"], oracleText: "Enchant creature" }));
    const a2 = putOnBattlefield(s, ap, card("Aura", "Enchantment — Aura", "{G}", { keywords: ["Enchant"], oracleText: "Enchant creature" }));
    attach(s, a1, b);
    attach(s, a2, b);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: next(s, ap) }] });
    s = resolveAll(s);
    expect(pt(s, b)).toBe("4/4");
  });

  it("Simple destroys Auras and Equipment, not other enchantments or artifacts", () => {
    let { s, ap, ids } = setup([simple]);
    const b = putOnBattlefield(s, ap, greenBear());
    const aura = putOnBattlefield(s, ap, grounded);
    attach(s, aura, b);
    const eq = putOnBattlefield(s, ap, card("Bonesplitter", "Artifact — Equipment", "{1}", { keywords: ["Equip"], oracleText: "Equipped creature gets +2/+0.\nEquip {1}" }));
    const rock = putOnBattlefield(s, ap, card("Rock", "Artifact", "{1}"));
    const ench = putOnBattlefield(s, ap, card("Anthem", "Enchantment", "{W}"));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect([zone(s, aura), zone(s, eq), zone(s, rock), zone(s, ench)]).toEqual(["graveyard", "graveyard", "battlefield", "battlefield"]);
  });

  it("Leyline Phantom returns after dealing combat damage to a blocker it survives", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const lp = putOnBattlefield(s, ap, leylinePhantom);
    const chump = putOnBattlefield(s, opp, greenBear());
    s = toBlocks(s, ap, [{ attacker: lp, defender: opp }]);
    s = block(s, opp, [{ blocker: chump, attacker: lp }]);
    s = passUntil(s, "endCombat", ap);
    s = resolveAll(s);
    expect([zone(s, lp), zone(s, chump)]).toEqual(["hand", "graveyard"]);
  });

  it("Dropkick Bomber gives another Goblin flying and a sacrifice-after-combat-damage trigger", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    putOnBattlefield(s, ap, dropkickBomber);
    const gob = putOnBattlefield(s, ap, creature("Goblin", "Creature — Goblin", "{R}", 1, 1));
    const db = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Dropkick Bomber")!;
    expect(pt(s, gob)).toBe("2/2");
    s = resolveAll(run(s, planActivate(s, ap, db, 0, [tgt(gob)])));
    expect(objHasKeyword(s, s.objects[gob]!, "Flying")).toBe(true);
    s = toBlocks(s, ap, [{ attacker: gob, defender: opp }]);
    s = block(s, opp, []);
    const life = s.players[opp]!.life;
    s = passUntil(s, "endCombat", ap);
    s = resolveAll(s);
    expect([s.players[opp]!.life, zone(s, gob)]).toEqual([life - 2, "graveyard"]);
  });

  it("Necrite: attacking unblocked, it may be sacrificed to destroy a creature the defending player controls", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const n = putOnBattlefield(s, ap, necrite);
    const victim = putOnBattlefield(s, opp, creature("Flier", "Creature — Bird", "{U}", 1, 1, { keywords: ["Flying"], oracleText: "Flying" }));
    s.objects[victim]!.regenShields = 1;
    s = toBlocks(s, ap, [{ attacker: n, defender: opp }]);
    s = block(s, opp, []);
    for (let i = 0; i < 20 && zone(s, n) === "battlefield" && s.step !== "endCombat"; i++) {
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(victim)] } as Action);
      else if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: true });
      else if (s.pending) s = botAnswer(s);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    s = resolveAll(s);
    expect([zone(s, n), zone(s, victim)]).toEqual(["graveyard", "graveyard"]);
  });

  it("Chittering Rats makes the target opponent put a card from their hand on top", () => {
    let { s, ap } = setup([]);
    const t = setup([chitteringRats]);
    s = t.s;
    const opp = next(s, ap);
    const hand = s.players[opp]!.hand.length;
    s = run(s, planCast(s, ap, t.ids[0]!));
    for (let i = 0; i < 20 && (s.pending || s.stack.length || s.triggerQueue.length); i++) {
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [player(opp)] } as Action);
      else if (s.pending) s = botAnswer(s);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.players[opp]!.hand).toHaveLength(hand - 1);
  });
});

describe("Bots aim edicts, punishers and hand-to-library effects at an opponent", () => {
  it("a bot casting Imperial Edict, Rhystic Syphon, Stunted Growth or Exile into Darkness targets an opponent, not itself", () => {
    for (const def of [imperialEdict, rhysticSyphon, stuntedGrowth, exileIntoDarkness]) {
      let { s, ap, opp } = setup([def]);
      putOnBattlefield(s, opp, greenBear());
      putOnBattlefield(s, ap, greenBear());
      s.players[ap]!.command = []; // no commander to cast instead
      s.players[ap]!.hand = s.players[ap]!.hand.filter((id) => s.cards[s.objects[id]!.cardId]!.name === def.name);
      for (let i = 0; i < 30 && !s.stack.length; i++) {
        const a = botActions(s, ap)[0]!;
        if (a.type === "passPriority") break;
        s = act(s, a);
      }
      const item = s.stack[s.stack.length - 1];
      expect(item?.description, def.name).toBe(def.name);
      expect(item!.targets?.[0], def.name).toMatchObject({ kind: "player" });
      expect((item!.targets![0] as { id: PlayerId }).id, def.name).not.toBe(ap);
    }
  });
});
