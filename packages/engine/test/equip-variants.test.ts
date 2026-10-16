// Equip variants: "Equip legendary creature {3}", "Equip creature token {1}", "Equip commander {2}" (CR 702.6c: only
// onto that kind of creature you control), and equip costs that aren't mana, "Equip—Sacrifice a creature", "Equip—Pay
// 3 life" (CR 702.6a). Also legendary cards called by a shortened name (CR 201.5c: "Veldrane", "Syr Armont"), "it"
// for a card just returned to the battlefield, and Pip-Boy 3000's modes.

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { compileCard, invalidateCharacteristics, isFullySupported, moveObject, objHasKeyword, planActivate, waitingOn, type CardDef, type GameState } from "../src";

// Real oracle text (Scryfall).
const blackblade = card("Blackblade Reforged", "Legendary Artifact — Equipment", "{2}", { keywords: ["Equip"], oracleText: "Equipped creature gets +1/+1 for each land you control.\nEquip legendary creature {3}\nEquip {7}" });
const teamPennant = card("Team Pennant", "Artifact — Equipment", "{1}", { keywords: ["Equip"], oracleText: "Equipped creature gets +1/+1 and has vigilance and trample.\nEquip creature token {1}\nEquip {3}" });
const moleculeSuit = card("Unstable Molecule Suit", "Artifact — Equipment", "{3}", { keywords: ["Equip"], oracleText: "Equipped creature gets +2/+2 and has indestructible.\nEquip commander {2}\nEquip {4}" });
const hauberk = card("Demonmail Hauberk", "Artifact — Equipment", "{4}", { keywords: ["Equip"], oracleText: "Equipped creature gets +4/+2.\nEquip—Sacrifice a creature." });
const nightmareLash = card("Nightmare Lash", "Artifact — Equipment", "{4}", { keywords: ["Equip"], oracleText: "Equipped creature gets +1/+1 for each Swamp you control.\nEquip—Pay 3 life. (Pay 3 life: Attach to target creature you control. Equip only as a sorcery.)" });
const sigil = card("Sigil of Distinction", "Artifact — Equipment", "{X}", { keywords: ["Equip"], oracleText: "This Equipment enters with X charge counters on it.\nEquipped creature gets +1/+1 for each charge counter on this Equipment.\nEquip—Remove a charge counter from this Equipment." });
const pipBoy = card("Pip-Boy 3000", "Artifact — Equipment", "{1}", { keywords: ["Check Map", "Pick a Perk", "Equip", "Sort Inventory"], oracleText: "Whenever equipped creature attacks, choose one —\n• Sort Inventory — Draw a card, then discard a card.\n• Pick a Perk — Put a +1/+1 counter on that creature.\n• Check Map — Untap up to two target lands.\nEquip {2}" });
const veldrane = card("Veldrane of Sengir", "Legendary Creature — Human Rogue", "{5}{B}{B}", { power: "5", toughness: "5", oracleText: "{1}{B}{B}: Veldrane gets -3/-0 and gains forestwalk until end of turn. (It can't be blocked as long as defending player controls a Forest.)" });
const miraculousRecovery = card("Miraculous Recovery", "Instant", "{4}{W}", { oracleText: "Return target creature card from your graveyard to the battlefield. Put a +1/+1 counter on it." });
const bondOfRevival = card("Bond of Revival", "Sorcery", "{4}{B}", { oracleText: "Return target creature card from your graveyard to the battlefield. It gains haste until your next turn." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const legend = (name = "Test Legend") => card(name, "Legendary Creature — Human", "{1}{W}", { power: "2", toughness: "2" });
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("equip variants", () => {
  it("parses these", () => {
    supported(blackblade, teamPennant, moleculeSuit, hauberk, nightmareLash, sigil, pipBoy, veldrane, miraculousRecovery, bondOfRevival);
    const abs = compileCard(blackblade).activated;
    expect(abs).toHaveLength(2);
    expect(abs.every((a) => a.equip)).toBe(true);
  });

  it("Blackblade Reforged: {3} only onto a legendary creature, {7} onto any", () => {
    const { s: s0, ap } = setup([]);
    const bb = putOnBattlefield(s0, ap, blackblade);
    const b = putOnBattlefield(s0, ap, bear());
    const l = putOnBattlefield(s0, ap, legend());
    expect(planActivate(s0, ap, bb, 0, [target(b)])).toBeNull();
    let s = activate(s0, ap, bb, 0, [target(l)]);
    expect(s.objects[bb]!.attachedTo).toBe(l);
    expect(pt(s, l)).toBe("16/16");
    s = activate(s, ap, bb, 1, [target(b)]);
    expect(s.objects[bb]!.attachedTo).toBe(b);
  });

  it("Team Pennant: {1} only onto a creature token", () => {
    const { s: s0, ap } = setup([]);
    const tp = putOnBattlefield(s0, ap, teamPennant);
    const b = putOnBattlefield(s0, ap, bear());
    const tok = putOnBattlefield(s0, ap, bear({ name: "Bear Token" }));
    s0.objects[tok]!.isToken = true;
    expect(planActivate(s0, ap, tp, 0, [target(b)])).toBeNull();
    const s = activate(s0, ap, tp, 0, [target(tok)]);
    expect(s.objects[tp]!.attachedTo).toBe(tok);
    expect(pt(s, tok)).toBe("3/3");
  });

  it("Unstable Molecule Suit: {2} only onto a commander", () => {
    const { s: s0, ap } = setup([]);
    const suit = putOnBattlefield(s0, ap, moleculeSuit);
    const b = putOnBattlefield(s0, ap, bear());
    const cmd = putOnBattlefield(s0, ap, legend("My Commander"), { commander: true });
    expect(planActivate(s0, ap, suit, 0, [target(b)])).toBeNull();
    const s = activate(s0, ap, suit, 0, [target(cmd)]);
    expect(s.objects[suit]!.attachedTo).toBe(cmd);
    expect(objHasKeyword(s, s.objects[cmd]!, "Indestructible")).toBe(true);
  });

  it("Nightmare Lash: equip by paying 3 life", () => {
    const { s: s0, ap } = setup([]);
    const lash = putOnBattlefield(s0, ap, nightmareLash);
    const b = putOnBattlefield(s0, ap, bear());
    const life = s0.players[ap]!.life;
    const s = activate(s0, ap, lash, 0, [target(b)]);
    expect(s.objects[lash]!.attachedTo).toBe(b);
    expect(s.players[ap]!.life).toBe(life - 3);
    // Two Swamps in play.
    expect(pt(s, b)).toBe("4/4");
  });

  it("Demonmail Hauberk: equip by sacrificing a creature", () => {
    const { s: s0, ap } = setup([]);
    const h = putOnBattlefield(s0, ap, hauberk);
    const b = putOnBattlefield(s0, ap, bear());
    const fodder = putOnBattlefield(s0, ap, bear({ name: "Fodder Bear" }));
    let s = act(s0, { type: "activateAbility", player: ap, objectId: h, index: 0, targets: [target(b)], costs: { sacrifice: [fodder] } });
    s = settle(s);
    expect(s.objects[fodder]!.zone).toBe("graveyard");
    expect(s.objects[h]!.attachedTo).toBe(b);
    expect(pt(s, b)).toBe("6/4");
  });

  it("Sigil of Distinction: equip by removing a charge counter", () => {
    const { s: s0, ap } = setup([]);
    const sg = putOnBattlefield(s0, ap, sigil);
    s0.objects[sg]!.counters = { charge: 3 };
    invalidateCharacteristics(s0);
    const b = putOnBattlefield(s0, ap, bear());
    const s = activate(s0, ap, sg, 0, [target(b)]);
    expect(s.objects[sg]!.attachedTo).toBe(b);
    expect(s.objects[sg]!.counters.charge).toBe(2);
    expect(pt(s, b)).toBe("4/4");
  });

  it("Pip-Boy 3000: Pick a Perk puts a +1/+1 counter on the attacking creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const pip = putOnBattlefield(s0, ap, pipBoy);
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[pip]!.attachedTo = b;
    invalidateCharacteristics(s0);
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseModes", player: ap });
    s = settle(act(s, { type: "chooseModes", player: ap, modes: [1] }));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
  });
});

describe("shortened legendary names and returned cards", () => {
  it("Veldrane: its own shortened name is ~", () => {
    const { s: s0, ap } = setup([]);
    const v = putOnBattlefield(s0, ap, veldrane);
    const s = activate(s0, ap, v, 0);
    expect(pt(s, v)).toBe("2/5");
  });

  it("Miraculous Recovery: the returned creature gets the counter", () => {
    const { s: s0, ap, ids } = setup([miraculousRecovery]);
    const b = putOnBattlefield(s0, ap, bear());
    moveObject(s0, b, "graveyard");
    const s = cast(s0, ap, ids[0]!, [target(b)]);
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(pt(s, b)).toBe("3/3");
  });

  it("Bond of Revival: the returned creature has haste", () => {
    const { s: s0, ap, ids } = setup([bondOfRevival]);
    const b = putOnBattlefield(s0, ap, bear());
    moveObject(s0, b, "graveyard");
    const s = cast(s0, ap, ids[0]!, [target(b)]);
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(objHasKeyword(s, s.objects[b]!, "Haste")).toBe(true);
  });
});
