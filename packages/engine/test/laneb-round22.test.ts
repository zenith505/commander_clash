// Lane B, round 22: the cards the earlier rounds skipped, least played first (`npm run popular -- --least`).

import { describe, expect, it } from "vitest";
import { act, addEffect, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, applyAction, attackCost, blockCost, botActions, characteristics, invalidateCharacteristics, isFullySupported, parseManaCost, planActivate, planCast, planMana, planTurnFaceUp, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty, answering choices with `options` (in order), else as the bots would. */
const settle = (s: GameState, options: string[] = []) => {
  options = [...options];
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseOption" && options.length) s = act(s, { type: "chooseOption", player: p.player, choice: options.shift()! });
    else if (p?.kind === "declareAttackers" || p?.kind === "declareBlockers") break;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const dmg = (s: GameState, id: string) => s.objects[id]!.damage ?? 0;
const colors = (s: GameState, id: string) => characteristics(s, s.objects[id]!).colors.join("");
const creature = (name: string, typeLine: string, manaCost: string, p: number, t: number, extra: Partial<CardDef> = {}) =>
  card(name, typeLine, manaCost, { power: String(p), toughness: String(t), ...extra });
const redOgre = () => creature("Red Ogre", "Creature — Ogre", "{1}{R}", 2, 2, { cmc: 2 });
const greenBear = () => creature("Green Bear", "Creature — Bear", "{1}{G}", 2, 2, { cmc: 2 });
const bigBeast = () => creature("Big Beast", "Creature — Beast", "{3}{G}", 4, 5, { cmc: 4 });
const legend = () => creature("Old Hero", "Legendary Creature — Human Knight", "{2}{W}", 3, 3, { cmc: 3 });
const shock = card("Shock", "Instant", "{R}", { cmc: 1, oracleText: "Shock deals 2 damage to any target." });
const blaze = card("Blaze", "Sorcery", "{3}{R}", { cmc: 4, oracleText: "Blaze deals 4 damage to any target." });
const lure = card("Lure", "Enchantment — Aura", "{1}{G}{G}", { cmc: 3, keywords: ["Enchant"], oracleText: "Enchant creature\nAll creatures able to block enchanted creature do so." });
const into = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" | "library" = "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], x?: number) => run(s, planCast(s, pid, id, targets, undefined, "auto", x));
const activateNow = (s: GameState, pid: PlayerId, id: string, index: number, targets: TargetChoice[] = []) => run(s, planActivate(s, pid, id, index, targets));
/** Puts an Aura `def` onto the battlefield under `pid`, attached to `host`. */
const attach = (s: GameState, pid: PlayerId, def: CardDef, host: string) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.attachedTo = host;
  invalidateCharacteristics(s);
  return id;
};
/** Mountains for `pid`, so they can pay for an opponent's instant. */
const mountains = (s: GameState, pid: PlayerId, n: number) => {
  for (let i = 0; i < n; i++) putOnBattlefield(s, pid, card(`Mountain ${i}`, "Basic Land — Mountain"));
};
/** Passes to the declare attackers step of the active player's turn and declares `attackers` at `defender`. */
const attackWith = (s: GameState, attackers: string[], defender: PlayerId) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return settle(act(s, { type: "declareAttackers", player: s.activePlayer, attacks: attackers.map((attacker) => ({ attacker, defender })) }));
};
/** Passes to the declare blockers step and has the defending player declare `blocks` (blocker, attacker). */
const blockWith = (s: GameState, blocks: [string, string][]) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  const p = s.pending!;
  return settle(act(s, { type: "declareBlockers", player: p.player, blocks: blocks.map(([blocker, attacker]) => ({ blocker, attacker })) }));
};
/** Everyone passes on to the second main phase, through combat damage and end of combat, answering choices as the bots would. */
const afterCombat = (s: GameState) => {
  for (let i = 0; i < 300 && s.step !== "main2"; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return settle(s);
};
/** Passes priority (empty stack) until `pid` has it. */
const priorityTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 8 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Answers a pending target choice (a triggered ability's targets). */
const chooseTargets = (s: GameState, targets: TargetChoice[]) => {
  for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return act(s, { type: "chooseTargets", player: s.pending!.player, targets });
};
/** Moves on to `pid`'s first main phase, with `defs` on the battlefield under `pid` (not summoning sick). */
const turnOf = (s: GameState, pid: PlayerId, ...defs: CardDef[]) => {
  s = settle(passUntil(s, "main1", pid));
  return { s, ids: defs.map((d) => putOnBattlefield(s, pid, d)) };
};

// Real oracle text (Scryfall).
const lifelace = card("Lifelace", "Instant", "{G}", {"cmc":1,"oracleText":"Target spell or permanent becomes green. (Mana symbols on that permanent remain unchanged.)"});
const purelace = card("Purelace", "Instant", "{W}", {"cmc":1,"oracleText":"Target spell or permanent becomes white. (Mana symbols on that permanent remain unchanged.)"});
const chaoslace = card("Chaoslace", "Instant", "{R}", {"cmc":1,"oracleText":"Target spell or permanent becomes red. (Its mana symbols remain unchanged.)"});
const deathlace = card("Deathlace", "Instant", "{B}", {"cmc":1,"oracleText":"Target spell or permanent becomes black. (Mana symbols on that permanent remain unchanged.)"});
const thoughtlace = card("Thoughtlace", "Instant", "{U}", {"cmc":1,"oracleText":"Target spell or permanent becomes blue. (Mana symbols on that permanent remain unchanged.)"});
const eightandahalftails = card("Eight-and-a-Half-Tails", "Legendary Creature — Fox Cleric", "{W}{W}", {"cmc":2,"power":"2","toughness":"2","oracleText":"{1}{W}: Target permanent you control gains protection from white until end of turn.\n{1}: Target spell or permanent becomes white until end of turn."});
const blindSeer = card("Blind Seer", "Legendary Creature — Human Wizard", "{2}{U}{U}", {"cmc":4,"power":"3","toughness":"3","oracleText":"{1}{U}: Target spell or permanent becomes the color of your choice until end of turn."});
const vodalianMystic = card("Vodalian Mystic", "Creature — Merfolk Wizard", "{1}{U}", {"cmc":2,"power":"1","toughness":"1","oracleText":"{T}: Target instant or sorcery spell becomes the color of your choice."});
const wardOfPiety = card("Ward of Piety", "Enchantment — Aura", "{1}{W}", {"cmc":2,"keywords":["Enchant"],"oracleText":"Enchant creature\n{1}{W}: The next 1 damage that would be dealt to enchanted creature this turn is dealt to any target instead."});
const vassalsDuty = card("Vassal's Duty", "Enchantment", "{3}{W}", {"cmc":4,"oracleText":"{1}: The next 1 damage that would be dealt to target legendary creature you control this turn is dealt to you instead."});
const personalIncarnation = card("Personal Incarnation", "Creature — Avatar Incarnation", "{3}{W}{W}{W}", {"cmc":6,"power":"6","toughness":"6","oracleText":"{0}: The next 1 damage that would be dealt to this creature this turn is dealt to its owner instead. Only this creature's owner may activate this ability.\nWhen this creature dies, its owner loses half their life, rounded up."});
const captainsManeuver = card("Captain's Maneuver", "Instant", "{X}{R}{W}", {"cmc":2,"oracleText":"The next X damage that would be dealt to target creature, planeswalker, or player this turn is dealt to another target creature, planeswalker, or player instead."});
const mirrorwoodTreefolk = card("Mirrorwood Treefolk", "Creature — Treefolk", "{3}{G}", {"cmc":4,"power":"2","toughness":"4","oracleText":"{2}{R}{W}: The next time damage would be dealt to this creature this turn, that damage is dealt to any target instead."});
const glarecaster = card("Glarecaster", "Creature — Bird Cleric", "{4}{W}{W}", {"cmc":6,"power":"3","toughness":"3","keywords":["Flying"],"oracleText":"Flying\n{5}{W}: The next time damage would be dealt to this creature and/or you this turn, that damage is dealt to any target instead."});
const shimianNightStalker = card("Shimian Night Stalker", "Creature — Nightstalker", "{3}{B}{B}", {"cmc":5,"power":"4","toughness":"4","oracleText":"{B}, {T}: All damage that would be dealt to you this turn by target attacking creature is dealt to this creature instead."});
const kjeldoranRoyalGuard = card("Kjeldoran Royal Guard", "Creature — Human Soldier", "{3}{W}{W}", {"cmc":5,"power":"2","toughness":"5","oracleText":"{T}: All combat damage that would be dealt to you by unblocked creatures this turn is dealt to this creature instead."});
const mirrorStrike = card("Mirror Strike", "Instant", "{3}{W}", {"cmc":4,"oracleText":"All combat damage that would be dealt to you this turn by target unblocked creature is dealt to its controller instead."});
const karonasZealot = card("Karona's Zealot", "Creature — Human Cleric", "{4}{W}", {"cmc":5,"power":"2","toughness":"5","keywords":["Morph"],"oracleText":"Morph {3}{W}{W} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)\nWhen this creature is turned face up, all damage that would be dealt to it this turn is dealt to target creature instead."});
const qalSismaBehemoth = card("Qal Sisma Behemoth", "Creature — Ogre Warrior", "{2}{R}", {"cmc":3,"power":"5","toughness":"5","oracleText":"This creature can't attack or block unless you pay {2}."});
const myrPrototype = card("Myr Prototype", "Artifact Creature — Myr", "{5}", {"cmc":5,"power":"2","toughness":"2","oracleText":"At the beginning of your upkeep, put a +1/+1 counter on this creature.\nThis creature can't attack or block unless you pay {1} for each +1/+1 counter on it."});
const cowedByWisdom = card("Cowed by Wisdom", "Enchantment — Aura", "{W}", {"cmc":1,"keywords":["Enchant"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block unless its controller pays {1} for each card in your hand."});
const paleWayfarer = card("Pale Wayfarer", "Creature — Spirit Giant", "{5}{W}{W}", {"cmc":7,"power":"4","toughness":"4","oracleText":"{2}{W}{W}, {Q}: Target creature gains protection from the color of its controller's choice until end of turn. ({Q} is the untap symbol.)"});
const wishmonger = card("Wishmonger", "Creature — Unicorn Monger", "{3}{W}", {"cmc":4,"power":"3","toughness":"3","oracleText":"{2}: Target creature gains protection from the color of its controller's choice until end of turn. Any player may activate this ability."});
const feralContest = card("Feral Contest", "Sorcery", "{3}{G}", {"cmc":4,"oracleText":"Put a +1/+1 counter on target creature you control. Another target creature blocks it this turn if able."});
const monstrousStep = card("Monstrous Step", "Sorcery", "{4}{G}", {"cmc":5,"keywords":["Cycling"],"oracleText":"Target creature gets +7/+7 until end of turn. Up to one other target creature blocks it this turn if able.\nCycling {2} ({2}, Discard this card: Draw a card.)"});
const erhnamDjinn = card("Erhnam Djinn", "Creature — Djinn", "{3}{G}", {"cmc":4,"power":"4","toughness":"5","oracleText":"At the beginning of your upkeep, target non-Wall creature an opponent controls gains forestwalk until your next upkeep. (It can't be blocked as long as defending player controls a Forest.)"});
const crashingBoars = card("Crashing Boars", "Creature — Boar", "{3}{G}{G}", {"cmc":5,"power":"4","toughness":"4","oracleText":"Whenever this creature attacks, defending player chooses an untapped creature they control. That creature blocks this creature this turn if able."});
const balshanBeguiler = card("Balshan Beguiler", "Creature — Human Wizard", "{2}{U}", {"cmc":3,"power":"1","toughness":"1","oracleText":"Whenever this creature deals combat damage to a player, that player reveals the top two cards of their library. You choose one of those cards and put it into their graveyard."});
const pillarTombsOfAku = card("Pillar Tombs of Aku", "World Enchantment", "{2}{B}{B}", {"cmc":4,"oracleText":"At the beginning of each player's upkeep, that player may sacrifice a creature of their choice. If that player doesn't, they lose 5 life and you sacrifice this enchantment."});
const illusionReality = card("Illusion // Reality", "Instant // Instant", "{U} // {2}{G}", { cmc: 4, layout: "split", oracleText: "Target spell or permanent becomes the color of your choice until end of turn.", faces: [
  { name: "Illusion", manaCost: "{U}", typeLine: "Instant", supertypes: [], types: ["Instant"], subtypes: [], oracleText: "Target spell or permanent becomes the color of your choice until end of turn.", colors: ["U"] },
  { name: "Reality", manaCost: "{2}{G}", typeLine: "Instant", supertypes: [], types: ["Instant"], subtypes: [], oracleText: "Destroy target artifact.", colors: ["G"] },
] } as Partial<CardDef>);

describe("Lane B round 22", () => {
  it("supports every card of the round", () => {
    supported(lifelace, purelace, chaoslace, deathlace, thoughtlace, eightandahalftails, blindSeer, vodalianMystic, illusionReality, wardOfPiety, vassalsDuty, personalIncarnation,
      captainsManeuver, mirrorwoodTreefolk, glarecaster, shimianNightStalker, kjeldoranRoyalGuard, mirrorStrike, karonasZealot, qalSismaBehemoth, myrPrototype, cowedByWisdom,
      paleWayfarer, wishmonger, feralContest, monstrousStep, erhnamDjinn, crashingBoars, balshanBeguiler, pillarTombsOfAku);
  });

  describe("the Laces: a spell's or permanent's color", () => {
    const top = (s: GameState): TargetChoice => ({ kind: "stack", id: s.stack[s.stack.length - 1]!.id });

    it("Lifelace makes a creature spell green on the stack, and the creature it becomes stays green (CR 112.4, 400.7a)", () => {
      const { s: s0, ap, ids } = setup([redOgre(), lifelace]);
      let s = castNow(s0, ap, ids[0]!);
      expect(colors(s, ids[0]!)).toBe("R");
      s = castNow(s, ap, ids[1]!, [top(s)]);
      s = act(s, { type: "passPriority", player: ap });
      for (let i = 0; i < 10 && s.stack.length === 2; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.stack.length).toBe(1);
      expect(zone(s, ids[0]!)).toBe("stack");
      expect(colors(s, ids[0]!)).toBe("G");
      s = settle(s);
      expect(zone(s, ids[0]!)).toBe("battlefield");
      expect(colors(s, ids[0]!)).toBe("G");
      s = settle(passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]));
      expect(colors(s, ids[0]!)).toBe("G");
    });

    it("Thoughtlace makes a permanent blue with no end (CR 611.2a)", () => {
      const { s: s0, ap, ids } = setup([thoughtlace]);
      const ogre = putOnBattlefield(s0, ap, redOgre());
      let s = settle(castNow(s0, ap, ids[0]!, [tgt(ogre)]));
      expect(colors(s, ogre)).toBe("U");
      s = settle(passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]));
      expect(colors(s, ogre)).toBe("U");
    });

    it("Blind Seer's color of your choice until end of turn stays with the permanent the spell becomes, until end of turn", () => {
      const { s: s0, ap, ids } = setup([redOgre()]);
      const seer = putOnBattlefield(s0, ap, blindSeer);
      let s = castNow(s0, ap, ids[0]!);
      s = activateNow(s, ap, seer, 0, [top(s)]);
      s = settle(s, ["White"]);
      expect(zone(s, ids[0]!)).toBe("battlefield");
      expect(colors(s, ids[0]!)).toBe("W");
      s = settle(passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]));
      expect(colors(s, ids[0]!)).toBe("R");
    });

    it("Vodalian Mystic targets only an instant or sorcery spell, and that spell becomes the chosen color", () => {
      const { s: s0, ap, ids, opp } = setup([shock, redOgre()]);
      const mystic = putOnBattlefield(s0, ap, vodalianMystic);
      let s = castNow(s0, ap, ids[1]!);
      expect(planActivate(s, ap, mystic, 0, [top(s)])).toBeNull();
      s = settle(s);
      s = castNow(s, ap, ids[0]!, [ply(opp)]);
      const shockSpell = top(s);
      s = activateNow(s, ap, mystic, 0, [shockSpell]);
      s = act(s, { type: "passPriority", player: ap });
      for (let i = 0; i < 10 && !s.pending && s.stack.length === 2; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      s = act(s, { type: "chooseOption", player: ap, choice: "Black" });
      expect(zone(s, ids[0]!)).toBe("stack");
      expect(colors(s, ids[0]!)).toBe("B");
    });
  });
  describe("redirection shields", () => {
    it("Ward of Piety sends the next 1 damage to the enchanted creature to any target", () => {
      const { s: s0, ap, ids, opp } = setup([shock]);
      const beast = putOnBattlefield(s0, ap, bigBeast());
      const ward = attach(s0, ap, wardOfPiety, beast);
      let s = settle(activateNow(s0, ap, ward, 0, [ply(opp)]));
      s = settle(castNow(s, ap, ids[0]!, [tgt(beast)]));
      expect(dmg(s, beast)).toBe(1);
      expect(life(s, opp)).toBe(39);
    });

    it("Vassal's Duty targets only a legendary creature you control and sends the next 1 damage to you", () => {
      const { s: s0, ap, ids } = setup([shock]);
      const hero = putOnBattlefield(s0, ap, legend());
      const bear = putOnBattlefield(s0, ap, greenBear());
      const duty = putOnBattlefield(s0, ap, vassalsDuty);
      expect(planActivate(s0, ap, duty, 0, [tgt(bear)])).toBeNull();
      let s = settle(activateNow(s0, ap, duty, 0, [tgt(hero)]));
      s = settle(castNow(s, ap, ids[0]!, [tgt(hero)]));
      expect(dmg(s, hero)).toBe(1);
      expect(life(s, ap)).toBe(39);
    });

    it("Personal Incarnation's ability: only its owner may activate it, and the damage goes to its owner, even while another player controls it", () => {
      const { s: s0, ap, ids, opp } = setup([shock]);
      const pi = putOnBattlefield(s0, ap, personalIncarnation);
      addEffect(s0, opp, [pi], [{ kind: "control" }], "game");
      expect(abilityProblem(s0, opp, pi, 0)).toMatch(/owner/);
      expect(abilityProblem(s0, ap, pi, 0)).toBeNull();
      let s = settle(activateNow(s0, ap, pi, 0));
      s = settle(castNow(s, ap, ids[0]!, [tgt(pi)]));
      expect(dmg(s, pi)).toBe(1);
      expect(life(s, ap)).toBe(39);
      expect(life(s, opp)).toBe(40);
    });

    it("Captain's Maneuver with X=2 sends 2 of Blaze's 4 damage to another target", () => {
      const { s: s0, ap, ids, opp } = setup([captainsManeuver, blaze]);
      const beast = putOnBattlefield(s0, ap, bigBeast());
      expect(planCast(s0, ap, ids[0]!, [tgt(beast), tgt(beast)], undefined, "auto", 2)).toBeNull();
      let s = settle(castNow(s0, ap, ids[0]!, [tgt(beast), ply(opp)], 2));
      s = settle(castNow(s, ap, ids[1]!, [tgt(beast)]));
      expect(dmg(s, beast)).toBe(2);
      expect(life(s, opp)).toBe(38);
    });

    it("Mirrorwood Treefolk sends all the damage of the next damage event to any target, once", () => {
      const { s: s0, ap, ids, opp } = setup([blaze, shock]);
      const tree = putOnBattlefield(s0, ap, mirrorwoodTreefolk);
      let s = settle(activateNow(s0, ap, tree, 0, [ply(opp)]));
      s = settle(castNow(s, ap, ids[0]!, [tgt(tree)]));
      expect(dmg(s, tree)).toBe(0);
      expect(life(s, opp)).toBe(36);
      s = settle(castNow(s, ap, ids[1]!, [tgt(tree)]));
      expect(dmg(s, tree)).toBe(2);
    });

    it("Glarecaster's shield also covers its controller", () => {
      const { s: s0, ap, ids, opp } = setup([shock]);
      const glare = putOnBattlefield(s0, ap, glarecaster);
      let s = settle(activateNow(s0, ap, glare, 0, [ply(opp)]));
      s = settle(castNow(s, ap, ids[0]!, [ply(ap)]));
      expect(life(s, ap)).toBe(40);
      expect(life(s, opp)).toBe(38);
      expect(dmg(s, glare)).toBe(0);
    });

    it("Shimian Night Stalker takes the damage an attacking creature would deal to you", () => {
      const { s: s0, ap, opp } = setup([]);
      const stalker = putOnBattlefield(s0, ap, shimianNightStalker);
      let { s, ids } = turnOf(s0, opp, bigBeast());
      s = priorityTo(attackWith(s, [ids[0]!], ap), ap);
      expect(planActivate(s, ap, stalker, 0, [tgt(stalker)])).toBeNull();
      s = settle(activateNow(s, ap, stalker, 0, [tgt(ids[0]!)]));
      s = afterCombat(blockWith(s, []));
      expect(life(s, ap)).toBe(40);
      expect(zone(s, stalker)).toBe("graveyard");
    });

    it("Kjeldoran Royal Guard takes the combat damage of every unblocked creature, but not other damage", () => {
      const { s: s0, ap, opp } = setup([]);
      const guard = putOnBattlefield(s0, ap, kjeldoranRoyalGuard);
      let { s, ids } = turnOf(s0, opp, greenBear(), redOgre(), shock);
      s.battlefield.splice(s.battlefield.indexOf(ids[2]!), 1);
      s.objects[ids[2]!]!.zone = "hand";
      s.players[opp]!.hand.push(ids[2]!);
      mountains(s, opp, 1);
      s = priorityTo(attackWith(s, [ids[0]!, ids[1]!], ap), ap);
      s = settle(activateNow(s, ap, guard, 0));
      s = afterCombat(blockWith(s, []));
      expect(life(s, ap)).toBe(40);
      expect(dmg(s, guard)).toBe(4);
      s = settle(castNow(s, opp, ids[2]!, [ply(ap)]));
      expect(life(s, ap)).toBe(38);
    });

    it("Mirror Strike sends an unblocked creature's combat damage to its controller", () => {
      const { s: s0, ap, ids: hand, opp } = setup([mirrorStrike]);
      let { s, ids } = turnOf(s0, opp, bigBeast());
      s = afterCombat(blockWith(attackWith(s, [ids[0]!], ap), []));
      expect(life(s, ap)).toBe(36);
      ({ s, ids } = turnOf(s, opp));
      const beast = Object.values(s.objects).find((o) => o.zone === "battlefield" && s.cards[o.cardId]!.name === "Big Beast")!.id;
      s = blockWith(attackWith(s, [beast], ap), []);
      s = priorityTo(s, ap);
      s = settle(castNow(s, ap, hand[0]!, [tgt(beast)]));
      s = afterCombat(s);
      expect(life(s, ap)).toBe(36);
      expect(life(s, opp)).toBe(36);
    });

    it("Karona's Zealot, turned face up, sends all damage dealt to it this turn to target creature", () => {
      const { s: s0, ap, ids, opp } = setup([karonasZealot, blaze]);
      const bear = putOnBattlefield(s0, opp, greenBear());
      let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { faceDown: true })));
      s = run(s, planTurnFaceUp(s, ap, ids[0]!));
      s = settle(chooseTargets(s, [tgt(bear)]));
      expect(s.objects[ids[0]!]!.faceDown).toBeUndefined();
      s = settle(castNow(s, ap, ids[1]!, [tgt(ids[0]!)]));
      expect(dmg(s, ids[0]!)).toBe(0);
      expect(zone(s, bear)).toBe("graveyard");
    });
  });
  describe("costs to attack or block (CR 508.1h, 509.1c-e)", () => {
    it("Qal Sisma Behemoth can't attack unless its controller pays {2}", () => {
      const { s: s0, ap, opp } = setup([]);
      const beh = putOnBattlefield(s0, ap, qalSismaBehemoth);
      let s = s0;
      for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(attackCost(s, [{ attacker: beh, defender: opp }])).toBe("{2}");
      expect(() => applyAction(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: beh, defender: opp }] })).toThrow(/costs \{2\}/);
      s = run(s, [...planMana(s, ap, parseManaCost("{2}"))!, { type: "declareAttackers", player: ap, attacks: [{ attacker: beh, defender: opp }] }]);
      expect(s.objects[beh]!.attacking).toBe(opp);
    });

    it("Qal Sisma Behemoth can't block unless its controller pays {2}, and a block requirement never obliges it to pay (CR 509.1d)", () => {
      const { s: s0, ap, opp } = setup([]);
      const beh = putOnBattlefield(s0, ap, qalSismaBehemoth);
      let { s, ids } = turnOf(s0, opp, greenBear());
      attach(s, opp, lure, ids[0]!);
      s = attackWith(s, [ids[0]!], ap);
      for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(blockCost(s, 1, [beh])).toBe("{2}");
      expect(() => applyAction(s, { type: "declareBlockers", player: ap, blocks: [{ blocker: beh, attacker: ids[0]! }] })).toThrow(/costs \{2\}/);
      // Lure: all creatures able to block must, but paying a cost to block is never required.
      expect(() => applyAction(s, { type: "declareBlockers", player: ap, blocks: [] })).not.toThrow();
      s = run(s, [...planMana(s, ap, parseManaCost("{2}"))!, { type: "declareBlockers", player: ap, blocks: [{ blocker: beh, attacker: ids[0]! }] }]);
      s = afterCombat(settle(s));
      expect(zone(s, ids[0]!)).toBe("graveyard");
      expect(life(s, ap)).toBe(40);
    });

    it("a bot that can't pay doesn't block with Qal Sisma Behemoth", () => {
      const { s: s0, ap, opp } = setup([]);
      const beh = putOnBattlefield(s0, opp, qalSismaBehemoth);
      const ogre = putOnBattlefield(s0, ap, redOgre());
      let s = attackWith(s0, [ogre], opp);
      for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      for (const a of botActions(s, opp)) s = act(s, a);
      expect(s.objects[beh]!.blocking ?? []).toEqual([]);
    });

    it("Myr Prototype's cost is {1} for each +1/+1 counter on it", () => {
      const { s: s0, ap, opp } = setup([]);
      const myr = putOnBattlefield(s0, ap, myrPrototype);
      expect(blockCost(s0, 1, [myr])).toBe("");
      s0.objects[myr]!.counters["+1/+1"] = 3;
      invalidateCharacteristics(s0);
      expect(blockCost(s0, 1, [myr])).toBe("{3}");
      expect(attackCost(s0, [{ attacker: myr, defender: opp }])).toBe("{3}");
    });

    it("Cowed by Wisdom's cost counts the cards in its controller's hand, not the creature's controller's", () => {
      const { s: s0, ap, opp } = setup([shock, blaze, lure]);
      const bear = putOnBattlefield(s0, opp, greenBear());
      attach(s0, ap, cowedByWisdom, bear);
      const n = s0.players[ap]!.hand.length;
      expect(s0.players[opp]!.hand.length).not.toBe(n);
      expect(attackCost(s0, [{ attacker: bear, defender: ap }])).toBe(`{${n}}`);
      expect(blockCost(s0, 1, [bear])).toBe(`{${n}}`);
    });
  });

  describe("other cards", () => {
    it("Pale Wayfarer: the target's controller chooses the color", () => {
      const { s: s0, ap, opp } = setup([]);
      const way = putOnBattlefield(s0, ap, paleWayfarer);
      const bear = putOnBattlefield(s0, opp, greenBear());
      s0.objects[way]!.tapped = true;
      let s = activateNow(s0, ap, way, 0, [tgt(bear)]);
      expect(s.objects[way]!.tapped).toBe(false);
      for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp });
      s = settle(act(s, { type: "chooseOption", player: opp, choice: "Red" }));
      expect(characteristics(s, s.objects[bear]!).keywords.some((k) => /^protection from red$/i.test(k))).toBe(true);
    });

    it("Feral Contest: another target creature must block the one that got the counter", () => {
      const { s: s0, ap, ids, opp } = setup([feralContest]);
      const bear = putOnBattlefield(s0, ap, greenBear());
      const beast = putOnBattlefield(s0, opp, bigBeast());
      const ogre = putOnBattlefield(s0, opp, redOgre());
      expect(planCast(s0, ap, ids[0]!, [tgt(bear), tgt(bear)])).toBeNull();
      let s = settle(castNow(s0, ap, ids[0]!, [tgt(bear), tgt(beast)]));
      expect(power(s, s.objects[bear]!)).toBe(3);
      s = attackWith(s, [bear], opp);
      for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(() => applyAction(s, { type: "declareBlockers", player: opp, blocks: [] })).toThrow();
      expect(() => applyAction(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: ogre, attacker: bear }] })).toThrow();
      s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: beast, attacker: bear }] });
      expect(s.objects[beast]!.blocking).toEqual([bear]);
    });

    it("Monstrous Step works with no second target", () => {
      const { s: s0, ap, ids } = setup([monstrousStep]);
      const bear = putOnBattlefield(s0, ap, greenBear());
      const s = settle(castNow(s0, ap, ids[0]!, [tgt(bear), { kind: "none" }]));
      expect(power(s, s.objects[bear]!)).toBe(9);
    });

    it("Erhnam Djinn's forestwalk lasts until its controller's next upkeep", () => {
      const { s: s0, ap, opp } = setup([]);
      putOnBattlefield(s0, ap, erhnamDjinn);
      const bear = putOnBattlefield(s0, opp, greenBear());
      const walks = (s: GameState) => characteristics(s, s.objects[bear]!).keywords.some((k) => /^forestwalk$/i.test(k));
      let s = passUntil(s0, "upkeep", ap);
      s = settle(chooseTargets(s, [tgt(bear)]));
      expect(walks(s)).toBe(true);
      s = settle(passUntil(s, "main1", opp));
      expect(walks(s)).toBe(true);
      s = passUntil(s, "end", s.turnOrder[(s.turnOrder.indexOf(ap) + 3) % 4]);
      expect(walks(s)).toBe(true);
      s = passUntil(s, "upkeep", ap);
      for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(walks(s)).toBe(false);
    });

    it("Crashing Boars: the defending player chooses an untapped creature, and it must block the Boars", () => {
      const { s: s0, ap, opp } = setup([]);
      const boars = putOnBattlefield(s0, ap, crashingBoars);
      const bear = putOnBattlefield(s0, opp, greenBear());
      const tappedOgre = putOnBattlefield(s0, opp, redOgre());
      s0.objects[tappedOgre]!.tapped = true;
      let s = s0;
      for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: boars, defender: opp }] });
      for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.pending?.player).toBe(opp);
      s = settle(s);
      for (let i = 0; i < 50 && s.pending?.kind !== "declareBlockers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(() => applyAction(s, { type: "declareBlockers", player: opp, blocks: [] })).toThrow();
      s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: bear, attacker: boars }] });
      expect(s.objects[bear]!.blocking).toEqual([boars]);
    });

    it("Balshan Beguiler: its controller puts one of the top two cards into the damaged player's graveyard", () => {
      const { s: s0, ap, opp } = setup([]);
      const beg = putOnBattlefield(s0, ap, balshanBeguiler);
      const top2 = s0.players[opp]!.library.slice(0, 2);
      const yard = s0.players[opp]!.graveyard.length;
      let s = afterCombat(blockWith(attackWith(s0, [beg], opp), []));
      expect(life(s, opp)).toBe(39);
      expect(s.players[opp]!.graveyard.length).toBe(yard + 1);
      const milled = s.players[opp]!.graveyard[s.players[opp]!.graveyard.length - 1]!;
      expect(top2).toContain(milled);
      expect(s.players[opp]!.library[0]).toBe(top2.find((id) => id !== milled));
    });

    it("Pillar Tombs of Aku: a player who doesn't sacrifice a creature loses 5 life, and its controller sacrifices it", () => {
      const { s: s0, ap, opp } = setup([]);
      const tombs = putOnBattlefield(s0, ap, pillarTombsOfAku);
      const bear = putOnBattlefield(s0, opp, greenBear());
      let s = passUntil(s0, "upkeep", opp);
      for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp });
      s = settle(act(s, { type: "chooseOption", player: opp, choice: "none" }));
      expect(life(s, opp)).toBe(35);
      expect(zone(s, tombs)).toBe("graveyard");
      expect(zone(s, bear)).toBe("battlefield");
    });

    it("Pillar Tombs of Aku: sacrificing a creature keeps it on the battlefield", () => {
      const { s: s0, ap, opp } = setup([]);
      const tombs = putOnBattlefield(s0, ap, pillarTombsOfAku);
      const bear = putOnBattlefield(s0, opp, greenBear());
      let s = passUntil(s0, "upkeep", opp);
      for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      const p = s.pending as Extract<GameState["pending"], { kind: "chooseOption" }>;
      s = settle(act(s, { type: "chooseOption", player: opp, choice: p.options[0]! }));
      expect(zone(s, bear)).toBe("graveyard");
      expect(life(s, opp)).toBe(40);
      expect(zone(s, tombs)).toBe("battlefield");
    });

    it("the world rule: only the newest World permanent stays (CR 704.5k)", () => {
      const { s: s0, ap, ids, opp } = setup([pillarTombsOfAku]);
      const other = putOnBattlefield(s0, opp, card("Test World", "World Enchantment", "{2}{G}", { cmc: 3 }));
      const s = settle(castNow(s0, ap, ids[0]!));
      expect(zone(s, ids[0]!)).toBe("battlefield");
      expect(zone(s, other)).toBe("graveyard");
      expect(s.log.some((l) => /world rule/.test(typeof l === "string" ? l : JSON.stringify(l)))).toBe(true);
    });
  });
});
