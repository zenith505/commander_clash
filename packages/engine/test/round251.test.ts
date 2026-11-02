// Round 251: the top of the popularity list and earlier skip lists. Aurelia, Exemplar of Justice (+2/+0 always, each
// keyword only for its color as the trigger resolves; rulings), Rowan's Grim Search (bargained: up to two of the top four
// back on top in any order, the rest into the graveyard, CR 401.4), Drowner of Truth (a cast trigger with an intervening
// "if {C} was spent to cast it", CR 603.4, 601.2h), Hidetsugu and Kairi (life loss equal to the exiled card's mana value,
// then a free cast of it as the ability resolves, CR 608.2g), Summons of Saruman (cast a milled instant or sorcery with
// mana value X or less), Faerie Slumber Party (two tokens for each opponent who controlled a returned creature), Demonlord
// Belzenlok (exile until a nonland card, into the hand, repeated while its mana value is 4 or more; one damage event),
// Kamahl's Druidic Vow (lands and/or legendary permanent cards with mana value X or less from among the top X), Aang's
// Journey (kicked: one search for a basic land card and a Shrine card, CR 701.23) and Astelli Reclaimer (a target with
// mana value up to the mana actually spent to cast it, warp included; rulings).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, controllerOf, defOf, destroyPermanent, invalidateCharacteristics, isFullySupported, objHasKeyword, planCast, power, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

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
/** Everyone passes until the stack is empty, answering trigger targets with `targets`; stops at any other question. */
const settle = (s: GameState, opts: { targets?: TargetChoice[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** The bots' answers for every question, whoever is asked, until the stack is empty. */
const settleBots = (s: GameState) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    s = s.pending ? botActions(s, pid).reduce((x, a) => act(x, a), s) : act(s, { type: "passPriority", player: pid });
  }
  return s;
};
/** Cards on top of `pid`'s library, `defs[0]` on top; their ids in the same order. */
const onTop = (s: GameState, pid: PlayerId, defs: CardDef[]) => [...defs].reverse().map((d) => into(s, pid, d, "library")).reverse();
const named = (s: GameState, name: string, zone = "battlefield") => Object.values(s.objects).filter((o) => o.zone === zone && characteristics(s, o).name === name).map((o) => o.id);

// Real oracle text (Scryfall).
const aurelia = (): CardDef => ({"oracleId":"2e1e0385-1537-4cb6-9d24-e4593d9a8f4a","name":"Aurelia, Exemplar of Justice","manaCost":"{2}{R}{W}","cmc":4,"typeLine":"Legendary Creature — Angel","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nMentor (Whenever this creature attacks, put a +1/+1 counter on target attacking creature with lesser power.)\nAt the beginning of combat on your turn, choose up to one target creature you control. Until end of turn, that creature gets +2/+0, gains trample if it's red, and gains vigilance if it's white.","power":"2","toughness":"5","colors":["R","W"],"colorIdentity":["R","W"],"keywords":["Flying","Mentor"],"imageUrl":"https://cards.scryfall.io/normal/front/a/8/a8e9f4d2-bba5-4061-8ae7-a68b912f2c11.jpg?1783934144","artUrl":"https://cards.scryfall.io/art_crop/front/a/8/a8e9f4d2-bba5-4061-8ae7-a68b912f2c11.jpg?1783934144","commanderLegal":"legal","set":"grn","releasedAt":"2018-10-05","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const grim = (): CardDef => ({"oracleId":"f60234e4-9b53-47a5-a21a-82c80b5af072","name":"Rowan's Grim Search","manaCost":"{2}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Bargain (You may sacrifice an artifact, enchantment, or token as you cast this spell.)\nIf this spell was bargained, look at the top four cards of your library, then put up to two of them back on top of your library in any order and the rest into your graveyard.\nYou draw two cards and you lose 2 life.","colors":["B"],"colorIdentity":["B"],"keywords":["Bargain"],"imageUrl":"https://cards.scryfall.io/normal/front/1/b/1be6786e-0569-42dd-b03c-82da7b32a14f.jpg?1783915104","artUrl":"https://cards.scryfall.io/art_crop/front/1/b/1be6786e-0569-42dd-b03c-82da7b32a14f.jpg?1783915104","commanderLegal":"legal","set":"woe","releasedAt":"2023-09-08","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const drowner = (): CardDef => ({"oracleId":"db19a27a-ee22-4931-ae3c-0ce21f456ea6","name":"Drowner of Truth // Drowned Jungle","manaCost":"{5}{G/U}{G/U}","cmc":7,"typeLine":"Creature — Eldrazi // Land","supertypes":[],"types":["Creature"],"subtypes":["Eldrazi"],"oracleText":"Devoid (This card has no color.)\nWhen you cast this spell, if {C} was spent to cast it, create two 0/1 colorless Eldrazi Spawn creature tokens with \"Sacrifice this token: Add {C}.\"","power":"7","toughness":"6","colors":[],"colorIdentity":["G","U"],"keywords":["Devoid"],"producedMana":["C","G","U"],"imageUrl":"https://cards.scryfall.io/normal/front/7/a/7a1d3c1d-1373-4ac4-bb26-9780976efc4f.jpg?1783911227","artUrl":"https://cards.scryfall.io/art_crop/front/7/a/7a1d3c1d-1373-4ac4-bb26-9780976efc4f.jpg?1783911227","commanderLegal":"legal","set":"mh3","releasedAt":"2024-06-14","rarity":"uncommon","layout":"modal_dfc","gameChanger":false,"faces":[{"name":"Drowner of Truth","manaCost":"{5}{G/U}{G/U}","typeLine":"Creature — Eldrazi","supertypes":[],"types":["Creature"],"subtypes":["Eldrazi"],"oracleText":"Devoid (This card has no color.)\nWhen you cast this spell, if {C} was spent to cast it, create two 0/1 colorless Eldrazi Spawn creature tokens with \"Sacrifice this token: Add {C}.\"","power":"7","toughness":"6","colors":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/a/7a1d3c1d-1373-4ac4-bb26-9780976efc4f.jpg?1783911227","artUrl":"https://cards.scryfall.io/art_crop/front/7/a/7a1d3c1d-1373-4ac4-bb26-9780976efc4f.jpg?1783911227"},{"name":"Drowned Jungle","manaCost":"","typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"This land enters tapped.\n{T}: Add {G} or {U}.","colors":[],"imageUrl":"https://cards.scryfall.io/normal/back/7/a/7a1d3c1d-1373-4ac4-bb26-9780976efc4f.jpg?1783911227","artUrl":"https://cards.scryfall.io/art_crop/back/7/a/7a1d3c1d-1373-4ac4-bb26-9780976efc4f.jpg?1783911227"}]}) as CardDef;
const kairi = (): CardDef => ({"oracleId":"18591d9e-c9f5-4ae8-aee1-8580bc8fa600","name":"Hidetsugu and Kairi","manaCost":"{2}{U}{U}{B}","cmc":5,"typeLine":"Legendary Creature — Ogre Demon Dragon","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Ogre","Demon","Dragon"],"oracleText":"Flying\nWhen Hidetsugu and Kairi enters, draw three cards, then put two cards from your hand on top of your library in any order.\nWhen Hidetsugu and Kairi dies, exile the top card of your library. Target opponent loses life equal to its mana value. If it's an instant or sorcery card, you may cast it without paying its mana cost.","power":"5","toughness":"4","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/76dd881d-6e12-4c90-a198-1d7ec61924b6.jpg?1783916912","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/76dd881d-6e12-4c90-a198-1d7ec61924b6.jpg?1783916912","commanderLegal":"legal","set":"mom","releasedAt":"2023-04-21","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const summons = (): CardDef => ({"oracleId":"aede5485-7b8c-4e29-a3a4-9a3513dc733f","name":"Summons of Saruman","manaCost":"{X}{U}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Amass Orcs X. Mill X cards. You may cast an instant or sorcery spell with mana value X or less from among them without paying its mana cost. (To amass Orcs X, put X +1/+1 counters on an Army you control. It's also an Orc. If you don't control an Army, create a 0/0 black Orc Army creature token first.)\nFlashback—{3}{U}{R}, Exile X cards from your graveyard.","colors":["R","U"],"colorIdentity":["R","U"],"keywords":["Amass","Flashback","Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/c/b/cbb1bc1f-b1d6-4639-b892-9b1ff6ed65fb.jpg?1783916015","artUrl":"https://cards.scryfall.io/art_crop/front/c/b/cbb1bc1f-b1d6-4639-b892-9b1ff6ed65fb.jpg?1783916015","commanderLegal":"legal","set":"ltc","releasedAt":"2023-06-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const slumber = (): CardDef => ({"oracleId":"48ee9007-2d1c-446f-aee3-795d23028e06","name":"Faerie Slumber Party","manaCost":"{4}{U}{U}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Return all creatures to their owners' hands. For each opponent who controlled a creature returned this way, you create two 1/1 blue Faerie creature tokens with flying and \"This token can block only creatures with flying.\"","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/4/f4d1945f-6462-4ec3-a966-3a8dafc0f5d8.jpg?1783915023","artUrl":"https://cards.scryfall.io/art_crop/front/f/4/f4d1945f-6462-4ec3-a966-3a8dafc0f5d8.jpg?1783915023","commanderLegal":"legal","set":"woe","releasedAt":"2023-09-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const belzenlok = (): CardDef => ({"oracleId":"667ece0e-a474-4e11-8ac4-6c8fc354457c","name":"Demonlord Belzenlok","manaCost":"{4}{B}{B}","cmc":6,"typeLine":"Legendary Creature — Elder Demon","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elder","Demon"],"oracleText":"Flying, trample\nWhen Demonlord Belzenlok enters, exile cards from the top of your library until you exile a nonland card, then put that card into your hand. If the card's mana value is 4 or greater, repeat this process. Demonlord Belzenlok deals 1 damage to you for each card put into your hand this way.","power":"6","toughness":"6","colors":["B"],"colorIdentity":["B"],"keywords":["Flying","Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/2/7/27197660-8489-419b-9ad6-29a8713e4673.jpg?1783925181","artUrl":"https://cards.scryfall.io/art_crop/front/2/7/27197660-8489-419b-9ad6-29a8713e4673.jpg?1783925181","commanderLegal":"legal","set":"sld","releasedAt":"2021-10-15","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const vow = (): CardDef => ({"oracleId":"7d012731-f921-47bf-a2da-ce494650cd4f","name":"Kamahl's Druidic Vow","manaCost":"{X}{G}{G}","cmc":2,"typeLine":"Legendary Sorcery","supertypes":["Legendary"],"types":["Sorcery"],"subtypes":[],"oracleText":"(You may cast a legendary sorcery only if you control a legendary creature or planeswalker.)\nLook at the top X cards of your library. You may put any number of land and/or legendary permanent cards with mana value X or less from among them onto the battlefield. Put the rest into your graveyard.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bf95ef60-e67b-466d-a6cb-d487ffa88b72.jpg?1783934979","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bf95ef60-e67b-466d-a6cb-d487ffa88b72.jpg?1783934979","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const aang = (): CardDef => ({"oracleId":"ddf461b9-a205-4dc7-a9c3-c047b1ff709f","name":"Aang's Journey","manaCost":"{2}","cmc":2,"typeLine":"Sorcery — Lesson","supertypes":[],"types":["Sorcery"],"subtypes":["Lesson"],"oracleText":"Kicker {2} (You may pay an additional {2} as you cast this spell.)\nSearch your library for a basic land card. If this spell was kicked, instead search your library for a basic land card and a Shrine card. Reveal those cards, put them into your hand, then shuffle.\nYou gain 2 life.","colors":[],"colorIdentity":[],"keywords":["Kicker"],"imageUrl":"https://cards.scryfall.io/normal/front/5/e/5e51f727-5a9b-4bc7-83a9-dbcf1c933e15.jpg?1783905008","artUrl":"https://cards.scryfall.io/art_crop/front/5/e/5e51f727-5a9b-4bc7-83a9-dbcf1c933e15.jpg?1783905008","commanderLegal":"legal","set":"tla","releasedAt":"2025-11-21","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const astelli = (): CardDef => ({"oracleId":"bb956492-e3ed-483a-9169-5b795a8e619e","name":"Astelli Reclaimer","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel Warrior","supertypes":[],"types":["Creature"],"subtypes":["Angel","Warrior"],"oracleText":"Flying\nWhen this creature enters, return target noncreature, nonland permanent card with mana value X or less from your graveyard to the battlefield, where X is the amount of mana spent to cast this creature.\nWarp {2}{W}","power":"5","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Warp"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fb36405-cd28-432f-b0a4-e74ff8be928d.jpg?1783906000","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fb36405-cd28-432f-b0a4-e74ff8be928d.jpg?1783906000","commanderLegal":"legal","set":"eoe","releasedAt":"2025-08-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const bolt = card("Test Bolt", "Instant", "{R}", { oracleText: "Test Bolt deals 3 damage to any target." });
const blast = card("Test Blast", "Sorcery", "{1}{R}", { oracleText: "Test Blast deals 2 damage to any target." });
const big = card("Test Big Spell", "Sorcery", "{3}{R}", { oracleText: "Test Big Spell deals 4 damage to any target." });
const rock = card("Test Rock", "Artifact", "{3}", { oracleText: "{T}: Add {C}." });
const relic = card("Test Relic", "Artifact", "{5}");
const charm = card("Test Charm", "Enchantment", "{2}{W}");
const ogre = card("Test Ogre", "Creature — Ogre", "{4}{R}", { power: "5", toughness: "5" });
const sage = card("Test Sage", "Legendary Creature — Human", "{1}{G}{G}", { power: "2", toughness: "2" });
const titan = card("Test Titan", "Legendary Creature — Giant", "{4}{G}{G}", { power: "6", toughness: "6" });
const shrine = card("Test Shrine", "Enchantment — Shrine", "{1}{W}");
const forestCard = card("Forest", "Basic Land — Forest");
const wastes = card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." });

describe("round 251", () => {
  it("every card of the round compiles fully", () => {
    supported(aurelia(), grim(), drowner(), kairi(), summons(), slumber(), belzenlok(), vow(), aang(), astelli());
  });

  it("Aurelia: +2/+0 always; trample only if red, vigilance only if white, both for a red and white creature", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, aurelia());
    const rw = putOnBattlefield(s0, ap, card("Test Boros", "Creature — Human", "{R}{W}", { power: "2", toughness: "2" }));
    let s = passUntil(s0, "beginCombat", ap);
    expect(s.pending?.kind).toBe("chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(rw)] }));
    expect(power(s, s.objects[rw]!)).toBe(4);
    expect(objHasKeyword(s, s.objects[rw]!, "Trample")).toBe(true);
    expect(objHasKeyword(s, s.objects[rw]!, "Vigilance")).toBe(true);
    // A green creature: only the +2/+0 (rulings).
    const { s: s1, ap: ap1 } = setup([]);
    putOnBattlefield(s1, ap1, aurelia());
    const g = putOnBattlefield(s1, ap1, bear());
    let s2 = passUntil(s1, "beginCombat", ap1);
    s2 = settle(act(s2, { type: "chooseTargets", player: ap1, targets: [tgt(g)] }));
    expect(power(s2, s2.objects[g]!)).toBe(4);
    expect(objHasKeyword(s2, s2.objects[g]!, "Trample")).toBe(false);
    expect(objHasKeyword(s2, s2.objects[g]!, "Vigilance")).toBe(false);
    // Aurelia herself (red and white) gets both.
    const { s: s3, ap: ap3 } = setup([]);
    const a = putOnBattlefield(s3, ap3, aurelia());
    let s4 = passUntil(s3, "beginCombat", ap3);
    s4 = settle(act(s4, { type: "chooseTargets", player: ap3, targets: [tgt(a)] }));
    expect(objHasKeyword(s4, s4.objects[a]!, "Trample")).toBe(true);
    expect(objHasKeyword(s4, s4.objects[a]!, "Vigilance")).toBe(true);
    expect(power(s4, s4.objects[a]!)).toBe(4);
  });

  it("Rowan's Grim Search bargained: keep two of the top four on top in the order you choose, the rest into the graveyard, then draw them", () => {
    const { s: s0, ap, ids } = setup([grim()]);
    const r = putOnBattlefield(s0, ap, rock);
    const top = onTop(s0, ap, [bolt, blast, big, charm]);
    const life = s0.players[ap]!.life;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { bargain: r })));
    expect(s.objects[r]!.zone).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 2, min: 0 });
    s = act(s, { type: "searchLibrary", player: ap, found: [top[0]!, top[2]!] });
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "order" });
    // Test Big Spell on top, then Test Bolt: drawn in that order.
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [top[2]!, top[0]!], away: [] }));
    expect(s.players[ap]!.hand.slice(-2)).toEqual([top[2], top[0]]);
    expect(s.objects[top[1]!]!.zone).toBe("graveyard");
    expect(s.objects[top[3]!]!.zone).toBe("graveyard");
    expect(s.objects[top[0]!]!.zone).toBe("hand");
    expect(s.objects[top[2]!]!.zone).toBe("hand");
    expect(s.players[ap]!.life).toBe(life - 2);
  });

  it("Rowan's Grim Search: the order chosen is the order on top; not bargained, it only draws two and loses 2 life", () => {
    const { s: s0, ap, ids } = setup([grim()]);
    const r = putOnBattlefield(s0, ap, rock);
    const top = onTop(s0, ap, [bolt, blast, big, charm, relic]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { bargain: r })));
    s = act(s, { type: "searchLibrary", player: ap, found: [top[1]!, top[3]!] });
    // Stop before the draw: look at the library order as the look finishes.
    s = act(s, { type: "arrangeTop", player: ap, top: [top[3]!, top[1]!], away: [] });
    s = settle(s);
    // Drew the two kept, the one put on top first; the fifth card is next.
    expect(s.players[ap]!.hand.slice(-2)).toEqual([top[3], top[1]]);
    expect(s.players[ap]!.library[0]).toBe(top[4]);
    // Keeping none: all four into the graveyard, no ordering asked.
    const { s: s1, ap: ap1, ids: ids1 } = setup([grim()]);
    const r1 = putOnBattlefield(s1, ap1, rock);
    const top1 = onTop(s1, ap1, [bolt, blast, big, charm]);
    let s2 = settle(run(s1, planCast(s1, ap1, ids1[0]!, undefined, undefined, "auto", undefined, { bargain: r1 })));
    s2 = settle(act(s2, { type: "searchLibrary", player: ap1, found: [] }));
    expect(top1.every((id) => s2.objects[id]!.zone === "graveyard")).toBe(true);
    // Not bargained.
    const { s: s3, ap: ap3, ids: ids3 } = setup([grim()]);
    const top3 = onTop(s3, ap3, [bolt, blast, big]);
    const life = s3.players[ap3]!.life;
    const s4 = settle(run(s3, planCast(s3, ap3, ids3[0]!)));
    expect(s4.pending).toBeNull();
    expect(s4.objects[top3[0]!]!.zone).toBe("hand");
    expect(s4.objects[top3[1]!]!.zone).toBe("hand");
    expect(s4.objects[top3[2]!]!.zone).toBe("library");
    expect(s4.players[ap3]!.life).toBe(life - 2);
  });

  it("Rowan's Grim Search: a bot keeps cards and orders them", () => {
    const { s: s0, ap, ids } = setup([grim()]);
    const r = putOnBattlefield(s0, ap, rock);
    [bolt, blast, big, charm].forEach((d) => into(s0, ap, d, "library"));
    const s = settleBots(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { bargain: r })));
    expect(s.pending).toBeNull();
    expect(s.stack.length).toBe(0);
  });

  it("Drowner of Truth: two Eldrazi Spawn only if {C} was spent to cast it", () => {
    const { s: s0, ap, ids } = setup([drowner()]);
    s0.battlefield = s0.battlefield.filter((id) => controllerOf(s0, s0.objects[id]!) !== ap);
    s0.players[ap]!.manaPool = { ...s0.players[ap]!.manaPool, G: 6, C: 1 };
    let s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.stack.length).toBe(2); // the spell and its cast trigger
    s = settle(s);
    expect(named(s, "Eldrazi Spawn Token").length).toBe(2);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    // Only colored mana: no trigger.
    const { s: s1, ap: ap1, ids: ids1 } = setup([drowner()]);
    s1.battlefield = s1.battlefield.filter((id) => controllerOf(s1, s1.objects[id]!) !== ap1);
    s1.players[ap1]!.manaPool = { ...s1.players[ap1]!.manaPool, G: 4, U: 3 };
    let s2 = run(s1, planCast(s1, ap1, ids1[0]!));
    expect(s2.stack.length).toBe(1);
    s2 = settle(s2);
    expect(named(s2, "Eldrazi Spawn Token").length).toBe(0);
  });

  it("Hidetsugu and Kairi dies: the target opponent loses life equal to the exiled card's mana value, and you may cast an instant for free", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, kairi());
    const b = into(s0, ap, big, "library");
    const life = s0.players[opp]!.life;
    destroyPermanent(s0, s0.objects[h]!, "destroyed");
    let s = settle(s0, { targets: [{ kind: "player", id: opp }] });
    expect(s.players[opp]!.life).toBe(life - 4);
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: b });
    // A sorcery, cast while the ability resolves, ignoring its timing (rulings).
    s = settle(run(s, planCast(s, ap, b, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 8);
    expect(s.objects[b]!.zone).toBe("graveyard");
  });

  it("Hidetsugu and Kairi: a creature card is exiled and stays; declining the cast leaves the card in exile", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, kairi());
    const o = into(s0, ap, ogre, "library");
    const life = s0.players[opp]!.life;
    destroyPermanent(s0, s0.objects[h]!, "destroyed");
    const s = settle(s0, { targets: [{ kind: "player", id: opp }] });
    expect(s.pending).toBeNull();
    expect(s.players[opp]!.life).toBe(life - 5);
    expect(s.objects[o]!.zone).toBe("exile");
    const { s: s1, ap: ap1, opp: opp1 } = setup([]);
    const h1 = putOnBattlefield(s1, ap1, kairi());
    const b1 = into(s1, ap1, bolt, "library");
    destroyPermanent(s1, s1.objects[h1]!, "destroyed");
    let s2 = settle(s1, { targets: [{ kind: "player", id: opp1 }] });
    expect(s2.pending).toMatchObject({ kind: "castFree", objectId: b1 });
    s2 = settle(act(s2, { type: "chooseMay", player: ap1, yes: false }));
    expect(s2.objects[b1]!.zone).toBe("exile");
  });

  it("Summons of Saruman: amass X, mill X, cast an instant or sorcery with mana value X or less from among them", () => {
    const { s: s0, ap, opp, ids } = setup([summons()]);
    const [b, bg] = onTop(s0, ap, [bolt, big]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 2)));
    const army = named(s, "Orc Army Token");
    expect(army.length).toBe(1);
    expect(s.objects[army[0]!]!.counters["+1/+1"]).toBe(2);
    expect(s.objects[b!]!.zone).toBe("graveyard");
    expect(s.objects[bg!]!.zone).toBe("graveyard");
    // Test Big Spell has mana value 4: not offered with X = 2.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromHand", options: [b, "none"] });
    s = act(s, { type: "chooseOption", player: ap, choice: b! });
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, b!, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 3);
  });

  it("Faerie Slumber Party: every creature returns; two Faeries for each opponent who controlled one, a token included", () => {
    const { s: s0, ap, opp, ids } = setup([slumber()]);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(opp) + 1) % 4]!;
    const mine = putOnBattlefield(s0, ap, bear());
    const theirs = [putOnBattlefield(s0, opp, bear()), putOnBattlefield(s0, opp, ogre)];
    const tok = putOnBattlefield(s0, third, bear());
    s0.objects[tok]!.isToken = true;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[mine]!.zone).toBe("hand");
    expect(theirs.every((id) => s.objects[id]!.zone === "hand")).toBe(true);
    const faeries = named(s, "Faerie Token");
    expect(faeries.length).toBe(4);
    expect(faeries.every((id) => controllerOf(s, s.objects[id]!) === ap && objHasKeyword(s, s.objects[id]!, "Flying"))).toBe(true);
    // Only your own creatures: none.
    const { s: s1, ap: ap1, ids: ids1 } = setup([slumber()]);
    putOnBattlefield(s1, ap1, bear());
    const s2 = settle(run(s1, planCast(s1, ap1, ids1[0]!)));
    expect(named(s2, "Faerie Token").length).toBe(0);
  });

  it("Demonlord Belzenlok: repeats while the card put into your hand has mana value 4 or more, then 1 damage for each card", () => {
    const { s: s0, ap } = setup([]);
    // From the top: a land, Test Ogre (5), Test Big Spell (4), Test Blast (2), Test Bolt (1).
    const lib = onTop(s0, ap, [forestCard, ogre, big, blast, bolt]);
    const b = into(s0, ap, belzenlok(), "hand");
    s0.players[ap]!.manaPool = { ...s0.players[ap]!.manaPool, B: 6 };
    const life = s0.players[ap]!.life;
    const s = settle(run(s0, planCast(s0, ap, b)));
    expect(s.objects[lib[0]!]!.zone).toBe("exile");
    expect([lib[1], lib[2], lib[3]].every((id) => s.objects[id!]!.zone === "hand")).toBe(true);
    expect(s.objects[lib[4]!]!.zone).toBe("library");
    expect(s.players[ap]!.life).toBe(life - 3);
    // No nonland card at all: every card is exiled and nothing is dealt.
    const { s: s1, ap: ap1 } = setup([]);
    s1.players[ap1]!.library.forEach((id) => (s1.objects[id]!.zone = "exile"));
    s1.players[ap1]!.exile.push(...s1.players[ap1]!.library);
    s1.players[ap1]!.library = [];
    const lands = [forestCard, forestCard].map((d) => into(s1, ap1, d, "library"));
    const b1 = into(s1, ap1, belzenlok(), "hand");
    s1.players[ap1]!.manaPool = { ...s1.players[ap1]!.manaPool, B: 6 };
    const life1 = s1.players[ap1]!.life;
    const s2 = settle(run(s1, planCast(s1, ap1, b1)));
    expect(lands.every((id) => s2.objects[id]!.zone === "exile")).toBe(true);
    expect(s2.players[ap1]!.life).toBe(life1);
  });

  it("Kamahl's Druidic Vow: lands and legendary permanent cards with mana value X or less onto the battlefield, the rest into the graveyard", () => {
    const { s: s0, ap, ids } = setup([vow()]);
    putOnBattlefield(s0, ap, sage);
    const lib = onTop(s0, ap, [forestCard, sage, titan, ogre]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 4)));
    // Test Titan has mana value 6, Test Ogre isn't legendary.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", cards: [lib[0], lib[1]] });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [lib[0]!, lib[1]!] }));
    expect(s.objects[lib[0]!]!.zone).toBe("battlefield");
    expect(s.objects[lib[1]!]!.zone).toBe("battlefield");
    expect(s.objects[lib[2]!]!.zone).toBe("graveyard");
    expect(s.objects[lib[3]!]!.zone).toBe("graveyard");
  });

  it("Aang's Journey: a basic land card unkicked; kicked, a basic land card and a Shrine card, then 2 life", () => {
    const { s: s0, ap, ids } = setup([aang()]);
    const sh = into(s0, ap, shrine, "library");
    const life = s0.players[ap]!.life;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { kicks: [0] })));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", max: 2 });
    const f = s.players[ap]!.library.find((id) => defOf(s, s.objects[id]!).name === "Forest")!;
    expect(() => applyAction(s, { type: "searchLibrary", player: ap, found: [f, s.players[ap]!.library.find((id) => id !== f && defOf(s, s.objects[id]!).name === "Forest")!] })).toThrow();
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [f, sh] }));
    expect(s.objects[f]!.zone).toBe("hand");
    expect(s.objects[sh]!.zone).toBe("hand");
    expect(s.players[ap]!.life).toBe(life + 2);
    // Unkicked: one basic land, not the Shrine.
    const { s: s1, ap: ap1, ids: ids1 } = setup([aang()]);
    const sh1 = into(s1, ap1, shrine, "library");
    let s2 = settle(run(s1, planCast(s1, ap1, ids1[0]!)));
    expect(s2.pending).toMatchObject({ kind: "searchLibrary", max: 1 });
    expect((s2.pending as { cards: ObjectId[] }).cards).not.toContain(sh1);
    const f1 = (s2.pending as { cards: ObjectId[] }).cards[0]!;
    s2 = settle(act(s2, { type: "searchLibrary", player: ap1, found: [f1] }));
    expect(s2.objects[f1]!.zone).toBe("hand");
  });

  it("Astelli Reclaimer: X is the mana spent to cast it, 5 normally and 3 with warp", () => {
    const { s: s0, ap, ids } = setup([astelli()]);
    const r = into(s0, ap, relic, "graveyard");
    const c = into(s0, ap, charm, "graveyard");
    const big6 = into(s0, ap, card("Test Monolith", "Artifact", "{6}"), "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(() => applyAction(s, { type: "chooseTargets", player: ap, targets: [tgt(big6)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(r)] }));
    expect(s.objects[r]!.zone).toBe("battlefield");
    // Warp: {2}{W}, so 3.
    const { s: s1, ap: ap1, ids: ids1 } = setup([astelli()]);
    const r1 = into(s1, ap1, relic, "graveyard");
    const c1 = into(s1, ap1, charm, "graveyard");
    let s2 = run(s1, planCast(s1, ap1, ids1[0]!, undefined, undefined, undefined, undefined, { alt: "warp" }));
    for (let i = 0; i < 20 && s2.pending?.kind !== "chooseTargets"; i++) s2 = act(s2, { type: "passPriority", player: waitingOn(s2)! });
    expect(() => applyAction(s2, { type: "chooseTargets", player: ap1, targets: [tgt(r1)] })).toThrow();
    s2 = settle(act(s2, { type: "chooseTargets", player: ap1, targets: [tgt(c1)] }));
    expect(s2.objects[c1]!.zone).toBe("battlefield");
    expect(c).toBeDefined();
  });
});
