// Round 130: round 129's gaps (The Valeyard, Davros, Tablet of Discovery, Ark of Hunger, Master of Cruelties, Zero Point
// Ballad), then the most played cards.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { abilityProblem, altCostsFor, botActions, castProblem, characteristics, defOf, isFullySupported, legalActions, planActivate, planCast, planTurnFaceUp, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Bots answer every choice and everyone passes until the stack and trigger queue are empty. */
const settleBots = (s: GameState) => {
  for (let i = 0; i < 120 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const who = s.pending ? s.pending.player : waitingOn(s)!;
    const acts = s.pending ? botActions(s, who) : [];
    s = acts.length ? acts.reduce((x, a) => act(x, a), s) : act(s, { type: "passPriority", player: who });
  }
  return s;
};
/** Everyone passes until something asks a player to choose (or the stack is empty). */
const passToPending = (s: GameState) => {
  for (let i = 0; i < 30 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const legalLand = (s: GameState, pid: PlayerId, id: string) => legalActions(s, pid).some((a) => a.type === "playLand" && a.objectId === id);
const logText = (s: GameState) => s.log.map((l) => (typeof l === "string" ? l : l.text)).join("\n");
/** A fresh copy of `def` put into `pid`'s `zone` (on top of the library). */
const putIn = (s: GameState, pid: PlayerId, def: CardDef, zone: "library" | "graveyard" | "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  return id;
};
const opponentsOf = (s: GameState, ap: PlayerId) => [1, 2, 3].map((n) => s.turnOrder[(s.turnOrder.indexOf(ap) + n) % 4]!);
const ogre = (name = "Test Ogre") => card(name, "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3" });

const dalekEmperor = card("The Dalek Emperor", "Legendary Artifact Creature — Dalek", "{5}{B}{R}", {
  power: "6",
  toughness: "6",
  oracleText: "Affinity for Daleks (This spell costs {1} less to cast for each Dalek you control.)\nOther Daleks you control have haste.\nAt the beginning of combat on your turn, each opponent faces a villainous choice — That player sacrifices a creature of their choice, or you create a 3/3 black Dalek artifact creature token with menace.",
});
const valeyard = card("The Valeyard", "Legendary Creature — Time Lord Rogue", "{3}{B}", {
  power: "3",
  toughness: "4",
  oracleText: "If an opponent would face a villainous choice, they face that choice an additional time. (They can make the same or different choices.)\nWhile voting, you may vote an additional time.",
});
const davros = card("Davros, Dalek Creator", "Legendary Artifact Creature — Alien Scientist", "{1}{U}{B}{R}", {
  power: "3",
  toughness: "4",
  keywords: ["Menace"],
  oracleText: "Menace\nAt the beginning of your end step, create a 3/3 black Dalek artifact creature token with menace if an opponent lost 3 or more life this turn. Then each opponent who lost 3 or more life this turn faces a villainous choice — You draw a card, or that player discards a card.",
});
const drain = card("Test Drain", "Sorcery", "{B}", { oracleText: "Target opponent loses 3 life." });

describe("The Valeyard: each opponent faces a villainous choice one more time (CR 701.55c)", () => {
  it("The Dalek Emperor's choice is faced twice by each opponent, one time after the other", () => {
    supported(dalekEmperor, valeyard);
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, dalekEmperor);
    putOnBattlefield(s0, ap, valeyard);
    let s = passUntil(s0, "beginCombat", ap);
    s = passToPending(s);
    const opps = opponentsOf(s, ap);
    // In turn order, each opponent twice before the next one (701.55c-d).
    for (const pid of [opps[0], opps[0], opps[1], opps[1], opps[2], opps[2]]) {
      expect(s.pending).toMatchObject({ kind: "chooseOption", what: "villainous", player: pid });
      s = act(s, { type: "chooseOption", player: pid!, choice: "1" });
    }
    s = settleBots(s);
    // Each "you create a Dalek" chosen six times.
    expect(s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name.startsWith("Dalek")).length).toBe(6);
  });
  it("an opponent's Dalek Emperor: the Valeyard's controller faces it once, its other opponents twice", () => {
    const { s: s0, ap } = setup([]);
    const opps = opponentsOf(s0, ap);
    // An opponent's Dalek Emperor: the Valeyard doubles it for the Valeyard's controller's opponents only.
    putOnBattlefield(s0, opps[0]!, dalekEmperor);
    putOnBattlefield(s0, ap, valeyard);
    let s = passUntil(s0, "beginCombat", opps[0]);
    s = passToPending(s);
    const faced: PlayerId[] = [];
    for (let i = 0; i < 10 && s.pending?.kind === "chooseOption" && s.pending.what === "villainous"; i++) {
      faced.push(s.pending.player);
      s = act(s, { type: "chooseOption", player: s.pending.player, choice: "1" });
    }
    expect(faced.filter((p) => p === ap).length).toBe(1);
    expect(faced).toEqual([opps[1], opps[1], opps[2], opps[2], ap]);
  });
});

describe("Davros, Dalek Creator: only the opponents who lost 3 or more life this turn face the choice", () => {
  it("one opponent lost 3: a Dalek, then that opponent alone chooses", () => {
    supported(davros, drain);
    const { s: s0, ap, ids } = setup([drain]);
    putOnBattlefield(s0, ap, davros);
    const opps = opponentsOf(s0, ap);
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opps[1]! }])));
    s = passUntil(s, "end", ap);
    s = passToPending(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "villainous", player: opps[1] });
    const hand = s.players[ap]!.hand.length;
    s = act(s, { type: "chooseOption", player: opps[1]!, choice: "0" });
    s = settleBots(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name.startsWith("Dalek")).length).toBe(1);
    expect(logText(s).match(/faces a villainous choice and chooses/g)?.length).toBe(1);
  });
  it("no one lost 3 life: no Dalek and no choice", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, davros);
    let s = passUntil(s0, "end", ap);
    s = settleBots(s);
    expect(logText(s)).not.toMatch(/faces a villainous choice and chooses/);
    expect(s.battlefield.some((id) => s.cards[s.objects[id]!.cardId]!.name.startsWith("Dalek"))).toBe(false);
  });
});

const tablet = card("Tablet of Discovery", "Artifact", "{2}{R}", {
  oracleText: "When this artifact enters, mill a card. You may play that card this turn. (To mill a card, put the top card of your library into your graveyard.)\n{T}: Add {R}.\n{T}: Add {R}{R}. Spend this mana only to cast instant and sorcery spells.",
});
const ark = card("Ark of Hunger", "Artifact", "{2}{R}{W}", {
  oracleText: "Whenever one or more cards leave your graveyard, this artifact deals 1 damage to each opponent and you gain 1 life.\n{T}: Mill a card. You may play that card this turn.",
});

describe("Tablet of Discovery and Ark of Hunger: the milled card may be played this turn", () => {
  it("Tablet: a milled land may be played from the graveyard this turn, as the land play (CR 305.2)", () => {
    supported(tablet, ark);
    const { s: s0, ap, ids } = setup([tablet]);
    s0.players[ap]!.landsPlayedThisTurn = 0;
    const land = putIn(s0, ap, card("Milled Wastes", "Land"), "library");
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[land]!.zone).toBe("graveyard");
    expect(legalLand(s, ap, land)).toBe(true);
    s = act(s, { type: "playLand", player: ap, objectId: land });
    expect(s.objects[land]!.zone).toBe("battlefield");
  });
  it("Ark: a milled spell may be cast from the graveyard this turn, not on a later turn", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, ark);
    const o = putIn(s0, ap, ogre("Milled Ogre"), "library");
    let s = settleBots(run(s0, planActivate(s0, ap, a, 0)));
    expect(s.objects[o]!.zone).toBe("graveyard");
    const plan = planCast(s, ap, o, undefined, undefined, "auto", undefined, { via: "permission" });
    expect(plan).not.toBeNull();
    s = settleBots(run(s, plan));
    expect(s.objects[o]!.zone).toBe("battlefield");
    // The Ogre left the graveyard: the Ark's trigger dealt 1 damage to each opponent.
    expect(logText(s)).toMatch(/Ark of Hunger deals 1 damage/);
  });
  it("the permission ends with the turn", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, ark);
    const o = putIn(s0, ap, ogre("Late Ogre"), "library");
    let s = settleBots(run(s0, planActivate(s0, ap, a, 0)));
    expect(s.objects[o]!.zone).toBe("graveyard");
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    s = passUntil(s, "main1", ap);
    expect(planCast(s, ap, o, undefined, undefined, "auto", undefined, { via: "permission" })).toBeNull();
  });
});

const master = card("Master of Cruelties", "Creature — Demon", "{3}{B}{R}", {
  power: "1",
  toughness: "4",
  keywords: ["First strike", "Deathtouch"],
  oracleText: "First strike, deathtouch\nThis creature can only attack alone.\nWhenever this creature attacks a player and isn't blocked, that player's life total becomes 1. This creature assigns no combat damage this combat.",
});

describe("Master of Cruelties: attacks alone; unblocked, the player's life total becomes 1 and it deals no combat damage", () => {
  it("can't attack with another creature", () => {
    supported(master);
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, master);
    const o = putOnBattlefield(s0, ap, ogre());
    const s = passUntil(s0, "declareAttackers", ap);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: m, defender: opp }, { attacker: o, defender: opp }] })).toThrow(/can only attack alone/);
  });
  it("unblocked: the defending player goes to 1 life, and the first strike damage isn't dealt", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, master);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: m, defender: opp }] });
    for (let i = 0; i < 80 && s.step !== "end"; i++) {
      const pid = waitingOn(s)!;
      s = s.pending?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: pid, blocks: [] }) : s.pending ? botActions(s, pid).reduce((x, y) => act(x, y), s) : act(s, { type: "passPriority", player: pid });
    }
    expect(s.players[opp]!.life).toBe(1);
  });
  it("bots attack with it alone or not at all", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, master);
    putOnBattlefield(s0, ap, ogre());
    putOnBattlefield(s0, ap, ogre("Second Ogre"));
    const s = passUntil(s0, "declareAttackers", ap);
    const decl = botActions(s, ap).find((a) => a.type === "declareAttackers");
    if (decl?.type !== "declareAttackers") throw new Error("no attack");
    // Applying it is legal: the engine refuses Master of Cruelties with others.
    expect(() => act(s, decl)).not.toThrow();
  });
});

const ballad = card("Zero Point Ballad", "Sorcery", "{X}{B}{B}", {
  oracleText: "Destroy all creatures with toughness X or less. You lose X life. If X is 6 or more, return a creature card put into a graveyard this way to the battlefield under your control.",
});

describe("Zero Point Ballad: with X 6 or more, a creature card it put into a graveyard comes back under your control", () => {
  for (const x of [6, 4])
    it(`X = ${x}`, () => {
      supported(ballad);
      const { s: s0, ap, ids, opp } = setup([ballad]);
      const theirs = putOnBattlefield(s0, opp, ogre("Their Ogre"));
      const life = s0.players[ap]!.life;
      const s = settleBots(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", x)));
      expect(s.players[ap]!.life).toBe(life - x);
      if (x >= 6) {
        // The only creature card that died: no choice to make.
        expect(s.objects[theirs]!.zone).toBe("battlefield");
        expect(s.objects[theirs]!.controller).toBe(ap);
      } else expect(s.objects[theirs]!.zone).toBe("graveyard");
    });
});

const tombs = card("Out of the Tombs", "Enchantment", "{2}{B}", {
  oracleText: "At the beginning of your upkeep, put two eon counters on this enchantment, then mill cards equal to the number of eon counters on it.\nIf you would draw a card while your library has no cards in it, instead return a creature card from your graveyard to the battlefield. If you can't, you lose the game.",
});
/** `pid`'s library emptied into exile, so their next draw is from an empty library. */
const emptyLibrary = (s: GameState, pid: PlayerId) => {
  for (const id of s.players[pid]!.library) s.objects[id]!.zone = "exile";
  s.players[pid]!.exile.push(...s.players[pid]!.library);
  s.players[pid]!.library = [];
};
const drawTwo = card("Test Divination", "Sorcery", "{U}", { oracleText: "Draw two cards." });

describe("Out of the Tombs: eon counters and mills; a draw from an empty library returns a creature card instead", () => {
  it("each upkeep: two more eon counters, then it mills that many", () => {
    supported(tombs);
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, tombs);
    let s = passUntil(s0, "upkeep", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]);
    s = passUntil(s, "upkeep", ap);
    const yard = s.players[ap]!.graveyard.length;
    s = settleBots(s);
    expect(s.objects[t]!.counters.eon).toBe(2);
    expect(s.players[ap]!.graveyard.length).toBe(yard + 2);
  });
  it("with two creature cards, its player picks one for each draw (rulings: each draw on its own)", () => {
    const { s: s0, ap, ids } = setup([drawTwo]);
    putOnBattlefield(s0, ap, tombs);
    const a = putIn(s0, ap, ogre("Yard Ogre"), "graveyard");
    const b = putIn(s0, ap, ogre("Yard Giant"), "graveyard");
    emptyLibrary(s0, ap);
    let s = passToPending(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "drawEmptyReturn", player: ap, left: 1 });
    s = act(s, { type: "drawEmptyReturn", player: ap, objectId: b });
    expect(s.objects[b]!.zone).toBe("battlefield");
    // The second draw: one creature card left, so no choice.
    s = settleBots(s);
    expect(s.objects[a]!.zone).toBe("battlefield");
    expect(s.players[ap]!.lost).toBeFalsy();
    expect(s.players[ap]!.drewFromEmptyLibrary).toBeFalsy();
  });
  it("with no creature card to return, its player loses the game", () => {
    const { s: s0, ap, ids } = setup([drawTwo]);
    putOnBattlefield(s0, ap, tombs);
    emptyLibrary(s0, ap);
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.lost).toBe(true);
  });
  it("bots return the creature card with the highest mana value", () => {
    const { s: s0, ap, ids } = setup([drawTwo]);
    putOnBattlefield(s0, ap, tombs);
    putIn(s0, ap, card("Small One", "Creature — Elf", "{G}", { power: "1", toughness: "1" }), "graveyard");
    const big = putIn(s0, ap, card("Big One", "Creature — Giant", "{5}{G}", { power: "6", toughness: "6" }), "graveyard");
    putIn(s0, ap, card("Third One", "Creature — Elf", "{1}{G}", { power: "2", toughness: "1" }), "graveyard");
    emptyLibrary(s0, ap);
    const s = passToPending(run(s0, planCast(s0, ap, ids[0]!)));
    expect(botActions(s, ap)).toEqual([{ type: "drawEmptyReturn", player: ap, objectId: big }]);
  });
});

const zada = card("Zada, Hedron Grinder", "Legendary Creature — Goblin Ally", "{3}{R}", {
  power: "3",
  toughness: "3",
  oracleText: "Whenever you cast an instant or sorcery spell that targets only Zada, copy that spell for each other creature you control that the spell could target. Each copy targets a different one of those creatures.",
});
const inkTreader = card("Ink-Treader Nephilim", "Creature — Nephilim", "{R}{G}{W}{U}", {
  power: "3",
  toughness: "3",
  oracleText: "Whenever a player casts an instant or sorcery spell, if that spell targets only this creature, copy the spell for each other creature that spell could target. Each copy targets a different one of those creatures.",
});
const precursor = card("Precursor Golem", "Artifact Creature — Golem", "{5}", {
  power: "3",
  toughness: "3",
  oracleText: "When this creature enters, create two 3/3 colorless Golem artifact creature tokens.\nWhenever a player casts an instant or sorcery spell that targets only a single Golem, that player copies that spell for each other Golem that spell could target. Each copy targets a different one of those Golems.",
});
const giantGrowth = card("Giant Growth", "Instant", "{G}", { oracleText: "Target creature gets +3/+3 until end of turn." });
const golem = (name: string) => card(name, "Artifact Creature — Golem", "{3}", { power: "3", toughness: "3" });
const shrouded = card("Shrouded Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3", keywords: ["Shroud"], oracleText: "Shroud" });
const pow = (s: GameState, id: string) => characteristics(s, s.objects[id]!).power;
/** Cast `spell` from `pid`'s hand at `target`, then everyone passes until the trigger has resolved and the stack is empty. */
const growAt = (s: GameState, pid: PlayerId, spell: string, target: string) => settleBots(run(s, planCast(s, pid, spell, [{ kind: "object", id: target }])));

describe("Zada, Ink-Treader Nephilim, Precursor Golem: a copy of the spell for each other creature it could target", () => {
  it("Zada: one copy for each other creature you control it could target, none for shroud or an opponent's (rulings)", () => {
    supported(zada, inkTreader, precursor);
    const { s: s0, ap, ids, opp } = setup([giantGrowth]);
    const z = putOnBattlefield(s0, ap, zada);
    const a = putOnBattlefield(s0, ap, ogre("Ogre A"));
    const b = putOnBattlefield(s0, ap, ogre("Ogre B"));
    const sh = putOnBattlefield(s0, ap, shrouded);
    const theirs = putOnBattlefield(s0, opp, ogre("Their Ogre"));
    const s = growAt(s0, ap, ids[0]!, z);
    expect([z, a, b].map((id) => pow(s, id))).toEqual([6, 6, 6]);
    expect([sh, theirs].map((id) => pow(s, id))).toEqual([3, 3]);
  });
  it("Zada: a spell aimed at another creature doesn't trigger it", () => {
    const { s: s0, ap, ids } = setup([giantGrowth]);
    const z = putOnBattlefield(s0, ap, zada);
    const a = putOnBattlefield(s0, ap, ogre("Ogre A"));
    const s = growAt(s0, ap, ids[0]!, a);
    expect([z, a].map((id) => pow(s, id))).toEqual([3, 6]);
  });
  it("Ink-Treader: an opponent's spell at it is copied for every other creature, and its controller controls the copies", () => {
    const { s: s0, ap, ids, opp } = setup([giantGrowth]);
    const ink = putOnBattlefield(s0, opp, inkTreader);
    const mine = putOnBattlefield(s0, ap, ogre("My Ogre"));
    const theirs = putOnBattlefield(s0, opp, ogre("Their Ogre"));
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: ink }]));
    // The trigger resolves: two copies on the stack above the spell, both under the Nephilim's controller.
    for (let i = 0; i < 20 && s.stack.length < 3; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.filter((x) => x.copy).map((x) => x.controller)).toEqual([opp, opp]);
    s = settleBots(s);
    expect([ink, mine, theirs].map((id) => pow(s, id))).toEqual([6, 6, 6]);
  });
  it("Precursor Golem: a spell at one Golem is copied for each other Golem, whoever controls it, under the caster", () => {
    const { s: s0, ap, ids, opp } = setup([giantGrowth]);
    const p = putOnBattlefield(s0, opp, precursor);
    const g1 = putOnBattlefield(s0, opp, golem("Golem One"));
    const g2 = putOnBattlefield(s0, ap, golem("Golem Two"));
    const o = putOnBattlefield(s0, ap, ogre("Not a Golem"));
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: g1 }]));
    for (let i = 0; i < 20 && s.stack.length < 3; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.filter((x) => x.copy).map((x) => x.controller)).toEqual([ap, ap]);
    s = settleBots(s);
    expect([p, g1, g2, o].map((id) => pow(s, id))).toEqual([6, 6, 6, 3]);
  });
});

const court = card("Court of Locthwain", "Enchantment", "{2}{B}{B}", {
  oracleText: "When this enchantment enters, you become the monarch.\nAt the beginning of your upkeep, exile the top card of target opponent's library. You may play that card for as long as it remains exiled, and mana of any type can be spent to cast it. If you're the monarch, until end of turn, you may cast a spell from among cards exiled with this enchantment without paying its mana cost.",
});
const whiteKnight = card("Test Paladin", "Creature — Human Knight", "{W}{W}{W}{W}", { power: "4", toughness: "4" });
/** Court of Locthwain on `ap`'s side; at `ap`'s next upkeep, `top` on top of each opponent's library, then the trigger resolved. */
const courtUpkeep = (top: CardDef, monarch: "you" | "opponent") => {
  const { s: s0, ap, opp } = setup([]);
  const c = putOnBattlefield(s0, ap, court);
  s0.monarch = monarch === "you" ? ap : opp;
  let s = passUntil(s0, "upkeep", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]);
  s = passUntil(s, "upkeep", ap);
  // Put on top as the trigger waits to resolve (the opponents drew on their own turns).
  const tops = opponentsOf(s, ap).map((q) => putIn(s, q, top, "library"));
  // Nobody took the crown on the way round.
  s.monarch = monarch === "you" ? ap : opp;
  s = passUntil(settleBots(s), "main1", ap);
  const exiled = tops.filter((id) => s.objects[id]!.zone === "exile");
  expect(exiled).toHaveLength(1);
  return { s, ap, c, o: exiled[0]! };
};
const untappedLands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && !s.objects[id]!.tapped && characteristics(s, s.objects[id]!).types.includes("Land")).length;

describe("Court of Locthwain: an opponent's top card to play with mana of any type; as the monarch, one spell from among them free", () => {
  it("as the monarch: the exiled card is cast without paying its mana cost, once", () => {
    supported(court);
    let { s, ap, c, o } = courtUpkeep(ogre("Stolen Ogre"), "you");
    expect(s.objects[o]!.mayPlay).toMatchObject({ player: ap, until: "exiled", anyType: true });
    expect(altCostsFor(s, ap, s.objects[o]!).map((a) => a.kind)).toContain("linkedFree");
    const lands = untappedLands(s, ap);
    s = settleBots(run(s, planCast(s, ap, o, undefined, undefined, "auto", undefined, { alt: "linkedFree" })));
    expect(s.objects[o]!.zone).toBe("battlefield");
    expect(untappedLands(s, ap)).toBe(lands);
    // Another card exiled with it this turn: no second free spell, though it can still be cast for mana of any type.
    const more = putIn(s, s.objects[o]!.owner, ogre("Second Ogre"), "library");
    s.players[s.objects[more]!.owner]!.library.shift();
    s.objects[more]!.zone = "exile";
    s.players[s.objects[more]!.owner]!.exile.push(more);
    s.objects[more]!.mayPlay = { player: ap, zc: s.objects[more]!.zoneChanges ?? 0, until: "exiled", turn: s.turn, anyType: true };
    s.linkedExile![`${c}@${s.objects[c]!.zoneChanges ?? 0}`]!.push({ id: more, zc: s.objects[more]!.zoneChanges ?? 0 });
    expect(castProblem(s, ap, more, undefined, undefined, undefined, undefined, undefined, { alt: "linkedFree" })).not.toBeNull();
    expect(planCast(s, ap, more)).not.toBeNull();
  });
  it("not the monarch: no free spell, but mana of any type pays for it", () => {
    const { s, ap, o } = courtUpkeep(whiteKnight, "opponent");
    expect(castProblem(s, ap, o, undefined, undefined, undefined, undefined, undefined, { alt: "linkedFree" })).not.toBeNull();
    // Three Plains and {W}{W}{W}{W}: castable only because any type of mana can be spent (CR 609.4b).
    const t = settleBots(run(s, planCast(s, ap, o)));
    expect(t.objects[o]!.zone).toBe("battlefield");
  });
  it("the free spell is for this turn only; the card stays playable for mana after that", () => {
    let { s, ap, o } = courtUpkeep(ogre("Kept Ogre"), "you");
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(altCostsFor(s, ap, s.objects[o]!).map((a) => a.kind)).not.toContain("linkedFree");
    expect(s.objects[o]!.mayPlay).toMatchObject({ player: ap, until: "exiled" });
  });
  it("bots take the free spell", () => {
    const { s, ap, o } = courtUpkeep(ogre("Bot Ogre"), "you");
    // Its land play first, perhaps; then the free spell.
    let t = s;
    for (let i = 0; i < 4 && t.objects[o]!.zone === "exile"; i++) t = botActions(t, ap).reduce((x, a) => act(x, a), t);
    expect(t.stack.some((x) => x.objectId === o) || t.objects[o]!.zone === "battlefield").toBe(true);
    expect(t.linkedFreeCasts ?? []).toEqual([]);
  });
});

const hoodedHydra = card("Hooded Hydra", "Creature — Snake Hydra", "{X}{G}{G}", {
  power: "0",
  toughness: "0",
  keywords: ["Morph"],
  oracleText: "This creature enters with X +1/+1 counters on it.\nWhen this creature dies, create a 1/1 green Snake creature token for each +1/+1 counter on it.\nMorph {3}{G}{G}\nAs this creature is turned face up, put five +1/+1 counters on it.",
});
const coronet = card("Daybreak Coronet", "Enchantment — Aura", "{W}{W}", {
  keywords: ["Enchant"],
  oracleText: "Enchant creature with another Aura attached to it\nEnchanted creature gets +3/+3 and has first strike, vigilance, and lifelink. (Damage dealt by the creature also causes its controller to gain that much life.)",
});
const pacify = card("Test Blessing", "Enchantment — Aura", "{W}", { keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +1/+1." });
const nyxHydra = card("Nyxborn Hydra", "Enchantment Creature — Hydra", "{X}{G}", {
  power: "0",
  toughness: "1",
  keywords: ["Reach", "Trample", "Bestow"],
  oracleText: "Bestow {X}{G}{G} (If you cast this card for its bestow cost, it's an Aura spell with enchant creature. It becomes a creature again if it's not attached.)\nReach, trample\nThis permanent enters with X +1/+1 counters on it.\nEnchanted creature gets +1/+1 for each +1/+1 counter on this Aura and has reach and trample.",
});
const font = card("Transmutation Font", "Artifact", "{5}", {
  keywords: ["Food"],
  oracleText: "{T}: Create your choice of a Blood token, a Clue token, or a Food token.\n{3}, {T}, Sacrifice three artifact tokens with different names: Search your library for an artifact card, put it onto the battlefield, then shuffle. Activate only as a sorcery.",
});
const vincent = scry("transform", [
  { name: "Vincent Valentine", mana_cost: "{2}{B}{B}", type_line: "Legendary Creature — Assassin", oracle_text: "Whenever a creature an opponent controls dies, put a number of +1/+1 counters on Vincent Valentine equal to that creature's power.\nWhenever Vincent Valentine attacks, you may transform it.", power: "2", toughness: "2" },
  { name: "Galian Beast", type_line: "Legendary Creature — Werewolf Beast", oracle_text: "Trample, lifelink\nWhen Galian Beast dies, return it to the battlefield tapped (front face up).", power: "3", toughness: "2", color_indicator: ["B"] },
], { keywords: ["Lifelink", "Transform", "Trample"] });
const murder = card("Test Murder", "Instant", "{B}", { oracleText: "Destroy target creature." });
const tgt = (id: string) => [{ kind: "object" as const, id }];
const tough = (s: GameState, id: string) => characteristics(s, s.objects[id]!).toughness;

describe("Hooded Hydra: X counters cast face up; five as it's turned face up; a Snake for each counter as it dies", () => {
  it("turned face up for its morph cost: five +1/+1 counters, no trigger to respond to (rulings)", () => {
    supported(hoodedHydra);
    const { s: s0, ap, ids } = setup([hoodedHydra]);
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { faceDown: true })));
    expect(s.objects[ids[0]!]!.faceDown).toBeTruthy();
    s = run(s, planTurnFaceUp(s, ap, ids[0]!));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(5);
    expect(pow(s, ids[0]!)).toBe(5);
  });
  it("cast for X = 2, then destroyed: two Snakes", () => {
    const { s: s0, ap, ids } = setup([hoodedHydra, murder]);
    let s = settleBots(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 2)));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(2);
    s = settleBots(run(s, planCast(s, ap, ids[1]!, tgt(ids[0]!))));
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Snake"))).toHaveLength(2);
  });
});

describe("Daybreak Coronet: enchant creature with another Aura attached to it", () => {
  it("only a creature with another Aura can be enchanted; +3/+3, first strike, vigilance, lifelink", () => {
    supported(coronet);
    const { s: s0, ap, ids } = setup([coronet, pacify]);
    const o = putOnBattlefield(s0, ap, ogre());
    expect(planCast(s0, ap, ids[0]!, tgt(o))).toBeNull();
    let s = settleBots(run(s0, planCast(s0, ap, ids[1]!, tgt(o))));
    s = settleBots(run(s, planCast(s, ap, ids[0]!, tgt(o))));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(o);
    expect(pow(s, o)).toBe(7);
    expect(characteristics(s, s.objects[o]!).keywords).toEqual(expect.arrayContaining(["First strike", "Vigilance", "Lifelink"]));
  });
  it("once the other Aura is gone, it's put into its owner's graveyard (CR 704.5m)", () => {
    const { s: s0, ap, ids } = setup([coronet, pacify, card("Test Disenchant", "Instant", "{1}", { oracleText: "Destroy target enchantment." })]);
    const o = putOnBattlefield(s0, ap, ogre());
    let s = settleBots(run(s0, planCast(s0, ap, ids[1]!, tgt(o))));
    s = settleBots(run(s, planCast(s, ap, ids[0]!, tgt(o))));
    s = settleBots(run(s, planCast(s, ap, ids[2]!, tgt(ids[1]!))));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });
});

describe("Nyxborn Hydra: bestow with X", () => {
  it("bestowed for X = 3: the creature gets +3/+3 and has reach and trample", () => {
    supported(nyxHydra);
    const { s: s0, ap, ids } = setup([nyxHydra]);
    const o = putOnBattlefield(s0, ap, ogre());
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!, tgt(o), undefined, "auto", 3, { alt: "bestow" })));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(o);
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(3);
    expect([pow(s, o), tough(s, o)]).toEqual([6, 6]);
    expect(characteristics(s, s.objects[o]!).keywords).toEqual(expect.arrayContaining(["Reach", "Trample"]));
  });
  it("cast as a creature for X = 2: a 2/3", () => {
    const { s: s0, ap, ids } = setup([nyxHydra]);
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 2)));
    expect([pow(s, ids[0]!), tough(s, ids[0]!)]).toEqual([2, 3]);
  });
});

describe("Transmutation Font: a Blood, Clue or Food token of your choice; three differently named tokens find an artifact", () => {
  /** Activate its first ability, choosing the option whose label names `kind`. */
  const make = (s: GameState, ap: PlayerId, f: string, kind: string) => {
    s.objects[f]!.tapped = false;
    s = passToPending(run(s, planActivate(s, ap, f, 0)));
    const p = s.pending!;
    expect(p.kind).toBe("chooseOption");
    const labels = p.kind === "chooseOption" ? (p.labels ?? p.options) : [];
    expect(labels).toHaveLength(3);
    const i = labels.findIndex((l) => l.includes(kind));
    s = act(s, { type: "chooseOption", player: ap, choice: p.kind === "chooseOption" ? p.options[i]! : "" });
    return settleBots(s);
  };
  const tokens = (s: GameState, ap: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap);
  it("three choices; then a Blood, a Clue and a Food pay for the search", () => {
    supported(font);
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, font);
    const relic = putIn(s0, ap, card("Test Relic", "Artifact", "{2}"), "library");
    let s = make(s0, ap, f, "Blood");
    s = make(s, ap, f, "Clue");
    s = make(s, ap, f, "Food");
    expect(tokens(s, ap).map((id) => defOf(s, s.objects[id]!).name).sort()).toEqual(["Blood Token", "Clue Token", "Food Token"]);
    s.objects[f]!.tapped = false;
    const sacrifice = tokens(s, ap);
    // Only the mana is left to pay (planActivate taps for it).
    expect(abilityProblem(s, ap, f, 1, undefined, undefined, undefined, undefined, { sacrifice }) ?? "not enough mana").toMatch(/^not enough mana/);
    const plan = planActivate(s, ap, f, 1)!.map((a): Action => (a.type === "activateAbility" ? { ...a, costs: { ...a.costs, sacrifice } } : a));
    s = passToPending(run(s, plan));
    if (s.pending?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: ap, found: [relic] });
    s = settleBots(s);
    expect(tokens(s, ap)).toHaveLength(0);
    expect(s.objects[relic]!.zone).toBe("battlefield");
  });
  it("two Clues and a Food don't have three different names", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, font);
    let s = make(s0, ap, f, "Clue");
    s = make(s, ap, f, "Clue");
    s = make(s, ap, f, "Food");
    s.objects[f]!.tapped = false;
    expect(abilityProblem(s, ap, f, 1, undefined, undefined, undefined, undefined, { sacrifice: tokens(s, ap) })).toMatch(/different names/);
  });
});

describe("Vincent Valentine // Galian Beast", () => {
  it("an opponent's creature dies: counters equal to its power", () => {
    supported(vincent);
    const { s: s0, ap, ids, opp } = setup([murder]);
    const v = putOnBattlefield(s0, ap, vincent);
    const o = putOnBattlefield(s0, opp, ogre());
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!, tgt(o))));
    expect(s.objects[v]!.counters["+1/+1"]).toBe(3);
  });
  it("attacks: may transform; Galian Beast dies and returns tapped, front face up", () => {
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, ap, vincent);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: v, defender: opp }] });
    s = passToPending(s);
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = passToPending(s);
    expect(defOf(s, s.objects[v]!).name).toBe("Galian Beast");
    expect(characteristics(s, s.objects[v]!).keywords).toEqual(expect.arrayContaining(["Trample", "Lifelink"]));
  });
});
