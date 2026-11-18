// Lane B round B257: Shell of the Last Kappa (a spell that targets you exiled from the stack, not countered, then cast from
// among the cards exiled with it, CR 607.2a, rulings), Arcum's Whistle (the active player pays {X} or their creature
// attacks this turn if able and is destroyed at the next end step if it didn't, CR 508.1d, rulings) and Eye for an Eye (a
// replacement that keeps the damage and adds the same amount to the source's controller in the same event, CR 614.1a,
// 616.1, rulings).

import { describe, expect, it } from "vitest";
import { act, mountain, passUntil, plainsCard, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, compileCard, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const shelloftheLastKappa = (): CardDef => ({"oracleId":"a8b24b38-019c-45e7-a5f4-a1bc3014f7a2","name":"Shell of the Last Kappa","manaCost":"{3}","cmc":3,"typeLine":"Legendary Artifact","supertypes":["Legendary"],"types":["Artifact"],"subtypes":[],"oracleText":"{3}, {T}: Exile target instant or sorcery spell that targets you. (The spell has no effect.)\n{3}, {T}, Sacrifice Shell of the Last Kappa: You may cast a spell from among cards exiled with Shell of the Last Kappa without paying its mana cost.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/d/4d80f3e7-c3f0-462f-8ae9-8b27a7c15fcd.jpg?1783944275","artUrl":"https://cards.scryfall.io/art_crop/front/4/d/4d80f3e7-c3f0-462f-8ae9-8b27a7c15fcd.jpg?1783944275","layout":"normal"});
const arcumsWhistle = (): CardDef => ({"oracleId":"de691eed-d90b-48f9-bae4-f982767f2bfd","name":"Arcum's Whistle","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{3}, {T}: Choose target non-Wall creature the active player has controlled continuously since the beginning of the turn. That player may pay {X}, where X is that creature's mana value. If they don't pay, the creature attacks this turn if able, and at the beginning of the next end step, destroy it if it didn't attack this turn. Activate only before attackers are declared.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/3/73c07c87-0e44-4a5a-92b7-728350cd02de.jpg?1783947461","artUrl":"https://cards.scryfall.io/art_crop/front/7/3/73c07c87-0e44-4a5a-92b7-728350cd02de.jpg?1783947461","layout":"normal"});
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","layout":"normal"});
const banefire = (): CardDef => ({"oracleId":"5eff8a06-e0d6-435a-a7c0-db9f9d98636a","name":"Banefire","manaCost":"{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Banefire deals X damage to any target.\nIf X is 5 or more, this spell can't be countered and the damage can't be prevented.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/1/b188c68a-e9df-4803-a722-1993dd88f833.jpg?1783942480","artUrl":"https://cards.scryfall.io/art_crop/front/b/1/b188c68a-e9df-4803-a722-1993dd88f833.jpg?1783942480","layout":"normal"});
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","layout":"normal"});
const wallofStone = (): CardDef => ({"oracleId":"cd4cadb4-3156-49bd-b36e-12ba5c85938b","name":"Wall of Stone","manaCost":"{1}{R}{R}","cmc":3,"typeLine":"Creature — Wall","supertypes":[],"types":["Creature"],"subtypes":["Wall"],"oracleText":"Defender (This creature can't attack.)","power":"0","toughness":"8","colors":["R"],"colorIdentity":["R"],"keywords":["Defender"],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/140e567c-6e4a-42b0-8084-d6c9695ae802.jpg?1783948680","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/140e567c-6e4a-42b0-8084-d6c9695ae802.jpg?1783948680","layout":"normal"});
const eyeforanEye = (): CardDef => ({"oracleId":"22647b1a-5a7c-41b5-b820-b2e9f49c7aad","name":"Eye for an Eye","manaCost":"{W}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"The next time a source of your choice would deal damage to you this turn, instead that source deals that much damage to you and Eye for an Eye deals that much damage to that source's controller.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/9/2933ca2a-097b-44f4-ae56-ad524d26fd06.jpg?1783948394","artUrl":"https://cards.scryfall.io/art_crop/front/2/9/2933ca2a-097b-44f4-ae56-ad524d26fd06.jpg?1783948394","layout":"normal"});
const safePassage = (): CardDef => ({"oracleId":"dfa459a1-b065-4488-88d3-4da388261b52","name":"Safe Passage","manaCost":"{2}{W}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Prevent all damage that would be dealt to you and creatures you control this turn.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/d/4d8528ef-5e7d-46da-a454-395cd38c213f.jpg?1783942398","artUrl":"https://cards.scryfall.io/art_crop/front/4/d/4d8528ef-5e7d-46da-a454-395cd38c213f.jpg?1783942398","layout":"normal"});
const prodigalSorcerer = (): CardDef => ({"oracleId":"5e961d15-5972-4e4b-9385-1cd7cd7c6bbe","name":"Prodigal Sorcerer","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Human Wizard Sorcerer","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard","Sorcerer"],"oracleText":"{T}: This creature deals 1 damage to any target.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/0/50aef269-55f9-4d84-8bc5-29e794297f11.jpg?1783937607","artUrl":"https://cards.scryfall.io/art_crop/front/5/0/50aef269-55f9-4d84-8bc5-29e794297f11.jpg?1783937607","layout":"normal"});
const fieryEmancipation = (): CardDef => ({"oracleId":"52159875-354c-47f9-bb1c-cd65395fcc68","name":"Fiery Emancipation","manaCost":"{3}{R}{R}{R}","cmc":6,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If a source you control would deal damage to a permanent or player, it deals triple that damage to that permanent or player instead.","colors":["R"],"colorIdentity":["R"],"keywords":["Triple"],"imageUrl":"https://cards.scryfall.io/normal/front/0/b/0b12e4b7-2c45-4795-94d3-901f89b8f290.jpg?1783930692","artUrl":"https://cards.scryfall.io/art_crop/front/0/b/0b12e4b7-2c45-4795-94d3-901f89b8f290.jpg?1783930692","layout":"normal"});

const supported = (...ds: CardDef[]) => ds.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes until `pid` has priority with no question open. */
const priorityTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 20 && (s.priority !== pid || s.pending); i++) {
    if (s.pending) throw new Error(JSON.stringify(s.pending));
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const ply = (pid: PlayerId): TargetChoice => ({ kind: "player", id: pid });
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const leftOf = (s: GameState, pid: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + n) % s.turnOrder.length]!;
/** A fresh copy of `def` in `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};
const stackOf = (s: GameState, objectId: string): TargetChoice => ({ kind: "stack", id: s.stack.find((x) => x.objectId === objectId)!.id });

describe("Lane B round B257", () => {
  it("are fully supported", () => {
    supported(shelloftheLastKappa(), arcumsWhistle(), eyeforanEye());
    expect(compileCard(eyeforanEye()).spell?.effects).toEqual([{ type: "damageRule", rule: expect.objectContaining({ nextTime: true, to: { players: "you" }, echoToSourceController: true }) }]);
    const shell = compileCard(shelloftheLastKappa());
    expect(shell.activated[0]!.body.targets[0]).toEqual(expect.objectContaining({ kind: "spell", types: ["Instant", "Sorcery"], targetsWhat: "you" }));
    expect(shell.activated[0]!.body.effects).toEqual([{ type: "counterSpell", index: 0, exileSpell: true, linked: true }]);
    const whistle = compileCard(arcumsWhistle()).activated[0]!;
    expect(whistle.activateIf).toEqual({ kind: "during", window: "beforeAttackers" });
    expect(whistle.body.effects).toEqual([expect.objectContaining({ type: "punisher", who: { ref: "targetController", index: 0 } })]);
  });
});

/** `ap` has Shell of the Last Kappa; `opp` has a Mountain and Lightning Bolt in hand, with priority in `ap`'s main phase. */
const shellGame = () => {
  const { s: s0, ap } = setup([]);
  const opp = leftOf(s0, ap);
  const shell = putOnBattlefield(s0, ap, shelloftheLastKappa());
  putOnBattlefield(s0, opp, mountain);
  const bolt = inHand(s0, opp, lightningBolt());
  const s = priorityTo(s0, opp);
  return { s, ap, opp, shell, bolt };
};

describe("Shell of the Last Kappa", () => {
  it("exiles an instant that targets you: it doesn't resolve, and isn't countered", () => {
    const { s: s0, ap, opp, shell, bolt } = shellGame();
    let s = run(s0, planCast(s0, opp, bolt, [ply(ap)]));
    s = priorityTo(s, ap);
    s = run(s, planActivate(s, ap, shell, 0, [stackOf(s, bolt)]));
    s = settle(s);
    expect(zone(s, bolt)).toBe("exile");
    expect(life(s, ap)).toBe(40);
    expect(s.log.some((l) => /countered/i.test(l.text) && /Lightning Bolt/.test(l.text))).toBe(false);
  });

  it("can't target a spell that targets only another player or a creature", () => {
    const { s: s0, ap, opp, shell, bolt } = shellGame();
    const third = leftOf(s0, ap, 2);
    let s = run(s0, planCast(s0, opp, bolt, [ply(third)]));
    s = priorityTo(s, ap);
    expect(planActivate(s, ap, shell, 0, [stackOf(s, bolt)])).toBeNull();
    const { s: t0, ap: ap2, opp: opp2, shell: shell2, bolt: bolt2 } = shellGame();
    const bear = putOnBattlefield(t0, ap2, hillGiant());
    let t = run(t0, planCast(t0, opp2, bolt2, [tgt(bear)]));
    t = priorityTo(t, ap2);
    expect(planActivate(t, ap2, shell2, 0, [stackOf(t, bolt2)])).toBeNull();
  });

  it("exiles a spell that can't be countered (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const shell = putOnBattlefield(s0, ap, shelloftheLastKappa());
    const fire = inHand(s0, ap, banefire());
    // Banefire with X = 5 at its own caster: it can't be countered, but it can be exiled.
    let s = run(s0, planCast(s0, ap, fire, [ply(ap)], undefined, "auto", 5));
    expect(s.stack.length).toBe(1);
    s = run(s, planActivate(s, ap, shell, 0, [stackOf(s, fire)]));
    s = settle(s);
    expect(zone(s, fire)).toBe("exile");
    expect(life(s, ap)).toBe(40);
  });

  it("sacrificed, casts a spell from among the cards exiled with it without paying its mana cost", () => {
    const { s: s0, ap, opp, shell, bolt } = shellGame();
    let s = run(s0, planCast(s0, opp, bolt, [ply(ap)]));
    s = priorityTo(s, ap);
    s = settle(run(s, planActivate(s, ap, shell, 0, [stackOf(s, bolt)])));
    expect(zone(s, bolt)).toBe("exile");
    s = passUntil(s, "main1", ap);
    s.objects[shell]!.tapped = false;
    s = run(s, planActivate(s, ap, shell, 1));
    expect(zone(s, shell)).toBe("graveyard");
    s = settle(s);
    expect(s.pending?.kind).toBe("chooseOption");
    const p = s.pending as Extract<GameState["pending"], { kind: "chooseOption" }>;
    expect(p.options).toContain(bolt);
    s = act(s, { type: "chooseOption", player: ap, choice: bolt });
    expect(s.pending?.kind).toBe("castFree");
    s = settle(run(s, planCast(s, ap, bolt, [ply(opp)])));
    expect(life(s, opp)).toBe(40 - 3);
    expect(s.objects[bolt]!.owner).toBe(opp);
    expect(zone(s, bolt)).toBe("graveyard");
  });
});

/** On to `who`'s upkeep, then on until `pid` has priority. */
const toUpkeep = (s: GameState, who: PlayerId, pid: PlayerId) => priorityTo(passUntil(s, "upkeep", who), pid);
/** Steps on, passing, until `who` is asked to declare attackers (or the step is skipped). */
const toAttack = (s: GameState, who: PlayerId) => {
  for (let i = 0; i < 100; i++) {
    if (s.pending?.kind === "declareAttackers" && s.pending.player === who) return s;
    if (s.activePlayer === who && (s.step === "declareBlockers" || s.step === "main2")) return s;
    if (s.pending) throw new Error(JSON.stringify(s.pending));
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error("no attack step");
};
/** On to the end of `who`'s turn: past the end step's triggers, into the next turn. */
const throughEnd = (s: GameState, who: PlayerId) => {
  for (let i = 0; i < 300; i++) {
    if (s.activePlayer !== who) return s;
    const w = waitingOn(s)!;
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: w, blocks: [] });
    else if (s.pending?.kind === "discardToHandSize") s = act(s, { type: "discard", player: w, objectIds: s.players[w]!.hand.slice(0, s.pending.count) });
    else if (s.pending) throw new Error(JSON.stringify(s.pending));
    else s = act(s, { type: "passPriority", player: w });
  }
  throw new Error("turn never ended");
};
type PayUnless = Extract<GameState["pending"], { kind: "payUnless" }>;

/** `ap` has Arcum's Whistle; `opp` has Hill Giant (mana value 4) and four Mountains. At `opp`'s upkeep, `ap` has priority. */
const whistleGame = () => {
  const { s: s0, ap } = setup([]);
  const opp = leftOf(s0, ap);
  const whistle = putOnBattlefield(s0, ap, arcumsWhistle());
  const giant = putOnBattlefield(s0, opp, hillGiant());
  for (let i = 0; i < 4; i++) putOnBattlefield(s0, opp, mountain);
  const s = toUpkeep(s0, opp, ap);
  return { s, ap, opp, whistle, giant };
};

describe("Arcum's Whistle", () => {
  it("any turn before attackers are declared, at a non-Wall creature the active player has controlled since the turn began", () => {
    const { s, ap, opp, whistle, giant } = whistleGame();
    const wall = putOnBattlefield(s, opp, wallofStone());
    const fresh = putOnBattlefield(s, opp, hillGiant(), { sick: true });
    const mine = putOnBattlefield(s, ap, hillGiant());
    expect(planActivate(s, ap, whistle, 0, [tgt(wall)])).toBeNull();
    expect(planActivate(s, ap, whistle, 0, [tgt(fresh)])).toBeNull();
    expect(planActivate(s, ap, whistle, 0, [tgt(mine)])).toBeNull(); // not the active player's
    expect(planActivate(s, ap, whistle, 0, [tgt(giant)])).not.toBeNull();
    // On its controller's own turn too, at their own creature.
    const { s: t0, ap: ap2 } = setup([]);
    const w2 = putOnBattlefield(t0, ap2, arcumsWhistle());
    const own = putOnBattlefield(t0, ap2, hillGiant());
    expect(planActivate(t0, ap2, w2, 0, [tgt(own)])).not.toBeNull();
    // Not once attackers have been declared.
    let u = toAttack(s, opp);
    u = act(u, { type: "declareAttackers", player: opp, attacks: [] });
    u = priorityTo(u, ap);
    expect(planActivate(u, ap, whistle, 0, [tgt(giant)])).toBeNull();
  });

  it("the active player may pay {X}, X the creature's mana value: then nothing happens", () => {
    const { s: s0, ap, opp, whistle, giant } = whistleGame();
    let s = settle(run(s0, planActivate(s0, ap, whistle, 0, [tgt(giant)])));
    expect(s.pending?.kind).toBe("payUnless");
    const p = s.pending as PayUnless;
    expect(p.player).toBe(opp);
    expect(p.cost).toBe("{4}");
    // The bot doesn't pay four for a Hill Giant made to attack (botActions below); Mountains tapped for it instead.
    expect(botActions(s, opp)).toEqual([{ type: "payUnless", player: opp, pay: false }]);
    for (const m of s.battlefield.filter((id) => s.objects[id]!.controller === opp && s.cards[s.objects[id]!.cardId]!.name === "Mountain")) s = act(s, { type: "activateMana", player: opp, objectId: m, mana: "R" });
    s = settle(act(s, { type: "payUnless", player: opp, pay: true }));
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === opp && s.objects[id]!.tapped).length).toBe(4);
    s = toAttack(s, opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [] });
    s = throughEnd(s, opp);
    expect(zone(s, giant)).toBe("battlefield");
  });

  it("unpaid, the creature attacks this turn if able", () => {
    const { s: s0, ap, opp, whistle, giant } = whistleGame();
    let s = settle(run(s0, planActivate(s0, ap, whistle, 0, [tgt(giant)])));
    expect(s.pending?.kind).toBe("payUnless");
    s = settle(act(s, { type: "payUnless", player: opp, pay: false }));
    s = toAttack(s, opp);
    expect(() => applyAction(s, { type: "declareAttackers", player: opp, attacks: [] })).toThrow();
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: giant, defender: ap }] });
    s = throughEnd(s, opp);
    expect(zone(s, giant)).toBe("battlefield");
  });

  it("unpaid, a creature that didn't attack is destroyed at the next end step", () => {
    const { s: s0, ap, opp, whistle, giant } = whistleGame();
    let s = settle(run(s0, planActivate(s0, ap, whistle, 0, [tgt(giant)])));
    expect(s.pending?.kind).toBe("payUnless");
    s = settle(act(s, { type: "payUnless", player: opp, pay: false }));
    s.objects[giant]!.tapped = true; // it can't attack now
    s = toAttack(s, opp);
    s = throughEnd(s, opp);
    expect(zone(s, giant)).toBe("graveyard");
  });
});

/** Answers the source choice with the option whose label starts with `name`. */
const chooseSource = (s: GameState, name: string) => {
  const p = s.pending;
  if (p?.kind !== "chooseOption" || p.what !== "damageSource") throw new Error(`not choosing a source: ${JSON.stringify(p)}`);
  const i = p.labels!.findIndex((l) => l.startsWith(name));
  if (i < 0) throw new Error(`no ${name} in ${p.labels!.join(" | ")}`);
  return act(s, { type: "chooseOption", player: p.player, choice: p.options[i]! });
};
/** Passes until the top of the stack resolves (or a question comes up). */
const resolveTop = (s: GameState) => {
  const n = s.stack.length;
  for (let i = 0; i < 20 && s.stack.length >= n && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

/** `ap` holds Eye for an Eye; `opp` has cast Lightning Bolt at `ap`, and `ap` casts Eye for an Eye choosing the Bolt. */
const eyeGame = (extra: (s: GameState, ap: PlayerId, opp: PlayerId) => void = () => {}) => {
  const { s: s0, ap } = setup([]);
  const opp = leftOf(s0, ap);
  const eye = inHand(s0, ap, eyeforanEye());
  putOnBattlefield(s0, opp, mountain);
  const bolt = inHand(s0, opp, lightningBolt());
  extra(s0, ap, opp);
  let s = priorityTo(s0, opp);
  s = run(s, planCast(s, opp, bolt, [ply(ap)]));
  s = priorityTo(s, ap);
  s = run(s, planCast(s, ap, eye));
  s = priorityTo(s, ap);
  s = settleTo(s, (t) => t.pending?.kind === "chooseOption");
  s = chooseSource(s, "Lightning Bolt");
  return { s, ap, opp, eye, bolt };
};
/** Passes until `done` or the stack is empty. */
const settleTo = (s: GameState, done: (s: GameState) => boolean) => {
  for (let i = 0; i < 40 && !done(s) && (s.stack.length || s.pending); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("Eye for an Eye", () => {
  it("the damage is dealt to you, and Eye for an Eye deals that much to the source's controller", () => {
    let { s, ap, opp } = eyeGame();
    s = settle(s);
    expect(life(s, ap)).toBe(40 - 3);
    expect(life(s, opp)).toBe(40 - 3);
    expect(s.log.some((l) => /Eye for an Eye deals 3 damage to/.test(l.text))).toBe(true);
    expect(s.damageRules?.some((r) => r.echo)).toBeFalsy();
  });

  it("applies to damage that can't be prevented (it isn't a prevention)", () => {
    const { s: s0, ap } = setup([]);
    const opp = leftOf(s0, ap);
    const eye = inHand(s0, ap, eyeforanEye());
    for (let i = 0; i < 6; i++) putOnBattlefield(s0, opp, mountain);
    const fire = inHand(s0, opp, banefire());
    let s = passUntil(s0, "main1", opp);
    s = run(s, planCast(s, opp, fire, [ply(ap)], undefined, "auto", 5));
    s = priorityTo(s, ap);
    s = run(s, planCast(s, ap, eye));
    s = priorityTo(s, ap);
    s = settleTo(s, (t) => t.pending?.kind === "chooseOption");
    s = settle(chooseSource(s, "Banefire"));
    expect(life(s, ap)).toBe(40 - 5);
    expect(life(s, opp)).toBe(40 - 5);
  });

  it("with a prevention effect too, you choose: Eye for an Eye first deals the damage back, and the damage to you is prevented", () => {
    let { s, ap, opp } = eyeGame((s0, ap) => void inHand(s0, ap, safePassage()));
    // Eye for an Eye has resolved (the source is chosen as it does); Safe Passage now, with the Bolt still waiting.
    const passage = s.players[ap]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Safe Passage")!;
    s = priorityTo(s, ap);
    s = run(s, planCast(s, ap, passage));
    s = resolveTop(s);
    expect(s.stack.length).toBe(1);
    s = settleTo(s, (t) => t.pending?.kind === "chooseOption");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "damageShield", player: ap });
    const p = s.pending as Extract<GameState["pending"], { kind: "chooseOption" }>;
    expect(p.labels![0]).toMatch(/^Eye for an Eye first/);
    expect(p.labels![1]).toMatch(/^Prevent the damage first/);
    // Eye for an Eye first.
    let t = settle(act(structuredClone(s), { type: "chooseOption", player: ap, choice: p.options[0]! }));
    expect(life(t, ap)).toBe(40);
    expect(life(t, opp)).toBe(40 - 3);
    // The prevention first: no damage would be dealt, so Eye for an Eye waits.
    t = settle(act(s, { type: "chooseOption", player: ap, choice: p.options[1]! }));
    expect(life(t, ap)).toBe(40);
    expect(life(t, opp)).toBe(40);
    expect(t.damageRules?.some((r) => r.echo)).toBe(true);
  });

  it("with a damage multiplier, you choose the order: after the tripling, Eye for an Eye deals the tripled amount", () => {
    let { s, ap, opp } = eyeGame((s0, _ap, opp) => void putOnBattlefield(s0, opp, fieryEmancipation()));
    s = settleTo(s, (t) => t.pending?.kind === "chooseOption");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "damageShield", player: ap });
    const p = s.pending as Extract<GameState["pending"], { kind: "chooseOption" }>;
    expect(p.labels).toHaveLength(2);
    // The bot's answer (the first option): the tripling first, then Eye for an Eye.
    expect(botActions(s, ap)).toEqual([{ type: "chooseOption", player: ap, choice: p.options[0]! }]);
    const t = settle(act(structuredClone(s), { type: "chooseOption", player: ap, choice: p.options[0]! }));
    expect(life(t, ap)).toBe(40 - 9);
    expect(life(t, opp)).toBe(40 - 9); // Eye for an Eye's damage isn't from a source they control: not tripled
    const u = settle(act(s, { type: "chooseOption", player: ap, choice: p.options[1]! }));
    expect(life(u, ap)).toBe(40 - 9);
    expect(life(u, opp)).toBe(40 - 3);
  });

  it("the damage it deals meets the other player's own prevention", () => {
    let { s, ap, opp } = eyeGame((s0, _ap, opp) => {
      inHand(s0, opp, safePassage());
      for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, plainsCard);
    });
    // With Eye for an Eye resolved and the Bolt waiting, the other player gives themself Safe Passage.
    const passage = s.players[opp]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Safe Passage")!;
    s = priorityTo(s, opp);
    s = run(s, planCast(s, opp, passage));
    s = settle(s);
    expect(life(s, ap)).toBe(40 - 3);
    expect(life(s, opp)).toBe(40);
  });

  it("only the next time: a later damage event from the same source isn't matched", () => {
    const { s: s0, ap } = setup([]);
    const opp = leftOf(s0, ap);
    const eye = inHand(s0, ap, eyeforanEye());
    const sorcerer = putOnBattlefield(s0, opp, prodigalSorcerer());
    let s = priorityTo(s0, opp);
    s = run(s, planActivate(s, opp, sorcerer, 0, [ply(ap)]));
    s = priorityTo(s, ap);
    s = run(s, planCast(s, ap, eye));
    s = priorityTo(s, ap);
    s = settleTo(s, (t) => t.pending?.kind === "chooseOption");
    s = settle(chooseSource(s, "Prodigal Sorcerer"));
    expect(life(s, ap)).toBe(39);
    expect(life(s, opp)).toBe(39);
    s.objects[sorcerer]!.tapped = false;
    s = priorityTo(s, opp);
    s = settle(run(s, planActivate(s, opp, sorcerer, 0, [ply(ap)])));
    expect(life(s, ap)).toBe(38);
    expect(life(s, opp)).toBe(39);
  });
});
