// Round 206: "the next spell you cast this turn costs {1} less to cast" (Hardened Berserker, Peerless Samurai, Maelstrom
// Muse, Kaza, Roil Chaser), "for each kind of counter on target permanent or player, give that permanent or player another
// counter of that kind" (Maulfist Revolutionary, Powerful Broker, Skyship Plunderer), "whenever you cast a spell from your
// graveyard or activate an ability of a card in your graveyard" (Neerdiv, Devious Diver), "casts a spell other than the
// first spell they cast each turn or copies a spell" (Curse of Shaken Faith, Ichneumon Druid), "tap enchanted creature and
// remove all counters from it" (Enchanted River's Grasp), "until your next turn, creatures target player controls have
// base power and toughness 1/1" (Mass Diminish), "until your next turn, creatures can't attack you" (Chronomantic Escape),
// "as ~ enters, it becomes your choice of ..." (Primal Clay, Primal Plasma, Corrupted Shapeshifter), "you may cast target
// artifact card from your graveyard this turn" as a trigger (Heiko and Norika Yamazaki), "switch the power and toughness of
// each of up to two target creatures" (Invert // Invent, Inversion Behemoth), "each creature you control that didn't attack
// or enter this turn" (The Fifth Doctor).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, attackProblem, botActions, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, spellCost, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Everyone passes until the stack is empty, answering "you may" with `may` and trigger targets with `targets`; stops at any other question. */
const settle = (s: GameState, opts: { may?: boolean; targets?: TargetChoice[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets ?? [] });
    else if (p?.kind === "copyTargets") s = act(s, { type: "copyTargets", player: p.player });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes (no blocks, no attacks) until `step` of `ap`'s turn with an empty stack, or another question. */
const toStep = (s: GameState, step: GameState["step"], ap: PlayerId) => {
  for (let i = 0; i < 1500; i++) {
    if (s.step === step && s.activePlayer === ap && !s.stack.length && !s.triggerQueue.length && !s.pending) return s;
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: false });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
    else if (p?.kind === "pickPermanents" && p.action === "keepTapped") s = act(s, { type: "pickPermanents", player: p.player, ids: [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error(`never reached ${step}`);
};
const attack = (s: GameState, ap: PlayerId, defender: PlayerId, attackers: ObjectId[]) => {
  s = passUntil(s, "declareAttackers", ap);
  return act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender })) });
};
/** The generic mana `pid` would pay for the card `id` now (its colored mana aside). */
const generic = (s: GameState, pid: PlayerId, id: ObjectId) => {
  const c = spellCost(s, pid, s.objects[id]!);
  return c.extra + c.cost.symbols.reduce((n, x) => n + (x.kind === "generic" ? x.amount : 0), 0);
};
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of s.players[pid]!.hand.splice(0)) {
    s.objects[id]!.zone = "library";
    s.players[pid]!.library.push(id);
  }
};
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === name);
const wizard = (n = "Test Wizard") => card(n, "Creature — Human Wizard", "{1}", { cmc: 1, power: "1", toughness: "1" });
const samurai = (n = "Test Samurai") => card(n, "Creature — Human Samurai", "{1}", { cmc: 1, power: "1", toughness: "1" });
const sorcery = (n = "Test Sorcery", cost = "{3}{R}") => card(n, "Sorcery", cost, { cmc: 4, oracleText: "Draw a card." });
const instant = (n = "Test Instant", cost = "{2}{U}") => card(n, "Instant", cost, { cmc: 3, oracleText: "Draw a card." });
const ogre = (n = "Test Ogre") => card(n, "Creature — Ogre", "{3}{R}", { cmc: 4, power: "4", toughness: "4" });
const rock = (n = "Test Rock") => card(n, "Artifact", "{1}", { cmc: 1 });

// Real oracle text (Scryfall).
const hardenedBerserker = card("Hardened Berserker", "Creature — Human Berserker", "{2}{R}", {"cmc":3,"power":"3","toughness":"2","keywords":[],"oracleText":"Whenever this creature attacks, the next spell you cast this turn costs {1} less to cast.","colors":["R"],"colorIdentity":["R"],"layout":"normal"});
const peerlessSamurai = card("Peerless Samurai", "Creature — Human Samurai", "{2}{R}", {"cmc":3,"power":"2","toughness":"3","keywords":["Menace"],"oracleText":"Menace (This creature can't be blocked except by two or more creatures.)\nWhenever a Samurai or Warrior you control attacks alone, the next spell you cast this turn costs {1} less to cast.","colors":["R"],"colorIdentity":["R"],"layout":"normal"});
const maelstromMuse = card("Maelstrom Muse", "Creature — Djinn Wizard", "{1}{U}{U/R}{R}", {"cmc":4,"power":"2","toughness":"4","keywords":["Flying"],"oracleText":"Flying\nWhenever this creature attacks, the next instant or sorcery spell you cast this turn costs {X} less to cast, where X is this creature's power as this ability resolves.","colors":["R","U"],"colorIdentity":["R","U"],"layout":"normal"});
const kazaRoilChaser = card("Kaza, Roil Chaser", "Legendary Creature — Human Wizard", "{U}{R}", {"cmc":2,"power":"1","toughness":"2","keywords":["Flying","Haste"],"oracleText":"Flying, haste\n{T}: The next instant or sorcery spell you cast this turn costs {X} less to cast, where X is the number of Wizards you control as this ability resolves.","colors":["R","U"],"colorIdentity":["R","U"],"layout":"normal"});
const maulfistRevolutionary = card("Maulfist Revolutionary", "Creature — Human Warrior", "{1}{G}{G}", {"cmc":3,"power":"3","toughness":"3","keywords":["Trample"],"oracleText":"Trample\nWhen this creature enters or dies, for each kind of counter on target permanent or player, give that permanent or player another counter of that kind.","colors":["G"],"colorIdentity":["G"],"layout":"normal"});
const powerfulBroker = card("Powerful Broker", "Creature — Human Villain", "{2}{G}", {"cmc":3,"power":"3","toughness":"3","keywords":[],"oracleText":"{T}: For each kind of counter on target permanent or player, give that permanent or player another counter of that kind. Activate only as a sorcery.","colors":["G"],"colorIdentity":["G"],"layout":"normal"});
const skyshipPlunderer = card("Skyship Plunderer", "Creature — Human Pirate", "{1}{U}", {"cmc":2,"power":"2","toughness":"1","keywords":["Flying"],"oracleText":"Flying\nWhenever this creature deals combat damage to a player, for each kind of counter on target permanent or player, give that permanent or player another counter of that kind.","colors":["U"],"colorIdentity":["U"],"layout":"normal"});
const neerdivDeviousDiver = card("Neerdiv, Devious Diver", "Legendary Creature — Merfolk Rogue", "{2}{U}", {"cmc":3,"power":"2","toughness":"2","keywords":["Mill"],"oracleText":"Whenever Neerdiv becomes tapped, target player mills cards equal to its power.\nWhenever you cast a spell from your graveyard or activate an ability of a card in your graveyard, draw a card and put a +1/+1 counter on Neerdiv.","colors":["U"],"colorIdentity":["U"],"layout":"normal"});
const curseOfShakenFaith = card("Curse of Shaken Faith", "Enchantment — Aura Curse", "{1}{R}", {"cmc":2,"keywords":["Enchant"],"oracleText":"Enchant player\nWhenever enchanted player casts a spell other than the first spell they cast each turn or copies a spell, this Aura deals 2 damage to them.","colors":["R"],"colorIdentity":["R"],"layout":"normal"});
const ichneumonDruid = card("Ichneumon Druid", "Creature — Human Druid", "{1}{G}{G}", {"cmc":3,"power":"1","toughness":"1","keywords":[],"oracleText":"Whenever an opponent casts an instant spell other than the first instant spell that player casts each turn, this creature deals 4 damage to that player.","colors":["G"],"colorIdentity":["G"],"layout":"normal"});
const enchantedRiversGrasp = card("Enchanted River's Grasp", "Enchantment — Aura", "{2}{U}", {"cmc":3,"keywords":["Enchant"],"oracleText":"Enchant creature\nWhen this Aura enters, tap enchanted creature and remove all counters from it.\nEnchanted creature loses all abilities and doesn't untap during its controller's untap step.","colors":["U"],"colorIdentity":["U"],"layout":"normal"});
const massDiminish = card("Mass Diminish", "Sorcery", "{1}{U}", {"cmc":2,"keywords":["Flashback"],"oracleText":"Until your next turn, creatures target player controls have base power and toughness 1/1.\nFlashback {3}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["U"],"colorIdentity":["U"],"layout":"normal"});
const chronomanticEscape = card("Chronomantic Escape", "Sorcery", "{4}{W}{W}", {"cmc":6,"keywords":["Suspend"],"oracleText":"Until your next turn, creatures can't attack you. Exile Chronomantic Escape with three time counters on it.\nSuspend 3—{2}{W} (Rather than cast this card from your hand, you may pay {2}{W} and exile it with three time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost.)","colors":["W"],"colorIdentity":["W"],"layout":"normal"});
const primalClay = card("Primal Clay", "Artifact Creature — Shapeshifter", "{4}", {"cmc":4,"power":"*","toughness":"*","keywords":[],"oracleText":"As this creature enters, it becomes your choice of a 3/3 artifact creature, a 2/2 artifact creature with flying, or a 1/6 Wall artifact creature with defender in addition to its other types. (A creature with defender can't attack.)","colors":[],"colorIdentity":[],"layout":"normal"});
const primalPlasma = card("Primal Plasma", "Creature — Elemental Shapeshifter", "{3}{U}", {"cmc":4,"power":"*","toughness":"*","keywords":[],"oracleText":"As this creature enters, it becomes your choice of a 3/3 creature, a 2/2 creature with flying, or a 1/6 creature with defender.","colors":["U"],"colorIdentity":["U"],"layout":"normal"});
const corruptedShapeshifter = card("Corrupted Shapeshifter", "Creature — Eldrazi Shapeshifter", "{3}{U}", {"cmc":4,"power":"*","toughness":"*","keywords":["Devoid"],"oracleText":"Devoid (This card has no color.)\nAs this creature enters, it becomes your choice of a 3/3 creature with flying, a 2/5 creature with vigilance, or a 0/12 creature with defender.","colors":[],"colorIdentity":["U"],"layout":"normal"});
const clone = card("Clone", "Creature — Shapeshifter", "{3}{U}", {"cmc":4,"power":"0","toughness":"0","keywords":[],"oracleText":"You may have this creature enter as a copy of any creature on the battlefield.","colors":["U"],"colorIdentity":["U"],"layout":"normal"});
const twincast = card("Twincast", "Instant", "{U}{U}", {"cmc":2,"keywords":[],"oracleText":"Copy target instant or sorcery spell. You may choose new targets for the copy.","colors":["U"],"colorIdentity":["U"],"layout":"normal"});
const thinkTwice = card("Think Twice", "Instant", "{1}{U}", {"cmc":2,"keywords":["Flashback"],"oracleText":"Draw a card.\nFlashback {2}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["U"],"colorIdentity":["U"],"layout":"normal"});
const reassemblingSkeleton = card("Reassembling Skeleton", "Creature — Skeleton Warrior", "{1}{B}", {"cmc":2,"power":"1","toughness":"1","keywords":[],"oracleText":"{1}{B}: Return this card from your graveyard to the battlefield tapped.","colors":["B"],"colorIdentity":["B"],"layout":"normal"});

describe("the next spell you cast this turn costs less", () => {
  it("compile", () => supported(hardenedBerserker, peerlessSamurai, maelstromMuse, kazaRoilChaser));

  it("Hardened Berserker: the next spell costs {1} less, only that one, any kind of spell", () => {
    const { s: s0, ap, opp, ids } = setup([ogre(), instant("First Instant"), instant("Second Instant")]);
    const b = putOnBattlefield(s0, ap, hardenedBerserker);
    let s = settle(attack(s0, ap, opp, [b]));
    expect(generic(s, ap, ids[1]!)).toBe(1);
    expect(generic(s, ap, ids[0]!)).toBe(2);
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.objects[ids[1]!]!.zone).toBe("graveyard");
    // Used up by the instant: the next spells cost all they say.
    expect(generic(s, ap, ids[2]!)).toBe(2);
    expect(generic(s, ap, ids[0]!)).toBe(3);
  });

  it("Hardened Berserker: two triggers both reduce the same next spell; it ends with the turn", () => {
    const { s: s0, ap, opp, ids } = setup([ogre()]);
    const b1 = putOnBattlefield(s0, ap, hardenedBerserker);
    const b2 = putOnBattlefield(s0, ap, { ...hardenedBerserker });
    let s = settle(attack(s0, ap, opp, [b1, b2]));
    expect(generic(s, ap, ids[0]!)).toBe(1);
    s = toStep(s, "upkeep", opp);
    expect(s.costModsThisTurn).toBeUndefined();
  });

  it("Peerless Samurai: a Samurai attacking alone", () => {
    const { s: s0, ap, opp, ids } = setup([ogre()]);
    putOnBattlefield(s0, ap, peerlessSamurai);
    const sam = putOnBattlefield(s0, ap, samurai());
    let s = settle(attack(s0, ap, opp, [sam]));
    expect(generic(s, ap, ids[0]!)).toBe(2);
  });

  it("Maelstrom Muse: X is its power as the trigger resolves; a creature spell doesn't use it up", () => {
    const { s: s0, ap, opp, ids } = setup([sorcery(), wizard("Cheap Wizard")]);
    const m = putOnBattlefield(s0, ap, maelstromMuse);
    let s = attack(s0, ap, opp, [m]);
    // +2/+0 before it resolves: X counts the power then.
    s.effects.push({ id: "pump", timestamp: s.nextTimestamp++, controller: ap, sourceName: "test", duration: "endOfTurn", affected: [m], mods: [{ kind: "modifyPT", power: 2, toughness: 0 }] });
    invalidateCharacteristics(s);
    s = settle(s);
    expect(power(s, s.objects[m]!)).toBe(4);
    expect(generic(s, ap, ids[1]!)).toBe(1);
    // Reduces generic mana only: {3}{R} costs {R}.
    expect(generic(s, ap, ids[0]!)).toBe(0);
    expect(s.costModsThisTurn?.[0]?.mod.n).toBe(-4);
  });

  it("Kaza: X is the number of Wizards you control as it resolves", () => {
    const { s: s0, ap, ids } = setup([sorcery("Big Sorcery", "{5}{R}"), instant()]);
    const k = putOnBattlefield(s0, ap, kazaRoilChaser);
    putOnBattlefield(s0, ap, wizard());
    let s = settle(run(s0, planActivate(s0, ap, k, 0)));
    expect(generic(s, ap, ids[0]!)).toBe(3);
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    // The instant used it up; the sorcery is back to {5}{R}.
    expect(generic(s, ap, ids[0]!)).toBe(5);
  });
});

describe("for each kind of counter on target permanent or player, give another counter of that kind", () => {
  it("compile", () => supported(maulfistRevolutionary, powerfulBroker, skyshipPlunderer));

  it("Maulfist Revolutionary: one of each kind on the permanent, not double (rulings)", () => {
    const { s: s0, ap, ids } = setup([maulfistRevolutionary]);
    const r = putOnBattlefield(s0, ap, rock());
    s0.objects[r]!.counters = { charge: 2, oil: 1 };
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { targets: [tgt(r)] });
    expect(s.objects[r]!.counters).toMatchObject({ charge: 3, oil: 2 });
  });

  it("Maulfist Revolutionary: a player's counters, as it dies too", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, maulfistRevolutionary);
    s0.players[opp]!.poison = 2;
    s0.players[opp]!.energy = 1;
    s0.players[ap]!.manaPool.B = 1;
    const kill = card("Test Kill", "Instant", "{B}", { cmc: 1, oracleText: "Destroy target creature." });
    const k = into(s0, ap, kill, "hand");
    let s = settle(run(s0, planCast(s0, ap, k, [tgt(m)])), { targets: [{ kind: "player", id: opp }] });
    expect(s.objects[m]!.zone).toBe("graveyard");
    expect(s.players[opp]!.poison).toBe(3);
    expect(s.players[opp]!.energy).toBe(2);
  });

  it("Powerful Broker: a sorcery-speed tap ability, a target with no counters gets none", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, powerfulBroker);
    const bare = putOnBattlefield(s0, ap, bear({ name: "Bare Bear" }));
    let s = settle(run(s0, planActivate(s0, ap, b, 0, [tgt(bare)])));
    expect(s.objects[bare]!.counters).toEqual({});
    expect(s.objects[b]!.tapped).toBe(true);
  });
});

describe("Neerdiv, Devious Diver: a spell cast from your graveyard or an ability of a card in your graveyard", () => {
  it("compile", () => supported(neerdivDeviousDiver, thinkTwice, reassemblingSkeleton));

  it("flashback from your graveyard: draw and a +1/+1 counter; a spell from your hand doesn't", () => {
    const { s: s0, ap, ids } = setup([instant("Hand Instant")]);
    const n = putOnBattlefield(s0, ap, neerdivDeviousDiver);
    const t = into(s0, ap, thinkTwice, "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[n]!.counters["+1/+1"] ?? 0).toBe(0);
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, t, undefined, undefined, undefined, undefined, { via: "flashback" })));
    expect(s.objects[t]!.zone).toBe("exile");
    expect(s.objects[n]!.counters["+1/+1"]).toBe(1);
    // Neerdiv's draw and Think Twice's draw.
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("an ability of a card in your graveyard (Reassembling Skeleton)", () => {
    const { s: s0, ap } = setup([]);
    const n = putOnBattlefield(s0, ap, neerdivDeviousDiver);
    const sk = into(s0, ap, reassemblingSkeleton, "graveyard");
    let s = settle(run(s0, planActivate(s0, ap, sk, 0)));
    expect(s.objects[sk]!.zone).toBe("battlefield");
    expect(s.objects[n]!.counters["+1/+1"]).toBe(1);
  });

  it("an ability of a card in another player's graveyard doesn't count", () => {
    const { s: s0, ap, opp } = setup([]);
    const n = putOnBattlefield(s0, ap, neerdivDeviousDiver);
    const sk = into(s0, opp, reassemblingSkeleton, "graveyard");
    s0.players[opp]!.manaPool.B = 2;
    let s = passUntil(s0, "main1", opp);
    s.players[opp]!.manaPool.B = 2;
    s = settle(run(s, planActivate(s, opp, sk, 0)));
    expect(s.objects[sk]!.zone).toBe("battlefield");
    expect(s.objects[n]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("a spell other than the first each turn, or a copy", () => {
  it("compile", () => supported(curseOfShakenFaith, ichneumonDruid, twincast));

  it("Curse of Shaken Faith: no damage for the first spell, 2 for the second and 2 for a copy", () => {
    const { s: s0, ap, opp, ids } = setup([instant("First Instant"), twincast]);
    const c = putOnBattlefield(s0, opp, curseOfShakenFaith);
    s0.objects[c]!.attachedToPlayer = ap;
    invalidateCharacteristics(s0);
    const life = s0.players[ap]!.life;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    expect(s.players[ap]!.life).toBe(life);
    // A second instant and a copy of it.
    const again = into(s, ap, instant("Second Instant"), "hand");
    s = run(s, planCast(s, ap, again));
    const item = s.stack.find((x) => x.kind === "spell" && x.objectId === again)!;
    s.players[ap]!.manaPool.U = 2;
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: item.id }])));
    // Second Instant (2), Twincast (2), the copy (2).
    expect(s.players[ap]!.life).toBe(life - 6);
  });

  it("Ichneumon Druid: only an opponent's second instant each turn, a sorcery between doesn't count", () => {
    const { s: s0, ap, opp, ids } = setup([instant("First Instant"), sorcery(), instant("Second Instant")]);
    putOnBattlefield(s0, opp, ichneumonDruid);
    const life = s0.players[ap]!.life;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.players[ap]!.life).toBe(life);
    s = settle(run(s, planCast(s, ap, ids[2]!)));
    expect(s.players[ap]!.life).toBe(life - 4);
  });
});

describe("Enchanted River's Grasp: tap enchanted creature and remove all counters from it", () => {
  it("compile", () => supported(enchantedRiversGrasp));

  it("taps it and removes every counter", () => {
    const { s: s0, ap, opp, ids } = setup([enchantedRiversGrasp]);
    const b = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    s0.objects[b]!.counters = { "+1/+1": 2, flying: 1 };
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(b);
    expect(s.objects[b]!.tapped).toBe(true);
    expect(Object.values(s.objects[b]!.counters).every((n) => !n)).toBe(true);
  });
});

describe("Mass Diminish: until your next turn, creatures target player controls are 1/1", () => {
  it("compile", () => supported(massDiminish));

  it("the creatures there as it resolves, until your next turn", () => {
    const { s: s0, ap, opp, ids } = setup([massDiminish]);
    const o = putOnBattlefield(s0, opp, ogre("Their Ogre"));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(`${power(s, s.objects[o]!)}/${toughness(s, s.objects[o]!)}`).toBe("1/1");
    const later = putOnBattlefield(s, opp, ogre("Later Ogre"));
    expect(power(s, s.objects[later]!)).toBe(4);
    s = toStep(s, "upkeep", opp);
    expect(power(s, s.objects[o]!)).toBe(1);
    for (let i = 0; i < 3; i++) s = toStep(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(s.activePlayer) + 1) % 4]!);
    expect(s.activePlayer).toBe(ap);
    expect(power(s, s.objects[o]!)).toBe(4);
  });
});

describe("Chronomantic Escape: until your next turn, creatures can't attack you", () => {
  it("compile", () => supported(chronomanticEscape));

  it("not you, but your planeswalkers and other players; then it's exiled with three time counters", () => {
    const { s: s0, ap, opp, ids } = setup([chronomanticEscape]);
    const o = putOnBattlefield(s0, opp, ogre("Their Ogre"));
    const w = putOnBattlefield(s0, ap, card("Test Walker", "Legendary Planeswalker — Test", "{3}", { cmc: 3, loyalty: "3" }));
    s0.objects[w]!.counters.loyalty = 3;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    expect(s.objects[ids[0]!]!.counters.time).toBe(3);
    s = toStep(s, "main1", opp);
    expect(attackProblem(s, s.objects[o]!, ap)).toMatch(/can't attack/);
    expect(attackProblem(s, s.objects[o]!, ap, true, w)).toBeNull();
    const third = s.turnOrder[(s.turnOrder.indexOf(opp) + 1) % 4]!;
    expect(attackProblem(s, s.objects[o]!, third === ap ? s.turnOrder[(s.turnOrder.indexOf(opp) + 2) % 4]! : third)).toBeNull();
    for (let i = 0; i < 3; i++) s = toStep(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(s.activePlayer) + 1) % 4]!);
    expect(s.activePlayer).toBe(ap);
    expect(s.players[ap]!.unattackableUntil).toBeUndefined();
  });
});

describe("as it enters, it becomes your choice of", () => {
  it("compile", () => supported(primalClay, primalPlasma, corruptedShapeshifter, clone));

  it("Primal Clay: a prompt with the three choices; the 1/6 Wall with defender", () => {
    const { s: s0, ap, ids } = setup([primalClay]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "form", options: ["0", "1", "2"], labels: ["A 3/3 artifact creature", "A 2/2 artifact creature with flying", "A 1/6 Wall artifact creature with defender"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "2" }));
    const o = s.objects[ids[0]!]!;
    expect(`${power(s, o)}/${toughness(s, o)}`).toBe("1/6");
    expect(objHasKeyword(s, o, "Defender")).toBe(true);
    expect(s.cards[o.cardId] && s.objects[ids[0]!]!.zone).toBe("battlefield");
  });

  it("Corrupted Shapeshifter: the 3/3 flyer; the bot picks flying, never defender", () => {
    const { s: s0, ap, ids } = setup([corruptedShapeshifter]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ what: "form" });
    s = run(s, botActions(s, ap));
    const o = s.objects[ids[0]!]!;
    expect(`${power(s, o)}/${toughness(s, o)}`).toBe("3/3");
    expect(objHasKeyword(s, o, "Flying")).toBe(true);
    expect(objHasKeyword(s, o, "Vigilance")).toBe(false);
  });

  it("a Clone of Primal Plasma copies its choice and adds its own (rulings)", () => {
    const { s: s0, ap, ids } = setup([primalPlasma, clone]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "1" }));
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Flying")).toBe(true);
    s.players[ap]!.manaPool.U = 4;
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.pending).toMatchObject({ what: "copy" });
    s = act(s, { type: "chooseOption", player: ap, choice: ids[0]! });
    expect(s.pending).toMatchObject({ what: "form" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "2" }));
    const c = s.objects[ids[1]!]!;
    expect(c.zone).toBe("battlefield");
    expect(`${power(s, c)}/${toughness(s, c)}`).toBe("1/6");
    expect(objHasKeyword(s, c, "Defender")).toBe(true);
    expect(objHasKeyword(s, c, "Flying")).toBe(true);
  });
});

const heikoYamazakiTheGeneral = card("Heiko Yamazaki, the General", "Legendary Creature — Human Samurai", "{3}{R}", {"cmc":4,"power":"3","toughness":"3","keywords":["Trample"],"oracleText":"Trample\nWhenever a Samurai or Warrior you control attacks alone, you may cast target artifact card from your graveyard this turn.","colors":["R"],"colorIdentity":["R"],"layout":"normal"});
const norikaYamazakiThePoet = card("Norika Yamazaki, the Poet", "Legendary Creature — Human Samurai", "{2}{W}", {"cmc":3,"power":"3","toughness":"2","keywords":["Vigilance"],"oracleText":"Vigilance\nWhenever a Samurai or Warrior you control attacks alone, you may cast target enchantment card from your graveyard this turn.","colors":["W"],"colorIdentity":["W"],"layout":"normal"});
const invertInvent = card("Invert // Invent", "Instant // Instant", "{U/R} // {4}{U}{R}", {
  cmc: 7,
  layout: "split",
  oracleText: "Switch the power and toughness of each of up to two target creatures until end of turn.",
  faces: [
    { name: "Invert", manaCost: "{U/R}", typeLine: "Instant", supertypes: [], types: ["Instant"], subtypes: [], oracleText: "Switch the power and toughness of each of up to two target creatures until end of turn.", colors: ["U", "R"] },
    { name: "Invent", manaCost: "{4}{U}{R}", typeLine: "Instant", supertypes: [], types: ["Instant"], subtypes: [], oracleText: "Search your library for an instant card and/or a sorcery card, reveal them, put them into your hand, then shuffle.", colors: ["U", "R"] },
  ],
});
const inversionBehemoth = card("Inversion Behemoth", "Creature — Eldrazi", "{2}{C}{C}", {"cmc":4,"power":"2","toughness":"9","keywords":[],"oracleText":"At the beginning of combat on your turn, switch the power and toughness of each of any number of target creatures until end of turn.","colors":[],"colorIdentity":[],"layout":"normal"});
const theFifthDoctor = card("The Fifth Doctor", "Legendary Creature — Time Lord Doctor", "{2}{W}{U}", {"cmc":4,"power":"2","toughness":"2","keywords":["Peaceful Coexistence"],"oracleText":"Peaceful Coexistence — At the beginning of your end step, put a +1/+1 counter on each creature you control that didn't attack or enter this turn. Untap those creatures.","colors":["U","W"],"colorIdentity":["U","W"],"layout":"normal"});
const wall = (n = "Test Wall") => card(n, "Creature — Wall", "{1}", { cmc: 1, power: "1", toughness: "4" });
const charm = (n = "Test Charm") => card(n, "Enchantment", "{1}{W}", { cmc: 2, oracleText: "" });

describe("whenever a Samurai or Warrior you control attacks alone, you may cast target card from your graveyard this turn", () => {
  it("compile", () => supported(heikoYamazakiTheGeneral, norikaYamazakiThePoet));
  const via = { via: "permission" as const };

  it("Heiko: an artifact card from your graveyard, cast this turn paying its cost; not an attack with two", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, heikoYamazakiTheGeneral);
    const r = into(s0, ap, rock(), "graveyard");
    expect(planCast(s0, ap, r, undefined, undefined, undefined, undefined, via)).toBeNull();
    let s = settle(attack(s0, ap, opp, [h]), { targets: [tgt(r)] });
    s = toStep(s, "main2", ap);
    s = settle(run(s, planCast(s, ap, r, undefined, undefined, undefined, undefined, via)));
    expect(s.objects[r]!.zone).toBe("battlefield");
  });

  it("Heiko: two attackers is not alone; the permission ends with the turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, heikoYamazakiTheGeneral);
    const sam = putOnBattlefield(s0, ap, samurai());
    const r = into(s0, ap, rock(), "graveyard");
    let s = attack(s0, ap, opp, [h, sam]);
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
    s = toStep(s, "main2", ap);
    expect(planCast(s, ap, r, undefined, undefined, undefined, undefined, via)).toBeNull();
  });

  it("Norika: another Samurai attacking alone lets you cast an enchantment card, not an artifact", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, norikaYamazakiThePoet);
    const sam = putOnBattlefield(s0, ap, samurai());
    const e = into(s0, ap, charm(), "graveyard");
    const r = into(s0, ap, rock(), "graveyard");
    let s = settle(attack(s0, ap, opp, [sam]), { targets: [tgt(e)] });
    s = toStep(s, "main2", ap);
    expect(planCast(s, ap, r, undefined, undefined, undefined, undefined, via)).toBeNull();
    s = settle(run(s, planCast(s, ap, e, undefined, undefined, undefined, undefined, via)));
    expect(s.objects[e]!.zone).toBe("battlefield");
  });
});

describe("switch the power and toughness of each of target creatures", () => {
  it("compile", () => supported(invertInvent, inversionBehemoth));

  it("Invert: each of two targets switches its own power and toughness until end of turn", () => {
    const { s: s0, ap, opp, ids } = setup([invertInvent]);
    const w = putOnBattlefield(s0, opp, wall());
    const o = putOnBattlefield(s0, ap, ogre());
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(w), tgt(b)], undefined, "auto", undefined, { face: 0 })));
    const pt = (id: ObjectId) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
    expect(pt(w)).toBe("4/1");
    expect(pt(o)).toBe("4/4");
    expect(pt(b)).toBe("2/2");
    s = toStep(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(pt(w)).toBe("1/4");
  });

  it("Invent: an instant card and a sorcery card from your library into your hand", () => {
    const { s: s0, ap, ids } = setup([invertInvent]);
    const i = into(s0, ap, instant(), "library");
    const so = into(s0, ap, sorcery(), "library");
    const o = into(s0, ap, ogre(), "library");
    s0.players[ap]!.manaPool.U = 1;
    s0.players[ap]!.manaPool.R = 1;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { face: 1 })));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [i, so] }));
    expect([s.objects[i]!.zone, s.objects[so]!.zone, s.objects[o]!.zone]).toEqual(["hand", "hand", "library"]);
  });

  it("Inversion Behemoth: at the beginning of combat on your turn, any number of targets, itself included", () => {
    const { s: s0, ap, opp } = setup([]);
    const ib = putOnBattlefield(s0, ap, inversionBehemoth);
    const w = putOnBattlefield(s0, opp, wall());
    let s = settle(toStep(s0, "beginCombat", ap), { targets: [tgt(ib), tgt(w)] });
    const pt = (id: ObjectId) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
    expect(pt(ib)).toBe("9/2");
    expect(pt(w)).toBe("4/1");
  });
});

describe("The Fifth Doctor", () => {
  it("compile", () => supported(theFifthDoctor));

  it("end step: a counter on each creature that neither attacked nor entered this turn, and untaps them", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, theFifthDoctor);
    const attacker = putOnBattlefield(s0, ap, bear({ name: "Attacking Bear" }));
    const tapped = putOnBattlefield(s0, ap, bear({ name: "Tapped Bear" }));
    s0.objects[tapped]!.tapped = true;
    let s = settle(attack(s0, ap, opp, [attacker]));
    s = toStep(s, "main2", ap);
    const fresh = putOnBattlefield(s, ap, bear({ name: "New Bear" }));
    s.objects[fresh]!.enteredTurn = s.turn;
    s = settle(toStep(s, "end", ap));
    expect(s.objects[tapped]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[tapped]!.tapped).toBe(false);
    expect(s.objects[attacker]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[attacker]!.tapped).toBe(true);
    expect(s.objects[fresh]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});
