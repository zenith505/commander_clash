// Exhaust (CR 702.177a): "Exhaust — [Cost]: [Effect]" means "[Cost]: [Effect]. Activate only once." Each exhaust
// ability once, for as long as it's the same object (CR 400.7). Boast (CR 702.142a): "Boast — [Cost]: [Effect]" means
// "... Activate only if this creature attacked this turn and only once each turn."

import { describe, expect, it } from "vitest";
import { act, card, passAll, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { compileCard, isFullySupported, type CardDef, type GameState, type ManaType, type PlayerId } from "../src";
import { addMana } from "../src/spend";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const prowcatcher = card("Prowcatcher Specialist", "Creature — Goblin Warrior", "{R}", { power: "1", toughness: "1", keywords: ["Haste"], oracleText: "Haste\nExhaust — {3}{R}: Put two +1/+1 counters on this creature. (Activate each exhaust ability only once.)" });
const engineer = card("Draconautics Engineer", "Creature — Goblin Artificer", "{1}{R}", { power: "2", toughness: "1", oracleText: "Exhaust — {R}: Other creatures you control gain haste until end of turn. Put a +1/+1 counter on this creature. (Activate each exhaust ability only once.)\nExhaust — {3}{R}: Create a 4/4 red Dinosaur Dragon creature token with flying." });
const pup = card("Fearless Pup", "Creature — Wolf", "{R}", { power: "1", toughness: "1", keywords: ["First strike"], oracleText: "First strike\nBoast — {2}{R}: This creature gets +2/+0 until end of turn. (Activate only if this creature attacked this turn and only once each turn.)" });
const peema = card("Peema Trailblazer", "Creature — Elephant Warrior", "{4}{G}", { power: "5", toughness: "5", keywords: ["Trample"], oracleText: "Trample\nWhenever this creature deals combat damage to a player, you get that many {E} (energy counters).\nExhaust — Pay six {E}: Put two +1/+1 counters on this creature. Then draw cards equal to the greatest power among creatures you control. (Activate each exhaust ability only once.)" });
const tuskeri = card("Tuskeri Firewalker", "Creature — Human Berserker", "{2}{R}", { power: "3", toughness: "2", oracleText: "Boast — {1}: Exile the top card of your library. You may play that card this turn. (Activate only if this creature attacked this turn and only once each turn.)" });

function use(s: GameState, pid: PlayerId, id: string, index: number, mana: ManaType[]): GameState {
  addMana(s, pid, mana, {});
  return passAll(act(s, { type: "activateAbility", player: pid, objectId: id, index }));
}
const tryUse = (s: GameState, pid: PlayerId, id: string, index: number, mana: ManaType[]) => () => {
  addMana(s, pid, mana, {});
  act(s, { type: "activateAbility", player: pid, objectId: id, index });
};

describe("exhaust and boast", () => {
  it("parse", () => {
    supported(prowcatcher, engineer, pup, peema, tuskeri);
    expect(compileCard(prowcatcher).activated[0]).toMatchObject({ onceEver: true, keyword: "Exhaust", manaCost: "{3}{R}" });
    expect(compileCard(pup).activated[0]).toMatchObject({ oncePerTurn: true, keyword: "Boast", activateIf: { kind: "self", is: "attackedThisTurn" } });
  });

  it("exhaust: once only, even on a later turn", () => {
    const { s: s0, ap } = setup([]);
    const p = putOnBattlefield(s0, ap, prowcatcher);
    let s = use(s0, ap, p, 0, ["R", "C", "C", "C"]);
    expect(pt(s, p)).toBe("3/3");
    expect(tryUse(s, ap, p, 0, ["R", "C", "C", "C"])).toThrow(/only once/);
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    s.players[ap]!.manaLots = [];
    // Its next turn: still not again.
    const next = passUntil(passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]), "main1", ap);
    expect(next.turn).toBeGreaterThan(s.turn);
    expect(tryUse(next, ap, p, 0, ["R", "C", "C", "C"])).toThrow(/only once/);
  });

  it("exhaust: each exhaust ability once, independently", () => {
    const { s: s0, ap } = setup([]);
    const e = putOnBattlefield(s0, ap, engineer);
    let s = use(s0, ap, e, 0, ["R"]);
    expect(tryUse(s, ap, e, 0, ["R"])).toThrow(/only once/);
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    s.players[ap]!.manaLots = [];
    s = use(s, ap, e, 1, ["R", "C", "C", "C"]);
    expect(s.battlefield.some((id) => s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]!.typeLine.includes("Dragon"))).toBe(true);
  });

  it("exhaust: a new object (it left the battlefield and came back) can activate it again (CR 400.7)", () => {
    const { s: s0, ap } = setup([]);
    const p = putOnBattlefield(s0, ap, prowcatcher);
    let s = use(s0, ap, p, 0, ["R", "C", "C", "C"]);
    expect(s.objects[p]!.activatedEver).toEqual([0]);
    // Bounced and recast: a new object.
    s.battlefield.splice(s.battlefield.indexOf(p), 1);
    s.objects[p]!.zone = "hand";
    s.players[ap]!.hand.push(p);
    addMana(s, ap, ["R"], {});
    s = passAll(act(s, { type: "castSpell", player: ap, objectId: p }));
    expect(s.objects[p]!.zone).toBe("battlefield");
    expect(s.objects[p]!.activatedEver).toBeUndefined();
    s = use(s, ap, p, 0, ["R", "C", "C", "C"]);
    expect(pt(s, p)).toBe("3/3");
  });

  it("exhaust with an energy cost: Peema Trailblazer", () => {
    const { s: s0, ap } = setup([]);
    const p = putOnBattlefield(s0, ap, peema);
    s0.players[ap]!.energy = 12;
    const hand = s0.players[ap]!.hand.length;
    let s = passAll(act(s0, { type: "activateAbility", player: ap, objectId: p, index: 0 }));
    expect(pt(s, p)).toBe("7/7");
    expect(s.players[ap]!.hand.length).toBe(hand + 7);
    expect(s.players[ap]!.energy).toBe(6);
    expect(() => act(s, { type: "activateAbility", player: ap, objectId: p, index: 0 })).toThrow(/only once/);
  });

  it("boast: only after it attacked this turn, and once each turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const p = putOnBattlefield(s0, ap, pup);
    expect(tryUse(s0, ap, p, 0, ["R", "C", "C"])).toThrow(/can't be activated now/);
    s0.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    s0.players[ap]!.manaLots = [];
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: p, defender: opp }] });
    expect(s.objects[p]!.attacked?.turn).toBe(s.turn);
    for (let i = 0; i < 10 && s.priority !== ap; i++) s = act(s, { type: "passPriority", player: s.priority! });
    s = use(s, ap, p, 0, ["R", "C", "C"]);
    expect(pt(s, p)).toBe("3/1");
    expect(tryUse(s, ap, p, 0, ["R", "C", "C"])).toThrow(/only once each turn/);
  });
});
