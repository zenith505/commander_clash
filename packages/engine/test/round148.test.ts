// Round 148: the most played cards, in popularity order, starting with Benthic Anomaly.

import { describe, expect, it } from "vitest";
import { act, addEffect, bear, card, mountain, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, castProblem, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, spellCost, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type Step, type TargetChoice } from "../src";

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
const obj = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const next = (s: GameState, pid: PlayerId, k = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + k) % s.turnOrder.length]!;
const generic = (c: { cost: { symbols: { kind: string }[] }; extra: number }) => c.extra;
const colored = (c: { cost: { symbols: { kind: string; color?: string }[] } }) => c.cost.symbols.filter((y) => y.kind === "colored").map((y) => y.color).join("");

// Real oracle text (Scryfall).
const hellkite = card("Blast-Furnace Hellkite", "Creature — Dragon", "{7}{R}{R}", { power: "5", toughness: "5", keywords: ["Flying", "Offering", "Double strike"], oracleText: "Artifact offering (You may cast this spell as though it had flash by sacrificing an artifact and paying the difference in mana costs between this and the sacrificed artifact. Mana cost includes color.)\nFlying, double strike\nCreatures attacking your opponents have double strike." });
const akki = card("Patron of the Akki", "Legendary Creature — Spirit", "{4}{R}{R}", { power: "5", toughness: "5", keywords: ["Offering"], oracleText: "Goblin offering (You may cast this spell any time you could cast an instant by sacrificing a Goblin and paying the difference in mana costs between this and the sacrificed Goblin. Mana cost includes color.)\nWhenever Patron of the Akki attacks, creatures you control get +2/+0 until end of turn." });
const kitsune = card("Patron of the Kitsune", "Legendary Creature — Spirit", "{4}{W}{W}", { power: "5", toughness: "6", keywords: ["Offering"], oracleText: "Fox offering (You may cast this spell any time you could cast an instant by sacrificing a Fox and paying the difference in mana costs between this and the sacrificed Fox. Mana cost includes color.)\nWhenever a creature attacks, you may gain 1 life." });
const goblin = card("Test Goblin", "Creature — Goblin", "{1}{R}", { power: "1", toughness: "1" });
const relic = card("Test Relic", "Artifact", "{2}{U}", {});

describe("offering (Blast-Furnace Hellkite, the Patrons)", () => {
  it("is fully supported; a Goblin sacrificed takes its mana cost off, colored mana included (CR 702.48c)", () => {
    supported(hellkite, akki, kitsune);
    const { s, ap, ids } = setup([akki]);
    const g = putOnBattlefield(s, ap, goblin);
    const o = s.objects[ids[0]!]!;
    expect(colored(spellCost(s, ap, o))).toBe("RR");
    expect(generic(spellCost(s, ap, o))).toBe(4);
    // {4}{R}{R} less {1}{R}: {3}{R}.
    const less = spellCost(s, ap, o, 0, [], { offering: g });
    expect(colored(less)).toBe("R");
    expect(generic(less)).toBe(3);
  });

  it("colored mana the spell's cost doesn't have takes off generic mana instead (CR 118.7b)", () => {
    const { s, ap, ids } = setup([hellkite]);
    const r = putOnBattlefield(s, ap, relic);
    const less = spellCost(s, ap, s.objects[ids[0]!]!, 0, [], { offering: r });
    // {7}{R}{R} less {2}{U}: {4}{R}{R}.
    expect(colored(less)).toBe("RR");
    expect(generic(less)).toBe(4);
  });

  it("casts it any time you could cast an instant with the sacrifice, not without; the permanent is sacrificed as it's paid for", () => {
    const { s: s0, ap, ids } = setup([akki]);
    const g = putOnBattlefield(s0, ap, goblin);
    let s = passUntil(s0, "end", ap);
    expect(castProblem(s, ap, ids[0]!, undefined, undefined, undefined, undefined, 0, {})).toMatch(/sorcery speed/);
    // Before its costs are chosen, it can be cast with {3}{R} in the pool: there's a Goblin to offer.
    const pooled = structuredClone(s);
    Object.assign(pooled.players[ap]!.manaPool, { R: 1, G: 3 });
    expect(castProblem(pooled, ap, ids[0]!)).toBeNull();
    expect(castProblem(pooled, ap, ids[0]!, undefined, undefined, undefined, undefined, 0, { offering: g })).toBeNull();
    s = run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { offering: g }));
    expect(s.objects[g]!.zone).toBe("graveyard");
    expect(s.log.some((l) => /sacrifices Test Goblin \(offering\)/.test(l.text))).toBe(true);
    s = resolveAll(s);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    // Four lands tapped for {3}{R}.
    expect(s.battlefield.filter((id) => s.objects[id]!.tapped).length).toBe(4);
  });

  it("only a permanent of its quality, one you control, can be offered", () => {
    const { s, ap, ids, opp } = setup([akki]);
    const mine = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, goblin);
    expect(castProblem(s, ap, ids[0]!, undefined, undefined, undefined, undefined, 0, { offering: mine })).toMatch(/offering sacrifices a Goblin/);
    expect(castProblem(s, ap, ids[0]!, undefined, undefined, undefined, undefined, 0, { offering: theirs })).toMatch(/offering sacrifices a Goblin/);
  });

  it("Blast-Furnace Hellkite: creatures attacking its controller's opponents have double strike, anyone's, but not those attacking its controller", () => {
    const { s: s0, ap } = setup([]);
    const [b, c] = [next(s0, ap), next(s0, ap, 2)];
    putOnBattlefield(s0, b, hellkite);
    const mine = putOnBattlefield(s0, ap, bear({ name: "Bear A" }));
    const yours = putOnBattlefield(s0, ap, bear({ name: "Bear B" }));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: mine, defender: c }, { attacker: yours, defender: b }] });
    // Attacking C, an opponent of the Hellkite's controller B: double strike. Attacking B: no.
    expect(objHasKeyword(s, s.objects[mine]!, "Double strike")).toBe(true);
    expect(objHasKeyword(s, s.objects[yours]!, "Double strike")).toBe(false);
  });
});

const turnabout = card("Turnabout", "Instant", "{2}{U}{U}", { oracleText: "Choose artifact, creature, or land. Tap all untapped permanents of the chosen type target player controls, or untap all tapped permanents of that type that player controls." });

describe("Turnabout", () => {
  it("is fully supported; the type, then tapping or untapping, chosen as it resolves", () => {
    supported(turnabout);
    const { s: s0, ap, ids, opp } = setup([turnabout]);
    const lands = [putOnBattlefield(s0, opp, mountain), putOnBattlefield(s0, opp, mountain)];
    const theirBear = putOnBattlefield(s0, opp, bear());
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [player(opp)])));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "cardType" });
    expect((s.pending as { options: string[] }).options).toEqual(["Artifact", "Creature", "Land"]);
    s = act(s, { type: "chooseOption", player: ap, choice: "Land" });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "either" });
    s = act(s, { type: "chooseOption", player: ap, choice: "0" });
    s = resolveAll(s);
    for (const l of lands) expect(s.objects[l]!.tapped).toBe(true);
    expect(s.objects[theirBear]!.tapped).toBe(false);
  });

  it("untaps all tapped permanents of that type the player controls", () => {
    const { s: s0, ap, ids } = setup([turnabout]);
    const mine = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && characteristics(s0, s0.objects[id]!).types.includes("Land"));
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [player(ap)])));
    const tapped = mine.filter((id) => s.objects[id]!.tapped);
    expect(tapped.length).toBe(4);
    s = act(s, { type: "chooseOption", player: ap, choice: "Land" });
    s = act(s, { type: "chooseOption", player: ap, choice: "1" });
    s = resolveAll(s);
    for (const l of mine) expect(s.objects[l]!.tapped).toBe(false);
  });
});

const faldorn = card("Faldorn, Dread Wolf Herald", "Legendary Creature — Human Druid", "{1}{R}{G}", { power: "3", toughness: "3", oracleText: "Whenever you cast a spell from exile or a land you control enters from exile, create a 2/2 green Wolf creature token.\n{1}, {T}, Discard a card: Exile the top card of your library. You may play it this turn." });

describe("Faldorn, Dread Wolf Herald", () => {
  const wolves = (s: GameState) => s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Wolf")).length;

  it("is fully supported; a land played from exile and a spell cast from exile each make a Wolf", () => {
    supported(faldorn);
    const { s: s0, ap } = setup([bear({ name: "Spare Card" }), bear({ name: "Spare Card 2" })]);
    const f = putOnBattlefield(s0, ap, faldorn);
    const land = into(s0, ap, card("Exiled Forest", "Basic Land — Forest"), "library");
    const ab = abilitiesOf(s0, s0.objects[f]!).activated.findIndex((a) => a.body.effects.some((e) => e.type === "impulse"));
    let s = resolveAll(run(s0, planActivate(s0, ap, f, ab, undefined, undefined, undefined, undefined, { discard: [s0.players[ap]!.hand[0]!] })));
    expect(s.objects[land]!.zone).toBe("exile");
    s = act(s, { type: "playLand", player: ap, objectId: land });
    s = resolveAll(s);
    expect(wolves(s)).toBe(1);
    // A spell cast from exile.
    const spell = into(s, ap, bear({ name: "Exiled Bear" }), "hand");
    s.players[ap]!.hand.splice(s.players[ap]!.hand.indexOf(spell), 1);
    s.objects[spell]!.zone = "exile";
    s.objects[spell]!.mayPlay = { player: ap, zc: s.objects[spell]!.zoneChanges ?? 0, until: "thisTurn", turn: s.turn };
    s.players[ap]!.exile.push(spell);
    invalidateCharacteristics(s);
    s = resolveAll(run(s, planCast(s, ap, spell)));
    expect(wolves(s)).toBe(2);
  });

  it("a land from your hand or a spell from your hand makes none", () => {
    const { s: s0, ap, ids } = setup([card("Hand Forest", "Basic Land — Forest"), bear()]);
    putOnBattlefield(s0, ap, faldorn);
    let s = resolveAll(act(s0, { type: "playLand", player: ap, objectId: ids[0]! }));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(wolves(s)).toBe(0);
  });
});

const calendar = card("The Millennium Calendar", "Legendary Artifact", "{1}", { oracleText: "Whenever you untap one or more permanents during your untap step, put that many time counters on The Millennium Calendar.\n{2}, {T}: Double the number of time counters on The Millennium Calendar.\nWhen there are 1,000 or more time counters on The Millennium Calendar, sacrifice it and each opponent loses 1,000 life." });

describe("The Millennium Calendar", () => {
  it("is fully supported; a time counter for each permanent untapped in your untap step, put on the stack in your upkeep", () => {
    supported(calendar);
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, calendar);
    const lands = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && id !== c);
    for (const id of lands.slice(0, 5)) s0.objects[id]!.tapped = true;
    let s = advance(s0, "end", ap);
    s = passUntil(s, "upkeep", ap);
    expect(s.stack.some((x) => x.sourceId === c) || s.triggerQueue.length > 0).toBe(true);
    s = resolveAll(s);
    expect(s.objects[c]!.counters.time).toBe(5);
  });

  it("doubles its counters; at 1,000 or more it's sacrificed and each opponent loses 1,000 life", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, calendar);
    s0.objects[c]!.counters.time = 500;
    const dbl = abilitiesOf(s0, s0.objects[c]!).activated.findIndex((a) => a.manaCost === "{2}");
    let s = resolveAll(run(s0, planActivate(s0, ap, c, dbl)));
    expect(s.objects[c]!.zone).toBe("graveyard");
    for (const p of s.players) if (p.id !== ap) expect(p.lost).toBe(true);
  });

  it("untapping nothing puts no counters on it", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, calendar);
    let s = advance(s0, "end", ap);
    s = advance(s, "draw", ap);
    expect(s.objects[c]!.counters.time ?? 0).toBe(0);
  });
});

const chakrams = card("Dancer's Chakrams", "Artifact — Equipment", "{3}{W}", { keywords: ["Job select", "Equip", "Krishna"], oracleText: 'Job select (When this Equipment enters, create a 1/1 colorless Hero creature token, then attach this to it.)\nEquipped creature gets +2/+2, has lifelink and "Other commanders you control get +2/+2 and have lifelink," and is a Performer in addition to its other types.\nKrishna — Equip {3}' });

describe("Dancer's Chakrams", () => {
  const board = () => {
    const { s, ap, opp } = setup([]);
    const holder = putOnBattlefield(s, ap, bear({ name: "Holder" }));
    const cmdr = putOnBattlefield(s, ap, bear({ name: "My Commander" }), { commander: true });
    const theirs = putOnBattlefield(s, opp, bear({ name: "Their Commander" }), { commander: true });
    const plain = putOnBattlefield(s, ap, bear({ name: "Plain Bear" }));
    const ch = putOnBattlefield(s, ap, chakrams);
    s.objects[ch]!.attachedTo = holder;
    invalidateCharacteristics(s);
    return { s, ap, holder, cmdr, theirs, plain };
  };

  it("is fully supported; the equipped creature and other commanders you control get +2/+2 and lifelink", () => {
    supported(chakrams);
    const { s, holder, cmdr, theirs, plain } = board();
    expect(pt(s, holder)).toBe("4/4");
    expect(objHasKeyword(s, s.objects[holder]!, "Lifelink")).toBe(true);
    expect(characteristics(s, s.objects[holder]!).subtypes).toContain("Performer");
    expect(pt(s, cmdr)).toBe("4/4");
    expect(objHasKeyword(s, s.objects[cmdr]!, "Lifelink")).toBe(true);
    // Not an opponent's commander, nor a creature that isn't a commander.
    expect(pt(s, theirs)).toBe("2/2");
    expect(objHasKeyword(s, s.objects[theirs]!, "Lifelink")).toBe(false);
    expect(objHasKeyword(s, s.objects[plain]!, "Lifelink")).toBe(false);
  });

  it("an equipped commander has the ability too, which only other commanders get (rulings)", () => {
    const { s, ap, cmdr } = board();
    const second = putOnBattlefield(s, ap, bear({ name: "Second Commander" }), { commander: true });
    const ch = s.battlefield.find((id) => s.objects[id]!.attachedTo !== undefined)!;
    s.objects[ch]!.attachedTo = cmdr;
    invalidateCharacteristics(s);
    expect(pt(s, cmdr)).toBe("4/4");
    expect(pt(s, second)).toBe("4/4");
  });

  it("a later effect that takes away the commander's abilities takes the lifelink too; an earlier one doesn't (CR 613.8b)", () => {
    const { s, ap, cmdr } = board();
    addEffect(s, ap, [cmdr], [{ kind: "loseAllAbilities" }]);
    expect(objHasKeyword(s, s.objects[cmdr]!, "Lifelink")).toBe(false);
    expect(pt(s, cmdr)).toBe("4/4");
    const early = board();
    early.s.effects.push({ id: "early", timestamp: -5, controller: early.ap, sourceName: "test", duration: "endOfTurn", affected: [early.cmdr], mods: [{ kind: "loseAllAbilities" }] });
    invalidateCharacteristics(early.s);
    expect(objHasKeyword(early.s, early.s.objects[early.cmdr]!, "Lifelink")).toBe(true);
  });

  it("the equipped creature losing its abilities after the Equipment was attached loses the granted one, and the others lose lifelink", () => {
    const { s, ap, holder, cmdr } = board();
    addEffect(s, ap, [holder], [{ kind: "loseAllAbilities" }]);
    expect(objHasKeyword(s, s.objects[cmdr]!, "Lifelink")).toBe(false);
    expect(pt(s, cmdr)).toBe("2/2");
  });
});

const amulet = card("Giant's Amulet", "Artifact — Equipment", "{U}", { keywords: ["Equip"], oracleText: 'When this Equipment enters, you may pay {3}{U}. If you do, create a 4/4 blue Giant Wizard creature token, then attach this Equipment to it.\nEquipped creature gets +0/+1 and has "This creature has hexproof as long as it\'s untapped."(It can\'t be the target of spells or abilities your opponents control.)\nEquip {2}' });
const spire = card("Restless Spire", "Land", "", { keywords: ["Scry"], oracleText: 'This land enters tapped.\n{T}: Add {U} or {R}.\n{U}{R}: Until end of turn, this land becomes a 2/1 blue and red Elemental creature with "During your turn, this creature has first strike." It\'s still a land.\nWhenever this land attacks, scry 1.' });

describe("granted abilities that give keywords: Giant's Amulet, Restless Spire", () => {
  it("Giant's Amulet: the equipped creature has hexproof only while it's untapped", () => {
    supported(amulet);
    const { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, bear());
    const a = putOnBattlefield(s, ap, amulet);
    s.objects[a]!.attachedTo = b;
    invalidateCharacteristics(s);
    expect(pt(s, b)).toBe("2/3");
    expect(objHasKeyword(s, s.objects[b]!, "Hexproof")).toBe(true);
    s.objects[b]!.tapped = true;
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[b]!, "Hexproof")).toBe(false);
  });

  it("Restless Spire: the animated land has first strike during its controller's turn only", () => {
    supported(spire);
    const { s: s0, ap } = setup([]);
    const l = putOnBattlefield(s0, ap, spire);
    const anim = abilitiesOf(s0, s0.objects[l]!).activated.findIndex((x) => x.manaCost === "{U}{R}");
    let s = resolveAll(run(s0, planActivate(s0, ap, l, anim)));
    expect(characteristics(s, s.objects[l]!).types).toContain("Creature");
    expect(objHasKeyword(s, s.objects[l]!, "First strike")).toBe(true);
    s = passUntil(s, "upkeep", next(s, ap));
    // The effect ended with the turn: no longer a creature; animate it again on another player's turn.
    s.objects[l]!.tapped = false;
    s.effects.push({ id: "anim", timestamp: s.nextTimestamp++, controller: ap, sourceName: "test", duration: "endOfTurn", affected: [l], mods: [{ kind: "addAbility", text: "During your turn, this creature has first strike." }] });
    invalidateCharacteristics(s);
    expect(objHasKeyword(s, s.objects[l]!, "First strike")).toBe(false);
  });
});

const locke = card("Locke, Treasure Hunter", "Legendary Creature — Human Rogue", "{1}{B}{R}", { power: "2", toughness: "3", keywords: ["Treasure", "Mill", "Mug"], oracleText: "Locke can't be blocked by creatures with greater power.\nMug — Whenever Locke attacks, each player mills a card. If a land card was milled this way, create a Treasure token. Until end of turn, you may cast a spell from among those cards." });

describe("Locke, Treasure Hunter", () => {
  const attack = (land: boolean) => {
    const { s: s0, ap } = setup([]);
    const l = putOnBattlefield(s0, ap, locke);
    const [b, c, d] = [next(s0, ap), next(s0, ap, 2), next(s0, ap, 3)];
    const tops = {
      [ap]: into(s0, ap, land ? card("Milled Forest", "Basic Land — Forest") : bear({ name: "My Milled Bear" }), "library"),
      [b]: into(s0, b, bear({ name: "B's Bear" }), "library"),
      [c]: into(s0, c, bear({ name: "C's Bear" }), "library"),
      [d]: into(s0, d, card("D's Sorcery", "Sorcery", "{1}", { oracleText: "Draw a card." }), "library"),
    };
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: l, defender: b }] });
    s = resolveAll(s);
    return { s, ap, b, c, d, tops };
  };
  const treasures = (s: GameState) => s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Treasure")).length;

  it("is fully supported; each player mills a card, a Treasure if a land was milled", () => {
    supported(locke);
    const { s, tops } = attack(true);
    for (const id of Object.values(tops)) expect(s.objects[id]!.zone).toBe("graveyard");
    expect(treasures(s)).toBe(1);
    expect(treasures(attack(false).s)).toBe(0);
  });

  it("until end of turn, one spell may be cast from among those cards, from any graveyard; only one", () => {
    const { s: s0, ap, b, c, tops } = attack(true);
    let s = advance(s0, "main2", ap);
    const how = { via: "turnPermission" as const };
    expect(planCast(s, ap, tops[b]!, undefined, undefined, "auto", undefined, how)).not.toBeNull();
    s = resolveAll(run(s, planCast(s, ap, tops[b]!, undefined, undefined, "auto", undefined, how)));
    expect(s.objects[tops[b]!]!.zone).toBe("battlefield");
    expect(s.objects[tops[b]!]!.controller).toBe(ap);
    // The permission is used up: not C's Bear too.
    expect(planCast(s, ap, tops[c]!, undefined, undefined, "auto", undefined, how)).toBeNull();
    // A card not milled this way can't be cast.
    const other = into(s, b, bear({ name: "Other Bear" }), "graveyard");
    expect(planCast(s, ap, other, undefined, undefined, "auto", undefined, how)).toBeNull();
  });

  it("the permission ends with the turn", () => {
    const { s: s0, ap, b, tops } = attack(true);
    const s = advance(s0, "main1", b);
    expect(planCast(s, ap, tops[b]!, undefined, undefined, "auto", undefined, { via: "turnPermission" })).toBeNull();
  });
});

const dance = card("Dance with Calamity", "Sorcery", "{7}{R}", { oracleText: "Shuffle your library. As many times as you choose, you may exile the top card of your library. If the total mana value of the cards exiled this way is 13 or less, you may cast any number of spells from among those cards without paying their mana costs." });
const five = card("Test Five", "Creature — Giant", "{4}{R}", { power: "5", toughness: "5" });

describe("Dance with Calamity", () => {
  const begin = () => {
    const { s: s0, ap, ids } = setup([dance]);
    // A library of mana value 5 cards only: the shuffle can't change what's on top.
    for (const id of s0.players[ap]!.library) s0.objects[id]!.zone = "exile";
    s0.players[ap]!.exile.push(...s0.players[ap]!.library);
    s0.players[ap]!.library = [];
    for (let i = 0; i < 6; i++) into(s0, ap, five, "library");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 8 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, ap };
  };

  it("is fully supported; card by card, then with 13 or less, the spells are cast free as it resolves", () => {
    supported(dance);
    let { s, ap } = begin();
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    expect((s.pending as { prompt: string }).prompt).toMatch(/total mana value so far: 0; 13 or less/);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect((s.pending as { prompt: string }).prompt).toMatch(/so far: 5;/);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    // 10: both may be cast.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong" });
    const opts = (s.pending as { options: string[] }).options.filter((o) => o !== "none");
    expect(opts).toHaveLength(2);
    s = act(s, { type: "chooseOption", player: ap, choice: opts[0]! });
    s = run(s, planCast(s, ap, opts[0]!));
    s = act(s, { type: "chooseOption", player: ap, choice: opts[1]! });
    s = run(s, planCast(s, ap, opts[1]!));
    s = resolveAll(s);
    for (const id of opts) expect(s.objects[id]!.zone).toBe("battlefield");
  });

  it("over 13, none can be cast and they stay exiled", () => {
    let { s, ap } = begin();
    for (let i = 0; i < 3; i++) s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(s.pending).toBeNull();
    s = resolveAll(s);
    expect(s.players[ap]!.exile.filter((id) => s.objects[id]!.cardId === five.oracleId)).toHaveLength(3);
    expect(s.log.some((l) => /more than 13/.test(l.text))).toBe(true);
  });
});

const anomaly = card("Benthic Anomaly", "Creature — Eldrazi Serpent", "{6}{U}", { power: "7", toughness: "8", keywords: ["Devoid"], oracleText: "Devoid (This card has no color.)\nWhen you cast this spell, for each opponent, choose a creature that player controls. Create a token that's a copy of one of those creatures, except its power is equal to the total power of those creatures, its toughness is equal to the total toughness of those creatures, and it's a colorless Eldrazi creature." });
const knight = card("Test Knight", "Legendary Artifact Creature — Human Knight", "{2}{W}", { power: "3", toughness: "1", keywords: ["Vigilance"], oracleText: "Vigilance" });

describe("Benthic Anomaly", () => {
  it("is fully supported; one creature of each opponent's, a copy of one with their total power and toughness, a colorless Eldrazi creature", () => {
    supported(anomaly);
    const { s: s0, ap, ids } = setup([anomaly]);
    const [b, c, d] = [next(s0, ap), next(s0, ap, 2), next(s0, ap, 3)];
    const kn = putOnBattlefield(s0, b, knight);
    putOnBattlefield(s0, b, bear({ name: "B's Bear" }));
    const cb = putOnBattlefield(s0, c, bear({ name: "C's Bear" }));
    // D controls none.
    void d;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 8 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    // B has two creatures: you choose one.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, of: b });
    s = act(s, { type: "pickPermanents", player: ap, ids: [kn] });
    // Then which of the two to copy.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = act(s, { type: "searchLibrary", player: ap, found: [kn] });
    const token = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    const ch = characteristics(s, s.objects[token]!);
    expect(ch.name).toBe("Test Knight");
    // 3/1 + 2/2.
    expect(pt(s, token)).toBe("5/3");
    expect(ch.types).toEqual(["Creature"]);
    expect(ch.subtypes).toEqual(["Eldrazi"]);
    expect(ch.supertypes).toEqual(["Legendary"]);
    expect(ch.colors).toEqual([]);
    expect(objHasKeyword(s, s.objects[token]!, "Vigilance")).toBe(true);
    void cb;
  });

  it("with no opponent controlling a creature, no token", () => {
    const { s: s0, ap, ids } = setup([anomaly]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = resolveAll(s);
    expect(s.battlefield.some((id) => s.objects[id]!.isToken)).toBe(false);
  });
});

const roots = card("Drag to the Roots", "Instant", "{2}{B}{G}", { oracleText: "Delirium — This spell costs {2} less to cast as long as there are four or more card types among cards in your graveyard.\nDestroy target nonland permanent." });

describe("Drag to the Roots", () => {
  it("is fully supported; {2} less with four card types among cards in your graveyard, not three", () => {
    supported(roots);
    const { s, ap, ids } = setup([roots]);
    into(s, ap, bear(), "graveyard");
    into(s, ap, card("Yard Bolt", "Instant", "{R}", { oracleText: "Yard Bolt deals 3 damage to any target." }), "graveyard");
    into(s, ap, card("Yard Rock", "Artifact", "{1}", {}), "graveyard");
    expect(generic(spellCost(s, ap, s.objects[ids[0]!]!))).toBe(2);
    into(s, ap, card("Yard Forest", "Basic Land — Forest"), "graveyard");
    expect(generic(spellCost(s, ap, s.objects[ids[0]!]!))).toBe(0);
    expect(colored(spellCost(s, ap, s.objects[ids[0]!]!))).toBe("BG");
  });

  it("Gwaihir the Windlord: the same \"as long as\" reduction, with two cards drawn this turn", () => {
    const gwaihir = card("Gwaihir the Windlord", "Legendary Creature — Bird Noble", "{4}{W}{U}", { power: "4", toughness: "4", keywords: ["Flying", "Vigilance"], oracleText: "This spell costs {2} less to cast as long as you've drawn two or more cards this turn.\nFlying, vigilance\nOther Birds you control have vigilance." });
    supported(gwaihir);
    const { s, ap, ids } = setup([gwaihir]);
    s.players[ap]!.draws = { turn: s.turn, n: 1 };
    expect(generic(spellCost(s, ap, s.objects[ids[0]!]!))).toBe(4);
    s.players[ap]!.draws = { turn: s.turn, n: 2 };
    expect(generic(spellCost(s, ap, s.objects[ids[0]!]!))).toBe(2);
  });
});

const hamsphere = card("Rolling Hamsphere", "Artifact — Vehicle", "{7}", { power: "4", toughness: "4", keywords: ["Crew"], oracleText: "This Vehicle gets +1/+1 for each Hamster you control.\nWhenever this Vehicle attacks, create three 1/1 red Hamster creature tokens, then it deals X damage to any target, where X is the number of Hamsters you control.\nCrew 3" });

describe("Rolling Hamsphere", () => {
  it("is fully supported; attacking makes three Hamsters, then it deals damage equal to the Hamsters you control", () => {
    supported(hamsphere);
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, ap, hamsphere);
    putOnBattlefield(s0, ap, card("Old Hamster", "Creature — Hamster", "{R}", { power: "1", toughness: "1" }));
    const crew = putOnBattlefield(s0, ap, card("Crew Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3" }));
    let s = passUntil(s0, "beginCombat", ap);
    const ab = abilitiesOf(s, s.objects[v]!).activated.findIndex((a) => a.crew !== undefined);
    s = resolveAll(run(s, planActivate(s, ap, v, ab, undefined, undefined, [crew])));
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: v, defender: opp }] });
    for (let i = 0; i < 8 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const life = s.players[opp]!.life;
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [player(opp)] }));
    // Three new Hamsters and the old one: 4, counted as it resolves (rulings).
    expect(s.players[opp]!.life).toBe(life - 4);
    expect(pt(s, v)).toBe("8/8");
  });
});

const junker = card("Demonic Junker", "Artifact — Vehicle", "{6}{B}", { power: "4", toughness: "3", keywords: ["Affinity", "Crew"], oracleText: "Affinity for artifacts (This spell costs {1} less to cast for each artifact you control.)\nWhen this Vehicle enters, for each player, destroy up to one target creature that player controls. If a creature you controlled was destroyed this way, put two +1/+1 counters on this Vehicle.\nCrew 2" });

describe("Demonic Junker", () => {
  const begin = () => {
    const { s: s0, ap, ids, opp } = setup([junker]);
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 8 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const seat = (pid: PlayerId) => [ap, ...s.turnOrder.slice(s.turnOrder.indexOf(ap) + 1), ...s.turnOrder.slice(0, s.turnOrder.indexOf(ap))].indexOf(pid);
    const targets = (ofMine: boolean): TargetChoice[] => {
      const t: TargetChoice[] = s.turnOrder.map(() => ({ kind: "none" }));
      t[seat(opp)] = obj(theirs);
      if (ofMine) t[seat(ap)] = obj(mine);
      return t;
    };
    return { s, ap, ids, mine, theirs, targets };
  };

  it("is fully supported; one creature of each player's; destroying one of yours puts two +1/+1 counters on it", () => {
    supported(junker);
    const { s: s0, ap, ids, mine, theirs, targets } = begin();
    const s = resolveAll(act(s0, { type: "chooseTargets", player: ap, targets: targets(true) }));
    expect([s.objects[mine]!.zone, s.objects[theirs]!.zone]).toEqual(["graveyard", "graveyard"]);
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(2);
  });

  it("only an opponent's destroyed: no counters", () => {
    const { s: s0, ap, ids, mine, theirs, targets } = begin();
    const s = resolveAll(act(s0, { type: "chooseTargets", player: ap, targets: targets(false) }));
    expect([s.objects[mine]!.zone, s.objects[theirs]!.zone]).toEqual(["battlefield", "graveyard"]);
    expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

const vizier = card("Vizier of the Menagerie", "Creature — Snake Cleric", "{3}{G}", { power: "3", toughness: "4", oracleText: "You may look at the top card of your library any time.\nYou may cast creature spells from the top of your library.\nYou can spend mana of any type to cast creature spells." });

describe("Vizier of the Menagerie", () => {
  it("is fully supported; any type of mana pays for creature spells, not for others", () => {
    supported(vizier);
    const divination = card("Test Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
    const { s, ap, ids } = setup([bear(), divination]);
    const p = s.players[ap]!;
    Object.assign(p.manaPool, { R: 3 });
    expect(castProblem(s, ap, ids[0]!)).toMatch(/not enough mana/);
    putOnBattlefield(s, ap, vizier);
    expect(castProblem(s, ap, ids[0]!)).toBeNull();
    expect(castProblem(s, ap, ids[1]!)).toMatch(/not enough mana/);
    // Paid with red mana.
    const after = act(s, { type: "castSpell", player: ap, objectId: ids[0]! });
    expect(after.players[ap]!.manaPool.R).toBe(1);
  });
});
