// Lane B round B187: Bucolic Ranch ("If it's a Mount card, you may reveal it and put it into your hand. If you don't put it
// into your hand, you may put it on the bottom of your library"), Graceful Takedown ("Any number of target enchanted
// creatures you control and up to one other target creature you control each deal damage equal to their power to target
// creature you don't control"), The Ruinous Wrecking Crew ("When ~ enters, choose up to X —"), Crypsis ("protection from
// creatures your opponents control"), Skyseer's Chariot ("Activated abilities of sources with the chosen name cost {2} more
// to activate", mana abilities too), Sigardian Zealot ("choose any number of creatures with different powers. Each of them
// gets +X/+X and gains vigilance until end of turn, where X is ~'s power") and Chong and Lily, Nomads ("Put a lore counter
// on each of any number of target Sagas you control").

import { describe, expect, it } from "vitest";
import { act, addEffect, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, activationCost, botActions, castProblem, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, planManaAbility, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";
import { objHasKeyword } from "../src/cards";
import { blockProblem, moveObject } from "../src/game";
import { dealDamage, objectSource } from "../src/damage";
import { objectMatches, sourceQuality } from "../src/effects/targeting";

// Real card data (Scryfall).
const ranch = (): CardDef => ({"oracleId":"8f5902bf-4bc4-4d0c-84ea-a425307a4eb2","name":"Bucolic Ranch","manaCost":"","cmc":0,"typeLine":"Land — Desert","supertypes":[],"types":["Land"],"subtypes":["Desert"],"oracleText":"{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a Mount spell.\n{3}, {T}: Look at the top card of your library. If it's a Mount card, you may reveal it and put it into your hand. If you don't put it into your hand, you may put it on the bottom of your library.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["B","C","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/6/c/6c4f6b81-53d0-49fb-b404-c2ad67de7493.jpg?1783911773","artUrl":"https://cards.scryfall.io/art_crop/front/6/c/6c4f6b81-53d0-49fb-b404-c2ad67de7493.jpg?1783911773","commanderLegal":"legal","set":"otj","releasedAt":"2024-04-19","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const takedown = (): CardDef => ({"oracleId":"b580c6d8-f501-4623-843a-5bb2b638a339","name":"Graceful Takedown","manaCost":"{1}{G}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Any number of target enchanted creatures you control and up to one other target creature you control each deal damage equal to their power to target creature you don't control.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/3/83edf626-ed34-417f-818d-597ecf439167.jpg?1783915083","artUrl":"https://cards.scryfall.io/art_crop/front/8/3/83edf626-ed34-417f-818d-597ecf439167.jpg?1783915083","commanderLegal":"legal","set":"woe","releasedAt":"2023-09-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const crew = (): CardDef => ({"oracleId":"0ff9c0cc-4fb3-4117-9a8e-5b51f62306c4","name":"The Ruinous Wrecking Crew","manaCost":"{X}{B}{R}","cmc":2,"typeLine":"Legendary Creature — Human Villain","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Villain"],"oracleText":"The Ruinous Wrecking Crew enters with X +1/+1 counters on it.\nWhen The Ruinous Wrecking Crew enters, choose up to X —\n• Discard a card, then draw a card.\n• Target opponent loses 2 life.\n• Destroy target token.\n• Each player sacrifices a creature of their choice.","power":"2","toughness":"2","colors":["B","R"],"colorIdentity":["B","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/d/4d8c8ceb-84cd-46d2-9230-ab6ca4569334.jpg?1783902898","artUrl":"https://cards.scryfall.io/art_crop/front/4/d/4d8c8ceb-84cd-46d2-9230-ab6ca4569334.jpg?1783902898","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const crypsis = (): CardDef => ({"oracleId":"6077e650-32f9-4954-8286-9c8a3f3227ae","name":"Crypsis","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature you control gains protection from creatures your opponents control until end of turn. Untap it.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/d/bd445b01-34af-4132-a9fe-a03858624492.jpg?1783939572","artUrl":"https://cards.scryfall.io/art_crop/front/b/d/bd445b01-34af-4132-a9fe-a03858624492.jpg?1783939572","commanderLegal":"legal","set":"bng","releasedAt":"2014-02-07","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const chariot = (): CardDef => ({"oracleId":"92d28545-4403-4c24-8547-efab4dde6a53","name":"Skyseer's Chariot","manaCost":"{1}{W}","cmc":2,"typeLine":"Artifact — Vehicle","supertypes":[],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"Flying\nAs this Vehicle enters, choose a nonland card name.\nActivated abilities of sources with the chosen name cost {2} more to activate.\nCrew 2","power":"3","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Crew"],"imageUrl":"https://cards.scryfall.io/normal/front/9/6/96ed5b66-8e74-4a90-ad4e-c39d15993994.jpg?1783907914","artUrl":"https://cards.scryfall.io/art_crop/front/9/6/96ed5b66-8e74-4a90-ad4e-c39d15993994.jpg?1783907914","commanderLegal":"legal","set":"dft","releasedAt":"2025-02-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const zealot = (): CardDef => ({"oracleId":"30aecffc-bbbf-44d0-8002-0ee5982f27b9","name":"Sigardian Zealot","manaCost":"{4}{G}","cmc":5,"typeLine":"Creature — Human Cleric","supertypes":[],"types":["Creature"],"subtypes":["Human","Cleric"],"oracleText":"At the beginning of combat on your turn, choose any number of creatures with different powers. Each of them gets +X/+X and gains vigilance until end of turn, where X is this creature's power.","power":"3","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/8/98adcc86-debd-4aa8-86e5-c51ec08dab5a.jpg?1783925373","artUrl":"https://cards.scryfall.io/art_crop/front/9/8/98adcc86-debd-4aa8-86e5-c51ec08dab5a.jpg?1783925373","commanderLegal":"legal","set":"mic","releasedAt":"2021-09-24","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const chong = (): CardDef => ({"oracleId":"faffc9fb-32b3-4015-8c3f-e6b45002c050","name":"Chong and Lily, Nomads","manaCost":"{3}{R}","cmc":4,"typeLine":"Legendary Creature — Human Bard Ally","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Bard","Ally"],"oracleText":"Whenever one or more Bards you control attack, choose one —\n• Put a lore counter on each of any number of target Sagas you control.\n• Creatures you control get +1/+0 until end of turn for each lore counter among Sagas you control.","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/c/6cf1c3d5-3fae-4a43-81c8-c823d2755b99.jpg?1783904822","artUrl":"https://cards.scryfall.io/art_crop/front/6/c/6cf1c3d5-3fae-4a43-81c8-c823d2755b99.jpg?1783904822","commanderLegal":"legal","set":"tle","releasedAt":"2025-11-21","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const benalia = (): CardDef => ({"oracleId":"c15bb7eb-aaaa-4468-9641-8f706d6137e8","name":"History of Benalia","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II — Create a 2/2 white Knight creature token with vigilance.\nIII — Knights you control get +2/+1 until end of turn.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/1/d134385d-b01c-41c7-bb2d-30722b44dc5a.jpg?1783935041","artUrl":"https://cards.scryfall.io/art_crop/front/d/1/d134385d-b01c-41c7-bb2d-30722b44dc5a.jpg?1783935041","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"mythic","layout":"saga","gameChanger":false}) as CardDef;
const holyStrength = (): CardDef => ({"oracleId":"9357de36-f8be-4f49-b2c8-9fe9eaf82b07","name":"Holy Strength","manaCost":"{W}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature gets +1/+2.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/e/2/e21264cb-d915-4431-92fd-b0aa32a715fc.jpg?1783943078","artUrl":"https://cards.scryfall.io/art_crop/front/e/2/e21264cb-d915-4431-92fd-b0aa32a715fc.jpg?1783943078","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sorcerer = (): CardDef => ({"oracleId":"5e961d15-5972-4e4b-9385-1cd7cd7c6bbe","name":"Prodigal Sorcerer","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Human Wizard Sorcerer","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard","Sorcerer"],"oracleText":"{T}: This creature deals 1 damage to any target.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/0/50aef269-55f9-4d84-8bc5-29e794297f11.jpg?1783937607","artUrl":"https://cards.scryfall.io/art_crop/front/5/0/50aef269-55f9-4d84-8bc5-29e794297f11.jpg?1783937607","commanderLegal":"legal","set":"ema","releasedAt":"2016-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const serra = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sunmare = (): CardDef => ({"oracleId":"3b319540-4db1-43d3-8f4d-f5a276ad78e4","name":"Guardian Sunmare","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Horse Mount","supertypes":[],"types":["Creature"],"subtypes":["Horse","Mount"],"oracleText":"Ward {2}\nWhenever this creature attacks while saddled, search your library for a nonland permanent card with mana value 3 or less, put it onto the battlefield, then shuffle.\nSaddle 4","power":"5","toughness":"5","colors":["W"],"colorIdentity":["W"],"keywords":["Saddle","Ward"],"imageUrl":"https://cards.scryfall.io/normal/front/7/c/7c274595-94e2-4587-9cef-b38639d6429a.jpg?1783907919","artUrl":"https://cards.scryfall.io/art_crop/front/7/c/7c274595-94e2-4587-9cef-b38639d6429a.jpg?1783907919","commanderLegal":"legal","set":"dft","releasedAt":"2025-02-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Passes until the stack and triggers are done, or something asks `me` a question; other players' questions go to the bot. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && me !== undefined && p.player !== me) s = run(s, botActions(s, p.player));
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const obj = (id: ObjectId): TargetChoice => ({ kind: "object", id });
const none: TargetChoice = { kind: "none" };
/** A card of `def` owned by `pid`, put into `where` (on top of the library). */
const place = (s: GameState, pid: PlayerId, def: CardDef, where: "graveyard" | "library" | "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const enchant = (s: GameState, pid: PlayerId, host: ObjectId) => {
  const aura = putOnBattlefield(s, pid, holyStrength());
  s.objects[aura]!.attachedTo = host;
  invalidateCharacteristics(s);
  return aura;
};
/** Can a spell or ability from `src`, controlled by `pid`, target the creature `t` (CR 115.2, 702.16b)? */
const targetable = (s: GameState, pid: PlayerId, src: ObjectId, t: ObjectId) => objectMatches(s, { kind: "object", types: ["Creature"], notTypes: [], notColors: [], text: "target creature" }, s.objects[t]!, pid, true, sourceQuality(s, src));
const damage = (s: GameState, id: ObjectId) => s.objects[id]!.damage ?? 0;
const pt = (s: GameState, id: ObjectId) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;

describe("Round B187 cards are supported", () => {
  it("compiles all seven", () => supported(ranch(), takedown(), crew(), crypsis(), chariot(), zealot(), chong()));
});

describe("Bucolic Ranch: a Mount on top may go to your hand; if it doesn't, the card may go to the bottom", () => {
  const look = (top: () => CardDef) => {
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, ranch());
    const card = place(s0, ap, top(), "library");
    const s = settle(run(s0, planActivate(s0, ap, r, 0)), ap);
    return { s, ap, r, card };
  };

  it("a Mount: reveal it and put it into your hand", () => {
    const { s: s1, ap, r, card } = look(sunmare);
    expect(s1.objects[r]!.tapped).toBe(true);
    expect(s1.pending).toMatchObject({ kind: "chooseMay", player: ap });
    const from = s1.log.length;
    const s = settle(act(s1, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(s.objects[card]!.zone).toBe("hand");
    expect(s.log.slice(from).some((l) => l.to === undefined && /reveals/.test(l.text) && l.text.includes("Guardian Sunmare"))).toBe(true);
    expect(s.pending).toBeFalsy();
  });

  it("a Mount you don't take: then you may put it on the bottom", () => {
    const { s: s1, ap, card } = look(sunmare);
    let s = settle(act(s1, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(s.objects[card]!.zone).toBe("library");
    expect(s.players[ap]!.library.at(-1)).toBe(card);
  });

  it("not a Mount: only the bottom is offered, and it may stay on top", () => {
    const { s: s1, ap, card } = look(bears);
    expect(s1.pending).toMatchObject({ kind: "chooseMay", player: ap });
    const s = settle(act(s1, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(s.pending).toBeFalsy();
    expect(s.players[ap]!.library[0]).toBe(card);
    expect(s.objects[card]!.zone).toBe("library");
  });
});

describe("Graceful Takedown: enchanted creatures you control and up to one other creature each deal damage equal to their power", () => {
  const board = () => {
    const { s, ap, opp, ids } = setup([takedown()]);
    const a = putOnBattlefield(s, ap, bears()); // 3/4 enchanted
    const b = putOnBattlefield(s, ap, giant()); // 4/5 enchanted
    const angel = putOnBattlefield(s, ap, serra()); // 4/4, not enchanted
    const auraA = enchant(s, ap, a);
    enchant(s, ap, b);
    const big = putOnBattlefield(s, opp, { ...giant(), oracleId: "test-big", name: "Test Big Giant", power: "9", toughness: "20" } as CardDef);
    return { s, ap, opp, spell: ids[0]!, a, b, angel, auraA, big };
  };

  it("all of them deal their damage at once to the creature you don't control", () => {
    const { s: s0, ap, spell, a, b, angel, big } = board();
    expect(pt(s0, a)).toBe("3/4");
    const s = settle(run(s0, planCast(s0, ap, spell, [obj(angel), obj(a), obj(b), obj(big)])), ap);
    expect(damage(s, big)).toBe(3 + 4 + 4);
    expect(s.objects[spell]!.zone).toBe("graveyard");
  });

  it("no enchanted ones chosen, or no other one: whoever was chosen deals damage", () => {
    const { s: s0, ap, spell, a, angel, big } = board();
    const s = settle(run(s0, planCast(s0, ap, spell, [obj(angel), obj(big)])), ap);
    expect(damage(s, big)).toBe(4);
    const { s: t0, ap: ap2, spell: spell2, a: a2, big: big2 } = board();
    const t = settle(run(t0, planCast(t0, ap2, spell2, [none, obj(a2), obj(big2)])), ap2);
    expect(damage(t, big2)).toBe(3);
    void a;
  });

  it("the enchanted group takes only enchanted creatures, and the other one can't also be one of them", () => {
    const { s, ap, spell, a, angel, big } = board();
    expect(planCast(s, ap, spell, [none, obj(angel), obj(big)])).toBeNull();
    expect(planCast(s, ap, spell, [obj(a), obj(a), obj(big)])).toBeNull();
    // The last target must be a creature you don't control.
    expect(planCast(s, ap, spell, [obj(angel), obj(a), obj(angel)])).toBeNull();
  });

  it("one that's no longer enchanted as it resolves deals none; the others still do (rulings)", () => {
    const { s: s0, ap, spell, a, b, angel, auraA, big } = board();
    let s = run(s0, planCast(s0, ap, spell, [obj(angel), obj(a), obj(b), obj(big)]));
    s.objects[auraA]!.attachedTo = undefined;
    s.battlefield.splice(s.battlefield.indexOf(auraA), 1);
    s.objects[auraA]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(auraA);
    invalidateCharacteristics(s);
    s = settle(s, ap);
    expect(damage(s, big)).toBe(4 + 4);
  });

  it("a bot with it in hand still decides what to do", () => {
    const { s, ap } = board();
    expect(() => botActions(s, ap)).not.toThrow();
  });

  it("with the creature you don't control gone, none is dealt", () => {
    const { s: s0, ap, spell, a, angel, big } = board();
    let s = run(s0, planCast(s0, ap, spell, [obj(angel), obj(a), obj(big)]));
    s.battlefield.splice(s.battlefield.indexOf(big), 1);
    s.objects[big]!.zone = "exile";
    s.players[s.objects[big]!.owner]!.exile.push(big);
    invalidateCharacteristics(s);
    s = settle(s, ap);
    expect(damage(s, a)).toBe(0);
    expect(s.log.some((l) => /no damage is dealt/.test(l.text))).toBe(true);
  });
});

describe("The Ruinous Wrecking Crew: choose up to X modes, X the X it was cast with", () => {
  const enter = (x: number) => {
    const { s: s0, ap, opp, ids } = setup([crew()]);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [], undefined, "auto", x)), ap);
    return { s, ap, opp, c: ids[0]! };
  };

  it("X = 2: two of the modes at most, each once; it entered with two +1/+1 counters", () => {
    const { s: s1, ap, opp, c } = enter(2);
    expect(s1.objects[c]!.counters["+1/+1"]).toBe(2);
    expect(s1.pending).toMatchObject({ kind: "chooseModes", player: ap, max: 2 });
    expect(() => act(s1, { type: "chooseModes", player: ap, modes: [0, 1, 3] })).toThrow();
    let s = act(s1, { type: "chooseModes", player: ap, modes: [1, 3] });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    const life = s.players[opp]!.life;
    s = settle(s, ap);
    if (s.pending?.kind === "pickPermanents") s = settle(act(s, { type: "pickPermanents", player: ap, ids: [c] }), ap);
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(s.objects[c]!.zone).toBe("graveyard");
  });

  it("X = 6: all four modes at most (no mode twice)", () => {
    const { s } = enter(6);
    expect(s.pending).toMatchObject({ kind: "chooseModes", max: 4 });
  });

  it("X = 0, or put onto the battlefield without being cast: no modes, nothing happens", () => {
    const { s } = enter(0);
    expect(s.pending).toBeFalsy();
    // Returned from a graveyard: it wasn't cast, so X is 0 (CR 107.3m).
    const { s: t0, ap } = setup([]);
    const id = place(t0, ap, crew(), "graveyard");
    moveObject(t0, id, "battlefield");
    expect(t0.triggerQueue.length + t0.stack.length).toBeGreaterThan(0);
    const t = settle(t0, ap);
    expect(t.pending).toBeFalsy();
    expect(t.objects[id]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("a bot chooses no more than X", () => {
    const { s, ap } = enter(1);
    const a = botActions(s, ap)[0]!;
    expect(a.type === "chooseModes" && a.modes.length).toBeLessThanOrEqual(1);
  });
});

describe("Crypsis: protection from creatures your opponents control, and untap it", () => {
  const cast = () => {
    const { s: s0, ap, opp, ids } = setup([crypsis()]);
    const bear = putOnBattlefield(s0, ap, bears());
    s0.objects[bear]!.tapped = true;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [obj(bear)])), ap);
    return { s, ap, opp, bear };
  };

  it("untaps it; opponents' creatures can't block it, target it or damage it; their other spells still can", () => {
    const { s, ap, opp, bear } = cast();
    expect(s.objects[bear]!.tapped).toBe(false);
    expect(characteristics(s, s.objects[bear]!).keywords).toContain("Protection from creatures your opponents control");
    const theirs = putOnBattlefield(s, opp, sorcerer());
    const mine = putOnBattlefield(s, ap, sorcerer());
    const blocker = putOnBattlefield(s, opp, giant());
    s.objects[bear]!.attacking = opp;
    expect(blockProblem(s, s.objects[blocker]!, s.objects[bear]!)).toMatch(/protection/);
    expect(targetable(s, opp, theirs, bear)).toBe(false);
    expect(planActivate(s, ap, mine, 0, [obj(bear)])).not.toBeNull();
    s.objects[bear]!.attacking = undefined;
    // A noncreature spell an opponent controls isn't a creature: Shock may target it.
    const bolt = place(s, opp, shock(), "hand");
    expect(targetable(s, opp, bolt, bear)).toBe(true);
    // Damage from an opponent's creature is prevented; from your own, it isn't.
    dealDamage(s, objectSource(s, s.objects[blocker]!), { object: s.objects[bear]! }, 2);
    expect(damage(s, bear)).toBe(0);
    dealDamage(s, objectSource(s, s.objects[mine]!), { object: s.objects[bear]! }, 1);
    expect(damage(s, bear)).toBe(1);
  });

  it("after another player gains control of it, it has protection from that player's opponents' creatures (rulings)", () => {
    const { s, ap, opp, bear } = cast();
    const mine = putOnBattlefield(s, ap, sorcerer());
    const theirs = putOnBattlefield(s, opp, sorcerer());
    addEffect(s, opp, [bear], [{ kind: "control" }]);
    expect(controllerOf(s, s.objects[bear]!)).toBe(opp);
    expect(planActivate(s, ap, mine, 0, [obj(bear)])).toBeNull();
    expect(targetable(s, opp, theirs, bear)).toBe(true);
    expect(targetable(s, ap, mine, bear)).toBe(false);
  });

  it("lasts until end of turn", () => {
    const { s: s0, ap, bear } = cast();
    const next = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    const s = passUntil(s0, "upkeep", next);
    expect(characteristics(s, s.objects[bear]!).keywords).not.toContain("Protection from creatures your opponents control");
  });
});

describe("Skyseer's Chariot: activated abilities of sources with the chosen name cost {2} more, mana abilities too", () => {
  /** Lands gone, this mana in `pid`'s pool instead. */
  const poolOnly = (s: GameState, pid: PlayerId, pool: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
    for (const id of s.battlefield.filter((x) => s.objects[x]!.controller === pid && characteristics(s, s.objects[x]!).types.includes("Land"))) {
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      s.objects[id]!.zone = "exile";
      s.players[pid]!.exile.push(id);
    }
    s.players[pid]!.manaPool = { ...s.players[pid]!.manaPool, ...pool };
    invalidateCharacteristics(s);
  };

  it("names a card as it enters; that card's abilities cost {2} more, anyone's, the Chariot's controller's too", () => {
    const { s: s0, ap, opp, ids } = setup([chariot()]);
    const mine = putOnBattlefield(s0, ap, sorcerer());
    const theirs = putOnBattlefield(s0, opp, sorcerer());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "cardName" });
    s = act(s, { type: "chooseOption", player: ap, choice: "Prodigal Sorcerer" });
    s = settle(s, ap);
    expect(s.objects[ids[0]!]!.chosen?.name).toBe("Prodigal Sorcerer");
    const generic = (pid: PlayerId, id: ObjectId) => activationCost(s, pid, s.objects[id]!, abilitiesOf(s, s.objects[id]!).activated[0]!).symbols.reduce((n, x) => n + (x.kind === "generic" ? x.amount : 0), 0);
    expect(generic(ap, mine)).toBe(2);
    expect(generic(opp, theirs)).toBe(2);
    poolOnly(s, ap, { C: 1 });
    expect(planActivate(s, ap, mine, 0, [{ kind: "player", id: opp }])).toBeNull();
    s.players[ap]!.manaPool.C = 2;
    const after = settle(run(s, planActivate(s, ap, mine, 0, [{ kind: "player", id: opp }])), ap);
    expect(after.players[ap]!.manaPool.C ?? 0).toBe(0);
  });

  it("a named Llanowar Elves's mana ability costs {2}; another name's doesn't", () => {
    const { s, ap } = setup([]);
    const ch = putOnBattlefield(s, ap, chariot());
    s.objects[ch]!.chosen = { name: "Llanowar Elves" };
    const elf = putOnBattlefield(s, ap, elves());
    const other = putOnBattlefield(s, ap, { ...elves(), oracleId: "test-elf", name: "Test Other Elf" } as CardDef);
    invalidateCharacteristics(s);
    poolOnly(s, ap, {});
    expect(planManaAbility(s, ap, elf, 0, "G")).toBeNull();
    expect(planManaAbility(s, ap, other, 0, "G")).not.toBeNull();
    s.players[ap]!.manaPool.C = 2;
    const after = run(s, planManaAbility(s, ap, elf, 0, "G"));
    expect(after.players[ap]!.manaPool.G).toBe(1);
    expect(after.players[ap]!.manaPool.C ?? 0).toBe(0);
  });
});

describe("Sigardian Zealot: any number of creatures with different powers each get +X/+X and vigilance, X its power", () => {
  const combat = () => {
    const { s: s0, ap, opp } = setup([]);
    const z = putOnBattlefield(s0, ap, zealot()); // 3/3
    const a = putOnBattlefield(s0, ap, bears()); // 2/2
    const b = putOnBattlefield(s0, ap, { ...bears(), oracleId: "test-bear-2", name: "Test Second Bear" } as CardDef);
    const big = putOnBattlefield(s0, opp, giant()); // 3/3
    const s = settle(passUntil(s0, "beginCombat", ap), ap);
    return { s, ap, opp, z, a, b, big };
  };

  it("at the beginning of combat on your turn, anyone's creatures with different powers, each +3/+3 and vigilance", () => {
    const { s: s1, ap, z, a, b, big } = combat();
    expect(s1.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "choose", differentPowers: true, min: 0 });
    expect(() => act(s1, { type: "pickPermanents", player: ap, ids: [a, b] })).toThrow(/different powers/);
    expect(() => act(s1, { type: "pickPermanents", player: ap, ids: [z, big] })).toThrow(/different powers/);
    const s = settle(act(s1, { type: "pickPermanents", player: ap, ids: [z, a] }), ap);
    expect(pt(s, z)).toBe("6/6");
    expect(pt(s, a)).toBe("5/5");
    expect(pt(s, b)).toBe("2/2");
    expect(pt(s, big)).toBe("3/3");
    for (const id of [z, a]) expect(objHasKeyword(s, s.objects[id]!, "Vigilance"), id).toBe(true);
    expect(objHasKeyword(s, s.objects[b]!, "Vigilance")).toBe(false);
  });

  it("X is locked in as it resolves: a later change to the Zealot's power doesn't change the bonus (CR 608.2h)", () => {
    const { s: s1, ap, z, a } = combat();
    const s = settle(act(s1, { type: "pickPermanents", player: ap, ids: [a] }), ap);
    expect(pt(s, a)).toBe("5/5");
    addEffect(s, ap, [z], [{ kind: "modifyPT", power: 4, toughness: 0 }]);
    expect(power(s, s.objects[z]!)).toBe(7);
    expect(pt(s, a)).toBe("5/5");
  });

  it("not on an opponent's turn", () => {
    const { s: s0, ap } = setup([]);
    const next = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    let s = passUntil(s0, "end", ap);
    putOnBattlefield(s, ap, zealot());
    s = passUntil(s, "beginCombat", next);
    s = settle(s, next);
    expect(s.pending?.kind).not.toBe("pickPermanents");
  });

  it("the bot chooses one of its own creatures for each power", () => {
    const { s, ap, z, a, b, big } = combat();
    const [pick] = botActions(s, ap) as { ids: string[] }[];
    expect(pick!.ids).toContain(z);
    expect(pick!.ids).not.toContain(big);
    expect(pick!.ids.filter((id) => id === a || id === b).length).toBe(1);
  });
});

describe("Chong and Lily, Nomads: when Bards attack, lore counters on any number of your Sagas, or +1/+0 for each lore counter", () => {
  const attack = () => {
    const { s: s0, ap, opp } = setup([]);
    const cl = putOnBattlefield(s0, ap, chong());
    const one = putOnBattlefield(s0, ap, benalia());
    const two = putOnBattlefield(s0, ap, { ...benalia(), oracleId: "test-saga-2", name: "Test Second Saga" } as CardDef);
    const theirs = putOnBattlefield(s0, opp, { ...benalia(), oracleId: "test-saga-3", name: "Test Their Saga" } as CardDef);
    s0.objects[one]!.counters.lore = 1;
    s0.objects[two]!.counters.lore = 2;
    s0.objects[theirs]!.counters.lore = 1;
    const bear = putOnBattlefield(s0, ap, bears());
    let s = passUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: cl, defender: opp }] } as Action), ap);
    return { s, ap, opp, cl, one, two, theirs, bear };
  };
  const knights = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).subtypes.includes("Knight")).length;

  it("a lore counter on each Saga chosen: each one's next chapter triggers (rulings)", () => {
    const { s: s1, ap, one, two, theirs } = attack();
    expect(s1.pending).toMatchObject({ kind: "chooseModes", player: ap, max: 1 });
    let s = act(s1, { type: "chooseModes", player: ap, modes: [0] });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    // Only Sagas you control.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [obj(theirs)] })).toThrow();
    s = act(s, { type: "chooseTargets", player: ap, targets: [obj(one), obj(two)] });
    s = settle(s, ap);
    expect(s.objects[one]!.counters.lore).toBe(2);
    expect(s.objects[theirs]!.counters.lore).toBe(1);
    // History of Benalia II made a Knight; the other one's III gave Knights +2/+1, and it was sacrificed after (CR 714.4).
    expect(knights(s, ap)).toBe(1);
    expect(s.objects[two]!.zone).toBe("graveyard");
  });

  it("or creatures you control get +1/+0 for each lore counter among Sagas you control, counted as it resolves", () => {
    const { s: s1, ap, cl, bear, theirs } = attack();
    const s = settle(act(s1, { type: "chooseModes", player: ap, modes: [1] }), ap);
    expect(pt(s, cl)).toBe("6/3");
    expect(pt(s, bear)).toBe("5/2");
    void theirs;
  });

  it("only Bards attacking trigger it", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, chong());
    const bear = putOnBattlefield(s0, ap, bears());
    let s = passUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: bear, defender: opp }] } as Action), ap);
    expect(s.pending?.kind).not.toBe("chooseModes");
  });
});
