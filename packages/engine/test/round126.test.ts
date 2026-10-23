// Round 126: round 125's gaps (Fandaniel's prompt, Frontier Warmonger, ...), then the most played cards.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Pass priority until something waits on a choice or the stack is empty. */
const untilChoice = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Bots answer every choice and everyone passes until the stack and trigger queue are empty. */
const settleBots = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const who = s.pending ? s.pending.player : waitingOn(s)!;
    const acts = s.pending ? botActions(s, who) : [];
    s = acts.length ? acts.reduce((x, a) => act(x, a), s) : act(s, { type: "passPriority", player: who });
  }
  return s;
};
const logText = (s: GameState) => s.log.map((l) => (typeof l === "string" ? l : JSON.stringify(l))).join("\n");
const nextOf = (s: GameState, pid: number, n: number) => s.turnOrder[(s.turnOrder.indexOf(pid) + n) % 4]!;
/** Put cards into `pid`'s hand. */
const toHand = (s: GameState, pid: number, ...defs: CardDef[]) =>
  defs.map((d) => {
    const id = putOnBattlefield(s, pid, d);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "hand";
    s.players[pid]!.hand.push(id);
    return id;
  });
/** Put cards into `pid`'s graveyard. */
const toYard = (s: GameState, pid: number, ...defs: CardDef[]) =>
  defs.map((d) => {
    const id = putOnBattlefield(s, pid, d);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "graveyard";
    s.players[pid]!.graveyard.push(id);
    return id;
  });
const bears = (name = "Grizzly Bears") => card(name, "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" });
void logText;
/** Pass priority (no blocks) until a choice of this kind waits. */
const untilPending = (s: GameState, kind: string) => {
  for (let i = 0; i < 80 && s.pending?.kind !== kind; i++) {
    const pid = waitingOn(s)!;
    s = s.pending?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: pid, blocks: [] }) : act(s, { type: "passPriority", player: pid });
  }
  return s;
};
void toHand;

// Real oracle text (Scryfall).
const fandaniel = card("Fandaniel, Telophoroi Ascian", "Legendary Creature — Elder Wizard", "{4}{B}", {
  power: "4",
  toughness: "5",
  oracleText: "Whenever you cast an instant or sorcery spell, surveil 1.\nAt the beginning of your end step, each opponent may sacrifice a nontoken creature of their choice. Each opponent who doesn't loses 2 life for each instant and sorcery card in your graveyard.",
});

describe("Fandaniel: the prompt names the life lost by declining", () => {
  it("\"If you don't, you lose 6 life.\" with three instants in its controller's graveyard", () => {
    supported(fandaniel);
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, fandaniel);
    toYard(s0, ap, ...[1, 2, 3].map(() => card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." })));
    const o1 = nextOf(s0, ap, 1);
    putOnBattlefield(s0, o1, bears());
    let s = passUntil(s0, "end", ap);
    s = untilChoice(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: o1, otherwise: "If you don't, you lose 6 life." });
  });
});

const warmonger = card("Frontier Warmonger", "Creature — Human Warrior", "{3}{R}", {
  power: "4",
  toughness: "4",
  oracleText: "Whenever one or more creatures attack one of your opponents or a planeswalker they control, those creatures gain menace until end of turn.",
});
const walker = card("Test Walker", "Legendary Planeswalker — Test", "{3}", { loyalty: "5", oracleText: "+1: You gain 1 life." });

describe("Frontier Warmonger: once for each opponent attacked; those creatures gain menace (CR 508.3e, rulings)", () => {
  it("your attack at two opponents and one's planeswalker: two triggers, every attacker gains menace", () => {
    supported(warmonger);
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, warmonger);
    const [o1, o2] = [nextOf(s0, ap, 1), nextOf(s0, ap, 2)];
    const pw = putOnBattlefield(s0, o2, walker);
    s0.objects[pw]!.counters = { loyalty: 5 };
    const [a, b, c] = [bears("A"), bears("B"), bears("C")].map((d) => putOnBattlefield(s0, ap, d));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a!, defender: o1 }, { attacker: b!, defender: o2 }, { attacker: c!, defender: o2, planeswalker: pw }] });
    expect(s.stack.length + s.triggerQueue.length).toBe(2);
    s = settleBots(s);
    for (const x of [a, b, c]) expect(objHasKeyword(s, s.objects[x!]!, "Menace")).toBe(true);
  });

  it("an opponent attacking another of your opponents triggers it; an attack on you doesn't", () => {
    const { s: s0, ap } = setup([]);
    const [o1, o2, o3] = [nextOf(s0, ap, 1), nextOf(s0, ap, 2), nextOf(s0, ap, 3)];
    putOnBattlefield(s0, o3, warmonger);
    const [a, b] = [bears("A"), bears("B")].map((d) => putOnBattlefield(s0, ap, d));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a!, defender: o1 }, { attacker: b!, defender: o3 }] });
    expect(s.stack.length + s.triggerQueue.length).toBe(1);
    s = settleBots(s);
    expect(objHasKeyword(s, s.objects[a!]!, "Menace")).toBe(true);
    expect(objHasKeyword(s, s.objects[b!]!, "Menace")).toBe(false);
    void o2;
  });
});

const bane = card("Bane of Bala Ged", "Creature — Eldrazi", "{7}", { power: "7", toughness: "5", oracleText: "Whenever this creature attacks, defending player exiles two permanents they control." });

describe("Bane of Bala Ged: defending player exiles two permanents of their choice (rulings)", () => {
  it("with three, they pick two; the third stays", () => {
    supported(bane);
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bane);
    const theirs = [bears("A"), bears("B"), bears("C")].map((d) => putOnBattlefield(s0, opp, d));
    s0.battlefield = s0.battlefield.filter((id) => s0.objects[id]!.controller !== opp || theirs.includes(id));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    s = untilChoice(s);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: opp, action: "exile", count: 2 });
    s = act(s, { type: "pickPermanents", player: opp, ids: [theirs[0]!, theirs[2]!] });
    expect(s.objects[theirs[0]!]!.zone).toBe("exile");
    expect(s.objects[theirs[2]!]!.zone).toBe("exile");
    expect(s.objects[theirs[1]!]!.zone).toBe("battlefield");
    expect(logText(s)).toMatch(/exiles A\./);
  });

  it("with only one permanent, that one is exiled; a bot picks its least valuable", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bane);
    const one = putOnBattlefield(s0, opp, bears("Solo"));
    s0.battlefield = s0.battlefield.filter((id) => s0.objects[id]!.controller !== opp || id === one);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    s = untilChoice(s);
    expect(s.objects[one]!.zone).toBe("exile");
  });
});

const duelist = card("Keen Duelist", "Creature — Human Wizard", "{1}{B}", {
  power: "2",
  toughness: "2",
  oracleText: "At the beginning of your upkeep, you and target opponent each reveal the top card of your library. You each lose life equal to the mana value of the card revealed by the other player. You each put the card you revealed into your hand.",
});
const parker = card("Parker Luck", "Enchantment", "{2}{B}", {
  oracleText: "At the beginning of your end step, two target players each reveal the top card of their library. They each lose life equal to the mana value of the card revealed by the other player. Then they each put the card they revealed into their hand.",
});

describe("Keen Duelist and Parker Luck: each loses life equal to the other's revealed card's mana value", () => {
  it("Keen Duelist: you reveal a 5, they reveal a 2; you lose 2, they lose 5, both cards go to hand", () => {
    supported(duelist, parker);
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, duelist);
    let s = passUntil(s0, "upkeep", nextOf(s0, ap, 1));
    s = passUntil(s, "upkeep", ap);
    // The cards on top as it resolves.
    const mine = putOnBattlefield(s, ap, card("Big Thing", "Sorcery", "{4}{B}"));
    const theirs = putOnBattlefield(s, opp, card("Small Thing", "Sorcery", "{1}{R}"));
    for (const [id, pid] of [[mine, ap], [theirs, opp]] as const) {
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      s.objects[id]!.zone = "library";
      s.players[pid]!.library.unshift(id);
    }
    const [lifeA, lifeO] = [s.players[ap]!.life, s.players[opp]!.life];
    s = untilChoice(s);
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] } as Action);
    s = settleBots(s);
    expect(s.players[ap]!.life).toBe(lifeA - 2);
    expect(s.players[opp]!.life).toBe(lifeO - 5);
    expect(s.objects[mine]!.zone).toBe("hand");
    expect(s.objects[theirs]!.zone).toBe("hand");
  });
});

const vindicator = card("Phyrexian Vindicator", "Creature — Phyrexian Horror", "{W}{W}{W}{W}", {
  power: "5",
  toughness: "5",
  keywords: ["Flying"],
  oracleText: "Flying\nIf damage would be dealt to this creature, prevent that damage. When damage is prevented this way, this creature deals that much damage to any other target.",
});
const blast = card("Test Blast", "Instant", "{R}", { oracleText: "Test Blast deals 3 damage to any target." });

describe("Phyrexian Vindicator: damage to it is prevented, then it deals that much to any other target (CR 603.12)", () => {
  it("a 3-damage spell at it: no damage, then 3 to an opponent", () => {
    supported(vindicator, blast);
    const { s: s0, ap, ids, opp } = setup([blast]);
    const v = putOnBattlefield(s0, ap, vindicator);
    const life = s0.players[opp]!.life;
    let s = untilChoice(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: v }])));
    expect(s.objects[v]!.damage).toBe(0);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    // Not itself: "any other target".
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: v }] } as Action)).toThrow();
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] } as Action);
    s = settleBots(s);
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.objects[v]!.damage).toBe(0);
  });

  it("two blockers' combat damage at once: one trigger, with all of it", () => {
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, ap, vindicator);
    const flyer = (n: string) => card(n, "Creature — Bird", "{1}{W}", { power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying" });
    const [b1, b2] = [putOnBattlefield(s0, opp, flyer("Bird A")), putOnBattlefield(s0, opp, flyer("Bird B"))];
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: v, defender: opp }] });
    s = passUntil(s, "declareBlockers", ap);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b1, attacker: v }, { blocker: b2, attacker: v }] } as Action);
    for (let i = 0; i < 30 && !s.pending && s.step !== "combatDamage"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 30 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[v]!.damage).toBe(0);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(s.triggerQueue.length + s.stack.filter((x) => x.sourceId === v).length).toBeLessThanOrEqual(1);
    const life = s.players[opp]!.life;
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] } as Action);
    s = settleBots(s);
    expect(s.players[opp]!.life).toBe(life - 4);
  });
});

const biomancer = card("Master Biomancer", "Creature — Elf Wizard", "{2}{G}{U}", {
  power: "2",
  toughness: "4",
  oracleText: "Each other creature you control enters with a number of additional +1/+1 counters on it equal to this creature's power and as a Mutant in addition to its other types.",
});

describe("Master Biomancer: counters equal to its power as the creature enters, and a Mutant (CR 614.1c)", () => {
  it("a Bear enters with two +1/+1 counters as a Bear Mutant; one entering under an opponent doesn't", () => {
    supported(biomancer);
    const { s: s0, ap, ids, opp } = setup([bears()]);
    putOnBattlefield(s0, ap, biomancer);
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    const b = s.objects[ids[0]!]!;
    expect(b.zone).toBe("battlefield");
    expect(b.counters["+1/+1"]).toBe(2);
    expect(characteristics(s, b).subtypes).toEqual(expect.arrayContaining(["Bear", "Mutant"]));
    const theirs = putOnBattlefield(s, opp, bears("Theirs"));
    expect(characteristics(s, s.objects[theirs]!).subtypes).not.toContain("Mutant");
  });
  it("its power pumped to 5: five counters", () => {
    const { s: s0, ap, ids } = setup([bears()]);
    const m = putOnBattlefield(s0, ap, biomancer);
    s0.objects[m]!.counters["+1/+1"] = 3;
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(5);
  });
});

const vnwxt = card("Vnwxt, Verbose Host", "Legendary Creature — Homunculus", "{1}{U}", {
  power: "0",
  toughness: "4",
  oracleText: "Start your engines! (If you have no speed, it starts at 1. It increases once on each of your turns when an opponent loses life. Max speed is 4.)\nYou have no maximum hand size.\nMax speed — If you would draw a card, draw two cards instead.",
});

describe("Vnwxt, Verbose Host: two cards for each draw only at max speed (CR 702.178a)", () => {
  const drawStep = (speed: number) => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, vnwxt);
    let s = passUntil(s0, "upkeep", nextOf(s0, ap, 1));
    s = passUntil(s, "upkeep", ap);
    s.players[ap]!.speed = speed;
    const hand = s.players[ap]!.hand.length;
    s = passUntil(s, "main1", ap);
    return s.players[ap]!.hand.length - hand;
  };
  it("speed 4: the draw step's draw is two cards", () => {
    supported(vnwxt);
    expect(drawStep(4)).toBe(2);
  });
  it("speed 3: one", () => expect(drawStep(3)).toBe(1));
});

const thief = card("Thief of Sanity", "Creature — Specter", "{1}{U}{B}", {
  power: "2",
  toughness: "2",
  keywords: ["Flying"],
  oracleText: "Flying\nWhenever this creature deals combat damage to a player, look at the top three cards of that player's library, exile one of them face down, then put the rest into their graveyard. You may cast that card for as long as it remains exiled, and mana of any type can be spent to cast that spell.",
});

describe("Thief of Sanity: one of the top three exiled face down for you to cast, the rest into their graveyard", () => {
  it("picks one; the other two go to the damaged player's graveyard; it can be cast with any mana", () => {
    supported(thief);
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, thief);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: t, defender: opp }] });
    s = untilPending(s, "searchLibrary");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const top = s.pending!.kind === "searchLibrary" ? s.pending.cards : [];
    expect(top).toHaveLength(3);
    const yard = s.players[opp]!.graveyard.length;
    s = act(s, { type: "searchLibrary", player: ap, found: [top[1]!] });
    expect(s.objects[top[1]!]!.zone).toBe("exile");
    expect(s.objects[top[1]!]!.mayPlay).toMatchObject({ player: ap, anyType: true });
    expect(s.objects[top[0]!]!.zone).toBe("graveyard");
    expect(s.objects[top[2]!]!.zone).toBe("graveyard");
    expect(s.players[opp]!.graveyard.length).toBe(yard + 2);
  });
});

const grima = card("Gríma, Saruman's Footman", "Legendary Creature — Human Advisor", "{2}{U}{B}", {
  power: "1",
  toughness: "4",
  oracleText: "Gríma can't be blocked.\nWhenever Gríma deals combat damage to a player, that player exiles cards from the top of their library until they exile an instant or sorcery card. You may cast that card without paying its mana cost. Then that player puts the exiled cards that weren't cast this way on the bottom of their library in a random order.",
});

describe("Gríma, Saruman's Footman: exile until an instant or sorcery, cast it free; the rest on the bottom (rulings)", () => {
  const swing = (castIt: boolean) => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, grima);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: g, defender: opp }] });
    // Two lands, then a sorcery on top of their library as the damage is dealt.
    const lib = s.players[opp]!.library;
    const sorcery = putOnBattlefield(s, opp, card("Test Growth", "Sorcery", "{G}", { oracleText: "You gain 3 life." }));
    s.battlefield.splice(s.battlefield.indexOf(sorcery), 1);
    s.objects[sorcery]!.zone = "library";
    const lands = lib.filter((id) => s.cards[s.objects[id]!.cardId]!.types.includes("Land")).slice(0, 2);
    s.players[opp]!.library = [...lands, sorcery, ...lib.filter((id) => !lands.includes(id))];
    s = untilPending(s, "castFree");
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: sorcery });
    expect(lands.every((id) => s.objects[id]!.zone === "exile")).toBe(true);
    const life = s.players[ap]!.life;
    if (castIt) s = run(s, planCast(s, ap, sorcery));
    else s = act(s, { type: "chooseMay", player: ap, yes: false });
    s = settleBots(s);
    return { s, ap, opp, lands, sorcery, life };
  };
  it("cast it: you gain the life; the two lands go to the bottom", () => {
    supported(grima);
    const { s, ap, opp, lands, sorcery, life } = swing(true);
    expect(s.players[ap]!.life).toBe(life + 3);
    expect(s.objects[sorcery]!.zone).toBe("graveyard");
    expect(s.players[opp]!.library.slice(-2).sort()).toEqual([...lands].sort());
  });
  it("not cast: it goes to the bottom with the others", () => {
    const { s, opp, lands, sorcery } = swing(false);
    expect(s.players[opp]!.library.slice(-3).sort()).toEqual([...lands, sorcery].sort());
  });
});

const oviya = card("Oviya, Automech Artisan", "Legendary Creature — Human Artificer", "{3}{G}", {
  power: "1",
  toughness: "2",
  oracleText: "Each creature that's attacking one of your opponents has trample.\n{G}, {T}: You may put a creature or Vehicle card from your hand onto the battlefield. If you put an artifact onto the battlefield this way, put two +1/+1 counters on it.",
});

describe("Oviya, Automech Artisan", () => {
  it("creatures attacking your opponents have trample, whoever controls them; not those attacking you or a planeswalker", () => {
    supported(oviya);
    const { s: s0, ap } = setup([]);
    const [o1, o2] = [nextOf(s0, ap, 1), nextOf(s0, ap, 2)];
    putOnBattlefield(s0, ap, oviya);
    const pw = putOnBattlefield(s0, o2, walker);
    s0.objects[pw]!.counters = { loyalty: 5 };
    const [a, b] = [bears("A"), bears("B")].map((d) => putOnBattlefield(s0, ap, d));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a!, defender: o1 }, { attacker: b!, defender: o2, planeswalker: pw }] });
    expect(objHasKeyword(s, s.objects[a!]!, "Trample")).toBe(true);
    expect(objHasKeyword(s, s.objects[b!]!, "Trample")).toBe(false);
    // An opponent's creature attacking you doesn't have it.
    const { s: t0, ap: me } = setup([]);
    const them = nextOf(t0, me, 1);
    putOnBattlefield(t0, me, oviya);
    const c = putOnBattlefield(t0, them, bears("C"));
    let t = passUntil(t0, "declareAttackers", them);
    t = act(t, { type: "declareAttackers", player: them, attacks: [{ attacker: c, defender: me }] });
    expect(objHasKeyword(t, t.objects[c]!, "Trample")).toBe(false);
  });

  it("puts an artifact creature from your hand with two +1/+1 counters; a non-artifact creature gets none", () => {
    const golem = card("Test Golem", "Artifact Creature — Golem", "{5}", { power: "3", toughness: "3" });
    const { s: s0, ap, ids } = setup([golem, bears()]);
    const o = putOnBattlefield(s0, ap, oviya);
    let s = untilChoice(run(s0, planActivate(s0, ap, o, 0)));
    expect(s.pending).toMatchObject({ player: ap });
    s = settleBots(s);
    const put = ids.find((id) => s.objects[id]!.zone === "battlefield");
    expect(put).toBeDefined();
    expect(s.objects[put!]!.counters["+1/+1"] ?? 0).toBe(put === ids[0] ? 2 : 0);
  });
});

const aryel = card("Aryel, Knight of Windgrace", "Legendary Creature — Human Knight", "{2}{W}{B}", {
  power: "4",
  toughness: "4",
  keywords: ["Vigilance"],
  oracleText: "Vigilance\n{2}{W}, {T}: Create a 2/2 white Knight creature token with vigilance.\n{B}, {T}, Tap X untapped Knights you control: Destroy target creature with power X or less.",
});

describe("\"Tap X untapped Knights you control\": X is how many are tapped (CR 107.3a, 602.2b)", () => {
  it("Aryel: tap two Knights, destroy a creature with power 2", () => {
    supported(aryel);
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, aryel);
    const knight = (n: string) => card(n, "Creature — Human Knight", "{1}{W}", { power: "2", toughness: "2" });
    const [k1, k2] = [putOnBattlefield(s0, ap, knight("K1")), putOnBattlefield(s0, ap, knight("K2"))];
    const victim = putOnBattlefield(s0, opp, bears());
    const big = putOnBattlefield(s0, opp, card("Big", "Creature — Giant", "{4}", { power: "3", toughness: "3" }));
    // X = 2 can't destroy the 3-power one.
    expect(planActivate(s0, ap, a, 1, [{ kind: "object", id: big }], undefined, undefined, 2)).toBeNull();
    expect(planActivate(s0, ap, a, 1, [{ kind: "object", id: victim }], undefined, undefined, 3)).toBeNull(); // only two Knights
    let s = run(s0, planActivate(s0, ap, a, 1, [{ kind: "object", id: victim }], undefined, undefined, 2, { tap: [k1, k2] }));
    expect(s.objects[k1]!.tapped && s.objects[k2]!.tapped && s.objects[a]!.tapped).toBe(true);
    s = settleBots(s);
    expect(s.objects[victim]!.zone).toBe("graveyard");
  });
});

const hazel = card("Hazel of the Rootbloom", "Legendary Creature — Squirrel Druid", "{2}{B}{G}", {
  power: "3",
  toughness: "5",
  oracleText: "{T}, Pay 2 life, Tap X untapped tokens you control: Add X mana in any combination of colors.\nAt the beginning of your end step, create a token that's a copy of target token you control. If that token is a Squirrel, instead create two tokens that are copies of it.",
});
const squirrelToken = card("Squirrel", "Token Creature — Squirrel", "", { power: "1", toughness: "1", colors: ["G"] });
const clueToken = card("Clue", "Token Artifact — Clue", "", { oracleText: "{2}, Sacrifice this artifact: Draw a card." });

describe("Hazel of the Rootbloom", () => {
  const withTokens = (...defs: CardDef[]) => {
    const { s, ap } = setup([]);
    const h = putOnBattlefield(s, ap, hazel);
    const toks = defs.map((d) => {
      const id = putOnBattlefield(s, ap, d);
      s.objects[id]!.isToken = true;
      return id;
    });
    return { s, ap, h, toks };
  };
  it("tap two tokens and pay 2 life: two mana in any combination of colors (a mana ability)", () => {
    supported(hazel);
    const { s: s0, ap, h, toks } = withTokens(squirrelToken, clueToken);
    const life = s0.players[ap]!.life;
    let s = act(s0, { type: "activateAbility", player: ap, objectId: h, index: 0, x: 2, costs: { tap: toks } });
    expect(s.stack).toHaveLength(0);
    expect(s.pending).toMatchObject({ kind: "manaMix", player: ap, n: 2 });
    s = act(s, { type: "manaMix", player: ap, counts: { B: 1, G: 1 } });
    expect(s.players[ap]!.life).toBe(life - 2);
    expect(toks.every((id) => s.objects[id]!.tapped)).toBe(true);
    expect(s.players[ap]!.manaPool.B).toBeGreaterThanOrEqual(1);
  });
  it("end step: a Squirrel token is copied twice; another token once", () => {
    for (const [def, n] of [[squirrelToken, 2], [clueToken, 1]] as const) {
      const { s: s0, ap, toks } = withTokens(def);
      const before = s0.battlefield.length;
      let s = passUntil(s0, "end", ap);
      s = untilChoice(s);
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: toks[0]! }] } as Action);
      s = settleBots(s);
      expect(s.battlefield.length - before).toBe(n);
    }
  });
});
