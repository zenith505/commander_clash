// Round 318 (Lane A, skip-list cards): face-down and face-up piles you separate or an opponent separates (Curator of
// Destinies, Sauron's Ransom) and two face-down piles exiled, one turned face up (Hostile Negotiations); "Cumulative
// upkeep—Flip a coin" with "any target of an opponent's choice" on a lost flip (Karplusan Minotaur); "If you would create
// a Fish token, create a 3/3 blue Shark creature token instead" (Fisher's Talent); "Whenever you attack with creatures with
// total power 12 or greater for the first time each turn" (Desert Were-Worm); each player's own creature type (Grave
// Sifter); "Whenever a creature dealt damage this way dies this turn, populate" (Ghired's Belligerence).

import { describe, expect, it } from "vitest";
import { act, bear, card, mountain, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

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
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
/** A copy of `def` in `pid`'s hand, graveyard or library (on top). */
const inZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const named = (s: GameState, name: string) => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]?.name === name);
const tgt = (id: string) => ({ kind: "object" as const, id });
const nextOf = (s: GameState, p: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(p) + 1) % s.turnOrder.length]!;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const logSince = (s: GameState, n: number) => s.log.slice(n).map((l) => l.text).join("\n");

// Real oracle text (Scryfall).
const curator = (): CardDef => ({"oracleId":"9938d178-0ce6-45c0-b317-fd5c54231579","name":"Curator of Destinies","manaCost":"{4}{U}{U}","cmc":6,"typeLine":"Creature — Sphinx","supertypes":[],"types":["Creature"],"subtypes":["Sphinx"],"oracleText":"This spell can't be countered.\nFlying\nWhen this creature enters, look at the top five cards of your library and separate them into a face-down pile and a face-up pile. An opponent chooses one of those piles. Put that pile into your hand and the other into your graveyard.","power":"5","toughness":"5","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"commanderLegal":"legal","set":"fdn","releasedAt":"2024-11-15","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const ransom = (): CardDef => ({"oracleId":"fe04a81b-413c-4bc8-bb83-29978da9a43d","name":"Sauron's Ransom","manaCost":"{1}{U}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose an opponent. They look at the top four cards of your library and separate them into a face-down pile and a face-up pile. Put one pile into your hand and the other into your graveyard. The Ring tempts you.","colors":["B","U"],"colorIdentity":["B","U"],"keywords":[],"commanderLegal":"legal","set":"ltr","releasedAt":"2023-06-23","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const minotaur = (): CardDef => ({"oracleId":"b3122a15-c7ab-40f1-9632-f5fbc4484c59","name":"Karplusan Minotaur","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Creature — Minotaur Warrior","supertypes":[],"types":["Creature"],"subtypes":["Minotaur","Warrior"],"oracleText":"Cumulative upkeep—Flip a coin. (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nWhenever you win a coin flip, this creature deals 1 damage to any target.\nWhenever you lose a coin flip, this creature deals 1 damage to any target of an opponent's choice.","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":["Cumulative upkeep"],"commanderLegal":"legal","set":"csp","releasedAt":"2006-07-21","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const fisher = (): CardDef => ({"oracleId":"44ba2aa5-2bf5-4267-ae82-f0daf8f5e3e8","name":"Fisher's Talent","manaCost":"{2}{G}{U}","cmc":4,"typeLine":"Enchantment — Class","supertypes":[],"types":["Enchantment"],"subtypes":["Class"],"oracleText":"(Gain the next level as a sorcery to add its ability.)\nAt the beginning of your upkeep, look at the top card of your library. You may reveal it if it's a land card. Create a 1/1 blue Fish creature token if you revealed it this way. Then draw a card.\n{G}{U}: Level 2\nIf you would create a Fish token, create a 3/3 blue Shark creature token instead.\n{2}{G}{U}: Level 3\nIf you would create a Shark token, create an 8/8 blue Octopus creature token instead.","colors":["G","U"],"colorIdentity":["G","U"],"keywords":[],"commanderLegal":"legal","set":"blc","releasedAt":"2024-08-02","rarity":"rare","layout":"class","gameChanger":false} as CardDef);
const worm = (): CardDef => ({"oracleId":"81c2913f-42b7-4cfa-adc0-b3416fbe2ec6","name":"Desert Were-Worm","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Creature — Dragon Wurm","supertypes":[],"types":["Creature"],"subtypes":["Dragon","Wurm"],"oracleText":"This creature gets +2/+0 for each Mountain you control.\nWhenever you attack with creatures with total power 12 or greater for the first time each turn, untap all attacking creatures. After this phase, there is an additional combat phase.","power":"0","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"hob","releasedAt":"2026-08-14","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const negotiations = (): CardDef => ({"oracleId":"c5cbd852-c42f-4592-a0bb-a8bffa2dd2f4","name":"Hostile Negotiations","manaCost":"{3}{B}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Exile the top three cards of your library in a face-down pile, then exile the top three cards of your library in another face-down pile. Look at the cards in each pile, then turn a pile of your choice face up. An opponent chooses one of those piles. Put that pile into your hand and the other into your graveyard. You lose 3 life.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"bro","releasedAt":"2022-11-18","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const sifter = (): CardDef => ({"oracleId":"07a26388-773e-4614-a3de-f133c6694d59","name":"Grave Sifter","manaCost":"{5}{G}","cmc":6,"typeLine":"Creature — Elemental Beast","supertypes":[],"types":["Creature"],"subtypes":["Elemental","Beast"],"oracleText":"When this creature enters, each player chooses a creature type and returns any number of cards of that type from their graveyard to their hand.","power":"5","toughness":"7","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"c14","releasedAt":"2014-11-07","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const belligerence = (): CardDef => ({"oracleId":"d543cc69-4b8a-4c45-99e1-84143d663f25","name":"Ghired's Belligerence","manaCost":"{X}{R}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Ghired's Belligerence deals X damage divided as you choose among any number of target creatures. Whenever a creature dealt damage this way dies this turn, populate. (Create a token that's a copy of a creature token you control.)","colors":["R"],"colorIdentity":["R"],"keywords":["Populate"],"commanderLegal":"legal","set":"c19","releasedAt":"2019-08-23","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const lands = (n: number) => Array.from({ length: n }, (_, i) => card(`Test Land ${i}`, "Land"));
const goblin = (name: string) => card(name, "Creature — Goblin", "{R}", { cmc: 1, power: "1", toughness: "1" });
const elf = (name: string) => card(name, "Creature — Elf", "{G}", { cmc: 1, power: "1", toughness: "1" });
const shock = () => card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "Test Shock deals 2 damage to any target." });

describe("round 318", () => {
  it("are fully supported", () => supported(curator(), ransom(), minotaur(), fisher(), worm(), negotiations(), sifter(), belligerence()));
});

describe("round 318: Curator of Destinies", () => {
  it("you look and separate the top five into a face-down and a face-up pile; an opponent you choose picks the pile for your hand", () => {
    const { s: s0, ap, ids } = setup([curator()]);
    const top = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"].map((n) => inZone(s0, ap, goblin(n), "library")).reverse();
    expect(s0.players[ap]!.library.slice(0, 5)).toEqual(top);
    const before = s0.log.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    // The opponent who chooses is chosen first.
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "opponent" });
    const o = nextOf(s, ap);
    s = act(s, { type: "chooseOption", player: ap, choice: String(o) });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, piles: true, min: 0, max: 5, dig: { to: "for the face-down pile" } });
    // Only looked at, not revealed: no card names in the log yet.
    expect(logSince(s, before)).toContain("looks at the top 5 cards of their library");
    expect(logSince(s, before)).not.toContain("Alpha");
    s = act(s, { type: "searchLibrary", player: ap, found: [top[0]!, top[1]!] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: o, what: "pile", pileMode: "faceDown", piles: [[top[0], top[1]], [top[2], top[3], top[4]]] });
    const pend = s.pending as Extract<GameState["pending"], { kind: "chooseOption" }>;
    expect(pend.labels![0]).toBe("Face-down pile: 2 cards");
    expect(pend.labels![1]).toBe("Face-up pile: Gamma, Beta, Alpha");
    // The separation's log names the face-up cards only.
    expect(logSince(s, before)).toContain("a face-up pile: Gamma, Beta, Alpha");
    expect(logSince(s, before)).not.toMatch(/Epsilon|Delta/);
    s = act(s, { type: "chooseOption", player: o, choice: "0" });
    s = settle(s, ap);
    expect([top[0], top[1]].map((id) => zone(s, id!))).toEqual(["hand", "hand"]);
    expect([top[2], top[3], top[4]].map((id) => zone(s, id!))).toEqual(["graveyard", "graveyard", "graveyard"]);
  });

  it("all five may go in one pile, and a bot opponent chooses between them", () => {
    const { s: s0, ap, ids } = setup([curator()]);
    const top = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"].map((n) => inZone(s0, ap, goblin(n), "library")).reverse();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    s = act(s, { type: "chooseOption", player: ap, choice: String(nextOf(s, ap)) });
    s = act(s, { type: "searchLibrary", player: ap, found: [] });
    // An empty face-down pile and all five face up: the bot gives the empty pile.
    s = settle(s, ap);
    expect(top.map((id) => zone(s, id))).toEqual(["graveyard", "graveyard", "graveyard", "graveyard", "graveyard"]);
  });
});

describe("round 318: Sauron's Ransom", () => {
  it("the chosen opponent looks and separates; you choose the pile, seeing only how many cards the face-down one has; then the Ring tempts you", () => {
    const { s: s0, ap, ids } = setup([ransom()]);
    const top = ["Alpha", "Beta", "Gamma", "Delta"].map((n) => inZone(s0, ap, goblin(n), "library")).reverse();
    const before = s0.log.length;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "opponent" });
    const o = nextOf(s, ap);
    s = act(s, { type: "chooseOption", player: ap, choice: String(o) });
    // The opponent separates them (for your hand): the bot does.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: o, piles: true, forPlayer: ap });
    expect(logSince(s, before)).not.toMatch(/Alpha|Beta|Gamma|Delta/);
    s = act(s, { type: "searchLibrary", player: o, found: [top[3]!] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "pile", pileMode: "faceDown", piles: [[top[3]], [top[0], top[1], top[2]]] });
    expect(logSince(s, before)).not.toContain("Alpha");
    s = act(s, { type: "chooseOption", player: ap, choice: "1" });
    s = settle(s, ap);
    expect([top[0], top[1], top[2]].map((id) => zone(s, id!))).toEqual(["hand", "hand", "hand"]);
    expect(zone(s, top[3]!)).toBe("graveyard");
    // The Ring tempts you: the emblem's first ability.
    expect(s.players[ap]!.ring?.tempted).toBe(1);
  });
});

describe("round 318: Karplusan Minotaur", () => {
  /** To your next upkeep with the Minotaur's cumulative upkeep trigger waiting on you. */
  const atUpkeep = (age: number) => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, minotaur());
    s0.objects[m]!.counters.age = age;
    s0.players[ap]!.hand = [];
    let s = passUntil(s0, "upkeep", nextOf(s0, ap));
    s = passUntil(s, "upkeep", ap);
    return { s: settle(s, ap), ap, m };
  };

  it("pays by flipping a coin for each age counter; a won flip lets you choose any target, a lost one an opponent you choose", () => {
    const { s: s1, ap, m } = atUpkeep(2);
    expect(s1.pending).toMatchObject({ kind: "chooseMay", player: ap });
    expect((s1.pending as { prompt: string }).prompt).toContain("Flip 3 coins to keep");
    const before = s1.log.length;
    let s = act(s1, { type: "chooseMay", player: ap, yes: true });
    expect(s.objects[m]!.counters.age).toBe(3);
    const flips = /flips 3 coins for Karplusan Minotaur: (\d) won/.exec(logSince(s, before));
    expect(flips).not.toBeNull();
    const won = Number(flips![1]);
    let mine = 0;
    let choosers = 0;
    let theirs = 0;
    const life = s.players[ap]!.life;
    for (let i = 0; i < 200 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "chooseOption" && p.what === "targetChooser") {
        expect(p.player).toBe(ap);
        choosers++;
        s = act(s, { type: "chooseOption", player: ap, choice: p.options[0]! });
      } else if (p?.kind === "chooseTargets" && p.player === ap) {
        mine++;
        s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: nextOf(s, ap) }] });
      } else if (p?.kind === "chooseTargets") {
        // The opponent chooses for the Minotaur's controller, who still controls the trigger.
        expect(p.controller).toBe(ap);
        theirs++;
        s = act(s, { type: "chooseTargets", player: p.player, targets: [{ kind: "player", id: ap }] });
      } else if (p) s = act(s, botActions(s, p.player)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(mine).toBe(won);
    expect(choosers).toBe(3 - won);
    expect(theirs).toBe(3 - won);
    expect(s.players[ap]!.life).toBe(life - (3 - won));
    expect(zone(s, m)).toBe("battlefield");
  });

  it("isn't paid: sacrificed, and no coins are flipped", () => {
    const { s: s1, ap, m } = atUpkeep(0);
    expect((s1.pending as { prompt: string }).prompt).toContain("Flip a coin to keep");
    const before = s1.log.length;
    const s = settle(act(s1, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(zone(s, m)).toBe("graveyard");
    expect(logSince(s, before)).not.toContain("flips");
  });
});

describe("round 318: Fisher's Talent", () => {
  const atUpkeep = (level: number, topLand: boolean) => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, fisher());
    if (level > 1) s0.objects[f]!.classLevel = level;
    s0.players[ap]!.hand = [];
    let s = passUntil(s0, "upkeep", nextOf(s0, ap));
    s = passUntil(s, "upkeep", ap);
    const top = inZone(s, ap, topLand ? card("Test Top Land", "Land") : goblin("Test Top Goblin"), "library");
    invalidateCharacteristics(s);
    return { s: settle(s, ap), ap, top };
  };
  const tokens = (s: GameState, ap: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap).map((id) => `${s.cards[s.objects[id]!.cardId]!.name} ${pt(s, id)}`);

  it("level 1: reveal a land on top for a 1/1 Fish, then draw it", () => {
    const { s: s1, ap, top } = atUpkeep(1, true);
    expect(s1.pending).toMatchObject({ kind: "chooseMay", player: ap });
    const s = settle(act(s1, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(tokens(s, ap)).toEqual(["Fish Token 1/1"]);
    expect(zone(s, top)).toBe("hand");
  });

  it("you don't have to reveal it; a nonland card isn't asked about", () => {
    const { s: s1, ap, top } = atUpkeep(1, true);
    const s = settle(act(s1, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(tokens(s, ap)).toEqual([]);
    expect(zone(s, top)).toBe("hand");
    const { s: s2, ap: ap2, top: top2 } = atUpkeep(1, false);
    expect(s2.pending).toBeNull();
    expect(tokens(s2, ap2)).toEqual([]);
    expect(zone(s2, top2)).toBe("hand");
  });

  it("level 2 makes the Fish a 3/3 Shark; level 3 makes that Shark an 8/8 Octopus", () => {
    const { s: s1, ap } = atUpkeep(2, true);
    const s = settle(act(s1, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(tokens(s, ap)).toEqual(["Shark Token 3/3"]);
    const { s: s3, ap: ap3 } = atUpkeep(3, true);
    const t = settle(act(s3, { type: "chooseMay", player: ap3, yes: true }), ap3);
    expect(tokens(t, ap3)).toEqual(["Octopus Token 8/8"]);
  });

  it("replaces any Fish token you'd create, not an opponent's", () => {
    const { s: s0, ap, ids } = setup([card("Test Fish Call", "Sorcery", "{U}", { cmc: 1, oracleText: "Create two 1/1 blue Fish creature tokens." })]);
    const f = putOnBattlefield(s0, ap, fisher());
    s0.objects[f]!.classLevel = 2;
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(tokens(s, ap)).toEqual(["Shark Token 3/3", "Shark Token 3/3"]);
  });
});

describe("round 318: Desert Were-Worm", () => {
  const big = () => card("Test Giant", "Creature — Giant", "{4}", { cmc: 4, power: "6", toughness: "6" });
  it("attacking with total power 12 or greater untaps the attackers and adds a combat phase, only the first time each turn", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, worm());
    const g = putOnBattlefield(s0, ap, big());
    invalidateCharacteristics(s0);
    // Three Mountains: 6/5.
    expect(pt(s0, w)).toBe("6/5");
    const o = nextOf(s0, ap);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: w, defender: o }, { attacker: g, defender: o }] });
    s = settle(s, ap);
    expect(s.objects[w]!.tapped).toBe(false);
    expect(s.objects[g]!.tapped).toBe(false);
    expect(s.addedPhases).toContain("combat");
    // The next combat: the same 12 power attacks again, and nothing triggers.
    for (let i = 0; i < 100 && !(s.step === "declareAttackers" && s.combatsThisTurn === 2 && s.pending?.kind === "declareAttackers"); i++) {
      const p = s.pending;
      if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else if (p) s = act(s, botActions(s, p.player)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.combatsThisTurn).toBe(2);
    expect(s.objects[w]!.tapped).toBe(false);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: w, defender: o }, { attacker: g, defender: o }] });
    s = settle(s, ap);
    expect(s.objects[w]!.tapped).toBe(true);
  });

  it("less than 12 power doesn't trigger it", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, worm());
    const b = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: w, defender: nextOf(s, ap) }, { attacker: b, defender: nextOf(s, ap) }] });
    s = settle(s, ap);
    expect(s.objects[w]!.tapped).toBe(true);
    expect(s.objects[b]!.tapped).toBe(true);
  });
});

describe("round 318: Hostile Negotiations", () => {
  it("exiles two face-down piles of three; you turn one face up; an opponent gives you one; you lose 3 life", () => {
    const { s: s0, ap, ids } = setup([negotiations()]);
    const top = ["A1", "A2", "A3", "B1", "B2", "B3"].map((n) => inZone(s0, ap, goblin(n), "library")).reverse();
    const life = s0.players[ap]!.life;
    const before = s0.log.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "pile", pileMode: "turnFaceUp", piles: [top.slice(0, 3), top.slice(3)] });
    // Exiled face down: only their owner sees them.
    for (const id of top) {
      expect(zone(s, id)).toBe("exile");
      expect(s.objects[id]!.hiddenExile?.seen).toEqual([ap]);
    }
    expect(logSince(s, before)).not.toMatch(/A1|B1/);
    s = act(s, { type: "chooseOption", player: ap, choice: "1" });
    for (const id of top.slice(3)) expect(s.objects[id]!.hiddenExile).toBeUndefined();
    for (const id of top.slice(0, 3)) expect(s.objects[id]!.hiddenExile).toBeDefined();
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "opponent" });
    const o = nextOf(s, ap);
    s = act(s, { type: "chooseOption", player: ap, choice: String(o) });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: o, what: "pile", pileMode: "faceDown", piles: [top.slice(0, 3), top.slice(3)], labels: ["Face-down pile: 3 cards", "Face-up pile: A3, A2, A1"] });
    s = act(s, { type: "chooseOption", player: o, choice: "1" });
    s = settle(s, ap);
    expect(top.slice(3).map((id) => zone(s, id))).toEqual(["hand", "hand", "hand"]);
    expect(top.slice(0, 3).map((id) => zone(s, id))).toEqual(["graveyard", "graveyard", "graveyard"]);
    expect(s.players[ap]!.life).toBe(life - 3);
  });

  it("with four cards in the library the second pile has one card; bots answer both choices", () => {
    const { s: s0, ap, ids } = setup([negotiations()]);
    s0.players[ap]!.library = s0.players[ap]!.library.slice(0, 4);
    const lib = [...s0.players[ap]!.library];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    const p = s.pending as Extract<GameState["pending"], { kind: "chooseOption" }>;
    expect(p.piles!.map((x) => x.length)).toEqual([3, 1]);
    s = act(s, botActions(s, ap)[0]!);
    s = settle(s, -1 as PlayerId);
    expect(s.players[ap]!.library.length).toBe(0);
    expect(lib.every((id) => zone(s, id) === "hand" || zone(s, id) === "graveyard")).toBe(true);
  });
});

describe("round 318: Grave Sifter", () => {
  it("each player chooses a creature type and returns any number of their own cards of that type", () => {
    const { s: s0, ap, ids } = setup([sifter()]);
    const o = nextOf(s0, ap);
    const g1 = inZone(s0, ap, goblin("Test Goblin One"), "graveyard");
    const g2 = inZone(s0, ap, goblin("Test Goblin Two"), "graveyard");
    const e1 = inZone(s0, ap, elf("Test Elf Mine"), "graveyard");
    const oe = inZone(s0, o, elf("Test Elf Theirs"), "graveyard");
    const og = inZone(s0, o, goblin("Test Goblin Theirs"), "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    // The active player first.
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "creatureType" });
    s = act(s, { type: "chooseOption", player: ap, choice: "Goblin" });
    // The opponents choose (the bot with Elves in its graveyard picks Elf).
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, cards: [g1, g2] });
    s = act(s, { type: "searchLibrary", player: ap, found: [g2] });
    s = settle(s, ap);
    expect(zone(s, g2)).toBe("hand");
    expect(zone(s, g1)).toBe("graveyard");
    expect(zone(s, e1)).toBe("graveyard");
    // The opponent's Goblin stays: its own chosen type applies to its cards.
    expect(zone(s, og)).toBe("graveyard");
    expect(zone(s, oe)).toBe("hand");
  });
});

describe("round 318: Ghired's Belligerence", () => {
  it("each creature dealt damage this way that dies this turn populates, whoever controlled it and however late this turn", () => {
    const { s: s0, ap, ids } = setup([belligerence(), shock()]);
    const o = nextOf(s0, ap);
    const b1 = putOnBattlefield(s0, o, bear());
    const b2 = putOnBattlefield(s0, o, bear({ name: "Test Big Bear", power: "4", toughness: "4" }));
    const token = putOnBattlefield(s0, ap, card("Test Soldier", "Creature — Soldier", "", { power: "1", toughness: "1" }));
    s0.objects[token]!.isToken = true;
    s0.players[ap]!.manaPool.R += 3;
    invalidateCharacteristics(s0);
    const soldiers = (s: GameState) => named(s, "Test Soldier").length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ ...tgt(b1), amount: 2 }, { ...tgt(b2), amount: 3 }], undefined, undefined, 5)), ap);
    s = settle(s, ap);
    expect(zone(s, b1)).toBe("graveyard");
    expect(zone(s, b2)).toBe("battlefield");
    expect(soldiers(s)).toBe(2);
    // The 4/4 dies to another spell later this turn: it was dealt damage this way, so it populates too.
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(b2)])), ap);
    // Two Soldier tokens to choose between now.
    expect(s.pending).toMatchObject({ player: ap });
    s = settle(act(s, botActions(s, ap)[0]!), ap);
    expect(zone(s, b2)).toBe("graveyard");
    expect(soldiers(s)).toBe(3);
  });
});
