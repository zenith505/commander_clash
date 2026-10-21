// Round 106, the next popular cards: Tezzeret the Seeker ("Artifacts you control become artifact creatures with base
// power and toughness 5/5"), Humble Defector ("Target opponent gains control of ~"), Leyline of the Guildpact ("Each
// nonland permanent you control is all colors"), Relic of Sauron ("two mana in any combination of {U}, {B}, and/or
// {R}"), Demonic Counsel ("any card"), Vaultborn Tyrant ("if it's not a token"), Proft's Eidetic Memory ("if you've
// drawn more than one card this turn"), Shigeki ("Return ~ to its owner's hand" as a cost), Ilysian Caryatid.

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { abilitiesOf, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objIsType, planActivate, planCast, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const tezzeret = card("Tezzeret the Seeker", "Legendary Planeswalker — Tezzeret", "{3}{U}{U}", { loyalty: "4", oracleText: "+1: Untap up to two target artifacts.\n−X: Search your library for an artifact card with mana value X or less, put it onto the battlefield, then shuffle.\n−5: Artifacts you control become artifact creatures with base power and toughness 5/5 until end of turn." });
const defector = card("Humble Defector", "Creature — Human Rogue", "{1}{R}", { power: "2", toughness: "1", oracleText: "{T}: Draw two cards. Target opponent gains control of this creature. Activate only during your turn." });
const leyline = card("Leyline of the Guildpact", "Enchantment", "{G/W}{G/U}{B/G}{R/G}", { oracleText: "If this card is in your opening hand, you may begin the game with it on the battlefield.\nEach nonland permanent you control is all colors.\nLands you control are every basic land type in addition to their other types." });
const relic = card("Relic of Sauron", "Artifact", "{4}", { oracleText: "{T}: Add two mana in any combination of {U}, {B}, and/or {R}.\n{3}, {T}: Draw two cards, then discard a card." });
const counsel = card("Demonic Counsel", "Sorcery", "{1}{B}", { keywords: ["Delirium"], oracleText: "Search your library for a Demon card, reveal it, put it into your hand, then shuffle.\nDelirium — If there are four or more card types among cards in your graveyard, instead search your library for any card, put it into your hand, then shuffle." });
const tyrant = card("Vaultborn Tyrant", "Creature — Dinosaur", "{5}{G}{G}", { power: "6", toughness: "6", keywords: ["Trample"], oracleText: "Trample\nWhenever this creature or another creature you control with power 4 or greater enters, you gain 3 life and draw a card.\nWhen this creature dies, if it's not a token, create a token that's a copy of it, except it's an artifact in addition to its other types." });
const memory = card("Proft's Eidetic Memory", "Legendary Enchantment", "{1}{U}", { oracleText: "When Proft's Eidetic Memory enters, draw a card.\nYou have no maximum hand size.\nAt the beginning of combat on your turn, if you've drawn more than one card this turn, put X +1/+1 counters on target creature you control, where X is the number of cards you've drawn this turn minus one." });
const shigeki = card("Shigeki, Jukai Visionary", "Legendary Enchantment Creature — Snake Druid", "{1}{G}", { power: "1", toughness: "3", keywords: ["Channel"], oracleText: "{1}{G}, {T}, Return Shigeki to its owner's hand: Reveal the top four cards of your library. You may put a land card from among them onto the battlefield tapped. Put the rest into your graveyard.\nChannel — {X}{X}{G}{G}, Discard this card: Return X target nonlegendary cards from your graveyard to your hand." });
const caryatid = card("Ilysian Caryatid", "Creature — Plant", "{1}{G}", { power: "1", toughness: "1", oracleText: "{T}: Add one mana of any color. If you control a creature with power 4 or greater, add two mana of any one color instead." });

// Test cards.
const rock = card("Test Rock", "Artifact", "{1}", { oracleText: "{T}: Add {C}." });
const murder = card("Test Murder", "Instant", "{1}{B}", { oracleText: "Destroy target creature." });
const demon = card("Test Demon", "Creature — Demon", "{3}{B}", { power: "5", toughness: "5" });
const incubation = card("Krasis Incubation", "Enchantment — Aura", "{2}{G}{U}", { oracleText: "Enchant creature\nEnchanted creature can't attack or block, and its activated abilities can't be activated.\n{1}{G}{U}, Return this Aura to its owner's hand: Put two +1/+1 counters on enchanted creature." });
const witch = card("Witch Engine", "Creature — Horror", "{5}{B}", { power: "4", toughness: "4", keywords: ["Swampwalk"], oracleText: "Swampwalk (This creature can't be blocked as long as defending player controls a Swamp.)\n{T}: Add {B}{B}{B}{B}. Target opponent gains control of this creature. (Activate only as an instant.)" });
const nightmare = card("Recurring Nightmare", "Enchantment", "{2}{B}", { oracleText: "Sacrifice a creature, Return this enchantment to its owner's hand: Return target creature card from your graveyard to the battlefield. Activate only as a sorcery." });
const tyrantLike = card("Test Wurm", "Creature — Wurm", "{6}{G}", { power: "7", toughness: "7" });
const giant = card("Test Giant", "Creature — Giant", "{4}{G}", { power: "4", toughness: "4" });

const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const pool = (s: GameState, pid: PlayerId) => Object.entries(s.players[pid]!.manaPool).filter(([, n]) => n > 0).map(([k, n]) => `${k}${n}`).sort().join(" ");

describe("round 106: the next popular cards", () => {
  it("parse", () => [tezzeret, defector, leyline, relic, counsel, tyrant, memory, shigeki, caryatid, incubation, witch, nightmare].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Tezzeret the Seeker −5: every artifact you control is a 5/5 artifact creature until end of turn, its other types kept", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, tezzeret);
    s0.objects[t]!.counters.loyalty = 6;
    const r = putOnBattlefield(s0, ap, rock);
    const theirs = putOnBattlefield(s0, opp, rock);
    let s = settle(activate(s0, ap, t, 2));
    expect(objIsType(s, s.objects[r]!, "Creature")).toBe(true);
    expect(objIsType(s, s.objects[r]!, "Artifact")).toBe(true);
    expect(pt(s, r)).toBe("5/5");
    expect(objIsType(s, s.objects[theirs]!, "Creature")).toBe(false);
    s = passUntil(s, "upkeep", opp);
    expect(objIsType(s, s.objects[r]!, "Creature")).toBe(false);
  });

  it("Humble Defector: draw two, then the target opponent controls it", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, defector);
    const hand = s0.players[ap]!.hand.length;
    const plan = planActivate(s0, ap, d, 0, [{ kind: "player", id: opp }]);
    expect(plan).not.toBeNull();
    let s = s0;
    for (const a of plan!) s = act(s, a);
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(controllerOf(s, s.objects[d]!)).toBe(opp);
  });

  it("Leyline of the Guildpact: your nonland permanents are all colors; lands are every basic land type", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, leyline);
    const b = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, bear());
    const land = s.battlefield.find((id) => controllerOf(s, s.objects[id]!) === ap && objIsType(s, s.objects[id]!, "Land"))!;
    expect(characteristics(s, s.objects[b]!).colors.sort()).toEqual(["B", "G", "R", "U", "W"]);
    expect(characteristics(s, s.objects[theirs]!).colors).toEqual(["G"]);
    expect(characteristics(s, s.objects[land]!).colors).toEqual([]);
    expect(characteristics(s, s.objects[land]!).subtypes).toEqual(expect.arrayContaining(["Plains", "Island", "Swamp", "Mountain", "Forest"]));
  });

  it("Relic of Sauron: two mana, each blue, black or red", () => {
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, relic);
    const combos = abilitiesOf(s0, s0.objects[r]!).mana[0]!;
    expect(combos.produces).toEqual({ kind: "anyColors", n: 2, colors: ["U", "B", "R"] });
    // The combinations in WUBRG order: UU, UB, UR, BB, BR, RR.
    const s = act(s0, { type: "activateMana", player: ap, objectId: r, mana: "U", ability: 0, combo: 1 });
    expect(pool(s, ap)).toBe("B1 U1");
    expect(() => act(s0, { type: "activateMana", player: ap, objectId: r, mana: "G", ability: 0, combo: 6 })).toThrow();
  });

  it("Demonic Counsel: a Demon card; with delirium, any card", () => {
    const { s: s0, ap, ids } = setup([counsel]);
    const dm = putOnBattlefield(s0, ap, demon);
    s0.battlefield.splice(s0.battlefield.indexOf(dm), 1);
    s0.objects[dm]!.zone = "library";
    s0.players[ap]!.library.push(dm);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    s = settle(s);
    expect(s.pending?.kind).toBe("searchLibrary");
    if (s.pending?.kind !== "searchLibrary") return;
    expect(s.pending.cards).toEqual([dm]);
    // Delirium: an artifact, a creature, an instant and a land in the graveyard.
    const { s: t0, ap: p2, ids: ids2 } = setup([counsel]);
    for (const d of [rock, bear(), murder, card("Test Land", "Land")]) {
      const id = putOnBattlefield(t0, p2, d);
      t0.battlefield.splice(t0.battlefield.indexOf(id), 1);
      t0.objects[id]!.zone = "graveyard";
      t0.players[p2]!.graveyard.push(id);
    }
    let t = t0;
    for (const a of planCast(t, p2, ids2[0]!)!) t = act(t, a);
    t = settle(t);
    expect(t.pending?.kind).toBe("searchLibrary");
    if (t.pending?.kind !== "searchLibrary") return;
    expect(t.pending.cards.length).toBe(t.players[p2]!.library.length);
  });

  it("Vaultborn Tyrant: dying, a token copy that's also an artifact; the token dying makes no more", () => {
    const { s: s0, ap, ids } = setup([murder, murder]);
    const v = putOnBattlefield(s0, ap, tyrant);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [target(v)])!) s = act(s, a);
    s = settle(s);
    expect(s.objects[v]!.zone).toBe("graveyard");
    const tok = s.battlefield.find((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).name === "Vaultborn Tyrant")!;
    expect(tok).toBeDefined();
    expect(objIsType(s, s.objects[tok]!, "Artifact")).toBe(true);
    expect(objIsType(s, s.objects[tok]!, "Creature")).toBe(true);
    for (const a of planCast(s, ap, ids[1]!, [target(tok)])!) s = act(s, a);
    s = settle(s);
    expect(s.battlefield.some((id) => characteristics(s, s.objects[id]!).name === "Vaultborn Tyrant")).toBe(false);
  });

  it("Proft's Eidetic Memory: at combat, X counters for cards drawn this turn minus one, only after two or more", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, memory);
    const b = putOnBattlefield(s0, ap, bear());
    // One card drawn (the draw step): no trigger.
    let s = settle(passUntil(passUntil(s0, "end", ap), "beginCombat", ap));
    expect(s.pending).toBeFalsy();
    expect(s.objects[b]!.counters["+1/+1"] ?? 0).toBe(0);
    // Three drawn: two counters.
    const { s: t0, ap: p2 } = setup([]);
    putOnBattlefield(t0, p2, memory);
    const b2 = putOnBattlefield(t0, p2, bear());
    t0.players[p2]!.draws = { turn: t0.turn, n: 3 };
    let t = passUntil(t0, "beginCombat", p2);
    for (let i = 0; i < 10 && (t.pending || t.stack.length || t.triggerQueue.length); i++) {
      if (t.pending?.kind === "chooseTargets") t = act(t, { type: "chooseTargets", player: p2, targets: [target(b2)] });
      else if (t.pending) throw new Error(t.pending.kind);
      else t = act(t, { type: "passPriority", player: waitingOn(t)! });
    }
    expect(t.objects[b2]!.counters["+1/+1"]).toBe(2);
  });

  it("Shigeki: returning it to its owner's hand pays the cost; a land from the top four onto the battlefield tapped", () => {
    const { s: s0, ap } = setup([]);
    const sh = putOnBattlefield(s0, ap, shigeki);
    const yard = s0.players[ap]!.graveyard.length;
    const plan = planActivate(s0, ap, sh, 0);
    expect(plan).not.toBeNull();
    let s = s0;
    for (const a of plan!) s = act(s, a);
    expect(s.players[ap]!.hand).toContain(sh);
    s = settle(s);
    // A land among them: the setup library is Forests and Grizzly Bears.
    if (s.pending?.kind === "searchLibrary") {
      const land = s.pending.cards.find((id) => s.cards[s.objects[id]!.cardId]!.types.includes("Land"));
      s = settle(act(s, { type: "searchLibrary", player: ap, found: land ? [land] : [] }));
      if (land) {
        expect(s.objects[land]!.zone).toBe("battlefield");
        expect(s.objects[land]!.tapped).toBe(true);
      }
      expect(s.players[ap]!.graveyard.length).toBe(yard + (land ? 3 : 4));
    } else expect(s.players[ap]!.graveyard.length).toBe(yard + 4);
  });

  it("Krasis Incubation: returned to hand as the cost, its counters go on the creature it enchanted (last known information)", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, bear());
    const k = putOnBattlefield(s0, ap, incubation);
    s0.objects[k]!.attachedTo = b;
    invalidateCharacteristics(s0);
    expect(characteristics(s0, s0.objects[b]!).cantAttack).toBeTruthy();
    const plan = planActivate(s0, ap, k, 0);
    expect(plan).not.toBeNull();
    let s = s0;
    for (const a of plan!) s = act(s, a);
    expect(s.players[ap]!.hand).toContain(k);
    s = settle(s);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(2);
  });

  it("Witch Engine: its targeted ability isn't a mana ability; it adds {B}{B}{B}{B} as it resolves, and the opponent takes it", () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, witch);
    const plan = planActivate(s0, ap, w, 0, [{ kind: "player", id: opp }]);
    expect(plan).not.toBeNull();
    let s = s0;
    for (const a of plan!) s = act(s, a);
    expect(s.stack.length).toBe(1);
    s = settle(s);
    expect(s.players[ap]!.manaPool.B).toBe(4);
    expect(controllerOf(s, s.objects[w]!)).toBe(opp);
  });

  it("Recurring Nightmare: sacrifice a creature and return it to hand, a creature card back from the graveyard", () => {
    const { s: s0, ap } = setup([]);
    const n = putOnBattlefield(s0, ap, nightmare);
    const fodder = putOnBattlefield(s0, ap, bear({ name: "Fodder Bear" }));
    const dead = putOnBattlefield(s0, ap, tyrantLike);
    s0.battlefield.splice(s0.battlefield.indexOf(dead), 1);
    s0.objects[dead]!.zone = "graveyard";
    s0.players[ap]!.graveyard.push(dead);
    const plan = planActivate(s0, ap, n, 0, [target(dead)], undefined, undefined, undefined, { sacrifice: [fodder] });
    expect(plan).not.toBeNull();
    let s = s0;
    for (const a of plan!) s = act(s, a);
    s = settle(s);
    expect(s.objects[n]!.zone).toBe("hand");
    expect(s.objects[fodder]!.zone).toBe("graveyard");
    expect(s.objects[dead]!.zone).toBe("battlefield");
  });

  it("Ilysian Caryatid: one mana of any color; two of one color with a power 4 creature", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, caryatid);
    let s = act(s0, { type: "activateMana", player: ap, objectId: c, mana: "R" });
    expect(pool(s, ap)).toBe("R1");
    const { s: t0, ap: p2 } = setup([]);
    const c2 = putOnBattlefield(t0, p2, caryatid);
    putOnBattlefield(t0, p2, giant);
    s = act(t0, { type: "activateMana", player: p2, objectId: c2, mana: "U" });
    expect(pool(s, p2)).toBe("U2");
  });
});
