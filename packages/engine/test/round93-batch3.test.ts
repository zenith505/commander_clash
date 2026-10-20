// Round 93: Lieutenant ("if you control your commander": one you own, CR 903.3; checked again as it resolves, rulings on
// Loyal Apprentice), Oran-Rief (creatures that entered this turn) and Nesting Grounds (move a counter of a kind chosen as
// it resolves, rulings).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, commander, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, objHasKeyword, planCast, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const apprentice = card("Loyal Apprentice", "Creature — Human Artificer", "{1}{R}", { power: "2", toughness: "1", keywords: ["Haste", "Lieutenant"], oracleText: "Haste\nLieutenant — At the beginning of combat on your turn, if you control your commander, create a 1/1 colorless Thopter artifact creature token with flying. That token gains haste until end of turn." });
const kraken = card("Stormsurge Kraken", "Creature — Kraken", "{3}{U}{U}", { power: "5", toughness: "5", keywords: ["Hexproof", "Lieutenant"], oracleText: "Hexproof\nLieutenant — As long as you control your commander, this creature gets +2/+2 and has \"Whenever this creature becomes blocked, you may draw two cards.\"" });
const oranRief = card("Oran-Rief, the Vastwood", "Land", "", { oracleText: "This land enters tapped.\n{T}: Add {G}.\n{T}: Put a +1/+1 counter on each green creature that entered this turn." });
const nesting = card("Nesting Grounds", "Land", "", { oracleText: "{T}: Add {C}.\n{1}, {T}: Move a counter from target permanent you control onto a second target permanent. Activate only as a sorcery." });
const elf = card("Elvish Visionary", "Creature — Elf Shaman", "{1}{G}", { power: "1", toughness: "1" });

const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const thopters = (s: GameState, pid: number) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name.includes("Thopter"));

describe("Lieutenant", () => {
  it("parse", () => {
    for (const d of [apprentice, kraken]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Loyal Apprentice: a hasty Thopter at the beginning of combat if you control your commander", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, apprentice);
    let s = settle(passUntil(s0, "beginCombat", ap));
    expect(thopters(s, ap)).toHaveLength(0);
    const { s: s1, ap: ap1, opp } = setup([]);
    putOnBattlefield(s1, ap1, apprentice);
    putOnBattlefield(s1, ap1, commander("Mine"), { commander: true });
    // Another player's commander under your control isn't your commander.
    const theirs = putOnBattlefield(s1, opp, commander("Theirs"), { commander: true });
    s1.objects[theirs]!.controller = ap1;
    s = settle(passUntil(s1, "beginCombat", ap1));
    expect(thopters(s, ap1)).toHaveLength(1);
    expect(objHasKeyword(s, s.objects[thopters(s, ap1)[0]!]!, "Haste")).toBe(true);
    const { s: s2, ap: ap2, opp: opp2 } = setup([]);
    putOnBattlefield(s2, ap2, apprentice);
    const t = putOnBattlefield(s2, opp2, commander("Theirs"), { commander: true });
    s2.objects[t]!.controller = ap2;
    s = settle(passUntil(s2, "beginCombat", ap2));
    expect(thopters(s, ap2)).toHaveLength(0);
  });

  it("Stormsurge Kraken: +2/+2 while you control your commander", () => {
    const { s, ap } = setup([]);
    const k = putOnBattlefield(s, ap, kraken);
    expect(pt(s, k)).toBe("5/5");
    putOnBattlefield(s, ap, commander("Mine"), { commander: true });
    expect(pt(s, k)).toBe("7/7");
  });
});

describe("Oran-Rief, the Vastwood", () => {
  it("parse", () => expect(isFullySupported(oranRief)).toBe(true));

  it("a +1/+1 counter on each green creature that entered this turn, anyone's", () => {
    const { s: s0, ap, opp } = setup([]);
    const o = putOnBattlefield(s0, ap, oranRief);
    const old = putOnBattlefield(s0, ap, bear());
    const fresh = [putOnBattlefield(s0, ap, elf), putOnBattlefield(s0, opp, bear())];
    for (const id of fresh) s0.objects[id]!.enteredTurn = s0.turn;
    s0.objects[old]!.enteredTurn = s0.turn - 1;
    const s = settle(activate(s0, ap, o, 0));
    expect(fresh.map((id) => s.objects[id]!.counters["+1/+1"])).toEqual([1, 1]);
    expect(s.objects[old]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("Nesting Grounds", () => {
  it("parse", () => expect(isFullySupported(nesting)).toBe(true));

  it("moves one counter of the kind you choose onto the second target", () => {
    const { s: s0, ap, opp } = setup([]);
    const n = putOnBattlefield(s0, ap, nesting);
    const from = putOnBattlefield(s0, ap, bear());
    const to = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    s0.objects[from]!.counters = { "+1/+1": 2, stun: 1 };
    let s = activate(s0, ap, n, 0, [target(from), target(to)]);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "counterKind", player: ap });
    expect(s.pending?.kind === "chooseOption" && [...s.pending.options].sort()).toEqual(["+1/+1", "stun"]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "stun" }));
    expect(s.objects[from]!.counters).toMatchObject({ "+1/+1": 2, stun: 0 });
    expect(s.objects[to]!.counters.stun).toBe(1);
  });

  it("one kind: no question", () => {
    const { s: s0, ap } = setup([]);
    const n = putOnBattlefield(s0, ap, nesting);
    const from = putOnBattlefield(s0, ap, bear());
    const to = putOnBattlefield(s0, ap, nesting);
    s0.objects[from]!.counters = { "+1/+1": 1 };
    const s = settle(activate(s0, ap, n, 0, [target(from), target(to)]));
    expect(s.pending).toBeNull();
    expect(s.objects[to]!.counters["+1/+1"]).toBe(1);
  });
});

const resonator = card("Strionic Resonator", "Artifact", "{2}", { oracleText: "{2}, {T}: Copy target triggered ability you control. You may choose new targets for the copy. (A triggered ability uses the words \"when,\" \"whenever,\" or \"at.\")" });
const kavu = card("Flametongue Kavu", "Creature — Kavu", "{3}{R}", { power: "4", toughness: "2", oracleText: "When this creature enters, it deals 4 damage to target creature." });
const lithoform = card("Lithoform Engine", "Legendary Artifact", "{4}", { oracleText: "{2}, {T}: Copy target activated or triggered ability you control. You may choose new targets for the copy.\n{3}, {T}: Copy target instant or sorcery spell you control. You may choose new targets for the copy.\n{4}, {T}: Copy target permanent spell you control. (The copy becomes a token.)" });

describe("Strionic Resonator", () => {
  it("parse", () => {
    for (const d of [resonator, lithoform]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("copies a triggered ability you control, with a new target", () => {
    const { s: s0, ap, ids, opp } = setup([kavu]);
    const r = putOnBattlefield(s0, ap, resonator);
    const a = putOnBattlefield(s0, opp, bear({ name: "Bear A" }));
    const b = putOnBattlefield(s0, opp, card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "5" }));
    // Cast the Kavu; its trigger goes on the stack targeting Bear A.
    let t = s0;
    for (const x of planCast(t, ap, ids[0]!)!) t = act(t, x);
    for (let i = 0; i < 10 && !t.pending && !t.stack.some((x) => x.kind === "ability"); i++) t = act(t, { type: "passPriority", player: waitingOn(t)! });
    if (t.pending?.kind === "chooseTargets") t = act(t, { type: "chooseTargets", player: ap, targets: [target(a)] });
    const trig = t.stack.find((x) => x.kind === "ability")!;
    expect(trig).toBeTruthy();
    t = activate(t, ap, r, 0, [{ kind: "stack", id: trig.id }]);
    for (let i = 0; i < 10 && t.pending?.kind !== "copyTargets"; i++) t = act(t, { type: "passPriority", player: waitingOn(t)! });
    expect(t.pending?.kind).toBe("copyTargets");
    t = settle(act(t, { type: "copyTargets", player: ap, targets: [target(b)] }));
    expect(t.objects[a]!.zone).toBe("graveyard");
    expect(t.objects[b]!.damage).toBe(4);
    expect(t.log.some((l) => /copies Flametongue Kavu/.test(l.text))).toBe(true);
  });
});
