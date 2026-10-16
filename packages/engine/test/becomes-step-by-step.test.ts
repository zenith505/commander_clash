// Creatures that grow step by step with abilities that have no duration (Figure of Destiny, Ascendant Spirit, Warden of
// the First Tree, Evolved Sleeper): "~ becomes a Kithkin Spirit with base power and toughness 2/2" lasts until it
// leaves the battlefield (CR 611.2a, 400.7); new creature types replace its others, card types and supertypes stay
// (rulings); "If ~ is a Warrior, ..." checks its creature types as the ability resolves (CR 608.2c), however it got
// them, and does nothing otherwise.

import { describe, expect, it } from "vitest";
import { act, card, passAll, pt, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, botActions, characteristics, doesNothingNow, isFullySupported, objHasKeyword, type CardDef, type GameState, type PlayerId } from "../src";
import { addMana } from "../src/spend";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const figure = card("Figure of Destiny", "Creature — Kithkin", "{R/W}", { power: "1", toughness: "1", oracleText: "{R/W}: This creature becomes a Kithkin Spirit with base power and toughness 2/2.\n{R/W}{R/W}{R/W}: If this creature is a Spirit, it becomes a Kithkin Spirit Warrior with base power and toughness 4/4.\n{R/W}{R/W}{R/W}{R/W}{R/W}{R/W}: If this creature is a Warrior, it becomes a Kithkin Spirit Warrior Avatar with base power and toughness 8/8, flying, and first strike." });
const spirit = card("Ascendant Spirit", "Snow Creature — Spirit", "{U}", { power: "1", toughness: "1", oracleText: "{S}{S}: This creature becomes a Spirit Warrior with base power and toughness 2/3.\n{S}{S}{S}: If this creature is a Warrior, put a flying counter on it and it becomes a Spirit Warrior Angel with base power and toughness 4/4.\n{S}{S}{S}{S}: If this creature is an Angel, put two +1/+1 counters on it and it gains \"Whenever this creature deals combat damage to a player, draw a card.\"" });
const warden = card("Warden of the First Tree", "Creature — Human", "{G}", { power: "1", toughness: "1", oracleText: "{1}{W/B}: This creature becomes a Human Warrior with base power and toughness 3/3.\n{2}{W/B}{W/B}: If this creature is a Warrior, it becomes a Human Spirit Warrior with trample and lifelink.\n{3}{W/B}{W/B}{W/B}: If this creature is a Spirit, put five +1/+1 counters on it." });
const sleeper = card("Evolved Sleeper", "Creature — Human", "{B}", { power: "1", toughness: "1", oracleText: "{B}: This creature becomes a Human Cleric with base power and toughness 2/2.\n{1}{B}: If this creature is a Cleric, put a deathtouch counter on it and it becomes a Phyrexian Human Cleric with base power and toughness 3/3.\n{1}{B}{B}: If this creature is a Phyrexian, put a +1/+1 counter on it, then you draw a card and you lose 1 life." });
const dragonheart = card("Bogardan Dragonheart", "Creature — Human Shaman", "{2}{R}", { power: "2", toughness: "2", oracleText: "Sacrifice another creature: Until end of turn, this creature becomes a Dragon with base power and toughness 4/4, flying, and haste." });

/** Activate ability `index` of `id`, paying from a pool of `n` snow mana (or any mana the costs ask for), and let it resolve. */
function use(s: GameState, pid: PlayerId, id: string, index: number, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>, snow = false): GameState {
  for (const [m, n] of Object.entries(mana)) addMana(s, pid, Array(n).fill(m), snow ? { from: ["snow"] } : {});
  return passAll(act(s, { type: "activateAbility", player: pid, objectId: id, index }));
}
const subtypes = (s: GameState, id: string) => characteristics(s, s.objects[id]!).subtypes;

describe("becoming something else, step by step", () => {
  it("parses", () => supported(figure, spirit, warden, sleeper, dragonheart));

  it("Figure of Destiny: each step overwrites its types and base power and toughness; a later step checks its type as it resolves", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, figure);
    // Not a Warrior yet: the third ability does nothing.
    let s = use(s0, ap, f, 2, { R: 6 });
    expect(pt(s, f)).toBe("1/1");
    s = use(s, ap, f, 0, { R: 1 });
    expect(pt(s, f)).toBe("2/2");
    expect(subtypes(s, f)).toEqual(["Kithkin", "Spirit"]);
    s = use(s, ap, f, 1, { W: 3 });
    expect(pt(s, f)).toBe("4/4");
    s = use(s, ap, f, 2, { R: 6 });
    expect(pt(s, f)).toBe("8/8");
    expect(subtypes(s, f)).toEqual(["Kithkin", "Spirit", "Warrior", "Avatar"]);
    expect(objHasKeyword(s, s.objects[f]!, "Flying") && objHasKeyword(s, s.objects[f]!, "First strike")).toBe(true);
    // The first ability again: a 2/2 Kithkin Spirit that still has flying and first strike (rulings).
    s = use(s, ap, f, 0, { R: 1 });
    expect(pt(s, f)).toBe("2/2");
    expect(subtypes(s, f)).toEqual(["Kithkin", "Spirit"]);
    expect(objHasKeyword(s, s.objects[f]!, "Flying") && objHasKeyword(s, s.objects[f]!, "First strike")).toBe(true);
    // It lasts past the turn.
    s.effects.forEach((e) => expect(e.duration).toBe("game"));
  });

  it("Ascendant Spirit: snow mana pays; a flying counter, then two +1/+1 counters and a combat damage trigger for each activation", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, spirit);
    let s = use(s0, ap, a, 0, { U: 2 }, true);
    expect(pt(s, a)).toBe("2/3");
    expect(subtypes(s, a)).toEqual(["Spirit", "Warrior"]);
    expect(characteristics(s, s.objects[a]!).supertypes).toContain("Snow");
    s = use(s, ap, a, 1, { U: 3 }, true);
    expect(pt(s, a)).toBe("4/4");
    expect(s.objects[a]!.counters.flying).toBe(1);
    expect(objHasKeyword(s, s.objects[a]!, "Flying")).toBe(true);
    s = use(s, ap, a, 2, { U: 4 }, true);
    s = use(s, ap, a, 2, { U: 4 }, true);
    expect(pt(s, a)).toBe("8/8");
    expect(abilitiesOf(s, s.objects[a]!).triggers.filter((t) => t.event === "selfDealsCombatDamageToPlayer")).toHaveLength(2);
  });

  it("Ascendant Spirit can't be paid with mana that isn't snow mana", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, spirit);
    addMana(s0, ap, ["U", "U"], {});
    expect(() => act(s0, { type: "activateAbility", player: ap, objectId: a, index: 0 })).toThrow();
  });

  it("Warden of the First Tree: trample and lifelink as a Spirit Warrior, then five counters", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, warden);
    let s = use(s0, ap, w, 0, { W: 2 });
    s = use(s, ap, w, 1, { W: 4 });
    expect(pt(s, w)).toBe("3/3");
    expect(subtypes(s, w)).toEqual(["Human", "Spirit", "Warrior"]);
    expect(objHasKeyword(s, s.objects[w]!, "Trample") && objHasKeyword(s, s.objects[w]!, "Lifelink")).toBe(true);
    s = use(s, ap, w, 2, { W: 6 });
    expect(pt(s, w)).toBe("8/8");
  });

  it("Evolved Sleeper: a deathtouch counter as it becomes a Phyrexian, then a counter, a card and 1 life", () => {
    const { s: s0, ap } = setup([]);
    const e = putOnBattlefield(s0, ap, sleeper);
    let s = use(s0, ap, e, 0, { B: 1 });
    s = use(s, ap, e, 1, { B: 2 });
    expect(pt(s, e)).toBe("3/3");
    expect(s.objects[e]!.counters.deathtouch).toBe(1);
    const hand = s.players[ap]!.hand.length;
    const life = s.players[ap]!.life;
    s = use(s, ap, e, 2, { B: 3 });
    expect(pt(s, e)).toBe("4/4");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.players[ap]!.life).toBe(life - 1);
  });

  it("bots don't pay for a step that does nothing or would shrink it", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, figure);
    const third = abilitiesOf(s0, s0.objects[f]!).activated[2]!.body;
    expect(doesNothingNow(s0, f, third)).toBe(true);
    let s = use(s0, ap, f, 0, { R: 1 });
    s = use(s, ap, f, 1, { W: 3 });
    expect(doesNothingNow(s, f, third)).toBe(false);
    // A 4/4 Warrior with lots of lands: the bot goes for the 8/8, never back to 2/2.
    s.players[ap]!.isBot = true;
    const acts = botActions(s, ap).filter((a) => a.type === "activateAbility" && a.objectId === f);
    expect(acts.map((a) => (a as { index: number }).index)).not.toContain(0);
  });
});
