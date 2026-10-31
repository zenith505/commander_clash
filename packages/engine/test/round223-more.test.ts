// Round 223, more cards: The Filigree Sylex ("Remove ten oil counters from among permanents you control and sacrifice
// ~"), Marath, Will of the Wild ("X can't be 0" in every mode), Quicksilver, Brash Blur ("begin the game with him on the
// battlefield"), Jerren, Corrupted Bishop ("Whenever ~ enters or another nontoken Human you control dies") and Evin,
// Waterdeep Opportunist ("Whenever one or more players sacrifice one or more creatures ... only once each turn").

import { describe, expect, it } from "vitest";
import { act, bear, card, commander, forest, pt, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, applyAction, botActions, createGame, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
/** Everyone passes until the stack is empty; questions are answered as the bots would, "you may" with `may`. */
const settle = (s: GameState, may = true) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: may });
    else if (p) s = act(s, botActions(s, p.player)[0]!);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const abilityIndex = (s: GameState, id: ObjectId, re: RegExp) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => re.test(a.text));
const ofMine = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === name);

// Real oracle text (Scryfall).
const sylex = card("The Filigree Sylex", "Legendary Artifact", "{2}", {
  oracleText: "{T}: Put an oil counter on The Filigree Sylex.\n{T}, Sacrifice The Filigree Sylex: Destroy each nonland permanent with mana value equal to the number of oil counters on The Filigree Sylex.\n{T}, Remove ten oil counters from among permanents you control and sacrifice The Filigree Sylex: It deals 10 damage to any target.",
});
const marath = card("Marath, Will of the Wild", "Legendary Creature — Elemental Beast", "{R}{G}{W}", {
  power: "0", toughness: "0",
  oracleText: "Marath enters with a number of +1/+1 counters on it equal to the amount of mana spent to cast it.\n{X}, Remove X +1/+1 counters from Marath: Choose one —\n• Put X +1/+1 counters on target creature. X can't be 0.\n• Marath deals X damage to any target. X can't be 0.\n• Create an X/X green Elemental creature token. X can't be 0.",
});
const quicksilver = card("Quicksilver, Brash Blur", "Legendary Creature — Mutant Hero", "{R}", {
  power: "1", toughness: "1", keywords: ["Haste"],
  oracleText: "If Quicksilver, Brash Blur is in your opening hand, you may begin the game with him on the battlefield.\nHaste\nPower-up — {4}{R}: Put a +1/+1 counter and a double strike counter on Quicksilver. (Activate each power-up ability only once. Reduce the cost by his mana cost if he entered this turn.)",
});
const jerren: CardDef = {
  ...card("Jerren, Corrupted Bishop", "Legendary Creature — Human Cleric", "{2}{B}", {
    power: "2", toughness: "3",
    oracleText: "Whenever Jerren enters or another nontoken Human you control dies, you lose 1 life and create a 1/1 white Human creature token.\n{2}: Target Human you control gains lifelink until end of turn.\nAt the beginning of your end step, if you have exactly 13 life, you may pay {4}{B}{B}. If you do, transform Jerren.",
  }),
};
const evin = card("Evin, Waterdeep Opportunist", "Legendary Creature — Human Rogue", "{3}{B}", {
  power: "2", toughness: "4", keywords: ["Menace", "Ward"],
  oracleText: "Menace\nWard—Sacrifice a creature.\nEvin gets +2/+0 for each Treasure you control.\nWhenever one or more players sacrifice one or more creatures, you create a tapped Treasure token. This ability triggers only once each turn.",
});
const human = card("Test Human", "Creature — Human", "{1}", { power: "1", toughness: "1" });
const altar = card("Test Altar", "Artifact", "{1}", { oracleText: "Sacrifice a creature: You gain 1 life." });

describe("round 223, more cards", () => {
  it("parse", () => {
    for (const c of [sylex, marath, quicksilver, jerren, evin]) expect(isFullySupported(c), c.name).toBe(true);
  });

  it("The Filigree Sylex: ten oil counters from among your permanents (itself included), then 10 damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const x = putOnBattlefield(s0, ap, sylex);
    const other = putOnBattlefield(s0, ap, card("Test Oil Vessel", "Artifact", "{1}"));
    s0.objects[x]!.counters.oil = 4;
    s0.objects[other]!.counters.oil = 5;
    const i = abilityIndex(s0, x, /10 damage/);
    // Nine isn't enough.
    expect(planActivate(s0, ap, x, i, [{ kind: "player", id: opp }])).toBeNull();
    s0.objects[other]!.counters.oil = 6;
    const counters = [...Array.from({ length: 4 }, () => ({ id: x, kind: "oil" })), ...Array.from({ length: 6 }, () => ({ id: other, kind: "oil" }))];
    let s = run(s0, planActivate(s0, ap, x, i, [{ kind: "player", id: opp }], undefined, undefined, undefined, { counters }));
    expect(zone(s, x)).toBe("graveyard");
    expect(s.objects[other]!.counters.oil ?? 0).toBe(0);
    s = settle(s);
    expect(s.players[opp]!.life).toBe(30);
  });

  it("The Filigree Sylex: destroys each nonland permanent with mana value equal to its oil counters (as it last existed)", () => {
    const { s: s0, ap, opp } = setup([]);
    const x = putOnBattlefield(s0, ap, sylex);
    s0.objects[x]!.counters.oil = 2;
    const b = putOnBattlefield(s0, opp, bear());
    const h = putOnBattlefield(s0, opp, human);
    const s = settle(run(s0, planActivate(s0, ap, x, abilityIndex(s0, x, /Destroy each/))));
    expect(zone(s, b)).toBe("graveyard");
    expect(zone(s, h)).toBe("battlefield");
  });

  it("Marath: enters with counters for the mana spent; X can't be 0 in any mode", () => {
    const { s: s0, ap, opp, ids } = setup([marath]);
    for (const c of ["R", "G", "W"] as const) s0.players[ap]!.manaPool[c] = 1;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const m = ids[0]!;
    expect(zone(s, m)).toBe("battlefield");
    expect(s.objects[m]!.counters["+1/+1"]).toBe(3);
    expect(pt(s, m)).toBe("3/3");
    s.players[ap]!.manaPool.C = 2;
    // X = 0 isn't allowed, whichever mode.
    const targets: TargetChoice[][] = [[tgt(m)], [{ kind: "player", id: opp }], []];
    for (const mode of [0, 1, 2]) expect(planActivate(s, ap, m, 0, targets[mode], [mode], undefined, 0), `mode ${mode}`).toBeNull();
    // X = 1 works.
    expect(planActivate(s, ap, m, 0, targets[2], [2], undefined, 1)).not.toBeNull();
    s = settle(run(s, planActivate(s, ap, m, 0, [{ kind: "player", id: opp }], [1], undefined, 2)));
    expect(s.players[opp]!.life).toBe(38);
    expect(s.objects[m]!.counters["+1/+1"]).toBe(1);
  });

  it("Quicksilver: you may begin the game with him on the battlefield", () => {
    const others = () => [...Array.from({ length: 50 }, () => forest), ...Array.from({ length: 49 }, () => bear())];
    const mine = [...Array.from({ length: 30 }, () => quicksilver), ...Array.from({ length: 69 }, () => forest)];
    let s = createGame(["A", "B", "C", "D"].map((name, i) => ({ name, commander: commander(`C${i}`), deck: i === 0 ? mine : others() })), 7);
    const pend = s.pending;
    if (pend?.kind !== "searchLibrary" || !pend.opening) throw new Error(`no opening choice: ${pend?.kind}`);
    expect(pend.player).toBe(0);
    s = act(s, { type: "searchLibrary", player: 0, found: [pend.cards[0]!] });
    expect(ofMine(s, 0, "Quicksilver, Brash Blur")).toEqual([pend.cards[0]]);
  });

  it("Jerren: a Human token when he enters and when another nontoken Human you control dies, not a token", () => {
    const { s: s0, ap, ids } = setup([jerren]);
    s0.players[ap]!.manaPool.B = 3;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.life).toBe(39);
    expect(ofMine(s, ap, "Human Token")).toHaveLength(1);
    const h = putOnBattlefield(s, ap, human);
    const a = putOnBattlefield(s, ap, altar);
    s = settle(run(s, planActivate(s, ap, a, 0, undefined, undefined, undefined, undefined, { sacrifice: [h] })));
    expect(s.players[ap]!.life).toBe(38 + 1);
    expect(ofMine(s, ap, "Human Token")).toHaveLength(2);
    // A token Human dying: nothing.
    s = settle(run(s, planActivate(s, ap, a, 0, undefined, undefined, undefined, undefined, { sacrifice: [ofMine(s, ap, "Human Token")[0]!] })));
    expect(s.players[ap]!.life).toBe(40);
    expect(ofMine(s, ap, "Human Token")).toHaveLength(1);
  });

  it("Evin: a tapped Treasure the first time any player sacrifices a creature each turn; +2/+0 for each Treasure", () => {
    const { s: s0, ap, opp } = setup([]);
    const e = putOnBattlefield(s0, ap, evin);
    const a = putOnBattlefield(s0, opp, altar);
    const b1 = putOnBattlefield(s0, opp, bear());
    const b2 = putOnBattlefield(s0, opp, bear());
    expect(pt(s0, e)).toBe("2/4");
    s0.priority = opp;
    let s = settle(run(s0, planActivate(s0, opp, a, 0, undefined, undefined, undefined, undefined, { sacrifice: [b1] })));
    const t = ofMine(s, ap, "Treasure Token");
    expect(t).toHaveLength(1);
    expect(s.objects[t[0]!]!.tapped).toBe(true);
    expect(pt(s, e)).toBe("4/4");
    s.priority = opp;
    s = settle(run(s, planActivate(s, opp, a, 0, undefined, undefined, undefined, undefined, { sacrifice: [b2] })));
    expect(ofMine(s, ap, "Treasure Token")).toHaveLength(1);
  });
});
