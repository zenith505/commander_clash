// Lane B round B117: Lumaret's Favor (infusion: copy it if you gained life this turn, new targets allowed), Emerald Dragon's
// Dissonant Wave (counter an ability from a noncreature source), Discovery // Dispersal (each opponent returns a nonland
// permanent with the greatest mana value among all their permanents, then discards), Dismantle (that many +1/+1 or charge
// counters on an artifact you control), Ashnod's Cylix (the target player keeps one of the top three and exiles the rest),
// Addle (a card of the chosen color from the revealed hand), Watchers of the Dead (each opponent keeps two cards in their
// graveyard), Samite Elder (protection from each of a target permanent's colors).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions of the players in `me` stop it, others the bots answer. */
const settle = (s: GameState, opts: { me?: PlayerId[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const next = (s: GameState, p: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(p) + n) % 4]!;
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
/** Moves a new card for `def` from the battlefield into `pid`'s `zone` (on top of a library, or of a graveyard). */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Empties `pid`'s hand into exile. */
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of s.players[pid]!.hand) {
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  s.players[pid]!.hand = [];
};
const keywords = (s: GameState, id: string) => characteristics(s, s.objects[id]!).keywords;
const counters = (s: GameState, id: string) => s.objects[id]!.counters;

// Real oracle text (Scryfall).
const lumaret = (): CardDef => ({"oracleId":"d514704b-4055-48ed-9da3-e4397fca7576","name":"Lumaret's Favor","manaCost":"{1}{G}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Infusion — When you cast this spell, copy it if you gained life this turn. You may choose new targets for the copy.\nTarget creature gets +2/+4 until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":["Infusion"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const emerald = (): CardDef => ({"oracleId":"c5632f18-7904-4a29-82be-6a6ef8e85e18","name":"Emerald Dragon // Dissonant Wave","manaCost":"{4}{G}{G} // {2}{G}","cmc":6,"typeLine":"Creature — Dragon // Instant — Adventure","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying, trample","power":"4","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":["Flying","Trample"],"commanderLegal":"legal","layout":"adventure","faces":[{"name":"Emerald Dragon","manaCost":"{4}{G}{G}","typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying, trample","power":"4","toughness":"4","colors":["G"]},{"name":"Dissonant Wave","manaCost":"{2}{G}","typeLine":"Instant — Adventure","supertypes":[],"types":["Instant"],"subtypes":["Adventure"],"oracleText":"Counter target activated or triggered ability from a noncreature source. (Then exile this card. You may cast the creature later from exile.)","colors":["G"]}]}) as CardDef;
const discovery = (): CardDef => ({"oracleId":"8f1c1bd6-8420-4de2-81f4-5faa419da301","name":"Discovery // Dispersal","manaCost":"{1}{U/B} // {3}{U}{B}","cmc":7,"typeLine":"Sorcery // Instant","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Surveil 2, then draw a card. (To surveil 2, look at the top two cards of your library, then put any number of them into your graveyard and the rest on top of your library in any order.)","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Surveil"],"commanderLegal":"legal","layout":"split","faces":[{"name":"Discovery","manaCost":"{1}{U/B}","typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Surveil 2, then draw a card. (To surveil 2, look at the top two cards of your library, then put any number of them into your graveyard and the rest on top of your library in any order.)","colors":["U","B"]},{"name":"Dispersal","manaCost":"{3}{U}{B}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Each opponent returns a nonland permanent they control with the greatest mana value among permanents they control to its owner's hand, then discards a card.","colors":["U","B"]}]}) as CardDef;
const dismantle = (): CardDef => ({"oracleId":"5f4d0a43-ff5b-4f75-9144-a218ec352489","name":"Dismantle","manaCost":"{2}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Destroy target artifact. If that artifact had counters on it, put that many +1/+1 counters or charge counters on an artifact you control.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const cylix = (): CardDef => ({"oracleId":"fdf4e4c3-fe17-4098-9f76-e98f3f00bd3e","name":"Ashnod's Cylix","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{3}, {T}: Target player looks at the top three cards of their library, puts one of them back on top of their library, then exiles the rest.","colors":[],"colorIdentity":[],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const addle = (): CardDef => ({"oracleId":"3745aea4-4455-4859-9772-bcfd14e4067b","name":"Addle","manaCost":"{1}{B}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose a color. Target player reveals their hand and you choose a card of that color from it. That player discards that card.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const watchers = (): CardDef => ({"oracleId":"9ac46f46-3099-4ad9-ae58-bf25d7270e87","name":"Watchers of the Dead","manaCost":"{2}","cmc":2,"typeLine":"Artifact Creature — Cat","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Cat"],"oracleText":"Exile this creature: Each opponent chooses two cards in their graveyard and exiles the rest.","power":"2","toughness":"2","colors":[],"colorIdentity":[],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const elder = (): CardDef => ({"oracleId":"8feb27aa-1f62-46e5-ba20-72c712de0862","name":"Samite Elder","manaCost":"{2}{W}","cmc":3,"typeLine":"Creature — Human Cleric","supertypes":[],"types":["Creature"],"subtypes":["Human","Cleric"],"oracleText":"{T}: Choose target permanent you control. Creatures you control gain protection from each of that permanent's colors until end of turn.","power":"1","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;

// Test cards.
const salve = card("Test Salve", "Instant", "{W}", { cmc: 1, colors: ["W"], oracleText: "You gain 2 life." });
const rock = card("Test Rock", "Artifact", "{2}", { cmc: 2 });
const battery = card("Test Battery", "Artifact", "{3}", { cmc: 3 });
const fortress = card("Test Fortress", "Artifact", "{4}", { cmc: 4, oracleText: "Indestructible", keywords: ["Indestructible"] });
const pinger = card("Test Land Tapper", "Artifact", "{1}", { cmc: 1, oracleText: "{T}: Tap target land." });
const tapperGuy = card("Test Tapper Guy", "Creature — Human", "{1}{U}", { cmc: 2, power: "1", toughness: "1", colors: ["U"], oracleText: "{T}: Tap target land." });
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { cmc: 3, power: "3", toughness: "3", colors: ["R"] });
const ogre2 = card("Test Other Ogre", "Creature — Ogre", "{2}{R}", { cmc: 3, power: "3", toughness: "3", colors: ["R"] });
// A land with a mana value, as a transformed land's back face has (CR 712.8e).
const valueLand = card("Test Valued Land", "Land", "{4}", { cmc: 4 });
const redGob = card("Test Goblin", "Creature — Goblin", "{R}", { cmc: 1, power: "1", toughness: "1", colors: ["R"] });
const redShot = card("Test Shot", "Sorcery", "{R}", { cmc: 1, colors: ["R"], oracleText: "Draw a card." });
const gruulRock = card("Test Gruul Charm Stone", "Artifact", "{R}{G}", { cmc: 2, colors: ["R", "G"] });
const zombie = card("Test Zombie", "Creature — Zombie", "{1}{B}", { cmc: 2, power: "2", toughness: "2", colors: ["B"] });

describe("Lane B round B117", () => {
  it("all eight cards are supported", () => supported(lumaret(), emerald(), discovery(), dismantle(), cylix(), addle(), watchers(), elder()));

  it("Lumaret's Favor: copied if you gained life this turn, and the copy may get a new target", () => {
    let { s, ap, ids } = setup([salve, lumaret()]);
    const b1 = putOnBattlefield(s, ap, bear());
    const b2 = putOnBattlefield(s, ap, bear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(s.players[ap]!.life).toBe(42);
    s = run(s, planCast(s, ap, ids[1]!, [tgt(b1)]));
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind).toBe("copyTargets");
    s = settle(act(s, { type: "copyTargets", player: ap, targets: [tgt(b2)] }), { me: [ap] });
    expect(characteristics(s, s.objects[b1]!).power).toBe(4);
    expect(characteristics(s, s.objects[b1]!).toughness).toBe(6);
    expect(characteristics(s, s.objects[b2]!).toughness).toBe(6);
  });

  it("Lumaret's Favor: the infusion ability checks as it resolves; with no life gained, no copy (rulings)", () => {
    let { s, ap, ids } = setup([lumaret()]);
    const b1 = putOnBattlefield(s, ap, bear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b1)])), { me: [ap] });
    expect(s.pending).toBeFalsy();
    expect(characteristics(s, s.objects[b1]!).toughness).toBe(6);
    expect(s.log.filter((l) => /copies|copy of/i.test(l.text)).length).toBe(0);
  });

  it("Dissonant Wave: counters an activated ability from a noncreature source, not one from a creature", () => {
    let { s, ap, ids } = setup([emerald()]);
    const opp = next(s, ap);
    const tapper = putOnBattlefield(s, ap, pinger);
    const guy = putOnBattlefield(s, ap, tapperGuy);
    const land = s.battlefield.find((id) => s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).types.includes("Land") && !s.objects[id]!.tapped)!;
    // From a creature: not a legal target.
    let t = run(s, planActivate(s, ap, guy, 0, [tgt(land)]));
    const fromCreature = t.stack[t.stack.length - 1]!;
    expect(planCast(t, ap, ids[0]!, [{ kind: "stack", id: fromCreature.id }], undefined, "auto", undefined, { face: 1 })).toBeNull();
    // From an artifact: countered; the card goes on an adventure.
    s = run(s, planActivate(s, ap, tapper, 0, [tgt(land)]));
    const ab = s.stack[s.stack.length - 1]!;
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "stack", id: ab.id }], undefined, "auto", undefined, { face: 1 }));
    s = settle(s);
    expect(s.stack.length).toBe(0);
    expect(s.objects[land]!.tapped).toBeFalsy();
    expect(zone(s, ids[0]!)).toBe("exile");
    void opp;
  });

  it("Dispersal: each opponent returns a nonland permanent with the greatest mana value among all their permanents, then discards", () => {
    let { s, ap, ids } = setup([discovery()]);
    const [o1, o2, o3] = [next(s, ap), next(s, ap, 2), next(s, ap, 3)];
    const b = putOnBattlefield(s, o1, bear());
    const og = putOnBattlefield(s, o1, ogre);
    // Their greatest is a land's: nothing of theirs can be returned.
    const r = putOnBattlefield(s, o2, rock);
    putOnBattlefield(s, o2, valueLand);
    // Tied: that player chooses one of them.
    const t1 = putOnBattlefield(s, o3, ogre);
    const t2 = putOnBattlefield(s, o3, ogre2);
    const mine = putOnBattlefield(s, ap, battery);
    const hands = [o1, o2, o3].map((p) => s.players[p]!.hand.length);
    s = settle(run(s, planCast(s, ap, ids[0]!, [], undefined, "auto", undefined, { face: 1 })));
    expect(zone(s, og)).not.toBe("battlefield");
    expect(zone(s, b)).toBe("battlefield");
    expect(zone(s, r)).toBe("battlefield");
    expect([t1, t2].filter((id) => zone(s, id) === "battlefield").length).toBe(1);
    expect(zone(s, mine)).toBe("battlefield");
    // Each discarded one card after the returns.
    expect(s.players[o1]!.hand.length).toBe(hands[0]!);
    expect(s.players[o2]!.hand.length).toBe(hands[1]! - 1);
    expect(s.players[o3]!.hand.length).toBe(hands[2]!);
  });

  it("Dismantle: that many counters of the kind you choose, on an artifact you choose", () => {
    let { s, ap, ids } = setup([dismantle()]);
    const opp = next(s, ap);
    const target = putOnBattlefield(s, opp, rock);
    s.objects[target]!.counters = { charge: 2, fuse: 1 };
    const a1 = putOnBattlefield(s, ap, rock);
    const a2 = putOnBattlefield(s, ap, battery);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(target)])), { me: [ap] });
    expect(zone(s, target)).toBe("graveyard");
    expect(s.pending?.kind === "pickPermanents" && s.pending.options).toEqual(expect.arrayContaining([a1, a2]));
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [a2] }), { me: [ap] });
    const p = s.pending;
    expect(p?.kind === "chooseOption" && p.options).toEqual(["+1/+1", "charge"]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "charge" }), { me: [ap] });
    // Every kind counts (rulings): two charge and one fuse counter.
    expect(counters(s, a2).charge).toBe(3);
    expect(counters(s, a1).charge ?? 0).toBe(0);
  });

  it("Dismantle: no counters, no choice; an indestructible artifact's counters still count (rulings)", () => {
    let { s, ap, ids } = setup([dismantle(), dismantle()]);
    const opp = next(s, ap);
    const plain = putOnBattlefield(s, opp, rock);
    const a1 = putOnBattlefield(s, ap, battery);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(plain)])), { me: [ap] });
    expect(zone(s, plain)).toBe("graveyard");
    expect(s.pending).toBeFalsy();
    expect(counters(s, a1)["+1/+1"] ?? 0).toBe(0);
    const fort = putOnBattlefield(s, opp, fortress);
    s.objects[fort]!.counters = { charge: 2 };
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(fort)])), { me: [ap] });
    expect(zone(s, fort)).toBe("battlefield");
    // Only one artifact of yours: no pick, just the kind.
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "+1/+1" }), { me: [ap] });
    expect(counters(s, a1)["+1/+1"]).toBe(2);
  });

  it("Ashnod's Cylix: the target player puts one of the top three back on top and exiles the rest", () => {
    let { s, ap } = setup([]);
    const cy = putOnBattlefield(s, ap, cylix());
    const top = s.players[ap]!.library.slice(0, 3);
    s = run(s, planActivate(s, ap, cy, 0, [{ kind: "player", id: ap }]));
    s = settle(s, { me: [ap] });
    const p = s.pending;
    expect(p?.kind === "searchLibrary" && p.cards).toEqual(top);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [top[1]!] }), { me: [ap] });
    expect(s.players[ap]!.library[0]).toBe(top[1]);
    expect(zone(s, top[0]!)).toBe("exile");
    expect(zone(s, top[2]!)).toBe("exile");
  });

  it("Ashnod's Cylix: an opponent targeted chooses for themselves", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const cy = putOnBattlefield(s, ap, cylix());
    const top = s.players[opp]!.library.slice(0, 3);
    s = settle(run(s, planActivate(s, ap, cy, 0, [{ kind: "player", id: opp }])));
    expect(top.filter((id) => zone(s, id) === "exile").length).toBe(2);
    expect(top).toContain(s.players[opp]!.library[0]);
  });

  it("Addle: choose a color, then a card of that color from the revealed hand to discard", () => {
    let { s, ap, ids } = setup([addle()]);
    const opp = next(s, ap);
    emptyHand(s, opp);
    const g = into(s, opp, redGob, "hand");
    const sh = into(s, opp, redShot, "hand");
    const z = into(s, opp, zombie, "hand");
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])), { me: [ap] });
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("color");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Red" }), { me: [ap] });
    const p = s.pending;
    expect(p?.kind === "searchLibrary" && p.cards).toEqual([g, sh]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [sh] }), { me: [ap] });
    expect(zone(s, sh)).toBe("graveyard");
    expect(zone(s, g)).toBe("hand");
    expect(zone(s, z)).toBe("hand");
  });

  it("Addle: with no card of the chosen color, nothing is discarded", () => {
    let { s, ap, ids } = setup([addle()]);
    const opp = next(s, ap);
    emptyHand(s, opp);
    const z = into(s, opp, zombie, "hand");
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])), { me: [ap] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Red" }), { me: [ap] });
    expect(s.pending).toBeFalsy();
    expect(zone(s, z)).toBe("hand");
  });

  it("Watchers of the Dead: each opponent keeps two cards in their graveyard and exiles the rest; yours is untouched", () => {
    let { s, ap } = setup([]);
    const [o1, o2, o3] = [next(s, ap), next(s, ap, 2), next(s, ap, 3)];
    const w = putOnBattlefield(s, ap, watchers());
    const y1 = [into(s, o1, bear(), "graveyard"), into(s, o1, ogre, "graveyard"), into(s, o1, zombie, "graveyard"), into(s, o1, rock, "graveyard")];
    const y2 = [into(s, o2, bear(), "graveyard"), into(s, o2, ogre, "graveyard")];
    const mine = [into(s, ap, bear(), "graveyard"), into(s, ap, ogre, "graveyard"), into(s, ap, rock, "graveyard")];
    s = settle(run(s, planActivate(s, ap, w, 0)));
    expect(zone(s, w)).toBe("exile");
    expect(y1.filter((id) => zone(s, id) === "graveyard").length).toBe(2);
    expect(y1.filter((id) => zone(s, id) === "exile").length).toBe(2);
    // Two or fewer: none exiled (rulings).
    for (const id of y2) expect(zone(s, id)).toBe("graveyard");
    for (const id of mine) expect(zone(s, id)).toBe("graveyard");
    expect(s.players[o3]!.graveyard.length).toBe(0);
  });

  it("Watchers of the Dead: an opponent's activation asks you which two cards to keep", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const mine = [into(s, ap, bear(), "graveyard"), into(s, ap, ogre, "graveyard"), into(s, ap, zombie, "graveyard")];
    const w = putOnBattlefield(s, opp, watchers());
    s = passUntil(s, "main1", opp);
    s = run(s, planActivate(s, opp, w, 0));
    s = settle(s, { me: [ap] });
    const p = s.pending;
    expect(p?.kind === "searchLibrary" && p.fromGraveyard).toBe("keep");
    expect(p?.kind === "searchLibrary" && [p.min, p.max]).toEqual([2, 2]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [mine[0]!, mine[2]!] }), { me: [ap] });
    expect(zone(s, mine[0]!)).toBe("graveyard");
    expect(zone(s, mine[2]!)).toBe("graveyard");
    expect(zone(s, mine[1]!)).toBe("exile");
  });

  it("Samite Elder: creatures you control gain protection from each of the target permanent's colors as it resolves", () => {
    let { s, ap } = setup([]);
    const el = putOnBattlefield(s, ap, elder());
    const stone = putOnBattlefield(s, ap, gruulRock);
    const b = putOnBattlefield(s, ap, bear());
    s = settle(run(s, planActivate(s, ap, el, 0, [tgt(stone)])));
    for (const id of [el, b]) {
      expect(keywords(s, id)).toContain("Protection from red");
      expect(keywords(s, id)).toContain("Protection from green");
      expect(keywords(s, id)).not.toContain("Protection from white");
    }
    // Not the artifact (not a creature); gone at end of turn.
    expect(keywords(s, stone)).not.toContain("Protection from red");
    s = passUntil(s, "upkeep", next(s, ap));
    expect(keywords(s, b)).not.toContain("Protection from red");
  });
});
