// Discover N (CR 701.57a): exile cards from the top of your library until a nonland card with mana value N or less;
// you may cast it without paying its mana cost, and if you don't (or can't, rulings) it goes to your hand; the other
// exiled cards go on the bottom in a random order. "When ~ enters, if you cast it" (Geological Appraiser's rulings:
// from any zone, not when it's put onto the battlefield).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, forest, island, mountain, passAll, putOnBattlefield, setup } from "./helpers";
import { compileCard, isFullySupported, moveObject, planCast, waitingOn, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const daring = card("Daring Discovery", "Sorcery", "{4}{R}", { oracleText: "Up to three target creatures can't block this turn.\nDiscover 4. (Exile cards from the top of your library until you exile a nonland card with mana value 4 or less. Cast it without paying its mana cost or put it into your hand. Put the rest on the bottom in a random order.)" });
const gnawer = card("Primordial Gnawer", "Creature — Insect", "{4}{B}", { power: "5", toughness: "3", oracleText: "When this creature dies, discover 3. (Exile cards from the top of your library until you exile a nonland card with mana value 3 or less. Cast it without paying its mana cost or put it into your hand. Put the rest on the bottom in a random order.)" });
const appraiser = card("Geological Appraiser", "Creature — Human Artificer", "{2}{R}{R}", { power: "3", toughness: "2", oracleText: "When this creature enters, if you cast it, discover 3. (Exile cards from the top of your library until you exile a nonland card with mana value 3 or less. Cast it without paying its mana cost or put it into your hand. Put the rest on the bottom in a random order.)" });
const big = card("Colossal Dreadmaw", "Creature — Dinosaur", "{4}{G}{G}", { power: "6", toughness: "6", keywords: ["Trample"], oracleText: "Trample" });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
const egg = card("Dinosaur Egg", "Creature — Dinosaur Egg", "{1}{G}", { power: "0", toughness: "3", keywords: ["Evolve", "Discover"], oracleText: "Evolve (Whenever a creature you control enters, if that creature has greater power or toughness than this creature, put a +1/+1 counter on this creature.)\nWhen this creature dies, you may discover X, where X is its toughness." });
const lode = card("Hit the Mother Lode", "Sorcery", "{4}{R}{R}{R}", { keywords: ["Treasure", "Discover"], oracleText: "Discover 10. If the discovered card's mana value is less than 10, create a number of tapped Treasure tokens equal to the difference. (To discover 10, exile cards from the top of your library until you exile a nonland card with mana value 10 or less. Cast it without paying its mana cost or put it into your hand. Put the rest on the bottom in a random order.)" });
const hurl = card("Hurl into History", "Instant", "{3}{U}{U}", { oracleText: "Counter target artifact or creature spell. Discover X, where X is that spell's mana value. (Exile cards from the top of your library until you exile a nonland card with that mana value or less. Cast it without paying its mana cost or put it into your hand. Put the rest on the bottom in a random order.)" });
const pantlaza = card("Pantlaza, Sun-Favored", "Legendary Creature — Dinosaur", "{2}{R}{G}{W}", { power: "4", toughness: "4", keywords: ["Discover"], oracleText: "Whenever Pantlaza or another Dinosaur you control enters, you may discover X, where X is that creature's toughness. Do this only once each turn. (Exile cards from the top of your library until you exile a nonland card with that mana value or less. Cast it without paying its mana cost or put it into your hand. Put the rest on the bottom in a random order.)" });
const wanShiTong = card("Wan Shi Tong, Librarian", "Legendary Creature — Bird Spirit", "{X}{U}{U}", { power: "1", toughness: "1", keywords: ["Flash", "Flying", "Vigilance"], oracleText: "Flash\nFlying, vigilance\nWhen Wan Shi Tong enters, put X +1/+1 counters on him. Then draw half X cards, rounded down.\nWhenever an opponent searches their library, put a +1/+1 counter on Wan Shi Tong and draw a card." });
const mv = (n: number, name = `Spell ${n}`) => card(name, "Sorcery", n ? `{${n}}` : "", { oracleText: "Draw a card." });

const none: TargetChoice[] = [{ kind: "none" }, { kind: "none" }, { kind: "none" }];
const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
/** Put these cards on top of `pid`'s library, the first one on top. */
function stack(s: GameState, pid: PlayerId, defs: CardDef[]) {
  const ids = defs.map((d) => {
    const id = putOnBattlefield(s, pid, d);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    return id;
  });
  s.players[pid]!.library.unshift(...ids);
  return ids;
}

describe("discover", () => {
  it("compiles them", () => {
    supported(daring, gnawer, appraiser);
    expect(compileCard(gnawer).triggers[0]!.body.effects[0]).toEqual({ type: "discover", n: 3 });
    expect(compileCard(appraiser).triggers[0]).toMatchObject({ ifCast: true });
  });

  it("skips lands and cards with greater mana value; the hit can be cast free, the rest go to the bottom", () => {
    let { s, ap, ids } = setup([daring]);
    const [l, b, h] = stack(s, ap, [forest, big, bear()]);
    const libSize = s.players[ap]!.library.length;
    for (const a of planCast(s, ap, ids[0]!, none)!) s = act(s, a);
    s = passAll(s);
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: h, how: "discover" });
    for (const a of planCast(s, ap, h!)!) s = act(s, a);
    expect(s.objects[h!]!.zone).toBe("stack");
    // The forest and the Dreadmaw went to the bottom.
    const lib = s.players[ap]!.library;
    expect(lib.length).toBe(libSize - 1);
    expect(lib.slice(-2).sort()).toEqual([l, b].sort());
    s = passAll(s);
    expect(s.objects[h!]!.zone).toBe("battlefield");
  });

  it("a card not cast goes to the hand, as does one that can't be cast", () => {
    let { s, ap, ids } = setup([daring, daring]);
    const [h] = stack(s, ap, [bear()]);
    s = cast(s, ap, ids[0]!, none);
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(s.players[ap]!.hand).toContain(h);
    // Murder with no creature to target can't be cast (rulings): it goes to the hand.
    for (const id of [...s.battlefield]) if (s.cards[s.objects[id]!.cardId]!.types.includes("Creature")) moveObject(s, id, "graveyard");
    const [m] = stack(s, ap, [murder]);
    s = cast(s, ap, ids[1]!, none);
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.hand).toContain(m);
  });

  it("Primordial Gnawer discovers when it dies; Geological Appraiser only if it was cast", () => {
    let { s, ap, ids } = setup([shock, appraiser]);
    const g = putOnBattlefield(s, ap, gnawer);
    s.objects[g]!.damage = 2;
    const [h] = stack(s, ap, [bear()]);
    s = cast(s, ap, ids[0]!, [{ kind: "object", id: g }]);
    s = passAll(s);
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: h });
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(s.players[ap]!.hand).toContain(h);
    // Put onto the battlefield, it doesn't trigger.
    const top = stack(s, ap, [bear()])[0]!;
    putOnBattlefield(s, ap, appraiser);
    expect(s.objects[top]!.zone).toBe("library");
    s = cast(s, ap, ids[1]!);
    s = passAll(s);
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: top });
  });

  it("discover X, where X is counted as the instruction starts: Dinosaur Egg's toughness as it last existed", () => {
    expect(compileCard(egg).triggers.find((x) => x.event === "selfDies")?.body.effects[0]).toMatchObject({ type: "may", effects: [{ type: "discover", n: { count: { kind: "toughness" } } }] });
    supported(egg, lode, hurl, pantlaza);
    let { s, ap, ids } = setup([shock]);
    const e = putOnBattlefield(s, ap, egg);
    s.objects[e]!.counters["+1/+1"] = 1; // a 1/4 now: discover 4
    s.objects[e]!.damage = 2;
    const [five, four] = stack(s, ap, [mv(5), mv(4)]);
    s = cast(s, ap, ids[0]!, [{ kind: "object", id: e }]);
    s = passAll(s);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: four });
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(s.players[ap]!.hand).toContain(four);
    expect(s.players[ap]!.library.at(-1)).toBe(five);
  });

  it("Hit the Mother Lode: tapped Treasures for the difference, after the discovered card is cast or kept", () => {
    let { s, ap, ids } = setup([lode, lode]);
    for (const d of [mountain, mountain, mountain]) putOnBattlefield(s, ap, d);
    const [h] = stack(s, ap, [mv(3)]);
    const treasures = () => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap);
    s = cast(s, ap, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: h });
    expect(treasures()).toHaveLength(0);
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(treasures()).toHaveLength(7);
    expect(treasures().every((id) => s.objects[id]!.tapped)).toBe(true);
    // With nothing to discover (an empty library), no card was discovered and there are no Treasures.
    for (const id of [...s.players[ap]!.library]) moveObject(s, id, "graveyard");
    s = cast(s, ap, ids[1]!);
    expect(s.pending).toBeNull();
    expect(treasures()).toHaveLength(7);
  });

  it("Hurl into History discovers X, the countered spell's mana value with its X (rulings)", () => {
    let { s, ap, ids, opp } = setup([hurl]);
    for (const d of [island, island, island, island]) putOnBattlefield(s, opp, d);
    const w = putOnBattlefield(s, opp, wanShiTong);
    s.battlefield.splice(s.battlefield.indexOf(w), 1);
    s.objects[w]!.zone = "hand";
    s.players[opp]!.hand.push(w);
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (const a of planCast(s, opp, w, undefined, undefined, undefined, 2)!) s = act(s, a);
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const [five, four] = stack(s, ap, [mv(5), mv(4)]);
    for (const a of planCast(s, ap, ids[0]!, [{ kind: "stack", id: s.stack.at(-1)!.id }])!) s = act(s, a);
    s = passAll(s);
    expect(s.objects[w]!.zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: four });
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(s.players[ap]!.library.at(-1)).toBe(five);
  });

  it("Pantlaza: X is the entering creature's toughness; once you discover, not again that turn", () => {
    const dino = (t: string) => card(`Raptor ${t}`, "Creature — Dinosaur", "{1}", { power: "1", toughness: t });
    let { s, ap, ids } = setup([dino("2"), dino("3")]);
    putOnBattlefield(s, ap, pantlaza);
    const [two] = stack(s, ap, [mv(2)]);
    s = cast(s, ap, ids[0]!);
    s = passAll(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay" });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: two });
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    const [one] = stack(s, ap, [mv(1)]);
    s = cast(s, ap, ids[1]!);
    s = passAll(s);
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.library[0]).toBe(one);
  });
});
