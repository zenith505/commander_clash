// Round 187: more of the harder cards both lanes skipped, from the most played down: "the greatest mana value of a
// commander you own on the battlefield or in the command zone" (Cloudkill, Majestic Genesis, Imposing Grandeur and the
// Visions cycle's flashback cost), counter-threshold triggers worded with a number word (Mazemind Tome, Nine Lives) and
// Nine Lives' prevention.

import { describe, expect, it } from "vitest";
import { act, bear, card, mountain, passUntil, putOnBattlefield, setup, swamp } from "./helpers";
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
const chocoboKick = card("Chocobo Kick", "Sorcery", "{1}{G}", {"cmc":2,"keywords":["Kicker"],"oracleText":"Kicker—Return a land you control to its owner's hand. (You may return a land you control to its owner's hand in addition to any other costs as you cast this spell.)\nTarget creature you control deals damage equal to its power to target creature an opponent controls. If this spell was kicked, the creature you control deals twice that much damage instead.","colors":["G"],"layout":"normal"});
const banesContingency = card("Bane's Contingency", "Instant", "{1}{U}{U}", {"cmc":3,"keywords":["Scry"],"oracleText":"Counter target spell. If that spell targets a commander you control, instead counter that spell, scry 2, then draw a card.","colors":["U"],"layout":"normal"});
const echoingReturn = card("Echoing Return", "Sorcery", "{B}", {"cmc":1,"oracleText":"Return target creature card and all other cards with the same name as that card from your graveyard to your hand.","colors":["B"],"layout":"normal"});
const cosmicRebirth = card("Cosmic Rebirth", "Instant", "{1}{G}{W}", {"cmc":3,"oracleText":"Choose target permanent card in your graveyard. If it has mana value 3 or less, you may put it onto the battlefield. If you don't put it onto the battlefield, put it into your hand.\nYou gain 3 life.","colors":["G","W"],"layout":"normal"});
const hoodedBlightfang = card("Hooded Blightfang", "Creature — Snake", "{2}{B}", {"cmc":3,"power":"1","toughness":"4","keywords":["Deathtouch"],"oracleText":"Deathtouch\nWhenever a creature you control with deathtouch attacks, each opponent loses 1 life and you gain 1 life.\nWhenever a creature you control with deathtouch deals damage to a planeswalker, destroy that planeswalker.","colors":["B"],"layout":"normal"});
const vraskaSwarmsEminence = card("Vraska, Swarm's Eminence", "Legendary Planeswalker — Vraska", "{2}{B/G}{B/G}", {"cmc":4,"loyalty":"5","oracleText":"Whenever a creature you control with deathtouch deals damage to a player or planeswalker, put a +1/+1 counter on that creature.\n−2: Create a 1/1 black Assassin creature token with deathtouch and \"Whenever this token deals damage to a planeswalker, destroy that planeswalker.\"","colors":["B","G"],"layout":"normal"});
const chainAssassination = card("Chain Assassination", "Instant", "{2}{B}{B}", {"cmc":4,"keywords":["Freerunning"],"oracleText":"Freerunning {1}{B} (You may cast this spell for its freerunning cost if you dealt combat damage to a player this turn with an Assassin or commander.)\nDestroy target creature. If another creature died this turn, draw a card.","colors":["B"],"layout":"normal"});
const geralfTheFleshwright = card("Geralf, the Fleshwright", "Legendary Creature — Human Warlock", "{2}{U}", {"cmc":3,"power":"2","toughness":"3","oracleText":"Whenever you cast a spell during your turn other than your first spell that turn, create a 2/2 blue and black Zombie Rogue creature token.\nWhenever a Zombie you control enters, put a +1/+1 counter on it for each other Zombie that entered the battlefield under your control this turn.","colors":["U"],"layout":"normal"});
const securityBypass = card("Security Bypass", "Enchantment — Aura", "{1}{U}", {"cmc":2,"keywords":["Enchant","Connive"],"oracleText":"Enchant creature\nAs long as enchanted creature is attacking alone, it can't be blocked.\nEnchanted creature has \"Whenever this creature deals combat damage to a player, it connives.\" (Its controller draws a card, then discards a card. If they discarded a nonland card, they put a +1/+1 counter on this creature.)","colors":["U"],"layout":"normal"});
const walker = card("Test Walker", "Legendary Planeswalker — Test", "{3}", { cmc: 3, loyalty: "5" });
/** A planeswalker put straight onto the battlefield, with its loyalty. */
const withLoyalty = (s: GameState, id: ObjectId, n = 5) => ((s.objects[id]!.counters.loyalty = n), id);
const sniper = (deathtouch = true) => card("Test Sniper", "Creature — Archer", "{1}", { cmc: 1, power: "1", toughness: "1", ...(deathtouch ? { keywords: ["Deathtouch"] } : {}), oracleText: `${deathtouch ? "Deathtouch\n" : ""}{1}: This creature deals 1 damage to any target.` });
const shock = card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "This spell deals 2 damage to any target." });
/** Passes priority until `pid` holds it. */
const toPlayer = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 10 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const clementTheWorrywort = card("Clement, the Worrywort", "Legendary Creature — Frog Druid", "{1}{G}{U}", {"cmc":3,"power":"3","toughness":"3","keywords":["Vigilance"],"oracleText":"Vigilance\nWhenever Clement or another creature you control enters, return up to one target creature you control with lesser mana value to its owner's hand.\nFrogs you control have \"{T}: Add {G} or {U}. Spend this mana only to cast a creature spell.\"","colors":["G","U"],"layout":"normal"});
const colfenorTheLastYew = card("Colfenor, the Last Yew", "Legendary Creature — Treefolk Shaman", "{3}{W}{B}{G}", {"cmc":6,"power":"3","toughness":"7","keywords":["Reach","Vigilance"],"oracleText":"Reach, vigilance\nWhenever Colfenor or another creature you control dies, return up to one other target creature card with lesser toughness from your graveyard to your hand.","colors":["B","G","W"],"layout":"normal"});
const exponentialGrowth = card("Exponential Growth", "Sorcery", "{X}{X}{G}{G}", {"cmc":2,"keywords":["Double"],"oracleText":"Until end of turn, double target creature's power X times.","colors":["G"],"layout":"normal"});
const pontiffOfBlight = card("Pontiff of Blight", "Creature — Zombie Cleric", "{4}{B}{B}", {"cmc":6,"power":"2","toughness":"7","keywords":["Extort"],"oracleText":"Extort (Whenever you cast a spell, you may pay {W/B}. If you do, each opponent loses 1 life and you gain that much life.)\nOther creatures you control have extort. (If a creature has multiple instances of extort, each triggers separately.)","colors":["B"],"layout":"normal"});
const analyzeThePollen = card("Analyze the Pollen", "Sorcery", "{G}", {"cmc":1,"keywords":["Collect evidence"],"oracleText":"As an additional cost to cast this spell, you may collect evidence 8. (Exile cards with total mana value 8 or greater from your graveyard.)\nSearch your library for a basic land card. If evidence was collected, instead search your library for a creature or land card. Reveal that card, put it into your hand, then shuffle.","colors":["G"],"layout":"normal"});

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

describe("round 187, second batch", () => {
  it("all compile", () => supported(chocoboKick, banesContingency, echoingReturn, cosmicRebirth, hoodedBlightfang, vraskaSwarmsEminence, chainAssassination, geralfTheFleshwright, securityBypass));

  it("Chocobo Kick: damage equal to its power; kicked by returning a land, twice that much", () => {
    for (const kicked of [false, true]) {
      let { s, ap, ids, opp } = setup([chocoboKick]);
      const mine = putOnBattlefield(s, ap, bear());
      const theirs = putOnBattlefield(s, opp, card("Test Giant", "Creature — Giant", "{3}", { cmc: 3, power: "3", toughness: "3" }));
      const lands = s.players[ap]!.hand.length;
      s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(mine), tgt(theirs)], undefined, undefined, undefined, kicked ? { kicks: [0], returnToHand: [named(s, ap, "Plains")[0]!] } : {})));
      expect(zone(s, theirs)).toBe(kicked ? "graveyard" : "battlefield");
      if (!kicked) expect(s.objects[theirs]!.damage).toBe(2);
      expect(s.players[ap]!.hand.length).toBe(lands - 1 + (kicked ? 1 : 0));
    }
  });

  it("Bane's Contingency: a spell targeting a commander you control is countered and you scry 2 and draw; otherwise only countered", () => {
    for (const atCommander of [true, false]) {
      let { s, ap, ids, opp } = setup([banesContingency]);
      const cmd = bigCommander(s, ap, 3);
      const b = putOnBattlefield(s, ap, bear());
      putOnBattlefield(s, opp, mountain);
      const sh = into(s, opp, shock, "hand");
      s = toPlayer(s, opp);
      s = run(s, planCast(s, opp, sh, [tgt(atCommander ? cmd : b)]));
      s = toPlayer(s, ap);
      const hand = s.players[ap]!.hand.length;
      s = run(s, planCast(s, ap, ids[0]!, [{ kind: "stack", id: s.stack[0]!.id }]));
      s = resolveAll(s);
      if (atCommander) {
        const p = s.pending;
        if (p?.kind !== "arrangeTop" || p.how !== "scry") throw new Error("no scry");
        expect(p.cards).toHaveLength(2);
        s = resolveAll(act(s, { type: "arrangeTop", player: ap, top: p.cards, away: [] }));
      }
      expect(zone(s, sh)).toBe("graveyard");
      expect(s.objects[atCommander ? cmd : b]!.damage).toBe(0);
      expect(s.players[ap]!.hand.length).toBe(hand - 1 + (atCommander ? 1 : 0));
    }
  });

  it("Echoing Return returns the target and every other card with its name from your graveyard", () => {
    let { s, ap, ids } = setup([echoingReturn]);
    const [a, b] = [into(s, ap, bear(), "graveyard"), into(s, ap, bear(), "graveyard")];
    const other = into(s, ap, card("Test Elf", "Creature — Elf", "{G}", { cmc: 1, power: "1", toughness: "1" }), "graveyard");
    const relicCard = into(s, ap, card("Grizzly Bears", "Artifact", "{1}", { cmc: 1 }), "graveyard");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(a)])));
    expect([a, b, relicCard, other].map((id) => zone(s, id))).toEqual(["hand", "hand", "hand", "graveyard"]);
  });

  it("Cosmic Rebirth: mana value 3 or less may go onto the battlefield, else into your hand; you gain 3 life", () => {
    for (const [mv, yes, where] of [[2, true, "battlefield"], [2, false, "hand"], [4, true, "hand"]] as const) {
      let { s, ap, ids } = setup([cosmicRebirth]);
      const c = into(s, ap, card("Test Beast", "Creature — Beast", `{${mv}}`, { cmc: mv, power: "3", toughness: "3" }), "graveyard");
      const before = life(s, ap);
      s = run(s, planCast(s, ap, ids[0]!, [tgt(c)]));
      let asked = false;
      s = resolveAll(s, () => ((asked = true), yes));
      expect(asked).toBe(mv <= 3);
      expect(zone(s, c)).toBe(where);
      expect(life(s, ap)).toBe(before + 3);
    }
  });

  it("Hooded Blightfang: a deathtouch creature of yours that damages a planeswalker destroys it; attacking drains each opponent", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, hoodedBlightfang);
    const sn = putOnBattlefield(s, ap, sniper());
    const w = withLoyalty(s, putOnBattlefield(s, opp, walker));
    s = resolveAll(run(s, planActivate(s, ap, sn, 0, [tgt(w)])));
    expect(zone(s, w)).toBe("graveyard");
    const w2 = withLoyalty(s, putOnBattlefield(s, opp, walker));
    const plain = putOnBattlefield(s, ap, sniper(false));
    s = resolveAll(run(s, planActivate(s, ap, plain, 0, [tgt(w2)])));
    expect(zone(s, w2)).toBe("battlefield");
    const others = s.turnOrder.filter((p) => p !== ap);
    const lives = others.map((p) => life(s, p));
    const me = life(s, ap);
    s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: sn, defender: opp }] });
    s = resolveAll(s);
    expect(others.map((p) => life(s, p))).toEqual(lives.map((l) => l - 1));
    expect(life(s, ap)).toBe(me + 1);
  });

  it("Vraska, Swarm's Eminence: a deathtouch creature that damages a player gets a +1/+1 counter; -2 makes an Assassin", () => {
    let { s, ap, opp } = setup([]);
    const v = withLoyalty(s, putOnBattlefield(s, ap, vraskaSwarmsEminence));
    const sn = putOnBattlefield(s, ap, sniper());
    const plain = putOnBattlefield(s, ap, sniper(false));
    s = resolveAll(run(s, planActivate(s, ap, sn, 0, [player(opp)])));
    s = resolveAll(run(s, planActivate(s, ap, plain, 0, [player(opp)])));
    expect([counters(s, sn), counters(s, plain)]).toEqual([1, 0]);
    s = resolveAll(run(s, planActivate(s, ap, v, 0)));
    const [tok] = named(s, ap, "Assassin");
    expect(tok).toBeDefined();
    expect(chars(s, tok!).keywords).toContain("Deathtouch");
  });

  it("Chain Assassination draws only if a creature other than the target died this turn", () => {
    for (const earlier of [false, true]) {
      let { s, ap, ids, opp } = setup([chainAssassination]);
      const b = putOnBattlefield(s, opp, bear());
      if (earlier) {
        const sn = putOnBattlefield(s, ap, sniper());
        const victim = putOnBattlefield(s, opp, bear());
        s = resolveAll(run(s, planActivate(s, ap, sn, 0, [tgt(victim)])));
        expect(zone(s, victim)).toBe("graveyard");
      }
      const hand = s.players[ap]!.hand.length;
      s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
      expect(zone(s, b)).toBe("graveyard");
      expect(s.players[ap]!.hand.length).toBe(hand - 1 + (earlier ? 1 : 0));
    }
  });

  it("Geralf: each spell after your first this turn makes a Zombie Rogue, which gets a counter per other Zombie that entered this turn", () => {
    let { s, ap, ids } = setup([relic, relic, relic]);
    putOnBattlefield(s, ap, geralfTheFleshwright);
    for (const id of ids) s = resolveAll(run(s, planCast(s, ap, id)));
    const zs = named(s, ap, "Zombie Rogue");
    expect(zs).toHaveLength(2);
    expect(zs.map((z) => counters(s, z)).sort()).toEqual([0, 1]);
    expect(chars(s, zs[0]!).colors.sort()).toEqual(["B", "U"]);
  });

  it("Security Bypass: the enchanted creature can't be blocked while it attacks alone", () => {
    for (const alone of [true, false]) {
      let { s, ap, ids, opp } = setup([securityBypass]);
      const a = putOnBattlefield(s, ap, bear());
      const friend = putOnBattlefield(s, ap, bear());
      const blocker = putOnBattlefield(s, opp, bear());
      s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(a)])));
      s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: (alone ? [a] : [a, friend]).map((attacker) => ({ attacker, defender: opp })) });
      while (s.pending?.kind !== "declareBlockers" || s.pending.player !== opp) s = act(s, s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: s.pending.player, blocks: [] } : { type: "passPriority", player: waitingOn(s)! });
      const block = () => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker: a }] });
      if (alone) expect(block).toThrow(/can't be blocked/);
      else expect(() => block()).not.toThrow();
    }
  });
});

describe("round 187, third batch", () => {
  it("all compile", () => supported(clementTheWorrywort, colfenorTheLastYew, exponentialGrowth, pontiffOfBlight, analyzeThePollen));

  it("Clement: a creature entering returns up to one creature you control with lesser mana value", () => {
    const beast = card("Test Beast", "Creature — Beast", "{2}{G}", { cmc: 3, power: "3", toughness: "3" });
    let { s, ap, ids } = setup([beast]);
    putOnBattlefield(s, ap, clementTheWorrywort);
    const b = putOnBattlefield(s, ap, bear());
    const peer = putOnBattlefield(s, ap, card("Test Peer", "Creature — Beast", "{1}{G}{G}", { cmc: 3, power: "3", toughness: "3" }));
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(peer)] })).toThrow();
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(ids[0]!)] })).toThrow();
    s = choose(s, [tgt(b)]);
    expect(zone(s, b)).toBe("hand");
    expect(zone(s, peer)).toBe("battlefield");
  });

  it("Colfenor: a creature card with lesser toughness than the one that died (as it last existed), not that card itself", () => {
    const kill = card("Test Kill", "Instant", "{B}", { cmc: 1, oracleText: "Destroy target creature." });
    let { s, ap, ids } = setup([kill]);
    putOnBattlefield(s, ap, colfenorTheLastYew);
    const giant = putOnBattlefield(s, ap, card("Test Giant", "Creature — Giant", "{3}", { cmc: 3, power: "3", toughness: "3" }));
    s.objects[giant]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s);
    const small = into(s, ap, bear(), "graveyard");
    const tough = into(s, ap, card("Test Wall", "Creature — Wall", "{2}", { cmc: 2, power: "0", toughness: "4" }), "graveyard");
    s = run(s, planCast(s, ap, ids[0]!, [tgt(giant)]));
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(zone(s, giant)).toBe("graveyard");
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(giant)] })).toThrow();
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(tough)] })).toThrow();
    s = choose(s, [tgt(small)]);
    expect([zone(s, small), zone(s, tough), zone(s, giant)]).toEqual(["hand", "graveyard", "graveyard"]);
  });

  it("Exponential Growth doubles the power X times, one after another", () => {
    let { s, ap, ids } = setup([exponentialGrowth]);
    const b = putOnBattlefield(s, ap, bear());
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(b)], undefined, undefined, 2)));
    expect(pt(s, b)).toEqual([8, 2]);
  });

  it("Pontiff of Blight gives your other creatures extort, each instance triggering", () => {
    let { s, ap, ids } = setup([relic]);
    putOnBattlefield(s, ap, pontiffOfBlight);
    putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, ap, swamp);
    const others = s.turnOrder.filter((p) => p !== ap);
    const lives = others.map((p) => life(s, p));
    const me = life(s, ap);
    let asked = 0;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)), () => (asked++, true));
    expect(asked).toBe(2);
    expect(others.map((p) => life(s, p))).toEqual(lives.map((l) => l - 2));
    expect(life(s, ap)).toBe(me + 6);
  });

  it("Analyze the Pollen finds a basic land, or with evidence collected a creature or land", () => {
    for (const evidence of [false, true]) {
      let { s, ap, ids } = setup([analyzeThePollen]);
      const big = [0, 1].map(() => into(s, ap, card("Test Wurm", "Creature — Wurm", "{3}{G}", { cmc: 4, power: "4", toughness: "4" }), "graveyard"));
      s = run(s, planCast(s, ap, ids[0]!, undefined, undefined, undefined, undefined, evidence ? { evidence: big } : {}));
      for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      const p = s.pending;
      if (p?.kind !== "searchLibrary") throw new Error("no search");
      const names = new Set(p.cards.map((id) => chars(s, id).name));
      expect([...names].sort()).toEqual(evidence ? ["Forest", "Grizzly Bears"] : ["Forest"]);
      const pick = p.cards.find((id) => chars(s, id).name === (evidence ? "Grizzly Bears" : "Forest"))!;
      s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [pick] }));
      expect(zone(s, pick)).toBe("hand");
    }
  });
});
