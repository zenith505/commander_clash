// Round 292: from the top of the popularity list, names no earlier round looked at.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, controllerOf, compileCard, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";
import { moveObject } from "../src/game";
import { canBeSacrificed } from "../src/cards";
import { putCounters } from "../src/counters";

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
/** Passes priority (no blocks) until `done`. */
const until = (s: GameState, done: (s: GameState) => boolean, max = 400) => {
  for (let i = 0; i < max; i++) {
    if (done(s)) return s;
    const pid = waitingOn(s)!;
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (s.pending?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, s.pending.count) });
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never got there");
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const none = { kind: "none" } as TargetChoice;
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
const nameOf = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
const offered = (s: GameState) => (s.pending?.kind === "chooseOption" && s.pending.what === "castFromAmong" ? s.pending.options : []);
/** A fresh card object on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  invalidateCharacteristics(s);
  return id;
};
const inYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  moveObject(s, id, "graveyard");
  return id;
};
/** Only these cards in `pid`'s hand: the rest go back to the bottom of their library. */
const handOnly = (s: GameState, pid: PlayerId, keep: string[]) => {
  const p = s.players[pid]!;
  for (const id of p.hand.filter((x) => !keep.includes(x))) {
    s.objects[id]!.zone = "library";
    p.library.push(id);
  }
  p.hand = p.hand.filter((x) => keep.includes(x));
  invalidateCharacteristics(s);
};
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Attacks `defender` with `attacker` (no blocks) and passes until `done`. */
const attackUntil = (s0: GameState, ap: PlayerId, attacker: string, defender: PlayerId, done: (s: GameState) => boolean) => {
  let s = passUntil(s0, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender }] } as Action);
  return until(s, done);
};
const instant = (name: string, cost = "{U}") => card(name, "Instant", cost, { oracleText: "Draw a card." });
const sorcery = (name: string, cost = "{U}") => card(name, "Sorcery", cost, { oracleText: "Draw a card." });

// Real oracle text (Scryfall).
const zemo = (): CardDef => ({"oracleId":"657c5473-f153-4dd2-94a0-d477cbc2451d","name":"Helmut Zemo, Mastermind","manaCost":"{2}{U}","cmc":3,"typeLine":"Legendary Creature — Human Noble Villain","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Noble","Villain"],"oracleText":"Whenever Helmut Zemo attacks, you may cast target instant or sorcery card with mana value less than or equal to his power from your graveyard. If that spell would be put into your graveyard, exile it instead. If you cast a spell this way, put a +1/+1 counter on Helmut Zemo.","power":"2","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const harness = (): CardDef => ({"oracleId":"38eaf0ea-8cdd-45f4-bfb9-0f8d0fcf863a","name":"Harness the Storm","manaCost":"{2}{R}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever you cast an instant or sorcery spell from your hand, you may cast target card with the same name as that spell from your graveyard. (You still pay its costs.)","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"soi","releasedAt":"2016-04-08","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const metamorph = (): CardDef => ({"oracleId":"68f34b1c-e06b-4859-b7c0-62148341e38c","name":"Nascent Metamorph","manaCost":"{1}{U}","cmc":2,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"Whenever this creature attacks or blocks, target opponent reveals cards from the top of their library until they reveal a creature card. This creature becomes a copy of that card until end of turn. Then that player puts all cards revealed this way on the bottom of their library in a random order.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"c20","releasedAt":"2020-04-17","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const kylox = (): CardDef => ({"oracleId":"37f6bbb8-2136-4f03-966c-85d72180e71f","name":"Kylox, Visionary Inventor","manaCost":"{5}{U}{R}","cmc":7,"typeLine":"Legendary Creature — Lizard Artificer","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Lizard","Artificer"],"oracleText":"Menace, ward {2}, haste\nWhenever Kylox attacks, sacrifice any number of other creatures, then exile the top X cards of your library, where X is their total power. You may cast any number of instant and/or sorcery spells from among the exiled cards without paying their mana costs.","power":"4","toughness":"4","colors":["R","U"],"colorIdentity":["R","U"],"keywords":["Haste","Menace","Ward"],"commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const flotsam = (): CardDef => ({"oracleId":"b0c28b2b-a2dd-4b76-bb1c-cec55a0a6784","name":"Flotsam // Jetsam","manaCost":"{1}{G/U} // {4}{U/B}{U/B}","cmc":8,"typeLine":"Instant // Sorcery","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Mill three cards. Investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")","colors":["B","G","U"],"colorIdentity":["B","G","U"],"keywords":["Investigate","Mill"],"commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"uncommon","layout":"split","gameChanger":false,"faces":[{"name":"Flotsam","manaCost":"{1}{G/U}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Mill three cards. Investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")","colors":["U","G"]},{"name":"Jetsam","manaCost":"{4}{U/B}{U/B}","typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each opponent mills three cards, then you may cast a spell from each opponent's graveyard without paying its mana cost. If a spell cast this way would be put into a graveyard, exile it instead.","colors":["U","B"]}]} as CardDef);
const stilt = (): CardDef => ({"oracleId":"8ae1bda5-8f70-48ec-9df0-89e58a4ab21c","name":"Stilt-Man, Towering Terror","manaCost":"{2}{R}","cmc":3,"typeLine":"Legendary Creature — Human Rogue Villain","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Rogue","Villain"],"oracleText":"Reach\nWhenever one or more Villains you control deal combat damage to a player, gain control of target noncreature, nonland permanent that player controls until the end of your next turn. It gains \"This permanent can't be sacrificed\" until the end of your next turn.","power":"4","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Reach"],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const four = (): CardDef => ({"oracleId":"a2281c99-3f45-441b-8e78-7f1f29bf1dcd","name":"The Fantastic Four","manaCost":"{R}{G}{W}{U}","cmc":4,"typeLine":"Legendary Creature — Human Hero","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Hero"],"oracleText":"When The Fantastic Four enter and whenever you cast a spell with power, toughness, or mana value 4, choose one that hasn't been chosen this turn.\n• Create a 0/4 colorless Wall creature token with defender.\n• The Fantastic Four deal 3 damage to each opponent.\n• Put two +1/+1 counters on target creature.\n• Draw a card.","power":"4","toughness":"4","colors":["G","R","U","W"],"colorIdentity":["G","R","U","W"],"keywords":[],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const chargers = (): CardDef => ({"oracleId":"8e638c52-e7b9-445b-adcf-77b58e06c2ba","name":"Rohirrim Chargers","manaCost":"{2}{R}{W}","cmc":4,"typeLine":"Creature — Human Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"You may exert this creature as it attacks. (It won't untap during your next untap step.)\nWhenever you exert a creature, reveal cards from the top of your library until you reveal an Equipment card. Put that card onto the battlefield attached to that creature, then put the rest on the bottom of your library in a random order.","power":"4","toughness":"4","colors":["R","W"],"colorIdentity":["R","W"],"keywords":["Exert"],"commanderLegal":"legal","set":"ltc","releasedAt":"2023-11-03","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const loki = (): CardDef => ({"oracleId":"6f72ce67-3c17-4338-904b-26e2bf4aecdc","name":"Loki, God of Lies","manaCost":"{1}{R}{R}","cmc":3,"typeLine":"Legendary Creature — God Sorcerer Villain","supertypes":["Legendary"],"types":["Creature"],"subtypes":["God","Sorcerer","Villain"],"oracleText":"Whenever you cast a spell that targets only a single creature, gain control of that creature until end of turn. If it's your turn, untap that creature and it gains haste until end of turn.","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const feud = (): CardDef => ({"oracleId":"fc5d0e18-2d10-47df-9742-2ea6c6d44431","name":"Guild Feud","manaCost":"{5}{R}","cmc":6,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, target opponent reveals the top three cards of their library, may put a creature card from among them onto the battlefield, then puts the rest into their graveyard. You do the same with the top three cards of your library. If two creatures are put onto the battlefield this way, those creatures fight each other.","colors":["R"],"colorIdentity":["R"],"keywords":["Fight"],"commanderLegal":"legal","set":"rtr","releasedAt":"2012-10-05","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);

const ALL = () => [zemo(), harness(), metamorph(), kylox(), flotsam(), stilt(), four(), chargers(), loki(), feud()];
describe("round 292", () => {
  it("every card of the round compiles fully", () => supported(...ALL()));
});

/** Answers a trigger's target prompt, if any, with `t`. */
const targetIf = (s: GameState, pid: PlayerId, t: TargetChoice[]) => (s.pending?.kind === "chooseTargets" ? act(s, { type: "chooseTargets", player: pid, targets: t }) : s);

describe("Helmut Zemo, Mastermind", () => {
  it("attacks: casts an instant or sorcery card with mana value up to his power from the graveyard, exiled after; then a +1/+1 counter", () => {
    const { s: s0, ap, opp } = setup([]);
    const me = putOnBattlefield(s0, ap, zemo());
    const cheap = inYard(s0, ap, instant("Test Cheap", "{1}{U}"));
    const dear = inYard(s0, ap, sorcery("Test Dear", "{2}{U}"));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: me, defender: opp }] } as Action);
    s = until(s, (x) => x.pending?.kind === "chooseTargets" || x.pending?.kind === "castFree");
    if (s.pending?.kind === "chooseTargets") {
      // Mana value 3 is more than his power 2.
      expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(dear)] })).toThrow();
      s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(cheap)] });
    }
    s = until(s, (x) => x.pending?.kind === "castFree");
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: cheap, how: "paid" });
    s = run(s, planCast(s, ap, cheap));
    s = until(s, (x) => !x.stack.length && !x.pending);
    expect(zone(s, cheap)).toBe("exile");
    expect(zone(s, dear)).toBe("graveyard");
    expect(s.objects[me]!.counters?.["+1/+1"]).toBe(1);
  });

  it("no counter when nothing is cast", () => {
    const { s: s0, ap, opp } = setup([]);
    const me = putOnBattlefield(s0, ap, zemo());
    const cheap = inYard(s0, ap, instant("Test Cheap", "{1}{U}"));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: me, defender: opp }] } as Action);
    s = targetIf(until(s, (x) => x.pending?.kind === "chooseTargets" || x.pending?.kind === "castFree"), ap, [tgt(cheap)]);
    s = until(s, (x) => x.pending?.kind === "castFree");
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    s = until(s, (x) => !x.stack.length && !x.pending);
    expect(zone(s, cheap)).toBe("graveyard");
    expect(s.objects[me]!.counters?.["+1/+1"] ?? 0).toBe(0);
  });
});

describe("Harness the Storm", () => {
  it("casting an instant from your hand lets you cast a card with its name from your graveyard, paying for it", () => {
    const { s: s0, ap, ids } = setup([instant("Test Quick", "{1}{U}")]);
    putOnBattlefield(s0, ap, harness());
    const old = inYard(s0, ap, instant("Test Quick", "{1}{U}"));
    const other = inYard(s0, ap, instant("Test Other", "{U}"));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = until(s, (x) => x.pending?.kind === "chooseTargets" || x.pending?.kind === "castFree");
    if (s.pending?.kind === "chooseTargets") {
      expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(other)] })).toThrow();
      s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(old)] });
    }
    s = until(s, (x) => x.pending?.kind === "castFree");
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: old, how: "paid" });
    s = run(s, planCast(s, ap, old));
    // The one from the graveyard resolves first (rulings), then goes back to the graveyard.
    expect(s.stack.map((x) => x.objectId)).toEqual([ids[0], old]);
    s = until(s, (x) => !x.stack.length && !x.pending);
    expect([zone(s, old), zone(s, ids[0]!)]).toEqual(["graveyard", "graveyard"]);
  });

  it("doesn't trigger for a spell not cast from your hand, and needs a card with that name", () => {
    const { s: s0, ap, ids } = setup([instant("Test Quick", "{1}{U}")]);
    putOnBattlefield(s0, ap, harness());
    inYard(s0, ap, instant("Test Other", "{U}"));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    // No legal target: the ability isn't put on the stack (CR 603.3d).
    expect(s.pending).toBeNull();
    expect(s.stack).toHaveLength(1);
  });
});

describe("Nascent Metamorph", () => {
  const giant = () => card("Test Giant", "Creature — Giant", "{4}{R}", { power: "5", toughness: "5" });
  const land = (n: string) => card(n, "Land");

  it("attacks: the target opponent reveals until a creature card; it becomes a copy until end of turn; all revealed go on the bottom", () => {
    const { s: s0, ap, opp } = setup([]);
    const me = putOnBattlefield(s0, ap, metamorph());
    const g = onTop(s0, opp, giant());
    const l2 = onTop(s0, opp, land("Test Moor"));
    const l1 = onTop(s0, opp, land("Test Heath"));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: me, defender: opp }] } as Action);
    s = targetIf(until(s, (x) => x.pending?.kind === "chooseTargets" || nameOf(x, me) === "Test Giant"), ap, [{ kind: "player", id: opp }]);
    s = until(s, (x) => nameOf(x, me) === "Test Giant");
    expect(characteristics(s, s.objects[me]!).power).toBe(5);
    // All three on the bottom, the creature card too (rulings).
    const lib = s.players[opp]!.library;
    expect(lib.slice(-3).sort()).toEqual([g, l1, l2].sort());
    expect(lib.slice(0, 3).some((id) => [g, l1, l2].includes(id))).toBe(false);
    // Until end of turn.
    s = passUntil(s, "upkeep", opp);
    expect(nameOf(s, me)).toBe("Nascent Metamorph");
  });

  it("with no creature card in that library, it doesn't become a copy and the whole library goes back (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const me = putOnBattlefield(s0, ap, metamorph());
    const p = s0.players[opp]!;
    for (const id of [...p.library]) if (characteristics(s0, s0.objects[id]!).types.includes("Creature")) {
      p.library.splice(p.library.indexOf(id), 1);
      s0.objects[id]!.zone = "exile";
      p.exile.push(id);
    }
    const size = p.library.length;
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: me, defender: opp }] } as Action);
    s = targetIf(until(s, (x) => x.pending?.kind === "chooseTargets" || x.step === "declareBlockers" || x.pending?.kind === "declareBlockers"), ap, [{ kind: "player", id: opp }]);
    s = until(s, (x) => x.step === "endCombat" || x.step === "main2");
    expect(nameOf(s, me)).toBe("Nascent Metamorph");
    expect(s.players[opp]!.library).toHaveLength(size);
  });
});

describe("Kylox, Visionary Inventor", () => {
  it("attacks: sacrifice any number of other creatures, exile that total power from the top, cast instants and sorceries among them free", () => {
    const { s: s0, ap, opp } = setup([]);
    handOnly(s0, ap, []);
    const me = putOnBattlefield(s0, ap, kylox());
    const ogre = putOnBattlefield(s0, ap, card("Test Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3" }));
    const cub = putOnBattlefield(s0, ap, bear({ name: "Test Cub" }));
    const keep = putOnBattlefield(s0, ap, bear({ name: "Test Keeper" }));
    // The top five: an instant, a creature, a sorcery, a land, another instant.
    const i2 = onTop(s0, ap, instant("Test Quick Two", "{5}{U}"));
    const l = onTop(s0, ap, card("Test Moor", "Land"));
    const so = onTop(s0, ap, sorcery("Test Slow", "{2}{U}"));
    const cr = onTop(s0, ap, bear({ name: "Test Top Bear" }));
    const i1 = onTop(s0, ap, instant("Test Quick", "{1}{U}"));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: me, defender: opp }] } as Action);
    s = until(s, (x) => x.pending?.kind === "pickPermanents");
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap });
    // Not Kylox itself.
    expect(() => act(s, { type: "pickPermanents", player: ap, ids: [me] })).toThrow();
    s = act(s, { type: "pickPermanents", player: ap, ids: [ogre, cub] });
    expect([zone(s, ogre), zone(s, cub), zone(s, keep)]).toEqual(["graveyard", "graveyard", "battlefield"]);
    s = until(s, (x) => offered(x).length > 0);
    // 3 + 2 power: five cards exiled; only the instants and the sorcery can be cast.
    for (const id of [i1, cr, so, l, i2]) expect(zone(s, id)).toBe("exile");
    expect([...offered(s)].sort()).toEqual([i1, so, i2, "none"].sort());
    s = act(s, { type: "chooseOption", player: ap, choice: i2 });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: i2 });
    s = run(s, planCast(s, ap, i2));
    expect(offered(s)).toEqual([i1, so, "none"]);
    s = act(s, { type: "chooseOption", player: ap, choice: "none" });
    expect(s.stack.some((x) => x.objectId === i2)).toBe(true);
    expect([zone(s, i1), zone(s, so)]).toEqual(["exile", "exile"]);
  });

  it("sacrificing nothing exiles nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    const me = putOnBattlefield(s0, ap, kylox());
    putOnBattlefield(s0, ap, bear({ name: "Test Cub" }));
    const lib = s0.players[ap]!.library.length;
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: me, defender: opp }] } as Action);
    s = until(s, (x) => x.pending?.kind === "pickPermanents");
    s = act(s, { type: "pickPermanents", player: ap, ids: [] });
    s = until(s, (x) => !x.stack.length && !x.pending);
    expect(s.players[ap]!.library.length).toBe(lib);
    expect(s.players[ap]!.exile).toHaveLength(0);
  });
});

describe("Flotsam // Jetsam", () => {
  it("Jetsam: each opponent mills three, then one spell from each opponent's graveyard cast free, exiled after", () => {
    const { s: s0, ap, ids } = setup([flotsam()]);
    const opps = s0.turnOrder.filter((p) => p !== ap);
    const quick = opps.map((p, i) => inYard(s0, p, instant(`Test Quick ${i}`)));
    const extra = inYard(s0, opps[0]!, sorcery("Test Extra"));
    let s = run(s0, planCast(s0, ap, ids[0]!, [], undefined, "auto", undefined, { face: 1 }));
    s = until(s, (x) => offered(x).length > 0);
    for (const p of opps) expect(s.players[p]!.graveyard.length).toBeGreaterThanOrEqual(4);
    // Any card there that can be cast, not only the milled ones; no lands.
    expect(offered(s)).toContain(quick[0]);
    expect(offered(s)).toContain(extra);
    expect(offered(s).some((id) => id !== "none" && characteristics(s, s.objects[id]!).types.includes("Land"))).toBe(false);
    s = act(s, { type: "chooseOption", player: ap, choice: quick[0]! });
    s = run(s, planCast(s, ap, quick[0]!));
    // Nothing more from that opponent's graveyard.
    expect(offered(s)).not.toContain(extra);
    expect(offered(s)).toContain(quick[1]);
    s = act(s, { type: "chooseOption", player: ap, choice: quick[1]! });
    s = run(s, planCast(s, ap, quick[1]!));
    expect(offered(s).some((id) => id !== "none" && s.objects[id]!.owner === opps[1])).toBe(false);
    s = act(s, { type: "chooseOption", player: ap, choice: "none" });
    s = until(s, (x) => !x.stack.length && !x.pending);
    expect([zone(s, quick[0]!), zone(s, quick[1]!), zone(s, quick[2]!)]).toEqual(["exile", "exile", "graveyard"]);
  });
});

describe("Stilt-Man, Towering Terror", () => {
  const villain = () => card("Test Villain", "Creature — Human Villain", "{1}{R}", { power: "2", toughness: "2" });
  const relic = () => card("Test Relic", "Artifact", "{1}");

  it("Villains dealing combat damage to a player: control of their noncreature, nonland permanent until the end of your next turn, and it can't be sacrificed", () => {
    const { s: s0, ap, opp } = setup([]);
    handOnly(s0, ap, []);
    putOnBattlefield(s0, ap, stilt());
    const v = putOnBattlefield(s0, ap, villain());
    const r = putOnBattlefield(s0, opp, relic());
    putOnBattlefield(s0, opp, bear({ name: "Test Their Bear" }));
    let s = attackUntil(s0, ap, v, opp, (x) => x.pending?.kind === "chooseTargets" || controllerOf(x, x.objects[r]!) === ap);
    s = targetIf(s, ap, [tgt(r)]);
    s = until(s, (x) => controllerOf(x, x.objects[r]!) === ap);
    expect(canBeSacrificed(s, s.objects[r]!)).toBe(false);
    // Still yours through the opponents' turns, until your next turn ends.
    s = passUntil(s, "upkeep", opp);
    expect(controllerOf(s, s.objects[r]!)).toBe(ap);
    s = passUntil(s, "main1", ap);
    expect(controllerOf(s, s.objects[r]!)).toBe(ap);
    expect(canBeSacrificed(s, s.objects[r]!)).toBe(false);
    s = passUntil(s, "upkeep", opp);
    expect(controllerOf(s, s.objects[r]!)).toBe(opp);
    expect(canBeSacrificed(s, s.objects[r]!)).toBe(true);
  });

  it("not for a creature that isn't a Villain", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, stilt());
    const b = putOnBattlefield(s0, ap, bear({ name: "Test Plain Bear" }));
    const r = putOnBattlefield(s0, opp, relic());
    const s = attackUntil(s0, ap, b, opp, (x) => x.step === "main2");
    expect(controllerOf(s, s.objects[r]!)).toBe(opp);
  });
});

describe("The Fantastic Four", () => {
  it("enters, and spells with power, toughness or mana value 4: each time a mode not chosen this turn", () => {
    const { s: s0, ap, ids } = setup([four(), card("Test Four Drop", "Sorcery", "{3}{R}", { oracleText: "Draw a card." }), card("Test Wall Four", "Creature — Wall", "{1}{G}", { power: "0", toughness: "4" }), card("Test Three Drop", "Sorcery", "{2}{R}", { oracleText: "Draw a card." })]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = until(s, (x) => x.pending?.kind === "chooseModes");
    s = settle(act(s, { type: "chooseModes", player: ap, modes: [1] }));
    for (const p of s.turnOrder) if (p !== ap) expect(s.players[p]!.life).toBe(s0.players[p]!.life - 3);
    // Mana value 4.
    s = run(s, planCast(s, ap, ids[1]!));
    s = until(s, (x) => x.pending?.kind === "chooseModes");
    expect(() => act(s, { type: "chooseModes", player: ap, modes: [1] })).toThrow();
    s = settle(act(s, { type: "chooseModes", player: ap, modes: [3] }));
    // Toughness 4.
    s = run(s, planCast(s, ap, ids[2]!));
    s = until(s, (x) => x.pending?.kind === "chooseModes");
    expect(() => act(s, { type: "chooseModes", player: ap, modes: [3] })).toThrow();
    s = settle(act(s, { type: "chooseModes", player: ap, modes: [0] }));
    expect(s.battlefield.some((id) => s.objects[id]!.isToken && nameOf(s, id).startsWith("Wall"))).toBe(true);
    // Mana value 3, no 4 anywhere: no trigger.
    s = run(s, planCast(s, ap, ids[3]!));
    expect(s.pending).toBeNull();
    expect(s.stack).toHaveLength(1);
  });
});

describe("Rohirrim Chargers", () => {
  const sword = () => card("Test Sword", "Artifact — Equipment", "{2}", { oracleText: "Equipped creature gets +2/+0.\nEquip {2}" });

  it("exerting a creature: reveal until an Equipment, onto the battlefield attached to it, the rest on the bottom", () => {
    const { s: s0, ap, opp } = setup([]);
    const me = putOnBattlefield(s0, ap, chargers());
    const sw = onTop(s0, ap, sword());
    const l = onTop(s0, ap, card("Test Moor", "Land"));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: me, defender: opp }] } as Action);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "exert" });
    s = act(s, { type: "pickPermanents", player: ap, ids: [me] });
    s = until(s, (x) => zone(x, sw) === "battlefield");
    expect(s.objects[sw]!.attachedTo).toBe(me);
    expect(characteristics(s, s.objects[me]!).power).toBe(6);
    expect(s.players[ap]!.library.at(-1)).toBe(l);
  });

  it("not exerting: nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    const me = putOnBattlefield(s0, ap, chargers());
    const sw = onTop(s0, ap, sword());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: me, defender: opp }] } as Action);
    s = act(s, { type: "pickPermanents", player: ap, ids: [] });
    s = until(s, (x) => x.step === "main2");
    expect(zone(s, sw)).toBe("library");
  });
});

describe("Loki, God of Lies", () => {
  const pump = () => card("Test Pump", "Instant", "{R}", { oracleText: "Target creature gets +1/+0 until end of turn." });
  const zap = () => card("Test Zap", "Instant", "{R}", { oracleText: "Test Zap deals 1 damage to any target." });

  it("a spell that targets only a single creature: control of it until end of turn; on your turn it untaps and gains haste", () => {
    const { s: s0, ap, ids, opp } = setup([pump()]);
    putOnBattlefield(s0, ap, loki());
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Test Their Bear" }));
    s0.objects[theirs]!.tapped = true;
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(theirs)]));
    s = settle(s);
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
    expect(s.objects[theirs]!.tapped).toBe(false);
    expect(characteristics(s, s.objects[theirs]!).keywords).toContain("Haste");
    s = passUntil(s, "upkeep", opp);
    expect(controllerOf(s, s.objects[theirs]!)).toBe(opp);
  });

  it("not for a spell targeting a player", () => {
    const { s: s0, ap, ids, opp } = setup([zap()]);
    putOnBattlefield(s0, ap, loki());
    const s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    expect(s.stack).toHaveLength(1);
  });
});

describe("Guild Feud", () => {
  const big = () => card("Test Big", "Creature — Beast", "{2}{G}", { power: "3", toughness: "3" });
  const small = () => card("Test Small", "Creature — Elf", "{1}{G}", { power: "2", toughness: "2" });

  it("upkeep: the opponent may put a creature from their top three, then you; the rest into graveyards; the two fight", () => {
    const { s: s0, ap } = setup([]);
    handOnly(s0, ap, []);
    putOnBattlefield(s0, ap, feud());
    let s = passUntil(s0, "upkeep", ap);
    s = until(s, (x) => x.pending?.kind === "chooseTargets" || x.stack.length > 0);
    const opp = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s = targetIf(s, ap, [{ kind: "player", id: opp }]);
    const a = onTop(s, opp, big());
    const al = onTop(s, opp, card("Test Moor", "Land"));
    const as = onTop(s, opp, sorcery("Test Slow"));
    const b = onTop(s, ap, small());
    const bl = onTop(s, ap, card("Test Heath", "Land"));
    const bs = onTop(s, ap, sorcery("Test Slower"));
    s = until(s, (x) => x.pending?.kind === "searchLibrary");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp, cards: [a], min: 0, max: 1 });
    // A bot puts its creature onto the battlefield.
    expect(botActions(s, opp)[0]).toMatchObject({ type: "searchLibrary", found: [a] });
    s = act(s, { type: "searchLibrary", player: opp, found: [a] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, cards: [b] });
    s = act(s, { type: "searchLibrary", player: ap, found: [b] });
    s = settle(s);
    expect([zone(s, al), zone(s, as), zone(s, bl), zone(s, bs)]).toEqual(["graveyard", "graveyard", "graveyard", "graveyard"]);
    expect(controllerOf(s, s.objects[a]!)).toBe(opp);
    // They fought: the 2/2 died, the 3/3 has 2 damage.
    expect(zone(s, b)).toBe("graveyard");
    expect(s.objects[a]!.damage).toBe(2);
  });

  it("only one creature put onto the battlefield: no fight", () => {
    const { s: s0, ap } = setup([]);
    handOnly(s0, ap, []);
    putOnBattlefield(s0, ap, feud());
    let s = passUntil(s0, "upkeep", ap);
    s = until(s, (x) => x.pending?.kind === "chooseTargets" || x.stack.length > 0);
    const opp = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s = targetIf(s, ap, [{ kind: "player", id: opp }]);
    const a = onTop(s, opp, big());
    const b = onTop(s, ap, small());
    s = until(s, (x) => x.pending?.kind === "searchLibrary");
    s = act(s, { type: "searchLibrary", player: opp, found: [] });
    if (s.pending?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: ap, found: [b] });
    s = settle(s);
    expect(zone(s, a)).toBe("graveyard");
    expect(zone(s, b)).toBe("battlefield");
    expect(s.objects[b]!.damage ?? 0).toBe(0);
  });
});
