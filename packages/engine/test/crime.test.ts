// Committing a crime (CR 700.13): casting a spell, activating an ability or putting a triggered ability on the stack
// that targets an opponent, anything an opponent controls, or a card in an opponent's graveyard. Once per spell or
// ability, however many such targets it has; "whenever you commit a crime" works from the graveyard too (Forsaken
// Miner's rulings), and "if you've committed a crime this turn" lasts the turn.

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, pt, putOnBattlefield, setup, target } from "./helpers";
import { blockProblem, compileCard, isFullySupported, manaValue, parseManaCost, planActivate, planCast, planMana, spellCost, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const hustler = card("Blood Hustler", "Creature — Vampire Rogue", "{B}", { power: "1", toughness: "1", oracleText: "Whenever you commit a crime, put a +1/+1 counter on this creature. This ability triggers only once each turn. (Targeting opponents, anything they control, and/or cards in their graveyards is a crime.)\n{3}{B}: Target opponent loses 1 life and you gain 1 life." });
const miner = card("Forsaken Miner", "Creature — Skeleton Rogue", "{B}", { power: "2", toughness: "2", oracleText: "This creature can't block.\nWhenever you commit a crime, you may pay {B}. If you do, return this card from your graveyard to the battlefield. (Targeting opponents, anything they control, and/or cards in their graveyards is a crime.)" });
const brigand = card("Nimble Brigand", "Creature — Human Rogue", "{2}{U}", { power: "3", toughness: "2", oracleText: "This creature can't be blocked if you've committed a crime this turn. (Targeting opponents, anything they control, and/or cards in their graveyards is a crime.)\nWhenever this creature deals combat damage to a player, draw a card." });
const peacemaker = card("Patrolling Peacemaker", "Creature — Human Soldier", "{2}{W}", { power: "0", toughness: "0", oracleText: "This creature enters with two +1/+1 counters on it.\nWhenever an opponent commits a crime, proliferate. (They commit a crime if they target an opponent, anything an opponent controls, and/or cards in an opponent's graveyard. To proliferate, you choose any number of permanents and/or players, then give each another counter of each kind already there.)" });
const secrets = card("Seize the Secrets", "Sorcery", "{2}{U}", { oracleText: "This spell costs {1} less to cast if you've committed a crime this turn. (Targeting opponents, anything they control, and/or cards in their graveyards is a crime.)\nDraw two cards." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const claws = card("Scrabbling Claws", "Artifact", "{1}", { oracleText: "{T}: Target player discards a card.\n{1}, Sacrifice this artifact: Exile target card from a graveyard. Draw a card." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const counters = (s: GameState, id: string) => s.objects[id]!.counters["+1/+1"] ?? 0;
function inGraveyard(s: GameState, pid: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
}
/** Resolve everything on the stack, answering "you may pay" with `yes`. */
function settle(s: GameState, yes = true) {
  for (let i = 0; i < 40 && (s.stack.length || s.pending); i++) {
    if (s.pending?.kind === "chooseMay") {
      const pend = s.pending;
      if (yes && pend.pay?.mana) for (const a of planMana(s, pend.player, parseManaCost(pend.pay.mana))!) s = act(s, a);
      s = act(s, { type: "chooseMay", player: pend.player, yes });
    }
    else s = passAll(s);
  }
  return s;
}

describe("committing a crime", () => {
  it("compiles them", () => {
    supported(hustler, miner, brigand, peacemaker, secrets);
    expect(compileCard(hustler).triggers[0]).toMatchObject({ event: "youCommitCrime", oncePerTurn: true });
    expect(compileCard(miner).triggers[0]).toMatchObject({ event: "youCommitCrime", zone: "graveyard" });
  });

  it("targeting an opponent's creature is a crime, your own creature isn't; Blood Hustler grows once a turn", () => {
    let { s, ap, ids, opp } = setup([shock, shock, shock]);
    const h = putOnBattlefield(s, ap, hustler);
    const mine = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, bear());
    s = settle(cast(s, ap, ids[0]!, [target(mine)]));
    expect(counters(s, h)).toBe(0);
    expect(s.players[ap]!.crimeTurn).toBeUndefined();
    for (const a of planCast(s, ap, ids[1]!, [target(theirs)])!) s = act(s, a);
    // It triggers as the spell is cast, above it on the stack.
    expect(s.stack).toHaveLength(2);
    s = settle(s);
    expect(counters(s, h)).toBe(1);
    expect(s.players[ap]!.crimeTurn).toBe(s.turn);
    // Targeting an opponent is one too, but it triggers only once each turn.
    s = settle(cast(s, ap, ids[2]!, [{ kind: "player", id: opp }]));
    expect(counters(s, h)).toBe(1);
  });

  it("Blood Hustler's own ability targeting an opponent is a crime", () => {
    let { s, ap, opp } = setup([]);
    const h = putOnBattlefield(s, ap, hustler);
    for (const a of planActivate(s, ap, h, 0, [{ kind: "player", id: opp }])!) s = act(s, a);
    s = settle(s);
    expect(counters(s, h)).toBe(1);
  });

  it("targeting a card in an opponent's graveyard is a crime, in your own it isn't", () => {
    let { s, ap, opp } = setup([]);
    const c1 = putOnBattlefield(s, ap, claws);
    const c2 = putOnBattlefield(s, ap, claws);
    const h = putOnBattlefield(s, ap, hustler);
    const mineDead = inGraveyard(s, ap, bear());
    const theirDead = inGraveyard(s, opp, bear());
    for (const a of planActivate(s, ap, c1, 1, [target(mineDead)])!) s = act(s, a);
    s = settle(s);
    expect(counters(s, h)).toBe(0);
    for (const a of planActivate(s, ap, c2, 1, [target(theirDead)])!) s = act(s, a);
    s = settle(s);
    expect(counters(s, h)).toBe(1);
  });

  it("Forsaken Miner returns from the graveyard for {B}; Patrolling Peacemaker proliferates when an opponent does it", () => {
    let { s, ap, ids, opp } = setup([shock]);
    const m = inGraveyard(s, ap, miner);
    const p = putOnBattlefield(s, opp, peacemaker);
    s.objects[p]!.counters["+1/+1"] = 2;
    const theirs = putOnBattlefield(s, opp, bear());
    s = settle(cast(s, ap, ids[0]!, [target(theirs)]));
    expect(s.objects[m]!.zone).toBe("battlefield");
    expect(counters(s, p)).toBe(3);
    expect(pt(s, p)).toBe("3/3");
  });

  it("Nimble Brigand can't be blocked and Seize the Secrets costs {1} less after a crime this turn", () => {
    let { s, ap, ids, opp } = setup([secrets, shock]);
    const b = putOnBattlefield(s, ap, brigand);
    const blocker = putOnBattlefield(s, opp, bear());
    s.objects[b]!.attacking = opp;
    expect(blockProblem(s, s.objects[blocker]!, s.objects[b]!)).toBeNull();
    const total = (t: GameState) => {
      const c = spellCost(t, ap, t.objects[ids[0]!]!);
      return manaValue(c.cost) + c.extra;
    };
    expect(total(s)).toBe(3);
    s = settle(cast(s, ap, ids[1]!, [{ kind: "player", id: opp }]));
    expect(blockProblem(s, s.objects[blocker]!, s.objects[b]!)).not.toBeNull();
    expect(total(s)).toBe(2);
  });
});

