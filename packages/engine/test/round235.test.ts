// Round 235: cards from the top of the popularity list. Font of Agonies ("Whenever you pay life"); Mariposa Military
// Base ("You may have ~ enter tapped. If you do, you get two rad counters"); Observed Stasis ("remove enchanted creature
// from combat. Then draw a card for each tapped creature its controller controls"); Expand the Sphere ("proliferate a
// number of times equal to the difference"); Tromokratis ("hexproof unless it's attacking or blocking", "can't be blocked
// unless all creatures defending player controls block it"); Damping Sphere; Izzet Generatorium and Aether Refinery
// (energy replacements, "if you've paid or lost four or more {E} this turn"); Thieving Varmint ("spells you don't own").

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, legalActions, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";
import { putPlayerCounters } from "../src/counters";
import { loseEnergy, loseLife } from "../src/game";

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
/** Everyone passes until the stack is empty, answering "you may" with `may`; other players' questions as the bots would. Stops at any other question of `me`'s. */
const settle = (s: GameState, opts: { may?: boolean; targets?: TargetChoice[]; me?: PlayerId } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me !== undefined && p.player !== opts.me) s = act(s, botActions(s, p.player)[0]!);
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets ?? [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Taps everything a player controls, then gives them exactly this mana. */
const poolOnly = (s: GameState, pid: PlayerId, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid) s.objects[id]!.tapped = true;
  Object.assign(s.players[pid]!.manaPool, mana);
};

// Real oracle text (Scryfall).
const font = (): CardDef => ({"oracleId":"ab44c6fe-6a66-42f0-9e75-8b25641e1f13","name":"Font of Agonies","manaCost":"{B}","cmc":1,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever you pay life, put that many blood counters on this enchantment.\n{1}{B}, Remove four blood counters from this enchantment: Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"}) as CardDef;
const mariposa = (): CardDef => ({"oracleId":"f1e03d99-024a-430b-9342-ffd2268bd103","name":"Mariposa Military Base","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"You may have this land enter tapped. If you do, you get two rad counters.\n{T}: Add {C}.\n{5}, {T}: Draw a card. This ability costs {1} less to activate for each rad counter you have.","colors":[],"colorIdentity":[],"keywords":[],"layout":"normal"}) as CardDef;
const stasis = (): CardDef => ({"oracleId":"0c729806-3a23-491e-847f-23a394d27291","name":"Observed Stasis","manaCost":"{3}{U}","cmc":4,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Flash\nEnchant creature an opponent controls\nWhen this Aura enters, remove enchanted creature from combat. Then draw a card for each tapped creature its controller controls.\nEnchanted creature loses all abilities and can't attack or block.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant","Flash"],"layout":"normal"}) as CardDef;
const sphere = (): CardDef => ({"oracleId":"0fac3187-9b86-4854-854b-a4c203526a64","name":"Expand the Sphere","manaCost":"{3}{G}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Look at the top six cards of your library. Put up to two land cards from among them onto the battlefield tapped and the rest on the bottom of your library in a random order. If you put fewer than two lands onto the battlefield this way, proliferate a number of times equal to the difference. (Choose any number of permanents and/or players, then give each another counter of each kind already there.)","colors":["G"],"colorIdentity":["G"],"keywords":["Proliferate"],"layout":"normal"}) as CardDef;
const tromo = (): CardDef => ({"oracleId":"9aa2f27b-4c00-44c1-8bc4-014350f05b6d","name":"Tromokratis","manaCost":"{5}{U}{U}","cmc":7,"typeLine":"Legendary Creature — Kraken","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Kraken"],"oracleText":"Tromokratis has hexproof unless it's attacking or blocking.\nTromokratis can't be blocked unless all creatures defending player controls block it. (If any creature that player controls doesn't block this creature, it can't be blocked.)","power":"8","toughness":"8","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const damping = (): CardDef => ({"oracleId":"fd50d76c-7654-47b9-a5b6-d075874e4357","name":"Damping Sphere","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"If a land is tapped for two or more mana, it produces {C} instead of any other type and amount.\nEach spell a player casts costs {1} more to cast for each other spell that player has cast this turn.","colors":[],"colorIdentity":[],"keywords":[],"layout":"normal"}) as CardDef;
const generatorium = (): CardDef => ({"oracleId":"6a618c4a-e604-4dce-a078-755fd35ac5d9","name":"Izzet Generatorium","manaCost":"{U}{R}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"If you would get one or more {E} (energy counters), you get that many plus one {E} instead.\n{T}: Draw a card. Activate only if you've paid or lost four or more {E} this turn.","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[],"layout":"normal"}) as CardDef;
const refinery = (): CardDef => ({"oracleId":"9e9cde32-0568-44bc-a00a-9709f15c1350","name":"Aether Refinery","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"If you would get one or more {E} (energy counters), you get twice that many {E} instead.\n{T}: You get {E}, then you may pay one or more {E}. If you do, create an X/X black Aetherborn creature token, where X is the amount of {E} paid this way.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const varmint = (): CardDef => ({"oracleId":"b9f3cf9f-24c7-43ed-9ba1-f4570df3d09e","name":"Thieving Varmint","manaCost":"{1}{B}","cmc":2,"typeLine":"Creature — Varmint","supertypes":[],"types":["Creature"],"subtypes":["Varmint"],"oracleText":"Deathtouch, lifelink\n{T}, Pay 1 life: Add two mana of any one color. Spend this mana only to cast spells you don't own.","power":"2","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Lifelink","Deathtouch"],"layout":"normal"}) as CardDef;

const shock = card("Test Shock Land", "Land", "", { oracleText: "As this land enters, you may pay 2 life. If you don't, it enters tapped.\n{T}: Add {B}." });
const drainSelf = card("Test Bleed", "Sorcery", "{B}", { cmc: 1, oracleText: "You lose 2 life." });
const priced = card("Test Priced Relic", "Artifact", "{0}", { oracleText: "{1}, Pay 3 life: Draw a card." });
const solLand = card("Test Sol Land", "Land", "", { oracleText: "{T}: Add {C}{C}." });
const insight = card("Test Insight", "Sorcery", "{U}", { cmc: 1, oracleText: "Draw a card." });
const charger = card("Test Charger", "Sorcery", "{R}", { cmc: 1, oracleText: "You get {E}{E} (two energy counters)." });

describe("round 235: Font of Agonies", () => {
  it("is supported", () => supported(font()));

  it("paying life puts that many blood counters on it; losing life without paying doesn't", () => {
    let { s, ap } = setup([]);
    const f = putOnBattlefield(s, ap, font());
    const land = into(s, ap, shock, "hand");
    s = settle(act(s, { type: "playLand", player: ap, objectId: land, untapped: true }));
    expect(s.objects[land]!.tapped).toBe(false);
    expect(s.objects[f]!.counters.blood).toBe(2);
    const relic = putOnBattlefield(s, ap, priced);
    s = settle(run(s, planActivate(s, ap, relic, 0)));
    expect(s.objects[f]!.counters.blood).toBe(5);
    // "You lose 2 life" isn't paying life (rulings).
    const bleed = into(s, ap, drainSelf, "hand");
    s = settle(run(s, planCast(s, ap, bleed)));
    loseLife(s, ap, 1);
    s = settle(s);
    expect(s.objects[f]!.counters.blood).toBe(5);
  });

  it("removes four blood counters to destroy target creature", () => {
    let { s, ap, opp } = setup([]);
    const f = putOnBattlefield(s, ap, font());
    s.objects[f]!.counters.blood = 4;
    const b = putOnBattlefield(s, opp, bear());
    s = settle(run(s, planActivate(s, ap, f, 0, [tgt(b)])));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[f]!.counters.blood ?? 0).toBe(0);
  });
});

describe("round 235: Mariposa Military Base", () => {
  it("is supported", () => supported(mariposa()));

  it("played untapped, no rad counters; played tapped, its player gets two rad counters", () => {
    let { s, ap } = setup([]);
    const a = into(s, ap, mariposa(), "hand");
    s = act(s, { type: "playLand", player: ap, objectId: a, untapped: true });
    expect(s.objects[a]!.tapped).toBe(false);
    expect(s.players[ap]!.rad ?? 0).toBe(0);
    s.players[ap]!.landsPlayedThisTurn = 0;
    const b = into(s, ap, mariposa(), "hand");
    s = act(s, { type: "playLand", player: ap, objectId: b });
    expect(s.objects[b]!.tapped).toBe(true);
    expect(s.players[ap]!.rad).toBe(2);
  });

  it("the bot plays it untapped", () => {
    let { s, ap } = setup([]);
    const a = into(s, ap, mariposa(), "hand");
    s.players[ap]!.hand = [a];
    const play = botActions(s, ap).find((x) => x.type === "playLand" && x.objectId === a);
    expect(play).toBeDefined();
    s = act(s, play!);
    expect(s.objects[a]!.tapped).toBe(false);
    expect(s.players[ap]!.rad ?? 0).toBe(0);
  });
});

describe("round 235: Observed Stasis", () => {
  it("is supported", () => supported(stasis()));

  it("removes the attacking creature it enchants from combat, then draws a card for each tapped creature its controller controls", () => {
    let { s, ap, opp } = setup([]);
    // The opponent's turn: their bear attacks us; another creature of theirs is tapped.
    const at = putOnBattlefield(s, opp, bear());
    const other = putOnBattlefield(s, opp, bear());
    s = passUntil(s, "declareAttackers", opp);
    s.objects[other]!.tapped = true;
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: at, defender: ap }] });
    for (let i = 0; i < 20 && waitingOn(s) !== ap; i++) s = act(s, s.pending ? botActions(s, s.pending.player)[0]! : { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[at]!.attacking).toBe(ap);
    const aura = into(s, ap, stasis(), "hand");
    s.players[ap]!.manaPool.U = 4;
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, aura, [tgt(at)])), { me: ap });
    expect(s.objects[aura]!.attachedTo).toBe(at);
    expect(s.objects[at]!.attacking).toBeUndefined();
    // Removing it from combat doesn't untap it (rulings): two tapped creatures, two cards (the Aura left the hand).
    expect(s.objects[at]!.tapped).toBe(true);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
  });
});

describe("round 235: Expand the Sphere", () => {
  it("is supported", () => supported(sphere()));

  const runSphere = (lands: number, pickLands: number) => {
    let { s, ap } = setup([]);
    const counted = putOnBattlefield(s, ap, bear());
    s.objects[counted]!.counters["+1/+1"] = 1;
    // The top six: `lands` Forests and bears.
    const lib: ObjectId[] = [];
    for (let i = 0; i < 6; i++) lib.push(into(s, ap, i < lands ? card("Forest", "Basic Land — Forest") : bear(), "library"));
    const sp = into(s, ap, sphere(), "hand");
    s = run(s, planCast(s, ap, sp));
    s = settle(s, { me: ap });
    for (let i = 0; i < 10 && s.pending?.player === ap; i++) {
      const p = s.pending!;
      if (p.kind !== "searchLibrary") break;
      const found = p.cards.filter((id) => characteristics(s, s.objects[id]!).types.includes("Land")).slice(0, pickLands);
      s = act(s, { type: "searchLibrary", player: ap, found });
      s = settle(s, { me: ap });
    }
    return { s, ap, counted, lib };
  };

  it("two lands onto the battlefield tapped: no proliferate", () => {
    const { s, counted, lib } = runSphere(3, 2);
    expect(lib.filter((id) => s.objects[id]!.zone === "battlefield")).toHaveLength(2);
    expect(lib.filter((id) => s.objects[id]!.zone === "battlefield").every((id) => s.objects[id]!.tapped)).toBe(true);
    expect(s.objects[counted]!.counters["+1/+1"]).toBe(1);
  });

  it("one land: proliferate once; none: proliferate twice", () => {
    const one = runSphere(1, 1);
    expect(one.lib.filter((id) => one.s.objects[id]!.zone === "battlefield")).toHaveLength(1);
    expect(one.s.objects[one.counted]!.counters["+1/+1"]).toBe(2);
    const none = runSphere(0, 0);
    expect(none.s.objects[none.counted]!.counters["+1/+1"]).toBe(3);
  });
});

describe("round 235: Tromokratis", () => {
  it("is supported", () => supported(tromo()));

  it("has hexproof unless it's attacking or blocking", () => {
    let { s, ap, opp } = setup([]);
    const t = putOnBattlefield(s, ap, tromo());
    expect(characteristics(s, s.objects[t]!).keywords).toContain("Hexproof");
    putOnBattlefield(s, opp, bear());
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: t, defender: opp }] });
    expect(characteristics(s, s.objects[t]!).keywords).not.toContain("Hexproof");
  });

  it("can be blocked only by all the creatures the defending player controls, tapped ones included", () => {
    let { s, ap, opp } = setup([]);
    const t = putOnBattlefield(s, ap, tromo());
    const b1 = putOnBattlefield(s, opp, bear());
    const b2 = putOnBattlefield(s, opp, bear());
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: t, defender: opp }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "declareBlockers", player: opp });
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b1, attacker: t }] })).toThrow(/unless all creatures you control block it/);
    const both = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b1, attacker: t }, { blocker: b2, attacker: t }] });
    expect(both.objects[t]!.blockedBy).toHaveLength(2);
    // With one of them tapped, it can't be blocked at all (rulings); the bot doesn't try.
    s.objects[b2]!.tapped = true;
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b1, attacker: t }] })).toThrow();
    const bot = botActions(s, opp)[0]!;
    expect(bot).toMatchObject({ type: "declareBlockers", blocks: [] });
  });
});

describe("round 235: Damping Sphere", () => {
  it("is supported", () => supported(damping()));

  it("a land tapped for two or more mana produces {C} instead; for one, as usual", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, damping());
    const sol = putOnBattlefield(s, ap, solLand);
    s = act(s, { type: "activateMana", player: ap, objectId: sol, mana: "C" });
    expect(s.players[ap]!.manaPool.C).toBe(1);
    const isl = s.battlefield.find((id) => characteristics(s, s.objects[id]!).name === "Island" && controllerOf(s, s.objects[id]!) === ap)!;
    s = act(s, { type: "activateMana", player: ap, objectId: isl, mana: "U" });
    expect(s.players[ap]!.manaPool.U).toBe(1);
  });

  it("each spell costs {1} more for each other spell its caster cast this turn", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, damping());
    const i1 = into(s, ap, insight, "hand");
    const i2 = into(s, ap, insight, "hand");
    poolOnly(s, ap, { U: 2 });
    s = settle(run(s, planCast(s, ap, i1)));
    // The second costs {1}{U}: one {U} isn't enough.
    poolOnly(s, ap, {});
    s.players[ap]!.manaPool.U = 1;
    expect(planCast(s, ap, i2)).toBeNull();
    s.players[ap]!.manaPool.C = 1;
    s = settle(run(s, planCast(s, ap, i2)));
    expect(s.objects[i2]!.zone).toBe("graveyard");
  });
});

describe("round 235: Izzet Generatorium and Aether Refinery", () => {
  it("are supported", () => supported(generatorium(), refinery()));

  it("Generatorium adds one {E}; with Refinery, plus one then twice that many", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, generatorium());
    const c1 = into(s, ap, charger, "hand");
    s = settle(run(s, planCast(s, ap, c1)));
    expect(s.players[ap]!.energy).toBe(3);
    putOnBattlefield(s, ap, refinery());
    putPlayerCounters(s, ap, "energy", 2);
    expect(s.players[ap]!.energy).toBe(3 + 6);
    // Another player's energy isn't changed.
    const other = s.turnOrder.find((p) => p !== ap)!;
    putPlayerCounters(s, other, "energy", 2);
    expect(s.players[other]!.energy).toBe(2);
  });

  it("Generatorium draws only once you've paid or lost four or more {E} this turn", () => {
    let { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, generatorium());
    s.players[ap]!.energy = 10;
    expect(abilityProblem(s, ap, g, 0)).toBeTruthy();
    loseEnergy(s, ap, 3);
    expect(abilityProblem(s, ap, g, 0)).toBeTruthy();
    loseEnergy(s, ap, 1);
    expect(abilityProblem(s, ap, g, 0)).toBeNull();
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planActivate(s, ap, g, 0)));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
});

describe("round 235: Thieving Varmint", () => {
  it("is supported", () => supported(varmint()));

  it("its mana casts only spells you don't own", () => {
    let { s, ap, opp } = setup([]);
    const v = putOnBattlefield(s, ap, varmint());
    const mine = into(s, ap, insight, "hand");
    const theirs = into(s, ap, insight, "exile");
    s.objects[theirs]!.owner = opp;
    s.players[ap]!.exile.splice(s.players[ap]!.exile.indexOf(theirs), 1);
    s.players[opp]!.exile.push(theirs);
    s.objects[theirs]!.mayPlay = { player: ap, zc: s.objects[theirs]!.zoneChanges ?? 0, until: "thisTurn", turn: s.turn };
    poolOnly(s, ap, {});
    s.objects[v]!.tapped = false;
    const life = s.players[ap]!.life;
    s = act(s, { type: "activateMana", player: ap, objectId: v, mana: "U", ability: 0 });
    expect(s.players[ap]!.life).toBe(life - 1);
    expect(s.players[ap]!.manaPool.U).toBe(2);
    expect(planCast(s, ap, mine)).toBeNull();
    s = settle(run(s, planCast(s, ap, theirs)));
    // A spell goes to its owner's graveyard.
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.players[opp]!.graveyard).toContain(theirs);
  });
});
