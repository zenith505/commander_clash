// Round 108, further down the popularity list: Defense Grid ("except during its controller's turn"), Nasty End ("if
// the sacrificed creature was legendary"), Inti (exile the top card whenever you discard), Teferi's Puzzle Box (hand to
// the bottom, then draw that many), Angel's Grace (damage leaves you at 1 this turn), Magister Sphinx ("life total
// becomes 10", CR 119.5) and Crag Saurian (a source dealing damage to it takes it).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { controllerOf, invalidateCharacteristics, isFullySupported, planCast, spellCost, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const grid = card("Defense Grid", "Artifact", "{2}", { oracleText: "Each spell costs {3} more to cast except during its controller's turn." });
const nasty = card("Nasty End", "Instant", "{1}{B}", {
  oracleText: "As an additional cost to cast this spell, sacrifice a creature.\nDraw two cards. If the sacrificed creature was legendary, draw three cards instead.",
});
const inti = card("Inti, Seneschal of the Sun", "Legendary Creature — Human Knight", "{1}{R}", {
  power: "2",
  toughness: "2",
  oracleText:
    "Whenever you attack, you may discard a card. When you do, put a +1/+1 counter on target attacking creature. It gains trample until end of turn.\nWhenever you discard one or more cards, exile the top card of your library. You may play that card until your next end step.",
});
const box = card("Teferi's Puzzle Box", "Artifact", "{4}", {
  oracleText: "At the beginning of each player's draw step, that player puts the cards in their hand on the bottom of their library in any order, then draws that many cards.",
});
const grace = card("Angel's Grace", "Instant", "{W}", {
  keywords: ["Split second"],
  oracleText:
    "Split second (As long as this spell is on the stack, players can't cast spells or activate abilities that aren't mana abilities.)\nYou can't lose the game this turn and your opponents can't win the game this turn. Until end of turn, damage that would reduce your life total to less than 1 reduces it to 1 instead.",
});
const sphinx = card("Magister Sphinx", "Artifact Creature — Sphinx", "{4}{W}{U}{B}", {
  power: "5",
  toughness: "5",
  keywords: ["Flying"],
  oracleText: "Flying\nWhen this creature enters, target player's life total becomes 10.",
});
const saurian = card("Crag Saurian", "Creature — Lizard", "{R}{R}{R}", {
  power: "4",
  toughness: "4",
  oracleText: "Whenever a source deals damage to this creature, that source's controller gains control of this creature.",
});
// Test cards.
const legend = card("Test Legend", "Legendary Creature — Elf", "{2}{G}", { power: "2", toughness: "2" });
const loot = card("Test Loot", "Sorcery", "{U}", { oracleText: "Draw a card, then discard a card." });
const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." });
const blast = card("Test Blast", "Instant", "{R}", { oracleText: "Test Blast deals 50 damage to any target." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const hand = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.length;
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};

describe("Defense Grid", () => {
  it("{3} more for spells cast outside their controller's turn only", () => {
    supported(grid);
    const { s, ap, ids } = setup([shock]);
    const opp = next(s, ap);
    const theirs = inHand(s, opp, shock);
    const [mine0, theirs0] = [spellCost(s, ap, s.objects[ids[0]!]!).extra, spellCost(s, opp, s.objects[theirs]!).extra];
    putOnBattlefield(s, ap, grid);
    expect(spellCost(s, ap, s.objects[ids[0]!]!).extra).toBe(mine0);
    expect(spellCost(s, opp, s.objects[theirs]!).extra).toBe(theirs0 + 3);
  });
});

describe("Nasty End", () => {
  it("draws two, or three if the sacrificed creature was legendary", () => {
    supported(nasty);
    for (const [def, n] of [[bear(), 2], [legend, 3]] as const) {
      const { s: s0, ap, ids } = setup([nasty]);
      let s = s0;
      const fodder = putOnBattlefield(s, ap, def);
      const before = hand(s, ap);
      s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", 0, { sacrifice: [fodder] })));
      expect(s.objects[fodder]!.zone).toBe("graveyard");
      expect(hand(s, ap)).toBe(before - 1 + n);
    }
  });
});

describe("Inti, Seneschal of the Sun", () => {
  it("a discard exiles your top card, and you may play it", () => {
    supported(inti);
    const { s: s0, ap, ids } = setup([loot, shock]);
    let s = s0;
    putOnBattlefield(s, ap, inti);
    s = settle(cast(s, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "discard", player: ap });
    s = act(s, { type: "discard", player: ap, objectIds: [ids[1]!] });
    const top = s.players[ap]!.library[0]!;
    s = settle(s);
    expect(s.objects[top]!.zone).toBe("exile");
    expect(s.objects[top]!.mayPlay).toBeDefined();
  });
});

describe("Teferi's Puzzle Box", () => {
  it("each player's draw step: their hand goes to the bottom in their order, then they draw that many", () => {
    supported(box);
    const { s: s0, ap } = setup([]);
    let s = s0;
    putOnBattlefield(s, ap, box);
    const opp = next(s, ap);
    const old = [...s.players[opp]!.hand];
    expect(old.length).toBeGreaterThan(1);
    s = passUntil(s, "upkeep", opp);
    for (let i = 0; i < 40 && s.pending?.kind !== "arrangeTop"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "bottom", player: opp });
    // The turn's draw comes first (CR 504.1), so that card goes too.
    const cards = (s.pending as { cards: string[] }).cards;
    expect(cards).toHaveLength(old.length + 1);
    expect(cards).toEqual(expect.arrayContaining(old));
    const order = [...cards].reverse();
    s = settle(act(s, { type: "arrangeTop", player: opp, top: order, away: [] }));
    expect(hand(s, opp)).toBe(cards.length);
    expect(s.players[opp]!.library.slice(-cards.length)).toEqual(order);
    for (const id of cards) expect(s.objects[id]!.zone).toBe("library");
  });
});

describe("Angel's Grace", () => {
  it("damage leaves you at 1 this turn", () => {
    supported(grace);
    const { s: s0, ap, ids } = setup([grace, blast, blast]);
    let s = s0;
    s = settle(cast(s, ap, ids[0]!));
    s = settle(cast(s, ap, ids[1]!, [{ kind: "player", id: ap }]));
    expect(s.players[ap]!.life).toBe(1);
    expect(s.players[ap]!.lost).toBeFalsy();
  });
});

describe("Magister Sphinx", () => {
  it("the target player's life total becomes 10: they lose or gain the difference", () => {
    supported(sphinx);
    const { s: s0, ap, ids } = setup([sphinx, sphinx]);
    let s = s0;
    const opp = next(s, ap);
    s = settle(cast(s, ap, ids[0]!));
    expect(s.pending?.kind).toBe("chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.life).toBe(10);
    s.players[ap]!.life = 3;
    s = settle(cast(s, ap, ids[1]!));
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: ap }] }));
    expect(s.players[ap]!.life).toBe(10);
    expect(s.log.some((l) => /life total becomes 10/.test(l.text))).toBe(true);
  });
});

describe("Crag Saurian", () => {
  it("the controller of the source that damaged it gains control of it", () => {
    supported(saurian);
    const { s: s0, ap, ids } = setup([shock]);
    let s = s0;
    const opp = next(s, ap);
    const c = putOnBattlefield(s, opp, saurian);
    s = settle(cast(s, ap, ids[0]!, [target(c)]));
    expect(controllerOf(s, s.objects[c]!)).toBe(ap);
  });
});
