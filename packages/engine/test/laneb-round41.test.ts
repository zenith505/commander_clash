// Lane B, round 41: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const subtypesOf = (s: GameState, id: string) => characteristics(s, s.objects[id]!).subtypes;
const mine = (s: GameState, pid: PlayerId, sub: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && subtypesOf(s, id).includes(sub));
const yes = (s: GameState, pid: PlayerId) => act(s, { type: "chooseMay", player: pid, yes: true });
const find = (s: GameState, pid: PlayerId, found: string[]) => act(s, { type: "searchLibrary", player: pid, found });
/** Leaves only `keep` in `pid`'s hand (setup's hand also holds the seven cards drawn). */
const onlyHand = (s: GameState, pid: PlayerId, keep: string[]) => {
  const p = s.players[pid]!;
  for (const id of p.hand.filter((id) => !keep.includes(id))) {
    s.objects[id]!.zone = "exile";
    p.exile.push(id);
  }
  p.hand = p.hand.filter((id) => keep.includes(id));
};
const discard = (s: GameState, pid: PlayerId, objectIds: string[]) => act(s, { type: "discard", player: pid, objectIds });

// Real oracle text (Scryfall).
const deathByDragons = () => card("Death by Dragons", "Sorcery", "{4}{R}{R}", { cmc: 6, colors: ["R"], oracleText: "Each player other than target player creates a 5/5 red Dragon creature token with flying." });
const tectonicHellion = () => card("Tectonic Hellion", "Creature — Hellion", "{5}{R}{R}", { cmc: 7, colors: ["R"], power: "8", toughness: "5", keywords: ["Haste"], oracleText: "Haste\nWhenever this creature attacks, each player who controls the most lands sacrifices two lands of their choice." });
const ronasVortex = () => card("Rona's Vortex", "Instant", "{U}", { cmc: 1, colors: ["U"], keywords: ["Kicker"], oracleText: "Kicker {2}{B} (You may pay an additional {2}{B} as you cast this spell.)\nReturn target creature or planeswalker you don't control to its owner's hand. If this spell was kicked, put that permanent on the bottom of its owner's library instead." });
const divineSmite = () => card("Divine Smite", "Instant", "{1}{W}", { cmc: 2, colors: ["W"], oracleText: "Target creature or planeswalker an opponent controls phases out. If that permanent is black, exile it instead. (If it phases out, treat it and anything attached to it as though they don't exist until its controller's next turn.)" });
const heatedArgument = () => card("Heated Argument", "Instant", "{4}{R}", { cmc: 5, colors: ["R"], oracleText: "Heated Argument deals 6 damage to target creature. You may exile a card from your graveyard. If you do, Heated Argument also deals 2 damage to that creature's controller." });
const goblinTinkerer = () => card("Goblin Tinkerer", "Creature — Goblin Artificer", "{1}{R}", { cmc: 2, colors: ["R"], power: "1", toughness: "2", oracleText: "{R}, {T}: Destroy target artifact. That artifact deals damage equal to its mana value to this creature." });

const elektra = () => card("Elektra, Femme Fatale", "Legendary Creature — Human Assassin Hero", "{3}{R}", { cmc: 4, colors: ["R"], power: "3", toughness: "2", oracleText: "When Elektra enters, you may have her deal 2 damage to you. When you do, she deals 4 damage to target creature." });
const monoistCircuitFeeder = () => card("Monoist Circuit-Feeder", "Artifact Creature — Nautilus", "{4}{B}{B}", { cmc: 6, colors: ["B"], power: "4", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, until end of turn, target creature you control gets +X/+0 and target creature an opponent controls gets -0/-X, where X is the number of artifacts you control." });
const deadlyGrub = () => card("Deadly Grub", "Creature — Insect", "{2}{B}", { cmc: 3, colors: ["B"], power: "3", toughness: "1", keywords: ["Vanishing"], oracleText: "Vanishing 3 (This creature enters with three time counters on it. At the beginning of your upkeep, remove a time counter from it. When the last is removed, sacrifice it.)\nWhen this creature dies, if it had no time counters on it, create a 6/1 green Insect creature token with shroud. (It can't be the target of spells or abilities.)" });
const chronozoa = () => card("Chronozoa", "Creature — Illusion", "{3}{U}", { cmc: 4, colors: ["U"], power: "3", toughness: "3", keywords: ["Flying", "Vanishing"], oracleText: "Flying\nVanishing 3 (This creature enters with three time counters on it. At the beginning of your upkeep, remove a time counter from it. When the last is removed, sacrifice it.)\nWhen this creature dies, if it had no time counters on it, create two tokens that are copies of it." });
const retchedWretch = () => card("Retched Wretch", "Creature — Goblin", "{2}{B}", { cmc: 3, colors: ["B"], power: "4", toughness: "2", oracleText: "When this creature dies, if it had a -1/-1 counter on it, return it to the battlefield under its owner's control and it loses all abilities." });
const eidolonOfObstruction = () => card("Eidolon of Obstruction", "Enchantment Creature — Spirit", "{1}{W}", { cmc: 2, colors: ["W"], power: "2", toughness: "1", keywords: ["First strike"], oracleText: "First strike\nLoyalty abilities of planeswalkers your opponents control cost {1} more to activate." });
const boomScholar = () => card("Boom Scholar", "Creature — Goblin Advisor", "{1}{R}{G}", { cmc: 3, colors: ["G", "R"], power: "3", toughness: "3", keywords: ["Exhaust"], oracleText: "Exhaust abilities of other permanents you control cost {2} less to activate.\nExhaust — {4}{R}{G}: Creatures and Vehicles you control gain trample until end of turn. Put two +1/+1 counters on this creature. (Activate each exhaust ability only once.)" });
const afterburnerExpert = () => card("Afterburner Expert", "Creature — Goblin Artificer", "{2}{G}", { cmc: 3, colors: ["G"], power: "4", toughness: "2", keywords: ["Exhaust"], oracleText: "Exhaust — {2}{G}{G}: Put two +1/+1 counters on this creature. (Activate each exhaust ability only once.)\nWhenever you activate an exhaust ability, return this card from your graveyard to the battlefield." });
const rangersRefueler = () => card("Rangers' Refueler", "Artifact — Vehicle", "{1}{U}", { cmc: 2, colors: ["U"], power: "3", toughness: "3", keywords: ["Crew", "Exhaust"], oracleText: "Whenever you activate an exhaust ability, draw a card.\nExhaust — {4}: This Vehicle becomes an artifact creature. Put a +1/+1 counter on it. (Activate each exhaust ability only once.)\nCrew 2 (Tap any number of creatures you control with total power 2 or more: This Vehicle becomes an artifact creature until end of turn.)" });
const circleOfTheMoonDruid = () => card("Circle of the Moon Druid", "Creature — Human Elf Druid", "{2}{G}", { cmc: 3, colors: ["G"], power: "2", toughness: "4", oracleText: "Bear Form — During your turn, this creature is a Bear with base power and toughness 4/2. (It loses all other creature types.)" });
const mossPitSkeleton = () => card("Moss-Pit Skeleton", "Creature — Plant Skeleton", "{B}{G}", { cmc: 2, colors: ["B", "G"], power: "2", toughness: "2", keywords: ["Kicker"], oracleText: "Kicker {3} (You may pay an additional {3} as you cast this spell.)\nIf this creature was kicked, it enters with three +1/+1 counters on it.\nWhenever one or more +1/+1 counters are put on a creature you control, if this card is in your graveyard, you may put this card on top of your library." });
const pyrewildShaman = () => card("Pyrewild Shaman", "Creature — Goblin Shaman", "{2}{R}", { cmc: 3, colors: ["R"], power: "3", toughness: "1", keywords: ["Bloodrush"], oracleText: "Bloodrush — {1}{R}, Discard this card: Target attacking creature gets +3/+1 until end of turn.\nWhenever one or more creatures you control deal combat damage to a player, if this card is in your graveyard, you may pay {3}. If you do, return this card to your hand." });
const auntiesSnitch = () => card("Auntie's Snitch", "Creature — Goblin Rogue", "{2}{B}", { cmc: 3, colors: ["B"], power: "3", toughness: "1", keywords: ["Prowl"], oracleText: "This creature can't block.\nProwl {1}{B} (You may cast this for its prowl cost if you dealt combat damage to a player this turn with a Goblin or Rogue.)\nWhenever a Goblin or Rogue you control deals combat damage to a player, if this card is in your graveyard, you may return this card to your hand." });
const bloodOperative = () => card("Blood Operative", "Creature — Vampire Assassin", "{1}{B}{B}", { cmc: 3, colors: ["B"], power: "3", toughness: "1", keywords: ["Lifelink"], oracleText: "Lifelink\nWhen this creature enters, you may exile target card from a graveyard.\nWhenever you surveil, if this card is in your graveyard, you may pay 3 life. If you do, return this card to your hand." });
const dungeonCrawler = () => card("Dungeon Crawler", "Creature — Zombie", "{B}", { cmc: 1, colors: ["B"], power: "2", toughness: "1", oracleText: "This creature enters tapped.\nWhenever you complete a dungeon, you may return this card from your graveyard to your hand." });
const heraldOfAnafenza = () => card("Herald of Anafenza", "Creature — Human Soldier", "{W}", { cmc: 1, colors: ["W"], power: "1", toughness: "2", keywords: ["Outlast"], oracleText: "Outlast {2}{W} ({2}{W}, {T}: Put a +1/+1 counter on this creature. Outlast only as a sorcery.)\nWhenever you activate this creature's outlast ability, create a 1/1 white Warrior creature token." });

const shauku = () => card("Shauku, Endbringer", "Legendary Creature — Vampire", "{5}{B}{B}", { cmc: 7, colors: ["B"], power: "5", toughness: "5", keywords: ["Flying"], oracleText: "Flying\nShauku can't attack if there's another creature on the battlefield.\nAt the beginning of your upkeep, you lose 3 life.\n{T}: Exile target creature and put a +1/+1 counter on Shauku." });
const mindBomb = () => card("Mind Bomb", "Sorcery", "{U}", { cmc: 1, colors: ["U"], oracleText: "Each player may discard up to three cards. Mind Bomb deals damage to each player equal to 3 minus the number of cards they discarded this way." });
const renounce = () => card("Renounce", "Instant", "{1}{W}", { cmc: 2, colors: ["W"], oracleText: "Sacrifice any number of permanents. You gain 2 life for each permanent sacrificed this way." });
const suddenReclamation = () => card("Sudden Reclamation", "Instant", "{3}{G}", { cmc: 4, colors: ["G"], oracleText: "Mill four cards, then return a creature card and a land card from your graveyard to your hand." });
const corpseAppraiser = () => card("Corpse Appraiser", "Creature — Vampire Rogue", "{U}{B}{R}", { cmc: 3, colors: ["B", "R", "U"], power: "3", toughness: "3", oracleText: "When this creature enters, exile up to one target creature card from a graveyard. If a card is put into exile this way, look at the top three cards of your library, then put one of those cards into your hand and the rest into your graveyard." });

const creature = (name: string, typeLine: string, cost: string, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, cost, { power: String(p), toughness: String(t), ...extra });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2, { cmc: 2, colors: ["G"] });
const hillGiant = () => creature("Hill Giant", "Creature — Giant", "{3}{R}", 3, 3, { cmc: 4, colors: ["R"] });
const blackKnight = () => creature("Black Knight", "Creature — Human Knight", "{B}{B}", 2, 2, { cmc: 2, colors: ["B"] });
const study = () => card("Quick Study", "Sorcery", "{U}", { cmc: 1, colors: ["U"], oracleText: "Draw a card." });
const walker = () => card("Test Walker", "Legendary Planeswalker — Jace", "{2}{U}", { cmc: 3, colors: ["U"], loyalty: "3", oracleText: "+1: Draw a card." });
const growth = () => card("Test Growth", "Instant", "{G}", { cmc: 1, colors: ["G"], oracleText: "Put a +1/+1 counter on target creature." });
const peek = () => card("Test Peek", "Sorcery", "{U}", { cmc: 1, colors: ["U"], oracleText: "Surveil 2." });
const doom = () => card("Test Doom", "Instant", "{B}", { cmc: 1, colors: ["B"], oracleText: "Destroy target creature." });
const relic = (cost: string, cmc: number, extra: Partial<CardDef> = {}) => card("Test Relic", "Artifact", cost, { cmc, ...extra });
const tokensNamed = (s: GameState, pid: PlayerId, sub: string) => mine(s, pid, sub).filter((id) => s.objects[id]!.isToken);
const landsOf = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).types.includes("Land"));

describe("Lane B round 41", () => {
  it("compiles every card fully", () => {
    supported(deathByDragons(), tectonicHellion(), ronasVortex(), divineSmite(), heatedArgument(), goblinTinkerer());
    supported(elektra(), monoistCircuitFeeder(), deadlyGrub(), chronozoa(), retchedWretch(), eidolonOfObstruction(), boomScholar(), afterburnerExpert());
    supported(rangersRefueler(), circleOfTheMoonDruid(), mossPitSkeleton(), pyrewildShaman(), auntiesSnitch(), bloodOperative(), dungeonCrawler(), heraldOfAnafenza());
    supported(shauku(), mindBomb(), renounce(), suddenReclamation(), corpseAppraiser());
    supported(greenBear(), hillGiant(), blackKnight(), study(), walker(), growth(), peek(), doom());
  });
});

describe("Players by what they control", () => {
  it("Death by Dragons: every player but the target creates a 5/5 flying Dragon", () => {
    const { s: s0, ap, ids, opp } = setup([deathByDragons()]);
    const s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]));
    for (const p of s.turnOrder) expect(tokensNamed(s, p, "Dragon").length, `p${p}`).toBe(p === opp ? 0 : 1);
    const d = tokensNamed(s, ap, "Dragon")[0]!;
    expect([pt(s, d), objHasKeyword(s, s.objects[d]!, "Flying"), characteristics(s, s.objects[d]!).colors]).toEqual(["5/5", true, ["R"]]);
  });

  it("Death by Dragons: nobody gets a Dragon if the target player has left the game (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([deathByDragons()]);
    let s = run(s0, planCast(s0, ap, ids[0]!, [ply(opp)]));
    s.players[opp]!.lost = true;
    s = settle(s);
    expect(s.turnOrder.map((p) => tokensNamed(s, p, "Dragon").length)).toEqual([0, 0, 0, 0]);
  });

  it("Tectonic Hellion: each player tied for the most lands sacrifices two of them", () => {
    const { s: s0, ap, opp } = setup([]);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    for (let i = 0; i < 14; i++) putOnBattlefield(s0, opp, card(`Opp Land ${i}`, "Land"));
    for (let i = 0; i < 5; i++) putOnBattlefield(s0, third, card(`Third Land ${i}`, "Land"));
    const h = putOnBattlefield(s0, ap, tectonicHellion());
    const s = settle(attackWith(s0, [h], opp));
    expect([landsOf(s, ap).length, landsOf(s, opp).length, landsOf(s, third).length]).toEqual([12, 12, 5]);
  });

  it("Tectonic Hellion: only the one player with the most lands sacrifices", () => {
    const { s: s0, ap, opp } = setup([]);
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, card(`Opp Land ${i}`, "Land"));
    const h = putOnBattlefield(s0, ap, tectonicHellion());
    const s = settle(attackWith(s0, [h], opp));
    expect([landsOf(s, ap).length, landsOf(s, opp).length]).toEqual([12, 3]);
  });
});

describe("Riders on one target", () => {
  it("Rona's Vortex: unkicked, the creature goes to its owner's hand", () => {
    const { s: s0, ap, ids, opp } = setup([ronasVortex()]);
    const g = putOnBattlefield(s0, opp, hillGiant());
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(g)]));
    expect([zone(s, g), s.players[opp]!.hand.includes(g)]).toEqual(["hand", true]);
  });

  it("Rona's Vortex: kicked, it goes on the bottom of its owner's library instead", () => {
    const { s: s0, ap, ids, opp } = setup([ronasVortex()]);
    const g = putOnBattlefield(s0, opp, hillGiant());
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(g)], { kicks: [0] }));
    expect([zone(s, g), s.players[opp]!.library.at(-1)]).toEqual(["library", g]);
  });

  it("Rona's Vortex: can't target your own creature", () => {
    const { s: s0, ap, ids } = setup([ronasVortex()]);
    const g = putOnBattlefield(s0, ap, hillGiant());
    expect(planCast(s0, ap, ids[0]!, [tgt(g)])).toBeNull();
  });

  it("Divine Smite: a nonblack creature phases out", () => {
    const { s: s0, ap, ids, opp } = setup([divineSmite()]);
    const g = putOnBattlefield(s0, opp, hillGiant());
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(g)]));
    expect(zone(s, g)).toBe("phasedOut");
  });

  it("Divine Smite: a black creature is exiled instead", () => {
    const { s: s0, ap, ids, opp } = setup([divineSmite()]);
    const k = putOnBattlefield(s0, opp, blackKnight());
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(k)]));
    expect(zone(s, k)).toBe("exile");
  });

  it("Heated Argument: 6 damage, and 2 to the controller if you exile a card from your graveyard", () => {
    const { s: s0, ap, ids, opp } = setup([heatedArgument()]);
    const g = putOnBattlefield(s0, opp, hillGiant());
    const c = toZone(s0, ap, study(), "graveyard");
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(g)]), at("chooseMay", ap));
    s = settle(yes(s, ap), (x) => x.pending?.player === ap);
    if (s.pending?.kind === "searchLibrary") s = find(s, ap, [c]);
    s = settle(s);
    expect([zone(s, g), zone(s, c), life(s, opp)]).toEqual(["graveyard", "exile", 38]);
  });

  it("Heated Argument: no card exiled, no damage to the player", () => {
    const { s: s0, ap, ids, opp } = setup([heatedArgument()]);
    const g = putOnBattlefield(s0, opp, hillGiant());
    const c = toZone(s0, ap, study(), "graveyard");
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(g)]), at("chooseMay", ap));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect([zone(s, g), zone(s, c), life(s, opp)]).toEqual(["graveyard", "graveyard", 40]);
  });

  it("Goblin Tinkerer: destroys the artifact, which deals its mana value to the Tinkerer", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, goblinTinkerer());
    const r = putOnBattlefield(s0, opp, relic("{3}", 3));
    const s = settle(run(s0, planActivate(s0, ap, t, 0, [tgt(r)])));
    expect([zone(s, r), zone(s, t)]).toEqual(["graveyard", "graveyard"]);
  });

  it("Goblin Tinkerer: a one-mana artifact deals 1 and the Tinkerer survives", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, goblinTinkerer());
    const r = putOnBattlefield(s0, opp, relic("{1}", 1, { name: "Red Relic" }));
    const s = settle(run(s0, planActivate(s0, ap, t, 0, [tgt(r)])));
    expect([zone(s, r), zone(s, t), s.objects[t]!.damage]).toEqual(["graveyard", "battlefield", 1]);
  });

  it("Goblin Tinkerer: an indestructible artifact still deals the damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, goblinTinkerer());
    const r = putOnBattlefield(s0, opp, relic("{2}", 2, { keywords: ["Indestructible"], oracleText: "Indestructible" }));
    const s = settle(run(s0, planActivate(s0, ap, t, 0, [tgt(r)])));
    expect([zone(s, r), zone(s, t)]).toEqual(["battlefield", "graveyard"]);
  });
});

describe("Enters and dies", () => {
  it("Elektra: you may take 2; when you do, she deals 4 to the target creature", () => {
    const { s: s0, ap, ids, opp } = setup([elektra()]);
    const g = putOnBattlefield(s0, opp, creature("Big Giant", "Creature — Giant", "{4}{R}", 5, 5, { cmc: 5, colors: ["R"] }));
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseMay", ap));
    s = settle(yes(s, ap), at("chooseTargets", ap));
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(g)] } as Action));
    expect([life(s, ap), s.objects[g]!.damage]).toEqual([38, 4]);
  });

  it("Elektra: no damage to you, no damage to the creature", () => {
    const { s: s0, ap, ids, opp } = setup([elektra()]);
    const g = putOnBattlefield(s0, opp, hillGiant());
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseMay", ap));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect([life(s, ap), s.objects[g]!.damage, s.pending]).toEqual([40, 0, null]);
  });

  it("Monoist Circuit-Feeder: +X/+0 to your creature and -0/-X to theirs, X the artifacts you control", () => {
    const { s: s0, ap, ids, opp } = setup([monoistCircuitFeeder()]);
    const mine = putOnBattlefield(s0, ap, greenBear());
    const theirs = putOnBattlefield(s0, opp, creature("Big Giant", "Creature — Giant", "{4}{R}", 5, 5, { cmc: 5, colors: ["R"] }));
    putOnBattlefield(s0, ap, relic("{1}", 1));
    putOnBattlefield(s0, ap, relic("{2}", 2));
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseTargets", ap));
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(mine), tgt(theirs)] } as Action));
    expect([pt(s, mine), pt(s, theirs)]).toEqual(["5/2", "5/2"]);
  });

  it("Monoist Circuit-Feeder: needs a creature of yours and one of an opponent's to target", () => {
    const { s: s0, ap, ids, opp } = setup([monoistCircuitFeeder()]);
    const theirs = putOnBattlefield(s0, opp, hillGiant());
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseTargets", ap));
    const feeder = ids[0]!;
    // The Circuit-Feeder itself is the only creature you control: it may be the first target.
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(feeder), tgt(theirs)] } as Action));
    expect([pt(s, feeder), pt(s, theirs)]).toEqual(["5/4", "3/2"]);
  });

  it("Deadly Grub: dies with no time counters, a 6/1 Insect with shroud", () => {
    const { s: s0, ap, ids } = setup([doom()]);
    const g = putOnBattlefield(s0, ap, deadlyGrub());
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(g)]));
    const t = tokensNamed(s, ap, "Insect");
    expect(t.length).toBe(1);
    expect([pt(s, t[0]!), objHasKeyword(s, s.objects[t[0]!]!, "Shroud"), characteristics(s, s.objects[t[0]!]!).colors]).toEqual(["6/1", true, ["G"]]);
  });

  it("Deadly Grub: dies with a time counter still on it, nothing", () => {
    const { s: s0, ap, ids } = setup([doom()]);
    const g = putOnBattlefield(s0, ap, deadlyGrub());
    s0.objects[g]!.counters.time = 1;
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(g)]));
    expect(tokensNamed(s, ap, "Insect").length).toBe(0);
  });

  it("Chronozoa: dies with no time counters, two token copies that enter with three time counters (rulings)", () => {
    const { s: s0, ap, ids } = setup([doom()]);
    const c = putOnBattlefield(s0, ap, chronozoa());
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(c)]));
    const copies = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).name === "Chronozoa");
    expect(copies.map((id) => s.objects[id]!.counters.time)).toEqual([3, 3]);
  });

  it("Retched Wretch: with a -1/-1 counter it returns without abilities, so a second death keeps it in the graveyard", () => {
    const { s: s0, ap, ids } = setup([doom(), doom()]);
    const w = putOnBattlefield(s0, ap, retchedWretch());
    s0.objects[w]!.counters["-1/-1"] = 1;
    invalidateCharacteristics(s0);
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(w)]));
    expect([zone(s, w), pt(s, w), s.objects[w]!.controller]).toEqual(["battlefield", "4/2", ap]);
    s.objects[w]!.counters["-1/-1"] = 1;
    invalidateCharacteristics(s);
    s = settle(castNow(s, ap, ids[1]!, [tgt(w)]));
    expect(zone(s, w)).toBe("graveyard");
  });

  it("Retched Wretch: without a -1/-1 counter it stays dead", () => {
    const { s: s0, ap, ids } = setup([doom()]);
    const w = putOnBattlefield(s0, ap, retchedWretch());
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(w)]));
    expect(zone(s, w)).toBe("graveyard");
  });
});

describe("Activation costs", () => {
  const tappedLands = (s: GameState, pid: PlayerId) => landsOf(s, pid).filter((id) => s.objects[id]!.tapped).length;

  it("Eidolon of Obstruction: an opponent's loyalty ability costs {1} more", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, eidolonOfObstruction());
    const w = putOnBattlefield(s0, ap, walker());
    s0.objects[w]!.counters.loyalty = 3;
    const s = settle(run(s0, planActivate(s0, ap, w, 0)));
    expect([s.objects[w]!.counters.loyalty, tappedLands(s, ap)]).toEqual([4, 1]);
  });

  it("Eidolon of Obstruction: not your own planeswalkers", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, eidolonOfObstruction());
    const w = putOnBattlefield(s0, ap, walker());
    s0.objects[w]!.counters.loyalty = 3;
    const s = settle(run(s0, planActivate(s0, ap, w, 0)));
    expect([s.objects[w]!.counters.loyalty, tappedLands(s, ap)]).toEqual([4, 0]);
  });

  it("Boom Scholar: another permanent's exhaust ability costs {2} less, its own doesn't", () => {
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, boomScholar());
    const a = putOnBattlefield(s0, ap, afterburnerExpert());
    let s = settle(run(s0, planActivate(s0, ap, a, 0)));
    expect([pt(s, a), tappedLands(s, ap)]).toEqual(["6/4", 2]);
    s = settle(run(s, planActivate(s, ap, b, 0)));
    expect([pt(s, b), tappedLands(s, ap)]).toEqual(["5/5", 8]);
  });

  it("Afterburner Expert: returns from your graveyard when you activate an exhaust ability", () => {
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, rangersRefueler());
    const a = toZone(s0, ap, afterburnerExpert(), "graveyard");
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planActivate(s0, ap, r, 0)));
    expect([zone(s, a), s.players[ap]!.hand.length, s.objects[r]!.counters["+1/+1"]]).toEqual(["battlefield", hand + 1, 1]);
  });

  it("Afterburner Expert: another player's exhaust ability doesn't return it", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = toZone(s0, opp, afterburnerExpert(), "graveyard");
    const r = putOnBattlefield(s0, ap, rangersRefueler());
    const s = settle(run(s0, planActivate(s0, ap, r, 0)));
    expect(zone(s, a)).toBe("graveyard");
  });

  it("Herald of Anafenza: activating its outlast makes a 1/1 Warrior first, then the counter", () => {
    const { s: s0, ap } = setup([]);
    const h = putOnBattlefield(s0, ap, heraldOfAnafenza());
    const other = putOnBattlefield(s0, ap, heraldOfAnafenza());
    let s = run(s0, planActivate(s0, ap, h, 0));
    expect(s.stack.length).toBe(2);
    s = settle(s);
    const w = tokensNamed(s, ap, "Warrior");
    expect([w.length, pt(s, w[0]!), pt(s, h), pt(s, other)]).toEqual([1, "1/1", "2/3", "1/2"]);
  });
});

describe("Bear Form", () => {
  it("Circle of the Moon Druid: a 4/2 Bear during your turn, a 2/4 Human Elf Druid otherwise", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, circleOfTheMoonDruid());
    expect([pt(s0, d), subtypesOf(s0, d)]).toEqual(["4/2", ["Bear"]]);
    const s = goUntil(s0, (x) => x.activePlayer === opp && x.step === "main1");
    expect([pt(s, d), subtypesOf(s, d)]).toEqual(["2/4", ["Human", "Elf", "Druid"]]);
  });

  it("Circle of the Moon Druid: +1/+1 counters still count on the Bear", () => {
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, circleOfTheMoonDruid());
    s0.objects[d]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    expect(pt(s0, d)).toBe("5/3");
  });
});

describe("From the graveyard", () => {
  it("Moss-Pit Skeleton: a +1/+1 counter on your creature lets you put it on top of your library", () => {
    const { s: s0, ap, ids } = setup([growth()]);
    const m = toZone(s0, ap, mossPitSkeleton(), "graveyard");
    const bear = putOnBattlefield(s0, ap, greenBear());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(bear)]), at("chooseMay", ap));
    s = settle(yes(s, ap));
    expect([zone(s, m), s.players[ap]!.library[0]]).toEqual(["library", m]);
  });

  it("Moss-Pit Skeleton: not for a counter on an opponent's creature", () => {
    const { s: s0, ap, ids, opp } = setup([growth()]);
    const m = toZone(s0, ap, mossPitSkeleton(), "graveyard");
    const bear = putOnBattlefield(s0, opp, greenBear());
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(bear)]));
    expect([zone(s, m), s.pending]).toEqual(["graveyard", null]);
  });

  it("Moss-Pit Skeleton: a creature entering with +1/+1 counters counts too (rulings)", () => {
    const { s: s0, ap, ids } = setup([mossPitSkeleton()]);
    const m = toZone(s0, ap, mossPitSkeleton(), "graveyard");
    let s = settle(castNow(s0, ap, ids[0]!, [], { kicks: [0] }), at("chooseMay", ap));
    s = settle(yes(s, ap));
    expect([pt(s, ids[0]!), zone(s, m)]).toEqual(["5/5", "library"]);
  });

  it("Pyrewild Shaman: combat damage to a player, pay {3} to return it to your hand", () => {
    const { s: s0, ap, opp } = setup([]);
    const p = toZone(s0, ap, pyrewildShaman(), "graveyard");
    const bear = putOnBattlefield(s0, ap, greenBear());
    let s = goUntil(attackWith(s0, [bear], opp), (x) => at("chooseMay", ap)(x) || x.step === "main2");
    expect(s.pending?.kind === "chooseMay" && s.pending.pay).toMatchObject({ mana: "{3}" });
    for (const a of botActions(s, ap)) s = act(s, a);
    s = settle(s);
    expect([zone(s, p), life(s, opp)]).toEqual(["hand", 38]);
  });

  it("Auntie's Snitch: a Goblin or Rogue's combat damage returns it to your hand", () => {
    const { s: s0, ap, opp } = setup([]);
    const sn = toZone(s0, ap, auntiesSnitch(), "graveyard");
    const g = putOnBattlefield(s0, ap, creature("Goblin Raider", "Creature — Goblin", "{1}{R}", 2, 2, { cmc: 2, colors: ["R"] }));
    let s = goUntil(attackWith(s0, [g], opp), (x) => at("chooseMay", ap)(x) || x.step === "main2");
    s = settle(yes(s, ap));
    expect(zone(s, sn)).toBe("hand");
  });

  it("Auntie's Snitch: another creature's damage doesn't", () => {
    const { s: s0, ap, opp } = setup([]);
    const sn = toZone(s0, ap, auntiesSnitch(), "graveyard");
    const bear = putOnBattlefield(s0, ap, greenBear());
    const s = goUntil(attackWith(s0, [bear], opp), (x) => x.pending?.kind === "chooseMay" || x.step === "main2");
    expect([zone(s, sn), life(s, opp), s.pending]).toEqual(["graveyard", 38, null]);
  });

  it("Blood Operative: when you surveil, pay 3 life to return it", () => {
    const { s: s0, ap, ids } = setup([peek()]);
    const b = toZone(s0, ap, bloodOperative(), "graveyard");
    let s = settle(castNow(s0, ap, ids[0]!), at("arrangeTop", ap));
    for (const a of botActions(s, ap)) s = act(s, a);
    s = settle(s, at("chooseMay", ap));
    s = settle(yes(s, ap));
    expect([zone(s, b), life(s, ap)]).toEqual(["hand", 37]);
  });
});

describe("Dungeon Crawler", () => {
  it("completing a dungeon lets you return it from your graveyard to your hand", () => {
    const { s: s0, ap } = setup([]);
    const d = toZone(s0, ap, dungeonCrawler(), "graveyard");
    s0.players[ap]!.dungeon = { name: "Tomb of Annihilation", room: 4 };
    let s = goUntil(act(s0, { type: "passPriority", player: ap }), at("chooseMay", ap));
    s = settle(yes(s, ap));
    expect([zone(s, d), s.players[ap]!.completedDungeons]).toEqual(["hand", ["Tomb of Annihilation"]]);
  });

  it("another player's dungeon doesn't", () => {
    const { s: s0, ap, opp } = setup([]);
    const d = toZone(s0, ap, dungeonCrawler(), "graveyard");
    s0.players[opp]!.dungeon = { name: "Tomb of Annihilation", room: 4 };
    const s = settle(act(s0, { type: "passPriority", player: ap }));
    expect([zone(s, d), s.players[opp]!.completedDungeons, s.pending?.kind]).toEqual(["graveyard", ["Tomb of Annihilation"], undefined]);
  });
});

describe("Shauku, Endbringer", () => {
  it("can't attack while another creature is on the battlefield, anyone's", () => {
    const { s: s0, ap, opp } = setup([]);
    const sh = putOnBattlefield(s0, ap, shauku());
    const bear = putOnBattlefield(s0, opp, greenBear());
    let s = goUntil(s0, (x) => x.pending?.kind === "declareAttackers" || x.step === "main2");
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: sh, defender: opp }] })).toThrow();
    s = goUntil(s, (x) => x.step === "main2");
    expect(zone(s, bear)).toBe("battlefield");
  });

  it("attacks when it's the only creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const sh = putOnBattlefield(s0, ap, shauku());
    const s = goUntil(attackWith(s0, [sh], opp), (x) => x.step === "main2");
    expect(life(s, opp)).toBe(35);
  });

  it("{T}: exile target creature and put a +1/+1 counter on it", () => {
    const { s: s0, ap, opp } = setup([]);
    const sh = putOnBattlefield(s0, ap, shauku());
    const bear = putOnBattlefield(s0, opp, greenBear());
    const s = settle(run(s0, planActivate(s0, ap, sh, 0, [tgt(bear)])));
    expect([zone(s, bear), pt(s, sh)]).toEqual(["exile", "6/6"]);
  });
});

describe("Discard and sacrifice what you like", () => {
  it("Mind Bomb: each player discards up to three, and is dealt 3 minus that many", () => {
    const { s: s0, ap, ids, opp } = setup([mindBomb()]);
    let s = settle(castNow(s0, ap, ids[0]!), at("discard", ap));
    expect(s.pending?.kind === "discard" && [s.pending.count, s.pending.upTo]).toEqual([3, true]);
    const two = s.players[ap]!.hand.slice(0, 2);
    s = discard(s, ap, two);
    for (let i = 0; i < 3 && s.pending?.kind === "discard"; i++) s = discard(s, s.pending.player, s.pending.player === opp ? s.players[opp]!.hand.slice(0, 3) : []);
    s = settle(s);
    const others = s.turnOrder.filter((p) => p !== ap && p !== opp);
    expect([life(s, ap), life(s, opp), ...others.map((p) => life(s, p))]).toEqual([39, 40, 37, 37]);
    expect(two.map((id) => zone(s, id))).toEqual(["graveyard", "graveyard"]);
  });

  it("Mind Bomb: a player with no cards in hand takes all 3", () => {
    const { s: s0, ap, ids, opp } = setup([mindBomb()]);
    for (const id of [...s0.players[opp]!.hand]) {
      s0.objects[id]!.zone = "exile";
      s0.players[opp]!.exile.push(id);
    }
    s0.players[opp]!.hand = [];
    const s = settle(castNow(s0, ap, ids[0]!));
    expect(life(s, opp)).toBe(37);
  });

  it("Renounce: sacrifice any number of permanents, 2 life for each", () => {
    const { s: s0, ap, ids } = setup([renounce()]);
    const a = putOnBattlefield(s0, ap, greenBear());
    const b = putOnBattlefield(s0, ap, relic("{1}", 1));
    const keep = putOnBattlefield(s0, ap, hillGiant());
    let s = settle(castNow(s0, ap, ids[0]!), (x) => x.pending?.player === ap && x.pending.kind === "pickPermanents");
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [a, b] }));
    expect([zone(s, a), zone(s, b), zone(s, keep), life(s, ap)]).toEqual(["graveyard", "graveyard", "battlefield", 44]);
  });

  it("Renounce: none sacrificed, no life", () => {
    const { s: s0, ap, ids } = setup([renounce()]);
    let s = settle(castNow(s0, ap, ids[0]!), (x) => x.pending?.player === ap && x.pending.kind === "pickPermanents");
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [] }));
    expect(life(s, ap)).toBe(40);
  });

  it("Sudden Reclamation: mill four, then a creature card and a land card back to your hand", () => {
    const { s: s0, ap, ids } = setup([suddenReclamation()]);
    const c = toZone(s0, ap, hillGiant(), "graveyard");
    const l = toZone(s0, ap, card("Old Land", "Land"), "graveyard");
    let s = settle(castNow(s0, ap, ids[0]!), at("searchLibrary", ap));
    expect(s.players[ap]!.graveyard.length).toBeGreaterThanOrEqual(6);
    s = find(s, ap, [c]);
    s = settle(s, at("searchLibrary", ap));
    s = settle(find(s, ap, [l]));
    expect([zone(s, c), zone(s, l)]).toEqual(["hand", "hand"]);
  });

  it("Sudden Reclamation: with no land card there, still a creature card (rulings)", () => {
    const { s: s0, ap, ids } = setup([suddenReclamation()]);
    // A library of creature cards only: the four milled can't be lands.
    for (const id of s0.players[ap]!.library.slice(0, 4)) s0.objects[id]!.cardId = s0.objects[toZone(s0, ap, hillGiant(), "graveyard")]!.cardId;
    s0.players[ap]!.graveyard = s0.players[ap]!.graveyard.filter((id) => s0.objects[id]!.zone === "graveyard");
    let s = settle(castNow(s0, ap, ids[0]!), at("searchLibrary", ap));
    const giants = s.players[ap]!.graveyard.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Hill Giant");
    s = settle(find(s, ap, [giants[0]!]));
    expect([zone(s, giants[0]!), s.pending]).toEqual(["hand", null]);
  });

  it("Corpse Appraiser: exiling a creature card looks at three, one to hand and two to the graveyard", () => {
    const { s: s0, ap, ids, opp } = setup([corpseAppraiser()]);
    const dead = toZone(s0, opp, hillGiant(), "graveyard");
    const top = s0.players[ap]!.library.slice(0, 3);
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseTargets", ap));
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(dead)] } as Action), at("searchLibrary", ap));
    s = settle(find(s, ap, [top[1]!]));
    expect([zone(s, dead), ...top.map((id) => zone(s, id))]).toEqual(["exile", "graveyard", "hand", "graveyard"]);
  });

  it("Corpse Appraiser: with no card exiled, nothing more", () => {
    const { s: s0, ap, ids } = setup([corpseAppraiser()]);
    const top = s0.players[ap]!.library.slice(0, 3);
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseTargets", ap));
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "none" }] } as Action);
    s = settle(s);
    expect(top.map((id) => zone(s, id))).toEqual(["library", "library", "library"]);
  });
});
