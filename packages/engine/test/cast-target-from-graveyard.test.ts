// "You may cast target instant card from your graveyard without paying its mana cost. If that spell would be put into
// your graveyard, exile it instead." (Torrential Gearhulk, Dreadhorde Arcanist): cast as the ability resolves, ignoring
// timing based on its type (CR 608.2g; rulings), the target's mana value checked against ~'s power then too.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { applyAction, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState } from "../src";
import { moveObject } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const inGraveyard = (s: GameState, pid: number, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  moveObject(s, id, "graveyard");
  return id;
};

// Real oracle text (Scryfall).
const gearhulk = card("Torrential Gearhulk", "Artifact Creature — Construct", "{4}{U}{U}", { power: "5", toughness: "6", keywords: ["Flash"], oracleText: "Flash\nWhen this creature enters, you may cast target instant card from your graveyard without paying its mana cost. If that spell would be put into your graveyard, exile it instead." });
const arcanist = card("Dreadhorde Arcanist", "Creature — Zombie Wizard", "{1}{R}", { power: "1", toughness: "3", keywords: ["Trample"], oracleText: "Trample\nWhenever this creature attacks, you may cast target instant or sorcery card with mana value less than or equal to this creature's power from your graveyard without paying its mana cost. If that spell would be put into your graveyard, exile it instead." });
const scholar = card("Scholar of the Lost Trove", "Creature — Sphinx", "{5}{U}{U}", { power: "5", toughness: "5", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, you may cast target instant, sorcery, or artifact card from your graveyard without paying its mana cost. If an instant or sorcery spell cast this way would be put into your graveyard, exile it instead." });
const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
const ping = card("Test Ping", "Sorcery", "{R}", { oracleText: "Test Ping deals 1 damage to any target." });
const blast = card("Test Blast", "Sorcery", "{1}{R}", { oracleText: "Test Blast deals 2 damage to any target." });

describe("cast target card from your graveyard without paying its mana cost", () => {
  it("parse", () => supported(gearhulk, arcanist, scholar));

  it("Torrential Gearhulk: cast Lightning Bolt for free, and it's exiled after", () => {
    const { s: s0, ap, opp, ids } = setup([gearhulk]);
    const b = inGraveyard(s0, ap, bolt);
    const life = s0.players[opp]!.life;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(b)] }));
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: b });
    s = settle(run(s, planCast(s, ap, b, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.objects[b]!.zone).toBe("exile");
  });

  it("Torrential Gearhulk: declined, it stays in the graveyard", () => {
    const { s: s0, ap, ids } = setup([gearhulk]);
    const b = inGraveyard(s0, ap, bolt);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(b)] }));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("Dreadhorde Arcanist: a sorcery during combat, mana value up to its power only", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, arcanist);
    const p = inGraveyard(s0, ap, ping);
    const big = inGraveyard(s0, ap, blast);
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    expect(() => applyAction(s, { type: "chooseTargets", player: ap, targets: [target(big)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(p)] }));
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: p });
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, p, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 1);
    expect(s.objects[p]!.zone).toBe("exile");
  });

  it("Scholar of the Lost Trove: an artifact spell cast this way isn't exiled", () => {
    const { s: s0, ap, ids } = setup([scholar]);
    const rock = card("Test Rock", "Artifact", "{3}", {});
    const r = inGraveyard(s0, ap, rock);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(r)] }));
    s = settle(run(s, planCast(s, ap, r)));
    expect(s.objects[r]!.zone).toBe("battlefield");
    expect(s.objects[r]!.exileIfToGraveyard).toBeUndefined();
  });
});
