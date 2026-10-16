// "Activate only once." (CR 602.5b): once for as long as it's the same object (CR 400.7, rulings on Haunted Screen and
// Duggan). Elvish Refueler (CR 702.177b): during your turn, as long as you haven't activated an exhaust ability this
// turn, exhaust abilities can be activated as though they hadn't been.

import { describe, expect, it } from "vitest";
import { act, card, passAll, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { characteristics, compileCard, isFullySupported, type CardDef, type GameState, type ManaType, type PlayerId } from "../src";
import { addMana } from "../src/spend";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const screen = card("Haunted Screen", "Artifact", "{3}", { oracleText: "{T}: Add {W} or {B}.\n{T}, Pay 1 life: Add {G}, {U}, or {R}.\n{7}: Put seven +1/+1 counters on this artifact. It becomes a 0/0 Spirit creature in addition to its other types. Activate only once." });
const librarian = card("Mild-Mannered Librarian", "Creature — Human", "{G}", { power: "1", toughness: "1", oracleText: "{3}{G}: This creature becomes a Werewolf. Put two +1/+1 counters on it and you draw a card. Activate only once." });
const goat = card("Possessed Goat", "Creature — Goat", "{W}", { power: "1", toughness: "1", oracleText: "{3}, Discard a card: Put three +1/+1 counters on this creature and it becomes a black Demon in addition to its other colors and types. Activate only once." });
const duggan = card("Duggan, Private Detective", "Legendary Creature — Human Detective", "{2}{G}{U}", { power: "*", toughness: "*", oracleText: "Duggan's power and toughness are each equal to the number of cards in your hand.\nAt the beginning of your end step, investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")\nThe Most Important Punch in History — {1}{G}, {T}: Duggan deals damage equal to twice its power to another target creature. Activate only once." });
const refueler = card("Elvish Refueler", "Creature — Elf Druid", "{2}{G}", { power: "2", toughness: "3", oracleText: "During your turn, as long as you haven't activated an exhaust ability this turn, you may activate exhaust abilities as though they haven't been activated.\nExhaust — {1}{G}: Put a +1/+1 counter on this creature. (Activate each exhaust ability only once.)" });
const prowcatcher = card("Prowcatcher Specialist", "Creature — Goblin Warrior", "{R}", { power: "1", toughness: "1", keywords: ["Haste"], oracleText: "Haste\nExhaust — {3}{R}: Put two +1/+1 counters on this creature. (Activate each exhaust ability only once.)" });

const clear = (s: GameState, pid: PlayerId) => {
  s.players[pid]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  s.players[pid]!.manaLots = [];
};
function use(s: GameState, pid: PlayerId, id: string, index: number, mana: ManaType[], costs?: object): GameState {
  addMana(s, pid, mana, {});
  s = passAll(act(s, { type: "activateAbility", player: pid, objectId: id, index, ...(costs ? { costs } : {}) }));
  clear(s, pid);
  return s;
}
const tryUse = (s: GameState, pid: PlayerId, id: string, index: number, mana: ManaType[]) => () => {
  addMana(s, pid, mana, {});
  act(s, { type: "activateAbility", player: pid, objectId: id, index });
};
const nextOwnTurn = (s: GameState, pid: PlayerId) => passUntil(passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]), "main1", pid);

describe("activate only once", () => {
  it("parse", () => {
    supported(screen, librarian, goat, duggan, refueler);
    expect(compileCard(screen).activated[0]).toMatchObject({ onceEver: true, manaCost: "{7}" });
    expect(compileCard(screen).activated[0]!.keyword).toBeUndefined();
    expect(compileCard(refueler).exhaustAgain).toBe(true);
  });

  it("Haunted Screen: seven counters and a 0/0 Spirit artifact creature, once only, also on a later turn", () => {
    const { s: s0, ap } = setup([]);
    const h = putOnBattlefield(s0, ap, screen);
    let s = use(s0, ap, h, 0, ["C", "C", "C", "C", "C", "C", "C"]);
    const c = characteristics(s, s.objects[h]!);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(c.subtypes).toContain("Spirit");
    expect(pt(s, h)).toBe("7/7");
    expect(tryUse(s, ap, h, 0, ["C", "C", "C", "C", "C", "C", "C"])).toThrow(/only once/);
    clear(s, ap);
    s = nextOwnTurn(s, ap);
    expect(tryUse(s, ap, h, 0, ["C", "C", "C", "C", "C", "C", "C"])).toThrow(/only once/);
  });

  it("Mild-Mannered Librarian: a Werewolf and no longer a Human, two counters, a card", () => {
    const { s: s0, ap } = setup([]);
    const l = putOnBattlefield(s0, ap, librarian);
    const hand = s0.players[ap]!.hand.length;
    const s = use(s0, ap, l, 0, ["G", "C", "C", "C"]);
    expect(characteristics(s, s.objects[l]!).subtypes).toEqual(["Werewolf"]);
    expect(pt(s, l)).toBe("3/3");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(tryUse(s, ap, l, 0, ["G", "C", "C", "C"])).toThrow(/only once/);
  });

  it("Possessed Goat: a black Demon that's still a white Goat, with three counters", () => {
    const { s: s0, ap, ids } = setup([card("Spare", "Sorcery", "{1}")]);
    const g = putOnBattlefield(s0, ap, goat);
    const s = use(s0, ap, g, 0, ["C", "C", "C"], { discard: [ids[0]!] });
    const c = characteristics(s, s.objects[g]!);
    expect(c.subtypes).toEqual(expect.arrayContaining(["Goat", "Demon"]));
    expect(c.colors).toEqual(expect.arrayContaining(["W", "B"]));
    expect(pt(s, g)).toBe("4/4");
  });

  it("Elvish Refueler: an exhaust ability again on your turn, but only one exhaust activation that turn", () => {
    const { s: s0, ap } = setup([]);
    const p = putOnBattlefield(s0, ap, prowcatcher);
    let s = use(s0, ap, p, 0, ["R", "C", "C", "C"]);
    expect(pt(s, p)).toBe("3/3");
    // Its next turn, with Refueler out: Prowcatcher's exhaust ability can be activated again, once.
    s = nextOwnTurn(s, ap);
    const r = putOnBattlefield(s, ap, refueler);
    s = use(s, ap, p, 0, ["R", "C", "C", "C"]);
    expect(pt(s, p)).toBe("5/5");
    // This turn an exhaust ability was activated: Refueler's own (never activated) is fine, it isn't "again".
    s = use(s, ap, r, 0, ["G", "C"]);
    expect(pt(s, r)).toBe("3/4");
    expect(tryUse(s, ap, p, 0, ["R", "C", "C", "C"])).toThrow(/only once/);
    clear(s, ap);
    // Not on an opponent's turn.
    const opp = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s = passUntil(s, "main1", opp);
    s.priority = ap;
    expect(tryUse(s, ap, r, 0, ["G", "C"])).toThrow(/only once/);
  });

  it("Elvish Refueler doesn't help 'Activate only once' abilities that aren't exhaust", () => {
    const { s: s0, ap } = setup([]);
    const h = putOnBattlefield(s0, ap, screen);
    putOnBattlefield(s0, ap, refueler);
    const s = use(s0, ap, h, 0, ["C", "C", "C", "C", "C", "C", "C"]);
    expect(tryUse(nextOwnTurn(s, ap), ap, h, 0, ["C", "C", "C", "C", "C", "C", "C"])).toThrow(/only once/);
  });
});
