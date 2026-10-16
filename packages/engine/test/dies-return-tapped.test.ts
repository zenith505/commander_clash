// "When this creature dies, return it to the battlefield tapped under its owner's control" as a granted ability
// (Supernatural Stamina) or the card's own (Tenacious Dead), "... with a +1/+1 counter on it" (Undying Malice: it enters
// with it, CR 614.1c), and "until end of turn, X" after a trigger's comma (Perigee Beckoner). The creature that comes back
// is a new object without the granted ability (CR 400.7, Supernatural Stamina's rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, putOnBattlefield, setup, target } from "./helpers";
import { botActions, isFullySupported, power, waitingOn, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
/** Resolve everything; a pending choice is answered as a bot would (it pays Tenacious Dead's {1}{B}). */
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    s = act(s, s.pending ? botActions(s, pid)[0]! : { type: "passPriority", player: pid });
  }
  return s;
};

// Real oracle text (Scryfall).
const stamina = card("Supernatural Stamina", "Instant", "{B}", { oracleText: "Until end of turn, target creature gets +2/+0 and gains \"When this creature dies, return it to the battlefield tapped under its owner's control.\"" });
const malice = card("Undying Malice", "Instant", "{B}", { oracleText: "Until end of turn, target creature gains \"When this creature dies, return it to the battlefield tapped under its owner's control with a +1/+1 counter on it.\"" });
const tenacious = card("Tenacious Dead", "Creature — Skeleton Warrior", "{B}", { power: "1", toughness: "1", oracleText: "When this creature dies, you may pay {1}{B}. If you do, return it to the battlefield tapped under its owner's control." });
const beckoner = card("Perigee Beckoner", "Creature — Horror", "{4}{B}", { power: "4", toughness: "5", keywords: ["Warp"], oracleText: "When this creature enters, until end of turn, another target creature you control gets +2/+0 and gains \"When this creature dies, return it to the battlefield tapped under its owner's control.\"\nWarp {1}{B} (You may cast this card from your hand for its warp cost. Exile this creature at the beginning of the next end step, then you may cast it from exile on a later turn.)" });
const shock = () => card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

describe("dies, return it to the battlefield tapped", () => {
  it("compiles them", () => supported(stamina, malice, tenacious, beckoner));

  it("Supernatural Stamina: it comes back tapped once, as a new object that won't come back again", () => {
    let { s, ap, ids } = setup([stamina, shock(), shock()]);
    const b = putOnBattlefield(s, ap, bear());
    s = settle(cast(s, ap, ids[0]!, [target(b)]));
    expect(power(s, s.objects[b]!)).toBe(4);
    s = settle(cast(s, ap, ids[1]!, [target(b)]));
    const o = s.objects[b]!;
    expect(o.zone).toBe("battlefield");
    expect(o.tapped).toBe(true);
    expect(power(s, o)).toBe(2); // the +2/+0 was for the old object
    s = settle(cast(s, ap, ids[2]!, [target(b)]));
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("Undying Malice: it enters tapped with a +1/+1 counter", () => {
    let { s, ap, ids } = setup([malice, shock()]);
    const b = putOnBattlefield(s, ap, bear());
    s = settle(cast(s, ap, ids[0]!, [target(b)]));
    s = settle(cast(s, ap, ids[1]!, [target(b)]));
    const o = s.objects[b]!;
    expect(o.zone).toBe("battlefield");
    expect(o.tapped).toBe(true);
    expect(o.counters["+1/+1"]).toBe(1);
  });

  it("Tenacious Dead comes back tapped if you pay", () => {
    let { s, ap, ids } = setup([shock()]);
    const t = putOnBattlefield(s, ap, tenacious);
    s = settle(cast(s, ap, ids[0]!, [target(t)]));
    expect(s.objects[t]!.zone).toBe("battlefield");
    expect(s.objects[t]!.tapped).toBe(true);
  });

  it("Perigee Beckoner gives another creature the ability as it enters", () => {
    let { s, ap, ids } = setup([beckoner, shock()]);
    const b = putOnBattlefield(s, ap, bear());
    s = settle(cast(s, ap, ids[0]!));
    expect(power(s, s.objects[b]!)).toBe(4);
    s = settle(cast(s, ap, ids[1]!, [target(b)]));
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[b]!.tapped).toBe(true);
  });
});
