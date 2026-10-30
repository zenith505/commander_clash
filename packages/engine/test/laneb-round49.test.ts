// Lane B, round 49: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, scry, setup } from "./helpers";
import { botActions, blockProblem, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, potentialAttackers, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
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
const attackOk = (s: GameState, id: string) => potentialAttackers(s, controllerOf(s, s.objects[id]!)).some((o) => o.id === id);

// Real oracle text (Scryfall).
const akronLegionnaire = () => card("Akron Legionnaire", "Creature — Giant Soldier", "{6}{W}{W}", { cmc: 8, colors: ["W"], power: "8", toughness: "4", oracleText: "Except for creatures named Akron Legionnaire and artifact creatures, creatures you control can't attack." });
const cullingScales = () => card("Culling Scales", "Artifact", "{3}", { cmc: 3, colors: [], oracleText: "At the beginning of your upkeep, destroy target nonland permanent with the lowest mana value. (If two or more permanents are tied for lowest, target any one of them.)" });
const eaglesRescue = () => card("Eagle's Rescue", "Enchantment — Aura", "{2}{W/U}{W/U}", { cmc: 4, colors: ["U","W"], keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +2/+2 and has flying.\n{2}{W/U}{W/U}: Return this card from your graveyard to the battlefield attached to target creature you control with power 1 or less. Activate only as a sorcery." });
const emergentHaunting = () => card("Emergent Haunting", "Enchantment", "{1}{U}", { cmc: 2, colors: ["U"], keywords: ["Surveil"], oracleText: "At the beginning of your end step, if you haven't cast a spell from your hand this turn and this enchantment isn't a creature, it becomes a 3/3 Spirit creature with flying in addition to its other types.\n{2}{U}: Surveil 1. (Look at the top card of your library. You may put it into your graveyard.)" });
const forcemageAdvocate = () => card("Forcemage Advocate", "Creature — Centaur Shaman", "{1}{G}", { cmc: 2, colors: ["G"], power: "2", toughness: "1", oracleText: "{T}: Return target card from an opponent's graveyard to their hand. Put a +1/+1 counter on target creature." });
const grind = () => scry("split", [{"name":"Grind","mana_cost":"{1}{B}","type_line":"Sorcery","oracle_text":"Put a -1/-1 counter on each of up to two target creatures."},{"name":"Dust","mana_cost":"{3}{W}","type_line":"Sorcery","oracle_text":"Aftermath (Cast this spell only from your graveyard. Then exile it.)\nExile any number of target creatures that have -1/-1 counters on them."}], { keywords: ["Aftermath"] });
const hit = () => scry("split", [{"name":"Hit","mana_cost":"{1}{B}{R}","type_line":"Instant","oracle_text":"Target player sacrifices an artifact or creature of their choice. Hit deals damage to that player equal to that permanent's mana value."},{"name":"Run","mana_cost":"{3}{R}{G}","type_line":"Instant","oracle_text":"Attacking creatures you control get +1/+0 until end of turn for each other attacking creature."}]);
const howlingGalefang = () => card("Howling Galefang", "Creature — Beast", "{2}{G}{G}", { cmc: 4, colors: ["G"], power: "4", toughness: "4", keywords: ["Vigilance"], oracleText: "Vigilance\nThis creature has haste as long as you own a card in exile that has an Adventure." });
const intrudingSoulrager = () => card("Intruding Soulrager", "Creature — Spirit", "{U}{R}", { cmc: 2, colors: ["R","U"], power: "2", toughness: "2", keywords: ["Vigilance"], oracleText: "Vigilance\n{T}, Sacrifice a Room: This creature deals 2 damage to each opponent. Draw a card." });
const iridescentDrake = () => card("Iridescent Drake", "Creature — Drake", "{3}{U}", { cmc: 4, colors: ["U"], power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, put target Aura card from a graveyard onto the battlefield under your control attached to this creature." });
const keldonTwilight = () => card("Keldon Twilight", "Enchantment", "{1}{B}{R}", { cmc: 3, colors: ["B","R"], oracleText: "At the beginning of each player's end step, if no creatures attacked this turn, that player sacrifices a creature of their choice that they controlled since the beginning of the turn." });
const memoryLeak = () => card("Memory Leak", "Sorcery", "{2}{B}", { cmc: 3, colors: ["B"], keywords: ["Cycling"], oracleText: "Target opponent reveals their hand. You choose a nonland card from that player's graveyard or hand and exile it.\nCycling {1} ({1}, Discard this card: Draw a card.)" });
const monstrousWarLeech = () => card("Monstrous War-Leech", "Creature — Leech Horror", "{3}{B}", { cmc: 4, colors: ["B"], power: "*", toughness: "*", keywords: ["Mill","Kicker"], oracleText: "Kicker {U} (You may pay an additional {U} as you cast this spell.)\nAs this creature enters, if it was kicked, mill four cards. (To mill a card, put the top card of your library into your graveyard.)\nMonstrous War-Leech's power and toughness are each equal to the greatest mana value among cards in your graveyard." });
const neverHappened = () => card("Never Happened", "Sorcery", "{2}{B}", { cmc: 3, colors: ["B"], oracleText: "Target opponent reveals their hand. You choose a nonland card from that player's graveyard or hand and exile it." });
const pipsqueakRebelStrongarm = () => card("Pipsqueak, Rebel Strongarm", "Legendary Creature — Human Rebel Ally", "{2}{W}", { cmc: 3, colors: ["W"], power: "4", toughness: "4", oracleText: "Pipsqueak can't attack alone unless he has a +1/+1 counter on him." });
const questForTheGemblades = () => card("Quest for the Gemblades", "Enchantment", "{1}{G}", { cmc: 2, colors: ["G"], oracleText: "Whenever a creature you control deals combat damage to a creature, you may put a quest counter on this enchantment.\nRemove a quest counter from this enchantment and sacrifice it: Put four +1/+1 counters on target creature." });
const rise = () => scry("split", [{"name":"Rise","mana_cost":"{U}{B}","type_line":"Sorcery","oracle_text":"Return target creature card from a graveyard and target creature on the battlefield to their owners' hands."},{"name":"Fall","mana_cost":"{B}{R}","type_line":"Sorcery","oracle_text":"Target player reveals two cards at random from their hand, then discards each nonland card revealed this way."}]);
const rivalsDuel = () => card("Rivals' Duel", "Sorcery", "{3}{R}", { cmc: 4, colors: ["R"], keywords: ["Fight"], oracleText: "Choose two target creatures that share no creature types. Those creatures fight each other. (Each deals damage equal to its power to the other.)" });
const rumblingRuin = () => card("Rumbling Ruin", "Creature — Elemental", "{5}{R}", { cmc: 6, colors: ["R"], power: "6", toughness: "6", oracleText: "When this creature enters, count the number of +1/+1 counters on creatures you control. Creatures your opponents control with power less than or equal to that number can't block this turn." });
const scorchingLava = () => card("Scorching Lava", "Instant", "{1}{R}", { cmc: 2, colors: ["R"], keywords: ["Kicker"], oracleText: "Kicker {R} (You may pay an additional {R} as you cast this spell.)\nScorching Lava deals 2 damage to any target. If this spell was kicked, that creature can't be regenerated this turn and if it would die this turn, exile it instead." });
const scrounge = () => card("Scrounge", "Sorcery", "{2}{B}", { cmc: 3, colors: ["B"], oracleText: "Target opponent chooses an artifact card in their graveyard. Put that card onto the battlefield under your control." });
const shieldmageAdvocate = () => card("Shieldmage Advocate", "Creature — Human Cleric", "{2}{W}", { cmc: 3, colors: ["W"], power: "1", toughness: "3", oracleText: "{T}: Return target card from an opponent's graveyard to their hand. Prevent all damage that would be dealt to any target this turn by a source of your choice." });
const trial = () => scry("split", [{"name":"Trial","mana_cost":"{W}{U}","type_line":"Instant","oracle_text":"Return all creatures blocking or blocked by target creature to their owner's hand."},{"name":"Error","mana_cost":"{U}{B}","type_line":"Instant","oracle_text":"Counter target multicolored spell."}]);
const usAgent = () => card("U.S.Agent, John Walker", "Legendary Creature — Human Soldier Hero", "{3}{W/B}", { cmc: 4, colors: ["B","W"], power: "3", toughness: "2", oracleText: "When U.S.Agent enters, create a colorless Equipment artifact token named Sturdy Shield with \"Equipped creature gets +1/+2\" and equip {2}. Attach it to U.S.Agent." });
const voidStalker = () => card("Void Stalker", "Creature — Elemental", "{1}{U}", { cmc: 2, colors: ["U"], power: "2", toughness: "1", oracleText: "{2}{U}, {T}: Put this creature and target creature on top of their owners' libraries, then those players shuffle their libraries." });
const wallOfDust = () => card("Wall of Dust", "Creature — Wall", "{2}{R}", { cmc: 3, colors: ["R"], power: "1", toughness: "4", keywords: ["Defender"], oracleText: "Defender (This creature can't attack.)\nWhenever this creature blocks a creature, that creature can't attack during its controller's next turn." });

// Test cards.
const vanilla = (name: string, typeLine: string, cost: string, cmc: number, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, cost, { cmc, power: String(p), toughness: String(t), ...extra });
const bearC = (name = "Plain Bear", p = 2, t = 2) => vanilla(name, "Creature — Bear", "{1}{G}", 2, p, t, { colors: ["G"] });
const bird = (name = "Plain Bird", p = 2, t = 2) => vanilla(name, "Creature — Bird", "{1}{W}", 2, p, t, { colors: ["W"] });
const golem = () => vanilla("Test Golem", "Artifact Creature — Golem", "{3}", 3, 3, 3, { colors: [] });
const rock = () => card("Test Rock", "Artifact", "{1}", { cmc: 1 });
const bigRock = () => card("Big Rock", "Artifact", "{4}", { cmc: 4 });
const aura = (name = "Test Aura") => card(name, "Enchantment — Aura", "{W}", { cmc: 1, colors: ["W"], keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +1/+1." });
const landAura = () => card("Test Land Aura", "Enchantment — Aura", "{G}", { cmc: 1, colors: ["G"], keywords: ["Enchant"], oracleText: "Enchant land" });
const opt = () => card("Test Opt", "Instant", "{U}", { cmc: 1, colors: ["U"], oracleText: "Draw a card." });
const bigSpell = () => card("Big Spell", "Sorcery", "{5}{B}", { cmc: 6, colors: ["B"], oracleText: "Draw a card." });
const wastes = () => card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." });
const room = () => scry("split", [
  { name: "Test Hall", mana_cost: "{U}", type_line: "Enchantment — Room", oracle_text: "When you unlock this door, draw a card." },
  { name: "Test Vault", mana_cost: "{2}{U}", type_line: "Enchantment — Room", oracle_text: "When you unlock this door, draw a card." },
]);
const adventurer = () => scry("adventure", [
  { name: "Test Adventurer", mana_cost: "{1}{G}", type_line: "Creature — Human", power: "2", toughness: "2", oracle_text: "" },
  { name: "Test Outing", mana_cost: "{G}", type_line: "Sorcery — Adventure", oracle_text: "Draw a card. (Then exile this card. You may cast the creature later from exile.)" },
]);

describe("Lane B round 49", () => {
  it("are fully supported", () => {
    supported(akronLegionnaire(), cullingScales(), eaglesRescue(), emergentHaunting(), forcemageAdvocate(), grind(), hit(), howlingGalefang(), intrudingSoulrager(), iridescentDrake(), keldonTwilight(), memoryLeak(), monstrousWarLeech(), neverHappened(), pipsqueakRebelStrongarm(), questForTheGemblades(), rise(), rivalsDuel(), rumblingRuin(), scorchingLava(), scrounge(), shieldmageAdvocate(), trial(), usAgent(), voidStalker(), wallOfDust());
  });

  it("Never Happened: you choose a nonland card from the opponent's hand or graveyard and exile it", () => {
    const { s: s0, ap, opp, ids } = setup([neverHappened()]);
    const inHand = toZone(s0, opp, opt(), "hand");
    const land = toZone(s0, opp, wastes(), "hand");
    onlyHand(s0, opp, [inHand, land]);
    const inYard = toZone(s0, opp, bigSpell(), "graveyard");
    const yardLand = toZone(s0, opp, wastes(), "graveyard");
    let s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]), at("searchLibrary", ap));
    const p = s.pending;
    expect(p).toMatchObject({ kind: "searchLibrary", player: ap, hand: opp, handYard: true, min: 1, max: 1 });
    expect(p?.kind === "searchLibrary" && [...p.cards].sort()).toEqual([inHand, inYard].sort());
    expect(p?.kind === "searchLibrary" && p.dig?.looked).toEqual([inHand, land, inYard, yardLand]);
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [land] })).toThrow();
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [inYard] }));
    expect([zone(s, inYard), zone(s, inHand), zone(s, land)]).toEqual(["exile", "hand", "hand"]);
  });

  it("Never Happened: a card from the hand, and the bot takes the opponent's best card", () => {
    const { s: s0, ap, opp, ids } = setup([neverHappened()]);
    const inHand = toZone(s0, opp, opt(), "hand");
    onlyHand(s0, opp, [inHand]);
    let s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]), at("searchLibrary", ap));
    expect(botActions(s, ap)[0]).toMatchObject({ type: "searchLibrary", found: [inHand] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [inHand] }));
    expect(zone(s, inHand)).toBe("exile");
  });

  it("Never Happened with nothing nonland to take does nothing", () => {
    const { s: s0, ap, opp, ids } = setup([neverHappened()]);
    onlyHand(s0, opp, []);
    const s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]));
    expect([zone(s, ids[0]!), s.players[opp]!.exile.length]).toEqual(["graveyard", s0.players[opp]!.exile.length]);
  });

  it("Memory Leak can be cycled", () => {
    const { s: s0, ap, ids } = setup([memoryLeak()]);
    const before = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planActivate(s0, ap, ids[0]!, 0)));
    expect([zone(s, ids[0]!), s.players[ap]!.hand.length]).toEqual(["graveyard", before]);
  });

  it("Culling Scales: only a nonland permanent with the lowest mana value can be targeted", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, cullingScales());
    const low = putOnBattlefield(s0, opp, rock());
    const high = putOnBattlefield(s0, opp, bigRock());
    const bear = putOnBattlefield(s0, ap, bearC());
    let s = goUntil(s0, (x) => x.turn > s0.turn && x.activePlayer === ap && at("chooseTargets", ap)(x));
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(bear)] } as Action)).toThrow();
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(high)] } as Action)).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(low)] } as Action));
    expect([zone(s, low), zone(s, high), zone(s, bear)]).toEqual(["graveyard", "battlefield", "battlefield"]);
  });

  it("Rivals' Duel: the two creatures can't share a creature type, and they fight", () => {
    const { s: s0, ap, opp, ids } = setup([rivalsDuel()]);
    const mine = putOnBattlefield(s0, ap, bearC("Big Bear", 4, 4));
    const theirBear = putOnBattlefield(s0, opp, bearC("Their Bear", 3, 3));
    const theirBird = putOnBattlefield(s0, opp, bird("Their Bird", 3, 3));
    expect(planCast(s0, ap, ids[0]!, [tgt(mine), tgt(theirBear)])).toBeNull();
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(mine), tgt(theirBird)]));
    expect([zone(s, theirBird), zone(s, mine), s.objects[mine]!.damage, zone(s, theirBear)]).toEqual(["graveyard", "battlefield", 3, "battlefield"]);
  });

  it("Rumbling Ruin: the number of +1/+1 counters is counted once; creatures with that much power or less can't block", () => {
    const { s: s0, ap, opp, ids } = setup([rumblingRuin()]);
    const counted = putOnBattlefield(s0, ap, bearC("Counted Bear"));
    s0.objects[counted]!.counters = { "+1/+1": 2 };
    const small = putOnBattlefield(s0, opp, bearC("Small Bear", 2, 2));
    const big = putOnBattlefield(s0, opp, bearC("Big Bear", 3, 3));
    const mine = putOnBattlefield(s0, ap, bearC("My Bear", 1, 1));
    invalidateCharacteristics(s0);
    let s = settle(castNow(s0, ap, ids[0]!));
    // More counters later don't change the number (CR 611.2c).
    s.objects[counted]!.counters = { "+1/+1": 5 };
    invalidateCharacteristics(s);
    s = attackWith(s, [counted], opp);
    s = toBlocks(s);
    const attacker = s.objects[counted]!;
    expect(blockProblem(s, s.objects[small]!, attacker)).not.toBeNull();
    expect(blockProblem(s, s.objects[big]!, attacker)).toBeNull();
    // Not a characteristic change: a creature whose power drops later is caught too (CR 611.2c), and yours never are.
    s.objects[big]!.counters = { "-1/-1": 1 };
    invalidateCharacteristics(s);
    expect(blockProblem(s, s.objects[big]!, attacker)).not.toBeNull();
    expect(controllerOf(s, s.objects[mine]!)).toBe(ap);
  });

  it("Wall of Dust: a creature it blocks can't attack during its controller's next turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const attacker = putOnBattlefield(s0, ap, bearC("Big Bear", 5, 5));
    const wall = putOnBattlefield(s0, opp, wallOfDust());
    let s = attackWith(s0, [attacker], opp);
    s = toBlocks(s);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: wall, attacker }] });
    s = settle(s);
    expect(zone(s, attacker)).toBe("battlefield");
    const turn = s.turn;
    s = goUntil(s, (x) => x.turn > turn && x.activePlayer === ap && x.step === "main1");
    expect(attackOk(s, attacker)).toBe(false);
    const next = s.turn;
    s = goUntil(s, (x) => x.turn > next && x.activePlayer === ap && x.step === "main1");
    expect(attackOk(s, attacker)).toBe(true);
  });

  it("Hit: the player sacrifices an artifact or creature and Hit deals damage equal to its mana value", () => {
    const { s: s0, ap, opp, ids } = setup([hit()]);
    const theirs = putOnBattlefield(s0, opp, bigRock());
    const s = settle(castNow(s0, ap, ids[0]!, [ply(opp)], { face: 0 }));
    expect([zone(s, theirs), life(s, opp)]).toEqual(["graveyard", life(s0, opp) - 4]);
  });

  it("Hit with nothing to sacrifice deals no damage", () => {
    const { s: s0, ap, opp, ids } = setup([hit()]);
    for (const id of s0.battlefield.filter((id) => s0.objects[id]!.controller === opp && /Creature|Artifact/.test(characteristics(s0, s0.objects[id]!).types.join(" ")))) s0.objects[id]!.controller = ap;
    invalidateCharacteristics(s0);
    const s = settle(castNow(s0, ap, ids[0]!, [ply(opp)], { face: 0 }));
    expect(life(s, opp)).toBe(life(s0, opp));
  });

  it("Fall: two cards at random are revealed and only the nonland ones are discarded", () => {
    const { s: s0, ap, opp, ids } = setup([rise()]);
    const spell = toZone(s0, opp, opt(), "hand");
    const land = toZone(s0, opp, wastes(), "hand");
    onlyHand(s0, opp, [spell, land]);
    const s = settle(castNow(s0, ap, ids[0]!, [ply(opp)], { face: 1 }));
    expect([zone(s, spell), zone(s, land)]).toEqual(["graveyard", "hand"]);
  });

  it("Rise: returns a creature card from a graveyard and a creature to their owners' hands", () => {
    const { s: s0, ap, opp, ids } = setup([rise()]);
    const dead = toZone(s0, opp, bearC("Dead Bear"), "graveyard");
    const alive = putOnBattlefield(s0, opp, bearC("Live Bear"));
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(dead), tgt(alive)], { face: 0 }));
    expect([zone(s, dead), zone(s, alive), s.players[opp]!.hand.includes(dead)]).toEqual(["hand", "hand", true]);
  });

  it("Trial: returns all creatures blocking the target creature", () => {
    const { s: s0, ap, opp, ids } = setup([trial()]);
    const attacker = putOnBattlefield(s0, ap, bearC("Big Bear", 5, 5));
    const b1 = putOnBattlefield(s0, opp, bearC("Blocker One"));
    const b2 = putOnBattlefield(s0, opp, bearC("Blocker Two"));
    const idle = putOnBattlefield(s0, opp, bearC("Idle Bear"));
    let s = attackWith(s0, [attacker], opp);
    s = toBlocks(s);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b1, attacker }, { blocker: b2, attacker }] });
    for (let i = 0; i < 20 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(castNow(s, ap, ids[0]!, [tgt(attacker)], { face: 0 }));
    expect([zone(s, b1), zone(s, b2), zone(s, idle), zone(s, attacker)]).toEqual(["hand", "hand", "battlefield", "battlefield"]);
  });

  it("Keldon Twilight: with no attack, the player sacrifices a creature they controlled since the turn began", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, keldonTwilight());
    const old = putOnBattlefield(s0, ap, bearC("Old Bear"));
    const fresh = putOnBattlefield(s0, ap, bearC("Fresh Bear"), { sick: true });
    const s = goUntil(s0, (x) => x.step === "cleanup" || zone(x, old) !== "battlefield");
    expect([zone(s, old), zone(s, fresh)]).toEqual(["graveyard", "battlefield"]);
  });

  it("Keldon Twilight does nothing in a turn creatures attacked", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, keldonTwilight());
    const old = putOnBattlefield(s0, ap, bearC("Old Bear"));
    const s = goUntil(attackWith(s0, [old], opp), (x) => x.step === "cleanup");
    expect(zone(s, old)).toBe("battlefield");
  });

  it("Quest for the Gemblades: combat damage to a creature adds a quest counter; sacrificing it puts four +1/+1 counters", () => {
    const { s: s0, ap, opp } = setup([]);
    const quest = putOnBattlefield(s0, ap, questForTheGemblades());
    const attacker = putOnBattlefield(s0, ap, bearC("Big Bear", 5, 5));
    const blocker = putOnBattlefield(s0, opp, bearC("Their Bear"));
    let s = attackWith(s0, [attacker], opp);
    s = toBlocks(s);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker }] });
    s = goUntil(s, at("chooseMay", ap));
    s = settle(answerMay(s, ap, true));
    expect([counters(s, quest, "quest"), zone(s, blocker)]).toEqual([1, "graveyard"]);
    s = goUntil(s, (x) => x.step === "main2");
    s = settle(run(s, planActivate(s, ap, quest, 0, [tgt(attacker)])));
    expect([zone(s, quest), counters(s, attacker)]).toEqual(["graveyard", 4]);
  });

  it("Emergent Haunting: becomes a 3/3 flying Spirit at your end step if you cast no spell from your hand", () => {
    const { s: s0, ap } = setup([]);
    const haunt = putOnBattlefield(s0, ap, emergentHaunting());
    let s = goUntil(s0, (x) => x.step === "cleanup");
    const c = characteristics(s, s.objects[haunt]!);
    expect([c.types.includes("Creature"), c.types.includes("Enchantment"), c.subtypes.includes("Spirit"), pt(s, haunt), objHasKeyword(s, s.objects[haunt]!, "Flying")]).toEqual([true, true, true, "3/3", true]);
  });

  it("Emergent Haunting stays an enchantment in a turn you cast a spell from your hand", () => {
    const { s: s0, ap, ids } = setup([opt()]);
    const haunt = putOnBattlefield(s0, ap, emergentHaunting());
    let s = settle(castNow(s0, ap, ids[0]!));
    s = goUntil(s, (x) => x.step === "cleanup");
    expect(characteristics(s, s.objects[haunt]!).types.includes("Creature")).toBe(false);
  });

  it("Monstrous War-Leech: kicked, it mills four as it enters and counts the greatest mana value in your graveyard", () => {
    const { s: s0, ap, ids } = setup([monstrousWarLeech()]);
    for (let i = 0; i < 4; i++) toZone(s0, ap, i === 2 ? bigSpell() : opt(), "library");
    const s = settle(castNow(s0, ap, ids[0]!, [], { kicks: [0] }));
    expect([zone(s, ids[0]!), pt(s, ids[0]!)]).toEqual(["battlefield", "6/6"]);
  });

  it("Monstrous War-Leech unkicked mills nothing", () => {
    const { s: s0, ap, ids } = setup([monstrousWarLeech()]);
    toZone(s0, ap, opt(), "graveyard");
    const lib = s0.players[ap]!.library.length;
    const s = settle(castNow(s0, ap, ids[0]!));
    expect([pt(s, ids[0]!), s.players[ap]!.library.length]).toEqual(["1/1", lib]);
  });

  it("Void Stalker: it and the target are shuffled into their owners' libraries", () => {
    const { s: s0, ap, opp } = setup([]);
    const stalker = putOnBattlefield(s0, ap, voidStalker());
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    const s = settle(run(s0, planActivate(s0, ap, stalker, 0, [tgt(theirs)])));
    expect([zone(s, stalker), zone(s, theirs), s.players[ap]!.library.includes(stalker), s.players[opp]!.library.includes(theirs)]).toEqual(["library", "library", true, true]);
  });

  it("Iridescent Drake: an Aura card from any graveyard enters under your control attached to it", () => {
    const { s: s0, ap, opp, ids } = setup([iridescentDrake()]);
    const theirAura = toZone(s0, opp, aura(), "graveyard");
    let s = castNow(s0, ap, ids[0]!);
    s = settle(triggerTargets(s, ap, [tgt(theirAura)]));
    expect([zone(s, theirAura), s.objects[theirAura]!.attachedTo, controllerOf(s, s.objects[theirAura]!), pt(s, ids[0]!)]).toEqual(["battlefield", ids[0]!, ap, "3/3"]);
  });

  it("Iridescent Drake: an Aura that can't enchant it stays in the graveyard (CR 303.4g)", () => {
    const { s: s0, ap, ids } = setup([iridescentDrake()]);
    const wrong = toZone(s0, ap, landAura(), "graveyard");
    let s = castNow(s0, ap, ids[0]!);
    s = settle(triggerTargets(s, ap, [tgt(wrong)]));
    expect(zone(s, wrong)).toBe("graveyard");
  });

  it("Scrounge: the opponent chooses an artifact card from their graveyard and it enters under your control", () => {
    const { s: s0, ap, opp, ids } = setup([scrounge()]);
    const art = toZone(s0, opp, bigRock(), "graveyard");
    toZone(s0, opp, opt(), "graveyard");
    const s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]));
    expect([zone(s, art), controllerOf(s, s.objects[art]!), s.objects[art]!.owner]).toEqual(["battlefield", ap, opp]);
  });

  it("U.S.Agent: its Sturdy Shield token enters and is attached to it", () => {
    const { s: s0, ap, ids } = setup([usAgent()]);
    const s = settle(castNow(s0, ap, ids[0]!));
    const shield = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]?.name === "Sturdy Shield")!;
    expect([!!shield, s.objects[shield]!.attachedTo, pt(s, ids[0]!)]).toEqual([true, ids[0]!, "4/4"]);
  });

  it("Akron Legionnaire: only creatures named Akron Legionnaire and artifact creatures you control can attack", () => {
    const { s: s0, ap, opp } = setup([]);
    const akron = putOnBattlefield(s0, ap, akronLegionnaire());
    const bear = putOnBattlefield(s0, ap, bearC());
    const g = putOnBattlefield(s0, ap, golem());
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    expect([attackOk(s0, akron), attackOk(s0, bear), attackOk(s0, g)]).toEqual([true, false, true]);
    // Only your creatures.
    expect(attackOk(s0, theirs)).toBe(true);
  });

  it("Pipsqueak can't attack alone unless he has a +1/+1 counter", () => {
    const { s: s0, ap, opp } = setup([]);
    const pip = putOnBattlefield(s0, ap, pipsqueakRebelStrongarm());
    const bear = putOnBattlefield(s0, ap, bearC());
    let s = s0;
    for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: pip, defender: opp }] })).toThrow();
    const both = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: pip, defender: opp }, { attacker: bear, defender: opp }] });
    expect(both.objects[pip]!.attacking).toBe(opp);
    s.objects[pip]!.counters = { "+1/+1": 1 };
    invalidateCharacteristics(s);
    const alone = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: pip, defender: opp }] });
    expect(alone.objects[pip]!.attacking).toBe(opp);
  });

  it("Howling Galefang has haste while you own a card with an Adventure in exile", () => {
    const { s: s0, ap } = setup([]);
    const fang = putOnBattlefield(s0, ap, howlingGalefang(), { sick: true });
    expect(objHasKeyword(s0, s0.objects[fang]!, "Haste")).toBe(false);
    toZone(s0, ap, opt(), "exile");
    expect(objHasKeyword(s0, s0.objects[fang]!, "Haste")).toBe(false);
    toZone(s0, ap, adventurer(), "exile");
    expect(objHasKeyword(s0, s0.objects[fang]!, "Haste")).toBe(true);
  });

  it("Eagle's Rescue returns from your graveyard attached to a creature you control with power 1 or less", () => {
    const { s: s0, ap, opp } = setup([]);
    const rescue = toZone(s0, ap, eaglesRescue(), "graveyard");
    const small = putOnBattlefield(s0, ap, bearC("Small Bear", 1, 1));
    const big = putOnBattlefield(s0, ap, bearC("Big Bear", 2, 2));
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear", 1, 1));
    expect(planActivate(s0, ap, rescue, 0, [tgt(big)])).toBeNull();
    expect(planActivate(s0, ap, rescue, 0, [tgt(theirs)])).toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, rescue, 0, [tgt(small)])));
    expect([zone(s, rescue), s.objects[rescue]!.attachedTo, pt(s, small), objHasKeyword(s, s.objects[small]!, "Flying")]).toEqual(["battlefield", small, "3/3", true]);
  });

  it("Scorching Lava kicked: the creature it kills is exiled instead", () => {
    const { s: s0, ap, opp, ids } = setup([scorchingLava(), scorchingLava()]);
    const a = putOnBattlefield(s0, opp, bearC("Bear A"));
    const b = putOnBattlefield(s0, opp, bearC("Bear B"));
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(a)], { kicks: [0] }));
    s = settle(castNow(s, ap, ids[1]!, [tgt(b)]));
    expect([zone(s, a), zone(s, b)]).toEqual(["exile", "graveyard"]);
  });

  it("Forcemage Advocate: returns a card from an opponent's graveyard to their hand and puts a +1/+1 counter on a creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const adv = putOnBattlefield(s0, ap, forcemageAdvocate());
    const card0 = toZone(s0, opp, opt(), "graveyard");
    const mine = toZone(s0, ap, opt(), "graveyard");
    expect(planActivate(s0, ap, adv, 0, [tgt(mine), tgt(adv)])).toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, adv, 0, [tgt(card0), tgt(adv)])));
    expect([zone(s, card0), s.players[opp]!.hand.includes(card0), counters(s, adv)]).toEqual(["hand", true, 1]);
  });

  it("Intruding Soulrager: sacrificing a Room deals 2 damage to each opponent and draws a card", () => {
    const { s: s0, ap, opp } = setup([]);
    const rager = putOnBattlefield(s0, ap, intrudingSoulrager());
    const r = putOnBattlefield(s0, ap, room());
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planActivate(s0, ap, rager, 0, undefined, undefined, undefined, undefined, { sacrifice: [r] })));
    const others = s.turnOrder.filter((p) => p !== ap);
    expect([zone(s, r), others.map((p) => life(s, p)), s.players[ap]!.hand.length, life(s, ap)]).toEqual(["graveyard", others.map((p) => life(s0, p) - 2), hand + 1, life(s0, ap)]);
    expect(life(s, opp)).toBe(life(s0, opp) - 2);
  });

  it("Intruding Soulrager can't be activated without a Room", () => {
    const { s: s0, ap } = setup([]);
    const rager = putOnBattlefield(s0, ap, intrudingSoulrager());
    expect(planActivate(s0, ap, rager, 0)).toBeNull();
  });

  it("Dust: exiles any number of creatures with -1/-1 counters on them", () => {
    const { s: s0, ap, opp, ids } = setup([grind()]);
    const marked = putOnBattlefield(s0, opp, bearC("Marked Bear", 3, 3));
    s0.objects[marked]!.counters = { "-1/-1": 1 };
    const clean = putOnBattlefield(s0, opp, bearC("Clean Bear", 3, 3));
    invalidateCharacteristics(s0);
    const g = toZone(s0, ap, grind(), "graveyard");
    s0.players[ap]!.hand = s0.players[ap]!.hand.filter((id) => id !== ids[0]);
    expect(planCast(s0, ap, g, [tgt(clean)], undefined, "auto", undefined, { face: 1, via: "aftermath" })).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, g, [tgt(marked)], undefined, "auto", undefined, { face: 1, via: "aftermath" })));
    expect([zone(s, marked), zone(s, clean), zone(s, g)]).toEqual(["exile", "battlefield", "exile"]);
  });
});
