// "Whenever ~ becomes tapped" (CR 701.26a): only a change from untapped to tapped, for any reason (rulings: tapping
// a tapped permanent, or one entering tapped, doesn't count).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, waitingOn, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const cityOfBrass = card("City of Brass", "Land", "", { oracleText: "Whenever this land becomes tapped, it deals 1 damage to you.\n{T}: Add one mana of any color." });
const emmara = card("Emmara, Soul of the Accord", "Legendary Creature — Elf Cleric", "{G}{W}", { power: "2", toughness: "2", oracleText: "Whenever Emmara becomes tapped, create a 1/1 white Soldier creature token with lifelink." });
const insolence = card("Insolence", "Enchantment — Aura", "{2}{R}", { keywords: ["Enchant"], oracleText: "Enchant creature\nWhenever enchanted creature becomes tapped, this Aura deals 2 damage to that creature's controller." });
const lifetap = card("Lifetap", "Enchantment", "{U}{U}", { oracleText: "Whenever a Forest an opponent controls becomes tapped, you gain 1 life." });
const royalDecree = card("Royal Decree", "Enchantment", "{2}{W}{W}", {
  oracleText: "Cumulative upkeep {W}\nWhenever a Swamp, Mountain, black permanent, or red permanent becomes tapped, this enchantment deals 1 damage to that permanent's controller.",
});
const vigilant = card("Serra Angel", "Creature — Angel", "{3}{W}{W}", { power: "4", toughness: "4", keywords: ["Flying", "Vigilance"], oracleText: "Flying, vigilance" });

const settle = (s: GameState) => {
  for (let i = 0; i < 20 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const named = (s: GameState, name: string) => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === name);

describe("becomes tapped (CR 701.26a)", () => {
  it("compile; a filter that's a color in only some of its alternatives too (Royal Decree, since round B111)", () => {
    supported(cityOfBrass, emmara, insolence, lifetap);
    // Royal Decree's "a Swamp, Mountain, black permanent, or red permanent" compiles since round B111 (laneb-round111.test.ts).
    expect(isFullySupported(royalDecree)).toBe(true);
  });

  it("City of Brass: tapped for mana, it deals 1 damage to you after the mana ability", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, cityOfBrass);
    const life = s0.players[ap]!.life;
    let s = act(s0, { type: "activateMana", player: ap, objectId: c, mana: "R" });
    expect(s.players[ap]!.manaPool.R).toBe(1);
    s = settle(s);
    expect(s.players[ap]!.life).toBe(life - 1);
  });

  it("attacking taps it; with vigilance, nothing triggers", () => {
    const { s: s0, ap } = setup([]);
    const e = putOnBattlefield(s0, ap, emmara);
    const v = putOnBattlefield(s0, ap, card("Accord Sentry", "Creature — Elf Soldier", "{G}{W}", { power: "2", toughness: "2", keywords: ["Vigilance"], oracleText: "Vigilance\nWhenever this creature becomes tapped, create a 1/1 white Soldier creature token with lifelink." }));
    let s = passUntil(s0, "declareAttackers", ap);
    const opp = s.turnOrder.find((p) => p !== ap)!;
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: e, defender: opp }, { attacker: v, defender: opp }] });
    s = settle(s);
    expect(named(s, "Soldier Token")).toHaveLength(1);
  });

  it("an Aura's 'enchanted creature becomes tapped', and 'a Forest an opponent controls'", () => {
    const { s: s0, ap, opp } = setup([]);
    const bear = putOnBattlefield(s0, opp, emmara);
    const aura = putOnBattlefield(s0, ap, insolence);
    s0.objects[aura]!.attachedTo = bear;
    putOnBattlefield(s0, ap, lifetap);
    const forest = putOnBattlefield(s0, opp, card("Forest", "Basic Land — Forest"));
    let s = passUntil(s0, "main1", opp);
    const oppLife = s.players[opp]!.life;
    const myLife = s.players[ap]!.life;
    s = act(s, { type: "activateMana", player: opp, objectId: forest, mana: "G" });
    s = passUntil(s, "declareAttackers", opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: bear, defender: ap }] });
    s = settle(s);
    expect(s.players[opp]!.life).toBe(oppLife - 2);
    expect(s.players[ap]!.life).toBeGreaterThanOrEqual(myLife + 1);
  });
});
