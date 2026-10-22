// Round 112, more of the most played cards: Karn, the Great Creator, ...

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, castProblem, characteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

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

const vandal = card("Masked Vandal", "Creature — Shapeshifter", "{1}{G}", {
  power: "1",
  toughness: "3",
  keywords: ["Changeling"],
  oracleText: "Changeling (This card is every creature type.)\nWhen this creature enters, you may exile a creature card from your graveyard. If you do, exile target artifact or enchantment an opponent controls.",
});

describe("Masked Vandal", () => {
  it("is supported", () => expect(isFullySupported(vandal)).toBe(true));

  const enter = (withCard: boolean, yes: boolean) => {
    const { s: s0, ap, ids, opp } = setup([vandal]);
    const rock = putOnBattlefield(s0, opp, card("Their Rock", "Artifact", "{2}", {}));
    const dead = withCard ? toZoneGy(s0, ap, bear({ name: "Dead Bear" })) : undefined;
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay" && s.pending?.kind !== "searchLibrary" && (s.stack.length || s.pending); i++) {
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: rock }] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes });
    if (s.pending?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: ap, found: s.pending.cards.slice(0, 1) });
    s = passAll(s);
    return { s, rock, dead };
  };

  it("exiling a creature card from your graveyard exiles their artifact", () => {
    const { s, rock, dead } = enter(true, true);
    expect(s.objects[dead!]!.zone).toBe("exile");
    expect(s.objects[rock]!.zone).toBe("exile");
  });

  it("not exiling one, or having none, leaves it", () => {
    const no = enter(true, false);
    expect(no.s.objects[no.dead!]!.zone).toBe("graveyard");
    expect(no.s.objects[no.rock]!.zone).toBe("battlefield");
    const none = enter(false, true);
    expect(none.s.objects[none.rock]!.zone).toBe("battlefield");
  });
});

const liliana = card("Liliana of the Dark Realms", "Legendary Planeswalker — Liliana", "{2}{B}{B}", {
  loyalty: "3",
  oracleText:
    "+1: Search your library for a Swamp card, reveal it, put it into your hand, then shuffle.\n−3: Target creature gets +X/+X or -X/-X until end of turn, where X is the number of Swamps you control.\n−6: You get an emblem with \"Swamps you control have '{T}: Add {B}{B}{B}{B}.'\"",
});

describe("Liliana of the Dark Realms", () => {
  it("is supported", () => expect(isFullySupported(liliana)).toBe(true));

  for (const [choice, pt] of [["0", "4/4"], ["1", null]] as const)
    it(`−3: the choice is made as it resolves, X the Swamps you control then (${choice === "0" ? "+X/+X" : "-X/-X"})`, () => {
      let { s, ap } = setup([]);
      const l = putOnBattlefield(s, ap, liliana);
      s.objects[l]!.counters.loyalty = 3;
      const b = putOnBattlefield(s, ap, bear());
      for (const a of planActivate(s, ap, l, 1, [{ kind: "object", id: b }])!) s = act(s, a);
      s = passAll(s);
      expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("either");
      s = passAll(act(s, { type: "chooseOption", player: ap, choice }));
      if (pt) expect(`${power(s, s.objects[b]!)}/${toughness(s, s.objects[b]!)}`).toBe(pt);
      else expect(s.objects[b]!.zone).toBe("graveyard");
    });
});

const foodChain = card("Food Chain", "Enchantment", "{2}{G}", {
  oracleText: "Exile a creature you control: Add X mana of any one color, where X is 1 plus the exiled creature's mana value. Spend this mana only to cast creature spells.",
});

describe("Food Chain", () => {
  it("is supported", () => expect(isFullySupported(foodChain)).toBe(true));

  it("exiling a creature adds 1 plus its mana value of one color, only for creature spells", () => {
    let { s, ap } = setup([]);
    const fc = putOnBattlefield(s, ap, foodChain);
    const b = putOnBattlefield(s, ap, card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" }));
    s = act(s, { type: "activateAbility", player: ap, objectId: fc, index: 0, costs: { sacrifice: [b] } });
    expect(s.pending?.kind).toBe("chooseOption");
    if (s.pending?.kind === "chooseOption") s = act(s, { type: "chooseOption", player: ap, choice: s.pending.options.find((o) => /green/i.test(o))! });
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.players[ap]!.manaPool.G).toBe(5);
    expect(s.players[ap]!.manaLots?.filter((l) => l.mana === "G" && l.only).reduce((n, l) => n + l.n, 0)).toBe(5);
  });
});

const mindskinner = card("The Mindskinner", "Legendary Creature — Nightmare", "{U}{U}{U}", {
  power: "10",
  toughness: "1",
  oracleText: "The Mindskinner can't be blocked.\nIf a source you control would deal damage to an opponent, prevent that damage and each opponent mills that many cards.",
});

describe("The Mindskinner", () => {
  it("is supported", () => expect(isFullySupported(mindskinner)).toBe(true));

  it("damage from a source you control to an opponent is prevented and each opponent mills that many", () => {
    const { s: s0, ap, ids, opp } = setup([card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." })]);
    putOnBattlefield(s0, ap, mindskinner);
    const libs = s0.turnOrder.map((p) => s0.players[p]!.library.length);
    const life = s0.players[opp]!.life;
    const s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(s.players[opp]!.life).toBe(life);
    s.turnOrder.forEach((p, i) => expect(s.players[p]!.library.length, `player ${p}`).toBe(libs[i]! - (p === ap ? 0 : 3)));
    expect(s.log.some((l) => /mills 3 cards \(The Mindskinner\)/.test(l.text))).toBe(true);
  });

  it("damage to you, to creatures, or from an opponent's source is dealt as usual", () => {
    const { s: s0, ap, ids, opp } = setup([card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." })]);
    putOnBattlefield(s0, opp, mindskinner);
    const life = s0.players[opp]!.life;
    const s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(s.players[opp]!.life).toBe(life - 3);
  });

  it("damage that can't be prevented is dealt, and they mill too (CR 615.12)", () => {
    const { s: s0, ap, ids, opp } = setup([card("Unpreventable Test", "Instant", "{R}", { oracleText: "Damage can't be prevented this turn. Unpreventable Test deals 3 damage to any target." })]);
    putOnBattlefield(s0, ap, mindskinner);
    const lib = s0.players[opp]!.library.length;
    const life = s0.players[opp]!.life;
    const s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.players[opp]!.library.length).toBe(lib - 3);
  });
});

const teferi = card("Teferi, Master of Time", "Legendary Planeswalker — Teferi", "{2}{U}{U}", {
  loyalty: "3",
  oracleText:
    "You may activate loyalty abilities of Teferi, Master of Time on any player's turn any time you could cast an instant.\n+1: Draw a card, then discard a card.\n−3: Target creature you don't control phases out.\n−10: Take two extra turns after this one.",
});

describe("Teferi, Master of Time", () => {
  it("is supported", () => expect(isFullySupported(teferi)).toBe(true));

  it("its loyalty abilities can be activated on another player's turn, still once a turn; other planeswalkers' can't", () => {
    let { s, ap } = setup([]);
    const t = putOnBattlefield(s, ap, teferi);
    s.objects[t]!.counters.loyalty = 3;
    const other = putOnBattlefield(s, ap, liliana);
    s.objects[other]!.counters.loyalty = 3;
    const next = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s = passUntil(s, "upkeep", next);
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(abilityProblem(s, ap, other, 0)).toMatch(/sorcery/);
    expect(abilityProblem(s, ap, t, 0)).toBeNull();
    const hand = s.players[ap]!.hand.length;
    s = act(s, { type: "activateAbility", player: ap, objectId: t, index: 0 });
    expect(s.objects[t]!.counters.loyalty).toBe(4);
    expect(abilityProblem(s, ap, t, 0)).toMatch(/already activated/);
    s = passAll(s);
    if (s.pending?.kind === "discard") s = act(s, { type: "discard", player: ap, objectIds: s.players[ap]!.hand.slice(0, 1) });
    expect(s.players[ap]!.hand.length).toBe(hand);
  });
});

const orb = card("Carnelian Orb of Dragonkind", "Artifact", "{2}{R}", {
  oracleText: "{T}: Add {R}. If that mana is spent on a Dragon creature spell, it gains haste until end of turn.",
});

describe("Carnelian Orb of Dragonkind", () => {
  it("is supported", () => expect(isFullySupported(orb)).toBe(true));

  for (const [def, haste] of [[card("Whelp", "Creature — Dragon", "{R}", { power: "1", toughness: "1" }), true], [card("Goblin Guide Test", "Creature — Goblin", "{R}", { power: "2", toughness: "2" }), false]] as const)
    it(`its mana gives ${def.name} ${haste ? "haste" : "nothing"}`, () => {
      const { s: s0, ap, ids } = setup([def]);
      const o = putOnBattlefield(s0, ap, orb);
      let s = act(s0, { type: "activateMana", player: ap, objectId: o, mana: "R" });
      for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
      s = passAll(s);
      expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
      expect(objHasKeyword(s, s.objects[ids[0]!]!, "Haste")).toBe(haste);
    });
});

const nakia = card("Nakia, Wakandan Operative", "Legendary Creature — Human Warrior Hero", "{2}{G}", {
  power: "3",
  toughness: "3",
  keywords: ["Reach"],
  oracleText: "Reach\nWhenever your commander enters, you become the monarch.\n{2}, {T}: Put two +1/+1 counters on target creature or Vehicle. Activate only as a sorcery.",
});
const tome = card("Tome of Legends", "Artifact", "{2}", {
  oracleText: "This artifact enters with a page counter on it.\nWhenever your commander enters or attacks, put a page counter on this artifact.\n{1}, {T}, Remove a page counter from this artifact: Draw a card.",
});

describe("Tome of Legends (whenever your commander enters or attacks)", () => {
  it("is supported, and so are Nakia and Search for Dagger", () => {
    expect(isFullySupported(tome)).toBe(true);
    expect(isFullySupported(nakia)).toBe(true);
    expect(isFullySupported(card("Search for Dagger", "Enchantment", "{1}{W}", { oracleText: "Whenever your commander enters or attacks, look at the top six cards of your library. You may reveal a legendary creature card from among them and put it into your hand. Put the rest on the bottom of your library in a random order." }))).toBe(true);
  });

  it("Nakia: you become the monarch when your commander enters", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, nakia);
    expect(s.monarch).toBeUndefined();
    const mine = s.players[ap]!.command[0]!;
    for (const a of planCast(s, ap, mine)!) s = act(s, a);
    s = passAll(s);
    expect(s.monarch).toBe(ap);
  });

  it("a page counter when your commander enters and when it attacks, not for another creature or someone else's commander", () => {
    let { s, ap, opp } = setup([]);
    const t = putOnBattlefield(s, ap, tome);
    const pages = () => s.objects[t]!.counters.page ?? 0;
    const start = pages();
    const cmd = s.players[ap]!.command[0]!;
    // Cast from the command zone.
    for (const a of planCast(s, ap, cmd)!) s = act(s, a);
    s = passAll(s);
    expect(s.objects[cmd]!.zone).toBe("battlefield");
    expect(pages()).toBe(start + 1);
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Commander" }));
    s.objects[theirs]!.isCommander = true;
    const other = putOnBattlefield(s, ap, bear());
    s.objects[cmd]!.controlledSinceTurn = s.turn - 1;
    s = attackWith(s, ap, [cmd, other]);
    s = passAll(s);
    expect(pages()).toBe(start + 2);
  });
});

const dracogenesis = card("Dracogenesis", "Enchantment", "{6}{R}{R}", { oracleText: "You may cast Dragon spells without paying their mana costs." });

describe("Dracogenesis", () => {
  it("is supported", () => expect(isFullySupported(dracogenesis)).toBe(true));

  it("Dragon spells can be cast without paying their mana costs; others can't", () => {
    const { s: s0, ap, ids } = setup([card("Big Dragon", "Creature — Dragon", "{9}{R}{R}", { power: "9", toughness: "9" }), card("Big Giant", "Creature — Giant", "{9}{R}{R}", { power: "9", toughness: "9" })]);
    putOnBattlefield(s0, ap, dracogenesis);
    const free = { alt: "payZero" as const };
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, undefined, free)).toBeNull();
    expect(castProblem(s0, ap, ids[1]!, undefined, undefined, undefined, undefined, undefined, free)).not.toBeNull();
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, free)!) s = act(s, a);
    s = passAll(s);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
  });
});
