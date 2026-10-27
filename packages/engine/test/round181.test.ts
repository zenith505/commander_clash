// Round 181: the most played cards still unsupported, in popularity order, from about rank 11,770 on, and the cards
// that share their templates.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { blockProblem, characteristics, spellCost, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, parseManaCost, planActivate, planCast, planMana, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const counters = (s: GameState, id: string, c = "+1/+1") => s.objects[id]!.counters[c] ?? 0;
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && [name, `${name} Token`].includes(characteristics(s, s.objects[id]!).name));
/** Attacks with `attackers`; `blocks` are declared by the defending player. */
const combat = (s: GameState, ap: PlayerId, opp: PlayerId, attackers: string[], blocks: { blocker: string; attacker: string }[] = []) => {
  s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender: opp })) });
  s = resolveAll(s);
  s = passUntil(s, "declareBlockers", ap);
  if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: opp, blocks });
  return resolveAll(s);
};
const option = (s: GameState, choice: string) => {
  if (s.pending?.kind !== "chooseOption") throw new Error(`no option question: ${s.pending?.kind}`);
  return act(s, { type: "chooseOption", player: s.pending.player, choice });
};
const shock = card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "This spell deals 2 damage to any target." });
const heal = card("Test Heal", "Instant", "{W}", { cmc: 1, oracleText: "You gain 3 life." });
const bigBear = card("Big Bear", "Creature — Bear", "{4}{G}", { cmc: 5, power: "5", toughness: "5" });
const angel = card("Test Angel", "Creature — Angel", "{3}{W}", { cmc: 4, power: "3", toughness: "3", keywords: ["Flying"], oracleText: "Flying" });
const vampire = card("Test Vampire", "Creature — Vampire", "{1}{B}", { cmc: 2, power: "2", toughness: "2" });
const bat = card("Test Bat", "Creature — Bat", "{B}", { cmc: 1, power: "1", toughness: "1", keywords: ["Flying"], oracleText: "Flying" });
const villain = card("Test Villain", "Creature — Human Villain", "{1}{B}", { cmc: 2, power: "2", toughness: "2" });
const zombie = card("Test Zombie", "Creature — Zombie", "{1}{B}", { cmc: 2, power: "2", toughness: "2" });
const spider = card("Test Spider", "Creature — Spider", "{1}{G}", { cmc: 2, power: "1", toughness: "2" });
const elf = card("Test Elf", "Creature — Elf", "{G}", { cmc: 1, power: "1", toughness: "1" });
const dragon = card("Test Dragon", "Creature — Dragon", "{4}{R}", { cmc: 5, power: "5", toughness: "5", keywords: ["Flying"], oracleText: "Flying" });
const soldier = card("Test Soldier", "Creature — Human Soldier", "{W}", { cmc: 1, power: "1", toughness: "1" });
const hero = card("Test Hero", "Creature — Human Hero", "{1}{W}", { cmc: 2, power: "2", toughness: "2" });
const sorcery = card("Test Sorcery", "Sorcery", "{1}", { cmc: 1, oracleText: "Draw a card." });

// Real oracle text (Scryfall).
const ambitiousDragonborn = card("Ambitious Dragonborn", "Creature — Dragon Barbarian", "{3}{G}", {cmc: 4,"power":"0","toughness":"0","oracleText":"This creature enters with X +1/+1 counters on it, where X is the greatest power among creatures you control and creature cards in your graveyard."});
const backlash = card("Backlash", "Instant", "{1}{B}{R}", {cmc: 3,"oracleText":"Tap target untapped creature. That creature deals damage equal to its power to its controller.","colors":["B","R"]});
const deathgorgeScavenger = card("Deathgorge Scavenger", "Creature — Dinosaur", "{2}{G}", {cmc: 3,"power":"3","toughness":"2","oracleText":"Whenever this creature enters or attacks, you may exile target card from a graveyard. If a creature card is exiled this way, you gain 2 life. If a noncreature card is exiled this way, this creature gets +1/+1 until end of turn."});
const defyDeath = card("Defy Death", "Sorcery", "{3}{W}{W}", {cmc: 5,"oracleText":"Return target creature card from your graveyard to the battlefield. If it's an Angel, put two +1/+1 counters on it."});
const directorNickFury = card("Director Nick Fury", "Legendary Creature — Human Spy Hero", "{U}{R}{W}", {cmc: 3,"power":"2","toughness":"4","oracleText":"Hero spells you cast cost {1} less to cast.\nWhenever you attack, look at the top four cards of your library. You may reveal a Hero card from among them and put that card into your hand. Put the rest on the bottom of your library in a random order.","colors":["R","U","W"]});
const dominusOfFealty = card("Dominus of Fealty", "Creature — Spirit Avatar", "{U/R}{U/R}{U/R}{U/R}{U/R}", {cmc: 5,"power":"4","toughness":"4","keywords":["Flying"],"oracleText":"Flying\nAt the beginning of your upkeep, you may gain control of target permanent until end of turn. If you do, untap it and it gains haste until end of turn.","colors":["R","U"]});
const dranaKalastriaBloodchief = card("Drana, Kalastria Bloodchief", "Legendary Creature — Vampire Shaman", "{3}{B}{B}", {cmc: 5,"power":"4","toughness":"4","keywords":["Flying"],"oracleText":"Flying\n{X}{B}{B}: Target creature gets -0/-X until end of turn and Drana gets +X/+0 until end of turn."});
const entsFury = card("Ent's Fury", "Sorcery", "{1}{G}", {cmc: 2,"keywords":["Fight"],"oracleText":"Put a +1/+1 counter on target creature you control if its power is 4 or greater. Then that creature gets +1/+1 until end of turn and fights target creature you don't control."});
const fearsomeAwakening = card("Fearsome Awakening", "Sorcery", "{4}{B}", {cmc: 5,"oracleText":"Return target creature card from your graveyard to the battlefield. If it's a Dragon, put two +1/+1 counters on it."});
const gloomRipper = card("Gloom Ripper", "Creature — Elf Assassin", "{3}{B}{B}", {cmc: 5,"power":"4","toughness":"4","oracleText":"When this creature enters, target creature you control gets +X/+0 until end of turn and up to one target creature an opponent controls gets -0/-X until end of turn, where X is the number of Elves you control plus the number of Elf cards in your graveyard."});
const heideggerShinraExecutive = card("Heidegger, Shinra Executive", "Legendary Creature — Human Soldier", "{3}{W}", {cmc: 4,"power":"3","toughness":"3","oracleText":"At the beginning of combat on your turn, target creature you control gets +X/+0 until end of turn, where X is the number of Soldiers you control.\nAt the beginning of your end step, create a number of 1/1 white Soldier creature tokens equal to the number of opponents who control more creatures than you."});
const hinder = card("Hinder", "Instant", "{1}{U}{U}", {cmc: 3,"oracleText":"Counter target spell. If that spell is countered this way, put that card on your choice of the top or bottom of its owner's library instead of into that player's graveyard."});
const kickInTheDoor = card("Kick in the Door", "Sorcery", "{R}", {cmc: 1,"keywords":["Venture into the dungeon"],"oracleText":"Put a +1/+1 counter on target creature. That creature gains haste until end of turn and can't be blocked by Walls this turn. Venture into the dungeon. (Enter the first room or advance to the next room.)"});
const korvoldAndTheNobleThief = card("Korvold and the Noble Thief", "Enchantment — Saga", "{3}{R}", {cmc: 4,"keywords":["Treasure"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II — Create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")\nIII — Exile the top three cards of target opponent's library. You may play those cards this turn."});
const loamingShaman = card("Loaming Shaman", "Creature — Centaur Shaman", "{2}{G}", {cmc: 3,"power":"3","toughness":"2","oracleText":"When this creature enters, target player shuffles any number of target cards from their graveyard into their library."});
const moggInfestation = card("Mogg Infestation", "Sorcery", "{3}{R}{R}", {cmc: 5,"oracleText":"Destroy all creatures target player controls. For each creature that died this way, that player creates two 1/1 red Goblin creature tokens."});
const moonstoneHarbinger = card("Moonstone Harbinger", "Creature — Bat Warrior", "{2}{B}", {cmc: 3,"power":"1","toughness":"3","keywords":["Deathtouch","Flying"],"oracleText":"Flying, deathtouch\nWhenever you gain or lose life during your turn, Bats you control get +1/+0 and gain deathtouch until end of turn. This ability triggers only once each turn."});
const oxDrover = card("Ox Drover", "Creature — Human Peasant", "{3}{W}", {cmc: 4,"power":"4","toughness":"4","keywords":["Vigilance"],"oracleText":"Vigilance\nThis creature can't be blocked by Oxen.\nWhenever this creature enters or attacks, target opponent creates a 2/4 white Ox creature token and you draw a card."});
const polukranosUnchained = card("Polukranos, Unchained", "Legendary Creature — Zombie Hydra", "{2}{B}{G}", {cmc: 4,"power":"0","toughness":"0","keywords":["Fight","Escape"],"oracleText":"Polukranos enters with six +1/+1 counters on it. It escapes with twelve +1/+1 counters on it instead.\nIf damage would be dealt to Polukranos while it has a +1/+1 counter on it, prevent that damage and remove that many +1/+1 counters from it.\n{1}{B}{G}: Polukranos fights another target creature.\nEscape—{4}{B}{G}, Exile six other cards from your graveyard.","colors":["B","G"]});
const prismaticStrands = card("Prismatic Strands", "Instant", "{2}{W}", {cmc: 3,"keywords":["Flashback"],"oracleText":"Prevent all damage that sources of the color of your choice would deal this turn.\nFlashback—Tap an untapped white creature you control. (You may cast this card from your graveyard for its flashback cost. Then exile it.)"});
const restorativeTechnique = card("Restorative Technique", "Sorcery", "{2}{G}", {cmc: 3,"oracleText":"Target player gains 2 life, then searches their library for a basic land card, puts it onto the battlefield tapped, then shuffles. Put a +1/+1 counter on up to one target creature."});
const rhonassStalwart = card("Rhonas's Stalwart", "Creature — Human Warrior", "{1}{G}", {cmc: 2,"power":"2","toughness":"2","keywords":["Exert"],"oracleText":"You may exert this creature as it attacks. When you do, it gets +1/+1 until end of turn and can't be blocked by creatures with power 2 or less this turn. (An exerted creature won't untap during your next untap step.)"});
const scourgeOfTheSkyclaves = card("Scourge of the Skyclaves", "Creature — Demon", "{1}{B}", {cmc: 2,"power":"*","toughness":"*","keywords":["Kicker"],"oracleText":"Kicker {4}{B}\nWhen you cast this spell, if it was kicked, each player loses half their life, rounded up.\nScourge of the Skyclaves's power and toughness are each equal to 20 minus the highest life total among players."});
const skanosDragonheart = card("Skanos Dragonheart", "Legendary Creature — Dragon Ranger", "{4}{G}", {cmc: 5,"power":"4","toughness":"4","keywords":["Choose a background"],"oracleText":"Whenever Skanos Dragonheart attacks, it gets +X/+X until end of turn, where X is the greatest power among other Dragons you control and Dragon cards in your graveyard.\nChoose a Background (You can have a Background as a second commander.)"});
const teachingsOfTheArchaics = card("Teachings of the Archaics", "Sorcery — Lesson", "{2}{U}", {cmc: 3,"oracleText":"If an opponent has more cards in hand than you, draw two cards. Draw three cards instead if an opponent has at least four more cards in hand than you."});
const theGhoulGunslinger = card("The Ghoul, Gunslinger", "Legendary Creature — Zombie Mutant Rogue", "{1}{B}{B}", {cmc: 3,"power":"2","toughness":"3","keywords":["First strike","Treasure"],"oracleText":"First strike\nWhenever The Ghoul or another nontoken Zombie or Mutant you control dies, target player gets two rad counters. If that player is you, create a Treasure token."});
const thwip = card("Thwip!", "Instant", "{W}", {cmc: 1,"oracleText":"Target creature gets +2/+2 and gains flying until end of turn. If it's a Spider, you gain 2 life."});
const toxinSliver = card("Toxin Sliver", "Creature — Sliver", "{3}{B}", {cmc: 4,"power":"3","toughness":"3","oracleText":"Whenever a Sliver deals combat damage to a creature, destroy that creature. It can't be regenerated."});
const traitorsRoar = card("Traitor's Roar", "Sorcery", "{4}{B/R}", {cmc: 5,"keywords":["Conspire"],"oracleText":"Tap target untapped creature. It deals damage equal to its power to its controller.\nConspire (As you cast this spell, you may tap two untapped creatures you control that share a color with it. When you do, copy it and you may choose a new target for the copy.)","colors":["B","R"]});
const trygonPrime = card("Trygon Prime", "Creature — Tyranid", "{2}{G}{U}", {cmc: 4,"power":"4","toughness":"4","keywords":["Subterranean Assault"],"oracleText":"Subterranean Assault — Whenever this creature attacks, put a +1/+1 counter on it and a +1/+1 counter on up to one other target attacking creature. That creature can't be blocked this turn.","colors":["G","U"]});
const uginsConjurant = card("Ugin's Conjurant", "Creature — Spirit Monk", "{X}", {cmc: 0,"power":"0","toughness":"0","oracleText":"This creature enters with X +1/+1 counters on it.\nIf damage would be dealt to this creature while it has a +1/+1 counter on it, prevent that damage and remove that many +1/+1 counters from this creature."});
const urgeToFeed = card("Urge to Feed", "Instant", "{B}{B}", {cmc: 2,"oracleText":"Target creature gets -3/-3 until end of turn. You may tap any number of untapped Vampire creatures you control. If you do, put a +1/+1 counter on each of those Vampires."});
const venomEddieBrock = card("Venom, Eddie Brock", "Legendary Creature — Symbiote Villain", "{4}{B}{B}", {cmc: 6,"power":"6","toughness":"4","keywords":["Menace"],"oracleText":"Menace (This creature can't be blocked except by two or more creatures.)\nWhenever another creature dies, put a +1/+1 counter on Venom. If that creature was a Villain, draw a card."});
const waxwaneWitness = card("Wax-Wane Witness", "Creature — Bat Cleric", "{3}{W}", {cmc: 4,"power":"2","toughness":"4","keywords":["Flying","Vigilance"],"oracleText":"Flying, vigilance\nWhenever you gain or lose life during your turn, this creature gets +1/+0 until end of turn."});
const eyeblightMassacre = card("Eyeblight Massacre", "Sorcery", "{2}{B}{B}", {cmc: 4,"oracleText":"Non-Elf creatures get -2/-2 until end of turn."});
const wallOfEssence = card("Wall of Essence", "Creature — Wall", "{1}{W}", {cmc: 2,"power":"0","toughness":"4","keywords":["Defender"],"oracleText":"Defender (This creature can't attack.)\nWhenever this creature is dealt combat damage, you gain that much life."});
const ofOneMind = card("Of One Mind", "Sorcery", "{2}{U}", {cmc: 3,"oracleText":"This spell costs {2} less to cast if you control a Human creature and a non-Human creature.\nDraw two cards."});
const kirriTalentedSprout = card("Kirri, Talented Sprout", "Legendary Creature — Plant Druid", "{1}{R}{G}{W}", {cmc: 4,"power":"0","toughness":"3","oracleText":"Other Plants and Treefolk you control get +2/+0.\nAt the beginning of each of your postcombat main phases, return target Plant, Treefolk, or land card from your graveyard to your hand.","colors":["G","R","W"]});
const granPulseOchu = card("Gran Pulse Ochu", "Creature — Plant Beast", "{G}", {cmc: 1,"power":"1","toughness":"1","keywords":["Deathtouch"],"oracleText":"Deathtouch\n{8}: Until end of turn, this creature gets +1/+1 for each permanent card in your graveyard."});
const tributeToHunger = card("Tribute to Hunger", "Instant", "{2}{B}", {cmc: 3,"oracleText":"Target opponent sacrifices a creature of their choice. You gain life equal to that creature's toughness."});
const consumingVapors = card("Consuming Vapors", "Sorcery", "{3}{B}", {cmc: 4,"keywords":["Rebound"],"oracleText":"Target player sacrifices a creature of their choice. You gain life equal to that creature's toughness.\nRebound (If you cast this spell from your hand, exile it as it resolves. At the beginning of your next upkeep, you may cast this card from exile without paying its mana cost.)"});
const tuiAndLaMoonAndOcean = card("Tui and La, Moon and Ocean", "Legendary Creature — Fish Spirit", "{3}{U}", {cmc: 4,"power":"3","toughness":"3","oracleText":"Whenever Tui and La become tapped, draw a card.\nWhenever Tui and La become untapped, put a +1/+1 counter on them."});
const carnivalOfSouls = card("Carnival of Souls", "Enchantment", "{1}{B}", {cmc: 2,"oracleText":"Whenever a creature enters, you lose 1 life and add {B}."});
const eagleOfDeliverance = card("Eagle of Deliverance", "Creature — Bird Soldier", "{4}{W}{W}", {cmc: 6,"power":"5","toughness":"5","keywords":["Flying"],"oracleText":"Flying\nWhen this creature enters, put an indestructible counter on another target creature you control. Draw a card if that creature's power is 2 or less."});
const curseOfStalkedPrey = card("Curse of Stalked Prey", "Enchantment — Aura Curse", "{1}{R}", {cmc: 2,"keywords":["Enchant"],"oracleText":"Enchant player\nWhenever a creature deals combat damage to enchanted player, put a +1/+1 counter on that creature."});
const turnTheEarth = card("Turn the Earth", "Instant", "{G}", {cmc: 1,"keywords":["Flashback"],"oracleText":"Choose up to three target cards in graveyards. The owners of those cards shuffle them into their libraries. You gain 2 life.\nFlashback {1}{G} (You may cast this card from your graveyard for its flashback cost. Then exile it.)"});
const davvolEvincarOfRath = card("Davvol, Evincar of Rath", "Legendary Creature — Phyrexian Noble", "{2}{B}{G}", {cmc: 4,"power":"2","toughness":"2","oracleText":"Whenever another creature you control enters, you lose 1 life and add {B}.","colors":["B","G"]});
const elvishDreadlord = card("Elvish Dreadlord", "Creature — Zombie Elf", "{3}{B}{B}", {cmc: 5,"power":"3","toughness":"3","keywords":["Encore","Deathtouch"],"oracleText":"Deathtouch\nWhen this creature dies, non-Elf creatures get -3/-3 until end of turn.\nEncore {5}{B}{B} ({5}{B}{B}, Exile this card from your graveyard: For each opponent, create a token copy that attacks that opponent this turn if able. They gain haste. Sacrifice them at the beginning of the next end step. Activate only as a sorcery.)"});
const piousWarrior = card("Pious Warrior", "Creature — Human Rebel Warrior", "{3}{W}", {cmc: 4,"power":"2","toughness":"3","oracleText":"Whenever this creature is dealt combat damage, you gain that much life."});
const sunbathingRootwalla = card("Sunbathing Rootwalla", "Creature — Lizard", "{1}{G}", {cmc: 2,"power":"2","toughness":"2","keywords":["Domain"],"oracleText":"Domain — {3}{G}: Until end of turn, this creature gets +1/+1 for each basic land type among lands you control. Activate only once each turn."});
const wallOfSouls = card("Wall of Souls", "Creature — Wall", "{1}{B}", {cmc: 2,"power":"0","toughness":"4","keywords":["Defender"],"oracleText":"Defender (This creature can't attack.)\nWhenever this creature is dealt combat damage, it deals that much damage to target opponent or planeswalker."});

describe("round 181", () => {
  it("all compile", () => supported(ambitiousDragonborn, backlash, deathgorgeScavenger, defyDeath, directorNickFury, dominusOfFealty, dranaKalastriaBloodchief, entsFury, fearsomeAwakening, gloomRipper, heideggerShinraExecutive, hinder, kickInTheDoor, korvoldAndTheNobleThief, loamingShaman, moggInfestation, moonstoneHarbinger, oxDrover, polukranosUnchained, prismaticStrands, restorativeTechnique, rhonassStalwart, scourgeOfTheSkyclaves, skanosDragonheart, teachingsOfTheArchaics, theGhoulGunslinger, thwip, toxinSliver, traitorsRoar, trygonPrime, uginsConjurant, urgeToFeed, venomEddieBrock, waxwaneWitness, eyeblightMassacre, wallOfEssence, ofOneMind, kirriTalentedSprout, granPulseOchu, tributeToHunger, consumingVapors, tuiAndLaMoonAndOcean, carnivalOfSouls, eagleOfDeliverance, curseOfStalkedPrey, turnTheEarth, davvolEvincarOfRath, elvishDreadlord, piousWarrior, sunbathingRootwalla, wallOfSouls));

  it("Ugin's Conjurant: damage is prevented and removes that many +1/+1 counters; with none left it is dealt", () => {
    const { s: s0, ap, ids } = setup([uginsConjurant, shock, shock, shock]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 3)));
    const c = ids[0]!;
    expect(counters(s, c)).toBe(3);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(c)])));
    expect(zone(s, c)).toBe("battlefield");
    expect(counters(s, c)).toBe(1);
    expect(s.objects[c]!.damage ?? 0).toBe(0);
    // Two damage with one counter: all of it is prevented, the one counter removed (CR 615; rulings).
    s = resolveAll(run(s, planCast(s, ap, ids[2]!, [tgt(c)])));
    expect(counters(s, c)).toBe(0);
    expect(zone(s, c)).toBe("graveyard");
  });

  it("Polukranos, Unchained: six counters when cast, twelve when it escapes; damage removes counters", () => {
    const { s: s0, ap, ids } = setup([polukranosUnchained, shock]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    const p = ids[0]!;
    expect(counters(s, p)).toBe(6);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(p)])));
    expect(counters(s, p)).toBe(4);
    expect(pt(s, p)).toBe("4/4");

    const { s: t0, ap: bp, ids: hand } = setup([polukranosUnchained]);
    const others = Array.from({ length: 6 }, () => into(t0, bp, bear(), "graveyard"));
    const q = hand[0]!;
    t0.objects[q]!.zone = "graveyard";
    t0.players[bp]!.hand.splice(t0.players[bp]!.hand.indexOf(q), 1);
    t0.players[bp]!.graveyard.push(q);
    for (const l of [card("Swamp", "Basic Land — Swamp"), card("Forest", "Basic Land — Forest")]) putOnBattlefield(t0, bp, l);
    const t = resolveAll(run(t0, planCast(t0, bp, q, undefined, undefined, undefined, undefined, { via: "escape", exileCards: others })));
    expect(zone(t, q)).toBe("battlefield");
    expect(counters(t, q)).toBe(12);
  });

  it("Urge to Feed: -3/-3, then a counter on each Vampire tapped", () => {
    const { s: s0, ap, ids, opp } = setup([urgeToFeed]);
    const v1 = putOnBattlefield(s0, ap, vampire);
    const v2 = putOnBattlefield(s0, ap, vampire);
    const v3 = putOnBattlefield(s0, ap, vampire);
    const b = putOnBattlefield(s0, opp, bear());
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "tap" });
    s = resolveAll(act(s, { type: "pickPermanents", player: ap, ids: [v1, v2] }));
    expect(zone(s, b)).toBe("graveyard");
    expect([counters(s, v1), counters(s, v2), counters(s, v3)]).toEqual([1, 1, 0]);
    expect([s.objects[v1]!.tapped, s.objects[v3]!.tapped]).toEqual([true, false]);
  });

  it("Defy Death: two counters on an Angel, none on another creature", () => {
    const { s: s0, ap, ids } = setup([defyDeath, defyDeath]);
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, ap, card("Plains", "Basic Land — Plains"));
    const a = into(s0, ap, angel, "graveyard");
    const b = into(s0, ap, bear(), "graveyard");
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(a)])));
    expect(zone(s, a)).toBe("battlefield");
    expect(counters(s, a)).toBe(2);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    expect(zone(s, b)).toBe("battlefield");
    expect(counters(s, b)).toBe(0);
  });

  it("Hinder: the countered card goes on the top or bottom of its owner's library, as its caster chooses", () => {
    const { s: s0, ap, ids } = setup([sorcery, hinder]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: s.stack[0]!.id }]));
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "topOrBottom" });
    s = resolveAll(option(s, "bottom"));
    const lib = s.players[ap]!.library;
    expect(zone(s, ids[0]!)).toBe("library");
    expect(lib[lib.length - 1]).toBe(ids[0]!);
  });

  it("Mogg Infestation: two Goblins for its controller for each creature that died", () => {
    const { s: s0, ap, ids, opp } = setup([moggInfestation]);
    putOnBattlefield(s0, opp, bear());
    putOnBattlefield(s0, opp, bigBear);
    putOnBattlefield(s0, ap, bear());
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [player(opp)])));
    expect(named(s, opp, "Grizzly Bears").length).toBe(0);
    expect(named(s, opp, "Goblin").length).toBe(4);
    expect(named(s, ap, "Grizzly Bears").length).toBe(1);
    expect(named(s, ap, "Goblin").length).toBe(0);
  });

  it("Backlash: the creature deals damage equal to its power to its controller", () => {
    const { s: s0, ap, ids, opp } = setup([backlash]);
    const b = putOnBattlefield(s0, opp, bigBear);
    const life = s0.players[opp]!.life;
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(s.objects[b]!.tapped).toBe(true);
    expect(s.players[opp]!.life).toBe(life - 5);
  });

  it("Toxin Sliver: a Sliver's combat damage destroys the creature; another creature's doesn't", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, toxinSliver);
    const b = putOnBattlefield(s0, ap, bear());
    const big1 = putOnBattlefield(s0, opp, bigBear);
    const big2 = putOnBattlefield(s0, opp, card("Big Wall", "Creature — Wall", "{4}", { cmc: 4, power: "0", toughness: "6", keywords: ["Defender"], oracleText: "Defender" }));
    const s = combat(s0, ap, opp, [t, b], [{ blocker: big1, attacker: t }, { blocker: big2, attacker: b }]);
    const after = passUntil(s, "end", ap);
    expect(zone(after, big1)).toBe("graveyard");
    expect(zone(after, big2)).toBe("battlefield");
  });

  it("Moonstone Harbinger: Bats get +1/+0 and deathtouch when you gain life on your turn, once a turn", () => {
    const { s: s0, ap, ids } = setup([heal, heal]);
    const m = putOnBattlefield(s0, ap, moonstoneHarbinger);
    const b = putOnBattlefield(s0, ap, bat);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(pt(s, m)).toBe("2/3");
    expect(pt(s, b)).toBe("2/1");
    expect(objHasKeyword(s, s.objects[b]!, "Deathtouch")).toBe(true);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(pt(s, b)).toBe("2/1");
  });

  it("Wax-Wane Witness: losing life on your turn counts; on another player's turn it doesn't", () => {
    const { s: s0, ap, ids } = setup([shock, shock]);
    const w = putOnBattlefield(s0, ap, waxwaneWitness);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [player(ap)])));
    expect(pt(s, w)).toBe("3/4");
    // Another player's turn: losing life then doesn't trigger it.
    const next = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s = passUntil(s, "main1", next);
    expect(pt(s, w)).toBe("2/4");
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const life = s.players[ap]!.life;
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [player(ap)])));
    expect(s.players[ap]!.life).toBe(life - 2);
    expect(pt(s, w)).toBe("2/4");
  });

  it("Heidegger: a Soldier token for each opponent with more creatures than you", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, heideggerShinraExecutive);
    putOnBattlefield(s0, opp, bear());
    putOnBattlefield(s0, opp, bear());
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    putOnBattlefield(s0, third, bear());
    const h = s0.battlefield.find((id) => s0.objects[id]!.cardId && s0.cards[s0.objects[id]!.cardId]!.name === "Heidegger, Shinra Executive")!;
    let s = passUntil(s0, "beginCombat", ap);
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(h)] });
    s = resolveAll(s);
    // One Soldier (Heidegger itself): +1/+0.
    expect(pt(s, h)).toBe("4/3");
    s = resolveAll(passUntil(s, "end", ap));
    // Only the first opponent controls more creatures (two to one).
    expect(named(s, ap, "Soldier").length).toBe(1);
  });

  it("Teachings of the Archaics: two cards, or three with four more cards in an opponent's hand", () => {
    const { s: s0, ap, ids, opp } = setup([teachingsOfTheArchaics, teachingsOfTheArchaics, teachingsOfTheArchaics]);
    const hands = (mine: number, theirs: number) => {
      for (const p of s0.turnOrder) {
        const h = s0.players[p]!.hand;
        for (const id of h.filter((id) => !ids.includes(id))) { h.splice(h.indexOf(id), 1); s0.objects[id]!.zone = "library"; s0.players[p]!.library.push(id); }
      }
      for (let i = 0; i < mine; i++) into(s0, ap, bear(), "hand");
      for (let i = 0; i < theirs; i++) into(s0, opp, bear(), "hand");
    };
    // As it resolves it's on the stack, not in your hand: 0 cards against 3, two cards.
    hands(0, 3);
    const [a, b, c] = ids;
    for (const id of [b!, c!]) { s0.players[ap]!.hand.splice(s0.players[ap]!.hand.indexOf(id), 1); s0.objects[id]!.zone = "exile"; }
    let s = resolveAll(run(s0, planCast(s0, ap, a!)));
    expect(s.players[ap]!.hand.length).toBe(2);
    // 0 against 5: at least four more, three cards.
    const s1 = setup([teachingsOfTheArchaics]);
    for (const p of s1.s.turnOrder) for (const id of s1.s.players[p]!.hand.filter((x) => x !== s1.ids[0])) { s1.s.players[p]!.hand.splice(s1.s.players[p]!.hand.indexOf(id), 1); s1.s.objects[id]!.zone = "library"; }
    for (let i = 0; i < 5; i++) into(s1.s, s1.opp, bear(), "hand");
    s = resolveAll(run(s1.s, planCast(s1.s, s1.ap, s1.ids[0]!)));
    expect(s.players[s1.ap]!.hand.length).toBe(3);
    // Against an equal hand: nothing.
    const s2 = setup([teachingsOfTheArchaics]);
    for (const p of s2.s.turnOrder) for (const id of s2.s.players[p]!.hand.filter((x) => x !== s2.ids[0])) { s2.s.players[p]!.hand.splice(s2.s.players[p]!.hand.indexOf(id), 1); s2.s.objects[id]!.zone = "library"; }
    s = resolveAll(run(s2.s, planCast(s2.s, s2.ap, s2.ids[0]!)));
    expect(s.players[s2.ap]!.hand.length).toBe(0);
  });

  it("Scourge of the Skyclaves: 20 minus the highest life total among players", () => {
    const { s: s0, ap } = setup([]);
    for (const p of s0.turnOrder) s0.players[p]!.life = 12;
    s0.players[ap]!.life = 15;
    const sc = putOnBattlefield(s0, ap, scourgeOfTheSkyclaves);
    expect(pt(s0, sc)).toBe("5/5");
  });

  it("Skanos Dragonheart: +X/+X, the greatest power among other Dragons you control and Dragon cards in your graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, skanosDragonheart);
    putOnBattlefield(s0, ap, card("Small Dragon", "Creature — Dragon", "{2}{R}", { cmc: 3, power: "2", toughness: "2" }));
    into(s0, ap, dragon, "graveyard");
    into(s0, ap, bigBear, "graveyard");
    const s = combat(s0, ap, opp, [k]);
    expect(pt(s, k)).toBe("9/9");
  });

  it("Ambitious Dragonborn: enters with counters equal to the greatest power on the battlefield or in the graveyard", () => {
    const { s: s0, ap, ids } = setup([ambitiousDragonborn]);
    putOnBattlefield(s0, ap, bear());
    into(s0, ap, bigBear, "graveyard");
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(counters(s, ids[0]!)).toBe(5);
  });

  it("Gloom Ripper: without an opposing creature, only your creature is pumped", () => {
    const { s: s0, ap, ids } = setup([gloomRipper]);
    const e = putOnBattlefield(s0, ap, elf);
    into(s0, ap, elf, "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = resolveAll(s);
    expect(s.pending?.kind).toBe("chooseTargets");
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(e), { kind: "none" }] }));
    // Two Elves you control (Gloom Ripper is one) and one Elf card in your graveyard.
    expect(pt(s, e)).toBe("4/1");
  });

  it("Gloom Ripper: the opposing creature gets -0/-X", () => {
    const { s: s0, ap, ids, opp } = setup([gloomRipper]);
    const e = putOnBattlefield(s0, ap, elf);
    const b = putOnBattlefield(s0, opp, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = resolveAll(s);
    expect(s.pending?.kind).toBe("chooseTargets");
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(e), tgt(b)] }));
    // X = 2: the Elf and Gloom Ripper, an Elf Assassin.
    expect(pt(s, e)).toBe("3/1");
    expect(zone(s, b)).toBe("graveyard");
  });

  it("Deathgorge Scavenger: a creature card gains 2 life, a noncreature card gives +1/+1", () => {
    const { s: s0, ap, ids, opp } = setup([deathgorgeScavenger]);
    const c = into(s0, opp, bear(), "graveyard");
    const life = s0.players[ap]!.life;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = resolveAll(s);
    if (s.pending?.kind === "chooseTargets") s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(c)] }));
    expect(zone(s, c)).toBe("exile");
    expect(s.players[ap]!.life).toBe(life + 2);
    expect(pt(s, ids[0]!)).toBe("3/2");
  });

  it("Loaming Shaman: target player shuffles the chosen cards from their graveyard into their library", () => {
    const { s: s0, ap, ids, opp } = setup([loamingShaman]);
    const a = into(s0, opp, bear(), "graveyard");
    const b = into(s0, opp, bear(), "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = resolveAll(s);
    expect(s.pending?.kind).toBe("chooseTargets");
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [player(opp), tgt(a)] }));
    expect(zone(s, a)).toBe("library");
    expect(zone(s, b)).toBe("graveyard");
  });

  it("Korvold and the Noble Thief: chapter III exiles three and they can be played this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, korvoldAndTheNobleThief);
    s0.objects[k]!.counters.lore = 2;
    let s = passUntil(passUntil(s0, "upkeep", ap, 4000), "main1", ap);
    s = resolveAll(s);
    if (s.pending?.kind === "chooseTargets") s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [player(opp)] }));
    const exiled = Object.values(s.objects).filter((o) => o.owner === opp && o.zone === "exile").map((o) => o.id);
    expect(exiled.length).toBe(3);
    // You may play them this turn: a land among them, or a spell if you can pay for it.
    for (const id of exiled) expect(s.objects[id]!.mayPlay).toMatchObject({ player: ap, until: "thisTurn" });
  });

  it("Dominus of Fealty: gains control of the permanent, untaps it, and gives it haste until end of turn", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, dominusOfFealty);
    const b = putOnBattlefield(s0, opp, bigBear);
    s0.objects[b]!.tapped = true;
    let s = passUntil(s0, "upkeep", ap, 4000);
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] });
    s = resolveAll(s);
    expect(controllerOf(s, s.objects[b]!)).toBe(ap);
    expect(s.objects[b]!.tapped).toBe(false);
    expect(objHasKeyword(s, s.objects[b]!, "Haste")).toBe(true);
  });

  it("The Ghoul, Gunslinger: a Treasure only when the target player is you", () => {
    const { s: s0, ap, ids, opp } = setup([shock, shock]);
    putOnBattlefield(s0, ap, theGhoulGunslinger);
    const z1 = putOnBattlefield(s0, ap, zombie);
    const z2 = putOnBattlefield(s0, ap, zombie);
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(z1)]));
    s = resolveAll(s);
    if (s.pending?.kind === "chooseTargets") s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [player(ap)] }));
    expect(named(s, ap, "Treasure").length).toBe(1);
    expect(s.players[ap]!.rad ?? 0).toBe(2);
    s = run(s, planCast(s, ap, ids[1]!, [tgt(z2)]));
    s = resolveAll(s);
    if (s.pending?.kind === "chooseTargets") s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [player(opp)] }));
    expect(named(s, ap, "Treasure").length).toBe(1);
    expect(s.players[opp]!.rad ?? 0).toBe(2);
  });

  it("Prismatic Strands: damage from sources of the chosen color is prevented", () => {
    const { s: s0, ap, ids } = setup([prismaticStrands, shock]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending?.kind).toBe("chooseOption");
    s = resolveAll(option(s, "Red"));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    expect(zone(s, b)).toBe("battlefield");
    expect(s.objects[b]!.damage ?? 0).toBe(0);
  });

  it("Trygon Prime: a counter on it and on up to one other attacking creature, which can't be blocked", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, trygonPrime);
    const b = putOnBattlefield(s0, ap, bear());
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [t, b].map((attacker) => ({ attacker, defender: opp })) });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] });
    s = resolveAll(s);
    expect([counters(s, t), counters(s, b)]).toEqual([1, 1]);
  });

  it("Kick in the Door: a counter, haste, and a venture", () => {
    const { s: s0, ap, ids } = setup([kickInTheDoor]);
    const b = putOnBattlefield(s0, ap, bear(), { sick: true });
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    if (s.pending?.kind === "chooseOption") s = resolveAll(option(s, s.pending.options[0]!));
    expect(counters(s, b)).toBe(1);
    expect(objHasKeyword(s, s.objects[b]!, "Haste")).toBe(true);
  });

  it("Ent's Fury: a counter only on a creature with power 4 or greater, then +1/+1 and a fight", () => {
    const { s: s0, ap, ids, opp } = setup([entsFury, entsFury]);
    const big = putOnBattlefield(s0, ap, bigBear);
    const small = putOnBattlefield(s0, ap, bear());
    const o1 = putOnBattlefield(s0, opp, bear());
    const o2 = putOnBattlefield(s0, opp, card("Tiny", "Creature — Insect", "{G}", { cmc: 1, power: "1", toughness: "1" }));
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(big), tgt(o1)])));
    expect(counters(s, big)).toBe(1);
    expect(pt(s, big)).toBe("7/7");
    expect(zone(s, o1)).toBe("graveyard");
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(small), tgt(o2)])));
    expect(counters(s, small)).toBe(0);
    expect(pt(s, small)).toBe("3/3");
    expect(zone(s, o2)).toBe("graveyard");
  });

  it("Restorative Technique: the target player gains 2 life and searches for a basic land; a counter on up to one creature", () => {
    const { s: s0, ap, ids } = setup([restorativeTechnique]);
    const b = putOnBattlefield(s0, ap, bear());
    const life = s0.players[ap]!.life;
    const lands = s0.battlefield.length;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [player(ap), tgt(b)])));
    expect(s.players[ap]!.life).toBe(life + 2);
    if (s.pending?.kind === "searchLibrary") s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: s.pending.cards.slice(0, 1) }));
    expect(s.battlefield.length).toBe(lands + 1);
    expect(counters(s, b)).toBe(1);
  });

  it("Thwip!: +2/+2 and flying; 2 life only for a Spider", () => {
    const { s: s0, ap, ids } = setup([thwip, thwip]);
    const sp = putOnBattlefield(s0, ap, spider);
    const b = putOnBattlefield(s0, ap, bear());
    const life = s0.players[ap]!.life;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(pt(s, b)).toBe("4/4");
    expect(s.players[ap]!.life).toBe(life);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(sp)])));
    expect(objHasKeyword(s, s.objects[sp]!, "Flying")).toBe(true);
    expect(s.players[ap]!.life).toBe(life + 2);
  });

  it("Venom, Eddie Brock: a counter whenever another creature dies, and a card if it was a Villain", () => {
    const { s: s0, ap, ids, opp } = setup([shock, shock]);
    const v = putOnBattlefield(s0, ap, venomEddieBrock);
    const plain = putOnBattlefield(s0, opp, card("Frail", "Creature — Human", "{W}", { cmc: 1, power: "1", toughness: "1" }));
    const vil = putOnBattlefield(s0, opp, villain);
    const hand = s0.players[ap]!.hand.length;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(plain)])));
    expect(counters(s, v)).toBe(1);
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(vil)])));
    expect(counters(s, v)).toBe(2);
    expect(s.players[ap]!.hand.length).toBe(hand - 2 + 1);
  });

  it("Director Nick Fury: Hero spells cost {1} less", () => {
    const { s: s0, ap, ids } = setup([hero]);
    putOnBattlefield(s0, ap, directorNickFury);
    for (const id of [...s0.battlefield]) if (/Basic Land/.test(s0.cards[s0.objects[id]!.cardId]!.typeLine) && s0.objects[id]!.controller === ap) s0.objects[id]!.tapped = true;
    const p = s0.battlefield.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Plains" && s0.objects[id]!.controller === ap)!;
    s0.objects[p]!.tapped = false;
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("battlefield");
  });

  it("Drana, Kalastria Bloodchief: -0/-X to a creature and +X/+0 to Drana", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, dranaKalastriaBloodchief);
    const b = putOnBattlefield(s0, opp, bigBear);
    const s = resolveAll(run(s0, planActivate(s0, ap, d, 0, [tgt(b)], undefined, undefined, 3)));
    expect(pt(s, b)).toBe("5/2");
    expect(pt(s, d)).toBe("7/4");
  });

  it("Ox Drover: an opponent gets an Ox and you draw; Oxen can't block it", () => {
    const { s: s0, ap, ids, opp } = setup([oxDrover]);
    const hand = s0.players[ap]!.hand.length;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = resolveAll(s);
    if (s.pending?.kind === "chooseTargets") s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [player(opp)] }));
    const ox = named(s, opp, "Ox");
    expect(ox.length).toBe(1);
    expect(blockProblem(s, s.objects[ox[0]!]!, s.objects[ids[0]!]!)).not.toBeNull();
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
  });
  it("Eyeblight Massacre: -2/-2 to each creature that isn't an Elf", () => {
    const { s: s0, ap, ids, opp } = setup([eyeblightMassacre]);
    const e = putOnBattlefield(s0, ap, card("Big Elf", "Creature — Elf Warrior", "{2}{G}", { cmc: 3, power: "3", toughness: "3" }));
    const b = putOnBattlefield(s0, opp, bear());
    const big = putOnBattlefield(s0, opp, bigBear);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(pt(s, e)).toBe("3/3");
    expect(zone(s, b)).toBe("graveyard");
    expect(pt(s, big)).toBe("3/3");
  });

  it("Wall of Essence: combat damage dealt to it gains that much life; other damage doesn't", () => {
    const { s: s0, ap, ids, opp } = setup([shock]);
    const big = putOnBattlefield(s0, ap, card("Hill Giant", "Creature — Giant", "{3}{R}", { cmc: 4, power: "3", toughness: "3" }));
    const w = putOnBattlefield(s0, opp, wallOfEssence);
    const life = s0.players[opp]!.life;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(w)])));
    expect(s.players[opp]!.life).toBe(life);
    s = combat(s, ap, opp, [big], [{ blocker: w, attacker: big }]);
    s = resolveAll(passUntil(s, "end", ap));
    expect(s.players[opp]!.life).toBe(life + 3);
  });

  it("Of One Mind: {2} less with a Human and a non-Human creature, not with only Humans", () => {
    const human = card("Test Human", "Creature — Human", "{W}", { cmc: 1, power: "1", toughness: "1" });
    const { s: s0, ap, ids } = setup([ofOneMind]);
    putOnBattlefield(s0, ap, human);
    putOnBattlefield(s0, ap, human);
    expect(spellCost(s0, ap, s0.objects[ids[0]!]!).extra).toBe(2);
    putOnBattlefield(s0, ap, bear());
    expect(spellCost(s0, ap, s0.objects[ids[0]!]!).extra).toBe(0);
  });

  it("Kirri, Talented Sprout: returns a Plant, Treefolk, or land card at your postcombat main phase; Plants get +2/+0", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, kirriTalentedSprout);
    const plant = putOnBattlefield(s0, ap, card("Test Plant", "Creature — Plant", "{G}", { cmc: 1, power: "0", toughness: "1" }));
    expect(pt(s0, plant)).toBe("2/1");
    const dead = into(s0, ap, card("Old Treefolk", "Creature — Treefolk", "{3}{G}", { cmc: 4, power: "2", toughness: "5" }), "graveyard");
    const other = into(s0, ap, bear(), "graveyard");
    let s = passUntil(s0, "main2", ap);
    expect(s.pending?.kind).toBe("chooseTargets");
    const at = s;
    expect(() => act(at, { type: "chooseTargets", player: ap, targets: [tgt(other)] })).toThrow();
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(dead)] }));
    expect(zone(s, dead)).toBe("hand");
  });

  it("Gran Pulse Ochu: +1/+1 for each permanent card in your graveyard, counted as it resolves", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, granPulseOchu);
    into(s0, ap, bear(), "graveyard");
    into(s0, ap, card("Forest", "Basic Land — Forest"), "graveyard");
    into(s0, ap, shock, "graveyard");
    let s = resolveAll(run(s0, planActivate(s0, ap, g, 0)));
    expect(pt(s, g)).toBe("3/3");
    into(s, ap, bear(), "graveyard");
    expect(pt(s, g)).toBe("3/3");
  });

  it("Tribute to Hunger: you gain life equal to the sacrificed creature's toughness; nothing without a creature", () => {
    const { s: s0, ap, ids, opp } = setup([tributeToHunger, tributeToHunger]);
    putOnBattlefield(s0, opp, card("Wall", "Creature — Wall", "{2}", { cmc: 2, power: "0", toughness: "4" }));
    const life = s0.players[ap]!.life;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [player(opp)])));
    if (s.pending?.kind === "pickPermanents") s = resolveAll(act(s, { type: "pickPermanents", player: opp, ids: s.pending.options.slice(0, 1) }));
    expect(s.players[ap]!.life).toBe(life + 4);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [player(opp)])));
    expect(s.players[ap]!.life).toBe(life + 4);
  });

  it("Consuming Vapors: the same, with rebound", () => {
    const { s: s0, ap, ids, opp } = setup([consumingVapors]);
    putOnBattlefield(s0, opp, bear());
    const life = s0.players[ap]!.life;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [player(opp)])));
    if (s.pending?.kind === "pickPermanents") s = resolveAll(act(s, { type: "pickPermanents", player: opp, ids: s.pending.options.slice(0, 1) }));
    expect(s.players[ap]!.life).toBe(life + 2);
    expect(zone(s, ids[0]!)).toBe("exile");
  });

  it("Tui and La: draw when they become tapped, a counter when they become untapped", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, tuiAndLaMoonAndOcean);
    const hand = s0.players[ap]!.hand.length;
    let s = combat(s0, ap, opp, [t]);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    s = resolveAll(passUntil(s, "upkeep", ap, 4000));
    expect(counters(s, t)).toBe(1);
  });

  it("Carnival of Souls: each creature that enters costs 1 life and adds {B}", () => {
    const { s: s0, ap, ids } = setup([bear()]);
    putOnBattlefield(s0, ap, carnivalOfSouls);
    const life = s0.players[ap]!.life;
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.life).toBe(life - 1);
    expect(s.players[ap]!.manaPool.B).toBe(1);
  });

  it("Eagle of Deliverance: an indestructible counter, and a card only for a creature with power 2 or less", () => {
    const { s: s0, ap, ids } = setup([eagleOfDeliverance]);
    const b = putOnBattlefield(s0, ap, bear());
    const hand = s0.players[ap]!.hand.length;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = resolveAll(s);
    if (s.pending?.kind === "chooseTargets") s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] }));
    expect(counters(s, b, "indestructible")).toBe(1);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);

    const { s: t0, ap: bp, ids: hand2 } = setup([eagleOfDeliverance]);
    const big = putOnBattlefield(t0, bp, bigBear);
    const n = t0.players[bp]!.hand.length;
    let t = resolveAll(run(t0, planCast(t0, bp, hand2[0]!)));
    if (t.pending?.kind === "chooseTargets") t = resolveAll(act(t, { type: "chooseTargets", player: bp, targets: [tgt(big)] }));
    expect(counters(t, big, "indestructible")).toBe(1);
    expect(t.players[bp]!.hand.length).toBe(n - 1);
  });

  it("Curse of Stalked Prey: a creature dealing combat damage to the enchanted player gets a counter; to another player, none", () => {
    const { s: s0, ap, ids, opp } = setup([curseOfStalkedPrey]);
    const b = putOnBattlefield(s0, ap, bear());
    const c = putOnBattlefield(s0, ap, bear());
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [player(opp)])));
    s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }, { attacker: c, defender: third }] });
    s = resolveAll(passUntil(resolveAll(s), "end", ap));
    expect([counters(s, b), counters(s, c)]).toEqual([1, 0]);
  });

  it("Turn the Earth: the chosen cards go into their owners' libraries; you gain 2 life", () => {
    const { s: s0, ap, ids, opp } = setup([turnTheEarth]);
    const a = into(s0, ap, bear(), "graveyard");
    const b = into(s0, opp, bear(), "graveyard");
    const c = into(s0, opp, bear(), "graveyard");
    const life = s0.players[ap]!.life;
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(a), tgt(b), { kind: "none" }])));
    expect([zone(s, a), zone(s, b), zone(s, c)]).toEqual(["library", "library", "graveyard"]);
    expect(s.players[ap]!.library).toContain(a);
    expect(s.players[opp]!.library).toContain(b);
    expect(s.players[ap]!.life).toBe(life + 2);
  });
});
