// Lane B, round 4: the least played cards first, working up the popularity list (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, forest, mountain, passUntil, plainsCard, pt, putOnBattlefield, setup, swamp } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, manaOptions, objHasKeyword, parseManaCost, planActivate, planCast, planMana, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
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
/** Says yes to the pending "you may", paying its mana cost first. */
const mayYes = (s: GameState) => {
  const p = s.pending;
  if (p?.kind !== "chooseMay") throw new Error("not a may");
  return run(s, [...(p.pay?.mana ? planMana(s, p.player, parseManaCost(p.pay.mana))! : []), { type: "chooseMay", player: p.player, yes: true }]);
};
/** The player the game waits on answers the way a bot would. */
const botAnswer = (s: GameState) => act(s, botActions(s, s.pending!.player as PlayerId)[0]!);
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % s.turnOrder.length]!;
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
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
/** `n` plain cards in `pid`'s graveyard. */
const fillGraveyard = (s: GameState, pid: PlayerId, n: number) => {
  for (let i = 0; i < n; i++) into(s, pid, card(`Filler ${i}`, "Sorcery", "{1}"), "graveyard");
};
/** Attackers declared, the game paused on the defending player's blocks. */
const toBlocks = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) => {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) {
    if (s.pending?.kind === "chooseTargets") break;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const desert = card("Sandy Desert", "Land — Desert", "", { oracleText: "{T}: Add {C}." });

// Real oracle text (Scryfall).
const gildedCerodon = card("Gilded Cerodon", "Creature — Beast", "{4}{R}", { cmc: 5, power: "4", toughness: "4", oracleText: "Whenever this creature attacks, if you control a Desert or there is a Desert card in your graveyard, target creature can't block this turn." });
const sidewinderNaga = card("Sidewinder Naga", "Creature — Snake Warrior", "{2}{G}", { cmc: 3, power: "3", toughness: "2", oracleText: "As long as you control a Desert or there is a Desert card in your graveyard, this creature gets +1/+0 and has trample." });
const solitaryCamel = card("Solitary Camel", "Creature — Camel", "{2}{W}", { cmc: 3, power: "3", toughness: "2", oracleText: "This creature has lifelink as long as you control a Desert or there is a Desert card in your graveyard. (Damage dealt by this creature also causes you to gain that much life.)" });
const sandStrangler = card("Sand Strangler", "Creature — Beast", "{3}{R}", { cmc: 4, power: "3", toughness: "3", oracleText: "When this creature enters, if you control a Desert or there is a Desert card in your graveyard, you may have this creature deal 3 damage to target creature." });
const murasaBehemoth = card("Murasa Behemoth", "Creature — Beast", "{4}{G}{G}", { cmc: 6, power: "5", toughness: "5", keywords: ["Trample"], oracleText: "Trample\nThis creature gets +3/+3 as long as there is a land card in your graveyard." });
const windwrightMage = card("Windwright Mage", "Artifact Creature — Human Wizard", "{W}{U}{B}", { cmc: 3, power: "2", toughness: "2", keywords: ["Lifelink"], colors: ["B","U","W"], oracleText: "Lifelink (Damage dealt by this creature also causes you to gain that much life.)\nThis creature has flying as long as an artifact card is in your graveyard." });
const vengefulFirebrand = card("Vengeful Firebrand", "Creature — Elemental Warrior", "{3}{R}", { cmc: 4, power: "5", toughness: "2", oracleText: "This creature has haste as long as a Warrior card is in your graveyard.\n{R}: This creature gets +1/+0 until end of turn." });
const bloodfireEnforcers = card("Bloodfire Enforcers", "Creature — Human Monk", "{3}{R}", { cmc: 4, power: "5", toughness: "2", oracleText: "This creature has first strike and trample as long as an instant card and a sorcery card are in your graveyard." });
const swimmerInNightmares = card("Swimmer in Nightmares", "Creature — Nightmare Merfolk", "{2}{U}", { cmc: 3, power: "1", toughness: "4", oracleText: "This creature gets +3/+0 as long as there are ten or more cards in a single graveyard.\nThis creature can't be blocked as long as you control an Ashiok planeswalker." });
const deepSeaTerror = card("Deep-Sea Terror", "Creature — Serpent", "{4}{U}{U}", { cmc: 6, power: "6", toughness: "6", oracleText: "This creature can't attack unless there are seven or more cards in your graveyard." });
const moggConscripts = card("Mogg Conscripts", "Creature — Goblin", "{R}", { cmc: 1, power: "2", toughness: "2", oracleText: "This creature can't attack unless you've cast a creature spell this turn." });
const silburlindSnapper = card("Silburlind Snapper", "Creature — Turtle", "{5}{U}", { cmc: 6, power: "6", toughness: "6", oracleText: "This creature can't attack unless you've cast a noncreature spell this turn." });
const urgentExorcism = card("Urgent Exorcism", "Instant", "{1}{W}", { cmc: 2, oracleText: "Destroy target Spirit or enchantment." });
const hazardousConditions = card("Hazardous Conditions", "Sorcery", "{2}{B}{G}", { cmc: 4, oracleText: "Creatures with no counters on them get -2/-2 until end of turn." });
const lightningSurge = card("Lightning Surge", "Sorcery", "{3}{R}{R}", { cmc: 5, keywords: ["Threshold","Flashback"], oracleText: "Lightning Surge deals 4 damage to any target.\nThreshold — If there are seven or more cards in your graveyard, instead Lightning Surge deals 6 damage to that permanent or player and the damage can't be prevented.\nFlashback {5}{R}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)" });
const toxicStench = card("Toxic Stench", "Instant", "{1}{B}", { cmc: 2, keywords: ["Threshold"], oracleText: "Target nonblack creature gets -1/-1 until end of turn.\nThreshold — If there are seven or more cards in your graveyard, instead destroy that creature. It can't be regenerated." });
const swirlingSandstorm = card("Swirling Sandstorm", "Sorcery", "{3}{R}", { cmc: 4, keywords: ["Threshold"], oracleText: "Threshold — Swirling Sandstorm deals 5 damage to each creature without flying if there are seven or more cards in your graveyard." });
const icequake = card("Icequake", "Sorcery", "{1}{B}{B}", { cmc: 3, oracleText: "Destroy target land. If that land was a snow land, Icequake deals 1 damage to that land's controller." });
const thermokarst = card("Thermokarst", "Sorcery", "{1}{G}{G}", { cmc: 3, oracleText: "Destroy target land. If that land was a snow land, you gain 1 life." });
const lightningDart = card("Lightning Dart", "Instant", "{1}{R}", { cmc: 2, oracleText: "Lightning Dart deals 1 damage to target creature. If that creature is white or blue, Lightning Dart deals 4 damage to it instead." });
const burnTheImpure = card("Burn the Impure", "Instant", "{1}{R}", { cmc: 2, oracleText: "Burn the Impure deals 3 damage to target creature. If that creature has infect, Burn the Impure deals 3 damage to that creature's controller." });
const darkTemper = card("Dark Temper", "Instant", "{2}{R}", { cmc: 3, oracleText: "Dark Temper deals 2 damage to target creature. If you control a black permanent, destroy the creature instead." });
const soulReap = card("Soul Reap", "Sorcery", "{1}{B}", { cmc: 2, oracleText: "Destroy target nongreen creature. Its controller loses 3 life if you've cast another black spell this turn." });

const controvert = card("Controvert", "Instant", "{2}{U}{U}", { cmc: 4, keywords: ["Recover"], oracleText: "Counter target spell.\nRecover {2}{U}{U} (When a creature is put into your graveyard from the battlefield, you may pay {2}{U}{U}. If you do, return this card from your graveyard to your hand. Otherwise, exile this card.)" });
const grimHarvest = card("Grim Harvest", "Instant", "{1}{B}", { cmc: 2, keywords: ["Recover"], oracleText: "Return target creature card from your graveyard to your hand.\nRecover {2}{B} (When a creature is put into your graveyard from the battlefield, you may pay {2}{B}. If you do, return this card from your graveyard to your hand. Otherwise, exile this card.)" });
const icefall = card("Icefall", "Sorcery", "{2}{R}{R}", { cmc: 4, keywords: ["Recover"], oracleText: "Destroy target artifact or land.\nRecover {R}{R} (When a creature is put into your graveyard from the battlefield, you may pay {R}{R}. If you do, return this card from your graveyard to your hand. Otherwise, exile this card.)" });
const krovikanRot = card("Krovikan Rot", "Instant", "{2}{B}", { cmc: 3, keywords: ["Recover"], oracleText: "Destroy target creature with power 2 or less.\nRecover {1}{B}{B} (When a creature is put into your graveyard from the battlefield, you may pay {1}{B}{B}. If you do, return this card from your graveyard to your hand. Otherwise, exile this card.)" });
const resize = card("Resize", "Instant", "{1}{G}", { cmc: 2, keywords: ["Recover"], oracleText: "Target creature gets +3/+3 until end of turn.\nRecover {1}{G} (When a creature is put into your graveyard from the battlefield, you may pay {1}{G}. If you do, return this card from your graveyard to your hand. Otherwise, exile this card.)" });
const sunsBounty = card("Sun's Bounty", "Instant", "{1}{W}", { cmc: 2, keywords: ["Recover"], oracleText: "You gain 4 life.\nRecover {1}{W} (When a creature is put into your graveyard from the battlefield, you may pay {1}{W}. If you do, return this card from your graveyard to your hand. Otherwise, exile this card.)" });

const swellOfCourage = card("Swell of Courage", "Instant", "{3}{W}{W}", { cmc: 5, keywords: ["Reinforce"], oracleText: "Creatures you control get +2/+2 until end of turn.\nReinforce X—{X}{W}{W} ({X}{W}{W}, Discard this card: Put X +1/+1 counters on target creature.)" });
const wrensRunHydra = card("Wren's Run Hydra", "Creature — Hydra", "{X}{G}", { cmc: 1, power: "0", toughness: "0", keywords: ["Reach","Reinforce"], oracleText: "Reach\nThis creature enters with X +1/+1 counters on it.\nReinforce X—{X}{G}{G} ({X}{G}{G}, Discard this card: Put X +1/+1 counters on target creature.)" });

const pouncingKavu = card("Pouncing Kavu", "Creature — Kavu", "{1}{R}", { cmc: 2, power: "1", toughness: "1", keywords: ["First strike","Kicker"], oracleText: "Kicker {2}{R} (You may pay an additional {2}{R} as you cast this spell.)\nFirst strike\nIf this creature was kicked, it enters with two +1/+1 counters on it and with haste." });
const faerieSquadron = card("Faerie Squadron", "Creature — Faerie", "{U}", { cmc: 1, power: "1", toughness: "1", keywords: ["Kicker"], oracleText: "Kicker {3}{U} (You may pay an additional {3}{U} as you cast this spell.)\nIf this creature was kicked, it enters with two +1/+1 counters on it and with flying." });
const greenManaBattery = card("Green Mana Battery", "Artifact", "{4}", { cmc: 4, oracleText: "{2}, {T}: Put a charge counter on this artifact.\n{T}, Remove any number of charge counters from this artifact: Add {G}, then add an additional {G} for each charge counter removed this way." });
const whiteManaBattery = card("White Mana Battery", "Artifact", "{4}", { cmc: 4, oracleText: "{2}, {T}: Put a charge counter on this artifact.\n{T}, Remove any number of charge counters from this artifact: Add {W}, then add an additional {W} for each charge counter removed this way." });
const redManaBattery = card("Red Mana Battery", "Artifact", "{4}", { cmc: 4, oracleText: "{2}, {T}: Put a charge counter on this artifact.\n{T}, Remove any number of charge counters from this artifact: Add {R}, then add an additional {R} for each charge counter removed this way." });
const blueManaBattery = card("Blue Mana Battery", "Artifact", "{4}", { cmc: 4, oracleText: "{2}, {T}: Put a charge counter on this artifact.\n{T}, Remove any number of charge counters from this artifact: Add {U}, then add an additional {U} for each charge counter removed this way." });
const blackManaBattery = card("Black Mana Battery", "Artifact", "{4}", { cmc: 4, oracleText: "{2}, {T}: Put a charge counter on this artifact.\n{T}, Remove any number of charge counters from this artifact: Add {B}, then add an additional {B} for each charge counter removed this way." });

const floatingDreamZubera = card("Floating-Dream Zubera", "Creature — Zubera Spirit", "{1}{U}", { cmc: 2, power: "1", toughness: "2", oracleText: "When this creature dies, draw a card for each Zubera that died this turn." });
const ashenSkinZubera = card("Ashen-Skin Zubera", "Creature — Zubera Spirit", "{1}{B}", { cmc: 2, power: "1", toughness: "2", oracleText: "When this creature dies, target opponent discards a card for each Zubera that died this turn." });
const silentChantZubera = card("Silent-Chant Zubera", "Creature — Zubera Spirit", "{1}{W}", { cmc: 2, power: "1", toughness: "2", oracleText: "When this creature dies, you gain 2 life for each Zubera that died this turn." });
const emberFistZubera = card("Ember-Fist Zubera", "Creature — Zubera Spirit", "{1}{R}", { cmc: 2, power: "1", toughness: "2", oracleText: "When this creature dies, it deals damage to any target equal to the number of Zubera that died this turn." });
const drippingTongueZubera = card("Dripping-Tongue Zubera", "Creature — Zubera Spirit", "{1}{G}", { cmc: 2, power: "1", toughness: "2", oracleText: "When this creature dies, create a 1/1 colorless Spirit creature token for each Zubera that died this turn." });

describe("Deserts and cards in your graveyard: \"as long as you control a Desert or there is a Desert card in your graveyard\", \"a land card in your graveyard\"", () => {
  it("are fully supported", () => supported(gildedCerodon, sidewinderNaga, solitaryCamel, sandStrangler, murasaBehemoth, windwrightMage, vengefulFirebrand, bloodfireEnforcers, swimmerInNightmares));

  it("Sidewinder Naga and Solitary Camel: a Desert you control, or a Desert card in your graveyard", () => {
    const { s, ap, opp } = setup([]);
    const naga = putOnBattlefield(s, ap, sidewinderNaga);
    const camel = putOnBattlefield(s, ap, solitaryCamel);
    expect(pt(s, naga)).toBe("3/2");
    expect(objHasKeyword(s, s.objects[naga]!, "Trample")).toBe(false);
    expect(objHasKeyword(s, s.objects[camel]!, "Lifelink")).toBe(false);
    // An opponent's Desert doesn't count.
    putOnBattlefield(s, opp, desert);
    expect(pt(s, naga)).toBe("3/2");
    const d = into(s, ap, desert, "graveyard");
    expect(pt(s, naga)).toBe("4/2");
    expect(objHasKeyword(s, s.objects[naga]!, "Trample")).toBe(true);
    expect(objHasKeyword(s, s.objects[camel]!, "Lifelink")).toBe(true);
    // Out of the graveyard, onto the battlefield: still a Desert.
    s.players[ap]!.graveyard.splice(s.players[ap]!.graveyard.indexOf(d), 1);
    s.objects[d]!.zone = "battlefield";
    s.battlefield.push(d);
    invalidateCharacteristics(s);
    expect(pt(s, naga)).toBe("4/2");
  });

  it("Sand Strangler deals 3 damage to target creature only with a Desert", () => {
    for (const withDesert of [false, true]) {
      let { s, ap, ids, opp } = setup([sandStrangler]);
      const victim = putOnBattlefield(s, opp, creature("Big", "Creature — Beast", "{3}{G}", 3, 5));
      if (withDesert) putOnBattlefield(s, ap, desert);
      s = run(s, planCast(s, ap, ids[0]!));
      for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
        if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(victim)] } as Action);
        else if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: true });
        else if (s.pending) break;
        else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
      expect(s.objects[victim]!.damage, `with a Desert: ${withDesert}`).toBe(withDesert ? 3 : 0);
    }
  });

  it("Gilded Cerodon's attack trigger: target creature can't block, only with a Desert", () => {
    for (const withDesert of [false, true]) {
      let { s, ap } = setup([]);
      const cer = putOnBattlefield(s, ap, gildedCerodon);
      const opp = next(s, ap);
      const blocker = putOnBattlefield(s, opp, greenBear());
      if (withDesert) into(s, ap, desert, "graveyard");
      s = toBlocks(s, ap, [{ attacker: cer, defender: opp }]);
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(blocker)] } as Action);
      s = resolveAll(s);
      for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.pending?.kind).toBe("declareBlockers");
      expect(cantBlockNow(s, s.objects[blocker]!), `with a Desert: ${withDesert}`).toBe(withDesert);
    }
  });

  it("Murasa Behemoth, Windwright Mage, Vengeful Firebrand and Bloodfire Enforcers look at the cards in your graveyard", () => {
    const { s, ap, opp } = setup([]);
    const mur = putOnBattlefield(s, ap, murasaBehemoth);
    const wind = putOnBattlefield(s, ap, windwrightMage);
    const fire = putOnBattlefield(s, ap, vengefulFirebrand);
    const blood = putOnBattlefield(s, ap, bloodfireEnforcers);
    expect(pt(s, mur)).toBe("5/5");
    expect(objHasKeyword(s, s.objects[wind]!, "Flying")).toBe(false);
    expect(objHasKeyword(s, s.objects[fire]!, "Haste")).toBe(false);
    // Another player's graveyard doesn't count.
    into(s, opp, desert, "graveyard");
    into(s, opp, card("Relic", "Artifact", "{1}"), "graveyard");
    expect(pt(s, mur)).toBe("5/5");
    expect(objHasKeyword(s, s.objects[wind]!, "Flying")).toBe(false);
    into(s, ap, desert, "graveyard");
    into(s, ap, card("Relic", "Artifact", "{1}"), "graveyard");
    into(s, ap, creature("Fighter", "Creature — Human Warrior", "{R}", 1, 1), "graveyard");
    expect(pt(s, mur)).toBe("8/8");
    expect(objHasKeyword(s, s.objects[wind]!, "Flying")).toBe(true);
    expect(objHasKeyword(s, s.objects[fire]!, "Haste")).toBe(true);
    into(s, ap, card("Bolt", "Instant", "{R}"), "graveyard");
    expect(objHasKeyword(s, s.objects[blood]!, "First strike")).toBe(false);
    into(s, ap, card("Rift", "Sorcery", "{R}"), "graveyard");
    expect(objHasKeyword(s, s.objects[blood]!, "First strike")).toBe(true);
    expect(objHasKeyword(s, s.objects[blood]!, "Trample")).toBe(true);
  });

  it("Swimmer in Nightmares: ten or more cards in any one graveyard", () => {
    const { s, ap, opp } = setup([]);
    const sw = putOnBattlefield(s, ap, swimmerInNightmares);
    fillGraveyard(s, ap, 6);
    fillGraveyard(s, opp, 9);
    expect(pt(s, sw)).toBe("1/4");
    fillGraveyard(s, opp, 1);
    expect(pt(s, sw)).toBe("4/4");
  });
});

describe("can't attack unless there are seven or more cards in your graveyard / you've cast a creature or noncreature spell this turn", () => {
  it("are fully supported", () => supported(deepSeaTerror, moggConscripts, silburlindSnapper));

  it("Deep-Sea Terror attacks only with seven cards in your graveyard", () => {
    let { s, ap } = setup([]);
    const t = putOnBattlefield(s, ap, deepSeaTerror);
    s = passUntil(s, "declareAttackers", ap);
    s.players[ap]!.graveyard = [];
    fillGraveyard(s, ap, 6);
    expect(potentialAttackers(s, ap).map((o) => o.id)).not.toContain(t);
    fillGraveyard(s, ap, 1);
    expect(potentialAttackers(s, ap).map((o) => o.id)).toContain(t);
  });

  it("Mogg Conscripts and Silburlind Snapper attack only after you cast that kind of spell this turn", () => {
    let { s, ap, ids } = setup([greenBear(), card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." })]);
    const mogg = putOnBattlefield(s, ap, moggConscripts);
    const snap = putOnBattlefield(s, ap, silburlindSnapper);
    const can = (st: GameState) => potentialAttackers(st, ap).map((o) => o.id);
    expect(can(s)).not.toContain(mogg);
    expect(can(s)).not.toContain(snap);
    s = run(s, planCast(s, ap, ids[0]!));
    s = resolveAll(s);
    expect(can(s)).toContain(mogg);
    expect(can(s)).not.toContain(snap);
    s = run(s, planCast(s, ap, ids[1]!));
    s = resolveAll(s);
    expect(can(s)).toContain(snap);
  });
});

describe("spells that check something as they resolve: threshold \"instead\", \"if that creature is white or blue\", \"if that land was a snow land\", \"another black spell\"", () => {
  it("are fully supported", () => supported(urgentExorcism, hazardousConditions, lightningSurge, toxicStench, swirlingSandstorm, icequake, thermokarst, lightningDart, burnTheImpure, darkTemper, soulReap));

  it("Urgent Exorcism destroys a Spirit or an enchantment", () => {
    let { s, ap, ids, opp } = setup([urgentExorcism, urgentExorcism]);
    const spirit = putOnBattlefield(s, opp, creature("Spirit", "Creature — Spirit", "{1}{W}", 1, 1));
    const ench = putOnBattlefield(s, opp, card("Aura Thing", "Enchantment", "{1}{W}"));
    const bear = putOnBattlefield(s, opp, greenBear());
    expect(planCast(s, ap, ids[0]!, [tgt(bear)])).toBeNull();
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(spirit)])));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(ench)])));
    expect(zone(s, spirit)).toBe("graveyard");
    expect(zone(s, ench)).toBe("graveyard");
  });

  it("Hazardous Conditions gives -2/-2 only to creatures with no counters", () => {
    let { s, ap, ids, opp } = setup([hazardousConditions]);
    const plain = putOnBattlefield(s, opp, creature("Big", "Creature — Beast", "{3}{G}", 4, 4));
    const countered = putOnBattlefield(s, opp, creature("Big2", "Creature — Beast", "{3}{G}", 4, 4));
    s.objects[countered]!.counters = { "+1/+1": 1 };
    invalidateCharacteristics(s);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(pt(s, plain)).toBe("2/2");
    expect(pt(s, countered)).toBe("5/5");
  });

  it("Lightning Surge: 4 damage, or with threshold 6 that can't be prevented", () => {
    for (const threshold of [false, true]) {
      let { s, ap, ids, opp } = setup([lightningSurge]);
      if (threshold) fillGraveyard(s, ap, 7);
      const start = life(s, opp);
      s = resolveAll(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
      expect(life(s, opp)).toBe(start - (threshold ? 6 : 4));
    }
  });

  it("Toxic Stench: -1/-1, or with threshold destroy the creature (no regeneration)", () => {
    for (const threshold of [false, true]) {
      let { s, ap, ids, opp } = setup([toxicStench]);
      if (threshold) fillGraveyard(s, ap, 7);
      const t = putOnBattlefield(s, opp, creature("Big", "Creature — Beast", "{3}{G}", 4, 4));
      s.objects[t]!.regenShields = 1;
      s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(t)])));
      if (threshold) expect(zone(s, t)).toBe("graveyard");
      else expect(pt(s, t)).toBe("3/3");
    }
  });

  it("Swirling Sandstorm does nothing without threshold, and 5 damage to each creature without flying with it", () => {
    for (const threshold of [false, true]) {
      let { s, ap, ids, opp } = setup([swirlingSandstorm]);
      if (threshold) fillGraveyard(s, ap, 7);
      const ground = putOnBattlefield(s, opp, creature("Big", "Creature — Beast", "{3}{G}", 6, 6));
      const flyer = putOnBattlefield(s, opp, creature("Bird", "Creature — Bird", "{3}{U}", 6, 6, { keywords: ["Flying"], oracleText: "Flying" }));
      s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
      expect(s.objects[ground]!.damage).toBe(threshold ? 5 : 0);
      expect(s.objects[flyer]!.damage).toBe(0);
    }
  });

  it("Icequake and Thermokarst: the extra only for a snow land", () => {
    for (const snow of [false, true]) {
      let { s, ap, ids, opp } = setup([icequake, thermokarst]);
      const l1 = putOnBattlefield(s, opp, card(snow ? "Snow-Covered Forest" : "Forest", snow ? "Basic Snow Land — Forest" : "Basic Land — Forest"));
      const l2 = putOnBattlefield(s, opp, card(snow ? "Snow-Covered Island" : "Island", snow ? "Basic Snow Land — Island" : "Basic Land — Island"));
      const [oppLife, myLife] = [life(s, opp), life(s, ap)];
      s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(l1)])));
      s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(l2)])));
      expect(zone(s, l1)).toBe("graveyard");
      expect(zone(s, l2)).toBe("graveyard");
      expect(life(s, opp)).toBe(oppLife - (snow ? 1 : 0));
      expect(life(s, ap)).toBe(myLife + (snow ? 1 : 0));
    }
  });

  it("Lightning Dart deals 4 to a white or blue creature, 1 to others; Burn the Impure hits the controller of an infect creature", () => {
    let { s, ap, ids, opp } = setup([lightningDart, lightningDart, burnTheImpure, burnTheImpure]);
    putOnBattlefield(s, ap, mountain);
    const w = putOnBattlefield(s, opp, creature("White Wall", "Creature — Wall", "{1}{W}", 0, 6));
    const g = putOnBattlefield(s, opp, creature("Green Wall", "Creature — Wall", "{1}{G}", 0, 6));
    const inf = putOnBattlefield(s, opp, creature("Infecter", "Creature — Phyrexian", "{1}{B}", 1, 6, { keywords: ["Infect"], oracleText: "Infect" }));
    const plain = putOnBattlefield(s, opp, creature("Plain", "Creature — Beast", "{1}{B}", 1, 6));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(w)])));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(g)])));
    expect(s.objects[w]!.damage).toBe(4);
    expect(s.objects[g]!.damage).toBe(1);
    const start = life(s, opp);
    s = resolveAll(run(s, planCast(s, ap, ids[2]!, [tgt(plain)])));
    expect(life(s, opp)).toBe(start);
    s = resolveAll(run(s, planCast(s, ap, ids[3]!, [tgt(inf)])));
    expect(s.objects[inf]!.damage).toBe(3);
    expect(life(s, opp)).toBe(start - 3);
  });

  it("Dark Temper destroys the creature instead if you control a black permanent", () => {
    for (const black of [false, true]) {
      let { s, ap, ids, opp } = setup([darkTemper]);
      if (black) putOnBattlefield(s, ap, blackBear());
      const t = putOnBattlefield(s, opp, creature("Big", "Creature — Beast", "{3}{G}", 4, 4));
      s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(t)])));
      expect(zone(s, t)).toBe(black ? "graveyard" : "battlefield");
      if (!black) expect(s.objects[t]!.damage).toBe(2);
    }
  });

  it("Soul Reap: its controller loses 3 life only if you've cast another black spell this turn", () => {
    let { s, ap, ids, opp } = setup([soulReap, soulReap, blackBear()]);
    const a = putOnBattlefield(s, opp, whiteBear());
    const b = putOnBattlefield(s, opp, whiteBear());
    const start = life(s, opp);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(a)])));
    expect(zone(s, a)).toBe("graveyard");
    // The first Soul Reap was a black spell cast before this one.
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    expect(life(s, opp)).toBe(start - 3);
  });

  it("Soul Reap alone, or after a nonblack spell, costs no life", () => {
    let { s, ap, ids, opp } = setup([greenBear(), soulReap]);
    const a = putOnBattlefield(s, opp, whiteBear());
    const start = life(s, opp);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(a)])));
    expect(zone(s, a)).toBe("graveyard");
    expect(life(s, opp)).toBe(start);
  });
});

describe("Recover (CR 702.59a): when a creature is put into your graveyard from the battlefield, pay to return the card to your hand, or exile it", () => {
  it("are fully supported", () => supported(controvert, grimHarvest, icefall, krovikanRot, resize, sunsBounty));

  const murder = card("Murder", "Instant", "{1}{B}{B}", { cmc: 3, oracleText: "Destroy target creature." });
  const wrath = card("Wrath", "Sorcery", "{2}{W}{W}", { cmc: 4, oracleText: "Destroy all creatures." });

  it("paying returns Resize to your hand; declining exiles it", () => {
    for (const pay of [true, false]) {
      let { s, ap, ids } = setup([murder]);
      const r = into(s, ap, resize, "graveyard");
      const mine = putOnBattlefield(s, ap, greenBear());
      s = run(s, planCast(s, ap, ids[0]!, [tgt(mine)]));
      for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
        if (s.pending?.kind === "chooseMay") {
          expect(s.pending.player).toBe(ap);
          s = pay ? mayYes(s) : act(s, { type: "chooseMay", player: ap, yes: false });
        } else if (s.pending) break;
        else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
      expect(zone(s, mine)).toBe("graveyard");
      expect(zone(s, r), `paid: ${pay}`).toBe(pay ? "hand" : "exile");
    }
  });

  it("an opponent's creature dying doesn't trigger it", () => {
    let { s, ap, ids, opp } = setup([murder]);
    const r = into(s, ap, sunsBounty, "graveyard");
    const theirs = putOnBattlefield(s, opp, greenBear());
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(theirs)])));
    expect(zone(s, theirs)).toBe("graveyard");
    expect(zone(s, r)).toBe("graveyard");
  });

  it("two of your creatures dying at once: the second trigger finds the card gone and leaves it in your hand", () => {
    let { s, ap, ids } = setup([wrath]);
    const r = into(s, ap, grimHarvest, "graveyard");
    putOnBattlefield(s, ap, greenBear());
    putOnBattlefield(s, ap, greenBear());
    s = run(s, planCast(s, ap, ids[0]!));
    let asked = 0;
    for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      if (s.pending?.kind === "chooseMay") {
        asked++;
        s = mayYes(s);
      } else if (s.pending) s = botAnswer(s);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(asked).toBe(1);
    expect(zone(s, r)).toBe("hand");
  });

  it("a bot with mana pays to get its card back", () => {
    let { s, ap, ids } = setup([murder]);
    const r = into(s, ap, resize, "graveyard");
    const mine = putOnBattlefield(s, ap, greenBear());
    s = run(s, planCast(s, ap, ids[0]!, [tgt(mine)]));
    for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      if (s.pending) s = botAnswer(s);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(zone(s, r)).toBe("hand");
  });
});

describe("Reinforce X (CR 702.77a): {X} and discard this card, X +1/+1 counters on target creature", () => {
  it("are fully supported", () => supported(swellOfCourage, wrensRunHydra));

  it("Swell of Courage's reinforce puts X counters; cast, it pumps your creatures", () => {
    let { s, ap, ids } = setup([swellOfCourage, swellOfCourage]);
    putOnBattlefield(s, ap, plainsCard);
    putOnBattlefield(s, ap, plainsCard);
    const b = putOnBattlefield(s, ap, greenBear());
    const i = s.objects[ids[0]!]!;
    s = resolveAll(run(s, planActivate(s, ap, i.id, 0, [tgt(b)], undefined, undefined, 3)));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.objects[b]!.counters["+1/+1"]).toBe(3);
    expect(pt(s, b)).toBe("5/5");
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(pt(s, b)).toBe("7/7");
  });

  it("Wren's Run Hydra's reinforce from your hand", () => {
    let { s, ap, ids } = setup([wrensRunHydra]);
    const b = putOnBattlefield(s, ap, greenBear());
    s = resolveAll(run(s, planActivate(s, ap, ids[0]!, 0, [tgt(b)], undefined, undefined, 2)));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(2);
  });
});

describe("\"If ~ was kicked, it enters with two +1/+1 counters on it and with haste\" (CR 702.33, 614.1c)", () => {
  it("are fully supported", () => supported(pouncingKavu, faerieSquadron));

  it("Pouncing Kavu kicked: 3/3 with haste; not kicked: 1/1 without", () => {
    for (const kick of [false, true]) {
      let { s, ap, ids } = setup([pouncingKavu]);
      s = resolveAll(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { kicks: kick ? [0] : [] })));
      const k = ids[0]!;
      expect(zone(s, k)).toBe("battlefield");
      expect(pt(s, k)).toBe(kick ? "3/3" : "1/1");
      expect(objHasKeyword(s, s.objects[k]!, "Haste")).toBe(kick);
    }
  });

  it("Faerie Squadron kicked has flying", () => {
    let { s, ap, ids } = setup([faerieSquadron]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { kicks: [0] })));
    expect(pt(s, ids[0]!)).toBe("3/3");
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Flying")).toBe(true);
  });
});

describe("The Mana Batteries: {T}, remove any number of charge counters: add one mana, plus one for each counter removed", () => {
  it("are fully supported", () => supported(greenManaBattery, whiteManaBattery, redManaBattery, blueManaBattery, blackManaBattery));

  it("Green Mana Battery adds {G} with no counters removed, {G}{G}{G} removing two", () => {
    let { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, greenManaBattery);
    s.objects[b]!.counters = { charge: 2 };
    const opts = manaOptions(s, s.objects[b]!);
    expect(opts.map((o) => [o.removes, o.adds.length])).toEqual([[0, 1], [1, 2], [2, 3]]);
    const two = opts.find((o) => o.removes === 2)!;
    s = act(s, { type: "activateMana", player: ap, objectId: b, mana: two.mana, ability: two.ability, combo: two.combo });
    expect(s.players[ap]!.manaPool.G).toBe(3);
    expect(s.objects[b]!.counters.charge ?? 0).toBe(0);
    expect(s.objects[b]!.tapped).toBe(true);
  });

  it("paying for a spell taps a battery for one mana and keeps its counters", () => {
    let { s, ap, ids } = setup([greenBear()]);
    for (const id of [...s.battlefield]) if (s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Land")) s.objects[id]!.tapped = true;
    putOnBattlefield(s, ap, forest);
    const b = putOnBattlefield(s, ap, greenManaBattery);
    s.objects[b]!.counters = { charge: 3 };
    invalidateCharacteristics(s);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.objects[b]!.tapped).toBe(true);
    expect(s.objects[b]!.counters.charge).toBe(3);
  });

  it("{2}, {T}: put a charge counter on it", () => {
    let { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, redManaBattery);
    s = resolveAll(run(s, planActivate(s, ap, b, 0)));
    expect(s.objects[b]!.counters.charge).toBe(1);
  });
});

describe("The Zubera: \"for each Zubera that died this turn\", any player's, itself included", () => {
  it("are fully supported", () => supported(floatingDreamZubera, ashenSkinZubera, silentChantZubera, emberFistZubera, drippingTongueZubera));

  const wrath = card("Wrath", "Sorcery", "{2}{W}{W}", { cmc: 4, oracleText: "Destroy all creatures." });

  it("three Zubera die at once (one an opponent's, one a changeling): each counts three", () => {
    let { s, ap, ids, opp } = setup([wrath]);
    putOnBattlefield(s, ap, silentChantZubera);
    putOnBattlefield(s, opp, drippingTongueZubera);
    putOnBattlefield(s, ap, creature("Shapeshifter", "Creature — Shapeshifter", "{1}{U}", 1, 1, { keywords: ["Changeling"], oracleText: "Changeling (This card is every creature type.)" }));
    putOnBattlefield(s, ap, greenBear());
    const start = life(s, ap);
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      if (s.pending) s = botAnswer(s);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(life(s, ap)).toBe(start + 6);
    const spirits = s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === opp);
    expect(spirits).toHaveLength(3);
  });

  it("a Zubera that died earlier in the turn counts too; the count resets next turn", () => {
    let { s, ap, ids } = setup([wrath]);
    const murder = card("Murder", "Instant", "{1}{B}{B}", { cmc: 3, oracleText: "Destroy target creature." });
    const m = into(s, ap, murder);
    const f = putOnBattlefield(s, ap, floatingDreamZubera);
    putOnBattlefield(s, ap, emberFistZubera);
    const handBefore = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planCast(s, ap, m, [tgt(f)])));
    // One Zubera so far: draw one (Murder left the hand).
    expect(s.players[ap]!.hand.length).toBe(handBefore - 1 + 1);
    const opp = next(s, ap);
    const oppLife = life(s, opp);
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [player(opp)] } as Action);
      else if (s.pending) s = botAnswer(s);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    // Ember-Fist: two Zubera died this turn.
    expect(life(s, opp)).toBe(oppLife - 2);
    s = passUntil(s, "upkeep", opp);
    expect(s.diedTypesThisTurn).toBeUndefined();
  });
});

const opalCaryatid = card("Opal Caryatid", "Enchantment", "{W}", { cmc: 1, oracleText: "When an opponent casts a creature spell, if this permanent is an enchantment, it becomes a 2/2 Soldier creature." });
const opalAcrolith = card("Opal Acrolith", "Enchantment", "{2}{W}", { cmc: 3, oracleText: "Whenever an opponent casts a creature spell, if this permanent is an enchantment, it becomes a 2/4 Soldier creature.\n{0}: This permanent becomes an enchantment." });
const hiddenStag = card("Hidden Stag", "Enchantment", "{1}{G}", { cmc: 2, oracleText: "Whenever an opponent plays a land, if this permanent is an enchantment, it becomes a 3/2 Elk Beast creature.\nWhenever you play a land, if this permanent is a creature, it becomes an enchantment." });
const hiddenSpider = card("Hidden Spider", "Enchantment", "{G}", { cmc: 1, oracleText: "When an opponent casts a creature spell with flying, if this permanent is an enchantment, it becomes a 3/5 Spider creature with reach. (It can block creatures with flying.)" });
const lurkingSkirge = card("Lurking Skirge", "Enchantment", "{1}{B}", { cmc: 2, oracleText: "When a creature is put into an opponent's graveyard from the battlefield, if this permanent is an enchantment, it becomes a 3/2 Phyrexian Imp creature with flying." });
const veiledApparition = card("Veiled Apparition", "Enchantment", "{1}{U}", { cmc: 2, oracleText: "When an opponent casts a spell, if this permanent is an enchantment, it becomes a 3/3 Illusion creature with flying and \"At the beginning of your upkeep, sacrifice this creature unless you pay {1}{U}.\"" });
const rubyLeech = card("Ruby Leech", "Creature — Leech", "{1}{R}", { cmc: 2, power: "2", toughness: "2", keywords: ["First strike"], oracleText: "First strike\nRed spells you cast cost {R} more to cast." });
const sapphireLeech = card("Sapphire Leech", "Creature — Leech", "{1}{U}", { cmc: 2, power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying\nBlue spells you cast cost {U} more to cast." });
const jadeLeech = card("Jade Leech", "Creature — Leech", "{2}{G}{G}", { cmc: 4, power: "5", toughness: "5", oracleText: "Green spells you cast cost {G} more to cast." });
const derelor = card("Derelor", "Creature — Thrull", "{3}{B}", { cmc: 4, power: "4", toughness: "4", oracleText: "Black spells you cast cost {B} more to cast." });

describe("The Opal, Hidden and Veiled enchantments: \"if ~ is an enchantment, it becomes a creature\" (CR 603.4, 205.1a)", () => {
  it("are fully supported", () => supported(opalCaryatid, opalAcrolith, hiddenStag, hiddenSpider, lurkingSkirge, veiledApparition));

  const isType = (s: GameState, id: string, t: string) => characteristics(s, s.objects[id]!).types.includes(t as never);
  /** The game at `opp`'s first main phase, `opp` with lands and `defs` in hand. */
  const oppTurn = (s: GameState, opp: PlayerId, defs: CardDef[]) => {
    for (const l of [forest, forest, forest, mountain, mountain, plainsCard]) putOnBattlefield(s, opp, l);
    const ids = defs.map((d) => into(s, opp, d));
    return { s: passUntil(s, "main1", opp), ids };
  };

  it("Opal Caryatid: an opponent's creature spell makes it a 2/2 Soldier creature that's no longer an enchantment; once only", () => {
    const { s: s0, ap, opp } = setup([]);
    const opal = putOnBattlefield(s0, ap, opalCaryatid);
    let { s, ids } = oppTurn(s0, opp, [greenBear(), greenBear()]);
    expect(isType(s, opal, "Creature")).toBe(false);
    s = run(s, planCast(s, opp, ids[0]!));
    expect(s.stack.length).toBe(2);
    s = resolveAll(s);
    expect(isType(s, opal, "Creature")).toBe(true);
    expect(isType(s, opal, "Enchantment")).toBe(false);
    expect(characteristics(s, s.objects[opal]!).subtypes).toEqual(["Soldier"]);
    expect(pt(s, opal)).toBe("2/2");
    // Not an enchantment any more: the next creature spell doesn't trigger it (CR 603.4).
    s = run(s, planCast(s, opp, ids[1]!));
    expect(s.stack.length).toBe(1);
  });

  it("your own creature spell doesn't trigger it", () => {
    const { s: s0, ap, ids } = setup([greenBear()]);
    const opal = putOnBattlefield(s0, ap, opalCaryatid);
    const s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.stack.length).toBe(1);
    expect(isType(resolveAll(s), opal, "Creature")).toBe(false);
  });

  it("Opal Acrolith turns back into an enchantment for {0} and becomes a creature again", () => {
    const { s: s0, ap, opp } = setup([]);
    const opal = putOnBattlefield(s0, ap, opalAcrolith);
    let { s, ids } = oppTurn(s0, opp, [greenBear(), greenBear()]);
    s = resolveAll(run(s, planCast(s, opp, ids[0]!)));
    expect(isType(s, opal, "Creature")).toBe(true);
    expect(pt(s, opal)).toBe("2/4");
    s = passUntil(s, "end", opp);
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planActivate(s, ap, opal, 0));
    s = resolveAll(s);
    expect(isType(s, opal, "Creature")).toBe(false);
    expect(isType(s, opal, "Enchantment")).toBe(true);
    expect(characteristics(s, s.objects[opal]!).subtypes).toEqual([]);
    const opp2 = opp;
    s = passUntil(s, "main1", next(s, opp2));
    // The next opponent casts a creature spell: a creature again (a new effect, a later timestamp, CR 613.7).
    const third = s.activePlayer;
    for (const l of [forest, forest]) putOnBattlefield(s, third, l);
    const b = into(s, third, greenBear());
    s = resolveAll(run(s, planCast(s, third, b)));
    expect(isType(s, opal, "Creature")).toBe(true);
    expect(pt(s, opal)).toBe("2/4");
  });

  it("Hidden Spider: only a creature spell with flying", () => {
    const { s: s0, ap, opp } = setup([]);
    const spider = putOnBattlefield(s0, ap, hiddenSpider);
    const bird = creature("Bird", "Creature — Bird", "{1}{W}", 1, 1, { keywords: ["Flying"], oracleText: "Flying" });
    let { s, ids } = oppTurn(s0, opp, [greenBear(), bird]);
    s = resolveAll(run(s, planCast(s, opp, ids[0]!)));
    expect(isType(s, spider, "Creature")).toBe(false);
    s = resolveAll(run(s, planCast(s, opp, ids[1]!)));
    expect(isType(s, spider, "Creature")).toBe(true);
    expect(pt(s, spider)).toBe("3/5");
    expect(objHasKeyword(s, s.objects[spider]!, "Reach")).toBe(true);
  });

  it("Hidden Stag: a creature when an opponent plays a land, an enchantment again when you do", () => {
    const { s: s0, ap, opp } = setup([]);
    const stag = putOnBattlefield(s0, ap, hiddenStag);
    let { s, ids } = oppTurn(s0, opp, [forest]);
    s = resolveAll(act(s, { type: "playLand", player: opp, objectId: ids[0]! }));
    expect(isType(s, stag, "Creature")).toBe(true);
    expect(isType(s, stag, "Enchantment")).toBe(false);
    expect(characteristics(s, s.objects[stag]!).subtypes).toEqual(["Elk", "Beast"]);
    expect(pt(s, stag)).toBe("3/2");
    s = passUntil(s, "main1", ap);
    const land = into(s, ap, forest);
    s = resolveAll(act(s, { type: "playLand", player: ap, objectId: land }));
    expect(isType(s, stag, "Creature")).toBe(false);
    expect(isType(s, stag, "Enchantment")).toBe(true);
  });

  it("Lurking Skirge: an opponent's creature dying makes it a 3/2 flier; yours doesn't", () => {
    const { s: s0, ap, opp } = setup([]);
    const skirge = putOnBattlefield(s0, ap, lurkingSkirge);
    const murder = card("Murder", "Instant", "{1}{B}{B}", { cmc: 3, oracleText: "Destroy target creature." });
    for (const l of [swamp, swamp]) putOnBattlefield(s0, ap, l);
    const m1 = into(s0, ap, murder);
    const m2 = into(s0, ap, murder);
    const mine = putOnBattlefield(s0, ap, greenBear());
    const theirs = putOnBattlefield(s0, opp, greenBear());
    let s = resolveAll(run(s0, planCast(s0, ap, m1, [tgt(mine)])));
    expect(isType(s, skirge, "Creature")).toBe(false);
    s = resolveAll(run(s, planCast(s, ap, m2, [tgt(theirs)])));
    expect(isType(s, skirge, "Creature")).toBe(true);
    expect(pt(s, skirge)).toBe("3/2");
    expect(objHasKeyword(s, s.objects[skirge]!, "Flying")).toBe(true);
  });

  it("Veiled Apparition gains \"sacrifice it unless you pay {1}{U}\" at your upkeep", () => {
    const { s: s0, ap, opp } = setup([]);
    const veil = putOnBattlefield(s0, ap, veiledApparition);
    const shock = card("Shock", "Instant", "{R}", { cmc: 1, oracleText: "Shock deals 2 damage to any target." });
    let { s, ids } = oppTurn(s0, opp, [shock]);
    s = resolveAll(run(s, planCast(s, opp, ids[0]!, [player(ap)])));
    expect(isType(s, veil, "Creature")).toBe(true);
    expect(pt(s, veil)).toBe("3/3");
    s = passUntil(s, "upkeep", ap);
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("chooseMay");
    s = mayYes(s);
    s = resolveAll(s);
    expect(zone(s, veil)).toBe("battlefield");
    // Next upkeep, not paying: sacrificed.
    s = passUntil(passUntil(s, "main1", opp), "upkeep", ap);
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = resolveAll(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(zone(s, veil)).toBe("graveyard");
  });
});

describe("The Leeches: \"[Color] spells you cast cost {C} more to cast\" (CR 601.2f)", () => {
  it("are fully supported", () => supported(rubyLeech, sapphireLeech, jadeLeech, derelor));

  it("Ruby Leech: your red spells cost {R} more; other colors and opponents' spells don't", () => {
    const shock = card("Shock", "Instant", "{R}", { cmc: 1, oracleText: "Shock deals 2 damage to any target." });
    const { s, ap, ids, opp } = setup([shock, greenBear()]);
    putOnBattlefield(s, ap, rubyLeech);
    const plan = planCast(s, ap, ids[0]!, [player(opp)])!;
    const taps = plan.filter((a) => a.type === "activateMana");
    expect(taps).toHaveLength(2);
    expect(taps.every((a) => a.type === "activateMana" && a.mana === "R")).toBe(true);
    expect(planCast(s, ap, ids[1]!)!.filter((a) => a.type === "activateMana")).toHaveLength(2);
    // With only one Mountain untapped, a red spell can't be cast.
    const mountains = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Mountain");
    for (const id of mountains) s.objects[id]!.tapped = true;
    const m = putOnBattlefield(s, ap, mountain);
    expect(planCast(s, ap, ids[0]!, [player(opp)])).toBeNull();
    s.objects[m]!.tapped = false;
    s.objects[mountains[0]!]!.tapped = false;
    expect(planCast(s, ap, ids[0]!, [player(opp)])).not.toBeNull();
    // An opponent's red spell costs the same as ever.
    const s2 = passUntil(s, "main1", opp);
    putOnBattlefield(s2, opp, mountain);
    const theirs = into(s2, opp, shock);
    expect(planCast(s2, opp, theirs, [player(ap)])!.filter((a) => a.type === "activateMana")).toHaveLength(1);
  });

  it("two Jade Leeches: {G}{G} more", () => {
    const { s, ap, ids } = setup([greenBear()]);
    putOnBattlefield(s, ap, jadeLeech);
    putOnBattlefield(s, ap, jadeLeech);
    const taps = planCast(s, ap, ids[0]!)!.filter((a) => a.type === "activateMana");
    expect(taps).toHaveLength(4);
    expect(taps.filter((a) => a.type === "activateMana" && a.mana === "G").length).toBeGreaterThanOrEqual(3);
  });
});

const dreamThief = card("Dream Thief", "Creature — Faerie Rogue", "{2}{U}", { cmc: 3, power: "2", toughness: "1", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, draw a card if you've cast another blue spell this turn." });
const talarasBattalion = card("Talara's Battalion", "Creature — Elf Warrior", "{1}{G}", { cmc: 2, power: "4", toughness: "3", keywords: ["Trample"], oracleText: "Cast this spell only if you've cast another green spell this turn.\nTrample" });
const kavuTitan = card("Kavu Titan", "Creature — Kavu", "{1}{G}", { cmc: 2, power: "2", toughness: "2", keywords: ["Kicker"], oracleText: "Kicker {2}{G} (You may pay an additional {2}{G} as you cast this spell.)\nIf this creature was kicked, it enters with three +1/+1 counters on it and with trample." });
const wretchedCamel = card("Wretched Camel", "Creature — Zombie Camel", "{1}{B}", { cmc: 2, power: "2", toughness: "1", oracleText: "When this creature dies, if you control a Desert or there is a Desert card in your graveyard, target player discards a card." });

describe("\"Another [color] spell this turn\" and other cards the round's templates cover", () => {
  it("are fully supported", () => supported(dreamThief, talarasBattalion, kavuTitan, wretchedCamel));

  it("Dream Thief doesn't count itself: no card alone, a card after another blue spell", () => {
    let { s, ap, ids } = setup([dreamThief]);
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    ({ s, ap, ids } = setup([blueBear(), dreamThief]));
    const hand2 = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(s.players[ap]!.hand.length).toBe(hand2 - 2 + 1);
  });

  it("Dream Thief after a green spell draws nothing", () => {
    let { s, ap, ids } = setup([greenBear(), dreamThief]);
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(s.players[ap]!.hand.length).toBe(hand - 2);
  });

  it("Talara's Battalion can be cast only after another green spell", () => {
    let { s, ap, ids } = setup([talarasBattalion, redBear(), greenBear()]);
    expect(planCast(s, ap, ids[0]!)).toBeNull();
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(planCast(s, ap, ids[0]!)).toBeNull();
    s = resolveAll(run(s, planCast(s, ap, ids[2]!)));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("battlefield");
  });

  it("Kavu Titan kicked: 5/5 trample", () => {
    let { s, ap, ids } = setup([kavuTitan]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { kicks: [0] })));
    expect(pt(s, ids[0]!)).toBe("5/5");
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Trample")).toBe(true);
  });

  it("Wretched Camel: a target player discards only with a Desert", () => {
    for (const withDesert of [false, true]) {
      const murder = card("Murder", "Instant", "{1}{B}{B}", { cmc: 3, oracleText: "Destroy target creature." });
      let { s, ap, ids, opp } = setup([murder]);
      const camel = putOnBattlefield(s, ap, wretchedCamel);
      if (withDesert) putOnBattlefield(s, ap, desert);
      const hand = s.players[opp]!.hand.length;
      s = run(s, planCast(s, ap, ids[0]!, [tgt(camel)]));
      for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
        if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [player(opp)] } as Action);
        else if (s.pending) s = botAnswer(s);
        else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
      expect(s.players[opp]!.hand.length).toBe(withDesert ? hand - 1 : hand);
    }
  });
});
