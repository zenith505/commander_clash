// "Tap any number of untapped creatures you control": which ones are chosen as it resolves (CR 608.2d), none allowed.
// "For each creature tapped this way" counts them; "When you do, ..." is a reflexive trigger (CR 603.12) that triggers
// even with none tapped, X then 0, its target chosen as it's put on the stack (rulings on Teferi Akosa of Zhalfir and
// Yotia Declares War). The number tapped stays what it was if they untap later (rulings on Siege Striker).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passUntil, pt, putOnBattlefield, scry, setup } from "./helpers";
import { applyAction, botActions, isFullySupported, waitingOn, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const harmony = card("Harmony of Nature", "Sorcery", "{2}{G}", { oracleText: "Tap any number of untapped creatures you control. You gain 4 life for each creature tapped this way." });
const devout = card("Devout Invocation", "Sorcery", "{6}{W}", { oracleText: "Tap any number of untapped creatures you control. Create a 4/4 white Angel creature token with flying for each creature tapped this way." });
const striker = card("Siege Striker", "Creature — Human Soldier", "{2}{W}", { power: "1", toughness: "1", keywords: ["Double strike"], oracleText: "Double strike (This creature deals both first-strike and regular combat damage.)\nWhenever this creature attacks, you may tap any number of untapped creatures you control. This creature gets +1/+1 until end of turn for each creature tapped this way." });
const summit = card("Guild Summit", "Enchantment", "{2}{U}", { oracleText: "When this enchantment enters, you may tap any number of untapped Gates you control. Draw a card for each Gate tapped this way.\nWhenever a Gate you control enters, draw a card." });
const yotia = card("Yotia Declares War", "Enchantment — Saga", "{1}{R}", { keywords: ["Read Ahead"], oracleText: "Read ahead (Choose a chapter and start with that many lore counters. Add one after your draw step. Skipped chapters don't trigger. Sacrifice after III.)\nI — Create a 0/2 colorless Thopter artifact creature token with flying named Ornithopter.\nII — Tap any number of untapped artifacts you control. When you do, this Saga deals that much damage to target creature or planeswalker.\nIII — Up to one target artifact you control becomes an artifact creature with base power and toughness 4/4 until end of turn." });
const newPhyrexia = scry("transform", [
  { name: "Invasion of New Phyrexia", mana_cost: "{X}{W}{U}", type_line: "Battle — Siege", defense: "6", oracle_text: "(As a Siege enters, choose an opponent to protect it. You and others can attack it. When it's defeated, exile it, then cast it transformed.)\nWhen this Siege enters, create X 2/2 white and blue Knight creature tokens with vigilance." },
  { name: "Teferi Akosa of Zhalfir", type_line: "Legendary Planeswalker — Teferi", loyalty: "4", color_indicator: ["U", "W"], oracle_text: "+1: Draw two cards. Then discard two cards unless you discard a creature card.\n−2: You get an emblem with \"Knights you control get +1/+0 and have ward {1}.\"\n−3: Tap any number of untapped creatures you control. When you do, shuffle target nonland permanent an opponent controls with mana value X or less into its owner's library, where X is the number of creatures tapped this way." },
], { keywords: ["Transform"] });
const teferi = card("Teferi Akosa of Zhalfir", "Legendary Planeswalker — Teferi", "", { loyalty: "4", colors: ["W", "U"], oracleText: newPhyrexia.faces![1]!.oracleText });
const gate = () => card("Azorius Guildgate", "Land — Gate", "", { oracleText: "This land enters tapped.\n{T}: Add {W} or {U}." });
const artifact = () => card("Ornithopter", "Artifact Creature — Thopter", "{0}", { power: "0", toughness: "2", oracleText: "Flying" });
const giant = () => card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });

function settle(s: GameState) {
  for (let i = 0; i < 60 && (s.stack.length || s.resolving || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}

describe("tap any number of untapped permanents you control", () => {
  it("compile", () => supported(harmony, devout, striker, summit, yotia, newPhyrexia, teferi));

  it("Harmony of Nature: only your untapped creatures are offered, you tap the ones you click, 4 life for each", () => {
    const { s: s0, ap, opp, ids } = setup([harmony]);
    const [a, b, c] = [bear(), bear(), bear()].map((d) => putOnBattlefield(s0, ap, d)) as [string, string, string];
    const tapped = putOnBattlefield(s0, ap, bear());
    s0.objects[tapped]!.tapped = true;
    putOnBattlefield(s0, opp, bear());
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "tap", min: 0, count: 3 });
    if (s.pending?.kind !== "pickPermanents") throw new Error();
    expect([...s.pending.options].sort()).toEqual([a, b, c].sort());
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [a, c] }));
    expect(s.players[ap]!.life).toBe(48);
    expect([a, b, c].map((id) => s.objects[id]!.tapped)).toEqual([true, false, true]);
  });

  it("Devout Invocation: tapping none is allowed and makes no Angels", () => {
    const { s: s0, ap, ids } = setup([devout]);
    putOnBattlefield(s0, ap, bear());
    const before = s0.battlefield.length;
    let s = settle(cast(s0, ap, ids[0]!));
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [] }));
    expect(s.battlefield.length).toBe(before);
    const { s: t0, ap: a2, ids: i2 } = setup([devout]);
    const xs = [bear(), bear()].map((d) => putOnBattlefield(t0, a2, d));
    let t = settle(cast(t0, a2, i2[0]!));
    t = settle(act(t, { type: "pickPermanents", player: a2, ids: xs }));
    expect(t.battlefield.filter((id) => t.cards[t.objects[id]!.cardId]!.name === "Angel Token")).toHaveLength(2);
  });

  it("Siege Striker: +1/+1 for each creature tapped, and it stays after they untap", () => {
    const { s: s0, ap, opp } = setup([]);
    const st = putOnBattlefield(s0, ap, striker);
    const xs = [bear(), bear()].map((d) => putOnBattlefield(s0, ap, d));
    let s = passUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: st, defender: opp }] }));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "tap", count: 2 });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: xs }));
    expect(pt(s, st)).toBe("3/3");
    for (const id of xs) s.objects[id]!.tapped = false;
    expect(pt(s, st)).toBe("3/3");
  });

  it("Guild Summit: Gates only, a card for each one tapped", () => {
    const { s: s0, ap, ids } = setup([summit]);
    const gs = [gate(), gate()].map((d) => putOnBattlefield(s0, ap, d));
    for (const id of gs) s0.objects[id]!.tapped = false;
    putOnBattlefield(s0, ap, bear());
    const hand = s0.players[ap]!.hand.length;
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "tap" });
    if (s.pending?.kind !== "pickPermanents") throw new Error();
    expect([...s.pending.options].sort()).toEqual([...gs].sort());
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: gs }));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
  });

  it("Teferi Akosa's −3: X is the number tapped, as the target is chosen; a permanent with greater mana value can't be chosen", () => {
    const { s: s0, ap, opp } = setup([]);
    const tf = putOnBattlefield(s0, ap, teferi);
    s0.objects[tf]!.counters.loyalty = 4;
    const xs = [bear(), bear()].map((d) => putOnBattlefield(s0, ap, d));
    const small = putOnBattlefield(s0, opp, bear());
    const big = putOnBattlefield(s0, opp, giant());
    let s = settle(activate(s0, ap, tf, 2));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "tap", count: 2 });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: xs }));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: big }] })).toThrow();
    const libBefore = s.players[opp]!.library.length;
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: small }] }));
    expect(s.objects[small]!.zone).toBe("library");
    expect(s.players[opp]!.library.length).toBe(libBefore + 1);
    expect(s.objects[big]!.zone).toBe("battlefield");
  });

  it("Teferi Akosa's −3 with none tapped: it still triggers, and X is 0", () => {
    const { s: s0, ap, opp } = setup([]);
    const tf = putOnBattlefield(s0, ap, teferi);
    s0.objects[tf]!.counters.loyalty = 4;
    putOnBattlefield(s0, ap, bear());
    const small = putOnBattlefield(s0, opp, bear());
    const free = putOnBattlefield(s0, opp, artifact());
    let s = settle(activate(s0, ap, tf, 2));
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [] }));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: small }] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: free }] }));
    expect(s.objects[free]!.zone).toBe("library");
  });

  it("Yotia Declares War's chapter II: that much damage, one for each artifact tapped", () => {
    const { s: s0, ap, opp } = setup([]);
    const saga = putOnBattlefield(s0, ap, yotia);
    s0.objects[saga]!.counters.lore = 1;
    const arts = [artifact(), artifact(), artifact()].map((d) => putOnBattlefield(s0, ap, d));
    const victim = putOnBattlefield(s0, opp, giant());
    // Its lore counter is added in your next precombat main phase (CR 714.3b).
    let s = passUntil(passUntil(s0, "main2", ap), "main1", ap);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "tap", count: 3 });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: arts }));
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: victim }] }));
    expect(s.objects[victim]!.zone).toBe("graveyard");
  });

  it("a bot taps them all, but keeps creatures that could still attack this turn untapped before combat", () => {
    const { s: s0, ap, ids } = setup([harmony]);
    const ready = putOnBattlefield(s0, ap, bear());
    const sick = [bear(), bear()].map((d) => putOnBattlefield(s0, ap, d, { sick: true }));
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "tap" });
    for (const a of botActions(s, ap)) s = applyAction(s, a);
    s = settle(s);
    expect(s.objects[ready]!.tapped).toBe(false);
    expect(sick.map((id) => s.objects[id]!.tapped)).toEqual([true, true]);
    expect(s.players[ap]!.life).toBe(48);
  });
});
