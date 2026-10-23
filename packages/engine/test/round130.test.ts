// Round 130: round 129's gaps (The Valeyard, Davros, Tablet of Discovery, Ark of Hunger, Master of Cruelties, Zero Point
// Ballad), then the most played cards.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, legalActions, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

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
