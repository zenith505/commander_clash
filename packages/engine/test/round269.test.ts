// Round 269, earlier skips from the top of the popularity list: Zoyowa Lava-Tongue and Osseous Sticktwister ("each
// opponent may discard a card or sacrifice a permanent ... deals damage to each opponent who didn't", a punisher), Jin
// Sakai, Ghost of Tsushima ("attacks a player, if no other creatures are attacking that player", checked again as it
// resolves), Sanctuary Warden ("you may remove a counter from a creature or planeswalker you control. If you do"),
// Craig Boone, Novac Guard (a reflexive trigger once for every two quest counters put, damage unless the creature's
// controller takes it), Ravenous Rotbelly ("sacrifice up to three Zombies. When you sacrifice one or more Zombies this
// way"), Soul Diviner (remove a counter from an artifact, creature, land, or planeswalker as a cost), Dyadrine, Synthesis
// Amalgam ("remove a +1/+1 counter from each of two creatures you control. If you do").

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, invalidateCharacteristics, isFullySupported, moveObject, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

const C = {
  zoyowa: {"oracleId": "e90f298f-c54b-4fe8-82db-5b9153a57712", "name": "Zoyowa Lava-Tongue", "manaCost": "{B}{R}", "cmc": 2, "typeLine": "Legendary Creature — Goblin Warlock", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Goblin", "Warlock"], "oracleText": "Deathtouch\nAt the beginning of your end step, if you descended this turn, each opponent may discard a card or sacrifice a permanent of their choice. Zoyowa deals 3 damage to each opponent who didn't. (You descended if a permanent card was put into your graveyard from anywhere.)", "power": "2", "toughness": "2", "colors": ["B", "R"], "colorIdentity": ["B", "R"], "keywords": ["Deathtouch"], "commanderLegal": "legal", "set": "lci", "releasedAt": "2023-11-17", "rarity": "uncommon", "layout": "normal", "gameChanger": false} as CardDef,
  osseous: {"oracleId": "33c3a81a-6cea-48c9-b966-67084d96e74f", "name": "Osseous Sticktwister", "manaCost": "{1}{B}", "cmc": 2, "typeLine": "Artifact Creature — Scarecrow", "supertypes": [], "types": ["Artifact", "Creature"], "subtypes": ["Scarecrow"], "oracleText": "Lifelink\nDelirium — At the beginning of your end step, if there are four or more card types among cards in your graveyard, each opponent may sacrifice a nonland permanent of their choice or discard a card. Then this creature deals damage equal to its power to each opponent who didn't sacrifice a permanent or discard a card this way.", "power": "2", "toughness": "2", "colors": ["B"], "colorIdentity": ["B"], "keywords": ["Delirium", "Lifelink"], "commanderLegal": "legal", "set": "dsk", "releasedAt": "2024-09-27", "rarity": "uncommon", "layout": "normal", "gameChanger": false} as CardDef,
  jin: {"oracleId": "76c43ac8-a878-4239-b0e3-f0254ef63e50", "name": "Jin Sakai, Ghost of Tsushima", "manaCost": "{1}{W}{U}{B}", "cmc": 4, "typeLine": "Legendary Creature — Human Samurai", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Samurai"], "oracleText": "Whenever Jin Sakai deals combat damage to a player, draw a card.\nWhenever a creature you control attacks a player, if no other creatures are attacking that player, choose one —\n• Standoff — It gains double strike until end of turn.\n• Ghost — It can't be blocked this turn.", "power": "2", "toughness": "4", "colors": ["B", "U", "W"], "colorIdentity": ["B", "U", "W"], "keywords": ["Ghost", "Standoff"], "commanderLegal": "legal", "set": "sld", "releasedAt": "2025-10-27", "rarity": "mythic", "layout": "normal", "gameChanger": false} as CardDef,
  warden: {"oracleId": "713bcfb6-e5ea-411e-b4b3-52e5eed5cdf1", "name": "Sanctuary Warden", "manaCost": "{4}{W}{W}", "cmc": 6, "typeLine": "Creature — Angel Soldier", "supertypes": [], "types": ["Creature"], "subtypes": ["Angel", "Soldier"], "oracleText": "Flying\nThis creature enters with two shield counters on it.\nWhenever this creature enters or attacks, you may remove a counter from a creature or planeswalker you control. If you do, draw a card and create a 1/1 green and white Citizen creature token.", "power": "5", "toughness": "5", "colors": ["W"], "colorIdentity": ["W"], "keywords": ["Flying"], "commanderLegal": "legal", "set": "snc", "releasedAt": "2022-04-29", "rarity": "mythic", "layout": "normal", "gameChanger": false} as CardDef,
  craig: {"oracleId": "74f4743b-06a9-48e3-9fdf-27a56660ac8e", "name": "Craig Boone, Novac Guard", "manaCost": "{1}{R}{W}", "cmc": 3, "typeLine": "Legendary Creature — Human Soldier", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Soldier"], "oracleText": "Reach, lifelink\nOne for My Baby — Whenever you attack with two or more creatures, put two quest counters on Craig Boone. When you do, Craig Boone deals damage equal to the number of quest counters on it to up to one target creature unless that creature's controller has Craig Boone deal that much damage to them.", "power": "3", "toughness": "3", "colors": ["R", "W"], "colorIdentity": ["R", "W"], "keywords": ["Lifelink", "Reach", "One for My Baby"], "commanderLegal": "legal", "set": "pip", "releasedAt": "2024-03-08", "rarity": "uncommon", "layout": "normal", "gameChanger": false} as CardDef,
  rotbelly: {"oracleId": "8f0738ce-1f07-422c-9895-8ac3c65f9054", "name": "Ravenous Rotbelly", "manaCost": "{4}{B}", "cmc": 5, "typeLine": "Creature — Zombie Horror", "supertypes": [], "types": ["Creature"], "subtypes": ["Zombie", "Horror"], "oracleText": "When this creature enters, you may sacrifice up to three Zombies. When you sacrifice one or more Zombies this way, each opponent sacrifices that many creatures of their choice.", "power": "4", "toughness": "5", "colors": ["B"], "colorIdentity": ["B"], "keywords": [], "commanderLegal": "legal", "set": "mic", "releasedAt": "2021-09-24", "rarity": "rare", "layout": "normal", "gameChanger": false} as CardDef,
  diviner: {"oracleId": "a7c5318f-e579-447e-9109-7d2e4b3d2c17", "name": "Soul Diviner", "manaCost": "{U}{B}", "cmc": 2, "typeLine": "Creature — Zombie Wizard", "supertypes": [], "types": ["Creature"], "subtypes": ["Zombie", "Wizard"], "oracleText": "{T}, Remove a counter from an artifact, creature, land, or planeswalker you control: Draw a card.", "power": "2", "toughness": "3", "colors": ["B", "U"], "colorIdentity": ["B", "U"], "keywords": [], "commanderLegal": "legal", "set": "war", "releasedAt": "2019-05-03", "rarity": "rare", "layout": "normal", "gameChanger": false} as CardDef,
  dyadrine: {"oracleId": "618a2272-62e0-4d0e-834d-7b81719eba12", "name": "Dyadrine, Synthesis Amalgam", "manaCost": "{X}{G}{W}", "cmc": 2, "typeLine": "Legendary Artifact Creature — Construct", "supertypes": ["Legendary"], "types": ["Artifact", "Creature"], "subtypes": ["Construct"], "oracleText": "Trample\nDyadrine enters with a number of +1/+1 counters on it equal to the amount of mana spent to cast it.\nWhenever you attack, you may remove a +1/+1 counter from each of two creatures you control. If you do, draw a card and create a 2/2 colorless Robot artifact creature token.", "power": "0", "toughness": "1", "colors": ["G", "W"], "colorIdentity": ["G", "W"], "keywords": ["Trample"], "commanderLegal": "legal", "set": "eoe", "releasedAt": "2025-08-01", "rarity": "rare", "layout": "normal", "gameChanger": false} as CardDef,
};

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question but blockers (none declared). */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const opps = (s: GameState, ap: PlayerId) => [1, 2, 3].map((k) => s.turnOrder[(s.turnOrder.indexOf(ap) + k) % s.turnOrder.length]!) as [PlayerId, PlayerId, PlayerId];
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of [...s.players[pid]!.hand]) {
    s.players[pid]!.hand.splice(s.players[pid]!.hand.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    s.players[pid]!.library.push(id);
  }
};
/** Declares the attack and stops there, with its triggers waiting. */
const declare = (s: GameState, ap: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId }[]) => {
  s = passUntil(s, "declareAttackers", ap);
  if (s.pending?.kind !== "declareAttackers") throw new Error("no attack");
  return act(s, { type: "declareAttackers", player: ap, attacks });
};
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]?.name === name);
const zombie = (name: string) => card(name, "Creature — Zombie", "{1}{B}", { power: "2", toughness: "2" });

describe("round 269 cards", () => {
  it("all compile fully", () => {
    for (const def of Object.values(C)) expect(isFullySupported(def), def.name).toBe(true);
  });
});

describe("Zoyowa Lava-Tongue", () => {
  const atEnd = (descended: boolean) => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    putOnBattlefield(s, ap, C.zoyowa);
    const [b, c, d] = opps(s, ap);
    // B and D have cards in hand and a creature; C has only a creature.
    putOnBattlefield(s, b, bear());
    emptyHand(s, c);
    const cBear = putOnBattlefield(s, c, bear());
    putOnBattlefield(s, d, bear());
    if (descended) s.descendedThisTurn = [ap];
    s = passUntil(s, "end", ap);
    return { s: settle(s), ap, b, c, d, cBear };
  };

  it("each opponent in turn may discard or sacrifice; those who did neither are dealt 3 damage", () => {
    let { s, b, c, d, cBear } = atEnd(true);
    const life = (p: PlayerId) => s.players[p]!.life;
    const before = { b: life(b), c: life(c), d: life(d) };
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "punisher", player: b, options: ["0", "1", "none"] });
    s = act(s, { type: "chooseOption", player: b, choice: "0" });
    expect(s.pending).toMatchObject({ kind: "discard", player: b });
    const card0 = s.players[b]!.hand[0]!;
    s = act(s, { type: "discard", player: b, objectIds: [card0] });
    // C has no card to discard: only the sacrifice, or neither.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "punisher", player: c, options: ["1", "none"] });
    s = act(s, { type: "chooseOption", player: c, choice: "1" });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "punisher", player: d });
    s = act(s, { type: "chooseOption", player: d, choice: "none" });
    s = settle(s);
    expect(s.objects[card0]!.zone).toBe("graveyard");
    expect(s.objects[cBear]!.zone).toBe("graveyard");
    expect(life(b)).toBe(before.b);
    expect(life(c)).toBe(before.c);
    expect(life(d)).toBe(before.d - 3);
  });

  it("doesn't trigger if you haven't descended this turn", () => {
    const { s, b, d } = atEnd(false);
    expect(s.pending).toBeFalsy();
    expect(s.players[d]!.life).toBe(s.players[b]!.life);
  });
});

describe("Osseous Sticktwister", () => {
  const delirium = () => {
    const { s: s0, ap } = setup([]);
    const s = s0;
    const me = putOnBattlefield(s, ap, C.osseous);
    into(s, ap, card("Yard Land", "Land"), "graveyard");
    into(s, ap, bear({ name: "Yard Bear" }), "graveyard");
    into(s, ap, card("Yard Instant", "Instant", "{U}", { oracleText: "Draw a card." }), "graveyard");
    into(s, ap, card("Yard Sorcery", "Sorcery", "{R}", { oracleText: "Draw a card." }), "graveyard");
    return { s, ap, me };
  };
  const neither = (s: GameState, ap: PlayerId) => {
    for (const p of opps(s, ap)) {
      expect(s.pending).toMatchObject({ kind: "chooseOption", what: "punisher", player: p });
      s = act(s, { type: "chooseOption", player: p, choice: "none" });
    }
    return settle(s);
  };

  it("deals damage equal to its power as the ability resolves to each opponent who did neither (lifelink)", () => {
    let { s, ap, me } = delirium();
    s = passUntil(s, "end", ap);
    // In response, it gets +3/+0: its power as the ability resolves.
    addEffect(s, ap, [me], [{ kind: "modifyPT", power: 3, toughness: 0 }]);
    s = settle(s);
    const life = opps(s, ap).map((p) => s.players[p]!.life);
    const mine = s.players[ap]!.life;
    s = neither(s, ap);
    expect(opps(s, ap).map((p) => s.players[p]!.life)).toEqual(life.map((l) => l - 5));
    expect(s.players[ap]!.life).toBe(mine + 15);
  });

  it("uses its power as it last existed if it has left the battlefield", () => {
    let { s, ap, me } = delirium();
    s = passUntil(s, "end", ap);
    addEffect(s, ap, [me], [{ kind: "modifyPT", power: 1, toughness: 0 }]);
    moveObject(s, me, "exile");
    s = settle(s);
    const life = opps(s, ap).map((p) => s.players[p]!.life);
    s = neither(s, ap);
    expect(opps(s, ap).map((p) => s.players[p]!.life)).toEqual(life.map((l) => l - 3));
  });
});

describe("Jin Sakai, Ghost of Tsushima", () => {
  const board = () => {
    const { s: s0, ap } = setup([]);
    const s = s0;
    const jin = putOnBattlefield(s, ap, C.jin);
    const b1 = putOnBattlefield(s, ap, bear({ name: "Bear One" }));
    const b2 = putOnBattlefield(s, ap, bear({ name: "Bear Two" }));
    return { s, ap, jin, b1, b2, ob: opps(s, ap) };
  };

  it("triggers only for a creature that's the only one attacking that player", () => {
    let { s, ap, jin, b1, b2, ob } = board();
    s = declare(s, ap, [{ attacker: b1, defender: ob[0]! }, { attacker: b2, defender: ob[1]! }, { attacker: jin, defender: ob[1]! }]);
    // One trigger, for Bear One; its mode is chosen as it's put on the stack.
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseModes" });
    s = act(s, { type: "chooseModes", player: ap, modes: [0] } as Action);
    s = settle(s);
    expect(objHasKeyword(s, s.objects[b1]!, "Double strike")).toBe(true);
    expect(objHasKeyword(s, s.objects[b2]!, "Double strike")).toBe(false);
    expect(objHasKeyword(s, s.objects[jin]!, "Double strike")).toBe(false);
  });
});

describe("Jin Sakai, Ghost of Tsushima: the intervening if", () => {
  it("does nothing if another creature is attacking that player as it resolves", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    putOnBattlefield(s, ap, C.jin);
    const b1 = putOnBattlefield(s, ap, bear({ name: "Bear One" }));
    const [b] = opps(s, ap);
    s = declare(s, ap, [{ attacker: b1, defender: b! }]);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseModes" });
    s = act(s, { type: "chooseModes", player: ap, modes: [1] } as Action);
    // Before it resolves, a creature enters attacking that player (CR 508.4).
    const late = putOnBattlefield(s, ap, bear({ name: "Late Bear" }));
    s.objects[late]!.attacking = b!;
    invalidateCharacteristics(s);
    s = settle(s);
    const blocker = putOnBattlefield(s, b!, bear({ name: "Blocker" }));
    s = passUntil(s, "declareBlockers", ap);
    expect(s.pending).toMatchObject({ kind: "declareBlockers" });
    // Not unblockable: the ability did nothing.
    s = act(s, { type: "declareBlockers", player: b!, blocks: [{ blocker, attacker: b1 }] });
    expect(s.objects[blocker]!.blocking).toContain(b1);
  });
});

describe("Sanctuary Warden", () => {
  it("as it enters, removes a counter of any kind from a creature or planeswalker you control, then draws and makes a Citizen", () => {
    const { s: s0, ap, ids } = setup([C.warden]);
    let s = s0;
    const other = putOnBattlefield(s, ap, bear({ name: "Countered Bear" }));
    s.objects[other]!.counters = { "-1/-1": 1 };
    invalidateCharacteristics(s);
    const hand = s.players[ap]!.hand.length;
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    const warden = ids[0]!;
    expect(s.objects[warden]!.counters.shield).toBe(2);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap });
    expect((s.pending as { options: ObjectId[] }).options.sort()).toEqual([warden, other].sort());
    s = act(s, { type: "pickPermanents", player: ap, ids: [other] });
    s = settle(s);
    expect(s.objects[other]!.counters["-1/-1"] ?? 0).toBe(0);
    expect(s.objects[warden]!.counters.shield).toBe(2);
    expect(s.players[ap]!.hand.length).toBe(hand); // cast from hand, then drew one
    expect(named(s, ap, "Citizen Token")).toHaveLength(1);
  });

  it("the bot takes the -1/-1 counter off its bear rather than a shield counter off the Warden", () => {
    const { s: s0, ap, ids } = setup([C.warden]);
    let s = s0;
    const other = putOnBattlefield(s, ap, bear({ name: "Countered Bear" }));
    s.objects[other]!.counters = { "-1/-1": 1 };
    invalidateCharacteristics(s);
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = run(s, botActions(s, ap));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap });
    expect(botActions(s, ap)).toEqual([{ type: "pickPermanents", player: ap, ids: [other] }]);
  });

  it("with no counters on your creatures and planeswalkers, nothing happens when it attacks", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const warden = putOnBattlefield(s, ap, C.warden);
    const hand = s.players[ap]!.hand.length;
    s = declare(s, ap, [{ attacker: warden, defender: opps(s, ap)[0]! }]);
    s = settle(s);
    expect(s.pending?.kind === "chooseMay").toBe(false);
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(named(s, ap, "Citizen Token")).toHaveLength(0);
  });
});

describe("Craig Boone, Novac Guard", () => {
  const attack = (doubling: boolean) => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const craig = putOnBattlefield(s, ap, C.craig);
    if (doubling) putOnBattlefield(s, ap, card("Doubling Season", "Enchantment", "{4}{G}", { oracleText: "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\nIf an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead." }));
    const b1 = putOnBattlefield(s, ap, bear({ name: "Bear One" }));
    const b2 = putOnBattlefield(s, ap, bear({ name: "Bear Two" }));
    const [b] = opps(s, ap);
    const big = putOnBattlefield(s, b!, card("Big Wall", "Creature — Wall", "{4}", { power: "0", toughness: "6" }));
    s = declare(s, ap, [{ attacker: b1, defender: b! }, { attacker: b2, defender: b! }]);
    s = settle(s);
    return { s, ap, craig, b: b!, big };
  };

  it("two quest counters, then damage equal to them to up to one target creature unless its controller takes it", () => {
    let { s, ap, craig, b, big } = attack(false);
    expect(s.objects[craig]!.counters.quest).toBe(2);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: big }] } as Action);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "punisher", player: b, options: ["0", "none"] });
    const life = s.players[b]!.life;
    s = act(s, { type: "chooseOption", player: b, choice: "0" });
    s = settle(s);
    expect(s.players[b]!.life).toBe(life - 2);
    expect(s.objects[big]!.damage).toBe(0);
  });

  it("the creature is dealt the damage if its controller declines", () => {
    let { s, ap, b, big } = attack(false);
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: big }] } as Action);
    s = settle(s);
    const life = s.players[b]!.life;
    s = act(s, { type: "chooseOption", player: b, choice: "none" });
    s = settle(s);
    expect(s.players[b]!.life).toBe(life);
    expect(s.objects[big]!.damage).toBe(2);
  });

  it("with Doubling Season, four counters: the reflexive ability triggers twice, for 4 each (rulings)", () => {
    let { s, ap, craig, b, big } = attack(true);
    expect(s.objects[craig]!.counters.quest).toBe(4);
    for (let k = 0; k < 2; k++) {
      expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
      s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: big }] } as Action);
    }
    s = settle(s);
    for (let k = 0; k < 2; k++) {
      expect(s.pending).toMatchObject({ kind: "chooseOption", what: "punisher", player: b });
      s = act(s, { type: "chooseOption", player: b, choice: "none" });
      s = settle(s);
    }
    expect(s.objects[big]!.zone).toBe("graveyard");
  });
});

describe("Ravenous Rotbelly", () => {
  const enter = () => {
    const { s: s0, ap, ids } = setup([C.rotbelly]);
    let s = s0;
    const z = [putOnBattlefield(s, ap, zombie("Zombie One")), putOnBattlefield(s, ap, zombie("Zombie Two")), putOnBattlefield(s, ap, zombie("Zombie Three"))];
    const [b, c, d] = opps(s, ap);
    const bears = [putOnBattlefield(s, b!, bear()), putOnBattlefield(s, b!, bear()), putOnBattlefield(s, b!, bear())];
    const cBear = putOnBattlefield(s, c!, bear());
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    return { s, ap, z, b: b!, c: c!, d: d!, bears, cBear, me: ids[0]! };
  };

  it("sacrifice up to three Zombies; then each opponent sacrifices that many creatures", () => {
    let { s, ap, z, b, c, bears, cBear, me } = enter();
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "sacrifice", min: 0, count: 3 });
    // Rotbelly is a Zombie too.
    expect((s.pending as { options: ObjectId[] }).options).toContain(me);
    s = act(s, { type: "pickPermanents", player: ap, ids: [z[0]!, z[1]!] });
    expect(s.objects[z[0]!]!.zone).toBe("graveyard");
    s = settle(s);
    // B picks two of three; C has only one.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: b, action: "sacrifice", count: 2 });
    s = act(s, { type: "pickPermanents", player: b, ids: [bears[0]!, bears[1]!] });
    s = settle(s);
    expect(bears.map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "battlefield"]);
    expect(s.objects[cBear]!.zone).toBe("graveyard");
    expect(s.objects[z[2]!]!.zone).toBe("battlefield");
  });

  it("sacrificing none: no reflexive ability", () => {
    let { s, ap, bears } = enter();
    s = act(s, { type: "pickPermanents", player: ap, ids: [] });
    s = settle(s);
    expect(s.pending).toBeFalsy();
    expect(s.stack).toHaveLength(0);
    expect(bears.every((id) => s.objects[id]!.zone === "battlefield")).toBe(true);
  });
});

describe("Soul Diviner", () => {
  it("removes a counter of any kind from a land or artifact you control as its cost", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const diviner = putOnBattlefield(s, ap, C.diviner);
    const land = putOnBattlefield(s, ap, card("Counter Land", "Land"));
    s.objects[land]!.counters = { charge: 2 };
    const hand = s.players[ap]!.hand.length;
    s = run(s, planActivate(s, ap, diviner, 0, [], undefined, undefined, undefined, { counters: [{ id: land, kind: "charge" }] }));
    s = settle(s);
    expect(s.objects[land]!.counters.charge).toBe(1);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("can't be activated with no counter on such a permanent", () => {
    const { s, ap } = setup([]);
    const diviner = putOnBattlefield(s, ap, C.diviner);
    const ench = putOnBattlefield(s, ap, card("Counter Enchantment", "Enchantment"));
    s.objects[ench]!.counters = { charge: 2 };
    expect(planActivate(s, ap, diviner, 0, [])).toBeNull();
  });
});

describe("Dyadrine, Synthesis Amalgam", () => {
  it("whenever you attack, may remove a +1/+1 counter from each of two creatures to draw and make a Robot", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const dy = putOnBattlefield(s, ap, C.dyadrine);
    s.objects[dy]!.counters = { "+1/+1": 3 };
    const b1 = putOnBattlefield(s, ap, bear({ name: "Bear One" }));
    s.objects[b1]!.counters = { "+1/+1": 1 };
    const b2 = putOnBattlefield(s, ap, bear({ name: "Bear Two" }));
    s.objects[b2]!.counters = { "+1/+1": 1 };
    invalidateCharacteristics(s);
    const hand = s.players[ap]!.hand.length;
    s = declare(s, ap, [{ attacker: dy, defender: opps(s, ap)[0]! }]);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, count: 2 });
    s = act(s, { type: "pickPermanents", player: ap, ids: [dy, b2] });
    s = settle(s);
    expect([s.objects[dy]!.counters["+1/+1"], s.objects[b1]!.counters["+1/+1"], s.objects[b2]!.counters["+1/+1"]]).toEqual([2, 1, 0]);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(named(s, ap, "Robot Token")).toHaveLength(1);
  });

  it("can't with only one creature with a +1/+1 counter", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const dy = putOnBattlefield(s, ap, C.dyadrine);
    s.objects[dy]!.counters = { "+1/+1": 3 };
    invalidateCharacteristics(s);
    const hand = s.players[ap]!.hand.length;
    s = declare(s, ap, [{ attacker: dy, defender: opps(s, ap)[0]! }]);
    s = settle(s);
    expect(s.pending?.kind === "chooseMay").toBe(false);
    expect(s.players[ap]!.hand.length).toBe(hand);
  });
});

