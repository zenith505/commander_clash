// Lane B, round 42: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, scry, setup } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
/** The spell on the stack for the card `id`. */
const spell = (s: GameState, id: string): TargetChoice => ({ kind: "stack", id: s.stack.find((x) => x.objectId === id)!.id });
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
/** Passes priority until the defending player declares blockers. */
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
const landsOf = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).types.includes("Land"));
const counters = (s: GameState, id: string) => s.objects[id]!.counters?.["+1/+1"] ?? 0;

// Real oracle text (Scryfall).
const draconicRoar = () => card("Draconic Roar", "Instant", "{1}{R}", { cmc: 2, colors: ["R"], oracleText: "As an additional cost to cast this spell, you may reveal a Dragon card from your hand.\nDraconic Roar deals 3 damage to target creature. If you revealed a Dragon card or controlled a Dragon as you cast this spell, Draconic Roar deals 3 damage to that creature's controller." });
const dragonlordsPrerogative = () => card("Dragonlord's Prerogative", "Instant", "{4}{U}{U}", { cmc: 6, colors: ["U"], oracleText: "As an additional cost to cast this spell, you may reveal a Dragon card from your hand.\nIf you revealed a Dragon card or controlled a Dragon as you cast this spell, this spell can't be countered.\nDraw four cards." });
const foulTongueInvocation = () => card("Foul-Tongue Invocation", "Instant", "{2}{B}", { cmc: 3, colors: ["B"], oracleText: "As an additional cost to cast this spell, you may reveal a Dragon card from your hand.\nTarget player sacrifices a creature of their choice. If you revealed a Dragon card or controlled a Dragon as you cast this spell, you gain 4 life." });
const oratorOfOjutai = () => card("Orator of Ojutai", "Creature — Bird Monk", "{1}{W}", { cmc: 2, colors: ["W"], power: "0", toughness: "4", keywords: ["Flying", "Defender"], oracleText: "As an additional cost to cast this spell, you may reveal a Dragon card from your hand.\nDefender, flying\nWhen this creature enters, if you revealed a Dragon card or controlled a Dragon as you cast this spell, draw a card." });
const silumgarsScorn = () => card("Silumgar's Scorn", "Instant", "{U}{U}", { cmc: 2, colors: ["U"], oracleText: "As an additional cost to cast this spell, you may reveal a Dragon card from your hand.\nCounter target spell unless its controller pays {1}. If you revealed a Dragon card or controlled a Dragon as you cast this spell, counter that spell instead." });
const scaleguardSentinels = () => card("Scaleguard Sentinels", "Creature — Human Soldier", "{G}{G}", { cmc: 2, colors: ["G"], power: "2", toughness: "3", oracleText: "As an additional cost to cast this spell, you may reveal a Dragon card from your hand.\nThis creature enters with a +1/+1 counter on it if you revealed a Dragon card or controlled a Dragon as you cast this spell." });
const tasteOfParadise = () => card("Taste of Paradise", "Sorcery", "{3}{G}", { cmc: 4, colors: ["G"], oracleText: "As an additional cost to cast this spell, you may pay {1}{G} any number of times.\nYou gain 3 life plus an additional 3 life for each additional {1}{G} you paid." });
const secondGuess = () => card("Second Guess", "Instant", "{1}{U}", { cmc: 2, colors: ["U"], oracleText: "Counter target spell that's the second spell cast this turn." });
const parallectricFeedback = () => card("Parallectric Feedback", "Instant", "{3}{R}", { cmc: 4, colors: ["R"], oracleText: "Parallectric Feedback deals damage to target spell's controller equal to that spell's mana value." });
const refuseCooperate = () =>
  scry(
    "split",
    [
      { name: "Refuse", mana_cost: "{3}{R}", type_line: "Instant", oracle_text: "Refuse deals damage to target spell's controller equal to that spell's mana value." },
      { name: "Cooperate", mana_cost: "{2}{U}", type_line: "Instant", oracle_text: "Aftermath (Cast this spell only from your graveyard. Then exile it.)\nCopy target instant or sorcery spell. You may choose new targets for the copy." },
    ],
    { keywords: ["Aftermath"] },
  );
const pyrrhicRevival = () => card("Pyrrhic Revival", "Sorcery", "{3}{W/B}{W/B}{W/B}", { cmc: 6, colors: ["B", "W"], oracleText: "Each player returns each creature card from their graveyard to the battlefield with an additional -1/-1 counter on it." });
const perilousPredicament = () => card("Perilous Predicament", "Instant", "{4}{B}", { cmc: 5, colors: ["B"], oracleText: "Each opponent sacrifices an artifact creature and a nonartifact creature of their choice." });
const metallicMastery = () => card("Metallic Mastery", "Sorcery", "{2}{R}", { cmc: 3, colors: ["R"], oracleText: "Gain control of target artifact until end of turn. Untap that artifact. It gains haste until end of turn." });
const redcapMelee = () => card("Redcap Melee", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Redcap Melee deals 4 damage to target creature or planeswalker. If a nonred permanent is dealt damage this way, you sacrifice a land." });
const prophecy = () => card("Prophecy", "Sorcery", "{W}", { cmc: 1, colors: ["W"], oracleText: "Reveal the top card of target opponent's library. If it's a land, you gain 1 life. Then that player shuffles.\nDraw a card at the beginning of the next turn's upkeep." });
const falseMemories = () => card("False Memories", "Instant", "{1}{U}", { cmc: 2, colors: ["U"], keywords: ["Mill"], oracleText: "Mill seven cards. At the beginning of the next end step, exile seven cards from your graveyard." });
const shipwreckSifters = () => card("Shipwreck Sifters", "Creature — Spirit", "{1}{U}", { cmc: 2, colors: ["U"], power: "1", toughness: "2", oracleText: "When this creature enters, draw a card, then discard a card.\nWhenever you discard a Spirit card or a card with disturb, put a +1/+1 counter on this creature." });
const phantomCarriage = () => card("Phantom Carriage", "Creature — Spirit", "{4}{U}{U}", { cmc: 6, colors: ["U"], power: "4", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nWhen this creature enters, you may search your library for a card with flashback or disturb, put it into your graveyard, then shuffle." });
const brandOfIllOmen = () => card("Brand of Ill Omen", "Enchantment — Aura", "{3}{R}", { cmc: 4, colors: ["R"], keywords: ["Enchant", "Cumulative upkeep"], oracleText: "Enchant creature\nCumulative upkeep {R} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nEnchanted creature's controller can't cast creature spells." });
const almsBeast = () => card("Alms Beast", "Creature — Beast", "{2}{W}{B}", { cmc: 4, colors: ["B", "W"], power: "6", toughness: "6", oracleText: "Creatures blocking or blocked by this creature have lifelink." });
const bulwark = () => card("Bulwark", "Enchantment", "{3}{R}{R}", { cmc: 5, colors: ["R"], oracleText: "At the beginning of your upkeep, this enchantment deals X damage to target opponent, where X is the number of cards in your hand minus the number of cards in that player's hand." });
const gargantuanLeech = () => card("Gargantuan Leech", "Creature — Leech", "{7}{B}", { cmc: 8, colors: ["B"], power: "5", toughness: "5", keywords: ["Lifelink"], oracleText: "This spell costs {1} less to cast for each Cave you control and each Cave card in your graveyard.\nLifelink" });
const anthroplasm = () => card("Anthroplasm", "Creature — Shapeshifter", "{2}{U}{U}", { cmc: 4, colors: ["U"], power: "0", toughness: "0", oracleText: "This creature enters with two +1/+1 counters on it.\n{X}, {T}: Remove all +1/+1 counters from this creature and put X +1/+1 counters on it." });
const rockJockey = () => card("Rock Jockey", "Creature — Goblin", "{2}{R}", { cmc: 3, colors: ["R"], power: "3", toughness: "3", oracleText: "You can't cast Rock Jockey if you've played a land this turn.\nYou can't play lands if this creature was cast this turn." });
const jujuBubble = () => card("Juju Bubble", "Artifact", "{1}", { cmc: 1, colors: [], keywords: ["Cumulative upkeep"], oracleText: "Cumulative upkeep {1} (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nWhen you play a card, sacrifice this artifact.\n{2}: You gain 1 life." });
const coralFighters = () => card("Coral Fighters", "Creature — Merfolk Soldier", "{1}{U}", { cmc: 2, colors: ["U"], power: "1", toughness: "1", oracleText: "Whenever this creature attacks and isn't blocked, look at the top card of defending player's library. You may put that card on the bottom of that player's library." });
const machinistsDismissal = () => card("Machinist's Dismissal", "Instant", "{4}{U}", { cmc: 5, colors: ["U"], oracleText: "This spell costs {1} less to cast for each artifact you control and each artifact card in your hand.\nCounter target noncreature spell." });
const hiddenNursery = () => card("Hidden Nursery", "Land — Cave", "", { cmc: 0, colors: [], keywords: ["Discover"], oracleText: "This land enters tapped.\n{T}: Add {G}.\n{4}{G}, {T}, Sacrifice this land: Discover 4. Activate only as a sorcery. (Exile cards from the top of your library until you exile a nonland card with mana value 4 or less. Cast it without paying its mana cost or put it into your hand. Put the rest on the bottom in a random order.)" });

const creature = (name: string, typeLine: string, cost: string, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, cost, { power: String(p), toughness: String(t), ...extra });
const dragon = () => creature("Test Dragon", "Creature — Dragon", "{4}{R}{R}", 5, 5, { cmc: 6, colors: ["R"], keywords: ["Flying"], oracleText: "Flying" });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2, { cmc: 2, colors: ["G"] });
const hillGiant = () => creature("Hill Giant", "Creature — Giant", "{3}{R}", 3, 3, { cmc: 4, colors: ["R"] });
const wall = () => creature("Test Wall", "Creature — Wall", "{1}{W}", 0, 10, { cmc: 2, colors: ["W"], keywords: ["Defender"], oracleText: "Defender" });
const sprite = () => creature("Test Sprite", "Creature — Faerie", "{U}", 1, 1, { cmc: 1, colors: ["U"] });
const golem = () => creature("Test Golem", "Artifact Creature — Golem", "{3}", 3, 3, { cmc: 3 });
const study = () => card("Quick Study", "Sorcery", "{U}", { cmc: 1, colors: ["U"], oracleText: "Draw a card." });
const quickStudy = () => card("Quick Study", "Instant", "{U}", { cmc: 1, colors: ["U"], oracleText: "Draw a card." });
const cancel = () => card("Test Cancel", "Instant", "{2}{U}", { cmc: 3, colors: ["U"], oracleText: "Counter target spell." });
const relic = () => card("Test Relic", "Artifact", "{2}", { cmc: 2 });
const flashbackSpell = () => card("Test Flashback", "Sorcery", "{R}", { cmc: 1, colors: ["R"], keywords: ["Flashback"], oracleText: "Test Flashback deals 1 damage to any target.\nFlashback {1}{R}" });
const disturbCard = () => card("Test Disturb", "Creature — Human", "{1}{W}", { cmc: 2, colors: ["W"], power: "1", toughness: "1", keywords: ["Disturb"], oracleText: "Disturb {2}{W}" });

describe("Lane B round 42", () => {
  it("compiles every card fully", () => {
    supported(draconicRoar(), dragonlordsPrerogative(), foulTongueInvocation(), oratorOfOjutai(), silumgarsScorn(), scaleguardSentinels());
    supported(tasteOfParadise(), secondGuess(), parallectricFeedback(), refuseCooperate(), pyrrhicRevival(), perilousPredicament(), metallicMastery());
    supported(redcapMelee(), prophecy(), falseMemories(), shipwreckSifters(), phantomCarriage(), brandOfIllOmen(), almsBeast(), bulwark());
    supported(gargantuanLeech(), anthroplasm(), rockJockey(), jujuBubble(), coralFighters(), machinistsDismissal());
    supported(dragon(), greenBear(), hillGiant(), wall(), sprite(), golem(), study(), quickStudy(), cancel(), relic(), flashbackSpell());
  });
});

describe("Revealed a Dragon card or controlled a Dragon (Dragons of Tarkir)", () => {
  it("Draconic Roar: revealing a Dragon card from your hand also deals 3 damage to the creature's controller", () => {
    const { s: s0, ap, ids, opp } = setup([draconicRoar(), dragon()]);
    const giant = putOnBattlefield(s0, opp, hillGiant());
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(giant)], { kicks: [0], reveal: [ids[1]!] }));
    expect([zone(s, giant), life(s, opp), zone(s, ids[1]!)]).toEqual(["graveyard", 37, "hand"]);
  });

  it("Draconic Roar: without a reveal or a Dragon only the creature is dealt damage", () => {
    const { s: s0, ap, ids, opp } = setup([draconicRoar(), dragon()]);
    const giant = putOnBattlefield(s0, opp, hillGiant());
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(giant)]));
    expect([zone(s, giant), life(s, opp)]).toEqual(["graveyard", 40]);
  });

  it("Draconic Roar: controlling a Dragon as you cast it counts, and revealing one too gives nothing more", () => {
    const { s: s0, ap, ids, opp } = setup([draconicRoar(), dragon()]);
    putOnBattlefield(s0, ap, dragon());
    const giant = putOnBattlefield(s0, opp, hillGiant());
    let s = castNow(s0, ap, ids[0]!, [tgt(giant)]);
    expect(s.stack.at(-1)!.kicked).toEqual([0]);
    s = settle(s);
    expect([zone(s, giant), life(s, opp)]).toEqual(["graveyard", 37]);
    // Revealing one as well (rulings: no additional benefit).
    const { s: s1, ap: ap1, ids: ids1, opp: opp1 } = setup([draconicRoar(), dragon()]);
    putOnBattlefield(s1, ap1, dragon());
    const giant1 = putOnBattlefield(s1, opp1, hillGiant());
    const t = settle(castNow(s1, ap1, ids1[0]!, [tgt(giant1)], { kicks: [0], reveal: [ids1[1]!] }));
    expect(life(t, opp1)).toBe(37);
  });

  it("a copy of Draconic Roar cast while controlling a Dragon doesn't get the bonus; a copy of one cast with a revealed Dragon does (rulings)", () => {
    for (const reveal of [false, true]) {
      const { s: s0, ap, ids, opp } = setup([draconicRoar(), dragon()]);
      if (!reveal) putOnBattlefield(s0, ap, dragon());
      const w = putOnBattlefield(s0, opp, wall());
      let s = castNow(s0, ap, ids[0]!, [tgt(w)], reveal ? { kicks: [0], reveal: [ids[1]!] } : {});
      const coop = toZone(s, ap, refuseCooperate(), "graveyard");
      s = run(s, planCast(s, ap, coop, [spell(s, ids[0]!)], undefined, "auto", undefined, { face: 1, via: "aftermath" }));
      s = settle(s);
      // The wall survives 3 + 3; the original deals 3 to its controller, the copy 3 more only if a Dragon was revealed.
      expect([zone(s, w), life(s, opp), life(s, ap)], `reveal ${reveal}`).toEqual(["battlefield", reveal ? 34 : 37, 40]);
    }
  });

  it("Dragonlord's Prerogative: can't be countered if you revealed a Dragon card; otherwise it can", () => {
    for (const reveal of [true, false]) {
      const { s: s0, ap, ids } = setup([dragonlordsPrerogative(), dragon(), cancel()]);
      let s = castNow(s0, ap, ids[0]!, [], reveal ? { kicks: [0], reveal: [ids[1]!] } : {});
      s = castNow(s, ap, ids[2]!, [spell(s, ids[0]!)]);
      const hand = s.players[ap]!.hand.length;
      s = settle(s);
      expect([zone(s, ids[0]!), s.players[ap]!.hand.length - hand], `reveal ${reveal}`).toEqual(["graveyard", reveal ? 4 : 0]);
      expect(zone(s, ids[2]!)).toBe("graveyard");
    }
  });

  it("Foul-Tongue Invocation: the player sacrifices a creature; you gain 4 life only with a Dragon", () => {
    for (const withDragon of [true, false]) {
      const { s: s0, ap, ids, opp } = setup([foulTongueInvocation()]);
      if (withDragon) putOnBattlefield(s0, ap, dragon());
      const bear = putOnBattlefield(s0, opp, greenBear());
      const s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]));
      expect([zone(s, bear), life(s, ap)], `dragon ${withDragon}`).toEqual(["graveyard", withDragon ? 44 : 40]);
    }
  });

  it("Orator of Ojutai: draws a card when it enters only if you revealed a Dragon card or controlled a Dragon", () => {
    for (const how of ["reveal", "control", "none"] as const) {
      const { s: s0, ap, ids } = setup([oratorOfOjutai(), dragon()]);
      if (how === "control") putOnBattlefield(s0, ap, dragon());
      let s = castNow(s0, ap, ids[0]!, [], how === "reveal" ? { kicks: [0], reveal: [ids[1]!] } : {});
      const hand = s.players[ap]!.hand.length;
      s = settle(s);
      expect([zone(s, ids[0]!), s.players[ap]!.hand.length - hand], how).toEqual(["battlefield", how === "none" ? 0 : 1]);
    }
  });

  it("Silumgar's Scorn: with a revealed Dragon card the spell is countered without a chance to pay {1}", () => {
    const { s: s0, ap, ids } = setup([silumgarsScorn(), dragon(), quickStudy()]);
    let s = castNow(s0, ap, ids[2]!);
    s = castNow(s, ap, ids[0]!, [spell(s, ids[2]!)], { kicks: [0], reveal: [ids[1]!] });
    s = settle(s, (x) => x.pending?.kind === "payUnless");
    expect(s.pending?.kind).toBeUndefined();
    expect(zone(s, ids[2]!)).toBe("graveyard");
  });

  it("Silumgar's Scorn: without a Dragon the spell's controller may pay {1}", () => {
    const { s: s0, ap, ids } = setup([silumgarsScorn(), quickStudy()]);
    let s = castNow(s0, ap, ids[1]!);
    s = castNow(s, ap, ids[0]!, [spell(s, ids[1]!)]);
    s = settle(s, (x) => x.pending?.kind === "payUnless");
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap });
  });

  it("Scaleguard Sentinels: enters with a +1/+1 counter if you revealed a Dragon card or controlled a Dragon", () => {
    for (const how of ["reveal", "control", "none"] as const) {
      const { s: s0, ap, ids } = setup([scaleguardSentinels(), dragon()]);
      if (how === "control") putOnBattlefield(s0, ap, dragon());
      const s = settle(castNow(s0, ap, ids[0]!, [], how === "reveal" ? { kicks: [0], reveal: [ids[1]!] } : {}));
      expect(pt(s, ids[0]!), how).toBe(how === "none" ? "2/3" : "3/4");
    }
  });

  it("the Dragon is checked as the spell finishes being cast: one that leaves later still counts (rulings)", () => {
    const { s: s0, ap, ids } = setup([scaleguardSentinels()]);
    const d = putOnBattlefield(s0, ap, dragon());
    let s = castNow(s0, ap, ids[0]!);
    s.objects[d]!.zone = "graveyard";
    s.battlefield.splice(s.battlefield.indexOf(d), 1);
    s.players[ap]!.graveyard.push(d);
    invalidateCharacteristics(s);
    s = settle(s);
    expect(pt(s, ids[0]!)).toBe("3/4");
  });
});

describe("Spells on the stack", () => {
  it("Taste of Paradise: 3 life plus 3 for each extra {1}{G} paid", () => {
    for (const kicks of [[], [0], [0, 0]]) {
      const { s: s0, ap, ids } = setup([tasteOfParadise()]);
      const s = settle(castNow(s0, ap, ids[0]!, [], { kicks }));
      expect(life(s, ap), `${kicks.length} times`).toBe(43 + 3 * kicks.length);
    }
  });

  it("Second Guess: only the second spell cast this turn can be targeted, resolved or not", () => {
    const { s: s0, ap, ids } = setup([quickStudy(), quickStudy(), secondGuess()]);
    let s = settle(castNow(s0, ap, ids[0]!));
    s = castNow(s, ap, ids[1]!);
    expect(planCast(s, ap, ids[2]!, [spell(s, ids[1]!)])).not.toBeNull();
    s = castNow(s, ap, ids[2]!, [spell(s, ids[1]!)]);
    const hand = s.players[ap]!.hand.length;
    s = settle(s);
    // Countered: no card drawn.
    expect([zone(s, ids[1]!), s.players[ap]!.hand.length - hand]).toEqual(["graveyard", 0]);
  });

  it("Second Guess: the first spell cast this turn isn't a legal target", () => {
    const { s: s0, ap, ids } = setup([quickStudy(), secondGuess()]);
    const s = castNow(s0, ap, ids[0]!);
    expect(planCast(s, ap, ids[1]!, [spell(s, ids[0]!)])).toBeNull();
  });

  it("Parallectric Feedback and Refuse: damage to the spell's controller equal to its mana value", () => {
    for (const which of ["feedback", "refuse"] as const) {
      const { s: s0, ap, ids } = setup([hillGiant(), which === "feedback" ? parallectricFeedback() : refuseCooperate()]);
      let s = castNow(s0, ap, ids[0]!);
      s = castNow(s, ap, ids[1]!, [spell(s, ids[0]!)], which === "refuse" ? { face: 0 } : {});
      s = settle(s);
      expect([life(s, ap), zone(s, ids[0]!)], which).toEqual([36, "battlefield"]);
    }
  });

  it("Machinist's Dismissal costs {1} less for each artifact you control and each artifact card in your hand", () => {
    const { s: s0, ap, ids } = setup([machinistsDismissal(), relic(), quickStudy()]);
    putOnBattlefield(s0, ap, relic());
    putOnBattlefield(s0, ap, golem());
    let s = castNow(s0, ap, ids[2]!);
    const untapped = landsOf(s, ap).filter((id) => !s.objects[id]!.tapped).length;
    s = castNow(s, ap, ids[0]!, [spell(s, ids[2]!)]);
    // {4}{U} less 3: {1}{U}.
    expect(untapped - landsOf(s, ap).filter((id) => !s.objects[id]!.tapped).length).toBe(2);
    s = settle(s);
    expect(zone(s, ids[2]!)).toBe("graveyard");
  });

  it("Machinist's Dismissal can't target a creature spell", () => {
    const { s: s0, ap, ids } = setup([machinistsDismissal(), hillGiant()]);
    const s = castNow(s0, ap, ids[1]!);
    expect(planCast(s, ap, ids[0]!, [spell(s, ids[1]!)])).toBeNull();
  });
});

describe("Graveyards and libraries", () => {
  it("Pyrrhic Revival: every player's creature cards return with a -1/-1 counter; a 1/1 dies again", () => {
    const { s: s0, ap, ids, opp } = setup([pyrrhicRevival()]);
    const bear = toZone(s0, ap, greenBear(), "graveyard");
    const fairy = toZone(s0, opp, sprite(), "graveyard");
    const s = settle(castNow(s0, ap, ids[0]!));
    expect([zone(s, bear), pt(s, bear), s.objects[bear]!.counters?.["-1/-1"]]).toEqual(["battlefield", "1/1", 1]);
    expect(zone(s, fairy)).toBe("graveyard");
  });

  it("Perilous Predicament: each opponent sacrifices an artifact creature and a nonartifact creature", () => {
    const { s: s0, ap, ids, opp } = setup([perilousPredicament()]);
    const g = putOnBattlefield(s0, opp, golem());
    const b = putOnBattlefield(s0, opp, greenBear());
    const b2 = putOnBattlefield(s0, opp, greenBear());
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    const lone = putOnBattlefield(s0, third, hillGiant());
    const mine = putOnBattlefield(s0, ap, golem());
    const s = settle(castNow(s0, ap, ids[0]!));
    expect(zone(s, g)).toBe("graveyard");
    expect([b, b2].filter((id) => zone(s, id) === "graveyard").length).toBe(1);
    expect([zone(s, lone), zone(s, mine)]).toEqual(["graveyard", "battlefield"]);
  });

  it("Prophecy: you gain 1 life if the top card is a land; you draw at the next turn's upkeep either way", () => {
    for (const top of ["land", "creature"] as const) {
      const { s: s0, ap, ids, opp } = setup([prophecy()]);
      const card0 = toZone(s0, opp, top === "land" ? hiddenNursery() : greenBear(), "library");
      onlyHand(s0, ap, [ids[0]!]);
      let s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]));
      expect(life(s, ap), top).toBe(top === "land" ? 41 : 40);
      expect(zone(s, card0)).toBe("library");
      const hand = s.players[ap]!.hand.length;
      s = goUntil(s, (x) => x.activePlayer !== ap && x.step === "draw");
      expect(s.players[ap]!.hand.length - hand, top).toBe(1);
    }
  });

  it("False Memories: mill seven, then exile seven cards from your graveyard at the next end step", () => {
    const { s: s0, ap, ids } = setup([falseMemories()]);
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(s.players[ap]!.graveyard.length).toBe(8);
    const exiled = s.players[ap]!.exile.length;
    s = goUntil(s, (x) => x.step === "cleanup" || x.activePlayer !== ap);
    expect([s.players[ap]!.graveyard.length, s.players[ap]!.exile.length - exiled]).toEqual([1, 7]);
  });

  it("Shipwreck Sifters: discarding a Spirit card or a card with disturb puts a +1/+1 counter on it; another card doesn't", () => {
    const { s: s0, ap, ids } = setup([shipwreckSifters(), shipwreckSifters(), disturbCard(), greenBear()]);
    const [sifter, spirit, disturb, other] = ids as [string, string, string, string];
    let s = castNow(s0, ap, sifter);
    s = settle(s, (x) => x.pending?.kind === "discard");
    expect(s.pending?.kind).toBe("discard");
    s = act(s, { type: "discard", player: ap, objectIds: [spirit] });
    s = settle(s);
    expect(counters(s, sifter)).toBe(1);
    // A loot to discard the others.
    for (const [id, n] of [[disturb, 2], [other, 2]] as const) {
      const loot = toZone(s, ap, card("Test Loot", "Instant", "{U}", { cmc: 1, colors: ["U"], oracleText: "Draw a card, then discard a card." }), "hand");
      s = castNow(s, ap, loot);
      s = settle(s, (x) => x.pending?.kind === "discard");
      s = act(s, { type: "discard", player: ap, objectIds: [id] });
      s = settle(s);
      expect(counters(s, sifter), s.cards[s.objects[id]!.cardId]!.name).toBe(n);
    }
  });

  it("Phantom Carriage: may search for a card with flashback or disturb and put it into the graveyard", () => {
    const { s: s0, ap, ids } = setup([phantomCarriage()]);
    const fb = toZone(s0, ap, flashbackSpell(), "library");
    let s = castNow(s0, ap, ids[0]!);
    s = settle(s, (x) => x.pending?.kind === "searchLibrary");
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s, (x) => x.pending?.kind === "searchLibrary");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", cards: [fb] });
    s = act(s, { type: "searchLibrary", player: ap, found: [fb] });
    s = settle(s);
    expect(zone(s, fb)).toBe("graveyard");
  });
});

describe("Permanents", () => {
  it("Metallic Mastery: gains control of an artifact until end of turn, untaps it and gives it haste", () => {
    const { s: s0, ap, ids, opp } = setup([metallicMastery()]);
    const g = putOnBattlefield(s0, opp, golem());
    s0.objects[g]!.tapped = true;
    s0.objects[g]!.enteredTurn = s0.turn;
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(g)]));
    expect([s.objects[g]!.tapped, characteristics(s, s.objects[g]!).controller ?? s.objects[g]!.controller, objHasKeyword(s, s.objects[g]!, "Haste")]).toEqual([false, ap, true]);
    s = goUntil(s, (x) => x.activePlayer !== ap);
    expect([s.objects[g]!.controller === opp || characteristics(s, s.objects[g]!).controller === opp, objHasKeyword(s, s.objects[g]!, "Haste")]).toEqual([true, false]);
  });

  it("Redcap Melee: you sacrifice a land only if a nonred permanent was dealt damage", () => {
    for (const red of [false, true]) {
      const { s: s0, ap, ids, opp } = setup([redcapMelee()]);
      const c = putOnBattlefield(s0, opp, red ? hillGiant() : greenBear());
      const lands = landsOf(s0, ap).length;
      const s = settle(castNow(s0, ap, ids[0]!, [tgt(c)]));
      expect([zone(s, c), lands - landsOf(s, ap).length], `red ${red}`).toEqual(["graveyard", red ? 0 : 1]);
    }
  });

  it("Brand of Ill Omen: the enchanted creature's controller can't cast creature spells", () => {
    const { s: s0, ap, ids, opp } = setup([brandOfIllOmen(), greenBear(), quickStudy()]);
    const theirs = putOnBattlefield(s0, opp, hillGiant());
    const mine = putOnBattlefield(s0, ap, hillGiant());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(mine)]));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(mine);
    expect(planCast(s, ap, ids[1]!)).toBeNull();
    expect(planCast(s, ap, ids[2]!)).not.toBeNull();
    // On their creature, you can cast creature spells again.
    s.objects[ids[0]!]!.attachedTo = theirs;
    invalidateCharacteristics(s);
    expect(planCast(s, ap, ids[1]!)).not.toBeNull();
  });

  it("Alms Beast: creatures blocking or blocked by it have lifelink", () => {
    const { s: s0, ap, opp } = setup([]);
    const beast = putOnBattlefield(s0, ap, almsBeast());
    const blocker = putOnBattlefield(s0, opp, hillGiant());
    const other = putOnBattlefield(s0, opp, greenBear());
    let s = attackWith(s0, [beast], opp);
    expect(objHasKeyword(s, s.objects[blocker]!, "Lifelink")).toBe(false);
    s = toBlocks(s);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker: beast }] });
    expect([objHasKeyword(s, s.objects[blocker]!, "Lifelink"), objHasKeyword(s, s.objects[other]!, "Lifelink"), objHasKeyword(s, s.objects[beast]!, "Lifelink")]).toEqual([true, false, false]);
    s = goUntil(s, (x) => x.step === "end");
    expect([zone(s, blocker), life(s, opp)]).toEqual(["graveyard", 43]);
  });

  it("Bulwark: at your upkeep, X damage to target opponent, your hand minus theirs, never less than 0", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, bulwark());
    onlyHand(s0, ap, []);
    for (let i = 0; i < 5; i++) toZone(s0, ap, greenBear(), "hand");
    onlyHand(s0, opp, []);
    toZone(s0, opp, greenBear(), "hand");
    let s = goUntil(s0, (x) => x.activePlayer === ap && x.step === "upkeep" && x.turn > s0.turn);
    // Hands change over the other turns; work out X as the trigger resolves.
    s = settle(s, (x) => x.stack.length > 0 && !x.pending);
    const target = (s.stack.at(-1)?.targets?.[0] as { id: PlayerId } | undefined)?.id;
    expect(target).toBeDefined();
    const x = Math.max(0, s.players[ap]!.hand.length - s.players[target!]!.hand.length);
    const before = life(s, target!);
    s = settle(s);
    expect(before - life(s, target!)).toBe(x);
  });

  it("Gargantuan Leech costs {1} less for each Cave you control and each Cave card in your graveyard", () => {
    const { s: s0, ap, ids } = setup([gargantuanLeech()]);
    putOnBattlefield(s0, ap, hiddenNursery());
    toZone(s0, ap, hiddenNursery(), "graveyard");
    toZone(s0, ap, hiddenNursery(), "graveyard");
    const untapped = landsOf(s0, ap).filter((id) => !s0.objects[id]!.tapped).length;
    const s = castNow(s0, ap, ids[0]!);
    expect(untapped - landsOf(s, ap).filter((id) => !s.objects[id]!.tapped).length).toBe(5);
  });

  it("Anthroplasm: enters with two +1/+1 counters; {X}, {T} sets them to X", () => {
    const { s: s0, ap, ids } = setup([anthroplasm()]);
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(pt(s, ids[0]!)).toBe("2/2");
    s.objects[ids[0]!]!.controlledSinceTurn = -1;
    s = run(s, planActivate(s, ap, ids[0]!, 0, [], undefined, undefined, 5));
    s = settle(s);
    expect([pt(s, ids[0]!), counters(s, ids[0]!)]).toEqual(["5/5", 5]);
  });

  it("Rock Jockey: can't be cast after you've played a land; after it's cast you can't play lands", () => {
    const { s: s0, ap, ids } = setup([rockJockey(), hiddenNursery()]);
    s0.players[ap]!.landsPlayedThisTurn = 0;
    let s = settle(castNow(s0, ap, ids[0]!));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(() => act(s, { type: "playLand", player: ap, objectId: ids[1]! })).toThrow();
    // Played a land first: no casting it.
    const { s: s1, ap: ap1, ids: ids1 } = setup([rockJockey(), hiddenNursery()]);
    s1.players[ap1]!.landsPlayedThisTurn = 0;
    s = act(s1, { type: "playLand", player: ap1, objectId: ids1[1]! });
    expect(planCast(s, ap1, ids1[0]!)).toBeNull();
  });

  it("Rock Jockey: one that was put onto the battlefield without being cast doesn't stop land plays", () => {
    const { s: s0, ap, ids } = setup([hiddenNursery()]);
    s0.players[ap]!.landsPlayedThisTurn = 0;
    const r = putOnBattlefield(s0, ap, rockJockey());
    s0.objects[r]!.enteredTurn = s0.turn;
    const s = act(s0, { type: "playLand", player: ap, objectId: ids[0]! });
    expect(zone(s, ids[0]!)).toBe("battlefield");
  });

  it("Juju Bubble: sacrificed when you cast a spell or play a land", () => {
    for (const how of ["spell", "land"] as const) {
      const { s: s0, ap, ids } = setup([quickStudy(), hiddenNursery()]);
      s0.players[ap]!.landsPlayedThisTurn = 0;
      const bubble = putOnBattlefield(s0, ap, jujuBubble());
      let s = how === "spell" ? castNow(s0, ap, ids[0]!) : act(s0, { type: "playLand", player: ap, objectId: ids[1]! });
      s = settle(s);
      expect(zone(s, bubble), how).toBe("graveyard");
    }
  });

  it("Coral Fighters: unblocked, looks at the top card of the defending player's library and may put it on the bottom", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, coralFighters());
    const top = toZone(s0, opp, greenBear(), "library");
    let s = attackWith(s0, [f], opp);
    s = toBlocks(s);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [] });
    s = settle(s, (x) => x.pending?.kind === "arrangeTop");
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap, cards: [top] });
    s = act(s, { type: "arrangeTop", player: ap, top: [], away: [top] });
    expect(s.players[opp]!.library.at(-1)).toBe(top);
  });
});

describe("Bots", () => {
  /** `ap` as a bot with only `keep` in hand and its land played; the actions it takes now. */
  const botTurn = (s: GameState, ap: PlayerId, keep: string[]) => {
    onlyHand(s, ap, keep);
    s.players[ap]!.isBot = true;
    s.players[ap]!.landsPlayedThisTurn = 1;
    return botActions(s, ap);
  };

  it("a bot reveals a Dragon card for Draconic Roar", () => {
    const bigDragon = () => creature("Test Dragon", "Creature — Dragon", "{R}{R}{R}{R}", 5, 5, { cmc: 4, colors: ["R"], keywords: ["Flying"], oracleText: "Flying" });
    const { s: s0, ap, ids, opp } = setup([draconicRoar(), bigDragon()]);
    const giant = putOnBattlefield(s0, opp, hillGiant());
    s0.players[ap]!.command = [];
    const plan = botTurn(s0, ap, ids);
    expect(plan.find((a) => a.type === "castSpell")).toMatchObject({ objectId: ids[0], kicks: [0], reveal: [ids[1]] });
    const s = settle(plan.reduce((x, a) => act(x, a), s0));
    expect([zone(s, giant), life(s, opp)]).toEqual(["graveyard", 37]);
  });

  it("a bot puts Brand of Ill Omen on an opponent's creature and takes an opponent's artifact with Metallic Mastery", () => {
    for (const which of ["brand", "mastery"] as const) {
      const { s: s0, ap, ids, opp } = setup([which === "brand" ? brandOfIllOmen() : metallicMastery()]);
      putOnBattlefield(s0, ap, which === "brand" ? hillGiant() : golem());
      const theirs = putOnBattlefield(s0, opp, which === "brand" ? hillGiant() : golem());
      const plan = botTurn(s0, ap, ids);
      const c = plan.find((a) => a.type === "castSpell");
      expect(c, which).toMatchObject({ objectId: ids[0], targets: [tgt(theirs)] });
    }
  });
});
