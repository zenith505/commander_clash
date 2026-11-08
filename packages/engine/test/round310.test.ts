// Round 310 (Lane A, skip-list cards): Printlifter Ooze (a 0/0 Ooze token that enters with a +1/+1 counter for each
// other creature you control), Trench Behemoth and Sizzling Soloist (a creature that attacks during its controller's
// next combat phase if able), From the Catacombs (a corpse-counter reanimation that exiles the creature if it would
// leave, and the initiative), Draco (an upkeep "unless you pay {10}" cut by {2} for each basic land type), Blitzball
// Stadium (support X, and "draw a card for each kind of counter on it"), Claim the Kingdom (a counter on a target and a
// plan counter on itself), Ashcloud Phoenix (returns face down when it dies), Life's Finale and Quiet Speculation
// (searching another player's library for cards to put into their graveyard), Decree of Silence (counters each
// opponent's spell, sacrificed at three depletion counters), Rent Is Due (tap two untapped creatures and/or Treasures,
// or sacrifice it).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { moveObject } from "../src/game";
import { applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const leftOf = (s: GameState, pid: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + n) % s.turnOrder.length]!;
const ch = (s: GameState, id: string) => characteristics(s, s.objects[id]!);
const t = (id: string): TargetChoice => ({ kind: "object", id });
const ptOf = (s: GameState, id: string) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
/** A copy of `def` in `pid`'s hand, graveyard or library (on top). */
const inZone = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};

// Real oracle text (Scryfall).
const printlifter = (): CardDef => ({"oracleId":"3cbed112-9f2b-46b4-a9c3-bfd8a6856f79","name":"Printlifter Ooze","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Ooze","supertypes":[],"types":["Creature"],"subtypes":["Ooze"],"oracleText":"Deathtouch\nWhenever this creature or another creature you control is turned face up, create a 0/0 green Ooze creature token with trample. The token enters with X +1/+1 counters on it, where X is the number of other creatures you control.\nDisguise {3}{G}","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":["Disguise","Deathtouch"],"imageUrl":"https://cards.scryfall.io/normal/front/d/b/db7fbf69-1118-446b-b5cb-02da2de42ce3.jpg?1783913040","artUrl":"https://cards.scryfall.io/art_crop/front/d/b/db7fbf69-1118-446b-b5cb-02da2de42ce3.jpg?1783913040","layout":"normal"});
const behemoth = (): CardDef => ({"oracleId":"dc2b1863-b45c-4213-ad89-5e39432daca7","name":"Trench Behemoth","manaCost":"{5}{U}{U}","cmc":7,"typeLine":"Creature — Kraken","supertypes":[],"types":["Creature"],"subtypes":["Kraken"],"oracleText":"Return a land you control to its owner's hand: Untap this creature. It gains hexproof until end of turn.\nLandfall — Whenever a land you control enters, target creature an opponent controls attacks during its controller's next combat phase if able.","power":"7","toughness":"7","colors":["U"],"colorIdentity":["U"],"keywords":["Landfall"],"imageUrl":"https://cards.scryfall.io/normal/front/9/0/909dc123-8234-4e81-bb7b-77404d94a87c.jpg?1783928735","artUrl":"https://cards.scryfall.io/art_crop/front/9/0/909dc123-8234-4e81-bb7b-77404d94a87c.jpg?1783928735","layout":"normal"});
const soloist = (): CardDef => ({"oracleId":"f8975d81-d373-49b1-be00-9513b92877d9","name":"Sizzling Soloist","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Human Citizen","supertypes":[],"types":["Creature"],"subtypes":["Human","Citizen"],"oracleText":"Alliance — Whenever another creature you control enters, target creature an opponent controls can't block this turn. If this is the second time this ability has resolved this turn, that creature attacks during its controller's next combat phase if able.","power":"3","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Alliance"],"imageUrl":"https://cards.scryfall.io/normal/front/9/5/958dfd59-7dbd-45e0-b6e1-e432c78b6878.jpg?1783923111","artUrl":"https://cards.scryfall.io/art_crop/front/9/5/958dfd59-7dbd-45e0-b6e1-e432c78b6878.jpg?1783923111","layout":"normal"});
const catacombs = (): CardDef => ({"oracleId":"cc21b29f-2d1a-4769-9b65-f92bd2ca1cc8","name":"From the Catacombs","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Put target creature card from a graveyard onto the battlefield under your control with a corpse counter on it. You take the initiative. If that creature would leave the battlefield, exile it instead of putting it anywhere else.\nEscape—{3}{B}{B}, Exile five other cards from your graveyard. (You may cast this card from your graveyard for its escape cost.)","colors":["B"],"colorIdentity":["B"],"keywords":["Escape"],"imageUrl":"https://cards.scryfall.io/normal/front/0/8/08737950-4662-4d36-a1ea-6fd87e38c02b.jpg?1783922506","artUrl":"https://cards.scryfall.io/art_crop/front/0/8/08737950-4662-4d36-a1ea-6fd87e38c02b.jpg?1783922506","layout":"normal"});
const draco = (): CardDef => ({"oracleId":"6157ade6-9037-4339-869b-493fdee71dcf","name":"Draco","manaCost":"{16}","cmc":16,"typeLine":"Artifact Creature — Dragon","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Dragon"],"oracleText":"Domain — This spell costs {2} less to cast for each basic land type among lands you control.\nFlying\nDomain — At the beginning of your upkeep, sacrifice this creature unless you pay {10}. This cost is reduced by {2} for each basic land type among lands you control.","power":"9","toughness":"9","colors":[],"colorIdentity":[],"keywords":["Flying","Domain"],"imageUrl":"https://cards.scryfall.io/normal/front/2/1/212e3edb-62f1-4680-884f-70323547f8ad.jpg?1783945602","artUrl":"https://cards.scryfall.io/art_crop/front/2/1/212e3edb-62f1-4680-884f-70323547f8ad.jpg?1783945602","layout":"normal"});
const stadium = (): CardDef => ({"oracleId":"a4b66fb3-16ea-4bf1-bce3-6df872e8883b","name":"Blitzball Stadium","manaCost":"{X}{U}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"When this artifact enters, support X. (Put a +1/+1 counter on each of up to X target creatures.)\nGo for the Goal! — {3}, {T}: Until end of turn, target creature gains \"Whenever this creature deals combat damage to a player, draw a card for each kind of counter on it\" and it can't be blocked this turn.","colors":["U"],"colorIdentity":["U"],"keywords":["Support","Go for the Goal!"],"imageUrl":"https://cards.scryfall.io/normal/front/7/7/771808d9-d0c8-418b-ab6c-1ae6fc07ca20.jpg?1783906363","artUrl":"https://cards.scryfall.io/art_crop/front/7/7/771808d9-d0c8-418b-ab6c-1ae6fc07ca20.jpg?1783906363","layout":"normal"});
const kingdom = (): CardDef => ({"oracleId":"3cd15225-e9b6-4998-b545-76536c72e948","name":"Claim the Kingdom","manaCost":"{1}{G}","cmc":2,"typeLine":"Enchantment — Plan","supertypes":[],"types":["Enchantment"],"subtypes":["Plan"],"oracleText":"Landfall — Whenever a land you control enters, put a +1/+1 counter on target creature you control and a plan counter on this enchantment.\nWhen the fourth plan counter is put on this enchantment, sacrifice it. When you do, put an indestructible counter on target creature you control.","colors":["G"],"colorIdentity":["G"],"keywords":["Landfall"],"imageUrl":"https://cards.scryfall.io/normal/front/c/f/cf13bfb1-5b44-4363-8de9-ece234233870.jpg?1783902921","artUrl":"https://cards.scryfall.io/art_crop/front/c/f/cf13bfb1-5b44-4363-8de9-ece234233870.jpg?1783902921","layout":"normal"});
const phoenix = (): CardDef => ({"oracleId":"fb2d7c3d-b68f-410e-9a73-cfcbfe702ade","name":"Ashcloud Phoenix","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Creature — Phoenix","supertypes":[],"types":["Creature"],"subtypes":["Phoenix"],"oracleText":"Flying\nWhen this creature dies, return it to the battlefield face down under your control.\nMorph {4}{R}{R} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)\nWhen this creature is turned face up, it deals 2 damage to each player.","power":"4","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":["Flying","Morph"],"imageUrl":"https://cards.scryfall.io/normal/front/4/a/4a53752c-5689-4939-9a8b-bf59d88d7c6b.jpg?1783939075","artUrl":"https://cards.scryfall.io/art_crop/front/4/a/4a53752c-5689-4939-9a8b-bf59d88d7c6b.jpg?1783939075","layout":"normal"});
const finale = (): CardDef => ({"oracleId":"0c1d5e6b-f6b6-4dc6-9bc1-3cc00b78da36","name":"Life's Finale","manaCost":"{4}{B}{B}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Destroy all creatures, then search target opponent's library for up to three creature cards and put them into their graveyard. Then that player shuffles.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/f/ffd3fbd2-87c7-4f08-baaa-91d61c1114da.jpg?1783941312","artUrl":"https://cards.scryfall.io/art_crop/front/f/f/ffd3fbd2-87c7-4f08-baaa-91d61c1114da.jpg?1783941312","layout":"normal"});
const speculation = (): CardDef => ({"oracleId":"938f48a9-766e-41d3-a425-9c3a6adf675b","name":"Quiet Speculation","manaCost":"{1}{U}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Search target player's library for up to three cards with flashback and put them into that player's graveyard. Then the player shuffles.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/1/71a314fa-293b-486f-95d8-267d340e4d8e.jpg?1783945127","artUrl":"https://cards.scryfall.io/art_crop/front/7/1/71a314fa-293b-486f-95d8-267d340e4d8e.jpg?1783945127","layout":"normal"});
const decree = (): CardDef => ({"oracleId":"920684d0-aef3-4408-a66b-a0c9394c58f4","name":"Decree of Silence","manaCost":"{6}{U}{U}","cmc":8,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever an opponent casts a spell, counter that spell and put a depletion counter on this enchantment. If there are three or more depletion counters on this enchantment, sacrifice it.\nCycling {4}{U}{U} ({4}{U}{U}, Discard this card: Draw a card.)\nWhen you cycle this card, you may counter target spell.","colors":["U"],"colorIdentity":["U"],"keywords":["Cycling"],"imageUrl":"https://cards.scryfall.io/normal/front/f/2/f2fc46e2-5e19-4999-a4cd-1e84697066c1.jpg?1783944888","artUrl":"https://cards.scryfall.io/art_crop/front/f/2/f2fc46e2-5e19-4999-a4cd-1e84697066c1.jpg?1783944888","layout":"normal"});
const rent = (): CardDef => ({"oracleId":"3fe1530d-bcf2-440b-a905-5a2216daa7eb","name":"Rent Is Due","manaCost":"{W}","cmc":1,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your end step, you may tap two untapped creatures and/or Treasures you control. If you do, draw a card. Otherwise, sacrifice this enchantment.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/3/b3f8d221-081f-49f5-a501-07e5eb21a840.jpg?1783905362","artUrl":"https://cards.scryfall.io/art_crop/front/b/3/b3f8d221-081f-49f5-a501-07e5eb21a840.jpg?1783905362","layout":"normal"});

const doom = () => card("Test Doom", "Sorcery", "{B}", { oracleText: "Destroy target creature." });
const morph = () => card("Test Morph", "Creature — Beast", "{4}{G}", { power: "4", toughness: "4", keywords: ["Morph"], oracleText: "Morph {1}{G}" });

describe("round 310", () => {
  it("every card of the round compiles fully", () => supported(printlifter(), behemoth(), soloist(), catacombs(), draco(), stadium(), kingdom(), phoenix(), finale(), speculation(), decree(), rent()));
});

describe("round 310: Printlifter Ooze", () => {
  it("turned face up, it creates a 0/0 Ooze with trample that enters with a +1/+1 counter for each other creature you control", () => {
    const { s: s0, ap } = setup([]);
    const ooze = putOnBattlefield(s0, ap, printlifter());
    s0.objects[ooze]!.faceDown = "disguise";
    putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, leftOf(s0, ap), bear());
    s0.players[ap]!.manaPool.G = 4;
    invalidateCharacteristics(s0);
    let s = act(s0, { type: "turnFaceUp", player: ap, objectId: ooze });
    s = settle(s, ap);
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken);
    expect(tokens).toHaveLength(1);
    // The Ooze itself and the two Bears: 3 others as the token is created (not the opponent's Bear).
    expect(s.objects[tokens[0]!]!.counters["+1/+1"]).toBe(3);
    expect(ptOf(s, tokens[0]!)).toBe("3/3");
    expect(ch(s, tokens[0]!).keywords).toContain("Trample");
  });

  it("another creature you control turned face up triggers it too", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, printlifter());
    const m = putOnBattlefield(s0, ap, morph());
    s0.objects[m]!.faceDown = "morph";
    s0.players[ap]!.manaPool.G = 2;
    invalidateCharacteristics(s0);
    let s = act(s0, { type: "turnFaceUp", player: ap, objectId: m });
    s = settle(s, ap);
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken);
    expect(tokens).toHaveLength(1);
    expect(ptOf(s, tokens[0]!)).toBe("2/2");
  });
});

describe("round 310: Trench Behemoth", () => {
  it("landfall: the target attacks during its controller's next combat phase if able, and only then", () => {
    const { s: s0, ap, ids } = setup([card("Test Island", "Basic Land — Island")]);
    const opp = leftOf(s0, ap);
    putOnBattlefield(s0, ap, behemoth());
    const theirs = putOnBattlefield(s0, opp, bear());
    const land = ids[0]!;
    let s = act(s0, { type: "playLand", player: ap, objectId: land });
    for (let i = 0; i < 20 && !s.stack.length; i++) {
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [t(theirs)] });
      else break;
    }
    s = settle(s, ap);
    expect(s.effects.some((e) => e.duration === "controllersNextCombat" && e.turnOf === opp)).toBe(true);
    // Not a requirement on this turn: it isn't its controller's.
    expect(ch(s, theirs).attacksIfAble).toBeFalsy();
    s = passUntil(s, "declareAttackers", opp);
    expect(ch(s, theirs).attacksIfAble).toBe(true);
    expect(() => act(s, { type: "declareAttackers", player: opp, attacks: [] })).toThrow();
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: theirs, defender: ap }] });
    s = passUntil(s, "main2", opp);
    // Its next combat phase is over: the requirement is gone.
    expect(s.effects.some((e) => e.duration === "controllersNextCombat")).toBe(false);
    expect(ch(s, theirs).attacksIfAble).toBeFalsy();
  });
});

describe("round 310: Sizzling Soloist", () => {
  it("the second time its alliance ability resolves in a turn, the target also attacks during its controller's next combat phase", () => {
    const { s: s0, ap, ids } = setup([bear({ name: "Test Bear A" }), bear({ name: "Test Bear B" })]);
    const opp = leftOf(s0, ap);
    putOnBattlefield(s0, ap, soloist());
    const theirs = putOnBattlefield(s0, opp, bear());
    const aim = (s: GameState) => {
      s = settle(s, ap);
      if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [t(theirs)] }), ap);
      return s;
    };
    let s = aim(run(s0, planCast(s0, ap, ids[0]!, [], undefined, "auto")));
    expect(ch(s, theirs).cantBlock).toBe(true);
    expect(s.effects.some((e) => e.duration === "controllersNextCombat")).toBe(false);
    s = aim(run(s, planCast(s, ap, ids[1]!, [], undefined, "auto")));
    expect(s.effects.some((e) => e.duration === "controllersNextCombat" && e.turnOf === opp)).toBe(true);
    s = passUntil(s, "declareAttackers", opp);
    expect(ch(s, theirs).attacksIfAble).toBe(true);
  });
});

describe("round 310: From the Catacombs", () => {
  it("puts a creature card from any graveyard onto the battlefield under your control with a corpse counter, you take the initiative, and it's exiled if it would leave", () => {
    const { s: s0, ap, ids } = setup([catacombs(), doom()]);
    const opp = leftOf(s0, ap);
    const dead = inZone(s0, opp, bear({ name: "Test Dead Bear" }), "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [t(dead)], undefined, "auto")), ap);
    // Venturing into Undercity's Secret Entrance: a basic land card from the library.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = settle(act(s, botActions(s, ap)[0]!), ap);
    expect(s.objects[dead]!.zone).toBe("battlefield");
    expect(controllerOf(s, s.objects[dead]!)).toBe(ap);
    expect(s.objects[dead]!.counters.corpse).toBe(1);
    expect(s.initiative).toBe(ap);
    s.players[ap]!.manaPool.B = 1;
    s = settle(run(s, planCast(s, ap, ids[1]!, [t(dead)], undefined, "auto")), ap);
    expect(s.objects[dead]!.zone).toBe("exile");
  });
});

describe("round 310: Draco", () => {
  const toUpkeep = (s: GameState, ap: PlayerId) => {
    s = passUntil(s, "upkeep", ap);
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return s;
  };

  it("with all five basic land types the upkeep payment is {0}", () => {
    const { s: s0, ap } = setup([]);
    const draco_ = putOnBattlefield(s0, ap, draco());
    let s = toUpkeep(s0, ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    expect(s.pending?.kind === "chooseMay" && s.pending.prompt).toContain("{0}");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(s.objects[draco_]!.zone).toBe("battlefield");
  });

  it("with two basic land types it's {6}; not paying sacrifices it", () => {
    const { s: s0, ap } = setup([]);
    for (const id of [...s0.battlefield]) {
      const n = characteristics(s0, s0.objects[id]!).subtypes;
      if (controllerOf(s0, s0.objects[id]!) === ap && (n.includes("Mountain") || n.includes("Island") || n.includes("Plains"))) moveObject(s0, id, "graveyard");
    }
    // Five lands still, two of them Swamps: {6} is more than they make, so add two more Forests.
    putOnBattlefield(s0, ap, card("Forest", "Basic Land — Forest"));
    putOnBattlefield(s0, ap, card("Forest", "Basic Land — Forest"));
    invalidateCharacteristics(s0);
    const draco_ = putOnBattlefield(s0, ap, draco());
    let s = toUpkeep(s0, ap);
    expect(s.pending?.kind === "chooseMay" && s.pending.prompt).toContain("{6}");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(s.objects[draco_]!.zone).toBe("graveyard");
  });
});

describe("round 310: Blitzball Stadium", () => {
  it("support X: a +1/+1 counter on each of up to X other target creatures, X being the X it was cast with", () => {
    const { s: s0, ap, ids } = setup([stadium()]);
    const a = putOnBattlefield(s0, ap, bear({ name: "Test Bear A" }));
    const b = putOnBattlefield(s0, ap, bear({ name: "Test Bear B" }));
    const c = putOnBattlefield(s0, ap, bear({ name: "Test Bear C" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [], undefined, "auto", 2)), ap);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [t(a), t(b), t(c)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [t(a), t(b)] }), ap);
    expect([a, b, c].map((id) => s.objects[id]!.counters["+1/+1"] ?? 0)).toEqual([1, 1, 0]);
  });

  it("Go for the Goal!: the creature can't be blocked, and its combat damage to a player draws a card for each kind of counter on it", () => {
    const { s: s0, ap } = setup([]);
    const opp = leftOf(s0, ap);
    const stad = putOnBattlefield(s0, ap, stadium());
    const runner = putOnBattlefield(s0, ap, bear());
    s0.objects[runner]!.counters = { "+1/+1": 2, oil: 1 };
    putOnBattlefield(s0, opp, bear({ name: "Test Blocker" }));
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planActivate(s0, ap, stad, 0, [t(runner)])), ap);
    expect(ch(s, runner).cantBeBlocked).toBe(true);
    const hand = s.players[ap]!.hand.length;
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: runner, defender: opp }] });
    s = passUntil(s, "main2", ap);
    s = settle(s, ap);
    // Two kinds (+1/+1 and oil), however many of each.
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });
});

describe("round 310: Claim the Kingdom", () => {
  it("landfall: a +1/+1 counter on the target and a plan counter on it; the fourth plan counter sacrifices it for an indestructible counter", () => {
    const { s: s0, ap, ids } = setup([card("Test Island", "Basic Land — Island")]);
    const claim = putOnBattlefield(s0, ap, kingdom());
    s0.objects[claim]!.counters = { plan: 3 };
    const mine = putOnBattlefield(s0, ap, bear());
    invalidateCharacteristics(s0);
    let s = act(s0, { type: "playLand", player: ap, objectId: ids[0]! });
    for (let i = 0; i < 10; i++) {
      s = settle(s, ap);
      if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [t(mine)] });
      else if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: true });
      else if (!s.pending && !s.stack.length) break;
    }
    expect(s.objects[mine]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[claim]!.zone).toBe("graveyard");
    expect(s.objects[mine]!.counters.indestructible).toBe(1);
  });
});

describe("round 310: Ashcloud Phoenix", () => {
  it("dies and returns face down under your control; turned face up for its morph cost it deals 2 damage to each player", () => {
    const { s: s0, ap, ids } = setup([doom()]);
    const opp = leftOf(s0, ap);
    const phoenix_ = putOnBattlefield(s0, ap, phoenix());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [t(phoenix_)], undefined, "auto")), ap);
    const back = s.battlefield.find((id) => s.objects[id]!.cardId === s.objects[phoenix_]!.cardId)!;
    expect(back).toBeDefined();
    expect(s.objects[back]!.faceDown).toBeTruthy();
    expect(controllerOf(s, s.objects[back]!)).toBe(ap);
    expect(ptOf(s, back)).toBe("2/2");
    const life = s.turnOrder.map((p) => s.players[p]!.life);
    s.players[ap]!.manaPool.R = 6;
    s = settle(act(s, { type: "turnFaceUp", player: ap, objectId: back }), ap);
    expect(ch(s, back).name).toBe("Ashcloud Phoenix");
    expect(s.turnOrder.map((p) => s.players[p]!.life)).toEqual(life.map((l) => l - 2));
    expect(s.players[opp]!.life).toBe(life[s.turnOrder.indexOf(opp)]! - 2);
  });
});

describe("round 310: Life's Finale", () => {
  it("destroys all creatures, then you put up to three creature cards from the target opponent's library into their graveyard", () => {
    const { s: s0, ap, ids } = setup([finale()]);
    const opp = leftOf(s0, ap);
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, opp, bear());
    const yard = s0.players[opp]!.graveyard.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, "auto")), ap);
    expect([a, b].map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 3 });
    if (s.pending?.kind !== "searchLibrary") throw new Error();
    // Only creature cards can be found.
    expect(s.pending.cards.every((id) => characteristics(s, s.objects[id]!).types.includes("Creature"))).toBe(true);
    const found = s.pending.cards.slice(0, 3);
    s = settle(act(s, { type: "searchLibrary", player: ap, found }), ap);
    expect(found.map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "graveyard"]);
    // Their own graveyard (CR 400.3): the Bear destroyed and the three cards.
    expect(s.players[opp]!.graveyard.length).toBe(yard + 4);
  });
});

describe("round 310: Quiet Speculation", () => {
  it("puts up to three cards with flashback from the target player's library into that player's graveyard", () => {
    const flash = (n: string) => card(n, "Sorcery", "{R}", { keywords: ["Flashback"], oracleText: `${n} deals 1 damage to any target.\nFlashback {2}{R}` });
    const { s: s0, ap, ids } = setup([speculation()]);
    const opp = leftOf(s0, ap);
    const f1 = inZone(s0, opp, flash("Test Flash A"), "library");
    const f2 = inZone(s0, opp, flash("Test Flash B"), "library");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }], undefined, "auto")), ap);
    // Up to three, of the two there are.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, max: 2 });
    if (s.pending?.kind !== "searchLibrary") throw new Error();
    expect([...s.pending.cards].sort()).toEqual([f1, f2].sort());
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [f1, f2] }), ap);
    expect([f1, f2].map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
    expect(s.players[opp]!.graveyard).toEqual(expect.arrayContaining([f1, f2]));
  });
});

describe("round 310: Decree of Silence", () => {
  it("counters each spell an opponent casts and gets a depletion counter; at three it's sacrificed", () => {
    const { s: s0, ap } = setup([]);
    const opp = leftOf(s0, ap);
    const decree_ = putOnBattlefield(s0, ap, decree());
    s0.objects[decree_]!.counters = { depletion: 1 };
    let s = passUntil(s0, "main1", opp);
    const spells = [inZone(s, opp, bear({ name: "Test Bear A" }), "hand"), inZone(s, opp, bear({ name: "Test Bear B" }), "hand")];
    for (const [i, id] of spells.entries()) {
      s.players[opp]!.manaPool.G = 2;
      s = settle(run(s, planCast(s, opp, id, [], undefined, "auto")), ap);
      expect(s.objects[id]!.zone).toBe("graveyard");
      if (i === 0) expect(s.objects[decree_]!.counters.depletion).toBe(2);
    }
    expect(s.objects[decree_]!.zone).toBe("graveyard");
  });
});

describe("round 310: Rent Is Due", () => {
  const treasure = () => card("Test Treasure", "Artifact — Treasure", "", { oracleText: "{T}, Sacrifice this artifact: Add one mana of any color." });
  const toEndStep = (s: GameState, ap: PlayerId) => {
    s = passUntil(s, "end", ap);
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseMay"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return s;
  };

  it("at your end step you may tap two untapped creatures and/or Treasures you control to draw a card", () => {
    const { s: s0, ap } = setup([]);
    const rent_ = putOnBattlefield(s0, ap, rent());
    const b = putOnBattlefield(s0, ap, bear());
    const tr = putOnBattlefield(s0, ap, treasure());
    let s = toEndStep(s0, ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    const hand = s.players[ap]!.hand.length;
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    if (s.pending?.kind === "pickPermanents") {
      expect([...s.pending.options].sort()).toEqual([b, tr].sort());
      s = act(s, { type: "pickPermanents", player: ap, ids: [b, tr] });
    }
    s = settle(s, ap);
    expect(s.objects[b]!.tapped && s.objects[tr]!.tapped).toBe(true);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.objects[rent_]!.zone).toBe("battlefield");
  });

  it("otherwise it's sacrificed: with only one untapped creature or Treasure it can't be done", () => {
    const { s: s0, ap } = setup([]);
    const rent_ = putOnBattlefield(s0, ap, rent());
    putOnBattlefield(s0, ap, bear());
    const tapped = putOnBattlefield(s0, ap, treasure());
    s0.objects[tapped]!.tapped = true;
    let s = passUntil(s0, "end", ap);
    s = settle(s, ap);
    if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), ap);
    expect(s.objects[rent_]!.zone).toBe("graveyard");
  });
});
