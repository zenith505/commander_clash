// "Enchanted creature" in abilities, picking your own permanents (edicts, bounce lands), "exile until ~
// leaves the battlefield" (CR 610.3), attaching on entering, "can't block this turn", riot, unleash, afterlife.

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, passAll, putOnBattlefield, setup, target } from "./helpers";
import { botActions, characteristics, compileCard, invalidateCharacteristics, isFullySupported, objHasKeyword, planCast, waitingOn, type Action, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return settle(plan!.reduce((x, a) => act(x, a), s));
};

const sphere = card("Sphere Test", "Enchantment — Aura", "{3}{U}", {
  oracleText: "Flash\nEnchant creature\nWhen this Aura enters, tap enchanted creature.\nEnchanted creature doesn't untap during its controller's untap step.",
  keywords: ["Flash", "Enchant"],
});
const breath = card("Breath Test", "Enchantment — Aura", "{R}", {
  oracleText: "Enchant creature\n{R}: Enchanted creature gets +1/+0 until end of turn.\nSacrifice this Aura: Enchanted creature gets +2/+2 until end of turn.",
  keywords: ["Enchant"],
});
const karoo = card("Karoo Test", "Land", "", { oracleText: "This land enters tapped.\nWhen this land enters, return a land you control to its owner's hand.\n{T}: Add {W}{U}." });
const edict = card("Edict Test", "Sorcery", "{1}{B}", { oracleText: "Each opponent sacrifices a creature of their choice." });
const marauder = card("Marauder Test", "Creature — Zombie", "{2}{B}", { power: "3", toughness: "1", oracleText: "When this creature enters, each player sacrifices a creature of their choice." });
const light = card("Light Test", "Enchantment", "{2}{W}", {
  oracleText: "When this enchantment enters, exile target nonland permanent an opponent controls until this enchantment leaves the battlefield.",
});
const shatter = card("Shatter Test", "Instant", "{1}{R}", { oracleText: "Destroy target enchantment." });
const armor = card("Armor Test", "Artifact — Equipment", "{1}", { oracleText: "When this Equipment enters, attach it to target creature you control.\nEquipped creature gets +2/+0.\nEquip {3}" });
const cathar = card("Cathar Test", "Creature — Human", "{2}{R}", { power: "2", toughness: "1", oracleText: "When this creature enters, target creature can't block this turn." });
const rioter = card("Riot Test", "Creature — Goblin", "{1}{R}", { power: "1", toughness: "1", oracleText: "Riot", keywords: ["Riot"] });
const unleashed = card("Unleash Test", "Creature — Giant", "{2}{R}", { power: "2", toughness: "2", oracleText: "Unleash", keywords: ["Unleash"] });
const evolver = card("Evolve Test", "Creature — Ooze", "{G}", { power: "1", toughness: "1", oracleText: "Evolve", keywords: ["Evolve"] });
const spirits = card("Afterlife Test", "Creature — Human Cleric", "{1}{W}", { power: "1", toughness: "1", oracleText: "Afterlife 2", keywords: ["Afterlife"] });

/** Every player but `pid`'s answers to pending choices: the first options. */
const answer = (s: GameState, pid: number) => {
  const p = s.pending!;
  if (p.kind === "pickPermanents") return act(s, { type: "pickPermanents", player: p.player, ids: p.options.slice(0, p.count) });
  if (p.kind === "chooseOption") return act(s, { type: "chooseOption", player: p.player, choice: p.options[pid] ?? p.options[0]! });
  throw new Error(`unexpected ${p.kind}`);
};

describe("enchanted creature", () => {
  it("an Aura's abilities affect what it enchants", () => {
    supported(sphere, breath);
    const { s: s0, ap, ids, opp } = setup([sphere]);
    const foe = putOnBattlefield(s0, opp, bear());
    const s = settle(passAll(run(s0, planCast(s0, ap, ids[0]!, [target(foe)]))));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(foe);
    expect(s.objects[foe]!.tapped).toBe(true);
  });

  it("after the Aura is sacrificed for the ability, it's what the Aura was attached to (CR 608.2h)", () => {
    const { s: s0, ap, ids } = setup([breath]);
    const mine = putOnBattlefield(s0, ap, bear());
    let s = settle(passAll(run(s0, planCast(s0, ap, ids[0]!, [target(mine)]))));
    s = activate(s, ap, ids[0]!, 0);
    s = settle(s);
    expect(power(s, mine)).toBe(3);
    s = settle(activate(s, ap, ids[0]!, 1));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect([power(s, mine), toughness(s, mine)]).toEqual([5, 4]);
  });
});

const power = (s: GameState, id: string) => characteristics(s, s.objects[id]!).power;
const toughness = (s: GameState, id: string) => characteristics(s, s.objects[id]!).toughness;

describe("bots and Aura abilities", () => {
  it("don't activate a free 'regenerate enchanted creature' over and over", () => {
    const leeches = card("Leech Test", "Enchantment — Aura", "{B}", { oracleText: "Enchant creature\n{0}: Regenerate enchanted creature.", keywords: ["Enchant"] });
    supported(leeches);
    const { s: s0, ap } = setup([]);
    const mine = putOnBattlefield(s0, ap, bear());
    const aura = putOnBattlefield(s0, ap, leeches);
    s0.objects[aura]!.attachedTo = mine;
    s0.players[ap]!.isBot = true;
    expect(botActions(s0, ap).some((a) => a.type === "activateAbility")).toBe(false);
  });
});

describe("picking your own permanents", () => {
  it("a bounce land returns a land you control, maybe itself", () => {
    supported(karoo, edict, marauder);
    const { s: s0, ap, ids } = setup([karoo]);
    let s = settle(act(s0, { type: "playLand", player: ap, objectId: ids[0]! }));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "bounce", count: 1 });
    const pend = s.pending as Extract<GameState["pending"], { kind: "pickPermanents" }>;
    expect(pend.options).toContain(ids[0]!);
    const forest = pend.options.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest")!;
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [forest] }));
    expect(zone(s, forest)).toBe("hand");
    expect(zone(s, ids[0]!)).toBe("battlefield");
  });

  it("with no other land, it returns itself", () => {
    const { s: s0, ap, ids } = setup([karoo]);
    for (const id of [...s0.battlefield]) if (s0.objects[id]!.controller === ap) s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
    const s = settle(act(s0, { type: "playLand", player: ap, objectId: ids[0]! }));
    expect(s.pending).toBeNull();
    expect(zone(s, ids[0]!)).toBe("hand");
  });

  it("each opponent picks one of their own creatures; no choice when there's only one (CR 701.21)", () => {
    const { s: s0, ap, ids, opp } = setup([edict]);
    const others = s0.turnOrder.filter((p) => p !== ap);
    const a1 = putOnBattlefield(s0, opp, bear());
    const a2 = putOnBattlefield(s0, opp, bear({ name: "Big Bear", power: "5", toughness: "5" }));
    const b1 = putOnBattlefield(s0, others.find((p) => p !== opp)!, bear());
    let s = settle(passAll(run(s0, planCast(s0, ap, ids[0]!))));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: opp, action: "sacrifice", count: 1, options: expect.arrayContaining([a1, a2]) });
    s = settle(act(s, { type: "pickPermanents", player: opp, ids: [a1] }));
    expect([zone(s, a1), zone(s, a2), zone(s, b1)]).toEqual(["graveyard", "battlefield", "graveyard"]);
    expect(() => act(s, { type: "pickPermanents", player: opp, ids: [a2] })).toThrow();
  });

  it("each player, the creature's controller too", () => {
    const { s: s0, ap, ids, opp } = setup([marauder]);
    const foe = putOnBattlefield(s0, opp, bear());
    let s = settle(passAll(run(s0, planCast(s0, ap, ids[0]!))));
    while (s.pending) s = settle(answer(s, 0));
    expect(zone(s, ids[0]!)).toBe("graveyard"); // its only creature
    expect(zone(s, foe)).toBe("graveyard");
  });

  it("bots sacrifice their least valuable creature", () => {
    const { s: s0, ap, ids, opp } = setup([edict]);
    const small = putOnBattlefield(s0, opp, bear({ name: "Tiny", power: "1", toughness: "1" }));
    const big = putOnBattlefield(s0, opp, bear({ name: "Huge", power: "6", toughness: "6" }));
    s0.players[opp]!.isBot = true;
    let s = settle(passAll(run(s0, planCast(s0, ap, ids[0]!))));
    s = settle(botActions(s, opp).reduce((x, a) => act(x, a), s));
    expect([zone(s, small), zone(s, big)]).toEqual(["graveyard", "battlefield"]);
  });
});

describe("exile until it leaves the battlefield (CR 610.3)", () => {
  it("comes back under its owner's control as a new object when the source leaves", () => {
    supported(light);
    const { s: s0, ap, ids, opp } = setup([light, shatter]);
    const foe = putOnBattlefield(s0, opp, bear());
    s0.objects[foe]!.counters["+1/+1"] = 2;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(passAll(s));
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(foe)] }));
    expect(zone(s, foe)).toBe("exile");
    s = settle(passAll(run(s, planCast(s, ap, ids[1]!, [target(ids[0]!)]))));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(zone(s, foe)).toBe("battlefield");
    expect(s.objects[foe]!.controller).toBe(opp);
    expect(s.objects[foe]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(logged(s, /returns to the battlefield \(Light Test left\)/)).toBe(true);
  });

  it("if the source left before its ability resolved, nothing is exiled (CR 610.3b)", () => {
    const { s: s0, ap, ids, opp } = setup([light, shatter]);
    const foe = putOnBattlefield(s0, opp, bear());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = passAll(s); // the enchantment resolves; its trigger goes on the stack
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [target(foe)] });
    expect(s.stack.length).toBe(1);
    // In response, destroy the enchantment.
    for (const a of planCast(s, ap, ids[1]!, [target(ids[0]!)])!) s = act(s, a);
    s = settle(s);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(zone(s, foe)).toBe("battlefield");
    expect(logged(s, /left the battlefield, so nothing is exiled/)).toBe(true);
  });

  it("an Aura comes back attached to something it can enchant, chosen by its owner (CR 303.4f)", () => {
    const { s: s0, ap, ids, opp } = setup([light, shatter]);
    const foe = putOnBattlefield(s0, opp, bear());
    const boon = putOnBattlefield(s0, opp, card("Boon Test", "Enchantment — Aura", "{G}", { oracleText: "Enchant creature\nEnchanted creature gets +2/+2.", keywords: ["Enchant"] }));
    s0.objects[boon]!.attachedTo = foe;
    let s = settle(passAll(run(s0, planCast(s0, ap, ids[0]!))));
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(boon)] }));
    expect(zone(s, boon)).toBe("exile");
    s = settle(passAll(run(s, planCast(s, ap, ids[1]!, [target(ids[0]!)]))));
    expect(zone(s, boon)).toBe("battlefield");
    expect(s.objects[boon]!.attachedTo).toBe(foe);
    expect(power(s, foe)).toBe(4);
  });

  it("a token exiled this way doesn't come back", () => {
    const { s: s0, ap, ids, opp } = setup([light, shatter]);
    const tok = putOnBattlefield(s0, opp, bear());
    s0.objects[tok]!.isToken = true;
    let s = settle(passAll(run(s0, planCast(s0, ap, ids[0]!))));
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(tok)] }));
    s = settle(passAll(run(s, planCast(s, ap, ids[1]!, [target(ids[0]!)]))));
    expect(s.objects[tok]?.zone).not.toBe("battlefield");
  });
});

describe("entering", () => {
  it("an Equipment attaches itself to target creature you control", () => {
    supported(armor, cathar);
    const { s: s0, ap, ids } = setup([armor]);
    const mine = putOnBattlefield(s0, ap, bear());
    let s = settle(passAll(run(s0, planCast(s0, ap, ids[0]!))));
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(mine)] }));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(mine);
    expect(power(s, mine)).toBe(4);
  });

  it("target creature can't block this turn", () => {
    const { s: s0, ap, ids, opp } = setup([cathar]);
    const foe = putOnBattlefield(s0, opp, bear());
    let s = settle(passAll(run(s0, planCast(s0, ap, ids[0]!))));
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(foe)] }));
    expect(characteristics(s, s.objects[foe]!).cantBlock).toBe(true);
  });

  it("riot: a +1/+1 counter or haste, chosen as it enters", () => {
    supported(rioter, unleashed, spirits);
    expect(compileCard(rioter).entersOptions).toEqual(["riot"]);
    const { s: s0, ap, ids } = setup([rioter, { ...rioter, oracleId: "riot2", name: "Riot Two" }]);
    let s = settle(passAll(run(s0, planCast(s0, ap, ids[0]!))));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "riot", options: ["+1/+1 counter", "Haste"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Haste" }));
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Haste")).toBe(true);
    expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
    s = settle(passAll(run(s, planCast(s, ap, ids[1]!))));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "+1/+1 counter" }));
    expect(power(s, ids[1]!)).toBe(2);
    expect(objHasKeyword(s, s.objects[ids[1]!]!, "Haste")).toBe(false);
  });

  it("what triggers on it entering sees the counter (evolve)", () => {
    const { s: s0, ap, ids } = setup([rioter]);
    const ooze = putOnBattlefield(s0, ap, evolver);
    let s = settle(passAll(run(s0, planCast(s0, ap, ids[0]!))));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "+1/+1 counter" }));
    expect(s.objects[ooze]!.counters["+1/+1"]).toBe(1);
  });

  it("unleash: with its counter it can't block", () => {
    const { s: s0, ap, ids } = setup([unleashed]);
    let s = settle(passAll(run(s0, planCast(s0, ap, ids[0]!))));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "unleash" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "+1/+1 counter" }));
    expect(power(s, ids[0]!)).toBe(3);
    expect(characteristics(s, s.objects[ids[0]!]!).cantBlock).toBe(true);
    s.objects[ids[0]!]!.counters = {};
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[ids[0]!]!).cantBlock).toBe(false);
  });

  it("afterlife makes Spirits when it dies", () => {
    const { s: s0, ap, ids } = setup([spirits]);
    let s = settle(passAll(run(s0, planCast(s0, ap, ids[0]!))));
    s.objects[ids[0]!]!.damage = 1;
    s = settle(act(s, { type: "passPriority", player: ap }));
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Spirit"));
    expect(tokens.length).toBe(2);
    expect(characteristics(s, s.objects[tokens[0]!]!).keywords).toContain("Flying");
  });
});

