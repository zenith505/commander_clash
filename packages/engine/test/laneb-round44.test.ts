// Lane B, round 44: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, scry, setup } from "./helpers";
import { botActions, compileCard, controllerOf, invalidateCharacteristics, isFullySupported, manaValue, moveObject, planActivate, planCast, power, spellCost, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty, answering choices as the bots would; the choices a test makes stop it. */
const settle = (s: GameState, stopAt: (s: GameState) => boolean = () => false) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (stopAt(s)) break;
    const p = s.pending;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Plays on (no attacks or blocks unless asked, the bots answering other questions) until `stop`. */
const goUntil = (s: GameState, stop: (s: GameState) => boolean) => {
  for (let i = 0; i < 3000; i++) {
    if (stop(s)) return s;
    const p = s.pending;
    const pid = waitingOn(s)!;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never got there");
};
const at = (kind: string, pid: PlayerId) => (s: GameState) => s.pending?.kind === kind && s.pending.player === pid;
const find = (s: GameState, pid: PlayerId, found: string[]) => act(s, { type: "searchLibrary", player: pid, found });
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}) => run(s, planCast(s, pid, id, targets, undefined, undefined, undefined, choices));
/** Moves a new card for `def` into `pid`'s hand, library (on top) or graveyard. */
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Passes to the declare attackers step of the active player's turn and declares `attackers` at `defender`; stops at the first question. */
const attackWith = (s: GameState, attackers: string[], defender: PlayerId) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  s = act(s, { type: "declareAttackers", player: s.activePlayer, attacks: attackers.map((attacker) => ({ attacker, defender })) });
  for (let i = 0; i < 50 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Leaves only `keep` in `pid`'s hand (setup's hand also holds the seven cards drawn). */
const onlyHand = (s: GameState, pid: PlayerId, keep: string[]) => {
  const p = s.players[pid]!;
  for (const id of p.hand.filter((id) => !keep.includes(id))) {
    s.objects[id]!.zone = "exile";
    p.exile.push(id);
  }
  p.hand = p.hand.filter((id) => keep.includes(id));
};
const counters = (s: GameState, id: string, kind = "+1/+1") => s.objects[id]!.counters?.[kind] ?? 0;
/** The total mana `pid` would pay for the card `id` now, with these targets. */
const costNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = []) => {
  const c = spellCost(s, pid, s.objects[id]!, 0, [], { targets });
  return manaValue(c.cost) + c.extra;
};

const toBlocks = (s: GameState) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const tapLands = (s: GameState, pid: PlayerId, keep: string[] = []) => {
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid && !keep.includes(id) && s.cards[s.objects[id]!.cardId]!.typeLine.includes("Land")) s.objects[id]!.tapped = true;
};

// Real oracle text (Scryfall).
const harnessInfinity = () => card("Harness Infinity", "Instant", "{1}{B}{B}{B}{G}{G}{G}", { cmc: 7, colors: ["B","G"], oracleText: "Exchange your hand and graveyard.\nExile Harness Infinity." });
const lethalSting = () => card("Lethal Sting", "Sorcery", "{2}{B}", { cmc: 3, colors: ["B"], oracleText: "As an additional cost to cast this spell, put a -1/-1 counter on a creature you control.\nDestroy target creature." });
const fearOfAbduction = () => card("Fear of Abduction", "Enchantment Creature — Nightmare", "{4}{W}{W}", { cmc: 6, colors: ["W"], power: "5", toughness: "5", keywords: ["Flying"], oracleText: "As an additional cost to cast this spell, exile a creature you control.\nFlying\nWhen this creature enters, exile target creature an opponent controls.\nWhen this creature leaves the battlefield, put each card exiled with it into its owner's hand." });
const safeHaven = () => card("Safe Haven", "Land", "", { cmc: 0, oracleText: "{2}, {T}: Exile target creature you control.\nAt the beginning of your upkeep, you may sacrifice this land. If you do, return each card exiled with this land to the battlefield under its owner's control." });
const dreadlightMonstrosity = () => card("Dreadlight Monstrosity", "Creature — Crab Horror", "{4}{U}{U}", { cmc: 6, colors: ["U"], power: "5", toughness: "5", keywords: ["Ward"], oracleText: "Ward {2} (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {2}.)\n{3}{U}{U}: This creature can't be blocked this turn. Activate only if you own a card in exile." });
const throneOfMakindi = () => card("Throne of Makindi", "Land", "", { cmc: 0, oracleText: "{T}: Add {C}.\n{1}, {T}: Put a charge counter on this land.\n{T}, Remove a charge counter from this land: Add two mana of any one color. Spend this mana only to cast kicked spells." });
const unblinkingObserver = () => card("Unblinking Observer", "Creature — Homunculus", "{1}{U}", { cmc: 2, colors: ["U"], power: "2", toughness: "1", oracleText: "{T}: Add {U}. Spend this mana only to pay a disturb cost or cast an instant or sorcery spell." });
const burstLightning = () => card("Burst Lightning", "Instant", "{R}", { cmc: 1, colors: ["R"], keywords: ["Kicker"], oracleText: "Kicker {4} (You may pay an additional {4} as you cast this spell.)\nBurst Lightning deals 2 damage to any target. If this spell was kicked, it deals 4 damage instead." });
const tomikOrzhovLawmage = () => card("Tomik, Orzhov Lawmage", "Legendary Creature — Human Advisor", "{1}{W}", { cmc: 2, colors: ["W"], power: "2", toughness: "1", keywords: ["Flying"], oracleText: "Flying\nPlaneswalkers you control have \"No more than one creature can attack this planeswalker each combat.\"\n{T}: Target creature with a +1/+1 counter on it gains flying until end of turn." });
const shardConvergence = () => card("Shard Convergence", "Sorcery", "{3}{G}", { cmc: 4, colors: ["G"], oracleText: "Search your library for a Plains card, an Island card, a Swamp card, and a Mountain card. Reveal those cards, put them into your hand, then shuffle." });
const gemOfBecoming = () => card("Gem of Becoming", "Artifact", "{3}", { cmc: 3, oracleText: "{3}, {T}, Sacrifice this artifact: Search your library for an Island card, a Swamp card, and a Mountain card. Reveal those cards, put them into your hand, then shuffle." });
const throwFromTheSaddle = () => card("Throw from the Saddle", "Sorcery", "{1}{G}", { cmc: 2, colors: ["G"], oracleText: "Target creature you control gets +1/+1 until end of turn. Put a +1/+1 counter on it instead if it's a Mount. Then it deals damage equal to its power to target creature you don't control." });
const lastStand = () => card("Last Stand", "Sorcery", "{W}{U}{B}{R}{G}", { cmc: 5, colors: ["B","G","R","U","W"], oracleText: "Target opponent loses 2 life for each Swamp you control. Last Stand deals damage to target creature equal to the number of Mountains you control. Create a 1/1 green Saproling creature token for each Forest you control. You gain 2 life for each Plains you control. Draw a card for each Island you control, then discard that many cards." });
const chargingCinderhorn = () => card("Charging Cinderhorn", "Creature — Elemental Ox", "{3}{R}", { cmc: 4, colors: ["R"], power: "4", toughness: "2", keywords: ["Haste"], oracleText: "Haste\nAt the beginning of each player's end step, if no creatures attacked this turn, put a fury counter on this creature. Then this creature deals damage equal to the number of fury counters on it to that player." });
const ultronsAuxiliary = () => card("Ultron's Auxiliary", "Artifact Creature — Robot Villain", "{1}{B}", { cmc: 2, colors: ["B"], power: "1", toughness: "1", keywords: ["Menace"], oracleText: "Menace\nWhenever another artifact is put into your graveyard from the battlefield or an artifact card is put into your graveyard from anywhere other than the battlefield, put a +1/+1 counter on this creature." });
const futuristOperative = () => card("Futurist Operative", "Creature — Human Ninja", "{3}{U}", { cmc: 4, colors: ["U"], power: "3", toughness: "4", oracleText: "As long as this creature is tapped, it's a Human Citizen with base power and toughness 1/1 and can't be blocked.\n{2}{U}: Untap this creature." });
const dovinsAcuity = () => card("Dovin's Acuity", "Enchantment", "{1}{W}{U}", { cmc: 3, colors: ["U","W"], oracleText: "When this enchantment enters, you gain 2 life and draw a card.\nWhenever you cast an instant spell during your main phase, you may return this enchantment to its owner's hand." });
const karolinaDeanRunaway = () => card("Karolina Dean, Runaway", "Legendary Creature — Alien Hero", "{3}{R}", { cmc: 4, colors: ["R"], power: "3", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nAt the beginning of your first main phase, add {W}{U}{B}{R}{G}. This mana can't be spent to cast spells from your hand." });
const rofellossGift = () => card("Rofellos's Gift", "Sorcery", "{G}", { cmc: 1, colors: ["G"], oracleText: "Reveal any number of green cards in your hand. Return an enchantment card from your graveyard to your hand for each card revealed this way." });
const celestialConvergence = () => card("Celestial Convergence", "Enchantment", "{2}{W}{W}", { cmc: 4, colors: ["W"], oracleText: "This enchantment enters with seven omen counters on it.\nAt the beginning of your upkeep, remove an omen counter from this enchantment. If there are no omen counters on this enchantment, the player with the highest life total wins the game. If two or more players are tied for highest life total, the game is a draw." });
const sereneMaster = () => card("Serene Master", "Creature — Human Monk", "{1}{W}", { cmc: 2, colors: ["W"], power: "0", toughness: "2", oracleText: "Whenever this creature blocks, exchange its power and the power of target creature it's blocking until end of combat." });
const lamplightPhoenix = () => card("Lamplight Phoenix", "Creature — Phoenix", "{1}{R}{R}", { cmc: 3, colors: ["R"], power: "3", toughness: "3", keywords: ["Flying","Collect evidence"], oracleText: "Flying\nWhen this creature dies, you may exile it and collect evidence 4. If you do, return this card to the battlefield tapped. (To collect evidence 4, exile cards with total mana value 4 or greater from your graveyard.)" });
const doomsdaySpecter = () => card("Doomsday Specter", "Creature — Specter", "{2}{U}{B}", { cmc: 4, colors: ["B","U"], power: "2", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, return a blue or black creature you control to its owner's hand.\nWhenever this creature deals combat damage to a player, look at that player's hand and choose a card from it. The player discards that card." });
const baithookAngler = () => scry("transform", [{ name: "Baithook Angler", mana_cost: "{1}{U}", type_line: "Creature — Human Peasant", oracle_text: "Disturb {1}{U} (You may cast this card from your graveyard transformed for its disturb cost.)", power: "2", toughness: "1" }, { name: "Hook-Haunt Drifter", type_line: "Creature — Spirit", oracle_text: "Flying\nIf Hook-Haunt Drifter would be put into a graveyard from anywhere, exile it instead.", power: "1", toughness: "2", color_indicator: ["U"] }], { keywords: ["Flying", "Transform", "Disturb"] });

// Test cards.
const vanilla = (name: string, typeLine: string, cost: string, cmc: number, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, cost, { cmc, power: String(p), toughness: String(t), ...extra });
const bolt = () => card("Test Bolt", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Test Bolt deals 3 damage to any target." });
const opt = () => card("Test Opt", "Instant", "{U}", { cmc: 1, colors: ["U"], oracleText: "Draw a card." });
const murder = () => card("Test Murder", "Instant", "{1}{B}{B}", { cmc: 3, colors: ["B"], oracleText: "Destroy target creature." });
const swampCard = () => card("Swamp", "Basic Land — Swamp", "", { cmc: 0 });
const forestCard = () => card("Forest", "Basic Land — Forest", "", { cmc: 0 });

describe("Lane B round 44 cards", () => {
  it("are fully supported", () => {
    supported(harnessInfinity(), lethalSting(), fearOfAbduction(), safeHaven(), dreadlightMonstrosity(), throneOfMakindi(), unblinkingObserver(), tomikOrzhovLawmage(), shardConvergence(), gemOfBecoming(), throwFromTheSaddle(), lastStand(), chargingCinderhorn(), ultronsAuxiliary(), futuristOperative(), dovinsAcuity(), karolinaDeanRunaway(), rofellossGift(), celestialConvergence(), sereneMaster(), lamplightPhoenix(), doomsdaySpecter());
  });
});

describe("Harness Infinity", () => {
  it("exchanges your hand and graveyard, then exiles itself", () => {
    const { s: s0, ap, ids } = setup([harnessInfinity(), opt(), bolt()]);
    onlyHand(s0, ap, ids);
    putOnBattlefield(s0, ap, swampCard());
    const dead = toZone(s0, ap, vanilla("Dead Bear", "Creature — Bear", "{1}{G}", 2, 2, 2), "graveyard");
    const s = settle(castNow(s0, ap, ids[0]!));
    expect([zone(s, ids[1]!), zone(s, ids[2]!), zone(s, dead), zone(s, ids[0]!)]).toEqual(["graveyard", "graveyard", "hand", "exile"]);
    expect(s.players[ap]!.hand).toEqual([dead]);
  });
});

describe("Lethal Sting", () => {
  it("puts a -1/-1 counter on a creature you control as it's cast and destroys the target", () => {
    const { s: s0, ap, ids, opp } = setup([lethalSting()]);
    const mine = putOnBattlefield(s0, ap, vanilla("My Beast", "Creature — Beast", "{2}{G}", 3, 3, 3));
    const theirs = putOnBattlefield(s0, opp, vanilla("Their Beast", "Creature — Beast", "{2}{G}", 3, 3, 3));
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(theirs)], { counterOn: [mine] }));
    expect([zone(s, theirs), counters(s, mine, "-1/-1"), pt(s, mine)]).toEqual(["graveyard", 1, "2/2"]);
  });
  it("can't be cast without a creature you control", () => {
    const { s, ap, ids, opp } = setup([lethalSting()]);
    const theirs = putOnBattlefield(s, opp, vanilla("Their Beast", "Creature — Beast", "{2}{G}", 3, 3, 3));
    expect(planCast(s, ap, ids[0]!, [tgt(theirs)])).toBeNull();
  });
});

describe("Fear of Abduction", () => {
  it("returns both the creature exiled for its cost and the one its enters ability exiled to their owners' hands when it leaves", () => {
    const { s: s0, ap, ids, opp } = setup([fearOfAbduction(), murder()]);
    const mine = putOnBattlefield(s0, ap, vanilla("My Beast", "Creature — Beast", "{2}{G}", 3, 3, 3));
    const theirs = putOnBattlefield(s0, opp, vanilla("Their Beast", "Creature — Beast", "{2}{G}", 3, 3, 3));
    let s = castNow(s0, ap, ids[0]!, [], { sacrifice: [mine] });
    expect(zone(s, mine)).toBe("exile");
    s = settle(s, (x) => x.pending?.kind === "chooseTargets");
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(theirs)] });
    s = settle(s);
    expect([zone(s, ids[0]!), zone(s, theirs)]).toEqual(["battlefield", "exile"]);
    s = settle(castNow(s, ap, ids[1]!, [tgt(ids[0]!)]));
    expect([zone(s, ids[0]!), zone(s, mine), zone(s, theirs)]).toEqual(["graveyard", "hand", "hand"]);
    expect([s.players[ap]!.hand.includes(mine), s.players[opp]!.hand.includes(theirs)]).toEqual([true, true]);
  });
});

describe("Safe Haven", () => {
  it("exiles a creature you control and returns it under its owner's control when sacrificed in your upkeep", () => {
    const { s: s0, ap, opp } = setup([]);
    const haven = putOnBattlefield(s0, ap, safeHaven());
    const mine = putOnBattlefield(s0, ap, vanilla("My Beast", "Creature — Beast", "{2}{G}", 3, 3, 3));
    const borrowed = putOnBattlefield(s0, opp, vanilla("Borrowed Beast", "Creature — Beast", "{2}{G}", 3, 3, 3));
    s0.objects[borrowed]!.controller = ap;
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planActivate(s0, ap, haven, 0, [tgt(mine)])));
    s.objects[haven]!.tapped = false;
    s = settle(run(s, planActivate(s, ap, haven, 0, [tgt(borrowed)])));
    expect([zone(s, mine), zone(s, borrowed)]).toEqual(["exile", "exile"]);
    s = goUntil(s, (x) => at("chooseMay", ap)(x) && x.activePlayer === ap && x.step === "upkeep");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect([zone(s, haven), zone(s, mine), zone(s, borrowed)]).toEqual(["graveyard", "battlefield", "battlefield"]);
    expect([controllerOf(s, s.objects[mine]!), controllerOf(s, s.objects[borrowed]!)]).toEqual([ap, opp]);
  });
});

describe("Dreadlight Monstrosity", () => {
  it("can be made unblockable only while you own a card in exile, face down or not", () => {
    const { s, ap } = setup([]);
    const crab = putOnBattlefield(s, ap, dreadlightMonstrosity());
    expect(planActivate(s, ap, crab, 0)).toBeNull();
    const gone = toZone(s, ap, opt(), "hand");
    moveObject(s, gone, "exile");
    s.objects[gone]!.hiddenExile = { by: crab, seen: [ap] };
    expect(planActivate(s, ap, crab, 0)).not.toBeNull();
  });
  it("doesn't count a card another player owns in exile", () => {
    const { s, ap, opp } = setup([]);
    const crab = putOnBattlefield(s, ap, dreadlightMonstrosity());
    moveObject(s, toZone(s, opp, opt(), "hand"), "exile");
    expect(planActivate(s, ap, crab, 0)).toBeNull();
  });
});

describe("Throne of Makindi", () => {
  it("its two mana pays only for a kicked spell", () => {
    const { s, ap, ids } = setup([burstLightning(), vanilla("Big Red", "Creature — Giant", "{3}{R}{R}", 5, 5, 5)]);
    const throne = putOnBattlefield(s, ap, throneOfMakindi());
    s.objects[throne]!.counters.charge = 1;
    const mountains = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Mountain");
    tapLands(s, ap, [...mountains, throne]);
    expect(planCast(s, ap, ids[1]!)).toBeNull();
    const kicked = planCast(s, ap, ids[0]!, [ply(s.turnOrder.find((p) => p !== ap)!)], undefined, undefined, undefined, { kicks: [0] });
    expect(kicked).not.toBeNull();
    const after = settle(run(s, kicked));
    expect(counters(after, throne, "charge")).toBe(0);
  });
});

describe("Unblinking Observer", () => {
  it("its mana pays for an instant or a disturb cost, not a creature spell from your hand", () => {
    const { s, ap, ids } = setup([opt(), vanilla("Blue Bear", "Creature — Bear", "{U}", 1, 1, 1), baithookAngler()]);
    putOnBattlefield(s, ap, unblinkingObserver());
    putOnBattlefield(s, ap, unblinkingObserver());
    tapLands(s, ap);
    moveObject(s, ids[2]!, "graveyard");
    expect(planCast(s, ap, ids[1]!)).toBeNull();
    expect(planCast(s, ap, ids[0]!)).not.toBeNull();
    const disturb = planCast(s, ap, ids[2]!, undefined, undefined, "auto", undefined, { face: 1, via: "disturb" });
    expect(disturb).not.toBeNull();
    const after = settle(run(s, disturb));
    expect(zone(after, ids[2]!)).toBe("battlefield");
  });
});

describe("Tomik, Orzhov Lawmage", () => {
  it("lets no more than one creature attack each planeswalker its controller controls", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, tomikOrzhovLawmage());
    const pw = putOnBattlefield(s0, opp, card("Test Walker", "Legendary Planeswalker — Testwalker", "{3}", { cmc: 3, loyalty: "5", oracleText: "+1: You gain 1 life." }));
    s0.objects[pw]!.counters.loyalty = 5;
    const a = putOnBattlefield(s0, ap, vanilla("Bear A", "Creature — Bear", "{1}{G}", 2, 2, 2));
    const b = putOnBattlefield(s0, ap, vanilla("Bear B", "Creature — Bear", "{1}{G}", 2, 2, 2));
    let s = s0;
    for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp, planeswalker: pw }, { attacker: b, defender: opp, planeswalker: pw }] })).toThrow(/no more than one creature can attack Test Walker/);
    const ok = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp, planeswalker: pw }, { attacker: b, defender: opp }] });
    expect([ok.objects[a]!.attacking, ok.objects[b]!.attacking]).not.toContain(undefined);
  });
});

describe("Shard Convergence", () => {
  it("finds a Plains, an Island, a Swamp and a Mountain card", () => {
    const { s: s0, ap, ids } = setup([shardConvergence()]);
    const lands = ["Plains", "Island", "Swamp", "Mountain"].map((n) => toZone(s0, ap, card(n, `Basic Land — ${n}`, "", { cmc: 0 }), "library"));
    let s = settle(castNow(s0, ap, ids[0]!), (x) => x.pending?.kind === "searchLibrary");
    expect(s.pending?.kind).toBe("searchLibrary");
    s = settle(find(s, ap, lands));
    expect(lands.map((id) => zone(s, id))).toEqual(["hand", "hand", "hand", "hand"]);
  });
  it("doesn't take two cards of one land type", () => {
    const { s: s0, ap, ids } = setup([shardConvergence()]);
    const two = [toZone(s0, ap, card("Island", "Basic Land — Island", "", { cmc: 0 }), "library"), toZone(s0, ap, card("Island", "Basic Land — Island", "", { cmc: 0 }), "library")];
    const s = settle(castNow(s0, ap, ids[0]!), (x) => x.pending?.kind === "searchLibrary");
    expect(() => find(s, ap, two)).toThrow();
  });
});

describe("Gem of Becoming", () => {
  it("finds an Island, a Swamp and a Mountain card", () => {
    const { s: s0, ap } = setup([]);
    const gem = putOnBattlefield(s0, ap, gemOfBecoming());
    const lands = ["Island", "Swamp", "Mountain"].map((n) => toZone(s0, ap, card(n, `Basic Land — ${n}`, "", { cmc: 0 }), "library"));
    let s = settle(run(s0, planActivate(s0, ap, gem, 0)), (x) => x.pending?.kind === "searchLibrary");
    s = settle(find(s, ap, lands));
    expect([...lands.map((id) => zone(s, id)), zone(s, gem)]).toEqual(["hand", "hand", "hand", "graveyard"]);
  });
});

describe("Throw from the Saddle", () => {
  it("pumps a creature that isn't a Mount, then it deals damage equal to its power", () => {
    const { s: s0, ap, ids, opp } = setup([throwFromTheSaddle()]);
    const mine = putOnBattlefield(s0, ap, vanilla("My Bear", "Creature — Bear", "{1}{G}", 2, 2, 2));
    const theirs = putOnBattlefield(s0, opp, vanilla("Their Beast", "Creature — Beast", "{2}{G}", 3, 3, 3));
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(mine), tgt(theirs)]));
    expect([pt(s, mine), counters(s, mine), zone(s, theirs)]).toEqual(["3/3", 0, "graveyard"]);
  });
  it("puts a +1/+1 counter on a Mount instead", () => {
    const { s: s0, ap, ids, opp } = setup([throwFromTheSaddle()]);
    const mount = putOnBattlefield(s0, ap, vanilla("My Horse", "Creature — Horse Mount", "{1}{G}", 2, 2, 2));
    const theirs = putOnBattlefield(s0, opp, vanilla("Their Wall", "Creature — Wall", "{2}{G}", 0, 4, 4));
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(mount), tgt(theirs)]));
    expect([pt(s, mount), counters(s, mount), s.objects[theirs]!.damage]).toEqual(["3/3", 1, 3]);
    s = goUntil(s, (x) => x.activePlayer !== ap);
    expect(pt(s, mount)).toBe("3/3");
  });
});

describe("Last Stand", () => {
  it("counts each basic land type you control for its own part", () => {
    const { s: s0, ap, ids, opp } = setup([lastStand()]);
    onlyHand(s0, ap, ids);
    const theirs = putOnBattlefield(s0, opp, vanilla("Their Giant", "Creature — Giant", "{4}{R}", 5, 5, 5));
    const hand0 = s0.players[ap]!.hand.length;
    // Lands: 3 Mountains, 3 Islands, 3 Forests, 3 Plains, 2 Swamps (setup).
    const s = settle(castNow(s0, ap, ids[0]!, [ply(opp), tgt(theirs)]));
    const saprolings = s.battlefield.filter((id) => s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]!.name === "Saproling Token");
    expect([life(s, opp), s.objects[theirs]!.damage, saprolings.length, life(s, ap)]).toEqual([36, 3, 3, 46]);
    expect([s.players[ap]!.hand.length, s.players[ap]!.graveyard.length]).toEqual([hand0 - 1, 4]);
  });
});

describe("Charging Cinderhorn", () => {
  it("at each end step with no attacks gets a fury counter, then deals that much damage to the active player", () => {
    const { s: s0, ap } = setup([]);
    const ox = putOnBattlefield(s0, ap, chargingCinderhorn());
    let s = goUntil(s0, (x) => x.step === "cleanup" && x.activePlayer === ap);
    expect([counters(s, ox, "fury"), life(s, ap)]).toEqual([1, 39]);
    const next = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    const before = life(s, next);
    s = goUntil(s, (x) => x.step === "cleanup" && x.activePlayer === next);
    expect([counters(s, ox, "fury"), life(s, next)]).toEqual([2, before - 2]);
  });
  it("doesn't trigger in a turn a creature attacked", () => {
    const { s: s0, ap, opp } = setup([]);
    const ox = putOnBattlefield(s0, ap, chargingCinderhorn());
    const bear = putOnBattlefield(s0, ap, vanilla("Bear", "Creature — Bear", "{1}{G}", 2, 2, 2));
    let s = attackWith(s0, [bear], opp);
    s = goUntil(s, (x) => x.step === "cleanup" && x.activePlayer === ap);
    expect([counters(s, ox, "fury"), life(s, ap)]).toEqual([0, 40]);
  });
});

describe("Ultron's Auxiliary", () => {
  it("gets a counter when another artifact goes to your graveyard from the battlefield or an artifact card from your hand", () => {
    const { s: s0, ap, ids } = setup([murder(), card("Test Mill", "Instant", "{U}", { cmc: 1, colors: ["U"], oracleText: "Mill two cards." })]);
    const ultron = putOnBattlefield(s0, ap, ultronsAuxiliary());
    const golem = putOnBattlefield(s0, ap, vanilla("Test Golem", "Artifact Creature — Golem", "{3}", 3, 3, 3));
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(golem)]));
    expect([zone(s, golem), counters(s, ultron)]).toEqual(["graveyard", 1]);
    toZone(s, ap, card("Test Relic", "Artifact", "{2}", { cmc: 2, oracleText: "" }), "library");
    toZone(s, ap, card("Test Relic", "Artifact", "{2}", { cmc: 2, oracleText: "" }), "library");
    s = settle(castNow(s, ap, ids[1]!));
    expect(counters(s, ultron)).toBe(3);
  });
  it("doesn't count a nonartifact card or another player's artifact", () => {
    const { s: s0, ap, ids, opp } = setup([murder(), opt()]);
    const ultron = putOnBattlefield(s0, ap, ultronsAuxiliary());
    const golem = putOnBattlefield(s0, opp, vanilla("Test Golem", "Artifact Creature — Golem", "{3}", 3, 3, 3));
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(golem)]));
    moveObject(s, ids[1]!, "graveyard");
    s = settle(s);
    expect([zone(s, golem), counters(s, ultron)]).toEqual(["graveyard", 0]);
  });
});

describe("Futurist Operative", () => {
  it("is a 1/1 Human Citizen that can't be blocked while tapped, and a 3/4 Ninja otherwise", () => {
    const { s: s0, ap, opp } = setup([]);
    const ninja = putOnBattlefield(s0, ap, futuristOperative());
    putOnBattlefield(s0, opp, vanilla("Their Wall", "Creature — Wall", "{2}{G}", 3, 0, 5));
    expect(pt(s0, ninja)).toBe("3/4");
    let s = toBlocks(attackWith(s0, [ninja], opp));
    expect(pt(s, ninja)).toBe("1/1");
    const tl = s.cards[s.objects[ninja]!.cardId]!;
    expect(tl.name).toBe("Futurist Operative");
    expect(s.pending?.kind).toBe("declareBlockers");
    const wall = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Their Wall")!;
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: wall, attacker: ninja }] })).toThrow(/can't be blocked/);
    s = goUntil(s, (x) => x.step === "end");
    s = run(s, planActivate(s, ap, ninja, 0));
    s = settle(s);
    expect([s.objects[ninja]!.tapped, pt(s, ninja)]).toEqual([false, "3/4"]);
  });
});

describe("Dovin's Acuity", () => {
  it("gains 2 life and draws when it enters, and may return to hand when you cast an instant in your main phase", () => {
    const { s: s0, ap, ids } = setup([dovinsAcuity(), opt()]);
    const hand0 = s0.players[ap]!.hand.length;
    let s = settle(castNow(s0, ap, ids[0]!));
    expect([zone(s, ids[0]!), life(s, ap), s.players[ap]!.hand.length]).toEqual(["battlefield", 42, hand0]);
    s = castNow(s, ap, ids[1]!);
    s = settle(s, at("chooseMay", ap));
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(zone(s, ids[0]!)).toBe("hand");
  });
  it("doesn't trigger for an instant cast outside your main phase", () => {
    const { s: s0, ap, ids } = setup([opt()]);
    const acuity = putOnBattlefield(s0, ap, dovinsAcuity());
    let s = goUntil(s0, (x) => x.step === "end" && x.activePlayer === ap && !x.pending && !x.stack.length && waitingOn(x) === ap);
    s = settle(castNow(s, ap, ids[0]!));
    expect([zone(s, acuity), zone(s, ids[0]!)]).toEqual(["battlefield", "graveyard"]);
  });
});

describe("Karolina Dean, Runaway", () => {
  it("adds WUBRG at your first main phase that can't pay for a spell from your hand", () => {
    const { s: s0, ap, ids } = setup([vanilla("Blue Bear", "Creature — Bear", "{U}", 1, 1, 1)]);
    putOnBattlefield(s0, ap, karolinaDeanRunaway());
    const sink = putOnBattlefield(s0, ap, card("Test Sink", "Artifact", "{1}", { cmc: 1, oracleText: "{W}{U}{B}{R}{G}: You gain 5 life." }));
    tapLands(s0, ap);
    s0.step = "upkeep";
    let s = goUntil(s0, (x) => x.step === "main1" && !x.stack.length && !x.triggerQueue.length && !x.pending);
    expect(Object.values(s.players[ap]!.manaPool).reduce((a, b) => a + b, 0)).toBe(5);
    expect(planCast(s, ap, ids[0]!)).toBeNull();
    s = settle(run(s, planActivate(s, ap, sink, 0)));
    expect([life(s, ap), Object.values(s.players[ap]!.manaPool).reduce((a, b) => a + b, 0)]).toEqual([45, 0]);
  });
});

describe("Rofellos's Gift", () => {
  it("returns an enchantment card from your graveyard for each green card revealed", () => {
    const g1 = vanilla("Green Bear", "Creature — Bear", "{1}{G}", 2, 2, 2, { colors: ["G"] });
    const g2 = vanilla("Green Elk", "Creature — Elk", "{1}{G}", 2, 2, 2, { colors: ["G"] });
    const { s: s0, ap, ids } = setup([rofellossGift(), g1, g2, opt()]);
    onlyHand(s0, ap, ids);
    const ench = [1, 2, 3].map((i) => toZone(s0, ap, card(`Test Aura ${i}`, "Enchantment", "{1}", { cmc: 1, oracleText: "" }), "graveyard"));
    let s = settle(castNow(s0, ap, ids[0]!), (x) => x.pending?.kind === "searchLibrary");
    expect(s.pending?.kind === "searchLibrary" && s.pending.cards.sort()).toEqual([ids[1]!, ids[2]!].sort());
    s = settle(find(s, ap, [ids[1]!, ids[2]!]), (x) => x.pending?.kind === "searchLibrary");
    expect(s.pending?.kind === "searchLibrary" && [s.pending.min, s.pending.max]).toEqual([2, 2]);
    s = settle(find(s, ap, [ench[0]!, ench[2]!]));
    expect(ench.map((id) => zone(s, id))).toEqual(["hand", "graveyard", "hand"]);
  });
});

describe("Celestial Convergence", () => {
  const removeLast = (lives: number[]) => {
    const { s: s0, ap } = setup([]);
    const conv = putOnBattlefield(s0, ap, celestialConvergence());
    s0.objects[conv]!.counters.omen = 1;
    s0.turnOrder.forEach((p, i) => (s0.players[p]!.life = lives[i]!));
    s0.step = "untap";
    return { s: goUntil(s0, (x) => x.over || x.step === "draw"), ap, conv };
  };
  it("enters with seven omen counters", () => {
    const { s: s0, ap, ids } = setup([celestialConvergence()]);
    const s = settle(castNow(s0, ap, ids[0]!));
    expect(counters(s, ids[0]!, "omen")).toBe(7);
  });
  it("makes the player with the highest life total win when the last counter is removed", () => {
    const { s } = removeLast([40, 20, 45, 30]);
    expect([s.over, s.winner]).toEqual([true, s.turnOrder[2]]);
  });
  it("makes the game a draw when the highest life total is tied", () => {
    const { s } = removeLast([45, 20, 45, 30]);
    expect([s.over, s.winner]).toEqual([true, null]);
  });
});

describe("Serene Master", () => {
  it("exchanges its power with the creature it blocks until end of combat", () => {
    const { s: s0, ap, opp } = setup([]);
    const master = putOnBattlefield(s0, opp, sereneMaster());
    const giant = putOnBattlefield(s0, ap, vanilla("Test Giant", "Creature — Giant", "{4}{R}", 5, 5, 6));
    let s = toBlocks(attackWith(s0, [giant], opp));
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: master, attacker: giant }] });
    s = settle(s, (x) => x.pending?.kind === "chooseTargets");
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: opp, targets: [tgt(giant)] });
    s = settle(s);
    expect([pt(s, master), pt(s, giant)]).toEqual(["5/2", "0/6"]);
    s = goUntil(s, (x) => x.step === "main2");
    expect([zone(s, master), zone(s, giant), s.objects[master]?.damage ?? 0]).toEqual(["battlefield", "battlefield", 0]);
    expect([pt(s, master), s.objects[giant]!.damage]).toEqual(["0/2", 5]);
  });
});

describe("Lamplight Phoenix", () => {
  it("exiles itself and collects evidence 4 from other cards to return to the battlefield tapped", () => {
    const { s: s0, ap, ids } = setup([murder()]);
    const bird = putOnBattlefield(s0, ap, lamplightPhoenix());
    const yard = [toZone(s0, ap, murder(), "graveyard"), toZone(s0, ap, opt(), "graveyard")];
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(bird)]), at("collectEvidence", ap));
    expect(s.pending).toMatchObject({ kind: "collectEvidence", player: ap, n: 4, not: bird });
    expect(() => act(s, { type: "collectEvidence", player: ap, ids: [yard[0]!, bird] })).toThrow();
    s = settle(act(s, { type: "collectEvidence", player: ap, ids: yard }));
    expect([zone(s, bird), s.objects[bird]!.tapped, ...yard.map((id) => zone(s, id))]).toEqual(["battlefield", true, "exile", "exile"]);
  });
  it("can't count itself toward the evidence", () => {
    // Test Bolt (mana value 1) is the only other card there; with the Phoenix's own 3 it would make 4.
    const { s: s0, ap, ids } = setup([bolt()]);
    const bird = putOnBattlefield(s0, ap, lamplightPhoenix());
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(bird)]), at("collectEvidence", ap));
    expect([s.pending?.kind, zone(s, bird), zone(s, ids[0]!)]).toEqual([undefined, "graveyard", "graveyard"]);
  });
  it("stays in the graveyard if you collect no evidence", () => {
    const { s: s0, ap, ids } = setup([murder()]);
    const bird = putOnBattlefield(s0, ap, lamplightPhoenix());
    toZone(s0, ap, murder(), "graveyard");
    toZone(s0, ap, opt(), "graveyard");
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(bird)]), at("collectEvidence", ap));
    s = settle(act(s, { type: "collectEvidence", player: ap, ids: [] }));
    expect(zone(s, bird)).toBe("graveyard");
  });
});

describe("Doomsday Specter", () => {
  it("looks at the hand of the player it dealt combat damage to and makes them discard the card you choose", () => {
    const { s: s0, ap, opp } = setup([]);
    const specter = putOnBattlefield(s0, ap, doomsdaySpecter());
    const theirs = [toZone(s0, opp, opt(), "hand"), toZone(s0, opp, bolt(), "hand")];
    onlyHand(s0, opp, theirs);
    let s = toBlocks(attackWith(s0, [specter], opp));
    s = act(s, { type: "declareBlockers", player: opp, blocks: [] });
    s = goUntil(s, at("searchLibrary", ap));
    expect(s.pending?.kind === "searchLibrary" && s.pending.cards.sort()).toEqual([...theirs].sort());
    s = settle(find(s, ap, [theirs[1]!]));
    expect([zone(s, theirs[0]!), zone(s, theirs[1]!)]).toEqual(["hand", "graveyard"]);
  });
});
