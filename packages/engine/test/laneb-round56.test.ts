// Lane B, round 56: unsupported cards no earlier round wrote down, EDHREC rank about 19,800 to 17,000 (the ones B54 and B55 left), least played first
// (`npm run popular -- --least`).


import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, botActions, castProblem, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, moveObject, planActivate, power, toughness, planCast, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";
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
const at = (kind: string, pid: PlayerId) => (s: GameState) => s.pending?.kind === kind && s.pending.player === pid;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const spell = (s: GameState, id: string): TargetChoice => ({ kind: "stack", id: s.stack.find((x) => x.objectId === id)!.id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const nameOf = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}) => run(s, planCast(s, pid, id, targets, undefined, undefined, undefined, choices));
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
/** Passes to the declare attackers step of the active player's turn and declares `attackers` at `defender`; stops at the first question. */
const attackWith = (s: GameState, attackers: string[], defender: PlayerId) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  s = act(s, { type: "declareAttackers", player: s.activePlayer, attacks: attackers.map((attacker) => ({ attacker, defender })) });
  for (let i = 0; i < 50 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const toBlocks = (s: GameState) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
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
const counters = (s: GameState, id: string, kind = "+1/+1") => s.objects[id]!.counters?.[kind] ?? 0;
const answerMay = (s: GameState, pid: PlayerId, yes: boolean) => act(s, { type: "chooseMay", player: pid, yes });
/** Passes until `pid` is asked to choose targets for a trigger, then chooses `targets`. */
const triggerTargets = (s: GameState, pid: PlayerId, targets: TargetChoice[]) => {
  s = settle(s, at("chooseTargets", pid));
  expect(s.pending?.kind).toBe("chooseTargets");
  return act(s, { type: "chooseTargets", player: pid, targets } as Action);
};

// Real oracle text (Scryfall).
const cloudspireSkycycle = () => card("Cloudspire Skycycle", "Artifact — Vehicle", "{2}{R}{W}", { cmc: 4, colors: ["R", "W"], power: "2", toughness: "3", keywords: ["Flying", "Crew"], oracleText: "Flying\nWhen this Vehicle enters, distribute two +1/+1 counters among one or two other target Vehicles and/or creatures you control.\nCrew 1" });
const verazol = () => card("Verazol, the Split Current", "Legendary Creature — Serpent", "{X}{G}{U}", { cmc: 2, colors: ["G", "U"], power: "0", toughness: "0", oracleText: "Verazol enters with a +1/+1 counter on it for each mana spent to cast it.\nWhenever you cast a kicked spell, you may remove two +1/+1 counters from Verazol. If you do, copy that spell. You may choose new targets for the copy. (A copy of a permanent spell becomes a token.)" });
const keldonFirebombers = () => card("Keldon Firebombers", "Creature — Human Soldier", "{3}{R}{R}", { cmc: 5, colors: ["R"], power: "3", toughness: "3", oracleText: "When this creature enters, each player sacrifices all lands they control except for three." });
const kaya = () => card("Kaya, Bane of the Dead", "Legendary Planeswalker — Kaya", "{3}{W/B}{W/B}{W/B}", { cmc: 6, colors: ["B", "W"], loyalty: "7", oracleText: "Your opponents and permanents your opponents control with hexproof can be the targets of spells and abilities you control as though they didn't have hexproof.\n−3: Exile target creature." });
const angrath = () => card("Angrath, Minotaur Pirate", "Legendary Planeswalker — Angrath", "{4}{B}{R}", { cmc: 6, colors: ["B", "R"], loyalty: "5", oracleText: "+2: Angrath deals 1 damage to target opponent or planeswalker and each creature that player or that planeswalker's controller controls.\n−3: Return target Pirate card from your graveyard to the battlefield.\n−11: Destroy all creatures target opponent controls. Angrath deals damage to that player equal to their total power." });
const takeno = () => card("Takeno, Samurai General", "Legendary Creature — Human Samurai", "{5}{W}", { cmc: 6, colors: ["W"], power: "3", toughness: "3", keywords: ["Bushido"], oracleText: "Bushido 2 (Whenever this creature blocks or becomes blocked, it gets +2/+2 until end of turn.)\nEach other Samurai creature you control gets +1/+1 for each point of bushido it has." });
const tsabosWeb = () => card("Tsabo's Web", "Artifact", "{2}", { cmc: 2, colors: [], oracleText: "When this artifact enters, draw a card.\nEach land with an activated ability that isn't a mana ability doesn't untap during its controller's untap step." });
const ravagerWurm = () => card("Ravager Wurm", "Creature — Wurm", "{3}{R}{G}{G}", { cmc: 6, colors: ["G", "R"], power: "4", toughness: "5", keywords: ["Fight", "Riot"], oracleText: "Riot (This creature enters with your choice of a +1/+1 counter or haste.)\nWhen this creature enters, choose up to one —\n• This creature fights target creature you don't control.\n• Destroy target land with an activated ability that isn't a mana ability." });
const wreckHunter = () => card("Wreck Hunter", "Creature — Human Artificer", "{B}{B}", { cmc: 2, colors: ["B"], power: "2", toughness: "2", keywords: ["Flash"], oracleText: "Flash\nWhen this creature enters, choose target player. You create a tapped Powerstone token for each nonland card in that player's graveyard that was put there from the battlefield this turn. (It's an artifact with \"{T}: Add {C}. This mana can't be spent to cast a nonartifact spell.\")" });
const cantStayAway = () => card("Can't Stay Away", "Sorcery", "{W}{B}", { cmc: 2, colors: ["B", "W"], keywords: ["Flashback"], oracleText: "Return target creature card with mana value 3 or less from your graveyard to the battlefield. It gains \"If this creature would die, exile it instead.\"\nFlashback {3}{W}{B} (You may cast this card from your graveyard for its flashback cost. Then exile it.)" });
const korvold = () => card("Korvold, Gleeful Glutton", "Legendary Creature — Dragon Noble", "{5}{B}{R}{G}", { cmc: 8, colors: ["B", "G", "R"], power: "4", toughness: "4", keywords: ["Flying", "Haste", "Trample"], oracleText: "This spell costs {1} less to cast for each card type among permanents you've sacrificed this turn.\nFlying, trample, haste\nWhenever Korvold deals combat damage to a player, put X +1/+1 counters on Korvold and draw X cards, where X is the number of permanent types among cards in your graveyard." });
const aprilOneil = () => card("April O'Neil, Hacktivist", "Legendary Creature — Human Scientist", "{3}{U}", { cmc: 4, colors: ["U"], power: "1", toughness: "5", oracleText: "At the beginning of your end step, draw a card for each card type among spells you've cast this turn." });
const bioessenceHydra = () => card("Bioessence Hydra", "Creature — Hydra Mutant", "{3}{G}{U}", { cmc: 5, colors: ["G", "U"], power: "4", toughness: "4", keywords: ["Trample"], oracleText: "Trample\nThis creature enters with a +1/+1 counter on it for each loyalty counter on planeswalkers you control.\nWhenever one or more loyalty counters are put on planeswalkers you control, put that many +1/+1 counters on this creature." });
const confrontThePast = () => card("Confront the Past", "Sorcery — Lesson", "{X}{B}", { cmc: 1, colors: ["B"], oracleText: "Choose one —\n• Return target planeswalker card with mana value X or less from your graveyard to the battlefield.\n• Remove twice X loyalty counters from target planeswalker an opponent controls." });
const diminishingReturns = () => card("Diminishing Returns", "Sorcery", "{2}{U}{U}", { cmc: 4, colors: ["U"], oracleText: "Each player shuffles their hand and graveyard into their library. You exile the top ten cards of your library. Then each player draws up to seven cards." });
const teleminPerformance = () => card("Telemin Performance", "Sorcery", "{3}{U}{U}", { cmc: 5, colors: ["U"], oracleText: "Target opponent reveals cards from the top of their library until they reveal a creature card. That player puts all noncreature cards revealed this way into their graveyard, then you put the creature card onto the battlefield under your control." });
const rhino = () => card("Rhino, Terrible Trampler", "Legendary Creature — Human Villain", "{4}{G}{G}", { cmc: 6, colors: ["G"], power: "7", toughness: "6", keywords: ["Trample"], oracleText: "Trample\nWhen Rhino enters, destroy target artifact or land. Distribute three +1/+1 counters among up to three other target creatures. They gain trample until end of turn." });
const returnOfTheMoleMan = () => card("Return of the Mole Man", "Enchantment", "{1}{G}", { cmc: 2, colors: ["G"], keywords: ["Mill", "Landfall"], oracleText: "Landfall — Whenever a land you control enters, you may mill two cards.\n{5}{G}, Sacrifice this enchantment: Create X 1/1 green Minion creature tokens named Moloid, where X is the number of permanent cards in your graveyard. The tokens have \"Whenever this token attacks, you may mill a card.\" Activate only as a sorcery." });

// Test cards.
const vanilla = (name: string, typeLine: string, cost: string, cmc: number, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, cost, { cmc, power: String(p), toughness: String(t), ...extra });
const bearC = (name = "Plain Bear", p = 2, t = 2) => vanilla(name, "Creature — Bear", "{1}{G}", 2, p, t, { colors: ["G"] });
const opt = () => card("Test Opt", "Instant", "{U}", { cmc: 1, colors: ["U"], oracleText: "Draw a card." });
const trinket = (name = "Test Trinket") => card(name, "Artifact", "{1}", { cmc: 1, colors: [], oracleText: "" });
const golem = () => vanilla("Test Golem", "Artifact Creature — Golem", "{2}", 2, 2, 2, { colors: [] });
const walker = (name = "Test Walker", cmc = 3) => card(name, "Legendary Planeswalker — Jace", `{${cmc - 1}}{U}`, { cmc, colors: ["U"], loyalty: "3", oracleText: "+1: Draw a card." });
const murder = () => card("Test Murder", "Instant", "{1}{B}", { cmc: 2, colors: ["B"], oracleText: "Destroy target creature." });
const shatter = () => card("Test Shatter", "Instant", "{1}{R}", { cmc: 2, colors: ["R"], oracleText: "Destroy target artifact." });
const drain = () => card("Test Drain", "Sorcery", "{B}", { cmc: 1, colors: ["B"], oracleText: "Target player loses 2 life." });
const tokensNamed = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && controllerOf(s, s.objects[id]!) === pid && nameOf(s, id).replace(/ Token$/, "") === name);
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
const part = (id: string, amount: number): TargetChoice => ({ kind: "object", id, amount });
const none: TargetChoice = { kind: "none" };
const landsOf = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).types.includes("Land"));
const loyaltyIndex = (s: GameState, id: ObjectId, cost: number) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => a.loyalty === cost);
const walkerOn = (s: GameState, pid: PlayerId, def: CardDef, loyalty: number) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.counters.loyalty = loyalty;
  return id;
};

describe("Lane B round 56", () => {
  it("are fully supported", () => {
    supported(cloudspireSkycycle(), verazol(), keldonFirebombers(), kaya(), angrath(), takeno(), tsabosWeb(), ravagerWurm(), wreckHunter(), cantStayAway(), korvold(), aprilOneil(), bioessenceHydra(), confrontThePast(), diminishingReturns(), teleminPerformance(), rhino(), returnOfTheMoleMan());
  });

  it("Cloudspire Skycycle: two counters among one or two other Vehicles and/or creatures you control, never itself", () => {
    const { s: s0, ap, opp, ids } = setup([cloudspireSkycycle()]);
    const bear = putOnBattlefield(s0, ap, bearC());
    const cart = putOnBattlefield(s0, ap, card("Test Cart", "Artifact — Vehicle", "{1}", { cmc: 1, colors: [], power: "3", toughness: "3", oracleText: "Crew 1" }));
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseTargets", ap));
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => act(structuredClone(s), { type: "chooseTargets", player: ap, targets: [part(ids[0]!, 1), part(bear, 1)] })).toThrow();
    expect(() => act(structuredClone(s), { type: "chooseTargets", player: ap, targets: [part(theirs, 1), part(bear, 1)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [part(cart, 1), part(bear, 1)] }));
    expect([counters(s, cart), counters(s, bear), counters(s, ids[0]!)]).toEqual([1, 1, 0]);
  });

  it("Verazol: a +1/+1 counter for each mana spent to cast it; none when it isn't cast (rulings)", () => {
    const { s: s0, ap, ids } = setup([verazol()]);
    poolOnly(s0, ap, { G: 1, U: 1, C: 3 });
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, 3)));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(counters(s, ids[0]!)).toBe(5);
    expect(pt(s, ids[0]!)).toBe("5/5");
    // Put onto the battlefield without being cast: 0/0, so it dies.
    const t = structuredClone(s0);
    const id = toZone(t, ap, verazol(), "graveyard");
    moveObject(t, id, "battlefield");
    const u = settle(act(t, { type: "passPriority", player: waitingOn(t)! }));
    expect(counters(u, id)).toBe(0);
    expect(u.players[ap]!.graveyard.some((g) => nameOf(u, g) === "Verazol, the Split Current")).toBe(true);
  });

  it("Keldon Firebombers: each player keeps three lands of their choice and sacrifices the rest", () => {
    const { s: s0, ap, opp, ids } = setup([keldonFirebombers()]);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(opp) + 1) % 4]!;
    for (let i = 0; i < 5; i++) putOnBattlefield(s0, opp, card(`Opp Land ${i}`, "Land"));
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, third, card(`Third Land ${i}`, "Land"));
    expect(landsOf(s0, ap).length).toBe(14);
    const s = settle(castNow(s0, ap, ids[0]!));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(landsOf(s, ap).length).toBe(3);
    expect(landsOf(s, opp).length).toBe(3);
    expect(landsOf(s, third).length).toBe(2);
    expect(s.players[opp]!.graveyard.filter((id) => /^Opp Land/.test(nameOf(s, id))).length).toBe(2);
  });

  it("Kaya, Bane of the Dead: opponents and their permanents with hexproof can be your targets; not anyone else's", () => {
    const { s: s0, ap, opp, ids } = setup([shatter(), drain()]);
    const relic = putOnBattlefield(s0, opp, card("Hexproof Relic", "Artifact", "{2}", { cmc: 2, colors: [], keywords: ["Hexproof"], oracleText: "Hexproof" }));
    putOnBattlefield(s0, opp, card("Test Leyline", "Enchantment", "{2}{W}{W}", { cmc: 4, colors: ["W"], oracleText: "You have hexproof." }));
    expect(planCast(s0, ap, ids[0]!, [tgt(relic)])).toBeNull();
    expect(planCast(s0, ap, ids[1]!, [ply(opp)])).toBeNull();
    const s = structuredClone(s0);
    walkerOn(s, ap, kaya(), 7);
    expect(planCast(s, ap, ids[0]!, [tgt(relic)])).not.toBeNull();
    expect(planCast(s, ap, ids[1]!, [ply(opp)])).not.toBeNull();
    const t = settle(castNow(s, ap, ids[0]!, [tgt(relic)]));
    expect(zone(t, relic)).toBe("graveyard");
    // An opponent's Kaya doesn't help you.
    const u = structuredClone(s0);
    walkerOn(u, opp, kaya(), 7);
    expect(planCast(u, ap, ids[0]!, [tgt(relic)])).toBeNull();
  });

  it("Angrath, Minotaur Pirate: −11 destroys the opponent's creatures and deals their total power, an indestructible one's too (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const angr = walkerOn(s0, ap, angrath(), 11);
    const bears = [putOnBattlefield(s0, opp, bearC("Bear A", 2, 2)), putOnBattlefield(s0, opp, bearC("Bear B", 3, 3))];
    const wall = putOnBattlefield(s0, opp, vanilla("Indestructible Test", "Creature — Golem", "{4}", 4, 4, 4, { colors: [], keywords: ["Indestructible"], oracleText: "Indestructible" }));
    const mine = putOnBattlefield(s0, ap, bearC("My Bear", 5, 5));
    const s = settle(run(s0, planActivate(s0, ap, angr, loyaltyIndex(s0, angr, -11), [ply(opp)])));
    expect(bears.map((id) => zone(s, id))).toEqual(["graveyard", "graveyard"]);
    expect(zone(s, wall)).toBe("battlefield");
    expect(zone(s, mine)).toBe("battlefield");
    expect(life(s, opp)).toBe(40 - 9);
  });

  it("Takeno, Samurai General: each other Samurai you control gets +1/+1 for each point of bushido it has", () => {
    const { s } = setup([]);
    const ap = s.activePlayer;
    const tk = putOnBattlefield(s, ap, takeno());
    const sam = putOnBattlefield(s, ap, vanilla("Test Samurai", "Creature — Human Samurai", "{1}{W}", 2, 2, 2, { colors: ["W"], keywords: ["Bushido"], oracleText: "Bushido 2" }));
    const plain = putOnBattlefield(s, ap, vanilla("Plain Samurai", "Creature — Human Samurai", "{1}{W}", 2, 2, 2, { colors: ["W"] }));
    const notSam = putOnBattlefield(s, ap, vanilla("Bushido Bear", "Creature — Bear", "{1}{G}", 2, 2, 2, { colors: ["G"], keywords: ["Bushido"], oracleText: "Bushido 1" }));
    expect([pt(s, tk), pt(s, sam), pt(s, plain), pt(s, notSam)]).toEqual(["3/3", "4/4", "2/2", "2/2"]);
  });

  it("Tsabo's Web: lands with an activated ability that isn't a mana ability don't untap; others do", () => {
    const { s: s0, ap, opp, ids } = setup([tsabosWeb()]);
    const factory = putOnBattlefield(s0, opp, card("Test Factory", "Land", "", { oracleText: "{T}: Add {C}.\n{1}, {T}: Draw a card." }));
    const plainLand = putOnBattlefield(s0, opp, card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." }));
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    s.objects[factory]!.tapped = true;
    s.objects[plainLand]!.tapped = true;
    s = goUntil(s, (x) => x.activePlayer === opp && x.step === "main1");
    expect(s.objects[factory]!.tapped).toBe(true);
    expect(s.objects[plainLand]!.tapped).toBe(false);
  });

  it("Ravager Wurm: up to one mode; destroying a land with an activated ability that isn't a mana ability", () => {
    const { s: s0, ap, opp, ids } = setup([ravagerWurm()]);
    const factory = putOnBattlefield(s0, opp, card("Test Factory", "Land", "", { oracleText: "{T}: Add {C}.\n{1}, {T}: Draw a card." }));
    const plainLand = putOnBattlefield(s0, opp, card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." }));
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseModes", ap));
    expect(s.pending).toMatchObject({ kind: "chooseModes", min: 0, max: 1 });
    const skip = settle(act(structuredClone(s), { type: "chooseModes", player: ap, modes: [] }));
    expect(zone(skip, factory)).toBe("battlefield");
    s = act(s, { type: "chooseModes", player: ap, modes: [1] });
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => act(structuredClone(s), { type: "chooseTargets", player: ap, targets: [tgt(plainLand)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(factory)] }));
    expect(zone(s, factory)).toBe("graveyard");
    expect(zone(s, plainLand)).toBe("battlefield");
  });

  it("Wreck Hunter: a tapped Powerstone for each nonland card put into that player's graveyard from the battlefield this turn", () => {
    const { s: s0, ap, opp, ids } = setup([wreckHunter()]);
    const gone = [putOnBattlefield(s0, opp, bearC("Their Bear")), putOnBattlefield(s0, opp, trinket())];
    const land = putOnBattlefield(s0, opp, card("Opp Land", "Land"));
    for (const id of [...gone, land]) moveObject(s0, id, "graveyard");
    toZone(s0, opp, bearC("Discarded Bear"), "graveyard");
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseTargets", ap));
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [ply(opp)] }));
    const stones = tokensNamed(s, ap, "Powerstone");
    expect(stones.length).toBe(2);
    expect(stones.every((id) => s.objects[id]!.tapped)).toBe(true);
  });

  it("Can't Stay Away: returns a creature card with mana value 3 or less, which is exiled if it would die", () => {
    const { s: s0, ap, opp, ids } = setup([cantStayAway(), murder()]);
    const bear = toZone(s0, ap, bearC("Old Bear"), "graveyard");
    const big = toZone(s0, ap, vanilla("Big Thing", "Creature — Beast", "{3}{G}", 4, 4, 4, { colors: ["G"] }), "graveyard");
    expect(planCast(s0, ap, ids[0]!, [tgt(big)])).toBeNull();
    expect(planCast(s0, ap, ids[0]!, [tgt(bear)])).not.toBeNull();
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(bear)]));
    expect(zone(s, bear)).toBe("battlefield");
    expect(zone(s, ids[0]!)).toBe("graveyard");
    s = settle(castNow(s, ap, ids[1]!, [tgt(bear)]));
    expect(s.players[ap]!.exile.some((id) => nameOf(s, id) === "Old Bear")).toBe(true);
    expect(s.players[ap]!.graveyard.some((id) => nameOf(s, id) === "Old Bear")).toBe(false);
    // Another creature still dies normally.
    const other = putOnBattlefield(s, opp, bearC("Their Bear"));
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, B: 2 };
    s = settle(castNow(s, ap, toZone(s, ap, murder(), "hand"), [tgt(other)]));
    expect(zone(s, other)).toBe("graveyard");
  });

  it("Korvold, Gleeful Glutton: {1} less for each card type among permanents you've sacrificed this turn", () => {
    const { s: s0, ap, ids } = setup([korvold()]);
    const altar = putOnBattlefield(s0, ap, card("Test Altar", "Artifact", "{1}", { cmc: 1, colors: [], oracleText: "Sacrifice a permanent: You gain 1 life." }));
    const fodder = [putOnBattlefield(s0, ap, golem()), putOnBattlefield(s0, ap, bearC("Fodder Bear")), putOnBattlefield(s0, ap, card("Fodder Land", "Land"))];
    let s = s0;
    for (const f of fodder) s = settle(run(s, planActivate(s, ap, altar, 0, [], undefined, undefined, undefined, { sacrifice: [f] })));
    // Artifact, creature and land: three types, not four though four permanents' worth of types were there.
    poolOnly(s, ap, { B: 1, R: 1, G: 1, C: 2 });
    expect(planCast(s, ap, ids[0]!)).not.toBeNull();
    const t = structuredClone(s);
    t.players[ap]!.manaPool = { B: 1, R: 1, G: 1, C: 1 } as typeof t.players[typeof ap]["manaPool"];
    expect(planCast(t, ap, ids[0]!)).toBeNull();
  });

  it("Korvold, Gleeful Glutton: X is the number of permanent types among cards in your graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, korvold());
    for (const d of [golem(), bearC("Yard Bear"), card("Yard Land", "Land"), opt()]) toZone(s0, ap, d, "graveyard");
    onlyHand(s0, ap, []);
    let s = attackWith(s0, [k], opp);
    s = goUntil(s, (x) => x.step === "end" || x.stack.length > 0 && x.step === "combatDamage");
    s = settle(s);
    // Artifact, creature, land: 3 (instant isn't a permanent type).
    expect(counters(s, k)).toBe(3);
    expect(s.players[ap]!.hand.length).toBe(3);
  });

  it("April O'Neil, Hacktivist: at your end step, a card for each card type among spells you've cast this turn", () => {
    const { s: s0, ap, ids } = setup([opt(), golem()]);
    putOnBattlefield(s0, ap, aprilOneil());
    let s = settle(castNow(s0, ap, ids[0]!));
    s = settle(castNow(s, ap, ids[1]!));
    onlyHand(s, ap, []);
    s = goUntil(s, (x) => x.step === "end" && x.stack.length > 0);
    s = settle(s);
    // Instant, artifact, creature.
    expect(s.players[ap]!.hand.length).toBe(3);
  });

  it("Bioessence Hydra: enters with a counter for each loyalty counter; grows as loyalty counters are put on your planeswalkers", () => {
    const { s: s0, ap, ids } = setup([bioessenceHydra(), walker("Second Walker")]);
    const w = walkerOn(s0, ap, walker(), 3);
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(counters(s, ids[0]!)).toBe(3);
    s = settle(run(s, planActivate(s, ap, w, loyaltyIndex(s, w, 1))));
    expect(counters(s, w, "loyalty")).toBe(4);
    expect(counters(s, ids[0]!)).toBe(4);
    // A planeswalker entering with loyalty counters (rulings).
    s = settle(castNow(s, ap, ids[1]!));
    expect(counters(s, ids[0]!)).toBe(7);
  });

  it("Confront the Past: returns a planeswalker card with mana value X or less, or removes twice X loyalty counters", () => {
    const { s: s0, ap, opp, ids } = setup([confrontThePast()]);
    const small = toZone(s0, ap, walker("Small Walker", 3), "graveyard");
    const large = toZone(s0, ap, walker("Large Walker", 5), "graveyard");
    expect(planCast(s0, ap, ids[0]!, [tgt(large)], [0], undefined, 3)).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(small)], [0], undefined, 3)));
    expect(zone(s, small)).toBe("battlefield");
    const { s: t0, ap: ap2, opp: opp2, ids: ids2 } = setup([confrontThePast()]);
    const theirs = walkerOn(t0, opp2, walker("Their Walker"), 7);
    const t = settle(run(t0, planCast(t0, ap2, ids2[0]!, [tgt(theirs)], [1], undefined, 2)));
    expect(counters(t, theirs, "loyalty")).toBe(3);
    expect(opp).toBe(opp2);
  });

  it("Diminishing Returns: hands and graveyards shuffled in, ten of yours exiled, then each player draws up to seven", () => {
    const { s: s0, ap, ids } = setup([diminishingReturns()]);
    toZone(s0, ap, bearC("Yard Bear"), "graveyard");
    const exiled = s0.players[ap]!.exile.length;
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseOption", ap));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "drawUpTo" });
    expect(s.players[ap]!.exile.length).toBe(exiled + 10);
    expect(s.players[ap]!.hand.length).toBe(0);
    expect(s.players[ap]!.graveyard.filter((id) => nameOf(s, id) === "Yard Bear").length).toBe(0);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "4" }));
    expect(s.players[ap]!.hand.length).toBe(4);
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });

  it("Telemin Performance: the opponent's noncreature cards revealed go to their graveyard, the creature card onto your battlefield", () => {
    const { s: s0, ap, opp, ids } = setup([teleminPerformance()]);
    const creature = toZone(s0, opp, bearC("Their Top Bear"), "library");
    const spellCard = toZone(s0, opp, opt(), "library");
    const landCard = toZone(s0, opp, card("Opp Land", "Land"), "library");
    const s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]));
    expect(zone(s, creature)).toBe("battlefield");
    expect(controllerOf(s, s.objects[creature]!)).toBe(ap);
    expect([zone(s, spellCard), zone(s, landCard)]).toEqual(["graveyard", "graveyard"]);
  });

  it("Rhino, Terrible Trampler: three counters among up to three other target creatures, which gain trample", () => {
    const { s: s0, ap, opp, ids } = setup([rhino()]);
    const relic = putOnBattlefield(s0, opp, trinket("Their Trinket"));
    const [a, b] = [putOnBattlefield(s0, ap, bearC("Bear A")), putOnBattlefield(s0, opp, bearC("Bear B"))];
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseTargets", ap));
    expect(() => act(structuredClone(s), { type: "chooseTargets", player: ap, targets: [tgt(relic), part(ids[0]!, 1), part(a, 2), none] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(relic), part(a, 2), part(b, 1), none] }));
    expect(zone(s, relic)).toBe("graveyard");
    expect([counters(s, a), counters(s, b), counters(s, ids[0]!)]).toEqual([2, 1, 0]);
    expect(characteristics(s, s.objects[b]!).keywords).toContain("Trample");
  });

  it("Return of the Mole Man: X Moloids, X counted with itself in the graveyard; each has the attack-mill ability", () => {
    const { s: s0, ap } = setup([]);
    const mm = putOnBattlefield(s0, ap, returnOfTheMoleMan());
    for (const d of [bearC("Yard Bear"), card("Yard Land", "Land"), opt()]) toZone(s0, ap, d, "graveyard");
    const s = settle(run(s0, planActivate(s0, ap, mm, 0)));
    expect(zone(s, mm)).toBe("graveyard");
    const moloids = tokensNamed(s, ap, "Moloid");
    expect(moloids.length).toBe(3);
    expect(pt(s, moloids[0]!)).toBe("1/1");
    expect(abilitiesOf(s, s.objects[moloids[0]!]!).triggers.some((t) => t.event === "selfAttacks")).toBe(true);
  });
});
