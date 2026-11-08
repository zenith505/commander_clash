// Round 313 (Lane A, skip-list cards): paying to ignore an effect until end of turn, a special action (CR 116.2d): Leonin
// Arbiter (anyone pays {2}), Lost in Thought (the enchanted creature's controller exiles three cards from their graveyard)
// and Volrath's Curse (the enchanted creature's controller sacrifices a permanent).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, applyAction, castProblem, controlsMostPermanents, landsAllowed, botActions, potentialAttackers, ignorableBy, ignoreEffectProblem, invalidateCharacteristics, isFullySupported, legalActions, planCast, planIgnoreEffect, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

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
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
/** A copy of `def` in `pid`'s hand or graveyard. */
const inZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const canAttack = (s: GameState, id: string) => potentialAttackers(s, s.objects[id]!.controller).some((o) => o.id === id);
const attach = (s: GameState, aura: string, host: string) => {
  s.objects[aura]!.attachedTo = host;
  invalidateCharacteristics(s);
};

// Real oracle text (Scryfall).
const arbiter = (): CardDef => ({"oracleId":"a33f6070-590c-4be8-9180-b1ac2608cbc4","name":"Leonin Arbiter","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Cat Cleric","supertypes":[],"types":["Creature"],"subtypes":["Cat","Cleric"],"oracleText":"Players can't search libraries. Any player may pay {2} for that player to ignore this effect until end of turn.","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"});
const lost = (): CardDef => ({"oracleId":"820ba630-c543-491c-8c77-ada69b01c79d","name":"Lost in Thought","manaCost":"{1}{U}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block, and its activated abilities can't be activated. Its controller may exile three cards from their graveyard for that player to ignore this effect until end of turn.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"layout":"normal"});
const curse = (): CardDef => ({"oracleId":"f4ff3efb-c9ed-4451-a7f2-5ff52ffb6cab","name":"Volrath's Curse","manaCost":"{1}{U}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block, and its activated abilities can't be activated. That creature's controller may sacrifice a permanent of their choice for that player to ignore this effect until end of turn.\n{1}{U}: Return this Aura to its owner's hand.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"layout":"normal"});
const damping = (): CardDef => ({"oracleId":"3584a055-5220-4721-89f8-de33f779122f","name":"Damping Engine","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"A player who controls more permanents than each other player can't play lands or cast artifact, creature, or enchantment spells. That player may sacrifice a permanent of their choice for that player to ignore this effect until end of turn.","colors":[],"colorIdentity":[],"keywords":[],"layout":"normal"});
const growth = (): CardDef => ({"oracleId":"8539f295-5d58-4436-a73a-b9277c4c7795","name":"Rampant Growth","manaCost":"{1}{G}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"});

const pinger = () => bear({ name: "Test Pinger", oracleText: "{T}: Test Pinger deals 1 damage to any target.", power: "3", toughness: "3" });
const forestsOnField = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === "Forest").length;

describe("round 313", () => {
  it("are fully supported", () => supported(arbiter(), lost(), curse(), damping()));
});

describe("round 313: Leonin Arbiter", () => {
  it("stops every player's search until that player pays {2}, then only them, this turn; each Arbiter is paid for on its own", () => {
    const { s: s0, ap, opp, ids } = setup([growth(), growth()]);
    const a1 = putOnBattlefield(s0, opp, arbiter());
    let s = s0;
    // Rampant Growth finds nothing (and still shuffles), with the Arbiter's effect not ignored.
    const before = forestsOnField(s, ap);
    s = settle(run(s, planCast(s, ap, ids[0]!)), ap);
    expect(s.pending).toBeFalsy();
    expect(forestsOnField(s, ap)).toBe(before);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    // Paying {2}: a special action, any time they have priority (CR 116.2d), the opponent's Arbiter as well.
    expect(ignorableBy(s, ap, a1)?.mana).toBe("{2}");
    expect(ignoreEffectProblem(s, ap, a1)).toMatch(/not enough mana/);
    expect(legalActions(s, ap).some((a) => a.type === "ignoreEffect")).toBe(false);
    s = run(s, planIgnoreEffect(s, ap, a1));
    expect(s.stack.length).toBe(0);
    expect(s.priority).toBe(ap);
    expect(s.log.some((l) => /pays \{2\} to ignore Leonin Arbiter's effect this turn/.test(typeof l === "string" ? l : JSON.stringify(l)))).toBe(true);
    // Once paid: not again this turn.
    expect(ignorableBy(s, ap, a1)).toBeUndefined();
    expect(planIgnoreEffect(s, ap, a1)).toBeNull();
    // A second Arbiter needs paying for too (rulings).
    const a2 = putOnBattlefield(s, opp, arbiter());
    s.players[ap]!.manaPool.G = 2;
    expect(planCast(s, ap, ids[1]!)).not.toBeNull();
    s.players[ap]!.manaPool.C = 2;
    s = act(s, { type: "ignoreEffect", player: ap, objectId: a2 });
    s = settle(run(s, planCast(s, ap, ids[1]!)), ap);
    expect(s.pending?.kind).toBe("searchLibrary");
    const found = s.pending!.kind === "searchLibrary" ? s.pending!.cards[0]! : "";
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [found] }), ap);
    expect(zone(s, found)).toBe("battlefield");
    // Only the player who paid: the opponent is still barred, and next turn the payer is again.
    expect(ignorableBy(s, opp, a1)).toBeDefined();
    s.turn += 1;
    invalidateCharacteristics(s);
    expect(ignorableBy(s, ap, a1)).toBeDefined();
  });

  it("is a special action only with priority, and the bot pays when it has a search spell and the mana for both", () => {
    const { s: s0, ap, opp, ids } = setup([growth()]);
    const a1 = putOnBattlefield(s0, opp, arbiter());
    let s = s0;
    // Not while a choice is pending or without priority.
    expect(ignoreEffectProblem(s, opp, a1)).toMatch(/priority/);
    // The bot (here the active player) with Rampant Growth in hand: pays {2} first, then casts it and finds a land.
    const before = forestsOnField(s, ap);
    for (let i = 0; i < 12 && zone(s, ids[0]!) === "hand"; i++) {
      s = run(s, botActions(s, waitingOn(s)!));
    }
    expect(s.log.some((l) => /pays \{2\} to ignore Leonin Arbiter's effect/.test(typeof l === "string" ? l : JSON.stringify(l)))).toBe(true);
    s = settle(s);
    expect(forestsOnField(s, ap)).toBe(before + 1);
  });
});

describe("round 313: Lost in Thought", () => {
  it("keeps the creature from attacking and its abilities from being activated, until its controller exiles three cards from their graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    const host = putOnBattlefield(s0, ap, pinger());
    const aura = putOnBattlefield(s0, opp, lost());
    attach(s0, aura, host);
    let s = s0;
    expect(canAttack(s, host)).toBe(false);
    expect(abilityProblem(s, ap, host, 0, [{ kind: "player", id: opp }])).not.toBeNull();
    // Only the enchanted creature's controller may take the action, not the Aura's controller.
    expect(ignorableBy(s, opp, aura)).toBeUndefined();
    expect(ignoreEffectProblem(s, ap, aura)).toMatch(/graveyard|exile/i);
    const cards = [0, 1, 2].map((i) => inZone(s, ap, card(`Test Yard ${i}`, "Sorcery", "{1}"), "graveyard"));
    expect(ignoreEffectProblem(s, ap, aura, { exileCards: cards.slice(0, 2) })).not.toBeNull();
    // With the cards chosen: no stack, and the creature attacks and taps for its ability this turn.
    s = act(s, { type: "ignoreEffect", player: ap, objectId: aura, costs: { exileCards: cards } });
    expect(cards.every((id) => zone(s, id) === "exile")).toBe(true);
    expect(s.stack.length).toBe(0);
    expect(canAttack(s, host)).toBe(true);
    expect(abilityProblem(s, ap, host, 0, [{ kind: "player", id: opp }])).toBeNull();
    // Next turn it applies again.
    s.turn += 1;
    invalidateCharacteristics(s);
    expect(canAttack(s, host)).toBe(false);
  });

  it("the bot exiles its three least useful graveyard cards in its first main phase to attack with a big creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const host = putOnBattlefield(s0, ap, pinger());
    const aura = putOnBattlefield(s0, opp, lost());
    attach(s0, aura, host);
    const yard = [inZone(s0, ap, card("Test Spell", "Sorcery", "{5}", { cmc: 5 }), "graveyard"), ...[0, 1, 2].map((i) => inZone(s0, ap, card(`Test Land ${i}`, "Land"), "graveyard"))];
    let s = s0;
    for (let i = 0; i < 40 && !s.objects[yard[1]!]!.zone.startsWith("exile"); i++) s = run(s, botActions(s, waitingOn(s)!));
    expect(yard.slice(1).every((id) => zone(s, id) === "exile")).toBe(true);
    expect(zone(s, yard[0]!)).toBe("graveyard");
  });
});

describe("round 313: Volrath's Curse", () => {
  it("is ignored for the turn by sacrificing a permanent, even the creature itself (then the Aura goes too)", () => {
    const { s: s0, ap, opp } = setup([]);
    const host = putOnBattlefield(s0, ap, pinger());
    const aura = putOnBattlefield(s0, opp, curse());
    attach(s0, aura, host);
    const fodder = putOnBattlefield(s0, ap, bear({ name: "Test Fodder" }));
    let s = s0;
    expect(canAttack(s, host)).toBe(false);
    // A choice is required: no sacrifice chosen, no action.
    expect(() => act(s, { type: "ignoreEffect", player: ap, objectId: aura })).toThrow();
    // Not a permanent of someone else's.
    const theirs = putOnBattlefield(s, opp, bear({ name: "Test Theirs" }));
    expect(() => act(s, { type: "ignoreEffect", player: ap, objectId: aura, costs: { sacrifice: [theirs] } })).toThrow();
    const s1 = act(s, { type: "ignoreEffect", player: ap, objectId: aura, costs: { sacrifice: [fodder] } });
    expect(zone(s1, fodder)).toBe("graveyard");
    expect(canAttack(s1, host)).toBe(true);
    expect(abilityProblem(s1, ap, host, 0, [{ kind: "player", id: opp }])).toBeNull();
    // Its own ability still works for its controller: "{1}{U}: Return this Aura to its owner's hand."
    expect(abilityProblem(s1, opp, aura, 0)).toMatch(/priority|mana/);
    // Sacrificing the enchanted creature: the Aura is put into the graveyard by state-based actions (rulings).
    s = act(s, { type: "ignoreEffect", player: ap, objectId: aura, costs: { sacrifice: [host] } });
    s = act(s, { type: "passPriority", player: ap });
    expect(zone(s, host)).toBe("graveyard");
    expect(zone(s, aura)).toBe("graveyard");
  });

  it("goes with its creature to another controller: the new controller hasn't ignored it", () => {
    const { s: s0, ap, opp } = setup([]);
    const host = putOnBattlefield(s0, ap, pinger());
    const aura = putOnBattlefield(s0, opp, curse());
    attach(s0, aura, host);
    const fodder = putOnBattlefield(s0, ap, bear({ name: "Test Fodder" }));
    let s = act(s0, { type: "ignoreEffect", player: ap, objectId: aura, costs: { sacrifice: [fodder] } });
    expect(canAttack(s, host)).toBe(true);
    s.objects[host]!.controller = opp;
    invalidateCharacteristics(s);
    expect(ignorableBy(s, opp, aura)).toBeDefined();
    expect(ignorableBy(s, ap, aura)).toBeUndefined();
    expect(canAttack(s, host)).toBe(false);
  });
});

describe("round 313: Damping Engine", () => {
  it("stops the player with the most permanents from casting creature spells and playing lands, until they sacrifice a permanent", () => {
    const { s: s0, ap, opp, ids } = setup([bear({ name: "Test Bear" }), card("Test Land", "Land"), card("Test Instant", "Instant", "{R}", { oracleText: "Draw a card." })]);
    putOnBattlefield(s0, opp, damping());
    let s = s0;
    // The active player has fourteen lands; nobody else has more than one permanent.
    expect(castProblem(s, ap, ids[0]!)).toMatch(/Damping Engine/);
    expect(landsAllowed(s, ap)).toBe(0);
    // Instants aren't stopped.
    expect(castProblem(s, ap, ids[2]!)).not.toMatch(/Damping Engine/);
    // Only the player with the most permanents may take the action (rulings).
    expect(ignorableBy(s, opp, s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Damping Engine")!)).toBeUndefined();
    const engine = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Damping Engine")!;
    const land = s.battlefield.find((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.name === "Swamp")!;
    s = act(s, { type: "ignoreEffect", player: ap, objectId: engine, costs: { sacrifice: [land] } });
    expect(zone(s, land)).toBe("graveyard");
    expect(castProblem(s, ap, ids[0]!) ?? "").not.toMatch(/Damping Engine/);
    expect(landsAllowed(s, ap)).toBe(1);
    expect(ignorableBy(s, ap, engine)).toBeUndefined();
    // A tie for the most: no one is stopped.
    s.turn += 1;
    invalidateCharacteristics(s);
    expect(castProblem(s, ap, ids[0]!)).toMatch(/Damping Engine/);
    for (const id of s.battlefield.filter((id) => s.objects[id]!.controller === ap).slice(2)) s.objects[id]!.controller = opp;
    invalidateCharacteristics(s);
    expect(controlsMostPermanents(s, ap)).toBe(false);
    expect(castProblem(s, ap, ids[0]!) ?? "").not.toMatch(/Damping Engine/);
  });
});
