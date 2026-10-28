// Lane B, round 33: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup, swamp } from "./helpers";
import { botActions, characteristics, exilePlayable, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const at = (kind: string, pid: PlayerId) => (s: GameState) => s.pending?.kind === kind && s.pending.player === pid;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], x?: number, choices: CostChoices = {}) => run(s, planCast(s, pid, id, targets, undefined, "auto", x, choices));
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
/** Passes to the declare blockers step and has the defending player declare `blocks` (blocker, attacker). */
const blockWith = (s: GameState, blocks: [string, string][]) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  const p = s.pending!;
  return act(s, { type: "declareBlockers", player: p.player, blocks: blocks.map(([blocker, attacker]) => ({ blocker, attacker })) });
};
const choose = (s: GameState, choice: string) => act(s, { type: "chooseOption", player: s.pending!.player, choice });
const kws = (s: GameState, id: string, kw: string) => objHasKeyword(s, s.objects[id]!, kw);
/** The token named `name` ("Wolf" for a Wolf token) on the battlefield. */
const tokenNamed = (s: GameState, name: string) => s.battlefield.find((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).name.replace(/ Token$/, "") === name)!;
const nextPlayer = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;

// Real oracle text (Scryfall).
const stormElemental = () => card("Storm Elemental", "Creature — Elemental", "{5}{U}", { cmc: 6, colors: ["U"], power: "3", toughness: "4", keywords: ["Flying"], oracleText: "Flying\n{U}, Exile the top card of your library: Tap target creature with flying.\n{U}, Exile the top card of your library: If the exiled card is a snow land, this creature gets +1/+1 until end of turn." });
const soundTheCall = () => card("Sound the Call", "Sorcery", "{2}{G}", { cmc: 3, colors: ["G"], oracleText: "Create a 1/1 green Wolf creature token. It has \"This token gets +1/+1 for each card named Sound the Call in each graveyard.\"" });
const deathpactAngel = () => card("Deathpact Angel", "Creature — Angel", "{3}{W}{B}{B}", { cmc: 6, colors: ["B", "W"], power: "5", toughness: "5", keywords: ["Flying"], oracleText: "Flying\nWhen this creature dies, create a 1/1 white and black Cleric creature token. It has \"{3}{W}{B}{B}, {T}, Sacrifice this token: Return a card named Deathpact Angel from your graveyard to the battlefield.\"" });
const rekindlingPhoenix = () => card("Rekindling Phoenix", "Creature — Phoenix", "{2}{R}{R}", { cmc: 4, colors: ["R"], power: "4", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nWhen this creature dies, create a 0/1 red Elemental creature token with \"At the beginning of your upkeep, sacrifice this token and return target card named Rekindling Phoenix from your graveyard to the battlefield. It gains haste until end of turn.\"" });
const foodFight = () => card("Food Fight", "Enchantment", "{1}{R}", { cmc: 2, colors: ["R"], oracleText: "Artifacts you control have \"{2}, Sacrifice this artifact: It deals damage to any target equal to 1 plus the number of permanents named Food Fight you control.\"" });
const elkinBottle = () => card("Elkin Bottle", "Artifact", "{3}", { cmc: 3, colors: [], oracleText: "{3}, {T}: Exile the top card of your library. Until the beginning of your next upkeep, you may play that card." });
const desperateResearch = () => card("Desperate Research", "Sorcery", "{1}{B}", { cmc: 2, colors: ["B"], oracleText: "Choose a card name other than a basic land card name. Reveal the top seven cards of your library and put all of them with that name into your hand. Exile the rest." });
const pompousGadabout = () => card("Pompous Gadabout", "Creature — Human Citizen", "{2}{G}", { cmc: 3, colors: ["G"], power: "4", toughness: "2", oracleText: "During your turn, this creature has hexproof.\nThis creature can't be blocked by creatures that don't have a name." });
const deepwoodElder = () => card("Deepwood Elder", "Creature — Dryad Spellshaper", "{G}{G}", { cmc: 2, colors: ["G"], power: "2", toughness: "2", oracleText: "{X}{G}{G}, {T}, Discard a card: X target lands become Forests until end of turn." });
const warlordsElite = () => card("Warlord's Elite", "Creature — Human Soldier", "{2}{W}", { cmc: 3, colors: ["W"], power: "4", toughness: "4", oracleText: "As an additional cost to cast this spell, tap two untapped artifacts, creatures, and/or lands you control." });
const mountVelusManticore = () => card("Mount Velus Manticore", "Enchantment Creature — Manticore", "{2}{R}{R}", { cmc: 4, colors: ["R"], power: "3", toughness: "4", oracleText: "At the beginning of combat on your turn, you may discard a card. When you do, this creature deals X damage to any target, where X is the number of card types the discarded card has." });
const flowstoneSculpture = () => card("Flowstone Sculpture", "Artifact Creature — Shapeshifter", "{6}", { cmc: 6, colors: [], power: "4", toughness: "4", oracleText: "{2}, Discard a card: Put a +1/+1 counter on this creature or this creature gains flying, first strike, or trample. (This effect lasts indefinitely.)" });
const gremlinMine = () => card("Gremlin Mine", "Artifact", "{1}", { cmc: 1, colors: [], oracleText: "{1}, {T}, Sacrifice this artifact: It deals 4 damage to target artifact creature.\n{1}, {T}, Sacrifice this artifact: Remove up to four charge counters from target noncreature artifact." });
const fearOfExposure = () => card("Fear of Exposure", "Enchantment Creature — Nightmare", "{2}{G}", { cmc: 3, colors: ["G"], power: "5", toughness: "4", keywords: ["Trample"], oracleText: "As an additional cost to cast this spell, tap two untapped creatures and/or lands you control.\nTrample" });
const weiAssassins = () => card("Wei Assassins", "Creature — Human Soldier Assassin", "{3}{B}{B}", { cmc: 5, colors: ["B"], power: "3", toughness: "2", oracleText: "When this creature enters, target opponent chooses a creature they control. Destroy that creature." });
const mabel = () => card("Mabel, Bitter Recluse", "Legendary Creature — Mouse Warlock", "{B}", { cmc: 1, colors: ["B"], power: "1", toughness: "1", keywords: ["Deathtouch"], oracleText: "Deathtouch\nWhen Mabel enters, remove up to three counters from another target creature or planeswalker." });
const walkingSponge = () => card("Walking Sponge", "Creature — Sponge", "{1}{U}", { cmc: 2, colors: ["U"], power: "1", toughness: "1", oracleText: "{T}: Target creature loses your choice of flying, first strike, or trample until end of turn." });
const hailStorm = () => card("Hail Storm", "Instant", "{1}{G}{G}", { cmc: 3, colors: ["G"], oracleText: "Hail Storm deals 2 damage to each attacking creature and 1 damage to you and each creature you control." });
const assemblyWorker = () => card("Assembly-Worker", "Artifact Creature — Assembly-Worker", "{3}", { cmc: 3, colors: [], power: "2", toughness: "2", oracleText: "{T}: Target Assembly-Worker creature gets +1/+1 until end of turn." });
const guardianOfTheGreatDoor = () => card("Guardian of the Great Door", "Creature — Angel", "{W}{W}", { cmc: 2, colors: ["W"], power: "4", toughness: "4", keywords: ["Flying"], oracleText: "As an additional cost to cast this spell, tap four untapped artifacts, creatures, and/or lands you control.\nFlying" });

const creature = (name: string, typeLine: string, manaCost: string, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, manaCost, { power: String(p), toughness: String(t), ...extra });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2, { cmc: 2, colors: ["G"] });
const ornithopter = () => creature("Ornithopter", "Artifact Creature — Thopter", "{0}", 0, 2, { cmc: 0, colors: [], keywords: ["Flying"], oracleText: "Flying" });
const snowIsland = () => card("Snow-Covered Island", "Basic Snow Land — Island");
const islandCard = () => card("Island", "Basic Land — Island");
const wastes = () => card("Desert Waste", "Land", "", { oracleText: "{T}: Add {C}." });
const shock = () => card("Shock", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Shock deals 2 damage to any target." });
const divination = () => card("Divination", "Sorcery", "{2}{U}", { cmc: 3, colors: ["U"], oracleText: "Draw two cards." });
const murder = () => card("Murder", "Instant", "{1}{B}{B}", { cmc: 3, colors: ["B"], oracleText: "Destroy target creature." });
const manaVault = () => card("Charged Urn", "Artifact", "{2}", { cmc: 2, colors: [], oracleText: "{T}: Put a charge counter on this artifact." });
const dryadArbor = () => creature("Wood Golem", "Artifact Creature — Golem", "{3}", 2, 2, { cmc: 3, colors: [] });

describe("Lane B round 33", () => {
  it("compiles every card fully", () => {
    supported(stormElemental(), soundTheCall(), deathpactAngel(), rekindlingPhoenix(), foodFight(), elkinBottle(), desperateResearch(), pompousGadabout());
    supported(deepwoodElder(), warlordsElite(), mountVelusManticore(), flowstoneSculpture(), gremlinMine(), fearOfExposure(), guardianOfTheGreatDoor());
    supported(weiAssassins(), mabel(), walkingSponge(), hailStorm(), assemblyWorker());
  });
});

describe("Cards named in a quoted ability", () => {
  it("Sound the Call: the Wolf counts every card named Sound the Call in each graveyard, the one just cast too", () => {
    const { s: s0, ap, ids, opp } = setup([soundTheCall()]);
    toZone(s0, opp, soundTheCall(), "graveyard");
    const s = settle(castNow(s0, ap, ids[0]!));
    const wolf = tokenNamed(s, "Wolf");
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(pt(s, wolf)).toBe("3/3");
  });

  it("Deathpact Angel: its Cleric returns a card named Deathpact Angel from your graveyard", () => {
    const { s: s0, ap, ids } = setup([murder()]);
    putOnBattlefield(s0, ap, swamp);
    putOnBattlefield(s0, ap, swamp);
    const angel = putOnBattlefield(s0, ap, deathpactAngel());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(angel)]));
    expect(zone(s, angel)).toBe("graveyard");
    const cleric = tokenNamed(s, "Cleric");
    expect(cleric).toBeDefined();
    s.objects[cleric]!.controlledSinceTurn = -1;
    s = settle(run(s, planActivate(s, ap, cleric, 0)));
    expect([zone(s, angel), s.objects[cleric]]).toEqual(["battlefield", undefined]);
  });

  it("Rekindling Phoenix: at your next upkeep its Elemental is sacrificed and the Phoenix returns with haste", () => {
    const { s: s0, ap, ids } = setup([murder()]);
    putOnBattlefield(s0, ap, swamp);
    const phoenix = putOnBattlefield(s0, ap, rekindlingPhoenix());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(phoenix)]));
    const elemental = tokenNamed(s, "Elemental");
    expect([zone(s, phoenix), pt(s, elemental)]).toEqual(["graveyard", "0/1"]);
    s = passUntil(passUntil(s, "main1", nextPlayer(s, ap)), "upkeep", ap);
    s = settle(s);
    expect([zone(s, phoenix), s.objects[elemental]]).toEqual(["battlefield", undefined]);
    expect(kws(s, phoenix, "Haste")).toBe(true);
  });

  it("Rekindling Phoenix: with no Phoenix card in the graveyard the Elemental stays", () => {
    const { s: s0, ap, ids } = setup([murder()]);
    putOnBattlefield(s0, ap, swamp);
    const phoenix = putOnBattlefield(s0, ap, rekindlingPhoenix());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(phoenix)]));
    const elemental = tokenNamed(s, "Elemental");
    // The card leaves the graveyard (rulings: the trigger then has no target and the token isn't sacrificed).
    s.players[ap]!.graveyard.splice(s.players[ap]!.graveyard.indexOf(phoenix), 1);
    s.objects[phoenix]!.zone = "exile";
    s.players[ap]!.exile.push(phoenix);
    s = settle(passUntil(passUntil(s, "main1", nextPlayer(s, ap)), "upkeep", ap));
    expect(zone(s, elemental)).toBe("battlefield");
  });

  it("Food Fight: an artifact's sacrifice deals 1 plus the number of permanents named Food Fight you control", () => {
    for (const n of [1, 2]) {
      const { s: s0, ap, opp } = setup([]);
      for (let i = 0; i < n; i++) putOnBattlefield(s0, ap, foodFight());
      const urn = putOnBattlefield(s0, ap, manaVault());
      const s = settle(run(s0, planActivate(s0, ap, urn, 1, [ply(opp)])));
      expect([zone(s, urn), life(s, opp)]).toEqual(["graveyard", 40 - 1 - n]);
    }
  });
});

describe("Costs and what they paid", () => {
  it("Storm Elemental: +1/+1 only if the card its cost exiled is a snow land", () => {
    for (const [top, grows] of [[snowIsland, true], [islandCard, false]] as const) {
      const { s: s0, ap } = setup([]);
      const storm = putOnBattlefield(s0, ap, stormElemental());
      const card0 = toZone(s0, ap, top(), "library");
      const s = settle(run(s0, planActivate(s0, ap, storm, 1)));
      expect(zone(s, card0)).toBe("exile");
      expect(pt(s, storm)).toBe(grows ? "4/5" : "3/4");
    }
  });

  it("Warlord's Elite: two other untapped artifacts, creatures, or lands are tapped as it's cast", () => {
    const { s: s0, ap, ids } = setup([warlordsElite()]);
    const urn = putOnBattlefield(s0, ap, manaVault());
    const bear = putOnBattlefield(s0, ap, greenBear(), { sick: true });
    const s = settle(castNow(s0, ap, ids[0]!, [], undefined, { tap: [urn, bear] }));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect([s.objects[urn]!.tapped, s.objects[bear]!.tapped]).toEqual([true, true]);
  });

  it("Guardian of the Great Door and Fear of Exposure: the permanents tapped must be of those kinds, and enough of them", () => {
    const { s: s0, ap, ids } = setup([guardianOfTheGreatDoor(), fearOfExposure()]);
    const lands = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap);
    const isA = (id: string, sub: string) => characteristics(s0, s0.objects[id]!).subtypes.includes(sub);
    // Two Plains for {W}{W} and four others to tap: with only three others untapped, it can't be cast.
    for (const id of lands.filter((l) => !isA(l, "Plains")).slice(3)) s0.objects[id]!.tapped = true;
    s0.objects[lands.find((l) => isA(l, "Plains"))!]!.tapped = true;
    const others = lands.filter((l) => !isA(l, "Plains") && !s0.objects[l]!.tapped);
    expect(others.length).toBe(3);
    expect(planCast(s0, ap, ids[0]!, [], undefined, "auto", undefined, { tap: [...others, lands.filter((l) => isA(l, "Plains"))[1]!] })).toBeNull();
    const bear = putOnBattlefield(s0, ap, greenBear());
    const urn = putOnBattlefield(s0, ap, manaVault());
    let s = settle(castNow(s0, ap, ids[0]!, [], undefined, { tap: [...others, urn] }));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    // Fear of Exposure: creatures and/or lands only, so the artifact can't be tapped for it.
    for (const id of lands) s.objects[id]!.tapped = false;
    s.objects[urn]!.tapped = false;
    expect(planCast(s, ap, ids[1]!, [], undefined, "auto", undefined, { tap: [urn, bear] })).toBeNull();
    s = settle(castNow(s, ap, ids[1]!, [], undefined, { tap: [bear, others[0]!] }));
    expect(zone(s, ids[1]!)).toBe("battlefield");
  });

  it("Mount Velus Manticore: discarding an artifact creature card deals 2 damage", () => {
    const { s: s0, ap, opp } = setup([]);
    s0.players[ap]!.hand = [];
    const thopter = toZone(s0, ap, ornithopter(), "hand");
    toZone(s0, ap, shock(), "hand");
    putOnBattlefield(s0, ap, mountVelusManticore());
    let s = settle(passUntil(s0, "beginCombat"), at("chooseMay", ap));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s, at("discard", ap));
    s = act(s, { type: "discard", player: ap, objectIds: [thopter] });
    s = settle(s, at("chooseTargets", ap));
    s = act(s, { type: "chooseTargets", player: ap, targets: [ply(opp)] });
    s = settle(s);
    expect([zone(s, thopter), life(s, opp)]).toEqual(["graveyard", 38]);
  });

  it("Mount Velus Manticore: declining discards nothing and deals nothing", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.hand = [];
    const thopter = toZone(s0, ap, ornithopter(), "hand");
    putOnBattlefield(s0, ap, mountVelusManticore());
    let s = settle(passUntil(s0, "beginCombat"), at("chooseMay", ap));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(zone(s, thopter)).toBe("hand");
    expect(s.turnOrder.every((p) => life(s, p) === 40)).toBe(true);
  });
});

describe("Choices as it resolves", () => {
  it("Flowstone Sculpture: a +1/+1 counter, or flying for good", () => {
    const { s: s0, ap, ids } = setup([shock(), divination()]);
    const sculpture = putOnBattlefield(s0, ap, flowstoneSculpture());
    let s = settle(run(s0, planActivate(s0, ap, sculpture, 0, [], undefined, undefined, undefined, { discard: [ids[0]!] })), at("chooseOption", ap));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "either", labels: ["Put a +1/+1 counter on it", "It gains flying", "It gains first strike", "It gains trample"] });
    s = settle(choose(s, "1"));
    expect([kws(s, sculpture, "Flying"), zone(s, ids[0]!)]).toEqual([true, "graveyard"]);
    s = settle(run(s, planActivate(s, ap, sculpture, 0, [], undefined, undefined, undefined, { discard: [ids[1]!] })), at("chooseOption", ap));
    s = settle(choose(s, "0"));
    expect(pt(s, sculpture)).toBe("5/5");
    s = passUntil(s, "main1", nextPlayer(s, ap));
    expect(kws(s, sculpture, "Flying")).toBe(true);
  });

  it("Gremlin Mine: removes up to four charge counters, as many as its controller chooses", () => {
    const { s: s0, ap, opp } = setup([]);
    const urn = putOnBattlefield(s0, opp, manaVault());
    s0.objects[urn]!.counters = { charge: 6, oil: 1 };
    const mine = putOnBattlefield(s0, ap, gremlinMine());
    let s = settle(run(s0, planActivate(s0, ap, mine, 1, [tgt(urn)])), at("chooseOption", ap));
    // Only charge counters, one at a time, and "none" or "that's all" to stop.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "removeCounter", options: ["charge", "done"] });
    s = choose(s, "charge");
    s = choose(s, "charge");
    s = settle(choose(s, "done"));
    expect(s.objects[urn]!.counters).toEqual({ charge: 4, oil: 1 });
    expect(zone(s, mine)).toBe("graveyard");
  });

  it("Gremlin Mine: no more than four, and not from an artifact creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const urn = putOnBattlefield(s0, opp, manaVault());
    s0.objects[urn]!.counters = { charge: 6 };
    const golem = putOnBattlefield(s0, opp, dryadArbor());
    const mine = putOnBattlefield(s0, ap, gremlinMine());
    expect(planActivate(s0, ap, mine, 1, [tgt(golem)])).toBeNull();
    let s = settle(run(s0, planActivate(s0, ap, mine, 1, [tgt(urn)])), at("chooseOption", ap));
    for (let i = 0; i < 4; i++) s = choose(s, "charge");
    s = settle(s);
    expect(s.objects[urn]!.counters.charge).toBe(2);
  });

  it("Desperate Research: every card with the chosen name among the top seven to the hand, the rest exiled", () => {
    const { s: s0, ap, ids } = setup([desperateResearch()]);
    // From the top: Shock, Divination, Shock, Green Bear, Divination, Divination, Shock, and an eighth card, Shock.
    const lib = [shock(), divination(), shock(), greenBear(), divination(), divination(), shock(), shock()].reverse().map((d) => toZone(s0, ap, d, "library")).reverse();
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseOption", ap));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "cardName" });
    expect(s.pending?.kind === "chooseOption" && s.pending.options).not.toContain("Island");
    s = settle(choose(s, "Shock"));
    // The eighth card, a Shock too, stays.
    expect(lib.map((id) => zone(s, id))).toEqual(["hand", "exile", "hand", "exile", "exile", "exile", "hand", "library"]);
  });

  it("Deepwood Elder: X target lands become Forests until end of turn", () => {
    const { s: s0, ap, ids, opp } = setup([shock()]);
    const elder = putOnBattlefield(s0, ap, deepwoodElder());
    const a = putOnBattlefield(s0, opp, islandCard());
    const b = putOnBattlefield(s0, opp, wastes());
    let s = settle(run(s0, planActivate(s0, ap, elder, 0, [tgt(a), tgt(b)], undefined, undefined, 2, { discard: [ids[0]!] })));
    expect([a, b].map((id) => characteristics(s, s.objects[id]!).subtypes)).toEqual([["Forest"], ["Forest"]]);
    s = passUntil(s, "main1", nextPlayer(s, ap));
    expect([a, b].map((id) => characteristics(s, s.objects[id]!).subtypes)).toEqual([["Island"], []]);
  });
});

describe("Elkin Bottle and Pompous Gadabout", () => {
  it("Elkin Bottle: the exiled card may be played until your next upkeep begins", () => {
    const { s: s0, ap } = setup([]);
    const bottle = putOnBattlefield(s0, ap, elkinBottle());
    const bolt = toZone(s0, ap, shock(), "library");
    let s = settle(run(s0, planActivate(s0, ap, bottle, 0)));
    expect(zone(s, bolt)).toBe("exile");
    expect(planCast(s, ap, bolt, [ply(s.turnOrder[1]!)])).not.toBeNull();
    // On the next player's turn, it's still an instant that may be cast.
    s = passUntil(s, "main1", nextPlayer(s, ap));
    expect(exilePlayable(s, ap)).toContain(bolt);
    s = passUntil(s, "upkeep", ap);
    expect(exilePlayable(s, ap)).not.toContain(bolt);
    expect(zone(s, bolt)).toBe("exile");
  });

  it("Elkin Bottle: a land exiled with it may be played as the land for the turn", () => {
    const { s: s0, ap } = setup([]);
    const bottle = putOnBattlefield(s0, ap, elkinBottle());
    const land = toZone(s0, ap, wastes(), "library");
    let s = settle(run(s0, planActivate(s0, ap, bottle, 0)));
    s = act(s, { type: "playLand", player: ap, objectId: land });
    expect(zone(s, land)).toBe("battlefield");
  });

  it("Pompous Gadabout: a face-down creature can't block it; a creature with a name can", () => {
    const { s: s0, ap, opp } = setup([]);
    const gad = putOnBattlefield(s0, ap, pompousGadabout());
    const hidden = putOnBattlefield(s0, opp, greenBear());
    s0.objects[hidden]!.faceDown = { kind: "morph" } as never;
    const named = putOnBattlefield(s0, opp, greenBear());
    invalidateCharacteristics(s0);
    const s = attackWith(s0, [gad], opp);
    expect(() => blockWith(s, [[hidden, gad]])).toThrow();
    expect(blockWith(s, [[named, gad]]).objects[gad]!.blockedBy).toContain(named);
  });
});

describe("More from the bottom", () => {
  it("Wei Assassins: the targeted opponent chooses one of their creatures, and it's destroyed", () => {
    const { s: s0, ap, ids, opp } = setup([weiAssassins()]);
    const big = putOnBattlefield(s0, opp, creature("Big Bear", "Creature — Bear", "{4}{G}", 5, 5, { cmc: 5, colors: ["G"] }));
    const small = putOnBattlefield(s0, opp, greenBear());
    let s = castNow(s0, ap, ids[0]!);
    s = settle(s, (x) => !!x.pending && x.pending.kind !== "pickPermanents");
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [ply(opp)] }), at("pickPermanents", opp));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: opp, action: "choose" });
    s = settle(act(s, { type: "pickPermanents", player: opp, ids: [small] }));
    expect([zone(s, small), zone(s, big)]).toEqual(["graveyard", "battlefield"]);
  });

  it("Mabel, Bitter Recluse: removes up to three counters of any kinds from another creature", () => {
    const { s: s0, ap, ids, opp } = setup([mabel()]);
    const bear = putOnBattlefield(s0, opp, greenBear());
    s0.objects[bear]!.counters = { "+1/+1": 3, shield: 1 };
    invalidateCharacteristics(s0);
    let s = castNow(s0, ap, ids[0]!);
    s = settle(s, (x) => x.pending?.kind === "chooseTargets" || at("chooseOption", ap)(x));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    // Not Mabel herself: another target.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(ids[0]!)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(bear)] }), at("chooseOption", ap));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "removeCounter" });
    s = choose(s, "shield");
    s = choose(s, "+1/+1");
    s = settle(choose(s, "+1/+1"));
    expect([s.objects[bear]!.counters["+1/+1"], s.objects[bear]!.counters.shield ?? 0]).toEqual([1, 0]);
    expect(pt(s, bear)).toBe("3/3");
  });

  it("Walking Sponge: the target loses the one keyword chosen, until end of turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const sponge = putOnBattlefield(s0, ap, walkingSponge());
    const bird = putOnBattlefield(s0, opp, creature("Trampling Bird", "Creature — Bird", "{3}{G}", 3, 3, { cmc: 4, colors: ["G"], keywords: ["Flying", "Trample"], oracleText: "Flying, trample" }));
    let s = settle(run(s0, planActivate(s0, ap, sponge, 0, [tgt(bird)])), at("chooseOption", ap));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "keyword", options: ["Flying", "First strike", "Trample"] });
    s = settle(choose(s, "Flying"));
    expect([kws(s, bird, "Flying"), kws(s, bird, "Trample")]).toEqual([false, true]);
    s = passUntil(s, "main1", nextPlayer(s, ap));
    expect(kws(s, bird, "Flying")).toBe(true);
  });

  it("Hail Storm: 2 to each attacker, 1 to you and each of your creatures, all at once", () => {
    const { s: s0, ap, opp } = setup([]);
    const attacker = putOnBattlefield(s0, ap, creature("Big Bear", "Creature — Bear", "{4}{G}", 5, 5, { cmc: 5, colors: ["G"] }));
    const home = putOnBattlefield(s0, ap, greenBear());
    const theirs = putOnBattlefield(s0, opp, greenBear());
    const storm = toZone(s0, opp, hailStorm(), "hand");
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, card("Forest", "Basic Land — Forest"));
    let s = attackWith(s0, [attacker], opp);
    const before = [life(s, ap), life(s, opp)];
    s = act(s, { type: "passPriority", player: ap });
    s = settle(run(s, planCast(s, opp, storm, [], undefined, "auto")));
    // The attacking Bear is the active player's: 2 only. The defending player's creatures and life take 1 each.
    expect(s.objects[attacker]!.damage).toBe(2);
    expect([s.objects[home]!.damage, zone(s, theirs)]).toEqual([0, "battlefield"]);
    expect(s.objects[theirs]!.damage).toBe(1);
    expect([life(s, ap), life(s, opp)]).toEqual([before[0], before[1]! - 1]);
  });

  it("Hail Storm: an attacking creature of the caster's is dealt 3 as one", () => {
    const { s: s0, ap, ids } = setup([hailStorm()]);
    const attacker = putOnBattlefield(s0, ap, creature("Big Bear", "Creature — Bear", "{4}{G}", 5, 5, { cmc: 5, colors: ["G"] }));
    let s = attackWith(s0, [attacker], nextPlayer(s0, ap));
    s = settle(castNow(s, ap, ids[0]!));
    expect(s.objects[attacker]!.damage).toBe(3);
  });

  it("Assembly-Worker: targets any Assembly-Worker creature, not only ones named Assembly-Worker", () => {
    const { s: s0, ap } = setup([]);
    const worker = putOnBattlefield(s0, ap, assemblyWorker());
    const other = putOnBattlefield(s0, ap, creature("Mishra's Worker", "Artifact Creature — Assembly-Worker", "{4}", 2, 2, { cmc: 4, colors: [] }));
    const bear = putOnBattlefield(s0, ap, greenBear());
    expect(planActivate(s0, ap, worker, 0, [tgt(bear)])).toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, worker, 0, [tgt(other)])));
    expect(pt(s, other)).toBe("3/3");
  });
});

describe("Bots", () => {
  it("a bot casting Warlord's Elite with five lands taps two it doesn't need for the {W}", () => {
    let { s, ap, ids } = setup([warlordsElite()]);
    s.players[ap]!.command = [];
    s.players[ap]!.hand = [ids[0]!];
    // Keep a Plains, a Mountain, an Island, a Forest and a Swamp.
    const keep = new Set<string>();
    for (const sub of ["Plains", "Mountain", "Island", "Forest", "Swamp"]) keep.add(s.battlefield.find((id) => s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).subtypes.includes(sub))!);
    s.battlefield = s.battlefield.filter((id) => s.objects[id]!.controller !== ap || keep.has(id));
    invalidateCharacteristics(s);
    for (let i = 0; i < 30 && !s.stack.length; i++) {
      const a = botActions(s, ap)[0]!;
      if (a.type === "passPriority") break;
      s = act(s, a);
    }
    expect(s.stack.at(-1)?.description).toBe("Warlord's Elite");
    expect([...keep].every((id) => s.objects[id]!.tapped)).toBe(true);
  });
});
