// Round 118: round 117's rules gaps (Odric with a block tax, Agitator Ant's choices before counters, Dionus's granted
// ability after Dionus leaves and returns), then the most played cards.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passAll, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, planMana, waitingOn, type Action, type GameState, type PlayerId } from "../src";
import { moveObject, tapPermanent } from "../src/game";
import { parseManaCost } from "../src/mana";
import { characteristics } from "../src/layers";

const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const later = (s: GameState, ap: PlayerId, n: number) => s.turnOrder[(s.turnOrder.indexOf(ap) + n) % 4]!;

// Real oracle text (Scryfall).
const dionus = card("Dionus, Elvish Archdruid", "Legendary Creature — Elf Druid", "{3}{G}", {
  power: "3",
  toughness: "3",
  oracleText: 'Elves you control have "Whenever this creature becomes tapped during your turn, untap it and put a +1/+1 counter on it. This ability triggers only once each turn."',
});
const elf = card("Llanowar Elves", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1", oracleText: "{T}: Add {G}." });
const ant = card("Agitator Ant", "Creature — Insect", "{2}{R}", {
  power: "2",
  toughness: "2",
  keywords: ["Goad"],
  oracleText:
    "At the beginning of your end step, each player may put two +1/+1 counters on a creature they control. Goad each creature that had counters put on it this way. (Until your next turn, those creatures attack each combat if able and attack a player other than you if able.)",
});
const odric = card("Odric, Master Tactician", "Legendary Creature — Human Soldier", "{2}{W}{W}", {
  power: "3",
  toughness: "4",
  keywords: ["First strike"],
  oracleText:
    "First strike (This creature deals combat damage before creatures without first strike.)\nWhenever Odric and at least three other creatures attack, you choose which creatures block this combat and how those creatures block.",
});
const archangel = card("Archangel of Tithes", "Creature — Angel", "{1}{W}{W}{W}", {
  power: "3",
  toughness: "5",
  keywords: ["Flying"],
  oracleText:
    "Flying\nAs long as this creature is untapped, creatures can't attack you or planeswalkers you control unless their controller pays {1} for each of those creatures.\nAs long as this creature is attacking, creatures can't block unless their controller pays {1} for each of those creatures.",
});

describe("round 117 gaps", () => {
  it("Dionus that leaves and returns grants a new ability: an Elf that used the old one triggers again that turn", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const d = putOnBattlefield(s, ap, dionus);
    const e = putOnBattlefield(s, ap, elf);
    tapPermanent(s, s.objects[e]!);
    s = settle(passAll(s));
    expect(s.objects[e]!.counters["+1/+1"]).toBe(1);
    // Dionus blinks (CR 400.7): its ability is a new one (rulings).
    moveObject(s, d, "exile");
    moveObject(s, d, "battlefield");
    tapPermanent(s, s.objects[e]!);
    s = settle(passAll(s));
    expect(s.objects[e]!.tapped).toBe(false);
    expect(s.objects[e]!.counters["+1/+1"]).toBe(2);
    // And that one triggers only once too.
    tapPermanent(s, s.objects[e]!);
    s = settle(passAll(s));
    expect(s.objects[e]!.tapped).toBe(true);
    expect(s.objects[e]!.counters["+1/+1"]).toBe(2);
  });

  it("Agitator Ant: a bot chooses its best creature; one with no creature isn't asked; counters come after every choice", () => {
    expect(isFullySupported(ant)).toBe(true);
    const { s: s0, ap } = setup([]);
    let s = s0;
    const [b, c] = [later(s, ap, 1), later(s, ap, 2)];
    putOnBattlefield(s, ap, ant);
    const small = putOnBattlefield(s, b, bear({ name: "B Bear" }));
    const big = putOnBattlefield(s, b, card("B Giant", "Creature — Giant", "{4}{R}", { power: "5", toughness: "5" }));
    const cb = putOnBattlefield(s, c, bear({ name: "C Bear" }));
    s = settle(passUntil(s, "end", ap));
    // The Ant's controller first (its own Ant is a creature they control).
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "vote", player: ap });
    s = act(s, { type: "chooseOption", player: ap, choice: "none" });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "vote", player: b });
    const pick = botActions(s, b)[0] as Extract<Action, { type: "chooseOption" }>;
    expect(pick.choice.startsWith(`${big}@`)).toBe(true);
    s = act(s, pick);
    expect(s.objects[big]!.counters["+1/+1"] ?? 0).toBe(0);
    // The fourth player has no creature: no question; the counters come after the third player's choice.
    s = act(s, { type: "chooseOption", player: c, choice: (s.pending as { options: string[] }).options.find((o) => o.startsWith(`${cb}@`))! });
    s = settle(s);
    expect(s.objects[big]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[cb]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[small]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(characteristics(s, s.objects[big]!).goadedBy).toContain(ap);
    expect(characteristics(s, s.objects[cb]!).goadedBy).toContain(ap);
  });

  describe("Odric with a block tax", () => {
    /** Ap attacks opp with Odric, the Archangel and two Bears; opp has a Wall and two Forests. */
    const attack = () => {
      const { s: s0, ap, opp } = setup([]);
      let s = s0;
      const o = putOnBattlefield(s, ap, odric);
      const angel = putOnBattlefield(s, ap, archangel);
      const bears = [0, 1].map((i) => putOnBattlefield(s, ap, bear({ name: `Bear ${i}` })));
      const wall = putOnBattlefield(s, opp, card("Wall", "Creature — Wall", "{1}", { power: "0", toughness: "4", keywords: ["Defender"], oracleText: "Defender" }));
      for (let i = 0; i < 2; i++) putOnBattlefield(s, opp, forest);
      s = passUntil(s, "declareAttackers", ap);
      s = act(s, { type: "declareAttackers", player: ap, attacks: [o, angel, ...bears].map((attacker) => ({ attacker, defender: opp })) });
      s = settle(s);
      s = passUntil(s, "declareBlockers", ap);
      return { s, ap, opp, bears, wall };
    };

    it("Odric's controller may choose blocks that cost mana; the blocking player decides whether to pay", () => {
      expect(isFullySupported(odric)).toBe(true);
      let { s, ap, opp, bears, wall } = attack();
      expect(s.pending).toMatchObject({ kind: "declareBlockers", player: ap, defender: opp });
      const blocks = [{ blocker: wall, attacker: bears[0]! }];
      s = act(s, { type: "declareBlockers", player: ap, blocks });
      expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp, pay: { mana: "{1}" } });
      // They don't pay: Odric's controller proposes again (rulings).
      s = act(s, { type: "chooseMay", player: opp, yes: false });
      expect(s.pending).toEqual({ kind: "declareBlockers", player: ap, remaining: [], defender: opp });
      expect(s.objects[wall]!.blocking).toBeUndefined();
      s = act(s, { type: "declareBlockers", player: ap, blocks });
      // Now they pay, with a Forest's mana.
      expect(() => act(s, { type: "chooseMay", player: opp, yes: true })).toThrow(/mana/);
      s = [...planMana(s, opp, parseManaCost("{1}"))!, { type: "chooseMay", player: opp, yes: true } as Action].reduce(act, s);
      expect(s.objects[wall]!.blocking).toEqual([bears[0]!]);
      expect(s.pending).toBeNull();
      expect(s.log.some((l) => /pays \{1\} to block/.test(l.text))).toBe(true);
    });

    it("a bot blocking player doesn't pay for the blocks chosen for it; a bot choosing for another chooses none", () => {
      let { s, ap, opp, bears, wall } = attack();
      expect(botActions(s, ap)).toEqual([{ type: "declareBlockers", player: ap, blocks: [] }]);
      s = act(s, { type: "declareBlockers", player: ap, blocks: [{ blocker: wall, attacker: bears[1]! }] });
      expect(botActions(s, opp)).toEqual([{ type: "chooseMay", player: opp, yes: false }]);
    });
  });
});
