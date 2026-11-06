// Lane B round B114: Vortex Elemental ("~ and each creature blocking or blocked by it" shuffled away, as it last existed
// if it's gone), Lost in the Woods (a Forest on top removes the attacker from combat, the card goes to the bottom), Planar
// Overlay (each player returns a land of each basic land type, a dual land once for two), Total War (destroying the
// attacking player's untapped creatures that didn't attack), Wheel of Sun and Moon (cards headed to the enchanted player's
// graveyard go to the bottom of their library), Dreams of Steel and Oil (a card from the hand and one from the graveyard),
// Worlds Within Worlds (everyone's creatures swapped for creature cards from their hands), Sita Varma, Masked Racer (the
// other creatures' base power and toughness become hers).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions of the players in `me` stop it, others the bots answer. */
const settle = (s: GameState, opts: { me?: PlayerId[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const next = (s: GameState, p: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(p) + n) % 4]!;
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
/** Moves a new card for `def` from the battlefield into `pid`'s `zone` (on top of a library). */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};

// Real oracle text (Scryfall).
const vortex = (): CardDef => ({"oracleId":"4acb586c-dd87-452c-b3d8-728a4396aae6","name":"Vortex Elemental","manaCost":"{U}","cmc":1,"typeLine":"Creature — Elemental","supertypes":[],"types":["Creature"],"subtypes":["Elemental"],"oracleText":"{U}: Put this creature and each creature blocking or blocked by it on top of their owners' libraries, then those players shuffle.\n{3}{U}{U}: Target creature blocks this creature this turn if able.","power":"0","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/c/5cb7ca2b-c5de-4c8a-91cb-8dd8ab5387d8.jpg?1783939563","artUrl":"https://cards.scryfall.io/art_crop/front/5/c/5cb7ca2b-c5de-4c8a-91cb-8dd8ab5387d8.jpg?1783939563","commanderLegal":"legal","set":"bng","releasedAt":"2014-02-07","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const woods = (): CardDef => ({"oracleId":"a354b7f3-bfd0-47c6-bb16-1a5f8e26467d","name":"Lost in the Woods","manaCost":"{3}{G}{G}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a creature attacks you or a planeswalker you control, reveal the top card of your library. If it's a Forest card, remove that creature from combat. Then put the revealed card on the bottom of your library.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/8/5865603c-0a5e-45c3-84e3-2dc3b4cf0cf7.jpg?1783940803","artUrl":"https://cards.scryfall.io/art_crop/front/5/8/5865603c-0a5e-45c3-84e3-2dc3b4cf0cf7.jpg?1783940803","commanderLegal":"legal","set":"dka","releasedAt":"2012-02-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const overlay = (): CardDef => ({"oracleId":"a7be1624-04cc-4ed5-8b05-63b633893dee","name":"Planar Overlay","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each player chooses a land they control of each basic land type. Return those lands to their owners' hands.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/3/1315fef0-234e-44f5-a7a3-bf3db78943c3.jpg?1783945624","artUrl":"https://cards.scryfall.io/art_crop/front/1/3/1315fef0-234e-44f5-a7a3-bf3db78943c3.jpg?1783945624","commanderLegal":"legal","set":"pls","releasedAt":"2001-02-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const war = (): CardDef => ({"oracleId":"8266dd1c-e262-4467-a893-6b3b5eedb427","name":"Total War","manaCost":"{3}{R}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a player attacks with one or more creatures, destroy all untapped non-Wall creatures that player controls that didn't attack, except for creatures the player hasn't controlled continuously since the beginning of the turn.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/1/6107388b-ec1e-401e-a407-a821c908ed8d.jpg?1783947482","artUrl":"https://cards.scryfall.io/art_crop/front/6/1/6107388b-ec1e-401e-a407-a821c908ed8d.jpg?1783947482","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const wheel = (): CardDef => ({"oracleId":"6b6e4ee2-52e6-452b-af15-c90eab5fc746","name":"Wheel of Sun and Moon","manaCost":"{G/W}{G/W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant player\nIf a card would be put into enchanted player's graveyard from anywhere, instead that card is revealed and put on the bottom of that player's library.","colors":["G","W"],"colorIdentity":["G","W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/2/5/25d6d636-51f1-4f98-94af-5307c3399dae.jpg?1783919214","artUrl":"https://cards.scryfall.io/art_crop/front/2/5/25d6d636-51f1-4f98-94af-5307c3399dae.jpg?1783919214","commanderLegal":"legal","set":"sld","releasedAt":"2022-11-28","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const dreams = (): CardDef => ({"oracleId":"8c308ebf-df5e-4f47-9b97-5c31944fe91c","name":"Dreams of Steel and Oil","manaCost":"{B}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target opponent reveals their hand. You choose an artifact or creature card from it, then choose an artifact or creature card from their graveyard. Exile the chosen cards.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/6/261ac92e-c61a-4c11-aa6a-9ae1cb703e5c.jpg?1783920092","artUrl":"https://cards.scryfall.io/art_crop/front/2/6/261ac92e-c61a-4c11-aa6a-9ae1cb703e5c.jpg?1783920092","commanderLegal":"legal","set":"bro","releasedAt":"2022-11-18","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const worlds = (): CardDef => ({"oracleId":"e25062ba-7176-4d59-ac3e-26d19b26f02a","name":"Worlds Within Worlds","manaCost":"{5}{G}{U}","cmc":7,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Exile all creatures. Each player may put any number of creature cards from their hand onto the battlefield. Then put all cards exiled this way into their owners' hands. Exile Worlds Within Worlds.","colors":["G","U"],"colorIdentity":["G","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/7/4765e39c-cbf2-4605-9bf1-3baad7d92cfb.jpg?1783902892","artUrl":"https://cards.scryfall.io/art_crop/front/4/7/4765e39c-cbf2-4605-9bf1-3baad7d92cfb.jpg?1783902892","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sita = (): CardDef => ({"oracleId":"3b9bc41a-a43f-4be7-9452-f61f5ad5b482","name":"Sita Varma, Masked Racer","manaCost":"{G}{U}","cmc":2,"typeLine":"Legendary Creature — Human Rogue","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Rogue"],"oracleText":"Exhaust — {X}{G}{G}{U}: Put X +1/+1 counters on Sita Varma. Then you may have the base power and toughness of each other creature you control become equal to Sita Varma's power until end of turn. (Activate each exhaust ability only once.)","power":"2","toughness":"3","colors":["G","U"],"colorIdentity":["G","U"],"keywords":["Exhaust"],"imageUrl":"https://cards.scryfall.io/normal/front/e/b/eb523c06-6f3e-4e19-b777-19aefc4a4e02.jpg?1783907851","artUrl":"https://cards.scryfall.io/art_crop/front/e/b/eb523c06-6f3e-4e19-b777-19aefc4a4e02.jpg?1783907851","commanderLegal":"legal","set":"dft","releasedAt":"2025-02-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const gomazoa = (): CardDef => ({"oracleId":"0c82ae16-f995-4ac3-adb4-a5cc93a6e6f2","name":"Gomazoa","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Jellyfish","supertypes":[],"types":["Creature"],"subtypes":["Jellyfish"],"oracleText":"Defender, flying\n{T}: Put this creature and each creature it's blocking on top of their owners' libraries, then those players shuffle.","power":"0","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Defender"],"imageUrl":"https://cards.scryfall.io/normal/front/1/1/119d2661-ba22-4901-b89a-a0a8ec25d004.jpg?1783942165","artUrl":"https://cards.scryfall.io/art_crop/front/1/1/119d2661-ba22-4901-b89a-a0a8ec25d004.jpg?1783942165","commanderLegal":"legal","set":"zen","releasedAt":"2009-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const garruk = (): CardDef => ({"oracleId":"fc762e40-84c1-4762-82f7-a0fc4f6fd522","name":"Garruk, Savage Herald","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Legendary Planeswalker — Garruk","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Garruk"],"oracleText":"+1: Reveal the top card of your library. If it's a creature card, put it into your hand. Otherwise, put it on the bottom of your library.\n−2: Target creature you control deals damage equal to its power to another target creature.\n−7: Until end of turn, creatures you control gain \"You may have this creature assign its combat damage as though it weren't blocked.\"","loyalty":"5","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/8/48133629-4a5b-4c91-b496-2ee94f6cbc4c.jpg?1783930617","artUrl":"https://cards.scryfall.io/art_crop/front/4/8/48133629-4a5b-4c91-b496-2ee94f6cbc4c.jpg?1783930617","commanderLegal":"legal","set":"m21","releasedAt":"2020-07-03","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;

// Test cards.
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { cmc: 3, power: "3", toughness: "3", colors: ["R"] });
const wall = card("Test Wall", "Creature — Wall", "{1}{W}", { cmc: 2, power: "0", toughness: "4", colors: ["W"], keywords: ["Defender"], oracleText: "Defender" });
const watcher = card("Test Watcher", "Creature — Human", "{1}{W}", { cmc: 2, power: "2", toughness: "2", colors: ["W"], keywords: ["Vigilance"], oracleText: "Vigilance" });
const kill = card("Test Kill", "Instant", "{0}", { oracleText: "Destroy target creature." });
const rock = card("Test Rock", "Artifact", "{1}", { cmc: 1 });
const bayou = card("Test Bayou", "Land — Swamp Forest");
const swampCard = card("Test Swamp", "Basic Land — Swamp", "", { supertypes: ["Basic"] });
const elf = card("Test Elf Maker", "Sorcery", "{0}", { oracleText: "Create a 1/1 green Elf Warrior creature token." });


/** To `pid`'s declare blockers question in this combat, after `ap` attacked. */
const toBlocks = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 200 && !(s.pending?.kind === "declareBlockers" && s.pending.player === pid); i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

describe("Lane B round B114", () => {
  it("all eight cards are supported, Gomazoa still", () => supported(vortex(), woods(), overlay(), war(), wheel(), dreams(), worlds(), sita(), gomazoa()));

  it("Vortex Elemental: it and the creature blocking it are shuffled into their owners' libraries", () => {
    let { s, ap, opp } = setup([]);
    const v = putOnBattlefield(s, ap, vortex());
    const b = putOnBattlefield(s, opp, ogre);
    const other = putOnBattlefield(s, opp, bear());
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: v, defender: opp }] });
    s = toBlocks(s, opp);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b, attacker: v }] });
    s = settle(s, { me: [ap] });
    s.players[ap]!.manaPool.U = 1;
    s = settle(run(s, planActivate(s, ap, v, 0, [])));
    expect(zone(s, v)).toBe("library");
    expect(zone(s, b)).toBe("library");
    expect(s.players[opp]!.library).toContain(b);
    expect(zone(s, other)).toBe("battlefield");
  });

  it("Vortex Elemental: outside combat only itself; gone before it resolves, its blocker still goes (rulings)", () => {
    let { s, ap, opp, ids } = setup([kill]);
    const v = putOnBattlefield(s, ap, vortex());
    const b = putOnBattlefield(s, opp, ogre);
    s.players[ap]!.manaPool.U = 1;
    s = settle(run(s, planActivate(s, ap, v, 0, [])));
    expect(zone(s, v)).toBe("library");
    expect(zone(s, b)).toBe("battlefield");
    // Again, blocked, and destroyed in response: the creature that was blocking it is still put away.
    const v2 = putOnBattlefield(s, ap, vortex());
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: v2, defender: opp }] });
    s = toBlocks(s, opp);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: b, attacker: v2 }] });
    s = settle(s, { me: [ap] });
    s.players[ap]!.manaPool.U = 1;
    s = run(s, planActivate(s, ap, v2, 0, []));
    s = run(s, planCast(s, ap, ids[0]!, [tgt(v2)]));
    s = settle(s);
    expect(zone(s, v2)).toBe("graveyard");
    expect(zone(s, b)).toBe("library");
  });

  it("Gomazoa: gone before it resolves, the attacker it was blocking still goes", () => {
    let { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, ap, ogre);
    const g = putOnBattlefield(s, opp, gomazoa());
    const k = into(s, opp, kill, "hand");
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    s = toBlocks(s, opp);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: g, attacker: a }] });
    // The active player passes; the defending player activates it, then destroys it in response.
    s = act(s, { type: "passPriority", player: ap });
    for (let i = 0; i < 4 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planActivate(s, opp, g, 0, []));
    s = run(s, planCast(s, opp, k, [tgt(g)]));
    s = settle(s);
    expect(zone(s, g)).toBe("graveyard");
    expect(zone(s, a)).toBe("library");
  });

  it("Lost in the Woods: a Forest on top removes the attacker from combat, either way the card goes to the bottom", () => {
    for (const isForest of [true, false]) {
      let { s, ap, opp } = setup([]);
      putOnBattlefield(s, opp, woods());
      const a = putOnBattlefield(s, ap, ogre);
      const top = into(s, opp, isForest ? forest : bear(), "library");
      s = passUntil(s, "declareAttackers", ap);
      s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] }));
      expect(s.objects[a]!.attacking === undefined, String(isForest)).toBe(isForest);
      // Removed from combat it stays tapped (rulings).
      expect(s.objects[a]!.tapped).toBe(true);
      expect(s.players[opp]!.library.at(-1)).toBe(top);
      expect(s.players[opp]!.library[0]).not.toBe(top);
    }
  });

  it("Lost in the Woods: not for a creature attacking another player", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, opp, woods());
    const a = putOnBattlefield(s, ap, ogre);
    const top = into(s, opp, forest, "library");
    s = passUntil(s, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: next(s, ap, 2) }] }));
    expect(s.objects[a]!.attacking).toBe(next(s, ap, 2));
    expect(s.players[opp]!.library[0]).toBe(top);
  });

  it("Planar Overlay: each player returns a land of each basic land type they control; a dual land counts for both", () => {
    let { s, ap, opp, ids } = setup([overlay()]);
    const dual = putOnBattlefield(s, opp, bayou);
    const theirForest = putOnBattlefield(s, opp, forest);
    const third = next(s, ap, 2);
    const lone = putOnBattlefield(s, third, swampCard);
    const lands = () => s.battlefield.filter((id) => s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).types.includes("Land")).length;
    const before = lands();
    s = settle(run(s, planCast(s, ap, ids[0]!, [])), { me: [ap] });
    // Your own choice for each type: one Plains of three, and so on.
    const asked: string[] = [];
    for (let i = 0; i < 5 && s.pending?.kind === "pickPermanents" && s.pending.player === ap; i++) {
      const p = s.pending;
      expect(p.action).toBe("bounce");
      expect(p.count).toBe(1);
      asked.push(p.what);
      s = settle(act(s, { type: "pickPermanents", player: ap, ids: [p.options[0]!] }), { me: [ap] });
    }
    expect(asked.sort()).toEqual(["Forest", "Island", "Mountain", "Plains", "Swamp"]);
    s = settle(s);
    expect(lands()).toBe(before - 5);
    // The bot returns its dual land for both Swamp and Forest, keeping its Forest.
    expect(zone(s, dual)).toBe("hand");
    expect(zone(s, theirForest)).toBe("battlefield");
    expect(zone(s, lone)).toBe("hand");
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });

  it("Total War: the attacking player's untapped creatures that didn't attack are destroyed, not tapped ones, Walls, new ones or attackers", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, opp, war());
    const attacker = putOnBattlefield(s, ap, ogre);
    const vig = putOnBattlefield(s, ap, watcher);
    const stay = putOnBattlefield(s, ap, bear());
    const tapped = putOnBattlefield(s, ap, bear({ name: "Tapped Bear" }));
    s.objects[tapped]!.tapped = true;
    const w = putOnBattlefield(s, ap, wall);
    const theirs = putOnBattlefield(s, opp, bear());
    s = passUntil(s, "declareAttackers", ap);
    // One gained this turn: not controlled since the turn began.
    const fresh = putOnBattlefield(s, ap, bear({ name: "Fresh Bear" }), { sick: true });
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender: opp }, { attacker: vig, defender: opp }] }));
    expect(zone(s, stay)).toBe("graveyard");
    for (const id of [attacker, vig, tapped, w, fresh, theirs]) expect(zone(s, id), s.objects[id]!.cardId).toBe("battlefield");
  });

  it("Total War: no attack, no trigger", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, opp, war());
    const stay = putOnBattlefield(s, ap, bear());
    s = passUntil(passUntil(s, "end", ap), "main1", next(s, ap));
    expect(zone(s, stay)).toBe("battlefield");
  });

  it("Wheel of Sun and Moon: cards headed to the enchanted player's graveyard go to the bottom of their library instead, not tokens or others' cards", () => {
    let { s, ap, opp, ids } = setup([kill, elf, kill]);
    const w = putOnBattlefield(s, ap, wheel());
    s.objects[w]!.attachedToPlayer = ap;
    invalidateCharacteristics(s);
    const mine = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, bear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(mine)])));
    // The creature and the spell itself.
    expect(zone(s, mine)).toBe("library");
    expect(zone(s, ids[0]!)).toBe("library");
    expect(s.players[ap]!.library.slice(-2).sort()).toEqual([ids[0]!, mine].sort());
    expect(s.players[ap]!.graveyard).toEqual([]);
    // A token goes to the graveyard and ceases to exist.
    s = settle(run(s, planCast(s, ap, ids[1]!, [])));
    expect(zone(s, ids[1]!)).toBe("library");
    const token = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    s = settle(run(s, planCast(s, ap, ids[2]!, [tgt(token)])));
    expect(s.objects[token]?.zone ?? "gone").not.toBe("library");
    // Another player's card goes to their graveyard as usual.
    const k2 = into(s, ap, kill, "hand");
    s = settle(run(s, planCast(s, ap, k2, [tgt(theirs)])));
    expect(zone(s, theirs)).toBe("graveyard");
  });

  it("Wheel of Sun and Moon on an opponent: their discarded cards go to the bottom of their library", () => {
    let { s, ap, opp } = setup([]);
    const w = putOnBattlefield(s, ap, wheel());
    s.objects[w]!.attachedToPlayer = opp;
    invalidateCharacteristics(s);
    const theirs = putOnBattlefield(s, opp, bear());
    const k = into(s, ap, kill, "hand");
    s = settle(run(s, planCast(s, ap, k, [tgt(theirs)])));
    expect(zone(s, theirs)).toBe("library");
    expect(s.players[opp]!.library.at(-1)).toBe(theirs);
    expect(zone(s, k)).toBe("graveyard");
  });

  it("Dreams of Steel and Oil: you choose an artifact or creature card from the hand and one from the graveyard, both exiled", () => {
    let { s, ap, opp, ids } = setup([dreams()]);
    s.players[opp]!.hand = [];
    const h1 = into(s, opp, bear(), "hand");
    const h2 = into(s, opp, rock, "hand");
    const land = into(s, opp, forest, "hand");
    const g1 = into(s, opp, ogre, "graveyard");
    const g2 = into(s, opp, kill, "graveyard");
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    let p = s.pending!;
    if (p.kind !== "searchLibrary") throw new Error("no choice");
    expect(p.cards.sort()).toEqual([h1, h2].sort());
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [h2] }), { me: [ap] });
    p = s.pending!;
    if (p?.kind !== "searchLibrary") throw new Error("no graveyard choice");
    expect(p.cards).toEqual([g1]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [g1] }));
    expect(zone(s, h2)).toBe("exile");
    expect(zone(s, g1)).toBe("exile");
    for (const id of [h1, land]) expect(zone(s, id)).toBe("hand");
    expect(zone(s, g2)).toBe("graveyard");
  });

  it("Dreams of Steel and Oil: with none in the hand, still one from the graveyard (rulings)", () => {
    let { s, ap, opp, ids } = setup([dreams()]);
    s.players[opp]!.hand = [];
    const land = into(s, opp, forest, "hand");
    const g1 = into(s, opp, ogre, "graveyard");
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])), { me: [ap] });
    if (s.pending?.kind === "searchLibrary") s = settle(act(s, { type: "searchLibrary", player: ap, found: s.pending.cards.slice(0, 1) }));
    expect(zone(s, g1)).toBe("exile");
    expect(zone(s, land)).toBe("hand");
  });

  it("Worlds Within Worlds: creatures exiled, creature cards put from hands, the exiled cards to their owners' hands", () => {
    let { s, ap, opp, ids } = setup([worlds(), elf]);
    s = settle(run(s, planCast(s, ap, ids[1]!, [])));
    const token = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    const mine = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, ogre);
    const inHand = into(s, ap, watcher, "hand");
    const theirHand = into(s, opp, bear(), "hand");
    s.players[ap]!.manaPool.C = 7;
    s = settle(run(s, planCast(s, ap, ids[0]!, [])), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const p = s.pending!;
    if (p.kind !== "searchLibrary") throw new Error("no choice");
    // Only creature cards from the hand; the exiled ones aren't back yet.
    expect(p.cards).toContain(inHand);
    expect(p.cards).not.toContain(mine);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [inHand] }));
    expect(zone(s, inHand)).toBe("battlefield");
    expect(zone(s, mine)).toBe("hand");
    expect(zone(s, theirs)).toBe("hand");
    expect(s.objects[token]?.zone ?? "gone").not.toBe("battlefield");
    expect(s.objects[token]?.zone ?? "gone").not.toBe("hand");
    // The bot put its creature card in.
    expect(zone(s, theirHand)).toBe("battlefield");
    expect(zone(s, ids[0]!)).toBe("exile");
  });

  it("Sita Varma: X counters, then if you like the other creatures' base power and toughness become her power until end of turn", () => {
    for (const yes of [true, false]) {
      let { s, ap } = setup([]);
      const sv = putOnBattlefield(s, ap, sita());
      const b = putOnBattlefield(s, ap, bear());
      const o = putOnBattlefield(s, ap, ogre);
      s.objects[b]!.counters["+1/+1"] = 1;
      invalidateCharacteristics(s);
      s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, G: 2, U: 1, C: 3 };
      s = settle(run(s, planActivate(s, ap, sv, 0, [], undefined, undefined, 3)), { me: [ap] });
      expect(pt(s, sv)).toBe("5/6");
      expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
      s = settle(act(s, { type: "chooseMay", player: ap, yes }));
      // The counter still applies on top of the new base (layer 7c after 7b).
      expect(pt(s, b), String(yes)).toBe(yes ? "6/6" : "3/3");
      expect(pt(s, o)).toBe(yes ? "5/5" : "3/3");
      // Locked in: more counters on her later don't change them.
      s.objects[sv]!.counters["+1/+1"] = 5;
      invalidateCharacteristics(s);
      expect(pt(s, o)).toBe(yes ? "5/5" : "3/3");
      // Exhaust: only once.
      s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, G: 2, U: 1 };
      expect(planActivate(s, ap, sv, 0, [], undefined, undefined, 0)).toBeNull();
      s = passUntil(s, "end", ap);
      s = passUntil(s, "upkeep", next(s, ap));
      expect(pt(s, o)).toBe("3/3");
    }
  });

  it("fix: a revealed card that's put on the bottom of the library really goes there (Garruk, Savage Herald's +1)", () => {
    let { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, garruk());
    s.objects[g]!.counters.loyalty = 5;
    invalidateCharacteristics(s);
    const top = into(s, ap, forest, "library");
    s = settle(run(s, planActivate(s, ap, g, 0, [])));
    expect(s.players[ap]!.library.at(-1)).toBe(top);
    expect(s.players[ap]!.library[0]).not.toBe(top);
    // A creature card goes to the hand.
    const b = into(s, ap, bear(), "library");
    s = passUntil(passUntil(s, "end", ap), "main1", ap);
    s.players[ap]!.library.splice(s.players[ap]!.library.indexOf(b), 1);
    s.players[ap]!.library.unshift(b);
    s = settle(run(s, planActivate(s, ap, g, 0, [])));
    expect(zone(s, b)).toBe("hand");
  });
});
