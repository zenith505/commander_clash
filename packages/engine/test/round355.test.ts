// Round 355 (Lane A): copies of two graveyard cards that must be cast (Spelltwine), a free cast from hand bound by the
// spell that triggered it, or a named token (Baral and Kari Zev), and an exiled artifact cast with affinity for
// artifacts (Chiss-Goria, Forge Tyrant).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, isFullySupported, mayPlayFromExile, planCast, spellCost, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

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
const nameOf = (s: GameState, id: ObjectId) => s.cards[s.objects[id]!.cardId]!.name;
const moveTo = (zone: "graveyard" | "hand" | "library") => (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  return id;
};
const inYard = moveTo("graveyard");
const toHand = moveTo("hand");
const onTop = moveTo("library");

// Real oracle text (Scryfall).
const spelltwine = (): CardDef => ({"oracleId":"307e68e0-5095-474c-af02-bfcb2e463763","name":"Spelltwine","manaCost":"{5}{U}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Exile target instant or sorcery card from your graveyard and target instant or sorcery card from an opponent's graveyard. Copy those cards. Cast the copies if able without paying their mana costs. Exile Spelltwine.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"m13","releasedAt":"2012-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const baral = (): CardDef => ({"oracleId":"386a6fa7-db5b-4e82-bd25-fd86d910ed0c","name":"Baral and Kari Zev","manaCost":"{1}{U}{R}","cmc":3,"typeLine":"Legendary Creature — Human","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human"],"oracleText":"First strike, menace\nWhenever you cast your first instant or sorcery spell each turn, you may cast a spell with lesser mana value that shares a card type with it from your hand without paying its mana cost. If you don't, create First Mate Ragavan, a legendary 2/1 red Monkey Pirate creature token. It gains haste until end of turn.","power":"2","toughness":"4","colors":["R","U"],"colorIdentity":["R","U"],"keywords":["First strike","Menace"],"commanderLegal":"legal","set":"mom","releasedAt":"2023-04-21","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const chiss = (): CardDef => ({"oracleId":"3f4d1ae1-d5c6-4afb-94c8-8e0ae4891501","name":"Chiss-Goria, Forge Tyrant","manaCost":"{6}{R}{R}{R}","cmc":9,"typeLine":"Legendary Creature — Dragon","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Affinity for artifacts (This spell costs {1} less to cast for each artifact you control.)\nFlying, haste\nWhenever Chiss-Goria attacks, exile the top five cards of your library. You may cast an artifact spell from among them this turn. If you do, it has affinity for artifacts.","power":"5","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":["Flying","Affinity","Haste"],"commanderLegal":"legal","set":"onc","releasedAt":"2023-02-10","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const ponder = (): CardDef => ({"oracleId":"02090581-61aa-4348-ad57-451be8ee91c2","name":"Ponder","manaCost":"{U}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Look at the top three cards of your library, then put them back in any order. You may shuffle.\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"dsc","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const solemn = (): CardDef => ({"oracleId":"00c0543c-2a1f-4425-8283-4062d74a1637","name":"Solemn Simulacrum","manaCost":"{4}","cmc":4,"typeLine":"Artifact Creature — Golem","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Golem"],"oracleText":"When this creature enters, you may search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.\nWhen this creature dies, you may draw a card.","power":"2","toughness":"2","colors":[],"colorIdentity":[],"keywords":[],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const opt = (): CardDef => ({"oracleId":"713332c1-5bd8-400f-bfff-c1ca0697a043","name":"Opt","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"commanderLegal":"legal","set":"sld","releasedAt":"2025-07-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const fireball = (): CardDef => ({"oracleId":"aa7714b0-2bfb-458a-8ebf-37ec2c53383e","name":"Fireball","manaCost":"{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"This spell costs {1} more to cast for each target beyond the first.\nFireball deals X damage divided evenly, rounded down, among any number of targets.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const destiny = (): CardDef => ({"oracleId":"640a7d2c-42c4-4ea7-bd5b-72f12a65785e","name":"Synthetic Destiny","manaCost":"{4}{U}{U}","cmc":6,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Exile all creatures you control. At the beginning of the next end step, reveal cards from the top of your library until you reveal that many creature cards, put all creature cards revealed this way onto the battlefield, then shuffle the rest of the revealed cards into your library.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"c15","releasedAt":"2015-11-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

describe("round 355: compiles", () => {
  it("every card of the round", () => supported(spelltwine(), baral(), chiss(), destiny()));
});

describe("Spelltwine", () => {
  const ready = () => {
    const { s, ap, ids, opp } = setup([spelltwine()]);
    const div = inYard(s, ap, divination());
    const bolt0 = inYard(s, opp, bolt());
    return { s, ap, opp, twine: ids[0]!, div, bolt0 };
  };

  it("needs both targets: an instant or sorcery card in your graveyard and one in an opponent's", () => {
    const { s, ap, twine, div, bolt0 } = ready();
    expect(planCast(s, ap, twine, [{ kind: "object", id: div }])).toBeNull();
    expect(planCast(s, ap, twine, [{ kind: "object", id: bolt0 }, { kind: "object", id: div }])).toBeNull();
    const mine = inYard(s, ap, opt());
    expect(planCast(s, ap, twine, [{ kind: "object", id: div }, { kind: "object", id: mine }])).toBeNull();
    expect(planCast(s, ap, twine, [{ kind: "object", id: div }, { kind: "object", id: bolt0 }])).not.toBeNull();
  });

  it("both copies are cast, in the order you pick, with no way to stop; the cards and Spelltwine end in exile", () => {
    const { s: s0, ap, opp, twine, div, bolt0 } = ready();
    const hand = s0.players[ap]!.hand.length - 1;
    const life = s0.players[opp]!.life;
    let s = settle(run(s0, planCast(s0, ap, twine, [{ kind: "object", id: div }, { kind: "object", id: bolt0 }])), ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "castFromAmong" });
    expect(s.pending?.kind === "chooseOption" && s.pending.options).toEqual([div, bolt0]);
    s = act(s, { type: "chooseOption", player: ap, choice: bolt0 });
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, must: true });
    // "Cast the copies if able": it can be cast, so it can't be declined.
    expect(() => act(s, { type: "chooseMay", player: ap, yes: false })).toThrow(/must be cast/);
    const boltCopy = s.pending?.kind === "castFree" ? s.pending.objectId : "";
    s = run(s, planCast(s, ap, boltCopy, [{ kind: "player", id: opp }]));
    // The other copy next, without asking which.
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, must: true });
    const divCopy = s.pending?.kind === "castFree" ? s.pending.objectId : "";
    expect(nameOf(s, divCopy)).toBe("Divination");
    s = settle(run(s, planCast(s, ap, divCopy)), ap);
    expect(s.stack.length).toBe(0);
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    for (const id of [div, bolt0, twine]) expect(s.objects[id]!.zone).toBe("exile");
    // The copies ceased to exist (CR 704.5e).
    expect(s.objects[boltCopy]?.zone === "exile" || s.objects[divCopy]?.zone === "exile").toBe(false);
  });

  it("a target gone before it resolves: the other card is still exiled and copied", () => {
    const { s: s0, ap, opp, twine, div, bolt0 } = ready();
    let s = run(s0, planCast(s0, ap, twine, [{ kind: "object", id: div }, { kind: "object", id: bolt0 }]));
    // The opponent's card leaves the graveyard in response.
    const yard = s.players[opp]!.graveyard;
    yard.splice(yard.indexOf(bolt0), 1);
    s.objects[bolt0]!.zone = "library";
    s.objects[bolt0]!.zoneChanges = (s.objects[bolt0]!.zoneChanges ?? 0) + 1;
    s.players[opp]!.library.push(bolt0);
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, must: true });
    expect(nameOf(s, s.pending?.kind === "castFree" ? s.pending.objectId : "")).toBe("Divination");
    expect(s.objects[bolt0]!.zone).toBe("library");
    expect(s.objects[div]!.zone).toBe("exile");
  });

  it("a copy that can't be cast (no legal target) may be passed over", () => {
    const { s: s0, ap, opp, twine, div } = ready();
    const counter = inYard(s0, opp, { ...bolt(), oracleId: "test-spell-snare", name: "Test Spell Snare", oracleText: "Counter target creature spell.", manaCost: "{U}", colors: ["U"] });
    let s = settle(run(s0, planCast(s0, ap, twine, [{ kind: "object", id: div }, { kind: "object", id: counter }])), ap);
    // Only Divination's copy can be cast (no creature spell to target), so no question of order.
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, must: true });
    const divCopy = s.pending?.kind === "castFree" ? s.pending.objectId : "";
    expect(nameOf(s, divCopy)).toBe("Divination");
    s = settle(run(s, planCast(s, ap, divCopy)), ap);
    expect(s.stack.length).toBe(0);
    expect(s.objects[counter]!.zone).toBe("exile");
  });

  it("bots cast both copies", () => {
    const { s: s0, ap, twine, div, bolt0 } = ready();
    const s = settle(run(s0, planCast(s0, ap, twine, [{ kind: "object", id: div }, { kind: "object", id: bolt0 }])));
    expect(s.stack.length).toBe(0);
    expect(s.objects[div]!.zone).toBe("exile");
    expect(s.log.filter((l) => /copies (Divination|Lightning Bolt)/.test(l.text)).length).toBe(2);
  });
});

describe("Baral and Kari Zev", () => {
  const ready = (hand: CardDef[]) => {
    const { s, ap, ids } = setup(hand);
    putOnBattlefield(s, ap, baral());
    return { s, ap, ids };
  };

  it("your first instant or sorcery spell: you may cast a lesser one sharing a card type from your hand, free, as it resolves", () => {
    const { s: s0, ap, ids } = ready([divination(), ponder(), bolt(), fireball()]);
    const [div, pon, bolt0, fb] = ids as [ObjectId, ObjectId, ObjectId, ObjectId];
    let s = settle(run(s0, planCast(s0, ap, div)), ap);
    // Ponder and Fireball (sorceries with mana value 1, X being 0 when cast free); not Lightning Bolt (an instant).
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "castFromHand" });
    const options = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    expect(options).toContain(pon);
    expect(options).toContain(fb);
    expect(options).not.toContain(bolt0);
    s = act(s, { type: "chooseOption", player: ap, choice: pon });
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: pon });
    s = run(s, planCast(s, ap, pon));
    // Ponder resolves before Divination (rulings).
    expect(s.stack.map((x) => nameOf(s, x.objectId!))).toEqual(["Divination", "Ponder"]);
    expect(s.battlefield.some((id) => nameOf(s, id) === "First Mate Ragavan")).toBe(false);
  });

  it("if you don't: First Mate Ragavan, a legendary 2/1 red Monkey Pirate with haste this turn", () => {
    const { s: s0, ap, ids } = ready([divination(), ponder()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }), ap);
    const rag = s.battlefield.find((id) => nameOf(s, id) === "First Mate Ragavan");
    expect(rag).toBeDefined();
    const o = s.objects[rag!]!;
    expect(o.isToken).toBe(true);
    expect(s.players[ap]!.hand).toContain(ids[1]);
  });

  it("nothing lesser that shares a type in hand: the token, no question", () => {
    const { s: s0, ap, ids } = ready([bolt(), ponder(), opt()]);
    // Lightning Bolt (mana value 1): Opt shares instant but isn't lesser; Ponder is neither.
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]! }])), ap);
    expect(s.pending).toBeNull();
    expect(s.battlefield.filter((id) => nameOf(s, id) === "First Mate Ragavan").length).toBe(1);
  });

  it("the triggering spell's mana value includes its X; only the first instant or sorcery spell each turn", () => {
    const { s: s0, ap, ids } = ready([fireball(), divination(), ponder()]);
    const [fb, div, pon] = ids as [ObjectId, ObjectId, ObjectId];
    // Fireball with X = 3: mana value 4, so Divination (3) may be cast.
    let s = settle(run(s0, planCast(s0, ap, fb, [{ kind: "player", id: s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]! }], undefined, undefined, 3)), ap);
    expect(s.pending?.kind === "chooseOption" && s.pending.options).toContain(div);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }), ap);
    expect(s.battlefield.filter((id) => nameOf(s, id) === "First Mate Ragavan").length).toBe(1);
    // Ponder, the second this turn: no trigger.
    s = settle(run(s, planCast(s, ap, pon)), ap);
    expect(s.battlefield.filter((id) => nameOf(s, id) === "First Mate Ragavan").length).toBe(1);
  });
});

describe("Chiss-Goria, Forge Tyrant", () => {
  it("attacking: the top five exiled; one artifact spell among them may be cast this turn, with affinity for artifacts", () => {
    const { s: s0, ap, opp } = setup([]);
    const chissId = putOnBattlefield(s0, ap, chiss());
    putOnBattlefield(s0, ap, solRing());
    putOnBattlefield(s0, ap, solRing());
    const top = [onTop(s0, ap, ornithopter()), onTop(s0, ap, solemn())];
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: chissId, defender: opp }] });
    s = settle(s, ap);
    for (const id of top) {
      expect(s.objects[id]!.zone).toBe("exile");
      expect(mayPlayFromExile(s, s.objects[id]!, ap)).toBe(true);
    }
    // Solemn Simulacrum ({4}) costs {2} with two Sol Rings.
    const cost = spellCost(s, ap, s.objects[top[1]!]!);
    expect(cost.cost.symbols.reduce((n, y) => n + (y.kind === "generic" ? y.amount : 1), 0) + cost.extra).toBe(2);
    s = passUntil(s, "main2", ap);
    s = settle(run(s, planCast(s, ap, top[1]!)), ap);
    expect(s.objects[top[1]!]!.zone).toBe("battlefield");
    // One spell only: Ornithopter can't be cast now.
    expect(mayPlayFromExile(s, s.objects[top[0]!]!, ap)).toBe(false);
  });
});

describe("Synthetic Destiny", () => {
  it("exiles all your creatures, tokens too; at the next end step, that many creature cards from your library onto the battlefield, the rest shuffled in", () => {
    const { s: s0, ap, ids } = setup([destiny()]);
    for (const id of [...s0.battlefield]) if (s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.types.includes("Creature")) s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
    const mine = [putOnBattlefield(s0, ap, bears()), putOnBattlefield(s0, ap, giant())];
    s0.objects[mine[0]!]!.isToken = true;
    // Two creature cards near the top, after a land.
    const found = [onTop(s0, ap, giant()), onTop(s0, ap, giant())];
    const land = s0.players[ap]!.library.find((id) => !s0.cards[s0.objects[id]!.cardId]!.types.includes("Creature"))!;
    const lib = s0.players[ap]!.library;
    lib.splice(lib.indexOf(land), 1);
    lib.unshift(land);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.objects[mine[1]!]!.zone).toBe("exile");
    expect(s.battlefield.includes(mine[0]!)).toBe(false);
    expect(s.delayed?.length).toBeGreaterThan(0);
    for (const id of found) expect(s.objects[id]!.zone).toBe("library");
    s = settle(passUntil(s, "end", ap), ap);
    for (const id of found) expect(s.objects[id]!.zone).toBe("battlefield");
    // Two, as many as were exiled: no third creature card.
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Creature")).length).toBe(2);
    expect(s.objects[land]!.zone).toBe("library");
    expect(s.objects[mine[1]!]!.zone).toBe("exile");
  });

  it("no creatures exiled: nothing enters", () => {
    const { s: s0, ap, ids } = setup([destiny()]);
    for (const id of [...s0.battlefield]) if (s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.types.includes("Creature")) s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
    const before = s0.battlefield.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    s = settle(passUntil(s, "end", ap), ap);
    expect(s.battlefield.length).toBe(before);
  });
});
