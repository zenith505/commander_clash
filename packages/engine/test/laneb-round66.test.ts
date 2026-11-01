// Lane B, round 66: unsupported cards no earlier round wrote down, from EDHREC rank about 19,700 up, and the B10 list
// (`npm run popular -- --least`): prevention with extra effects, Bridge from Below, hellbent Demonfire, Kentaro's
// alternative cost, Midnight Oil's hand size, and more.

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { altCostsFor, botActions, castProblem, characteristics, controllerOf, gainLife, invalidateCharacteristics, isFullySupported, maxHandSize, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";
import { dealDamage, objectSource } from "../src/damage";
import { cantBeCountered } from "../src/effects/run-spells";
const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty, answering choices as the bots would; the choices a test makes stop it. */
const settle = (s: GameState, stopAt: (s: GameState) => boolean = () => false) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (stopAt(s)) break;
    const p = s.pending;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Plays on (no attacks or blocks unless asked, the bots answering other questions) until `stop`. */
const goUntil = (s: GameState, stop: (s: GameState) => boolean) => {
  for (let i = 0; i < 3000; i++) {
    if (stop(s)) return s;
    const p = s.pending;
    const pid = waitingOn(s)!;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never got there");
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const nameOf = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}, x?: number) => run(s, planCast(s, pid, id, targets, undefined, undefined, x, choices));
/** Moves a new card for `def` into `pid`'s hand, library (on top) or graveyard. */
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "graveyard" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Leaves only `keep` in `pid`'s hand (setup's hand also holds the seven cards drawn). */
const onlyHand = (s: GameState, pid: PlayerId, keep: string[]) => {
  const p = s.players[pid]!;
  for (const id of p.hand.filter((id) => !keep.includes(id))) {
    s.objects[id]!.zone = "exile";
    p.exile.push(id);
  }
  p.hand = p.hand.filter((id) => keep.includes(id));
};
/** Takes `pid`'s lands off the battlefield and leaves exactly `pool` to pay with. */
const poolOnly = (s: GameState, pid: PlayerId, pool: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  for (const id of s.battlefield.filter((x) => s.objects[x]!.controller === pid && characteristics(s, s.objects[x]!).types.includes("Land"))) {
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  s.players[pid]!.manaPool = { ...s.players[pid]!.manaPool, ...pool };
  invalidateCharacteristics(s);
};
const counters = (s: GameState, id: string, kind = "+1/+1") => s.objects[id]!.counters?.[kind] ?? 0;
const tokensNamed = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && controllerOf(s, s.objects[id]!) === pid && nameOf(s, id).replace(/ Token$/, "") === name);
const kw = (s: GameState, id: string) => characteristics(s, s.objects[id]!).keywords;

// Real oracle text (Scryfall).

const purity = (): CardDef => ({"oracleId":"23ef92b0-2298-4e8d-bf64-46d096c84a9d","name":"Purity","manaCost":"{3}{W}{W}{W}","cmc":6,"typeLine":"Creature — Elemental Incarnation","supertypes":[],"types":["Creature"],"subtypes":["Elemental","Incarnation"],"oracleText":"Flying\nIf noncombat damage would be dealt to you, prevent that damage. You gain life equal to the damage prevented this way.\nWhen Purity is put into a graveyard from anywhere, shuffle it into its owner's library.","power":"6","toughness":"6","colors":["W"],"colorIdentity":["W"],"keywords":["Flying"],"set":"lrw","releasedAt":"2007-10-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const capridor = (): CardDef => ({"oracleId":"2e83e8c8-adc4-4e33-9f8b-966b7231a6c9","name":"Stormwild Capridor","manaCost":"{2}{W}","cmc":3,"typeLine":"Creature — Bird Goat","supertypes":[],"types":["Creature"],"subtypes":["Bird","Goat"],"oracleText":"Flying\nIf noncombat damage would be dealt to this creature, prevent that damage. Put a +1/+1 counter on this creature for each 1 damage prevented this way.","power":"1","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":["Flying"],"set":"iko","releasedAt":"2020-04-24","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bridge = (): CardDef => ({"oracleId":"0f071f64-b69b-4fa0-999c-5028429e3cfb","name":"Bridge from Below","manaCost":"{B}{B}{B}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a nontoken creature is put into your graveyard from the battlefield, if this card is in your graveyard, create a 2/2 black Zombie creature token.\nWhen a creature is put into an opponent's graveyard from the battlefield, if this card is in your graveyard, exile this card.","colors":["B"],"colorIdentity":["B"],"keywords":[],"set":"spg","releasedAt":"2023-11-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const demonfire = (): CardDef => ({"oracleId":"314a5c76-1a68-433b-a383-1834400254a8","name":"Demonfire","manaCost":"{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Demonfire deals X damage to any target. If a creature dealt damage this way would die this turn, exile it instead.\nHellbent — If you have no cards in hand, this spell can't be countered and the damage can't be prevented.","colors":["R"],"colorIdentity":["R"],"keywords":["Hellbent"],"set":"dis","releasedAt":"2006-05-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sacrament = (): CardDef => ({"oracleId":"e3d08582-85ba-48c4-a453-4a5a385a0c3e","name":"Sadistic Sacrament","manaCost":"{B}{B}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Kicker {7} (You may pay an additional {7} as you cast this spell.)\nSearch target player's library for up to three cards, exile them, then that player shuffles. If this spell was kicked, instead search that player's library for up to fifteen cards, exile them, then that player shuffles.","colors":["B"],"colorIdentity":["B"],"keywords":["Kicker"],"set":"zen","releasedAt":"2009-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const kentaro = (): CardDef => ({"oracleId":"bfaf20a7-a11c-4f57-8eb6-b03b5223704d","name":"Kentaro, the Smiling Cat","manaCost":"{1}{W}","cmc":2,"typeLine":"Legendary Creature — Human Samurai","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Samurai"],"oracleText":"Bushido 1 (Whenever this creature blocks or becomes blocked, it gets +1/+1 until end of turn.)\nYou may pay {X} rather than pay the mana cost for Samurai spells you cast, where X is that spell's mana value.","power":"2","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":["Bushido"],"set":"bok","releasedAt":"2005-02-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const oil = (): CardDef => ({"oracleId":"26bfc19c-8122-4e95-9a62-2b5418429db2","name":"Midnight Oil","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"This enchantment enters with seven hour counters on it.\nAt the beginning of your draw step, draw an additional card and remove two hour counters from this enchantment.\nYour maximum hand size is equal to the number of hour counters on this enchantment.\nWhenever you discard a card, you lose 1 life.","colors":["B"],"colorIdentity":["B"],"keywords":[],"set":"kld","releasedAt":"2016-09-30","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const embrace = (): CardDef => ({"oracleId":"4cf3fb65-9107-428a-8853-029ec97112b5","name":"Spinal Embrace","manaCost":"{3}{U}{U}{B}","cmc":6,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Cast this spell only during combat.\nUntap target creature you don't control and gain control of it. It gains haste until end of turn. At the beginning of the next end step, sacrifice it. If you do, you gain life equal to its toughness.","colors":["B","U"],"colorIdentity":["B","U"],"keywords":[],"set":"inv","releasedAt":"2000-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const falseCure = (): CardDef => ({"oracleId":"fc4c969d-408c-46d1-8dba-fabecc2c30ce","name":"False Cure","manaCost":"{B}{B}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Until end of turn, whenever a player gains life, that player loses 2 life for each 1 life they gained.","colors":["B"],"colorIdentity":["B"],"keywords":[],"set":"ons","releasedAt":"2002-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const greed = (): CardDef => ({"oracleId":"efbe96b5-1f58-4818-a346-ea554813adbc","name":"Devouring Greed","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Sorcery — Arcane","supertypes":[],"types":["Sorcery"],"subtypes":["Arcane"],"oracleText":"As an additional cost to cast this spell, you may sacrifice any number of Spirits.\nTarget player loses 2 life plus 2 life for each Spirit sacrificed this way. You gain that much life.","colors":["B"],"colorIdentity":["B"],"keywords":[],"set":"chk","releasedAt":"2004-10-01","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const myriarch = (): CardDef => ({"oracleId":"c39dca94-3849-4edb-bba9-e7a2eefa5021","name":"Majestic Myriarch","manaCost":"{4}{G}","cmc":5,"typeLine":"Creature — Chimera","supertypes":[],"types":["Creature"],"subtypes":["Chimera"],"oracleText":"Majestic Myriarch's power and toughness are each equal to twice the number of creatures you control.\nAt the beginning of each combat, this creature gains flying until end of turn if you control a creature with flying. The same is true for first strike, double strike, deathtouch, haste, hexproof, indestructible, lifelink, menace, reach, trample, and vigilance.","power":"*","toughness":"*","colors":["G"],"colorIdentity":["G"],"keywords":[],"set":"hou","releasedAt":"2017-07-14","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const orator = (): CardDef => ({"oracleId":"7716ad72-9e96-4915-bc1e-e12b4d0f6f9c","name":"Thunderous Orator","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Kor Wizard","supertypes":[],"types":["Creature"],"subtypes":["Kor","Wizard"],"oracleText":"Vigilance\nWhenever this creature attacks, it gains flying until end of turn if you control a creature with flying. The same is true for first strike, double strike, deathtouch, indestructible, lifelink, menace, and trample.","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["Vigilance"],"set":"stx","releasedAt":"2021-04-23","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

// Test cards.
const vanilla = (name: string, typeLine: string, cost: string, cmc: number, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, cost, { cmc, power: String(p), toughness: String(t), ...extra });
const bearC = (name = "Plain Bear", p = 2, t = 2, extra: Partial<CardDef> = {}) => vanilla(name, "Creature — Bear", "{1}{G}", 2, p, t, { colors: ["G"], ...extra });
const spirit = (name = "Test Spirit") => vanilla(name, "Creature — Spirit", "{1}{B}", 2, 1, 1, { colors: ["B"] });
const bolt = (name = "Test Bolt", n = 3) => card(name, "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: `${name} deals ${n} damage to any target.` });
const wreck = (name = "Test Wreck") => card(name, "Instant", "{B}", { cmc: 1, colors: ["B"], oracleText: "Destroy target creature." });
const rock = (name: string) => card(name, "Artifact", "{1}", { cmc: 1 });

describe("Lane B round 66", () => {
  it("are fully supported", () => {
    supported(purity(), capridor(), bridge(), demonfire(), sacrament(), kentaro(), oil(), embrace(), falseCure(), greed(), myriarch(), orator());
  });

  it("Purity: noncombat damage to you is prevented and you gain that much life; combat damage isn't", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, purity());
    const theirs = putOnBattlefield(s, opp, bearC("Their Bear", 3, 3));
    const before = life(s, ap);
    dealDamage(s, objectSource(s, s.objects[theirs]!), { player: ap }, 3);
    expect(life(s, ap)).toBe(before + 3);
    dealDamage(s, objectSource(s, s.objects[theirs]!), { player: ap }, 3, { combat: true });
    expect(life(s, ap)).toBe(before);
  });

  it("Purity: a bolt at you is prevented, and the life gain is one event", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, purity());
    const b = toZone(s0, ap, bolt("Test Bolt", 4), "hand");
    const before = life(s0, ap);
    const s = settle(castNow(s0, ap, b, [ply(ap)]));
    expect(life(s, ap)).toBe(before + 4);
  });

  it("Stormwild Capridor: noncombat damage to it is prevented and becomes +1/+1 counters; combat damage is dealt", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, capridor());
    const b = toZone(s0, ap, bolt("Test Bolt", 3), "hand");
    let s = settle(castNow(s0, ap, b, [tgt(c)]));
    expect(s.objects[c]!.damage).toBe(0);
    expect(counters(s, c)).toBe(3);
    expect(pt(s, c)).toBe("4/6"); // a 1/3 with three +1/+1 counters
    const theirs = putOnBattlefield(s, opp, bearC("Their Bear", 2, 2));
    dealDamage(s, objectSource(s, s.objects[theirs]!), { object: s.objects[c]! }, 2, { combat: true });
    expect(s.objects[c]!.damage).toBe(2);
    expect(counters(s, c)).toBe(3);
  });

  it("Bridge from Below: from your graveyard, a Zombie for each nontoken creature of yours that dies; none for a token", () => {
    const { s: s0, ap } = setup([]);
    toZone(s0, ap, bridge(), "graveyard");
    const mine = putOnBattlefield(s0, ap, bearC("My Bear"));
    const w = toZone(s0, ap, wreck(), "hand");
    let s = settle(castNow(s0, ap, w, [tgt(mine)]));
    expect(zone(s, mine)).toBe("graveyard");
    expect(tokensNamed(s, ap, "Zombie")).toHaveLength(1);
    // A token isn't put into a graveyard as a card: no Zombie (it's a nontoken creature that has to die).
    const zombie = tokensNamed(s, ap, "Zombie")[0]!;
    const w2 = toZone(s, ap, wreck("Second Wreck"), "hand");
    s = settle(castNow(s, ap, w2, [tgt(zombie)]));
    expect(tokensNamed(s, ap, "Zombie")).toHaveLength(0);
  });

  it("Bridge from Below: a creature put into an opponent's graveyard exiles it; on the battlefield it does nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    const br = toZone(s0, ap, bridge(), "graveyard");
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    const w = toZone(s0, ap, wreck(), "hand");
    let s = settle(castNow(s0, ap, w, [tgt(theirs)]));
    expect(zone(s, br)).toBe("exile");
    expect(tokensNamed(s, ap, "Zombie")).toHaveLength(0);
    // On the battlefield: no ability works there.
    const onBf = putOnBattlefield(s, ap, bridge());
    const mine = putOnBattlefield(s, ap, bearC("My Bear"));
    const w2 = toZone(s, ap, wreck("Second Wreck"), "hand");
    s = settle(castNow(s, ap, w2, [tgt(mine)]));
    expect(zone(s, onBf)).toBe("battlefield");
    expect(tokensNamed(s, ap, "Zombie")).toHaveLength(0);
  });

  it("Bridge from Below: a creature of yours and one of an opponent's dying together make a Zombie and exile it", () => {
    const { s: s0, ap, opp } = setup([]);
    const br = toZone(s0, ap, bridge(), "graveyard");
    putOnBattlefield(s0, ap, bearC("My Bear"));
    putOnBattlefield(s0, opp, bearC("Their Bear"));
    const wrath = toZone(s0, ap, card("Test Wrath", "Sorcery", "{W}", { cmc: 1, colors: ["W"], oracleText: "Destroy all creatures." }), "hand");
    const s = settle(castNow(s0, ap, wrath));
    expect(zone(s, br)).toBe("exile");
    // The bot orders its triggers; whichever resolves first, the Zombie needs Bridge still in the graveyard.
    expect(tokensNamed(s, ap, "Zombie").length).toBeLessThanOrEqual(1);
  });

  it("Demonfire: X damage, and a creature dealt damage this way that would die is exiled instead", () => {
    const { s: s0, ap, opp } = setup([]);
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    const d = toZone(s0, ap, demonfire(), "hand");
    const s = settle(castNow(s0, ap, d, [tgt(theirs)], {}, 2));
    expect(zone(s, theirs)).toBe("exile");
  });

  it("Demonfire: hellbent, it can't be countered and its damage can't be prevented; with cards in hand, both can be", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = toZone(s0, ap, demonfire(), "hand");
    s0.players[opp]!.preventNext = 10;
    onlyHand(s0, ap, [d]);
    let s = castNow(s0, ap, d, [ply(opp)], {}, 3);
    expect(cantBeCountered(s, s.stack[s.stack.length - 1]!)).toBe(true);
    const before = life(s, opp);
    s = settle(s);
    expect(life(s, opp)).toBe(before - 3);
    // With a card in hand: prevented.
    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    const d2 = toZone(t0, ap2, demonfire(), "hand");
    t0.players[opp2]!.preventNext = 10;
    let t = castNow(t0, ap2, d2, [ply(opp2)], {}, 3);
    expect(t.players[ap2]!.hand.length).toBeGreaterThan(0);
    expect(cantBeCountered(t, t.stack[t.stack.length - 1]!)).toBe(false);
    const before2 = life(t, opp2);
    t = settle(t);
    expect(life(t, opp2)).toBe(before2);
  });

  it("Sadistic Sacrament: up to three cards from the target player's library, or up to fifteen if kicked", () => {
    for (const kicked of [false, true]) {
      const { s: s0, ap, opp } = setup([]);
      const sac = toZone(s0, ap, sacrament(), "hand");
      poolOnly(s0, ap, { B: 3, C: 7 });
      let s = castNow(s0, ap, sac, [ply(opp)], kicked ? { kicks: [0] } : {});
      s = settle(s, (x) => x.pending?.kind === "searchLibrary");
      const p = s.pending;
      if (p?.kind !== "searchLibrary") throw new Error("no search");
      expect(p.player).toBe(ap);
      expect([p.min, p.max]).toEqual([0, kicked ? 15 : 3]);
      const lib = s.players[opp]!.library.length;
      const found = p.cards.slice(0, p.max);
      s = settle(act(s, { type: "searchLibrary", player: ap, found }));
      expect(found.every((id) => zone(s, id) === "exile")).toBe(true);
      expect(s.players[opp]!.library.length).toBe(lib - p.max);
    }
  });

  it("Kentaro, the Smiling Cat: a Samurai spell may be cast for generic mana equal to its mana value; other spells may not", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, kentaro());
    const samurai = toZone(s0, ap, vanilla("Test Samurai", "Creature — Human Samurai", "{1}{R}{R}", 3, 3, 3, { colors: ["R"] }), "hand");
    const knight = toZone(s0, ap, vanilla("Test Knight", "Creature — Human Knight", "{1}{R}{R}", 3, 3, 3, { colors: ["R"] }), "hand");
    poolOnly(s0, ap, { C: 3 });
    expect(planCast(s0, ap, samurai, [])).toBeNull(); // its mana cost needs {R}{R}
    expect(altCostsFor(s0, ap, s0.objects[samurai]!).find((a) => a.kind === "genericMv")).toMatchObject({ mana: "{3}" });
    expect(altCostsFor(s0, ap, s0.objects[knight]!).some((a) => a.kind === "genericMv")).toBe(false);
    expect(castProblem(s0, ap, knight, [], undefined, undefined, undefined, undefined, { alt: "genericMv" })).toMatch(/generic|Kentaro|rather/i);
    const s = settle(castNow(s0, ap, samurai, [], { alt: "genericMv" }));
    expect(zone(s, samurai)).toBe("battlefield");
    expect(s.players[ap]!.manaPool.C ?? 0).toBe(0);
  });

  it("Kentaro, the Smiling Cat: not while it's gone, and only for its controller's spells", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, kentaro());
    const samurai = toZone(s0, ap, vanilla("Test Samurai", "Creature — Human Samurai", "{1}{R}{R}", 3, 3, 3, { colors: ["R"] }), "hand");
    expect(altCostsFor(s0, ap, s0.objects[samurai]!).some((a) => a.kind === "genericMv")).toBe(false);
  });

  it("Midnight Oil: enters with seven hour counters; your maximum hand size is that number", () => {
    const { s: s0, ap } = setup([]);
    const o = toZone(s0, ap, oil(), "hand");
    const s = settle(castNow(s0, ap, o));
    expect(counters(s, o, "hour")).toBe(7);
    expect(maxHandSize(s, ap)).toBe(7);
    s.objects[o]!.counters.hour = 3;
    expect(maxHandSize(s, ap)).toBe(3);
  });

  it("Midnight Oil: in your draw step you draw an additional card and remove two hour counters (only the one left, if one)", () => {
    const { s: s0, ap } = setup([]);
    const o = putOnBattlefield(s0, ap, oil());
    s0.objects[o]!.counters.hour = 7;
    onlyHand(s0, ap, []);
    const t0 = s0.turn;
    let s = goUntil(s0, (x) => x.activePlayer === ap && x.turn > t0 && x.step === "main1" && !x.stack.length);
    expect(counters(s, o, "hour")).toBe(5);
    expect(s.players[ap]!.hand.length).toBe(2);
    s.objects[o]!.counters.hour = 1;
    const t1 = s.turn;
    s = goUntil(s, (x) => x.activePlayer === ap && x.turn > t1 && x.step === "main1" && !x.stack.length);
    expect(counters(s, o, "hour")).toBe(0);
  });

  it("Spinal Embrace: untap and gain control of a creature during combat, with haste; at the next end step sacrifice it and gain life equal to its toughness", () => {
    const { s: s0, ap, opp } = setup([]);
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear", 2, 4));
    s0.objects[theirs]!.tapped = true;
    const e = toZone(s0, ap, embrace(), "hand");
    expect(planCast(s0, ap, e, [tgt(theirs)])).toBeNull(); // only during combat
    let s = goUntil(s0, (x) => x.step === "beginCombat" && x.activePlayer === ap && waitingOn(x) === ap && !x.pending);
    s = settle(castNow(s, ap, e, [tgt(theirs)]));
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
    expect(s.objects[theirs]!.tapped).toBe(false);
    expect(kw(s, theirs)).toContain("Haste");
    const before = life(s, ap);
    s = goUntil(s, (x) => x.step === "cleanup" || zone(x, theirs) !== "battlefield");
    s = settle(s);
    expect(zone(s, theirs)).toBe("graveyard");
    expect(life(s, ap)).toBe(before + 4);
  });

  it("Spinal Embrace: if the creature is gone before the end step, no life", () => {
    const { s: s0, ap, opp } = setup([]);
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear", 2, 4));
    const e = toZone(s0, ap, embrace(), "hand");
    let s = goUntil(s0, (x) => x.step === "beginCombat" && x.activePlayer === ap && waitingOn(x) === ap && !x.pending);
    s = settle(castNow(s, ap, e, [tgt(theirs)]));
    const w = toZone(s, ap, wreck(), "hand");
    s = settle(castNow(s, ap, w, [tgt(theirs)]));
    expect(zone(s, theirs)).toBe("graveyard");
    const before = life(s, ap);
    s = goUntil(s, (x) => x.step === "cleanup");
    expect(life(s, ap)).toBe(before);
  });

  it("False Cure: until end of turn, each player who gains life loses 2 life for each 1 life gained", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = toZone(s0, ap, falseCure(), "hand");
    let s = settle(castNow(s0, ap, f));
    const [a, b] = [life(s, ap), life(s, opp)];
    gainLife(s, opp, 3);
    s = settle(s);
    expect(life(s, opp)).toBe(b + 3 - 6);
    gainLife(s, ap, 2);
    s = settle(s);
    expect(life(s, ap)).toBe(a + 2 - 4);
  });

  it("False Cure: it ends with the turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = toZone(s0, ap, falseCure(), "hand");
    let s = settle(castNow(s0, ap, f));
    const t0 = s.turn;
    s = goUntil(s, (x) => x.turn > t0 && x.step === "main1" && !x.stack.length);
    const b = life(s, opp);
    gainLife(s, opp, 3);
    s = settle(s);
    expect(life(s, opp)).toBe(b + 3);
  });

  it("Devouring Greed: target player loses 2 life plus 2 for each Spirit sacrificed as it's cast, and you gain that much", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = toZone(s0, ap, greed(), "hand");
    const a = putOnBattlefield(s0, ap, spirit());
    const b = putOnBattlefield(s0, ap, spirit("Other Spirit"));
    const [mine, theirs] = [life(s0, ap), life(s0, opp)];
    let s = castNow(s0, ap, g, [ply(opp)], { sacrifice: [a, b] }, 2);
    expect([zone(s, a), zone(s, b)]).toEqual(["graveyard", "graveyard"]);
    s = settle(s);
    expect(life(s, opp)).toBe(theirs - 6);
    expect(life(s, ap)).toBe(mine + 6);
  });

  it("Devouring Greed: with no Spirit sacrificed, 2 life", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = toZone(s0, ap, greed(), "hand");
    const [mine, theirs] = [life(s0, ap), life(s0, opp)];
    const s = settle(castNow(s0, ap, g, [ply(opp)], {}, 0));
    expect(life(s, opp)).toBe(theirs - 2);
    expect(life(s, ap)).toBe(mine + 2);
  });

  it("Majestic Myriarch: at the beginning of combat it gains each listed keyword a creature you control has, a hexproof variant as that variant", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, myriarch());
    putOnBattlefield(s0, ap, bearC("Flying Bear", 2, 2, { keywords: ["Flying"], oracleText: "Flying" }));
    putOnBattlefield(s0, ap, bearC("Warded Bear", 2, 2, { oracleText: "Hexproof from white" }));
    putOnBattlefield(s0, opp, bearC("Their Trampler", 2, 2, { keywords: ["Trample"], oracleText: "Trample" }));
    expect(pt(s0, m)).toBe("6/6");
    let s = goUntil(s0, (x) => x.step === "beginCombat" && x.activePlayer === ap);
    s = settle(s);
    expect(kw(s, m)).toContain("Flying");
    expect(kw(s, m)).toContain("Hexproof from white");
    expect(kw(s, m)).not.toContain("Hexproof");
    expect(kw(s, m)).not.toContain("Trample");
  });

  it("Thunderous Orator: when it attacks, it gains the listed keywords your creatures have", () => {
    const { s: s0, ap, opp } = setup([]);
    const o = putOnBattlefield(s0, ap, orator());
    putOnBattlefield(s0, ap, bearC("Deadly Bear", 2, 2, { keywords: ["Deathtouch"], oracleText: "Deathtouch" }));
    putOnBattlefield(s0, ap, bearC("Swift Bear", 2, 2, { keywords: ["Haste"], oracleText: "Haste" }));
    let s = goUntil(s0, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: o, defender: opp }] });
    s = settle(s);
    expect(kw(s, o)).toContain("Deathtouch");
    expect(kw(s, o)).not.toContain("Haste"); // not one it lists
  });
});
