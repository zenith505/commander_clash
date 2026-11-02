// Lane B, round 87: unsupported cards from the bottom of the popularity list (`npm run popular -- --least`): one-line
// templates.

import { describe, expect, it } from "vitest";
import { act, addEffect, card, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, abilityProblem, blockProblem, botActions, castProblem, characteristics, closeZoneBatch, controllerOf, destroyPermanent, invalidateCharacteristics, isFullySupported, objIsType, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";
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


const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const divination = (): CardDef => ({"oracleId": "273b339c-964b-4a18-8eb5-ceb8abcdfd9e", "name": "Divination", "manaCost": "{2}{U}", "cmc": 3, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Draw two cards.", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "layout": "normal"}) as CardDef;
const counters = (s: GameState, id: string, kind: string) => (s.objects[id]!.counters as Record<string, number>)[kind] ?? 0;
const veteran = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.controlledSinceTurn = 0;
  return id;
};
const opponentsOf = (s: GameState, ap: PlayerId) => [1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(ap) + i) % 4]!);
const rowen = (): CardDef => ({"oracleId": "eb44f5eb-1c6a-49f0-9751-23d167bf8288", "name": "Rowen", "manaCost": "{2}{G}{G}", "cmc": 4, "typeLine": "Enchantment", "supertypes": [], "types": ["Enchantment"], "subtypes": [], "oracleText": "Reveal the first card you draw each turn. Whenever you reveal a basic land card this way, draw a card.", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "layout": "normal"}) as CardDef;
const etchings = (): CardDef => ({"oracleId": "dddda9a2-dc59-446d-bfc4-3240d12a3654", "name": "Primitive Etchings", "manaCost": "{2}{G}{G}", "cmc": 4, "typeLine": "Enchantment", "supertypes": [], "types": ["Enchantment"], "subtypes": [], "oracleText": "Reveal the first card you draw each turn. Whenever you reveal a creature card this way, draw a card.", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "layout": "normal"}) as CardDef;
const dragster = (): CardDef => ({"oracleId": "6aa96a6e-9a88-4662-aa26-b4c16c0ef650", "name": "Daredevil Dragster", "manaCost": "{3}", "cmc": 3, "typeLine": "Artifact — Vehicle", "supertypes": [], "types": ["Artifact"], "subtypes": ["Vehicle"], "oracleText": "At end of combat, if this Vehicle attacked or blocked this combat, put a velocity counter on it. Then if it has two or more velocity counters on it, sacrifice it and draw two cards.\nCrew 2 (Tap any number of creatures you control with total power 2 or more: This Vehicle becomes an artifact creature until end of turn.)", "power": "4", "toughness": "4", "colors": [], "colorIdentity": [], "keywords": ["Crew"], "layout": "normal"}) as CardDef;
const thicket = (): CardDef => ({"oracleId": "a85390b6-e90b-4d0c-9573-eb67ce01a0aa", "name": "Thicket Elemental", "manaCost": "{3}{G}{G}", "cmc": 5, "typeLine": "Creature — Elemental", "supertypes": [], "types": ["Creature"], "subtypes": ["Elemental"], "oracleText": "Kicker {1}{G} (You may pay an additional {1}{G} as you cast this spell.)\nWhen this creature enters, if it was kicked, you may reveal cards from the top of your library until you reveal a creature card. If you do, put that card onto the battlefield and shuffle all other cards revealed this way into your library.", "power": "4", "toughness": "4", "colors": ["G"], "colorIdentity": ["G"], "keywords": ["Kicker"], "layout": "normal"}) as CardDef;
const awakener = (): CardDef => ({"oracleId": "c0171343-9c0f-4001-8f4e-a5af9256c4d2", "name": "Thunderkin Awakener", "manaCost": "{1}{R}", "cmc": 2, "typeLine": "Creature — Elemental Shaman", "supertypes": [], "types": ["Creature"], "subtypes": ["Elemental", "Shaman"], "oracleText": "Haste\nWhenever this creature attacks, choose target Elemental creature card in your graveyard with toughness less than this creature's toughness. Return that card to the battlefield tapped and attacking. Sacrifice it at the beginning of the next end step.", "power": "1", "toughness": "2", "colors": ["R"], "colorIdentity": ["R"], "keywords": ["Haste"], "layout": "normal"}) as CardDef;
const limDul = (): CardDef => ({"oracleId": "820052b3-d217-4b30-acc4-fa5af7465e9e", "name": "Lim-Dûl the Necromancer", "manaCost": "{5}{B}{B}", "cmc": 7, "typeLine": "Legendary Creature — Human Wizard", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Human", "Wizard"], "oracleText": "Whenever a creature an opponent controls dies, you may pay {1}{B}. If you do, return that card to the battlefield under your control. If it's a creature, it's a Zombie in addition to its other creature types.\n{1}{B}: Regenerate target Zombie.", "power": "4", "toughness": "4", "colors": ["B"], "colorIdentity": ["B"], "keywords": ["Regenerate"], "layout": "normal"}) as CardDef;
const koya = (): CardDef => ({"oracleId": "e7cd87d4-028c-49d9-9416-69f57e7dfec5", "name": "Koya, Death from Above", "manaCost": "{2}{W}", "cmc": 3, "typeLine": "Legendary Creature — Mutant Ninja Bird", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Mutant", "Ninja", "Bird"], "oracleText": "Flying\nWhen Koya enters, exile up to one other target creature. At the beginning of the next end step, you may pay {3}{B}. If you don't, return that card to the battlefield under its owner's control.", "power": "2", "toughness": "1", "colors": ["W"], "colorIdentity": ["B", "W"], "keywords": ["Flying"], "layout": "normal"}) as CardDef;
const relic = (): CardDef => ({"oracleId": "61822bbe-0407-4425-b8d7-0263a8c521ec", "name": "Dragonbroods' Relic", "manaCost": "{1}{G}", "cmc": 2, "typeLine": "Artifact", "supertypes": [], "types": ["Artifact"], "subtypes": [], "oracleText": "{T}, Tap an untapped creature you control: Add one mana of any color.\n{3}{W}{U}{B}{R}{G}, Sacrifice this artifact: Create a 4/4 Dragon creature token named Reliquary Dragon that's all colors. It has flying, lifelink, and \"When this token enters, it deals 3 damage to any target.\" Activate only as a sorcery.", "colors": ["G"], "colorIdentity": ["B", "G", "R", "U", "W"], "keywords": [], "producedMana": ["B", "G", "R", "U", "W"], "layout": "normal"}) as CardDef;
const ballista = (): CardDef => ({"oracleId": "b6811c31-fcd3-4d00-89d5-cf974575a87c", "name": "Ballista Watcher // Ballista Wielder", "manaCost": "{2}{R}{R}", "cmc": 4, "typeLine": "Creature — Human Soldier Werewolf // Creature — Werewolf", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Soldier", "Werewolf"], "oracleText": "{2}{R}, {T}: This creature deals 1 damage to any target.\nDaybound (If a player casts no spells during their own turn, it becomes night next turn.)", "power": "4", "toughness": "3", "colors": ["R"], "colorIdentity": ["R"], "keywords": ["Transform", "Daybound", "Nightbound"], "layout": "transform", "faces": [{"name": "Ballista Watcher", "manaCost": "{2}{R}{R}", "typeLine": "Creature — Human Soldier Werewolf", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Soldier", "Werewolf"], "oracleText": "{2}{R}, {T}: This creature deals 1 damage to any target.\nDaybound (If a player casts no spells during their own turn, it becomes night next turn.)", "power": "4", "toughness": "3", "colors": ["R"]}, {"name": "Ballista Wielder", "manaCost": "", "typeLine": "Creature — Werewolf", "supertypes": [], "types": ["Creature"], "subtypes": ["Werewolf"], "oracleText": "{2}{R}: This creature deals 1 damage to any target. A creature dealt damage this way can't block this turn.\nNightbound (If a player casts at least two spells during their own turn, it becomes day next turn.)", "power": "5", "toughness": "5", "colors": ["R"], "colorIndicator": ["R"]}]}) as CardDef;
const suitor = (): CardDef => ({"oracleId": "e98e8129-3e0e-45cc-b00c-1387cc592023", "name": "Alluring Suitor // Deadly Dancer", "manaCost": "{2}{R}", "cmc": 3, "typeLine": "Creature — Vampire // Creature — Vampire", "supertypes": [], "types": ["Creature"], "subtypes": ["Vampire"], "oracleText": "When you attack with exactly two creatures, transform this creature.", "power": "2", "toughness": "3", "colors": ["R"], "colorIdentity": ["R"], "keywords": ["Transform", "Trample"], "producedMana": ["R"], "layout": "transform", "faces": [{"name": "Alluring Suitor", "manaCost": "{2}{R}", "typeLine": "Creature — Vampire", "supertypes": [], "types": ["Creature"], "subtypes": ["Vampire"], "oracleText": "When you attack with exactly two creatures, transform this creature.", "power": "2", "toughness": "3", "colors": ["R"]}, {"name": "Deadly Dancer", "manaCost": "", "typeLine": "Creature — Vampire", "supertypes": [], "types": ["Creature"], "subtypes": ["Vampire"], "oracleText": "Trample\nWhen this creature transforms into Deadly Dancer, add {R}{R}. Until end of turn, you don't lose this mana as steps and phases end.\n{R}{R}: This creature and another target creature each get +1/+0 until end of turn.", "power": "3", "toughness": "3", "colors": ["R"], "colorIndicator": ["R"]}]}) as CardDef;
const wiitigo = (): CardDef => ({"oracleId": "7f956a21-854e-41cc-96f9-ad774e69fa8e", "name": "Wiitigo", "manaCost": "{3}{G}{G}{G}", "cmc": 6, "typeLine": "Creature — Yeti", "supertypes": [], "types": ["Creature"], "subtypes": ["Yeti"], "oracleText": "This creature enters with six +1/+1 counters on it.\nAt the beginning of your upkeep, put a +1/+1 counter on this creature if it has blocked or been blocked since your last upkeep. Otherwise, remove a +1/+1 counter from it.", "power": "0", "toughness": "0", "colors": ["G"], "colorIdentity": ["G"], "keywords": [], "layout": "normal"}) as CardDef;
const shape = (): CardDef => ({"oracleId": "16950554-0e39-4705-aab4-7a8734771844", "name": "Shape of the Wiitigo", "manaCost": "{3}{G}{G}{G}", "cmc": 6, "typeLine": "Enchantment — Aura", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Aura"], "oracleText": "Enchant creature\nWhen this Aura enters, put six +1/+1 counters on enchanted creature.\nAt the beginning of your upkeep, put a +1/+1 counter on enchanted creature if it attacked or blocked since your last upkeep. Otherwise, remove a +1/+1 counter from it.", "colors": ["G"], "colorIdentity": ["G"], "keywords": ["Enchant"], "layout": "normal"}) as CardDef;

const testDraw = () => card("Test Draw", "Instant", "{U}", { oracleText: "Draw a card." });
const elemental = (toughness: string) => card(`Test Elemental ${toughness}`, "Creature — Elemental", "{R}", { power: "3", toughness });
const nonbasicLand = () => card("Test Land", "Land", "", { oracleText: "{T}: Add {C}." });
const arbor = () => card("Test Arbor", "Land Creature — Forest Dryad", "", { power: "1", toughness: "1" });
const vehicle = () => card("Test Wagon", "Artifact — Vehicle", "{2}", { power: "3", toughness: "3", oracleText: "Crew 1" });
const subtypesOf = (s: GameState, id: string) => characteristics(s, s.objects[id]!).subtypes;

describe("Lane B round 87", () => {
  it("all of them are supported", () => {
    supported(rowen(), etchings(), dragster(), thicket(), awakener(), limDul(), koya(), relic(), ballista(), suitor(), wiitigo(), shape());
  });

  it("Rowen: the first card drawn each turn is revealed; a basic land card draws another card, other cards don't", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    veteran(s, ap, rowen());
    const [div] = handOf(s, ap, [divination()]);
    stackLibrary(s, ap, [card("Forest", "Basic Land — Forest"), bears(), bears()]);
    s.players[ap]!.draws = undefined;
    s = settle(castNow(s, ap, div!));
    expect(hand(s, ap).length).toBe(3);
    expect(s.log.some((l) => /reveals Forest, the first card they drew this turn/.test(l.text))).toBe(true);
    // A nonbasic land first: no extra card.
    const [div2] = handOf(s, ap, [divination()]);
    stackLibrary(s, ap, [nonbasicLand(), bears()]);
    s.players[ap]!.draws = undefined;
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, U: 3 };
    s = settle(castNow(s, ap, div2!));
    expect(hand(s, ap).length).toBe(2);
  });

  it("Rowen: on another player's turn too, the first card you draw that turn", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    veteran(s, ap, rowen());
    handOf(s, ap, []);
    const [b] = opponentsOf(s, ap);
    s = goUntil(s, (x) => x.activePlayer === b && x.step === "upkeep" && waitingOn(x) === ap && !x.pending && !x.stack.length);
    const [opt] = handOf(s, ap, [testDraw()]);
    stackLibrary(s, ap, [card("Island", "Basic Land — Island"), bears()]);
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, U: 1 };
    s = settle(castNow(s, ap, opt!));
    // The Island and then Grizzly Bears.
    expect(hand(s, ap).map((id) => s.cards[s.objects[id]!.cardId]!.name)).toEqual(["Island", "Grizzly Bears"]);
  });

  it("Primitive Etchings: a creature card drawn first draws another card; a second card drawn that turn doesn't count", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    veteran(s, ap, etchings());
    const [div] = handOf(s, ap, [divination()]);
    stackLibrary(s, ap, [card("Forest", "Basic Land — Forest"), bears(), bears()]);
    s.players[ap]!.draws = undefined;
    s = settle(castNow(s, ap, div!));
    expect(hand(s, ap).length).toBe(2);
    const [div2] = handOf(s, ap, [divination()]);
    stackLibrary(s, ap, [bears(), card("Forest", "Basic Land — Forest"), bears()]);
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, U: 3 };
    s = settle(castNow(s, ap, div2!));
    // Not the first cards drawn this turn any more.
    expect(hand(s, ap).length).toBe(2);
    const [div3] = handOf(s, ap, [divination()]);
    stackLibrary(s, ap, [bears(), card("Forest", "Basic Land — Forest"), bears()]);
    s.players[ap]!.draws = undefined;
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, U: 3 };
    s = settle(castNow(s, ap, div3!));
    expect(hand(s, ap).length).toBe(3);
  });

  it("Daredevil Dragster: after it attacked, a velocity counter; with two, it's sacrificed and you draw two cards", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const d = veteran(s, ap, dragster());
    addEffect(s, ap, [d], [{ kind: "addTypes", types: ["Creature"], subtypes: [] }], "game");
    handOf(s, ap, []);
    const [b] = opponentsOf(s, ap);
    s = fight(s, [d], b!, []);
    s = goUntil(s, (x) => x.step === "main2");
    expect(counters(s, d, "velocity")).toBe(1);
    expect(zone(s, d)).toBe("battlefield");
    s.objects[d]!.counters.velocity = 1;
    s = goUntil(s, (x) => x.activePlayer === ap && x.step === "main1" && x.turn > s.turn);
    handOf(s, ap, []);
    s = fight(s, [d], b!, []);
    s = goUntil(s, (x) => x.step === "main2");
    expect(zone(s, d)).toBe("graveyard");
    expect(hand(s, ap).length).toBe(2);
  });

  it("Daredevil Dragster: no counter if it didn't attack or block", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const d = veteran(s, ap, dragster());
    addEffect(s, ap, [d], [{ kind: "addTypes", types: ["Creature"], subtypes: [] }], "game");
    s.objects[d]!.counters.velocity = 1;
    const bear = veteran(s, ap, bears());
    const [b] = opponentsOf(s, ap);
    s = fight(s, [bear], b!, []);
    s = goUntil(s, (x) => x.step === "main2");
    expect(counters(s, d, "velocity")).toBe(1);
    expect(zone(s, d)).toBe("battlefield");
  });

  it("Thicket Elemental: kicked, you may reveal until a creature card, put it onto the battlefield and shuffle the rest in", () => {
    const { s: s0, ap, ids } = setup([thicket()]);
    let s = s0;
    const th = ids[0]!;
    const [land1, land2, giant] = stackLibrary(s, ap, [nonbasicLand(), card("Forest", "Basic Land — Forest"), hillGiant()]);
    const libSize = s.players[ap]!.library.length;
    s = settle(castNow(s, ap, th, [], { kicks: [0] }), { may: true });
    expect(zone(s, th)).toBe("battlefield");
    expect(zone(s, giant!)).toBe("battlefield");
    expect(zone(s, land1!)).toBe("library");
    expect(zone(s, land2!)).toBe("library");
    expect(s.players[ap]!.library.length).toBe(libSize - 1);
  });

  it("Thicket Elemental: not kicked, or the reveal declined, nothing is revealed", () => {
    const { s: s0, ap, ids } = setup([thicket(), thicket()]);
    let s = s0;
    const [a, b2] = ids;
    const [, , giant] = stackLibrary(s, ap, [nonbasicLand(), card("Forest", "Basic Land — Forest"), hillGiant()]);
    s = settle(castNow(s, ap, a!), { may: true });
    expect(zone(s, giant!)).toBe("library");
    const top = [...s.players[ap]!.library.slice(0, 3)];
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, G: 7 };
    s = settle(castNow(s, ap, b2!, [], { kicks: [0] }), { may: false });
    expect(zone(s, b2!)).toBe("battlefield");
    expect(s.players[ap]!.library.slice(0, 3)).toEqual(top);
  });

  it("Thunderkin Awakener: an Elemental card with less toughness returns tapped and attacking, sacrificed at the end step", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const aw = veteran(s, ap, awakener());
    const low = toZone(s, ap, elemental("1"), "graveyard");
    const high = toZone(s, ap, elemental("2"), "graveyard");
    const [b] = opponentsOf(s, ap);
    s = attackWith(s, [aw], b!);
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("chooseTargets");
    // Toughness 2 isn't less than the Awakener's 2.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(high)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(low)] }));
    const back = onField(s, ap, "Test Elemental 1")[0]!;
    expect(s.objects[back]!.tapped).toBe(true);
    expect(s.objects[back]!.attacking).toBe(b);
    s = goUntil(s, (x) => x.step === "cleanup" || (x.step === "end" && !x.stack.length && !x.triggerQueue.length && !x.pending && x.log.some((l) => /sacrifices Test Elemental 1/.test(l.text))));
    expect(yard(s, ap)).toContain(low);
    expect(zone(s, high)).toBe("graveyard");
  });

  it("Lim-Dûl the Necromancer: pay {1}{B} and a creature an opponent controls that died returns under your control as a Zombie", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    veteran(s, ap, limDul());
    const [b, c] = opponentsOf(s, ap);
    const bear = veteran(s, b!, bears());
    const giant = veteran(s, c!, hillGiant());
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, B: 2 };
    destroyPermanent(s, s.objects[bear]!, "test");
    closeZoneBatch(s);
    s = settle(s, { may: true });
    const zombie = onField(s, ap, "Grizzly Bears")[0]!;
    expect(subtypesOf(s, zombie)).toEqual(expect.arrayContaining(["Bear", "Zombie"]));
    // Not paid: it stays in the graveyard.
    destroyPermanent(s, s.objects[giant]!, "test");
    closeZoneBatch(s);
    s = settle(s, { may: false });
    expect(named(s, c!, "graveyard", "Hill Giant").length).toBe(1);
  });

  it("Lim-Dûl the Necromancer: a card that isn't a creature as it returns isn't a Zombie", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    veteran(s, ap, limDul());
    const [b] = opponentsOf(s, ap);
    const wagon = veteran(s, b!, vehicle());
    addEffect(s, b!, [wagon], [{ kind: "addTypes", types: ["Creature"], subtypes: [] }]);
    const dryad = veteran(s, b!, arbor());
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, B: 4 };
    destroyPermanent(s, s.objects[wagon]!, "test");
    closeZoneBatch(s);
    s = settle(s, { may: true });
    const back = onField(s, ap, "Test Wagon")[0]!;
    expect(objIsType(s, s.objects[back]!, "Creature")).toBe(false);
    expect(subtypesOf(s, back)).not.toContain("Zombie");
    destroyPermanent(s, s.objects[dryad]!, "test");
    closeZoneBatch(s);
    s = settle(s, { may: true });
    expect(subtypesOf(s, onField(s, ap, "Test Arbor")[0]!)).toEqual(expect.arrayContaining(["Forest", "Dryad", "Zombie"]));
  });

  it("Koya, Death from Above: the exiled creature returns at the next end step unless you pay {3}{B}", () => {
    const { s: s0, ap, ids } = setup([koya()]);
    let s = s0;
    const [k1] = ids;
    const [b] = opponentsOf(s, ap);
    const bear = veteran(s, b!, bears());
    s = settle(castNow(s, ap, k1!), { targets: [[tgt(bear)]] });
    expect(zone(s, bear)).toBe("exile");
    s = goUntil(s, (x) => x.step === "end" && x.pending?.kind === "chooseMay");
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(onField(s, b!, "Grizzly Bears").length).toBe(1);
  });

  it("Koya: paid, the card stays exiled, even with Koya gone", () => {
    const { s: s0, ap, ids } = setup([koya()]);
    let s = s0;
    const [k1] = ids;
    const [b] = opponentsOf(s, ap);
    const bear = veteran(s, b!, bears());
    s = settle(castNow(s, ap, k1!), { targets: [[tgt(bear)]] });
    destroyPermanent(s, s.objects[k1!]!, "test");
    closeZoneBatch(s);
    s = settle(s);
    s = goUntil(s, (x) => x.step === "end" && x.pending?.kind === "chooseMay");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, B: 4 };
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(zone(s, bear)).toBe("exile");
    expect(s.players[ap]!.manaPool.B ?? 0).toBe(0);
  });

  it("Dragonbroods' Relic: a 4/4 Reliquary Dragon of all colors with flying, lifelink and 3 damage as it enters", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const relicId = veteran(s, ap, relic());
    const [b] = opponentsOf(s, ap);
    const life = lifeOf(s, b!);
    const i = abilitiesIndex(s, relicId, /Reliquary Dragon/);
    s = settle(run(s, planActivate(s, ap, relicId, i)), { targets: [[player(b!)]] });
    expect(zone(s, relicId)).toBe("graveyard");
    const dragon = onField(s, ap, "Reliquary Dragon")[0]!;
    const ch = characteristics(s, s.objects[dragon]!);
    expect(ch.colors).toEqual(["W", "U", "B", "R", "G"]);
    expect(ch.keywords).toEqual(expect.arrayContaining(["Flying", "Lifelink"]));
    expect(pt(s, dragon)).toBe("4/4");
    expect(lifeOf(s, b!)).toBe(life - 3);
  });

  it("Ballista Wielder: 1 damage, and a creature dealt damage this way can't block this turn", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const w = veteran(s, ap, ballista());
    s.objects[w]!.face = 1;
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[w]!).name).toBe("Ballista Wielder");
    const [b] = opponentsOf(s, ap);
    const giant = veteran(s, b!, hillGiant());
    const other = veteran(s, b!, hillGiant());
    s = settle(run(s, planActivate(s, ap, w, abilitiesIndex(s, w, /can't block/), [tgt(giant)])));
    expect(s.objects[giant]!.damage).toBe(1);
    const bear = veteran(s, ap, bears());
    s = attackWith(s, [bear], b!);
    s = toBlocks(s);
    expect(blockProblem(s, s.objects[giant]!, s.objects[bear]!)).not.toBeNull();
    expect(blockProblem(s, s.objects[other]!, s.objects[bear]!)).toBeNull();
  });

  it("Alluring Suitor: attacking with exactly two creatures transforms it; with three it doesn't", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const su = veteran(s, ap, suitor());
    const bear = veteran(s, ap, bears());
    const giant = veteran(s, ap, hillGiant());
    const [b] = opponentsOf(s, ap);
    const three = settle(attackWith(structuredClone(s), [su, bear, giant], b!));
    expect(three.objects[su]!.face ?? 0).toBe(0);
    s = settle(attackWith(s, [su, bear], b!));
    expect(s.objects[su]!.face).toBe(1);
    expect(characteristics(s, s.objects[su]!).name).toBe("Deadly Dancer");
  });

  it("Wiitigo: a +1/+1 counter at your upkeep if it blocked or was blocked since your last upkeep, else one removed", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    handOf(s, ap, []);
    const w = veteran(s, ap, wiitigo());
    s.objects[w]!.counters["+1/+1"] = 6;
    const [b] = opponentsOf(s, ap);
    const bear = veteran(s, b!, bears());
    // Attacking unblocked doesn't count for Wiitigo.
    s = fight(s, [w], b!, []);
    s = settle(toNextUpkeep(s, ap));
    expect(counters(s, w, "+1/+1")).toBe(5);
    // Blocked this time.
    handOf(s, ap, []);
    s = goUntil(s, (x) => x.step === "main1" && x.activePlayer === ap);
    s = fight(s, [w], b!, [{ blocker: bear, attacker: w }]);
    s = settle(toNextUpkeep(s, ap));
    expect(counters(s, w, "+1/+1")).toBe(6);
  });

  it("Shape of the Wiitigo: enchanted creature gets a counter if it attacked or blocked since your last upkeep", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    handOf(s, ap, []);
    const bear = veteran(s, ap, bears());
    const giant = veteran(s, ap, hillGiant());
    attach(s, ap, shape(), bear);
    attach(s, ap, shape(), giant);
    s.objects[bear]!.counters["+1/+1"] = 6;
    s.objects[giant]!.counters["+1/+1"] = 6;
    invalidateCharacteristics(s);
    const [b] = opponentsOf(s, ap);
    s = fight(s, [bear], b!, []);
    s = settle(toNextUpkeep(s, ap));
    expect(counters(s, bear, "+1/+1")).toBe(7);
    expect(counters(s, giant, "+1/+1")).toBe(5);
  });
});
