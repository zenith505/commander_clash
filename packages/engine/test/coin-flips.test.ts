// Flipping a coin (CR 705): its controller wins or loses the flip, an even chance; "If you win the flip, ..." and "If you
// lose the flip, ..." go by that flip, and neither happens if no coin was flipped ("you may flip a coin"). "Flip a coin
// until you lose a flip" counts the wins. "Whenever you win a coin flip": once for each flip won.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState } from "../src";
import { nextRandom } from "../src/rng";
import { pt } from "./helpers";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Sets the game's random state so the next flips come out as `wins` (true: won). */
function rig(s: GameState, ...wins: boolean[]) {
  for (let x = 1; x < 1_000_000; x++) {
    const r = { rngState: x };
    if (wins.every((w) => nextRandom(r) < 0.5 === w)) {
      s.rngState = x;
      return;
    }
  }
  throw new Error("no such state");
}

// Real oracle text (Scryfall).
const captain = card("Orcish Captain", "Creature — Orc Warrior", "{R}", { power: "1", toughness: "1", oracleText: "{1}: Flip a coin. If you win the flip, target Orc creature gets +2/+0 until end of turn. If you lose the flip, it gets -0/-2 until end of turn." });
const firecat = card("Crazed Firecat", "Creature — Elemental Cat", "{5}{R}{R}", { power: "4", toughness: "4", oracleText: "When this creature enters, flip a coin until you lose a flip. Put a +1/+1 counter on this creature for each flip you won." });
const scoundrel = card("Tavern Scoundrel", "Creature — Human Rogue", "{1}{R}", { power: "1", toughness: "3", oracleText: 'Whenever you win a coin flip, create two Treasure tokens. (They\'re artifacts with "{T}, Sacrifice this token: Add one mana of any color.")\n{1}, {T}, Sacrifice another permanent: Flip a coin.' });
const zndrsplt = card("Zndrsplt, Eye of Wisdom", "Legendary Creature — Homunculus", "{4}{U}", { power: "1", toughness: "4", keywords: ["Partner with", "Partner"], oracleText: "Partner with Okaun, Eye of Chaos (When this creature enters, target player may put Okaun into their hand from their library, then shuffle.)\nAt the beginning of combat on your turn, flip a coin until you lose a flip.\nWhenever a player wins a coin flip, draw a card." });
const goo = card("Chaotic Goo", "Creature — Ooze", "{2}{R}{R}", { power: "0", toughness: "0", oracleText: "This creature enters with three +1/+1 counters on it.\nAt the beginning of your upkeep, you may flip a coin. If you win the flip, put a +1/+1 counter on this creature. If you lose the flip, remove a +1/+1 counter from this creature." });
const maneuvers = card("Impulsive Maneuvers", "Enchantment", "{2}{R}{R}", { oracleText: "Whenever a creature attacks, flip a coin. If you win the flip, the next time that creature would deal combat damage this turn, it deals double that damage instead. If you lose the flip, the next time that creature would deal combat damage this turn, prevent that damage." });
const bottle = card("Bottle of Suleiman", "Artifact", "{4}", { oracleText: "{1}, Sacrifice this artifact: Flip a coin. If you win the flip, create a 5/5 colorless Djinn artifact creature token with flying. If you lose the flip, this artifact deals 5 damage to you." });
const moltenBirth = card("Molten Birth", "Sorcery", "{1}{R}{R}", { oracleText: "Create two 1/1 red Elemental creature tokens, then flip a coin. If you win the flip, return Molten Birth to its owner's hand." });
const efreet = card("Frenetic Efreet", "Creature — Efreet", "{1}{U}{R}", { power: "2", toughness: "1", keywords: ["Flying"], oracleText: "Flying\n{0}: Flip a coin. If you win the flip, this creature phases out. If you lose the flip, sacrifice this creature. (While it's phased out, it's treated as though it doesn't exist. It phases in before you untap during your next untap step.)" });
const bear = card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });

describe("flip a coin", () => {
  it("parse", () => supported(captain, firecat, scoundrel, zndrsplt, goo, maneuvers, bottle, moltenBirth, efreet));

  for (const won of [true, false])
    it(`Orcish Captain: ${won ? "won, +2/+0" : "lost, -0/-2"}`, () => {
      const { s: s0, ap } = setup([]);
      const c = putOnBattlefield(s0, ap, captain);
      const orc = putOnBattlefield(s0, ap, card("Test Orc", "Creature — Orc", "{2}", { power: "2", toughness: "3" }));
      let s = run(s0, planActivate(s0, ap, c, 0, [{ kind: "object", id: orc }]));
      rig(s, won);
      s = settle(s);
      expect(pt(s, orc)).toBe(won ? "4/3" : "2/1");
    });

  it("Bottle of Suleiman: lost, it deals 5 damage to you; won, a 5/5 Djinn", () => {
    for (const won of [true, false]) {
      const { s: s0, ap } = setup([]);
      const b = putOnBattlefield(s0, ap, bottle);
      let s = run(s0, planActivate(s0, ap, b, 0));
      const life = s.players[ap]!.life;
      rig(s, won);
      s = settle(s);
      const djinn = s.battlefield.some((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap);
      expect(djinn).toBe(won);
      expect(s.players[ap]!.life).toBe(won ? life : life - 5);
    }
  });

  it("Molten Birth returns to its owner's hand only if the flip is won", () => {
    for (const won of [true, false]) {
      const { s: s0, ap, ids } = setup([moltenBirth]);
      let s = run(s0, planCast(s0, ap, ids[0]!));
      rig(s, won);
      s = settle(s);
      expect(s.objects[ids[0]!]!.zone).toBe(won ? "hand" : "graveyard");
    }
  });

  it("Frenetic Efreet: won, it phases out; lost, it's sacrificed", () => {
    for (const won of [true, false]) {
      const { s: s0, ap } = setup([]);
      const e = putOnBattlefield(s0, ap, efreet);
      let s = run(s0, planActivate(s0, ap, e, 0));
      rig(s, won);
      s = settle(s);
      if (won) expect(s.objects[e]!.zone).toBe("phasedOut");
      else expect(s.objects[e]!.zone).toBe("graveyard");
    }
  });

  it("Crazed Firecat: a +1/+1 counter for each flip won before the first loss", () => {
    const { s: s0, ap, ids } = setup([firecat]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 6 && s.objects[ids[0]!]!.zone !== "battlefield"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    rig(s, true, true, true, false);
    s = settle(s);
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(3);
  });

  it("Chaotic Goo: declining the flip does neither", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, goo);
    s0.objects[g]!.counters["+1/+1"] = 3;
    let s = s0;
    for (let i = 0; i < 400 && !(s.pending?.kind === "chooseMay" && s.pending.player === ap); i++) {
      const pid = waitingOn(s)!;
      const pend = s.pending;
      if (pend?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
      else if (pend?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
      else if (pend?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, pend.count) });
      else if (pend?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: pid, yes: false });
      else s = act(s, { type: "passPriority", player: pid });
    }
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    const no = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(no.objects[g]!.counters["+1/+1"]).toBe(3);
    rig(s, true);
    const yes = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(yes.objects[g]!.counters["+1/+1"]).toBe(4);
  });
});

describe("whenever you win a coin flip", () => {
  it("Tavern Scoundrel: two Treasures for a won flip, none for a lost one", () => {
    for (const won of [true, false]) {
      const { s: s0, ap } = setup([]);
      const sc = putOnBattlefield(s0, ap, scoundrel);
      const fodder = putOnBattlefield(s0, ap, bear);
      let s = run(s0, planActivate(s0, ap, sc, 0, undefined, undefined, undefined, undefined, { sacrifice: [fodder] }));
      rig(s, won);
      s = settle(s);
      const treasures = s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap).length;
      expect(treasures).toBe(won ? 2 : 0);
    }
  });

  it("Zndrsplt: flips until it loses at the beginning of combat, and draws a card for each win", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, zndrsplt);
    let s = passUntil(s0, "beginCombat", ap);
    const hand = s.players[ap]!.hand.length;
    rig(s, true, true, false);
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("Impulsive Maneuvers: won, the attacker's combat damage is doubled", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, maneuvers);
    const b = putOnBattlefield(s0, ap, bear);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    rig(s, true);
    s = settle(s);
    const life = s.players[opp]!.life;
    s = passUntil(s, "endCombat", ap);
    expect(s.players[opp]!.life).toBe(life - 4);
  });
});
