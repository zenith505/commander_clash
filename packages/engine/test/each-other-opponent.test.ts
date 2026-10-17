// "Whenever ~ deals combat damage to an opponent, it deals that much damage to each other opponent" (Hydra Omnivore,
// Grenzo's Ruffians, Amarant Coral), from a commander you control (Kediss) or an enchanted creature (Super State): the
// creature deals it, noncombat damage that doesn't trigger the ability again (rulings), to each opponent but the one hit.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) =>
  settle(passUntil(settle(act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks })), "endCombat"));

// Real oracle text (Scryfall).
const hydra = card("Hydra Omnivore", "Creature — Hydra", "{4}{G}{G}", { power: "8", toughness: "8", oracleText: "Whenever this creature deals combat damage to an opponent, it deals that much damage to each other opponent." });
const ruffians = card("Grenzo's Ruffians", "Creature — Goblin", "{2}{R}{R}", { power: "2", toughness: "2", keywords: ["Melee"], oracleText: "Melee (Whenever this creature attacks, it gets +1/+1 until end of turn for each opponent you attacked this combat.)\nWhenever this creature deals combat damage to an opponent, it deals that much damage to each other opponent." });
const coral = card("Amarant Coral", "Legendary Creature — Human Monk", "{2}{R}{G}", { power: "5", toughness: "4", keywords: ["No Mercy", "Trample"], oracleText: "Trample\nAmarant Coral attacks each combat if able.\nNo Mercy — Whenever Amarant Coral deals combat damage to an opponent, it deals that much damage to each other opponent." });
const kediss = card("Kediss, Emberclaw Familiar", "Legendary Creature — Elemental Lizard", "{1}{R}", { power: "1", toughness: "1", keywords: ["Partner"], oracleText: "Whenever a commander you control deals combat damage to an opponent, it deals that much damage to each other opponent.\nPartner (You can have two commanders if both have partner.)" });
const superState = card("Super State", "Legendary Enchantment — Aura", "{7}", { keywords: ["First strike", "Trample", "Enchant"], oracleText: "Enchant creature you control\nEnchanted creature has base power and toughness 9/9 and has flying, first strike, trample, and haste.\nWhenever enchanted creature deals combat damage to an opponent, it deals that much damage to each other opponent." });
const general = card("Isamaru, Hound of Konda", "Legendary Creature — Dog", "{W}", { power: "2", toughness: "2", oracleText: "" });
const lifelinker = card("Vampire Nighthawk", "Creature — Vampire Shaman", "{1}{B}{B}", { power: "2", toughness: "3", keywords: ["Flying", "Deathtouch", "Lifelink"], oracleText: "Flying\nDeathtouch\nLifelink" });
const bears = card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2", oracleText: "" });

describe("damage to each other opponent", () => {
  it("compiles", () => supported(hydra, ruffians, coral, kediss, superState));

  it("Hydra Omnivore: 8 combat damage to one opponent, then 8 to each of the others, which doesn't trigger again", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, hydra);
    const others = s0.turnOrder.filter((p) => p !== ap && p !== opp);
    const s = attack(s0, ap, [{ attacker: h, defender: opp }]);
    expect(s.players[opp]!.life).toBe(32);
    for (const p of others) expect(s.players[p]!.life).toBe(32);
    expect(s.players[ap]!.life).toBe(40);
    expect(s.stack.length + s.triggerQueue.length).toBe(0);
  });

  it("Grenzo's Ruffians: its melee-pumped damage to each opponent but the one it hit", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, ruffians);
    const others = s0.turnOrder.filter((p) => p !== ap && p !== opp);
    const s = attack(s0, ap, [{ attacker: r, defender: opp }]);
    // 2/2 plus 1 for the one opponent attacked.
    expect(s.players[opp]!.life).toBe(37);
    for (const p of others) expect(s.players[p]!.life).toBe(37);
  });

  it("Kediss: a commander you control deals that much damage to each other opponent; not commander combat damage", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, kediss);
    const g = putOnBattlefield(s0, ap, general, { commander: true });
    const b = putOnBattlefield(s0, ap, bears);
    const others = s0.turnOrder.filter((p) => p !== ap && p !== opp);
    const s = attack(s0, ap, [{ attacker: g, defender: opp }, { attacker: b, defender: others[0]! }]);
    // Isamaru's 2 to opp, then 2 to each other opponent. The Bears' 2 to others[0] is no commander's: no trigger.
    expect(s.players[opp]!.life).toBe(38);
    expect(s.players[others[0]!]!.life).toBe(36);
    expect(s.players[others[1]!]!.life).toBe(38);
    // Only the combat damage counts toward commander damage (CR 903.10a).
    expect(s.players[opp]!.commanderDamage[g] ?? 0).toBe(2);
    expect(s.players[others[1]!]!.commanderDamage[g] ?? 0).toBe(0);
  });

  it("Super State: the enchanted creature deals the damage, so its lifelink gains life for all of it", () => {
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, ap, lifelinker);
    const aura = putOnBattlefield(s0, ap, superState);
    s0.objects[aura]!.attachedTo = v;
    const others = s0.turnOrder.filter((p) => p !== ap && p !== opp);
    const s = attack(s0, ap, [{ attacker: v, defender: opp }]);
    expect(s.players[opp]!.life).toBe(31);
    for (const p of others) expect(s.players[p]!.life).toBe(31);
    // 9 combat damage, then 9 to each of two others, all from the lifelinking creature.
    expect(s.players[ap]!.life).toBe(40 + 27);
  });

  it("an opponent who has left the game isn't dealt damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, hydra);
    const others = s0.turnOrder.filter((p) => p !== ap && p !== opp);
    s0.players[others[0]!]!.lost = true;
    const s = attack(s0, ap, [{ attacker: h, defender: opp }]);
    expect(s.players[others[1]!]!.life).toBe(32);
    expect(s.players[others[0]!]!.life).toBe(40);
  });
});
