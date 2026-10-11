// Things that must not be possible, and things that look odd but are legal.

import { describe, expect, it } from "vitest";
import { act, activate, addEffect, bear, card, putOnBattlefield, setup, target } from "./helpers";
import { abilityProblem, botActions, doesNothingNow, compileCard, RulesError } from "../src";

const staff = card("Staff of Domination", "Artifact", "{3}", {
  oracleText: "{1}: Untap this artifact.\n{2}, {T}: You gain 1 life.\n{3}, {T}: Untap target creature.\n{4}, {T}: Tap target creature.\n{5}, {T}: Draw a card.",
});

describe("activated abilities", () => {
  it("'{1}: Untap ~' can be activated while untapped: only {Q} needs it tapped (CR 107.6, 602.2)", () => {
    const { s: s0, ap } = setup([]);
    const id = putOnBattlefield(s0, ap, staff);
    expect(abilityProblem(s0, ap, id, 0)).toMatch(/not enough mana/); // nothing stops it but mana
    const s = activate(s0, ap, id, 0);
    expect(s.objects[id]!.tapped).toBe(false);
    expect(doesNothingNow(s0, id, compileCard(staff).activated[0]!.body)).toBe(true);
  });

  it("a {T} ability can't be activated while tapped", () => {
    const { s: s0, ap } = setup([]);
    const id = putOnBattlefield(s0, ap, staff);
    s0.objects[id]!.tapped = true;
    expect(abilityProblem(s0, ap, id, 1)).toMatch(/tapped/);
    expect(() => act(s0, { type: "activateAbility", player: ap, objectId: id, index: 1 })).toThrow(RulesError);
  });

  it("bots don't pay to untap something that's already untapped", () => {
    const { s: s0, ap } = setup([]);
    const id = putOnBattlefield(s0, ap, card("Untapper", "Artifact", "{1}", { oracleText: "{1}: Untap this artifact." }));
    s0.step = "main2";
    s0.players[ap]!.hand = [];
    s0.players[ap]!.command = [];
    const acts = botActions(s0, ap);
    expect(acts.some((a) => a.type === "activateAbility" && a.objectId === id)).toBe(false);
  });

  it("the log says which ability was activated and at what", () => {
    const { s: s0, ap } = setup([]);
    const id = putOnBattlefield(s0, ap, staff);
    const b = putOnBattlefield(s0, ap, bear());
    const s = activate(s0, ap, id, 3, [target(b)]);
    expect(s.log.some((e) => e.text === `${s.players[ap]!.name} activates Staff of Domination ({4}, {T}: Tap target creature) targeting Grizzly Bears.`)).toBe(true);
  });
});

describe("Equipment (CR 301.5c)", () => {
  const sword = card("Sword", "Artifact — Equipment", "{1}", { oracleText: "Equipped creature gets +1/+1.\nEquip {1}" });

  it("an Equipment that's also a creature can't equip, and falls off when it becomes one", () => {
    const { s: s0, ap } = setup([]);
    const eq = putOnBattlefield(s0, ap, sword);
    const b = putOnBattlefield(s0, ap, bear());
    let s = activate(s0, ap, eq, 0, [target(b)]);
    expect(s.objects[eq]!.attachedTo).toBe(b);
    // It becomes an artifact creature, still an Equipment: it's unattached (CR 301.5c, 704.5n).
    addEffect(s, ap, [eq], [{ kind: "addTypes", types: ["Creature"], subtypes: [] }, { kind: "setPT", power: 2, toughness: 2 }], "game");
    s = act(s, { type: "passPriority", player: ap });
    expect(s.objects[eq]!.attachedTo).toBeUndefined();
  });

  it("something that stops being an Equipment or Aura becomes unattached (CR 704.5p)", () => {
    const { s: s0, ap } = setup([]);
    const eq = putOnBattlefield(s0, ap, sword);
    const b = putOnBattlefield(s0, ap, bear());
    let s = activate(s0, ap, eq, 0, [target(b)]);
    // No longer an artifact, so no longer an Equipment either (CR 205.1a).
    addEffect(s, ap, [eq], [{ kind: "setTypes", types: ["Creature"], subtypes: ["Construct"] }, { kind: "setPT", power: 2, toughness: 2 }], "game");
    s = act(s, { type: "passPriority", player: ap });
    expect(s.objects[eq]!.attachedTo).toBeUndefined();
  });
});
