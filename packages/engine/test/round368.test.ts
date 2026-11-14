// Round 368 (Lane A): a legendary creature named by its first name alone (Drizzt Do'Urden, CR 201.5c) that grows by how
// much bigger each creature that dies was.

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { objHasKeyword } from "../src/cards";
import { castProblem, applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

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
/** Answers every question the way the bots would. */
const settleAll = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
void settle;
const ptOf = (s: GameState, id: ObjectId) => { const c = characteristics(s, s.objects[id]!); return `${c.power}/${c.toughness}`; };
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
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
const declare = (s: GameState, pid: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId }[]) => act(until(s, pid, "declareAttackers"), { type: "declareAttackers", player: pid, attacks });
const attach = (s: GameState, aura: ObjectId, host: ObjectId) => {
  s.objects[aura]!.attachedTo = host;
  invalidateCharacteristics(s);
};
const nameOf = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).name;
const auraOn = (s: GameState, host: ObjectId) => s.battlefield.filter((id) => s.objects[id]!.attachedTo === host).map((id) => `${nameOf(s, id)}${s.objects[id]!.isToken ? " (token)" : ""}`);
const vanilla = (name: string, p: number, t: number) => card(name, "Creature — Giant", "{4}", { power: String(p), toughness: String(t) });
const shrouded = card("Test Shroud", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2", oracleText: "Shroud", keywords: ["Shroud"] });
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = into(s, pid, def, "hand");
  s.players[pid]!.hand.splice(s.players[pid]!.hand.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};
const divination = card("Test Divination", "Sorcery", "{2}{U}", { cmc: 3, oracleText: "Draw two cards." });
const zap = card("Test Zap", "Instant", "{R}", { cmc: 1, oracleText: "Test Zap deals 1 damage to any target." });
const bigZap = card("Test Big Zap", "Instant", "{2}{R}", { cmc: 3, oracleText: "Test Big Zap deals 3 damage to any target." });
const murder = card("Test Murder", "Instant", "{B}", { cmc: 1, oracleText: "Destroy target creature." });
const sweep = card("Test Sweep", "Sorcery", "{B}", { cmc: 1, oracleText: "Destroy all creatures your opponents control." });

// Real oracle text (Scryfall).
const drizzt = (): CardDef => ({"oracleId":"1e939df0-d421-42b7-b642-88b3555fd8df","name":"Drizzt Do'Urden","manaCost":"{3}{G}{W}","cmc":5,"typeLine":"Legendary Creature — Elf Ranger","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elf","Ranger"],"oracleText":"Double strike\nWhen Drizzt enters, create Guenhwyvar, a legendary 4/1 green Cat creature token with trample.\nWhenever a creature dies, if it had power greater than Drizzt's power, put a number of +1/+1 counters on Drizzt equal to the difference.","power":"3","toughness":"3","colors":["G","W"],"colorIdentity":["G","W"],"keywords":["Double strike"],"imageUrl":"https://cards.scryfall.io/normal/front/4/6/46e3259e-93c2-48c0-8b96-835cdb883383.jpg?1783926449","artUrl":"https://cards.scryfall.io/art_crop/front/4/6/46e3259e-93c2-48c0-8b96-835cdb883383.jpg?1783926449","commanderLegal":"legal","set":"afr","releasedAt":"2021-07-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const threeDog = (): CardDef => ({"oracleId":"cc504f00-f177-4def-956d-92a2217438bb","name":"Three Dog, Galaxy News DJ","manaCost":"{1}{R}{W}","cmc":3,"typeLine":"Legendary Creature — Human Bard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Bard"],"oracleText":"Whenever you attack, you may pay {2} and sacrifice an Aura attached to Three Dog. When you sacrifice an Aura this way, for each other attacking creature you control, create a token that's a copy of that Aura attached to that creature.","power":"1","toughness":"5","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/7/075f346e-4e2a-4424-b974-fdcf83b3ebfc.jpg?1783912187","artUrl":"https://cards.scryfall.io/art_crop/front/0/7/075f346e-4e2a-4424-b974-fdcf83b3ebfc.jpg?1783912187","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const holyStrength = (): CardDef => ({"oracleId":"9357de36-f8be-4f49-b2c8-9fe9eaf82b07","name":"Holy Strength","manaCost":"{W}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature gets +1/+2.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/e/2/e21264cb-d915-4431-92fd-b0aa32a715fc.jpg?1783943078","artUrl":"https://cards.scryfall.io/art_crop/front/e/2/e21264cb-d915-4431-92fd-b0aa32a715fc.jpg?1783943078","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const codie = (): CardDef => ({"oracleId":"67a9357c-4713-4e01-a60d-532bf0dd80b6","name":"Codie, Vociferous Codex","manaCost":"{3}","cmc":3,"typeLine":"Legendary Artifact Creature — Book Construct","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Book","Construct"],"oracleText":"You can't cast permanent spells.\n{4}, {T}: Add {W}{U}{B}{R}{G}. When you next cast a spell this turn, exile cards from the top of your library until you exile an instant or sorcery card with lesser mana value. Until end of turn, you may cast that card without paying its mana cost. Put each other card exiled this way on the bottom of your library in a random order.","power":"1","toughness":"4","colors":[],"colorIdentity":["B","G","R","U","W"],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/e/a/ea476ee1-67d9-4dd8-a5ac-f68a155eb18b.jpg?1783927281","artUrl":"https://cards.scryfall.io/art_crop/front/e/a/ea476ee1-67d9-4dd8-a5ac-f68a155eb18b.jpg?1783927281","commanderLegal":"legal","set":"stx","releasedAt":"2021-04-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const gorex = (): CardDef => ({"oracleId":"04238d49-941e-4298-8ef6-8e8e723f4034","name":"Gorex, the Tombshell","manaCost":"{6}{B}{B}","cmc":8,"typeLine":"Legendary Creature — Zombie Turtle","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Zombie","Turtle"],"oracleText":"As an additional cost to cast this spell, you may exile any number of creature cards from your graveyard. This spell costs {2} less to cast for each card exiled this way.\nDeathtouch\nWhenever Gorex attacks or dies, choose a card at random exiled with Gorex and put that card into its owner's hand.","power":"4","toughness":"4","colors":["B"],"colorIdentity":["B"],"keywords":["Deathtouch"],"imageUrl":"https://cards.scryfall.io/normal/front/7/2/7231c1b0-0352-4dfd-9f29-143ae6d49b76.jpg?1783908849","artUrl":"https://cards.scryfall.io/art_crop/front/7/2/7231c1b0-0352-4dfd-9f29-143ae6d49b76.jpg?1783908849","commanderLegal":"legal","set":"j25","releasedAt":"2024-11-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

describe("round 368: compiles", () => {
  it("every card of the round", () => supported(drizzt(), threeDog(), codie(), gorex()));
});

describe("Drizzt Do'Urden", () => {
  it("reads \"Drizzt\" as itself (CR 201.5c): its enters trigger makes Guenhwyvar", () => {
    const { s: s0, ap, ids } = setup([drizzt()]);
    const s = settleAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    const cat = s.battlefield.find((id) => characteristics(s, s.objects[id]!).name === "Guenhwyvar");
    expect(cat).toBeDefined();
    const c = characteristics(s, s.objects[cat!]!);
    expect([c.power, c.toughness, c.supertypes.includes("Legendary"), objHasKeyword(s, s.objects[cat!]!, "trample")]).toEqual([4, 1, true, true]);
  });

  it("gets the difference when a creature with greater power dies, and nothing for a smaller one", () => {
    const { s: s0, ap, opp, ids } = setup([murder, murder]);
    const dz = putOnBattlefield(s0, ap, drizzt());
    const big = putOnBattlefield(s0, opp, vanilla("Test Giant", 5, 5));
    const small = putOnBattlefield(s0, opp, vanilla("Test Runt", 2, 2));
    let s = settleAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: big }])));
    expect(s.objects[big]!.zone).toBe("graveyard");
    expect(s.objects[dz]!.counters["+1/+1"] ?? 0).toBe(2);
    expect(ptOf(s, dz)).toBe("5/5");
    s = settleAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: small }])));
    expect(s.objects[small]!.zone).toBe("graveyard");
    expect(s.objects[dz]!.counters["+1/+1"] ?? 0).toBe(2);
  });

  it("with two bigger creatures dying at once, the second trigger checks its power again as it resolves (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([sweep]);
    const dz = putOnBattlefield(s0, ap, drizzt());
    putOnBattlefield(s0, opp, vanilla("Test Giant", 5, 5));
    putOnBattlefield(s0, opp, vanilla("Test Titan", 6, 6));
    const s = settleAll(run(s0, planCast(s0, ap, ids[0]!)));
    // In either order Drizzt ends as big as the biggest one: 3 -> 6 then nothing, or 3 -> 5 then +1.
    expect(ptOf(s, dz)).toBe("6/6");
  });

  it("a creature with power equal to Drizzt's doesn't trigger it", () => {
    const { s: s0, ap, opp, ids } = setup([murder]);
    const dz = putOnBattlefield(s0, ap, drizzt());
    const even = putOnBattlefield(s0, opp, vanilla("Test Peer", 3, 3));
    const s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: even }]));
    const after = settleAll(s);
    expect(after.objects[even]!.zone).toBe("graveyard");
    expect(after.objects[dz]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("Three Dog, Galaxy News DJ", () => {
  it("pays {2} and sacrifices its Aura: each other attacking creature gets a token copy, shroud or not", () => {
    const { s: s0, ap, opp } = setup([]);
    const dog = putOnBattlefield(s0, ap, threeDog());
    const aura = putOnBattlefield(s0, ap, holyStrength());
    attach(s0, aura, dog);
    const b1 = putOnBattlefield(s0, ap, bear());
    const b2 = putOnBattlefield(s0, ap, shrouded);
    const stay = putOnBattlefield(s0, ap, bear({ name: "Test Homebody" }));
    let s = declare(s0, ap, [dog, b1, b2].map((attacker) => ({ attacker, defender: opp })));
    s = until(s, ap, "chooseMay");
    expect(s.pending).toMatchObject({ kind: "chooseMay", pay: { mana: "{2}" } });
    s.players[ap]!.manaPool.G += 3;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(s.objects[aura]!.zone).toBe("graveyard");
    expect(s.players[ap]!.manaPool.G).toBe(1);
    expect(auraOn(s, b1)).toEqual(["Holy Strength (token)"]);
    expect(auraOn(s, b2)).toEqual(["Holy Strength (token)"]);
    expect(auraOn(s, dog)).toEqual([]);
    expect(auraOn(s, stay)).toEqual([]);
    expect(ptOf(s, b1)).toBe("3/4");
  });

  it("declined, nothing happens; with no Aura of yours on it, it doesn't ask", () => {
    const { s: s0, ap, opp } = setup([]);
    const dog = putOnBattlefield(s0, ap, threeDog());
    const aura = putOnBattlefield(s0, ap, holyStrength());
    attach(s0, aura, dog);
    const b1 = putOnBattlefield(s0, ap, bear());
    let s = declare(s0, ap, [{ attacker: b1, defender: opp }]);
    s = until(s, ap, "chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(s.objects[aura]!.attachedTo).toBe(dog);
    expect(auraOn(s, b1)).toEqual([]);

    // An opponent's Aura on Three Dog can't be sacrificed by you (CR 701.21a): no question.
    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    const dog2 = putOnBattlefield(t0, ap2, threeDog());
    const theirs = putOnBattlefield(t0, opp2, holyStrength());
    attach(t0, theirs, dog2);
    const b2 = putOnBattlefield(t0, ap2, bear());
    let t = declare(t0, ap2, [{ attacker: b2, defender: opp2 }]);
    t = settle(t, ap2);
    expect(t.pending?.kind === "chooseMay" && t.pending.player === ap2).toBe(false);
    expect(t.objects[theirs]!.attachedTo).toBe(dog2);
  });

  it("a creature the copy couldn't enchant gets none (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const dog = putOnBattlefield(s0, ap, threeDog());
    const aura = putOnBattlefield(s0, ap, holyStrength());
    attach(s0, aura, dog);
    const pro = putOnBattlefield(s0, ap, card("Test Warded", "Creature — Bear", "{1}{W}", { power: "2", toughness: "2", oracleText: "Protection from white", keywords: ["Protection"] }));
    const b1 = putOnBattlefield(s0, ap, bear());
    let s = declare(s0, ap, [{ attacker: pro, defender: opp }, { attacker: b1, defender: opp }]);
    s = until(s, ap, "chooseMay");
    s.players[ap]!.manaPool.G += 2;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(auraOn(s, pro)).toEqual([]);
    expect(auraOn(s, b1)).toEqual(["Holy Strength (token)"]);
  });
});

describe("Codie, Vociferous Codex", () => {
  it("you can't cast permanent spells; instants and sorceries are fine", () => {
    const { s: s0, ap, ids } = setup([bear(), divination]);
    putOnBattlefield(s0, ap, codie());
    expect(castProblem(s0, ap, ids[0]!)).toMatch(/can't cast permanent spells/);
    expect(planCast(s0, ap, ids[1]!)).not.toBeNull();
  });

  it("its mana's next spell exiles until a cheaper instant or sorcery, castable free this turn; the rest go to the bottom", () => {
    const { s: s0, ap, ids } = setup([divination]);
    const cd = putOnBattlefield(s0, ap, codie());
    const z = onTop(s0, ap, zap);
    const big = onTop(s0, ap, bigZap); // mana value 3: not less than the Divination's
    const b = onTop(s0, ap, bear());
    const lib0 = s0.players[ap]!.library.length;
    s0.players[ap]!.manaPool.C += 4;
    let s = act(s0, { type: "activateMana", player: ap, objectId: cd, mana: "W" });
    expect(s.players[ap]!.manaPool).toMatchObject({ W: 1, U: 1, B: 1, R: 1, G: 1, C: 0 });
    s = settle(run(s, planCast(s, ap, ids[0]!)), ap);
    expect(s.objects[z]!.zone).toBe("exile");
    // The bear and the Big Zap went to the bottom; the Divination drew two of the cards below.
    expect(s.objects[b]!.zone).toBe("library");
    expect(s.objects[big]!.zone).toBe("library");
    const lib = s.players[ap]!.library;
    expect(lib.slice(-2).sort()).toEqual([b, big].sort());
    expect(lib.length).toBe(lib0 - 3 + 2 - 2);
    // Cast for free this turn: no mana needed.
    for (const k of Object.keys(s.players[ap]!.manaPool) as (keyof typeof s.players[0]["manaPool"])[]) s.players[ap]!.manaPool[k] = 0;
    for (const id of s.battlefield) if (characteristics(s, s.objects[id]!).types.includes("Land")) s.objects[id]!.tapped = true;
    const plan = planCast(s, ap, z, [{ kind: "player", id: s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]! }]);
    expect(plan).not.toBeNull();
    s = settle(run(s, plan), ap);
    expect(s.objects[z]!.zone).toBe("graveyard");
  });

  it("with no cheaper instant or sorcery, every card exiled goes back in a random order", () => {
    const { s: s0, ap, ids } = setup([zap]);
    const cd = putOnBattlefield(s0, ap, codie());
    // Only creatures and lands in the library (the setup's deck), plus a Big Zap: nothing has mana value less than 1.
    onTop(s0, ap, bigZap);
    const lib0 = s0.players[ap]!.library.length;
    s0.players[ap]!.manaPool.C += 4;
    let s = act(s0, { type: "activateMana", player: ap, objectId: cd, mana: "W" });
    const opp = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])), ap);
    expect(s.players[ap]!.library.length).toBe(lib0);
    expect(s.players[ap]!.exile?.length ?? 0).toBe(0);
  });
});

describe("Gorex, the Tombshell", () => {
  /** Only {B}{B} plus `generic` other mana available: two Swamps and that many other lands untapped. */
  const lands = (s: GameState, pid: PlayerId, generic: number) => {
    let f = 0, b = 0;
    for (const id of s.battlefield) {
      const o = s.objects[id]!;
      if (o.controller !== pid || !characteristics(s, o).types.includes("Land")) continue;
      const n = characteristics(s, o).name;
      o.tapped = !((n === "Swamp" && b++ < 2) || (n !== "Swamp" && f++ < generic));
    }
  };

  it("costs {2} less for each creature card exiled from your graveyard, never below {B}{B}; more may be exiled", () => {
    const { s: s0, ap, ids } = setup([gorex()]);
    const yard = [0, 1, 2, 3].map(() => into(s0, ap, bear(), "graveyard"));
    lands(s0, ap, 0);
    // Three cards take {6} off: {B}{B} is left, which two Swamps pay.
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 2, { exileCards: yard.slice(0, 2) })).toBeNull();
    let s = settleAll(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 4, { exileCards: yard })));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(yard.map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile", "exile", "exile"]);
    // With none exiled it costs its full {6}{B}{B}.
    const { s: t0, ap: ap2, ids: ids2 } = setup([gorex()]);
    lands(t0, ap2, 5);
    expect(planCast(t0, ap2, ids2[0]!, undefined, undefined, undefined, 0, { exileCards: [] })).toBeNull();
    lands(t0, ap2, 6);
    s = settleAll(run(t0, planCast(t0, ap2, ids2[0]!, undefined, undefined, undefined, 0, { exileCards: [] })));
    expect(s.objects[ids2[0]!]!.zone).toBe("battlefield");
  });

  it("whenever it attacks or dies, a card at random exiled with it goes to its owner's hand (CR 607.2q)", () => {
    const { s: s0, ap, opp, ids } = setup([gorex(), murder]);
    const yard = [0, 1].map(() => into(s0, ap, bear(), "graveyard"));
    let s = settleAll(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 2, { exileCards: yard })));
    const g = ids[0]!;
    expect(s.objects[g]!.zone).toBe("battlefield");
    s.objects[g]!.controlledSinceTurn = -1;
    // An unrelated card in exile isn't exiled with it.
    const other = into(s, ap, bear(), "graveyard");
    s.players[ap]!.graveyard.splice(s.players[ap]!.graveyard.indexOf(other), 1);
    s.objects[other]!.zone = "exile";
    s.players[ap]!.exile?.push(other);
    s = settleAll(declare(s, ap, [{ attacker: g, defender: opp }]));
    const inHand = yard.filter((id) => s.objects[id]!.zone === "hand");
    expect(inHand).toHaveLength(1);
    expect(s.objects[other]!.zone).toBe("exile");
    // Dies: the other one, linked to it as it last existed.
    s = settleAll(s);
    for (let i = 0; i < 400 && !(s.step === "main2" && s.activePlayer === ap && !s.stack.length && !s.pending); i++) s = s.pending ? (() => { let x = s; for (const a of botActions(x, x.pending!.player)) x = act(x, a); return x; })() : act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.objects[g]!.zone === "battlefield") {
      lands(s, ap, 1);
      s = settleAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: g }])));
    }
    expect(s.objects[g]!.zone).toBe("graveyard");
    expect(yard.every((id) => s.objects[id]!.zone === "hand")).toBe(true);
    expect(s.objects[other]!.zone).toBe("exile");
  });
});
