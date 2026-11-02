// Lane B, round 86: unsupported cards from the bottom of the popularity list (`npm run popular -- --least`): one-line
// templates.

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, abilityProblem, botActions, castProblem, characteristics, closeZoneBatch, controllerOf, destroyPermanent, invalidateCharacteristics, isFullySupported, objIsType, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";
const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
const abilitiesIndex = (s: GameState, id: string, re: RegExp) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => re.test(a.text ?? ""));
/**
 * Everyone passes until the stack is empty. "You may" is answered with `may`, trigger targets with the next of `targets`;
 * other questions as the bots would, except those of the players in `me` (it stops there).
 */
const settle = (s: GameState, opts: { may?: boolean; me?: PlayerId[]; targets?: TargetChoice[][] } = {}) => {
  const queue = [...(opts.targets ?? [])];
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "chooseTargets" && queue.length) s = act(s, { type: "chooseTargets", player: p.player, targets: queue.shift()! });
    else if (p && opts.me?.includes(p.player)) return s;
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Plays on (no attacks or blocks, the bots answering other questions) until `stop`. */
const goUntil = (s: GameState, stop: (s: GameState) => boolean) => {
  for (let i = 0; i < 3000; i++) {
    if (stop(s)) return s;
    const p = s.pending;
    const pid = waitingOn(s)!;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, p.count) });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never got there");
};
const attackWith = (s: GameState, attackers: string[], defender: PlayerId) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return act(s, { type: "declareAttackers", player: s.activePlayer, attacks: attackers.map((attacker) => ({ attacker, defender })) });
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}, x?: number) => run(s, planCast(s, pid, id, targets, undefined, "auto", x, choices));
/** Moves a new card for `def` into `pid`'s hand, library (on top) or graveyard. */
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
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
/** Empties `pid`'s hand (into exile), then gives them `defs`. */
const handOf = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  for (const id of [...s.players[pid]!.hand]) {
    s.players[pid]!.hand.splice(s.players[pid]!.hand.indexOf(id), 1);
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  invalidateCharacteristics(s);
  return defs.map((d) => toZone(s, pid, d, "hand"));
};
const hand = (s: GameState, pid: PlayerId) => s.players[pid]!.hand;
const yard = (s: GameState, pid: PlayerId) => s.players[pid]!.graveyard;
/** Blocks declared by `opp`; every other defending player declares none. */
const block = (s: GameState, opp: PlayerId, blocks: { blocker: string; attacker: string }[]) => {
  s = act(s, { type: "declareBlockers", player: opp, blocks });
  for (let i = 0; i < 10 && s.pending?.kind === "declareBlockers"; i++) s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
  return s;
};


/** Plays on to `pid`'s next upkeep, its triggers on the stack or asking. */
const toNextUpkeep = (s: GameState, pid: PlayerId) => {
  const turn = s.turn;
  return goUntil(s, (x) => x.turn > turn && x.activePlayer === pid && x.step === "upkeep" && (x.stack.length > 0 || !!x.pending));
};
const attach = (s: GameState, pid: PlayerId, def: CardDef, to: string) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = to;
  invalidateCharacteristics(s);
  return id;
};
/** Passes (resolving what's on the stack the way settle does) until `pid` is asked to declare blockers. */
const toBlocks = (s: GameState, opts: { targets?: TargetChoice[][] } = {}) => {
  for (let i = 0; i < 100 && s.pending?.kind !== "declareBlockers"; i++) {
    if (s.stack.length || s.pending) s = settle(s, opts);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const lifeOf = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
/** A creature card on top of `pid`'s library, the first of `defs` ending on top. */
const stackLibrary = (s: GameState, pid: PlayerId, defs: CardDef[]) => [...defs].reverse().map((d) => toZone(s, pid, d, "library")).reverse();


const named = (s: GameState, pid: PlayerId, zoneName: "graveyard" | "hand" | "exile" | "library", name: string) => s.players[pid]![zoneName].filter((id) => s.cards[s.objects[id]!.cardId]!.name === name);
const onField = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).name === name);
/** Passes priority (the bots answering questions, triggers resolving) until `stop`. */
const passUntilThat = (s: GameState, stop: (s: GameState) => boolean) => {
  for (let i = 0; i < 400; i++) {
    if (stop(s)) return s;
    const p = s.pending;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error("never got there");
};
/** Attacks `defender` with `attackers`, `opp` blocks as given, then plays on to the combat damage step's end. */
const fight = (s: GameState, attackers: string[], defender: PlayerId, blocks: { blocker: string; attacker: string }[], opts: { targets?: TargetChoice[][]; may?: boolean; me?: PlayerId[] } = {}) => {
  s = attackWith(s, attackers, defender);
  s = toBlocks(s);
  s = block(s, defender, blocks);
  return passUntilThat(s, (x) => x.step === "main2" || (x.step === "combatDamage" && (x.stack.length > 0 || x.triggerQueue.length > 0 || !!x.pending)));
};


const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const giantGrowth = (): CardDef => ({"oracleId":"5748ebf1-24e3-499d-ab7c-c2cebd462a24","name":"Giant Growth","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +3/+3 until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const divination = (): CardDef => ({"oracleId": "273b339c-964b-4a18-8eb5-ceb8abcdfd9e", "name": "Divination", "manaCost": "{2}{U}", "cmc": 3, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Draw two cards.", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "layout": "normal"}) as CardDef;
const ajani = (): CardDef => ({"oracleId": "1d5ff280-7f4d-4801-aefd-9b6e6b1f2818", "name": "Ajani, Caller of the Pride", "manaCost": "{1}{W}{W}", "cmc": 3, "typeLine": "Legendary Planeswalker — Ajani", "supertypes": ["Legendary"], "types": ["Planeswalker"], "subtypes": ["Ajani"], "oracleText": "+1: Put a +1/+1 counter on up to one target creature.\n−3: Target creature gains flying and double strike until end of turn.\n−8: Create X 2/2 white Cat creature tokens, where X is your life total.", "loyalty": "4", "colors": ["W"], "colorIdentity": ["W"], "keywords": [], "layout": "normal"}) as CardDef;
const liliana = (): CardDef => ({"oracleId": "0ba134d8-ee7d-48ec-8dc6-57942b8e9261", "name": "Liliana of the Veil", "manaCost": "{1}{B}{B}", "cmc": 3, "typeLine": "Legendary Planeswalker — Liliana", "supertypes": ["Legendary"], "types": ["Planeswalker"], "subtypes": ["Liliana"], "oracleText": "+1: Each player discards a card.\n−2: Target player sacrifices a creature.\n−6: Separate all permanents target player controls into two piles. That player sacrifices all permanents in the pile of their choice.", "loyalty": "3", "colors": ["B"], "colorIdentity": ["B"], "keywords": [], "layout": "normal"}) as CardDef;
const doomBlade = (): CardDef => ({"oracleId": "59e7f2ae-4535-4191-98be-3e65b6b2befa", "name": "Doom Blade", "manaCost": "{1}{B}", "cmc": 2, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "Destroy target nonblack creature.", "colors": ["B"], "colorIdentity": ["B"], "keywords": [], "layout": "normal"}) as CardDef;
const counters = (s: GameState, id: string, kind: string) => (s.objects[id]!.counters as Record<string, number>)[kind] ?? 0;
const veteran = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.controlledSinceTurn = 0;
  return id;
};
const yuriko = (): CardDef => ({"oracleId": "f89b0143-4b19-4ab1-a96b-356b21e435ef", "name": "Yuriko, Blade of the Mighty", "manaCost": "{3}{W}", "cmc": 4, "typeLine": "Legendary Creature — Human Samurai", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Samurai"], "oracleText": "During combat, players can't cast spells or activate abilities that aren't mana abilities.\nWhenever a creature you control attacks a player alone, it gains double strike until end of turn.", "power": "2", "toughness": "3", "colors": ["W"], "colorIdentity": ["W"], "keywords": [], "layout": "normal"}) as CardDef;
const jiang = (): CardDef => ({"oracleId": "fa8b3557-b35a-4a68-ab85-cf09683f3bc5", "name": "Jiang Yanggu, Alone", "manaCost": "{4}{R}", "cmc": 5, "typeLine": "Legendary Creature — Human Berserker", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Berserker"], "oracleText": "Menace (This creature can't be blocked except by two or more creatures.)\nWhenever a creature you control attacks a player alone, discard a card, then draw a card. Then put a +1/+1 counter on that creature for each card you've discarded this turn.", "power": "4", "toughness": "4", "colors": ["R"], "colorIdentity": ["R"], "keywords": ["Menace"], "layout": "normal"}) as CardDef;
const vermin = (): CardDef => ({"oracleId": "4d18bea4-c9b2-4fc7-948f-2583589994d7", "name": "Diseased Vermin", "manaCost": "{2}{B}", "cmc": 3, "typeLine": "Creature — Rat", "supertypes": [], "types": ["Creature"], "subtypes": ["Rat"], "oracleText": "Whenever this creature deals combat damage to a player, put an infection counter on it.\nAt the beginning of your upkeep, this creature deals X damage to target opponent previously dealt damage by it, where X is the number of infection counters on it.", "power": "1", "toughness": "1", "colors": ["B"], "colorIdentity": ["B"], "keywords": [], "layout": "normal"}) as CardDef;
const fallen = (): CardDef => ({"oracleId": "19348c1e-b683-4d2c-b4eb-82e538b314b0", "name": "The Fallen", "manaCost": "{1}{B}{B}{B}", "cmc": 4, "typeLine": "Creature — Zombie", "supertypes": [], "types": ["Creature"], "subtypes": ["Zombie"], "oracleText": "At the beginning of your upkeep, this creature deals 1 damage to each opponent and planeswalker it has dealt damage to this game.", "power": "2", "toughness": "3", "colors": ["B"], "colorIdentity": ["B"], "keywords": [], "layout": "normal"}) as CardDef;
const sparkRupture = (): CardDef => ({"oracleId": "82e5642a-0803-432c-85d3-091fca75c82f", "name": "Spark Rupture", "manaCost": "{2}{W}", "cmc": 3, "typeLine": "Enchantment", "supertypes": [], "types": ["Enchantment"], "subtypes": [], "oracleText": "When this enchantment enters, draw a card.\nEach planeswalker with one or more loyalty counters on it loses all abilities and is a creature with power and toughness each equal to the number of loyalty counters on it.", "colors": ["W"], "colorIdentity": ["W"], "keywords": [], "layout": "normal"}) as CardDef;
const nissasJudgment = (): CardDef => ({"oracleId": "14247820-5ecb-40bd-8dee-0625cc745ec2", "name": "Nissa's Judgment", "manaCost": "{4}{G}", "cmc": 5, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Support 2. (Put a +1/+1 counter on each of up to two target creatures.)\nChoose up to one target creature an opponent controls. Each creature you control with a +1/+1 counter on it deals damage equal to its power to that creature.", "colors": ["G"], "colorIdentity": ["G"], "keywords": ["Support"], "layout": "normal"}) as CardDef;
const matriarch = (): CardDef => ({"oracleId": "1d260526-db57-486d-b0bc-d523139a0148", "name": "Rootwater Matriarch", "manaCost": "{2}{U}{U}", "cmc": 4, "typeLine": "Creature — Merfolk", "supertypes": [], "types": ["Creature"], "subtypes": ["Merfolk"], "oracleText": "{T}: Gain control of target creature for as long as that creature is enchanted.", "power": "2", "toughness": "3", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "layout": "normal"}) as CardDef;
const aura = () => card("Test Aura", "Enchantment — Aura", "{W}", { oracleText: "Enchant creature\nEnchanted creature gets +1/+1.", keywords: ["Enchant"] });
const opponentsOf = (s: GameState, ap: PlayerId) => [1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(ap) + i) % 4]!);

describe("Lane B round 86", () => {
  it("all of them are supported", () => {
    supported(yuriko(), jiang(), vermin(), fallen(), sparkRupture(), nissasJudgment(), matriarch());
  });

  it("Yuriko, Blade of the Mighty: during combat no spell is cast and no ability but a mana ability is activated", () => {
    const { s: s0, ap } = setup([giantGrowth()]);
    let s = s0;
    veteran(s, ap, yuriko());
    const bear = veteran(s, ap, bears());
    const thief = veteran(s, ap, matriarch());
    const growth = s.players[ap]!.hand.at(-1)!;
    // Before combat both work.
    expect(planCast(s, ap, growth, [tgt(bear)])).not.toBeNull();
    expect(abilityProblem(s, ap, thief, 0)).toBeNull();
    const [b] = opponentsOf(s, ap);
    s = attackWith(s, [bear], b!);
    expect(castProblem(s, ap, growth)).toMatch(/can't cast/);
    expect(abilityProblem(s, ap, thief, 0)).toMatch(/can't activate abilities/);
  });

  it("Yuriko: each creature that attacks a player alone gains double strike; two attacking one player don't", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    veteran(s, ap, yuriko());
    const [x, y, z] = [veteran(s, ap, bears()), veteran(s, ap, hillGiant()), veteran(s, ap, bears())];
    const [b, c] = opponentsOf(s, ap);
    for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: x, defender: b! }, { attacker: y, defender: c! }, { attacker: z, defender: c! }] });
    s = settle(s);
    const ds = (id: string) => characteristics(s, s.objects[id]!).keywords.includes("Double strike");
    expect(ds(x)).toBe(true);
    expect(ds(y)).toBe(false);
    expect(ds(z)).toBe(false);
  });

  it("Yuriko: a creature attacking a planeswalker doesn't stop another from attacking that player alone (rulings)", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    veteran(s, ap, yuriko());
    const [x, y] = [veteran(s, ap, bears()), veteran(s, ap, hillGiant())];
    const [b] = opponentsOf(s, ap);
    const walker = veteran(s, b!, ajani());
    s.objects[walker]!.counters.loyalty = 4;
    for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: x, defender: b! }, { attacker: y, defender: b!, planeswalker: walker }] });
    s = settle(s);
    expect(characteristics(s, s.objects[x]!).keywords).toContain("Double strike");
    expect(characteristics(s, s.objects[y]!).keywords).not.toContain("Double strike");
  });

  it("Jiang Yanggu, Alone: loot, then a +1/+1 counter for each card discarded this turn", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    veteran(s, ap, jiang());
    const bear = veteran(s, ap, bears());
    handOf(s, ap, [shock(), bolt()]);
    const [b] = opponentsOf(s, ap);
    s = attackWith(s, [bear], b!);
    s = settle(s);
    expect(yard(s, ap).length).toBe(1);
    expect(hand(s, ap).length).toBe(2);
    expect(counters(s, bear, "+1/+1")).toBe(1);
  });

  it("Diseased Vermin: an infection counter for combat damage, then upkeep damage only to an opponent it has damaged", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    handOf(s, ap, []);
    const rat = veteran(s, ap, vermin());
    const [b, c] = opponentsOf(s, ap);
    s = fight(s, [rat], b!, []);
    s = settle(s);
    expect(counters(s, rat, "infection")).toBe(1);
    expect(s.objects[rat]!.damagedPlayers).toEqual([b]);
    s = toNextUpkeep(s, ap);
    const p = s.pending;
    // Only that opponent can be the target.
    if (p?.kind === "chooseTargets") {
      expect(() => act(s, { type: "chooseTargets", player: ap, targets: [player(c!)] })).toThrow();
      s = act(s, { type: "chooseTargets", player: ap, targets: [player(b!)] });
    }
    const life = lifeOf(s, b!);
    s = settle(s);
    expect(lifeOf(s, b!)).toBe(life - 1);
  });

  it("Diseased Vermin: with no opponent damaged by it, the upkeep trigger has no target", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    handOf(s, ap, []);
    const rat = veteran(s, ap, vermin());
    s.objects[rat]!.counters.infection = 3;
    const lives = opponentsOf(s, ap).map((p) => lifeOf(s, p));
    const turn = s.turn;
    s = goUntil(s, (x) => x.turn > turn && x.activePlayer === ap && x.step === "upkeep");
    expect(s.stack.length + s.triggerQueue.length).toBe(0);
    s = settle(s);
    expect(opponentsOf(s, ap).map((p) => lifeOf(s, p))).toEqual(lives);
  });

  it("The Fallen: each upkeep, 1 damage to each opponent and planeswalker it has dealt damage to, not others", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    handOf(s, ap, []);
    const fallenId = veteran(s, ap, fallen());
    const [b, c, d] = opponentsOf(s, ap);
    const walker = veteran(s, c!, ajani());
    s.objects[walker]!.counters.loyalty = 5;
    s = fight(s, [fallenId], b!, []);
    s = settle(s);
    expect(lifeOf(s, b!)).toBe(40 - 2);
    s = toNextUpkeep(s, ap);
    s = settle(s);
    expect([b, c, d].map((p) => lifeOf(s, p!))).toEqual([37, 40, 40]);
    // This turn it attacks the planeswalker: next upkeep, 1 to it and 1 to that opponent again.
    for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: fallenId, defender: c!, planeswalker: walker }] });
    s = passUntilThat(s, (x) => x.step === "main2");
    expect(counters(s, walker, "loyalty")).toBe(3);
    s = toNextUpkeep(s, ap);
    s = settle(s);
    expect([b, c, d].map((p) => lifeOf(s, p!))).toEqual([36, 40, 40]);
    expect(counters(s, walker, "loyalty")).toBe(2);
  });

  it("The Fallen: it forgets the players once it leaves the battlefield", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    handOf(s, ap, []);
    const fallenId = veteran(s, ap, fallen());
    const [b] = opponentsOf(s, ap);
    s = fight(s, [fallenId], b!, []);
    s = settle(s);
    expect(s.objects[fallenId]!.damagedPlayers).toEqual([b]);
    destroyPermanent(s, s.objects[fallenId]!, "test");
    expect(s.objects[fallenId]!.damagedPlayers).toBeUndefined();
  });

  it("Spark Rupture: a planeswalker with loyalty counters is a creature with no abilities, P/T its loyalty", () => {
    const { s: s0, ap } = setup([sparkRupture()]);
    let s = s0;
    const [b] = opponentsOf(s, ap);
    const walker = veteran(s, b!, liliana());
    s.objects[walker]!.counters.loyalty = 3;
    s = castNow(s, ap, s.players[ap]!.hand.at(-1)!);
    s = settle(s);
    const c = characteristics(s, s.objects[walker]!);
    expect(c.types).toEqual(["Creature"]);
    expect(c.subtypes).toEqual([]);
    expect(c.supertypes).toContain("Legendary");
    expect(pt(s, walker)).toBe("3/3");
    expect(abilitiesOf(s, s.objects[walker]!).activated.length).toBe(0);
    // Its P/T follow the counters.
    s.objects[walker]!.counters.loyalty = 5;
    invalidateCharacteristics(s);
    expect(pt(s, walker)).toBe("5/5");
    // Damage marks it as a creature's; it doesn't remove loyalty (rulings).
    const shockId = toZone(s, ap, shock(), "hand");
    s = castNow(s, ap, shockId, [tgt(walker)]);
    s = settle(s);
    expect(counters(s, walker, "loyalty")).toBe(5);
    expect(s.objects[walker]!.damage).toBe(2);
    expect(zone(s, walker)).toBe("battlefield");
  });

  it("Spark Rupture: with no loyalty counters left it's a planeswalker again, and is put into the graveyard", () => {
    const { s: s0, ap } = setup([sparkRupture()]);
    let s = s0;
    const [b] = opponentsOf(s, ap);
    const walker = veteran(s, b!, liliana());
    s.objects[walker]!.counters.loyalty = 2;
    s = castNow(s, ap, s.players[ap]!.hand.at(-1)!);
    s = settle(s);
    expect(objIsType(s, s.objects[walker]!, "Planeswalker")).toBe(false);
    s.objects[walker]!.counters.loyalty = 0;
    invalidateCharacteristics(s);
    expect(objIsType(s, s.objects[walker]!, "Planeswalker")).toBe(true);
    const shockId = toZone(s, ap, shock(), "hand");
    s = castNow(s, ap, shockId, [player(b!)]);
    s = settle(s);
    expect(zone(s, walker)).toBe("graveyard");
  });

  it("Nissa's Judgment: support 2 first, then each creature with a +1/+1 counter deals damage equal to its power", () => {
    const { s: s0, ap } = setup([nissasJudgment()]);
    let s = s0;
    const [x, y, z] = [veteran(s, ap, bears()), veteran(s, ap, bears()), veteran(s, ap, bears())];
    const [b] = opponentsOf(s, ap);
    const victim = veteran(s, b!, card("Test Wall", "Creature — Wall", "{4}", { power: "0", toughness: "7" }));
    s = castNow(s, ap, s.players[ap]!.hand.at(-1)!, [tgt(x), tgt(y), tgt(victim)]);
    s = settle(s);
    expect(counters(s, x, "+1/+1")).toBe(1);
    expect(counters(s, z, "+1/+1")).toBe(0);
    // x and y, 3 each: 6 damage to the 0/7.
    expect(s.objects[victim]!.damage).toBe(6);
    expect(zone(s, victim)).toBe("battlefield");
  });

  it("Nissa's Judgment: with no creature chosen, only the counters", () => {
    const { s: s0, ap } = setup([nissasJudgment()]);
    let s = s0;
    const x = veteran(s, ap, bears());
    s = castNow(s, ap, s.players[ap]!.hand.at(-1)!, [tgt(x), { kind: "none" }, { kind: "none" }]);
    s = settle(s);
    expect(counters(s, x, "+1/+1")).toBe(1);
    expect(zone(s, s.players[ap]!.graveyard.at(-1)!)).toBe("graveyard");
  });

  it("Rootwater Matriarch: control of an enchanted creature until it has no Aura; an unenchanted one is unaffected", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const thief = veteran(s, ap, matriarch());
    const [b] = opponentsOf(s, ap);
    const plain = veteran(s, b!, hillGiant());
    s = run(s, planActivate(s, ap, thief, 0, [tgt(plain)]));
    s = settle(s);
    expect(controllerOf(s, s.objects[plain]!)).toBe(b);
    // Next turn's untap aside, untap it by hand to use it again.
    s.objects[thief]!.tapped = false;
    const enchanted = veteran(s, b!, bears());
    const a = attach(s, b!, aura(), enchanted);
    s = run(s, planActivate(s, ap, thief, 0, [tgt(enchanted)]));
    s = settle(s);
    expect(controllerOf(s, s.objects[enchanted]!)).toBe(ap);
    // It stays after the Matriarch leaves (rulings).
    destroyPermanent(s, s.objects[thief]!, "test");
    s = settle(s);
    expect(controllerOf(s, s.objects[enchanted]!)).toBe(ap);
    // The Aura goes: control goes back, and a new Aura doesn't bring it back.
    destroyPermanent(s, s.objects[a]!, "test");
    s = settle(s);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(controllerOf(s, s.objects[enchanted]!)).toBe(b);
    attach(s, b!, aura(), enchanted);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(controllerOf(s, s.objects[enchanted]!)).toBe(b);
  });
});
