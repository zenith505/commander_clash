// Round 187: more of the harder cards both lanes skipped, from the most played down: "the greatest mana value of a
// commander you own on the battlefield or in the command zone" (Cloudkill, Majestic Genesis, Imposing Grandeur and the
// Visions cycle's flashback cost), counter-threshold triggers worded with a number word (Mazemind Tome, Nine Lives) and
// Nine Lives' prevention.

import { describe, expect, it } from "vitest";
import { act, bear, card, mountain, passUntil, putOnBattlefield, setup } from "./helpers";
import { characteristics, controllerOf, invalidateCharacteristics, isFullySupported, moveObject, parseManaCost, planActivate, planCast, planMana, power, spellCost, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Says yes (or no) to a "you may" question, paying its mana first. */
const may = (s: GameState, yes: boolean) => {
  if (s.pending?.kind !== "chooseMay") throw new Error("no question");
  const pid = s.pending.player;
  if (yes && s.pending.pay?.mana) for (const a of planMana(s, pid, parseManaCost(s.pending.pay.mana))!) s = act(s, a);
  return act(s, { type: "chooseMay", player: pid, yes });
};
/** Everyone passes until the stack is empty; "you may" questions get `yes`. Stops at any other question. */
const resolveAll = (s: GameState, yes: boolean | ((s: GameState) => boolean) = true) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending?.kind === "chooseMay"); i++) {
    if (s.pending?.kind === "chooseMay") s = may(s, typeof yes === "function" ? yes(s) : yes);
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Answers a target question for a trigger, if one is asked. */
const choose = (s: GameState, targets: TargetChoice[]) => (s.pending?.kind === "chooseTargets" ? resolveAll(act(s, { type: "chooseTargets", player: s.pending.player, targets })) : s);
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
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const counters = (s: GameState, id: string, c = "+1/+1") => s.objects[id]!.counters[c] ?? 0;
const pt = (s: GameState, id: ObjectId) => [power(s, s.objects[id]!), toughness(s, s.objects[id]!)];
const chars = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!);
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && [name, `${name} Token`].includes(chars(s, id).name));
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const commanderOf = (s: GameState, pid: PlayerId) => s.players[pid]!.command[0]!;
/** A second commander of mana value `mv` for `pid`, on the battlefield. */
const bigCommander = (s: GameState, pid: PlayerId, mv: number) => putOnBattlefield(s, pid, card(`Test Commander ${mv}`, "Legendary Creature — Giant", `{${mv - 1}}{G}`, { cmc: mv, power: "4", toughness: "4" }), { commander: true });
const relic = card("Test Relic", "Artifact", "{1}", { cmc: 1 });
const reanimate = card("Test Reanimate", "Sorcery", "{B}", { cmc: 1, oracleText: "Return target creature card from your graveyard to the battlefield." });
const pinger = card("Test Pinger", "Artifact", "{1}", { cmc: 1, oracleText: "{1}: This artifact deals 1 damage to any target." });

// Real oracle text (Scryfall).
const imposingGrandeur = card("Imposing Grandeur", "Sorcery", "{4}{R}", {"cmc":5,"oracleText":"Each player may discard their hand and draw cards equal to the greatest mana value of a commander they own on the battlefield or in the command zone.","colors":["R"],"layout":"normal"});
const majesticGenesis = card("Majestic Genesis", "Sorcery", "{6}{G}{G}", {"cmc":8,"oracleText":"Reveal the top X cards of your library, where X is the greatest mana value of a commander you own on the battlefield or in the command zone. You may put any number of permanent cards from among them onto the battlefield. Put the rest on the bottom of your library in a random order.","colors":["G"],"layout":"normal"});
const visionsOfGlory = card("Visions of Glory", "Sorcery", "{4}{W}", {"cmc":5,"keywords":["Flashback"],"oracleText":"Create a 1/1 white Human creature token for each creature you control.\nFlashback {8}{W}{W}. This spell costs {X} less to cast this way, where X is the greatest mana value of a commander you own on the battlefield or in the command zone. (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["W"],"layout":"normal"});
const visionsOfDread = card("Visions of Dread", "Sorcery", "{2}{B}", {"cmc":3,"keywords":["Flashback"],"oracleText":"Target opponent puts a creature card of their choice from their graveyard onto the battlefield under your control.\nFlashback {8}{B}{B}. This spell costs {X} less to cast this way, where X is the greatest mana value of a commander you own on the battlefield or in the command zone. (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["B"],"layout":"normal"});
const visionsOfRuin = card("Visions of Ruin", "Sorcery", "{3}{R}", {"cmc":4,"keywords":["Treasure","Flashback"],"oracleText":"Each opponent sacrifices an artifact. For each artifact sacrificed this way, you create a Treasure token.\nFlashback {8}{R}{R}. This spell costs {X} less to cast this way, where X is the greatest mana value of a commander you own on the battlefield or in the command zone. (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["R"],"layout":"normal"});
const visionsOfDominance = card("Visions of Dominance", "Sorcery", "{2}{G}", {"cmc":3,"keywords":["Flashback","Double"],"oracleText":"Put a +1/+1 counter on target creature, then double the number of +1/+1 counters on it.\nFlashback {8}{G}{G}. This spell costs {X} less to cast this way, where X is the greatest mana value of a commander you own on the battlefield or in the command zone. (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["G"],"layout":"normal"});
const visionsOfDuplicity = card("Visions of Duplicity", "Sorcery", "{2}{U}", {"cmc":3,"keywords":["Flashback"],"oracleText":"Exchange control of two target creatures you don't control.\nFlashback {8}{U}{U}. This spell costs {X} less to cast this way, where X is the greatest mana value of a commander you own on the battlefield or in the command zone. (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["U"],"layout":"normal"});
const cloudkill = card("Cloudkill", "Sorcery", "{4}{B}{B}", {"cmc":6,"oracleText":"All creatures get -X/-X until end of turn, where X is the greatest mana value of a commander you own on the battlefield or in the command zone.","colors":["B"],"layout":"normal"});
const mazemindTome = card("Mazemind Tome", "Artifact — Book", "{2}", {"cmc":2,"keywords":["Scry"],"oracleText":"{T}, Put a page counter on this artifact: Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\n{2}, {T}, Put a page counter on this artifact: Draw a card.\nWhen there are four or more page counters on this artifact, exile it. If you do, you gain 4 life.","layout":"normal"});
const nineLives = card("Nine Lives", "Enchantment", "{1}{W}{W}", {"cmc":3,"keywords":["Hexproof"],"oracleText":"Hexproof\nIf a source would deal damage to you, prevent that damage and put an incarnation counter on this enchantment.\nWhen there are nine or more incarnation counters on this enchantment, exile it.\nWhen this enchantment leaves the battlefield, you lose the game.","colors":["W"],"layout":"normal"});
const archfiendsVessel = card("Archfiend's Vessel", "Creature — Human Cleric", "{B}", {"cmc":1,"power":"1","toughness":"1","keywords":["Lifelink"],"oracleText":"Lifelink (Damage dealt by this creature also causes you to gain that much life.)\nWhen this creature enters, if it entered from your graveyard or you cast it from your graveyard, exile it. If you do, create a 5/5 black Demon creature token with flying.","colors":["B"],"layout":"normal"});
const deadlyDesigns = card("Deadly Designs", "Enchantment", "{1}{B}", {"cmc":2,"oracleText":"{2}: Put a plot counter on this enchantment. Any player may activate this ability.\nWhen there are five or more plot counters on this enchantment, sacrifice it. If you do, destroy up to two target creatures.","colors":["B"],"layout":"normal"});

describe("round 187", () => {
  it("all compile", () => supported(imposingGrandeur, majesticGenesis, visionsOfGlory, visionsOfDread, visionsOfRuin, visionsOfDominance, visionsOfDuplicity, cloudkill, mazemindTome, nineLives, archfiendsVessel, deadlyDesigns));

  it("Cloudkill: X is the greatest mana value among your commanders on the battlefield or in the command zone, not elsewhere", () => {
    let { s, ap, ids, opp } = setup([cloudkill]);
    const big = putOnBattlefield(s, opp, card("Test Wurm", "Creature — Wurm", "{6}{G}", { cmc: 7, power: "7", toughness: "7" }));
    // In the graveyard, a commander doesn't count.
    const yard = into(s, ap, card("Test Commander 9", "Legendary Creature — Giant", "{8}{G}", { cmc: 9, power: "4", toughness: "4" }), "graveyard");
    s.objects[yard]!.isCommander = true;
    bigCommander(s, ap, 4);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(pt(s, big)).toEqual([3, 3]);
  });

  it("Cloudkill: with only the commander in the command zone (mana value 2), -2/-2", () => {
    let { s, ap, ids, opp } = setup([cloudkill]);
    expect(zone(s, commanderOf(s, ap))).toBe("command");
    const big = putOnBattlefield(s, opp, card("Test Wurm", "Creature — Wurm", "{6}{G}", { cmc: 7, power: "7", toughness: "7" }));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(pt(s, big)).toEqual([5, 5]);
  });

  it("Majestic Genesis reveals the top X cards, X the greatest mana value of a commander you own there", () => {
    let { s, ap, ids } = setup([majesticGenesis]);
    bigCommander(s, ap, 5);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    const p = s.pending;
    if (p?.kind !== "searchLibrary") throw new Error("no choice");
    expect(p.dig?.looked).toHaveLength(5);
    const top = p.dig!.looked;
    const permanents = p.cards;
    s = act(s, { type: "searchLibrary", player: ap, found: permanents });
    for (const id of permanents) expect(zone(s, id)).toBe("battlefield");
    const lib = s.players[ap]!.library;
    for (const id of top.filter((id) => !permanents.includes(id))) expect(lib.slice(-5)).toContain(id);
  });

  it("Imposing Grandeur: each player who chooses to discards their hand and draws their own commander's mana value", () => {
    let { s, ap, ids } = setup([imposingGrandeur, relic, relic]);
    const others = s.turnOrder.filter((p) => p !== ap);
    const [b, c] = others;
    bigCommander(s, b!, 6);
    // C's commander is in the graveyard: 0 cards.
    const cc = commanderOf(s, c!);
    s.players[c!]!.command = [];
    s.players[c!]!.graveyard.push(cc);
    s.objects[cc]!.zone = "graveyard";
    const hands = Object.fromEntries(s.turnOrder.map((p) => [p, s.players[p]!.hand.length]));
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    // The bots read each player's own number.
    const wheels: Record<number, number | undefined> = {};
    s = resolveAll(s, (now) => {
      if (now.pending?.kind !== "chooseMay") return false;
      wheels[now.pending.player] = now.pending.wheel;
      return now.pending.player !== others[2];
    });
    expect(wheels[b!]).toBe(6);
    expect(wheels[ap]).toBe(2);
    expect(s.players[ap]!.hand).toHaveLength(2);
    expect(s.players[b!]!.hand).toHaveLength(6);
    expect(s.players[c!]!.hand).toHaveLength(0);
    expect(s.players[others[2]!]!.hand).toHaveLength(hands[others[2]!]!);
  });

  it("the Visions cycle's flashback costs {X} less, X the greatest mana value of a commander you own on the battlefield or in the command zone", () => {
    let { s, ap } = setup([]);
    const g = into(s, ap, visionsOfGlory, "graveyard");
    const generic = () => spellCost(s, ap, s.objects[g]!, 0, [], { via: "flashback" }).extra;
    expect(generic()).toBe(6); // {8}{W}{W} less 2 for the commander in the command zone
    bigCommander(s, ap, 7);
    expect(generic()).toBe(1);
    // Not from the hand: its mana cost.
    const h = into(s, ap, visionsOfGlory, "hand");
    expect(spellCost(s, ap, s.objects[h]!).extra).toBe(4);
    // Cast it: a 1/1 Human for each creature you control, then exiled.
    putOnBattlefield(s, ap, bear());
    s = resolveAll(run(s, planCast(s, ap, g, undefined, undefined, undefined, undefined, { via: "flashback" })));
    expect(named(s, ap, "Human")).toHaveLength(2);
    expect(zone(s, g)).toBe("exile");
  });

  it("Visions of Dread: the target opponent chooses a creature card in their graveyard, which enters under your control", () => {
    let { s, ap, ids, opp } = setup([visionsOfDread]);
    const small = into(s, opp, bear(), "graveyard");
    const big = into(s, opp, card("Test Wurm", "Creature — Wurm", "{6}{G}", { cmc: 7, power: "7", toughness: "7" }), "graveyard");
    s = run(s, planCast(s, ap, ids[0]!, [player(opp)]));
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const p = s.pending;
    if (p?.kind !== "searchLibrary") throw new Error("no choice");
    expect(p.player).toBe(opp);
    expect(p.under).toBe(ap);
    expect(p.cards).toEqual(expect.arrayContaining([small, big]));
    s = act(s, { type: "searchLibrary", player: opp, found: [small] });
    expect(zone(s, small)).toBe("battlefield");
    expect(controllerOf(s, s.objects[small]!)).toBe(ap);
    expect(s.objects[small]!.owner).toBe(opp);
    expect(zone(s, big)).toBe("graveyard");
  });

  it("Visions of Ruin: a Treasure for each artifact sacrificed this way", () => {
    let { s, ap, ids } = setup([visionsOfRuin]);
    const others = s.turnOrder.filter((p) => p !== ap);
    putOnBattlefield(s, others[0]!, relic);
    putOnBattlefield(s, others[1]!, relic);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    for (let i = 0; i < 6 && s.pending?.kind === "pickPermanents"; i++) s = resolveAll(act(s, { type: "pickPermanents", player: s.pending.player, ids: s.pending.options.slice(0, 1) }));
    expect(named(s, ap, "Treasure")).toHaveLength(2);
  });

  it("Mazemind Tome: the fourth page counter exiles it, and you gain 4 life", () => {
    let { s, ap } = setup([]);
    const t = putOnBattlefield(s, ap, mazemindTome);
    s.objects[t]!.counters.page = 3;
    const before = life(s, ap);
    s = resolveAll(run(s, planActivate(s, ap, t, 1)));
    expect(zone(s, t)).toBe("exile");
    expect(life(s, ap)).toBe(before + 4);
  });

  it("Mazemind Tome: if it already left the battlefield, no life is gained", () => {
    let { s, ap } = setup([]);
    const t = putOnBattlefield(s, ap, mazemindTome);
    s.objects[t]!.counters.page = 3;
    const before = life(s, ap);
    s = run(s, planActivate(s, ap, t, 1));
    for (let i = 0; i < 10 && !s.triggerQueue.length && !s.stack.some((x) => x.kind !== "spell" && x.sourceId === t && x !== s.stack[0]); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    moveObject(s, t, "graveyard");
    s = resolveAll(s);
    expect(zone(s, t)).toBe("graveyard");
    expect(life(s, ap)).toBe(before);
  });

  it("Nine Lives prevents damage to you, a counter for each source; nine counters exile it and you lose", () => {
    let { s, ap, opp } = setup([]);
    const n = putOnBattlefield(s, ap, nineLives);
    const p = putOnBattlefield(s, opp, pinger);
    for (let i = 0; i < 3; i++) putOnBattlefield(s, opp, mountain);
    const before = life(s, ap);
    s = passUntil(s, "main1", opp);
    s = resolveAll(run(s, planActivate(s, opp, p, 0, [player(ap)])));
    expect(life(s, ap)).toBe(before);
    expect(counters(s, n, "incarnation")).toBe(1);
    // Two attackers at once: one counter for each source.
    const a1 = putOnBattlefield(s, opp, bear());
    const a2 = putOnBattlefield(s, opp, bear());
    s = act(passUntil(s, "declareAttackers", opp), { type: "declareAttackers", player: opp, attacks: [a1, a2].map((attacker) => ({ attacker, defender: ap })) });
    s = passUntil(s, "main2", opp);
    expect(life(s, ap)).toBe(before);
    expect(counters(s, n, "incarnation")).toBe(3);
    s.objects[n]!.counters.incarnation = 8;
    s = resolveAll(run(s, planActivate(s, opp, p, 0, [player(ap)])));
    expect(zone(s, n)).toBe("exile");
    expect(s.players[ap]!.lost).toBe(true);
  });

  it("Archfiend's Vessel: entering from your graveyard, it's exiled and you get a 5/5 Demon; not if it left first", () => {
    for (const leaves of [false, true]) {
      let { s, ap, ids } = setup([reanimate]);
      const v = into(s, ap, archfiendsVessel, "graveyard");
      s = run(s, planCast(s, ap, ids[0]!, [tgt(v)]));
      for (let i = 0; i < 10 && zone(s, v) !== "battlefield"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      if (leaves) moveObject(s, v, "hand");
      s = resolveAll(s);
      expect(zone(s, v)).toBe(leaves ? "hand" : "exile");
      expect(named(s, ap, "Demon")).toHaveLength(leaves ? 0 : 1);
    }
  });

  it("Deadly Designs: the fifth plot counter, from any player, sacrifices it and destroys up to two target creatures", () => {
    let { s, ap, opp } = setup([]);
    const d = putOnBattlefield(s, ap, deadlyDesigns);
    s.objects[d]!.counters.plot = 4;
    const a = putOnBattlefield(s, opp, bear());
    const b = putOnBattlefield(s, opp, bear());
    const c = putOnBattlefield(s, opp, bear());
    s = run(s, planActivate(s, ap, d, 0));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = choose(s, [tgt(a), tgt(b)]);
    expect(zone(s, d)).toBe("graveyard");
    expect([a, b, c].map((id) => zone(s, id))).toEqual(["graveyard", "graveyard", "battlefield"]);
  });
});
