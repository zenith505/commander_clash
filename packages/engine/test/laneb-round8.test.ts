// Lane B, round 8: the least played cards first, working up the popularity list (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, forest, island, mountain, passUntil, plainsCard, pt, putOnBattlefield, setup, swamp } from "./helpers";
import { characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, parseManaCost, planActivate, planCast, planMana, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { playerProtection } from "../src/effects/targeting";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/**
 * Everyone passes until the stack is empty. "You may" questions get `yes`; a pending target choice gets `targets`; a pick
 * gets `pick` (or the first ones offered); a discard the first cards in hand. Stops at any other question.
 */
const settle = (s: GameState, opts: { yes?: boolean; targets?: TargetChoice[]; pick?: string[] } = {}) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.yes ?? true });
    else if (p?.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets } as Action);
    else if (p?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: p.player, ids: opts.pick ?? p.options.slice(0, p.count) });
    else if (p?.kind === "discard") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
    else if (p) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % s.turnOrder.length]!;
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const has = (s: GameState, id: string, k: string) => objHasKeyword(s, s.objects[id]!, k);
const creature = (name: string, typeLine: string, manaCost: string, p: number, t: number, extra: Partial<CardDef> = {}) =>
  card(name, typeLine, manaCost, { power: String(p), toughness: String(t), ...extra });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2);
const redOgre = () => creature("Red Ogre", "Creature — Ogre", "{2}{R}", 3, 3);
const blueBird = () => creature("Blue Bird", "Creature — Bird", "{1}{U}", 1, 1, { keywords: ["Flying"], oracleText: "Flying" });
const into = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" = "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const attach = (s: GameState, pid: PlayerId, def: CardDef, to: string) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = to;
  invalidateCharacteristics(s);
  return id;
};
/** The top spell on the stack, as a target. */
const topSpell = (s: GameState): TargetChoice => ({ kind: "stack", id: s.stack[s.stack.length - 1]!.id } as TargetChoice);
/** The next upkeep of `pid`, with its triggers resolved. */
const toUpkeep = (s: GameState, pid: PlayerId, opts: Parameters<typeof settle>[1] = {}) => settle(passUntil(s, "upkeep", pid), opts);
const testShock = () => card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "Test Shock deals 2 damage to any target." });

// Real oracle text (Scryfall).
const flashfires = card("Flashfires", "Sorcery", "{3}{R}", { cmc: 4, oracleText: "Destroy all Plains." });
const zealousPersecution = card("Zealous Persecution", "Instant", "{W}{B}", { cmc: 2, colors: ["B","W"], oracleText: "Until end of turn, creatures you control get +1/+1 and creatures your opponents control get -1/-1." });
const skulduggery = card("Skulduggery", "Instant", "{B}", { cmc: 1, oracleText: "Until end of turn, target creature you control gets +1/+1 and target creature an opponent controls gets -1/-1." });
const timelyReinforcements = card("Timely Reinforcements", "Sorcery", "{2}{W}", { cmc: 3, oracleText: "If you have less life than an opponent, you gain 6 life. If you control fewer creatures than an opponent, create three 1/1 white Soldier creature tokens." });
const feudkillersVerdict = card("Feudkiller's Verdict", "Kindred Sorcery — Giant", "{4}{W}{W}", { cmc: 6, oracleText: "You gain 10 life. Then if you have more life than an opponent, create a 5/5 white Giant Warrior creature token." });
const wallOfResistance = card("Wall of Resistance", "Creature — Wall", "{1}{W}", { cmc: 2, power: "0", toughness: "3", keywords: ["Flying","Defender"], oracleText: "Defender (This creature can't attack.)\nFlying\nAt the beginning of each end step, if this creature was dealt damage this turn, put a +0/+1 counter on it." });
const guulDrazSpecter = card("Guul Draz Specter", "Creature — Specter", "{2}{B}{B}", { cmc: 4, power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying\nThis creature gets +3/+3 as long as an opponent has no cards in hand.\nWhenever this creature deals combat damage to a player, that player discards a card." });
const aangALotToLearn = card("Aang, A Lot to Learn", "Legendary Creature — Human Avatar Ally", "{2}{G/W}", { cmc: 3, power: "3", toughness: "2", oracleText: "Aang has vigilance as long as there's a Lesson card in your graveyard.\nWhenever another creature you control dies, put a +1/+1 counter on Aang." });
const cosmicLarva = card("Cosmic Larva", "Creature — Beast", "{1}{R}{R}", { cmc: 3, power: "7", toughness: "6", keywords: ["Trample"], oracleText: "Trample\nAt the beginning of your upkeep, sacrifice this creature unless you sacrifice two lands." });
const eatenBySpiders = card("Eaten by Spiders", "Instant", "{2}{G}", { cmc: 3, oracleText: "Destroy target creature with flying and all Equipment attached to that creature." });
const burningHands = card("Burning Hands", "Instant", "{1}{R}", { cmc: 2, oracleText: "Burning Hands deals 2 damage to target creature or planeswalker. If that permanent is green, Burning Hands deals 6 damage instead." });
const invasiveManeuvers = card("Invasive Maneuvers", "Instant", "{1}{R}", { cmc: 2, oracleText: "Invasive Maneuvers deals 3 damage to target creature. It deals 5 damage instead if you control a Spacecraft." });
const necrobite = card("Necrobite", "Instant", "{2}{B}", { cmc: 3, keywords: ["Heal","Regenerate"], oracleText: "Target creature gains deathtouch until end of turn. Regenerate it. (The next time that creature would be destroyed this turn, instead tap it, remove it from combat, and heal all damage on it.)" });
const butchersGlee = card("Butcher's Glee", "Instant", "{2}{B}", { cmc: 3, keywords: ["Regenerate"], oracleText: "Target creature gets +3/+0 and gains lifelink until end of turn. Regenerate it. (Damage dealt by a creature with lifelink also causes its controller to gain that much life.)" });
const boonOfErebos = card("Boon of Erebos", "Instant", "{B}", { cmc: 1, keywords: ["Regenerate"], oracleText: "Target creature gets +2/+0 until end of turn. Regenerate it. You lose 2 life." });
const rakdosIckspitter = card("Rakdos Ickspitter", "Creature — Thrull", "{1}{B}{R}", { cmc: 3, power: "1", toughness: "1", oracleText: "{T}: This creature deals 1 damage to target creature and that creature's controller loses 1 life." });
const vileManifestation = card("Vile Manifestation", "Creature — Horror", "{1}{B}", { cmc: 2, power: "0", toughness: "4", keywords: ["Cycling"], oracleText: "This creature gets +1/+0 for each card with cycling in your graveyard.\nCycling {2} ({2}, Discard this card: Draw a card.)" });
const deathsApproach = card("Death's Approach", "Enchantment — Aura", "{B}", { cmc: 1, keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets -X/-X, where X is the number of creature cards in its controller's graveyard." });
const disturbingConversion = card("Disturbing Conversion", "Enchantment — Aura", "{1}{U}", { cmc: 2, keywords: ["Enchant","Flash","Mill"], oracleText: "Flash\nEnchant creature\nWhen this Aura enters, each player mills two cards.\nEnchanted creature gets -X/-0, where X is the number of cards in its controller's graveyard." });
const umaraMystic = card("Umara Mystic", "Creature — Merfolk Wizard", "{1}{U}{R}", { cmc: 3, power: "1", toughness: "3", keywords: ["Flying"], colors: ["R","U"], oracleText: "Flying\nWhenever you cast an instant, sorcery, or Wizard spell, this creature gets +2/+0 until end of turn." });
const gruulSpellbreaker = card("Gruul Spellbreaker", "Creature — Ogre Warrior", "{1}{R}{G}", { cmc: 3, power: "3", toughness: "3", keywords: ["Trample","Riot"], colors: ["G","R"], oracleText: "Riot (This creature enters with your choice of a +1/+1 counter or haste.)\nTrample\nDuring your turn, you and this creature have hexproof." });
const stoicSphinx = card("Stoic Sphinx", "Creature — Sphinx", "{2}{U}{U}", { cmc: 4, power: "5", toughness: "3", keywords: ["Flying","Flash"], oracleText: "Flash\nFlying\nThis creature has hexproof as long as you haven't cast a spell this turn." });
const glisteningDeluge = card("Glistening Deluge", "Sorcery", "{1}{B}{B}", { cmc: 3, oracleText: "All creatures get -1/-1 until end of turn. Creatures that are green and/or white get an additional -2/-2 until end of turn." });
const repopulate = card("Repopulate", "Instant", "{1}{G}", { cmc: 2, keywords: ["Cycling"], oracleText: "Shuffle all creature cards from target player's graveyard into that player's library.\nCycling {2} ({2}, Discard this card: Draw a card.)" });
const doubleNegative = card("Double Negative", "Instant", "{U}{U}{R}", { cmc: 3, colors: ["R","U"], oracleText: "Counter up to two target spells." });
const skizzik = card("Skizzik", "Creature — Elemental", "{3}{R}", { cmc: 4, power: "5", toughness: "3", keywords: ["Haste","Trample","Kicker"], oracleText: "Kicker {R} (You may pay an additional {R} as you cast this spell.)\nTrample, haste\nAt the beginning of the end step, if this creature wasn't kicked, sacrifice it." });
const sphinxOfLostTruths = card("Sphinx of Lost Truths", "Creature — Sphinx", "{3}{U}{U}", { cmc: 5, power: "3", toughness: "5", keywords: ["Kicker","Flying"], oracleText: "Kicker {1}{U} (You may pay an additional {1}{U} as you cast this spell.)\nFlying\nWhen this creature enters, draw three cards. Then if it wasn't kicked, discard three cards." });
const mindsparker = card("Mindsparker", "Creature — Elemental", "{1}{R}{R}", { cmc: 3, power: "3", toughness: "2", keywords: ["First strike"], oracleText: "First strike (This creature deals combat damage before creatures without first strike.)\nWhenever an opponent casts a white or blue instant or sorcery spell, this creature deals 2 damage to that player." });
const lightningReaver = card("Lightning Reaver", "Creature — Zombie Beast", "{3}{B}{R}", { cmc: 5, power: "3", toughness: "3", keywords: ["Haste","Fear"], oracleText: "Haste; fear (This creature can't be blocked except by artifact creatures and/or black creatures.)\nWhenever this creature deals combat damage to a player, put a charge counter on it.\nAt the beginning of your end step, this creature deals damage equal to the number of charge counters on it to each opponent." });
const lullmagesFamiliar = card("Lullmage's Familiar", "Creature — Beast", "{1}{G}{U}", { cmc: 3, power: "2", toughness: "4", oracleText: "{T}: Add {G} or {U}.\nWhenever you cast a kicked spell, you gain 2 life." });
const woebringerDemon = card("Woebringer Demon", "Creature — Demon", "{3}{B}{B}", { cmc: 5, power: "4", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nAt the beginning of each player's upkeep, that player sacrifices a creature of their choice. If the player can't, sacrifice this creature." });
const lordOfTresserhorn = card("Lord of Tresserhorn", "Legendary Creature — Zombie", "{1}{U}{B}{R}", { cmc: 4, power: "10", toughness: "4", keywords: ["Regenerate"], colors: ["B","R","U"], oracleText: "When Lord of Tresserhorn enters, you lose 2 life, you sacrifice two creatures, and target opponent draws two cards.\n{B}: Regenerate Lord of Tresserhorn." });
const dinrovaHorror = card("Dinrova Horror", "Creature — Horror", "{4}{U}{B}", { cmc: 6, power: "4", toughness: "4", colors: ["B","U"], oracleText: "When this creature enters, return target permanent to its owner's hand, then that player discards a card." });
const holdForQuestioning = card("Hold for Questioning", "Enchantment — Aura", "{3}{U}", { cmc: 4, keywords: ["Investigate","Enchant"], oracleText: "Enchant creature or planeswalker\nWhen this Aura enters, tap enchanted permanent and investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")\nEnchanted permanent doesn't untap during its controller's untap step and its activated abilities can't be activated." });
const cruelReality = card("Cruel Reality", "Enchantment — Aura Curse", "{5}{B}{B}", { cmc: 7, keywords: ["Enchant"], oracleText: "Enchant player\nAt the beginning of enchanted player's upkeep, that player sacrifices a creature or planeswalker of their choice. If the player can't, they lose 5 life." });
const drillTooDeep = card("Drill Too Deep", "Instant", "{1}{R}", { cmc: 2, oracleText: "Choose one —\n• Put five charge counters on target Spacecraft or Planet you control.\n• Destroy target artifact." });
const avatarOfWill = card("Avatar of Will", "Creature — Avatar", "{6}{U}{U}", { cmc: 8, power: "5", toughness: "6", keywords: ["Flying"], oracleText: "If an opponent has no cards in hand, this spell costs {6} less to cast.\nFlying" });

describe("Mass pumps and shrinks, Plains, conditions against an opponent", () => {
  it("are fully supported", () => supported(flashfires, zealousPersecution, skulduggery, timelyReinforcements, feudkillersVerdict, glisteningDeluge, avatarOfWill));

  it("Flashfires destroys every Plains, not other lands", () => {
    let { s, ap, opp, ids } = setup([flashfires]);
    const theirs = putOnBattlefield(s, opp, plainsCard);
    const isl = putOnBattlefield(s, opp, island);
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(zone(s, theirs)).toBe("graveyard");
    expect(zone(s, isl)).toBe("battlefield");
    expect(s.battlefield.some((id) => s.cards[s.objects[id]!.cardId]!.name === "Plains")).toBe(false);
  });

  it("Zealous Persecution: yours get +1/+1 and the opponents' -1/-1 until end of turn", () => {
    let { s, ap, opp, ids } = setup([zealousPersecution]);
    const mine = putOnBattlefield(s, ap, greenBear());
    const bird = putOnBattlefield(s, opp, blueBird());
    const ogre = putOnBattlefield(s, opp, redOgre());
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(pt(s, mine)).toBe("3/3");
    expect(zone(s, bird)).toBe("graveyard");
    expect(pt(s, ogre)).toBe("2/2");
    s = passUntil(s, "upkeep", opp);
    expect(pt(s, mine)).toBe("2/2");
    expect(pt(s, ogre)).toBe("3/3");
  });

  it("Skulduggery: one target of yours gets +1/+1, one of an opponent's -1/-1", () => {
    let { s, ap, opp, ids } = setup([skulduggery]);
    const mine = putOnBattlefield(s, ap, greenBear());
    const bird = putOnBattlefield(s, opp, blueBird());
    expect(planCast(s, ap, ids[0]!, [tgt(bird), tgt(mine)])).toBeNull();
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(mine), tgt(bird)])));
    expect(pt(s, mine)).toBe("3/3");
    expect(zone(s, bird)).toBe("graveyard");
  });

  it("Timely Reinforcements: 6 life only with less life than an opponent, tokens only with fewer creatures", () => {
    let { s, ap, opp, ids } = setup([timelyReinforcements]);
    s.players[ap]!.life = 30;
    putOnBattlefield(s, opp, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(life(s, ap)).toBe(36);
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.objects[id]!.isToken).length).toBe(3);

    ({ s, ap, opp, ids } = setup([timelyReinforcements]));
    s.players[ap]!.life = 40;
    putOnBattlefield(s, ap, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(life(s, ap)).toBe(40);
    expect(s.battlefield.some((id) => s.objects[id]!.isToken)).toBe(false);
  });

  it("Feudkiller's Verdict: the Giant only if you then have more life than an opponent", () => {
    for (const theirs of [45, 55]) {
      let { s, ap, ids } = setup([feudkillersVerdict]);
      for (const p of s.turnOrder) if (p !== ap) s.players[p]!.life = theirs;
      s = settle(run(s, planCast(s, ap, ids[0]!, [])));
      expect(life(s, ap)).toBe(50);
      expect(s.battlefield.some((id) => s.objects[id]!.isToken)).toBe(theirs < 50);
    }
  });

  it("Glistening Deluge: -1/-1 for all, -3/-3 for green and white creatures", () => {
    let { s, ap, opp, ids } = setup([glisteningDeluge]);
    const bear = putOnBattlefield(s, opp, greenBear());
    const ogre = putOnBattlefield(s, opp, redOgre());
    const big = putOnBattlefield(s, opp, creature("White Giant", "Creature — Giant", "{3}{W}", 5, 5));
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(zone(s, bear)).toBe("graveyard");
    expect(pt(s, ogre)).toBe("2/2");
    expect(pt(s, big)).toBe("2/2");
  });

  it("Avatar of Will costs {6} less while an opponent has no cards in hand, not while only you have none", () => {
    let { s, ap, opp, ids } = setup([avatarOfWill]);
    // Fourteen lands: the full cost is castable, so compare what each plan taps.
    const taps = (st: GameState) => planCast(st, ap, ids[0]!, [])!.filter((a) => a.type === "activateMana").length;
    expect(taps(s)).toBe(8);
    for (const id of [...s.players[opp]!.hand]) {
      s.players[opp]!.hand.splice(s.players[opp]!.hand.indexOf(id), 1);
      s.players[opp]!.graveyard.push(id);
      s.objects[id]!.zone = "graveyard";
    }
    invalidateCharacteristics(s);
    expect(taps(s)).toBe(2);
  });
});

describe("Statics and triggers that read a state: damage this turn, empty hands, graveyards, spells cast, whose turn", () => {
  it("are fully supported", () => supported(wallOfResistance, guulDrazSpecter, aangALotToLearn, cosmicLarva, vileManifestation, deathsApproach, disturbingConversion, stoicSphinx, gruulSpellbreaker));

  it("Wall of Resistance gets a +0/+1 counter at an end step only if it was dealt damage that turn", () => {
    let { s, ap, opp, ids } = setup([testShock()]);
    const w = putOnBattlefield(s, opp, wallOfResistance);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(w)])));
    expect(s.objects[w]!.damage).toBe(2);
    s = settle(passUntil(s, "end", ap));
    expect(s.objects[w]!.counters["+0/+1"]).toBe(1);
    s = settle(passUntil(s, "end", opp));
    expect(s.objects[w]!.counters["+0/+1"]).toBe(1);
    expect(pt(s, w)).toBe("0/4");
  });

  it("Guul Draz Specter gets +3/+3 while an opponent has no cards in hand", () => {
    let { s, ap, opp } = setup([]);
    const g = putOnBattlefield(s, ap, guulDrazSpecter);
    const empty = (pid: PlayerId) => {
      for (const id of [...s.players[pid]!.hand]) {
        s.players[pid]!.hand.splice(s.players[pid]!.hand.indexOf(id), 1);
        s.players[pid]!.graveyard.push(id);
        s.objects[id]!.zone = "graveyard";
      }
      invalidateCharacteristics(s);
    };
    empty(ap);
    expect(pt(s, g)).toBe("2/2");
    empty(opp);
    expect(pt(s, g)).toBe("5/5");
  });

  it("Aang has vigilance while there's a Lesson card in your graveyard", () => {
    let { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, ap, aangALotToLearn);
    expect(has(s, a, "Vigilance")).toBe(false);
    into(s, opp, card("Test Lesson", "Sorcery — Lesson", "{U}", { oracleText: "Draw a card." }), "graveyard");
    expect(has(s, a, "Vigilance")).toBe(false);
    into(s, ap, card("Test Lesson", "Sorcery — Lesson", "{U}", { oracleText: "Draw a card." }), "graveyard");
    expect(has(s, a, "Vigilance")).toBe(true);
  });

  it("Cosmic Larva: sacrifice two lands to keep it, or it goes", () => {
    for (const keep of [true, false]) {
      let { s, ap } = setup([]);
      const c = putOnBattlefield(s, ap, cosmicLarva);
      const lands = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.typeLine.includes("Land")).length;
      s = toUpkeep(passUntil(s, "main1", next(s, ap)), ap, { yes: keep });
      expect(zone(s, c)).toBe(keep ? "battlefield" : "graveyard");
      expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.typeLine.includes("Land")).length).toBe(keep ? lands - 2 : lands);
    }
  });

  it("Vile Manifestation gets +1/+0 for each card with cycling in your graveyard", () => {
    let { s, ap, opp } = setup([]);
    const v = putOnBattlefield(s, ap, vileManifestation);
    into(s, ap, repopulate, "graveyard");
    into(s, ap, greenBear(), "graveyard");
    into(s, opp, repopulate, "graveyard");
    expect(pt(s, v)).toBe("1/4");
    into(s, ap, vileManifestation, "graveyard");
    expect(pt(s, v)).toBe("2/4");
  });

  it("Death's Approach counts the creature cards in the enchanted creature's controller's graveyard", () => {
    let { s, ap, opp, ids } = setup([deathsApproach]);
    const ogre = putOnBattlefield(s, opp, creature("Big Ogre", "Creature — Ogre", "{4}{R}", 5, 5));
    into(s, opp, greenBear(), "graveyard");
    into(s, opp, greenBear(), "graveyard");
    into(s, opp, forest, "graveyard");
    into(s, ap, greenBear(), "graveyard");
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(ogre)])));
    expect(pt(s, ogre)).toBe("3/3");
    into(s, opp, greenBear(), "graveyard");
    expect(pt(s, ogre)).toBe("2/2");
  });

  it("Disturbing Conversion: -X/-0 for every card in its controller's graveyard, after each player mills two", () => {
    let { s, ap, opp, ids } = setup([disturbingConversion]);
    const ogre = putOnBattlefield(s, opp, creature("Big Ogre", "Creature — Ogre", "{4}{R}", 5, 5));
    into(s, opp, greenBear(), "graveyard");
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(ogre)])));
    expect(s.players[opp]!.graveyard.length).toBe(3);
    expect(pt(s, ogre)).toBe("2/5");
  });

  it("Stoic Sphinx has hexproof until you cast a spell that turn", () => {
    let { s, ap, opp, ids } = setup([testShock()]);
    const sphinx = putOnBattlefield(s, ap, stoicSphinx);
    expect(has(s, sphinx, "Hexproof")).toBe(true);
    s = run(s, planCast(s, ap, ids[0]!, [player(opp)]));
    expect(has(s, sphinx, "Hexproof")).toBe(false);
    s = settle(s);
    s = passUntil(s, "upkeep", next(s, ap));
    expect(has(s, sphinx, "Hexproof")).toBe(true);
  });

  it("Gruul Spellbreaker: you and it have hexproof during your turn only", () => {
    let { s, ap, opp } = setup([]);
    const g = putOnBattlefield(s, ap, gruulSpellbreaker);
    expect(has(s, g, "Hexproof")).toBe(true);
    expect(playerProtection(s, ap)).toBe("hexproof");
    s = passUntil(s, "upkeep", opp);
    expect(has(s, g, "Hexproof")).toBe(false);
    expect(playerProtection(s, ap)).toBeUndefined();
  });
});

describe("Removal and tricks: attached Equipment, color riders, regeneration, counterspells", () => {
  it("are fully supported", () => supported(eatenBySpiders, burningHands, invasiveManeuvers, necrobite, butchersGlee, boonOfErebos, rakdosIckspitter, repopulate, doubleNegative, drillTooDeep));

  it("Eaten by Spiders destroys a creature with flying and the Equipment attached to it", () => {
    let { s, ap, opp, ids } = setup([eatenBySpiders]);
    const bird = putOnBattlefield(s, opp, blueBird());
    const bear = putOnBattlefield(s, opp, greenBear());
    const sword = attach(s, opp, card("Test Sword", "Artifact — Equipment", "{1}", { oracleText: "Equipped creature gets +1/+1.\nEquip {1}" }), bird);
    const other = putOnBattlefield(s, opp, card("Test Sword", "Artifact — Equipment", "{1}", { oracleText: "Equipped creature gets +1/+1.\nEquip {1}" }));
    expect(planCast(s, ap, ids[0]!, [tgt(bear)])).toBeNull();
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(bird)])));
    expect(zone(s, bird)).toBe("graveyard");
    expect(zone(s, sword)).toBe("graveyard");
    expect(zone(s, other)).toBe("battlefield");
  });

  it("Burning Hands deals 6 damage to a green permanent, 2 to another", () => {
    for (const green of [true, false]) {
      let { s, ap, opp, ids } = setup([burningHands]);
      const c = putOnBattlefield(s, opp, green ? creature("Green Wurm", "Creature — Wurm", "{4}{G}", 6, 7) : creature("Red Wurm", "Creature — Wurm", "{4}{R}", 6, 7));
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(c)])));
      expect(s.objects[c]!.damage).toBe(green ? 6 : 2);
    }
  });

  it("Invasive Maneuvers deals 5 damage instead while you control a Spacecraft", () => {
    for (const ship of [true, false]) {
      let { s, ap, opp, ids } = setup([invasiveManeuvers]);
      if (ship) putOnBattlefield(s, ap, card("Test Ship", "Artifact — Spacecraft", "{3}", { oracleText: "" }));
      const c = putOnBattlefield(s, opp, creature("Red Wurm", "Creature — Wurm", "{4}{R}", 6, 7));
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(c)])));
      expect(s.objects[c]!.damage).toBe(ship ? 5 : 3);
    }
  });

  it("Necrobite, Butcher's Glee and Boon of Erebos regenerate their target", () => {
    for (const def of [necrobite, butchersGlee, boonOfErebos]) {
      let { s, ap, ids } = setup([def]);
      const bear = putOnBattlefield(s, ap, greenBear());
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(bear)])));
      expect(s.objects[bear]!.regenShields, def.name).toBe(1);
      if (def === necrobite) expect(has(s, bear, "Deathtouch")).toBe(true);
      if (def === butchersGlee) expect([pt(s, bear), has(s, bear, "Lifelink")]).toEqual(["5/2", true]);
      if (def === boonOfErebos) expect([pt(s, bear), life(s, ap)]).toEqual(["4/2", 38]);
    }
  });

  it("Rakdos Ickspitter deals 1 damage to a creature and its controller loses 1 life", () => {
    let { s, ap, opp } = setup([]);
    const r = putOnBattlefield(s, ap, rakdosIckspitter);
    const bird = putOnBattlefield(s, opp, blueBird());
    s = settle(run(s, planActivate(s, ap, r, 0, [tgt(bird)])));
    expect(zone(s, bird)).toBe("graveyard");
    expect(life(s, opp)).toBe(39);
    expect(life(s, ap)).toBe(40);
  });

  it("Repopulate shuffles only the creature cards of the target player's graveyard into their library", () => {
    let { s, ap, opp, ids } = setup([repopulate]);
    const b = into(s, opp, greenBear(), "graveyard");
    const l = into(s, opp, forest, "graveyard");
    const mine = into(s, ap, greenBear(), "graveyard");
    const lib = s.players[opp]!.library.length;
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(zone(s, b)).toBe("library");
    expect(zone(s, l)).toBe("graveyard");
    expect(zone(s, mine)).toBe("graveyard");
    expect(s.players[opp]!.library.length).toBe(lib + 1);
  });

  it("Double Negative counters two different spells, or one", () => {
    let { s, ap, opp, ids } = setup([testShock(), testShock()]);
    const dn = into(s, opp, doubleNegative);
    for (const l of [island, island, mountain]) putOnBattlefield(s, opp, l);
    s = run(s, planCast(s, ap, ids[0]!, [player(opp)]));
    const first = topSpell(s);
    s = run(s, planCast(s, ap, ids[1]!, [player(opp)]));
    const second = topSpell(s);
    s = act(s, { type: "passPriority", player: ap });
    expect(planCast(s, opp, dn, [second, second])).toBeNull();
    s = settle(run(s, planCast(s, opp, dn, [second, first])));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(zone(s, ids[1]!)).toBe("graveyard");
    expect(life(s, opp)).toBe(40);
  });

  it("Drill Too Deep puts five charge counters on a Spacecraft you control", () => {
    let { s, ap, ids } = setup([drillTooDeep]);
    const ship = putOnBattlefield(s, ap, card("Test Ship", "Artifact — Spacecraft", "{3}", { oracleText: "" }));
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(ship)], [0])));
    expect(s.objects[ship]!.counters.charge).toBe(5);
  });
});

describe("Cast triggers (kicked spells, three kinds, two colors), kicked permanents, sacrifice-or-else upkeeps", () => {
  it("are fully supported", () => supported(umaraMystic, mindsparker, lullmagesFamiliar, skizzik, sphinxOfLostTruths, lightningReaver, woebringerDemon, cruelReality, lordOfTresserhorn, dinrovaHorror, holdForQuestioning));

  it("Umara Mystic gets +2/+0 for an instant or a Wizard spell, not another creature spell", () => {
    const wizard = creature("Test Wizard", "Creature — Human Wizard", "{U}", 1, 1);
    let { s, ap, opp, ids } = setup([testShock(), wizard, greenBear()]);
    const u = putOnBattlefield(s, ap, umaraMystic);
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    expect(pt(s, u)).toBe("3/3");
    s = settle(run(s, planCast(s, ap, ids[1]!, [])));
    expect(pt(s, u)).toBe("5/3");
    s = settle(run(s, planCast(s, ap, ids[2]!, [])));
    expect(pt(s, u)).toBe("5/3");
  });

  it("Mindsparker deals 2 damage to an opponent who casts a white or blue instant or sorcery", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, mindsparker);
    const white = into(s, opp, card("Test Prayer", "Instant", "{W}", { cmc: 1, oracleText: "You gain 1 life." }));
    const red = into(s, opp, testShock());
    const wbear = into(s, opp, creature("White Bear", "Creature — Bear", "{W}", 2, 2));
    for (const l of [plainsCard, mountain, plainsCard]) putOnBattlefield(s, opp, l);
    s = passUntil(s, "main1", opp);
    s = settle(run(s, planCast(s, opp, red, [player(ap)])));
    expect(life(s, opp)).toBe(40);
    s = settle(run(s, planCast(s, opp, wbear, [])));
    expect(life(s, opp)).toBe(40);
    s = settle(run(s, planCast(s, opp, white, [])));
    expect(life(s, opp)).toBe(39);
  });

  it("Lullmage's Familiar: 2 life for each kicked spell you cast", () => {
    const kicky = card("Test Kicker", "Sorcery", "{R}", { cmc: 1, oracleText: "Kicker {1}\nYou gain 1 life." });
    for (const kick of [true, false]) {
      let { s, ap, ids } = setup([kicky]);
      putOnBattlefield(s, ap, lullmagesFamiliar);
      s = settle(run(s, planCast(s, ap, ids[0]!, [], undefined, "auto", undefined, { kicks: kick ? [0] : [] })));
      expect(life(s, ap)).toBe(kick ? 43 : 41);
    }
  });

  it("Skizzik is sacrificed at the next end step unless it was kicked", () => {
    for (const kick of [true, false]) {
      let { s, ap, ids } = setup([skizzik]);
      s = settle(run(s, planCast(s, ap, ids[0]!, [], undefined, "auto", undefined, { kicks: kick ? [0] : [] })));
      const sk = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Skizzik")!;
      s = settle(passUntil(s, "end", ap));
      expect(zone(s, sk) === "battlefield", `kicked ${kick}`).toBe(kick);
    }
  });

  it("Sphinx of Lost Truths draws three, then discards three only if it wasn't kicked", () => {
    for (const kick of [true, false]) {
      let { s, ap, ids } = setup([sphinxOfLostTruths]);
      const hand = s.players[ap]!.hand.length - 1;
      s = settle(run(s, planCast(s, ap, ids[0]!, [], undefined, "auto", undefined, { kicks: kick ? [0] : [] })));
      expect(s.players[ap]!.hand.length, `kicked ${kick}`).toBe(hand + (kick ? 3 : 0));
    }
  });

  it("Lightning Reaver deals damage equal to its charge counters to each opponent at your end step", () => {
    let { s, ap } = setup([]);
    const r = putOnBattlefield(s, ap, lightningReaver);
    s.objects[r]!.counters.charge = 3;
    s = settle(passUntil(s, "end", ap));
    for (const p of s.turnOrder) expect(life(s, p)).toBe(p === ap ? 40 : 37);
  });

  it("Woebringer Demon: each upkeep's player sacrifices a creature, and if they can't, the Demon goes", () => {
    let { s, ap, opp } = setup([]);
    const d = putOnBattlefield(s, ap, woebringerDemon);
    const bear = putOnBattlefield(s, opp, greenBear());
    for (const p of s.turnOrder) if (p !== ap && p !== opp) for (const id of s.battlefield.filter((x) => s.objects[x]!.controller === p)) s.objects[id]!.zone = "exile";
    s.battlefield = s.battlefield.filter((id) => s.objects[id]!.zone === "battlefield");
    invalidateCharacteristics(s);
    s = toUpkeep(s, opp);
    expect(zone(s, bear)).toBe("graveyard");
    expect(zone(s, d)).toBe("battlefield");
    s = toUpkeep(s, next(s, opp));
    expect(zone(s, d)).toBe("graveyard");
  });

  it("Cruel Reality: the enchanted player sacrifices a creature or planeswalker, or loses 5 life", () => {
    let { s, ap, opp, ids } = setup([cruelReality]);
    const bear = putOnBattlefield(s, opp, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    s = toUpkeep(s, opp);
    expect(zone(s, bear)).toBe("graveyard");
    expect(life(s, opp)).toBe(40);
    s = toUpkeep(passUntil(s, "main1", next(s, opp)), opp);
    expect(life(s, opp)).toBe(35);
  });

  it("Lord of Tresserhorn: you lose 2 life, sacrifice two creatures (it may be one), and an opponent draws two", () => {
    let { s, ap, opp, ids } = setup([lordOfTresserhorn]);
    const bear = putOnBattlefield(s, ap, greenBear());
    const hand = s.players[opp]!.hand.length;
    s = run(s, planCast(s, ap, ids[0]!, []));
    s = settle(s, { targets: [player(opp)] });
    expect(life(s, ap)).toBe(38);
    expect(s.players[opp]!.hand.length).toBe(hand + 2);
    expect(zone(s, bear)).toBe("graveyard");
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });

  it("Dinrova Horror returns a permanent to its owner's hand, and that player discards a card", () => {
    let { s, ap, opp, ids } = setup([dinrovaHorror]);
    const bear = putOnBattlefield(s, opp, greenBear());
    for (const id of [...s.players[opp]!.hand]) {
      s.players[opp]!.hand.splice(s.players[opp]!.hand.indexOf(id), 1);
      s.players[opp]!.library.push(id);
      s.objects[id]!.zone = "library";
    }
    s = run(s, planCast(s, ap, ids[0]!, []));
    s = settle(s, { targets: [tgt(bear)] });
    expect(s.players[opp]!.hand.length).toBe(0);
    expect(s.players[opp]!.graveyard.some((id) => s.cards[s.objects[id]!.cardId]!.name === "Green Bear")).toBe(true);
  });

  it("Hold for Questioning taps the enchanted creature and investigates", () => {
    let { s, ap, opp, ids } = setup([holdForQuestioning]);
    const bear = putOnBattlefield(s, opp, greenBear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(bear)])));
    expect(s.objects[bear]!.tapped).toBe(true);
    expect(s.battlefield.some((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).subtypes.includes("Clue"))).toBe(true);
  });
});
