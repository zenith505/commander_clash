// Round 200: legendary instants and sorceries need a legendary creature or planeswalker (CR 205.4e), "the highest life
// total among all players" (Sorin, Grim Nemesis), "cards with at least six different mana values are revealed this way"
// (Atemsis), "they exile cards from their hand equal to the difference" (Isildur's Fateful Strike), "counter that spell
// instead if its controller has three or more poison counters" (Bring the Ending), "can't reduce the amount of mana ~
// costs by more than {5}" (Valiant Changeling), "as long as ~ has four or more phyresis counters on it, it's a Phyrexian
// creature" and "then draw a card if it has seven or more ... If it doesn't, scry 1" (Weatherlight Compleated), "exile
// cards from the top of your library until you exile a land card" (Venture Forth), "if X is 4 or more, draw a card"
// (Shantotto), "when your commander deals combat damage to a player" and "the monarch's end step" (Archivist of Gondor),
// "whenever ... while ~ has a -1/-1 counter on it" (Bristlebane Battler, Moonshadow), "choose one or more instead" with
// delirium (Let's Play a Game), "deals damage equal to its power to any other target. Then sacrifice it" (Special Move),
// "put it onto the battlefield if its mana value is 2 or less" (Guidelight Pathmaker), "if a land was destroyed this way
// ... Otherwise, ..." (Dire-Strain Rampage), "the base power and toughness of other creatures you control become equal
// to ~'s power and toughness" (Tanazir Quandrix), "the rest on the bottom in a random order" (Planar Atlas), "you may put
// ~ from your graveyard on top of your library" (Gate Colossus), "then if that creature has toughness 6 or greater"
// (Dormant Grove), "instant and sorcery spells you control have lifelink/deathtouch" (Heartflame Duelist, Pestilent
// Spirit).

import { describe, expect, it } from "vitest";
import { act, card, forest, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { spellCost } from "../src/game";
import { applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const resolveAll = (s: GameState) => {
  for (let i = 0; i < 120 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const pt = (s: GameState, id: ObjectId) => [power(s, s.objects[id]!), toughness(s, s.objects[id]!)];
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Moves every card but `keep` from `pid`'s hand to the bottom of their library. */
const trimHand = (s: GameState, pid: PlayerId, keep: ObjectId[]) => {
  const pl = s.players[pid]!;
  for (const id of pl.hand.filter((h) => !keep.includes(h))) {
    s.objects[id]!.zone = "library";
    pl.library.push(id);
  }
  pl.hand = pl.hand.filter((h) => keep.includes(h));
  invalidateCharacteristics(s);
};
/** Like resolveAll, answering "you may" with `may`, targets with `targets`, and "of their choice" picks with the first options. */
const settle = (s: GameState, targets: TargetChoice[] = [], may = true) => {
  for (let i = 0; i < 200 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: may });
    else if (p?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: p.player, ids: p.options.slice(0, p.count) });
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets });
    else if (p) throw new Error(`waiting for ${p.kind}`);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const generic = (s: GameState, pid: PlayerId, id: ObjectId) => {
  const { cost, extra } = spellCost(s, pid, s.objects[id]!, 0, [], {});
  return cost.symbols.reduce((n, c) => n + (c.kind === "generic" ? c.amount : 0), extra);
};
const name = (s: GameState, id: ObjectId) => s.cards[s.objects[id]!.cardId]!.name;
/** Passes (no blocks, "you may" answered as `may`) until `step` of `ap`'s turn with an empty stack, or another question. */
const toStep = (s: GameState, step: GameState["step"], ap: PlayerId, may = true) => {
  for (let i = 0; i < 800; i++) {
    if (s.step === step && s.activePlayer === ap && !s.stack.length && !s.triggerQueue.length && !s.pending) return s;
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: may });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error(`never reached ${step}`);
};
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId }[]) => act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks });
const creature = (n: string, sub: string, p: number, t = p, cost = "{G}") => card(n, `Creature — ${sub}`, cost, { cmc: cost.match(/\{/g)?.length ?? 0, power: String(p), toughness: String(t) });
const legend = card("Test Legend", "Legendary Creature — Human", "{1}", { cmc: 1, power: "1", toughness: "1" });
const shock = card("Test Shock", "Instant", "{1}{R}", { cmc: 2, oracleText: "This spell deals 2 damage to any target." });
const ping = card("Test Ping", "Instant", "{R}", { cmc: 1, oracleText: "This spell deals 1 damage to any target." });
const sorcery = card("Test Divination", "Sorcery", "{U}", { cmc: 1, oracleText: "Draw a card." });
const rock = (mv: number) => card(`Test Rock ${mv}`, "Artifact", mv ? `{${mv}}` : "", { cmc: mv });

// Real oracle text (Scryfall).
const sorinGrimNemesis = card("Sorin, Grim Nemesis", "Legendary Planeswalker — Sorin", "{4}{W}{B}", {"cmc":6,"loyalty":"6","keywords":[],"oracleText":"+1: Reveal the top card of your library and put that card into your hand. Each opponent loses life equal to its mana value.\n−X: Sorin deals X damage to target creature or planeswalker and you gain X life.\n−9: Create a number of 1/1 black Vampire Knight creature tokens with lifelink equal to the highest life total among all players.","colors":["B","W"],"colorIdentity":["B","W"]});
const atemsisAllSeeing = card("Atemsis, All-Seeing", "Legendary Creature — Sphinx", "{3}{U}{U}{U}", {"cmc":6,"power":"4","toughness":"5","keywords":["Flying"],"oracleText":"Flying\n{2}{U}, {T}: Draw two cards, then discard a card.\nWhenever Atemsis deals damage to an opponent, you may reveal your hand. If cards with at least six different mana values are revealed this way, that player loses the game.","colors":["U"],"colorIdentity":["U"]});
const isildursFatefulStrike = card("Isildur's Fateful Strike", "Legendary Instant", "{2}{B}{B}", {"cmc":4,"keywords":[],"oracleText":"(You may cast a legendary instant only if you control a legendary creature or planeswalker.)\nDestroy target creature. If its controller has more than four cards in hand, they exile cards from their hand equal to the difference.","colors":["B"],"colorIdentity":["B"]});
const bringTheEnding = card("Bring the Ending", "Instant", "{1}{U}", {"cmc":2,"keywords":["Corrupted"],"oracleText":"Counter target spell unless its controller pays {2}.\nCorrupted — Counter that spell instead if its controller has three or more poison counters.","colors":["U"],"colorIdentity":["U"]});
const valiantChangeling = card("Valiant Changeling", "Creature — Shapeshifter", "{5}{W}{W}", {"cmc":7,"power":"3","toughness":"3","keywords":["Double strike","Changeling"],"oracleText":"This spell costs {1} less to cast for each creature type among creatures you control. This effect can't reduce the amount of mana this spell costs by more than {5}.\nChangeling (This card is every creature type.)\nDouble strike","colors":["W"],"colorIdentity":["W"]});
const weatherlightCompleated = card("Weatherlight Compleated", "Legendary Artifact — Vehicle", "{2}", {"cmc":2,"power":"5","toughness":"5","keywords":["Scry","Flying"],"oracleText":"Flying\nAs long as Weatherlight Compleated has four or more phyresis counters on it, it's a Phyrexian creature in addition to its other types.\nWhenever a creature you control dies, put a phyresis counter on Weatherlight Compleated. Then draw a card if it has seven or more phyresis counters on it. If it doesn't, scry 1.","colors":[],"colorIdentity":[]});
const ventureForth = card("Venture Forth", "Sorcery", "{3}{G}", {"cmc":4,"keywords":["Suspend"],"oracleText":"Exile cards from the top of your library until you exile a land card. Put that card onto the battlefield and the rest on the bottom of your library in a random order. Exile Venture Forth with three time counters on it.\nSuspend 3—{1}{G}","colors":["G"],"colorIdentity":["G"]});
const shantottoTacticianMagician = card("Shantotto, Tactician Magician", "Legendary Creature — Dwarf Wizard", "{1}{U}{R}", {"cmc":3,"power":"0","toughness":"4","keywords":[],"oracleText":"Whenever you cast a noncreature spell, Shantotto gets +X/+0 until end of turn, where X is the amount of mana spent to cast that spell. If X is 4 or more, draw a card.","colors":["R","U"],"colorIdentity":["R","U"]});
const archivistOfGondor = card("Archivist of Gondor", "Creature — Human Advisor", "{2}{U}", {"cmc":3,"power":"2","toughness":"3","keywords":[],"oracleText":"When your commander deals combat damage to a player, if there is no monarch, you become the monarch.\nAt the beginning of the monarch's end step, that player draws a card.","colors":["U"],"colorIdentity":["U"]});
const bristlebaneBattler = card("Bristlebane Battler", "Creature — Kithkin Soldier", "{1}{G}", {"cmc":2,"power":"6","toughness":"6","keywords":["Trample","Ward"],"oracleText":"Trample, ward {2}\nThis creature enters with five -1/-1 counters on it.\nWhenever another creature you control enters while this creature has a -1/-1 counter on it, remove a -1/-1 counter from this creature.","colors":["G"],"colorIdentity":["G"]});
const moonshadow = card("Moonshadow", "Creature — Elemental", "{B}", {"cmc":1,"power":"7","toughness":"7","keywords":["Menace"],"oracleText":"Menace\nThis creature enters with six -1/-1 counters on it.\nWhenever one or more permanent cards are put into your graveyard from anywhere while this creature has a -1/-1 counter on it, remove a -1/-1 counter from this creature.","colors":["B"],"colorIdentity":["B"]});
const letsPlayAGame = card("Let's Play a Game", "Sorcery", "{3}{B}", {"cmc":4,"keywords":["Delirium"],"oracleText":"Delirium — Choose one. If there are four or more card types among cards in your graveyard, choose one or more instead.\n• Creatures your opponents control get -1/-1 until end of turn.\n• Each opponent discards two cards.\n• Each opponent loses 3 life and you gain 3 life.","colors":["B"],"colorIdentity":["B"]});
const specialMove = card("Special Move", "Instant", "{2}{R}", {"cmc":3,"keywords":["Foot Toss","Dash Attack","Jump Kick"],"oracleText":"Choose two —\n• Jump Kick — Destroy target artifact.\n• Dash Attack — Put two +1/+1 counters on target attacking or blocking creature you control.\n• Foot Toss — Target creature you control deals damage equal to its power to any other target. Then sacrifice it.","colors":["R"],"colorIdentity":["R"]});
const guidelightPathmaker = card("Guidelight Pathmaker", "Artifact — Vehicle", "{4}{W}{U}", {"cmc":6,"power":"6","toughness":"5","keywords":["Vigilance","Crew"],"oracleText":"Vigilance\nWhen this Vehicle enters, you may search your library for an artifact card and reveal it. Put it onto the battlefield if its mana value is 2 or less. Otherwise, put it into your hand. If you search your library this way, shuffle.\nCrew 2","colors":["U","W"],"colorIdentity":["U","W"]});
const direStrainRampage = card("Dire-Strain Rampage", "Sorcery", "{1}{R}{G}", {"cmc":3,"keywords":["Flashback"],"oracleText":"Destroy target artifact, enchantment, or land. If a land was destroyed this way, its controller may search their library for up to two basic land cards, put them onto the battlefield tapped, then shuffle. Otherwise, its controller may search their library for a basic land card, put it onto the battlefield tapped, then shuffle.\nFlashback {3}{R}{G}","colors":["G","R"],"colorIdentity":["G","R"]});
const tanazirQuandrix = card("Tanazir Quandrix", "Legendary Creature — Elder Dragon", "{3}{G}{U}", {"cmc":5,"power":"4","toughness":"4","keywords":["Flying","Trample","Double"],"oracleText":"Flying, trample\nWhen Tanazir Quandrix enters, double the number of +1/+1 counters on target creature you control.\nWhenever Tanazir Quandrix attacks, you may have the base power and toughness of other creatures you control become equal to Tanazir Quandrix's power and toughness until end of turn.","colors":["G","U"],"colorIdentity":["G","U"]});
const planarAtlas = card("Planar Atlas", "Artifact", "{2}", {"cmc":2,"keywords":[],"oracleText":"This artifact enters tapped.\nWhen this artifact enters, you may look at the top four cards of your library. If you do, reveal up to one land card from among them, then put that card on top of your library and the rest on the bottom in a random order.\n{T}: Add {C}.","colors":[],"colorIdentity":[]});
const gateColossus = card("Gate Colossus", "Artifact Creature — Construct", "{8}", {"cmc":8,"power":"8","toughness":"8","keywords":["Affinity"],"oracleText":"Affinity for Gates (This spell costs {1} less to cast for each Gate you control.)\nThis creature can't be blocked by creatures with power 2 or less.\nWhenever a Gate you control enters, you may put this card from your graveyard on top of your library.","colors":[],"colorIdentity":[]});
const dormantGrove = scry("transform", [{"name":"Dormant Grove","type_line":"Enchantment","mana_cost":"{3}{G}","oracle_text":"At the beginning of combat on your turn, put a +1/+1 counter on target creature you control. Then if that creature has toughness 6 or greater, transform this enchantment."},{"name":"Gnarled Grovestrider","type_line":"Creature — Treefolk","oracle_text":"Vigilance\nOther creatures you control have vigilance.","power":"3","toughness":"6"}], { keywords: ["Vigilance","Transform"], color_identity: ["G"] });
const heartflameDuelist = scry("adventure", [{"name":"Heartflame Duelist","type_line":"Creature — Human Knight","mana_cost":"{1}{W}","oracle_text":"Instant and sorcery spells you control have lifelink.","power":"3","toughness":"1"},{"name":"Heartflame Slash","type_line":"Instant — Adventure","mana_cost":"{2}{R}","oracle_text":"Heartflame Slash deals 3 damage to any target. (Then exile this card. You may cast the creature later from exile.)"}], { keywords: [], color_identity: ["R","W"] });
const pestilentSpirit = card("Pestilent Spirit", "Creature — Spirit", "{2}{B}", {"cmc":3,"power":"3","toughness":"2","keywords":["Menace","Deathtouch"],"oracleText":"Menace, deathtouch\nInstant and sorcery spells you control have deathtouch. (Any amount of damage they deal to a creature is enough to destroy it.)","colors":["B"],"colorIdentity":["B"]});
const reluctantDounguard = card("Reluctant Dounguard", "Creature — Kithkin Soldier", "{2}{W}", {"cmc":3,"power":"4","toughness":"4","keywords":[],"oracleText":"This creature enters with two -1/-1 counters on it.\nWhenever another creature you control enters while this creature has a -1/-1 counter on it, remove a -1/-1 counter from this creature.","colors":["W"],"colorIdentity":["W"]});
const callousSellSword = scry("adventure", [{"name":"Callous Sell-Sword","type_line":"Creature — Human Soldier","mana_cost":"{1}{B}","oracle_text":"This creature enters with a +1/+1 counter on it for each creature that died under your control this turn.","power":"2","toughness":"2"},{"name":"Burn Together","type_line":"Sorcery — Adventure","mana_cost":"{R}","oracle_text":"Target creature you control deals damage equal to its power to any other target. Then sacrifice it."}], { keywords: [], color_identity: ["B","R"] });
const ALL = [reluctantDounguard, callousSellSword, sorinGrimNemesis, atemsisAllSeeing, isildursFatefulStrike, bringTheEnding, valiantChangeling, weatherlightCompleated, ventureForth, shantottoTacticianMagician, archivistOfGondor, bristlebaneBattler, moonshadow, letsPlayAGame, specialMove, guidelightPathmaker, direStrainRampage, tanazirQuandrix, planarAtlas, gateColossus, dormantGrove, heartflameDuelist, pestilentSpirit];

describe("Round 200", () => {
  it("all compile", () => supported(...ALL));

  it("a legendary instant or sorcery can be cast only while you control a legendary creature or planeswalker", () => {
    const { s, ap, ids, opp } = setup([isildursFatefulStrike]);
    const bear = putOnBattlefield(s, opp, creature("Test Bear", "Bear", 2));
    expect(planCast(s, ap, ids[0]!, [tgt(bear)])).toBeNull();
    // An opponent's legend doesn't help, nor does a legendary noncreature artifact.
    putOnBattlefield(s, opp, legend);
    putOnBattlefield(s, ap, card("Test Relic", "Legendary Artifact", "{1}"));
    expect(planCast(s, ap, ids[0]!, [tgt(bear)])).toBeNull();
    putOnBattlefield(s, ap, legend);
    expect(planCast(s, ap, ids[0]!, [tgt(bear)])).not.toBeNull();
  });

  it("Isildur's Fateful Strike destroys the creature and its controller exiles cards down to four in hand", () => {
    const { s: s0, ap, ids, opp } = setup([isildursFatefulStrike]);
    putOnBattlefield(s0, ap, legend);
    const bear = putOnBattlefield(s0, opp, creature("Test Bear", "Bear", 2));
    const hand = [...s0.players[opp]!.hand];
    expect(hand.length).toBe(7);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(bear)])));
    expect(s.objects[bear]!.zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "discard", player: opp, count: 3, exile: true });
    s = act(s, { type: "discard", player: opp, objectIds: hand.slice(0, 3) });
    expect(s.players[opp]!.hand).toHaveLength(4);
    expect(hand.slice(0, 3).every((id) => s.objects[id]!.zone === "exile")).toBe(true);
  });

  it("Isildur's Fateful Strike: four or fewer cards in hand, nothing is exiled", () => {
    const { s: s0, ap, ids, opp } = setup([isildursFatefulStrike]);
    putOnBattlefield(s0, ap, legend);
    trimHand(s0, opp, s0.players[opp]!.hand.slice(0, 4));
    const bear = putOnBattlefield(s0, opp, creature("Test Bear", "Bear", 2));
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(bear)])));
    expect(s.pending).toBeFalsy();
    expect(s.objects[bear]!.zone).toBe("graveyard");
    expect(s.players[opp]!.hand).toHaveLength(4);
  });

  it("Sorin, Grim Nemesis −9 creates Vampire Knights equal to the highest life total among all players", () => {
    const { s: s0, ap, opp } = setup([]);
    const sorin = putOnBattlefield(s0, ap, sorinGrimNemesis);
    s0.objects[sorin]!.counters.loyalty = 10;
    s0.players[opp]!.life = 45;
    s0.players[ap]!.life = 30;
    const s = resolveAll(run(s0, planActivate(s0, ap, sorin, 2)));
    const knights = s.battlefield.filter((id) => s.objects[id]!.isToken && controllerOf(s, s.objects[id]!) === ap);
    expect(knights).toHaveLength(45);
    expect(objHasKeyword(s, s.objects[knights[0]!]!, "Lifelink")).toBe(true);
  });

  it("Bring the Ending counters outright when the spell's controller has three or more poison counters", () => {
    const { s: s0, ap, ids } = setup([sorcery, bringTheEnding]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const item = s.stack[s.stack.length - 1]!;
    s.players[ap]!.poison = 3;
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: item.id }])));
    expect(s.pending).toBeFalsy();
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
    expect(s.stack).toHaveLength(0);
    expect(s.players[ap]!.hand).not.toContain(ids[0]!);
  });

  it("Bring the Ending with fewer than three poison counters lets the controller pay {2}", () => {
    const { s: s0, ap, ids } = setup([sorcery, bringTheEnding]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const item = s.stack[s.stack.length - 1]!;
    s.players[ap]!.poison = 2;
    const handBefore = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: item.id }])));
    expect(s.pending).toMatchObject({ kind: "payUnless", player: ap });
    s.players[ap]!.manaPool.C = 2;
    s = resolveAll(act(s, { type: "payUnless", player: ap, pay: true }));
    // Divination resolved: a card drawn.
    expect(s.players[ap]!.hand.length).toBe(handBefore - 1 + 1);
    expect(s.stack).toHaveLength(0);
  });

  it("Valiant Changeling costs {1} less for each creature type among your creatures, at most {5} less", () => {
    const { s, ap, ids, opp } = setup([valiantChangeling]);
    expect(generic(s, ap, ids[0]!)).toBe(5);
    putOnBattlefield(s, ap, creature("Test Elf", "Elf", 1));
    putOnBattlefield(s, ap, creature("Test Elf Warrior", "Elf Warrior", 1));
    putOnBattlefield(s, opp, creature("Their Goblin", "Goblin", 1));
    expect(generic(s, ap, ids[0]!)).toBe(3);
    putOnBattlefield(s, ap, card("Test Shapeshifter", "Creature — Shapeshifter", "{1}", { power: "1", toughness: "1", keywords: ["Changeling"], oracleText: "Changeling" }));
    expect(generic(s, ap, ids[0]!)).toBe(0);
    expect(planCast(s, ap, ids[0]!)).not.toBeNull();
  });

  it("Weatherlight Compleated is a Phyrexian creature only with four or more phyresis counters", () => {
    const { s, ap } = setup([]);
    const ship = putOnBattlefield(s, ap, weatherlightCompleated);
    s.objects[ship]!.counters.phyresis = 3;
    invalidateCharacteristics(s);
    expect(characteristics(s, s.objects[ship]!).types).not.toContain("Creature");
    s.objects[ship]!.counters.phyresis = 4;
    invalidateCharacteristics(s);
    const ch = characteristics(s, s.objects[ship]!);
    expect(ch.types).toContain("Creature");
    expect(ch.subtypes).toEqual(expect.arrayContaining(["Vehicle", "Phyrexian"]));
    expect(pt(s, ship)).toEqual([5, 5]);
  });

  it("Weatherlight Compleated: a creature you control dies, a counter, then a card at seven counters", () => {
    const { s: s0, ap, ids } = setup([shock]);
    const ship = putOnBattlefield(s0, ap, weatherlightCompleated);
    s0.objects[ship]!.counters.phyresis = 6;
    const bear = putOnBattlefield(s0, ap, creature("Test Bear", "Bear", 2));
    const hand = s0.players[ap]!.hand.length;
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(bear)])));
    expect(s.pending).toBeFalsy();
    expect(s.objects[ship]!.counters.phyresis).toBe(7);
    expect(s.players[ap]!.hand.length).toBe(hand); // the Shock left, a card came in
  });

  it("Weatherlight Compleated: fewer than seven counters, scry 1 instead", () => {
    const { s: s0, ap, ids } = setup([shock]);
    const ship = putOnBattlefield(s0, ap, weatherlightCompleated);
    const bear = putOnBattlefield(s0, ap, creature("Test Bear", "Bear", 2));
    const hand = s0.players[ap]!.hand.length;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(bear)])));
    expect(s.objects[ship]!.counters.phyresis).toBe(1);
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap });
    const top = s.players[ap]!.library[0]!;
    s = resolveAll(act(s, { type: "arrangeTop", player: ap, top: [], away: [top] }));
    expect(s.players[ap]!.library[s.players[ap]!.library.length - 1]).toBe(top);
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
  });

  it("Venture Forth exiles until a land, puts it onto the battlefield and the rest on the bottom, then suspends itself", () => {
    const { s: s0, ap, ids } = setup([ventureForth]);
    const land = into(s0, ap, card("Test Wastes", "Land", ""), "library");
    const a = into(s0, ap, rock(1), "library");
    const b = into(s0, ap, rock(2), "library");
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeFalsy();
    expect(s.objects[land]!.zone).toBe("battlefield");
    const lib = s.players[ap]!.library;
    expect(lib.slice(-2).sort()).toEqual([a, b].sort());
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    expect(s.objects[ids[0]!]!.counters.time).toBe(3);
  });

  it("Shantotto gets +X/+0 for the mana spent on a noncreature spell and draws when X is 4 or more", () => {
    const { s: s0, ap, ids } = setup([rock(2), rock(4)]);
    const shan = putOnBattlefield(s0, ap, shantottoTacticianMagician);
    const hand = s0.players[ap]!.hand.length;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(pt(s, shan)[0]).toBe(2);
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(pt(s, shan)[0]).toBe(6);
    expect(s.players[ap]!.hand.length).toBe(hand - 1); // the second rock left, a card came in
  });

  it("Archivist of Gondor: your commander's combat damage makes you the monarch only if there is none", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, archivistOfGondor);
    const cmdr = putOnBattlefield(s0, ap, creature("Test Commander", "Elf", 3), { commander: true });
    const other = putOnBattlefield(s0, ap, creature("Test Bear", "Bear", 2));
    let s = attack(s0, ap, [{ attacker: other, defender: opp }]);
    s = toStep(s, "main2", ap);
    expect(s.monarch).toBeUndefined();
    const s1 = structuredClone(s0);
    s = toStep(attack(s1, ap, [{ attacker: cmdr, defender: opp }]), "main2", ap);
    expect(s.monarch).toBe(ap);
    // Another player is the monarch (not the one dealt damage, who'd lose it to the attacker, CR 724.2).
    const s2 = structuredClone(s0);
    const third = s2.turnOrder[(s2.turnOrder.indexOf(ap) + 2) % 4]!;
    s2.monarch = third;
    s = toStep(attack(s2, ap, [{ attacker: cmdr, defender: opp }]), "main2", ap);
    expect(s.monarch).toBe(third);
  });

  it("Archivist of Gondor: at the beginning of the monarch's end step, that player draws a card", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, archivistOfGondor);
    s0.monarch = opp;
    let s = toStep(s0, "main2", ap);
    const mine = s.players[ap]!.hand.length;
    s = toStep(s, "main2", opp);
    expect(s.players[ap]!.hand.length).toBe(mine);
    s = passUntil(s, "end", opp);
    const theirs = s.players[opp]!.hand.length;
    expect(s.stack.length + s.triggerQueue.length).toBeGreaterThan(0);
    s = settle(s);
    // One card for being the monarch (CR 724.2), one from the Archivist.
    expect(s.players[opp]!.hand.length).toBe(theirs + 2);
  });

  it("Bristlebane Battler enters with five -1/-1 counters and loses one as each other creature of yours enters", () => {
    const { s: s0, ap, ids } = setup([bristlebaneBattler, creature("Test Elf", "Elf", 1), creature("Test Bear", "Bear", 2)]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.counters["-1/-1"]).toBe(5);
    expect(pt(s, ids[0]!)).toEqual([1, 1]);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(s.objects[ids[0]!]!.counters["-1/-1"]).toBe(4);
    s.objects[ids[0]!]!.counters["-1/-1"] = 0;
    invalidateCharacteristics(s);
    s = run(s, planCast(s, ap, ids[2]!));
    s = resolveAll(s);
    expect(s.objects[ids[2]!]!.zone).toBe("battlefield");
    expect(s.stack).toHaveLength(0);
    expect(pt(s, ids[0]!)).toEqual([6, 6]);
  });

  it("Moonshadow loses a -1/-1 counter when a permanent card goes to your graveyard", () => {
    const { s: s0, ap, ids } = setup([shock, ping]);
    const moon = putOnBattlefield(s0, ap, moonshadow);
    s0.objects[moon]!.counters["-1/-1"] = 6;
    const bear = putOnBattlefield(s0, ap, creature("Test Bear", "Bear", 2));
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(bear)])));
    expect(s.objects[bear]!.zone).toBe("graveyard");
    expect(s.objects[moon]!.counters["-1/-1"]).toBe(5);
    // An instant card isn't a permanent card.
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: s.turnOrder[1]! }])));
    expect(s.objects[moon]!.counters["-1/-1"]).toBe(5);
  });

  it("Atemsis: reveal a hand with six different mana values after damaging an opponent, and that player loses", () => {
    const { s: s0, ap, opp } = setup([]);
    const atemsis = putOnBattlefield(s0, ap, atemsisAllSeeing);
    trimHand(s0, ap, []);
    const keep = [into(s0, ap, card("Test Wastes", "Land", ""), "hand"), ...[1, 2, 3, 4, 5].map((mv) => into(s0, ap, rock(mv), "hand"))];
    let s = attack(structuredClone(s0), ap, [{ attacker: atemsis, defender: opp }]);
    s = toStep(s, "main2", ap);
    expect(s.players[opp]!.lost).toBe(true);
    // Five different mana values aren't enough.
    const s1 = structuredClone(s0);
    s1.objects[keep[5]!]!.cardId = s1.objects[keep[4]!]!.cardId;
    s = toStep(attack(s1, ap, [{ attacker: atemsis, defender: opp }]), "main2", ap);
    expect(s.players[opp]!.lost).toBeFalsy();
    expect(s.players[opp]!.life).toBe(36);
  });

  it("Let's Play a Game: one mode, or one or more with delirium as it's cast", () => {
    const { s: s0, ap, ids, opp } = setup([letsPlayAGame]);
    const theirs = putOnBattlefield(s0, opp, creature("Their Bear", "Bear", 2));
    const mine = putOnBattlefield(s0, ap, creature("My Bear", "Bear", 2));
    expect(planCast(s0, ap, ids[0]!, [], [0, 2])).toBeNull();
    expect(planCast(s0, ap, ids[0]!, [], [2])).not.toBeNull();
    for (const d of [card("Test Wastes", "Land", ""), creature("Dead Bear", "Bear", 2), shock, rock(1)]) into(s0, ap, d, "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!, [], [0, 1, 2]));
    const hands = Object.fromEntries(s.turnOrder.map((p) => [p, s.players[p]!.hand.length]));
    for (let i = 0; i < 50 && (s.stack.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "discard") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
      else if (p) throw new Error(`waiting for ${p.kind}`);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(pt(s, theirs)).toEqual([1, 1]);
    expect(pt(s, mine)).toEqual([2, 2]);
    for (const p of s.turnOrder.filter((p) => p !== ap)) {
      expect(s.players[p]!.hand.length).toBe(hands[p]! - 2);
      expect(s.players[p]!.life).toBe(37);
    }
    // "You gain 3 life": once, not for each opponent.
    expect(s.players[ap]!.life).toBe(43);
  });

  it("Special Move: Foot Toss deals damage equal to the creature's power to any other target, then it's sacrificed", () => {
    const { s: s0, ap, ids, opp } = setup([specialMove]);
    const relic = putOnBattlefield(s0, opp, rock(2));
    const brute = putOnBattlefield(s0, ap, creature("Test Brute", "Giant", 4));
    // "Any other target": not the creature itself.
    expect(planCast(s0, ap, ids[0]!, [tgt(relic), tgt(brute), tgt(brute)], [0, 2])).toBeNull();
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(relic), tgt(brute), { kind: "player", id: opp }], [0, 2])));
    expect(s.objects[relic]!.zone).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(36);
    expect(s.objects[brute]!.zone).toBe("graveyard");
  });

  it("Guidelight Pathmaker puts an artifact with mana value 2 or less onto the battlefield, anything else into your hand", () => {
    for (const mv of [2, 3]) {
      const { s: s0, ap, ids } = setup([guidelightPathmaker]);
      const found = into(s0, ap, rock(mv), "library");
      let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
      expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
      s = act(s, { type: "chooseMay", player: ap, yes: true });
      expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
      s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [found] }));
      expect(s.objects[found]!.zone).toBe(mv === 2 ? "battlefield" : "hand");
    }
  });

  it("Dire-Strain Rampage: a destroyed land's controller may fetch two basics, anything else one", () => {
    const { s: s0, ap, ids, opp } = setup([direStrainRampage, direStrainRampage]);
    const land = s0.battlefield.find((id) => name(s0, id) === "Forest" && controllerOf(s0, s0.objects[id]!) === ap)!;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(land)])));
    expect(s.objects[land]!.zone).toBe("graveyard");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const forests = s.players[ap]!.library.filter((id) => name(s, id) === "Forest").slice(0, 2);
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: forests }));
    expect(forests.every((id) => s.objects[id]!.zone === "battlefield" && s.objects[id]!.tapped)).toBe(true);
    const relic = putOnBattlefield(s, opp, rock(2));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(relic)])));
    expect(s.objects[relic]!.zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    s = act(s, { type: "chooseMay", player: opp, yes: true });
    const theirs = s.players[opp]!.library.filter((id) => name(s, id) === "Forest").slice(0, 2);
    expect(() => act(s, { type: "searchLibrary", player: opp, found: theirs })).toThrow();
    s = resolveAll(act(s, { type: "searchLibrary", player: opp, found: theirs.slice(0, 1) }));
    expect(s.objects[theirs[0]!]!.zone).toBe("battlefield");
  });

  it("Tanazir Quandrix sets the other creatures' base power and toughness to its own as the ability resolves", () => {
    const { s: s0, ap, opp } = setup([]);
    const tanazir = putOnBattlefield(s0, ap, tanazirQuandrix);
    s0.objects[tanazir]!.counters["+1/+1"] = 1;
    const bear = putOnBattlefield(s0, ap, creature("Test Bear", "Bear", 2));
    s0.objects[bear]!.counters["+1/+1"] = 1;
    const theirs = putOnBattlefield(s0, opp, creature("Their Bear", "Bear", 2));
    invalidateCharacteristics(s0);
    let s = attack(s0, ap, [{ attacker: tanazir, defender: opp }]);
    s = settle(s);
    expect(pt(s, bear)).toEqual([6, 6]);
    expect(pt(s, theirs)).toEqual([2, 2]);
    expect(pt(s, tanazir)).toEqual([5, 5]);
    s.objects[tanazir]!.counters["+1/+1"] = 3;
    invalidateCharacteristics(s);
    expect(pt(s, bear)).toEqual([6, 6]);
  });

  it("Planar Atlas: reveal up to one land from the top four and put it on top, the rest on the bottom", () => {
    const { s: s0, ap, ids } = setup([planarAtlas]);
    const top = [rock(1), rock(2), card("Test Wastes", "Land", ""), rock(3)].map((d) => into(s0, ap, d, "library")).reverse();
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.tapped).toBe(true);
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    const land = top[1]!;
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, cards: [land], max: 1 });
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [land] }));
    const lib = s.players[ap]!.library;
    expect(lib[0]).toBe(land);
    expect(lib.slice(-3).sort()).toEqual([top[0], top[2], top[3]].sort());
  });

  it("Gate Colossus: a Gate entering under your control lets you put it from your graveyard on top of your library", () => {
    const gate = card("Test Gate", "Land — Gate", "");
    const { s: s0, ap, ids } = setup([gate]);
    const colossus = into(s0, ap, gateColossus, "graveyard");
    let s = act(s0, { type: "playLand", player: ap, objectId: ids[0]! });
    s = settle(s);
    expect(s.players[ap]!.library[0]).toBe(colossus);
    expect(s.objects[colossus]!.zone).toBe("library");
  });

  it("Dormant Grove transforms once the creature it put a counter on has toughness 6 or greater", () => {
    const { s: s0, ap } = setup([]);
    const grove = putOnBattlefield(s0, ap, dormantGrove);
    const small = putOnBattlefield(s0, ap, creature("Test Bear", "Bear", 2));
    const big = putOnBattlefield(s0, ap, creature("Test Giant", "Giant", 5));
    let s = settle(passUntil(structuredClone(s0), "beginCombat", ap), [tgt(small)]);
    expect(s.objects[small]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[grove]!.face ?? 0).toBe(0);
    s = settle(passUntil(structuredClone(s0), "beginCombat", ap), [tgt(big)]);
    expect(s.objects[big]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[grove]!.face).toBe(1);
    expect(characteristics(s, s.objects[grove]!).name).toBe("Gnarled Grovestrider");
  });

  it("Heartflame Duelist gives your instants lifelink; Pestilent Spirit gives them deathtouch", () => {
    const { s: s0, ap, ids, opp } = setup([shock, ping]);
    putOnBattlefield(s0, ap, heartflameDuelist);
    putOnBattlefield(s0, ap, pestilentSpirit);
    const giant = putOnBattlefield(s0, opp, creature("Their Giant", "Giant", 5));
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(38);
    expect(s.players[ap]!.life).toBe(42);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(giant)])));
    expect(s.objects[giant]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(43);
  });

  it("spells you control: an opponent's instant gets neither lifelink nor deathtouch", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, heartflameDuelist);
    putOnBattlefield(s0, ap, pestilentSpirit);
    const mine = putOnBattlefield(s0, ap, creature("My Giant", "Giant", 5));
    trimHand(s0, ap, []);
    let s = toStep(s0, "upkeep", opp);
    const zap = into(s, opp, ping, "hand");
    s.players[opp]!.manaPool.R = 1;
    s = resolveAll(run(s, planCast(s, opp, zap, [tgt(mine)])));
    expect(s.objects[mine]!.zone).toBe("battlefield");
    expect(s.objects[mine]!.damage).toBe(1);
    expect(s.players[opp]!.life).toBe(40);
  });

  it("bot: Let's Play a Game with delirium is cast with more than one mode", () => {
    const { s: s0, ap, ids, opp } = setup([letsPlayAGame]);
    trimHand(s0, ap, ids);
    s0.players[ap]!.command = [];
    putOnBattlefield(s0, opp, creature("Their Elf", "Elf", 1));
    for (const d of [card("Test Wastes", "Land", ""), creature("Dead Bear", "Bear", 2), shock, rock(1)]) into(s0, ap, d, "graveyard");
    const cast = botActions(s0, ap).find((a) => a.type === "castSpell");
    expect(cast?.type === "castSpell" && cast.objectId).toBe(ids[0]);
    expect(cast?.type === "castSpell" && (cast.modes?.length ?? 0) > 1).toBe(true);
  });

  it("bot: Tanazir's attack trigger is used only when it makes the other creatures bigger", () => {
    for (const [p, want] of [[1, true], [7, false]] as const) {
      const { s: s0, ap, opp } = setup([]);
      const tanazir = putOnBattlefield(s0, ap, tanazirQuandrix);
      const other = putOnBattlefield(s0, ap, creature("Test Other", "Beast", p));
      let s = attack(s0, ap, [{ attacker: tanazir, defender: opp }]);
      for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
      s = resolveAll(botActions(s, ap).reduce((x, a) => act(x, a), s));
      expect(pt(s, other)).toEqual(want ? [4, 4] : [p, p]);
    }
  });

  it("Burn Together: with the other target gone, the creature is still sacrificed; with the creature gone, nothing happens", () => {
    for (const gone of ["other", "creature"] as const) {
      const { s: s0, ap, ids, opp } = setup([callousSellSword]);
      const brute = putOnBattlefield(s0, ap, creature("Test Brute", "Giant", 4));
      const victim = putOnBattlefield(s0, opp, creature("Their Bear", "Bear", 2));
      let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(brute), tgt(victim)], undefined, undefined, undefined, { face: 1 }));
      const leaving = gone === "other" ? victim : brute;
      s.battlefield.splice(s.battlefield.indexOf(leaving), 1);
      s.objects[leaving]!.zone = "graveyard";
      s.players[s.objects[leaving]!.owner]!.graveyard.push(leaving);
      invalidateCharacteristics(s);
      s = resolveAll(s);
      if (gone === "other") expect(s.objects[brute]!.zone).toBe("graveyard");
      else expect(s.players[opp]!.life).toBe(40);
      expect(s.objects[ids[0]!]!.zone).toBe("exile");
    }
  });
});
