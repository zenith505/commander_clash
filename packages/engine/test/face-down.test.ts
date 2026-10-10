// Face-down spells and permanents (CR 708): morph and megamorph (CR 702.37), disguise (CR 702.168).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, botActions, castProblem, characteristics, compileCard, defOf, isFullySupported, planCast, planTurnFaceUp, turnFaceUpProblem, waitingOn, type Action, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return settle(passAll(s));
};
/** A special action: no priority passing after it, except to resolve what it triggered. */
const up = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return settle(plan!.reduce((x, a) => act(x, a), s));
};
const tapped = (s: GameState) => s.battlefield.filter((id) => s.objects[id]!.tapped).length;

const angel = card("Exalted Angel", "Creature — Angel", "{4}{W}{W}", { power: "4", toughness: "5", oracleText: "Flying\nLifelink\nMorph {2}{W}{W}", keywords: ["Flying", "Lifelink", "Morph"] });
const seer = card("Morph Seer", "Creature — Human Wizard", "{2}{U}", {
  power: "1",
  toughness: "3",
  oracleText: "When Morph Seer enters, you gain 3 life.\nMorph {1}{U}\nWhen Morph Seer is turned face up, draw two cards.",
  keywords: ["Morph"],
});
const mega = card("Mega Test", "Creature — Elf", "{1}{G}", { power: "2", toughness: "1", oracleText: "Megamorph {1}{G}", keywords: ["Megamorph"] });
const disguised = card("Disguise Test", "Creature — Beast", "{3}{G}", { power: "3", toughness: "3", oracleText: "Disguise {2}{G}", keywords: ["Disguise"] });
const sad = card("Sad Test", "Creature — Beast", "{1}{B}", { power: "2", toughness: "2", oracleText: "When Sad Test dies, draw a card.\nMorph {B}", keywords: ["Morph"] });
const forestLand = card("Forest", "Basic Land — Forest");
const cancel = card("Cancel", "Instant", "{1}{U}{U}", { oracleText: "Counter target spell." });

const faceDown = (s0: GameState, ap: number, id: string) => up(s0, planCast(s0, ap, id, undefined, undefined, "auto", undefined, { faceDown: true }));

describe("casting face down", () => {
  it("compiles morph, megamorph, disguise and 'is turned face up'", () => {
    supported(angel, seer, mega, disguised, sad);
    expect(compileCard(angel).faceDownCast).toEqual({ kind: "morph", cost: "{2}{W}{W}" });
    expect(compileCard(mega).faceDownCast).toEqual({ kind: "megamorph", cost: "{1}{G}" });
    expect(compileCard(seer).triggers.map((t) => t.event)).toEqual(["selfEnters", "selfTurnedFaceUp"]);
    expect(isFullySupported(card("Reveal Morph", "Creature — Bird", "{U}", { power: "1", toughness: "1", oracleText: "Morph—Reveal a blue card in your hand." }))).toBe(false);
  });

  it("a face-down spell costs {3} and is a nameless, colorless 2/2 with no abilities", () => {
    const { s: s0, ap, ids } = setup([angel, bear()]);
    expect(castProblem(s0, ap, ids[1]!, undefined, undefined, undefined, undefined, undefined, { faceDown: true })).toMatch(/can't be cast face down/);
    const before = tapped(s0);
    const s = faceDown(s0, ap, ids[0]!);
    expect(tapped(s) - before).toBe(3);
    const o = s.objects[ids[0]!]!;
    expect(zone(s, o.id)).toBe("battlefield");
    const ch = characteristics(s, o);
    expect([ch.name, ch.power, ch.toughness, ch.colors, ch.keywords, ch.subtypes]).toEqual(["Face-down creature", 2, 2, [], [], []]);
    // Nobody is told what it is.
    expect(logged(s, /Exalted Angel/)).toBe(false);
    expect(logged(s, /casts a face-down creature spell \(morph\)/)).toBe(true);
  });

  it("its enters abilities don't trigger, face down or when it's turned face up (CR 708.3, 708.8)", () => {
    const { s: s0, ap, ids } = setup([seer]);
    const life = s0.players[ap]!.life;
    let s = faceDown(s0, ap, ids[0]!);
    expect(s.players[ap]!.life).toBe(life);
    const hand = s.players[ap]!.hand.length;
    s = up(s, planTurnFaceUp(s, ap, ids[0]!));
    expect(s.players[ap]!.life).toBe(life);
    expect(s.players[ap]!.hand.length).toBe(hand + 2); // "When ~ is turned face up" does trigger
    expect(characteristics(s, s.objects[ids[0]!]!).name).toBe("Morph Seer");
  });

  it("turning it face up is a special action: pay the morph cost, no stack, any time you have priority", () => {
    const { s: s0, ap, ids, opp } = setup([angel]);
    let s = faceDown(s0, ap, ids[0]!);
    expect(turnFaceUpProblem(s, opp, ids[0]!)).toMatch(/don't control|priority/);
    s = passUntil(s, "upkeep", opp); // in an opponent's turn, with priority
    s = settle(s);
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const plan = planTurnFaceUp(s, ap, ids[0]!)!;
    for (const a of plan) s = act(s, a);
    expect(s.stack.length).toBe(0);
    const ch = characteristics(s, s.objects[ids[0]!]!);
    expect([ch.name, ch.power, ch.toughness]).toEqual(["Exalted Angel", 4, 5]);
    expect(ch.keywords).toContain("Flying");
    expect(logged(s, /turns a face-down creature face up: it's Exalted Angel \(morph \{2\}\{W\}\{W\}\)/)).toBe(true);
    expect(turnFaceUpProblem(s, ap, ids[0]!)).toMatch(/isn't a face-down/);
  });

  it("megamorph adds a +1/+1 counter; disguise gives the face-down creature ward {2}", () => {
    const { s: s0, ap, ids } = setup([mega, disguised]);
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, forestLand);
    let s = faceDown(s0, ap, ids[0]!);
    s = up(s, planTurnFaceUp(s, ap, ids[0]!));
    expect(characteristics(s, s.objects[ids[0]!]!).power).toBe(3);
    s = faceDown(s, ap, ids[1]!);
    const o = s.objects[ids[1]!]!;
    expect(abilitiesOf(s, o).triggers.some((t) => t.event === "becomesTargetOfOpponent")).toBe(true);
    s = up(s, planTurnFaceUp(s, ap, ids[1]!));
    expect(abilitiesOf(s, s.objects[ids[1]!]!).triggers.some((t) => t.event === "becomesTargetOfOpponent")).toBe(false);
  });

  it("revealed when it leaves; its own dies ability doesn't trigger while face down", () => {
    const { s: s0, ap, ids } = setup([sad]);
    let s = faceDown(s0, ap, ids[0]!);
    const hand = s.players[ap]!.hand.length;
    s.objects[ids[0]!]!.damage = 2;
    s = settle(act(s, { type: "passPriority", player: ap }));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(logged(s, /face-down creature was Sad Test/)).toBe(true);
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(defOf(s, s.objects[ids[0]!]!).name).toBe("Sad Test");
  });

  it("a countered face-down spell goes to the graveyard face up", () => {
    const { s: s0, ap, ids } = setup([angel, cancel]);
    let s = planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { faceDown: true })!.reduce((x, a) => act(x, a), s0);
    expect(s.stack[0]!.description).toBe("Face-down creature");
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: s.stack[0]!.id }]));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.objects[ids[0]!]!.faceDown).toBeUndefined();
  });

  it("bots cast morphs face down when that's all they can afford, then turn them up", () => {
    const { s: s0, ap, ids } = setup([angel]);
    s0.players[ap]!.isBot = true;
    s0.players[ap]!.landsPlayedThisTurn = 1;
    s0.players[ap]!.command = [];
    for (const id of s0.players[ap]!.hand.filter((x) => x !== ids[0])) {
      s0.players[ap]!.hand.splice(s0.players[ap]!.hand.indexOf(id), 1);
      s0.objects[id]!.zone = "library";
      s0.players[ap]!.library.push(id);
    }
    // Leave four lands: two Plains and two others, not enough for six mana.
    let left = 0;
    for (const id of s0.battlefield) {
      const name = s0.cards[s0.objects[id]!.cardId]!.name;
      if ((name === "Plains" || name === "Forest") && left < 4) left++;
      else s0.objects[id]!.tapped = true;
    }
    const acts = botActions(s0, ap);
    expect(acts[acts.length - 1]).toMatchObject({ type: "castSpell", objectId: ids[0]!, faceDown: true });
    let s = run(s0, acts);
    // Next turn, with the lands untapped, it's turned face up.
    s = passUntil(s, "main1", ap);
    for (const id of s.battlefield) if (s.cards[s.objects[id]!.cardId]!.name !== "Exalted Angel") s.objects[id]!.tapped = !["Plains", "Forest"].includes(s.cards[s.objects[id]!.cardId]!.name);
    s.players[ap]!.landsPlayedThisTurn = 1;
    const next = botActions(s, ap);
    expect(next[next.length - 1]).toMatchObject({ type: "turnFaceUp", objectId: ids[0]! });
  });
});

