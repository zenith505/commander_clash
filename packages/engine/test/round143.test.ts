// Round 143: the most played cards, in popularity order, starting with The Irencrag.

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { abilitiesOf, botActions, characteristics, invalidateCharacteristics, isFullySupported, moveObject, planActivate, planCast, power, toughness, turnFaceUpProblem, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
const abilityIndex = (s: GameState, id: string, start: string) => {
  const i = abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => a.text.startsWith(start));
  if (i < 0) throw new Error(`no ability "${start}"`);
  return i;
};
/** Everyone passes until the stack is empty or something asks a player to choose. */
const resolveAll = (s: GameState) => {
  for (let i = 0; i < 40 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

/** A card put straight into a zone, not from the battlefield. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const nextOf = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;

/** Attack `defender` with `attackers`, nobody blocks, through combat damage (stops at a choice). */
function swing(s: GameState, ap: PlayerId, defender: PlayerId, attackers: string[]) {
  s = passUntil(s, "declareAttackers", ap);
  s = act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((a) => ({ attacker: a, defender })) });
  for (let i = 0; i < 60 && s.step !== "main2" && !(s.pending && s.pending.kind !== "declareBlockers"); i++) {
    const p = s.pending;
    s = act(s, p?.kind === "declareBlockers" ? { type: "declareBlockers", player: p.player, blocks: [] } : { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
}

// Real oracle text (Scryfall).
const irencrag = card("The Irencrag", "Legendary Artifact", "{2}", { oracleText: "{T}: Add {C}.\nWhenever a legendary creature you control enters, you may have The Irencrag become a legendary Equipment artifact named Everflame, Heroes' Legacy. If you do, it gains equip {3} and \"Equipped creature gets +3/+3\" and loses all other abilities." });
const scream = card("Unable to Scream", "Enchantment — Aura", "{U}", { keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature loses all abilities and is a Toy artifact creature with base power and toughness 0/2 in addition to its other types.\nAs long as enchanted creature is face down, it can't be turned face up." });
const morphling = card("Test Morphling", "Creature — Shapeshifter", "{U}", { power: "3", toughness: "3", keywords: ["Morph"], oracleText: "Morph {U} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)" });
const kefka = card("Kefka, Dancing Mad", "Legendary Creature — Human Wizard", "{5}{B}{R}", { power: "6", toughness: "6", oracleText: "During your turn, Kefka has indestructible.\nAt the beginning of your end step, exile a card at random from each opponent's graveyard. You may cast any number of spells from among cards exiled this way without paying their mana costs. Then each player who owns a spell you cast this way loses life equal to its mana value." });
const brain = card("Elder Brain", "Creature — Horror", "{5}{B}{B}", { power: "6", toughness: "6", keywords: ["Menace"], oracleText: "Menace\nWhenever this creature attacks a player, exile all cards from that player's hand, then they draw that many cards. You may play lands and cast spells from among the exiled cards for as long as they remain exiled. If you cast a spell this way, you may spend mana as though it were mana of any color to cast it." });
const legend = card("Test Legend", "Legendary Creature — Human Knight", "{1}{G}", { power: "2", toughness: "2" });

describe("The Irencrag", () => {
  it("is fully supported; becomes Everflame, Heroes' Legacy, an Equipment with equip {3} and +3/+3 and nothing else", () => {
    supported(irencrag);
    const { s: s0, ap, ids } = setup([legend]);
    const crag = putOnBattlefield(s0, ap, irencrag);
    expect(abilitiesOf(s0, s0.objects[crag]!).mana.length).toBe(1);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending?.kind).toBe("chooseMay");
    s = resolveAll(act(s, { type: "chooseMay", player: ap, yes: true }));
    const c = characteristics(s, s.objects[crag]!);
    expect(c.name).toBe("Everflame, Heroes' Legacy");
    expect(c.types).toEqual(["Artifact"]);
    expect(c.subtypes).toEqual(["Equipment"]);
    expect(c.supertypes).toContain("Legendary");
    // Its mana ability and its trigger are gone (rulings: for as long as it stays on the battlefield).
    expect(abilitiesOf(s, s.objects[crag]!).mana.length).toBe(0);
    expect(abilitiesOf(s, s.objects[crag]!).triggers.length).toBe(0);
    // Equip {3} onto the legend: +3/+3.
    const lg = s.battlefield.find((id) => characteristics(s, s.objects[id]!).name === "Test Legend")!;
    s = resolveAll(run(s, planActivate(s, ap, crag, abilityIndex(s, crag, "Equip"), [{ kind: "object", id: lg }])));
    expect(s.objects[crag]!.attachedTo).toBe(lg);
    expect([power(s, s.objects[lg]!), toughness(s, s.objects[lg]!)]).toEqual([5, 5]);
  });

  it("declined, it stays The Irencrag; a nonlegendary creature doesn't trigger it", () => {
    const { s: s0, ap, ids } = setup([legend, bear()]);
    const crag = putOnBattlefield(s0, ap, irencrag);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[1]!)));
    expect(s.pending).toBeNull();
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    s = resolveAll(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(characteristics(s, s.objects[crag]!).name).toBe("The Irencrag");
    expect(abilitiesOf(s, s.objects[crag]!).mana.length).toBe(1);
    // A second legend: it triggers again.
    const other = putOnBattlefield(s, ap, card("Other Legend", "Legendary Creature — Elf", "{G}", { power: "1", toughness: "1" }));
    s.battlefield.splice(s.battlefield.indexOf(other), 1);
    s.objects[other]!.zone = "hand";
    s.players[ap]!.hand.push(other);
    invalidateCharacteristics(s);
    s = resolveAll(run(s, planCast(s, ap, other)));
    expect(s.pending?.kind).toBe("chooseMay");
  });
});

describe("Unable to Scream", () => {
  it("is fully supported; the enchanted face-down creature is a 0/2 Toy artifact that can't be turned face up", () => {
    supported(scream, morphling);
    const { s: s0, ap, ids } = setup([morphling, scream]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { faceDown: true })));
    const fd = ids[0]!;
    expect(s.objects[fd]!.faceDown).toBe("morph");
    expect(turnFaceUpProblem(s, ap, fd)).toMatch(/not enough mana/);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: fd }])));
    expect(s.objects[ids[1]!]!.attachedTo).toBe(fd);
    const c = characteristics(s, s.objects[fd]!);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(c.subtypes).toContain("Toy");
    expect([c.power, c.toughness]).toEqual([0, 2]);
    expect(turnFaceUpProblem(s, ap, fd)).toBe("it can't be turned face up");
    // The Aura gone, it can be again.
    s.objects[ids[1]!]!.attachedTo = undefined;
    invalidateCharacteristics(s);
    expect(turnFaceUpProblem(s, ap, fd)).toMatch(/not enough mana/);
  });
});

describe("Kefka, Dancing Mad", () => {
  const divination = card("Test Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
  const blaze = card("Test Blaze", "Sorcery", "{X}{R}", { oracleText: "Test Blaze deals X damage to any target." });

  it("is fully supported; one card at random from each opponent's graveyard, cast free, and its owner loses its mana value", () => {
    supported(kefka);
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, kefka);
    const [o1, o2, o3] = [nextOf(s0, ap), nextOf(s0, nextOf(s0, ap)), nextOf(s0, nextOf(s0, nextOf(s0, ap)))];
    const div = into(s0, o1, divination, "graveyard");
    const bl = into(s0, o2, blaze, "graveyard");
    // o3's graveyard is empty.
    expect(s0.players[o3]!.graveyard.length).toBe(0);
    const hand = s0.players[ap]!.hand.length;
    const life = [o1, o2].map((p) => s0.players[p]!.life);
    let s = passUntil(s0, "end", ap);
    s = resolveAll(s);
    expect(s.objects[div]!.zone).toBe("exile");
    expect(s.objects[bl]!.zone).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", player: ap });
    s = act(s, { type: "chooseOption", player: ap, choice: div });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: div });
    s = run(s, planCast(s, ap, div));
    expect(s.objects[div]!.zone).toBe("stack");
    // The Blaze, X is 0 (rulings), so its mana value is 1: cast it at o2, its owner, who loses 1 for it.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong" });
    s = act(s, { type: "chooseOption", player: ap, choice: bl });
    s = run(s, planCast(s, ap, bl, [{ kind: "player", id: o2 }]));
    s = resolveAll(s);
    expect(s.players[o1]!.life).toBe(life[0]! - 3);
    expect(s.players[o2]!.life).toBe(life[1]! - 1);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    // Each spell goes to its owner's graveyard.
    expect(s.objects[div]!.zone).toBe("graveyard");
    expect(s.players[o1]!.graveyard).toContain(div);
  });

  it("a card not cast stays exiled, and nobody loses life", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, kefka);
    const o1 = nextOf(s0, ap);
    const div = into(s0, o1, divination, "graveyard");
    let s = resolveAll(passUntil(s0, "end", ap));
    const life = s.players[o1]!.life;
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: "none" }));
    expect(s.objects[div]!.zone).toBe("exile");
    expect(s.players[o1]!.life).toBe(life);
  });
});

describe("Elder Brain", () => {
  const divination = card("Test Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
  const wastes = card("Test Wastes", "Basic Land", "", { oracleText: "{T}: Add {C}." });

  it("is fully supported; exiles the attacked player's hand, they draw that many, and you may play those cards with any mana", () => {
    supported(brain);
    const { s: s0, ap } = setup([]);
    const eb = putOnBattlefield(s0, ap, brain);
    const opp = nextOf(s0, ap);
    for (const id of [...s0.players[opp]!.hand]) {
      s0.players[opp]!.hand.splice(s0.players[opp]!.hand.indexOf(id), 1);
      s0.players[opp]!.library.push(id);
      s0.objects[id]!.zone = "library";
    }
    const div = into(s0, opp, divination, "hand");
    const land = into(s0, opp, wastes, "hand");
    const lib = s0.players[opp]!.library.length;
    let s = swing(s0, ap, opp, [eb]);
    expect(s.objects[div]!.zone).toBe("exile");
    expect(s.objects[land]!.zone).toBe("exile");
    expect(s.players[opp]!.hand.length).toBe(2);
    expect(s.players[opp]!.library.length).toBe(lib - 2);
    expect(s.objects[div]!.mayPlay).toMatchObject({ player: ap, until: "exiled", anyType: true });
    s = passUntil(s, "main2", ap);
    // A land played as your land play; the sorcery cast with any mana.
    s = act(s, { type: "playLand", player: ap, objectId: land });
    expect(s.objects[land]!.zone).toBe("battlefield");
    s = resolveAll(run(s, planCast(s, ap, div)));
    expect(s.objects[div]!.zone).toBe("graveyard");
    expect(s.players[opp]!.graveyard).toContain(div);
  });

  it("an empty hand: nothing exiled, nothing drawn", () => {
    const { s: s0, ap } = setup([]);
    const eb = putOnBattlefield(s0, ap, brain);
    const opp = nextOf(s0, ap);
    for (const id of [...s0.players[opp]!.hand]) {
      s0.players[opp]!.hand.splice(s0.players[opp]!.hand.indexOf(id), 1);
      s0.players[opp]!.library.push(id);
      s0.objects[id]!.zone = "library";
    }
    const lib = s0.players[opp]!.library.length;
    const s = swing(s0, ap, opp, [eb]);
    expect(s.players[opp]!.hand.length).toBe(0);
    expect(s.players[opp]!.library.length).toBe(lib);
  });
});

describe("Search for Azcanta", () => {
  const azcanta = scry("transform", [
    { name: "Search for Azcanta", mana_cost: "{1}{U}", type_line: "Legendary Enchantment", oracle_text: "At the beginning of your upkeep, surveil 1. Then if you have seven or more cards in your graveyard, you may transform Search for Azcanta. (Look at the top card of your library. You may put that card into your graveyard.)" },
    { name: "Azcanta, the Sunken Ruin", type_line: "Legendary Land", oracle_text: "(Transforms from Search for Azcanta.)\n{T}: Add {U}.\n{2}{U}, {T}: Look at the top four cards of your library. You may reveal a noncreature, nonland card from among them and put it into your hand. Put the rest on the bottom of your library in any order." },
  ]);
  const upkeep = (yard: number, mill: boolean) => {
    const { s: s0, ap } = setup([]);
    const az = putOnBattlefield(s0, ap, azcanta);
    // To the active player's next upkeep (everyone else's turns pass); the trigger is waiting on the stack.
    let s = passUntil(s0, "end", ap);
    s = passUntil(s, "upkeep", ap);
    // Exactly `yard` cards in the graveyard as it resolves.
    for (const id of s.players[ap]!.graveyard.splice(0)) (s.objects[id]!.zone = "exile"), s.players[ap]!.exile.push(id);
    for (let i = 0; i < yard; i++) into(s, ap, bear({ name: `Test Dead Bear ${i}` }), "graveyard");
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "surveil", player: ap });
    const top = (s.pending as { cards: string[] }).cards;
    s = resolveAll(act(s, { type: "arrangeTop", player: ap, top: mill ? [] : top, away: mill ? top : [] }));
    return { s, ap, az };
  };

  it("is fully supported; surveils, then with seven cards in the graveyard it may transform into the land", () => {
    expect(isFullySupported(azcanta)).toBe(true);
    let { s, ap, az } = upkeep(6, true);
    expect(s.pending?.kind).toBe("chooseMay");
    s = resolveAll(act(s, { type: "chooseMay", player: ap, yes: true }));
    const c = characteristics(s, s.objects[az]!);
    expect(c.name).toBe("Azcanta, the Sunken Ruin");
    expect(c.types).toEqual(["Land"]);
  });

  it("with fewer than seven, it doesn't ask; seven already there, it asks even without milling (rulings)", () => {
    const few = upkeep(5, true);
    expect(few.s.pending).toBeNull();
    expect(characteristics(few.s, few.s.objects[few.az]!).name).toBe("Search for Azcanta");
    const kept = upkeep(7, false);
    expect(kept.s.pending?.kind).toBe("chooseMay");
  });
});

describe("Vesuvan Duplimancy", () => {
  const duplimancy = card("Vesuvan Duplimancy", "Enchantment", "{3}{U}", { oracleText: "Whenever you cast a spell that targets only a single artifact or creature you control, create a token that's a copy of that artifact or creature, except it's not legendary." });
  const growth = card("Test Growth", "Instant", "{G}", { oracleText: "Target creature gets +3/+3 until end of turn." });
  const bounce = card("Test Unsummon", "Instant", "{U}", { oracleText: "Return target creature to its owner's hand." });
  const twin = card("Test Twin Bolt", "Instant", "{R}", { oracleText: "Test Twin Bolt deals 1 damage to each of up to two targets." });
  const tokens = (s: GameState, ap: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).name === name);

  it("is fully supported; a spell targeting only your legendary creature makes a nonlegendary token copy of it", () => {
    supported(duplimancy, growth);
    const { s: s0, ap, ids } = setup([growth]);
    putOnBattlefield(s0, ap, duplimancy);
    const lg = putOnBattlefield(s0, ap, legend);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: lg }])));
    const [tok] = tokens(s, ap, "Test Legend");
    expect(tok).toBeDefined();
    expect(characteristics(s, s.objects[tok!]!).supertypes).not.toContain("Legendary");
    // The copy has the printed values only, not the +3/+3; the original is still there (no legend rule).
    expect([power(s, s.objects[tok!]!), toughness(s, s.objects[tok!]!)]).toEqual([2, 2]);
    expect(s.objects[lg]!.zone).toBe("battlefield");
  });

  it("an opponent's creature, or two targets, don't trigger it; a creature bounced in response is copied as it last was", () => {
    const { s: s0, ap, ids } = setup([growth, twin, bounce]);
    putOnBattlefield(s0, ap, duplimancy);
    const opp = nextOf(s0, ap);
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Test Their Bear" }));
    const mine = putOnBattlefield(s0, ap, bear({ name: "Test My Bear" }));
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: theirs }])));
    expect(tokens(s, ap, "Test Their Bear")).toHaveLength(0);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: mine }, { kind: "player", id: opp }])));
    expect(tokens(s, ap, "Test My Bear")).toHaveLength(0);
    // Bounce your own bear: the trigger resolves first, while the bear is still there.
    s = resolveAll(run(s, planCast(s, ap, ids[2]!, [{ kind: "object", id: mine }])));
    expect(tokens(s, ap, "Test My Bear")).toHaveLength(1);
    expect(s.objects[mine]!.zone).toBe("hand");
  });

  it("the targeted creature gone before the trigger resolves: a copy of it as it last existed (rulings)", () => {
    const { s: s0, ap, ids } = setup([growth]);
    putOnBattlefield(s0, ap, duplimancy);
    const mine = putOnBattlefield(s0, ap, bear({ name: "Test My Bear" }));
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: mine }]));
    for (let i = 0; i < 5 && s.triggerQueue.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.length).toBe(2);
    moveObject(s, mine, "hand");
    invalidateCharacteristics(s);
    s = resolveAll(s);
    expect(tokens(s, ap, "Test My Bear")).toHaveLength(1);
  });
});

describe("Clown Car", () => {
  const car = card("Clown Car", "Artifact — Vehicle", "{X}", { power: "0", toughness: "0", keywords: ["Crew"], oracleText: "When this Vehicle enters, roll X six-sided dice. For each odd result, create a 1/1 white Clown Robot artifact creature token. For each even result, put a +1/+1 counter on this Vehicle.\nCrew 2" });

  it("is fully supported; X dice, a Clown Robot for each odd result and a +1/+1 counter for each even one", () => {
    supported(car);
    for (const seed of [1, 2, 3]) {
      const { s: s0, ap, ids } = setup([car], seed);
      let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 5)));
      const robots = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Clown"));
      const counters = s.objects[ids[0]!]!.counters["+1/+1"] ?? 0;
      expect(robots.length + counters).toBe(5);
      // The odd dice are the robots (the log shows each die).
      const dice = s.log.find((l) => /rolls 5 d6/.test(l.text))!.text.replace(/^.*: | = .*$/g, "").split(" + ").map(Number);
      expect(robots.length).toBe(dice.filter((d) => d % 2 === 1).length);
      for (const r of robots) expect(characteristics(s, s.objects[r]!).subtypes).toEqual(["Clown", "Robot"]);
    }
  });

  it("X is 0: nothing rolled, nothing made", () => {
    const { s: s0, ap, ids } = setup([car]);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 0)));
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken).length).toBe(0);
  });
});

describe("Scavenger's Talent", () => {
  const talent = card("Scavenger's Talent", "Enchantment — Class", "{B}", { oracleText: "(Gain the next level as a sorcery to add its ability.)\nWhenever one or more creatures you control die, create a Food token. This ability triggers only once each turn.\n{1}{B}: Level 2\nWhenever you sacrifice a permanent, target player mills two cards.\n{2}{B}: Level 3\nAt the beginning of your end step, you may sacrifice three other nonland permanents. If you do, return a creature card from your graveyard to the battlefield with a finality counter on it." });
  const relic = card("Test Relic", "Artifact", "{1}", { oracleText: "" });
  const endStep = (others: number) => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, talent);
    s0.objects[t]!.classLevel = 3;
    const mine = Array.from({ length: others }, (_, i) => putOnBattlefield(s0, ap, i === 0 ? bear({ name: "Test Fodder Bear" }) : relic));
    const dead = into(s0, ap, bear({ name: "Test Big Dead", power: "5", toughness: "5" }), "graveyard");
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "end", ap);
    for (let i = 0; i < 20 && !(s.pending?.kind === "chooseMay" && /sacrifice three/.test(s.pending.prompt)) && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const p = s.pending;
      // The level 2 mill and the Food trigger target or ask nothing that matters here.
      if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: [{ kind: "player", id: ap }] });
      else if (p) break;
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return { s, ap, t, mine, dead };
  };

  it("is fully supported; level 3 sacrifices three others and returns a creature card with a finality counter", () => {
    supported(talent);
    let { s, ap, mine, dead } = endStep(3);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    if (s.pending?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: ap, ids: mine });
    for (let i = 0; i < 10 && s.pending; i++) {
      const p = s.pending;
      if (p.kind === "chooseOption" || p.kind === "searchLibrary") break;
      if (p.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: [{ kind: "player", id: ap }] });
      else break;
    }
    if (s.pending?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: ap, found: [dead] });
    for (let i = 0; i < 30 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(mine.every((id) => s.objects[id]!.zone !== "battlefield")).toBe(true);
    const back = s.battlefield.find((id) => characteristics(s, s.objects[id]!).name === "Test Big Dead");
    expect(back).toBeDefined();
    expect(s.objects[back!]!.counters.finality).toBe(1);
  });

  it("bots do it when the best creature card in their graveyard is worth more than what they'd sacrifice", () => {
    const { s, ap } = endStep(3);
    expect(botActions(s, ap)).toEqual([{ type: "chooseMay", player: ap, yes: true }]);
    const small = endStep(3);
    const d = small.s.cards[small.s.objects[small.dead]!.cardId]!;
    small.s.cards[d.oracleId] = { ...d, power: "1", toughness: "1" };
    expect(botActions(small.s, small.ap)).toEqual([{ type: "chooseMay", player: small.ap, yes: false }]);
  });

  it("with only two other nonland permanents, it can't be done (no question)", () => {
    const { s } = endStep(2);
    expect(s.pending?.kind === "chooseMay" && /sacrifice three/.test(s.pending.prompt)).toBe(false);
  });
});

describe("Minsc & Boo, Timeless Heroes", () => {
  const minsc = card("Minsc & Boo, Timeless Heroes", "Legendary Planeswalker — Minsc", "{R}{R}{G}", { loyalty: "3", oracleText: "When Minsc & Boo enters and at the beginning of your upkeep, you may create Boo, a legendary 1/1 red Hamster creature token with trample and haste.\n+1: Put three +1/+1 counters on up to one target creature with trample or haste.\n−2: Sacrifice a creature. When you do, Minsc & Boo deals X damage to any target, where X is that creature's power. If the sacrificed creature was a Hamster, draw X cards.\nMinsc & Boo, Timeless Heroes can be your commander." });
  const hamster = bear({ name: "Test Hamster", typeLine: "Creature — Hamster", subtypes: ["Hamster"], power: "4", toughness: "4" });
  const minus = (sacrifice: CardDef) => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, minsc);
    s0.objects[m]!.counters.loyalty = 3;
    const fodder = putOnBattlefield(s0, ap, sacrifice);
    const opp = nextOf(s0, ap);
    const hand = s0.players[ap]!.hand.length;
    const life = s0.players[opp]!.life;
    let s = run(s0, planActivate(s0, ap, m, abilityIndex(s0, m, "−2")));
    s = resolveAll(s);
    if (s.pending?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: ap, ids: [fodder] });
    for (let i = 0; i < 10 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    s = resolveAll(s);
    return { s, ap, opp, fodder, hand, life };
  };

  it("is fully supported; −2 with a Hamster: X damage and X cards, X its power", () => {
    supported(minsc);
    const { s, ap, opp, fodder, hand, life } = minus(hamster);
    expect(s.objects[fodder]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life - 4);
    expect(s.players[ap]!.hand.length).toBe(hand + 4);
  });

  it("another creature: the damage only", () => {
    const { s, ap, opp, hand, life } = minus(bear({ name: "Test Big Bear", power: "3", toughness: "3" }));
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.players[ap]!.hand.length).toBe(hand);
  });
});

describe("Virtue of Courage", () => {
  const virtue = scry("adventure", [
    { name: "Virtue of Courage", mana_cost: "{3}{R}{R}", type_line: "Enchantment", oracle_text: "Whenever a source you control deals noncombat damage to an opponent, you may exile that many cards from the top of your library. You may play those cards this turn." },
    { name: "Embereth Blaze", mana_cost: "{1}{R}", type_line: "Instant — Adventure", oracle_text: "Embereth Blaze deals 2 damage to any target. (Then exile this card. You may cast the enchantment later from exile.)" },
  ]);
  const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." });

  it("is fully supported; noncombat damage to an opponent: you may exile that many and play them this turn", () => {
    expect(isFullySupported(virtue)).toBe(true);
    const { s: s0, ap, ids } = setup([shock]);
    s0.cards[virtue.oracleId] = virtue;
    putOnBattlefield(s0, ap, virtue);
    const opp = nextOf(s0, ap);
    const top = s0.players[ap]!.library.slice(0, 2);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    expect((s.pending as { prompt: string }).prompt).toMatch(/that many|2/);
    s = resolveAll(act(s, { type: "chooseMay", player: ap, yes: true }));
    for (const id of top) {
      expect(s.objects[id]!.zone).toBe("exile");
      expect(s.objects[id]!.mayPlay).toMatchObject({ player: ap, until: "thisTurn" });
    }
  });
});
