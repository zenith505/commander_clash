// Lane B, round 52: unsupported cards no earlier round wrote down, EDHREC rank about 23,250 to 22,000, least played first
// (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, power, toughness, planCast, planTurnFaceUp, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const archangelOfWrath = () => card("Archangel of Wrath", "Creature — Angel", "{2}{W}{W}", { cmc: 4, colors: ["W"], power: "3", toughness: "4", keywords: ["Kicker","Flying","Lifelink"], oracleText: "Kicker {B} and/or {R} (You may pay an additional {B} and/or {R} as you cast this spell.)\nFlying, lifelink\nWhen this creature enters, if it was kicked, it deals 2 damage to any target.\nWhen this creature enters, if it was kicked twice, it deals 2 damage to any target." });
const bobReluctantHYDRAAgent = () => card("Bob, Reluctant HYDRA Agent", "Legendary Creature — Human Coward Villain", "{1}{B}", { cmc: 2, colors: ["B"], power: "2", toughness: "2", oracleText: "Whenever Bob attacks alone, return him to his owner's hand. If you do, each opponent loses 2 life and you gain 2 life." });
const crowdControlWarden = () => card("Crowd-Control Warden", "Creature — Centaur Soldier", "{3}{G}{W}", { cmc: 5, colors: ["G","W"], power: "4", toughness: "4", keywords: ["Disguise"], oracleText: "As this creature enters or is turned face up, put X +1/+1 counters on it, where X is the number of other creatures you control.\nDisguise {3}{G/W}{G/W} (You may cast this card face down for {3} as a 2/2 creature with ward {2}. Turn it face up any time for its disguise cost.)" });
const eonHub = () => card("Eon Hub", "Artifact", "{5}", { cmc: 5, colors: [], oracleText: "Players skip their upkeep steps." });
const humOfTheRadix = () => card("Hum of the Radix", "Enchantment", "{2}{G}{G}", { cmc: 4, colors: ["G"], oracleText: "Each artifact spell costs {1} more to cast for each artifact its controller controls." });
const huntedNightmare = () => card("Hunted Nightmare", "Creature — Nightmare", "{1}{B}{B}", { cmc: 3, colors: ["B"], power: "4", toughness: "5", keywords: ["Menace"], oracleText: "Menace\nWhen this creature enters, target opponent puts a deathtouch counter on a creature they control." });
const infernoProject = () => card("Inferno Project", "Creature — Elemental", "{6}{R}", { cmc: 7, colors: ["R"], power: "0", toughness: "0", keywords: ["Trample"], oracleText: "Trample\nThis creature enters with X +1/+1 counters on it, where X is the total mana value of instant and sorcery cards in your graveyard." });
const justiceVanceAstrovik = () => card("Justice, Vance Astrovik", "Legendary Creature — Mutant Hero", "{2}{U}", { cmc: 3, colors: ["U"], power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying\nWhen Justice enters, return up to one target nonland, nontoken permanent to its owner's hand.\nWhenever another nonland permanent you control is returned to its owner's hand, put a +1/+1 counter on Justice." });
const latticeBladeMantis = () => card("Lattice-Blade Mantis", "Creature — Phyrexian Insect", "{3}{G}", { cmc: 4, colors: ["G"], power: "4", toughness: "3", oracleText: "This creature enters with two oil counters on it.\nWhenever this creature attacks, you may remove an oil counter from it. If you do, untap it and it gets +1/+1 until end of turn." });
const lavaBlister = () => card("Lava Blister", "Sorcery", "{1}{R}", { cmc: 2, colors: ["R"], oracleText: "Destroy target nonbasic land unless its controller has Lava Blister deal 6 damage to them." });
const mageDuel = () => card("Mage Duel", "Sorcery", "{2}{G}", { cmc: 3, colors: ["G"], keywords: ["Fight"], oracleText: "This spell costs {2} less to cast if you've cast another instant or sorcery spell this turn.\nTarget creature you control gets +1/+2 until end of turn. Then it fights target creature you don't control. (Each deals damage equal to its power to the other.)" });
const masterSymmetrist = () => card("Master Symmetrist", "Creature — Rhino Druid", "{2}{G}{G}", { cmc: 4, colors: ["G"], power: "4", toughness: "4", keywords: ["Reach"], oracleText: "Reach\nWhenever a creature you control with power equal to its toughness attacks, it gains trample until end of turn." });
const mindCarver = () => card("Mind Carver", "Artifact — Equipment", "{B}", { cmc: 1, colors: ["B"], keywords: ["Equip"], oracleText: "When this Equipment enters, attach it to target creature you control.\nEquipped creature gets +1/+0. It gets +3/+1 instead as long as an opponent has eight or more cards in their graveyard.\nEquip {2}{B}" });
const mindstormCrown = () => card("Mindstorm Crown", "Artifact", "{3}", { cmc: 3, colors: [], oracleText: "At the beginning of your upkeep, draw a card if you had no cards in hand at the beginning of this turn. If you had a card in hand, this artifact deals 1 damage to you." });
const neurokTransmuter = () => card("Neurok Transmuter", "Creature — Human Wizard", "{2}{U}", { cmc: 3, colors: ["U"], power: "2", toughness: "2", oracleText: "{U}: Target creature becomes an artifact in addition to its other types until end of turn.\n{U}: Until end of turn, target artifact creature becomes blue and isn't an artifact." });
const provokeTheTrolls = () => card("Provoke the Trolls", "Instant", "{3}{R}", { cmc: 4, colors: ["R"], oracleText: "Provoke the Trolls deals 3 damage to any target. If a creature is dealt damage this way, it gets +5/+0 until end of turn." });
const pulseOfTheForge = () => card("Pulse of the Forge", "Instant", "{1}{R}{R}", { cmc: 3, colors: ["R"], oracleText: "Pulse of the Forge deals 4 damage to target player or planeswalker. Then if that player or that planeswalker's controller has more life than you, return Pulse of the Forge to its owner's hand." });
const riseOfTheDeathbringer = () => card("Rise of the Deathbringer", "Instant", "{4}{B}", { cmc: 5, colors: ["B"], oracleText: "Choose one —\n• Draw cards equal to the greatest power among creatures you control. You lose life equal to the number of cards drawn this way.\n• All creatures get -3/-3 until end of turn." });
const shadowsVerdict = () => card("Shadows' Verdict", "Sorcery", "{3}{B}{B}", { cmc: 5, colors: ["B"], oracleText: "Exile all creatures and planeswalkers with mana value 3 or less from the battlefield and all creature and planeswalker cards with mana value 3 or less from all graveyards." });
const silumgarScavenger = () => card("Silumgar Scavenger", "Creature — Zombie Bird", "{4}{B}", { cmc: 5, colors: ["B"], power: "2", toughness: "3", keywords: ["Flying","Exploit"], oracleText: "Flying\nExploit (When this creature enters, you may sacrifice a creature.)\nWhenever another creature you control dies, put a +1/+1 counter on this creature. It gains haste until end of turn if it exploited that creature." });
const stormfrontRiders = () => card("Stormfront Riders", "Creature — Human Soldier", "{4}{W}", { cmc: 5, colors: ["W"], power: "4", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, return two creatures you control to their owner's hand.\nWhenever this creature or another creature is returned to your hand from the battlefield, create a 1/1 white Soldier creature token." });
const strongholdOverseer = () => card("Stronghold Overseer", "Creature — Demon", "{3}{B}{B}{B}", { cmc: 6, colors: ["B"], power: "5", toughness: "5", keywords: ["Flying","Shadow"], oracleText: "Flying\nShadow (This creature can block or be blocked by only creatures with shadow.)\n{B}{B}: Creatures with shadow get +1/+0 until end of turn and creatures without shadow get -1/-0 until end of turn." });
const symmetryMatrix = () => card("Symmetry Matrix", "Artifact", "{4}", { cmc: 4, colors: [], oracleText: "Whenever a creature you control with power equal to its toughness enters, you may pay {1}. If you do, draw a card." });
const thoughtDistortion = () => card("Thought Distortion", "Sorcery", "{4}{B}{B}", { cmc: 6, colors: ["B"], oracleText: "This spell can't be countered.\nTarget opponent reveals their hand. Exile all noncreature, nonland cards from that player's hand and graveyard." });
const toTheSlaughter = () => card("To the Slaughter", "Instant", "{2}{B}", { cmc: 3, colors: ["B"], keywords: ["Delirium"], oracleText: "Target player sacrifices a creature or planeswalker of their choice.\nDelirium — If there are four or more card types among cards in your graveyard, instead that player sacrifices a creature and a planeswalker of their choice." });
const trompTheDomains = () => card("Tromp the Domains", "Sorcery", "{5}{G}", { cmc: 6, colors: ["G"], keywords: ["Domain"], oracleText: "Domain — Until end of turn, creatures you control gain trample and get +1/+1 for each basic land type among lands you control." });
const volitionReins = () => card("Volition Reins", "Enchantment — Aura", "{3}{U}{U}{U}", { cmc: 6, colors: ["U"], keywords: ["Enchant"], oracleText: "Enchant permanent\nWhen this Aura enters, if enchanted permanent is tapped, untap it.\nYou control enchanted permanent." });

// Test cards.
const vanilla = (name: string, typeLine: string, cost: string, cmc: number, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, cost, { cmc, power: String(p), toughness: String(t), ...extra });
const bearC = (name = "Plain Bear", p = 2, t = 2) => vanilla(name, "Creature — Bear", "{1}{G}", 2, p, t, { colors: ["G"] });
const bigC = (name = "Big Beast", p = 5, t = 5) => vanilla(name, "Creature — Beast", "{4}{G}", 5, p, t, { colors: ["G"] });
const golem = (name = "Test Golem", p = 2, t = 2) => vanilla(name, "Artifact Creature — Golem", "{2}", 2, p, t, { colors: [] });
const shade = () => vanilla("Test Shade", "Creature — Shade", "{1}{B}", 2, 2, 2, { colors: ["B"], keywords: ["Shadow"], oracleText: "Shadow" });
const opt = () => card("Test Opt", "Instant", "{U}", { cmc: 1, colors: ["U"], oracleText: "Draw a card." });
const bolt = () => card("Test Bolt", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Test Bolt deals 3 damage to any target." });
const divination = () => card("Test Divination", "Sorcery", "{2}{U}", { cmc: 3, colors: ["U"], oracleText: "Draw two cards." });
const unsummon = () => card("Test Unsummon", "Instant", "{U}", { cmc: 1, colors: ["U"], oracleText: "Return target nonland permanent to its owner's hand." });
const trinket = (name = "Test Trinket") => card(name, "Artifact", "{1}", { cmc: 1, colors: [] });
const walker = () => card("Test Walker", "Legendary Planeswalker — Jace", "{2}{U}", { cmc: 3, colors: ["U"], loyalty: "3", oracleText: "+1: Draw a card." });
const nonbasic = () => card("Test Vista", "Land", "", { oracleText: "{T}: Add {C}." });
const upkeepLife = () => card("Test Chalice", "Artifact", "{2}", { cmc: 2, colors: [], oracleText: "At the beginning of your upkeep, you gain 1 life." });
const kw = (s: GameState, id: string, k: string) => objHasKeyword(s, s.objects[id]!, k);
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

describe("Lane B round 52", () => {
  it("are fully supported", () => {
    supported(archangelOfWrath(), bobReluctantHYDRAAgent(), crowdControlWarden(), eonHub(), humOfTheRadix(), huntedNightmare(), infernoProject(), justiceVanceAstrovik(), latticeBladeMantis(), lavaBlister(), mageDuel(), masterSymmetrist(), mindCarver(), mindstormCrown(), neurokTransmuter(), provokeTheTrolls(), pulseOfTheForge(), riseOfTheDeathbringer(), shadowsVerdict(), silumgarScavenger(), stormfrontRiders(), strongholdOverseer(), symmetryMatrix(), thoughtDistortion(), toTheSlaughter(), trompTheDomains(), volitionReins());
  });

  it("Lava Blister: only a nonbasic land; it's destroyed unless its controller takes 6 damage", () => {
    const { s: s0, ap, opp, ids } = setup([lavaBlister()]);
    const basic = putOnBattlefield(s0, opp, card("Forest", "Basic Land — Forest"));
    expect(planCast(s0, ap, ids[0]!, [tgt(basic)])).toBeNull();
    const vista = putOnBattlefield(s0, opp, nonbasic());
    let s = castNow(s0, ap, ids[0]!, [tgt(vista)]);
    s = settle(s, (x) => x.pending?.player === opp);
    expect(s.pending?.player).toBe(opp);
    const [take] = botActions(s, opp);
    s = settle(act(s, take!));
    // One or the other, never both or neither.
    expect([zone(s, vista) === "graveyard", life(s, opp) === 34]).toContain(true);
    expect(zone(s, vista) === "graveyard" && life(s, opp) === 34).toBe(false);
  });

  it("Thought Distortion: exiles the noncreature, nonland cards from that player's hand and graveyard", () => {
    const { s: s0, ap, opp, ids } = setup([thoughtDistortion()]);
    onlyHand(s0, opp, []);
    const handOpt = toZone(s0, opp, opt(), "hand");
    const handBear = toZone(s0, opp, bearC(), "hand");
    const yardDiv = toZone(s0, opp, divination(), "graveyard");
    const yardLand = toZone(s0, opp, nonbasic(), "graveyard");
    const yardTrinket = toZone(s0, opp, trinket(), "graveyard");
    const s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]));
    expect([handOpt, handBear, yardDiv, yardLand, yardTrinket].map((id) => zone(s, id))).toEqual(["exile", "hand", "exile", "graveyard", "exile"]);
  });

  it("Tromp the Domains: creatures you control get +1/+1 for each basic land type and trample, fixed as it resolves", () => {
    const { s: s0, ap, opp, ids } = setup([trompTheDomains()]);
    const bear = putOnBattlefield(s0, ap, bearC());
    const theirs = putOnBattlefield(s0, opp, bearC());
    let s = settle(castNow(s0, ap, ids[0]!));
    // setup's lands: Mountain, Island, Forest, Plains, Swamp: five basic land types.
    expect([pt(s, bear), kw(s, bear, "Trample"), pt(s, theirs), kw(s, theirs, "Trample")]).toEqual(["7/7", true, "2/2", false]);
    const later = putOnBattlefield(s, ap, bearC("Late Bear"));
    for (const id of s.battlefield.filter((x) => controllerOf(s, s.objects[x]!) === ap && characteristics(s, s.objects[x]!).subtypes.includes("Island"))) s.objects[id]!.zone = "exile";
    s.battlefield = s.battlefield.filter((x) => s.objects[x]!.zone === "battlefield");
    invalidateCharacteristics(s);
    expect([pt(s, bear), pt(s, later), kw(s, later, "Trample")]).toEqual(["7/7", "2/2", false]);
  });

  it("Hum of the Radix: artifact spells cost {1} more for each artifact their caster controls", () => {
    const { s: s0, ap, opp, ids } = setup([trinket("Cast Trinket")]);
    putOnBattlefield(s0, opp, humOfTheRadix());
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, trinket(`Their Trinket ${i}`));
    putOnBattlefield(s0, ap, trinket("Mine A"));
    putOnBattlefield(s0, ap, trinket("Mine B"));
    const two = structuredClone(s0);
    poolOnly(two, ap, { C: 2 });
    expect(planCast(two, ap, ids[0]!)).toBeNull();
    const three = structuredClone(s0);
    poolOnly(three, ap, { C: 3 });
    const s = settle(castNow(three, ap, ids[0]!));
    expect(zone(s, ids[0]!)).toBe("battlefield");
  });

  it("Silumgar Scavenger: a counter whenever another creature you control dies; haste only if it exploited that creature", () => {
    for (const exploitIt of [true, false]) {
      const { s: s0, ap, ids } = setup([silumgarScavenger(), bolt()]);
      const bear = putOnBattlefield(s0, ap, bearC());
      const other = putOnBattlefield(s0, ap, bearC("Other Bear"));
      let s = castNow(s0, ap, ids[0]!);
      s = settle(s, at("pickPermanents", ap));
      expect(s.pending?.kind).toBe("pickPermanents");
      s = act(s, { type: "pickPermanents", player: ap, ids: exploitIt ? [bear] : [] } as Action);
      s = settle(s);
      if (!exploitIt) s = settle(castNow(s, ap, ids[1]!, [tgt(bear)]));
      expect([zone(s, bear), counters(s, ids[0]!), kw(s, ids[0]!, "Haste")]).toEqual(["graveyard", 1, exploitIt]);
      // Another creature dying later still gives a counter.
      if (exploitIt) expect(counters(settle(castNow(s, ap, ids[1]!, [tgt(other)])), ids[0]!)).toBe(2);
    }
  });

  it("Stormfront Riders: a Soldier for each creature of yours returned to your hand, itself included, not an opponent's", () => {
    const { s: s0, ap, opp, ids } = setup([stormfrontRiders(), unsummon()]);
    const bear = putOnBattlefield(s0, ap, bearC());
    const golemId = putOnBattlefield(s0, ap, golem());
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    let s = castNow(s0, ap, ids[0]!);
    s = settle(s, at("pickPermanents", ap));
    s = act(s, { type: "pickPermanents", player: ap, ids: [bear, golemId] } as Action);
    s = settle(s);
    expect([zone(s, bear), zone(s, golemId), tokensNamed(s, ap, "Soldier").length]).toEqual(["hand", "hand", 2]);
    s = settle(castNow(s, ap, ids[1]!, [tgt(theirs)]));
    expect([zone(s, theirs), tokensNamed(s, ap, "Soldier").length]).toEqual(["hand", 2]);
  });

  it("Stormfront Riders: returning itself makes a Soldier too", () => {
    const { s: s0, ap, ids } = setup([unsummon()]);
    const riders = putOnBattlefield(s0, ap, stormfrontRiders());
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(riders)]));
    expect([zone(s, riders), tokensNamed(s, ap, "Soldier").length]).toEqual(["hand", 1]);
  });

  it("Justice, Vance Astrovik: a counter when another nonland permanent you control is returned to its owner's hand", () => {
    const { s: s0, ap, opp, ids } = setup([unsummon(), unsummon(), unsummon()]);
    const justice = putOnBattlefield(s0, ap, justiceVanceAstrovik());
    const mine = putOnBattlefield(s0, ap, trinket());
    const theirs = putOnBattlefield(s0, opp, trinket("Their Trinket"));
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(mine)]));
    expect(counters(s, justice)).toBe(1);
    s = settle(castNow(s, ap, ids[1]!, [tgt(theirs)]));
    expect(counters(s, justice)).toBe(1);
    s = settle(castNow(s, ap, ids[2]!, [tgt(justice)]));
    expect(zone(s, justice)).toBe("hand");
  });

  it("Mindstorm Crown: draw if your hand was empty as the turn began, otherwise 1 damage to you", () => {
    const hands: number[] = [];
    for (const empty of [true, false]) {
      const { s: s0, ap } = setup([]);
      putOnBattlefield(s0, ap, mindstormCrown());
      onlyHand(s0, ap, empty ? [] : s0.players[ap]!.hand.slice(0, 1));
      const turn = s0.turn;
      const s = goUntil(s0, (x) => x.turn > turn && x.activePlayer === ap && x.step === "draw");
      expect(life(s, ap)).toBe(empty ? 40 : 39);
      hands.push(s.players[ap]!.hand.length);
    }
    // The empty hand drew one more card than it started with, the other drew none.
    expect(hands[0]).toBe(hands[1]);
  });

  it("Stronghold Overseer: creatures with shadow get +1/+0 and creatures without shadow get -1/-0", () => {
    const { s: s0, ap, opp } = setup([]);
    const overseer = putOnBattlefield(s0, ap, strongholdOverseer());
    const sh = putOnBattlefield(s0, ap, shade());
    const bear = putOnBattlefield(s0, ap, bearC());
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    const s = settle(run(s0, planActivate(s0, ap, overseer, 0)));
    expect([pt(s, overseer), pt(s, sh), pt(s, bear), pt(s, theirs)]).toEqual(["6/5", "3/2", "1/2", "1/2"]);
  });

  it("Provoke the Trolls: 3 damage to any target; a creature dealt damage gets +5/+0", () => {
    const { s: s0, ap, opp, ids } = setup([provokeTheTrolls(), provokeTheTrolls()]);
    const wall = putOnBattlefield(s0, ap, vanilla("Big Wall", "Creature — Wall", "{3}", 3, 1, 6, { colors: [] }));
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(wall)]));
    expect([pt(s, wall), s.objects[wall]!.damage]).toEqual(["6/6", 3]);
    s = settle(castNow(s, ap, ids[1]!, [ply(opp)]));
    expect(life(s, opp)).toBe(37);
  });

  it("Master Symmetrist: an attacking creature with power equal to its toughness gains trample", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, masterSymmetrist());
    const even = putOnBattlefield(s0, ap, bearC());
    const odd = putOnBattlefield(s0, ap, bearC("Odd Bear", 3, 2));
    const s = settle(attackWith(s0, [even, odd], opp));
    expect([kw(s, even, "Trample"), kw(s, odd, "Trample")]).toEqual([true, false]);
  });

  it("Symmetry Matrix: may pay {1} to draw when a creature with power equal to its toughness enters", () => {
    const { s: s0, ap, ids } = setup([bearC(), bearC("Odd Bear", 3, 2)]);
    putOnBattlefield(s0, ap, symmetryMatrix());
    let s = castNow(s0, ap, ids[0]!);
    s = settle(s, at("chooseMay", ap));
    expect(s.pending?.kind).toBe("chooseMay");
    const hand = s.players[ap]!.hand.length;
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 1 };
    s = settle(answerMay(s, ap, true));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    s = settle(castNow(s, ap, ids[1]!), at("chooseMay", ap));
    expect([s.pending?.kind, zone(s, ids[1]!)]).toEqual([undefined, "battlefield"]);
  });

  it("Mage Duel: costs {2} less after you've cast another instant or sorcery spell this turn, not a creature spell", () => {
    const { s: s0, ap, opp, ids } = setup([mageDuel(), opt(), bearC()]);
    const mine = putOnBattlefield(s0, ap, bearC("My Bear"));
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear", 1, 1));
    poolOnly(s0, ap, { G: 2 });
    let s = settle(castNow(s0, ap, ids[2]!));
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 1, C: 0 };
    expect(planCast(s, ap, ids[0]!, [tgt(mine), tgt(theirs)])).toBeNull();
    s.players[ap]!.manaPool = { W: 0, U: 1, B: 0, R: 0, G: 0, C: 0 };
    s = settle(castNow(s, ap, ids[1]!));
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 1, C: 0 };
    s = settle(castNow(s, ap, ids[0]!, [tgt(mine), tgt(theirs)]));
    expect([zone(s, theirs), pt(s, mine)]).toEqual(["graveyard", "3/4"]);
  });

  it("Inferno Project: enters with counters equal to the total mana value of instants and sorceries in your graveyard", () => {
    const { s: s0, ap, ids } = setup([infernoProject()]);
    toZone(s0, ap, opt(), "graveyard");
    toZone(s0, ap, divination(), "graveyard");
    toZone(s0, ap, bigC(), "graveyard");
    const s = settle(castNow(s0, ap, ids[0]!));
    expect([zone(s, ids[0]!), counters(s, ids[0]!)]).toEqual(["battlefield", 4]);
  });

  it("Crowd-Control Warden: counters for each other creature you control as it enters or is turned face up, not face down", () => {
    const { s: s0, ap, ids } = setup([crowdControlWarden(), crowdControlWarden()]);
    putOnBattlefield(s0, ap, bearC());
    putOnBattlefield(s0, ap, bearC("Other Bear"));
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(counters(s, ids[0]!)).toBe(2);
    s = settle(run(s, planCast(s, ap, ids[1]!, undefined, undefined, "auto", undefined, { faceDown: true })));
    expect([zone(s, ids[1]!), counters(s, ids[1]!)]).toEqual(["battlefield", 0]);
    s = run(s, planTurnFaceUp(s, ap, ids[1]!));
    // Three other creatures now: the two Bears and the first Warden.
    expect(counters(s, ids[1]!)).toBe(3);
  });

  it("Eon Hub: players skip their upkeep steps, so nothing triggers then", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, eonHub());
    putOnBattlefield(s0, ap, upkeepLife());
    const turn = s0.turn;
    const s = goUntil(s0, (x) => x.turn > turn && x.activePlayer === ap && x.step === "main1");
    expect(life(s, ap)).toBe(40);
    expect(s.log.some((l) => /skips their upkeep step/.test(typeof l === "string" ? l : JSON.stringify(l)))).toBe(true);
  });

  it("Rise of the Deathbringer: draw cards equal to the greatest power, lose that much life; or all creatures get -3/-3", () => {
    const { s: s0, ap, opp, ids } = setup([riseOfTheDeathbringer(), riseOfTheDeathbringer()]);
    putOnBattlefield(s0, ap, bigC("Four Power", 4, 4));
    const bear = putOnBattlefield(s0, ap, bearC());
    const big = putOnBattlefield(s0, opp, bigC());
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [], [0])));
    expect([s.players[ap]!.hand.length, life(s, ap)]).toEqual([hand - 1 + 4, 36]);
    s = settle(run(s, planCast(s, ap, ids[1]!, [], [1])));
    expect([zone(s, bear), pt(s, big)]).toEqual(["graveyard", "2/2"]);
  });

  it("To the Slaughter: a creature or planeswalker; with delirium, a creature and a planeswalker", () => {
    for (const delirium of [false, true]) {
      const { s: s0, ap, opp, ids } = setup([toTheSlaughter()]);
      const bear = putOnBattlefield(s0, opp, bearC());
      const w = putOnBattlefield(s0, opp, walker());
      s0.objects[w]!.counters.loyalty = 3;
      if (delirium) for (const d of [opt(), divination(), trinket(), nonbasic()]) toZone(s0, ap, d, "graveyard");
      const s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]));
      const gone = [bear, w].filter((id) => zone(s, id) === "graveyard").length;
      expect(gone).toBe(delirium ? 2 : 1);
    }
  });

  it("Shadows' Verdict: exiles creatures and planeswalkers with mana value 3 or less, and those cards from graveyards", () => {
    const { s: s0, ap, opp, ids } = setup([shadowsVerdict()]);
    const bear = putOnBattlefield(s0, opp, bearC());
    const w = putOnBattlefield(s0, ap, walker());
    s0.objects[w]!.counters.loyalty = 3;
    const big = putOnBattlefield(s0, opp, bigC());
    const yBear = toZone(s0, opp, bearC("Dead Bear"), "graveyard");
    const yBig = toZone(s0, opp, bigC("Dead Beast"), "graveyard");
    const yOpt = toZone(s0, ap, opt(), "graveyard");
    const yWalker = toZone(s0, ap, walker(), "graveyard");
    const s = settle(castNow(s0, ap, ids[0]!));
    expect([bear, w, big, yBear, yBig, yOpt, yWalker].map((id) => zone(s, id))).toEqual(["exile", "exile", "battlefield", "exile", "graveyard", "graveyard", "exile"]);
  });

  it("Neurok Transmuter: an artifact creature becomes blue and isn't an artifact until end of turn", () => {
    const { s: s0, ap } = setup([]);
    const nt = putOnBattlefield(s0, ap, neurokTransmuter());
    const g = putOnBattlefield(s0, ap, golem());
    const s = settle(run(s0, planActivate(s0, ap, nt, 1, [tgt(g)])));
    const c = characteristics(s, s.objects[g]!);
    expect([c.types, c.colors, c.subtypes]).toEqual([["Creature"], ["U"], ["Golem"]]);
  });

  it("Archangel of Wrath: one 2-damage trigger for each kicker paid", () => {
    for (const kicks of [[], [0], [0, 1]]) {
      const { s: s0, ap, opp, ids } = setup([archangelOfWrath()]);
      let s = run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, undefined, { kicks }));
      let asked = 0;
      for (let i = 0; i < 20 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
        if (s.pending?.kind === "chooseTargets" && s.pending.player === ap) {
          asked++;
          s = act(s, { type: "chooseTargets", player: ap, targets: [ply(opp)] } as Action);
        } else s = settle(s, at("chooseTargets", ap));
      }
      expect([asked, life(s, opp)]).toEqual([kicks.length, 40 - 2 * kicks.length]);
    }
  });

  it("Hunted Nightmare: target opponent puts a deathtouch counter on a creature they control", () => {
    const { s: s0, ap, opp, ids } = setup([huntedNightmare()]);
    const bear = putOnBattlefield(s0, opp, bearC());
    let s = castNow(s0, ap, ids[0]!);
    s = triggerTargets(s, ap, [ply(opp)]);
    s = settle(s);
    expect([counters(s, bear, "deathtouch"), kw(s, bear, "Deathtouch")]).toEqual([1, true]);
  });

  it("Pulse of the Forge: returns to hand only if that player has more life than you after the damage", () => {
    for (const theirLife of [40, 50]) {
      const { s: s0, ap, opp, ids } = setup([pulseOfTheForge()]);
      s0.players[opp]!.life = theirLife;
      const s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]));
      expect([life(s, opp), zone(s, ids[0]!)]).toEqual([theirLife - 4, theirLife === 50 ? "hand" : "graveyard"]);
    }
  });

  it("Mind Carver: +1/+0, or +3/+1 while an opponent has eight or more cards in their graveyard", () => {
    const { s: s0, ap, opp, ids } = setup([mindCarver()]);
    const bear = putOnBattlefield(s0, ap, bearC());
    let s = castNow(s0, ap, ids[0]!);
    s = triggerTargets(s, ap, [tgt(bear)]);
    s = settle(s);
    expect(pt(s, bear)).toBe("3/2");
    for (let i = 0; i < 8; i++) toZone(s, opp, bearC(`Dead ${i}`), "graveyard");
    invalidateCharacteristics(s);
    expect(pt(s, bear)).toBe("5/3");
  });

  it("Lattice-Blade Mantis: removing an oil counter as it attacks untaps it and gives +1/+1; with none, nothing", () => {
    for (const oil of [2, 0]) {
      const { s: s0, ap, opp } = setup([]);
      const m = putOnBattlefield(s0, ap, latticeBladeMantis());
      s0.objects[m]!.counters.oil = oil;
      let s = attackWith(s0, [m], opp);
      if (oil) {
        s = settle(s, at("chooseMay", ap));
        s = answerMay(s, ap, true);
      }
      s = settle(s);
      expect([s.objects[m]!.tapped, pt(s, m), counters(s, m, "oil")]).toEqual(oil ? [false, "5/4", 1] : [true, "4/3", 0]);
    }
  });

  it("Bob, Reluctant HYDRA Agent: attacking alone returns him to hand; then each opponent loses 2 life and you gain 2", () => {
    for (const alone of [true, false]) {
      const { s: s0, ap, opp } = setup([]);
      const bob = putOnBattlefield(s0, ap, bobReluctantHYDRAAgent());
      const other = putOnBattlefield(s0, ap, bearC());
      const s = settle(attackWith(s0, alone ? [bob] : [bob, other], opp));
      expect([zone(s, bob), life(s, ap), life(s, opp), life(s, s.turnOrder.find((p) => p !== ap && p !== opp)!)]).toEqual(alone ? ["hand", 42, 38, 38] : ["battlefield", 40, 40, 40]);
    }
  });

  it("Volition Reins: you control the permanent, and it untaps if it was tapped", () => {
    for (const tapped of [true, false]) {
      const { s: s0, ap, opp, ids } = setup([volitionReins()]);
      const bear = putOnBattlefield(s0, opp, bearC());
      s0.objects[bear]!.tapped = tapped;
      const s = settle(castNow(s0, ap, ids[0]!, [tgt(bear)]));
      expect([controllerOf(s, s.objects[bear]!), s.objects[bear]!.tapped]).toEqual([ap, false]);
    }
  });
});
