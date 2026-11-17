// Round 381 (Lane A): a Saga noting a creature type at each chapter, the next creature spell of that type this turn
// entering with a +1/+1 counter (Long List of the Ents); a granted prevention of a creature's combat damage to a player,
// both players drawing half of it (Sokrates, Athenian Teacher); a land and a spell from any graveyard's cards put there from
// libraries this turn (Coram, the Undertaker).

import { describe, expect, it } from "vitest";
import { act, activate, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, legalActions, moveObject, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty, stopping at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 200 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const onField = (s: GameState, pid: PlayerId, name: string): ObjectId[] => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === name);
const plusOnes = (s: GameState, id: ObjectId) => s.objects[id]!.counters["+1/+1"] ?? 0;

// Real oracle text (Scryfall).
const ents = (): CardDef => ({"oracleId":"01376449-5cd2-4079-8aaa-5128634ef20b","name":"Long List of the Ents","manaCost":"{G}","cmc":1,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after VI.)\nI, II, III, IV, V, VI — Note a creature type that hasn't been noted for this Saga. When you next cast a creature spell of that type this turn, that creature enters with an additional +1/+1 counter on it.","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"ltr","releasedAt":"2023-06-23","rarity":"uncommon","layout":"saga","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const mirrorEntity = (): CardDef => ({"oracleId":"17e905ca-c0bd-473d-95a7-e180ba5fea43","name":"Mirror Entity","manaCost":"{2}{W}","cmc":3,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"Changeling (This card is every creature type.)\n{X}: Until end of turn, creatures you control have base power and toughness X/X and gain all creature types.","power":"1","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":["Changeling"],"commanderLegal":"legal","set":"sld","releasedAt":"2026-02-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sokrates = (): CardDef => ({"oracleId":"f4a9d567-513b-487e-afed-c6e6513a7862","name":"Sokrates, Athenian Teacher","manaCost":"{1}{W}{U}","cmc":3,"typeLine":"Legendary Creature — Human Advisor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Advisor"],"oracleText":"Defender\nSokrates has hexproof as long as it's untapped.\nSokratic Dialogue — {T}: Until end of turn, target creature gains \"If this creature would deal combat damage to a player, prevent that damage. This creature's controller and that player each draw half that many cards, rounded down.\"","power":"0","toughness":"4","colors":["U","W"],"colorIdentity":["U","W"],"keywords":["Sokratic Dialogue","Defender"],"commanderLegal":"legal","set":"acr","releasedAt":"2024-07-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const golgariThug = (): CardDef => ({"oracleId":"a426a258-fd8b-489c-8642-9868ee47de85","name":"Golgari Thug","manaCost":"{1}{B}","cmc":2,"typeLine":"Creature — Human Warrior","supertypes":[],"types":["Creature"],"subtypes":["Human","Warrior"],"oracleText":"When this creature dies, put target creature card from your graveyard on top of your library.\nDredge 4 (If you would draw a card, you may mill four cards instead. If you do, return this card from your graveyard to your hand.)","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Dredge","Mill"],"commanderLegal":"legal","set":"sld","releasedAt":"2019-12-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const leyline = (): CardDef => ({"oracleId":"2608df54-dfbe-417d-aef5-49afbdfb03da","name":"Leyline of Punishment","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If this card is in your opening hand, you may begin the game with it on the battlefield.\nPlayers can't gain life.\nDamage can't be prevented.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"m11","releasedAt":"2010-07-16","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const crawWurm = (): CardDef => ({"oracleId":"6a462a69-3e42-41de-a3aa-a488d9f38d69","name":"Craw Wurm","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"","power":"6","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const coram = (): CardDef => ({"oracleId":"51c511c0-783a-456d-a7e2-959f6e8ddfc8","name":"Coram, the Undertaker","manaCost":"{1}{B}{R}{G}","cmc":4,"typeLine":"Legendary Creature — Human Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warrior"],"oracleText":"Coram gets +X/+0, where X is the greatest power among creature cards in all graveyards.\nWhenever Coram attacks, each player mills a card.\nDuring each of your turns, you may play a land and cast a spell from among cards in graveyards that were put there from libraries this turn.","power":"0","toughness":"5","colors":["B","G","R"],"colorIdentity":["B","G","R"],"keywords":["Mill"],"commanderLegal":"legal","set":"m3c","releasedAt":"2024-06-14","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const forestCard = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

describe("round 381: compiles", () => {
  it("Long List of the Ents, Sokrates, Athenian Teacher and Coram, the Undertaker", () => {
    for (const def of [ents(), sokrates(), coram()]) expect(isFullySupported(def), def.name).toBe(true);
  });
});

describe("Long List of the Ents", () => {
  /** A casts the Saga; chapter I asks for a creature type. */
  const ready = (hand: CardDef[]) => {
    const { s: s0, ap, ids } = setup([ents(), ...hand]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    return { s, ap, hand: ids.slice(1), saga: ids[0]! };
  };

  it("chapter I notes any creature type, chosen as it resolves (CR 205.3m, 608.2d)", () => {
    const { s, ap } = ready([]);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "noteType", player: ap });
    const opts = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    for (const t of ["Elf", "Giant", "Treefolk", "Sliver", "Shapeshifter"]) expect(opts).toContain(t);
    expect(opts).not.toContain("Saga");
    expect(opts).not.toContain("Forest");
  });

  it("the next creature spell of that type cast this turn enters with an additional +1/+1 counter; other types don't use it up", () => {
    let { s, ap, hand } = ready([hillGiant(), elves(), elves()]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Elf" }));
    expect(s.pending).toBeNull();
    // Hill Giant isn't an Elf: no trigger, no counter.
    s = settle(run(s, planCast(s, ap, hand[0]!)));
    expect(plusOnes(s, onField(s, ap, "Hill Giant")[0]!)).toBe(0);
    // The first Elf gets the counter.
    s = settle(run(s, planCast(s, ap, hand[1]!)));
    const [first] = onField(s, ap, "Llanowar Elves");
    expect(plusOnes(s, first!)).toBe(1);
    // Only the next one (CR 603.7c).
    s = settle(run(s, planCast(s, ap, hand[2]!)));
    const second = onField(s, ap, "Llanowar Elves").find((id) => id !== first)!;
    expect(plusOnes(s, second)).toBe(0);
  });

  it("a changeling creature spell is every creature type, so it's of the noted type (CR 702.73a)", () => {
    let { s, ap, hand } = ready([mirrorEntity()]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Treefolk" }));
    s = settle(run(s, planCast(s, ap, hand[0]!)));
    expect(plusOnes(s, onField(s, ap, "Mirror Entity")[0]!)).toBe(1);
  });

  it("chapter II can't note a type already noted for it, and chapter I's delayed trigger ended with its turn", () => {
    let { s, ap, hand } = ready([elves(), hillGiant()]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Elf" }));
    // A's next turn: after the draw step, chapter II.
    s = passUntil(s, "end", ap);
    s = passUntil(s, "main1", ap);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "noteType", player: ap });
    const opts = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    expect(opts).not.toContain("Elf");
    expect(opts).toContain("Giant");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Giant" }));
    expect(s.notedFor?.[Object.keys(s.notedFor ?? {})[0]!]).toEqual(["Elf", "Giant"]);
    // Elf was last turn's: no counter now. Giant is this turn's.
    s = settle(run(s, planCast(s, ap, hand[0]!)));
    expect(plusOnes(s, onField(s, ap, "Llanowar Elves")[0]!)).toBe(0);
    s = settle(run(s, planCast(s, ap, hand[1]!)));
    expect(plusOnes(s, onField(s, ap, "Hill Giant")[0]!)).toBe(1);
  });

  it("a bot notes the type most of its creature cards have (its library's Bears here)", () => {
    const { s, ap } = ready([elves(), elves(), hillGiant()]);
    const acts = botActions(s, ap);
    expect(acts[0]).toMatchObject({ type: "chooseOption", choice: "Bear" });
  });
});

describe("Sokrates, Athenian Teacher", () => {
  /** A has Sokrates and a creature that attacks B unblocked after Sokratic Dialogue targets it. */
  const ready = (def: CardDef = crawWurm()) => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const sok = putOnBattlefield(s, ap, sokrates());
    const att = putOnBattlefield(s, ap, def);
    return { s, ap, opp, sok, att };
  };
  const attack = (s: GameState, ap: PlayerId, att: ObjectId, opp: PlayerId) => {
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: att, defender: opp }] });
    return passUntil(s, "combatDamage", ap);
  };
  const hand = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.length;

  it("prevents the creature's combat damage to a player; its controller and that player each draw half, rounded down (CR 615.5)", () => {
    let { s, ap, opp, sok, att } = ready();
    s = activate(s, ap, sok, 0, [target(att)]);
    const [a0, b0, life] = [hand(s, ap), hand(s, opp), s.players[opp]!.life];
    s = attack(s, ap, att, opp);
    s = passUntil(s, "endCombat", ap);
    expect(s.players[opp]!.life).toBe(life);
    expect(hand(s, ap) - a0).toBe(3);
    expect(hand(s, opp) - b0).toBe(3);
  });

  it("rounds down: 3 damage draws one card each", () => {
    let { s, ap, opp, sok, att } = ready(hillGiant());
    s = activate(s, ap, sok, 0, [target(att)]);
    const [a0, b0] = [hand(s, ap), hand(s, opp)];
    s = passUntil(attack(s, ap, att, opp), "endCombat", ap);
    expect(hand(s, ap) - a0).toBe(1);
    expect(hand(s, opp) - b0).toBe(1);
  });

  it("damage that can't be prevented is dealt, and the players still draw (rulings, CR 615.12)", () => {
    let { s, ap, opp, sok, att } = ready();
    putOnBattlefield(s, opp, leyline());
    s = activate(s, ap, sok, 0, [target(att)]);
    const [a0, b0, life] = [hand(s, ap), hand(s, opp), s.players[opp]!.life];
    s = passUntil(attack(s, ap, att, opp), "endCombat", ap);
    expect(s.players[opp]!.life).toBe(life - 6);
    expect(hand(s, ap) - a0).toBe(3);
    expect(hand(s, opp) - b0).toBe(3);
  });

  it("only until end of turn, and only that creature's damage", () => {
    let { s, ap, opp, sok, att } = ready();
    const other = putOnBattlefield(s, ap, hillGiant());
    s = activate(s, ap, sok, 0, [target(att)]);
    const life = s.players[opp]!.life;
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: att, defender: opp }, { attacker: other, defender: opp }] });
    s = passUntil(s, "endCombat", ap);
    expect(s.players[opp]!.life).toBe(life - 3);
    // Next turn of A's, no ability: the Wurm's damage is dealt.
    s = passUntil(s, "main1", opp);
    s = passUntil(s, "main1", ap);
    const life2 = s.players[opp]!.life;
    s = passUntil(attack(s, ap, att, opp), "endCombat", ap);
    expect(s.players[opp]!.life).toBe(life2 - 6);
  });

  it("a dredge card stops the draws to ask; its answer makes the rest, the other player's too", () => {
    let { s, ap, opp, sok, att } = ready();
    // A dredge card in A's graveyard: A's draws can be replaced.
    const thug = putOnBattlefield(s, ap, golgariThug());
    s.battlefield.splice(s.battlefield.indexOf(thug), 1);
    s.objects[thug]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(thug);
    s = activate(s, ap, sok, 0, [target(att)]);
    const [a0, b0] = [hand(s, ap), hand(s, opp)];
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: att, defender: opp }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "dredge"; i++)
      s = s.pending?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "dredge", player: ap });
    expect(s.step).toBe("combatDamage");
    // B hasn't drawn yet.
    expect(hand(s, opp)).toBe(b0);
    // Dredge the first draw: the Thug comes back, four cards are milled; then the other two draws and B's three.
    const yard = s.players[ap]!.graveyard.length;
    s = act(s, { type: "dredge", player: ap, objectId: thug });
    expect(s.players[ap]!.hand).toContain(thug);
    expect(s.players[ap]!.graveyard.length).toBe(yard - 1 + 4);
    // The Thug may be offered again for the next draw: decline.
    for (let i = 0; i < 4 && s.pending?.kind === "dredge"; i++) s = act(s, { type: "dredge", player: ap });
    expect(s.pending?.kind).not.toBe("dredge");
    expect(hand(s, ap) - a0).toBe(3);
    expect(hand(s, opp) - b0).toBe(3);
    s = passUntil(s, "endCombat", ap);
    expect(s.step).toBe("endCombat");
  });

  it("a bot gives it to the opponent's biggest unblocked attacker coming at it, once blockers are declared", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const sok = putOnBattlefield(s, opp, sokrates());
    const wurm = putOnBattlefield(s, ap, crawWurm());
    const giant = putOnBattlefield(s, ap, hillGiant());
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: giant, defender: opp }, { attacker: wurm, defender: opp }] });
    for (let i = 0; i < 10 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: opp, blocks: [] });
    for (let i = 0; i < 4 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(botActions(s, opp).at(-1)).toMatchObject({ type: "activateAbility", objectId: sok, targets: [{ kind: "object", id: wurm }] });
  });
});

describe("Coram, the Undertaker", () => {
  /** A card for `pid` in `zone`. */
  const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "library") => {
    const id = putOnBattlefield(s, pid, def);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = zone;
    if (zone === "library") s.players[pid]!.library.unshift(id);
    else s.players[pid]!.graveyard.push(id);
    invalidateCharacteristics(s);
    return id;
  };
  /** A card milled from `pid`'s library this turn. */
  const milled = (s: GameState, pid: PlayerId, def: CardDef) => {
    const id = into(s, pid, def, "library");
    moveObject(s, id, "graveyard", { milled: true });
    invalidateCharacteristics(s);
    return id;
  };
  const via = { via: "turnPermission" as const };
  const legalLand = (s: GameState, pid: PlayerId, id: string) => legalActions(s, pid).some((a) => a.type === "playLand" && a.objectId === id);
  const ready = () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, coram());
    s0.players[ap]!.landsPlayedThisTurn = 0;
    return { s: s0, ap, opp, c };
  };

  it("gets +X/+0 for the greatest power among creature cards in all graveyards", () => {
    const { s, ap, opp, c } = ready();
    const base = characteristics(s, s.objects[c]!).power;
    const tough = characteristics(s, s.objects[c]!).toughness;
    into(s, opp, crawWurm(), "graveyard");
    into(s, ap, hillGiant(), "graveyard");
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[c]!).power).toBe(base + 6);
    expect(characteristics(s, s.objects[c]!).toughness).toBe(tough);
  });

  it("casts a spell from an opponent's graveyard that was put there from their library this turn: once each turn, under your control", () => {
    let { s, ap, opp } = ready();
    const giant = milled(s, opp, hillGiant());
    const wurm = milled(s, opp, crawWurm());
    const old = into(s, opp, hillGiant(), "graveyard");
    // In the graveyard since an earlier turn: not Coram's.
    expect(planCast(s, ap, old, undefined, undefined, "auto", undefined, via)).toBeNull();
    s = settle(run(s, planCast(s, ap, giant, undefined, undefined, "auto", undefined, via)));
    expect(s.objects[giant]!.zone).toBe("battlefield");
    expect(s.objects[giant]!.controller).toBe(ap);
    expect(s.objects[giant]!.owner).toBe(opp);
    // One spell a turn: the Wurm waits.
    expect(planCast(s, ap, wurm, undefined, undefined, "auto", undefined, via)).toBeNull();
  });

  it("plays a land from an opponent's graveyard milled this turn, beside the spell, as the turn's land play", () => {
    let { s, ap, opp } = ready();
    const forest = milled(s, opp, forestCard());
    const giant = milled(s, opp, hillGiant());
    expect(legalLand(s, ap, forest)).toBe(true);
    s = act(s, { type: "playLand", player: ap, objectId: forest });
    expect(s.objects[forest]!.zone).toBe("battlefield");
    expect(s.objects[forest]!.controller).toBe(ap);
    expect(s.log.at(-1)?.text).toContain("graveyard");
    // The land and the spell are separate uses.
    expect(planCast(s, ap, giant, undefined, undefined, "auto", undefined, via)).not.toBeNull();
    // The opponent can't use A's Coram for their own cards.
    expect(legalLand(s, opp, giant)).toBe(false);
  });

  it("only during your turn, and only cards put there from a library", () => {
    let { s, ap, opp } = ready();
    // A card that died this turn isn't one.
    const dead = putOnBattlefield(s, opp, hillGiant());
    moveObject(s, dead, "graveyard");
    invalidateCharacteristics(s);
    expect(planCast(s, ap, dead, undefined, undefined, "auto", undefined, via)).toBeNull();
    // On B's turn, a card milled then: no.
    s = passUntil(s, "main1", opp);
    const bolted = milled(s, opp, bolt());
    s.players[ap]!.manaPool.R = 1;
    expect(planCast(s, ap, bolted, [{ kind: "player", id: opp }], undefined, "auto", undefined, via)).toBeNull();
  });

  it("whenever it attacks, each player mills a card", () => {
    let { s, ap, c } = ready();
    const yards = s.turnOrder.map((pid) => s.players[pid]!.graveyard.length);
    s = passUntil(s, "declareAttackers", ap);
    const opp = s.turnOrder.find((pid) => pid !== ap)!;
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: c, defender: opp }] });
    s = settle(s);
    expect(s.turnOrder.map((pid) => s.players[pid]!.graveyard.length)).toEqual(yards.map((n) => n + 1));
  });

  it("a bot casts a creature card an opponent milled this turn with it", () => {
    const { s, ap, opp } = ready();
    const giant = milled(s, opp, hillGiant());
    s.players[ap]!.hand = [];
    const acts = botActions(s, ap);
    expect(acts.some((a) => a.type === "castSpell" && a.objectId === giant)).toBe(true);
  });
});
