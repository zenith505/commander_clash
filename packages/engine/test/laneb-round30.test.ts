// Lane B, round 30: "with the same name as ..." searches and exiles (CR 201.2), least played first
// (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty, answering choices as the bots would; the choices a test makes stop it. */
const settle = (s: GameState, stopAt: (s: GameState) => boolean = () => false) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (stopAt(s)) break;
    const p = s.pending;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const at = (kind: string, pid: PlayerId) => (s: GameState) => s.pending?.kind === kind && s.pending.player === pid;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const nameOf = (s: GameState, id: string) => s.cards[s.objects[id]!.copyOf ?? s.objects[id]!.cardId]!.name;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], x?: number, choices: CostChoices = {}) => run(s, planCast(s, pid, id, targets, undefined, "auto", x, choices));
const activateNow = (s: GameState, pid: PlayerId, id: string, index: number, targets: TargetChoice[] = []) => run(s, planActivate(s, pid, id, index, targets));
/** Moves a new card for `def` into `pid`'s hand, library (on top) or graveyard. */
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** The cards a search offers, by name, sorted. */
const offered = (s: GameState) => (s.pending?.kind === "searchLibrary" ? s.pending.cards.map((id) => nameOf(s, id)).sort() : null);
const search = (s: GameState, pid: PlayerId, found: string[]) => act(s, { type: "searchLibrary", player: pid, found });
const yes = (s: GameState, pid: PlayerId) => act(s, { type: "chooseMay", player: pid, yes: true });
const cleanHand = (s: GameState, pid: PlayerId, keep: string[] = []) => {
  for (const id of s.players[pid]!.hand.filter((x) => !keep.includes(x))) s.objects[id]!.zone = "exile";
  s.players[pid]!.hand = s.players[pid]!.hand.filter((x) => keep.includes(x));
};

// Real oracle text (Scryfall).
const bifurcate = () => card("Bifurcate", "Sorcery", "{3}{G}", { cmc: 4, colors: ["G"], oracleText: "Search your library for a permanent card with the same name as target nontoken creature, put that card onto the battlefield, then shuffle." });
const maskOfTheMimic = () => card("Mask of the Mimic", "Instant", "{U}", { cmc: 1, colors: ["U"], oracleText: "As an additional cost to cast this spell, sacrifice a creature.\nSearch your library for a card with the same name as target nontoken creature, put that card onto the battlefield, then shuffle." });
const packHunt = () => card("Pack Hunt", "Sorcery", "{3}{G}", { cmc: 4, colors: ["G"], oracleText: "Search your library for up to three cards with the same name as target creature, reveal them, put them into your hand, then shuffle." });
const secretSalvage = () => card("Secret Salvage", "Sorcery", "{3}{B}{B}", { cmc: 5, colors: ["B"], oracleText: "Exile target nonland card from your graveyard. Search your library for any number of cards with the same name as that card, reveal them, put them into your hand, then shuffle." });
const remembrance = () => card("Remembrance", "Enchantment", "{3}{W}", { cmc: 4, colors: ["W"], oracleText: "Whenever a nontoken creature you control dies, you may search your library for a card with the same name as that creature, reveal it, put it into your hand, then shuffle." });
const verdantSuccession = () => card("Verdant Succession", "Enchantment", "{4}{G}", { cmc: 5, colors: ["G"], oracleText: "Whenever a green nontoken creature dies, that creature's controller may search their library for a card with the same name as that creature, put it onto the battlefield, then shuffle." });
const patternMatcher = () => card("Pattern Matcher", "Artifact Creature — Golem", "{4}", { cmc: 4, power: "3", toughness: "3", oracleText: "When this creature enters, you may search your library for a card with the same name as another creature you control, reveal it, put it into your hand, then shuffle." });
const frostpyreArcanist = () => card("Frostpyre Arcanist", "Creature — Giant Wizard", "{4}{U}", { cmc: 5, colors: ["U"], power: "2", toughness: "5", oracleText: "This spell costs {1} less to cast if you control a Giant or a Wizard.\nWhen this creature enters, search your library for an instant or sorcery card with the same name as a card in your graveyard, reveal it, put it into your hand, then shuffle." });
const assemblyHall = () => card("Assembly Hall", "Artifact", "{5}", { cmc: 5, oracleText: "{4}, {T}: Reveal a creature card in your hand. Search your library for a card with the same name as that card, reveal it, put it into your hand, then shuffle." });
const infernalTutor = () => card("Infernal Tutor", "Sorcery", "{1}{B}", { cmc: 2, colors: ["B"], keywords: ["Hellbent"], oracleText: "Reveal a card from your hand. Search your library for a card with the same name as that card, reveal it, put it into your hand, then shuffle.\nHellbent — If you have no cards in hand, instead search your library for a card, put it into your hand, then shuffle." });
const hauntingEchoes = () => card("Haunting Echoes", "Sorcery", "{3}{B}{B}", { cmc: 5, colors: ["B"], oracleText: "Exile all cards from target player's graveyard other than basic land cards. For each card exiled this way, search that player's library for all cards with the same name as that card and exile them. Then that player shuffles." });
const deicide = () => card("Deicide", "Instant", "{1}{W}", { cmc: 2, colors: ["W"], oracleText: "Exile target enchantment. If the exiled card is a God card, search its controller's graveyard, hand, and library for any number of cards with the same name as that card and exile them. Then that player shuffles." });
const pickTheBrain = () => card("Pick the Brain", "Sorcery", "{2}{B}", { cmc: 3, colors: ["B"], keywords: ["Delirium"], oracleText: "Target opponent reveals their hand. You choose a nonland card from it and exile that card.\nDelirium — If there are four or more card types among cards in your graveyard, search that player's graveyard, hand, and library for any number of cards with the same name as the exiled card, exile those cards, then that player shuffles." });
const invasiveSurgery = () => card("Invasive Surgery", "Instant", "{U}", { cmc: 1, colors: ["U"], keywords: ["Delirium"], oracleText: "Counter target sorcery spell.\nDelirium — If there are four or more card types among cards in your graveyard, search the graveyard, hand, and library of that spell's controller for any number of cards with the same name as that spell, exile those cards, then that player shuffles." });
const hourOfGlory = () => card("Hour of Glory", "Instant", "{3}{B}", { cmc: 4, colors: ["B"], oracleText: "Exile target creature. If that creature was a God, its controller reveals their hand and exiles all cards from it with the same name as that creature." });
const doublingChant = () => card("Doubling Chant", "Sorcery", "{5}{G}", { cmc: 6, colors: ["G"], oracleText: "For each creature you control, you may search your library for a creature card with the same name as that creature. Put those cards onto the battlefield, then shuffle." });
const dichotomancy = () => card("Dichotomancy", "Sorcery", "{7}{U}{U}", { cmc: 9, colors: ["U"], keywords: ["Suspend"], oracleText: "For each tapped nonland permanent target opponent controls, search that player's library for a card with the same name as that permanent. Put those cards onto the battlefield under your control, then that player shuffles.\nSuspend 3—{1}{U}{U} (Rather than cast this card from your hand, you may pay {1}{U}{U} and exile it with three time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost.)" });
const llanowarElves = () => card("Llanowar Elves", "Creature — Elf Druid", "{G}", { cmc: 1, colors: ["G"], power: "1", toughness: "1", oracleText: "{T}: Add {G}." });
const clone = () => card("Clone", "Creature — Shapeshifter", "{3}{U}", { cmc: 4, colors: ["U"], power: "0", toughness: "0", oracleText: "You may have this creature enter as a copy of any creature on the battlefield." });
const heliod = () => card("Heliod, God of the Sun", "Legendary Enchantment Creature — God", "{3}{W}", { cmc: 4, colors: ["W"], power: "5", toughness: "6", keywords: ["Indestructible"], oracleText: "Indestructible\nAs long as your devotion to white is less than five, Heliod isn't a creature. (Each {W} in the mana costs of permanents you control counts toward your devotion to white.)\nOther creatures you control have vigilance.\n{2}{W}{W}: Create a 2/1 white Cleric enchantment creature token." });
const lightningBolt = () => card("Lightning Bolt", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Lightning Bolt deals 3 damage to any target." });
const giantGrowth = () => card("Giant Growth", "Instant", "{G}", { cmc: 1, colors: ["G"], oracleText: "Target creature gets +3/+3 until end of turn." });
const divination = () => card("Divination", "Sorcery", "{2}{U}", { cmc: 3, colors: ["U"], oracleText: "Draw two cards." });
const glorious = () => card("Glorious Anthem", "Enchantment", "{1}{W}{W}", { cmc: 3, colors: ["W"], oracleText: "Creatures you control get +1/+1." });
const ornithopter = () => card("Ornithopter", "Artifact Creature — Thopter", "{0}", { cmc: 0, power: "0", toughness: "2", keywords: ["Flying"], oracleText: "Flying" });
const solRing = () => card("Sol Ring", "Artifact", "{1}", { cmc: 1, oracleText: "{T}: Add {C}{C}." });
/** A God that's always a creature, for Hour of Glory. */
const testGod = () => card("Test God", "Legendary Creature — God", "{2}{B}", { cmc: 3, colors: ["B"], power: "4", toughness: "4" });
const swampCard = () => card("Swamp", "Basic Land — Swamp", "", { cmc: 0 });

describe("Lane B round 30", () => {
  it("compiles every card fully", () => {
    supported(bifurcate(), maskOfTheMimic(), packHunt(), secretSalvage(), remembrance(), verdantSuccession(), patternMatcher(), frostpyreArcanist(), assemblyHall());
    supported(infernalTutor(), hauntingEchoes(), deicide(), pickTheBrain(), invasiveSurgery(), hourOfGlory(), doublingChant(), dichotomancy());
  });
});

describe("Searching for a card with the same name as a target (CR 201.2)", () => {
  it("Bifurcate: an opponent's Llanowar Elves, found in your own library; the search may find nothing (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([bifurcate()]);
    const elves = putOnBattlefield(s0, opp, llanowarElves());
    const mine = toZone(s0, ap, llanowarElves(), "library");
    toZone(s0, ap, giantGrowth(), "library");
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(elves)]), at("searchLibrary", ap));
    expect(offered(s)).toEqual(["Llanowar Elves"]);
    expect(s.pending?.kind === "searchLibrary" && s.pending.min).toBe(0);
    s = settle(search(s, ap, [mine]));
    expect(zone(s, mine)).toBe("battlefield");
    expect(s.objects[mine]!.controller).toBe(ap);
  });

  it("Bifurcate: a token can't be targeted", () => {
    const { s: s0, ap, ids } = setup([bifurcate()]);
    const tok = putOnBattlefield(s0, ap, llanowarElves());
    s0.objects[tok]!.isToken = true;
    expect(planCast(s0, ap, ids[0]!, [tgt(tok)])).toBeNull();
  });

  it("Mask of the Mimic: a Clone copying Llanowar Elves has its name, so you find Llanowar Elves (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([maskOfTheMimic()]);
    const fodder = putOnBattlefield(s0, ap, ornithopter());
    const elf = llanowarElves();
    s0.cards[elf.oracleId] = elf;
    const cl = putOnBattlefield(s0, opp, clone());
    s0.objects[cl]!.copyOf = elf.oracleId;
    invalidateCharacteristics(s0);
    const mine = toZone(s0, ap, llanowarElves(), "library");
    toZone(s0, ap, clone(), "library");
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(cl)], undefined, { sacrifice: [fodder] }), at("searchLibrary", ap));
    expect(zone(s, fodder)).toBe("graveyard");
    expect(offered(s)).toEqual(["Llanowar Elves"]);
    s = settle(search(s, ap, [mine]));
    expect(zone(s, mine)).toBe("battlefield");
  });

  it("Pack Hunt: up to three cards with that name into your hand", () => {
    const { s: s0, ap, ids, opp } = setup([packHunt()]);
    const elves = putOnBattlefield(s0, opp, llanowarElves());
    const lib = [0, 1, 2, 3].map(() => toZone(s0, ap, llanowarElves(), "library"));
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(elves)]), at("searchLibrary", ap));
    expect(offered(s)).toEqual(["Llanowar Elves", "Llanowar Elves", "Llanowar Elves", "Llanowar Elves"]);
    expect(s.pending?.kind === "searchLibrary" && s.pending.max).toBe(3);
    s = settle(search(s, ap, lib.slice(0, 3)));
    expect(lib.map((id) => zone(s, id))).toEqual(["hand", "hand", "hand", "library"]);
  });

  it("Secret Salvage: the card exiled from your graveyard names the cards found", () => {
    const { s: s0, ap, ids } = setup([secretSalvage()]);
    const yard = toZone(s0, ap, lightningBolt(), "graveyard");
    const lib = [toZone(s0, ap, lightningBolt(), "library"), toZone(s0, ap, lightningBolt(), "library")];
    toZone(s0, ap, giantGrowth(), "library");
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(yard)]), at("searchLibrary", ap));
    expect(zone(s, yard)).toBe("exile");
    expect(offered(s)).toEqual(["Lightning Bolt", "Lightning Bolt"]);
    s = settle(search(s, ap, lib));
    expect(lib.map((id) => zone(s, id))).toEqual(["hand", "hand"]);
  });
});

describe("Searching for a card with the same name as the creature that died, or the spell cast", () => {
  it("Remembrance: a nontoken creature you control dies; its name as it last existed (a Clone's copied name, rulings)", () => {
    const { s: s0, ap, ids } = setup([lightningBolt()]);
    putOnBattlefield(s0, ap, remembrance());
    const elf = llanowarElves();
    s0.cards[elf.oracleId] = elf;
    const cl = putOnBattlefield(s0, ap, clone());
    s0.objects[cl]!.copyOf = elf.oracleId;
    invalidateCharacteristics(s0);
    const mine = toZone(s0, ap, llanowarElves(), "library");
    toZone(s0, ap, clone(), "library");
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(cl)]), at("chooseMay", ap));
    expect(zone(s, cl)).toBe("graveyard");
    s = settle(yes(s, ap), at("searchLibrary", ap));
    expect(offered(s)).toEqual(["Llanowar Elves"]);
    s = settle(search(s, ap, [mine]));
    expect(zone(s, mine)).toBe("hand");
  });

  it("Remembrance: a token dying doesn't trigger it", () => {
    const { s: s0, ap, ids } = setup([lightningBolt()]);
    putOnBattlefield(s0, ap, remembrance());
    const tok = putOnBattlefield(s0, ap, llanowarElves());
    s0.objects[tok]!.isToken = true;
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(tok)]), at("chooseMay", ap));
    expect(s.pending).toBeNull();
  });

  it("Verdant Succession: the creature's controller searches their own library and puts it onto the battlefield", () => {
    const { s: s0, ap, ids, opp } = setup([lightningBolt()]);
    putOnBattlefield(s0, ap, verdantSuccession());
    const elves = putOnBattlefield(s0, opp, llanowarElves());
    const theirs = toZone(s0, opp, llanowarElves(), "library");
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(elves)]), at("chooseMay", opp));
    s = settle(yes(s, opp), at("searchLibrary", opp));
    expect(offered(s)).toEqual(["Llanowar Elves"]);
    s = settle(search(s, opp, [theirs]));
    expect(zone(s, theirs)).toBe("battlefield");
    expect(s.objects[theirs]!.controller).toBe(opp);
  });
});

describe("Searching for a card with the same name as a permanent or card you have", () => {
  it("Pattern Matcher: another creature you control, not itself; a second one finds a third (rulings)", () => {
    const { s: s0, ap, ids } = setup([patternMatcher()]);
    putOnBattlefield(s0, ap, llanowarElves());
    toZone(s0, ap, llanowarElves(), "library");
    const third = toZone(s0, ap, patternMatcher(), "library");
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseMay", ap));
    s = settle(yes(s, ap), at("searchLibrary", ap));
    expect(offered(s)).toEqual(["Llanowar Elves"]);
    s = settle(search(s, ap, []));
    // A second Pattern Matcher can look at the first.
    const second = toZone(s, ap, patternMatcher(), "hand");
    s = settle(castNow(s, ap, second), at("chooseMay", ap));
    s = settle(yes(s, ap), at("searchLibrary", ap));
    expect(offered(s)).toEqual(["Llanowar Elves", "Pattern Matcher"]);
    s = settle(search(s, ap, [third]));
    expect(zone(s, third)).toBe("hand");
  });

  it("Frostpyre Arcanist: an instant or sorcery card with the same name as a card in your graveyard", () => {
    const { s: s0, ap, ids } = setup([frostpyreArcanist()]);
    toZone(s0, ap, lightningBolt(), "graveyard");
    toZone(s0, ap, llanowarElves(), "graveyard");
    const bolt = toZone(s0, ap, lightningBolt(), "library");
    toZone(s0, ap, giantGrowth(), "library");
    toZone(s0, ap, llanowarElves(), "library");
    let s = settle(castNow(s0, ap, ids[0]!), at("searchLibrary", ap));
    expect(offered(s)).toEqual(["Lightning Bolt"]);
    s = settle(search(s, ap, [bolt]));
    expect(zone(s, bolt)).toBe("hand");
  });

  it("Doubling Chant: one creature card for each creature you control, matched by name", () => {
    const { s: s0, ap, ids } = setup([doublingChant()]);
    putOnBattlefield(s0, ap, llanowarElves());
    putOnBattlefield(s0, ap, llanowarElves());
    putOnBattlefield(s0, ap, ornithopter());
    const elves = [0, 1, 2].map(() => toZone(s0, ap, llanowarElves(), "library"));
    const thopter = toZone(s0, ap, ornithopter(), "library");
    toZone(s0, ap, solRing(), "library");
    let s = settle(castNow(s0, ap, ids[0]!), at("searchLibrary", ap));
    expect(new Set(offered(s))).toEqual(new Set(["Llanowar Elves", "Ornithopter"]));
    // Two Llanowar Elves on the battlefield: no third one.
    expect(() => search(s, ap, elves)).toThrow();
    s = settle(search(s, ap, [elves[0]!, elves[1]!, thopter]));
    expect([...elves.map((id) => zone(s, id)), zone(s, thopter)]).toEqual(["battlefield", "battlefield", "library", "battlefield"]);
  });

  it("Doubling Chant: with no creatures you still search (finding nothing) and shuffle (rulings)", () => {
    const { s: s0, ap, ids } = setup([doublingChant()]);
    toZone(s0, ap, llanowarElves(), "library");
    let s = settle(castNow(s0, ap, ids[0]!), at("searchLibrary", ap));
    expect(s.pending?.kind === "searchLibrary" && s.pending.max).toBe(0);
    const before = [...s.players[ap]!.library];
    s = settle(search(s, ap, []));
    expect(s.players[ap]!.library).not.toEqual(before);
  });

  it("Dichotomancy: the tapped nonland permanents target opponent controls, found in their library, enter under your control", () => {
    const { s: s0, ap, ids, opp } = setup([dichotomancy()]);
    for (let i = 0; i < 6; i++) putOnBattlefield(s0, ap, card(`Island ${i}`, "Basic Land — Island"));
    const tappedElves = putOnBattlefield(s0, opp, llanowarElves());
    s0.objects[tappedElves]!.tapped = true;
    putOnBattlefield(s0, opp, ornithopter());
    const land = putOnBattlefield(s0, opp, swampCard());
    s0.objects[land]!.tapped = true;
    const theirElves = toZone(s0, opp, llanowarElves(), "library");
    toZone(s0, opp, ornithopter(), "library");
    toZone(s0, opp, swampCard(), "library");
    let s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]), at("searchLibrary", ap));
    expect(offered(s)).toEqual(["Llanowar Elves"]);
    s = settle(search(s, ap, [theirElves]));
    expect(zone(s, theirElves)).toBe("battlefield");
    expect(s.objects[theirElves]!.controller).toBe(ap);
  });
});

describe("Revealing a card from your hand, then searching for its name", () => {
  it("Assembly Hall: a creature card must be revealed if there is one; only it is offered", () => {
    const { s: s0, ap, ids } = setup([llanowarElves(), lightningBolt()]);
    cleanHand(s0, ap, ids);
    const hall = putOnBattlefield(s0, ap, assemblyHall());
    const elf = toZone(s0, ap, llanowarElves(), "library");
    toZone(s0, ap, lightningBolt(), "library");
    let s = settle(activateNow(s0, ap, hall, 0), at("searchLibrary", ap));
    expect(s.pending?.kind === "searchLibrary" && s.pending.fromHand && [s.pending.cards, s.pending.min]).toEqual([[ids[0]!], 1]);
    s = settle(search(s, ap, [ids[0]!]), at("searchLibrary", ap));
    expect(offered(s)).toEqual(["Llanowar Elves"]);
    s = settle(search(s, ap, [elf]));
    expect(zone(s, elf)).toBe("hand");
    expect(zone(s, ids[0]!)).toBe("hand");
  });

  it("Infernal Tutor: the revealed card's name; hellbent, any card instead", () => {
    const { s: s0, ap, ids } = setup([infernalTutor(), lightningBolt()]);
    cleanHand(s0, ap, ids);
    const bolt = toZone(s0, ap, lightningBolt(), "library");
    const growth = toZone(s0, ap, giantGrowth(), "library");
    let s = settle(castNow(s0, ap, ids[0]!), at("searchLibrary", ap));
    s = settle(search(s, ap, [ids[1]!]), at("searchLibrary", ap));
    expect(offered(s)).toEqual(["Lightning Bolt"]);
    s = settle(search(s, ap, [bolt]));
    expect(zone(s, bolt)).toBe("hand");
    // Hellbent: no cards in hand as it resolves, so any card.
    const { s: h0, ap: hp, ids: hids } = setup([infernalTutor()]);
    cleanHand(h0, hp, hids);
    const g2 = toZone(h0, hp, giantGrowth(), "library");
    let h = settle(castNow(h0, hp, hids[0]!), at("searchLibrary", hp));
    expect(h.pending?.kind === "searchLibrary" && h.pending.cards.length).toBeGreaterThan(50);
    h = settle(search(h, hp, [g2]));
    expect(zone(h, g2)).toBe("hand");
    expect(growth).toBeDefined();
  });
});

describe("Exiling the cards with the same name", () => {
  it("Haunting Echoes: every nonbasic card in that graveyard, then any of the cards with those names in that library", () => {
    const { s: s0, ap, ids, opp } = setup([hauntingEchoes()]);
    const yardBolt = toZone(s0, opp, lightningBolt(), "graveyard");
    const yardElves = toZone(s0, opp, llanowarElves(), "graveyard");
    const yardSwamp = toZone(s0, opp, swampCard(), "graveyard");
    const libBolt = toZone(s0, opp, lightningBolt(), "library");
    const libElves = toZone(s0, opp, llanowarElves(), "library");
    toZone(s0, opp, giantGrowth(), "library");
    let s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]), at("searchLibrary", ap));
    expect([zone(s, yardBolt), zone(s, yardElves), zone(s, yardSwamp)]).toEqual(["exile", "exile", "graveyard"]);
    expect(offered(s)).toEqual(["Lightning Bolt", "Llanowar Elves"]);
    // The searcher may leave some (rulings).
    s = settle(search(s, ap, [libBolt]));
    expect([zone(s, libBolt), zone(s, libElves)]).toEqual(["exile", "library"]);
  });

  it("Deicide: a God card exiled also exiles its controller's cards with that name; another enchantment, nothing more", () => {
    const { s: s0, ap, ids, opp } = setup([deicide(), deicide()]);
    const god = putOnBattlefield(s0, opp, heliod());
    const inHand = toZone(s0, opp, heliod(), "hand");
    const inLib = toZone(s0, opp, heliod(), "library");
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(god)]), at("searchLibrary", ap));
    expect(zone(s, god)).toBe("exile");
    expect(offered(s)).toEqual(["Heliod, God of the Sun", "Heliod, God of the Sun"]);
    s = settle(search(s, ap, [inHand, inLib]));
    expect([zone(s, inHand), zone(s, inLib)]).toEqual(["exile", "exile"]);
    const aura = putOnBattlefield(s, opp, glorious());
    const auraInHand = toZone(s, opp, glorious(), "hand");
    s = settle(castNow(s, ap, ids[1]!, [tgt(aura)]), at("searchLibrary", ap));
    expect(s.pending).toBeNull();
    expect([zone(s, aura), zone(s, auraInHand)]).toEqual(["exile", "hand"]);
  });

  it("Pick the Brain: with delirium, the other cards named as the exiled one too; without, only that card", () => {
    const { s: s0, ap, ids, opp } = setup([pickTheBrain(), pickTheBrain()]);
    const bolt = toZone(s0, opp, lightningBolt(), "hand");
    const boltYard = toZone(s0, opp, lightningBolt(), "graveyard");
    let s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]), at("searchLibrary", ap));
    s = settle(search(s, ap, [bolt]), at("searchLibrary", ap));
    expect(zone(s, bolt)).toBe("exile");
    expect(zone(s, boltYard)).toBe("graveyard");
    // Delirium: an artifact, a creature, an instant and a land in your graveyard.
    for (const d of [solRing(), llanowarElves(), giantGrowth(), swampCard()]) toZone(s, ap, d, "graveyard");
    const bolt2 = toZone(s, opp, lightningBolt(), "hand");
    s = settle(castNow(s, ap, ids[1]!, [ply(opp)]), at("searchLibrary", ap));
    s = settle(search(s, ap, [bolt2]), at("searchLibrary", ap));
    expect(offered(s)).toEqual(["Lightning Bolt"]);
    s = settle(search(s, ap, [boltYard]));
    expect([zone(s, bolt2), zone(s, boltYard)]).toEqual(["exile", "exile"]);
  });

  it("Invasive Surgery: with delirium, the countered sorcery's name; the countered spell counts if it's yours (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([invasiveSurgery()]);
    const div = toZone(s0, opp, divination(), "hand");
    const divLib = toZone(s0, opp, divination(), "library");
    for (const d of [solRing(), llanowarElves(), giantGrowth(), swampCard()]) toZone(s0, ap, d, "graveyard");
    // The opponent casts Divination in their main phase; you counter it.
    let s = passUntil(s0, "main1", opp);
    s.players[opp]!.manaPool.U = 3;
    s = run(s, planCast(s, opp, div));
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const item = s.stack[s.stack.length - 1]!;
    s = settle(castNow(s, ap, ids[0]!, [{ kind: "stack", id: item.id }]), at("searchLibrary", ap));
    expect(zone(s, div)).toBe("graveyard");
    expect(offered(s)).toEqual(["Divination", "Divination"]);
    s = settle(search(s, ap, [div, divLib]));
    expect([zone(s, div), zone(s, divLib)]).toEqual(["exile", "exile"]);
  });

  it("Hour of Glory: a God's controller reveals their hand and exiles every card there with its name; another creature, only it", () => {
    const { s: s0, ap, ids, opp } = setup([hourOfGlory(), hourOfGlory()]);
    const god = putOnBattlefield(s0, opp, testGod());
    const inHand = toZone(s0, opp, testGod(), "hand");
    const inLib = toZone(s0, opp, testGod(), "library");
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(god)]));
    expect([zone(s, god), zone(s, inHand), zone(s, inLib)]).toEqual(["exile", "exile", "library"]);
    const elves = putOnBattlefield(s, opp, llanowarElves());
    const elvesInHand = toZone(s, opp, llanowarElves(), "hand");
    s = settle(castNow(s, ap, ids[1]!, [tgt(elves)]));
    expect([zone(s, elves), zone(s, elvesInHand)]).toEqual(["exile", "hand"]);
  });
  it("bot: Bifurcate targets the creature whose name its library still has, and isn't cast when none has", () => {
    const { s: s0, ap, ids, opp } = setup([bifurcate()]);
    cleanHand(s0, ap, ids);
    s0.players[ap]!.isBot = true;
    s0.players[ap]!.landsPlayedThisTurn = 1;
    putOnBattlefield(s0, opp, llanowarElves());
    const thopter = putOnBattlefield(s0, opp, ornithopter());
    const empty = JSON.parse(JSON.stringify(s0)) as GameState;
    toZone(s0, ap, ornithopter(), "library");
    expect(botActions(s0, ap).find((a) => a.type === "castSpell")).toMatchObject({ objectId: ids[0], targets: [tgt(thopter)] });
    expect(botActions(empty, ap).find((a) => a.type === "castSpell" && a.objectId === ids[0])).toBeUndefined();
  });

  it("bot: Assembly Hall reveals the creature card that has a copy left in the library", () => {
    const { s: s0, ap, ids } = setup([clone(), llanowarElves()]);
    cleanHand(s0, ap, ids);
    const hall = putOnBattlefield(s0, ap, assemblyHall());
    const elf = toZone(s0, ap, llanowarElves(), "library");
    const s = settle(activateNow(s0, ap, hall, 0));
    expect(zone(s, elf)).toBe("hand");
  });
});
