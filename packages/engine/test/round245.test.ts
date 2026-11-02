// Round 245: cards from the top of the popularity list. Kyoshi Island Plaza ("search your library for up to X basic land
// cards, where X is the number of Shrines you control" in a triggered ability), Huskburster Swarm ("for each creature card
// you own in exile and in your graveyard"), Locket of Yesterdays ("for each card with the same name as that spell in your
// graveyard"), Moldgraf Monstrosity ("return two creature cards at random"), Outlaws' Merriment (a random mode that makes
// a token), Valgavoth's Onslaught ("Manifest dread X times, then put X +1/+1 counters on each of those creatures"),
// Motivated Pony ("untap those creatures and they get an additional +2/+2"), March of Reckless Joy ("You may play up to two
// of those cards"), Alena, Kessig Trapper ("the greatest power among creatures you control that entered this turn"), The
// Blue Spirit ("the first creature spell you cast each turn as though it had flash", "enters during combat"), Umbris, Fear
// Manifest ("for each card your opponents own in exile", "exiles cards ... until they exile a land card"), Basri Ket's −2
// ("Whenever one or more nontoken creatures attack this turn"), Desertion (a countered artifact or creature spell onto the
// battlefield under your control) and Kamahl's Will ("Choose target creature you don't control. Each creature you control
// deals damage equal to its power to that creature").

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { applyAction, castProblem, characteristics, controllerOf, defOf, destroyPermanent, invalidateCharacteristics, isFullySupported, manaValue, planActivate, planCast, spellCost, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

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
const generic = (s: GameState, pid: PlayerId, id: ObjectId, how: Parameters<typeof spellCost>[5] = {}) => {
  const c = spellCost(s, pid, s.objects[id]!, 0, [], how);
  return manaValue(c.cost) + c.extra;
};
/** Others pass until `pid` has priority (nothing resolves on the way while the stack is untouched). */
const toPlayer = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 4 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(waitingOn(s)).toBe(pid);
  return s;
};
const named = (s: GameState, name: string) => s.battlefield.filter((id) => characteristics(s, s.objects[id]!).name === name);
const walker = (s: GameState, pid: PlayerId, def: CardDef, loyalty: number) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.counters.loyalty = loyalty;
  invalidateCharacteristics(s);
  return id;
};

// Real oracle text (Scryfall).
const kyoshi = (): CardDef => ({"oracleId":"c0cdc333-6c5a-401c-9810-220d2027f2fe","name":"Kyoshi Island Plaza","manaCost":"{3}{G}","cmc":4,"typeLine":"Legendary Enchantment — Shrine","supertypes":["Legendary"],"types":["Enchantment"],"subtypes":["Shrine"],"oracleText":"When Kyoshi Island Plaza enters, search your library for up to X basic land cards, where X is the number of Shrines you control. Put those cards onto the battlefield tapped, then shuffle.\nWhenever another Shrine you control enters, search your library for a basic land card, put it onto the battlefield tapped, then shuffle.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/c/9c25ea98-9823-4487-bf6b-ee29ce5a4ed8.jpg?1783904942","artUrl":"https://cards.scryfall.io/art_crop/front/9/c/9c25ea98-9823-4487-bf6b-ee29ce5a4ed8.jpg?1783904942","commanderLegal":"legal","set":"tla","releasedAt":"2025-11-21","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const husk = (): CardDef => ({"oracleId":"faefb352-575c-49f7-9f7a-96f2279a077b","name":"Huskburster Swarm","manaCost":"{7}{B}","cmc":8,"typeLine":"Creature — Elemental Insect","supertypes":[],"types":["Creature"],"subtypes":["Elemental","Insect"],"oracleText":"This spell costs {1} less to cast for each creature card you own in exile and in your graveyard.\nMenace, deathtouch","power":"6","toughness":"6","colors":["B"],"colorIdentity":["B"],"keywords":["Menace","Deathtouch"],"imageUrl":"https://cards.scryfall.io/normal/front/e/d/ed2f61d7-4eb0-41c5-8a34-a0793c2abc51.jpg?1783910834","artUrl":"https://cards.scryfall.io/art_crop/front/e/d/ed2f61d7-4eb0-41c5-8a34-a0793c2abc51.jpg?1783910834","commanderLegal":"legal","set":"blb","releasedAt":"2024-08-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const locket = (): CardDef => ({"oracleId":"bfbfa8c1-5b03-40bb-8a4c-aedb768cb023","name":"Locket of Yesterdays","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Spells you cast cost {1} less to cast for each card with the same name as that spell in your graveyard.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/3/b316f198-4465-4fb5-a7a6-a92bf8eae8c1.jpg?1783943198","artUrl":"https://cards.scryfall.io/art_crop/front/b/3/b316f198-4465-4fb5-a7a6-a92bf8eae8c1.jpg?1783943198","commanderLegal":"legal","set":"tsp","releasedAt":"2006-10-06","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const moldgraf = (): CardDef => ({"oracleId":"3c4d5392-27cf-492e-9ae1-dee330b82223","name":"Moldgraf Monstrosity","manaCost":"{4}{G}{G}{G}","cmc":7,"typeLine":"Creature — Insect","supertypes":[],"types":["Creature"],"subtypes":["Insect"],"oracleText":"Trample\nWhen this creature dies, exile it, then return two creature cards at random from your graveyard to the battlefield.","power":"8","toughness":"8","colors":["G"],"colorIdentity":["G"],"keywords":["Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/7/1/714ba062-f8ae-4ae6-a1c2-8fa093cc0fb2.jpg?1783909638","artUrl":"https://cards.scryfall.io/art_crop/front/7/1/714ba062-f8ae-4ae6-a1c2-8fa093cc0fb2.jpg?1783909638","commanderLegal":"legal","set":"dsc","releasedAt":"2024-09-27","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const merriment = (): CardDef => ({"oracleId":"78826624-8784-4003-8813-230f299a588f","name":"Outlaws' Merriment","manaCost":"{1}{R}{W}{W}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, choose one at random. Create a red and white creature token with those characteristics.\n• 3/1 Human Warrior with trample and haste.\n• 2/1 Human Cleric with lifelink and haste.\n• 1/2 Human Rogue with haste and \"When this token enters, it deals 1 damage to any target.\"","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/d/5d7585ab-a364-471c-8ef1-318e459b4020.jpg?1783932597","artUrl":"https://cards.scryfall.io/art_crop/front/5/d/5d7585ab-a364-471c-8ef1-318e459b4020.jpg?1783932597","commanderLegal":"legal","set":"eld","releasedAt":"2019-10-04","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const onslaught = (): CardDef => ({"oracleId":"663d9559-6619-46fe-8ff4-655f1d5e0e4c","name":"Valgavoth's Onslaught","manaCost":"{X}{X}{G}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Manifest dread X times, then put X +1/+1 counters on each of those creatures. (To manifest dread, look at the top two cards of your library, then put one onto the battlefield face down as a 2/2 creature and the other into your graveyard. Turn it face up any time for its mana cost if it's a creature card.)","colors":["G"],"colorIdentity":["G"],"keywords":["Manifest","Manifest dread"],"imageUrl":"https://cards.scryfall.io/normal/front/3/5/3518fbe6-5640-4aca-a2fd-e83c82d2e2fd.jpg?1783909408","artUrl":"https://cards.scryfall.io/art_crop/front/3/5/3518fbe6-5640-4aca-a2fd-e83c82d2e2fd.jpg?1783909408","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const pony = (): CardDef => ({"oracleId":"44906d21-83cc-49ec-8505-4f7b020ac05f","name":"Motivated Pony","manaCost":"{4}{G}","cmc":5,"typeLine":"Creature — Horse","supertypes":[],"types":["Creature"],"subtypes":["Horse"],"oracleText":"Trample, haste\nWhenever this creature attacks, attacking creatures get +1/+1 until end of turn. If a Food entered the battlefield under your control this turn, untap those creatures and they get an additional +2/+2 until end of turn.","power":"3","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":["Haste","Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/9/b/9be4f8b6-90ef-4c77-ae70-bffae229d243.jpg?1783916026","artUrl":"https://cards.scryfall.io/art_crop/front/9/b/9be4f8b6-90ef-4c77-ae70-bffae229d243.jpg?1783916026","commanderLegal":"legal","set":"ltc","releasedAt":"2023-06-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const march = (): CardDef => ({"oracleId":"3b3ecaf2-7e95-4b62-9bc0-a61985508808","name":"March of Reckless Joy","manaCost":"{X}{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"As an additional cost to cast this spell, you may exile any number of red cards from your hand. This spell costs {2} less to cast for each card exiled this way.\nExile the top X cards of your library. You may play up to two of those cards until the end of your next turn.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/8/780e1bf1-e392-40f2-9e84-764dedc5fcd4.jpg?1783923863","artUrl":"https://cards.scryfall.io/art_crop/front/7/8/780e1bf1-e392-40f2-9e84-764dedc5fcd4.jpg?1783923863","commanderLegal":"legal","set":"neo","releasedAt":"2022-02-18","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const alena = (): CardDef => ({"oracleId":"ca349ba9-b5ea-48e6-a617-c9b7f2708853","name":"Alena, Kessig Trapper","manaCost":"{4}{R}","cmc":5,"typeLine":"Legendary Creature — Human Scout","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Scout"],"oracleText":"First strike\n{T}: Add an amount of {R} equal to the greatest power among creatures you control that entered this turn.\nPartner (You can have two commanders if both have partner.)","power":"4","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":["First strike","Partner"],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/9/0/90c51949-b1ef-4c6e-98b0-4fb33a81db24.jpg?1783928824","artUrl":"https://cards.scryfall.io/art_crop/front/9/0/90c51949-b1ef-4c6e-98b0-4fb33a81db24.jpg?1783928824","commanderLegal":"legal","set":"cmr","releasedAt":"2020-11-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const blueSpirit = (): CardDef => ({"oracleId":"497e9c7c-a16d-43e5-a7ec-04153aa2566a","name":"The Blue Spirit","manaCost":"{3}{U}","cmc":4,"typeLine":"Legendary Creature — Human Rogue Ally","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Rogue","Ally"],"oracleText":"You may cast the first creature spell you cast each turn as though it had flash.\nWhenever a nontoken creature you control enters during combat, draw a card.","power":"2","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/0/d0d1f5b0-f842-40d5-ae51-015eefe68fa1.jpg?1783904832","artUrl":"https://cards.scryfall.io/art_crop/front/d/0/d0d1f5b0-f842-40d5-ae51-015eefe68fa1.jpg?1783904832","commanderLegal":"legal","set":"tle","releasedAt":"2025-11-21","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const umbris = (): CardDef => ({"oracleId":"af31febb-af53-4b48-b930-9e1f9e5d8f26","name":"Umbris, Fear Manifest","manaCost":"{3}{U}{B}","cmc":5,"typeLine":"Legendary Creature — Nightmare Horror","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Nightmare","Horror"],"oracleText":"Umbris gets +1/+1 for each card your opponents own in exile.\nWhenever Umbris or another Nightmare or Horror you control enters, target opponent exiles cards from the top of their library until they exile a land card.","power":"1","toughness":"1","colors":["B","U"],"colorIdentity":["B","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/0/90bb3cd2-e472-4552-a31e-f7d8e8cd5bc9.jpg?1783924978","artUrl":"https://cards.scryfall.io/art_crop/front/9/0/90bb3cd2-e472-4552-a31e-f7d8e8cd5bc9.jpg?1783924978","commanderLegal":"legal","set":"voc","releasedAt":"2021-11-19","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const basri = (): CardDef => ({"oracleId":"497d7ab8-07f1-4c8a-a45a-52b9a4d9400f","name":"Basri Ket","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Legendary Planeswalker — Basri","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Basri"],"oracleText":"+1: Put a +1/+1 counter on up to one target creature. It gains indestructible until end of turn.\n−2: Whenever one or more nontoken creatures attack this turn, create that many 1/1 white Soldier creature tokens that are tapped and attacking.\n−6: You get an emblem with \"At the beginning of combat on your turn, create a 1/1 white Soldier creature token, then put a +1/+1 counter on each creature you control.\"","loyalty":"3","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/8/98c85699-2daf-4e87-a3be-465d02bd64bb.jpg?1783930745","artUrl":"https://cards.scryfall.io/art_crop/front/9/8/98c85699-2daf-4e87-a3be-465d02bd64bb.jpg?1783930745","commanderLegal":"legal","set":"m21","releasedAt":"2020-07-03","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const desertion = (): CardDef => ({"oracleId":"ee3d1f44-e0ca-4ce9-be76-4b675a115156","name":"Desertion","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell. If an artifact or creature spell is countered this way, put that card onto the battlefield under your control instead of into its owner's graveyard.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/5/f51053d1-f158-4c62-96f4-0c93f1ec9007.jpg?1783911692","artUrl":"https://cards.scryfall.io/art_crop/front/f/5/f51053d1-f158-4c62-96f4-0c93f1ec9007.jpg?1783911692","commanderLegal":"legal","set":"spg","releasedAt":"2024-04-19","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const kamahl = (): CardDef => ({"oracleId":"a32860dd-e8df-4a3c-bdc2-948dcd07cf9a","name":"Kamahl's Will","manaCost":"{3}{G}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose one. If you control a commander as you cast this spell, you may choose both instead.\n• Until end of turn, any number of target lands you control become 1/1 Elemental creatures with vigilance, indestructible, and haste. They're still lands.\n• Choose target creature you don't control. Each creature you control deals damage equal to its power to that creature.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/1/51fe007f-fddf-4b3a-b336-0a88df95cb14.jpg?1783928792","artUrl":"https://cards.scryfall.io/art_crop/front/5/1/51fe007f-fddf-4b3a-b336-0a88df95cb14.jpg?1783928792","commanderLegal":"legal","set":"cmr","releasedAt":"2020-11-20","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;


const shrine = card("Test Shrine", "Enchantment — Shrine", "{1}", { oracleText: "" });
const spark = card("Test Spark", "Instant", "{2}{R}", { oracleText: "Test Spark deals 1 damage to any target." });
const ember = card("Test Ember", "Instant", "{1}{R}", { oracleText: "Test Ember deals 1 damage to any target.\nFlashback {3}{R}", keywords: ["Flashback"] });
const bakery = card("Test Bakery", "Instant", "{1}", { oracleText: "Create a Food token." });
const flashBear = (extra: Partial<CardDef> = {}) => card(extra.name ?? "Test Lynx", "Creature — Cat", "{1}{G}", { power: "2", toughness: "2", keywords: ["Flash"], oracleText: "Flash", ...extra });
const shock = card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." });
const horror = card("Test Horror", "Creature — Horror", "{1}", { power: "1", toughness: "1", oracleText: "" });

describe("round 245", () => {
  it("every card of the round compiles fully", () => {
    supported(kyoshi(), husk(), locket(), moldgraf(), merriment(), onslaught(), pony(), march(), alena(), blueSpirit(), umbris(), basri(), desertion(), kamahl());
  });

  it("Kyoshi Island Plaza: up to X basic lands onto the battlefield tapped, X the Shrines you control as it resolves (itself included)", () => {
    const { s: s0, ap, ids } = setup([kyoshi()]);
    putOnBattlefield(s0, ap, shrine);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 2 });
    const cards = s.pending?.kind === "searchLibrary" ? s.pending.cards : [];
    const forests = cards.filter((id) => defOf(s, s.objects[id]!).name === "Forest").slice(0, 2);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: forests }));
    for (const id of forests) expect(s.objects[id]).toMatchObject({ zone: "battlefield", tapped: true });
    // Another Shrine entering: its other ability finds one basic land.
    const more = putOnBattlefield(s, ap, shrine);
    s.battlefield.splice(s.battlefield.indexOf(more), 1);
    s.objects[more]!.zone = "hand";
    s.players[ap]!.hand.push(more);
    s = settle(run(s, planCast(s, ap, more)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", max: 1 });
  });

  it("Huskburster Swarm: {1} less for each creature card you own in exile (face up) and in your graveyard", () => {
    const { s, ap, opp, ids } = setup([husk()]);
    expect(generic(s, ap, ids[0]!)).toBe(8);
    into(s, ap, bear(), "graveyard");
    into(s, ap, bear(), "graveyard");
    into(s, ap, card("Test Rune", "Instant", "{U}"), "graveyard");
    into(s, ap, bear(), "exile");
    const down = into(s, ap, bear(), "exile");
    s.objects[down]!.faceDown = "manifest";
    into(s, opp, bear(), "graveyard");
    into(s, opp, bear(), "exile");
    // Two in the graveyard and one face up in exile: not the face-down one, the instant, or the opponent's.
    expect(generic(s, ap, ids[0]!)).toBe(5);
  });

  it("Locket of Yesterdays: {1} less for each card with the spell's name in your graveyard, not counting the spell itself", () => {
    const { s, ap, opp, ids } = setup([spark, ember]);
    putOnBattlefield(s, ap, locket());
    expect(generic(s, ap, ids[0]!)).toBe(3);
    into(s, ap, spark, "graveyard");
    into(s, opp, spark, "graveyard");
    expect(generic(s, ap, ids[0]!)).toBe(2);
    into(s, ap, spark, "graveyard");
    into(s, ap, spark, "graveyard");
    // Colored mana isn't reduced (rulings).
    expect(generic(s, ap, ids[0]!)).toBe(1);
    // An opponent's spells aren't reduced.
    const theirs = into(s, opp, spark, "hand");
    expect(generic(s, opp, theirs)).toBe(3);
    // Cast from the graveyard with flashback: the other Ember counts, it doesn't count itself.
    const flash = into(s, ap, ember, "graveyard");
    expect(generic(s, ap, flash, { via: "flashback" })).toBe(4);
    into(s, ap, ember, "graveyard");
    expect(generic(s, ap, flash, { via: "flashback" })).toBe(3);
  });

  it("Moldgraf Monstrosity: dies, is exiled, and two creature cards chosen at random from your graveyard return together", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, moldgraf());
    const creatures = [0, 1, 2].map((i) => into(s0, ap, bear({ name: `Test Beast ${i}` }), "graveyard"));
    const rune = into(s0, ap, card("Test Rune", "Instant", "{U}"), "graveyard");
    destroyPermanent(s0, s0.objects[m]!, "destroyed");
    const s = settle(s0);
    expect(s.objects[m]!.zone).toBe("exile");
    const back = creatures.filter((id) => s.objects[id]!.zone === "battlefield");
    expect(back).toHaveLength(2);
    for (const id of back) expect(controllerOf(s, s.objects[id]!)).toBe(ap);
    expect(s.objects[rune]!.zone).toBe("graveyard");
    // With only one creature card there, that one returns (rulings: it's still returned when ~ can't be exiled).
    const { s: t0, ap: bp } = setup([]);
    const m2 = putOnBattlefield(t0, bp, moldgraf());
    const lone = into(t0, bp, bear(), "graveyard");
    destroyPermanent(t0, t0.objects[m2]!, "destroyed");
    const t = settle(t0);
    expect(t.objects[lone]!.zone).toBe("battlefield");
    expect(t.objects[m2]!.zone).toBe("exile");
  });

  it("Outlaws' Merriment: at your upkeep one of the three tokens, chosen at random as the trigger goes on the stack", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, merriment());
    const before = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 3) % 4]!;
    const s1 = passUntil(s0, "end", before);
    const seen = new Map<string, string>();
    for (let k = 1; k <= 24 && seen.size < 3; k++) {
      let s = structuredClone(s1);
      s.rngState = k * 7919;
      s = passUntil(s, "upkeep", ap);
      s = settle(s, { targets: [{ kind: "player", id: opp }] });
      const made = s.battlefield.filter((id) => s.objects[id]!.isToken && controllerOf(s, s.objects[id]!) === ap);
      expect(made).toHaveLength(1);
      const c = characteristics(s, s.objects[made[0]!]!);
      expect(c.colors).toEqual(["R", "W"]);
      expect(c.subtypes[0]).toBe("Human");
      seen.set(c.subtypes[1]!, `${c.power}/${c.toughness} ${[...c.keywords].sort().join(",")}`);
      // The Rogue's "When this token enters, it deals 1 damage to any target".
      if (c.subtypes[1] === "Rogue") expect(s.players[opp]!.life).toBe(39);
    }
    expect(Object.fromEntries(seen)).toEqual({ Warrior: "3/1 Haste,Trample", Cleric: "2/1 Haste,Lifelink", Rogue: "1/2 Haste" });
  });

  it("Valgavoth's Onslaught: manifest dread X times, then X +1/+1 counters on each of those creatures", () => {
    const { s: s0, ap, ids } = setup([onslaught()]);
    const yard = s0.players[ap]!.graveyard.length;
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 2));
    for (let i = 0; i < 2; i++) {
      s = settle(s);
      expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
      const cards = s.pending?.kind === "searchLibrary" ? s.pending.cards : [];
      s = act(s, { type: "searchLibrary", player: ap, found: [cards[0]!] });
    }
    s = settle(s);
    const down = s.battlefield.filter((id) => s.objects[id]!.faceDown);
    expect(down).toHaveLength(2);
    for (const id of down) {
      expect(s.objects[id]!.counters["+1/+1"]).toBe(2);
      expect(pt(s, id)).toBe("4/4");
    }
    // Each manifest dread put the other card into the graveyard, and the spell went there too.
    expect(s.players[ap]!.graveyard.length).toBe(yard + 3);
  });

  it("Motivated Pony: attacking creatures get +1/+1; with a Food entered this turn they untap and get +2/+2 more", () => {
    for (const food of [false, true]) {
      const { s: s0, ap, opp, ids } = setup([bakery]);
      const p = putOnBattlefield(s0, ap, pony());
      const b = putOnBattlefield(s0, ap, bear());
      let s = s0;
      if (food) s = settle(run(s, planCast(s, ap, ids[0]!)));
      s = passUntil(s, "declareAttackers", ap);
      s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: p, defender: opp }, { attacker: b, defender: opp }] });
      s = settle(s);
      expect(pt(s, p)).toBe(food ? "6/6" : "4/4");
      expect(pt(s, b)).toBe(food ? "5/5" : "3/3");
      expect(s.objects[b]!.tapped).toBe(!food);
    }
  });

  it("March of Reckless Joy: exile the top X cards; up to two of them may be played until the end of your next turn", () => {
    const { s: s0, ap, ids } = setup([march()]);
    const tops = [0, 1, 2].map((i) => into(s0, ap, bear({ name: `Test Beast ${i}` }), "library"));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 3)));
    for (const id of tops) expect(s.objects[id]!.zone).toBe("exile");
    s = settle(run(s, planCast(s, ap, tops[0]!)));
    expect(s.objects[tops[0]!]!.zone).toBe("battlefield");
    s = settle(run(s, planCast(s, ap, tops[1]!)));
    expect(s.objects[tops[1]!]!.zone).toBe("battlefield");
    // Two played: the third can't be.
    expect(castProblem(s, ap, tops[2]!)).not.toBeNull();
    expect(planCast(s, ap, tops[2]!)).toBeNull();
  });

  it("March of Reckless Joy: with only one played this turn, another may be played during your next turn", () => {
    const { s: s0, ap, ids } = setup([march()]);
    const tops = [0, 1, 2].map((i) => into(s0, ap, bear({ name: `Test Beast ${i}` }), "library"));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, 3)));
    s = settle(run(s, planCast(s, ap, tops[0]!)));
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    s = passUntil(s, "main1", ap);
    s.players[ap]!.manaPool.G = 2;
    expect(castProblem(s, ap, tops[1]!)).toBeNull();
    s = settle(run(s, planCast(s, ap, tops[1]!)));
    expect(s.objects[tops[1]!]!.zone).toBe("battlefield");
    expect(castProblem(s, ap, tops[2]!)).not.toBeNull();
  });

  it("Alena, Kessig Trapper: {R} for the greatest power among creatures you control that entered this turn", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, alena());
    const old = putOnBattlefield(s0, ap, bear({ name: "Test Giant", power: "7", toughness: "7" }));
    expect(old).toBeDefined();
    let s = act(s0, { type: "activateMana", player: ap, objectId: a, mana: "R" });
    // Nothing entered this turn: no mana.
    expect(s.players[ap]!.manaPool.R ?? 0).toBe(0);
    const { s: t0, ap: bp } = setup([]);
    const a2 = putOnBattlefield(t0, bp, alena());
    const fresh = putOnBattlefield(t0, bp, bear({ name: "Test Ogre", power: "3", toughness: "3" }));
    const giant = putOnBattlefield(t0, bp, bear({ name: "Test Giant", power: "7", toughness: "7" }));
    t0.objects[fresh]!.enteredTurn = t0.turn;
    t0.objects[a2]!.enteredTurn = t0.turn;
    expect(giant).toBeDefined();
    s = act(t0, { type: "activateMana", player: bp, objectId: a2, mana: "R" });
    // Alena (4) entered this turn too and is the greatest; the 7/7 didn't enter this turn.
    expect(s.players[bp]!.manaPool.R).toBe(4);
  });

  it("The Blue Spirit: the first creature spell each turn has flash; a nontoken creature entering during combat draws a card", () => {
    const { s: s0, ap, ids } = setup([bear({ name: "Test Ox" }), bear({ name: "Test Yak" })]);
    putOnBattlefield(s0, ap, blueSpirit());
    let s = passUntil(s0, "beginCombat", ap);
    expect(s.turn).toBe(s0.turn);
    s.players[ap]!.manaPool.G = 4;
    expect(castProblem(s, ap, ids[0]!)).toBeNull();
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    // Cast (one card left the hand), entered during combat (one drawn).
    expect(s.players[ap]!.hand.length).toBe(hand);
    // The second creature spell this turn has no flash.
    expect(castProblem(s, ap, ids[1]!)).not.toBeNull();
  });

  it("The Blue Spirit: a creature entering in a main phase draws nothing", () => {
    const { s: s0, ap, ids } = setup([bear({ name: "Test Ox" })]);
    putOnBattlefield(s0, ap, blueSpirit());
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
  });

  it("Umbris, Fear Manifest: +1/+1 for each card opponents own in exile; it or another Nightmare or Horror entering exiles cards from the top of an opponent's library until a land card", () => {
    const { s: s0, ap, opp, ids } = setup([umbris(), horror, bear({ name: "Test Ox" })]);
    into(s0, opp, bear(), "exile");
    const down = into(s0, opp, bear(), "exile");
    s0.objects[down]!.faceDown = "manifest";
    into(s0, ap, bear(), "exile");
    const third = s0.turnOrder[(s0.turnOrder.indexOf(opp) + 1) % 4]!;
    into(s0, third, bear(), "exile");
    const top = [card("Test Plains", "Land", ""), bear({ name: "Test Elk" }), bear({ name: "Test Doe" })].map((d) => into(s0, opp, d, "library"));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, { targets: [{ kind: "player", id: opp }] });
    const u = ids[0]!;
    // The Doe and Elk, then the land: exiled, the land too.
    for (const id of top) expect(s.objects[id]!.zone).toBe("exile");
    // 3 opponents' cards before (one face down) plus the three: 6, not counting your own.
    expect(pt(s, u)).toBe("7/7");
    // A Horror entering triggers it too; a Bear doesn't.
    const exiled = s.players[opp]!.exile.length;
    s = settle(run(s, planCast(s, ap, ids[1]!)), { targets: [{ kind: "player", id: opp }] });
    expect(s.players[opp]!.exile.length).toBeGreaterThan(exiled);
    const after = s.players[opp]!.exile.length;
    s = settle(run(s, planCast(s, ap, ids[2]!)), { targets: [{ kind: "player", id: opp }] });
    expect(s.players[opp]!.exile.length).toBe(after);
  });

  it("Basri Ket −2: whenever one or more nontoken creatures attack this turn, that many Soldiers tapped and attacking", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = walker(s0, ap, basri(), 3);
    const a = putOnBattlefield(s0, ap, bear({ name: "Test Ox" }));
    const b = putOnBattlefield(s0, ap, bear({ name: "Test Yak" }));
    const tok = putOnBattlefield(s0, ap, bear({ name: "Test Wolf" }));
    s0.objects[tok]!.isToken = true;
    let s = settle(run(s0, planActivate(s0, ap, k, 1)));
    expect(s.objects[k]!.counters.loyalty).toBe(1);
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [a, b, tok].map((attacker) => ({ attacker, defender: opp })) });
    for (let i = 0; i < 20; i++) {
      s = settle(s);
      const p = s.pending;
      if (p?.kind === "chooseOption" && p.what === "attackWhom") s = act(s, { type: "chooseOption", player: p.player, choice: String(opp) });
      else break;
    }
    const soldiers = named(s, "Soldier Token");
    // Two nontoken attackers: two Soldiers (the token attacking isn't counted, rulings).
    expect(soldiers).toHaveLength(2);
    for (const id of soldiers) expect(s.objects[id]).toMatchObject({ tapped: true, attacking: expect.anything() });
  });

  it("Desertion: a countered creature spell enters under your control; an instant goes to its owner's graveyard", () => {
    const { s: s0, ap, opp, ids } = setup([desertion(), desertion()]);
    const lynx = into(s0, opp, flashBear(), "hand");
    const zap = into(s0, opp, shock, "hand");
    s0.players[opp]!.manaPool.G = 2;
    s0.players[opp]!.manaPool.R = 1;
    let s = toPlayer(s0, opp);
    s = run(s, planCast(s, opp, lynx));
    s = toPlayer(s, ap);
    const spell = s.stack[s.stack.length - 1]!;
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "stack", id: spell.id }])));
    expect(s.objects[lynx]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[lynx]!)).toBe(ap);
    expect(s.objects[lynx]!.owner).toBe(opp);
    // An instant isn't an artifact or creature spell: countered into its owner's graveyard.
    s = toPlayer(s, opp);
    s.players[opp]!.manaPool.R = 1;
    s = run(s, planCast(s, opp, zap, [{ kind: "player", id: ap }]));
    s = toPlayer(s, ap);
    const spell2 = s.stack[s.stack.length - 1]!;
    s.players[ap]!.manaPool.U = 5;
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: spell2.id }])));
    expect(s.objects[zap]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(40);
  });

  it("Kamahl's Will: with a commander, both modes: the lands become 1/1 creatures in time to deal damage to the target creature too", () => {
    const { s: s0, ap, opp, ids } = setup([kamahl()]);
    putOnBattlefield(s0, ap, card("Test Legend", "Legendary Creature — Elf", "{G}", { power: "2", toughness: "2" }), { commander: true });
    const lands = s0.battlefield.filter((id) => controllerOf(s0, s0.objects[id]!) === ap && defOf(s0, s0.objects[id]!).name === "Plains").slice(0, 2);
    const big = putOnBattlefield(s0, opp, bear({ name: "Test Wurm", power: "4", toughness: "4" }));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(lands[0]!), tgt(lands[1]!), tgt(big)], [0, 1])));
    for (const l of lands) {
      expect(characteristics(s, s.objects[l]!).types).toEqual(expect.arrayContaining(["Land", "Creature"]));
      expect(pt(s, l)).toBe("1/1");
    }
    // 2 (the commander) + 1 + 1: the 4/4 dies.
    expect(s.objects[big]!.zone).toBe("graveyard");
  });

  it("Kamahl's Will: without a commander only one mode, damage from each creature you control", () => {
    const { s: s0, ap, opp, ids } = setup([kamahl()]);
    putOnBattlefield(s0, ap, bear({ name: "Test Ox", power: "3", toughness: "3" }));
    const big = putOnBattlefield(s0, opp, bear({ name: "Test Wurm", power: "4", toughness: "4" }));
    expect(planCast(s0, ap, ids[0]!, [tgt(big)], [0, 1])).toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(big)], [1])));
    expect(s.objects[big]!.damage).toBe(3);
  });
});
