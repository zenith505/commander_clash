// Lane B, round 91: unsupported cards from the bottom of the popularity list (`npm run popular -- --least`): one-line
// templates.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, blockProblem, botActions, characteristics, closeZoneBatch, controllerOf, destroyPermanent, invalidateCharacteristics, isFullySupported, planActivate, planCast, tapPermanent, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PendingDecision, type PlayerId, type TargetChoice } from "../src";
import { pt } from "./helpers";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions of the players in `me` stop it, others the bots answer. */
const settle = (s: GameState, opts: { may?: boolean; me?: PlayerId[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay" && !opts.me?.includes(p.player)) s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes priority until a question of this kind comes up. */
const toPending = (s: GameState, kind: PendingDecision["kind"]) => {
  for (let i = 0; i < 100; i++) {
    if (s.pending?.kind === kind) return s;
    if (s.pending) throw new Error(`asked ${s.pending.kind} first`);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error(`never asked ${kind}`);
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
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
const lifeOf = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const counters = (s: GameState, id: string, kind: string) => (s.objects[id]!.counters as Record<string, number>)[kind] ?? 0;
const onField = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).name === name);
const opponentsOf = (s: GameState, ap: PlayerId) => [1, 2, 3].map((i) => s.turnOrder[(s.turnOrder.indexOf(ap) + i) % 4]!);
const abilityIndex = (s: GameState, id: string, re: RegExp) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => re.test(a.text ?? ""));
/** An Aura put onto the battlefield attached to `host`. */
const attached = (s: GameState, pid: PlayerId, def: CardDef, host: string) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = host;
  invalidateCharacteristics(s);
  return id;
};
/** `pid` gets priority with the stack as it is: the players before them pass. */
const priorityTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 4 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(waitingOn(s)).toBe(pid);
  return s;
};


// Real oracle text (Scryfall).
const presence = (): CardDef => ({"oracleId": "8f319b31-efb0-4f48-a2a3-1f308e7b1dda", "name": "Illusionary Presence", "manaCost": "{1}{U}{U}", "cmc": 3, "typeLine": "Creature — Illusion", "supertypes": [], "types": ["Creature"], "subtypes": ["Illusion"], "oracleText": "Cumulative upkeep {U} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nAt the beginning of your upkeep, choose a land type. This creature gains landwalk of the chosen type until end of turn. (It can't be blocked as long as defending player controls a land of that type.)", "power": "2", "toughness": "2", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Cumulative upkeep"], "layout": "normal"}) as CardDef;
const guides = (): CardDef => ({"oracleId": "ef8c324a-582b-401e-add1-1985c5596908", "name": "Barbarian Guides", "manaCost": "{2}{R}", "cmc": 3, "typeLine": "Creature — Human Barbarian", "supertypes": [], "types": ["Creature"], "subtypes": ["Human", "Barbarian"], "oracleText": "{2}{R}, {T}: Choose a land type. Target creature you control gains snow landwalk of the chosen type until end of turn. Return that creature to its owner's hand at the beginning of the next end step. (It can't be blocked as long as defending player controls a snow land of that type.)", "power": "1", "toughness": "2", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "layout": "normal"}) as CardDef;
const cloak = (): CardDef => ({"oracleId": "5241182d-e2ca-4b31-809f-fbff2822dbf6", "name": "Traveler's Cloak", "manaCost": "{2}{U}", "cmc": 3, "typeLine": "Enchantment — Aura", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Aura"], "oracleText": "Enchant creature\nAs this Aura enters, choose a land type.\nWhen this Aura enters, draw a card.\nEnchanted creature has landwalk of the chosen type. (It can't be blocked as long as defending player controls a land of that type.)", "colors": ["U"], "colorIdentity": ["U"], "keywords": ["Enchant"], "layout": "normal"}) as CardDef;
const extractor = (): CardDef => ({"oracleId": "e45f0a12-e1ca-432f-a208-9359dd18513d", "name": "Rage Extractor", "manaCost": "{4}{R/P}", "cmc": 5, "typeLine": "Artifact", "supertypes": [], "types": ["Artifact"], "subtypes": [], "oracleText": "({R/P} can be paid with either {R} or 2 life.)\nWhenever you cast a spell with {H} in its mana cost, this artifact deals damage equal to that spell's mana value to any target.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "layout": "normal"}) as CardDef;
const insub = (): CardDef => ({"oracleId": "0d3e843e-eeb4-421e-b55d-ceb21f51a080", "name": "Insubordination", "manaCost": "{B}{B}", "cmc": 2, "typeLine": "Enchantment — Aura", "supertypes": [], "types": ["Enchantment"], "subtypes": ["Aura"], "oracleText": "Enchant creature\nAt the beginning of the end step of enchanted creature's controller, this Aura deals 2 damage to that player unless that creature attacked this turn.", "colors": ["B"], "colorIdentity": ["B"], "keywords": ["Enchant"], "layout": "normal"}) as CardDef;
const taunt = (): CardDef => ({"oracleId": "24cf7fad-233b-49fd-b2a1-a29e3e30041c", "name": "Taunt", "manaCost": "{U}", "cmc": 1, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "During target player's next turn, creatures that player controls attack you if able.", "colors": ["U"], "colorIdentity": ["U"], "keywords": [], "layout": "normal"}) as CardDef;
const gouger = (): CardDef => ({"oracleId": "2677c0d9-1251-478e-b157-072859c593a9", "name": "Gravegouger", "manaCost": "{2}{B}", "cmc": 3, "typeLine": "Creature — Nightmare Horror", "supertypes": [], "types": ["Creature"], "subtypes": ["Nightmare", "Horror"], "oracleText": "When this creature enters, exile up to two target cards from a single graveyard.\nWhen this creature leaves the battlefield, return the exiled cards to their owner's graveyard.", "power": "2", "toughness": "2", "colors": ["B"], "colorIdentity": ["B"], "keywords": [], "layout": "normal"}) as CardDef;
const retribution = (): CardDef => ({"oracleId": "2c7b0034-7eb5-4950-b6dc-8e1d07d26899", "name": "Retribution", "manaCost": "{2}{R}{R}", "cmc": 4, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Choose two target creatures controlled by the same opponent. That player chooses and sacrifices one of those creatures. Put a -1/-1 counter on the other.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "layout": "normal"}) as CardDef;
const spite = (): CardDef => ({"oracleId": "68b038ef-71c4-4ca5-9821-57bf85831bb7", "name": "Barrin's Spite", "manaCost": "{2}{U}{B}", "cmc": 4, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Choose two target creatures controlled by the same player. Their controller chooses and sacrifices one of them. Return the other to its owner's hand.", "colors": ["B", "U"], "colorIdentity": ["B", "U"], "keywords": [], "layout": "normal"}) as CardDef;
const incriminate = (): CardDef => ({"oracleId": "d8b59cc3-766f-4350-971f-edf721fcc5be", "name": "Incriminate", "manaCost": "{1}{B}", "cmc": 2, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Choose two target creatures controlled by the same player. That player sacrifices one of them of their choice.", "colors": ["B"], "colorIdentity": ["B"], "keywords": [], "layout": "normal"}) as CardDef;
const cannibalize = (): CardDef => ({"oracleId": "bf044267-92b9-4983-964f-2bc4ecf76bce", "name": "Cannibalize", "manaCost": "{1}{B}", "cmc": 2, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Choose two target creatures controlled by the same player. Exile one of those creatures and put two +1/+1 counters on the other.", "colors": ["B"], "colorIdentity": ["B"], "keywords": [], "layout": "normal"}) as CardDef;
const agony = (): CardDef => ({"oracleId": "4ef07e5a-3dc3-41dd-a3a9-e8812b4d40d3", "name": "Trial of Agony", "manaCost": "{R}", "cmc": 1, "typeLine": "Sorcery", "supertypes": [], "types": ["Sorcery"], "subtypes": [], "oracleText": "Choose two target creatures controlled by the same opponent. That player chooses one of those creatures. Trial of Agony deals 5 damage to that creature, and the other can't block this turn.", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "layout": "normal"}) as CardDef;
const searblades = (): CardDef => ({"oracleId": "bbed284c-987a-4765-b3a8-4f18a228ad0e", "name": "Ceaseless Searblades", "manaCost": "{3}{R}", "cmc": 4, "typeLine": "Creature — Elemental Warrior", "supertypes": [], "types": ["Creature"], "subtypes": ["Elemental", "Warrior"], "oracleText": "Whenever you activate an ability of an Elemental, this creature gets +1/+0 until end of turn.", "power": "2", "toughness": "4", "colors": ["R"], "colorIdentity": ["R"], "keywords": [], "layout": "normal"}) as CardDef;
const whirlwind = (): CardDef => ({"oracleId": "72eabfcc-61b6-4a07-9a9c-b40a9c05cf66", "name": "Whirlwind, Killer Cyclone", "manaCost": "{2}{R}", "cmc": 3, "typeLine": "Legendary Creature — Mutant Villain", "supertypes": ["Legendary"], "types": ["Creature"], "subtypes": ["Mutant", "Villain"], "oracleText": "Haste\nWhenever one or more creatures you control that entered this turn attack a player, target creature that player controls can't block this turn.", "power": "2", "toughness": "3", "colors": ["R"], "colorIdentity": ["R"], "keywords": ["Haste"], "layout": "normal"}) as CardDef;
const dismember = (): CardDef => ({"oracleId": "fd74f8eb-0253-42dd-8277-186d4934da38", "name": "Dismember", "manaCost": "{1}{B/P}{B/P}", "cmc": 3, "typeLine": "Instant", "supertypes": [], "types": ["Instant"], "subtypes": [], "oracleText": "({B/P} can be paid with either {B} or 2 life.)\nTarget creature gets -5/-5 until end of turn.", "colors": ["B"], "colorIdentity": ["B"], "keywords": [], "layout": "normal"}) as CardDef;
const bears = (): CardDef => card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });
const giant = (): CardDef => card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "4", toughness: "4" });
const land = (typeLine: string, name = typeLine.replace(/^.*— /, "")): CardDef => card(name, typeLine);
/** An Elemental with "{1}: ~ gets +1/+0 until end of turn." */
const elemental = (): CardDef => card("Ember Imp", "Creature — Elemental", "{1}{R}", { power: "1", toughness: "1", oracleText: "{1}: This creature gets +1/+0 until end of turn." });
const pumper = (): CardDef => card("Pump Bear", "Creature — Bear", "{1}{G}", { power: "1", toughness: "1", oracleText: "{1}: This creature gets +1/+0 until end of turn." });
const walks = (s: GameState, id: string) => characteristics(s, s.objects[id]!).keywords.filter((k) => /walk$/i.test(k));

describe("Lane B round 91: cards are fully supported", () => {
  it("compile fully", () => supported(presence(), guides(), cloak(), extractor(), insub(), taunt(), gouger(), retribution(), spite(), incriminate(), cannibalize(), agony(), searblades(), whirlwind()));
});

describe("Landwalk of a chosen land type (CR 702.14a, 205.3i)", () => {
  it("Traveler's Cloak: as it enters you choose any land type, and the enchanted creature has that landwalk", () => {
    const { s: s0, ap, opp } = setup([]);
    const [c] = handOf(s0, ap, [cloak()]);
    const b = putOnBattlefield(s0, ap, bears());
    let s = castNow(s0, ap, c!, [tgt(b)]);
    s = settle(s, { me: [ap] });
    const p = s.pending as Extract<PendingDecision, { kind: "chooseOption" }>;
    expect(p?.kind).toBe("chooseOption");
    expect(p.what).toBe("landType");
    // Nonbasic land types are offered too.
    expect(p.options).toEqual(expect.arrayContaining(["Plains", "Gate", "Desert", "Urza's", "Cave"]));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Gate" }), { me: [ap] });
    expect(s.objects[c!]!.attachedTo).toBe(b);
    expect(walks(s, b)).toEqual(["Gatewalk"]);
    // Unblockable only while the defending player controls a Gate.
    const blocker = putOnBattlefield(s, opp, bears());
    expect(blockProblem(s, s.objects[blocker]!, s.objects[b]!, opp)).toBeNull();
    putOnBattlefield(s, opp, land("Land — Gate", "Basalt Gate"));
    expect(blockProblem(s, s.objects[blocker]!, s.objects[b]!, opp)).toMatch(/gatewalk/i);
  });

  it("Illusionary Presence: at your upkeep you choose a land type, and it has that landwalk until end of turn", () => {
    const { s: s0, ap } = setup([]);
    handOf(s0, ap, []);
    const ip = putOnBattlefield(s0, ap, presence());
    let s = passUntil(act(s0, { type: "passPriority", player: waitingOn(s0)! }), "upkeep", ap);
    s.players[ap]!.manaPool.U = 3;
    let asked: Extract<PendingDecision, { kind: "chooseOption" }> | undefined;
    for (let i = 0; i < 20 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      s = settle(s, { me: [ap] });
      const p = s.pending;
      if (!p) break;
      if (p.kind === "chooseOption" && p.what === "landType") {
        asked = p;
        s = act(s, { type: "chooseOption", player: ap, choice: "Desert" });
      } else if (p.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: true });
      else for (const a of botActions(s, ap)) s = act(s, a);
    }
    expect(asked?.options).toContain("Desert");
    expect(s.objects[ip]!.zone).toBe("battlefield");
    expect(walks(s, ip)).toEqual(["Desertwalk"]);
    // Gone at the end of the turn.
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(walks(s, ip)).toEqual([]);
  });

  it("Barbarian Guides: snow landwalk of the chosen type until end of turn, then the creature returns to its owner's hand", () => {
    const { s: s0, ap, opp } = setup([]);
    handOf(s0, ap, []);
    const g = putOnBattlefield(s0, ap, guides());
    const b = putOnBattlefield(s0, ap, bears());
    s0.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 1, G: 0, C: 2 };
    let s = run(s0, planActivate(s0, ap, g, 0, [tgt(b)]));
    s = settle(s, { me: [ap] });
    const p = s.pending as Extract<PendingDecision, { kind: "chooseOption" }>;
    expect(p.what).toBe("landType");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Swamp" }), { me: [ap] });
    expect(walks(s, b)).toEqual(["Snow swampwalk"]);
    const blocker = putOnBattlefield(s, opp, bears());
    // A Swamp that isn't snow doesn't count; a snow Swamp does (CR 702.14c).
    putOnBattlefield(s, opp, land("Basic Land — Swamp"));
    expect(blockProblem(s, s.objects[blocker]!, s.objects[b]!, opp)).toBeNull();
    putOnBattlefield(s, opp, land("Basic Snow Land — Swamp", "Snow-Covered Swamp"));
    expect(blockProblem(s, s.objects[blocker]!, s.objects[b]!, opp)).toMatch(/snow swampwalk/i);
    // At the beginning of the next end step, back to its owner's hand.
    s = passUntil(s, "end", ap);
    s = settle(s, { me: [ap] });
    expect(zone(s, b)).toBe("hand");
  });

  it("bots pick the land type the most opponents control (a snow one for snow landwalk)", () => {
    const { s: s0, ap } = setup([]);
    handOf(s0, ap, []);
    const g = putOnBattlefield(s0, ap, guides());
    const b = putOnBattlefield(s0, ap, bears());
    const [o1, o2] = opponentsOf(s0, ap);
    putOnBattlefield(s0, o1!, land("Basic Snow Land — Island", "Snow-Covered Island"));
    putOnBattlefield(s0, o2!, land("Basic Snow Land — Island", "Snow-Covered Island"));
    putOnBattlefield(s0, o2!, land("Basic Land — Forest"));
    s0.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 1, G: 0, C: 2 };
    const s = settle(run(s0, planActivate(s0, ap, g, 0, [tgt(b)])));
    expect(walks(s, b)).toEqual(["Snow islandwalk"]);
  });
});

describe("Rage Extractor: a spell with {H} in its mana cost (CR 107.4f)", () => {
  it("deals damage equal to the mana value of a spell with Phyrexian mana, however it was paid, and not for other spells", () => {
    const { s: s0, ap, opp } = setup([]);
    const [d, b] = handOf(s0, ap, [dismember(), bears()]);
    putOnBattlefield(s0, ap, extractor());
    const victim = putOnBattlefield(s0, opp, giant());
    let s = castNow(s0, ap, b!);
    expect(s.triggerQueue.length + (s.pending?.kind === "chooseTargets" ? 1 : 0)).toBe(0);
    s = settle(s);
    const life = lifeOf(s, opp);
    s = castNow(s, ap, d!, [tgt(victim)]);
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind).toBe("chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [player(opp)] });
    s = settle(s);
    // Dismember's mana value is 3, each Phyrexian symbol counting 1.
    expect(lifeOf(s, opp)).toBe(life - 3);
  });
});

describe("Insubordination", () => {
  it("at its controller's end step, 2 damage unless the enchanted creature attacked this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    handOf(s0, ap, []);
    const b = putOnBattlefield(s0, opp, bears());
    attached(s0, ap, insub(), b);
    // Not at your own end step.
    let s = passUntil(s0, "end", ap);
    s = settle(s);
    const life = lifeOf(s, opp);
    s = passUntil(s, "end", opp);
    s = settle(s);
    expect(lifeOf(s, opp)).toBe(life - 2);
    // A turn in which it attacked: no damage.
    s = passUntil(s, "main1", opp);
    s.objects[b]!.attacked = { turn: s.turn, n: 1 };
    s = passUntil(s, "end", opp);
    s = settle(s);
    expect(lifeOf(s, opp)).toBe(life - 2);
  });
});

describe("Taunt", () => {
  it("during the target player's next turn, their creatures attack you if able, and not in later turns", () => {
    const { s: s0, ap, opp } = setup([]);
    const [t] = handOf(s0, ap, [taunt()]);
    const b = putOnBattlefield(s0, opp, bears());
    let s = settle(castNow(s0, ap, t!, [player(opp)]));
    // This turn isn't theirs: nothing yet.
    expect(s.attackPlayerNextTurn?.[0]).toMatchObject({ player: opp, attack: ap });
    s = passUntil(s, "declareAttackers", opp);
    const other = opponentsOf(s, opp).find((p) => p !== ap)!;
    expect(() => act(s, { type: "declareAttackers", player: opp, attacks: [] })).toThrow(/must attack/);
    expect(() => act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: b, defender: other }] })).toThrow(/must attack/);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: b, defender: ap }] });
    expect(s.objects[b]!.attacking).toBe(ap);
    // Their next turn after that: no requirement.
    s = passUntil(s, "main1", opp);
    s = passUntil(s, "declareAttackers", opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [] });
    expect(s.objects[b]!.attacking).toBeUndefined();
  });
});

describe("Gravegouger", () => {
  it("exiles up to two cards from one graveyard, and puts them back into their owner's graveyard when it leaves", () => {
    const { s: s0, ap, opp } = setup([]);
    const [g] = handOf(s0, ap, [gouger()]);
    const x = toZone(s0, opp, bears(), "graveyard");
    const y = toZone(s0, opp, giant(), "graveyard");
    let s = castNow(s0, ap, g!);
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind).toBe("chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(x), tgt(y)] }));
    expect([zone(s, x), zone(s, y)]).toEqual(["exile", "exile"]);
    const gid = onField(s, ap, "Gravegouger")[0]!;
    destroyPermanent(s, s.objects[gid]!, "test");
    closeZoneBatch(s);
    s = settle(s);
    expect([zone(s, x), zone(s, y)]).toEqual(["graveyard", "graveyard"]);
    expect(s.players[opp]!.graveyard).toEqual(expect.arrayContaining([x, y]));
  });
});

describe("Two target creatures controlled by the same player, one picked as it resolves (CR 608.2b, 608.2d)", () => {
  it("Retribution: the opponent sacrifices one of their choice and the other gets a -1/-1 counter", () => {
    const { s: s0, ap, opp } = setup([]);
    const [r] = handOf(s0, ap, [retribution()]);
    const a = putOnBattlefield(s0, opp, bears());
    const g = putOnBattlefield(s0, opp, giant());
    const other = putOnBattlefield(s0, opponentsOf(s0, ap)[1]!, bears());
    // Both must be one opponent's.
    expect(planCast(s0, ap, r!, [tgt(a), tgt(other)])).toBeNull();
    const s = settle(castNow(s0, ap, r!, [tgt(a), tgt(g)]));
    // The bot keeps its better creature.
    expect(zone(s, a)).toBe("graveyard");
    expect(counters(s, g, "-1/-1")).toBe(1);
  });

  it("Retribution: with one target gone, the other is the one sacrificed (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const [r] = handOf(s0, ap, [retribution()]);
    const a = putOnBattlefield(s0, opp, bears());
    const g = putOnBattlefield(s0, opp, giant());
    let s = castNow(s0, ap, r!, [tgt(a), tgt(g)]);
    destroyPermanent(s, s.objects[a]!, "test");
    closeZoneBatch(s);
    s = settle(s);
    expect(zone(s, g)).toBe("graveyard");
  });

  it("Barrin's Spite: their controller sacrifices one and the other returns to its owner's hand", () => {
    const { s: s0, ap, opp } = setup([]);
    const [r] = handOf(s0, ap, [spite()]);
    const a = putOnBattlefield(s0, opp, bears());
    const g = putOnBattlefield(s0, opp, giant());
    const s = settle(castNow(s0, ap, r!, [tgt(a), tgt(g)]));
    expect(zone(s, a)).toBe("graveyard");
    expect(zone(s, g)).toBe("hand");
  });

  it("Incriminate: that player sacrifices one of them of their choice", () => {
    const { s: s0, ap, opp } = setup([]);
    const [r] = handOf(s0, ap, [incriminate()]);
    const a = putOnBattlefield(s0, opp, bears());
    const g = putOnBattlefield(s0, opp, giant());
    const s = settle(castNow(s0, ap, r!, [tgt(a), tgt(g)]));
    expect(zone(s, a)).toBe("graveyard");
    expect(zone(s, g)).toBe("battlefield");
    expect(counters(s, g, "-1/-1")).toBe(0);
  });

  it("Cannibalize: you pick the one exiled, and the other gets two +1/+1 counters", () => {
    const { s: s0, ap, opp } = setup([]);
    const [r] = handOf(s0, ap, [cannibalize()]);
    const a = putOnBattlefield(s0, opp, bears());
    const g = putOnBattlefield(s0, opp, giant());
    let s = settle(castNow(s0, ap, r!, [tgt(a), tgt(g)]), { me: [ap] });
    const p = s.pending as Extract<PendingDecision, { kind: "chooseOption" }>;
    expect(p.player).toBe(ap);
    expect(p.what).toBe("splitTargets");
    expect(p.labels).toEqual(["Exile Grizzly Bears; put two +1/+1 counters on Hill Giant", "Exile Hill Giant; put two +1/+1 counters on Grizzly Bears"]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "1" }));
    expect(zone(s, g)).toBe("exile");
    expect(counters(s, a, "+1/+1")).toBe(2);
  });

  it("Trial of Agony: the opponent picks the one dealt 5 damage, and the other can't block this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const [r] = handOf(s0, ap, [agony()]);
    const a = putOnBattlefield(s0, opp, bears());
    const g = putOnBattlefield(s0, opp, giant());
    const s = settle(castNow(s0, ap, r!, [tgt(a), tgt(g)]));
    expect(zone(s, a)).toBe("graveyard");
    expect(zone(s, g)).toBe("battlefield");
    expect(characteristics(s, s.objects[g]!).cantBlock).toBe(true);
  });

  it("a bot whose creatures are the targets keeps the better one", () => {
    const { s: s0, ap, opp } = setup([]);
    // The opponent casts Barrin's Spite at our creatures; we (a bot here) pick.
    const [r] = handOf(s0, ap, [spite()]);
    const a = putOnBattlefield(s0, opp, bears());
    const g = putOnBattlefield(s0, opp, giant());
    let s = settle(castNow(s0, ap, r!, [tgt(g), tgt(a)]), { me: [opp] });
    const p = s.pending as Extract<PendingDecision, { kind: "chooseOption" }>;
    expect(p.player).toBe(opp);
    expect(p.options).toEqual(["0", "1"]);
    s = settle(s);
    expect(zone(s, a)).toBe("graveyard");
    expect(zone(s, g)).toBe("hand");
  });
});

describe("Ceaseless Searblades", () => {
  it("gets +1/+0 whenever you activate an ability of an Elemental, not of another creature or an opponent's Elemental", () => {
    const { s: s0, ap, opp } = setup([]);
    handOf(s0, ap, []);
    const sb = putOnBattlefield(s0, ap, searblades());
    const e = putOnBattlefield(s0, ap, elemental());
    const p = putOnBattlefield(s0, ap, pumper());
    s0.players[ap]!.manaPool.C = 3;
    let s = settle(run(s0, planActivate(s0, ap, p, 0, [])));
    expect(pt(s, sb)).toBe("2/4");
    s = settle(run(s, planActivate(s, ap, e, 0, [])));
    expect(pt(s, sb)).toBe("3/4");
    // Searblades is an Elemental itself, but has no ability to activate; an opponent's Elemental doesn't count.
    const oe = putOnBattlefield(s, opp, elemental());
    s.players[opp]!.manaPool.C = 1;
    s = priorityTo(s, opp);
    s = settle(run(s, planActivate(s, opp, oe, 0, [])));
    expect(pt(s, sb)).toBe("3/4");
  });
});

describe("Whirlwind, Killer Cyclone", () => {
  it("when creatures that entered this turn attack a player, target creature that player controls can't block", () => {
    const { s: s0, ap, opp } = setup([]);
    handOf(s0, ap, []);
    const w = putOnBattlefield(s0, ap, whirlwind());
    s0.objects[w]!.enteredTurn = s0.turn;
    const old = putOnBattlefield(s0, ap, bears());
    const blocker = putOnBattlefield(s0, opp, giant());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: w, defender: opp }, { attacker: old, defender: opp }] });
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind).toBe("chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(blocker)] }));
    expect(characteristics(s, s.objects[blocker]!).cantBlock).toBe(true);
  });

  it("doesn't trigger when only creatures that were already there attack", () => {
    const { s: s0, ap, opp } = setup([]);
    handOf(s0, ap, []);
    putOnBattlefield(s0, ap, whirlwind());
    const old = putOnBattlefield(s0, ap, bears());
    putOnBattlefield(s0, opp, giant());
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: old, defender: opp }] });
    expect(s.triggerQueue.length).toBe(0);
    expect(s.pending?.kind).not.toBe("chooseTargets");
  });
});
