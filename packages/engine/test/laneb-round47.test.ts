// Lane B, round 47: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, scry, setup } from "./helpers";
import { abilitiesOf, botActions, characteristics, controllerOf, dealDamage, invalidateCharacteristics, isFullySupported, legalTargets, nameOf, objectSource, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "graveyard") => {
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

const toBlocks = (s: GameState) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const tapLands = (s: GameState, pid: PlayerId, keep: string[] = []) => {
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid && !keep.includes(id) && s.cards[s.objects[id]!.cardId]!.typeLine.includes("Land")) s.objects[id]!.tapped = true;
};


// Real oracle text (Scryfall).
const danceOfTheSkywise = () => card("Dance of the Skywise", "Instant", "{1}{U}", { cmc: 2, colors: ["U"], oracleText: "Until end of turn, target creature you control becomes a blue Dragon Illusion with base power and toughness 4/4, loses all abilities, and gains flying." });
const inquisitorsSnare = () => card("Inquisitor's Snare", "Instant", "{1}{W}", { cmc: 2, colors: ["W"], oracleText: "Prevent all damage target attacking or blocking creature would deal this turn. If that creature is black or red, destroy it." });
const graveyardShovel = () => card("Graveyard Shovel", "Artifact", "{2}", { cmc: 2, colors: [], oracleText: "{2}, {T}: Target player exiles a card from their graveyard. If it's a creature card, you gain 2 life." });
const wordOfUndoing = () => card("Word of Undoing", "Instant", "{U}", { cmc: 1, colors: ["U"], oracleText: "Return target creature and all white Auras you own attached to it to their owners' hands." });
const ragMan = () => card("Rag Man", "Creature — Human Minion", "{2}{B}{B}", { cmc: 4, colors: ["B"], power: "2", toughness: "1", oracleText: "{B}{B}{B}, {T}: Target opponent reveals their hand and discards a creature card at random. Activate only during your turn." });
const swiftReckoning = () => card("Swift Reckoning", "Sorcery", "{1}{W}", { cmc: 2, colors: ["W"], keywords: ["Spell mastery"], oracleText: "Spell mastery — If there are two or more instant and/or sorcery cards in your graveyard, you may cast this spell as though it had flash. (You may cast it any time you could cast an instant.)\nDestroy target tapped creature." });
const skeletonize = () => card("Skeletonize", "Instant", "{4}{R}", { cmc: 5, colors: ["R"], keywords: ["Regenerate"], oracleText: "Skeletonize deals 3 damage to target creature. When a creature dealt damage this way dies this turn, create a 1/1 black Skeleton creature token with \"{B}: Regenerate this token.\"" });
const wickedGuardian = () => card("Wicked Guardian", "Creature — Human Noble", "{3}{B}", { cmc: 4, colors: ["B"], power: "4", toughness: "2", oracleText: "When this creature enters, you may have it deal 2 damage to another creature you control. If you do, draw a card." });
const broodKeeper = () => card("Brood Keeper", "Creature — Human Shaman", "{3}{R}", { cmc: 4, colors: ["R"], power: "2", toughness: "3", oracleText: "Whenever an Aura becomes attached to this creature, create a 2/2 red Dragon creature token with flying. It has \"{R}: This creature gets +1/+0 until end of turn.\"" });
const brambleElemental = () => card("Bramble Elemental", "Creature — Elemental", "{3}{G}{G}", { cmc: 5, colors: ["G"], power: "4", toughness: "4", oracleText: "Whenever an Aura becomes attached to this creature, create two 1/1 green Saproling creature tokens." });
const electrozoa = () => card("Electrozoa", "Creature — Jellyfish", "{2}{U}", { cmc: 3, colors: ["U"], power: "3", toughness: "1", keywords: ["Flying","Flash"], oracleText: "Flash\nFlying\nWhen this creature enters, you get {E}{E} (two energy counters).\nAt the beginning of your first main phase, tap this creature unless you pay {E}." });
const cankerAbomination = () => card("Canker Abomination", "Creature — Treefolk Horror", "{2}{B/G}{B/G}", { cmc: 4, colors: ["B","G"], power: "6", toughness: "6", oracleText: "As this creature enters, choose an opponent. This creature enters with a -1/-1 counter on it for each creature that player controls." });
const hapatra = () => card("Hapatra, the Desert Fang", "Legendary Creature — Human Cleric", "{2}{B}{B}{G}", { cmc: 5, colors: ["B","G"], power: "3", toughness: "3", supertypes: ["Legendary"], oracleText: "When Hapatra enters, for each opponent, put X -1/-1 counters on up to one target creature that player controls, where X is the greatest mana value among cards in your graveyard." });
const murderousSpoils = () => card("Murderous Spoils", "Instant", "{5}{B}", { cmc: 6, colors: ["B"], oracleText: "Destroy target nonblack creature. It can't be regenerated. You gain control of all Equipment that were attached to it. (This effect lasts indefinitely.)" });
const desecratorHag = () => card("Desecrator Hag", "Creature — Hag", "{2}{B/G}{B/G}", { cmc: 4, colors: ["B","G"], power: "2", toughness: "2", oracleText: "When this creature enters, return to your hand the creature card in your graveyard with the greatest power. If two or more cards are tied for greatest power, you choose one of them." });
const telekineticBonds = () => card("Telekinetic Bonds", "Enchantment", "{2}{U}{U}{U}", { cmc: 5, colors: ["U"], oracleText: "Whenever a player discards a card, you may pay {1}{U}. If you do, you may tap or untap target permanent." });
const sludgeStrider = () => card("Sludge Strider", "Artifact Creature — Insect", "{1}{W}{U}{B}", { cmc: 4, colors: ["B","U","W"], power: "3", toughness: "3", oracleText: "Whenever another artifact you control enters or leaves the battlefield, you may pay {1}. If you do, target player loses 1 life and you gain 1 life." });
const candlesOfLeng = () => card("Candles of Leng", "Artifact", "{2}", { cmc: 2, colors: [], oracleText: "{4}, {T}: Reveal the top card of your library. If it has the same name as a card in your graveyard, put it into your graveyard. Otherwise, draw a card." });
const pitchstoneWall = () => card("Pitchstone Wall", "Creature — Wall", "{2}{R}", { cmc: 3, colors: ["R"], power: "2", toughness: "5", keywords: ["Defender"], oracleText: "Defender (This creature can't attack.)\nWhenever you discard a card, you may sacrifice this creature. If you do, return the discarded card from your graveyard to your hand." });
const erosion = () => card("Erosion", "Enchantment — Aura", "{U}{U}{U}", { cmc: 3, colors: ["U"], keywords: ["Enchant"], oracleText: "Enchant land\nAt the beginning of the upkeep of enchanted land's controller, destroy that land unless that player pays {1} or 1 life." });
const curseArtifact = () => card("Curse Artifact", "Enchantment — Aura", "{2}{B}{B}", { cmc: 4, colors: ["B"], keywords: ["Enchant"], oracleText: "Enchant artifact\nAt the beginning of the upkeep of enchanted artifact's controller, this Aura deals 2 damage to that player unless they sacrifice that artifact." });
const theWretched = () => card("The Wretched", "Creature — Demon", "{3}{B}{B}", { cmc: 5, colors: ["B"], power: "2", toughness: "5", oracleText: "At end of combat, gain control of all creatures blocking this creature for as long as you control this creature." });
const jovensFerrets = () => card("Joven's Ferrets", "Creature — Ferret", "{G}", { cmc: 1, colors: ["G"], power: "1", toughness: "1", oracleText: "Whenever this creature attacks, it gets +0/+2 until end of turn.\nAt end of combat, tap all creatures that blocked this creature this turn. They don't untap during their controller's next untap step." });
const venomousBreath = () => card("Venomous Breath", "Instant", "{3}{G}", { cmc: 4, colors: ["G"], oracleText: "Choose target creature. At this turn's next end of combat, destroy all creatures that blocked or were blocked by it this turn." });
const glyphOfDoom = () => card("Glyph of Doom", "Instant", "{B}", { cmc: 1, colors: ["B"], oracleText: "Choose target Wall creature. At this turn's next end of combat, destroy all creatures that were blocked by that creature this turn." });
const lurker = () => card("Lurker", "Creature — Beast", "{2}{G}", { cmc: 3, colors: ["G"], power: "2", toughness: "3", oracleText: "This creature can't be the target of spells unless it attacked or blocked this turn." });

// Newly supported by this round's templates.
const dragonshift = () => card("Dragonshift", "Instant", "{1}{U}{R}", { cmc: 3, colors: ["R", "U"], keywords: ["Overload"], oracleText: "Until end of turn, target creature you control becomes a blue and red Dragon with base power and toughness 4/4, loses all abilities, and gains flying.\nOverload {3}{U}{U}{R}{R} (You may cast this spell for its overload cost. If you do, change \"target\" in its text to \"each.\")" });
const serpentOfThePass = () => card("Serpent of the Pass", "Creature — Serpent", "{5}{U}{U}", { cmc: 7, colors: ["U"], power: "6", toughness: "5", oracleText: "If there are three or more Lesson cards in your graveyard, you may cast this spell as though it had flash.\nThis spell costs {1} less to cast for each noncreature, nonland card in your graveyard." });
const wicksPatrol = () => card("Wick's Patrol", "Creature — Rat Warlock", "{4}{B}{B}", { cmc: 6, colors: ["B"], power: "5", toughness: "3", keywords: ["Mill"], oracleText: "When this creature enters, mill three cards. When you do, target creature an opponent controls gets -X/-X until end of turn, where X is the greatest mana value among cards in your graveyard." });

// Test cards.
const vanilla = (name: string, typeLine: string, cost: string, cmc: number, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, cost, { cmc, power: String(p), toughness: String(t), ...extra });
const kill = () => card("Test Kill", "Instant", "{1}", { cmc: 1, oracleText: "Destroy target creature." });
const shatter = () => card("Test Shatter", "Instant", "{1}", { cmc: 1, oracleText: "Destroy target artifact." });
const opt = () => card("Test Opt", "Instant", "{U}", { cmc: 1, colors: ["U"], oracleText: "Draw a card." });
const rock = (cmc: number) => card(`Test Rock ${cmc}`, "Artifact", `{${cmc}}`, { cmc });
const bearC = (name = "Plain Bear", p = 2, t = 2, colors: CardDef["colors"] = ["G"]) => vanilla(name, "Creature — Bear", "{1}{G}", 2, p, t, { colors });
const wall = (name = "Test Wall", p = 0, t = 4) => vanilla(name, "Creature — Wall", "{1}{W}", 2, p, t, { colors: ["W"], keywords: ["Defender"], oracleText: "Defender" });
const aura = (name: string, cost: string, colors: CardDef["colors"]) => card(name, "Enchantment — Aura", cost, { cmc: 1, colors, keywords: ["Enchant"], oracleText: "Enchant creature" });
const sword = () => card("Test Sword", "Artifact — Equipment", "{1}", { cmc: 1, keywords: ["Equip"], oracleText: "Equipped creature gets +1/+1.\nEquip {1}" });
const mindRot = () => card("Test Mind Rot", "Sorcery", "{B}", { cmc: 1, colors: ["B"], oracleText: "Target player discards a card." });
const loot = () => card("Test Loot", "Sorcery", "{U}", { cmc: 1, colors: ["U"], oracleText: "Discard a card." });

const handSize = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.length;
const tokens = (s: GameState, pid: PlayerId, subtype: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).subtypes.includes(subtype));
const keywords = (s: GameState, id: string) => characteristics(s, s.objects[id]!).keywords;
const ability = (s: GameState, id: string, re: RegExp) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => re.test(a.text ?? ""));
const answerMay = (s: GameState, pid: PlayerId, yes: boolean) => act(s, { type: "chooseMay", player: pid, yes });
const attach = (s: GameState, id: string, host: string) => {
  s.objects[id]!.attachedTo = host;
  invalidateCharacteristics(s);
};
/** Passes until `pid` is asked to choose targets for a trigger, then chooses `targets`. */
const triggerTargets = (s: GameState, pid: PlayerId, targets: TargetChoice[]) => {
  s = settle(s, at("chooseTargets", pid));
  expect(s.pending?.kind).toBe("chooseTargets");
  return act(s, { type: "chooseTargets", player: pid, targets } as Action);
};
/** Answers a punisher's choice with the option whose label matches `re`. */
const punish = (s: GameState, re: RegExp) => {
  const p = s.pending;
  if (p?.kind !== "chooseOption" || p.what !== "punisher") throw new Error(`no punisher choice: ${p?.kind}`);
  const labels = p.labels ?? [];
  const i = labels.findIndex((l) => re.test(l));
  if (i < 0) throw new Error(`no option ${re} in ${labels.join(" / ")}`);
  return act(s, { type: "chooseOption", player: p.player, choice: p.options[i]! } as Action);
};

describe("Lane B round 47 cards", () => {
  it("are fully supported", () => {
    supported(danceOfTheSkywise(), inquisitorsSnare(), graveyardShovel(), wordOfUndoing(), ragMan(), swiftReckoning(), skeletonize(), wickedGuardian(), broodKeeper(), brambleElemental(), electrozoa(), cankerAbomination(), hapatra(), murderousSpoils(), desecratorHag(), telekineticBonds(), sludgeStrider(), candlesOfLeng(), pitchstoneWall(), erosion(), curseArtifact(), theWretched(), jovensFerrets(), venomousBreath(), glyphOfDoom(), lurker(), dragonshift(), serpentOfThePass(), wicksPatrol());
  });
});

describe("Dance of the Skywise", () => {
  it("makes a creature a blue 4/4 Dragon Illusion that loses its abilities but has flying", () => {
    const { s: s0, ap, ids } = setup([danceOfTheSkywise()]);
    const b = putOnBattlefield(s0, ap, vanilla("Test Lifelinker", "Creature — Cat", "{W}", 1, 1, 1, { colors: ["W"], keywords: ["Lifelink"], oracleText: "Lifelink" }));
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(b)]));
    const c = characteristics(s, s.objects[b]!);
    expect([pt(s, b), c.colors, c.subtypes, keywords(s, b)]).toEqual(["4/4", ["U"], ["Dragon", "Illusion"], ["Flying"]]);
  });
});

describe("Inquisitor's Snare", () => {
  it("prevents the attacker's damage and destroys it only if it's black or red", () => {
    const { s: s0, ap, ids, opp } = setup([inquisitorsSnare(), inquisitorsSnare()]);
    const black = putOnBattlefield(s0, ap, bearC("Black Bear", 2, 2, ["B"]));
    const green = putOnBattlefield(s0, ap, bearC("Green Bear", 3, 3, ["G"]));
    let s = attackWith(s0, [black, green], opp);
    s = settle(castNow(s, ap, ids[0]!, [tgt(black)]));
    s = settle(castNow(s, ap, ids[1]!, [tgt(green)]));
    expect([zone(s, black), zone(s, green)]).toEqual(["graveyard", "battlefield"]);
    const before = life(s, opp);
    s = goUntil(s, (x) => x.step === "main2");
    expect(life(s, opp)).toBe(before);
  });
});

describe("Graveyard Shovel", () => {
  it("has the player exile a card from their graveyard and gains 2 life if it's a creature card", () => {
    const { s: s0, ap, opp } = setup([]);
    const shovel = putOnBattlefield(s0, ap, graveyardShovel());
    const dead = toZone(s0, opp, bearC("Dead Bear"), "graveyard");
    const n = life(s0, ap);
    let s = settle(run(s0, planActivate(s0, ap, shovel, 0, [ply(opp)])));
    expect([zone(s, dead), life(s, ap)]).toEqual(["exile", n + 2]);
    // A noncreature card: no life.
    s.objects[shovel]!.tapped = false;
    const spell = toZone(s, opp, opt(), "graveyard");
    s = settle(run(s, planActivate(s, ap, shovel, 0, [ply(opp)])));
    expect([zone(s, spell), life(s, ap)]).toEqual(["exile", n + 2]);
  });
});

describe("Word of Undoing", () => {
  it("returns the creature and only the white Auras you own attached to it", () => {
    const { s: s0, ap, ids, opp } = setup([wordOfUndoing()]);
    const target = putOnBattlefield(s0, opp, bearC("Their Bear"));
    const myWhite = putOnBattlefield(s0, ap, aura("My White Aura", "{W}", ["W"]));
    const myBlue = putOnBattlefield(s0, ap, aura("My Blue Aura", "{U}", ["U"]));
    const theirWhite = putOnBattlefield(s0, opp, aura("Their White Aura", "{W}", ["W"]));
    for (const a of [myWhite, myBlue, theirWhite]) attach(s0, a, target);
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(target)]));
    expect([zone(s, target), zone(s, myWhite), zone(s, myBlue), zone(s, theirWhite)]).toEqual(["hand", "hand", "graveyard", "graveyard"]);
    expect(s.players[ap]!.hand).toContain(myWhite);
  });
});

describe("Rag Man", () => {
  it("has the opponent reveal their hand and discard a creature card at random", () => {
    const { s: s0, ap, opp } = setup([]);
    const rag = putOnBattlefield(s0, ap, ragMan());
    onlyHand(s0, opp, []);
    const creature = toZone(s0, opp, bearC("Hidden Bear"), "hand");
    const spells = [toZone(s0, opp, opt(), "hand"), toZone(s0, opp, opt(), "hand")];
    s0.players[ap]!.manaPool.B = 3;
    const s = settle(run(s0, planActivate(s0, ap, rag, 0, [ply(opp)])));
    expect([zone(s, creature), ...spells.map((id) => zone(s, id))]).toEqual(["graveyard", "hand", "hand"]);
  });
});

describe("Swift Reckoning", () => {
  it("destroys a tapped creature and can be cast as though it had flash with spell mastery", () => {
    const { s: s0, ap, opp } = setup([]);
    const victim = putOnBattlefield(s0, opp, bearC("Tapped Bear"));
    s0.objects[victim]!.tapped = true;
    let s = goUntil(s0, (x) => x.activePlayer !== ap && x.step === "main1" && waitingOn(x) === ap && !x.pending);
    s.objects[victim]!.tapped = true;
    s.players[ap]!.manaPool.W = 2;
    const sr = toZone(s, ap, swiftReckoning(), "hand");
    expect(planCast(s, ap, sr, [tgt(victim)])).toBeNull();
    toZone(s, ap, opt(), "graveyard");
    toZone(s, ap, opt(), "graveyard");
    s = settle(castNow(s, ap, sr, [tgt(victim)]));
    expect(zone(s, victim)).toBe("graveyard");
  });
});

describe("Skeletonize", () => {
  it("makes a Skeleton when a creature it dealt damage to dies this turn", () => {
    const { s: s0, ap, ids, opp } = setup([skeletonize(), skeletonize(), kill()]);
    const small = putOnBattlefield(s0, opp, bearC("Small", 2, 2));
    const big = putOnBattlefield(s0, opp, bearC("Big", 2, 5));
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(small)]));
    const sk = tokens(s, ap, "Skeleton");
    expect([zone(s, small), sk.length, pt(s, sk[0]!), characteristics(s, s.objects[sk[0]!]!).colors]).toEqual(["graveyard", 1, "1/1", ["B"]]);
    expect(ability(s, sk[0]!, /Regenerate/)).toBeGreaterThanOrEqual(0);
    s = settle(castNow(s, ap, ids[1]!, [tgt(big)]));
    expect([zone(s, big), tokens(s, ap, "Skeleton").length]).toEqual(["battlefield", 1]);
    s = settle(castNow(s, ap, ids[2]!, [tgt(big)]));
    expect([zone(s, big), tokens(s, ap, "Skeleton").length]).toEqual(["graveyard", 2]);
  });
});

describe("Wicked Guardian", () => {
  it("may deal 2 damage to another creature you control to draw a card", () => {
    const { s: s0, ap, ids } = setup([wickedGuardian()]);
    const other = putOnBattlefield(s0, ap, bearC("Sturdy Bear", 2, 4));
    onlyHand(s0, ap, [ids[0]!]);
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseMay", ap));
    s = settle(answerMay(s, ap, true));
    expect([s.objects[other]!.damage, s.objects[ids[0]!]!.damage ?? 0, handSize(s, ap)]).toEqual([2, 0, 1]);
  });
  it("draws nothing when you decline", () => {
    const { s: s0, ap, ids } = setup([wickedGuardian()]);
    const other = putOnBattlefield(s0, ap, bearC("Sturdy Bear", 2, 4));
    onlyHand(s0, ap, [ids[0]!]);
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseMay", ap));
    s = settle(answerMay(s, ap, false));
    expect([s.objects[other]!.damage ?? 0, handSize(s, ap)]).toEqual([0, 0]);
  });
});

describe("Brood Keeper and Bramble Elemental", () => {
  it("make tokens whenever an Aura becomes attached to them", () => {
    const { s: s0, ap, ids } = setup([aura("Test Aura", "{W}", ["W"]), aura("Test Aura Two", "{W}", ["W"])]);
    const keeper = putOnBattlefield(s0, ap, broodKeeper());
    const bramble = putOnBattlefield(s0, ap, brambleElemental());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(keeper)]));
    const dragons = tokens(s, ap, "Dragon");
    expect([dragons.length, pt(s, dragons[0]!), keywords(s, dragons[0]!)]).toEqual([1, "2/2", ["Flying"]]);
    expect(ability(s, dragons[0]!, /\+1\/\+0/)).toBeGreaterThanOrEqual(0);
    s = settle(castNow(s, ap, ids[1]!, [tgt(bramble)]));
    expect(tokens(s, ap, "Saproling").length).toBe(2);
  });
  it("triggers when an Aura is moved onto it, but not for Equipment", () => {
    const { s: s0, ap } = setup([]);
    const keeper = putOnBattlefield(s0, ap, broodKeeper());
    const sword_ = putOnBattlefield(s0, ap, sword());
    let s = settle(run(s0, planActivate(s0, ap, sword_, 0, [tgt(keeper)])));
    expect(tokens(s, ap, "Dragon").length).toBe(0);
    const host = putOnBattlefield(s, ap, bearC("Host"));
    const a = putOnBattlefield(s, ap, aura("Test Aura", "{W}", ["W"]));
    attach(s, a, host);
    const shifter = putOnBattlefield(s, ap, card("Test Shifter", "Artifact", "{1}", { cmc: 1, oracleText: "{1}: Attach target Aura you control to target creature." }));
    s = settle(run(s, planActivate(s, ap, shifter, 0, [tgt(a), tgt(keeper)])));
    expect([s.objects[a]!.attachedTo, tokens(s, ap, "Dragon").length]).toEqual([keeper, 1]);
  });
});

describe("Electrozoa", () => {
  it("gets two energy and taps at your first main phase unless you pay one", () => {
    const { s: s0, ap, ids } = setup([electrozoa()]);
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(s.players[ap]!.energy).toBe(2);
    s = goUntil(s, at("chooseMay", ap));
    expect([s.step, s.activePlayer]).toEqual(["main1", ap]);
    s = settle(answerMay(s, ap, true));
    expect([s.players[ap]!.energy, s.objects[ids[0]!]!.tapped ?? false]).toEqual([1, false]);
  });
  it("taps when you don't pay", () => {
    const { s: s0, ap, ids } = setup([electrozoa()]);
    let s = settle(castNow(s0, ap, ids[0]!));
    s = goUntil(s, at("chooseMay", ap));
    s = settle(answerMay(s, ap, false));
    expect([s.players[ap]!.energy, s.objects[ids[0]!]!.tapped]).toEqual([2, true]);
  });
});

describe("Canker Abomination", () => {
  it("enters with a -1/-1 counter for each creature the chosen opponent controls", () => {
    const { s: s0, ap, ids, opp } = setup([cankerAbomination()]);
    for (const n of ["A", "B", "C"]) putOnBattlefield(s0, opp, bearC(`Bear ${n}`));
    let s = castNow(s0, ap, ids[0]!);
    for (let i = 0; i < 50 && !(s.pending?.kind === "chooseOption" && s.pending.player === ap); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const p = s.pending;
    if (p?.kind !== "chooseOption") throw new Error("no player choice");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(opp) }));
    expect([counters(s, ids[0]!, "-1/-1"), pt(s, ids[0]!)]).toEqual([3, "3/3"]);
  });
});

describe("Hapatra, the Desert Fang", () => {
  it("puts X -1/-1 counters, X the greatest mana value among cards in your graveyard", () => {
    const { s: s0, ap, ids, opp } = setup([hapatra()]);
    const victim = putOnBattlefield(s0, opp, bearC("Big Bear", 6, 6));
    toZone(s0, ap, rock(3), "graveyard");
    toZone(s0, ap, rock(5), "graveyard");
    const others = s0.turnOrder.filter((p) => p !== ap && p !== opp).length;
    let s = triggerTargets(castNow(s0, ap, ids[0]!), ap, [tgt(victim), ...Array.from({ length: others }, (): TargetChoice => ({ kind: "none" }) as unknown as TargetChoice)]);
    s = settle(s);
    expect(counters(s, victim, "-1/-1")).toBe(5);
  });
});

describe("Murderous Spoils", () => {
  it("destroys the creature and takes the Equipment that was attached to it", () => {
    const { s: s0, ap, ids, opp } = setup([murderousSpoils()]);
    const target = putOnBattlefield(s0, opp, bearC("Armed Bear"));
    const eq = putOnBattlefield(s0, opp, sword());
    const other = putOnBattlefield(s0, opp, sword());
    attach(s0, eq, target);
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(target)]));
    expect([zone(s, target), controllerOf(s, s.objects[eq]!), controllerOf(s, s.objects[other]!)]).toEqual(["graveyard", ap, opp]);
  });
});

describe("Desecrator Hag", () => {
  it("returns the creature card with the greatest power from your graveyard", () => {
    const { s: s0, ap, ids } = setup([desecratorHag()]);
    const weak = toZone(s0, ap, bearC("Weak Bear", 1, 5), "graveyard");
    const strong = toZone(s0, ap, bearC("Strong Bear", 4, 1), "graveyard");
    toZone(s0, ap, rock(7), "graveyard");
    const s = settle(castNow(s0, ap, ids[0]!));
    expect([zone(s, strong), zone(s, weak)]).toEqual(["hand", "graveyard"]);
  });
});

describe("Telekinetic Bonds", () => {
  it("may pay {1}{U} when a player discards to tap a permanent", () => {
    const { s: s0, ap, ids, opp } = setup([mindRot()]);
    putOnBattlefield(s0, ap, telekineticBonds());
    const victim = putOnBattlefield(s0, opp, bearC("Their Bear"));
    let s = triggerTargets(castNow(s0, ap, ids[0]!, [ply(opp)]), ap, [tgt(victim)]);
    s = settle(s, at("chooseMay", ap));
    Object.assign(s.players[ap]!.manaPool, { U: 1, C: 1 });
    s = settle(answerMay(s, ap, true), at("chooseMay", ap));
    if (s.pending?.kind === "chooseMay") s = settle(answerMay(s, ap, true));
    expect(s.objects[victim]!.tapped).toBe(true);
  });
});

describe("Sludge Strider", () => {
  it("drains 1 when another artifact you control enters or leaves, for {1}", () => {
    const { s: s0, ap, ids, opp } = setup([rock(1), shatter()]);
    putOnBattlefield(s0, ap, sludgeStrider());
    const n = [life(s0, ap), life(s0, opp)];
    let s = triggerTargets(castNow(s0, ap, ids[0]!), ap, [ply(opp)]);
    s = settle(s, at("chooseMay", ap));
    s.players[ap]!.manaPool.C = 1;
    s = settle(answerMay(s, ap, true));
    expect([life(s, ap), life(s, opp)]).toEqual([n[0]! + 1, n[1]! - 1]);
    // And when one leaves.
    s = triggerTargets(settle(castNow(s, ap, ids[1]!, [tgt(ids[0]!)]), at("chooseTargets", ap)), ap, [ply(opp)]);
    s = settle(s, at("chooseMay", ap));
    s.players[ap]!.manaPool.C = 1;
    s = settle(answerMay(s, ap, true));
    expect([life(s, ap), life(s, opp)]).toEqual([n[0]! + 2, n[1]! - 2]);
  });
});

describe("Candles of Leng", () => {
  it("mills the revealed card if a card with its name is in your graveyard, otherwise draws it", () => {
    const { s: s0, ap } = setup([]);
    const candles = putOnBattlefield(s0, ap, candlesOfLeng());
    toZone(s0, ap, opt(), "graveyard");
    const same = toZone(s0, ap, opt(), "library");
    let s = settle(run(s0, planActivate(s0, ap, candles, 0)));
    expect(zone(s, same)).toBe("graveyard");
    s.objects[candles]!.tapped = false;
    const other = toZone(s, ap, rock(2), "library");
    s = settle(run(s, planActivate(s, ap, candles, 0)));
    expect(zone(s, other)).toBe("hand");
  });
});

describe("Pitchstone Wall", () => {
  it("may be sacrificed to return the discarded card", () => {
    const { s: s0, ap, ids } = setup([loot()]);
    const wallId = putOnBattlefield(s0, ap, pitchstoneWall());
    onlyHand(s0, ap, [ids[0]!]);
    const keep = toZone(s0, ap, bearC("Precious Bear"), "hand");
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseMay", ap));
    expect(zone(s, keep)).toBe("graveyard");
    s = settle(answerMay(s, ap, true));
    expect([zone(s, wallId), zone(s, keep)]).toEqual(["graveyard", "hand"]);
  });
});

describe("Erosion", () => {
  it("destroys the enchanted land at its controller's upkeep unless they pay {1} or 1 life", () => {
    const { s: s0, ap, opp } = setup([]);
    const land = putOnBattlefield(s0, opp, card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." }));
    const e = putOnBattlefield(s0, ap, erosion());
    attach(s0, e, land);
    let s = goUntil(s0, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "punisher");
    expect([s.activePlayer, s.pending?.player]).toEqual([opp, opp]);
    const n = life(s, opp);
    s = settle(punish(s, /life/i));
    expect([zone(s, land), life(s, opp)]).toEqual(["battlefield", n - 1]);
  });
  it("destroys it when they don't pay", () => {
    const { s: s0, ap, opp } = setup([]);
    const land = putOnBattlefield(s0, opp, card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." }));
    const e = putOnBattlefield(s0, ap, erosion());
    attach(s0, e, land);
    let s = goUntil(s0, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "punisher");
    s = settle(punish(s, /penalty/i));
    expect(zone(s, land)).toBe("graveyard");
  });
});

describe("Curse Artifact", () => {
  it("deals 2 damage to the enchanted artifact's controller unless they sacrifice that artifact", () => {
    const { s: s0, ap, opp } = setup([]);
    const art = putOnBattlefield(s0, opp, rock(4));
    const otherArt = putOnBattlefield(s0, opp, rock(2));
    const c = putOnBattlefield(s0, ap, curseArtifact());
    attach(s0, c, art);
    let s = goUntil(s0, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "punisher");
    const n = life(s, opp);
    s = settle(punish(s, /penalty/i));
    expect([life(s, opp), zone(s, art)]).toEqual([n - 2, "battlefield"]);
    // Next time: sacrificing only that artifact.
    s = goUntil(s, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "punisher");
    s = settle(punish(s, /^Sacrifice the enchanted artifact$/));
    expect([life(s, opp), zone(s, art), zone(s, otherArt)]).toEqual([n - 2, "graveyard", "battlefield"]);
  });
});

describe("The Wretched", () => {
  it("gains control of the creatures blocking it at end of combat for as long as you control it", () => {
    const { s: s0, ap, ids, opp } = setup([kill()]);
    const w = putOnBattlefield(s0, ap, theWretched());
    const b1 = putOnBattlefield(s0, opp, wall("Wall One"));
    const b2 = putOnBattlefield(s0, opp, wall("Wall Two"));
    const idle = putOnBattlefield(s0, opp, wall("Idle Wall"));
    let s = toBlocks(attackWith(s0, [w], opp));
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b1, attacker: w }, { blocker: b2, attacker: w }] });
    s = goUntil(s, (x) => x.step === "main2");
    expect([b1, b2, idle].map((id) => controllerOf(s, s.objects[id]!))).toEqual([ap, ap, opp]);
    s = settle(castNow(s, ap, ids[0]!, [tgt(w)]));
    expect([b1, b2].map((id) => controllerOf(s, s.objects[id]!))).toEqual([opp, opp]);
  });
});

describe("Joven's Ferrets", () => {
  it("taps the creatures that blocked it, and they don't untap during their next untap step", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, jovensFerrets());
    const b = putOnBattlefield(s0, opp, wall("Blocking Wall", 0, 4));
    const idle = putOnBattlefield(s0, opp, wall("Idle Wall"));
    let s = toBlocks(attackWith(s0, [f], opp));
    expect(pt(s, f)).toBe("1/3");
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b, attacker: f }] });
    s = goUntil(s, (x) => x.step === "main2");
    expect([s.objects[b]!.tapped, s.objects[idle]!.tapped ?? false, s.objects[b]!.skipNextUntap]).toEqual([true, false, true]);
  });
});

describe("Venomous Breath", () => {
  it("destroys the creatures that blocked the target this turn at end of combat", () => {
    const { s: s0, ap, ids, opp } = setup([venomousBreath()]);
    const a = putOnBattlefield(s0, ap, bearC("Attacker", 1, 5));
    const other = putOnBattlefield(s0, ap, bearC("Other Attacker", 1, 5));
    const b1 = putOnBattlefield(s0, opp, wall("Wall One"));
    const b2 = putOnBattlefield(s0, opp, wall("Wall Two"));
    let s = toBlocks(attackWith(s0, [a, other], opp));
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b1, attacker: a }, { blocker: b2, attacker: other }] });
    for (let i = 0; i < 20 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = castNow(s, ap, ids[0]!, [tgt(a)]);
    s = goUntil(s, (x) => x.step === "main2");
    expect([zone(s, b1), zone(s, b2), zone(s, a), zone(s, other)]).toEqual(["graveyard", "battlefield", "battlefield", "battlefield"]);
  });
  it("does nothing when cast after combat", () => {
    const { s: s0, ap, ids, opp } = setup([venomousBreath()]);
    const a = putOnBattlefield(s0, ap, bearC("Attacker", 1, 5));
    const b1 = putOnBattlefield(s0, opp, wall("Wall One"));
    let s = toBlocks(attackWith(s0, [a], opp));
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b1, attacker: a }] });
    s = goUntil(s, (x) => x.step === "main2" && waitingOn(x) === ap && !x.pending);
    s = settle(castNow(s, ap, ids[0]!, [tgt(a)]));
    s = goUntil(s, (x) => x.activePlayer === opp && x.step === "main2");
    expect([zone(s, b1), s.delayed?.length ?? 0]).toEqual(["battlefield", 0]);
  });
});

describe("Glyph of Doom", () => {
  it("destroys the creatures the target Wall blocked this turn at end of combat", () => {
    const { s: s0, ap, ids, opp } = setup([glyphOfDoom()]);
    const a = putOnBattlefield(s0, ap, bearC("Attacker", 1, 5));
    const free = putOnBattlefield(s0, ap, bearC("Unblocked", 1, 1));
    const w = putOnBattlefield(s0, opp, wall("Their Wall"));
    let s = toBlocks(attackWith(s0, [a, free], opp));
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: w, attacker: a }] });
    for (let i = 0; i < 20 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(planCast(s, ap, ids[0]!, [tgt(a)])).toBeNull();
    s = castNow(s, ap, ids[0]!, [tgt(w)]);
    s = goUntil(s, (x) => x.step === "main2");
    expect([zone(s, a), zone(s, free), zone(s, w)]).toEqual(["graveyard", "battlefield", "battlefield"]);
  });
});

describe("Lurker", () => {
  it("can't be the target of spells unless it attacked or blocked this turn", () => {
    const { s: s0, ap, ids, opp } = setup([kill()]);
    const l = putOnBattlefield(s0, ap, lurker());
    expect(planCast(s0, ap, ids[0]!, [tgt(l)])).toBeNull();
    let s = attackWith(s0, [l], opp);
    expect(planCast(s, ap, ids[0]!, [tgt(l)])).not.toBeNull();
    s = settle(castNow(s, ap, ids[0]!, [tgt(l)]));
    expect(zone(s, l)).toBe("graveyard");
  });
});

describe("Wick's Patrol", () => {
  it("gives -X/-X, X the greatest mana value among cards in your graveyard after the mill", () => {
    const { s: s0, ap, ids, opp } = setup([wicksPatrol()]);
    const victim = putOnBattlefield(s0, opp, bearC("Huge Bear", 9, 9));
    toZone(s0, ap, rock(4), "graveyard");
    for (const c of [rock(1), rock(2), rock(7)]) toZone(s0, ap, c, "library");
    let s = triggerTargets(settle(castNow(s0, ap, ids[0]!), at("chooseTargets", ap)), ap, [tgt(victim)]);
    s = settle(s);
    expect(pt(s, victim)).toBe("2/2");
  });
});
