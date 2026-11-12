// Lane B round B184: friend or foe ("Each friend puts a +1/+1 counter on each creature they control. Each foe chooses one
// untapped creature they control, then taps the rest." Regna's Sanction; "Each friend creates a token that's a copy of a
// creature they control. Each foe returns a creature they control to its owner's hand." Zndrsplt's Judgment), Curse of
// Inertia ("that attacking player may tap or untap target permanent of their choice"), Kathril, Aspect Warper (keyword
// counters for the keywords of creature cards in your graveyard), Feral Encounter ("You may cast the exiled card this
// turn. At the beginning of the next combat phase this turn, ..."), and activation taxes that reach mana abilities too
// (Oppressive Rays, Gloom). The Fugitive Doctor: "target instant or sorcery card in your graveyard gains flashback
// {2}{R}{G} until end of turn" (round 340's fixed-cost flashback grant).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, planManaAbility, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const regna = (): CardDef => ({"oracleId":"b594f7f1-1db7-46e9-bbc7-42ccc16ce9a1","name":"Regna's Sanction","manaCost":"{3}{W}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"For each player, choose friend or foe. Each friend puts a +1/+1 counter on each creature they control. Each foe chooses one untapped creature they control, then taps the rest.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/e/3ea0c6c5-f782-40bf-a0c9-ee7e97963146.jpg?1783934869","artUrl":"https://cards.scryfall.io/art_crop/front/3/e/3ea0c6c5-f782-40bf-a0c9-ee7e97963146.jpg?1783934869","commanderLegal":"legal","set":"bbd","releasedAt":"2018-06-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const judgment = (): CardDef => ({"oracleId":"7aacfc42-be6c-46a8-b474-f43a1b6b2ef8","name":"Zndrsplt's Judgment","manaCost":"{4}{U}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"For each player, choose friend or foe. Each friend creates a token that's a copy of a creature they control. Each foe returns a creature they control to its owner's hand.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/7/17eed02c-e2af-4642-b411-1b20494109a7.jpg?1783934864","artUrl":"https://cards.scryfall.io/art_crop/front/1/7/17eed02c-e2af-4642-b411-1b20494109a7.jpg?1783934864","commanderLegal":"legal","set":"bbd","releasedAt":"2018-06-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const inertia = (): CardDef => ({"oracleId":"0bbeb0ee-647b-43d3-91b3-6869d5ccb8b8","name":"Curse of Inertia","manaCost":"{2}{U}","cmc":3,"typeLine":"Enchantment — Aura Curse","supertypes":[],"types":["Enchantment"],"subtypes":["Aura","Curse"],"oracleText":"Enchant player\nWhenever a player attacks enchanted player with one or more creatures, that attacking player may tap or untap target permanent of their choice.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/5/f/5f6073c3-43aa-441f-98fe-0135f96ffa04.jpg?1783939685","artUrl":"https://cards.scryfall.io/art_crop/front/5/f/5f6073c3-43aa-441f-98fe-0135f96ffa04.jpg?1783939685","commanderLegal":"legal","set":"c13","releasedAt":"2013-11-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const kathril = (): CardDef => ({"oracleId":"730897a9-3ead-4990-9492-1a2040d8ccac","name":"Kathril, Aspect Warper","manaCost":"{2}{W}{B}{G}","cmc":5,"typeLine":"Legendary Creature — Nightmare Insect","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Nightmare","Insect"],"oracleText":"When Kathril enters, put a flying counter on any creature you control if a creature card in your graveyard has flying. Repeat this process for first strike, double strike, deathtouch, hexproof, indestructible, lifelink, menace, reach, trample, and vigilance. Then put a +1/+1 counter on Kathril for each counter put on a creature this way.","power":"3","toughness":"3","colors":["B","G","W"],"colorIdentity":["B","G","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/b/ebc57f73-a517-463e-8d55-56aa996d091e.jpg?1783931231","artUrl":"https://cards.scryfall.io/art_crop/front/e/b/ebc57f73-a517-463e-8d55-56aa996d091e.jpg?1783931231","commanderLegal":"legal","set":"c20","releasedAt":"2020-04-17","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const feral = (): CardDef => ({"oracleId":"5a8196ef-24ee-40b6-97d1-8a2257180f86","name":"Feral Encounter","manaCost":"{G}{G}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Look at the top five cards of your library. You may exile a creature card from among them. Put the rest on the bottom of your library in a random order. You may cast the exiled card this turn. At the beginning of the next combat phase this turn, target creature you control deals damage equal to its power to up to one target creature you don't control.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/9/794c5066-724b-4f94-aa6e-7b0690dd706e.jpg?1783915030","artUrl":"https://cards.scryfall.io/art_crop/front/7/9/794c5066-724b-4f94-aa6e-7b0690dd706e.jpg?1783915030","commanderLegal":"legal","set":"woe","releasedAt":"2023-09-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const rays = (): CardDef => ({"oracleId":"4a17fb46-70db-4c9a-ac0e-dfc774345673","name":"Oppressive Rays","manaCost":"{W}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block unless its controller pays {3}.\nActivated abilities of enchanted creature cost {3} more to activate.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/1/e/1eac995f-514d-4c65-8135-417f2b1a6fba.jpg?1783939457","artUrl":"https://cards.scryfall.io/art_crop/front/1/e/1eac995f-514d-4c65-8135-417f2b1a6fba.jpg?1783939457","commanderLegal":"legal","set":"jou","releasedAt":"2014-05-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const gloom = (): CardDef => ({"oracleId":"4d022f53-b1fb-4071-afcc-0af3214fe604","name":"Gloom","manaCost":"{2}{B}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"White spells cost {3} more to cast.\nActivated abilities of white enchantments cost {3} more to activate.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/8/a8d10bc7-daeb-4c0d-9e4a-8eae8d11699f.jpg?1783948696","artUrl":"https://cards.scryfall.io/art_crop/front/a/8/a8d10bc7-daeb-4c0d-9e4a-8eae8d11699f.jpg?1783948696","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const angel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const knight = (): CardDef => ({"oracleId":"7b51a979-47e0-4b98-8ec5-8064c83422e1","name":"Knight of Grace","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Human Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"First strike (This creature deals combat damage before creatures without first strike.)\nHexproof from black (This creature can't be the target of black spells or abilities your opponents control.)\nThis creature gets +1/+0 as long as any player controls a black permanent.","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["Hexproof from","Hexproof","First strike"],"imageUrl":"https://cards.scryfall.io/normal/front/7/b/7bbbddc0-f8b3-4255-bd82-d50f829ca009.jpg?1783935041","artUrl":"https://cards.scryfall.io/art_crop/front/7/b/7bbbddc0-f8b3-4255-bd82-d50f829ca009.jpg?1783935041","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const mesa = (): CardDef => ({"oracleId":"8776d14f-a5a2-4ef3-98d0-e1148e579e4d","name":"Sacred Mesa","manaCost":"{2}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, sacrifice this enchantment unless you sacrifice a Pegasus.\n{1}{W}: Create a 1/1 white Pegasus creature token with flying.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/7/377b2bc1-c710-439d-96d2-beef72ae80a7.jpg?1783938856","artUrl":"https://cards.scryfall.io/art_crop/front/3/7/377b2bc1-c710-439d-96d2-beef72ae80a7.jpg?1783938856","commanderLegal":"legal","set":"c14","releasedAt":"2014-11-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sorcerer = (): CardDef => ({"oracleId":"5e961d15-5972-4e4b-9385-1cd7cd7c6bbe","name":"Prodigal Sorcerer","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Human Wizard Sorcerer","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard","Sorcerer"],"oracleText":"{T}: This creature deals 1 damage to any target.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/0/50aef269-55f9-4d84-8bc5-29e794297f11.jpg?1783937607","artUrl":"https://cards.scryfall.io/art_crop/front/5/0/50aef269-55f9-4d84-8bc5-29e794297f11.jpg?1783937607","commanderLegal":"legal","set":"ema","releasedAt":"2016-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const arbor = (): CardDef => ({"oracleId":"e996cd67-739c-40f4-b276-0042acf26c71","name":"Dryad Arbor","manaCost":"","cmc":0,"typeLine":"Land Creature — Forest Dryad","supertypes":[],"types":["Land","Creature"],"subtypes":["Forest","Dryad"],"oracleText":"(This land isn't a spell, it's affected by summoning sickness, and it has \"{T}: Add {G}.\")","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/5/c/5c4fb7f9-a551-4253-a46e-f6284d355388.jpg?1783904262","artUrl":"https://cards.scryfall.io/art_crop/front/5/c/5c4fb7f9-a551-4253-a46e-f6284d355388.jpg?1783904262","commanderLegal":"legal","set":"sld","releasedAt":"2026-02-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const doctor = (): CardDef => ({"oracleId":"b3a03768-7676-4b33-a813-cc69dea77c4d","name":"The Fugitive Doctor","manaCost":"{3}{R}{G}","cmc":5,"typeLine":"Legendary Creature — Time Lord Doctor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Time Lord","Doctor"],"oracleText":"When The Fugitive Doctor enters, investigate.\nWhenever The Fugitive Doctor attacks, you may sacrifice a Clue. When you do, target instant or sorcery card in your graveyard gains flashback {2}{R}{G} until end of turn. (You may cast that card from your graveyard for its flashback cost. Then exile it.)","power":"4","toughness":"4","colors":["G","R"],"colorIdentity":["G","R"],"keywords":["Investigate"],"imageUrl":"https://cards.scryfall.io/normal/front/f/e/fea8bd29-80a4-463f-b3bd-e15f4bd5f5ce.jpg?1783914637","artUrl":"https://cards.scryfall.io/art_crop/front/f/e/fea8bd29-80a4-463f-b3bd-e15f4bd5f5ce.jpg?1783914637","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const fireball = (): CardDef => ({"oracleId":"aa7714b0-2bfb-458a-8ebf-37ec2c53383e","name":"Fireball","manaCost":"{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"This spell costs {1} more to cast for each target beyond the first.\nFireball deals X damage divided evenly, rounded down, among any number of targets.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/2/82a97aae-d8a7-4451-a47e-ea878dea6e4c.jpg?1783922638","artUrl":"https://cards.scryfall.io/art_crop/front/8/2/82a97aae-d8a7-4451-a47e-ea878dea6e4c.jpg?1783922638","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Passes until the stack and triggers are done, or something asks a question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 200 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Everyone passes (no attacks, no blocks; a bot answers anything else) until `done` holds. */
const passTill = (s: GameState, done: (s: GameState) => boolean) => {
  for (let i = 0; i < 4000 && !done(s); i++) {
    const pid = waitingOn(s)!;
    if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (s.pending?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, s.pending.count) });
    else if (s.pending) s = run(s, botActions(s, pid));
    else s = act(s, { type: "passPriority", player: pid });
  }
  if (!done(s)) throw new Error("never got there");
  return s;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
/** A card of `def` owned by `pid`, put into `where` (on top of the library). */
const place = (s: GameState, pid: PlayerId, def: CardDef, where: "graveyard" | "library" | "hand" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Takes `pid`'s lands off the battlefield and leaves exactly `pool` to pay with. */
const poolOnly = (s: GameState, pid: PlayerId, pool: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  for (const id of s.battlefield.filter((x) => s.objects[x]!.controller === pid && characteristics(s, s.objects[x]!).types.includes("Land"))) {
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  s.players[pid]!.manaPool = { ...s.players[pid]!.manaPool, ...pool };
  invalidateCharacteristics(s);
};
const castPlan = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}) => planCast(s, pid, id, targets, undefined, "auto", undefined, choices);
const obj = (id: ObjectId): TargetChoice => ({ kind: "object", id });
const counters = (s: GameState, id: ObjectId, kind = "+1/+1") => s.objects[id]!.counters[kind] ?? 0;
const keywords = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).keywords;
/** Answers "choose friend or foe" for each player in turn with `words` (by player). */
const friendOrFoe = (s: GameState, words: Record<PlayerId, "friend" | "foe">) => {
  for (let i = 0; i < 8 && s.pending?.kind === "chooseOption" && s.pending.what === "word"; i++) {
    const of = s.pending.of!;
    s = act(s, { type: "chooseOption", player: s.pending.player, choice: words[of]! });
  }
  return s;
};

describe("Round B184 cards are supported", () => {
  it("compiles all seven", () => supported(regna(), judgment(), inertia(), kathril(), feral(), rays(), gloom()));
});

describe("Regna's Sanction: each friend puts a +1/+1 counter on each creature they control; each foe keeps one untapped creature and taps the rest", () => {
  it("friends' creatures get counters, a foe chooses the one to keep untapped, the rest are tapped at once", () => {
    const { s: s0, ap, opp } = setup([]);
    const others = s0.turnOrder.filter((p) => p !== ap && p !== opp);
    const mine = putOnBattlefield(s0, ap, bears());
    const friendBear = putOnBattlefield(s0, others[0]!, bears());
    const foeA = putOnBattlefield(s0, opp, bears());
    const foeB = putOnBattlefield(s0, opp, angel());
    const foeTapped = putOnBattlefield(s0, opp, bears());
    s0.objects[foeTapped]!.tapped = true;
    const lone = putOnBattlefield(s0, others[1]!, bears());
    const spell = place(s0, ap, regna(), "hand");
    let s = settle(run(s0, castPlan(s0, ap, spell)));
    // Its caster chooses for each player, themselves too (rulings).
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "word" });
    s = friendOrFoe(s, { [ap]: "friend", [others[0]!]: "friend", [opp]: "foe", [others[1]!]: "foe" });
    // The foe with two untapped creatures chooses; the one with one keeps it without a question.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: opp, action: "keep", tap: true });
    expect((s.pending as { options: ObjectId[] }).options.sort()).toEqual([foeA, foeB].sort());
    s = settle(act(s, { type: "pickPermanents", player: opp, ids: [foeB] }));
    expect(s.pending).toBeNull();
    expect(counters(s, mine)).toBe(1);
    expect(counters(s, friendBear)).toBe(1);
    expect(counters(s, foeA) + counters(s, foeB) + counters(s, lone)).toBe(0);
    expect(s.objects[foeB]!.tapped).toBe(false);
    expect(s.objects[foeA]!.tapped).toBe(true);
    expect(s.objects[foeTapped]!.tapped).toBe(true);
    expect(s.objects[lone]!.tapped).toBe(false);
    expect(zone(s, spell)).toBe("graveyard");
  });

  it("calling yourself a foe works too; a bot foe keeps its best creature untapped", () => {
    const { s: s0, ap, opp } = setup([]);
    const small = putOnBattlefield(s0, opp, bears());
    const big = putOnBattlefield(s0, opp, angel());
    const mine = putOnBattlefield(s0, ap, bears());
    const mine2 = putOnBattlefield(s0, ap, bears());
    const spell = place(s0, ap, regna(), "hand");
    let s = settle(run(s0, castPlan(s0, ap, spell)));
    s = friendOrFoe(s, Object.fromEntries(s.turnOrder.map((p) => [p, "foe"])) as Record<PlayerId, "foe">);
    // We choose first (APNAP), then the opponent, who is a bot here.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap });
    s = act(s, { type: "pickPermanents", player: ap, ids: [mine2] });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: opp });
    s = settle(run(s, botActions(s, opp)));
    expect(s.objects[big]!.tapped).toBe(false);
    expect(s.objects[small]!.tapped).toBe(true);
    expect(s.objects[mine]!.tapped).toBe(true);
    expect(s.objects[mine2]!.tapped).toBe(false);
    expect(counters(s, mine)).toBe(0);
  });

  it("a bot casting it calls itself a friend", () => {
    const { s: s0, ap } = setup([]);
    const mine = putOnBattlefield(s0, ap, bears());
    const spell = place(s0, ap, regna(), "hand");
    let s = settle(run(s0, castPlan(s0, ap, spell)));
    for (let i = 0; i < 10 && s.pending; i++) s = settle(run(s, botActions(s, waitingOn(s)!)));
    expect(counters(s, mine)).toBe(1);
  });
});

describe("Zndrsplt's Judgment: each friend copies a creature they control; each foe returns one to its owner's hand", () => {
  it("each friend chooses theirs and gets a token copy; each foe chooses one to return", () => {
    const { s: s0, ap, opp } = setup([]);
    const others = s0.turnOrder.filter((p) => p !== ap && p !== opp);
    const myBear = putOnBattlefield(s0, ap, bears());
    const myAngel = putOnBattlefield(s0, ap, angel());
    const theirBear = putOnBattlefield(s0, others[0]!, bears());
    const foeBear = putOnBattlefield(s0, opp, bears());
    const foeAngel = putOnBattlefield(s0, opp, angel());
    const spell = place(s0, ap, judgment(), "hand");
    const before = s0.battlefield.length;
    let s = settle(run(s0, castPlan(s0, ap, spell)));
    s = friendOrFoe(s, { [ap]: "friend", [others[0]!]: "friend", [opp]: "foe", [others[1]!]: "foe" });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap });
    s = act(s, { type: "pickPermanents", player: ap, ids: [myAngel] });
    // The other friend has one creature: no question.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: opp });
    s = settle(act(s, { type: "pickPermanents", player: opp, ids: [foeBear] }));
    expect(s.pending).toBeNull();
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken);
    expect(tokens.length).toBe(2);
    const mineTok = tokens.find((id) => s.objects[id]!.controller === ap)!;
    const theirTok = tokens.find((id) => s.objects[id]!.controller === others[0])!;
    expect(characteristics(s, s.objects[mineTok]!).name).toBe("Serra Angel");
    expect(characteristics(s, s.objects[theirTok]!).name).toBe("Grizzly Bears");
    expect(zone(s, foeBear)).toBe("hand");
    expect(zone(s, foeAngel)).toBe("battlefield");
    expect(zone(s, myBear)).toBe("battlefield");
    expect(zone(s, theirBear)).toBe("battlefield");
    expect(s.battlefield.length).toBe(before + 2 - 1);
  });
});

describe("Curse of Inertia: the attacking player may tap or untap target permanent of their choice", () => {
  const scene = () => {
    const { s, ap, opp } = setup([]);
    const third = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    // A third player's Curse on the opponent: the attacking player chooses, the Curse's controller controls it.
    const curse = putOnBattlefield(s, third, inertia());
    s.objects[curse]!.attachedToPlayer = opp;
    const hitter = putOnBattlefield(s, ap, bears());
    const blocker = putOnBattlefield(s, opp, angel());
    s.players[ap]!.command = [];
    return { s, ap, opp, third, curse, hitter, blocker };
  };
  const attackWith = (s0: GameState, ap: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId }[]) => {
    let s = passTill(s0, (x) => x.pending?.kind === "declareAttackers" && x.activePlayer === ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks });
    return settle(s);
  };

  it("the attacking player chooses the target as it triggers and decides as it resolves", () => {
    const { s: s0, ap, opp, third, hitter, blocker } = scene();
    let s = attackWith(s0, ap, [{ attacker: hitter, defender: opp }]);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap, controller: third });
    s = act(s, { type: "chooseTargets", player: ap, targets: [obj(blocker)] });
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "tapOrUntap", about: blocker });
    expect((s.pending as { options: string[] }).options).toEqual(["tap", "untap", "neither"]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "tap" }));
    expect(s.objects[blocker]!.tapped).toBe(true);
    expect(s.objects[hitter]!.tapped).toBe(true);
  });

  it("untapping the attacker is allowed too, and so is neither", () => {
    const { s: s0, ap, opp, hitter, blocker } = scene();
    let s = attackWith(s0, ap, [{ attacker: hitter, defender: opp }]);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [obj(hitter)] }));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "untap" }));
    expect(s.objects[hitter]!.tapped).toBe(false);
    expect(s.objects[hitter]!.attacking).toBeDefined();
    expect(s.objects[blocker]!.tapped).toBe(false);
  });

  it("not for an attack on another player", () => {
    const { s: s0, ap, third, hitter } = scene();
    const s = attackWith(s0, ap, [{ attacker: hitter, defender: third }]);
    expect(s.pending?.kind).not.toBe("chooseTargets");
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
  });

  it("a bot attacker taps the defending player's untapped creature", () => {
    const { s: s0, ap, opp, hitter, blocker } = scene();
    let s = attackWith(s0, ap, [{ attacker: hitter, defender: opp }]);
    s = run(s, botActions(s, ap));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, about: blocker });
    s = settle(run(s, botActions(s, ap)));
    expect(s.objects[blocker]!.tapped).toBe(true);
  });
});

describe("Kathril, Aspect Warper: a keyword counter for each keyword among creature cards in your graveyard", () => {
  it("one counter per keyword however many cards have it, each hexproof variant too, then that many +1/+1 counters on Kathril", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.graveyard = [];
    place(s0, ap, angel(), "graveyard"); // flying, vigilance
    place(s0, ap, angel(), "graveyard"); // flying again: still one
    place(s0, ap, knight(), "graveyard"); // first strike, hexproof from black
    const k = place(s0, ap, kathril(), "hand");
    poolOnly(s0, ap, { W: 1, B: 1, G: 1, C: 2 });
    const s = settle(run(s0, castPlan(s0, ap, k)));
    expect(s.pending).toBeNull();
    expect(zone(s, k)).toBe("battlefield");
    for (const kind of ["flying", "first strike", "hexproof from black", "vigilance"]) expect(counters(s, k, kind), kind).toBe(1);
    expect(counters(s, k, "hexproof")).toBe(0);
    expect(counters(s, k)).toBe(4);
    expect(keywords(s, k)).toEqual(expect.arrayContaining(["Flying", "First strike", "Hexproof from black", "Vigilance"]));
  });

  it("each counter goes on a creature you choose; an opponent's graveyard doesn't count", () => {
    const { s: s0, ap, opp } = setup([]);
    s0.players[ap]!.graveyard = [];
    place(s0, ap, angel(), "graveyard");
    place(s0, opp, knight(), "graveyard");
    const bear = putOnBattlefield(s0, ap, bears());
    const k = place(s0, ap, kathril(), "hand");
    poolOnly(s0, ap, { W: 1, B: 1, G: 1, C: 2 });
    let s = settle(run(s0, castPlan(s0, ap, k)));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "counters", counter: "flying" });
    s = act(s, { type: "pickPermanents", player: ap, ids: [bear] });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", counter: "vigilance" });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [k] }));
    expect(s.pending).toBeNull();
    expect(keywords(s, bear)).toContain("Flying");
    expect(counters(s, k, "vigilance")).toBe(1);
    expect(counters(s, k, "first strike")).toBe(0);
    expect(counters(s, k)).toBe(2);
  });

  it("nothing with no keywords among them", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.graveyard = [];
    place(s0, ap, bears(), "graveyard");
    const k = place(s0, ap, kathril(), "hand");
    poolOnly(s0, ap, { W: 1, B: 1, G: 1, C: 2 });
    const s = settle(run(s0, castPlan(s0, ap, k)));
    expect(Object.values(s.objects[k]!.counters).filter(Boolean).length).toBe(0);
  });
});

describe("Feral Encounter: cast the exiled creature card this turn; at the next combat this turn, a bite", () => {
  const scene = (top: () => CardDef) => {
    const { s, ap, opp } = setup([]);
    const found = place(s, ap, top(), "library");
    const mine = putOnBattlefield(s, ap, angel());
    const theirs = putOnBattlefield(s, opp, bears());
    const spell = place(s, ap, feral(), "hand");
    s.players[ap]!.command = [];
    return { s, ap, opp, found, mine, theirs, spell };
  };

  it("the exiled creature card can be cast this turn; at the beginning of combat the chosen creature deals damage equal to its power", () => {
    const { s: s0, ap, found, mine, theirs, spell } = scene(bears);
    let s = settle(run(s0, castPlan(s0, ap, spell)));
    expect(s.pending?.kind).toBe("searchLibrary");
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [found] }));
    expect(zone(s, found)).toBe("exile");
    expect(s.objects[found]!.mayPlay).toMatchObject({ player: ap, castOnly: true, until: "thisTurn" });
    s = settle(run(s, castPlan(s, ap, found)));
    expect(zone(s, found)).toBe("battlefield");
    // The beginning of combat: the targets are chosen as the delayed trigger is put on the stack.
    s = passTill(s, (x) => x.pending?.kind === "chooseTargets");
    expect(s.step).toBe("beginCombat");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [obj(mine), obj(theirs)] }));
    expect(zone(s, theirs)).toBe("graveyard");
  });

  it("a land creature card can't be played from exile: it's cast only", () => {
    const { s: s0, ap, found, spell } = scene(arbor);
    let s = settle(run(s0, castPlan(s0, ap, spell)));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [found] }));
    expect(zone(s, found)).toBe("exile");
    expect(() => act(s, { type: "playLand", player: ap, objectId: found })).toThrow();
  });

  it("cast after combat, no trigger comes on a later turn", () => {
    const { s: s0, ap, mine, theirs, spell } = scene(bears);
    let s = passTill(s0, (x) => x.step === "main2" && x.activePlayer === ap && !x.stack.length);
    s = settle(run(s, castPlan(s, ap, spell)));
    if (s.pending?.kind === "searchLibrary") s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    expect(s.delayed?.some((d) => d.when === "nextBeginCombat")).toBe(true);
    s = passTill(s, (x) => x.activePlayer !== ap && x.step === "main1");
    s = passTill(s, (x) => x.activePlayer !== ap && x.step === "declareAttackers" || x.pending?.kind === "chooseTargets");
    expect(s.pending?.kind).not.toBe("chooseTargets");
    expect(s.delayed?.some((d) => d.when === "nextBeginCombat") ?? false).toBe(false);
    expect(zone(s, theirs)).toBe("battlefield");
    expect(zone(s, mine)).toBe("battlefield");
  });
});

describe("Oppressive Rays and Gloom: activated abilities cost {3} more, mana abilities too", () => {
  const enchant = (s: GameState, pid: PlayerId, host: ObjectId) => {
    const aura = putOnBattlefield(s, pid, rays());
    s.objects[aura]!.attachedTo = host;
    invalidateCharacteristics(s);
    return aura;
  };

  it("the enchanted creature's ability costs {3} more; other creatures' don't", () => {
    const { s, ap, opp } = setup([]);
    const pinger = putOnBattlefield(s, ap, sorcerer());
    const other = putOnBattlefield(s, ap, sorcerer());
    enchant(s, opp, pinger);
    poolOnly(s, ap, { C: 2 });
    expect(planActivate(s, ap, pinger, 0, [{ kind: "player", id: opp }])).toBeNull();
    expect(planActivate(s, ap, other, 0, [{ kind: "player", id: opp }])).not.toBeNull();
    s.players[ap]!.manaPool.C = 3;
    const after = settle(run(s, planActivate(s, ap, pinger, 0, [{ kind: "player", id: opp }])));
    expect(after.players[ap]!.manaPool.C ?? 0).toBe(0);
  });

  it("an enchanted Llanowar Elves's mana ability costs {3}: not activatable for free, and payment doesn't use it", () => {
    const { s, ap, opp } = setup([]);
    const elf = putOnBattlefield(s, ap, elves());
    enchant(s, opp, elf);
    poolOnly(s, ap, {});
    expect(planManaAbility(s, ap, elf, 0, "G")).toBeNull();
    const bear = place(s, ap, bears(), "hand");
    expect(castPlan(s, ap, bear)).toBeNull();
    s.players[ap]!.manaPool.C = 3;
    const after = run(s, planManaAbility(s, ap, elf, 0, "G"));
    expect(after.players[ap]!.manaPool.G).toBe(1);
    expect(after.players[ap]!.manaPool.C ?? 0).toBe(0);
    expect(after.objects[elf]!.tapped).toBe(true);
  });

  it("Gloom: white enchantments' abilities cost {3} more; a green creature's mana ability doesn't", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, opp, gloom());
    const m = putOnBattlefield(s, ap, mesa());
    poolOnly(s, ap, { W: 1, C: 3 });
    expect(planActivate(s, ap, m, 0)).toBeNull();
    s.players[ap]!.manaPool.C = 4;
    expect(planActivate(s, ap, m, 0)).not.toBeNull();
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, W: 0, C: 0 };
    const elf = putOnBattlefield(s, ap, elves());
    const after = run(s, planManaAbility(s, ap, elf, 0, "G"));
    expect(after.players[ap]!.manaPool.G).toBe(1);
  });
});

describe("The Fugitive Doctor: a sacrificed Clue gives an instant or sorcery card flashback {2}{R}{G} this turn", () => {
  it("is fully supported", () => supported(doctor()));
  /** Casts the Doctor (investigate: a Clue), puts `card` in your graveyard, attacks and answers the "may"; stops at the target. */
  const attackWith = (card: CardDef, sacrifice: boolean) => {
    const { s: s0, ap, ids, opp } = setup([doctor()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const doc = ids[0]!;
    const clue = s.battlefield.find((id) => characteristics(s, s.objects[id]!).subtypes.includes("Clue"));
    expect(clue).toBeDefined();
    s.objects[doc]!.controlledSinceTurn = -1;
    const yard = place(s, ap, card, "graveyard");
    s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: doc, defender: opp }] });
    for (let i = 0; i < 50 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, prompt: "sacrifice a Clue" });
    s = act(s, { type: "chooseMay", player: ap, yes: sacrifice });
    if (s.pending?.kind === "pickPermanents") s = act(s, { type: "pickPermanents", player: ap, ids: [clue!] });
    return { s, ap, opp, yard, clue: clue! };
  };
  /** Everyone passes and nobody blocks until `ap`'s second main phase. */
  const toMain2 = (s: GameState, ap: PlayerId) =>
    passTill(s, (x) => x.step === "main2" && x.activePlayer === ap && !x.stack.length && !x.pending && waitingOn(x) === ap);
  it("sacrificing the Clue: the target gains flashback {2}{R}{G}; cast for that cost from the graveyard, then exiled", () => {
    let { s, ap, yard, clue } = attackWith(divination(), true);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: yard }] }));
    expect(s.objects[clue]?.zone ?? "gone").not.toBe("battlefield");
    expect(s.log.some((l) => /Divination gains flashback \{2\}\{R\}\{G\} until end of turn/.test(l.text))).toBe(true);
    s = toMain2(s, ap);
    const lands = () => s.battlefield.filter((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped && characteristics(s, s.objects[id]!).types.includes("Land"));
    const before = lands().length;
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, yard, undefined, undefined, undefined, undefined, { via: "grantedFlashback" })));
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(zone(s, yard)).toBe("exile");
    // {2}{R}{G}, not Divination's {2}{U}: four lands, a Mountain and a Forest among them.
    expect(lands().length).toBe(before - 4);
  });
  it("an {X} card cast with this flashback has X 0 (rulings)", () => {
    let { s, ap, opp, yard } = attackWith(fireball(), true);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: yard }] }));
    s = toMain2(s, ap);
    const life = s.players[opp]!.life;
    // No X can be chosen: the cost paid has no {X}.
    const withX = planCast(s, ap, yard, [{ kind: "player", id: opp }], undefined, undefined, undefined, { via: "grantedFlashback", x: 5 } as CostChoices);
    expect(() => run(s, withX)).toThrow(/X is 0/);
    s = settle(run(s, planCast(s, ap, yard, [{ kind: "player", id: opp }], undefined, undefined, undefined, { via: "grantedFlashback" })));
    expect(zone(s, yard)).toBe("exile");
    expect(s.players[opp]!.life).toBe(life);
  });
  it("declining keeps the Clue, and the card gains nothing", () => {
    const { s, ap, yard, clue } = attackWith(divination(), false);
    expect(s.pending?.kind === "chooseTargets" && s.pending.player === ap).toBe(false);
    expect(zone(s, clue)).toBe("battlefield");
    expect(planCast(s, ap, yard, undefined, undefined, undefined, undefined, { via: "grantedFlashback" })).toBeNull();
  });
});
