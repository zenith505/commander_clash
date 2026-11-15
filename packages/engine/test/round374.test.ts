// Round 374 (Lane A): a chosen creature type for the creature cards in your graveyard (Ashes of the Fallen), an opponent
// splitting the two cards a cost exiled (Coin of Fate), a target card returned with the sacrificed card at your next
// upkeep (Rescue from the Underworld), and creature cards chosen in two graveyards and returned together (Dawnbreak
// Reclaimer).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, defOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

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
const zone = (s: GameState, id: ObjectId) => s.objects[id]?.zone;
const subtypes = (s: GameState, id: ObjectId) => defOf(s, s.objects[id]!).subtypes;

const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { cmc: 3, power: "3", toughness: "3", colors: ["R"] });
const bear2 = card("Test Bear", "Creature — Bear", "{1}{G}", { cmc: 2, power: "2", toughness: "2", colors: ["G"] });
const giant = card("Test Giant", "Creature — Giant", "{5}{R}", { cmc: 6, power: "6", toughness: "6", colors: ["R"] });
const rock = card("Test Rock", "Artifact", "{1}", { cmc: 1 });
const recall = card("Test Recall", "Sorcery", "{G}", { cmc: 1, oracleText: "Return target Elf card from your graveyard to your hand.", colors: ["G"] });

// Real oracle text (Scryfall).
const ashes = (): CardDef => ({"oracleId":"6437867b-a658-4a71-a8a5-0c5a782d1f84","name":"Ashes of the Fallen","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"As this artifact enters, choose a creature type.\nEach creature card in your graveyard has the chosen creature type in addition to its other types.","colors":[],"colorIdentity":[],"keywords":[],"commanderLegal":"legal","set":"sok","releasedAt":"2005-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const coin = (): CardDef => ({"oracleId":"e43b478b-4cb8-42b1-a5b0-0b1421b84852","name":"Coin of Fate","manaCost":"{1}{W}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"When this artifact enters, surveil 1.\n{3}{W}, {T}, Exile two creature cards from your graveyard, Sacrifice this artifact: An opponent chooses one of the exiled cards. You put that card on the bottom of your library and return the other to the battlefield tapped. You become the monarch.","colors":["W"],"colorIdentity":["W"],"keywords":["Surveil"],"commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const rescue = (): CardDef => ({"oracleId":"7217ea53-3685-48d6-9df1-58a551f8c979","name":"Rescue from the Underworld","manaCost":"{4}{B}","cmc":5,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"As an additional cost to cast this spell, sacrifice a creature.\nChoose target creature card in your graveyard. Return that card and the sacrificed card to the battlefield under your control at the beginning of your next upkeep. Exile Rescue from the Underworld.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"ths","releasedAt":"2013-09-27","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const dawnbreak = (): CardDef => ({"oracleId":"6fa7229d-18b6-43d8-aa57-a56cdb815767","name":"Dawnbreak Reclaimer","manaCost":"{4}{W}{W}","cmc":6,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nAt the beginning of your end step, choose a creature card in an opponent's graveyard, then that player chooses a creature card in your graveyard. You may return those cards to the battlefield under their owners' control.","power":"5","toughness":"5","colors":["W"],"colorIdentity":["W"],"keywords":["Flying"],"commanderLegal":"legal","set":"c15","releasedAt":"2015-11-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

describe("round 374: compiles", () => {
  it("every card of the round", () => supported(ashes(), coin(), rescue(), dawnbreak(), recall));
});

describe("Ashes of the Fallen", () => {
  const begin = () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, ashes());
    s0.objects[a]!.chosen = { type: "Elf" };
    invalidateCharacteristics(s0);
    return { s0, ap, opp, a };
  };

  it("creature cards in your graveyard have the chosen type; not your creatures, your hand or an opponent's graveyard", () => {
    const { s0, ap, opp } = begin();
    const mine = toYard(s0, ap, ogre);
    const rockCard = toYard(s0, ap, rock);
    const held = toHand(s0, ap, bear2);
    const theirs = toYard(s0, opp, bear2);
    const field = putOnBattlefield(s0, ap, giant);
    expect(subtypes(s0, mine)).toEqual(["Ogre", "Elf"]);
    expect(subtypes(s0, rockCard)).toEqual([]);
    expect(subtypes(s0, held)).toEqual(["Bear"]);
    expect(subtypes(s0, theirs)).toEqual(["Bear"]);
    expect(subtypes(s0, field)).toEqual(["Giant"]);
  });

  it("an Elf card can be targeted there, and only while Ashes is on the battlefield", () => {
    const { s0, ap } = begin();
    const mine = toYard(s0, ap, ogre);
    const r = toHand(s0, ap, recall);
    const s = settle(run(s0, planCast(s0, ap, r, [{ kind: "object", id: mine }])), ap);
    expect(zone(s, mine)).toBe("hand");
    // With Ashes gone, the Ogre card is an Ogre only.
    const { s0: t0, ap: tp, a: ta } = begin();
    const m2 = toYard(t0, tp, ogre);
    const r2 = toHand(t0, tp, recall);
    t0.battlefield.splice(t0.battlefield.indexOf(ta), 1);
    t0.objects[ta]!.zone = "graveyard";
    t0.players[tp]!.graveyard.push(ta);
    invalidateCharacteristics(t0);
    expect(subtypes(t0, m2)).toEqual(["Ogre"]);
    expect(planCast(t0, tp, r2, [{ kind: "object", id: m2 }])).toBeNull();
  });
});

describe("Coin of Fate", () => {
  const begin = () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, coin());
    const o = toYard(s0, ap, ogre);
    const g = toYard(s0, ap, giant);
    s0.players[ap]!.manaPool = { W: 1, U: 0, B: 0, R: 0, G: 0, C: 3 };
    return { s0, ap, opp, c, o, g };
  };

  it("the opponent puts one exiled card on the bottom of your library, the other returns tapped, and you become the monarch", () => {
    const { s0, ap, c, o, g } = begin();
    let s = run(s0, planActivate(s0, ap, c, 0, [], undefined, undefined, undefined, { exileCards: [o, g] }));
    expect(zone(s, o)).toBe("exile");
    expect(zone(s, g)).toBe("exile");
    expect(zone(s, c)).toBe("graveyard");
    // Everyone answers as the bots would (the controller chooses the opponent, who chooses).
    s = settle(s);
    expect(s.pending).toBeFalsy();
    // A bot opponent sends the better card (the Giant) to the bottom.
    const lib = s.players[ap]!.library;
    expect(lib[lib.length - 1]).toBe(g);
    expect(zone(s, o)).toBe("battlefield");
    expect(s.objects[o]!.tapped).toBe(true);
    expect(s.objects[o]!.controller).toBe(ap);
    expect(s.monarch).toBe(ap);
  });

  it("the opponent's choice is asked of that opponent, with both cards", () => {
    const { s0, ap, c, o, g } = begin();
    let s = run(s0, planActivate(s0, ap, c, 0, [], undefined, undefined, undefined, { exileCards: [o, g] }));
    for (let i = 0; i < 50 && s.stack.length && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    // Its controller chooses the opponent first.
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "opponent" });
    const opp = Number((s.pending as { options: string[] }).options[1]);
    s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp, cards: [o, g], min: 1, max: 1 });
    s = settle(act(s, { type: "searchLibrary", player: opp, found: [o] }), ap);
    const lib = s.players[ap]!.library;
    expect(lib[lib.length - 1]).toBe(o);
    expect(zone(s, g)).toBe("battlefield");
    expect(s.objects[g]!.tapped).toBe(true);
  });

  it("with one of the cards gone from exile, that one is the only card left to choose: it goes to the bottom, none returns", () => {
    const { s0, ap, c, o, g } = begin();
    let s = run(s0, planActivate(s0, ap, c, 0, [], undefined, undefined, undefined, { exileCards: [o, g] }));
    // The Giant leaves exile in response (a new object, CR 400.7).
    s.players[ap]!.exile = s.players[ap]!.exile.filter((x) => x !== g);
    s.objects[g]!.zone = "hand";
    s.objects[g]!.zoneChanges = (s.objects[g]!.zoneChanges ?? 0) + 1;
    s.players[ap]!.hand.push(g);
    s = settle(s);
    const lib = s.players[ap]!.library;
    expect(lib[lib.length - 1]).toBe(o);
    expect(zone(s, g)).toBe("hand");
    expect(s.monarch).toBe(ap);
  });

  it("needs two creature cards in your graveyard", () => {
    const { s0, ap, c, o } = begin();
    s0.players[ap]!.graveyard = [o];
    expect(planActivate(s0, ap, c, 0, [], undefined, undefined, undefined, { exileCards: [o] })).toBeNull();
  });
});

describe("Rescue from the Underworld", () => {
  const begin = () => {
    const { s: s0, ap, opp } = setup([]);
    s0.players[ap]!.hand = [];
    const r = toHand(s0, ap, rescue());
    const fodder = putOnBattlefield(s0, ap, ogre);
    const target = toYard(s0, ap, giant);
    return { s0, ap, opp, r, fodder, target };
  };

  it("both the target card and the sacrificed card return at the beginning of your next upkeep; Rescue is exiled at once", () => {
    const { s0, ap, r, fodder, target } = begin();
    let s = run(s0, planCast(s0, ap, r, [{ kind: "object", id: target }], undefined, undefined, undefined, { sacrifice: [fodder] }));
    expect(zone(s, fodder)).toBe("graveyard");
    s = settle(s, ap);
    expect(zone(s, r)).toBe("exile");
    expect(zone(s, target)).toBe("graveyard");
    expect(zone(s, fodder)).toBe("graveyard");
    s = passUntil(s, "upkeep", ap);
    s = settle(s, ap);
    expect(zone(s, target)).toBe("battlefield");
    expect(zone(s, fodder)).toBe("battlefield");
    expect(s.objects[target]!.controller).toBe(ap);
    expect(s.objects[fodder]!.controller).toBe(ap);
  });

  it("a card that left the graveyard before then doesn't return (rulings); a sacrificed token is gone", () => {
    const { s0, ap, r, target } = begin();
    const tok = putOnBattlefield(s0, ap, bear2);
    s0.objects[tok]!.isToken = true;
    let s = settle(run(s0, planCast(s0, ap, r, [{ kind: "object", id: target }], undefined, undefined, undefined, { sacrifice: [tok] })), ap);
    expect(s.objects[tok]).toBeUndefined();
    // The Giant card leaves and comes back: a new object (CR 400.7).
    s.objects[target]!.zoneChanges = (s.objects[target]!.zoneChanges ?? 0) + 2;
    s = settle(passUntil(s, "upkeep", ap), ap);
    expect(zone(s, target)).toBe("graveyard");
  });

  it("with a replacement exiling the sacrificed creature, it returns from exile (rulings)", () => {
    const { s0, ap, r, fodder, target } = begin();
    let s = run(s0, planCast(s0, ap, r, [{ kind: "object", id: target }], undefined, undefined, undefined, { sacrifice: [fodder] }));
    // As if a replacement had put it into exile instead.
    s.players[ap]!.graveyard = s.players[ap]!.graveyard.filter((x) => x !== fodder);
    s.players[ap]!.exile.push(fodder);
    s.objects[fodder]!.zone = "exile";
    const item = s.stack.find((x) => x.kind === "spell")!;
    item.sacrificed![0]!.cardIn = { id: fodder, zc: s.objects[fodder]!.zoneChanges ?? 0 };
    s = settle(passUntil(settle(s, ap), "upkeep", ap), ap);
    expect(zone(s, fodder)).toBe("battlefield");
    expect(zone(s, target)).toBe("battlefield");
  });
});

describe("Dawnbreak Reclaimer", () => {
  const begin = () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, dawnbreak());
    return { s0, ap, opp, d };
  };
  const toEnd = (s: GameState, ap: PlayerId) => {
    s = passUntil(s, "end", ap);
    for (let i = 0; i < 50 && !s.pending && (s.stack.length || s.triggerQueue.length || s.step === "end"); i++) {
      if (s.step !== "end") break;
      s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return s;
  };

  it("you choose an opponent's creature card, its owner chooses one of yours, and you may return both to their owners", () => {
    const { s0, ap, opp } = begin();
    const theirs = toYard(s0, opp, bear2);
    const mineSmall = toYard(s0, ap, ogre);
    const mineBig = toYard(s0, ap, giant);
    let s = toEnd(s0, ap);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, cards: [theirs] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [theirs] }), ap);
    // The bot owner picks our weaker card.
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(zone(s, theirs)).toBe("battlefield");
    expect(s.objects[theirs]!.controller).toBe(opp);
    expect(zone(s, mineSmall)).toBe("battlefield");
    expect(s.objects[mineSmall]!.controller).toBe(ap);
    expect(zone(s, mineBig)).toBe("graveyard");
  });

  it("declining returns neither", () => {
    const { s0, ap, opp } = begin();
    const theirs = toYard(s0, opp, bear2);
    const mine = toYard(s0, ap, ogre);
    let s = toEnd(s0, ap);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [theirs] }), ap);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(zone(s, theirs)).toBe("graveyard");
    expect(zone(s, mine)).toBe("graveyard");
  });

  it("with no creature card in an opponent's graveyard, you choose the opponent who chooses one of yours", () => {
    const { s0, ap } = begin();
    const mine = toYard(s0, ap, ogre);
    let s = toEnd(s0, ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "opponent" });
    const chooser = Number((s.pending as { options: string[] }).options[2]);
    s = act(s, { type: "chooseOption", player: ap, choice: String(chooser) });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: chooser, cards: [mine] });
    s = settle(act(s, { type: "searchLibrary", player: chooser, found: [mine] }), ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(zone(s, mine)).toBe("battlefield");
  });

  it("a bot controller returns the pair only when its card is worth at least the opponent's", () => {
    const { s0, ap, opp } = begin();
    const theirs = toYard(s0, opp, giant);
    const mine = toYard(s0, ap, bear2);
    // ap is a bot here: everything is answered as the bots would.
    const s = settle(toEnd(s0, ap));
    expect(s.log.some((l) => /doesn.t return Test Giant and Test Bear/.test(l.text))).toBe(true);
    expect(zone(s, mine)).toBe("graveyard");
    expect(zone(s, theirs)).toBe("graveyard");
  });
});
