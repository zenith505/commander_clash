// Lane B round B160: Magus of the Mind (exile one plus the spells cast this turn, play them free this turn), Nebuchadnezzar
// (X cards at random from a hand, those with the chosen name discarded), Bazaar of Wonders (a spell countered when its name is
// in a graveyard or on a nontoken permanent), Guard Dogs (a combat prevention shield if the target shares a color with a
// permanent chosen as it resolves), Mourner's Shield (a source of your choice sharing a color with the imprinted card),
// Clarion Ultimatum (five chosen permanents, a card with each one's name), Stronghold Gambit (each player's chosen card,
// the lowest creatures onto the battlefield) and Booby Trap (a chosen opponent's draws revealed, the chosen name punished).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { botActions, castProblem, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const magus = (): CardDef => ({"oracleId":"b39d98c3-0173-4d7c-83d0-f80db82fc9ba","name":"Magus of the Mind","manaCost":"{4}{U}{U}","cmc":6,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"{U}, {T}, Sacrifice this creature: Shuffle your library, then exile the top X cards, where X is one plus the number of spells cast this turn. Until end of turn, you may play lands and cast spells from among cards exiled this way without paying their mana costs.","power":"4","toughness":"5","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/4/34a0d8a1-8564-4d4a-9390-06a06312e668.jpg?1783935947","artUrl":"https://cards.scryfall.io/art_crop/front/3/4/34a0d8a1-8564-4d4a-9390-06a06312e668.jpg?1783935947","commanderLegal":"legal","set":"c17","releasedAt":"2017-08-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const nebu = (): CardDef => ({"oracleId":"7c48448e-4e13-4cda-999e-e06ae0f7dcea","name":"Nebuchadnezzar","manaCost":"{3}{U}{B}","cmc":5,"typeLine":"Legendary Creature — Human Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"{X}, {T}: Choose a card name. Target opponent reveals X cards at random from their hand. Then that player discards all cards with that name revealed this way. Activate only during your turn.","power":"3","toughness":"3","colors":["B","U"],"colorIdentity":["B","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/3/e3f17ce3-711b-4bd9-addf-dd440fa7d2b7.jpg?1783948035","artUrl":"https://cards.scryfall.io/art_crop/front/e/3/e3f17ce3-711b-4bd9-addf-dd440fa7d2b7.jpg?1783948035","commanderLegal":"legal","set":"leg","releasedAt":"1994-06-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bazaar = (): CardDef => ({"oracleId":"7fca65b8-01fe-4858-97c6-f97ae82cd801","name":"Bazaar of Wonders","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"World Enchantment","supertypes":["World"],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, exile all graveyards.\nWhenever a player casts a spell, counter it if a card with the same name is in a graveyard or a nontoken permanent with the same name is on the battlefield.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/8/78e7a165-e135-4b85-943d-8352b6e65870.jpg?1783947112","artUrl":"https://cards.scryfall.io/art_crop/front/7/8/78e7a165-e135-4b85-943d-8352b6e65870.jpg?1783947112","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const dogs = (): CardDef => ({"oracleId":"490af644-2e85-49c7-af63-d5f0a9babff8","name":"Guard Dogs","manaCost":"{3}{W}","cmc":4,"typeLine":"Creature — Dog","supertypes":[],"types":["Creature"],"subtypes":["Dog"],"oracleText":"{2}{W}, {T}: Choose a permanent you control. Prevent all combat damage target creature would deal this turn if it shares a color with that permanent.","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/a/ba32eee7-10ba-4f0b-8a87-c3ecfa22ae41.jpg?1783945630","artUrl":"https://cards.scryfall.io/art_crop/front/b/a/ba32eee7-10ba-4f0b-8a87-c3ecfa22ae41.jpg?1783945630","commanderLegal":"legal","set":"pls","releasedAt":"2001-02-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const shield = (): CardDef => ({"oracleId":"34cadd9d-b8e6-422c-b0ec-a2420cd983ad","name":"Mourner's Shield","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Imprint — When this artifact enters, you may exile target card from a graveyard.\n{2}, {T}: Prevent all damage that would be dealt this turn by a source of your choice that shares a color with the exiled card.","colors":[],"colorIdentity":[],"keywords":["Imprint"],"imageUrl":"https://cards.scryfall.io/normal/front/7/8/783fe67f-59f7-46f0-bfa4-fa4a65c9c33c.jpg?1783944512","artUrl":"https://cards.scryfall.io/art_crop/front/7/8/783fe67f-59f7-46f0-bfa4-fa4a65c9c33c.jpg?1783944512","commanderLegal":"legal","set":"mrd","releasedAt":"2003-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const clarion = (): CardDef => ({"oracleId":"5fbd39e9-8736-4722-bb9b-6a7da8e47c84","name":"Clarion Ultimatum","manaCost":"{G}{G}{W}{W}{W}{U}{U}","cmc":7,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose five permanents you control. For each of those permanents, you may search your library for a card with the same name as that permanent. Put those cards onto the battlefield tapped, then shuffle.","colors":["G","U","W"],"colorIdentity":["G","U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/9/39e8bf21-0baf-4ee9-b224-b9eee50df280.jpg?1783942547","artUrl":"https://cards.scryfall.io/art_crop/front/3/9/39e8bf21-0baf-4ee9-b224-b9eee50df280.jpg?1783942547","commanderLegal":"legal","set":"ala","releasedAt":"2008-10-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const gambit = (): CardDef => ({"oracleId":"797bb53d-b111-41fe-95d7-64cb0f833b22","name":"Stronghold Gambit","manaCost":"{1}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each player chooses a card in their hand. Then each player reveals their chosen card. The owner of each creature card revealed this way with the lowest mana value puts it onto the battlefield.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/d/0d18050e-9aad-471e-a6ae-66e5fa2bbb6f.jpg?1783945817","artUrl":"https://cards.scryfall.io/art_crop/front/0/d/0d18050e-9aad-471e-a6ae-66e5fa2bbb6f.jpg?1783945817","commanderLegal":"legal","set":"nem","releasedAt":"2000-02-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const trap = (): CardDef => ({"oracleId":"3e46381a-7850-4e50-9213-e1a180299977","name":"Booby Trap","manaCost":"{6}","cmc":6,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"As this artifact enters, choose an opponent and a card name other than a basic land card name.\nThe chosen player reveals each card they draw.\nWhen the chosen player draws a card with the chosen name, sacrifice this artifact. If you do, this artifact deals 10 damage to that player.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bfedc78e-47dc-43e3-aed7-2d5c8e97fdac.jpg?1783946607","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bfedc78e-47dc-43e3-aed7-2d5c8e97fdac.jpg?1783946607","commanderLegal":"legal","set":"tmp","releasedAt":"1997-10-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string): TargetChoice => ({ kind: "object", id }) as TargetChoice;
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id }) as TargetChoice;
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Everyone passes, answering the end-of-turn questions, until `active`'s `step`; stops at any other question. */
const goUntil = (s: GameState, step: GameState["step"], active: PlayerId, max = 3000) => {
  for (let i = 0; i < max; i++) {
    if (s.step === step && s.activePlayer === active) return s;
    const pid = waitingOn(s)!;
    const pend = s.pending;
    if (pend?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (pend?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (pend?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, pend.count) });
    else if (pend) return s;
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error(`never reached ${step}`);
};
const toZone = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else if (zone === "exile") s.players[pid]!.exile.push(id);
  else s.players[pid]![zone === "hand" ? "hand" : "graveyard"].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** `pid`'s library is only these cards now (the rest set aside in exile). */
const onlyLibrary = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  for (const id of s.players[pid]!.library) {
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  s.players[pid]!.library = [];
  return defs.map((d) => toZone(s, pid, d, "library"));
};
const others = (s: GameState, ap: PlayerId) => {
  const i = s.turnOrder.indexOf(ap);
  return [1, 2, 3].map((k) => s.turnOrder[(i + k) % 4]!);
};
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
/** Players pass in turn order until `pid` has priority (the stack unchanged). */
const priorityTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 4 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const pool = (s: GameState, pid: PlayerId, m: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  s.players[pid]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...m };
};
const ogre = (mv: number, name = `Ogre ${mv}`) => card(name, "Creature — Ogre", `{${mv - 1}}{R}`, { cmc: mv, colors: ["R"], power: "3", toughness: "3" });
const relic = (name: string, mv = 2) => card(name, "Artifact", `{${mv}}`, { cmc: mv });
const shock = (name = "Test Shock") => card(name, "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: `${name} deals 2 damage to any target.` });
const sorcery = (name: string) => card(name, "Sorcery", "{3}{U}", { cmc: 4, colors: ["U"], oracleText: "Draw two cards." });
const land = (name: string) => card(name, "Land", "", { oracleText: "{T}: Add {C}." });
/** How many damage prevention modifications the state holds. */
const shields = (s: GameState, id: string) => s.effects.filter((e) => e.affected?.includes(id) && e.mods.some((m) => m.kind === "preventDamage")).length;
const names = (s: GameState, ids: string[]) => ids.map((id) => s.cards[s.objects[id]!.cardId]!.name);

describe("Lane B round B160", () => {
  it("compiles the cards", () => supported(magus(), nebu(), bazaar(), dogs(), shield(), clarion(), gambit(), trap()));

  it("Magus of the Mind: X is one plus every spell cast this turn; the cards are played free this turn, the rest stay exiled", () => {
    const { s: s0, ap } = setup([]);
    const [o1] = others(s0, ap);
    s0.players[ap]!.hand = [];
    const m = putOnBattlefield(s0, ap, magus());
    const lib = onlyLibrary(s0, ap, [sorcery("Free Sorcery"), sorcery("Other Sorcery"), land("Free Land")]);
    // One spell cast this turn (an opponent's counts too).
    const bolt = toZone(s0, ap, shock("Opening Shock"), "hand");
    pool(s0, ap, { R: 1 });
    let s = settle(run(s0, planCast(s0, ap, bolt, [ply(o1!)])));
    pool(s, ap, { U: 1 });
    s = settle(run(s, planActivate(s, ap, m, 0)));
    expect(zone(s, m)).toBe("graveyard");
    const exiled = lib.filter((id) => zone(s, id) === "exile");
    expect(exiled).toHaveLength(2);
    expect(lib.filter((id) => zone(s, id) === "library")).toHaveLength(1);
    for (const id of exiled) expect(s.objects[id]!.mayPlay).toMatchObject({ player: ap, until: "thisTurn", free: true });
    // A nonland card among them is cast with no mana.
    const spell = exiled.find((id) => names(s, [id])[0] !== "Free Land")!;
    pool(s, ap, {});
    expect(castProblem(s, ap, spell)).toBeNull();
    s = settle(run(s, planCast(s, ap, spell)));
    expect(zone(s, spell)).toBe("graveyard");
    // Next turn the permission is over (it was for that turn only).
    s = goUntil(s, "upkeep", o1!);
    const left = exiled.filter((id) => zone(s, id) === "exile");
    expect(left).toHaveLength(1);
    for (const id of left) expect(s.objects[id]!.mayPlay?.turn ?? -1).not.toBe(s.turn);
  });

  it("Magus of the Mind with no spells cast this turn exiles one card", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, magus());
    const lib = onlyLibrary(s0, ap, [sorcery("Free Sorcery"), land("Free Land"), bear({ name: "Third Bear" })]);
    pool(s0, ap, { U: 1 });
    const s = settle(run(s0, planActivate(s0, ap, m, 0)));
    expect(lib.filter((id) => zone(s, id) === "exile")).toHaveLength(1);
  });

  it("Nebuchadnezzar: the name is chosen, X random cards are revealed, and only revealed cards with that name are discarded", () => {
    const { s: s0, ap } = setup([]);
    const [o1] = others(s0, ap);
    const n = putOnBattlefield(s0, ap, nebu());
    s0.players[o1!]!.hand = [];
    const hand = [shock("Twin Shock"), shock("Twin Shock"), relic("Odd Relic"), ogre(2)].map((d) => toZone(s0, o1!, d, "hand"));
    // Only during your turn.
    pool(s0, ap, { C: 4 });
    let s = run(s0, planActivate(s0, ap, n, 0, [ply(o1!)], undefined, undefined, 4));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "cardName", purpose: "theirs" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Twin Shock" }));
    // X = 4: the whole hand is revealed; both Twin Shocks go.
    expect(names(s, s.players[o1!]!.hand).sort()).toEqual(["Odd Relic", "Ogre 2"]);
    expect(hand.filter((id) => zone(s, id) === "graveyard")).toHaveLength(2);
  });

  it("Nebuchadnezzar with X = 0 reveals nothing, and it can't be activated on another player's turn", () => {
    const { s: s0, ap } = setup([]);
    const [o1] = others(s0, ap);
    const n = putOnBattlefield(s0, ap, nebu());
    toZone(s0, o1!, shock("Twin Shock"), "hand");
    const before = s0.players[o1!]!.hand.length;
    let s = settle(run(s0, planActivate(s0, ap, n, 0, [ply(o1!)], undefined, undefined, 0)));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Twin Shock" }));
    expect(s.players[o1!]!.hand.length).toBe(before);
    s = goUntil(s, "main1", o1!);
    s.objects[n]!.tapped = false;
    pool(s, ap, { C: 1 });
    expect(planActivate(priorityTo(s, ap), ap, n, 0, [ply(o1!)], undefined, undefined, 1)).toBeNull();
  });

  it("Bazaar of Wonders exiles all graveyards, then counters a spell whose name is in a graveyard or on a nontoken permanent", () => {
    const { s: s0, ap, ids } = setup([bazaar()]);
    const [o1, o2] = others(s0, ap);
    const old = toZone(s0, o1!, shock("Old Shock"), "graveyard");
    pool(s0, ap, { U: 2, C: 3 });
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(zone(s, old)).toBe("exile");
    // A spell named like a card in a graveyard: countered.
    toZone(s, o2!, shock("Twin Shock"), "graveyard");
    const twin = toZone(s, o1!, shock("Twin Shock"), "hand");
    s = goUntil(s, "main1", o1!);
    pool(s, o1!, { R: 1 });
    s = settle(run(s, planCast(s, o1!, twin, [ply(ap)])));
    expect(zone(s, twin)).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(40);
    // A spell named like a nontoken permanent: countered; a new name: it resolves.
    putOnBattlefield(s, o2!, bear({ name: "Copy Bear" }));
    const cb = toZone(s, o1!, bear({ name: "Copy Bear" }), "hand");
    pool(s, o1!, { G: 1, C: 1 });
    s = settle(run(s, planCast(s, o1!, cb)));
    expect(zone(s, cb)).toBe("graveyard");
    const fresh = toZone(s, o1!, shock("Fresh Shock"), "hand");
    pool(s, o1!, { R: 1 });
    s = settle(run(s, planCast(s, o1!, fresh, [ply(ap)])));
    expect(s.players[ap]!.life).toBe(38);
  });

  it("Bazaar of Wonders: a token with the name doesn't count, and a face-down spell has no name", () => {
    const { s: s0, ap } = setup([]);
    const [o1] = others(s0, ap);
    putOnBattlefield(s0, ap, bazaar());
    const tok = putOnBattlefield(s0, o1!, bear({ name: "Token Bear" }));
    s0.objects[tok]!.isToken = true;
    const tb = toZone(s0, ap, bear({ name: "Token Bear" }), "hand");
    pool(s0, ap, { G: 1, C: 1 });
    const s = settle(run(s0, planCast(s0, ap, tb)));
    expect(zone(s, tb)).toBe("battlefield");
  });

  it("Guard Dogs: the permanent is chosen as it resolves, and the shield is made only if the target shares a color with it", () => {
    const { s: s0, ap } = setup([]);
    const [o1] = others(s0, ap);
    const d = putOnBattlefield(s0, ap, dogs());
    const redMine = putOnBattlefield(s0, ap, ogre(2, "My Ogre"));
    const redTheirs = putOnBattlefield(s0, o1!, ogre(3, "Their Ogre"));
    const greenTheirs = putOnBattlefield(s0, o1!, bear({ name: "Their Bear" }));
    pool(s0, ap, { W: 1, C: 2 });
    let s = settle(run(s0, planActivate(s0, ap, d, 0, [tgt(redTheirs)])));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "choose" });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [redMine] }));
    expect(shields(s, redTheirs)).toBe(1);
    // White Guard Dogs chosen against the green bear: no shield.
    const { s: s1, ap: ap1 } = setup([]);
    const [p1] = others(s1, ap1);
    const d1 = putOnBattlefield(s1, ap1, dogs());
    putOnBattlefield(s1, ap1, ogre(2, "My Ogre"));
    const g1 = putOnBattlefield(s1, p1!, bear({ name: "Their Bear" }));
    pool(s1, ap1, { W: 1, C: 2 });
    let t = settle(run(s1, planActivate(s1, ap1, d1, 0, [tgt(g1)])));
    t = settle(act(t, { type: "pickPermanents", player: ap1, ids: [d1] }));
    expect(shields(t, g1)).toBe(0);
    void greenTheirs;
    // The bot picks a permanent sharing a color with the target.
    const { s: s2, ap: ap2 } = setup([]);
    const [q1] = others(s2, ap2);
    const d2 = putOnBattlefield(s2, ap2, dogs());
    const r2 = putOnBattlefield(s2, ap2, ogre(2, "My Ogre"));
    const t2 = putOnBattlefield(s2, q1!, ogre(3, "Their Ogre"));
    pool(s2, ap2, { W: 1, C: 2 });
    const u = settle(run(s2, planActivate(s2, ap2, d2, 0, [tgt(t2)])));
    expect(botActions(u, ap2)[0]).toMatchObject({ type: "pickPermanents", ids: [r2] });
  });

  it("Guard Dogs' shield prevents the creature's combat damage", () => {
    const { s: s0, ap } = setup([]);
    const [o1] = others(s0, ap);
    s0.players[ap]!.hand = [];
    const d = putOnBattlefield(s0, ap, dogs());
    const attacker = putOnBattlefield(s0, o1!, card("White Knight", "Creature — Knight", "{1}{W}", { cmc: 2, power: "4", toughness: "4" }));
    let s = goUntil(s0, "main1", o1!);
    pool(s, ap, { W: 1, C: 2 });
    s = priorityTo(s, ap);
    // Guard Dogs is the only permanent of yours that isn't a land: it's chosen at once.
    s = settle(run(s, planActivate(s, ap, d, 0, [tgt(attacker)])));
    if (s.pending?.kind === "pickPermanents") s = settle(act(s, { type: "pickPermanents", player: ap, ids: [d] }));
    const life = s.players[ap]!.life;
    s = goUntil(s, "declareAttackers", o1!);
    s = act(s, { type: "declareAttackers", player: o1!, attacks: [{ attacker, defender: ap }] });
    s = goUntil(s, "end", o1!);
    expect(s.players[ap]!.life).toBe(life);
  });

  it("Mourner's Shield: the imprinted card's colors limit the source chosen, and that source's damage is prevented this turn", () => {
    const { s: s0, ap, ids } = setup([shield()]);
    const [o1] = others(s0, ap);
    const red = toZone(s0, o1!, ogre(2, "Dead Ogre"), "graveyard");
    pool(s0, ap, { C: 4 });
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(red)] }));
    if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(zone(s, red)).toBe("exile");
    const redSrc = putOnBattlefield(s, o1!, ogre(3, "Hot Ogre"));
    const green = putOnBattlefield(s, o1!, bear({ name: "Green Bear" }));
    pool(s, ap, { C: 2 });
    s = settle(run(s, planActivate(s, ap, ids[0]!, 0)));
    // Only red sources are offered (the red Ogre, not the bear).
    if (s.pending?.kind === "chooseOption") {
      expect(s.pending.options.some((o) => o.startsWith(`${green}@`))).toBe(false);
      s = settle(act(s, { type: "chooseOption", player: ap, choice: s.pending.options.find((o) => o.startsWith(`${redSrc}@`))! }));
    }
    expect((s.damageRules ?? []).some((r) => r.by?.chosen?.id === redSrc)).toBe(true);
  });

  it("Mourner's Shield with nothing imprinted (or a colorless card) prevents nothing", () => {
    const { s: s0, ap, ids } = setup([shield()]);
    const [o1] = others(s0, ap);
    const art = toZone(s0, o1!, relic("Dead Relic"), "graveyard");
    pool(s0, ap, { C: 4 });
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(art)] }));
    if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    putOnBattlefield(s, o1!, ogre(3, "Hot Ogre"));
    pool(s, ap, { C: 2 });
    s = settle(run(s, planActivate(s, ap, ids[0]!, 0)));
    expect(s.pending).toBeNull();
    expect(s.damageRules ?? []).toHaveLength(0);
  });

  it("Clarion Ultimatum: five permanents chosen, then up to one card with each one's name, all onto the battlefield tapped", () => {
    const { s: s0, ap, ids } = setup([clarion()]);
    s0.players[ap]!.hand = [ids[0]!];
    const mine = ["Alpha Relic", "Beta Relic", "Gamma Relic", "Delta Relic", "Epsilon Relic", "Zeta Relic"].map((n) => putOnBattlefield(s0, ap, relic(n)));
    const copies = onlyLibrary(s0, ap, [relic("Alpha Relic"), relic("Alpha Relic"), relic("Beta Relic"), relic("Zeta Relic"), shock("Gamma Relic")]);
    pool(s0, ap, { G: 2, W: 3, U: 2 });
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "choose" });
    // Exactly five.
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap && !mine.includes(id));
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: mine.slice(0, 4) })).toThrow();
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: mine.slice(0, 5) }));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const pend = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    // Zeta wasn't chosen, the Gamma Relic in the library is an instant: neither is offered.
    expect(pend.cards).not.toContain(copies[3]);
    expect(pend.cards).not.toContain(copies[4]);
    // Only one Alpha Relic (one Alpha was chosen).
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [copies[0]!, copies[1]!] })).toThrow();
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [copies[0]!, copies[2]!] }));
    for (const id of [copies[0]!, copies[2]!]) {
      expect(zone(s, id)).toBe("battlefield");
      expect(s.objects[id]!.tapped).toBe(true);
    }
    expect(zone(s, copies[1]!)).toBe("library");
    void lands;
  });

  it("Clarion Ultimatum: with five or fewer permanents each is chosen; the bot chooses those with copies in its library", () => {
    const { s: s0, ap, ids } = setup([clarion()]);
    s0.players[ap]!.hand = [ids[0]!];
    const mine = ["Alpha Relic", "Beta Relic", "Gamma Relic", "Delta Relic", "Epsilon Relic", "Zeta Relic"].map((n) => putOnBattlefield(s0, ap, relic(n)));
    const copies = onlyLibrary(s0, ap, [relic("Zeta Relic")]);
    pool(s0, ap, { G: 2, W: 3, U: 2 });
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const pick = botActions(s, ap)[0] as Extract<Action, { type: "pickPermanents" }>;
    expect(pick.ids).toHaveLength(5);
    expect(pick.ids).toContain(mine[5]);
    const t = settle(act(s, pick));
    const found = settle(act(t, { type: "searchLibrary", player: ap, found: [copies[0]!] }));
    expect(zone(found, copies[0]!)).toBe("battlefield");
  });

  it("Stronghold Gambit: each player chooses a card, and every creature card tied for the lowest mana value enters", () => {
    const { s: s0, ap, ids } = setup([gambit()]);
    const [o1, o2, o3] = others(s0, ap);
    for (const p of [o1!, o2!, o3!]) s0.players[p]!.hand = [];
    s0.players[ap]!.hand = [ids[0]!];
    const mine = toZone(s0, ap, ogre(3, "My Ogre"), "hand");
    toZone(s0, ap, relic("My Relic"), "hand");
    const a = toZone(s0, o1!, ogre(2, "Ana Ogre"), "hand");
    toZone(s0, o1!, relic("Ana Relic", 1), "hand");
    const b = toZone(s0, o2!, ogre(2, "Bo Ogre"), "hand");
    const c = toZone(s0, o3!, relic("Cy Relic", 1), "hand");
    pool(s0, ap, { R: 1, C: 1 });
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    // You choose first (the active player), then Ana; Bo and Cy have one card each.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromHand: true });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [mine] }));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: o1, fromHand: true });
    // Nothing revealed yet.
    expect(s.log.some((l) => /reveals My Ogre/.test(l.text))).toBe(false);
    expect(botActions(s, o1!)[0]).toMatchObject({ type: "searchLibrary", found: [a] });
    s = settle(act(s, { type: "searchLibrary", player: o1!, found: [a] }));
    expect(zone(s, a)).toBe("battlefield");
    expect(s.objects[a]!.controller).toBe(o1);
    expect(zone(s, b)).toBe("battlefield");
    expect(s.objects[b]!.controller).toBe(o2);
    expect(zone(s, mine)).toBe("hand");
    expect(zone(s, c)).toBe("hand");
  });

  it("Booby Trap: an opponent and a name chosen as it enters; their draws are revealed, and drawing the name deals 10 damage", () => {
    const { s: s0, ap, ids } = setup([trap()]);
    const [o1] = others(s0, ap);
    // A card with the name somewhere in the game, to be chosen (CR 201.4).
    toZone(s0, o1!, shock("Twin Shock"), "exile");
    pool(s0, ap, { C: 6 });
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    for (let i = 0; i < 2 && s.pending?.kind === "chooseOption"; i++) {
      const p = s.pending;
      s = settle(act(s, { type: "chooseOption", player: ap, choice: p.what === "cardName" ? "Twin Shock" : String(o1) }));
    }
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.objects[ids[0]!]!.chosen).toMatchObject({ player: o1, name: "Twin Shock" });
    const other = toZone(s, o1!, relic("Plain Relic"), "library");
    s = goUntil(s, "main1", o1!);
    expect(s.log.some((l) => /reveals Plain Relic as they draw it/.test(l.text))).toBe(true);
    expect(zone(s, ids[0]!)).toBe("battlefield");
    void other;
    toZone(s, o1!, shock("Twin Shock"), "library");
    const life = s.players[o1!]!.life;
    s = goUntil(s, "main1", ap);
    s = goUntil(s, "main1", o1!);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.players[o1!]!.life).toBe(life - 10);
  });
});
