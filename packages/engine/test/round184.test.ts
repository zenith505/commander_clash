// Round 184: more of the harder cards both lanes skipped, from the most played down, and the cards that share their
// templates: pack tactics, "up to X targets, where X is ...", "that player or a planeswalker that player controls",
// "choose an opponent at random", Adventure spells and more.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, plainsCard, putOnBattlefield, scry, setup } from "./helpers";
import { botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, moveObject, parseManaCost, planActivate, planCast, planMana, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

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
/** A game where `ap` controls none of their lands: they're moved to the graveyard. */
const bare = (hand: CardDef[]) => {
  const g = setup(hand);
  for (const id of [...g.s.battlefield]) if (g.s.objects[id]!.controller === g.ap) moveObject(g.s, id, "graveyard");
  invalidateCharacteristics(g.s);
  return g;
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const counters = (s: GameState, id: string, c = "+1/+1") => s.objects[id]!.counters[c] ?? 0;
const pt = (s: GameState, id: ObjectId) => [power(s, s.objects[id]!), toughness(s, s.objects[id]!)];
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && [name, `${name} Token`].includes(characteristics(s, s.objects[id]!).name));
/** Attacks `opp` with `attackers`, unblocked, through combat damage. */
const combat = (s: GameState, ap: PlayerId, opp: PlayerId, attackers: string[]) => {
  s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender: opp })) });
  s = resolveAll(s);
  s = passUntil(s, "declareBlockers", ap);
  if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: opp, blocks: [] });
  return resolveAll(passUntil(resolveAll(s), "combatDamage", ap));
};
/** Answers a target question for a trigger, if one is asked. */
const choose = (s: GameState, targets: TargetChoice[]) => (s.pending?.kind === "chooseTargets" ? resolveAll(act(s, { type: "chooseTargets", player: s.pending.player, targets })) : s);
const big = card("Test Giant", "Creature — Giant", "{4}{G}", { cmc: 5, power: "5", toughness: "5" });
const huge = card("Test Titan", "Creature — Giant", "{5}{G}", { cmc: 6, power: "6", toughness: "6" });
const wall = card("Test Wall", "Creature — Wall", "{2}", { cmc: 2, power: "0", toughness: "3" });
const relic = card("Test Relic", "Artifact", "{1}", { cmc: 1 });
const ritual = card("Test Ritual", "Sorcery", "{3}{W}", { cmc: 4, oracleText: "You gain 1 life." });
const opt = card("Test Opt", "Instant", "{U}", { cmc: 1, oracleText: "Draw a card." });
const walker = card("Test Walker", "Legendary Planeswalker — Test", "{3}", { cmc: 3, loyalty: "5", oracleText: "+1: You gain 1 life." });
const dragon = card("Test Dragon", "Creature — Dragon", "{3}{R}", { cmc: 4, power: "4", toughness: "4", keywords: ["Flying"], oracleText: "Flying" });
const rider = scry(
  "adventure",
  [
    { name: "Murderous Rider", mana_cost: "{1}{B}{B}", type_line: "Creature — Zombie Knight", oracle_text: "Lifelink\nWhen this creature dies, put it on the bottom of its owner's library.", power: "2", toughness: "3" },
    { name: "Swift End", mana_cost: "{1}{B}{B}", type_line: "Instant — Adventure", oracle_text: "Destroy target creature or planeswalker. You lose 2 life. (Then exile this card. You may cast the creature later from exile.)" },
  ],
  { keywords: ["Lifelink"] },
);

// Real oracle text (Scryfall).
const aetherBurst = card("Aether Burst", "Instant", "{1}{U}", {"cmc":2,"oracleText":"Return up to X target creatures to their owners' hands, where X is one plus the number of cards named Aether Burst in all graveyards as you cast this spell.","colors":["U"]});
const archipelagore = card("Archipelagore", "Creature — Leviathan", "{5}{U}{U}", {"cmc":7,"power":"7","toughness":"7","keywords":["Mutate"],"oracleText":"Mutate {5}{U} (If you cast this spell for its mutate cost, put it over or under target non-Human creature you own. They mutate into the creature on top plus all abilities from under it.)\nWhenever this creature mutates, tap up to X target creatures, where X is the number of times this creature has mutated. Those creatures don't untap during their controller's next untap step.","colors":["U"]});
const battleCryGoblin = card("Battle Cry Goblin", "Creature — Goblin", "{1}{R}", {"cmc":2,"power":"2","toughness":"2","keywords":["Pack tactics"],"oracleText":"{1}{R}: Goblins you control get +1/+0 and gain haste until end of turn.\nPack tactics — Whenever this creature attacks, if you attacked with creatures with total power 6 or greater this combat, create a 1/1 red Goblin creature token that's tapped and attacking.","colors":["R"]});
const chancellorOfTales = card("Chancellor of Tales", "Creature — Faerie Advisor", "{3}{U}", {"cmc":4,"power":"2","toughness":"3","keywords":["Flying"],"oracleText":"Flying\nWhenever you cast an Adventure spell, you may copy it. You may choose new targets for the copy.","colors":["U"]});
const curseOfThePiercedHeart = card("Curse of the Pierced Heart", "Enchantment — Aura Curse", "{1}{R}", {"cmc":2,"keywords":["Enchant"],"oracleText":"Enchant player\nAt the beginning of enchanted player's upkeep, this Aura deals 1 damage to that player or a planeswalker that player controls.","colors":["R"]});
const doranBesiegedByTime = card("Doran, Besieged by Time", "Legendary Creature — Treefolk Druid", "{1}{W}{B}{G}", {"cmc":4,"power":"0","toughness":"5","oracleText":"Each creature spell you cast with toughness greater than its power costs {1} less to cast.\nWhenever a creature you control attacks or blocks, it gets +X/+X until end of turn, where X is the difference between its power and toughness.","colors":["B","G","W"]});
const elendaSaintOfDusk = card("Elenda, Saint of Dusk", "Legendary Creature — Vampire Knight", "{2}{W}{B}", {"cmc":4,"power":"4","toughness":"4","keywords":["Lifelink","Hexproof from","Hexproof"],"oracleText":"Lifelink, hexproof from instants\nAs long as your life total is greater than your starting life total, Elenda gets +1/+1 and has menace. Elenda gets an additional +5/+5 as long as your life total is at least 10 greater than your starting life total.","colors":["B","W"]});
const enduranceBobblehead = card("Endurance Bobblehead", "Artifact — Bobblehead", "{3}", {"cmc":3,"oracleText":"{T}: Add one mana of any color.\n{3}, {T}: Up to X target creatures you control get +1/+0 and gain indestructible until end of turn, where X is the number of Bobbleheads you control as you activate this ability. Activate only as a sorcery."});
const eshkiTemursRoar = card("Eshki, Temur's Roar", "Legendary Creature — Human Warrior", "{G}{U}{R}", {"cmc":3,"power":"2","toughness":"2","oracleText":"Whenever you cast a creature spell, put a +1/+1 counter on Eshki. If that spell's power is 4 or greater, draw a card. If that spell's power is 6 or greater, Eshki deals damage equal to Eshki's power to each opponent.","colors":["G","R","U"]});
const gnollHunter = card("Gnoll Hunter", "Creature — Gnoll", "{1}{G}", {"cmc":2,"power":"2","toughness":"2","keywords":["Pack tactics"],"oracleText":"Pack tactics — Whenever this creature attacks, if you attacked with creatures with total power 6 or greater this combat, put a +1/+1 counter on this creature.","colors":["G"]});
const gorionWiseMentor = card("Gorion, Wise Mentor", "Legendary Creature — Human Wizard", "{G}{W}{U}", {"cmc":3,"power":"3","toughness":"4","keywords":["Vigilance"],"oracleText":"Vigilance\nWhenever you cast an Adventure spell, you may copy it. You may choose new targets for the copy.","colors":["G","U","W"]});
const helgaSkittishSeer = card("Helga, Skittish Seer", "Legendary Creature — Frog Druid", "{G}{W}{U}", {"cmc":3,"power":"1","toughness":"3","oracleText":"Whenever you cast a creature spell with mana value 4 or greater, you draw a card, gain 1 life, and put a +1/+1 counter on Helga.\n{T}: Add X mana of any one color, where X is Helga's power. Spend this mana only to cast creature spells with mana value 4 or greater or creature spells with {X} in their mana costs.","colors":["G","U","W"]});
const hobgoblinCaptain = card("Hobgoblin Captain", "Creature — Goblin Barbarian", "{1}{R}", {"cmc":2,"power":"3","toughness":"1","keywords":["Pack tactics"],"oracleText":"Pack tactics — Whenever this creature attacks, if you attacked with creatures with total power 6 or greater this combat, this creature gains first strike until end of turn.","colors":["R"]});
const intrepidOutlander = card("Intrepid Outlander", "Creature — Orc Ranger", "{1}{G}", {"cmc":2,"power":"2","toughness":"3","keywords":["Pack tactics","Reach","Venture into the dungeon"],"oracleText":"Reach\nPack tactics — Whenever this creature attacks, if you attacked with creatures with total power 6 or greater this combat, venture into the dungeon. (Enter the first room or advance to the next room.)","colors":["G"]});
const lozhanDragonsLegacy = card("Lozhan, Dragons' Legacy", "Legendary Creature — Dragon Shaman", "{3}{U}{R}", {"cmc":5,"power":"4","toughness":"2","keywords":["Flying"],"oracleText":"Flying\nWhenever you cast an Adventure or Dragon spell, Lozhan deals damage equal to that spell's mana value to any target that isn't a commander.","colors":["R","U"]});
const minionOfTheMighty = card("Minion of the Mighty", "Creature — Kobold", "{R}", {"cmc":1,"power":"0","toughness":"1","keywords":["Pack tactics","Menace"],"oracleText":"Menace\nPack tactics — Whenever this creature attacks, if you attacked with creatures with total power 6 or greater this combat, you may put a Dragon creature card from your hand onto the battlefield tapped and attacking.","colors":["R"]});
const mogissMarauder = card("Mogis's Marauder", "Creature — Human Berserker", "{2}{B}", {"cmc":3,"power":"2","toughness":"2","oracleText":"When this creature enters, up to X target creatures each gain intimidate and haste until end of turn, where X is your devotion to black. (A creature with intimidate can't be blocked except by artifact creatures and/or creatures that share a color with it. Each {B} in the mana costs of permanents you control counts toward your devotion to black.)","colors":["B"]});
const phialOfGaladriel = card("Phial of Galadriel", "Legendary Artifact", "{3}", {"cmc":3,"oracleText":"If you would draw a card while you have no cards in hand, draw two cards instead.\nIf you would gain life while you have 5 or less life, you gain twice that much life instead.\n{T}: Add one mana of any color."});
const prismabasher = card("Prismabasher", "Creature — Elemental", "{4}{G}{G}", {"cmc":6,"power":"6","toughness":"6","keywords":["Trample","Vivid"],"oracleText":"Trample\nVivid — When this creature enters, up to X target creatures you control get +X/+X until end of turn, where X is the number of colors among permanents you control.","colors":["G"]});
const ralZarek = card("Ral Zarek", "Legendary Planeswalker — Ral", "{2}{U}{R}", {"cmc":4,"loyalty":"4","oracleText":"+1: Tap target permanent, then untap another target permanent.\n−2: Ral Zarek deals 3 damage to any target.\n−7: Flip five coins. Take an extra turn after this one for each coin that comes up heads.","colors":["R","U"]});
const ravingDead = card("Raving Dead", "Creature — Zombie", "{4}{B}", {"cmc":5,"power":"2","toughness":"6","keywords":["Deathtouch"],"oracleText":"Deathtouch\nAt the beginning of combat on your turn, choose an opponent at random. This creature attacks that player this combat if able.\nWhenever this creature deals combat damage to a player, that player loses half their life, rounded down.","colors":["B"]});
const recantation = card("Recantation", "Enchantment", "{3}{U}{U}", {"cmc":5,"oracleText":"At the beginning of your upkeep, you may put a verse counter on this enchantment.\n{U}, Sacrifice this enchantment: Return up to X target permanents to their owners' hands, where X is the number of verse counters on this enchantment.","colors":["U"]});
const robotDomination = card("Robot Domination", "Enchantment — Plan", "{3}{B}", {"cmc":4,"oracleText":"Whenever one or more creature cards are put into your graveyard from anywhere, you draw a card, lose 1 life, and put a plan counter on this enchantment.\nWhen the third plan counter is put on this enchantment, sacrifice it and create three 2/2 colorless Robot Villain artifact creature tokens.","colors":["B"]});
const ruhanOfTheFomori = card("Ruhan of the Fomori", "Legendary Creature — Giant Warrior", "{1}{U}{R}{W}", {"cmc":4,"power":"7","toughness":"7","oracleText":"At the beginning of combat on your turn, choose an opponent at random. Ruhan attacks that player this combat if able.","colors":["R","U","W"]});
const rumblingCrescendo = card("Rumbling Crescendo", "Enchantment", "{3}{R}{R}", {"cmc":5,"oracleText":"At the beginning of your upkeep, you may put a verse counter on this enchantment.\n{R}, Sacrifice this enchantment: Destroy up to X target lands, where X is the number of verse counters on this enchantment.","colors":["R"]});
const serrasLiturgy = card("Serra's Liturgy", "Enchantment", "{2}{W}{W}", {"cmc":4,"oracleText":"At the beginning of your upkeep, you may put a verse counter on this enchantment.\n{W}, Sacrifice this enchantment: Destroy up to X target artifacts and/or enchantments, where X is the number of verse counters on this enchantment.","colors":["W"]});
const storytellerPixie = card("Storyteller Pixie", "Creature — Faerie Wizard", "{3}{U}", {"cmc":4,"power":"3","toughness":"3","keywords":["Flying"],"oracleText":"Flying\nWhenever you cast an Adventure spell, draw a card.","colors":["U"]});
const targNarDemonfangGnoll = card("Targ Nar, Demon-Fang Gnoll", "Legendary Creature — Gnoll", "{R}{G}", {"cmc":2,"power":"2","toughness":"2","keywords":["Pack tactics","Double"],"oracleText":"Pack tactics — Whenever Targ Nar attacks, if you attacked with creatures with total power 6 or greater this combat, attacking creatures get +1/+0 until end of turn.\n{2}{R}{G}: Double Targ Nar's power and toughness until end of turn.","colors":["G","R"]});
const tigertribeHunter = card("Tiger-Tribe Hunter", "Creature — Human Barbarian", "{3}{R}{R}", {"cmc":5,"power":"4","toughness":"4","keywords":["Pack tactics","Trample"],"oracleText":"Trample\nPack tactics — Whenever this creature attacks, if you attacked with creatures with total power 6 or greater this combat, you may sacrifice another creature. When you do, this creature deals damage equal to the sacrificed creature's power to target creature.","colors":["R"]});
const troyanGutsyExplorer = card("Troyan, Gutsy Explorer", "Legendary Creature — Vedalken Scout", "{1}{G}{U}", {"cmc":3,"power":"1","toughness":"3","oracleText":"{T}: Add {G}{U}. Spend this mana only to cast spells with mana value 5 or greater or spells with {X} in their mana costs.\n{U}, {T}: Draw a card, then discard a card.","colors":["G","U"]});
const truthOrConsequences = card("Truth or Consequences", "Sorcery", "{2}{U}{R}", {"cmc":4,"keywords":["Secret council"],"oracleText":"Secret council — Each player secretly votes for truth or consequences, then those votes are revealed. You draw cards equal to the number of truth votes. Then choose an opponent at random. Truth or Consequences deals 3 damage to that player for each consequences vote.","colors":["R","U"]});
const vialSmasherTheFierce = card("Vial Smasher the Fierce", "Legendary Creature — Goblin Berserker", "{1}{B}{R}", {"cmc":3,"power":"2","toughness":"3","keywords":["Partner"],"oracleText":"Whenever you cast your first spell each turn, choose an opponent at random. Vial Smasher deals damage equal to that spell's mana value to that player or a planeswalker that player controls.\nPartner (You can have two commanders if both have partner.)","colors":["B","R"]});
const vileRequiem = card("Vile Requiem", "Enchantment", "{2}{B}{B}", {"cmc":4,"oracleText":"At the beginning of your upkeep, you may put a verse counter on this enchantment.\n{1}{B}, Sacrifice this enchantment: Destroy up to X target nonblack creatures, where X is the number of verse counters on this enchantment. They can't be regenerated.","colors":["B"]});
const blightwingBandit = card("Blightwing Bandit", "Creature — Faerie Rogue", "{3}{B}", {"cmc":4,"power":"2","toughness":"2","keywords":["Deathtouch","Flying"],"oracleText":"Flying, deathtouch\nWhenever you cast your first spell during each opponent's turn, look at the top card of that player's library, then exile it face down. You may play that card for as long as it remains exiled, and mana of any type can be spent to cast it.","colors":["B"]});

describe("round 184", () => {
  it("all compile", () => supported(aetherBurst, archipelagore, battleCryGoblin, chancellorOfTales, curseOfThePiercedHeart, doranBesiegedByTime, elendaSaintOfDusk, enduranceBobblehead, eshkiTemursRoar, gnollHunter, gorionWiseMentor, helgaSkittishSeer, hobgoblinCaptain, intrepidOutlander, lozhanDragonsLegacy, minionOfTheMighty, mogissMarauder, phialOfGaladriel, prismabasher, ralZarek, ravingDead, recantation, robotDomination, ruhanOfTheFomori, rumblingCrescendo, serrasLiturgy, storytellerPixie, targNarDemonfangGnoll, tigertribeHunter, troyanGutsyExplorer, truthOrConsequences, vialSmasherTheFierce, vileRequiem, blightwingBandit));

  it("Gnoll Hunter: pack tactics counts the total power of the creatures it attacked with", () => {
    for (const [buddy, grows] of [[bear(), 0], [big, 1]] as const) {
      const { s: s0, ap, opp } = setup([]);
      const g = putOnBattlefield(s0, ap, gnollHunter);
      const b = putOnBattlefield(s0, ap, buddy);
      const s = combat(s0, ap, opp, [g, b]);
      expect(counters(s, g), buddy.name).toBe(grows);
    }
  });

  it("Hobgoblin Captain: the total is the power as the attackers were declared; a later boost doesn't count", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, hobgoblinCaptain);
    const b = putOnBattlefield(s0, ap, bear());
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [h, b].map((attacker) => ({ attacker, defender: opp })) });
    // 3 + 2 power: the trigger checks as it's put on the stack and as it resolves (CR 603.4); pump the bear in between.
    s.objects[b]!.counters["+1/+1"] = 3;
    invalidateCharacteristics(s);
    s = resolveAll(s);
    expect(characteristics(s, s.objects[h]!).keywords).not.toContain("First strike");
  });

  it("Battle Cry Goblin: 6 power attacking makes a Goblin token that's tapped and attacking", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, battleCryGoblin);
    const b = putOnBattlefield(s0, ap, card("Test Ogre", "Creature — Ogre", "{3}{R}", { cmc: 4, power: "4", toughness: "4" }));
    let s = resolveAll(act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [g, b].map((attacker) => ({ attacker, defender: opp })) }));
    // Its controller chooses the player it attacks (CR 508.4).
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("attackWhom");
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: String(opp) }));
    const tokens = named(s, ap, "Goblin");
    expect(tokens).toHaveLength(1);
    expect(s.objects[tokens[0]!]!.tapped).toBe(true);
  });

  it("Troyan, Gutsy Explorer: its mana pays for a spell with mana value 5 or greater or with {X}, nothing else", () => {
    const xSpell = card("Test Blaze", "Sorcery", "{X}{U}", { cmc: 1, oracleText: "Draw X cards." });
    const five = card("Test Behemoth", "Creature — Beast", "{3}{G}{U}", { cmc: 5, power: "5", toughness: "5" });
    const two = card("Test Bird", "Creature — Bird", "{G}{U}", { cmc: 2, power: "1", toughness: "1" });
    const { s, ap, ids } = bare([xSpell, five, two]);
    putOnBattlefield(s, ap, troyanGutsyExplorer);
    for (let i = 0; i < 3; i++) putOnBattlefield(s, ap, plainsCard);
    expect(planCast(s, ap, ids[2]!)).toBeNull();
    expect(planCast(s, ap, ids[1]!)).not.toBeNull();
    expect(planCast(s, ap, ids[0]!, undefined, undefined, undefined, 1)).not.toBeNull();
  });

  it("Helga, Skittish Seer: a creature spell with mana value 4 or more draws, gains 1 life and grows her; her mana is only for those", () => {
    const { s: s0, ap, ids } = setup([dragon]);
    const h = putOnBattlefield(s0, ap, helgaSkittishSeer);
    const hand = s0.players[ap]!.hand.length;
    const life = s0.players[ap]!.life;
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
    expect(s.players[ap]!.life).toBe(life + 1);
    expect(counters(s, h)).toBe(1);
    // Her mana: a creature spell with {X} in its cost, yes; a noncreature spell with {X}, no.
    const xCreature = card("Test Hydra", "Creature — Hydra", "{X}{G}", { cmc: 1, power: "0", toughness: "0", oracleText: "This creature enters with X +1/+1 counters on it." });
    const xSorcery = card("Test Blaze", "Sorcery", "{X}{G}", { cmc: 1, oracleText: "Draw X cards." });
    const g = bare([xCreature, xSorcery]);
    putOnBattlefield(g.s, g.ap, helgaSkittishSeer);
    expect(planCast(g.s, g.ap, g.ids[1]!, undefined, undefined, undefined, 0)).toBeNull();
    expect(planCast(g.s, g.ap, g.ids[0]!, undefined, undefined, undefined, 0)).not.toBeNull();
  });

  it("Elenda, Saint of Dusk: +1/+1 and menace above starting life, another +5/+5 at 10 more", () => {
    const { s, ap } = setup([]);
    const e = putOnBattlefield(s, ap, elendaSaintOfDusk);
    for (const [life, p, menace] of [[40, 4, false], [41, 5, true], [49, 5, true], [50, 10, true]] as const) {
      s.players[ap]!.life = life;
      invalidateCharacteristics(s);
      expect(pt(s, e), `${life}`).toEqual([p, p]);
      expect(characteristics(s, s.objects[e]!).keywords.includes("Menace"), `${life}`).toBe(menace);
    }
  });

  it("Eshki, Temur's Roar: a counter each creature spell; power 4 draws; power 6 deals Eshki's power to each opponent", () => {
    for (const [spell, draws, damage] of [[bear(), 0, 0], [big, 1, 0], [huge, 1, 3]] as const) {
      const { s: s0, ap, ids, opp } = setup([spell]);
      const e = putOnBattlefield(s0, ap, eshkiTemursRoar);
      const hand = s0.players[ap]!.hand.length;
      const life = s0.players[opp]!.life;
      const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
      expect(counters(s, e)).toBe(1);
      expect(s.players[ap]!.hand.length, spell.name).toBe(hand - 1 + draws);
      expect(s.players[opp]!.life, spell.name).toBe(life - damage);
    }
  });

  it("Lozhan, Dragons' Legacy: a Dragon spell deals its mana value to any target that isn't a commander", () => {
    const { s: s0, ap, ids, opp } = setup([dragon]);
    putOnBattlefield(s0, ap, lozhanDragonsLegacy);
    const cmdr = putOnBattlefield(s0, opp, bear({ name: "Their Commander" }), { commander: true });
    const victim = putOnBattlefield(s0, opp, card("Test Ogre", "Creature — Ogre", "{3}{R}", { cmc: 4, power: "4", toughness: "4" }));
    const s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(cmdr)] })).toThrow();
    const after = choose(s, [tgt(victim)]);
    expect(zone(after, victim)).toBe("graveyard");
  });

  it("Storyteller Pixie: an Adventure spell draws a card; the creature half doesn't", () => {
    for (const face of [1, undefined]) {
      const { s: s0, ap, ids, opp } = setup([rider]);
      putOnBattlefield(s0, ap, storytellerPixie);
      const victim = putOnBattlefield(s0, opp, bear());
      const hand = s0.players[ap]!.hand.length;
      const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, face ? [tgt(victim)] : undefined, undefined, "auto", undefined, face ? { face } : {})));
      expect(s.players[ap]!.hand.length, `face ${face}`).toBe(hand - 1 + (face ? 1 : 0));
    }
  });

  it("Vial Smasher the Fierce: the first spell each turn hits a random opponent, or a planeswalker they control", () => {
    const { s: s0, ap, ids } = setup([relic, relic]);
    putOnBattlefield(s0, ap, vialSmasherTheFierce);
    const opps = s0.turnOrder.filter((p) => p !== ap);
    const pws = opps.map((p) => putOnBattlefield(s0, p, walker));
    for (const pw of pws) s0.objects[pw]!.counters.loyalty = 5;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = resolveAll(s);
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("damageWhom");
    if (s.pending?.kind !== "chooseOption") throw new Error();
    // The options: the chosen opponent, then the planeswalkers that player controls.
    const who = Number(s.pending.options[0]!.slice(1)) as PlayerId;
    expect(opps).toContain(who);
    const pw = pws[opps.indexOf(who)]!;
    expect(s.pending.options).toEqual([`p${who}`, pw]);
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: pw }));
    expect(s.objects[pw]!.counters.loyalty).toBe(4);
    // Only the first spell each turn.
    const lives = s.players.map((p) => p.life);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(s.pending).toBeFalsy();
    expect(s.players.map((p) => p.life)).toEqual(lives);
  });

  it("Vial Smasher the Fierce: with no planeswalker, the damage goes to the player; the bot chooses too", () => {
    const { s: s0, ap, ids } = setup([card("Test Idol", "Artifact", "{4}", { cmc: 4 })]);
    putOnBattlefield(s0, ap, vialSmasherTheFierce);
    const lives = s0.players.map((p) => p.life);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    const lost = s.players.map((p, i) => lives[i]! - p.life);
    expect(lost.filter((n) => n === 4)).toHaveLength(1);
    expect(lost[s.turnOrder.indexOf(ap)]).toBe(0);
  });

  it("Curse of the Pierced Heart: the bot hurts a low-life player rather than their planeswalker", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, curseOfThePiercedHeart);
    s0.objects[c]!.attachedToPlayer = opp;
    const pw = putOnBattlefield(s0, opp, walker);
    s0.objects[pw]!.counters.loyalty = 5;
    s0.players[opp]!.life = 8;
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "upkeep", opp);
    s = resolveAll(s);
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("damageWhom");
    const bot = botActions(s, ap)[0]!;
    expect(bot).toEqual({ type: "chooseOption", player: ap, choice: `p${opp}` });
    s = resolveAll(act(s, bot));
    expect(s.players[opp]!.life).toBe(7);
  });

  it("Raving Dead: at the beginning of combat it must attack a random opponent", () => {
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, ravingDead);
    let s = resolveAll(passUntil(s0, "beginCombat", ap));
    const must = characteristics(s, s.objects[r]!).mustAttack;
    expect(must).toHaveLength(1);
    expect(s.turnOrder.filter((p) => p !== ap)).toContain(must[0]);
    s = passUntil(s, "declareAttackers", ap);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [] })).toThrow(/must attack/);
    const other = s.turnOrder.find((p) => p !== ap && p !== must[0])!;
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: r, defender: other }] })).toThrow(/must attack/);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: r, defender: must[0]! }] });
    // It lasts this combat only.
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(characteristics(s, s.objects[r]!).mustAttack).toEqual([]);
  });

  it("Doran, Besieged by Time: creature spells with toughness greater than power cost {1} less; attackers get the difference", () => {
    const { s, ap, ids } = bare([wall, card("Test Golem", "Artifact Creature — Golem", "{2}", { cmc: 2, power: "2", toughness: "2" })]);
    putOnBattlefield(s, ap, doranBesiegedByTime);
    putOnBattlefield(s, ap, plainsCard);
    expect(planCast(s, ap, ids[0]!)).not.toBeNull();
    expect(planCast(s, ap, ids[1]!)).toBeNull();
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    putOnBattlefield(s1, ap1, doranBesiegedByTime);
    const w = putOnBattlefield(s1, ap1, card("Test Turtle", "Creature — Turtle", "{2}", { cmc: 2, power: "1", toughness: "4" }));
    const s2 = resolveAll(act(passUntil(s1, "declareAttackers", ap1), { type: "declareAttackers", player: ap1, attacks: [{ attacker: w, defender: opp1 }] }));
    expect(pt(s2, w)).toEqual([4, 7]);
  });

  it("Phial of Galadriel: drawing with an empty hand draws two; gaining life at 5 or less gains twice as much", () => {
    const { s: s0, ap, ids } = setup([opt]);
    putOnBattlefield(s0, ap, phialOfGaladriel);
    s0.players[ap]!.hand = [ids[0]!];
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.hand.length).toBe(2);
    const { s: s1, ap: ap1, ids: ids1 } = setup([ritual, ritual]);
    putOnBattlefield(s1, ap1, phialOfGaladriel);
    s1.players[ap1]!.life = 5;
    s = resolveAll(run(s1, planCast(s1, ap1, ids1[0]!)));
    expect(s.players[ap1]!.life).toBe(7);
    s = resolveAll(run(s, planCast(s, ap1, ids1[1]!)));
    expect(s.players[ap1]!.life).toBe(8);
  });

  it("Ral Zarek: −7 flips five coins and takes an extra turn for each heads; no one wins or loses those flips", () => {
    const chance = card("Test Encounter", "Enchantment", "{2}{R}", { cmc: 3, oracleText: "Whenever you win a coin flip, you gain 1 life." });
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, ralZarek);
    putOnBattlefield(s0, ap, chance);
    s0.objects[r]!.counters.loyalty = 7;
    const life = s0.players[ap]!.life;
    const s = resolveAll(run(s0, planActivate(s0, ap, r, 2)));
    const line = JSON.stringify(s.log).match(/(\d) came up heads/);
    expect(line).not.toBeNull();
    expect((s.extraTurns ?? []).filter((t) => t.player === ap)).toHaveLength(Number(line![1]));
    expect(s.players[ap]!.life).toBe(life);
  });

  it("Endurance Bobblehead: up to X targets, X the Bobbleheads you control as you activate it", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, enduranceBobblehead);
    putOnBattlefield(s0, ap, card("Test Bobblehead", "Artifact — Bobblehead", "{1}", { cmc: 1 }));
    const bears = [0, 1, 2].map((i) => putOnBattlefield(s0, ap, bear({ name: `Bear ${i}` })));
    expect(planActivate(s0, ap, b, 0, bears.map(tgt))).toBeNull();
    const s = resolveAll(run(s0, planActivate(s0, ap, b, 0, bears.slice(0, 2).map(tgt))));
    expect(pt(s, bears[0]!)).toEqual([3, 2]);
    expect(pt(s, bears[1]!)).toEqual([3, 2]);
    expect(pt(s, bears[2]!)).toEqual([2, 2]);
  });

  it("Recantation: X is the verse counters as it's activated, though it's sacrificed to pay", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, recantation);
    s0.objects[r]!.counters.verse = 2;
    const theirs = [0, 1, 2].map((i) => putOnBattlefield(s0, opp, bear({ name: `Bear ${i}` })));
    expect(planActivate(s0, ap, r, 0, theirs.map(tgt))).toBeNull();
    const s = resolveAll(run(s0, planActivate(s0, ap, r, 0, theirs.slice(0, 2).map(tgt))));
    expect(zone(s, r)).toBe("graveyard");
    expect(theirs.map((t) => zone(s, t))).toEqual(["hand", "hand", "battlefield"]);
  });

  it("Prismabasher: up to X targets, X the colors among your permanents as the trigger is put on the stack", () => {
    const { s: s0, ap, ids } = setup([prismabasher]);
    const red = putOnBattlefield(s0, ap, card("Test Goblin", "Creature — Goblin", "{R}", { cmc: 1, power: "1", toughness: "1" }));
    const b = putOnBattlefield(s0, ap, bear());
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending?.kind).toBe("chooseTargets");
    if (s.pending?.kind !== "chooseTargets") throw new Error();
    // Green and red: two targets at most.
    const p = named(s, ap, "Prismabasher")[0]!;
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(red), tgt(b), tgt(p)] })).toThrow(/at most X \(2\)/);
    s = choose(s, [tgt(red), tgt(b)]);
    expect(pt(s, red)).toEqual([3, 3]);
    expect(pt(s, b)).toEqual([4, 4]);
    expect(pt(s, p)).toEqual([6, 6]);
  });

  it("Aether Burst: up to one plus the Aether Bursts in all graveyards", () => {
    const { s: s0, ap, ids, opp } = setup([aetherBurst]);
    into(s0, opp, aetherBurst, "graveyard");
    const theirs = [0, 1, 2].map((i) => putOnBattlefield(s0, opp, bear({ name: `Bear ${i}` })));
    expect(planCast(s0, ap, ids[0]!, theirs.map(tgt))).toBeNull();
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, theirs.slice(0, 2).map(tgt))));
    expect(theirs.map((t) => zone(s, t))).toEqual(["hand", "hand", "battlefield"]);
  });

  it("Blightwing Bandit: the first spell during an opponent's turn exiles the top card of that opponent's library", () => {
    const { s: s0, ap, ids, opp } = setup([opt]);
    putOnBattlefield(s0, ap, blightwingBandit);
    let s = passUntil(s0, "upkeep", opp);
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const top = s.players[opp]!.library[0]!;
    const mine = s.players[ap]!.library[0]!;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(zone(s, top)).toBe("exile");
    expect(s.objects[top]!.hiddenExile?.seen).toEqual([ap]);
    expect(zone(s, mine)).not.toBe("exile");
  });

  it("Robot Domination: a creature card put into your graveyard draws, costs 1 life and adds a plan counter", () => {
    const { s: s0, ap, ids, opp } = setup([card("Test Doom", "Instant", "{B}", { cmc: 1, oracleText: "Destroy target creature." })]);
    const r = putOnBattlefield(s0, ap, robotDomination);
    const b = putOnBattlefield(s0, ap, bear());
    const hand = s0.players[ap]!.hand.length;
    const life = s0.players[ap]!.life;
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.players[ap]!.life).toBe(life - 1);
    expect(counters(s, r, "plan")).toBe(1);
    void opp;
  });
});
