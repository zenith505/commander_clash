// Lane B round B99: fortify (CR 702.67), aura swap (CR 702.65), Empower Jace X from a Jace, and the round's other cards.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, botActions, characteristics, compileCard, defOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions of the players in `me` stop it, others the bots answer. */
const settle = (s: GameState, opts: { me?: PlayerId[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
/** Moves a new card for `def` from the battlefield into `pid`'s `zone`. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Removes `pid`'s lands: what's left to pay with is what a test puts there. */
const noLands = (s: GameState, pid: PlayerId) => {
  for (const id of s.battlefield.filter((x) => s.objects[x]!.controller === pid && characteristics(s, s.objects[x]!).types.includes("Land"))) {
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  invalidateCharacteristics(s);
};
const named = (s: GameState, name: string) => s.battlefield.filter((id) => defOf(s, s.objects[id]!).name === name);
const ability = (s: GameState, id: string, text: RegExp) => compileCard(defOf(s, s.objects[id]!)).activated.findIndex((a) => text.test(a.text));
const goddric = (): CardDef => ({"oracleId":"35b2b172-5fbc-4e4d-a011-390ee1b6c848","name":"Goddric, Cloaked Reveler","manaCost":"{1}{R}{R}","cmc":3,"typeLine":"Legendary Creature \u2014 Human Noble","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Noble"],"oracleText":"Haste\nCelebration \u2014 As long as two or more nonland permanents entered the battlefield under your control this turn, Goddric is a Dragon with base power and toughness 4/4, flying, and \"{R}: Dragons you control get +1/+0 until end of turn.\" (He loses all other creature types.)","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":["Flying","Celebration","Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/b/b/bb884762-5468-43be-870a-96328f8172c2.jpg?1783915032","artUrl":"https://cards.scryfall.io/art_crop/front/b/b/bb884762-5468-43be-870a-96328f8172c2.jpg?1783915032","commanderLegal":"legal","set":"woe","releasedAt":"2023-09-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const garrison = (): CardDef => ({"oracleId":"48bf020e-45b9-4c27-82e0-80d942656a67","name":"Darksteel Garrison","manaCost":"{2}","cmc":2,"typeLine":"Artifact \u2014 Fortification","supertypes":[],"types":["Artifact"],"subtypes":["Fortification"],"oracleText":"Fortified land has indestructible.\nWhenever fortified land becomes tapped, target creature gets +1/+1 until end of turn.\nFortify {3} ({3}: Attach to target land you control. Fortify only as a sorcery. This card enters unattached and stays on the battlefield if the land leaves.)","colors":[],"colorIdentity":[],"keywords":["Fortify"],"imageUrl":"https://cards.scryfall.io/normal/front/e/7/e77eaaa0-40f9-40e4-b0ba-5a8addd764d3.jpg?1783943091","artUrl":"https://cards.scryfall.io/art_crop/front/e/7/e77eaaa0-40f9-40e4-b0ba-5a8addd764d3.jpg?1783943091","commanderLegal":"legal","set":"fut","releasedAt":"2007-05-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const wings = (): CardDef => ({"oracleId":"b8cc7a78-a627-4e56-b1fc-0b2bd844ef68","name":"Arcanum Wings","manaCost":"{1}{U}","cmc":2,"typeLine":"Enchantment \u2014 Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature has flying.\nAura swap {2}{U} ({2}{U}: Exchange this Aura with an Aura card in your hand.)","colors":["U"],"colorIdentity":["U"],"keywords":["Aura Swap","Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/7/47e6e715-abd8-4ff9-a8aa-8f4b929b0283.jpg?1783943118","artUrl":"https://cards.scryfall.io/art_crop/front/4/7/47e6e715-abd8-4ff9-a8aa-8f4b929b0283.jpg?1783943118","commanderLegal":"legal","set":"fut","releasedAt":"2007-05-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const jace = (): CardDef => ({"oracleId":"bf0e9e00-fba5-448a-9052-ae730aea4bf8","name":"Jace, Reality Sculptor","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Legendary Planeswalker \u2014 Jace","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Jace"],"oracleText":"+1: Empower Jace X, where X is the number of Islands you control.\n\u22123: Until your next turn, whenever a creature attacks you or a planeswalker you control, it gets -5/-0 until end of turn.\n0: Exile all but the bottom card of each opponent's library. Activate only if there are twenty-five or more loyalty counters among Jaces you control.","loyalty":"5","colors":["U"],"colorIdentity":["U"],"keywords":["Empower Jace"],"imageUrl":"https://cards.scryfall.io/normal/front/7/4/74087795-0b38-4fd2-9841-147583baca41.jpg?1790075861","artUrl":"https://cards.scryfall.io/art_crop/front/7/4/74087795-0b38-4fd2-9841-147583baca41.jpg?1790075861","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const dance = (): CardDef => ({"oracleId":"72e1a239-11a7-4dbe-b093-65d395e3ccc9","name":"Dance of Many","manaCost":"{U}{U}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, create a token that's a copy of target nontoken creature.\nWhen this enchantment leaves the battlefield, exile the token.\nWhen the token leaves the battlefield, sacrifice this enchantment.\nAt the beginning of your upkeep, sacrifice this enchantment unless you pay {U}{U}.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/5/556f7cc0-0fcb-4022-8a2d-9aebe889c891.jpg?1783921955","artUrl":"https://cards.scryfall.io/art_crop/front/5/5/556f7cc0-0fcb-4022-8a2d-9aebe889c891.jpg?1783921955","commanderLegal":"legal","set":"sld","releasedAt":"2022-07-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const atalya = (): CardDef => ({"oracleId":"84587724-af96-4396-a0b3-1133d492d915","name":"Atalya, Samite Master","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Legendary Creature \u2014 Human Cleric","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Cleric"],"oracleText":"{X}, {T}: Choose one \u2014\n\u2022 Prevent the next X damage that would be dealt to target creature this turn. Spend only white mana on X.\n\u2022 You gain X life. Spend only white mana on X.","power":"2","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/0/90500e7a-f76d-453a-bda0-d56d3f7c7534.jpg?1783945719","artUrl":"https://cards.scryfall.io/art_crop/front/9/0/90500e7a-f76d-453a-bda0-d56d3f7c7534.jpg?1783945719","commanderLegal":"legal","set":"inv","releasedAt":"2000-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const suncleanser = (): CardDef => ({"oracleId":"437661f7-a32f-45c9-a006-05a1e38ee8d9","name":"Suncleanser","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature \u2014 Human Cleric","supertypes":[],"types":["Creature"],"subtypes":["Human","Cleric"],"oracleText":"When this creature enters, choose one \u2014\n\u2022 Remove all counters from target creature. It can't have counters put on it for as long as this creature remains on the battlefield.\n\u2022 Target opponent loses all counters. That player can't get counters for as long as this creature remains on the battlefield.","power":"1","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/6/3644df41-b690-4581-ac7d-c85cec75411f.jpg?1783934596","artUrl":"https://cards.scryfall.io/art_crop/front/3/6/3644df41-b690-4581-ac7d-c85cec75411f.jpg?1783934596","commanderLegal":"legal","set":"m19","releasedAt":"2018-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const wanShiTong = (): CardDef => ({"oracleId":"6927bd2e-cb05-487a-af86-89ede6e8dabd","name":"Wan Shi Tong, All-Knowing","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Legendary Creature \u2014 Bird Spirit","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Bird","Spirit"],"oracleText":"Flying\nWhen Wan Shi Tong enters, target nonland permanent's owner puts it into their library second from the top or on the bottom.\nWhenever one or more cards are put into a library from anywhere, create two 1/1 colorless Spirit creature tokens with \"This token can't block or be blocked by non-Spirit creatures.\"","power":"4","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/7/7/777fcc21-2856-4181-8ecd-c272f9769e36.jpg?1783904828","artUrl":"https://cards.scryfall.io/art_crop/front/7/7/777fcc21-2856-4181-8ecd-c272f9769e36.jpg?1783904828","commanderLegal":"legal","set":"tle","releasedAt":"2025-11-21","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const seeker = (): CardDef => ({"oracleId":"b58a70e2-3609-441a-993a-dccb9a2cf242","name":"Dutiful Knowledge Seeker","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature \u2014 Fox Spirit","supertypes":[],"types":["Creature"],"subtypes":["Fox","Spirit"],"oracleText":"Whenever one or more cards are put into a library from anywhere, put a +1/+1 counter on this creature.\n{3}: Put target card from a graveyard on the bottom of its owner's library.","power":"2","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/3/332914f3-9c79-4f76-882e-f72e42681d21.jpg?1783904831","artUrl":"https://cards.scryfall.io/art_crop/front/3/3/332914f3-9c79-4f76-882e-f72e42681d21.jpg?1783904831","commanderLegal":"legal","set":"tle","releasedAt":"2025-11-21","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const kaust = (): CardDef => ({"oracleId":"af78c13f-67f8-42bf-b012-482a48af4f31","name":"Kaust, Eyes of the Glade","manaCost":"{R/W}{G}","cmc":2,"typeLine":"Legendary Creature \u2014 Dryad Detective","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Dryad","Detective"],"oracleText":"Whenever a creature you control that was turned face up this turn deals combat damage to a player, draw a card.\n{T}: Turn target face-down attacking creature you control face up.","power":"2","toughness":"2","colors":["G","R","W"],"colorIdentity":["G","R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/4/648c15d1-a2a2-4f59-9b0a-5448be3e990f.jpg?1783913056","artUrl":"https://cards.scryfall.io/art_crop/front/6/4/648c15d1-a2a2-4f59-9b0a-5448be3e990f.jpg?1783913056","commanderLegal":"legal","set":"mkc","releasedAt":"2024-02-09","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const brainstorm = (): CardDef => ({"oracleId":"36cd2364-d113-47d1-b2c4-b088d9eb88dd","name":"Brainstorm","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Draw three cards, then put two cards from your hand on top of your library in any order.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/5/b5545882-6963-4729-b2c6-fb4bdc75ffcc.jpg?1783904806","artUrl":"https://cards.scryfall.io/art_crop/front/b/5/b5545882-6963-4729-b2c6-fb4bdc75ffcc.jpg?1783904806","commanderLegal":"legal","set":"tle","releasedAt":"2025-11-21","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const auraProp = card("Test Aura", "Enchantment — Aura", "{W}", { oracleText: "Enchant creature\nEnchanted creature gets +2/+2.", colors: ["W"] });
const landAura = card("Test Land Aura", "Enchantment — Aura", "{G}", { oracleText: "Enchant land\nEnchanted land has \"{T}: Add {G}{G}.\"", colors: ["G"] });
const morphProp = card("Test Morpher", "Creature — Beast", "{4}{G}", { power: "4", toughness: "4", oracleText: "Morph {2}", keywords: ["Morph"] });
const counterPump = card("Test Counter Pump", "Instant", "{G}", { oracleText: "Put a +1/+1 counter on target creature.", colors: ["G"] });
const poisoner = card("Test Poisoner", "Sorcery", "{B}", { oracleText: "Target player gets a poison counter.", colors: ["B"] });

describe("Lane B round 99", () => {
  it("Darksteel Garrison: fortify attaches it to a land you control, only as a sorcery; the land has indestructible and its tapping pumps a creature", () => {
    supported(garrison());
    let { s, ap, opp } = setup([]);
    const g = putOnBattlefield(s, ap, garrison());
    const land = named(s, "Forest")[0]!;
    const b = putOnBattlefield(s, ap, bear());
    const fortify = ability(s, g, /^Fortify/);
    // Not a creature: only a land you control (CR 702.67a).
    expect(abilityProblem(s, ap, g, fortify, [tgt(b)])).not.toBeNull();
    expect(compileCard(garrison()).activated[fortify]!.sorcerySpeed).toBe(true);
    s = run(s, planActivate(s, ap, g, fortify, [tgt(land)]));
    s = settle(s);
    expect(s.objects[g]!.attachedTo).toBe(land);
    expect(characteristics(s, s.objects[land]!).keywords).toContain("Indestructible");
    // "Whenever fortified land becomes tapped, target creature gets +1/+1 until end of turn": not only for mana (rulings).
    s.players[ap]!.hand = [];
    const tap = { type: "activateMana", player: ap, objectId: land, ability: 0, mana: "G" } as Action;
    s = act(s, tap);
    s = settle(s);
    expect(`${power(s, s.objects[b]!)}/${toughness(s, s.objects[b]!)}`).toBe("3/3");
    // A "destroy target land" spell can't destroy the fortified land.
    const rain = into(s, opp, card("Test Land Smash", "Instant", "{R}", { oracleText: "Destroy target land.", colors: ["R"] }), "hand");
    s.players[opp]!.manaPool = { ...s.players[opp]!.manaPool, R: 1, C: 2 };
    s.priority = opp;
    s = run(s, planCast(s, opp, rain, [tgt(land)]));
    s = settle(s);
    expect(s.objects[land]!.zone).toBe("battlefield");
  });

  it("Darksteel Garrison: unattached once the land stops being a land or leaves, and it stays on the battlefield (CR 301.6, 704.5n)", () => {
    let { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, garrison());
    const land = named(s, "Forest")[0]!;
    s = run(s, planActivate(s, ap, g, ability(s, g, /^Fortify/), [tgt(land)]));
    s = settle(s);
    expect(s.objects[g]!.attachedTo).toBe(land);
    // The land leaves: Garrison stays, unattached.
    s.battlefield.splice(s.battlefield.indexOf(land), 1);
    s.objects[land]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(land);
    invalidateCharacteristics(s);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[g]!.zone).toBe("battlefield");
    expect(s.objects[g]!.attachedTo).toBeUndefined();
  });

  it("Arcanum Wings: aura swap exchanges it with an Aura card from your hand that can enchant the same creature (CR 702.65a)", () => {
    supported(wings());
    let { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, bear());
    const w = putOnBattlefield(s, ap, wings());
    s.objects[w]!.attachedTo = b;
    const other = into(s, ap, auraProp, "hand");
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[b]!).keywords).toContain("Flying");
    s = run(s, planActivate(s, ap, w, ability(s, w, /^Aura swap/)));
    s = settle(s, { me: [ap] });
    const p = s.pending;
    expect(p?.kind).toBe("searchLibrary");
    if (p?.kind !== "searchLibrary") throw new Error("no pick");
    expect(p.cards).toEqual([other]);
    s = act(s, { type: "searchLibrary", player: ap, found: [other] });
    s = settle(s);
    expect(s.objects[w]!.zone).toBe("hand");
    expect(s.objects[other]!.zone).toBe("battlefield");
    expect(s.objects[other]!.attachedTo).toBe(b);
    expect(`${power(s, s.objects[b]!)}/${toughness(s, s.objects[b]!)}`).toBe("4/4");
    expect(characteristics(s, s.objects[b]!).keywords).not.toContain("Flying");
  });

  it("Arcanum Wings: with only an Aura that can't enchant that creature, or choosing none, nothing happens (CR 702.65b)", () => {
    let { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, bear());
    const w = putOnBattlefield(s, ap, wings());
    s.objects[w]!.attachedTo = b;
    const landOnly = into(s, ap, landAura, "hand");
    s = run(s, planActivate(s, ap, w, ability(s, w, /^Aura swap/)));
    s = settle(s, { me: [ap] });
    expect(s.pending).toBeFalsy();
    expect(s.objects[w]!.attachedTo).toBe(b);
    expect(s.objects[landOnly]!.zone).toBe("hand");
    // An Aura it could take, declined: nothing moves.
    const other = into(s, ap, auraProp, "hand");
    s = run(s, planActivate(s, ap, w, ability(s, w, /^Aura swap/)));
    s = settle(s, { me: [ap] });
    s = act(s, { type: "searchLibrary", player: ap, found: [] });
    s = settle(s);
    expect(s.objects[w]!.attachedTo).toBe(b);
    expect(s.objects[other]!.zone).toBe("hand");
  });

  it("Arcanum Wings: one you control but don't own can't be exchanged (CR 702.65b)", () => {
    let { s, ap, opp } = setup([]);
    const b = putOnBattlefield(s, ap, bear());
    const w = putOnBattlefield(s, ap, wings());
    s.objects[w]!.owner = opp;
    s.objects[w]!.attachedTo = b;
    const other = into(s, ap, auraProp, "hand");
    s = run(s, planActivate(s, ap, w, ability(s, w, /^Aura swap/)));
    s = settle(s, { me: [ap] });
    expect(s.pending).toBeFalsy();
    expect(s.objects[w]!.zone).toBe("battlefield");
    expect(s.objects[other]!.zone).toBe("hand");
  });

  it("Jace, Reality Sculptor: +1 empowers a Jace token by the Islands you control, not Jace himself (CR 701.71a, rulings)", () => {
    supported(jace());
    let { s, ap } = setup([]);
    const j = putOnBattlefield(s, ap, jace());
    s.objects[j]!.counters.loyalty = 5;
    invalidateCharacteristics(s);
    s = run(s, planActivate(s, ap, j, ability(s, j, /^\+1/)));
    s = settle(s);
    expect(s.objects[j]!.counters.loyalty).toBe(6);
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Jace"));
    expect(tokens.length).toBe(1);
    // setup gives three Islands.
    expect(s.objects[tokens[0]!]!.counters.loyalty).toBe(3);
  });

  it("Jace, Reality Sculptor: 0 only with twenty-five loyalty counters among your Jaces; then each opponent keeps only the bottom card of their library", () => {
    let { s, ap, opp } = setup([]);
    const j = putOnBattlefield(s, ap, jace());
    s.objects[j]!.counters.loyalty = 20;
    invalidateCharacteristics(s);
    const zero = ability(s, j, /^0:/);
    expect(abilityProblem(s, ap, j, zero)).toMatch(/can't be activated/);
    s.objects[j]!.counters.loyalty = 25;
    expect(abilityProblem(s, ap, j, zero)).toBeNull();
    const bottom = s.players[opp]!.library.at(-1)!;
    const mine = s.players[ap]!.library.length;
    s = run(s, planActivate(s, ap, j, zero));
    s = settle(s);
    for (const p of s.turnOrder.filter((p) => p !== ap)) expect(s.players[p]!.library.length).toBe(1);
    expect(s.players[opp]!.library).toEqual([bottom]);
    expect(s.players[ap]!.library.length).toBe(mine);
  });

  it("Goddric, Cloaked Reveler: a 4/4 Dragon with flying and the pump once two nonland permanents entered under your control this turn", () => {
    supported(goddric());
    let { s, ap, ids } = setup([bear({ name: "Bear One" }), bear({ name: "Bear Two" })]);
    const g = putOnBattlefield(s, ap, goddric());
    expect(characteristics(s, s.objects[g]!).subtypes).toEqual(["Human", "Noble"]);
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    expect(characteristics(s, s.objects[g]!).subtypes).toEqual(["Human", "Noble"]);
    s = run(s, planCast(s, ap, ids[1]!));
    s = settle(s);
    const c = characteristics(s, s.objects[g]!);
    expect(c.subtypes).toEqual(["Dragon"]);
    expect(c.keywords).toContain("Flying");
    expect(`${power(s, s.objects[g]!)}/${toughness(s, s.objects[g]!)}`).toBe("4/4");
    // "{R}: Dragons you control get +1/+0 until end of turn."
    s = run(s, planActivate(s, ap, g, 0));
    s = settle(s);
    expect(`${power(s, s.objects[g]!)}/${toughness(s, s.objects[g]!)}`).toBe("5/4");
  });

  it("Dance of Many: copies a nontoken creature; when the token leaves, Dance is sacrificed, and when Dance leaves, the token is exiled", () => {
    supported(dance());
    let { s, ap, ids, opp } = setup([dance()]);
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    if (s.objects[ids[0]!]!.zone !== "battlefield") throw new Error("not on the battlefield");
    // Their Bear is the only nontoken creature, so the copy is of it.
    const token = s.battlefield.find((id) => s.objects[id]!.isToken && defOf(s, s.objects[id]!).name === "Their Bear");
    expect(token).toBeDefined();
    expect(s.objects[token!]!.controller).toBe(ap);
    // The token leaves: sacrifice Dance of Many.
    s.objects[token!]!.damage = 99;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(s);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.objects[theirs]!.zone).toBe("battlefield");
  });

  it("Dance of Many: when it leaves the battlefield, the token is exiled; the upkeep cost keeps it", () => {
    let { s, ap, ids, opp } = setup([dance()]);
    putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    const token = s.battlefield.find((id) => s.objects[id]!.isToken && defOf(s, s.objects[id]!).name === "Their Bear")!;
    expect(token).toBeDefined();
    // Destroyed: "When this enchantment leaves the battlefield, exile the token."
    const naturalize = into(s, opp, card("Test Disenchant", "Instant", "{G}", { oracleText: "Destroy target enchantment.", colors: ["G"] }), "hand");
    s.players[opp]!.manaPool = { ...s.players[opp]!.manaPool, G: 1 };
    s.priority = opp;
    s = run(s, planCast(s, opp, naturalize, [tgt(ids[0]!)]));
    s = settle(s);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.battlefield.includes(token)).toBe(false);
    expect(s.players[ap]!.exile.includes(token) || !s.objects[token] || s.objects[token]!.zone !== "battlefield").toBe(true);
  });

  it("Atalya, Samite Master: either mode's X is paid with white mana only", () => {
    supported(atalya());
    let { s, ap } = setup([]);
    noLands(s, ap);
    const a = putOnBattlefield(s, ap, atalya());
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, R: 3 };
    expect(planActivate(s, ap, a, 0, undefined, [1], undefined, 3)).toBeNull();
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, R: 0, W: 3 };
    const life = s.players[ap]!.life;
    s = run(s, planActivate(s, ap, a, 0, undefined, [1], undefined, 3));
    s = settle(s);
    expect(s.players[ap]!.life).toBe(life + 3);
    // The first mode the same: red mana can't pay for the prevention either.
    let t2 = setup([]);
    noLands(t2.s, t2.ap);
    const a2 = putOnBattlefield(t2.s, t2.ap, atalya());
    const b = putOnBattlefield(t2.s, t2.ap, bear());
    t2.s.players[t2.ap]!.manaPool = { ...t2.s.players[t2.ap]!.manaPool, R: 2 };
    expect(planActivate(t2.s, t2.ap, a2, 0, [tgt(b)], [0], undefined, 2)).toBeNull();
  });

  it("Suncleanser: removes a creature's counters and none can be put on it while Suncleanser stays; once it leaves they can", () => {
    supported(suncleanser());
    let { s, ap, ids, opp } = setup([suncleanser(), counterPump]);
    const b = putOnBattlefield(s, opp, bear());
    s.objects[b]!.counters["+1/+1"] = 2;
    invalidateCharacteristics(s);
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s, { me: [ap] });
    s = act(s, { type: "chooseModes", player: ap, modes: [0] });
    s = settle(s, { me: [ap] });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] });
    s = settle(s);
    expect(s.objects[b]!.counters["+1/+1"] ?? 0).toBe(0);
    s = run(s, planCast(s, ap, ids[1]!, [tgt(b)]));
    s = settle(s);
    expect(s.objects[b]!.counters["+1/+1"] ?? 0).toBe(0);
    // Suncleanser leaves: the ban ends (CR 611.2b).
    const sun = ids[0]!;
    s.battlefield.splice(s.battlefield.indexOf(sun), 1);
    s.objects[sun]!.zone = "graveyard";
    s.objects[sun]!.zoneChanges = (s.objects[sun]!.zoneChanges ?? 0) + 1;
    s.players[ap]!.graveyard.push(sun);
    invalidateCharacteristics(s);
    const pump2 = into(s, ap, counterPump, "hand");
    s = run(s, planCast(s, ap, pump2, [tgt(b)]));
    s = settle(s);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
  });

  it("Suncleanser: the opponent loses all counters and can't get more while it stays", () => {
    let { s, ap, ids, opp } = setup([suncleanser(), poisoner]);
    s.players[opp]!.poison = 3;
    s.players[opp]!.energy = 2;
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s, { me: [ap] });
    s = act(s, { type: "chooseModes", player: ap, modes: [1] });
    s = settle(s, { me: [ap] });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    s = settle(s);
    expect(s.players[opp]!.poison ?? 0).toBe(0);
    expect(s.players[opp]!.energy ?? 0).toBe(0);
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }]));
    s = settle(s);
    expect(s.players[opp]!.poison ?? 0).toBe(0);
    // Another player still can.
    const third = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    const p2 = into(s, ap, poisoner, "hand");
    s = run(s, planCast(s, ap, p2, [{ kind: "player", id: third }]));
    s = settle(s);
    expect(s.players[third]!.poison).toBe(1);
  });

  it("Wan Shi Tong, All-Knowing: the permanent's owner puts it second from the top or on the bottom; that and Brainstorm each make two Spirits", () => {
    supported(wanShiTong(), brainstorm());
    let { s, ap, ids, opp } = setup([wanShiTong(), brainstorm()]);
    const b = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s, { me: [ap] });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] });
    s = settle(s);
    // The bear went into its owner's library, second from the top or on the bottom.
    const lib = s.players[opp]!.library;
    expect(s.objects[b]!.zone).toBe("library");
    expect(lib.indexOf(b) === 1 || lib.indexOf(b) === lib.length - 1).toBe(true);
    const spirits = () => s.battlefield.filter((id) => s.objects[id]!.isToken && defOf(s, s.objects[id]!).name.startsWith("Spirit")).length;
    expect(spirits()).toBe(2);
    // Brainstorm puts two cards back in one event: one trigger, two more Spirits.
    s = run(s, planCast(s, ap, ids[1]!));
    s = settle(s);
    expect(spirits()).toBe(4);
    const spirit = s.battlefield.find((id) => s.objects[id]!.isToken && defOf(s, s.objects[id]!).name.startsWith("Spirit"))!;
    expect(characteristics(s, s.objects[spirit]!).colors).toEqual([]);
  });

  it("Dutiful Knowledge Seeker: a +1/+1 counter whenever cards are put into a library from anywhere, once for each event", () => {
    supported(seeker());
    let { s, ap, ids, opp } = setup([brainstorm()]);
    const k = putOnBattlefield(s, ap, seeker());
    const card0 = into(s, opp, bear(), "graveyard");
    s = run(s, planActivate(s, ap, k, 0, [tgt(card0)]));
    s = settle(s);
    expect(s.objects[card0]!.zone).toBe("library");
    expect(s.players[opp]!.library.at(-1)).toBe(card0);
    expect(s.objects[k]!.counters["+1/+1"]).toBe(1);
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    expect(s.objects[k]!.counters["+1/+1"]).toBe(2);
  });

  it("Kaust, Eyes of the Glade: turns a face-down attacker face up; it draws a card when that creature deals combat damage to a player, another doesn't", () => {
    supported(kaust());
    let { s, ap, opp } = setup([]);
    s.players[ap]!.hand = [];
    const k = putOnBattlefield(s, ap, kaust());
    const fd = putOnBattlefield(s, ap, morphProp);
    s.objects[fd]!.faceDown = "morph";
    const plain = putOnBattlefield(s, ap, bear({ name: "Plain Bear" }));
    invalidateCharacteristics(s);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: fd, defender: opp }, { attacker: plain, defender: opp }] });
    // Only a face-down attacking creature you control.
    expect(abilityProblem(s, ap, k, 0, [tgt(plain)])).not.toBeNull();
    s = run(s, planActivate(s, ap, k, 0, [tgt(fd)]));
    s = settle(s);
    expect(s.objects[fd]!.faceDown).toBeUndefined();
    expect(s.objects[fd]!.turnedFaceUpTurn).toBe(s.turn);
    const hand = s.players[ap]!.hand.length;
    const life = s.players[opp]!.life;
    s = passUntil(s, "combatDamage", ap);
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 6);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
});
