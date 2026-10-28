// Round 191: more of the harder cards both lanes skipped, from the most played down: "in addition to their other
// creature types" with base power and toughness (Graaz, Unstoppable Juggernaut), "the exiled card's power" (Lobelia
// Sackville-Baggins), a hand card put on the bottom of its owner's library (Vendilion Clique), "unless its controller
// pays twice {X}" and "up to two of them" (Thassa's Intervention), "put a counter on a creature you control" once each
// turn (Mikey & Leo), "the first ... spell with flying you cast during each of your turns" (Momo, Friendly Flier),
// Aura-enchanted attackers of any player (Killian, Decisive Mentor), "choose a permanent type" (Creeping Renaissance),
// "if you didn't draw cards this way" (Mr. Foxglove), "twice that much {G}" (Fangorn, Tree Shepherd), searching the
// graveyard, hand and library (Kassandra, Eagle Bearer), "if you put a Town card into your hand this way" (Town Greeter)
// and starting loyalty X (Nissa, Steward of Elements).

import { describe, expect, it } from "vitest";
import { act, bear, card, commander, mountain, passUntil, putOnBattlefield, scry, setup, swamp } from "./helpers";
import { botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, legalTargets, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; "you may" questions get `yes`, copies keep their targets. Stops at any other question. */
const resolveAll = (s: GameState, yes = true) => {
  for (let i = 0; i < 120 && (s.stack.length || s.triggerQueue.length || s.pending?.kind === "chooseMay" || s.pending?.kind === "copyTargets"); i++) {
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes });
    else if (s.pending?.kind === "copyTargets") s = act(s, { type: "copyTargets", player: s.pending.player });
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const choose = (s: GameState, targets: TargetChoice[]) => (s.pending?.kind === "chooseTargets" ? resolveAll(act(s, { type: "chooseTargets", player: s.pending.player, targets })) : s);
const modes = (s: GameState, m: number[]) => {
  if (s.pending?.kind !== "chooseModes") throw new Error(`no modes question: ${s.pending?.kind}`);
  return act(s, { type: "chooseModes", player: s.pending.player, modes: m });
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const counters = (s: GameState, id: string, c = "+1/+1") => s.objects[id]!.counters[c] ?? 0;
const pt = (s: GameState, id: ObjectId) => [power(s, s.objects[id]!), toughness(s, s.objects[id]!)];
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && s.cards[s.objects[id]!.cardId]!.name === name);
const lands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).types.includes("Land"));
const tapAllBut = (s: GameState, pid: PlayerId, keep: ObjectId[]) => {
  for (const id of lands(s, pid)) s.objects[id]!.tapped = !keep.includes(id);
  invalidateCharacteristics(s);
};
const next = (s: GameState, pid: PlayerId, k = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + k) % 4]!;
/** Passes (no blocks, "you may" answered yes) until `step` of `ap`'s turn with an empty stack, or until another question. */
const toStep = (s: GameState, step: GameState["step"], ap: PlayerId) => {
  for (let i = 0; i < 800; i++) {
    if (s.step === step && s.activePlayer === ap && !s.stack.length && !s.triggerQueue.length && !s.pending) return s;
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: true });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  throw new Error(`never reached ${step}`);
};
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId; planeswalker?: ObjectId }[]) => act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks });
const shock = card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "This spell deals 2 damage to any target." });
const bolt = card("Test Bolt", "Instant", "{R}", { cmc: 1, oracleText: "This spell deals 3 damage to any target." });
const creature = (name: string, sub: string, p: number, t = p) => card(name, `Creature — ${sub}`, "{G}", { cmc: 1, power: String(p), toughness: String(t) });


// Real oracle text (Scryfall).
const graaz = card("Graaz, Unstoppable Juggernaut", "Legendary Artifact Creature — Juggernaut", "{8}", {"cmc":8,"power":"7","toughness":"5","keywords":[],"oracleText":"Juggernauts you control attack each combat if able.\nJuggernauts you control can't be blocked by Walls.\nOther creatures you control have base power and toughness 5/3 and are Juggernauts in addition to their other creature types.","colors":[],"layout":"normal"});
const lobelia = card("Lobelia Sackville-Baggins", "Legendary Creature — Halfling Citizen", "{2}{B}", {"cmc":3,"power":"2","toughness":"3","keywords":["Treasure","Menace","Flash"],"oracleText":"Flash\nMenace\nWhen Lobelia enters, exile target creature card from an opponent's graveyard that was put there from the battlefield this turn, then create X Treasure tokens, where X is the exiled card's power.","colors":["B"],"layout":"normal"});
const clique = card("Vendilion Clique", "Legendary Creature — Faerie Wizard", "{1}{U}{U}", {"cmc":3,"power":"3","toughness":"1","keywords":["Flying","Flash"],"oracleText":"Flash\nFlying\nWhen Vendilion Clique enters, look at target player's hand. You may choose a nonland card from it. If you do, that player reveals the chosen card, puts it on the bottom of their library, then draws a card.","colors":["U"],"layout":"normal"});
const thassasIntervention = card("Thassa's Intervention", "Instant", "{X}{U}{U}", {"cmc":2,"keywords":[],"oracleText":"Choose one —\n• Look at the top X cards of your library. Put up to two of them into your hand and the rest on the bottom of your library in a random order.\n• Counter target spell unless its controller pays twice {X}.","colors":["U"],"layout":"normal"});
const mikeyAndLeo = card("Mikey & Leo, Chaos & Order", "Legendary Creature — Mutant Ninja Turtle", "{G/W}{G/W}", {"cmc":2,"power":"2","toughness":"2","keywords":[],"oracleText":"Whenever you put a counter on a creature you control, draw a card. This ability triggers only once each turn.","colors":["G","W"],"layout":"normal"});
const momo = card("Momo, Friendly Flier", "Legendary Creature — Lemur Bat Ally", "{W}", {"cmc":1,"power":"1","toughness":"1","keywords":["Flying"],"oracleText":"Flying\nThe first non-Lemur creature spell with flying you cast during each of your turns costs {1} less to cast.\nWhenever another creature you control with flying enters, Momo gets +1/+1 until end of turn.","colors":["W"],"layout":"normal"});
const killian = card("Killian, Decisive Mentor", "Legendary Creature — Human Warlock", "{1}{W}{B}", {"cmc":3,"power":"2","toughness":"3","keywords":["Goad"],"oracleText":"Whenever an enchantment you control enters, tap up to one target creature and goad it. (Until your next turn, that creature attacks each combat if able and attacks a player other than you if able.)\nWhenever one or more creatures that are enchanted by an Aura you control attack, draw a card.","colors":["B","W"],"layout":"normal"});
const creepingRenaissance = card("Creeping Renaissance", "Sorcery", "{3}{G}{G}", {"cmc":5,"keywords":["Flashback"],"oracleText":"Choose a permanent type. Return all cards of the chosen type from your graveyard to your hand.\nFlashback {5}{G}{G} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["G"],"layout":"normal"});
const foxglove = card("Mr. Foxglove", "Legendary Creature — Fox Rogue", "{2}{G}{W}{U}", {"cmc":5,"power":"3","toughness":"5","keywords":["Lifelink"],"oracleText":"Lifelink\nWhenever Mr. Foxglove attacks, draw cards equal to the number of cards in defending player's hand minus the number of cards in your hand. If you didn't draw cards this way, you may put a creature card from your hand onto the battlefield.","colors":["G","U","W"],"layout":"normal"});
const fangorn = card("Fangorn, Tree Shepherd", "Legendary Creature — Treefolk", "{4}{G}{G}{G}", {"cmc":7,"power":"4","toughness":"10","keywords":[],"oracleText":"Treefolk you control have vigilance.\nWhenever one or more Treefolk you control attack, add twice that much {G}.\nYou don't lose unspent green mana as steps and phases end.","colors":["G"],"layout":"normal"});
const kassandra = card("Kassandra, Eagle Bearer", "Legendary Creature — Human Assassin Warrior", "{1}{R}{W}", {"cmc":3,"power":"2","toughness":"2","keywords":["Haste"],"oracleText":"Haste\nWhen Kassandra enters, search your graveyard, hand, and library for a card named The Spear of Leonidas, put it onto the battlefield, then shuffle.\nWhenever a creature you control with a legendary Equipment attached to it deals combat damage to a player, draw a card.","colors":["R","W"],"layout":"normal"});
const townGreeter = card("Town Greeter", "Creature — Human Citizen", "{1}{G}", {"cmc":2,"power":"1","toughness":"1","keywords":["Mill"],"oracleText":"When this creature enters, mill four cards. You may put a land card from among them into your hand. If you put a Town card into your hand this way, you gain 2 life. (To mill four cards, a player puts the top four cards of their library into their graveyard.)","colors":["G"],"layout":"normal"});
const nissa = card("Nissa, Steward of Elements", "Legendary Planeswalker — Nissa", "{X}{G}{U}", {"cmc":2,"loyalty":"X","keywords":["Scry"],"oracleText":"+2: Scry 2.\n0: Look at the top card of your library. If it's a land card or a creature card with mana value less than or equal to the number of loyalty counters on Nissa, you may put that card onto the battlefield.\n−6: Untap up to two target lands you control. They become 5/5 Elemental creatures with flying and haste until end of turn. They're still lands.","colors":["G","U"],"layout":"normal"});
const spear = card("The Spear of Leonidas", "Legendary Artifact — Equipment", "{2}{R}", {"cmc":3,"keywords":["Bull Rush","Summon","Equip","Revelation"],"oracleText":"Whenever equipped creature attacks, choose one —\n• Bull Rush — It gains double strike until end of turn.\n• Summon — Create Phobos, a legendary 3/2 red Horse creature token.\n• Revelation — Discard two cards, then draw two cards.\nEquip {2}","colors":["R"],"layout":"normal"});
const adventurersInn = card("Adventurer's Inn", "Land — Town", "", {"cmc":0,"keywords":[],"oracleText":"When this land enters, you gain 2 life.\n{T}: Add {C}.","colors":[],"layout":"normal"});
const morbidBloom = card("Morbid Bloom", "Sorcery", "{4}{B}{G}", {"cmc":6,"keywords":[],"oracleText":"Exile target creature card from a graveyard, then create X 1/1 green Saproling creature tokens, where X is the exiled card's toughness.","colors":["B","G"],"layout":"normal"});
const scourTheDesert = card("Scour the Desert", "Sorcery", "{3}{W}{W}", {"cmc":5,"keywords":[],"oracleText":"Exile target creature card from your graveyard. Create X 1/1 white Bird creature tokens with flying, where X is the exiled card's toughness.","colors":["W"],"layout":"normal"});
const shadowProphecy = card("Shadow Prophecy", "Instant", "{2}{B}", {"cmc":3,"keywords":["Domain"],"oracleText":"Domain — Look at the top X cards of your library, where X is the number of basic land types among lands you control. Put up to two of them into your hand and the rest into your graveyard. You lose 2 life.","colors":["B"],"layout":"normal"});
const manaRig = card("The Mana Rig", "Legendary Artifact", "{3}", {"cmc":3,"keywords":[],"oracleText":"Whenever you cast a multicolored spell, create a tapped Powerstone token. (It's an artifact with \"{T}: Add {C}. This mana can't be spent to cast a nonartifact spell.\")\n{X}{X}{X}, {T}: Look at the top X cards of your library. Put up to two of them into your hand and the rest on the bottom of your library in a random order.","colors":[],"layout":"normal"});

const ALL = [graaz, lobelia, clique, thassasIntervention, mikeyAndLeo, momo, killian, creepingRenaissance, foxglove, fangorn, kassandra, townGreeter, nissa, morbidBloom, scourTheDesert, shadowProphecy, manaRig];
const grow = card("Test Grow", "Instant", "{G}", { cmc: 1, oracleText: "Put a +1/+1 counter on target creature." });
const flier = (name: string, sub = "Bird") => card(name, `Creature — ${sub}`, "{1}{W}", { cmc: 2, power: "1", toughness: "1", keywords: ["Flying"], oracleText: "Flying" });
const aura = card("Test Aura", "Enchantment — Aura", "{W}", { cmc: 1, oracleText: "Enchant creature" });
const goaded = (s: GameState, id: ObjectId) => s.effects.some((e) => e.affected?.includes(id) && e.mods.some((m) => m.kind === "goad"));
const hand = (s: GameState, pid: PlayerId) => s.players[pid]!.hand;
const pass = (s: GameState, until: (s: GameState) => boolean) => {
  for (let i = 0; i < 20 && !until(s); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};

describe("round 191", () => {
  it("all compile", () => supported(...ALL));

  it("Graaz: other creatures you control are 5/3 Juggernauts in addition to their types; counters still count; not opponents'", () => {
    const { s, ap, opp } = setup([]);
    const g = putOnBattlefield(s, ap, graaz);
    const mine = putOnBattlefield(s, ap, creature("Test Mine", "Beast", 2));
    const theirs = putOnBattlefield(s, opp, creature("Test Theirs", "Beast", 2));
    s.objects[mine]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s);
    expect(pt(s, g)).toEqual([7, 5]);
    expect(pt(s, mine)).toEqual([6, 4]);
    expect(characteristics(s, s.objects[mine]!).subtypes).toEqual(expect.arrayContaining(["Beast", "Juggernaut"]));
    expect(pt(s, theirs)).toEqual([2, 2]);
    expect(characteristics(s, s.objects[theirs]!).subtypes).not.toContain("Juggernaut");
  });

  it("Lobelia exiles a creature card that died this turn, not one milled there, and makes Treasures equal to its power", () => {
    let { s, ap, opp, ids } = setup([shock, lobelia]);
    const victim = putOnBattlefield(s, opp, creature("Test Victim", "Beast", 3, 2));
    const milled = into(s, opp, creature("Test Milled", "Beast", 5), "graveyard");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(victim)])));
    expect(zone(s, victim)).toBe("graveyard");
    s = run(s, planCast(s, ap, ids[1]!));
    s = pass(s, (x) => x.pending?.kind === "chooseTargets");
    expect(s.pending?.kind).toBe("chooseTargets");
    const spec = (s.pending as { specs: Parameters<typeof legalTargets>[1][] }).specs[0]!;
    const legal = legalTargets(s, spec, ap).map((t) => (t as { id?: string }).id);
    expect(legal).toContain(victim);
    expect(legal).not.toContain(milled);
    s = choose(s, [tgt(victim)]);
    expect(zone(s, victim)).toBe("exile");
    expect(named(s, ap, "Treasure Token")).toHaveLength(3);
  });

  it("Morbid Bloom and Scour the Desert: tokens equal to the exiled card's toughness", () => {
    let { s, ap, opp, ids } = setup([morbidBloom, scourTheDesert]);
    const theirs = into(s, opp, creature("Test Theirs", "Beast", 1, 4), "graveyard");
    const mine = into(s, ap, creature("Test Mine", "Beast", 5, 2), "graveyard");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(theirs)])));
    expect(zone(s, theirs)).toBe("exile");
    expect(named(s, ap, "Saproling Token")).toHaveLength(4);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(mine)])));
    expect(zone(s, mine)).toBe("exile");
    expect(named(s, ap, "Bird Token")).toHaveLength(2);
  });

  it("Vendilion Clique: the chosen nonland card goes to the bottom of its owner's library and they draw a card", () => {
    let { s, ap, opp, ids } = setup([clique]);
    const land = into(s, opp, mountain, "hand");
    const spell = into(s, opp, bolt, "hand");
    const before = hand(s, opp).length;
    s = run(s, planCast(s, ap, ids[0]!));
    s = pass(s, (x) => !!x.pending);
    s = act(s, { type: "chooseTargets", player: ap, targets: [player(opp)] });
    s = pass(s, (x) => x.pending?.kind === "searchLibrary");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const offered = (s.pending as { cards: ObjectId[] }).cards;
    expect(offered).toContain(spell);
    expect(offered).not.toContain(land);
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [spell] }));
    const lib = s.players[opp]!.library;
    expect(lib[lib.length - 1]).toBe(spell);
    expect(hand(s, opp)).toHaveLength(before);
    expect(hand(s, opp)).toContain(land);
  });

  it("Thassa's Intervention: up to two of the top X into your hand; or counter unless its controller pays twice {X}", () => {
    let { s, ap, ids } = setup([thassasIntervention]);
    const top = [0, 1, 2].map((i) => into(s, ap, creature(`Test Top ${i}`, "Beast", 1), "library")).reverse();
    s = run(s, planCast(s, ap, ids[0]!, [], [0], undefined, 3));
    s = pass(s, (x) => !!x.pending);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", min: 0, max: 2 });
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [top[0]!] }));
    expect(zone(s, top[0]!)).toBe("hand");
    expect(zone(s, top[1]!)).toBe("library");
    expect(zone(s, top[2]!)).toBe("library");

    const sorcery = card("Test Sorcery", "Sorcery", "{1}", { cmc: 1, oracleText: "Draw a card." });
    const t = setup([sorcery, thassasIntervention]);
    s = run(t.s, planCast(t.s, t.ap, t.ids[0]!));
    s = run(s, planCast(s, t.ap, t.ids[1]!, [{ kind: "stack", id: s.stack[0]!.id }], [1], undefined, 2));
    s = pass(s, (x) => !!x.pending);
    expect(s.pending).toMatchObject({ kind: "payUnless", player: t.ap, cost: "{4}" });
    s = resolveAll(act(s, { type: "payUnless", player: t.ap, pay: false }));
    expect(zone(s, t.ids[0]!)).toBe("graveyard");
    expect(s.stack).toHaveLength(0);
  });

  it("The Mana Rig: {X}{X}{X} looks at the top X cards and puts up to two into your hand, the rest on the bottom", () => {
    let { s, ap } = setup([]);
    const rig = putOnBattlefield(s, ap, manaRig);
    const top = [0, 1, 2].map((i) => into(s, ap, creature(`Test Top ${i}`, "Beast", 1), "library")).reverse();
    s = run(s, planActivate(s, ap, rig, 0, [], undefined, undefined, 3));
    s = pass(s, (x) => !!x.pending);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", min: 0, max: 2 });
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [top[0]!, top[2]!] }));
    expect([top[0], top[1], top[2]].map((id) => zone(s, id!))).toEqual(["hand", "library", "hand"]);
    const lib = s.players[ap]!.library;
    expect(lib[lib.length - 1]).toBe(top[1]);
  });

  it("Mikey & Leo draw a card the first time each turn you put a counter on a creature you control", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, mikeyAndLeo);
    const mine = putOnBattlefield(s, ap, creature("Test Mine", "Beast", 2));
    const a = into(s, ap, grow, "hand");
    const b = into(s, ap, grow, "hand");
    const before = hand(s, ap).length;
    s = resolveAll(run(s, planCast(s, ap, a, [tgt(mine)])));
    expect(hand(s, ap)).toHaveLength(before);
    s = resolveAll(run(s, planCast(s, ap, b, [tgt(mine)])));
    expect(hand(s, ap)).toHaveLength(before - 1);
    expect(counters(s, mine)).toBe(2);
  });

  it("Momo: the first non-Lemur creature spell with flying each of your turns costs {1} less; another flier entering pumps Momo", () => {
    let { s, ap } = setup([]);
    const m = putOnBattlefield(s, ap, momo);
    const lemur = into(s, ap, flier("Test Lemur", "Lemur"), "hand");
    const first = into(s, ap, flier("Test First"), "hand");
    const second = into(s, ap, flier("Test Second"), "hand");
    const plains = lands(s, ap).filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Plains");
    tapAllBut(s, ap, [plains[0]!]);
    expect(planCast(s, ap, lemur)).toBeNull();
    s = resolveAll(run(s, planCast(s, ap, first)));
    expect(zone(s, first)).toBe("battlefield");
    expect(pt(s, m)).toEqual([2, 2]);
    tapAllBut(s, ap, [plains[1]!]);
    expect(planCast(s, ap, second)).toBeNull();
  });

  it("Killian: an enchantment entering taps and goads up to one creature; any player's attack with your Aura on an attacker draws", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, killian);
    const theirs = putOnBattlefield(s, opp, creature("Test Theirs", "Beast", 2));
    const mine = putOnBattlefield(s, ap, creature("Test Mine", "Beast", 2));
    const a = into(s, ap, aura, "hand");
    s = run(s, planCast(s, ap, a, [tgt(theirs)]));
    s = pass(s, (x) => x.pending?.kind === "chooseTargets");
    s = choose(s, [tgt(theirs)]);
    expect(s.objects[a]!.attachedTo).toBe(theirs);
    expect(s.objects[theirs]!.tapped).toBe(true);
    expect(goaded(s, theirs)).toBe(true);
    // My creature without an Aura attacks: no card.
    const before = hand(s, ap).length;
    s = resolveAll(attack(s, ap, [{ attacker: mine, defender: opp }]));
    expect(hand(s, ap)).toHaveLength(before);
    // The opponent's goaded creature, enchanted by my Aura, attacks on their turn: I draw.
    s = passUntil(s, "declareAttackers", opp);
    const h = hand(s, ap).length;
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: theirs, defender: next(s, opp) }] });
    s = resolveAll(s);
    expect(hand(s, ap)).toHaveLength(h + 1);
  });

  it("Creeping Renaissance returns the cards of the chosen permanent type from your graveyard", () => {
    let { s, ap, ids } = setup([creepingRenaissance]);
    const beast = into(s, ap, creature("Test Beast", "Beast", 2), "graveyard");
    const golem = into(s, ap, card("Test Golem", "Artifact Creature — Golem", "{3}", { cmc: 3, power: "3", toughness: "3" }), "graveyard");
    const relic = into(s, ap, card("Test Relic", "Artifact", "{1}", { cmc: 1 }), "graveyard");
    const instant = into(s, ap, shock, "graveyard");
    s = run(s, planCast(s, ap, ids[0]!));
    s = pass(s, (x) => !!x.pending);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap });
    expect((s.pending as { options: string[] }).options).toEqual(["Artifact", "Battle", "Creature", "Enchantment", "Land", "Planeswalker"]);
    // The bot picks the type with the most cards in its graveyard: two artifacts.
    expect(botActions(s, ap)).toEqual([{ type: "chooseOption", player: ap, choice: "Artifact" }]);
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: "Artifact" }));
    expect(zone(s, golem)).toBe("hand");
    expect(zone(s, relic)).toBe("hand");
    expect(zone(s, beast)).toBe("graveyard");
    expect(zone(s, instant)).toBe("graveyard");
  });

  it("Mr. Foxglove draws the difference in hand sizes; drawing none, you may put a creature card from your hand onto the battlefield", () => {
    let { s, ap, opp } = setup([]);
    const fox = putOnBattlefield(s, ap, foxglove);
    for (let i = 0; i < 5; i++) into(s, opp, mountain, "hand");
    const big = into(s, ap, creature("Test Big", "Beast", 6), "hand");
    const n = hand(s, opp).length - hand(s, ap).length;
    expect(n).toBeGreaterThan(0);
    const before = hand(s, ap).length;
    s = resolveAll(attack(s, ap, [{ attacker: fox, defender: opp }]));
    expect(hand(s, ap)).toHaveLength(before + n);
    expect(zone(s, big)).toBe("hand");
    expect(s.pending).toBeFalsy();
  });

  it("Mr. Foxglove: with no cards drawn, a creature card from your hand onto the battlefield", () => {
    let { s, ap, opp } = setup([]);
    const fox = putOnBattlefield(s, ap, foxglove);
    const big = into(s, ap, creature("Test Big", "Beast", 6), "hand");
    expect(hand(s, opp).length).toBeLessThanOrEqual(hand(s, ap).length);
    s = attack(s, ap, [{ attacker: fox, defender: opp }]);
    s = pass(s, (x) => !!x.pending && x.pending.kind !== "chooseMay");
    for (let i = 0; i < 5 && s.pending?.kind === "chooseMay"; i++) s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = act(s, { type: "searchLibrary", player: ap, found: [big] });
    s = resolveAll(s);
    expect(zone(s, big)).toBe("battlefield");
  });

  it("Fangorn adds twice that much {G} for the Treefolk that attack, and the green mana stays through the steps", () => {
    let { s, ap, opp } = setup([]);
    const f = putOnBattlefield(s, ap, fangorn);
    const t = putOnBattlefield(s, ap, creature("Test Treefolk", "Treefolk", 2));
    const b = putOnBattlefield(s, ap, creature("Test Beast", "Beast", 2));
    s = resolveAll(attack(s, ap, [{ attacker: f, defender: opp }, { attacker: t, defender: opp }, { attacker: b, defender: opp }]));
    expect(s.objects[f]!.tapped).toBe(false);
    expect(s.players[ap]!.manaPool.G).toBe(4);
    s = toStep(s, "main2", ap);
    expect(s.players[ap]!.manaPool.G).toBe(4);
  });

  it("Kassandra puts The Spear of Leonidas onto the battlefield from your hand; legendary Equipment carriers draw on combat damage", () => {
    let { s, ap, opp, ids } = setup([kassandra]);
    const sp = into(s, ap, spear, "hand");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    if (s.pending) {
      expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
      s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [sp] }));
    }
    expect(zone(s, sp)).toBe("battlefield");
    const carrier = putOnBattlefield(s, ap, creature("Test Carrier", "Beast", 2));
    const plain = putOnBattlefield(s, ap, creature("Test Plain", "Beast", 2));
    const sword = putOnBattlefield(s, ap, card("Test Sword", "Artifact — Equipment", "{1}", { cmc: 1, oracleText: "Equip {1}" }));
    s.objects[sp]!.attachedTo = carrier;
    s.objects[sword]!.attachedTo = plain;
    invalidateCharacteristics(s);
    s = attack(s, ap, [{ attacker: carrier, defender: opp }, { attacker: plain, defender: opp }]);
    // Summon, not Bull Rush: double strike would deal combat damage twice.
    for (let i = 0; i < 20 && s.pending?.kind === "chooseModes"; i++) s = modes(s, [1]);
    const before = hand(s, ap).length;
    s = toStep(s, "main2", ap);
    expect(hand(s, ap)).toHaveLength(before + 1);
  });

  it("Town Greeter: the land put into your hand gains 2 life only if it's a Town", () => {
    for (const [def, gain] of [[adventurersInn, 2], [mountain, 0]] as const) {
      let { s, ap, ids } = setup([townGreeter]);
      const l = into(s, ap, def, "library");
      for (let i = 0; i < 3; i++) into(s, ap, bear(), "library");
      const start = life(s, ap);
      s = run(s, planCast(s, ap, ids[0]!));
      s = pass(s, (x) => !!x.pending);
      for (let i = 0; i < 5 && s.pending?.kind === "chooseMay"; i++) s = act(s, { type: "chooseMay", player: ap, yes: true });
      expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
      s = act(s, { type: "searchLibrary", player: ap, found: [l] });
      s = resolveAll(s);
      expect(zone(s, l)).toBe("hand");
      expect(life(s, ap)).toBe(start + gain);
    }
  });

  it("Nissa enters with X loyalty; her 0 puts a creature card with mana value up to her loyalty onto the battlefield", () => {
    let { s, ap, ids } = setup([nissa]);
    const c = into(s, ap, card("Test Three", "Creature — Beast", "{2}{G}", { cmc: 3, power: "3", toughness: "3" }), "library");
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [], undefined, undefined, 3)));
    expect(s.objects[ids[0]!]!.counters.loyalty).toBe(3);
    s = run(s, planActivate(s, ap, ids[0]!, 1));
    s = resolveAll(s);
    expect(zone(s, c)).toBe("battlefield");
    expect(s.objects[ids[0]!]!.counters.loyalty).toBe(3);
  });

  it("Nissa cast for X = 0 enters with no loyalty and goes to the graveyard; the bot never chooses X = 0", () => {
    let { s, ap, ids } = setup([nissa]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [], undefined, undefined, 0)));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    // The bot plays its land first, then casts Nissa with X of at least 1.
    let b = setup([nissa]).s;
    const bot = b.activePlayer;
    const nissaId = b.players[bot]!.hand.find((id) => b.cards[b.objects[id]!.cardId]!.name === nissa.name)!;
    // Only Nissa to cast: the commander and the bears of the opening hand would go first.
    b.players[bot]!.command = [];
    b.players[bot]!.hand = b.players[bot]!.hand.filter((id) => id === nissaId || characteristics(b, b.objects[id]!).types.includes("Land"));
    let cast: Action | undefined;
    for (let i = 0; i < 5 && !cast; i++) {
      const acts = botActions(b, bot);
      cast = acts.find((a) => a.type === "castSpell" && a.objectId === nissaId);
      if (!cast && acts[0]?.type === "playLand") b = act(b, acts[0]);
      else if (!cast) break;
    }
    expect(cast).toBeDefined();
    expect((cast as { x?: number }).x ?? 0).toBeGreaterThanOrEqual(1);
  });
});
