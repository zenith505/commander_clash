// "When enchanted creature dies, return that card to the battlefield under your control" (False Demise): a
// leaves-the-battlefield trigger of the Aura, which looks back in time (CR 603.10a), so it triggers even though the
// Aura goes to the graveyard too.

import { describe, expect, it } from "vitest";
import { act, bear, card, island, plainsCard, putOnBattlefield, setup, swamp, target } from "./helpers";
import { controllerOf, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return settle(s);
};

// Real oracle text (Scryfall).
const falseDemise = card("False Demise", "Enchantment — Aura", "{2}{U}", { oracleText: "Enchant creature\nWhen enchanted creature dies, return that card to the battlefield under your control." });
const abduction = card("Abduction", "Enchantment — Aura", "{2}{U}{U}", {
  oracleText: "Enchant creature\nWhen this Aura enters, untap enchanted creature.\nYou control enchanted creature.\nWhen enchanted creature dies, return that card to the battlefield under its owner's control.",
});
const banewasp = card("Banewasp Affliction", "Enchantment — Aura", "{1}{B}", { oracleText: "Enchant creature\nWhen enchanted creature dies, that creature's controller loses life equal to its toughness." });
const fungal = card("Fungal Fortitude", "Enchantment — Aura", "{1}{B}", {
  keywords: ["Flash", "Enchant"],
  oracleText: "Flash\nEnchant creature\nEnchanted creature gets +2/+0.\nWhen enchanted creature dies, return it to the battlefield tapped under its owner's control.",
});
const wrath = card("Wrath of God", "Sorcery", "{2}{W}{W}", { oracleText: "Destroy all creatures. They can't be regenerated." });

describe("when enchanted creature dies", () => {
  it("False Demise: the creature comes back under the Aura's controller's control, even from a wrath", () => {
    supported(falseDemise, abduction, banewasp, fungal, wrath);
    const { s: s0, ap, ids, opp } = setup([falseDemise, wrath]);
    const theirs = putOnBattlefield(s0, opp, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(theirs)]));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(theirs);
    s = run(s, planCast(s, ap, ids[1]!));
    // The bear died and came back as a new object under my control; the Aura stayed in the graveyard.
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(s.objects[theirs]!.controller).toBe(ap);
  });

  it("Abduction returns it to its owner; Fungal Fortitude returns it tapped", () => {
    const { s: s0, ap, ids, opp } = setup([abduction, fungal, wrath]);
    const theirs = putOnBattlefield(s0, opp, bear());
    const mine = putOnBattlefield(s0, ap, bear());
    for (const l of [swamp, plainsCard, plainsCard, island]) putOnBattlefield(s0, ap, l);
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(theirs)]));
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
    s = run(s, planCast(s, ap, ids[1]!, [target(mine)]));
    s = run(s, planCast(s, ap, ids[2]!));
    expect(s.objects[theirs]!).toMatchObject({ zone: "battlefield", controller: opp, tapped: false });
    expect(s.objects[mine]!).toMatchObject({ zone: "battlefield", controller: ap, tapped: true });
  });

  it("a token that dies doesn't come back (CR 111.7)", () => {
    const { s: s0, ap, ids } = setup([falseDemise, wrath]);
    const tok = putOnBattlefield(s0, ap, bear());
    s0.objects[tok]!.isToken = true;
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(tok)]));
    s = run(s, planCast(s, ap, ids[1]!));
    expect(s.battlefield.includes(tok)).toBe(false);
  });

  it("Banewasp Affliction: the creature's last controller loses life equal to its last toughness", () => {
    const { s: s0, ap, ids, opp } = setup([banewasp, wrath]);
    const theirs = putOnBattlefield(s0, opp, bear({ toughness: "5" }));
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(theirs)]));
    const life = s.players[opp]!.life;
    s = run(s, planCast(s, ap, ids[1]!));
    expect(s.players[opp]!.life).toBe(life - 5);
  });
});
