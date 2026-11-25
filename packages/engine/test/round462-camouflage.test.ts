// Round 462: Camouflage, "Cast this spell only during your declare attackers step. This turn, instead of declaring
// blockers, each defending player chooses any number of creatures they control and divides them into a number of piles
// equal to the number of attacking creatures for whom that player is the defending player. ... Assign each pile to a
// different one of those attacking creatures at random. Each creature in a pile that can block the creature that pile is
// assigned to does so." (CR 509.1 replaced; 700.3 piles; the blocks still obey CR 509.1a-b; camouflage.ts.)

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, isFullySupported, planCast, power, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const camouflage = (): CardDef => ({"oracleId":"9cf44db4-627a-4197-9588-6da72e41f03d","name":"Camouflage","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Cast this spell only during your declare attackers step.\nThis turn, instead of declaring blockers, each defending player chooses any number of creatures they control and divides them into a number of piles equal to the number of attacking creatures for whom that player is the defending player. Creatures those players control that can block additional creatures may likewise be put into additional piles. Assign each pile to a different one of those attacking creatures at random. Each creature in a pile that can block the creature that pile is assigned to does so. (Piles can be empty.)","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const drake = (): CardDef => ({"oracleId":"d6ffdaf0-ac08-4de9-bbce-2eab2f86bcca","name":"Wind Drake","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Drake","supertypes":[],"types":["Creature"],"subtypes":["Drake"],"oracleText":"Flying","power":"2","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"commanderLegal":"legal","set":"kld","releasedAt":"2016-09-30","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const guard = (): CardDef => ({"oracleId":"5c92f375-ae6a-4be5-a499-ab87d6bdc49b","name":"Palace Guard","manaCost":"{2}{W}","cmc":3,"typeLine":"Creature — Human Soldier","supertypes":[],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"This creature can block any number of creatures.","power":"1","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","set":"m10","releasedAt":"2009-07-17","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const arbiter = (): CardDef => ({"oracleId":"1cdf30de-d88c-421a-80df-4917bbd2f09e","name":"Silent Arbiter","manaCost":"{4}","cmc":4,"typeLine":"Artifact Creature — Construct","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Construct"],"oracleText":"No more than one creature can attack each combat.\nNo more than one creature can block each combat.","power":"1","toughness":"5","colors":[],"colorIdentity":[],"keywords":[],"commanderLegal":"legal","set":"5dn","releasedAt":"2004-06-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const brute = (): CardDef => ({"oracleId":"880793a2-84b0-4ae1-9bb8-6e942e3dc723","name":"Boggart Brute","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Goblin Warrior","supertypes":[],"types":["Creature"],"subtypes":["Goblin","Warrior"],"oracleText":"Menace (This creature can't be blocked except by two or more creatures.)","power":"3","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Menace"],"commanderLegal":"legal","set":"ori","releasedAt":"2015-07-17","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const badger = (): CardDef => ({"oracleId":"a4109138-5d69-4510-a228-7c1f88c0c8c0","name":"Giant Badger","manaCost":"{1}{G}{G}","cmc":3,"typeLine":"Creature — Badger","supertypes":[],"types":["Creature"],"subtypes":["Badger"],"oracleText":"Whenever this creature blocks, it gets +2/+2 until end of turn.","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"8ed","releasedAt":"2003-07-28","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
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

/**
 * The active player attacks the next player with `attack` (theirs, put onto the battlefield), the defender having `defend`;
 * Camouflage cast and resolved in the declare attackers step (unless `cast` is false). Stops at the first question after.
 */
function camouflaged(attack: CardDef[], defend: CardDef[], cast = true, seed = 5) {
  const { s: s0, ap, ids, opp } = setup([camouflage()], seed);
  const atk = attack.map((d) => putOnBattlefield(s0, ap, d));
  const def = defend.map((d) => putOnBattlefield(s0, opp, d));
  let s = passUntil(s0, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: atk.map((attacker) => ({ attacker, defender: opp })) });
  s = settle(s);
  if (cast) s = settle(run(s, planCast(s, ap, ids[0]!)));
  // Everyone passes: the declare blockers step begins.
  for (let i = 0; i < 20 && !s.pending && s.step === "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return { s, ap, opp, cam: ids[0]!, atk, def };
}
/** Answers the next pile question of `pid` with these creatures. */
function pile(s: GameState, pid: PlayerId, ids: ObjectId[]) {
  const p = s.pending;
  if (p?.kind !== "pickPermanents" || !p.camouflage || p.player !== pid) throw new Error(`no pile asked for: ${JSON.stringify(p)}`);
  return act(s, { type: "pickPermanents", player: pid, ids });
}
const blocking = (s: GameState, id: ObjectId) => s.objects[id]!.blocking ?? [];

describe("round 462: Camouflage", () => {
  it("compiles fully, and can be cast only during your declare attackers step", () => {
    expect(isFullySupported(camouflage())).toBe(true);
    const { s, ap, ids } = setup([camouflage()]);
    expect(planCast(s, ap, ids[0]!)).toBeNull();
  });

  it("instead of declaring blockers, the defending player makes a pile for each attacker; each pile blocks the attacker it's assigned at random", () => {
    const { s: s0, opp, atk, def } = camouflaged([giant(), bears()], [elves(), badger(), bears()]);
    expect(s0.step).toBe("declareBlockers");
    const p = s0.pending;
    expect(p?.kind === "pickPermanents" && p.camouflage && p.player === opp && p.min === 0).toBe(true);
    expect(p?.kind === "pickPermanents" && [...p.options].sort()).toEqual([...def].sort());
    expect(p?.kind === "pickPermanents" && p.prompt).toMatch(/pile 1 of 2/);
    let s = pile(s0, opp, [def[0]!, def[2]!]);
    // A creature goes in one pile only (CR 700.3a).
    const q = s.pending;
    expect(q?.kind === "pickPermanents" && q.options).toEqual([def[1]!]);
    expect(q?.kind === "pickPermanents" && q.prompt).toMatch(/pile 2 of 2/);
    s = pile(s, opp, [def[1]!]);
    s = settle(s);
    // Pile 1's two creatures block the same attacker, pile 2's the other one.
    const first = blocking(s, def[0]!);
    expect(first.length).toBe(1);
    expect(blocking(s, def[2]!)).toEqual(first);
    const second = blocking(s, def[1]!);
    expect(second.length).toBe(1);
    expect(second[0]).not.toBe(first[0]);
    expect([first[0], second[0]].sort()).toEqual([...atk].sort());
    expect(s.log.some((l) => /pile 1 \(.*\) is assigned to/.test(l.text))).toBe(true);
    // "Whenever this creature blocks" triggers (CR 509.3a): Giant Badger got +2/+2.
    expect(power(s, s.objects[def[1]!]!)).toBe(4);
  });

  it("the assignment is random: over a few games, each pile meets each attacker", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 12 && seen.size < 2; seed++) {
      const { s: s0, opp, atk, def } = camouflaged([giant(), bears()], [elves(), badger()], true, seed);
      let s = pile(s0, opp, [def[0]!]);
      s = settle(pile(s, opp, [def[1]!]));
      seen.add(blocking(s, def[0]!)[0] === atk[0] ? "giant" : "bears");
    }
    expect(seen.size).toBe(2);
  });

  it("only creatures that can block the attacker do: not a tapped one, not one without flying against a flier; menace needs two", () => {
    // One attacker: one pile. Wind Drake has flying: only the Drake in the pile blocks it.
    {
      const { s: s0, opp, atk, def } = camouflaged([drake()], [bears(), drake()]);
      const s = settle(pile(s0, opp, [def[0]!, def[1]!]));
      expect(blocking(s, def[0]!)).toEqual([]);
      expect(blocking(s, def[1]!)).toEqual([atk[0]]);
    }
    // A tapped creature doesn't block (CR 509.1a).
    {
      const { s: s0, opp, def } = camouflaged([giant()], [bears(), elves()]);
      s0.objects[def[1]!]!.tapped = true;
      const s = settle(pile(s0, opp, [def[0]!, def[1]!]));
      expect(blocking(s, def[0]!).length).toBe(1);
      expect(blocking(s, def[1]!)).toEqual([]);
    }
    // Boggart Brute has menace: one creature alone can't block it (CR 702.111b), two can.
    {
      const { s: s0, opp, def } = camouflaged([brute()], [bears()]);
      const s = settle(pile(s0, opp, [def[0]!]));
      expect(blocking(s, def[0]!)).toEqual([]);
      expect(s.log.some((l) => l.text === "None of " + s.players[opp]!.name + "'s creatures block.")).toBe(true);
    }
    {
      const { s: s0, opp, atk, def } = camouflaged([brute()], [bears(), elves()]);
      const s = settle(pile(s0, opp, [def[0]!, def[1]!]));
      expect(blocking(s, def[0]!)).toEqual([atk[0]]);
      expect(blocking(s, def[1]!)).toEqual([atk[0]]);
    }
  });

  it("a creature that can block additional creatures may go in more piles, and blocks each attacker it meets", () => {
    const { s: s0, opp, atk, def } = camouflaged([giant(), bears()], [guard()]);
    let s = pile(s0, opp, [def[0]!]);
    const q = s.pending;
    expect(q?.kind === "pickPermanents" && q.options).toEqual([def[0]!]);
    expect(q?.kind === "pickPermanents" && q.prompt).toMatch(/more piles/);
    s = settle(pile(s, opp, [def[0]!]));
    expect([...blocking(s, def[0]!)].sort()).toEqual([...atk].sort());
  });

  it("when not all of them can block together, as many as can do, the defending player choosing which (Silent Arbiter)", () => {
    const { s: s0, ap, opp, atk, def } = camouflaged([giant()], [bears(), elves()]);
    putOnBattlefield(s0, ap, arbiter());
    let s = pile(s0, opp, [def[0]!, def[1]!]);
    const p = s.pending;
    expect(p?.kind === "chooseOption" && p.what === "camouflageBlocks" && p.player === opp).toBe(true);
    expect(p?.kind === "chooseOption" && p.labels).toEqual(["Grizzly Bears blocks Hill Giant", "Llanowar Elves blocks Hill Giant"]);
    s = settle(act(s, { type: "chooseOption", player: opp, choice: "1" }));
    expect(blocking(s, def[0]!)).toEqual([]);
    expect(blocking(s, def[1]!)).toEqual([atk[0]]);
    expect(s.camouflage).toBeUndefined();
  });

  it("with empty piles nothing blocks; without Camouflage blockers are declared as usual", () => {
    {
      const { s: s0, opp, atk } = camouflaged([giant()], [bears()]);
      const s = settle(pile(s0, opp, []));
      expect(s.objects[atk[0]!]!.blockedBy ?? []).toEqual([]);
    }
    {
      const { s } = camouflaged([giant()], [bears()], false);
      expect(s.pending?.kind).toBe("declareBlockers");
    }
  });

  it("bots make their piles and the combat goes on to damage", () => {
    const { s: s0, opp } = camouflaged([giant(), bears()], [elves(), badger()]);
    let s = s0;
    for (let i = 0; i < 20 && s.pending && s.step === "declareBlockers"; i++) s = act(s, botActions(s, waitingOn(s)!)[0]!);
    expect(s.camouflage).toBeUndefined();
    expect(s.log.some((l) => l.text.startsWith(`${s.players[opp]!.name} makes pile 2`))).toBe(true);
    s = passUntil(s, "main2");
    expect(s.players[opp]!.life).toBeLessThanOrEqual(40);
  });
});
