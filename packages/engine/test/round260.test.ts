// Round 260: the top of the popularity list. Genesis Storm (reveal until a nonland permanent card, which may go onto the
// battlefield or to the bottom with the rest), Part in Friendship (reveal until a creature card: onto the battlefield or
// into your hand by its mana value), Fireflux Squad (exile another attacker, then reveal until a creature card that
// enters attacking), Thunderous Debut (two creature cards from the top twenty, onto the battlefield if bargained), Storm
// of Memories (an instant or sorcery card at random from your graveyard, cast free and exiled), Capricious Hellraiser
// (three cards at random from your graveyard, a copy of one cast free), Spectral Arcanist (a spell from any graveyard with
// mana value up to your Spirits), End-Blaze Epiphany (when the creature dies, cards equal to its power exiled, one
// playable) and Smelting Vat (noncreature artifact cards with total mana value up to the sacrificed artifact's).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, runStateBasedActions, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

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
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
/** The opponents in turn order, starting with the next player (APNAP order on your turn). */
const opps = (s: GameState, ap: PlayerId) => [1, 2, 3].map((k) => s.turnOrder[(s.turnOrder.indexOf(ap) + k) % s.turnOrder.length]!);
/** Picks `id` if a "cast which of them?" question comes first; then the free cast is offered. */
const pickCast = (s: GameState, pid: PlayerId, id: ObjectId) => (s.pending?.kind === "chooseOption" && s.pending.what === "castFromAmong" ? act(s, { type: "chooseOption", player: pid, choice: id }) : s);

// Real oracle text (Scryfall).
const genesis = (): CardDef => ({"oracleId":"80e72437-0c17-44c0-b0a7-eab075a64569","name":"Genesis Storm","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"When you cast this spell, copy it for each time you've cast your commander from the command zone this game.\nReveal cards from the top of your library until you reveal a nonland permanent card. You may put that card onto the battlefield. Then put all cards revealed this way that weren't put onto the battlefield on the bottom of your library in a random order.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/6/066578ed-ffaf-473d-87b8-e614035748b6.jpg?1783934335","artUrl":"https://cards.scryfall.io/art_crop/front/0/6/066578ed-ffaf-473d-87b8-e614035748b6.jpg?1783934335","commanderLegal":"legal","set":"c18","releasedAt":"2018-08-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const friendship = (): CardDef => ({"oracleId":"e1a9c467-2d64-4e11-adf3-7333c923b187","name":"Part in Friendship","manaCost":"{4}{G}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a nontoken creature you control dies, reveal cards from the top of your library until you reveal a creature card. If its mana value is less than or equal to the number of lands you control, put it onto the battlefield. Otherwise, put it into your hand. Put the rest on the bottom of your library in a random order. This ability triggers only once each turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/4/b4ff1eac-6d97-40ab-9b7c-c2fdca0917d9.jpg?1784632164","artUrl":"https://cards.scryfall.io/art_crop/front/b/4/b4ff1eac-6d97-40ab-9b7c-c2fdca0917d9.jpg?1784632164","commanderLegal":"legal","set":"hob","releasedAt":"2026-08-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const squad = (): CardDef => ({"oracleId":"d53fecd7-aa12-482e-8f45-5efe6348070d","name":"Fireflux Squad","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Human Soldier","supertypes":[],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"Haste\nWhenever this creature attacks, you may exile another target attacking creature you control. If you do, reveal cards from the top of your library until you reveal a creature card. Put that card onto the battlefield tapped and attacking and the rest on the bottom of your library in a random order.","power":"4","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":["Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/4/b/4bcff20b-06f7-4228-a99c-6ff46e73e353.jpg?1783931214","artUrl":"https://cards.scryfall.io/art_crop/front/4/b/4bcff20b-06f7-4228-a99c-6ff46e73e353.jpg?1783931214","commanderLegal":"legal","set":"c20","releasedAt":"2020-04-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const debut = (): CardDef => ({"oracleId":"07995092-af6c-43b8-b30b-17e020ead37c","name":"Thunderous Debut","manaCost":"{6}{G}{G}","cmc":8,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Bargain (You may sacrifice an artifact, enchantment, or token as you cast this spell.)\nLook at the top twenty cards of your library. You may reveal up to two creature cards from among them. If this spell was bargained, put the revealed cards onto the battlefield. Otherwise, put the revealed cards into your hand. Then shuffle.","colors":["G"],"colorIdentity":["G"],"keywords":["Bargain"],"imageUrl":"https://cards.scryfall.io/normal/front/d/9/d98f51ec-8eae-434a-ab62-85bdb6586fa2.jpg?1783915075","artUrl":"https://cards.scryfall.io/art_crop/front/d/9/d98f51ec-8eae-434a-ab62-85bdb6586fa2.jpg?1783915075","commanderLegal":"legal","set":"woe","releasedAt":"2023-09-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const memories = (): CardDef => ({"oracleId":"6f8ca795-d6fd-4e3e-911c-c621a942acbb","name":"Storm of Memories","manaCost":"{2}{R}{R}{R}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Storm (When you cast this spell, copy it for each spell cast before it this turn.)\nExile an instant or sorcery card with mana value 3 or less from your graveyard at random. You may cast it without paying its mana cost. If that spell would be put into a graveyard, exile it instead.","colors":["R"],"colorIdentity":["R"],"keywords":["Storm"],"imageUrl":"https://cards.scryfall.io/normal/front/2/5/253266de-0eeb-46c7-9912-145586661fc4.jpg?1783904817","artUrl":"https://cards.scryfall.io/art_crop/front/2/5/253266de-0eeb-46c7-9912-145586661fc4.jpg?1783904817","commanderLegal":"legal","set":"tle","releasedAt":"2025-11-21","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const hellraiser = (): CardDef => ({"oracleId":"eb7b024c-da9b-4544-8648-0ac0395cf7fc","name":"Capricious Hellraiser","manaCost":"{3}{R}{R}{R}","cmc":6,"typeLine":"Creature — Phyrexian Dragon","supertypes":[],"types":["Creature"],"subtypes":["Phyrexian","Dragon"],"oracleText":"This spell costs {3} less to cast if you have nine or more cards in your graveyard.\nFlying\nWhen this creature enters, exile three cards at random from your graveyard. Choose a noncreature, nonland card from among them and copy it. You may cast the copy without paying its mana cost.","power":"4","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/2/3/23afca1a-62a8-497f-994f-ceb479d020ba.jpg?1783918033","artUrl":"https://cards.scryfall.io/art_crop/front/2/3/23afca1a-62a8-497f-994f-ceb479d020ba.jpg?1783918033","commanderLegal":"legal","set":"one","releasedAt":"2023-02-10","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const arcanist = (): CardDef => ({"oracleId":"aba60536-ffbd-480c-8e8f-9639bdc53d4b","name":"Spectral Arcanist","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Spirit Wizard","supertypes":[],"types":["Creature"],"subtypes":["Spirit","Wizard"],"oracleText":"Flying\nWhen this creature enters, you may cast an instant or sorcery spell with mana value less than or equal to the number of Spirits you control from a graveyard without paying its mana cost. If that spell would be put into a graveyard, exile it instead.","power":"3","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/8/a/8ac3ee2e-455e-4cf9-b1ec-6d260098574a.jpg?1783924987","artUrl":"https://cards.scryfall.io/art_crop/front/8/a/8ac3ee2e-455e-4cf9-b1ec-6d260098574a.jpg?1783924987","commanderLegal":"legal","set":"voc","releasedAt":"2021-11-19","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const epiphany = (): CardDef => ({"oracleId":"00cfbea0-e862-468b-90d5-7478eb9847c0","name":"End-Blaze Epiphany","manaCost":"{X}{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"End-Blaze Epiphany deals X damage to target creature. When that creature dies this turn, exile a number of cards from the top of your library equal to its power, then choose a card exiled this way. Until the end of your next turn, you may play that card.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/f/0f0a90ae-b3b3-4f52-8997-eac514b29e57.jpg?1783904455","artUrl":"https://cards.scryfall.io/art_crop/front/0/f/0f0a90ae-b3b3-4f52-8997-eac514b29e57.jpg?1783904455","commanderLegal":"legal","set":"ecl","releasedAt":"2026-01-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const vat = (): CardDef => ({"oracleId":"71d2a0fe-5426-4fa3-85a4-564c37184996","name":"Smelting Vat","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{1}, {T}, Sacrifice another artifact: Reveal the top eight cards of your library. Put up to two noncreature artifact cards with total mana value less than or equal to the sacrificed artifact's mana value from among them onto the battlefield and the rest on the bottom of your library in a random order.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/5/e5b82177-3795-470a-abff-a4a936b27430.jpg?1783919717","artUrl":"https://cards.scryfall.io/art_crop/front/e/5/e5b82177-3795-470a-abff-a4a936b27430.jpg?1783919717","commanderLegal":"legal","set":"brc","releasedAt":"2022-11-18","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const golem = card("Test Golem", "Artifact Creature — Golem", "{3}", { cmc: 3, power: "3", toughness: "3" });
const giant = card("Test Giant", "Creature — Giant", "{20}", { cmc: 20, power: "5", toughness: "5" });
const xBeast = card("Test X Beast", "Creature — Beast", "{X}{G}", { cmc: 1, power: "1", toughness: "1" });
const wastes = card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." });
const aura = card("Test Aura", "Enchantment — Aura", "{G}", { cmc: 1, oracleText: "Enchant creature\nEnchanted creature gets +1/+1." });
const bolt = card("Test Bolt", "Instant", "{R}", { cmc: 1, oracleText: "Test Bolt deals 3 damage to any target." });
const blast = card("Test Blast", "Sorcery", "{1}{R}", { cmc: 2, oracleText: "Test Blast deals 2 damage to any target." });
const quake = card("Test Quake", "Sorcery", "{3}{R}", { cmc: 4, oracleText: "Test Quake deals 4 damage to any target." });
const relic = card("Test Relic", "Artifact", "{2}", { cmc: 2 });
const trinket = card("Test Trinket", "Artifact", "{1}", { cmc: 1 });
const bauble = card("Test Bauble", "Artifact", "{1}", { cmc: 1 });
const pot = card("Test Pot", "Artifact", "{2}", { cmc: 2 });
const engine = card("Test Engine", "Artifact", "{3}", { cmc: 3 });

describe("round 260", () => {
  it("every card of the round compiles fully", () => {
    supported(genesis(), friendship(), squad(), debut(), memories(), hellraiser(), arcanist(), epiphany(), vat());
  });
});

describe("Genesis Storm", () => {
  const board = (extra?: CardDef) => {
    const { s, ap, ids } = setup([genesis()]);
    // The top: two lands, then (an Aura and) an artifact creature.
    const g = into(s, ap, golem, "library");
    const a = extra ? into(s, ap, extra, "library") : undefined;
    const l2 = into(s, ap, wastes, "library");
    const l1 = into(s, ap, wastes, "library");
    s.players[ap]!.manaPool.G = 6;
    return { s, ap, ids, g, a, l1, l2 };
  };
  it("you may put the nonland permanent card onto the battlefield; the lands go to the bottom", () => {
    const { s: s0, ap, ids, g, l1, l2 } = board();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, card: g });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(zone(s, g)).toBe("battlefield");
    const lib = s.players[ap]!.library;
    expect(lib.slice(-2).sort()).toEqual([l1, l2].sort());
  });
  it("declined, it goes to the bottom with the other revealed cards (rulings)", () => {
    const { s: s0, ap, ids, g, l1, l2 } = board();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(zone(s, g)).toBe("library");
    const lib = s.players[ap]!.library;
    expect(lib.slice(-3).sort()).toEqual([g, l1, l2].sort());
    expect(lib.slice(0, 3)).not.toContain(g);
  });
  it("an Aura is a nonland permanent card: with nothing to enchant it can't enter, so it goes to the bottom too", () => {
    const { s: s0, ap, ids, a, g, l1, l2 } = board(aura);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseMay", card: a });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(zone(s, a!)).toBe("library");
    expect(s.players[ap]!.library.slice(-3).sort()).toEqual([a!, l1, l2].sort());
    // Only the first nonland permanent card is revealed: the golem below it stays where it was.
    expect(s.players[ap]!.library[0]).toBe(g);
  });
});

describe("Part in Friendship", () => {
  const board = () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, friendship());
    const b1 = putOnBattlefield(s, ap, bear());
    const b2 = putOnBattlefield(s, ap, bear());
    return { s, ap, b1, b2 };
  };
  const kill = (s: GameState, id: ObjectId) => {
    s.objects[id]!.counters["-1/-1"] = 5;
    invalidateCharacteristics(s);
    runStateBasedActions(s);
    return settle(s);
  };
  it("mana value up to the number of lands you control: onto the battlefield, the rest on the bottom; only once each turn", () => {
    const { s: s0, ap, b1, b2 } = board();
    const g = into(s0, ap, golem, "library");
    const l = into(s0, ap, wastes, "library");
    let s = kill(s0, b1);
    expect(zone(s, g)).toBe("battlefield");
    expect(s.players[ap]!.library.at(-1)).toBe(l);
    // A second death this turn doesn't trigger it again.
    const top = s.players[ap]!.library.slice(0, 3);
    s = kill(s, b2);
    expect(s.players[ap]!.library.slice(0, 3)).toEqual(top);
  });
  it("a greater mana value goes into your hand; {X} counts as 0 (rulings)", () => {
    const { s: s0, ap, b1 } = board();
    const big = into(s0, ap, giant, "library");
    let s = kill(s0, b1);
    expect(zone(s, big)).toBe("hand");
    // With one land, an {X}{G} creature card has mana value 1.
    const { s: s1, ap: ap1, b1: c1 } = board();
    for (const id of [...s1.battlefield]) if (characteristics(s1, s1.objects[id]!).types.includes("Land") && s1.battlefield.filter((x) => characteristics(s1, s1.objects[x]!).types.includes("Land")).length > 1) {
      s1.battlefield.splice(s1.battlefield.indexOf(id), 1);
      delete s1.objects[id];
    }
    invalidateCharacteristics(s1);
    const xb = into(s1, ap1, xBeast, "library");
    s = kill(s1, c1);
    expect(zone(s, xb)).toBe("battlefield");
  });
});

describe("Fireflux Squad", () => {
  const attack = (yes: boolean) => {
    const { s: s0, ap } = setup([]);
    const sq = putOnBattlefield(s0, ap, squad());
    const b = putOnBattlefield(s0, ap, bear());
    const g = into(s0, ap, golem, "library");
    const l = into(s0, ap, wastes, "library");
    let s = passUntil(s0, "declareAttackers", ap);
    const [o1, o2] = opps(s, ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: sq, defender: o1! }, { attacker: b, defender: o1! }] });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    // "Another" target attacking creature: not the Squad itself.
    expect(() => applyAction(s, { type: "chooseTargets", player: ap, targets: [tgt(sq)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] }));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes }));
    return { s, ap, sq, b, g, l, o2: o2! };
  };
  it("exile another attacker: the first creature card revealed enters tapped and attacking a player you choose", () => {
    let { s, ap, b, g, l, o2 } = attack(true);
    expect(zone(s, b)).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "attackWhom", player: ap });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(o2) }));
    expect(zone(s, g)).toBe("battlefield");
    expect(s.objects[g]!.tapped).toBe(true);
    expect(s.objects[g]!.attacking).toBe(o2);
    expect(s.players[ap]!.library.at(-1)).toBe(l);
  });
  it("declined: nothing is exiled and nothing is revealed", () => {
    const { s, ap, b, g, l } = attack(false);
    expect(zone(s, b)).toBe("battlefield");
    expect(s.players[ap]!.library.slice(0, 2)).toEqual([l, g]);
  });
});

describe("Thunderous Debut", () => {
  const board = () => {
    const { s, ap, ids } = setup([debut()]);
    const g2 = into(s, ap, golem, "library");
    const g1 = into(s, ap, golem, "library");
    const r = putOnBattlefield(s, ap, relic);
    s.players[ap]!.manaPool.G = 8;
    return { s, ap, ids, g1, g2, r };
  };
  it("not bargained: up to two creature cards from the top twenty into your hand, then shuffle", () => {
    const { s: s0, ap, ids, g1, g2 } = board();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 2 });
    expect(s.pending?.kind === "searchLibrary" && s.pending.dig?.looked.length).toBe(20);
    expect(() => applyAction(s, { type: "searchLibrary", player: ap, found: [g1, g2, s.players[ap]!.library[2]!] })).toThrow();
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [g1, g2] }));
    expect([zone(s, g1), zone(s, g2)]).toEqual(["hand", "hand"]);
  });
  it("bargained: onto the battlefield instead", () => {
    const { s: s0, ap, ids, g1, g2, r } = board();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { bargain: r })));
    expect(zone(s, r)).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 2 });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [g1, g2] }));
    expect([zone(s, g1), zone(s, g2)]).toEqual(["battlefield", "battlefield"]);
  });
});

describe("Storm of Memories", () => {
  it("an instant or sorcery card with mana value 3 or less at random, cast free, then exiled instead of going to the graveyard", () => {
    const { s: s0, ap, ids } = setup([memories()]);
    const opp = opps(s0, ap)[0]!;
    // Only Test Bolt fits: Test Quake's mana value is 4 and the golem isn't an instant or sorcery.
    const b = into(s0, ap, bolt, "graveyard");
    const q = into(s0, ap, quake, "graveyard");
    const g = into(s0, ap, golem, "graveyard");
    s0.players[ap]!.manaPool.R = 5;
    let s = pickCast(settle(run(s0, planCast(s0, ap, ids[0]!))), ap, b);
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: b });
    expect([zone(s, b), zone(s, q), zone(s, g)]).toEqual(["exile", "graveyard", "graveyard"]);
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, b, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(zone(s, b)).toBe("exile");
  });
  it("with none that fits, nothing is exiled", () => {
    const { s: s0, ap, ids } = setup([memories()]);
    const q = into(s0, ap, quake, "graveyard");
    s0.players[ap]!.manaPool.R = 5;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeNull();
    expect(zone(s, q)).toBe("graveyard");
  });
});

describe("Capricious Hellraiser", () => {
  it("three cards at random from your graveyard; a copy of a noncreature, nonland one may be cast free, the cards stay exiled", () => {
    const { s: s0, ap, ids } = setup([hellraiser()]);
    const opp = opps(s0, ap)[0]!;
    const b = into(s0, ap, bolt, "graveyard");
    const g = into(s0, ap, golem, "graveyard");
    const l = into(s0, ap, wastes, "graveyard");
    s0.players[ap]!.manaPool.R = 6;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect([zone(s, b), zone(s, g), zone(s, l)]).toEqual(["exile", "exile", "exile"]);
    s = pickCast(s, ap, b);
    expect(s.pending?.kind).toBe("castFree");
    const copy = s.pending?.kind === "castFree" ? s.pending.objectId : "";
    expect(copy).not.toBe(b);
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, copy, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(zone(s, b)).toBe("exile");
    expect(s.objects[copy]).toBeUndefined();
  });
  it("with more than three, only three are exiled; all creature and land cards: nothing to copy", () => {
    const { s: s0, ap, ids } = setup([hellraiser()]);
    const yard = [golem, golem, wastes, wastes, golem].map((d) => into(s0, ap, d, "graveyard"));
    s0.players[ap]!.manaPool.R = 6;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeNull();
    expect(yard.filter((id) => zone(s, id) === "exile").length).toBe(3);
  });
});

describe("Spectral Arcanist", () => {
  it("a spell with mana value up to the number of Spirits you control from any graveyard, cast free, then exiled", () => {
    const { s: s0, ap, ids } = setup([arcanist()]);
    const [opp, opp2] = opps(s0, ap);
    // One Spirit (the Arcanist itself): Test Bolt (1) fits, Test Blast (2) doesn't.
    const b = into(s0, opp!, bolt, "graveyard");
    const bl = into(s0, opp2!, blast, "graveyard");
    s0.players[ap]!.manaPool.U = 4;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", options: [b, "none"] });
    s = act(s, { type: "chooseOption", player: ap, choice: b });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: b });
    const life = s.players[opp2!]!.life;
    s = settle(run(s, planCast(s, ap, b, [{ kind: "player", id: opp2! }])));
    expect(s.players[opp2!]!.life).toBe(life - 3);
    // Its owner's exile, not their graveyard.
    expect(zone(s, b)).toBe("exile");
    expect(s.players[opp!]!.exile).toContain(b);
    expect(zone(s, bl)).toBe("graveyard");
  });
  it("more Spirits, a greater mana value; declined, the card stays in the graveyard", () => {
    const { s: s0, ap, ids } = setup([arcanist()]);
    putOnBattlefield(s0, ap, card("Test Spirit", "Creature — Spirit", "{1}{W}", { power: "1", toughness: "1" }));
    const bl = into(s0, ap, blast, "graveyard");
    s0.players[ap]!.manaPool.U = 4;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", options: [bl, "none"] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }));
    expect(zone(s, bl)).toBe("graveyard");
  });
});

describe("End-Blaze Epiphany", () => {
  it("when the creature dies this turn, cards equal to its last known power are exiled; one chosen may be played until the end of your next turn", () => {
    const { s: s0, ap, ids } = setup([epiphany()]);
    const opp = opps(s0, ap)[0]!;
    const g = putOnBattlefield(s0, opp, golem);
    // A 4/4 now (printed 3/3): its power as it last existed counts (CR 608.2h).
    s0.objects[g]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    const top = s0.players[ap]!.library.slice(0, 5);
    s0.players[ap]!.manaPool.R = 5;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(g)], undefined, "auto", 4)));
    expect(zone(s, g)).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "impulseChoice", player: ap, options: top.slice(0, 4) });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: top[1]! }));
    expect(top.slice(0, 4).map((id) => zone(s, id))).toEqual(["exile", "exile", "exile", "exile"]);
    expect(s.objects[top[1]!]!.mayPlay).toMatchObject({ player: ap, until: "nextTurn" });
    expect(s.objects[top[0]!]!.mayPlay).toBeUndefined();
    expect(zone(s, top[4]!)).toBe("library");
  });
  it("if it survives, nothing more happens", () => {
    const { s: s0, ap, ids } = setup([epiphany()]);
    const opp = opps(s0, ap)[0]!;
    const g = putOnBattlefield(s0, opp, golem);
    const top = s0.players[ap]!.library.slice(0, 3);
    s0.players[ap]!.manaPool.R = 2;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(g)], undefined, "auto", 1)));
    expect(zone(s, g)).toBe("battlefield");
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.library.slice(0, 3)).toEqual(top);
  });
});

describe("Smelting Vat", () => {
  it("noncreature artifact cards from the top eight with total mana value up to the sacrificed artifact's, onto the battlefield", () => {
    const { s: s0, ap } = setup([]);
    const v = putOnBattlefield(s0, ap, vat());
    const r = putOnBattlefield(s0, ap, relic);
    // Top eight: Test Engine (3, too much), a golem (a creature), Test Pot (2), Test Trinket and Test Bauble (1 each).
    const lib = [engine, golem, pot, trinket, bauble].map((d) => into(s0, ap, d, "library")).reverse();
    const [trinketId, potId, golemId, engineId] = [lib[1]!, lib[2]!, lib[3]!, lib[4]!];
    const baubleId = lib[0]!;
    s0.players[ap]!.manaPool.C = 1;
    let s = settle(run(s0, planActivate(s0, ap, v, 0, undefined, undefined, undefined, undefined, { sacrifice: [r] })));
    expect(zone(s, r)).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 2, totalMv: 2 });
    const cards = s.pending?.kind === "searchLibrary" ? s.pending.cards : [];
    expect(cards).not.toContain(engineId);
    expect(cards).not.toContain(golemId);
    // Together more than 2: not allowed.
    expect(() => applyAction(s, { type: "searchLibrary", player: ap, found: [potId, trinketId] })).toThrow();
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [trinketId, baubleId] }));
    expect([zone(s, trinketId), zone(s, baubleId)]).toEqual(["battlefield", "battlefield"]);
    expect(s.players[ap]!.library.slice(-6)).toContain(potId);
    expect(s.players[ap]!.library.slice(0, 2)).not.toContain(potId);
  });
});
