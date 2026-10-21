// Round 97, more cards: Bloodghast (haste while an opponent has 10 or less life) and Omniscience (cast spells from your
// hand without paying their mana costs, CR 118.9: an alternative cost, so X is 0 and additional costs still apply).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { characteristics, compileCard, isFullySupported, objHasKeyword, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ManaType } from "../src";

// Real oracle text (Scryfall).
const bloodghast = card("Bloodghast", "Creature — Vampire Spirit", "{B}{B}", { power: "2", toughness: "1", oracleText: "This creature can't block.\nThis creature has haste as long as an opponent has 10 or less life.\nLandfall — Whenever a land you control enters, you may return this card from your graveyard to the battlefield." });
const omniscience = card("Omniscience", "Enchantment", "{7}{U}{U}{U}", { oracleText: "You may cast spells from your hand without paying their mana costs." });
const monument = card("Forsaken Monument", "Legendary Artifact", "{5}", { oracleText: "Colorless creatures you control get +2/+2.\nWhenever you tap a permanent for {C}, add an additional {C}.\nWhenever you cast a colorless spell, you gain 2 life." });
const cagedSun = card("Caged Sun", "Artifact", "{6}", { oracleText: "As this artifact enters, choose a color.\nCreatures you control of the chosen color get +1/+1.\nWhenever a land's ability causes you to add one or more mana of the chosen color, add an additional one mana of that color." });
const solRing = card("Sol Ring", "Artifact", "{1}", { oracleText: "{T}: Add {C}{C}." });
const wastes = card("Wastes", "Basic Land", "", { oracleText: "{T}: Add {C}." });
const forest = card("Forest", "Basic Land — Forest");
const mountain = card("Mountain", "Basic Land — Mountain");
const lotusPod = card("Seed Pod Land", "Land", "", { oracleText: "Sacrifice this land: Add {G}." });
const vesuva = card("Vesuva", "Land", "", { oracleText: "You may have this land enter tapped as a copy of any land on the battlefield." });
const flux = card("Essence Flux", "Instant", "{U}", { oracleText: "Exile target creature you control, then return that card to the battlefield under its owner's control. If it's a Spirit, put a +1/+1 counter on it." });
const iteration = card("Expressive Iteration", "Sorcery", "{U}{R}", { oracleText: "Look at the top three cards of your library. Put one of them into your hand, put one of them on the bottom of your library, and exile one of them. You may play the exiled card this turn." });
const coat = card("Coat of Arms", "Artifact", "{5}", { oracleText: "Each creature gets +1/+1 for each other creature on the battlefield that shares at least one creature type with it." });
const narset = card("Narset, Parter of Veils", "Legendary Planeswalker — Narset", "{1}{U}{U}", { loyalty: "5", oracleText: "Each opponent can't draw more than one card each turn.\n−2: Look at the top four cards of your library. You may reveal a noncreature, nonland card from among them and put it into your hand. Put the rest on the bottom of your library in a random order." });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
const cutDeal = card("Cut a Deal", "Sorcery", "{2}{W}", { oracleText: "Each opponent draws a card, then you draw a card for each opponent who drew a card this way." });
const approach = card("Approach of the Second Sun", "Sorcery", "{6}{W}", { oracleText: "If this spell was cast from your hand and you've cast another spell named Approach of the Second Sun this game, you win the game. Otherwise, put Approach of the Second Sun into its owner's library seventh from the top and you gain 7 life." });
const pact = card("Tainted Pact", "Instant", "{1}{B}", { oracleText: "Exile the top card of your library. You may put that card into your hand unless it has the same name as another card exiled this way. Repeat this process until you put a card into your hand or you exile two cards with the same name, whichever comes first." });
const temptDiscovery = card("Tempt with Discovery", "Sorcery", "{3}{G}", { keywords: ["Tempting offer"], oracleText: "Tempting offer — Search your library for a land card and put it onto the battlefield. Each opponent may search their library for a land card and put it onto the battlefield. For each opponent who searches a library this way, search your library for a land card and put it onto the battlefield. Then each player who searched a library this way shuffles." });
const loot = card("Loot, Exuberant Explorer", "Legendary Creature — Beast Noble", "{2}{G}", { power: "1", toughness: "4", oracleText: "You may play an additional land on each of your turns.\n{4}{G}{G}, {T}: Look at the top six cards of your library. You may reveal a creature card with mana value less than or equal to the number of lands you control from among them and put it onto the battlefield. Put the rest on the bottom in a random order." });
const descent = card("Descent into Avernus", "Enchantment", "{2}{R}", { oracleText: "At the beginning of your upkeep, put two descent counters on this enchantment. Then each player creates X Treasure tokens and this enchantment deals X damage to each player, where X is the number of descent counters on this enchantment." });
const statuary = card("Inspiring Statuary", "Artifact", "{3}", { oracleText: "Nonartifact spells you cast have improvise. (Your artifacts can help cast those spells. Each artifact you tap after you're done activating mana abilities pays for {1}.)" });
const excalibur = card("Excalibur, Sword of Eden", "Legendary Artifact — Equipment", "{12}", { oracleText: "This spell costs {X} less to cast, where X is the total mana value of historic permanents you control. (Artifacts, legendaries, and Sagas are historic.)\nEquipped creature gets +10/+0 and has vigilance.\nEquip legendary creature {2}" });
const giant = card("Big Giant", "Creature — Giant", "{6}{R}{R}", { power: "8", toughness: "8" });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

const pool = (s: GameState, pid: number) => Object.fromEntries(Object.entries(s.players[pid]!.manaPool).filter(([, n]) => n > 0));
const tapFor = (s: GameState, pid: number, id: string, mana: ManaType): Action => ({ type: "activateMana", player: pid, objectId: id, mana });

describe("round 97, more cards", () => {
  it("parse", () => {
    supported(bloodghast, omniscience, monument, cagedSun, vesuva, flux, iteration, coat, narset, cutDeal, approach, pact, temptDiscovery, loot, descent, statuary, excalibur);
    expect(compileCard(omniscience).castFromHandFree).toBe(true);
  });

  it("Bloodghast has haste only while an opponent has 10 or less life", () => {
    const { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, bloodghast, { sick: true });
    expect(objHasKeyword(s, s.objects[g]!, "Haste")).toBe(false);
    const opp = s.turnOrder.find((p) => p !== ap)!;
    s.players[opp]!.life = 10;
    expect(objHasKeyword(s, s.objects[g]!, "Haste")).toBe(true);
  });

  it("Omniscience: a spell from your hand costs nothing; without it the giant can't be cast", () => {
    const { s: s0, ap, ids } = setup([giant]);
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "omniscience" })).toBeNull();
    putOnBattlefield(s0, ap, omniscience);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "omniscience" }));
    s = settle(s);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    // No land was tapped.
    expect(s.battlefield.filter((id) => s.objects[id]!.tapped).length).toBe(0);
  });

  it("Forsaken Monument: one more {C} whenever you tap a permanent for {C}, however many it made; not for colored mana", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, monument);
    const ring = putOnBattlefield(s, ap, solRing);
    const w = putOnBattlefield(s, ap, wastes);
    const m = putOnBattlefield(s, ap, mountain);
    expect(pool(act(s, tapFor(s, ap, ring, "C")), ap)).toEqual({ C: 3 });
    expect(pool(act(s, tapFor(s, ap, w, "C")), ap)).toEqual({ C: 2 });
    expect(pool(act(s, tapFor(s, ap, m, "R")), ap)).toEqual({ R: 1 });
    // An opponent's Sol Ring doesn't trigger it.
    const opp = s.turnOrder.find((p) => p !== ap)!;
    const theirs = putOnBattlefield(s, opp, solRing);
    s.priority = opp;
    expect(pool(act(s, tapFor(s, opp, theirs, "C")), opp)).toEqual({ C: 2 });
  });

  it("Caged Sun: one more mana of the chosen color from your lands' abilities, {T} in the cost or not", () => {
    const { s, ap } = setup([]);
    const sun = putOnBattlefield(s, ap, cagedSun);
    s.objects[sun]!.chosen = { color: "G" };
    const f = putOnBattlefield(s, ap, forest);
    const m = putOnBattlefield(s, ap, mountain);
    const pod = putOnBattlefield(s, ap, lotusPod);
    expect(pool(act(s, tapFor(s, ap, f, "G")), ap)).toEqual({ G: 2 });
    expect(pool(act(s, tapFor(s, ap, m, "R")), ap)).toEqual({ R: 1 });
    const after = act(s, tapFor(s, ap, pod, "G"));
    expect(pool(after, ap)).toEqual({ G: 2 });
    expect(after.objects[pod]!.zone).toBe("graveyard");
    // An opponent's Forest: no.
    const opp = s.turnOrder.find((p) => p !== ap)!;
    const theirs = putOnBattlefield(s, opp, forest);
    s.priority = opp;
    expect(pool(act(s, tapFor(s, opp, theirs, "G")), opp)).toEqual({ G: 1 });
  });

  it("Vesuva: enters tapped as a copy of a land; untapped as itself if you don't copy", () => {
    const { s: s0, ap, ids } = setup([vesuva]);
    const opp = s0.turnOrder.find((p) => p !== ap)!;
    putOnBattlefield(s0, opp, forest);
    let s = act(s0, { type: "playLand", player: ap, objectId: ids[0]! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copy" });
    const copy = act(s, { type: "chooseOption", player: ap, choice: (s.pending as { options: string[] }).options[0]! });
    expect(copy.objects[ids[0]!]!.tapped).toBe(true);
    expect(characteristics(copy, copy.objects[ids[0]!]!).name).toBe("Forest");
    const none = act(s, { type: "chooseOption", player: ap, choice: "none" });
    expect(none.objects[ids[0]!]!.tapped).toBe(false);
    expect(characteristics(none, none.objects[ids[0]!]!).name).toBe("Vesuva");
  });

  it("Essence Flux: the returned creature gets a +1/+1 counter only if it's a Spirit", () => {
    for (const [type, n] of [["Spirit", 1], ["Bear", 0]] as const) {
      const { s: s0, ap, ids } = setup([flux]);
      const c = putOnBattlefield(s0, ap, bear({ subtypes: [type] }));
      s0.objects[c]!.counters["+1/+1"] = 2;
      const s = settle(cast(s0, ap, ids[0]!, [target(c)]));
      expect(s.objects[c]!.zone).toBe("battlefield");
      expect(s.objects[c]!.counters["+1/+1"] ?? 0).toBe(n);
    }
  });

  it("Expressive Iteration: one card to your hand, one to the bottom, one exiled that you may play this turn", () => {
    const { s: s0, ap, ids } = setup([iteration]);
    const top = s0.players[ap]!.library.slice(0, 3);
    let s = cast(s0, ap, ids[0]!, []);
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", min: 1, max: 1, cards: top });
    s = act(s, { type: "searchLibrary", player: ap, found: [top[1]!] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", min: 1, max: 1, cards: [top[0], top[2]] });
    s = act(s, { type: "searchLibrary", player: ap, found: [top[2]!] });
    s = settle(s);
    expect(s.objects[top[1]!]!.zone).toBe("hand");
    expect(s.players[ap]!.library.at(-1)).toBe(top[0]);
    expect(s.objects[top[2]!]!.zone).toBe("exile");
    expect(s.objects[top[2]!]!.mayPlay).toMatchObject({ player: ap, until: "thisTurn" });
  });

  it("Expressive Iteration with two cards in your library: one to your hand, the other to the bottom, none exiled", () => {
    const { s: s0, ap, ids } = setup([iteration]);
    const lib = s0.players[ap]!.library;
    for (const id of lib.splice(2)) { s0.objects[id]!.zone = "graveyard"; s0.players[ap]!.graveyard.push(id); }
    const [a, b] = lib;
    let s = cast(s0, ap, ids[0]!, []);
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "searchLibrary", player: ap, found: [a!] });
    s = settle(s);
    expect(s.pending).toBeNull();
    expect(s.objects[a!]!.zone).toBe("hand");
    expect(s.objects[b!]!.zone).toBe("library");
  });

  it("Coat of Arms: each creature counts the other creatures sharing a creature type with it, anyone's, changelings too", () => {
    const { s, ap } = setup([]);
    const opp = s.turnOrder.find((p) => p !== ap)!;
    putOnBattlefield(s, ap, coat);
    const elf = putOnBattlefield(s, ap, bear({ name: "Elf A", subtypes: ["Elf"] }));
    const theirElf = putOnBattlefield(s, opp, bear({ name: "Elf B", subtypes: ["Elf", "Warrior"] }));
    const goblin = putOnBattlefield(s, ap, bear({ name: "Goblin A", subtypes: ["Goblin"] }));
    const shifter = putOnBattlefield(s, opp, bear({ name: "Shifter", subtypes: ["Shapeshifter"], keywords: ["Changeling"], oracleText: "Changeling (This card is every creature type.)" }));
    const golem = putOnBattlefield(s, ap, card("Plain Golem", "Artifact Creature", "{2}", { power: "2", toughness: "2" }));
    const pt = (id: string) => [power(s, s.objects[id]!), toughness(s, s.objects[id]!)];
    expect(pt(elf)).toEqual([4, 4]); // the other Elf and the changeling
    expect(pt(theirElf)).toEqual([4, 4]);
    expect(pt(goblin)).toEqual([3, 3]); // the changeling
    expect(pt(shifter)).toEqual([5, 5]); // the two Elves and the Goblin
    expect(pt(golem)).toEqual([2, 2]);
  });

  it("Narset, Parter of Veils: an opponent draws only one card each turn; Narset's controller isn't limited", () => {
    const { s: s0, ap, ids } = setup([divination, divination]);
    const opp = s0.turnOrder.find((p) => p !== ap)!;
    s0.objects[putOnBattlefield(s0, opp, narset)]!.counters.loyalty = 5;
    s0.players[ap]!.draws = undefined;
    const hand = s0.players[ap]!.hand.length;
    let s = settle(cast(s0, ap, ids[0]!, []));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
    s = settle(cast(s, ap, ids[1]!, []));
    expect(s.players[ap]!.hand.length).toBe(hand - 2 + 1);
    // Your own Narset: no limit.
    const { s: t0, ap: me, ids: mine } = setup([divination]);
    t0.objects[putOnBattlefield(t0, me, narset)]!.counters.loyalty = 5;
    const h = t0.players[me]!.hand.length;
    expect(settle(cast(t0, me, mine[0]!, [])).players[me]!.hand.length).toBe(h - 1 + 2);
  });

  it("Cut a Deal: you draw one for each opponent who drew; one Narset stopped doesn't count", () => {
    const { s: s0, ap, ids } = setup([cutDeal, cutDeal]);
    const opps = s0.turnOrder.filter((p) => p !== ap);
    const hand = s0.players[ap]!.hand.length;
    let s = settle(cast(s0, ap, ids[0]!, []));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3);
    // Your Narset: an opponent who already drew this turn can't draw again.
    s.objects[putOnBattlefield(s, ap, narset)]!.counters.loyalty = 5;
    const theirs = opps.map((p) => s.players[p]!.hand.length);
    s = settle(cast(s, ap, ids[1]!, []));
    expect(opps.map((p) => s.players[p]!.hand.length)).toEqual(theirs);
    expect(s.players[ap]!.hand.length).toBe(hand - 2 + 3);
  });

  it("Approach of the Second Sun: seventh from the top and 7 life the first time; cast again from your hand, you win", () => {
    const { s: s0, ap, ids } = setup([approach]);
    const life = s0.players[ap]!.life;
    let s = settle(cast(s0, ap, ids[0]!, []));
    expect(s.players[ap]!.library.indexOf(ids[0]!)).toBe(6);
    expect(s.players[ap]!.life).toBe(life + 7);
    expect(s.over).toBeFalsy();
    // Back in hand (drawn) on a later turn: the same card is another spell (rulings).
    const p = s.players[ap]!;
    p.library.splice(p.library.indexOf(ids[0]!), 1);
    p.hand.push(ids[0]!);
    s.objects[ids[0]!]!.zone = "hand";
    for (const id of s.battlefield) s.objects[id]!.tapped = false;
    s.players[ap]!.landsPlayedThisTurn = 0;
    s = settle(cast(s, ap, ids[0]!, []));
    expect(s.over).toBe(true);
    expect(s.winner).toBe(ap);
  });

  it("Tainted Pact: exile until you take one, or until two share a name", () => {
    const { s: s0, ap, ids } = setup([pact, pact]);
    const onTop = (def: CardDef) => {
      const id = putOnBattlefield(s0, ap, def);
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "library";
      s0.players[ap]!.library.unshift(id);
      return id;
    };
    const a2 = onTop(card("Opt", "Instant", "{U}"));
    const b = onTop(card("Shock", "Instant", "{R}"));
    const a = onTop(card("Opt", "Instant", "{U}"));
    let s = cast(s0, ap, ids[0]!, []);
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", card: a });
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    expect(s.pending).toMatchObject({ kind: "chooseMay", card: b });
    s = act(s, { type: "chooseMay", player: ap, yes: false });
    // The third has the first one's name: it stops there.
    s = settle(s);
    expect(s.pending).toBeNull();
    expect([a, b, a2].map((id) => s.objects[id!]!.zone)).toEqual(["exile", "exile", "exile"]);
    // Taking one stops it.
    const next = s.players[ap]!.library[0]!;
    s = cast(s, ap, ids[1]!, []);
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[next]!.zone).toBe("hand");
    expect(s.objects[s.players[ap]!.library[0]!]!.zone).toBe("library");
  });

  it("Tempt with Discovery: you get a land, then one more for each opponent who searched", () => {
    const { s: s0, ap, ids } = setup([temptDiscovery]);
    const opps = s0.turnOrder.filter((p) => p !== ap);
    const lands = (s: GameState, pid: number) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land")).length;
    const before = [ap, ...opps].map((p) => lands(s0, p));
    let s = cast(s0, ap, ids[0]!, []);
    for (let i = 0; i < 60 && (s.stack.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: p.player, found: p.cards.slice(0, 1) });
      else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: p.player === opps[0] });
      else if (p) throw new Error(p.kind);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect([ap, ...opps].map((p) => lands(s, p))).toEqual([before[0]! + 2, before[1]! + 1, before[2], before[3]]);
  });

  it("Loot: a creature card with mana value up to the number of lands you control, from the top six", () => {
    const { s: s0, ap } = setup([]);
    const l = putOnBattlefield(s0, ap, loot);
    const onTop = (def: CardDef) => {
      const id = putOnBattlefield(s0, ap, def);
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "library";
      s0.players[ap]!.library.unshift(id);
      return id;
    };
    const huge = onTop(card("Huge Thing", "Creature — Beast", "{15}", { power: "15", toughness: "15", cmc: 15 }));
    const small = onTop(bear({ name: "Small Bear" }));
    let s = activate(s0, ap, l, 0);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", min: 0, max: 1 });
    const cards = (s.pending as { cards: string[] }).cards;
    expect(cards).toContain(small);
    expect(cards).not.toContain(huge);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [small] }));
    expect(s.objects[small]!.zone).toBe("battlefield");
    expect(s.objects[huge]!.zone).toBe("library");
    expect(s.players[ap]!.library.slice(-5)).toContain(huge);
  });

  it("Descent into Avernus: two descent counters, then X Treasures for each player and X damage to each", () => {
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, descent);
    s0.objects[d]!.counters.descent = 1;
    let s = passUntil(s0, "upkeep", ap);
    const life = s.players.map((p) => p.life);
    s = settle(s);
    expect(s.objects[d]!.counters.descent).toBe(3);
    const treasures = (pid: number) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]!.subtypes.includes("Treasure")).length;
    expect(s.turnOrder.map(treasures)).toEqual([3, 3, 3, 3]);
    expect(s.players.map((p) => p.life)).toEqual(life.map((l) => l - 3));
  });

  it("Inspiring Statuary: your artifacts pay generic mana for nonartifact spells, not for artifact spells", () => {
    const { s: s0, ap, ids } = setup([divination, card("Big Trinket", "Artifact", "{2}", { cmc: 2 })]);
    const island = s0.battlefield.find((id) => s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.name === "Island")!;
    for (const id of s0.battlefield) if (s0.objects[id]!.controller === ap && id !== island) s0.objects[id]!.tapped = true;
    const trinkets = [putOnBattlefield(s0, ap, card("Trinket A", "Artifact", "{1}")), putOnBattlefield(s0, ap, card("Trinket B", "Artifact", "{1}"))];
    expect(planCast(s0, ap, ids[0]!, undefined, undefined, "auto")).toBeNull();
    putOnBattlefield(s0, ap, statuary);
    const plan = planCast(s0, ap, ids[0]!, undefined, undefined, "auto");
    const last = plan?.at(-1);
    expect(last?.type === "castSpell" && last.improvise?.length).toBe(2);
    expect(trinkets.length).toBe(2);
    // An artifact spell: no.
    expect(planCast(s0, ap, ids[1]!, undefined, undefined, "auto")).toBeNull();
    const s = settle(run(s0, plan));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("Excalibur: costs {X} less, X the total mana value of your artifacts, legendaries and Sagas", () => {
    const { s: s0, ap, ids } = setup([excalibur]);
    putOnBattlefield(s0, ap, solRing); // 1
    putOnBattlefield(s0, ap, card("Some Legend", "Legendary Creature — Human", "{2}{W}", { power: "2", toughness: "2" })); // 3
    putOnBattlefield(s0, ap, card("Some Saga", "Enchantment — Saga", "{1}{G}")); // 2
    putOnBattlefield(s0, ap, bear()); // not historic
    const lands = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.types.includes("Land"));
    for (const id of lands.slice(6)) s0.objects[id]!.tapped = true;
    s0.objects[s0.battlefield.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Sol Ring")!]!.tapped = true;
    // {12} less 6: the six untapped lands pay for it.
    expect(planCast(s0, ap, ids[0]!)).not.toBeNull();
    s0.objects[lands[0]!]!.tapped = true;
    expect(planCast(s0, ap, ids[0]!)).toBeNull();
  });
});
