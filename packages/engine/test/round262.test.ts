// Round 262: Inferno of the Star Mounts (a reflexive trigger when its own pump makes its power exactly 20), Ochre Jelly
// (a token copy at the next end step with half the +1/+1 counters it had), Pact Weapon (no losing at 0 life while it's
// attached; the drawn card's mana value as +X/+X and life lost) and Long River Lurker (a delayed "whenever that creature
// deals combat damage this turn" that may blink it).

import { describe, expect, it } from "vitest";
import { act, bear, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, applyAction, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, runStateBasedActions, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

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
/** Passes until a question of this kind, declaring no attackers or blockers on the way. */
const passTo = (s: GameState, kind: string, max = 80) => {
  for (let i = 0; i < max && s.pending?.kind !== kind; i++) {
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: waitingOn(s)!, blocks: [] });
    else if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: waitingOn(s)!, attacks: [] });
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const opps = (s: GameState, ap: PlayerId) => [1, 2, 3].map((k) => s.turnOrder[(s.turnOrder.indexOf(ap) + k) % s.turnOrder.length]!);
const indexOf = (s: GameState, id: ObjectId, text: RegExp) => {
  const i = abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => text.test(a.text));
  if (i < 0) throw new Error(`no ability ${text}`);
  return i;
};
const tokensNamed = (s: GameState, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).name === name);

const inferno = (): CardDef => ({"oracleId":"cd54438d-7f9d-4d80-b15b-0f0bf4becc15","name":"Inferno of the Star Mounts","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Legendary Creature — Dragon","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"This spell can't be countered.\nFlying, haste\n{R}: Inferno of the Star Mounts gets +1/+0 until end of turn. When its power becomes 20 this way, it deals 20 damage to any target.","power":"6","toughness":"6","colors":["R"],"colorIdentity":["R"],"keywords":["Flying","Haste"],"commanderLegal":"legal","set":"sld","releasedAt":"2022-06-14","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const jelly = (): CardDef => ({"oracleId":"2b757d32-09a3-49cd-ada4-84b5335178ce","name":"Ochre Jelly","manaCost":"{X}{G}","cmc":1,"typeLine":"Creature — Ooze","supertypes":[],"types":["Creature"],"subtypes":["Ooze"],"oracleText":"Trample\nThis creature enters with X +1/+1 counters on it.\nSplit — When this creature dies, if it had two or more +1/+1 counters on it, create a token that's a copy of it at the beginning of the next end step. The token enters with half that many +1/+1 counters on it, rounded down.","power":"0","toughness":"0","colors":["G"],"colorIdentity":["G"],"keywords":["Trample"],"commanderLegal":"legal","set":"afr","releasedAt":"2021-07-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const pact = (): CardDef => ({"oracleId":"bc2c02f6-2b6b-4016-b006-12ce0a1a2450","name":"Pact Weapon","manaCost":"{3}{B}","cmc":4,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"As long as this Equipment is attached to a creature, you don't lose the game for having 0 or less life.\nWhenever equipped creature attacks, draw a card and reveal it. The creature gets +X/+X until end of turn and you lose X life, where X is that card's mana value.\nEquip—Discard a card.","colors":["B"],"colorIdentity":["B"],"keywords":["Equip"],"commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const lurker = (): CardDef => ({"oracleId":"c65c4d01-29da-47e6-993c-a265cf1f198c","name":"Long River Lurker","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Frog Scout","supertypes":[],"types":["Creature"],"subtypes":["Frog","Scout"],"oracleText":"Ward {1}\nOther Frogs you control have ward {1}.\nWhen this creature enters, target creature you control can't be blocked this turn. Whenever that creature deals combat damage this turn, you may exile it. If you do, return it to the battlefield under its owner's control.","power":"2","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Ward"],"commanderLegal":"legal","set":"blb","releasedAt":"2024-08-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

describe("Inferno of the Star Mounts", () => {
  const ready = (counters: number) => {
    const { s, ap } = setup([]);
    const inf = putOnBattlefield(s, ap, inferno());
    s.objects[inf]!.counters["+1/+1"] = counters;
    invalidateCharacteristics(s);
    return { s, ap, inf, opp: opps(s, ap)[0]! };
  };
  const pump = (s: GameState, ap: PlayerId, inf: ObjectId) => {
    s.players[ap]!.manaPool.R = (s.players[ap]!.manaPool.R ?? 0) + 1;
    return settle(run(s, planActivate(s, ap, inf, indexOf(s, inf, /^\{R\}:/))));
  };

  it("deals 20 damage to a target chosen only when the pump makes its power 20", () => {
    expect(isFullySupported(inferno())).toBe(true);
    const { s: s0, ap, inf, opp } = ready(12);
    expect(pt(s0, inf)).toBe("18/18");
    // 18 -> 19: no trigger, and no target was asked for on activation (rulings).
    let s = pump(s0, ap, inf);
    expect(pt(s, inf)).toBe("19/18");
    expect(s.pending).toBeFalsy();
    // 19 -> 20: the reflexive trigger, its target chosen now.
    s = pump(s, ap, inf);
    expect(pt(s, inf)).toBe("20/18");
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const life = s.players[opp]!.life;
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.life).toBe(life - 20);
  });

  it("doesn't trigger when the pump takes its power from 20 to 21", () => {
    const { s: s0, ap, inf, opp } = ready(14);
    expect(pt(s0, inf)).toBe("20/20");
    const life = s0.players[opp]!.life;
    const s = pump(s0, ap, inf);
    expect(pt(s, inf)).toBe("21/20");
    expect(s.pending).toBeFalsy();
    expect(s.stack.length).toBe(0);
    expect(s.players[opp]!.life).toBe(life);
  });
});

describe("Ochre Jelly", () => {
  const ready = (counters: number) => {
    const { s, ap } = setup([]);
    const j = putOnBattlefield(s, ap, jelly());
    s.objects[j]!.counters["+1/+1"] = counters;
    invalidateCharacteristics(s);
    return { s, ap, j };
  };
  const kill = (s: GameState, id: ObjectId) => {
    s.objects[id]!.damage = 99;
    invalidateCharacteristics(s);
    runStateBasedActions(s);
    return settle(s);
  };
  const toEnd = (s: GameState, ap: PlayerId) => settle(passUntil(s, "end", ap));

  it("dying with five +1/+1 counters makes a token copy at the next end step with two, which splits again into one with one", () => {
    expect(isFullySupported(jelly())).toBe(true);
    const { s: s0, ap, j } = ready(5);
    let s = kill(s0, j);
    expect(zone(s, j)).toBe("graveyard");
    expect(tokensNamed(s, "Ochre Jelly")).toEqual([]);
    s = toEnd(s, ap);
    const [t1, ...more] = tokensNamed(s, "Ochre Jelly");
    expect(more).toEqual([]);
    expect(s.objects[t1!]!.counters["+1/+1"]).toBe(2);
    expect(pt(s, t1!)).toBe("2/2");
    expect(characteristics(s, s.objects[t1!]!).keywords).toContain("Trample");
    // The token has the Split ability too: two counters split into one.
    s = kill(s, t1!);
    s = toEnd(passUntil(s, "upkeep"), ap);
    const [t2] = tokensNamed(s, "Ochre Jelly");
    expect(t2).toBeDefined();
    expect(s.objects[t2!]!.counters["+1/+1"]).toBe(1);
    // With only one counter, nothing more.
    s = kill(s, t2!);
    s = toEnd(passUntil(s, "upkeep"), ap);
    expect(tokensNamed(s, "Ochre Jelly")).toEqual([]);
  });

  it("cast with X = 4 it enters with four +1/+1 counters", () => {
    const { s: s0, ap, ids } = setup([jelly()]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [], undefined, "auto", 4)));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(4);
    expect(pt(s, ids[0]!)).toBe("4/4");
  });

  it("with only one +1/+1 counter it doesn't trigger", () => {
    const { s: s0, ap, j } = ready(1);
    let s = kill(s0, j);
    expect(s.delayed ?? []).toEqual([]);
    s = toEnd(s, ap);
    expect(tokensNamed(s, "Ochre Jelly")).toEqual([]);
  });

  it("the token still comes if the card left the graveyard before the end step: a copy of the creature as it last existed", () => {
    const { s: s0, ap, j } = ready(3);
    let s = kill(s0, j);
    // Exiled from the graveyard (Bojuka Bog, say).
    const yard = s.players[ap]!.graveyard;
    yard.splice(yard.indexOf(j), 1);
    s.objects[j]!.zone = "exile";
    s.objects[j]!.zoneChanges = (s.objects[j]!.zoneChanges ?? 0) + 1;
    s.players[ap]!.exile.push(j);
    invalidateCharacteristics(s);
    s = toEnd(s, ap);
    const [t] = tokensNamed(s, "Ochre Jelly");
    expect(t).toBeDefined();
    expect(s.objects[t!]!.counters["+1/+1"]).toBe(1);
  });
});

describe("Pact Weapon", () => {
  const ready = () => {
    const { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, bear());
    const w = putOnBattlefield(s, ap, pact());
    s.objects[w]!.attachedTo = b;
    invalidateCharacteristics(s);
    return { s, ap, b, w, opp: opps(s, ap)[0]! };
  };

  it("an attack draws and reveals a card: the creature gets +X/+X and you lose X life, X its mana value", () => {
    expect(isFullySupported(pact())).toBe(true);
    const { s: s0, ap, b, opp } = ready();
    // A Grizzly Bears (mana value 2) on top.
    const lib = s0.players[ap]!.library;
    const top = lib.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Grizzly Bears")!;
    lib.splice(lib.indexOf(top), 1);
    lib.unshift(top);
    const life = s0.players[ap]!.life;
    let s = passTo(s0, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    s = settle(s);
    expect(zone(s, top)).toBe("hand");
    expect(pt(s, b)).toBe("4/4");
    expect(s.players[ap]!.life).toBe(life - 2);
  });

  it("drawing a land: +0/+0 and no life lost", () => {
    const { s: s0, ap, b, opp } = ready();
    const lib = s0.players[ap]!.library;
    const top = lib.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Forest")!;
    lib.splice(lib.indexOf(top), 1);
    lib.unshift(top);
    const life = s0.players[ap]!.life;
    let s = passTo(s0, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    s = settle(s);
    expect(zone(s, top)).toBe("hand");
    expect(pt(s, b)).toBe("2/2");
    expect(s.players[ap]!.life).toBe(life);
  });

  it("while attached, 0 life doesn't lose the game; once it's unattached, you lose", () => {
    const { s, ap, w } = ready();
    s.players[ap]!.life = 0;
    runStateBasedActions(s);
    expect(s.players[ap]!.lost).toBeFalsy();
    delete s.objects[w]!.attachedTo;
    invalidateCharacteristics(s);
    runStateBasedActions(s);
    expect(s.players[ap]!.lost).toBe(true);
  });
});

describe("Long River Lurker", () => {
  const ready = () => {
    const { s, ap, ids } = setup([lurker()]);
    const b = putOnBattlefield(s, ap, bear());
    return { s, ap, ids, b, opp: opps(s, ap)[0]! };
  };
  const enter = (s: GameState, ap: PlayerId, id: ObjectId, b: ObjectId) => {
    s = passTo(run(s, planCast(s, ap, id, [])), "chooseTargets");
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    return settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: b }] }));
  };

  it("the target can't be blocked, and when it deals combat damage it may be exiled and returned: a new, untapped object", () => {
    expect(isFullySupported(lurker())).toBe(true);
    const { s: s0, ap, ids, b, opp } = ready();
    let s = enter(s0, ap, ids[0]!, b);
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(characteristics(s, s.objects[b]!).cantBeBlocked).toBeTruthy();
    const life = s.players[opp]!.life;
    const zc = s.objects[b]!.zoneChanges ?? 0;
    s = passTo(s, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    s = passTo(s, "chooseMay");
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(zone(s, b)).toBe("battlefield");
    expect(s.objects[b]!.zoneChanges ?? 0).toBeGreaterThan(zc);
    expect(s.objects[b]!.tapped).toBe(false);
    expect(s.objects[b]!.attacking).toBeUndefined();
  });

  it("declining leaves the creature tapped and attacking", () => {
    const { s: s0, ap, ids, b, opp } = ready();
    let s = enter(s0, ap, ids[0]!, b);
    const zc = s.objects[b]!.zoneChanges ?? 0;
    s = passTo(s, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    s = passTo(s, "chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[b]!.zoneChanges ?? 0).toBe(zc);
    expect(s.objects[b]!.tapped).toBe(true);
  });

  it("other Frogs you control have ward {1}", () => {
    const { s: s0, ap, ids } = ready();
    const frog = putOnBattlefield(s0, ap, bear({ name: "Test Frog", typeLine: "Creature — Frog", subtypes: ["Frog"] }));
    let s = run(s0, planCast(s0, ap, ids[0]!, []));
    s = settle(s);
    expect(characteristics(s, s.objects[frog]!).grantedAbilities).toContain("Ward {1}");
    // Not itself (it has its own ward).
    expect(characteristics(s, s.objects[ids[0]!]!).grantedAbilities).not.toContain("Ward {1}");
  });
});
