// Round 380 (Lane A): a creature card given to the player whose turn it is, goaded and exiled at the next end step (The
// Beamtown Bullies), a creature card exiled from the top that may be cast with undaunted for as long as it stays exiled
// (Durnan of the Yawning Portal, CR 702.125), a prevention shield whose triggers have your commanders strike back
// (Judgment of Alexander) and creature types noted for a token (Volo, Itinerant Scholar).

import { describe, expect, it } from "vitest";
import { act, card, forest, island, mountain, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { abilityProblem, applyAction, botActions, characteristics, isFullySupported, planActivate, planCast, spellCost, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty, stopping at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 200 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Players pass until `pid` has priority (nothing on the stack resolves: it must be empty). */
const priorityTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 4 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(waitingOn(s)).toBe(pid);
  return s;
};
const nextOf = (s: GameState, pid: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + n) % 4]!;
/** A card in `pid`'s `zone` (hand, graveyard or library top). */
const cardIn = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  return id;
};

// Real oracle text (Scryfall).
const bullies = (): CardDef => ({"oracleId":"62d394e1-6e7d-4703-8fd8-494f0f043876","name":"The Beamtown Bullies","manaCost":"{1}{B}{R}{G}","cmc":4,"typeLine":"Legendary Creature — Ogre Devil Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Ogre","Devil","Warrior"],"oracleText":"Vigilance, haste\n{T}: Target opponent whose turn it is puts target nonlegendary creature card from your graveyard onto the battlefield under their control. It gains haste. Goad it. At the beginning of the next end step, exile it. (Until your next turn, that creature attacks each combat if able and attacks a player other than you if able.)","power":"4","toughness":"4","colors":["B","G","R"],"colorIdentity":["B","G","R"],"keywords":["Goad","Vigilance","Haste"],"commanderLegal":"legal","set":"ncc","releasedAt":"2022-04-29","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const durnan = (): CardDef => ({"oracleId":"21d3858f-441d-4bb2-888e-8b147ecad7e9","name":"Durnan of the Yawning Portal","manaCost":"{3}{G}","cmc":4,"typeLine":"Legendary Creature — Human Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warrior"],"oracleText":"Whenever Durnan attacks, look at the top four cards of your library. You may exile a creature card from among them. Put the rest on the bottom of your library in any order. For as long as that card remains exiled, you may cast it. That spell has undaunted. (It costs {1} less to cast for each opponent.)\nChoose a Background (You can have a Background as a second commander.)","power":"3","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":["Choose a background"],"commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const judgment = (): CardDef => ({"oracleId":"eb226c0d-a71b-4f9c-9fce-47d61dcfa8f8","name":"Judgment of Alexander","manaCost":"{2}{W}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Prevent all damage that would be dealt to you this turn by sources your opponents control. Whenever damage from a creature is prevented this way, each commander creature you control deals damage equal to its power to that creature.","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","set":"fic","releasedAt":"2025-12-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const volo = (): CardDef => ({"oracleId":"9b61f5b1-7688-4336-8fe9-66da37a34df9","name":"Volo, Itinerant Scholar","manaCost":"{2}{U}","cmc":3,"typeLine":"Legendary Creature — Human Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"When Volo enters, create Volo's Journal, a legendary colorless Book artifact token with hexproof and \"Whenever you cast a creature spell, note one of its creature types that hasn't been noted for Volo's Journal.\"\n{2}, {T}: Draw a card for each creature type noted for target permanent you control named Volo's Journal.\nChoose a Background","power":"2","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Choose a background"],"commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const pyromancer = (): CardDef => ({"oracleId":"29b3cb3e-aeb1-43eb-8095-9f7881aa34bd","name":"Prodigal Pyromancer","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"{T}: This creature deals 1 damage to any target.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const mirrorEntity = (): CardDef => ({"oracleId":"17e905ca-c0bd-473d-95a7-e180ba5fea43","name":"Mirror Entity","manaCost":"{2}{W}","cmc":3,"typeLine":"Creature — Shapeshifter","supertypes":[],"types":["Creature"],"subtypes":["Shapeshifter"],"oracleText":"Changeling (This card is every creature type.)\n{X}: Until end of turn, creatures you control have base power and toughness X/X and gain all creature types.","power":"1","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":["Changeling"],"commanderLegal":"legal","set":"sld","releasedAt":"2026-02-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const legend = card("Test Legend", "Legendary Creature — Human", "{2}", { power: "2", toughness: "2" });

describe("round 380: compiles", () => {
  it("The Beamtown Bullies, Durnan of the Yawning Portal, Judgment of Alexander and Volo, Itinerant Scholar", () => {
    for (const def of [bullies(), durnan(), judgment(), volo()]) expect(isFullySupported(def), def.name).toBe(true);
  });
});

describe("The Beamtown Bullies", () => {
  /** A has the Bullies and a Hill Giant card in their graveyard; it's B's upkeep and A has priority. */
  const ready = () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const bully = putOnBattlefield(s, ap, bullies());
    const giant = cardIn(s, ap, hillGiant(), "graveyard");
    const famous = cardIn(s, ap, legend, "graveyard");
    const b = nextOf(s, ap);
    s = passUntil(s, "upkeep", b);
    s = priorityTo(s, ap);
    return { s, ap, b, bully, giant, famous };
  };

  it("targets only the opponent whose turn it is, and only a nonlegendary creature card", () => {
    const { s, ap, b, bully, giant, famous } = ready();
    const c = nextOf(s, ap, 2);
    expect(abilityProblem(s, ap, bully, 0, [{ kind: "player", id: b }, target(giant)])).toBeNull();
    expect(abilityProblem(s, ap, bully, 0, [{ kind: "player", id: c }, target(giant)])).not.toBeNull();
    expect(abilityProblem(s, ap, bully, 0, [{ kind: "player", id: b }, target(famous)])).not.toBeNull();
  });

  it("can't be activated during your own turn: no opponent's turn it is (CR 601.2c, 602.2b)", () => {
    const { s: s0, ap } = setup([]);
    const bully = putOnBattlefield(s0, ap, bullies());
    const giant = cardIn(s0, ap, hillGiant(), "graveyard");
    for (const pid of s0.turnOrder) if (pid !== ap) expect(abilityProblem(s0, ap, bully, 0, [{ kind: "player", id: pid }, target(giant)])).not.toBeNull();
  });

  it("that player puts it onto the battlefield under their control with haste, goaded by you, and you exile it at the next end step", () => {
    let { s, ap, b, bully, giant } = ready();
    s = settle(run(s, planActivate(s, ap, bully, 0, [{ kind: "player", id: b }, target(giant)])));
    const o = s.objects[giant]!;
    expect(o.zone).toBe("battlefield");
    expect(o.controller).toBe(b);
    expect(o.putter).toBe(b);
    const ch = characteristics(s, o);
    expect(ch.keywords).toContain("Haste");
    expect(ch.goadedBy).toEqual([ap]);
    const zc = o.zoneChanges ?? 0;
    // Goaded: it attacks, and a player other than you (CR 701.15b).
    for (let i = 0; i < 100 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "declareAttackers", player: b });
    expect(() => act(s, { type: "declareAttackers", player: b, attacks: [] })).toThrow(/attacks each combat/);
    expect(() => act(s, { type: "declareAttackers", player: b, attacks: [{ attacker: giant, defender: ap }] })).toThrow();
    s = act(s, { type: "declareAttackers", player: b, attacks: [{ attacker: giant, defender: nextOf(s, ap, 2) }] });
    s = passUntil(s, "end", b);
    s = settle(s);
    expect(s.objects[giant]!.zone).toBe("exile");
    expect(s.objects[giant]!.zoneChanges).toBe(zc + 1);
  });
});

describe("The Beamtown Bullies: bots", () => {
  it("give the player whose turn it is their best creature card at that player's beginning of combat", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const bully = putOnBattlefield(s, ap, bullies());
    const giant = cardIn(s, ap, hillGiant(), "graveyard");
    cardIn(s, ap, card("Test Pup", "Creature — Dog", "{G}", { power: "1", toughness: "1" }), "graveyard");
    const b = nextOf(s, ap);
    s = passUntil(s, "upkeep", b);
    s = priorityTo(s, ap);
    expect(botActions(s, ap).some((a) => a.type === "activateAbility")).toBe(false);
    s = passUntil(s, "beginCombat", b);
    s = priorityTo(s, ap);
    const plan = botActions(s, ap);
    expect(plan.find((a) => a.type === "activateAbility")).toMatchObject({ objectId: bully, targets: [{ kind: "player", id: b }, { kind: "object", id: giant }] });
  });
});

describe("Durnan of the Yawning Portal", () => {
  /** A attacks B with Durnan; the top four cards are a Hill Giant card and three Forests. */
  const attacked = () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const durn = putOnBattlefield(s, ap, durnan());
    const lands = [forest, forest, forest].map((l) => cardIn(s, ap, l, "library"));
    const giant = cardIn(s, ap, hillGiant(), "library");
    s = passUntil(s, "declareAttackers", ap);
    for (let i = 0; i < 20 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: durn, defender: opp }] });
    s = settle(s);
    return { s, ap, opp, durn, giant, lands };
  };

  it("exiles a creature card you choose from the top four; the rest go to the bottom", () => {
    let { s, ap, giant, lands } = attacked();
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, cards: [giant], min: 0, max: 1 });
    s = act(s, { type: "searchLibrary", player: ap, found: [giant] });
    // "In any order": you order the rest (CR 401.4).
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap, how: "bottom" });
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [lands[1]!, lands[0]!, lands[2]!], away: [] }));
    expect(s.objects[giant]!.zone).toBe("exile");
    expect(s.players[ap]!.library.slice(-3)).toEqual([lands[1], lands[0], lands[2]]);
    expect(s.objects[giant]!.mayPlay).toMatchObject({ player: ap, until: "exiled", castOnly: true, undaunted: true });
  });

  it("that spell has undaunted: {1} less for each opponent, those who left the game not counted (CR 702.125a-b)", () => {
    let { s, ap, giant } = attacked();
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [giant] }));
    if (s.pending?.kind === "arrangeTop") s = settle(act(s, { type: "arrangeTop", player: ap, top: s.pending.cards, away: [] }));
    // Hill Giant costs {3}{R}: with three opponents, {R}.
    expect(spellCost(s, ap, s.objects[giant]!)).toMatchObject({ cost: { symbols: [{ kind: "colored", color: "R" }] }, extra: 0 });
    s.players[nextOf(s, ap, 2)]!.lost = true;
    expect(spellCost(s, ap, s.objects[giant]!)).toMatchObject({ cost: { symbols: [{ kind: "colored", color: "R" }] }, extra: 1 });
  });

  it("may be cast on a later turn, with its normal timing, while it's still exiled (rulings)", () => {
    let { s, ap, giant } = attacked();
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [giant] }));
    if (s.pending?.kind === "arrangeTop") s = settle(act(s, { type: "arrangeTop", player: ap, top: s.pending.cards, away: [] }));
    // Not during combat: it's a creature spell (CR 307.1).
    expect(planCast(s, ap, giant)).toBeNull();
    s = passUntil(s, "main1", nextOf(s, ap));
    s = priorityTo(s, ap);
    expect(planCast(s, ap, giant)).toBeNull();
    s = passUntil(s, "main1", ap);
    s = settle(run(s, planCast(s, ap, giant)));
    expect(s.objects[giant]!.zone).toBe("battlefield");
  });

  it("may be cast in your second main phase that turn", () => {
    let { s, ap, giant } = attacked();
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [giant] }));
    if (s.pending?.kind === "arrangeTop") s = settle(act(s, { type: "arrangeTop", player: ap, top: s.pending.cards, away: [] }));
    s = passUntil(s, "main2", ap);
    s = settle(run(s, planCast(s, ap, giant)));
    expect(s.objects[giant]!.zone).toBe("battlefield");
  });

  it("taking no card exiles nothing", () => {
    let { s, ap, giant } = attacked();
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    if (s.pending?.kind === "arrangeTop") s = settle(act(s, { type: "arrangeTop", player: ap, top: s.pending.cards, away: [] }));
    expect(s.objects[giant]!.zone).toBe("library");
  });
});

describe("Judgment of Alexander", () => {
  /** A controls a 3/3 commander creature and casts Judgment in B's upkeep; B has a Hill Giant and a 2/2 bear. */
  const ready = () => {
    const { s: s0, ap, ids } = setup([judgment(), bolt()]);
    let s = s0;
    const b = nextOf(s, ap);
    const cmdr = putOnBattlefield(s, ap, card("Test Captain", "Legendary Creature — Human", "{2}{W}", { power: "3", toughness: "3" }), { commander: true });
    const plain = putOnBattlefield(s, ap, card("Test Squire", "Creature — Human", "{1}{W}", { power: "5", toughness: "5" }));
    const giant = putOnBattlefield(s, b, hillGiant());
    const cub = putOnBattlefield(s, b, card("Test Cub", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    for (const l of [mountain, mountain]) putOnBattlefield(s, b, l);
    s = passUntil(s, "upkeep", b);
    s = priorityTo(s, ap);
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    return { s, ap, b, cmdr, plain, giant, cub, bolt: ids[1]! };
  };
  const attack = (s: GameState, b: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId }[]) => {
    for (let i = 0; i < 100 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: b, attacks });
    for (let i = 0; i < 100 && s.step !== "combatDamage"; i++) {
      if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return s;
  };

  it("prevents the combat damage, and each creature's prevented damage triggers: your commander deals damage equal to its power to it", () => {
    let { s, ap, b, cmdr, giant, cub } = ready();
    const life = s.players[ap]!.life;
    s = attack(s, b, [{ attacker: giant, defender: ap }, { attacker: cub, defender: ap }]);
    expect(s.players[ap]!.life).toBe(life);
    // One trigger for each creature (CR 603.2), about it.
    expect(s.stack.length + s.triggerQueue.length).toBe(2);
    s = settle(s);
    expect(s.objects[giant]!.zone).toBe("graveyard");
    expect(s.objects[cub]!.zone).toBe("graveyard");
    // The commander is the source of that damage (CR 120.3), not the spell.
    expect(s.log.some((l) => l.text === "Test Captain deals 3 damage to Hill Giant.")).toBe(true);
    expect(s.objects[cmdr]!.damage).toBe(0);
  });

  it("only your commander creatures deal damage, each its power as the trigger resolves", () => {
    let { s, ap, b, cmdr, plain, giant } = ready();
    s.objects[giant]!.counters["+1/+1"] = 3;
    s = attack(s, b, [{ attacker: giant, defender: ap }]);
    s = settle(s);
    // 6/6 Giant, 3 damage from the commander only (the 5/5 noncommander deals none).
    expect(s.objects[giant]!.zone).toBe("battlefield");
    expect(s.objects[giant]!.damage).toBe(3);
    expect(s.objects[plain]!.zone).toBe("battlefield");
    expect(s.log.some((l) => /^Test Squire deals/.test(l.text))).toBe(false);
    void cmdr;
  });

  it("damage from a noncreature source is prevented without a trigger; damage to your creatures isn't prevented", () => {
    let { s, ap, b, giant } = ready();
    const life = s.players[ap]!.life;
    // B casts Lightning Bolt (given to B) at A.
    const bo = cardIn(s, b, bolt(), "hand");
    s = priorityTo(s, b);
    s = run(s, planCast(s, b, bo, [{ kind: "player", id: ap }]));
    s = settle(s);
    expect(s.players[ap]!.life).toBe(life);
    expect(s.log.some((l) => /ability triggers/.test(l.text))).toBe(false);
    expect(s.objects[giant]!.damage).toBe(0);
  });
});

describe("Volo, Itinerant Scholar", () => {
  /** Volo cast and resolved: its Journal is on the battlefield. */
  const ready = (hand: CardDef[]) => {
    const { s: s0, ap, ids } = setup([volo(), ...hand]);
    for (const l of [island, island, island, mountain, mountain, mountain]) putOnBattlefield(s0, ap, l);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const journal = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]?.name === "Volo's Journal")!;
    return { s, ap, volo: ids[0]!, journal, hand: ids.slice(1) };
  };
  const noted = (s: GameState, id: ObjectId) => s.notedFor?.[`${id}@${s.objects[id]!.zoneChanges ?? 0}`] ?? [];

  it("creates Volo's Journal, a legendary colorless Book artifact token with hexproof", () => {
    const { s, ap, journal } = ready([]);
    expect(journal).toBeDefined();
    const ch = characteristics(s, s.objects[journal]!);
    expect(ch.types).toEqual(["Artifact"]);
    expect(ch.subtypes).toEqual(["Book"]);
    expect(ch.supertypes).toContain("Legendary");
    expect(ch.colors).toEqual([]);
    expect(ch.keywords).toContain("Hexproof");
    expect(s.objects[journal]!.isToken).toBe(true);
    expect(s.objects[journal]!.controller).toBe(ap);
  });

  it("notes one of each creature spell's types not noted yet, your choice among them", () => {
    let { s, ap, journal, hand } = ready([hillGiant(), pyromancer(), pyromancer(), hillGiant()]);
    // One type: noted with no question.
    s = settle(run(s, planCast(s, ap, hand[0]!)));
    expect(noted(s, journal)).toEqual(["Giant"]);
    // Human Wizard: you choose (CR 608.2d).
    s = settle(run(s, planCast(s, ap, hand[1]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "noteType", player: ap, options: ["Human", "Wizard"] });
    expect(() => act(s, { type: "chooseOption", player: ap, choice: "Giant" })).toThrow();
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Wizard" }));
    expect(noted(s, journal)).toEqual(["Giant", "Wizard"]);
    // Only Human is left of the second one's types.
    s = settle(run(s, planCast(s, ap, hand[2]!)));
    expect(noted(s, journal)).toEqual(["Giant", "Wizard", "Human"]);
    // Nothing left for another Giant.
    s = settle(run(s, planCast(s, ap, hand[3]!)));
    expect(s.pending).toBeNull();
    expect(noted(s, journal)).toEqual(["Giant", "Wizard", "Human"]);
  });

  it("a changeling spell offers every creature type not noted (CR 702.73a)", () => {
    let { s, ap, journal, hand } = ready([hillGiant(), mirrorEntity()]);
    s = settle(run(s, planCast(s, ap, hand[0]!)));
    s = settle(run(s, planCast(s, ap, hand[1]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "noteType" });
    const opts = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    expect(opts).not.toContain("Giant");
    expect(opts).toContain("Shapeshifter");
    expect(opts).toContain("Sliver");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Sliver" }));
    expect(noted(s, journal)).toEqual(["Giant", "Sliver"]);
  });

  it("{2}, {T}: draws a card for each creature type noted for the target Journal", () => {
    let { s, ap, volo: v, journal, hand } = ready([hillGiant(), pyromancer()]);
    s = settle(run(s, planCast(s, ap, hand[0]!)));
    s = settle(run(s, planCast(s, ap, hand[1]!)));
    if (s.pending?.kind === "chooseOption") s = settle(act(s, { type: "chooseOption", player: ap, choice: "Human" }));
    expect(noted(s, journal)).toEqual(["Giant", "Human"]);
    // Only a permanent you control named Volo's Journal (CR 201.2).
    expect(abilityProblem(s, ap, v, 0, [target(hand[0]!)])).not.toBeNull();
    s.objects[v]!.controlledSinceTurn = -1;
    const before = s.players[ap]!.hand.length;
    s = settle(run(s, planActivate(s, ap, v, 0, [target(journal)])));
    expect(s.players[ap]!.hand.length).toBe(before + 2);
  });

  it("a Journal that left and came back is a new object with nothing noted (CR 400.7)", () => {
    let { s, journal, hand, ap } = ready([hillGiant()]);
    s = settle(run(s, planCast(s, ap, hand[0]!)));
    expect(noted(s, journal)).toEqual(["Giant"]);
    s.objects[journal]!.zoneChanges = (s.objects[journal]!.zoneChanges ?? 0) + 2;
    expect(noted(s, journal)).toEqual([]);
  });
});
