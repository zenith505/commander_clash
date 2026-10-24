// Round 152: the most played cards, in popularity order, starting with Secret Arcade.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, plains, pt, putOnBattlefield, scry, setup } from "./helpers";
import { abilitiesOf, botActions, characteristics, defOf, invalidateCharacteristics, isFullySupported, objHasKeyword, objIsType, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type Step, type TargetChoice } from "../src";
import { moveObject } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; "you may" questions get `yes`. Stops at any other question. */
const resolveAll = (s: GameState, yes = true) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending?.kind === "chooseMay"); i++) {
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes });
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes (resolving everything on the way, "you may" answered `yes`) until `step` of `active`'s turn. */
const advance = (s: GameState, step: Step, active: PlayerId, yes = true) => {
  for (let i = 0; i < 3000; i++) {
    if (s.step === step && s.activePlayer === active && !s.stack.length && !s.triggerQueue.length && !s.pending) return s;
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes });
    else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: waitingOn(s)!, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: waitingOn(s)!, blocks: [] });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error(`never reached ${step}`);
};
/** A card put straight into a zone, not from the battlefield. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const obj = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const nameOf = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
/** On the battlefield with that name (a token's has " Token" after it). */
const named = (s: GameState, name: string) => s.battlefield.filter((id) => [name, `${name} Token`].includes(nameOf(s, id)));

const REMINDER = "\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)";
// Real oracle text (Scryfall).
const arcade = scry("split", [
  { name: "Secret Arcade", mana_cost: "{4}{W}", type_line: "Enchantment — Room", oracle_text: `Nonland permanents you control and permanent spells you control are enchantments in addition to their other types.${REMINDER}` },
  { name: "Dusty Parlor", mana_cost: "{2}{W}", type_line: "Enchantment — Room", oracle_text: `Whenever you cast an enchantment spell, put a number of +1/+1 counters equal to that spell's mana value on up to one target creature.${REMINDER}` },
]);
const siphon = card("Siphon Insight", "Instant", "{U}{B}", { cmc: 2, keywords: ["Flashback"], oracleText: "Look at the top two cards of target opponent's library. Exile one of them face down and put the other on the bottom of that library. You may play the exiled card for as long as it remains exiled, and you may spend mana as though it were mana of any color to cast that spell.\nFlashback {1}{U}{B}" });
const module = card("Animation Module", "Artifact", "{1}", { cmc: 1, oracleText: "Whenever one or more +1/+1 counters are put on a permanent you control, you may pay {1}. If you do, create a 1/1 colorless Servo artifact creature token.\n{3}, {T}: Choose a counter on target permanent or player. Give that permanent or player another counter of that kind." });
const luxior = card("Luxior, Giada's Gift", "Legendary Artifact — Equipment", "{1}", { cmc: 1, keywords: ["Equip"], oracleText: "Equipped creature gets +1/+1 for each counter on it.\nEquipped permanent isn't a planeswalker and is a creature in addition to its other types. (Loyalty abilities can still be activated.)\nEquip planeswalker {1}\nEquip {3}" });
const tato = card("Tato Farmer", "Creature — Zombie Mutant Peasant", "{2}{G}", { power: "1", toughness: "4", cmc: 3, keywords: ["Landfall"], oracleText: "Landfall — Whenever a land you control enters, you may get two rad counters.\n{T}: Put target land card in a graveyard that was milled this turn onto the battlefield tapped under your control." });
const flow = card("Flow State", "Sorcery", "{1}{U}", { cmc: 2, oracleText: "Look at the top three cards of your library. Put one of them into your hand and the rest on the bottom of your library in any order. If there is an instant card and a sorcery card in your graveyard, instead put two of them into your hand and the rest on the bottom of your library in any order." });
const captain = card("Captain N'ghathrod", "Legendary Creature — Horror Pirate", "{3}{U}{B}", { power: "3", toughness: "6", cmc: 5, keywords: ["Mill"], oracleText: "Horrors you control have menace.\nWhenever a Horror you control deals combat damage to a player, that player mills that many cards.\nAt the beginning of your end step, choose target artifact or creature card in an opponent's graveyard that was put there from their library this turn. Put it onto the battlefield under your control." });
const predators = card("Predators' Hour", "Sorcery", "{1}{B}", { cmc: 2, oracleText: 'Until end of turn, creatures you control gain menace and "Whenever this creature deals combat damage to a player, exile the top card of that player\'s library face down. You may look at and play that card for as long as it remains exiled, and you may spend mana as though it were mana of any color to cast that spell."' });

const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3", cmc: 3 });
const giant = card("Test Giant", "Creature — Giant", "{3}{R}{R}", { power: "5", toughness: "5", cmc: 5 });
const rock = card("Test Rock", "Artifact", "{2}", { cmc: 2, oracleText: "{T}: Add {C}." });
const shock = card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "Test Shock deals 2 damage to any target." });
const ponder = card("Test Ponder", "Sorcery", "{U}", { cmc: 1, oracleText: "Draw a card." });
const mill = card("Test Mill", "Sorcery", "{U}", { cmc: 1, oracleText: "Target player mills three cards." });
const grow = card("Test Grow", "Instant", "{G}", { cmc: 1, oracleText: "Put a +1/+1 counter on target creature." });
const walker = card("Test Walker", "Legendary Planeswalker — Jace", "{2}{U}", { cmc: 3, loyalty: "3", oracleText: "+1: Draw a card.\n−2: Draw two cards." });
const forest = card("Forest", "Basic Land — Forest");
const wasteland = card("Test Wasteland", "Land", "", { oracleText: "{T}: Add {C}." });

describe("round 152 cards compile", () => {
  it("are fully supported", () => supported(arcade, siphon, module, luxior, tato, flow, captain, predators));
});

describe("Flow State: one card, or two with an instant card and a sorcery card in your graveyard", () => {
  const look = (yard: CardDef[]) => {
    const { s: s0, ap, ids } = setup([flow]);
    for (const d of yard) into(s0, ap, d, "graveyard");
    const top = [ogre, giant, rock].map((d) => into(s0, ap, d, "library")).reverse();
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 10 && s.pending?.kind !== "searchLibrary"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, ap, top };
  };

  it("without both: one of the three into the hand, the other two on the bottom", () => {
    const { s: s0, ap, top } = look([ponder]);
    expect(s0.pending).toMatchObject({ kind: "searchLibrary", min: 1, max: 1 });
    expect((s0.pending as { cards: string[] }).cards).toEqual(top);
    let s = act(s0, { type: "searchLibrary", player: ap, found: [top[1]!] });
    // The owner orders the two for the bottom (CR 401.4).
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "bottom", player: ap });
    s = resolveAll(act(s, { type: "arrangeTop", player: ap, top: [top[2]!, top[0]!], away: [] }));
    expect(s.objects[top[1]!]!.zone).toBe("hand");
    expect(s.players[ap]!.library.slice(-2).sort()).toEqual([top[0]!, top[2]!].sort());
  });

  it("with an instant card and a sorcery card there: two of them", () => {
    const { s: s0, ap, top } = look([ponder, shock]);
    expect(s0.pending).toMatchObject({ kind: "searchLibrary", min: 2, max: 2 });
    const s = resolveAll(act(s0, { type: "searchLibrary", player: ap, found: [top[0]!, top[2]!] }));
    expect([top[0]!, top[2]!].map((id) => s.objects[id]!.zone)).toEqual(["hand", "hand"]);
    expect(s.players[ap]!.library.at(-1)).toBe(top[1]);
  });

  it("two instant cards aren't an instant card and a sorcery card", () => {
    const { s } = look([shock, shock]);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", max: 1 });
  });
});

describe("Siphon Insight: one of the top two of an opponent's library exiled face down, the other on the bottom", () => {
  it("the chosen card is exiled face down, playable with mana of any color; the other goes to the bottom", () => {
    const { s: s0, ap, opp, ids } = setup([siphon]);
    const [o, g] = [ogre, giant].map((d) => into(s0, opp, d, "library")).reverse();
    let s = run(s0, planCast(s0, ap, ids[0]!, [player(opp)]));
    for (let i = 0; i < 10 && s.pending?.kind !== "searchLibrary"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 1, max: 1, cards: [o, g] });
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [g!] }));
    expect(s.objects[g!]!.zone).toBe("exile");
    expect(s.objects[g!]!.hiddenExile?.seen).toEqual([ap]);
    expect(s.objects[g!]!.mayPlay).toMatchObject({ player: ap, until: "exiled", anyType: true });
    expect(s.players[opp]!.library.at(-1)).toBe(o);
    // Nobody but the caster learns which card went where (rulings): the log names neither.
    expect(s.log.filter((l) => l.to === undefined).some((l) => l.text.includes("Test Giant") || l.text.includes("Test Ogre"))).toBe(false);
    // {3}{R}{R} paid with any mana: blue and black do.
    for (const id of s.battlefield.filter((x) => ["Mountain"].includes(nameOf(s, x)))) moveObject(s, id, "graveyard");
    invalidateCharacteristics(s);
    s = run(s, planCast(s, ap, g!));
    expect(s.stack.at(-1)?.objectId).toBe(g);
    s = resolveAll(s);
    expect(s.objects[g!]!.zone).toBe("battlefield");
    expect(s.objects[g!]!.controller).toBe(ap);
  });

  it("with one card left in that library, that card is exiled", () => {
    const { s: s0, ap, opp, ids } = setup([siphon]);
    s0.players[opp]!.library = [];
    const o = into(s0, opp, ogre, "library");
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [player(opp)])));
    expect(s.pending).toBeNull();
    expect(s.objects[o]!.zone).toBe("exile");
  });
});

describe("Animation Module", () => {
  it("+1/+1 counters put on a permanent you control: pay {1} for a Servo", () => {
    const { s: s0, ap, ids } = setup([grow]);
    putOnBattlefield(s0, ap, module);
    const b = putOnBattlefield(s0, ap, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [obj(b)]));
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = resolveAll(run(s, botActions(s, ap)));
    expect(named(s, "Servo")).toHaveLength(1);
  });

  it("not for counters on an opponent's creature", () => {
    const { s: s0, ap, opp, ids } = setup([grow]);
    putOnBattlefield(s0, ap, module);
    const b = putOnBattlefield(s0, opp, bear());
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(b)])));
    expect(s.triggerQueue).toHaveLength(0);
    expect(named(s, "Servo")).toHaveLength(0);
  });

  it("{3}, {T}: another counter of a kind already on the target permanent", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, module);
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[b]!.counters = { "+1/+1": 2 };
    let s = run(s0, planActivate(s0, ap, m, 0, [obj(b)]));
    s = resolveAll(s, false);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(3);
  });

  it("a player's counters: the kind is chosen when they have two kinds", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, module);
    Object.assign(s0.players.find((p) => p.id === opp)!, { poison: 3, rad: 1 });
    let s = run(s0, planActivate(s0, ap, m, 0, [player(opp)]));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseOption"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "counterKind", options: ["poison", "rad"] });
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: "poison" }));
    expect(s.players.find((p) => p.id === opp)!.poison).toBe(4);
    expect(s.players.find((p) => p.id === opp)!.rad).toBe(1);
  });
});

describe("Luxior, Giada's Gift", () => {
  it("equip planeswalker: it's a creature and not a planeswalker, a 0/0 with +1/+1 for each counter; loyalty abilities still work", () => {
    const { s: s0, ap } = setup([]);
    const l = putOnBattlefield(s0, ap, luxior);
    const w = putOnBattlefield(s0, ap, walker);
    s0.objects[w]!.counters = { loyalty: 3 };
    let s = resolveAll(run(s0, planActivate(s0, ap, l, 0, [obj(w)])));
    expect(s.objects[l]!.attachedTo).toBe(w);
    expect(objIsType(s, s.objects[w]!, "Creature")).toBe(true);
    expect(objIsType(s, s.objects[w]!, "Planeswalker")).toBe(false);
    // Its planeswalker subtype goes with the type (CR 205.3d).
    expect(characteristics(s, s.objects[w]!).subtypes).toEqual([]);
    expect(pt(s, w)).toBe("3/3");
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planActivate(s, ap, w, 0)));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(pt(s, w)).toBe("4/4");
    // Damage is marked on it like any creature's; its loyalty stays.
    s.objects[w]!.damage = 2;
    expect(s.objects[w]!.counters.loyalty).toBe(4);
  });

  it("equip planeswalker can't target a creature, and plain equip can't target a planeswalker", () => {
    const { s: s0, ap } = setup([]);
    const l = putOnBattlefield(s0, ap, luxior);
    const w = putOnBattlefield(s0, ap, walker);
    const b = putOnBattlefield(s0, ap, bear());
    expect(planActivate(s0, ap, l, 0, [obj(b)])).toBeNull();
    expect(planActivate(s0, ap, l, 1, [obj(w)])).toBeNull();
    const s = resolveAll(run(s0, planActivate(s0, ap, l, 1, [obj(b)])));
    expect(s.objects[l]!.attachedTo).toBe(b);
    expect(pt(s, b)).toBe("2/2");
  });

  it("moved off, it's a planeswalker again", () => {
    const { s: s0, ap } = setup([]);
    const l = putOnBattlefield(s0, ap, luxior);
    const w = putOnBattlefield(s0, ap, walker);
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[w]!.counters = { loyalty: 3 };
    let s = resolveAll(run(s0, planActivate(s0, ap, l, 0, [obj(w)])));
    s = resolveAll(run(s, planActivate(s, ap, l, 1, [obj(b)])));
    expect(s.objects[l]!.attachedTo).toBe(b);
    expect(objIsType(s, s.objects[w]!, "Planeswalker")).toBe(true);
    expect(objIsType(s, s.objects[w]!, "Creature")).toBe(false);
    expect(s.objects[w]!.zone).toBe("battlefield");
  });

  it("bots don't equip their planeswalkers", () => {
    const { s: s0, ap } = setup([]);
    const l = putOnBattlefield(s0, ap, luxior);
    putOnBattlefield(s0, ap, walker);
    const acts = botActions(s0, ap);
    expect(acts.some((a) => a.type === "activateAbility" && a.objectId === l)).toBe(false);
  });
});

describe("Tato Farmer", () => {
  it("landfall: you may get two rad counters", () => {
    const { s: s0, ap, ids } = setup([forest]);
    putOnBattlefield(s0, ap, tato);
    let s = act(s0, { type: "playLand", player: ap, objectId: ids[0]! });
    s = resolveAll(s);
    expect(s.players.find((p) => p.id === ap)!.rad).toBe(2);
  });

  it("{T}: a land card milled this turn onto the battlefield tapped under your control; not one put there otherwise", () => {
    const { s: s0, ap, opp, ids } = setup([mill]);
    const t = putOnBattlefield(s0, ap, tato);
    s0.players[opp]!.library = [];
    const lands = [wasteland, ogre, wasteland].map((d) => into(s0, opp, d, "library"));
    const discarded = into(s0, opp, wasteland, "graveyard");
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [player(opp)])));
    expect(lands.map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "graveyard"]);
    expect(planActivate(s, ap, t, 0, [obj(discarded)])).toBeNull();
    expect(planActivate(s, ap, t, 0, [obj(lands[1]!)])).toBeNull();
    s = resolveAll(run(s, planActivate(s, ap, t, 0, [obj(lands[0]!)])));
    expect(s.objects[lands[0]!]!.zone).toBe("battlefield");
    expect(s.objects[lands[0]!]!.controller).toBe(ap);
    expect(s.objects[lands[0]!]!.tapped).toBe(true);
  });

  it("next turn, last turn's milled lands aren't milled this turn", () => {
    const { s: s0, ap, opp, ids } = setup([mill]);
    const t = putOnBattlefield(s0, ap, tato);
    s0.players[opp]!.library = [];
    const lands = [wasteland, wasteland, wasteland].map((d) => into(s0, opp, d, "library"));
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [player(opp)])));
    s = advance(s, "upkeep", opp);
    expect(planActivate(s, ap, t, 0, [obj(lands[0]!)])).toBeNull();
  });
});

describe("Captain N'ghathrod: at your end step, an opponent's card put into their graveyard from their library this turn", () => {
  it("a milled creature card comes back under your control; a creature that died doesn't qualify", () => {
    const { s: s0, ap, opp, ids } = setup([mill]);
    putOnBattlefield(s0, ap, captain);
    s0.players[opp]!.library = [];
    const milled = [ogre, giant, wasteland].map((d) => into(s0, opp, d, "library"));
    const died = putOnBattlefield(s0, opp, bear());
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [player(opp)])));
    moveObject(s, died, "graveyard");
    invalidateCharacteristics(s);
    for (let i = 0; i < 300 && !(s.step === "end" && s.pending?.kind === "chooseTargets"); i++) {
      if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: waitingOn(s)!, attacks: [] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [obj(milled[1]!)] });
    s = resolveAll(s);
    expect(s.objects[milled[1]!]!.zone).toBe("battlefield");
    expect(s.objects[milled[1]!]!.controller).toBe(ap);
    expect(s.objects[died]!.zone).toBe("graveyard");
  });
});

describe("Secret Arcade // Dusty Parlor", () => {
  const unlockBoth = (s: GameState, pid: PlayerId) => {
    const r = putOnBattlefield(s, pid, arcade);
    s.objects[r]!.unlocked = [0, 1];
    invalidateCharacteristics(s);
    return r;
  };

  it("Secret Arcade: your nonland permanents are enchantments too; lands and other players' permanents aren't", () => {
    const { s, ap, opp } = setup([]);
    const r = putOnBattlefield(s, ap, arcade);
    s.objects[r]!.unlocked = [0];
    const b = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, bear());
    const land = putOnBattlefield(s, ap, wasteland);
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[b]!).types.sort()).toEqual(["Creature", "Enchantment"]);
    expect(objIsType(s, s.objects[theirs]!, "Enchantment")).toBe(false);
    expect(objIsType(s, s.objects[land]!, "Enchantment")).toBe(false);
  });

  it("locked, it does nothing", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, arcade);
    const b = putOnBattlefield(s, ap, bear());
    expect(objIsType(s, s.objects[b]!, "Enchantment")).toBe(false);
  });

  it("both doors: a creature spell you cast is an enchantment spell, so Dusty Parlor puts counters equal to its mana value", () => {
    const { s: s0, ap, ids } = setup([giant, ponder]);
    unlockBoth(s0, ap);
    const b = putOnBattlefield(s0, ap, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.stack.at(-1)?.objectId).toBe(ids[0]);
    expect(defOf(s, s.objects[ids[0]!]!).types).toContain("Enchantment");
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [obj(b)] }));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(5);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(objIsType(s, s.objects[ids[0]!]!, "Enchantment")).toBe(true);
    // A sorcery isn't a permanent spell.
    s = run(s, planCast(s, ap, ids[1]!));
    expect(defOf(s, s.objects[ids[1]!]!).types).toEqual(["Sorcery"]);
    expect(s.triggerQueue).toHaveLength(0);
  });

  it("an opponent's creature spell isn't an enchantment spell", () => {
    const { s: s0, ap, opp } = setup([]);
    unlockBoth(s0, ap);
    const o = into(s0, opp, bear(), "hand");
    const st = s0.objects[o]!;
    st.zone = "stack";
    st.controller = opp;
    invalidateCharacteristics(s0);
    expect(defOf(s0, st).types).toEqual(["Creature"]);
  });

  it("Dusty Parlor alone: only enchantment spells", () => {
    const { s: s0, ap, ids } = setup([ogre]);
    const r = putOnBattlefield(s0, ap, arcade);
    s0.objects[r]!.unlocked = [1];
    invalidateCharacteristics(s0);
    const s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.triggerQueue).toHaveLength(0);
  });
});

describe("Predators' Hour", () => {
  it("each creature you control gets menace and the exile trigger; the card is exiled face down, playable with any mana", () => {
    const { s: s0, ap, opp, ids } = setup([predators]);
    const b = putOnBattlefield(s0, ap, bear());
    const top = into(s0, opp, ogre, "library");
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(abilitiesOf(s, s.objects[b]!).triggers.length).toBeGreaterThan(0);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    for (let i = 0; i < 60 && s.objects[top]!.zone === "library"; i++) {
      if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: waitingOn(s)!, blocks: [] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[top]!.zone).toBe("exile");
    expect(s.objects[top]!.hiddenExile?.seen).toEqual([ap]);
    expect(s.objects[top]!.mayPlay).toMatchObject({ player: ap, until: "exiled", anyType: true });
  });
});

describe("Mauhúr, Uruk-hai Captain", () => {
  const mauhur = card("Mauhúr, Uruk-hai Captain", "Legendary Creature — Orc Soldier", "{B}{R}", { power: "2", toughness: "2", cmc: 2, keywords: ["Menace"], oracleText: "Menace\nIf one or more +1/+1 counters would be put on an Army, Goblin, or Orc you control, that many plus one +1/+1 counters are put on it instead." });
  const goblin = card("Test Goblin", "Creature — Goblin", "{R}", { power: "1", toughness: "1", cmc: 1 });
  const oil = card("Test Oil", "Instant", "{1}", { cmc: 1, oracleText: "Put a +1/+1 counter on target creature." });
  const amass = card("Test Amass", "Sorcery", "{B}", { cmc: 1, keywords: ["Amass"], oracleText: "Amass Zombies 2. (Put two +1/+1 counters on an Army you control. It's also a Zombie. If you don't control an Army, create a 0/0 black Zombie Army creature token first.)" });
  it("compiles", () => supported(mauhur, amass));

  it("an Orc, Goblin or Army you control gets one more +1/+1 counter; other creatures and an opponent's Goblin don't", () => {
    const { s: s0, ap, opp, ids } = setup([oil, oil, oil, oil]);
    const m = putOnBattlefield(s0, ap, mauhur);
    const g = putOnBattlefield(s0, ap, goblin);
    const b = putOnBattlefield(s0, ap, bear());
    const og = putOnBattlefield(s0, opp, goblin);
    let s = s0;
    for (const [i, t] of [m, g, b, og].entries()) s = resolveAll(run(s, planCast(s, ap, ids[i]!, [obj(t)])));
    expect([m, g, b, og].map((id) => s.objects[id]!.counters["+1/+1"])).toEqual([2, 2, 1, 1]);
  });

  it("applies to the counters amass puts on the Army (rulings)", () => {
    const { s: s0, ap, ids } = setup([amass]);
    putOnBattlefield(s0, ap, mauhur);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    const army = named(s, "Zombie Army");
    expect(army).toHaveLength(1);
    expect(s.objects[army[0]!]!.counters["+1/+1"]).toBe(3);
  });
});

describe("Jade Orb of Dragonkind", () => {
  const orb = card("Jade Orb of Dragonkind", "Artifact", "{2}{G}", { cmc: 3, oracleText: "{T}: Add {G}. When you spend this mana to cast a Dragon creature spell, it enters with an additional +1/+1 counter on it and gains hexproof until your next turn. (It can't be the target of spells or abilities your opponents control.)" });
  const dragon = card("Test Dragon", "Creature — Dragon", "{3}{G}", { power: "4", toughness: "4", cmc: 4 });
  it("compiles", () => supported(orb));

  it("a Dragon cast with its mana enters with a +1/+1 counter and hexproof until your next turn", () => {
    const { s: s0, ap, ids } = setup([dragon]);
    const o = putOnBattlefield(s0, ap, orb);
    let s = act(s0, { type: "activateMana", player: ap, objectId: o, mana: "G" });
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    const d = s.objects[ids[0]!]!;
    expect(d.zone).toBe("battlefield");
    expect(d.counters["+1/+1"]).toBe(1);
    expect(objHasKeyword(s, d, "Hexproof")).toBe(true);
    s = advance(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 3) % 4]!);
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Hexproof")).toBe(true);
    s = advance(s, "upkeep", ap);
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Hexproof")).toBe(false);
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
  });

  it("a non-Dragon creature spell gets nothing", () => {
    const { s: s0, ap, ids } = setup([ogre]);
    const o = putOnBattlefield(s0, ap, orb);
    let s = act(s0, { type: "activateMana", player: ap, objectId: o, mana: "G" });
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Hexproof")).toBe(false);
  });
});

describe("Kastral, the Windcrested", () => {
  const kastral = card("Kastral, the Windcrested", "Legendary Creature — Bird Scout", "{3}{W}{U}", { power: "4", toughness: "5", cmc: 5, keywords: ["Flying"], oracleText: "Flying\nWhenever one or more Birds you control deal combat damage to a player, choose one —\n• You may put a Bird creature card from your hand or graveyard onto the battlefield with a finality counter on it.\n• Put a +1/+1 counter on each Bird you control.\n• Draw a card." });
  const bird = card("Test Bird", "Creature — Bird", "{1}{W}", { power: "1", toughness: "1", cmc: 2, keywords: ["Flying"], oracleText: "Flying" });
  it("compiles", () => supported(kastral));

  /** Kastral attacks `opp` alone and deals combat damage: stops at the trigger's mode choice. */
  const hit = (s: GameState, ap: PlayerId, opp: PlayerId, k: string) => {
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: k, defender: opp }] });
    for (let i = 0; i < 60 && s.pending?.kind !== "chooseModes"; i++) {
      if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: waitingOn(s)!, blocks: [] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.pending).toMatchObject({ kind: "chooseModes", player: ap, min: 1, max: 1 });
    return s;
  };

  it("puts a Bird creature card from your graveyard onto the battlefield with a finality counter", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kastral);
    const b = into(s0, ap, bird, "graveyard");
    let s = hit(s0, ap, opp, k);
    s = act(s, { type: "chooseModes", player: ap, modes: [0] });
    for (let i = 0; i < 20 && s.objects[b]!.zone === "graveyard"; i++) {
      const p = s.pending;
      if (!p) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      else if (p.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: true });
      else if (p.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: p.player, found: [b] });
      else throw new Error(JSON.stringify(p));
    }
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[b]!.counters.finality).toBe(1);
  });

  it("or puts a +1/+1 counter on each Bird you control", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kastral);
    const b = putOnBattlefield(s0, ap, bird);
    const ob = putOnBattlefield(s0, opp, bird);
    let s = hit(s0, ap, opp, k);
    s = resolveAll(act(s, { type: "chooseModes", player: ap, modes: [1] }));
    expect([k, b, ob].map((id) => s.objects[id]!.counters["+1/+1"] ?? 0)).toEqual([1, 1, 0]);
  });
});

describe("The Golden Throne", () => {
  const throne = card("The Golden Throne", "Legendary Artifact", "{4}", { cmc: 4, oracleText: "Arcane Life-support — If you would lose the game, instead exile The Golden Throne and your life total becomes 1.\nA Thousand Souls Die Every Day — {T}, Sacrifice a creature: Add three mana in any combination of colors." });
  const angel = card("Platinum Angel", "Artifact Creature — Angel", "{7}", { power: "4", toughness: "4", cmc: 7, keywords: ["Flying"], oracleText: "Flying\nYou can't lose the game and your opponents can't win the game." });
  it("compiles", () => supported(throne, angel));

  it("at 0 life: exiled instead, and the life total becomes 1 (life gained)", () => {
    const { s: s0, ap, ids } = setup([shock]);
    const t = putOnBattlefield(s0, ap, throne);
    s0.players[ap]!.life = 2;
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [player(ap)])));
    expect(s.players[ap]!.lost).toBe(false);
    expect(s.players[ap]!.life).toBe(1);
    expect(s.battlefield).not.toContain(t);
    expect(s.players[ap]!.exile.some((id) => nameOf(s, id) === "The Golden Throne")).toBe(true);
  });

  it("drawing from an empty library: life 20 becomes 1, and no loss until the next such draw (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, throne);
    s0.players[ap]!.drewFromEmptyLibrary = true;
    let s = act(s0, { type: "passPriority", player: ap });
    expect(s.players[ap]!.lost).toBe(false);
    expect(s.players[ap]!.life).toBe(1);
    expect(s.battlefield).not.toContain(t);
    s = resolveAll(s);
    expect(s.players[ap]!.lost).toBe(false);
  });

  it("ten poison counters: exiled, then the player loses anyway at the next check (rulings)", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, throne);
    s0.players[ap]!.poison = 10;
    const s = act(s0, { type: "passPriority", player: ap });
    expect(s.players[ap]!.lost).toBe(true);
    expect(s.log.some((l) => /exiles The Golden Throne instead/.test(typeof l === "string" ? l : JSON.stringify(l)))).toBe(true);
  });

  it("doesn't apply while you can't lose the game (rulings), nor to an opponent", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, throne);
    putOnBattlefield(s0, ap, angel);
    s0.players[ap]!.life = 0;
    s0.players[opp]!.life = 0;
    const s = act(s0, { type: "passPriority", player: ap });
    expect(s.players[ap]!.lost).toBe(false);
    expect(s.players[ap]!.life).toBe(0);
    expect(s.battlefield).toContain(t);
    expect(s.players[opp]!.lost).toBe(true);
  });
});

describe("Knollspine Dragon", () => {
  const dragon = card("Knollspine Dragon", "Creature — Dragon", "{5}{R}{R}", { power: "7", toughness: "5", cmc: 7, keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, you may discard your hand and draw cards equal to the damage dealt to target opponent this turn." });
  it("compiles", () => supported(dragon));

  it("discards the hand and draws as many cards as the damage that opponent was dealt this turn, by any source", () => {
    const { s: s0, ap, opp, ids } = setup([shock, dragon]);
    // Another player's damage to them counts too (rulings).
    s0.damageThisTurn = { [opp]: 1 };
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [player(opp)])));
    expect(s.damageThisTurn?.[opp]).toBe(3);
    const hand = s.players[ap]!.hand.filter((id) => id !== ids[1]);
    s = run(s, planCast(s, ap, ids[1]!));
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [player(opp)] });
    s = resolveAll(s);
    expect(hand.every((id) => s.objects[id]!.zone === "graveyard")).toBe(true);
    expect(s.players[ap]!.hand).toHaveLength(3);
  });
});

describe("Anti-Venom, Horrifying Healer", () => {
  const venom = card("Anti-Venom, Horrifying Healer", "Legendary Creature — Symbiote Hero", "{W}{W}{W}{W}{W}", { power: "5", toughness: "5", cmc: 5, oracleText: "When Anti-Venom enters, if he was cast, return target creature card from your graveyard to the battlefield.\nIf damage would be dealt to Anti-Venom, prevent that damage and put that many +1/+1 counters on him." });
  const flame = card("Test Flame", "Instant", "{R}", { cmc: 1, oracleText: "Damage can't be prevented this turn. Test Flame deals 2 damage to any target." });
  it("compiles", () => supported(venom, flame));

  it("cast: returns a creature card from your graveyard; put onto the battlefield otherwise: doesn't", () => {
    const { s: s0, ap, ids } = setup([venom]);
    putOnBattlefield(s0, ap, plains);
    putOnBattlefield(s0, ap, plains);
    const y = into(s0, ap, ogre, "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [obj(y)] }));
    expect(s.objects[y]!.zone).toBe("battlefield");
    const { s: s1, ap: ap1 } = setup([]);
    into(s1, ap1, ogre, "graveyard");
    putOnBattlefield(s1, ap1, venom);
    expect(s1.triggerQueue).toHaveLength(0);
  });

  it("damage to him is prevented and becomes +1/+1 counters; damage that can't be prevented is dealt, and the counters still come (CR 615.12)", () => {
    const { s: s0, ap, ids } = setup([shock, flame]);
    const v = putOnBattlefield(s0, ap, venom);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(v)])));
    expect(s.objects[v]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[v]!.damage ?? 0).toBe(0);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [obj(v)])));
    expect(s.objects[v]!.counters["+1/+1"]).toBe(4);
    expect(s.objects[v]!.damage).toBe(2);
  });
});

describe("Vizkopa Guildmage", () => {
  const guildmage = card("Vizkopa Guildmage", "Creature — Human Wizard", "{W}{B}", { power: "2", toughness: "2", cmc: 2, oracleText: "{1}{W}{B}: Target creature gains lifelink until end of turn.\n{1}{W}{B}: Whenever you gain life this turn, each opponent loses that much life." });
  const heal = card("Test Heal", "Instant", "{W}", { cmc: 1, oracleText: "You gain 2 life." });
  it("compiles", () => supported(guildmage));

  it("activated twice: each life gain this turn makes each opponent lose that much, twice (rulings); not next turn", () => {
    const { s: s0, ap, ids } = setup([heal]);
    const g = putOnBattlefield(s0, ap, guildmage);
    let s = resolveAll(run(s0, planActivate(s0, ap, g, 1)));
    s = resolveAll(run(s, planActivate(s, ap, g, 1)));
    const opps = s.turnOrder.filter((p) => p !== ap);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.players[ap]!.life).toBe(42);
    expect(opps.map((p) => s.players[p]!.life)).toEqual([36, 36, 36]);
    s = advance(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(s.floatingTriggers ?? []).toHaveLength(0);
  });
});

describe("Tifa's Limit Break", () => {
  const tifa = card("Tifa's Limit Break", "Instant", "{G}", { cmc: 1, keywords: ["Tiered"], oracleText: "Tiered (Choose one additional cost.)\n• Somersault — {0} — Target creature gets +2/+2 until end of turn.\n• Meteor Strikes — {2} — Double target creature's power and toughness until end of turn.\n• Final Heaven — {6}{G} — Triple target creature's power and toughness until end of turn." });
  it("compiles", () => supported(tifa));

  it("Final Heaven triples: +X/+Y, twice its power and toughness (CR 701.11b)", () => {
    const { s: s0, ap, ids } = setup([tifa]);
    const b = putOnBattlefield(s0, ap, bear());
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(b)], [2])));
    expect(pt(s, b)).toBe("6/6");
  });

  it("Meteor Strikes doubles", () => {
    const { s: s0, ap, ids } = setup([tifa]);
    const b = putOnBattlefield(s0, ap, bear());
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(b)], [1])));
    expect(pt(s, b)).toBe("4/4");
  });
});

describe("Katilda, Dawnhart Prime", () => {
  const katilda = card("Katilda, Dawnhart Prime", "Legendary Creature — Human Warlock", "{G}{W}", { power: "1", toughness: "1", cmc: 2, colors: ["G", "W"], keywords: ["Protection"], oracleText: 'Protection from Werewolves\nHuman creatures you control have "{T}: Add one mana of any of this creature\'s colors."\n{4}{G}{W}, {T}: Put a +1/+1 counter on each creature you control.' });
  const human = card("Test Human", "Creature — Human", "{R}", { power: "1", toughness: "1", cmc: 1, colors: ["R"] });
  it("compiles", () => supported(katilda));

  it("each Human taps for one mana of its own colors", () => {
    const { s: s0, ap } = setup([]);
    const k = putOnBattlefield(s0, ap, katilda);
    const h = putOnBattlefield(s0, ap, human);
    let s = act(s0, { type: "activateMana", player: ap, objectId: h, mana: "R" });
    expect(s.players[ap]!.manaPool.R).toBe(1);
    expect(() => act(s, { type: "activateMana", player: ap, objectId: k, mana: "R" })).toThrow();
    s = act(s, { type: "activateMana", player: ap, objectId: k, mana: "W" });
    expect(s.players[ap]!.manaPool.W).toBe(1);
  });
});
