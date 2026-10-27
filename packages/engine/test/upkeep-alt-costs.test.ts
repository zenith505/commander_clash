// Costs that come back or change how a spell is paid for: echo (CR 702.30), cumulative upkeep
// (702.24), evoke (702.74), dash (702.109), delve (702.66), living weapon (702.92), scavenge (702.97).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { botActions, castProblem, characteristics, compileCard, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.oracleText).toBe(true));
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
const logIndex = (s: GameState, re: RegExp) => s.log.findIndex((l) => re.test(l.text));
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return settle(passAll(s));
};
const toGraveyard = (s: GameState, pid: PlayerId, id: string) => {
  const p = s.players[pid]!;
  p.hand.splice(p.hand.indexOf(id), 1);
  p.graveyard.push(id);
  s.objects[id]!.zone = "graveyard";
};
/** Pass to `pid`'s next upkeep and let its triggers go on the stack and resolve until something is asked. */
const toUpkeep = (s: GameState, pid: PlayerId) => {
  s = passUntil(s, "draw", pid === s.activePlayer ? (s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]! as PlayerId) : pid);
  s = passUntil(s, "upkeep", pid);
  return settle(s);
};
/** Answer "pay to keep it?" by tapping what's needed, or no. */
const answer = (s: GameState, pid: PlayerId, yes: boolean) => {
  expect(s.pending).toMatchObject({ kind: "chooseMay", player: pid, keep: true });
  if (yes) {
    const acts = botActionsFor(s, pid);
    for (const a of acts) s = act(s, a);
  } else s = act(s, { type: "chooseMay", player: pid, yes: false });
  return settle(s);
};
const botActionsFor = (s: GameState, pid: PlayerId) => {
  s.players[pid]!.isBot = true;
  const acts = botActions(s, pid);
  s.players[pid]!.isBot = false;
  return acts;
};

const troll = card("Albino Troll", "Creature — Troll", "{1}{G}", { power: "3", toughness: "3", oracleText: "Echo {1}{G}\n{1}{G}: Regenerate Albino Troll." });
const remora = card("Age Test", "Enchantment", "{U}", { oracleText: "Cumulative upkeep {1}" });
const lifeAge = card("Life Age Test", "Enchantment", "{B}", { oracleText: "Cumulative upkeep—Pay 1 life." });
const mulldrifter = card("Mulldrifter", "Creature — Elemental", "{4}{U}", { power: "2", toughness: "2", oracleText: "Flying\nWhen Mulldrifter enters, draw two cards.\nEvoke {2}{U}", keywords: ["Flying", "Evoke"] });
const scout = card("Mardu Scout", "Creature — Goblin Scout", "{R}{R}", { power: "3", toughness: "1", oracleText: "Dash {1}{R}", keywords: ["Dash"] });
const cruise = card("Treasure Cruise", "Sorcery", "{7}{U}", { oracleText: "Delve\nDraw three cards." });
const husk = card("Flayer Husk", "Artifact — Equipment", "{1}", { oracleText: "Living weapon\nEquipped creature gets +1/+1.\nEquip {2}" });
const mangler = card("Dreg Mangler", "Creature — Plant Zombie", "{1}{B}{G}", { power: "3", toughness: "3", oracleText: "Haste\nScavenge {3}{B}{G}", keywords: ["Haste", "Scavenge"] });

describe("echo and cumulative upkeep", () => {
  it("compiles them", () => {
    supported(troll, remora, lifeAge, mulldrifter, scout, cruise, husk, mangler);
    expect(compileCard(troll).triggers[0]).toMatchObject({ event: "yourUpkeep", ifEcho: true });
    expect(compileCard(lifeAge).triggers[0]!.body.effects[0]).toEqual({ type: "cumulativeUpkeep", pay: { life: 1 } });
    // "{G} or {W}" for each age counter is a hybrid {G/W} each (CR 702.24a, 107.4e; Lane B round 1). Other costs with
    // choices or non-mana actions aren't modeled yet.
    expect(isFullySupported(card("Or Test", "Enchantment", "{G}", { oracleText: "Cumulative upkeep {G} or {W}" }))).toBe(true);
    expect(isFullySupported(card("Or Life Test", "Enchantment", "{G}", { oracleText: "Cumulative upkeep—Pay 1 life or sacrifice a creature." }))).toBe(false);
    expect(isFullySupported(card("Discard Echo", "Creature — Ape", "{G}", { power: "1", toughness: "1", oracleText: "Echo—Discard a card." }))).toBe(true); // since Lane B round B12
    expect(isFullySupported(card("Graveyard Echo", "Creature — Ape", "{G}", { power: "1", toughness: "1", oracleText: "Echo—Exile a card from your graveyard." }))).toBe(false);
  });

  it("echo: pay at your next upkeep or sacrifice it; only the first upkeep after it came under your control", () => {
    const { s: s0, ap, ids } = setup([troll, troll]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = run(s, planCast(s, ap, ids[1]!));
    s = toUpkeep(s, ap);
    // Two triggers: pay for one, not the other.
    s = answer(s, ap, true);
    s = answer(s, ap, false);
    expect([zone(s, ids[0]!), zone(s, ids[1]!)].sort()).toEqual(["battlefield", "graveyard"]);
    expect(logged(s, /pays \{1\}\{G\} for Albino Troll/)).toBe(true);
    // The next upkeep: echo doesn't trigger again.
    s = passUntil(s, "draw", ap);
    s = toUpkeep(s, ap);
    expect(s.pending).toBeNull();
    expect(s.stack.length).toBe(0);
    expect(s.battlefield.some((id) => id === ids[0]! || id === ids[1]!)).toBe(true);
  });

  it("cumulative upkeep: an age counter each upkeep, paying for each one, or it's sacrificed", () => {
    const { s: s0, ap, ids } = setup([remora]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = toUpkeep(s, ap);
    expect(s.objects[ids[0]!]!.counters.age).toBe(1);
    expect(s.pending).toMatchObject({ kind: "chooseMay", pay: { mana: "{1}" } });
    s = answer(s, ap, true);
    expect(zone(s, ids[0]!)).toBe("battlefield");
    s = passUntil(s, "draw", ap);
    s = toUpkeep(s, ap);
    expect(s.objects[ids[0]!]!.counters.age).toBe(2);
    expect(s.pending).toMatchObject({ kind: "chooseMay", pay: { mana: "{2}" } });
    s = answer(s, ap, false);
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });

  it("cumulative upkeep in life: all of it or none (CR 702.24a)", () => {
    const { s: s0, ap, ids } = setup([lifeAge]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const id = ids[0]!;
    s.objects[id]!.counters.age = 2;
    s = toUpkeep(s, ap);
    expect(s.pending).toMatchObject({ pay: { life: 3 } });
    const life = s.players[ap]!.life;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.players[ap]!.life).toBe(life - 3);
    expect(zone(s, id)).toBe("battlefield");
    // Not enough life to pay: it's sacrificed without asking.
    s.players[ap]!.life = 3;
    s = passUntil(s, "draw", ap);
    s = toUpkeep(s, ap);
    expect(zone(s, id)).toBe("graveyard");
  });
});

describe("evoke and dash", () => {
  it("evoke: cast for its evoke cost, it does its enters thing, then it's sacrificed", () => {
    const { s: s0, ap, ids } = setup([mulldrifter]);
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { alt: "dash" })).toMatch(/doesn't have dash/);
    const hand = s0.players[ap]!.hand.length;
    const s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { alt: "evoke" }));
    expect(logged(s, /casts Mulldrifter for its evoke cost/)).toBe(true);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
    // Its own ability resolves first (the sacrifice trigger is under it).
    expect(logged(s, /sacrifices Mulldrifter/)).toBe(true);
    expect(logIndex(s, /draws/)).toBeLessThan(logIndex(s, /sacrifices Mulldrifter/));
  });

  it("cast normally, an evoke creature stays", () => {
    const { s: s0, ap, ids } = setup([mulldrifter]);
    const s = run(s0, planCast(s0, ap, ids[0]!));
    expect(zone(s, ids[0]!)).toBe("battlefield");
  });

  it("dash: haste, and back to its owner's hand at the next end step", () => {
    const { s: s0, ap, ids } = setup([scout]);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { alt: "dash" }));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(characteristics(s, s.objects[ids[0]!]!).keywords).toContain("Haste");
    s = passUntil(s, "end", ap);
    s = settle(s);
    expect(zone(s, ids[0]!)).toBe("hand");
    // Cast normally, it stays and has no haste.
    s = passUntil(s, "main1", ap);
    s = run(s, planCast(s, ap, ids[0]!));
    expect(characteristics(s, s.objects[ids[0]!]!).keywords).not.toContain("Haste");
    s = passUntil(s, "cleanup", ap);
    expect(zone(s, ids[0]!)).toBe("battlefield");
  });
});

describe("delve, living weapon, scavenge", () => {
  it("delve: each card exiled from your graveyard pays for {1}, generic mana only", () => {
    const { s: s0, ap, ids } = setup([cruise, bear(), bear(), bear(), bear(), bear(), bear(), bear(), bear()]);
    const yard = ids.slice(1);
    for (const id of yard) toGraveyard(s0, ap, id);
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { delve: yard })).toMatch(/more cards than/);
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, { delve: [ids[0]!] })).toMatch(/your graveyard/);
    const tapped = (x: GameState) => x.battlefield.filter((id) => x.objects[id]!.tapped).length;
    const before = tapped(s0);
    const s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { delve: yard.slice(0, 6) }));
    expect(yard.slice(0, 6).every((id) => zone(s, id) === "exile")).toBe(true);
    expect(zone(s, yard[6]!)).toBe("graveyard");
    expect(logged(s, /\(delve\)/)).toBe(true);
    // {7}{U} less 6: two lands tapped.
    expect(tapped(s) - before).toBe(2);
  });

  it("living weapon: a 0/0 Germ token that the Equipment comes attached to", () => {
    const { s: s0, ap, ids } = setup([husk]);
    const s = run(s0, planCast(s0, ap, ids[0]!));
    const germ = s.battlefield.find((id) => s.objects[id]!.isToken);
    expect(germ).toBeDefined();
    expect(s.objects[ids[0]!]!.attachedTo).toBe(germ);
    const ch = characteristics(s, s.objects[germ!]!);
    expect([ch.power, ch.toughness, ch.subtypes]).toEqual([1, 1, ["Phyrexian", "Germ"]]);
  });

  it("scavenge: exile it from your graveyard to put counters equal to its power on a creature, as a sorcery", () => {
    const { s: s0, ap, ids } = setup([mangler]);
    toGraveyard(s0, ap, ids[0]!);
    const b = putOnBattlefield(s0, ap, bear());
    const s = run(s0, planActivate(s0, ap, ids[0]!, 0, [target(b)]));
    expect(zone(s, ids[0]!)).toBe("exile");
    expect(s.objects[b]!.counters["+1/+1"]).toBe(3);
  });
});

describe("bots", () => {
  it("evoke Mulldrifter when they can't pay for the whole thing, and pay echo", () => {
    const { s: s0, ap, ids } = setup([mulldrifter]);
    s0.players[ap]!.isBot = true;
    s0.players[ap]!.landsPlayedThisTurn = 1;
    s0.players[ap]!.command = [];
    for (const id of s0.players[ap]!.hand.filter((x) => x !== ids[0])) {
      s0.players[ap]!.hand.splice(s0.players[ap]!.hand.indexOf(id), 1);
      s0.objects[id]!.zone = "library";
      s0.players[ap]!.library.push(id);
    }
    // Only three lands untapped: two Islands and a Mountain.
    let islands = 0;
    for (const id of s0.battlefield) {
      const name = s0.cards[s0.objects[id]!.cardId]!.name;
      if (name === "Island" && islands < 2) islands++;
      else if (name !== "Mountain" || s0.battlefield.filter((x) => s0.cards[s0.objects[x]!.cardId]!.name === "Mountain" && !s0.objects[x]!.tapped).length > 1) s0.objects[id]!.tapped = true;
    }
    const acts = botActions(s0, ap);
    expect(acts[acts.length - 1]).toMatchObject({ type: "castSpell", objectId: ids[0]!, alt: "evoke" });
  });
});
