// Lane B round B166: mana from a Cave spent to cast it (Bat Colony; CR 106.3), a cast trigger if {C} wasn't spent
// (Wumpus Aberration; CR 603.4), a toughness limit that becomes X when the madness cost was paid (Welcome to the Fold;
// rulings), damage divided by an amount set by the madness cost (Avacyn's Judgment; CR 601.2b, 601.2d), a counter for each
// kind of counter (Bribe Taker; rulings), a spell's damage to an opponent prevented for tokens (Hostility; CR 615.5) and
// a target for each color (Rogues' Gallery; CR 601.2c).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { botActions, planActivate, invalidateCharacteristics, isFullySupported, planCast, power, toughness, waitingOn, controllerOf, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const batColony = (): CardDef => ({"oracleId":"c2022f95-2c26-4a2a-b83b-60efa937cdde","name":"Bat Colony","manaCost":"{2}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, create a 1/1 black Bat creature token with flying for each mana from a Cave spent to cast it.\nWhenever a Cave you control enters, put a +1/+1 counter on target creature you control.","colors":["W"],"colorIdentity":["W"],"keywords":[],"layout":"normal"}) as CardDef;
const wumpus = (): CardDef => ({"oracleId":"c116801e-9893-46e8-a967-352b5fa27e86","name":"Wumpus Aberration","manaCost":"{3}{G}","cmc":4,"typeLine":"Creature — Eldrazi Beast","supertypes":[],"types":["Creature"],"subtypes":["Eldrazi","Beast"],"oracleText":"Devoid (This card has no color.)\nWhen you cast this spell, if {C} wasn't spent to cast it, target opponent may put a creature card from their hand onto the battlefield.\nTrample","power":"6","toughness":"6","colors":[],"colorIdentity":["G"],"keywords":["Devoid","Trample"],"layout":"normal"}) as CardDef;
const fold = (): CardDef => ({"oracleId":"b8647f54-f50b-4bc6-bd44-fda25ef189fa","name":"Welcome to the Fold","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Madness {X}{U}{U} (If you discard this card, discard it into exile. When you do, cast it for its madness cost or put it into your graveyard.)\nGain control of target creature if its toughness is 2 or less. If this spell's madness cost was paid, instead gain control of that creature if its toughness is X or less.","colors":["U"],"colorIdentity":["U"],"keywords":["Madness"],"layout":"normal"}) as CardDef;
const judgment = (): CardDef => ({"oracleId":"f3ae58ed-8ef7-4e0a-945f-1f622157236b","name":"Avacyn's Judgment","manaCost":"{1}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Madness {X}{R} (If you discard this card, discard it into exile. When you do, cast it for its madness cost or put it into your graveyard.)\nAvacyn's Judgment deals 2 damage divided as you choose among any number of targets. If this spell's madness cost was paid, it deals X damage divided as you choose among those permanents and/or players instead.","colors":["R"],"colorIdentity":["R"],"keywords":["Madness"],"layout":"normal"}) as CardDef;
const bribe = (): CardDef => ({"oracleId":"482889f4-6cf5-457f-9f52-a3f841e038b5","name":"Bribe Taker","manaCost":"{5}{G}","cmc":6,"typeLine":"Creature — Rhino Warrior","supertypes":[],"types":["Creature"],"subtypes":["Rhino","Warrior"],"oracleText":"Trample\nWhen this creature enters, for each kind of counter on permanents you control, you may put your choice of a +1/+1 counter or a counter of that kind on this creature.","power":"6","toughness":"6","colors":["G"],"colorIdentity":["G"],"keywords":["Trample"],"layout":"normal"}) as CardDef;
const hostility = (): CardDef => ({"oracleId":"be16e9d8-aa73-448b-919c-7d02e2e15911","name":"Hostility","manaCost":"{3}{R}{R}{R}","cmc":6,"typeLine":"Creature — Elemental Incarnation","supertypes":[],"types":["Creature"],"subtypes":["Elemental","Incarnation"],"oracleText":"Haste\nIf a spell you control would deal damage to an opponent, prevent that damage. Create a 3/1 red Elemental Shaman creature token with haste for each 1 damage prevented this way.\nWhen Hostility is put into a graveyard from anywhere, shuffle it into its owner's library.","power":"6","toughness":"6","colors":["R"],"colorIdentity":["R"],"keywords":["Haste"],"layout":"normal"}) as CardDef;
const gallery = (): CardDef => ({"oracleId":"7ea1b0e8-a577-47e2-b4cb-a6ca973742d0","name":"Rogues' Gallery","manaCost":"{2}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"For each color, return up to one target creature card of that color from your graveyard to your hand.","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"}) as CardDef;
const cave = (): CardDef => ({"oracleId":"a1c7cd7a-0795-4135-b787-effeb981d95b","name":"Hidden Volcano","manaCost":"","cmc":0,"typeLine":"Land — Cave","supertypes":[],"types":["Land"],"subtypes":["Cave"],"oracleText":"This land enters tapped.\n{T}: Add {R}.\n{4}{R}, {T}, Sacrifice this land: Discover 4. Activate only as a sorcery. (Exile cards from the top of your library until you exile a nonland card with mana value 4 or less. Cast it without paying its mana cost or put it into your hand. Put the rest on the bottom in a random order.)","colors":[],"colorIdentity":["R"],"keywords":["Discover"],"producedMana":["R"],"layout":"normal"}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"layout":"normal"}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const tormenting = (): CardDef => ({"oracleId":"f307b5b4-e949-4f69-8dc7-856e33a45a16","name":"Tormenting Voice","manaCost":"{1}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"As an additional cost to cast this spell, discard a card.\nDraw two cards.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"layout":"normal"}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string): TargetChoice => ({ kind: "object", id }) as TargetChoice;
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id }) as TargetChoice;
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
const toZone = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Leaves only these lands of `pid`'s on the battlefield. */
const keepLands = (s: GameState, pid: PlayerId, names: string[]) => {
  for (const id of [...s.battlefield]) {
    const o = s.objects[id]!;
    if (o.controller === pid && s.cards[o.cardId]!.types.includes("Land") && !names.includes(s.cards[o.cardId]!.name)) {
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      o.zone = "graveyard";
      s.players[pid]!.graveyard.push(id);
    }
  }
  invalidateCharacteristics(s);
};
const named = (s: GameState, name: string) => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === name);
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
/** Taps `pid`'s untapped permanents named `name` for mana, `n` of them. */
const tapFor = (s: GameState, pid: PlayerId, name: string, mana: "W" | "U" | "B" | "R" | "G" | "C", n = 1) => {
  for (const id of named(s, name).filter((x) => !s.objects[x]!.tapped && s.objects[x]!.controller === pid).slice(0, n)) s = act(s, { type: "activateMana", player: pid, objectId: id, mana });
  return s;
};
const opponentsOf = (s: GameState, ap: PlayerId) => {
  const i = s.turnOrder.indexOf(ap);
  return [1, 2, 3].map((k) => s.turnOrder[(i + k) % 4]!);
};

describe("Bat Colony: a Bat for each mana from a Cave spent to cast it", () => {
  it("compiles", () => supported(batColony()));

  it("two Caves' mana and a Plains: two Bats; the Plains alone pays nothing toward them", () => {
    const { s: s0, ap, ids } = setup([batColony()]);
    keepLands(s0, ap, ["Plains"]);
    putOnBattlefield(s0, ap, cave());
    putOnBattlefield(s0, ap, cave());
    invalidateCharacteristics(s0);
    let s = tapFor(s0, ap, "Hidden Volcano", "R", 2);
    s = tapFor(s, ap, "Plains", "W");
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(named(s, "Bat Colony")).toHaveLength(1);
    expect(named(s, "Bat Token")).toHaveLength(2);
  });

  it("no Cave mana: no Bats", () => {
    const { s: s0, ap, ids } = setup([batColony()]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(named(s, "Bat Colony")).toHaveLength(1);
    expect(named(s, "Bat Token")).toHaveLength(0);
  });
});

describe("Wumpus Aberration: when cast, if {C} wasn't spent, target opponent may put a creature card from their hand onto the battlefield", () => {
  it("compiles", () => supported(wumpus()));

  it("cast with colored mana: the opponent chooses whether to put a creature card from their hand", () => {
    const { s: s0, ap, ids, opp } = setup([wumpus()]);
    const theirs = toZone(s0, opp, bear({ name: "Their Bear" }), "hand");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets" && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [ply(opp)] }));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp, fromHand: true });
    s = settle(act(s, { type: "searchLibrary", player: opp, found: [theirs] }));
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[theirs]!)).toBe(opp);
    expect(named(s, "Wumpus Aberration")).toHaveLength(1);
  });

  it("with {C} spent on it: no trigger", () => {
    const { s: s0, ap, ids } = setup([wumpus()]);
    keepLands(s0, ap, ["Forest"]);
    putOnBattlefield(s0, ap, solRing());
    invalidateCharacteristics(s0);
    let s = tapFor(s0, ap, "Sol Ring", "C");
    s = run(s, planCast(s, ap, ids[0]!));
    expect(s.objects[ids[0]!]!.spent?.C).toBe(2);
    expect(s.stack).toHaveLength(1);
    expect(s.triggerQueue).toHaveLength(0);
    s = settle(s);
    expect(named(s, "Wumpus Aberration")).toHaveLength(1);
  });
});

describe("Welcome to the Fold: toughness 2 or less, or X or less with its madness cost paid", () => {
  it("compiles", () => supported(fold()));

  it("cast from the hand: a 2-toughness creature is taken, a 3-toughness one isn't (any creature can be targeted)", () => {
    const { s: s0, ap, ids, opp } = setup([fold()]);
    const small = putOnBattlefield(s0, opp, bear({ name: "Small" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(small)])));
    expect(controllerOf(s, s.objects[small]!)).toBe(ap);
    const { s: t0, ap: p, ids: tids, opp: o } = setup([fold()]);
    const big = putOnBattlefield(t0, o, bear({ name: "Big", toughness: "3" }));
    const t = settle(run(t0, planCast(t0, p, tids[0]!, [tgt(big)])));
    expect(controllerOf(t, t.objects[big]!)).toBe(o);
    expect(t.objects[tids[0]!]!.zone).toBe("graveyard");
  });

  it("cast for madness {X}{U}{U} with X 4: a 4-toughness creature is taken, a 5-toughness one isn't", () => {
    for (const [tough, taken] of [["4", true], ["5", false]] as const) {
      const { s: s0, ap, ids, opp } = setup([tormenting(), fold()]);
      const [voice, fl] = ids as [string, string];
      const target = putOnBattlefield(s0, opp, bear({ name: "Target", toughness: tough }));
      let s = run(s0, planCast(s0, ap, voice, undefined, undefined, "auto", undefined, { discard: [fl] } as never));
      if (s.pending?.kind === "discard") s = act(s, { type: "discard", player: ap, objectIds: [fl] });
      s = settle(s);
      expect(s.pending).toMatchObject({ kind: "castFree", how: "madness", objectId: fl });
      s = settle(run(s, planCast(s, ap, fl, [tgt(target)], undefined, "auto", 4)));
      expect(controllerOf(s, s.objects[target]!)).toBe(taken ? ap : opp);
    }
  });
});

describe("Avacyn's Judgment: 2 damage divided, or X divided when its madness cost was paid", () => {
  it("compiles", () => supported(judgment()));

  it("cast from the hand: 2 damage divided between up to two targets, not three", () => {
    const { s: s0, ap, ids, opp } = setup([judgment()]);
    const a = putOnBattlefield(s0, opp, bear({ name: "A" }));
    const b = putOnBattlefield(s0, opp, bear({ name: "B" }));
    expect(planCast(s0, ap, ids[0]!, [{ kind: "object", id: a, amount: 1 }, { kind: "object", id: b, amount: 1 }, { kind: "player", id: opp, amount: 1 }] as TargetChoice[])).toBeNull();
    const life = s0.players[opp]!.life;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: a, amount: 1 }, { kind: "player", id: opp, amount: 1 }] as TargetChoice[])));
    expect(s.objects[a]!.damage).toBe(1);
    expect(s.players[opp]!.life).toBe(life - 1);
  });

  it("cast for madness {X}{R} with X 3: three targets, 1 each", () => {
    const { s: s0, ap, ids, opp } = setup([tormenting(), judgment()]);
    const [voice, jd] = ids as [string, string];
    const a = putOnBattlefield(s0, opp, bear({ name: "A" }));
    const b = putOnBattlefield(s0, opp, bear({ name: "B" }));
    let s = run(s0, planCast(s0, ap, voice, undefined, undefined, "auto", undefined, { discard: [jd] } as never));
    if (s.pending?.kind === "discard") s = act(s, { type: "discard", player: ap, objectIds: [jd] });
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "castFree", how: "madness", objectId: jd });
    const life = s.players[opp]!.life;
    const three = [{ kind: "object", id: a, amount: 1 }, { kind: "object", id: b, amount: 1 }, { kind: "player", id: opp, amount: 1 }] as TargetChoice[];
    s = settle(run(s, planCast(s, ap, jd, three, undefined, "auto", 3)));
    expect(s.objects[a]!.zone === "graveyard" || s.objects[a]!.damage === 1).toBe(true);
    expect(s.objects[b]!.zone === "graveyard" || s.objects[b]!.damage === 1).toBe(true);
    expect(s.players[opp]!.life).toBe(life - 1);
  });

  it("a bot casts it for its madness cost with the X it can pay, divided among that many targets", () => {
    const { s: s0, ap, ids } = setup([tormenting(), judgment()]);
    const [voice, jd] = ids as [string, string];
    let s = run(s0, planCast(s0, ap, voice, undefined, undefined, "auto", undefined, { discard: [jd] } as never));
    if (s.pending?.kind === "discard") s = act(s, { type: "discard", player: ap, objectIds: [jd] });
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "castFree", how: "madness", objectId: jd });
    const acts = botActions(s, ap);
    const cast = acts.find((a) => a.type === "castSpell");
    expect(cast).toBeDefined();
    for (const a of acts) s = act(s, a);
    expect(s.stack.some((it) => it.objectId === jd)).toBe(true);
    const item = s.stack.find((it) => it.objectId === jd)!;
    const total = (item.targets ?? []).reduce((n, t) => n + ((t as { amount?: number }).amount ?? 0), 0);
    expect(total).toBe(item.x ?? 0);
  });
});

describe("Bribe Taker: for each kind of counter on permanents you control, a +1/+1 counter or one of that kind", () => {
  it("compiles", () => supported(bribe()));

  const withCounters = () => {
    const r = setup([bribe()]);
    const { s, ap, opp } = r;
    const a = putOnBattlefield(s, ap, bear({ name: "Countered A" }));
    s.objects[a]!.counters = { "+1/+1": 2, shield: 2 };
    const b = putOnBattlefield(s, ap, ornithopter());
    s.objects[b]!.counters = { charge: 1 };
    // An opponent's counters don't count.
    const c = putOnBattlefield(s, opp, bear({ name: "Their Countered" }));
    s.objects[c]!.counters = { stun: 1 };
    invalidateCharacteristics(s);
    return r;
  };

  it("each kind once, however many: +1/+1, charge and shield are asked about, the opponent's stun isn't", () => {
    const { s: s0, ap, ids } = withCounters();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const asked: string[] = [];
    for (const pick of ["plus", "kind", "none"]) {
      const pend = s.pending;
      if (pend?.kind !== "chooseOption" || pend.what !== "bribeCounter") throw new Error(`no choice: ${JSON.stringify(pend)}`);
      asked.push(pend.counterKind!);
      if (pend.counterKind === "+1/+1") expect(pend.options).toEqual(["plus", "none"]);
      else expect(pend.options).toEqual(["plus", "kind", "none"]);
      s = settle(act(s, { type: "chooseOption", player: ap, choice: pend.counterKind === "+1/+1" ? "plus" : pick }));
    }
    expect(asked).toEqual(["+1/+1", "charge", "shield"]);
    expect(s.pending).toBeNull();
    const taker = named(s, "Bribe Taker")[0]!;
    // +1/+1 for the +1/+1 counters, a charge counter for the charge counter, none for the shield counters.
    expect(s.objects[taker]!.counters).toEqual({ "+1/+1": 1, charge: 1 });
    expect(pt(s, taker)).toBe("7/7");
  });

  it("no counters anywhere you control: nothing to choose", () => {
    const { s: s0, ap, ids } = setup([bribe()]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeNull();
    expect(s.objects[named(s, "Bribe Taker")[0]!]!.counters).toEqual({});
  });

  it("a bot takes a shield counter for the shield kind and +1/+1 counters otherwise", () => {
    const { s: s0, ap, ids } = withCounters();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    for (let i = 0; i < 3 && s.pending; i++) {
      const acts = botActions(s, ap);
      for (const a of acts) s = act(s, a);
      s = settle(s);
    }
    expect(s.objects[named(s, "Bribe Taker")[0]!]!.counters).toEqual({ "+1/+1": 2, shield: 1 });
  });
});

describe("Hostility: a spell you control that would deal damage to an opponent is prevented, a 3/1 for each 1 prevented", () => {
  const pinger = card("Test Pinger", "Creature — Human Wizard", "{R}", { power: "1", toughness: "1", oracleText: "{T}: This creature deals 1 damage to any target." });
  it("compiles", () => supported(hostility()));

  it("Lightning Bolt at an opponent: no damage, three hasty 3/1 Elemental Shamans", () => {
    const { s: s0, ap, ids, opp } = setup([bolt()]);
    putOnBattlefield(s0, ap, hostility());
    invalidateCharacteristics(s0);
    const life = s0.players[opp]!.life;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [ply(opp)])));
    expect(s.players[opp]!.life).toBe(life);
    const tokens = named(s, "Elemental Shaman Token");
    expect(tokens).toHaveLength(3);
    expect(pt(s, tokens[0]!)).toBe("3/1");
    expect(controllerOf(s, s.objects[tokens[0]!]!)).toBe(ap);
  });

  it("a spell at an opponent's creature, a spell at yourself and a creature's ability at an opponent are dealt as usual", () => {
    const { s: s0, ap, ids, opp } = setup([bolt(), bolt()]);
    putOnBattlefield(s0, ap, hostility());
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const ping = putOnBattlefield(s0, ap, pinger);
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(theirs)])));
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    const mine = s.players[ap]!.life;
    s = settle(run(s, planCast(s, ap, ids[1]!, [ply(ap)])));
    expect(s.players[ap]!.life).toBe(mine - 3);
    const life = s.players[opp]!.life;
    s = settle(run(s, planActivate(s, ap, ping, 0, [ply(opp)])));
    expect(s.players[opp]!.life).toBe(life - 1);
    expect(named(s, "Elemental Shaman Token")).toHaveLength(0);
  });
});

describe("Rogues' Gallery: for each color, up to one target creature card of that color from your graveyard", () => {
  it("compiles", () => supported(gallery()));

  it("one card for each color; a white and blue card fills only one of them", () => {
    const { s: s0, ap, ids } = setup([gallery()]);
    const white = toZone(s0, ap, bear({ name: "White Card", colors: ["W"], manaCost: "{1}{W}" }), "graveyard");
    const azorius = toZone(s0, ap, bear({ name: "Azorius Card", colors: ["W", "U"], manaCost: "{W}{U}" }), "graveyard");
    const black = toZone(s0, ap, bear({ name: "Black Card", colors: ["B"], manaCost: "{1}{B}" }), "graveyard");
    const none: TargetChoice = { kind: "none" } as TargetChoice;
    // The white and blue card for both white and blue: no.
    expect(planCast(s0, ap, ids[0]!, [tgt(azorius), tgt(azorius), none, none, none])).toBeNull();
    // A white card in the blue slot: no.
    expect(planCast(s0, ap, ids[0]!, [none, tgt(white), none, none, none])).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(white), tgt(azorius), tgt(black), none, none])));
    for (const id of [white, azorius, black]) expect(s.objects[id]!.zone).toBe("hand");
  });
});
