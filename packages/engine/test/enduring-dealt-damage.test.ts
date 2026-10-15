// The Enduring cycle ("When ~ dies, if it was a creature, return it to the battlefield under its owner's control. It's
// an enchantment.") and "Whenever ~ is dealt damage" / "When enchanted creature is dealt damage": one trigger for all
// the damage dealt to it at the same time (Boros Reckoner and Spitemare rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, putOnBattlefield, setup } from "./helpers";
import { characteristics, isFullySupported, waitingOn, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const curiosity = card("Enduring Curiosity", "Enchantment Creature — Cat Glimmer", "{2}{U}{U}", {
  power: "4",
  toughness: "3",
  keywords: ["Flash"],
  oracleText:
    "Flash\nWhenever a creature you control deals combat damage to a player, draw a card.\nWhen Enduring Curiosity dies, if it was a creature, return it to the battlefield under its owner's control. It's an enchantment. (It's not a creature.)",
});
const reckoner = card("Boros Reckoner", "Creature — Minotaur Wizard", "{R/W}{R/W}{R/W}", {
  power: "3",
  toughness: "3",
  oracleText: "Whenever this creature is dealt damage, it deals that much damage to any target.\n{R/W}: This creature gains first strike until end of turn.",
});
const wound = card("Mortal Wound", "Enchantment — Aura", "{G}", { keywords: ["Enchant"], oracleText: "Enchant creature\nWhen enchanted creature is dealt damage, destroy it." });
const hydra = card("Hungering Hydra", "Creature — Hydra", "{X}{G}", {
  power: "0",
  toughness: "0",
  oracleText:
    "This creature enters with X +1/+1 counters on it.\nThis creature can't be blocked by more than one creature.\nWhenever this creature is dealt damage, put that many +1/+1 counters on it. (It must survive the damage to get the counters.)",
});
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
const disenchant = card("Disenchant", "Instant", "{1}{W}", { oracleText: "Destroy target artifact or enchantment." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });

const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("the Enduring cycle", () => {
  it("compile", () => {
    for (const d of [curiosity, reckoner, wound, hydra]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("returns as an enchantment only, without its creature types; then it doesn't come back", () => {
    const { s: s0, ap, ids, opp } = setup([murder, disenchant]);
    const c = putOnBattlefield(s0, opp, curiosity);
    let s = settle(cast(s0, ap, ids[0]!, [{ kind: "object", id: c }]));
    expect(s.objects[c]!.zone).toBe("battlefield");
    expect(s.objects[c]!.controller).toBe(opp);
    const ch = characteristics(s, s.objects[c]!);
    expect(ch.types).toEqual(["Enchantment"]);
    expect(ch.subtypes).toEqual([]);
    // Its other ability still works: a creature its controller controls deals combat damage to a player.
    const b = putOnBattlefield(s, opp, bear());
    s = passUntil(s, "declareAttackers", opp);
    const hand = s.players[opp]!.hand.length;
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: b, defender: ap }] });
    s = settle(passUntil(s, "endCombat", opp));
    expect(s.players[opp]!.hand.length).toBe(hand + 1);
    // Destroyed as an enchantment, it wasn't a creature: it stays in the graveyard.
    s = passUntil(s, "main1", ap);
    s = settle(cast(s, ap, ids[1]!, [{ kind: "object", id: c }]));
    expect(s.objects[c]!.zone).toBe("graveyard");
  });
});

describe("is dealt damage", () => {
  it("Boros Reckoner blocked by two: one trigger for all of it", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, reckoner);
    putOnBattlefield(s0, opp, bear());
    putOnBattlefield(s0, opp, bear({ name: "Other Bear" }));
    const blockers = s0.battlefield.filter((id) => s0.objects[id]!.controller === opp && /Bear/.test(s0.cards[s0.objects[id]!.cardId]!.name));
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: r, defender: opp }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    while (s.pending?.kind === "declareBlockers") {
      const pid: PlayerId = s.pending.player;
      s = act(s, { type: "declareBlockers", player: pid, blocks: pid === opp ? blockers.map((b) => ({ blocker: b, attacker: r })) : [] });
    }
    for (let i = 0; i < 40 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(s.objects[r]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(36); // 4 damage, once
    expect(s.log.filter((e) => /Boros Reckoner's ability triggers/.test(e.text)).length).toBe(1);
  });

  it("Mortal Wound destroys the enchanted creature when it's dealt damage; Hungering Hydra grows", () => {
    const { s: s0, ap, ids, opp } = setup([wound, shock, shock]);
    const big = putOnBattlefield(s0, opp, card("Big", "Creature — Giant", "{4}", { power: "5", toughness: "5" }));
    const h = putOnBattlefield(s0, opp, hydra);
    s0.objects[h]!.counters["+1/+1"] = 3;
    let s = settle(cast(s0, ap, ids[0]!, [{ kind: "object", id: big }]));
    s = settle(cast(s, ap, ids[1]!, [{ kind: "object", id: big }]));
    expect(s.objects[big]!.zone).toBe("graveyard");
    s = settle(cast(s, ap, ids[2]!, [{ kind: "object", id: h }]));
    expect(s.objects[h]!.counters["+1/+1"]).toBe(5);
  });
});
