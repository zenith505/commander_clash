// Lane B round B183: graveyard abilities given to cards: "Each creature card in your graveyard has scavenge. The scavenge
// cost is equal to its mana cost." (Varolz, the Scar-Striped; Young Deathclaws), "Each nonland card in your graveyard has
// mayhem" (Green Goblin), "target instant or sorcery card in your graveyard gains jump-start / harmonize until end of
// turn" (Filigree Racer, Songcrafter Mage), "each artifact creature card in your graveyard gains unearth {3} until end of
// turn" (Ghost Ark), and Dovin Baan's emblem ("Your opponents can't untap more than two permanents during their untap
// steps").

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, untapLimitsNow, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const varolz = (): CardDef => ({"oracleId":"b6b83b88-0660-4227-895e-78ac43d01b66","name":"Varolz, the Scar-Striped","manaCost":"{1}{B}{G}","cmc":3,"typeLine":"Legendary Creature — Troll Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Troll","Warrior"],"oracleText":"Each creature card in your graveyard has scavenge. The scavenge cost is equal to its mana cost. (Exile a creature card from your graveyard and pay its mana cost: Put a number of +1/+1 counters equal to that card's power on target creature. Scavenge only as a sorcery.)\nSacrifice another creature: Regenerate Varolz.","power":"2","toughness":"2","colors":["B","G"],"colorIdentity":["B","G"],"keywords":["Regenerate"],"imageUrl":"https://cards.scryfall.io/normal/front/4/c/4c3ae3db-c14a-4ffc-805c-a3a51da9370d.jpg?1783940019","artUrl":"https://cards.scryfall.io/art_crop/front/4/c/4c3ae3db-c14a-4ffc-805c-a3a51da9370d.jpg?1783940019","commanderLegal":"legal","set":"dgm","releasedAt":"2013-05-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const deathclaws = (): CardDef => ({"oracleId":"f24fc213-6341-482c-a056-946d0f1dd76b","name":"Young Deathclaws","manaCost":"{2}{B}{G}","cmc":4,"typeLine":"Creature — Lizard Mutant","supertypes":[],"types":["Creature"],"subtypes":["Lizard","Mutant"],"oracleText":"Menace (This creature can't be blocked except by two or more creatures.)\nEach creature card in your graveyard has scavenge. The scavenge cost is equal to its mana cost. (Exile a creature card from your graveyard and pay its mana cost: Put a number of +1/+1 counters equal to that card's power on target creature. Scavenge only as a sorcery.)","power":"4","toughness":"2","colors":["B","G"],"colorIdentity":["B","G"],"keywords":["Menace"],"imageUrl":"https://cards.scryfall.io/normal/front/6/4/64d5e6bd-de46-4bc2-854b-cc6cae713f98.jpg?1783912381","artUrl":"https://cards.scryfall.io/art_crop/front/6/4/64d5e6bd-de46-4bc2-854b-cc6cae713f98.jpg?1783912381","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const norman = (): CardDef => ({"oracleId":"aa5b06a4-90c3-45e7-ab83-cb5c96ded21d","name":"Norman Osborn // Green Goblin","manaCost":"{1}{U}","cmc":2,"typeLine":"Legendary Creature — Human Scientist Villain // Legendary Creature — Goblin Human Villain","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Scientist","Villain"],"oracleText":"Norman Osborn can't be blocked.\nWhenever Norman Osborn deals combat damage to a player, he connives. (Draw a card, then discard a card. If you discarded a nonland card, put a +1/+1 counter on this creature.)\n{1}{U}{B}{R}: Transform Norman Osborn. Activate only as a sorcery.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["B","R","U"],"keywords":["Flying","Goblin Formula","Transform","Menace","Connive"],"imageUrl":"https://cards.scryfall.io/normal/front/d/5/d5c53af9-7150-4e78-8771-2de7980aa307.jpg?1783905356","artUrl":"https://cards.scryfall.io/art_crop/front/d/5/d5c53af9-7150-4e78-8771-2de7980aa307.jpg?1783905356","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"mythic","layout":"modal_dfc","gameChanger":false,"faces":[{"name":"Norman Osborn","manaCost":"{1}{U}","typeLine":"Legendary Creature — Human Scientist Villain","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Scientist","Villain"],"oracleText":"Norman Osborn can't be blocked.\nWhenever Norman Osborn deals combat damage to a player, he connives. (Draw a card, then discard a card. If you discarded a nonland card, put a +1/+1 counter on this creature.)\n{1}{U}{B}{R}: Transform Norman Osborn. Activate only as a sorcery.","power":"1","toughness":"1","colors":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/d/5/d5c53af9-7150-4e78-8771-2de7980aa307.jpg?1783905356","artUrl":"https://cards.scryfall.io/art_crop/front/d/5/d5c53af9-7150-4e78-8771-2de7980aa307.jpg?1783905356"},{"name":"Green Goblin","manaCost":"{1}{U}{B}{R}","typeLine":"Legendary Creature — Goblin Human Villain","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Goblin","Human","Villain"],"oracleText":"Flying, menace\nSpells you cast from your graveyard cost {2} less to cast.\nGoblin Formula — Each nonland card in your graveyard has mayhem. The mayhem cost is equal to its mana cost. (You may cast a card from your graveyard for its mayhem cost if you discarded it this turn. Timing rules still apply.)","power":"3","toughness":"3","colors":["B","R","U"],"imageUrl":"https://cards.scryfall.io/normal/back/d/5/d5c53af9-7150-4e78-8771-2de7980aa307.jpg?1783905356","artUrl":"https://cards.scryfall.io/art_crop/back/d/5/d5c53af9-7150-4e78-8771-2de7980aa307.jpg?1783905356"}]}) as CardDef;
const racer = (): CardDef => ({"oracleId":"5d93b4a9-0d51-45bd-a0e7-90737d019822","name":"Filigree Racer","manaCost":"{3}{R}","cmc":4,"typeLine":"Artifact — Vehicle","supertypes":[],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"When this Vehicle enters, you get {E}{E}{E}{E} (four energy counters).\nWhenever this Vehicle attacks, you may pay {E}{E}. When you do, target instant or sorcery card in your graveyard gains jump-start until end of turn. (You may cast that card from your graveyard by discarding a card in addition to paying its other costs. Then exile it.)\nCrew 1","power":"5","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Crew"],"imageUrl":"https://cards.scryfall.io/normal/front/1/e/1ea6bb35-be74-4d42-96d3-bb7070054140.jpg?1783911409","artUrl":"https://cards.scryfall.io/art_crop/front/1/e/1ea6bb35-be74-4d42-96d3-bb7070054140.jpg?1783911409","commanderLegal":"legal","set":"m3c","releasedAt":"2024-06-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const songcrafter = (): CardDef => ({"oracleId":"13f0863f-ae54-4bea-8f01-7f3891797577","name":"Songcrafter Mage","manaCost":"{G}{U}{R}","cmc":3,"typeLine":"Creature — Human Bard","supertypes":[],"types":["Creature"],"subtypes":["Human","Bard"],"oracleText":"Flash\nWhen this creature enters, target instant or sorcery card in your graveyard gains harmonize until end of turn. Its harmonize cost is equal to its mana cost. (You may cast that card from your graveyard for its harmonize cost. You may tap a creature you control to reduce that cost by {X}, where X is its power. Then exile the spell.)","power":"3","toughness":"2","colors":["G","R","U"],"colorIdentity":["G","R","U"],"keywords":["Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/9/5/9523bc07-49e5-409c-ae6b-b28e305eef36.jpg?1783907298","artUrl":"https://cards.scryfall.io/art_crop/front/9/5/9523bc07-49e5-409c-ae6b-b28e305eef36.jpg?1783907298","commanderLegal":"legal","set":"tdm","releasedAt":"2025-04-11","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ark = (): CardDef => ({"oracleId":"bb1b4786-3804-486b-9fd9-85848d24d362","name":"Ghost Ark","manaCost":"{4}","cmc":4,"typeLine":"Artifact — Vehicle","supertypes":[],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"Flying\nRepair Barge — Whenever this Vehicle becomes crewed, each artifact creature card in your graveyard gains unearth {3} until end of turn.\nCrew 2 (Tap any number of creatures you control with total power 2 or more: This Vehicle becomes an artifact creature until end of turn.)","power":"3","toughness":"3","colors":[],"colorIdentity":[],"keywords":["Flying","Repair Barge","Crew"],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c6865c1-8144-4b06-a599-a62382fe1124.jpg?1783920822","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c6865c1-8144-4b06-a599-a62382fe1124.jpg?1783920822","commanderLegal":"legal","set":"40k","releasedAt":"2022-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const dovin = (): CardDef => ({"oracleId":"5b33bfbf-e4e1-43de-9c96-ccdc2916510a","name":"Dovin Baan","manaCost":"{2}{W}{U}","cmc":4,"typeLine":"Legendary Planeswalker — Dovin","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Dovin"],"oracleText":"+1: Until your next turn, up to one target creature gets -3/-0 and its activated abilities can't be activated.\n−1: You gain 2 life and draw a card.\n−7: You get an emblem with \"Your opponents can't untap more than two permanents during their untap steps.\"","loyalty":"3","colors":["U","W"],"colorIdentity":["U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/3/2344e710-4570-41b6-af84-a3e7d784003a.jpg?1783937169","artUrl":"https://cards.scryfall.io/art_crop/front/2/3/2344e710-4570-41b6-af84-a3e7d784003a.jpg?1783937169","commanderLegal":"legal","set":"kld","releasedAt":"2016-09-30","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const serpent = (): CardDef => ({"oracleId":"e469bb22-57f1-4555-b3c0-9ea108e6cc12","name":"Bladecoil Serpent","manaCost":"{X}{6}","cmc":6,"typeLine":"Artifact Creature — Serpent","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Serpent"],"oracleText":"When this creature enters, for each {U}{U} spent to cast it, draw a card.\nWhen this creature enters, for each {B}{B} spent to cast it, each opponent discards a card.\nWhen this creature enters, for each {R}{R} spent to cast it, it gets +1/+0 and gains trample and haste until end of turn.","power":"5","toughness":"4","colors":[],"colorIdentity":["B","R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/8/08c5a528-d16d-4cb9-b532-b85648c8395a.jpg?1783920022","artUrl":"https://cards.scryfall.io/art_crop/front/0/8/08c5a528-d16d-4cb9-b532-b85648c8395a.jpg?1783920022","commanderLegal":"legal","set":"bro","releasedAt":"2022-11-18","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const opt = (): CardDef => ({"oracleId":"713332c1-5bd8-400f-bfff-c1ca0697a043","name":"Opt","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","commanderLegal":"legal","set":"sld","releasedAt":"2025-07-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ornithopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const fireIce = (): CardDef => ({"oracleId":"ae92942b-919c-4ea9-b693-85fcef765d5a","name":"Fire // Ice","manaCost":"{1}{R} // {1}{U}","cmc":4,"typeLine":"Instant // Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Fire deals 2 damage divided as you choose among one or two targets.","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/b/ab8292ae-9a52-43e7-92f7-0f45f4bb71ec.jpg?1783940411","artUrl":"https://cards.scryfall.io/art_crop/front/a/b/ab8292ae-9a52-43e7-92f7-0f45f4bb71ec.jpg?1783940411","commanderLegal":"legal","set":"ddj","releasedAt":"2012-09-07","rarity":"uncommon","layout":"split","gameChanger":false,"faces":[{"name":"Fire","manaCost":"{1}{R}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Fire deals 2 damage divided as you choose among one or two targets.","colors":["R"]},{"name":"Ice","manaCost":"{1}{U}","typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Tap target permanent.\nDraw a card.","colors":["U"]}]}) as CardDef;
const faithless = (): CardDef => ({"oracleId":"3d6fa57a-aa53-4b5c-b8af-a7612c823117","name":"Faithless Looting","manaCost":"{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards, then discard two cards.\nFlashback {2}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["R"],"colorIdentity":["R"],"keywords":["Flashback"],"imageUrl":"https://cards.scryfall.io/normal/front/6/5/65879a80-b656-412f-8b90-aa6d4f36a43c.jpg?1783915510","artUrl":"https://cards.scryfall.io/art_crop/front/6/5/65879a80-b656-412f-8b90-aa6d4f36a43c.jpg?1783915510","commanderLegal":"legal","set":"cmm","releasedAt":"2023-08-04","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const cathartic = (): CardDef => ({"oracleId":"0f3c3e5f-6af3-4af2-8703-4ccc8ed8f675","name":"Cathartic Reunion","manaCost":"{1}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"As an additional cost to cast this spell, discard two cards.\nDraw three cards.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/5/a5e23253-873d-4c0b-b446-ea2c21af11dd.jpg?1783904805","artUrl":"https://cards.scryfall.io/art_crop/front/a/5/a5e23253-873d-4c0b-b446-ea2c21af11dd.jpg?1783904805","commanderLegal":"legal","set":"tle","releasedAt":"2025-11-21","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

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
const counters = (s: GameState, id: ObjectId) => s.objects[id]!.counters["+1/+1"] ?? 0;

describe("Round B183 cards are supported", () => {
  it("compiles all seven", () => supported(varolz(), deathclaws(), norman(), racer(), songcrafter(), ark(), dovin()));
});

describe("Varolz, the Scar-Striped and Young Deathclaws: scavenge for creature cards in your graveyard", () => {
  const scene = (lord: () => CardDef) => {
    const { s, ap, opp } = setup([]);
    const host = putOnBattlefield(s, ap, lord());
    const bear = place(s, ap, bears(), "graveyard");
    const theirs = place(s, opp, bears(), "graveyard");
    s.players[ap]!.hand = [];
    return { s, ap, opp, host, bear, theirs };
  };

  it("exiles the card and pays its mana cost: counters equal to its power on target creature, as a sorcery", () => {
    const { s: s0, ap, host, bear } = scene(varolz);
    poolOnly(s0, ap, { G: 1, C: 1 });
    const s = settle(run(s0, planActivate(s0, ap, bear, 0, [obj(host)])));
    expect(zone(s, bear)).toBe("exile");
    expect(counters(s, host)).toBe(2);
    expect(s.players[ap]!.manaPool.G ?? 0).toBe(0);
  });

  it("needs its colored mana; not an opponent's card, not while Varolz is gone", () => {
    const { s: s0, ap, opp, host, bear, theirs } = scene(varolz);
    poolOnly(s0, ap, { C: 2 });
    expect(planActivate(s0, ap, bear, 0, [obj(host)])).toBeNull();
    s0.players[ap]!.manaPool = { ...s0.players[ap]!.manaPool, G: 2, C: 0 };
    expect(planActivate(s0, ap, theirs, 0, [obj(host)])).toBeNull();
    expect(planActivate(s0, opp, theirs, 0, [obj(host)])).toBeNull();
    expect(planActivate(s0, ap, bear, 0, [obj(host)])).not.toBeNull();
    s0.battlefield.splice(s0.battlefield.indexOf(host), 1);
    s0.objects[host]!.zone = "graveyard";
    s0.players[ap]!.graveyard.push(host);
    invalidateCharacteristics(s0);
    const other = putOnBattlefield(s0, ap, bears());
    expect(planActivate(s0, ap, bear, 0, [obj(other)])).toBeNull();
  });

  it("an {X} in the card's mana cost is 0 (rulings): Bladecoil Serpent scavenges for {6}", () => {
    const { s: s0, ap, host } = scene(deathclaws);
    const big = place(s0, ap, serpent(), "graveyard");
    poolOnly(s0, ap, { C: 5 });
    expect(planActivate(s0, ap, big, 0, [obj(host)])).toBeNull();
    s0.players[ap]!.manaPool.C = 6;
    const s = settle(run(s0, planActivate(s0, ap, big, 0, [obj(host)])));
    expect(zone(s, big)).toBe("exile");
    expect(counters(s, host)).toBe(5);
  });

  it("a bot scavenges a creature card onto its creature", () => {
    const { s: s0, ap, host, bear } = scene(varolz);
    poolOnly(s0, ap, { G: 2 });
    s0.players[ap]!.command = [];
    s0.priority = ap;
    const acts = botActions(s0, ap);
    const a = acts.find((x) => x.type === "activateAbility");
    expect(a).toMatchObject({ objectId: bear });
    const s = settle(run(s0, acts));
    expect(zone(s, bear)).toBe("exile");
    expect(counters(s, host)).toBe(2);
  });

  it("only as a sorcery: not with something on the stack", () => {
    const { s: s0, ap, host, bear } = scene(deathclaws);
    poolOnly(s0, ap, { G: 2, U: 1 });
    const o = place(s0, ap, opt(), "hand");
    const s = run(s0, castPlan(s0, ap, o));
    expect(s.stack.length).toBe(1);
    expect(planActivate(s, ap, bear, 0, [obj(host)])).toBeNull();
  });
});

describe("Green Goblin: each nonland card in your graveyard has mayhem with its mana cost", () => {
  const scene = () => {
    const { s, ap, opp } = setup([]);
    const goblin = putOnBattlefield(s, ap, norman());
    s.objects[goblin]!.face = 1; // transformed
    invalidateCharacteristics(s);
    s.players[ap]!.hand = [];
    return { s, ap, opp, goblin };
  };

  it("a card discarded this turn is cast from the graveyard (and Green Goblin's {2} less applies); it isn't exiled", () => {
    const { s: s0, ap } = scene();
    const div = place(s0, ap, divination(), "graveyard");
    s0.objects[div]!.discardedTurn = s0.turn;
    poolOnly(s0, ap, { U: 1 });
    const hand = s0.players[ap]!.hand.length;
    const s = settle(run(s0, castPlan(s0, ap, div, [], { via: "mayhem" })));
    expect(zone(s, div)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("not a card put there another way or discarded an earlier turn, not while it's Norman Osborn, not an opponent's card", () => {
    const { s: s0, ap, opp, goblin } = scene();
    poolOnly(s0, ap, { U: 3 });
    const div = place(s0, ap, divination(), "graveyard");
    expect(castPlan(s0, ap, div, [], { via: "mayhem" })).toBeNull();
    s0.objects[div]!.discardedTurn = s0.turn - 1;
    expect(castPlan(s0, ap, div, [], { via: "mayhem" })).toBeNull();
    s0.objects[div]!.discardedTurn = s0.turn;
    expect(castPlan(s0, ap, div, [], { via: "mayhem" })).not.toBeNull();
    const theirs = place(s0, opp, divination(), "graveyard");
    s0.objects[theirs]!.discardedTurn = s0.turn;
    expect(castPlan(s0, ap, theirs, [], { via: "mayhem" })).toBeNull();
    s0.objects[goblin]!.face = undefined; // Norman Osborn
    invalidateCharacteristics(s0);
    expect(castPlan(s0, ap, div, [], { via: "mayhem" })).toBeNull();
  });
});

describe("Dovin Baan's emblem: your opponents can't untap more than two permanents during their untap steps", () => {
  it("an opponent untaps only two, of their choice; its owner untaps everything", () => {
    const { s: s0, ap, opp } = setup([]);
    const pw = putOnBattlefield(s0, ap, dovin());
    s0.objects[pw]!.counters.loyalty = 7;
    s0.players[ap]!.hand = [];
    let s = run(s0, planActivate(s0, ap, pw, 2));
    s = settle(s);
    expect(s.emblems?.length).toBe(1);
    // Its owner isn't limited; each opponent is.
    expect(untapLimitsNow(s, ap)).toEqual([]);
    expect(s.turnOrder.filter((p) => p !== ap).every((p) => untapLimitsNow(s, p).length === 1 && untapLimitsNow(s, p)[0]!.n === 2)).toBe(true);
    const next = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % s.turnOrder.length]!;
    for (let i = 0; i < 3; i++) putOnBattlefield(s, next, bears());
    const mine = s.battlefield.filter((id) => s.objects[id]!.controller === ap);
    const theirs = s.battlefield.filter((id) => s.objects[id]!.controller === next);
    expect(theirs.length).toBeGreaterThan(2);
    for (const id of [...mine, ...theirs]) s.objects[id]!.tapped = true;
    // To the next player's untap step.
    for (let i = 0; i < 400 && !(s.activePlayer === next && s.pending?.kind === "pickPermanents"); i++) {
      const pid = waitingOn(s)!;
      if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
      else if (s.pending?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, s.pending.count) });
      else if (s.pending) s = run(s, botActions(s, pid));
      else s = act(s, { type: "passPriority", player: pid });
    }
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: next, action: "untapLimited" });
    expect(mine.every((id) => !s.objects[id]!.tapped)).toBe(false); // mine untapped only in my own untap step
    s = act(s, { type: "pickPermanents", player: next, ids: theirs.slice(0, 2) });
    expect(theirs.filter((id) => !s.objects[id]!.tapped)).toEqual(theirs.slice(0, 2));
    void opp;
  });
});

describe("Songcrafter Mage: target instant or sorcery card in your graveyard gains harmonize with its mana cost", () => {
  it("cast from the graveyard tapping a creature to pay less, then exiled; not after the turn ends", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.hand = [];
    const bear = putOnBattlefield(s0, ap, bears());
    const div = place(s0, ap, divination(), "graveyard");
    const other = place(s0, ap, opt(), "graveyard");
    const mage = place(s0, ap, songcrafter(), "hand");
    poolOnly(s0, ap, { G: 1, U: 1, R: 1 });
    expect(castPlan(s0, ap, div, [], { via: "harmonize" })).toBeNull();
    let s = settle(run(s0, castPlan(s0, ap, mage)));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [obj(div)] }));
    expect(s.yardCastGrants).toEqual([{ id: div, zc: s.objects[div]!.zoneChanges ?? 0, kind: "harmonize" }]);
    // Only that card.
    expect(castPlan(s, ap, other, [], { via: "harmonize" })).toBeNull();
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, U: 1 };
    // {2}{U}, {2} less for the Bears' power.
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, castPlan(s, ap, div, [], { via: "harmonize", harmonize: bear })));
    expect(s.objects[bear]!.tapped).toBe(true);
    expect(zone(s, div)).toBe("exile");
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("not a creature card, and the grant ends at cleanup", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.hand = [];
    const div = place(s0, ap, divination(), "graveyard");
    const mage = place(s0, ap, songcrafter(), "hand");
    place(s0, ap, bears(), "graveyard");
    poolOnly(s0, ap, { G: 1, U: 1, R: 1 });
    let s = settle(run(s0, castPlan(s0, ap, mage)));
    expect((s.pending as { specs?: { types?: string[] }[] }).specs?.[0]?.types).toEqual(["Instant", "Sorcery"]);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [obj(div)] }));
    const turn = s.turn;
    for (let i = 0; i < 400 && s.turn === turn; i++) {
      const pid = waitingOn(s)!;
      if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
      else if (s.pending?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, s.pending.count) });
      else if (s.pending) s = run(s, botActions(s, pid));
      else s = act(s, { type: "passPriority", player: pid });
    }
    expect(s.turn).toBe(turn + 1);
    expect(s.yardCastGrants).toBeUndefined();
  });
});

describe("Filigree Racer: pay {E}{E}, and target instant or sorcery card in your graveyard gains jump-start", () => {
  /** Crews the Racer with the Bears and attacks with it; returns the state with its "you may pay {E}{E}" asked. */
  const attack = () => {
    const { s: s0, ap, opp } = setup([]);
    s0.players[ap]!.hand = [];
    const racerId = putOnBattlefield(s0, ap, racer());
    const bear = putOnBattlefield(s0, ap, bears());
    s0.players[ap]!.energy = 3;
    const div = place(s0, ap, divination(), "graveyard");
    const creature = place(s0, ap, bears(), "graveyard");
    let s = settle(run(s0, planActivate(s0, ap, racerId, 0, [], undefined, [bear])));
    for (let i = 0; i < 50 && s.pending?.kind !== "declareAttackers"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: racerId, defender: opp }] });
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, ap, opp, div, creature };
  };

  it("paid: the card may be cast from the graveyard by discarding a card, then it's exiled", () => {
    const { s: s0, ap, div } = attack();
    expect(s0.pending).toMatchObject({ kind: "chooseMay", player: ap, pay: { energy: 2 } });
    let s = act(s0, { type: "chooseMay", player: ap, yes: true });
    expect(s.players[ap]!.energy).toBe(1);
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect((s.pending as { specs?: { types?: string[] }[] }).specs?.[0]?.types).toEqual(["Instant", "Sorcery"]);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [obj(div)] }));
    expect(s.yardCastGrants).toEqual([{ id: div, zc: s.objects[div]!.zoneChanges ?? 0, kind: "jumpStart" }]);
    poolOnly(s, ap, { U: 3 });
    const fodder = place(s, ap, opt(), "hand");
    // Divination is a sorcery: not in combat.
    expect(castPlan(s, ap, div, [], { via: "jumpStart", discard: [fodder] })).toBeNull();
    for (let i = 0; i < 200 && s.step !== "main2"; i++) {
      const pid = waitingOn(s)!;
      if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
      else if (s.pending) s = run(s, botActions(s, pid));
      else s = act(s, { type: "passPriority", player: pid });
    }
    expect(s.step).toBe("main2");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, U: 3 };
    const plan = castPlan(s, ap, div, [], { via: "jumpStart", discard: [fodder] });
    s = settle(run(s, plan));
    expect(zone(s, fodder)).toBe("graveyard");
    expect(zone(s, div)).toBe("exile");
  });

  it("not paid: nothing gains jump-start", () => {
    const { s: s0, ap, div } = attack();
    const s = settle(act(s0, { type: "chooseMay", player: ap, yes: false }));
    expect(s.players[ap]!.energy).toBe(3);
    expect(s.yardCastGrants).toBeUndefined();
    void div;
  });
});

describe("Ghost Ark: whenever it becomes crewed, each artifact creature card in your graveyard gains unearth {3}", () => {
  it("the artifact creature cards there as it resolves unearth for {3}; not other cards, not one put there later", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.hand = [];
    const arkId = putOnBattlefield(s0, ap, ark());
    const crew = [putOnBattlefield(s0, ap, bears())];
    const thopter = place(s0, ap, ornithopter(), "graveyard");
    const bear = place(s0, ap, bears(), "graveyard");
    let s = settle(run(s0, planActivate(s0, ap, arkId, 0, [], undefined, crew)));
    expect(s.yardKeywordGrants).toEqual([{ id: thopter, zc: s.objects[thopter]!.zoneChanges ?? 0, keyword: "Unearth", cost: "{3}" }]);
    const later = place(s, ap, ornithopter(), "graveyard");
    poolOnly(s, ap, { C: 3 });
    expect(planActivate(s, ap, bear, 0)).toBeNull();
    expect(planActivate(s, ap, later, 0)).toBeNull();
    s = settle(run(s, planActivate(s, ap, thopter, 0)));
    expect(zone(s, thopter)).toBe("battlefield");
    expect(characteristics(s, s.objects[thopter]!).keywords).toContain("Haste");
  });
});
