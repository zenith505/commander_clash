// Lane B round B186: Temporal Aperture ("Shuffle your library, then reveal the top card. Until end of turn, for as long as
// that card remains on top of your library, ... you may play that card without paying its mana cost"), Lumbering Laundry
// ("Until end of turn, you may look at face-down creatures you don't control any time"), Revealing Wind ("You may look at
// each face-down creature that's attacking or blocking"), Spy Network ("Look at target player's hand, the top card of that
// player's library, and any face-down creatures they control"), Glowcap Lantern (a granted "You may look at the top card of
// your library any time"), Immovable Rod ("For as long as ~ remains tapped, another target permanent loses all abilities and
// can't attack or block") and Merieke Ri Berit ("When ~ leaves the battlefield or becomes untapped, destroy that creature").

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, botActions, castProblem, characteristics, controllerOf, faceDownVisible, invalidateCharacteristics, isFullySupported, moveObject, planActivate, planCast, runStateBasedActions, topRevealed, topVisible, untapPermanent, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const aperture = (): CardDef => ({"oracleId":"549fe3ff-70aa-4543-b427-40b814b29894","name":"Temporal Aperture","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{5}, {T}: Shuffle your library, then reveal the top card. Until end of turn, for as long as that card remains on top of your library, play with the top card of your library revealed and you may play that card without paying its mana cost. (If it has X in its mana cost, X is 0.)","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/b/5b5c2555-c707-4814-933a-c275b9ebc0a3.jpg?1783946302","artUrl":"https://cards.scryfall.io/art_crop/front/5/b/5b5c2555-c707-4814-933a-c275b9ebc0a3.jpg?1783946302","commanderLegal":"legal","set":"usg","releasedAt":"1998-10-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const laundry = (): CardDef => ({"oracleId":"6afe9cc7-80e4-4607-8633-6013d96bd19c","name":"Lumbering Laundry","manaCost":"{5}","cmc":5,"typeLine":"Artifact Creature — Golem","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Golem"],"oracleText":"{2}: Until end of turn, you may look at face-down creatures you don't control any time.\nDisguise {5} (You may cast this card face down for {3} as a 2/2 creature with ward {2}. Turn it face up any time for its disguise cost.)","power":"4","toughness":"5","colors":[],"colorIdentity":[],"keywords":["Disguise"],"imageUrl":"https://cards.scryfall.io/normal/front/0/8/080ad039-1669-4735-9864-76f4c61fc59e.jpg?1783912828","artUrl":"https://cards.scryfall.io/art_crop/front/0/8/080ad039-1669-4735-9864-76f4c61fc59e.jpg?1783912828","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const wind = (): CardDef => ({"oracleId":"905a6d6c-5ef8-4afa-89bb-9d85a854743f","name":"Revealing Wind","manaCost":"{2}{G}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Prevent all combat damage that would be dealt this turn. You may look at each face-down creature that's attacking or blocking.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/6/36bdd624-e412-4ec8-9929-e1f6b4720e82.jpg?1783938577","artUrl":"https://cards.scryfall.io/art_crop/front/3/6/36bdd624-e412-4ec8-9929-e1f6b4720e82.jpg?1783938577","commanderLegal":"legal","set":"dtk","releasedAt":"2015-03-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const spy = (): CardDef => ({"oracleId":"81a5893a-764c-41ea-ba81-346b3c7558a4","name":"Spy Network","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Look at target player's hand, the top card of that player's library, and any face-down creatures they control. Look at the top four cards of your library, then put them back in any order.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/a/8a4bed3f-845c-4822-b8af-8b511dce6fe2.jpg?1783945077","artUrl":"https://cards.scryfall.io/art_crop/front/8/a/8a4bed3f-845c-4822-b8af-8b511dce6fe2.jpg?1783945077","commanderLegal":"legal","set":"ons","releasedAt":"2002-10-07","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const lantern = (): CardDef => ({"oracleId":"2034d41b-5e77-49a6-884e-d3a6017f84d0","name":"Glowcap Lantern","manaCost":"{G}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature has \"You may look at the top card of your library any time\" and \"Whenever this creature attacks, it explores.\" (Reveal the top card of your library. Put that card into your hand if it's a land. Otherwise, put a +1/+1 counter on that creature, then put the card back or put it into your graveyard.)\nEquip {2}","colors":["G"],"colorIdentity":["G"],"keywords":["Explore","Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/b/a/bafde87c-743d-4307-93e0-fbd30f5d92f6.jpg?1783913746","artUrl":"https://cards.scryfall.io/art_crop/front/b/a/bafde87c-743d-4307-93e0-fbd30f5d92f6.jpg?1783913746","commanderLegal":"legal","set":"lci","releasedAt":"2023-11-17","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const rod = (): CardDef => ({"oracleId":"ec664e13-b7c4-4ca3-80d6-55a564d97937","name":"Immovable Rod","manaCost":"{W}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"You may choose not to untap this artifact during your untap step.\nWhenever this artifact becomes untapped, venture into the dungeon.\n{3}{W}, {T}: For as long as this artifact remains tapped, another target permanent loses all abilities and can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Venture into the dungeon"],"imageUrl":"https://cards.scryfall.io/normal/front/2/1/214c87be-7ce3-48a0-b2eb-26eff75636c9.jpg?1783926258","artUrl":"https://cards.scryfall.io/art_crop/front/2/1/214c87be-7ce3-48a0-b2eb-26eff75636c9.jpg?1783926258","commanderLegal":"legal","set":"afc","releasedAt":"2021-07-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const merieke = (): CardDef => ({"oracleId":"288fdfbb-1236-4732-afd7-e7eaba860007","name":"Merieke Ri Berit","manaCost":"{W}{U}{B}","cmc":3,"typeLine":"Legendary Creature — Human","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human"],"oracleText":"Merieke Ri Berit doesn't untap during your untap step.\n{T}: Gain control of target creature for as long as you control Merieke Ri Berit. When Merieke Ri Berit leaves the battlefield or becomes untapped, destroy that creature. It can't be regenerated.","power":"1","toughness":"1","colors":["B","U","W"],"colorIdentity":["B","U","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/b/3bf47c0a-5c17-47d0-b663-becff62fbdf8.jpg?1783947465","artUrl":"https://cards.scryfall.io/art_crop/front/3/b/3bf47c0a-5c17-47d0-b663-becff62fbdf8.jpg?1783947465","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const forest = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bonesplitter = (): CardDef => ({"oracleId":"452e3f5f-ce17-4682-966b-5cc100210aee","name":"Bonesplitter","manaCost":"{1}","cmc":1,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+0.\nEquip {1}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","artUrl":"https://cards.scryfall.io/art_crop/front/a/e/ae31d513-7412-4467-b497-a7183ff29a42.jpg?1783944980","commanderLegal":"legal","set":"pal03","releasedAt":"2003-01-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const serra = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const prodigal = (): CardDef => ({"oracleId":"5e961d15-5972-4e4b-9385-1cd7cd7c6bbe","name":"Prodigal Sorcerer","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Human Wizard Sorcerer","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard","Sorcerer"],"oracleText":"{T}: This creature deals 1 damage to any target.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/0/50aef269-55f9-4d84-8bc5-29e794297f11.jpg?1783937607","artUrl":"https://cards.scryfall.io/art_crop/front/5/0/50aef269-55f9-4d84-8bc5-29e794297f11.jpg?1783937607","commanderLegal":"legal","set":"ema","releasedAt":"2016-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const fireball = (): CardDef => ({"oracleId":"aa7714b0-2bfb-458a-8ebf-37ec2c53383e","name":"Fireball","manaCost":"{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"This spell costs {1} more to cast for each target beyond the first.\nFireball deals X damage divided evenly, rounded down, among any number of targets.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/2/82a97aae-d8a7-4451-a47e-ea878dea6e4c.jpg?1783922638","artUrl":"https://cards.scryfall.io/art_crop/front/8/2/82a97aae-d8a7-4451-a47e-ea878dea6e4c.jpg?1783922638","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const llanowar = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const regen = (): CardDef => ({"oracleId":"86187aed-77ce-4b2d-aab0-0a8f807a9451","name":"River Boa","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Snake","supertypes":[],"types":["Creature"],"subtypes":["Snake"],"oracleText":"Islandwalk (This creature can't be blocked as long as defending player controls an Island.)\n{G}: Regenerate this creature.","power":"2","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":["Landwalk","Regenerate","Islandwalk"],"imageUrl":"https://cards.scryfall.io/normal/front/4/a/4a81be06-b685-461b-80a8-2f23139106e7.jpg?1783942133","artUrl":"https://cards.scryfall.io/art_crop/front/4/a/4a81be06-b685-461b-80a8-2f23139106e7.jpg?1783942133","commanderLegal":"legal","set":"zen","releasedAt":"2009-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

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
/** A face-down 2/2 (manifested) `def` controlled by `pid`. */
const faceDown = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.faceDown = "manifest";
  invalidateCharacteristics(s);
  return id;
};
/** Makes every card in `pid`'s library a `def`, so whatever a shuffle puts on top is known. */
const allOf = (s: GameState, pid: PlayerId, def: CardDef) => {
  s.cards[def.oracleId] = def;
  for (const id of s.players[pid]!.library) s.objects[id]!.cardId = def.oracleId;
  invalidateCharacteristics(s);
};
const castPlan = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices: CostChoices = {}) => planCast(s, pid, id, targets, undefined, "auto", undefined, choices);
const obj = (id: ObjectId): TargetChoice => ({ kind: "object", id });
const others = (s: GameState, ap: PlayerId) => s.turnOrder.filter((p) => p !== ap);
/** What `pid` alone was told since log entry `from`. */
const privateTo = (s: GameState, pid: PlayerId, from: number) => s.log.slice(from).filter((l) => l.to === pid).map((l) => l.text);
const untappedLands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && !s.objects[id]!.tapped && characteristics(s, s.objects[id]!).types.includes("Land")).length;

describe("Round B186 cards are supported", () => {
  it("compiles all seven", () => supported(aperture(), laundry(), wind(), spy(), lantern(), rod(), merieke()));
});

describe("Temporal Aperture: the card it reveals on top may be played without paying its mana cost while it stays there", () => {
  it("shuffles, reveals the top card and lets you cast it for nothing, only while it remains on top this turn", () => {
    const { s: s0, ap } = setup([]);
    const ta = putOnBattlefield(s0, ap, aperture());
    allOf(s0, ap, divination());
    const shuffles = s0.players[ap]!.shuffles ?? 0;
    const s = settle(run(s0, planActivate(s0, ap, ta, 0)));
    const revealed = s.players[ap]!.library[0]!;
    expect(s.players[ap]!.shuffles).toBe(shuffles + 1);
    expect(s.objects[ta]!.tapped).toBe(true);
    expect(s.topFreePlays).toEqual([expect.objectContaining({ player: ap, card: revealed })]);
    // Everyone sees the top card while it's that card (CR 401.5).
    expect(topRevealed(s, ap)).toBe(true);
    expect(s.log.some((l) => l.to === undefined && /reveals the top card/.test(l.text))).toBe(true);
    const name = characteristics(s, s.objects[revealed]!).name;
    expect(name).toBe("Divination");
    // Paying its mana cost isn't allowed, only the free way.
    expect(castProblem(s, ap, revealed)).toMatch(/only be cast without paying its mana cost/);
    const lands = untappedLands(s, ap);
    const s2 = settle(run(s, castPlan(s, ap, revealed, [], { alt: "topFree" })));
    expect(untappedLands(s2, ap)).toBe(lands);
    expect(s2.log.some((l) => l.text.includes(`${name} without paying its mana cost`))).toBe(true);
    // The next card on top isn't the revealed one: no permission for it.
    const next = s2.players[ap]!.library[0]!;
    expect(castProblem(s2, ap, next, undefined, undefined, undefined, undefined, undefined, { alt: "topFree" })).not.toBeNull();
    expect(topRevealed(s2, ap)).toBe(false);
  });

  it("a land on top is played with the turn's land play, for free", () => {
    const { s: s0, ap } = setup([]);
    const ta = putOnBattlefield(s0, ap, aperture());
    // Every card in the library a Forest: whatever the shuffle puts on top is a land.
    allOf(s0, ap, forest());
    const s = settle(run(s0, planActivate(s0, ap, ta, 0)));
    const top = s.players[ap]!.library[0]!;
    const s2 = act(s, { type: "playLand", player: ap, objectId: top });
    expect(zone(s2, top)).toBe("battlefield");
    expect(s2.players[ap]!.landsPlayedThisTurn).toBe(1);
  });

  it("ends for good once another card is put on top and taken off again, and with the turn", () => {
    const { s: s0, ap } = setup([]);
    const ta = putOnBattlefield(s0, ap, aperture());
    allOf(s0, ap, divination());
    let s = settle(run(s0, planActivate(s0, ap, ta, 0)));
    const revealed = s.players[ap]!.library[0]!;
    expect(s.topFreePlays?.length).toBe(1);
    // Something goes on top, then comes off again: the card is back on top, but it didn't remain there (CR 611.2b).
    const covering = place(s, ap, shock(), "hand");
    moveObject(s, covering, "library", { top: true });
    expect(s.topFreePlays).toBeUndefined();
    moveObject(s, covering, "hand");
    expect(s.players[ap]!.library[0]).toBe(revealed);
    expect(topRevealed(s, ap)).toBe(false);
    expect(castProblem(s, ap, revealed, undefined, undefined, undefined, undefined, undefined, { alt: "topFree" })).not.toBeNull();

    // Next turn, no grant either.
    let u = settle(run(s0, planActivate(s0, ap, ta, 0)));
    expect(u.topFreePlays?.length).toBe(1);
    u = passTill(u, (x) => x.turn > s0.turn);
    expect(u.topFreePlays).toBeUndefined();
  });

  it("a shuffle of the library ends it, even with the card back on top", async () => {
    const { s: s0, ap } = setup([]);
    const ta = putOnBattlefield(s0, ap, aperture());
    const s = settle(run(s0, planActivate(s0, ap, ta, 0)));
    const card = s.players[ap]!.library[0]!;
    const { shuffleLibrary } = await import("../src");
    shuffleLibrary(s, s.players[ap]!);
    const lib = s.players[ap]!.library;
    lib.splice(lib.indexOf(card), 1);
    lib.unshift(card);
    expect(s.topFreePlays).toBeUndefined();
    expect(topRevealed(s, ap)).toBe(false);
  });

  it("bots cast the revealed card for nothing", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.command = [];
    const ta = putOnBattlefield(s0, ap, aperture());
    allOf(s0, ap, divination());
    s0.players[ap]!.hand = [];
    const s = settle(run(s0, planActivate(s0, ap, ta, 0)));
    const top = s.players[ap]!.library[0]!;
    const acts = botActions(s, ap);
    expect(acts).toContainEqual(expect.objectContaining({ type: "castSpell", objectId: top, alt: "topFree" }));
  });
});

describe("Lumbering Laundry: until end of turn, you may look at face-down creatures you don't control", () => {
  it("shows its controller other players' face-down creatures this turn only, not face-down spells", () => {
    const { s: s0, ap, opp } = setup([]);
    const ll = putOnBattlefield(s0, ap, laundry());
    const fd = faceDown(s0, opp, bears());
    const third = others(s0, ap).find((p) => p !== opp)!;
    expect(faceDownVisible(s0, s0.objects[fd]!, ap)).toBe(false);
    let s = settle(run(s0, planActivate(s0, ap, ll, 0)));
    expect(faceDownVisible(s, s.objects[fd]!, ap)).toBe(true);
    expect(faceDownVisible(s, s.objects[fd]!, third)).toBe(false);
    // A face-down spell on the stack stays hidden (rulings).
    const sp = structuredClone(s);
    sp.objects[fd]!.zone = "stack";
    expect(faceDownVisible(sp, sp.objects[fd]!, ap)).toBe(false);
    // Once the turn ends, no more.
    s = passTill(s, (x) => x.turn > s0.turn);
    expect(faceDownVisible(s, s.objects[fd]!, ap)).toBe(false);
  });
});

describe("Revealing Wind: prevent all combat damage this turn and look at each face-down creature attacking or blocking", () => {
  it("you alone see the attacking and blocking face-down creatures, not the others", () => {
    const { s: s0, ap, opp } = setup([]);
    const fdAttacking = faceDown(s0, opp, serra());
    const fdHome = faceDown(s0, opp, bears());
    const fdBlocking = faceDown(s0, ap, prodigal());
    s0.objects[fdAttacking]!.attacking = ap;
    s0.objects[fdBlocking]!.blocking = [fdAttacking];
    const spell = place(s0, ap, wind(), "hand");
    const from = s0.log.length;
    const s = settle(run(s0, castPlan(s0, ap, spell)));
    expect(s.preventCombatDamage).toBe(true);
    const seen = privateTo(s, ap, from);
    expect(seen).toContain("That face-down creature is Serra Angel.");
    expect(seen).toContain("That face-down creature is Prodigal Sorcerer.");
    expect(seen.some((t) => t.includes("Grizzly Bears"))).toBe(false);
    for (const p of others(s, ap)) expect(privateTo(s, p, from).some((t) => t.includes("Serra Angel"))).toBe(false);
    expect(zone(s, fdHome)).toBe("battlefield");
  });

  it("with no face-down creature in combat it still prevents combat damage", () => {
    const { s: s0, ap } = setup([]);
    const spell = place(s0, ap, wind(), "hand");
    const s = settle(run(s0, castPlan(s0, ap, spell)));
    expect(s.preventCombatDamage).toBe(true);
  });
});

describe("Spy Network: look at a player's hand, the top card of their library and their face-down creatures, then order your top four", () => {
  it("only you see them; the top card stays; your top four go back in the order you choose", () => {
    const { s: s0, ap, opp } = setup([]);
    s0.players[opp]!.hand = [];
    place(s0, opp, shock(), "hand");
    place(s0, opp, serra(), "hand");
    const oppTop = place(s0, opp, pacifism(), "library");
    faceDown(s0, opp, prodigal());
    faceDown(s0, ap, serra());
    const spell = place(s0, ap, spy(), "hand");
    const from = s0.log.length;
    let s = settle(run(s0, castPlan(s0, ap, spell, [{ kind: "player", id: opp }])));
    // Ordering the top four is the last thing it does.
    expect(s.pending?.kind).toBeDefined();
    const seen = privateTo(s, ap, from);
    expect(seen.some((t) => /hand: .*Shock/.test(t) && /Serra Angel/.test(t))).toBe(true);
    expect(seen.some((t) => /top card of .*library: Pacifism/.test(t))).toBe(true);
    expect(seen).toContain("That face-down creature is Prodigal Sorcerer.");
    // Your own face-down creature isn't theirs.
    expect(seen.some((t) => t === "That face-down creature is Serra Angel.")).toBe(false);
    for (const p of others(s, ap)) expect(privateTo(s, p, from).some((t) => t.includes("Prodigal Sorcerer"))).toBe(false);
    expect(s.players[opp]!.library[0]).toBe(oppTop);
    const top4 = s.players[ap]!.library.slice(0, 4);
    for (let i = 0; i < 4 && s.pending; i++) s = settle(run(s, botActions(s, waitingOn(s)!)));
    expect(s.pending).toBeNull();
    expect(new Set(s.players[ap]!.library.slice(0, 4))).toEqual(new Set(top4));
    expect(zone(s, spell)).toBe("graveyard");
  });
});

describe("Glowcap Lantern: the equipped creature lets its controller look at the top card any time, and explores as it attacks", () => {
  it("only while it's attached to a creature you control; the creature explores when it attacks", () => {
    const { s: s0, ap, opp } = setup([]);
    const gl = putOnBattlefield(s0, ap, lantern());
    const bear = putOnBattlefield(s0, ap, bears());
    expect(topVisible(s0, ap, ap)).toBe(false);
    let s = settle(run(s0, planActivate(s0, ap, gl, 0, [obj(bear)])));
    expect(s.objects[gl]!.attachedTo).toBe(bear);
    expect(abilitiesOf(s, s.objects[bear]!).lookTop).toBe(true);
    expect(topVisible(s, ap, ap)).toBe(true);
    expect(topVisible(s, ap, opp)).toBe(false);
    // The explore: a land on top goes to your hand.
    const land = place(s, ap, forest(), "library");
    s = passTill(s, (x) => x.pending?.kind === "declareAttackers" && x.activePlayer === ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: bear, defender: opp }] });
    s = settle(s);
    for (let i = 0; i < 4 && s.pending && s.pending.kind !== "declareBlockers"; i++) s = settle(run(s, botActions(s, waitingOn(s)!)));
    expect(zone(s, land)).toBe("hand");
  });

  it("an opponent's creature with it lets that opponent look, not you", () => {
    const { s: s0, ap, opp } = setup([]);
    const gl = putOnBattlefield(s0, ap, lantern());
    const theirs = putOnBattlefield(s0, opp, bears());
    s0.objects[gl]!.attachedTo = theirs;
    invalidateCharacteristics(s0);
    expect(topVisible(s0, ap, ap)).toBe(false);
    expect(topVisible(s0, opp, opp)).toBe(true);
  });
});

describe("Immovable Rod: for as long as ~ remains tapped, another target permanent loses all abilities and can't attack or block", () => {
  it("lasts while Rod stays tapped and ends when it untaps", () => {
    const { s: s0, ap, opp } = setup([]);
    const ir = putOnBattlefield(s0, ap, rod());
    const ps = putOnBattlefield(s0, opp, prodigal());
    expect(planActivate(s0, ap, ir, 0, [obj(ir)])).toBeNull();
    let s = settle(run(s0, planActivate(s0, ap, ir, 0, [obj(ps)])));
    expect(abilitiesOf(s, s.objects[ps]!).activated.length).toBe(0);
    expect(characteristics(s, s.objects[ps]!).cantAttack).toBe(true);
    expect(characteristics(s, s.objects[ps]!).cantBlock).toBe(true);
    expect(planActivate(s, opp, ps, 0, [{ kind: "player", id: ap }])).toBeNull();
    // Untapping Rod ends it (CR 611.2b), and Rod's own "becomes untapped" trigger ventures.
    untapPermanent(s, s.objects[ir]!);
    invalidateCharacteristics(s);
    expect(abilitiesOf(s, s.objects[ps]!).activated.length).toBe(1);
    expect(characteristics(s, s.objects[ps]!).cantAttack).toBeFalsy();
  });

  it("an Aura that loses enchant goes to its owner's graveyard; an Equipment stays attached", () => {
    const { s: s0, ap, opp } = setup([]);
    const ir = putOnBattlefield(s0, ap, rod());
    const bear = putOnBattlefield(s0, opp, bears());
    const aura = putOnBattlefield(s0, opp, pacifism());
    s0.objects[aura]!.attachedTo = bear;
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planActivate(s0, ap, ir, 0, [obj(aura)])));
    runStateBasedActions(s);
    expect(zone(s, aura)).toBe("graveyard");

    const { s: t0, ap: bp, opp: bo } = setup([]);
    const ir2 = putOnBattlefield(t0, bp, rod());
    const bear2 = putOnBattlefield(t0, bo, bears());
    const eq = putOnBattlefield(t0, bo, bonesplitter());
    t0.objects[eq]!.attachedTo = bear2;
    invalidateCharacteristics(t0);
    s = settle(run(t0, planActivate(t0, bp, ir2, 0, [obj(eq)])));
    runStateBasedActions(s);
    expect(s.objects[eq]!.attachedTo).toBe(bear2);
    // It lost "Equipped creature gets +2/+0".
    expect(characteristics(s, s.objects[bear2]!).power).toBe(2);
  });
});

describe("Merieke Ri Berit: the creature it took is destroyed when it leaves the battlefield or becomes untapped", () => {
  it("untapping destroys the creature while you still control it; it can't be regenerated", () => {
    const { s: s0, ap, opp } = setup([]);
    const mk = putOnBattlefield(s0, ap, merieke());
    const boa = putOnBattlefield(s0, opp, regen());
    let s = settle(run(s0, planActivate(s0, ap, mk, 0, [obj(boa)])));
    expect(controllerOf(s, s.objects[boa]!)).toBe(ap);
    // A regeneration shield doesn't save it.
    s.objects[boa]!.regenShields = 1;
    untapPermanent(s, s.objects[mk]!);
    expect(s.triggerQueue.length + s.stack.length).toBeGreaterThan(0);
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(zone(s, boa)).toBe("graveyard");
    expect(s.players[opp]!.graveyard).toContain(boa);
    // It triggers once.
    expect(s.delayed?.some((d) => d.orUntaps) ?? false).toBe(false);
  });

  it("leaving the battlefield gives the creature back, then destroys it", () => {
    const { s: s0, ap, opp } = setup([]);
    const mk = putOnBattlefield(s0, ap, merieke());
    const bear = putOnBattlefield(s0, opp, bears());
    let s = settle(run(s0, planActivate(s0, ap, mk, 0, [obj(bear)])));
    expect(controllerOf(s, s.objects[bear]!)).toBe(ap);
    moveObject(s, mk, "graveyard");
    runStateBasedActions(s);
    // The control effect ended first (CR 611.2b): it's back with its owner when it's destroyed.
    expect(controllerOf(s, s.objects[bear]!)).toBe(opp);
    s = settle(s);
    expect(zone(s, mk)).toBe("graveyard");
    expect(zone(s, bear)).toBe("graveyard");
    expect(s.players[opp]!.graveyard).toContain(bear);
  });

  it("another player taking control of Merieke ends the control but doesn't destroy the creature", () => {
    const { s: s0, ap, opp } = setup([]);
    const mk = putOnBattlefield(s0, ap, merieke());
    const bear = putOnBattlefield(s0, opp, bears());
    let s = settle(run(s0, planActivate(s0, ap, mk, 0, [obj(bear)])));
    const third = others(s, ap).find((p) => p !== opp)!;
    s.effects.push({ id: `x${s.nextId++}`, timestamp: s.nextTimestamp++, controller: third, sourceName: "test", duration: "game", affected: [mk], mods: [{ kind: "control" }] });
    invalidateCharacteristics(s);
    s = settle(s);
    runStateBasedActions(s);
    s = settle(s);
    expect(controllerOf(s, s.objects[mk]!)).toBe(third);
    expect(controllerOf(s, s.objects[bear]!)).toBe(opp);
    expect(zone(s, bear)).toBe("battlefield");
  });
});
