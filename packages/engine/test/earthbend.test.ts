// Earthbend N (CR 701.66): target land you control becomes a 0/0 land creature with haste, gets N +1/+1 counters, and
// comes back tapped when it dies or is exiled.

import { describe, expect, it } from "vitest";
import { act, card, cast, putOnBattlefield, setup, target, pt } from "./helpers";
import { botActions, characteristics, isFullySupported, objHasKeyword, objIsType, waitingOn, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));

// Real oracle text (Scryfall).
const earthbendingLesson = card("Earthbending Lesson", "Sorcery — Lesson", "{3}{G}", { keywords: ["Earthbend"], oracleText: "Earthbend 4. (Target land you control becomes a 0/0 creature with haste that's still a land. Put four +1/+1 counters on it. When it dies or is exiled, return it to the battlefield tapped.)" });
const crackedEarth = card("Cracked Earth Technique", "Sorcery — Lesson", "{4}{G}", { keywords: ["Earthbend"], oracleText: "Earthbend 3, then earthbend 3. You gain 3 life. (To earthbend 3, target land you control becomes a 0/0 creature with haste that's still a land. Put three +1/+1 counters on it. When it dies or is exiled, return it to the battlefield tapped.)" });
const earthbendingStudent = card("Earthbending Student", "Creature — Human Warrior Ally", "{2}{G}", { power: "1", toughness: "3", keywords: ["Earthbend"], oracleText: "When this creature enters, earthbend 2. (Target land you control becomes a 0/0 creature with haste that's still a land. Put two +1/+1 counters on it. When it dies or is exiled, return it to the battlefield tapped.)\nLand creatures you control have vigilance. (Attacking doesn't cause them to tap.)" });
const rockalanche = card("Rockalanche", "Sorcery — Lesson", "{2}{G}", { keywords: ["Earthbend", "Flashback"], oracleText: "Earthbend X, where X is the number of Forests you control. (Target land you control becomes a 0/0 creature with haste that's still a land. Put X +1/+1 counters on it. When it dies or is exiled, return it to the battlefield tapped.)\nFlashback {5}{G} (You may cast this card from your graveyard for its flashback cost. Then exile it.)" });
const murder = card("Annihilate", "Instant", "{1}", { oracleText: "Destroy target creature." });
const pathToExile = card("Swords to Plowshares", "Instant", "{1}", { oracleText: "Exile target creature. Its controller gains life equal to its power." });
const unsummon = card("Unsummon", "Instant", "{1}", { oracleText: "Return target creature to its owner's hand." });
const wastes = card("Wastes", "Basic Land");

/** Resolve everything on the stack, answering nothing. */
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && s.stack.length && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("earthbend", () => {
  it("makes the target land a 0/0 land creature with haste and N +1/+1 counters (CR 701.66a)", () => {
    supported(earthbendingLesson, crackedEarth, earthbendingStudent, rockalanche);
    const { s: s0, ap, ids } = setup([earthbendingLesson]);
    const land = putOnBattlefield(s0, ap, wastes);
    const s = cast(s0, ap, ids[0]!, [target(land)]);
    const o = s.objects[land]!;
    expect(objIsType(s, o, "Creature")).toBe(true);
    expect(objIsType(s, o, "Land")).toBe(true);
    expect(objHasKeyword(s, o, "Haste")).toBe(true);
    expect(pt(s, land)).toBe("4/4");
    expect(characteristics(s, o).colors).toEqual([]);
  });

  it("returns the land tapped when it dies or is exiled, as a new land (not a creature)", () => {
    for (const removal of [murder, pathToExile]) {
      const { s: s0, ap, ids } = setup([earthbendingLesson, removal]);
      const land = putOnBattlefield(s0, ap, wastes);
      let s = cast(s0, ap, ids[0]!, [target(land)]);
      s = cast(s, ap, ids[1]!, [target(land)]);
      s = settle(s);
      const o = s.objects[land]!;
      expect(o.zone).toBe("battlefield");
      expect(o.zoneChanges).toBe(2); // it left and came back: a new object (CR 400.7)
      expect(o.tapped).toBe(true);
      expect(objIsType(s, o, "Creature")).toBe(false);
      expect(o.counters["+1/+1"] ?? 0).toBe(0);
    }
  });

  it("doesn't return it from anywhere else, and only once", () => {
    const { s: s0, ap, ids } = setup([earthbendingLesson, unsummon, murder]);
    const land = putOnBattlefield(s0, ap, wastes);
    let s = cast(s0, ap, ids[0]!, [target(land)]);
    s = settle(cast(s, ap, ids[1]!, [target(land)]));
    expect(s.objects[land]!.zone).toBe("hand");
    expect((s.delayed ?? []).some((d) => d.when === "leaves")).toBe(false);
  });

  it("earthbend 3, then earthbend 3 may target the same land (rulings)", () => {
    const { s: s0, ap, ids } = setup([crackedEarth]);
    const land = putOnBattlefield(s0, ap, wastes);
    const life = s0.players[ap]!.life;
    const s = cast(s0, ap, ids[0]!, [target(land), target(land)]);
    expect(pt(s, land)).toBe("6/6");
    expect(s.players[ap]!.life).toBe(life + 3);
  });

  it("Earthbending Student: its trigger, and land creatures you control have vigilance; the bot picks a land", () => {
    const { s: s0, ap, ids } = setup([earthbendingStudent]);
    let s = cast(s0, ap, ids[0]!);
    for (let i = 0; i < 10 && (s.pending || s.stack.length); i++) {
      const a = s.pending ? botActions(s, waitingOn(s)!)[0]! : { type: "passPriority" as const, player: waitingOn(s)! };
      s = act(s, a);
    }
    const animated = s.battlefield.map((id) => s.objects[id]!).filter((o) => o.controller === ap && objIsType(s, o, "Land") && objIsType(s, o, "Creature"));
    expect(animated.length).toBe(1);
    expect(objHasKeyword(s, animated[0]!, "Vigilance")).toBe(true);
    expect(pt(s, animated[0]!.id)).toBe("2/2");
  });

  it("Rockalanche: X is the number of Forests you control as it resolves", () => {
    const { s: s0, ap, ids } = setup([rockalanche]);
    const land = putOnBattlefield(s0, ap, wastes);
    const s = cast(s0, ap, ids[0]!, [target(land)]);
    expect(pt(s, land)).toBe("3/3");
  });
});
