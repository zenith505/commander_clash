// Round 242: cards from the top of the popularity list. Fire Lord Sozin ("you may pay {X}. When you do, put any number of
// target creature cards with total mana value X or less from that player's graveyard onto the battlefield under your
// control"); Technomancer ("return any number of artifact creature cards with total mana value 6 or less"); The War in
// Heaven III (up to three target creature cards with total mana value 8 or less, back with a necrodermis counter, artifacts
// too); Curator of Sun's Creation ("Whenever you discover, discover again for the same value"); Ertha Jo, Frontier Mentor
// ("Whenever you activate an ability that targets a creature or player, copy that ability"); Mirrorwing Dragon ("that
// player copies that spell for each other creature they control"); Central Elevator // Promising Stairs and Smoky Lounge //
// Misty Salon (Room names, unlocked doors, mana only to cast Room spells and unlock doors); The Hunger Tide Rises IV;
// Niv-Mizzet Reborn (one card for each color pair); "Suspend X—{X}...{cost}. X can't be 0." and "Whenever a time counter is
// removed from ~ while it's exiled" (Aeon Chronicler, Benalish Commander, Detritivore, Fungal Behemoth, Dinosaurs on a
// Spaceship), "When the last time counter is removed from ~ while it's exiled" (Veiling Oddity).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, legalActions, objIsType, planActivate, planCast, planSuspend, planUnlock, suspendProblem, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

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
  delete s.objects[id]!.unlocked; // only a Room on the battlefield has doors unlocked or locked
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/**
 * Everyone passes until the stack is empty, answering "you may" with `may` and trigger targets with `targets`; other
 * players' questions are answered as the bots would. Stops at any other question of `me`'s.
 */
const settle = (s: GameState, opts: { may?: boolean; targets?: TargetChoice[]; me?: PlayerId } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me !== undefined && p.player !== opts.me) s = act(s, botActions(s, p.player)[0]!);
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const named = (s: GameState, name: string) => s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === name);
/** Attack with `attacks`, nobody blocks; stops at `me`'s first question or once combat is over. */
const attack = (s: GameState, me: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId }[]) => {
  s = act(s, { type: "declareAttackers", player: me, attacks });
  for (let i = 0; i < 120 && s.step !== "main2"; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p && p.player === me) return s;
    else if (p) s = act(s, botActions(s, p.player)[0]!);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Everyone passes (bots answer their own questions, nobody attacks or blocks) until `stop`. */
const goUntil = (s: GameState, stop: (s: GameState) => boolean) => {
  for (let i = 0; i < 3000; i++) {
    if (stop(s)) return s;
    const p = s.pending;
    const pid = waitingOn(s)!;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never got there");
};
/** Only these cards in `pid`'s hand. */
const onlyHand = (s: GameState, pid: PlayerId, keep: ObjectId[]) => {
  const p = s.players[pid]!;
  for (const id of p.hand.filter((x) => !keep.includes(x))) {
    s.objects[id]!.zone = "library";
    p.library.push(id);
  }
  p.hand = p.hand.filter((x) => keep.includes(x));
};

// Real oracle text (Scryfall).
const sozin = (): CardDef => ({"oracleId":"9b0b217d-cc9d-4187-89cb-f13160ed2983","name":"The Rise of Sozin // Fire Lord Sozin","manaCost":"{4}{B}{B}","cmc":6,"typeLine":"Enchantment — Saga // Legendary Creature — Human Noble","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter.)\nI — Destroy all creatures.\nII — Choose a card name. Search target opponent's graveyard, hand, and library for up to four cards with that name and exile them. Then that player shuffles.\nIII — Exile this Saga, then return it to the battlefield transformed under your control.","colors":["B"],"colorIdentity":["B"],"keywords":["Transform","Firebending","Menace"],"producedMana":["R"],"commanderLegal":"legal","set":"tla","releasedAt":"2025-11-21","rarity":"mythic","layout":"transform","gameChanger":false,"faces":[{"name":"The Rise of Sozin","manaCost":"{4}{B}{B}","typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter.)\nI — Destroy all creatures.\nII — Choose a card name. Search target opponent's graveyard, hand, and library for up to four cards with that name and exile them. Then that player shuffles.\nIII — Exile this Saga, then return it to the battlefield transformed under your control.","colors":["B"]},{"name":"Fire Lord Sozin","manaCost":"","typeLine":"Legendary Creature — Human Noble","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Noble"],"oracleText":"Menace, firebending 3 (Whenever this creature attacks, add {R}{R}{R}. This mana lasts until end of combat.)\nWhenever Fire Lord Sozin deals combat damage to a player, you may pay {X}. When you do, put any number of target creature cards with total mana value X or less from that player's graveyard onto the battlefield under your control.","power":"5","toughness":"5","colors":["B"],"colorIndicator":["B"]}]}) as CardDef;
const technomancer = (): CardDef => ({"oracleId":"3f97541e-34f3-4f7f-8ac2-7167b2ec9b33","name":"Technomancer","manaCost":"{5}{B}{B}","cmc":7,"typeLine":"Artifact Creature — Necron Wizard","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Necron","Wizard"],"oracleText":"When this creature enters, mill three cards, then return any number of artifact creature cards with total mana value 6 or less from your graveyard to the battlefield.","power":"5","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Mill"],"commanderLegal":"legal","set":"40k","releasedAt":"2022-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const warInHeaven = (): CardDef => ({"oracleId":"5924cbb0-19b5-449c-a7c5-722e744a54f8","name":"The War in Heaven","manaCost":"{3}{B}{B}{B}","cmc":6,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — You draw three cards and you lose 3 life.\nII — Mill three cards.\nIII — Choose up to three target creature cards with total mana value 8 or less in your graveyard. Return each of them to the battlefield with a necrodermis counter on it. They're artifacts in addition to their other types.","colors":["B"],"colorIdentity":["B"],"keywords":["Mill"],"commanderLegal":"legal","set":"40k","releasedAt":"2022-10-07","rarity":"rare","layout":"saga","gameChanger":false}) as CardDef;
const curator = (): CardDef => ({"oracleId":"0e636c98-67c7-4f02-b909-5d43e276fa41","name":"Curator of Sun's Creation","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Human Artificer","supertypes":[],"types":["Creature"],"subtypes":["Human","Artificer"],"oracleText":"Whenever you discover, discover again for the same value. This ability triggers only once each turn.","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"lci","releasedAt":"2023-11-17","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const ertha = (): CardDef => ({"oracleId":"0a66ce8b-af99-411f-8ecb-52a5d2f6af3d","name":"Ertha Jo, Frontier Mentor","manaCost":"{2}{R}{W}","cmc":4,"typeLine":"Legendary Creature — Kor Advisor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Kor","Advisor"],"oracleText":"When Ertha Jo enters, create a 1/1 red Mercenary creature token with \"{T}: Target creature you control gets +1/+0 until end of turn. Activate only as a sorcery.\"\nWhenever you activate an ability that targets a creature or player, copy that ability. You may choose new targets for the copy.","power":"2","toughness":"4","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"commanderLegal":"legal","set":"otj","releasedAt":"2024-04-19","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const mirrorwing = (): CardDef => ({"oracleId":"9ea14a03-c6a2-49ec-953d-4249a2c27e1d","name":"Mirrorwing Dragon","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\nWhenever a player casts an instant or sorcery spell that targets only this creature, that player copies that spell for each other creature they control that the spell could target. Each copy targets a different one of those creatures.","power":"4","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"commanderLegal":"legal","set":"emn","releasedAt":"2016-07-22","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const elevator = (): CardDef => ({"oracleId":"927fa223-69a3-4563-80b1-b578f3d031f1","name":"Central Elevator // Promising Stairs","manaCost":"{3}{U} // {2}{U}","cmc":7,"typeLine":"Enchantment — Room // Enchantment — Room","supertypes":[],"types":["Enchantment"],"subtypes":["Room"],"oracleText":"When you unlock this door, search your library for a Room card that doesn't have the same name as a Room you control, reveal it, put it into your hand, then shuffle.\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)","colors":["U"],"colorIdentity":["U"],"keywords":["Surveil"],"commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"rare","layout":"split","gameChanger":false,"faces":[{"name":"Central Elevator","manaCost":"{3}{U}","typeLine":"Enchantment — Room","supertypes":[],"types":["Enchantment"],"subtypes":["Room"],"oracleText":"When you unlock this door, search your library for a Room card that doesn't have the same name as a Room you control, reveal it, put it into your hand, then shuffle.\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)","colors":["U"]},{"name":"Promising Stairs","manaCost":"{2}{U}","typeLine":"Enchantment — Room","supertypes":[],"types":["Enchantment"],"subtypes":["Room"],"oracleText":"At the beginning of your upkeep, surveil 1. You win the game if there are eight or more different names among unlocked doors of Rooms you control.\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)","colors":["U"]}]}) as CardDef;
const lounge = (): CardDef => ({"oracleId":"4f70b0ee-c24c-45fa-b878-9ba69266344f","name":"Smoky Lounge // Misty Salon","manaCost":"{2}{R} // {3}{U}","cmc":7,"typeLine":"Enchantment — Room // Enchantment — Room","supertypes":[],"types":["Enchantment"],"subtypes":["Room"],"oracleText":"At the beginning of your first main phase, add {R}{R}. Spend this mana only to cast Room spells and unlock doors.\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)","colors":["R","U"],"colorIdentity":["R","U"],"keywords":[],"producedMana":["R"],"commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"uncommon","layout":"split","gameChanger":false,"faces":[{"name":"Smoky Lounge","manaCost":"{2}{R}","typeLine":"Enchantment — Room","supertypes":[],"types":["Enchantment"],"subtypes":["Room"],"oracleText":"At the beginning of your first main phase, add {R}{R}. Spend this mana only to cast Room spells and unlock doors.\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)","colors":["R"]},{"name":"Misty Salon","manaCost":"{3}{U}","typeLine":"Enchantment — Room","supertypes":[],"types":["Enchantment"],"subtypes":["Room"],"oracleText":"When you unlock this door, create an X/X blue Spirit creature token with flying, where X is the number of unlocked doors among Rooms you control.\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)","colors":["U"]}]}) as CardDef;
const hungerTide = (): CardDef => ({"oracleId":"356edd68-7dd5-4ab6-a738-6cb0eb2d4e56","name":"The Hunger Tide Rises","manaCost":"{2}{G}","cmc":3,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after IV.)\nI, II, III — Create a 1/1 black and green Insect creature token.\nIV — Sacrifice any number of creatures. Search your library and/or graveyard for a creature card with mana value less than or equal to the number of creatures sacrificed this way and put it onto the battlefield. If you search your library this way, shuffle.","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","set":"mh3","releasedAt":"2024-06-14","rarity":"uncommon","layout":"saga","gameChanger":false}) as CardDef;
const niv = (): CardDef => ({"oracleId":"10764b35-5c6c-4161-8579-1124d5963a0e","name":"Niv-Mizzet Reborn","manaCost":"{W}{U}{B}{R}{G}","cmc":5,"typeLine":"Legendary Creature — Dragon Avatar","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Dragon","Avatar"],"oracleText":"Flying\nWhen Niv-Mizzet enters, reveal the top ten cards of your library. For each color pair, choose a card that's exactly those colors from among them. Put the chosen cards into your hand and the rest on the bottom of your library in a random order.","power":"6","toughness":"6","colors":["B","G","R","U","W"],"colorIdentity":["B","G","R","U","W"],"keywords":["Flying"],"commanderLegal":"legal","set":"mul","releasedAt":"2023-04-21","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const chronicler = (): CardDef => ({"oracleId":"a1399cb8-f22a-487e-b539-2db47b09a790","name":"Aeon Chronicler","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Creature — Avatar","supertypes":[],"types":["Creature"],"subtypes":["Avatar"],"oracleText":"Aeon Chronicler's power and toughness are each equal to the number of cards in your hand.\nSuspend X—{X}{3}{U}. X can't be 0.\nWhenever a time counter is removed from this card while it's exiled, draw a card.","power":"*","toughness":"*","colors":["U"],"colorIdentity":["U"],"keywords":["Suspend"],"commanderLegal":"legal","set":"c16","releasedAt":"2016-11-11","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const benalish = (): CardDef => ({"oracleId":"3a1e85fe-7064-4df7-bc3b-24131cd15d06","name":"Benalish Commander","manaCost":"{3}{W}","cmc":4,"typeLine":"Creature — Human Soldier","supertypes":[],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"Benalish Commander's power and toughness are each equal to the number of Soldiers you control.\nSuspend X—{X}{W}{W}. X can't be 0.\nWhenever a time counter is removed from this card while it's exiled, create a 1/1 white Soldier creature token.","power":"*","toughness":"*","colors":["W"],"colorIdentity":["W"],"keywords":["Suspend"],"commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const detritivore = (): CardDef => ({"oracleId":"ba5fa5ca-f72d-49dd-9f86-e6e1292f5bf0","name":"Detritivore","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Creature — Lhurgoyf","supertypes":[],"types":["Creature"],"subtypes":["Lhurgoyf"],"oracleText":"Detritivore's power and toughness are each equal to the number of nonbasic land cards in your opponents' graveyards.\nSuspend X—{X}{3}{R}. X can't be 0. (Rather than cast this card from your hand, you may pay {X}{3}{R} and exile it with X time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost. It has haste.)\nWhenever a time counter is removed from this card while it's exiled, destroy target nonbasic land.","power":"*","toughness":"*","colors":["R"],"colorIdentity":["R"],"keywords":["Suspend"],"commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const behemoth = (): CardDef => ({"oracleId":"844f1fb4-81d2-4a2a-9de7-20e6bf37d77b","name":"Fungal Behemoth","manaCost":"{3}{G}","cmc":4,"typeLine":"Creature — Fungus","supertypes":[],"types":["Creature"],"subtypes":["Fungus"],"oracleText":"Fungal Behemoth's power and toughness are each equal to the number of +1/+1 counters on creatures you control.\nSuspend X—{X}{G}{G}. X can't be 0. (Rather than cast this card from your hand, you may pay {X}{G}{G} and exile it with X time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost. It has haste.)\nWhenever a time counter is removed from this card while it's exiled, you may put a +1/+1 counter on target creature.","power":"*","toughness":"*","colors":["G"],"colorIdentity":["G"],"keywords":["Suspend"],"commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const dinosaurs = (): CardDef => ({"oracleId":"e3b4314b-e7a2-449a-af5a-817c8260adf1","name":"Dinosaurs on a Spaceship","manaCost":"{4}{R}{W}","cmc":6,"typeLine":"Creature — Dinosaur","supertypes":[],"types":["Creature"],"subtypes":["Dinosaur"],"oracleText":"Vigilance, trample\nOther Dinosaurs you control get +1/+1 and have vigilance and trample.\nSuspend 4—{3}{R}{W}\nWhenever a time counter is removed from this card while it's exiled, create a 2/2 red and white Dinosaur creature token with flying and haste.","power":"7","toughness":"7","colors":["R","W"],"colorIdentity":["R","W"],"keywords":["Vigilance","Suspend","Trample"],"commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const oddity = (): CardDef => ({"oracleId":"5297c493-59ec-43e9-9980-8ae03e3264d8","name":"Veiling Oddity","manaCost":"{3}{U}","cmc":4,"typeLine":"Creature — Illusion","supertypes":[],"types":["Creature"],"subtypes":["Illusion"],"oracleText":"Suspend 4—{1}{U} (Rather than cast this card from your hand, you may pay {1}{U} and exile it with four time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost. It has haste.)\nWhen the last time counter is removed from this card while it's exiled, creatures can't be blocked this turn.","power":"2","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Suspend"],"commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const attic = (): CardDef => ({"oracleId":"993b7b94-ed06-422d-9c7e-52a74ce9d045","name":"Derelict Attic // Widow's Walk","manaCost":"{2}{B} // {3}{B}","cmc":7,"typeLine":"Enchantment — Room // Enchantment — Room","supertypes":[],"types":["Enchantment"],"subtypes":["Room"],"oracleText":"When you unlock this door, you draw two cards and you lose 2 life.\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"split","gameChanger":false,"faces":[{"name":"Derelict Attic","manaCost":"{2}{B}","typeLine":"Enchantment — Room","supertypes":[],"types":["Enchantment"],"subtypes":["Room"],"oracleText":"When you unlock this door, you draw two cards and you lose 2 life.\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)","colors":["B"]},{"name":"Widow's Walk","manaCost":"{3}{B}","typeLine":"Enchantment — Room","supertypes":[],"types":["Enchantment"],"subtypes":["Room"],"oracleText":"Whenever a creature you control attacks alone, it gets +1/+0 and gains deathtouch until end of turn.\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)","colors":["B"]}]}) as CardDef;

const vanilla = (name: string, cost: string, types = "Creature — Beast") => card(name, types, cost, { power: "2", toughness: "2" });
const golem = (name: string, cost: string) => vanilla(name, cost, "Artifact Creature — Golem");

describe("round 242", () => {
  it("parse", () => {
    supported(sozin(), technomancer(), warInHeaven(), curator(), ertha(), mirrorwing(), elevator(), lounge(), hungerTide(), niv(), chronicler(), benalish(), detritivore(), behemoth(), dinosaurs(), oddity());
  });

  it("Fire Lord Sozin: pay X = 3 (firebending's mana lasts until end of combat), then creature cards with total mana value 3 or less from that player's graveyard, under your control", () => {
    const { s: s0, ap, opp } = setup([]);
    const sz = putOnBattlefield(s0, ap, sozin());
    s0.objects[sz]!.face = 1;
    invalidateCharacteristics(s0);
    expect(characteristics(s0, s0.objects[sz]!).name).toBe("Fire Lord Sozin");
    const one = into(s0, opp, vanilla("One Drop", "{B}"), "graveyard");
    const two = into(s0, opp, vanilla("Two Drop", "{1}{B}"), "graveyard");
    const three = into(s0, opp, vanilla("Three Drop", "{2}{B}"), "graveyard");
    let s = attack(passUntil(s0, "declareAttackers"), ap, [{ attacker: sz, defender: opp }]);
    // Combat damage: pay X with firebending's {R}{R}{R}, which lasts until end of combat.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payX" });
    s = act(s, { type: "chooseOption", player: ap, choice: "3" });
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: true });
    s = settle(s, { me: ap });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    // 2 + 3 is more than 3.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(two), tgt(three)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(one), tgt(two)] }), { me: ap });
    expect(zone(s, one)).toBe("battlefield");
    expect(zone(s, two)).toBe("battlefield");
    expect(zone(s, three)).toBe("graveyard");
    expect(controllerOf(s, s.objects[one]!)).toBe(ap);
    expect(controllerOf(s, s.objects[two]!)).toBe(ap);
  });

  it("Technomancer: mill three, then any number of artifact creature cards with total mana value 6 or less", () => {
    const { s: s0, ap, ids } = setup([technomancer()]);
    const g2 = into(s0, ap, golem("Golem Two", "{2}"), "graveyard");
    const g4 = into(s0, ap, golem("Golem Four", "{4}"), "graveyard");
    const g5 = into(s0, ap, golem("Golem Five", "{5}"), "graveyard");
    const beast = into(s0, ap, vanilla("Not An Artifact", "{1}"), "graveyard");
    const libBefore = s0.players[ap]!.library.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
    expect(s.players[ap]!.library.length).toBe(libBefore - 3);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, totalMv: 6, min: 0 });
    const p = s.pending!;
    if (p.kind !== "searchLibrary") throw new Error();
    expect(p.cards).toEqual(expect.arrayContaining([g2, g4, g5]));
    expect(p.cards).not.toContain(beast);
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [g2, g5] })).toThrow(/total mana value/);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [g2, g4] }), { me: ap });
    expect(zone(s, g2)).toBe("battlefield");
    expect(zone(s, g4)).toBe("battlefield");
    expect(zone(s, g5)).toBe("graveyard");
  });
});

describe("round 242: The War in Heaven, Curator, Ertha Jo, Mirrorwing Dragon", () => {
  it("The War in Heaven III: up to three creature cards with total mana value 8 or less return with a necrodermis counter, as artifacts", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, warInHeaven());
    s0.objects[w]!.counters = { lore: 2 };
    const c3 = into(s0, ap, vanilla("Three Drop", "{2}{B}"), "graveyard");
    const c5 = into(s0, ap, vanilla("Five Drop", "{4}{B}"), "graveyard");
    const c4 = into(s0, ap, vanilla("Four Drop", "{3}{B}"), "graveyard");
    onlyHand(s0, ap, []);
    let s = goUntil(s0, (x) => x.pending?.kind === "chooseTargets" && x.pending.player === ap);
    // 3 + 5 + 4 is more than 8.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(c3), tgt(c5), tgt(c4)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(c3), tgt(c5), { kind: "none" }] }), { me: ap });
    for (const id of [c3, c5]) {
      expect(zone(s, id)).toBe("battlefield");
      expect(s.objects[id]!.counters.necrodermis).toBe(1);
      expect(objIsType(s, s.objects[id]!, "Artifact")).toBe(true);
      expect(objIsType(s, s.objects[id]!, "Creature")).toBe(true);
    }
    expect(zone(s, c4)).toBe("graveyard");
  });

  it("Curator of Sun's Creation: a discover triggers one more for the same value, only once each turn", () => {
    const disc = card("Test Discovery", "Sorcery", "{1}", { oracleText: "Discover 3." });
    const disc2 = card("Test Discovery Two", "Sorcery", "{1}", { oracleText: "Discover 3." });
    const { s: s0, ap, ids } = setup([disc, disc2]);
    putOnBattlefield(s0, ap, curator());
    const tops = [vanilla("Top One", "{2}"), vanilla("Top Two", "{2}"), vanilla("Top Three", "{2}")].map((d) => into(s0, ap, d, "library"));
    // The first card of the library is the last one put there.
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const found: string[] = [];
    for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "castFree" && p.player === ap) {
        found.push(p.objectId);
        s = act(s, { type: "chooseMay", player: ap, yes: false });
      } else if (p && p.player !== ap) s = act(s, botActions(s, p.player)[0]!);
      else if (p) throw new Error(`unexpected ${p.kind}`);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    // Two discovers: the spell's and the Curator's, each finding a card that went to the hand.
    expect(found).toEqual([tops[2], tops[1]]);
    expect(zone(s, tops[2]!)).toBe("hand");
    expect(zone(s, tops[1]!)).toBe("hand");
    expect(s.log.filter((l) => /discovers 3/.test(l.text))).toHaveLength(2);
    // Once each turn: another discover this turn doesn't trigger it.
    s = run(s, planCast(s, ap, ids[1]!));
    let more = 0;
    for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "castFree" && p.player === ap) {
        more++;
        s = act(s, { type: "chooseMay", player: ap, yes: false });
      } else if (p && p.player !== ap) s = act(s, botActions(s, p.player)[0]!);
      else if (p) throw new Error(`unexpected ${p.kind}`);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(more).toBe(1);
  });

  it("Ertha Jo: an activated ability that targets a creature is copied, with new targets; one targeting only an artifact isn't", () => {
    const pinger = card("Test Pinger", "Artifact", "{1}", { oracleText: "{T}: This artifact deals 1 damage to any target." });
    const shatterer = card("Test Shatterer", "Artifact", "{1}", { oracleText: "{T}: Destroy target artifact." });
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, ertha());
    const p = putOnBattlefield(s0, ap, pinger);
    const sh = putOnBattlefield(s0, ap, shatterer);
    const a = putOnBattlefield(s0, opp, card("Their Bauble", "Artifact", "{1}"));
    const b1 = putOnBattlefield(s0, opp, card("Small One", "Creature — Elf", "{G}", { power: "1", toughness: "1" }));
    const b2 = putOnBattlefield(s0, opp, card("Small Two", "Creature — Elf", "{G}", { power: "1", toughness: "1" }));
    let s = run(s0, planActivate(s0, ap, p, 0, [tgt(b1)]));
    expect(s.triggerQueue.length + s.stack.length).toBe(2);
    s = settle(s, { me: ap });
    // The copy: new targets may be chosen.
    expect(s.pending).toMatchObject({ player: ap });
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending?.kind).toBe("copyTargets");
    s = act(s, { type: "copyTargets", player: ap, targets: [tgt(b2)] });
    s = settle(s, { me: ap });
    expect(zone(s, b1)).toBe("graveyard");
    expect(zone(s, b2)).toBe("graveyard");
    // Only an artifact: no copy.
    s = run(s, planActivate(s, ap, sh, 0, [tgt(a)]));
    expect(s.triggerQueue).toHaveLength(0);
    expect(s.stack).toHaveLength(1);
  });

  it("Mirrorwing Dragon: a spell that targets only it is copied for each other creature its caster controls", () => {
    const growth = card("Test Growth", "Instant", "{G}", { oracleText: "Target creature gets +3/+3 until end of turn." });
    const { s: s0, ap, opp, ids } = setup([growth]);
    // The Dragon is the opponent's: the copies are for the caster's creatures (rulings).
    const d = putOnBattlefield(s0, opp, mirrorwing());
    const mine1 = putOnBattlefield(s0, ap, vanilla("Mine One", "{1}"));
    const mine2 = putOnBattlefield(s0, ap, vanilla("Mine Two", "{1}"));
    const theirs = putOnBattlefield(s0, opp, vanilla("Theirs", "{1}"));
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(d)]));
    s = settle(s, { me: ap });
    // The caster orders the copies: only their own creatures are offered.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "copyOrder", player: ap });
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([mine1, mine2].sort());
    s = act(s, { type: "chooseOption", player: ap, choice: mine1 });
    expect(s.stack.filter((x) => x.copy).every((x) => x.controller === ap)).toBe(true);
    s = settle(s, { me: ap });
    const p = (id: string) => characteristics(s, s.objects[id]!).power;
    expect(p(mine1)).toBe(5);
    expect(p(mine2)).toBe(5);
    expect(p(theirs)).toBe(2);
    expect(p(d)).toBe(7);
  });
});

const renamed = (def: CardDef, a: string, b: string, id: string): CardDef => ({ ...def, oracleId: id, name: `${a} // ${b}`, faces: def.faces!.map((f, i) => ({ ...f, name: i ? b : a })) });
const unlockedRoom = (s: GameState, pid: PlayerId, def: CardDef, doors: number[]) => {
  const id = putOnBattlefield(s, pid, def);
  s.objects[id]!.unlocked = doors;
  invalidateCharacteristics(s);
  return id;
};

describe("round 242: Rooms", () => {
  it("Central Elevator: finds a Room card that shares no name with an unlocked door of a Room you control", () => {
    const { s: s0, ap, opp } = setup([]);
    const el = putOnBattlefield(s0, ap, elevator());
    unlockedRoom(s0, ap, attic(), [1]); // Widow's Walk unlocked: named Widow's Walk only
    unlockedRoom(s0, ap, renamed(attic(), "Locked One", "Locked Two", "room-locked"), []); // no name at all
    unlockedRoom(s0, opp, lounge(), [0, 1]); // not yours
    const atticCard = into(s0, ap, attic(), "library");
    const lockedCard = into(s0, ap, renamed(attic(), "Locked One", "Locked Two", "room-locked"), "library");
    const loungeCard = into(s0, ap, lounge(), "library");
    const elevatorCard = into(s0, ap, elevator(), "library");
    const plan = planUnlock(s0, ap, el, 0);
    expect(plan).not.toBeNull();
    let s = settle(run(s0, plan), { me: ap });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const cards = (s.pending as { cards: ObjectId[] }).cards;
    // Derelict Attic // Widow's Walk shares Widow's Walk; another Central Elevator shares the door just unlocked.
    expect(cards).toContain(lockedCard);
    expect(cards).toContain(loungeCard);
    expect(cards).not.toContain(atticCard);
    expect(cards).not.toContain(elevatorCard);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [loungeCard] }), { me: ap });
    expect(zone(s, loungeCard)).toBe("hand");
  });

  it("Promising Stairs: in your upkeep, surveil 1; eight different names among unlocked doors win the game", () => {
    for (const rooms of [3, 4]) {
      const { s: s0, ap } = setup([]);
      unlockedRoom(s0, ap, elevator(), [0, 1]);
      unlockedRoom(s0, ap, lounge(), [0, 1]);
      unlockedRoom(s0, ap, attic(), [0, 1]);
      unlockedRoom(s0, ap, attic(), [0, 1]); // the same names again
      if (rooms === 4) unlockedRoom(s0, ap, renamed(attic(), "Eighth Door", "Seventh Door", "room-78"), [0, 1]);
      let s = goUntil(s0, (x) => x.activePlayer === ap && x.step === "upkeep" && x.turn > s0.turn);
      for (let i = 0; i < 50 && !s.winner && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
        const p = s.pending;
        if (p?.kind === "arrangeTop" && p.player === ap) s = act(s, { type: "arrangeTop", player: ap, top: p.cards, away: [] });
        else if (p) s = act(s, botActions(s, p.player)[0]!);
        else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
      expect(s.winner ?? null, `${rooms} rooms`).toBe(rooms === 4 ? ap : null);
    }
  });

  it("Smoky Lounge's {R}{R} pays to unlock a door but not for other spells; Misty Salon's Spirit counts unlocked doors", () => {
    const shock = card("Test Shock", "Instant", "{R}{R}", { oracleText: "Test Shock deals 2 damage to any target." });
    const { s: s0, ap } = setup([shock]);
    const sh = s0.players[ap]!.hand[0]!;
    const room = unlockedRoom(s0, ap, lounge(), [0]);
    unlockedRoom(s0, ap, attic(), [0, 1]);
    let s = goUntil(s0, (x) => x.activePlayer === ap && x.step === "main1" && x.turn > s0.turn);
    s = settle(s, { me: ap });
    // Only two Islands untapped: {R}{R} from the Lounge and {U}{U} from them pay {3}{U}; Test Shock can't use it.
    let islands = 0;
    for (const id of s.battlefield) {
      const o = s.objects[id]!;
      if (o.controller !== ap || !objIsType(s, o, "Land")) continue;
      if (s.cards[o.cardId]!.name === "Island" && islands < 2) islands++;
      else o.tapped = true;
    }
    expect(s.players[ap]!.manaPool.R).toBe(2);
    expect(planCast(s, ap, sh, [{ kind: "player", id: ap }])).toBeNull();
    const plan = planUnlock(s, ap, room, 1);
    expect(plan).not.toBeNull();
    s = settle(run(s, plan), { me: ap });
    const spirit = s.battlefield.find((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Spirit"))!;
    expect(spirit).toBeDefined();
    // Four unlocked doors: both of this Room's and both of the other's.
    expect(characteristics(s, s.objects[spirit]!).power).toBe(4);
    expect(characteristics(s, s.objects[spirit]!).toughness).toBe(4);
  });
});

describe("round 242: The Hunger Tide Rises, Niv-Mizzet Reborn", () => {
  it("The Hunger Tide Rises IV: sacrifice any number of creatures, then a creature card with mana value up to that many", () => {
    const { s: s0, ap } = setup([]);
    const saga = putOnBattlefield(s0, ap, hungerTide());
    s0.objects[saga]!.counters.lore = 3;
    const fodder = [putOnBattlefield(s0, ap, vanilla("Fodder A", "{1}")), putOnBattlefield(s0, ap, vanilla("Fodder B", "{1}"))];
    const two = into(s0, ap, vanilla("Two Drop", "{1}{G}"), "graveyard");
    const three = into(s0, ap, vanilla("Three Drop", "{2}{G}"), "library");
    let s = goUntil(s0, (x) => x.activePlayer === ap && x.step === "main1" && x.turn > s0.turn);
    for (let i = 0; i < 20 && !(s.pending && s.pending.player === ap); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "sacrifice", anyNumber: true, min: 0 });
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([...fodder].sort());
    s = act(s, { type: "pickPermanents", player: ap, ids: fodder });
    for (let i = 0; i < 20 && !(s.pending && s.pending.player === ap); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "searchZones" });
    s = act(s, { type: "chooseOption", player: ap, choice: "both" });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    // Two creatures sacrificed: mana value 2 or less, from the library or the graveyard.
    const cards = (s.pending as { cards: ObjectId[] }).cards;
    expect(cards).toContain(two);
    expect(cards).not.toContain(three);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [two] }), { me: ap });
    expect(zone(s, two)).toBe("battlefield");
    expect(fodder.map((id) => zone(s, id))).toEqual(["graveyard", "graveyard"]);
  });
});

describe("round 242: Niv-Mizzet Reborn", () => {
  it("reveals ten; one card that's exactly each color pair goes to the hand, the rest to the bottom", () => {
    const { s: s0, ap, ids } = setup([niv()]);
    const top = (name: string, cost: string) => into(s0, ap, card(name, "Instant", cost), "library");
    const tri = top("Three Colors", "{W}{U}{R}");
    const mono = top("Just Red", "{R}");
    const ub = top("Blue Black", "{U}{B}");
    const wu2 = top("White Blue Two", "{W}{U}");
    const wu1 = top("White Blue One", "{W}{U}");
    const tenth = s0.players[ap]!.library[9]!;
    const eleventh = top("Out of Reach", "{B}{G}"); // pushed down to 11th below
    s0.players[ap]!.library.splice(s0.players[ap]!.library.indexOf(eleventh), 1);
    s0.players[ap]!.library.splice(10, 0, eleventh);
    expect(s0.players[ap]!.library[9]).not.toBe(eleventh);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s, { me: ap });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 2, max: 2 });
    const cards = (s.pending as { cards: ObjectId[] }).cards;
    expect([...cards].sort()).toEqual([wu1, wu2, ub].sort());
    // Two cards of the same pair can't both be chosen.
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [wu1, wu2] })).toThrow();
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [wu1] })).toThrow();
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [wu1, ub] }), { me: ap });
    expect([wu1, ub].map((id) => zone(s, id))).toEqual(["hand", "hand"]);
    const lib = s.players[ap]!.library;
    // The other eight go to the bottom.
    for (const id of [wu2, mono, tri, tenth]) expect(lib.indexOf(id)).toBeGreaterThanOrEqual(lib.length - 8);
    expect(lib.indexOf(eleventh)).toBe(0);
  });
});

/** To `pid`'s next upkeep, then everything there resolves (`me` answers nothing: trigger targets come from `targets`). */
const nextUpkeep = (s0: GameState, pid: PlayerId, targets?: TargetChoice[]) => {
  const s = goUntil(s0, (x) => x.activePlayer === pid && x.step === "upkeep" && x.turn > s0.turn);
  return settle(s, { me: pid, targets });
};

describe("round 242: suspend X", () => {
  it("Aeon Chronicler: X can't be 0; it's exiled with X time counters, and each one removed draws a card", () => {
    const { s: s0, ap, ids } = setup([chronicler()]);
    const ac = ids[0]!;
    expect(suspendProblem(s0, ap, ac, 0)).toBe("X can't be 0");
    expect(planSuspend(s0, ap, ac, 0)).toBeNull();
    expect(suspendProblem(s0, ap, ac, 3)).toMatch(/not enough mana .* with X=3/); // nothing in the pool yet
    // With mana in the pool, suspending it is a legal action (X = 1 unless chosen).
    const pooled = structuredClone(s0);
    pooled.players[ap]!.manaPool.U = 5;
    expect(legalActions(pooled, ap)).toContainEqual({ type: "suspend", player: ap, objectId: ac, x: 1 });
    // {X}{3}{U} with X = 3: seven mana.
    const untapped = (s: GameState) => s.battlefield.filter((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped).length;
    const before = untapped(s0);
    let s = run(s0, planSuspend(s0, ap, ac, 3));
    expect(untapped(s)).toBe(before - 7);
    expect(zone(s, ac)).toBe("exile");
    expect(s.objects[ac]!.counters.time).toBe(3);
    s = goUntil(s, (x) => x.activePlayer === ap && x.step === "upkeep" && x.turn > s0.turn);
    const hand = s.players[ap]!.hand.length;
    s = settle(s, { me: ap });
    expect(s.objects[ac]!.counters.time).toBe(2);
    expect(s.players[ap]!.hand.length).toBe(hand + 1); // the draw step hasn't come yet
  });

  it("Benalish Commander, Dinosaurs on a Spaceship: a token for each time counter removed in exile", () => {
    const { s: s0, ap, ids } = setup([benalish(), dinosaurs()]);
    const [bc, dino] = ids as [ObjectId, ObjectId];
    let s = run(s0, planSuspend(s0, ap, bc, 2));
    s = run(s, planSuspend(s, ap, dino));
    expect(s.objects[dino]!.counters.time).toBe(4);
    s = nextUpkeep(s, ap);
    const tokens = (sub: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes(sub));
    expect(tokens("Soldier")).toHaveLength(1);
    expect(tokens("Dinosaur")).toHaveLength(1);
    const d = s.objects[tokens("Dinosaur")[0]!]!;
    expect(characteristics(s, d).keywords).toEqual(expect.arrayContaining(["Flying", "Haste"]));
  });

  it("Detritivore destroys a target nonbasic land; Fungal Behemoth may put a +1/+1 counter on a creature", () => {
    const { s: s0, ap, ids, opp } = setup([detritivore(), behemoth()]);
    const [det, fb] = ids as [ObjectId, ObjectId];
    const dual = putOnBattlefield(s0, opp, card("Test Dual", "Land"));
    const bear = putOnBattlefield(s0, ap, vanilla("Counter Bear", "{1}"));
    let s = run(s0, planSuspend(s0, ap, det, 2));
    s = run(s, planSuspend(s, ap, fb, 2));
    s = goUntil(s, (x) => x.activePlayer === ap && x.step === "upkeep" && x.turn > s0.turn);
    for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const p = s.pending;
      if (p?.kind === "chooseTargets" && p.player === ap) s = act(s, { type: "chooseTargets", player: ap, targets: /^Detritivore/.test(p.description ?? "") ? [tgt(dual)] : [tgt(bear)] });
      else if (p?.kind === "chooseMay" && p.player === ap) s = act(s, { type: "chooseMay", player: ap, yes: true });
      else if (p) s = act(s, botActions(s, p.player)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(zone(s, dual)).toBe("graveyard");
    expect(s.objects[bear]!.counters["+1/+1"]).toBe(1);
  });

  it("Veiling Oddity: when the last time counter is removed in exile, creatures can't be blocked this turn", () => {
    const { s: s0, ap, ids } = setup([oddity()]);
    const vo = ids[0]!;
    let s = run(s0, planSuspend(s0, ap, vo));
    s.objects[vo]!.counters.time = 1; // three upkeeps later
    s = goUntil(s, (x) => x.activePlayer === ap && x.step === "upkeep" && x.turn > s0.turn);
    for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      const p = s.pending;
      if ((p?.kind === "chooseMay" || p?.kind === "castFree") && p.player === ap) s = act(s, { type: "chooseMay", player: ap, yes: false });
      else if (p && p.player === ap) throw new Error(`unexpected ${p.kind}`);
      else if (p) s = act(s, botActions(s, p.player)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.cantBeBlockedThisTurn).toEqual([expect.objectContaining({ controller: ap, filter: expect.objectContaining({ types: ["Creature"] }) })]);
    // Declined: it stays in exile, no longer suspended.
    expect(zone(s, vo)).toBe("exile");
  });
});
