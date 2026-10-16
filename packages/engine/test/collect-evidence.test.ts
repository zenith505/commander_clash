// Collect evidence (CR 701.59): "exile any number of cards from your graveyard with total mana value N or greater"
// (701.59a); without enough, a player can't choose to (701.59b). As an optional additional cost it's linked to "if
// evidence was collected" (701.59c). It's also an activated ability's cost, a "you may" as an ability resolves ("If
// you do", "When you do": a reflexive trigger, CR 603.12), and Conspiracy Unraveler's alternative cost (CR 118.9).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { abilityProblem, autoEvidence, botActions, castProblem, evidenceProblem, invalidateCharacteristics, isFullySupported, manaValue, planActivate, planCast, spellCost, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const biteDown = card("Bite Down on Crime", "Sorcery", "{3}{G}", { oracleText: "As an additional cost to cast this spell, you may collect evidence 6. This spell costs {2} less to cast if evidence was collected. (To collect evidence 6, exile cards with total mana value 6 or greater from your graveyard.)\nTarget creature you control gets +2/+0 until end of turn. It deals damage equal to its power to target creature you don't control." });
const mask = card("Behind the Mask", "Instant", "{U}", { oracleText: "As an additional cost to cast this spell, you may collect evidence 6. (Exile cards with total mana value 6 or greater from your graveyard.)\nUntil end of turn, target artifact or creature becomes an artifact creature with base power and toughness 4/3. If evidence was collected, it has base power and toughness 1/1 until end of turn instead." });
const sprite = card("Crimestopper Sprite", "Creature — Faerie Detective", "{2}{U}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "As an additional cost to cast this spell, you may collect evidence 6. (Exile cards with total mana value 6 or greater from your graveyard.)\nFlying\nWhen this creature enters, tap target creature. If evidence was collected, put a stun counter on it. (If a permanent with a stun counter would become untapped, remove one from it instead.)" });
const inspector = card("Vitu-Ghazi Inspector", "Creature — Elf Detective", "{1}{G}", { power: "1", toughness: "3", keywords: ["Reach"], oracleText: "As an additional cost to cast this spell, you may collect evidence 6. (Exile cards with total mana value 6 or greater from your graveyard.)\nReach\nWhen this creature enters, if evidence was collected, put a +1/+1 counter on target creature and you gain 2 life." });
const unraveler = card("Conspiracy Unraveler", "Creature — Sphinx Detective", "{5}{U}{U}", { power: "6", toughness: "6", keywords: ["Flying"], oracleText: "Flying\nYou may collect evidence 10 rather than pay the mana cost for spells you cast. (To collect evidence 10, exile cards with total mana value 10 or greater from your graveyard.)" });
const examiner = card("Evidence Examiner", "Creature — Merfolk Detective", "{G}{U}", { power: "2", toughness: "2", oracleText: "At the beginning of combat on your turn, you may collect evidence 4. (Exile cards with total mana value 4 or greater from your graveyard.)\nWhenever you collect evidence, investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")" });
const researcher = card("Forensic Researcher", "Creature — Merfolk Detective", "{2}{U}", { power: "1", toughness: "3", oracleText: "{T}: Untap another target permanent you control.\n{T}, Collect evidence 3: Tap target creature you don't control. (To collect evidence 3, exile cards with total mana value 3 or greater from your graveyard.)" });
const izoni = card("Izoni, Center of the Web", "Legendary Creature — Elf Detective", "{4}{B}{G}", { power: "5", toughness: "4", keywords: ["Menace"], oracleText: "Menace\nWhenever Izoni enters or attacks, you may collect evidence 4. If you do, create two 2/1 black and green Spider creature tokens with reach and menace.\nSacrifice four tokens: Surveil 2, then draw two cards. You gain 2 life." });
const collector = card("Sample Collector", "Creature — Troll Detective", "{2}{G}", { power: "2", toughness: "3", oracleText: "Whenever this creature attacks, you may collect evidence 3. When you do, put a +1/+1 counter on target creature you control. (To collect evidence 3, exile cards with total mana value 3 or greater from your graveyard.)" });
const monitor = card("Surveillance Monitor", "Creature — Vedalken Detective", "{3}{U}", { power: "3", toughness: "3", oracleText: "When this creature enters, you may collect evidence 4. (Exile cards with total mana value 4 or greater from your graveyard.)\nWhenever you collect evidence, create a 1/1 colorless Thopter artifact creature token with flying." });

const giant = card("Hill Giant Test", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });
const four = card("Four Drop", "Sorcery", "{2}{B}{B}");
const two = card("Two Drop", "Instant", "{1}{R}");
const six = card("Six Drop", "Sorcery", "{4}{G}{G}");

/** Put a card into `pid`'s graveyard. */
function toYard(s: GameState, pid: PlayerId, def: CardDef): string {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
}

function run(s: GameState, plan: Action[] | null): GameState {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return s;
}

/** Pass until the stack and the trigger queue are empty or someone has to decide something. */
function settle(s: GameState): GameState {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}

describe("collect evidence", () => {
  it("parses", () => {
    supported(biteDown, mask, sprite, inspector, unraveler, examiner, researcher, izoni, collector, monitor);
  });

  it("takes cards from your graveyard with total mana value N or more; without enough, you can't (CR 701.59a-b)", () => {
    const { s, ap, opp } = setup([]);
    const a = toYard(s, ap, four);
    const b = toYard(s, ap, two);
    toYard(s, opp, six); // not someone else's
    expect(evidenceProblem(s, ap, 6, undefined)).toBeNull();
    expect(evidenceProblem(s, ap, 7, undefined)).toMatch(/total mana value 7/);
    expect(evidenceProblem(s, ap, 6, [a])).toMatch(/total mana value 4/);
    expect(evidenceProblem(s, ap, 6, [a, b])).toBeNull();
    expect(evidenceProblem(s, ap, 4, [a, b])).toBeNull(); // more than needed is fine ("or greater")
    // The fewest cards: the four alone makes 3.
    expect(autoEvidence(s, ap, 3)).toEqual([a]);
  });

  it("an optional additional cost: cheaper when paid (Bite Down on Crime), the cards exiled", () => {
    const { s: s0, ap, opp, ids } = setup([biteDown]);
    const a = toYard(s0, ap, four);
    const b = toYard(s0, ap, two);
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, giant);
    const cost = (evidence?: string[]) => {
      const c = spellCost(s0, ap, s0.objects[ids[0]!]!, 0, [], evidence ? { evidence } : {});
      return manaValue(c.cost) + c.extra;
    };
    expect(cost()).toBe(4);
    expect(cost([a, b])).toBe(2);
    expect(castProblem(s0, ap, ids[0]!, [target(mine), target(theirs)], undefined, undefined, undefined, undefined, { evidence: [a] })).toMatch(/total mana value 4/);
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(mine), target(theirs)], undefined, "auto", undefined, { evidence: [a, b] }));
    expect(s.objects[a]!.zone).toBe("exile");
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.log.some((l) => /collects evidence 6, exiling Four Drop, Two Drop/.test(l.text))).toBe(true);
    s = passAll(s);
    expect(pt(s, mine)).toBe("4/2");
    expect(s.objects[theirs]!.zone).toBe("graveyard");
  });

  it("'if evidence was collected' in a spell: Behind the Mask's 1/1 instead of 4/3", () => {
    const { s: s0, ap, opp, ids } = setup([mask]);
    const a = toYard(s0, ap, six);
    const g = putOnBattlefield(s0, opp, giant);
    let s = passAll(run(s0, planCast(s0, ap, ids[0]!, [target(g)], undefined, "auto", undefined, { evidence: [a] })));
    expect(pt(s, g)).toBe("1/1");
    const { s: s1, ap: ap1, opp: opp1, ids: ids1 } = setup([mask]);
    toYard(s1, ap1, six);
    const g1 = putOnBattlefield(s1, opp1, giant);
    s = passAll(run(s1, planCast(s1, ap1, ids1[0]!, [target(g1)])));
    expect(pt(s, g1)).toBe("4/3");
  });

  it("'if evidence was collected' in its permanent's enters trigger (Crimestopper Sprite, Vitu-Ghazi Inspector)", () => {
    const { s: s0, ap, opp, ids } = setup([sprite, inspector]);
    const a = toYard(s0, ap, six);
    const b = toYard(s0, ap, six);
    const g = putOnBattlefield(s0, opp, giant);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { evidence: [a] })));
    expect(s.pending?.kind).toBe("chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(g)] }));
    expect(s.objects[g]!.tapped).toBe(true);
    expect(s.objects[g]!.counters.stun).toBe(1);
    // The Inspector cast without evidence: its "if evidence was collected" trigger doesn't trigger at all (CR 603.4).
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.life).toBe(40);
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("Vitu-Ghazi Inspector with evidence: a +1/+1 counter and 2 life", () => {
    const { s: s0, ap, ids } = setup([inspector]);
    const a = toYard(s0, ap, six);
    const mine = putOnBattlefield(s0, ap, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { evidence: [a] })));
    expect(s.pending?.kind).toBe("chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(mine)] }));
    expect(pt(s, mine)).toBe("3/3");
    expect(s.players[ap]!.life).toBe(42);
  });

  it("an activated ability's cost (Forensic Researcher)", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, researcher);
    const g = putOnBattlefield(s0, opp, giant);
    const two1 = toYard(s0, ap, two);
    expect(abilityProblem(s0, ap, r, 1, [target(g)])).toMatch(/total mana value 3 or more/);
    const two2 = toYard(s0, ap, two);
    expect(abilityProblem(s0, ap, r, 1, [target(g)], undefined, undefined, undefined, { collect: [two1] })).toMatch(/total mana value 2/);
    let s = run(s0, planActivate(s0, ap, r, 1, [target(g)], undefined, undefined, undefined, { collect: [two1, two2] }));
    expect(s.objects[two1]!.zone).toBe("exile");
    s = passAll(s);
    expect(s.objects[g]!.tapped).toBe(true);
  });

  it("'you may collect evidence N. If you do, ...' as a trigger resolves (Izoni): yes, or no", () => {
    const { s: s0, ap, ids } = setup([izoni]);
    const a = toYard(s0, ap, four);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "collectEvidence", player: ap, n: 4 });
    expect(() => act(s, { type: "collectEvidence", player: ap, ids: [ids[0]!] })).toThrow();
    s = settle(act(s, { type: "collectEvidence", player: ap, ids: [a] }));
    expect(s.objects[a]!.zone).toBe("exile");
    expect(s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Spider Token").length).toBe(2);

    const { s: s1, ap: ap1, ids: ids1 } = setup([izoni]);
    toYard(s1, ap1, four);
    s = settle(run(s1, planCast(s1, ap1, ids1[0]!)));
    s = settle(act(s, { type: "collectEvidence", player: ap1, ids: [] }));
    expect(s.battlefield.some((id) => s.cards[s.objects[id]!.cardId]!.name === "Spider Token")).toBe(false);
  });

  it("not asked without enough mana value in the graveyard (CR 701.59b)", () => {
    const { s: s0, ap, ids } = setup([izoni]);
    toYard(s0, ap, two);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeNull();
    expect(s.battlefield.some((id) => s.cards[s.objects[id]!.cardId]!.name === "Spider Token")).toBe(false);
  });

  it("'When you do, ...': a reflexive trigger with its own target (Sample Collector, CR 603.12)", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, collector);
    const mine = putOnBattlefield(s0, ap, bear());
    const a = toYard(s0, ap, four);
    let s = passUntil(s0, "declareAttackers", ap);
    const defender = s.turnOrder.find((p) => p !== ap)!;
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: c, defender }] });
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "collectEvidence", n: 3 });
    s = act(s, { type: "collectEvidence", player: ap, ids: [a] });
    // The reflexive trigger goes on the stack with its target chosen then.
    expect(s.pending?.kind).toBe("chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(mine)] }));
    expect(pt(s, mine)).toBe("3/3");
  });

  it("'whenever you collect evidence' triggers for any reason (Evidence Examiner, Surveillance Monitor)", () => {
    const { s: s0, ap, ids } = setup([monitor]);
    putOnBattlefield(s0, ap, examiner);
    const a = toYard(s0, ap, four);
    toYard(s0, ap, four);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "collectEvidence", n: 4 });
    s = settle(act(s, { type: "collectEvidence", player: ap, ids: [a] }));
    const names = s.battlefield.map((id) => s.cards[s.objects[id]!.cardId]!.name);
    expect(names.filter((n) => n === "Clue Token").length).toBe(1);
    expect(names.filter((n) => n === "Thopter Token").length).toBe(1);
    // At the beginning of combat, Evidence Examiner asks again.
    s = passUntil(s, "beginCombat", ap);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "collectEvidence", n: 4 });
  });

  it("Conspiracy Unraveler: collect evidence 10 rather than pay the mana cost; with the spell's own evidence, two collections (rulings)", () => {
    const { s: s0, ap, ids } = setup([sprite]);
    putOnBattlefield(s0, ap, unraveler);
    putOnBattlefield(s0, ap, examiner);
    const yard = [six, six, four, two].map((d) => toYard(s0, ap, d));
    const lands = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && /Basic Land/.test(s0.cards[s0.objects[id]!.cardId]!.typeLine));
    for (const l of lands) s0.objects[l]!.tapped = true; // no mana at all
    expect(castProblem(s0, ap, ids[0]!)).toMatch(/not enough mana/);
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { alt: "evidence", collect: [yard[0]!, yard[2]!] })).toBeNull();
    // The two collections can't use the same cards, and each must make up its own total.
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { alt: "evidence", collect: [yard[0]!, yard[2]!], evidence: [yard[0]!] })).not.toBeNull();
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "evidence", collect: [yard[0]!, yard[2]!], evidence: [yard[1]!] }));
    // No mana spent: the Sprite, with Evidence Examiner's two triggers above it.
    expect(s.stack.map((x) => x.objectId ?? x.description)).toEqual([ids[0], "Evidence Examiner: investigate.", "Evidence Examiner: investigate."]);
    expect(s.objects[ids[0]!]!.evidence).toBe(true);
    s = settle(s);
    // Evidence Examiner's ability triggered twice: two Clues.
    expect(s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Clue Token").length).toBe(2);
  });

  it("a bot collects evidence when it pays off, and answers 'you may collect evidence'", () => {
    const { s: s0, ap, opp, ids } = setup([biteDown]);
    const a = toYard(s0, ap, six);
    putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, opp, giant);
    let s = s0;
    for (let i = 0; i < 30 && s.stack.at(-1)?.objectId !== ids[0]; i++)
      if (s.stack.length || waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      else for (const x of botActions(s, ap)) s = act(s, x);
    expect(s.stack.at(-1)).toMatchObject({ objectId: ids[0] });
    expect(s.objects[a]!.zone).toBe("exile");

    const { s: s1, ap: ap1, ids: ids1 } = setup([izoni]);
    toYard(s1, ap1, four);
    s = settle(run(s1, planCast(s1, ap1, ids1[0]!)));
    expect(s.pending?.kind).toBe("collectEvidence");
    for (const x of botActions(s, ap1)) s = act(s, x);
    s = settle(s);
    expect(s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Spider Token").length).toBe(2);
  });
});
