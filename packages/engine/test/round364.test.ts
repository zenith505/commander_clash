// Round 364 (Lane A): a creature that must be blocked by exactly one creature and makes a token copy of itself attacking
// for each creature the defending player controls (Nacatl War-Pride); the next exhaust ability copied (Pit Automaton);
// a coin flip doubling or preventing the next damage of a source of yours (Desperate Gambit); casting from the top of the
// library spells that share a card type with a card exiled with it (Cemetery Illuminator); and the next combat damage of
// an unblocked creature of your choice cut to 1 (Forcefield).

import { describe, expect, it } from "vitest";
import { act, addEffect, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";
import { blockRequirementProblem } from "../src/game";
import { nextRandom } from "../src/rng";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions are answered as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes until `me` has a question of `kind`, other players' questions answered as the bots would (no attacks or blocks). */
const until = (s: GameState, me: PlayerId, kind: string, max = 3000) => {
  for (let i = 0; i < max; i++) {
    const p = s.pending;
    if (p?.player === me && p.kind === kind) return s;
    const who = waitingOn(s)!;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: who, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: who, blocks: [] });
    else if (p?.kind === "discardToHandSize") s = act(s, { type: "discard", player: who, objectIds: s.players[who]!.hand.slice(0, p.count) });
    else if (p) for (const a of botActions(s, who)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: who });
  }
  throw new Error(`no ${kind} for ${me}`);
};
const toTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  invalidateCharacteristics(s);
  return id;
};
const toYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
};
const toHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** The next coin flip is won (or lost): an rng state whose next number is below one half (or not). */
const rigFlip = (s: GameState, win: boolean) => {
  for (let x = 1; x < 1000; x++) {
    const probe = { rngState: x };
    if (nextRandom(probe) < 0.5 === win) {
      s.rngState = x;
      return;
    }
  }
};
const named = (s: GameState, name: string) => s.battlefield.filter((id) => characteristics(s, s.objects[id]!).name === name);
const next = (s: GameState, pid: PlayerId, k = 1) => s.turnOrder[(s.turnOrder.indexOf(pid) + k) % 4]!;
const declare = (s: GameState, pid: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId }[]) => {
  s = until(s, pid, "declareAttackers");
  return act(s, { type: "declareAttackers", player: pid, attacks });
};

// Real oracle text (Scryfall).
const nacatl = (): CardDef => ({"oracleId":"692fdca7-0eff-4d2d-b744-213b6f6e18fb","name":"Nacatl War-Pride","manaCost":"{3}{G}{G}{G}","cmc":6,"typeLine":"Creature — Cat Warrior","supertypes":[],"types":["Creature"],"subtypes":["Cat","Warrior"],"oracleText":"This creature must be blocked by exactly one creature if able.\nWhenever this creature attacks, create X tokens that are copies of it and that are tapped and attacking, where X is the number of creatures defending player controls. Exile the tokens at the beginning of the next end step.","power":"3","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/e/4ef863d2-1e11-41cc-90d5-008bf6234565.jpg?1783943095","artUrl":"https://cards.scryfall.io/art_crop/front/4/e/4ef863d2-1e11-41cc-90d5-008bf6234565.jpg?1783943095","commanderLegal":"legal","set":"fut","releasedAt":"2007-05-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const pit = (): CardDef => ({"oracleId":"49bfecc3-6258-454e-a8fd-fc49098a0898","name":"Pit Automaton","manaCost":"{2}","cmc":2,"typeLine":"Artifact Creature — Construct","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Construct"],"oracleText":"Defender\n{T}: Add {C}{C}. Spend this mana only to activate abilities.\n{2}, {T}: When you next activate an exhaust ability that isn't a mana ability this turn, copy it. You may choose new targets for the copy.","power":"0","toughness":"4","colors":[],"colorIdentity":[],"keywords":["Defender"],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c72527ef-ac05-44c8-8c76-10532ce3da6e.jpg?1783907847","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c72527ef-ac05-44c8-8c76-10532ce3da6e.jpg?1783907847","commanderLegal":"legal","set":"dft","releasedAt":"2025-02-14","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const gambit = (): CardDef => ({"oracleId":"d8328d27-e27f-4c84-8ab5-cabb80a34f54","name":"Desperate Gambit","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose a source you control and flip a coin. If you win the flip, the next time that source would deal damage this turn, it deals double that damage instead. If you lose the flip, the next time it would deal damage this turn, prevent that damage.","colors":["R"],"colorIdentity":["R"],"keywords":["Double"],"imageUrl":"https://cards.scryfall.io/normal/front/f/4/f4245160-274e-4c39-9bcd-c64e9a44dfdb.jpg?1783946727","artUrl":"https://cards.scryfall.io/art_crop/front/f/4/f4245160-274e-4c39-9bcd-c64e9a44dfdb.jpg?1783946727","commanderLegal":"legal","set":"wth","releasedAt":"1997-06-09","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const illum = (): CardDef => ({"oracleId":"14fe4531-96cd-415b-aa4a-b41fd271d902","name":"Cemetery Illuminator","manaCost":"{1}{U}{U}","cmc":3,"typeLine":"Creature — Spirit","supertypes":[],"types":["Creature"],"subtypes":["Spirit"],"oracleText":"Flying\nWhenever this creature enters or attacks, exile a card from a graveyard.\nYou may look at the top card of your library any time.\nOnce each turn, you may cast a spell from the top of your library if it shares a card type with a card exiled with this creature.","power":"2","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/f/7/f7fe69d3-f6b6-4a11-a4c8-d98fc4cf53dd.jpg?1783924282","artUrl":"https://cards.scryfall.io/art_crop/front/f/7/f7fe69d3-f6b6-4a11-a4c8-d98fc4cf53dd.jpg?1783924282","commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const field = (): CardDef => ({"oracleId":"bd6823fb-a696-4e6d-9c5e-3b55dfe03730","name":"Forcefield","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{1}: The next time an unblocked creature of your choice would deal combat damage to you this turn, prevent all but 1 of that damage.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/f/3f2004c1-8efe-407f-bf48-27b807422eea.jpg?1783948667","artUrl":"https://cards.scryfall.io/art_crop/front/3/f/3f2004c1-8efe-407f-bf48-27b807422eea.jpg?1783948667","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const launcher = (): CardDef => ({"oracleId":"b46bac37-5b45-4be5-93d0-76e48dbd9f74","name":"Camera Launcher","manaCost":"{3}","cmc":3,"typeLine":"Artifact Creature — Construct","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Construct"],"oracleText":"Exhaust — {3}: Put a +1/+1 counter on this creature. Create a 1/1 colorless Thopter artifact creature token with flying. (Activate each exhaust ability only once.)","power":"2","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Exhaust"],"imageUrl":"https://cards.scryfall.io/normal/front/9/6/968651db-92fb-46cd-acda-9e097668b7c9.jpg?1783907850","artUrl":"https://cards.scryfall.io/art_crop/front/9/6/968651db-92fb-46cd-acda-9e097668b7c9.jpg?1783907850","commanderLegal":"legal","set":"dft","releasedAt":"2025-02-14","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const loot = (): CardDef => ({"oracleId":"68c7e459-0932-4644-a3c0-9a1eae1db7a3","name":"Loot, the Pathfinder","manaCost":"{2}{G}{U}{R}","cmc":5,"typeLine":"Legendary Creature — Beast Noble","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Beast","Noble"],"oracleText":"Double strike, vigilance, haste\nExhaust — {G}, {T}: Add three mana of any one color. (Activate each exhaust ability only once.)\nExhaust — {U}, {T}: Draw three cards.\nExhaust — {R}, {T}: Loot deals 3 damage to any target.","power":"2","toughness":"4","colors":["G","R","U"],"colorIdentity":["G","R","U"],"keywords":["Vigilance","Haste","Exhaust","Double strike"],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/2/5/2528d058-5ca3-4671-8bf1-c8161872cd36.jpg?1783907799","artUrl":"https://cards.scryfall.io/art_crop/front/2/5/2528d058-5ca3-4671-8bf1-c8161872cd36.jpg?1783907799","commanderLegal":"legal","set":"dft","releasedAt":"2025-02-14","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const ogre = (): CardDef => ({"oracleId":"83c8a3a6-2e1a-4e26-8847-6d066f42d906","name":"Gray Ogre","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Ogre","supertypes":[],"types":["Creature"],"subtypes":["Ogre"],"oracleText":"","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/3/73ae5276-b607-4f23-a9d2-e8cc7b8e3693.jpg?1783948685","artUrl":"https://cards.scryfall.io/art_crop/front/7/3/73ae5276-b607-4f23-a9d2-e8cc7b8e3693.jpg?1783948685","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const drums = (): CardDef => ({"oracleId":"29c21edd-781b-448e-824a-17bc8b8f4077","name":"Goblin War Drums","manaCost":"{2}{R}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Creatures you control have menace. (They can't be blocked except by two or more creatures.)","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/d/6d18b250-cbfb-4248-96c6-c1b36f8299b8.jpg?1783935147","artUrl":"https://cards.scryfall.io/art_crop/front/6/d/6d18b250-cbfb-4248-96c6-c1b36f8299b8.jpg?1783935147","commanderLegal":"legal","set":"a25","releasedAt":"2018-03-16","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const anthem = (): CardDef => ({"oracleId":"e3886fe8-9b76-4613-8891-4ec74657c087","name":"Glorious Anthem","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Creatures you control get +1/+1.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/1/61f867c5-0727-4408-b479-b81518daa0ec.jpg?1783946375","artUrl":"https://cards.scryfall.io/art_crop/front/6/1/61f867c5-0727-4408-b479-b81518daa0ec.jpg?1783946375","commanderLegal":"legal","set":"usg","releasedAt":"1998-10-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const keen = (): CardDef => ({"oracleId":"8cadf9c0-9a63-4cde-a6be-0ae86890c831","name":"Keen Buccaneer","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Octopus Pirate","supertypes":[],"types":["Creature"],"subtypes":["Octopus","Pirate"],"oracleText":"Vigilance\nExhaust — {1}{U}: Draw a card, then discard a card. Put a +1/+1 counter on this creature. (Activate each exhaust ability only once.)","power":"2","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Vigilance","Exhaust"],"imageUrl":"https://cards.scryfall.io/normal/front/0/e/0ed90a63-5aca-470a-8e1e-518d8aeb6d91.jpg?1783907908","artUrl":"https://cards.scryfall.io/art_crop/front/0/e/0ed90a63-5aca-470a-8e1e-518d8aeb6d91.jpg?1783907908","commanderLegal":"legal","set":"dft","releasedAt":"2025-02-14","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

describe("round 364: compiles", () => {
  it("every card of the round", () => supported(nacatl(), pit(), gambit(), illum(), field()));
});

describe("Nacatl War-Pride", () => {
  const attack = () => {
    const { s: s0, ap, opp } = setup([]);
    const nac = putOnBattlefield(s0, ap, nacatl());
    const a = putOnBattlefield(s0, opp, ogre());
    const b = putOnBattlefield(s0, opp, giant());
    putOnBattlefield(s0, next(s0, ap, 2), ogre());
    let s = declare(s0, ap, [{ attacker: nac, defender: opp }]);
    // Each token's attack is its controller's choice (CR 508.4): the bots answer here.
    s = settle(s);
    return { s, ap, opp, nac, a, b };
  };

  it("whenever it attacks, creates a tapped and attacking token copy for each creature the defending player controls, exiled at the next end step", () => {
    const { s: s1, ap, nac } = attack();
    const all = named(s1, "Nacatl War-Pride");
    // Two creatures for the player it attacks (not the third player's one).
    expect(all).toHaveLength(3);
    const tokens = all.filter((id) => id !== nac);
    for (const id of tokens) {
      expect(s1.objects[id]!.isToken).toBe(true);
      expect(s1.objects[id]!.tapped).toBe(true);
      expect(s1.objects[id]!.attacking).not.toBeUndefined();
    }
    // They entered attacking: no trigger of their own (rulings, CR 508.3a).
    expect(s1.stack.length + s1.triggerQueue.length).toBe(0);
    let s = until(s1, next(s1, ap), "declareBlockers");
    for (const a of botActions(s, next(s1, ap))) s = act(s, a);
    s = passUntil(s, "upkeep", next(s1, ap));
    expect(named(s, "Nacatl War-Pride")).toEqual([nac]);
    for (const id of tokens) expect(s.objects[id]?.zone ?? "gone").not.toBe("battlefield");
  });

  it("must be blocked by exactly one creature if able: not unblocked, not by two, when one could block it alone", () => {
    const { s: s1, opp, nac, a, b } = attack();
    const s = until(s1, opp, "declareBlockers");
    const [t1] = named(s, "Nacatl War-Pride").filter((id) => id !== nac);
    expect(blockRequirementProblem(s, opp, [])).toMatch(/must be blocked/);
    expect(blockRequirementProblem(s, opp, [{ blocker: a, attacker: nac }, { blocker: b, attacker: nac }])).toMatch(/exactly one creature/);
    expect(blockRequirementProblem(s, opp, [{ blocker: a, attacker: nac }, { blocker: b, attacker: t1! }])).toBeNull();
    // Each one blocked by one: the other token can't be blocked by anyone left.
    expect(() => act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: a, attacker: nac }, { blocker: b, attacker: nac }] })).toThrow(/exactly one/);
    const ok = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: a, attacker: nac }, { blocker: b, attacker: t1! }] });
    expect(ok.objects[nac]!.blockedBy).toEqual([a]);
  });

  it("with menace no one creature can block it, so it may be blocked by two or by none (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const nac = putOnBattlefield(s0, ap, nacatl());
    addEffect(s0, ap, [nac], [{ kind: "addKeywords", keywords: ["Menace"] }]);
    const a = putOnBattlefield(s0, opp, ogre());
    const b = putOnBattlefield(s0, opp, giant());
    let s = settle(declare(s0, ap, [{ attacker: nac, defender: opp }]));
    s = until(s, opp, "declareBlockers");
    // The tokens copy it without the effect's menace (CR 707.2): those still must be blocked by one.
    const tokens = named(s, "Nacatl War-Pride").filter((id) => id !== nac);
    expect(tokens).toHaveLength(2);
    expect(blockRequirementProblem(s, opp, [{ blocker: a, attacker: nac }, { blocker: b, attacker: nac }])).toBeNull();
    expect(blockRequirementProblem(s, opp, [{ blocker: a, attacker: tokens[0]! }, { blocker: b, attacker: tokens[1]! }])).toBeNull();
  });

  it("a bot blocks it with one creature at most, obeying the requirement", () => {
    const { s: s1, opp } = attack();
    const s = until(s1, opp, "declareBlockers");
    const [a] = botActions(s, opp);
    expect(a?.type).toBe("declareBlockers");
    const blocks = a!.type === "declareBlockers" ? a!.blocks : [];
    const per = new Map<string, number>();
    for (const b of blocks) per.set(b.attacker, (per.get(b.attacker) ?? 0) + 1);
    expect([...per.values()].every((n) => n === 1)).toBe(true);
    expect(blockRequirementProblem(s, opp, blocks)).toBeNull();
  });
});

describe("Pit Automaton", () => {
  it("copies the next exhaust ability you activate this turn, only that one", () => {
    const { s: s0, ap } = setup([]);
    const p = putOnBattlefield(s0, ap, pit());
    const cam = putOnBattlefield(s0, ap, launcher());
    const keen_ = putOnBattlefield(s0, ap, keen());
    let s = settle(run(s0, planActivate(s0, ap, p, 0)), ap);
    expect(s.nextCast?.some((d) => d.exhaust)).toBe(true);
    s = settle(run(s, planActivate(s, ap, cam, 0)), ap);
    // Camera Launcher's ability twice: two +1/+1 counters, two Thopters.
    expect(s.objects[cam]!.counters["+1/+1"]).toBe(2);
    expect(named(s, "Thopter Token").length).toBe(2);
    // Used up: Keen Buccaneer's exhaust ability isn't copied.
    expect(s.nextCast?.some((d) => d.exhaust) ?? false).toBe(false);
    s = run(s, planActivate(s, ap, keen_, 0));
    s = settle(s, ap);
    if (s.pending?.kind === "discard" || s.pending?.player === ap) for (const x of botActions(s, ap)) s = act(s, x);
    s = settle(s, ap);
    expect(s.objects[keen_]!.counters["+1/+1"]).toBe(1);
  });

  it("an exhaust mana ability doesn't use it up (rulings), and it lasts only this turn", () => {
    const { s: s0, ap } = setup([]);
    const p = putOnBattlefield(s0, ap, pit());
    const l = putOnBattlefield(s0, ap, loot());
    let s = settle(run(s0, planActivate(s0, ap, p, 0)), ap);
    const f = s.battlefield.find((id) => characteristics(s, s.objects[id]!).name === "Forest" && !s.objects[id]!.tapped)!;
    s = act(s, { type: "activateMana", player: ap, objectId: f, mana: "G" });
    s = act(s, { type: "activateMana", player: ap, objectId: l, mana: "R", ability: 0 });
    expect(s.players[ap]!.manaPool.R).toBe(3);
    expect(s.nextCast?.some((d) => d.exhaust)).toBe(true);
    s = passUntil(s, "upkeep", next(s, ap));
    expect(s.nextCast?.some((d) => d.exhaust) ?? false).toBe(false);
  });

  it("a bot activates it only with an exhaust ability of its own still to use", () => {
    const { s: s0, ap } = setup([]);
    const p = putOnBattlefield(s0, ap, pit());
    const acts = botActions(s0, ap);
    expect(acts.some((a) => a.type === "activateAbility" && a.objectId === p)).toBe(false);
  });
});

describe("Desperate Gambit", () => {
  const prep = () => {
    const { s: s0, ap, opp, ids } = setup([gambit(), bolt(), bolt()]);
    const theirs = putOnBattlefield(s0, opp, giant());
    let s = run(s0, planCast(s0, ap, ids[1]!, [{ kind: "player", id: opp }]));
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s, ap);
    return { s, ap, opp, ids, theirs };
  };

  it("chooses a source you control as it resolves (a spell on the stack too), then flips: won, its next damage is doubled", () => {
    const { s: s1, ap, opp, ids, theirs } = prep();
    const p = s1.pending;
    expect(p?.kind === "chooseOption" && p.what).toBe("damageSource");
    const options = p?.kind === "chooseOption" ? p.options : [];
    const key = options.find((k) => k.startsWith(`${ids[1]}@`));
    expect(key).toBeDefined();
    // Not an opponent's creature.
    expect(options.some((k) => k.startsWith(`${theirs}@`))).toBe(false);
    rigFlip(s1, true);
    let s = settle(act(s1, { type: "chooseOption", player: ap, choice: key! }), ap);
    expect(s.log.some((l) => /wins the flip/.test(l.text))).toBe(true);
    expect(s.players[opp]!.life).toBe(40 - 6);
    // Only the next time: the second Bolt deals 3.
    s = settle(run(s, planCast(s, ap, ids[2]!, [{ kind: "player", id: opp }])), ap);
    expect(s.players[opp]!.life).toBe(40 - 6 - 3);
  });

  it("lost, the next time that source would deal damage this turn, that damage is prevented", () => {
    const { s: s1, ap, opp, ids } = prep();
    const p = s1.pending;
    const key = (p?.kind === "chooseOption" ? p.options : []).find((k) => k.startsWith(`${ids[1]}@`))!;
    rigFlip(s1, false);
    let s = settle(act(s1, { type: "chooseOption", player: ap, choice: key }), ap);
    expect(s.log.some((l) => /loses the flip/.test(l.text))).toBe(true);
    expect(s.players[opp]!.life).toBe(40);
    s = settle(run(s, planCast(s, ap, ids[2]!, [{ kind: "player", id: opp }])), ap);
    expect(s.players[opp]!.life).toBe(37);
  });

  it("a bot casts it only for an unblocked attacker of its own with power 3 or more, and chooses that creature", () => {
    const { s: s0, ap, opp, ids } = setup([gambit()]);
    const g = putOnBattlefield(s0, ap, giant());
    expect(botActions(s0, ap).some((a) => a.type === "castSpell" && a.objectId === ids[0])).toBe(false);
    let s = declare(s0, ap, [{ attacker: g, defender: opp }]);
    s = until(s, opp, "declareBlockers");
    s = act(s, { type: "declareBlockers", player: opp, blocks: [] });
    for (let i = 0; i < 5 && s.objects[ids[0]!]!.zone === "hand"; i++) for (const a of botActions(s, ap)) s = act(s, a);
    expect(s.objects[ids[0]!]!.zone).toBe("stack");
    s = settle(s, ap);
    const p = s.pending;
    expect(p?.kind === "chooseOption" && p.what).toBe("damageSource");
    const [pick] = botActions(s, ap);
    expect(pick?.type === "chooseOption" && pick.choice.startsWith(`${g}@`)).toBe(true);
  });
});

describe("Cemetery Illuminator", () => {
  const prep = () => {
    const { s: s0, ap, opp } = setup([]);
    const ill = toHand(s0, ap, illum());
    toYard(s0, opp, bolt());
    let s = run(s0, planCast(s0, ap, ill));
    s = settle(s, ap);
    // Its enters ability: exile a card from a graveyard (the only one, Lightning Bolt).
    for (let i = 0; i < 3 && s.pending?.player === ap; i++) {
      for (const a of botActions(s, ap)) s = act(s, a);
      s = settle(s, ap);
    }
    return { s, ap, opp, ill };
  };

  it("once each turn, you may cast a spell from the top of your library that shares a card type with a card exiled with it", () => {
    const { s: s1, ap, opp } = prep();
    expect(s1.players[opp]!.graveyard.length).toBe(0);
    const top = toTop(s1, ap, bolt());
    let s = settle(run(s1, planCast(s1, ap, top, [{ kind: "player", id: opp }])), ap);
    expect(s.players[opp]!.life).toBe(37);
    // Once each turn: the next instant on top waits for the next turn.
    const again = toTop(s, ap, bolt());
    expect(planCast(s, ap, again, [{ kind: "player", id: opp }])).toBeNull();
  });

  it("not a spell that shares no card type with the exiled card", () => {
    const { s: s1, ap } = prep();
    const top = toTop(s1, ap, divination());
    expect(planCast(s1, ap, top)).toBeNull();
  });
});

describe("Forcefield", () => {
  it("the next time an unblocked creature of your choice would deal combat damage to you this turn, all but 1 of it is prevented", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, giant());
    const o = putOnBattlefield(s0, ap, ogre());
    const blocker = putOnBattlefield(s0, opp, ogre());
    const ff = putOnBattlefield(s0, opp, field());
    putOnBattlefield(s0, opp, card("Wastes", "Basic Land", "", { producedMana: ["C"], oracleText: "{T}: Add {C}." }));
    let s = declare(s0, ap, [{ attacker: g, defender: opp }, { attacker: o, defender: opp }]);
    s = until(s, opp, "declareBlockers");
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker: o }] });
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    s = settle(run(s, planActivate(s, opp, ff, 0)), opp);
    const p = s.pending;
    expect(p?.kind === "chooseOption" && p.what).toBe("damageSource");
    const options = p?.kind === "chooseOption" ? p.options : [];
    // Only the unblocked attacker.
    expect(options.map((k) => k.split("@")[0])).toEqual([g]);
    s = act(s, { type: "chooseOption", player: opp, choice: options[0]! });
    s = passUntil(s, "end", ap);
    expect(s.players[opp]!.life).toBe(39);
  });

  it("a bot uses it against an unblocked attacker that would deal it 2 or more", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, giant());
    const g2 = putOnBattlefield(s0, ap, giant());
    const ff = putOnBattlefield(s0, opp, field());
    putOnBattlefield(s0, opp, card("Wastes", "Basic Land", "", { producedMana: ["C"], oracleText: "{T}: Add {C}." }));
    let s = declare(s0, ap, [{ attacker: g, defender: opp }, { attacker: g2, defender: opp }]);
    s = until(s, opp, "declareBlockers");
    s = act(s, { type: "declareBlockers", player: opp, blocks: [] });
    s = act(s, { type: "passPriority", player: ap });
    const acts = botActions(s, opp);
    expect(acts.some((a) => a.type === "activateAbility" && a.objectId === ff)).toBe(true);
  });
});
