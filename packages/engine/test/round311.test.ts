// Round 311 (Lane A, skip-list cards): Divergent Transformations and Chaos Mutation (each exiled creature's controller
// reveals until a creature card and puts it onto the battlefield), Michelangelo, Improviser (a creature card and/or a
// land card from your hand), Azra Oddsmaker (a creature chosen after a discard, then a delayed draw trigger about it),
// Saving Grace (all damage to you and your permanents this turn redirected to the enchanted creature), Sovereigns of
// Lost Alara (an Aura that could enchant the attacking creature), Pandemonium (the entering creature's controller chooses
// the target), Argentum Masticore (a target with mana value at most the discarded card's), Kethek, Crucible Goliath (a
// card with lesser mana value than the creature sacrificed), Curse of Shallow Graves (the attacking player may create a
// Zombie).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { moveObject } from "../src/game";
import { applyAction, botActions, invalidateCharacteristics, isFullySupported, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
/** Passes priority until `me` has a question (or `n` passes). */
const untilAsked = (s: GameState, me: PlayerId, n = 40) => {
  for (let i = 0; i < n && s.pending?.player !== me; i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const t = (id: string): TargetChoice => ({ kind: "object", id });
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
const ptOf = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
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
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]?.name === name);

// Real oracle text (Scryfall).
const divergent = (): CardDef => ({"oracleId":"f08e835a-7827-4fdc-8dcf-ae74507da052","name":"Divergent Transformations","manaCost":"{6}{R}","cmc":7,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Undaunted (This spell costs {1} less to cast for each opponent.)\nExile two target creatures. For each of those creatures, its controller reveals cards from the top of their library until they reveal a creature card, puts that card onto the battlefield, then shuffles the rest into their library.","colors":["R"],"colorIdentity":["R"],"keywords":["Undaunted"],"layout":"normal"});
const mutation = (): CardDef => ({"oracleId":"1a240953-26e0-429f-9663-dcfe5bc2c1c7","name":"Chaos Mutation","manaCost":"{3}{U}{R}","cmc":5,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Exile any number of target creatures controlled by different players. For each creature exiled this way, its controller reveals cards from the top of their library until they reveal a creature card, puts that card onto the battlefield, then puts the rest on the bottom of their library in a random order.","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[],"layout":"normal"});
const mikey = (): CardDef => ({"oracleId":"1939679b-ea2e-4a75-b3ce-d7af68437484","name":"Michelangelo, Improviser","manaCost":"{3}{G}","cmc":4,"typeLine":"Legendary Creature — Mutant Ninja Turtle","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Mutant","Ninja","Turtle"],"oracleText":"Sneak {2}{G}{G} (You may cast this spell for {2}{G}{G} if you also return an unblocked attacker you control to hand during the declare blockers step. He enters tapped and attacking.)\nWhenever Michelangelo deals combat damage to a player, you may put a creature card and/or a land card from your hand onto the battlefield.","power":"4","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":["Sneak"],"layout":"normal"});
const azra = (): CardDef => ({"oracleId":"457470db-e664-4ca3-84ec-6cec2d4ae906","name":"Azra Oddsmaker","manaCost":"{1}{B}{R}","cmc":3,"typeLine":"Creature — Azra Warrior","supertypes":[],"types":["Creature"],"subtypes":["Azra","Warrior"],"oracleText":"At the beginning of combat on your turn, you may discard a card. If you do, choose a creature. Whenever that creature deals combat damage to a player this turn, you draw two cards.","power":"3","toughness":"3","colors":["B","R"],"colorIdentity":["B","R"],"keywords":[],"layout":"normal"});
const grace = (): CardDef => ({"oracleId":"50ddbea3-7ef4-4f6a-83c9-0c3ea1dfa3c9","name":"Saving Grace","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Flash\nEnchant creature you control\nWhen this Aura enters, all damage that would be dealt this turn to you and permanents you control is dealt to enchanted creature instead.\nEnchanted creature gets +0/+3.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant","Flash"],"layout":"normal"});
const sovereigns = (): CardDef => ({"oracleId":"86e13e19-45df-4d73-8600-51b7caa3e6ab","name":"Sovereigns of Lost Alara","manaCost":"{4}{W}{U}","cmc":6,"typeLine":"Creature — Spirit","supertypes":[],"types":["Creature"],"subtypes":["Spirit"],"oracleText":"Exalted (Whenever a creature you control attacks alone, that creature gets +1/+1 until end of turn.)\nWhenever a creature you control attacks alone, you may search your library for an Aura card that could enchant that creature, put it onto the battlefield attached to that creature, then shuffle.","power":"4","toughness":"5","colors":["U","W"],"colorIdentity":["U","W"],"keywords":["Exalted"],"layout":"normal"});
const pandemonium = (): CardDef => ({"oracleId":"073551ca-2e84-4d49-8484-9890718cc483","name":"Pandemonium","manaCost":"{3}{R}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a creature enters, that creature's controller may have it deal damage equal to its power to any target of their choice.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"});
const masticore = (): CardDef => ({"oracleId":"3ceee5c2-321c-49ec-ba49-1fac7f6ee2cc","name":"Argentum Masticore","manaCost":"{5}","cmc":5,"typeLine":"Artifact Creature — Phyrexian Masticore","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Phyrexian","Masticore"],"oracleText":"First strike, protection from multicolored\nAt the beginning of your upkeep, sacrifice this creature unless you discard a card. When you discard a card this way, destroy target nonland permanent an opponent controls with mana value less than or equal to the mana value of the discarded card.","power":"5","toughness":"5","colors":[],"colorIdentity":[],"keywords":["First strike","Protection"],"layout":"normal"});
const kethek = (): CardDef => ({"oracleId":"26747bdc-6bd4-4218-ae83-bd46c7668880","name":"Kethek, Crucible Goliath","manaCost":"{2}{B}{R}","cmc":4,"typeLine":"Legendary Creature — Phyrexian Beast","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Phyrexian","Beast"],"oracleText":"At the beginning of your end step, you may sacrifice another creature. If you do, reveal cards from the top of your library until you reveal a nonlegendary creature card with lesser mana value, put it onto the battlefield, then put the rest on the bottom of your library in a random order.","power":"4","toughness":"4","colors":["B","R"],"colorIdentity":["B","R"],"keywords":[],"layout":"normal"});
const shallow = (): CardDef => ({"oracleId":"dc66dbed-f979-4ad1-b5f9-08538886167f","name":"Curse of Shallow Graves","manaCost":"{2}{B}","cmc":3,"typeLine":"Enchantment — Aura Curse","supertypes":[],"types":["Enchantment"],"subtypes":["Aura","Curse"],"oracleText":"Enchant player\nWhenever a player attacks enchanted player with one or more creatures, that attacking player may create a tapped 2/2 black Zombie creature token.","colors":["B"],"colorIdentity":["B"],"keywords":["Enchant"],"layout":"normal"});

const fodder = (name: string, mv = 2, extra: Partial<CardDef> = {}) => bear({ name, cmc: mv, manaCost: `{${mv - 1}}{G}`, ...extra });

describe("round 311", () => {
  it("are fully supported", () => supported(divergent(), mutation(), mikey(), azra(), grace(), sovereigns(), pandemonium(), masticore(), kethek(), shallow()));
});

describe("Divergent Transformations", () => {
  it("exiles both targets; each one's controller, in turn order, reveals until a creature card, puts it onto the battlefield and shuffles", () => {
    const { s: s0, ap, ids, opp } = setup([divergent()]);
    const mine = putOnBattlefield(s0, ap, bear({ name: "Test Mine" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Test Theirs" }));
    const myFind = inZone(s0, ap, fodder("Test My Find", 3), "library");
    inZone(s0, ap, card("Test My Land", "Land"), "library");
    const theirFind = inZone(s0, opp, fodder("Test Their Find", 5), "library");
    const theirLand = inZone(s0, opp, card("Test Their Land", "Land"), "library");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [t(mine), t(theirs)])));
    expect(zone(s, mine)).toBe("exile");
    expect(zone(s, theirs)).toBe("exile");
    expect(zone(s, myFind)).toBe("battlefield");
    expect(s.objects[myFind]!.controller).toBe(ap);
    expect(zone(s, theirFind)).toBe("battlefield");
    expect(s.objects[theirFind]!.controller).toBe(opp);
    expect(zone(s, theirLand)).toBe("library");
    // The active player first (rulings).
    const log = s.log.map((l) => (typeof l === "string" ? l : JSON.stringify(l)));
    const first = log.findIndex((l) => l.includes("Test My Find"));
    const second = log.findIndex((l) => l.includes("Test Their Find"));
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
  });

  it("a player whose two creatures were exiled does it twice; a target that became illegal isn't exiled or replaced", () => {
    const { s: s0, ap, ids, opp } = setup([divergent()]);
    const a = putOnBattlefield(s0, opp, bear({ name: "Test A" }));
    const b = putOnBattlefield(s0, opp, bear({ name: "Test B" }));
    // No other creature cards in that library: the second reveal finds the other one after the shuffle.
    s0.players[opp]!.library = s0.players[opp]!.library.filter((id) => !s0.cards[s0.objects[id]!.cardId]!.types.includes("Creature"));
    const f1 = inZone(s0, opp, fodder("Test Find One"), "library");
    const f2 = inZone(s0, opp, fodder("Test Find Two"), "library");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [t(a), t(b)])));
    expect(zone(s, a)).toBe("exile");
    expect(zone(s, b)).toBe("exile");
    expect(zone(s, f1)).toBe("battlefield");
    expect(zone(s, f2)).toBe("battlefield");

    const g = setup([divergent()]);
    const c = putOnBattlefield(g.s, g.opp, bear({ name: "Test C" }));
    const d = putOnBattlefield(g.s, g.ap, bear({ name: "Test D" }));
    const myTop = inZone(g.s, g.ap, fodder("Test Not Found"), "library");
    const theirTop = inZone(g.s, g.opp, fodder("Test Found"), "library");
    s = run(g.s, planCast(g.s, g.ap, g.ids[0]!, [t(c), t(d)]));
    moveObject(s, d, "graveyard");
    s = settle(s);
    expect(zone(s, c)).toBe("exile");
    expect(zone(s, theirTop)).toBe("battlefield");
    expect(zone(s, myTop)).toBe("library");
  });
});

describe("Chaos Mutation", () => {
  it("can't target two creatures one player controls; each exiled creature is replaced, the rest put on the bottom", () => {
    const { s: s0, ap, ids, opp } = setup([mutation()]);
    const opp2 = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const a = putOnBattlefield(s0, opp, bear({ name: "Test A" }));
    const b = putOnBattlefield(s0, opp, bear({ name: "Test B" }));
    const c = putOnBattlefield(s0, opp2, bear({ name: "Test C" }));
    expect(planCast(s0, ap, ids[0]!, [t(a), t(b)])).toBeNull();
    const find = inZone(s0, opp, fodder("Test Find"), "library");
    const land = inZone(s0, opp, card("Test Land", "Land"), "library");
    const find2 = inZone(s0, opp2, fodder("Test Find Too"), "library");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [t(a), t(c)])));
    expect(zone(s, a)).toBe("exile");
    expect(zone(s, c)).toBe("exile");
    expect(zone(s, b)).toBe("battlefield");
    expect(zone(s, find)).toBe("battlefield");
    expect(zone(s, find2)).toBe("battlefield");
    const lib = s.players[opp]!.library;
    expect(lib[lib.length - 1]).toBe(land);
  });
});

describe("Michelangelo, Improviser", () => {
  it("when it deals combat damage to a player, puts a creature card and a land card from your hand onto the battlefield", () => {
    const { s: s0, ap, opp } = setup([]);
    const me = putOnBattlefield(s0, ap, mikey());
    const creature = inZone(s0, ap, fodder("Test Hand Beast", 6), "hand");
    const land = inZone(s0, ap, card("Test Hand Land", "Land"), "hand");
    const other = inZone(s0, ap, fodder("Test Other Beast", 3), "hand");
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: me, defender: opp }] } as Action);
    s = untilAsked(s, ap, 80);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 2, fromHand: true });
    if (s.pending?.kind !== "searchLibrary") throw new Error();
    expect(s.pending.cards).toEqual(expect.arrayContaining([creature, land, other]));
    // Two creature cards don't both fit.
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [creature, other] })).toThrow();
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [creature, land] }), ap);
    expect(zone(s, creature)).toBe("battlefield");
    expect(zone(s, land)).toBe("battlefield");
    expect(zone(s, other)).toBe("hand");
  });
});

describe("Azra Oddsmaker", () => {
  it("at the beginning of combat, after a discard, the chosen creature draws you two cards when it deals combat damage to a player", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, azra());
    const hitter = putOnBattlefield(s0, ap, bear({ name: "Test Hitter" }));
    const junk = inZone(s0, ap, card("Test Junk", "Land"), "hand");
    let s = passUntil(s0, "beginCombat", ap);
    s = untilAsked(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = untilAsked(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(s.pending).toMatchObject({ kind: "discard", player: ap });
    s = untilAsked(act(s, { type: "discard", player: ap, objectIds: [junk] }), ap);
    expect(zone(s, junk)).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, count: 1 });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [hitter] }), ap);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: hitter, defender: opp }] } as Action);
    const before = s.players[ap]!.hand.length;
    s = passUntil(s, "endCombat", ap);
    expect(s.players[ap]!.hand.length).toBe(before + 2);
  });

  it("doesn't choose a creature if you don't discard", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, azra());
    inZone(s0, ap, card("Test Junk", "Land"), "hand");
    let s = untilAsked(passUntil(s0, "beginCombat", ap), ap);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(s.pending).toBeFalsy();
    expect(s.floatingTriggers ?? []).toHaveLength(0);
  });
});

describe("Azra Oddsmaker (bot)", () => {
  it("a bot chooses its own creature that can attack, not an opponent's bigger one", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, azra());
    const hitter = putOnBattlefield(s0, ap, bear({ name: "Test Hitter", power: "4" }));
    putOnBattlefield(s0, ap, bear({ name: "Test Sick", power: "6" }), { sick: true });
    putOnBattlefield(s0, opp, bear({ name: "Test Big Foe", power: "7", toughness: "7" }));
    inZone(s0, ap, card("Test Junk", "Land"), "hand");
    let s = untilAsked(passUntil(s0, "beginCombat", ap), ap);
    for (let i = 0; i < 4 && s.pending?.kind !== "pickPermanents"; i++) s = untilAsked(act(s, botActions(s, ap)[0]!), ap);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap });
    expect(botActions(s, ap)[0]).toMatchObject({ type: "pickPermanents", ids: [hitter] });
  });
});

describe("Saving Grace", () => {
  const bolt = () => card("Test Bolt", "Instant", "{R}", { oracleText: "Test Bolt deals 3 damage to any target." });
  it("redirects damage to you and your permanents this turn to the enchanted creature, even after it leaves", () => {
    const { s: s0, ap, ids } = setup([grace(), bolt(), bolt()]);
    const host = putOnBattlefield(s0, ap, bear({ name: "Test Host", toughness: "6" }));
    const other = putOnBattlefield(s0, ap, bear({ name: "Test Other", toughness: "5" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [t(host)])));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(host);
    expect(ptOf(s, host)).toBe("2/9");
    const life = s.players[ap]!.life;
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: ap }])));
    expect(s.players[ap]!.life).toBe(life);
    expect(s.objects[host]!.damage).toBe(3);
    // The Aura leaves: still redirected to that creature this turn (rulings); damage to another of your permanents too.
    moveObject(s, ids[0]!, "graveyard");
    invalidateCharacteristics(s);
    expect(ptOf(s, host)).toBe("2/6");
    s = settle(run(s, planCast(s, ap, ids[2]!, [t(other)])));
    expect(s.objects[other]!.damage ?? 0).toBe(0);
    // 3 + 3 damage on a 2/6: it dies.
    expect(zone(s, host)).toBe("graveyard");
  });
});

describe("Sovereigns of Lost Alara", () => {
  it("when a creature attacks alone, finds only an Aura that could enchant it and attaches it", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, sovereigns(), { sick: false });
    const hitter = putOnBattlefield(s0, ap, bear({ name: "Test Hitter" }));
    const might = inZone(s0, ap, card("Test Might", "Enchantment — Aura", "{G}", { oracleText: "Enchant creature\nEnchanted creature gets +2/+0." }), "library");
    const artAura = inZone(s0, ap, card("Test Rust", "Enchantment — Aura", "{G}", { oracleText: "Enchant artifact\nEnchanted artifact doesn't untap during its controller's untap step." }), "library");
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: hitter, defender: opp }] } as Action);
    for (let i = 0; i < 6 && s.pending?.kind !== "searchLibrary"; i++) {
      s = untilAsked(s, ap);
      if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: true });
    }
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    if (s.pending?.kind !== "searchLibrary") throw new Error();
    expect(s.pending.cards).toContain(might);
    expect(s.pending.cards).not.toContain(artAura);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [might] }), ap);
    expect(zone(s, might)).toBe("battlefield");
    expect(s.objects[might]!.attachedTo).toBe(hitter);
    // 2/2, +1/+1 exalted, +2/+0.
    expect(ptOf(s, hitter)).toBe("5/3");
  });
});

describe("Pandemonium", () => {
  it("the entering creature's controller chooses the target and whether it deals damage equal to its power", () => {
    const { s: s0, ap, ids, opp } = setup([fodder("Test Big", 2, { power: "4", toughness: "4" })]);
    const pan = putOnBattlefield(s0, ap, pandemonium());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = untilAsked(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = untilAsked(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }), ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    const life = s.players[opp]!.life;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(s.players[opp]!.life).toBe(life - 4);
    expect(pan).toBeTruthy();
  });

  it("another player's creature: its controller chooses, though the trigger is yours", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, pandemonium());
    const big = inZone(s0, ap, fodder("Test Big", 2, { power: "3", toughness: "3" }), "hand");
    let s = run(s0, planCast(s0, ap, big));
    s = untilAsked(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = untilAsked(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }), ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    const life = s.players[opp]!.life;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(s.players[opp]!.life).toBe(life - 3);
  });
});

describe("Pandemonium (bot)", () => {
  it("a bot whose creature enters targets an opponent and has it deal the damage", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, pandemonium());
    const big = inZone(s0, opp, bear({ name: "Test Big", power: "3", toughness: "3" }), "hand");
    moveObject(s0, big, "battlefield");
    invalidateCharacteristics(s0);
    const before = s0.turnOrder.map((p) => s0.players[p]!.life);
    const s = settle(s0);
    const after = s.turnOrder.map((p) => s.players[p]!.life);
    expect(after.reduce((a, b) => a + b, 0)).toBe(before.reduce((a, b) => a + b, 0) - 3);
    expect(s.players[opp]!.life).toBe(40);
  });
});

describe("Argentum Masticore", () => {
  it("discarding to keep it destroys a nonland permanent an opponent controls with mana value at most the discarded card's", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, masticore());
    s0.players[ap]!.hand = [];
    const three = inZone(s0, ap, fodder("Test Three", 3), "hand");
    const small = putOnBattlefield(s0, opp, fodder("Test Small", 3));
    const large = putOnBattlefield(s0, opp, fodder("Test Large", 4));
    let s = s0;
    for (let i = 0; i < 2000 && !(s.pending?.player === ap && s.activePlayer === ap && s.step === "upkeep"); i++) {
      if (s.pending) s = act(s, botActions(s, s.pending.player)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = untilAsked(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    if (s.pending?.kind === "discard") s = untilAsked(act(s, { type: "discard", player: ap, objectIds: [three] }), ap);
    expect(zone(s, three)).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [t(large)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [t(small)] }), ap);
    expect(zone(s, small)).toBe("graveyard");
    expect(zone(s, large)).toBe("battlefield");
    expect(zone(s, m)).toBe("battlefield");
  });
});

describe("Kethek, Crucible Goliath", () => {
  it("sacrificing a creature reveals until a nonlegendary creature card with lesser mana value, the rest to the bottom", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, kethek());
    const victim = putOnBattlefield(s0, ap, fodder("Test Victim", 3));
    const fit = inZone(s0, ap, fodder("Test Fit", 2), "library");
    const same = inZone(s0, ap, fodder("Test Same", 3), "library");
    const legend = inZone(s0, ap, fodder("Test Legend", 1, { typeLine: "Legendary Creature — Bear", supertypes: ["Legendary"] }), "library");
    let s = untilAsked(passUntil(s0, "end", ap), ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = untilAsked(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    if (s.pending?.kind === "pickPermanents") s = untilAsked(act(s, { type: "pickPermanents", player: ap, ids: [victim] }), ap);
    s = settle(s, ap);
    expect(zone(s, victim)).toBe("graveyard");
    expect(zone(s, fit)).toBe("battlefield");
    const lib = s.players[ap]!.library;
    expect(lib.slice(-2).sort()).toEqual([same, legend].sort());
  });
});

describe("Curse of Shallow Graves", () => {
  it("whenever a player attacks the enchanted player, that player may create a tapped 2/2 black Zombie", () => {
    const { s: s0, ap, opp } = setup([]);
    const curse = putOnBattlefield(s0, opp, shallow());
    s0.objects[curse]!.attachedToPlayer = opp;
    const hitter = putOnBattlefield(s0, ap, bear({ name: "Test Hitter" }));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: hitter, defender: opp }] } as Action);
    s = untilAsked(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    const zombies = named(s, ap, "Zombie Token").concat(named(s, ap, "Zombie"));
    expect(zombies).toHaveLength(1);
    expect(s.objects[zombies[0]!]!.tapped).toBe(true);
  });
});
