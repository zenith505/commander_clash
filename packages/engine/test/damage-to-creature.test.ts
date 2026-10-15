// "Whenever ~ deals (combat) damage to a creature": once for each creature dealt damage, which "that creature" means
// (CR 603.2c). Kashi-Tribe Warriors, Stinkweed Imp, Lowland Basilisk, Matsu-Tribe Sniper.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) =>
  settle(act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks }));
const blocks = (s: GameState, b: { blocker: string; attacker: string }[] = []) => {
  for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  while (s.pending?.kind === "declareBlockers") {
    const pid = s.pending.player;
    s = act(s, { type: "declareBlockers", player: pid, blocks: b.filter((x) => s.objects[x.blocker]!.controller === pid) });
  }
  return settle(s);
};

// Real oracle text (Scryfall).
const kashi = card("Kashi-Tribe Warriors", "Creature — Snake Warrior", "{3}{G}{G}", {
  power: "2",
  toughness: "4",
  oracleText: "Whenever this creature deals combat damage to a creature, tap that creature and it doesn't untap during its controller's next untap step.",
});
const imp = card("Stinkweed Imp", "Creature — Imp", "{2}{B}", { power: "1", toughness: "2", keywords: ["Flying"], oracleText: "Flying\nWhenever this creature deals combat damage to a creature, destroy that creature." });
const ooze = card("Mephitic Ooze", "Creature — Ooze", "{4}{B}", {
  power: "0",
  toughness: "5",
  oracleText: "This creature gets +1/+0 for each artifact you control.\nWhenever this creature deals combat damage to a creature, destroy that creature. The creature can't be regenerated.",
});
const basilisk = card("Lowland Basilisk", "Creature — Basilisk", "{2}{G}", { power: "1", toughness: "3", oracleText: "Whenever this creature deals damage to a creature, destroy that creature at end of combat." });
const sniper = card("Matsu-Tribe Sniper", "Creature — Snake Warrior Archer", "{1}{G}", {
  power: "1",
  toughness: "1",
  oracleText: "{T}: This creature deals 1 damage to target creature with flying.\nWhenever this creature deals damage to a creature, tap that creature and it doesn't untap during its controller's next untap step.",
});
const bird = card("Storm Crow", "Creature — Bird", "{1}{U}", { power: "1", toughness: "2", keywords: ["Flying"], oracleText: "Flying" });

describe("whenever ~ deals damage to a creature", () => {
  it("Kashi-Tribe Warriors taps the creature it damaged, and it stays tapped through its controller's next untap step", () => {
    supported(kashi, imp, ooze, basilisk, sniper);
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kashi);
    const big = putOnBattlefield(s0, opp, bear({ power: "1", toughness: "5" }));
    let s = attack(s0, ap, [{ attacker: k, defender: opp }]);
    s = blocks(s, [{ blocker: big, attacker: k }]);
    s = settle(passUntil(s, "endCombat", ap));
    expect(s.objects[big]!.tapped).toBe(true);
    expect(s.objects[big]!.skipNextUntap).toBe(true);
    // Its controller's untap step: still tapped. The one after: untaps.
    s = passUntil(s, "upkeep", opp);
    expect(s.objects[big]!.tapped).toBe(true);
    s = passUntil(passUntil(s, "upkeep", ap), "upkeep", opp);
    expect(s.objects[big]!.tapped).toBe(false);
  });

  it("no damage dealt, no trigger: a 0-power creature, or damage to a player", () => {
    const { s: s0, ap, opp } = setup([]);
    const o = putOnBattlefield(s0, ap, ooze); // 0/5 with no artifacts
    const b = putOnBattlefield(s0, opp, bear());
    let s = attack(s0, ap, [{ attacker: o, defender: opp }]);
    s = blocks(s, [{ blocker: b, attacker: o }]);
    s = settle(passUntil(s, "endCombat", ap));
    expect(s.objects[b]!.zone).toBe("battlefield");
  });

  it("Stinkweed Imp destroys the creature it blocked, even one that survived the damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const big = putOnBattlefield(s0, ap, bear({ power: "3", toughness: "6" }));
    const i = putOnBattlefield(s0, opp, imp);
    let s = attack(s0, ap, [{ attacker: big, defender: opp }]);
    s = blocks(s, [{ blocker: i, attacker: big }]);
    s = settle(passUntil(s, "endCombat", ap));
    expect(s.objects[big]!.zone).toBe("graveyard");
    expect(s.objects[i]!.zone).toBe("graveyard");
  });

  it("Lowland Basilisk: destroyed at end of combat, not right away", () => {
    const { s: s0, ap, opp } = setup([]);
    const bs = putOnBattlefield(s0, ap, basilisk);
    const big = putOnBattlefield(s0, opp, bear({ power: "0", toughness: "6" }));
    let s = attack(s0, ap, [{ attacker: bs, defender: opp }]);
    s = blocks(s, [{ blocker: big, attacker: bs }]);
    s = settle(passUntil(s, "combatDamage", ap));
    s = settle(s);
    expect(s.objects[big]!.zone).toBe("battlefield");
    s = settle(passUntil(s, "endCombat", ap));
    expect(s.objects[big]!.zone).toBe("graveyard");
  });

  it("noncombat damage triggers 'deals damage to a creature' too (Matsu-Tribe Sniper)", () => {
    const { s: s0, ap, opp } = setup([]);
    const sn = putOnBattlefield(s0, ap, sniper);
    const crow = putOnBattlefield(s0, opp, bird);
    let s = act(s0, { type: "activateAbility", player: ap, objectId: sn, index: 0, targets: [target(crow)] });
    s = settle(s);
    expect(s.objects[crow]!.damage).toBe(1);
    expect(s.objects[crow]!.tapped).toBe(true);
    expect(s.objects[crow]!.skipNextUntap).toBe(true);
  });
});
