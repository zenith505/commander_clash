// Lane B, round 28: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup, swamp } from "./helpers";
import { botActions, potentialAttackers, castProblem, invalidateCharacteristics, isFullySupported, objHasKeyword, parseManaCost, planMana, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

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
    if (p?.kind === "discard" || p?.kind === "declareAttackers" || p?.kind === "declareBlockers") break;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Stops at a decision of this kind for `pid`. */
const at = (kind: string, pid: PlayerId) => (s: GameState) => s.pending?.kind === kind && s.pending.player === pid;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const creature = (name: string, typeLine: string, manaCost: string, p: number, t: number, extra: Partial<CardDef> = {}) =>
  card(name, typeLine, manaCost, { power: String(p), toughness: String(t), ...extra });
const bigBeast = () => creature("Big Beast", "Creature — Beast", "{3}{G}", 4, 5, { cmc: 4 });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2, { cmc: 2 });
const whiteKnight = () => creature("White Knight", "Creature — Human Knight", "{1}{W}", 2, 2, { cmc: 2 });
const blueDrake = () => creature("Blue Drake", "Creature — Drake", "{2}{U}{U}", 2, 3, { cmc: 4, colors: ["U"] });
const whiteCharm = () => card("White Charm", "Instant", "{W}", { cmc: 1, oracleText: "You gain 1 life." });
const shock = () => card("Shock", "Instant", "{R}", { cmc: 1, oracleText: "Shock deals 2 damage to any target." });
const ironRing = () => card("Iron Ring", "Artifact", "{3}", { cmc: 3 });
const murder = () => card("Murder", "Instant", "{1}{B}{B}", { cmc: 3, oracleText: "Destroy target creature." });
const giantGrowth = () => card("Giant Growth", "Instant", "{G}", { cmc: 1, oracleText: "Target creature gets +3/+3 until end of turn." });
const goodOmen = () => card("Good Omen", "Enchantment", "{1}{W}", { cmc: 2 });
/** Moves a new card for `def` into `pid`'s hand, graveyard or library (on top). */
const into = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" | "library" = "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const pool = (s: GameState, pid: PlayerId, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  s.players[pid]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...mana };
};
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}) => run(s, planCast(s, pid, id, targets, undefined, "auto", undefined, choices));
const activateNow = (s: GameState, pid: PlayerId, id: string, index: number, targets: TargetChoice[] = [], x?: number, costs?: CostChoices) => run(s, planActivate(s, pid, id, index, targets, undefined, undefined, x, costs));
/** Passes priority (empty stack) until `pid` has it. */
const priorityTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 8 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Passes to the declare attackers step of the active player's turn and declares `attackers` at `defender`. */
const attackWith = (s: GameState, attackers: string[], defender: PlayerId) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return settle(act(s, { type: "declareAttackers", player: s.activePlayer, attacks: attackers.map((attacker) => ({ attacker, defender })) }));
};
/** Passes through combat damage (no blocks). */
const throughDamage = (s: GameState) => {
  for (let i = 0; i < 80 && s.step !== "main2"; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const mine = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === name);
/** Taps every land `pid` controls, so only the mana pool pays. */
const tapLands = (s: GameState, pid: PlayerId) => {
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.typeLine.includes("Land")) s.objects[id]!.tapped = true;
};
const handOf = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.length;

// Real oracle text (Scryfall).
const blademaneBaku = card("Blademane Baku", "Creature — Spirit", "{1}{R}", {"cmc":2,"power":"1","toughness":"1","oracleText":"Whenever you cast a Spirit or Arcane spell, you may put a ki counter on this creature.\n{1}, Remove X ki counters from this creature: For each counter removed, this creature gets +2/+0 until end of turn.","colors":["R"],"colorIdentity":["R"]});
const quillmaneBaku = card("Quillmane Baku", "Creature — Spirit", "{4}{U}", {"cmc":5,"power":"3","toughness":"3","oracleText":"Whenever you cast a Spirit or Arcane spell, you may put a ki counter on this creature.\n{1}, {T}, Remove X ki counters from this creature: Return target creature with mana value X or less to its owner's hand.","colors":["U"],"colorIdentity":["U"]});
const skullmaneBaku = card("Skullmane Baku", "Creature — Spirit", "{3}{B}{B}", {"cmc":5,"power":"2","toughness":"1","oracleText":"Whenever you cast a Spirit or Arcane spell, you may put a ki counter on this creature.\n{1}, {T}, Remove X ki counters from this creature: Target creature gets -X/-X until end of turn.","colors":["B"],"colorIdentity":["B"]});
const waxmaneBaku = card("Waxmane Baku", "Creature — Spirit", "{2}{W}", {"cmc":3,"power":"2","toughness":"2","oracleText":"Whenever you cast a Spirit or Arcane spell, you may put a ki counter on this creature.\n{1}, Remove X ki counters from this creature: Tap X target creatures.","colors":["W"],"colorIdentity":["W"]});
const infusedArrows = card("Infused Arrows", "Artifact", "{4}", {"cmc":4,"oracleText":"Sunburst (This artifact enters with a charge counter on it for each color of mana spent to cast it.)\n{T}, Remove X charge counters from this artifact: Target creature gets -X/-X until end of turn.","colors":[],"colorIdentity":[],"keywords":["Sunburst"]});
const mercadianLift = card("Mercadian Lift", "Artifact", "{2}", {"cmc":2,"oracleText":"{1}, {T}: Put a winch counter on this artifact.\n{T}, Remove X winch counters from this artifact: You may put a creature card with mana value X from your hand onto the battlefield.","colors":[],"colorIdentity":[]});
const talonOfPain = card("Talon of Pain", "Artifact", "{4}", {"cmc":4,"oracleText":"Whenever a source you control other than this artifact deals damage to an opponent, put a charge counter on this artifact.\n{X}, {T}, Remove X charge counters from this artifact: It deals X damage to any target.","colors":[],"colorIdentity":[]});
const nightDealings = card("Night Dealings", "Enchantment", "{2}{B}{B}", {"cmc":4,"oracleText":"Whenever a source you control deals damage to another player, put that many theft counters on this enchantment.\n{2}{B}{B}, Remove X theft counters from this enchantment: Search your library for a nonland card with mana value X, reveal it, put it into your hand, then shuffle.","colors":["B"],"colorIdentity":["B"]});
const arcboundJavelineer = card("Arcbound Javelineer", "Artifact Creature — Soldier", "{W}", {"cmc":1,"power":"0","toughness":"1","oracleText":"{T}, Remove X +1/+1 counters from this creature: It deals X damage to target attacking or blocking creature.\nModular 1 (This creature enters with a +1/+1 counter on it. When it dies, you may put its +1/+1 counters on target artifact creature.)","colors":["W"],"colorIdentity":["W"],"keywords":["Modular"]});
const auntieBlyteBadInfluence = card("Auntie Blyte, Bad Influence", "Legendary Creature — Devil Advisor", "{2}{R}", {"cmc":3,"power":"2","toughness":"2","oracleText":"Flying\nWhenever a source you control deals damage to you, put that many +1/+1 counters on Auntie Blyte.\n{1}{R}, {T}, Remove X +1/+1 counters from Auntie Blyte: It deals X damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"]});
const chamberSentry = card("Chamber Sentry", "Artifact Creature — Construct", "{X}", {"cmc":0,"power":"0","toughness":"0","oracleText":"This creature enters with a +1/+1 counter on it for each color of mana spent to cast it.\n{X}, {T}, Remove X +1/+1 counters from this creature: It deals X damage to any target.\n{W}{U}{B}{R}{G}: Return this card from your graveyard to your hand.","colors":[],"colorIdentity":["B","G","R","U","W"]});
const cruelSadist = card("Cruel Sadist", "Creature — Human Assassin", "{B}", {"cmc":1,"power":"1","toughness":"1","oracleText":"{B}, {T}, Pay 1 life: Put a +1/+1 counter on this creature.\n{2}{B}, {T}, Remove X +1/+1 counters from this creature: It deals X damage to target creature.","colors":["B"],"colorIdentity":["B"]});
const sphinxsHerald = card("Sphinx's Herald", "Artifact Creature — Vedalken Wizard", "{U}", {"cmc":1,"power":"1","toughness":"1","oracleText":"{2}{U}, {T}, Sacrifice a white creature, a blue creature, and a black creature: Search your library for a card named Sphinx Sovereign, put it onto the battlefield, then shuffle.","colors":["U"],"colorIdentity":["U"]});
const demonsHerald = card("Demon's Herald", "Creature — Human Wizard", "{B}", {"cmc":1,"power":"1","toughness":"1","oracleText":"{2}{B}, {T}, Sacrifice a blue creature, a black creature, and a red creature: Search your library for a card named Prince of Thralls, put it onto the battlefield, then shuffle.","colors":["B"],"colorIdentity":["B"]});
const dragonsHerald = card("Dragon's Herald", "Creature — Goblin Shaman", "{R}", {"cmc":1,"power":"1","toughness":"1","oracleText":"{2}{R}, {T}, Sacrifice a black creature, a red creature, and a green creature: Search your library for a card named Hellkite Overlord, put it onto the battlefield, then shuffle.","colors":["R"],"colorIdentity":["R"]});
const angelsHerald = card("Angel's Herald", "Creature — Human Cleric", "{W}", {"cmc":1,"power":"1","toughness":"1","oracleText":"{2}{W}, {T}, Sacrifice a green creature, a white creature, and a blue creature: Search your library for a card named Empyrial Archangel, put it onto the battlefield, then shuffle.","colors":["W"],"colorIdentity":["W"]});
const urborgPanther = card("Urborg Panther", "Creature — Nightstalker Cat", "{2}{B}", {"cmc":3,"power":"2","toughness":"2","oracleText":"{B}, Sacrifice this creature: Destroy target creature blocking it.\nSacrifice a creature named Feral Shadow, a creature named Breathstealer, and this creature: Search your library for a card named Spirit of the Night, put that card onto the battlefield, then shuffle.","colors":["B"],"colorIdentity":["B"]});
const essenceFilter = card("Essence Filter", "Sorcery", "{1}{G}{G}", {"cmc":3,"oracleText":"Destroy all enchantments or all nonwhite enchantments.","colors":["G"],"colorIdentity":["G"]});
const hoodedHorror = card("Hooded Horror", "Creature — Horror", "{4}{B}", {"cmc":5,"power":"4","toughness":"4","oracleText":"This creature can't be blocked as long as defending player controls the most creatures or is tied for the most.","colors":["B"],"colorIdentity":["B"]});
const cosmicHorror = card("Cosmic Horror", "Creature — Horror", "{3}{B}{B}{B}", {"cmc":6,"power":"7","toughness":"7","oracleText":"First strike\nAt the beginning of your upkeep, destroy this creature unless you pay {3}{B}{B}{B}. If this creature is destroyed this way, it deals 7 damage to you.","colors":["B"],"colorIdentity":["B"],"keywords":["First strike"]});
const toilToRenown = card("Toil to Renown", "Sorcery", "{1}{G}", {"cmc":2,"oracleText":"You gain 1 life for each tapped artifact, creature, and land you control.","colors":["G"],"colorIdentity":["G"]});
const obeliskOfUndoing = card("Obelisk of Undoing", "Artifact", "{1}", {"cmc":1,"oracleText":"{6}, {T}: Return target permanent you both own and control to your hand.","colors":[],"colorIdentity":[]});
const tetsuoUmezawa = card("Tetsuo Umezawa", "Legendary Creature — Human Archer", "{U}{B}{R}", {"cmc":3,"power":"3","toughness":"3","oracleText":"Tetsuo Umezawa can't be the target of Aura spells.\n{U}{B}{B}{R}, {T}: Destroy target tapped or blocking creature.","colors":["B","R","U"],"colorIdentity":["B","R","U"]});
const doorman = card("Doorman", "Legendary Creature — Mutant Hero", "{1}{G}", {"cmc":2,"power":"2","toughness":"3","oracleText":"{T}: Until end of turn, target creature can't be blocked by creatures with power 2 or less and/or Walls.","colors":["G"],"colorIdentity":["G"]});
const valakutFireboar = card("Valakut Fireboar", "Creature — Elemental Boar", "{4}{R}", {"cmc":5,"power":"1","toughness":"7","oracleText":"Whenever this creature attacks, switch its power and toughness until end of turn.","colors":["R"],"colorIdentity":["R"]});
const riptideMangler = card("Riptide Mangler", "Creature — Beast", "{1}{U}", {"cmc":2,"power":"0","toughness":"3","oracleText":"{1}{U}: This creature's base power becomes equal to target creature's power. (This effect lasts indefinitely.)","colors":["U"],"colorIdentity":["U"]});
const impetuousProtege = card("Impetuous Protege", "Creature — Human Warrior", "{2}{R}", {"cmc":3,"power":"0","toughness":"4","oracleText":"Partner with Proud Mentor (When this creature enters, target player may put Proud Mentor into their hand from their library, then shuffle.)\nWhenever this creature attacks, it gets +X/+0 until end of turn, where X is the greatest power among tapped creatures your opponents control.","colors":["R"],"colorIdentity":["R"],"keywords":["Partner with","Partner"]});
const tenaciousHunter = card("Tenacious Hunter", "Creature — Crocodile", "{2}{G}{G}", {"cmc":4,"power":"4","toughness":"4","oracleText":"As long as a creature has a -1/-1 counter on it, this creature has vigilance and deathtouch.","colors":["G"],"colorIdentity":["G"]});
const spellbaneCentaur = card("Spellbane Centaur", "Creature — Centaur", "{2}{G}", {"cmc":3,"power":"3","toughness":"2","oracleText":"Creatures you control can't be the targets of blue spells or abilities from blue sources.","colors":["G"],"colorIdentity":["G"]});
const sanguinePraetor = card("Sanguine Praetor", "Creature — Avatar Praetor", "{6}{B}{B}", {"cmc":8,"power":"7","toughness":"5","oracleText":"{B}, Sacrifice a creature: Destroy each creature with the same mana value as the sacrificed creature.","colors":["B"],"colorIdentity":["B"]});
const endemicPlague = card("Endemic Plague", "Sorcery", "{3}{B}", {"cmc":4,"oracleText":"As an additional cost to cast this spell, sacrifice a creature.\nDestroy all creatures that share a creature type with the sacrificed creature. They can't be regenerated.","colors":["B"],"colorIdentity":["B"]});
const icyPrison = card("Icy Prison", "Enchantment", "{U}{U}", {"cmc":2,"oracleText":"When this enchantment enters, exile target creature.\nAt the beginning of your upkeep, sacrifice this enchantment unless any player pays {3}.\nWhen this enchantment leaves the battlefield, return the exiled card to the battlefield under its owner's control.","colors":["U"],"colorIdentity":["U"]});
const behemothsHerald = card("Behemoth's Herald", "Creature — Elf Shaman", "{G}", {"cmc":1,"power":"1","toughness":"1","oracleText":"{2}{G}, {T}, Sacrifice a red creature, a green creature, and a white creature: Search your library for a card named Godsire, put it onto the battlefield, then shuffle.","colors":["G"],"colorIdentity":["G"]});
const denseFoliage = card("Dense Foliage", "Enchantment", "{2}{G}", {"cmc":3,"oracleText":"Creatures can't be the targets of spells.","colors":["G"],"colorIdentity":["G"]});

const all = [blademaneBaku, quillmaneBaku, skullmaneBaku, waxmaneBaku, infusedArrows, mercadianLift, talonOfPain, nightDealings, arcboundJavelineer, auntieBlyteBadInfluence, chamberSentry, cruelSadist,
  sphinxsHerald, demonsHerald, dragonsHerald, angelsHerald, urborgPanther, essenceFilter, hoodedHorror, cosmicHorror, toilToRenown, obeliskOfUndoing, tetsuoUmezawa, doorman,
  valakutFireboar, riptideMangler, impetuousProtege, tenaciousHunter, spellbaneCentaur, sanguinePraetor, endemicPlague, icyPrison,
  behemothsHerald, denseFoliage];

describe("Lane B round 28", () => {
  it("supports every card of the round", () => {
    supported(...all);
  });

  it("Skullmane Baku: X is announced, up to the ki counters it has, and that many are removed (CR 107.3a)", () => {
    const { s: s0, ap, opp } = setup([]);
    const baku = putOnBattlefield(s0, ap, skullmaneBaku);
    s0.objects[baku]!.counters.ki = 3;
    const bear = putOnBattlefield(s0, opp, greenBear());
    expect(planActivate(s0, ap, baku, 0, [tgt(bear)], undefined, undefined, 4)).toBeNull();
    const s = settle(activateNow(s0, ap, baku, 0, [tgt(bear)], 2));
    expect(s.objects[baku]!.counters.ki).toBe(1);
    expect(zone(s, bear)).toBe("graveyard");
  });

  it("Blademane Baku gets +2/+0 for each counter removed", () => {
    const { s: s0, ap } = setup([]);
    const baku = putOnBattlefield(s0, ap, blademaneBaku);
    s0.objects[baku]!.counters.ki = 3;
    const s = settle(activateNow(s0, ap, baku, 0, [], 2));
    expect(s.objects[baku]!.counters.ki).toBe(1);
    expect(pt(s, baku)).toBe("5/1");
  });

  it("Quillmane Baku returns a creature with mana value X or less; a bigger one can't be its target", () => {
    const { s: s0, ap, opp } = setup([]);
    const baku = putOnBattlefield(s0, ap, quillmaneBaku);
    s0.objects[baku]!.counters.ki = 2;
    const bear = putOnBattlefield(s0, opp, greenBear());
    const beast = putOnBattlefield(s0, opp, bigBeast());
    expect(planActivate(s0, ap, baku, 0, [tgt(beast)], undefined, undefined, 2)).toBeNull();
    const s = settle(activateNow(s0, ap, baku, 0, [tgt(bear)], 2));
    expect(zone(s, bear)).toBe("hand");
    expect(s.objects[baku]!.counters.ki ?? 0).toBe(0);
  });

  it("Waxmane Baku taps X target creatures", () => {
    const { s: s0, ap, opp } = setup([]);
    const baku = putOnBattlefield(s0, ap, waxmaneBaku);
    s0.objects[baku]!.counters.ki = 2;
    const a = putOnBattlefield(s0, opp, greenBear());
    const b = putOnBattlefield(s0, opp, bigBeast());
    const s = settle(activateNow(s0, ap, baku, 0, [tgt(a), tgt(b)], 2));
    expect(s.objects[a]!.tapped && s.objects[b]!.tapped).toBe(true);
    expect(s.objects[baku]!.counters.ki ?? 0).toBe(0);
  });

  it("the Bakus' trigger puts a ki counter on them when a Spirit spell is cast", () => {
    const { s: s0, ap, ids } = setup([creature("Kami of Test", "Creature — Spirit", "{1}{W}", 1, 1, { cmc: 2 })]);
    const baku = putOnBattlefield(s0, ap, waxmaneBaku);
    const s = settle(castNow(s0, ap, ids[0]!));
    expect(s.objects[baku]!.counters.ki).toBe(1);
  });

  it("Infused Arrows: -X/-X for X charge counters", () => {
    const { s: s0, ap, opp } = setup([]);
    const arrows = putOnBattlefield(s0, ap, infusedArrows);
    s0.objects[arrows]!.counters.charge = 4;
    const beast = putOnBattlefield(s0, opp, bigBeast());
    const s = settle(activateNow(s0, ap, arrows, 0, [tgt(beast)], 3));
    expect(pt(s, beast)).toBe("1/2");
    expect(s.objects[arrows]!.counters.charge).toBe(1);
  });

  it("Mercadian Lift puts a creature card with mana value exactly X from your hand onto the battlefield", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.hand = [];
    const lift = putOnBattlefield(s0, ap, mercadianLift);
    s0.objects[lift]!.counters.winch = 2;
    const bear = into(s0, ap, greenBear());
    const knight = into(s0, ap, whiteKnight());
    into(s0, ap, bigBeast());
    let s = settle(activateNow(s0, ap, lift, 1, [], 2), at("searchLibrary", ap));
    expect(s.pending?.kind === "searchLibrary" && [...s.pending.cards].sort()).toEqual([bear, knight].sort());
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [knight] }));
    expect(zone(s, knight)).toBe("battlefield");
    expect(zone(s, bear)).toBe("hand");
    expect(s.objects[lift]!.counters.winch ?? 0).toBe(0);
  });

  it("Talon of Pain counts damage other sources you control deal to opponents, then deals X", () => {
    const { s: s0, ap, ids, opp } = setup([shock()]);
    const talon = putOnBattlefield(s0, ap, talonOfPain);
    let s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]));
    expect(s.objects[talon]!.counters.charge).toBe(1);
    s = priorityTo(s, ap);
    s = settle(activateNow(s, ap, talon, 0, [ply(opp)], 1));
    expect(life(s, opp)).toBe(37);
    // Its own damage doesn't count.
    expect(s.objects[talon]!.counters.charge ?? 0).toBe(0);
  });

  it("Night Dealings: theft counters for the damage dealt, then a search for a nonland card with mana value X", () => {
    const { s: s0, ap, ids, opp } = setup([shock()]);
    const nd = putOnBattlefield(s0, ap, nightDealings);
    const knight = into(s0, ap, whiteKnight(), "library");
    let s = settle(castNow(s0, ap, ids[0]!, [ply(opp)]));
    expect(s.objects[nd]!.counters.theft).toBe(2);
    s = priorityTo(s, ap);
    s = settle(activateNow(s, ap, nd, 0, [], 2), at("searchLibrary", ap));
    // The Grizzly Bears in the library ({1}{G}) and the knight, not the Forests.
    expect(s.pending?.kind === "searchLibrary" && s.pending.cards.includes(knight) && s.pending.cards.every((c) => /^(Grizzly Bears|White Knight)$/.test(s.cards[s.objects[c]!.cardId]!.name))).toBe(true);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [knight] }));
    expect(zone(s, knight)).toBe("hand");
    expect(s.objects[nd]!.counters.theft ?? 0).toBe(0);
  });

  it("a bot removes ki counters to kill a creature with Skullmane Baku", () => {
    const { s: s0, ap, opp } = setup([]);
    s0.players[ap]!.hand = [];
    s0.players[ap]!.command = [];
    const baku = putOnBattlefield(s0, ap, skullmaneBaku);
    s0.objects[baku]!.counters.ki = 2;
    const bear = putOnBattlefield(s0, opp, greenBear());
    // Bots use activated abilities in their second main phase.
    let s = passUntil(s0, "main2", ap);
    s = settle(run(s, botActions(s, ap)));
    expect(zone(s, bear)).toBe("graveyard");
  });
  it("Sphinx's Herald sacrifices a white, a blue and a black creature and puts Sphinx Sovereign onto the battlefield", () => {
    const { s: s0, ap } = setup([]);
    const herald = putOnBattlefield(s0, ap, sphinxsHerald);
    const w = putOnBattlefield(s0, ap, whiteKnight());
    const u = putOnBattlefield(s0, ap, blueDrake());
    const b = putOnBattlefield(s0, ap, creature("Black Rat", "Creature — Rat", "{B}", 1, 1, { cmc: 1, colors: ["B"] }));
    const sovereign = into(s0, ap, creature("Sphinx Sovereign", "Artifact Creature — Sphinx", "{4}{W}{U}{B}", 6, 6, { cmc: 7 }), "library");
    // Two white creatures aren't a white, a blue and a black one.
    const w2 = putOnBattlefield(s0, ap, creature("White Page", "Creature — Human", "{W}", 1, 1, { cmc: 1, colors: ["W"] }));
    expect(planActivate(s0, ap, herald, 0, [], undefined, undefined, undefined, { sacrifice: [w, w2, b] })).toBeNull();
    let s = settle(activateNow(s0, ap, herald, 0, [], undefined, { sacrifice: [w, u, b] }), at("searchLibrary", ap));
    if (s.pending?.kind === "searchLibrary") s = settle(act(s, { type: "searchLibrary", player: ap, found: [sovereign] }));
    expect([zone(s, w), zone(s, u), zone(s, b), zone(s, w2)]).toEqual(["graveyard", "graveyard", "graveyard", "battlefield"]);
    expect(zone(s, sovereign)).toBe("battlefield");
  });

  it("Urborg Panther sacrifices Feral Shadow, Breathstealer and itself for Spirit of the Night", () => {
    const { s: s0, ap } = setup([]);
    const panther = putOnBattlefield(s0, ap, urborgPanther);
    const shadow = putOnBattlefield(s0, ap, creature("Feral Shadow", "Creature — Nightstalker", "{2}{B}", 2, 1, { cmc: 3 }));
    const thief = putOnBattlefield(s0, ap, creature("Breathstealer", "Creature — Nightstalker", "{2}{B}", 2, 2, { cmc: 3 }));
    const spirit = into(s0, ap, creature("Spirit of the Night", "Legendary Creature — Demon Spirit", "{6}{B}{B}{B}", 6, 5, { cmc: 9 }), "library");
    let s = settle(activateNow(s0, ap, panther, 1, [], undefined, { sacrifice: [shadow, thief] }), at("searchLibrary", ap));
    if (s.pending?.kind === "searchLibrary") s = settle(act(s, { type: "searchLibrary", player: ap, found: [spirit] }));
    expect([zone(s, panther), zone(s, shadow), zone(s, thief)]).toEqual(["graveyard", "graveyard", "graveyard"]);
    expect(zone(s, spirit)).toBe("battlefield");
  });

  it("Urborg Panther needs a Feral Shadow and a Breathstealer", () => {
    const { s: s0, ap } = setup([]);
    const panther = putOnBattlefield(s0, ap, urborgPanther);
    const shadow = putOnBattlefield(s0, ap, creature("Feral Shadow", "Creature — Nightstalker", "{2}{B}", 2, 1, { cmc: 3 }));
    const bear = putOnBattlefield(s0, ap, greenBear());
    expect(planActivate(s0, ap, panther, 1, [], undefined, undefined, undefined, { sacrifice: [shadow, bear] })).toBeNull();
  });

  it("Urborg Panther destroys a creature blocking it", () => {
    const { s: s0, ap, opp } = setup([]);
    const panther = putOnBattlefield(s0, ap, urborgPanther);
    const wall = putOnBattlefield(s0, opp, bigBeast());
    let s = attackWith(s0, [panther], opp);
    for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: wall, attacker: panther }] }));
    s = priorityTo(s, ap);
    s = settle(activateNow(s, ap, panther, 0, [tgt(wall)]));
    expect(zone(s, wall)).toBe("graveyard");
    expect(zone(s, panther)).toBe("graveyard");
  });

  it("Essence Filter destroys all enchantments, or only the nonwhite ones", () => {
    const { s: s0, ap, ids, opp } = setup([essenceFilter]);
    const white = putOnBattlefield(s0, opp, card("White Aura", "Enchantment", "{W}", { cmc: 1, colors: ["W"] }));
    const black = putOnBattlefield(s0, opp, card("Black Aura", "Enchantment", "{B}", { cmc: 1, colors: ["B"] }));
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseOption", ap));
    expect(s.pending?.kind).toBe("chooseOption");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "1" }));
    expect(zone(s, white)).toBe("battlefield");
    expect(zone(s, black)).toBe("graveyard");
  });

  it("Hooded Horror can't be blocked while the defending player controls the most creatures or is tied", () => {
    const { s: s0, ap, opp } = setup([]);
    const horror = putOnBattlefield(s0, ap, hoodedHorror);
    putOnBattlefield(s0, opp, greenBear());
    invalidateCharacteristics(s0);
    let s = attackWith(s0, [horror], opp);
    for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const bear = mine(s, opp, "Green Bear")[0]!;
    // Tied with the attacker at one creature each: unblockable.
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: bear, attacker: horror }] })).toThrow();
  });

  it("Hooded Horror can be blocked by a player with fewer creatures than someone else", () => {
    const { s: s0, ap, opp } = setup([]);
    const horror = putOnBattlefield(s0, ap, hoodedHorror);
    putOnBattlefield(s0, ap, whiteKnight());
    const bear = putOnBattlefield(s0, opp, greenBear());
    let s = attackWith(s0, [horror], opp);
    for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: bear, attacker: horror }] }));
    expect(s.objects[bear]!.blocking).toBeDefined();
  });

  it("Cosmic Horror: not paying at upkeep destroys it and it deals 7 damage to you", () => {
    const { s: s0, ap } = setup([]);
    const horror = putOnBattlefield(s0, ap, cosmicHorror);
    putOnBattlefield(s0, ap, swamp);
    let s = passUntil(s0, "upkeep", ap);
    s = settle(s, (x) => !!x.pending && x.pending.player === ap);
    expect(s.pending?.kind).toBe("chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(zone(s, horror)).toBe("graveyard");
    expect(life(s, ap)).toBe(33);
  });

  it("Cosmic Horror: an indestructible one isn't destroyed this way, so no damage", () => {
    const { s: s0, ap } = setup([]);
    const horror = putOnBattlefield(s0, ap, { ...cosmicHorror, keywords: ["First strike", "Indestructible"], oracleText: cosmicHorror.oracleText + "\nIndestructible" });
    putOnBattlefield(s0, ap, swamp);
    let s = passUntil(s0, "upkeep", ap);
    s = settle(s, (x) => !!x.pending && x.pending.player === ap);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(zone(s, horror)).toBe("battlefield");
    expect(life(s, ap)).toBe(40);
  });

  it("Cosmic Horror: paying keeps it; a player who can't pay loses it without being asked", () => {
    const { s: s0, ap } = setup([]);
    const horror = putOnBattlefield(s0, ap, cosmicHorror);
    putOnBattlefield(s0, ap, swamp);
    let s = settle(passUntil(s0, "upkeep", ap), (x) => !!x.pending && x.pending.player === ap);
    s = settle(run(s, [...planMana(s, ap, parseManaCost("{3}{B}{B}{B}"))!, { type: "chooseMay", player: ap, yes: true }]));
    expect(zone(s, horror)).toBe("battlefield");
    expect(life(s, ap)).toBe(40);
    // Next upkeep, without a third Swamp to pay with, it goes.
    for (const id of mine(s, ap, "Swamp").slice(2)) { s.objects[id]!.zone = "graveyard"; s.battlefield.splice(s.battlefield.indexOf(id), 1); }
    invalidateCharacteristics(s);
    s = settle(passUntil(passUntil(s, "draw", ap), "upkeep", ap));
    expect(zone(s, horror)).toBe("graveyard");
    expect(life(s, ap)).toBe(33);
  });

  it("Toil to Renown gains 1 life for each tapped artifact, creature and land you control", () => {
    const { s: s0, ap, ids, opp } = setup([toilToRenown]);
    const a = putOnBattlefield(s0, ap, ironRing());
    const c = putOnBattlefield(s0, ap, greenBear());
    putOnBattlefield(s0, ap, whiteKnight());
    const theirs = putOnBattlefield(s0, opp, bigBeast());
    s0.objects[a]!.tapped = s0.objects[c]!.tapped = s0.objects[theirs]!.tapped = true;
    tapLands(s0, ap);
    pool(s0, ap, { G: 2 });
    const lands = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.typeLine.includes("Land")).length;
    const s = settle(castNow(s0, ap, ids[0]!));
    expect(life(s, ap)).toBe(40 + lands + 2);
  });

  it("Obelisk of Undoing returns a permanent you both own and control, not one you only control", () => {
    const { s: s0, ap, opp } = setup([]);
    const ob = putOnBattlefield(s0, ap, obeliskOfUndoing);
    const bear = putOnBattlefield(s0, ap, greenBear());
    const stolen = putOnBattlefield(s0, opp, whiteKnight());
    s0.objects[stolen]!.controller = ap;
    invalidateCharacteristics(s0);
    expect(planActivate(s0, ap, ob, 0, [tgt(stolen)])).toBeNull();
    const s = settle(activateNow(s0, ap, ob, 0, [tgt(bear)]));
    expect(zone(s, bear)).toBe("hand");
  });

  it("Tetsuo Umezawa destroys a tapped creature, not an untapped one, and can't be enchanted by an Aura spell", () => {
    const { s: s0, ap, opp, ids } = setup([card("Holy Strength", "Enchantment — Aura", "{W}", { cmc: 1, oracleText: "Enchant creature\nEnchanted creature gets +1/+2." })]);
    const tetsuo = putOnBattlefield(s0, ap, tetsuoUmezawa);
    const bear = putOnBattlefield(s0, opp, greenBear());
    const beast = putOnBattlefield(s0, opp, bigBeast());
    s0.objects[beast]!.tapped = true;
    expect(castProblem(s0, ap, ids[0]!, [tgt(tetsuo)])).not.toBeNull();
    expect(planActivate(s0, ap, tetsuo, 0, [tgt(bear)])).toBeNull();
    const s = settle(activateNow(s0, ap, tetsuo, 0, [tgt(beast)]));
    expect(zone(s, beast)).toBe("graveyard");
  });

  it("Doorman: the target creature can't be blocked by creatures with power 2 or less or by Walls", () => {
    const { s: s0, ap, opp } = setup([]);
    const door = putOnBattlefield(s0, ap, doorman);
    const beast = putOnBattlefield(s0, ap, bigBeast());
    const bear = putOnBattlefield(s0, opp, greenBear());
    const wall = putOnBattlefield(s0, opp, creature("Big Wall", "Creature — Wall", "{3}", 5, 5, { cmc: 3 }));
    const ox = putOnBattlefield(s0, opp, creature("Big Ox", "Creature — Ox", "{3}", 3, 3, { cmc: 3 }));
    let s = settle(activateNow(s0, ap, door, 0, [tgt(beast)]));
    s = attackWith(s, [beast], opp);
    for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: bear, attacker: beast }] })).toThrow();
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: wall, attacker: beast }] })).toThrow();
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: ox, attacker: beast }] });
    expect(s.objects[ox]!.blocking).toBeDefined();
  });

  it("Valakut Fireboar switches its power and toughness when it attacks", () => {
    const { s: s0, ap, opp } = setup([]);
    const boar = putOnBattlefield(s0, ap, valakutFireboar);
    const s = attackWith(s0, [boar], opp);
    expect(pt(s, boar)).toBe("7/1");
  });

  it("Riptide Mangler's base power becomes the target's power as the ability resolves, and stays", () => {
    const { s: s0, ap, opp } = setup([giantGrowth()]);
    const mangler = putOnBattlefield(s0, ap, riptideMangler);
    const beast = putOnBattlefield(s0, opp, bigBeast());
    let s = settle(activateNow(s0, ap, mangler, 0, [tgt(beast)]));
    expect(pt(s, mangler)).toBe("4/3");
    // The beast leaving doesn't change it (locked in as it resolved, CR 608.2h); it lasts past the turn.
    s.objects[beast]!.zone = "graveyard";
    s.battlefield.splice(s.battlefield.indexOf(beast), 1);
    invalidateCharacteristics(s);
    s = settle(passUntil(s, "upkeep", opp));
    expect(pt(s, mangler)).toBe("4/3");
  });

  it("Impetuous Protege gets +X/+0 for the greatest power among tapped creatures your opponents control", () => {
    const { s: s0, ap, opp } = setup([]);
    const protege = putOnBattlefield(s0, ap, impetuousProtege);
    const beast = putOnBattlefield(s0, opp, bigBeast());
    putOnBattlefield(s0, opp, creature("Huge Ox", "Creature — Ox", "{5}", 6, 6, { cmc: 5 }));
    const mineTapped = putOnBattlefield(s0, ap, creature("My Giant", "Creature — Giant", "{5}", 9, 9, { cmc: 5 }));
    s0.objects[beast]!.tapped = true;
    s0.objects[mineTapped]!.tapped = true;
    const s = attackWith(s0, [protege], opp);
    expect(pt(s, protege)).toBe("4/4");
  });

  it("Tenacious Hunter has vigilance and deathtouch while any creature has a -1/-1 counter", () => {
    const { s: s0, ap, opp } = setup([]);
    const hunter = putOnBattlefield(s0, ap, tenaciousHunter);
    const bear = putOnBattlefield(s0, opp, greenBear());
    invalidateCharacteristics(s0);
    expect(objHasKeyword(s0, s0.objects[hunter]!, "Deathtouch")).toBe(false);
    s0.objects[bear]!.counters["-1/-1"] = 1;
    invalidateCharacteristics(s0);
    expect(objHasKeyword(s0, s0.objects[hunter]!, "Deathtouch")).toBe(true);
    expect(objHasKeyword(s0, s0.objects[hunter]!, "Vigilance")).toBe(true);
  });

  it("Spellbane Centaur: your creatures can't be the targets of blue spells; other spells still can", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, spellbaneCentaur);
    const bear = putOnBattlefield(s0, ap, greenBear());
    s0.players[opp]!.manaPool = { W: 0, U: 2, B: 0, R: 2, G: 0, C: 0 };
    const blue = into(s0, opp, card("Blue Bolt", "Instant", "{U}", { cmc: 1, colors: ["U"], oracleText: "Return target creature to its owner's hand." }));
    const red = into(s0, opp, card("Red Bolt", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Return target creature to its owner's hand." }));
    const theirs = putOnBattlefield(s0, opp, whiteKnight());
    const s = priorityTo(s0, opp);
    expect(castProblem(s, opp, blue, [tgt(bear)])).toMatch(/target/);
    expect(castProblem(s, opp, blue, [tgt(theirs)])).toBeNull();
    expect(castProblem(s, opp, red, [tgt(bear)])).toBeNull();
  });

  it("Sanguine Praetor destroys each creature with the sacrificed creature's mana value", () => {
    const { s: s0, ap, opp } = setup([]);
    const praetor = putOnBattlefield(s0, ap, sanguinePraetor);
    const fodder = putOnBattlefield(s0, ap, whiteKnight());
    const bear = putOnBattlefield(s0, opp, greenBear());
    const beast = putOnBattlefield(s0, opp, bigBeast());
    const s = settle(activateNow(s0, ap, praetor, 0, [], undefined, { sacrifice: [fodder] }));
    expect(zone(s, fodder)).toBe("graveyard");
    expect(zone(s, bear)).toBe("graveyard");
    expect(zone(s, beast)).toBe("battlefield");
    expect(zone(s, praetor)).toBe("battlefield");
  });

  it("Endemic Plague destroys all creatures that share a creature type with the sacrificed creature", () => {
    const { s: s0, ap, ids, opp } = setup([endemicPlague]);
    const fodder = putOnBattlefield(s0, ap, creature("Fodder Bear", "Creature — Bear Soldier", "{1}", 1, 1, { cmc: 1 }));
    const bear = putOnBattlefield(s0, opp, greenBear());
    const soldier = putOnBattlefield(s0, opp, creature("Soldier", "Creature — Human Soldier", "{W}", 1, 1, { cmc: 1 }));
    const beast = putOnBattlefield(s0, opp, bigBeast());
    const s = settle(castNow(s0, ap, ids[0]!, [], { sacrifice: [fodder] }));
    expect(zone(s, fodder)).toBe("graveyard");
    expect([zone(s, bear), zone(s, soldier), zone(s, beast)]).toEqual(["graveyard", "graveyard", "battlefield"]);
  });

  it("Icy Prison exiles a creature until it leaves; at upkeep any player may pay {3}, or it's sacrificed", () => {
    const { s: s0, ap, ids, opp } = setup([icyPrison]);
    const beast = putOnBattlefield(s0, opp, bigBeast());
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseTargets", ap));
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(beast)] }));
    expect(zone(s, beast)).toBe("exile");
    const prison = mine(s, ap, "Icy Prison")[0]!;
    s = passUntil(s, "upkeep", ap);
    s = settle(s, (x) => x.pending?.kind === "chooseOption" && x.pending.what === "punisher");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "punisher" });
    for (let i = 0; i < 4 && s.pending?.kind === "chooseOption" && s.pending.what === "punisher"; i++) s = act(s, { type: "chooseOption", player: s.pending.player, choice: "none" });
    s = settle(s);
    expect(zone(s, prison)).toBe("graveyard");
    expect(zone(s, beast)).toBe("battlefield");
  });

  it("Icy Prison: bots let it go unless it's theirs, and its controller pays to keep it", () => {
    const { s: s0, ap, ids, opp } = setup([icyPrison]);
    const beast = putOnBattlefield(s0, opp, bigBeast());
    let s = settle(castNow(s0, ap, ids[0]!), at("chooseTargets", ap));
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(beast)] }));
    const prison = mine(s, ap, "Icy Prison")[0]!;
    s = passUntil(s, "upkeep", ap);
    s = settle(s);
    expect(zone(s, prison)).toBe("battlefield");
    expect(zone(s, beast)).toBe("exile");
  });
  it("Arcbound Javelineer removes X +1/+1 counters to deal X damage to an attacking creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const jav = putOnBattlefield(s0, opp, arcboundJavelineer);
    s0.objects[jav]!.counters["+1/+1"] = 3;
    const beast = putOnBattlefield(s0, ap, bigBeast());
    const home = putOnBattlefield(s0, ap, greenBear());
    let s = attackWith(s0, [beast], opp);
    s = priorityTo(s, opp);
    // Not a creature that isn't attacking or blocking.
    expect(planActivate(s, opp, jav, 0, [tgt(home)], undefined, undefined, 2)).toBeNull();
    pool(s, opp, {});
    s = settle(activateNow(s, opp, jav, 0, [tgt(beast)], 3));
    expect(s.objects[beast]!.damage).toBe(3);
    expect(s.objects[jav]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Auntie Blyte gets +1/+1 counters for damage your sources deal you, then removes X to deal X", () => {
    const { s: s0, ap, ids, opp } = setup([shock()]);
    const blyte = putOnBattlefield(s0, ap, auntieBlyteBadInfluence);
    let s = settle(castNow(s0, ap, ids[0]!, [ply(ap)]));
    expect(s.objects[blyte]!.counters["+1/+1"]).toBe(2);
    s = priorityTo(s, ap);
    s = settle(activateNow(s, ap, blyte, 0, [ply(opp)], 2));
    expect(life(s, opp)).toBe(38);
    expect(pt(s, blyte)).toBe("2/2");
  });

  it("Chamber Sentry: X damage for {X} and X counters", () => {
    const { s: s0, ap, opp } = setup([]);
    const sentry = putOnBattlefield(s0, ap, chamberSentry);
    s0.objects[sentry]!.counters["+1/+1"] = 3;
    const bear = putOnBattlefield(s0, opp, greenBear());
    const s = settle(activateNow(s0, ap, sentry, 0, [tgt(bear)], 2));
    expect(zone(s, bear)).toBe("graveyard");
    expect(s.objects[sentry]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[sentry]!.zone).toBe("battlefield");
  });

  it("Cruel Sadist: a counter for {B} and 1 life, then X damage for X counters", () => {
    const { s: s0, ap, opp } = setup([]);
    const sadist = putOnBattlefield(s0, ap, cruelSadist);
    let s = settle(activateNow(s0, ap, sadist, 0));
    expect(life(s, ap)).toBe(39);
    expect(s.objects[sadist]!.counters["+1/+1"]).toBe(1);
    s.objects[sadist]!.tapped = false;
    const bear = putOnBattlefield(s, opp, greenBear());
    s = settle(activateNow(s, ap, sadist, 1, [tgt(bear)], 1));
    expect(s.objects[bear]!.damage).toBe(1);
    expect(s.objects[sadist]!.counters["+1/+1"] ?? 0).toBe(0);
  });
  it("Dense Foliage: creatures can't be the targets of spells, but abilities can target them", () => {
    const { s: s0, ap, ids, opp } = setup([shock()]);
    putOnBattlefield(s0, opp, denseFoliage);
    const bear = putOnBattlefield(s0, opp, greenBear());
    pool(s0, ap, { R: 1 });
    expect(castProblem(s0, ap, ids[0]!, [tgt(bear)])).toMatch(/target/);
    expect(castProblem(s0, ap, ids[0]!, [ply(opp)])).toBeNull();
    const arrows = putOnBattlefield(s0, ap, infusedArrows);
    s0.objects[arrows]!.counters.charge = 2;
    const s = settle(activateNow(s0, ap, arrows, 0, [tgt(bear)], 2));
    expect(zone(s, bear)).toBe("graveyard");
  });

  it("Behemoth's Herald: a creature that is both red and green counts once", () => {
    const { s: s0, ap } = setup([]);
    const herald = putOnBattlefield(s0, ap, behemothsHerald);
    const rg = putOnBattlefield(s0, ap, creature("Gruul Pup", "Creature — Dog", "{R}{G}", 2, 2, { cmc: 2, colors: ["R", "G"] }));
    const w = putOnBattlefield(s0, ap, whiteKnight());
    const w2 = putOnBattlefield(s0, ap, creature("White Page", "Creature — Human", "{W}", 1, 1, { cmc: 1, colors: ["W"] }));
    expect(planActivate(s0, ap, herald, 0, [], undefined, undefined, undefined, { sacrifice: [rg, w] })).toBeNull();
    expect(planActivate(s0, ap, herald, 0, [], undefined, undefined, undefined, { sacrifice: [rg, w, w2] })).toBeNull();
  });
});
