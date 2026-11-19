// Round 425 (Lane A): Redemptor Dreadnought ("Fallen Warrior — As an additional cost to cast this spell, you may exile a
// creature card from your graveyard." and "Plasma Incinerator — Whenever this creature attacks, if a card is exiled with
// it, it gets +X/+X until end of turn, where X is the power of the exiled card.", CR 601.2b, 607.2q, 603.4) and Kaya,
// Spirits' Justice (a token becoming a copy of a creature card exiled from the battlefield or your graveyard, CR 603.2c,
// 707.2, 707.9a; its −2's target for each other player, CR 102.3, 601.2c).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { invalidateCharacteristics } from "../src/layers";
import { applyAction, botActions, characteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const bojukabo = (): CardDef => ({"oracleId":"04b7362d-0490-4cb0-b5d7-2a7732f659ce","name":"Bojuka Bog","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"This land enters tapped.\nWhen this land enters, exile target player's graveyard.\n{T}: Add {B}.","colors":[],"colorIdentity":["B"],"keywords":[],"producedMana":["B"],"commanderLegal":"legal","layout":"normal"} as CardDef);
const raisedea = (): CardDef => ({"oracleId":"cbc9c731-181a-4f00-a7b0-eb7e56eac2ea","name":"Raise Dead","manaCost":"{B}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Return target creature card from your graveyard to your hand.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","layout":"normal"} as CardDef);
const swordsto = (): CardDef => ({"oracleId":"b1544f21-7e98-461b-aed5-e748b0168c52","name":"Swords to Plowshares","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Exile target creature. Its controller gains life equal to its power.","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","layout":"normal"} as CardDef);
const redempto = (): CardDef => ({"oracleId":"bcd48403-7c4b-4b57-8a28-4007b36fe4d7","name":"Redemptor Dreadnought","manaCost":"{5}","cmc":5,"typeLine":"Artifact Creature — Astartes Dreadnought","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Astartes","Dreadnought"],"oracleText":"Fallen Warrior — As an additional cost to cast this spell, you may exile a creature card from your graveyard.\nTrample\nPlasma Incinerator — Whenever this creature attacks, if a card is exiled with it, it gets +X/+X until end of turn, where X is the power of the exiled card.","power":"4","toughness":"4","colors":[],"colorIdentity":[],"keywords":["Trample","Plasma Incinerator","Fallen Warrior"],"commanderLegal":"legal","layout":"normal"} as CardDef);
const kayaspir = (): CardDef => ({"oracleId":"0a094c5f-cefb-4ba1-90c8-dd78ae8efe95","name":"Kaya, Spirits' Justice","manaCost":"{2}{W}{B}","cmc":4,"typeLine":"Legendary Planeswalker — Kaya","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Kaya"],"oracleText":"Whenever one or more creatures you control and/or creature cards in your graveyard are put into exile, you may choose a creature card from among them. Until end of turn, target token you control becomes a copy of it, except it has flying.\n+2: Surveil 2, then exile a card from a graveyard.\n+1: Create a 1/1 white and black Spirit creature token with flying.\n−2: Exile target creature you control. For each other player, exile up to one target creature that player controls.","loyalty":"3","colors":["B","W"],"colorIdentity":["B","W"],"keywords":["Surveil"],"commanderLegal":"legal","layout":"normal"} as CardDef);
const serraang = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"commanderLegal":"legal","layout":"normal"} as CardDef);
const hillgian = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","layout":"normal"} as CardDef);
const grizzlyb = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","layout":"normal"} as CardDef);
const tarmogoy = (): CardDef => ({"oracleId":"45900b2f-f6a9-4c42-9642-008f3c1cf6dd","name":"Tarmogoyf","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Lhurgoyf","supertypes":[],"types":["Creature"],"subtypes":["Lhurgoyf"],"oracleText":"Tarmogoyf's power is equal to the number of card types among cards in all graveyards and its toughness is equal to that number plus 1.","power":"*","toughness":"1+*","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","layout":"normal"} as CardDef);
const spiritToken = (): CardDef => ({ oracleId: "test-spirit-token", name: "Spirit", manaCost: "", cmc: 0, typeLine: "Token Creature — Spirit", supertypes: [], types: ["Creature"], subtypes: ["Spirit"], oracleText: "Flying", power: "1", toughness: "1", colors: ["W", "B"], colorIdentity: [], keywords: ["Flying"], layout: "token" } as unknown as CardDef);

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: ObjectId): TargetChoice => ({ kind: "object", id });
const NONE: TargetChoice = { kind: "none" };
/** Everyone passes until the stack is empty; stops at any question but Kaya's trigger's target, answered with `tok`. */
const settle = (s: GameState, tok?: ObjectId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending?.kind === "chooseTargets" && tok !== undefined && s.pending.description.includes("Kaya")) s = act(s, { type: "chooseTargets", player: s.pending.player, targets: [tgt(tok)] });
    else if (s.pending) return s;
    else
      s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Each opponent of `ap` in the order "for each opponent" targets are chosen: turn order after `ap` (expandPerOpponent). */
const opponentsInOrder = (s: GameState, ap: PlayerId) => {
  const i = s.turnOrder.indexOf(ap);
  return [...s.turnOrder.slice(i + 1), ...s.turnOrder.slice(0, i)];
};
/** `pid`'s cards in their graveyard or hand. */
function place(s: GameState, pid: PlayerId, zone: "graveyard" | "hand", defs: CardDef[]) {
  const ids = defs.map((def) => {
    const id = putOnBattlefield(s, pid, def);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = zone;
    return id;
  });
  s.players[pid]![zone].push(...ids);
  invalidateCharacteristics(s);
  return ids;
}
const token = (s: GameState, pid: PlayerId) => {
  const id = putOnBattlefield(s, pid, spiritToken());
  s.objects[id]!.isToken = true;
  invalidateCharacteristics(s);
  return id;
};
const name = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).name;
const pt = (s: GameState, id: ObjectId) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const copyOptions = (s: GameState) => (s.pending?.kind === "chooseOption" && s.pending.what === "copyAmong" ? s.pending.options : undefined);
const choose = (s: GameState, choice: string, tok?: ObjectId) => settle(act(s, { type: "chooseOption", player: (s.pending as { player: PlayerId }).player, choice }), tok);
/** Attack with `attacker` and let its attack trigger resolve. */
function attack(s0: GameState, ap: PlayerId, attacker: ObjectId, defender: PlayerId) {
  let s = passUntil(s0, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender }] });
  return settle(s);
}

describe("round 425: compiles", () => {
  it("every card of the round", () => {
    for (const d of [redempto(), kayaspir()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("Redemptor Dreadnought", () => {
  it("paid: Serra Angel exiled as it's cast; attacking, it gets +4/+4 (the exiled card's power)", () => {
    const { s: s0, ap, opp, ids } = setup([redempto()]);
    const [serra] = place(s0, ap, "graveyard", [serraang()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { kicks: [0], exileCards: [serra!] })));
    expect(s.objects[serra!]!.zone).toBe("exile");
    const rd = ids[0]!;
    expect(s.objects[rd]!.zone).toBe("battlefield");
    expect(pt(s, rd)).toBe("4/4");
    s.objects[rd]!.controlledSinceTurn = -1;
    s = attack(s, ap, rd, opp);
    expect(s.log.some((l) => /Redemptor Dreadnought's ability triggers/.test(l.text))).toBe(true);
    expect(pt(s, rd)).toBe("8/8");
  });

  it("not paid: nothing is exiled with it, so the attack trigger doesn't trigger (CR 603.4)", () => {
    const { s: s0, ap, opp, ids } = setup([redempto()]);
    const [serra] = place(s0, ap, "graveyard", [serraang()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[serra!]!.zone).toBe("graveyard");
    const rd = ids[0]!;
    s.objects[rd]!.controlledSinceTurn = -1;
    s = attack(s, ap, rd, opp);
    expect(pt(s, rd)).toBe("4/4");
    expect(s.log.some((l) => /Redemptor Dreadnought's ability triggers/.test(l.text))).toBe(false);
  });

  it("the exiled card back in a graveyard: no card is exiled with it any more (CR 400.7, 607.2q)", () => {
    const { s: s0, ap, opp, ids } = setup([redempto()]);
    const [giant] = place(s0, ap, "graveyard", [hillgian()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { kicks: [0], exileCards: [giant!] })));
    expect(s.objects[giant!]!.zone).toBe("exile");
    // The card leaves exile and comes back: a new object, not the one exiled with it.
    const g = s.objects[giant!]!;
    s.players[ap]!.exile = s.players[ap]!.exile?.filter((x) => x !== giant);
    g.zone = "graveyard";
    g.zoneChanges = (g.zoneChanges ?? 0) + 1;
    s.players[ap]!.graveyard.push(giant!);
    invalidateCharacteristics(s);
    const rd = ids[0]!;
    s.objects[rd]!.controlledSinceTurn = -1;
    s = attack(s, ap, rd, opp);
    expect(pt(s, rd)).toBe("4/4");
  });

  it("a characteristic-defining power counts in exile (CR 604.3): Tarmogoyf's", () => {
    const { s: s0, ap, opp, ids } = setup([redempto()]);
    const [goyf] = place(s0, ap, "graveyard", [tarmogoy()]);
    // An instant and a sorcery-less graveyard: Swords to Plowshares (instant) and Hill Giant (creature) in a graveyard.
    place(s0, opp, "graveyard", [swordsto(), hillgian()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { kicks: [0], exileCards: [goyf!] })));
    const rd = ids[0]!;
    s.objects[rd]!.controlledSinceTurn = -1;
    s = attack(s, ap, rd, opp);
    // Tarmogoyf in exile: its power counted by its own ability there (instant and creature in the graveyards at least).
    const goyfPower = power(s, s.objects[goyf!]!);
    expect(goyfPower).toBeGreaterThanOrEqual(2);
    expect(pt(s, rd)).toBe(`${4 + goyfPower}/${4 + goyfPower}`);
  });
});

describe("Kaya, Spirits' Justice", () => {
  const kaya = (s: GameState, ap: PlayerId) => {
    const k = putOnBattlefield(s, ap, kayaspir());
    s.objects[k]!.counters = { loyalty: 3 };
    invalidateCharacteristics(s);
    return k;
  };

  it("Swords to Plowshares on your Hill Giant: your Spirit token becomes a Hill Giant with flying until end of turn", () => {
    const { s: s0, ap, ids } = setup([swordsto()]);
    kaya(s0, ap);
    const sp = token(s0, ap);
    const giant = putOnBattlefield(s0, ap, hillgian());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(giant)])), sp);
    expect(s.objects[giant]!.zone).toBe("exile");
    expect(copyOptions(s)).toEqual([giant, "none"]);
    s = choose(s, giant);
    expect(name(s, sp)).toBe("Hill Giant");
    expect(pt(s, sp)).toBe("3/3");
    expect(objHasKeyword(s, s.objects[sp]!, "flying")).toBe(true);
    expect(s.objects[sp]!.isToken).toBe(true);
    // Until end of turn (CR 611.2a, 514.2).
    s = passUntil(s, "upkeep");
    expect(name(s, sp)).toBe("Spirit");
    expect(pt(s, sp)).toBe("1/1");
  });

  it("may choose none: the token stays a Spirit", () => {
    const { s: s0, ap, ids } = setup([swordsto()]);
    kaya(s0, ap);
    const sp = token(s0, ap);
    const giant = putOnBattlefield(s0, ap, hillgian());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(giant)])), sp);
    s = choose(s, "none");
    expect(name(s, sp)).toBe("Spirit");
  });

  it("creature cards exiled from your graveyard at once (Bojuka Bog): one trigger, any one of the creature cards", () => {
    const { s: s0, ap, ids } = setup([bojukabo()]);
    kaya(s0, ap);
    const sp = token(s0, ap);
    const [serra, giant, swords] = place(s0, ap, "graveyard", [serraang(), hillgian(), swordsto()]);
    let s = act(s0, { type: "playLand", player: ap, objectId: ids[0]! });
    // Bojuka Bog's target: you.
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: ap }] }), sp);
    expect([serra, giant, swords].map((id) => s.objects[id!]!.zone)).toEqual(["exile", "exile", "exile"]);
    const opts = copyOptions(s);
    expect(opts).toBeDefined();
    expect([...opts!].sort()).toEqual([serra!, giant!, "none"].sort());
    s = choose(s, serra!);
    expect(name(s, sp)).toBe("Serra Angel");
    expect(pt(s, sp)).toBe("4/4");
    expect(objHasKeyword(s, s.objects[sp]!, "vigilance")).toBe(true);
  });

  it("an opponent's creature exiled doesn't trigger it; nor does yours without a token to target (CR 603.3d)", () => {
    const { s: s0, ap, opp, ids } = setup([swordsto(), swordsto()]);
    kaya(s0, ap);
    const theirs = putOnBattlefield(s0, opp, hillgian());
    const mine = putOnBattlefield(s0, ap, grizzlyb());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(theirs)])));
    expect(s.objects[theirs]!.zone).toBe("exile");
    expect(copyOptions(s)).toBeUndefined();
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(mine)])));
    expect(s.objects[mine]!.zone).toBe("exile");
    expect(copyOptions(s)).toBeUndefined();
    expect(s.stack.length).toBe(0);
  });

  it("a card no longer in exile as it resolves can't be chosen (rulings)", () => {
    const { s: s0, ap, ids } = setup([swordsto()]);
    kaya(s0, ap);
    const sp = token(s0, ap);
    const giant = putOnBattlefield(s0, ap, hillgian());
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(giant)]));
    // Swords resolves; Kaya's trigger goes on the stack, targeting the Spirit.
    for (let i = 0; i < 50 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(sp)] });
    expect(s.stack.some((x) => x.kind === "ability")).toBe(true);
    expect(s.objects[giant]!.zone).toBe("exile");
    // The Hill Giant card leaves exile in response (as Pull from Eternity would).
    const g = s.objects[giant]!;
    s.players[ap]!.exile = s.players[ap]!.exile?.filter((x) => x !== giant);
    g.zone = "graveyard";
    g.zoneChanges = (g.zoneChanges ?? 0) + 1;
    s.players[ap]!.graveyard.push(giant);
    invalidateCharacteristics(s);
    s = settle(s, sp);
    expect(copyOptions(s)).toBeUndefined();
    expect(name(s, sp)).toBe("Spirit");
  });

  it("−2: your creature and one creature of each other player exiled; yours triggers its first ability", () => {
    const { s: s0, ap } = setup([]);
    const k = kaya(s0, ap);
    const sp = token(s0, ap);
    const mine = putOnBattlefield(s0, ap, serraang());
    const theirs = opponentsInOrder(s0, ap).map((p) => putOnBattlefield(s0, p, hillgian()));
    // One opponent's creature left alone: "up to one".
    let s = settle(run(s0, planActivate(s0, ap, k, 2, [tgt(mine), tgt(theirs[0]!), NONE, tgt(theirs[2]!)])), sp);
    expect(s.objects[k]!.counters.loyalty).toBe(1);
    expect([mine, ...theirs].map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile", "battlefield", "exile"]);
    expect(copyOptions(s)).toEqual([mine, "none"]);
    s = choose(s, mine, sp);
    expect(name(s, sp)).toBe("Serra Angel");
  });

  it("−2: a target for each opponent that is controlled by another opponent is illegal", () => {
    const { s: s0, ap } = setup([]);
    const k = kaya(s0, ap);
    const mine = putOnBattlefield(s0, ap, serraang());
    const theirs = opponentsInOrder(s0, ap).map((p) => putOnBattlefield(s0, p, hillgian()));
    expect(() => act(s0, { type: "activateAbility", player: ap, objectId: k, index: 2, targets: [tgt(mine), tgt(theirs[1]!), NONE, NONE] })).toThrow(/illegal target|target/);
  });

  it("bots: the token copies the biggest card, not compared with Kaya", () => {
    const { s: s0, ap, ids } = setup([swordsto()]);
    kaya(s0, ap);
    const sp = token(s0, ap);
    const serra = putOnBattlefield(s0, ap, serraang());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(serra)])), sp);
    expect(copyOptions(s)).toBeDefined();
    s = settle(botActions(s, ap).reduce((x, a) => act(x, a), s));
    expect(name(s, sp)).toBe("Serra Angel");
  });
});

describe("Redemptor Dreadnought: bots", () => {
  it("a bot casting it exiles a creature card from its graveyard when it has one", () => {
    const { s: s0, ap, ids } = setup([redempto()]);
    s0.players[ap]!.isBot = true;
    const [serra] = place(s0, ap, "graveyard", [serraang()]);
    // The bot's main phase, one decision at a time, until it casts it.
    let s = s0;
    for (let i = 0; i < 30 && s.objects[ids[0]!]!.zone === "hand" && waitingOn(s) === ap; i++) s = botActions(s, ap).reduce((x, a) => act(x, a), s);
    expect(s.objects[ids[0]!]!.zone).not.toBe("hand");
    expect(s.objects[serra!]!.zone).toBe("exile");
  });
});
