// Searching libraries (CR 701.23): tutors, land ramp, fetch lands and typecycling (CR 702.29e).

import { describe, expect, it } from "vitest";
import { act, card, island, passAll, putOnBattlefield, setup, swamp } from "./helpers";
import { botActions, compileCard, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const name = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return passAll(s);
};
/** Put a card into a player's library (on top unless `bottom`). */
function toLibrary(s: GameState, pid: PlayerId, def: CardDef, bottom = false) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  if (bottom) s.players[pid]!.library.push(id);
  else s.players[pid]!.library.unshift(id);
  return id;
}
const search = (s: GameState, pid: PlayerId, found: string[]) => passAll(act(s, { type: "searchLibrary", player: pid, found }));

const tutor = card("Demonic Tutor", "Sorcery", "{1}{B}", { oracleText: "Search your library for a card, put that card into your hand, then shuffle." });
const cultivate = card("Cultivate", "Sorcery", "{2}{G}", {
  oracleText: "Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.",
});
const vampiric = card("Vampiric Tutor", "Instant", "{B}", { oracleText: "Search your library for a card, then shuffle and put that card on top. You lose 2 life." });
const ranger = card("Borderland Ranger", "Creature — Human Scout", "{2}{G}", {
  power: "2",
  toughness: "2",
  oracleText: "When this creature enters, you may search your library for a basic land card, reveal it, put it into your hand, then shuffle.",
});
const ent = card("Generous Ent", "Creature — Treefolk", "{5}{G}", { power: "5", toughness: "7", oracleText: "Reach\nForestcycling {1}" });
const wilds = card("Evolving Wilds", "Land", "", { oracleText: "{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle." });
const wolf = card("Howling Wolf", "Creature — Wolf", "{2}{G}{G}", {
  power: "2",
  toughness: "2",
  oracleText: "When this creature enters, you may search your library for up to three cards named Howling Wolf, reveal them, put them into your hand, then shuffle.",
});
const nonbasic = card("Temple Garden", "Land — Forest Plains");
const gem = card("Gem", "Artifact", "{2}");

describe("searching a library (CR 701.23)", () => {
  it("compiles the common templates", () => {
    supported(tutor, cultivate, vampiric, ranger, ent, wilds, wolf);
    // An Aura put onto the battlefield needs something to enchant chosen (CR 303.4f): not supported.
    const auraFetch = card("Aura Fetch", "Sorcery", "{G}", { oracleText: "Search your library for an enchantment card, put it onto the battlefield, then shuffle." });
    expect(isFullySupported(auraFetch)).toBe(false);
    // "you may search ... then shuffle" is one optional instruction: the shuffle is part of it.
    const body = compileCard(ranger).triggers[0]!.body;
    expect(body.effects).toHaveLength(1);
    expect(body.effects[0]).toMatchObject({ type: "may", effects: [{ type: "search", reveal: true, dest: { zone: "hand" } }] });
  });

  it('"a card": must find one if the library has any (701.23d), it goes to your hand, and the library is shuffled', () => {
    const { s: s0, ap, ids } = setup([tutor]);
    const g = toLibrary(s0, ap, gem, true);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 1, max: 1 });
    expect(s.pending?.kind === "searchLibrary" && s.pending.cards.length).toBe(s.players[ap]!.library.length);
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [] })).toThrow(/find 1 card/);
    const size = s.players[ap]!.library.length;
    s = search(s, ap, [g]);
    expect(s.objects[g]!.zone).toBe("hand");
    expect(s.players[ap]!.library).toHaveLength(size - 1);
    // Not revealed (701.23e): the log doesn't name it.
    expect(logged(s, /finds a card, and shuffles/)).toBe(true);
    expect(logged(s, /Gem/)).toBe(false);
  });

  it("Cultivate: one land onto the battlefield tapped, the other to hand; with only one found, it goes onto the battlefield (rulings)", () => {
    const { s: s0, ap, ids } = setup([cultivate]);
    const isl = toLibrary(s0, ap, island, true);
    const sw = toLibrary(s0, ap, swamp, true);
    const tg = toLibrary(s0, ap, nonbasic, true);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const pend = s.pending;
    expect(pend).toMatchObject({ kind: "searchLibrary", min: 0, max: 2, firstTo: "onto the battlefield tapped", othersTo: "into your hand" });
    // Only basic lands match: not the Temple Garden, though it's a Forest.
    expect(pend?.kind === "searchLibrary" && pend.cards.includes(tg)).toBe(false);
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [tg] })).toThrow();
    const t = search(s, ap, [isl, sw]);
    expect(t.objects[isl]).toMatchObject({ zone: "battlefield", tapped: true });
    expect(t.objects[sw]!.zone).toBe("hand");
    expect(logged(t, /finds 2 cards \(Island, Swamp\)/)).toBe(true); // revealed
    s = search(s, ap, [sw]);
    expect(s.objects[sw]).toMatchObject({ zone: "battlefield", tapped: true });
  });

  it("with a stated quality you may find nothing, and still shuffle (701.23b)", () => {
    const { s: s0, ap, ids } = setup([cultivate]);
    const before = [...s0.players[ap]!.library];
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = search(s, ap, []);
    expect(logged(s, /searches their library and finds nothing, and shuffles/)).toBe(true);
    expect(s.players[ap]!.library).toHaveLength(before.length);
    expect(s.players[ap]!.library).not.toEqual(before);
  });

  it("Vampiric Tutor: shuffle, then the card on top; you lose 2 life", () => {
    const { s: s0, ap, ids } = setup([vampiric]);
    const g = toLibrary(s0, ap, gem, true);
    const life = s0.players[ap]!.life;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = search(s, ap, [g]);
    expect(s.players[ap]!.library[0]).toBe(g);
    expect(s.players[ap]!.life).toBe(life - 2);
  });

  it('"you may search": saying no means no search and no shuffle (rulings)', () => {
    const { s: s0, ap, ids } = setup([ranger]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    const before = [...s.players[ap]!.library];
    s = passAll(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.players[ap]!.library).toEqual(before);
    expect(logged(s, /shuffles/)).toBe(false);
  });

  it("Forestcycling: discard it to search for a Forest card, revealed, into your hand (702.29e); it counts as cycling (702.29f)", () => {
    const { s: s0, ap, ids } = setup([ent]);
    const ab = compileCard(ent).activated[0]!;
    expect(ab).toMatchObject({ zone: "hand", discardSelf: true, text: "Forestcycling {1}" });
    let s = run(s0, planActivate(s0, ap, ids[0]!, 0));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(logged(s, /cycles Generous Ent/)).toBe(true);
    const pend = s.pending;
    expect(pend).toMatchObject({ kind: "searchLibrary", what: "a Forest card", min: 0, max: 1 });
    const f = pend?.kind === "searchLibrary" ? pend.cards[0]! : "";
    expect(name(s, f)).toBe("Forest");
    s = search(s, ap, [f]);
    expect(s.objects[f]!.zone).toBe("hand");
    expect(logged(s, /finds a card \(Forest\)/)).toBe(true);
  });

  it("Evolving Wilds: sacrifice it, and the basic land enters tapped", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, wilds);
    let s = run(s0, planActivate(s0, ap, w, 0));
    expect(s.objects[w]!.zone).toBe("graveyard");
    const f = s.pending?.kind === "searchLibrary" ? s.pending.cards[0]! : "";
    s = search(s, ap, [f]);
    expect(s.objects[f]).toMatchObject({ zone: "battlefield", tapped: true, controller: ap });
  });

  it('"up to three cards named ~" finds only cards with its name', () => {
    const { s: s0, ap, ids } = setup([wolf]);
    const w2 = toLibrary(s0, ap, wolf, true);
    const w3 = toLibrary(s0, ap, wolf, true);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", cards: [w2, w3], max: 2, what: "up to 3 cards named Howling Wolf" });
    s = search(s, ap, [w2, w3]);
    expect([s.objects[w2]!.zone, s.objects[w3]!.zone]).toEqual(["hand", "hand"]);
  });

  it("a bot finds the most it can, lands of the type it has least of", () => {
    const { s: s0, ap, ids } = setup([cultivate]);
    toLibrary(s0, ap, island, true);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const [a] = botActions(s, ap);
    expect(a).toMatchObject({ type: "searchLibrary" });
    const found = (a as Extract<Action, { type: "searchLibrary" }>).found;
    expect(found).toHaveLength(2);
    // With three of each basic type out already, it takes two different lands rather than two of the same.
    expect(new Set(found.map((id) => name(s, id))).size).toBe(2);
    s = search(s, ap, found);
    expect(s.pending).toBeNull();
  });
});
