// Round 320 (Lane A, skip-list cards): a stun counter on one of up to three tapped targets (Aerith Rescue Mission); a
// loot whenever your creatures deal combat damage to a player this turn (Jace, Cunning Castaway); a Food, then exile three
// cards from your graveyard to repeat (Insatiable Frugivore); damage for the untapped lands a player had as their turn
// began (Power Surge); kicked counters for opponents' nonbasic lands and Constructs by its power when targeted (Myriad
// Construct); a hot potato given away with a charge counter (Jinxed Choker); a discard for each card drawn unless you
// sacrifice a permanent (Read the Runes); a milled card for each opponent, returned unless they pay 3 life (Sivriss,
// Nightmare Speaker); -X/-0 until your next turn for the different mana values in your graveyard (All-Seeing Arbiter);
// a return from your graveyard transformed (Garland, Knight of Cornelia).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, pt, putOnBattlefield, setup, target } from "./helpers";
import { applyAction, botActions, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) s = act(s, botActions(s, p.player)[0]!);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** A copy of `def` in `pid`'s hand, graveyard or library (on top). */
const inZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const nextOf = (s: GameState, p: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(p) + 1) % s.turnOrder.length]!;
const logSince = (s: GameState, n: number) => s.log.slice(n).map((l) => l.text).join("\n");

// Real oracle text (Scryfall).
const aerith = (): CardDef => ({"oracleId":"14c3e48b-4c4e-4787-8c50-0e3aee19aa23","name":"Aerith Rescue Mission","manaCost":"{3}{W}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose one —\n• Take the Elevator — Create three 1/1 colorless Hero creature tokens.\n• Take 59 Flights of Stairs — Tap up to three target creatures. Put a stun counter on one of them. (If a permanent with a stun counter would become untapped, remove one from it instead.)","colors":["W"],"colorIdentity":["W"],"keywords":["Take 59 Flights of Stairs","Take the Elevator"],"commanderLegal":"legal","set":"fin","releasedAt":"2025-06-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const jace = (): CardDef => ({"oracleId":"d2341a16-ffde-42fa-9746-0d8888e812d4","name":"Jace, Cunning Castaway","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Legendary Planeswalker — Jace","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Jace"],"oracleText":"+1: Whenever one or more creatures you control deal combat damage to a player this turn, draw a card, then discard a card.\n−2: Create a 2/2 blue Illusion creature token with \"When this token becomes the target of a spell, sacrifice it.\"\n−5: Create two tokens that are copies of Jace, except they're not legendary.","loyalty":"3","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"xln","releasedAt":"2017-09-29","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const frugivore = (): CardDef => ({"oracleId":"4f31eea0-61b9-467d-8393-0ab9f1b6e882","name":"Insatiable Frugivore","manaCost":"{3}{B}","cmc":4,"typeLine":"Creature — Rat Berserker","supertypes":[],"types":["Creature"],"subtypes":["Rat","Berserker"],"oracleText":"When this creature enters, create a Food token, then you may exile three cards from your graveyard. If you do, repeat this process.\n{3}{B}, Sacrifice X Foods: Creatures you control get +X/+0 and gain menace until end of turn.","power":"2","toughness":"4","colors":["B"],"colorIdentity":["B"],"keywords":["Food"],"commanderLegal":"legal","set":"blc","releasedAt":"2024-08-02","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const surge = (): CardDef => ({"oracleId":"156b2228-f7b2-4816-b894-c4953a32c05f","name":"Power Surge","manaCost":"{R}{R}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of each player's upkeep, this enchantment deals X damage to that player, where X is the number of untapped lands they controlled at the beginning of this turn.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const myriad = (): CardDef => ({"oracleId":"f54111c8-9c20-4a73-a7c4-24d216e7de07","name":"Myriad Construct","manaCost":"{4}","cmc":4,"typeLine":"Artifact Creature — Construct","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Construct"],"oracleText":"Kicker {3}\nIf this creature was kicked, it enters with a +1/+1 counter on it for each nonbasic land your opponents control.\nWhen this creature becomes the target of a spell, sacrifice it and create a number of 1/1 colorless Construct artifact creature tokens equal to its power.","power":"4","toughness":"4","colors":[],"colorIdentity":[],"keywords":["Kicker"],"commanderLegal":"legal","set":"znr","releasedAt":"2020-09-25","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const choker = (): CardDef => ({"oracleId":"3241abc1-d739-4ac3-93d1-7fc2898b943b","name":"Jinxed Choker","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"At the beginning of your end step, target opponent gains control of this artifact and puts a charge counter on it.\nAt the beginning of your upkeep, this artifact deals damage to you equal to the number of charge counters on it.\n{3}: Put a charge counter on this artifact or remove one from it.","colors":[],"colorIdentity":[],"keywords":[],"commanderLegal":"legal","set":"mrd","releasedAt":"2003-10-02","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const runes = (): CardDef => ({"oracleId":"74316be1-041f-4a2e-a296-0b496f90ca25","name":"Read the Runes","manaCost":"{X}{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Draw X cards. For each card drawn this way, discard a card unless you sacrifice a permanent.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"ons","releasedAt":"2002-10-07","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const sivriss = (): CardDef => ({"oracleId":"ed15a3c4-110e-4f08-bf09-fabbf5b4eeb9","name":"Sivriss, Nightmare Speaker","manaCost":"{3}{B}","cmc":4,"typeLine":"Legendary Creature — Snake Cleric Warlock","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Snake","Cleric","Warlock"],"oracleText":"{T}, Sacrifice another creature or an artifact: For each opponent, you mill a card, then return that card from your graveyard to your hand unless that player pays 3 life. (To mill a card, put the top card of your library into your graveyard.)\nChoose a Background (You can have a Background as a second commander.)","power":"3","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":["Choose a background","Mill"],"commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const arbiter = (): CardDef => ({"oracleId":"f15460d9-0133-436c-b0fe-1661989124f0","name":"All-Seeing Arbiter","manaCost":"{4}{U}{U}","cmc":6,"typeLine":"Creature — Avatar","supertypes":[],"types":["Creature"],"subtypes":["Avatar"],"oracleText":"Flying\nWhenever this creature enters or attacks, draw two cards, then discard a card.\nWhenever you discard a card, target creature an opponent controls gets -X/-0 until your next turn, where X is the number of different mana values among cards in your graveyard.","power":"5","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"commanderLegal":"legal","set":"snc","releasedAt":"2022-04-29","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const garland = (): CardDef => ({"oracleId":"75e930dd-32e9-4c39-81a7-d833a3976b8d","name":"Garland, Knight of Cornelia // Chaos, the Endless","manaCost":"{B}{R}","cmc":2,"typeLine":"Legendary Creature — Human Knight // Legendary Creature — Demon","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"Whenever you cast a noncreature spell, surveil 1. (Look at the top card of your library. You may put it into your graveyard.)\n{3}{B}{B}{R}{R}: Return this card from your graveyard to the battlefield transformed. Activate only as a sorcery.","power":"3","toughness":"2","colors":["B","R"],"colorIdentity":["B","R"],"keywords":["Flying","Surveil","Transform"],"commanderLegal":"legal","set":"fin","releasedAt":"2025-06-13","rarity":"uncommon","layout":"transform","gameChanger":false,"faces":[{"name":"Garland, Knight of Cornelia","manaCost":"{B}{R}","typeLine":"Legendary Creature — Human Knight","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"Whenever you cast a noncreature spell, surveil 1. (Look at the top card of your library. You may put it into your graveyard.)\n{3}{B}{B}{R}{R}: Return this card from your graveyard to the battlefield transformed. Activate only as a sorcery.","power":"3","toughness":"2","colors":["B","R"]},{"name":"Chaos, the Endless","manaCost":"","typeLine":"Legendary Creature — Demon","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Demon"],"oracleText":"Flying\nWhen Chaos dies, put it on the bottom of its owner's library.","power":"5","toughness":"5","colors":["B","R"],"colorIndicator":["B","R"]}]} as CardDef);
const bear = (name: string) => card(name, "Creature — Bear", "{1}{G}", { cmc: 2, power: "2", toughness: "2" });
const land = (name: string, type = "Land") => card(name, type);

describe("round 320", () => {
  it("are fully supported", () => supported(aerith(), jace(), frugivore(), surge(), myriad(), choker(), runes(), sivriss(), arbiter(), garland()));
});

describe("round 320: Aerith Rescue Mission", () => {
  const three = () => {
    const { s, ap, ids, opp } = setup([aerith()]);
    const o2 = nextOf(s, opp);
    const a = putOnBattlefield(s, opp, bear("Bear A"));
    const b = putOnBattlefield(s, opp, bear("Bear B"));
    const c = putOnBattlefield(s, o2, bear("Bear C"));
    return { s, ap, spell: ids[0]!, a, b, c };
  };

  it("taps up to three target creatures and puts a stun counter on the one you choose as it resolves", () => {
    const { s: s0, ap, spell, a, b, c } = three();
    let s = settle(run(s0, planCast(s0, ap, spell, [target(a), target(b), target(c)], [1])), ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "splitTargets", options: ["0", "1", "2"] });
    expect((s.pending as { labels: string[] }).labels).toEqual(["Put a stun counter on Bear A", "Put a stun counter on Bear B", "Put a stun counter on Bear C"]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "1" }), ap);
    expect([a, b, c].map((id) => s.objects[id]!.tapped)).toEqual([true, true, true]);
    expect([a, b, c].map((id) => s.objects[id]!.counters.stun ?? 0)).toEqual([0, 1, 0]);
  });

  it("with only one target left, the counter goes on it without a question", () => {
    const { s: s0, ap, spell, a, b } = three();
    let s = run(s0, planCast(s0, ap, spell, [target(a), target(b), { kind: "none" }], [1]));
    // Bear A leaves before it resolves.
    s.battlefield.splice(s.battlefield.indexOf(a), 1);
    s.objects[a]!.zone = "graveyard";
    s.players[s.objects[a]!.owner]!.graveyard.push(a);
    invalidateCharacteristics(s);
    s = settle(s, ap);
    expect(s.pending).toBeFalsy();
    expect(s.objects[b]!.counters.stun).toBe(1);
  });

  it("the first mode makes three 1/1 colorless Hero tokens", () => {
    const { s: s0, ap, spell } = three();
    const s = settle(run(s0, planCast(s0, ap, spell, [], [0])), ap);
    const heroes = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]?.name === "Hero Token");
    expect(heroes.length).toBe(3);
    expect(pt(s, heroes[0]!)).toBe("1/1");
  });
});

import { abilitiesOf } from "../src";
const loyaltyIndex = (s: GameState, id: string, cost: number) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => a.loyalty === cost);
/** Answers `me`'s questions as a bot would, except "you may" ones, answered `yes`, until nothing is left. */
const drive = (s: GameState, me: PlayerId, yes: boolean | ((s: GameState) => boolean), max = 50) => {
  for (let i = 0; i < max; i++) {
    s = settle(s, me);
    const p = s.pending;
    if (!p) return s;
    if (p.kind === "chooseMay") s = act(s, { type: "chooseMay", player: me, yes: typeof yes === "function" ? yes(s) : yes });
    else s = act(s, botActions(s, me)[0]!);
  }
  return s;
};

describe("round 320: Jace, Cunning Castaway", () => {
  it("+1: each player your creatures deal combat damage to this turn gives you a loot", () => {
    const { s: s0, ap, opp } = setup([]);
    const o2 = nextOf(s0, opp);
    const j = putOnBattlefield(s0, ap, jace());
    s0.objects[j]!.counters.loyalty = 3;
    const x = putOnBattlefield(s0, ap, bear("Bear X"));
    const y = putOnBattlefield(s0, ap, bear("Bear Y"));
    let s = drive(run(s0, planActivate(s0, ap, j, loyaltyIndex(s0, j, 1))), ap, true);
    expect(s.objects[j]!.counters.loyalty).toBe(4);
    const hand = s.players[ap]!.hand.length;
    const yard = s.players[ap]!.graveyard.length;
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: x, defender: opp }, { attacker: y, defender: o2 }] });
    for (let i = 0; i < 100 && s.step !== "main2"; i++) s = s.pending ? act(s, botActions(s, s.pending.player)[0]!) : act(s, { type: "passPriority", player: waitingOn(s)! });
    s = drive(s, ap, true);
    // Two players dealt damage at once: it triggers once for each (rulings), a draw then a discard each time.
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.players[ap]!.graveyard.length).toBe(yard + 2);
    expect(s.players[opp]!.life).toBe(38);
    expect(s.players[o2]!.life).toBe(38);
  });

  it("the delayed trigger ends with the turn", () => {
    const { s: s0, ap } = setup([]);
    const j = putOnBattlefield(s0, ap, jace());
    s0.objects[j]!.counters.loyalty = 3;
    const s = drive(run(s0, planActivate(s0, ap, j, loyaltyIndex(s0, j, 1))), ap, true);
    expect((s.floatingTriggers ?? []).length).toBeGreaterThan(0);
    const later = passUntil(s, "upkeep", nextOf(s, ap));
    expect((later.floatingTriggers ?? []).length).toBe(0);
  });
});

describe("round 320: Insatiable Frugivore", () => {
  const cast = (yes: boolean | ((s: GameState) => boolean), inYard = 7) => {
    const { s: s0, ap, ids } = setup([frugivore()]);
    for (let i = 0; i < inYard; i++) inZone(s0, ap, bear(`Dead ${i}`), "graveyard");
    const s = drive(run(s0, planCast(s0, ap, ids[0]!)), ap, yes);
    const foods = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]?.name === "Food Token" && controllerOf(s, s.objects[id]!) === ap);
    return { s, ap, foods };
  };

  it("a Food, then three cards exiled from your graveyard for another, until you can't exile three", () => {
    const { s, ap, foods } = cast(true);
    // 7 cards: exiled 3, then 3, then only 1 left, so it isn't asked again (rulings).
    expect(foods.length).toBe(3);
    expect(s.players[ap]!.graveyard.length).toBe(1);
    expect(s.players[ap]!.exile.length).toBe(6);
  });

  it("declining ends it", () => {
    const { s, ap, foods } = cast(false);
    expect(foods.length).toBe(1);
    expect(s.players[ap]!.graveyard.length).toBe(7);
  });

  it("declining the second time ends it after two Foods", () => {
    let asked = 0;
    const { s, foods } = cast(() => ++asked === 1);
    expect(asked).toBe(2);
    expect(foods.length).toBe(2);
    expect(s.players[s.activePlayer]!.graveyard.length).toBe(4);
  });
});

describe("round 320: Power Surge", () => {
  it("deals damage for the untapped lands the player had as the turn began, before their untap step", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, surge());
    const l1 = putOnBattlefield(s0, opp, land("Waste A"));
    putOnBattlefield(s0, opp, land("Waste B"));
    putOnBattlefield(s0, opp, land("Waste C"));
    s0.objects[l1]!.tapped = true;
    let s = passUntil(s0, "upkeep", opp);
    // Untapped by now, but it was tapped as the turn began.
    expect(s.objects[l1]!.tapped).toBe(false);
    const life = s.players[opp]!.life;
    s = drive(s, ap, true);
    expect(s.players[opp]!.life).toBe(life - 2);
  });

  it("deals none to a player who began the turn with no untapped lands", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, surge());
    const o2 = nextOf(s0, opp);
    let s = passUntil(s0, "upkeep", o2);
    const life = s.players[o2]!.life;
    s = drive(s, ap, true);
    expect(s.players[o2]!.life).toBe(life);
  });
});

describe("round 320: Myriad Construct", () => {
  const board = (kick: boolean) => {
    const pump = card("Pump", "Instant", "{G}", { cmc: 1, oracleText: "Target creature gets +3/+3 until end of turn." });
    const { s: s0, ap, ids, opp } = setup([myriad(), pump]);
    putOnBattlefield(s0, opp, land("Waste A"));
    putOnBattlefield(s0, nextOf(s0, opp), land("Waste B"));
    putOnBattlefield(s0, opp, card("Forest", "Basic Land — Forest"));
    putOnBattlefield(s0, ap, land("Waste Mine"));
    const s = drive(run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, undefined, kick ? { kicks: [0] } : {})), ap, true);
    const m = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]?.name === "Myriad Construct")!;
    return { s, ap, m, pump: ids[1]! };
  };

  it("kicked, it enters with a +1/+1 counter for each nonbasic land your opponents control", () => {
    const { s, m } = board(true);
    expect(s.objects[m]!.counters["+1/+1"]).toBe(2);
    expect(pt(s, m)).toBe("6/6");
  });

  it("not kicked, none", () => {
    const { s, m } = board(false);
    expect(s.objects[m]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("targeted by a spell, it's sacrificed for Constructs equal to its power as it last existed, before the spell resolves", () => {
    const { s: s0, ap, m, pump } = board(true);
    const s = drive(run(s0, planCast(s0, ap, pump, [target(m)])), ap, true);
    expect(s.objects[m]!.zone).toBe("graveyard");
    const constructs = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]?.name === "Construct Token");
    expect(constructs.length).toBe(6);
    expect(pt(s, constructs[0]!)).toBe("1/1");
  });
});

describe("round 320: Jinxed Choker", () => {
  it("at your end step a target opponent gains control of it and puts a charge counter on it, then it hurts them at their upkeep", () => {
    const { s: s0, ap } = setup([]);
    const j = putOnBattlefield(s0, ap, choker());
    let s = passUntil(s0, "end", ap);
    s = drive(s, ap, true);
    const now = controllerOf(s, s.objects[j]!);
    expect(now).not.toBe(ap);
    expect(s.objects[j]!.counters.charge).toBe(1);
    s.players[now]!.hand = [];
    s = passUntil(s, "upkeep", now);
    const life = s.players[now]!.life;
    s = drive(s, ap, true);
    expect(s.players[now]!.life).toBe(life - 1);
  });
});

describe("round 320: Read the Runes", () => {
  const go = (sac: number) => {
    const { s: s0, ap, ids } = setup([runes(), bear("Kept A"), bear("Kept B"), bear("Kept C")]);
    const hand = s0.players[ap]!.hand.length - 1;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, 3)), ap);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, min: 0, count: 3 });
    const lands = s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === ap && s.cards[s.objects[id]!.cardId]!.name === "Forest").slice(0, sac);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: lands }), ap);
    return { s, ap, lands, hand };
  };

  it("draws X, then a discard for each card drawn you don't sacrifice a permanent for", () => {
    const { s: s0, ap, lands, hand } = go(1);
    expect(lands.every((id) => s0.objects[id]!.zone === "graveyard")).toBe(true);
    // 3 drawn, 2 to discard.
    expect(s0.pending).toMatchObject({ kind: "discard", player: ap });
    const s = drive(s0, ap, true);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("sacrificing a permanent for each card drawn, nothing is discarded", () => {
    const { s, ap, hand } = go(3);
    expect(s.pending).toBeFalsy();
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
  });
});

describe("round 320: Sivriss, Nightmare Speaker", () => {
  it("for each opponent in turn order, a milled card that returns to your hand unless that player pays 3 life", () => {
    const { s: s0, ap, opp } = setup([]);
    const o2 = nextOf(s0, opp);
    const o3 = nextOf(s0, o2);
    const sv = putOnBattlefield(s0, ap, sivriss());
    const art = putOnBattlefield(s0, ap, card("Trinket", "Artifact", "{1}", { cmc: 1 }));
    // Milled in this order: Top 1 for the first opponent, then Top 2, then Top 3.
    const [t3, t2, t1] = ["Top 3", "Top 2", "Top 1"].map((n) => inZone(s0, ap, bear(n), "library"));
    let s = run(s0, planActivate(s0, ap, sv, 0, [], undefined, undefined, undefined, { sacrifice: [art] }));
    expect(s.objects[art]!.zone).toBe("graveyard");
    const asked: PlayerId[] = [];
    for (let i = 0; i < 100 && (s.stack.length || s.pending); i++) {
      const p = s.pending;
      if (!p) {
        s = act(s, { type: "passPriority", player: waitingOn(s)! });
        continue;
      }
      if (p.player === ap) throw new Error(`asked ${p.kind}`);
      asked.push(p.player);
      // The second opponent pays; the others don't.
      expect(p).toMatchObject({ kind: "payUnless", life: 3 });
      s = act(s, { type: "payUnless", player: p.player, pay: p.player === o2 });
    }
    expect(asked).toEqual([opp, o2, o3]);
    expect([t1, t2, t3].map((id) => s.objects[id]!.zone)).toEqual(["hand", "graveyard", "hand"]);
    expect(s.players[o2]!.life).toBe(37);
    expect(s.players[opp]!.life).toBe(40);
  });
});

describe("round 320: All-Seeing Arbiter", () => {
  it("whenever you discard, target opponent's creature gets -X/-0 until your next turn, X the mana values in your graveyard", () => {
    const loot = card("Loot", "Sorcery", "{U}", { cmc: 1, oracleText: "Draw a card, then discard a card." });
    const { s: s0, ap, ids, opp } = setup([loot]);
    s0.players[ap]!.hand = [ids[0]!];
    putOnBattlefield(s0, ap, arbiter());
    const big = putOnBattlefield(s0, opp, card("Big", "Creature — Giant", "{4}", { cmc: 4, power: "5", toughness: "5" }));
    inZone(s0, ap, land("Waste A"), "graveyard");
    inZone(s0, ap, bear("Old Bear"), "graveyard");
    inZone(s0, ap, bear("Old Bear 2"), "graveyard");
    inZone(s0, ap, card("Three", "Sorcery", "{2}{U}", { cmc: 3 }), "graveyard");
    inZone(s0, ap, land("Waste Z"), "library");
    let s = drive(run(s0, planCast(s0, ap, ids[0]!)), ap, true);
    // Mana values 0 (two lands), 1 (Loot), 2 and 3: four (rulings: a land's is 0).
    expect(pt(s, big)).toBe("1/5");
    s = passUntil(s, "upkeep", opp);
    expect(pt(s, big)).toBe("1/5");
    s.players[ap]!.hand = [];
    s = passUntil(s, "upkeep", ap);
    expect(pt(s, big)).toBe("5/5");
  });
});

describe("round 320: Garland, Knight of Cornelia", () => {
  it("returns from your graveyard transformed as a sorcery", () => {
    const { s: s0, ap } = setup([]);
    const g = inZone(s0, ap, garland(), "graveyard");
    const s = drive(run(s0, planActivate(s0, ap, g, 0)), ap, true);
    expect(s.objects[g]!.zone).toBe("battlefield");
    expect(s.cards[s.objects[g]!.cardId]!.name).toContain("Garland");
    expect(pt(s, g)).toBe("5/5");
    expect(controllerOf(s, s.objects[g]!)).toBe(ap);
  });

  it("not at instant speed", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = inZone(s0, ap, garland(), "graveyard");
    const s = passUntil(s0, "upkeep", opp);
    expect(planActivate(s, ap, g, 0)).toBeNull();
  });
});
