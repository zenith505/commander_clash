// Keyword counters (CR 122.1b): a lifelink, flying, indestructible ... counter gives the permanent that keyword, in layer
// 6 with the timestamp of when it was put on (613.1f, 613.7c); each exalted counter is an instance of exalted (Emissary of
// Soulfire rulings). Finality counters (CR 122.1h): "If this permanent would be put into a graveyard from the
// battlefield, exile it instead", for any permanent, and not for other zones (Rite of the Moth rulings). "Return target
// creature card ... to the battlefield with a [kind] counter on it" (CR 614.1c).

import { describe, expect, it } from "vitest";
import { act, activate, addEffect, bear, card, cast, passUntil, putOnBattlefield, setup, swamp, target } from "./helpers";
import { putCounters } from "../src/counters";
import { isFullySupported, objHasKeyword, power, toughness, waitingOn, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Move a permanent the helpers made into its owner's graveyard. */
function toGraveyard(s: GameState, id: string) {
  const o = s.objects[id]!;
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  o.zone = "graveyard";
  s.players[o.owner]!.graveyard.push(id);
}

// Real oracle text (Scryfall).
const bond = card("Unbreakable Bond", "Sorcery", "{4}{B}", { oracleText: "Return target creature card from your graveyard to the battlefield with a lifelink counter on it." });
const moth = card("Rite of the Moth", "Sorcery", "{1}{W}{B}{B}", { keywords: ["Flashback"], oracleText: "Return target creature card from your graveyard to the battlefield with a finality counter on it. (If a creature with a finality counter on it would die, exile it instead.)\nFlashback {3}{W}{W}{B} (You may cast this card from your graveyard for its flashback cost. Then exile it.)" });
const fabricator = card("Shuri's Fabricator", "Artifact", "{4}", { oracleText: "When this artifact enters, create two tapped Vibranium tokens. (They're artifacts with indestructible and \"{T}: Add {C}. This mana can't be spent to cast a nonartifact spell.\")\n{6}, {T}: Return target artifact card from your graveyard to the battlefield with a finality counter on it. Activate only as a sorcery. (If a permanent with a finality counter on it would be put into a graveyard, exile it instead.)" });
const revival = card("Generous Revival", "Sorcery", "{2}{W}", { keywords: ["Flashback"], oracleText: "Return target creature card with mana value 3 or less from your graveyard to the battlefield with an additional +1/+1 counter on it.\nFlashback {4}{W} (You may cast this card from your graveyard for its flashback cost. Then exile it.)" });
const persist = card("Persist", "Sorcery", "{1}{B}", { oracleText: "Return target nonlegendary creature card from your graveyard to the battlefield with a -1/-1 counter on it." });
const emissary = card("Emissary of Soulfire", "Creature — Djinn Monk", "{1}{W}{U}", { power: "1", toughness: "4", oracleText: "When this creature enters, you get {E}{E}{E} (three energy counters).\nPay {E}{E}: Put an exalted counter on target creature you control. Activate only as a sorcery. (Whenever a creature you control attacks alone, it gets +1/+1 until end of turn for each instance of exalted among permanents you control.)" });
const myojin = card("Myojin of Blooming Dawn", "Legendary Creature — Spirit", "{5}{W}{W}{W}", { power: "4", toughness: "6", oracleText: "Myojin of Blooming Dawn enters with an indestructible counter on it if you cast it from your hand.\nRemove an indestructible counter from Myojin of Blooming Dawn: Create a 1/1 colorless Spirit creature token for each permanent you control." });
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
const shatter = card("Shatter", "Instant", "{1}{R}", { oracleText: "Destroy target artifact." });
const unsummon = card("Unsummon", "Instant", "{U}", { oracleText: "Return target creature to its owner's hand." });
const relic = card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}." });

describe("keyword counters", () => {
  it("compile", () => supported(bond, emissary, myojin, revival, persist));

  it("Unbreakable Bond: the creature comes back with a lifelink counter, and has lifelink", () => {
    const { s: s0, ap, ids } = setup([bond]);
    const b = putOnBattlefield(s0, ap, bear());
    toGraveyard(s0, b);
    const s = settle(cast(s0, ap, ids[0]!, [target(b)]));
    const o = s.objects[b]!;
    expect(o.zone).toBe("battlefield");
    expect(o.counters.lifelink).toBe(1);
    expect(objHasKeyword(s, o, "Lifelink")).toBe(true);
  });

  it("a counter put on after an effect that removes all abilities still gives its keyword; one before doesn't (CR 613.7c)", () => {
    const { s: s0, ap, ids } = setup([bond]);
    const b = putOnBattlefield(s0, ap, bear());
    toGraveyard(s0, b);
    const s = settle(cast(s0, ap, ids[0]!, [target(b)]));
    // "Loses all abilities" after the counter: no lifelink.
    addEffect(s, ap, [b], [{ kind: "loseAllAbilities" }]);
    expect(objHasKeyword(s, s.objects[b]!, "Lifelink")).toBe(false);
    // Another lifelink counter gives every lifelink counter a new timestamp: lifelink again.
    const { s: s1, ap: ap1 } = setup([]);
    const c = putOnBattlefield(s1, ap1, bear());
    addEffect(s1, ap1, [c], [{ kind: "loseAllAbilities" }]);
    s1.objects[c]!.counters.lifelink = 0;
    putCounters(s1, s1.objects[c]!, "lifelink", 1);
    expect(objHasKeyword(s1, s1.objects[c]!, "Lifelink")).toBe(true);
  });

  it("Myojin of Blooming Dawn cast from hand has indestructible until the counter is removed", () => {
    const { s: s0, ap, ids } = setup([myojin]);
    let s = settle(cast(s0, ap, ids[0]!));
    const m = ids[0]!;
    expect(s.objects[m]!.counters.indestructible).toBe(1);
    expect(objHasKeyword(s, s.objects[m]!, "Indestructible")).toBe(true);
    s = settle(activate(s, ap, m, 0));
    expect(s.objects[m]!.counters.indestructible ?? 0).toBe(0);
    expect(objHasKeyword(s, s.objects[m]!, "Indestructible")).toBe(false);
  });

  it("Emissary of Soulfire: two exalted counters are two instances of exalted", () => {
    const { s: s0, ap, ids, opp } = setup([emissary]);
    let s = settle(cast(s0, ap, ids[0]!));
    s.players[ap]!.energy = 4;
    const b = putOnBattlefield(s, ap, bear());
    s = settle(activate(s, ap, ids[0]!, 0, [target(b)]));
    s = settle(activate(s, ap, ids[0]!, 0, [target(b)]));
    expect(s.objects[b]!.counters.exalted).toBe(2);
    s = passUntil(s, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] }));
    expect(power(s, s.objects[b]!)).toBe(4);
  });

  it("Generous Revival and Persist return it with a +1/+1 or -1/-1 counter", () => {
    const { s: s0, ap, ids } = setup([revival, persist]);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear({ toughness: "3" }));
    toGraveyard(s0, a);
    toGraveyard(s0, b);
    let s = settle(cast(s0, ap, ids[0]!, [target(a)]));
    expect(s.objects[a]!.zone).toBe("battlefield");
    expect(power(s, s.objects[a]!)).toBe(3);
    s = settle(cast(s, ap, ids[1]!, [target(b)]));
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect([power(s, s.objects[b]!), toughness(s, s.objects[b]!)]).toEqual([1, 2]);
  });
});

describe("finality counters", () => {
  it("compile", () => supported(moth, fabricator));

  it("Rite of the Moth: the creature is exiled instead of dying", () => {
    const { s: s0, ap, ids } = setup([moth, murder]);
    const b = putOnBattlefield(s0, ap, bear());
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, ap, swamp);
    toGraveyard(s0, b);
    let s = settle(cast(s0, ap, ids[0]!, [target(b)]));
    expect(s.objects[b]!.counters.finality).toBe(1);
    s = settle(cast(s, ap, ids[1]!, [target(b)]));
    expect(s.objects[b]!.zone).toBe("exile");
  });

  it("it doesn't stop it going to its owner's hand", () => {
    const { s: s0, ap, ids } = setup([moth, unsummon]);
    const b = putOnBattlefield(s0, ap, bear());
    toGraveyard(s0, b);
    let s = settle(cast(s0, ap, ids[0]!, [target(b)]));
    s = settle(cast(s, ap, ids[1]!, [target(b)]));
    expect(s.objects[b]!.zone).toBe("hand");
  });

  it("Shuri's Fabricator: works on an artifact that isn't a creature", () => {
    const { s: s0, ap, ids } = setup([shatter]);
    const f = putOnBattlefield(s0, ap, fabricator);
    const r = putOnBattlefield(s0, ap, relic);
    toGraveyard(s0, r);
    let s = settle(activate(s0, ap, f, 0, [target(r)]));
    expect(s.objects[r]!.zone).toBe("battlefield");
    expect(s.objects[r]!.counters.finality).toBe(1);
    s = settle(cast(s, ap, ids[0]!, [target(r)]));
    expect(s.objects[r]!.zone).toBe("exile");
  });
});
