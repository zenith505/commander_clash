// Round 154: the most played cards, in popularity order, starting with Ajani, Nacatl Pariah.

import { describe, expect, it, vi } from "vitest";
import { act, bear, card, pt, putOnBattlefield, scry, setup } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type Step, type TargetChoice } from "../src";
import { draw, moveObject } from "../src/game";
import { tokensToCreate } from "../src/counters";

// Dice can be made to come up a chosen way (Luck Bobblehead's seven 6s): `forced.value` replaces each random number.
const forced = vi.hoisted(() => ({ value: undefined as number | undefined }));
vi.mock("../src/rng", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/rng")>();
  return { ...real, nextRandom: (s: GameState) => (forced.value !== undefined ? forced.value : real.nextRandom(s)) };
});

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
/** Passes until a question of this kind (or `max` passes), declaring no attackers or blockers on the way. */
const passTo = (s: GameState, kind: string, max = 40) => {
  for (let i = 0; i < max && s.pending?.kind !== kind; i++) {
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes: true });
    else if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: waitingOn(s)!, attacks: [] });
    else if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: waitingOn(s)!, blocks: [] });
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
const nameOf = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
/** On the battlefield with that name (a token's has " Token" after it). */
const named = (s: GameState, name: string) => s.battlefield.filter((id) => [name, `${name} Token`].includes(nameOf(s, id)));
const P = (s: GameState, pid: PlayerId) => s.players.find((p) => p.id === pid)!;

// Real oracle text (Scryfall).
const ajani = scry("transform", [
  { name: "Ajani, Nacatl Pariah", mana_cost: "{1}{W}", type_line: "Legendary Creature — Cat Warrior", power: "1", toughness: "2", oracle_text: "When Ajani enters, create a 2/1 white Cat Warrior creature token.\nWhenever one or more other Cats you control die, you may exile Ajani, then return him to the battlefield transformed under his owner's control." },
  { name: "Ajani, Nacatl Avenger", type_line: "Legendary Planeswalker — Ajani", loyalty: "3", color_indicator: ["R", "W"], oracle_text: "+2: Put a +1/+1 counter on each Cat you control.\n0: Create a 2/1 white Cat Warrior creature token. When you do, if you control a red permanent other than Ajani, he deals damage equal to the number of creatures you control to any target.\n−4: Each opponent chooses an artifact, a creature, an enchantment, and a planeswalker from among the nonland permanents they control, then sacrifices the rest." },
], { keywords: ["Transform"], color_identity: ["R", "W"] });
const ob = card("Ob Nixilis, Captive Kingpin", "Legendary Creature — Demon", "{2}{B}{R}", { cmc: 4, power: "4", toughness: "3", keywords: ["Flying", "Trample"], oracleText: "Flying, trample\nWhenever one or more opponents each lose exactly 1 life, put a +1/+1 counter on Ob Nixilis. Exile the top card of your library. Until your next end step, you may play that card." });
const season = card("Doubling Season", "Enchantment", "{4}{G}", { cmc: 5, oracleText: "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\nIf an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead." });
const visitation = card("Divine Visitation", "Enchantment", "{3}{W}{W}", { cmc: 5, oracleText: "If one or more creature tokens would be created under your control, that many 4/4 white Angel creature tokens with flying are created instead." });

const liliana = scry("transform", [
  { name: "Liliana, Heretical Healer", mana_cost: "{1}{B}{B}", type_line: "Legendary Creature — Human Cleric", power: "2", toughness: "3", oracle_text: "Lifelink\nWhenever another nontoken creature you control dies, exile Liliana, Heretical Healer, then return her to the battlefield transformed under her owner's control. If you do, create a 2/2 black Zombie creature token." },
  { name: "Liliana, Defiant Necromancer", type_line: "Legendary Planeswalker — Liliana", loyalty: "3", color_indicator: ["B"], oracle_text: "+2: Each player discards a card.\n−X: Return target nonlegendary creature card with mana value X from your graveyard to the battlefield.\n−8: You get an emblem with \"Whenever a creature dies, return it to the battlefield under your control at the beginning of the next end step.\"" },
], { keywords: ["Lifelink", "Transform"] });
const kaya = card("Kaya, Geist Hunter", "Legendary Planeswalker — Kaya", "{1}{W}{B}", { cmc: 3, loyalty: "3", oracleText: "+1: Creatures you control gain deathtouch until end of turn. Put a +1/+1 counter on up to one target creature token you control.\n−2: Until end of turn, if one or more tokens would be created under your control, twice that many of those tokens are created instead.\n−6: Exile all cards from all graveyards, then create a 1/1 white Spirit creature token with flying for each card exiled this way." });
const coiling = card("Coiling Rebirth", "Sorcery", "{3}{B}{B}", { cmc: 5, keywords: ["Gift"], oracleText: "Gift a card (You may promise an opponent a gift as you cast this spell. If you do, they draw a card before its other effects.)\nReturn target creature card from your graveyard to the battlefield. Then if the gift was promised and that creature isn't legendary, create a token that's a copy of that creature, except it's 1/1." });
const fury = card("Descendants' Fury", "Enchantment", "{3}{R}", { cmc: 4, oracleText: "Whenever one or more creatures you control deal combat damage to a player, you may sacrifice one of them. If you do, reveal cards from the top of your library until you reveal a creature card that shares a creature type with the sacrificed creature. Put that card onto the battlefield and the rest on the bottom of your library in a random order." });
const yorion = card("Yorion, Sky Nomad", "Legendary Creature — Bird Serpent", "{3}{W/U}{W/U}", { cmc: 5, power: "4", toughness: "5", keywords: ["Flying", "Companion"], oracleText: "Companion — Your starting deck contains at least twenty cards more than the minimum deck size. (If this card is your chosen companion, you may put it into your hand from outside the game for {3} as a sorcery.)\nFlying\nWhen Yorion enters, exile any number of other nonland permanents you own and control. Return those cards to the battlefield at the beginning of the next end step." });
const spiritDragons = card("Call the Spirit Dragons", "Enchantment", "{W}{U}{B}{R}{G}", { cmc: 5, oracleText: "Dragons you control have indestructible.\nAt the beginning of your upkeep, for each color, put a +1/+1 counter on a Dragon you control of that color. If you put +1/+1 counters on five Dragons this way, you win the game." });
const pyre = card("Pyre of Heroes", "Artifact", "{2}", { cmc: 2, oracleText: "{2}, {T}, Sacrifice a creature: Search your library for a creature card that shares a creature type with the sacrificed creature and has mana value equal to 1 plus that creature's mana value. Put that card onto the battlefield, then shuffle. Activate only as a sorcery." });
const sanguinist = scry("prepare", [
  { name: "Stensian Sanguinist", mana_cost: "{1}{B}", type_line: "Creature — Vampire Cleric", power: "2", toughness: "2", oracle_text: "Whenever you attack, target creature gains deathtouch until end of turn. Whenever that creature deals combat damage to a player this combat, this creature becomes prepared. (While it's prepared, you may cast a copy of its spell. Doing so unprepares it.)" },
  { name: "Exsanguinate", mana_cost: "{X}{B}{B}", type_line: "Sorcery", oracle_text: "Each opponent loses X life. You gain life equal to the life lost this way." },
], { keywords: ["Prepared"] });
const lantern = card("Lantern of the Lost", "Artifact", "{1}", { cmc: 1, oracleText: "When this artifact enters, exile target card from a graveyard.\n{1}, {T}, Exile this artifact: Exile all cards from all graveyards, then draw a card." });

const goblin = card("Test Goblin", "Creature — Goblin", "{1}{R}", { cmc: 2, power: "2", toughness: "2" });
const elf = card("Test Elf", "Creature — Elf", "{G}", { cmc: 1, power: "1", toughness: "1" });
const shock = card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "Test Shock deals 2 damage to any target." });
const goblinWarrior = card("Test Goblin Warrior", "Creature — Goblin Warrior", "{R}", { cmc: 1, power: "1", toughness: "1" });
const goblinShaman = card("Test Goblin Shaman", "Creature — Goblin Shaman", "{1}{R}", { cmc: 2, power: "2", toughness: "2" });
const goblinChief = card("Test Goblin Chief", "Creature — Goblin", "{2}{R}", { cmc: 3, power: "3", toughness: "3" });
const elfWarrior = card("Test Elf Warrior", "Creature — Elf Warrior", "{1}{G}", { cmc: 2, power: "2", toughness: "2" });
const legend = card("Test Legend", "Legendary Creature — Human", "{2}{B}", { cmc: 3, power: "3", toughness: "3" });
const rock = card("Test Rock", "Artifact", "{2}", { cmc: 2, oracleText: "{T}: Add {C}." });
const dragon = (word: string, c: string) => card(`Test ${word} Dragon`, "Creature — Dragon", `{${c}}`, { cmc: 1, power: "1", toughness: "1" });
const ping = card("Test Ping", "Sorcery", "{B}", { cmc: 1, oracleText: "Each opponent loses 1 life." });

describe("round 154 cards", () => {
  it("are fully supported", () => supported(ajani, ob, season, visitation, liliana, kaya, coiling, fury, yorion, spiritDragons, pyre, sanguinist, lantern));
});

describe("Ajani, Nacatl Avenger", () => {
  const avenger = (s: GameState, pid: PlayerId) => {
    const id = putOnBattlefield(s, pid, ajani);
    s.objects[id]!.face = 1;
    s.objects[id]!.counters = { loyalty: 3 };
    invalidateCharacteristics(s);
    return id;
  };
  it("0: with another red permanent, the reflexive trigger deals damage equal to the number of creatures you control", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = avenger(s0, ap);
    putOnBattlefield(s0, ap, goblin);
    const life = P(s0, opp).life;
    let s = run(s0, planActivate(s0, ap, a, 1));
    s = passTo(s, "chooseTargets");
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [player(opp)] }));
    // The goblin and the new Cat Warrior.
    expect(named(s, "Cat Warrior")).toHaveLength(1);
    expect(P(s, opp).life).toBe(life - 2);
  });

  it("0: without another red permanent, only the token (Ajani himself doesn't count)", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = avenger(s0, ap);
    const life = P(s0, opp).life;
    const s = resolveAll(run(s0, planActivate(s0, ap, a, 1)));
    expect(s.pending?.kind).not.toBe("chooseTargets");
    expect(named(s, "Cat Warrior")).toHaveLength(1);
    expect(P(s, opp).life).toBe(life);
  });

  it("0: with Doubling Season, the reflexive ability triggers once for each Cat Warrior (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = avenger(s0, ap);
    putOnBattlefield(s0, ap, goblin);
    putOnBattlefield(s0, ap, season);
    const life = P(s0, opp).life;
    let s = run(s0, planActivate(s0, ap, a, 1));
    for (let k = 0; k < 2; k++) {
      s = passTo(s, "chooseTargets");
      expect(s.pending?.kind).toBe("chooseTargets");
      s = act(s, { type: "chooseTargets", player: ap, targets: [player(opp)] });
    }
    s = resolveAll(s);
    expect(s.pending?.kind).not.toBe("chooseTargets");
    expect(named(s, "Cat Warrior")).toHaveLength(2);
    // Goblin and two Cats: 3 each time.
    expect(P(s, opp).life).toBe(life - 6);
  });

  it("0: with Divine Visitation the tokens are Angels instead, so it doesn't trigger (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = avenger(s0, ap);
    putOnBattlefield(s0, ap, goblin);
    putOnBattlefield(s0, ap, visitation);
    const life = P(s0, opp).life;
    const s = resolveAll(run(s0, planActivate(s0, ap, a, 1)));
    expect(s.pending?.kind).not.toBe("chooseTargets");
    expect(named(s, "Angel")).toHaveLength(1);
    expect(P(s, opp).life).toBe(life);
  });

  it("0: the red permanent gone by the time the reflexive ability resolves: it does nothing (CR 603.4)", () => {
    const { s: s0, ap, opp } = setup([shock]);
    const a = avenger(s0, ap);
    const g = putOnBattlefield(s0, ap, goblin);
    const life = P(s0, opp).life;
    let s = run(s0, planActivate(s0, ap, a, 1));
    s = passTo(s, "chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [player(opp)] });
    // In response, the goblin is shocked.
    const sh = P(s, ap).hand.find((id) => nameOf(s, id) === "Test Shock")!;
    s = run(s, planCast(s, ap, sh, [obj(g)]));
    s = resolveAll(s);
    expect(s.objects[g]!.zone).toBe("graveyard");
    expect(P(s, opp).life).toBe(life);
  });
});

describe("Ob Nixilis, Captive Kingpin", () => {
  it("each opponent loses 1 life at once: one trigger, a counter, and the top card exiled to play", () => {
    const { s: s0, ap, ids } = setup([ping]);
    const o = putOnBattlefield(s0, ap, ob);
    const top = P(s0, ap).library[0]!;
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[o]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[top]!.zone).toBe("exile");
    expect(s.objects[top]!.mayPlay).toBeTruthy();
  });

  it("an opponent dealt 2 damage doesn't trigger it", () => {
    const { s: s0, ap, opp, ids } = setup([shock]);
    const o = putOnBattlefield(s0, ap, ob);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [player(opp)])));
    expect(s.objects[o]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("combat damage: two 1/1s hitting one opponent is 2 life lost, so it doesn't trigger (rulings); one 1/1 does", () => {
    const { s: s0, ap, opp } = setup([]);
    const o = putOnBattlefield(s0, ap, ob);
    const e1 = putOnBattlefield(s0, ap, elf);
    const e2 = putOnBattlefield(s0, ap, elf);
    let s = passTo(s0, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: e1, defender: opp }, { attacker: e2, defender: opp }] });
    s = advance(s, "end", ap);
    expect(s.objects[o]!.counters["+1/+1"] ?? 0).toBe(0);
    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    const o2 = putOnBattlefield(t0, ap2, ob);
    const e3 = putOnBattlefield(t0, ap2, elf);
    let t = passTo(t0, "declareAttackers");
    t = act(t, { type: "declareAttackers", player: ap2, attacks: [{ attacker: e3, defender: opp2 }] });
    t = advance(t, "end", ap2);
    expect(t.objects[o2]!.counters["+1/+1"]).toBe(1);
  });
});

describe("Liliana, Heretical Healer", () => {
  it("another nontoken creature dies: she returns transformed and you create a Zombie", () => {
    const { s: s0, ap, ids } = setup([shock]);
    const l = putOnBattlefield(s0, ap, liliana);
    const b = putOnBattlefield(s0, ap, bear());
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(b)])));
    expect(s.objects[b]!.zone).toBe("graveyard");
    const back = s.battlefield.find((id) => nameOf(s, id) === "Liliana, Defiant Necromancer");
    expect(back).toBeDefined();
    expect(s.objects[back!]!.counters.loyalty).toBe(3);
    // The same card, a new object (CR 400.7).
    expect(back).toBe(l);
    expect(s.objects[l]!.face).toBe(1);
    expect(named(s, "Zombie")).toHaveLength(1);
  });

  it("two creatures dying at once: only the first ability to resolve makes a Zombie (rulings)", () => {
    const wipe = card("Test Wipe", "Sorcery", "{B}", { cmc: 1, oracleText: "Destroy target creature. Destroy target creature." });
    const { s: s0, ap, ids } = setup([wipe]);
    putOnBattlefield(s0, ap, liliana);
    const b1 = putOnBattlefield(s0, ap, bear());
    const b2 = putOnBattlefield(s0, ap, elf);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(b1), obj(b2)])));
    expect(s.objects[b1]!.zone).toBe("graveyard");
    expect(s.objects[b2]!.zone).toBe("graveyard");
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Liliana, Defiant Necromancer")).toHaveLength(1);
    expect(named(s, "Zombie")).toHaveLength(1);
  });

  it("a token dying doesn't trigger it", () => {
    const { s: s0, ap } = setup([]);
    const l = putOnBattlefield(s0, ap, liliana);
    const t = putOnBattlefield(s0, ap, bear());
    s0.objects[t]!.isToken = true;
    moveObject(s0, t, "graveyard");
    const s = resolveAll(s0);
    expect(s.objects[l]!.zone).toBe("battlefield");
    expect(named(s, "Zombie")).toHaveLength(0);
  });
});

describe("Kaya, Geist Hunter", () => {
  it("−2: tokens you create are doubled until end of turn, then not; opponents' aren't", () => {
    const maker = card("Test Maker", "Artifact", "{1}", { cmc: 1, oracleText: "{1}: Create a 1/1 white Soldier creature token." });
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kaya);
    s0.objects[k]!.counters = { loyalty: 3 };
    const m = putOnBattlefield(s0, ap, maker);
    let s = resolveAll(run(s0, planActivate(s0, ap, k, 1)));
    s = resolveAll(run(s, planActivate(s, ap, m, 0)));
    expect(named(s, "Soldier")).toHaveLength(2);
    const soldier = { name: "Soldier", power: 1, toughness: 1, colors: ["W" as const], types: ["Creature"], subtypes: ["Soldier"], keywords: [] };
    expect(tokensToCreate(s, opp, soldier, 1)).toBe(1);
    // Kaya leaving doesn't end it (it's the resolved ability's effect, CR 611.2a).
    moveObject(s, k, "graveyard");
    expect(tokensToCreate(s, ap, soldier, 1)).toBe(2);
    s = advance(s, "upkeep", opp);
    expect(tokensToCreate(s, ap, soldier, 1)).toBe(1);
  });

  it("−6: exile all cards from all graveyards, then a 1/1 flying Spirit for each card exiled", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kaya);
    s0.objects[k]!.counters = { loyalty: 6 };
    into(s0, ap, bear(), "graveyard");
    into(s0, opp, bear(), "graveyard");
    into(s0, opp, elf, "graveyard");
    const before = s0.players.reduce((n, p) => n + p.graveyard.length, 0);
    const s = resolveAll(run(s0, planActivate(s0, ap, k, 2)));
    // With no loyalty left after paying the cost, Kaya was put into the graveyard before the ability resolved (CR 704.5i),
    // so she's exiled too.
    expect(s.players.reduce((n, p) => n + p.graveyard.length, 0)).toBe(0);
    expect(named(s, "Spirit")).toHaveLength(before + 1);
    expect(objHasKeyword(s, s.objects[named(s, "Spirit")[0]!]!, "Flying")).toBe(true);
  });
});

describe("Lantern of the Lost", () => {
  it("exile all cards from all graveyards, then draw a card", () => {
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, lantern);
    into(s0, opp, bear(), "graveyard");
    const hand = P(s0, ap).hand.length;
    const s = resolveAll(run(s0, planActivate(s0, ap, l, 0)));
    expect(P(s, opp).graveyard).toHaveLength(0);
    expect(P(s, ap).hand.length).toBe(hand + 1);
  });
});

describe("Coiling Rebirth", () => {
  it("with the gift promised: the opponent draws, the creature returns and a 1/1 token copy of it is created", () => {
    const { s: s0, ap, opp, ids } = setup([coiling]);
    const g = into(s0, ap, goblinChief, "graveyard");
    const hand = P(s0, opp).hand.length;
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(g)], undefined, "auto", undefined, { gift: opp })));
    expect(P(s, opp).hand.length).toBe(hand + 1);
    const chiefs = s.battlefield.filter((id) => nameOf(s, id) === "Test Goblin Chief");
    expect(chiefs).toHaveLength(2);
    const token = chiefs.find((id) => s.objects[id]!.isToken)!;
    expect(pt(s, token)).toBe("1/1");
  });

  it("without the gift, or with a legendary creature: no token", () => {
    const { s: s0, ap, ids } = setup([coiling]);
    const g = into(s0, ap, goblinChief, "graveyard");
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(g)])));
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Test Goblin Chief")).toHaveLength(1);
    const { s: t0, ap: ap2, opp: opp2, ids: ids2 } = setup([coiling]);
    const lg = into(t0, ap2, legend, "graveyard");
    s = resolveAll(run(t0, planCast(t0, ap2, ids2[0]!, [obj(lg)], undefined, "auto", undefined, { gift: opp2 })));
    expect(s.battlefield.filter((id) => nameOf(s, id) === "Test Legend")).toHaveLength(1);
  });
});

describe("Descendants' Fury", () => {
  const attackWith = (s: GameState, ap: PlayerId, opp: PlayerId, ids: string[]) => {
    s = passTo(s, "declareAttackers");
    return act(s, { type: "declareAttackers", player: ap, attacks: ids.map((attacker) => ({ attacker, defender: opp })) });
  };
  it("sacrifice one of them: reveal until a creature card sharing a creature type, onto the battlefield; the rest on the bottom", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, fury);
    const gw = putOnBattlefield(s0, ap, goblinWarrior);
    // Top of library: a bear, a rock, then an Elf Warrior (shares Warrior).
    const ew = into(s0, ap, elfWarrior, "library");
    const r = into(s0, ap, rock, "library");
    const b = into(s0, ap, bear(), "library");
    let s = attackWith(s0, ap, opp, [gw]);
    s = passTo(s, "chooseMay");
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = resolveAll(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[gw]!.zone).toBe("graveyard");
    expect(s.objects[ew]!.zone).toBe("battlefield");
    const lib = P(s, ap).library;
    expect(lib.slice(-2).sort()).toEqual([b, r].sort());
  });

  it("with two creatures dealing damage, you choose which to sacrifice; declining does nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, fury);
    const gw = putOnBattlefield(s0, ap, goblinWarrior);
    const gs = putOnBattlefield(s0, ap, goblinShaman);
    const top = into(s0, ap, goblinChief, "library");
    let s = attackWith(s0, ap, opp, [gw, gs]);
    s = passTo(s, "chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap });
    expect((s.pending as { options: string[] }).options.sort()).toEqual([gw, gs].sort());
    s = resolveAll(act(s, { type: "pickPermanents", player: ap, ids: [gs] }));
    expect(s.objects[gs]!.zone).toBe("graveyard");
    expect(s.objects[gw]!.zone).toBe("battlefield");
    expect(s.objects[top]!.zone).toBe("battlefield");

    const { s: t0, ap: a2, opp: o2 } = setup([]);
    putOnBattlefield(t0, a2, fury);
    const g2 = putOnBattlefield(t0, a2, goblinWarrior);
    let t = attackWith(t0, a2, o2, [g2]);
    t = passTo(t, "chooseMay");
    t = resolveAll(act(t, { type: "chooseMay", player: a2, yes: false }));
    expect(t.objects[g2]!.zone).toBe("battlefield");
  });
});

describe("Yorion, Sky Nomad", () => {
  it("exiles the chosen permanents you own and control, and returns them at the beginning of the next end step", () => {
    const { s: s0, ap, opp, ids } = setup([yorion]);
    const b = putOnBattlefield(s0, ap, bear());
    const r = putOnBattlefield(s0, ap, rock);
    const theirs = putOnBattlefield(s0, opp, bear());
    const tok = putOnBattlefield(s0, ap, elf);
    s0.objects[tok]!.isToken = true;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = passTo(s, "pickPermanents");
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, anyNumber: true });
    const options = (s.pending as { options: string[] }).options;
    expect(options).toContain(b);
    expect(options).toContain(tok);
    expect(options).not.toContain(theirs);
    expect(options).not.toContain(ids[0]);
    s = resolveAll(act(s, { type: "pickPermanents", player: ap, ids: [b, r, tok] }));
    expect(s.objects[b]!.zone).toBe("exile");
    expect(s.objects[r]!.zone).toBe("exile");
    // The token is gone for good (rulings).
    expect(s.objects[tok]?.zone ?? "gone").not.toBe("battlefield");
    s = advance(s, "end", ap);
    s = resolveAll(s);
    expect(s.objects[b]!.zone).toBe("battlefield");
    expect(s.objects[r]!.zone).toBe("battlefield");
    expect(named(s, "Test Elf")).toHaveLength(0);
  });
});

describe("Call the Spirit Dragons", () => {
  const colors = [["White", "W"], ["Blue", "U"], ["Black", "B"], ["Red", "R"], ["Green", "G"]] as const;
  it("a counter on a Dragon of each color; five Dragons: you win the game", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, spiritDragons);
    const ds = colors.map(([w, c]) => putOnBattlefield(s0, ap, dragon(w, c)));
    // Next upkeep of ap: the trigger.
    let t = advance(s0, "end", ap);
    t = advance(t, "upkeep", ap);
    t = resolveAll(t);
    expect(ds.every((d) => t.objects[d]!.counters["+1/+1"] === 1)).toBe(true);
    expect(t.winner).toBe(ap);
  });

  it("four Dragons, one of them two colors: counters, but no win (rulings)", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, spiritDragons);
    const ds = colors.slice(0, 3).map(([w, c]) => putOnBattlefield(s0, ap, dragon(w, c)));
    const gold = putOnBattlefield(s0, ap, card("Test Gold Dragon", "Creature — Dragon", "{R}{G}", { cmc: 2, power: "2", toughness: "2" }));
    let t = advance(s0, "end", ap);
    t = advance(t, "upkeep", ap);
    t = resolveAll(t);
    expect(ds.every((d) => t.objects[d]!.counters["+1/+1"] === 1)).toBe(true);
    expect(t.objects[gold]!.counters["+1/+1"]).toBe(2);
    expect(t.winner).toBeNull();
  });
});

describe("Pyre of Heroes", () => {
  it("a creature card sharing a creature type with mana value 1 more onto the battlefield", () => {
    const { s: s0, ap } = setup([]);
    const p = putOnBattlefield(s0, ap, pyre);
    const g = putOnBattlefield(s0, ap, goblinShaman);
    const chief = into(s0, ap, goblinChief, "library");
    const ogre = into(s0, ap, card("Test Ogre", "Creature — Ogre", "{2}{R}", { cmc: 3, power: "3", toughness: "3" }), "library");
    const warrior = into(s0, ap, goblinWarrior, "library");
    let s = passTo(run(s0, planActivate(s0, ap, p, 0, undefined, undefined, undefined, undefined, { sacrifice: [g] })), "searchLibrary");
    expect(s.objects[g]!.zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const cards = (s.pending as { cards: string[] }).cards;
    expect(cards).toContain(chief);
    expect(cards).not.toContain(ogre);
    expect(cards).not.toContain(warrior);
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [chief] }));
    expect(s.objects[chief]!.zone).toBe("battlefield");
  });
});

describe("Stensian Sanguinist", () => {
  it("the target deals combat damage to a player this combat: the Sanguinist becomes prepared", () => {
    const { s: s0, ap, opp } = setup([]);
    const sg = putOnBattlefield(s0, ap, sanguinist);
    const e = putOnBattlefield(s0, ap, elf);
    let s = passTo(s0, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: e, defender: opp }] });
    s = passTo(s, "chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [obj(e)] });
    s = advance(s, "end", ap);
    expect(s.objects[sg]!.prepared).toBeTruthy();
  });

  it("a creature that isn't attacking: nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    const sg = putOnBattlefield(s0, ap, sanguinist);
    const e = putOnBattlefield(s0, ap, elf);
    let s = passTo(s0, "declareAttackers");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: e, defender: opp }] });
    s = passTo(s, "chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [obj(sg)] });
    s = advance(s, "end", ap);
    expect(s.objects[sg]!.prepared).toBeFalsy();
  });
});
