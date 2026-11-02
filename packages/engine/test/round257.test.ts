// Round 257: the top of the popularity list. Talent of the Telepath (cast an instant or sorcery from among the top seven
// cards of an opponent's library; spell mastery: up to two).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { altCostsFor, applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, runStateBasedActions, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

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
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
/** Permanents with this name; a token's name is its subtypes and "Token" ("Fish Token"). */
const named = (s: GameState, name: string) => s.battlefield.filter((id) => [name, `${name} Token`].includes(characteristics(s, s.objects[id]!).name));
const offered = (s: GameState) => (s.pending?.kind === "chooseOption" && s.pending.what === "castFromAmong" ? s.pending.options : []);
const nextOpp = (s: GameState, ap: PlayerId, n: number) => s.turnOrder[(s.turnOrder.indexOf(ap) + n) % s.turnOrder.length]!;

// Real oracle text (Scryfall).
const talent = (): CardDef => ({"oracleId":"a3a26df4-a9d5-48f5-942f-76862bdcd146","name":"Talent of the Telepath","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target opponent reveals the top seven cards of their library. You may cast an instant or sorcery spell from among them without paying its mana cost. Then that player puts the rest into their graveyard.\nSpell mastery — If there are two or more instant and/or sorcery cards in your graveyard, you may cast up to two instant and/or sorcery spells from among the revealed cards instead of one.","colors":["U"],"colorIdentity":["U"],"keywords":["Spell mastery"],"imageUrl":"https://cards.scryfall.io/normal/front/c/5/c5da13a1-8be2-4312-a660-f3e102c552b6.jpg?1783938346","artUrl":"https://cards.scryfall.io/art_crop/front/c/5/c5da13a1-8be2-4312-a660-f3e102c552b6.jpg?1783938346","commanderLegal":"legal","set":"ori","releasedAt":"2015-07-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const scramble = (): CardDef => ({"oracleId":"35fe3c61-8eaa-465d-ac34-63efda72fef2","name":"Scrambleverse","manaCost":"{6}{R}{R}","cmc":8,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"For each nonland permanent, choose a player at random. Then each player gains control of each permanent for which they were chosen. Untap those permanents.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/b/2b61fa9d-3f69-4632-be0e-09924ca88501.jpg?1783941065","artUrl":"https://cards.scryfall.io/art_crop/front/2/b/2b61fa9d-3f69-4632-be0e-09924ca88501.jpg?1783941065","commanderLegal":"legal","set":"m12","releasedAt":"2011-07-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const rip = (): CardDef => ({"oracleId":"c027f369-e445-46a8-94ad-93396321295a","name":"Rip, Spawn Hunter","manaCost":"{2}{G}{W}","cmc":4,"typeLine":"Legendary Creature — Human Survivor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Survivor"],"oracleText":"Survival — At the beginning of your second main phase, if Rip is tapped, reveal the top X cards of your library, where X is its power. Put any number of creature and/or Vehicle cards with different powers from among them into your hand. Put the rest on the bottom of your library in a random order.","power":"4","toughness":"4","colors":["G","W"],"colorIdentity":["G","W"],"keywords":["Survival"],"imageUrl":"https://cards.scryfall.io/normal/front/5/f/5f12e3b3-a260-4913-b13a-7fbb753dd702.jpg?1783909438","artUrl":"https://cards.scryfall.io/art_crop/front/5/f/5f12e3b3-a260-4913-b13a-7fbb753dd702.jpg?1783909438","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const wheel = (): CardDef => ({"oracleId":"95a7db5d-26f6-4192-9dc7-4342f7e0e9c5","name":"Wheel of Potential","manaCost":"{2}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"You get {E}{E}{E} (three energy counters), then you may pay any amount of {E}.\nEach player may exile their hand and draw a number of cards equal to the amount of {E} paid this way. If seven or more {E} was paid this way, you may play cards you own exiled this way until the end of your next turn.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/4/c4eb9a82-91f7-4741-a029-a07a3ff6af78.jpg?1783911264","artUrl":"https://cards.scryfall.io/art_crop/front/c/4/c4eb9a82-91f7-4741-a029-a07a3ff6af78.jpg?1783911264","commanderLegal":"legal","set":"mh3","releasedAt":"2024-06-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const devils = (): CardDef => ({"oracleId":"b446b485-c10b-4175-bb49-16ac2f9e7718","name":"Wildfire Devils","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Devil","supertypes":[],"types":["Creature"],"subtypes":["Devil"],"oracleText":"When this creature enters and at the beginning of your upkeep, choose a player at random. That player exiles an instant or sorcery card from their graveyard. Copy that card. You may cast the copy without paying its mana cost.","power":"4","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/9/09eb879c-5caf-4d6d-b340-5b99ffeefc3a.jpg?1783932804","artUrl":"https://cards.scryfall.io/art_crop/front/0/9/09eb879c-5caf-4d6d-b340-5b99ffeefc3a.jpg?1783932804","commanderLegal":"legal","set":"c19","releasedAt":"2019-08-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const creativity = (): CardDef => ({"oracleId":"e2161ae2-e5d2-4a56-85d4-d2214c5b3e2e","name":"Indomitable Creativity","manaCost":"{X}{R}{R}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Destroy X target artifacts and/or creatures. For each permanent destroyed this way, its controller reveals cards from the top of their library until an artifact or creature card is revealed and exiles that card. Those players put the exiled cards onto the battlefield, then shuffle.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/d/edd00e45-2ae1-4cd0-92a1-155c95f8dc72.jpg?1783936753","artUrl":"https://cards.scryfall.io/art_crop/front/e/d/edd00e45-2ae1-4cd0-92a1-155c95f8dc72.jpg?1783936753","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const passage = (): CardDef => ({"oracleId":"f4b30f6c-09ac-407e-9c72-da64d212ce93","name":"Guided Passage","manaCost":"{G}{U}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Reveal the cards in your library. An opponent chooses from among them a creature card, a land card, and a noncreature, nonland card. You put the chosen cards into your hand. Then shuffle.","colors":["G","R","U"],"colorIdentity":["G","R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/b/0b2e8e58-aee1-4882-943a-17a6af2f8410.jpg?1783945335","artUrl":"https://cards.scryfall.io/art_crop/front/0/b/0b2e8e58-aee1-4882-943a-17a6af2f8410.jpg?1783945335","commanderLegal":"legal","set":"apc","releasedAt":"2001-06-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const predicaments = (): CardDef => ({"oracleId":"503447d9-2489-46d7-b5aa-a14bbb22dcc8","name":"Master of Predicaments","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Creature — Sphinx","supertypes":[],"types":["Creature"],"subtypes":["Sphinx"],"oracleText":"Flying\nWhenever this creature deals combat damage to a player, choose a card in your hand. That player guesses whether the card's mana value is greater than 4. If the player guessed wrong, you may cast the card without paying its mana cost.","power":"4","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/f/0/f0b1720b-ab7a-4b52-a6d0-11c4fc573d17.jpg?1783939190","artUrl":"https://cards.scryfall.io/art_crop/front/f/0/f0b1720b-ab7a-4b52-a6d0-11c4fc573d17.jpg?1783939190","commanderLegal":"legal","set":"m15","releasedAt":"2014-07-18","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const redBolt = card("Test Bolt", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Test Bolt deals 3 damage to any target." });
const blueStudy = card("Test Study", "Sorcery", "{1}{U}", { cmc: 2, colors: ["U"], oracleText: "Draw two cards." });
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { cmc: 3, colors: ["R"], power: "3", toughness: "3" });
const cart = card("Test Cart", "Artifact — Vehicle", "{2}", { cmc: 2, subtypes: ["Vehicle"], power: "3", toughness: "2", oracleText: "Crew 1" });
const cycle = card("Test Cycle", "Artifact — Vehicle", "{1}", { cmc: 1, subtypes: ["Vehicle"], power: "1", toughness: "1", oracleText: "Crew 1" });
const forestCard = card("Forest", "Basic Land — Forest", "", { supertypes: ["Basic"], subtypes: ["Forest"] });
const greenGrow = card("Test Growth", "Instant", "{G}", { cmc: 1, colors: ["G"], oracleText: "Target creature gets +3/+3 until end of turn." });

/** Attack `defender` with `attackers` and play combat out, stopping at a question for `ap` (a "you may"). */
const fight = (s: GameState, ap: PlayerId, attackers: ObjectId[], defender: PlayerId, blocks: { blocker: ObjectId; attacker: ObjectId }[] = []) => {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender })) });
  for (let i = 0; i < 300 && !(s.step === "endCombat" && !s.stack.length && !s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: p.player === defender ? blocks : [] });
    else if (p?.player === ap) return s;
    else if (p) s = botActions(s, p.player).reduce((x, a) => act(x, a), s);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

describe("round 257", () => {
  it("every card of the round compiles fully", () => {
    supported(talent(), scramble(), rip(), wheel(), devils(), creativity(), passage(), predicaments());
  });
});

describe("Talent of the Telepath", () => {
  const telepath = (yardSpells: number) => {
    const { s, ap, opp, ids } = setup([talent()]);
    const lib = [blueStudy, bear(), redBolt, bear(), greenGrow, bear(), bear(), redBolt].reverse().map((d) => into(s, opp, d, "library")).reverse();
    for (let i = 0; i < yardSpells; i++) into(s, ap, blueStudy, "graveyard");
    putOnBattlefield(s, ap, bear());
    return { s, ap, opp, ids, lib };
  };
  it("you cast one instant or sorcery from among the top seven of the opponent's library; the rest go to that player's graveyard", () => {
    const { s: s0, ap, opp, ids, lib } = telepath(1);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    // The top seven: Study, Bears, Bolt, Bears, Growth, Bears, Bears (the eighth card, a Bolt, isn't revealed).
    expect(offered(s)).toEqual([lib[0], lib[2], lib[4], "none"]);
    s = act(s, { type: "chooseOption", player: ap, choice: lib[0]! });
    expect(s.pending?.kind).toBe("castFree");
    s = act(s, { type: "castSpell", player: ap, objectId: lib[0]! } as Action);
    // One only: no second offer.
    s = settle(s);
    expect(s.pending).toBeNull();
    expect(zone(s, lib[0]!)).toBe("graveyard");
    expect(s.objects[lib[0]!]!.owner).toBe(opp);
    expect(s.players[opp]!.graveyard).toEqual(expect.arrayContaining(lib.slice(1, 7)));
    expect(s.players[opp]!.library[0]).toBe(lib[7]);
    // Study drew two (Talent itself left the hand).
    expect(s.players[ap]!.hand.length).toBe(s0.players[ap]!.hand.length + 1);
  });
  it("spell mastery: with two instants and/or sorceries in your graveyard, up to two", () => {
    const { s: s0, ap, opp, ids, lib } = telepath(2);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    s = act(s, { type: "chooseOption", player: ap, choice: lib[0]! });
    s = act(s, { type: "castSpell", player: ap, objectId: lib[0]! } as Action);
    expect(offered(s)).toEqual([lib[2], lib[4], "none"]);
    s = act(s, { type: "chooseOption", player: ap, choice: "none" });
    expect(s.pending).toBeNull();
    expect(zone(s, lib[0]!)).toBe("stack");
    expect(zone(s, lib[2]!)).toBe("graveyard");
  });
});

describe("Scrambleverse", () => {
  it("each nonland permanent goes to a player chosen at random (its controller too), lands stay, and all of them untap", () => {
    const { s: s0, ap, opp, ids } = setup([scramble()]);
    s0.players[ap]!.manaPool.R = 8;
    const mine = Array.from({ length: 12 }, () => putOnBattlefield(s0, ap, bear()));
    const theirs = Array.from({ length: 12 }, () => putOnBattlefield(s0, opp, bear()));
    for (const id of [...mine, ...theirs]) s0.objects[id]!.tapped = true;
    const lands = s0.battlefield.filter((id) => characteristics(s0, s0.objects[id]!).types.includes("Land"));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const owners = new Map<PlayerId, number>();
    for (const id of [...mine, ...theirs]) {
      const c = controllerOf(s, s.objects[id]!);
      owners.set(c, (owners.get(c) ?? 0) + 1);
      expect(s.objects[id]!.tapped).toBe(false);
    }
    // 24 creatures spread over the four players at random: every player gets some, and some stay where they were.
    expect([...owners.keys()].sort()).toEqual([...s.turnOrder].sort());
    expect(mine.some((id) => controllerOf(s, s.objects[id]!) === ap)).toBe(true);
    expect(mine.some((id) => controllerOf(s, s.objects[id]!) !== ap)).toBe(true);
    expect(lands.every((id) => controllerOf(s, s.objects[id]!) === ap)).toBe(true);
    // Indefinitely: still theirs on a later turn.
    const moved = mine.find((id) => controllerOf(s, s.objects[id]!) !== ap)!;
    const later = passUntil(s, "main1", opp);
    expect(controllerOf(later, later.objects[moved]!)).not.toBe(ap);
  });
});

describe("Rip, Spawn Hunter", () => {
  const hunter = (tapped: boolean) => {
    const { s, ap } = setup([]);
    const r = putOnBattlefield(s, ap, rip());
    s.objects[r]!.tapped = tapped;
    // Top four (its power): Bears (2), Ogre (3), Cart (Vehicle, 3), Bears (2); then a Cycle (1), not revealed.
    const lib = [bear(), ogre, cart, bear(), cycle].reverse().map((d) => into(s, ap, d, "library")).reverse();
    return { s, ap, r, lib };
  };
  it("survival: tapped at your second main phase, reveal the top X (its power) and take creature and/or Vehicle cards with different powers", () => {
    const { s: s0, ap, lib } = hunter(true);
    let s = passUntil(s0, "main2", ap);
    s = settle(s);
    const p = s.pending;
    expect(p?.kind).toBe("searchLibrary");
    if (p?.kind !== "searchLibrary") return;
    expect([...p.cards].sort()).toEqual(lib.slice(0, 4).sort());
    expect([p.max, p.distinctPowers]).toEqual([2, true]);
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [lib[0]!, lib[3]!] })).toThrow(/different powers/);
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [lib[1]!, lib[2]!] })).toThrow(/different powers/);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [lib[0]!, lib[2]!] }));
    expect([zone(s, lib[0]!), zone(s, lib[2]!)]).toEqual(["hand", "hand"]);
    // The rest on the bottom; the Cycle is now on top.
    expect(s.players[ap]!.library[0]).toBe(lib[4]);
    expect(s.players[ap]!.library.slice(-2).sort()).toEqual([lib[1]!, lib[3]!].sort());
  });
  it("doesn't trigger when it's untapped; a bot takes one of each power", () => {
    const { s: s0, ap, lib } = hunter(false);
    let s = settle(passUntil(s0, "main2", ap));
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.library[0]).toBe(lib[0]);
    const { s: s1 } = hunter(true);
    s = settle(passUntil(s1, "main2", ap));
    const p = s.pending!;
    s = botActions(s, p.player).reduce((x, a) => act(x, a), s);
    const powers = s.players[ap]!.hand.filter((id) => lib.includes(id)).map((id) => characteristics(s, s.objects[id]!).power);
    expect(powers.sort()).toEqual([2, 3]);
  });
});

describe("Wheel of Potential", () => {
  const wheelOf = (energy: number) => {
    const { s, ap, opp, ids } = setup([wheel()]);
    s.players[ap]!.energy = energy;
    const mine = [into(s, ap, redBolt, "hand"), into(s, ap, ogre, "hand")];
    return { s, ap, opp, ids, mine };
  };
  /** Cast it, pay `pay` energy, and answer each player's "exile your hand?" with `yes`. */
  const go = (w: ReturnType<typeof wheelOf>, pay: number, yes: (p: PlayerId) => boolean) => {
    let s = settle(run(w.s, planCast(w.s, w.ap, w.ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payEnergy", numberRange: { min: 0, max: (w.s.players[w.ap]!.energy ?? 0) + 3 } });
    s = act(s, { type: "chooseOption", player: w.ap, choice: String(pay) });
    const asked: PlayerId[] = [];
    while (s.pending?.kind === "chooseMay") {
      asked.push(s.pending.player);
      s = act(s, { type: "chooseMay", player: s.pending.player, yes: yes(s.pending.player) });
    }
    return { s: settle(s), asked };
  };
  it("you get three energy and pay any amount; each player in turn order may exile their hand and draw that many", () => {
    const w = wheelOf(1);
    const before = w.s.players[w.opp]!.hand.length;
    const { s, asked } = go(w, 4, (p) => p === w.ap || p === w.opp);
    // Starting with the active player (CR 101.4).
    expect(asked).toEqual([0, 1, 2, 3].map((i) => nextOpp(w.s, w.ap, i)));
    expect(s.players[w.ap]!.energy).toBe(0);
    expect(s.players[w.ap]!.hand.length).toBe(4);
    expect(s.players[w.opp]!.hand.length).toBe(4);
    expect(before).not.toBe(4);
    // Fewer than seven: no permission to play the exiled cards.
    expect(w.mine.map((id) => [zone(s, id), s.objects[id]!.mayPlay])).toEqual([["exile", undefined], ["exile", undefined]]);
    const third = nextOpp(s, w.ap, 2);
    expect(s.players[third]!.hand.length).toBe(w.s.players[third]!.hand.length);
  });
  it("seven or more paid: you may play the cards you exiled until the end of your next turn (not the other players' cards)", () => {
    const w = wheelOf(5);
    const { s } = go(w, 8, () => true);
    expect(s.players[w.ap]!.hand.length).toBe(8);
    for (const id of w.mine) expect(s.objects[id]!.mayPlay).toMatchObject({ player: w.ap, until: "nextTurn" });
    const theirs = s.players[w.opp]!.exile;
    expect(theirs.length).toBeGreaterThan(0);
    for (const id of theirs) expect(s.objects[id]!.mayPlay).toBeUndefined();
    // Cast the Bolt from exile now.
    const plan = planCast(s, w.ap, w.mine[0]!, [{ kind: "player", id: w.opp }]);
    expect(plan).not.toBeNull();
  });
  it("paying 0 is paying: players may still exile their hands, drawing nothing", () => {
    const w = wheelOf(0);
    const { s, asked } = go(w, 0, (p) => p === w.ap);
    expect(asked.length).toBe(4);
    expect(s.players[w.ap]!.hand.length).toBe(0);
    expect(s.players[w.ap]!.energy).toBe(3);
  });
});

describe("Wildfire Devils", () => {
  /** Cast it; bolts in the graveyards of `withBolts`. Returns the state at the first question after it enters. */
  const devil = (seed: number, withBolts: (p: PlayerId, i: number) => boolean) => {
    const { s: s0, ap, opp, ids } = setup([devils()], seed);
    const bolts = new Map<PlayerId, ObjectId>();
    s0.turnOrder.forEach((p, i) => {
      if (withBolts(p, i)) bolts.set(p, into(s0, p, redBolt, "graveyard"));
    });
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    return { s, ap, opp, bolts };
  };
  it("when it enters, a player chosen at random exiles an instant or sorcery card from their graveyard; you may cast a copy for free", () => {
    let chosen: PlayerId | undefined;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { s: s1, ap, opp, bolts } = devil(seed, () => true);
      // One card: no choice to make; then you're offered the copy.
      expect(offered(s1).length).toBe(2);
      let s = act(s1, { type: "chooseOption", player: ap, choice: offered(s1)[0]! });
      expect(s.pending?.kind).toBe("castFree");
      if (s.pending?.kind !== "castFree") return;
      const copy = s.pending.objectId;
      expect(s.objects[copy]!.spellCopy).toBe(true);
      const from = [...bolts].find(([, id]) => zone(s, id) === "exile")!;
      expect(from).toBeDefined();
      chosen ??= from[0];
      s = settle(run(s, planCast(s, ap, copy, [{ kind: "player", id: opp }])));
      expect(s.players[opp]!.life).toBe(37);
      // The card itself stays exiled; the copy is gone.
      expect(zone(s, from[1])).toBe("exile");
      expect(s.objects[copy]?.zone ?? "gone").not.toBe("graveyard");
      if (from[0] !== chosen) return;
    }
  });
  it("the chosen player chooses which card: a bot opponent exiles the one least useful to you", () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const { s: s0, ap, opp, ids } = setup([devils()], seed);
      const cards = new Map<PlayerId, ObjectId[]>();
      for (const p of s0.turnOrder) cards.set(p, [into(s0, p, redBolt, "graveyard"), into(s0, p, blueStudy, "graveyard")]);
      let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
      const p = s.pending;
      if (p?.kind !== "searchLibrary" || p.player === ap) continue;
      expect(p).toMatchObject({ fromGraveyard: "exile", copiedBy: ap, min: 1, max: 1 });
      expect([...p.cards].sort()).toEqual([...cards.get(p.player)!].sort());
      s = botActions(s, p.player).reduce((x, a) => act(x, a), s);
      expect(offered(s).length).toBe(2);
      expect(cards.get(p.player)!.filter((id) => zone(s, id) === "exile").length).toBe(1);
      void opp;
      return;
    }
    throw new Error("no seed chose an opponent");
  });
  it("the chosen player has none: nothing happens, no other player is chosen (rulings); it triggers at your upkeep too", () => {
    const { s: s1, ap } = devil(3, () => false);
    expect(s1.pending).toBeNull();
    const log = s1.log.slice(-6).map((x) => x.text).join(" ");
    expect(log).toMatch(/is chosen at random/);
    expect(log).toMatch(/has no instant or sorcery card in their graveyard/);
    // Next upkeep: it triggers again.
    into(s1, ap, redBolt, "graveyard");
    let s = passUntil(s1, "upkeep", ap);
    s = settle(s);
    expect(s.log.slice(-8).map((x) => x.text).join(" ")).toMatch(/is chosen at random for Wildfire Devils/);
  });
});

describe("Indomitable Creativity", () => {
  it("each destroyed permanent's controller reveals until an artifact or creature card, exiles it; all enter at once, then they shuffle", () => {
    const { s: s0, ap, opp, ids } = setup([creativity()]);
    const third = nextOpp(s0, ap, 2);
    s0.players[ap]!.manaPool.R = 3;
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = [putOnBattlefield(s0, opp, bear()), putOnBattlefield(s0, opp, cart)];
    const tough = putOnBattlefield(s0, third, bear({ name: "Test Stalwart", keywords: ["Indestructible"], oracleText: "Indestructible" }));
    invalidateCharacteristics(s0);
    // Your library: Forest, Ogre. Theirs: Forest, Cart, Forest, Bears. The third player's: Ogre (never revealed).
    const myLib = [forestCard, ogre].reverse().map((d) => into(s0, ap, d, "library")).reverse();
    const oppLib = [forestCard, cart, forestCard, bear()].reverse().map((d) => into(s0, opp, d, "library")).reverse();
    const thirdTop = into(s0, third, ogre, "library");
    s0.players[ap]!.manaPool.C = 4;
    const plan = planCast(s0, ap, ids[0]!, [tgt(mine), tgt(theirs[0]!), tgt(theirs[1]!), tgt(tough)], undefined, undefined, 4);
    let s = settle(run(s0, plan));
    expect(s.pending).toBeNull();
    expect(zone(s, mine)).toBe("graveyard");
    expect(theirs.map((id) => zone(s, id))).toEqual(["graveyard", "graveyard"]);
    expect(zone(s, tough)).toBe("battlefield");
    // Yours: the Ogre. Theirs (two destroyed): the Cart, then the Bears (the Forests revealed again stay in the library).
    expect([zone(s, myLib[1]!), controllerOf(s, s.objects[myLib[1]!]!)]).toEqual(["battlefield", ap]);
    expect([oppLib[1], oppLib[3]].map((id) => [zone(s, id!), controllerOf(s, s.objects[id!]!)])).toEqual([["battlefield", opp], ["battlefield", opp]]);
    expect([zone(s, myLib[0]!), zone(s, oppLib[0]!), zone(s, oppLib[2]!)]).toEqual(["library", "library", "library"]);
    // The indestructible one wasn't destroyed: its controller reveals nothing.
    expect(s.players[third]!.library[0]).toBe(thirdTop);
    const shuffled = s.log.filter((x) => / shuffles their library\.$/.test(x.text)).slice(-2).map((x) => x.text.replace(/ shuffles.*/, ""));
    expect(shuffled.sort()).toEqual([s.players[ap]!.name, s.players[opp]!.name].sort());
  });
});

describe("Guided Passage", () => {
  it("an opponent you choose picks a creature card, a land card and a noncreature, nonland card from your library for your hand", () => {
    const { s: s0, ap, opp, ids } = setup([passage()]);
    s0.players[ap]!.manaPool.R = 1;
    const study = into(s0, ap, blueStudy, "library");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    // You choose the opponent.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "opponent" });
    s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    const p = s.pending;
    expect(p).toMatchObject({ kind: "searchLibrary", player: opp, forPlayer: ap, min: 3, max: 3 });
    if (p?.kind !== "searchLibrary") return;
    // Only one noncreature, nonland card: the Study.
    expect(p.cards).toContain(study);
    const lib = s.players[ap]!.library;
    const aBear = lib.find((id) => characteristics(s, s.objects[id]!).types.includes("Creature"))!;
    const aLand = lib.find((id) => characteristics(s, s.objects[id]!).types.includes("Land"))!;
    const otherBear = lib.find((id) => id !== aBear && characteristics(s, s.objects[id]!).types.includes("Creature"))!;
    expect(() => act(s, { type: "searchLibrary", player: opp, found: [aBear, otherBear, aLand] })).toThrow(/one card for each/);
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "searchLibrary", player: opp, found: [aBear, aLand, study] }));
    expect([zone(s, aBear), zone(s, aLand), zone(s, study)]).toEqual(["hand", "hand", "hand"]);
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
  });
  it("a kind you have none of is skipped (rulings); a bot opponent picks one of each kind you do have", () => {
    const { s: s0, ap, opp, ids } = setup([passage()]);
    s0.players[ap]!.manaPool.R = 1;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    const p = s.pending;
    expect(p).toMatchObject({ kind: "searchLibrary", player: opp, min: 2, max: 2 });
    const hand = s.players[ap]!.hand.length;
    s = settle(botActions(s, opp).reduce((x, a) => act(x, a), s));
    const got = s.players[ap]!.hand.slice(hand).map((id) => characteristics(s, s.objects[id]!).types[0]);
    expect(got.sort()).toEqual(["Creature", "Land"]);
  });
});

describe("Master of Predicaments", () => {
  const sphinx = () => {
    const { s, ap, opp } = setup([]);
    const m = putOnBattlefield(s, ap, predicaments());
    s.players[ap]!.hand = [];
    const big = into(s, ap, card("Test Colossus", "Creature — Giant", "{5}{G}", { cmc: 6, colors: ["G"], power: "7", toughness: "7" }), "hand");
    const small = into(s, ap, ogre, "hand");
    return { s, ap, opp, m, big, small };
  };
  it("deals combat damage: you choose a card in hand, that player guesses; wrong, you may cast it for free", () => {
    const { s: s0, ap, opp, m, big } = sphinx();
    let s = fight(s0, ap, [m], opp);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "predicamentCard", player: ap });
    s = act(s, { type: "chooseOption", player: ap, choice: big });
    // The guess: by the damaged player, without seeing the card.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "predicamentGuess", player: opp, options: ["over", "notOver"] });
    expect(s.log.slice(-3).map((x) => x.text).join(" ")).not.toMatch(/Colossus/);
    s = act(s, { type: "chooseOption", player: opp, choice: "notOver" });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: big });
    s = settle(run(s, planCast(s, ap, big)));
    expect(zone(s, big)).toBe("battlefield");
  });
  it("a right guess: nothing; a bot guesses 4 or less and, choosing, picks its costliest spell", () => {
    const { s: s0, ap, opp, m, small } = sphinx();
    let s = fight(s0, ap, [m], opp);
    s = act(s, { type: "chooseOption", player: ap, choice: small });
    s = settle(act(s, { type: "chooseOption", player: opp, choice: "notOver" }));
    expect(s.pending).toBeNull();
    expect(zone(s, small)).toBe("hand");
    const { s: s1, ap: ap1, m: m1, big } = sphinx();
    let t = fight(s1, ap1, [m1], opp);
    expect(botActions(t, ap1)).toEqual([{ type: "chooseOption", player: ap1, choice: big }]);
    t = act(t, { type: "chooseOption", player: ap1, choice: big });
    expect(botActions(t, opp)).toEqual([{ type: "chooseOption", player: opp, choice: "notOver" }]);
  });
});
