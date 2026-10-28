// Lane B, round 25: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, addEffect, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, objIsType, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

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
    if (p?.kind === "discard" || p?.kind === "declareAttackers" || p?.kind === "declareBlockers") break;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Stops at a decision of this kind for `pid`. */
const at = (kind: string, pid: PlayerId) => (s: GameState) => s.pending?.kind === kind && s.pending.player === pid;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const creature = (name: string, typeLine: string, manaCost: string, p: number, t: number, extra: Partial<CardDef> = {}) =>
  card(name, typeLine, manaCost, { power: String(p), toughness: String(t), ...extra });
const bigBeast = () => creature("Big Beast", "Creature — Beast", "{3}{G}", 4, 5, { cmc: 4 });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2, { cmc: 2 });
const whiteKnight = () => creature("White Knight", "Creature — Human Knight", "{1}{W}", 2, 2, { cmc: 2 });
const whiteCharm = () => card("White Charm", "Instant", "{W}", { cmc: 1, oracleText: "You gain 1 life." });
/** Moves a new card for `def` into `pid`'s hand, graveyard or library (on top). */
const into = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" | "library" = "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const pool = (s: GameState, pid: PlayerId, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  s.players[pid]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...mana };
};
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}) => run(s, planCast(s, pid, id, targets, undefined, "auto", undefined, choices));
const activateNow = (s: GameState, pid: PlayerId, id: string, index: number, targets: TargetChoice[] = [], x?: number, costs?: CostChoices) => run(s, planActivate(s, pid, id, index, targets, undefined, undefined, x, costs));
/** Passes priority (empty stack) until `pid` has it. */
const priorityTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 8 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Passes to the declare attackers step of the active player's turn and declares `attackers` at `defender`. */
const attackWith = (s: GameState, attackers: string[], defender: PlayerId) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return settle(act(s, { type: "declareAttackers", player: s.activePlayer, attacks: attackers.map((attacker) => ({ attacker, defender })) }));
};
const mine = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === name);

// Real oracle text (Scryfall).
const skullscorch = card("Skullscorch", "Sorcery", "{R}{R}", {"cmc":2,"oracleText":"Target player discards two cards at random unless that player has Skullscorch deal 4 damage to them."});
const flay = card("Flay", "Sorcery", "{3}{B}", {"cmc":4,"oracleText":"Target player discards a card at random. Then that player discards another card at random unless they pay {1}."});
const barbarianBully = card("Barbarian Bully", "Creature — Human Barbarian", "{2}{R}", {"cmc":3,"power":"2","toughness":"2","oracleText":"Discard a card at random: This creature gets +2/+2 until end of turn unless a player has this creature deal 4 damage to them. Activate only once each turn."});
const nakayaShade = card("Nakaya Shade", "Creature — Shade", "{1}{B}", {"cmc":2,"power":"1","toughness":"1","oracleText":"{B}: This creature gets +1/+1 until end of turn unless any player pays {2}."});
const soulCharmer = card("Soul Charmer", "Creature — Human Rebel", "{2}{W}", {"cmc":3,"power":"2","toughness":"2","oracleText":"Whenever this creature deals combat damage to a creature, you gain 2 life unless that creature's controller pays {2}."});
const homarid = card("Homarid", "Creature — Homarid", "{2}{U}", {"cmc":3,"power":"2","toughness":"2","oracleText":"This creature enters with a tide counter on it.\nAt the beginning of your upkeep, put a tide counter on this creature.\nAs long as there is exactly one tide counter on this creature, it gets -1/-1.\nAs long as there are exactly three tide counters on this creature, it gets +1/+1.\nWhenever there are four or more tide counters on this creature, remove all tide counters from it."});
const tidalInfluence = card("Tidal Influence", "Enchantment", "{2}{U}", {"cmc":3,"oracleText":"Cast this spell only if no permanents named Tidal Influence are on the battlefield.\nThis enchantment enters with a tide counter on it.\nAt the beginning of your upkeep, put a tide counter on this enchantment.\nAs long as there is exactly one tide counter on this enchantment, all blue creatures get -2/-0.\nAs long as there are exactly three tide counters on this enchantment, all blue creatures get +2/+0.\nWhenever there are four or more tide counters on this enchantment, remove all tide counters from it."});
const commonCause = card("Common Cause", "Enchantment", "{2}{W}", {"cmc":3,"oracleText":"Nonartifact creatures get +2/+2 as long as they all share a color."});
const deadRingers = card("Dead Ringers", "Sorcery", "{4}{B}", {"cmc":5,"oracleText":"Destroy two target nonblack creatures unless either one is a color the other isn't. They can't be regenerated."});
const eternalFlame = card("Eternal Flame", "Sorcery", "{2}{R}{R}", {"cmc":4,"oracleText":"Eternal Flame deals X damage to target opponent or planeswalker and half X damage, rounded up, to you, where X is the number of Mountains you control."});
const growthCycle = card("Growth Cycle", "Instant", "{1}{G}", {"cmc":2,"oracleText":"Target creature gets +3/+3 until end of turn. It gets an additional +2/+2 until end of turn for each card named Growth Cycle in your graveyard."});
const demigodOfRevenge = card("Demigod of Revenge", "Creature — Spirit Avatar", "{B/R}{B/R}{B/R}{B/R}{B/R}", {"cmc":5,"power":"5","toughness":"4","keywords":["Flying","Haste"],"oracleText":"When you cast this spell, return all cards named Demigod of Revenge from your graveyard to the battlefield.\nFlying, haste"});
const urborgStalker = card("Urborg Stalker", "Creature — Horror", "{3}{B}", {"cmc":4,"power":"2","toughness":"4","oracleText":"At the beginning of each player's upkeep, if that player controls a nonblack, nonland permanent, this creature deals 1 damage to that player."});
const chromeReplicator = card("Chrome Replicator", "Artifact Creature — Construct", "{5}", {"cmc":5,"power":"4","toughness":"4","colors":[],"oracleText":"When this creature enters, if you control two or more nonland, nontoken permanents with the same name as one another, create a 4/4 colorless Construct artifact creature token."});
const instillFuror = card("Instill Furor", "Enchantment — Aura", "{1}{R}", {"cmc":2,"keywords":["Enchant"],"oracleText":"Enchant creature\nEnchanted creature has \"At the beginning of your end step, sacrifice this creature unless it attacked this turn.\""});
const knightOfTheMists = card("Knight of the Mists", "Creature — Human Knight", "{2}{U}", {"cmc":3,"power":"2","toughness":"2","keywords":["Flanking"],"oracleText":"Flanking (Whenever a creature without flanking blocks this creature, the blocking creature gets -1/-1 until end of turn.)\nWhen this creature enters, you may pay {U}. If you don't, destroy target Knight and it can't be regenerated."});
const descendantOfMasumaro = card("Descendant of Masumaro", "Creature — Human Monk", "{2}{G}", {"cmc":3,"power":"1","toughness":"1","oracleText":"At the beginning of your upkeep, put a +1/+1 counter on this creature for each card in your hand, then remove a +1/+1 counter from this creature for each card in target opponent's hand."});
const showerOfCoals = card("Shower of Coals", "Sorcery", "{3}{R}{R}", {"cmc":5,"keywords":["Threshold"],"oracleText":"Shower of Coals deals 2 damage to each of up to three targets.\nThreshold — Shower of Coals deals 4 damage to each of those permanents and/or players instead if there are seven or more cards in your graveyard."});
const browse = card("Browse", "Enchantment", "{2}{U}{U}", {"cmc":4,"oracleText":"{2}{U}{U}: Look at the top five cards of your library, put one of them into your hand, and exile the rest."});
const eyeOfYawgmoth = card("Eye of Yawgmoth", "Artifact", "{3}", {"cmc":3,"colors":[],"oracleText":"{3}, {T}, Sacrifice a creature: Reveal a number of cards from the top of your library equal to the sacrificed creature's power. Put one into your hand and exile the rest."});
const ransack = card("Ransack", "Sorcery", "{3}{U}", {"cmc":4,"oracleText":"Look at the top five cards of target player's library. Put any number of them on the bottom of that library in any order and the rest on top of the library in any order."});
const sealedFate = card("Sealed Fate", "Sorcery", "{X}{U}{B}", {"cmc":2,"oracleText":"Look at the top X cards of target opponent's library. Exile one of those cards and put the rest back on top of that player's library in any order."});
const recursiveRecruitment = card("Recursive Recruitment", "Sorcery", "{2}{U}{B}", {"cmc":4,"keywords":["Flashback"],"oracleText":"Create two 2/2 colorless Wizard Soldier creature tokens named Cadet. If this spell was cast from a graveyard, put a +1/+1 counter on each of them for every three cards in your graveyard.\nFlashback {6}{U}{B} (You may cast this card from your graveyard for its flashback cost. Then exile it.)"});
const hatchetBully = card("Hatchet Bully", "Creature — Goblin Warrior", "{3}{R}", {"cmc":4,"power":"3","toughness":"3","oracleText":"{2}{R}, {T}, Put a -1/-1 counter on a creature you control: This creature deals 2 damage to any target."});
const wanderingMage = card("Wandering Mage", "Creature — Human Cleric Wizard", "{W}{U}{B}", {"cmc":3,"power":"0","toughness":"3","oracleText":"{W}, Pay 1 life: Prevent the next 2 damage that would be dealt to target creature this turn.\n{U}: Prevent the next 1 damage that would be dealt to target Cleric or Wizard creature this turn.\n{B}, Put a -1/-1 counter on a creature you control: Prevent the next 2 damage that would be dealt to target player or planeswalker this turn."});
const chaosSpewer = card("Chaos Spewer", "Creature — Goblin Warlock", "{2}{B/R}", {"cmc":3,"power":"5","toughness":"4","keywords":["Blight"],"oracleText":"When this creature enters, you may pay {2}. If you don't, blight 2. (To blight 2, put two -1/-1 counters on a creature you control.)"});
const compoundFracture = card("Compound Fracture", "Instant", "{B}", {"cmc":1,"oracleText":"Target creature gets -1/-1 until end of turn. It gets an additional -1/-1 until end of turn for each card named Compound Fracture in your graveyard."});
const desertsDue = card("Desert's Due", "Instant", "{1}{B}", {"cmc":2,"oracleText":"Target creature gets -2/-2 until end of turn. It gets an additional -1/-1 until end of turn for each Desert you control."});

const blueMerfolk = () => creature("Blue Merfolk", "Creature — Merfolk", "{1}{U}", 2, 2, { cmc: 2 });
const blackRat = () => creature("Black Rat", "Creature — Rat", "{1}{B}", 2, 2, { cmc: 2 });
const whiteGreenElf = () => creature("Bright Elf", "Creature — Elf", "{G}{W}", 2, 2, { cmc: 2 });
const ironGolem = () => creature("Iron Golem", "Artifact Creature — Golem", "{3}", 3, 3, { cmc: 3, colors: [] });
const handOf = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.length;
/** Passes to the declare blockers step and has the defending player declare `blocks` (blocker, attacker). */
const blockWith = (s: GameState, blocks: [string, string][]) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  const p = s.pending!;
  return settle(act(s, { type: "declareBlockers", player: p.player, blocks: blocks.map(([blocker, attacker]) => ({ blocker, attacker })) }));
};

describe("Lane B round 25", () => {
  it("supports every card of the round", () => {
    supported(skullscorch, flay, barbarianBully, nakayaShade, soulCharmer, homarid, tidalInfluence, commonCause, deadRingers, eternalFlame, growthCycle, demigodOfRevenge, urborgStalker,
      chromeReplicator, instillFuror, knightOfTheMists, descendantOfMasumaro, showerOfCoals, browse, eyeOfYawgmoth, ransack, sealedFate, recursiveRecruitment, hatchetBully, wanderingMage,
      chaosSpewer, compoundFracture, desertsDue);
  });

  it("Skullscorch: the target player takes 4 damage or discards two cards at random, their choice", () => {
    const { s: s0, ap, ids, opp } = setup([skullscorch, skullscorch]);
    const before = handOf(s0, opp);
    let s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]), at("chooseOption", opp));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "punisher" });
    s = settle(act(s, { type: "chooseOption", player: opp, choice: "0" }));
    expect(life(s, opp)).toBe(36);
    expect(handOf(s, opp)).toBe(before);
    s = priorityTo(s, ap);
    pool(s, ap, { R: 2 });
    s = settle(castNow(s, ap, ids[1]!, [ply(opp)]), at("chooseOption", opp));
    s = settle(act(s, { type: "chooseOption", player: opp, choice: "none" }));
    expect(life(s, opp)).toBe(36);
    expect(handOf(s, opp)).toBe(before - 2);
  });

  it("Flay: a random discard, then another unless they pay {1}", () => {
    const { s: s0, ap, ids, opp } = setup([flay, flay]);
    const before = handOf(s0, opp);
    let s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]), at("payUnless", opp));
    expect(handOf(s, opp)).toBe(before - 1);
    expect(s.pending).toMatchObject({ kind: "payUnless", player: opp, cost: "{1}" });
    s = settle(act(s, { type: "payUnless", player: opp, pay: false }));
    expect(handOf(s, opp)).toBe(before - 2);
  });

  it("Barbarian Bully gets +2/+2 unless a player has it deal 4 damage to them", () => {
    const { s: s0, ap } = setup([]);
    const bully = putOnBattlefield(s0, ap, barbarianBully);
    let s = settle(activateNow(s0, ap, bully, 0), (x) => x.pending?.kind === "chooseOption");
    // Each player is asked, in APNAP order (CR 101.4); the second one asked takes the damage.
    const asked: PlayerId[] = [];
    for (let i = 0; i < 4 && s.pending?.kind === "chooseOption"; i++) {
      asked.push(s.pending.player);
      s = act(s, { type: "chooseOption", player: s.pending.player, choice: i === 1 ? "0" : "none" });
    }
    s = settle(s);
    expect(asked[0]).toBe(ap);
    expect(pt(s, bully)).toBe("2/2");
    expect(life(s, asked[1]!)).toBe(36);
    expect(s.turnOrder.filter((p) => life(s, p) === 36)).toHaveLength(1);
  });

  it("Barbarian Bully: nobody takes the damage, it gets +2/+2; only once each turn", () => {
    const { s: s0, ap } = setup([]);
    const bully = putOnBattlefield(s0, ap, barbarianBully);
    let s = activateNow(s0, ap, bully, 0);
    s = settle(s, (x) => x.pending?.kind === "chooseOption");
    for (let i = 0; i < 4 && s.pending?.kind === "chooseOption"; i++) s = act(s, { type: "chooseOption", player: s.pending.player, choice: "none" });
    s = settle(s);
    expect(pt(s, bully)).toBe("4/4");
    expect(planActivate(s, ap, bully, 0)).toBeNull();
  });

  it("Nakaya Shade gets +1/+1 unless any player pays {2}", () => {
    const { s: s0, ap } = setup([]);
    const shade = putOnBattlefield(s0, ap, nakayaShade);
    let s = activateNow(s0, ap, shade, 0);
    s = settle(s, (x) => x.pending?.kind === "chooseOption" || x.pending?.kind === "payUnless");
    for (let i = 0; i < 8 && s.pending && (s.pending.kind === "chooseOption" || s.pending.kind === "payUnless"); i++) {
      const p = s.pending.player;
      s = s.pending.kind === "chooseOption" ? act(s, { type: "chooseOption", player: p, choice: "none" }) : act(s, { type: "payUnless", player: p, pay: false });
    }
    s = settle(s);
    expect(pt(s, shade)).toBe("2/2");
  });

  it("Homarid's tide counters: -1/-1 at one, +1/+1 at three, all removed at four", () => {
    const { s: s0, ap, ids } = setup([homarid]);
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(s.objects[ids[0]!]!.counters.tide).toBe(1);
    expect(pt(s, ids[0]!)).toBe("1/1");
    s.objects[ids[0]!]!.counters.tide = 2;
    invalidateCharacteristics(s);
    expect(pt(s, ids[0]!)).toBe("2/2");
    s.objects[ids[0]!]!.counters.tide = 3;
    invalidateCharacteristics(s);
    expect(pt(s, ids[0]!)).toBe("3/3");
    // Its upkeep trigger makes four: the state trigger removes them all.
    s = passUntil(s, "upkeep", ap);
    s = settle(s);
    expect(s.objects[ids[0]!]!.counters.tide ?? 0).toBe(0);
    expect(pt(s, ids[0]!)).toBe("2/2");
  });

  it("Tidal Influence: blue creatures get -2/-0 at one tide counter; it can't be cast while one is out", () => {
    const { s: s0, ap, ids, opp } = setup([tidalInfluence, tidalInfluence]);
    const merfolk = putOnBattlefield(s0, opp, blueMerfolk());
    const bear = putOnBattlefield(s0, ap, greenBear());
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(pt(s, merfolk)).toBe("0/2");
    expect(pt(s, bear)).toBe("2/2");
    expect(planCast(s, ap, ids[1]!, [])).toBeNull();
    s.objects[ids[0]!]!.counters.tide = 3;
    invalidateCharacteristics(s);
    expect(pt(s, merfolk)).toBe("4/2");
  });

  it("Common Cause: nonartifact creatures get +2/+2 while they all share a color", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, commonCause);
    const bear = putOnBattlefield(s, ap, greenBear());
    const elf = putOnBattlefield(s, opp, whiteGreenElf());
    const golem = putOnBattlefield(s, opp, ironGolem());
    invalidateCharacteristics(s);
    expect([pt(s, bear), pt(s, elf), pt(s, golem)]).toEqual(["4/4", "4/4", "3/3"]);
    const knight = putOnBattlefield(s, opp, whiteKnight());
    invalidateCharacteristics(s);
    expect([pt(s, bear), pt(s, elf), pt(s, knight)]).toEqual(["2/2", "2/2", "2/2"]);
  });

  it("Dead Ringers destroys two creatures of exactly the same colors, and does nothing otherwise", () => {
    const { s: s0, ap, ids, opp } = setup([deadRingers, deadRingers]);
    const a = putOnBattlefield(s0, opp, greenBear());
    const b = putOnBattlefield(s0, opp, greenBear());
    const elf = putOnBattlefield(s0, opp, whiteGreenElf());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(a), tgt(elf)]));
    expect([zone(s, a), zone(s, elf)]).toEqual(["battlefield", "battlefield"]);
    s = priorityTo(s, ap);
    pool(s, ap, { B: 1, C: 4 });
    s = settle(castNow(s, ap, ids[1]!, [tgt(a), tgt(b)]));
    expect([zone(s, a), zone(s, b)]).toEqual(["graveyard", "graveyard"]);
  });

  it("Dead Ringers can't target a black creature", () => {
    const { s, ap, ids, opp } = setup([deadRingers]);
    const a = putOnBattlefield(s, opp, greenBear());
    const rat = putOnBattlefield(s, opp, blackRat());
    expect(planCast(s, ap, ids[0]!, [tgt(a), tgt(rat)])).toBeNull();
  });

  it("Eternal Flame deals X to the opponent and half X, rounded up, to you", () => {
    const { s: s0, ap, ids, opp } = setup([eternalFlame]);
    const s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]));
    expect(life(s, opp)).toBe(37);
    expect(life(s, ap)).toBe(38);
  });

  it("Growth Cycle: +3/+3 and +2/+2 more for each Growth Cycle in your graveyard", () => {
    const { s: s0, ap, ids } = setup([growthCycle]);
    into(s0, ap, growthCycle, "graveyard");
    into(s0, ap, growthCycle, "graveyard");
    const bear = putOnBattlefield(s0, ap, greenBear());
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(bear)]));
    expect(pt(s, bear)).toBe("9/9");
  });

  it("Demigod of Revenge: casting it returns the ones in your graveyard to the battlefield", () => {
    const { s: s0, ap, ids } = setup([demigodOfRevenge]);
    const old = into(s0, ap, demigodOfRevenge, "graveyard");
    const s = settle(castNow(s0, ap, ids[0]!));
    expect(zone(s, old)).toBe("battlefield");
    expect(zone(s, ids[0]!)).toBe("battlefield");
  });

  it("Soul Charmer: combat damage to a creature gains you 2 life unless its controller pays {2}", () => {
    const { s: s0, ap, opp } = setup([]);
    const charmer = putOnBattlefield(s0, ap, soulCharmer);
    const bear = putOnBattlefield(s0, opp, greenBear());
    let s = blockWith(attackWith(s0, [charmer], opp), [[bear, charmer]]);
    const asked: PlayerId[] = [];
    for (let i = 0; i < 60 && s.step !== "main2"; i++) {
      const p = s.pending;
      if (p?.kind === "payUnless") {
        asked.push(p.player);
        s = act(s, { type: "payUnless", player: p.player, pay: false });
      } else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(asked).toEqual([opp]);
    expect(life(s, ap)).toBe(42);
    expect(life(s, opp)).toBe(40);
  });

  it("Urborg Stalker deals 1 damage at the upkeep of a player who controls a nonblack, nonland permanent", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, urborgStalker);
    putOnBattlefield(s0, opp, greenBear());
    const third = s0.turnOrder[(s0.turnOrder.indexOf(opp) + 1) % 4]!;
    putOnBattlefield(s0, third, blackRat());
    let s = settle(passUntil(s0, "upkeep", opp));
    expect(life(s, opp)).toBe(39);
    s = settle(passUntil(s, "upkeep", third));
    expect(life(s, third)).toBe(40);
  });

  it("Chrome Replicator makes a Construct only with two nonland, nontoken permanents of one name", () => {
    const { s: s0, ap, ids } = setup([chromeReplicator, chromeReplicator]);
    putOnBattlefield(s0, ap, greenBear());
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(mine(s, ap, "Construct Token")).toHaveLength(0);
    putOnBattlefield(s, ap, greenBear());
    s = priorityTo(s, ap);
    pool(s, ap, { C: 5 });
    s = settle(castNow(s, ap, ids[1]!));
    // Two Grizzly Bears and two Chrome Replicators: still one token (rulings).
    expect(mine(s, ap, "Construct Token")).toHaveLength(1);
  });

  it("Instill Furor: the enchanted creature is sacrificed at its controller's end step unless it attacked", () => {
    const { s: s0, ap, ids } = setup([instillFuror]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(bear)]));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    s = settle(passUntil(s, "end", ap));
    expect(zone(s, bear)).toBe("graveyard");
  });

  it("Instill Furor: a creature that attacked this turn stays", () => {
    const { s: s0, ap, ids, opp } = setup([instillFuror]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(bear)]));
    s = blockWith(attackWith(s, [bear], opp), []);
    s = settle(passUntil(s, "end", ap));
    expect(zone(s, bear)).toBe("battlefield");
  });

  it("Knight of the Mists: unless you pay {U}, the target Knight is destroyed and can't be regenerated", () => {
    const { s: s0, ap, ids, opp } = setup([knightOfTheMists, knightOfTheMists]);
    const knight = putOnBattlefield(s0, opp, whiteKnight());
    let s = settle(castNow(s0, ap, ids[0]!), (x) => x.pending?.player === ap);
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(knight)] } as Action), (x) => x.pending?.player === ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    pool(s, ap, { U: 1 });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(zone(s, knight)).toBe("battlefield");
    s = priorityTo(s, ap);
    pool(s, ap, { U: 1, C: 2 });
    s = settle(castNow(s, ap, ids[1]!), (x) => x.pending?.player === ap);
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(knight)] } as Action), (x) => x.pending?.player === ap);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(zone(s, knight)).toBe("graveyard");
  });

  it("Descendant of Masumaro: +1/+1 counters for your hand, then off again for the target opponent's", () => {
    const { s: s0, ap } = setup([]);
    const monk = putOnBattlefield(s0, ap, descendantOfMasumaro);
    let s = passUntil(s0, "upkeep", ap);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const opp = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    // Seven cards in your hand, two in theirs: five counters stay.
    while (handOf(s, ap) < 7) into(s, ap, greenBear());
    while (handOf(s, ap) > 7) s.players[ap]!.hand.pop();
    while (handOf(s, opp) > 2) s.players[opp]!.hand.pop();
    while (handOf(s, opp) < 2) into(s, opp, greenBear());
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [ply(opp)] }));
    expect(s.objects[monk]!.counters["+1/+1"]).toBe(5);
    expect(pt(s, monk)).toBe("6/6");
  });

  it("Shower of Coals deals 2 to each of up to three targets, 4 with threshold", () => {
    const { s: s0, ap, ids, opp } = setup([showerOfCoals, showerOfCoals]);
    const beast = putOnBattlefield(s0, opp, bigBeast());
    let s = settle(castNow(s0, ap, ids[0]!, [ply(opp), tgt(beast), { kind: "none" }]));
    expect(life(s, opp)).toBe(38);
    expect(s.objects[beast]!.damage).toBe(2);
    for (let i = 0; i < 6; i++) into(s, ap, greenBear(), "graveyard");
    s = priorityTo(s, ap);
    pool(s, ap, { R: 2, C: 3 });
    s = settle(castNow(s, ap, ids[1]!, [ply(opp), tgt(beast), { kind: "none" }]));
    expect(life(s, opp)).toBe(34);
    expect(zone(s, beast)).toBe("graveyard");
  });

  it("Browse: look at the top five, one into your hand, the rest exiled", () => {
    const { s: s0, ap } = setup([]);
    const browser = putOnBattlefield(s0, ap, browse);
    const top = s0.players[ap]!.library.slice(0, 5);
    let s = settle(activateNow(s0, ap, browser, 0), at("searchLibrary", ap));
    expect(s.pending?.kind === "searchLibrary" && [...s.pending.cards].sort()).toEqual([...top].sort());
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [top[2]!] }));
    expect(zone(s, top[2]!)).toBe("hand");
    expect(top.filter((_, i) => i !== 2).map((id) => zone(s, id))).toEqual(["exile", "exile", "exile", "exile"]);
  });

  it("Eye of Yawgmoth reveals as many cards as the sacrificed creature's power: one to hand, the rest exiled", () => {
    const { s: s0, ap } = setup([]);
    const eye = putOnBattlefield(s0, ap, eyeOfYawgmoth);
    const beast = putOnBattlefield(s0, ap, bigBeast());
    const top = s0.players[ap]!.library.slice(0, 4);
    let s = settle(activateNow(s0, ap, eye, 0, [], undefined, { sacrifice: [beast] }), at("searchLibrary", ap));
    expect(s.pending?.kind === "searchLibrary" && [...s.pending.cards].sort()).toEqual([...top].sort());
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [top[0]!] }));
    expect(zone(s, top[0]!)).toBe("hand");
    expect(top.slice(1).map((id) => zone(s, id))).toEqual(["exile", "exile", "exile"]);
    expect(zone(s, beast)).toBe("graveyard");
  });

  it("Ransack: any of the top five of the target player's library on the bottom, the rest back on top", () => {
    const { s: s0, ap, ids, opp } = setup([ransack]);
    const top = s0.players[opp]!.library.slice(0, 5);
    let s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]), at("arrangeTop", ap));
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap, how: "scry" });
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [top[4]!, top[0]!], away: [top[1]!, top[2]!, top[3]!] }));
    const lib = s.players[opp]!.library;
    expect(lib.slice(0, 2)).toEqual([top[4], top[0]]);
    expect(lib.slice(-3).sort()).toEqual([top[1], top[2], top[3]].sort());
  });

  it("Sealed Fate: look at the top X of the target opponent's library, exile one, the rest back on top in any order", () => {
    const { s: s0, ap, ids, opp } = setup([sealedFate]);
    const top = s0.players[opp]!.library.slice(0, 3);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [ply(opp)], undefined, "auto", 3)), at("searchLibrary", ap));
    expect(s.pending?.kind === "searchLibrary" && [...s.pending.cards].sort()).toEqual([...top].sort());
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [top[1]!] }), at("arrangeTop", ap));
    expect(zone(s, top[1]!)).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap });
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [top[2]!, top[0]!], away: [] }));
    expect(s.players[opp]!.library.slice(0, 2)).toEqual([top[2], top[0]]);
  });

  it("Recursive Recruitment: two 2/2 Cadets, with a +1/+1 counter for every three cards in your graveyard when cast from it", () => {
    const { s: s0, ap, ids } = setup([recursiveRecruitment]);
    let s = settle(castNow(s0, ap, ids[0]!));
    const first = mine(s, ap, "Cadet");
    expect(first.map((id) => pt(s, id))).toEqual(["2/2", "2/2"]);
    // The flashback: the card itself is on the stack, so seven other cards make two counters.
    for (let i = 0; i < 7; i++) into(s, ap, greenBear(), "graveyard");
    s = priorityTo(s, ap);
    pool(s, ap, { U: 1, B: 1, C: 6 });
    s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, undefined, undefined, { via: "flashback" })));
    const next = mine(s, ap, "Cadet").filter((id) => !first.includes(id));
    expect(next.map((id) => pt(s, id))).toEqual(["4/4", "4/4"]);
  });

  it("Hatchet Bully: a -1/-1 counter on a creature you control pays for 2 damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const bully = putOnBattlefield(s0, ap, hatchetBully);
    const bear = putOnBattlefield(s0, ap, greenBear());
    const theirs = putOnBattlefield(s0, opp, greenBear());
    expect(() => act(s0, { type: "activateAbility", player: ap, objectId: bully, index: 0, targets: [ply(opp)], costs: { counterOn: [theirs] } } as Action)).toThrow();
    const s = settle(activateNow(s0, ap, bully, 0, [ply(opp)], undefined, { counterOn: [bear] }));
    expect(s.objects[bear]!.counters["-1/-1"]).toBe(1);
    expect(pt(s, bear)).toBe("1/1");
    expect(life(s, opp)).toBe(38);
  });

  it("Hatchet Bully, played by a bot: the counter goes on a creature that survives it, never the commander", () => {
    const { s: s0, ap, opp } = setup([]);
    const bully = putOnBattlefield(s0, ap, hatchetBully);
    const bear = putOnBattlefield(s0, ap, greenBear());
    putOnBattlefield(s0, ap, creature("Small Fry", "Creature — Fish", "{U}", 1, 1, { cmc: 1 }));
    putOnBattlefield(s0, ap, bigBeast(), { commander: true });
    putOnBattlefield(s0, opp, creature("Red Bear", "Creature — Bear", "{1}{R}", 2, 1, { cmc: 2 }));
    // Nothing in hand to cast first.
    for (const id of s0.players[ap]!.hand.splice(0)) {
      s0.objects[id]!.zone = "library";
      s0.players[ap]!.library.push(id);
    }
    let s = passUntil(s0, "main2", ap);
    expect(s.objects[bully]!.tapped).toBe(false);
    // What else it does first (a land) aside, it uses the ability in its second main phase.
    let use: Action | undefined;
    for (let i = 0; i < 10 && !use && s.step === "main2" && waitingOn(s) === ap; i++) {
      const plan = botActions(s, ap);
      use = plan.find((a) => a.type === "activateAbility" && a.objectId === bully);
      if (!use) for (const a of plan) s = act(s, a);
      s = settle(s);
    }
    expect(use?.type === "activateAbility" && use.costs?.counterOn).toEqual([bear]);
  });

  it("Wandering Mage: a -1/-1 counter on a creature you control prevents the next 2 damage to a player", () => {
    const { s: s0, ap, ids } = setup([eternalFlame]);
    const mage = putOnBattlefield(s0, ap, wanderingMage);
    const opp = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    let s = settle(activateNow(s0, ap, mage, 2, [ply(ap)], undefined, { counterOn: [mage] }));
    expect(pt(s, mage)).toBe("-1/2");
    s = priorityTo(s, ap);
    s = settle(castNow(s, ap, ids[0]!, [ply(opp)]));
    expect(life(s, ap)).toBe(40);
    expect(life(s, opp)).toBe(37);
  });

  it("Chaos Spewer: unless you pay {2}, blight 2, on any creature you control (rulings); a bot pays", () => {
    const { s: s0, ap, ids } = setup([chaosSpewer]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseMay", ap));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, pay: { mana: "{2}" } });
    expect(botActions(s, ap)).toContainEqual({ type: "chooseMay", player: ap, yes: true });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), at("pickPermanents", ap));
    expect(s.pending?.kind === "pickPermanents" && [...s.pending.options].sort()).toEqual([bear, ids[0]!].sort());
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [bear] }));
    expect(zone(s, bear)).toBe("graveyard");
    expect(pt(s, ids[0]!)).toBe("5/4");
  });

  it("Compound Fracture and Desert's Due: an additional -1/-1 for each card of that name in your graveyard, each Desert you control", () => {
    const { s: s0, ap, ids, opp } = setup([compoundFracture, desertsDue]);
    const beast = putOnBattlefield(s0, opp, bigBeast());
    into(s0, ap, compoundFracture, "graveyard");
    putOnBattlefield(s0, ap, card("Sandy Waste", "Land — Desert"));
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(beast)]));
    expect(pt(s, beast)).toBe("2/3");
    s = priorityTo(s, ap);
    s = settle(castNow(s, ap, ids[1]!, [tgt(beast)]));
    // 2/3, -2/-2 and -1/-1 for the Desert: 0 toughness.
    expect(zone(s, beast)).toBe("graveyard");
  });
});
