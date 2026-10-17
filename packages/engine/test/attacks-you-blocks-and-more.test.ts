// "Whenever a creature attacks you [or a planeswalker you control]" (CR 508.3a): each creature attacking this permanent's
// controller, or with "or a planeswalker you control" one of their planeswalkers too (the defending player is the
// planeswalker's controller, CR 506.2), as it's declared as an attacker; "that creature" and "its controller" are the
// attacker and its controller.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { isFullySupported, planActivate, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId; planeswalker?: string }[]) => settle(act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks }));

// Real oracle text (Scryfall).
const reckoning = card("Blood Reckoning", "Enchantment", "{3}{B}", { oracleText: "Whenever a creature attacks you or a planeswalker you control, that creature's controller loses 1 life." });
const miasma = card("Hissing Miasma", "Enchantment", "{1}{B}{B}", { oracleText: "Whenever a creature attacks you, its controller loses 1 life." });
const briar = card("Briar Patch", "Enchantment", "{1}{G}{G}", { oracleText: "Whenever a creature attacks you, it gets -1/-0 until end of turn." });
const archers = card("Palazzo Archers", "Creature — Human Archer", "{2}{G}", { power: "2", toughness: "3", keywords: ["Reach"], oracleText: "Reach\nWhenever a creature with flying attacks you or a planeswalker you control, this creature deals damage equal to its power to that creature." });
const circle = card("Circle of Flame", "Enchantment", "{1}{R}", { oracleText: "Whenever a creature without flying attacks you or a planeswalker you control, this enchantment deals 1 damage to that creature." });
const isperia = card("Isperia, Supreme Judge", "Legendary Creature — Sphinx", "{2}{W}{W}{U}{U}", { power: "6", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nWhenever a creature attacks you or a planeswalker you control, you may draw a card." });
const thantis = card("Thantis, the Warweaver", "Legendary Creature — Spider", "{3}{B}{R}{G}", { power: "5", toughness: "5", keywords: ["Reach", "Vigilance"], oracleText: "Reach, vigilance\nAll creatures attack each combat if able.\nWhenever a creature attacks you or a planeswalker you control, put a +1/+1 counter on Thantis." });
const vraska = card("Vraska, Regal Gorgon", "Legendary Planeswalker — Vraska", "{5}{B}{G}", { loyalty: "5", oracleText: "+2: Put a +1/+1 counter on up to one target creature. That creature gains menace until end of turn.\n−3: Destroy target creature.\n−10: For each creature card in your graveyard, put a +1/+1 counter on each creature you control." });
const bear = card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });
const bird = card("Test Bird", "Creature — Bird", "{1}{U}", { power: "3", toughness: "3", keywords: ["Flying"] });

describe("whenever a creature attacks you", () => {
  it("parse", () => supported(reckoning, miasma, briar, archers, circle, isperia, thantis));

  it("Blood Reckoning: each creature attacking you or your planeswalker, not another player", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, reckoning);
    const v = putOnBattlefield(s0, opp, vraska);
    s0.objects[v]!.counters.loyalty = 5;
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const [a, b, c] = [bear, bear, bear].map((d) => putOnBattlefield(s0, ap, d));
    const life = s0.players[ap]!.life;
    const s = attack(s0, ap, [{ attacker: a!, defender: opp }, { attacker: b!, defender: opp, planeswalker: v }, { attacker: c!, defender: other }]);
    expect(s.players[ap]!.life).toBe(life - 2);
  });

  it("Hissing Miasma and Briar Patch: not for a creature attacking your planeswalker", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, miasma);
    putOnBattlefield(s0, opp, briar);
    const v = putOnBattlefield(s0, opp, vraska);
    s0.objects[v]!.counters.loyalty = 5;
    const a = putOnBattlefield(s0, ap, bear);
    const b = putOnBattlefield(s0, ap, bear);
    const life = s0.players[ap]!.life;
    const s = attack(s0, ap, [{ attacker: a, defender: opp }, { attacker: b, defender: opp, planeswalker: v }]);
    expect(s.players[ap]!.life).toBe(life - 1);
    // Briar Patch: -1/-0 on the one attacking the player only.
    expect([pt(s, a), pt(s, b)]).toEqual(["1/2", "2/2"]);
  });

  it("Palazzo Archers and Circle of Flame: with and without flying", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, archers);
    putOnBattlefield(s0, opp, circle);
    const flier = putOnBattlefield(s0, ap, bird);
    const walker = putOnBattlefield(s0, ap, card("Big Bear", "Creature — Bear", "{3}{G}", { power: "4", toughness: "4" }));
    const s = attack(s0, ap, [{ attacker: flier, defender: opp }, { attacker: walker, defender: opp }]);
    expect(s.objects[flier]!.damage).toBe(2); // the Archers' power
    expect(s.objects[walker]!.damage).toBe(1); // Circle of Flame
  });

  it("Isperia draws; Thantis gets a counter for each attacker", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, isperia);
    const t = putOnBattlefield(s0, opp, thantis);
    const [a, b] = [bear, bear].map((d) => putOnBattlefield(s0, ap, d));
    const hand = s0.players[opp]!.hand.length;
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: a!, defender: opp }, { attacker: b!, defender: opp }] });
    for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes: true });
      else if (s.pending) break;
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.players[opp]!.hand.length).toBe(hand + 2);
    expect(s.objects[t]!.counters["+1/+1"]).toBe(2);
  });
});

// "Whenever a creature blocks" (anyone's) and "Whenever a creature you control becomes blocked": once for each such
// creature as blockers are declared (CR 509.3a, 509.3c); "it" and "that creature" are that creature.
const strain = card("Battle Strain", "Enchantment", "{1}{R}", { oracleText: "Whenever a creature blocks, this enchantment deals 1 damage to that creature's controller." });
const gladiator = card("Carnage Gladiator", "Creature — Skeleton Warrior", "{2}{B}{R}", { power: "4", toughness: "2", keywords: ["Regenerate"], oracleText: "Whenever a creature blocks, that creature's controller loses 1 life.\n{1}{B}{R}: Regenerate this creature." });
const alpha = card("Somberwald Alpha", "Creature — Wolf", "{3}{G}", { power: "3", toughness: "2", oracleText: "Whenever a creature you control becomes blocked, it gets +1/+1 until end of turn.\n{1}{G}: Target creature you control gains trample until end of turn. (It can deal excess combat damage to the player or planeswalker it's attacking.)" });
const ratter = card("Tattered Ratter", "Creature — Human Peasant", "{1}{R}", { power: "2", toughness: "2", oracleText: "Whenever a Rat you control becomes blocked, it gets +2/+0 until end of turn." });
const evasion = card("Cunning Evasion", "Enchantment", "{1}{U}", { oracleText: "Whenever a creature you control becomes blocked, you may return it to its owner's hand." });
const rat = card("Test Rat", "Creature — Rat", "{1}{B}", { power: "1", toughness: "1" });

function toBlocks(s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[], opp: PlayerId, blocks: { blocker: string; attacker: string }[]) {
  s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks });
  for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  while (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: s.pending.player === opp ? blocks : [] });
  return s;
}

describe("whenever a creature blocks or becomes blocked", () => {
  it("parse", () => supported(strain, gladiator, alpha, ratter, evasion));

  it("Battle Strain and Carnage Gladiator: once for each blocking creature, to its controller", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, strain);
    putOnBattlefield(s0, ap, gladiator);
    const [a, b] = [bear, bear].map((d) => putOnBattlefield(s0, ap, d));
    const [x, y] = [bear, bear].map((d) => putOnBattlefield(s0, opp, d));
    const life = s0.players[opp]!.life;
    const s = settle(toBlocks(s0, ap, [{ attacker: a!, defender: opp }, { attacker: b!, defender: opp }], opp, [{ blocker: x!, attacker: a! }, { blocker: y!, attacker: b! }]));
    expect(s.players[opp]!.life).toBe(life - 4);
    expect(s.players[ap]!.life).toBe(s0.players[ap]!.life);
  });

  it("Somberwald Alpha and Tattered Ratter: the blocked creatures you control, not the unblocked ones", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, alpha);
    putOnBattlefield(s0, ap, ratter);
    const r = putOnBattlefield(s0, ap, rat);
    const free = putOnBattlefield(s0, ap, bear);
    const x = putOnBattlefield(s0, opp, bear);
    const s = settle(toBlocks(s0, ap, [{ attacker: r, defender: opp }, { attacker: free, defender: opp }], opp, [{ blocker: x, attacker: r }]));
    expect(pt(s, r)).toBe("4/2");
    expect(pt(s, free)).toBe("2/2");
  });

  it("Cunning Evasion: you may return the blocked creature to its owner's hand", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, evasion);
    const a = putOnBattlefield(s0, ap, bear);
    const x = putOnBattlefield(s0, opp, bear);
    let s = toBlocks(s0, ap, [{ attacker: a, defender: opp }], opp, [{ blocker: x, attacker: a }]);
    for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes: true });
      else if (s.pending) break;
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[a]!.zone).toBe("hand");
  });
});

// "Whenever a creature deals damage to you" and "Whenever a source an opponent controls deals damage to you": once for
// each source dealing damage to this permanent's controller (CR 603.2c). A creature is "it"; for any source, "that player"
// is its controller and "that many" the damage.
const dread = card("Dread", "Creature — Elemental Incarnation", "{3}{B}{B}{B}", { power: "6", toughness: "6", keywords: ["Fear"], oracleText: "Fear (This creature can't be blocked except by artifact creatures and/or black creatures.)\nWhenever a creature deals damage to you, destroy it.\nWhen Dread is put into a graveyard from anywhere, shuffle it into its owner's library." });
const teysa = card("Teysa, Envoy of Ghosts", "Legendary Creature — Human Advisor", "{5}{W}{B}", { power: "4", toughness: "4", keywords: ["Vigilance", "Protection"], oracleText: "Vigilance, protection from creatures\nWhenever a creature deals combat damage to you, destroy that creature. Create a 1/1 white and black Spirit creature token with flying." });
const michiko = card("Michiko Konda, Truth Seeker", "Legendary Creature — Human Advisor", "{3}{W}", { power: "2", toughness: "2", oracleText: "Whenever a source an opponent controls deals damage to you, that player sacrifices a permanent of their choice." });
const griffin = card("Retaliator Griffin", "Creature — Griffin", "{1}{R}{G}{W}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying\nWhenever a source an opponent controls deals damage to you, you may put that many +1/+1 counters on this creature." });
const field = card("Dissipation Field", "Enchantment", "{2}{U}{U}", { oracleText: "Whenever a permanent deals damage to you, return it to its owner's hand." });
const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
const pinger = card("Prodigal Pyromancer", "Creature — Human Wizard", "{2}{R}", { power: "1", toughness: "1", oracleText: "{T}: This creature deals 1 damage to any target." });

/** Pass priority and answer "you may" with yes and a pick with the first options until nothing is left to do. */
function resolveAll(s: GameState) {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: true });
    else if (p?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: p.player, ids: p.options.slice(0, p.count) });
    else if (p) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
}

describe("whenever something deals damage to you", () => {
  it("parse", () => supported(dread, teysa, michiko, griffin, field));

  it("Dread destroys a creature that deals combat damage to you", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, dread);
    const a = putOnBattlefield(s0, ap, bear);
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    s = resolveAll(passUntil(s, "main2", ap));
    expect(s.objects[a]!.zone).toBe("graveyard");
  });

  it("Teysa: a creature's ability damage isn't combat damage", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, teysa);
    const p = putOnBattlefield(s0, ap, pinger);
    let s = s0;
    const plan = planActivate(s, ap, p, 0, [{ kind: "player", id: opp }])!;
    for (const x of plan) s = act(s, x);
    s = resolveAll(s);
    expect(s.players[opp]!.life).toBe(s0.players[opp]!.life - 1);
    expect(s.objects[p]!.zone).toBe("battlefield");
    // In combat it is.
    const a = putOnBattlefield(s, ap, bear);
    s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    const spirits = () => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === opp).length;
    s = resolveAll(passUntil(s, "main2", ap));
    expect(spirits()).toBe(1);
  });

  it("Michiko Konda and Retaliator Griffin: a spell from an opponent; the opponent sacrifices, the Griffin gets that many counters", () => {
    const { s: s0, ap, opp, ids } = setup([bolt]);
    putOnBattlefield(s0, opp, michiko);
    const g = putOnBattlefield(s0, opp, griffin);
    const before = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap).length;
    let s = s0;
    for (const x of planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])!) s = act(s, x);
    s = resolveAll(s);
    expect(s.objects[g]!.counters["+1/+1"]).toBe(3);
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap).length).toBe(before - 1);
  });

  it("Dissipation Field: a permanent that deals damage to you goes back to its owner's hand", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, field);
    const p = putOnBattlefield(s0, ap, pinger);
    let s = s0;
    for (const x of planActivate(s, ap, p, 0, [{ kind: "player", id: opp }])!) s = act(s, x);
    s = resolveAll(s);
    expect(s.objects[p]!.zone).toBe("hand");
  });
});

// "Whenever ~ deals combat damage to a player or planeswalker": to a planeswalker too (still on the battlefield as the
// damage is dealt, CR 704.3), once for each.
const butcher = card("Dreadhorde Butcher", "Creature — Zombie Warrior", "{B}{R}", { power: "1", toughness: "1", keywords: ["Haste"], oracleText: "Haste\nWhenever this creature deals combat damage to a player or planeswalker, put a +1/+1 counter on this creature.\nWhen this creature dies, it deals damage equal to its power to any target." });
const cleaver = card("The Reaver Cleaver", "Legendary Artifact — Equipment", "{2}{R}", { keywords: ["Treasure", "Equip"], oracleText: 'Equipped creature gets +1/+1 and has trample and "Whenever this creature deals combat damage to a player or planeswalker, create that many Treasure tokens."\nEquip {3}' });
const plainBear = card("Plain Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2", oracleText: "Whenever this creature deals combat damage to a player, draw a card." });

describe("combat damage to a player or planeswalker", () => {
  it("parse", () => supported(butcher, cleaver, plainBear));

  it("Dreadhorde Butcher grows hitting a planeswalker or a player; a player-only trigger doesn't hit for the planeswalker", () => {
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, opp, vraska);
    s0.objects[v]!.counters.loyalty = 5;
    const b1 = putOnBattlefield(s0, ap, butcher);
    const b2 = putOnBattlefield(s0, ap, butcher);
    const pb = putOnBattlefield(s0, ap, plainBear);
    const cl = putOnBattlefield(s0, ap, cleaver);
    s0.objects[cl]!.attachedTo = pb;
    const hand = s0.players[ap]!.hand.length;
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: b1, defender: opp, planeswalker: v }, { attacker: b2, defender: opp }, { attacker: pb, defender: opp, planeswalker: v }] });
    s = resolveAll(passUntil(s, "main2", ap));
    expect(s.objects[b1]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[b2]!.counters["+1/+1"]).toBe(1);
    // The Cleaver's granted trigger: 3 damage to Vraska, 3 Treasures; the bear's own "to a player" didn't trigger.
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap).length).toBe(3);
    expect(s.players[ap]!.hand.length).toBe(hand);
  });
});
