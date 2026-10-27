// Lane B, round 18: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, abilityProblem, blockProblem, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, manaAbilityProblem, objHasKeyword, parseManaCost, planActivate, planCast, planMana, planTurnFaceUp, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/**
 * Everyone passes until the stack is empty. "You may" questions get `yes`; a pick gets `pick` (or the first ones
 * offered); a graveyard choice gets the first card offered. Stops at any other question.
 */
const settle = (s: GameState, opts: { yes?: boolean; pick?: string[] } = {}) => {
  for (let i = 0; i < 200 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = run(s, [...((opts.yes ?? true) && p.pay?.mana ? planMana(s, p.player, parseManaCost(p.pay.mana))! : []), { type: "chooseMay", player: p.player, yes: opts.yes ?? true }]);
    else if (p?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: p.player, ids: opts.pick ?? p.options.slice(0, p.count) });
    else if (p?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: p.player, found: p.cards.slice(0, p.min || 1) });
    else if (p?.kind === "discard") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) } as Action);
    else if (p) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const creature = (name: string, typeLine: string, manaCost: string, p: number, t: number, extra: Partial<CardDef> = {}) =>
  card(name, typeLine, manaCost, { power: String(p), toughness: String(t), ...extra });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2, { cmc: 2 });
const into = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" | "library" = "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Empties a player's hand into their library, then gives them these cards. */
const handOf = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  const p = s.players[pid]!;
  for (const id of p.hand) s.objects[id]!.zone = "library";
  p.library.push(...p.hand);
  p.hand = [];
  return defs.map((d) => into(s, pid, d));
};
/** An Aura on the battlefield, attached to `to`. */
const attach = (s: GameState, pid: PlayerId, def: CardDef, to: string) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = to;
  invalidateCharacteristics(s);
  return id;
};
const landsOf = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land"));
/** The next upkeep of `pid` (not the one it's in now), before its triggers resolve. */
const nextUpkeep = (s: GameState, pid: PlayerId) => passUntil(s.step === "upkeep" && s.activePlayer === pid ? passUntil(s, "draw", pid) : s, "upkeep", pid);
/** The next upkeep of `pid`, with its triggers resolved. */
const toUpkeep = (s: GameState, pid: PlayerId, opts: Parameters<typeof settle>[1] = {}) => settle(nextUpkeep(s, pid), opts);

// Real oracle text (Scryfall).
const rottingGiant = card("Rotting Giant", "Creature — Zombie Giant", "{1}{B}", {cmc: 2,power: "3",toughness: "3",oracleText: "Whenever this creature attacks or blocks, sacrifice it unless you exile a card from your graveyard."});
const treacherousVampire = card("Treacherous Vampire", "Creature — Vampire", "{4}{B}", {cmc: 5,power: "4",toughness: "4",keywords: ["Flying","Threshold"],oracleText: "Flying\nWhenever this creature attacks or blocks, sacrifice it unless you exile a card from your graveyard.\nThreshold — As long as there are seven or more cards in your graveyard, this creature gets +2/+2 and has \"When this creature dies, you lose 6 life.\""});
const pendrellFlux = card("Pendrell Flux", "Enchantment — Aura", "{1}{U}", {cmc: 2,keywords: ["Enchant"],oracleText: "Enchant creature\nEnchanted creature has \"At the beginning of your upkeep, sacrifice this creature unless you pay its mana cost.\""});
const disruptionAura = card("Disruption Aura", "Enchantment — Aura", "{2}{U}", {cmc: 3,keywords: ["Enchant"],oracleText: "Enchant artifact\nEnchanted artifact has \"At the beginning of your upkeep, sacrifice this artifact unless you pay its mana cost.\""});
const essenceLeak = card("Essence Leak", "Enchantment — Aura", "{U}", {cmc: 1,keywords: ["Enchant"],oracleText: "Enchant permanent\nAs long as enchanted permanent is red or green, it has \"At the beginning of your upkeep, sacrifice this permanent unless you pay its mana cost.\""});
const morgulKnifeWound = card("Morgul-Knife Wound", "Enchantment — Aura", "{1}{B}", {cmc: 2,keywords: ["Enchant"],oracleText: "Enchant creature\nEnchanted creature gets -3/-0 and has \"At the beginning of your upkeep, exile this creature unless you pay 2 life.\""});
const withercrown = card("Withercrown", "Enchantment — Aura", "{1}{B}", {cmc: 2,keywords: ["Enchant"],oracleText: "Enchant creature\nEnchanted creature has base power 0 and has \"At the beginning of your upkeep, you lose 1 life unless you sacrifice this creature.\""});
const minionOfLeshrac = card("Minion of Leshrac", "Creature — Demon Minion", "{4}{B}{B}{B}", {cmc: 7,power: "5",toughness: "5",keywords: ["Protection"],oracleText: "Protection from black\nAt the beginning of your upkeep, this creature deals 5 damage to you unless you sacrifice a creature other than this creature. If this creature deals damage to you this way, tap it.\n{T}: Destroy target creature or land."});
const mishrasWarMachine = card("Mishra's War Machine", "Artifact Creature — Juggernaut", "{7}", {cmc: 7,power: "5",toughness: "5",keywords: ["Banding"],oracleText: "Banding (Any creatures with banding, and up to one without, can attack in a band. Bands are blocked as a group. If any creatures with banding you control are blocking or being blocked by a creature, you divide that creature's combat damage, not its controller, among any of the creatures it's being blocked by or is blocking.)\nAt the beginning of your upkeep, this creature deals 3 damage to you unless you discard a card. If it deals damage to you this way, tap it."});
const elderSpawn = card("Elder Spawn", "Creature — Spawn", "{4}{U}{U}{U}", {cmc: 7,power: "6",toughness: "6",oracleText: "At the beginning of your upkeep, unless you sacrifice an Island, sacrifice this creature and it deals 6 damage to you.\nThis creature can't be blocked by red creatures."});
const tragicLesson = card("Tragic Lesson", "Instant", "{2}{U}", {cmc: 3,oracleText: "Draw two cards. Then discard a card unless you return a land you control to its owner's hand."});
const urzasTome = card("Urza's Tome", "Artifact — Book", "{2}", {cmc: 2,oracleText: "{3}, {T}: Draw a card. Then discard a card unless you exile a historic card from your graveyard. (Artifacts, legendaries, and Sagas are historic.)"});
const custodyBattle = card("Custody Battle", "Enchantment — Aura", "{1}{R}", {cmc: 2,keywords: ["Enchant"],oracleText: "Enchant creature\nEnchanted creature has \"At the beginning of your upkeep, target opponent gains control of this creature unless you sacrifice a land.\""});

describe("\"sacrifice it unless you ...\" and other upkeep costs", () => {
  it("compiles them", () => supported(rottingGiant, treacherousVampire, pendrellFlux, disruptionAura, essenceLeak, morgulKnifeWound, withercrown, minionOfLeshrac, mishrasWarMachine, elderSpawn, tragicLesson, urzasTome, custodyBattle));

  it("Rotting Giant: exiling a card from your graveyard keeps it; with none there, it's sacrificed", () => {
    const { s: s0, ap, opp } = setup([]);
    const giant = putOnBattlefield(s0, ap, rottingGiant);
    const dead = into(s0, ap, greenBear(), "graveyard");
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: giant, defender: opp }] });
    s = settle(s);
    expect([zone(s, giant), zone(s, dead)]).toEqual(["battlefield", "exile"]);

    const { s: t0, ap: bp, opp: bopp } = setup([]);
    const g2 = putOnBattlefield(t0, bp, rottingGiant);
    let t = passUntil(t0, "declareAttackers", bp);
    t = act(t, { type: "declareAttackers", player: bp, attacks: [{ attacker: g2, defender: bopp }] });
    t = settle(t);
    expect(zone(t, g2)).toBe("graveyard");
  });

  it("Treacherous Vampire: declining sacrifices it", () => {
    const { s: s0, ap, opp } = setup([]);
    const vamp = putOnBattlefield(s0, ap, treacherousVampire);
    into(s0, ap, greenBear(), "graveyard");
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: vamp, defender: opp }] });
    s = settle(s, { yes: false });
    expect(zone(s, vamp)).toBe("graveyard");
  });

  it("Pendrell Flux: pay the creature's mana cost, colors and all, or sacrifice it", () => {
    const { s: s0, ap, opp } = setup([]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    attach(s0, opp, pendrellFlux, bear);
    let s = passUntil(s0, "upkeep", ap);
    s = settle(s, { yes: true });
    expect(zone(s, bear)).toBe("battlefield");
    expect(s.log.some((l) => /\{1\}\{G\}/.test(l.text)) || landsOf(s, ap).some((id) => s.objects[id]!.tapped)).toBe(true);
    s = toUpkeep(s, ap, { yes: false });
    expect(zone(s, bear)).toBe("graveyard");
  });

  it("Pendrell Flux: X is 0, and a creature with no mana cost can't be kept (CR 118.6)", () => {
    const { s: s0, ap, opp } = setup([]);
    const xBeast = putOnBattlefield(s0, ap, creature("X Beast", "Creature — Beast", "{X}{G}", 3, 3));
    const noCost = putOnBattlefield(s0, ap, creature("Costless", "Creature — Golem", "", 3, 3));
    attach(s0, opp, pendrellFlux, xBeast);
    attach(s0, opp, pendrellFlux, noCost);
    let s = passUntil(s0, "upkeep", ap);
    const asked: string[] = [];
    for (let i = 0; i < 100 && (s.stack.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "chooseMay") {
        asked.push(p.pay?.mana ?? "");
        s = run(s, [...planMana(s, p.player, parseManaCost(p.pay!.mana!))!, { type: "chooseMay", player: p.player, yes: true }]);
      } else if (p) throw new Error(p.kind);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(asked).toEqual(["{G}"]);
    expect([zone(s, xBeast), zone(s, noCost)]).toEqual(["battlefield", "graveyard"]);
  });

  it("Disruption Aura: the enchanted artifact's own cost", () => {
    const { s: s0, ap, opp } = setup([]);
    const rock = putOnBattlefield(s0, ap, card("Mind Stone", "Artifact", "{2}", { cmc: 2 }));
    attach(s0, opp, disruptionAura, rock);
    const s = toUpkeep(s0, ap, { yes: false });
    expect(zone(s, rock)).toBe("graveyard");
  });

  it("Essence Leak: only while the permanent is red or green", () => {
    const { s: s0, ap, opp } = setup([]);
    const red = putOnBattlefield(s0, ap, creature("Red Ogre", "Creature — Ogre", "{2}{R}", 3, 3));
    const blue = putOnBattlefield(s0, ap, creature("Blue Drake", "Creature — Drake", "{2}{U}", 2, 2));
    attach(s0, opp, essenceLeak, red);
    attach(s0, opp, essenceLeak, blue);
    const s = toUpkeep(s0, ap, { yes: false });
    expect([zone(s, red), zone(s, blue)]).toEqual(["graveyard", "battlefield"]);
  });

  it("Morgul-Knife Wound: -3/-0, and pay 2 life or the creature is exiled", () => {
    const { s: s0, ap, opp } = setup([]);
    const ogre = putOnBattlefield(s0, ap, creature("Big Ogre", "Creature — Ogre", "{3}{R}", 4, 4));
    attach(s0, opp, morgulKnifeWound, ogre);
    expect(pt(s0, ogre)).toBe("1/4");
    let s = passUntil(s0, "upkeep", ap);
    const before = life(s, ap);
    s = settle(s, { yes: true });
    expect([zone(s, ogre), life(s, ap)]).toEqual(["battlefield", before - 2]);
    s = toUpkeep(s, ap, { yes: false });
    expect(zone(s, ogre)).toBe("exile");
  });

  it("Withercrown: base power 0; sacrifice the creature or lose 1 life", () => {
    const { s: s0, ap, opp } = setup([]);
    const ogre = putOnBattlefield(s0, ap, creature("Big Ogre", "Creature — Ogre", "{3}{R}", 4, 4));
    attach(s0, opp, withercrown, ogre);
    expect(pt(s0, ogre)).toBe("0/4");
    let s = passUntil(s0, "upkeep", ap);
    const before = life(s, ap);
    s = settle(s, { yes: false });
    expect([zone(s, ogre), life(s, ap)]).toEqual(["battlefield", before - 1]);
    s = toUpkeep(s, ap, { yes: true });
    expect(zone(s, ogre)).toBe("graveyard");
  });

  it("Minion of Leshrac: sacrifice another creature, or take 5 and it taps", () => {
    const { s: s0, ap } = setup([]);
    const minion = putOnBattlefield(s0, ap, minionOfLeshrac);
    const bear = putOnBattlefield(s0, ap, greenBear());
    let s = passUntil(s0, "upkeep", ap);
    const before = life(s, ap);
    s = settle(s, { yes: true });
    expect([zone(s, bear), zone(s, minion), s.objects[minion]!.tapped, life(s, ap)]).toEqual(["graveyard", "battlefield", false, before]);
    // No other creature: the damage, and it taps.
    s = nextUpkeep(s, ap);
    const now = life(s, ap);
    s = settle(s, { yes: true });
    expect([life(s, ap), s.objects[minion]!.tapped]).toEqual([now - 5, true]);
  });

  it("Mishra's War Machine: discard a card, or take 3 and it taps", () => {
    const { s: s0, ap } = setup([]);
    const machine = putOnBattlefield(s0, ap, mishrasWarMachine);
    let s = passUntil(s0, "upkeep", ap);
    const before = life(s, ap);
    s = settle(s, { yes: false });
    expect([life(s, ap), s.objects[machine]!.tapped]).toEqual([before - 3, true]);
    s = nextUpkeep(s, ap);
    const hand = s.players[ap]!.hand.length;
    const now = life(s, ap);
    s = settle(s, { yes: true });
    expect([life(s, ap), s.players[ap]!.hand.length]).toEqual([now, hand - 1]);
  });

  it("Elder Spawn: sacrifice an Island, or it's sacrificed and deals 6 damage to you", () => {
    const { s: s0, ap } = setup([]);
    const spawn = putOnBattlefield(s0, ap, elderSpawn);
    const islands = (s: GameState) => landsOf(s, ap).filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Island").length;
    let s = passUntil(s0, "upkeep", ap);
    const n = islands(s);
    s = settle(s, { yes: true });
    expect([zone(s, spawn), islands(s)]).toEqual(["battlefield", n - 1]);
    s = nextUpkeep(s, ap);
    const before = life(s, ap);
    s = settle(s, { yes: false });
    expect([zone(s, spawn), life(s, ap)]).toEqual(["graveyard", before - 6]);
  });

  it("Tragic Lesson: return a land rather than discard, after the draw (rulings)", () => {
    const { s: s0, ap, ids } = setup([tragicLesson]);
    handOf(s0, ap, []);
    s0.players[ap]!.hand.push(ids[0]!);
    s0.objects[ids[0]!]!.zone = "hand";
    const lands = landsOf(s0, ap).length;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, { yes: true });
    expect([landsOf(s, ap).length, s.players[ap]!.hand.length]).toEqual([lands - 1, 3]);
  });

  it("Tragic Lesson: or discard a card", () => {
    const { s: s0, ap, ids } = setup([tragicLesson]);
    handOf(s0, ap, []);
    s0.players[ap]!.hand.push(ids[0]!);
    s0.objects[ids[0]!]!.zone = "hand";
    const lands = landsOf(s0, ap).length;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, { yes: false });
    expect([landsOf(s, ap).length, s.players[ap]!.hand.length]).toEqual([lands, 1]);
  });

  it("Urza's Tome: exile a historic card from your graveyard rather than discard", () => {
    const { s: s0, ap } = setup([]);
    const tome = putOnBattlefield(s0, ap, urzasTome);
    const relic = into(s0, ap, card("Old Relic", "Artifact", "{1}", { cmc: 1 }), "graveyard");
    const plain = into(s0, ap, greenBear(), "graveyard");
    const hand = s0.players[ap]!.hand.length;
    let s = run(s0, planActivate(s0, ap, tome, 0));
    s = settle(s, { yes: true });
    expect([zone(s, relic), zone(s, plain), s.players[ap]!.hand.length]).toEqual(["exile", "graveyard", hand + 1]);
  });

  it("Urza's Tome: with no historic card there, the card is discarded", () => {
    const { s: s0, ap } = setup([]);
    const tome = putOnBattlefield(s0, ap, urzasTome);
    into(s0, ap, greenBear(), "graveyard");
    const hand = s0.players[ap]!.hand.length;
    let s = run(s0, planActivate(s0, ap, tome, 0));
    s = settle(s, { yes: true });
    expect(s.players[ap]!.hand.length).toBe(hand);
  });

  it("Custody Battle: sacrifice a land, or the target opponent gains control of the creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    attach(s0, opp, custodyBattle, bear);
    let s = passUntil(s0, "upkeep", ap);
    const lands = landsOf(s, ap).length;
    s = act(s, { type: "chooseTargets", player: ap, targets: [player(opp)] });
    s = settle(s, { yes: true });
    expect([controllerOf(s, s.objects[bear]!), landsOf(s, ap).length]).toEqual([ap, lands - 1]);
    s = nextUpkeep(s, ap);
    s = act(s, { type: "chooseTargets", player: ap, targets: [player(opp)] });
    s = settle(s, { yes: false });
    expect(controllerOf(s, s.objects[bear]!)).toBe(opp);
  });
});

// Round B18, second part.
const hotheadedGiant = card("Hotheaded Giant", "Creature — Giant Warrior", "{3}{R}", {cmc: 4,power: "4",toughness: "4",keywords: ["Haste"],oracleText: "Haste\nThis creature enters with two -1/-1 counters on it unless you've cast another red spell this turn."});
const fatalMutation = card("Fatal Mutation", "Enchantment — Aura", "{B}", {cmc: 1,keywords: ["Enchant"],oracleText: "Enchant creature\nWhen enchanted creature is turned face up, destroy it. It can't be regenerated."});
const discordantSpirit = card("Discordant Spirit", "Creature — Spirit", "{2}{B}{R}", {cmc: 4,power: "2",toughness: "2",oracleText: "At the beginning of each end step, if it's an opponent's turn, put a +1/+1 counter on this creature for each 1 damage dealt to you this turn.\nAt the beginning of your end step, remove all +1/+1 counters from this creature."});
const fyndhornDruid = card("Fyndhorn Druid", "Creature — Elf Druid", "{2}{G}", {cmc: 3,power: "2",toughness: "2",oracleText: "When this creature dies, if it was blocked this turn, you gain 4 life."});
const flummoxedCyclops = card("Flummoxed Cyclops", "Creature — Cyclops", "{3}{R}", {cmc: 4,power: "4",toughness: "4",keywords: ["Reach"],oracleText: "Reach\nWhenever two or more creatures your opponents control attack, this creature can't block this combat."});
const stabilizer = card("Stabilizer", "Artifact", "{2}", {cmc: 2,oracleText: "Players can't cycle cards."});
const serraBestiary = card("Serra Bestiary", "Enchantment — Aura", "{W}{W}", {cmc: 2,keywords: ["Enchant"],oracleText: "Enchant creature\nAt the beginning of your upkeep, sacrifice this Aura unless you pay {W}{W}.\nEnchanted creature can't attack or block, and its activated abilities with {T} in their costs can't be activated."});
const katabaticWinds = card("Katabatic Winds", "Enchantment", "{2}{G}", {cmc: 3,keywords: ["Phasing"],oracleText: "Phasing (This phases in or out before you untap during each of your untap steps. While it's phased out, it's treated as though it doesn't exist.)\nCreatures with flying can't attack or block, and their activated abilities with {T} in their costs can't be activated."});
const ironclawCurse = card("Ironclaw Curse", "Enchantment — Aura", "{R}", {cmc: 1,keywords: ["Enchant"],oracleText: "Enchant creature\nEnchanted creature gets -0/-1.\nEnchanted creature can't block creatures with power equal to or greater than the enchanted creature's toughness."});
const flaringFlameKin = card("Flaring Flame-Kin", "Creature — Elemental Warrior", "{2}{R}", {cmc: 3,power: "2",toughness: "2",oracleText: "As long as this creature is enchanted, it gets +2/+2, has trample, and has \"{R}: This creature gets +1/+0 until end of turn.\""});
const hintOfInsanity = card("Hint of Insanity", "Sorcery", "{2}{B}", {cmc: 3,oracleText: "Target player reveals their hand. That player discards all nonland cards with the same name as another card in their hand."});
const stonewiseFortifier = card("Stonewise Fortifier", "Creature — Human Wizard", "{1}{W}", {cmc: 2,power: "2",toughness: "2",oracleText: "{4}{W}: Prevent all damage that would be dealt to this creature by target creature this turn."});
const kryShield = card("Kry Shield", "Artifact", "{2}", {cmc: 2,oracleText: "{2}, {T}: Prevent all damage that would be dealt this turn by target creature you control. That creature gets +0/+X until end of turn, where X is its mana value."});
const anaBattlemage = card("Ana Battlemage", "Creature — Human Wizard", "{2}{G}", {cmc: 3,power: "2",toughness: "2",keywords: ["Kicker"],oracleText: "Kicker {2}{U} and/or {1}{B} (You may pay an additional {2}{U} and/or {1}{B} as you cast this spell.)\nWhen this creature enters, if it was kicked with its {2}{U} kicker, target player discards three cards.\nWhen this creature enters, if it was kicked with its {1}{B} kicker, tap target untapped creature and that creature deals damage equal to its power to its controller."});
const preyUpon = card("Prey Upon", "Sorcery", "{G}", { cmc: 1, oracleText: "Target creature you control fights target creature you don't control." });
const murder = card("Murder", "Instant", "{1}{B}{B}", { cmc: 3, oracleText: "Destroy target creature." });
const plainAura = card("Plain Aura", "Enchantment — Aura", "{W}", { cmc: 1, keywords: ["Enchant"], oracleText: "Enchant creature" });
const healer = creature("Healer", "Creature — Human Cleric", "{1}{W}", 1, 1, { cmc: 2, oracleText: "{T}: You gain 1 life.\n{1}: This creature gets +1/+0 until end of turn." });
const birdHealer = creature("Bird Healer", "Creature — Bird Cleric", "{1}{W}", 1, 1, { cmc: 2, keywords: ["Flying"], oracleText: "Flying\n{T}: You gain 1 life." });
const manaElf = creature("Mana Elf", "Creature — Elf Druid", "{G}", 1, 1, { cmc: 1, oracleText: "{T}: Add {G}." });
const tapAbility = (s: GameState, id: string) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => a.tap);
const plain = (s: GameState, id: string) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => !a.tap && !a.cycling);
const toTargets = (s: GameState) => {
  for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("cast another red spell, turned face up, blocked this turn and other second-pass cards", () => {
  it("compiles them", () => supported(hotheadedGiant, fatalMutation, discordantSpirit, fyndhornDruid, flummoxedCyclops, stabilizer, serraBestiary, katabaticWinds, ironclawCurse, flaringFlameKin, hintOfInsanity, stonewiseFortifier, kryShield, anaBattlemage));

  it("Hotheaded Giant: two -1/-1 counters unless you've cast another red spell this turn", () => {
    const { s: s0, ap, ids } = setup([hotheadedGiant]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect([s.objects[ids[0]!]!.counters["-1/-1"] ?? 0, pt(s, ids[0]!)]).toEqual([2, "2/2"]);

    const { s: t0, ap: bp, ids: tids } = setup([creature("Red Cub", "Creature — Dog", "{R}", 1, 1, { cmc: 1 }), hotheadedGiant]);
    let t = settle(run(t0, planCast(t0, bp, tids[0]!)));
    t = settle(run(t, planCast(t, bp, tids[1]!)));
    expect([t.objects[tids[1]!]!.counters["-1/-1"] ?? 0, pt(t, tids[1]!)]).toEqual([0, "4/4"]);
  });

  it("Fatal Mutation: the creature is destroyed when it's turned face up", () => {
    const morph = card("Morph Test", "Creature — Beast", "{2}{G}", { cmc: 3, power: "3", toughness: "3", keywords: ["Morph"], oracleText: "Morph {1}{G}" });
    const { s: s0, ap, opp, ids } = setup([morph]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { faceDown: true })));
    attach(s, opp, fatalMutation, ids[0]!);
    s = settle(run(s, planTurnFaceUp(s, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });

  it("Discordant Spirit: a counter for each damage dealt to you on an opponent's turn, all removed at your end step", () => {
    const { s: s0, ap, opp } = setup([]);
    const spirit = putOnBattlefield(s0, ap, discordantSpirit);
    let s = passUntil(s0, "main1", opp);
    s.damageThisTurn = { [ap]: 3 };
    s = settle(passUntil(s, "end", opp));
    expect(s.objects[spirit]!.counters["+1/+1"]).toBe(3);
    s = settle(passUntil(s, "end", ap));
    expect(s.objects[spirit]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Discordant Spirit: nothing on your own turn", () => {
    const { s: s0, ap } = setup([]);
    const spirit = putOnBattlefield(s0, ap, discordantSpirit);
    s0.damageThisTurn = { [ap]: 3 };
    const s = settle(passUntil(s0, "end", ap));
    expect(s.objects[spirit]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Fyndhorn Druid: you gain 4 life when it dies after being blocked, not otherwise", () => {
    const { s: s0, ap, opp } = setup([]);
    const druid = putOnBattlefield(s0, ap, fyndhornDruid);
    const wall = putOnBattlefield(s0, opp, creature("Big Wall", "Creature — Wall", "{3}", 0, 5, { cmc: 3 }));
    const ogre = putOnBattlefield(s0, opp, creature("Big Ogre", "Creature — Ogre", "{3}", 3, 3, { cmc: 3 }));
    void wall;
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: druid, defender: opp }] });
    s = passUntil(s, "declareBlockers", ap);
    while (s.pending?.kind !== "declareBlockers") s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const before = life(s, ap);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: ogre, attacker: druid }] });
    s = settle(passUntil(s, "main2", ap));
    expect([zone(s, druid), life(s, ap) - before]).toEqual(["graveyard", 4]);

    const { s: t0, ap: bp, ids } = setup([murder]);
    const d2 = putOnBattlefield(t0, bp, fyndhornDruid);
    const lifeB = life(t0, bp);
    const t = settle(run(t0, planCast(t0, bp, ids[0]!, [tgt(d2)])));
    expect([zone(t, d2), life(t, bp)]).toEqual(["graveyard", lifeB]);
  });

  it("Flummoxed Cyclops: can't block once two or more of your opponents' creatures attack", () => {
    const { s: s0, ap, opp } = setup([]);
    const cyclops = putOnBattlefield(s0, ap, flummoxedCyclops);
    const a1 = putOnBattlefield(s0, opp, greenBear());
    const a2 = putOnBattlefield(s0, opp, greenBear());
    let s = passUntil(s0, "declareAttackers", opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: a1, defender: ap }, { attacker: a2, defender: ap }] });
    s = settle(s);
    expect(blockProblem(s, s.objects[cyclops]!, s.objects[a1]!)).toMatch(/can't block/);

    const { s: t0, ap: bp, opp: bopp } = setup([]);
    const c2 = putOnBattlefield(t0, bp, flummoxedCyclops);
    const b1 = putOnBattlefield(t0, bopp, greenBear());
    putOnBattlefield(t0, bopp, greenBear());
    let t = passUntil(t0, "declareAttackers", bopp);
    t = act(t, { type: "declareAttackers", player: bopp, attacks: [{ attacker: b1, defender: bp }] });
    t = settle(t);
    expect(blockProblem(t, t.objects[c2]!, t.objects[b1]!)).toBeNull();
  });

  it("Stabilizer: no player can cycle (CR 702.29f covers typecycling too)", () => {
    const cycler = card("Cycler", "Creature — Beast", "{3}{G}", { cmc: 4, power: "3", toughness: "3", keywords: ["Cycling"], oracleText: "Cycling {2}" });
    const { s, ap, opp, ids } = setup([cycler]);
    const cyc = abilitiesOf(s, s.objects[ids[0]!]!).activated.findIndex((a) => a.cycling);
    expect(planActivate(s, ap, ids[0]!, cyc)).not.toBeNull();
    putOnBattlefield(s, opp, stabilizer);
    invalidateCharacteristics(s);
    expect(abilityProblem(s, ap, ids[0]!, cyc)).toMatch(/can't cycle/);
  });

  it("Serra Bestiary: the creature's {T} abilities, mana abilities included, can't be activated; others can", () => {
    const { s, ap, opp } = setup([]);
    const h = putOnBattlefield(s, ap, healer);
    const elf = putOnBattlefield(s, ap, manaElf);
    attach(s, opp, serraBestiary, h);
    attach(s, opp, serraBestiary, elf);
    expect(abilityProblem(s, ap, h, tapAbility(s, h))).toMatch(/\{T\} in their costs/);
    expect(planActivate(s, ap, h, plain(s, h))).not.toBeNull();
    expect(manaAbilityProblem(s, ap, s.objects[elf]!, 0)).toMatch(/\{T\} in their costs/);
    expect(characteristics(s, s.objects[h]!).cantAttack).toBeTruthy();
  });

  it("Katabatic Winds: creatures with flying can't use {T} abilities, others can", () => {
    const { s, ap, opp } = setup([]);
    const bird = putOnBattlefield(s, ap, birdHealer);
    const h = putOnBattlefield(s, ap, healer);
    putOnBattlefield(s, opp, katabaticWinds);
    invalidateCharacteristics(s);
    expect(abilityProblem(s, ap, bird, tapAbility(s, bird))).toMatch(/\{T\} in their costs/);
    expect(planActivate(s, ap, h, tapAbility(s, h))).not.toBeNull();
    expect(characteristics(s, s.objects[bird]!).cantAttack).toBeTruthy();
    expect(characteristics(s, s.objects[h]!).cantAttack).toBeFalsy();
  });

  it("Ironclaw Curse: can't block a creature whose power is at least its toughness", () => {
    const { s, ap, opp } = setup([]);
    const bear = putOnBattlefield(s, ap, greenBear());
    attach(s, opp, ironclawCurse, bear);
    const one = putOnBattlefield(s, opp, creature("One Power", "Creature — Rat", "{B}", 1, 1, { cmc: 1 }));
    const zero = putOnBattlefield(s, opp, creature("Zero Power", "Creature — Wall", "{1}", 0, 3, { cmc: 1 }));
    expect(pt(s, bear)).toBe("2/1");
    expect(blockProblem(s, s.objects[bear]!, s.objects[one]!, ap)).toMatch(/can't block/);
    expect(blockProblem(s, s.objects[bear]!, s.objects[zero]!, ap)).toBeNull();
  });

  it("Flaring Flame-Kin: +2/+2, trample and a firebreathing ability while enchanted", () => {
    const { s, ap } = setup([]);
    const kin = putOnBattlefield(s, ap, flaringFlameKin);
    expect([pt(s, kin), objHasKeyword(s, s.objects[kin]!, "Trample"), abilitiesOf(s, s.objects[kin]!).activated.length]).toEqual(["2/2", false, 0]);
    attach(s, ap, plainAura, kin);
    expect([pt(s, kin), objHasKeyword(s, s.objects[kin]!, "Trample"), abilitiesOf(s, s.objects[kin]!).activated.length]).toEqual(["4/4", true, 1]);
    const t = settle(run(s, planActivate(s, ap, kin, 0)));
    expect(pt(t, kin)).toBe("5/4");
  });

  it("Hint of Insanity: discards every nonland card whose name another card in hand shares", () => {
    const { s: s0, ap, opp, ids } = setup([hintOfInsanity]);
    const forestCard = card("Forest", "Basic Land — Forest");
    const [b1, b2, f1, f2, other] = handOf(s0, opp, [greenBear(), greenBear(), forestCard, forestCard, murder]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [player(opp)])));
    expect([b1, b2, f1, f2, other].map((id) => zone(s, id!))).toEqual(["graveyard", "graveyard", "hand", "hand", "hand"]);
  });

  it("Stonewise Fortifier: prevents the damage the target creature would deal to it", () => {
    const { s: s0, ap, opp, ids } = setup([preyUpon]);
    const fort = putOnBattlefield(s0, ap, stonewiseFortifier);
    const ogre = putOnBattlefield(s0, opp, creature("Big Ogre", "Creature — Ogre", "{3}", 3, 3, { cmc: 3 }));
    let s = settle(run(s0, planActivate(s0, ap, fort, 0, [tgt(ogre)])));
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(fort), tgt(ogre)])));
    expect([zone(s, fort), s.objects[fort]!.damage ?? 0, s.objects[ogre]!.damage]).toEqual(["battlefield", 0, 2]);
  });

  it("Kry Shield: the creature deals no damage this turn and gets +0/+X", () => {
    const { s: s0, ap, opp, ids } = setup([preyUpon]);
    const shield = putOnBattlefield(s0, ap, kryShield);
    const bear = putOnBattlefield(s0, ap, greenBear());
    const ogre = putOnBattlefield(s0, opp, creature("Big Ogre", "Creature — Ogre", "{3}", 3, 3, { cmc: 3 }));
    let s = settle(run(s0, planActivate(s0, ap, shield, 0, [tgt(bear)])));
    expect(pt(s, bear)).toBe("2/4");
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(bear), tgt(ogre)])));
    expect([zone(s, bear), s.objects[bear]!.damage, s.objects[ogre]!.damage ?? 0]).toEqual(["battlefield", 3, 0]);
  });

  it("Ana Battlemage: the {1}{B} kicker taps the target, which deals damage equal to its power to its controller", () => {
    const { s: s0, ap, opp, ids } = setup([anaBattlemage]);
    const ogre = putOnBattlefield(s0, opp, creature("Big Ogre", "Creature — Ogre", "{3}", 3, 3, { cmc: 3 }));
    const before = life(s0, opp);
    let s = toTargets(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { kicks: [1] })));
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(ogre)] } as Action);
    s = settle(s);
    expect([s.objects[ogre]!.tapped, before - life(s, opp)]).toEqual([true, 3]);
  });
});
