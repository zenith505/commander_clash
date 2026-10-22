// Round 112, more of the most played cards: Karn, the Great Creator, ...

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, putOnBattlefield, setup } from "./helpers";
import { castProblem, characteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const karn = card("Karn, the Great Creator", "Legendary Planeswalker — Karn", "{4}", {
  loyalty: "5",
  oracleText:
    "Activated abilities of artifacts your opponents control can't be activated.\n+1: Until your next turn, up to one target noncreature artifact becomes an artifact creature with power and toughness each equal to its mana value.\n−2: You may reveal an artifact card you own from outside the game or choose a face-up artifact card you own in exile. Put that card into your hand.",
});
const coax = card("Coax from the Blind Eternities", "Sorcery", "{2}{U}", {
  oracleText: "You may reveal an Eldrazi card you own from outside the game or choose a face-up Eldrazi card you own in exile. Put that card into your hand.",
});
const vault = card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." });
const equipment = card("Lightning Greaves", "Artifact — Equipment", "{X}{2}", { oracleText: "Equipped creature has haste and shroud.\nEquip {0}" });

const toExile = (s: GameState, pid: PlayerId, def: CardDef, faceDown = false) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "exile";
  if (faceDown) s.objects[id]!.hiddenExile = { by: "", seen: [pid], label: "Face down" };
  s.players[pid]!.exile.push(id);
  return id;
};

/** Pass along, answering every pending choice the dull way, until `stop` holds. */
function until(s: GameState, stop: (s: GameState) => boolean, max = 3000) {
  for (let i = 0; i < max && !stop(s); i++) {
    const pid = waitingOn(s)!;
    const p = s.pending;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, p.count) });
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: pid, yes: false });
    else s = act(s, { type: "passPriority", player: pid });
  }
  if (!stop(s)) throw new Error("never stopped");
  return s;
}

describe("Karn, the Great Creator", () => {
  it("is supported, and so is Coax from the Blind Eternities", () => {
    expect(isFullySupported(karn)).toBe(true);
    expect(isFullySupported(coax)).toBe(true);
  });

  it("+1: a noncreature artifact is an artifact creature with P/T equal to its mana value until your next turn", () => {
    let { s, ap } = setup([]);
    const k = putOnBattlefield(s, ap, karn);
    s.objects[k]!.counters.loyalty = 5;
    const stone = putOnBattlefield(s, ap, vault);
    const greaves = putOnBattlefield(s, ap, equipment);
    for (const a of planActivate(s, ap, k, 0, [{ kind: "object", id: stone }])!) s = act(s, a);
    s = passAll(s);
    const ch = characteristics(s, s.objects[stone]!);
    expect(ch.types).toEqual(["Artifact", "Creature"]);
    expect([power(s, s.objects[stone]!), toughness(s, s.objects[stone]!)]).toEqual([2, 2]);
    expect(s.objects[k]!.counters.loyalty).toBe(6);
    // Once a turn (CR 606.3): not again this turn.
    expect(planActivate(s, ap, k, 0, [{ kind: "object", id: greaves }])).toBeNull();
    // It lasts through the other players' turns, and ends as your next turn begins.
    const turn = s.turn;
    s = until(s, (x) => x.turn === turn + 3 && x.step === "main1");
    expect(characteristics(s, s.objects[stone]!).types).toContain("Creature");
    s = until(s, (x) => x.activePlayer === ap && x.turn > turn && x.step === "main1");
    expect(characteristics(s, s.objects[stone]!).types).toEqual(["Artifact"]);
  });

  it("+1 on an Equipment with X in its cost: it's a 2/2 artifact creature Equipment (X is 0)", () => {
    let { s, ap } = setup([]);
    const k = putOnBattlefield(s, ap, karn);
    s.objects[k]!.counters.loyalty = 5;
    const greaves = putOnBattlefield(s, ap, equipment);
    for (const a of planActivate(s, ap, k, 0, [{ kind: "object", id: greaves }])!) s = act(s, a);
    s = passAll(s);
    const ch = characteristics(s, s.objects[greaves]!);
    expect(ch.types).toEqual(["Artifact", "Creature"]);
    expect(ch.subtypes).toEqual(["Equipment"]);
    expect([power(s, s.objects[greaves]!), toughness(s, s.objects[greaves]!)]).toEqual([2, 2]);
  });

  it("−2: puts a face-up artifact card you own from exile into your hand; never a face-down one or another player's", () => {
    let { s, ap, opp } = setup([]);
    const k = putOnBattlefield(s, ap, karn);
    s.objects[k]!.counters.loyalty = 5;
    const up = toExile(s, ap, vault);
    const down = toExile(s, ap, equipment, true);
    const notArtifact = toExile(s, ap, card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    const theirs = toExile(s, opp, card("Their Stone", "Artifact", "{2}", {}));
    for (const a of planActivate(s, ap, k, 1)!) s = act(s, a);
    s = passAll(s);
    expect(s.pending?.kind).toBe("searchLibrary");
    if (s.pending?.kind !== "searchLibrary") return;
    expect(s.pending.cards).toEqual([up]);
    expect(s.pending.min).toBe(0);
    s = passAll(act(s, { type: "searchLibrary", player: ap, found: [up] }));
    expect(s.objects[up]!.zone).toBe("hand");
    expect(s.players[ap]!.hand).toContain(up);
    expect([down, notArtifact, theirs].map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile", "exile"]);
    expect(s.objects[k]!.counters.loyalty).toBe(3);
  });

  it("−2 with nothing in exile does nothing", () => {
    let { s, ap } = setup([]);
    const k = putOnBattlefield(s, ap, karn);
    s.objects[k]!.counters.loyalty = 5;
    const hand = s.players[ap]!.hand.length;
    for (const a of planActivate(s, ap, k, 1)!) s = act(s, a);
    s = passAll(s);
    expect(s.pending).toBeFalsy();
    expect(s.players[ap]!.hand.length).toBe(hand);
  });

  it("opponents' artifacts' activated abilities can't be activated", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, opp, karn);
    const stone = putOnBattlefield(s, ap, vault);
    expect(planActivate(s, ap, stone, 0)).toBeNull();
  });
});

const ainok = card("Ainok Strike Leader", "Creature — Dog Warrior", "{1}{W}", {
  power: "2",
  toughness: "2",
  oracleText:
    "Whenever you attack with this creature and/or your commander, for each opponent, create a 1/1 red Goblin creature token that's tapped and attacking that player.\nSacrifice this creature: Creature tokens you control gain indestructible until end of turn.",
});

const attackWith = (s: GameState, ap: PlayerId, attackers: string[]) => {
  const defender = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % s.turnOrder.length]!;
  while (s.pending?.kind !== "declareAttackers") s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender })) });
};
const goblins = (s: GameState, ap: PlayerId) => s.battlefield.map((id) => s.objects[id]!).filter((o) => o.isToken && o.controller === ap && characteristics(s, o).subtypes.includes("Goblin"));

describe("Ainok Strike Leader", () => {
  it("is supported", () => expect(isFullySupported(ainok)).toBe(true));

  it("attacking with it: a tapped Goblin attacking each opponent", () => {
    let { s, ap } = setup([]);
    const a = putOnBattlefield(s, ap, ainok);
    s = attackWith(s, ap, [a]);
    s = passAll(s);
    const gs = goblins(s, ap);
    expect(gs.length).toBe(3);
    expect(gs.every((g) => g.tapped)).toBe(true);
    expect(new Set(gs.map((g) => g.attacking))).toEqual(new Set(s.turnOrder.filter((p) => p !== ap)));
  });

  it("attacking with your commander only: it triggers too, once", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, ainok);
    const cmd = putOnBattlefield(s, ap, bear({ name: "Commander Bear" }));
    s.objects[cmd]!.isCommander = true;
    s = attackWith(s, ap, [cmd]);
    s = passAll(s);
    expect(goblins(s, ap).length).toBe(3);
  });

  it("not for another creature, nor for a commander you don't own", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, ainok);
    const other = putOnBattlefield(s, ap, bear());
    const borrowed = putOnBattlefield(s, ap, bear({ name: "Their Commander" }));
    s.objects[borrowed]!.isCommander = true;
    s.objects[borrowed]!.owner = opp;
    s = attackWith(s, ap, [other, borrowed]);
    s = passAll(s);
    expect(goblins(s, ap).length).toBe(0);
  });
});

const cage = card("Grafdigger's Cage", "Artifact", "{1}", {
  oracleText: "Creature cards in graveyards and libraries can't enter the battlefield.\nPlayers can't cast spells from graveyards or libraries.",
});
const runestone = card("Weathered Runestone", "Artifact", "{2}", {
  oracleText: "Nonland permanent cards in graveyards and libraries can't enter the battlefield.\nPlayers can't cast spells from graveyards or libraries.",
});
const jailer = card("Soulless Jailer", "Artifact Creature — Phyrexian Golem", "{2}", {
  power: "0",
  toughness: "4",
  oracleText: "Permanent cards in graveyards can't enter the battlefield.\nPlayers can't cast noncreature spells from graveyards or exile.",
});
const zombify = card("Zombify", "Sorcery", "{3}{B}", { oracleText: "Return target creature card from your graveyard to the battlefield." });
const looting = card("Faithless Looting", "Sorcery", "{R}", { oracleText: "Draw two cards, then discard two cards.\nFlashback {2}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)" });
const tutorIn = card("Test Summoning", "Sorcery", "{G}", { oracleText: "Search your library for a creature card, put it onto the battlefield, then shuffle." });
const unearth = card("Return to the Ranks Test", "Sorcery", "{1}{W}", { oracleText: "Return target artifact card from your graveyard to the battlefield." });

describe("Grafdigger's Cage and the like", () => {
  it("are supported", () => {
    for (const d of [cage, runestone, jailer, card("Kunoros, Hound of Athreos", "Legendary Creature — Dog", "{1}{W}{B}", { power: "3", toughness: "3", oracleText: "Vigilance, menace, lifelink\nCreature cards in graveyards can't enter the battlefield.\nPlayers can't cast spells from graveyards." })])
      expect(isFullySupported(d), d.name).toBe(true);
  });

  it("a creature card in a graveyard can't be returned to the battlefield: it stays there", () => {
    const { s: s0, ap, ids, opp } = setup([zombify]);
    putOnBattlefield(s0, opp, cage);
    const dead = toZoneGy(s0, ap, bear({ name: "Dead Bear" }));
    const s = cast(s0, ap, ids[0]!, [{ kind: "object", id: dead }]);
    expect(s.objects[dead]!.zone).toBe("graveyard");
    expect(s.log.some((l) => /Dead Bear can't enter the battlefield from a graveyard \(Grafdigger's Cage\)/.test(l.text))).toBe(true);
  });

  it("a noncreature card can, under Grafdigger's Cage but not Weathered Runestone", () => {
    for (const [ban, enters] of [[cage, true], [runestone, false]] as const) {
      const { s: s0, ap, ids, opp } = setup([unearth]);
      putOnBattlefield(s0, opp, ban);
      const rock = toZoneGy(s0, ap, card("Mind Rock", "Artifact", "{2}", {}));
      const s = cast(s0, ap, ids[0]!, [{ kind: "object", id: rock }]);
      expect(s.objects[rock]!.zone, ban.name).toBe(enters ? "battlefield" : "graveyard");
    }
  });

  it("a creature card found in a library stays there", () => {
    const { s: s0, ap, ids, opp } = setup([tutorIn]);
    putOnBattlefield(s0, opp, cage);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    s = passAll(s);
    expect(s.pending?.kind).toBe("searchLibrary");
    if (s.pending?.kind !== "searchLibrary") return;
    const found = s.pending.cards[0]!;
    s = passAll(act(s, { type: "searchLibrary", player: ap, found: [found] }));
    expect(s.objects[found]!.zone).toBe("library");
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).types.includes("Creature")).length).toBe(0);
  });

  it("no spells cast from graveyards: flashback can't be used", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, opp, cage);
    const fl = toZoneGy(s, ap, looting);
    expect(castProblem(s, ap, fl, undefined, undefined, undefined, undefined, undefined, { via: "flashback" })).toMatch(/Grafdigger's Cage: players can't cast spells from graveyards/);
    expect(planCast(s, ap, fl)).toBeNull();
  });

  it("Soulless Jailer: no noncreature spells from exile either, but a creature spell from exile is fine", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, opp, jailer);
    const ex = toZoneGy(s, ap, card("Exiled Shock", "Instant", "{R}", { oracleText: "Exiled Shock deals 2 damage to any target." }), "exile");
    s.objects[ex]!.mayPlay = { player: ap, zc: s.objects[ex]!.zoneChanges ?? 0, until: "thisTurn", turn: s.turn } as never;
    expect(castProblem(s, ap, ex)).toMatch(/Soulless Jailer: players can't cast noncreature spells from exile/);
    const exBear = toZoneGy(s, ap, bear({ name: "Exiled Bear" }), "exile");
    s.objects[exBear]!.mayPlay = { player: ap, zc: s.objects[exBear]!.zoneChanges ?? 0, until: "thisTurn", turn: s.turn } as never;
    expect(castProblem(s, ap, exBear) ?? "").not.toMatch(/Soulless Jailer/);
  });
});

function toZoneGy(s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "exile" = "graveyard") {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  s.players[pid]![zone].push(id);
  return id;
}
