// Round 166: the most played cards, in popularity order, starting with Pendant of Prosperity, Auron and Torgal.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, pt, putOnBattlefield, scry, setup, swamp } from "./helpers";
import { abilitiesOf, botActions, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; "you may" questions get `yes`. Stops at any other question. */
const resolveAll = (s: GameState, yes = true) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending?.kind === "chooseMay"); i++) {
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes });
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** A card put straight into a zone, not from the battlefield. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Like `resolveAll`, and other players' questions are answered by the bot. */
const settle = (s: GameState, me: PlayerId, yes = true) => {
  for (let i = 0; i < 40; i++) {
    s = resolveAll(s, yes);
    if (!s.pending || s.pending.player === me) return s;
    s = run(s, botActions(s, s.pending.player));
  }
  return s;
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % s.turnOrder.length]!;
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) => act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks });
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId) => ({ kind: "player", id }) as TargetChoice;
const kw = (s: GameState, id: string, k: string) => objHasKeyword(s, s.objects[id]!, k);
const pending = <T = Record<string, unknown>>(s: GameState) => s.pending as unknown as T;

// Real oracle text (Scryfall).
const pendant = card("Pendant of Prosperity", "Artifact", "{3}", { cmc: 3, oracleText: "This artifact enters under the control of an opponent of your choice.\n{2}, {T}: Draw a card, then you may put a land card from your hand onto the battlefield. This artifact's owner draws a card, then that player may put a land card from their hand onto the battlefield." });

describe("Pendant of Prosperity", () => {
  it("is fully supported", () => supported(pendant));
  it("its controller draws and may put a land; then its owner draws and may put a land", () => {
    let { s, ap, opp } = setup([]);
    // An opponent's Pendant that entered under your control.
    const p = putOnBattlefield(s, opp, pendant);
    s.objects[p]!.controller = ap;
    invalidateCharacteristics(s);
    const theirLand = into(s, opp, forest, "hand");
    const myLand = into(s, ap, forest, "hand");
    const myHand = s.players[ap]!.hand.length;
    const theirHand = s.players[opp]!.hand.length;
    s = run(s, planActivate(s, ap, p, 0));
    s = resolveAll(s);
    expect(pending(s)).toMatchObject({ kind: "searchLibrary", player: ap, fromHand: true });
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [myLand] }));
    expect(zone(s, myLand)).toBe("battlefield");
    expect(pending(s)).toMatchObject({ kind: "searchLibrary", player: opp, fromHand: true });
    s = resolveAll(act(s, { type: "searchLibrary", player: opp, found: [theirLand] }));
    expect(zone(s, theirLand)).toBe("battlefield");
    expect(s.objects[theirLand]!.controller).toBe(opp);
    expect(s.players[ap]!.hand.length).toBe(myHand); // drew one, put one
    expect(s.players[opp]!.hand.length).toBe(theirHand);
  });
});

const auron = card("Auron, Venerated Guardian", "Legendary Creature — Human Spirit Samurai", "{3}{W}", { cmc: 4, power: "2", toughness: "5", keywords: ["Vigilance", "Shooting Star"], oracleText: "Vigilance\nShooting Star — Whenever Auron attacks, put a +1/+1 counter on it. When you do, exile target creature defending player controls with power less than Auron's power until Auron leaves the battlefield." });

describe("Auron, Venerated Guardian", () => {
  it("is fully supported", () => supported(auron));
  it("gets a counter as it attacks, then exiles a defending player's creature with less power until it leaves", () => {
    let { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, ap, auron);
    const small = putOnBattlefield(s, opp, bear()); // 2 power: less than 3
    const big = putOnBattlefield(s, opp, bear({ name: "Big Bear", power: "3", toughness: "3" }));
    const elsewhere = putOnBattlefield(s, next(s, opp), bear({ name: "Other Bear" }));
    s = attack(s, ap, [{ attacker: a, defender: opp }]);
    s = resolveAll(s);
    expect(s.objects[a]!.counters["+1/+1"]).toBe(1);
    expect(pending(s)).toMatchObject({ kind: "chooseTargets" });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(big)] })).toThrow();
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(elsewhere)] })).toThrow();
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(small)] }));
    expect(zone(s, small)).toBe("exile");
    // Auron leaves: the creature comes back.
    const kill = into(s, ap, card("Test Kill", "Instant", "{B}", { cmc: 1, oracleText: "Destroy target creature." }), "hand");
    s = resolveAll(run(s, planCast(s, ap, kill, [tgt(a)])));
    expect(zone(s, small)).toBe("battlefield");
  });
});

const torgal = card("Torgal, A Fine Hound", "Legendary Creature — Wolf", "{1}{G}", { cmc: 2, power: "2", toughness: "2", oracleText: "Whenever you cast your first Human creature spell each turn, that creature enters with an additional +1/+1 counter on it for each Dog and/or Wolf you control.\n{T}: Add one mana of any color." });
const human = (name: string) => card(name, "Creature — Human Soldier", "{W}", { cmc: 1, power: "1", toughness: "1" });

describe("Torgal, A Fine Hound", () => {
  it("is fully supported", () => supported(torgal));
  it("your first Human creature spell each turn enters with a +1/+1 counter for each Dog and/or Wolf you control", () => {
    let { s, ap, opp } = setup([human("Test Human"), human("Second Human")]);
    const ids = s.players[ap]!.hand.slice(-2);
    putOnBattlefield(s, ap, torgal);
    putOnBattlefield(s, ap, card("Test Dog", "Creature — Dog", "{G}", { cmc: 1, power: "1", toughness: "1" }));
    putOnBattlefield(s, opp, card("Their Wolf", "Creature — Wolf", "{G}", { cmc: 1, power: "1", toughness: "1" }));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(2); // Torgal and the Dog, not their Wolf
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(s.objects[ids[1]!]!.counters["+1/+1"] ?? 0).toBe(0); // only the first each turn
  });
});

const betor = card("Betor, Ancestor's Voice", "Legendary Creature — Spirit Dragon", "{2}{W}{B}{G}", { cmc: 5, power: "3", toughness: "5", keywords: ["Flying", "Lifelink"], oracleText: "Flying, lifelink\nAt the beginning of your end step, put a number of +1/+1 counters on up to one other target creature you control equal to the amount of life you gained this turn. Return up to one target creature card with mana value less than or equal to the amount of life you lost this turn from your graveyard to the battlefield." });
const gain3 = card("Test Gain", "Instant", "{W}", { cmc: 1, oracleText: "You gain 3 life." });
const lose2 = card("Test Loss", "Instant", "{B}", { cmc: 1, oracleText: "You lose 2 life." });

describe("Betor, Ancestor's Voice", () => {
  it("is fully supported", () => supported(betor));
  it("at your end step: counters equal to the life you gained, and a creature card with mana value up to the life you lost returns", () => {
    let { s, ap } = setup([gain3, lose2]);
    const [g, l] = s.players[ap]!.hand.slice(-2);
    putOnBattlefield(s, ap, betor);
    const b = putOnBattlefield(s, ap, bear({ cmc: 2 }));
    const two = into(s, ap, bear({ name: "Dead Bear", cmc: 2 }), "graveyard");
    const three = into(s, ap, card("Dead Ogre", "Creature — Ogre", "{2}{R}", { cmc: 3, power: "3", toughness: "3" }), "graveyard");
    s = resolveAll(run(s, planCast(s, ap, g!)));
    s = resolveAll(run(s, planCast(s, ap, l!)));
    s = resolveAll(passUntil(s, "end", ap));
    expect(pending(s)).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(b), tgt(three)] })).toThrow();
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(b), tgt(two)] }));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(3);
    expect(zone(s, two)).toBe("battlefield");
    expect(zone(s, three)).toBe("graveyard");
  });
});

const lonis = card("Lonis, Cryptozoologist", "Legendary Creature — Snake Elf Scout", "{G}{U}", { cmc: 2, power: "1", toughness: "2", keywords: ["Investigate"], oracleText: "Whenever another nontoken creature you control enters, investigate.\n{T}, Sacrifice X Clues: Target opponent reveals the top X cards of their library. You may put a nonland permanent card with mana value X or less from among them onto the battlefield under your control. That player puts the rest on the bottom of their library in a random order." });

describe("Lonis, Cryptozoologist", () => {
  it("is fully supported", () => supported(lonis));
  it("investigates; then sacrificing X Clues digs X cards into an opponent's library for a permanent card with mana value X or less", () => {
    let { s, ap, opp } = setup([bear({ cmc: 2 }), bear({ name: "Second Bear", cmc: 2 })]);
    const ids = s.players[ap]!.hand.slice(-2);
    const l = putOnBattlefield(s, ap, lonis);
    for (const id of ids) s = resolveAll(run(s, planCast(s, ap, id)));
    const clues = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Clue"));
    expect(clues.length).toBe(2);
    const big = into(s, opp, card("Their Giant", "Creature — Giant", "{4}{R}", { cmc: 5, power: "5", toughness: "5" }), "library");
    const small = into(s, opp, bear({ name: "Their Bear", cmc: 2 }), "library");
    const lib = s.players[opp]!.library.length;
    s = run(s, planActivate(s, ap, l, 0, [player(opp)], undefined, undefined, 2, { sacrifice: clues }));
    expect(clues.every((id) => s.objects[id]?.zone !== "battlefield")).toBe(true);
    s = resolveAll(s);
    expect(pending(s)).toMatchObject({ kind: "searchLibrary", player: ap, max: 1 });
    expect(pending<{ cards: string[] }>(s).cards).toEqual([small]);
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [small] }));
    expect(zone(s, small)).toBe("battlefield");
    expect(s.objects[small]!.controller).toBe(ap);
    expect(s.players[opp]!.library.length).toBe(lib - 1);
    expect(s.players[opp]!.library[s.players[opp]!.library.length - 1]).toBe(big); // the rest on the bottom
  });
});

const mirrorShield = card("Mirror Shield", "Artifact — Equipment", "{2}", { cmc: 2, keywords: ["Equip"], oracleText: 'Equipped creature gets +0/+2 and has hexproof and "Whenever a creature with deathtouch blocks or becomes blocked by this creature, destroy that creature."\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)' });
const assassin = (name: string) => card(name, "Creature — Human Assassin", "{1}{B}", { cmc: 2, power: "1", toughness: "1", keywords: ["Deathtouch"], oracleText: "Deathtouch" });

describe("Mirror Shield", () => {
  it("is fully supported", () => supported(mirrorShield));
  it("the equipped creature gets +0/+2 and hexproof, and destroys a deathtouch creature that blocks it", () => {
    let { s, ap, opp } = setup([]);
    const m = putOnBattlefield(s, ap, mirrorShield);
    const b = putOnBattlefield(s, ap, bear());
    s = resolveAll(run(s, planActivate(s, ap, m, 0, [tgt(b)])));
    expect(pt(s, b)).toBe("2/4");
    expect(kw(s, b, "Hexproof")).toBe(true);
    const d = putOnBattlefield(s, opp, assassin("Their Assassin"));
    const plain = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    s = attack(s, ap, [{ attacker: b, defender: opp }]);
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: d, attacker: b }] });
    s = resolveAll(s);
    expect(zone(s, d)).toBe("graveyard");
    expect(zone(s, b)).toBe("battlefield"); // destroyed before combat damage
    expect(zone(s, plain)).toBe("battlefield");
  });
  it("destroys an attacking deathtouch creature it blocks", () => {
    let { s, ap, opp } = setup([]);
    const m = putOnBattlefield(s, opp, mirrorShield);
    const b = putOnBattlefield(s, opp, bear());
    s.objects[m]!.attachedTo = b;
    invalidateCharacteristics(s);
    const d = putOnBattlefield(s, ap, assassin("My Assassin"));
    s = attack(s, ap, [{ attacker: d, defender: opp }]);
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b, attacker: d }] });
    s = resolveAll(s);
    expect(zone(s, d)).toBe("graveyard");
  });
});

const planisphere = card("Astrologian's Planisphere", "Artifact — Equipment", "{1}{U}", { cmc: 2, keywords: ["Job select", "Diana", "Equip"], oracleText: 'Job select (When this Equipment enters, create a 1/1 colorless Hero creature token, then attach this to it.)\nEquipped creature is a Wizard in addition to its other types and has "Whenever you cast a noncreature spell and whenever you draw your third card each turn, put a +1/+1 counter on this creature."\nDiana — Equip {2}' });

describe("Astrologian's Planisphere", () => {
  it("is fully supported", () => supported(planisphere));
  it("its Hero is a Wizard and grows when you cast a noncreature spell and when you draw your third card each turn", () => {
    let { s, ap } = setup([planisphere, card("Test Draw", "Sorcery", "{U}", { cmc: 1, oracleText: "Draw three cards." }), bear()]);
    const [p, draw, b] = s.players[ap]!.hand.slice(-3);
    s = resolveAll(run(s, planCast(s, ap, p!)));
    const hero = s.objects[p!]!.attachedTo!;
    expect(characteristics(s, s.objects[hero]!).subtypes).toEqual(expect.arrayContaining(["Hero", "Wizard"]));
    s.players[ap]!.draws = { turn: s.turn, n: 0 };
    s = resolveAll(run(s, planCast(s, ap, draw!)));
    expect(s.objects[hero]!.counters["+1/+1"]).toBe(2); // the cast, then the third card drawn
    s = resolveAll(run(s, planCast(s, ap, b!)));
    expect(s.objects[hero]!.counters["+1/+1"]).toBe(2); // a creature spell: no counter
  });
});

const prophet = card("Prophet of the Scarab", "Creature — Zombie Wizard", "{4}{U}", { cmc: 5, power: "3", toughness: "4", keywords: ["Vigilance"], oracleText: "Vigilance\nWhen this creature enters, draw cards equal to the number of Zombies you control or the number of Zombie cards in your graveyard, whichever is greater." });
const zombie = (name: string) => card(name, "Creature — Zombie", "{B}", { cmc: 1, power: "2", toughness: "2" });

describe("Prophet of the Scarab", () => {
  it("is fully supported", () => supported(prophet));
  it("draws the greater of the Zombies you control and the Zombie cards in your graveyard", () => {
    let { s, ap } = setup([prophet]);
    const p = s.players[ap]!.hand[s.players[ap]!.hand.length - 1]!;
    putOnBattlefield(s, ap, zombie("Zombie A"));
    for (const n of ["Zombie B", "Zombie C", "Zombie D"]) into(s, ap, zombie(n), "graveyard");
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planCast(s, ap, p)));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3); // 2 on the battlefield (with the Prophet), 3 in the graveyard
  });
});

const bolas = scry("transform", [
  { name: "Nicol Bolas, the Ravager", mana_cost: "{1}{U}{B}{R}", type_line: "Legendary Creature — Elder Dragon", power: "4", toughness: "4", oracle_text: "Flying\nWhen Nicol Bolas enters, each opponent discards a card.\n{4}{U}{B}{R}: Exile Nicol Bolas, then return him to the battlefield transformed under his owner's control. Activate only as a sorcery." },
  { name: "Nicol Bolas, the Arisen", type_line: "Legendary Planeswalker — Bolas", loyalty: "7", color_indicator: ["B", "R", "U"], oracle_text: "+2: Draw two cards.\n−3: Nicol Bolas deals 10 damage to target creature or planeswalker.\n−4: Put target creature or planeswalker card from a graveyard onto the battlefield under your control.\n−12: Exile all but the bottom card of target player's library." },
], { keywords: ["Flying", "Transform"] });

describe("Nicol Bolas, the Ravager // Nicol Bolas, the Arisen", () => {
  it("is fully supported, both faces", () => supported(bolas));
  it("exiles himself and returns transformed, a new planeswalker with 7 loyalty", () => {
    let { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, bolas);
    s = resolveAll(run(s, planActivate(s, ap, b, 0)));
    const now = s.battlefield.find((id) => characteristics(s, s.objects[id]!).name === "Nicol Bolas, the Arisen");
    expect(now).toBeDefined();
    expect(s.objects[now!]!.counters.loyalty).toBe(7);
  });
  it("−12 exiles all but the bottom card of target player's library", () => {
    let { s, ap, opp } = setup([]);
    const b = putOnBattlefield(s, ap, bolas);
    s.objects[b]!.face = 1;
    s.objects[b]!.counters.loyalty = 12;
    invalidateCharacteristics(s);
    const lib = s.players[opp]!;
    const bottom = lib.library[lib.library.length - 1];
    const exiled = lib.exile.length + lib.library.length - 1;
    s = resolveAll(run(s, planActivate(s, ap, b, 3, [player(opp)])));
    expect(s.players[opp]!.library).toEqual([bottom]);
    expect(s.players[opp]!.exile.length).toBe(exiled);
  });
});

const vortex = card("Into the Time Vortex", "Sorcery", "{4}{R}", { cmc: 5, keywords: ["Rebound", "Cascade"], oracleText: "Cascade (When you cast this spell, exile cards from the top of your library until you exile a nonland card that costs less. You may cast it without paying its mana cost. Put the exiled cards on the bottom in a random order.)\nRebound (If you cast this spell from your hand, exile it as it resolves. At the beginning of your next upkeep, you may cast this card from exile without paying its mana cost.)" });
const throes = card("Throes of Chaos", "Sorcery", "{3}{R}", { cmc: 4, keywords: ["Retrace", "Cascade"], oracleText: "Cascade (When you cast this spell, exile cards from the top of your library until you exile a nonland card that costs less. You may cast it without paying its mana cost. Put the exiled cards on the bottom in a random order.)\nRetrace (You may cast this card from your graveyard by discarding a land card in addition to paying its other costs.)" });

describe("Into the Time Vortex and Throes of Chaos: spells that only cascade", () => {
  it("are fully supported", () => supported(vortex, throes));
  it("Into the Time Vortex cascades, then is exiled by rebound", () => {
    let { s, ap, ids } = setup([vortex]);
    const hit = into(s, ap, bear({ name: "Top Bear", cmc: 2 }), "library");
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 10 && s.pending?.kind !== "castFree"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: hit });
    s = resolveAll(act(s, { type: "castSpell", player: ap, objectId: hit }));
    expect(zone(s, hit)).toBe("battlefield");
    expect(zone(s, ids[0]!)).toBe("exile");
  });
  it("Throes of Chaos cascades again when cast with retrace from the graveyard", () => {
    let { s, ap } = setup([forest]);
    const land = s.players[ap]!.hand[s.players[ap]!.hand.length - 1]!;
    const t = into(s, ap, throes, "graveyard");
    const hit = into(s, ap, bear({ name: "Top Bear", cmc: 2 }), "library");
    s = run(s, planCast(s, ap, t, undefined, undefined, undefined, undefined, { via: "retrace", discard: [land] }));
    for (let i = 0; i < 10 && s.pending?.kind !== "castFree"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: hit });
    s = resolveAll(act(s, { type: "castSpell", player: ap, objectId: hit }));
    expect(zone(s, t)).toBe("graveyard");
    expect(zone(s, land)).toBe("graveyard");
  });
});

const wave = card("Wave of Reckoning", "Sorcery", "{4}{W}", { cmc: 5, oracleText: "Each creature deals damage to itself equal to its power." });

describe("Wave of Reckoning", () => {
  it("is fully supported", () => supported(wave));
  it("each creature deals damage to itself equal to its power", () => {
    let { s, ap, ids, opp } = setup([wave]);
    const b = putOnBattlefield(s, ap, bear());
    const wall = putOnBattlefield(s, opp, card("Test Wall", "Creature — Wall", "{1}{W}", { cmc: 2, power: "1", toughness: "4" }));
    const zero = putOnBattlefield(s, opp, card("Test Mite", "Creature — Insect", "{0}", { power: "0", toughness: "1" }));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(zone(s, b)).toBe("graveyard");
    expect(zone(s, wall)).toBe("battlefield");
    expect(s.objects[wall]!.damage).toBe(1);
    expect(zone(s, zero)).toBe("battlefield");
  });
});

const smallpox = card("Smallpox", "Sorcery", "{B}{B}", { cmc: 2, oracleText: "Each player loses 1 life, discards a card, sacrifices a creature of their choice, then sacrifices a land of their choice." });
const deathCloud = card("Death Cloud", "Sorcery", "{X}{B}{B}{B}", { cmc: 3, oracleText: "Each player loses X life, discards X cards, sacrifices X creatures of their choice, then sacrifices X lands of their choice." });
/** Every question (the caster's too) answered by the bot. */
const settleAll = (s: GameState) => {
  for (let i = 0; i < 60; i++) {
    s = resolveAll(s);
    if (!s.pending) return s;
    s = run(s, botActions(s, s.pending.player));
  }
  return s;
};
const count = (s: GameState, pid: PlayerId, type: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).types.includes(type)).length;

describe("Smallpox and Death Cloud", () => {
  it("are fully supported", () => supported(smallpox, deathCloud));
  it("Smallpox: each player loses 1 life, discards a card, sacrifices a creature, then a land", () => {
    let { s, ap, ids, opp } = setup([smallpox, bear()]);
    putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, opp, bear());
    putOnBattlefield(s, opp, forest);
    putOnBattlefield(s, opp, forest);
    const before = (pid: PlayerId) => ({ life: s.players[pid]!.life, hand: s.players[pid]!.hand.length, creatures: count(s, pid, "Creature"), lands: count(s, pid, "Land") });
    const me = before(ap);
    const them = before(opp);
    s = settleAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.players[ap]!.life).toBe(me.life - 1);
    expect(s.players[opp]!.life).toBe(them.life - 1);
    expect(s.players[ap]!.hand.length).toBe(me.hand - 2); // Smallpox, then the discard
    expect(s.players[opp]!.hand.length).toBe(them.hand - 1);
    expect(count(s, ap, "Creature")).toBe(me.creatures - 1);
    expect(count(s, opp, "Creature")).toBe(them.creatures - 1);
    expect(count(s, ap, "Land")).toBe(me.lands - 1);
    expect(count(s, opp, "Land")).toBe(them.lands - 1);
  });
  it("Death Cloud: each player loses X life, discards X cards, sacrifices X creatures, then X lands", () => {
    let { s, ap, ids, opp } = setup([deathCloud]);
    putOnBattlefield(s, ap, swamp);
    for (let i = 0; i < 3; i++) putOnBattlefield(s, opp, bear());
    for (let i = 0; i < 3; i++) putOnBattlefield(s, opp, forest);
    const life = s.players[opp]!.life;
    const hand = s.players[opp]!.hand.length;
    s = settleAll(run(s, planCast(s, ap, ids[0]!, undefined, undefined, undefined, 2)));
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(s.players[opp]!.hand.length).toBe(Math.max(0, hand - 2));
    expect(count(s, opp, "Creature")).toBe(1);
    expect(count(s, opp, "Land")).toBe(1);
  });
});

const spear = card("Spear of Heliod", "Legendary Enchantment Artifact", "{1}{W}{W}", { cmc: 3, oracleText: "Creatures you control get +1/+1.\n{1}{W}{W}, {T}: Destroy target creature that dealt damage to you this turn." });

describe("Spear of Heliod", () => {
  it("is fully supported", () => supported(spear));
  it("destroys only a creature that dealt damage to you this turn", () => {
    let { s, ap, opp } = setup([]);
    const sp = putOnBattlefield(s, ap, spear);
    const mine = putOnBattlefield(s, ap, bear({ name: "My Bear" }));
    expect(pt(s, mine)).toBe("3/3");
    const hitter = putOnBattlefield(s, opp, bear({ name: "Hitter" }));
    const other = putOnBattlefield(s, opp, bear({ name: "Stayed Home" }));
    s = attack(s, opp, [{ attacker: hitter, defender: ap }]);
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: ap, blocks: [] });
    s = passUntil(s, "main2", opp);
    for (let i = 0; i < 4 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(planActivate(s, ap, sp, 0, [tgt(other)])).toBeNull();
    s = resolveAll(run(s, planActivate(s, ap, sp, 0, [tgt(hitter)])));
    expect(zone(s, hitter)).toBe("graveyard");
  });
});

const intrusion = card("Ruinous Intrusion", "Instant", "{3}{G}", { cmc: 4, oracleText: "Exile target artifact or enchantment. Put X +1/+1 counters on target creature you control, where X is the mana value of the permanent exiled this way." });

describe("Ruinous Intrusion", () => {
  it("is fully supported", () => supported(intrusion));
  it("puts counters equal to the exiled permanent's mana value on your creature", () => {
    let { s, ap, ids, opp } = setup([intrusion]);
    const rock = putOnBattlefield(s, opp, card("Test Rock", "Artifact", "{3}", { cmc: 3 }));
    const b = putOnBattlefield(s, ap, bear());
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(rock), tgt(b)])));
    expect(zone(s, rock)).toBe("exile");
    expect(s.objects[b]!.counters["+1/+1"]).toBe(3);
  });
});

const socialite = card("Vampire Socialite", "Creature — Vampire Noble", "{B}{R}", { cmc: 2, power: "2", toughness: "2", keywords: ["Menace"], oracleText: "Menace (This creature can't be blocked except by two or more creatures.)\nWhen this creature enters, if an opponent lost life this turn, put a +1/+1 counter on each other Vampire you control.\nAs long as an opponent lost life this turn, each other Vampire you control enters with an additional +1/+1 counter on it." });
const vampire = (name: string) => card(name, "Creature — Vampire", "{B}", { cmc: 1, power: "1", toughness: "1" });
const drain = card("Test Drain", "Instant", "{B}", { cmc: 1, oracleText: "Target player loses 1 life." });

describe("Vampire Socialite", () => {
  it("is fully supported", () => supported(socialite));
  it("does nothing until an opponent lost life this turn", () => {
    let { s, ap, ids } = setup([socialite, vampire("Late Vampire")]);
    const v = putOnBattlefield(s, ap, vampire("Old Vampire"));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(s.objects[v]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[ids[1]!]!.counters["+1/+1"] ?? 0).toBe(0);
  });
  it("after an opponent lost life: a counter on each other Vampire, and other Vampires enter with one more", () => {
    let { s, ap, ids, opp } = setup([drain, socialite, vampire("Late Vampire")]);
    putOnBattlefield(s, ap, swamp);
    const v = putOnBattlefield(s, ap, vampire("Old Vampire"));
    const theirs = putOnBattlefield(s, opp, vampire("Their Vampire"));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(s.objects[v]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[ids[1]!]!.counters["+1/+1"] ?? 0).toBe(0); // not itself
    expect(s.objects[theirs]!.counters["+1/+1"] ?? 0).toBe(0);
    s = resolveAll(run(s, planCast(s, ap, ids[2]!)));
    expect(s.objects[ids[2]!]!.counters["+1/+1"]).toBe(1);
  });
});

const gale = card("Glorious Gale", "Instant", "{1}{U}", { cmc: 2, oracleText: "Counter target creature spell. If it was a legendary spell, the Ring tempts you." });
const legend = card("Test Legend", "Legendary Creature — Human", "{1}{G}", { cmc: 2, power: "2", toughness: "2" });

describe("Glorious Gale", () => {
  it("is fully supported", () => supported(gale));
  for (const [what, def, tempted] of [["a legendary creature spell: the Ring tempts you", legend, 1], ["a nonlegendary creature spell: no temptation", bear({ cmc: 2 }), undefined]] as const) {
    it(`counters ${what}`, () => {
      let { s, ap, ids } = setup([def, gale]);
      s = run(s, planCast(s, ap, ids[0]!));
      const spell = s.stack.find((x) => x.kind === "spell")!;
      s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: spell.id }])));
      expect(zone(s, ids[0]!)).toBe("graveyard");
      expect(s.players[ap]!.ring?.tempted).toBe(tempted);
    });
  }
});

const crown = card("Hylda's Crown of Winter", "Legendary Artifact", "{3}", { cmc: 3, oracleText: "{1}, {T}: Tap target creature. This ability costs {1} less to activate during your turn.\n{3}, Sacrifice Hylda's Crown of Winter: Draw a card for each tapped creature your opponents control." });

describe("Hylda's Crown of Winter", () => {
  it("is fully supported", () => supported(crown));
  it("taps a creature for free during your turn, for {1} otherwise; then draws for each tapped creature your opponents control", () => {
    let { s, ap, opp } = setup([]);
    const c = putOnBattlefield(s, ap, crown);
    const a = putOnBattlefield(s, opp, bear({ name: "Bear A" }));
    const b = putOnBattlefield(s, opp, bear({ name: "Bear B" }));
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).types.includes("Land"));
    for (const l of lands) s.objects[l]!.tapped = true;
    s = resolveAll(run(s, planActivate(s, ap, c, 0, [tgt(a)])));
    expect(s.objects[a]!.tapped).toBe(true);
    // On another player's turn it costs {1}.
    let t = passUntil(s, "main1", opp);
    for (let i = 0; i < 4 && waitingOn(t) !== ap; i++) t = act(t, { type: "passPriority", player: waitingOn(t)! });
    for (const l of lands) t.objects[l]!.tapped = true;
    expect(planActivate(t, ap, c, 0, [tgt(b)])).toBeNull();
    t.objects[c]!.tapped = false;
    t.objects[lands[0]!]!.tapped = false;
    t = resolveAll(run(t, planActivate(t, ap, c, 0, [tgt(b)])));
    expect(t.objects[b]!.tapped).toBe(true);
    for (const l of lands) t.objects[l]!.tapped = false;
    for (let i = 0; i < 4 && waitingOn(t) !== ap; i++) t = act(t, { type: "passPriority", player: waitingOn(t)! });
    const hand = t.players[ap]!.hand.length;
    t = resolveAll(run(t, planActivate(t, ap, c, 1)));
    expect(zone(t, c)).toBe("graveyard");
    expect(t.players[ap]!.hand.length).toBe(hand + 1); // Bear B: Bear A untapped in its controller's untap step
  });
});

const washOut = card("Wash Out", "Sorcery", "{3}{U}", { cmc: 4, oracleText: "Return all permanents of the color of your choice to their owners' hands." });

describe("Wash Out", () => {
  it("is fully supported", () => supported(washOut));
  it("returns all permanents of the chosen color to their owners' hands", () => {
    let { s, ap, ids, opp } = setup([washOut]);
    const mine = putOnBattlefield(s, ap, bear({ name: "My Bear" }));
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Bear" }));
    const white = putOnBattlefield(s, opp, card("Test Wall", "Creature — Wall", "{1}{W}", { cmc: 2, power: "0", toughness: "4" }));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(pending(s)).toMatchObject({ kind: "chooseOption", player: ap, what: "color" });
    const green = pending<{ options: string[] }>(s).options.find((x) => /green|^G$/i.test(x))!;
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: green }));
    expect(zone(s, mine)).toBe("hand");
    expect(zone(s, theirs)).toBe("hand");
    expect(s.players[opp]!.hand).toContain(theirs);
    expect(zone(s, white)).toBe("battlefield");
  });
});

const desmond = card("Desmond Miles", "Legendary Creature — Human Assassin", "{1}{B}", { cmc: 2, power: "1", toughness: "3", keywords: ["Surveil", "Menace"], oracleText: "Menace\nDesmond Miles gets +1/+0 for each other Assassin you control and each Assassin card in your graveyard.\nWhenever Desmond Miles deals combat damage to a player, surveil X, where X is the amount of damage it dealt to that player." });

describe("Desmond Miles", () => {
  it("is fully supported", () => supported(desmond));
  it("gets +1/+0 for each other Assassin, then surveils as many cards as the damage he dealt", () => {
    let { s, ap, opp } = setup([]);
    const d = putOnBattlefield(s, ap, desmond);
    putOnBattlefield(s, ap, assassin("Other Assassin"));
    into(s, ap, assassin("Dead Assassin"), "graveyard");
    expect(pt(s, d)).toBe("3/3");
    s = attack(s, ap, [{ attacker: d, defender: opp }]);
    s = passUntil(resolveAll(s), "combatDamage", ap);
    s = resolveAll(s);
    expect(s.players[opp]!.life).toBe(37);
    expect(pending(s)).toMatchObject({ kind: "arrangeTop", player: ap, how: "surveil" });
    expect(pending<{ cards: string[] }>(s).cards.length).toBe(3);
  });
});

const navigator = card("Timestream Navigator", "Creature — Human Pirate Wizard", "{1}{U}", { cmc: 2, power: "1", toughness: "1", keywords: ["Ascend"], oracleText: "Ascend (If you control ten or more permanents, you get the city's blessing for the rest of the game.)\n{2}{U}{U}, {T}, Put this creature on the bottom of its owner's library: Take an extra turn after this one. Activate only if you have the city's blessing." });

describe("Timestream Navigator", () => {
  it("is fully supported", () => supported(navigator));
  it("with the city's blessing, goes to the bottom of its owner's library for an extra turn", () => {
    let { s, ap } = setup([]);
    const n = putOnBattlefield(s, ap, navigator);
    s.players[ap]!.citysBlessing = true;
    s = run(s, planActivate(s, ap, n, 0));
    const lib = s.players[ap]!.library;
    expect(lib[lib.length - 1]).toBe(n);
    s = resolveAll(s);
    expect(s.extraTurns?.length).toBe(1);
    expect(s.extraTurns?.[0]).toMatchObject({ player: ap });
  });
  it("can't be activated without the city's blessing", () => {
    let { s, ap } = setup([]);
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap);
    const n = putOnBattlefield(s, ap, navigator);
    // Only four lands.
    for (const l of lands.slice(4)) {
      s.battlefield.splice(s.battlefield.indexOf(l), 1);
      s.objects[l]!.zone = "graveyard";
      s.players[ap]!.graveyard.push(l);
    }
    s.players[ap]!.citysBlessing = false;
    invalidateCharacteristics(s);
    expect(planActivate(s, ap, n, 0)).toBeNull();
  });
});

const unclean = card("Great Unclean One", "Creature — Demon", "{4}{B}", { cmc: 5, power: "4", toughness: "5", keywords: ["Reverberating Summons"], oracleText: "Reverberating Summons — At the beginning of your end step, each opponent loses 2 life. Then for each opponent who has less life than you, create a 1/3 black Demon creature token named Plaguebearer of Nurgle." });

describe("Great Unclean One", () => {
  it("is fully supported", () => supported(unclean));
  it("each opponent loses 2 life, then a Plaguebearer for each opponent with less life than you", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, unclean);
    const opps = s.turnOrder.filter((p) => p !== ap);
    s.players[ap]!.life = 39;
    s.players[opp]!.life = 42; // 40 after: more than you
    s = resolveAll(passUntil(s, "end", ap));
    for (const p of opps) expect(s.players[p]!.life).toBe(p === opp ? 40 : 38);
    const made = s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap);
    expect(made.length).toBe(2);
    expect(characteristics(s, s.objects[made[0]!]!)).toMatchObject({ name: "Plaguebearer of Nurgle", power: 1, toughness: 3, subtypes: ["Demon"] });
  });
});

const pig = card("Prize Pig", "Creature — Boar", "{1}{G}", { cmc: 2, power: "0", toughness: "3", oracleText: "Whenever you gain life, put that many ribbon counters on this creature. Then if there are three or more ribbon counters on this creature, remove those counters and untap it.\n{T}: Add one mana of any color." });

describe("Prize Pig", () => {
  it("is fully supported", () => supported(pig));
  it("gets ribbon counters as you gain life; at three or more, they're all removed and it untaps", () => {
    let { s, ap } = setup([card("Test Gain", "Instant", "{W}", { cmc: 1, oracleText: "You gain 2 life." }), card("Second Gain", "Instant", "{W}", { cmc: 1, oracleText: "You gain 2 life." })]);
    const [g1, g2] = s.players[ap]!.hand.slice(-2);
    const p = putOnBattlefield(s, ap, pig);
    s = resolveAll(run(s, planCast(s, ap, g1!)));
    expect(s.objects[p]!.counters.ribbon).toBe(2);
    s.objects[p]!.tapped = true;
    s = resolveAll(run(s, planCast(s, ap, g2!)));
    expect(s.objects[p]!.counters.ribbon ?? 0).toBe(0); // all four removed
    expect(s.objects[p]!.tapped).toBe(false);
  });
});

// Cards the new templates also cover.
const giltspire = card("Giltspire Avenger", "Creature — Human Soldier", "{G}{W}{U}", { cmc: 3, power: "2", toughness: "2", keywords: ["Exalted"], oracleText: "Exalted (Whenever a creature you control attacks alone, that creature gets +1/+1 until end of turn.)\n{T}: Destroy target creature that dealt damage to you this turn." });
const reciprocate = card("Reciprocate", "Instant", "{W}", { cmc: 1, oracleText: "Exile target creature that dealt damage to you this turn." });
const retaliate = card("Retaliate", "Instant", "{2}{W}{W}", { cmc: 4, oracleText: "Destroy all creatures that dealt damage to you this turn." });
const firebrand = card("Radha's Firebrand", "Creature — Human Warrior", "{1}{R}", { cmc: 2, power: "3", toughness: "1", keywords: ["Domain"], oracleText: "Whenever this creature attacks, target creature defending player controls with power less than this creature's power can't block this turn.\nDomain — {5}{R}: This creature gets +2/+2 until end of turn. This ability costs {1} less to activate for each basic land type among lands you control. Activate only once each turn." });
const roc = card("Skymark Roc", "Creature — Bird", "{2}{W}{U}", { cmc: 4, power: "3", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nWhenever this creature attacks, you may return target creature defending player controls with toughness 2 or less to its owner's hand." });
const greevil = card("Root Greevil", "Creature — Beast", "{3}{G}", { cmc: 4, power: "2", toughness: "3", oracleText: "{2}{G}, {T}, Sacrifice this creature: Destroy all enchantments of the color of your choice." });
const solarBlaze = card("Solar Blaze", "Sorcery", "{2}{R}{W}", { cmc: 4, oracleText: "Each creature deals damage to itself equal to its power." });

describe("the other cards these templates cover", () => {
  it("are fully supported", () => supported(giltspire, reciprocate, retaliate, firebrand, roc, greevil, solarBlaze));
  it("Retaliate destroys every creature that dealt damage to you this turn, and no other", () => {
    let { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, opp, bear({ name: "Hitter A" }));
    const b = putOnBattlefield(s, opp, bear({ name: "Hitter B" }));
    const other = putOnBattlefield(s, opp, bear({ name: "Stayed Home" }));
    s = attack(s, opp, [{ attacker: a, defender: ap }, { attacker: b, defender: ap }]);
    for (let i = 0; i < 20 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: ap, blocks: [] });
    s = passUntil(s, "main2", opp);
    for (let i = 0; i < 4 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const r = into(s, ap, retaliate, "hand");
    s = resolveAll(run(s, planCast(s, ap, r)));
    expect(zone(s, a)).toBe("graveyard");
    expect(zone(s, b)).toBe("graveyard");
    expect(zone(s, other)).toBe("battlefield");
  });
});
