// Round 265: permanents tapped at the same time as one event (Deeproot Pilgrimage, Rewrite History: "whenever one or more
// ... become tapped"; see batchTaps in game.ts), Arcbond's delayed "whenever that creature is dealt damage this turn",
// additional upkeep steps (Obeka, Splitter of Seconds: beginning phases with only an upkeep step after this phase; The
// Ninth Doctor: "after this step" from its untap step trigger), Omo, Queen of Vesuva's everything counters (every land
// type, every creature type) and Ramses, Assassin Lord ("if they were attacked this turn by an Assassin you controlled").

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, applyAction, characteristics, dealDamageBatch, invalidateCharacteristics, isFullySupported, objectSource, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";
import { manaAbilitiesOn } from "../src/manaabilities";

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question but blockers (none declared). */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Pass priority (answering blockers with none) until the game reaches `step`, stopping at any other question. */
const passTo = (s: GameState, step: GameState["step"], max = 400) => {
  for (let i = 0; i < max && s.step !== step && !s.over; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const opps = (s: GameState, ap: PlayerId) => [1, 2, 3].map((k) => s.turnOrder[(s.turnOrder.indexOf(ap) + k) % s.turnOrder.length]!);
const tokens = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]?.name === name).length;
/** To the declare attackers step of the active player's turn. */
const toAttack = (s: GameState) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(s.pending?.kind).toBe("declareAttackers");
  return s;
};

const merfolk = (name = "Test Merfolk") => card(name, "Creature — Merfolk Wizard", "{1}{U}", { power: "1", toughness: "1" });
const pilgrimage = (): CardDef => ({"oracleId":"188656d8-4ea8-4e58-88da-b010a16eb6f2","name":"Deeproot Pilgrimage","manaCost":"{1}{U}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever one or more nontoken Merfolk you control become tapped, create a 1/1 blue Merfolk creature token with hexproof.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"lci","releasedAt":"2023-11-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const rewrite = (): CardDef => ({"oracleId":"f91c860e-3feb-4a5a-b7ef-4e7d38d61c75","name":"Rewrite History","manaCost":"{2}{U}","cmc":3,"typeLine":"Enchantment — Plan","supertypes":[],"types":["Enchantment"],"subtypes":["Plan"],"oracleText":"Whenever one or more creatures you control become tapped, draw a card, then discard a card and put a plan counter on this enchantment.\nWhen the fourth plan counter is put on this enchantment, sacrifice it. When you do, return up to two target instant and/or sorcery cards from your graveyard to your hand.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const arcbond = (): CardDef => ({"oracleId":"01790829-cc03-430f-a899-2f274b7dbf62","name":"Arcbond","manaCost":"{2}{R}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose target creature. Whenever that creature is dealt damage this turn, it deals that much damage to each other creature and each player.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"frf","releasedAt":"2015-01-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const obeka = (): CardDef => ({"oracleId":"1d15a06f-5471-48f2-8c4a-9b0886bef5af","name":"Obeka, Splitter of Seconds","manaCost":"{1}{U}{B}{R}","cmc":4,"typeLine":"Legendary Creature — Ogre Warlock","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Ogre","Warlock"],"oracleText":"Menace\nWhenever Obeka deals combat damage to a player, you get that many additional upkeep steps after this phase.","power":"2","toughness":"5","colors":["B","R","U"],"colorIdentity":["B","R","U"],"keywords":["Menace"],"commanderLegal":"legal","set":"otj","releasedAt":"2024-04-19","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ninth = (): CardDef => ({"oracleId":"c99f59c0-5cce-41a4-908f-d34e2c697419","name":"The Ninth Doctor","manaCost":"{1}{U}{R}","cmc":3,"typeLine":"Legendary Creature — Time Lord Doctor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Time Lord","Doctor"],"oracleText":"Haste\nInto the TARDIS — Whenever The Ninth Doctor becomes untapped during your untap step, you get an additional upkeep step after this step.","power":"2","toughness":"4","colors":["R","U"],"colorIdentity":["R","U"],"keywords":["Into the TARDIS","Haste"],"commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const omo = (): CardDef => ({"oracleId":"021b91ea-18d8-4b50-97da-dd003380cd68","name":"Omo, Queen of Vesuva","manaCost":"{2}{G/U}","cmc":3,"typeLine":"Legendary Creature — Shapeshifter Noble","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Shapeshifter","Noble"],"oracleText":"Whenever Omo enters or attacks, put an everything counter on each of up to one target land and up to one target creature.\nEach land with an everything counter on it is every land type in addition to its other types.\nEach nonland creature with an everything counter on it is every creature type.","power":"1","toughness":"5","colors":["G","U"],"colorIdentity":["G","U"],"keywords":[],"commanderLegal":"legal","set":"m3c","releasedAt":"2024-06-14","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const ramses = (): CardDef => ({"oracleId":"170182ed-af1d-442a-8868-d74a96e17f03","name":"Ramses, Assassin Lord","manaCost":"{2}{U}{B}","cmc":4,"typeLine":"Legendary Creature — Human Assassin","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Assassin"],"oracleText":"Deathtouch\nOther Assassins you control get +1/+1.\nWhenever a player loses the game, if they were attacked this turn by an Assassin you controlled, you win the game.","power":"4","toughness":"4","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Deathtouch"],"commanderLegal":"legal","set":"dmc","releasedAt":"2022-09-09","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const haze = (): CardDef => ({"oracleId":"daff0e7b-08f2-435f-97b9-9b000e94ffa8","name":"Paradox Haze","manaCost":"{2}{U}","cmc":3,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant player\nAt the beginning of enchanted player's first upkeep each turn, that player gets an additional upkeep step after this step.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"commanderLegal":"legal","set":"tsp","releasedAt":"2006-10-06","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const tower = (): CardDef => ({"oracleId":"32fbb638-ab14-4e8b-a07a-d4c44e3496f2","name":"Urza's Tower","manaCost":"","cmc":0,"typeLine":"Land — Urza's Tower","supertypes":[],"types":["Land"],"subtypes":["Urza's","Tower"],"oracleText":"{T}: Add {C}. If you control an Urza's Mine and an Urza's Power-Plant, add {C}{C}{C} instead.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"commanderLegal":"legal","set":"2xm","releasedAt":"2020-08-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const tapper = (name: string, typeLine: string, extra: Partial<CardDef> = {}) => card(name, typeLine, "{1}", { power: "1", toughness: "1", oracleText: "{T}: You gain 1 life.", ...extra });
const tapAll = () => card("Test Slumber", "Sorcery", "{U}", { oracleText: "Tap all creatures you control." });
const indexOf = (s: GameState, id: ObjectId, text: RegExp) => {
  const i = abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => text.test(a.text));
  if (i < 0) throw new Error(`no ability ${text}`);
  return i;
};

describe("Deeproot Pilgrimage and Rewrite History: one or more permanents becoming tapped at the same time", () => {
  it("are fully supported", () => {
    expect(isFullySupported(pilgrimage())).toBe(true);
    expect(isFullySupported(rewrite())).toBe(true);
  });

  it("triggers once for nontoken Merfolk declared as attackers together (CR 508.1f)", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    putOnBattlefield(s, ap, pilgrimage());
    const a = putOnBattlefield(s, ap, merfolk());
    const b = putOnBattlefield(s, ap, merfolk("Other Merfolk"));
    s = toAttack(s);
    const opp = opps(s, ap)[0]!;
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }, { attacker: b, defender: opp }] });
    s = settle(s);
    expect(tokens(s, ap, "Merfolk Token")).toBe(1);
  });

  it("triggers for a Merfolk's own tap cost, but not for a token Merfolk or another creature", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    putOnBattlefield(s, ap, pilgrimage());
    const m = putOnBattlefield(s, ap, tapper("Tapping Merfolk", "Creature — Merfolk"));
    const tok = putOnBattlefield(s, ap, tapper("Token Merfolk", "Creature — Merfolk"));
    s.objects[tok]!.isToken = true;
    const elf = putOnBattlefield(s, ap, tapper("Tapping Elf", "Creature — Elf"));
    invalidateCharacteristics(s);
    s = settle(run(s, planActivate(s, ap, tok, indexOf(s, tok, /gain 1 life/))));
    s = settle(run(s, planActivate(s, ap, elf, indexOf(s, elf, /gain 1 life/))));
    expect(tokens(s, ap, "Merfolk Token")).toBe(0);
    s = settle(run(s, planActivate(s, ap, m, indexOf(s, m, /gain 1 life/))));
    expect(tokens(s, ap, "Merfolk Token")).toBe(1);
  });

  it("an instruction tapping several Merfolk is one event (CR 608.2c)", () => {
    const { s: s0, ap, ids } = setup([tapAll()]);
    let s = s0;
    putOnBattlefield(s, ap, pilgrimage());
    putOnBattlefield(s, ap, merfolk());
    putOnBattlefield(s, ap, merfolk("Other Merfolk"));
    putOnBattlefield(s, ap, merfolk("Third Merfolk"));
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(tokens(s, ap, "Merfolk Token")).toBe(1);
  });

  it("Rewrite History loots once and gets one plan counter for creatures attacking together", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const r = putOnBattlefield(s, ap, rewrite());
    const a = putOnBattlefield(s, ap, merfolk());
    const b = putOnBattlefield(s, ap, card("Test Ox", "Creature — Ox", "{1}", { power: "1", toughness: "1" }));
    s = toAttack(s);
    const opp = opps(s, ap)[0]!;
    const hand = s.players[ap]!.hand.length;
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }, { attacker: b, defender: opp }] });
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 1 });
    s = settle(act(s, { type: "discard", player: ap, objectIds: [s.players[ap]!.hand[0]!] }));
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.objects[r]!.counters.plan).toBe(1);
  });
});

describe("Arcbond", () => {
  it("is fully supported", () => expect(isFullySupported(arcbond())).toBe(true));

  it("the chosen creature deals the damage it's dealt this turn to each other creature and each player, even lethal damage", () => {
    const { s: s0, ap, ids } = setup([arcbond()]);
    let s = s0;
    const opp = opps(s, ap)[0]!;
    const x = putOnBattlefield(s, opp, card("Bond Target", "Creature — Snake", "{3}", { power: "2", toughness: "2", oracleText: "Deathtouch", keywords: ["Deathtouch"] }));
    const y = putOnBattlefield(s, ap, card("Big Ox", "Creature — Ox", "{3}", { power: "1", toughness: "9" }));
    const z = putOnBattlefield(s, ap, card("Bigger Ox", "Creature — Ox", "{3}", { power: "1", toughness: "9" }));
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: x }])));
    expect(s.floatingTriggers).toHaveLength(1);
    expect(s.floatingTriggers![0]).toMatchObject({ until: "endOfTurn", about: { id: x } });
    const life = s.players.map((p) => p.life);
    dealDamageBatch(s, [{ src: objectSource(s, s.objects[y]!), to: { object: x }, n: 3 }]);
    s = settle(s);
    expect(s.objects[x]!.zone).toBe("graveyard");
    // 3 to each player and each other creature, Bond Target the source (rulings), as it last existed: with deathtouch.
    expect(s.players.map((p) => p.life)).toEqual(life.map((l) => l - 3));
    expect(s.objects[y]!.zone).toBe("graveyard");
    expect(s.objects[z]!.zone).toBe("graveyard");
  });

  it("damage to another creature doesn't trigger it", () => {
    const { s: s0, ap, ids } = setup([arcbond()]);
    let s = s0;
    const opp = opps(s, ap)[0]!;
    const x = putOnBattlefield(s, opp, card("Bond Target", "Creature — Giant", "{3}", { power: "2", toughness: "8" }));
    const y = putOnBattlefield(s, ap, card("Big Ox", "Creature — Ox", "{3}", { power: "1", toughness: "9" }));
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: x }])));
    const life = s.players.map((p) => p.life);
    dealDamageBatch(s, [{ src: objectSource(s, s.objects[x]!), to: { object: y }, n: 2 }]);
    s = settle(s);
    expect(s.players.map((p) => p.life)).toEqual(life);
    expect(s.objects[x]!.damage).toBe(0);
  });
});

/** A permanent counting its controller's upkeeps by life gained. */
const upkeepCounter = () => card("Upkeep Counter", "Enchantment", "{1}", { oracleText: "At the beginning of your upkeep, you gain 1 life." });

describe("Obeka, Splitter of Seconds and The Ninth Doctor: additional upkeep steps", () => {
  it("are fully supported", () => {
    expect(isFullySupported(obeka())).toBe(true);
    expect(isFullySupported(ninth())).toBe(true);
  });

  it("Obeka's combat damage gives that many beginning phases of only an upkeep step after combat (rulings)", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const ob = putOnBattlefield(s, ap, obeka());
    putOnBattlefield(s, ap, upkeepCounter());
    s = toAttack(s);
    const opp = opps(s, ap)[0]!;
    const upkeeps = s.turnLog?.upkeeps ?? 0;
    const life = s.players[ap]!.life;
    const hand = s.players[ap]!.hand.length;
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: ob, defender: opp }] });
    s = passTo(s, "upkeep");
    // The first of the two has begun, the other waits.
    expect(s.upkeepPhase).toBe(true);
    expect(s.addedPhases).toEqual(["upkeep"]);
    s = passTo(s, "main2");
    expect(s.activePlayer).toBe(ap);
    expect(s.turnLog?.upkeeps).toBe(upkeeps + 2);
    expect(s.players[ap]!.life).toBe(life + 2);
    // No untap or draw step in those phases.
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.objects[ob]!.tapped).toBe(true);
  });

  it("The Ninth Doctor untapping in your untap step gives an additional upkeep after the upkeep its trigger resolves in", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const doc = putOnBattlefield(s, ap, ninth());
    putOnBattlefield(s, ap, upkeepCounter());
    s.objects[doc]!.tapped = true;
    for (let i = 0; i < 4000 && !(s.activePlayer === ap && s.step === "draw" && s.turn > s0.turn); i++) {
      const p = s.pending;
      if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
      else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.step).toBe("draw");
    expect(s.turnLog?.upkeeps).toBe(2);
    expect(s.players[ap]!.life).toBe(s0.players[ap]!.life + 2);
  });
});

describe("Omo, Queen of Vesuva", () => {
  it("is fully supported", () => expect(isFullySupported(omo())).toBe(true));

  it("puts an everything counter on up to one land and up to one creature: every land type, every creature type", () => {
    const { s: s0, ap, ids } = setup([omo()]);
    let s = s0;
    const land = putOnBattlefield(s, ap, card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." }));
    const ox = putOnBattlefield(s, ap, card("Test Ox", "Creature — Ox", "{1}", { power: "1", toughness: "1" }));
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: land }, { kind: "object", id: ox }] }));
    expect(s.objects[land]!.counters.everything).toBe(1);
    expect(s.objects[ox]!.counters.everything).toBe(1);
    const lc = characteristics(s, s.objects[land]!);
    for (const t of ["Plains", "Island", "Swamp", "Mountain", "Forest", "Urza's", "Gate", "Desert", "Cave", "Town"]) expect(lc.subtypes).toContain(t);
    // Its basic land types' mana abilities (CR 305.6), and its own.
    const made = manaAbilitiesOn(s, s.objects[land]!).flatMap((m) => (m.produces.kind === "fixed" ? m.produces.mana : []));
    for (const m of ["W", "U", "B", "R", "G", "C"]) expect(made).toContain(m);
    expect(characteristics(s, s.objects[ox]!).allCreatureTypes).toBe(true);
  });

  it("a land creature isn't given every creature type (only nonland creatures)", () => {
    const { s } = setup([]);
    const ap = s.activePlayer;
    putOnBattlefield(s, ap, omo());
    const dryad = putOnBattlefield(s, ap, card("Test Arbor", "Land Creature — Forest Dryad", "", { power: "1", toughness: "1" }));
    s.objects[dryad]!.counters.everything = 1;
    invalidateCharacteristics(s);
    const c = characteristics(s, s.objects[dryad]!);
    expect(c.allCreatureTypes).toBeFalsy();
    expect(c.subtypes).toContain("Island");
  });
});

describe("Ramses, Assassin Lord", () => {
  it("is fully supported", () => expect(isFullySupported(ramses())).toBe(true));

  const assassin = () => card("Test Assassin", "Creature — Human Assassin", "{2}", { power: "3", toughness: "3" });
  /** Ramses and `att` on the active player's battlefield; `att` attacks the first opponent, who has 3 life. */
  const attackWith = (att: CardDef, lowLife = 3) => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    putOnBattlefield(s, ap, ramses());
    const a = putOnBattlefield(s, ap, att);
    const [opp, other] = opps(s, ap) as [PlayerId, PlayerId];
    s.players[opp]!.life = lowLife;
    s.players[other]!.life = lowLife;
    s = toAttack(s);
    s = passTo(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] }), "main2");
    return { s, ap, opp, other, a };
  };

  it("an opponent attacked by an Assassin you controlled losing the game makes you win", () => {
    // Other Assassins get +1/+1: the 4/4 Assassin deals 4 to a player at 3 life.
    const { s, ap, opp } = attackWith(assassin());
    expect(s.players[opp]!.lost).toBe(true);
    expect(s.over).toBe(true);
    expect(s.winner).toBe(ap);
  });

  it("not for a player your Assassin didn't attack, nor for an attack by a non-Assassin", () => {
    const { s: s1, opp, other } = attackWith(assassin(), 10);
    expect(s1.players[opp]!.lost).toBeFalsy();
    s1.players[other]!.life = 0;
    const s2 = passTo(s1, "end");
    expect(s2.players[other]!.lost).toBe(true);
    expect(s2.winner).toBeNull();
    const { s: s3, opp: opp3 } = attackWith(card("Test Ox", "Creature — Ox", "{2}", { power: "4", toughness: "4" }));
    expect(s3.players[opp3]!.lost).toBe(true);
    expect(s3.winner).toBeNull();
  });
});
