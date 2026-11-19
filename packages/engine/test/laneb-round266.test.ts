// Lane B round B266: Mirror-Shield Hoplite (a copy of a backup ability that targets a creature you control, CR 702.165a,
// 707.10), Defensive Formation (the player attacked assigns each attacker's combat damage, as banding's CR 702.22j) and
// Power Pack (a random instant or sorcery card from your graveyard exiled, then cast free at your next upkeep, CR 603.7).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup, target } from "./helpers";
import { abilitiesOf, applyAction, botActions, invalidateCharacteristics, isFullySupported, objHasKeyword, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const mirrorShieldHoplite = (): CardDef => ({"oracleId":"23f01235-b5a5-4b2e-a90b-b49fc0c7b18d","name":"Mirror-Shield Hoplite","manaCost":"{R}{W}","cmc":2,"typeLine":"Creature — Human Soldier","supertypes":[],"types":["Creature"],"subtypes":["Human","Soldier"],"oracleText":"Vigilance\nWhenever a creature you control becomes the target of a backup ability, copy that ability. You may choose new targets for the copy. This ability triggers only once each turn.","power":"2","toughness":"2","colors":["R","W"],"colorIdentity":["R","W"],"keywords":["Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/4/9/49a5e7de-43cc-488b-99a4-7d173b42d5dc.jpg?1783916941","artUrl":"https://cards.scryfall.io/art_crop/front/4/9/49a5e7de-43cc-488b-99a4-7d173b42d5dc.jpg?1783916941","layout":"normal"});
const defensiveFormation = (): CardDef => ({"oracleId":"9386f4d3-aa72-4849-8921-83740762dc0e","name":"Defensive Formation","manaCost":"{W}","cmc":1,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Rather than the attacking player, you assign the combat damage of each creature attacking you. You can divide that creature's combat damage as you choose among any of the creatures blocking it.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fdd76db0-1a67-4965-81a5-1d8d86b63971.jpg?1783946376","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fdd76db0-1a67-4965-81a5-1d8d86b63971.jpg?1783946376","layout":"normal"});
const powerPack = (): CardDef => ({"oracleId":"3d5c98ff-fcf1-42bd-9533-2648791a4f45","name":"Power Pack","manaCost":"{1}{R}{G}{W}{U}","cmc":5,"typeLine":"Legendary Creature — Human Hero","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Hero"],"oracleText":"Flying, vigilance, trample, haste\nWhenever Power Pack deals combat damage to a player, exile target instant or sorcery card from your graveyard chosen at random. At the beginning of your next upkeep, you may cast that card without paying its mana cost. If that spell would be put into your graveyard, exile it instead.","power":"4","toughness":"4","colors":["G","R","U","W"],"colorIdentity":["G","R","U","W"],"keywords":["Flying","Vigilance","Haste","Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/0/4/04f8aa71-f27b-48b3-9146-b9e785555428.jpg?1783903266","artUrl":"https://cards.scryfall.io/art_crop/front/0/4/04f8aa71-f27b-48b3-9146-b9e785555428.jpg?1783903266","layout":"normal"});
const cunningGiant = (): CardDef => ({"oracleId":"4f94ce97-5b2d-42fb-ac8e-c64075fe1af2","name":"Cunning Giant","manaCost":"{5}{R}","cmc":6,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"If this creature is unblocked, you may have it assign its combat damage to a creature defending player controls.","power":"4","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/a/0aa284a7-3aac-4e88-becb-548a28c77401.jpg?1783946468","artUrl":"https://cards.scryfall.io/art_crop/front/0/a/0aa284a7-3aac-4e88-becb-548a28c77401.jpg?1783946468","layout":"normal"});
const thornElemental = (): CardDef => ({"oracleId":"9cdf840d-314e-46ef-9c04-74f145d9e65b","name":"Thorn Elemental","manaCost":"{5}{G}{G}","cmc":7,"typeLine":"Creature — Elemental","supertypes":[],"types":["Creature"],"subtypes":["Elemental"],"oracleText":"You may have this creature assign its combat damage as though it weren't blocked.","power":"7","toughness":"7","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/a/da901037-20e6-4445-8e7e-1ccd2e8b13ae.jpg?1783934971","artUrl":"https://cards.scryfall.io/art_crop/front/d/a/da901037-20e6-4445-8e7e-1ccd2e8b13ae.jpg?1783934971","layout":"normal"});
const butcherOrgg = (): CardDef => ({"oracleId":"6656d47a-9490-46ee-a6ed-7cbcab7539c8","name":"Butcher Orgg","manaCost":"{4}{R}{R}{R}","cmc":7,"typeLine":"Creature — Orgg","supertypes":[],"types":["Creature"],"subtypes":["Orgg"],"oracleText":"You may assign this creature's combat damage divided as you choose among defending player and/or any number of creatures they control.","power":"6","toughness":"6","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/f/7f2a29cf-4b2e-44c0-af73-512d6fed0dae.jpg?1783945058","artUrl":"https://cards.scryfall.io/art_crop/front/7/f/7f2a29cf-4b2e-44c0-af73-512d6fed0dae.jpg?1783945058","layout":"normal"});
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","layout":"normal"});
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","layout":"normal"});
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","layout":"normal"});
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","layout":"normal"});
const colossalDreadmaw = (): CardDef => ({"oracleId":"08c7db90-c0cf-4482-b7ee-bb033e5996d2","name":"Colossal Dreadmaw","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Creature — Dinosaur","supertypes":[],"types":["Creature"],"subtypes":["Dinosaur"],"oracleText":"Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)","power":"6","toughness":"6","colors":["G"],"colorIdentity":["G"],"keywords":["Trample"],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/76ac5b70-47db-4cdb-91e7-e5c18c42e516.jpg?1783935730","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/76ac5b70-47db-4cdb-91e7-e5c18c42e516.jpg?1783935730","layout":"normal"});
const fearlessSkald = (): CardDef => ({"oracleId":"f055a941-8b83-464e-a57f-8f188dc69aaa","name":"Fearless Skald","manaCost":"{4}{R}","cmc":5,"typeLine":"Creature — Dwarf Berserker","supertypes":[],"types":["Creature"],"subtypes":["Dwarf","Berserker"],"oracleText":"Backup 1 (When this creature enters, put a +1/+1 counter on target creature. If that's another creature, it gains the following ability until end of turn.)\nDouble strike","power":"3","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Backup","Double strike"],"imageUrl":"https://cards.scryfall.io/normal/front/4/e/4e317d1d-3f20-4f0d-8b1e-31df351e8f83.jpg?1783916992","artUrl":"https://cards.scryfall.io/art_crop/front/4/e/4e317d1d-3f20-4f0d-8b1e-31df351e8f83.jpg?1783916992","layout":"normal"});

const supported = (...ds: CardDef[]) => ds.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 400 && !s.over && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Plays on with no attacks or blocks until `done`, stopping at any other question. */
const until = (s: GameState, done: (s: GameState) => boolean, max = 3000) => {
  for (let i = 0; i < max && !s.over; i++) {
    if (done(s)) return s;
    const pid = waitingOn(s)!;
    const p = s.pending;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p?.kind === "pickPermanents" && p.action === "keepTapped") s = act(s, { type: "pickPermanents", player: pid, ids: [] });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, p.count) });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: pid });
  }
  return s;
};
const ptgt = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
/** A fresh copy of `def` in `pid`'s graveyard. */
const inYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Answers every question with the bots' answers until none is left (at most `max`). */
const bots = (s: GameState, max = 30) => {
  for (let i = 0; i < max && s.pending; i++) for (const a of botActions(s, s.pending.player)) s = act(s, a);
  return s;
};
/** To `ap`'s declare blockers question, with these attacks declared. */
const attack = (s0: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) => {
  let s = until(s0, (x) => x.pending?.kind === "declareAttackers" && x.pending.player === ap);
  s = settle(act(s, { type: "declareAttackers", player: ap, attacks }));
  return until(s, (x) => x.pending?.kind === "declareBlockers");
};
/** Past combat damage, into the second main phase. */
const toMain2 = (s: GameState) => until(s, (x) => x.step === "main2" && !x.stack.length);

describe("Mirror-Shield Hoplite", () => {
  it("is supported", () => supported(mirrorShieldHoplite(), defensiveFormation(), powerPack()));

  it("copies a backup ability that targets a creature you control; the copy may get a new target", () => {
    const { s: s0, ap, ids } = setup([fearlessSkald()]);
    putOnBattlefield(s0, ap, mirrorShieldHoplite());
    const bears = putOnBattlefield(s0, ap, grizzlyBears());
    const giant = putOnBattlefield(s0, ap, hillGiant());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(bears)] }));
    expect(s.pending).toMatchObject({ kind: "copyTargets", player: ap });
    s = settle(act(s, { type: "copyTargets", player: ap, targets: [target(giant)] }));
    expect(s.pending).toBeNull();
    // Each gets the counter and the abilities printed below backup until end of turn (CR 702.165a, rulings).
    for (const id of [bears, giant]) {
      expect(s.objects[id]!.counters["+1/+1"]).toBe(1);
      expect(objHasKeyword(s, s.objects[id]!, "Double strike")).toBe(true);
    }
    expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("keeping the target, the creature gets two counters; aimed at the creature with backup, the copy gives only a counter", () => {
    const { s: s0, ap, ids } = setup([fearlessSkald(), fearlessSkald()]);
    putOnBattlefield(s0, ap, mirrorShieldHoplite());
    const bears = putOnBattlefield(s0, ap, grizzlyBears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(bears)] }));
    s = settle(act(s, { type: "copyTargets", player: ap, targets: [target(bears)] }));
    expect(s.objects[bears]!.counters["+1/+1"]).toBe(2);
    // Only once each turn (CR 603.2h): the second Skald's backup isn't copied.
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap) s.objects[id]!.tapped = false;
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(ids[0]!)] }));
    expect(s.pending).toBeNull();
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
  });

  it("the copy's source is the creature with backup: aimed at it, it gets a counter and no abilities", () => {
    const { s: s0, ap, ids } = setup([fearlessSkald()]);
    putOnBattlefield(s0, ap, mirrorShieldHoplite());
    const bears = putOnBattlefield(s0, ap, grizzlyBears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(bears)] }));
    s = settle(act(s, { type: "copyTargets", player: ap, targets: [target(ids[0]!)] }));
    const skald = s.objects[ids[0]!]!;
    expect(skald.counters["+1/+1"]).toBe(1);
    expect(abilitiesOf(s, skald).triggers).toHaveLength(1);
    expect(s.effects.filter((e) => e.affected?.includes(ids[0]!))).toHaveLength(0);
  });

  it("doesn't copy other abilities or spells that target your creatures, nor a backup ability aimed at another player's creature", () => {
    const { s: s0, ap, ids, opp } = setup([lightningBolt(), fearlessSkald()]);
    putOnBattlefield(s0, ap, mirrorShieldHoplite());
    const bears = putOnBattlefield(s0, ap, grizzlyBears());
    const theirs = putOnBattlefield(s0, opp, hillGiant());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(bears)])));
    expect(s.pending).toBeNull();
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(theirs)] }));
    expect(s.pending).toBeNull();
    expect(s.objects[theirs]!.counters["+1/+1"]).toBe(1);
  });

  it("a bot answers the copy's targets with a creature of its own", () => {
    const { s: s0, ap, ids } = setup([fearlessSkald()]);
    putOnBattlefield(s0, ap, mirrorShieldHoplite());
    const bears = putOnBattlefield(s0, ap, grizzlyBears());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(bears)] }));
    expect(s.pending?.kind).toBe("copyTargets");
    for (let i = 0; i < 10 && (s.pending || s.stack.length); i++) s = s.pending ? bots(s, 1) : settle(s);
    const counters = s.battlefield.filter((id) => s.objects[id]!.controller === ap).reduce((n, id) => n + (s.objects[id]!.counters["+1/+1"] ?? 0), 0);
    expect(counters).toBe(2);
  });
});

describe("Defensive Formation", () => {
  it("the player attacked assigns a blocked attacker's damage, trample too: nothing gets through and as few blockers die as can", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, defensiveFormation());
    const maw = putOnBattlefield(s0, ap, colossalDreadmaw());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    let s = attack(s0, ap, [{ attacker: maw, defender: opp }]);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: bears, attacker: maw }] });
    const life = s.players[opp]!.life;
    s = toMain2(s);
    // All 6 to the Bears: the defending player needn't assign lethal damage to it first (CR 702.19b, rulings).
    expect(s.players[opp]!.life).toBe(life);
    expect(zone(s, bears)).toBe("graveyard");
  });

  it("two blockers: the damage is divided so neither dies; attacking another player, it's assigned as usual", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, defensiveFormation());
    const giant = putOnBattlefield(s0, ap, hillGiant());
    const maw = putOnBattlefield(s0, ap, colossalDreadmaw());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    const big = putOnBattlefield(s0, opp, hillGiant());
    const third = s0.turnOrder[(s0.turnOrder.indexOf(opp) + 1) % 4]!;
    const theirs = putOnBattlefield(s0, third, grizzlyBears());
    let s = attack(s0, ap, [{ attacker: giant, defender: opp }, { attacker: maw, defender: third }]);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: bears, attacker: giant }, { blocker: big, attacker: giant }] });
    s = until(s, (x) => x.pending?.kind === "declareBlockers" && x.pending.player === third);
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: third, blocks: [{ blocker: theirs, attacker: maw }] });
    const life = s.players[third]!.life;
    s = toMain2(s);
    expect(zone(s, bears)).toBe("battlefield");
    expect(zone(s, big)).toBe("battlefield");
    expect(s.objects[bears]!.damage + s.objects[big]!.damage).toBe(3);
    // The third player has no Defensive Formation: lethal to the Bears, the rest tramples over (CR 702.19b).
    expect(zone(s, theirs)).toBe("graveyard");
    expect(s.players[third]!.life).toBe(life - 4);
  });

  it("the player attacked decides whether an attacker assigns its damage as though it weren't blocked (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, defensiveFormation());
    const thorn = putOnBattlefield(s0, ap, thornElemental());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    let s = attack(s0, ap, [{ attacker: thorn, defender: opp }]);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: bears, attacker: thorn }] });
    const life = s.players[opp]!.life;
    s = until(s, (x) => x.pending?.kind === "pickPermanents" && x.pending.action === "unblocked");
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "unblocked", player: opp, options: [thorn] });
    s = toMain2(act(s, { type: "pickPermanents", player: opp, ids: [thorn] }));
    expect(s.players[opp]!.life).toBe(life - 7);
    expect(zone(s, bears)).toBe("battlefield");
  });

  it("the player attacked chooses the creature an unblocked Cunning Giant assigns its damage to, or none; a bot keeps its creatures with life to spare", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, defensiveFormation());
    const cg = putOnBattlefield(s0, ap, cunningGiant());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    let s = attack(s0, ap, [{ attacker: cg, defender: opp }]);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [] });
    s = until(s, (x) => x.pending?.kind === "pickPermanents" && x.pending.action === "damageCreature");
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "damageCreature", player: opp, options: [bears] });
    const life = s.players[opp]!.life;
    const pick = botActions(s, opp);
    expect(pick).toEqual([{ type: "pickPermanents", player: opp, ids: [] }]);
    s = toMain2(act(s, { type: "pickPermanents", player: opp, ids: [bears] }));
    expect(zone(s, bears)).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life);
  });

  it("the player attacked divides Butcher Orgg's damage; a bot takes it all with life to spare", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, defensiveFormation());
    const orgg = putOnBattlefield(s0, ap, butcherOrgg());
    const bears = putOnBattlefield(s0, opp, grizzlyBears());
    let s = attack(s0, ap, [{ attacker: orgg, defender: opp }]);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [] });
    s = until(s, (x) => x.pending?.kind === "divideDamage");
    expect(s.pending).toMatchObject({ kind: "divideDamage", player: opp, combat: true, toPlayer: opp });
    const life = s.players[opp]!.life;
    s = toMain2(bots(s, 1));
    expect(s.players[opp]!.life).toBe(life - 6);
    expect(zone(s, bears)).toBe("battlefield");
  });
});

describe("Power Pack", () => {
  it("exiles a random instant or sorcery card from your graveyard; at your next upkeep you may cast it free, and it's exiled after", () => {
    const { s: s0, ap, opp } = setup([]);
    const pack = putOnBattlefield(s0, ap, powerPack());
    const bolt = inYard(s0, ap, lightningBolt());
    inYard(s0, ap, grizzlyBears());
    let s = attack(s0, ap, [{ attacker: pack, defender: opp }]);
    s = act(s, { type: "declareBlockers", player: opp, blocks: [] });
    s = toMain2(s);
    expect(logged(s, /targets Lightning Bolt, chosen at random/)).toBe(true);
    expect(zone(s, bolt)).toBe("exile");
    expect(s.pending).toBeNull();
    s = until(s, (x) => x.pending?.kind === "castFree");
    expect(s.activePlayer).toBe(ap);
    expect(s.step).toBe("upkeep");
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: bolt });
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, bolt, [ptgt(opp)])));
    expect(s.players[opp]!.life).toBe(life - 3);
    // "If that spell would be put into your graveyard, exile it instead."
    expect(zone(s, bolt)).toBe("exile");
    expect(s.players[ap]!.graveyard).not.toContain(bolt);
  });

  it("the card is a new object once it leaves exile: then nothing is cast; with no instant or sorcery card nothing is exiled", () => {
    const { s: s0, ap, opp } = setup([]);
    const pack = putOnBattlefield(s0, ap, powerPack());
    const div = inYard(s0, ap, divination());
    let s = attack(s0, ap, [{ attacker: pack, defender: opp }]);
    s = toMain2(act(s, { type: "declareBlockers", player: opp, blocks: [] }));
    expect(zone(s, div)).toBe("exile");
    // Back to the graveyard before the upkeep (CR 400.7).
    s.players[ap]!.graveyard.push(div);
    s.objects[div]!.zone = "graveyard";
    s.objects[div]!.zoneChanges = (s.objects[div]!.zoneChanges ?? 0) + 1;
    s = until(s, (x) => x.activePlayer === ap && x.step === "draw");
    expect(logged(s, /Divination can't be cast/)).toBe(false);
    expect(zone(s, div)).toBe("graveyard");
    // Its next combat damage, with no instant or sorcery card left there: no target, so nothing (CR 603.3d).
    s.players[ap]!.graveyard = [];
    s.objects[div]!.zone = "exile";
    s = attack(s, ap, [{ attacker: pack, defender: opp }]);
    s = toMain2(act(s, { type: "declareBlockers", player: opp, blocks: [] }));
    expect(s.pending).toBeNull();
  });

  it("a bot casts the card it gets back", () => {
    const { s: s0, ap, opp } = setup([]);
    const pack = putOnBattlefield(s0, ap, powerPack());
    const div = inYard(s0, ap, divination());
    let s = attack(s0, ap, [{ attacker: pack, defender: opp }]);
    s = toMain2(act(s, { type: "declareBlockers", player: opp, blocks: [] }));
    s = until(s, (x) => x.pending?.kind === "castFree");
    const hand = s.players[ap]!.hand.length;
    for (let i = 0; i < 10 && (s.pending || s.stack.length); i++) s = s.pending ? bots(s, 1) : settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(zone(s, div)).toBe("exile");
  });
});
