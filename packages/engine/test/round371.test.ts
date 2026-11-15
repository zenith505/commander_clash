// Round 371 (Lane A): a graveyard card returned whenever an enchantment enters or a Room is fully unlocked (Fear of
// Infinity), a dread counter and a transform on the enchantment when a creature attacks alone (Grasping Shadows), a
// flashback cost that beholds three Elementals (Kindle the Inner Flame), an exile made permanent by a paid sneak cost, read
// as the creature last existed (Turncoat Kunoichi), and an Aura or Equipment returned attached to the token a reflexive
// ability is about (Forum Filibuster).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, scry, setup, target } from "./helpers";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, planCast, planUnlock, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";
import { moveObject } from "../src/game";

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
/** Passes until `me` has a question of `kind`, other players' questions answered as the bots would (no attacks or blocks). */
const until = (s: GameState, me: PlayerId, kind: string, max = 3000) => {
  for (let i = 0; i < max; i++) {
    const p = s.pending;
    if (p?.player === me && p.kind === kind) return s;
    const who = waitingOn(s)!;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: who, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: who, blocks: [] });
    else if (p) for (const a of botActions(s, who)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: who });
  }
  throw new Error(`no ${kind} for ${me}`);
};
const moveTo = (zone: "graveyard" | "hand" | "library" | "exile") => (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const toYard = moveTo("graveyard");
const toHand = moveTo("hand");
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId }[]) =>
  settle(act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks }));
const blocks = (s: GameState) => {
  for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  while (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
  return settle(s);
};

const charm = card("Test Charm", "Enchantment", "{W}", { cmc: 1, oracleText: "" });
const elemental = (name: string) => card(name, "Creature — Elemental", "{1}{R}", { cmc: 2, power: "2", toughness: "2" });
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { cmc: 3, power: "3", toughness: "3" });
const aura = card("Test Might", "Enchantment — Aura", "{1}{W}", { cmc: 2, oracleText: "Enchant creature\nEnchanted creature gets +2/+2." });
const landAura = card("Test Fertile", "Enchantment — Aura", "{G}", { cmc: 1, oracleText: "Enchant land\nEnchanted land has \"{T}: Add {G}.\"" });
const sword = card("Test Sword", "Artifact — Equipment", "{1}", { cmc: 1, oracleText: "Equipped creature gets +1/+1.\nEquip {2}" });
const REMINDER = "\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)";
const room = scry("split", [
  { name: "Bottomless Pool", mana_cost: "{U}", type_line: "Enchantment — Room", oracle_text: `When you unlock this door, return up to one target creature to its owner's hand.${REMINDER}` },
  { name: "Locker Room", mana_cost: "{4}{U}", type_line: "Enchantment — Room", oracle_text: `Whenever one or more creatures you control deal combat damage to a player, draw a card.${REMINDER}` },
]);

// Real oracle text (Scryfall).
const fear = (): CardDef => ({"oracleId":"018327d1-a3ba-4912-9c88-f0f0c54a1750","name":"Fear of Infinity","manaCost":"{1}{U}{B}","cmc":3,"typeLine":"Enchantment Creature — Nightmare","supertypes":[],"types":["Enchantment","Creature"],"subtypes":["Nightmare"],"oracleText":"Flying, lifelink\nThis creature can't block.\nEerie — Whenever an enchantment you control enters and whenever you fully unlock a Room, you may return this card from your graveyard to your hand.","power":"2","toughness":"2","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Flying","Lifelink","Eerie"],"commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const shadows = (): CardDef => ({"oracleId":"522a4b02-24c7-45d2-9097-2803cc9fffad","name":"Grasping Shadows // Shadows' Lair","manaCost":"{3}{B}","cmc":4,"typeLine":"Enchantment // Land — Cave","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a creature you control attacks alone, it gains deathtouch and lifelink until end of turn. Put a dread counter on this enchantment. Then if there are three or more dread counters on it, transform it.","colors":["B"],"colorIdentity":["B"],"keywords":["Transform"],"producedMana":["B"],"commanderLegal":"legal","set":"lci","releasedAt":"2023-11-17","rarity":"uncommon","layout":"transform","gameChanger":false,"faces":[{"name":"Grasping Shadows","manaCost":"{3}{B}","typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a creature you control attacks alone, it gains deathtouch and lifelink until end of turn. Put a dread counter on this enchantment. Then if there are three or more dread counters on it, transform it.","colors":["B"]},{"name":"Shadows' Lair","manaCost":"","typeLine":"Land — Cave","supertypes":[],"types":["Land"],"subtypes":["Cave"],"oracleText":"(Transforms from Grasping Shadows.)\n{T}: Add {B}.\n{B}, {T}, Remove a dread counter from this land: You draw a card and you lose 1 life.","colors":[]}]}) as CardDef;
const kindle = (): CardDef => ({"oracleId":"c7ca6371-73bb-4717-a148-0804b8f4c1e6","name":"Kindle the Inner Flame","manaCost":"{3}{R}","cmc":4,"typeLine":"Kindred Sorcery — Elemental","supertypes":[],"types":["Kindred","Sorcery"],"subtypes":["Elemental"],"oracleText":"Create a token that's a copy of target creature you control, except it has haste and \"At the beginning of the end step, sacrifice this token.\"\nFlashback—{1}{R}, Behold three Elementals. (You may cast this card from your graveyard for its flashback cost. Then exile it. To behold an Elemental, choose an Elemental you control or reveal an Elemental card from your hand.)","colors":["R"],"colorIdentity":["R"],"keywords":["Behold","Flashback"],"commanderLegal":"legal","set":"ecl","releasedAt":"2026-01-23","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const kunoichi = (): CardDef => ({"oracleId":"0f35cf85-6783-4d69-b5e6-a81f7c1f21e7","name":"Turncoat Kunoichi","manaCost":"{2}{W}","cmc":3,"typeLine":"Creature — Mutant Ninja Fox","supertypes":[],"types":["Creature"],"subtypes":["Mutant","Ninja","Fox"],"oracleText":"Sneak {2}{W}{B} (You may cast this spell for {2}{W}{B} if you also return an unblocked attacker you control to hand during the declare blockers step. It enters tapped and attacking.)\nWhen this creature enters, choose target creature an opponent controls. Exile that creature until this creature leaves the battlefield. If this creature's sneak cost was paid, instead exile the chosen creature.","power":"3","toughness":"2","colors":["W"],"colorIdentity":["B","W"],"keywords":["Sneak"],"commanderLegal":"legal","set":"tmt","releasedAt":"2026-03-06","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const filibuster = (): CardDef => ({"oracleId":"6a9cc11b-a223-46f0-bf58-c1e08ad1253d","name":"Forum Filibuster","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, create a 2/1 white and black Inkling creature token with flying. When you do, return up to one target Aura or Equipment card from your graveyard to the battlefield attached to that token.","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","set":"soc","releasedAt":"2026-04-24","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

describe("round 371: compiles", () => {
  it("every card of the round", () => supported(fear(), shadows(), kindle(), kunoichi(), filibuster()));
});

describe("Fear of Infinity", () => {
  it("in your graveyard, an enchantment you control entering lets you return it to your hand", () => {
    const { s: s0, ap, ids } = setup([charm]);
    const f = toYard(s0, ap, fear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.pending?.kind).toBe("chooseMay");
    expect(botActions(s, ap)).toEqual([{ type: "chooseMay", player: ap, yes: true }]);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(s.objects[f]!.zone).toBe("hand");
  });

  it("declined, it stays; an opponent's enchantment doesn't trigger it", () => {
    const { s: s0, ap, opp, ids } = setup([charm]);
    const f = toYard(s0, ap, fear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(s.objects[f]!.zone).toBe("graveyard");
    // An enchantment entering under an opponent's control: not "an enchantment you control".
    putOnBattlefield(s, opp, charm);
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }), ap);
    expect(s.pending).toBeFalsy();
    expect(s.objects[f]!.zone).toBe("graveyard");
  });

  it("in your graveyard, fully unlocking a Room lets you return it (CR 709.5i)", () => {
    const { s: s0, ap } = setup([]);
    const f = toYard(s0, ap, fear());
    const r = putOnBattlefield(s0, ap, room);
    s0.objects[r]!.unlocked = [0];
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planUnlock(s0, ap, r, 1)), ap);
    expect(s.objects[r]!.unlocked).toEqual([0, 1]);
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(s.objects[f]!.zone).toBe("hand");
  });

  it("unlocking the first door of a Room doesn't fully unlock it", () => {
    const { s: s0, ap } = setup([]);
    const f = toYard(s0, ap, fear());
    const r = putOnBattlefield(s0, ap, room);
    s0.objects[r]!.unlocked = [];
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planUnlock(s0, ap, r, 1)), ap);
    expect(s.objects[r]!.unlocked).toEqual([1]);
    expect(s.pending).toBeFalsy();
    expect(s.objects[f]!.zone).toBe("graveyard");
  });
});

describe("Grasping Shadows", () => {
  it("a creature attacking alone gains deathtouch and lifelink, and the enchantment gets a dread counter", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, shadows());
    const b = putOnBattlefield(s0, ap, bear());
    const s = attack(s0, ap, [{ attacker: b, defender: opp }]);
    expect(characteristics(s, s.objects[b]!).keywords).toEqual(expect.arrayContaining(["Deathtouch", "Lifelink"]));
    expect(s.objects[g]!.counters.dread).toBe(1);
    expect(s.objects[g]!.face ?? 0).toBe(0);
  });

  it("with the third dread counter it transforms into Shadows' Lair, keeping its counters", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, shadows());
    s0.objects[g]!.counters.dread = 2;
    const b = putOnBattlefield(s0, ap, bear());
    const s = attack(s0, ap, [{ attacker: b, defender: opp }]);
    expect(s.objects[g]!.face).toBe(1);
    expect(characteristics(s, s.objects[g]!).name).toBe("Shadows' Lair");
    expect(characteristics(s, s.objects[g]!).types).toEqual(["Land"]);
    expect(s.objects[g]!.counters.dread).toBe(3);
    // The attacker keeps what it gained.
    expect(characteristics(s, s.objects[b]!).keywords).toEqual(expect.arrayContaining(["Deathtouch", "Lifelink"]));
  });

  it("two attackers: no trigger", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, shadows());
    const b = putOnBattlefield(s0, ap, bear());
    const b2 = putOnBattlefield(s0, ap, bear({ name: "Other Bear" }));
    const s = attack(s0, ap, [{ attacker: b, defender: opp }, { attacker: b2, defender: opp }]);
    expect(s.objects[g]!.counters.dread ?? 0).toBe(0);
    expect(characteristics(s, s.objects[b]!).keywords).not.toContain("Deathtouch");
  });
});

describe("Kindle the Inner Flame", () => {
  it("flashback from the graveyard beholding three Elementals, any mix of hand and battlefield, none twice", () => {
    const { s: s0, ap, ids } = setup([elemental("Ember A")]);
    const k = toYard(s0, ap, kindle());
    const e1 = putOnBattlefield(s0, ap, elemental("Ember B"));
    const e2 = putOnBattlefield(s0, ap, elemental("Ember C"));
    const inHand = ids[0]!;
    const o = putOnBattlefield(s0, ap, ogre);
    // Not with two, not one of them twice, not the Ogre.
    expect(planCast(s0, ap, k, [target(o)], undefined, "auto", undefined, { via: "flashback", reveal: [e1, e2] })).toBeNull();
    expect(planCast(s0, ap, k, [target(o)], undefined, "auto", undefined, { via: "flashback", reveal: [e1, e2, e2] })).toBeNull();
    expect(planCast(s0, ap, k, [target(o)], undefined, "auto", undefined, { via: "flashback", reveal: [e1, e2, o] })).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, k, [target(o)], undefined, "auto", undefined, { via: "flashback", reveal: [e1, inHand, e2] })), ap);
    // Flashback exiles it (CR 702.34a); the token copies the Ogre with haste.
    expect(s.objects[k]!.zone).toBe("exile");
    const tok = s.battlefield.find((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).name === "Test Ogre");
    expect(tok).toBeDefined();
    expect(characteristics(s, s.objects[tok!]!).keywords).toContain("Haste");
    // Beholding doesn't move anything: the Elementals stay where they were.
    expect(s.objects[e1]!.zone).toBe("battlefield");
    expect(s.objects[inHand]!.zone).toBe("hand");
  });

  it("with only two Elementals it can't be cast from the graveyard; a bot pays with three", () => {
    const { s: s0, ap } = setup([]);
    const k = toYard(s0, ap, kindle());
    putOnBattlefield(s0, ap, elemental("Ember B"));
    putOnBattlefield(s0, ap, elemental("Ember C"));
    const o = putOnBattlefield(s0, ap, ogre);
    expect(planCast(s0, ap, k, [target(o)], undefined, "auto", undefined, { via: "flashback" })).toBeNull();
    putOnBattlefield(s0, ap, elemental("Ember D"));
    expect(planCast(s0, ap, k, [target(o)], undefined, "auto", undefined, { via: "flashback" })).not.toBeNull();
  });
});

describe("Turncoat Kunoichi", () => {
  const castIt = (sneak: boolean) => {
    const { s: s0, ap, opp, ids } = setup([kunoichi()]);
    const victim = putOnBattlefield(s0, opp, ogre);
    let s = s0;
    if (sneak) {
      const b = putOnBattlefield(s0, ap, bear());
      s = blocks(attack(s0, ap, [{ attacker: b, defender: opp }]));
      s = run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "sneak", returnToHand: [b] }));
    } else s = run(s, planCast(s, ap, ids[0]!));
    s = until(s, ap, "chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [target(victim)] });
    return { s, ap, opp, k: ids[0]!, victim };
  };

  it("cast normally: the creature is exiled until Kunoichi leaves the battlefield", () => {
    let { s, k, victim } = castIt(false);
    s = settle(s);
    expect(s.objects[victim]!.zone).toBe("exile");
    moveObject(s, k, "graveyard");
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.objects[victim]!.zone).toBe("battlefield");
  });

  it("cast for its sneak cost: the creature is exiled for good", () => {
    let { s, k, victim } = castIt(true);
    expect(s.objects[k]!.castAlt).toBe("sneak");
    s = settle(s);
    expect(s.objects[victim]!.zone).toBe("exile");
    moveObject(s, k, "graveyard");
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.objects[victim]!.zone).toBe("exile");
  });

  it("gone before its ability resolves: not cast for sneak, nothing is exiled (rulings)", () => {
    let { s, k, victim } = castIt(false);
    moveObject(s, k, "graveyard");
    s = settle(s);
    expect(s.objects[victim]!.zone).toBe("battlefield");
  });

  it("gone before its ability resolves after a sneak cast: still exiled for good, as it last existed (CR 608.2h)", () => {
    let { s, k, victim } = castIt(true);
    moveObject(s, k, "graveyard");
    s = settle(s);
    expect(s.objects[victim]!.zone).toBe("exile");
  });
});

describe("Forum Filibuster", () => {
  // Under the next player's control, so their upkeep comes first.
  const upkeep = (yard: CardDef[]) => {
    const { s: s0, opp } = setup([]);
    putOnBattlefield(s0, opp, filibuster());
    const cards = yard.map((d) => toYard(s0, opp, d));
    const s = until(s0, opp, "chooseTargets");
    const ink = s.battlefield.find((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Inkling"))!;
    return { s, opp, cards, ink };
  };

  it("an Aura from the graveyard returns attached to the Inkling just created", () => {
    let { s, opp, cards, ink } = upkeep([aura]);
    expect(ink).toBeDefined();
    expect(pt(s, ink)).toBe("2/1");
    s = settle(act(s, { type: "chooseTargets", player: opp, targets: [target(cards[0]!)] }), opp);
    expect(s.objects[cards[0]!]!.zone).toBe("battlefield");
    expect(s.objects[cards[0]!]!.attachedTo).toBe(ink);
    expect(pt(s, ink)).toBe("4/3");
  });

  it("an Equipment returns attached to it; with the token gone it enters unattached", () => {
    let a = upkeep([sword]);
    let s = settle(act(a.s, { type: "chooseTargets", player: a.opp, targets: [target(a.cards[0]!)] }), a.opp);
    expect(s.objects[a.cards[0]!]!.attachedTo).toBe(a.ink);
    expect(pt(s, a.ink)).toBe("3/2");
    const b = upkeep([sword]);
    s = act(b.s, { type: "chooseTargets", player: b.opp, targets: [target(b.cards[0]!)] });
    moveObject(s, b.ink, "graveyard");
    s = settle(s, b.opp);
    expect(s.objects[b.cards[0]!]!.zone).toBe("battlefield");
    expect(s.objects[b.cards[0]!]!.attachedTo).toBeUndefined();
  });

  it("with a token doubler, two Inklings, each with its own reflexive ability and its own Aura", () => {
    const { s: s0, opp } = setup([]);
    putOnBattlefield(s0, opp, filibuster());
    putOnBattlefield(s0, opp, card("Test Season", "Enchantment", "{G}", { oracleText: "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead." }));
    const a1 = toYard(s0, opp, aura);
    const a2 = toYard(s0, opp, card("Test Wings", "Enchantment — Aura", "{U}", { cmc: 1, oracleText: "Enchant creature\nEnchanted creature gets +1/+1." }));
    let s = until(s0, opp, "chooseTargets");
    const inks = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Inkling"));
    expect(inks).toHaveLength(2);
    s = act(s, { type: "chooseTargets", player: opp, targets: [target(a1)] });
    s = until(s, opp, "chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: opp, targets: [target(a2)] }), opp);
    expect(s.objects[a1]!.zone).toBe("battlefield");
    expect(s.objects[a2]!.zone).toBe("battlefield");
    expect(inks).toContain(s.objects[a1]!.attachedTo);
    expect(inks).toContain(s.objects[a2]!.attachedTo);
    expect(s.objects[a1]!.attachedTo).not.toBe(s.objects[a2]!.attachedTo);
  });

  it("an Aura that can't enchant the token stays in the graveyard (CR 303.4g); no target is fine", () => {
    let a = upkeep([landAura]);
    let s = settle(act(a.s, { type: "chooseTargets", player: a.opp, targets: [target(a.cards[0]!)] }), a.opp);
    expect(s.objects[a.cards[0]!]!.zone).toBe("graveyard");
    const b = upkeep([aura]);
    s = settle(act(b.s, { type: "chooseTargets", player: b.opp, targets: [{ kind: "none" }] }), b.opp);
    expect(s.objects[b.cards[0]!]!.zone).toBe("graveyard");
    expect(s.objects[b.ink]!.zone).toBe("battlefield");
  });
});
