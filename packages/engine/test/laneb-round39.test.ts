// Lane B, round 39: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, mountain, passUntil, plainsCard, putOnBattlefield, setup, swamp } from "./helpers";
import { botActions, canPlayLandNow, castProblem, characteristics, compileCard, hiddenInExile, processOrder, invalidateCharacteristics, isFullySupported, moveObject, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, wardCosts, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of s.players[pid]!.hand) s.objects[id]!.zone = "exile";
  s.players[pid]!.exile.push(...s.players[pid]!.hand);
  s.players[pid]!.hand = [];
};
/** Only lands left in `pid`'s library, so what a test puts on top is what's found. */
const landsOnly = (s: GameState, pid: PlayerId) => {
  const p = s.players[pid]!;
  p.library = p.library.filter((id) => characteristics(s, s.objects[id]!).types.includes("Land"));
};
const kws = (s: GameState, id: string, kw: string) => objHasKeyword(s, s.objects[id]!, kw);
const colorsOf = (s: GameState, id: string) => [...characteristics(s, s.objects[id]!).colors].sort();
const subtypesOf = (s: GameState, id: string) => characteristics(s, s.objects[id]!).subtypes;
const mine = (s: GameState, pid: PlayerId, sub: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && subtypesOf(s, id).includes(sub));
/** Moves a new card for `def` into `pid`'s exile, face down (in group `group`) if asked. */
const toExile = (s: GameState, pid: PlayerId, def: CardDef, faceDown?: { by: string; at: number }) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "exile";
  s.players[pid]!.exile.push(id);
  if (faceDown) s.objects[id]!.hiddenExile = { ...faceDown, seen: [pid], label: "Face down" };
  invalidateCharacteristics(s);
  return id;
};
const yes = (s: GameState, pid: PlayerId) => act(s, { type: "chooseMay", player: pid, yes: true });
const find = (s: GameState, pid: PlayerId, found: string[]) => act(s, { type: "searchLibrary", player: pid, found });

// Real oracle text (Scryfall).
const ruinProcessor = () => card("Ruin Processor", "Creature — Eldrazi Processor", "{7}", { cmc: 7, colors: [], power: "7", toughness: "8", oracleText: "When you cast this spell, you may put a card an opponent owns from exile into that player's graveyard. If you do, you gain 5 life." });
const blightHerder = () => card("Blight Herder", "Creature — Eldrazi Processor", "{5}", { cmc: 5, colors: [], power: "4", toughness: "5", oracleText: "When you cast this spell, you may put two cards your opponents own from exile into their owners' graveyards. If you do, create three 1/1 colorless Eldrazi Scion creature tokens. They have \"Sacrifice this token: Add {C}.\"" });
const murkStrider = () => card("Murk Strider", "Creature — Eldrazi Processor", "{3}{U}", { cmc: 4, colors: [], power: "3", toughness: "2", keywords: ["Devoid"], oracleText: "Devoid (This card has no color.)\nWhen this creature enters, you may put a card an opponent owns from exile into that player's graveyard. If you do, return target creature to its owner's hand." });
const mindRaker = () => card("Mind Raker", "Creature — Eldrazi Processor", "{3}{B}", { cmc: 4, colors: [], power: "3", toughness: "3", keywords: ["Devoid"], oracleText: "Devoid (This card has no color.)\nWhen this creature enters, you may put a card an opponent owns from exile into that player's graveyard. If you do, each opponent discards a card." });
const ulamogsReclaimer = () => card("Ulamog's Reclaimer", "Creature — Eldrazi Processor", "{4}{U}", { cmc: 5, colors: [], power: "2", toughness: "5", keywords: ["Devoid"], oracleText: "Devoid (This card has no color.)\nWhen this creature enters, you may put a card an opponent owns from exile into that player's graveyard. If you do, return target instant or sorcery card from your graveyard to your hand." });
const wastelandStrangler = () => card("Wasteland Strangler", "Creature — Eldrazi Processor", "{2}{B}", { cmc: 3, colors: [], power: "3", toughness: "2", keywords: ["Devoid"], oracleText: "Devoid (This card has no color.)\nWhen this creature enters, you may put a card an opponent owns from exile into that player's graveyard. If you do, target creature gets -3/-3 until end of turn." });
const ulamogsNullifier = () => card("Ulamog's Nullifier", "Creature — Eldrazi Processor", "{2}{U}{B}", { cmc: 4, colors: [], power: "2", toughness: "3", keywords: ["Flying","Devoid","Flash"], oracleText: "Devoid (This card has no color.)\nFlash\nFlying\nWhen this creature enters, you may put two cards your opponents own from exile into their owners' graveyards. If you do, counter target spell." });
const processorAssault = () => card("Processor Assault", "Sorcery", "{1}{R}", { cmc: 2, colors: [], keywords: ["Devoid"], oracleText: "Devoid (This card has no color.)\nAs an additional cost to cast this spell, put a card an opponent owns from exile into that player's graveyard.\nProcessor Assault deals 5 damage to target creature." });
const crypticCruiser = () => card("Cryptic Cruiser", "Creature — Eldrazi Processor", "{3}{U}", { cmc: 4, colors: [], power: "3", toughness: "3", keywords: ["Devoid"], oracleText: "Devoid (This card has no color.)\n{2}{U}, Put a card an opponent owns from exile into that player's graveyard: Tap target creature." });
const oracleOfDust = () => card("Oracle of Dust", "Creature — Eldrazi Processor", "{4}{U}", { cmc: 5, colors: [], power: "3", toughness: "5", keywords: ["Devoid"], oracleText: "Devoid (This card has no color.)\n{2}, Put a card an opponent owns from exile into that player's graveyard: Draw a card, then discard a card." });
const voidAttendant = () => card("Void Attendant", "Creature — Eldrazi Processor", "{2}{G}", { cmc: 3, colors: [], power: "2", toughness: "3", keywords: ["Devoid"], oracleText: "Devoid (This card has no color.)\n{1}{G}, Put a card an opponent owns from exile into that player's graveyard: Create a 1/1 colorless Eldrazi Scion creature token. It has \"Sacrifice this token: Add {C}.\"" });

const axgardBraggart = () => card("Axgard Braggart", "Creature — Dwarf Warrior", "{3}{W}", { cmc: 4, colors: ["W"], power: "3", toughness: "3", keywords: ["Boast"], oracleText: "Boast — {1}{W}: Untap this creature. Put a +1/+1 counter on it. (Activate only if this creature attacked this turn and only once each turn.)" });
const frenziedRaider = () => card("Frenzied Raider", "Creature — Demon Berserker", "{1}{R}", { cmc: 2, colors: ["R"], power: "2", toughness: "2", oracleText: "Whenever you activate a boast ability, put a +1/+1 counter on this creature." });
const dragonkinBerserker = () => card("Dragonkin Berserker", "Creature — Human Berserker", "{1}{R}", { cmc: 2, colors: ["R"], power: "2", toughness: "2", keywords: ["First strike","Boast"], oracleText: "First strike\nBoast abilities you activate cost {1} less to activate for each Dragon you control.\nBoast — {4}{R}: Create a 5/5 red Dragon creature token with flying. (Activate only if this creature attacked this turn and only once each turn.)" });
const territorialDispute = () => card("Territorial Dispute", "Enchantment", "{4}{R}{R}", { cmc: 6, colors: ["R"], oracleText: "At the beginning of your upkeep, sacrifice this enchantment unless you sacrifice a land.\nPlayers can't play lands." });
const afiyaGrove = () => card("Afiya Grove", "Enchantment", "{1}{G}", { cmc: 2, colors: ["G"], oracleText: "This enchantment enters with three +1/+1 counters on it.\nAt the beginning of your upkeep, move a +1/+1 counter from this enchantment onto target creature.\nWhen this enchantment has no +1/+1 counters on it, sacrifice it." });
const cinderCloud = () => card("Cinder Cloud", "Instant", "{3}{R}{R}", { cmc: 5, colors: ["R"], oracleText: "Destroy target creature. If a white creature dies this way, Cinder Cloud deals damage to that creature's controller equal to the creature's power." });
const creatureBond = () => card("Creature Bond", "Enchantment — Aura", "{1}{U}", { cmc: 2, colors: ["U"], keywords: ["Enchant"], oracleText: "Enchant creature\nWhen enchanted creature dies, this Aura deals damage equal to that creature's toughness to the creature's controller." });
const necroticFumes = () => card("Necrotic Fumes", "Sorcery — Lesson", "{1}{B}{B}", { cmc: 3, colors: ["B"], oracleText: "As an additional cost to cast this spell, exile a creature you control.\nExile target creature or planeswalker." });
const ruthlessDisposal = () => card("Ruthless Disposal", "Sorcery", "{4}{B}", { cmc: 5, colors: ["B"], oracleText: "As an additional cost to cast this spell, discard a card and sacrifice a creature.\nTwo target creatures each get -13/-13 until end of turn." });
const swiftSilence = () => card("Swift Silence", "Instant", "{2}{W}{U}{U}", { cmc: 5, colors: ["U","W"], oracleText: "Counter all other spells. Draw a card for each spell countered this way." });
const multanisPresence = () => card("Multani's Presence", "Enchantment", "{G}", { cmc: 1, colors: ["G"], oracleText: "Whenever a spell you've cast is countered, draw a card." });
const hellfire = () => card("Hellfire", "Sorcery", "{2}{B}{B}{B}", { cmc: 5, colors: ["B"], oracleText: "Destroy all nonblack creatures. Hellfire deals X plus 3 damage to you, where X is the number of creatures that died this way." });
const soulquake = () => card("Soulquake", "Sorcery", "{3}{U}{U}{B}{B}", { cmc: 7, colors: ["B","U"], oracleText: "Return all creatures on the battlefield and all creature cards in graveyards to their owners' hands." });
const leeches = () => card("Leeches", "Sorcery", "{1}{W}{W}", { cmc: 3, colors: ["W"], oracleText: "Target player loses all poison counters. Leeches deals that much damage to that player." });
const heedTheMists = () => card("Heed the Mists", "Sorcery — Arcane", "{3}{U}{U}", { cmc: 5, colors: ["U"], keywords: ["Mill"], oracleText: "Mill a card, then draw cards equal to the milled card's mana value." });
const ghostfire = () => card("Ghostfire", "Instant", "{2}{R}", { cmc: 3, colors: [], oracleText: "Ghostfire is colorless.\nGhostfire deals 3 damage to any target." });
const barishi = () => card("Barishi", "Creature — Elemental", "{2}{G}{G}", { cmc: 4, colors: ["G"], power: "4", toughness: "3", oracleText: "When this creature dies, exile it, then shuffle all creature cards from your graveyard into your library." });
const lunarHatchling = () => card("Lunar Hatchling", "Creature — Alien Beast", "{4}{G}{U}", { cmc: 6, colors: ["G","U"], power: "6", toughness: "6", keywords: ["Flying","Landcycling","Trample","Basic landcycling","Escape","Typecycling","Cycling"], oracleText: "Flying, trample\nBasic landcycling {2} ({2}, Discard this card: Search your library for a basic land card, reveal it, put it into your hand, then shuffle.)\nEscape—{4}{G}{U}, Exile a land you control, Exile five other cards from your graveyard. (You may cast this card from your graveyard for its escape cost.)" });
const creature = (name: string, typeLine: string, cost: string, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, cost, { power: String(p), toughness: String(t), ...extra });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2, { cmc: 2, colors: ["G"] });
const hillGiant = () => creature("Hill Giant", "Creature — Giant", "{3}{R}", 3, 3, { cmc: 4, colors: ["R"] });
const study = () => card("Quick Study", "Sorcery", "{U}", { cmc: 1, colors: ["U"], oracleText: "Draw a card." });
const shock = () => card("Test Shock", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Test Shock deals 2 damage to any target." });
const doom = () => card("Test Doom", "Instant", "{B}", { cmc: 1, colors: ["B"], oracleText: "Destroy target creature." });
const whiteKnight = () => creature("White Knight", "Creature — Human Knight", "{2}{W}", 3, 2, { cmc: 3, colors: ["W"] });
const blackKnight = () => creature("Black Knight", "Creature — Human Knight", "{2}{B}", 2, 2, { cmc: 3, colors: ["B"] });
const redWard = () => creature("Red Ward", "Creature — Human Cleric", "{1}{W}", 1, 4, { cmc: 2, colors: ["W"], keywords: ["Protection"], oracleText: "Protection from red" });
const exiled = (name: string) => card(name, "Sorcery", "{2}{B}", { cmc: 3, colors: ["B"], oracleText: "Draw a card." });

describe("Lane B round 39", () => {
  it("compiles every card fully", () => {
    supported(ruinProcessor(), blightHerder(), murkStrider(), mindRaker(), ulamogsReclaimer(), wastelandStrangler(), ulamogsNullifier(), processorAssault());
    supported(crypticCruiser(), oracleOfDust(), voidAttendant());
    supported(axgardBraggart(), frenziedRaider(), dragonkinBerserker());
    supported(study(), shock(), exiled("Test Exiled"));
    supported(territorialDispute(), afiyaGrove(), cinderCloud(), creatureBond(), necroticFumes(), ruthlessDisposal(), swiftSilence(), multanisPresence());
    supported(lunarHatchling());
    supported(hellfire(), soulquake(), leeches(), heedTheMists(), ghostfire(), barishi(), doom(), whiteKnight(), blackKnight(), redWard());
  });
});

describe("The Eldrazi processors", () => {
  it("Ruin Processor: as it's cast, you may put a card an opponent owns from exile into their graveyard; if you do, you gain 5 life", () => {
    const { s: s0, ap, ids, opp } = setup([ruinProcessor()]);
    const card1 = toExile(s0, opp, exiled("Exiled One"));
    toExile(s0, ap, exiled("My Own Exiled Card")); // yours isn't one an opponent owns
    let s = castNow(s0, ap, ids[0]!);
    s = settle(s, at("chooseMay", ap));
    s = yes(s, ap);
    expect(s.pending?.kind === "searchLibrary" && s.pending.cards).toEqual([card1]);
    s = settle(find(s, ap, [card1]));
    expect([zone(s, card1), s.players[opp]!.graveyard.includes(card1), life(s, ap), zone(s, ids[0]!)]).toEqual(["graveyard", true, 45, "battlefield"]);
  });

  it("Ruin Processor: with no card an opponent owns in exile, nothing to ask and no life", () => {
    const { s: s0, ap, ids } = setup([ruinProcessor()]);
    toExile(s0, ap, exiled("My Own Exiled Card"));
    const s = settle(castNow(s0, ap, ids[0]!), at("chooseMay", ap));
    expect([s.pending, life(s, ap), zone(s, ids[0]!)]).toEqual([null, 40, "battlefield"]);
  });

  it("Blight Herder: two cards from two different opponents make three Eldrazi Scions; one card isn't enough", () => {
    const { s: s0, ap, ids, opp } = setup([blightHerder()]);
    const other = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const a = toExile(s0, opp, exiled("Exiled One"));
    const b = toExile(s0, other, exiled("Exiled Two"));
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseMay", ap));
    s = settle(find(yes(s, ap), ap, [a, b]));
    expect([zone(s, a), zone(s, b), s.players[opp]!.graveyard.includes(a), s.players[other]!.graveyard.includes(b)]).toEqual(["graveyard", "graveyard", true, true]);
    const scions = mine(s, ap, "Scion");
    expect(scions.map((id) => pt(s, id))).toEqual(["1/1", "1/1", "1/1"]);
    expect(compileCard(s.cards[s.objects[scions[0]!]!.cardId]!).activated.length + compileCard(s.cards[s.objects[scions[0]!]!.cardId]!).mana.length).toBe(1);

    const { s: t0, ap: ap2, ids: ids2, opp: opp2 } = setup([blightHerder()]);
    toExile(t0, opp2, exiled("Exiled One"));
    const t = settle(castNow(t0, ap2, ids2[0]!), at("chooseMay", ap2));
    expect([t.pending, mine(t, ap2, "Scion").length]).toEqual([null, 0]);
  });

  it("a face-down card is chosen by its group, then one of that group is put into the graveyard at random", () => {
    const { s: s0, ap, ids, opp } = setup([ruinProcessor()]);
    const group = [1, 2, 3].map((i) => toExile(s0, opp, exiled(`Hidden ${i}`), { by: "t999", at: 7 }));
    const apart = toExile(s0, opp, exiled("Hidden Apart"), { by: "t999", at: 9 });
    expect(group.every((id) => hiddenInExile(s0.objects[id]!, ap) && !hiddenInExile(s0.objects[id]!, opp))).toBe(true);
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseMay", ap));
    s = settle(find(yes(s, ap), ap, [group[2]!]));
    expect(group.filter((id) => zone(s, id) === "graveyard").length).toBe(1);
    expect([zone(s, apart), life(s, ap)]).toEqual(["exile", 45]);
  });

  it("Wasteland Strangler: if you do, target creature gets -3/-3 until end of turn", () => {
    const { s: s0, ap, ids, opp } = setup([wastelandStrangler()]);
    const card1 = toExile(s0, opp, exiled("Exiled One"));
    const giant = putOnBattlefield(s0, opp, hillGiant());
    let s = castNow(s0, ap, ids[0]!);
    s = settle(s, (x) => x.pending?.kind === "chooseTargets" || at("chooseMay", ap)(x));
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(giant)] });
    s = settle(s, at("chooseMay", ap));
    s = settle(find(yes(s, ap), ap, [card1]));
    expect([zone(s, card1), zone(s, giant)]).toEqual(["graveyard", "graveyard"]);
  });

  it("Mind Raker: if you do, each opponent discards a card; Murk Strider returns target creature", () => {
    const { s: s0, ap, ids, opp } = setup([mindRaker(), murkStrider()]);
    const card1 = toExile(s0, opp, exiled("Exiled One"));
    const card2 = toExile(s0, opp, exiled("Exiled Two"));
    const hands = () => s0.turnOrder.filter((p) => p !== ap).map((p) => s0.players[p]!.hand.length);
    const before = hands();
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseMay", ap));
    s = settle(find(yes(s, ap), ap, [card1]));
    expect(s.turnOrder.filter((p) => p !== ap).map((p) => s.players[p]!.hand.length)).toEqual(before.map((n) => n - 1));
    const giant = putOnBattlefield(s, opp, hillGiant());
    s = castNow(s, ap, ids[1]!);
    s = settle(s, (x) => x.pending?.kind === "chooseTargets" || at("chooseMay", ap)(x));
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(giant)] });
    s = settle(find(yes(settle(s, at("chooseMay", ap)), ap), ap, [card2]));
    expect([zone(s, card2), zone(s, giant)]).toEqual(["graveyard", "hand"]);
  });

  it("Ulamog's Reclaimer: if you do, return target instant or sorcery card from your graveyard to your hand", () => {
    const { s: s0, ap, ids, opp } = setup([ulamogsReclaimer()]);
    const card1 = toExile(s0, opp, exiled("Exiled One"));
    const old = toZone(s0, ap, study(), "graveyard");
    let s = castNow(s0, ap, ids[0]!);
    s = settle(s, (x) => x.pending?.kind === "chooseTargets" || at("chooseMay", ap)(x));
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(old)] });
    s = settle(find(yes(settle(s, at("chooseMay", ap)), ap), ap, [card1]));
    expect([zone(s, card1), zone(s, old)]).toEqual(["graveyard", "hand"]);
  });

  it("Ulamog's Nullifier: flashed in, two cards from exile counter target spell", () => {
    const { s: s0, ap, ids, opp } = setup([ulamogsNullifier()]);
    const a = toExile(s0, opp, exiled("Exiled One"));
    const b = toExile(s0, opp, exiled("Exiled Two"));
    // A spell of ours on the stack to counter (Quick Study would draw a card).
    const mine1 = toZone(s0, ap, study(), "hand");
    const hand = s0.players[ap]!.hand.length;
    let s = run(s0, planCast(s0, ap, mine1, []));
    const item = s.stack[s.stack.length - 1]!;
    s = run(s, planCast(s, ap, ids[0]!, []));
    s = settle(s, (x) => x.pending?.kind === "chooseTargets" || at("chooseMay", ap)(x));
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "stack", id: item.id }] });
    s = settle(find(yes(settle(s, at("chooseMay", ap)), ap), ap, [a, b]));
    expect([zone(s, a), zone(s, b), zone(s, mine1), s.players[ap]!.hand.length, zone(s, ids[0]!)]).toEqual(["graveyard", "graveyard", "graveyard", hand - 2, "battlefield"]);
    expect(s.log.some((l) => /Quick Study/.test(l.text) && /counter/i.test(l.text))).toBe(true);
  });

  it("Processor Assault: the card is part of the cost; without one it can't be cast", () => {
    const { s: s0, ap, ids, opp } = setup([processorAssault(), processorAssault()]);
    const card1 = toExile(s0, opp, exiled("Exiled One"));
    const giant = putOnBattlefield(s0, opp, hillGiant());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(giant)], { exileCards: [card1] }));
    expect([zone(s, card1), zone(s, giant), zone(s, ids[0]!)]).toEqual(["graveyard", "graveyard", "graveyard"]);
    const bear = putOnBattlefield(s, opp, greenBear());
    expect(planCast(s, ap, ids[1]!, [tgt(bear)], undefined, undefined, undefined, { exileCards: [] })).toBeNull();
    expect(castProblem(s, ap, ids[1]!, [tgt(bear)])).toMatch(/opponent owns from exile/);
  });

  it("Cryptic Cruiser, Oracle of Dust and Void Attendant pay with a card an opponent owns in exile", () => {
    const { s: s0, ap, opp } = setup([]);
    const cruiser = putOnBattlefield(s0, ap, crypticCruiser());
    const oracle = putOnBattlefield(s0, ap, oracleOfDust());
    const attendant = putOnBattlefield(s0, ap, voidAttendant());
    const [a, b, c] = ["One", "Two", "Three"].map((n) => toExile(s0, opp, exiled(`Exiled ${n}`)));
    const giant = putOnBattlefield(s0, opp, hillGiant());
    let s = settle(run(s0, planActivate(s0, ap, cruiser, 0, [tgt(giant)], undefined, undefined, undefined, { exileCards: [a!] })));
    expect([zone(s, a!), s.objects[giant]!.tapped]).toEqual(["graveyard", true]);
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planActivate(s, ap, oracle, 0, [], undefined, undefined, undefined, { exileCards: [b!] })));
    expect([zone(s, b!), s.players[ap]!.hand.length]).toEqual(["graveyard", hand]);
    s = settle(run(s, planActivate(s, ap, attendant, 0, [], undefined, undefined, undefined, { exileCards: [c!] })));
    expect([zone(s, c!), mine(s, ap, "Scion").length]).toEqual(["graveyard", 1]);
    expect(planActivate(s, ap, attendant, 0, [], undefined, undefined, undefined, { exileCards: [] })).toBeNull();
  });

  it("a bot processes a card an opponent could still cast from exile first", () => {
    const { s: s0, ap, opp } = setup([]);
    s0.players[ap]!.hand = [];
    const plain = toExile(s0, opp, card("Big Exiled Thing", "Sorcery", "{6}{B}", { cmc: 7, colors: ["B"], oracleText: "Draw a card." }));
    const foretold = toExile(s0, opp, exiled("Foretold Thing"));
    s0.objects[foretold]!.foretold = true;
    expect(processOrder(s0, ap, [plain, foretold])).toEqual([foretold, plain]);
  });
});

describe("Boast", () => {
  it("Axgard Braggart: after it attacked, {1}{W} untaps it and puts a +1/+1 counter on it; Frenzied Raider gets one too", () => {
    const { s: s0, ap, opp } = setup([]);
    const braggart = putOnBattlefield(s0, ap, axgardBraggart());
    const raider = putOnBattlefield(s0, ap, frenziedRaider());
    expect(planActivate(s0, ap, braggart, 0)).toBeNull(); // it hasn't attacked
    let s = attackWith(s0, [braggart], opp);
    expect(s.objects[braggart]!.tapped).toBe(true);
    s = settle(run(s, planActivate(s, ap, braggart, 0)));
    expect([s.objects[braggart]!.tapped, pt(s, braggart), pt(s, raider)]).toEqual([false, "4/4", "3/3"]);
    expect(planActivate(s, ap, braggart, 0)).toBeNull(); // once each turn
  });

  it("Frenzied Raider: not for another ability you activate", () => {
    const { s: s0, ap, opp } = setup([]);
    const raider = putOnBattlefield(s0, ap, frenziedRaider());
    const oracle = putOnBattlefield(s0, ap, oracleOfDust());
    const card1 = toExile(s0, opp, exiled("Exiled One"));
    const s = settle(run(s0, planActivate(s0, ap, oracle, 0, [], undefined, undefined, undefined, { exileCards: [card1] })));
    expect(pt(s, raider)).toBe("2/2");
  });

  it("Dragonkin Berserker: its boast costs {1} less for each Dragon you control", () => {
    const { s: s0, ap, opp } = setup([]);
    const berserker = putOnBattlefield(s0, ap, dragonkinBerserker());
    putOnBattlefield(s0, ap, creature("Test Dragon", "Creature — Dragon", "{4}{R}{R}", 5, 5, { cmc: 6, colors: ["R"] }), { sick: true });
    putOnBattlefield(s0, ap, creature("Test Dragon", "Creature — Dragon", "{4}{R}{R}", 5, 5, { cmc: 6, colors: ["R"] }), { sick: true });
    let s = attackWith(s0, [berserker], opp);
    const untapped = (x: GameState) => x.battlefield.filter((id) => x.objects[id]!.controller === ap && characteristics(x, x.objects[id]!).types.includes("Land") && !x.objects[id]!.tapped).length;
    const before = untapped(s);
    s = settle(run(s, planActivate(s, ap, berserker, 0)));
    expect(before - untapped(s)).toBe(3);
    expect(mine(s, ap, "Dragon").length).toBe(3);
  });
});

describe("Single cards", () => {
  it("Territorial Dispute: no player can play a land while it's on the battlefield", () => {
    const { s: s0, ap, opp } = setup([]);
    const land = toZone(s0, ap, card("Test Wastes", "Land", "", { cmc: 0, colors: [], oracleText: "{T}: Add {C}." }), "hand");
    expect(canPlayLandNow(s0, ap, land)).toBe(true);
    const dispute = putOnBattlefield(s0, opp, territorialDispute());
    expect(canPlayLandNow(s0, ap, land)).toBe(false);
    moveObject(s0, dispute, "graveyard");
    invalidateCharacteristics(s0);
    expect(canPlayLandNow(s0, ap, land)).toBe(true);
  });

  it("Afiya Grove: enters with three counters, moves one each upkeep, and is sacrificed once it has none", () => {
    const { s: s0, ap, ids } = setup([afiyaGrove()]);
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(3);
    const bear = putOnBattlefield(s, ap, greenBear());
    s.objects[ids[0]!]!.counters["+1/+1"] = 1;
    s = goUntil(s, (x) => x.activePlayer === ap && x.turn > s0.turn && (x.pending?.kind === "chooseTargets" || x.step === "draw"));
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(bear)] });
    s = settle(s);
    expect([pt(s, bear), zone(s, ids[0]!)]).toEqual(["3/3", "graveyard"]);
  });

  it("Cinder Cloud: the controller of a white creature it destroys takes damage equal to its power; not for another color", () => {
    const { s: s0, ap, ids, opp } = setup([cinderCloud(), cinderCloud()]);
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, ap, mountain);
    const knight = putOnBattlefield(s0, opp, whiteKnight());
    const giant = putOnBattlefield(s0, opp, hillGiant());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(knight)]));
    expect([zone(s, knight), life(s, opp)]).toEqual(["graveyard", 37]);
    s = settle(castNow(s, ap, ids[1]!, [tgt(giant)]));
    expect([zone(s, giant), life(s, opp)]).toEqual(["graveyard", 37]);
  });

  it("Creature Bond: when the enchanted creature dies, its controller takes damage equal to its toughness", () => {
    const { s: s0, ap, ids, opp } = setup([creatureBond(), doom()]);
    const giant = putOnBattlefield(s0, opp, hillGiant());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(giant)]));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(giant);
    s = settle(castNow(s, ap, ids[1]!, [tgt(giant)]));
    expect([zone(s, giant), life(s, opp), life(s, ap)]).toEqual(["graveyard", 37, 40]);
  });

  it("Necrotic Fumes: a creature you control is exiled to cast it; without one it can't be cast", () => {
    const { s: s0, ap, ids, opp } = setup([necroticFumes(), necroticFumes()]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    const giant = putOnBattlefield(s0, opp, hillGiant());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(giant)], { sacrifice: [bear] }));
    expect([zone(s, bear), zone(s, giant)]).toEqual(["exile", "exile"]);
    const other = putOnBattlefield(s, opp, greenBear());
    expect(planCast(s, ap, ids[1]!, [tgt(other)])).toBeNull();
  });

  it("Ruthless Disposal: discard a card and sacrifice a creature, then two target creatures get -13/-13", () => {
    const { s: s0, ap, ids, opp } = setup([ruthlessDisposal()]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    const giant = putOnBattlefield(s0, opp, hillGiant());
    const knight = putOnBattlefield(s0, opp, whiteKnight());
    const junk = s0.players[ap]!.hand.find((id) => id !== ids[0])!;
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(giant), tgt(knight)], { discard: [junk], sacrifice: [bear] }));
    expect([zone(s, junk), zone(s, bear), zone(s, giant), zone(s, knight)]).toEqual(["graveyard", "graveyard", "graveyard", "graveyard"]);
  });

  it("Ruthless Disposal: not without another card in hand", () => {
    const { s: s0, ap, ids, opp } = setup([ruthlessDisposal()]);
    s0.players[ap]!.hand = [ids[0]!];
    putOnBattlefield(s0, ap, greenBear());
    const giant = putOnBattlefield(s0, opp, hillGiant());
    const knight = putOnBattlefield(s0, opp, whiteKnight());
    expect(planCast(s0, ap, ids[0]!, [tgt(giant), tgt(knight)])).toBeNull();
  });

  it("Swift Silence counters every other spell and draws a card for each; Multani's Presence draws one more for each of yours", () => {
    const { s: s0, ap, ids, opp } = setup([study(), shock(), swiftSilence()]);
    putOnBattlefield(s0, ap, multanisPresence());
    let s = run(s0, planCast(s0, ap, ids[0]!, []));
    s = run(s, planCast(s, ap, ids[1]!, [ply(opp)]));
    s = run(s, planCast(s, ap, ids[2]!, []));
    const hand = s.players[ap]!.hand.length;
    s = settle(s);
    expect([zone(s, ids[0]!), zone(s, ids[1]!), life(s, opp)]).toEqual(["graveyard", "graveyard", 40]);
    expect(s.players[ap]!.hand.length).toBe(hand + 4);
  });

  it("Multani's Presence: not for a spell that only fails to resolve", () => {
    const { s: s0, ap, ids, opp } = setup([shock(), doom()]);
    putOnBattlefield(s0, ap, multanisPresence());
    const bear = putOnBattlefield(s0, opp, greenBear());
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(bear)]));
    s = run(s, planCast(s, ap, ids[1]!, [tgt(bear)]));
    const hand = s.players[ap]!.hand.length;
    s = settle(s);
    expect([zone(s, bear), zone(s, ids[0]!), s.players[ap]!.hand.length]).toEqual(["graveyard", "graveyard", hand]);
  });

  it("Hellfire: destroys every nonblack creature and deals 3 more than the number that died to you", () => {
    const { s: s0, ap, ids, opp } = setup([hellfire()]);
    putOnBattlefield(s0, ap, swamp);
    const bear = putOnBattlefield(s0, ap, greenBear());
    const giant = putOnBattlefield(s0, opp, hillGiant());
    const black = putOnBattlefield(s0, opp, blackKnight());
    const s = settle(castNow(s0, ap, ids[0]!));
    expect([zone(s, bear), zone(s, giant), zone(s, black), life(s, ap)]).toEqual(["graveyard", "graveyard", "battlefield", 35]);
  });

  it("Soulquake: every creature and every creature card in a graveyard goes to its owner's hand", () => {
    const { s: s0, ap, ids, opp } = setup([soulquake()]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    const giant = putOnBattlefield(s0, opp, hillGiant());
    const dead = toZone(s0, opp, whiteKnight(), "graveyard");
    const sorcery = toZone(s0, opp, study(), "graveyard");
    const s = settle(castNow(s0, ap, ids[0]!));
    expect([zone(s, bear), zone(s, giant), zone(s, dead), zone(s, sorcery)]).toEqual(["hand", "hand", "hand", "graveyard"]);
    expect([s.players[ap]!.hand.includes(bear), s.players[opp]!.hand.includes(giant), s.players[opp]!.hand.includes(dead)]).toEqual([true, true, true]);
  });

  it("Leeches: target player loses all poison counters and takes that much damage", () => {
    const { s: s0, ap, ids, opp } = setup([leeches(), leeches()]);
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, ap, plainsCard);
    s0.players[opp]!.poison = 4;
    let s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]));
    expect([s.players[opp]!.poison ?? 0, life(s, opp)]).toEqual([0, 36]);
    s = settle(castNow(s, ap, ids[1]!, [ply(opp)]));
    expect(life(s, opp)).toBe(36);
  });

  it("Heed the Mists: mills a card, then draws as many cards as its mana value", () => {
    const { s: s0, ap, ids } = setup([heedTheMists()]);
    const top = toZone(s0, ap, hillGiant(), "library");
    let s = castNow(s0, ap, ids[0]!);
    const hand = s.players[ap]!.hand.length;
    s = settle(s);
    expect([zone(s, top), s.players[ap]!.hand.length]).toEqual(["graveyard", hand + 4]);
  });

  it("Ghostfire is colorless, so protection from red doesn't stop it", () => {
    const { s: s0, ap, ids, opp } = setup([ghostfire()]);
    const ward = putOnBattlefield(s0, opp, redWard());
    expect(colorsOf(s0, ids[0]!)).toEqual([]);
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(ward)]));
    expect(s.objects[ward]!.damage).toBe(3);
  });

  it("Barishi: when it dies, it's exiled, then the creature cards in your graveyard are shuffled into your library", () => {
    const { s: s0, ap, ids } = setup([doom()]);
    const barishi1 = putOnBattlefield(s0, ap, barishi());
    const dead = toZone(s0, ap, whiteKnight(), "graveyard");
    const sorcery = toZone(s0, ap, study(), "graveyard");
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(barishi1)]));
    expect([zone(s, barishi1), zone(s, dead), zone(s, sorcery)]).toEqual(["exile", "library", "graveyard"]);
  });

  it("Lunar Hatchling: its escape cost exiles a land you control and five other cards from your graveyard", () => {
    const { s: s0, ap } = setup([]);
    const hatchling = toZone(s0, ap, lunarHatchling(), "graveyard");
    const others = [0, 1, 2, 3, 4].map((i) => toZone(s0, ap, creature(`Dead ${i}`, "Creature — Bear", "{1}{G}", 2, 2, { cmc: 2, colors: ["G"] }), "graveyard"));
    const land = s0.battlefield.find((id) => s0.objects[id]!.controller === ap && characteristics(s0, s0.objects[id]!).types.includes("Land") && characteristics(s0, s0.objects[id]!).subtypes.includes("Forest"))!;
    const s = settle(castNow(s0, ap, hatchling, [], { via: "escape", exileCards: others, sacrifice: [land] }));
    expect([zone(s, hatchling), zone(s, land), ...others.map((id) => zone(s, id))]).toEqual(["battlefield", "exile", "exile", "exile", "exile", "exile", "exile"]);
  });
});
