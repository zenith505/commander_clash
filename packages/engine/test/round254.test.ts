// Round 254: the top of the popularity list (earlier skip lists). Raul, Trouble Shooter (cast a spell from among cards
// milled this turn, once each turn; rulings: only cards milled, not put there another way), The Master, Transcendent (a
// creature card milled this turn onto the battlefield as a green 3/3 Mutant), Liesa, Shroud of Dusk (the commander tax
// as life), Chandra, Flameshaper (+2: choose one of the exiled cards to play), Nissa of Shadowed Boughs (−5: a creature
// card from the hand or graveyard with two +1/+1 counters), Wrenn and Six (an emblem giving retrace), Gemcutter
// Buccaneer (Treasures are Equipment with equip Pirate {1} and equip {3}), Haakon, Stromgald Scourge (cast only from the
// graveyard; Knight spells from the graveyard) and Smirking Spelljacker (exile a spell, cast it free when it attacks).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup, swamp } from "./helpers";
import { abilitiesOf, applyAction, botActions, castProblem, characteristics, commanderTax, commanderTaxLife, controllerOf, graveyardWays, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Everyone passes until the stack is empty, answering trigger targets with `targets`; stops at any other question. */
const settle = (s: GameState, opts: { targets?: TargetChoice[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** The bots' answers for every question, whoever is asked, until the stack is empty. */
const settleBots = (s: GameState) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    s = s.pending ? botActions(s, pid).reduce((x, a) => act(x, a), s) : act(s, { type: "passPriority", player: pid });
  }
  return s;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const turnPermit = { via: "turnPermission" as const };

// Real oracle text (Scryfall).
const raul = (): CardDef => ({"oracleId":"d247a86d-917d-4833-82c4-876943d54e2c","name":"Raul, Trouble Shooter","manaCost":"{1}{U}{B}","cmc":3,"typeLine":"Legendary Creature — Zombie Mutant Rogue","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Zombie","Mutant","Rogue"],"oracleText":"Once during each of your turns, you may cast a spell from among cards in your graveyard that were milled this turn.\n{T}: Each player mills a card. (They each put the top card of their library into their graveyard.)","power":"1","toughness":"4","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/3/b/3b73a314-b197-4954-a242-7d9096a406c1.jpg?1783912385","artUrl":"https://cards.scryfall.io/art_crop/front/3/b/3b73a314-b197-4954-a242-7d9096a406c1.jpg?1783912385","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const master = (): CardDef => ({"oracleId":"40262ae5-1472-4777-b759-d1752c0b0148","name":"The Master, Transcendent","manaCost":"{1}{B}{G}{U}","cmc":4,"typeLine":"Legendary Artifact Creature — Mutant","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Mutant"],"oracleText":"When The Master enters, target player gets two rad counters.\n{T}: Put target creature card in a graveyard that was milled this turn onto the battlefield under your control. It's a green Mutant with base power and toughness 3/3. (It loses its other colors and creature types.)","power":"2","toughness":"4","colors":["B","G","U"],"colorIdentity":["B","G","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/b/5b0497da-670a-405c-a39c-97cae7942836.jpg?1783912421","artUrl":"https://cards.scryfall.io/art_crop/front/5/b/5b0497da-670a-405c-a39c-97cae7942836.jpg?1783912421","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const liesa = (): CardDef => ({"oracleId":"2270daaf-252d-40c4-bed5-bd46ae15f041","name":"Liesa, Shroud of Dusk","manaCost":"{2}{W}{W}{B}","cmc":5,"typeLine":"Legendary Creature — Angel","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Rather than pay {2} for each previous time you've cast this spell from the command zone this game, pay 2 life that many times.\nFlying, lifelink\nWhenever a player casts a spell, they lose 2 life.","power":"5","toughness":"5","colors":["B","W"],"colorIdentity":["B","W"],"keywords":["Flying","Lifelink"],"imageUrl":"https://cards.scryfall.io/normal/front/e/d/ed90b377-8f27-47fc-a004-0f84f4ad6490.jpg?1783928635","artUrl":"https://cards.scryfall.io/art_crop/front/e/d/ed90b377-8f27-47fc-a004-0f84f4ad6490.jpg?1783928635","commanderLegal":"legal","set":"cmr","releasedAt":"2020-11-20","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const chandra = (): CardDef => ({"oracleId":"818f908c-9af6-4edc-bb0e-193bc830e2e4","name":"Chandra, Flameshaper","manaCost":"{5}{R}{R}","cmc":7,"typeLine":"Legendary Planeswalker — Chandra","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Chandra"],"oracleText":"+2: Add {R}{R}{R}. Exile the top three cards of your library. Choose one. You may play that card this turn.\n+1: Create a token that's a copy of target creature you control, except it has haste and \"At the beginning of the end step, sacrifice this token.\"\n−4: Chandra deals 8 damage divided as you choose among any number of target creatures and/or planeswalkers.","loyalty":"6","colors":["R"],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/a/2/a22d21ec-0fb3-4574-a803-6442ec13167e.jpg?1783909105","artUrl":"https://cards.scryfall.io/art_crop/front/a/2/a22d21ec-0fb3-4574-a803-6442ec13167e.jpg?1783909105","commanderLegal":"legal","set":"fdn","releasedAt":"2024-11-15","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const nissa = (): CardDef => ({"oracleId":"15e3e226-0dd1-4c9b-a7ec-af67509cbfc5","name":"Nissa of Shadowed Boughs","manaCost":"{2}{B}{G}","cmc":4,"typeLine":"Legendary Planeswalker — Nissa","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Nissa"],"oracleText":"Landfall — Whenever a land you control enters, put a loyalty counter on Nissa.\n+1: Untap target land you control. You may have it become a 3/3 Elemental creature with haste and menace until end of turn. It's still a land.\n−5: You may put a creature card with mana value less than or equal to the number of lands you control onto the battlefield from your hand or graveyard with two +1/+1 counters on it.","loyalty":"4","colors":["B","G"],"colorIdentity":["B","G"],"keywords":["Landfall"],"imageUrl":"https://cards.scryfall.io/normal/front/6/d/6d69f943-d474-47c0-bc6b-1b247a5dd6f3.jpg?1783929321","artUrl":"https://cards.scryfall.io/art_crop/front/6/d/6d69f943-d474-47c0-bc6b-1b247a5dd6f3.jpg?1783929321","commanderLegal":"legal","set":"znr","releasedAt":"2020-09-25","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const wrenn = (): CardDef => ({"oracleId":"108ae90a-50fa-4cfd-b751-d630e41425fe","name":"Wrenn and Six","manaCost":"{R}{G}","cmc":2,"typeLine":"Legendary Planeswalker — Wrenn","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Wrenn"],"oracleText":"+1: Return up to one target land card from your graveyard to your hand.\n−1: Wrenn and Six deals 1 damage to any target.\n−7: You get an emblem with \"Instant and sorcery cards in your graveyard have retrace.\" (You may cast instant and sorcery cards from your graveyard by discarding a land card in addition to paying their other costs.)","loyalty":"3","colors":["G","R"],"colorIdentity":["G","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/a/4a706ecf-3277-40e3-871c-4ba4ead16e20.jpg?1783933076","artUrl":"https://cards.scryfall.io/art_crop/front/4/a/4a706ecf-3277-40e3-871c-4ba4ead16e20.jpg?1783933076","commanderLegal":"legal","set":"mh1","releasedAt":"2019-06-14","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const gemcutter = (): CardDef => ({"oracleId":"68e45c07-96c5-4f87-a816-d9fa4f119740","name":"Gemcutter Buccaneer","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Orc Pirate Artificer","supertypes":[],"types":["Creature"],"subtypes":["Orc","Pirate","Artificer"],"oracleText":"Whenever this creature or another Pirate you control enters, create a tapped Treasure token.\nTreasures you control are Equipment in addition to their other types and have \"Equipped creature gets +2/+0,\" equip Pirate {1}, and equip {3}.","power":"1","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":["Treasure"],"imageUrl":"https://cards.scryfall.io/normal/front/9/0/90a9cab7-fc1a-4311-ae6a-5fd53208c0e3.jpg?1783913918","artUrl":"https://cards.scryfall.io/art_crop/front/9/0/90a9cab7-fc1a-4311-ae6a-5fd53208c0e3.jpg?1783913918","commanderLegal":"legal","set":"lcc","releasedAt":"2023-11-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const haakon = (): CardDef => ({"oracleId":"8f089280-e5da-4fda-8bff-dea2971d0292","name":"Haakon, Stromgald Scourge","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Legendary Creature — Zombie Knight","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Zombie","Knight"],"oracleText":"You may cast this card from your graveyard, but not from anywhere else.\nAs long as Haakon is on the battlefield, you may cast Knight spells from your graveyard.\nWhen Haakon dies, you lose 2 life.","power":"3","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/0/10a7101e-e6c7-40d6-82cb-daa84701d1f8.jpg?1783943349","artUrl":"https://cards.scryfall.io/art_crop/front/1/0/10a7101e-e6c7-40d6-82cb-daa84701d1f8.jpg?1783943349","commanderLegal":"legal","set":"csp","releasedAt":"2006-07-21","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const jacker = (): CardDef => ({"oracleId":"b23c28ec-dc4d-4072-8fd8-6640a104335a","name":"Smirking Spelljacker","manaCost":"{4}{U}","cmc":5,"typeLine":"Creature — Djinn Wizard Rogue","supertypes":[],"types":["Creature"],"subtypes":["Djinn","Wizard","Rogue"],"oracleText":"Flash\nFlying\nWhen this creature enters, exile target spell an opponent controls.\nWhenever this creature attacks, if a card is exiled with it, you may cast the exiled card without paying its mana cost.","power":"3","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/0/1/01d1e394-1b0c-4b40-ba85-f55973703d41.jpg?1783911967","artUrl":"https://cards.scryfall.io/art_crop/front/0/1/01d1e394-1b0c-4b40-ba85-f55973703d41.jpg?1783911967","commanderLegal":"legal","set":"otc","releasedAt":"2024-04-19","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const study = card("Test Study", "Sorcery", "{1}{U}", { oracleText: "Draw two cards." });
const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." });
const ogre = card("Test Ogre", "Creature — Ogre", "{4}{R}", { power: "5", toughness: "5" });
const giant = card("Test Giant", "Creature — Giant", "{6}{G}", { power: "7", toughness: "7" });
const mill = card("Test Mill", "Sorcery", "{U}", { oracleText: "Each player mills a card." });
const knight = card("Test Knight", "Creature — Human Knight", "{1}{B}", { power: "2", toughness: "2" });
const pirate = card("Test Pirate", "Creature — Human Pirate", "{1}{R}", { power: "2", toughness: "2" });
const wastes = card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." });

describe("round 254", () => {
  it("every card of the round compiles fully", () => {
    supported(raul(), master(), liesa(), chandra(), nissa(), wrenn(), gemcutter(), haakon(), jacker());
  });
});

describe("Raul, Trouble Shooter: cast a spell from among cards milled this turn", () => {
  it("once each turn, a milled card from your graveyard; a card put there without a mill can't (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, raul());
    into(s0, ap, study, "library"); // the next one
    const top = into(s0, ap, study, "library");
    const notMilled = into(s0, ap, shock, "graveyard");
    s0.objects[notMilled]!.toGraveyardTurn = s0.turn;
    s0.objects[notMilled]!.fromLibraryTurn = s0.turn;
    let s = settle(run(s0, planActivate(s0, ap, r, 0)));
    // Its {T} ability: each player mills a card, so the top Study (not the one under it) is in the graveyard.
    expect(zone(s, top)).toBe("graveyard");
    expect(s.objects[top]!.milledTurn).toBe(s.turn);
    expect(graveyardWays(s, s.objects[top]!).map((w) => w.kind)).toEqual(["turnPermission"]);
    expect(graveyardWays(s, s.objects[notMilled]!)).toEqual([]);
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, top, undefined, undefined, "auto", undefined, turnPermit)));
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    // Used up for the turn: a second milled card can't be cast this way.
    const second = s.players[ap]!.library[0]!;
    s.objects[second]!.zone = "graveyard";
    s.players[ap]!.library.shift();
    s.players[ap]!.graveyard.push(second);
    Object.assign(s.objects[second]!, { toGraveyardTurn: s.turn, fromLibraryTurn: s.turn, milledTurn: s.turn });
    expect(graveyardWays(s, s.objects[second]!)).toEqual([]);
  });

  it("not during another player's turn, and not an opponent's milled card", () => {
    const { s: s0, ap, opp, ids } = setup([mill]);
    const r = putOnBattlefield(s0, ap, raul());
    const mine = into(s0, ap, shock, "library");
    const theirs = into(s0, opp, shock, "library");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, mine)).toBe("graveyard");
    expect(zone(s, theirs)).toBe("graveyard");
    expect(graveyardWays(s, s.objects[mine]!).map((w) => w.kind)).toEqual(["turnPermission"]);
    expect(graveyardWays(s, s.objects[theirs]!, ap)).toEqual([]);
    expect(abilitiesOf(s, s.objects[r]!).graveyardGrants?.[0]?.arrived).toBe("milled");
    // On the opponent's turn (still this game turn's mill doesn't count then): no permission for you.
    s.activePlayer = opp;
    expect(graveyardWays(s, s.objects[mine]!)).toEqual([]);
  });
});

describe("The Master, Transcendent: a creature card milled this turn onto the battlefield as a green 3/3 Mutant", () => {
  it("from an opponent's graveyard, under your control; it loses its other colors and creature types (rulings)", () => {
    const { s: s0, ap, opp, ids } = setup([mill]);
    const m = putOnBattlefield(s0, ap, master());
    const o = into(s0, opp, ogre, "library");
    const old = into(s0, opp, giant, "graveyard"); // put there earlier: not milled this turn
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, o)).toBe("graveyard");
    expect(planActivate(s, ap, m, 0, [tgt(old)])).toBeNull();
    s = settle(run(s, planActivate(s, ap, m, 0, [tgt(o)])));
    expect(zone(s, o)).toBe("battlefield");
    expect(controllerOf(s, s.objects[o]!)).toBe(ap);
    const c = characteristics(s, s.objects[o]!);
    expect(c.colors).toEqual(["G"]);
    expect(c.subtypes).toEqual(["Mutant"]);
    expect(pt(s, o)).toBe("3/3");
  });
});

describe("Liesa, Shroud of Dusk: the commander tax paid as life", () => {
  const withLiesa = () => {
    const { s, ap } = setup([]);
    const def = liesa();
    s.cards[def.oracleId] = def;
    const id = s.players[ap]!.command[0]!;
    s.objects[id]!.cardId = def.oracleId;
    invalidateCharacteristics(s);
    return { s, ap, id };
  };

  it("2 life for each previous cast from the command zone, no mana for the tax (rulings)", () => {
    const { s: s0, ap, id } = withLiesa();
    s0.players[ap]!.commanderCasts[id] = 2;
    expect(commanderTax(s0.players[ap]!, s0.objects[id]!, liesa())).toBe(0);
    expect(commanderTaxLife(s0.players[ap]!, s0.objects[id]!, liesa())).toBe(4);
    const life = s0.players[ap]!.life;
    let s = run(s0, planCast(s0, ap, id));
    // {2}{W}{W}{B}: five lands, no more.
    expect(s.battlefield.filter((b) => s.objects[b]!.tapped && controllerOf(s, s.objects[b]!) === ap).length).toBe(5);
    expect(s.players[ap]!.life).toBe(life - 4);
    s = settle(s);
    expect(zone(s, id)).toBe("battlefield");
    expect(s.players[ap]!.commanderCasts[id]).toBe(3);
  });

  it("the first cast pays nothing more; without enough life it can't be cast", () => {
    const { s: s0, ap, id } = withLiesa();
    const life = s0.players[ap]!.life;
    const s = run(s0, planCast(s0, ap, id));
    expect(s.players[ap]!.life).toBe(life);
    const { s: s1, ap: ap1, id: id1 } = withLiesa();
    s1.players[ap1]!.commanderCasts[id1] = 2;
    s1.players[ap1]!.life = 3;
    expect(castProblem(s1, ap1, id1)).not.toBeNull();
    expect(planCast(s1, ap1, id1)).toBeNull();
  });
});

describe("Chandra, Flameshaper", () => {
  it("+2: adds {R}{R}{R}, exiles the top three cards; the one chosen may be played this turn", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, chandra());
    s0.objects[c]!.counters.loyalty = 6;
    const top = [into(s0, ap, ogre, "library"), into(s0, ap, study, "library"), into(s0, ap, shock, "library")].reverse();
    let s = run(s0, planActivate(s0, ap, c, 0));
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "impulseChoice" });
    s = act(s, { type: "chooseOption", player: ap, choice: top[2]! });
    s = settle(s);
    for (const id of top) expect(zone(s, id)).toBe("exile");
    expect(s.players[ap]!.manaPool.R).toBe(3);
    expect(s.objects[c]!.counters.loyalty).toBe(8);
    // The chosen Ogre can be cast with the red mana and lands; the others can't be played.
    expect(planCast(s, ap, top[2]!)).not.toBeNull();
    expect(castProblem(s, ap, top[0]!)).not.toBeNull();
  });
});

describe("Nissa of Shadowed Boughs: −5", () => {
  it("a creature card from your graveyard with two +1/+1 counters, mana value up to the lands you control", () => {
    const { s: s0, ap } = setup([]);
    const n = putOnBattlefield(s0, ap, nissa());
    s0.objects[n]!.counters.loyalty = 6;
    const o = into(s0, ap, ogre, "graveyard");
    const g = into(s0, ap, giant, "hand");
    // 14 lands: both fit; take the Ogre from the graveyard.
    let s = settle(run(s0, planActivate(s0, ap, n, 1)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    expect((s.pending as { cards: string[] }).cards).toEqual(expect.arrayContaining([o, g]));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [o] }));
    expect(zone(s, o)).toBe("battlefield");
    expect(s.objects[o]!.counters["+1/+1"]).toBe(2);
    expect(pt(s, o)).toBe("7/7");
    expect(zone(s, g)).toBe("hand");
  });

  it("only mana value less than or equal to the number of lands you control", () => {
    const { s: s0, ap } = setup([]);
    s0.battlefield = s0.battlefield.filter((id) => !(controllerOf(s0, s0.objects[id]!) === ap && characteristics(s0, s0.objects[id]!).types.includes("Land")));
    for (let i = 0; i < 5; i++) putOnBattlefield(s0, ap, wastes);
    invalidateCharacteristics(s0);
    const n = putOnBattlefield(s0, ap, nissa());
    s0.objects[n]!.counters.loyalty = 6;
    const o = into(s0, ap, ogre, "hand");
    const g = into(s0, ap, giant, "graveyard");
    let s = settle(run(s0, planActivate(s0, ap, n, 1)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary" });
    const offered = (s.pending as { cards: string[] }).cards;
    expect(offered).toContain(o);
    expect(offered).not.toContain(g);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [o] }));
    expect(zone(s, o)).toBe("battlefield");
    expect(s.objects[o]!.counters["+1/+1"]).toBe(2);
  });
});

describe("Wrenn and Six: −7 emblem", () => {
  it("instant and sorcery cards in your graveyard have retrace", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, wrenn());
    s0.objects[w]!.counters.loyalty = 7;
    const st = into(s0, ap, study, "graveyard");
    const land = into(s0, ap, wastes, "hand");
    const b = into(s0, ap, bear(), "graveyard");
    expect(graveyardWays(s0, s0.objects[st]!)).toEqual([]);
    let s = settle(run(s0, planActivate(s0, ap, w, 2)));
    expect(graveyardWays(s, s.objects[st]!).map((g) => g.kind)).toEqual(["grantedRetrace"]);
    expect(graveyardWays(s, s.objects[b]!)).toEqual([]);
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, st, undefined, undefined, undefined, undefined, { via: "grantedRetrace", discard: [land] })));
    expect(zone(s, land)).toBe("graveyard");
    // Retrace puts it back into the graveyard as it resolves, to be cast again (rulings).
    expect(zone(s, st)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
  });
});

describe("Gemcutter Buccaneer: Treasures are Equipment", () => {
  it("equip Pirate {1}, equip {3}, and the equipped creature gets +2/+0", () => {
    const { s: s0, ap, ids } = setup([gemcutter()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const g = ids[0]!;
    const treasures = s.battlefield.filter((id) => characteristics(s, s.objects[id]!).subtypes.includes("Treasure"));
    expect(treasures.length).toBe(1);
    const t = treasures[0]!;
    expect(characteristics(s, s.objects[t]!).subtypes).toEqual(expect.arrayContaining(["Treasure", "Equipment"]));
    const acts = abilitiesOf(s, s.objects[t]!).activated;
    const pirateEquip = acts.findIndex((a) => /^Equip Pirate \{1\}/.test(a.text ?? ""));
    const anyEquip = acts.findIndex((a) => /^Equip \{3\}/.test(a.text ?? ""));
    expect(pirateEquip).toBeGreaterThanOrEqual(0);
    expect(anyEquip).toBeGreaterThanOrEqual(0);
    const b = putOnBattlefield(s, ap, bear());
    // Equip Pirate only onto a Pirate.
    expect(planActivate(s, ap, t, pirateEquip, [tgt(b)])).toBeNull();
    s = settle(run(s, planActivate(s, ap, t, pirateEquip, [tgt(g)])));
    expect(s.objects[t]!.attachedTo).toBe(g);
    expect(pt(s, g)).toBe("3/3"); // a 1/3
    s = settle(run(s, planActivate(s, ap, t, anyEquip, [tgt(b)])));
    expect(s.objects[t]!.attachedTo).toBe(b);
    expect(pt(s, b)).toBe("4/2");
    expect(pt(s, g)).toBe("1/3");
  });

  it("another Pirate entering makes a tapped Treasure too", () => {
    const { s: s0, ap, ids } = setup([pirate]);
    putOnBattlefield(s0, ap, gemcutter());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const treasures = s.battlefield.filter((id) => characteristics(s, s.objects[id]!).subtypes.includes("Treasure"));
    expect(treasures.length).toBe(1);
    expect(s.objects[treasures[0]!]!.tapped).toBe(true);
  });
});

describe("Haakon, Stromgald Scourge", () => {
  it("can't be cast from the hand; from the graveyard it can, and Knight spells too while it's on the battlefield", () => {
    const { s: s0, ap, ids } = setup([haakon()]);
    expect(castProblem(s0, ap, ids[0]!)).toMatch(/only from your graveyard/);
    expect(planCast(s0, ap, ids[0]!)).toBeNull();
    putOnBattlefield(s0, ap, swamp);
    const k = into(s0, ap, knight, "graveyard");
    expect(graveyardWays(s0, s0.objects[k]!)).toEqual([]);
    s0.objects[ids[0]!]!.zone = "graveyard";
    s0.players[ap]!.hand = [];
    s0.players[ap]!.graveyard.push(ids[0]!);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { via: "permission" })));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(graveyardWays(s, s.objects[k]!).map((w) => w.kind)).toEqual(["permission"]);
    s = settle(run(s, planCast(s, ap, k, undefined, undefined, "auto", undefined, { via: "permission" })));
    expect(zone(s, k)).toBe("battlefield");
  });

  it("as a commander, it can't be cast from the command zone (rulings)", () => {
    const { s, ap } = setup([]);
    const def = haakon();
    s.cards[def.oracleId] = def;
    const id = s.players[ap]!.command[0]!;
    s.objects[id]!.cardId = def.oracleId;
    invalidateCharacteristics(s);
    expect(castProblem(s, ap, id)).toMatch(/only from your graveyard/);
    expect(planCast(s, ap, id)).toBeNull();
  });
});

describe("Smirking Spelljacker", () => {
  /** Opp casts Test Shock at ap; ap flashes in the Spelljacker, whose trigger exiles the Shock. */
  const jacked = () => {
    const { s: s0, ap, opp, ids } = setup([jacker()]);
    const sh = into(s0, opp, shock, "hand");
    s0.players[opp]!.manaPool.R = 1;
    let s = act(s0, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    s = run(s, planCast(s, opp, sh, [{ kind: "player", id: ap }]));
    for (let i = 0; i < 10 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const item = s.stack.find((x) => x.kind === "spell" && x.objectId === sh)!;
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s, { targets: [{ kind: "stack", id: item.id }] });
    return { s, ap, opp, j: ids[0]!, sh };
  };

  it("exiles target spell an opponent controls; when it attacks, you may cast that card without paying its mana cost", () => {
    let { s, ap, opp, j, sh } = jacked();
    expect(zone(s, sh)).toBe("exile");
    expect(s.stack.length).toBe(0); // the Shock never resolved
    expect(Object.values(s.linkedExile ?? {}).flat().map((l) => l.id)).toContain(sh);
    s.objects[j]!.controlledSinceTurn = -1;
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: j, defender: opp }] });
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: sh });
    const oppLife = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, sh, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(oppLife - 2);
    expect(zone(s, sh)).toBe("graveyard");
    // Gone to its owner's graveyard: it's no longer exiled with the Spelljacker, so nothing to cast next time (rulings).
    expect(s.players[opp]!.graveyard).toContain(sh);
  });

  it("a bot casts the exiled card when it attacks; with no card exiled the trigger does nothing", () => {
    let { s, ap, opp, j, sh } = jacked();
    s.objects[j]!.controlledSinceTurn = -1;
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: j, defender: opp }] });
    s = settleBots(s);
    expect(zone(s, sh)).toBe("graveyard");
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const j1 = putOnBattlefield(s1, ap1, jacker());
    let s2 = passUntil(s1, "declareAttackers", ap1);
    s2 = act(s2, { type: "declareAttackers", player: ap1, attacks: [{ attacker: j1, defender: opp1 }] });
    expect(s2.triggerQueue.length + s2.stack.length).toBe(0); // the intervening "if" (CR 603.4)
    expect(s2.pending?.kind).not.toBe("castFree");
  });
});
