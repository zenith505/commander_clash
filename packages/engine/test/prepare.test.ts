// Preparation cards (CR 722): as a permanent with a prepare spell becomes prepared, its controller creates a copy of the
// prepare spell in exile (722.3c). The prepared permanent's controller may cast that copy while the permanent stays on
// the battlefield prepared; casting it unprepares the permanent. Being prepared isn't copiable; the prepare spell is
// (722.2b), and a copy's exceptions don't reach it (rulings).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, pt, putOnBattlefield, scry, setup, swamp, target } from "./helpers";
import { botActions, defOf, exilePlayable, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const REMINDER = " (While it's prepared, you may cast a copy of its spell. Doing so unprepares it.)";
const eater = scry(
  "prepare",
  [
    { name: "Adventurous Eater", mana_cost: "{2}{B}", type_line: "Creature — Human Warlock", oracle_text: `This creature enters prepared.${REMINDER}`, power: "3", toughness: "2" },
    { name: "Have a Bite", mana_cost: "{B}", type_line: "Sorcery", oracle_text: "Put a +1/+1 counter on target creature. You gain 1 life." },
  ],
  { keywords: ["Prepared"] },
);
const abigale = scry(
  "prepare",
  [
    { name: "Abigale, Poet Laureate", mana_cost: "{1}{W}{B}", type_line: "Legendary Creature — Bird Bard", oracle_text: `Flying\nWhenever you cast a creature spell, Abigale becomes prepared.${REMINDER}`, power: "2", toughness: "3" },
    { name: "Heroic Stanza", mana_cost: "{1}{W/B}", type_line: "Sorcery", oracle_text: "Put a +1/+1 counter on target creature." },
  ],
  { keywords: ["Flying", "Prepared"] },
);
const voxmancer = scry(
  "prepare",
  [
    { name: "Stingerquill Voxmancer", mana_cost: "{1}{B}{R}", type_line: "Creature — Insect Bard", oracle_text: `At the beginning of your upkeep, if this creature isn't prepared, it becomes prepared.${REMINDER}`, power: "2", toughness: "2" },
    { name: "Vicious Verse", mana_cost: "{B/R}", type_line: "Sorcery", oracle_text: "Vicious Verse deals 1 damage to target opponent." },
  ],
  { keywords: ["Prepared"] },
);
const firesinger = scry(
  "prepare",
  [
    { name: "Blazing Firesinger", mana_cost: "{2}{R}", type_line: "Creature — Dwarf Bard", oracle_text: `This creature enters prepared.${REMINDER}`, power: "3", toughness: "2" },
    { name: "Seething Song", mana_cost: "{2}{R}", type_line: "Instant", oracle_text: "Add {R}{R}{R}{R}{R}." },
  ],
  { keywords: ["Prepared"] },
);
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
const twin = card("Twin Test", "Instant", "{2}{U}", { oracleText: "Create a token that's a copy of target creature you control, except it isn't legendary." });
const frogify = card("Frog Test", "Instant", "{1}{U}", { oracleText: "Create a token that's a copy of target creature you control, except it's a 1/1 green Frog in addition to its other types." });
const bear = card("Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const name = (s: GameState, id: string) => defOf(s, s.objects[id]!).name;
/** The copy of a prepare spell in exile for this permanent. */
const copyOf = (s: GameState, id: string) => {
  const c = s.objects[id]!.prepared?.copy;
  return c && s.objects[c]?.zone === "exile" ? c : undefined;
};
const inHand = (s: GameState, pid: PlayerId, d: CardDef) => {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};

describe("preparation cards (CR 722)", () => {
  it("compile", () => {
    for (const d of [eater, abigale, voxmancer, firesinger]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Adventurous Eater enters prepared: cast Have a Bite's copy from exile, which unprepares it and then is gone", () => {
    const { s: s0, ap, ids } = setup([eater]);
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, swamp);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const e = ids[0]!;
    expect(s.objects[e]!.zone).toBe("battlefield");
    expect(s.objects[e]!.prepared).toBeDefined();
    const c = copyOf(s, e)!;
    expect(c).toBeDefined();
    // The copy has only the prepare spell's characteristics: a black sorcery with mana value 1 (CR 722.3c).
    expect(name(s, c)).toBe("Have a Bite");
    expect(defOf(s, s.objects[c]!).types).toEqual(["Sorcery"]);
    expect(exilePlayable(s, ap)).toContain(c);
    // Nobody else may cast it.
    const opp = s.turnOrder.find((p) => p !== ap)!;
    expect(exilePlayable(s, opp)).not.toContain(c);
    const life = s.players[ap]!.life;
    s = run(s, planCast(s, ap, c, [target(e)]));
    // Cast: Adventurous Eater is no longer prepared at once (CR 601.2i).
    expect(s.objects[e]!.prepared).toBeUndefined();
    expect(s.castThisTurn?.some((x) => x.player === ap)).toBe(true);
    s = settle(s);
    expect(pt(s, e)).toBe("4/3");
    expect(s.players[ap]!.life).toBe(life + 1);
    // A copy of a spell ceases to exist once it leaves the stack (CR 707.10a): not in any graveyard.
    expect(s.objects[c]).toBeUndefined();
    expect(s.players[ap]!.graveyard).not.toContain(c);
    expect(s.log.some((l) => l.text === "Adventurous Eater becomes prepared.")).toBe(true);
  });

  it("the copy ceases to exist when its permanent leaves the battlefield", () => {
    const { s: s0, ap, ids } = setup([eater, murder]);
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, swamp);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const c = copyOf(s, ids[0]!)!;
    s = settle(run(s, planCast(s, ap, ids[1]!, [target(ids[0]!)])));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.objects[c]).toBeUndefined();
    expect(s.players[ap]!.exile).not.toContain(c);
  });

  it("Abigale becomes prepared when you cast a creature spell, and not a second time while prepared (CR 722.3a)", () => {
    const { s: s0, ap, ids } = setup([bear, bear]);
    const a = putOnBattlefield(s0, ap, abigale);
    expect(s0.objects[a]!.prepared).toBeUndefined();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const c = copyOf(s, a)!;
    expect(name(s, c)).toBe("Heroic Stanza");
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(copyOf(s, a)).toBe(c);
    expect(s.players[ap]!.exile.filter((id) => s.objects[id]!.preparedFrom).length).toBe(1);
  });

  it("Stingerquill Voxmancer becomes prepared at your upkeep only if it isn't (an intervening if, CR 603.4)", () => {
    const { s: s0, ap } = setup([]);
    const v = putOnBattlefield(s0, ap, voxmancer);
    let s = settle(passUntil(passUntil(s0, "end", ap), "draw", ap));
    expect(s.objects[v]!.prepared).toBeDefined();
    const c = copyOf(s, v)!;
    const triggered = s.log.filter((l) => l.text.startsWith("Stingerquill Voxmancer's ability triggers")).length;
    expect(triggered).toBe(1);
    // Next upkeep: still prepared, so it doesn't trigger.
    s = settle(passUntil(passUntil(s, "end", ap), "draw", ap));
    expect(s.log.filter((l) => l.text.startsWith("Stingerquill Voxmancer's ability triggers")).length).toBe(1);
    expect(copyOf(s, v)).toBe(c);
  });

  it("only the prepared permanent's controller now may cast the copy (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([eater]);
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, swamp);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const c = copyOf(s, ids[0]!)!;
    s.objects[ids[0]!]!.controller = opp;
    invalidateCharacteristics(s);
    expect(exilePlayable(s, ap)).not.toContain(c);
    expect(exilePlayable(s, opp)).toContain(c);
  });

  it("a token copy has the prepare spell too, without the copy's exceptions (CR 722.2b, rulings), but isn't prepared", () => {
    const { s: s0, ap, ids } = setup([frogify, twin]);
    const e = putOnBattlefield(s0, ap, eater);
    const a = putOnBattlefield(s0, ap, abigale);
    // A copy of Adventurous Eater enters prepared by its own ability; its spell is still a black sorcery.
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(e)])));
    const frog = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    expect(pt(s, frog)).toBe("1/1");
    const c = copyOf(s, frog)!;
    expect(name(s, c)).toBe("Have a Bite");
    expect(defOf(s, s.objects[c]!).colors).toEqual(["B"]);
    expect(defOf(s, s.objects[c]!).types).toEqual(["Sorcery"]);
    // Abigale isn't prepared, and neither is its copy (being prepared isn't copiable).
    s.objects[a]!.prepared = {};
    s = settle(run(s, planCast(s, ap, ids[1]!, [target(a)])));
    const token = s.battlefield.find((id) => s.objects[id]!.isToken && id !== frog)!;
    expect(name(s, token)).toBe("Abigale, Poet Laureate");
    expect(s.objects[token]!.prepared).toBeUndefined();
  });

  it("a bot casts the copy of its prepare spell", () => {
    const { s: s0, ap, ids } = setup([eater]);
    for (let i = 0; i < 6; i++) putOnBattlefield(s0, ap, swamp);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const c = copyOf(s, ids[0]!)!;
    // The bot plays out its main phase.
    let cast = false;
    for (let i = 0; i < 40 && !cast && s.step === "main1" && !s.pending; i++) {
      const acts = waitingOn(s) === ap ? botActions(s, ap) : [{ type: "passPriority" as const, player: waitingOn(s)! }];
      cast = acts.some((a) => a.type === "castSpell" && a.objectId === c);
      s = acts.reduce((x, a) => act(x, a), s);
    }
    expect(cast).toBe(true);
  });
});
