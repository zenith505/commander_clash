// Round 365 (Lane A): an Aura that drains the player it enchants whenever you attack them and follows whoever attacks you
// (Archnemesis); an artifact that exiles each creature cast and returns the ones it held (Mirror of Life Trapping); a
// shield against a source of your choice whose reflexive trigger deals the damage back and draws cards (New Way Forward);
// attack triggers that shrink an attacker or let the attacking player pump one (Mirkwood Trapper); and a creature phased
// out until its source leaves the battlefield (The Moment).

import { describe, expect, it } from "vitest";
import { act, bear, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";
import { moveObject } from "../src/game";

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
/** Passes until `me` has a question of `kind`, other players' questions answered as the bots would (no attacks or blocks). */
const until = (s: GameState, me: PlayerId, kind: string, max = 3000) => {
  for (let i = 0; i < max; i++) {
    const p = s.pending;
    if (p?.player === me && p.kind === kind) return s;
    const who = waitingOn(s)!;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: who, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: who, blocks: [] });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: who, objectIds: s.players[who]!.hand.slice(0, p.count) });
    else if (p) for (const a of botActions(s, who)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: who });
  }
  throw new Error(`no ${kind} for ${me}`);
};
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
const next = (s: GameState, pid: PlayerId, k = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + k) % 4]!;
const declare = (s: GameState, pid: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId }[]) => {
  s = until(s, pid, "declareAttackers");
  return act(s, { type: "declareAttackers", player: pid, attacks });
};
/** The Aura `id` enchants player `pid` (as if it had been cast on them). */
const enchant = (s: GameState, id: ObjectId, pid: PlayerId) => {
  s.objects[id]!.attachedToPlayer = pid;
  invalidateCharacteristics(s);
};
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;

// Real oracle text (Scryfall).
const arch = (): CardDef => ({"oracleId":"c408717c-e07b-484f-9c81-5666595adf81","name":"Archnemesis","manaCost":"{1}{U}{B}","cmc":3,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant opponent\nWhenever you attack enchanted player, that player loses 2 life. You draw a card and gain 2 life.\nWhenever a player attacks you, you may attach this Aura to that player.","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/b/4/b440109f-af52-415e-94d3-d4997f5bee3e.jpg?1783903274","artUrl":"https://cards.scryfall.io/art_crop/front/b/4/b440109f-af52-415e-94d3-d4997f5bee3e.jpg?1783903274","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const mirror = (): CardDef => ({"oracleId":"3ec7ae18-b203-49bd-95f9-ad5482459a23","name":"Mirror of Life Trapping","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Whenever a creature enters, if it was cast, exile it, then return all other permanent cards exiled with this artifact to the battlefield under their owners' control.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/0/a0937a60-887b-46d0-b573-099626d57bcf.jpg?1783922671","artUrl":"https://cards.scryfall.io/art_crop/front/a/0/a0937a60-887b-46d0-b573-099626d57bcf.jpg?1783922671","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const nwf = (): CardDef => ({"oracleId":"429368e6-3de1-4a44-a062-86cbbb73e243","name":"New Way Forward","manaCost":"{2}{U}{R}{W}","cmc":5,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"The next time a source of your choice would deal damage to you this turn, prevent that damage. When damage is prevented this way, New Way Forward deals that much damage to that source's controller and you draw that many cards.","colors":["R","U","W"],"colorIdentity":["R","U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/9/d9d48f9e-79f0-478c-9db0-ff7ac4a8f401.jpg?1783907303","artUrl":"https://cards.scryfall.io/art_crop/front/d/9/d9d48f9e-79f0-478c-9db0-ff7ac4a8f401.jpg?1783907303","commanderLegal":"legal","set":"tdm","releasedAt":"2025-04-11","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const trapper = (): CardDef => ({"oracleId":"debbbdb2-2fa8-413f-b394-977212915c65","name":"Mirkwood Trapper","manaCost":"{1}{G}{U}","cmc":3,"typeLine":"Creature — Elf Scout","supertypes":[],"types":["Creature"],"subtypes":["Elf","Scout"],"oracleText":"Whenever a player attacks you, target attacking creature gets -2/-0 until end of turn.\nWhenever a player attacks, if they aren't attacking you, that player chooses an attacking creature. It gets +2/+0 until end of turn.","power":"1","toughness":"4","colors":["G","U"],"colorIdentity":["G","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/ca079e59-4433-49c7-9001-abac20b776e4.jpg?1783916017","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/ca079e59-4433-49c7-9001-abac20b776e4.jpg?1783916017","commanderLegal":"legal","set":"ltc","releasedAt":"2023-06-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const moment = (): CardDef => ({"oracleId":"8a5259cc-224d-4748-b764-63ad0e4e02f1","name":"The Moment","manaCost":"{2}","cmc":2,"typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"At the beginning of your upkeep, put a time counter on The Moment.\n{2}, {T}: Untap target creature you control. It phases out until The Moment leaves the battlefield.\n{3}, {T}: Destroy each nonland permanent with mana value less than or equal to the number of time counters on The Moment. Then sacrifice The Moment. Activate only as a sorcery.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/8/683237b7-b3a9-4e34-abb4-ee0293385397.jpg?1783914522","artUrl":"https://cards.scryfall.io/art_crop/front/6/8/683237b7-b3a9-4e34-abb4-ee0293385397.jpg?1783914522","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ogre = (): CardDef => ({"oracleId":"83c8a3a6-2e1a-4e26-8847-6d066f42d906","name":"Gray Ogre","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Ogre","supertypes":[],"types":["Creature"],"subtypes":["Ogre"],"oracleText":"","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/3/73ae5276-b607-4f23-a9d2-e8cc7b8e3693.jpg?1783948685","artUrl":"https://cards.scryfall.io/art_crop/front/7/3/73ae5276-b607-4f23-a9d2-e8cc7b8e3693.jpg?1783948685","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const murder = (): CardDef => ({"oracleId":"938b4e2c-88d9-4637-bc00-e228920c9a78","name":"Murder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const forestCard = (): CardDef => ({ oracleId: "test-forest-365", name: "Forest", manaCost: "", cmc: 0, typeLine: "Basic Land — Forest", supertypes: ["Basic"], types: ["Land"], subtypes: ["Forest"], oracleText: "({T}: Add {G}.)", colors: [], colorIdentity: ["G"], keywords: [] }) as CardDef;

/** Passes priority until `pid` has it, with nothing pending, in `step` of the current turn. */
const priorityIn = (s: GameState, pid: PlayerId, step: string) => {
  for (let i = 0; i < 50; i++) {
    if (!s.pending && s.step === step && waitingOn(s) === pid) return s;
    const who = waitingOn(s)!;
    if (s.pending) for (const a of botActions(s, who)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: who });
  }
  throw new Error(`no priority for ${pid} in ${step}`);
};

describe("round 365: compiles", () => {
  it("every card of the round", () => supported(arch(), mirror(), nwf(), trapper(), moment()));
});

describe("Archnemesis", () => {
  it("whenever you attack enchanted player, that player loses 2 life, and you draw a card and gain 2 life", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, arch());
    enchant(s0, a, opp);
    const b = putOnBattlefield(s0, ap, bear());
    const hand = s0.players[ap]!.hand.length;
    const s = settle(declare(s0, ap, [{ attacker: b, defender: opp }]));
    expect(life(s, opp)).toBe(38);
    expect(life(s, ap)).toBe(42);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("doesn't trigger when you attack another player", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, arch());
    enchant(s0, a, opp);
    const b = putOnBattlefield(s0, ap, bear());
    const s = settle(declare(s0, ap, [{ attacker: b, defender: next(s0, ap, 2) }]));
    expect(life(s, opp)).toBe(40);
    expect(life(s, ap)).toBe(40);
  });

  it("whenever a player attacks you, you may attach it to that player", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, arch());
    enchant(s0, a, opp);
    const third = next(s0, ap, 2);
    const o = putOnBattlefield(s0, third, ogre());
    let s = declare(s0, third, [{ attacker: o, defender: ap }]);
    s = until(s, ap, "chooseMay");
    // A bot moves it to the player attacking it.
    expect(botActions(s, ap)).toEqual([{ type: "chooseMay", player: ap, yes: true }]);
    const yes = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(yes.objects[a]!.attachedToPlayer).toBe(third);
    const no = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(no.objects[a]!.attachedToPlayer).toBe(opp);
  });

  it("an attack on another player doesn't move it", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, arch());
    enchant(s0, a, opp);
    const third = next(s0, ap, 2);
    const o = putOnBattlefield(s0, third, ogre());
    const s = settle(declare(s0, third, [{ attacker: o, defender: opp }]));
    expect(s.objects[a]!.attachedToPlayer).toBe(opp);
  });
});

describe("Mirror of Life Trapping", () => {
  it("exiles each creature that was cast, then returns the others it holds under their owners' control", () => {
    const { s: s0, ap, ids } = setup([bear(), giant()]);
    const m = putOnBattlefield(s0, ap, mirror());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.objects[ids[1]!]!.zone).toBe("exile");
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.controller).toBe(ap);
    // The bear wasn't cast this time: it stays.
    expect(s.stack.length + s.triggerQueue.length).toBe(0);
    expect(s.objects[m]!.zone).toBe("battlefield");
  });

  it("a card another player owns returns under its owner's control, whoever cast the creature", () => {
    const { s: s0, ap, opp, ids } = setup([bear()]);
    const m = putOnBattlefield(s0, ap, mirror());
    const o = putOnBattlefield(s0, opp, ogre());
    moveObject(s0, o, "exile");
    (s0.linkedExile ??= {})[`${m}@${s0.objects[m]!.zoneChanges ?? 0}`] = [{ id: o, zc: s0.objects[o]!.zoneChanges ?? 0 }];
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    expect(s.objects[o]!.zone).toBe("battlefield");
    expect(characteristics(s, s.objects[o]!).controller).toBe(opp);
  });

  it("a creature gone before the trigger resolves isn't exiled; the others still return", () => {
    const { s: s0, ap, ids } = setup([bear(), giant()]);
    putOnBattlefield(s0, ap, mirror());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    s = run(s, planCast(s, ap, ids[1]!));
    // The giant resolves; its trigger waits while the giant is put into the graveyard.
    while (s.objects[ids[1]!]!.zone !== "battlefield") s = act(s, { type: "passPriority", player: waitingOn(s)! });
    moveObject(s, ids[1]!, "graveyard");
    s = settle(s);
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
  });

  it("a creature put onto the battlefield without being cast isn't exiled", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, mirror());
    const b = toHand(s0, ap, bear());
    moveObject(s0, b, "battlefield");
    const s = settle(s0);
    expect(s.objects[b]!.zone).toBe("battlefield");
  });
});

describe("New Way Forward", () => {
  /** Another player's Hill Giant attacks `ap`, who has New Way Forward in hand and priority after blockers. */
  const attacked = (counters = 0) => {
    const { s: s0, ap } = setup([]);
    const foe = next(s0, ap, 2);
    const w = toHand(s0, ap, nwf());
    const g = putOnBattlefield(s0, foe, giant());
    if (counters) s0.objects[g]!.counters["+1/+1"] = counters;
    let s = declare(s0, foe, [{ attacker: g, defender: ap }]);
    s = until(s, ap, "declareBlockers");
    s = act(s, { type: "declareBlockers", player: ap, blocks: [] });
    s = priorityIn(s, ap, "declareBlockers");
    return { s, ap, foe, w, g };
  };

  it("prevents the chosen source's next damage to you; when it does, deals that much damage to its controller and you draw that many cards", () => {
    const { s: s1, ap, foe, w } = attacked();
    const hand = s1.players[ap]!.hand.length - 1;
    let s = settle(run(s1, planCast(s1, ap, w)), ap);
    const p = s.pending;
    expect(p?.kind === "chooseOption" && p.what === "damageSource").toBe(true);
    if (p?.kind !== "chooseOption") throw new Error("no source choice");
    const i = p.labels!.findIndex((l) => l.startsWith("Hill Giant"));
    s = act(s, { type: "chooseOption", player: ap, choice: p.options[i]! });
    s = passUntil(s, "end", foe);
    expect(life(s, ap)).toBe(40);
    expect(life(s, foe)).toBe(37);
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
  });

  it("a bot casts it against an attacker about to deal it 4 or more damage", () => {
    const { s, ap, w } = attacked(2);
    const acts = botActions(s, ap);
    expect(acts.some((a) => a.type === "castSpell" && a.objectId === w)).toBe(true);
  });
});

describe("Mirkwood Trapper", () => {
  it("whenever a player attacks you, target attacking creature gets -2/-0 until end of turn", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, trapper());
    const foe = next(s0, ap, 2);
    const g = putOnBattlefield(s0, foe, giant());
    const s = settle(declare(s0, foe, [{ attacker: g, defender: ap }]));
    expect(power(s, s.objects[g]!)).toBe(1);
  });

  it("whenever a player attacks without attacking you, that player chooses an attacking creature: it gets +2/+0", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, trapper());
    const foe = next(s0, ap, 2);
    const g = putOnBattlefield(s0, foe, giant());
    const o = putOnBattlefield(s0, foe, ogre());
    let s = declare(s0, foe, [{ attacker: g, defender: opp }, { attacker: o, defender: opp }]);
    s = until(s, foe, "pickPermanents");
    const p = s.pending;
    expect(p?.kind === "pickPermanents" && [...p.options].sort()).toEqual([g, o].sort());
    // The attacking player (a bot here) pumps its best attacker.
    s = settle(s);
    expect(power(s, s.objects[g]!)).toBe(5);
    expect(power(s, s.objects[o]!)).toBe(2);
  });

  it("your own attack counts: you choose one of your attackers", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, trapper());
    const b = putOnBattlefield(s0, ap, bear());
    const o = putOnBattlefield(s0, ap, ogre());
    let s = declare(s0, ap, [{ attacker: b, defender: opp }, { attacker: o, defender: opp }]);
    s = until(s, ap, "pickPermanents");
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [b] }));
    expect(power(s, s.objects[b]!)).toBe(4);
    expect(power(s, s.objects[o]!)).toBe(2);
  });

  it("an attack on you and another player triggers only the first ability", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, trapper());
    const foe = next(s0, ap, 2);
    const g = putOnBattlefield(s0, foe, giant());
    const o = putOnBattlefield(s0, foe, ogre());
    const s = settle(declare(s0, foe, [{ attacker: g, defender: ap }, { attacker: o, defender: opp }]));
    expect(power(s, s.objects[g]!) + power(s, s.objects[o]!)).toBe(3);
  });
});

describe("The Moment", () => {
  it("untaps target creature you control, which phases out until The Moment leaves the battlefield", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, moment());
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[b]!.tapped = true;
    let s = settle(run(s0, planActivate(s0, ap, m, 0, [{ kind: "object", id: b }])));
    expect(s.objects[b]!.zone).toBe("phasedOut");
    expect(s.objects[b]!.tapped).toBe(false);
    // Not in its controller's untap step (rulings).
    s = passUntil(s, "main1", next(s, ap));
    s = passUntil(s, "main1", ap);
    expect(s.objects[b]!.zone).toBe("phasedOut");
    // The Moment's last ability sacrifices it: the bear phases in, untapped.
    s = settle(run(s, planActivate(s, ap, m, 1)));
    expect(s.objects[m]!.zone).toBe("graveyard");
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[b]!.tapped).toBe(false);
  });

  it("gone before the ability resolves, the creature is untapped but doesn't phase out (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, moment());
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[b]!.tapped = true;
    const s1 = run(s0, planActivate(s0, ap, m, 0, [{ kind: "object", id: b }]));
    moveObject(s1, m, "graveyard");
    const s = settle(s1);
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[b]!.tapped).toBe(false);
  });

  it("a bot phases out its creature in answer to an opponent's removal spell", () => {
    const { s: s0, ap, opp, ids } = setup([murder()]);
    const m = putOnBattlefield(s0, opp, moment());
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, opp, forestCard());
    const b = putOnBattlefield(s0, opp, bear());
    // Without a threat it keeps the ability.
    expect(botActions(s0, opp).some((a) => a.type === "activateAbility" && a.objectId === m)).toBe(false);
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: b }]));
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const acts = botActions(s, opp);
    expect(acts.some((a) => a.type === "activateAbility" && a.objectId === m)).toBe(true);
    for (const a of acts) s = act(s, a);
    s = settle(s);
    expect(s.objects[b]!.zone).toBe("phasedOut");
  });
});
