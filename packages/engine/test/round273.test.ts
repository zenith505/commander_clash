// Round 273, from the top of the popularity list: cards exiled face down that you may play (Dream-Thief's Bandana's
// "their library" and "For as long as it remains exiled, you may play it"; Black Cat's "exile two of them face down" and
// "You may play the exiled cards"; Ixhel's "each opponent who has three or more poison counters exiles ..."), Cruelclaw's
// Heist ("If the gift was promised, you may cast that card ..."), Unidentified Hovership ("the exiled card's owner
// manifests dread", CR 607.2a, 701.62a), Mercurial Spelldancer ("If you do, when you next cast an instant or sorcery spell
// this turn, copy that spell", CR 603.7), Mindleech Mass ("you may look at that player's hand. If you do, you may cast a
// spell from among those cards"), Confiscation Coup (pay energy equal to the target's mana value), Role Reversal ("two
// target permanents that share a permanent type", CR 110.4) and Ill-Timed Explosion ("the greatest mana value among cards
// discarded this way").

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, compileCard, controllerOf, invalidateCharacteristics, isFullySupported, legalTargets, mayPlayFromExile, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";
import { moveObject } from "../src/game";

const C = {
  bandana: {"oracleId":"3c958b5f-680b-45fc-8c3d-27b23677436e","name":"Dream-Thief's Bandana","manaCost":"{2}","cmc":2,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Whenever equipped creature deals combat damage to a player, look at the top card of their library, then exile it face down. For as long as it remains exiled, you may play it, and mana of any type can be spent to cast that spell.\nEquip {1}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/d/c/dccdb6cc-dfad-4c7e-9550-3dd12f3e9c79.jpg?1783911961","artUrl":"https://cards.scryfall.io/art_crop/front/d/c/dccdb6cc-dfad-4c7e-9550-3dd12f3e9c79.jpg?1783911961","commanderLegal":"legal","set":"otc","releasedAt":"2024-04-19","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  cat: {"oracleId":"f5cdb413-2b72-4dc6-b93d-2532ac2ae568","name":"Black Cat, Cunning Thief","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Legendary Creature — Human Rogue Villain","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Rogue","Villain"],"oracleText":"When Black Cat enters, look at the top nine cards of target opponent's library, exile two of them face down, then put the rest on the bottom of their library in a random order. You may play the exiled cards for as long as they remain exiled. Mana of any type can be spent to cast spells this way.","power":"2","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/e/0ed36ada-22c8-4e40-86c5-c116a0bee1c2.jpg?1783905347","artUrl":"https://cards.scryfall.io/art_crop/front/0/e/0ed36ada-22c8-4e40-86c5-c116a0bee1c2.jpg?1783905347","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  ixhel: {"oracleId":"9fb7982f-fe35-4dea-a515-a0039ddbbaec","name":"Ixhel, Scion of Atraxa","manaCost":"{1}{W}{B}{G}","cmc":4,"typeLine":"Legendary Creature — Phyrexian Angel","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Phyrexian","Angel"],"oracleText":"Flying, vigilance, toxic 2\nCorrupted — At the beginning of your end step, each opponent who has three or more poison counters exiles the top card of their library face down. You may look at and play those cards for as long as they remain exiled, and you may spend mana as though it were mana of any color to cast those spells.","power":"2","toughness":"5","colors":["B","G","W"],"colorIdentity":["B","G","W"],"keywords":["Flying","Toxic","Vigilance","Corrupted"],"imageUrl":"https://cards.scryfall.io/normal/front/a/b/ab866ec4-dcb4-47ef-8de1-a369986609c0.jpg?1783918163","artUrl":"https://cards.scryfall.io/art_crop/front/a/b/ab866ec4-dcb4-47ef-8de1-a369986609c0.jpg?1783918163","commanderLegal":"legal","set":"onc","releasedAt":"2023-02-10","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef,
  heist: {"oracleId":"7a0bc265-6b40-48d6-a588-c9624df7d1bc","name":"Cruelclaw's Heist","manaCost":"{B}{B}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Gift a card (You may promise an opponent a gift as you cast this spell. If you do, they draw a card before its other effects.)\nTarget opponent reveals their hand. You choose a nonland card from it. Exile that card. If the gift was promised, you may cast that card for as long as it remains exiled, and mana of any type can be spent to cast it.","colors":["B"],"colorIdentity":["B"],"keywords":["Gift"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cab4539a-0157-4cbe-b50f-6e2575df74e9.jpg?1783910836","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cab4539a-0157-4cbe-b50f-6e2575df74e9.jpg?1783910836","commanderLegal":"legal","set":"blb","releasedAt":"2024-08-02","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  hover: {"oracleId":"bde67dfb-706b-4942-a365-984ea6e97a2b","name":"Unidentified Hovership","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Artifact — Vehicle","supertypes":[],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"Flying\nWhen this Vehicle enters, exile up to one target creature with toughness 5 or less.\nWhen this Vehicle leaves the battlefield, the exiled card's owner manifests dread.\nCrew 1","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Crew"],"imageUrl":"https://cards.scryfall.io/normal/front/4/2/426b1aa9-e94f-4654-88c7-9cea52f1bc0a.jpg?1783909413","artUrl":"https://cards.scryfall.io/art_crop/front/4/2/426b1aa9-e94f-4654-88c7-9cea52f1bc0a.jpg?1783909413","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  dancer: {"oracleId":"5b90f8ed-84b2-4306-9dfa-b5654ea0e4cd","name":"Mercurial Spelldancer","manaCost":"{1}{U}","cmc":2,"typeLine":"Creature — Phyrexian Rogue","supertypes":[],"types":["Creature"],"subtypes":["Phyrexian","Rogue"],"oracleText":"This creature can't be blocked.\nWhenever you cast a noncreature spell, put an oil counter on this creature.\nWhenever this creature deals combat damage to a player, you may remove two oil counters from it. If you do, when you next cast an instant or sorcery spell this turn, copy that spell. You may choose new targets for the copy.","power":"2","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/f/cf28c75d-1fb3-44cc-b651-5b2830e22add.jpg?1783918060","artUrl":"https://cards.scryfall.io/art_crop/front/c/f/cf28c75d-1fb3-44cc-b651-5b2830e22add.jpg?1783918060","commanderLegal":"legal","set":"one","releasedAt":"2023-02-10","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  mass: {"oracleId":"facc2d6f-3f28-4b87-b643-44fdf939a2b5","name":"Mindleech Mass","manaCost":"{5}{U}{B}{B}","cmc":8,"typeLine":"Creature — Horror","supertypes":[],"types":["Creature"],"subtypes":["Horror"],"oracleText":"Trample\nWhenever this creature deals combat damage to a player, you may look at that player's hand. If you do, you may cast a spell from among those cards without paying its mana cost.","power":"6","toughness":"6","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/7/c/7cd1ace7-d4fe-4f96-9434-7ab1442bf36f.jpg?1783943617","artUrl":"https://cards.scryfall.io/art_crop/front/7/c/7cd1ace7-d4fe-4f96-9434-7ab1442bf36f.jpg?1783943617","commanderLegal":"legal","set":"rav","releasedAt":"2005-10-07","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  coup: {"oracleId":"c246cdb4-2fd8-487e-944e-3e52fbd1bbaa","name":"Confiscation Coup","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose target artifact or creature. You get {E}{E}{E}{E} (four energy counters), then you may pay an amount of {E} equal to that permanent's mana value. If you do, gain control of it.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/d/6daf453f-54be-4346-831d-a0434aa086fe.jpg?1783937222","artUrl":"https://cards.scryfall.io/art_crop/front/6/d/6daf453f-54be-4346-831d-a0434aa086fe.jpg?1783937222","commanderLegal":"legal","set":"kld","releasedAt":"2016-09-30","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  role: {"oracleId":"8be783b2-7394-411a-8ab5-a8fffe8d714c","name":"Role Reversal","manaCost":"{U}{U}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Exchange control of two target permanents that share a permanent type.","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/9/59b47017-d982-4d4c-94fc-f265a5b7f36a.jpg?1783933388","artUrl":"https://cards.scryfall.io/art_crop/front/5/9/59b47017-d982-4d4c-94fc-f265a5b7f36a.jpg?1783933388","commanderLegal":"legal","set":"war","releasedAt":"2019-05-03","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  ite: {"oracleId":"6e3b3a3f-e32f-4c72-a9fb-dd1e877876b6","name":"Ill-Timed Explosion","manaCost":"{2}{U}{R}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards. Then you may discard two cards. When you do, Ill-Timed Explosion deals X damage to each creature, where X is the greatest mana value among cards discarded this way.","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/b/0b5cdb01-eaa4-4a0a-b42a-332bcf4d6fff.jpg?1783912847","artUrl":"https://cards.scryfall.io/art_crop/front/0/b/0b5cdb01-eaa4-4a0a-b42a-332bcf4d6fff.jpg?1783912847","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  bolt: {"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
  bears: {"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  forest: {"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  ogre: {"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  opt: {"oracleId":"713332c1-5bd8-400f-bfff-c1ca0697a043","name":"Opt","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","commanderLegal":"legal","set":"sld","releasedAt":"2025-07-25","rarity":"rare","layout":"normal","gameChanger":false} as CardDef,
  divination: {"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false} as CardDef,
  sol: {"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef,
};

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty, stopping at any question. */
const pass = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Everyone passes until the stack is empty; the bots answer every question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = [], choices = {}) => run(s, planCast(s, pid, id, targets, undefined, "auto", undefined, choices));
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const nameOf = (s: GameState, id: ObjectId) => s.cards[s.objects[id]!.cardId]!.name;
/** `id`'s triggered ability `index` triggers now, about `to` (the player dealt combat damage). */
function trigger(s: GameState, pid: PlayerId, id: string, index: number, to?: PlayerId) {
  s.triggerQueue.push({ sourceId: id, sourceCardId: s.objects[id]!.cardId, controller: pid, index, sourceZc: s.objects[id]!.zoneChanges ?? 0, ...(to !== undefined ? { event: { player: to } } : {}) });
  return pass(s);
}
/** Moves the first card named `name` in `pid`'s library to the top. */
const toTop = (s: GameState, pid: PlayerId, name: string) => {
  const lib = s.players[pid]!.library;
  const at = lib.findIndex((id) => nameOf(s, id) === name);
  lib.unshift(...lib.splice(at, 1));
  return lib[0]!;
};

describe("round 273 cards", () => {
  it("all compile fully", () => {
    for (const def of [C.bandana, C.cat, C.ixhel, C.heist, C.hover, C.dancer, C.mass, C.coup, C.role, C.ite]) expect(isFullySupported(def), def.name).toBe(true);
  });
});

describe("Dream-Thief's Bandana: look at the top card of their library, then exile it face down", () => {
  it("equipped creature's combat damage exiles that player's top card face down; you may play it, a land too", () => {
    const { s: s0, ap, opp } = setup([]);
    const bear = putOnBattlefield(s0, ap, C.bears);
    const bandana = putOnBattlefield(s0, ap, C.bandana);
    s0.objects[bandana]!.attachedTo = bear;
    invalidateCharacteristics(s0);
    const top = toTop(s0, opp, "Forest");
    let s = act(passUntil(s0, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: bear, defender: opp }] });
    for (let i = 0; i < 40 && s.step !== "main2"; i++) {
      if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
      else if (s.pending) for (const a of botActions(s, s.pending.player)) s = act(s, a);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.step).toBe("main2");
    expect(zone(s, top)).toBe("exile");
    expect(s.players[opp]!.exile).toContain(top);
    expect(s.objects[top]!.hiddenExile?.seen).toEqual([ap]);
    expect(mayPlayFromExile(s, s.objects[top]!, ap)).toBe(true);
    expect(mayPlayFromExile(s, s.objects[top]!, opp)).toBe(false);
    // "You may play it": a land is played from exile (with the usual timing, rulings).
    s = act(s, { type: "playLand", player: ap, objectId: top });
    expect(zone(s, top)).toBe("battlefield");
    expect(controllerOf(s, s.objects[top]!)).toBe(ap);
  });

  it("the card stays playable after the Bandana leaves the battlefield (rulings), and mana of any type pays for it", () => {
    const { s: s0, ap, opp } = setup([]);
    const bear = putOnBattlefield(s0, ap, C.bears);
    const bandana = putOnBattlefield(s0, ap, C.bandana);
    s0.objects[bandana]!.attachedTo = bear;
    invalidateCharacteristics(s0);
    const top = toTop(s0, opp, "Grizzly Bears");
    let s = trigger(s0, ap, bandana, 0, opp);
    expect(zone(s, top)).toBe("exile");
    moveObject(s, bandana, "graveyard");
    expect(mayPlayFromExile(s, s.objects[top]!, ap)).toBe(true);
    // Only Islands: {1}{G} paid with blue mana.
    for (const id of [...s.battlefield]) {
      const o = s.objects[id]!;
      if (o.controller === ap && s.cards[o.cardId]!.types.includes("Land") && nameOf(s, id) !== "Island") moveObject(s, id, "graveyard");
    }
    s = pass(castNow(s, ap, top));
    expect(zone(s, top)).toBe("battlefield");
    expect(controllerOf(s, s.objects[top]!)).toBe(ap);
  });
});

describe("Black Cat, Cunning Thief: exile two of the top nine face down; you may play them", () => {
  const enter = (s0: GameState, ap: PlayerId, catId: ObjectId, opp: PlayerId) => {
    let s = pass(castNow(s0, ap, catId));
    for (let i = 0; i < 20 && s.pending?.kind !== "searchLibrary"; i++) {
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return s;
  };

  it("you choose exactly two of the nine; they're exiled face down, the other seven go to the bottom", () => {
    const { s: s0, ap, ids, opp } = setup([C.cat]);
    const land = toTop(s0, opp, "Forest");
    const bear = toTop(s0, opp, "Grizzly Bears");
    const nine = s0.players[opp]!.library.slice(0, 9);
    let s = enter(s0, ap, ids[0]!, opp);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 2, max: 2 });
    if (s.pending?.kind !== "searchLibrary") throw new Error();
    expect(s.pending.cards).toEqual(nine);
    s = pass(act(s, { type: "searchLibrary", player: ap, found: [bear, land] }));
    for (const id of [bear, land]) {
      expect(zone(s, id)).toBe("exile");
      expect(s.objects[id]!.hiddenExile?.seen).toEqual([ap]);
      expect(mayPlayFromExile(s, s.objects[id]!, ap)).toBe(true);
    }
    const lib = s.players[opp]!.library;
    expect(lib.slice(-7).sort()).toEqual(nine.filter((id) => id !== bear && id !== land).sort());
    // "You may play the exiled cards": the land too.
    s = act(s, { type: "playLand", player: ap, objectId: land });
    expect(zone(s, land)).toBe("battlefield");
    expect(controllerOf(s, s.objects[land]!)).toBe(ap);
    // Mana of any type: only Islands left.
    for (const id of [...s.battlefield]) {
      const o = s.objects[id]!;
      if (o.controller === ap && s.cards[o.cardId]!.types.includes("Land") && nameOf(s, id) !== "Island") moveObject(s, id, "graveyard");
    }
    s = pass(castNow(s, ap, bear));
    expect(zone(s, bear)).toBe("battlefield");
  });

  it("with only one card in that library, that card is exiled (rulings: you look at what's left)", () => {
    const { s: s0, ap, ids, opp } = setup([C.cat]);
    const lib = s0.players[opp]!.library;
    for (const id of lib.splice(1)) moveObject(s0, id, "graveyard");
    s0.players[opp]!.library = lib.slice(0, 1);
    const only = s0.players[opp]!.library[0]!;
    let s = enter(s0, ap, ids[0]!, opp);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", min: 1, max: 1 });
    s = pass(act(s, { type: "searchLibrary", player: ap, found: [only] }));
    expect(zone(s, only)).toBe("exile");
  });

  it("a bot picks two cards", () => {
    const { s: s0, ap, ids, opp } = setup([C.cat]);
    const nine = s0.players[opp]!.library.slice(0, 9);
    const s = settle(enter(s0, ap, ids[0]!, opp));
    expect(nine.filter((id) => zone(s, id) === "exile").length).toBe(2);
  });
});

describe("Ixhel, Scion of Atraxa: each opponent who has three or more poison counters exiles their top card face down", () => {
  it("only those opponents, counted as it resolves; you may look at and play the cards", () => {
    const { s: s0, ap } = setup([]);
    const ixhel = putOnBattlefield(s0, ap, C.ixhel);
    const [o1, o2, o3] = s0.turnOrder.filter((p) => p !== ap) as [PlayerId, PlayerId, PlayerId];
    s0.players[o1]!.poison = 3;
    s0.players[o2]!.poison = 2;
    s0.players[o3]!.poison = 5;
    const tops = [o1, o2, o3].map((p) => s0.players[p]!.library[0]!);
    const s = trigger(s0, ap, ixhel, 0);
    expect(zone(s, tops[0]!)).toBe("exile");
    expect(zone(s, tops[1]!)).toBe("library");
    expect(zone(s, tops[2]!)).toBe("exile");
    for (const id of [tops[0]!, tops[2]!]) {
      expect(s.objects[id]!.hiddenExile?.seen).toEqual([ap]);
      expect(mayPlayFromExile(s, s.objects[id]!, ap)).toBe(true);
    }
  });
});

describe("Cruelclaw's Heist: if the gift was promised, you may cast the exiled card", () => {
  const heist = (gift: boolean) => {
    const { s: s0, ap, ids, opp } = setup([C.heist]);
    const giant = into(s0, opp, C.ogre, "hand");
    let s = pass(castNow(s0, ap, ids[0]!, [{ kind: "player", id: opp }], gift ? { gift: opp } : {}));
    expect(s.pending?.player).toBe(ap);
    if (s.pending?.kind !== "searchLibrary") throw new Error(`pending ${s.pending?.kind}`);
    expect(s.pending.cards).toContain(giant);
    s = pass(act(s, { type: "searchLibrary", player: ap, found: [giant] }));
    return { s, ap, opp, giant };
  };

  it("with the gift promised, the card is exiled and you may cast it with mana of any type", () => {
    const { s: s0, ap, opp, giant } = heist(true);
    let s = s0;
    expect(zone(s, giant)).toBe("exile");
    expect(s.players[opp]!.exile).toContain(giant);
    expect(mayPlayFromExile(s, s.objects[giant]!, ap)).toBe(true);
    expect(mayPlayFromExile(s, s.objects[giant]!, opp)).toBe(false);
    // No red mana: only Islands and Plains.
    for (const id of [...s.battlefield]) {
      const o = s.objects[id]!;
      if (o.controller === ap && s.cards[o.cardId]!.types.includes("Land") && !["Island", "Plains"].includes(nameOf(s, id))) moveObject(s, id, "graveyard");
    }
    s = pass(castNow(s, ap, giant));
    expect(zone(s, giant)).toBe("battlefield");
    expect(controllerOf(s, s.objects[giant]!)).toBe(ap);
  });

  it("without it, the card is only exiled", () => {
    const { s, ap, giant } = heist(false);
    expect(zone(s, giant)).toBe("exile");
    expect(mayPlayFromExile(s, s.objects[giant]!, ap)).toBe(false);
  });
});

describe("Unidentified Hovership: when it leaves, the exiled card's owner manifests dread", () => {
  it("the owner of the creature its enters ability exiled looks at their top two, manifests one and bins the other", () => {
    const { s: s0, ap, ids, opp } = setup([C.hover]);
    const giant = putOnBattlefield(s0, opp, C.ogre);
    let s = pass(castNow(s0, ap, ids[0]!));
    for (let i = 0; i < 20 && zone(s, giant) === "battlefield"; i++) {
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(giant)] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(zone(s, giant)).toBe("exile");
    const [a, b] = s.players[opp]!.library.slice(0, 2) as [ObjectId, ObjectId];
    const before = s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === opp).length;
    moveObject(s, ids[0]!, "graveyard");
    s = pass(s);
    // The owner chooses (a "look at the top two" pick).
    expect(s.pending?.player).toBe(opp);
    s = pass(act(s, { type: "searchLibrary", player: opp, found: [a] }));
    expect(zone(s, a)).toBe("battlefield");
    expect(s.objects[a]!.faceDown).toBeTruthy();
    expect(controllerOf(s, s.objects[a]!)).toBe(opp);
    expect(zone(s, b)).toBe("graveyard");
    expect(s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === opp).length).toBe(before + 1);
    // The exiled creature stays exiled.
    expect(zone(s, giant)).toBe("exile");
  });

  it("with no exiled card (none was chosen), nothing happens (rulings)", () => {
    const { s: s0, ap, ids } = setup([C.hover]);
    let s = pass(castNow(s0, ap, ids[0]!));
    for (let i = 0; i < 20 && (s.stack.length || s.pending); i++) {
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "none" }] });
      else if (s.pending) throw new Error(s.pending.kind);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    const libs = s.turnOrder.map((p) => s.players[p]!.library.length);
    moveObject(s, ids[0]!, "graveyard");
    s = pass(s);
    expect(s.pending).toBeFalsy();
    expect(s.turnOrder.map((p) => s.players[p]!.library.length)).toEqual(libs);
  });
});

describe("Mercurial Spelldancer: you may remove two oil counters; if you do, copy your next instant or sorcery this turn", () => {
  it("removing two oil counters copies the next instant cast this turn", () => {
    const { s: s0, ap, ids, opp } = setup([C.opt]);
    const dancer = putOnBattlefield(s0, ap, C.dancer);
    s0.objects[dancer]!.counters.oil = 3;
    let s = trigger(s0, ap, dancer, 1, opp);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = pass(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.objects[dancer]!.counters.oil).toBe(1);
    const hand = s.players[ap]!.hand.length;
    s = castNow(s, ap, ids[0]!);
    // The delayed trigger copies Opt (cast, on the stack): two scries and two draws.
    for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      if (s.pending?.kind === "arrangeTop") s = act(s, { type: "arrangeTop", player: ap, top: s.pending.cards, away: [] });
      else if (s.pending) for (const a of botActions(s, s.pending.player)) s = act(s, a);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
  });

  it("with fewer than two oil counters, there's nothing to do", () => {
    const { s: s0, ap, ids, opp } = setup([C.opt]);
    const dancer = putOnBattlefield(s0, ap, C.dancer);
    s0.objects[dancer]!.counters.oil = 1;
    let s = trigger(s0, ap, dancer, 1, opp);
    expect(s.pending).toBeFalsy();
    expect(s.objects[dancer]!.counters.oil).toBe(1);
    const hand = s.players[ap]!.hand.length;
    s = settle(castNow(s, ap, ids[0]!));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
  });
});

describe("Mindleech Mass: you may look at that player's hand and cast a spell from among those cards free", () => {
  it("casts a card from that player's hand without paying its mana cost; you control the spell", () => {
    const { s: s0, ap, opp } = setup([]);
    const mass = putOnBattlefield(s0, ap, C.mass);
    const giant = into(s0, opp, C.ogre, "hand");
    for (const p of s0.turnOrder) s0.players[p]!.manaPool = {};
    let s = trigger(s0, ap, mass, 0, opp);
    expect(s.pending?.player).toBe(ap);
    const p = s.pending!;
    const pick = botActions(s, ap);
    expect(pick.length).toBeGreaterThan(0);
    for (const a of pick) s = act(s, a);
    s = settle(s);
    expect(p.kind).toBeDefined();
    expect(zone(s, giant)).toBe("battlefield");
    expect(controllerOf(s, s.objects[giant]!)).toBe(ap);
    expect(s.objects[giant]!.owner).toBe(opp);
  });
});

describe("Confiscation Coup: you get four energy, then may pay energy equal to the target's mana value", () => {
  it("pays four energy for a four-mana creature and gains control of it", () => {
    const { s: s0, ap, ids, opp } = setup([C.coup]);
    const giant = putOnBattlefield(s0, opp, C.ogre);
    let s = pass(castNow(s0, ap, ids[0]!, [tgt(giant)]));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    expect(s.players[ap]!.energy).toBe(4);
    s = pass(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.players[ap]!.energy ?? 0).toBe(0);
    expect(controllerOf(s, s.objects[giant]!)).toBe(ap);
  });

  it("can't pay for a five-mana-value permanent with only four energy; declining keeps the energy", () => {
    const { s: s0, ap, ids, opp } = setup([C.coup]);
    const cat = putOnBattlefield(s0, opp, C.cat);
    let s = pass(castNow(s0, ap, ids[0]!, [tgt(cat)]));
    expect(s.pending).toBeFalsy();
    expect(s.players[ap]!.energy).toBe(4);
    expect(controllerOf(s, s.objects[cat]!)).toBe(opp);
    const { s: t0, ap: ap2, ids: ids2, opp: opp2 } = setup([C.coup]);
    const giant = putOnBattlefield(t0, opp2, C.ogre);
    let t = pass(castNow(t0, ap2, ids2[0]!, [tgt(giant)]));
    t = pass(act(t, { type: "chooseMay", player: ap2, yes: false }));
    expect(t.players[ap2]!.energy).toBe(4);
    expect(controllerOf(t, t.objects[giant]!)).toBe(opp2);
    void s;
  });

  it("a token that copies nothing has mana value 0: you may pay no energy for it (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([C.coup]);
    const giant = putOnBattlefield(s0, opp, C.ogre);
    s0.objects[giant]!.isToken = true;
    s0.objects[giant]!.cardId = `token:Soldier:${giant}`;
    s0.cards[s0.objects[giant]!.cardId] = { ...C.bears, name: "Soldier", manaCost: "", cmc: 0 };
    invalidateCharacteristics(s0);
    let s = pass(castNow(s0, ap, ids[0]!, [tgt(giant)]));
    expect(s.pending).toMatchObject({ kind: "chooseMay" });
    s = pass(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.players[ap]!.energy).toBe(4);
    expect(controllerOf(s, s.objects[giant]!)).toBe(ap);
  });
});

describe("Role Reversal: exchange control of two target permanents that share a permanent type", () => {
  it("exchanges your creature and an opponent's creature", () => {
    const { s: s0, ap, ids, opp } = setup([C.role]);
    const bear = putOnBattlefield(s0, ap, C.bears);
    const giant = putOnBattlefield(s0, opp, C.ogre);
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(bear), tgt(giant)]));
    expect(controllerOf(s, s.objects[bear]!)).toBe(opp);
    expect(controllerOf(s, s.objects[giant]!)).toBe(ap);
  });

  it("permanents with no permanent type in common can't be chosen together (supertypes don't count)", () => {
    const { s: s0, ap, ids, opp } = setup([C.role]);
    const bear = putOnBattlefield(s0, ap, C.bears);
    const ring = putOnBattlefield(s0, opp, C.sol);
    const giant = putOnBattlefield(s0, opp, C.ogre);
    const second = compileCard(C.role).spell!.targets[1]!;
    expect(planCast(s0, ap, ids[0]!, [tgt(bear), tgt(ring)])).toBeNull();
    expect(legalTargets(s0, second, ap).some((t) => t.id === giant)).toBe(true);
  });

  it("if the targets stop sharing a type, nothing happens", () => {
    const { s: s0, ap, ids, opp } = setup([C.role]);
    const bear = putOnBattlefield(s0, ap, C.bears);
    const giant = putOnBattlefield(s0, opp, C.ogre);
    let s = castNow(s0, ap, ids[0]!, [tgt(bear), tgt(giant)]);
    // The bear becomes a noncreature artifact before it resolves.
    s.effects.push({ id: `x${s.nextId++}`, timestamp: s.nextTimestamp++, controller: ap, sourceName: "test", duration: "endOfTurn", affected: [bear], mods: [{ kind: "setTypes", types: ["Artifact"], subtypes: [] }] });
    invalidateCharacteristics(s);
    s = settle(s);
    expect(controllerOf(s, s.objects[bear]!)).toBe(ap);
    expect(controllerOf(s, s.objects[giant]!)).toBe(opp);
  });
});

describe("Ill-Timed Explosion: X is the greatest mana value among the cards discarded", () => {
  it("discarding a four and a two deals 4 damage to each creature", () => {
    const { s: s0, ap, ids, opp } = setup([C.ite, C.ogre, C.bears]);
    const giant = ids[1]!;
    const smallBear = ids[2]!;
    const mine = putOnBattlefield(s0, ap, C.ogre);
    const theirs = putOnBattlefield(s0, opp, C.cat);
    let s = pass(castNow(s0, ap, ids[0]!));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = pass(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.pending).toMatchObject({ kind: "discard", player: ap, count: 2 });
    s = pass(act(s, { type: "discard", player: ap, objectIds: [giant, smallBear] }));
    s = settle(s);
    expect(zone(s, giant)).toBe("graveyard");
    expect(zone(s, mine)).toBe("graveyard"); // 4 damage to a 3/3
    expect(zone(s, theirs)).toBe("graveyard"); // and to a 2/3
  });

  it("not discarding deals no damage", () => {
    const { s: s0, ap, ids } = setup([C.ite, C.ogre, C.bears]);
    const mine = putOnBattlefield(s0, ap, C.bears);
    let s = pass(castNow(s0, ap, ids[0]!));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(zone(s, mine)).toBe("battlefield");
    expect(s.objects[mine]!.damage ?? 0).toBe(0);
  });
});
