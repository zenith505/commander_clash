// Round 331 (Lane A, skip-list cards): play-from-top riders, "If you cast a spell this way, you may cast it as though it
// had flash" (Elsha of the Infinite) and "by sacrificing a nonland permanent in addition to paying their other costs"
// (Into the Pit).

import { describe, expect, it } from "vitest";
import { act, card, forest, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, castProblem, isFullySupported, planActivate, planCast, planPlot, plotCost, plotProblem, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

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
    if (p && p.player !== me) s = act(s, botActions(s, p.player)[0]!);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Puts a fresh copy of `def` on top of `pid`'s library. */
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  return id;
};
/** Passes priority until `pid` has it with something on the stack (an opponent's spell), as at instant speed. */
const opponentSpell = (s: GameState, opp: PlayerId) => {
  const id = putOnBattlefield(s, opp, rock);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[opp]!.hand.push(id);
  return id;
};

// Real oracle text (Scryfall).
const elsha = (): CardDef => ({"oracleId":"da339200-ed26-42e4-b24f-b96bc4daef7c","name":"Elsha of the Infinite","manaCost":"{2}{U}{R}{W}","cmc":5,"typeLine":"Legendary Creature — Djinn Monk","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Djinn","Monk"],"oracleText":"Prowess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)\nYou may look at the top card of your library any time.\nYou may cast noncreature spells from the top of your library. If you cast a spell this way, you may cast it as though it had flash.","power":"3","toughness":"3","colors":["R","U","W"],"colorIdentity":["R","U","W"],"keywords":["Prowess"],"commanderLegal":"legal","set":"c19","releasedAt":"2019-08-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const pit = (): CardDef => ({"oracleId":"e330412f-46a1-4e7c-8766-f644606049e0","name":"Into the Pit","manaCost":"{2}{B}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"You may look at the top card of your library any time.\nYou may cast spells from the top of your library by sacrificing a nonland permanent in addition to paying their other costs.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"dsc","releasedAt":"2024-09-27","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const paleo = (): CardDef => ({"oracleId":"d6026309-aae9-43e7-938b-69db7af7139c","name":"Intrepid Paleontologist","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Human Druid","supertypes":[],"types":["Creature"],"subtypes":["Human","Druid"],"oracleText":"{T}: Add one mana of any color.\n{2}: Exile target card from a graveyard.\nYou may cast Dinosaur creature spells from among cards you own exiled with this creature. If you cast a spell this way, that creature enters with a finality counter on it. (If a creature with a finality counter on it would die, exile it instead.)","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["B","G","R","U","W"],"commanderLegal":"legal","set":"lci","releasedAt":"2023-11-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const adept = (): CardDef => ({"oracleId":"791cbb7c-7935-4902-b050-9ea9d030e9fa","name":"Osteomancer Adept","manaCost":"{1}{B}","cmc":2,"typeLine":"Creature — Squirrel Warlock","supertypes":[],"types":["Creature"],"subtypes":["Squirrel","Warlock"],"oracleText":"Deathtouch\n{T}: Until end of turn, you may cast creature spells from your graveyard by foraging in addition to paying their other costs. If you cast a spell this way, that creature enters with a finality counter on it. (To forage, exile three cards from your graveyard or sacrifice a Food. If a creature with a finality counter on it would die, exile it instead.)","power":"2","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":["Deathtouch"],"commanderLegal":"legal","set":"blb","releasedAt":"2024-08-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const fblthp = (): CardDef => ({"oracleId":"764f6412-c4ff-4eec-9a9d-870661f97f8b","name":"Fblthp, Lost on the Range","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Legendary Creature — Homunculus","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Homunculus"],"oracleText":"Ward {2}\nYou may look at the top card of your library any time.\nThe top card of your library has plot. The plot cost is equal to its mana cost.\nYou may plot nonland cards from the top of your library.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":["Plot","Ward"],"commanderLegal":"legal","set":"otj","releasedAt":"2024-04-19","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const djinn = (): CardDef => ({"oracleId":"7dbb540f-ee96-4115-b6ef-28ffc73da8b7","name":"Djinn of Fool's Fall","manaCost":"{4}{U}","cmc":5,"typeLine":"Creature — Djinn","supertypes":[],"types":["Creature"],"subtypes":["Djinn"],"oracleText":"Flying\nPlot {3}{U} (You may pay {3}{U} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)","power":"4","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Plot"],"commanderLegal":"legal","set":"otj","releasedAt":"2024-04-19","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const rock = card("Test Rock", "Artifact", "{1}");
const dino = card("Test Dinosaur", "Creature — Dinosaur", "{1}{G}", { power: "3", toughness: "3" });
const food = card("Food", "Token Artifact — Food", "", { oracleText: "{2}, {T}, Sacrifice this token: You gain 3 life." });
const tgt = (id: string) => ({ kind: "object" as const, id });
/** Puts a fresh copy of \`def\` into \`pid\`'s graveyard. */
const inYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "2" });

describe("round 331: Elsha of the Infinite", () => {
  it("compiles", () => supported(elsha(), pit()));

  it("casts a noncreature spell from the top of the library in the main phase", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, elsha());
    const d = onTop(s0, ap, divination());
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, d)));
    expect(s.objects[d]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("as though it had flash: a sorcery from the top while a spell is on the stack, and in an opponent's turn", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, elsha());
    const d = onTop(s0, ap, divination());
    // With a spell of its own on the stack, it may still cast the top card.
    const o = putOnBattlefield(s0, ap, ogre);
    s0.battlefield.splice(s0.battlefield.indexOf(o), 1);
    s0.objects[o]!.zone = "hand";
    s0.players[ap]!.hand.push(o);
    let s = run(s0, planCast(s0, ap, o));
    expect(s.stack.length).toBe(1);
    expect(planCast(s, ap, d)).not.toBeNull();
    s = run(s, planCast(s, ap, d));
    expect(s.objects[d]!.zone).toBe("stack");
    // In an opponent's turn, too (with prowess's trigger and the spells resolved first).
    s = settle(s);
    expect(s.objects[d]!.zone).toBe("graveyard");
    const d2 = onTop(s, ap, divination());
    let t = s;
    for (let i = 0; i < 400 && t.activePlayer !== opp; i++) t = act(t, t.pending ? botActions(t, t.pending.player)[0]! : { type: "passPriority", player: waitingOn(t)! });
    for (let i = 0; i < 50 && (t.priority !== ap || t.pending); i++) t = act(t, t.pending ? botActions(t, t.pending.player)[0]! : { type: "passPriority", player: waitingOn(t)! });
    expect(t.activePlayer).toBe(opp);
    expect(t.objects[d2]!.zone).toBe("library");
    expect(planCast(t, ap, d2)).not.toBeNull();
  });

  it("only noncreature spells: a creature on top is still sorcery speed, and isn't castable from the top at all", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, elsha());
    const o = onTop(s0, ap, ogre);
    expect(planCast(s0, ap, o)).toBeNull();
  });

  it("not as though it had flash without Elsha (Into the Pit's permission is sorcery speed for a sorcery)", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, pit());
    const d = onTop(s0, ap, divination());
    const o = putOnBattlefield(s0, ap, ogre);
    s0.battlefield.splice(s0.battlefield.indexOf(o), 1);
    s0.objects[o]!.zone = "hand";
    s0.players[ap]!.hand.push(o);
    const s = run(s0, planCast(s0, ap, o));
    expect(castProblem(s, ap, d)).toMatch(/sorcery speed/);
  });
});

describe("round 331: Into the Pit", () => {
  it("casts a creature spell from the top by sacrificing a nonland permanent as well as paying its mana cost", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, pit());
    const r = putOnBattlefield(s0, ap, rock);
    const o = onTop(s0, ap, ogre);
    expect(planCast(s0, ap, o)).not.toBeNull();
    const s = settle(run(s0, planCast(s0, ap, o, undefined, undefined, undefined, undefined, { sacrifice: [r] })));
    expect(s.objects[r]!.zone).toBe("graveyard");
    expect(s.objects[o]!.zone).toBe("battlefield");
  });

  it("a land can't be sacrificed for it, and with no nonland permanent but itself, Into the Pit is sacrificed", () => {
    const { s: s0, ap } = setup([]);
    const p = putOnBattlefield(s0, ap, pit());
    const o = onTop(s0, ap, ogre);
    const land = s0.battlefield.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Mountain")!;
    expect(() => run(s0, planCast(s0, ap, o, undefined, undefined, undefined, undefined, { sacrifice: [land] }))).toThrow();
    const s = settle(run(s0, planCast(s0, ap, o, undefined, undefined, undefined, undefined, { sacrifice: [p] })));
    expect(s.objects[p]!.zone).toBe("graveyard");
    expect(s.objects[o]!.zone).toBe("battlefield");
  });

  it("with no nonland permanent to sacrifice, the top card can't be cast", () => {
    const { s: s0, ap } = setup([]);
    const p = putOnBattlefield(s0, ap, pit());
    const o = onTop(s0, ap, ogre);
    // Into the Pit stops being a permanent it could sacrifice once it's gone.
    s0.battlefield.splice(s0.battlefield.indexOf(p), 1);
    expect(planCast(s0, ap, o)).toBeNull();
  });

  it("with Elsha too, a noncreature spell is cast with Elsha's permission: nothing is sacrificed", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, pit());
    putOnBattlefield(s0, ap, elsha());
    const r = putOnBattlefield(s0, ap, rock);
    const d = onTop(s0, ap, divination());
    const s = settle(run(s0, planCast(s0, ap, d)));
    expect(s.objects[d]!.zone).toBe("graveyard");
    expect(s.objects[r]!.zone).toBe("battlefield");
  });

  it("a bot casts from the top with it, sacrificing its least valuable nonland permanent", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, pit());
    const r = putOnBattlefield(s0, ap, rock);
    const o = onTop(s0, ap, ogre);
    s0.players[ap]!.hand = [];
    let s = s0;
    for (let i = 0; i < 20 && s.objects[o]!.zone === "library"; i++) s = act(s, botActions(s, ap)[0]!);
    expect(s.objects[o]!.zone).not.toBe("library");
    expect(s.objects[r]!.zone).toBe("graveyard");
  });
});

describe("round 331: Intrepid Paleontologist", () => {
  it("compiles", () => supported(paleo(), adept()));

  it("exiles a Dinosaur card from your graveyard, casts it from exile, and it enters with a finality counter", () => {
    const { s: s0, ap } = setup([]);
    const p = putOnBattlefield(s0, ap, paleo());
    const dn = inYard(s0, ap, dino);
    let s = settle(run(s0, planActivate(s0, ap, p, 0, [tgt(dn)])));
    expect(s.objects[dn]!.zone).toBe("exile");
    s = settle(run(s, planCast(s, ap, dn)));
    expect(s.objects[dn]!.zone).toBe("battlefield");
    expect(s.objects[dn]!.counters.finality).toBe(1);
    // A creature with a finality counter that would die is exiled instead.
    s.objects[dn]!.damage = 5;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[dn]!.zone).toBe("exile");
    expect(planCast(s, ap, dn)).toBeNull();
  });

  it("only Dinosaur creature cards you own: not another creature card, nor an opponent's Dinosaur", () => {
    const { s: s0, ap, opp } = setup([]);
    const p = putOnBattlefield(s0, ap, paleo());
    const b = inYard(s0, ap, ogre);
    const theirs = inYard(s0, opp, dino);
    let s = settle(run(s0, planActivate(s0, ap, p, 0, [tgt(b)])));
    s = settle(run(s, planActivate(s, ap, p, 0, [tgt(theirs)])));
    expect([s.objects[b]!.zone, s.objects[theirs]!.zone]).toEqual(["exile", "exile"]);
    expect(planCast(s, ap, b)).toBeNull();
    expect(planCast(s, ap, theirs)).toBeNull();
    expect(planCast(s, opp, theirs)).toBeNull();
  });

  it("not once Intrepid Paleontologist has left the battlefield, and at sorcery speed only", () => {
    const { s: s0, ap } = setup([]);
    const p = putOnBattlefield(s0, ap, paleo());
    const dn = inYard(s0, ap, dino);
    let s = settle(run(s0, planActivate(s0, ap, p, 0, [tgt(dn)])));
    // With a spell on the stack, a creature spell can't be cast.
    const o = putOnBattlefield(s, ap, ogre);
    s.battlefield.splice(s.battlefield.indexOf(o), 1);
    s.objects[o]!.zone = "hand";
    s.players[ap]!.hand.push(o);
    const t = run(s, planCast(s, ap, o));
    expect(castProblem(t, ap, dn)).toMatch(/sorcery speed/);
    s.battlefield.splice(s.battlefield.indexOf(p), 1);
    s.objects[p]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(p);
    expect(planCast(s, ap, dn)).toBeNull();
  });
});

describe("round 331: Osteomancer Adept", () => {
  it("until end of turn, casts a creature spell from the graveyard by exiling three other cards; it enters with a finality counter", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, adept());
    const og = inYard(s0, ap, ogre);
    const others = [inYard(s0, ap, rock), inYard(s0, ap, rock), inYard(s0, ap, rock)];
    expect(planCast(s0, ap, og, undefined, undefined, undefined, undefined, { via: "permission", exileCards: others })).toBeNull();
    let s = settle(run(s0, planActivate(s0, ap, a, 0)));
    expect(s.objects[a]!.tapped).toBe(true);
    s = settle(run(s, planCast(s, ap, og, undefined, undefined, undefined, undefined, { via: "permission", exileCards: others })));
    expect(s.objects[og]!.zone).toBe("battlefield");
    expect(s.objects[og]!.counters.finality).toBe(1);
    expect(others.map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile", "exile"]);
  });

  it("forages by sacrificing a Food instead; with neither three other cards nor a Food it can't be cast", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, adept());
    const og = inYard(s0, ap, ogre);
    inYard(s0, ap, rock);
    inYard(s0, ap, rock);
    let s = settle(run(s0, planActivate(s0, ap, a, 0)));
    expect(planCast(s, ap, og, undefined, undefined, undefined, undefined, { via: "permission" })).toBeNull();
    const f = putOnBattlefield(s, ap, food);
    s = settle(run(s, planCast(s, ap, og, undefined, undefined, undefined, undefined, { via: "permission", sacrifice: [f] })));
    expect(s.objects[og]!.zone).toBe("battlefield");
    expect(s.objects[og]!.counters.finality).toBe(1);
  });

  it("creature spells only, and only this turn", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, adept());
    const r = inYard(s0, ap, rock);
    const og = inYard(s0, ap, ogre);
    for (let i = 0; i < 3; i++) inYard(s0, ap, rock);
    let s = settle(run(s0, planActivate(s0, ap, a, 0)));
    expect(castProblem(s, ap, r, undefined, undefined, undefined, undefined, undefined, { via: "permission" })).toBeDefined();
    for (let i = 0; i < 400 && s.activePlayer === ap; i++) s = act(s, s.pending ? botActions(s, s.pending.player)[0]! : { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[og]!.zone).toBe("graveyard");
    expect(castProblem(s, ap, og, undefined, undefined, undefined, undefined, undefined, { via: "permission" })).toBeDefined();
  });

  it("a bot taps it before combat and casts its creature card from the graveyard, foraging with three other cards", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, adept());
    const og = inYard(s0, ap, ogre);
    for (let i = 0; i < 4; i++) inYard(s0, ap, rock);
    s0.players[ap]!.hand = [];
    let s = s0;
    for (let i = 0; i < 40 && s.objects[og]!.zone !== "battlefield" && s.step === "main1"; i++) s = act(s, botActions(s, s.pending?.player ?? s.priority)[0]!);
    expect(s.objects[og]!.zone).toBe("battlefield");
    expect(s.objects[og]!.counters.finality).toBe(1);
  });
});

describe("round 331: Fblthp, Lost on the Range", () => {
  it("compiles", () => supported(fblthp()));

  it("plots the top card of your library for its mana cost, then casts it free on a later turn", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, fblthp());
    const o = onTop(s0, ap, ogre);
    expect(plotCost(s0, ap, s0.cards[s0.objects[o]!.cardId]!, s0.objects[o]!)).toBe("{2}{R}");
    let s = run(s0, planPlot(s0, ap, o));
    expect(s.objects[o]!.zone).toBe("exile");
    expect(s.objects[o]!.mayPlay?.until).toBe("plot");
    expect(s.battlefield.filter((id) => s.objects[id]!.tapped && s.objects[id]!.controller === ap).length).toBe(3);
    // Not the same turn (CR 702.170d).
    expect(planCast(s, ap, o)).toBeNull();
    for (let i = 0; i < 2000 && !(s.activePlayer === ap && s.step === "main1" && s.turn > s0.turn); i++) s = act(s, s.pending ? botActions(s, s.pending.player)[0]! : { type: "passPriority", player: waitingOn(s)! });
    const tapped = s.battlefield.filter((id) => s.objects[id]!.tapped).length;
    s = settle(run(s, planCast(s, ap, o)));
    expect(s.objects[o]!.zone).toBe("battlefield");
    expect(s.battlefield.filter((id) => s.objects[id]!.tapped).length).toBe(tapped);
  });

  it("a card with plot of its own on top: the cheaper of its plot cost and its mana cost", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, fblthp());
    const o = onTop(s0, ap, djinn());
    expect(plotCost(s0, ap, s0.cards[s0.objects[o]!.cardId]!, s0.objects[o]!)).toBe("{3}{U}");
  });

  it("not a land, not the second card, not without Fblthp, and only at sorcery speed", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, fblthp());
    const second = onTop(s0, ap, ogre);
    const land = onTop(s0, ap, forest);
    expect(plotProblem(s0, ap, land)).toMatch(/only a card in your hand/);
    expect(plotProblem(s0, ap, second)).toMatch(/only a card in your hand/);
    s0.players[ap]!.library.shift();
    s0.players[ap]!.library.push(land);
    expect(planPlot(s0, ap, second)).not.toBeNull();
    const o = putOnBattlefield(s0, ap, ogre);
    s0.battlefield.splice(s0.battlefield.indexOf(o), 1);
    s0.objects[o]!.zone = "hand";
    s0.players[ap]!.hand.push(o);
    // A card in your hand without plot: Fblthp gives plot only to the top card.
    expect(plotProblem(s0, ap, o)).toMatch(/doesn't have plot/);
    const t = run(s0, planCast(s0, ap, o));
    expect(plotProblem(t, ap, second)).toMatch(/main phase while the stack is empty/);
    s0.battlefield.splice(s0.battlefield.indexOf(f), 1);
    expect(plotProblem(s0, ap, second)).toMatch(/only a card in your hand/);
  });

  it("a bot plots its top card in its second main phase with mana to spare", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, fblthp());
    const o = onTop(s0, ap, ogre);
    s0.players[ap]!.hand = [];
    let s = s0;
    for (let i = 0; i < 300 && s.objects[o]!.zone === "library" && s.activePlayer === ap; i++) s = act(s, s.pending ? botActions(s, s.pending.player)[0]! : botActions(s, waitingOn(s)!)[0]!);
    expect(s.objects[o]!.zone).toBe("exile");
    expect(s.objects[o]!.mayPlay?.until).toBe("plot");
  });
});
