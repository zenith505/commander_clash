// Lane B round B167: a counter put on an artifact as a creature enters and a state trigger for it (Phylactery Lich;
// rulings, CR 614.12, 603.8), an Equipment that comes back when its token dies (Tatsumasa, the Dragon's Fang; CR 400.7j,
// 603.7c), a card exiled from a hand that you may play (Fiend of the Shadows; rulings), a mana ability that makes its
// source that color (Foraging Wickermaw; CR 105.3, 605.3b), exiling any number of the top ten cards (Ancestral
// Knowledge) and a Trap's alternative cost after a creature spell was countered (Summoning Trap; rulings).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup, swamp } from "./helpers";
import { botActions, castProblem, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const lich = (): CardDef => ({"oracleId":"520c4d88-34b6-4a26-81ca-65eb8b10461c","name":"Phylactery Lich","manaCost":"{B}{B}{B}","cmc":3,"typeLine":"Creature — Zombie","supertypes":[],"types":["Creature"],"subtypes":["Zombie"],"oracleText":"Indestructible\nAs this creature enters, put a phylactery counter on an artifact you control.\nWhen you control no permanents with phylactery counters on them, sacrifice this creature.","power":"5","toughness":"5","colors":["B"],"colorIdentity":["B"],"keywords":["Indestructible"],"layout":"normal"}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"layout":"normal"}) as CardDef;
const shatter = (): CardDef => ({"oracleId":"84d32e68-72b9-432d-a023-7bc6a26b8ad0","name":"Shatter","manaCost":"{1}{R}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target artifact.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const tatsumasa = (): CardDef => ({"oracleId":"ab739c7e-246a-45ac-bbec-ba44d044dd03","name":"Tatsumasa, the Dragon's Fang","manaCost":"{6}","cmc":6,"typeLine":"Legendary Artifact — Equipment","supertypes":["Legendary"],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +5/+5.\n{6}, Exile Tatsumasa: Create a 5/5 blue Dragon Spirit creature token with flying. Return Tatsumasa to the battlefield under its owner's control when that token dies.\nEquip {3}","colors":[],"colorIdentity":[],"keywords":["Equip"],"layout":"normal"}) as CardDef;
const murder = (): CardDef => ({"oracleId":"938b4e2c-88d9-4637-bc00-e228920c9a78","name":"Murder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"}) as CardDef;
const swords = (): CardDef => ({"oracleId":"b1544f21-7e98-461b-aed5-e748b0168c52","name":"Swords to Plowshares","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Exile target creature. Its controller gains life equal to its power.","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;
const fiend = (): CardDef => ({"oracleId":"3891a3b6-d8ac-4cd3-b2f6-d6d786e89a67","name":"Fiend of the Shadows","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Creature — Vampire Wizard","supertypes":[],"types":["Creature"],"subtypes":["Vampire","Wizard"],"oracleText":"Flying\nWhenever this creature deals combat damage to a player, that player exiles a card from their hand. You may play that card for as long as it remains exiled.\nSacrifice a Human: Regenerate this creature.","power":"3","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":["Flying","Regenerate"],"layout":"normal"}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const wastes = (): CardDef => ({"oracleId":"9cc070d3-4b83-4684-9caf-063e5c473a77","name":"Wastes","manaCost":"","cmc":0,"typeLine":"Basic Land","supertypes":["Basic"],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"layout":"normal"}) as CardDef;
const wickermaw = (): CardDef => ({"oracleId":"11ceb2db-021e-422d-976e-7bfe3b67a8aa","name":"Foraging Wickermaw","manaCost":"{2}","cmc":2,"typeLine":"Artifact Creature — Scarecrow","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Scarecrow"],"oracleText":"When this creature enters, surveil 1. (Look at the top card of your library. You may put it into your graveyard.)\n{1}: Add one mana of any color. This creature becomes that color until end of turn. Activate only once each turn.","power":"1","toughness":"3","colors":[],"colorIdentity":[],"keywords":["Surveil"],"producedMana":["B","G","R","U","W"],"layout":"normal"}) as CardDef;
const knowledge = (): CardDef => ({"oracleId":"2786f210-ec64-46ea-9a7f-b03759fb1dae","name":"Ancestral Knowledge","manaCost":"{1}{U}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Cumulative upkeep {1} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nWhen this enchantment enters, look at the top ten cards of your library, then exile any number of them and put the rest back on top of your library in any order.\nWhen this enchantment leaves the battlefield, shuffle your library.","colors":["U"],"colorIdentity":["U"],"keywords":["Cumulative upkeep"],"layout":"normal"}) as CardDef;
const disenchant = (): CardDef => ({"oracleId":"a7e97fa9-4b72-4548-b854-5be5f18a6f1a","name":"Disenchant","manaCost":"{1}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target artifact or enchantment.","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;
const trap = (): CardDef => ({"oracleId":"2faa8dc1-0370-458c-9aef-44f81a9b5cd5","name":"Summoning Trap","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Instant — Trap","supertypes":[],"types":["Instant"],"subtypes":["Trap"],"oracleText":"If a creature spell you cast this turn was countered by a spell or ability an opponent controlled, you may pay {0} rather than pay this spell's mana cost.\nLook at the top seven cards of your library. You may put a creature card from among them onto the battlefield. Put the rest on the bottom of your library in any order.","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const counterspell = (): CardDef => ({"oracleId":"cc187110-1148-4090-bbb8-e205694a39f5","name":"Counterspell","manaCost":"{U}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"layout":"normal"}) as CardDef;

const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string): TargetChoice => ({ kind: "object", id }) as TargetChoice;
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
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
const named = (s: GameState, name: string) => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === name);
const zoneOf = (s: GameState, id: string) => s.objects[id]!.zone;

describe("Phylactery Lich: a phylactery counter on an artifact you control as it enters; sacrificed when you control none", () => {
  it("compiles", () => supported(lich()));

  it("the counter goes on the artifact chosen, and the Lich stays", () => {
    const { s: s0, ap, ids } = setup([lich()]);
    putOnBattlefield(s0, ap, swamp);
    const ring = putOnBattlefield(s0, ap, solRing());
    const thopter = putOnBattlefield(s0, ap, ornithopter());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "chosenObject" });
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([ring, thopter].sort());
    s = settle(act(s, { type: "chooseOption", player: ap, choice: ring }));
    expect(s.objects[ring]!.counters.phylactery).toBe(1);
    expect(s.objects[thopter]!.counters.phylactery ?? 0).toBe(0);
    expect(named(s, "Phylactery Lich")).toHaveLength(1);
  });

  it("with no artifact, nothing gets the counter and the Lich is sacrificed (rulings)", () => {
    const { s: s0, ap, ids } = setup([lich()]);
    putOnBattlefield(s0, ap, swamp);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(named(s, "Phylactery Lich")).toHaveLength(0);
    expect(zoneOf(s, s.players[ap]!.graveyard.find((g) => s.cards[s.objects[g]!.cardId]!.name === "Phylactery Lich")!)).toBe("graveyard");
  });

  it("destroying the artifact with the counter makes it sacrifice itself, though it's indestructible", () => {
    const { s: s0, ap, ids } = setup([lich(), shatter()]);
    putOnBattlefield(s0, ap, swamp);
    const ring = putOnBattlefield(s0, ap, solRing());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: ring }));
    expect(named(s, "Phylactery Lich")).toHaveLength(1);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(ring)])));
    expect(zoneOf(s, ring)).toBe("graveyard");
    expect(named(s, "Phylactery Lich")).toHaveLength(0);
  });

  it("another permanent of yours with a phylactery counter keeps it (rulings)", () => {
    const { s: s0, ap, ids } = setup([lich(), shatter()]);
    putOnBattlefield(s0, ap, swamp);
    const ring = putOnBattlefield(s0, ap, solRing());
    const thopter = putOnBattlefield(s0, ap, ornithopter());
    s0.objects[thopter]!.counters.phylactery = 1;
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: ring }));
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(ring)])));
    expect(zoneOf(s, ring)).toBe("graveyard");
    expect(named(s, "Phylactery Lich")).toHaveLength(1);
  });

  it("an artifact entering with it can't be chosen; the bot picks one of its artifacts", () => {
    const { s: s0, ap, ids } = setup([lich()]);
    putOnBattlefield(s0, ap, swamp);
    const ring = putOnBattlefield(s0, ap, solRing());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const acts = botActions(s, ap);
    expect(acts[0]).toMatchObject({ type: "chooseOption", choice: ring });
    s = settle(run(s, acts));
    expect(s.objects[ring]!.counters.phylactery).toBe(1);
    expect(characteristics(s, s.objects[named(s, "Phylactery Lich")[0]!]!).name).toBe("Phylactery Lich");
  });
});

describe("Tatsumasa, the Dragon's Fang: exiled for a 5/5 Dragon Spirit, back when that token dies", () => {
  it("compiles", () => supported(tatsumasa()));

  const fang = (s: GameState) => Object.values(s.objects).find((o) => s.cards[o.cardId]!.name === "Tatsumasa, the Dragon's Fang")!.id;
  const activateFang = (s0: GameState, pid: PlayerId) => {
    const id = fang(s0);
    return settle(run(s0, planActivate(s0, pid, id, 0)));
  };

  it("the token dies: Tatsumasa returns to the battlefield", () => {
    const { s: s0, ap, ids } = setup([murder()]);
    const id = putOnBattlefield(s0, ap, tatsumasa());
    let s = activateFang(s0, ap);
    expect(zoneOf(s, id)).toBe("exile");
    const [dragon] = named(s, "Dragon Spirit Token");
    expect(dragon).toBeDefined();
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(dragon!)])));
    expect(named(s, "Dragon Spirit Token")).toHaveLength(0);
    expect(named(s, "Tatsumasa, the Dragon's Fang")).toHaveLength(1);
    expect(s.objects[named(s, "Tatsumasa, the Dragon's Fang")[0]!]!.controller).toBe(ap);
  });

  it("the token is exiled, not dying: Tatsumasa stays in exile", () => {
    const { s: s0, ap, ids } = setup([swords()]);
    const id = putOnBattlefield(s0, ap, tatsumasa());
    let s = activateFang(s0, ap);
    const [dragon] = named(s, "Dragon Spirit Token");
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(dragon!)])));
    expect(named(s, "Dragon Spirit Token")).toHaveLength(0);
    expect(zoneOf(s, id)).toBe("exile");
    expect(named(s, "Tatsumasa, the Dragon's Fang")).toHaveLength(0);
  });

  it("Tatsumasa left exile meanwhile: it's a new object, and nothing returns (CR 400.7)", () => {
    const { s: s0, ap, ids } = setup([murder()]);
    const id = putOnBattlefield(s0, ap, tatsumasa());
    let s = activateFang(s0, ap);
    const [dragon] = named(s, "Dragon Spirit Token");
    // Put into its owner's graveyard from exile, a new object there.
    const o = s.objects[id]!;
    s.players[o.owner]!.exile = s.players[o.owner]!.exile?.filter((x) => x !== id);
    o.zone = "graveyard";
    o.zoneChanges = (o.zoneChanges ?? 0) + 1;
    s.players[o.owner]!.graveyard.push(id);
    invalidateCharacteristics(s);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(dragon!)])));
    expect(zoneOf(s, id)).toBe("graveyard");
    expect(named(s, "Tatsumasa, the Dragon's Fang")).toHaveLength(0);
  });

  it("activated by a player who doesn't own it: it returns under its owner's control", () => {
    const { s: s0, ap, ids, opp } = setup([murder()]);
    const id = putOnBattlefield(s0, ap, tatsumasa());
    s0.objects[id]!.owner = opp;
    invalidateCharacteristics(s0);
    let s = activateFang(s0, ap);
    const [dragon] = named(s, "Dragon Spirit Token");
    expect(s.objects[dragon!]!.controller).toBe(ap);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(dragon!)])));
    const [back] = named(s, "Tatsumasa, the Dragon's Fang");
    expect(back).toBe(id);
    expect(s.objects[back!]!.controller).toBe(opp);
  });
});

describe("Fiend of the Shadows: that player exiles a card from their hand, and you may play it while it stays exiled", () => {
  it("compiles", () => supported(fiend()));

  const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
    const id = putOnBattlefield(s, pid, def);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "hand";
    s.players[pid]!.hand.push(id);
    invalidateCharacteristics(s);
    return id;
  };
  /** The Fiend attacks `opp` unblocked; stops when `opp` is asked which card to exile, or in the second main phase. */
  const hit = (s0: GameState, ap: PlayerId, opp: PlayerId, attacker: string) => {
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender: opp }] });
    for (let i = 0; i < 200 && !(s.pending?.kind === "discard") && s.step !== "main2"; i++) {
      const pend = s.pending;
      if (pend?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pend.player, blocks: [] });
      else if (pend) throw new Error(`unexpected ${pend.kind}`);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return s;
  };

  it("the player hit chooses the card; you may cast it later this turn, and play a land card that way too", () => {
    const { s: s0, ap, opp } = setup([]);
    s0.players[opp]!.hand = [];
    const f = putOnBattlefield(s0, ap, fiend());
    const bear = toHand(s0, opp, bears());
    const land = toHand(s0, opp, wastes());
    let s = hit(s0, ap, opp, f);
    expect(s.pending).toMatchObject({ kind: "discard", player: opp, exile: true });
    s = settle(act(s, { type: "discard", player: opp, objectIds: [bear] }));
    expect(zoneOf(s, bear)).toBe("exile");
    expect(zoneOf(s, land)).toBe("hand");
    s = passUntil(s, "main2", ap);
    // The owner can't play it; the Fiend's controller can, paying for it.
    expect(planCast(s, opp, bear)).toBeNull();
    s = settle(run(s, planCast(s, ap, bear)));
    expect(zoneOf(s, bear)).toBe("battlefield");
    expect(s.objects[bear]!.controller).toBe(ap);
    expect(s.objects[bear]!.owner).toBe(opp);
  });

  it("a land card exiled this way can be played as your land, even once the Fiend has left (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    s0.players[opp]!.hand = [];
    const f = putOnBattlefield(s0, ap, fiend());
    const land = toHand(s0, opp, wastes());
    // Their only card: nothing to choose.
    let s = hit(s0, ap, opp, f);
    expect(zoneOf(s, land)).toBe("exile");
    s = passUntil(s, "main2", ap);
    // The Fiend leaves; the card can still be played.
    const fo = s.objects[f]!;
    s.battlefield.splice(s.battlefield.indexOf(f), 1);
    fo.zone = "graveyard";
    fo.zoneChanges = (fo.zoneChanges ?? 0) + 1;
    s.players[ap]!.graveyard.push(f);
    invalidateCharacteristics(s);
    s = act(s, { type: "playLand", player: ap, objectId: land });
    expect(zoneOf(s, land)).toBe("battlefield");
    expect(s.objects[land]!.controller).toBe(ap);
  });
});

describe("Foraging Wickermaw: one mana of any color for {1}, and it becomes that color until end of turn", () => {
  it("compiles", () => supported(wickermaw()));

  it("adds the color chosen and becomes that color only, once each turn; colorless again next turn", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, wickermaw());
    expect(characteristics(s0, s0.objects[w]!).colors).toEqual([]);
    const mountain = named(s0, "Mountain")[0]!;
    let s = act(s0, { type: "activateMana", player: ap, objectId: mountain, mana: "R" });
    s = act(s, { type: "activateMana", player: ap, objectId: w, mana: "G" });
    expect(s.players[ap]!.manaPool.G).toBe(1);
    expect(s.players[ap]!.manaPool.R).toBe(0);
    expect(characteristics(s, s.objects[w]!).colors).toEqual(["G"]);
    // Activate only once each turn (CR 602.5b).
    const island = named(s, "Island")[0]!;
    s = act(s, { type: "activateMana", player: ap, objectId: island, mana: "U" });
    expect(() => act(s, { type: "activateMana", player: ap, objectId: w, mana: "W" })).toThrow();
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(characteristics(s, s.objects[w]!).colors).toEqual([]);
  });
});

describe("Ancestral Knowledge: look at the top ten, exile any number, the rest back on top in any order; shuffle as it leaves", () => {
  it("compiles", () => supported(knowledge()));

  it("the cards chosen are exiled and the rest go back on top in the order chosen", () => {
    const { s: s0, ap, ids } = setup([knowledge()]);
    const lib0 = [...s0.players[ap]!.library];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap, how: "exile" });
    const cards = (s.pending as { cards: string[] }).cards;
    expect(cards).toEqual(lib0.slice(0, 10));
    const away = [cards[0]!, cards[5]!];
    const top = cards.filter((c) => !away.includes(c)).reverse();
    s = settle(act(s, { type: "arrangeTop", player: ap, top, away }));
    for (const c of away) expect(zoneOf(s, c)).toBe("exile");
    expect(s.players[ap]!.library.slice(0, 8)).toEqual(top);
    expect(s.players[ap]!.library.slice(8)).toEqual(lib0.slice(10));
    expect(s.players[ap]!.graveyard.filter((g) => cards.includes(g))).toEqual([]);
  });

  it("it isn't a surveil, and the bot answers it too", () => {
    const { s: s0, ap, ids } = setup([knowledge()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "exile" });
    const acts = botActions(s, ap);
    expect(acts[0]).toMatchObject({ type: "arrangeTop", player: ap });
    s = settle(run(s, acts));
    expect(s.pending).toBeNull();
    expect(s.log.some((l) => /surveils/.test(l.text))).toBe(false);
  });

  it("leaving the battlefield shuffles your library", () => {
    const { s: s0, ap, ids } = setup([knowledge(), disenchant()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "arrangeTop", player: ap, top: (s.pending as { cards: string[] }).cards, away: [] }));
    const before = [...s.players[ap]!.library];
    const [k] = named(s, "Ancestral Knowledge");
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(k!)])));
    expect(zoneOf(s, k!)).toBe("graveyard");
    expect([...s.players[ap]!.library].sort()).toEqual([...before].sort());
    expect(s.players[ap]!.library).not.toEqual(before);
  });
});

describe("Summoning Trap: {0} rather than its mana cost if a creature spell you cast this turn was countered by an opponent's spell", () => {
  it("compiles", () => supported(trap()));

  const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
    const id = putOnBattlefield(s, pid, def);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "hand";
    s.players[pid]!.hand.push(id);
    invalidateCharacteristics(s);
    return id;
  };
  const alt = { alt: "alternative" } as const;
  /** `ap` casts `def`; `by` counters it with Counterspell from their pool. */
  const countered = (def: CardDef, byOpponent = true) => {
    const { s: s0, ap, ids, opp } = setup([trap(), def]);
    const by = byOpponent ? opp : ap;
    const cs = toHand(s0, by, counterspell());
    let s = run(s0, planCast(s0, ap, ids[1]!));
    const spell = s.stack[s.stack.length - 1]!.id;
    s.players[by]!.manaPool.U += 2;
    s.priority = by;
    s = run(s, planCast(s, by, cs, [{ kind: "stack", id: spell } as TargetChoice]));
    s = settle(s);
    expect(zoneOf(s, ids[1]!)).toBe("graveyard");
    return { s, ap, trapId: ids[0]! };
  };

  it("not before: the full cost; after an opponent counters your creature spell, {0}", () => {
    const { s: s0, ap, ids } = setup([trap()]);
    expect(castProblem(s0, ap, ids[0]!, [], undefined, undefined, undefined, undefined, alt)).not.toBeNull();
    const { s, trapId } = countered(bears());
    expect(castProblem(s, ap, trapId, [], undefined, undefined, undefined, undefined, alt)).toBeNull();
    const untapped = s.battlefield.filter((id) => !s.objects[id]!.tapped).length;
    let t = run(s, planCast(s, ap, trapId, [], undefined, "auto", undefined, alt));
    expect(t.battlefield.filter((id) => !t.objects[id]!.tapped).length).toBe(untapped);
    t = settle(t);
    // It resolves: a creature card from the top seven may be put onto the battlefield.
    expect(t.pending).toBeTruthy();
  });

  it("a noncreature spell countered, or your own Counterspell: the full cost", () => {
    const own = countered(bears(), false);
    expect(castProblem(own.s, own.ap, own.trapId, [], undefined, undefined, undefined, undefined, alt)).not.toBeNull();
    const other = countered(divination());
    expect(castProblem(other.s, other.ap, other.trapId, [], undefined, undefined, undefined, undefined, alt)).not.toBeNull();
  });

  it("the next turn it's over", () => {
    const { s: s0, ap, trapId } = countered(bears());
    const next = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    const s = passUntil(s0, "upkeep", next);
    expect((s.turnLog?.creaturesCountered ?? []).length).toBe(0);
    expect(castProblem(s, ap, trapId, [], undefined, undefined, undefined, undefined, alt)).not.toBeNull();
  });
});
