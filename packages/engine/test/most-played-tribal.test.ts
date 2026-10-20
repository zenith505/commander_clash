// Creature-type cards from the most played Commander cards: mana "of the chosen type" (Unclaimed Territory, Secluded
// Courtyard), "and that spell can't be countered" (Cavern of Souls, Delighted Halfling), Path of Ancestry's "when that
// mana is spent", and costs and triggers of the chosen type (Herald's Horn, Urza's Incubator, Kindred Discovery).

import { describe, expect, it } from "vitest";
import { act, bear, card, fourPlayerGame, forest, island, passUntil, putOnBattlefield } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ManaType, type PlayerId, type TargetChoice } from "../src";

// Real oracle text (Scryfall).
const cavern = card("Cavern of Souls", "Land", "", { oracleText: "As this land enters, choose a creature type.\n{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a creature spell of the chosen type, and that spell can't be countered." });
const territory = card("Unclaimed Territory", "Land", "", { oracleText: "As this land enters, choose a creature type.\n{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a creature spell of the chosen type." });
const courtyard = card("Secluded Courtyard", "Land", "", { oracleText: "As this land enters, choose a creature type.\n{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a creature spell of the chosen type or activate an ability of a creature source of the chosen type." });
const halfling = card("Delighted Halfling", "Creature — Halfling Citizen", "{G}", { power: "1", toughness: "2", oracleText: "{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a legendary spell, and that spell can't be countered." });
const path = card("Path of Ancestry", "Land", "", { oracleText: "This land enters tapped.\n{T}: Add one mana of any color in your commander's color identity. When that mana is spent to cast a creature spell that shares a creature type with your commander, scry 1. (Look at the top card of your library. You may put that card on the bottom.)" });
const horn = card("Herald's Horn", "Artifact", "{3}", { oracleText: "As this artifact enters, choose a creature type.\nCreature spells you cast of the chosen type cost {1} less to cast.\nAt the beginning of your upkeep, look at the top card of your library. If it's a creature card of the chosen type, you may reveal it and put it into your hand." });
const incubator = card("Urza's Incubator", "Artifact", "{3}", { oracleText: "As this artifact enters, choose a creature type.\nCreature spells of the chosen type cost {2} less to cast." });
const discovery = card("Kindred Discovery", "Enchantment", "{3}{U}{U}", { oracleText: "As this enchantment enters, choose a creature type.\nWhenever a creature you control of the chosen type enters or attacks, draw a card." });
const counterspell = card("Counterspell", "Instant", "{U}{U}", { oracleText: "Counter target spell." });
const elf = card("Llanowar Elves", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1", oracleText: "{T}: Add {G}." });
const bigBear = card("Big Bear", "Creature — Bear", "{3}{G}", { power: "4", toughness: "4" });

const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
/** Everyone passes until the stack is empty or someone has a choice to make. */
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Pass until `pid` has priority again, with the stack as it is. */
function priorityTo(s: GameState, pid: PlayerId) {
  if (waitingOn(s) === pid) s = act(s, { type: "passPriority", player: pid });
  for (let i = 0; i < 4 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
}
/** The active player's first main phase, with no lands. */
function fresh(): { s: GameState; ap: PlayerId; opp: PlayerId } {
  const s = passUntil(fourPlayerGame(), "main1");
  const ap = s.activePlayer;
  return { s, ap, opp: s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]! };
}
/** A card in `pid`'s hand. */
function give(s: GameState, pid: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
}
/** A permanent that entered with this creature type chosen. */
function typed(s: GameState, pid: PlayerId, def: CardDef, type: string) {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.chosen = { type };
  return id;
}
const tapFor = (s: GameState, pid: PlayerId, id: string, mana: ManaType, ability = 1) => act(s, { type: "activateMana", player: pid, objectId: id, mana, ability });

describe("creature types and mana from the most played cards", () => {
  it("parse", () => {
    for (const d of [cavern, territory, courtyard, halfling, path, horn, incubator, discovery]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Unclaimed Territory's colored mana pays only for creature spells of the chosen type", () => {
    const { s: s0, ap } = fresh();
    typed(s0, ap, territory, "Bear");
    putOnBattlefield(s0, ap, forest);
    const b = give(s0, ap, bear());
    const e = give(s0, ap, card("Elvish Twins", "Creature — Elf", "{G}{G}", { power: "2", toughness: "2" }));
    // The Elf can't use it for its second {G}.
    expect(planCast(s0, ap, e)).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, b)));
    expect(s.objects[b]!.zone).toBe("battlefield");
  });

  it("Unclaimed Territory with no type chosen: its colored mana can't be spent", () => {
    const { s: s0, ap } = fresh();
    putOnBattlefield(s0, ap, territory);
    putOnBattlefield(s0, ap, forest);
    const b = give(s0, ap, bigBear);
    expect(planCast(s0, ap, b)).toBeNull();
  });

  it("Secluded Courtyard's mana also pays for abilities of creatures of the chosen type", () => {
    const { s: s0, ap } = fresh();
    const yard = typed(s0, ap, courtyard, "Bear");
    let s = tapFor(s0, ap, yard, "R");
    expect(s.players[ap]!.manaLots?.[0]?.only?.text).toMatch(/\(Bear\)\.$/);
  });

  it("Cavern of Souls: a creature spell of the chosen type it paid for can't be countered", () => {
    for (const useCavern of [true, false]) {
      const { s: s0, ap, opp } = fresh();
      const cav = typed(s0, ap, cavern, "Bear");
      putOnBattlefield(s0, ap, forest);
      const b = give(s0, ap, bear());
      for (let i = 0; i < 2; i++) putOnBattlefield(s0, opp, island);
      const cs = give(s0, opp, counterspell);
      let s = useCavern ? tapFor(s0, ap, cav, "G") : act(s0, { type: "activateMana", player: ap, objectId: cav, mana: "C", ability: 0 });
      s = run(s, planCast(s, ap, b));
      expect(s.objects[b]!.zone).toBe("stack");
      s = priorityTo(s, opp);
      const target: TargetChoice = { kind: "stack", id: s.stack[s.stack.length - 1]!.id };
      s = settle(run(s, planCast(s, opp, cs, [target])));
      expect(s.objects[cs]!.zone).toBe("graveyard");
      expect(s.objects[b]!.zone, useCavern ? "Cavern mana" : "colorless").toBe(useCavern ? "battlefield" : "graveyard");
    }
  });

  it("Delighted Halfling: legendary spells it paid for can't be countered", () => {
    const { s: s0, ap, opp } = fresh();
    const h = putOnBattlefield(s0, ap, halfling);
    putOnBattlefield(s0, ap, forest);
    const cmd = s0.players[ap]!.command[0]!;
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, opp, island);
    const cs = give(s0, opp, counterspell);
    let s = tapFor(s0, ap, h, "G");
    s = run(s, planCast(s, ap, cmd));
    s = priorityTo(s, opp);
    s = settle(run(s, planCast(s, opp, cs, [{ kind: "stack", id: s.stack[s.stack.length - 1]!.id }])));
    expect(s.objects[cmd]!.zone).toBe("battlefield");
  });

  it("Path of Ancestry: scry 1 when its mana casts a creature sharing a type with your commander", () => {
    for (const [def, scries] of [[elf, true], [bear(), false]] as const) {
      const { s: s0, ap } = fresh();
      const p = putOnBattlefield(s0, ap, path);
      const c = give(s0, ap, def);
      if (def !== elf) putOnBattlefield(s0, ap, forest);
      let s = tapFor(s0, ap, p, "G", 0);
      s = run(s, planCast(s, ap, c));
      const triggered = s.triggerQueue.some((t) => t.sourceId === p) || s.stack.some((x) => x.kind === "ability" && x.sourceId === p);
      expect(triggered, def.name).toBe(scries);
      for (let i = 0; i < 20 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
        const pid = waitingOn(s)!;
        s = s.pending ? run(s, botActions(s, pid)) : act(s, { type: "passPriority", player: pid });
      }
      expect(s.objects[c]!.zone).toBe("battlefield");
    }
  });

  it("Herald's Horn and Urza's Incubator make creature spells of the chosen type cheaper", () => {
    const { s: s0, ap, opp } = fresh();
    typed(s0, ap, horn, "Bear");
    typed(s0, opp, incubator, "Bear");
    // {3}{G} less 1 and 2: {G}.
    putOnBattlefield(s0, ap, forest);
    const b = give(s0, ap, bigBear);
    const e = give(s0, ap, card("Elvish Visionary", "Creature — Elf Shaman", "{1}{G}", { power: "1", toughness: "1" }));
    expect(planCast(s0, ap, e)).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, b)));
    expect(s.objects[b]!.zone).toBe("battlefield");
  });

  it("Herald's Horn: at your upkeep, a creature card of the chosen type on top may go to your hand", () => {
    for (const [type, takes] of [["Bear", true], ["Elf", false]] as const) {
      const { s: s0, ap } = fresh();
      typed(s0, ap, horn, type);
      const lib = s0.players[ap]!.library;
      const bearOnTop = lib.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Grizzly Bears")!;
      lib.splice(lib.indexOf(bearOnTop), 1);
      lib.unshift(bearOnTop);
      let s = passUntil(s0, "upkeep", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 3) % 4]!);
      // The top card stays put while the others take their turns.
      s.players[ap]!.library.splice(s.players[ap]!.library.indexOf(bearOnTop), 1);
      s.players[ap]!.library.unshift(bearOnTop);
      s = passUntil(s, "upkeep", ap);
      for (let i = 0; i < 20 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
        const pid = waitingOn(s)!;
        if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: pid, yes: true });
        else if (s.pending) s = run(s, botActions(s, pid));
        else s = act(s, { type: "passPriority", player: pid });
      }
      expect(s.objects[bearOnTop]!.zone, type).toBe(takes ? "hand" : "library");
    }
  });

  it("Kindred Discovery draws when a creature of the chosen type enters or attacks", () => {
    const { s: s0, ap } = fresh();
    typed(s0, ap, discovery, "Bear");
    putOnBattlefield(s0, ap, forest);
    putOnBattlefield(s0, ap, forest);
    const b = give(s0, ap, bear());
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planCast(s0, ap, b)));
    expect(s.objects[b]!.zone).toBe("battlefield");
    // The Bear left the hand, a card came in.
    expect(s.players[ap]!.hand.length).toBe(hand);
    s.objects[b]!.controlledSinceTurn = -1;
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]! }] });
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
});
