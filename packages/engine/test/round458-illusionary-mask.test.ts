// Round 458: Illusionary Mask. Its ability lets its controller cast a creature card from their hand face down as a 2/2
// without paying its mana cost, if the mana spent on {X} could pay that cost (rulings: amount and types both count). The
// creature it becomes is turned face up instead of assigning or dealing damage, being dealt damage, or becoming tapped (a
// replacement effect, rulings; CR 614.1a, 616.1), and otherwise only by its own morph (rulings).

import { describe, expect, it } from "vitest";
import { act, addEffect, passAll, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { botActions, isFullySupported, moveObject, planCast, power, toughness, type CardDef, type GameState, type ManaType, type PlayerId } from "../src";
import { maskCanPay, type MaskMana } from "../src/effects/run-round458";

// Real card data (Scryfall).
const mask = (): CardDef => ({"oracleId":"05ac866d-0405-4d25-986a-c10fcfc097e6","name":"Illusionary Mask","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{X}: You may choose a creature card in your hand whose mana cost could be paid by some amount of, or all of, the mana you spent on {X}. If you do, you may cast that card face down as a 2/2 creature spell without paying its mana cost. If the creature that spell becomes as it resolves has not been turned face up and would assign or deal damage, be dealt damage, or become tapped, instead it's turned face up and assigns or deals damage, is dealt damage, or becomes tapped. Activate only as a sorcery.","colors":[],"colorIdentity":[],"keywords":[],"layout":"normal"}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal","power":"3","toughness":"3"}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const hands = (): CardDef => ({"oracleId":"a612f30d-cd55-438b-a7de-8c80509183aa","name":"Mending Hands","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Prevent the next 4 damage that would be dealt to any target this turn.","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;
const harrier = (): CardDef => ({"oracleId":"589d1c6e-5808-424c-a6e4-dadef90d119e","name":"Sage-Eye Harrier","manaCost":"{4}{W}","cmc":5,"typeLine":"Creature — Bird Warrior","supertypes":[],"types":["Creature"],"subtypes":["Bird","Warrior"],"oracleText":"Flying\nMorph {3}{W} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Morph"],"layout":"normal","power":"1","toughness":"5"}) as CardDef;
const aquamorph = (): CardDef => ({"oracleId":"ed47dd31-f7cd-4ecb-960f-470cb8f4ed3c","name":"Aquamorph Entity","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"As this creature enters or is turned face up, it becomes your choice of 5/1 or 1/5.\nMorph {2}{U} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)","colors":["U"],"colorIdentity":["U"],"keywords":["Morph"],"layout":"normal","power":"*","toughness":"*"}) as CardDef;
const dragon = (): CardDef => ({"oracleId":"711eea87-0fa3-46e0-a42b-fa5a86455f04","name":"Shivan Dragon","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\n{R}: This creature gets +1/+0 until end of turn.","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"layout":"normal","power":"5","toughness":"5"}) as CardDef;
const finks = (): CardDef => ({"oracleId":"5470dcfa-4eff-43da-abf7-19922841f719","name":"Kitchen Finks","manaCost":"{1}{G/W}{G/W}","cmc":3,"typeLine":"Creature — Ouphe","supertypes":[],"types":["Creature"],"subtypes":["Ouphe"],"oracleText":"When this creature enters, you gain 2 life.\nPersist (When this creature dies, if it had no -1/-1 counters on it, return it to the battlefield under its owner's control with a -1/-1 counter on it.)","colors":["G","W"],"colorIdentity":["G","W"],"keywords":["Persist"],"layout":"normal","power":"3","toughness":"2"}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal","power":"2","toughness":"2"}) as CardDef;
const fog = (): CardDef => ({"oracleId":"27e9db49-7af7-4bef-ad4c-bf5dfb92030d","name":"Fog","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Prevent all combat damage that would be dealt this turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;

const nameOf = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
const m = (spec: string): MaskMana[] => spec.split("").map((c) => (c === "s" ? { type: "C", snow: true } : { type: c as ManaType, snow: false }));
const ptOf = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const pend = (s: GameState) => s.pending;

/** Activate the Mask for X = the mana in `pool` (put in the activator's pool, so it's what's spent). */
function activateMask(s: GameState, pid: PlayerId, maskId: string, pool: Partial<Record<ManaType, number>>) {
  const p = s.players[pid]!;
  for (const k of Object.keys(p.manaPool) as ManaType[]) p.manaPool[k] = 0;
  let x = 0;
  for (const [k, n] of Object.entries(pool)) {
    p.manaPool[k as ManaType] = n!;
    x += n!;
  }
  return act(s, { type: "activateAbility", player: pid, objectId: maskId, index: 0, x });
}

/** Pass until the Mask's ability asks for a card, choose `choice` (a card id or "none"). */
function chooseCard(s: GameState, choice: string) {
  s = passAll(s);
  const p = s.pending;
  if (p?.kind !== "chooseOption" || p.what !== "maskCard") throw new Error(`no mask card question: ${JSON.stringify(p)?.slice(0, 300)}`);
  return act(s, { type: "chooseOption", player: p.player, choice });
}

/** Cast the chosen card face down (the castFree offer), and let it resolve. */
function castFaceDown(s: GameState, pid: PlayerId, id: string) {
  const p = s.pending;
  if (p?.kind !== "castFree" || p.how !== "mask") throw new Error(`no mask cast offer: ${JSON.stringify(p)?.slice(0, 300)}`);
  const plan = planCast(s, pid, id, undefined, undefined, "auto", undefined, { faceDown: true });
  if (!plan) throw new Error("can't cast it face down");
  for (const a of plan) s = act(s, a);
  return passAll(s);
}

/** A game with Illusionary Mask out and `hand` in hand; X = R+CCC cast `which` face down. */
function masked(hand: CardDef[], which = 0, pool: Partial<Record<ManaType, number>> = { R: 1, C: 3 }) {
  const { s: s0, ap, ids, opp } = setup(hand);
  const maskId = putOnBattlefield(s0, ap, mask());
  let s = activateMask(s0, ap, maskId, pool);
  s = chooseCard(s, ids[which]!);
  s = castFaceDown(s, ap, ids[which]!);
  return { s, ap, ids, opp, maskId, id: ids[which]! };
}

const castAt = (s: GameState, pid: PlayerId, id: string, to?: string) => {
  const plan = planCast(s, pid, id, to ? [target(to)] : undefined);
  if (!plan) throw new Error(`can't cast ${nameOf(s, id)}`);
  return passAll(plan.reduce((x, a) => act(x, a), s));
};

describe("Illusionary Mask (round 458)", () => {
  it("is fully supported", () => {
    expect(isFullySupported(mask())).toBe(true);
  });

  it("counts the amount and the types of the mana spent on X (rulings)", () => {
    // Rulings: {U}{U} spent can pay {U}{U}, {1}{U} or {2}, not {2}{U} or {G}.
    expect(maskCanPay("{U}{U}", m("UU"))).toBe(true);
    expect(maskCanPay("{1}{U}", m("UU"))).toBe(true);
    expect(maskCanPay("{2}", m("UU"))).toBe(true);
    expect(maskCanPay("{2}{U}", m("UU"))).toBe(false);
    expect(maskCanPay("{G}", m("UU"))).toBe(false);
    // Some of the mana is enough; hybrid takes either half; {2/U} one blue or two of any type.
    expect(maskCanPay("{U}", m("UUR"))).toBe(true);
    expect(maskCanPay("{W/U}{W/U}", m("UW"))).toBe(true);
    expect(maskCanPay("{W/U}", m("R"))).toBe(false);
    expect(maskCanPay("{2/U}", m("RC"))).toBe(true);
    expect(maskCanPay("{2/U}", m("R"))).toBe(false);
    expect(maskCanPay("{C/U}", m("C"))).toBe(true);
    // Phyrexian mana takes only its color (life isn't mana spent); {S} only mana from a snow source; {X} is 0.
    expect(maskCanPay("{U/P}", m("R"))).toBe(false);
    expect(maskCanPay("{U/P}", m("U"))).toBe(true);
    expect(maskCanPay("{S}", m("C"))).toBe(false);
    expect(maskCanPay("{S}", m("s"))).toBe(true);
    expect(maskCanPay("{X}{R}", m("R"))).toBe(true);
    // No mana cost is an unpayable one (CR 118.6); the cap is the mana that paid X itself.
    expect(maskCanPay("", m("UUUU"))).toBe(false);
    expect(maskCanPay("{3}", m("UUU"), 2)).toBe(false);
  });

  it("offers only the creature cards the mana could pay for, and casts the chosen one face down as a 2/2", () => {
    const { s: s0, ap, ids } = setup([giant(), dragon(), shock(), bears()]);
    const maskId = putOnBattlefield(s0, ap, mask());
    let s = passAll(activateMask(s0, ap, maskId, { R: 1, C: 3 }));
    const p = pend(s);
    expect(p?.kind === "chooseOption" && p.what).toBe("maskCard");
    if (p?.kind !== "chooseOption") return;
    expect(p.player).toBe(ap);
    expect(p.secret).toBe(true);
    // Hill Giant ({3}{R}) fits; Shivan Dragon costs too much, Grizzly Bears needs {G}, Shock isn't a creature.
    expect(p.options).toEqual([ids[0], "none"]);
    expect(p.labels).toEqual(["Hill Giant", "Don't choose a card"]);
    s = act(s, { type: "chooseOption", player: ap, choice: ids[0]! });
    s = castFaceDown(s, ap, ids[0]!);
    const o = s.objects[ids[0]!]!;
    expect(o.zone).toBe("battlefield");
    expect(o.faceDown).toBeTruthy();
    expect(o.maskFaceUp).toBe(true);
    expect(ptOf(s, ids[0]!)).toBe("2/2");
    expect(s.players[ap]!.hand.filter((h) => ids.includes(h))).toEqual([ids[1], ids[2], ids[3]]);
  });

  it("leaves the card in hand when no card or no cast is chosen", () => {
    const { s: s0, ap, ids } = setup([giant()]);
    const maskId = putOnBattlefield(s0, ap, mask());
    const none = chooseCard(activateMask(s0, ap, maskId, { R: 1, C: 3 }), "none");
    expect(none.pending).toBeNull();
    expect(none.players[ap]!.hand).toContain(ids[0]);
    const chosen = chooseCard(activateMask(s0, ap, maskId, { R: 1, C: 3 }), ids[0]!);
    const p = chosen.pending;
    expect(p?.kind === "castFree" && p.how).toBe("mask");
    const declined = passAll(act(chosen, { type: "chooseMay", player: ap, yes: false }));
    expect(declined.players[ap]!.hand).toContain(ids[0]);
    expect(declined.stack.length).toBe(0);
  });

  it("turns face up instead of becoming tapped: attacking taps it as a 3/3", () => {
    const { s: s0, ap, opp, id } = masked([giant()]);
    s0.objects[id]!.controlledSinceTurn = -1;
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: id, defender: opp }] });
    const o = s.objects[id]!;
    expect(o.faceDown).toBeFalsy();
    expect(o.tapped).toBe(true);
    expect(o.maskFaceUp).toBeFalsy();
    expect(ptOf(s, id)).toBe("3/3");
  });

  it("turns face up instead of being dealt damage, so Shock doesn't kill it", () => {
    const { s: s0, ap, ids, id } = masked([giant(), shock()]);
    const s = castAt(s0, ap, ids[1]!, id);
    const o = s.objects[id]!;
    expect(o.zone).toBe("battlefield");
    expect(o.faceDown).toBeFalsy();
    expect(o.damage).toBe(2);
    expect(ptOf(s, id)).toBe("3/3");
  });
  it("asks which applies first when the damage to it would be prevented (CR 616.1)", () => {
    const { s: s0, ap, ids, id } = masked([giant(), hands(), shock()]);
    let s = castAt(s0, ap, ids[1]!, id);
    expect(s.objects[id]!.faceDown).toBeTruthy(); // Mending Hands' shield is no damage
    s = passAll(planCast(s, ap, ids[2]!, [target(id)])!.reduce((x, a) => act(x, a), s));
    const p = s.pending;
    expect(p?.kind === "chooseOption" && p.what).toBe("moveInstead");
    if (p?.kind !== "chooseOption") return;
    expect(p.player).toBe(ap);
    expect(p.options).toEqual(["up", "prevent"]);
    // Prevented first: no damage is dealt to it, so it stays face down.
    const kept = passAll(act(s, { type: "chooseOption", player: ap, choice: "prevent" }));
    expect(kept.objects[id]!.faceDown).toBeTruthy();
    expect(kept.objects[id]!.damage).toBe(0);
    // Turned face up first, then the damage is prevented.
    const up = passAll(act(s, { type: "chooseOption", player: ap, choice: "up" }));
    expect(up.objects[id]!.faceDown).toBeFalsy();
    expect(up.objects[id]!.damage).toBe(0);
    expect(ptOf(up, id)).toBe("3/3");
    // A bot prevents it first.
    expect(botActions(s, ap)).toEqual([{ type: "chooseOption", player: ap, choice: "prevent" }]);
  });

  it("turns face up instead of assigning combat damage, and assigns it as a 3/3 (vigilance, so it never tapped)", () => {
    const { s: s0, ap, opp, id } = masked([giant()]);
    s0.objects[id]!.controlledSinceTurn = -1;
    addEffect(s0, ap, [id], [{ kind: "addKeywords", keywords: ["Vigilance"] }]);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: id, defender: opp }] });
    expect(s.objects[id]!.faceDown).toBeTruthy();
    expect(s.objects[id]!.tapped).toBe(false);
    const life = s.players[opp]!.life;
    s = passUntil(s, "main2", ap);
    expect(s.objects[id]!.faceDown).toBeFalsy();
    expect(s.players[opp]!.life).toBe(life - 3);
  });

  it("can't be turned face up any other way unless the card has morph, then for its morph cost", () => {
    const { s: g, ap: ga, id: gid } = masked([giant()]);
    expect(() => act(g, { type: "turnFaceUp", player: ga, objectId: gid })).toThrow();
    const { s, ap, id } = masked([harrier()], 0, { W: 1, C: 4 });
    expect(s.objects[id]!.maskFaceUp).toBe(true);
    Object.assign(s.players[ap]!.manaPool, { W: 1, C: 3 });
    const t = act(s, { type: "turnFaceUp", player: ap, objectId: id });
    expect(t.objects[id]!.faceDown).toBeFalsy();
    expect(ptOf(t, id)).toBe("1/5");
  });

  it("keeps applying after Illusionary Mask leaves the battlefield (rulings)", () => {
    const { s: s0, ap, ids, id, maskId } = masked([giant(), shock()]);
    moveObject(s0, maskId, "graveyard");
    const s = castAt(s0, ap, ids[1]!, id);
    expect(s.objects[id]!.faceDown).toBeFalsy();
    expect(s.objects[id]!.zone).toBe("battlefield");
  });

  it("asks Aquamorph Entity's form as it's turned face up, in the middle of the damage", () => {
    const { s: s0, ap, ids, id } = masked([aquamorph(), shock()], 0, { U: 2, C: 2 });
    let s = planCast(s0, ap, ids[1]!, [target(id)])!.reduce((x, a) => act(x, a), s0);
    s = passAll(s);
    const p = s.pending;
    expect(p?.kind === "chooseOption" && p.what).toBe("moveInstead");
    if (p?.kind !== "chooseOption") return;
    expect(p.options).toEqual(["0", "1"]);
    const t = passAll(act(s, { type: "chooseOption", player: ap, choice: "1" }));
    expect(ptOf(t, id)).toBe("1/5");
    expect(t.objects[id]!.damage).toBe(2);
    expect(t.objects[id]!.zone).toBe("battlefield");
  });

  it("is answered by bots: the highest mana value card, cast face down", () => {
    const { s: s0, ap, ids } = setup([bears(), giant(), finks()]);
    const maskId = putOnBattlefield(s0, ap, mask());
    let s = passAll(activateMask(s0, ap, maskId, { R: 1, G: 2, W: 1 }));
    const [pick] = botActions(s, ap);
    expect(pick).toEqual({ type: "chooseOption", player: ap, choice: ids[1] });
    s = act(s, pick!);
    for (const a of botActions(s, ap)) s = act(s, a);
    s = passAll(s);
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[1]!]!.faceDown).toBeTruthy();
  });
});
