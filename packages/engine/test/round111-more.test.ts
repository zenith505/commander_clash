// Round 111, more cards: Single Combat ("until the end of your next turn"), Generous Plunderer ("you may create a
// Treasure token. When you do, ..."; "the number of artifacts they control" for the defending player).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { castProblem, characteristics, invalidateCharacteristics, isFullySupported, power, toughness, objHasKeyword, planActivate, planCast, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const singleCombat = card("Single Combat", "Sorcery", "{3}{W}{W}", {
  oracleText:
    "Each player chooses a creature or planeswalker they control, then sacrifices the rest. Players can't cast creature or planeswalker spells until the end of your next turn.",
});
const plunderer = card("Generous Plunderer", "Creature — Human Rogue", "{1}{R}", {
  power: "2",
  toughness: "2",
  keywords: ["Menace"],
  oracleText:
    "Menace\nAt the beginning of your upkeep, you may create a Treasure token. When you do, target opponent creates a tapped Treasure token.\nWhenever this creature attacks, it deals damage to defending player equal to the number of artifacts they control.",
});
const akiri = card("Akiri, Fearless Voyager", "Legendary Creature — Kor Warrior", "{1}{R}{W}", {
  power: "3",
  toughness: "3",
  oracleText:
    "Whenever you attack a player with one or more equipped creatures, draw a card.\n{W}: You may unattach an Equipment from a creature you control. If you do, tap that creature and it gains indestructible until end of turn.",
});
const horizon = card("Horizon Explorer", "Creature — Insect Scout", "{2}{G}", {
  power: "2",
  toughness: "4",
  oracleText:
    "Lands you control enter untapped.\nWhenever you attack a player, create a Lander token. (It's an artifact with \"{2}, {T}, Sacrifice this token: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.\")",
});
const bonesplitter = card("Bonesplitter", "Artifact — Equipment", "{1}", { oracleText: "Equipped creature gets +2/+0.\nEquip {1}" });
const smithy = scry("transform", [
  {
    name: "Thousand Moons Smithy",
    mana_cost: "{2}{W}{W}",
    type_line: "Legendary Artifact",
    oracle_text:
      'When Thousand Moons Smithy enters, create a white Gnome Soldier artifact creature token with "This token\'s power and toughness are each equal to the number of artifacts and/or creatures you control."\nAt the beginning of your first main phase, you may tap five untapped artifacts and/or creatures you control. If you do, transform Thousand Moons Smithy.',
  },
  {
    name: "Barracks of the Thousand",
    type_line: "Legendary Artifact Land",
    color_indicator: ["W"],
    oracle_text:
      '(Transforms from Thousand Moons Smithy.)\n{T}: Add {W}.\nWhenever you cast an artifact or creature spell using mana produced by Barracks of the Thousand, create a white Gnome Soldier artifact creature token with "This token\'s power and toughness are each equal to the number of artifacts and/or creatures you control."',
  },
]);
const nashi = card("Nashi, Moon Sage's Scion", "Legendary Creature — Rat Ninja", "{1}{B}{B}", {
  power: "3",
  toughness: "2",
  keywords: ["Ninjutsu"],
  oracleText:
    "Ninjutsu {3}{B} ({3}{B}, Return an unblocked attacker you control to hand: Put this card onto the battlefield from your hand tapped and attacking.)\nWhenever Nashi deals combat damage to a player, exile the top card of each player's library. Until end of turn, you may play one of those cards. If you cast a spell this way, pay life equal to its mana value rather than paying its mana cost.",
});
const looter = card("Likeness Looter", "Creature — Faerie Shapeshifter", "{U}{B}", {
  power: "1",
  toughness: "1",
  keywords: ["Flying"],
  oracleText:
    "Flying\n{T}: Draw a card, then discard a card.\n{X}: This creature becomes a copy of target creature card in your graveyard with mana value X, except it has flying and this ability. Activate only as a sorcery.",
});
const everybodyLives = card("Everybody Lives!", "Instant", "{1}{W}", {
  oracleText:
    "All creatures gain hexproof and indestructible until end of turn. Players gain hexproof until end of turn. Players can't lose life this turn and players can't lose the game or win the game this turn.",
});
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const constrictor = card("Winding Constrictor", "Creature — Snake", "{B}{G}", {
  power: "2",
  toughness: "3",
  oracleText:
    "If one or more counters would be put on an artifact or creature you control, that many plus one of each of those kinds of counters are put on that permanent instead.\nIf you would get one or more counters, you get that many plus one of each of those kinds of counters instead.",
});
const counterSpell = card("Test Counters", "Sorcery", "{G}", { oracleText: "Put a +1/+1 counter and a lifelink counter on target creature." });
const energySpell = card("Test Energy", "Sorcery", "{G}", { oracleText: "You get {E}{E}." });
const treasure = card("Treasure", "Token Artifact — Treasure", "", { oracleText: "{T}, Sacrifice this token: Add one mana of any color." });

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

describe("Single Combat", () => {
  it("is supported, and no one casts creature spells until the end of the caster's next turn", () => {
    expect(isFullySupported(singleCombat)).toBe(true);
    let { s, ap, ids, opp } = setup([singleCombat, bear()]);
    const theirBear = putOnBattlefield(s, opp, bear());
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    s = passAll(s);
    expect(s.objects[theirBear]!.zone).toBe("battlefield");
    expect(planCast(s, ap, ids[1]!)).toBeNull();
    const start = s.turn;
    // An opponent's turn: still can't, and a creature put in their hand can't be cast either.
    s = until(s, (x) => x.activePlayer === opp && x.step === "main1");
    expect(s.cantCastThisTurn?.length).toBe(4);
    // The caster's next turn: still can't.
    s = until(s, (x) => x.activePlayer === ap && x.step === "main1" && x.turn > start);
    expect(planCast(s, ap, ids[1]!)).toBeNull();
    // After it: they can again.
    s = until(s, (x) => x.activePlayer === opp && x.step === "main1" && x.turn > start + 4);
    expect(s.cantCastThisTurn).toBeUndefined();
  });
});

describe("Generous Plunderer", () => {
  it("is supported; a Treasure for you means a tapped one for the opponent, and the attack counts their artifacts", () => {
    expect(isFullySupported(plunderer)).toBe(true);
    let { s, ap, opp } = setup([]);
    const p = putOnBattlefield(s, ap, plunderer);
    putOnBattlefield(s, opp, treasure);
    const start = s.turn;
    s = until(s, (x) => x.activePlayer === ap && x.turn > start && x.pending?.kind === "chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    // The reflexive trigger targets an opponent.
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const pend = s.pending as { kind: string };
    expect(pend.kind).toBe("chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] } as never);
    s = until(s, (x) => x.step === "main1" && x.activePlayer === ap);
    const treasures = (pid: number) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name.startsWith("Treasure"));
    expect(treasures(ap).length).toBe(1);
    expect(treasures(opp).length).toBe(2);
    expect(treasures(opp).filter((id) => s.objects[id]!.tapped).length).toBe(1);
    s = passUntil(s, "declareAttackers", ap);
    const life = s.players[opp]!.life;
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: p, defender: opp }] });
    for (let i = 0; i < 20 && s.players[opp]!.life === life; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[opp]!.life).toBe(life - 2);
  });
});

/** Attach `eq` to `to`. */
function equip(s: GameState, eq: string, to: string) {
  s.objects[eq]!.attachedTo = to;
  invalidateCharacteristics(s);
}

describe("Akiri, Fearless Voyager", () => {
  it("is supported, and draws a card for each player attacked by an equipped creature", () => {
    expect(isFullySupported(akiri)).toBe(true);
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, akiri);
    const [b1, b2, b3] = [putOnBattlefield(s, ap, bear()), putOnBattlefield(s, ap, bear()), putOnBattlefield(s, ap, bear())];
    equip(s, putOnBattlefield(s, ap, bonesplitter), b1!);
    equip(s, putOnBattlefield(s, ap, bonesplitter), b2!);
    const [o1, o2, o3] = s.turnOrder.filter((p) => p !== ap);
    s = passUntil(s, "declareAttackers", ap);
    const hand = s.players[ap]!.hand.length;
    // Two equipped creatures at one player, one at another, an unequipped one at the third: two cards.
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b1!, defender: o1! }, { attacker: b2!, defender: o2! }, { attacker: b3!, defender: o3! }] });
    expect(s.triggerQueue.length + s.stack.length).toBe(2);
    s = until(s, (x) => x.stack.length === 0 && x.triggerQueue.length === 0);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("unattaches an Equipment as the ability resolves; the creature taps and gains indestructible", () => {
    let { s, ap } = setup([]);
    const a = putOnBattlefield(s, ap, akiri);
    const b1 = putOnBattlefield(s, ap, bear());
    const b2 = putOnBattlefield(s, ap, bear());
    const e1 = putOnBattlefield(s, ap, bonesplitter);
    const e2 = putOnBattlefield(s, ap, bonesplitter);
    equip(s, e1, b1);
    equip(s, e2, b2);
    for (const x of planActivate(s, ap, a, 0)!) s = act(s, x);
    s = passAll(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "unattach", });
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([e1, e2].sort());
    s = act(s, { type: "pickPermanents", player: ap, ids: [e2] });
    expect(s.objects[e2]!.attachedTo).toBeUndefined();
    expect(s.objects[e2]!.zone).toBe("battlefield");
    expect(s.objects[e1]!.attachedTo).toBe(b1);
    expect(s.objects[b2]!.tapped).toBe(true);
    expect(s.objects[b1]!.tapped).toBe(false);
    expect(objHasKeyword(s, s.objects[b2]!, "Indestructible")).toBe(true);
    expect(objHasKeyword(s, s.objects[b1]!, "Indestructible")).toBe(false);
  });
});

describe("Whenever you attack a player", () => {
  it("triggers once for each player attacked (Horizon Explorer)", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, horizon);
    const [b1, b2] = [putOnBattlefield(s, ap, bear()), putOnBattlefield(s, ap, bear())];
    const [o1, o2] = s.turnOrder.filter((p) => p !== ap);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b1!, defender: o1! }, { attacker: b2!, defender: o2! }] });
    expect(s.triggerQueue.length + s.stack.length).toBe(2);
  });
});

describe("Thousand Moons Smithy", () => {
  it("is supported; its Gnome counts artifacts and creatures, and tapping five transforms it", () => {
    expect(isFullySupported(smithy)).toBe(true);
    let { s, ap, ids } = setup([smithy]);
    for (let i = 0; i < 3; i++) putOnBattlefield(s, ap, bear());
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    s = until(s, (x) => x.stack.length === 0 && x.triggerQueue.length === 0);
    const gnome = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name.startsWith("Gnome Soldier"))!;
    expect(gnome).toBeDefined();
    // Three Bears, the Smithy and the Gnome itself (rulings).
    expect([power(s, s.objects[gnome]!), toughness(s, s.objects[gnome]!)]).toEqual([5, 5]);
    putOnBattlefield(s, ap, bear());
    expect(power(s, s.objects[gnome]!)).toBe(6);
    const start = s.turn;
    s = until(s, (x) => x.activePlayer === ap && x.turn > start && x.pending?.kind === "chooseMay");
    expect(s.step).toBe("main1");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "tap", count: 5 });
    const options = (s.pending as { options: string[] }).options;
    expect(options.length).toBe(6);
    s = act(s, { type: "pickPermanents", player: ap, ids: options.slice(0, 5) });
    expect(options.slice(0, 5).every((id) => s.objects[id]!.tapped)).toBe(true);
    const me = s.battlefield.find((id) => s.objects[id]!.cardId === smithy.oracleId)!;
    expect(characteristics(s, s.objects[me]!).name).toBe("Barracks of the Thousand");
  });

  it("can't transform with fewer than five untapped", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, smithy);
    for (let i = 0; i < 3; i++) putOnBattlefield(s, ap, bear());
    const start = s.turn;
    s = until(s, (x) => x.activePlayer === ap && x.turn > start && x.step === "main1");
    expect(s.pending).toBeNull();
    const me = s.battlefield.find((id) => s.objects[id]!.cardId === smithy.oracleId)!;
    expect(characteristics(s, s.objects[me]!).name).toBe("Thousand Moons Smithy");
  });
});

describe("Nashi, Moon Sage's Scion", () => {
  it("is supported; exiles each player's top card, one of which may be played this turn, a spell for life", () => {
    expect(isFullySupported(nashi)).toBe(true);
    let { s, ap, opp } = setup([]);
    const n = putOnBattlefield(s, ap, nashi);
    // A Grizzly Bears on top of each library.
    for (const pid of s.turnOrder) {
      const lib = s.players[pid]!.library;
      const i = lib.findIndex((id) => s.cards[s.objects[id]!.cardId]!.name === "Grizzly Bears");
      lib.unshift(...lib.splice(i, 1));
    }
    const tops = s.turnOrder.map((pid) => s.players[pid]!.library[0]!);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: n, defender: opp }] });
    s = until(s, (x) => x.step === "main2");
    expect(tops.every((id) => s.objects[id]!.zone === "exile")).toBe(true);
    const [mine, theirs] = [tops[s.turnOrder.indexOf(ap)]!, tops[s.turnOrder.indexOf(opp)]!];
    // Only for life, equal to its mana value.
    expect(castProblem(s, ap, theirs)).toMatch(/pay life/);
    expect(castProblem(s, ap, theirs, undefined, undefined, undefined, undefined, undefined, { alt: "citadel" })).toBeNull();
    const life = s.players[ap]!.life;
    for (const a of planCast(s, ap, theirs, undefined, undefined, undefined, undefined, { alt: "citadel" })!) s = act(s, a);
    s = until(s, (x) => x.stack.length === 0);
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(s.players[ap]!.life).toBe(life - 2);
    // One of those cards only.
    expect(castProblem(s, ap, mine, undefined, undefined, undefined, undefined, undefined, { alt: "citadel" })).not.toBeNull();
  });
});

describe("Likeness Looter", () => {
  it("is supported, and becomes a copy of a creature card in your graveyard with mana value X, with flying and the ability", () => {
    expect(isFullySupported(looter)).toBe(true);
    let { s, ap } = setup([]);
    const l = putOnBattlefield(s, ap, looter);
    const dead = putOnBattlefield(s, ap, bear());
    s.battlefield.splice(s.battlefield.indexOf(dead), 1);
    s.objects[dead]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(dead);
    invalidateCharacteristics(s);
    const t = [{ kind: "object" as const, id: dead }];
    // X has to be the card's mana value.
    expect(planActivate(s, ap, l, 1, t as never, undefined, undefined, 3)).toBeNull();
    for (const a of planActivate(s, ap, l, 1, t as never, undefined, undefined, 2)!) s = act(s, a);
    s = passAll(s);
    const ch = characteristics(s, s.objects[l]!);
    expect(ch.name).toBe("Grizzly Bears");
    expect([power(s, s.objects[l]!), toughness(s, s.objects[l]!)]).toEqual([2, 2]);
    expect(objHasKeyword(s, s.objects[l]!, "Flying")).toBe(true);
    // It keeps the copying ability (its only activated ability now).
    expect(planActivate(s, ap, l, 0, t as never, undefined, undefined, 2)).not.toBeNull();
  });
});

describe("Everybody Lives!", () => {
  it("is supported: every player gets hexproof and can't lose life, lose or win this turn", () => {
    expect(isFullySupported(everybodyLives)).toBe(true);
    let { s, ap, ids, opp } = setup([everybodyLives, shock]);
    const b = putOnBattlefield(s, opp, bear());
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    s = passAll(s);
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    // Neither the player nor their creature can be targeted now.
    expect(planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }])).toBeNull();
    expect(planCast(s, ap, ids[1]!, [{ kind: "object", id: b }])).toBeNull();
    expect(objHasKeyword(s, s.objects[b]!, "Indestructible")).toBe(true);
    // No one loses: at 0 life the opponent stays in the game this turn.
    s.players[opp]!.life = 0;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[opp]!.lost).toBeFalsy();
  });
});

describe("Winding Constrictor", () => {
  it("is supported: one more of each kind on your artifacts and creatures, and on you", () => {
    expect(isFullySupported(constrictor)).toBe(true);
    let { s, ap, ids, opp } = setup([counterSpell, energySpell, counterSpell]);
    putOnBattlefield(s, ap, constrictor);
    const b = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, bear());
    for (const a of planCast(s, ap, ids[0]!, [{ kind: "object", id: b }])!) s = act(s, a);
    s = passAll(s);
    expect(s.objects[b]!.counters).toMatchObject({ "+1/+1": 2, lifelink: 2 });
    for (const a of planCast(s, ap, ids[1]!)!) s = act(s, a);
    s = passAll(s);
    expect(s.players[ap]!.energy).toBe(3);
    // Not on another player's creature.
    for (const a of planCast(s, ap, ids[2]!, [{ kind: "object", id: theirs }])!) s = act(s, a);
    s = passAll(s);
    expect(s.objects[theirs]!.counters).toMatchObject({ "+1/+1": 1, lifelink: 1 });
  });
});
