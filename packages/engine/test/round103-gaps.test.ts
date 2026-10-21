// Round 103, older gaps: "spells you cast cost {1} less for each ..." (Herald of War, Animar), Teferi, Mage of Zhalfir's
// flash for creature cards you own (CR 702.8a), Lurrus of the Dream-Den (companion works only outside the game, CR
// 702.139a; "a permanent spell with mana value 2 or less" counts the spell's X, CR 202.3e).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { castProblem, isFullySupported, planCast, spellCost, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const herald = card("Herald of War", "Creature — Angel", "{3}{W}{W}", { power: "3", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nWhenever this creature attacks, put a +1/+1 counter on it.\nAngel spells and Human spells you cast cost {1} less to cast for each +1/+1 counter on this creature." });
const animar = card("Animar, Soul of Elements", "Legendary Creature — Elemental", "{G}{U}{R}", { power: "1", toughness: "1", keywords: ["Protection"], oracleText: "Protection from white and from black\nWhenever you cast a creature spell, put a +1/+1 counter on Animar.\nCreature spells you cast cost {1} less to cast for each +1/+1 counter on Animar." });
const teferi = card("Teferi, Mage of Zhalfir", "Legendary Creature — Human Wizard", "{2}{U}{U}{U}", { power: "3", toughness: "4", keywords: ["Flash"], oracleText: "Flash\nCreature cards you own that aren't on the battlefield have flash.\nEach opponent can cast spells only any time they could cast a sorcery." });
const lurrus = card("Lurrus of the Dream-Den", "Legendary Creature — Cat Nightmare", "{1}{W/B}{W/B}", { power: "3", toughness: "2", keywords: ["Lifelink", "Companion"], oracleText: "Companion — Each permanent card in your starting deck has mana value 2 or less. (If this card is your chosen companion, you may put it into your hand from outside the game for {3} as a sorcery.)\nLifelink\nOnce during each of your turns, you may cast a permanent spell with mana value 2 or less from your graveyard." });
const ballista = card("Walking Ballista", "Artifact Creature — Construct", "{X}{X}", { power: "0", toughness: "0", oracleText: "This creature enters with X +1/+1 counters on it.\n{4}: Put a +1/+1 counter on this creature.\nRemove a +1/+1 counter from this creature: It deals 1 damage to any target." });

const angel = card("Serra Angel", "Creature — Angel", "{3}{W}{W}", { power: "4", toughness: "4", keywords: ["Flying", "Vigilance"], oracleText: "Flying, vigilance" });
const bear = card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });
const ogre = card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" });

const run = (s: GameState, plan: ReturnType<typeof planCast>) => plan!.reduce((x, a) => act(x, a), s);
const toYard = (s: GameState, pid: number, def: ReturnType<typeof card>) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};
const via = { via: "turnPermission" as const };

describe("round 103: older gaps", () => {
  it("parse", () => [herald, animar, teferi, lurrus].forEach((d) => expect(isFullySupported(d), d.name).toBe(true)));

  it("Herald of War: Angel spells cost {1} less for each +1/+1 counter on it; other spells don't", () => {
    const { s, ap, ids } = setup([angel, bear]);
    const h = putOnBattlefield(s, ap, herald);
    const extra = (i: number) => spellCost(s, ap, s.objects[ids[i]!]!).extra;
    const [a0, b0] = [extra(0), extra(1)];
    s.objects[h]!.counters = { "+1/+1": 2 };
    expect(a0 - extra(0)).toBe(2);
    expect(b0 - extra(1)).toBe(0);
  });

  it("Animar: creature spells cost {1} less for each +1/+1 counter on it", () => {
    const { s, ap, ids } = setup([ogre]);
    const a = putOnBattlefield(s, ap, animar);
    const before = spellCost(s, ap, s.objects[ids[0]!]!).extra;
    s.objects[a]!.counters = { "+1/+1": 3 };
    expect(before - spellCost(s, ap, s.objects[ids[0]!]!).extra).toBe(3);
  });

  it("Teferi, Mage of Zhalfir: your creature cards can be cast any time you could cast an instant", () => {
    const { s: s0, ap, ids } = setup([bear]);
    // On an opponent's turn, with priority.
    const opp = s0.turnOrder.find((p) => p !== ap)!;
    s0.activePlayer = opp;
    s0.priority = ap;
    expect(castProblem(s0, ap, ids[0]!)).toMatch(/sorcery speed/);
    // Another player's Teferi doesn't give your cards flash (and holds you to sorcery timing).
    const theirs = putOnBattlefield(s0, opp, teferi);
    expect(castProblem(s0, ap, ids[0]!)).toMatch(/opponents can/);
    s0.battlefield.splice(s0.battlefield.indexOf(theirs), 1);
    putOnBattlefield(s0, ap, teferi);
    // Only the mana in the pool is checked here: the timing is fine.
    expect(castProblem(s0, ap, ids[0]!)).toMatch(/not enough mana/);
  });

  it("Lurrus: once each turn, a permanent spell with mana value 2 or less from your graveyard, the X counted", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, lurrus);
    const b = toYard(s0, ap, ballista);
    const g = toYard(s0, ap, ogre);
    const e = toYard(s0, ap, bear);
    expect(castProblem(s0, ap, g, undefined, undefined, undefined, undefined, undefined, via)).not.toBeNull();
    // Walking Ballista for X=1 has mana value 2; for X=2, 4.
    expect(castProblem(s0, ap, b, undefined, undefined, undefined, undefined, 2, via)).toMatch(/too high/);
    expect(planCast(s0, ap, b, undefined, undefined, "auto", 1, via)).not.toBeNull();
    let s = run(s0, planCast(s0, ap, b, undefined, undefined, "auto", 1, via));
    expect(s.objects[b]!.zone).toBe("stack");
    for (let i = 0; i < 20 && s.stack.length && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    // Used for this turn.
    expect(castProblem(s, ap, e, undefined, undefined, undefined, undefined, undefined, via)).not.toBeNull();
  });
});
