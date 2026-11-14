// Round 366 (Lane A): a shield on one creature's next combat damage to players that makes Mites (Ria Ivor, Bane of
// Bladehold); a reduction for the next face-down spell and abilities triggering again when a permanent turns face up
// (Panoptic Projektor); mana burn and mana for every player (Yurlok of Scorch Thrash); an Aura that trades its creature
// for an extra combat (Breath of Fury); and an Aura that blinks its creature with every Aura on it (Flickerform).

import { describe, expect, it } from "vitest";
import { act, addEffect, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, planTurnFaceUp, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

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
/** Passes (no attacks, no blocks) until `step` of the current turn, with `pid` holding priority and nothing pending. */
const priorityIn = (s: GameState, pid: PlayerId, step: string) => {
  for (let i = 0; i < 400; i++) {
    if (!s.pending && s.step === step && waitingOn(s) === pid && !s.stack.length) return s;
    const who = waitingOn(s)!;
    const p = s.pending;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: who, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: who, blocks: [] });
    else if (p) for (const a of botActions(s, who)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: who });
  }
  throw new Error(`no priority for ${pid} in ${step}`);
};
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).name === name);
const tappedLands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.tapped && s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).types.includes("Land")).length;
const pool = (s: GameState, pid: PlayerId) => Object.values(s.players[pid]!.manaPool).reduce((a, n) => a + n, 0);
const attach = (s: GameState, aura: ObjectId, host: ObjectId) => {
  s.objects[aura]!.attachedTo = host;
  invalidateCharacteristics(s);
};
const morph = card("Test Morph", "Creature — Beast", "{4}{G}", { cmc: 5, power: "4", toughness: "4", oracleText: "Morph {2}{G}", keywords: ["Morph"] });
/** Cast face down for {3} (CR 702.37c). */
const faceDown = (s: GameState, pid: PlayerId, id: ObjectId) => settle(run(s, planCast(s, pid, id, undefined, undefined, "auto", undefined, { faceDown: true })), pid);

// Real oracle text (Scryfall).
const ria = (): CardDef => ({"oracleId":"785f55bb-d47c-470c-94d4-95f69055e35f","name":"Ria Ivor, Bane of Bladehold","manaCost":"{2}{W}{B}","cmc":4,"typeLine":"Legendary Creature — Phyrexian Knight","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Phyrexian","Knight"],"oracleText":"Battle cry (Whenever this creature attacks, each other attacking creature gets +1/+0 until end of turn.)\nAt the beginning of combat on your turn, the next time target creature would deal combat damage to one or more players this combat, prevent that damage. If damage is prevented this way, create that many 1/1 colorless Phyrexian Mite artifact creature tokens with toxic 1 and \"This token can't block.\"","power":"3","toughness":"4","colors":["B","W"],"colorIdentity":["B","W"],"keywords":["Battle Cry"],"imageUrl":"https://cards.scryfall.io/normal/front/f/7/f7531ed3-235f-4368-98a8-e4e1947c53fb.jpg?1783917997","artUrl":"https://cards.scryfall.io/art_crop/front/f/7/f7531ed3-235f-4368-98a8-e4e1947c53fb.jpg?1783917997","commanderLegal":"legal","set":"one","releasedAt":"2023-02-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const projektor = (): CardDef => ({"oracleId":"1e1a787a-2294-472d-908d-d4d72821a7cc","name":"Panoptic Projektor","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: The next face-down creature spell you cast this turn costs {3} less to cast.\nIf turning a face-down permanent face up causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/0/b0912773-42ae-4149-aaa5-194856a1055a.jpg?1783913038","artUrl":"https://cards.scryfall.io/art_crop/front/b/0/b0912773-42ae-4149-aaa5-194856a1055a.jpg?1783913038","commanderLegal":"legal","set":"mkc","releasedAt":"2024-02-09","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const yurlok = (): CardDef => ({"oracleId":"7baaf462-b0e6-4e21-86a7-73a883c4c9f7","name":"Yurlok of Scorch Thrash","manaCost":"{1}{B}{R}{G}","cmc":4,"typeLine":"Legendary Creature — Lizard Shaman","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Lizard","Shaman"],"oracleText":"Vigilance\nA player losing unspent mana causes that player to lose that much life.\n{1}, {T}: Each player adds {B}{R}{G}.","power":"4","toughness":"4","colors":["B","G","R"],"colorIdentity":["B","G","R"],"keywords":["Vigilance"],"producedMana":["B","G","R"],"imageUrl":"https://cards.scryfall.io/normal/front/e/a/ead8a1f5-6260-47fa-a649-43711ec5bbeb.jpg?1783928767","artUrl":"https://cards.scryfall.io/art_crop/front/e/a/ead8a1f5-6260-47fa-a649-43711ec5bbeb.jpg?1783928767","commanderLegal":"legal","set":"cmr","releasedAt":"2020-11-20","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const breath = (): CardDef => ({"oracleId":"fdaa0faf-e7ee-48b3-9330-de0fc3792ad3","name":"Breath of Fury","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature you control\nWhen enchanted creature deals combat damage to a player, sacrifice it and attach this Aura to a creature you control. If you do, untap all creatures you control and after this phase, there is an additional combat phase.","colors":["R"],"colorIdentity":["R"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/76b4f5b1-9a5f-442b-9990-4c0d654df6f0.jpg?1783903468","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/76b4f5b1-9a5f-442b-9990-4c0d654df6f0.jpg?1783903468","commanderLegal":"legal","set":"sld","releasedAt":"2026-05-11","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const flicker = (): CardDef => ({"oracleId":"e5345c28-7046-4ff3-a5d6-eeb7a0fb230b","name":"Flickerform","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\n{2}{W}{W}: Exile enchanted creature and all Auras attached to it. At the beginning of the next end step, return that card to the battlefield under its owner's control. If you do, return the other cards exiled this way to the battlefield under their owners' control attached to that creature.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/6/1/6165de5d-57f0-419b-95a1-02bd53e5a0c5.jpg?1783943701","artUrl":"https://cards.scryfall.io/art_crop/front/6/1/6165de5d-57f0-419b-95a1-02bd53e5a0c5.jpg?1783943701","commanderLegal":"legal","set":"rav","releasedAt":"2005-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const plans = (): CardDef => ({"oracleId":"7d0d7480-fddf-4841-bc2a-239e03f97f60","name":"Secret Plans","manaCost":"{G}{U}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Face-down creatures you control get +0/+1.\nWhenever a permanent you control is turned face up, draw a card.","colors":["G","U"],"colorIdentity":["G","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/1/01589046-a969-400f-b4ac-90cbbb814504.jpg?1783939054","artUrl":"https://cards.scryfall.io/art_crop/front/0/1/01589046-a969-400f-b4ac-90cbbb814504.jpg?1783939054","commanderLegal":"legal","set":"ktk","releasedAt":"2014-09-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const strength = (): CardDef => ({"oracleId":"9357de36-f8be-4f49-b2c8-9fe9eaf82b07","name":"Holy Strength","manaCost":"{W}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature gets +1/+2.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/e/2/e21264cb-d915-4431-92fd-b0aa32a715fc.jpg?1783943078","artUrl":"https://cards.scryfall.io/art_crop/front/e/2/e21264cb-d915-4431-92fd-b0aa32a715fc.jpg?1783943078","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ogre = (): CardDef => ({"oracleId":"83c8a3a6-2e1a-4e26-8847-6d066f42d906","name":"Gray Ogre","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Ogre","supertypes":[],"types":["Creature"],"subtypes":["Ogre"],"oracleText":"","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/3/73ae5276-b607-4f23-a9d2-e8cc7b8e3693.jpg?1783948685","artUrl":"https://cards.scryfall.io/art_crop/front/7/3/73ae5276-b607-4f23-a9d2-e8cc7b8e3693.jpg?1783948685","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const short = (): CardDef => ({"oracleId":"48207d1c-448a-4e1b-974a-642dfea75933","name":"Mana Short","manaCost":"{2}{U}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Tap all lands target player controls and that player loses all unspent mana.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/3/73e3e0b3-5284-464f-8c62-0f7801c966f5.jpg?1783948704","artUrl":"https://cards.scryfall.io/art_crop/front/7/3/73e3e0b3-5284-464f-8c62-0f7801c966f5.jpg?1783948704","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const unrest = (): CardDef => ({"oracleId":"090d88a9-7f2d-4bd1-a30a-7c48d05068be","name":"Unholy Strength","manaCost":"{B}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature gets +2/+1.","colors":["B"],"colorIdentity":["B"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/8/a/8adc48d8-7ff9-46d4-921a-03e63ca41a66.jpg?1783943025","artUrl":"https://cards.scryfall.io/art_crop/front/8/a/8adc48d8-7ff9-46d4-921a-03e63ca41a66.jpg?1783943025","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

describe("round 366: compiles", () => {
  it("every card of the round", () => supported(ria(), projektor(), yurlok(), breath(), flicker()));
});

/** To `pid`'s beginning of combat with Ria Ivor's trigger asking for its target. */
const riaTarget = (s0: GameState, pid: PlayerId) => {
  let s = s0;
  for (let i = 0; i < 50 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(s.pending).toMatchObject({ kind: "chooseTargets", player: pid });
  return s;
};

describe("Ria Ivor, Bane of Bladehold", () => {
  it("prevents the target's next combat damage to a player this combat and makes that many Mites", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, ria());
    const g = putOnBattlefield(s0, ap, giant());
    let s = riaTarget(s0, ap);
    // A bot aims it at one of its own creatures, not an opponent's.
    putOnBattlefield(s, opp, ogre());
    const bot = botActions(s, ap)[0];
    expect(bot?.type === "chooseTargets" && bot.targets[0]?.kind === "object" && [r, g].includes(bot.targets[0].id)).toBe(true);
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: g }] });
    s = until(s, ap, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: r, defender: opp }, { attacker: g, defender: opp }] });
    s = priorityIn(s, ap, "endCombat");
    // Ria's 3 is dealt; the Giant's 4 (battle cry) is prevented, and makes four Mites.
    expect(life(s, opp)).toBe(37);
    const mites = named(s, ap, "Phyrexian Mite Token");
    expect(mites.length).toBe(4);
    const m = characteristics(s, s.objects[mites[0]!]!);
    expect(m.types).toEqual(["Artifact", "Creature"]);
    expect(m.keywords).toContain("Toxic 1");
    // The shield is gone with this combat.
    expect(s.damageRules ?? []).toEqual([]);
  });

  it("damage to a creature isn't prevented and doesn't use the shield up; it ends with the combat", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, giant());
    putOnBattlefield(s0, ap, ria());
    const o = putOnBattlefield(s0, opp, ogre());
    let s = riaTarget(s0, ap);
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: g }] });
    s = until(s, ap, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: g, defender: opp }] });
    for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: o, attacker: g }] });
    s = priorityIn(s, ap, "endCombat");
    expect(s.objects[o]!.zone).toBe("graveyard");
    expect(named(s, ap, "Phyrexian Mite Token")).toEqual([]);
    s = priorityIn(s, ap, "main2");
    expect(s.damageRules ?? []).toEqual([]);
  });
});

describe("Panoptic Projektor", () => {
  it("{T}: the next face-down creature spell you cast this turn costs {3} less; the one after it doesn't", () => {
    const morph2 = card("Test Other Morph", "Creature — Bird", "{3}{U}", { cmc: 4, power: "3", toughness: "3", oracleText: "Morph {1}{U}", keywords: ["Morph"] });
    const { s: s0, ap, ids } = setup([morph, morph2, giant()]);
    const p = putOnBattlefield(s0, ap, projektor());
    let s = settle(run(s0, planActivate(s0, ap, p, 0)), ap);
    expect(s.objects[p]!.tapped).toBe(true);
    // A creature spell cast face up doesn't use it up.
    s = settle(run(s, planCast(s, ap, ids[2]!)), ap);
    expect(tappedLands(s, ap)).toBe(4);
    s = faceDown(s, ap, ids[0]!);
    expect(s.objects[ids[0]!]!.faceDown).toBeTruthy();
    expect(tappedLands(s, ap)).toBe(4);
    s = faceDown(s, ap, ids[1]!);
    expect(tappedLands(s, ap)).toBe(7);
  });

  it("a face-down permanent turning face up makes each of your permanents' abilities it triggers trigger again", () => {
    const { s: s0, ap, opp, ids } = setup([morph]);
    putOnBattlefield(s0, ap, projektor());
    putOnBattlefield(s0, ap, plans());
    let s = faceDown(s0, ap, ids[0]!);
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planTurnFaceUp(s, ap, ids[0]!)), ap);
    expect(s.objects[ids[0]!]!.faceDown).toBeFalsy();
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    // An opponent's Projektor doesn't: one draw.
    const t0 = setup([morph]);
    putOnBattlefield(t0.s, t0.opp, projektor());
    putOnBattlefield(t0.s, t0.ap, plans());
    let t = faceDown(t0.s, t0.ap, t0.ids[0]!);
    const h = t.players[t0.ap]!.hand.length;
    t = settle(run(t, planTurnFaceUp(t, t0.ap, t0.ids[0]!)), t0.ap);
    expect(t.players[t0.ap]!.hand.length).toBe(h + 1);
    void opp;
  });
});

describe("Panoptic Projektor and a creature's own face-up trigger", () => {
  it("its own \"when ~ is turned face up\" ability triggers twice", () => {
    const lifeMorph = card("Test Life Morph", "Creature — Beast", "{4}{G}", { cmc: 5, power: "4", toughness: "4", oracleText: "Morph {2}{G}\nWhen this creature is turned face up, you gain 2 life.", keywords: ["Morph"] });
    supported(lifeMorph);
    const { s: s0, ap, ids } = setup([lifeMorph]);
    putOnBattlefield(s0, ap, projektor());
    let s = faceDown(s0, ap, ids[0]!);
    s = settle(run(s, planTurnFaceUp(s, ap, ids[0]!)), ap);
    expect(life(s, ap)).toBe(44);
  });
});

describe("Yurlok of Scorch Thrash", () => {
  it("{1}, {T}: each player adds {B}{R}{G}; mana they lose as the step ends costs them that much life", () => {
    const { s: s0, ap } = setup([]);
    const y = putOnBattlefield(s0, ap, yurlok());
    const forestId = s0.battlefield.find((id) => characteristics(s0, s0.objects[id]!).name === "Forest")!;
    let s = act(s0, { type: "activateMana", player: ap, objectId: forestId, mana: "G" });
    s = act(s, { type: "activateMana", player: ap, objectId: y, mana: "B" });
    expect(s.objects[y]!.tapped).toBe(true);
    for (const p of s.turnOrder) expect(s.players[p]!.manaPool).toMatchObject({ B: 1, R: 1, G: 1 });
    expect(pool(s, ap)).toBe(3);
    s = act(s, { type: "passPriority", player: ap });
    s = priorityIn(s, ap, "beginCombat");
    for (const p of s.turnOrder) {
      expect(pool(s, p)).toBe(0);
      expect(life(s, p)).toBe(37);
    }
  });

  it("losing mana to an effect costs life too; without it mana empties for free", () => {
    const { s: s0, ap, opp, ids } = setup([short()]);
    putOnBattlefield(s0, ap, yurlok());
    s0.players[opp]!.manaPool.R = 2;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])), ap);
    expect(pool(s, opp)).toBe(0);
    expect(life(s, opp)).toBe(38);
    // No Yurlok: no life lost.
    const t0 = setup([]);
    t0.s.players[t0.opp]!.manaPool.R = 2;
    const t = priorityIn(act(t0.s, { type: "passPriority", player: t0.ap }), t0.ap, "beginCombat");
    expect(pool(t, t0.opp)).toBe(0);
    expect(life(t, t0.opp)).toBe(40);
  });
});

/** `pid` attacks `opp` with `attackers`, nobody blocks, through combat damage until `pid` has a question of `kind` or priority after the damage. */
const attackThrough = (s0: GameState, pid: PlayerId, opp: PlayerId, attackers: ObjectId[]) => {
  let s = until(s0, pid, "declareAttackers");
  s = act(s, { type: "declareAttackers", player: pid, attacks: attackers.map((a) => ({ attacker: a, defender: opp })) });
  for (let i = 0; i < 200 && !(s.step === "combatDamage" && waitingOn(s) === pid && !s.stack.length && !s.triggerQueue.length) && !(s.pending && s.pending.player === pid && s.pending.kind !== "declareAttackers"); i++) {
    const p = s.pending;
    const who = waitingOn(s)!;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: who, blocks: [] });
    else if (p) for (const a of botActions(s, who)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: who });
  }
  return s;
};

describe("Breath of Fury", () => {
  it("sacrifices the creature, moves to another creature you control, untaps your creatures, and adds a combat phase", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, giant());
    const o = putOnBattlefield(s0, ap, ogre());
    const b = putOnBattlefield(s0, ap, breath());
    attach(s0, b, g);
    const s = attackThrough(s0, ap, opp, [g, o]);
    expect(life(s, opp)).toBe(35);
    expect(s.objects[g]!.zone).toBe("graveyard");
    expect(s.objects[b]!.attachedTo).toBe(o);
    expect(s.objects[o]!.tapped).toBe(false);
    // The next step is another combat's beginning, with no main phase between.
    const t = priorityIn(s, ap, "beginCombat");
    expect(t.turn).toBe(s.turn);
    expect(t.objects[b]!.zone).toBe("battlefield");
  });

  it("with two creatures to choose from, its controller chooses (a bot takes the biggest)", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, giant());
    const o = putOnBattlefield(s0, ap, ogre());
    const r = putOnBattlefield(s0, ap, ria());
    const b = putOnBattlefield(s0, ap, breath());
    attach(s0, b, o);
    let s = attackThrough(s0, ap, opp, [o]);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "enchant" });
    const opts = (s.pending as { options: string[] }).options;
    expect(opts.sort()).toEqual([g, r].sort());
    expect(botActions(s, ap)).toEqual([{ type: "chooseOption", player: ap, choice: r }]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: g }), ap);
    expect(s.objects[b]!.attachedTo).toBe(g);
    expect(s.objects[o]!.zone).toBe("graveyard");
  });

  it("with no other creature, nothing untaps, there's no extra combat, and it goes to the graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, giant());
    const b = putOnBattlefield(s0, ap, breath());
    attach(s0, b, g);
    const s = priorityIn(attackThrough(s0, ap, opp, [g]), ap, "main2");
    expect(s.objects[g]!.zone).toBe("graveyard");
    expect(s.objects[b]!.zone).toBe("graveyard");
  });
});

describe("Flickerform", () => {
  it("exiles its creature and every Aura on it, then returns them together at the next end step, each under its owner's control", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, giant());
    const f = putOnBattlefield(s0, ap, flicker());
    const h = putOnBattlefield(s0, ap, strength());
    const u = putOnBattlefield(s0, opp, unrest());
    for (const a of [f, h, u]) attach(s0, a, g);
    let s = settle(run(s0, planActivate(s0, ap, f, 0)), ap);
    for (const id of [g, f, h, u]) expect(s.objects[id]!.zone).toBe("exile");
    s = priorityIn(s, ap, "end");
    s = settle(s, ap);
    const back = named(s, ap, "Hill Giant")[0]!;
    expect(back).toBeDefined();
    const on = (name: string) => s.battlefield.find((id) => characteristics(s, s.objects[id]!).name === name);
    for (const name of ["Flickerform", "Holy Strength", "Unholy Strength"]) expect(s.objects[on(name)!]!.attachedTo, name).toBe(back);
    expect(s.objects[on("Unholy Strength")!]!.controller).toBe(opp);
    expect(characteristics(s, s.objects[back]!).power).toBe(3 + 1 + 2);
  });

  it("an Aura that can't enchant the returned creature stays in exile; the creature returns under its owner's control", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, opp, giant());
    addEffect(s0, ap, [g], [{ kind: "control" }], "game");
    const f = putOnBattlefield(s0, ap, flicker());
    const b = putOnBattlefield(s0, ap, breath());
    for (const a of [f, b]) attach(s0, a, g);
    let s = settle(run(s0, planActivate(s0, ap, f, 0)), ap);
    s = settle(priorityIn(s, ap, "end"), ap);
    const back = named(s, opp, "Hill Giant")[0]!;
    expect(back).toBeDefined();
    // Breath of Fury enchants only a creature its controller controls: not the opponent's Giant.
    expect(s.objects[b]!.zone).toBe("exile");
    const ff = s.battlefield.find((id) => characteristics(s, s.objects[id]!).name === "Flickerform")!;
    expect(s.objects[ff]!.attachedTo).toBe(back);
  });

  it("a token creature doesn't come back, and nor do the Auras", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, giant());
    s0.objects[g]!.isToken = true;
    const f = putOnBattlefield(s0, ap, flicker());
    attach(s0, f, g);
    let s = settle(run(s0, planActivate(s0, ap, f, 0)), ap);
    s = settle(priorityIn(s, ap, "end"), ap);
    expect(named(s, ap, "Hill Giant")).toEqual([]);
    expect(s.objects[f]!.zone).toBe("exile");
  });
});
