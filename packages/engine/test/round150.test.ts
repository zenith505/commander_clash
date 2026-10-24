// Round 150: the most played cards, in popularity order, starting with Lolth, Spider Queen.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { characteristics, compileCard, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type Step, type TargetChoice } from "../src";

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
/** Passes (resolving everything on the way, "you may" answered `yes`) until `step` of `active`'s turn. */
const advance = (s: GameState, step: Step, active: PlayerId, yes = true) => {
  for (let i = 0; i < 3000; i++) {
    if (s.step === step && s.activePlayer === active && !s.stack.length && !s.triggerQueue.length && !s.pending) return s;
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes });
    else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: waitingOn(s)!, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: waitingOn(s)!, blocks: [] });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error(`never reached ${step}`);
};
/** Attacks with `attackers` (all at `defender`), nobody blocks; stops at the combat damage step's triggers or main 2. */
const swing = (s: GameState, ap: PlayerId, defender: PlayerId, attackers: string[]) => {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((a) => ({ attacker: a, defender })) });
  for (let i = 0; i < 60 && s.step !== "main2" && s.pending?.kind !== "chooseMay"; i++) {
    const p = s.pending;
    if (p && p.kind !== "declareBlockers") break;
    s = act(s, p?.kind === "declareBlockers" ? { type: "declareBlockers", player: p.player, blocks: [] } : { type: "passPriority", player: waitingOn(s)! });
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
/** Empties a player's hand (onto the bottom of their library), then gives them these cards. */
const handOf = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  const p = s.players[pid]!;
  for (const id of p.hand) s.objects[id]!.zone = "library";
  p.library.push(...p.hand);
  p.hand = [];
  return defs.map((d) => into(s, pid, d, "hand"));
};
const obj = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const next = (s: GameState, pid: PlayerId, k = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + k) % s.turnOrder.length]!;
const ability = (d: CardDef, text: RegExp) => compileCard(d).activated.findIndex((a) => text.test(a.text));
/** On the battlefield with that name (a token's has " Token" after it). */
const named = (s: GameState, name: string) => s.battlefield.filter((id) => [name, `${name} Token`].includes(characteristics(s, s.objects[id]!).name));

// Real oracle text (Scryfall).
const lolth = card("Lolth, Spider Queen", "Legendary Planeswalker — Lolth", "{3}{B}{B}", { loyalty: "4", oracleText: "Whenever a creature you control dies, put a loyalty counter on Lolth.\n0: You draw a card and you lose 1 life.\n−3: Create two 2/1 black Spider creature tokens with reach and menace.\n−8: You get an emblem with \"Whenever an opponent is dealt combat damage by one or more creatures you control, if that player lost less than 8 life this turn, they lose life equal to the difference.\"" });
const gitrog = card("The Gitrog, Ravenous Ride", "Legendary Creature — Frog Horror Mount", "{3}{B}{G}", { power: "6", toughness: "5", keywords: ["Saddle", "Haste", "Trample"], oracleText: "Trample, haste\nWhenever The Gitrog deals combat damage to a player, you may sacrifice a creature that saddled it this turn. If you do, draw X cards, then put up to X land cards from your hand onto the battlefield tapped, where X is the sacrificed creature's power.\nSaddle 1" });
const titan = card("Depthshaker Titan", "Artifact Creature — Robot", "{5}{R}{R}", { power: "5", toughness: "5", oracleText: "When this creature enters, any number of target noncreature artifacts you control become 3/3 artifact creatures. Sacrifice them at the beginning of the next end step.\nEach artifact creature you control has melee, trample, and haste. (Whenever a creature with melee attacks, it gets +1/+1 until end of turn for each opponent you attacked this combat.)" });
const baeloth = card("Baeloth Barrityl, Entertainer", "Legendary Creature — Elf Shaman", "{4}{R}", { power: "2", toughness: "5", keywords: ["Goad", "Choose a background", "Treasure"], oracleText: "Creatures your opponents control with power less than Baeloth Barrityl's power are goaded. (They attack each combat if able and attack a player other than you if able.)\nWhenever a goaded attacking or blocking creature dies, you create a Treasure token.\nChoose a Background (You can have a Background as a second commander.)" });
const throng = card("Notorious Throng", "Kindred Sorcery — Rogue", "{3}{U}", { keywords: ["Prowl"], oracleText: "Prowl {5}{U} (You may cast this for its prowl cost if you dealt combat damage to a player this turn with a Rogue.)\nCreate X 1/1 black Faerie Rogue creature tokens with flying, where X is the damage dealt to your opponents this turn. If this spell's prowl cost was paid, take an extra turn after this one." });
const ascendancy = card("Riveteers Ascendancy", "Enchantment", "{B}{R}{G}", { oracleText: "Whenever you sacrifice a creature, you may return target creature card with lesser mana value from your graveyard to the battlefield tapped. Do this only once each turn." });
const shock = card("Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." });
const giantGrowth = card("Giant Growth", "Instant", "{G}", { oracleText: "Target creature gets +3/+3 until end of turn." });
const altar = card("Test Altar", "Artifact", "{1}", { oracleText: "Sacrifice a creature: You gain 1 life." });
const rogue = bear({ name: "Test Rogue", typeLine: "Creature — Human Rogue", subtypes: ["Human", "Rogue"] });
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3", cmc: 3 });
const giant = card("Test Giant", "Creature — Giant", "{3}{R}", { power: "4", toughness: "4", cmc: 4 });
const rock = card("Test Rock", "Artifact", "{2}", { cmc: 2 });
const vehicle = card("Test Vehicle", "Artifact — Vehicle", "{2}", { cmc: 2, power: "5", toughness: "5", keywords: ["Crew"], oracleText: "Crew 3" });
const mountainCard = card("Mountain", "Basic Land — Mountain");

describe("Notorious Throng: the damage dealt to your opponents this turn", () => {
  it("is fully supported", () => supported(throng));

  it("counts all the damage dealt to opponents this turn, by any source; not damage dealt to you", () => {
    const { s: s0, ap, ids } = setup([shock, shock, shock, throng]);
    const [b, c] = [next(s0, ap), next(s0, ap, 2)];
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [player(b)])));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [player(c)])));
    s = resolveAll(run(s, planCast(s, ap, ids[2]!, [player(ap)])));
    const before = s.battlefield.length;
    s = resolveAll(run(s, planCast(s, ap, ids[3]!)));
    const tokens = named(s, "Faerie Rogue");
    expect(tokens.length).toBe(4);
    expect(s.battlefield.length).toBe(before + 4);
    expect(pt(s, tokens[0]!)).toBe("1/1");
    expect(objHasKeyword(s, s.objects[tokens[0]!]!, "Flying")).toBe(true);
    // Cast for its normal cost: no extra turn.
    expect(s.extraTurns?.length ?? 0).toBe(0);
  });

  it("cast for its prowl cost after a Rogue's combat damage: an extra turn, and the combat damage counts", () => {
    const { s: s0, ap, ids } = setup([throng]);
    const b = next(s0, ap);
    const r = putOnBattlefield(s0, ap, rogue);
    let s = swing(s0, ap, b, [r]);
    s = advance(s, "main2", ap);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "prowl" })));
    expect(named(s, "Faerie Rogue").length).toBe(2);
    expect(s.extraTurns?.length).toBe(1);
  });
});

describe("Riveteers Ascendancy: return a creature card with lesser mana value, once each turn", () => {
  it("is fully supported", () => supported(ascendancy));

  it("returns a card with lesser mana value than the sacrificed creature, tapped; then it doesn't trigger again that turn", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, ascendancy);
    const sac = putOnBattlefield(s0, ap, altar);
    const o1 = putOnBattlefield(s0, ap, ogre);
    const o2 = putOnBattlefield(s0, ap, ogre);
    const cheap = into(s0, ap, bear({ cmc: 2 }), "graveyard");
    const big = into(s0, ap, giant, "graveyard");
    let s = run(s0, planActivate(s0, ap, sac, 0, undefined, undefined, undefined, undefined, { sacrifice: [o1] }));
    // The trigger targets as it's put on the stack: the 4-drop isn't a legal target, the 2-drop is.
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    const p = s.pending as Extract<GameState["pending"], { kind: "chooseTargets" }>;
    expect(JSON.stringify(p)).not.toContain(big);
    s = act(s, { type: "chooseTargets", player: ap, targets: [obj(cheap)] });
    s = resolveAll(s);
    expect(s.objects[cheap]!.zone).toBe("battlefield");
    expect(s.objects[cheap]!.tapped).toBe(true);
    // Done once this turn: sacrificing again doesn't trigger.
    s = run(s, planActivate(s, ap, sac, 0, undefined, undefined, undefined, undefined, { sacrifice: [o2] }));
    s = resolveAll(s);
    expect(s.stack.length + s.triggerQueue.length).toBe(0);
    expect(s.objects[big]!.zone).toBe("graveyard");
  });

  it("choosing not to return one isn't doing it: the next sacrifice triggers it again (rulings)", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, ascendancy);
    const sac = putOnBattlefield(s0, ap, altar);
    const o1 = putOnBattlefield(s0, ap, ogre);
    const o2 = putOnBattlefield(s0, ap, ogre);
    const cheap = into(s0, ap, bear({ cmc: 2 }), "graveyard");
    let s = run(s0, planActivate(s0, ap, sac, 0, undefined, undefined, undefined, undefined, { sacrifice: [o1] }));
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [obj(cheap)] }), false);
    expect(s.objects[cheap]!.zone).toBe("graveyard");
    s = run(s, planActivate(s, ap, sac, 0, undefined, undefined, undefined, undefined, { sacrifice: [o2] }));
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [obj(cheap)] }));
    expect(s.objects[cheap]!.zone).toBe("battlefield");
  });
});

describe("Baeloth Barrityl: opponents' creatures with less power are goaded", () => {
  it("is fully supported", () => supported(baeloth));

  it("goads opponents' creatures with power less than its own, as it changes", () => {
    const { s: s0, ap, ids } = setup([giantGrowth]);
    const b = next(s0, ap);
    const ba = putOnBattlefield(s0, ap, baeloth);
    const small = putOnBattlefield(s0, b, card("Test Elf", "Creature — Elf", "{G}", { power: "1", toughness: "1" }));
    const mid = putOnBattlefield(s0, b, ogre);
    const mine = putOnBattlefield(s0, ap, card("Test Elf", "Creature — Elf", "{G}", { power: "1", toughness: "1" }));
    expect(characteristics(s0, s0.objects[small]!).goadedBy).toEqual([ap]);
    expect(characteristics(s0, s0.objects[mid]!).goadedBy).toEqual([]);
    expect(characteristics(s0, s0.objects[mine]!).goadedBy).toEqual([]);
    // Baeloth gets +3/+3: now the 3/3 is goaded too.
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(ba)])));
    expect(characteristics(s, s.objects[mid]!).goadedBy).toEqual([ap]);
    expect(characteristics(s, s.objects[mid]!).goaded).toBe(true);
  });

  it("a goaded attacking creature that dies makes a Treasure for Baeloth's controller; another attacker doesn't", () => {
    const { s: s0, ap } = setup([]);
    const [b, c] = [next(s0, ap), next(s0, ap, 2)];
    putOnBattlefield(s0, ap, baeloth);
    const small = putOnBattlefield(s0, b, card("Test Elf", "Creature — Elf", "{G}", { power: "1", toughness: "1" }));
    const mid = putOnBattlefield(s0, b, ogre);
    // C blocks with a 4/4.
    const wall = putOnBattlefield(s0, c, giant);
    let s = advance(s0, "main1", b);
    s = passUntil(s, "declareAttackers", b);
    // Goaded: it must attack, and not Baeloth's controller.
    expect(() => act(s, { type: "declareAttackers", player: b, attacks: [{ attacker: mid, defender: c }] })).toThrow();
    s = act(s, { type: "declareAttackers", player: b, attacks: [{ attacker: small, defender: c }, { attacker: mid, defender: c }] });
    for (let i = 0; i < 40 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareBlockers", player: c, blocks: [{ blocker: wall, attacker: mid }] });
    s = resolveAll(s);
    for (let i = 0; i < 40 && s.step !== "combatDamage"; i++) s = resolveAll(act(s, { type: "passPriority", player: waitingOn(s)! }));
    s = resolveAll(s);
    // The Ogre (not goaded) died: no Treasure.
    expect(s.objects[mid]!.zone).toBe("graveyard");
    expect(named(s, "Treasure").length).toBe(0);
    // Now a goaded attacker dies: a Treasure for Baeloth's controller.
    const { s: t0, ap: ap1, ids } = setup([shock]);
    const b1 = next(t0, ap1);
    putOnBattlefield(t0, ap1, baeloth);
    const elf = putOnBattlefield(t0, b1, card("Test Elf", "Creature — Elf", "{G}", { power: "1", toughness: "1" }));
    let t = advance(t0, "main1", b1);
    // The Shock stays in Ken's hand across turns: cast it at instant speed during B's combat.
    t = passUntil(t, "declareAttackers", b1);
    t = act(t, { type: "declareAttackers", player: b1, attacks: [{ attacker: elf, defender: next(t, b1) === ap1 ? next(t, b1, 2) : next(t, b1) }] });
    for (let i = 0; i < 10 && waitingOn(t) !== ap1; i++) t = act(t, { type: "passPriority", player: waitingOn(t)! });
    t = resolveAll(run(t, planCast(t, ap1, ids[0]!, [obj(elf)])));
    expect(t.objects[elf]!.zone).toBe("graveyard");
    const treasures = named(t, "Treasure");
    expect(treasures.length).toBe(1);
    expect(t.objects[treasures[0]!]!.controller).toBe(ap1);
  });
});

describe("Depthshaker Titan: any number of target noncreature artifacts become 3/3 artifact creatures", () => {
  it("is fully supported", () => supported(titan));

  it("they become 3/3s with melee, trample and haste, and are sacrificed at the beginning of the next end step", () => {
    const { s: s0, ap, ids } = setup([titan]);
    const r = putOnBattlefield(s0, ap, rock);
    const v = putOnBattlefield(s0, ap, vehicle);
    const other = putOnBattlefield(s0, ap, rock);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = act(s, { type: "chooseTargets", player: ap, targets: [obj(r), obj(v)] });
    s = resolveAll(s);
    for (const id of [r, v]) {
      expect(pt(s, id)).toBe("3/3");
      expect(characteristics(s, s.objects[id]!).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
      for (const k of ["Trample", "Haste"]) expect(objHasKeyword(s, s.objects[id]!, k)).toBe(true);
    }
    expect(characteristics(s, s.objects[other]!).types).not.toContain("Creature");
    // Melee: attacking one opponent, +1/+1.
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: r, defender: next(s, ap) }] });
    s = resolveAll(s);
    expect(pt(s, r)).toBe("4/4");
    s = advance(s, "end", ap);
    expect(s.objects[r]!.zone).toBe("graveyard");
    expect(s.objects[v]!.zone).toBe("graveyard");
    expect(s.objects[other]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
  });
});

describe("The Gitrog, Ravenous Ride: sacrifice a creature that saddled it this turn", () => {
  it("is fully supported", () => supported(gitrog));

  it("sacrifices a creature that saddled it: draw X, then put up to X lands from hand onto the battlefield tapped", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    const g = putOnBattlefield(s0, ap, gitrog);
    const saddler = putOnBattlefield(s0, ap, ogre);
    const bystander = putOnBattlefield(s0, ap, bear());
    handOf(s0, ap, [mountainCard, mountainCard, mountainCard, mountainCard]);
    let s = resolveAll(run(s0, planActivate(s0, ap, g, ability(gitrog, /^Saddle/), undefined, undefined, [saddler])));
    expect(s.objects[g]!.saddled).toBe(true);
    s = swing(s, ap, b, [g]);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    // Only the Ogre saddled it: it's the one sacrificed, without a choice.
    expect(s.objects[saddler]!.zone).toBe("graveyard");
    expect(s.objects[bystander]!.zone).toBe("battlefield");
    // Drew 3 (its power); now up to 3 land cards from hand.
    expect(s.players[ap]!.hand.length).toBe(7);
    expect(s.pending).toMatchObject({ player: ap });
    const lands = s.players[ap]!.hand.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Mountain").slice(0, 3);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", fromHand: true, min: 0, max: 3 });
    s = act(s, { type: "searchLibrary", player: ap, found: lands });
    s = resolveAll(s);
    for (const id of lands) {
      expect(s.objects[id]!.zone).toBe("battlefield");
      expect(s.objects[id]!.tapped).toBe(true);
    }
  });

  it("a creature that didn't saddle it this turn can't be sacrificed for it", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    const g = putOnBattlefield(s0, ap, gitrog);
    const bystander = putOnBattlefield(s0, ap, bear());
    handOf(s0, ap, []);
    const s = swing(s0, ap, b, [g]);
    // Nothing saddled it: "you may sacrifice" has nothing to sacrifice; nothing happens.
    const t = resolveAll(s);
    expect(t.objects[bystander]!.zone).toBe("battlefield");
    expect(t.players[ap]!.hand.length).toBe(0);
  });
});

describe("Lolth, Spider Queen: the −8 emblem", () => {
  it("is fully supported", () => supported(lolth));

  it("an opponent dealt combat damage loses life up to 8 for the turn, once for the step's damage", () => {
    const { s: s0, ap } = setup([]);
    const [b, c] = [next(s0, ap), next(s0, ap, 2)];
    const l = putOnBattlefield(s0, ap, lolth);
    s0.objects[l]!.counters = { loyalty: 8 };
    const x = putOnBattlefield(s0, ap, bear());
    const y = putOnBattlefield(s0, ap, bear({ name: "Bear 2" }));
    const z = putOnBattlefield(s0, ap, ogre);
    let s = resolveAll(run(s0, planActivate(s0, ap, l, ability(lolth, /^−8/))));
    expect(s.objects[l]!.zone).toBe("graveyard");
    // C already lost 9 life this turn.
    s.players[c]!.life -= 9;
    s.turnLog = { ...s.turnLog, lifeLost: { ...s.turnLog?.lifeLost, [c]: 9 } };
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: x, defender: b }, { attacker: y, defender: b }, { attacker: z, defender: c }] });
    s = advance(s, "main2", ap);
    // B: 4 combat damage, then 4 more (8 in all). C: 3 damage, already past 8.
    expect(s.players[b]!.life).toBe(40 - 8);
    expect(s.players[c]!.life).toBe(40 - 9 - 3);
  });
});

// More of the most played cards the new pieces complete.
const diffusion = card("Diffusion Sliver", "Creature — Sliver", "{1}{U}", { power: "1", toughness: "1", oracleText: "Whenever a Sliver creature you control becomes the target of a spell or ability an opponent controls, counter that spell or ability unless its controller pays {2}." });
const horn = card("Horn of the Mark", "Legendary Artifact", "{2}", { oracleText: "Whenever two or more creatures you control attack a player, look at the top five cards of your library. You may reveal a creature card from among them and put it into your hand. Put the rest on the bottom of your library in a random order." });
const merry = card("Merry, Esquire of Rohan", "Legendary Creature — Halfling Knight", "{R}{W}", { power: "2", toughness: "2", keywords: ["Haste"], oracleText: "Haste\nMerry has first strike as long as it's equipped.\nWhenever you attack with Merry and another legendary creature, draw a card." });
const wand = card("Chaos Wand", "Artifact", "{3}", { oracleText: "{4}, {T}: Target opponent exiles cards from the top of their library until they exile an instant or sorcery card. You may cast that card without paying its mana cost. Then put the exiled cards that weren't cast this way on the bottom of that library in a random order." });
const verity = card("Verity Circle", "Enchantment", "{2}{U}", { oracleText: "Whenever a creature an opponent controls becomes tapped, if it isn't being declared as an attacker, you may draw a card.\n{4}{U}: Tap target creature without flying." });
const bayek = card("Bayek of Siwa", "Legendary Creature — Human Assassin", "{3}{R}{W}", { power: "3", toughness: "4", keywords: ["Disguise", "Double strike"], oracleText: "Double strike\nDuring your turn, other historic creatures you control have double strike.\nDisguise {1}{R}{W} (You may cast this card face down for {3} as a 2/2 creature with ward {2}. Turn it face up any time for its disguise cost.)" });
const triumph = card("Liliana's Triumph", "Instant", "{1}{B}", { oracleText: "Each opponent sacrifices a creature of their choice. If you control a Liliana planeswalker, each opponent also discards a card." });
const torens = card("Torens, Fist of the Angels", "Legendary Creature — Human Cleric", "{1}{G}{W}", { power: "2", toughness: "2", keywords: ["Training"], oracleText: "Training (Whenever this creature attacks with another creature with greater power, put a +1/+1 counter on this creature.)\nWhenever you cast a creature spell, create a 1/1 green and white Human Soldier creature token with training." });
const guests = card("Banquet Guests", "Creature — Halfling Citizen", "{X}{G}{W}", { power: "0", toughness: "0", keywords: ["Affinity", "Trample"], oracleText: "Affinity for Foods (This spell costs {1} less to cast for each Food you control.)\nTrample\nThis creature enters with twice X +1/+1 counters on it.\n{2}, Sacrifice a Food: This creature gains indestructible until end of turn." });
const horse = card("Akroan Horse", "Artifact Creature — Horse", "{4}", { cmc: 4, power: "0", toughness: "4", keywords: ["Defender"], oracleText: "Defender\nWhen this creature enters, an opponent gains control of it.\nAt the beginning of your upkeep, each opponent creates a 1/1 white Soldier creature token." });
const visions = card("Fevered Visions", "Enchantment", "{1}{U}{R}", { oracleText: "At the beginning of each player's end step, that player draws a card. If the player is your opponent and has four or more cards in hand, this enchantment deals 2 damage to that player." });
const sami = card("Sami, Wildcat Captain", "Legendary Creature — Human Artificer Rogue", "{4}{R}{W}", { power: "4", toughness: "4", keywords: ["Vigilance", "Double strike"], oracleText: "Double strike, vigilance\nSpells you cast have affinity for artifacts. (They cost {1} less to cast for each artifact you control.)" });
const necro = card("Necrodominance", "Legendary Enchantment", "{B}{B}{B}", { oracleText: "Skip your draw step.\nAt the beginning of your end step, you may pay any amount of life. If you do, draw that many cards.\nYour maximum hand size is five.\nIf a card or token would be put into your graveyard from anywhere, exile it instead." });
const sliver = card("Test Sliver", "Creature — Sliver", "{1}", { power: "1", toughness: "1" });
const legend = bear({ name: "Test Legend", typeLine: "Legendary Creature — Bear", supertypes: ["Legendary"] });
const liliana = card("Liliana, Test Walker", "Legendary Planeswalker — Liliana", "{2}{B}", { loyalty: "3" });
const untapped = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && !s.objects[id]!.tapped && characteristics(s, s.objects[id]!).types.includes("Land")).length;
const onTop = (s: GameState, pid: PlayerId, defs: CardDef[]) => defs.reverse().map((d) => into(s, pid, d, "library")).reverse();

describe("Other popular cards the new pieces complete", () => {
  it("are fully supported", () => supported(diffusion, horn, merry, wand, verity, bayek, triumph, torens, guests, horse, visions, sami, necro));

  it("Diffusion Sliver: an opponent's spell targeting a Sliver is countered unless they pay {2}; a non-Sliver isn't protected", () => {
    const { s: s0, ap, ids, opp } = setup([shock, shock]);
    putOnBattlefield(s0, opp, diffusion);
    const sl = putOnBattlefield(s0, opp, sliver);
    const nb = putOnBattlefield(s0, opp, bear());
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(sl)])));
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap, cost: "{2}" });
    s = resolveAll(act(s, { type: "payUnless", player: ap, pay: false }));
    expect(s.objects[sl]!.zone).toBe("battlefield");
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [obj(nb)])));
    expect(s.pending).toBeNull();
    expect(s.objects[nb]!.zone).toBe("graveyard");
  });

  it("Horn of the Mark: two or more creatures attacking the same player; attackers split between players don't count", () => {
    const { s: s0, ap } = setup([]);
    const [b, c] = [next(s0, ap), next(s0, ap, 2)];
    putOnBattlefield(s0, ap, horn);
    const [x, y] = [putOnBattlefield(s0, ap, bear()), putOnBattlefield(s0, ap, bear({ name: "Bear 2" }))];
    let s = swing(s0, ap, b, []);
    s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: x, defender: b }, { attacker: y, defender: c }] });
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
    const { s: t0, ap: ap1 } = setup([]);
    putOnBattlefield(t0, ap1, horn);
    const [x1, y1] = [putOnBattlefield(t0, ap1, bear()), putOnBattlefield(t0, ap1, bear({ name: "Bear 2" }))];
    const [top] = onTop(t0, ap1, [giant, mountainCard, mountainCard, mountainCard, mountainCard]);
    let t = passUntil(t0, "declareAttackers", ap1);
    t = act(t, { type: "declareAttackers", player: ap1, attacks: [{ attacker: x1, defender: next(t, ap1) }, { attacker: y1, defender: next(t, ap1) }] });
    t = resolveAll(t);
    expect(t.pending).toMatchObject({ player: ap1 });
    expect(JSON.stringify(t.pending)).toContain(top);
  });

  it("Merry: attacking with another legendary creature draws a card; with a nonlegendary one it doesn't", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    const m = putOnBattlefield(s0, ap, merry);
    const l = putOnBattlefield(s0, ap, legend);
    const plain = putOnBattlefield(s0, ap, bear());
    const hand = s0.players[ap]!.hand.length;
    let s = passUntil(s0, "declareAttackers", ap);
    s = resolveAll(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: m, defender: b }, { attacker: plain, defender: b }] }));
    expect(s.players[ap]!.hand.length).toBe(hand);
    const { s: t0, ap: ap1 } = setup([]);
    const m1 = putOnBattlefield(t0, ap1, merry);
    const l1 = putOnBattlefield(t0, ap1, legend);
    const hand1 = t0.players[ap1]!.hand.length;
    let t = passUntil(t0, "declareAttackers", ap1);
    t = resolveAll(act(t, { type: "declareAttackers", player: ap1, attacks: [{ attacker: m1, defender: next(t, ap1) }, { attacker: l1, defender: next(t, ap1) }] }));
    expect(t.players[ap1]!.hand.length).toBe(hand1 + 1);
    expect(l).toBeTruthy();
  });

  it("Chaos Wand: the opponent exiles until an instant or sorcery; you may cast it free; the rest go to the bottom", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    const w = putOnBattlefield(s0, ap, wand);
    const [miss, hit] = onTop(s0, b, [bear(), shock]);
    let s = resolveAll(run(s0, planActivate(s0, ap, w, 0, [player(b)])));
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: hit });
    s = act(s, { type: "castSpell", player: ap, objectId: hit!, targets: [player(b)] });
    s = resolveAll(s);
    expect(s.players[b]!.life).toBe(38);
    // The Shock is B's: it goes to B's graveyard. The Bear went to the bottom of B's library.
    expect(s.objects[hit!]!.zone).toBe("graveyard");
    expect(s.players[b]!.library.at(-1)).toBe(miss);
  });

  it("Verity Circle: draws when an opponent's creature becomes tapped, but not as it's declared as an attacker", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    const v = putOnBattlefield(s0, ap, verity);
    const theirs = putOnBattlefield(s0, b, bear({ name: "Their Bear" }));
    const hand = s0.players[ap]!.hand.length;
    let s = run(s0, planActivate(s0, ap, v, 0, [obj(theirs)]));
    s = resolveAll(s);
    expect(s.objects[theirs]!.tapped).toBe(true);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    // On B's turn it attacks: no draw.
    s = advance(s, "main1", b);
    const before = s.players[ap]!.hand.length;
    s = passUntil(s, "declareAttackers", b);
    s = act(s, { type: "declareAttackers", player: b, attacks: [{ attacker: theirs, defender: ap }] });
    expect(s.objects[theirs]!.tapped).toBe(true);
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
    expect(s.players[ap]!.hand.length).toBe(before);
  });

  it("Bayek of Siwa: other historic creatures you control have double strike during your turn only", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    putOnBattlefield(s0, ap, bayek);
    const l = putOnBattlefield(s0, ap, legend);
    const plain = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, b, legend);
    expect(objHasKeyword(s0, s0.objects[l]!, "Double strike")).toBe(true);
    expect(objHasKeyword(s0, s0.objects[plain]!, "Double strike")).toBe(false);
    expect(objHasKeyword(s0, s0.objects[theirs]!, "Double strike")).toBe(false);
    const s = advance(s0, "main1", b);
    expect(objHasKeyword(s, s.objects[l]!, "Double strike")).toBe(false);
  });

  it("Liliana's Triumph: each opponent sacrifices a creature; with a Liliana, each opponent also discards a card", () => {
    for (const withLiliana of [false, true]) {
      const { s: s0, ap, ids } = setup([triumph]);
      if (withLiliana) s0.objects[putOnBattlefield(s0, ap, liliana)]!.counters = { loyalty: 3 };
      const opps = s0.turnOrder.filter((p) => p !== ap);
      const theirs = opps.map((p) => putOnBattlefield(s0, p, bear()));
      const hands = opps.map((p) => s0.players[p]!.hand.length);
      let s = run(s0, planCast(s0, ap, ids[0]!));
      for (let i = 0; i < 20 && (s.stack.length || s.pending); i++) {
        const p = s.pending;
        if (p?.kind === "discard") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, 1) });
        else if (p) throw new Error(`unexpected ${p.kind}`);
        else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
      for (const id of theirs) expect(s.objects[id]!.zone).toBe("graveyard");
      opps.forEach((p, i) => expect(s.players[p]!.hand.length).toBe(hands[i]! - (withLiliana ? 1 : 0)));
    }
  });

  it("Torens: casting a creature spell makes a 1/1 Human Soldier with training", () => {
    const { s: s0, ap, ids } = setup([bear()]);
    putOnBattlefield(s0, ap, torens);
    const big = putOnBattlefield(s0, ap, ogre);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    const [tok] = named(s, "Human Soldier");
    expect(tok).toBeTruthy();
    expect(pt(s, tok!)).toBe("1/1");
    // Training: it attacks with the 3/3 and gets a +1/+1 counter (as if it had been there since the turn began).
    s.objects[tok!]!.controlledSinceTurn = 0;
    s = passUntil(s, "declareAttackers", ap);
    s = resolveAll(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: tok!, defender: next(s, ap) }, { attacker: big, defender: next(s, ap) }] }));
    expect(pt(s, tok!)).toBe("2/2");
  });

  it("Banquet Guests: enters with twice X +1/+1 counters", () => {
    const { s: s0, ap, ids } = setup([guests]);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 3)));
    expect(s.objects[ids[0]!]!.counters?.["+1/+1"]).toBe(6);
    expect(pt(s, ids[0]!)).toBe("6/6");
  });

  it("Akroan Horse: as it enters, you choose an opponent, who gains control of it", () => {
    const { s: s0, ap, ids } = setup([horse]);
    const b = next(s0, ap, 2);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ player: ap });
    s = act(s, { type: "chooseOption", player: ap, choice: String(b) });
    s = resolveAll(s);
    expect(characteristics(s, s.objects[ids[0]!]!).controller).toBe(b);
  });

  it("Fevered Visions: each player draws at their end step; an opponent with four or more cards in hand takes 2", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    putOnBattlefield(s0, ap, visions);
    handOf(s0, ap, []);
    handOf(s0, b, [bear(), bear(), bear()]);
    let s = advance(s0, "end", ap);
    expect(s.players[ap]!.hand.length).toBe(1);
    expect(s.players[ap]!.life).toBe(40);
    s = advance(s, "end", b);
    // B drew one at their draw step and one at their end step: 5 cards.
    expect(s.players[b]!.hand.length).toBe(5);
    expect(s.players[b]!.life).toBe(38);
  });

  it("Sami: spells you cast cost {1} less for each artifact you control", () => {
    const { s: s0, ap, ids } = setup([horse]);
    putOnBattlefield(s0, ap, sami);
    putOnBattlefield(s0, ap, rock);
    putOnBattlefield(s0, ap, rock);
    const lands = untapped(s0, ap);
    const s = run(s0, planCast(s0, ap, ids[0]!));
    expect(lands - untapped(s, ap)).toBe(2);
  });

  it("Necrodominance: at your end step, pay any amount of life and draw that many", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, necro);
    handOf(s0, ap, []);
    let s = s0;
    for (let i = 0; i < 40 && s.pending?.kind !== "chooseOption"; i++)
      s = act(s, s.pending?.kind === "declareAttackers" ? { type: "declareAttackers", player: ap, attacks: [] } : { type: "passPriority", player: waitingOn(s)! });
    expect(s.step).toBe("end");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payLife", player: ap, numberRange: { min: 0, max: 40 } });
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: "3" }));
    expect(s.players[ap]!.life).toBe(37);
    expect(s.players[ap]!.hand.length).toBe(3);
  });
});

describe("Cards the new pieces complete along the way", () => {
  const beaver = card("Giant Beaver", "Creature — Beaver Mount", "{3}{G}", { power: "4", toughness: "4", keywords: ["Saddle", "Vigilance"], oracleText: "Vigilance\nWhenever this creature attacks while saddled, put a +1/+1 counter on target creature that saddled it this turn.\nSaddle 3 (Tap any number of other creatures you control with total power 3 or more: This Mount becomes saddled until end of turn. Saddle only as a sorcery.)" });
  const stoneshaker = card("Stoneshaker Shaman", "Creature — Human Shaman", "{2}{R}", { power: "1", toughness: "1", oracleText: "At the beginning of each player's end step, that player sacrifices an untapped land of their choice." });
  const landroval = card("Landroval, Horizon Witness", "Legendary Creature — Bird Noble", "{4}{W}", { power: "3", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nWhenever two or more creatures you control attack a player, target attacking creature without flying gains flying until end of turn." });

  it("are fully supported", () => supported(beaver, stoneshaker, landroval));

  it("Giant Beaver: only a creature that saddled it this turn can be the target", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, beaver);
    const saddler = putOnBattlefield(s0, ap, ogre);
    const bystander = putOnBattlefield(s0, ap, bear());
    let s = resolveAll(run(s0, planActivate(s0, ap, g, ability(beaver, /^Saddle/), undefined, undefined, [saddler])));
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: g, defender: next(s, ap) }, { attacker: bystander, defender: next(s, ap) }] });
    if (s.pending?.kind === "chooseTargets") {
      expect(() => act(s, { type: "chooseTargets", player: ap, targets: [obj(bystander)] })).toThrow();
      s = act(s, { type: "chooseTargets", player: ap, targets: [obj(saddler)] });
    }
    s = resolveAll(s);
    expect(s.objects[saddler]!.counters?.["+1/+1"]).toBe(1);
    expect(s.objects[bystander]!.counters?.["+1/+1"] ?? 0).toBe(0);
  });

  it("Stoneshaker Shaman: at each player's end step, that player sacrifices an untapped land", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    putOnBattlefield(s0, ap, stoneshaker);
    const lands = (s: GameState, p: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === p && characteristics(s, s.objects[id]!).types.includes("Land")).length;
    const [mine, theirs] = [lands(s0, ap), lands(s0, b)];
    let s = s0;
    for (let i = 0; i < 40 && !(s.step === "end" && s.pending); i++)
      s = act(s, s.pending?.kind === "declareAttackers" ? { type: "declareAttackers", player: ap, attacks: [] } : { type: "passPriority", player: waitingOn(s)! });
    // Ken picks one of his untapped lands.
    const p = s.pending as Extract<GameState["pending"], { kind: "pickPermanents" }>;
    expect(p).toMatchObject({ kind: "pickPermanents", player: ap });
    s = resolveAll(act(s, { type: "pickPermanents", player: ap, ids: p.options.slice(0, 1) }));
    expect(lands(s, ap)).toBe(mine - 1);
    expect(lands(s, b)).toBe(theirs);
  });

  it("Landroval: two creatures attacking one player; the attacking creature without flying gains flying", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, landroval);
    const [x, y] = [putOnBattlefield(s0, ap, bear()), putOnBattlefield(s0, ap, bear({ name: "Bear 2" }))];
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: x, defender: next(s, ap) }, { attacker: y, defender: next(s, ap) }] });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [obj(x)] });
    s = resolveAll(s);
    expect(objHasKeyword(s, s.objects[x]!, "Flying")).toBe(true);
  });
});
