// Round 205: "the first time that creature has become tapped this turn" (Captain America, Living Legend), "an opponent
// attacks one or more planeswalkers you control" (Mila, Crafty Companion) and Lukka, Wayward Bonder, "whenever you copy an
// instant spell" (Kalamax, the Stormsire), "two cards that share all their card types" (Demonic Covenant), "that player
// exiles the top card of their library" played from exile (Nightveil Specter), "Return this card and target land card"
// (Sandman, Shifting Scoundrel), "that artifact enters tapped" (Edgar, Master Machinist), "if its power was different from
// its base power" (Jason Bright, Glowing Prophet), "a nonland card of an opponent's choice" (Tasigur, the Golden Fang),
// "~ or a legendary creature" and "sacrifice X Foods" (Campsite Cuisine), "If the sacrificed permanent was a Treasure"
// (Evereth, Viceroy of Plunder, Hellish Sideswipe), "up to eight target permanents" (Lorthos, the Tidemaker), "Desert lands
// from your graveyard" (Hazezon, Shaper of Sand), "attacking modified creatures" (Iron Man, Armored Avenger), "any number of
// legendary and/or enchantment cards" (Nashi, Searcher in the Dark), "Scouts, Pirates, and/or Rogues" and "You may cast it.
// If you don't" (Vaan, Street Thief, Boss Uramon, Mordor Trebuchet), granted renown and "a renowned creature" (Aragorn,
// Hornburg Hero), "creatures you control with base power 0 ... equal to the damage dealt" (Primo, the Unbounded), and a
// fix: a token "named Ballistic Boulder that's tapped and attacking" (Fire Navy Trebuchet) got the whole phrase as its name.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { applyAction, compileCard, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/**
 * Everyone passes until the stack is empty, answering "you may" with `may`, trigger targets with `targets`, a pick from a
 * graveyard with `pick` (or the first ones offered), a permanent pick with `ids` (or the first ones offered); stops at any
 * other question.
 */
const settle = (s: GameState, opts: { may?: boolean; targets?: TargetChoice[]; pick?: ObjectId[]; ids?: ObjectId[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets ?? [] });
    else if (p?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: p.player, found: opts.pick ? opts.pick.filter((id) => p.cards.includes(id)) : p.cards.slice(0, p.max) });
    else if (p?.kind === "pickPermanents" && p.action !== "keepTapped") s = act(s, { type: "pickPermanents", player: p.player, ids: opts.ids ?? p.options.slice(0, p.count) });
    else if (p?.kind === "copyTargets") s = act(s, { type: "copyTargets", player: p.player });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes (no blocks, `may` to "you may") until `step` of `ap`'s turn with an empty stack, or another question. */
const toStep = (s: GameState, step: GameState["step"], ap: PlayerId, may = false) => {
  for (let i = 0; i < 1500; i++) {
    if (s.step === step && s.activePlayer === ap && !s.stack.length && !s.triggerQueue.length && !s.pending) return s;
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: may });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
    else if (p?.kind === "pickPermanents" && p.action === "keepTapped") s = act(s, { type: "pickPermanents", player: p.player, ids: [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error(`never reached ${step}`);
};
/** Declare these attacks (each at `defender`) in `ap`'s turn; their attack triggers wait on the stack. */
const attack = (s: GameState, ap: PlayerId, defender: PlayerId, attackers: ObjectId[]) => {
  s = passUntil(s, "declareAttackers", ap);
  return act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender })) });
};
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % s.turnOrder.length]!;
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === name);
const counters = (s: GameState, id: ObjectId) => s.objects[id]!.counters["+1/+1"] ?? 0;
const handSize = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.length;
/** Moves the cards in a player's hand to the bottom of their library, so no one discards to hand size. */
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of s.players[pid]!.hand.splice(0)) {
    s.objects[id]!.zone = "library";
    s.players[pid]!.library.push(id);
  }
};
const rock = (n = "Test Rock", mv = 1) => card(n, "Artifact", `{${mv}}`, { cmc: mv });
const elves = card("Llanowar Elves", "Creature — Elf Druid", "{G}", { cmc: 1, power: "1", toughness: "1", oracleText: "{T}: Add {G}." });
const walker = (n: string) => card(n, "Legendary Planeswalker — Test", "{3}", { cmc: 3, loyalty: "3", oracleText: "+1: Draw a card." });
const bolt = card("Test Bolt", "Instant", "{R}", { cmc: 1, oracleText: "Test Bolt deals 3 damage to any target." });
const cantrip = (n = "Test Cantrip") => card(n, "Instant", "{U}", { cmc: 1, oracleText: "Draw a card." });
const enchantment = (n = "Test Enchantment") => card(n, "Enchantment", "{1}", { cmc: 1 });
const legend = (n = "Test Legend") => card(n, "Legendary Creature — Human", "{1}", { cmc: 1, power: "1", toughness: "1" });

// Real oracle text (Scryfall).
const nashiSearcherInTheDark = card("Nashi, Searcher in the Dark", "Legendary Creature — Rat Ninja Wizard", "{U}{B}", {"cmc":2,"power":"2","toughness":"2","keywords":["Menace","Mill"],"oracleText":"Menace\nWhenever Nashi deals combat damage to a player, you mill that many cards. You may put any number of legendary and/or enchantment cards from among them into your hand. If you put no cards into your hand this way, put a +1/+1 counter on Nashi.","colors":["B","U"],"colorIdentity":["B","U"],"layout":"normal"});
const captainAmericaLivingLegend = card("Captain America, Living Legend", "Legendary Creature — Human Soldier Hero", "{1}{W}{U}", {"cmc":3,"power":"3","toughness":"4","keywords":["Vigilance"],"oracleText":"Vigilance\nWhenever a creature you control becomes tapped during your turn, if it's the first time that creature has become tapped this turn, untap it.","colors":["U","W"],"colorIdentity":["U","W"],"layout":"normal"});
const milaCraftyCompanion = scry("modal_dfc", [{"name":"Mila, Crafty Companion","mana_cost":"{1}{W}{W}","type_line":"Legendary Creature — Fox","oracle_text":"Whenever an opponent attacks one or more planeswalkers you control, put a loyalty counter on each planeswalker you control.\nWhenever a permanent you control becomes the target of a spell or ability an opponent controls, you may draw a card.","power":"2","toughness":"3"},{"name":"Lukka, Wayward Bonder","mana_cost":"{4}{R}{R}","type_line":"Legendary Planeswalker — Lukka","oracle_text":"+1: You may discard a card. If you do, draw a card. If a creature card was discarded this way, draw two cards instead.\n−2: Return target creature card from your graveyard to the battlefield. It gains haste. Exile it at the beginning of your next upkeep.\n−7: You get an emblem with \"Whenever a creature you control enters, it deals damage equal to its power to any target.\"","loyalty":"5"}], { keywords: [], color_identity: ["R","W"] });
const kalamaxTheStormsire = card("Kalamax, the Stormsire", "Legendary Creature — Elemental Dinosaur", "{1}{G}{U}{R}", {"cmc":4,"power":"4","toughness":"4","keywords":[],"oracleText":"Whenever you cast your first instant spell each turn, if Kalamax is tapped, copy that spell. You may choose new targets for the copy.\nWhenever you copy an instant spell, put a +1/+1 counter on Kalamax.","colors":["G","R","U"],"colorIdentity":["G","R","U"],"layout":"normal"});
const demonicCovenant = card("Demonic Covenant", "Kindred Enchantment — Demon", "{4}{B}{B}", {"cmc":6,"keywords":["Mill"],"oracleText":"Whenever one or more Demons you control attack a player, you draw a card and lose 1 life.\nAt the beginning of your end step, create a 5/5 black Demon creature token with flying, then mill two cards. If two cards that share all their card types were milled this way, sacrifice this enchantment.","colors":["B"],"colorIdentity":["B"],"layout":"normal"});
const nightveilSpecter = card("Nightveil Specter", "Creature — Specter", "{U/B}{U/B}{U/B}", {"cmc":3,"power":"2","toughness":"3","keywords":["Flying"],"oracleText":"Flying\nWhenever this creature deals combat damage to a player, that player exiles the top card of their library.\nYou may play lands and cast spells from among cards exiled with this creature.","colors":["B","U"],"colorIdentity":["B","U"],"layout":"normal"});
const sandmanShiftingScoundrel = card("Sandman, Shifting Scoundrel", "Legendary Creature — Sand Elemental Villain", "{1}{G}{G}", {"cmc":3,"power":"*","toughness":"*","keywords":[],"oracleText":"Sandman's power and toughness are each equal to the number of lands you control.\nSandman can't be blocked by creatures with power 2 or less.\n{3}{G}{G}: Return this card and target land card from your graveyard to the battlefield tapped.","colors":["G"],"colorIdentity":["G"],"layout":"normal"});
const edgarMasterMachinist = card("Edgar, Master Machinist", "Legendary Creature — Human Artificer Noble", "{2}{R}{W}", {"cmc":4,"power":"2","toughness":"4","keywords":["Tools"],"oracleText":"Once during each of your turns, you may cast an artifact spell from your graveyard. If you cast a spell this way, that artifact enters tapped.\nTools — Whenever Edgar attacks, it gets +X/+0 until end of turn, where X is the greatest mana value among artifacts you control.","colors":["R","W"],"colorIdentity":["R","W"],"layout":"normal"});
const jasonBrightGlowingProphet = card("Jason Bright, Glowing Prophet", "Legendary Creature — Zombie Mutant Advisor", "{2}{U}", {"cmc":3,"power":"2","toughness":"3","keywords":["Come Fly With Me"],"oracleText":"Whenever a Zombie or Mutant you control dies, if its power was different from its base power, draw a card.\nCome Fly With Me — {2}, Sacrifice a creature: Put a +1/+1 counter on target creature you control. It gains flying until end of turn.","colors":["U"],"colorIdentity":["U"],"layout":"normal"});
const tasigurTheGoldenFang = card("Tasigur, the Golden Fang", "Legendary Creature — Human Shaman", "{5}{B}", {"cmc":6,"power":"4","toughness":"5","keywords":["Delve","Mill"],"oracleText":"Delve (Each card you exile from your graveyard while casting this spell pays for {1}.)\n{2}{G/U}{G/U}: Mill two cards, then return a nonland card of an opponent's choice from your graveyard to your hand.","colors":["B"],"colorIdentity":["B","G","U"],"layout":"normal"});
const campsiteCuisine = card("Campsite Cuisine", "Enchantment", "{1}{G}", {"cmc":2,"keywords":["Food"],"oracleText":"Whenever this enchantment or a legendary creature you control enters, create a Food token.\nWhenever you attack, you may sacrifice X Foods. When you do, up to X target attacking creatures each get +3/+3 and gain trample and indestructible until end of turn.","colors":["G"],"colorIdentity":["G"],"layout":"normal"});
const everethViceroyOfPlunder = card("Evereth, Viceroy of Plunder", "Legendary Creature — Vampire Soldier", "{2}{B}", {"cmc":3,"power":"2","toughness":"2","keywords":["Flying"],"oracleText":"Flying\nSacrifice another creature or artifact: Put a +1/+1 counter on Evereth. If the sacrificed permanent was a Treasure, Evereth gains lifelink until end of turn. Activate only as a sorcery.\nWhen Evereth dies, you may pay {1}{B/R}. When you do, Evereth deals damage equal to its power to each opponent.","colors":["B"],"colorIdentity":["B","R"],"layout":"normal"});
const lorthosTheTidemaker = card("Lorthos, the Tidemaker", "Legendary Creature — Octopus", "{5}{U}{U}{U}", {"cmc":8,"power":"8","toughness":"8","keywords":[],"oracleText":"Whenever Lorthos attacks, you may pay {8}. If you do, tap up to eight target permanents. Those permanents don't untap during their controllers' next untap steps.","colors":["U"],"colorIdentity":["U"],"layout":"normal"});
const hazezonShaperOfSand = card("Hazezon, Shaper of Sand", "Legendary Creature — Human Warrior", "{R}{G}{W}", {"cmc":3,"power":"3","toughness":"3","keywords":["Landwalk","Desertwalk"],"oracleText":"Desertwalk (This creature can't be blocked as long as defending player controls a Desert.)\nYou may play Desert lands from your graveyard.\nWhenever a Desert you control enters, create two 1/1 red, green, and white Sand Warrior creature tokens.","colors":["G","R","W"],"colorIdentity":["G","R","W"],"layout":"normal"});
const ironManArmoredAvenger = card("Iron Man, Armored Avenger", "Legendary Artifact Creature — Human Hero", "{3}{U}", {"cmc":4,"power":"2","toughness":"2","keywords":["Flying"],"oracleText":"Flying\nWhenever you draw a card, put a +1/+1 counter on target creature.\nWhenever Iron Man attacks, other attacking modified creatures gain flying until end of turn. (Equipment, Auras you control, and counters are modifications.)","colors":["U"],"colorIdentity":["U"],"layout":"normal"});
const vaanStreetThief = card("Vaan, Street Thief", "Legendary Creature — Human Scout", "{2}{R}", {"cmc":3,"power":"2","toughness":"2","keywords":["Treasure"],"oracleText":"Whenever one or more Scouts, Pirates, and/or Rogues you control deal combat damage to a player, exile the top card of that player's library. You may cast it. If you don't, create a Treasure token.\nWhenever you cast a spell you don't own, put a +1/+1 counter on each Scout, Pirate, and Rogue you control.","colors":["R"],"colorIdentity":["R"],"layout":"normal"});
const aragornHornburgHero = card("Aragorn, Hornburg Hero", "Legendary Creature — Human Soldier", "{1}{R}{G}{W}", {"cmc":4,"power":"4","toughness":"4","keywords":["Double"],"oracleText":"Attacking creatures you control have first strike and renown 1. (When a creature with renown 1 deals combat damage to a player, if it isn't renowned, put a +1/+1 counter on it and it becomes renowned.)\nWhenever a renowned creature you control deals combat damage to a player, double the number of +1/+1 counters on it.","colors":["G","R","W"],"colorIdentity":["G","R","W"],"layout":"normal"});
const primoTheUnbounded = card("Primo, the Unbounded", "Legendary Creature — Fractal Wolf", "{X}{G}{G}{U}", {"cmc":3,"power":"0","toughness":"0","keywords":["Trample"],"oracleText":"Trample\nPrimo enters with twice X +1/+1 counters on it.\nWhenever one or more creatures you control with base power 0 deal combat damage to a player, create a 0/0 green and blue Fractal creature token. Put a number of +1/+1 counters on it equal to the damage dealt.","colors":["G","U"],"colorIdentity":["G","U"],"layout":"normal"});
const bossUramonShadowsReach = card("Boss Uramon, Shadow's Reach", "Legendary Creature — Human Rogue", "{3}{B}", {"cmc":4,"power":"2","toughness":"2","keywords":["Shadow"],"oracleText":"Shadow (This creature can block or be blocked by only creatures with shadow.)\nAttacking Ninjas and Rogues you control have deathtouch.\nWhenever one or more Ninjas and/or Rogues you control deal combat damage to a player, create a 1/1 black Rat Rogue creature token.","colors":["B"],"colorIdentity":["B"],"layout":"normal"});
const hellishSideswipe = card("Hellish Sideswipe", "Sorcery", "{B}", {"cmc":1,"keywords":[],"oracleText":"As an additional cost to cast this spell, sacrifice an artifact or creature.\nDestroy target creature or Vehicle. If the sacrificed permanent was a Vehicle, draw a card.","colors":["B"],"colorIdentity":["B"],"layout":"normal"});
const fireNavyTrebuchet = card("Fire Navy Trebuchet", "Artifact Creature — Wall", "{2}{B}", {"cmc":3,"power":"0","toughness":"4","keywords":["Reach","Defender"],"oracleText":"Defender, reach\nWhenever you attack, create a 2/1 colorless Construct artifact creature token with flying named Ballistic Boulder that's tapped and attacking. Sacrifice that token at the beginning of the next end step.","colors":["B"],"colorIdentity":["B"],"layout":"normal"});
const mordorTrebuchet = card("Mordor Trebuchet", "Artifact Creature — Wall", "{2}{B}", {"cmc":3,"power":"1","toughness":"4","keywords":["Defender"],"oracleText":"Defender\nWhenever you attack with one or more Goblins and/or Orcs, create a 2/1 colorless Construct artifact creature token with flying named Ballistic Boulder that's tapped and attacking. Sacrifice that token at end of combat.","colors":["B"],"colorIdentity":["B"],"layout":"normal"});

describe("Captain America, Living Legend: the first time a creature becomes tapped during your turn", () => {
  it("compile", () => supported(captainAmericaLivingLegend));

  it("untaps it the first time; the second time this turn it stays tapped", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, captainAmericaLivingLegend);
    const e = putOnBattlefield(s0, ap, elves);
    let s = settle(act(s0, { type: "activateMana", player: ap, objectId: e, mana: "G" }));
    expect(s.objects[e]!.tapped).toBe(false);
    s = settle(act(s, { type: "activateMana", player: ap, objectId: e, mana: "G" }));
    expect(s.objects[e]!.tapped).toBe(true);
  });

  it("an attacker without vigilance is untapped as it attacks; not during an opponent's turn", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, captainAmericaLivingLegend);
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(attack(s0, ap, opp, [b]));
    expect(s.objects[b]!.tapped).toBe(false);
    // An opponent's turn: tapping it then isn't during your turn.
    const e = putOnBattlefield(s, ap, elves);
    s = toStep(s, "main1", opp);
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(act(s, { type: "activateMana", player: ap, objectId: e, mana: "G" }));
    expect(s.step).toBe("main1");
    expect(s.objects[e]!.tapped).toBe(true);
  });
});

describe("Mila, Crafty Companion // Lukka, Wayward Bonder", () => {
  it("compile", () => supported(milaCraftyCompanion));

  it("Mila: an opponent attacking one of your planeswalkers puts a loyalty counter on each of them, once (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, milaCraftyCompanion);
    const w1 = putOnBattlefield(s0, ap, walker("Walker One"));
    const w2 = putOnBattlefield(s0, ap, walker("Walker Two"));
    s0.objects[w1]!.counters.loyalty = 3;
    s0.objects[w2]!.counters.loyalty = 3;
    const b1 = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const b2 = putOnBattlefield(s0, opp, bear({ name: "Their Other Bear" }));
    let s = passUntil(s0, "declareAttackers", opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: b1, defender: ap, planeswalker: w1 }, { attacker: b2, defender: ap, planeswalker: w1 }] });
    s = settle(s);
    expect(s.objects[w1]!.counters.loyalty).toBe(4);
    expect(s.objects[w2]!.counters.loyalty).toBe(4);
  });

  it("Mila: an opponent attacking only you doesn't trigger it", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, milaCraftyCompanion);
    const w1 = putOnBattlefield(s0, ap, walker("Walker One"));
    s0.objects[w1]!.counters.loyalty = 3;
    const b1 = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    let s = passUntil(s0, "declareAttackers", opp);
    s = settle(act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: b1, defender: ap }] }));
    expect(s.objects[w1]!.counters.loyalty).toBe(3);
  });

  it("Lukka +1: discarding a creature card draws two, another card one, declining none", () => {
    for (const [discard, drawn] of [[bear({ name: "Discarded Bear" }), 2], [rock("Discarded Rock"), 1], [null, 0]] as const) {
      const { s: s0, ap, ids } = setup([milaCraftyCompanion]);
      emptyHand(s0, ap);
      s0.players[ap]!.library.splice(s0.players[ap]!.library.indexOf(ids[0]!), 1);
      s0.objects[ids[0]!]!.zone = "hand";
      s0.players[ap]!.hand.push(ids[0]!);
      const d = discard ? into(s0, ap, discard, "hand") : undefined;
      s0.players[ap]!.manaPool.W = 2;
      let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { face: 1 })));
      expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
      const before = handSize(s, ap);
      s = settle(run(s, planActivate(s, ap, ids[0]!, 0)), { may: !!d });
      if (s.pending?.kind === "discard") s = settle(act(s, { type: "discard", player: ap, objectIds: [d!] }));
      expect(handSize(s, ap)).toBe(before - (d ? 1 : 0) + drawn);
      if (d) expect(s.objects[d]!.zone).toBe("graveyard");
    }
  });

  it("Lukka −2: the creature returns with haste and is exiled at the beginning of your next upkeep", () => {
    const { s: s0, ap, ids } = setup([milaCraftyCompanion]);
    const dead = into(s0, ap, bear({ name: "Dead Bear" }), "graveyard");
    s0.players[ap]!.manaPool.W = 2;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { face: 1 })));
    s = settle(run(s, planActivate(s, ap, ids[0]!, 1, [tgt(dead)])));
    expect(s.objects[dead]!.zone).toBe("battlefield");
    expect(objHasKeyword(s, s.objects[dead]!, "Haste")).toBe(true);
    s = toStep(s, "main1", next(s, ap));
    expect(s.objects[dead]!.zone).toBe("battlefield");
    s = toStep(s, "draw", ap);
    expect(s.objects[dead]!.zone).toBe("exile");
  });
});

describe("Kalamax, the Stormsire: whenever you copy an instant spell", () => {
  it("compile", () => supported(kalamaxTheStormsire));

  it("casting an instant isn't copying one; with Kalamax tapped, its copy puts a +1/+1 counter on it", () => {
    const { s: s0, ap, opp } = setup([bolt, cantrip()]);
    const k = putOnBattlefield(s0, ap, kalamaxTheStormsire);
    const [b, c] = s0.players[ap]!.hand.slice(-2);
    // Untapped: the first instant isn't copied, and casting it isn't copying it.
    const s = settle(run(structuredClone(s0), planCast(s0, ap, c!)));
    expect(s.stack).toHaveLength(0);
    expect(counters(s, k)).toBe(0);
    // Tapped: its first instant is copied, and that copy puts a counter on it.
    const t = structuredClone(s0);
    t.objects[k]!.tapped = true;
    let u = run(t, planCast(t, ap, b!, [{ kind: "player", id: opp }]));
    u = settle(u, { may: false });
    expect(counters(u, k)).toBe(1);
  });
});

describe("Demonic Covenant: two cards that share all their card types", () => {
  it("compile", () => supported(demonicCovenant));

  const endStep = (top: CardDef[]) => {
    const { s: s0, ap } = setup([]);
    const dc = putOnBattlefield(s0, ap, demonicCovenant);
    for (const d of [...top].reverse()) into(s0, ap, d, "library");
    emptyHand(s0, ap);
    const s = settle(toStep(s0, "end", ap));
    return { s, ap, dc };
  };

  it("two lands milled: a 5/5 Demon, then it's sacrificed", () => {
    const { s, ap, dc } = endStep([card("Land A", "Land"), card("Land B", "Land")]);
    expect(named(s, ap, "Demon Token").length + named(s, ap, "Demon").length).toBe(1);
    expect(s.objects[dc]!.zone).toBe("graveyard");
  });

  it("an artifact creature and a creature don't share all their card types; a Demon and it stays", () => {
    const { s, dc } = endStep([card("Metal Bear", "Artifact Creature — Bear", "{2}", { power: "2", toughness: "2" }), bear()]);
    expect(s.objects[dc]!.zone).toBe("battlefield");
  });

  it("two creatures of different subtypes and supertypes still share all their card types (rulings)", () => {
    const { s, dc } = endStep([legend(), bear()]);
    expect(s.objects[dc]!.zone).toBe("graveyard");
  });
});

describe("Nightveil Specter: play lands and cast spells from among cards exiled with it", () => {
  it("compile", () => supported(nightveilSpecter));

  it("the damaged player exiles their top card; you may cast it later, paying its costs, but not other exiled cards", () => {
    const { s: s0, ap, opp } = setup([]);
    const ns = putOnBattlefield(s0, ap, nightveilSpecter);
    const top = into(s0, opp, cantrip("Their Cantrip"), "library");
    const other = into(s0, opp, cantrip("Other Exiled"), "exile");
    let s = toStep(attack(s0, ap, opp, [ns]), "main2", ap);
    expect(s.objects[top]!.zone).toBe("exile");
    expect(s.players[opp]!.exile).toContain(top);
    expect(planCast(s, ap, other)).toBeNull();
    const hand = handSize(s, ap);
    s = settle(run(s, planCast(s, ap, top)));
    expect(s.objects[top]!.zone).toBe("graveyard");
    expect(s.players[opp]!.graveyard).toContain(top);
    expect(handSize(s, ap)).toBe(hand + 1);
  });

  it("a land exiled with it can be played as your land for the turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const ns = putOnBattlefield(s0, ap, nightveilSpecter);
    const top = into(s0, opp, card("Their Land", "Land", "", { oracleText: "{T}: Add {C}." }), "library");
    s0.players[ap]!.landsPlayedThisTurn = 0;
    let s = toStep(attack(s0, ap, opp, [ns]), "main2", ap);
    s = act(s, { type: "playLand", player: ap, objectId: top });
    expect(s.objects[top]!.zone).toBe("battlefield");
    expect(s.objects[top]!.controller).toBe(ap);
  });
});

describe("Sandman, Shifting Scoundrel: return this card and target land card", () => {
  it("compile", () => supported(sandmanShiftingScoundrel));

  it("both come back from your graveyard tapped", () => {
    const { s: s0, ap } = setup([]);
    const sm = into(s0, ap, sandmanShiftingScoundrel, "graveyard");
    const land = into(s0, ap, card("Dead Land", "Land", "", { oracleText: "{T}: Add {C}." }), "graveyard");
    const s = settle(run(s0, planActivate(s0, ap, sm, 0, [tgt(land)])));
    for (const id of [sm, land]) {
      expect(s.objects[id]!.zone).toBe("battlefield");
      expect(s.objects[id]!.tapped).toBe(true);
    }
  });

  it("can't be activated from the battlefield", () => {
    const { s: s0, ap } = setup([]);
    const sm = putOnBattlefield(s0, ap, sandmanShiftingScoundrel);
    const land = into(s0, ap, card("Dead Land", "Land"), "graveyard");
    expect(planActivate(s0, ap, sm, 0, [tgt(land)])).toBeNull();
  });
});

describe("Edgar, Master Machinist: that artifact enters tapped", () => {
  it("compile", () => supported(edgarMasterMachinist));

  it("an artifact cast from your graveyard this way enters tapped; once each turn; one cast from your hand doesn't", () => {
    const { s: s0, ap } = setup([rock("Hand Rock", 2)]);
    putOnBattlefield(s0, ap, edgarMasterMachinist);
    const y1 = into(s0, ap, rock("Yard Rock", 2), "graveyard");
    const y2 = into(s0, ap, rock("Second Yard Rock", 2), "graveyard");
    const via = { via: "turnPermission" as const };
    let s = settle(run(s0, planCast(s0, ap, y1, undefined, undefined, "auto", undefined, via)));
    expect(s.objects[y1]!.zone).toBe("battlefield");
    expect(s.objects[y1]!.tapped).toBe(true);
    expect(planCast(s, ap, y2, undefined, undefined, "auto", undefined, via)).toBeNull();
    const h = s.players[ap]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Hand Rock")!;
    s = settle(run(s, planCast(s, ap, h)));
    expect(s.objects[h]!.tapped).toBe(false);
  });
});

describe("Jason Bright, Glowing Prophet: if its power was different from its base power", () => {
  it("compile", () => supported(jasonBrightGlowingProphet));

  const zombie = (n = "Test Zombie") => card(n, "Creature — Zombie", "{1}{B}", { cmc: 2, power: "2", toughness: "2" });

  it("a Zombie with a +1/+1 counter dies: draw; a plain one: no draw; a modified non-Zombie: no draw", () => {
    const { s: s0, ap } = setup([]);
    const jb = putOnBattlefield(s0, ap, jasonBrightGlowingProphet);
    const z1 = putOnBattlefield(s0, ap, zombie());
    const z2 = putOnBattlefield(s0, ap, zombie("Plain Zombie"));
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[z1]!.counters["+1/+1"] = 1;
    s0.objects[b]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    let s = s0;
    for (const [victim, drawn] of [[z1, 1], [z2, 0], [b, 0]] as const) {
      const hand = handSize(s, ap);
      s = run(s, planActivate(s, ap, jb, 0, [tgt(jb)], undefined, undefined, undefined, { sacrifice: [victim] }));
      s = settle(s);
      expect(s.objects[victim]!.zone).toBe("graveyard");
      expect(handSize(s, ap)).toBe(hand + drawn);
    }
  });

  it("a Zombie with power lowered below its base power counts too", () => {
    const { s: s0, ap } = setup([]);
    const jb = putOnBattlefield(s0, ap, jasonBrightGlowingProphet);
    const z = putOnBattlefield(s0, ap, zombie());
    s0.objects[z]!.counters["-1/-1"] = 1;
    invalidateCharacteristics(s0);
    const hand = handSize(s0, ap);
    const s = settle(run(s0, planActivate(s0, ap, jb, 0, [tgt(jb)], undefined, undefined, undefined, { sacrifice: [z] })));
    expect(handSize(s, ap)).toBe(hand + 1);
  });
});

describe("Tasigur, the Golden Fang: a nonland card of an opponent's choice", () => {
  it("compile", () => supported(tasigurTheGoldenFang));

  it("mills two, then an opponent picks a nonland card from your graveyard, which goes to your hand", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, tasigurTheGoldenFang);
    const old = into(s0, ap, cantrip("Old Spell"), "graveyard");
    const land = into(s0, ap, card("Milled Land", "Land"), "library");
    const spell = into(s0, ap, rock("Milled Rock"), "library");
    let s = run(s0, planActivate(s0, ap, t, 0));
    for (let i = 0; i < 20 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    // The opponent is chosen, then picks; neither is a target.
    for (let i = 0; i < 4 && s.pending?.kind === "chooseOption"; i++) s = act(s, { type: "chooseOption", player: s.pending.player, choice: String(s.pending.options[0]) });
    expect(s.pending).toMatchObject({ kind: "searchLibrary" });
    const p = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect(p.player).not.toBe(ap);
    expect(p.cards).toEqual(expect.arrayContaining([old, spell]));
    expect(p.cards).not.toContain(land);
    s = settle(act(s, { type: "searchLibrary", player: p.player, found: [spell] }));
    expect(s.objects[spell]!.zone).toBe("hand");
    expect(s.objects[land]!.zone).toBe("graveyard");
    expect(s.objects[old]!.zone).toBe("graveyard");
  });
});

const food = (n = "Test Food") => card(n, "Artifact — Food", "{2}", { cmc: 2, oracleText: "{2}, {T}, Sacrifice this artifact: You gain 3 life." });
const treasure = () => card("Test Treasure", "Artifact — Treasure", "", { oracleText: "{T}, Sacrifice this artifact: Add one mana of any color." });
const foods = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && /Food/.test(s.cards[s.objects[id]!.cardId]!.name)).length;

describe("Campsite Cuisine", () => {
  it("compile", () => supported(campsiteCuisine));

  it("a Food as it enters, and as a legendary creature you control enters; not a nonlegendary one", () => {
    const { s: s0, ap, ids } = setup([campsiteCuisine, legend(), bear()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(foods(s, ap)).toBe(1);
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(foods(s, ap)).toBe(2);
    s = settle(run(s, planCast(s, ap, ids[2]!)));
    expect(foods(s, ap)).toBe(2);
  });

  it("sacrificing two Foods as you attack: up to two target attacking creatures get +3/+3, trample and indestructible", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, campsiteCuisine);
    const f1 = putOnBattlefield(s0, ap, food("Food One"));
    const f2 = putOnBattlefield(s0, ap, food("Food Two"));
    const a = putOnBattlefield(s0, ap, bear({ name: "Bear A" }));
    const b = putOnBattlefield(s0, ap, bear({ name: "Bear B" }));
    const c = putOnBattlefield(s0, ap, bear({ name: "Bear C" }));
    let s = attack(s0, ap, opp, [a, b, c]);
    for (let i = 0; i < 10 && s.pending?.kind !== "pickPermanents"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "sacrifice", anyNumber: true });
    s = act(s, { type: "pickPermanents", player: ap, ids: [f1, f2] });
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", x: 2 });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(a), tgt(b)] }));
    expect(power(s, s.objects[a]!)).toBe(5);
    expect(toughness(s, s.objects[b]!)).toBe(5);
    expect(objHasKeyword(s, s.objects[a]!, "Trample")).toBe(true);
    expect(objHasKeyword(s, s.objects[b]!, "Indestructible")).toBe(true);
    expect(power(s, s.objects[c]!)).toBe(2);
  });
});

describe("If the sacrificed permanent was a Treasure / a Vehicle", () => {
  it("compile", () => supported(everethViceroyOfPlunder, hellishSideswipe));

  it("Evereth: sacrificing a Treasure gives it a counter and lifelink; a creature, only the counter", () => {
    const { s: s0, ap } = setup([]);
    const ev = putOnBattlefield(s0, ap, everethViceroyOfPlunder);
    const t = putOnBattlefield(s0, ap, treasure());
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(run(s0, planActivate(s0, ap, ev, 0, undefined, undefined, undefined, undefined, { sacrifice: [b] })));
    expect(counters(s, ev)).toBe(1);
    expect(objHasKeyword(s, s.objects[ev]!, "Lifelink")).toBe(false);
    s = settle(run(s, planActivate(s, ap, ev, 0, undefined, undefined, undefined, undefined, { sacrifice: [t] })));
    expect(counters(s, ev)).toBe(2);
    expect(objHasKeyword(s, s.objects[ev]!, "Lifelink")).toBe(true);
  });

  it("Hellish Sideswipe: sacrificing a Vehicle draws a card; a creature doesn't", () => {
    for (const [fodder, drawn] of [[card("Test Vehicle", "Artifact — Vehicle", "{2}", { power: "3", toughness: "3", oracleText: "Crew 1" }), 1], [bear({ name: "Fodder Bear" }), 0]] as const) {
      const { s: s0, ap, opp, ids } = setup([hellishSideswipe]);
      const f = putOnBattlefield(s0, ap, fodder);
      const victim = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
      const hand = handSize(s0, ap);
      const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(victim)], undefined, "auto", undefined, { sacrifice: [f] })));
      expect(s.objects[victim]!.zone).toBe("graveyard");
      expect(handSize(s, ap)).toBe(hand - 1 + drawn);
    }
  });
});

describe("Lorthos, the Tidemaker: up to eight target permanents", () => {
  it("compile", () => supported(lorthosTheTidemaker));

  it("paying {8} taps them, and they don't untap during their controller's next untap step", () => {
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, lorthosTheTidemaker);
    const theirs = Array.from({ length: 3 }, (_, i) => putOnBattlefield(s0, opp, bear({ name: `Their Bear ${i}` })));
    let s = attack(s0, ap, opp, [l]);
    s.players[ap]!.manaPool.C = 8;
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = s.pending?.kind === "chooseMay" ? act(s, { type: "chooseMay", player: ap, yes: true }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "chooseTargets", player: ap, targets: theirs.map(tgt) });
    s = settle(s, { may: true });
    for (const id of theirs) expect(s.objects[id]!.tapped).toBe(true);
    s = toStep(s, "main1", opp);
    for (const id of theirs) expect(s.objects[id]!.tapped).toBe(true);
  });
});

describe("Hazezon, Shaper of Sand: Desert lands from your graveyard", () => {
  it("compile", () => supported(hazezonShaperOfSand));

  it("a Desert can be played from your graveyard, making two Sand Warriors; another land can't", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, hazezonShaperOfSand);
    const desert = into(s0, ap, card("Test Desert", "Land — Desert", "", { oracleText: "{T}: Add {C}." }), "graveyard");
    const other = into(s0, ap, card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." }), "graveyard");
    s0.players[ap]!.landsPlayedThisTurn = 0;
    expect(() => act(s0, { type: "playLand", player: ap, objectId: other })).toThrow();
    const s = settle(act(s0, { type: "playLand", player: ap, objectId: desert }));
    expect(s.objects[desert]!.zone).toBe("battlefield");
    expect(s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name.startsWith("Sand Warrior"))).toHaveLength(2);
  });
});

describe("Iron Man, Armored Avenger: other attacking modified creatures", () => {
  it("compile", () => supported(ironManArmoredAvenger));

  it("gain flying; an attacker without a counter doesn't", () => {
    const { s: s0, ap, opp } = setup([]);
    const im = putOnBattlefield(s0, ap, ironManArmoredAvenger);
    const mod = putOnBattlefield(s0, ap, bear({ name: "Modified Bear" }));
    const plain = putOnBattlefield(s0, ap, bear({ name: "Plain Bear" }));
    s0.objects[mod]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    const s = settle(attack(s0, ap, opp, [im, mod, plain]), { targets: [tgt(mod)] });
    expect(objHasKeyword(s, s.objects[mod]!, "Flying")).toBe(true);
    expect(objHasKeyword(s, s.objects[plain]!, "Flying")).toBe(false);
  });
});

describe("Nashi, Searcher in the Dark: any number of legendary and/or enchantment cards", () => {
  it("compile", () => supported(nashiSearcherInTheDark));

  const hit = (top: CardDef[], pick?: (ids: ObjectId[]) => ObjectId[]) => {
    const { s: s0, ap, opp } = setup([]);
    const n = putOnBattlefield(s0, ap, nashiSearcherInTheDark);
    const milled = [...top].reverse().map((d) => into(s0, ap, d, "library")).reverse();
    let s = toStep(attack(s0, ap, opp, [n]), "combatDamage", ap);
    for (let i = 0; i < 20 && s.pending?.kind !== "searchLibrary" && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: ap, found: pick ? pick(milled) : [] });
    s = settle(s);
    return { s, n, milled };
  };

  it("mills two; a legendary card and an enchantment may both go to your hand, and then no counter", () => {
    const { s, n, milled } = hit([legend(), enchantment()], (ids) => ids);
    for (const id of milled) expect(s.objects[id]!.zone).toBe("hand");
    expect(counters(s, n)).toBe(0);
  });

  it("a land isn't offered; putting none into your hand puts a +1/+1 counter on it", () => {
    const { s, n, milled } = hit([card("Milled Land", "Land"), enchantment()], () => []);
    for (const id of milled) expect(s.objects[id]!.zone).toBe("graveyard");
    expect(counters(s, n)).toBe(1);
  });
});

describe("Scouts, Pirates, and/or Rogues; Goblins and/or Orcs", () => {
  it("compile", () => supported(vaanStreetThief, bossUramonShadowsReach, mordorTrebuchet));

  it("Vaan: casting the exiled card (theirs) puts a +1/+1 counter on each Scout, Pirate, and Rogue you control", () => {
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, ap, vaanStreetThief);
    const rogue = putOnBattlefield(s0, ap, card("Test Rogue", "Creature — Human Rogue", "{1}", { power: "1", toughness: "1" }));
    const top = into(s0, opp, cantrip("Their Cantrip"), "library");
    let s = toStep(attack(s0, ap, opp, [v]), "combatDamage", ap);
    for (let i = 0; i < 20 && s.pending?.kind !== "castFree" && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[top]!.zone).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "castFree", how: "paid", objectId: top });
    s = settle(run(s, planCast(s, ap, top, undefined, undefined, "auto")));
    expect(s.players[opp]!.graveyard).toContain(top);
    expect(counters(s, v)).toBe(1);
    expect(counters(s, rogue)).toBe(1);
    expect(s.battlefield.some((id) => /Treasure/.test(s.cards[s.objects[id]!.cardId]!.name))).toBe(false);
  });

  it("Vaan: not casting it makes a Treasure; the card stays exiled", () => {
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, ap, vaanStreetThief);
    const top = into(s0, opp, cantrip("Their Cantrip"), "library");
    let s = toStep(attack(s0, ap, opp, [v]), "combatDamage", ap);
    for (let i = 0; i < 20 && s.pending?.kind !== "castFree" && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[top]!.zone).toBe("exile");
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && /Treasure/.test(s.cards[s.objects[id]!.cardId]!.name))).toHaveLength(1);
  });

  it("Boss Uramon: a Rogue dealing combat damage to a player makes a Rat; a Bear doesn't", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, bossUramonShadowsReach);
    const rogue = putOnBattlefield(s0, ap, card("Test Rogue", "Creature — Human Rogue", "{1}", { power: "1", toughness: "1" }));
    const rats = (s: GameState) => s.battlefield.filter((id) => /Rat/.test(s.cards[s.objects[id]!.cardId]!.name)).length;
    const b = putOnBattlefield(s0, ap, bear());
    const t = toStep(attack(structuredClone(s0), ap, opp, [b]), "main2", ap);
    expect(rats(t)).toBe(0);
    const s = toStep(attack(s0, ap, opp, [rogue]), "main2", ap);
    expect(rats(s)).toBe(1);
  });

  it("Mordor Trebuchet: attacking with an Orc makes a tapped and attacking Ballistic Boulder, sacrificed at end of combat", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, mordorTrebuchet);
    const orc = putOnBattlefield(s0, ap, card("Test Orc", "Creature — Orc Army", "{1}", { power: "1", toughness: "1" }));
    let s = settle(attack(s0, ap, opp, [orc]));
    // Its controller chooses what it attacks (rulings): any player, not only the one the Orc attacks.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "attackWhom" });
    const other = next(s, opp);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(other) }));
    const boulder = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Ballistic Boulder")!;
    expect(boulder).toBeDefined();
    expect(s.objects[boulder]!.tapped).toBe(true);
    expect(s.objects[boulder]!.attacking).toBe(other);
    s = toStep(s, "main2", ap);
    expect(s.objects[boulder]?.zone ?? "gone").not.toBe("battlefield");
  });
});

describe("Fire Navy Trebuchet: a token named Ballistic Boulder that's tapped and attacking", () => {
  it("compile", () => supported(fireNavyTrebuchet));

  it("the token is named Ballistic Boulder and enters tapped and attacking (it used to get the whole phrase as its name)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, fireNavyTrebuchet);
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(attack(s0, ap, opp, [b]));
    if (s.pending?.kind === "chooseOption") s = settle(act(s, { type: "chooseOption", player: ap, choice: String(opp) }));
    const boulder = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Ballistic Boulder")!;
    expect(boulder).toBeDefined();
    expect(s.objects[boulder]!.tapped).toBe(true);
    expect(s.objects[boulder]!.attacking).toBe(opp);
  });
});

describe("Aragorn, Hornburg Hero: granted renown and a renowned creature", () => {
  it("compile", () => supported(aragornHornburgHero));

  it("an attacker has first strike and renown 1; it becomes renowned without doubling, and the next time doubles its counters", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, aragornHornburgHero);
    const b = putOnBattlefield(s0, ap, bear());
    expect(objHasKeyword(s0, s0.objects[b]!, "First strike")).toBe(false);
    let s = attack(s0, ap, opp, [b]);
    expect(objHasKeyword(s, s.objects[b]!, "First strike")).toBe(true);
    s = toStep(s, "main2", ap);
    expect(s.objects[b]!.renowned).toBe(true);
    expect(counters(s, b)).toBe(1);
    // Not attacking: no renown, no first strike.
    expect(objHasKeyword(s, s.objects[b]!, "First strike")).toBe(false);
    // Its next turn.
    s = toStep(s, "main1", ap);
    s = toStep(attack(s, ap, opp, [b]), "main2", ap);
    expect(counters(s, b)).toBe(2);
  });
});

describe("Primo, the Unbounded: creatures you control with base power 0", () => {
  it("compile", () => supported(primoTheUnbounded));

  it("one with base power 0 and counters deals 3: a Fractal with three +1/+1 counters; a Bear alone: none", () => {
    const { s: s0, ap, opp } = setup([]);
    s0.objects[putOnBattlefield(s0, ap, primoTheUnbounded, { sick: true })]!.counters["+1/+1"] = 2;
    const f = putOnBattlefield(s0, ap, card("Test Fractal", "Creature — Fractal", "{1}", { power: "0", toughness: "0" }));
    s0.objects[f]!.counters["+1/+1"] = 3;
    const b = putOnBattlefield(s0, ap, bear());
    invalidateCharacteristics(s0);
    const fractals = (s: GameState) => s.battlefield.filter((id) => id !== f && s.cards[s.objects[id]!.cardId]!.name.startsWith("Fractal"));
    const t = toStep(attack(structuredClone(s0), ap, opp, [b]), "main2", ap);
    expect(fractals(t)).toHaveLength(0);
    const s = toStep(attack(s0, ap, opp, [f, b]), "main2", ap);
    const made = fractals(s);
    expect(made).toHaveLength(1);
    expect(counters(s, made[0]!)).toBe(3);
  });
});
