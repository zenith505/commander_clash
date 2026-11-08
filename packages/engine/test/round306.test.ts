// Round 306 (Lane A, skip-list cards): Do or Die and Make an Example (piles of creatures, CR 700.3), Unexplained Absence
// (a cloak for each permanent exiled this way), Sakashima's Will (an opponent's chosen creature; copies of a creature you
// choose), This Is How It Ends (a villainous choice to shuffle away another creature you own), Intrude on the Mind (a
// counter for each card of the pile put into your graveyard), Ixidron and Illithid Harvester (creatures turned face down).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { turnFaceUpProblem } from "../src/game";
import { applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, power, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
type T = TargetChoice;

const doordie = (): CardDef => ({"oracleId":"f25af42d-f1bf-4bd3-aded-ecadafdbf6e6","name":"Do or Die","manaCost":"{1}{B}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Separate all creatures target player controls into two piles. Destroy all creatures in the pile of that player's choice. They can't be regenerated.","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"});
const makeanexampl = (): CardDef => ({"oracleId":"591edddc-3736-44cf-9719-117c24ff3980","name":"Make an Example","manaCost":"{3}{B}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each opponent separates the creatures they control into two piles. For each opponent, you choose one of their piles. Each opponent sacrifices the creatures in their chosen pile. (Piles can be empty.)","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"});

const unexplaineda = (): CardDef => ({"oracleId":"71faaee5-70ff-449c-85c8-560eb189a0a7","name":"Unexplained Absence","manaCost":"{3}{W}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"For each player, exile up to one target nonland permanent that player controls. For each permanent exiled this way, its controller cloaks the top card of their library. (To cloak a card, put it onto the battlefield face down as a 2/2 creature with ward {2}. Turn it face up any time for its mana cost if it's a creature card.)","colors":["W"],"colorIdentity":["W"],"keywords":["Cloak"],"layout":"normal"});
const sakashimaswi = (): CardDef => ({"oracleId":"2c3c3bec-00f0-4de2-b929-73f1c9276ec4","name":"Sakashima's Will","manaCost":"{3}{U}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose one. If you control a commander as you cast this spell, you may choose both instead.\n• Target opponent chooses a creature they control. You gain control of it.\n• Choose a creature you control. Each other creature you control becomes a copy of that creature until end of turn.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"});
const thisishowite = (): CardDef => ({"oracleId":"53467cf4-5db2-4b9c-af2b-03b044c558cd","name":"This Is How It Ends","manaCost":"{3}{B}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature's owner shuffles it into their library, then faces a villainous choice — They lose 5 life, or they shuffle another creature they own into their library.","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"});
const intrudeonthe = (): CardDef => ({"oracleId":"eedb1527-548a-435a-a3e1-8ad7d9d6d8a9","name":"Intrude on the Mind","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Reveal the top five cards of your library and separate them into two piles. An opponent chooses one of those piles. Put that pile into your hand and the other into your graveyard. Create a 0/0 colorless Thopter artifact creature token with flying, then put a +1/+1 counter on it for each card put into your graveyard this way.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"});
const ixidron = (): CardDef => ({"oracleId":"a86587ea-14ec-45db-8bac-10b6b9eaeb25","name":"Ixidron","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Creature — Illusion","supertypes":[],"types":["Creature"],"subtypes":["Illusion"],"oracleText":"As this creature enters, turn all other nontoken creatures face down. (They're 2/2 creatures.)\nIxidron's power and toughness are each equal to the number of face-down creatures on the battlefield.","power":"*","toughness":"*","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"});
const illithidharv = (): CardDef => ({"oracleId":"299ffd3a-29cf-4667-b191-dd30d09f799c","name":"Illithid Harvester // Plant Tadpoles","manaCost":"{4}{U} // {X}{U}{U}","cmc":5,"typeLine":"Creature — Horror // Sorcery — Adventure","supertypes":[],"types":["Creature"],"subtypes":["Horror"],"oracleText":"Ceremorphosis — When this creature enters, turn any number of target tapped nontoken creatures face down. They're 2/2 Horror creatures.","power":"4","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":["Ceremorphosis"],"layout":"adventure","faces":[{"name":"Illithid Harvester","manaCost":"{4}{U}","typeLine":"Creature — Horror","supertypes":[],"types":["Creature"],"subtypes":["Horror"],"oracleText":"Ceremorphosis — When this creature enters, turn any number of target tapped nontoken creatures face down. They're 2/2 Horror creatures.","power":"4","toughness":"4","colors":["U"]},{"name":"Plant Tadpoles","manaCost":"{X}{U}{U}","typeLine":"Sorcery — Adventure","supertypes":[],"types":["Sorcery"],"subtypes":["Adventure"],"oracleText":"Tap X target creatures. They don't untap during their controllers' next untap steps. (Then exile this card. You may cast the creature later from exile.)","colors":["U"]}]});
const regen = () => card("Drudge Skeletons", "Creature — Skeleton", "{4}", { power: "1", toughness: "1", oracleText: "{B}: Regenerate Drudge Skeletons." });

describe("round 306: Do or Die", () => {
  it("you separate the target player's creatures (not their other permanents); they choose the pile destroyed, which can't be regenerated", () => {
    supported(doordie());
    const { s: s0, ap, ids, opp } = setup([doordie()]);
    const big = putOnBattlefield(s0, opp, bear({ name: "Big", power: "6", toughness: "6" }));
    const skel = putOnBattlefield(s0, opp, regen());
    skel && (s0.objects[skel]!.regenShields = 1);
    const small = putOnBattlefield(s0, opp, bear());
    const art = putOnBattlefield(s0, opp, card("Sol Ring", "Artifact", "{1}", { oracleText: "{T}: Add {C}{C}." }));
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp } as T]));
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "pile", of: opp, what: "creature" });
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([big, skel, small].sort());
    expect(s.pending && "prompt" in s.pending && s.pending.prompt).toMatch(/destroyed \(they can't be regenerated\)/);
    s = act(s, { type: "pickPermanents", player: ap, ids: [big] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "pile", destroyPile: true, piles: [[big], expect.arrayContaining([skel, small])] });
    s = act(s, { type: "chooseOption", player: opp, choice: "1" });
    s = settle(s, ap);
    expect(s.objects[skel]!.zone).toBe("graveyard"); // its regeneration shield doesn't help
    expect(s.objects[small]!.zone).toBe("graveyard");
    expect(s.objects[big]!.zone).toBe("battlefield");
    expect(s.objects[art]!.zone).toBe("battlefield");
  });

  it("a bot target chooses the pile worth less to lose", () => {
    const { s: s0, ap, ids, opp } = setup([doordie()]);
    const big = putOnBattlefield(s0, opp, bear({ name: "Big", power: "6", toughness: "6" }));
    const small = putOnBattlefield(s0, opp, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp } as T]));
    s = settle(s, ap);
    s = act(s, { type: "pickPermanents", player: ap, ids: [big] });
    s = settle(s, ap);
    expect(s.objects[big]!.zone).toBe("battlefield");
    expect(s.objects[small]!.zone).toBe("graveyard");
  });
});

describe("round 306: Make an Example", () => {
  it("each opponent separates their own creatures in turn order; you choose a pile of each; all chosen piles are sacrificed at once", () => {
    supported(makeanexampl());
    const { s: s0, ap, ids } = setup([makeanexampl()]);
    const [o1, o2, o3] = [1, 2, 3].map((k) => s0.turnOrder[(s0.turnOrder.indexOf(ap) + k) % 4]!);
    const a = putOnBattlefield(s0, o1!, bear({ name: "Big", power: "6", toughness: "6" }));
    const b = putOnBattlefield(s0, o1!, bear());
    const c = putOnBattlefield(s0, o2!, bear({ name: "Lone" }));
    const mine = putOnBattlefield(s0, ap, bear({ name: "Mine" }));
    void o3;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    // The bots separate; then I choose, opponent by opponent, in turn order.
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "pile", of: o1, sacrificePile: true });
    const piles1 = (s.pending as { piles: string[][] }).piles;
    expect([...piles1.flat()].sort()).toEqual([a, b].sort());
    const withBig = piles1.findIndex((p) => p.includes(a));
    s = act(s, { type: "chooseOption", player: ap, choice: String(withBig) });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "pile", of: o2 });
    const piles2 = (s.pending as { piles: string[][] }).piles;
    const withLone = piles2.findIndex((p) => p.includes(c));
    // Nothing is sacrificed until every pile is chosen.
    expect(s.objects[a]!.zone).toBe("battlefield");
    s = act(s, { type: "chooseOption", player: ap, choice: String(withLone) });
    s = settle(s, ap);
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(s.objects[c]!.zone).toBe("graveyard");
    expect(s.objects[mine]!.zone).toBe("battlefield");
    expect(s.objects[b]!.zone).toBe(piles1[withBig]!.includes(b) ? "graveyard" : "battlefield");
  });

  it("a human opponent separates their own creatures; a bot caster takes the pile worth more", () => {
    const { s: s0, ap, ids } = setup([makeanexampl()]);
    const o1 = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    const a = putOnBattlefield(s0, o1, bear({ name: "Big", power: "6", toughness: "6" }));
    const b = putOnBattlefield(s0, o1, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, o1);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: o1, action: "pile", of: o1, what: "creature" });
    expect(s.pending && "prompt" in s.pending && s.pending.prompt).toMatch(/you sacrifice the creatures in it/);
    s = act(s, { type: "pickPermanents", player: o1, ids: [b] });
    s = settle(s, o1);
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(s.objects[b]!.zone).toBe("battlefield");
  });
});

describe("round 306: Unexplained Absence", () => {
  it("one target for each player at most; each exiled permanent's controller cloaks the top card of their library", () => {
    supported(unexplaineda());
    const { s: s0, ap, ids, opp } = setup([unexplaineda()]);
    const o2 = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Theirs" }));
    const mine = putOnBattlefield(s0, ap, card("Sol Ring", "Artifact", "{1}", { oracleText: "{T}: Add {C}{C}." }));
    putOnBattlefield(s0, o2, bear({ name: "Untouched" }));
    const oppTop = s0.players[opp]!.library[0]!;
    const myTop = s0.players[ap]!.library[0]!;
    const o2Top = s0.players[o2]!.library[0]!;
    // You first, then each other player in turn order.
    const plan = planCast(s0, ap, ids[0]!, [{ kind: "object", id: mine }, { kind: "object", id: theirs }, { kind: "none" }, { kind: "none" }] as T[]);
    let s = run(s0, plan);
    s = settle(s, ap);
    expect(s.objects[theirs]!.zone).toBe("exile");
    expect(s.objects[mine]!.zone).toBe("exile");
    for (const [pid, top] of [[opp, oppTop], [ap, myTop]] as const) {
      expect(s.objects[top]!.zone).toBe("battlefield");
      expect(s.objects[top]!.faceDown).toBe("cloak");
      expect(s.objects[top]!.controller).toBe(pid);
    }
    expect(s.objects[o2Top]!.zone).toBe("library");
  });
});

describe("round 306: Sakashima's Will", () => {
  const big = () => card("Craw Wurm", "Creature — Wurm", "{4}{G}{G}", { power: "6", toughness: "4", oracleText: "" });
  it("first mode: the target opponent chooses one of their creatures (not targeted), and you gain control of it", () => {
    supported(sakashimaswi());
    const { s: s0, ap, ids, opp } = setup([sakashimaswi()]);
    const a = putOnBattlefield(s0, opp, big());
    const b = putOnBattlefield(s0, opp, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp } as T], [0]));
    s = settle(s, ap);
    // The bot gives up the creature worth less to it.
    expect(controllerOf(s, s.objects[b]!)).toBe(ap);
    expect(controllerOf(s, s.objects[a]!)).toBe(opp);
    s = passUntil(s, "main1", opp);
    invalidateCharacteristics(s);
    expect(s.objects[b]!.zone).toBe("battlefield");
  });

  it("second mode: each other creature you control becomes a copy of the one you choose until end of turn", () => {
    const { s: s0, ap, ids } = setup([sakashimaswi()]);
    const w = putOnBattlefield(s0, ap, big());
    const b = putOnBattlefield(s0, ap, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [], [1]));
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "choose" });
    s = act(s, { type: "pickPermanents", player: ap, ids: [w] });
    s = settle(s, ap);
    expect(characteristics(s, s.objects[b]!).name).toBe("Craw Wurm");
    expect(power(s, s.objects[b]!)).toBe(6);
    expect(characteristics(s, s.objects[w]!).name).toBe("Craw Wurm");
    s = passUntil(s, "upkeep");
    expect(characteristics(s, s.objects[b]!).name).toBe("Grizzly Bears");
  });

  it("with a commander on the battlefield, both modes: the creature gained can be the one copied", () => {
    const { s: s0, ap, ids, opp } = setup([sakashimaswi()]);
    putOnBattlefield(s0, ap, bear({ name: "My Commander" }), { commander: true });
    const theirs = putOnBattlefield(s0, opp, big());
    const mine = putOnBattlefield(s0, ap, bear());
    const plan = planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp } as T], [0, 1]);
    expect(plan).not.toBeNull();
    let s = run(s0, plan);
    s = settle(s, ap);
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "choose" });
    expect((s.pending as { options: string[] }).options).toContain(theirs);
    s = act(s, { type: "pickPermanents", player: ap, ids: [theirs] });
    s = settle(s, ap);
    expect(characteristics(s, s.objects[mine]!).name).toBe("Craw Wurm");
    expect(characteristics(s, s.objects[theirs]!).name).toBe("Craw Wurm");
  });

  it("without a commander, only one mode", () => {
    const { s: s0, ap, ids, opp } = setup([sakashimaswi()]);
    putOnBattlefield(s0, opp, big());
    expect(planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp } as T], [0, 1])).toBeNull();
  });
});

describe("round 306: This Is How It Ends", () => {
  it("the target's owner shuffles it into their library, then chooses: lose 5 life, or shuffle another creature they own (anyone may control it)", () => {
    supported(thisishowite());
    const { s: s0, ap, ids, opp } = setup([thisishowite()]);
    const victim = putOnBattlefield(s0, opp, bear({ name: "Victim" }));
    const other = putOnBattlefield(s0, opp, bear({ name: "Other" }));
    // A creature they own that I control.
    const stolen = putOnBattlefield(s0, opp, bear({ name: "Stolen" }));
    s0.objects[stolen]!.controller = ap;
    invalidateCharacteristics(s0);
    const life = s0.players[opp]!.life;
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: victim } as T]));
    s = settle(s, opp);
    expect(s.objects[victim]!.zone).toBe("library");
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "villainous" });
    s = act(s, { type: "chooseOption", player: opp, choice: "1" });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: opp });
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([other, stolen].sort());
    s = act(s, { type: "pickPermanents", player: opp, ids: [stolen] });
    s = settle(s, opp);
    expect(s.objects[stolen]!.zone).toBe("library");
    expect(s.players[opp]!.library).toContain(stolen);
    expect(s.objects[other]!.zone).toBe("battlefield");
    expect(s.players[opp]!.life).toBe(life);
  });

  it("a bot loses the life, unless that would lose it the game", () => {
    for (const [life, shuffled] of [[40, false], [5, true]] as const) {
      const { s: s0, ap, ids, opp } = setup([thisishowite()]);
      const victim = putOnBattlefield(s0, opp, bear({ name: "Victim" }));
      const other = putOnBattlefield(s0, opp, bear({ name: "Other" }));
      s0.players[opp]!.life = life;
      let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: victim } as T]));
      s = settle(s, ap);
      expect(s.objects[other]!.zone).toBe(shuffled ? "library" : "battlefield");
      expect(s.players[opp]!.life).toBe(shuffled ? life : life - 5);
    }
  });
});

describe("round 306: Intrude on the Mind", () => {
  it("you separate the top five, an opponent picks the pile for your hand; the Thopter gets a counter for each card put into your graveyard", () => {
    supported(intrudeonthe());
    const { s: s0, ap, ids } = setup([intrudeonthe()]);
    const top = s0.players[ap]!.library.slice(0, 5);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, ap);
    // You choose the opponent who picks (rulings), if asked; then you separate.
    for (let i = 0; i < 3 && s.pending?.kind === "chooseOption" && s.pending.player === ap; i++) s = act(s, { type: "chooseOption", player: ap, choice: s.pending.options[0]! });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, piles: true });
    s = act(s, { type: "searchLibrary", player: ap, found: top.slice(0, 1) });
    s = settle(s, ap);
    const inHand = top.filter((id) => s.objects[id]!.zone === "hand");
    const inYard = top.filter((id) => s.objects[id]!.zone === "graveyard");
    expect(inHand.length + inYard.length).toBe(5);
    const thopter = s.battlefield.find((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap)!;
    expect(characteristics(s, s.objects[thopter]!).name).toBe("Thopter Token");
    expect(s.objects[thopter]!.counters["+1/+1"] ?? 0).toBe(inYard.length);
  });

  it("all five in one pile and the opponent puts them into your graveyard: a 5/5 Thopter; into your hand: it dies as a 0/0", () => {
    const { s: s0, ap, ids } = setup([intrudeonthe()]);
    const top = s0.players[ap]!.library.slice(0, 5);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, ap);
    for (let i = 0; i < 3 && s.pending?.kind === "chooseOption" && s.pending.player === ap; i++) s = act(s, { type: "chooseOption", player: ap, choice: s.pending.options[0]! });
    s = act(s, { type: "searchLibrary", player: ap, found: top });
    s = settle(s, ap);
    const yard = top.filter((id) => s.objects[id]!.zone === "graveyard").length;
    const thopter = s.battlefield.find((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap);
    if (yard === 5) expect(s.objects[thopter!]!.counters["+1/+1"]).toBe(5);
    else expect(thopter).toBeUndefined();
  });
});

describe("round 306: Ixidron", () => {
  const warden = () => card("Soul Warden", "Creature — Human Cleric", "{W}", { power: "1", toughness: "1", oracleText: "Whenever another creature enters, you gain 1 life." });
  const morph = () => card("Morph Guy", "Creature — Beast", "{5}{G}", { power: "5", toughness: "5", oracleText: "Morph {1}{G}", keywords: ["Morph"] });
  it("as it enters, every other nontoken creature turns face down (a 2/2 with no abilities): their enter triggers don't see it", () => {
    supported(ixidron());
    const { s: s0, ap, ids, opp } = setup([ixidron()]);
    const w = putOnBattlefield(s0, opp, warden());
    const m = putOnBattlefield(s0, ap, morph());
    const b = putOnBattlefield(s0, opp, bear());
    const tok = putOnBattlefield(s0, opp, bear({ name: "Token Bear" }));
    s0.objects[tok]!.isToken = true;
    invalidateCharacteristics(s0);
    const life = s0.players[opp]!.life;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, ap);
    const ix = s.battlefield.find((id) => s.objects[id]!.cardId === s.objects[ids[0]!]!.cardId)!;
    for (const id of [w, m, b]) {
      expect(s.objects[id]!.faceDown).toBe("morph");
      expect(power(s, s.objects[id]!)).toBe(2);
    }
    expect(s.objects[tok]!.faceDown).toBeUndefined();
    expect(s.objects[ix]!.faceDown).toBeUndefined();
    // Soul Warden was face down (no abilities) as Ixidron entered.
    expect(s.players[opp]!.life).toBe(life);
    // Its power and toughness: the face-down creatures on the battlefield.
    expect(power(s, s.objects[ix]!)).toBe(3);
    // The one with morph can be turned face up for its morph cost (CR 702.37e); the others can't.
    s.players[ap]!.manaPool.G = 2;
    expect(turnFaceUpProblem(s, ap, m)).toBeNull();
    expect(turnFaceUpProblem(s, opp, b)).not.toBeNull();
  });
});

describe("round 306: Illithid Harvester", () => {
  it("any number of target tapped nontoken creatures turn face down as 2/2 Horror creatures", () => {
    const def = illithidharv();
    supported(def);
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, opp, bear({ name: "Big", power: "6", toughness: "6" }));
    const b = putOnBattlefield(s0, opp, bear());
    s0.objects[a]!.tapped = true;
    s0.objects[b]!.tapped = true;
    const hand = putOnBattlefield(s0, ap, def);
    s0.battlefield.splice(s0.battlefield.indexOf(hand), 1);
    s0.objects[hand]!.zone = "hand";
    s0.players[ap]!.hand.push(hand);
    invalidateCharacteristics(s0);
    let s = run(s0, planCast(s0, ap, hand));
    s = settle(s, ap);
    // The enters trigger's targets: only the big one.
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets" && (s.stack.length || s.triggerQueue.length || s.pending); i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: a }] } as Action);
    s = settle(s, ap);
    expect(s.objects[a]!.faceDown).toBe("horror");
    expect(s.objects[b]!.faceDown).toBeUndefined();
    expect(characteristics(s, s.objects[a]!).subtypes).toEqual(["Horror"]);
    expect(power(s, s.objects[a]!)).toBe(2);
    expect(characteristics(s, s.objects[a]!).colors).toEqual([]);
  });
});
