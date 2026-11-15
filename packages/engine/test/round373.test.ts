// Round 373 (Lane A): a copy of a legendary or Rat card from your graveyard cast as an attack trigger resolves (Nashi,
// Moon's Legacy), an opponent milling one card at a time until a creature card or X cards (Helm of Obedience) and mana
// for a chosen player in the color they choose (Spectral Searchlight), and creatures each opponent chooses, tapped and
// goaded (Fell Beast's Shriek).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions are answered as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const moveTo = (zone: "graveyard" | "hand" | "library" | "exile") => (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  return id;
};
const toYard = moveTo("graveyard");
/** Puts these cards on top of `pid`'s library, the first on top. */
const stack = <T extends CardDef[]>(s: GameState, pid: PlayerId, defs: [...T]): { [K in keyof T]: ObjectId } => {
  const ids = defs.map((d) => moveTo("library")(s, pid, d));
  const lib = s.players[pid]!.library;
  lib.splice(0, ids.length);
  lib.unshift(...ids);
  return ids as { [K in keyof T]: ObjectId };
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]?.zone;
const player = (id: PlayerId) => ({ kind: "player" as const, id });

const vermin = card("Test Vermin", "Creature — Rat", "{1}{B}", { cmc: 2, power: "2", toughness: "1", colors: ["B"] });
const relic = card("Test Relic", "Legendary Artifact", "{1}", { cmc: 1, oracleText: "{T}: Add {C}." });
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { cmc: 3, power: "3", toughness: "3", colors: ["R"] });
const bear2 = card("Test Bear", "Creature — Bear", "{1}{G}", { cmc: 2, power: "2", toughness: "2", colors: ["G"] });
const rock = card("Test Rock", "Artifact", "{1}", { cmc: 1 });
const hill = card("Test Hill", "Land");

// Real oracle text (Scryfall).
const nashi = (): CardDef => ({"oracleId":"ffa6c14e-3d8e-47a2-b102-d37538d60ef6","name":"Nashi, Moon's Legacy","manaCost":"{B}{G}{U}","cmc":3,"typeLine":"Legendary Creature — Rat Shaman","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Rat","Shaman"],"oracleText":"Menace, ward {1}\nWhenever Nashi attacks, exile up to one target legendary or Rat card from your graveyard and copy it. You may cast the copy. (You still pay its costs. A copy of a permanent spell becomes a token.)","power":"3","toughness":"4","colors":["B","G","U"],"colorIdentity":["B","G","U"],"keywords":["Menace","Ward"],"commanderLegal":"legal","set":"mat","releasedAt":"2023-05-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const helm = (): CardDef => ({"oracleId":"16cadebf-c484-41f8-9e38-5c2c528f5b54","name":"Helm of Obedience","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{X}, {T}: Target opponent mills a card, then repeats this process until a creature card or X cards have been put into their graveyard this way, whichever comes first. If one or more creature cards were put into that graveyard this way, sacrifice this artifact and put one of them onto the battlefield under your control. X can't be 0.","colors":[],"colorIdentity":[],"keywords":["Mill"],"commanderLegal":"legal","set":"all","releasedAt":"1996-06-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const searchlight = (): CardDef => ({"oracleId":"511b1174-8ef7-4d17-93de-01b9b81bda6a","name":"Spectral Searchlight","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Choose a player. That player adds one mana of any color they choose.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["B","G","R","U","W"],"commanderLegal":"legal","set":"rav","releasedAt":"2005-10-07","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const shriek = (): CardDef => ({"oracleId":"d660f6a0-3642-4445-b877-fda2a2950680","name":"Fell Beast's Shriek","manaCost":"{U}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each opponent chooses a creature they control. Tap and goad the chosen creatures. (Until your next turn, those creatures attack each combat if able and attack a player other than you if able.)\nSplice onto instant or sorcery {2}{U}{R} (As you cast an instant or sorcery spell, you may reveal this card from your hand and pay its splice cost. If you do, add this card's effects to that spell.)","colors":["R","U"],"colorIdentity":["R","U"],"keywords":["Goad","Splice"],"commanderLegal":"legal","set":"ltc","releasedAt":"2023-11-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const leyline = (): CardDef => ({"oracleId":"f4e32fc1-1b8d-441e-8e76-71f19f98e925","name":"Leyline of the Void","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If this card is in your opening hand, you may begin the game with it on the battlefield.\nIf a card would be put into an opponent's graveyard from anywhere, exile it instead.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

describe("round 373: compiles", () => {
  it("every card of the round", () => supported(nashi(), helm(), searchlight(), shriek()));
});

/** `ap` attacks the first opponent with `attacker`, then passes until a question of `ap`'s or combat damage. */
const attack = (s: GameState, ap: PlayerId, attacker: ObjectId, defender: PlayerId) => {
  s = passUntil(s, "declareAttackers", ap);
  if (s.pending?.kind !== "declareAttackers") throw new Error("no attack");
  s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender }] });
  for (let i = 0; i < 80 && !(s.pending && s.pending.player === ap) && s.step !== "combatDamage"; i++) {
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    else if (s.pending) for (const a of botActions(s, s.pending.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

describe("Nashi, Moon's Legacy", () => {
  const begin = () => {
    const { s: s0, ap, opp } = setup([]);
    s0.players[ap]!.hand = [];
    const n = putOnBattlefield(s0, ap, nashi());
    return { s0, ap, opp, n };
  };

  it("exiles a Rat card from your graveyard as it attacks and casts the copy, paying its cost: a token Rat", () => {
    const { s0, ap, opp, n } = begin();
    const v = toYard(s0, ap, vermin);
    s0.players[ap]!.manaPool = { W: 0, U: 0, B: 1, R: 0, G: 1, C: 0 };
    let s = attack(s0, ap, n, opp);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: v }] }), ap);
    expect(zone(s, v)).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", options: [v, "none"] });
    s = act(s, { type: "chooseOption", player: ap, choice: v });
    expect(s.pending).toMatchObject({ kind: "castFree", how: "paid" });
    const copy = s.pending?.kind === "castFree" ? s.pending.objectId : "";
    expect(copy).not.toBe(v);
    s = settle(run(s, planCast(s, ap, copy, [])), ap);
    // A copy of a permanent spell becomes a token (CR 707.12, 111.12).
    expect(s.objects[copy]?.zone).toBe("battlefield");
    expect(s.objects[copy]?.isToken).toBe(true);
    expect(zone(s, v)).toBe("exile");
  });

  it("a legendary card that isn't a Rat can be the target; a nonlegendary non-Rat can't", () => {
    const { s0, ap, opp, n } = begin();
    const r = toYard(s0, ap, relic);
    const o = toYard(s0, ap, ogre);
    let s = attack(s0, ap, n, opp);
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: o }] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: r }] }), ap);
    expect(zone(s, r)).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong" });
    // Declining: the copy is never made, the card stays exiled.
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }), ap);
    expect(s.pending).toBeFalsy();
    expect(zone(s, r)).toBe("exile");
    expect(zone(s, o)).toBe("graveyard");
  });
});

describe("Helm of Obedience", () => {
  const begin = () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, helm());
    return { s0, ap, opp, h };
  };

  it("mills one card at a time until a creature card: Helm is sacrificed and the creature enters under your control", () => {
    const { s0, ap, opp, h } = begin();
    const [a, b, c, d] = stack(s0, opp, [rock, hill, ogre, bear2]);
    s0.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 5 };
    let s = run(s0, planActivate(s0, ap, h, 0, [player(opp)], undefined, undefined, 5));
    s = settle(s, ap);
    // You choose "one of them", the one creature card put there.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromGraveyard: "battlefield", cards: [c] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [c] }), ap);
    expect(zone(s, a)).toBe("graveyard");
    expect(zone(s, b)).toBe("graveyard");
    expect(zone(s, c)).toBe("battlefield");
    expect(s.objects[c]!.controller).toBe(ap);
    expect(zone(s, d)).toBe("library");
    expect(zone(s, h)).toBe("graveyard");
  });

  it("stops after X cards with no creature card: Helm stays", () => {
    const { s0, ap, opp, h } = begin();
    const [a, b, c] = stack(s0, opp, [rock, hill, ogre]);
    s0.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 };
    const s = settle(run(s0, planActivate(s0, ap, h, 0, [player(opp)], undefined, undefined, 2)), ap);
    expect(s.pending).toBeFalsy();
    expect(zone(s, a)).toBe("graveyard");
    expect(zone(s, b)).toBe("graveyard");
    expect(zone(s, c)).toBe("library");
    expect(zone(s, h)).toBe("battlefield");
  });

  it("X can't be 0", () => {
    const { s0, ap, opp, h } = begin();
    expect(planActivate(s0, ap, h, 0, [player(opp)], undefined, undefined, 0)).toBeNull();
  });

  it("with Leyline of the Void nothing is put into that graveyard, so the whole library is exiled (rulings)", () => {
    const { s0, ap, opp, h } = begin();
    putOnBattlefield(s0, ap, leyline());
    const lib = s0.players[opp]!.library.length;
    s0.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 };
    const s = settle(run(s0, planActivate(s0, ap, h, 0, [player(opp)], undefined, undefined, 1)), ap);
    expect(lib).toBeGreaterThan(1);
    expect(s.players[opp]!.library.length).toBe(0);
    expect(s.players[opp]!.graveyard.length).toBe(0);
    expect(zone(s, h)).toBe("battlefield");
  });
});

describe("Spectral Searchlight", () => {
  const begin = () => {
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, searchlight());
    s0.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    s0.players[opp]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    return { s0, ap, opp, l };
  };

  it("you may choose yourself (rulings): one mana of the color you choose", () => {
    const { s0, ap, l } = begin();
    const s = act(s0, { type: "activateMana", player: ap, objectId: l, mana: "G", ability: 0 });
    expect(s.pending).toBeFalsy();
    expect(s.players[ap]!.manaPool.G).toBe(1);
    expect(s.objects[l]!.tapped).toBe(true);
  });

  it("another player chooses the color of the mana they add", () => {
    const { s0, ap, opp, l } = begin();
    let s = act(s0, { type: "activateMana", player: ap, objectId: l, mana: "W", ability: 0, to: opp });
    expect(s.objects[l]!.tapped).toBe(true);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "manaColorFor", options: ["White", "Blue", "Black", "Red", "Green"] });
    // Not the activator's to choose.
    expect(() => act(s, { type: "chooseOption", player: ap, choice: "Blue" })).toThrow();
    s = act(s, { type: "chooseOption", player: opp, choice: "Blue" });
    expect(s.pending).toBeFalsy();
    expect(s.players[opp]!.manaPool.U).toBe(1);
    expect(s.players[opp]!.manaPool.W).toBe(0);
    expect(Object.values(s.players[ap]!.manaPool).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("a bot chooses a color for itself", () => {
    const { s0, ap, opp, l } = begin();
    let s = act(s0, { type: "activateMana", player: ap, objectId: l, mana: "W", ability: 0, to: opp });
    for (const a of botActions(s, opp)) s = act(s, a);
    expect(s.pending).toBeFalsy();
    expect(Object.values(s.players[opp]!.manaPool).reduce((a, b) => a + b, 0)).toBe(1);
  });
});

describe("Fell Beast's Shriek", () => {
  const opponentsOf = (s: GameState, ap: PlayerId) => s.turnOrder.filter((p) => p !== ap);
  const zap = card("Test Zap", "Instant", "{R}", { cmc: 1, oracleText: "Test Zap deals 1 damage to any target.", colors: ["R"] });

  it("each opponent chooses a creature they control (not a target): each chosen one is tapped and goaded by you", () => {
    const { s: s0, ap, ids } = setup([shriek()]);
    const opps = opponentsOf(s0, ap);
    const mine = opps.map((p) => [putOnBattlefield(s0, p, bear2), putOnBattlefield(s0, p, ogre)]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [])));
    expect(s.pending).toBeFalsy();
    for (const pair of mine) {
      const chosen = pair.filter((id) => s.objects[id]!.tapped);
      expect(chosen.length).toBe(1);
      expect(characteristics(s, s.objects[chosen[0]!]!).goadedBy).toEqual([ap]);
      const other = pair.find((id) => !chosen.includes(id))!;
      expect(characteristics(s, s.objects[other]!).goadedBy ?? []).toEqual([]);
    }
  });

  it("spliced onto an instant: the instant's effect, then each opponent's creature tapped and goaded", () => {
    const { s: s0, ap, ids, opp } = setup([zap, shriek()]);
    const b = putOnBattlefield(s0, opp, bear2);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, undefined, undefined, { splice: [ids[1]!] })));
    expect(s.players[opp]!.life).toBe(39);
    expect(s.objects[b]!.tapped).toBe(true);
    expect(characteristics(s, s.objects[b]!).goadedBy).toEqual([ap]);
    // The spliced card stays in your hand (rulings).
    expect(s.objects[ids[1]!]!.zone).toBe("hand");
  });
});
