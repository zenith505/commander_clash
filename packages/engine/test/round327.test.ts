// Round 327 (Lane A, skip-list cards): "Choose a creature at random. You gain control of that creature until end of turn.
// Untap it. It gains haste until end of turn. Then destroy all other creatures." (The Nipton Lottery); "Reveal a card in
// your hand, then put that card onto the battlefield if it has the same name as a permanent." (Retraced Image); "You may
// put one of those cards onto the battlefield if it has the same name as a permanent." (Mitotic Manipulation); "Whenever a
// creature enters, if you cast it from your hand, you may search your library for a creature card with the same total
// power and toughness" (Wild Pair).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, canCast, flashGranted, legalTargets, compileCard, controllerOf, invalidateCharacteristics, isFullySupported, moveObject, objHasKeyword, objIsType, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

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
/** A card in `pid`'s `zone` (on top of the library). */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Only these cards in `pid`'s hand: the rest of it to the bottom of their library. */
const onlyInHand = (s: GameState, pid: PlayerId, keep: string[]) => {
  const p = s.players[pid]!;
  for (const id of p.hand.filter((x) => !keep.includes(x))) {
    p.hand.splice(p.hand.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    p.library.push(id);
  }
  invalidateCharacteristics(s);
};
const creature = (name: string, p: number, t: number) => card(name, "Creature — Beast", "{1}{G}", { cmc: 2, power: String(p), toughness: String(t) });
const relic = (name = "Test Relic") => card(name, "Artifact", "{2}", { cmc: 2 });
const creaturesOut = (s: GameState) => s.battlefield.filter((id) => objIsType(s, s.objects[id]!, "Creature"));

// Real oracle text (Scryfall).
const nipton = (): CardDef => ({"oracleId":"8af798a9-2198-4f39-aa6d-5420a0f1203c","name":"The Nipton Lottery","manaCost":"{2}{B}{R}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose a creature at random. You gain control of that creature until end of turn. Untap it. It gains haste until end of turn. Then destroy all other creatures.","colors":["B","R"],"colorIdentity":["B","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/9/59c59808-ae7a-40c4-b4b5-970264fdd32d.jpg?1783912191","artUrl":"https://cards.scryfall.io/art_crop/front/5/9/59c59808-ae7a-40c4-b4b5-970264fdd32d.jpg?1783912191","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const retraced = (): CardDef => ({"oracleId":"a97f2f2a-5a8c-4f8a-99d1-83ebc4b0bdba","name":"Retraced Image","manaCost":"{U}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Reveal a card in your hand, then put that card onto the battlefield if it has the same name as a permanent.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/6/c62fa778-ce44-4a3e-958a-91dfe5398944.jpg?1783945161","artUrl":"https://cards.scryfall.io/art_crop/front/c/6/c62fa778-ce44-4a3e-958a-91dfe5398944.jpg?1783945161","commanderLegal":"legal","set":"tor","releasedAt":"2002-02-04","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const mitotic = (): CardDef => ({"oracleId":"69cc006d-172f-4e4c-bb75-10d772b061b1","name":"Mitotic Manipulation","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Look at the top seven cards of your library. You may put one of those cards onto the battlefield if it has the same name as a permanent. Put the rest on the bottom of your library in any order.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/a/2abd4521-62c8-4b2f-a406-a8ddfa8f475a.jpg?1783941388","artUrl":"https://cards.scryfall.io/art_crop/front/2/a/2abd4521-62c8-4b2f-a406-a8ddfa8f475a.jpg?1783941388","commanderLegal":"legal","set":"mbs","releasedAt":"2011-02-04","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const wildPair = (): CardDef => ({"oracleId":"4fdde84f-4103-4209-a296-60d1bf94af65","name":"Wild Pair","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a creature enters, if you cast it from your hand, you may search your library for a creature card with the same total power and toughness, put it onto the battlefield, then shuffle.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/3/f3153d2c-9168-4889-9179-23faa9c48721.jpg?1783937289","artUrl":"https://cards.scryfall.io/art_crop/front/f/3/f3153d2c-9168-4889-9179-23faa9c48721.jpg?1783937289","commanderLegal":"legal","set":"cn2","releasedAt":"2016-08-26","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const hexproofBear = (): CardDef => ({"oracleId":"385c1208-bfea-44e2-b236-4f38bc90db9f","name":"Gladecover Scout","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Scout","supertypes":[],"types":["Creature"],"subtypes":["Elf","Scout"],"oracleText":"Hexproof (This creature can't be the target of spells or abilities your opponents control.)","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":["Hexproof"],"imageUrl":"https://cards.scryfall.io/normal/front/2/6/26710d5c-01d1-498b-9f54-521dfd195843.jpg?1783941059","artUrl":"https://cards.scryfall.io/art_crop/front/2/6/26710d5c-01d1-498b-9f54-521dfd195843.jpg?1783941059","commanderLegal":"legal","set":"m12","releasedAt":"2011-07-15","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const clash = (): CardDef => ({"oracleId":"610d9f58-4182-49cb-855c-9b6030e7f714","name":"Fated Clash","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"You may cast this spell as though it had flash if a creature is attacking and a creature is blocking.\nTarget creature you control and target creature an opponent controls each gain indestructible until end of turn. Then destroy all creatures.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/d/bd84f688-a2bb-4f1e-ae24-1a5cf8a05445.jpg?1783904654","artUrl":"https://cards.scryfall.io/art_crop/front/b/d/bd84f688-a2bb-4f1e-ae24-1a5cf8a05445.jpg?1783904654","commanderLegal":"legal","set":"fic","releasedAt":"2025-12-05","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const unwritten = (): CardDef => ({"oracleId":"b0060b32-b856-4ff7-a113-cec2dc8f8dc6","name":"See the Unwritten","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Reveal the top eight cards of your library. You may put a creature card from among them onto the battlefield. Put the rest into your graveyard.\nFerocious — If you control a creature with power 4 or greater, you may put two creature cards onto the battlefield instead of one.","colors":["G"],"colorIdentity":["G"],"keywords":["Ferocious"],"imageUrl":"https://cards.scryfall.io/normal/front/3/6/3689a7f1-9713-412e-a030-9cba463c170e.jpg?1783939064","artUrl":"https://cards.scryfall.io/art_crop/front/3/6/3689a7f1-9713-412e-a030-9cba463c170e.jpg?1783939064","commanderLegal":"legal","set":"ktk","releasedAt":"2014-09-26","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const delirium = (): CardDef => ({"oracleId":"a00e5eb6-b916-4cd6-8ff2-c02f4929abc7","name":"Delirium","manaCost":"{1}{B}{R}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Cast this spell only during an opponent's turn.\nTap target creature that player controls. That creature deals damage equal to its power to the player. Prevent all combat damage that would be dealt to and dealt by the creature this turn.","colors":["B","R"],"colorIdentity":["B","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/5/c52981ea-1173-4f4b-a929-705a11c6e381.jpg?1783947054","artUrl":"https://cards.scryfall.io/art_crop/front/c/5/c52981ea-1173-4f4b-a929-705a11c6e381.jpg?1783947054","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const pushLimit = (): CardDef => ({"oracleId":"62e54c6d-d775-4597-bd4d-dc38460b33ec","name":"Push the Limit","manaCost":"{5}{R}{R}","cmc":7,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Return all Mount and Vehicle cards from your graveyard to the battlefield. Sacrifice them at the beginning of the next end step.\nVehicles you control become artifact creatures until end of turn. Creatures you control gain haste until end of turn.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/1/21de84a2-2654-4e1a-a569-bf385bb43685.jpg?1783907878","artUrl":"https://cards.scryfall.io/art_crop/front/2/1/21de84a2-2654-4e1a-a569-bf385bb43685.jpg?1783907878","commanderLegal":"legal","set":"dft","releasedAt":"2025-02-14","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);

describe("round 327", () => {
  it("are fully supported", () => supported(nipton(), retraced(), mitotic(), wildPair(), clash(), unwritten(), delirium(), pushLimit()));
});

describe("round 327: The Nipton Lottery", () => {
  it("one creature at random, anyone's, survives under your control until end of turn, untapped with haste", () => {
    const { s: s0, ap, opp, ids } = setup([nipton()]);
    const all = [putOnBattlefield(s0, ap, creature("Mine", 2, 2)), ...s0.turnOrder.filter((p) => p !== ap).map((p) => putOnBattlefield(s0, p, creature(`Theirs ${p}`, 3, 3)))];
    void opp;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    const left = creaturesOut(s);
    expect(left.length).toBe(1);
    expect(all).toContain(left[0]);
    expect(all.filter((id) => id !== left[0]).every((id) => s.objects[id]!.zone === "graveyard")).toBe(true);
    expect(controllerOf(s, s.objects[left[0]!]!)).toBe(ap);
    expect(objHasKeyword(s, s.objects[left[0]!]!, "Haste")).toBe(true);
  });
  it("takes a hexproof creature an opponent controls, untaps it, and gives it back at end of turn", () => {
    const { s: s0, ap, opp, ids } = setup([nipton()]);
    const scout = putOnBattlefield(s0, opp, hexproofBear());
    s0.objects[scout]!.tapped = true;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    // Not targeted, so hexproof doesn't matter (rulings).
    expect(s.objects[scout]!.zone).toBe("battlefield");
    expect(s.objects[scout]!.tapped).toBeFalsy();
    expect(controllerOf(s, s.objects[scout]!)).toBe(ap);
    expect(objHasKeyword(s, s.objects[scout]!, "Haste")).toBe(true);
    s = passUntil(s, "upkeep");
    expect(controllerOf(s, s.objects[scout]!)).toBe(opp);
    expect(objHasKeyword(s, s.objects[scout]!, "Haste")).toBe(false);
  });
  it("with no creatures, does nothing", () => {
    const { s: s0, ap, ids } = setup([nipton()]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(creaturesOut(s)).toEqual([]);
  });
});

describe("round 327: Retraced Image", () => {
  it("asks which card to reveal and puts it onto the battlefield when a permanent has its name (not a land play)", () => {
    const { s: s0, ap, ids } = setup([retraced(), relic(), creature("Lone Beast", 2, 2)]);
    onlyInHand(s0, ap, ids);
    putOnBattlefield(s0, ap, relic());
    const played = s0.players[ap]!.landsPlayedThisTurn;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.pending?.kind).toBe("searchLibrary");
    if (s.pending?.kind !== "searchLibrary") throw new Error();
    expect([...s.pending.cards].sort()).toEqual([ids[1]!, ids[2]!].sort());
    expect(s.pending.min).toBe(1);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ids[1]!] }), ap);
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[2]!]!.zone).toBe("hand");
    expect(s.players[ap]!.landsPlayedThisTurn).toBe(played);
  });
  it("a card without the name of a permanent stays in the hand; an opponent's permanent's name counts", () => {
    const { s: s0, ap, opp, ids } = setup([retraced(), relic("Other Relic"), creature("Shared Beast", 2, 2)]);
    onlyInHand(s0, ap, ids);
    putOnBattlefield(s0, opp, creature("Shared Beast", 2, 2));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ids[1]!] }), ap);
    expect(s.objects[ids[1]!]!.zone).toBe("hand");
    expect(s.log.some((l) => /reveals Other Relic/.test(l.text))).toBe(true);
    s = settle(run(s, planCast(s, ap, into(s, ap, retraced(), "hand"))), ap);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ids[2]!] }), ap);
    expect(s.objects[ids[2]!]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[ids[2]!]!)).toBe(ap);
  });
  it("with one card in hand, reveals that one without asking", () => {
    const { s: s0, ap, ids } = setup([retraced(), relic()]);
    onlyInHand(s0, ap, ids);
    putOnBattlefield(s0, ap, relic());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.pending).toBeFalsy();
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
  });
  it("the bot reveals a card that will be put onto the battlefield", () => {
    const { s: s0, ap, ids } = setup([retraced(), creature("Cheap Beast", 1, 1), relic(), creature("Other Beast", 3, 3)]);
    onlyInHand(s0, ap, ids);
    putOnBattlefield(s0, ap, relic());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    s = settle(act(s, botActions(s, ap)[0]!), ap);
    expect(s.objects[ids[2]!]!.zone).toBe("battlefield");
  });
});

describe("round 327: Mitotic Manipulation", () => {
  it("offers only the cards named like a permanent among the top seven; the rest go to the bottom", () => {
    const { s: s0, ap, ids } = setup([mitotic()]);
    putOnBattlefield(s0, ap, relic());
    const top = [into(s0, ap, relic(), "library"), into(s0, ap, relic("Unseen Relic"), "library")];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.pending?.kind).toBe("searchLibrary");
    if (s.pending?.kind !== "searchLibrary") throw new Error();
    // Only cards named like a permanent: the relic and the Forests (setup's lands), not the unseen relic.
    expect(s.pending.cards).toContain(top[0]!);
    expect(s.pending.cards).not.toContain(top[1]!);
    expect(s.pending.cards.every((id) => ["Test Relic", "Forest"].includes(s.cards[s.objects[id]!.cardId]!.name))).toBe(true);
    expect(s.pending.max).toBe(1);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [top[0]!] }), ap);
    if (s.pending?.player === ap) s = settle(act(s, botActions(s, ap)[0]!), ap);
    expect(s.objects[top[0]!]!.zone).toBe("battlefield");
    const lib = s.players[ap]!.library;
    expect(lib.indexOf(top[1]!)).toBeGreaterThanOrEqual(lib.length - 6);
  });
  it("with no match, nothing is put onto the battlefield", () => {
    const { s: s0, ap, ids } = setup([mitotic()]);
    const top = into(s0, ap, relic("Unseen Relic"), "library");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    while (s.pending?.player === ap) s = settle(act(s, botActions(s, ap)[0]!), ap);
    expect(s.objects[top]!.zone).toBe("library");
    expect(s.battlefield.filter((id) => s.objects[id]!.owner === ap && objIsType(s, s.objects[id]!, "Creature"))).toEqual([]);
  });
});

describe("round 327: Wild Pair", () => {
  const library = (s: GameState, pid: PlayerId) => ({ small: into(s, pid, creature("One Three", 1, 3), "library"), big: into(s, pid, creature("Three Three", 3, 3), "library"), zero: into(s, pid, creature("Zero Four", 0, 4), "library") });
  it("casting a creature from your hand searches for one with the same total power and toughness", () => {
    const { s: s0, ap, ids } = setup([creature("Cast Beast", 2, 2)]);
    putOnBattlefield(s0, ap, wildPair());
    const lib = library(s0, ap);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(s.pending?.kind).toBe("searchLibrary");
    if (s.pending?.kind !== "searchLibrary") throw new Error();
    expect(s.pending.cards).toContain(lib.small);
    expect(s.pending.cards).toContain(lib.zero);
    expect(s.pending.cards).not.toContain(lib.big);
    expect(s.pending.what).toMatch(/total power and toughness 4/);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [lib.zero] }), ap);
    expect(s.objects[lib.zero]!.zone).toBe("battlefield");
  });
  it("doesn't trigger for a creature put onto the battlefield, or one an opponent casts", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, wildPair());
    let s = s0;
    const put = into(s, ap, creature("Put Beast", 2, 2), "hand");
    moveObject(s, put, "battlefield");
    invalidateCharacteristics(s);
    expect(s.triggerQueue.length).toBe(0);
    s = settle(s, ap);
    expect(s.pending).toBeFalsy();
    // An opponent's creature spell from their hand.
    s = passUntil(s, "main1", opp);
    for (const l of ["Forest", "Forest"]) putOnBattlefield(s, opp, card(l, "Basic Land — Forest"));
    const theirs = into(s, opp, creature("Their Beast", 2, 2), "hand");
    s = settle(run(s, planCast(s, opp, theirs)), ap);
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(s.pending).toBeFalsy();
  });
  it("uses the creature's power and toughness as it is now, or as it last existed if it left (rulings)", () => {
    const { s: s0, ap, ids } = setup([creature("Cast Beast", 2, 2)]);
    putOnBattlefield(s0, ap, wildPair());
    const lib = library(s0, ap);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    // The spell resolves; the trigger is waiting on the stack. The creature dies with it there.
    for (let i = 0; i < 20 && s.objects[ids[0]!]!.zone !== "battlefield"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    moveObject(s, ids[0]!, "graveyard");
    invalidateCharacteristics(s);
    s = settle(s, ap);
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    if (s.pending?.kind !== "searchLibrary") throw new Error(`no search: ${s.pending?.kind}`);
    expect(s.pending.cards).toContain(lib.small);
    expect(s.pending.cards).not.toContain(lib.big);
  });
});

describe("round 327: Fated Clash", () => {
  it("may be cast as though it had flash only while a creature is attacking and a creature is blocking", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, opp, creature("Attacker", 2, 2));
    const b = putOnBattlefield(s0, ap, creature("Blocker", 2, 2));
    expect(flashGranted(s0, ap, clash())).toBe(false);
    s0.objects[a]!.attacking = ap;
    invalidateCharacteristics(s0);
    expect(flashGranted(s0, ap, clash())).toBe(false);
    s0.objects[b]!.blocking = [a];
    s0.objects[a]!.blockedBy = [b];
    invalidateCharacteristics(s0);
    expect(flashGranted(s0, ap, clash())).toBe(true);
  });
  it("the two targets gain indestructible, then every creature is destroyed", () => {
    const { s: s0, ap, opp, ids } = setup([clash()]);
    const [mine, theirs, other, more] = [putOnBattlefield(s0, ap, creature("Mine", 2, 2)), putOnBattlefield(s0, opp, creature("Theirs", 2, 2)), putOnBattlefield(s0, ap, creature("Other", 2, 2)), putOnBattlefield(s0, opp, creature("More", 2, 2))];
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: mine }, { kind: "object", id: theirs }])), ap);
    expect(s.objects[mine]!.zone).toBe("battlefield");
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(s.objects[other]!.zone).toBe("graveyard");
    expect(s.objects[more]!.zone).toBe("graveyard");
  });
});

describe("round 327: See the Unwritten", () => {
  it("one creature card from the top eight, the rest into the graveyard", () => {
    const { s: s0, ap, ids } = setup([unwritten()]);
    const top = [into(s0, ap, creature("Found A", 2, 2), "library"), into(s0, ap, creature("Found B", 2, 2), "library"), into(s0, ap, relic(), "library")];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    if (s.pending?.kind !== "searchLibrary") throw new Error();
    expect(s.pending.max).toBe(1);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [top[0]!] }), ap);
    while (s.pending?.player === ap) s = settle(act(s, botActions(s, ap)[0]!), ap);
    expect(s.objects[top[0]!]!.zone).toBe("battlefield");
    expect(s.objects[top[1]!]!.zone).toBe("graveyard");
    expect(s.objects[top[2]!]!.zone).toBe("graveyard");
  });
  it("ferocious: two creature cards while you control a creature with power 4 or greater", () => {
    const { s: s0, ap, ids } = setup([unwritten()]);
    putOnBattlefield(s0, ap, creature("Big Beast", 4, 4));
    const top = [into(s0, ap, creature("Found A", 2, 2), "library"), into(s0, ap, creature("Found B", 2, 2), "library")];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    if (s.pending?.kind !== "searchLibrary") throw new Error();
    expect(s.pending.max).toBe(2);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: top }), ap);
    while (s.pending?.player === ap) s = settle(act(s, botActions(s, ap)[0]!), ap);
    expect(top.every((id) => s.objects[id]!.zone === "battlefield")).toBe(true);
  });
});

describe("round 327: Delirium", () => {
  /** On `opp`'s turn, passing until `ap` has priority with nothing on the stack. */
  const theirTurn = (s0: GameState, ap: PlayerId, opp: PlayerId) => {
    let s = passUntil(s0, "main1", opp);
    for (let i = 0; i < 8 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(waitingOn(s)).toBe(ap);
    return s;
  };
  it("on an opponent's turn: taps their creature, which deals damage equal to its power to them; its combat damage is prevented", () => {
    const { s: s0, ap, opp, ids } = setup([delirium()]);
    const giant = putOnBattlefield(s0, opp, creature("Their Giant", 3, 3));
    const mine = putOnBattlefield(s0, ap, creature("Mine", 2, 2));
    expect(canCast(s0, ap, ids[0]!)).toBe(false);
    let s = theirTurn(s0, ap, opp);
    const spec = compileCard(delirium()).spell!.targets[0]!;
    const legal = legalTargets(s, spec, ap).map((t) => (t.kind === "object" ? t.id : t.kind));
    expect(legal).toContain(giant);
    expect(legal).not.toContain(mine);
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: giant }])), ap);
    expect(s.objects[giant]!.tapped).toBe(true);
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.effects.some((e) => e.affected.includes(giant) && e.mods.some((m) => m.kind === "preventDamage"))).toBe(true);
  });
});

describe("round 327: Push the Limit", () => {
  it("returns Mount and Vehicle cards (not other creatures), Vehicles become artifact creatures, creatures gain haste; sacrificed at the next end step", () => {
    const { s: s0, ap, ids } = setup([pushLimit()]);
    const wagon = into(s0, ap, card("Test Wagon", "Artifact — Vehicle", "{2}", { cmc: 2, power: "3", toughness: "3", oracleText: "Crew 1" }), "graveyard");
    const horse = into(s0, ap, card("Test Steed", "Creature — Horse Mount", "{1}{W}", { cmc: 2, power: "2", toughness: "2" }), "graveyard");
    const beast = into(s0, ap, creature("Yard Beast", 2, 2), "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.objects[wagon]!.zone).toBe("battlefield");
    expect(s.objects[horse]!.zone).toBe("battlefield");
    expect(s.objects[beast]!.zone).toBe("graveyard");
    expect(objIsType(s, s.objects[wagon]!, "Creature")).toBe(true);
    expect(objHasKeyword(s, s.objects[wagon]!, "Haste")).toBe(true);
    expect(objHasKeyword(s, s.objects[horse]!, "Haste")).toBe(true);
    s = passUntil(s, "cleanup", ap);
    expect(s.objects[wagon]!.zone).toBe("graveyard");
    expect(s.objects[horse]!.zone).toBe("graveyard");
  });
});
