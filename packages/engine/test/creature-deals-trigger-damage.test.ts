// "It deals damage equal to its power to any target" after "Whenever a creature you control enters" (Warstorm Surge),
// "dies" (Stalking Vengeance), "is dealt damage" (Spiteful Shadows, Fiendlash), "becomes tapped" (Hawkeye's Bow):
// the creature is the source of the damage, so its lifelink, deathtouch and infect apply, as it last existed if it has
// left the battlefield (rulings on Warstorm Surge, Electropotence, Fiendlash; CR 608.2h). The ability's own source is
// still what targets (rulings: Warstorm Surge's ability can't target a creature with protection from red).

import { describe, expect, it } from "vitest";
import { act, addEffect, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, waitingOn, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
/** On through combat until a trigger asks for its targets. */
const untilTargets = (s: GameState) => {
  for (let i = 0; i < 200 && s.pending?.kind !== "chooseTargets" && s.step !== "end"; i++)
    s = s.pending?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] }) : act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

// Real oracle text (Scryfall).
const surge = card("Warstorm Surge", "Enchantment", "{5}{R}", { oracleText: "Whenever a creature you control enters, it deals damage equal to its power to any target." });
const vengeance = card("Stalking Vengeance", "Creature — Avatar", "{5}{R}{R}", { power: "5", toughness: "5", keywords: ["Haste"], oracleText: "Haste\nWhenever another creature you control dies, it deals damage equal to its power to target player or planeswalker." });
const shadows = card("Spiteful Shadows", "Enchantment — Aura", "{1}{B}", { keywords: ["Enchant"], oracleText: "Enchant creature\nWhenever enchanted creature is dealt damage, it deals that much damage to its controller." });
const bow = card("Hawkeye's Bow", "Artifact — Equipment", "{1}", { keywords: ["Equip"], oracleText: "Equipped creature gets +1/+0 and has reach.\nWhenever equipped creature becomes tapped, it deals 1 damage to each opponent.\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)" });
const beast = card("Questing Beast", "Legendary Creature — Beast", "{2}{G}{G}", { power: "4", toughness: "4", keywords: ["Vigilance", "Deathtouch", "Haste"], oracleText: "Vigilance, deathtouch, haste\nQuesting Beast can't be blocked by creatures with power 2 or less.\nCombat damage that would be dealt by creatures you control can't be prevented.\nWhenever Questing Beast deals combat damage to an opponent, it deals that much damage to target planeswalker that player controls." });
const belakortheDarkMaster = card("Be'lakor, the Dark Master", "Legendary Creature — Demon Noble", "{3}{U}{B}{R}", {"power":"6","toughness":"5","keywords":["Flying","Prince of Chaos","Lord of Torment"],"oracleText":"Flying\nPrince of Chaos — When Be'lakor enters, you draw X cards and you lose X life, where X is the number of Demons you control.\nLord of Torment — Whenever another Demon you control enters, it deals damage equal to its power to any target."});
const blazingSunsteel = card("Blazing Sunsteel", "Artifact — Equipment", "{1}{R}", {"keywords":["Equip"],"oracleText":"Equipped creature gets +1/+0 for each opponent you have.\nWhenever equipped creature is dealt damage, it deals that much damage to any target.\nEquip {4}"});
const dragonTempest = card("Dragon Tempest", "Enchantment", "{1}{R}", {"oracleText":"Whenever a creature you control with flying enters, it gains haste until end of turn.\nWhenever a Dragon you control enters, it deals X damage to any target, where X is the number of Dragons you control."});
const electropotence = card("Electropotence", "Enchantment", "{2}{R}", {"oracleText":"Whenever a creature you control enters, you may pay {2}{R}. If you do, that creature deals damage equal to its power to any target."});
const extraArms = card("Extra Arms", "Enchantment — Aura", "{4}{R}", {"keywords":["Enchant"],"oracleText":"Enchant creature\nWhenever enchanted creature attacks, it deals 2 damage to any target."});
const fiendlash = card("Fiendlash", "Artifact — Equipment", "{1}{R}", {"keywords":["Equip"],"oracleText":"Equipped creature gets +2/+0 and has reach.\nWhenever equipped creature is dealt damage, it deals damage equal to its power to target player or planeswalker.\nEquip {2}{R}"});
const ingrisStingerquill = card("Ingris Stingerquill", "Legendary Creature — Elder Sphinx", "{B}{R}{R}", {"power":"1","toughness":"4","keywords":["Flying"],"oracleText":"Flying\nWhenever a creature you control attacks, that creature deals 1 damage to each opponent.\n{4}: Create a 2/2 colorless Wizard Soldier creature token named Cadet. Then creatures you control gain haste until end of turn."});
const pyrogoyf = card("Pyrogoyf", "Creature — Lhurgoyf", "{3}{R}", {"power":"*","toughness":"1+*","oracleText":"Pyrogoyf's power is equal to the number of card types among cards in all graveyards and its toughness is equal to that number plus 1.\nWhenever this creature or another Lhurgoyf creature you control enters, that creature deals damage equal to its power to any target."});
const scourgeofValkas = card("Scourge of Valkas", "Creature — Dragon", "{2}{R}{R}{R}", {"power":"4","toughness":"4","keywords":["Flying"],"oracleText":"Flying\nWhenever this creature or another Dragon you control enters, it deals X damage to any target, where X is the number of Dragons you control.\n{R}: This creature gets +1/+0 until end of turn."});
const tormentorsHelm = card("Tormentor's Helm", "Artifact — Equipment", "{R}", {"keywords":["Equip"],"oracleText":"Equipped creature gets +1/+1.\nWhenever equipped creature becomes blocked, it deals 1 damage to defending player.\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)"});
const aetherCharge = card("Aether Charge", "Enchantment", "{4}{R}", {"oracleText":"Whenever a Beast you control enters, you may have it deal 4 damage to target opponent or planeswalker."});
const blackWidowIntelExpert = card("Black Widow, Intel Expert", "Legendary Creature — Human Spy Hero", "{2}{W}", {"power":"3","toughness":"3","keywords":["First strike"],"oracleText":"First strike\nWhenever Black Widow deals combat damage to an opponent, you and that player each draw two cards."});
const mindscourDragon = card("Mindscour Dragon", "Creature — Dragon", "{4}{U}{U}", {"power":"4","toughness":"4","keywords":["Flying","Mill"],"oracleText":"Flying\nWhenever this creature deals combat damage to an opponent, target player mills four cards."});
const nighthawk = card("Vampire Nighthawk", "Creature — Vampire Shaman", "{1}{B}{B}", { power: "2", toughness: "3", keywords: ["Flying", "Deathtouch", "Lifelink"], oracleText: "Flying\nDeathtouch\nLifelink" });
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3", oracleText: "" });
const walker = card("Jace Beleren", "Legendary Planeswalker — Jace", "{1}{U}{U}", { loyalty: "3", oracleText: "+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards." });

describe("a creature deals its trigger's damage", () => {
  it("compiles", () => supported(surge, vengeance, shadows, bow, beast, belakortheDarkMaster, blazingSunsteel, dragonTempest, electropotence, extraArms, fiendlash, ingrisStingerquill, pyrogoyf, scourgeofValkas, tormentorsHelm, aetherCharge, blackWidowIntelExpert, mindscourDragon));

  it("Warstorm Surge: the creature that entered deals the damage, so its lifelink gains you life", () => {
    const { s: s0, ap, ids, opp } = setup([nighthawk]);
    putOnBattlefield(s0, ap, surge);
    let s = cast(s0, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.life).toBe(38);
    expect(s.players[ap]!.life).toBe(42);
  });

  it("Fiendlash: the equipped creature dealt damage deals damage equal to its power", () => {
    const { s: s0, ap, ids, opp } = setup([shock]);
    const g = putOnBattlefield(s0, ap, giant);
    const lash = putOnBattlefield(s0, ap, fiendlash);
    s0.objects[lash]!.attachedTo = g;
    let s = cast(s0, ap, ids[0]!, [target(g)]);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    // Hill Giant is 5/3 with Fiendlash.
    expect(s.players[opp]!.life).toBe(35);
  });

  it("Stalking Vengeance: the creature that died deals damage equal to its power, as it last existed, with its lifelink", () => {
    const { s: s0, ap, ids, opp } = setup([murder]);
    putOnBattlefield(s0, ap, vengeance);
    // Lifelink it has only from an effect: the creature as it last existed (CR 608.2h).
    const hawk = putOnBattlefield(s0, ap, giant);
    addEffect(s0, ap, [hawk], [{ kind: "modifyPT", power: 1, toughness: 0 }, { kind: "addKeywords", keywords: ["Lifelink"] }]);
    let s = cast(s0, ap, ids[0]!, [target(hawk)]);
    expect(s.objects[hawk]!.zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    // A 4/3 with lifelink as it died.
    expect(s.players[opp]!.life).toBe(36);
    expect(s.players[ap]!.life).toBe(44);
  });

  it("Spiteful Shadows: the enchanted creature deals the damage to its controller", () => {
    const { s: s0, ap, ids, opp } = setup([shock]);
    const g = putOnBattlefield(s0, opp, giant);
    const aura = putOnBattlefield(s0, ap, shadows);
    s0.objects[aura]!.attachedTo = g;
    const s = settle(cast(s0, ap, ids[0]!, [target(g)]));
    expect(s.players[opp]!.life).toBe(38);
    expect(s.players[ap]!.life).toBe(40);
  });

  it("Questing Beast: that much damage to a planeswalker the opponent it hit controls", () => {
    const { s: s0, ap, opp } = setup([]);
    const qb = putOnBattlefield(s0, ap, beast);
    const pw = putOnBattlefield(s0, opp, walker);
    s0.objects[pw]!.counters.loyalty = 6;
    let s = untilTargets(act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: qb, defender: opp }] }));
    expect(s.players[opp]!.life).toBe(36);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(pw)] }));
    // 4 deathtouch damage to a planeswalker removes 4 loyalty (CR 120.3c); deathtouch does nothing more to it.
    expect(s.objects[pw]!.counters.loyalty).toBe(2);
  });
});
