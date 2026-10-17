// "Your team" is "you" in a game that isn't between teams (CR 102.4), and "you may return target creature to its owner's
// hand if that creature's power is less than or equal to ..." (Nimbus Champion): compared as it resolves, asked only if
// it holds.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, objHasKeyword, waitingOn, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

// Real oracle text (Scryfall).
const nimbus = card("Nimbus Champion", "Creature — Avatar Warrior", "{5}{U}", { power: "4", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nWhenever this creature attacks, you may return target creature to its owner's hand if that creature's power is less than or equal to the number of Warriors your team controls." });
const rushblade = card("Rushblade Commander", "Creature — Azra Warrior", "{B}{R}", { power: "2", toughness: "2", oracleText: "Warriors your team controls have haste." });
const sickle = card("Sickle Dancer", "Creature — Human Warrior", "{2}{B}", { power: "3", toughness: "2", oracleText: "Whenever this creature attacks, if your team controls another Warrior, this creature gets +1/+1 until end of turn." });
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3" });

describe("your team", () => {
  it("parse", () => supported(nimbus, rushblade, sickle));

  it("Rushblade Commander: your Warriors have haste, not an opponent's", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, rushblade);
    const mine = putOnBattlefield(s, ap, sickle);
    const theirs = putOnBattlefield(s, opp, sickle);
    expect([objHasKeyword(s, s.objects[mine]!, "Haste"), objHasKeyword(s, s.objects[theirs]!, "Haste")]).toEqual([true, false]);
  });

  it("Nimbus Champion: power 2 is returned with two Warriors; power 3 isn't, and nothing is asked", () => {
    for (const [def, back] of [[bear(), true], [ogre, false]] as const) {
      const { s: s0, ap, opp } = setup([]);
      const n = putOnBattlefield(s0, ap, nimbus);
      putOnBattlefield(s0, ap, rushblade);
      const victim = putOnBattlefield(s0, opp, def);
      let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: n, defender: opp }] });
      s = settle(s);
      if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(victim)] }));
      if (back) {
        expect(s.pending).toMatchObject({ kind: "chooseMay" });
        s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
      } else expect(s.pending).toBeFalsy();
      expect(s.objects[victim]!.zone).toBe(back ? "hand" : "battlefield");
    }
  });
});
