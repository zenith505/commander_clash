// Round 190: more of the harder cards both lanes skipped, from the most played down: counters of any kind plus one on
// any permanent you control (Pir, Imaginative Rascal), granted fabricate (Cayth, Famed Mechanist), "as long as it was
// cast" (The Tarrasque), a revealed creature put onto the battlefield tapped and attacking (Raph & Mikey), "until you
// reveal X land cards, where X is ..." (The Ring Goes South).

import { describe, expect, it } from "vitest";
import { act, bear, card, commander, mountain, passUntil, putOnBattlefield, scry, setup, swamp } from "./helpers";
import { abilitiesOf, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; "you may" questions get `yes`, copies keep their targets. Stops at any other question. */
const resolveAll = (s: GameState, yes = true) => {
  for (let i = 0; i < 120 && (s.stack.length || s.triggerQueue.length || s.pending?.kind === "chooseMay" || s.pending?.kind === "copyTargets"); i++) {
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes });
    else if (s.pending?.kind === "copyTargets") s = act(s, { type: "copyTargets", player: s.pending.player });
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const choose = (s: GameState, targets: TargetChoice[]) => (s.pending?.kind === "chooseTargets" ? resolveAll(act(s, { type: "chooseTargets", player: s.pending.player, targets })) : s);
const modes = (s: GameState, m: number[]) => {
  if (s.pending?.kind !== "chooseModes") throw new Error(`no modes question: ${s.pending?.kind}`);
  return act(s, { type: "chooseModes", player: s.pending.player, modes: m });
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const counters = (s: GameState, id: string, c = "+1/+1") => s.objects[id]!.counters[c] ?? 0;
const pt = (s: GameState, id: ObjectId) => [power(s, s.objects[id]!), toughness(s, s.objects[id]!)];
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && s.cards[s.objects[id]!.cardId]!.name === name);
const lands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).types.includes("Land"));
const tapAllBut = (s: GameState, pid: PlayerId, keep: ObjectId[]) => {
  for (const id of lands(s, pid)) s.objects[id]!.tapped = !keep.includes(id);
  invalidateCharacteristics(s);
};
const next = (s: GameState, pid: PlayerId, k = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + k) % 4]!;
/** Passes (no blocks, "you may" answered yes) until `step` of `ap`'s turn with an empty stack, or until another question. */
const toStep = (s: GameState, step: GameState["step"], ap: PlayerId) => {
  for (let i = 0; i < 800; i++) {
    if (s.step === step && s.activePlayer === ap && !s.stack.length && !s.triggerQueue.length && !s.pending) return s;
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: true });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error(`never reached ${step}`);
};
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId; planeswalker?: ObjectId }[]) => act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks });
const shock = card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "This spell deals 2 damage to any target." });
const bolt = card("Test Bolt", "Instant", "{R}", { cmc: 1, oracleText: "This spell deals 3 damage to any target." });
const creature = (name: string, sub: string, p: number, t = p) => card(name, `Creature — ${sub}`, "{G}", { cmc: 1, power: String(p), toughness: String(t) });

// Real oracle text (Scryfall).
const cayth = card("Cayth, Famed Mechanist", "Legendary Creature — Dwarf Artificer", "{1}{U}{R}{W}", {"cmc":4,"power":"3","toughness":"3","keywords":["Proliferate","Fabricate","Populate"],"oracleText":"Fabricate 1 (When this creature enters, put a +1/+1 counter on it or create a 1/1 colorless Servo artifact creature token.)\nOther nontoken creatures you control have fabricate 1.\n{2}, {T}: Choose one —\n• Populate.\n• Proliferate.","colors":["R","U","W"],"layout":"normal"});
const tarrasque = card("The Tarrasque", "Legendary Creature — Dinosaur", "{6}{G}{G}{G}", {"cmc":9,"power":"10","toughness":"10","keywords":["Fight"],"oracleText":"The Tarrasque has haste and ward {10} as long as it was cast.\nWhenever The Tarrasque attacks, it fights target creature defending player controls.","colors":["G"],"layout":"normal"});
const pir = card("Pir, Imaginative Rascal", "Legendary Creature — Human", "{2}{G}", {"cmc":3,"power":"1","toughness":"1","keywords":["Partner with","Partner"],"oracleText":"Partner with Toothy, Imaginary Friend (When this creature enters, target player may put Toothy into their hand from their library, then shuffle.)\nIf one or more counters would be put on a permanent your team controls, that many plus one of each of those kinds of counters are put on that permanent instead.","colors":["G"],"layout":"normal"});
const raphAndMikey = card("Raph & Mikey, Troublemakers", "Legendary Creature — Mutant Ninja Turtle", "{5}{R/G}{R/G}", {"cmc":7,"power":"7","toughness":"7","keywords":["Haste","Trample"],"oracleText":"Trample, haste\nWhenever Raph & Mikey attack, reveal cards from the top of your library until you reveal a creature card. Put that card onto the battlefield tapped and attacking and the rest on the bottom of your library in a random order.","colors":["G","R"],"layout":"normal"});
const ringGoesSouth = card("The Ring Goes South", "Sorcery", "{3}{G}", {"cmc":4,"oracleText":"The Ring tempts you. Then reveal cards from the top of your library until you reveal X land cards, where X is the number of legendary creatures you control. Put those land cards onto the battlefield tapped and the rest on the bottom of your library in a random order.","colors":["G"],"layout":"normal"});

const ALL = [cayth, tarrasque, pir, raphAndMikey, ringGoesSouth];

describe("round 190", () => {
  it("all compile", () => supported(...ALL));

  it("Pir: one more of each kind of counter put on a permanent you control, not on an opponent's", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, pir);
    const mine = putOnBattlefield(s, ap, creature("Test Mine", "Beast", 2));
    const theirs = putOnBattlefield(s, opp, creature("Test Theirs", "Beast", 2));
    const grow = card("Test Grow", "Instant", "{G}", { cmc: 1, oracleText: "Put a +1/+1 counter and a lore counter on target creature." });
    const growMine = into(s, ap, grow, "hand");
    const growTheirs = into(s, ap, grow, "hand");
    s = resolveAll(run(s, planCast(s, ap, growMine, [tgt(mine)])));
    s = resolveAll(run(s, planCast(s, ap, growTheirs, [tgt(theirs)])));
    expect(counters(s, mine)).toBe(2);
    expect(counters(s, theirs)).toBe(1);
  });

  it("Cayth gives other nontoken creatures you control fabricate 1 as they enter; Pir makes its counter two", () => {
    let { s, ap, ids } = setup([bear(), bear()]);
    putOnBattlefield(s, ap, cayth);
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("chooseMay");
    s = resolveAll(s, true);
    expect(pt(s, ids[0]!)).toEqual([3, 3]);
    // Declined: a Servo, a token, which doesn't get fabricate itself.
    s = run(s, planCast(s, ap, ids[1]!));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = resolveAll(s, false);
    expect(pt(s, ids[1]!)).toEqual([2, 2]);
    expect(named(s, ap, "Servo Token")).toHaveLength(1);
    expect(s.pending).toBeFalsy();
    expect(s.stack).toHaveLength(0);
  });

  it("The Tarrasque has haste and ward {10} when cast, not when put onto the battlefield", () => {
    let { s, ap, ids } = setup([tarrasque]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    const o = s.objects[ids[0]!]!;
    expect(objHasKeyword(s, o, "Haste")).toBe(true);
    const ward = (id: ObjectId) => abilitiesOf(s, s.objects[id]!).triggers.some((t) => t.event === "becomesTargetOfOpponent");
    expect(ward(ids[0]!)).toBe(true);
    const put = putOnBattlefield(s, ap, tarrasque);
    expect(objHasKeyword(s, s.objects[put]!, "Haste")).toBe(false);
    expect(ward(put)).toBe(false);
  });

  it("Raph & Mikey: the revealed creature enters tapped and attacking whom you choose; the rest go to the bottom", () => {
    let { s, ap, opp } = setup([]);
    const rm = putOnBattlefield(s, ap, raphAndMikey);
    const found = into(s, ap, creature("Test Found", "Beast", 3), "library");
    const land1 = into(s, ap, mountain, "library");
    const other = next(s, ap, 2);
    s = attack(s, ap, [{ attacker: rm, defender: opp }]);
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseOption"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "attackWhom" });
    s = act(s, { type: "chooseOption", player: ap, choice: String(other) });
    const o = s.objects[found]!;
    expect(o.zone).toBe("battlefield");
    expect(o.tapped).toBe(true);
    expect(o.attacking).toBe(other);
    const lib = s.players[ap]!.library;
    expect(lib[lib.length - 1]).toBe(land1);
  });

  it("The Ring Goes South: the Ring tempts first, so a Ring-bearer counts as legendary; X land cards onto the battlefield tapped", () => {
    let { s, ap, ids } = setup([ringGoesSouth]);
    const bearer = putOnBattlefield(s, ap, creature("Test Bearer", "Human", 2));
    putOnBattlefield(s, ap, pir);
    const before = lands(s, ap);
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 20 && s.stack.length && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "ringBearer" });
    s = act(s, { type: "pickPermanents", player: ap, ids: [bearer] });
    s = resolveAll(s);
    const fresh = lands(s, ap).filter((id) => !before.includes(id));
    expect(fresh).toHaveLength(2);
    expect(fresh.every((id) => s.objects[id]!.tapped)).toBe(true);
  });
});
