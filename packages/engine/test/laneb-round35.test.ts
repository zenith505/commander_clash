// Lane B, round 35: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

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
/** Empties `pid`'s hand, so a whole turn's bot play doesn't cast what's there. */
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of s.players[pid]!.hand) s.objects[id]!.zone = "exile";
  s.players[pid]!.exile.push(...s.players[pid]!.hand);
  s.players[pid]!.hand = [];
};

// Real oracle text (Scryfall).
const aegisSculptor = () => card("Aegis Sculptor", "Creature — Bird Wizard", "{3}{U}", { cmc: 4, colors: ["U"], power: "2", toughness: "3", keywords: ["Flying","Ward"], oracleText: "Flying\nWard {2} (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {2}.)\nAt the beginning of your upkeep, you may exile two cards from your graveyard. If you do, put a +1/+1 counter on this creature." });
const skywarpSkaab = () => card("Skywarp Skaab", "Creature — Zombie Drake", "{3}{U}{U}", { cmc: 5, colors: ["U"], power: "2", toughness: "5", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, you may exile two creature cards from your graveyard. If you do, draw a card." });
const festeringNewt = () => card("Festering Newt", "Creature — Salamander", "{B}", { cmc: 1, colors: ["B"], power: "1", toughness: "1", oracleText: "When this creature dies, target creature an opponent controls gets -1/-1 until end of turn. That creature gets -4/-4 instead if you control a creature named Bogbrew Witch." });
const bogbrewWitch = () => card("Bogbrew Witch", "Creature — Human Wizard", "{3}{B}", { cmc: 4, colors: ["B"], power: "1", toughness: "3", oracleText: "{2}, {T}: Search your library for a card named Festering Newt or Bubbling Cauldron, put it onto the battlefield tapped, then shuffle." });
const defiantGreatmaw = () => card("Defiant Greatmaw", "Creature — Hippo", "{2}{G}", { cmc: 3, colors: ["G"], power: "4", toughness: "5", oracleText: "When this creature enters, put two -1/-1 counters on target creature you control.\nWhenever you put one or more -1/-1 counters on this creature, remove a -1/-1 counter from another target creature you control." });
const evolvedSpinoderm = () => card("Evolved Spinoderm", "Creature — Phyrexian Beast", "{2}{G}{G}", { cmc: 4, colors: ["G"], power: "5", toughness: "5", oracleText: "This creature enters with four oil counters on it.\nThis creature has trample as long as it has two or fewer oil counters on it. Otherwise, it has hexproof.\nAt the beginning of your upkeep, remove an oil counter from this creature. Then if it has no oil counters on it, sacrifice it." });
const gnarlbarkElm = () => card("Gnarlbark Elm", "Creature — Treefolk Warlock", "{2}{B}", { cmc: 3, colors: ["B"], power: "3", toughness: "4", oracleText: "This creature enters with two -1/-1 counters on it.\n{2}{B}, Remove two counters from this creature: Target creature gets -2/-2 until end of turn. Activate only as a sorcery." });
const piousKitsune = () => card("Pious Kitsune", "Creature — Fox Cleric", "{2}{W}", { cmc: 3, colors: ["W"], power: "1", toughness: "2", oracleText: "At the beginning of your upkeep, put a devotion counter on this creature. Then if a creature named Eight-and-a-Half-Tails is on the battlefield, you gain 1 life for each devotion counter on this creature.\n{T}, Remove a devotion counter from this creature: You gain 1 life." });
const eightAndAHalfTails = () => card("Eight-and-a-Half-Tails", "Legendary Creature — Fox Cleric", "{W}{W}", { cmc: 2, colors: ["W"], power: "2", toughness: "2", oracleText: "{1}{W}: Target permanent you control gains protection from white until end of turn.\n{1}: Target spell or permanent becomes white until end of turn." });
const thrullWizard = () => card("Thrull Wizard", "Creature — Thrull Wizard", "{2}{B}", { cmc: 3, colors: ["B"], power: "1", toughness: "1", oracleText: "{1}{B}: Counter target black spell unless that spell's controller pays {B} or {3}." });
const animateWall = () => card("Animate Wall", "Enchantment — Aura", "{W}", { cmc: 1, colors: ["W"], keywords: ["Enchant"], oracleText: "Enchant Wall\nEnchanted Wall can attack as though it didn't have defender." });
const forgestokerDragon = () => card("Forgestoker Dragon", "Creature — Dragon", "{4}{R}{R}", { cmc: 6, colors: ["R"], power: "5", toughness: "4", keywords: ["Flying"], oracleText: "Flying\n{1}{R}: This creature deals 1 damage to target creature. That creature can't block this combat. Activate only if this creature is attacking." });
const vengefulRebirth = () => card("Vengeful Rebirth", "Sorcery", "{4}{R}{G}", { cmc: 6, colors: ["G","R"], oracleText: "Return target card from your graveyard to your hand. If you return a nonland card to your hand this way, Vengeful Rebirth deals damage equal to that card's mana value to any target.\nExile Vengeful Rebirth." });

const hauntedPlateMail = () => card("Haunted Plate Mail", "Artifact — Equipment", "{4}", { cmc: 4, colors: [], keywords: ["Equip"], oracleText: "Equipped creature gets +4/+4.\n{0}: Until end of turn, this permanent becomes a 4/4 Spirit artifact creature that's no longer an Equipment. Activate only if you control no creatures.\nEquip {4} ({4}: Attach to target creature you control. Equip only as a sorcery.)" });
const wallOfResurgence = () => card("Wall of Resurgence", "Creature — Wall", "{2}{W}", { cmc: 3, colors: ["W"], power: "0", toughness: "6", keywords: ["Defender"], oracleText: "Defender\nWhen this creature enters, you may put three +1/+1 counters on target land you control. If you do, that land becomes a 0/0 Elemental creature with haste that's still a land." });
const cycloneSire = () => card("Cyclone Sire", "Creature — Elemental", "{4}{U}", { cmc: 5, colors: ["U"], power: "3", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nWhen this creature dies, you may put three +1/+1 counters on target land you control. If you do, that land becomes a 0/0 Elemental creature with haste that's still a land." });
const noyanDarRoilShaper = () => card("Noyan Dar, Roil Shaper", "Legendary Creature — Merfolk Ally", "{3}{W}{U}", { cmc: 5, colors: ["U","W"], power: "4", toughness: "4", oracleText: "Whenever you cast an instant or sorcery spell, you may put three +1/+1 counters on target land you control. If you do, that land becomes a 0/0 Elemental creature with haste that's still a land." });
const rootwiseSurvivor = () => card("Rootwise Survivor", "Creature — Human Survivor", "{3}{G}{G}", { cmc: 5, colors: ["G"], power: "3", toughness: "4", keywords: ["Haste","Survival"], oracleText: "Haste\nSurvival — At the beginning of your second main phase, if this creature is tapped, put three +1/+1 counters on up to one target land you control. That land becomes a 0/0 Elemental creature in addition to its other types. It gains haste until your next turn." });
const wakerOfTheWilds = () => card("Waker of the Wilds", "Creature — Merfolk Shaman", "{2}{G}{G}", { cmc: 4, colors: ["G"], power: "3", toughness: "3", oracleText: "{X}{G}{G}: Put X +1/+1 counters on target land you control. That land becomes a 0/0 Elemental creature with haste. It's still a land." });
const sanctuaryWall = () => card("Sanctuary Wall", "Artifact Creature — Wall", "{1}{W}", { cmc: 2, colors: ["W"], power: "0", toughness: "4", keywords: ["Defender"], oracleText: "Defender\n{2}{W}, {T}: Tap target creature. You may put a stun counter on it. If you do, put a stun counter on this creature. (If a permanent with a stun counter would become untapped, remove one from it instead.)" });
const lochMare = () => card("Loch Mare", "Creature — Horse Serpent", "{1}{U}", { cmc: 2, colors: ["U"], power: "4", toughness: "5", oracleText: "This creature enters with three -1/-1 counters on it.\n{1}{U}, Remove a counter from this creature: Draw a card.\n{2}{U}, Remove two counters from this creature: Tap target creature. Put a stun counter on it. (If a permanent with a stun counter would become untapped, remove one from it instead.)" });
const reapingWillow = () => card("Reaping Willow", "Creature — Treefolk Cleric", "{1}{W/B}{W/B}{W/B}", { cmc: 4, colors: ["B","W"], power: "3", toughness: "6", keywords: ["Lifelink"], oracleText: "Lifelink\nThis creature enters with two -1/-1 counters on it.\n{1}{W/B}, Remove two counters from this creature: Return target creature card with mana value 3 or less from your graveyard to the battlefield. Activate only as a sorcery." });
const silhanaWayfinder = () => card("Silhana Wayfinder", "Creature — Elf Scout", "{1}{G}", { cmc: 2, colors: ["G"], power: "2", toughness: "1", oracleText: "When this creature enters, look at the top four cards of your library. You may reveal a creature or land card from among them and put it on top of your library. Put the rest on the bottom of your library in a random order." });
const skirkDrillSergeant = () => card("Skirk Drill Sergeant", "Creature — Goblin", "{1}{R}", { cmc: 2, colors: ["R"], power: "2", toughness: "1", oracleText: "Whenever this creature or another Goblin dies, you may pay {2}{R}. If you do, reveal the top card of your library. If it's a Goblin permanent card, put it onto the battlefield. Otherwise, put it into your graveyard." });
const countrysideCrusher = () => card("Countryside Crusher", "Creature — Giant Warrior", "{1}{R}{R}", { cmc: 3, colors: ["R"], power: "3", toughness: "3", oracleText: "At the beginning of your upkeep, reveal the top card of your library. If it's a land card, put it into your graveyard and repeat this process.\nWhenever a land card is put into your graveyard from anywhere, put a +1/+1 counter on this creature." });
const madcapExperiment = () => card("Madcap Experiment", "Sorcery", "{3}{R}", { cmc: 4, colors: ["R"], oracleText: "Reveal cards from the top of your library until you reveal an artifact card. Put that card onto the battlefield and the rest on the bottom of your library in a random order. Madcap Experiment deals damage to you equal to the number of cards revealed this way." });
const burnAway = () => card("Burn Away", "Instant", "{4}{R}", { cmc: 5, colors: ["R"], oracleText: "Burn Away deals 6 damage to target creature. When that creature dies this turn, exile its controller's graveyard." });
const shiftingLoyalties = () => card("Shifting Loyalties", "Sorcery", "{5}{U}", { cmc: 6, colors: ["U"], oracleText: "Exchange control of two target permanents that share a card type. (Artifact, creature, enchantment, land, and planeswalker are card types.)" });
const audaciousReshapers = () => card("Audacious Reshapers", "Creature — Human Artificer", "{2}{R}", { cmc: 3, colors: ["R"], power: "3", toughness: "3", oracleText: "{T}, Sacrifice an artifact: Reveal cards from the top of your library until you reveal an artifact card. Put that card onto the battlefield and the rest on the bottom of your library in a random order. This creature deals damage to you equal to the number of cards revealed this way." });
const theTricksterGodsHeist = () => card("The Trickster-God's Heist", "Enchantment — Saga", "{2}{U}{B}", { cmc: 4, colors: ["B","U"], oracleText: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — You may exchange control of two target creatures.\nII — You may exchange control of two target nonbasic, noncreature permanents that share a card type.\nIII — Target player loses 3 life and you gain 3 life." });
const gwenStacy = () => scry("transform", [
  { name: "Gwen Stacy", mana_cost: "{1}{R}", type_line: "Legendary Creature — Human Performer Hero", oracle_text: "When Gwen Stacy enters, exile the top card of your library. You may play that card for as long as you control this creature.\n{2}{U}{R}{W}: Transform Gwen Stacy. Activate only as a sorcery.", power: "2", toughness: "1" },
  { name: "Ghost-Spider", type_line: "Legendary Creature — Spider Human Hero", oracle_text: "Flying, vigilance, haste\nWhenever you play a land from exile or cast a spell from exile, put a +1/+1 counter on Ghost-Spider.\nRemove two counters from Ghost-Spider: Exile the top card of your library. You may play that card this turn.", power: "4", toughness: "4" },
], { keywords: ["Flying", "Vigilance", "Haste"] });
const bilboLuckwearer = () => scry("adventure", [
  { name: "Bilbo, Luckwearer", mana_cost: "{1}{U}", type_line: "Legendary Creature — Halfling Rogue", oracle_text: "Bilbo can't be blocked.\nWhenever Bilbo deals combat damage to a player, draw a card, then discard a card.", power: "1", toughness: "2" },
  { name: "Burglar's Plot", mana_cost: "{4}{U}", type_line: "Sorcery — Adventure", oracle_text: "Exchange control of two target nonland permanents that share a card type. (Then exile this card. You may cast the creature later from exile.)" },
]);

const creature = (name: string, typeLine: string, manaCost: string, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, manaCost, { power: String(p), toughness: String(t), ...extra });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2, { cmc: 2, colors: ["G"] });
const hillGiant = () => creature("Hill Giant", "Creature — Giant", "{3}{R}", 3, 3, { cmc: 4, colors: ["R"] });
const bigOgre = () => creature("Big Ogre", "Creature — Ogre", "{4}{R}", 5, 5, { cmc: 5, colors: ["R"] });
const wallOfStone = () => creature("Wall of Stone", "Creature — Wall", "{1}{R}{R}", 0, 8, { cmc: 3, colors: ["R"], keywords: ["Defender"], oracleText: "Defender" });
const murder = () => card("Murder", "Instant", "{1}{B}{B}", { cmc: 3, colors: ["B"], oracleText: "Destroy target creature." });
const blackGrove = () => card("Black Grove", "Enchantment", "{B}", { cmc: 1, colors: ["B"] });
const divination = () => card("Divination", "Sorcery", "{2}{U}", { cmc: 3, colors: ["U"], oracleText: "Draw two cards." });
const giantSpider = () => creature("Giant Spider", "Creature — Spider", "{3}{G}", 2, 4, { cmc: 4, colors: ["G"], keywords: ["Reach"], oracleText: "Reach" });
const swampCard = () => card("Swamp", "Basic Land — Swamp");
const forestCard = () => card("Forest", "Basic Land — Forest");
const ornithopter = () => creature("Ornithopter", "Artifact Creature — Thopter", "{0}", 0, 2, { cmc: 0, colors: [], keywords: ["Flying"], oracleText: "Flying" });
const goblinPiker = () => creature("Goblin Piker", "Creature — Goblin Warrior", "{1}{R}", 2, 1, { cmc: 2, colors: ["R"] });
const manaRock = () => card("Mind Stone", "Artifact", "{2}", { cmc: 2, colors: [] });
const shock = () => card("Shock", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Shock deals 2 damage to any target." });
const types = (s: GameState, id: string) => characteristics(s, s.objects[id]!);

describe("Lane B round 35", () => {
  it("compiles every card fully", () => {
    supported(aegisSculptor(), skywarpSkaab(), festeringNewt(), defiantGreatmaw(), evolvedSpinoderm(), gnarlbarkElm(), piousKitsune(), thrullWizard());
    supported(animateWall(), forgestokerDragon(), vengefulRebirth());
    supported(hauntedPlateMail(), wallOfResurgence(), cycloneSire(), noyanDarRoilShaper(), rootwiseSurvivor(), wakerOfTheWilds(), sanctuaryWall(), lochMare(), reapingWillow());
    supported(silhanaWayfinder(), skirkDrillSergeant(), countrysideCrusher(), madcapExperiment(), burnAway(), shiftingLoyalties(), audaciousReshapers(), theTricksterGodsHeist(), gwenStacy(), bilboLuckwearer());
  });
});

describe("Exiling cards from your graveyard as a choice", () => {
  it("Aegis Sculptor: you may exile two cards from your graveyard at upkeep for a +1/+1 counter", () => {
    const { s: s0, ap } = setup([]);
    emptyHand(s0, ap);
    const sculptor = putOnBattlefield(s0, ap, aegisSculptor());
    const [a, b] = [toZone(s0, ap, greenBear(), "graveyard"), toZone(s0, ap, hillGiant(), "graveyard")];
    let s = settle(toNextUpkeep(s0, ap), at("chooseMay", ap));
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(choose(s, true));
    expect([zone(s, a), zone(s, b), s.objects[sculptor]!.counters["+1/+1"], pt(s, sculptor)]).toEqual(["exile", "exile", 1, "3/4"]);
  });

  it("Aegis Sculptor: with only one card in your graveyard it can't be done, so nothing is asked and no counter", () => {
    const { s: s0, ap } = setup([]);
    emptyHand(s0, ap);
    const sculptor = putOnBattlefield(s0, ap, aegisSculptor());
    const a = toZone(s0, ap, greenBear(), "graveyard");
    let s = settle(toNextUpkeep(s0, ap), at("chooseMay", ap));
    expect(s.pending?.kind).not.toBe("chooseMay");
    s = settle(s);
    expect([zone(s, a), s.objects[sculptor]!.counters["+1/+1"] ?? 0]).toEqual(["graveyard", 0]);
  });

  it("Skywarp Skaab: two creature cards from your graveyard for a card; a land doesn't count toward the two", () => {
    const { s: s0, ap, ids } = setup([skywarpSkaab()]);
    toZone(s0, ap, greenBear(), "graveyard");
    toZone(s0, ap, swampCard(), "graveyard");
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseMay", ap));
    expect(s.pending?.kind).not.toBe("chooseMay");
    const { s: s1, ap: ap1, ids: ids1 } = setup([skywarpSkaab()]);
    const [a, b] = [toZone(s1, ap1, greenBear(), "graveyard"), toZone(s1, ap1, hillGiant(), "graveyard")];
    const hand = s1.players[ap1]!.hand.length;
    s = settle(castNow(s1, ap1, ids1[0]!), at("chooseMay", ap1));
    s = settle(choose(s, true));
    expect([zone(s, a), zone(s, b), s.players[ap1]!.hand.length]).toEqual(["exile", "exile", hand]);
  });
});

describe("Riders by name", () => {
  it("Festering Newt: the target gets -1/-1, or -4/-4 while you control a creature named Bogbrew Witch", () => {
    for (const witch of [false, true]) {
      const { s: s0, ap, ids, opp } = setup([murder()]);
      const newt = putOnBattlefield(s0, ap, festeringNewt());
      const ogre = putOnBattlefield(s0, opp, bigOgre());
      if (witch) putOnBattlefield(s0, ap, bogbrewWitch());
      let s = castNow(s0, ap, ids[0]!, [tgt(newt)]);
      s = settle(s, at("chooseTargets", ap));
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(ogre)] });
      s = settle(s);
      expect(zone(s, newt)).toBe("graveyard");
      expect(pt(s, ogre)).toBe(witch ? "1/1" : "4/4");
    }
  });

  it("Pious Kitsune: a devotion counter each upkeep; life for each only while a creature named Eight-and-a-Half-Tails is on the battlefield, anyone's", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHand(s0, ap);
    const kitsune = putOnBattlefield(s0, ap, piousKitsune());
    s0.objects[kitsune]!.counters.devotion = 2;
    let s = settle(toNextUpkeep(s0, ap));
    expect([s.objects[kitsune]!.counters.devotion, life(s, ap)]).toEqual([3, 40]);
    putOnBattlefield(s, opp, eightAndAHalfTails());
    emptyHand(s, ap);
    s = settle(toNextUpkeep(s, ap));
    expect([s.objects[kitsune]!.counters.devotion, life(s, ap)]).toEqual([4, 44]);
  });
});

describe("Counters", () => {
  it("Defiant Greatmaw: -1/-1 counters you put on it remove one from another target creature you control", () => {
    const { s: s0, ap, ids } = setup([defiantGreatmaw()]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    s0.objects[bear]!.counters["-1/-1"] = 1;
    let s = castNow(s0, ap, ids[0]!);
    // Its enters trigger puts the two counters on itself.
    s = settle(s, at("chooseTargets", ap));
    expect(s.pending?.kind).toBe("chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(ids[0]!)] });
    s = settle(s, at("chooseTargets", ap));
    expect([s.objects[ids[0]!]!.counters["-1/-1"], pt(s, ids[0]!)]).toEqual([2, "2/3"]);
    expect(s.pending?.kind).toBe("chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(bear)] }));
    expect([s.objects[bear]!.counters["-1/-1"] ?? 0, pt(s, bear)]).toEqual([0, "2/2"]);
  });

  it("Evolved Spinoderm: hexproof with three or more oil counters, trample with two or fewer; sacrificed when the last is removed", () => {
    const { s: s0, ap } = setup([]);
    emptyHand(s0, ap);
    const spino = putOnBattlefield(s0, ap, evolvedSpinoderm());
    s0.objects[spino]!.counters.oil = 3;
    invalidateCharacteristics(s0);
    expect([kws(s0, spino, "Hexproof"), kws(s0, spino, "Trample")]).toEqual([true, false]);
    let s = settle(toNextUpkeep(s0, ap));
    expect([s.objects[spino]!.counters.oil, kws(s, spino, "Hexproof"), kws(s, spino, "Trample")]).toEqual([2, false, true]);
    s.objects[spino]!.counters.oil = 1;
    invalidateCharacteristics(s);
    emptyHand(s, ap);
    s = settle(toNextUpkeep(s, ap));
    expect(zone(s, spino)).toBe("graveyard");
  });

  it("Evolved Spinoderm: losing its counters another way doesn't sacrifice it until its upkeep ability resolves (rulings)", () => {
    const { s: s0, ap } = setup([]);
    emptyHand(s0, ap);
    const spino = putOnBattlefield(s0, ap, evolvedSpinoderm());
    s0.objects[spino]!.counters.oil = 0;
    invalidateCharacteristics(s0);
    let s = settle(passUntil(s0, "end", ap));
    expect(zone(s, spino)).toBe("battlefield");
    emptyHand(s, ap);
    s = settle(toNextUpkeep(s, ap));
    expect(zone(s, spino)).toBe("graveyard");
  });

  it("Gnarlbark Elm: removes two counters of any kinds from itself as a cost, only as a sorcery", () => {
    const { s: s0, ap, opp } = setup([]);
    const elm = putOnBattlefield(s0, ap, gnarlbarkElm());
    s0.objects[elm]!.counters = { "-1/-1": 1, oil: 1 };
    const giant = putOnBattlefield(s0, opp, hillGiant());
    invalidateCharacteristics(s0);
    const costs: CostChoices = { counters: [{ id: elm, kind: "-1/-1" }, { id: elm, kind: "oil" }] };
    let s = settle(run(s0, planActivate(s0, ap, elm, 0, [tgt(giant)], undefined, undefined, undefined, costs)));
    expect([s.objects[elm]!.counters["-1/-1"] ?? 0, s.objects[elm]!.counters.oil ?? 0, pt(s, giant)]).toEqual([0, 0, "1/1"]);
    // With one counter left there's nothing to pay with.
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const elm1 = putOnBattlefield(s1, ap1, gnarlbarkElm());
    s1.objects[elm1]!.counters = { "-1/-1": 1 };
    const giant1 = putOnBattlefield(s1, opp1, hillGiant());
    invalidateCharacteristics(s1);
    expect(planActivate(s1, ap1, elm1, 0, [tgt(giant1)])).toBeNull();
  });
});

describe("Counterspells and combat", () => {
  it("Thrull Wizard: the black spell's controller may pay {B} or {3}; if they don't, it's countered", () => {
    for (const answer of ["0", "1", "none"]) {
      const { s: s0, ap, opp } = setup([]);
      const wizard = putOnBattlefield(s0, opp, thrullWizard());
      s0.players[opp]!.manaPool.B = 2;
      const grove = toZone(s0, ap, blackGrove(), "hand");
      let s = castNow(s0, ap, grove);
      while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      s = run(s, planActivate(s, opp, wizard, 0, [{ kind: "stack", id: s.stack.at(-1)!.id }]));
      s = settle(s, at("chooseOption", ap));
      expect(s.pending).toMatchObject({ kind: "chooseOption", what: "punisher" });
      expect((s.pending as { labels: string[] }).labels.slice(0, 2)).toEqual(["Pay {B}", "Pay {3}"]);
      s = act(s, { type: "chooseOption", player: ap, choice: answer });
      if (answer === "0") s.players[ap]!.manaPool.B = 1;
      if (answer === "1") s.players[ap]!.manaPool.C = 3;
      if (s.pending?.kind === "payUnless") s = act(s, { type: "payUnless", player: ap, pay: true });
      s = settle(s);
      expect(zone(s, grove)).toBe(answer === "none" ? "graveyard" : "battlefield");
    }
  });

  it("Thrull Wizard: only black spells", () => {
    const { s: s0, ap, opp } = setup([]);
    const wizard = putOnBattlefield(s0, opp, thrullWizard());
    s0.players[opp]!.manaPool.B = 2;
    const div = toZone(s0, ap, divination(), "hand");
    let s = castNow(s0, ap, div);
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(planActivate(s, opp, wizard, 0, [{ kind: "stack", id: s.stack.at(-1)!.id }])).toBeNull();
  });

  it("Animate Wall: the enchanted Wall can attack despite defender; only a Wall can be enchanted", () => {
    const { s: s0, ap, ids, opp } = setup([animateWall()]);
    const wall = putOnBattlefield(s0, ap, wallOfStone());
    const bear = putOnBattlefield(s0, ap, greenBear());
    expect(planCast(s0, ap, ids[0]!, [tgt(bear)])).toBeNull();
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(wall)]));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(wall);
    const plain = putOnBattlefield(s, ap, wallOfStone());
    s = passUntil(s, "declareAttackers");
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: plain, defender: opp }] })).toThrow();
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: wall, defender: opp }] }));
    expect(s.objects[wall]!.attacking).toBe(opp);
  });

  it("Forgestoker Dragon: only while it's attacking; 1 damage and the creature can't block this combat", () => {
    const { s: s0, ap, opp } = setup([]);
    const dragon = putOnBattlefield(s0, ap, forgestokerDragon());
    const blocker = putOnBattlefield(s0, opp, giantSpider());
    expect(planActivate(s0, ap, dragon, 0, [tgt(blocker)])).toBeNull();
    let s = attackWith(s0, [dragon], opp);
    s = settle(run(s, planActivate(s, ap, dragon, 0, [tgt(blocker)])));
    expect(s.objects[blocker]!.damage).toBe(1);
    for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("declareBlockers");
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker: dragon }] } as Action)).toThrow(/can't block/);
  });
});

describe("Returning a card", () => {
  it("Vengeful Rebirth: a nonland card back to your hand deals its mana value to any target; a land deals nothing; the spell is exiled", () => {
    const { s: s0, ap, ids, opp } = setup([vengefulRebirth(), vengefulRebirth()]);
    const giant = toZone(s0, ap, hillGiant(), "graveyard");
    const land = toZone(s0, ap, swampCard(), "graveyard");
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(giant), ply(opp)]));
    expect([zone(s, giant), life(s, opp), zone(s, ids[0]!)]).toEqual(["hand", 36, "exile"]);
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 3, G: 3, C: 0 };
    s = settle(castNow(s, ap, ids[1]!, [tgt(land), ply(opp)]));
    expect([zone(s, land), life(s, opp)]).toEqual(["hand", 36]);
  });
});

describe("Lands that become creatures", () => {
  it("Wall of Resurgence: you may put three +1/+1 counters on a land you control; it becomes a 3/3 Elemental creature with haste that's still a land", () => {
    const { s: s0, ap, ids } = setup([wallOfResurgence()]);
    const land = putOnBattlefield(s0, ap, forestCard());
    let s = settle(castNow(s0, ap, ids[0]!), (x) => at("chooseTargets", ap)(x) || at("chooseMay", ap)(x));
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(land)] }), at("chooseMay", ap));
    s = settle(choose(s, true));
    const c = types(s, land);
    expect([s.objects[land]!.counters["+1/+1"], pt(s, land), c.types.includes("Creature"), c.types.includes("Land"), c.subtypes.includes("Elemental"), kws(s, land, "Haste")]).toEqual([3, "3/3", true, true, true, true]);
    // No duration: it's still a creature next turn.
    s = passUntil(s, "main1", nextPlayer(s, ap));
    expect(types(s, land).types.includes("Creature")).toBe(true);
  });

  it("Wall of Resurgence: declining leaves the land alone", () => {
    const { s: s0, ap, ids } = setup([wallOfResurgence()]);
    const land = putOnBattlefield(s0, ap, forestCard());
    let s = settle(castNow(s0, ap, ids[0]!), (x) => at("chooseTargets", ap)(x) || at("chooseMay", ap)(x));
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(land)] }), at("chooseMay", ap));
    s = settle(choose(s, false));
    expect([s.objects[land]!.counters["+1/+1"] ?? 0, types(s, land).types.includes("Creature")]).toEqual([0, false]);
  });

  it("Cyclone Sire: when it dies, the same for a land you control", () => {
    const { s: s0, ap, ids } = setup([murder()]);
    const sire = putOnBattlefield(s0, ap, cycloneSire());
    const land = putOnBattlefield(s0, ap, forestCard());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(sire)]), (x) => at("chooseTargets", ap)(x) || at("chooseMay", ap)(x));
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(land)] }), at("chooseMay", ap));
    s = settle(choose(s, true));
    expect([zone(s, sire), pt(s, land), types(s, land).types.includes("Creature")]).toEqual(["graveyard", "3/3", true]);
  });

  it("Noyan Dar, Roil Shaper: each instant or sorcery you cast animates a land you control", () => {
    const { s: s0, ap, ids, opp } = setup([shock()]);
    putOnBattlefield(s0, ap, noyanDarRoilShaper());
    const land = putOnBattlefield(s0, ap, forestCard());
    let s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]), (x) => at("chooseTargets", ap)(x) || at("chooseMay", ap)(x));
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(land)] }), at("chooseMay", ap));
    s = settle(choose(s, true));
    expect([pt(s, land), kws(s, land, "Haste"), life(s, opp)]).toEqual(["3/3", true, 38]);
  });

  it("Waker of the Wilds: X +1/+1 counters on a land you control, which becomes a 0/0 Elemental creature with haste", () => {
    const { s: s0, ap } = setup([]);
    const waker = putOnBattlefield(s0, ap, wakerOfTheWilds());
    const land = putOnBattlefield(s0, ap, forestCard());
    const s = settle(run(s0, planActivate(s0, ap, waker, 0, [tgt(land)], undefined, undefined, 2)));
    const c = types(s, land);
    expect([pt(s, land), c.types.includes("Land"), c.subtypes.includes("Elemental"), kws(s, land, "Haste")]).toEqual(["2/2", true, true, true]);
  });

  it("Rootwise Survivor: tapped at your second main phase, up to one land you control gets three counters and becomes a creature; untapped, nothing happens", () => {
    for (const tapped of [true, false]) {
      const { s: s0, ap } = setup([]);
      emptyHand(s0, ap);
      const survivor = putOnBattlefield(s0, ap, rootwiseSurvivor());
      const land = putOnBattlefield(s0, ap, forestCard());
      let s = passUntil(s0, "endCombat", ap);
      s.objects[survivor]!.tapped = tapped;
      for (let i = 0; i < 20 && s.step !== "main2"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      s = settle(s, at("chooseTargets", ap));
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(land)] });
      s = settle(s);
      if (!tapped) {
        expect([s.objects[land]!.counters["+1/+1"] ?? 0, types(s, land).types.includes("Creature")]).toEqual([0, false]);
        continue;
      }
      const c = types(s, land);
      expect([pt(s, land), c.types.includes("Creature"), c.types.includes("Land"), c.subtypes.includes("Forest"), c.subtypes.includes("Elemental"), kws(s, land, "Haste")]).toEqual(["3/3", true, true, true, true, true]);
    }
  });
});

describe("Removing counters as a cost", () => {
  it("Loch Mare: enters as a 1/2; remove a counter to draw a card, two to tap and stun a creature", () => {
    const { s: s0, ap, ids, opp } = setup([lochMare()]);
    let s = settle(castNow(s0, ap, ids[0]!));
    const mare = ids[0]!;
    expect([s.objects[mare]!.counters["-1/-1"], pt(s, mare)]).toEqual([3, "1/2"]);
    const hand = s.players[ap]!.hand.length;
    s.players[ap]!.manaPool = { W: 0, U: 5, B: 0, R: 0, G: 0, C: 5 };
    s = settle(run(s, planActivate(s, ap, mare, 0, [], undefined, undefined, undefined, { counters: [{ id: mare, kind: "-1/-1" }] })));
    expect([s.players[ap]!.hand.length, s.objects[mare]!.counters["-1/-1"]]).toEqual([hand + 1, 2]);
    const giant = putOnBattlefield(s, opp, hillGiant());
    s = settle(run(s, planActivate(s, ap, mare, 1, [tgt(giant)], undefined, undefined, undefined, { counters: [{ id: mare, kind: "-1/-1" }, { id: mare, kind: "-1/-1" }] })));
    expect([s.objects[giant]!.tapped, s.objects[giant]!.counters.stun, s.objects[mare]!.counters["-1/-1"] ?? 0, pt(s, mare)]).toEqual([true, 1, 0, "4/5"]);
  });

  it("Reaping Willow: remove two counters to return a creature card with mana value 3 or less from your graveyard to the battlefield", () => {
    const { s: s0, ap } = setup([]);
    const willow = putOnBattlefield(s0, ap, reapingWillow());
    s0.objects[willow]!.counters["-1/-1"] = 2;
    const bear = toZone(s0, ap, greenBear(), "graveyard");
    const ogre = toZone(s0, ap, bigOgre(), "graveyard");
    invalidateCharacteristics(s0);
    const costs: CostChoices = { counters: [{ id: willow, kind: "-1/-1" }, { id: willow, kind: "-1/-1" }] };
    expect(planActivate(s0, ap, willow, 0, [tgt(ogre)], undefined, undefined, undefined, costs)).toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, willow, 0, [tgt(bear)], undefined, undefined, undefined, costs)));
    expect([zone(s, bear), pt(s, willow)]).toEqual(["battlefield", "3/6"]);
  });
});

describe("Animated Equipment and tapping walls", () => {
  it("Haunted Plate Mail: with no creatures it becomes a 4/4 Spirit artifact creature that's no longer an Equipment until end of turn", () => {
    const { s: s0, ap } = setup([]);
    const mail = putOnBattlefield(s0, ap, hauntedPlateMail());
    let s = settle(run(s0, planActivate(s0, ap, mail, 0, [])));
    let c = types(s, mail);
    expect([pt(s, mail), c.types, c.subtypes.includes("Spirit"), c.subtypes.includes("Equipment")]).toEqual(["4/4", ["Artifact", "Creature"], true, false]);
    // Equipping while it isn't an Equipment does nothing (rulings).
    const bear = putOnBattlefield(s, ap, greenBear());
    s.players[ap]!.manaPool.C = 4;
    s = settle(run(s, planActivate(s, ap, mail, 1, [tgt(bear)])));
    expect([s.objects[mail]!.attachedTo ?? null, pt(s, bear)]).toEqual([null, "2/2"]);
    s = passUntil(s, "main1", nextPlayer(s, ap));
    c = types(s, mail);
    expect([c.types, c.subtypes.includes("Equipment")]).toEqual([["Artifact"], true]);
    // Only while you control no creatures.
    expect(planActivate(s, ap, mail, 0, [])).toBeNull();
  });

  it("Sanctuary Wall: taps a creature; if you put a stun counter on it, one goes on the Wall too", () => {
    for (const yes of [true, false]) {
      const { s: s0, ap, opp } = setup([]);
      const wall = putOnBattlefield(s0, ap, sanctuaryWall());
      const giant = putOnBattlefield(s0, opp, hillGiant());
      let s = settle(run(s0, planActivate(s0, ap, wall, 0, [tgt(giant)])), at("chooseMay", ap));
      expect(s.pending?.kind).toBe("chooseMay");
      s = settle(choose(s, yes));
      expect([s.objects[giant]!.tapped, s.objects[giant]!.counters.stun ?? 0, s.objects[wall]!.counters.stun ?? 0]).toEqual([true, yes ? 1 : 0, yes ? 1 : 0]);
    }
  });
});

describe("Revealing from the library", () => {
  it("Silhana Wayfinder: a creature or land card from the top four may go back on top; the rest go to the bottom", () => {
    const { s: s0, ap, ids } = setup([silhanaWayfinder()]);
    const lib = s0.players[ap]!.library;
    const bear = toZone(s0, ap, greenBear(), "library");
    const opt = toZone(s0, ap, divination(), "library");
    const murd = toZone(s0, ap, murder(), "library");
    const grove = toZone(s0, ap, blackGrove(), "library");
    expect(lib.slice(0, 4)).toEqual([grove, murd, opt, bear]);
    let s = settle(castNow(s0, ap, ids[0]!), (x) => !!x.pending && x.pending.player === ap);
    expect(s.pending?.kind).toBe("searchLibrary");
    const p = s.pending as Extract<NonNullable<GameState["pending"]>, { kind: "searchLibrary" }>;
    expect(p.cards).toContain(bear);
    expect(p.cards).not.toContain(grove);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [bear] }));
    const after = s.players[ap]!.library;
    expect(after[0]).toBe(bear);
    expect(after.slice(-3).sort()).toEqual([grove, murd, opt].sort());
  });

  it("Skirk Drill Sergeant: when a Goblin dies, pay {2}{R} to reveal the top card; a Goblin permanent card enters, anything else goes to the graveyard", () => {
    for (const goblinOnTop of [true, false]) {
      const { s: s0, ap, ids } = setup([murder()]);
      putOnBattlefield(s0, ap, skirkDrillSergeant());
      const piker = putOnBattlefield(s0, ap, goblinPiker());
      const top = toZone(s0, ap, goblinOnTop ? goblinPiker() : divination(), "library");
      let s = settle(castNow(s0, ap, ids[0]!, [tgt(piker)]), at("chooseMay", ap));
      expect(s.pending?.kind).toBe("chooseMay");
      s.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 1, G: 0, C: 2 };
      s = settle(choose(s, true));
      expect([zone(s, piker), zone(s, top), s.players[ap]!.manaPool.R]).toEqual(["graveyard", goblinOnTop ? "battlefield" : "graveyard", 0]);
    }
  });

  it("Countryside Crusher: at upkeep, land cards from the top go to the graveyard until a nonland card, which stays on top; each land gives it a +1/+1 counter", () => {
    const { s: s0, ap } = setup([]);
    emptyHand(s0, ap);
    const crusher = putOnBattlefield(s0, ap, countrysideCrusher());
    const div = toZone(s0, ap, divination(), "library");
    const l2 = toZone(s0, ap, swampCard(), "library");
    const l1 = toZone(s0, ap, forestCard(), "library");
    let s = toNextUpkeep(s0, ap);
    expect(s.players[ap]!.library.slice(0, 3)).toEqual([l1, l2, div]);
    s = settle(s);
    expect([zone(s, l1), zone(s, l2), s.players[ap]!.library[0], s.objects[crusher]!.counters["+1/+1"]]).toEqual(["graveyard", "graveyard", div, 2]);
  });

  it("Madcap Experiment: reveals until an artifact card, puts it onto the battlefield and deals you damage for each card revealed, that one included", () => {
    const { s: s0, ap, ids } = setup([madcapExperiment()]);
    const rock = toZone(s0, ap, manaRock(), "library");
    const a = toZone(s0, ap, divination(), "library");
    const b = toZone(s0, ap, murder(), "library");
    const s = settle(castNow(s0, ap, ids[0]!));
    const lib = s.players[ap]!.library;
    expect([zone(s, rock), life(s, ap), lib.slice(-2).sort()]).toEqual(["battlefield", 37, [a, b].sort()]);
  });

  it("Audacious Reshapers: {T}, sacrifice an artifact for the same", () => {
    const { s: s0, ap } = setup([]);
    const reshapers = putOnBattlefield(s0, ap, audaciousReshapers());
    const fodder = putOnBattlefield(s0, ap, manaRock());
    const thopter = toZone(s0, ap, ornithopter(), "library");
    toZone(s0, ap, divination(), "library");
    const s = settle(run(s0, planActivate(s0, ap, reshapers, 0, [], undefined, undefined, undefined, { sacrifice: [fodder] })));
    expect([zone(s, fodder), zone(s, thopter), life(s, ap)]).toEqual(["graveyard", "battlefield", 38]);
  });
});

describe("Delayed exile", () => {
  it("Burn Away: when the creature it damaged dies this turn, its controller's graveyard is exiled", () => {
    const { s: s0, ap, ids, opp } = setup([burnAway()]);
    const ogre = putOnBattlefield(s0, opp, bigOgre());
    const old = toZone(s0, opp, hillGiant(), "graveyard");
    const mine = toZone(s0, ap, greenBear(), "graveyard");
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(ogre)]));
    expect([zone(s, ogre), zone(s, old), zone(s, mine)]).toEqual(["exile", "exile", "graveyard"]);
  });

  it("Burn Away: if the creature survives, nothing is exiled, even if it dies later", () => {
    const { s: s0, ap, ids, opp } = setup([burnAway()]);
    const wall = putOnBattlefield(s0, opp, wallOfStone());
    const old = toZone(s0, opp, hillGiant(), "graveyard");
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(wall)]));
    expect([zone(s, wall), zone(s, old)]).toEqual(["battlefield", "graveyard"]);
    s = passUntil(s, "main1", nextPlayer(s, ap));
    s.objects[wall]!.damage = 8;
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect([zone(s, wall), zone(s, old)]).toEqual(["graveyard", "graveyard"]);
  });
});

describe("Exchanging permanents that share a card type", () => {
  it("Shifting Loyalties: a creature and an artifact creature share a card type and are exchanged", () => {
    const { s: s0, ap, ids, opp } = setup([shiftingLoyalties()]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    const thopter = putOnBattlefield(s0, opp, ornithopter());
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(bear), tgt(thopter)]));
    expect([controllerOf(s, s.objects[bear]!), controllerOf(s, s.objects[thopter]!)]).toEqual([opp, ap]);
  });

  it("Shifting Loyalties: a creature and a land don't share a card type, so they can't be targeted together", () => {
    const { s: s0, ap, ids, opp } = setup([shiftingLoyalties()]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    const land = putOnBattlefield(s0, opp, forestCard());
    const rock = putOnBattlefield(s0, opp, manaRock());
    const thopter = putOnBattlefield(s0, opp, ornithopter());
    expect(planCast(s0, ap, ids[0]!, [tgt(bear), tgt(land)])).toBeNull();
    expect(planCast(s0, ap, ids[0]!, [tgt(rock), tgt(land)])).toBeNull();
    expect(planCast(s0, ap, ids[0]!, [tgt(rock), tgt(thopter)])).not.toBeNull();
  });

  it("Shifting Loyalties: if one target is gone as it resolves, nothing is exchanged (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([shiftingLoyalties()]);
    const rock = putOnBattlefield(s0, ap, manaRock());
    const plate = putOnBattlefield(s0, opp, hauntedPlateMail());
    let s = castNow(s0, ap, ids[0]!, [tgt(rock), tgt(plate)]);
    s.battlefield.splice(s.battlefield.indexOf(rock), 1);
    s.objects[rock]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(rock);
    invalidateCharacteristics(s);
    s = settle(s);
    expect(controllerOf(s, s.objects[plate]!)).toBe(opp);
  });

  it("The Trickster-God's Heist: chapter I may exchange two creatures", () => {
    const { s: s0, ap, ids, opp } = setup([theTricksterGodsHeist()]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    const giant = putOnBattlefield(s0, opp, hillGiant());
    let s = settle(castNow(s0, ap, ids[0]!), (x) => at("chooseTargets", ap)(x) || at("chooseMay", ap)(x));
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(bear), tgt(giant)] }), at("chooseMay", ap));
    s = settle(choose(s, true));
    expect([controllerOf(s, s.objects[bear]!), controllerOf(s, s.objects[giant]!)]).toEqual([opp, ap]);
  });

  it("The Trickster-God's Heist: chapter II takes nonbasic, noncreature permanents that share a card type", () => {
    const { s: s0, ap, opp } = setup([]);
    const heist = putOnBattlefield(s0, ap, theTricksterGodsHeist());
    s0.objects[heist]!.counters.lore = 1;
    const rock = putOnBattlefield(s0, ap, manaRock());
    const plate = putOnBattlefield(s0, opp, hauntedPlateMail());
    const land = putOnBattlefield(s0, opp, forestCard());
    const thopter = putOnBattlefield(s0, opp, ornithopter());
    emptyHand(s0, ap);
    let s = passUntil(passUntil(s0, "main1", nextPlayer(s0, ap)), "draw", ap);
    s = settle(passUntil(s, "main1", ap), (x) => at("chooseTargets", ap)(x) || at("chooseMay", ap)(x));
    expect(s.pending?.kind).toBe("chooseTargets");
    const bad = [[tgt(rock), tgt(land)], [tgt(rock), tgt(thopter)]];
    for (const targets of bad) expect(() => act(s, { type: "chooseTargets", player: ap, targets })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(rock), tgt(plate)] }), at("chooseMay", ap));
    s = settle(choose(s, true));
    expect([controllerOf(s, s.objects[rock]!), controllerOf(s, s.objects[plate]!)]).toEqual([opp, ap]);
  });
});
