// The emblems left out of the emblem round (CR 114): Sarkhan, the Dragonspeaker's extra draws and end-step discard, Tyvar
// Kell's cast trigger that gives the Elf spell haste (CR 400.7a), Narset Transcendent's "can't cast" (CR 101.2) and her
// −2's rebound (CR 702.88a), Ajani Steadfast's damage prevention (CR 615) and his −2, and Teferi, Temporal Archmage's
// loyalty abilities at instant speed (CR 606.3); and Sarkhan's +1, which makes him a creature and no planeswalker.

import { describe, expect, it } from "vitest";
import { act, activate, card, cast, forest, mountain, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { abilityProblem, castProblem, characteristics, isFullySupported, objHasKeyword, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
function settle(s: GameState) {
  for (let i = 0; i < 40 && (s.stack.length || s.resolving || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
function walker(s: GameState, pid: PlayerId, d: CardDef, loyalty: number) {
  const id = putOnBattlefield(s, pid, d);
  s.objects[id]!.counters.loyalty = loyalty;
  return id;
}
const ability = (d: CardDef, prefix: string) => d.oracleText.split("\n").filter((l) => /^[+−0]/.test(l)).findIndex((l) => l.startsWith(prefix));
/** Put a fresh copy of `def` into `pid`'s hand. */
function toHand(s: GameState, pid: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
}

// Real oracle text (Scryfall).
const sarkhan = card("Sarkhan, the Dragonspeaker", "Legendary Planeswalker — Sarkhan", "{3}{R}{R}", { loyalty: "4", oracleText: "+1: Until end of turn, Sarkhan becomes a legendary 4/4 red Dragon creature with flying, indestructible, and haste. (He doesn't lose loyalty while he's not a planeswalker.)\n−3: Sarkhan deals 4 damage to target creature.\n−6: You get an emblem with \"At the beginning of your draw step, draw two additional cards\" and \"At the beginning of your end step, discard your hand.\"" });
const tyvar = card("Tyvar Kell", "Legendary Planeswalker — Tyvar", "{2}{G}{G}", { loyalty: "3", oracleText: "Elves you control have \"{T}: Add {B}.\"\n+1: Put a +1/+1 counter on up to one target Elf. Untap it. It gains deathtouch until end of turn.\n0: Create a 1/1 green Elf Warrior creature token.\n−6: You get an emblem with \"Whenever you cast an Elf spell, it gains haste until end of turn and you draw two cards.\"" });
const narset = card("Narset Transcendent", "Legendary Planeswalker — Narset", "{2}{W}{U}", { loyalty: "6", oracleText: "+1: Look at the top card of your library. If it's a noncreature, nonland card, you may reveal it and put it into your hand.\n−2: When you next cast an instant or sorcery spell from your hand this turn, it gains rebound. (Exile the spell as it resolves. At the beginning of your next upkeep, you may cast that card from exile without paying its mana cost.)\n−9: You get an emblem with \"Your opponents can't cast noncreature spells.\"" });
const ajani = card("Ajani Steadfast", "Legendary Planeswalker — Ajani", "{3}{W}", { loyalty: "4", oracleText: "+1: Until end of turn, up to one target creature gets +1/+1 and gains first strike, vigilance, and lifelink.\n−2: Put a +1/+1 counter on each creature you control and a loyalty counter on each other planeswalker you control.\n−7: You get an emblem with \"If a source would deal damage to you or a planeswalker you control, prevent all but 1 of that damage.\"" });
const teferi = card("Teferi, Temporal Archmage", "Legendary Planeswalker — Teferi", "{4}{U}{U}", { loyalty: "5", oracleText: "+1: Look at the top two cards of your library. Put one of them into your hand and the other on the bottom of your library.\n−1: Untap up to four target permanents.\n−10: You get an emblem with \"You may activate loyalty abilities of planeswalkers you control on any player's turn any time you could cast an instant.\"\nTeferi, Temporal Archmage can be your commander." });
const elves = card("Llanowar Elves", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1", oracleText: "{T}: Add {G}." });
const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
const bears = card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });

describe("emblems and planeswalkers left from round 87", () => {
  it("compile", () => supported(sarkhan, tyvar, narset, ajani, teferi));

  it("Sarkhan's +1: a legendary 4/4 red Dragon creature, no longer a planeswalker; damage doesn't remove loyalty", () => {
    const { s: s0, ap, opp } = setup([]);
    const sk = walker(s0, ap, sarkhan, 4);
    let s = settle(activate(s0, ap, sk, ability(sarkhan, "+1")));
    const c = characteristics(s, s.objects[sk]!);
    expect(c.types).toEqual(["Creature"]);
    expect(c.subtypes).toEqual(["Dragon"]);
    expect(c.supertypes).toEqual(["Legendary"]);
    expect(c.colors).toEqual(["R"]);
    expect(pt(s, sk)).toBe("4/4");
    for (const k of ["Flying", "Indestructible", "Haste"]) expect(objHasKeyword(s, s.objects[sk]!, k)).toBe(true);
    expect(s.objects[sk]!.counters.loyalty).toBe(5);
    // One loyalty ability a turn (CR 606.3).
    expect(abilityProblem(s, ap, sk, ability(sarkhan, "−3"), [target(sk)])).toMatch(/already activated/);
    // An opponent's Lightning Bolt: damage marked on a creature, his loyalty stays (rulings).
    const b = toHand(s, opp, bolt);
    putOnBattlefield(s, opp, mountain);
    s = act(s, { type: "passPriority", player: ap });
    for (const a of planCast(s, opp, b, [target(sk)])!) s = act(s, a);
    s = settle(s);
    expect(s.objects[sk]).toMatchObject({ zone: "battlefield", damage: 3 });
    expect(s.objects[sk]!.counters.loyalty).toBe(5);
    // Next turn he's a planeswalker again.
    s = passUntil(s, "upkeep", opp);
    expect(characteristics(s, s.objects[sk]!).types).toEqual(["Planeswalker"]);
    expect(s.objects[sk]!.counters.loyalty).toBe(5);
  });

  it("Sarkhan's emblem: two more cards in your draw step, and your hand discarded in your end step", () => {
    const { s: s0, ap } = setup([]);
    const sk = walker(s0, ap, sarkhan, 6);
    let s = settle(activate(s0, ap, sk, ability(sarkhan, "−6")));
    expect((s.emblems ?? []).length).toBe(1);
    s = passUntil(s, "end", ap);
    s = settle(s);
    expect(s.players[ap]!.hand).toHaveLength(0);
    s = passUntil(s, "upkeep", ap);
    const before = s.players[ap]!.hand.length;
    s = passUntil(s, "main1", ap);
    expect(s.players[ap]!.hand.length).toBe(before + 3);
  });

  it("Tyvar's emblem: an Elf spell you cast gains haste until end of turn, as the permanent it becomes, and you draw two", () => {
    const { s: s0, ap, ids } = setup([elves]);
    const ty = walker(s0, ap, tyvar, 6);
    let s = settle(activate(s0, ap, ty, ability(tyvar, "−6")));
    const hand = s.players[ap]!.hand.length;
    s = settle(cast(s, ap, ids[0]!));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Haste")).toBe(true);
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Haste")).toBe(false);
  });

  it("Narset's −2: the next instant or sorcery cast from your hand this turn gains rebound", () => {
    const { s: s0, ap, ids } = setup([divination]);
    const n = walker(s0, ap, narset, 6);
    let s = settle(activate(s0, ap, n, ability(narset, "−2")));
    s = settle(cast(s, ap, ids[0]!));
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    expect((s.delayed ?? []).some((d) => d.subject?.id === ids[0] && d.when === "yourNextUpkeep")).toBe(true);
  });

  it("Narset's emblem: opponents can't cast noncreature spells; creature spells and your own are fine", () => {
    const { s: s0, ap, opp } = setup([]);
    const n = walker(s0, ap, narset, 9);
    let s = settle(activate(s0, ap, n, ability(narset, "−9")));
    const b = toHand(s, opp, bolt);
    const g = toHand(s, opp, bears);
    const mine = toHand(s, ap, bolt);
    for (const l of [mountain, forest, forest]) putOnBattlefield(s, opp, l);
    s = passUntil(s, "main1", opp);
    expect(castProblem(s, opp, b, [target(n)])).toMatch(/can't cast noncreature spells/);
    expect(planCast(s, opp, g)).not.toBeNull();
    expect(castProblem(s, ap, mine, [{ kind: "player", id: opp }])).not.toMatch(/can't cast/);
  });

  it("Ajani's −2: +1/+1 counters on your creatures, a loyalty counter on each other planeswalker you control", () => {
    const { s: s0, ap } = setup([]);
    const a = walker(s0, ap, ajani, 4);
    const other = walker(s0, ap, teferi, 5);
    const g = putOnBattlefield(s0, ap, bears);
    const s = settle(activate(s0, ap, a, ability(ajani, "−2")));
    expect(s.objects[g]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[other]!.counters.loyalty).toBe(6);
    expect(s.objects[a]!.counters.loyalty).toBe(2);
  });

  it("Ajani's emblem: damage to you or a planeswalker you control is cut to 1; to your creatures it isn't", () => {
    const { s: s0, ap, ids } = setup([bolt, bolt, bolt]);
    const a = walker(s0, ap, ajani, 7);
    const other = walker(s0, ap, teferi, 5);
    const g = putOnBattlefield(s0, ap, bears);
    let s = settle(activate(s0, ap, a, ability(ajani, "−7")));
    const life = s.players[ap]!.life;
    s = settle(cast(s, ap, ids[0]!, [{ kind: "player", id: ap }]));
    expect(s.players[ap]!.life).toBe(life - 1);
    s = settle(cast(s, ap, ids[1]!, [target(other)]));
    expect(s.objects[other]!.counters.loyalty).toBe(4);
    s = settle(cast(s, ap, ids[2]!, [target(g)]));
    expect(s.objects[g]!.zone).toBe("graveyard");
  });

  it("Teferi's emblem: loyalty abilities on an opponent's turn, still once a turn for each planeswalker", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = walker(s0, ap, teferi, 10);
    const sk = walker(s0, ap, sarkhan, 4);
    const toKen = (x: GameState) => {
      while (waitingOn(x) !== ap) x = act(x, { type: "passPriority", player: waitingOn(x)! });
      return x;
    };
    let s = toKen(passUntil(s0, "upkeep", opp));
    expect(abilityProblem(s, ap, sk, ability(sarkhan, "+1"))).toMatch(/only as a sorcery/);
    s = passUntil(s, "main1", ap);
    s = settle(activate(s, ap, t, ability(teferi, "−10")));
    // In the opponent's upkeep, when Ken has priority.
    s = toKen(passUntil(s, "upkeep", opp));
    expect(abilityProblem(s, ap, sk, ability(sarkhan, "+1"))).toBeNull();
    s = settle(activate(s, ap, sk, ability(sarkhan, "+1")));
    expect(s.objects[sk]!.counters.loyalty).toBe(5);
    expect(abilityProblem(s, ap, sk, ability(sarkhan, "−3"), [target(sk)])).toMatch(/you don't have priority/);
    s = toKen(s);
    expect(s.activePlayer).toBe(opp);
    expect(abilityProblem(s, ap, sk, ability(sarkhan, "−3"), [target(sk)])).toMatch(/already activated/);
  });
});
