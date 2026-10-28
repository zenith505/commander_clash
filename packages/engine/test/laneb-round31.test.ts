// Lane B, round 31: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, island, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, parseManaCost, planActivate, planCast, planMana, planTurnFaceUp, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

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
/** Answers a "may pay" question: pays the mana (if any) and says yes, or says no. */
const answer = (s: GameState, yes: boolean) => {
  const p = s.pending;
  if (p?.kind !== "chooseMay") throw new Error(`not a may: ${p?.kind}`);
  return run(s, [...(yes && p.pay?.mana ? planMana(s, p.player, parseManaCost(p.pay.mana))! : []), { type: "chooseMay", player: p.player, yes }]);
};
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
/** Puts an Aura `def` onto the battlefield under `pid`, attached to `host`. */
const attach = (s: GameState, pid: PlayerId, def: CardDef, host: string) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = host;
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
const hasLog = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));

// Real oracle text (Scryfall).
const mtendaLion = () => card("Mtenda Lion", "Creature — Cat", "{G}", { cmc: 1, colors: ["G"], power: "2", toughness: "1", oracleText: "Whenever this creature attacks, defending player may pay {U}. If that player does, prevent all combat damage that would be dealt by this creature this turn." });
const shroudedSerpent = () => card("Shrouded Serpent", "Creature — Serpent", "{4}{U}{U}{U}", { cmc: 7, colors: ["U"], power: "4", toughness: "4", oracleText: "Whenever this creature attacks, defending player may pay {4}. If that player doesn't, this creature can't be blocked this turn." });
const mindWhip = () => card("Mind Whip", "Enchantment — Aura", "{2}{B}{B}", { cmc: 4, colors: ["B"], keywords: ["Enchant"], oracleText: "Enchant creature\nAt the beginning of the upkeep of enchanted creature's controller, that player may pay {3}. If they don't, this Aura deals 2 damage to that player and you tap that creature." });
const telekinesis = () => card("Telekinesis", "Instant", "{U}{U}", { cmc: 2, colors: ["U"], oracleText: "Tap target creature. Prevent all combat damage that would be dealt by that creature this turn. It doesn't untap during its controller's next two untap steps." });
const bakisCurse = () => card("Baki's Curse", "Sorcery", "{2}{U}{U}", { cmc: 4, colors: ["U"], oracleText: "Baki's Curse deals 2 damage to each creature for each Aura attached to that creature." });
const tropicalStorm = () => card("Tropical Storm", "Sorcery", "{X}{G}", { cmc: 1, colors: ["G"], oracleText: "Tropical Storm deals X damage to each creature with flying and 1 additional damage to each blue creature." });
const nissasDefeat = () => card("Nissa's Defeat", "Sorcery", "{2}{G}", { cmc: 3, colors: ["G"], oracleText: "Destroy target Forest, green enchantment, or green planeswalker. If that permanent was a Nissa planeswalker, draw a card." });
const chandrasDefeat = () => card("Chandra's Defeat", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Chandra's Defeat deals 5 damage to target red creature or red planeswalker. If that permanent is a Chandra planeswalker, you may discard a card. If you do, draw a card." });
const talarasBane = () => card("Talara's Bane", "Sorcery", "{1}{B}", { cmc: 2, colors: ["B"], oracleText: "Target opponent reveals their hand. You choose a green or white creature card from it. You gain life equal to that creature card's toughness, then that player discards that card." });
const nulltread = () => card("Nulltread Gargantuan", "Creature — Beast", "{1}{G}{U}", { cmc: 3, colors: ["G", "U"], power: "5", toughness: "6", oracleText: "When this creature enters, put a creature you control on top of its owner's library." });
const foldIntoAether = () => card("Fold into Aether", "Instant", "{2}{U}{U}", { cmc: 4, colors: ["U"], oracleText: "Counter target spell. If that spell is countered this way, its controller may put a creature card from their hand onto the battlefield." });
const painbringer = () => card("Painbringer", "Creature — Human Minion", "{2}{B}{B}", { cmc: 4, colors: ["B"], power: "1", toughness: "1", oracleText: "{T}, Exile any number of cards from your graveyard: Target creature gets -X/-X until end of turn, where X is the number of cards exiled this way." });
const waywardAngel = () => card("Wayward Angel", "Creature — Angel Horror", "{4}{W}{W}", { cmc: 6, colors: ["W"], power: "4", toughness: "4", keywords: ["Flying", "Vigilance", "Threshold"], oracleText: "Flying, vigilance\nThreshold — As long as there are seven or more cards in your graveyard, this creature gets +3/+3, is black, has trample, and has \"At the beginning of your upkeep, sacrifice a creature.\"" });
const repentantVampire = () => card("Repentant Vampire", "Creature — Vampire", "{3}{B}{B}", { cmc: 5, colors: ["B"], power: "3", toughness: "3", keywords: ["Flying", "Threshold"], oracleText: "Flying\nWhenever a creature dealt damage by this creature this turn dies, put a +1/+1 counter on this creature.\nThreshold — As long as there are seven or more cards in your graveyard, this creature is white and has \"{T}: Destroy target black creature.\"" });
const scabClanGiant = () => card("Scab-Clan Giant", "Creature — Giant Warrior", "{4}{R}{G}", { cmc: 6, colors: ["G", "R"], power: "4", toughness: "5", keywords: ["Fight"], oracleText: "When this creature enters, it fights target creature an opponent controls chosen at random." });
const knightRampager = () => card("Knight Rampager", "Artifact Creature — Knight", "{4}{R}", { cmc: 5, colors: ["R"], power: "6", toughness: "5", keywords: ["Trample", "Frenzied Rampage"], oracleText: "Trample\nFrenzied Rampage — At the beginning of combat on your turn, choose an opponent at random. This creature attacks that player this combat if able.\nWhen this creature dies, it deals 4 damage to target opponent chosen at random." });
const witchHunt = () => card("Witch Hunt", "Enchantment", "{4}{R}", { cmc: 5, colors: ["R"], oracleText: "Players can't gain life.\nAt the beginning of your upkeep, this enchantment deals 4 damage to you.\nAt the beginning of your end step, target opponent chosen at random gains control of this enchantment." });
const infernalCaretaker = () => card("Infernal Caretaker", "Creature — Human Cleric", "{3}{B}", { cmc: 4, colors: ["B"], power: "2", toughness: "2", keywords: ["Morph"], oracleText: "Morph {3}{B} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)\nWhen this creature is turned face up, return all Zombie cards from all graveyards to their owners' hands." });
const durkwoodTracker = () => card("Durkwood Tracker", "Creature — Giant", "{4}{G}", { cmc: 5, colors: ["G"], power: "4", toughness: "3", oracleText: "{1}{G}, {T}: If this creature is on the battlefield, it deals damage equal to its power to target attacking creature. That creature deals damage equal to its power to this creature." });

const creature = (name: string, typeLine: string, manaCost: string, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, manaCost, { power: String(p), toughness: String(t), ...extra });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2, { cmc: 2, colors: ["G"] });
const redOgre = () => creature("Red Ogre", "Creature — Ogre", "{2}{R}", 3, 3, { cmc: 3, colors: ["R"] });
const bigRedBeast = () => creature("Big Red Beast", "Creature — Beast", "{4}{R}", 4, 6, { cmc: 5, colors: ["R"] });
const blackRat = () => creature("Black Rat", "Creature — Rat", "{B}", 1, 1, { cmc: 1, colors: ["B"] });
const grayZombie = () => creature("Gray Zombie", "Creature — Zombie", "{1}{B}", 2, 2, { cmc: 2, colors: ["B"] });
const whiteWall = () => creature("White Wall", "Creature — Wall", "{1}{W}", 0, 5, { cmc: 2, colors: ["W"] });
const bird = () => creature("Gray Bird", "Artifact Creature — Bird", "{2}", 1, 3, { cmc: 2, keywords: ["Flying"], oracleText: "Flying" });
const blueBird = () => creature("Blue Bird", "Creature — Bird", "{1}{U}", 1, 5, { cmc: 2, colors: ["U"], keywords: ["Flying"], oracleText: "Flying" });
const blueWall = () => creature("Blue Wall", "Creature — Wall", "{1}{U}", 0, 4, { cmc: 2, colors: ["U"] });
const holyStrength = () => card("Holy Strength", "Enchantment — Aura", "{W}", { cmc: 1, colors: ["W"], keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets +1/+2." });
const nissa = () => card("Nissa, Test Walker", "Legendary Planeswalker — Nissa", "{3}{G}", { cmc: 4, colors: ["G"], loyalty: "3" });
const greenWalker = () => card("Garruk, Test Walker", "Legendary Planeswalker — Garruk", "{3}{G}", { cmc: 4, colors: ["G"], loyalty: "3" });
const chandra = () => card("Chandra, Test Walker", "Legendary Planeswalker — Chandra", "{3}{R}", { cmc: 4, colors: ["R"], loyalty: "4" });
const forestCard = () => card("Forest", "Basic Land — Forest");
const giantGrowth = () => card("Giant Growth", "Instant", "{G}", { cmc: 1, colors: ["G"], oracleText: "Target creature gets +3/+3 until end of turn." });
const divination = () => card("Divination", "Sorcery", "{2}{U}", { cmc: 3, colors: ["U"], oracleText: "Draw two cards." });

describe("Lane B round 31", () => {
  it("compiles every card fully", () => {
    supported(mtendaLion(), shroudedSerpent(), mindWhip(), telekinesis(), bakisCurse(), tropicalStorm(), nissasDefeat(), chandrasDefeat(), talarasBane(), nulltread());
    supported(foldIntoAether(), painbringer(), waywardAngel(), repentantVampire(), scabClanGiant(), knightRampager(), witchHunt(), infernalCaretaker(), durkwoodTracker());
  });
});

describe("Defending player may pay: if that player does / doesn't", () => {
  it("Mtenda Lion: paying {U} prevents its combat damage; declining doesn't", () => {
    for (const pay of [true, false]) {
      const { s: s0, ap, opp } = setup([]);
      const lion = putOnBattlefield(s0, ap, mtendaLion());
      putOnBattlefield(s0, opp, island);
      let s = attackWith(s0, [lion], opp);
      expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp, pay: { mana: "{U}" } });
      s = settle(passUntil(settle(answer(s, pay)), "main2"));
      expect(life(s, opp)).toBe(pay ? 40 : 38);
    }
  });

  it("Mtenda Lion: a bot defending pays when it can", () => {
    const { s: s0, ap, opp } = setup([]);
    const lion = putOnBattlefield(s0, ap, mtendaLion());
    putOnBattlefield(s0, opp, island);
    s0.players[opp]!.isBot = true;
    const s = attackWith(s0, [lion], opp);
    expect(botActions(s, opp).some((a) => a.type === "chooseMay" && a.yes)).toBe(true);
  });

  it("Shrouded Serpent: unpaid, it can't be blocked; paid {4}, it can", () => {
    for (const pay of [false, true]) {
      const { s: s0, ap, opp } = setup([]);
      const serpent = putOnBattlefield(s0, ap, shroudedSerpent());
      const wall = putOnBattlefield(s0, opp, whiteWall());
      for (let i = 0; i < 4; i++) putOnBattlefield(s0, opp, island);
      let s = attackWith(s0, [serpent], opp);
      expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp, pay: { mana: "{4}" } });
      s = settle(answer(s, pay));
      if (pay) {
        s = blockWith(s, [[wall, serpent]]);
        expect(s.objects[serpent]!.blockedBy).toContain(wall);
      } else expect(() => blockWith(s, [[wall, serpent]])).toThrow();
    }
  });

  it("Shrouded Serpent: a bot with a creature to block pays; with none, it doesn't", () => {
    for (const blocker of [true, false]) {
      const { s: s0, ap, opp } = setup([]);
      const serpent = putOnBattlefield(s0, ap, shroudedSerpent());
      if (blocker) putOnBattlefield(s0, opp, whiteWall());
      for (let i = 0; i < 4; i++) putOnBattlefield(s0, opp, island);
      s0.players[opp]!.isBot = true;
      const s = attackWith(s0, [serpent], opp);
      expect(botActions(s, opp).some((a) => a.type === "chooseMay" && a.yes)).toBe(blocker);
    }
  });

  it("Mind Whip: at the enchanted creature's controller's upkeep, unpaid: 2 damage to them and the creature is tapped; paid: nothing", () => {
    for (const pay of [false, true]) {
      const { s: s0, ap, opp } = setup([]);
      const bear = putOnBattlefield(s0, opp, greenBear());
      attach(s0, ap, mindWhip(), bear);
      for (let i = 0; i < 3; i++) putOnBattlefield(s0, opp, island);
      let s = passUntil(s0, "upkeep", opp);
      s = settle(s, at("chooseMay", opp));
      expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp, pay: { mana: "{3}" } });
      s = settle(answer(s, pay));
      expect([life(s, opp), s.objects[bear]!.tapped ?? false]).toEqual(pay ? [40, false] : [38, true]);
    }
  });
});

describe("One-off effects", () => {
  it("Telekinesis: taps the creature, prevents its combat damage, and it stays tapped through its controller's next two untap steps", () => {
    const { s: s0, ap, ids, opp } = setup([telekinesis()]);
    const ogre = putOnBattlefield(s0, opp, redOgre());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(ogre)]));
    expect(s.objects[ogre]!.tapped).toBe(true);
    s = passUntil(s, "upkeep", opp);
    expect(s.objects[ogre]!.tapped).toBe(true);
    s = passUntil(passUntil(s, "end", opp), "upkeep", opp);
    expect(s.objects[ogre]!.tapped).toBe(true);
    s = passUntil(passUntil(s, "end", opp), "upkeep", opp);
    expect(s.objects[ogre]!.tapped).toBeFalsy();
  });

  it("Telekinesis: an untapped attacker deals no combat damage this turn", () => {
    const { s: s0, ap, ids, opp } = setup([telekinesis()]);
    const ogre = putOnBattlefield(s0, ap, redOgre());
    let s = attackWith(s0, [ogre], opp);
    s = settle(s);
    s = settle(castNow(s, ap, ids[0]!, [tgt(ogre)]));
    s = settle(passUntil(s, "main2"));
    expect(life(s, opp)).toBe(40);
  });

  it("Baki's Curse: 2 damage for each Aura on each creature (any controller's Auras); none, no damage", () => {
    const { s: s0, ap, ids, opp } = setup([bakisCurse()]);
    const wall = putOnBattlefield(s0, opp, whiteWall());
    attach(s0, opp, holyStrength(), wall);
    attach(s0, ap, mindWhip(), wall);
    const bear = putOnBattlefield(s0, ap, greenBear());
    attach(s0, ap, holyStrength(), bear);
    const plain = putOnBattlefield(s0, opp, greenBear());
    const s = settle(castNow(s0, ap, ids[0]!));
    // White Wall is 1/7 with Holy Strength: 4 damage leaves it alive; the 3/4 bear takes 2.
    expect([s.objects[wall]!.damage, s.objects[bear]!.damage, s.objects[plain]!.damage ?? 0]).toEqual([4, 2, 0]);
  });

  it("Tropical Storm: X to each flier, 1 more to each blue creature (a blue flier takes X+1)", () => {
    const { s: s0, ap, ids, opp } = setup([tropicalStorm()]);
    const gray = putOnBattlefield(s0, opp, bird());
    const blue = putOnBattlefield(s0, opp, blueBird());
    const wall = putOnBattlefield(s0, opp, blueWall());
    const bear = putOnBattlefield(s0, opp, greenBear());
    const s = settle(castNow(s0, ap, ids[0]!, [], 2));
    expect([s.objects[gray]!.damage, s.objects[blue]!.damage, s.objects[wall]!.damage, s.objects[bear]!.damage ?? 0]).toEqual([2, 3, 1, 0]);
  });

  it("Nissa's Defeat: a Forest is destroyed (no card); a Nissa planeswalker is destroyed and you draw; another green planeswalker, no draw", () => {
    const { s: s0, ap, ids, opp } = setup([nissasDefeat(), nissasDefeat(), nissasDefeat()]);
    const forest = putOnBattlefield(s0, opp, forestCard());
    const n = putOnBattlefield(s0, opp, nissa());
    const g = putOnBattlefield(s0, opp, greenWalker());
    s0.objects[n]!.counters.loyalty = 3;
    s0.objects[g]!.counters.loyalty = 3;
    const bear = putOnBattlefield(s0, opp, greenBear());
    expect(planCast(s0, ap, ids[0]!, [tgt(bear)])).toBeNull();
    let s = s0;
    const hand0 = s.players[ap]!.hand.length;
    s = settle(castNow(s, ap, ids[0]!, [tgt(forest)]));
    expect([zone(s, forest), s.players[ap]!.hand.length]).toEqual(["graveyard", hand0 - 1]);
    s = settle(castNow(s, ap, ids[1]!, [tgt(n)]));
    expect([zone(s, n), s.players[ap]!.hand.length]).toEqual(["graveyard", hand0 - 1]);
    s = settle(castNow(s, ap, ids[2]!, [tgt(g)]));
    expect([zone(s, g), s.players[ap]!.hand.length]).toEqual(["graveyard", hand0 - 2]);
  });

  it("Chandra's Defeat: 5 damage to a red creature; to a Chandra, you may discard a card to draw one", () => {
    const { s: s0, ap, ids, opp } = setup([chandrasDefeat(), chandrasDefeat(), giantGrowth()]);
    const beast = putOnBattlefield(s0, opp, bigRedBeast());
    const ch = putOnBattlefield(s0, opp, chandra());
    s0.objects[ch]!.counters.loyalty = 4;
    expect(planCast(s0, ap, ids[0]!, [tgt(putOnBattlefield(s0, opp, greenBear()))])).toBeNull();
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(beast)]), at("chooseMay", ap));
    expect([s.objects[beast]!.damage, s.pending]).toEqual([5, null]);
    // Only Giant Growth is left to discard.
    for (const id of s.players[ap]!.hand.filter((x) => x !== ids[1] && x !== ids[2])) s.objects[id]!.zone = "exile";
    s.players[ap]!.hand = [ids[1]!, ids[2]!];
    s = settle(castNow(s, ap, ids[1]!, [tgt(ch)]), at("chooseMay", ap));
    // Still on the battlefield until state-based actions, after the spell resolves (CR 704.3).
    expect([zone(s, ch), s.objects[ch]!.counters.loyalty ?? 0, s.pending?.kind]).toEqual(["battlefield", 0, "chooseMay"]);
    const lib = s.players[ap]!.library[0]!;
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), (x) => !!x.pending && x.pending.kind !== "chooseMay");
    if (s.pending) s = run(s, botActions(s, ap));
    s = settle(s);
    expect([zone(s, ids[2]!), zone(s, lib), zone(s, ch)]).toEqual(["graveyard", "hand", "graveyard"]);
  });

  it("Talara's Bane: you gain life equal to the chosen green or white creature card's toughness, then they discard it", () => {
    const { s: s0, ap, ids, opp } = setup([talarasBane()]);
    const wall = toZone(s0, opp, whiteWall(), "hand");
    const ogre = toZone(s0, opp, redOgre(), "hand");
    let s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]), at("searchLibrary", ap));
    expect(s.pending?.kind === "searchLibrary" && s.pending.cards).toContain(wall);
    expect(s.pending?.kind === "searchLibrary" && s.pending.cards).not.toContain(ogre);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [wall] }));
    expect([zone(s, wall), zone(s, ogre), life(s, ap)]).toEqual(["graveyard", "hand", 45]);
  });

  it("Nulltread Gargantuan: put a creature you control on top of its owner's library; it may be itself", () => {
    const { s: s0, ap, ids } = setup([nulltread(), nulltread()]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    let s = settle(castNow(s0, ap, ids[0]!), at("pickPermanents", ap));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "libraryTop", count: 1 });
    expect(s.pending?.kind === "pickPermanents" && [...s.pending.options].sort()).toEqual([bear, ids[0]!].sort());
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [bear] }));
    expect([zone(s, bear), s.players[ap]!.library[0]]).toEqual(["library", bear]);
    // The only creature: itself.
    s = settle(castNow(s, ap, ids[1]!), at("pickPermanents", ap));
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [ids[1]!] }));
    expect([zone(s, ids[1]!), s.players[ap]!.library[0]]).toEqual(["library", ids[1]]);
  });

  it("Fold into Aether: the countered spell's controller may put a creature card from their hand onto the battlefield", () => {
    const { s: s0, ap, ids, opp } = setup([foldIntoAether()]);
    const div = toZone(s0, opp, divination(), "hand");
    const ogre = toZone(s0, opp, redOgre(), "hand");
    let s = passUntil(s0, "main1", opp);
    s.players[opp]!.manaPool.U = 3;
    s = run(s, planCast(s, opp, div));
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const item = s.stack[s.stack.length - 1]!;
    s = settle(castNow(s, ap, ids[0]!, [{ kind: "stack", id: item.id }]), (x) => x.pending?.player === opp);
    expect(zone(s, div)).toBe("graveyard");
    expect(s.pending).toBeTruthy();
    s = settle(s);
    expect(zone(s, ogre)).toBe("battlefield");
    expect(s.objects[ogre]!.controller).toBe(opp);
  });

  it("Painbringer: exile any number of cards from your graveyard; the target gets -X/-X for the number exiled", () => {
    const { s: s0, ap, opp } = setup([]);
    const pb = putOnBattlefield(s0, ap, painbringer());
    const yard = [0, 1, 2].map(() => toZone(s0, ap, giantGrowth(), "graveyard"));
    const beast = putOnBattlefield(s0, opp, bigRedBeast());
    let s = run(s0, planActivate(s0, ap, pb, 0, [tgt(beast)], undefined, undefined, 3, { exileCards: yard }));
    expect(yard.map((id) => zone(s, id))).toEqual(["exile", "exile", "exile"]);
    s = settle(s);
    expect(pt(s, beast)).toBe("1/3");
  });

  it("Painbringer: zero cards exiled is allowed, for -0/-0", () => {
    const { s: s0, ap, opp } = setup([]);
    const pb = putOnBattlefield(s0, ap, painbringer());
    const beast = putOnBattlefield(s0, opp, bigRedBeast());
    const s = settle(run(s0, planActivate(s0, ap, pb, 0, [tgt(beast)], undefined, undefined, 0, { exileCards: [] })));
    expect([pt(s, beast), s.objects[pb]!.tapped]).toEqual(["4/6", true]);
  });
});

describe("Threshold: is a color and has an ability (CR 613.1e, 613.1f)", () => {
  it("Wayward Angel: with seven cards in your graveyard it's a 7/7 black flier with trample and the upkeep sacrifice", () => {
    const { s: s0, ap } = setup([]);
    const angel = putOnBattlefield(s0, ap, waywardAngel());
    expect([pt(s0, angel), characteristics(s0, s0.objects[angel]!).colors]).toEqual(["4/4", ["W"]]);
    for (let i = 0; i < 7; i++) toZone(s0, ap, giantGrowth(), "graveyard");
    const c = characteristics(s0, s0.objects[angel]!);
    expect([pt(s0, angel), c.colors, objHasKeyword(s0, s0.objects[angel]!, "Trample"), objHasKeyword(s0, s0.objects[angel]!, "Vigilance")]).toEqual(["7/7", ["B"], true, true]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    let s = passUntil(passUntil(s0, "end", ap), "upkeep", ap);
    s = settle(s);
    // It sacrifices a creature (the bot answer picks one of the two).
    expect([zone(s, bear), zone(s, angel)].filter((z) => z === "graveyard")).toHaveLength(1);
  });

  it("Repentant Vampire: with threshold it's white and taps to destroy a black creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const vamp = putOnBattlefield(s0, ap, repentantVampire());
    const rat = putOnBattlefield(s0, opp, blackRat());
    const bear = putOnBattlefield(s0, opp, greenBear());
    expect(planActivate(s0, ap, vamp, 0, [tgt(rat)])).toBeNull();
    for (let i = 0; i < 7; i++) toZone(s0, ap, giantGrowth(), "graveyard");
    expect(characteristics(s0, s0.objects[vamp]!).colors).toEqual(["W"]);
    expect(planActivate(s0, ap, vamp, 0, [tgt(bear)])).toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, vamp, 0, [tgt(rat)])));
    expect(zone(s, rat)).toBe("graveyard");
  });
});

describe("Targets chosen at random (rulings: chosen as the ability is put on the stack)", () => {
  it("Scab-Clan Giant: fights a random creature an opponent controls, never one of yours", () => {
    const seen = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { s: s0, ap, ids, opp } = setup([scabClanGiant()], seed);
      putOnBattlefield(s0, ap, greenBear());
      const a = putOnBattlefield(s0, opp, blackRat());
      const b = putOnBattlefield(s0, s0.turnOrder[(s0.turnOrder.indexOf(opp) + 1) % 4]!, grayZombie());
      const s = settle(castNow(s0, ap, ids[0]!));
      const died = [a, b].filter((id) => zone(s, id) === "graveyard");
      expect(died).toHaveLength(1);
      seen.add(died[0] === a ? "a" : "b");
      expect(hasLog(s, /chosen at random/)).toBe(true);
    }
    expect(seen.size).toBe(2);
  });

  it("Scab-Clan Giant: with no creature an opponent controls, the ability is removed (CR 603.3d)", () => {
    const { s: s0, ap, ids } = setup([scabClanGiant()]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    const s = settle(castNow(s0, ap, ids[0]!));
    expect([zone(s, ids[0]!), zone(s, bear), s.objects[ids[0]!]!.damage ?? 0]).toEqual(["battlefield", "battlefield", 0]);
  });

  it("Knight Rampager: when it dies, 4 damage to a random opponent", () => {
    const { s: s0, ap, opp } = setup([]);
    const knight = putOnBattlefield(s0, ap, knightRampager());
    const wrath = card("Test Wrath", "Sorcery", "{1}", { cmc: 1, oracleText: "Destroy all creatures." });
    const w = toZone(s0, ap, wrath, "hand");
    const s = settle(castNow(s0, ap, w));
    expect(zone(s, knight)).toBe("graveyard");
    const lives = s.turnOrder.filter((p) => p !== ap).map((p) => life(s, p));
    expect(lives.sort()).toEqual([36, 40, 40]);
    expect(life(s, ap)).toBe(40);
    expect(opp).toBeDefined();
  });

  it("Witch Hunt: players can't gain life; at your end step a random opponent gains control of it", () => {
    const { s: s0, ap } = setup([]);
    const hunt = putOnBattlefield(s0, ap, witchHunt());
    const s = settle(passUntil(s0, "cleanup", ap));
    const ctl = controllerOf(s, s.objects[hunt]!);
    expect(ctl).not.toBe(ap);
    // Its upkeep trigger now hurts its new controller.
    const t = settle(passUntil(s, "draw", ctl));
    expect(life(t, ctl)).toBe(36);
  });
});

describe("Other templates", () => {
  it("Infernal Caretaker: turned face up, every Zombie card in every graveyard returns to its owner's hand", () => {
    const { s: s0, ap, opp } = setup([]);
    const id = toZone(s0, ap, infernalCaretaker(), "hand");
    let s = settle(run(s0, planCast(s0, ap, id, undefined, undefined, "auto", undefined, { faceDown: true })));
    const mine = toZone(s, ap, grayZombie(), "graveyard");
    const theirs = toZone(s, opp, grayZombie(), "graveyard");
    const rat = toZone(s, opp, blackRat(), "graveyard");
    s = settle(run(s, planTurnFaceUp(s, ap, id)));
    expect([zone(s, mine), zone(s, theirs), zone(s, rat)]).toEqual(["hand", "hand", "graveyard"]);
    expect(s.players[opp]!.hand).toContain(theirs);
  });

  it("Durkwood Tracker: deals its power to an attacking creature, which deals its power back", () => {
    const { s: s0, ap, opp } = setup([]);
    s0.players[opp]!.isBot = true;
    const ogre = putOnBattlefield(s0, opp, greenBear());
    // On the opponent's turn, a 2/2 attacks you; the 4/3 Tracker bites it and survives.
    let s = passUntil(s0, "main1", opp);
    const tracker = putOnBattlefield(s, ap, durkwoodTracker());
    for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: ogre, defender: ap }] });
    for (let i = 0; i < 50 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(run(s, planActivate(s, ap, tracker, 0, [tgt(ogre)])));
    expect([zone(s, ogre), s.objects[tracker]!.damage]).toEqual(["graveyard", 2]);
  });

  it("Durkwood Tracker: only an attacking creature can be targeted", () => {
    const { s: s0, ap, opp } = setup([]);
    const tracker = putOnBattlefield(s0, ap, durkwoodTracker());
    const ogre = putOnBattlefield(s0, opp, redOgre());
    expect(planActivate(s0, ap, tracker, 0, [tgt(ogre)])).toBeNull();
  });
});
