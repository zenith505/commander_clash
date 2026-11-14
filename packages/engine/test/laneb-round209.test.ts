// Lane B round B209: Laccolith Rig (the enchanted creature, blocked, may deal its power to target creature instead of combat
// damage), Bill Potts (a spell or ability that targets only it copied, once each turn), Beamsplitter Mage (a spell that
// targets only it copied onto another creature you control), Hankyu (aim counters on the Equipment, all removed for that
// much damage), Shuriken (unattached for 2 damage, then the target's controller takes it unless it came off a Ninja) and
// Jötun Grunt (cumulative upkeep: two cards from a single graveyard on the bottom of their owner's library for each age
// counter).

import { describe, expect, it } from "vitest";
import { act, bear, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const rig = (): CardDef => ({"oracleId":"0b583980-1508-4247-8a28-7127241d8ec0","name":"Laccolith Rig","manaCost":"{R}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nWhenever enchanted creature becomes blocked, you may have it deal damage equal to its power to target creature. If you do, the first creature assigns no combat damage this turn.","colors":["R"],"colorIdentity":["R"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fb92039-03fd-4aee-be74-96997be629d6.jpg?1783945822","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fb92039-03fd-4aee-be74-96997be629d6.jpg?1783945822","commanderLegal":"legal","set":"nem","releasedAt":"2000-02-14","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const potts = (): CardDef => ({"oracleId":"0ebe67ed-8a71-4bbc-8e58-cebbd7b2d83f","name":"Bill Potts","manaCost":"{3}{R}","cmc":4,"typeLine":"Legendary Creature — Human","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human"],"oracleText":"Whenever you cast an instant or sorcery spell that targets only Bill Potts or activate an ability that targets only Bill Potts, copy that spell or ability. You may choose new targets for the copy. This ability triggers only once each turn.\nDoctor's companion (You can have two commanders if the other is the Doctor.)","power":"2","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":["Doctor's companion"],"imageUrl":"https://cards.scryfall.io/normal/front/7/e/7e04f552-c6a8-4c3d-898b-7cf1523f9440.jpg?1783914547","artUrl":"https://cards.scryfall.io/art_crop/front/7/e/7e04f552-c6a8-4c3d-898b-7cf1523f9440.jpg?1783914547","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const beam = (): CardDef => ({"oracleId":"fa09e18c-e7cf-4f08-9cc4-324e36594063","name":"Beamsplitter Mage","manaCost":"{U}{R}","cmc":2,"typeLine":"Creature — Vedalken Wizard","supertypes":[],"types":["Creature"],"subtypes":["Vedalken","Wizard"],"oracleText":"Whenever you cast an instant or sorcery spell that targets only this creature, if you control one or more other creatures that spell could target, choose one of those creatures. Copy that spell. The copy targets the chosen creature.","power":"2","toughness":"2","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/f/8f1801f2-ea6e-4196-858e-2afc456cf6a0.jpg?1783934141","artUrl":"https://cards.scryfall.io/art_crop/front/8/f/8f1801f2-ea6e-4196-858e-2afc456cf6a0.jpg?1783934141","commanderLegal":"legal","set":"grn","releasedAt":"2018-10-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const hankyu = (): CardDef => ({"oracleId":"940909b2-f59e-4f87-a119-675efd60a5bc","name":"Hankyu","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature has \"{T}: Put an aim counter on Hankyu\" and \"{T}, Remove all aim counters from Hankyu: This creature deals damage to any target equal to the number of aim counters removed this way.\"\nEquip {4} ({4}: Attach to target creature you control. Equip only as a sorcery.)","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/6/f/6f22a88a-4f04-4500-9e05-909b54ad43e3.jpg?1783944279","artUrl":"https://cards.scryfall.io/art_crop/front/6/f/6f22a88a-4f04-4500-9e05-909b54ad43e3.jpg?1783944279","commanderLegal":"legal","set":"chk","releasedAt":"2004-10-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const shuriken = (): CardDef => ({"oracleId":"c6e92e21-d3e7-4982-b9f3-af56d4014c07","name":"Shuriken","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature has \"{T}, Unattach Shuriken: Shuriken deals 2 damage to target creature. That creature's controller gains control of Shuriken unless it was unattached from a Ninja.\"\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/e/f/ef1e7f3b-55a4-41bf-b7ec-81114f2c63c4.jpg?1783944175","artUrl":"https://cards.scryfall.io/art_crop/front/e/f/ef1e7f3b-55a4-41bf-b7ec-81114f2c63c4.jpg?1783944175","commanderLegal":"legal","set":"bok","releasedAt":"2005-02-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const grunt = (): CardDef => ({"oracleId":"43fbfeec-bcaf-48b8-befe-b7346fec5a3a","name":"Jötun Grunt","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Giant Soldier","supertypes":[],"types":["Creature"],"subtypes":["Giant","Soldier"],"oracleText":"Cumulative upkeep—Put two cards from a single graveyard on the bottom of their owner's library. (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Cumulative upkeep"],"imageUrl":"https://cards.scryfall.io/normal/front/5/5/5526c510-bd33-4fac-8941-f19bd0997557.jpg?1783943370","artUrl":"https://cards.scryfall.io/art_crop/front/5/5/5526c510-bd33-4fac-8941-f19bd0997557.jpg?1783943370","commanderLegal":"legal","set":"csp","releasedAt":"2006-07-21","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const growth = (): CardDef => ({"oracleId":"5748ebf1-24e3-499d-ab7c-c2cebd462a24","name":"Giant Growth","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +3/+3 until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const pyromancer = (): CardDef => ({"oracleId":"29b3cb3e-aeb1-43eb-8095-9f7881aa34bd","name":"Prodigal Pyromancer","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"{T}: This creature deals 1 damage to any target.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/7/97787109-408e-42d3-acc5-300f5f5bf2ff.jpg?1783943143","artUrl":"https://cards.scryfall.io/art_crop/front/9/7/97787109-408e-42d3-acc5-300f5f5bf2ff.jpg?1783943143","commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ninja = (): CardDef => ({"oracleId":"1f3c2b00-0000-4ae1-9650-9553accac52e","name":"Ninja of the Deep Hours","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Human Ninja","supertypes":[],"types":["Creature"],"subtypes":["Human","Ninja"],"oracleText":"Ninjutsu {1}{U} ({1}{U}, Return an unblocked attacker you control to hand: Put this card onto the battlefield from your hand tapped and attacking.)\nWhenever this creature deals combat damage to a player, you may draw a card.","power":"2","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":["Ninjutsu"],"imageUrl":"https://cards.scryfall.io/normal/front/f/b/fb245a12-4cbd-4291-af67-f3677ca822dc.jpg?1783908836","artUrl":"https://cards.scryfall.io/art_crop/front/f/b/fb245a12-4cbd-4291-af67-f3677ca822dc.jpg?1783908836","commanderLegal":"legal","set":"j25","releasedAt":"2024-11-15","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Passes until someone has a question to answer. */
const toChoice = (s: GameState) => {
  for (let i = 0; i < 60 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const obj = (s: GameState, id: ObjectId) => s.objects[id]!;
const pt = (s: GameState, id: ObjectId) => `${power(s, obj(s, id))}/${toughness(s, obj(s, id))}`;
const tgt = (id: ObjectId): TargetChoice => ({ kind: "object", id });
const attach = (s: GameState, what: ObjectId, to: ObjectId) => {
  obj(s, what).attachedTo = to;
  invalidateCharacteristics(s);
};
/** A new card for `def` in `pid`'s graveyard. */
const toYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  obj(s, id).zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** A copy of a hand card for `pid` (the setup hand is the active player's). */
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  obj(s, id).zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};

describe("round B209 cards are supported", () => {
  it("compiles every line", () => supported(rig(), potts(), beam(), hankyu(), shuriken(), grunt()));
});

describe("Laccolith Rig", () => {
  /** Our 2/2 enchanted with the Rig attacks the opponent, who blocks it with a 2/2; another of theirs stands by. */
  const blocked = (block = true) => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, bear());
    const aura = putOnBattlefield(s0, ap, rig());
    attach(s0, aura, a);
    const b = putOnBattlefield(s0, opp, bear({ name: "Blocking Bear" }));
    const other = putOnBattlefield(s0, opp, bear({ name: "Other Bear" }));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: opp, blocks: block ? [{ blocker: b, attacker: a }] : [] });
    s = toChoice(s);
    return { s, ap, opp, a, b, other, aura };
  };

  it("blocked, the enchanted creature may deal its power to any target creature and then assigns no combat damage", () => {
    let { s, ap, a, b, other } = blocked();
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(other)] });
    s = toChoice(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(obj(s, other).zone).toBe("graveyard");
    s = passUntil(s, "endCombat");
    expect(obj(s, b).damage ?? 0).toBe(0); // no combat damage from the enchanted creature
    expect(obj(s, a).zone).toBe("graveyard"); // the blocker's damage still counts
  });

  it("declining keeps its combat damage", () => {
    let { s, ap, b, other } = blocked();
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(other)] });
    s = toChoice(s);
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(obj(s, other).zone).toBe("battlefield");
    s = passUntil(s, "endCombat");
    expect(obj(s, b).zone).toBe("graveyard");
  });

  it("doesn't trigger unblocked", () => {
    const { s } = blocked(false);
    expect(s.pending?.kind).not.toBe("chooseTargets");
    expect(s.stack.length).toBe(0);
  });

  it("on an opponent's creature, the Aura's controller chooses the target and decides, and the creature deals the damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const aura = putOnBattlefield(s0, ap, rig());
    attach(s0, aura, theirs);
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const victim = putOnBattlefield(s0, opp, bear({ name: "Victim Bear" }));
    let s = passUntil(s0, "declareAttackers", opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: theirs, defender: ap }] });
    for (let i = 0; i < 40 && !(s.pending?.kind === "declareBlockers" && s.pending.player === ap); i++) s = s.pending?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: ap, blocks: [{ blocker: mine, attacker: theirs }] });
    s = toChoice(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(victim)] });
    s = toChoice(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(obj(s, victim).zone).toBe("graveyard");
    expect(s.log.some((l) => /Their Bear deals 2 damage to Victim Bear/.test(l.text))).toBe(true);
    s = passUntil(s, "endCombat");
    expect(obj(s, mine).damage ?? 0).toBe(0);
  });
});

describe("Bill Potts", () => {
  const withPotts = () => {
    const { s, ap, opp, ids } = setup([growth(), growth()]);
    const bill = putOnBattlefield(s, ap, potts());
    const other = putOnBattlefield(s, ap, bear({ name: "Other Bear" }));
    return { s, ap, opp, bill, other, g1: ids[0]!, g2: ids[1]! };
  };

  it("copies an instant that targets only it, with new targets allowed, once each turn", () => {
    const { s: s0, ap, bill, other, g1, g2 } = withPotts();
    let s = toChoice(run(s0, planCast(s0, ap, g1, [tgt(bill)])));
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap });
    s = settle(act(s, { type: "copyTargets", player: ap, targets: [tgt(other)] }));
    expect(pt(s, bill)).toBe("5/7");
    expect(pt(s, other)).toBe("5/5");
    // The second spell that turn doesn't trigger it.
    s = settle(run(s, planCast(s, ap, g2, [tgt(bill)])));
    expect(s.pending).toBeNull();
    expect(pt(s, bill)).toBe("8/10");
    expect(pt(s, other)).toBe("5/5");
  });

  it("copies an activated ability that targets only it, and then a spell that turn doesn't trigger it", () => {
    const { s: s0, ap, opp, bill, g1 } = withPotts();
    const pyro = putOnBattlefield(s0, ap, pyromancer());
    obj(s0, pyro).controlledSinceTurn = -1;
    let s = toChoice(run(s0, planActivate(s0, ap, pyro, 0, [tgt(bill)])));
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap });
    s = settle(act(s, { type: "copyTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.life).toBe(39);
    expect(obj(s, bill).damage).toBe(1);
    s = settle(run(s, planCast(s, ap, g1, [tgt(bill)])));
    expect(s.pending).toBeNull();
    expect(pt(s, bill)).toBe("5/7");
  });

  it("doesn't trigger for a spell that targets another creature, which doesn't use it up", () => {
    const { s: s0, ap, bill, other, g1, g2 } = withPotts();
    let s = settle(run(s0, planCast(s0, ap, g1, [tgt(other)])));
    expect(s.pending).toBeNull();
    expect(pt(s, other)).toBe("5/5");
    s = toChoice(run(s, planCast(s, ap, g2, [tgt(bill)])));
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap });
    s = settle(act(s, { type: "copyTargets", player: ap, targets: [tgt(bill)] }));
    expect(pt(s, bill)).toBe("8/10");
  });
});

describe("Beamsplitter Mage", () => {
  const withMage = (others: number) => {
    const { s, ap, ids } = setup([growth()]);
    const mage = putOnBattlefield(s, ap, beam());
    const mine = Array.from({ length: others }, (_, i) => putOnBattlefield(s, ap, bear({ name: `Bear ${i + 1}` })));
    return { s, ap, mage, mine, g: ids[0]! };
  };

  it("copies a spell that targets only it onto another creature you control", () => {
    const { s: s0, ap, mage, mine, g } = withMage(1);
    const s = settle(run(s0, planCast(s0, ap, g, [tgt(mage)])));
    expect(pt(s, mage)).toBe("5/5");
    expect(pt(s, mine[0]!)).toBe("5/5");
  });

  it("with several, its controller chooses the one the copy targets", () => {
    const { s: s0, ap, mage, mine, g } = withMage(2);
    let s = toChoice(run(s0, planCast(s0, ap, g, [tgt(mage)])));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "copyOrder" });
    expect((s.pending as { options: string[] }).options.sort()).toEqual([...mine].sort());
    s = settle(act(s, { type: "chooseOption", player: ap, choice: mine[1]! }));
    expect(pt(s, mage)).toBe("5/5");
    expect(pt(s, mine[0]!)).toBe("2/2");
    expect(pt(s, mine[1]!)).toBe("5/5");
  });

  it("doesn't trigger without another creature you control, nor for an opponent's creature", () => {
    const { s: s0, ap, opp, mage, g } = withMage(0);
    putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    let s = run(s0, planCast(s0, ap, g, [tgt(mage)]));
    expect(s.stack.map((x) => x.kind)).toEqual(["spell"]);
    s = settle(s);
    expect(pt(s, mage)).toBe("5/5");
  });

  it("checks again as it resolves: no copy once the other creature is gone", () => {
    const { s: s0, ap, mage, mine, g } = withMage(1);
    let s = run(s0, planCast(s0, ap, g, [tgt(mage)]));
    expect(s.stack.at(-1)!.kind).toBe("ability");
    const next = structuredClone(s);
    const gone = next.battlefield.indexOf(mine[0]!);
    next.battlefield.splice(gone, 1);
    next.objects[mine[0]!]!.zone = "graveyard";
    next.players[ap]!.graveyard.push(mine[0]!);
    invalidateCharacteristics(next);
    s = settle(next);
    expect(pt(s, mage)).toBe("5/5");
    expect(s.stack.length).toBe(0);
  });
});

describe("Hankyu", () => {
  const equipped = () => {
    const { s, ap, opp } = setup([]);
    const b = putOnBattlefield(s, ap, bear());
    obj(s, b).controlledSinceTurn = -1;
    const h = putOnBattlefield(s, ap, hankyu());
    attach(s, h, b);
    return { s, ap, opp, b, h };
  };

  it("gives the creature an ability that puts an aim counter on Hankyu", () => {
    const { s: s0, ap, b, h } = equipped();
    const s = settle(run(s0, planActivate(s0, ap, b, 0)));
    expect(obj(s, h).counters.aim).toBe(1);
    expect(obj(s, b).counters.aim ?? 0).toBe(0);
    expect(obj(s, b).tapped).toBe(true);
  });

  it("removes all of Hankyu's aim counters for the creature to deal that much damage", () => {
    const { s: s0, ap, opp, b, h } = equipped();
    obj(s0, h).counters.aim = 3;
    const s = settle(run(s0, planActivate(s0, ap, b, 1, [{ kind: "player", id: opp }])));
    expect(obj(s, h).counters.aim ?? 0).toBe(0);
    expect(s.players[opp]!.life).toBe(37);
    expect(s.log.some((l) => /Grizzly Bears deals 3 damage/.test(l.text))).toBe(true);
  });

  it("with no aim counters, it can still be activated for no damage", () => {
    const { s: s0, ap, opp, b } = equipped();
    const s = settle(run(s0, planActivate(s0, ap, b, 1, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(40);
  });
});

describe("Shuriken", () => {
  const equipped = (def: CardDef) => {
    const { s, ap, opp } = setup([]);
    const b = putOnBattlefield(s, ap, def);
    obj(s, b).controlledSinceTurn = -1;
    const sh = putOnBattlefield(s, ap, shuriken());
    attach(s, sh, b);
    const victim = putOnBattlefield(s, opp, bear({ name: "Victim Bear", power: "3", toughness: "3" }));
    return { s, ap, opp, b, sh, victim };
  };

  it("unattached from a non-Ninja: 2 damage to the target, and its controller gains control of Shuriken", () => {
    const { s: s0, ap, opp, b, sh, victim } = equipped(bear());
    const s = settle(run(s0, planActivate(s0, ap, b, 0, [tgt(victim)])));
    expect(obj(s, victim).damage).toBe(2);
    expect(obj(s, sh).attachedTo).toBeUndefined();
    expect(controllerOf(s, obj(s, sh))).toBe(opp);
    expect(s.log.some((l) => /Shuriken deals 2 damage to Victim Bear/.test(l.text))).toBe(true);
    void ap;
  });

  it("unattached from a Ninja, you keep it", () => {
    const { s: s0, ap, b, sh, victim } = equipped(ninja());
    const s = settle(run(s0, planActivate(s0, ap, b, planActivateIndex(s0, ap, b), [tgt(victim)])));
    expect(obj(s, victim).damage).toBe(2);
    expect(controllerOf(s, obj(s, sh))).toBe(ap);
  });
});

/** The granted Shuriken ability's index: the one that plans with a creature target. */
const planActivateIndex = (s: GameState, ap: PlayerId, id: ObjectId) => {
  for (let i = 0; i < 4; i++) if (planActivate(s, ap, id, i, [tgt(s.battlefield.find((x) => x !== id && controllerOf(s, obj(s, x)) !== ap && s.cards[obj(s, x).cardId]!.types.includes("Creature"))!)])) return i;
  return -1;
};

describe("Jötun Grunt", () => {
  /** Grunt on the battlefield, then to our next upkeep, where its cumulative upkeep asks. */
  const toUpkeep = (yards: (s: GameState, ap: PlayerId, opp: PlayerId) => void, ages = 0) => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, grunt());
    if (ages) obj(s0, g).counters.age = ages;
    // Empty hands, so no one discards at cleanup on the way there (only the graveyards set up here matter).
    for (const q of s0.turnOrder) {
      const p = s0.players[q]!;
      for (const id of p.hand) obj(s0, id).zone = "library";
      p.library.push(...p.hand);
      p.hand = [];
    }
    yards(s0, ap, opp);
    let s = passUntil(s0, "end", ap);
    s = passUntil(s, "upkeep", ap);
    s = toChoice(s);
    return { s, ap, opp, g };
  };

  it("two cards from a single graveyard for one age counter, on the bottom of their owner's library in the order they choose", () => {
    let mine: ObjectId[] = [];
    let theirs: ObjectId[] = [];
    let { s, ap, opp, g } = toUpkeep((s, ap, opp) => {
      mine = [toYard(s, ap, bear({ name: "Mine A" }))];
      theirs = [toYard(s, opp, bear({ name: "Theirs A" })), toYard(s, opp, bear({ name: "Theirs B" }))];
    });
    expect(obj(s, g).counters.age).toBe(1);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    // Three cards to choose from: one from each graveyard isn't two from a single graveyard.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 2, max: 2, pairsPerYard: true });
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [mine[0]!, theirs[0]!] })).toThrow(/single graveyard/);
    s = act(s, { type: "searchLibrary", player: ap, found: theirs });
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: opp, how: "bottom" });
    s = toChoice(act(s, { type: "arrangeTop", player: opp, top: [theirs[1]!, theirs[0]!], away: [] }));
    expect(obj(s, g).zone).toBe("battlefield");
    expect(s.players[opp]!.library.slice(-2)).toEqual([theirs[1]!, theirs[0]!]);
    expect(obj(s, mine[0]!).zone).toBe("graveyard");
  });

  it("with too few cards in graveyards to pay, it's sacrificed", () => {
    let { s, g } = toUpkeep((s, ap, opp) => {
      toYard(s, ap, bear({ name: "Mine A" }));
      toYard(s, opp, bear({ name: "Theirs A" }));
    });
    s = settle(s);
    expect(obj(s, g).zone).toBe("graveyard");
  });

  it("declining sacrifices it", () => {
    let { s, ap, g } = toUpkeep((s, ap) => {
      toYard(s, ap, bear({ name: "Mine A" }));
      toYard(s, ap, bear({ name: "Mine B" }));
    });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(obj(s, g).zone).toBe("graveyard");
  });

  it("two age counters: a different graveyard for each, all at once", () => {
    let mine: ObjectId[] = [];
    let theirs: ObjectId[] = [];
    let { s, ap, opp, g } = toUpkeep((s, ap, opp) => {
      mine = [toYard(s, ap, bear({ name: "Mine A" })), toYard(s, ap, bear({ name: "Mine B" })), toYard(s, ap, bear({ name: "Mine C" }))];
      theirs = [toYard(s, opp, bear({ name: "Theirs A" })), toYard(s, opp, bear({ name: "Theirs B" }))];
    }, 1);
    expect(obj(s, g).counters.age).toBe(2);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", min: 4, max: 4 });
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [...mine, theirs[0]!] })).toThrow(/single graveyard/);
    s = act(s, { type: "searchLibrary", player: ap, found: [mine[0]!, mine[2]!, ...theirs] });
    // We order ours first (APNAP), then the opponent theirs.
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap });
    s = act(s, { type: "arrangeTop", player: ap, top: [mine[0]!, mine[2]!], away: [] });
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: opp });
    expect(obj(s, mine[0]!).zone).toBe("graveyard"); // nothing moves until every order is known
    s = toChoice(act(s, { type: "arrangeTop", player: opp, top: theirs, away: [] }));
    expect([mine[0]!, mine[2]!, ...theirs].map((id) => obj(s, id).zone)).toEqual(["library", "library", "library", "library"]);
    expect(obj(s, mine[1]!).zone).toBe("graveyard");
    expect(obj(s, g).zone).toBe("battlefield");
  });

  it("a bot paying it takes pairs from an opponent's graveyard before its own", () => {
    let mine: ObjectId[] = [];
    let theirs: ObjectId[] = [];
    let { s, ap } = toUpkeep((s, ap, opp) => {
      mine = [toYard(s, ap, bear({ name: "Mine A" })), toYard(s, ap, bear({ name: "Mine B" }))];
      theirs = [toYard(s, opp, bear({ name: "Theirs A" })), toYard(s, opp, bear({ name: "Theirs B" })), toYard(s, opp, bear({ name: "Theirs C" }))];
    });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    const [pick] = botActions(s, ap);
    expect(pick).toMatchObject({ type: "searchLibrary", player: ap });
    const found = (pick as { found: ObjectId[] }).found;
    expect(found.length).toBe(2);
    expect(found.every((id) => theirs.includes(id))).toBe(true);
    expect(() => act(s, pick!)).not.toThrow();
    void mine;
  });
});

describe("Hankyu (bots)", () => {
  it("a bot doesn't fire the damage ability with fewer than three aim counters", () => {
    const { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, bear());
    obj(s, b).controlledSinceTurn = -1;
    const h = putOnBattlefield(s, ap, hankyu());
    attach(s, h, b);
    const fires = (st: GameState) => botActions(st, ap).some((a) => a.type === "activateAbility" && a.objectId === b && a.index === 1);
    obj(s, h).counters.aim = 2;
    invalidateCharacteristics(s);
    expect(fires(s)).toBe(false);
  });
});
