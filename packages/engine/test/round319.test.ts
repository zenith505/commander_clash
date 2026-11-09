// Round 319 (Lane A, skip-list cards): an opponent guesses land or nonland about your top card (Gollum, Scheming Guide);
// one required target for each player, sacrificed, then a revealed permanent card for each who did (Vaevictis Asmadi,
// the Dire); a villainous choice to give up a creature that's then tapped and attacking its old controller (Midnight
// Crusader Shuttle); "the total power of Daleks that died this turn" (Genesis of the Daleks); a d20 plus the toughness you
// sacrificed, then creature cards from among those sacrificed (Danse Macabre); "you and defending player each discard a
// card or sacrifice a permanent", drawing for the land cards (Eumidian Wastewaker); a card exiled from the top of your
// library for each of any number of targets, dealing its mana value (Soulfire Eruption); a second target chosen by the
// controller of the first (Mogg Assassin).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { applyAction, botActions, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) s = act(s, botActions(s, p.player)[0]!);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
/** A copy of `def` in `pid`'s hand, graveyard or library (on top). */
const inZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const nextOf = (s: GameState, p: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(p) + 1) % s.turnOrder.length]!;
const logSince = (s: GameState, n: number) => s.log.slice(n).map((l) => l.text).join("\n");

// Real oracle text (Scryfall).
const gollum = (): CardDef => ({"oracleId":"3fb5c9a6-3fab-4109-875b-83c92518c5eb","name":"Gollum, Scheming Guide","manaCost":"{1}{B}","cmc":2,"typeLine":"Legendary Creature — Halfling Horror","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Halfling","Horror"],"oracleText":"Whenever Gollum attacks, look at the top two cards of your library, put them back in any order, then choose land or nonland. An opponent guesses whether the top card of your library is the chosen kind. Reveal that card. If they guessed right, remove Gollum from combat. Otherwise, you draw a card and Gollum can't be blocked this turn.","power":"2","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"ltr","releasedAt":"2023-06-23","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const vaevictis = (): CardDef => ({"oracleId":"c42ce2e9-4dfe-468a-8f41-49e187cb91d4","name":"Vaevictis Asmadi, the Dire","manaCost":"{3}{B}{R}{G}","cmc":6,"typeLine":"Legendary Creature — Elder Dragon","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elder","Dragon"],"oracleText":"Flying\nWhenever Vaevictis Asmadi attacks, for each player, choose target permanent that player controls. Those players sacrifice those permanents. Each player who sacrificed a permanent this way reveals the top card of their library, then puts it onto the battlefield if it's a permanent card.","power":"6","toughness":"6","colors":["B","G","R"],"colorIdentity":["B","G","R"],"keywords":["Flying"],"commanderLegal":"legal","set":"m19","releasedAt":"2018-07-13","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const shuttle = (): CardDef => ({"oracleId":"22fa2860-d746-4429-b7e3-3403bef27f7b","name":"Midnight Crusader Shuttle","manaCost":"{4}","cmc":4,"typeLine":"Artifact — Vehicle","supertypes":[],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"Midnight Entity — Whenever this Vehicle attacks, defending player faces a villainous choice — That player sacrifices a creature of their choice, or you gain control of a creature of your choice that player controls until end of turn. If you gain control of a creature this way, tap it, and it's attacking that player.\nCrew 2","power":"3","toughness":"4","colors":[],"colorIdentity":[],"keywords":["Crew","Midnight Entity"],"commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const genesis = (): CardDef => ({"oracleId":"71ff4603-9f7a-459e-b5b3-9b39583f1dc7","name":"Genesis of the Daleks","manaCost":"{4}{B}{B}","cmc":6,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after IV.)\nI, II, III — Create a 3/3 black Dalek artifact creature token with menace for each lore counter on Genesis of the Daleks.\nIV — Target opponent faces a villainous choice — Destroy all Dalek creatures and each of your opponents loses life equal to the total power of Daleks that died this turn, or destroy all non-Dalek creatures.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"saga","gameChanger":false} as CardDef);
const danse = (): CardDef => ({"oracleId":"a9c58cfe-9630-48fa-84ad-50268eb725ed","name":"Danse Macabre","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each player sacrifices a nontoken creature of their choice. Roll a d20 and add the toughness of the creature you sacrificed this way.\n1—14 | Return a creature card put into a graveyard this way to the battlefield under your control.\n15+ | Return up to two creature cards put into graveyards this way to the battlefield under your control.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"afc","releasedAt":"2021-07-23","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const wastewaker = (): CardDef => ({"oracleId":"72a570a2-0a22-4680-ac88-a1724faf17de","name":"Eumidian Wastewaker","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Creature — Insect Cleric","supertypes":[],"types":["Creature"],"subtypes":["Insect","Cleric"],"oracleText":"Whenever this creature attacks, you and defending player each discard a card or sacrifice a permanent. You draw a card for each land card put into a graveyard this way.\nEncore {6}{B}{B} ({6}{B}{B}, Exile this card from your graveyard: For each opponent, create a token copy that attacks that opponent this turn if able. They gain haste. Sacrifice them at the beginning of the next end step. Activate only as a sorcery.)","power":"4","toughness":"4","colors":["B"],"colorIdentity":["B"],"keywords":["Encore"],"commanderLegal":"legal","set":"eoc","releasedAt":"2025-08-01","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const soulfire = (): CardDef => ({"oracleId":"089dd3b7-c3ed-4734-8789-a3c1ed9a4e40","name":"Soulfire Eruption","manaCost":"{6}{R}{R}{R}","cmc":9,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose any number of target creatures, planeswalkers, and/or players. For each of them, exile the top card of your library, then Soulfire Eruption deals damage equal to that card's mana value to that permanent or player. You may play the exiled cards until the end of your next turn.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"cmr","releasedAt":"2020-11-20","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const mogg = (): CardDef => ({"oracleId":"36a6925a-621e-47d6-8cb3-1b2886e1986e","name":"Mogg Assassin","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Goblin Assassin","supertypes":[],"types":["Creature"],"subtypes":["Goblin","Assassin"],"oracleText":"{T}: You choose target creature an opponent controls, and that opponent chooses target creature. Flip a coin. If you win the flip, destroy the creature you chose. If you lose the flip, destroy the creature your opponent chose.","power":"2","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"sld","releasedAt":"2026-02-23","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const goblin = (name: string) => card(name, "Creature — Goblin", "{R}", { cmc: 1, power: "1", toughness: "1" });
const land = (name: string) => card(name, "Land");
const sorcery = (name: string) => card(name, "Sorcery", "{1}", { cmc: 1, oracleText: "Draw a card." });

describe("round 319", () => {
  it("are fully supported", () => supported(gollum(), vaevictis(), shuttle(), genesis(), danse(), wastewaker(), soulfire(), mogg()));
});

describe("round 319: Gollum, Scheming Guide", () => {
  /** Gollum attacking the next player, Land A then Spell B on top of the library, and the trigger asking for the order. */
  const attack = () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, gollum());
    const spell = inZone(s0, ap, sorcery("Spell B"), "library");
    const lnd = inZone(s0, ap, land("Land A"), "library");
    const o = nextOf(s0, ap);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: g, defender: o }] });
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap, how: "order" });
    return { s, ap, g, o, lnd, spell };
  };

  it("you order the top two, choose land, and the opponent you choose guesses wrong: you draw it and Gollum can't be blocked", () => {
    let { s, ap, g, o, lnd, spell } = attack();
    // Spell B on top now.
    s = act(s, { type: "arrangeTop", player: ap, top: [spell, lnd], away: [] });
    expect(s.players[ap]!.library.slice(0, 2)).toEqual([spell, lnd]);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "landOrNonland" });
    s = act(s, { type: "chooseOption", player: ap, choice: "land" });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "opponent" });
    s = act(s, { type: "chooseOption", player: ap, choice: String(o) });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: o, what: "either", options: ["0", "1"], labels: ["Guess it's a land card", "Guess it isn't a land card"] });
    const before = s.log.length;
    // "It's a land": wrong.
    s = act(s, { type: "chooseOption", player: o, choice: "0" });
    expect(logSince(s, before)).toContain("reveals Spell B from the top of their library: the guess was wrong");
    s = settle(s, ap);
    expect(zone(s, spell)).toBe("hand");
    expect(s.objects[g]!.attacking).toBeDefined();
    expect(JSON.stringify(s.effects)).toContain("cantBeBlocked");
  });

  it("a right guess removes Gollum from combat, and nothing is drawn", () => {
    let { s, ap, g, o, lnd, spell } = attack();
    s = act(s, { type: "arrangeTop", player: ap, top: [lnd, spell], away: [] });
    s = act(s, { type: "chooseOption", player: ap, choice: "nonland" });
    s = act(s, { type: "chooseOption", player: ap, choice: String(o) });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: o, labels: ["Guess it's a nonland card", "Guess it isn't a nonland card"] });
    const hand = s.players[ap]!.hand.length;
    // "It isn't a nonland card": right, Land A is on top.
    s = act(s, { type: "chooseOption", player: o, choice: "1" });
    s = settle(s, ap);
    expect(s.objects[g]!.attacking).toBeUndefined();
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.players[ap]!.library[0]).toBe(lnd);
  });

  it("with an empty library no guess is right: you try to draw from it", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, gollum());
    const o = nextOf(s0, ap);
    let s = passUntil(s0, "declareAttackers", ap);
    for (const id of s.players[ap]!.library) delete s.objects[id];
    s.players[ap]!.library = [];
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: g, defender: o }] });
    s = settle(s, ap);
    if (s.pending?.kind === "chooseOption" && s.pending.what === "landOrNonland") s = act(s, { type: "chooseOption", player: ap, choice: "land" });
    s = act(s, { type: "chooseOption", player: ap, choice: String(o) });
    // The bot guesses; either way it's wrong, so you draw from an empty library and lose (CR 704.5b).
    const before = s.log.length;
    s = settle(s, ap);
    expect(logSince(s, before)).toContain("library is empty: the guess was wrong");
    expect(s.players[ap]!.lost).toBeTruthy();
  });
});

describe("round 319: Vaevictis Asmadi, the Dire", () => {
  /** Vaevictis attacking, one Goblin for each opponent, and the trigger asking for its targets. */
  const attack = (bare?: PlayerId) => {
    const { s: s0, ap } = setup([]);
    const v = putOnBattlefield(s0, ap, vaevictis());
    const others = [1, 2, 3].map((k) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + k) % 4]!);
    const theirs = others.map((p, i) => (p === bare ? "" : putOnBattlefield(s0, p, goblin(`Gob ${i}`))));
    const mine = putOnBattlefield(s0, ap, land("My Land"));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: v, defender: others[0]! }] });
    return { s: settle(s, ap), ap, v, others, theirs, mine };
  };

  it("one target for each player, you first; each sacrifices theirs and puts a revealed permanent card onto the battlefield", () => {
    const { s: s0, ap, v, others, theirs, mine } = attack();
    expect(s0.pending).toMatchObject({ kind: "chooseTargets", player: ap, specs: [{ controlledBy: ap }, { controlledBy: others[0] }, { controlledBy: others[1] }, { controlledBy: others[2] }] });
    // Tops: yours a creature card, then a land card, a sorcery card (stays) and a creature card.
    const tops = [inZone(s0, ap, goblin("Top Mine"), "library"), inZone(s0, others[0]!, land("Top Land"), "library"), inZone(s0, others[1]!, sorcery("Top Sorcery"), "library"), inZone(s0, others[2]!, goblin("Top Gob"), "library")];
    const before = s0.log.length;
    let s = act(s0, { type: "chooseTargets", player: ap, targets: [mine, ...theirs].map((id) => ({ kind: "object" as const, id })) });
    s = settle(s, ap);
    expect([mine, ...theirs].map((id) => zone(s, id))).toEqual(["graveyard", "graveyard", "graveyard", "graveyard"]);
    expect(tops.map((id) => zone(s, id))).toEqual(["battlefield", "battlefield", "library", "battlefield"]);
    expect(s.objects[tops[1]!]!.controller).toBe(others[0]);
    expect(logSince(s, before)).toContain("reveals Top Sorcery.");
    expect(zone(s, v)).toBe("battlefield");
  });

  it("a player who controls no permanent leaves no legal choice for their target: the ability is removed", () => {
    const { s, ap } = attack();
    expect(s.pending?.kind).toBe("chooseTargets");
    const bare = attack(nextOf(s, ap));
    expect(bare.s.pending).toBeNull();
    expect(bare.s.stack.length).toBe(0);
    expect(bare.theirs.filter(Boolean).map((id) => zone(bare.s, id))).toEqual(["battlefield", "battlefield"]);
    expect(zone(bare.s, bare.mine)).toBe("battlefield");
  });

  it("a target that became illegal isn't sacrificed, and its controller doesn't reveal", () => {
    const { s: s0, ap, others, theirs, mine } = attack();
    const top = inZone(s0, others[0]!, goblin("Top Gob"), "library");
    let s = act(s0, { type: "chooseTargets", player: ap, targets: [mine, ...theirs].map((id) => ({ kind: "object" as const, id })) });
    // Its Goblin goes back to its hand before the ability resolves.
    const gob = s.objects[theirs[0]!]!;
    s.battlefield.splice(s.battlefield.indexOf(gob.id), 1);
    gob.zone = "hand";
    s.players[others[0]!]!.hand.push(gob.id);
    invalidateCharacteristics(s);
    const before = s.log.length;
    s = settle(s, ap);
    expect(zone(s, top)).toBe("library");
    expect(logSince(s, before)).not.toContain("reveals Top Gob");
    expect(zone(s, theirs[1]!)).toBe("graveyard");
  });

  it("a bot sacrifices its least useful permanent, not Vaevictis", () => {
    const { s: s0, ap, v } = attack();
    let s = act(s0, botActions(s0, ap)[0]!);
    s = settle(s);
    expect(zone(s, v)).toBe("battlefield");
    expect(s.players[ap]!.graveyard.length).toBe(1);
  });
});

describe("round 319: Midnight Crusader Shuttle", () => {
  /** The Shuttle crewed and attacking the next player, who has two creatures; its trigger waiting on their choice. */
  const attack = () => {
    const { s: s0, ap } = setup([]);
    const v = putOnBattlefield(s0, ap, shuttle());
    const crew = putOnBattlefield(s0, ap, card("Crew Ogre", "Creature — Ogre", "{2}", { power: "3", toughness: "3" }));
    const o = nextOf(s0, ap);
    const small = putOnBattlefield(s0, o, goblin("Small Gob"));
    const big = putOnBattlefield(s0, o, card("Big Ogre", "Creature — Ogre", "{4}", { power: "5", toughness: "5" }));
    let s = settle(run(s0, planActivate(s0, ap, v, 0, undefined, undefined, [crew])), ap);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: v, defender: o }] });
    s = settle(s, o);
    return { s, ap, o, v, small, big };
  };

  it("the defending player chooses to give up a creature: you choose it, gain control of it, and it's tapped and attacking them", () => {
    let { s, ap, o, small, big } = attack();
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: o, what: "villainous", labels: ["That player sacrifices a creature of their choice", "You gain control of a creature of your choice that player controls until end of turn, tapped and attacking that player"] });
    s = act(s, { type: "chooseOption", player: o, choice: "1" });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, prompt: expect.stringContaining("to gain control of it until end of turn, tapped and attacking them") });
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([big, small].sort());
    s = act(s, { type: "pickPermanents", player: ap, ids: [big] });
    s = settle(s, ap);
    const c = s.objects[big]!;
    expect(controllerOf(s, c)).toBe(ap);
    expect(c.tapped).toBe(true);
    expect(c.attacking).toBe(o);
    expect(zone(s, small)).toBe("battlefield");
    // Combat damage: 3 from the Shuttle and 5 from the Ogre.
    const life = s.players[o]!.life;
    s = passUntil(s, "endCombat", ap);
    expect(s.players[o]!.life).toBe(life - 8);
    // Back to its controller as the turn ends.
    s = passUntil(s, "upkeep", nextOf(s, ap));
    expect(controllerOf(s, s.objects[big]!)).toBe(o);
  });

  it("or they sacrifice a creature of their choice", () => {
    let { s, o, small, big } = attack();
    s = act(s, { type: "chooseOption", player: o, choice: "0" });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: o, action: "sacrifice" });
    s = act(s, { type: "pickPermanents", player: o, ids: [small] });
    s = settle(s, o);
    expect(zone(s, small)).toBe("graveyard");
    expect(zone(s, big)).toBe("battlefield");
  });
});

describe("round 319: Genesis of the Daleks", () => {
  /** Chapter IV about to resolve against the next player: ap has two 3/3 Daleks, that player a 2/2 Bear. */
  const chapterFour = () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, genesis());
    s0.objects[g]!.counters.lore = 3;
    const dalek = (n: string) => card(n, "Artifact Creature — Dalek", "{3}", { power: "3", toughness: "3" });
    const daleks = [putOnBattlefield(s0, ap, dalek("Dalek One")), putOnBattlefield(s0, ap, dalek("Dalek Two"))];
    const o = nextOf(s0, ap);
    const bear = putOnBattlefield(s0, o, card("Test Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    s0.players[ap]!.hand = [];
    let s = passUntil(s0, "upkeep", o);
    s = passUntil(s, "main1", ap);
    s = settle(s, ap);
    return { s, ap, o, g, daleks, bear };
  };

  it("chapter IV: the opponent may destroy the Daleks, then each of your opponents loses their total power", () => {
    let { s, ap, o, daleks, bear } = chapterFour();
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: o }] });
    s = settle(s, o);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: o, what: "villainous", labels: ["Destroy all Dalek creatures and each of your opponents loses life equal to the total power of Daleks that died this turn", "Destroy all non-Dalek creatures"] });
    const life = s.turnOrder.filter((p) => p !== ap).map((p) => s.players[p]!.life);
    s = act(s, { type: "chooseOption", player: o, choice: "0" });
    s = settle(s, ap);
    expect(daleks.map((id) => zone(s, id))).toEqual(["graveyard", "graveyard"]);
    expect(zone(s, bear)).toBe("battlefield");
    expect(s.turnOrder.filter((p) => p !== ap).map((p) => s.players[p]!.life)).toEqual(life.map((l) => l - 6));
  });

  it("or the non-Dalek creatures are destroyed, and nobody loses life", () => {
    let { s, ap, o, daleks, bear } = chapterFour();
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: o }] });
    s = settle(s, o);
    const life = s.players[o]!.life;
    s = act(s, { type: "chooseOption", player: o, choice: "1" });
    s = settle(s, ap);
    expect(daleks.map((id) => zone(s, id))).toEqual(["battlefield", "battlefield"]);
    expect(zone(s, bear)).toBe("graveyard");
    expect(s.players[o]!.life).toBe(life);
  });

  it("a Dalek that died earlier this turn counts too, as it last existed", () => {
    let { s, ap, o, daleks } = chapterFour();
    // One more Dalek, pumped to 5 power, dies before chapter IV resolves.
    s.diedTypesThisTurn = [...(s.diedTypesThisTurn ?? []), { subtypes: ["Dalek"], controller: o, power: 5 }];
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: o }] });
    s = settle(s, o);
    const life = s.players[o]!.life;
    s = act(s, { type: "chooseOption", player: o, choice: "0" });
    s = settle(s, ap);
    expect(daleks.map((id) => zone(s, id))).toEqual(["graveyard", "graveyard"]);
    expect(s.players[o]!.life).toBe(life - 11);
  });
});

describe("round 319: Danse Macabre", () => {
  /** Each player with one nontoken creature, yours a 1/5 Wall, and the rng set so the d20 comes up `want` ("low": 1-9, "high": 10+). */
  const cast = (want: "low" | "high") => {
    for (let k = 1; k < 500; k++) {
      const { s: s0, ap, ids } = setup([danse()]);
      const wall = putOnBattlefield(s0, ap, card("Test Wall", "Creature — Wall", "{1}", { power: "1", toughness: "5" }));
      const others = [1, 2, 3].map((i) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + i) % 4]!);
      const gobs = others.map((p, i) => putOnBattlefield(s0, p, goblin(`Gob ${i}`)));
      const tok = putOnBattlefield(s0, others[0]!, goblin("Gob Token"));
      s0.objects[tok]!.isToken = true;
      s0.rngState = k;
      const before = s0.log.length;
      const s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
      const roll = /rolls a d20 for Danse Macabre: (\d+) \+ 5 = (\d+)/.exec(logSince(s, before));
      if (!roll) throw new Error("no roll");
      if ((want === "low") === Number(roll[2]) <= 14) return { s, ap, wall, gobs, tok, total: Number(roll[2]) };
    }
    throw new Error("no such roll");
  };

  it("each player sacrifices a nontoken creature; 1-14 with your toughness added: you return one of those creature cards", () => {
    let { s, ap, wall, gobs, tok, total } = cast("low");
    expect(total).toBeLessThanOrEqual(14);
    expect([wall, ...gobs].map((id) => zone(s, id))).toEqual(["graveyard", "graveyard", "graveyard", "graveyard"]);
    // The token wasn't a choice.
    expect(zone(s, tok)).toBe("battlefield");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 1, max: 1, fromGraveyard: "battlefield" });
    expect([...(s.pending as { cards: string[] }).cards].sort()).toEqual([wall, ...gobs].sort());
    s = act(s, { type: "searchLibrary", player: ap, found: [gobs[1]!] });
    s = settle(s, ap);
    expect(zone(s, gobs[1]!)).toBe("battlefield");
    expect(controllerOf(s, s.objects[gobs[1]!]!)).toBe(ap);
    expect(zone(s, wall)).toBe("graveyard");
  });

  it("15 or more: up to two of them", () => {
    let { s, ap, wall, gobs, total } = cast("high");
    expect(total).toBeGreaterThanOrEqual(15);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 2 });
    s = act(s, { type: "searchLibrary", player: ap, found: [wall, gobs[2]!] });
    s = settle(s, ap);
    expect([wall, gobs[2]!].map((id) => zone(s, id))).toEqual(["battlefield", "battlefield"]);
    expect(controllerOf(s, s.objects[gobs[2]!]!)).toBe(ap);
  });

  it("without a creature of your own nothing is added to the roll", () => {
    const { s: s0, ap, ids } = setup([danse()]);
    const o = nextOf(s0, ap);
    putOnBattlefield(s0, o, goblin("Gob"));
    const before = s0.log.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(logSince(s, before)).toMatch(/rolls a d20 for Danse Macabre: \d+\./);
  });
});

describe("round 319: Eumidian Wastewaker", () => {
  const attack = () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, wastewaker());
    const o = nextOf(s0, ap);
    s0.players[ap]!.hand = [];
    s0.players[o]!.hand = [];
    const myLand = inZone(s0, ap, land("Hand Land"), "hand");
    const theirGob = putOnBattlefield(s0, o, goblin("Their Gob"));
    const theirLand = inZone(s0, o, land("Their Hand Land"), "hand");
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: w, defender: o }] });
    s = settle(s, ap);
    return { s, ap, o, w, myLand, theirGob, theirLand };
  };

  it("you choose first and do it, then defending player; you draw for each land card put into a graveyard", () => {
    let { s, ap, o, myLand, theirGob, theirLand } = attack();
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "either", labels: ["Discard a card", "Sacrifice a permanent"] });
    s = act(s, { type: "chooseOption", player: ap, choice: "0" });
    // One card in hand: discarded without a question, before the defending player chooses.
    expect(zone(s, myLand)).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: o, what: "either" });
    s = act(s, { type: "chooseOption", player: o, choice: "0" });
    s = settle(s, ap);
    expect(zone(s, theirLand)).toBe("graveyard");
    expect(zone(s, theirGob)).toBe("battlefield");
    // Two land cards: two cards drawn.
    expect(s.players[ap]!.hand.length).toBe(2);
  });

  it("a sacrificed creature isn't a land card, and a player with an empty hand must sacrifice", () => {
    let { s, ap, o, theirGob, theirLand } = attack();
    s = act(s, { type: "chooseOption", player: ap, choice: "1" });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "sacrifice" });
    const mine = (s.pending as { options: string[] }).options.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Mountain")!;
    s = act(s, { type: "pickPermanents", player: ap, ids: [mine] });
    expect(zone(s, mine)).toBe("graveyard");
    // The defending player's hand emptied: only a sacrifice is left, no question.
    const s2 = structuredClone(s);
    s2.players[o]!.hand = [];
    s2.objects[theirLand]!.zone = "exile";
    s2.players[o]!.exile.push(theirLand);
    const after = settle(s2, ap);
    expect(zone(after, theirGob)).toBe("graveyard");
    // The Mountain only: one card.
    expect(after.players[ap]!.hand.length).toBe(2);
    void s;
  });
});

describe("round 319: Soulfire Eruption", () => {
  const spell = (name: string, cmc: number) => card(name, "Sorcery", `{${cmc}}`, { cmc, oracleText: "Draw a card." });
  /** Your library topped with cards of mana value 1, 2, 3, 4 (in that order) and creatures for you and the next player. */
  const board = () => {
    const { s, ap, ids } = setup([soulfire()]);
    const tops = [4, 3, 2, 1].map((n) => inZone(s, ap, spell(`Spell ${n}`, n), "library")).reverse();
    const o = nextOf(s, ap);
    const o2 = nextOf(s, o);
    const mine = putOnBattlefield(s, ap, card("My Wall", "Creature — Wall", "{1}", { power: "0", toughness: "8" }));
    const theirs = putOnBattlefield(s, o, card("Their Wall", "Creature — Wall", "{1}", { power: "0", toughness: "8" }));
    return { s, ap, ids, tops, o, o2, mine, theirs };
  };

  it("APNAP by player: your creature first, then the next player's two in the order you choose, then the third; each dealt the exiled card's mana value", () => {
    const { s: s0, ap, ids, tops, o, o2, mine, theirs } = board();
    const life = (s: GameState, p: PlayerId) => s.players[p]!.life;
    const [lo, lo2] = [life(s0, o), life(s0, o2)];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: o2 }, target(theirs), { kind: "player", id: o }, target(mine)])), ap);
    // Your creature got the top card (mana value 1); the next player's two are asked about.
    expect(s.objects[mine]!.damage).toBe(1);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "nextTarget", labels: ["Their Wall", s0.players[o]!.name] });
    const [wall] = (s.pending as { options: string[] }).options;
    s = act(s, { type: "chooseOption", player: ap, choice: wall! });
    s = settle(s, ap);
    expect(s.objects[theirs]!.damage).toBe(2);
    expect(life(s, o)).toBe(lo - 3);
    expect(life(s, o2)).toBe(lo2 - 4);
    expect(tops.map((id) => zone(s, id))).toEqual(["exile", "exile", "exile", "exile"]);
    // You may play them until the end of your next turn.
    for (const id of tops) expect(s.objects[id]!.mayPlay).toMatchObject({ player: ap, until: "nextTurn" });
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });

  it("a land exiled this way deals no damage, and an empty library exiles nothing", () => {
    const { s: s0, ap, ids, opp: o } = setup([soulfire()]);
    const l = inZone(s0, ap, land("Land A"), "library");
    s0.players[ap]!.library = [l];
    const o2 = nextOf(s0, o);
    const [lo, lo2] = [s0.players[o]!.life, s0.players[o2]!.life];
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: o }, { kind: "player", id: o2 }])), ap);
    expect(s.pending).toBeFalsy();
    expect(zone(s, l)).toBe("exile");
    expect([s.players[o]!.life, s.players[o2]!.life]).toEqual([lo, lo2]);
  });

  it("the bot answers which target is next", () => {
    const { s: s0, ap, ids, o, theirs } = board();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(theirs), { kind: "player", id: o }])), ap);
    expect(s.pending).toMatchObject({ what: "nextTarget" });
    s = settle(act(s, botActions(s, ap)[0]!), ap);
    expect(s.pending).toBeFalsy();
    expect(s.objects[theirs]!.damage + (s0.players[o]!.life - s.players[o]!.life)).toBe(1 + 2);
  });
});

describe("round 319: Mogg Assassin", () => {
  const board = () => {
    const { s, ap } = setup([]);
    const m = putOnBattlefield(s, ap, mogg());
    const mine = putOnBattlefield(s, ap, card("My Wall", "Creature — Wall", "{1}", { power: "0", toughness: "8" }));
    const o = nextOf(s, ap);
    const theirs = putOnBattlefield(s, o, card("Their Wall", "Creature — Wall", "{1}", { power: "0", toughness: "8" }));
    const other = putOnBattlefield(s, nextOf(s, o), card("Other Wall", "Creature — Wall", "{1}", { power: "0", toughness: "8" }));
    invalidateCharacteristics(s);
    return { s, ap, m, mine, o, theirs, other };
  };

  it("you choose their creature, then its controller (no question which opponent) chooses the second; the flip destroys one", () => {
    const seen = new Set<string>();
    for (let k = 1; k < 60 && seen.size < 2; k++) {
      const { s: s0, ap, m, mine, o, theirs } = board();
      s0.rngState = k;
      let s = run(s0, planActivate(s0, ap, m, 0, [target(theirs), { kind: "none" }]));
      expect(s.pending).toMatchObject({ kind: "chooseTargets", player: o, controller: ap });
      s = act(s, { type: "chooseTargets", player: o, targets: [target(mine)] });
      expect(s.objects[m]!.tapped).toBe(true);
      const before = s.log.length;
      s = settle(s, ap);
      const won = /flips a coin for Mogg Assassin and wins the flip/.test(logSince(s, before));
      seen.add(String(won));
      expect([zone(s, theirs), zone(s, mine)]).toEqual(won ? ["graveyard", "battlefield"] : ["battlefield", "graveyard"]);
    }
    expect(seen.size).toBe(2);
  });

  it("the opponent may choose the same creature you chose (CR 115.3), and a bot chooses a creature that isn't its own", () => {
    const { s: s0, ap, m, o, theirs } = board();
    let s = run(s0, planActivate(s0, ap, m, 0, [target(theirs), { kind: "none" }]));
    const same = act(s, { type: "chooseTargets", player: o, targets: [target(theirs)] });
    expect(same.pending).toBeFalsy();
    const bot = botActions(s, o)[0]!;
    expect(bot).toMatchObject({ type: "chooseTargets", player: o });
    const pick = (bot as { targets: { id: string }[] }).targets[0]!.id;
    expect(controllerOf(s, s.objects[pick]!)).not.toBe(o);
  });

  it("can't be activated without a creature an opponent controls, or with the second target given by you", () => {
    const { s: s0, ap, m, mine, theirs, other } = board();
    expect(planActivate(s0, ap, m, 0, [target(mine), { kind: "none" }])).toBeNull();
    expect(() => run(s0, planActivate(s0, ap, m, 0, [target(theirs), target(other)]))).toThrow();
  });
});
