// Round 316 (Lane A, skip-list cards): Toggo, Goblin Weaponsmith (a Rock Equipment token whose granted ability sacrifices
// that Rock, CR 201.5a), Quintorius Kand's −6 (any number of graveyard cards exiled, {R} each, playable this turn),
// Firkraag, Cunning Instigator ("attack an opponent" and "if that creature had to attack this combat", CR 508.1d),
// Radiant Lotus (sacrifice one or more artifacts, target player adds the mana), Fiery Annihilation (an Equipment target
// attached to the creature target), Stoic Farmer (where the Plains goes decided as it's put there) and Heroic Feast (up to
// as many targets as the life gained).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, applyAction, botActions, castProblem, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) s = act(s, botActions(s, p.player)[0]!);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
/** A copy of `def` in `pid`'s hand, graveyard or library (on top). */
const inZone = (s: GameState, pid: PlayerId, def: CardDef, where: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const tapLands = (s: GameState, pid: PlayerId) => {
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    if (o.controller === pid && s.cards[o.cardId]!.types.includes("Land")) o.tapped = true;
  }
};
const named = (s: GameState, name: string) => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]?.name === name);
const tgt = (id: string) => ({ kind: "object" as const, id });
const ply = (id: PlayerId) => ({ kind: "player" as const, id });
const nextOf = (s: GameState, p: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(p) + 1) % s.turnOrder.length]!;

// Real oracle text (Scryfall).
const toggo = (): CardDef => ({"oracleId":"d334717a-f3a8-4ffa-bdc9-44ae7bdcc772","name":"Toggo, Goblin Weaponsmith","manaCost":"{2}{R}","cmc":3,"typeLine":"Legendary Creature — Goblin Artificer","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Goblin","Artificer"],"oracleText":"Landfall — Whenever a land you control enters, create a colorless Equipment artifact token named Rock with \"Equipped creature has '{1}, {T}, Sacrifice Rock: This creature deals 2 damage to any target'\" and equip {1}.\nPartner (You can have two commanders if both have partner.)","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Partner","Landfall"],"imageUrl":"https://cards.scryfall.io/normal/front/1/a/1a05b3e2-259e-4fce-92ee-c00660e22ae7.jpg?1783928805","artUrl":"https://cards.scryfall.io/art_crop/front/1/a/1a05b3e2-259e-4fce-92ee-c00660e22ae7.jpg?1783928805","commanderLegal":"legal","set":"cmr","releasedAt":"2020-11-20","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const quintorius = (): CardDef => ({"oracleId":"91babc5f-ebeb-4894-8c35-b0f60249cb80","name":"Quintorius Kand","manaCost":"{3}{R}{W}","cmc":5,"typeLine":"Legendary Planeswalker — Quintorius","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Quintorius"],"oracleText":"Whenever you cast a spell from exile, Quintorius Kand deals 2 damage to each opponent and you gain 2 life.\n+1: Create a 3/2 red and white Spirit creature token.\n−3: Discover 4.\n−6: Exile any number of target cards from your graveyard. Add {R} for each card exiled this way. You may play those cards this turn.","loyalty":"4","colors":["R","W"],"colorIdentity":["R","W"],"keywords":["Discover"],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/4382fa49-9e34-45b3-8495-4916dcd995ec.jpg?1783913728","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/4382fa49-9e34-45b3-8495-4916dcd995ec.jpg?1783913728","commanderLegal":"legal","set":"lci","releasedAt":"2023-11-17","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const firkraag = (): CardDef => ({"oracleId":"81dad7c5-5950-4c45-adb0-cf1a15a74250","name":"Firkraag, Cunning Instigator","manaCost":"{3}{U}{R}","cmc":5,"typeLine":"Legendary Creature — Dragon","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying, haste\nWhenever one or more Dragons you control attack an opponent, goad target creature that player controls.\nWhenever a creature deals combat damage to one of your opponents, if that creature had to attack this combat, you put a +1/+1 counter on Firkraag and you draw a card.","power":"3","toughness":"3","colors":["R","U"],"colorIdentity":["R","U"],"keywords":["Flying","Goad","Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/b/5/b55e624b-6f6a-42ae-89aa-0cc62ee55a31.jpg?1783922517","artUrl":"https://cards.scryfall.io/art_crop/front/b/5/b55e624b-6f6a-42ae-89aa-0cc62ee55a31.jpg?1783922517","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const lotus = (): CardDef => ({"oracleId":"307be184-176a-40a8-944c-48aa00cfdd29","name":"Radiant Lotus","manaCost":"{6}","cmc":6,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}, Sacrifice one or more artifacts: Choose a color. Target player adds three mana of the chosen color for each artifact sacrificed this way. (Activate only as an instant.)","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/b/e/be6dac83-39c2-40dc-a322-76a3ea4e7aee.jpg?1783907846","artUrl":"https://cards.scryfall.io/art_crop/front/b/e/be6dac83-39c2-40dc-a322-76a3ea4e7aee.jpg?1783907846","commanderLegal":"legal","set":"dft","releasedAt":"2025-02-14","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const annihilation = (): CardDef => ({"oracleId":"d44f3724-17b7-48f0-885d-75292669f971","name":"Fiery Annihilation","manaCost":"{2}{R}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Fiery Annihilation deals 5 damage to target creature. Exile up to one target Equipment attached to that creature. If that creature would die this turn, exile it instead.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/4/54fe00aa-d284-48f9-b5a2-1bd4c5fa8e58.jpg?1783909102","artUrl":"https://cards.scryfall.io/art_crop/front/5/4/54fe00aa-d284-48f9-b5a2-1bd4c5fa8e58.jpg?1783909102","commanderLegal":"legal","set":"fdn","releasedAt":"2024-11-15","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const farmer = (): CardDef => ({"oracleId":"42820e09-f817-4485-a96a-ac2b0b798269","name":"Stoic Farmer","manaCost":"{3}{W}","cmc":4,"typeLine":"Creature — Dwarf Peasant","supertypes":[],"types":["Creature"],"subtypes":["Dwarf","Peasant"],"oracleText":"When this creature enters, search your library for a basic Plains card and reveal it. If an opponent controls more lands than you, put it onto the battlefield tapped. Otherwise, put it into your hand. Then shuffle.\nForetell {1}{W} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)","power":"3","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":["Foretell"],"imageUrl":"https://cards.scryfall.io/normal/front/f/5/f53f39e9-f07e-444f-8420-4545e56253e5.jpg?1783928340","artUrl":"https://cards.scryfall.io/art_crop/front/f/5/f53f39e9-f07e-444f-8420-4545e56253e5.jpg?1783928340","commanderLegal":"legal","set":"khc","releasedAt":"2021-02-05","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const feast = (): CardDef => ({"oracleId":"31cae00a-3a74-4a59-80b0-a656f524e878","name":"Heroic Feast","manaCost":"{2}{G}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, create a Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\nWhenever you gain life, choose up to that many target creatures you control. Put a +1/+1 counter on each of them.","colors":["G"],"colorIdentity":["G"],"keywords":["Food"],"imageUrl":"https://cards.scryfall.io/normal/front/3/2/32d05c3d-cf03-492e-a956-2e77c36e36c4.jpg?1783902917","artUrl":"https://cards.scryfall.io/art_crop/front/3/2/32d05c3d-cf03-492e-a956-2e77c36e36c4.jpg?1783902917","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const boreas = (): CardDef => ({"oracleId":"f6dae324-cc79-4093-8cce-667015c1de6d","name":"Boreas Charger","manaCost":"{2}{W}","cmc":3,"typeLine":"Creature — Pegasus","supertypes":[],"types":["Creature"],"subtypes":["Pegasus"],"oracleText":"Flying\nWhen this creature leaves the battlefield, choose an opponent who controls more lands than you. Search your library for a number of Plains cards equal to the difference, reveal those cards, put one of them onto the battlefield tapped and the rest into your hand, then shuffle.","power":"2","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/5/c/5cd3b85b-7d8d-402e-829a-6080fd4eb7a1.jpg?1783934345","artUrl":"https://cards.scryfall.io/art_crop/front/5/c/5cd3b85b-7d8d-402e-829a-6080fd4eb7a1.jpg?1783934345","commanderLegal":"legal","set":"c18","releasedAt":"2018-08-10","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"} as CardDef);
const thing = (name: string) => card(name, "Artifact", "{1}");
const gear = (name: string) => card(name, "Artifact — Equipment", "{1}", { oracleText: "Equipped creature gets +1/+1.\nEquip {1}" });
const testPlains = card("Plains", "Basic Land — Plains", "", { supertypes: ["Basic"] });
const testForest = card("Forest", "Basic Land — Forest", "", { supertypes: ["Basic"] });

describe("round 316", () => {
  it("are fully supported", () => supported(toggo(), quintorius(), firkraag(), lotus(), annihilation(), farmer(), feast(), boreas()));
});

describe("round 316: Toggo, Goblin Weaponsmith", () => {
  it("makes a Rock at landfall; the equipped creature's ability sacrifices that Rock and deals the damage itself", () => {
    const { s: s0, ap, opp } = setup([testForest]);
    putOnBattlefield(s0, ap, toggo());
    const b = putOnBattlefield(s0, ap, bear({ name: "Test Bear" }));
    let s = settle(act(s0, { type: "playLand", player: ap, objectId: s0.players[ap]!.hand.at(-1)! }), ap);
    let rocks = named(s, "Rock");
    expect(rocks.length).toBe(1);
    const rock = s.objects[rocks[0]!]!;
    expect(rock.isToken).toBe(true);
    expect(s.cards[rock.cardId]!.subtypes).toContain("Equipment");
    // Equip {1}, then the bear has "{1}, {T}, Sacrifice Rock: This creature deals 2 damage to any target".
    s = settle(run(s, planActivate(s, ap, rocks[0]!, 0, [tgt(b)])), ap);
    expect(s.objects[rocks[0]!]!.attachedTo).toBe(b);
    const granted = abilitiesOf(s, s.objects[b]!).activated.findIndex((a) => /Sacrifice/.test(a.text ?? ""));
    expect(granted).toBeGreaterThanOrEqual(0);
    const life = s.players[opp]!.life;
    s = settle(run(s, planActivate(s, ap, b, granted, [ply(opp)])), ap);
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(s.objects[b]!.tapped).toBe(true);
    rocks = named(s, "Rock");
    expect(rocks.length).toBe(0);
    // The creature, not Rock, deals the damage (rulings).
    expect(s.log.some((l) => /Test Bear deals 2 damage/.test(typeof l === "string" ? l : JSON.stringify(l)))).toBe(true);
  });

  it("with two Rocks on one creature, each granted ability sacrifices its own Rock (CR 201.5a)", () => {
    const { s: s0, ap, opp } = setup([testForest]);
    putOnBattlefield(s0, ap, toggo());
    let s = settle(act(s0, { type: "playLand", player: ap, objectId: s0.players[ap]!.hand.at(-1)! }), ap);
    const b = putOnBattlefield(s, ap, bear({ name: "Test Bear" }));
    // Another land entering makes a second Rock.
    const land = inZone(s, ap, testForest, "hand");
    s.players[ap]!.landsPlayedThisTurn = 0;
    s = settle(act(s, { type: "playLand", player: ap, objectId: land }), ap);
    const [r1, r2] = named(s, "Rock");
    expect(r2).toBeDefined();
    s.players[ap]!.manaPool.C = 4;
    s = settle(run(s, planActivate(s, ap, r1!, 0, [tgt(b)])), ap);
    s = settle(run(s, planActivate(s, ap, r2!, 0, [tgt(b)])), ap);
    const grants = abilitiesOf(s, s.objects[b]!).activated.flatMap((a, i) => (/Sacrifice/.test(a.text ?? "") ? [i] : []));
    expect(grants.length).toBe(2);
    s = settle(run(s, planActivate(s, ap, b, grants[1]!, [ply(opp)])), ap);
    const left = named(s, "Rock");
    expect(left.length).toBe(1);
    expect(s.objects[left[0]!]!.attachedTo).toBe(b);
  });
});

describe("round 316: Quintorius Kand", () => {
  it("−6 exiles any number of target cards from your graveyard, adds {R} for each, and you may play them this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const q = putOnBattlefield(s0, ap, quintorius());
    s0.objects[q]!.counters.loyalty = 7;
    const b = inZone(s0, ap, bolt(), "graveyard");
    const land = inZone(s0, ap, testForest, "graveyard");
    const stays = inZone(s0, ap, bolt(), "graveyard");
    s0.players[ap]!.landsPlayedThisTurn = 0;
    tapLands(s0, ap);
    const idx = abilitiesOf(s0, s0.objects[q]!).activated.findIndex((a) => a.loyalty === -6);
    let s = settle(run(s0, planActivate(s0, ap, q, idx, [tgt(b), tgt(land)])), ap);
    expect(zone(s, b)).toBe("exile");
    expect(zone(s, land)).toBe("exile");
    expect(zone(s, stays)).toBe("graveyard");
    expect(s.players[ap]!.manaPool.R).toBe(2);
    expect(s.objects[b]!.mayPlay?.until).toBe("thisTurn");
    // Cast from exile with that mana: Quintorius's first ability triggers too (2 damage to each opponent).
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, b, [ply(opp)])), ap);
    expect(s.players[opp]!.life).toBe(life - 3 - 2);
    // The land is played from exile with the land play.
    s = settle(act(s, { type: "playLand", player: ap, objectId: land }), ap);
    expect(zone(s, land)).toBe("battlefield");
  });

  it("the permission ends with the turn", () => {
    const { s: s0, ap } = setup([]);
    const q = putOnBattlefield(s0, ap, quintorius());
    s0.objects[q]!.counters.loyalty = 6;
    const b = inZone(s0, ap, bolt(), "graveyard");
    const idx = abilitiesOf(s0, s0.objects[q]!).activated.findIndex((a) => a.loyalty === -6);
    let s = settle(run(s0, planActivate(s0, ap, q, idx, [tgt(b)])), ap);
    expect(zone(s, b)).toBe("exile");
    expect(s.players[ap]!.manaPool.R).toBe(1);
    s = passUntil(s, "upkeep", nextOf(s, ap));
    s.players[ap]!.manaPool.R = 1;
    expect(castProblem(s, ap, b)).not.toBeNull();
  });
});

describe("round 316: Firkraag, Cunning Instigator", () => {
  it("its attack goads a creature that player controls; damage by a creature that had to attack grows Firkraag and draws (CR 508.1d)", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, firkraag());
    const opp = nextOf(s0, ap);
    const third = nextOf(s0, opp);
    const goaded = putOnBattlefield(s0, opp, bear({ name: "Goaded Bear" }));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: f, defender: opp }] });
    s = settle(s);
    expect(s.objects[goaded]!.attacking).toBeUndefined();
    // A creature that wasn't goaded attacks too, on its controller's turn.
    const free = putOnBattlefield(s, opp, bear({ name: "Free Bear" }));
    s = passUntil(s, "declareAttackers", opp);
    expect(s.pending?.kind).toBe("declareAttackers");
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: goaded, defender: third }, { attacker: free, defender: third }] });
    const hand = s.players[ap]!.hand.length;
    const counters = s.objects[f]!.counters["+1/+1"] ?? 0;
    s = passUntil(s, "main2", opp);
    // Only the goaded bear "had to attack": one counter and one card.
    expect(s.objects[f]!.counters["+1/+1"] ?? 0).toBe(counters + 1);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("a goaded creature attacking you isn't dealing damage to one of your opponents; one with no requirement doesn't count", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, firkraag());
    const opp = nextOf(s0, ap);
    const third = nextOf(s0, opp);
    const free = putOnBattlefield(s0, opp, bear({ name: "Free Bear" }));
    let s = passUntil(s0, "declareAttackers", opp);
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: free, defender: third }] });
    const hand = s.players[ap]!.hand.length;
    s = passUntil(s, "main2", opp);
    expect(s.objects[f]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(s.players[ap]!.hand.length).toBe(hand);
  });
});

describe("round 316: Radiant Lotus", () => {
  it("sacrifices one or more artifacts, itself too; you choose the color and the target player adds three of it for each", () => {
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, lotus());
    const a1 = putOnBattlefield(s0, ap, thing("Test Trinket"));
    const a2 = putOnBattlefield(s0, ap, thing("Test Bauble"));
    // At least one artifact (X can't be 0).
    expect(planActivate(s0, ap, l, 0, [ply(opp)], undefined, undefined, 0, { sacrifice: [] })).toBeNull();
    let s = run(s0, planActivate(s0, ap, l, 0, [ply(opp)], undefined, undefined, 2, { sacrifice: [l, a1] }));
    expect(zone(s, l)).toBe("graveyard");
    expect(zone(s, a1)).toBe("graveyard");
    expect(zone(s, a2)).toBe("battlefield");
    // It has a target, so it isn't a mana ability: it uses the stack (CR 605.1a).
    expect(s.stack.length).toBe(1);
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "color" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Green" }), ap);
    expect(s.players[opp]!.manaPool.G).toBe(6);
    expect(s.players[ap]!.manaPool.G ?? 0).toBe(0);
  });
});

describe("round 316: Fiery Annihilation", () => {
  it("deals 5 damage, exiles an Equipment attached to that creature, and the creature is exiled instead of dying", () => {
    const { s: s0, ap, ids } = setup([annihilation()]);
    const opp = nextOf(s0, ap);
    const big = putOnBattlefield(s0, opp, bear({ name: "Test Giant", power: "4", toughness: "4" }));
    const eq = putOnBattlefield(s0, opp, gear("Test Blade"));
    const other = putOnBattlefield(s0, opp, gear("Loose Blade"));
    s0.objects[eq]!.attachedTo = big;
    invalidateCharacteristics(s0);
    // Only an Equipment attached to that creature can be the second target.
    expect(planCast(s0, ap, ids[0]!, [tgt(big), tgt(other)])).toBeNull();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(big), tgt(eq)])), ap);
    expect(zone(s, big)).toBe("exile");
    expect(zone(s, eq)).toBe("exile");
    expect(zone(s, other)).toBe("battlefield");
  });

  it("with the creature an illegal target as it resolves, the Equipment isn't exiled (rulings)", () => {
    const { s: s0, ap, ids } = setup([annihilation()]);
    const opp = nextOf(s0, ap);
    const big = putOnBattlefield(s0, opp, bear({ name: "Test Giant", power: "4", toughness: "4" }));
    const eq = putOnBattlefield(s0, opp, gear("Test Blade"));
    s0.objects[eq]!.attachedTo = big;
    invalidateCharacteristics(s0);
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(big), tgt(eq)]));
    // The creature gains hexproof in response: it's an illegal target, and so the Equipment is too.
    s.effects.push({ id: `x${s.nextId++}`, timestamp: s.nextTimestamp++, controller: opp, sourceName: "test", duration: "endOfTurn", affected: [big], mods: [{ kind: "addKeywords", keywords: ["Hexproof"] }] });
    invalidateCharacteristics(s);
    s = settle(s, ap);
    expect(zone(s, big)).toBe("battlefield");
    expect(zone(s, eq)).toBe("battlefield");
  });

  it("can be cast with no Equipment target; a creature with 5 toughness or more is still exiled if it dies this turn", () => {
    const { s: s0, ap, ids } = setup([annihilation(), bolt()]);
    const opp = nextOf(s0, ap);
    const big = putOnBattlefield(s0, opp, bear({ name: "Test Giant", power: "6", toughness: "6" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(big), { kind: "none" }])), ap);
    expect(zone(s, big)).toBe("battlefield");
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(big)])), ap);
    expect(zone(s, big)).toBe("exile");
  });
});

describe("round 316: Stoic Farmer", () => {
  const enter = (moreLands: boolean) => {
    const { s: s0, ap, ids } = setup([farmer()]);
    const opp = nextOf(s0, ap);
    const p = inZone(s0, ap, testPlains, "library");
    // setup gives you fourteen lands; give an opponent more (or fewer) as it resolves.
    for (let i = 0; i < (moreLands ? 15 : 2); i++) putOnBattlefield(s0, opp, card(`Opp Land ${i}`, "Land"));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const pend = s.pending;
      if (pend?.kind === "searchLibrary" && pend.player === ap) s = act(s, { type: "searchLibrary", player: ap, found: [p] });
      else if (pend) s = act(s, botActions(s, pend.player)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return { s, p };
  };
  it("an opponent controls more lands: the Plains goes onto the battlefield tapped", () => {
    const { s, p } = enter(true);
    expect(zone(s, p)).toBe("battlefield");
    expect(s.objects[p]!.tapped).toBe(true);
  });
  it("otherwise it goes into your hand", () => {
    const { s, p } = enter(false);
    expect(zone(s, p)).toBe("hand");
  });
});

describe("round 316: Heroic Feast", () => {
  it("up to as many targets as the life gained in that one event (CR 119.10, 603.3d)", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, feast());
    const bears = ["A", "B", "C"].map((n) => putOnBattlefield(s0, ap, bear({ name: `Bear ${n}` })));
    const healer = putOnBattlefield(s0, ap, card("Test Healer", "Artifact", "{1}", { oracleText: "{T}: You gain 2 life." }));
    let s = run(s0, planActivate(s0, ap, healer, 0));
    s = settle(s, ap);
    // The trigger asks for its targets as it's put on the stack, X = 2: three is too many for 2 life.
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap, x: 2 });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: bears.map(tgt) })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(bears[0]!), tgt(bears[2]!)] }), ap);
    expect(bears.map((b) => s.objects[b]!.counters["+1/+1"] ?? 0)).toEqual([1, 0, 1]);
  });

  it("a gain of 1 life allows one target, and none is fine too", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, feast());
    const bears = ["A", "B"].map((n) => putOnBattlefield(s0, ap, bear({ name: `Bear ${n}` })));
    const healer = putOnBattlefield(s0, ap, card("Test Healer", "Artifact", "{1}", { oracleText: "{T}: You gain 1 life." }));
    let s = settle(run(s0, planActivate(s0, ap, healer, 0)), ap);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap, x: 1 });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: bears.map(tgt) })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [] }), ap);
    expect(bears.map((b) => s.objects[b]!.counters["+1/+1"] ?? 0)).toEqual([0, 0]);
  });
});

describe("round 316: Boreas Charger", () => {
  const doom = card("Test Doom", "Instant", "{B}", { oracleText: "Destroy target creature." });
  const leave = (oppLands: number[]) => {
    const { s: s0, ap, ids } = setup([doom]);
    const c = putOnBattlefield(s0, ap, boreas());
    const plains = [0, 1, 2, 3].map(() => inZone(s0, ap, testPlains, "library"));
    let o = nextOf(s0, ap);
    for (const n of oppLands) {
      for (let i = 0; i < n; i++) putOnBattlefield(s0, o, card(`Land ${o}-${i}`, "Land"));
      o = nextOf(s0, o);
    }
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(c)])), ap);
    return { s, ap, plains };
  };
  it("you choose among the opponents with more lands; a Plains for each land of difference, one onto the battlefield tapped", () => {
    // You control fourteen lands; one opponent sixteen, another seventeen.
    let { s, ap, plains } = leave([16, 17]);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "opponent" });
    const options = (s.pending as { options: string[] }).options;
    expect(options.length).toBe(2);
    const most = nextOf(s, nextOf(s, ap));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: String(most) }), ap);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 3 });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: plains.slice(0, 3) }), ap);
    expect(zone(s, plains[0]!)).toBe("battlefield");
    expect(s.objects[plains[0]!]!.tapped).toBe(true);
    expect(zone(s, plains[1]!)).toBe("hand");
    expect(zone(s, plains[2]!)).toBe("hand");
    expect(zone(s, plains[3]!)).toBe("library");
  });
  it("with no opponent that controls more lands, nothing is found (rulings)", () => {
    const { s: s1, ap, plains } = leave([14, 3]);
    // The library is still searched (and shuffled), for no cards.
    expect(s1.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 0 });
    expect(() => act(s1, { type: "searchLibrary", player: ap, found: [plains[0]!] })).toThrow();
    const s = settle(act(s1, { type: "searchLibrary", player: ap, found: [] }), ap);
    expect(plains.every((p) => zone(s, p) === "library")).toBe(true);
  });
});
