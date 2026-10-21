// Round 108, more cards: Seize the Spotlight ("each opponent chooses fame or fortune", then "for each player who chose
// fame, gain control of a creature that player controls"), Walk-In Closet // Forgotten Cellar and Yawgmoth's Will (play
// lands and cast spells from your graveyard this turn; cards that would go to your graveyard are exiled instead, a
// replacement effect, CR 614.1a) and The Aetherspark (a planeswalker Equipment that can't be attacked while attached,
// CR 506.4 legality of attack targets, with a granted combat damage trigger).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passUntil, putOnBattlefield, scry, setup, target } from "./helpers";
import {
  abilitiesOf,
  attackablePermanentProblem,
  characteristics,
  controllerOf,
  invalidateCharacteristics,
  isFullySupported,
  legalActions,
  planActivate,
  planCast,
  planUnlock,
  waitingOn,
  type CardDef,
  type GameState,
  type PlayerId,
} from "../src";

// Real oracle text (Scryfall).
const seize = card("Seize the Spotlight", "Sorcery", "{2}{R}", {
  oracleText:
    "Each opponent chooses fame or fortune. For each player who chose fame, gain control of a creature that player controls until end of turn. Untap those creatures and they gain haste until end of turn. For each player who chose fortune, you draw a card and create a Treasure token.",
});
const REMINDER = "\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)";
const closet = scry("split", [
  { name: "Walk-In Closet", mana_cost: "{2}{G}", type_line: "Enchantment — Room", oracle_text: `You may play lands from your graveyard.${REMINDER}` },
  {
    name: "Forgotten Cellar",
    mana_cost: "{3}{G}{G}",
    type_line: "Enchantment — Room",
    oracle_text: `When you unlock this door, you may cast spells from your graveyard this turn, and if a card would be put into your graveyard from anywhere this turn, exile it instead.${REMINDER}`,
  },
]);
const will = card("Yawgmoth's Will", "Sorcery", "{2}{B}", {
  oracleText: "Until end of turn, you may play lands and cast spells from your graveyard.\nIf a card would be put into your graveyard from anywhere this turn, exile that card instead.",
});
const aetherspark = card("The Aetherspark", "Legendary Artifact Planeswalker — Equipment", "{4}", {
  loyalty: "4",
  oracleText:
    'As long as The Aetherspark is attached to a creature, The Aetherspark can\'t be attacked and has "Whenever equipped creature deals combat damage during your turn, put that many loyalty counters on The Aetherspark."\n+1: Attach The Aetherspark to up to one target creature you control. Put a +1/+1 counter on that creature.\n−5: Draw two cards.\n−10: Add ten mana of any one color.',
});
// Test cards.
const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." });
const dune = card("Test Dunes", "Land");

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const hand = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.length;
const order = (s: GameState, ap: PlayerId) => [1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(ap) + i) % 4]!);
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).name === name);
/** Put a card into its owner's graveyard straight from nowhere (a test shortcut). */
const inGraveyard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
};

describe("Seize the Spotlight", () => {
  it("each opponent chooses in turn order; you choose a creature of each fame player's, take it, untap it, give it haste; fortune draws and makes a Treasure", () => {
    supported(seize);
    const { s: s0, ap, ids } = setup([seize]);
    let s = s0;
    const [o1, o2, o3] = order(s, ap);
    const a = putOnBattlefield(s, o1!, bear({ name: "Bear A" }));
    const a2 = putOnBattlefield(s, o1!, bear({ name: "Bear A2" }));
    const c = putOnBattlefield(s, o3!, bear({ name: "Bear C" }));
    s.objects[a2]!.tapped = true;
    s.objects[c]!.tapped = true;
    s = cast(s, ap, ids[0]!);
    // APNAP: the opponents in turn order, each with the two words (CR 101.4).
    for (const [pid, word] of [[o1, "fame"], [o2, "fortune"], [o3, "fame"]] as const) {
      expect(s.pending).toMatchObject({ kind: "chooseOption", player: pid, what: "word", options: ["fame", "fortune"] });
      s = act(s, { type: "chooseOption", player: pid!, choice: word });
    }
    // o1 has two creatures: you choose one (not targeted). o3 has one: it's taken without asking.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, of: o1 });
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([a, a2].sort());
    const before = hand(s, ap);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [a2] }));
    expect(s.pending).toBeNull();
    for (const id of [a2, c]) {
      expect(controllerOf(s, s.objects[id]!)).toBe(ap);
      expect(s.objects[id]!.tapped).toBe(false);
      expect(characteristics(s, s.objects[id]!).keywords).toContain("Haste");
    }
    expect(controllerOf(s, s.objects[a]!)).toBe(o1);
    // One fortune: a card and a Treasure.
    expect(hand(s, ap)).toBe(before + 1);
    expect(named(s, ap, "Treasure Token")).toHaveLength(1);
    // Until end of turn.
    s = passUntil(s, "upkeep");
    expect(controllerOf(s, s.objects[a2]!)).toBe(o1);
    expect(controllerOf(s, s.objects[c]!)).toBe(o3);
  });
});

describe("Yawgmoth's Will", () => {
  it("lands and spells from your graveyard this turn; cards headed to your graveyard are exiled, Yawgmoth's Will itself too (rulings)", () => {
    supported(will);
    const { s: s0, ap, ids, opp } = setup([will]);
    let s = s0;
    const sh = inGraveyard(s, ap, shock);
    const land = inGraveyard(s, ap, dune);
    const theirs = inGraveyard(s, opp, shock);
    // Not before it resolves.
    expect(planCast(s, ap, sh, [{ kind: "player", id: opp }])).toBeNull();
    s = cast(s, ap, ids[0]!);
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    // Only your own graveyard.
    expect(planCast(s, ap, theirs, [{ kind: "player", id: opp }])).toBeNull();
    const life = s.players[opp]!.life;
    s = settle(planCast(s, ap, sh, [{ kind: "player", id: opp }], undefined, undefined, undefined, { via: "permission" })!.reduce((x, a) => act(x, a), s));
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(s.objects[sh]!.zone).toBe("exile");
    expect(legalActions(s, ap).some((a) => a.type === "playLand" && a.objectId === land)).toBe(true);
    s = act(s, { type: "playLand", player: ap, objectId: land });
    expect(s.objects[land]!.zone).toBe("battlefield");
    // A creature that dies goes to exile instead; a token still dies (only cards are exiled).
    const b = putOnBattlefield(s, ap, bear());
    const sh2 = putOnBattlefield(s, opp, shock);
    s.battlefield.splice(s.battlefield.indexOf(sh2), 1);
    s.objects[sh2]!.zone = "hand";
    s.players[opp]!.hand.push(sh2);
    s.objects[b]!.damage = 5;
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.objects[b]!.zone).toBe("exile");
    // Over at the end of the turn.
    s = passUntil(s, "upkeep");
    const later = putOnBattlefield(s, ap, bear());
    s.objects[later]!.damage = 5;
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.objects[later]!.zone).toBe("graveyard");
  });
});

describe("Walk-In Closet // Forgotten Cellar", () => {
  it("Walk-In Closet: play lands from your graveyard while it's unlocked", () => {
    supported(closet);
    const { s: s0, ap } = setup([]);
    let s = s0;
    const r = putOnBattlefield(s, ap, closet);
    const land = inGraveyard(s, ap, dune);
    expect(legalActions(s, ap).some((a) => a.type === "playLand" && a.objectId === land)).toBe(false);
    s.objects[r]!.unlocked = [0];
    invalidateCharacteristics(s);
    expect(abilitiesOf(s, s.objects[r]!).landsFromGraveyard).toBe(true);
    s = act(s, { type: "playLand", player: ap, objectId: land });
    expect(s.objects[land]!.zone).toBe("battlefield");
  });

  it("unlocking Forgotten Cellar: spells from your graveyard this turn, and cards are exiled instead", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const r = putOnBattlefield(s, ap, closet);
    const sh = inGraveyard(s, ap, shock);
    expect(planCast(s, ap, sh, [{ kind: "player", id: opp }])).toBeNull();
    s = settle(planUnlock(s, ap, r, 1)!.reduce((x, a) => act(x, a), s));
    expect(s.objects[r]!.unlocked).toEqual([1]);
    const life = s.players[opp]!.life;
    s = settle(planCast(s, ap, sh, [{ kind: "player", id: opp }], undefined, undefined, undefined, { via: "permission" })!.reduce((x, a) => act(x, a), s));
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(s.objects[sh]!.zone).toBe("exile");
    // Lands aren't spells: Forgotten Cellar alone doesn't let you play one.
    const land = inGraveyard(s, ap, dune);
    expect(legalActions(s, ap).some((a) => a.type === "playLand" && a.objectId === land)).toBe(false);
  });
});

describe("The Aetherspark", () => {
  it("+1 attaches it with a +1/+1 counter; attached, it can't be attacked; combat damage on your turn adds that many loyalty", () => {
    supported(aetherspark);
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const sp = putOnBattlefield(s, ap, aetherspark);
    s.objects[sp]!.counters.loyalty = 4;
    const b = putOnBattlefield(s, ap, bear());
    // Unattached: an opponent could attack it.
    expect(attackablePermanentProblem(s, opp, ap, sp)).toBeNull();
    s = settle(planActivate(s, ap, sp, 0, [target(b)])!.reduce((x, a) => act(x, a), s));
    expect(s.objects[sp]!.attachedTo).toBe(b);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[sp]!.counters.loyalty).toBe(5);
    expect(attackablePermanentProblem(s, opp, ap, sp)).toMatch(/can't be attacked/);
    // The bear (3/3 now) hits an opponent: three more loyalty.
    s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    for (let i = 0; i < 200 && s.step !== "endCombat"; i++) {
      const p = s.pending;
      if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[sp]!.counters.loyalty).toBe(8);
  });

  it("not during another player's turn: blocking deals combat damage, but no loyalty", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const sp = putOnBattlefield(s, ap, aetherspark);
    s.objects[sp]!.counters.loyalty = 4;
    const b = putOnBattlefield(s, ap, bear());
    s = settle(planActivate(s, ap, sp, 0, [target(b)])!.reduce((x, a) => act(x, a), s));
    const opp = order(s, ap)[0]!;
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear", toughness: "5" }));
    s = passUntil(s, "upkeep", opp);
    s = act(passUntil(s, "declareAttackers", opp), { type: "declareAttackers", player: opp, attacks: [{ attacker: theirs, defender: ap }] });
    for (let i = 0; i < 200 && s.step !== "endCombat"; i++) {
      const p = s.pending;
      if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: p.player === ap ? [{ blocker: b, attacker: theirs }] : [] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[theirs]!.damage).toBe(3);
    expect(s.objects[sp]!.counters.loyalty).toBe(5);
  });
});
