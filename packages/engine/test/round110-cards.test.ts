// Round 110, the most played cards left: Urabrask // The Great Work (exile, then return transformed; chapter III casts
// instants and sorceries from any graveyard, exiled instead of going to a graveyard), Monster Manual // Zoological Study
// ("return a creature card milled this way").

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, scry, setup, target } from "./helpers";
import { altCostsFor, attackCost, mayPlayFromTop, botActions, characteristics, graveyardWays, isFullySupported, planActivate, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const urabrask = scry("transform", [
  {
    name: "Urabrask",
    mana_cost: "{2}{R}{R}",
    type_line: "Legendary Creature — Phyrexian Praetor",
    oracle_text:
      "First strike\nWhenever you cast an instant or sorcery spell, Urabrask deals 1 damage to target opponent. Add {R}.\n{R}: Exile Urabrask, then return it to the battlefield transformed under its owner's control. Activate only as a sorcery and only if you've cast three or more instant and/or sorcery spells this turn.",
    power: "4",
    toughness: "4",
  },
  {
    name: "The Great Work",
    type_line: "Enchantment — Saga",
    color_indicator: ["R"],
    oracle_text:
      "(As this Saga enters and after your draw step, add a lore counter.)\nI — This Saga deals 3 damage to target opponent and each creature they control.\nII — Create three Treasure tokens.\nIII — Until end of turn, you may cast instant and sorcery spells from any graveyard. If a spell cast this way would be put into a graveyard, exile it instead. Exile this Saga, then return it to the battlefield (front face up).",
  },
]);
const manual = scry("adventure", [
  { name: "Monster Manual", mana_cost: "{3}{G}", type_line: "Artifact — Book", oracle_text: "{1}{G}, {T}: You may put a creature card from your hand onto the battlefield." },
  {
    name: "Zoological Study",
    mana_cost: "{2}{G}",
    type_line: "Sorcery — Adventure",
    oracle_text: "Mill five cards, then return a creature card milled this way to your hand. (Then exile this card. You may cast the artifact later from exile.)",
  },
]);
const commandeer = card("Commandeer", "Instant", "{5}{U}{U}", {
  oracleText:
    "You may exile two blue cards from your hand rather than pay this spell's mana cost.\nGain control of target noncreature spell. You may choose new targets for it. (If that spell is an artifact, enchantment, or planeswalker, the permanent enters under your control.)",
});
const aethersnatch = card("Aethersnatch", "Instant", "{4}{U}{U}", { oracleText: "Gain control of target spell. You may choose new targets for it. (If that spell becomes a permanent, it enters under your control.)" });
const jill = scry("transform", [
  {
    name: "Jill, Shiva's Dominant",
    mana_cost: "{2}{U}",
    type_line: "Legendary Creature — Human Noble Warrior",
    oracle_text: "When Jill enters, return up to one other target nonland permanent to its owner's hand.\n{3}{U}{U}, {T}: Exile Jill, then return it to the battlefield transformed under its owner's control. Activate only as a sorcery.",
    power: "2",
    toughness: "2",
  },
  {
    name: "Shiva, Warden of Ice",
    type_line: "Legendary Enchantment Creature — Saga Elemental",
    color_indicator: ["U"],
    oracle_text:
      "(As this Saga enters and after your draw step, add a lore counter.)\nI, II — Mesmerize — Target creature can't be blocked this turn.\nIII — Cold Snap — Tap all lands your opponents control. Exile Shiva, then return it to the battlefield (front face up).",
    power: "4",
    toughness: "5",
  },
]);
const interrupter = card("Aven Interrupter", "Creature — Bird Rogue", "{1}{W}{W}", {
  power: "2",
  toughness: "2",
  keywords: ["Flying", "Plot", "Flash"],
  oracleText:
    "Flash\nFlying\nWhen this creature enters, exile target spell. It becomes plotted. (Its owner may cast it as a sorcery on a later turn without paying its mana cost.)\nSpells your opponents cast from graveyards or from exile cost {2} more to cast.",
});
const abundance = card("Abundance", "Enchantment", "{2}{G}{G}", {
  oracleText:
    "If you would draw a card, you may instead choose land or nonland and reveal cards from the top of your library until you reveal a card of the chosen kind. Put that card into your hand and put all other cards revealed this way on the bottom of your library in any order.",
});
const annex = card("Norn's Annex", "Artifact", "{3}{W/P}{W/P}", {
  oracleText: "({W/P} can be paid with either {W} or 2 life.)\nCreatures can't attack you or planeswalkers you control unless their controller pays {W/P} for each of those creatures.",
});
const surge = card("Wild Magic Surge", "Instant", "{2}{R}", {
  oracleText:
    "Destroy target permanent an opponent controls. Its controller reveals cards from the top of their library until they reveal a permanent card that shares a card type with that permanent. They put that card onto the battlefield and the rest on the bottom of their library in a random order.",
});
const polymorph = card("Polymorph", "Sorcery", "{3}{U}", {
  oracleText: "Destroy target creature. It can't be regenerated. Its controller reveals cards from the top of their library until they reveal a creature card. The player puts that card onto the battlefield, then shuffles all other cards revealed this way into their library.",
});
const transmogrify = card("Transmogrify", "Sorcery", "{3}{R}", {
  oracleText: "Exile target creature. That creature's controller reveals cards from the top of their library until they reveal a creature card. That player puts that card onto the battlefield, then shuffles the rest into their library.",
});
const sunbird = card("Sunbird's Invocation", "Enchantment", "{5}{R}", {
  oracleText:
    "Whenever you cast a spell from your hand, reveal the top X cards of your library, where X is that spell's mana value. You may cast a spell with mana value X or less from among cards revealed this way without paying its mana cost. Put the rest on the bottom of your library in a random order.",
});
const multiverse = card("One with the Multiverse", "Enchantment", "{6}{U}{U}", {
  oracleText:
    "You may look at the top card of your library any time.\nYou may play lands and cast spells from the top of your library.\nOnce during each of your turns, you may cast a spell from your hand or the top of your library without paying its mana cost.",
});
const drana = card("Drana and Linvala", "Legendary Creature — Vampire Angel", "{1}{W}{W}{B}", {
  power: "3",
  toughness: "4",
  keywords: ["Flying", "Vigilance"],
  oracleText:
    "Flying, vigilance\nActivated abilities of creatures your opponents control can't be activated.\nDrana and Linvala has all activated abilities of all creatures your opponents control. You may spend mana as though it were mana of any color to activate those abilities.",
});
const skull = card("Crystal Skull, Isu Spyglass", "Legendary Artifact", "{2}{U}{U}", {
  oracleText: "You may look at the top card of your library any time.\nYou may play historic lands and cast historic spells from the top of your library. (Artifacts, legendaries, and Sagas are historic.)\n{T}: Add {U}.",
});
// Test cards.
const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." });
const ponder = card("Test Ponder", "Sorcery", "{U}", { oracleText: "Draw a card." });
const relic = card("Test Relic", "Artifact", "{3}");
const blueA = card("Blue A", "Instant", "{U}", { oracleText: "Draw a card." });
const islandCard = card("Island", "Basic Land — Island");

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  if (!plan) throw new Error("no plan");
  return plan.reduce((x, a) => act(x, a), s);
};
/** Answer the trigger's target prompt, then let everything resolve. */
const answer = (s: GameState, pid: PlayerId, opp: PlayerId) => {
  for (let i = 0; i < 20 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: s.pending.player, targets: [{ kind: "player", id: opp }] });
    else if (s.pending) throw new Error(`pending ${s.pending.kind}`);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const toZone = (s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "library" | "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  return id;
};

describe("Urabrask // The Great Work", () => {
  it("after three instants and sorceries, {R} exiles it and returns it transformed: chapter I hits an opponent and their creatures", () => {
    supported(urabrask);
    const { s: s0, ap, ids } = setup([shock, shock, ponder]);
    let s = s0;
    const opp = next(s, ap);
    const u = putOnBattlefield(s, ap, urabrask);
    const bear = putOnBattlefield(s, opp, card("Opp Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "3" }));
    // Not yet: no spells cast this turn.
    expect(planActivate(s, ap, u, 0)).toBeNull();
    s = answer(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: next(s, opp) }])), ap, opp);
    s = answer(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: next(s, opp) }])), ap, opp);
    expect(planActivate(s, ap, u, 0)).toBeNull();
    s = answer(run(s, planCast(s, ap, ids[2]!)), ap, opp);
    // Each cast: 1 damage to the opponent (and {R}).
    expect(s.players[opp]!.life).toBe(37);
    s = run(s, planActivate(s, ap, u, 0));
    s = answer(s, ap, opp);
    const work = s.battlefield.find((id) => characteristics(s, s.objects[id]!).name === "The Great Work")!;
    expect(work).toBeDefined();
    expect(s.objects[work]!.counters.lore).toBe(1);
    expect(s.players[opp]!.life).toBe(34);
    expect(s.objects[bear]!.zone).toBe("graveyard");
  });

  it("chapter III: cast an instant from an opponent's graveyard, exiled instead; then it's Urabrask again", () => {
    const { s: s0, ap } = setup([]);
    let s = s0;
    const opp = next(s, ap);
    const theirs = toZone(s, opp, shock, "graveyard");
    const u = putOnBattlefield(s, ap, urabrask);
    s.objects[u]!.face = 1;
    s.objects[u]!.counters.lore = 2;
    // Not yet.
    expect(graveyardWays(s, s.objects[theirs]!, ap)).toEqual([]);
    s = passUntil(s, "main1", next(s, next(s, next(s, ap))));
    s = passUntil(s, "main1", ap);
    const zc = s.objects[u]!.zoneChanges ?? 0;
    s = settle(s);
    // Exiled and back, front face up: a new object (CR 400.7).
    expect(s.objects[u]!.zoneChanges).toBe(zc + 2);
    expect(characteristics(s, s.objects[u]!).name).toBe("Urabrask");
    expect(s.objects[u]!.face ?? 0).toBe(0);
    // The opponent's Test Shock, cast by us.
    expect(graveyardWays(s, s.objects[theirs]!, ap).map((g) => g.kind)).toEqual(["permission"]);
    expect(graveyardWays(s, s.objects[theirs]!, opp)).toEqual([]);
    const life = s.players[opp]!.life;
    s = run(s, planCast(s, ap, theirs, [{ kind: "player", id: opp }], undefined, "auto", undefined, { via: "permission" }));
    expect(s.stack.at(-1)?.controller).toBe(ap);
    s = answer(s, ap, opp);
    // 2 from the Shock, 1 from Urabrask's cast trigger.
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.objects[theirs]!.zone).toBe("exile");
  });
});

describe("Monster Manual // Zoological Study", () => {
  it("Zoological Study mills five and returns a creature card milled this way; then the Manual is cast from exile", () => {
    supported(manual);
    const { s: s0, ap, ids } = setup([manual]);
    let s = s0;
    const lib = s.players[ap]!.library;
    // The top five: four lands and a creature.
    const beast = card("Milled Beast", "Creature — Beast", "{2}{G}", { power: "3", toughness: "3" });
    const b = toZone(s, ap, beast, "library");
    const land = card("Forest", "Basic Land — Forest");
    for (let i = 0; i < 4; i++) toZone(s, ap, land, "library");
    expect(lib.indexOf(b)).toBe(4);
    s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { face: 1 })));
    // Not optional: the one creature card milled is the only choice.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", cards: [b], min: 1, max: 1, fromGraveyard: "hand" });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [b] }));
    expect(s.objects[b]!.zone).toBe("hand");
    expect(s.players[ap]!.graveyard.length).toBe(4);
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    const m = ids[0]!;
    expect(s.objects[m]!.zone).toBe("battlefield");
    // {1}{G}, {T}: put the Beast onto the battlefield.
    s = settle(run(s, planActivate(s, ap, m, 0)));
    if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    if (s.pending?.kind === "searchLibrary") s = settle(act(s, { type: "searchLibrary", player: ap, found: [b] }));
    expect(s.objects[b]!.zone).toBe("battlefield");
  });
});

describe("Commandeer, Aethersnatch", () => {
  it("Commandeer takes an opponent's artifact spell: it enters under your control", () => {
    supported(commandeer, aethersnatch);
    const { s: s0, ap, ids } = setup([relic]);
    let s = s0;
    const opp = next(s, ap);
    const c = toZone(s, opp, commandeer, "hand");
    for (let i = 0; i < 7; i++) putOnBattlefield(s, opp, islandCard);
    s = run(s, planCast(s, ap, ids[0]!));
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    const spell = s.stack.at(-1)!;
    s = run(s, planCast(s, opp, c, [{ kind: "stack", id: spell.id }]));
    s = settle(s);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(characteristics(s, s.objects[ids[0]!]!).controller ?? s.objects[ids[0]!]!.controller).toBe(opp);
  });

  it("paid by exiling two blue cards; an instant taken over gets new targets and goes to its owner's graveyard", () => {
    const { s: s0, ap, ids } = setup([shock]);
    let s = s0;
    const opp = next(s, ap);
    const c = toZone(s, opp, commandeer, "hand");
    const [b1, b2] = [toZone(s, opp, blueA, "hand"), toZone(s, opp, blueA, "hand")];
    const mine = putOnBattlefield(s, ap, card("My Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    const theirs = putOnBattlefield(s, opp, card("Their Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    s = run(s, planCast(s, ap, ids[0]!, [target(theirs)]));
    s = act(s, { type: "passPriority", player: ap });
    const spell = s.stack.at(-1)!;
    const plan = planCast(s, opp, c, [{ kind: "stack", id: spell.id }], undefined, "auto", undefined, { alt: "alternative", exileFromHand: [b1, b2] });
    expect(plan).not.toBeNull();
    s = run(s, plan);
    expect(s.objects[b1]!.zone).toBe("exile");
    expect(s.objects[b2]!.zone).toBe("exile");
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "newTargets", player: opp });
    s = act(s, { type: "newTargets", player: opp, targets: [target(mine)] });
    expect(s.stack.at(-1)!.controller).toBe(opp);
    s = settle(s);
    expect(s.objects[mine]!.zone).toBe("graveyard");
    expect(s.objects[theirs]!.zone).toBe("battlefield");
    expect(s.players[ap]!.graveyard).toContain(ids[0]);
  });
});

describe("Jill, Shiva's Dominant", () => {
  it("{3}{U}{U}, {T}: exile and return transformed; at chapter III it taps opponents' lands and comes back as Jill", () => {
    supported(jill);
    const { s: s0, ap } = setup([]);
    let s = s0;
    const j = putOnBattlefield(s, ap, jill);
    s = settle(run(s, planActivate(s, ap, j, 0)));
    // Chapter I targets a creature: Shiva itself.
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(j)] }));
    expect(characteristics(s, s.objects[j]!).name).toBe("Shiva, Warden of Ice");
    expect(s.objects[j]!.counters.lore).toBe(1);
    s.objects[j]!.counters.lore = 2;
    const opp = next(s, ap);
    const oppLand = putOnBattlefield(s, opp, islandCard);
    s = passUntil(s, "main1", next(s, next(s, next(s, ap))));
    s = passUntil(s, "draw", ap);
    s = passUntil(s, "main1", ap);
    s = settle(s);
    expect(s.objects[oppLand]!.tapped).toBe(true);
    expect(characteristics(s, s.objects[j]!).name).toBe("Jill, Shiva's Dominant");
  });
});

describe("Aven Interrupter", () => {
  it("exiles a spell, which becomes plotted: its owner casts it on a later turn for {0}, plus {2} for the Interrupter", () => {
    supported(interrupter);
    const { s: s0, ap, ids } = setup([relic]);
    let s = s0;
    const opp = next(s, ap);
    const av = toZone(s, opp, interrupter, "hand");
    for (let i = 0; i < 3; i++) putOnBattlefield(s, opp, card("Plains", "Basic Land — Plains"));
    s = run(s, planCast(s, ap, ids[0]!));
    s = act(s, { type: "passPriority", player: ap });
    const spell = s.stack.at(-1)!;
    s = run(s, planCast(s, opp, av));
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: opp, targets: [{ kind: "stack", id: spell.id }] }));
    const r = s.objects[ids[0]!]!;
    expect(r.zone).toBe("exile");
    expect(r.mayPlay).toMatchObject({ player: ap, until: "plot" });
    // Not this turn (CR 702.170d).
    expect(planCast(s, ap, ids[0]!)).toBeNull();
    s = passUntil(s, "main1", next(s, next(s, next(s, ap))));
    s = passUntil(s, "main1", ap);
    // Free, but {2} more for a spell an opponent of the Interrupter's controller casts from exile.
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap) s.objects[id]!.tapped = true;
    expect(planCast(s, ap, ids[0]!)).toBeNull();
    for (const id of s.battlefield.filter((x) => s.objects[x]!.controller === ap).slice(0, 2)) s.objects[id]!.tapped = false;
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
  });
});

describe("Abundance", () => {
  const draw2 = card("Test Divination", "Sorcery", "{0}", { oracleText: "Draw two cards." });
  const spellA = card("Spell A", "Sorcery", "{1}");
  const spellB = card("Spell B", "Sorcery", "{2}");
  const land = card("Test Wastes", "Land");
  /** Abundance in play, `top` on top of the library (first = top), and a draw spell in hand. */
  const table = (top: CardDef[], spell = draw2) => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, abundance);
    const ids = [...top].reverse().map((d) => toZone(s, ap, d, "library")).reverse();
    return { s, ap, ids, spell: toZone(s, ap, spell, "hand") };
  };

  it("replaces each draw separately: reveal until a land, the others go to the bottom in your order, then the next draw", () => {
    supported(abundance);
    const { s: s0, ap, ids, spell } = table([spellA, spellB, land, spellA]);
    const [a, b, l, a2] = ids as [string, string, string, string];
    let s = settle(run(s0, planCast(s0, ap, spell)));
    expect(s.pending).toMatchObject({ kind: "dredge", player: ap, abundance: "Abundance", left: 2 });
    s = act(s, { type: "dredge", player: ap, abundance: "land" });
    expect(s.objects[l]!.zone).toBe("hand");
    // Put into the hand, not drawn (rulings).
    expect(s.objects[l]!.drawn).toBeUndefined();
    expect(s.pending).toMatchObject({ kind: "orderLibrary", player: ap, bottom: true, cards: [a, b] });
    s = act(s, { type: "orderLibrary", player: ap, order: [b, a] });
    expect(s.players[ap]!.library.slice(-2)).toEqual([b, a]);
    // The second draw: draw it normally.
    expect(s.pending).toMatchObject({ kind: "dredge", player: ap, left: 1 });
    s = settle(act(s, { type: "dredge", player: ap }));
    expect(s.objects[a2]!.zone).toBe("hand");
    expect(s.objects[spell]!.zone).toBe("graveyard");
    expect(s.pending).toBeNull();
  });

  it("nonland: the first card is already one, so nothing to order", () => {
    const { s: s0, ap, ids, spell } = table([spellA, land], card("Test Opt", "Instant", "{0}", { oracleText: "Draw a card." }));
    let s = settle(run(s0, planCast(s0, ap, spell)));
    s = settle(act(s, { type: "dredge", player: ap, abundance: "nonland" }));
    expect(s.objects[ids[0]!]!.zone).toBe("hand");
    expect(s.players[ap]!.library[0]).toBe(ids[1]);
    expect(s.pending).toBeNull();
  });

  it("with an empty library it saves you from losing: there's no draw (rulings)", () => {
    const { s: s0, ap, spell } = table([], card("Test Opt", "Instant", "{0}", { oracleText: "Draw a card." }));
    for (const id of s0.players[ap]!.library) s0.objects[id]!.zone = "exile";
    s0.players[ap]!.exile.push(...s0.players[ap]!.library);
    s0.players[ap]!.library = [];
    let s = settle(run(s0, planCast(s0, ap, spell)));
    expect(s.pending).toMatchObject({ kind: "dredge", abundance: "Abundance" });
    s = settle(act(s, { type: "dredge", player: ap, abundance: "land" }));
    s = passUntil(s, "main1", next(s, ap));
    expect(s.players[ap]!.lost).toBeFalsy();
  });

  it("a bot short of lands reveals until a land, otherwise until a nonland card", () => {
    const { s: s0, ap, spell } = table([spellA, land], card("Test Opt", "Instant", "{0}", { oracleText: "Draw a card." }));
    const s = settle(run(s0, planCast(s0, ap, spell)));
    const isLand = (id: string) => s.cards[s.objects[id]!.cardId]!.typeLine.includes("Land");
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap && isLand(id));
    expect(lands.length).toBeGreaterThanOrEqual(5);
    expect(botActions(s, ap)).toEqual([{ type: "dredge", player: ap, abundance: "nonland" }]);
    for (const id of lands.slice(2)) s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.players[ap]!.hand = s.players[ap]!.hand.filter((id) => !isLand(id));
    expect(botActions(s, ap)).toEqual([{ type: "dredge", player: ap, abundance: "land" }]);
  });
});

describe("Norn's Annex", () => {
  const bears = (s: GameState, pid: PlayerId, n: number) => Array.from({ length: n }, (_, i) => putOnBattlefield(s, pid, card(`Bear ${i}`, "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" })));

  it("{W/P} for each creature attacking its controller or their planeswalker: {W} from the pool, otherwise 2 life (CR 107.4f, 508.1g-h)", () => {
    supported(annex);
    const { s: s0, ap } = setup([]);
    const opp = next(s0, ap);
    const third = next(s0, opp);
    putOnBattlefield(s0, opp, annex);
    const pw = putOnBattlefield(s0, opp, card("Test Walker", "Legendary Planeswalker — Test", "{3}", { loyalty: "5" }));
    s0.objects[pw]!.counters.loyalty = 5;
    const [b1, b2, b3, b4] = bears(s0, ap, 4) as [string, string, string, string];
    let s = passUntil(s0, "declareAttackers", ap);
    const attacks = [
      { attacker: b1, defender: opp },
      { attacker: b2, defender: opp, planeswalker: pw },
      { attacker: b3, defender: opp },
      { attacker: b4, defender: third },
    ];
    expect(attackCost(s, attacks)).toBe("{W/P}{W/P}{W/P}");
    // One {W} floating: it pays one symbol, life pays the other two.
    s.players[ap]!.manaPool.W = 1;
    const life = s.players[ap]!.life;
    s = act(s, { type: "declareAttackers", player: ap, attacks });
    expect(s.players[ap]!.life).toBe(life - 4);
    expect(s.players[ap]!.manaPool.W).toBe(0);
    expect(s.objects[b2]!.attacking).toBe(opp);
  });

  it("can't be paid with life you don't have (CR 119.4)", () => {
    const { s: s0, ap } = setup([]);
    const opp = next(s0, ap);
    putOnBattlefield(s0, opp, annex);
    const [b1, b2] = bears(s0, ap, 2) as [string, string];
    const s = passUntil(s0, "declareAttackers", ap);
    s.players[ap]!.life = 3;
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b1, defender: opp }, { attacker: b2, defender: opp }] })).toThrow(/costs \{W\/P\}\{W\/P\}/);
  });

  it("a bot pays life while it has plenty, and sends its creatures elsewhere when low", () => {
    const { s: s0, ap } = setup([]);
    for (const p of s0.turnOrder.filter((x) => x !== ap)) putOnBattlefield(s0, p, annex);
    bears(s0, ap, 3);
    const s = passUntil(s0, "declareAttackers", ap);
    const decl = (st: GameState) => botActions(st, ap).at(-1) as Extract<ReturnType<typeof botActions>[number], { type: "declareAttackers" }>;
    expect(decl(s).attacks.length).toBeGreaterThan(0);
    s.players[ap]!.life = 11;
    expect(decl(s).attacks).toEqual([]);
  });
});

describe("Wild Magic Surge, Polymorph, Transmogrify", () => {
  const relicA = card("Relic A", "Artifact", "{2}");
  const shrine = card("Test Shrine", "Enchantment", "{2}");
  const aura = card("Test Aura", "Enchantment — Aura", "{W}", { oracleText: "Enchant creature\nEnchanted creature gets +1/+1." });
  const giant = card("Test Giant", "Creature — Giant", "{4}", { power: "4", toughness: "4" });
  const sorcery = card("Test Sorcery", "Sorcery", "{1}");
  /** `top` on top of `pid`'s library (first = top). */
  const stack = (s: GameState, pid: PlayerId, top: CardDef[]) => [...top].reverse().map((d) => toZone(s, pid, d, "library")).reverse();

  it("Wild Magic Surge destroys an enchantment; its controller reveals until a permanent card sharing a type, which enters under their control", () => {
    supported(surge, polymorph, transmogrify);
    const { s: s0, ap, ids } = setup([surge]);
    const opp = next(s0, ap);
    const ench = putOnBattlefield(s0, opp, shrine);
    const [g, so, sh, r] = stack(s0, opp, [giant, sorcery, shrine, relicA]) as [string, string, string, string];
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: ench }])));
    expect(s.objects[ench]!.zone).toBe("graveyard");
    expect(s.objects[sh]!.zone).toBe("battlefield");
    expect(s.objects[sh]!.controller).toBe(opp);
    // The creature and the sorcery go to the bottom; the relic stays on top.
    expect(s.players[opp]!.library[0]).toBe(r);
    expect(new Set(s.players[opp]!.library.slice(-2))).toEqual(new Set([g, so]));
  });

  it("an artifact creature shares either type; an Aura found asks its controller what it enchants (CR 303.4f)", () => {
    const { s: s0, ap, ids } = setup([surge, surge]);
    const opp = next(s0, ap);
    const golem = putOnBattlefield(s0, opp, card("Test Golem", "Artifact Creature — Golem", "{3}", { power: "3", toughness: "3" }));
    const [so, rel] = stack(s0, opp, [sorcery, relicA]) as [string, string];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: golem }])));
    expect(s.objects[rel]!.zone).toBe("battlefield");
    expect(s.objects[so]!.zone).toBe("library");
    // An enchantment destroyed, and an Aura revealed: its new controller picks a creature for it.
    const ench = putOnBattlefield(s, opp, shrine);
    const bearA = putOnBattlefield(s, opp, card("Opp Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    putOnBattlefield(s, ap, card("My Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    const [au] = stack(s, opp, [aura]) as [string];
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: ench }]));
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "enchant" });
    s = settle(act(s, { type: "chooseOption", player: opp, choice: bearA }));
    expect(s.objects[au]!.zone).toBe("battlefield");
    expect(s.objects[au]!.attachedTo).toBe(bearA);
  });

  it("Polymorph: an indestructible creature isn't destroyed, but its controller still reveals; with no creature card, they shuffle (rulings)", () => {
    const { s: s0, ap, ids } = setup([polymorph, transmogrify]);
    const opp = next(s0, ap);
    const tough = putOnBattlefield(s0, opp, card("Tough", "Creature — Golem", "{3}", { power: "1", toughness: "1", keywords: ["Indestructible"], oracleText: "Indestructible" }));
    const [r, g] = stack(s0, opp, [relicA, giant]) as [string, string];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: tough }])));
    expect(s.objects[tough]!.zone).toBe("battlefield");
    expect(s.objects[g]!.zone).toBe("battlefield");
    expect(s.objects[r]!.zone).toBe("library");
    // Transmogrify with no creature card left in the library: exiled, everything revealed, then a shuffle.
    s.players[opp]!.library = s.players[opp]!.library.filter((id) => !s.cards[s.objects[id]!.cardId]!.typeLine.includes("Creature"));
    const n = s.players[opp]!.library.length;
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: g }])));
    expect(s.objects[g]!.zone).toBe("exile");
    expect(s.players[opp]!.library).toHaveLength(n);
    expect(s.log.some((l) => /shuffles their library/.test(l.text))).toBe(true);
  });
});

describe("Sunbird's Invocation", () => {
  const spellOf = (name: string, cost: string) => card(name, "Sorcery", cost, { oracleText: "Draw a card." });
  const stack = (s: GameState, pid: PlayerId, top: CardDef[]) => [...top].reverse().map((d) => toZone(s, pid, d, "library")).reverse();

  it("casting a 3-drop from hand reveals three: cast one with mana value 3 or less from the library, free; the rest to the bottom", () => {
    supported(sunbird);
    const { s: s0, ap, ids } = setup([spellOf("Three Drop", "{2}{R}")]);
    putOnBattlefield(s0, ap, sunbird);
    const [cheap, big, land] = stack(s0, ap, [spellOf("Cheap Spell", "{1}{R}"), spellOf("Big Spell", "{4}{R}"), card("Forest", "Basic Land — Forest")]) as [string, string, string];
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", options: [cheap, "none"] });
    expect(s.objects[cheap]!.zone).toBe("library");
    s = act(s, { type: "chooseOption", player: ap, choice: cheap });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: cheap });
    s = run(s, planCast(s, ap, cheap));
    expect(s.objects[cheap]!.zone).toBe("stack");
    // Above the spell that triggered it (rulings).
    expect(s.stack.map((x) => x.description)).toEqual(["Three Drop", "Cheap Spell"]);
    expect(s.players[ap]!.library.slice(-2).sort()).toEqual([big, land].sort());
  });

  it("a spell with mana value 0 reveals nothing (rulings)", () => {
    const { s: s0, ap, ids } = setup([spellOf("Free Spell", "{0}")]);
    putOnBattlefield(s0, ap, sunbird);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 10 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toBeNull();
    expect(s.log.some((l) => /reveals nothing/.test(l.text))).toBe(true);
  });
});

describe("One with the Multiverse", () => {
  it("once during each of your turns, a spell from your hand or the top of your library without paying its mana cost", () => {
    supported(multiverse);
    const big = card("Big Sorcery", "Sorcery", "{7}{U}", { oracleText: "Draw a card." });
    const { s: s0, ap, ids } = setup([big, big]);
    putOnBattlefield(s0, ap, multiverse);
    const top = toZone(s0, ap, card("Top Sorcery", "Sorcery", "{6}", { oracleText: "Draw a card." }), "library");
    const o = (s: GameState, id: string) => s.objects[id]!;
    expect(altCostsFor(s0, ap, o(s0, ids[0]!)).some((a) => a.kind === "payZero")).toBe(true);
    // The top card counts too, while it's on top.
    expect(altCostsFor(s0, ap, o(s0, top)).some((a) => a.kind === "payZero")).toBe(true);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "payZero" })));
    expect(o(s, ids[0]!).zone).toBe("graveyard");
    // Used for this turn.
    expect(altCostsFor(s, ap, o(s, ids[1]!)).some((a) => a.kind === "payZero")).toBe(false);
    // Not during another player's turn.
    s = passUntil(s, "main1", next(s, ap));
    expect(altCostsFor(s, ap, o(s, ids[1]!)).some((a) => a.kind === "payZero")).toBe(false);
    s = passUntil(s, "main1", ap);
    const nowTop = toZone(s, ap, card("Next Sorcery", "Sorcery", "{5}", { oracleText: "Draw a card." }), "library");
    expect(altCostsFor(s, ap, o(s, nowTop)).some((a) => a.kind === "payZero")).toBe(true);
    // Only the top one.
    const second = toZone(s, ap, card("Second Sorcery", "Sorcery", "{5}", { oracleText: "Draw a card." }), "library");
    expect(altCostsFor(s, ap, o(s, nowTop)).some((a) => a.kind === "payZero")).toBe(false);
    s = settle(run(s, planCast(s, ap, second, undefined, undefined, "auto", undefined, { alt: "payZero" })));
    expect(o(s, second).zone).toBe("graveyard");
  });
});

describe("Drana and Linvala", () => {
  it("has the activated abilities of opponents' creatures, which they can't activate, paid with mana of any color", () => {
    supported(drana);
    const { s: s0, ap } = setup([]);
    const opp = next(s0, ap);
    const pinger = putOnBattlefield(s0, opp, card("Test Pinger", "Creature — Human Wizard", "{2}{R}", { power: "1", toughness: "1", oracleText: "{R}, {T}: This creature deals 1 damage to any target." }));
    const dl = putOnBattlefield(s0, ap, drana);
    // Its own abilities can't be activated now (CR 602.5), Drana and Linvala's copy of it can.
    expect(planActivate(s0, opp, pinger, 0)).toBeNull();
    // With only {W} to pay {R}: mana of any color.
    s0.players[ap]!.manaPool.W = 1;
    const life = s0.players[opp]!.life;
    let s = run(s0, planActivate(s0, ap, dl, 0, [{ kind: "player", id: opp }]));
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 1);
    expect(s.objects[dl]!.tapped).toBe(true);
    expect(s.players[ap]!.manaPool.W).toBe(0);
    // A spell isn't paid that way: only "those abilities".
    s.players[ap]!.manaPool.W = 1;
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap) s.objects[id]!.tapped = true;
    const shockId = toZone(s, ap, shock, "hand");
    expect(planCast(s, ap, shockId, [{ kind: "player", id: opp }])).toBeNull();
  });
});

describe("Crystal Skull, Isu Spyglass", () => {
  it("historic lands and historic spells from the top of your library, nothing else", () => {
    supported(skull);
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, skull);
    const check = (d: CardDef) => {
      const s = structuredClone(s0);
      const id = toZone(s, ap, d, "library");
      return mayPlayFromTop(s, s.objects[id]!, ap);
    };
    expect(check(card("Legendary Land", "Legendary Land", ""))).toBe(true);
    expect(check(card("Forest", "Basic Land — Forest"))).toBe(false);
    expect(check(card("Test Relic", "Artifact", "{1}"))).toBe(true);
    expect(check(card("Test Saga", "Enchantment — Saga", "{1}", { oracleText: "I — Draw a card." }))).toBe(true);
    expect(check(card("Test Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }))).toBe(false);
  });
});

void target;
