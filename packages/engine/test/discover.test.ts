// Discover N (CR 701.57a): exile cards from the top of your library until a nonland card with mana value N or less;
// you may cast it without paying its mana cost, and if you don't (or can't, rulings) it goes to your hand; the other
// exiled cards go on the bottom in a random order. "When ~ enters, if you cast it" (Geological Appraiser's rulings:
// from any zone, not when it's put onto the battlefield).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, forest, passAll, putOnBattlefield, setup } from "./helpers";
import { compileCard, isFullySupported, moveObject, planCast, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const daring = card("Daring Discovery", "Sorcery", "{4}{R}", { oracleText: "Up to three target creatures can't block this turn.\nDiscover 4. (Exile cards from the top of your library until you exile a nonland card with mana value 4 or less. Cast it without paying its mana cost or put it into your hand. Put the rest on the bottom in a random order.)" });
const gnawer = card("Primordial Gnawer", "Creature — Insect", "{4}{B}", { power: "5", toughness: "3", oracleText: "When this creature dies, discover 3. (Exile cards from the top of your library until you exile a nonland card with mana value 3 or less. Cast it without paying its mana cost or put it into your hand. Put the rest on the bottom in a random order.)" });
const appraiser = card("Geological Appraiser", "Creature — Human Artificer", "{2}{R}{R}", { power: "3", toughness: "2", oracleText: "When this creature enters, if you cast it, discover 3. (Exile cards from the top of your library until you exile a nonland card with mana value 3 or less. Cast it without paying its mana cost or put it into your hand. Put the rest on the bottom in a random order.)" });
const big = card("Colossal Dreadmaw", "Creature — Dinosaur", "{4}{G}{G}", { power: "6", toughness: "6", keywords: ["Trample"], oracleText: "Trample" });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });

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
});
