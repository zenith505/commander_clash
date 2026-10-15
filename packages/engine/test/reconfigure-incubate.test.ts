// Reconfigure (CR 702.151) and incubate (CR 701.53), with the Incubator's transform (CR 701.27).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passAll, putOnBattlefield, setup, target } from "./helpers";
import { abilitiesOf, abilityProblem, botActions, characteristics, isFullySupported, planActivate, power, toughness, waitingOn, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

// Real oracle text (Scryfall).
const lizardBlades = card("Lizard Blades", "Artifact Creature — Equipment Lizard", "{1}{R}", {
  power: "1",
  toughness: "1",
  keywords: ["Double strike", "Reconfigure"],
  oracleText:
    "Double strike\nEquipped creature has double strike.\nReconfigure {2} ({2}: Attach to target creature you control; or unattach from a creature. Reconfigure only as a sorcery. While attached, this isn't a creature.)",
});
const converterBeast = card("Converter Beast", "Creature — Phyrexian Beast", "{3}{G}", {
  power: "5",
  toughness: "5",
  keywords: ["Incubate", "Transform"],
  oracleText: 'When this creature enters, incubate 5. (Create an Incubator token with five +1/+1 counters on it and "{2}: Transform this token." It transforms into a 0/0 Phyrexian artifact creature.)',
});
const exciseTheImperfect = card("Excise the Imperfect", "Instant", "{1}{W}{W}", {
  keywords: ["Incubate", "Transform"],
  oracleText:
    'Exile target nonland permanent. Its controller incubates X, where X is its mana value. (They create an Incubator token with X +1/+1 counters on it and "{2}: Transform this token." It transforms into a 0/0 Phyrexian artifact creature.)',
});

describe("reconfigure (CR 702.151)", () => {
  it("attached, it stops being a creature and loses its creature types; unattached, it's a creature again", () => {
    supported(lizardBlades);
    const { s: s0, ap } = setup([]);
    const blades = putOnBattlefield(s0, ap, lizardBlades);
    const b = putOnBattlefield(s0, ap, bear());
    // Unattach only while attached.
    expect(abilityProblem(s0, ap, blades, 1)).not.toBeNull();
    // Not to itself (it's "another target creature").
    expect(planActivate(s0, ap, blades, 0, [target(blades)])).toBeNull();
    let s = activate(s0, ap, blades, 0, [target(b)]);
    expect(s.objects[blades]!.attachedTo).toBe(b);
    const c = characteristics(s, s.objects[blades]!);
    expect(c.types).not.toContain("Creature");
    expect(c.types).toContain("Artifact");
    expect(c.subtypes).toEqual(["Equipment"]);
    expect(characteristics(s, s.objects[b]!).keywords).toContain("Double strike");
    // It stayed attached through state-based actions (an Equipment that's a creature would fall off, CR 704.5n).
    expect(s.log.some((l) => /unattached/.test(l.text))).toBe(false);
    s = activate(s, ap, blades, 1);
    expect(s.objects[blades]!.attachedTo).toBeUndefined();
    expect(characteristics(s, s.objects[blades]!).types).toContain("Creature");
    expect(characteristics(s, s.objects[blades]!).subtypes).toContain("Lizard");
    expect(characteristics(s, s.objects[b]!).keywords).not.toContain("Double strike");
  });

  it("only as a sorcery", () => {
    const { s, ap } = setup([]);
    const blades = putOnBattlefield(s, ap, lizardBlades);
    putOnBattlefield(s, ap, bear());
    s.step = "beginCombat";
    expect(abilityProblem(s, ap, blades, 0)).toMatch(/sorcery/);
  });

  it("when the creature it's attached to leaves, it's unattached and a creature again", () => {
    const { s: s0, ap } = setup([]);
    const blades = putOnBattlefield(s0, ap, lizardBlades);
    const b = putOnBattlefield(s0, ap, bear());
    let s = activate(s0, ap, blades, 0, [target(b)]);
    s.objects[b]!.damage = 5; // lethal: it dies to state-based actions
    s = passAll(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.objects[b]!.zone).toBe("graveyard");
    expect(s.objects[blades]!.attachedTo).toBeUndefined();
    expect(characteristics(s, s.objects[blades]!).types).toContain("Creature");
  });
});

describe("incubate (CR 701.53)", () => {
  it("an Incubator artifact with N +1/+1 counters that transforms into a Phyrexian artifact creature", () => {
    supported(converterBeast, exciseTheImperfect);
    const { s: s0, ap, ids } = setup([converterBeast]);
    let s = settle(cast(s0, ap, ids[0]!));
    const inc = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    expect(inc).toBeTruthy();
    const o = () => s.objects[inc]!;
    expect(characteristics(s, o()).name).toBe("Incubator Token");
    expect(characteristics(s, o()).types).toEqual(["Artifact"]);
    expect(characteristics(s, o()).subtypes).toEqual(["Incubator"]);
    expect(o().counters["+1/+1"]).toBe(5);
    const zc = o().zoneChanges;
    s = settle(activate(s, ap, inc, 0));
    // The same object (CR 701.27a): counters stay, and it's a 5/5 Phyrexian artifact creature.
    expect(o().zone).toBe("battlefield");
    expect(o().zoneChanges).toBe(zc);
    expect(characteristics(s, o()).name).toBe("Phyrexian Token");
    expect(characteristics(s, o()).types).toEqual(["Artifact", "Creature"]);
    expect(characteristics(s, o()).colors).toEqual([]);
    expect(`${power(s, o())}/${toughness(s, o())}`).toBe("5/5");
    // The Phyrexian has no transform ability.
    expect(abilitiesOf(s, o()).activated.length).toBe(0);
  });

  it("the exiled permanent's controller incubates X, where X is its mana value", () => {
    const { s: s0, ap, ids, opp } = setup([exciseTheImperfect]);
    const theirs = putOnBattlefield(s0, opp, card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" }));
    const s = settle(cast(s0, ap, ids[0]!, [target(theirs)]));
    expect(s.objects[theirs]!.zone).toBe("exile");
    const inc = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    expect(s.objects[inc]!.controller).toBe(opp);
    expect(s.objects[inc]!.counters["+1/+1"]).toBe(4);
  });

  it("bots transform an Incubator that has counters", () => {
    const { s: s0, ap, ids } = setup([converterBeast]);
    let s = settle(cast(s0, ap, ids[0]!));
    const inc = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    s.step = "main2";
    // Nothing else to spend mana on.
    for (const x of s.players[ap]!.hand) {
      s.objects[x]!.zone = "library";
      s.players[ap]!.library.push(x);
    }
    s.players[ap]!.hand = [];
    s.players[ap]!.command = [];
    for (let i = 0; i < 8 && !s.objects[inc]!.cardId.startsWith("token:Phyrexian"); i++) s = settle(act(s, botActions(s, ap)[0]!));
    expect(characteristics(s, s.objects[inc]!).types).toContain("Creature");
  });
});
