// Lane B round B113: Joust ("+2/+1 if it's a Knight", then they fight), Unnatural Aggression (the creature an opponent
// controls is exiled if it would die this turn), Guul Draz Overseer ("If that land is a Swamp, ... +2/+0 instead"),
// Angry Mob (a characteristic-defining ability that depends on whose turn it is), Mark for Death (blocks if able, the
// player's other creatures can't block), Swallow Whole (a counter on the creature tapped for its additional cost),
// Roving Keep ("It can attack this turn as though it didn't have defender"), Slab Hammer ("If you do, the creature gets
// +2/+2"), Primordial Ooze (pay {X} for its counters or be tapped and take X damage), Dead Reckoning (a card from your
// graveyard on top, then damage equal to its power), Not Forgotten (top or bottom, your choice), Grim Contest (each deals
// damage equal to its toughness to the other).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { blockProblem, botActions, cantBlockNow, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, potentialAttackers, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const attach = (s: GameState, aura: string, to: string) => {
  s.objects[aura]!.attachedTo = to;
  invalidateCharacteristics(s);
};
/** To the next upkeep of `pid`, from wherever the game is now. */
const toUpkeep = (s: GameState, pid: PlayerId) => passUntil(passUntil(s, "end", s.activePlayer), "upkeep", pid);

// Real oracle text (Scryfall).
const joust = (): CardDef => ({"oracleId":"8584e96f-a3e7-475c-bfd1-2c9a72bee774","name":"Joust","manaCost":"{1}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose target creature you control and target creature you don't control. The creature you control gets +2/+1 until end of turn if it's a Knight. Then those creatures fight each other. (Each deals damage equal to its power to the other.)","colors":["R"],"colorIdentity":["R"],"keywords":["Fight"],"imageUrl":"https://cards.scryfall.io/normal/front/5/e/5e725f04-5530-47f1-9f04-4cc13ed9348b.jpg?1783932622","artUrl":"https://cards.scryfall.io/art_crop/front/5/e/5e725f04-5530-47f1-9f04-4cc13ed9348b.jpg?1783932622","commanderLegal":"legal","set":"eld","releasedAt":"2019-10-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const aggression = (): CardDef => ({"oracleId":"597d1dce-67e8-4c37-9781-eeaeb7c2d7b7","name":"Unnatural Aggression","manaCost":"{2}{G}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Devoid (This card has no color.)\nTarget creature you control fights target creature an opponent controls. If the creature an opponent controls would die this turn, exile it instead.","colors":[],"colorIdentity":["G"],"keywords":["Devoid","Fight"],"imageUrl":"https://cards.scryfall.io/normal/front/8/2/8293c66d-9a9b-4817-9bc3-ffd57fda290c.jpg?1783938189","artUrl":"https://cards.scryfall.io/art_crop/front/8/2/8293c66d-9a9b-4817-9bc3-ffd57fda290c.jpg?1783938189","commanderLegal":"legal","set":"bfz","releasedAt":"2015-10-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const overseer = (): CardDef => ({"oracleId":"9eff1ce5-41e4-4ae6-9480-2b549c8546bd","name":"Guul Draz Overseer","manaCost":"{4}{B}{B}","cmc":6,"typeLine":"Creature — Vampire","supertypes":[],"types":["Creature"],"subtypes":["Vampire"],"oracleText":"Flying\nLandfall — Whenever a land you control enters, other creatures you control get +1/+0 until end of turn. If that land is a Swamp, those creatures get +2/+0 until end of turn instead.","power":"3","toughness":"4","colors":["B"],"colorIdentity":["B"],"keywords":["Landfall","Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/7/9/793bb4e0-8fdd-440e-9e6e-92a899794cae.jpg?1783938201","artUrl":"https://cards.scryfall.io/art_crop/front/7/9/793bb4e0-8fdd-440e-9e6e-92a899794cae.jpg?1783938201","commanderLegal":"legal","set":"bfz","releasedAt":"2015-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const mob = (): CardDef => ({"oracleId":"967c2c79-7e49-448d-8d30-b2eb08b21d0a","name":"Angry Mob","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Creature — Human","supertypes":[],"types":["Creature"],"subtypes":["Human"],"oracleText":"Trample\nDuring your turn, Angry Mob's power and toughness are each equal to 2 plus the number of Swamps your opponents control. During turns other than yours, Angry Mob's power and toughness are each 2.","power":"2+*","toughness":"2+*","colors":["W"],"colorIdentity":["W"],"keywords":["Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/9/e/9e14db1c-0a05-47d2-9f27-df881f7f37ab.jpg?1783947950","artUrl":"https://cards.scryfall.io/art_crop/front/9/e/9e14db1c-0a05-47d2-9f27-df881f7f37ab.jpg?1783947950","commanderLegal":"legal","set":"drk","releasedAt":"1994-08-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const mark = (): CardDef => ({"oracleId":"ad2e4ab0-d990-472d-8788-3f85215da51c","name":"Mark for Death","manaCost":"{3}{R}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target creature an opponent controls blocks this turn if able. Untap that creature. Other creatures that player controls can't block this turn.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/5/45498dbd-a512-4299-800b-06c15a4fd94e.jpg?1783940123","artUrl":"https://cards.scryfall.io/art_crop/front/4/5/45498dbd-a512-4299-800b-06c15a4fd94e.jpg?1783940123","commanderLegal":"legal","set":"gtc","releasedAt":"2013-02-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const swallow = (): CardDef => ({"oracleId":"54d4c632-1e7c-42f1-938c-9b4bd9b9a9b9","name":"Swallow Whole","manaCost":"{W}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"As an additional cost to cast this spell, tap an untapped creature you control.\nExile target tapped creature. Put a +1/+1 counter on the creature tapped to pay this spell's additional cost.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/3/c3b9140b-848f-4886-8c28-eccd3829a607.jpg?1783931081","artUrl":"https://cards.scryfall.io/art_crop/front/c/3/c3b9140b-848f-4886-8c28-eccd3829a607.jpg?1783931081","commanderLegal":"legal","set":"iko","releasedAt":"2020-04-24","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const keep = (): CardDef => ({"oracleId":"6a88784c-d3be-4076-83eb-895cc1b50947","name":"Roving Keep","manaCost":"{7}","cmc":7,"typeLine":"Artifact Creature — Wall","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Wall"],"oracleText":"Defender\n{7}: This creature gets +2/+0 and gains trample until end of turn. It can attack this turn as though it didn't have defender.","power":"5","toughness":"7","colors":[],"colorIdentity":[],"keywords":["Defender"],"imageUrl":"https://cards.scryfall.io/normal/front/3/8/38a0136e-a637-4a12-a38f-35f772b290a9.jpg?1783932583","artUrl":"https://cards.scryfall.io/art_crop/front/3/8/38a0136e-a637-4a12-a38f-35f772b290a9.jpg?1783932583","commanderLegal":"legal","set":"eld","releasedAt":"2019-10-04","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const hammer = (): CardDef => ({"oracleId":"f353948c-b5f9-4840-a89a-19206dde9d47","name":"Slab Hammer","manaCost":"{2}","cmc":2,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Whenever equipped creature attacks, you may return a land you control to its owner's hand. If you do, the creature gets +2/+2 until end of turn.\nEquip {2}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/1/8/18c64671-9bdd-475f-8def-7575775bf900.jpg?1783938176","artUrl":"https://cards.scryfall.io/art_crop/front/1/8/18c64671-9bdd-475f-8def-7575775bf900.jpg?1783938176","commanderLegal":"legal","set":"bfz","releasedAt":"2015-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const ooze = (): CardDef => ({"oracleId":"133109c3-a2ca-4231-b3b1-baa700800b07","name":"Primordial Ooze","manaCost":"{R}","cmc":1,"typeLine":"Creature — Ooze","supertypes":[],"types":["Creature"],"subtypes":["Ooze"],"oracleText":"This creature attacks each combat if able.\nAt the beginning of your upkeep, put a +1/+1 counter on this creature. Then you may pay {X}, where X is the number of +1/+1 counters on it. If you don't, tap this creature and it deals X damage to you.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a46e47e1-8639-48f7-94c4-5f9e9666839a.jpg?1783948053","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a46e47e1-8639-48f7-94c4-5f9e9666839a.jpg?1783948053","commanderLegal":"legal","set":"leg","releasedAt":"1994-06-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const reckoning = (): CardDef => ({"oracleId":"2a4b77f0-81ac-48a6-961b-bd63e99f74cf","name":"Dead Reckoning","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"You may put target creature card from your graveyard on top of your library. If you do, Dead Reckoning deals damage equal to that card's power to target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/d/ad16a3b8-e99e-47ed-92ce-ef42310f9f46.jpg?1783942056","artUrl":"https://cards.scryfall.io/art_crop/front/a/d/ad16a3b8-e99e-47ed-92ce-ef42310f9f46.jpg?1783942056","commanderLegal":"legal","set":"wwk","releasedAt":"2010-02-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const forgotten = (): CardDef => ({"oracleId":"e0fa6d08-1808-4a29-b1e4-5cec9d31d798","name":"Not Forgotten","manaCost":"{1}{W}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Put target card from a graveyard on your choice of the top or bottom of its owner's library. Create a 1/1 white Spirit creature token with flying.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/6/66ecdadf-56f7-4dfb-9c3c-7d240ba19b00.jpg?1783937815","artUrl":"https://cards.scryfall.io/art_crop/front/6/6/66ecdadf-56f7-4dfb-9c3c-7d240ba19b00.jpg?1783937815","commanderLegal":"legal","set":"soi","releasedAt":"2016-04-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const contest = (): CardDef => ({"oracleId":"3b78f940-f840-4d4d-a09b-147202963367","name":"Grim Contest","manaCost":"{1}{B}{G}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose target creature you control and target creature an opponent controls. Each of those creatures deals damage equal to its toughness to the other.","colors":["B","G"],"colorIdentity":["B","G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24c44722-c65a-41ae-92a9-9c9d7d759a8e.jpg?1783938673","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24c44722-c65a-41ae-92a9-9c9d7d759a8e.jpg?1783938673","commanderLegal":"legal","set":"frf","releasedAt":"2015-01-23","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

// Test cards.
const knight = card("Test Knight", "Creature — Human Knight", "{1}{W}", { cmc: 2, power: "2", toughness: "2", colors: ["W"] });
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { cmc: 3, power: "3", toughness: "3", colors: ["R"] });
const wall = card("Test Wall", "Creature — Wall", "{1}{W}", { cmc: 2, power: "0", toughness: "4", colors: ["W"], keywords: ["Defender"], oracleText: "Defender" });
const kill = card("Test Kill", "Instant", "{0}", { oracleText: "Destroy target creature." });
const tapper = card("Test Tapper", "Instant", "{0}", { oracleText: "Tap target creature." });
const swampCard = card("Test Swamp", "Basic Land — Swamp", "", { supertypes: ["Basic"] });
const bigBear = card("Test Lhurgoyf", "Creature — Lhurgoyf", "{2}{G}", { cmc: 3, power: "4", toughness: "4", colors: ["G"] });

describe("Lane B round B113", () => {
  it("all twelve cards are supported", () =>
    supported(joust(), aggression(), overseer(), mob(), mark(), swallow(), keep(), hammer(), ooze(), reckoning(), forgotten(), contest()));

  it("Joust: the creature you control gets +2/+1 only if it's a Knight, then they fight", () => {
    let { s, ap, opp, ids } = setup([joust(), joust()]);
    const k = putOnBattlefield(s, ap, knight);
    const b1 = putOnBattlefield(s, opp, bear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(k), tgt(b1)])));
    // A 4/3 Knight deals 4 and takes 2.
    expect(zone(s, b1)).toBe("graveyard");
    expect(zone(s, k)).toBe("battlefield");
    expect(pt(s, k)).toBe("4/3");
    expect(s.objects[k]!.damage).toBe(2);
    // Not a Knight: no bonus, so two 2/2s both die.
    const mine = putOnBattlefield(s, ap, bear());
    const b2 = putOnBattlefield(s, opp, bear());
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(mine), tgt(b2)])));
    expect(zone(s, mine)).toBe("graveyard");
    expect(zone(s, b2)).toBe("graveyard");
  });

  it("Joust: with the other target gone, the Knight still gets +2/+1 but nothing fights", () => {
    let { s, ap, opp, ids } = setup([joust(), kill]);
    const k = putOnBattlefield(s, ap, knight);
    const b = putOnBattlefield(s, opp, bear());
    s = run(s, planCast(s, ap, ids[0]!, [tgt(k), tgt(b)]));
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(b)])));
    expect(pt(s, k)).toBe("4/3");
    expect(s.objects[k]!.damage).toBe(0);
  });

  it("Unnatural Aggression: the creature an opponent controls is exiled if it dies from the fight, or later this turn", () => {
    let { s, ap, opp, ids } = setup([aggression(), aggression(), kill]);
    const o = putOnBattlefield(s, ap, ogre);
    const b = putOnBattlefield(s, opp, bear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(o), tgt(b)])));
    expect(zone(s, b)).toBe("exile");
    // A bigger opponent's creature survives the fight; destroyed later this turn, it's exiled too. Ours isn't.
    const mine = putOnBattlefield(s, ap, bear());
    const big = putOnBattlefield(s, opp, ogre);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(mine), tgt(big)])));
    expect(zone(s, mine)).toBe("graveyard");
    expect(zone(s, big)).toBe("battlefield");
    s = settle(run(s, planCast(s, ap, ids[2]!, [tgt(big)])));
    expect(zone(s, big)).toBe("exile");
  });

  it("Guul Draz Overseer: other creatures you control get +1/+0, or +2/+0 if the land is a Swamp", () => {
    let { s, ap, ids } = setup([forest, swampCard]);
    const g = putOnBattlefield(s, ap, overseer());
    const b = putOnBattlefield(s, ap, bear());
    s = settle(act(s, { type: "playLand", player: ap, objectId: ids[0]! }));
    expect(pt(s, b)).toBe("3/2");
    expect(pt(s, g)).toBe("3/4");
    // Another land the next turn: a Swamp gives +2/+0.
    s = passUntil(passUntil(s, "end", ap), "main1", ap);
    expect(pt(s, b)).toBe("2/2");
    s = settle(act(s, { type: "playLand", player: ap, objectId: ids[1]! }));
    expect(pt(s, b)).toBe("4/2");
    expect(pt(s, g)).toBe("3/4");
  });

  it("Angry Mob: 2 plus the Swamps your opponents control during your turn, 2/2 during other turns", () => {
    let { s, ap, opp } = setup([]);
    const m = putOnBattlefield(s, ap, mob());
    // Your own two Swamps don't count; three of opponents' do.
    putOnBattlefield(s, opp, swampCard);
    putOnBattlefield(s, opp, swampCard);
    putOnBattlefield(s, next(s, ap, 2), swampCard);
    invalidateCharacteristics(s);
    expect(pt(s, m)).toBe("5/5");
    expect(objHasKeyword(s, s.objects[m]!, "Trample")).toBe(true);
    s = passUntil(s, "upkeep", opp);
    expect(pt(s, m)).toBe("2/2");
    // In your hand during your turn, it's the same (CR 604.3).
    s = passUntil(s, "main1", ap);
    const inHand = into(s, ap, mob(), "hand");
    expect(characteristics(s, s.objects[inHand]!).power).toBe(5);
    expect(characteristics(s, s.objects[inHand]!).toughness).toBe(5);
    expect(pt(s, m)).toBe("5/5");
  });

  it("Mark for Death: the target is untapped and must block; that player's other creatures can't block this turn, even new ones", () => {
    let { s, ap, opp, ids } = setup([tapper, mark()]);
    const other = next(s, ap, 2);
    const target = putOnBattlefield(s, opp, bear());
    const theirOther = putOnBattlefield(s, opp, ogre);
    const elsewhere = putOnBattlefield(s, other, bear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(target)])));
    expect(s.objects[target]!.tapped).toBe(true);
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(target)])));
    expect(s.objects[target]!.tapped).toBe(false);
    expect(characteristics(s, s.objects[target]!).mustBlock).toBeTruthy();
    expect(cantBlockNow(s, s.objects[target]!)).toBe(false);
    expect(cantBlockNow(s, s.objects[theirOther]!)).toBe(true);
    expect(cantBlockNow(s, s.objects[elsewhere]!)).toBe(false);
    // A creature that player gets later this turn can't block either (a rule for the turn, not a change to those there).
    const later = putOnBattlefield(s, opp, bear());
    invalidateCharacteristics(s);
    expect(cantBlockNow(s, s.objects[later]!)).toBe(true);
    // An attacker it could block: blocking with the other creature is refused.
    const a = putOnBattlefield(s, ap, bear());
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    expect(blockProblem(s, s.objects[theirOther]!, s.objects[a]!)).not.toBeNull();
    expect(blockProblem(s, s.objects[target]!, s.objects[a]!)).toBeNull();
  });

  it("Swallow Whole: exiles a tapped creature and puts a +1/+1 counter on the creature tapped to cast it", () => {
    let { s, ap, opp, ids } = setup([tapper, swallow()]);
    const mine = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, ogre);
    // The target must already be tapped.
    expect(planCast(s, ap, ids[1]!, [tgt(theirs)], undefined, undefined, undefined, { tap: [mine] })).toBeNull();
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(theirs)])));
    s = run(s, planCast(s, ap, ids[1]!, [tgt(theirs)], undefined, undefined, undefined, { tap: [mine] }));
    expect(s.objects[mine]!.tapped).toBe(true);
    // Untapped again before it resolves: still the creature tapped to pay the cost (rulings).
    s.objects[mine]!.tapped = false;
    s = settle(s);
    expect(zone(s, theirs)).toBe("exile");
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(1);
    expect(pt(s, mine)).toBe("3/3");
  });

  it("Swallow Whole: no counter if the target is gone", () => {
    let { s, ap, opp, ids } = setup([tapper, swallow(), kill]);
    const mine = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, ogre);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(theirs)])));
    s = run(s, planCast(s, ap, ids[1]!, [tgt(theirs)], undefined, undefined, undefined, { tap: [mine] }));
    s = settle(run(s, planCast(s, ap, ids[2]!, [tgt(theirs)])));
    expect(zone(s, theirs)).toBe("graveyard");
    expect(s.objects[mine]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Roving Keep: {7} gives +2/+0 and trample, and lets it attack this turn despite defender", () => {
    let { s, ap } = setup([]);
    const k = putOnBattlefield(s, ap, keep());
    expect(potentialAttackers(s, ap).map((o) => o.id)).not.toContain(k);
    s.players[ap]!.manaPool.C = 7;
    s = settle(run(s, planActivate(s, ap, k, 0, [])));
    expect(pt(s, k)).toBe("7/7");
    expect(objHasKeyword(s, s.objects[k]!, "Trample")).toBe(true);
    expect(potentialAttackers(s, ap).map((o) => o.id)).toContain(k);
    // Only this turn.
    s = passUntil(passUntil(s, "end", ap), "main1", ap);
    expect(potentialAttackers(s, ap).map((o) => o.id)).not.toContain(k);
    expect(pt(s, k)).toBe("5/7");
  });

  it("Slab Hammer: returning a land as the equipped creature attacks gives it +2/+2; declining doesn't", () => {
    for (const yes of [true, false]) {
      let { s, ap, opp } = setup([]);
      const b = putOnBattlefield(s, ap, bear());
      const h = putOnBattlefield(s, ap, hammer());
      attach(s, h, b);
      const lands = s.players[ap]!.hand.length;
      s = passUntil(s, "declareAttackers", ap);
      s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] }), { me: [ap] });
      expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
      s = settle(act(s, { type: "chooseMay", player: ap, yes }), { me: [ap] });
      if (yes) {
        expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap });
        const p = s.pending!;
        if (p.kind !== "pickPermanents") throw new Error("no pick");
        expect(p.options.every((id) => s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).types.includes("Land"))).toBe(true);
        s = settle(act(s, { type: "pickPermanents", player: ap, ids: [p.options[0]!] }));
      }
      expect(pt(s, b), String(yes)).toBe(yes ? "4/4" : "2/2");
      expect(s.players[ap]!.hand.length).toBe(lands + (yes ? 1 : 0));
    }
  });

  it("Primordial Ooze: a counter each upkeep; paying {X} keeps it untapped, not paying taps it and deals X damage to you", () => {
    for (const yes of [true, false]) {
      let { s, ap } = setup([]);
      // Already one counter: X is 2 once the new one is on (summoning sick, so it needn't attack this turn).
      const o = putOnBattlefield(s, ap, ooze(), { sick: true });
      s.objects[o]!.counters["+1/+1"] = 1;
      invalidateCharacteristics(s);
      s.players[ap]!.hand = [];
      s = toUpkeep(s, ap);
      s = settle(s, { me: [ap] });
      expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
      const life = s.players[ap]!.life;
      // The mana for {X} is in the pool before answering (CR 605.3a).
      s.players[ap]!.manaPool.C = 2;
      s = settle(act(s, { type: "chooseMay", player: ap, yes }), { me: [ap] });
      expect(s.objects[o]!.counters["+1/+1"]).toBe(2);
      expect(s.objects[o]!.tapped, String(yes)).toBe(!yes);
      expect(s.players[ap]!.life).toBe(yes ? life : life - 2);
      expect(s.players[ap]!.manaPool.C ?? 0).toBe(yes ? 0 : 2);
    }
  });

  it("Dead Reckoning: the card goes on top of your library and deals damage equal to its power; declining does nothing", () => {
    for (const yes of [true, false]) {
      let { s, ap, opp, ids } = setup([reckoning()]);
      const dead = into(s, ap, bigBear, "graveyard");
      const theirs = putOnBattlefield(s, opp, ogre);
      s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(dead), tgt(theirs)])), { me: [ap] });
      expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
      s = settle(act(s, { type: "chooseMay", player: ap, yes }));
      expect(zone(s, dead)).toBe(yes ? "library" : "graveyard");
      if (yes) expect(s.players[ap]!.library[0]).toBe(dead);
      expect(zone(s, theirs)).toBe(yes ? "graveyard" : "battlefield");
    }
  });

  it("Dead Reckoning: with the creature gone, the card can still go on top; with the card gone, nothing happens", () => {
    let { s, ap, opp, ids } = setup([reckoning(), kill, reckoning()]);
    const dead = into(s, ap, bigBear, "graveyard");
    const theirs = putOnBattlefield(s, opp, ogre);
    s = run(s, planCast(s, ap, ids[0]!, [tgt(dead), tgt(theirs)]));
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(theirs)])), { me: [ap] });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.players[ap]!.library[0]).toBe(dead);
    // The card left the graveyard in response: no question, no damage.
    const dead2 = into(s, ap, bigBear, "graveyard");
    const other = putOnBattlefield(s, opp, ogre);
    s.players[ap]!.manaPool.B = 3;
    s = run(s, planCast(s, ap, ids[2]!, [tgt(dead2), tgt(other)]));
    s.players[ap]!.graveyard.splice(s.players[ap]!.graveyard.indexOf(dead2), 1);
    s.objects[dead2]!.zone = "exile";
    s.objects[dead2]!.zoneChanges = (s.objects[dead2]!.zoneChanges ?? 0) + 1;
    s.players[ap]!.exile.push(dead2);
    s = settle(s, { me: [ap] });
    expect(s.pending).toBeFalsy();
    expect(s.objects[other]!.damage).toBe(0);
  });

  it("Not Forgotten: the caster chooses top or bottom of the card owner's library, and gets a 1/1 flying Spirit", () => {
    let { s, ap, opp, ids } = setup([forgotten(), forgotten()]);
    const theirs = into(s, opp, bear(), "graveyard");
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(theirs)])), { me: [ap, opp] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "topOrBottom" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "bottom" }));
    expect(s.players[opp]!.library.at(-1)).toBe(theirs);
    const spirits = s.battlefield.filter((id) => s.objects[id]!.isToken);
    expect(spirits.length).toBe(1);
    expect(s.objects[spirits[0]!]!.controller).toBe(ap);
    expect(pt(s, spirits[0]!)).toBe("1/1");
    expect(objHasKeyword(s, s.objects[spirits[0]!]!, "Flying")).toBe(true);
    const mine = into(s, ap, bear(), "graveyard");
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(mine)])), { me: [ap] });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "top" }));
    expect(s.players[ap]!.library[0]).toBe(mine);
  });

  it("Grim Contest: each deals damage equal to its toughness to the other, and it isn't a fight", () => {
    let { s, ap, opp, ids } = setup([contest(), contest(), kill]);
    const w = putOnBattlefield(s, ap, wall);
    const b = putOnBattlefield(s, opp, bear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(w), tgt(b)])));
    expect(zone(s, b)).toBe("graveyard");
    expect(s.objects[w]!.damage).toBe(2);
    expect(s.objects[w]!.foughtTurn).toBeUndefined();
    // Either target illegal: no damage at all.
    const o = putOnBattlefield(s, opp, ogre);
    s = run(s, planCast(s, ap, ids[1]!, [tgt(w), tgt(o)]));
    s = settle(run(s, planCast(s, ap, ids[2]!, [tgt(o)])));
    expect(s.objects[w]!.damage).toBe(2);
  });
});
