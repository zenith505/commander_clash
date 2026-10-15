// Life-total conditions (CR 119, 903.7), Platinum Angel (CR 104.3e), "win the game" (CR 104.2b), and the "this turn"
// conditions: cards drawn, descend (CR 700.11), revolt, void, and the second spell each turn.

import { describe, expect, it } from "vitest";
import { act, card, cast, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { characteristics, draw, isFullySupported, moveObject, objHasKeyword, runStateBasedActions, spellCost, waitingOn, type GameState } from "../src";

// Real oracle text (Scryfall).
const ascendant = card("Serra Ascendant", "Creature — Human Monk", "{W}", {
  power: "1",
  toughness: "1",
  keywords: ["Lifelink"],
  oracleText: "Lifelink (Damage dealt by this creature also causes you to gain that much life.)\nAs long as you have 30 or more life, this creature gets +5/+5 and has flying.",
});
const doomsayer = card("Thraben Doomsayer", "Creature — Human Cleric", "{1}{W}{W}", {
  power: "2",
  toughness: "2",
  keywords: ["Fateful hour"],
  oracleText: "{T}: Create a 1/1 white Human creature token.\nFateful hour — As long as you have 5 or less life, other creatures you control get +2/+2.",
});
const angel = card("Platinum Angel", "Artifact Creature — Angel", "{7}", { power: "4", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nYou can't lose the game and your opponents can't win the game." });
const felidar = card("Felidar Sovereign", "Creature — Cat Beast", "{4}{W}{W}", {
  power: "4",
  toughness: "6",
  keywords: ["Lifelink", "Vigilance"],
  oracleText: "Vigilance (Attacking doesn't cause this creature to tap.)\nLifelink (Damage dealt by this creature also causes you to gain that much life.)\nAt the beginning of your upkeep, if you have 40 or more life, you win the game.",
});
const anima = card("Tome Anima", "Creature — Spirit", "{3}{U}", { power: "3", toughness: "3", oracleText: "This creature can't be blocked as long as you've drawn two or more cards this turn." });
const skittermaw = card("Insatiable Skittermaw", "Creature — Insect Horror", "{2}{B}", {
  power: "2",
  toughness: "2",
  keywords: ["Menace", "Void"],
  oracleText: "Menace (This creature can't be blocked except by two or more creatures.)\nVoid — At the beginning of your end step, if a nonland permanent left the battlefield this turn or a spell was warped this turn, put a +1/+1 counter on this creature.",
});
const footMystic = card("Foot Mystic", "Creature — Human Ninja Warlock", "{3}{B}", {
  power: "2",
  toughness: "4",
  keywords: ["Disappear", "Lifelink"],
  oracleText: "Lifelink\nDisappear — When this creature enters, if a permanent left the battlefield under your control this turn, create a 1/1 black Ninja creature token.",
});
const stalker = card("Stalactite Stalker", "Creature — Goblin Rogue", "{B}", {
  power: "1",
  toughness: "1",
  keywords: ["Menace"],
  oracleText: "Menace\nAt the beginning of your end step, if you descended this turn, put a +1/+1 counter on this creature. (You descended if a permanent card was put into your graveyard from anywhere.)\n{2}{B}, Sacrifice this creature: Target creature gets -X/-X until end of turn, where X is this creature's power.",
});
const jori = card("Jori En, Ruin Diver", "Legendary Creature — Merfolk Wizard", "{1}{U}{R}", { power: "2", toughness: "3", oracleText: "Whenever you cast your second spell each turn, draw a card." });
const bellRinger = card("Highspire Bell-Ringer", "Creature — Djinn Monk", "{2}{U}", { power: "1", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nThe second spell you cast each turn costs {1} less to cast." });
const kambal = card("Kambal, Consul of Allocation", "Legendary Creature — Human Advisor", "{1}{W}{B}", {
  power: "2",
  toughness: "3",
  oracleText: "Whenever an opponent casts a noncreature spell, that player loses 2 life and you gain 2 life.",
});
const opt = () => card("Peek", "Instant", "{U}", { oracleText: "Draw a card." });

const settle = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("life total conditions", () => {
  it("compile", () => {
    for (const c of [ascendant, doomsayer, angel, felidar]) expect(isFullySupported(c), c.name).toBe(true);
  });

  it("Serra Ascendant is 6/6 with flying at 30 or more life, 1/1 below", () => {
    const { s, ap } = setup([]);
    const a = putOnBattlefield(s, ap, ascendant);
    expect(s.players[ap]!.life).toBe(40);
    expect(pt(s, a)).toBe("6/6");
    expect(objHasKeyword(s, s.objects[a]!, "Flying")).toBe(true);
    s.players[ap]!.life = 29;
    expect(pt(s, a)).toBe("1/1");
    expect(objHasKeyword(s, s.objects[a]!, "Flying")).toBe(false);
  });

  it("fateful hour: other creatures get +2/+2 at 5 or less life", () => {
    const { s, ap } = setup([]);
    const d = putOnBattlefield(s, ap, doomsayer);
    const b = putOnBattlefield(s, ap, card("Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    expect(pt(s, b)).toBe("2/2");
    s.players[ap]!.life = 5;
    expect(pt(s, b)).toBe("4/4");
    expect(pt(s, d)).toBe("2/2");
  });
});

describe("Platinum Angel (CR 104.3e)", () => {
  it("you don't lose at 0 life while it's there, and do once it's gone", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, angel);
    s0.players[ap]!.life = 0;
    runStateBasedActions(s0);
    expect(s0.players[ap]!.lost).toBeFalsy();
    moveObject(s0, a, "graveyard");
    runStateBasedActions(s0);
    expect(s0.players[ap]!.lost).toBe(true);
  });

  it("a draw from an empty library doesn't come back to make you lose after it leaves (CR 704.5b)", () => {
    const { s, ap } = setup([]);
    const a = putOnBattlefield(s, ap, angel);
    s.players[ap]!.library = [];
    draw(s, ap);
    runStateBasedActions(s);
    expect(s.players[ap]!.lost).toBeFalsy();
    moveObject(s, a, "graveyard");
    runStateBasedActions(s);
    expect(s.players[ap]!.lost).toBeFalsy();
  });

  it("conceding still works (rulings)", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, angel);
    const s = act(s0, { type: "concede", player: ap });
    expect(s.players[ap]!.lost).toBe(true);
  });

  it("an opponent's Felidar Sovereign can't win while you control it", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, angel);
    putOnBattlefield(s0, opp, felidar);
    s0.players[opp]!.life = 45;
    const s = passUntil(s0, "draw", opp);
    expect(s.over).toBe(false);
    expect(s.log.some((l) => /can't win/.test(l.text))).toBe(true);
  });
});

describe("win the game (CR 104.2b)", () => {
  it("Felidar Sovereign wins at the beginning of your upkeep with 40 or more life", () => {
    const { s: s0, opp } = setup([]);
    putOnBattlefield(s0, opp, felidar);
    s0.players[opp]!.life = 40;
    // Up to the upkeep, then pass until the trigger resolves.
    let s = passUntil(s0, "upkeep", opp);
    for (let i = 0; i < 20 && !s.over; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.over).toBe(true);
    expect(s.winner).toBe(opp);
  });

  it("doesn't trigger below 40 life (an intervening if, CR 603.4)", () => {
    const { s: s0, opp } = setup([]);
    putOnBattlefield(s0, opp, felidar);
    s0.players[opp]!.life = 39;
    const s = passUntil(s0, "draw", opp);
    expect(s.over).toBe(false);
  });
});

describe("this-turn conditions", () => {
  it("compile", () => {
    for (const c of [anima, skittermaw, footMystic, stalker, jori, bellRinger, kambal]) expect(isFullySupported(c), c.name).toBe(true);
  });

  it("Tome Anima can't be blocked once you've drawn two cards this turn", () => {
    const { s, ap } = setup([]);
    const a = putOnBattlefield(s, ap, anima);
    s.players[ap]!.draws = undefined;
    draw(s, ap);
    expect(characteristics(s, s.objects[a]!).cantBeBlocked).toBe(false);
    draw(s, ap);
    expect(characteristics(s, s.objects[a]!).cantBeBlocked).toBe(true);
  });

  it("void: Skittermaw gets a counter at end step only if a nonland permanent left the battlefield", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, skittermaw);
    let s = passUntil(s0, "cleanup", ap);
    expect(s.objects[m]!.counters["+1/+1"] ?? 0).toBe(0);
    // Next time round: an opponent's creature leaves, which counts too.
    s = passUntil(s, "main1", ap);
    const b = putOnBattlefield(s, opp, card("Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    moveObject(s, b, "graveyard");
    s = passUntil(s, "cleanup", ap);
    expect(s.objects[m]!.counters["+1/+1"]).toBe(1);
  });

  it("revolt-style: Foot Mystic makes a Ninja only if a permanent left under your control", () => {
    const { s: s0, ap, ids } = setup([footMystic, footMystic]);
    let s = cast(s0, ap, ids[0]!);
    s = settle(s);
    const ninjas = (st: GameState) => st.battlefield.filter((id) => st.objects[id]!.isToken).length;
    expect(ninjas(s)).toBe(0);
    // A land leaving counts: any permanent (and a token would too).
    const land = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest" && s.objects[id]!.controller === ap)!;
    moveObject(s, land, "hand");
    putOnBattlefield(s, ap, card("Swamp", "Basic Land — Swamp"));
    s = settle(cast(s, ap, ids[1]!));
    expect(ninjas(s)).toBe(1);
  });

  it("descend: a permanent card put into your graveyard from anywhere, not a token or an instant", () => {
    const { s: s0, ap, ids } = setup([opt()]);
    const st = putOnBattlefield(s0, ap, stalker);
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.descendedThisTurn ?? []).not.toContain(ap); // Opt is an instant
    s = passUntil(s, "cleanup", ap);
    expect(s.objects[st]!.counters["+1/+1"] ?? 0).toBe(0);
    s = passUntil(s, "main1", ap);
    // Milling a creature card counts.
    const bearCard = s.players[ap]!.library.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Grizzly Bears")!;
    moveObject(s, bearCard, "graveyard");
    expect(s.descendedThisTurn).toContain(ap);
    s = passUntil(s, "cleanup", ap);
    expect(s.objects[st]!.counters["+1/+1"]).toBe(1);
  });
});

describe("the second spell each turn", () => {
  it("Jori En draws on your second spell only", () => {
    const { s: s0, ap, ids } = setup([opt(), opt(), opt()]);
    putOnBattlefield(s0, ap, jori);
    let s = settle(cast(s0, ap, ids[0]!));
    const hand1 = s.players[ap]!.hand.length;
    s = settle(cast(s, ap, ids[1]!));
    // Opt draws one, Jori En one more.
    expect(s.players[ap]!.hand.length).toBe(hand1 - 1 + 2);
    const hand2 = s.players[ap]!.hand.length;
    s = settle(cast(s, ap, ids[2]!));
    expect(s.players[ap]!.hand.length).toBe(hand2 - 1 + 1);
  });

  it("spells cast before Jori En was on the battlefield count (rulings)", () => {
    const { s: s0, ap, ids } = setup([opt(), opt()]);
    let s = settle(cast(s0, ap, ids[0]!));
    putOnBattlefield(s, ap, jori);
    const hand = s.players[ap]!.hand.length;
    s = settle(cast(s, ap, ids[1]!));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
  });

  it("Highspire Bell-Ringer makes the second spell cost {1} less, generic only", () => {
    const shockish = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
    const { s: s0, ap, ids } = setup([opt(), shockish]);
    putOnBattlefield(s0, ap, bellRinger);
    const first = spellCost(s0, ap, s0.objects[ids[1]!]!);
    expect(first.extra).toBe(2);
    const s = settle(cast(s0, ap, ids[0]!));
    const second = spellCost(s, ap, s.objects[ids[1]!]!);
    expect(second.extra).toBe(1);
  });

  it("Kambal: \"that player\" is the opponent who cast the spell", () => {
    const { s: s0, ap, opp, ids } = setup([opt()]);
    putOnBattlefield(s0, opp, kambal);
    const s = settle(cast(s0, ap, ids[0]!));
    expect(s.players[ap]!.life).toBe(38);
    expect(s.players[opp]!.life).toBe(42);
  });
});
