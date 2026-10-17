// "A card named A or B" is one card with either name. "With mana value less than or equal to that spell's mana value"
// bounds the target by the spell that triggered it (rulings on Hammerhead Tyrant: X counts as cast). "Return half the
// creatures they control, rounded up": the caster picks which (rulings on Split the Party). From the hand onto the
// battlefield: "with lesser power" than the source, or its last known power (rulings on Shadowfax); "attacking that
// opponent" (rulings on Kaalia: only when Kaalia attacks a player); "gains haste. Sacrifice the creature at the beginning
// of the next end step" (Sneak Attack). "An Angel, Demon, or Dragon creature card" shares "creature" across the list.

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { botActions, isFullySupported, objHasKeyword, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";
import { moveObject } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const toZone = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "hand") s.players[pid]!.hand.push(id);
  else s.players[pid]!.library.unshift(id);
  return id;
};
/** Passes priority until something needs an answer or the stack is empty. */
const untilChoice = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

// Real oracle text (Scryfall).
const bogbrew = card("Bogbrew Witch", "Creature — Human Wizard", "{3}{B}", { power: "1", toughness: "3", oracleText: "{2}, {T}: Search your library for a card named Festering Newt or Bubbling Cauldron, put it onto the battlefield tapped, then shuffle." });
const newt = card("Festering Newt", "Creature — Salamander", "{B}", { power: "1", toughness: "1" });
const cauldron = card("Bubbling Cauldron", "Artifact", "{2}");
const forecaster = card("Dragonstorm Forecaster", "Creature — Human Scout", "{U}", { power: "0", toughness: "3", oracleText: "{2}, {T}: Search your library for a card named Dragonstorm Globe or Boulderborn Dragon, reveal it, put it into your hand, then shuffle." });
const tyrant = card("Hammerhead Tyrant", "Creature — Dragon", "{4}{U}{U}", { power: "6", toughness: "6", keywords: ["Flying"], oracleText: "Flying\nWhenever you cast a spell, return up to one target nonland permanent an opponent controls with mana value less than or equal to that spell's mana value to its owner's hand." });
const split = card("Split the Party", "Sorcery", "{3}{U}{U}", { oracleText: "Choose target player. Return half the creatures they control to their owner's hand, rounded up." });
const shadowfax = card("Shadowfax, Lord of Horses", "Legendary Creature — Horse", "{3}{R}{W}", { power: "4", toughness: "4", oracleText: "Horses you control have haste. (They can attack and {T} as soon as they come under your control.)\nWhenever Shadowfax attacks, you may put a creature card with lesser power from your hand onto the battlefield tapped and attacking." });
const kaalia = card("Kaalia of the Vast", "Legendary Creature — Human Cleric", "{1}{R}{W}{B}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying\nWhenever Kaalia attacks an opponent, you may put an Angel, Demon, or Dragon creature card from your hand onto the battlefield tapped and attacking that opponent." });
const sneak = card("Sneak Attack", "Enchantment", "{3}{R}", { oracleText: "{R}: You may put a creature card from your hand onto the battlefield. That creature gains haste. Sacrifice the creature at the beginning of the next end step." });

const relic = (mv: number) => card(`Relic ${mv}`, "Artifact", `{${mv}}`);
const demon = card("Test Demon", "Creature — Demon", "{5}{B}", { power: "6", toughness: "6" });
const troll = card("Test Troll", "Creature — Troll", "{2}{G}{G}", { power: "4", toughness: "4" });
const elf = card("Test Elf", "Creature — Elf", "{G}", { power: "1", toughness: "1" });

describe("a card named A or B, that spell's mana value, half their creatures, and more from the hand", () => {
  it("parse", () => supported(bogbrew, forecaster, tyrant, split, shadowfax, kaalia, sneak));

  it("Bogbrew Witch: either name, onto the battlefield tapped", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, bogbrew);
    const n = toZone(s0, ap, newt, "library");
    const c = toZone(s0, ap, cauldron, "library");
    const other = toZone(s0, ap, relic(2), "library");
    let s = untilChoice(activate(s0, ap, w, 0));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    if (s.pending?.kind !== "searchLibrary") throw new Error("no search");
    expect(s.pending.cards).toEqual(expect.arrayContaining([n, c]));
    expect(s.pending.cards).not.toContain(other);
    expect(s.pending.max).toBe(1);
    s = untilChoice(act(s, { type: "searchLibrary", player: ap, found: [c] }));
    expect(s.objects[c]!).toMatchObject({ zone: "battlefield", tapped: true });
    expect(s.objects[n]!.zone).toBe("library");
  });

  it("Hammerhead Tyrant: the target's mana value is at most the cast spell's", () => {
    const { s: s0, ap, ids, opp } = setup([bear()]);
    putOnBattlefield(s0, ap, tyrant);
    const two = putOnBattlefield(s0, opp, relic(2));
    const three = putOnBattlefield(s0, opp, relic(3));
    let s = untilChoice(cast(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [target(three)] })).toThrow();
    s = untilChoice(act(s, { type: "chooseTargets", player: ap, targets: [target(two)] }));
    expect(s.objects[two]!.zone).toBe("hand");
    expect(s.objects[three]!.zone).toBe("battlefield");
  });

  it("Split the Party: the caster picks half the target player's creatures, rounded up", () => {
    const { s: s0, ap, ids, opp } = setup([split]);
    const a = putOnBattlefield(s0, opp, elf), b = putOnBattlefield(s0, opp, troll), c = putOnBattlefield(s0, opp, demon);
    const mine = putOnBattlefield(s0, ap, bear());
    let s = untilChoice(cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "bounce", count: 2 });
    if (s.pending?.kind !== "pickPermanents") throw new Error("no pick");
    expect([...s.pending.options].sort()).toEqual([a, b, c].sort());
    s = untilChoice(act(s, { type: "pickPermanents", player: ap, ids: [a, c] }));
    expect([s.objects[a]!.zone, s.objects[b]!.zone, s.objects[c]!.zone]).toEqual(["hand", "battlefield", "hand"]);
    expect(s.objects[mine]!.zone).toBe("battlefield");
  });

  it("Split the Party: the bot returns the opponent's best creatures", () => {
    const { s: s0, ap, ids, opp } = setup([split]);
    const a = putOnBattlefield(s0, opp, elf), b = putOnBattlefield(s0, opp, troll), c = putOnBattlefield(s0, opp, demon);
    let s = untilChoice(cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    for (const x of botActions(s, ap)) s = act(s, x);
    s = untilChoice(s);
    expect([s.objects[a]!.zone, s.objects[b]!.zone, s.objects[c]!.zone]).toEqual(["battlefield", "hand", "hand"]);
  });

  it("Shadowfax: only creature cards with lesser power, compared with its last known power if it's gone", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, shadowfax);
    s0.players[ap]!.hand = [];
    const small = toZone(s0, ap, bear(), "hand");
    const same = toZone(s0, ap, troll, "hand");
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: f, defender: opp }] });
    moveObject(s, f, "graveyard"); // Shadowfax leaves before its trigger resolves: 4 as it last existed
    s = untilChoice(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", fromHand: true, cards: [small] });
    expect(s.pending?.kind === "searchLibrary" && s.pending.cards).not.toContain(same);
    s = untilChoice(act(s, { type: "searchLibrary", player: ap, found: [small] }));
    if (s.pending?.kind === "chooseOption") s = untilChoice(act(s, { type: "chooseOption", player: ap, choice: String(opp) }));
    expect(s.objects[small]!).toMatchObject({ zone: "battlefield", tapped: true, attacking: opp });
  });

  it("Kaalia: an Angel, Demon, or Dragon, attacking the opponent Kaalia attacks", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kaalia);
    s0.players[ap]!.hand = [];
    const d = toZone(s0, ap, demon, "hand");
    toZone(s0, ap, troll, "hand");
    let s = untilChoice(act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: k, defender: opp }] }));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", cards: [d] });
    s = untilChoice(act(s, { type: "searchLibrary", player: ap, found: [d] }));
    expect(s.pending?.kind).not.toBe("chooseOption"); // no choice of whom: that opponent
    expect(s.objects[d]!).toMatchObject({ zone: "battlefield", tapped: true, attacking: opp });
  });

  it("Kaalia attacking a planeswalker doesn't trigger (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kaalia);
    s0.players[ap]!.hand = [];
    toZone(s0, ap, demon, "hand");
    const s1 = passUntil(s0, "declareAttackers", ap);
    const pw = putOnBattlefield(s1, opp, card("Test Walker", "Legendary Planeswalker — Test", "{3}", { loyalty: "5" }));
    s1.objects[pw]!.counters.loyalty = 5;
    const s = untilChoice(act(s1, { type: "declareAttackers", player: ap, attacks: [{ attacker: k, defender: opp, planeswalker: pw }] }));
    expect(s.pending).toBeFalsy();
    expect(s.stack).toHaveLength(0);
  });

  it("Sneak Attack: haste, then sacrificed at the next end step", () => {
    const { s: s0, ap } = setup([]);
    const sa = putOnBattlefield(s0, ap, sneak);
    s0.players[ap]!.hand = [];
    const t = toZone(s0, ap, troll, "hand");
    let s = untilChoice(activate(s0, ap, sa, 0));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", fromHand: true, cards: [t] });
    s = untilChoice(act(s, { type: "searchLibrary", player: ap, found: [t] }));
    expect(s.objects[t]!.zone).toBe("battlefield");
    expect(objHasKeyword(s, s.objects[t]!, "Haste")).toBe(true);
    s = untilChoice(passUntil(s, "end", ap));
    s = untilChoice(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.objects[t]!.zone).toBe("graveyard");
  });
});
