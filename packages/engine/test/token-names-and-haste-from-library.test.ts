// A creature token "with flying and haste named Hornet" has that name instead of its subtypes (CR 111.4). "That
// artifact gains haste" / "That Dragon gains haste" right after putting it onto the battlefield is the card just put
// there (Arms Race, Zirilan of the Claw); "Search your library for a basic Forest, Plains, or Island card" (Bant
// Panorama) finds any one of those basic land types (CR 205.3i, 305.8). "Sacrifice another permanent" (Korvold) is
// any other permanent its controller picks (CR 701.21a).

import { describe, expect, it } from "vitest";
import { act, activate, card, cast, forest, island, passUntil, plainsCard, putOnBattlefield, setup, swamp } from "./helpers";
import { characteristics, isFullySupported, objHasKeyword, planActivate, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

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
const newIds = (before: GameState, after: GameState) => after.battlefield.filter((id) => !before.battlefield.includes(id));
const nameOf = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;

// Real oracle text (Scryfall).
const hornet = card("Hornet Cannon", "Artifact", "{4}", { oracleText: "{3}, {T}: Create a 1/1 colorless Insect artifact creature token with flying and haste named Hornet. Destroy it at the beginning of the next end step." });
const lookout = card("Goldmeadow Lookout", "Creature — Kithkin Spellshaper", "{3}{W}", { power: "2", toughness: "2", oracleText: "{W}, {T}, Discard a card: Create a 1/1 white Kithkin Soldier creature token named Goldmeadow Harrier. It has \"{W}, {T}: Tap target creature.\"" });
const arms = card("Arms Race", "Enchantment", "{3}{R}", { oracleText: "{3}{R}: You may put an artifact card from your hand onto the battlefield. That artifact gains haste. Sacrifice it at the beginning of the next end step." });
const zirilan = card("Zirilan of the Claw", "Legendary Creature — Lizard Shaman", "{3}{R}{R}", { power: "3", toughness: "4", oracleText: "{1}{R}{R}, {T}: Search your library for a Dragon permanent card, put that card onto the battlefield, then shuffle. That Dragon gains haste until end of turn. Exile it at the beginning of the next end step." });
const growth = card("Rampaging Growth", "Instant", "{3}{G}", { oracleText: "Search your library for a basic land card, put it onto the battlefield, then shuffle. Until end of turn, that land becomes a 4/3 Insect creature with reach and haste. It's still a land." });
const korvold = card("Korvold, Fae-Cursed King", "Legendary Creature — Dragon Noble", "{2}{B}{R}{G}", { power: "4", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nWhenever Korvold enters or attacks, sacrifice another permanent.\nWhenever you sacrifice a permanent, put a +1/+1 counter on Korvold and draw a card." });
const panorama = card("Bant Panorama", "Land", "", { oracleText: "{T}: Add {C}.\n{1}, {T}, Sacrifice this land: Search your library for a basic Forest, Plains, or Island card, put it onto the battlefield tapped, then shuffle." });
const trebuchet = card("Fire Navy Trebuchet", "Artifact Creature — Wall", "{2}{B}", { power: "0", toughness: "4", keywords: ["Defender", "Reach"], oracleText: "Defender, reach\nWhenever you attack, create a 2/1 colorless Construct artifact creature token with flying named Ballistic Boulder that's tapped and attacking. Sacrifice that token at the beginning of the next end step." });

const relic = card("Test Relic", "Artifact Creature — Golem", "{5}", { power: "5", toughness: "5" });
const dragon = card("Test Dragon", "Creature — Dragon", "{4}{R}{R}", { power: "5", toughness: "5", keywords: ["Flying"] });
const basicSwampForest = card("Test Swampy", "Basic Land — Swamp");

describe("named tokens and haste for what was just put onto the battlefield", () => {
  it("parse", () => supported(hornet, lookout, arms, zirilan, growth, korvold, panorama, trebuchet));

  it("Hornet Cannon: a token named Hornet with flying and haste, destroyed at the next end step", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, hornet);
    const s1 = untilChoice(activate(s0, ap, c, 0));
    const [t] = newIds(s0, s1).filter((id) => id !== c && s1.objects[id]!.isToken);
    expect(t).toBeDefined();
    expect(nameOf(s1, t!)).toBe("Hornet");
    expect(objHasKeyword(s1, s1.objects[t!]!, "Flying")).toBe(true);
    expect(objHasKeyword(s1, s1.objects[t!]!, "Haste")).toBe(true);
    let s = untilChoice(passUntil(s1, "end", ap));
    s = untilChoice(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.battlefield).not.toContain(t);
  });

  it("Goldmeadow Lookout: discard a card for a Goldmeadow Harrier that can tap a creature", () => {
    const { s: s0, ap, ids, opp } = setup([relic]);
    const l = putOnBattlefield(s0, ap, lookout);
    const plan = planActivate(s0, ap, l, 0, undefined, undefined, undefined, undefined, { discard: [ids[0]!] });
    expect(plan).not.toBeNull();
    let s = s0;
    for (const a of plan!) s = act(s, a);
    s = untilChoice(s);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    const [t] = newIds(s0, s).filter((id) => s.objects[id]!.isToken);
    expect(nameOf(s, t!)).toBe("Goldmeadow Harrier");
    // Its own ability: tap target creature (the token has summoning sickness, so that waits a turn).
    s.objects[t!]!.controlledSinceTurn = s.turn - 1;
    const victim = putOnBattlefield(s, opp, relic);
    s = untilChoice(activate(s, ap, t!, 0, [{ kind: "object", id: victim }]));
    expect(s.objects[victim]!.tapped).toBe(true);
  });

  it("Arms Race: the artifact put from the hand gains haste and is sacrificed at the next end step", () => {
    const { s: s0, ap, ids } = setup([relic]);
    const a = putOnBattlefield(s0, ap, arms);
    let s = untilChoice(activate(s0, ap, a, 0));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", fromHand: true, cards: [ids[0]] });
    s = untilChoice(act(s, { type: "searchLibrary", player: ap, found: [ids[0]!] }));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Haste")).toBe(true);
    s = untilChoice(passUntil(s, "end", ap));
    s = untilChoice(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("Zirilan of the Claw: a Dragon from the library gains haste and is exiled at the next end step", () => {
    const { s: s0, ap } = setup([]);
    const z = putOnBattlefield(s0, ap, zirilan);
    const d = toZone(s0, ap, dragon, "library");
    const other = toZone(s0, ap, relic, "library");
    let s = untilChoice(activate(s0, ap, z, 0));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    if (s.pending?.kind !== "searchLibrary") throw new Error("no search");
    expect(s.pending.cards).toContain(d);
    expect(s.pending.cards).not.toContain(other);
    s = untilChoice(act(s, { type: "searchLibrary", player: ap, found: [d] }));
    expect(s.objects[d]!.zone).toBe("battlefield");
    expect(objHasKeyword(s, s.objects[d]!, "Haste")).toBe(true);
    s = untilChoice(passUntil(s, "end", ap));
    s = untilChoice(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.objects[d]!.zone).toBe("exile");
  });

  it("Rampaging Growth: the land found becomes a 4/3 Insect with reach and haste until end of turn", () => {
    const { s: s0, ap, ids } = setup([growth]);
    const f = toZone(s0, ap, forest, "library");
    let s = untilChoice(cast(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = untilChoice(act(s, { type: "searchLibrary", player: ap, found: [f] }));
    const c = characteristics(s, s.objects[f]!);
    expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(c.subtypes).toEqual(expect.arrayContaining(["Forest", "Insect"]));
    expect([c.power, c.toughness]).toEqual([4, 3]);
    expect(objHasKeyword(s, s.objects[f]!, "Reach")).toBe(true);
    expect(objHasKeyword(s, s.objects[f]!, "Haste")).toBe(true);
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(characteristics(s, s.objects[f]!).types).not.toContain("Creature");
  });

  it("Korvold: entering sacrifices another permanent, then grows and draws", () => {
    const { s: s0, ap, ids } = setup([korvold]);
    const hand = s0.players[ap]!.hand.length;
    let s = untilChoice(cast(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "sacrifice" });
    if (s.pending?.kind !== "pickPermanents") throw new Error("no pick");
    expect(s.pending.options).not.toContain(ids[0]);
    const land = s.pending.options[0]!;
    s = untilChoice(act(s, { type: "pickPermanents", player: ap, ids: [land] }));
    expect(s.objects[land]!.zone).toBe("graveyard");
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
    expect(s.players[ap]!.hand.length).toBe(hand);
  });

  it("Bant Panorama: finds a basic Forest, Plains or Island, but not a Swamp", () => {
    const { s: s0, ap } = setup([]);
    const p = putOnBattlefield(s0, ap, panorama);
    const i = toZone(s0, ap, island, "library");
    const pl = toZone(s0, ap, plainsCard, "library");
    const sw = toZone(s0, ap, swamp, "library");
    const sf = toZone(s0, ap, basicSwampForest, "library");
    let s = untilChoice(activate(s0, ap, p, 0));
    expect(s.objects[p]!.zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 1 });
    if (s.pending?.kind !== "searchLibrary") throw new Error("no search");
    expect(s.pending.cards).toEqual(expect.arrayContaining([i, pl]));
    expect(s.pending.cards).not.toContain(sw);
    expect(s.pending.cards).not.toContain(sf);
    s = untilChoice(act(s, { type: "searchLibrary", player: ap, found: [i] }));
    expect(s.objects[i]!).toMatchObject({ zone: "battlefield", tapped: true });
  });
});
