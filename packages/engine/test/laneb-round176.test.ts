// Lane B round B176: Aurification ("Each creature with a gold counter on it is a Wall ... and has defender"), Sanctum
// Lurker (planeswalkers you control aren't put into graveyards for having 0 loyalty), Arcus Acolyte (a granted hybrid
// outlast), Dimir Strandcatcher ("three or more cards were put into your graveyard from anywhere other than the
// battlefield this turn"), Laboratory Drudge ("cast a spell from a graveyard or activated an ability of a card in a
// graveyard this turn"), Thelon of Havenwood ("Exile a Fungus card from a graveyard" as a cost) and Emrakul's Evangel
// ("Sacrifice this creature and any number of other non-Eldrazi creatures").

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, botActions, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const aurif = (): CardDef => ({"oracleId":"3d98a656-1737-486f-9b25-449b7c871d1f","name":"Aurification","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a creature deals damage to you, put a gold counter on it.\nEach creature with a gold counter on it is a Wall in addition to its other creature types and has defender. (Those creatures can't attack.)\nWhen this enchantment leaves the battlefield, remove all gold counters from all creatures.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/3/93d9e9ea-9f88-4206-8960-b5ebe839ee16.jpg?1783945103","artUrl":"https://cards.scryfall.io/art_crop/front/9/3/93d9e9ea-9f88-4206-8960-b5ebe839ee16.jpg?1783945103","commanderLegal":"legal","set":"ons","releasedAt":"2002-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lurker = (): CardDef => ({"oracleId":"3ebd64d2-c178-45a2-a51f-9869754baa0f","name":"Sanctum Lurker","manaCost":"{2}{B}","cmc":3,"typeLine":"Creature — Horror","supertypes":[],"types":["Creature"],"subtypes":["Horror"],"oracleText":"When this creature enters, empower Jace 1.\nPlaneswalkers you control aren't put into their owners' graveyards for having 0 loyalty.\nPlaneswalkers you control have \"[+2]: This planeswalker deals 1 damage to each opponent and you gain 1 life.\"","power":"3","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":["Empower Jace"],"imageUrl":"https://cards.scryfall.io/normal/front/2/1/2185c08f-bb4d-49d5-8b6c-c629a48bb61c.jpg?1789556729","artUrl":"https://cards.scryfall.io/art_crop/front/2/1/2185c08f-bb4d-49d5-8b6c-c629a48bb61c.jpg?1789556729","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const acolyte = (): CardDef => ({"oracleId":"628f2deb-519e-4810-a7e5-e31316e9a4e0","name":"Arcus Acolyte","manaCost":"{G}{W}","cmc":2,"typeLine":"Creature — Human Cleric Archer","supertypes":[],"types":["Creature"],"subtypes":["Human","Cleric","Archer"],"oracleText":"Reach, lifelink\nOutlast {G/W} ({G/W}, {T}: Put a +1/+1 counter on this creature. Outlast only as a sorcery.)\nEach other creature you control without a +1/+1 counter on it has outlast {G/W}.","power":"2","toughness":"2","colors":["G","W"],"colorIdentity":["G","W"],"keywords":["Lifelink","Reach","Outlast"],"imageUrl":"https://cards.scryfall.io/normal/front/b/3/b33ee002-fbd4-4bbe-a17c-876972750646.jpg?1783926749","artUrl":"https://cards.scryfall.io/art_crop/front/b/3/b33ee002-fbd4-4bbe-a17c-876972750646.jpg?1783926749","commanderLegal":"legal","set":"mh2","releasedAt":"2021-06-18","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const strand = (): CardDef => ({"oracleId":"4689206f-7907-46fb-82a7-2716687a58fc","name":"Dimir Strandcatcher","manaCost":"{2}{U/B}{U/B}","cmc":4,"typeLine":"Creature — Faerie Rogue","supertypes":[],"types":["Creature"],"subtypes":["Faerie","Rogue"],"oracleText":"Flying\nWhenever you attack, surveil X, where X is the number of opponents being attacked.\nAt the beginning of each end step, if three or more cards were put into your graveyard from anywhere other than the battlefield this turn, draw a card.","power":"3","toughness":"3","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Flying","Surveil"],"imageUrl":"https://cards.scryfall.io/normal/front/e/9/e911913a-c4a8-4051-9a43-90cf7ad03b91.jpg?1783912575","artUrl":"https://cards.scryfall.io/art_crop/front/e/9/e911913a-c4a8-4051-9a43-90cf7ad03b91.jpg?1783912575","commanderLegal":"legal","set":"clu","releasedAt":"2024-02-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const drudge = (): CardDef => ({"oracleId":"1c6a0d19-c7dd-4353-95ad-dfdef2d5d2d9","name":"Laboratory Drudge","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Zombie Horror","supertypes":[],"types":["Creature"],"subtypes":["Zombie","Horror"],"oracleText":"At the beginning of each end step, draw a card if you've cast a spell from a graveyard or activated an ability of a card in a graveyard this turn.","power":"3","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/6/b6a1d1e2-caea-4e64-8a3a-740f62b36853.jpg?1783928859","artUrl":"https://cards.scryfall.io/art_crop/front/b/6/b6a1d1e2-caea-4e64-8a3a-740f62b36853.jpg?1783928859","commanderLegal":"legal","set":"cmr","releasedAt":"2020-11-20","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const thelon = (): CardDef => ({"oracleId":"c673b7b0-c1e7-4bcd-8fe0-66d83f22ecb9","name":"Thelon of Havenwood","manaCost":"{G}{G}","cmc":2,"typeLine":"Legendary Creature — Elf Druid","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"Each Fungus creature gets +1/+1 for each spore counter on it.\n{B}{G}, Exile a Fungus card from a graveyard: Put a spore counter on each Fungus on the battlefield.","power":"2","toughness":"2","colors":["G"],"colorIdentity":["B","G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/2/92b0be6d-9183-4938-b7a1-ae7f04ba78a0.jpg?1783943205","artUrl":"https://cards.scryfall.io/art_crop/front/9/2/92b0be6d-9183-4938-b7a1-ae7f04ba78a0.jpg?1783943205","commanderLegal":"legal","set":"tsp","releasedAt":"2006-10-06","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const evangel = (): CardDef => ({"oracleId":"99eb572b-85b1-4d78-aea8-4400a5b7e508","name":"Emrakul's Evangel","manaCost":"{2}{G}","cmc":3,"typeLine":"Creature — Human Horror","supertypes":[],"types":["Creature"],"subtypes":["Human","Horror"],"oracleText":"{T}, Sacrifice this creature and any number of other non-Eldrazi creatures: Create a 3/2 colorless Eldrazi Horror creature token for each creature sacrificed this way.","power":"3","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/1/51c21822-972f-4c20-ac3b-80ba9af101c5.jpg?1783937449","artUrl":"https://cards.scryfall.io/art_crop/front/5/1/51c21822-972f-4c20-ac3b-80ba9af101c5.jpg?1783937449","commanderLegal":"legal","set":"emn","releasedAt":"2016-07-22","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const think = (): CardDef => ({"oracleId":"fa85c5a2-8e83-4624-a35a-a0bbf17ecbb4","name":"Think Twice","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Draw a card.\nFlashback {2}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["U"],"colorIdentity":["U"],"keywords":["Flashback"],"imageUrl":"https://cards.scryfall.io/normal/front/8/5/85835de4-66ea-4ba1-87ca-6bcec2a8660a.jpg?1783903015","artUrl":"https://cards.scryfall.io/art_crop/front/8/5/85835de4-66ea-4ba1-87ca-6bcec2a8660a.jpg?1783903015","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const thallid = (): CardDef => ({"oracleId":"46abaabe-7015-4d82-a5aa-2706b1f51bed","name":"Thallid","manaCost":"{G}","cmc":1,"typeLine":"Creature — Fungus","supertypes":[],"types":["Creature"],"subtypes":["Fungus"],"oracleText":"At the beginning of your upkeep, put a spore counter on this creature.\nRemove three spore counters from this creature: Create a 1/1 green Saproling creature token.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/9/69d20d28-76e9-4e6e-95c3-f88c51dfabfd.jpg?1783939970","artUrl":"https://cards.scryfall.io/art_crop/front/6/9/69d20d28-76e9-4e6e-95c3-f88c51dfabfd.jpg?1783939970","commanderLegal":"legal","set":"mma","releasedAt":"2013-06-07","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const jace = (): CardDef => ({"oracleId":"cc2b6e58-2d6f-495e-95f3-9496105c4cba","name":"Jace Beleren","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Legendary Planeswalker — Jace","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Jace"],"oracleText":"+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards.","loyalty":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/b/c/bc836203-4bb9-4bfa-89ab-0ad49f916c92.jpg?1783942523","artUrl":"https://cards.scryfall.io/art_crop/front/b/c/bc836203-4bb9-4bfa-89ab-0ad49f916c92.jpg?1783942523","commanderLegal":"legal","set":"dd2","releasedAt":"2008-11-07","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const gravedigger = (): CardDef => ({"oracleId":"1a2030cc-d7ee-4059-b2d7-fb95ea8e267b","name":"Gravedigger","manaCost":"{3}{B}","cmc":4,"typeLine":"Creature — Zombie","supertypes":[],"types":["Creature"],"subtypes":["Zombie"],"oracleText":"When this creature enters, you may return target creature card from your graveyard to your hand.","power":"2","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/6/9606f1ce-afeb-4fc5-bd4c-2484cd232924.jpg?1783936505","artUrl":"https://cards.scryfall.io/art_crop/front/9/6/9606f1ce-afeb-4fc5-bd4c-2484cd232924.jpg?1783936505","commanderLegal":"legal","set":"akh","releasedAt":"2017-04-28","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const unearthc = (): CardDef => ({"oracleId":"be9d1346-4416-4ade-ae84-7a4121e0bd12","name":"Dregscape Zombie","manaCost":"{1}{B}","cmc":2,"typeLine":"Creature — Zombie","supertypes":[],"types":["Creature"],"subtypes":["Zombie"],"oracleText":"Unearth {B} ({B}: Return this card from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step or if it would leave the battlefield. Unearth only as a sorcery.)","power":"2","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Unearth"],"imageUrl":"https://cards.scryfall.io/normal/front/4/b/4b65b7ad-4ab0-4622-81f4-434254625a1e.jpg?1783942567","artUrl":"https://cards.scryfall.io/art_crop/front/4/b/4b65b7ad-4ab0-4622-81f4-434254625a1e.jpg?1783942567","commanderLegal":"legal","set":"ala","releasedAt":"2008-10-03","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const opt = (): CardDef => ({"oracleId":"713332c1-5bd8-400f-bfff-c1ca0697a043","name":"Opt","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","commanderLegal":"legal","set":"sld","releasedAt":"2025-07-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const darkRitual = (): CardDef => ({"oracleId":"53f7c868-b03e-4fc2-8dcf-a75bbfa3272b","name":"Dark Ritual","manaCost":"{B}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Add {B}{B}{B}.","colors":["B"],"colorIdentity":["B"],"keywords":[],"producedMana":["B"],"imageUrl":"https://cards.scryfall.io/normal/front/1/1/11e12a84-e7be-4afc-a230-c2e644743fa8.jpg?1783903013","artUrl":"https://cards.scryfall.io/art_crop/front/1/1/11e12a84-e7be-4afc-a230-c2e644743fa8.jpg?1783903013","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const disenchant = (): CardDef => ({"oracleId":"a7e97fa9-4b72-4548-b854-5be5f18a6f1a","name":"Disenchant","manaCost":"{1}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target artifact or enchantment.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/5/658c5caa-d739-4d30-a512-43ac4de900cb.jpg?1783920133","artUrl":"https://cards.scryfall.io/art_crop/front/6/5/658c5caa-d739-4d30-a512-43ac4de900cb.jpg?1783920133","commanderLegal":"legal","set":"bro","releasedAt":"2022-11-18","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string): TargetChoice => ({ kind: "object", id }) as TargetChoice;
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; the bots answer any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const pt = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
/** A fresh copy of `def` in `zone` of `pid`. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** To `ap`'s end step, its triggers resolved. */
const toEnd = (s: GameState, ap: PlayerId) => settle(passUntil(s, "end", ap));

describe("Lane B round B176: cards", () => {
  it("compile", () => supported(aurif(), lurker(), acolyte(), strand(), drudge(), thelon(), evangel()));
});

describe("Aurification", () => {
  it("each creature with a gold counter on it is a Wall and has defender, whoever controls it; others aren't", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, aurif());
    const mine = putOnBattlefield(s0, ap, bears());
    const theirs = putOnBattlefield(s0, opp, giant());
    const plain = putOnBattlefield(s0, opp, bears());
    s0.objects[mine]!.counters.gold = 1;
    s0.objects[theirs]!.counters.gold = 1;
    invalidateCharacteristics(s0);
    for (const id of [mine, theirs]) {
      expect(characteristics(s0, s0.objects[id]!).subtypes).toContain("Wall");
      expect(objHasKeyword(s0, s0.objects[id]!, "Defender")).toBe(true);
    }
    expect(characteristics(s0, s0.objects[theirs]!).subtypes).toContain("Giant");
    expect(characteristics(s0, s0.objects[plain]!).subtypes).toEqual(["Bear"]);
    expect(objHasKeyword(s0, s0.objects[plain]!, "Defender")).toBe(false);
    // Defender (CR 702.3b): with only that creature, ap's turn has no attack to declare. 60 passes cover the rest of this
    // turn (passing 2000 went round the table for seconds and timed out under load, review follow-up 14); the same Bears
    // without the counter does reach the declare attackers step within them.
    expect(() => passUntil(s0, "declareAttackers", ap, 60)).toThrow(/never reached/);
    s0.objects[mine]!.counters.gold = 0;
    invalidateCharacteristics(s0);
    expect(passUntil(s0, "declareAttackers", ap, 60).step).toBe("declareAttackers");
  });
  it("a creature that deals damage to you gets a gold counter and becomes a Wall", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, aurif());
    const bear = putOnBattlefield(s0, opp, bears());
    let s = passUntil(s0, "declareAttackers", opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: bear, defender: ap }] });
    for (let i = 0; i < 300 && s.step !== "main2"; i++) {
      const p = s.pending;
      if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else if (p) for (const x of botActions(s, p.player)) s = act(s, x);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.objects[bear]!.counters.gold).toBe(1);
    expect(characteristics(s, s.objects[bear]!).subtypes).toContain("Wall");
  });
  it("when Aurification leaves the battlefield, all gold counters are removed from all creatures", () => {
    const { s: s0, ap, opp, ids } = setup([disenchant()]);
    const a = putOnBattlefield(s0, ap, aurif());
    const bear = putOnBattlefield(s0, opp, bears());
    s0.objects[bear]!.counters.gold = 2;
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(a)])));
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(s.objects[bear]!.counters.gold ?? 0).toBe(0);
    expect(characteristics(s, s.objects[bear]!).subtypes).toEqual(["Bear"]);
  });
});

describe("Sanctum Lurker", () => {
  it("your planeswalker at 0 loyalty stays, and can use the granted [+2]; an opponent's doesn't; without Lurker yours goes", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, lurker());
    const j = putOnBattlefield(s0, ap, jace());
    const theirs = putOnBattlefield(s0, opp, jace());
    s0.objects[j]!.counters.loyalty = 1;
    s0.objects[theirs]!.counters.loyalty = 1;
    invalidateCharacteristics(s0);
    // Jace's −1 (index 1): to 0 loyalty.
    let s = settle(run(s0, planActivate(s0, ap, j, 1, [{ kind: "player", id: ap }])));
    expect(s.objects[j]!.zone).toBe("battlefield");
    expect(s.objects[j]!.counters.loyalty ?? 0).toBe(0);
    // A minus ability can't be activated with no loyalty (CR 606.6); the granted [+2] could, but only one a turn (CR 606.3).
    const granted = abilitiesOf(s, s.objects[j]!).activated.findIndex((a) => a.loyalty === 2 && /deals 1 damage to each opponent/.test(a.body.text));
    expect(granted).toBeGreaterThanOrEqual(0);
    expect(planActivate(s, ap, j, granted)).toBeNull();
    // Damage to the opponent's: it has no Lurker of its own, so at 0 it goes (CR 704.5i).
    s.objects[theirs]!.counters.loyalty = 0;
    invalidateCharacteristics(s);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    // Next turn of ap: the [+2] at 0 loyalty works (rulings).
    s = passUntil(passUntil(s, "upkeep", opp), "main1", ap);
    expect(s.turn).toBeGreaterThan(1);
    expect(s.objects[j]!.zone).toBe("battlefield");
    const life = s.players[opp]!.life;
    s = settle(run(s, planActivate(s, ap, j, granted)));
    expect(s.objects[j]!.counters.loyalty).toBe(2);
    expect(s.players[opp]!.life).toBe(life - 1);
  });
  it("without Sanctum Lurker a planeswalker at 0 loyalty is put into its owner's graveyard", () => {
    const { s: s0, ap } = setup([]);
    const j = putOnBattlefield(s0, ap, jace());
    s0.objects[j]!.counters.loyalty = 1;
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planActivate(s0, ap, j, 1, [{ kind: "player", id: ap }])));
    expect(s.objects[j]!.zone).toBe("graveyard");
  });
  it("when the Lurker leaves, a planeswalker with 0 loyalty is put into the graveyard", () => {
    const { s: s0, ap, ids } = setup([bolt()]);
    const l = putOnBattlefield(s0, ap, lurker());
    const j = putOnBattlefield(s0, ap, jace());
    s0.objects[j]!.counters.loyalty = 0;
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(l)])));
    expect(s.objects[l]!.zone).toBe("graveyard");
    expect(s.objects[j]!.zone).toBe("graveyard");
  });
});

describe("Arcus Acolyte", () => {
  it("each other creature you control without a +1/+1 counter has outlast {G/W}; with a counter it doesn't", () => {
    const { s: s0, ap, opp } = setup([]);
    const ac = putOnBattlefield(s0, ap, acolyte());
    const b = putOnBattlefield(s0, ap, bears());
    const theirs = putOnBattlefield(s0, opp, bears());
    const outlasts = (s: GameState, id: string) => abilitiesOf(s, s.objects[id]!).activated.filter((a) => a.outlast).length;
    expect(outlasts(s0, ac)).toBe(1);
    expect(outlasts(s0, b)).toBe(1);
    expect(outlasts(s0, theirs)).toBe(0);
    const i = abilitiesOf(s0, s0.objects[b]!).activated.findIndex((a) => a.outlast);
    expect(abilitiesOf(s0, s0.objects[b]!).activated[i]!.manaCost).toBe("{G/W}");
    const s = settle(run(s0, planActivate(s0, ap, b, i)));
    expect(s.objects[b]!.tapped).toBe(true);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    expect(pt(s, b)).toBe("3/3");
    expect(outlasts(s, b)).toBe(0);
  });
  it("outlast only as a sorcery", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, acolyte());
    const b = putOnBattlefield(s0, ap, bears());
    const s = passUntil(s0, "upkeep", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!);
    const i = abilitiesOf(s, s.objects[b]!).activated.findIndex((a) => a.outlast);
    expect(planActivate(s, ap, b, i)).toBeNull();
  });
});

describe("Dimir Strandcatcher", () => {
  it("draws at the end step after three cards went to your graveyard from anywhere but the battlefield this turn, not after two", () => {
    for (const n of [2, 3]) {
      const { s: s0, ap, opp, ids } = setup([bolt(), bolt(), bolt()]);
      putOnBattlefield(s0, ap, strand());
      let s = s0;
      for (let i = 0; i < n; i++) s = settle(run(s, planCast(s, ap, ids[i]!, [{ kind: "player", id: opp }])));
      expect(s.players[ap]!.graveyard.length).toBe(n);
      const hand = s.players[ap]!.hand.length;
      s = toEnd(s, ap);
      expect(s.players[ap]!.hand.length).toBe(hand + (n === 3 ? 1 : 0));
    }
  });
  it("creatures dying don't count, and neither do cards put into another player's graveyard", () => {
    const { s: s0, ap, opp, ids } = setup([bolt(), bolt(), bolt()]);
    putOnBattlefield(s0, ap, strand());
    const b = putOnBattlefield(s0, ap, bears());
    const theirs = putOnBattlefield(s0, opp, bears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(theirs)])));
    expect(s.objects[b]!.zone).toBe("graveyard");
    // Two bolts from the stack and the Bears from the battlefield: two that count.
    const hand = s.players[ap]!.hand.length;
    s = toEnd(s, ap);
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.turnLog?.toGraveyardNotBattlefield?.[ap]).toBe(2);
  });
  it("counts on each player's end step, for the controller's own graveyard", () => {
    const { s: s0, ap, opp, ids } = setup([bolt(), bolt(), bolt()]);
    putOnBattlefield(s0, opp, strand());
    let s = s0;
    for (let i = 0; i < 3; i++) s = settle(run(s, planCast(s, ap, ids[i]!, [{ kind: "player", id: opp }])));
    const hand = s.players[opp]!.hand.length;
    s = toEnd(s, ap);
    expect(s.players[opp]!.hand.length).toBe(hand);
  });
});

describe("Laboratory Drudge", () => {
  it("draws at each end step only if you cast a spell from a graveyard or activated an ability of a card in a graveyard this turn", () => {
    // Nothing from a graveyard: no card.
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, drudge());
    let hand = s0.players[ap]!.hand.length;
    let s = toEnd(s0, ap);
    expect(s.players[ap]!.hand.length).toBe(hand);
    // Flashback from the graveyard (Think Twice draws one, the Drudge one more).
    const { s: s1, ap: ap1 } = setup([]);
    putOnBattlefield(s1, ap1, drudge());
    const t = into(s1, ap1, think(), "graveyard");
    hand = s1.players[ap1]!.hand.length;
    s = settle(run(s1, planCast(s1, ap1, t, undefined, undefined, undefined, undefined, { via: "flashback" })));
    expect(s.players[ap1]!.hand.length).toBe(hand + 1);
    s = toEnd(s, ap1);
    expect(s.players[ap1]!.hand.length).toBe(hand + 2);
  });
  it("unearth (an ability of a card in a graveyard) counts; a creature card cast from the hand doesn't", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, drudge());
    const z = into(s0, ap, unearthc(), "graveyard");
    let s = settle(run(s0, planActivate(s0, ap, z, 0)));
    expect(s.objects[z]!.zone).toBe("battlefield");
    const hand = s.players[ap]!.hand.length;
    s = toEnd(s, ap);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.turnLog?.activatedInGraveyard).toContain(ap);
  });
  it("an opponent's graveyard use doesn't count for you", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, drudge());
    const z = into(s0, ap, unearthc(), "graveyard");
    let s = settle(run(s0, planActivate(s0, ap, z, 0)));
    const hand = s.players[opp]!.hand.length;
    s = toEnd(s, ap);
    expect(s.players[opp]!.hand.length).toBe(hand);
  });
});

describe("Thelon of Havenwood", () => {
  it("exile a Fungus card from any graveyard: a spore counter on each Fungus, whoever controls it; each Fungus creature gets +1/+1 per spore counter", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, thelon());
    const mine = putOnBattlefield(s0, ap, thallid());
    const theirs = putOnBattlefield(s0, opp, thallid());
    const b = putOnBattlefield(s0, ap, bears());
    const card = into(s0, opp, thallid(), "graveyard");
    const notFungus = into(s0, ap, bears(), "graveyard");
    expect(planActivate(s0, ap, s0.battlefield.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Thelon of Havenwood")!, 0, [], undefined, undefined, undefined, { exileCards: [notFungus] })).toBeNull();
    const th = s0.battlefield.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Thelon of Havenwood")!;
    const s = settle(run(s0, planActivate(s0, ap, th, 0, [], undefined, undefined, undefined, { exileCards: [card] })));
    expect(s.objects[card]!.zone).toBe("exile");
    expect(s.objects[mine]!.counters.spore).toBe(1);
    expect(s.objects[theirs]!.counters.spore).toBe(1);
    expect(s.objects[b]!.counters.spore ?? 0).toBe(0);
    expect(pt(s, mine)).toBe("2/2");
    expect(pt(s, theirs)).toBe("2/2");
  });
  it("can't be activated without a Fungus card in a graveyard", () => {
    const { s: s0, ap } = setup([]);
    const th = putOnBattlefield(s0, ap, thelon());
    putOnBattlefield(s0, ap, thallid());
    expect(planActivate(s0, ap, th, 0)).toBeNull();
  });
});

describe("Emrakul's Evangel", () => {
  it("sacrifice it and two other non-Eldrazi creatures: three 3/2 Eldrazi Horrors", () => {
    const { s: s0, ap } = setup([]);
    const e = putOnBattlefield(s0, ap, evangel());
    const a = putOnBattlefield(s0, ap, bears());
    const b = putOnBattlefield(s0, ap, giant());
    const before = s0.battlefield.length;
    let s = run(s0, planActivate(s0, ap, e, 0, [], undefined, undefined, 2, { sacrifice: [a, b] }));
    expect([e, a, b].map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "graveyard"]);
    s = settle(s);
    const horrors = s.battlefield.filter((id) => characteristics(s, s.objects[id]!).name === "Eldrazi Horror Token");
    expect(horrors.length).toBe(3);
    expect(pt(s, horrors[0]!)).toBe("3/2");
    expect(characteristics(s, s.objects[horrors[0]!]!).colors).toEqual([]);
    expect(s.battlefield.length).toBe(before - 3 + 3);
  });
  it("none other sacrificed: it counts itself, one token (rulings); an Eldrazi can't be sacrificed for it", () => {
    const { s: s0, ap } = setup([]);
    const e = putOnBattlefield(s0, ap, evangel());
    const s = settle(run(s0, planActivate(s0, ap, e, 0, [], undefined, undefined, 0, { sacrifice: [] })));
    expect(s.battlefield.filter((id) => characteristics(s, s.objects[id]!).name === "Eldrazi Horror Token").length).toBe(1);
    const { s: s1, ap: ap1 } = setup([]);
    const e1 = putOnBattlefield(s1, ap1, evangel());
    const horror = putOnBattlefield(s1, ap1, { ...bears(), name: "Test Horror", subtypes: ["Eldrazi", "Horror"], typeLine: "Creature — Eldrazi Horror", oracleId: "t-eldrazi" } as CardDef);
    expect(planActivate(s1, ap1, e1, 0, [], undefined, undefined, 1, { sacrifice: [horror] })).toBeNull();
  });
});
