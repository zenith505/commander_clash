// "Remove it from combat" (CR 506.4): Gustcloak Runner untaps and leaves combat when blocked; it deals and is dealt no
// combat damage, and the creature blocking it is still a blocking creature (CR 506.4, 509.1h).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, waitingOn } from "../src";

// Real oracle text (Scryfall).
const runner = card("Gustcloak Runner", "Creature — Human Soldier", "{W}", { power: "1", toughness: "1", oracleText: "Whenever this creature becomes blocked, you may untap it and remove it from combat." });
const hollowhenge = card("Hollowhenge Spirit", "Creature — Spirit", "{3}{W}{W}", {
  power: "2",
  toughness: "2",
  keywords: ["Flash", "Flying"],
  oracleText: "Flash\nFlying\nWhen this creature enters, remove target attacking or blocking creature from combat.",
});

describe("removing from combat (CR 506.4)", () => {
  it("compiles", () => {
    for (const d of [runner, hollowhenge]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Gustcloak Runner: blocked, it untaps and leaves combat; no combat damage either way", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, runner);
    const b = putOnBattlefield(s0, opp, bear());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: r, defender: opp }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b, attacker: r }] });
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.objects[r]!.attacking).toBeUndefined();
    expect(s.objects[r]!.tapped).toBe(false);
    expect(s.objects[b]!.blocking).toEqual([]);
    s = passUntil(s, "endCombat");
    expect(s.objects[r]!.zone).toBe("battlefield");
    expect(s.objects[r]!.damage).toBe(0);
    expect(s.objects[b]!.damage).toBe(0);
  });
});
