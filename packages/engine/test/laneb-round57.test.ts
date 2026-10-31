// Lane B, round 57: unsupported cards no earlier round wrote down, EDHREC rank about 19,800 to 15,000, least played first
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
const creakwoodSafewright = () => card("Creakwood Safewright", "Creature — Elf Warrior", "{1}{B}", { cmc: 2, colors: ["B"], power: "5", toughness: "5", oracleText: "This creature enters with three -1/-1 counters on it.\nAt the beginning of your end step, if there is an Elf card in your graveyard and this creature has a -1/-1 counter on it, remove a -1/-1 counter from this creature." });
const samuraiOfThePaleCurtain = () => card("Samurai of the Pale Curtain", "Creature — Fox Samurai", "{W}{W}", { cmc: 2, colors: ["W"], power: "2", toughness: "2", keywords: ["Bushido"], oracleText: "Bushido 1 (Whenever this creature blocks or becomes blocked, it gets +1/+1 until end of turn.)\nIf a permanent would be put into a graveyard, exile it instead." });
const chromeCourier = () => card("Chrome Courier", "Artifact Creature — Thopter", "{1}{W}{U}", { cmc: 3, colors: ["U","W"], power: "1", toughness: "1", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, reveal the top two cards of your library. Put one of them into your hand and the other into your graveyard. If you put an artifact card into your hand this way, you gain 3 life." });
const silvanReveler = () => card("Silvan Reveler", "Creature — Elf Citizen", "{2}{G}{U}", { cmc: 4, colors: ["G","U"], power: "3", toughness: "2", keywords: ["Landfall"], oracleText: "When this creature enters, draw a card, then discard a card. If you discard a land card this way, put it from your graveyard onto the battlefield tapped.\nLandfall — Whenever a land you control enters, you may pay {1}{G}{U}. If you do, return this card from your graveyard to your hand." });
const dragonsPrey = () => card("Dragon's Prey", "Instant", "{2}{B}", { cmc: 3, colors: ["B"], oracleText: "This spell costs {2} more to cast if it targets a Dragon.\nDestroy target creature." });
const championsOfTheShoal = () => card("Champions of the Shoal", "Creature — Merfolk Soldier", "{3}{U}", { cmc: 4, colors: ["U"], power: "4", toughness: "6", keywords: ["Behold"], oracleText: "As an additional cost to cast this spell, behold a Merfolk and exile it. (Exile a Merfolk you control or a Merfolk card from your hand.)\nWhenever this creature enters or becomes tapped, tap up to one target creature and put a stun counter on it.\nWhen this creature leaves the battlefield, return the exiled card to its owner's hand." });
const shackleSlinger = () => card("Shackle Slinger", "Creature — Human Soldier", "{2}{U}", { cmc: 3, colors: ["U"], power: "3", toughness: "2", oracleText: "Whenever you cast your second spell each turn, choose target creature an opponent controls. If it's tapped, put a stun counter on it. Otherwise, tap it. (If a permanent with a stun counter would become untapped, remove one from it instead.)" });
const atomicMicrosizer = () => card("Atomic Microsizer", "Artifact — Equipment", "{U}", { cmc: 1, colors: ["U"], keywords: ["Equip"], oracleText: "Equipped creature gets +1/+0.\nWhenever equipped creature attacks, choose up to one target creature. That creature can't be blocked this turn and has base power and toughness 1/1 until end of turn.\nEquip {2}" });
const awakenTheSleeper = () => card("Awaken the Sleeper", "Sorcery", "{3}{R}", { cmc: 4, colors: ["R"], oracleText: "Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn. If it's equipped, you may destroy all Equipment attached to that creature." });
const sorcerersWand = () => card("Sorcerer's Wand", "Artifact — Equipment", "{1}", { cmc: 1, colors: [], keywords: ["Equip"], oracleText: "Equipped creature has \"{T}: This creature deals 1 damage to target player or planeswalker. If this creature is a Wizard, it deals 2 damage instead.\"\nEquip {3}" });
const perrie = () => card("Perrie, the Pulverizer", "Legendary Creature — Rhino Soldier", "{1}{G}{W}{U}", { cmc: 4, colors: ["G","U","W"], power: "3", toughness: "3", oracleText: "When Perrie enters, put a shield counter on target creature. (If it would be dealt damage or destroyed, remove a shield counter from it instead.)\nWhenever Perrie attacks, target creature you control gains trample and gets +X/+X until end of turn, where X is the number of different kinds of counters among permanents you control." });
const mentorsGuidance = () => card("Mentor's Guidance", "Sorcery", "{2}{U}", { cmc: 3, colors: ["U"], keywords: ["Scry"], oracleText: "When you cast this spell, copy it if you control a planeswalker, Cleric, Druid, Shaman, Warlock, or Wizard.\nScry 1, then draw a card." });
const sapphireCharm = () => card("Sapphire Charm", "Instant", "{U}", { cmc: 1, colors: ["U"], oracleText: "Choose one —\n• Target player draws a card at the beginning of the next turn's upkeep.\n• Target creature gains flying until end of turn.\n• Target creature an opponent controls phases out. (While it's phased out, it's treated as though it doesn't exist. It phases in before its controller untaps during their next untap step.)" });
const misterHyde = () => card("Mister Hyde, Monster Within", "Legendary Creature — Human Villain", "{2}{G}", { cmc: 3, colors: ["G"], power: "2", toughness: "2", oracleText: "At the beginning of your upkeep, choose one —\n• Put a +1/+1 counter on Mister Hyde.\n• Remove a counter from a creature you control. If you do, draw a card." });
const triumphOfGerrard = () => card("Triumph of Gerrard", "Enchantment — Saga", "{1}{W}", { cmc: 2, colors: ["W"], oracleText: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II — Put a +1/+1 counter on target creature you control with the greatest power.\nIII — Target creature you control with the greatest power gains flying, first strike, and lifelink until end of turn." });
const firstResponder = () => card("First Responder", "Creature — Ogre Citizen", "{3}{G}", { cmc: 4, colors: ["G"], power: "3", toughness: "3", keywords: ["Vigilance"], oracleText: "Vigilance\nAt the beginning of your end step, you may return another creature you control to its owner's hand, then put a number of +1/+1 counters equal to that creature's power on this creature." });
const pathwayArrows = () => card("Pathway Arrows", "Artifact — Equipment", "{1}", { cmc: 1, colors: [], keywords: ["Equip"], oracleText: "Equipped creature has \"{2}, {T}: This creature deals 1 damage to target creature. If a colorless creature is dealt damage this way, tap it.\"\nEquip {2}" });

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

const elfCard = () => vanilla("Test Elf", "Creature — Elf", "{G}", 1, 1, 1, { colors: ["G"] });
const equipOn = (s: GameState, eq: string, host: string) => {
  s.objects[eq]!.attachedTo = host;
  invalidateCharacteristics(s);
};

describe("Lane B round 57", () => {
  it("are fully supported", () => {
    supported(creakwoodSafewright(), samuraiOfThePaleCurtain(), chromeCourier(), silvanReveler(), dragonsPrey(), championsOfTheShoal(), shackleSlinger(), atomicMicrosizer(), awakenTheSleeper(), sorcerersWand(), perrie(), mentorsGuidance(), sapphireCharm(), misterHyde(), triumphOfGerrard(), firstResponder(), pathwayArrows());
  });

  it("Creakwood Safewright: removes a -1/-1 counter at your end step only with an Elf card in your graveyard and a counter on it", () => {
    const { s: s0, ap, ids } = setup([creakwoodSafewright()]);
    onlyHand(s0, ap, ids);
    const s1 = settle(castNow(s0, ap, ids[0]!));
    expect(counters(s1, ids[0]!, "-1/-1")).toBe(3);
    expect(pt(s1, ids[0]!)).toBe("2/2");
    const toEnd = (s: GameState) => settle(goUntil(s, (x) => x.step === "end" && x.activePlayer === ap));
    // No Elf card in your graveyard: nothing.
    expect(counters(toEnd(structuredClone(s1)), ids[0]!, "-1/-1")).toBe(3);
    // An Elf card in an opponent's graveyard doesn't count.
    const t = structuredClone(s1);
    toZone(t, t.turnOrder[(t.turnOrder.indexOf(ap) + 1) % 4]!, elfCard(), "graveyard");
    expect(counters(toEnd(t), ids[0]!, "-1/-1")).toBe(3);
    // An Elf card in yours: one counter off.
    const u = structuredClone(s1);
    toZone(u, ap, elfCard(), "graveyard");
    const v = toEnd(u);
    expect(counters(v, ids[0]!, "-1/-1")).toBe(2);
    expect(pt(v, ids[0]!)).toBe("3/3");
    // No -1/-1 counter left: the ability doesn't trigger (CR 603.4).
    const w = structuredClone(s1);
    toZone(w, ap, elfCard(), "graveyard");
    w.objects[ids[0]!]!.counters["-1/-1"] = 0;
    invalidateCharacteristics(w);
    const x = toEnd(w);
    expect(counters(x, ids[0]!, "-1/-1")).toBe(0);
  });

  it("Samurai of the Pale Curtain: permanents going to any graveyard are exiled instead, itself too; spells aren't", () => {
    const { s: s0, ap, opp, ids } = setup([murder(), murder()]);
    const samurai = putOnBattlefield(s0, ap, samuraiOfThePaleCurtain());
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(theirs)]));
    expect(zone(s, theirs)).toBe("exile");
    expect(s.players[opp]!.exile).toContain(theirs);
    // The spell itself isn't a permanent: to the graveyard.
    expect(zone(s, ids[0]!)).toBe("graveyard");
    s = settle(castNow(s, ap, ids[1]!, [tgt(samurai)]));
    expect(zone(s, samurai)).toBe("exile");
    // Gone, it does nothing: a creature dies again.
    const bear2 = putOnBattlefield(s, opp, bearC("Second Bear"));
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const t = structuredClone(s);
    t.objects[bear2]!.damage = 5;
    invalidateCharacteristics(t);
    const u = settle(act(t, { type: "passPriority", player: waitingOn(t)! }));
    expect(zone(u, bear2)).toBe("graveyard");
  });

  it("Chrome Courier: one of the top two into your hand, the other into your graveyard; 3 life only if it's an artifact card", () => {
    const { s: s0, ap, ids } = setup([chromeCourier()]);
    const art = toZone(s0, ap, trinket(), "library");
    const land = toZone(s0, ap, card("Test Land", "Land"), "library");
    const s1 = settle(castNow(s0, ap, ids[0]!), at("searchLibrary", ap));
    expect(s1.pending?.kind).toBe("searchLibrary");
    const before = life(s1, ap);
    const a = settle(act(structuredClone(s1), { type: "searchLibrary", player: ap, found: [art] } as Action));
    expect([zone(a, art), zone(a, land)]).toEqual(["hand", "graveyard"]);
    expect(life(a, ap)).toBe(before + 3);
    const b = settle(act(structuredClone(s1), { type: "searchLibrary", player: ap, found: [land] } as Action));
    expect([zone(b, land), zone(b, art)]).toEqual(["hand", "graveyard"]);
    expect(life(b, ap)).toBe(before);
  });

  it("Silvan Reveler: draw, then discard; a land card discarded this way enters tapped", () => {
    const { s: s0, ap, ids } = setup([silvanReveler(), opt()]);
    onlyHand(s0, ap, ids);
    const top = toZone(s0, ap, card("Test Land", "Land"), "library");
    const s1 = settle(castNow(s0, ap, ids[0]!), at("discard", ap));
    expect(zone(s1, top)).toBe("hand");
    expect(s1.pending?.kind).toBe("discard");
    const a = settle(act(structuredClone(s1), { type: "discard", player: ap, objectIds: [top] }));
    expect(zone(a, top)).toBe("battlefield");
    expect(a.objects[top]!.tapped).toBe(true);
    expect(controllerOf(a, a.objects[top]!)).toBe(ap);
    // A nonland card: it stays in the graveyard, and the land stays in hand.
    const b = settle(act(structuredClone(s1), { type: "discard", player: ap, objectIds: [ids[1]!] }));
    expect(zone(b, ids[1]!)).toBe("graveyard");
    expect(zone(b, top)).toBe("hand");
  });

  it("Dragon's Prey: {2} more if it targets a Dragon", () => {
    const { s: s0, ap, opp, ids } = setup([dragonsPrey()]);
    const dragon = putOnBattlefield(s0, opp, vanilla("Test Dragon", "Creature — Dragon", "{4}{R}", 5, 4, 4, { colors: ["R"] }));
    const bear = putOnBattlefield(s0, opp, bearC());
    poolOnly(s0, ap, { B: 1, C: 2 });
    expect(planCast(s0, ap, ids[0]!, [tgt(dragon)])).toBeNull();
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(bear)]));
    expect(zone(s, bear)).toBe("graveyard");
    const t = structuredClone(s0);
    t.players[ap]!.manaPool = { ...t.players[ap]!.manaPool, C: 4 };
    const u = settle(castNow(t, ap, ids[0]!, [tgt(dragon)]));
    expect(zone(u, dragon)).toBe("graveyard");
  });

  it("Champions of the Shoal: tap up to one target creature and stun it when it enters and whenever it becomes tapped", () => {
    const { s: s0, ap, opp, ids } = setup([championsOfTheShoal()]);
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    const theirs2 = putOnBattlefield(s0, opp, bearC("Other Bear"));
    const merfolk = putOnBattlefield(s0, ap, vanilla("Test Merfolk", "Creature — Merfolk", "{U}", 1, 1, 1, { colors: ["U"] }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, undefined, { reveal: [merfolk] })), at("chooseTargets", ap));
    expect(s.pending?.kind).toBe("chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(theirs)] }));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.objects[theirs]!.tapped).toBe(true);
    expect(counters(s, theirs, "stun")).toBe(1);
    // Attacking taps it: it triggers again.
    s.objects[ids[0]!]!.controlledSinceTurn = -1;
    s = attackWith(s, [ids[0]!], opp);
    s = settle(s, at("chooseTargets", ap));
    expect(s.pending?.kind).toBe("chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(theirs2)] }));
    expect(s.objects[theirs2]!.tapped).toBe(true);
    expect(counters(s, theirs2, "stun")).toBe(1);
  });

  it("Shackle Slinger: your second spell each turn taps an untapped creature, or stuns a tapped one", () => {
    const { s: s0, ap, opp, ids } = setup([opt(), opt(), opt()]);
    putOnBattlefield(s0, ap, shackleSlinger());
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(s.pending).toBeFalsy();
    s = castNow(s, ap, ids[1]!);
    s = settle(s, at("chooseTargets", ap));
    expect(s.pending?.kind).toBe("chooseTargets");
    const tap = settle(act(structuredClone(s), { type: "chooseTargets", player: ap, targets: [tgt(theirs)] }));
    expect(tap.objects[theirs]!.tapped).toBe(true);
    expect(counters(tap, theirs, "stun")).toBe(0);
    // A third spell: no trigger.
    const third = settle(castNow(tap, ap, ids[2]!));
    expect(counters(third, theirs, "stun")).toBe(0);
    // Already tapped: a stun counter instead.
    const t = structuredClone(s);
    t.objects[theirs]!.tapped = true;
    const stun = settle(act(t, { type: "chooseTargets", player: ap, targets: [tgt(theirs)] }));
    expect(stun.objects[theirs]!.tapped).toBe(true);
    expect(counters(stun, theirs, "stun")).toBe(1);
  });

  it("Atomic Microsizer: up to one target creature can't be blocked this turn and has base power and toughness 1/1", () => {
    const { s: s0, ap, opp } = setup([]);
    const bear = putOnBattlefield(s0, ap, bearC());
    const ogre = putOnBattlefield(s0, ap, vanilla("Test Ogre", "Creature — Ogre", "{3}{R}", 4, 4, 4, { colors: ["R"] }));
    const eq = putOnBattlefield(s0, ap, atomicMicrosizer());
    equipOn(s0, eq, bear);
    const wall = putOnBattlefield(s0, opp, vanilla("Test Wall", "Creature — Wall", "{1}{W}", 2, 0, 5, { colors: ["W"] }));
    expect(pt(s0, bear)).toBe("3/2");
    let s = attackWith(s0, [bear, ogre], opp);
    s = settle(s, at("chooseTargets", ap));
    expect(s.pending?.kind).toBe("chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(ogre)] }));
    expect(pt(s, ogre)).toBe("1/1");
    s = toBlocks(s);
    expect(() => act(structuredClone(s), { type: "declareBlockers", player: opp, blocks: [{ blocker: wall, attacker: ogre }] })).toThrow();
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: wall, attacker: bear }] });
    expect(s.objects[wall]!.blocking).toBeTruthy();
    // It lasts until end of turn.
    const t = goUntil(s, (x) => x.step === "cleanup" || (x.activePlayer !== ap && x.step === "upkeep"));
    const u = goUntil(t, (x) => x.activePlayer !== ap);
    expect(pt(u, ogre)).toBe("4/4");
  });

  it("Awaken the Sleeper: threaten, then you may destroy the Equipment attached to it; no question when it isn't equipped", () => {
    const { s: s0, ap, opp, ids } = setup([awakenTheSleeper()]);
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    s0.objects[theirs]!.tapped = true;
    const sword = putOnBattlefield(s0, opp, card("Test Sword", "Artifact — Equipment", "{2}", { cmc: 2, colors: [], keywords: ["Equip"], oracleText: "Equipped creature gets +2/+0.\nEquip {2}" }));
    equipOn(s0, sword, theirs);
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(theirs)]), at("chooseMay", ap));
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
    expect(s.objects[theirs]!.tapped).toBe(false);
    expect(s.pending?.kind).toBe("chooseMay");
    const yes = settle(answerMay(structuredClone(s), ap, true));
    expect(zone(yes, sword)).toBe("graveyard");
    const no = settle(answerMay(s, ap, false));
    expect(zone(no, sword)).toBe("battlefield");
    // Not equipped: no question.
    const t = structuredClone(s0);
    const other = putOnBattlefield(t, opp, bearC("Other Bear"));
    const u = settle(castNow(t, ap, ids[0]!, [tgt(other)]), at("chooseMay", ap));
    expect(u.pending).toBeFalsy();
    expect(controllerOf(u, u.objects[other]!)).toBe(ap);
    expect(characteristics(u, u.objects[other]!).keywords).toContain("Haste");
  });

  it("Sorcerer's Wand: the equipped creature deals 1 damage to target player, 2 if it's a Wizard", () => {
    const { s: s0, ap, opp } = setup([]);
    const bear = putOnBattlefield(s0, ap, bearC());
    const wizard = putOnBattlefield(s0, ap, vanilla("Test Wizard", "Creature — Human Wizard", "{1}{U}", 2, 1, 1, { colors: ["U"] }));
    const wand = putOnBattlefield(s0, ap, sorcerersWand());
    const grant = (s: GameState, id: string) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => /damage to target player or planeswalker/.test(a.text ?? ""));
    const t = structuredClone(s0);
    equipOn(t, wand, bear);
    expect(grant(t, bear)).toBeGreaterThanOrEqual(0);
    expect(grant(t, wizard)).toBe(-1);
    const before = life(t, opp);
    const a = settle(run(t, planActivate(t, ap, bear, grant(t, bear), [ply(opp)])));
    expect(life(a, opp)).toBe(before - 1);
    const u = structuredClone(s0);
    equipOn(u, wand, wizard);
    const b = settle(run(u, planActivate(u, ap, wizard, grant(u, wizard), [ply(opp)])));
    expect(life(b, opp)).toBe(before - 2);
  });

  it("Perrie, the Pulverizer: +X/+X and trample, X the kinds of counters among permanents you control", () => {
    const { s: s0, ap, opp } = setup([]);
    const p = putOnBattlefield(s0, ap, perrie());
    const bear = putOnBattlefield(s0, ap, bearC());
    s0.objects[bear]!.counters["+1/+1"] = 2;
    s0.objects[p]!.counters.shield = 1;
    walkerOn(s0, ap, walker(), 3);
    // An opponent's counters don't count.
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    s0.objects[theirs]!.counters.stun = 1;
    invalidateCharacteristics(s0);
    let s = attackWith(s0, [p], opp);
    s = settle(s, at("chooseTargets", ap));
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(bear)] }));
    expect(pt(s, bear)).toBe("7/7");
    expect(characteristics(s, s.objects[bear]!).keywords).toContain("Trample");
  });

  it("Mentor's Guidance: copied if you control a planeswalker or one of those creature types as the trigger resolves", () => {
    const { s: s0, ap, ids } = setup([mentorsGuidance()]);
    onlyHand(s0, ap, ids);
    const handAfter = (s: GameState) => settle(castNow(s, ap, ids[0]!)).players[ap]!.hand.length;
    expect(handAfter(structuredClone(s0))).toBe(1);
    const t = structuredClone(s0);
    putOnBattlefield(t, ap, vanilla("Test Druid", "Creature — Elf Druid", "{G}", 1, 1, 1, { colors: ["G"] }));
    expect(handAfter(t)).toBe(2);
    const u = structuredClone(s0);
    walkerOn(u, ap, walker(), 3);
    expect(handAfter(u)).toBe(2);
    // Another player's Wizard doesn't count.
    const v = structuredClone(s0);
    putOnBattlefield(v, v.turnOrder[(v.turnOrder.indexOf(ap) + 1) % 4]!, vanilla("Test Wizard", "Creature — Human Wizard", "{U}", 1, 1, 1, { colors: ["U"] }));
    expect(handAfter(v)).toBe(1);
  });

  it("Sapphire Charm: target player draws at the beginning of the next turn's upkeep; or flying; or an opponent's creature phases out", () => {
    const { s: s0, ap, opp, ids } = setup([sapphireCharm()]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [ply(opp)], [0])));
    const hand0 = s.players[opp]!.hand.length;
    // Opponent is next: at its upkeep it draws one, then its normal draw.
    const up = settle(goUntil(s, (x) => x.activePlayer === opp && x.step === "upkeep"));
    expect(up.players[opp]!.hand.length).toBe(hand0 + 1);
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    const mine = putOnBattlefield(s0, ap, bearC("My Bear"));
    expect(planCast(s0, ap, ids[0]!, [tgt(mine)], [2])).toBeNull();
    const t = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(theirs)], [2])));
    expect(zone(t, theirs)).toBe("phasedOut");
  });

  it("Mister Hyde, Monster Within: a +1/+1 counter on it, or remove a counter from a creature you control and draw", () => {
    const { s: s0, ap } = setup([]);
    onlyHand(s0, ap, []);
    const hyde = putOnBattlefield(s0, ap, misterHyde());
    const bear = putOnBattlefield(s0, ap, bearC());
    s0.objects[bear]!.counters.stun = 1;
    invalidateCharacteristics(s0);
    const s1 = goUntil(s0, (x) => (x.activePlayer === ap && x.step === "upkeep" && x.turn > s0.turn) || at("chooseModes", ap)(x));
    const s = settle(s1, at("chooseModes", ap));
    expect(s.pending?.kind).toBe("chooseModes");
    const a = settle(act(structuredClone(s), { type: "chooseModes", player: ap, modes: [0] }));
    expect(counters(a, hyde)).toBe(1);
    const hand = s.players[ap]!.hand.length;
    const b = settle(act(structuredClone(s), { type: "chooseModes", player: ap, modes: [1] }));
    expect(counters(b, bear, "stun")).toBe(0);
    expect(b.players[ap]!.hand.length).toBe(hand + 1);
    // No creature of yours with a counter: nothing is removed, and no card is drawn.
    const t = structuredClone(s);
    t.objects[bear]!.counters.stun = 0;
    const c = settle(act(t, { type: "chooseModes", player: ap, modes: [1] }));
    expect(c.players[ap]!.hand.length).toBe(hand);
  });

  it("Triumph of Gerrard: its chapters target only a creature you control with the greatest power", () => {
    const { s: s0, ap, opp, ids } = setup([triumphOfGerrard()]);
    const bear = putOnBattlefield(s0, ap, bearC());
    const ogre = putOnBattlefield(s0, ap, vanilla("Test Ogre", "Creature — Ogre", "{3}{R}", 4, 3, 3, { colors: ["R"] }));
    putOnBattlefield(s0, opp, vanilla("Their Giant", "Creature — Giant", "{5}{R}", 6, 6, 6, { colors: ["R"] }));
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseTargets", ap));
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => act(structuredClone(s), { type: "chooseTargets", player: ap, targets: [tgt(bear)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(ogre)] }));
    expect(counters(s, ogre)).toBe(1);
  });

  it("First Responder: you may return another creature you control to hand, then +1/+1 counters equal to its power as it last existed", () => {
    const { s: s0, ap } = setup([]);
    const fr = putOnBattlefield(s0, ap, firstResponder());
    const bear = putOnBattlefield(s0, ap, bearC());
    s0.objects[bear]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    const s = settle(goUntil(s0, (x) => x.step === "end" && x.activePlayer === ap), at("chooseMay", ap));
    expect(s.pending?.kind).toBe("chooseMay");
    const yes = settle(answerMay(structuredClone(s), ap, true));
    expect(zone(yes, bear)).toBe("hand");
    expect(counters(yes, fr)).toBe(3);
    const no = settle(answerMay(s, ap, false));
    expect(zone(no, bear)).toBe("battlefield");
    expect(counters(no, fr)).toBe(0);
  });

  it("Pathway Arrows: the equipped creature deals 1 damage to target creature, tapping it if it's colorless", () => {
    const { s: s0, ap, opp } = setup([]);
    const bear = putOnBattlefield(s0, ap, bearC());
    const arrows = putOnBattlefield(s0, ap, pathwayArrows());
    equipOn(s0, arrows, bear);
    const golemT = putOnBattlefield(s0, opp, golem());
    const theirBear = putOnBattlefield(s0, opp, bearC("Their Bear"));
    const grant = abilitiesOf(s0, s0.objects[bear]!).activated.findIndex((a) => /damage to target creature/.test(a.text ?? ""));
    expect(grant).toBeGreaterThanOrEqual(0);
    const a = settle(run(structuredClone(s0), planActivate(s0, ap, bear, grant, [tgt(golemT)])));
    expect(a.objects[golemT]!.damage).toBe(1);
    expect(a.objects[golemT]!.tapped).toBe(true);
    const b = settle(run(structuredClone(s0), planActivate(s0, ap, bear, grant, [tgt(theirBear)])));
    expect(b.objects[theirBear]!.damage).toBe(1);
    expect(b.objects[theirBear]!.tapped).toBeFalsy();
  });
});
