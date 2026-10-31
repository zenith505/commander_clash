// Lane B, round 58: unsupported cards no earlier round wrote down, EDHREC rank about 19,800 to 15,000, least played first
// (`npm run popular -- --least`).


import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, scry, setup } from "./helpers";
import { abilitiesOf, botActions, castProblem, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, moveObject, planActivate, power, toughness, planCast, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";
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
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const spell = (s: GameState, id: string): TargetChoice => ({ kind: "stack", id: s.stack.find((x) => x.objectId === id)!.id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const nameOf = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}) => run(s, planCast(s, pid, id, targets, undefined, undefined, undefined, choices));
/** Moves a new card for `def` into `pid`'s hand, library (on top) or graveyard. */
const toZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "library" | "graveyard" | "exile") => {
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
const toBlocks = (s: GameState) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
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
const answerMay = (s: GameState, pid: PlayerId, yes: boolean) => act(s, { type: "chooseMay", player: pid, yes });
/** Passes until `pid` is asked to choose targets for a trigger, then chooses `targets`. */
const triggerTargets = (s: GameState, pid: PlayerId, targets: TargetChoice[]) => {
  s = settle(s, at("chooseTargets", pid));
  expect(s.pending?.kind).toBe("chooseTargets");
  return act(s, { type: "chooseTargets", player: pid, targets } as Action);
};

// Real oracle text (Scryfall).
const doomForetold = () => card("Doom Foretold", "Enchantment", "{2}{W}{B}", {cmc: 4, colors: ["B","W"], oracleText: "At the beginning of each player's upkeep, that player sacrifices a nonland, nontoken permanent of their choice. If that player can't, they discard a card, they lose 2 life, you draw a card, you gain 2 life, you create a 2/2 white Knight creature token with vigilance, then you sacrifice this enchantment."});
const hallowedRespite = () => card("Hallowed Respite", "Sorcery", "{W}{U}", {cmc: 2, colors: ["U","W"], keywords: ["Flashback"], oracleText: "Exile target nonlegendary creature, then return it to the battlefield under its owner's control. If it entered under your control, put a +1/+1 counter on it. Otherwise, tap it.\nFlashback {1}{W}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)"});
const latNamSLegacy = () => card("Lat-Nam's Legacy", "Instant", "{1}{U}", {cmc: 2, colors: ["U"], oracleText: "Shuffle a card from your hand into your library. If you do, draw two cards at the beginning of the next turn's upkeep."});
const psychicVortex = () => card("Psychic Vortex", "Enchantment", "{2}{U}{U}", {cmc: 4, colors: ["U"], keywords: ["Cumulative upkeep"], oracleText: "Cumulative upkeep—Draw a card. (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nAt the beginning of your end step, sacrifice a land and discard your hand."});
const myrIncubator = () => card("Myr Incubator", "Artifact", "{6}", {cmc: 6, colors: [], oracleText: "{6}, {T}, Sacrifice this artifact: Search your library for any number of artifact cards, exile them, then create that many 1/1 colorless Myr artifact creature tokens. Then shuffle."});
const swayOfTheStars = () => card("Sway of the Stars", "Sorcery", "{8}{U}{U}", {cmc: 10, colors: ["U"], oracleText: "Each player shuffles their hand, graveyard, and all permanents they own into their library, then draws seven cards. Each player's life total becomes 7."});
const vanishIntoMemory = () => card("Vanish into Memory", "Instant", "{2}{W}{U}", {cmc: 4, colors: ["U","W"], oracleText: "Exile target creature. You draw cards equal to that creature's power. At the beginning of your next upkeep, return that card to the battlefield under its owner's control. If you do, discard cards equal to that creature's toughness."});
const togetherAsOne = () => card("Together as One", "Sorcery", "{6}", {cmc: 6, colors: [], keywords: ["Converge"], oracleText: "Converge — Target player draws X cards, Together as One deals X damage to any target, and you gain X life, where X is the number of colors of mana spent to cast this spell."});
const glissaSunseeker = () => card("Glissa Sunseeker", "Legendary Creature — Elf Warrior", "{2}{G}{G}", {cmc: 4, colors: ["G"], power: "3", toughness: "2", keywords: ["First strike"], oracleText: "First strike\n{T}: Destroy target artifact if its mana value is equal to the amount of unspent mana you have."});
const agonizingRemorse = () => card("Agonizing Remorse", "Sorcery", "{1}{B}", {cmc: 2, colors: ["B"], oracleText: "Target opponent reveals their hand. You choose a nonland card from it or a card from their graveyard. Exile that card. You lose 1 life."});
const mephidrossVampire = () => card("Mephidross Vampire", "Creature — Vampire", "{4}{B}{B}", {cmc: 6, colors: ["B"], power: "3", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nEach creature you control is a Vampire in addition to its other creature types and has \"Whenever this creature deals damage to a creature, put a +1/+1 counter on this creature.\""});
const deathSOasis = () => card("Death's Oasis", "Enchantment", "{W}{B}{G}", {cmc: 3, colors: ["B","G","W"], keywords: ["Mill"], oracleText: "Whenever a nontoken creature you control dies, mill two cards. Then return a creature card with lesser mana value than the creature that died from your graveyard to your hand.\n{1}, Sacrifice this enchantment: You gain life equal to the greatest mana value among creatures you control."});
const promiseOfTomorrow = () => card("Promise of Tomorrow", "Enchantment", "{2}{W}", {cmc: 3, colors: ["W"], oracleText: "Whenever a creature you control dies, exile it.\nAt the beginning of each end step, if you control no creatures, sacrifice this enchantment and return all cards exiled with it to the battlefield under your control."});
const umbilicus = () => card("Umbilicus", "Artifact", "{4}", {cmc: 4, colors: [], oracleText: "At the beginning of each player's upkeep, that player may pay 2 life. If they don't, they return a permanent they control to its owner's hand."});
const bloodClock = () => card("Blood Clock", "Artifact", "{4}", {cmc: 4, colors: [], oracleText: "At the beginning of each player's upkeep, that player returns a permanent they control to its owner's hand unless they pay 2 life."});
const noeticScales = () => card("Noetic Scales", "Artifact", "{4}", {cmc: 4, colors: [], oracleText: "At the beginning of each player's upkeep, return to its owner's hand each creature that player controls with power greater than the number of cards in their hand."});
const malametBattleGlyph = () => card("Malamet Battle Glyph", "Sorcery", "{G}", {cmc: 1, colors: ["G"], keywords: ["Fight"], oracleText: "Choose target creature you control and target creature you don't control. If the creature you control entered this turn, put a +1/+1 counter on it. Then those creatures fight each other."});
const ragsRiches = () => scry("split", [{ name: "Rags", mana_cost: "{2}{B}{B}", type_line: "Sorcery", oracle_text: "All creatures get -2/-2 until end of turn." }, { name: "Riches", mana_cost: "{5}{U}{U}", type_line: "Sorcery", oracle_text: "Aftermath (Cast this spell only from your graveyard. Then exile it.)\nEach opponent chooses a creature they control. You gain control of those creatures." }], { keywords: ["Aftermath"] });
const delverOfSecrets = () => scry("transform", [{ name: "Delver of Secrets", mana_cost: "{U}", type_line: "Creature — Human Wizard", power: "1", toughness: "1", oracle_text: "At the beginning of your upkeep, look at the top card of your library. You may reveal that card. If an instant or sorcery card is revealed this way, transform this creature." }, { name: "Insectile Aberration", type_line: "Creature — Human Insect", color_indicator: ["U"], power: "3", toughness: "2", oracle_text: "Flying" }], { keywords: ["Flying", "Transform"] });

// Test cards.
const vanilla = (name: string, typeLine: string, cost: string, cmc: number, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, cost, { cmc, power: String(p), toughness: String(t), ...extra });
const bearC = (name = "Plain Bear", p = 2, t = 2) => vanilla(name, "Creature — Bear", "{1}{G}", 2, p, t, { colors: ["G"] });
const opt = () => card("Test Opt", "Instant", "{U}", { cmc: 1, colors: ["U"], oracleText: "Draw a card." });
const trinket = (name = "Test Trinket", cmc = 1) => card(name, "Artifact", `{${cmc}}`, { cmc, colors: [], oracleText: "" });
const murder = () => card("Test Murder", "Instant", "{1}{B}", { cmc: 2, colors: ["B"], oracleText: "Destroy target creature." });
const bite = () => card("Test Bite", "Instant", "{G}", { cmc: 1, colors: ["G"], oracleText: "Target creature you control deals damage equal to its power to target creature you don't control." });
const testLand = (name = "Test Land") => card(name, "Land", "", { oracleText: "" });
const tokensNamed = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && controllerOf(s, s.objects[id]!) === pid && nameOf(s, id).replace(/ Token$/, "") === name);
/** Takes `pid`'s lands off the battlefield and leaves exactly `pool` to pay with. */
const poolOnly = (s: GameState, pid: PlayerId, pool: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  for (const id of s.battlefield.filter((x) => s.objects[x]!.controller === pid && characteristics(s, s.objects[x]!).types.includes("Land"))) {
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  s.players[pid]!.manaPool = { ...s.players[pid]!.manaPool, ...pool };
  invalidateCharacteristics(s);
};
const landsOf = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).types.includes("Land"));
const nextOf = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % 4]!;
/** Plays on to the beginning of `pid`'s next upkeep, stopping before its triggers resolve. */
const toUpkeep = (s: GameState, pid: PlayerId) => goUntil(s, (x) => x.step === "upkeep" && x.activePlayer === pid);

describe("Lane B round 58", () => {
  it("are fully supported", () => {
    supported(doomForetold(), hallowedRespite(), latNamSLegacy(), psychicVortex(), myrIncubator(), swayOfTheStars(), vanishIntoMemory(), togetherAsOne(), glissaSunseeker(), agonizingRemorse(), mephidrossVampire(), deathSOasis(), promiseOfTomorrow(), umbilicus(), bloodClock(), noeticScales(), malametBattleGlyph(), ragsRiches(), delverOfSecrets());
  });

  it("Doom Foretold: each upkeep that player sacrifices a nonland, nontoken permanent; if they can't, the whole list, then you sacrifice it", () => {
    const { s: s0, ap, opp } = setup([]);
    const doom = putOnBattlefield(s0, ap, doomForetold());
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    // The opponent has a bear: they sacrifice it, nothing else happens.
    let s = toUpkeep(s0, opp);
    const handA = s.players[ap]!.hand.length;
    s = settle(s);
    expect(zone(s, theirs)).toBe("graveyard");
    expect(zone(s, doom)).toBe("battlefield");
    expect(s.players[ap]!.hand.length).toBe(handA);
    // The next player has no nonland, nontoken permanent: they discard, lose 2, you draw, gain 2, get a Knight, sacrifice Doom.
    const third = nextOf(s, opp);
    s = toUpkeep(s, third);
    const hand3 = s.players[third]!.hand.length;
    const handAp = s.players[ap]!.hand.length;
    const [l3, lAp] = [life(s, third), life(s, ap)];
    s = settle(s);
    expect(s.players[third]!.hand.length).toBe(hand3 - 1);
    expect(life(s, third)).toBe(l3 - 2);
    expect(s.players[ap]!.hand.length).toBe(handAp + 1);
    expect(life(s, ap)).toBe(lAp + 2);
    const knights = tokensNamed(s, ap, "Knight");
    expect(knights.length).toBe(1);
    expect(pt(s, knights[0]!)).toBe("2/2");
    expect(zone(s, doom)).toBe("graveyard");
  });

  it("Hallowed Respite: flickers a nonlegendary creature; yours comes back with a +1/+1 counter, an opponent's comes back tapped", () => {
    const { s: s0, ap, opp, ids } = setup([hallowedRespite(), hallowedRespite()]);
    const mine = putOnBattlefield(s0, ap, bearC("My Bear"));
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    const legend = putOnBattlefield(s0, opp, vanilla("Test Legend", "Legendary Creature — Human", "{1}{W}", 2, 2, 2, { colors: ["W"] }));
    expect(planCast(s0, ap, ids[0]!, [tgt(legend)])).toBeNull();
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(mine)]));
    const back = s.battlefield.find((id) => nameOf(s, id) === "My Bear")!;
    expect(controllerOf(s, s.objects[back]!)).toBe(ap);
    expect(counters(s, back)).toBe(1);
    expect(s.objects[back]!.tapped).toBeFalsy();
    s = settle(castNow(s, ap, ids[1]!, [tgt(theirs)]));
    const back2 = s.battlefield.find((id) => nameOf(s, id) === "Their Bear")!;
    expect(controllerOf(s, s.objects[back2]!)).toBe(opp);
    expect(counters(s, back2)).toBe(0);
    expect(s.objects[back2]!.tapped).toBe(true);
  });

  it("Lat-Nam's Legacy: shuffle a card from your hand into your library; if you do, draw two at the next turn's upkeep", () => {
    const { s: s0, ap, ids } = setup([latNamSLegacy(), opt()]);
    onlyHand(s0, ap, ids);
    let s = settle(castNow(structuredClone(s0), ap, ids[0]!), at("handToTop", ap));
    if (s.pending?.kind === "handToTop") s = act(s, { type: "handToTop", player: ap, objectIds: [ids[1]!] });
    s = settle(s);
    expect(zone(s, ids[1]!)).toBe("library");
    expect(s.players[ap]!.hand.length).toBe(0);
    const next = nextOf(s, ap);
    s = toUpkeep(s, next);
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(2);
    // With nothing else in hand: no card shuffled, no draws.
    const t = structuredClone(s0);
    onlyHand(t, ap, [ids[0]!]);
    let u = settle(castNow(t, ap, ids[0]!));
    u = settle(toUpkeep(u, nextOf(u, ap)));
    expect(u.players[ap]!.hand.length).toBe(0);
  });

  it("Psychic Vortex: cumulative upkeep of drawing cards, and at your end step sacrifice a land and discard your hand", () => {
    const { s: s0, ap } = setup([]);
    const vortex = putOnBattlefield(s0, ap, psychicVortex());
    const lands = landsOf(s0, ap).length;
    let s = settle(goUntil(s0, (x) => x.step === "end" && x.activePlayer === ap));
    expect(landsOf(s, ap).length).toBe(lands - 1);
    expect(s.players[ap]!.hand.length).toBe(0);
    // Next upkeep: an age counter, then draw one card to keep it.
    s = goUntil(s, (x) => x.step === "upkeep" && x.activePlayer === ap);
    s = settle(s, at("chooseMay", ap));
    expect(s.pending?.kind).toBe("chooseMay");
    const keep = settle(answerMay(structuredClone(s), ap, true));
    expect(zone(keep, vortex)).toBe("battlefield");
    expect(counters(keep, vortex, "age")).toBe(1);
    expect(keep.players[ap]!.hand.length).toBe(1);
    const lose = settle(answerMay(structuredClone(s), ap, false));
    expect(zone(lose, vortex)).toBe("graveyard");
    expect(lose.players[ap]!.hand.length).toBe(0);
  });

  it("Myr Incubator: exile any number of artifact cards from your library, then that many 1/1 Myr tokens", () => {
    const { s: s0, ap } = setup([]);
    const inc = putOnBattlefield(s0, ap, myrIncubator());
    const arts = [toZone(s0, ap, trinket("Art A"), "library"), toZone(s0, ap, trinket("Art B"), "library"), toZone(s0, ap, trinket("Art C"), "library")];
    s0.players[ap]!.manaPool = { ...s0.players[ap]!.manaPool, C: 6 };
    let s = settle(run(s0, planActivate(s0, ap, inc, 0)), at("searchLibrary", ap));
    expect(s.pending?.kind).toBe("searchLibrary");
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [arts[0]!, arts[1]!] } as Action));
    expect([zone(s, arts[0]!), zone(s, arts[1]!), zone(s, arts[2]!)]).toEqual(["exile", "exile", "library"]);
    const myr = tokensNamed(s, ap, "Myr");
    expect(myr.length).toBe(2);
    expect(pt(s, myr[0]!)).toBe("1/1");
    expect(characteristics(s, s.objects[myr[0]!]!).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(zone(s, inc)).toBe("graveyard");
  });

  it("Sway of the Stars: everyone shuffles hand, graveyard and permanents into the library, draws seven, and is at 7 life", () => {
    const { s: s0, ap, opp, ids } = setup([swayOfTheStars()]);
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    const yard = toZone(s0, opp, opt(), "graveyard");
    let s = settle(castNow(s0, ap, ids[0]!));
    for (const pid of s.turnOrder) {
      expect(s.players[pid]!.hand.length).toBe(7);
      expect(life(s, pid)).toBe(7);
      expect(s.players[pid]!.graveyard.length).toBe(pid === ap ? 1 : 0);
    }
    expect(s.battlefield.length).toBe(0);
    expect(["library", "hand"]).toContain(zone(s, theirs));
    expect(["library", "hand"]).toContain(zone(s, yard));
    // Sway itself goes to the graveyard after it resolves.
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });

  it("Vanish into Memory: draw by its power, it returns at your next upkeep, then discard by its toughness as it returned", () => {
    const { s: s0, ap, opp, ids } = setup([vanishIntoMemory()]);
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear", 3, 2));
    s0.objects[theirs]!.counters = { "+1/+1": 1 };
    invalidateCharacteristics(s0);
    onlyHand(s0, ap, ids);
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(theirs)]));
    expect(zone(s, theirs)).toBe("exile");
    // Power 4 with the counter.
    expect(s.players[ap]!.hand.length).toBe(4);
    // Not at the opponent's upkeep: at yours.
    s = settle(toUpkeep(s, opp));
    expect(zone(s, theirs)).toBe("exile");
    s = toUpkeep(s, ap);
    const hand = s.players[ap]!.hand.length;
    s = settle(s, at("discard", ap));
    const back = s.battlefield.find((id) => nameOf(s, id) === "Their Bear")!;
    expect(back).toBeTruthy();
    expect(controllerOf(s, s.objects[back]!)).toBe(opp);
    // It came back as a new object without the counter: toughness 2.
    expect(s.pending?.kind).toBe("discard");
    expect(s.pending?.kind === "discard" && s.pending.count).toBe(2);
    s = settle(act(s, { type: "discard", player: ap, objectIds: s.players[ap]!.hand.slice(0, 2) }));
    expect(s.players[ap]!.hand.length).toBe(hand - 2);
  });

  it("Vanish into Memory: a token never returns, so nothing is discarded", () => {
    const { s: s0, ap, opp, ids } = setup([vanishIntoMemory()]);
    const token = putOnBattlefield(s0, opp, bearC("Bear Token", 2, 2));
    s0.objects[token]!.isToken = true;
    onlyHand(s0, ap, ids);
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(token)]));
    expect(s.players[ap]!.hand.length).toBe(2);
    s = toUpkeep(s, ap);
    const hand = s.players[ap]!.hand.length;
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand);
  });

  it("Together as One: X is the number of colors spent; target player draws X, X damage to any target, you gain X", () => {
    const { s: s0, ap, opp, ids } = setup([togetherAsOne()]);
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear", 3, 3));
    poolOnly(s0, ap, { W: 1, U: 1, B: 1, C: 3 });
    const hand = s0.players[ap]!.hand.length;
    const before = life(s0, ap);
    const s = settle(castNow(s0, ap, ids[0]!, [ply(ap), tgt(theirs)]));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3);
    expect(zone(s, theirs)).toBe("graveyard");
    expect(life(s, ap)).toBe(before + 3);
  });

  it("Glissa Sunseeker: destroys the artifact only if its mana value equals your unspent mana", () => {
    const { s: s0, ap, opp } = setup([]);
    const glissa = putOnBattlefield(s0, ap, glissaSunseeker());
    const two = putOnBattlefield(s0, opp, trinket("Two Trinket", 2));
    const zero = putOnBattlefield(s0, opp, trinket("Zero Trinket", 0));
    // Two mana unspent: the 2-drop dies.
    const a = structuredClone(s0);
    poolOnly(a, ap, { C: 2 });
    const a1 = settle(run(a, planActivate(a, ap, glissa, 0, [tgt(two)])));
    expect(zone(a1, two)).toBe("graveyard");
    // One: it doesn't (the amount is checked as it resolves).
    const b = structuredClone(s0);
    poolOnly(b, ap, { G: 1 });
    const b1 = settle(run(b, planActivate(b, ap, glissa, 0, [tgt(two)])));
    expect(zone(b1, two)).toBe("battlefield");
    // No mana: the 0-drop dies.
    const c = structuredClone(s0);
    poolOnly(c, ap, {});
    const c1 = settle(run(c, planActivate(c, ap, glissa, 0, [tgt(zero)])));
    expect(zone(c1, zero)).toBe("graveyard");
  });

  it("Agonizing Remorse: exile a nonland card from their hand or any card from their graveyard; you lose 1 life", () => {
    const { s: s0, ap, opp, ids } = setup([agonizingRemorse()]);
    onlyHand(s0, opp, []);
    const spellCard = toZone(s0, opp, opt(), "hand");
    const landCard = toZone(s0, opp, testLand(), "hand");
    const yardLand = toZone(s0, opp, testLand("Yard Land"), "graveyard");
    const before = life(s0, ap);
    const s1 = settle(castNow(s0, ap, ids[0]!, [ply(opp)]), at("searchLibrary", ap));
    expect(s1.pending?.kind).toBe("searchLibrary");
    const options = s1.pending?.kind === "searchLibrary" ? s1.pending.cards : [];
    expect(options).toContain(spellCard);
    expect(options).toContain(yardLand);
    expect(options).not.toContain(landCard);
    const a = settle(act(structuredClone(s1), { type: "searchLibrary", player: ap, found: [yardLand] } as Action));
    expect(zone(a, yardLand)).toBe("exile");
    expect(zone(a, spellCard)).toBe("hand");
    expect(life(a, ap)).toBe(before - 1);
    const b = settle(act(structuredClone(s1), { type: "searchLibrary", player: ap, found: [spellCard] } as Action));
    expect(zone(b, spellCard)).toBe("exile");
    expect(zone(b, yardLand)).toBe("graveyard");
  });

  it("Mephidross Vampire: your creatures are Vampires and grow when they deal damage to a creature", () => {
    const { s: s0, ap, opp, ids } = setup([bite()]);
    putOnBattlefield(s0, ap, mephidrossVampire());
    const mine = putOnBattlefield(s0, ap, bearC("My Bear", 3, 3));
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear", 1, 5));
    const theirOwn = putOnBattlefield(s0, opp, bearC("Other Bear"));
    expect(characteristics(s0, s0.objects[mine]!).subtypes).toEqual(expect.arrayContaining(["Bear", "Vampire"]));
    expect(characteristics(s0, s0.objects[theirOwn]!).subtypes).not.toContain("Vampire");
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(mine), tgt(theirs)]));
    expect(s.objects[theirs]!.damage).toBe(3);
    expect(counters(s, mine)).toBe(1);
    expect(pt(s, mine)).toBe("4/4");
  });

  it("Rags // Riches: Riches is cast from your graveyard; each opponent chooses a creature and you gain control of them", () => {
    const { s: s0, ap, ids } = setup([]);
    const rr = toZone(s0, ap, ragsRiches(), "graveyard");
    const opps = s0.turnOrder.filter((p) => p !== ap);
    const big = putOnBattlefield(s0, opps[0]!, bearC("Big Bear", 5, 5));
    const small = putOnBattlefield(s0, opps[0]!, bearC("Small Bear", 1, 1));
    const other = putOnBattlefield(s0, opps[1]!, bearC("Other Bear"));
    s0.players[ap]!.manaPool = { ...s0.players[ap]!.manaPool, U: 2, C: 5 };
    void ids;
    const plan = planCast(s0, ap, rr, [], undefined, undefined, undefined, { face: 1, via: "aftermath" } as CostChoices);
    expect(plan).not.toBeNull();
    const s = settle(run(s0, plan));
    // The bot chooses its least valuable creature.
    expect(controllerOf(s, s.objects[small]!)).toBe(ap);
    expect(controllerOf(s, s.objects[big]!)).toBe(opps[0]);
    expect(controllerOf(s, s.objects[other]!)).toBe(ap);
    expect(zone(s, rr)).toBe("exile");
  });

  it("Death's Oasis: a nontoken creature of yours dies, mill two, then return a creature card with lesser mana value; sacrifice it for life", () => {
    const { s: s0, ap, ids } = setup([murder()]);
    const oasis = putOnBattlefield(s0, ap, deathSOasis());
    const big = putOnBattlefield(s0, ap, vanilla("Big Guy", "Creature — Giant", "{2}{G}{G}", 4, 4, 4, { colors: ["G"] }));
    const cheap = toZone(s0, ap, bearC("Cheap Bear"), "graveyard");
    const same = toZone(s0, ap, vanilla("Same Guy", "Creature — Giant", "{2}{G}{G}", 4, 4, 4, { colors: ["G"] }), "graveyard");
    const lib = s0.players[ap]!.library.length;
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(big)]), at("searchLibrary", ap));
    expect(s.players[ap]!.library.length).toBe(lib - 2);
    expect(s.pending?.kind).toBe("searchLibrary");
    if (s.pending?.kind === "searchLibrary") {
      expect(s.pending.cards).toContain(cheap);
      expect(s.pending.cards).not.toContain(same);
      expect(s.pending.cards).not.toContain(big);
      s = act(s, { type: "searchLibrary", player: ap, found: [cheap] } as Action);
    }
    s = settle(s);
    expect(zone(s, cheap)).toBe("hand");
    expect(zone(s, same)).toBe("graveyard");
    // The sacrifice ability: life equal to the greatest mana value among your creatures.
    putOnBattlefield(s, ap, vanilla("Three Drop", "Creature — Elf", "{2}{G}", 3, 1, 1, { colors: ["G"] }));
    putOnBattlefield(s, ap, bearC());
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, C: 1 };
    const before = life(s, ap);
    s = settle(run(s, planActivate(s, ap, oasis, 0)));
    expect(life(s, ap)).toBe(before + 3);
    expect(zone(s, oasis)).toBe("graveyard");
  });

  it("Death's Oasis: a token dying doesn't trigger it", () => {
    const { s: s0, ap, ids } = setup([murder()]);
    putOnBattlefield(s0, ap, deathSOasis());
    const token = putOnBattlefield(s0, ap, bearC("Bear Token"));
    s0.objects[token]!.isToken = true;
    const lib = s0.players[ap]!.library.length;
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(token)]));
    expect(s.players[ap]!.library.length).toBe(lib);
  });

  it("Delver of Secrets: at your upkeep, look at the top card; reveal an instant or sorcery to transform", () => {
    const { s: s0, ap } = setup([]);
    const delver = putOnBattlefield(s0, ap, delverOfSecrets());
    const prev = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 3) % 4]!;
    const toMine = (s: GameState) => toUpkeep(goUntil(s, (x) => x.activePlayer === prev), ap);
    const a = structuredClone(s0);
    let s = toMine(a);
    toZone(s, ap, opt(), "library");
    s = settle(s, at("chooseMay", ap));
    expect(s.pending?.kind).toBe("chooseMay");
    const yes = settle(answerMay(structuredClone(s), ap, true));
    expect(yes.objects[delver]!.face).toBe(1);
    expect(pt(yes, delver)).toBe("3/2");
    expect(characteristics(yes, yes.objects[delver]!).keywords).toContain("Flying");
    const no = settle(answerMay(structuredClone(s), ap, false));
    expect(no.objects[delver]!.face ?? 0).toBe(0);
    // A land on top: no question, no transform.
    let b = toMine(structuredClone(s0));
    toZone(b, ap, testLand(), "library");
    b = settle(b, at("chooseMay", ap));
    expect(b.pending?.kind).not.toBe("chooseMay");
    expect(b.objects[delver]!.face ?? 0).toBe(0);
  });

  it("Promise of Tomorrow: your dying creatures are exiled, and come back at an end step once you control no creatures", () => {
    const { s: s0, ap, ids } = setup([murder()]);
    const promise = putOnBattlefield(s0, ap, promiseOfTomorrow());
    const mine = putOnBattlefield(s0, ap, bearC("My Bear"));
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(mine)]));
    expect(zone(s, mine)).toBe("exile");
    s = settle(goUntil(s, (x) => x.step === "end" && x.activePlayer === ap));
    expect(zone(s, promise)).toBe("graveyard");
    const back = s.battlefield.find((id) => nameOf(s, id) === "My Bear");
    expect(back).toBeTruthy();
    expect(controllerOf(s, s.objects[back!]!)).toBe(ap);
    // While you control a creature, it stays.
    const t = structuredClone(s0);
    putOnBattlefield(t, ap, bearC("Other Bear"));
    let u = settle(castNow(t, ap, ids[0]!, [tgt(mine)]));
    u = settle(goUntil(u, (x) => x.step === "end" && x.activePlayer === ap));
    expect(zone(u, promise)).toBe("battlefield");
    expect(zone(u, mine)).toBe("exile");
  });

  it("Umbilicus: at each player's upkeep they pay 2 life or return a permanent they control to its owner's hand", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, umbilicus());
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    let s = toUpkeep(s0, opp);
    s = settle(s, (x) => x.pending?.player === opp);
    expect(s.pending?.player).toBe(opp);
    const before = life(s, opp);
    expect(s.pending?.kind).toBe("payUnless");
    const pay = settle(act(structuredClone(s), { type: "payUnless", player: opp, pay: true }));
    const no = settle(act(structuredClone(s), { type: "payUnless", player: opp, pay: false }));
    expect(life(pay, opp)).toBe(before - 2);
    expect(zone(pay, theirs)).toBe("battlefield");
    expect(life(no, opp)).toBe(before);
    expect(no.battlefield.filter((id) => controllerOf(no, no.objects[id]!) === opp).length).toBe(0);
    expect(zone(no, theirs)).toBe("hand");
  });

  it("Blood Clock: the same choice, worded as \"unless they pay 2 life\"", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, bloodClock());
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear"));
    let s = toUpkeep(s0, opp);
    s = settle(s, (x) => x.pending?.player === opp);
    const p = s.pending!;
    expect(p.kind).toBe("payUnless");
    const before = life(s, opp);
    const pay = settle(act(structuredClone(s), { type: "payUnless", player: opp, pay: true }));
    const no = settle(act(structuredClone(s), { type: "payUnless", player: opp, pay: false }));
    expect(life(pay, opp)).toBe(before - 2);
    expect(zone(pay, theirs)).toBe("battlefield");
    expect(life(no, opp)).toBe(before);
    expect(zone(no, theirs)).toBe("hand");
  });

  it("Noetic Scales: at each player's upkeep, their creatures with power greater than their hand size go back", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, noeticScales());
    const big = putOnBattlefield(s0, opp, bearC("Big Bear", 5, 5));
    const small = putOnBattlefield(s0, opp, bearC("Small Bear", 1, 1));
    const mine = putOnBattlefield(s0, ap, bearC("My Big Bear", 9, 9));
    let s = toUpkeep(s0, opp);
    onlyHand(s, opp, s.players[opp]!.hand.slice(0, 3));
    s = settle(s);
    expect(zone(s, big)).toBe("hand");
    expect(zone(s, small)).toBe("battlefield");
    // Only that player's creatures.
    expect(zone(s, mine)).toBe("battlefield");
  });

  it("Malamet Battle Glyph: a +1/+1 counter only if your creature entered this turn, then they fight", () => {
    const { s: s0, ap, opp, ids } = setup([malametBattleGlyph()]);
    const mine = putOnBattlefield(s0, ap, bearC("My Bear", 2, 2));
    const theirs = putOnBattlefield(s0, opp, bearC("Their Bear", 2, 3));
    const fresh = structuredClone(s0);
    fresh.objects[mine]!.enteredTurn = fresh.turn;
    const a = settle(castNow(fresh, ap, ids[0]!, [tgt(mine), tgt(theirs)]));
    expect(counters(a, mine)).toBe(1);
    expect(zone(a, theirs)).toBe("graveyard");
    expect(zone(a, mine)).toBe("battlefield");
    const old = structuredClone(s0);
    old.objects[mine]!.enteredTurn = old.turn - 1;
    const b = settle(castNow(old, ap, ids[0]!, [tgt(mine), tgt(theirs)]));
    expect(counters(b, mine)).toBe(0);
    expect(zone(b, theirs)).toBe("battlefield");
    expect(zone(b, mine)).toBe("graveyard");
  });
});
