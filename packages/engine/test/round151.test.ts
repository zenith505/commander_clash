// Round 151: the most played cards, in popularity order, starting with Vizier of Many Faces.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, scry, setup } from "./helpers";
import { abilitiesOf, blockProblem, botActions, characteristics, compileCard, invalidateCharacteristics, isFullySupported, objHasKeyword, objIsType, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type Step, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; "you may" questions get `yes`. Stops at any other question. */
const resolveAll = (s: GameState, yes = true) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending?.kind === "chooseMay"); i++) {
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes });
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes (resolving everything on the way, "you may" answered `yes`) until `step` of `active`'s turn. */
const advance = (s: GameState, step: Step, active: PlayerId, yes = true) => {
  for (let i = 0; i < 3000; i++) {
    if (s.step === step && s.activePlayer === active && !s.stack.length && !s.triggerQueue.length && !s.pending) return s;
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes });
    else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: waitingOn(s)!, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: waitingOn(s)!, blocks: [] });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error(`never reached ${step}`);
};
/** A card put straight into a zone, not from the battlefield. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const obj = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const none: TargetChoice = { kind: "none" };
const next = (s: GameState, pid: PlayerId, k = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + k) % s.turnOrder.length]!;
const nameOf = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
/** On the battlefield with that name (a token's has " Token" after it). */
const named = (s: GameState, name: string) => s.battlefield.filter((id) => [name, `${name} Token`].includes(nameOf(s, id)));

// Real oracle text (Scryfall).
const vizier = card("Vizier of Many Faces", "Creature — Shapeshifter Cleric", "{2}{U}{U}", { power: "0", toughness: "0", cmc: 4, keywords: ["Embalm"], oracleText: "You may have this creature enter as a copy of any creature on the battlefield, except if this creature was embalmed, the token has no mana cost, it's white, and it's a Zombie in addition to its other types.\nEmbalm {3}{U}{U}" });
const larcenist = card("Kitesail Larcenist", "Creature — Human Pirate", "{2}{U}", { power: "2", toughness: "3", cmc: 3, keywords: ["Flying", "Ward"], oracleText: 'Flying, ward {1}\nWhen this creature enters, for each player, choose up to one other target artifact or creature that player controls. For as long as this creature remains on the battlefield, the chosen permanents become Treasure artifacts with "{T}, Sacrifice this artifact: Add one mana of any color" and lose all other abilities.' });
const ao = card("Ao, the Dawn Sky", "Legendary Creature — Dragon Spirit", "{3}{W}{W}", { power: "5", toughness: "4", cmc: 5, keywords: ["Flying", "Vigilance"], oracleText: "Flying, vigilance\nWhen Ao dies, choose one —\n• Look at the top seven cards of your library. Put any number of nonland permanent cards with total mana value 4 or less from among them onto the battlefield. Put the rest on the bottom of your library in a random order.\n• Put two +1/+1 counters on each permanent you control that's a creature or Vehicle." });
const quandrix = card("Quandrix Command", "Instant", "{1}{G}{U}", { cmc: 3, oracleText: "Choose two —\n• Return target creature or planeswalker to its owner's hand.\n• Counter target artifact or enchantment spell.\n• Put two +1/+1 counters on target creature.\n• Target player shuffles up to three target cards from their graveyard into their library." });
const journey = card("Memory's Journey", "Instant", "{1}{U}", { cmc: 2, keywords: ["Flashback"], oracleText: "Target player shuffles up to three target cards from their graveyard into their library.\nFlashback {G} (You may cast this card from your graveyard for its flashback cost. Then exile it.)" });
const rite = card("Rite of Renewal", "Sorcery", "{3}{G}", { cmc: 4, oracleText: "Return up to two target permanent cards from your graveyard to your hand. Target player shuffles up to four target cards from their graveyard into their library. Exile Rite of Renewal." });
const emperor = scry("transform", [
  { name: "The Emperor of Palamecia", mana_cost: "{U}{R}", type_line: "Legendary Creature — Human Noble Wizard", power: "2", toughness: "2", oracle_text: "{T}: Add {U} or {R}. Spend this mana only to cast a noncreature spell.\nWhenever you cast a noncreature spell, if at least four mana was spent to cast it, put a +1/+1 counter on The Emperor of Palamecia. Then if it has three or more +1/+1 counters on it, transform it." },
  { name: "The Lord Master of Hell", type_line: "Legendary Creature — Demon Noble Wizard", power: "3", toughness: "3", color_indicator: ["U", "R"], oracle_text: "Starfall — Whenever The Lord Master of Hell attacks, it deals X damage to each opponent, where X is the number of noncreature, nonland cards in your graveyard." },
]);
const gyruda = card("Gyruda, Doom of Depths", "Legendary Creature — Demon Kraken", "{4}{U/B}{U/B}", { power: "6", toughness: "6", cmc: 6, keywords: ["Companion", "Mill"], oracleText: "Companion — Your starting deck contains only cards with even mana values. (If this card is your chosen companion, you may put it into your hand from outside the game for {3} as a sorcery.)\nWhen Gyruda enters, each player mills four cards. Put a creature card with an even mana value from among the milled cards onto the battlefield under your control." });
const fractured = card("Fractured Identity", "Sorcery", "{3}{W}{U}", { cmc: 5, oracleText: "Exile target nonland permanent. Each player other than its controller creates a token that's a copy of it." });
const infinite = card("Enter the Infinite", "Sorcery", "{8}{U}{U}{U}{U}", { cmc: 12, oracleText: "Draw cards equal to the number of cards in your library, then put a card from your hand on top of your library. You have no maximum hand size until your next turn." });
const trader = card("Savvy Trader", "Creature — Human Citizen", "{3}{G}", { power: "3", toughness: "3", cmc: 4, oracleText: "When this creature enters, exile target permanent card from your graveyard. You may play that card for as long as it remains exiled.\nSpells you cast from anywhere other than your hand cost {1} less to cast." });
const gearhulk = card("Brightglass Gearhulk", "Artifact Creature — Construct", "{G}{G}{W}{W}", { power: "4", toughness: "4", cmc: 4, keywords: ["First strike", "Trample"], oracleText: "First strike, trample\nWhen this creature enters, you may search your library for up to two artifact, creature, and/or enchantment cards with mana value 1 or less, reveal them, put them into your hand, then shuffle." });
const finneas = card("Finneas, Ace Archer", "Legendary Creature — Rabbit Archer", "{G}{W}", { power: "2", toughness: "2", cmc: 2, keywords: ["Reach", "Vigilance"], oracleText: "Reach, vigilance\nWhenever Finneas attacks, put a +1/+1 counter on each other creature you control that's a token or a Rabbit. Then if creatures you control have total power 10 or greater, draw a card." });
const guidance = card("Dina's Guidance", "Instant", "{1}{B}{G}", { cmc: 3, oracleText: "Search your library for a creature card, reveal it, put it into your hand or graveyard, then shuffle." });
const eowyn = card("Éowyn, Shieldmaiden", "Legendary Creature — Human Knight", "{2}{U}{R}{W}", { power: "5", toughness: "4", cmc: 5, keywords: ["First strike"], oracleText: "First strike\nAt the beginning of combat on your turn, if another Human entered the battlefield under your control this turn, create two 2/2 red Human Knight creature tokens with trample and haste. Then if you control six or more Humans, draw a card." });
const loyalist = card("Legion Loyalist", "Creature — Goblin Soldier", "{R}", { power: "1", toughness: "1", cmc: 1, keywords: ["Haste", "Battalion"], oracleText: "Haste\nBattalion — Whenever this creature and at least two other creatures attack, creatures you control gain first strike and trample until end of turn and can't be blocked by creature tokens this turn." });
const rimestag = card("Saddled Rimestag", "Snow Creature — Elk", "{1}{G}", { power: "2", toughness: "2", cmc: 2, oracleText: "This creature gets +2/+2 as long as you had another creature enter the battlefield under your control this turn." });
const entrapment = card("Entrapment Maneuver", "Instant", "{3}{W}", { cmc: 4, oracleText: "Target player sacrifices an attacking creature of their choice. You create X 1/1 white Soldier creature tokens, where X is that creature's toughness." });

const wall = card("Test Wall", "Creature — Wall", "{1}{W}", { power: "0", toughness: "4", cmc: 2, oracleText: "Defender\nWhen this creature enters, draw a card." });
const human = bear({ name: "Test Human", typeLine: "Creature — Human", subtypes: ["Human"] });
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3", cmc: 3 });
const giant = card("Test Giant", "Legendary Creature — Giant", "{3}{R}", { power: "4", toughness: "5", cmc: 4 });
const rock = card("Test Rock", "Artifact", "{2}", { cmc: 2, oracleText: "{T}: Add {C}." });
const charm = card("Test Charm", "Enchantment", "{1}", { cmc: 1 });
const trinket = card("Test Trinket", "Artifact", "{0}", { cmc: 0 });
const rabbit = bear({ name: "Test Rabbit", typeLine: "Creature — Rabbit", subtypes: ["Rabbit"] });
const vehicle = card("Test Vehicle", "Artifact — Vehicle", "{2}", { cmc: 2, power: "5", toughness: "5", keywords: ["Crew"], oracleText: "Crew 3" });
const murder = card("Test Murder", "Instant", "{1}{B}{B}", { cmc: 3, oracleText: "Destroy target creature." });
const divination = card("Test Divination", "Sorcery", "{2}{U}", { cmc: 3, oracleText: "Draw two cards." });
const ponder = card("Test Ponder", "Sorcery", "{U}", { cmc: 1, oracleText: "Draw a card." });
const island = card("Island", "Basic Land — Island");

describe("Vizier of Many Faces: a clone; embalmed, a white Zombie copy with no mana cost", () => {
  it("is fully supported", () => supported(vizier));

  it("cast, it copies a creature as it is printed: not white, not a Zombie", () => {
    const { s: s0, ap, ids } = setup([vizier]);
    const w = putOnBattlefield(s0, ap, wall);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseOption"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copy" });
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: w }));
    const c = characteristics(s, s.objects[ids[0]!]!);
    expect(c.name).toBe("Test Wall");
    expect(c.colors).toEqual(["W"]);
    expect(c.subtypes).toEqual(["Wall"]);
    expect(s.objects[ids[0]!]!.embalmed).toBeUndefined();
  });

  it("embalmed: the token copies the chosen creature, white, a Zombie too, with no mana cost; its enters ability triggers", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, wall);
    const v = into(s0, ap, vizier, "graveyard");
    let s = run(s0, planActivate(s0, ap, v, 0));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseOption"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[v]!.zone).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copy" });
    const tok = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    expect(s.objects[tok]!.embalmed).toBe(true);
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: w }));
    const c = characteristics(s, s.objects[tok]!);
    expect(c.name).toBe("Test Wall");
    expect(c.colors).toEqual(["W"]);
    expect(c.subtypes).toEqual(["Wall", "Zombie"]);
    expect(s.cards[s.objects[tok]!.copyOf!]!.manaCost).toBe("");
    expect(pt(s, tok)).toBe("0/4");
    // The Wall's "when this creature enters, draw a card".
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("embalmed, a copy of a red creature is white only", () => {
    const { s: s0, ap } = setup([]);
    const o = putOnBattlefield(s0, ap, ogre);
    const v = into(s0, ap, vizier, "graveyard");
    let s = run(s0, planActivate(s0, ap, v, 0));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseOption"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: o }));
    const tok = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    const c = characteristics(s, s.objects[tok]!);
    expect(c.name).toBe("Test Ogre");
    expect(c.colors).toEqual(["W"]);
    expect(c.subtypes).toEqual(["Ogre", "Zombie"]);
    expect(pt(s, tok)).toBe("3/3");
  });
});

describe("Kitesail Larcenist: up to one other artifact or creature of each player becomes a Treasure", () => {
  it("is fully supported", () => supported(larcenist));

  it("one target for each player, itself not allowed; they become Treasures with only the mana ability, until it leaves", () => {
    const { s: s0, ap, ids } = setup([larcenist]);
    const [b, c] = [next(s0, ap), next(s0, ap, 2)];
    putOnBattlefield(s0, ap, rock);
    const theirs = putOnBattlefield(s0, b, giant);
    const theirRock = putOnBattlefield(s0, c, rock);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    const order = [ap, b, c, next(s0, ap, 3)];
    // A bot takes an opponent's permanent, none of its own.
    const bot = botActions(s, ap)[0] as Extract<Action, { type: "chooseTargets" }>;
    expect(bot.targets[0]).toEqual(none);
    expect(bot.targets.some((x) => x.kind === "object")).toBe(true);
    // The Larcenist can't target itself, and each slot only takes that player's permanent.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [obj(ids[0]!), none, none, none] })).toThrow();
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [none, obj(theirRock), none, none] })).toThrow();
    const targets = order.map((pid) => (pid === b ? obj(theirs) : pid === c ? obj(theirRock) : none));
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets }));
    const g = characteristics(s, s.objects[theirs]!);
    expect(g.types).toEqual(["Artifact"]);
    expect(g.subtypes).toEqual(["Treasure"]);
    // Supertypes stay (rulings).
    expect(g.supertypes).toEqual(["Legendary"]);
    expect(objIsType(s, s.objects[theirs]!, "Creature")).toBe(false);
    // The rock lost its {T}: Add {C}; the Treasure's ability is its only one.
    const r = characteristics(s, s.objects[theirRock]!);
    expect(r.subtypes).toEqual(["Treasure"]);
  });

  it("the Treasure can be sacrificed for mana by its controller; when the Larcenist leaves, the creature is back", () => {
    const { s: s0, ap, ids } = setup([larcenist, murder]);
    const b = next(s0, ap);
    const theirs = putOnBattlefield(s0, b, giant);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const targets = [ap, b, next(s0, ap, 2), next(s0, ap, 3)].map((pid) => (pid === b ? obj(theirs) : none));
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets }));
    expect(objIsType(s, s.objects[theirs]!, "Creature")).toBe(false);
    // Only the Treasure's mana ability; its controller can sacrifice it for mana.
    expect(abilitiesOf(s, s.objects[theirs]!).mana).toHaveLength(1);
    expect(abilitiesOf(s, s.objects[theirs]!).mana[0]!.sacrificeSelf).toBe(true);
    // The Larcenist dies: the Giant is a creature again.
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [obj(ids[0]!)])));
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(objIsType(s, s.objects[theirs]!, "Creature")).toBe(true);
    expect(abilitiesOf(s, s.objects[theirs]!).mana).toHaveLength(0);
    expect(pt(s, theirs)).toBe("4/5");
  });
});

/** Kills `id` with Test Murder cast by `ap` (one in their hand). */
const kill = (s: GameState, ap: PlayerId, murderId: string, id: string) => run(s, planCast(s, ap, murderId, [obj(id)]));
/** Passes until a question comes up (or the stack is empty). */
const toQuestion = (s: GameState) => {
  for (let i = 0; i < 60 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("Ao, the Dawn Sky: dies, then nonland permanent cards with total mana value 4 or less, or counters on creatures and Vehicles", () => {
  it("is fully supported", () => supported(ao));

  it("first mode: any number of nonland permanent cards from the top seven, total mana value 4 or less, onto the battlefield", () => {
    const { s: s0, ap, ids } = setup([murder]);
    const a = putOnBattlefield(s0, ap, ao);
    // Top seven: Ogre (3), Rock (2), Charm (1), Trinket (0), Ponder (1, not a permanent), Island, Giant (4).
    for (const d of [giant, island, ponder, trinket, charm, rock, ogre].reverse()) into(s0, ap, d, "library");
    const top = s0.players[ap]!.library.slice(0, 7);
    let s = toQuestion(kill(s0, ap, ids[0]!, a));
    expect(s.pending).toMatchObject({ kind: "chooseModes" });
    s = toQuestion(act(s, { type: "chooseModes", player: ap, modes: [0] }));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", totalMv: 4, min: 0 });
    const p = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    const byName = (n: string) => top.find((id) => nameOf(s, id) === n)!;
    // Not the instant-speed Ponder, not the Island.
    expect(p.cards).not.toContain(byName("Test Ponder"));
    expect(p.cards).not.toContain(byName("Island"));
    expect(p.cards).toContain(byName("Test Giant"));
    // Over the total: refused.
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [byName("Test Ogre"), byName("Test Rock")] })).toThrow();
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [byName("Test Ogre"), byName("Test Charm"), byName("Test Trinket")] }));
    for (const n of ["Test Ogre", "Test Charm", "Test Trinket"]) expect(s.objects[byName(n)]!.zone).toBe("battlefield");
    // The rest on the bottom.
    expect(s.players[ap]!.library.slice(-4).sort()).toEqual([byName("Test Rock"), byName("Test Ponder"), byName("Island"), byName("Test Giant")].sort());
  });

  it("second mode: two +1/+1 counters on each creature and each Vehicle you control, not other permanents or others' creatures", () => {
    const { s: s0, ap, ids } = setup([murder]);
    const a = putOnBattlefield(s0, ap, ao);
    const o = putOnBattlefield(s0, ap, ogre);
    const v = putOnBattlefield(s0, ap, vehicle);
    const r = putOnBattlefield(s0, ap, rock);
    const theirs = putOnBattlefield(s0, next(s0, ap), ogre);
    let s = toQuestion(kill(s0, ap, ids[0]!, a));
    s = resolveAll(act(s, { type: "chooseModes", player: ap, modes: [1] }));
    expect(s.objects[o]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[v]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[r]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[theirs]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("Target player shuffles up to three target cards from their graveyard into their library", () => {
  it("Memory's Journey, Quandrix Command and Rite of Renewal are fully supported", () => supported(journey, quandrix, rite));

  it("only cards in the target player's graveyard; they go into that library, which is shuffled", () => {
    const { s: s0, ap, ids } = setup([journey]);
    const b = next(s0, ap);
    const theirs = [into(s0, b, ogre, "graveyard"), into(s0, b, giant, "graveyard"), into(s0, b, rock, "graveyard")];
    const mine = into(s0, ap, ogre, "graveyard");
    // A card from another graveyard can't be one of the targets.
    expect(planCast(s0, ap, ids[0]!, [player(b), obj(theirs[0]!), obj(mine), none])).toBeNull();
    const shuffles = s0.players[b]!.shuffles ?? 0;
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [player(b), obj(theirs[0]!), obj(theirs[1]!), none])));
    expect(s.objects[theirs[0]!]!.zone).toBe("library");
    expect(s.objects[theirs[1]!]!.zone).toBe("library");
    expect(s.objects[theirs[2]!]!.zone).toBe("graveyard");
    expect(s.players[b]!.shuffles ?? 0).toBe(shuffles + 1);
    expect(s.objects[mine]!.zone).toBe("graveyard");
  });

  it("Quandrix Command: bounce a creature and shuffle cards back; the player still shuffles when the cards are gone (rulings)", () => {
    const { s: s0, ap, ids } = setup([quandrix]);
    const b = next(s0, ap);
    const o = putOnBattlefield(s0, b, ogre);
    const g = into(s0, b, giant, "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!, [obj(o), player(b), obj(g), none, none], [0, 3]));
    // The card leaves the graveyard before it resolves: that target is illegal, the player isn't.
    s.players[b]!.graveyard = s.players[b]!.graveyard.filter((id) => id !== g);
    s.objects[g]!.zone = "exile";
    s.objects[g]!.zoneChanges = (s.objects[g]!.zoneChanges ?? 0) + 1;
    s.players[b]!.exile.push(g);
    const shuffles = s.players[b]!.shuffles ?? 0;
    s = resolveAll(s);
    expect(s.objects[o]!.zone).toBe("hand");
    expect(s.objects[g]!.zone).toBe("exile");
    expect(s.players[b]!.shuffles ?? 0).toBe(shuffles + 1);
  });

  it("Rite of Renewal: two cards back to your hand, then up to four of the target player's cards shuffled away", () => {
    const { s: s0, ap, ids } = setup([rite]);
    const b = next(s0, ap);
    const [m1, m2] = [into(s0, ap, ogre, "graveyard"), into(s0, ap, rock, "graveyard")];
    const t1 = into(s0, b, giant, "graveyard");
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(m1), obj(m2), player(b), obj(t1), none, none, none])));
    expect(s.objects[m1]!.zone).toBe("hand");
    expect(s.objects[m2]!.zone).toBe("hand");
    expect(s.objects[t1]!.zone).toBe("library");
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
  });
});

describe("The Emperor of Palamecia: counters from noncreature spells with four or more mana spent, then it transforms", () => {
  it("is fully supported, both faces", () => supported(emperor));

  it("a counter for each noncreature spell cast with four mana, none for cheaper; the third counter transforms it", () => {
    const big = card("Test Big Draw", "Sorcery", "{3}{U}", { cmc: 4, oracleText: "Draw a card." });
    const { s: s0, ap, ids } = setup([ponder, big, big, big]);
    const e = putOnBattlefield(s0, ap, emperor);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[e]!.counters["+1/+1"] ?? 0).toBe(0);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(s.objects[e]!.counters["+1/+1"]).toBe(1);
    s = resolveAll(run(s, planCast(s, ap, ids[2]!)));
    expect(nameOf(s, e)).toBe("The Emperor of Palamecia");
    s = resolveAll(run(s, planCast(s, ap, ids[3]!)));
    expect(s.objects[e]!.counters["+1/+1"]).toBe(3);
    expect(nameOf(s, e)).toBe("The Lord Master of Hell");
    expect(pt(s, e)).toBe("6/6");
  });
});

describe("Gyruda, Doom of Depths: each player mills four, then a creature card with an even mana value from among them", () => {
  it("is fully supported", () => supported(gyruda));

  it("any player's milled card, even mana value only (0 counts), onto the battlefield under your control", () => {
    const { s: s0, ap, ids } = setup([gyruda]);
    const b = next(s0, ap);
    const theirGiant = into(s0, b, giant, "library");
    const theirOgre = into(s0, b, ogre, "library");
    const old = into(s0, b, giant, "graveyard");
    let s = toQuestion(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", min: 1, max: 1, anyGraveyard: true });
    const p = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect(p.cards).toContain(theirGiant);
    // The Ogre's mana value is odd; the Giant already in the graveyard wasn't milled.
    expect(p.cards).not.toContain(theirOgre);
    expect(p.cards).not.toContain(old);
    expect(botActions(s, ap)).toHaveLength(1);
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [theirGiant] }));
    expect(s.objects[theirGiant]!.zone).toBe("battlefield");
    expect(s.objects[theirGiant]!.controller).toBe(ap);
  });
});

describe("Fractured Identity: exile it; every other player gets a token copy", () => {
  it("is fully supported", () => supported(fractured));

  it("each player other than its controller, you too, creates a token copy; its controller gets none", () => {
    const { s: s0, ap, ids } = setup([fractured]);
    const b = next(s0, ap);
    const g = putOnBattlefield(s0, b, giant);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(g)])));
    expect(s.objects[g]!.zone).toBe("exile");
    const copies = named(s, "Test Giant");
    expect(copies).toHaveLength(3);
    expect(copies.map((id) => s.objects[id]!.controller).sort()).toEqual(s.turnOrder.filter((p) => p !== b).sort());
  });
});

describe("Enter the Infinite: draw your library, put one back, no maximum hand size until your next turn", () => {
  it("is fully supported", () => supported(infinite));

  it("draws every card, puts one back on top, and doesn't discard down at cleanup; the turn after next it does", () => {
    const { s: s0, ap, ids } = setup([infinite]);
    s0.players[ap]!.library = s0.players[ap]!.library.slice(0, 20);
    for (const id of Object.keys(s0.objects)) if (s0.objects[id]!.zone === "library" && s0.objects[id]!.owner === ap && !s0.players[ap]!.library.includes(id)) s0.objects[id]!.zone = "exile";
    for (const c of [island, island]) putOnBattlefield(s0, ap, c);
    let s = toQuestion(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.library).toHaveLength(0);
    expect(s.pending).toMatchObject({ kind: "handToTop", player: ap, count: 1 });
    const back = s.players[ap]!.hand[0]!;
    s = resolveAll(act(s, { type: "handToTop", player: ap, objectIds: [back] }));
    expect(s.players[ap]!.library).toEqual([back]);
    expect(s.players[ap]!.noMaxHandSizeUntilNextTurn).toBe(true);
    const hand = s.players[ap]!.hand.length;
    s = advance(s, "upkeep", next(s, ap));
    expect(s.players[ap]!.hand.length).toBe(hand);
    s = advance(s, "upkeep", ap);
    expect(s.players[ap]!.noMaxHandSizeUntilNextTurn).toBeUndefined();
  });
});

describe("Savvy Trader: exile a permanent card from your graveyard; you may play it while it stays exiled", () => {
  it("is fully supported", () => supported(trader));

  it("a land exiled this way can be played as your land for the turn", () => {
    const { s: s0, ap, ids } = setup([trader]);
    const land = into(s0, ap, island, "graveyard");
    let s = toQuestion(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [obj(land)] }));
    expect(s.objects[land]!.zone).toBe("exile");
    expect(s.objects[land]!.mayPlay?.until).toBe("exiled");
    expect(s.objects[land]!.mayPlay?.castOnly).toBeUndefined();
    s = act(s, { type: "playLand", player: ap, objectId: land });
    expect(s.objects[land]!.zone).toBe("battlefield");
  });
});

describe("Brightglass Gearhulk: up to two artifact, creature, and/or enchantment cards with mana value 1 or less", () => {
  it("is fully supported", () => supported(gearhulk));

  it("finds an artifact and an enchantment with mana value 1 or less; not a 2-drop", () => {
    const { s: s0, ap, ids } = setup([gearhulk]);
    const [t, c, r] = [into(s0, ap, trinket, "library"), into(s0, ap, charm, "library"), into(s0, ap, rock, "library")];
    let s = toQuestion(run(s0, planCast(s0, ap, ids[0]!)));
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", max: 2 });
    const p = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect(p.cards).toContain(t);
    expect(p.cards).toContain(c);
    expect(p.cards).not.toContain(r);
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [t, c] }));
    expect(s.objects[t]!.zone).toBe("hand");
    expect(s.objects[c]!.zone).toBe("hand");
  });
});

describe("Finneas, Ace Archer: counters on each other token or Rabbit, then a card at 10 total power", () => {
  it("is fully supported", () => supported(finneas));

  it("counters on the other Rabbit and the token, not on other creatures or Finneas; draws with total power 10", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, finneas);
    const r = putOnBattlefield(s0, ap, rabbit);
    const tok = putOnBattlefield(s0, ap, ogre);
    s0.objects[tok]!.isToken = true;
    const o = putOnBattlefield(s0, ap, ogre);
    invalidateCharacteristics(s0);
    const hand = s0.players[ap]!.hand.length;
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: f, defender: next(s, ap) }] });
    s = resolveAll(s);
    expect(s.objects[r]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[tok]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[o]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.objects[f]!.counters["+1/+1"] ?? 0).toBe(0);
    // 2 + 3 + 4 + 3 = 12 power: a card.
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
});

describe("Dina's Guidance: a creature card into your hand or graveyard", () => {
  it("is fully supported", () => supported(guidance));

  it("the searcher chooses the graveyard; the bot keeps it in hand", () => {
    const { s: s0, ap, ids } = setup([guidance]);
    const g = into(s0, ap, giant, "library");
    let s = toQuestion(run(s0, planCast(s0, ap, ids[0]!)));
    s = act(s, { type: "searchLibrary", player: ap, found: [g] });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    expect(botActions(s, ap)).toEqual([{ type: "chooseMay", player: ap, yes: false }]);
    const yard = resolveAll(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(yard.objects[g]!.zone).toBe("graveyard");
    const hand = resolveAll(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(hand.objects[g]!.zone).toBe("hand");
  });
});

describe("Entrapment Maneuver: a sacrificed attacker's toughness in Soldier tokens", () => {
  it("is fully supported", () => supported(entrapment));

  it("the attacking player sacrifices an attacker; you create a Soldier for each point of its toughness", () => {
    const { s: s0, ap: me } = setup([]);
    const b = next(s0, me);
    let s = advance(s0, "main1", b);
    const g = putOnBattlefield(s, b, giant);
    const t = into(s, me, entrapment, "hand");
    for (const l of [island, island, island, card("Plains", "Basic Land — Plains")]) putOnBattlefield(s, me, l);
    s = passUntil(s, "declareAttackers", b);
    s = act(s, { type: "declareAttackers", player: b, attacks: [{ attacker: g, defender: me }] });
    for (let i = 0; i < 10 && waitingOn(s) !== me; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planCast(s, me, t, [player(b)]));
    s = resolveAll(s);
    expect(s.objects[g]!.zone).toBe("graveyard");
    expect(named(s, "Soldier").length).toBe(5);
    expect(named(s, "Soldier").every((id) => s.objects[id]!.controller === me)).toBe(true);
  });
});

describe("Éowyn, Shieldmaiden: two Knights if another Human entered this turn, then a card with six Humans", () => {
  it("is fully supported", () => supported(eowyn, loyalist));

  it("Éowyn entering by herself isn't another Human: no trigger", () => {
    const { s: s0, ap, ids } = setup([eowyn]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    s = advance(s, "beginCombat", ap);
    expect(named(s, "Human Knight")).toEqual([]);
  });

  it("another Human entered: two 2/2 red Knights with trample and haste; six Humans draw a card", () => {
    const { s: s0, ap, ids } = setup([human]);
    putOnBattlefield(s0, ap, eowyn);
    putOnBattlefield(s0, ap, human);
    invalidateCharacteristics(s0);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    const hand = s.players[ap]!.hand.length;
    s = advance(s, "beginCombat", ap);
    const knights = named(s, "Human Knight");
    expect(knights.length).toBe(2);
    const k = characteristics(s, s.objects[knights[0]!]!);
    expect([k.power, k.toughness, k.colors, objHasKeyword(s, s.objects[knights[0]!]!, "Trample"), objHasKeyword(s, s.objects[knights[0]!]!, "Haste")]).toEqual([2, 2, ["R"], true, true]);
    // Éowyn, two Test Humans and two Knights: five Humans, no card.
    expect(s.players[ap]!.hand.length).toBe(hand);
  });

  it("with six Humans after the tokens, it draws", () => {
    const { s: s0, ap, ids } = setup([human]);
    putOnBattlefield(s0, ap, eowyn);
    putOnBattlefield(s0, ap, human);
    putOnBattlefield(s0, ap, human);
    invalidateCharacteristics(s0);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    const hand = s.players[ap]!.hand.length;
    s = advance(s, "beginCombat", ap);
    expect(named(s, "Human Knight").length).toBe(2);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
});

describe("Legion Loyalist: battalion gives first strike, trample and can't be blocked by creature tokens", () => {
  it("three attackers: all your creatures gain first strike and trample; tokens can't block them", () => {
    const { s: s0, ap } = setup([]);
    const l = putOnBattlefield(s0, ap, loyalist);
    const a = putOnBattlefield(s0, ap, ogre);
    const b = putOnBattlefield(s0, ap, ogre);
    const home = putOnBattlefield(s0, ap, ogre);
    const opp = next(s0, ap);
    const tok = putOnBattlefield(s0, opp, ogre);
    s0.objects[tok]!.isToken = true;
    const real = putOnBattlefield(s0, opp, ogre);
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [l, a, b].map((attacker) => ({ attacker, defender: opp })) });
    s = resolveAll(s);
    for (const id of [l, a, b, home]) expect([objHasKeyword(s, s.objects[id]!, "First strike"), objHasKeyword(s, s.objects[id]!, "Trample")]).toEqual([true, true]);
    expect([blockProblem(s, s.objects[tok]!, s.objects[a]!) === null, blockProblem(s, s.objects[real]!, s.objects[a]!) === null]).toEqual([false, true]);
  });
});

describe("Saddled Rimestag: the same \"another ... entered this turn\" condition, as a static", () => {
  it("is fully supported", () => supported(rimestag));

  it("entering by itself doesn't count; another creature entering does", () => {
    const { s: s0, ap, ids } = setup([rimestag, human]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(pt(s, ids[0]!)).toBe("2/2");
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(pt(s, ids[0]!)).toBe("4/4");
  });
});
