// Round 99: Kardur, Doomscourge and Maximum Carnage (goad's requirements without goading, for creatures that enter later
// too: rulings, CR 701.15b, 508.1d, 611.2c), Mechanized Production ("eight or more artifacts with the same name as one
// another", CR 201.2a), Kodama of the East Tree ("if it wasn't put onto the battlefield with this ability", CR 603.4).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { characteristics, compileCard, isFullySupported, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const kardur = card("Kardur, Doomscourge", "Legendary Creature — Demon Berserker", "{2}{B}{R}", { power: "4", toughness: "3", oracleText: "When Kardur enters, until your next turn, creatures your opponents control attack each combat if able and attack a player other than you if able.\nWhenever an attacking creature dies, each opponent loses 1 life and you gain 1 life." });
const carnage = card("Maximum Carnage", "Enchantment — Saga", "{4}{R}", { oracleText: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Until your next turn, each creature attacks each combat if able and attacks a player other than you if able.\nII — Add {R}{R}{R}.\nIII — This Saga deals 5 damage to each opponent." });
const production = card("Mechanized Production", "Enchantment — Aura", "{2}{U}{U}", { keywords: ["Enchant"], oracleText: "Enchant artifact you control\nAt the beginning of your upkeep, create a token that's a copy of enchanted artifact. Then if you control eight or more artifacts with the same name as one another, you win the game." });
const kodama = card("Kodama of the East Tree", "Legendary Creature — Spirit", "{4}{G}{G}", { power: "6", toughness: "6", keywords: ["Reach", "Partner"], oracleText: "Reach\nWhenever another permanent you control enters, if it wasn't put onto the battlefield with this ability, you may put a permanent card with equal or lesser mana value from your hand onto the battlefield.\nPartner (You can have two commanders if both have partner.)" });

const trinket = card("Trinket", "Artifact", "{1}");
const relic = card("Relic", "Artifact", "{3}");
const giant = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const ogre = card("Big Ogre", "Creature — Ogre", "{4}{R}", { power: "5", toughness: "5" });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const nextAfter = (s: GameState, p: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(p) + 1) % 4]!;
const name = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;

describe("round 99, first cards", () => {
  it("parse", () => {
    supported(kardur, carnage, production, kodama);
    expect(compileCard(kodama).triggers[0]?.ifCond).toEqual({ kind: "subjectPutBySelf", not: true });
  });

  it("Kardur: opponents' creatures must attack someone other than you until your next turn, those that enter later too, without being goaded", () => {
    const { s: s0, ap, ids } = setup([kardur]);
    const opp = nextAfter(s0, ap);
    const third = nextAfter(s0, opp);
    const early = putOnBattlefield(s0, opp, bear());
    let s = settle(cast(s0, ap, ids[0]!));
    // One that comes under the opponent's control after it resolved (rulings).
    const late = putOnBattlefield(s, opp, giant);
    expect(characteristics(s, s.objects[late]!).goadedBy).toEqual([ap]);
    expect(characteristics(s, s.objects[late]!).goaded).toBeUndefined();
    // Kardur's own controller's creatures aren't affected.
    expect(characteristics(s, s.objects[ids[0]!]!).attacksIfAble).toBe(false);
    s = passUntil(s, "declareAttackers", opp);
    expect(s.pending).toMatchObject({ kind: "declareAttackers", player: opp });
    expect(() => act(s, { type: "declareAttackers", player: opp, attacks: [] })).toThrow(/attacks each combat if able/);
    expect(() => act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: early, defender: third }, { attacker: late, defender: ap }] })).toThrow(/other than/);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: early, defender: third }, { attacker: late, defender: third }] });
    expect(s.objects[late]!.attacking).toBe(third);
    // It ends as Kardur's controller's next turn begins (CR 611.2b).
    s = passUntil(s, "main1", ap);
    expect(characteristics(s, s.objects[late]!).attacksIfAble).toBe(false);
  });

  it("Maximum Carnage: chapter I makes every creature attack, yours too this turn, but not you", () => {
    const { s: s0, ap, ids } = setup([carnage]);
    const mine = putOnBattlefield(s0, ap, bear());
    const opp = nextAfter(s0, ap);
    let s = settle(cast(s0, ap, ids[0]!));
    expect(characteristics(s, s.objects[mine]!).attacksIfAble).toBe(true);
    s = passUntil(s, "declareAttackers", ap);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [] })).toThrow(/attacks each combat if able/);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: mine, defender: opp }] });
    expect(s.objects[mine]!.attacking).toBe(opp);
  });

  it("Mechanized Production: a token copy each upkeep, and with eight artifacts sharing a name you win", () => {
    const { s: s0, ap } = setup([]);
    const host = putOnBattlefield(s0, ap, trinket);
    for (let i = 0; i < 6; i++) putOnBattlefield(s0, ap, trinket);
    // A Trinket that isn't an artifact doesn't count (rulings).
    const aura = putOnBattlefield(s0, ap, production);
    s0.objects[aura]!.attachedTo = host;
    let s = passUntil(s0, "upkeep", ap);
    s = settle(s);
    expect(s.battlefield.filter((id) => name(s, id) === "Trinket" && s.objects[id]!.isToken)).toHaveLength(1);
    // Seven non-token Trinkets plus the token: eight, as the ability resolves.
    expect(s.winner).toBe(ap);
  });

  it("Mechanized Production: seven artifacts with the same name don't win", () => {
    const { s: s0, ap } = setup([]);
    const host = putOnBattlefield(s0, ap, trinket);
    for (let i = 0; i < 5; i++) putOnBattlefield(s0, ap, trinket);
    putOnBattlefield(s0, ap, relic);
    const aura = putOnBattlefield(s0, ap, production);
    s0.objects[aura]!.attachedTo = host;
    let s = settle(passUntil(s0, "upkeep", ap));
    expect(s.battlefield.filter((id) => name(s, id) === "Trinket")).toHaveLength(7);
    expect(s.winner).toBeNull();
  });

  it("Kodama of the East Tree: a permanent entering puts one with equal or lesser mana value from your hand, which doesn't trigger it again", () => {
    const { s: s0, ap, ids } = setup([giant, relic, ogre, trinket]);
    putOnBattlefield(s0, ap, kodama);
    // The Giant (4) enters: the Relic (3) or the Trinket (1) can follow, not the Ogre (5).
    let s = cast(s0, ap, ids[0]!);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromHand: true, min: 0 });
    const cards = s.pending?.kind === "searchLibrary" ? s.pending.cards : [];
    // Of the four (the opening hand's Forests and Bears can follow too).
    expect(cards.filter((id) => ids.includes(id)).sort()).toEqual([ids[1]!, ids[3]!].sort());
    expect(cards.every((id) => ["Relic", "Trinket", "Forest", "Grizzly Bears"].includes(name(s, id)))).toBe(true);
    s = act(s, { type: "searchLibrary", player: ap, found: [ids[1]!] });
    s = settle(s);
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    // The Relic was put there with this ability: no trigger for it.
    expect(s.pending).toBeNull();
    expect(s.stack).toHaveLength(0);
    expect(s.objects[ids[3]!]!.zone).toBe("hand");
  });
});
