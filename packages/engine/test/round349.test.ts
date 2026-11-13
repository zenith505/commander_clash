// Round 349 (Lane A): each player's upkeep or draw step acting on the top card of their library or a card from their
// hand, cast "if able" (Gate to the Aether, Omen Machine, Wild Evocation), a creature goaded for as long as an enchantment
// stays (Hot Pursuit) and an extra turn during which damage can't be prevented (Alchemist's Gambit).

import { describe, expect, it } from "vitest";
import { act, forest, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, moveObject, objHasKeyword, planCast, playerLoses, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

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
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const nameOf = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).name;
/** A copy of `def` in `pid`'s hand (with `only`, the only card there). */
const inHand = (s: GameState, pid: PlayerId, def: CardDef, only = false) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  if (only) for (const h of s.players[pid]!.hand.splice(0)) s.objects[h]!.zone = "exile";
  s.players[pid]!.hand.push(id);
  return id;
};
/** A copy of `def` on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};
/** The player after `pid` in turn order. */
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % s.turnOrder.length]!;

// Real oracle text (Scryfall).
const hotPursuit = (): CardDef => ({"oracleId":"00bf9859-d5bf-455a-a4be-965ea4250c7e","name":"Hot Pursuit","manaCost":"{1}{R}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, suspect target creature an opponent controls. As long as this enchantment remains on the battlefield, that creature is also goaded.\nAt the beginning of combat on your turn, if two or more players have lost the game, gain control of all goaded and/or suspected creatures until end of turn. Untap them. They gain haste until end of turn.","colors":["R"],"colorIdentity":["R"],"keywords":["Goad","Suspect"],"commanderLegal":"legal","set":"mkc","releasedAt":"2024-02-09","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const gate = (): CardDef => ({"oracleId":"a03ab63a-83f3-4dd6-926d-08d09ce2e696","name":"Gate to the Aether","manaCost":"{6}","cmc":6,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"At the beginning of each player's upkeep, that player reveals the top card of their library. If it's an artifact, creature, enchantment, or land card, the player may put it onto the battlefield.","colors":[],"colorIdentity":[],"keywords":[],"commanderLegal":"legal","set":"mrd","releasedAt":"2003-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const omen = (): CardDef => ({"oracleId":"dbf05c40-7274-4aaa-94d7-1f28cbe15e09","name":"Omen Machine","manaCost":"{6}","cmc":6,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Players can't draw cards.\nAt the beginning of each player's draw step, that player exiles the top card of their library. If it's a land card, the player puts it onto the battlefield. Otherwise, the player casts it without paying its mana cost if able.","colors":[],"colorIdentity":[],"keywords":[],"commanderLegal":"legal","set":"nph","releasedAt":"2011-05-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const evocation = (): CardDef => ({"oracleId":"9cf1af53-ab9f-4cce-bdb5-2c13b805523d","name":"Wild Evocation","manaCost":"{5}{R}","cmc":6,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of each player's upkeep, that player reveals a card at random from their hand. If it's a land card, the player puts it onto the battlefield. Otherwise, the player casts it without paying its mana cost if able.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"m11","releasedAt":"2010-07-16","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const gambit = (): CardDef => ({"oracleId":"271d8db6-8606-46d7-9812-75aa22fcfd8e","name":"Alchemist's Gambit","manaCost":"{1}{R}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Cleave {4}{U}{U}{R} (You may cast this spell for its cleave cost. If you do, remove the words in square brackets.)\nTake an extra turn after this one. During that turn, damage can't be prevented. [At the beginning of that turn's end step, you lose the game.]\nExile Alchemist's Gambit.","colors":["R"],"colorIdentity":["R","U"],"keywords":["Cleave"],"commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const fling = (): CardDef => ({"oracleId":"24227761-b50e-4b9e-93a2-e82d053b3e3d","name":"Fling","manaCost":"{1}{R}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"As an additional cost to cast this spell, sacrifice a creature.\nFling deals damage equal to the sacrificed creature's power to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"eld","releasedAt":"2019-10-04","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const holyDay = (): CardDef => ({"oracleId":"98423a34-f044-4811-b288-56981d604b6e","name":"Holy Day","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Prevent all combat damage that would be dealt this turn.","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const terror = (): CardDef => ({"oracleId":"59e7f2ae-4535-4191-98be-3e65b6b2befa","name":"Doom Blade","manaCost":"{1}{B}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target nonblack creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const llanowar = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

describe("round 349: compiles", () => {
  it("every card of the round", () => supported(hotPursuit(), gate(), omen(), evocation(), gambit()));
});

describe("Gate to the Aether", () => {
  it("each player's upkeep: that player reveals the top card and may put a creature onto the battlefield under their own control", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, gate());
    const b = onTop(s0, opp, bears());
    let s = settle(passUntil(s0, "upkeep", opp), opp);
    // The upkeep's player decides, not Gate's controller.
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    s = settle(act(s, { type: "chooseMay", player: opp, yes: true }), opp);
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[b]!)).toBe(opp);
  });

  it("declined, the card stays on top of the library", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, gate());
    const b = onTop(s0, opp, bears());
    let s = settle(passUntil(s0, "upkeep", opp), opp);
    s = settle(act(s, { type: "chooseMay", player: opp, yes: false }), opp);
    expect(s.players[opp]!.library[0]).toBe(b);
  });

  it("an instant: nothing to ask, and it stays on top", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, gate());
    const i = onTop(s0, opp, bolt());
    const s = settle(passUntil(s0, "upkeep", opp), opp);
    expect(s.pending).toBeNull();
    expect(s.players[opp]!.library[0]).toBe(i);
  });

  it("a bot puts a land it reveals onto the battlefield", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, gate());
    const f = onTop(s0, opp, forest);
    const s = settle(passUntil(s0, "upkeep", opp));
    expect(s.objects[f]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[f]!)).toBe(opp);
  });
});

describe("Omen Machine", () => {
  it("a land exiled from the top goes onto the battlefield under that player's control, not as their land play", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, omen());
    const f = onTop(s0, opp, forest);
    const hand = s0.players[opp]!.hand.length;
    const s = settle(passUntil(s0, "draw", opp), opp);
    expect(s.objects[f]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[f]!)).toBe(opp);
    expect(s.players[opp]!.landsPlayedThisTurn).toBe(0);
    // Players can't draw cards: no draw this draw step.
    expect(s.players[opp]!.hand.length).toBe(hand);
  });

  it("a spell must be cast: declining is refused while it can be cast; cast for free, it resolves", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, omen());
    const b = putOnBattlefield(s0, ap, bears());
    const i = onTop(s0, opp, bolt());
    let s = settle(passUntil(s0, "draw", opp), opp);
    expect(s.pending).toMatchObject({ kind: "castFree", player: opp, objectId: i, must: true });
    expect(s.objects[i]!.zone).toBe("exile");
    expect(() => act(s, { type: "chooseMay", player: opp, yes: false })).toThrow(/must be cast/);
    s = settle(run(s, planCast(s, opp, i, [target(b)])), opp);
    expect(s.objects[i]!.zone).toBe("graveyard");
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("a sorcery during the draw step: its timing is ignored", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, omen());
    const d = onTop(s0, opp, divination());
    let s = settle(passUntil(s0, "draw", opp), opp);
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: d, must: true });
    s = settle(run(s, planCast(s, opp, d)), opp);
    expect(s.objects[d]!.zone).toBe("graveyard");
  });

  it("a spell that can't be cast (no legal target) stays in exile", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, omen());
    const t = onTop(s0, opp, terror());
    const s = settle(passUntil(s0, "draw", opp), opp);
    expect(s.pending).toBeNull();
    expect(s.objects[t]!.zone).toBe("exile");
  });

  it("a bot casts the spell it must, even one it wouldn't want to", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, omen());
    // Its only creature target is its own: it must still cast it (rulings).
    const mine = putOnBattlefield(s0, opp, bears());
    const t = onTop(s0, opp, terror());
    const s = settle(passUntil(s0, "draw", opp));
    expect(s.objects[t]!.zone).toBe("graveyard");
    expect(s.objects[mine]!.zone).toBe("graveyard");
  });
});

describe("Wild Evocation", () => {
  it("a land revealed at random from the hand goes onto the battlefield, not as a land play", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, evocation());
    const f = inHand(s0, opp, forest, true);
    const s = settle(passUntil(s0, "upkeep", opp), opp);
    expect(s.objects[f]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[f]!)).toBe(opp);
    expect(s.players[opp]!.landsPlayedThisTurn).toBe(0);
  });

  it("a creature card is cast in the upkeep, for free", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, evocation());
    const b = inHand(s0, opp, bears(), true);
    let s = settle(passUntil(s0, "upkeep", opp), opp);
    expect(s.pending).toMatchObject({ kind: "castFree", player: opp, objectId: b, must: true });
    s = settle(run(s, planCast(s, opp, b)), opp);
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[b]!)).toBe(opp);
  });

  it("Fling with no creature to sacrifice can't be cast and stays in the hand (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, evocation());
    const f = inHand(s0, opp, fling(), true);
    const s = settle(passUntil(s0, "upkeep", opp), opp);
    expect(s.pending).toBeNull();
    expect(s.objects[f]!.zone).toBe("hand");
  });

  it("Fling with a creature: it must be cast, the sacrifice paid", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, evocation());
    const mine = putOnBattlefield(s0, opp, bears());
    const f = inHand(s0, opp, fling(), true);
    let s = settle(passUntil(s0, "upkeep", opp), opp);
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: f, must: true });
    expect(() => act(s, { type: "chooseMay", player: opp, yes: false })).toThrow(/must be cast/);
    const life = s.players[ap]!.life;
    s = settle(s);
    expect(s.objects[f]!.zone).toBe("graveyard");
    expect(s.objects[mine]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life + s.players[next(s, opp)]!.life + s.players[next(s, next(s, opp))]!.life).toBeLessThan(life * 3);
  });
});

describe("Hot Pursuit", () => {
  /** Hot Pursuit cast and resolved, its enters trigger on the stack aimed at `aim`. */
  const entered = (aim: (s: GameState, opp: PlayerId) => ObjectId) => {
    const { s: s0, ap, opp, ids } = setup([hotPursuit()]);
    const b = aim(s0, opp);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [target(b)] });
    return { s, ap, opp, hp: ids[0]!, b };
  };

  it("the creature is suspected (menace, can't block) and goaded by you while Hot Pursuit stays", () => {
    const { s: s1, ap, hp, b } = entered((s, opp) => putOnBattlefield(s, opp, bears()));
    const s = settle(s1, ap);
    const c = characteristics(s, s.objects[b]!);
    expect(s.objects[b]!.suspected).toBeDefined();
    expect(objHasKeyword(s, s.objects[b]!, "Menace")).toBe(true);
    expect(c.goaded).toBe(true);
    expect(c.goadedBy).toEqual([ap]);
    // Hot Pursuit leaves: no longer goaded, still suspected.
    const s2 = structuredClone(s);
    moveObject(s2, hp, "graveyard");
    expect(characteristics(s2, s2.objects[b]!).goaded).toBeFalsy();
    expect(s2.objects[b]!.suspected).toBeDefined();
  });

  it("gone before its trigger resolves: the creature is suspected but not goaded (rulings)", () => {
    const { s: s1, ap, hp, b } = entered((s, opp) => putOnBattlefield(s, opp, bears()));
    moveObject(s1, hp, "graveyard");
    const s = settle(s1, ap);
    expect(s.objects[b]!.suspected).toBeDefined();
    expect(characteristics(s, s.objects[b]!).goaded).toBeFalsy();
  });

  /** Hot Pursuit on the battlefield; an opponent's suspected creature, one goaded by `goader`, and a plain one. */
  const board = (lost: number) => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, hotPursuit());
    const sus = putOnBattlefield(s0, opp, bears());
    s0.objects[sus]!.suspected = s0.nextTimestamp++;
    s0.objects[sus]!.tapped = true;
    const goaded = putOnBattlefield(s0, opp, llanowar());
    s0.effects.push({ id: `x${s0.nextId++}`, timestamp: s0.nextTimestamp++, controller: opp, sourceName: "test", duration: "game", affected: [goaded], mods: [{ kind: "goad" }] });
    const plain = putOnBattlefield(s0, opp, ornithopter());
    let others = s0.turnOrder.filter((p) => p !== ap && p !== opp);
    for (const p of others.slice(0, lost)) playerLoses(s0, p, "test");
    invalidateCharacteristics(s0);
    const s = settle(passUntil(s0, "beginCombat", ap), ap);
    return { s, ap, opp, sus, goaded, plain };
  };

  it("two players have lost: at the beginning of combat you gain control of every goaded or suspected creature, untapped, with haste", () => {
    const { s, ap, opp, sus, goaded, plain } = board(2);
    expect(controllerOf(s, s.objects[sus]!)).toBe(ap);
    expect(controllerOf(s, s.objects[goaded]!)).toBe(ap);
    expect(controllerOf(s, s.objects[plain]!)).toBe(opp);
    expect(s.objects[sus]!.tapped).toBe(false);
    expect(objHasKeyword(s, s.objects[sus]!, "Haste")).toBe(true);
    expect(objHasKeyword(s, s.objects[goaded]!, "Haste")).toBe(true);
  });

  it("only one player has lost: nothing happens (an intervening if)", () => {
    const { s, opp, sus, goaded } = board(1);
    expect(controllerOf(s, s.objects[sus]!)).toBe(opp);
    expect(controllerOf(s, s.objects[goaded]!)).toBe(opp);
    expect(s.objects[sus]!.tapped).toBe(true);
  });
});

describe("Alchemist's Gambit", () => {
  it("an extra turn in which damage can't be prevented; at its end step you lose; the card is exiled", () => {
    const { s: s0, ap, opp, ids } = setup([gambit(), holyDay()]);
    const b = putOnBattlefield(s0, ap, bears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    const turn = s.turn;
    s = passUntil(passUntil(s, "end", ap), "main1", ap);
    expect(s.turn).toBe(turn + 1);
    expect(s.extraTurn?.noPrevention).toBe(true);
    // Holy Day's prevention does nothing this turn (CR 615.12).
    s = settle(run(s, planCast(s, ap, ids[1]!)), ap);
    const life = s.players[opp]!.life;
    s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    s = passUntil(s, "main2", ap);
    expect(s.players[opp]!.life).toBe(life - 2);
    // Its end step: you lose the game, and the turn goes on to the next player (CR 800.4a).
    s = passUntil(s, "upkeep", opp);
    expect(s.players[ap]!.lost).toBe(true);
  });

  it("cast for its cleave cost: the extra turn still lets no damage be prevented, and you don't lose", () => {
    const { s: s0, ap, opp, ids } = setup([gambit()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, undefined, { alt: "cleave" })), ap);
    s = passUntil(passUntil(s, "end", ap), "main1", ap);
    expect(s.extraTurn?.noPrevention).toBe(true);
    s = passUntil(s, "upkeep", opp);
    expect(s.players[ap]!.lost).toBe(false);
    expect(s.extraTurn).toBeUndefined();
  });
});
