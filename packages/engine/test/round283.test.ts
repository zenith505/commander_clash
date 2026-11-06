// Round 283: from the top of the popularity list. Planechase instructions outside Planechase (Start the TARDIS, Ichor
// Elixir, Susan Foreman), a coin flip that flickers or sacrifices (Frenetic Sliver), "a creature card left your graveyard
// this turn" and casting a card from the graveyard as a trigger resolves (Syrix), exiling the top card of each library
// with counters (Pako), damage one object dealt one player this turn (Vessel of the All-Consuming), Black Widow's counter
// or cast, and putting a face-up exiled card into its owner's graveyard (Binding Negotiation).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, compileCard, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";
import { nextRandom } from "../src/rng";
import { moveObject } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
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
/** Sets the game's random state so the next flips come out as `wins` (true: won). */
function rig(s: GameState, ...wins: boolean[]) {
  for (let x = 1; x < 1_000_000; x++) {
    const r = { rngState: x };
    if (wins.every((w) => nextRandom(r) < 0.5 === w)) {
      s.rngState = x;
      return;
    }
  }
  throw new Error("no such state");
}
/** On through combat with no blocks, stopping at any question other than blocks. */
const throughCombat = (s: GameState) => {
  for (let i = 0; i < 200 && s.step !== "endCombat" && s.step !== "main2"; i++) {
    const w = waitingOn(s)!;
    if (s.pending && s.pending.kind !== "declareBlockers") return s;
    s = act(s, s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: w, blocks: [] } : { type: "passPriority", player: w });
  }
  return s;
};
const attack = (s: GameState, ap: PlayerId, attacker: string, defender: PlayerId) => {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender }] });
  return throughCombat(s);
};
const sliver = (name = "Test Sliver") => card(name, "Creature — Sliver", "{1}", { power: "1", toughness: "1" });
const phoenix = (name = "Test Phoenix", p = "2") => card(name, "Creature — Phoenix", "{2}{R}", { power: p, toughness: "2" });

// Real oracle text (Scryfall).
const tardis = (): CardDef => ({"oracleId": "31b72bcc-2f45-4ff8-8e4b-27c020ff0e32", "name": "Start the TARDIS", "manaCost": "{1}{U}", "cmc": 2, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Surveil 2, then draw a card. You may planeswalk. (To surveil 2, look at the top two cards of your library, then put any number of them into your graveyard and the rest on top of your library in any order.)\nJump-start (You may cast this card from your graveyard by discarding a card in addition to paying its other costs. Then exile this card.)", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Surveil", "Jump", "Jump-start"], "commanderLegal": "legal", "set": "who", "releasedAt": "2023-10-13", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;
const elixir = (): CardDef => ({"oracleId": "81b06e8d-ed30-4f90-b729-0aa93b0d870f", "name": "Ichor Elixir", "manaCost": "{4}", "cmc": 4, "typeLine": "Artifact", "supertypes": [], "types": ["Artifact"], "subtypes": [], "oracleText": "If you would roll one or more planar dice, instead roll that many planar dice plus one and ignore one.\n{T}: Add {C}{C}.", "colors": [], "colorIdentity": [], "keywords": [], "producedMana": ["C"], "commanderLegal": "legal", "set": "moc", "releasedAt": "2023-04-21", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const susan = (): CardDef => ({"oracleId": "0f21f3b1-aee9-4272-ad02-067aa5f6a7c8", "name": "Susan Foreman", "manaCost": "{1}{G}", "cmc": 2, "typeLine": "Legendary Creature — Time Lord", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Time Lord"], "oracleText": "If you would planeswalk, instead look at the top two cards of your planar deck, put one on the bottom of your planar deck and the other on top, then planeswalk.\n{T}: Add {G}.\nDoctor's companion (You can have two commanders if the other is the Doctor.)", "power": "1", "toughness": "1", "colors": ["G"], "colorIdentity": ["G"], "keywords": ["Doctor's companion"], "producedMana": ["G"], "commanderLegal": "legal", "set": "who", "releasedAt": "2023-10-13", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const frenetic = (): CardDef => ({"oracleId": "b1af4207-e546-4bde-950b-3234dfffe278", "name": "Frenetic Sliver", "manaCost": "{1}{U}{R}", "cmc": 3, "typeLine": "Creature — Sliver", "supertypes": [], "types": ["Creature"], "subtypes": ["Sliver"], "oracleText": "All Slivers have \"{0}: If this permanent is on the battlefield, flip a coin. If you win the flip, exile this permanent and return it to the battlefield under its owner's control at the beginning of the next end step. If you lose the flip, sacrifice it.\"", "power": "2", "toughness": "2", "colors": ["R", "U"], "colorIdentity": ["R", "U"], "keywords": [], "commanderLegal": "legal", "set": "plc", "releasedAt": "2007-02-02", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;
const syrix = (): CardDef => ({"oracleId": "ec97bb0e-0dc8-4b9b-8762-2f1649cc9044", "name": "Syrix, Carrier of the Flame", "manaCost": "{2}{B}{R}", "cmc": 4, "typeLine": "Legendary Creature — Phoenix", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Phoenix"], "oracleText": "Flying, haste\nAt the beginning of each end step, if a creature card left your graveyard this turn, target Phoenix you control deals damage equal to its power to any target.\nWhenever another Phoenix you control dies, you may cast this card from your graveyard.", "power": "3", "toughness": "3", "colors": ["B", "R"], "colorIdentity": ["B", "R"], "keywords": ["Flying", "Haste"], "commanderLegal": "legal", "set": "ncc", "releasedAt": "2022-04-29", "rarity": "rare", "layout": "normal", "gameChanger": false}) as CardDef;
const pako = (): CardDef => ({"oracleId": "680a3e17-5144-4e97-bc59-9f5fc3ad6514", "name": "Pako, Arcane Retriever", "manaCost": "{3}{R}{G}", "cmc": 5, "typeLine": "Legendary Creature — Elemental Dog", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Elemental", "Dog"], "oracleText": "Partner with Haldan, Avid Arcanist\nHaste\nWhenever Pako attacks, exile the top card of each player's library and put a fetch counter on each of them. Put a +1/+1 counter on Pako for each noncreature card exiled this way.", "power": "3", "toughness": "3", "colors": ["G", "R"], "colorIdentity": ["G", "R"], "keywords": ["Partner with", "Haste", "Partner"], "commanderLegal": "legal", "set": "c20", "releasedAt": "2020-04-17", "rarity": "mythic", "layout": "normal", "gameChanger": false}) as CardDef;
const hidetsugu = (): CardDef => ({"oracleId": "5b8be856-c08d-4356-925d-fce843565189", "name": "Hidetsugu Consumes All // Vessel of the All-Consuming", "manaCost": "{1}{B}{R}", "cmc": 3, "typeLine": "Enchantment — Saga // Enchantment Creature — Ogre Shaman", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Saga"], "oracleText": "(As this Saga enters and after your draw step, add a lore counter.)\nI — Destroy each nonland permanent with mana value 1 or less.\nII — Exile all graveyards.\nIII — Exile this Saga, then return it to the battlefield transformed under your control.", "colors": ["B", "R"], "colorIdentity": ["B", "R"], "keywords": ["Transform", "Trample"], "commanderLegal": "legal", "set": "neo", "releasedAt": "2022-02-18", "rarity": "mythic", "layout": "transform", "gameChanger": false, "faces": [{"name": "Hidetsugu Consumes All", "manaCost": "{1}{B}{R}", "typeLine": "Enchantment — Saga", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Saga"], "oracleText": "(As this Saga enters and after your draw step, add a lore counter.)\nI — Destroy each nonland permanent with mana value 1 or less.\nII — Exile all graveyards.\nIII — Exile this Saga, then return it to the battlefield transformed under your control.", "colors": ["B", "R"]}, {"name": "Vessel of the All-Consuming", "manaCost": "", "typeLine": "Enchantment Creature — Ogre Shaman", "supertypes": [], "types": ["Enchantment", "Creature"], "subtypes": ["Ogre", "Shaman"], "oracleText": "Trample\nWhenever this creature deals damage, put a +1/+1 counter on it.\nWhenever this creature deals damage to a player, if it has dealt 10 or more damage to that player this turn, they lose the game.", "power": "3", "toughness": "3", "colors": ["B", "R"], "colorIndicator": ["B", "R"]}]}) as CardDef;
const widow = (): CardDef => ({"oracleId": "579f9a86-a1af-4c2a-a7e5-8fea0bd0eb61", "name": "Black Widow, Super Spy", "manaCost": "{1}{B}", "cmc": 2, "typeLine": "Legendary Creature — Human Spy Hero", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Spy", "Hero"], "oracleText": "Menace\nWhenever Black Widow deals combat damage to a player, that player exiles cards from the top of their library until they exile a nonland card. You may put a +1/+1 counter on Black Widow. If you don't, you may cast the exiled nonland card until end of turn and mana of any type can be spent to cast that spell.", "power": "2", "toughness": "1", "colors": ["B"], "colorIdentity": ["B"], "keywords": ["Menace"], "commanderLegal": "legal", "set": "msh", "releasedAt": "2026-06-26", "rarity": "mythic", "layout": "normal", "gameChanger": false}) as CardDef;
const binding = (): CardDef => ({"oracleId": "86dc3a41-4fb9-4b1f-8279-2b5edbc7e170", "name": "Binding Negotiation", "manaCost": "{1}{B}", "cmc": 2, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Target opponent reveals their hand. You may choose a nonland card from it. If you do, they discard it. Otherwise, you may put a face-up exiled card they own into their graveyard.", "colors": ["B"], "colorIdentity": ["B"], "keywords": [], "commanderLegal": "legal", "set": "otj", "releasedAt": "2024-04-19", "rarity": "uncommon", "layout": "normal", "gameChanger": false}) as CardDef;

describe("round 283", () => {
  it("every card of the round compiles fully", () => {
    supported(tardis(), elixir(), susan(), frenetic(), syrix(), pako(), hidetsugu(), widow(), binding());
  });
});

describe("Planechase instructions outside a Planechase game", () => {
  it("Start the TARDIS: surveil 2, then draw a card; planeswalking does nothing (CR 701.31a)", () => {
    const body = compileCard(tardis()).spell!;
    expect(body.effects.map((e) => e.type)).toEqual(["surveil", "draw", "noEffect"]);
    const { s: s0, ap, ids } = setup([tardis()]);
    const hand = s0.players[ap]!.hand.length;
    let s = cast(s0, ap, ids[0]!);
    for (let i = 0; i < 5 && s.pending; i++) {
      const p = s.pending;
      if (p.kind !== "arrangeTop") throw new Error(JSON.stringify(p));
      s = settle(act(s, { type: "arrangeTop", player: ap, top: [], away: p.cards }));
    }
    expect(s.stack).toHaveLength(0);
    // The spell left the hand and a card was drawn.
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("Ichor Elixir and Susan Foreman: their replacements never apply, the rest of each card works", () => {
    const e = compileCard(elixir());
    expect(e.statics).toHaveLength(0);
    expect(e.mana).toHaveLength(1);
    const f = compileCard(susan());
    expect(f.statics).toHaveLength(0);
    expect(f.mana).toHaveLength(1);
  });
});

describe("Frenetic Sliver", () => {
  it("each Sliver has the {0} ability; won, it's exiled and returns at the beginning of the next end step", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, frenetic());
    const other = putOnBattlefield(s0, ap, sliver());
    const card0 = s0.objects[other]!.cardId;
    let s = run(s0, planActivate(s0, ap, other, 0));
    rig(s, true);
    s = settle(s);
    expect(s.objects[other]!.zone).toBe("exile");
    s = passUntil(s, "end", ap);
    s = settle(s);
    const back = s.battlefield.filter((id) => s.objects[id]!.cardId === card0);
    expect(back).toHaveLength(1);
    expect(s.objects[back[0]!]!.controller).toBe(ap);
  });

  it("lost, it's sacrificed", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, frenetic());
    let s = run(s0, planActivate(s0, ap, f, 0));
    rig(s, false);
    s = settle(s);
    expect(s.objects[f]!.zone).toBe("graveyard");
  });

  it("activated again in response, only one coin is flipped for it (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, frenetic());
    let s = run(s0, planActivate(s0, ap, f, 0));
    s = run(s, planActivate(s, ap, f, 0));
    expect(s.stack).toHaveLength(2);
    rig(s, false, false);
    s = settle(s);
    expect(s.objects[f]!.zone).toBe("graveyard");
    expect(s.log.filter((l) => /flips a coin/.test(l.text))).toHaveLength(1);
  });

  it("a non-Sliver doesn't get it", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, frenetic());
    const b = putOnBattlefield(s, ap, bear());
    expect(planActivate(s, ap, b, 0)).toBeNull();
  });
});

const raise = (what: string) => card(`Raise ${what}`, "Sorcery", "{0}", { oracleText: `Return target ${what} card from your graveyard to your hand.` });
const wrath = card("Test Wrath", "Sorcery", "{0}", { oracleText: "Destroy all creatures." });
const shock = card("Test Shock", "Instant", "{0}", { oracleText: "Test Shock deals 2 damage to any target." });

describe("Syrix, Carrier of the Flame", () => {
  const withYard = (spell: CardDef, inYard: CardDef) => {
    const { s, ap, ids, opp } = setup([spell]);
    putOnBattlefield(s, ap, syrix());
    const ph = putOnBattlefield(s, ap, phoenix("Big Phoenix", "4"));
    const dead = putOnBattlefield(s, ap, inYard);
    moveObject(s, dead, "graveyard");
    return { s, ap, opp, ph, dead, spell: ids[0]! };
  };
  it("at each end step, if a creature card left your graveyard this turn, target Phoenix you control deals damage equal to its power to any target", () => {
    supported(raise("creature"), raise("land"), wrath, shock);
    const { s: s0, ap, opp, ph, dead, spell } = withYard(raise("creature"), bear());
    let s = cast(s0, ap, spell, [{ kind: "object", id: dead }]);
    expect(s.objects[dead]!.zone).toBe("hand");
    s = passUntil(s, "end", ap);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const life = s.players[opp]!.life;
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: ph }, { kind: "player", id: opp }] }));
    expect(s.players[opp]!.life).toBe(life - 4);
  });

  it("a land card leaving your graveyard doesn't count, nor does nothing leaving", () => {
    const { s: s0, ap, dead, spell } = withYard(raise("land"), card("Test Land", "Land"));
    let s = cast(s0, ap, spell, [{ kind: "object", id: dead }]);
    expect(s.objects[dead]!.zone).toBe("hand");
    expect(s.turnLog?.leftGraveyard).toContain(ap);
    s = passUntil(s, "end", ap);
    expect(s.pending).toBeNull();
    expect(s.stack).toHaveLength(0);
  });

  it("whenever another Phoenix you control dies, you may cast it from your graveyard, paying its costs", () => {
    const { s: s0, ap, ph } = withYard(shock, bear());
    const sy = s0.battlefield.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Syrix, Carrier of the Flame")!;
    moveObject(s0, sy, "graveyard");
    s0.objects[ph]!.damage = 2;
    let s = cast(s0, ap, s0.players[ap]!.hand[0]!, [{ kind: "object", id: ph }]);
    s = settle(s);
    expect(s.objects[ph]!.zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: sy, how: "paid" });
    s = settle(run(s, planCast(s, ap, sy)));
    expect(s.objects[sy]!.zone).toBe("battlefield");
  });

  it("not if it dies at the same time as the other Phoenix (rulings)", () => {
    const { s: s0, ap, spell } = withYard(wrath, bear());
    const sy = s0.battlefield.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Syrix, Carrier of the Flame")!;
    let s = cast(s0, ap, spell);
    s = settle(s);
    expect(s.objects[sy]!.zone).toBe("graveyard");
    expect(s.pending).toBeNull();
  });
});

describe("Pako, Arcane Retriever", () => {
  it("attacking, it exiles the top card of each player's library with a fetch counter, and gets a +1/+1 counter for each noncreature card", () => {
    const { s: s0, ap, opp } = setup([]);
    const pk = putOnBattlefield(s0, ap, pako());
    const tops: string[] = [];
    const order = [ap, ...s0.turnOrder.filter((p) => p !== ap)];
    const kinds = [card("Top Sorcery", "Sorcery", "{1}"), bear({ name: "Top Bear" }), card("Top Land", "Land"), card("Top Artifact", "Artifact", "{1}")];
    order.forEach((p, i) => {
      const id = putOnBattlefield(s0, p, kinds[i]!);
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "library";
      s0.players[p]!.library.unshift(id);
      tops.push(id);
    });
    let s = attack(s0, ap, pk, opp);
    for (const id of tops) {
      expect(s.objects[id]!.zone).toBe("exile");
      expect(s.objects[id]!.counters.fetch).toBe(1);
    }
    // The sorcery, the land and the artifact are noncreature cards.
    expect(s.objects[pk]!.counters["+1/+1"]).toBe(3);
  });
});

describe("Vessel of the All-Consuming", () => {
  const vessel = (s: GameState, ap: PlayerId) => {
    const v = putOnBattlefield(s, ap, hidetsugu());
    s.objects[v]!.face = 1;
    s.objects[v]!.counters = {};
    return v;
  };
  it("whenever it deals damage to a player, if it has dealt 10 or more to that player this turn, they lose", () => {
    const { s: s0, ap, opp } = setup([]);
    const v = vessel(s0, ap);
    s0.objects[v]!.counters["+1/+1"] = 7;
    let s = attack(s0, ap, v, opp);
    s = settle(s);
    expect(s.players[opp]!.lost).toBe(true);
  });

  it("less than 10: no loss but its +1/+1 counter; the damage this object dealt that player earlier this turn counts, not another object's", () => {
    for (const earlier of ["none", "same", "oldObject", "otherPlayer"] as const) {
      const { s: s0, ap, opp } = setup([]);
      const v = vessel(s0, ap);
      s0.objects[v]!.counters["+1/+1"] = 6;
      const zc = s0.objects[v]!.zoneChanges ?? 0;
      const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
      if (earlier !== "none") s0.turnLog = { ...(s0.turnLog ?? {}), sourceToPlayer: { [`${v}@${earlier === "oldObject" ? zc - 1 : zc}`]: { [earlier === "otherPlayer" ? other : opp]: 3 } } };
      let s = attack(s0, ap, v, opp);
      s = settle(s);
      expect(s.players[opp]!.lost ?? false, earlier).toBe(earlier === "same");
      expect(s.objects[v]!.counters["+1/+1"], earlier).toBe(7);
      expect(s.turnLog?.sourceToPlayer?.[`${v}@${zc}`]?.[opp]).toBe(earlier === "same" ? 12 : 9);
    }
  });
});

describe("Black Widow, Super Spy", () => {
  const hit = () => {
    const { s: s0, ap, opp } = setup([]);
    const w = putOnBattlefield(s0, ap, widow());
    const land = card("Their Land", "Land");
    const spell = card("Their Spell", "Sorcery", "{3}{U}", { colors: ["U"], oracleText: "Draw a card." });
    const ids = [land, spell].map((c) => {
      const id = putOnBattlefield(s0, opp, c);
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "library";
      return id;
    });
    s0.players[opp]!.library.unshift(...ids);
    let s = attack(s0, ap, w, opp);
    return { s, ap, opp, w, land: ids[0]!, spell: ids[1]! };
  };
  it("that player exiles until a nonland card; with the counter, no cast", () => {
    let { s, ap, w, land, spell } = hit();
    expect(s.objects[land]!.zone).toBe("exile");
    expect(s.objects[spell]!.zone).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[w]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[spell]!.mayPlay).toBeUndefined();
  });

  it("without it, you may cast the exiled card this turn with mana of any type", () => {
    let { s, ap, w, spell } = hit();
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[w]!.counters["+1/+1"]).toBeUndefined();
    expect(s.objects[spell]!.mayPlay).toMatchObject({ player: ap, until: "thisTurn", anyType: true });
    s = passUntil(s, "main2", ap);
    // {3}{U} paid with no Island needed: mana of any type.
    s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.name === "Island").forEach((id) => (s.objects[id]!.tapped = true));
    s = settle(run(s, planCast(s, ap, spell)));
    expect(s.objects[spell]!.zone).toBe("graveyard");
  });
});

describe("Binding Negotiation", () => {
  it("a nonland card chosen from the revealed hand is discarded, and nothing is put from exile", () => {
    const { s: s0, ap, opp, ids } = setup([binding()]);
    const theirs = putOnBattlefield(s0, opp, card("Their Spell", "Sorcery", "{1}"));
    s0.battlefield.splice(s0.battlefield.indexOf(theirs), 1);
    s0.objects[theirs]!.zone = "hand";
    s0.players[opp]!.hand.push(theirs);
    const ex = putOnBattlefield(s0, opp, card("Exiled Thing", "Artifact", "{1}"));
    moveObject(s0, ex, "exile");
    let s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 1 });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [theirs] }));
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.pending).toBeNull();
    expect(s.objects[ex]!.zone).toBe("exile");
  });

  it("otherwise, you may put a face-up exiled card they own into their graveyard; not a face-down one or another player's", () => {
    const { s: s0, ap, opp, ids } = setup([binding()]);
    const ex = putOnBattlefield(s0, opp, card("Exiled Thing", "Artifact", "{1}"));
    moveObject(s0, ex, "exile");
    const hidden = putOnBattlefield(s0, opp, card("Hidden Thing", "Artifact", "{1}"));
    moveObject(s0, hidden, "exile");
    s0.objects[hidden]!.hiddenExile = { by: "test", seen: [] } as never;
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const notTheirs = putOnBattlefield(s0, other, card("Other Thing", "Artifact", "{1}"));
    moveObject(s0, notTheirs, "exile");
    let s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    // Their hand has no nonland card (only Forests and bears? none here): straight to the exile choice.
    for (let i = 0; i < 3 && s.pending?.kind === "searchLibrary" && !(s.pending.cards ?? []).includes(ex); i++) s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 1, exiled: true, cards: [ex] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ex] }));
    expect(s.objects[ex]!.zone).toBe("graveyard");
    expect(s.objects[ex]!.owner).toBe(opp);
  });
});
