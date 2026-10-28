// Lane B, round 32: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, objHasKeyword, parseManaCost, planActivate, planCast, planMana, planTurnFaceUp, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const spittingSlug = () => card("Spitting Slug", "Creature — Slug", "{1}{G}{G}", { cmc: 3, colors: ["G"], power: "2", toughness: "4", oracleText: "Whenever this creature blocks or becomes blocked, you may pay {1}{G}. If you do, this creature gains first strike until end of turn. Otherwise, each creature blocking or blocked by this creature gains first strike until end of turn." });
const parallaxInhibitor = () => card("Parallax Inhibitor", "Artifact", "{2}", { cmc: 2, colors: [], oracleText: "{1}, {T}, Sacrifice this artifact: Put a fade counter on each permanent with fading you control." });
const trapDigger = () => card("Trap Digger", "Creature — Human Soldier", "{3}{W}", { cmc: 4, colors: ["W"], power: "1", toughness: "3", oracleText: "{2}{W}, {T}: Put a trap counter on target land you control.\nSacrifice a land with a trap counter on it: This creature deals 3 damage to target attacking creature without flying." });
const rapidFire = () => card("Rapid Fire", "Instant", "{3}{W}", { cmc: 4, colors: ["W"], oracleText: "Cast this spell only before blockers are declared.\nTarget creature gains first strike until end of turn. If it doesn't have rampage, that creature gains rampage 2 until end of turn. (Whenever the creature becomes blocked, it gets +2/+2 until end of turn for each creature blocking it beyond the first.)" });
const paroxysm = () => card("Paroxysm", "Enchantment — Aura", "{1}{R}", { cmc: 2, colors: ["R"], keywords: ["Enchant"], oracleText: "Enchant creature\nAt the beginning of the upkeep of enchanted creature's controller, that player reveals the top card of their library. If that card is a land card, destroy that creature. Otherwise, it gets +3/+3 until end of turn." });
const venarianGold = () => card("Venarian Gold", "Enchantment — Aura", "{X}{U}{U}", { cmc: 2, colors: ["U"], keywords: ["Enchant"], oracleText: "Enchant creature\nWhen this Aura enters, tap enchanted creature and put X sleep counters on it.\nEnchanted creature doesn't untap during its controller's untap step if it has a sleep counter on it.\nAt the beginning of the upkeep of enchanted creature's controller, remove a sleep counter from that creature." });
const kjeldoranGuard = () => card("Kjeldoran Guard", "Creature — Human Soldier", "{1}{W}", { cmc: 2, colors: ["W"], power: "1", toughness: "1", oracleText: "{T}: Target creature gets +1/+1 until end of turn. When that creature leaves the battlefield this turn, sacrifice this creature. Activate only during combat and only if defending player controls no snow lands." });
const arcumsSleigh = () => card("Arcum's Sleigh", "Artifact", "{1}", { cmc: 1, colors: [], oracleText: "{2}, {T}: Target creature gains vigilance until end of turn. Activate only during combat and only if defending player controls a snow land." });
const metathranAerostat = () => card("Metathran Aerostat", "Creature — Metathran", "{2}{U}{U}", { cmc: 4, colors: ["U"], power: "2", toughness: "2", keywords: ["Flying"], oracleText: "Flying\n{X}{U}: You may put a creature card with mana value X from your hand onto the battlefield. If you do, return this creature to its owner's hand." });
const shelteringPrayers = () => card("Sheltering Prayers", "Enchantment", "{W}", { cmc: 1, colors: ["W"], oracleText: "Basic lands each player controls have shroud as long as that player controls three or fewer lands. (They can't be the targets of spells or abilities.)" });
const graxiplon = () => card("Graxiplon", "Creature — Beast", "{5}{U}", { cmc: 6, colors: ["U"], power: "3", toughness: "4", oracleText: "This creature can't be blocked unless defending player controls three or more creatures that share a creature type." });
const exiledDoomsayer = () => card("Exiled Doomsayer", "Creature — Human Cleric", "{1}{W}", { cmc: 2, colors: ["W"], power: "1", toughness: "2", oracleText: "All morph costs cost {2} more. (This doesn't affect the cost to cast creature spells face down.)" });
const forethoughtAmulet = () => card("Forethought Amulet", "Artifact", "{5}", { cmc: 5, colors: [], oracleText: "At the beginning of your upkeep, sacrifice this artifact unless you pay {3}.\nIf an instant or sorcery source would deal 3 or more damage to you, it deals 2 damage to you instead." });
const rumblingAftershocks = () => card("Rumbling Aftershocks", "Enchantment", "{4}{R}", { cmc: 5, colors: ["R"], oracleText: "Whenever you cast a kicked spell, you may have this enchantment deal damage to any target equal to the number of times that spell was kicked." });
const cocoon = () => card("Cocoon", "Enchantment — Aura", "{G}", { cmc: 1, colors: ["G"], keywords: ["Enchant"], oracleText: "Enchant creature you control\nWhen this Aura enters, tap enchanted creature and put three pupa counters on this Aura.\nEnchanted creature doesn't untap during your untap step if this Aura has a pupa counter on it.\nAt the beginning of your upkeep, remove a pupa counter from this Aura. If you can't, sacrifice it, put a +1/+1 counter on enchanted creature, and that creature gains flying." });
const consumingFerocity = () => card("Consuming Ferocity", "Enchantment — Aura", "{1}{R}", { cmc: 2, colors: ["R"], keywords: ["Enchant"], oracleText: "Enchant non-Wall creature\nEnchanted creature gets +1/+0.\nAt the beginning of your upkeep, put a +1/+0 counter on enchanted creature. If that creature has three or more +1/+0 counters on it, it deals damage equal to its power to its controller, then destroy that creature and it can't be regenerated." });
const barrelingAttack = () => card("Barreling Attack", "Instant", "{2}{R}{R}", { cmc: 4, colors: ["R"], oracleText: "Target creature gains trample until end of turn. When that creature becomes blocked this turn, it gets +1/+1 until end of turn for each creature blocking it." });
const parallaxWave = () => card("Parallax Wave", "Enchantment", "{2}{W}{W}", { cmc: 4, colors: ["W"], keywords: ["Fading"], oracleText: "Fading 5 (This enchantment enters with five fade counters on it. At the beginning of your upkeep, remove a fade counter from it. If you can't, sacrifice it.)\nRemove a fade counter from this enchantment: Exile target creature.\nWhen this enchantment leaves the battlefield, each player returns to the battlefield all cards they own exiled with it." });
const blastoderm = () => card("Blastoderm", "Creature — Beast", "{2}{G}{G}", { cmc: 4, colors: ["G"], power: "5", toughness: "5", keywords: ["Shroud","Fading"], oracleText: "Shroud (This creature can't be the target of spells or abilities.)\nFading 3 (This creature enters with three fade counters on it. At the beginning of your upkeep, remove a fade counter from it. If you can't, sacrifice it.)" });
const crawGiant = () => card("Craw Giant", "Creature — Giant", "{3}{G}{G}{G}{G}", { cmc: 7, colors: ["G"], power: "6", toughness: "4", keywords: ["Trample","Rampage"], oracleText: "Trample\nRampage 2 (Whenever this creature becomes blocked, it gets +2/+2 until end of turn for each creature blocking it beyond the first.)" });
const infernalCaretaker = () => card("Infernal Caretaker", "Creature — Human Cleric", "{3}{B}", { cmc: 4, colors: ["B"], power: "2", toughness: "2", keywords: ["Morph"], oracleText: "Morph {3}{B} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)\nWhen this creature is turned face up, return all Zombie cards from all graveyards to their owners' hands." });
const everflowingChalice = () => card("Everflowing Chalice", "Artifact", "{0}", { cmc: 0, colors: [], keywords: ["Multikicker"], oracleText: "Multikicker {2} (You may pay an additional {2} any number of times as you cast this spell.)\nThis artifact enters with a charge counter on it for each time it was kicked.\n{T}: Add {C} for each charge counter on this artifact." });

const creature = (name: string, typeLine: string, manaCost: string, p: number, t: number, extra: Partial<CardDef> = {}) => card(name, typeLine, manaCost, { power: String(p), toughness: String(t), ...extra });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2, { cmc: 2, colors: ["G"] });
const redOgre = () => creature("Red Ogre", "Creature — Ogre", "{2}{R}", 3, 3, { cmc: 3, colors: ["R"] });
const bigRedBeast = () => creature("Big Red Beast", "Creature — Beast", "{4}{R}", 4, 6, { cmc: 5, colors: ["R"] });
const whiteWall = () => creature("White Wall", "Creature — Wall", "{1}{W}", 0, 5, { cmc: 2, colors: ["W"] });
const blueBird = () => creature("Blue Bird", "Creature — Bird", "{1}{U}", 1, 5, { cmc: 2, colors: ["U"], keywords: ["Flying"], oracleText: "Flying" });
const elfA = () => creature("Elf Scout", "Creature — Elf Scout", "{G}", 1, 1, { cmc: 1, colors: ["G"] });
const elfB = () => creature("Elf Druid", "Creature — Elf Druid", "{G}", 1, 1, { cmc: 1, colors: ["G"] });
const goblin = () => creature("Goblin Scout", "Creature — Goblin Scout", "{R}", 1, 1, { cmc: 1, colors: ["R"] });
const changeling = () => creature("Shapeshifter", "Creature — Shapeshifter", "{2}", 1, 1, { cmc: 2, keywords: ["Changeling"], oracleText: "Changeling (This card is every creature type.)" });
const islandCard = () => card("Island", "Basic Land — Island");
const forestCard = () => card("Forest", "Basic Land — Forest");
const snowIsland = () => card("Snow-Covered Island", "Basic Snow Land — Island");
const desert = () => card("Desert", "Land — Desert", "", { oracleText: "{T}: Add {C}." });
const lavaAxe = () => card("Lava Axe", "Sorcery", "{4}{R}", { cmc: 5, colors: ["R"], oracleText: "Lava Axe deals 5 damage to target player or planeswalker." });
const shock = () => card("Shock", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Shock deals 2 damage to any target." });
const divination = () => card("Divination", "Sorcery", "{2}{U}", { cmc: 3, colors: ["U"], oracleText: "Draw two cards." });
const kws = (s: GameState, id: string, kw: string) => objHasKeyword(s, s.objects[id]!, kw);

describe("Lane B round 32", () => {
  it("compiles every card fully", () => {
    supported(spittingSlug(), parallaxInhibitor(), trapDigger(), rapidFire(), paroxysm(), venarianGold(), kjeldoranGuard(), arcumsSleigh(), metathranAerostat());
    supported(shelteringPrayers(), graxiplon(), exiledDoomsayer(), forethoughtAmulet(), rumblingAftershocks(), cocoon(), consumingFerocity(), barrelingAttack());
  });
});

describe("Combat", () => {
  it("Spitting Slug: paid {1}{G}, the Slug gains first strike; unpaid, the creature blocking it does", () => {
    for (const pay of [true, false]) {
      const { s: s0, ap, opp } = setup([]);
      const slug = putOnBattlefield(s0, ap, spittingSlug());
      const bear = putOnBattlefield(s0, opp, greenBear());
      let s = blockWith(attackWith(s0, [slug], opp), [[bear, slug]]);
      s = settle(s, at("chooseMay", ap));
      expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, pay: { mana: "{1}{G}" } });
      s = settle(answer(s, pay));
      expect([kws(s, slug, "First strike"), kws(s, bear, "First strike")]).toEqual([pay, !pay]);
    }
  });

  it("Spitting Slug: when it blocks, unpaid, the attacker gains first strike", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = passUntil(s0, "main1", opp);
    const slug = putOnBattlefield(s, ap, spittingSlug());
    const ogre = putOnBattlefield(s, opp, redOgre());
    s = blockWith(attackWith(s, [ogre], ap), [[slug, ogre]]);
    s = settle(s, at("chooseMay", ap));
    s = settle(answer(s, false));
    expect([kws(s, slug, "First strike"), kws(s, ogre, "First strike")]).toEqual([false, true]);
  });

  it("Rapid Fire: first strike, and rampage 2 for a creature without rampage", () => {
    const { s: s0, ap, ids, opp } = setup([rapidFire()]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    const w1 = putOnBattlefield(s0, opp, whiteWall());
    const w2 = putOnBattlefield(s0, opp, whiteWall());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(bear)]));
    expect([kws(s, bear, "First strike"), kws(s, bear, "Rampage")]).toEqual([true, true]);
    s = settle(blockWith(attackWith(s, [bear], opp), [[w1, bear], [w2, bear]]));
    expect(pt(s, bear)).toBe("4/4");
  });

  it("Rapid Fire: a creature that has rampage keeps only its own", () => {
    const { s: s0, ap, ids, opp } = setup([rapidFire()]);
    const giant = putOnBattlefield(s0, ap, crawGiant());
    const walls = [0, 1, 2].map(() => putOnBattlefield(s0, opp, whiteWall()));
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(giant)]));
    expect(kws(s, giant, "First strike")).toBe(true);
    s = settle(blockWith(attackWith(s, [giant], opp), walls.map((w) => [w, giant] as [string, string])));
    // Its own rampage 2 for two blockers beyond the first; Rapid Fire gave it no second rampage.
    expect(pt(s, giant)).toBe("10/8");
  });

  it("Barreling Attack: trample, and +1/+1 for each creature blocking it when it becomes blocked", () => {
    for (const n of [1, 2]) {
      const { s: s0, ap, ids, opp } = setup([barrelingAttack()]);
      const bear = putOnBattlefield(s0, ap, greenBear());
      const walls = [0, 1].slice(0, n).map(() => putOnBattlefield(s0, opp, whiteWall()));
      let s = settle(castNow(s0, ap, ids[0]!, [tgt(bear)]));
      expect(kws(s, bear, "Trample")).toBe(true);
      s = settle(blockWith(attackWith(s, [bear], opp), walls.map((w) => [w, bear] as [string, string])));
      expect(pt(s, bear)).toBe(n === 1 ? "3/3" : "4/4");
    }
  });

  it("Barreling Attack: an unblocked creature gets nothing", () => {
    const { s: s0, ap, ids, opp } = setup([barrelingAttack()]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(bear)]));
    s = settle(blockWith(attackWith(s, [bear], opp), []));
    expect(pt(s, bear)).toBe("2/2");
    s = settle(passUntil(s, "main2"));
    expect(life(s, opp)).toBe(38);
  });

  it("Graxiplon: can't be blocked unless the defending player controls three creatures that share a creature type", () => {
    const cases: [() => CardDef, boolean][] = [[goblin, false], [elfB, true], [changeling, true]];
    for (const [third, blockable] of cases) {
      const { s: s0, ap, opp } = setup([]);
      const grax = putOnBattlefield(s0, ap, graxiplon());
      const elf = putOnBattlefield(s0, opp, elfA());
      putOnBattlefield(s0, opp, elfB());
      putOnBattlefield(s0, opp, third());
      const s = attackWith(s0, [grax], opp);
      if (blockable) expect(blockWith(s, [[elf, grax]]).objects[grax]!.blockedBy).toContain(elf);
      else expect(() => blockWith(s, [[elf, grax]])).toThrow();
    }
  });

  it("Kjeldoran Guard: only during combat while a defending player has no snow lands; sacrificed when that creature leaves", () => {
    const { s: s0, ap, opp } = setup([]);
    const guard = putOnBattlefield(s0, ap, kjeldoranGuard());
    const bear = putOnBattlefield(s0, ap, greenBear());
    const beast = putOnBattlefield(s0, opp, bigRedBeast());
    expect(planActivate(s0, ap, guard, 0, [tgt(bear)])).toBeNull();
    let s = attackWith(s0, [bear], opp);
    s = settle(run(s, planActivate(s, ap, guard, 0, [tgt(bear)])));
    expect(pt(s, bear)).toBe("3/3");
    s = settle(blockWith(s, [[beast, bear]]));
    s = settle(passUntil(s, "main2"));
    expect([zone(s, bear), zone(s, guard)]).toEqual(["graveyard", "graveyard"]);
  });

  it("Kjeldoran Guard: not while every defending player controls a snow land", () => {
    const { s: s0, ap } = setup([]);
    const guard = putOnBattlefield(s0, ap, kjeldoranGuard());
    const bear = putOnBattlefield(s0, ap, greenBear());
    const opps = s0.turnOrder.filter((p) => p !== ap);
    for (const p of opps) putOnBattlefield(s0, p, snowIsland());
    const s = attackWith(s0, [bear], opps[0]!);
    expect(planActivate(s, ap, guard, 0, [tgt(bear)])).toBeNull();
  });

  it("Arcum's Sleigh: only during combat while a defending player controls a snow land", () => {
    for (const snow of [false, true]) {
      const { s: s0, ap, opp } = setup([]);
      const sleigh = putOnBattlefield(s0, ap, arcumsSleigh());
      const bear = putOnBattlefield(s0, ap, greenBear());
      if (snow) putOnBattlefield(s0, opp, snowIsland());
      expect(planActivate(s0, ap, sleigh, 0, [tgt(bear)])).toBeNull();
      let s = attackWith(s0, [bear], opp);
      const plan = planActivate(s, ap, sleigh, 0, [tgt(bear)]);
      if (!snow) expect(plan).toBeNull();
      else {
        s = settle(run(s, plan));
        expect(kws(s, bear, "Vigilance")).toBe(true);
      }
    }
  });

  it("Trap Digger: a trap counter on a land, then sacrifice it to deal 3 damage to an attacking creature without flying", () => {
    const { s: s0, ap, opp } = setup([]);
    const digger = putOnBattlefield(s0, ap, trapDigger());
    const land = putOnBattlefield(s0, ap, desert());
    let s = settle(run(s0, planActivate(s0, ap, digger, 0, [tgt(land)])));
    expect(s.objects[land]!.counters?.trap).toBe(1);
    // Not while nothing is attacking.
    const ogre = putOnBattlefield(s, opp, redOgre());
    const bird = putOnBattlefield(s, opp, blueBird());
    expect(planActivate(s, ap, digger, 1, [tgt(ogre)], undefined, undefined, undefined, { sacrifice: [land] })).toBeNull();
    s = passUntil(s, "main1", opp);
    for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: ogre, defender: ap }, { attacker: bird, defender: ap }] });
    for (let i = 0; i < 50 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(planActivate(s, ap, digger, 1, [tgt(bird)], undefined, undefined, undefined, { sacrifice: [land] })).toBeNull();
    s = settle(run(s, planActivate(s, ap, digger, 1, [tgt(ogre)], undefined, undefined, undefined, { sacrifice: [land] })));
    expect([zone(s, land), zone(s, ogre)]).toEqual(["graveyard", "graveyard"]);
  });
});

describe("Auras and upkeeps", () => {
  it("Paroxysm: a land on top destroys the creature; otherwise it gets +3/+3", () => {
    for (const land of [true, false]) {
      const { s: s0, ap, opp } = setup([]);
      const bear = putOnBattlefield(s0, opp, greenBear());
      attach(s0, ap, paroxysm(), bear);
      toZone(s0, opp, land ? forestCard() : divination(), "library");
      const s = settle(passUntil(s0, "upkeep", opp));
      if (land) expect(zone(s, bear)).toBe("graveyard");
      else expect(pt(s, bear)).toBe("5/5");
      expect(hasLog(s, /reveals/)).toBe(true);
    }
  });

  it("Venarian Gold: taps the creature with X sleep counters; it stays tapped until they're all gone", () => {
    const { s: s0, ap, ids, opp } = setup([venarianGold()]);
    const bear = putOnBattlefield(s0, opp, greenBear());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(bear)], 2));
    expect([s.objects[bear]!.tapped, s.objects[bear]!.counters?.sleep]).toEqual([true, 2]);
    s = settle(passUntil(s, "draw", opp));
    expect([s.objects[bear]!.tapped, s.objects[bear]!.counters?.sleep ?? 0]).toEqual([true, 1]);
    s = settle(passUntil(passUntil(s, "end", opp), "draw", opp));
    expect([s.objects[bear]!.tapped, s.objects[bear]!.counters?.sleep ?? 0]).toEqual([true, 0]);
    s = settle(passUntil(passUntil(s, "end", opp), "draw", opp));
    expect(s.objects[bear]!.tapped).toBeFalsy();
  });

  it("Cocoon: taps the creature with three pupa counters; when they're gone, a +1/+1 counter and flying", () => {
    const { s: s0, ap, ids } = setup([cocoon()]);
    const bear = putOnBattlefield(s0, ap, greenBear());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(bear)]));
    const aura = ids[0]!;
    expect([s.objects[bear]!.tapped, s.objects[aura]!.counters?.pupa]).toEqual([true, 3]);
    for (const left of [2, 1, 0]) {
      s = settle(passUntil(passUntil(s, "end", ap), "draw", ap));
      expect([s.objects[bear]!.tapped, s.objects[aura]!.counters?.pupa ?? 0]).toEqual([true, left]);
    }
    s = settle(passUntil(passUntil(s, "end", ap), "draw", ap));
    expect(s.objects[bear]!.tapped).toBeFalsy();
    expect([zone(s, aura), pt(s, bear), kws(s, bear, "Flying")]).toEqual(["graveyard", "3/3", true]);
    // The flying stays.
    s = settle(passUntil(passUntil(s, "end", ap), "draw", ap));
    expect(kws(s, bear, "Flying")).toBe(true);
  });

  it("Consuming Ferocity: a +1/+0 counter each upkeep; at three, the creature hits its controller and is destroyed", () => {
    const { s: s0, ap, ids, opp } = setup([consumingFerocity()]);
    const bear = putOnBattlefield(s0, opp, greenBear());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(bear)]));
    expect(pt(s, bear)).toBe("3/2");
    for (const n of [1, 2]) {
      s = settle(passUntil(passUntil(s, "end", ap), "draw", ap));
      expect([s.objects[bear]!.counters?.["+1/+0"], pt(s, bear)]).toEqual([n, `${3 + n}/2`]);
    }
    s = settle(passUntil(passUntil(s, "end", ap), "draw", ap));
    expect([zone(s, bear), life(s, opp)]).toEqual(["graveyard", 34]);
  });

  it("Consuming Ferocity can't enchant a Wall", () => {
    const { s: s0, ap, ids, opp } = setup([consumingFerocity()]);
    const wall = putOnBattlefield(s0, opp, whiteWall());
    expect(planCast(s0, ap, ids[0]!, [tgt(wall)])).toBeNull();
  });
});

describe("Activated abilities and statics", () => {
  it("Parallax Inhibitor: a fade counter on each permanent with fading you control", () => {
    const { s: s0, ap, opp } = setup([]);
    const inhib = putOnBattlefield(s0, ap, parallaxInhibitor());
    const wave = putOnBattlefield(s0, ap, parallaxWave());
    const derm = putOnBattlefield(s0, ap, blastoderm());
    const theirs = putOnBattlefield(s0, opp, blastoderm());
    const bear = putOnBattlefield(s0, ap, greenBear());
    s0.objects[wave]!.counters = { fade: 2 };
    s0.objects[derm]!.counters = { fade: 1 };
    s0.objects[theirs]!.counters = { fade: 1 };
    const s = settle(run(s0, planActivate(s0, ap, inhib, 0, [])));
    expect([s.objects[wave]!.counters?.fade, s.objects[derm]!.counters?.fade, s.objects[theirs]!.counters?.fade, s.objects[bear]!.counters?.fade, zone(s, inhib)]).toEqual([3, 2, 1, undefined, "graveyard"]);
  });

  it("Metathran Aerostat: X={2} puts a two-drop from your hand onto the battlefield and returns the Aerostat", () => {
    const { s: s0, ap, ids } = setup([greenBear(), redOgre()]);
    const aero = putOnBattlefield(s0, ap, metathranAerostat());
    let s = run(s0, planActivate(s0, ap, aero, 0, [], undefined, undefined, 2));
    s = settle(s, at("searchLibrary", ap));
    // The hand's two-drops only (the hand also holds the cards drawn so far).
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromHand: true });
    const offered = s.pending?.kind === "searchLibrary" ? s.pending.cards : [];
    expect([offered.includes(ids[0]!), offered.includes(ids[1]!)]).toEqual([true, false]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ids[0]!] }));
    expect([zone(s, ids[0]!), zone(s, aero), zone(s, ids[1]!)]).toEqual(["battlefield", "hand", "hand"]);
  });

  it("Metathran Aerostat: putting nothing keeps it on the battlefield", () => {
    const { s: s0, ap, ids } = setup([greenBear()]);
    const aero = putOnBattlefield(s0, ap, metathranAerostat());
    let s = run(s0, planActivate(s0, ap, aero, 0, [], undefined, undefined, 2));
    s = settle(s, at("searchLibrary", ap));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    expect([zone(s, ids[0]!), zone(s, aero)]).toEqual(["hand", "battlefield"]);
  });

  it("Sheltering Prayers: basic lands of a player with three or fewer lands have shroud", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, shelteringPrayers());
    const third = s0.turnOrder.find((p) => p !== ap && p !== opp)!;
    const few = [0, 1, 2].map(() => putOnBattlefield(s0, opp, islandCard()));
    const many = [0, 1, 2, 3].map(() => putOnBattlefield(s0, third, islandCard()));
    const mine = s0.battlefield.find((id) => s0.objects[id]!.controller === ap && s0.cards[s0.objects[id]!.cardId]!.name === "Island")!;
    invalidateCharacteristics(s0);
    expect([kws(s0, few[0]!, "Shroud"), kws(s0, many[0]!, "Shroud"), kws(s0, mine, "Shroud")]).toEqual([true, false, false]);
    // A nonbasic land doesn't have it, but counts.
    const d = putOnBattlefield(s0, opp, desert());
    invalidateCharacteristics(s0);
    expect([kws(s0, few[0]!, "Shroud"), kws(s0, d, "Shroud")]).toEqual([false, false]);
  });

  it("Exiled Doomsayer: morph costs cost {2} more", () => {
    for (const doomsayer of [false, true]) {
      const { s: s0, ap, ids, opp } = setup([infernalCaretaker()]);
      if (doomsayer) putOnBattlefield(s0, opp, exiledDoomsayer());
      let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { faceDown: true })));
      const untapped = (x: GameState) => x.battlefield.filter((id) => x.objects[id]!.controller === ap && !x.objects[id]!.tapped && x.cards[x.objects[id]!.cardId]!.typeLine.includes("Land")).length;
      const before = untapped(s);
      s = settle(run(s, planTurnFaceUp(s, ap, ids[0]!)));
      expect(s.objects[ids[0]!]!.faceDown).toBeUndefined();
      expect(before - untapped(s)).toBe(doomsayer ? 6 : 4);
    }
  });

  it("Forethought Amulet: an instant or sorcery dealing you 3 or more deals 2 instead", () => {
    const { s: s0, ap, ids } = setup([lavaAxe(), shock()]);
    putOnBattlefield(s0, ap, forethoughtAmulet());
    let s = settle(castNow(s0, ap, ids[0]!, [ply(ap)]));
    expect(life(s, ap)).toBe(38);
    s = settle(castNow(s, ap, ids[1]!, [ply(ap)]));
    expect(life(s, ap)).toBe(36);
  });

  it("Forethought Amulet: combat damage isn't changed", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = passUntil(s0, "main1", opp);
    putOnBattlefield(s, ap, forethoughtAmulet());
    const beast = putOnBattlefield(s, opp, bigRedBeast());
    s = settle(blockWith(attackWith(s, [beast], ap), []));
    s = settle(passUntil(s, "main2", opp));
    expect(life(s, ap)).toBe(36);
  });

  it("Rumbling Aftershocks: a spell kicked twice deals 2 damage", () => {
    const { s: s0, ap, ids, opp } = setup([everflowingChalice()]);
    putOnBattlefield(s0, ap, rumblingAftershocks());
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { kicks: [0, 0] }));
    s = settle(s, (x) => x.pending?.kind === "chooseTargets" || at("chooseMay", ap)(x));
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [ply(opp)] });
    s = settle(s, at("chooseMay", ap));
    if (s.pending?.kind === "chooseMay") s = answer(s, true);
    s = settle(s);
    expect(life(s, opp)).toBe(38);
    expect(s.objects[ids[0]!]!.counters?.charge).toBe(2);
  });
});
