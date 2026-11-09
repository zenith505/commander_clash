// Lane B round B158: Woodcaller Automaton (a land becomes a Treefolk with ~'s power and toughness, for good), Conjured
// Currency (exchange with a permanent you neither own nor control), Leshrac's Sigil (a paid look at the caster's hand),
// Cheering Fanatic (spells with a chosen name cost {1} less this turn), Djinn of Wishes (play the revealed card now or it's
// exiled), Brain in a Jar (a free spell with mana value exactly the charge counters), Jester's Mask (the hand goes on top and
// you pick that many cards for it), Distended Mindbender (one cheap nonland card and one expensive card discarded) and
// Goblin Festival (a lost flip gives it to an opponent of your choice).

import { describe, expect, it } from "vitest";
import { act, bear, card, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const woodcaller = (): CardDef => ({"oracleId":"124c3af4-8545-479a-b44c-446da1c8b535","name":"Woodcaller Automaton","manaCost":"{10}","cmc":10,"typeLine":"Artifact Creature — Construct","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Construct"],"oracleText":"Prototype {2}{G}{G} — 3/3 (You may cast this spell with different mana cost, color, and size. It keeps its abilities and types.)\nWhen this creature enters, if you cast it, untap target land you control. It becomes a Treefolk creature with haste and base power and toughness equal to this creature's power and toughness. It's still a land.","power":"8","toughness":"8","colors":[],"colorIdentity":["G"],"keywords":["Prototype"],"imageUrl":"https://cards.scryfall.io/normal/front/3/7/37065a61-3883-49fa-a931-8f1566451795.jpg?1783919957","artUrl":"https://cards.scryfall.io/art_crop/front/3/7/37065a61-3883-49fa-a931-8f1566451795.jpg?1783919957","commanderLegal":"legal","set":"bro","releasedAt":"2022-11-18","rarity":"rare","layout":"prototype","gameChanger":false}) as CardDef;
const currency = (): CardDef => ({"oracleId":"427ba80d-cfdf-4651-a1eb-89a2125a9217","name":"Conjured Currency","manaCost":"{5}{U}","cmc":6,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, you may exchange control of this enchantment and target permanent you neither own nor control.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/7/a7c2ea6e-7d29-4526-b135-9bbb1eed9d4a.jpg?1783940370","artUrl":"https://cards.scryfall.io/art_crop/front/a/7/a7c2ea6e-7d29-4526-b135-9bbb1eed9d4a.jpg?1783940370","commanderLegal":"legal","set":"rtr","releasedAt":"2012-10-05","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const sigil = (): CardDef => ({"oracleId":"98388eba-31ab-4302-be9e-ea67ea2b8c1a","name":"Leshrac's Sigil","manaCost":"{B}{B}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever an opponent casts a green spell, you may pay {B}{B}. If you do, look at that player's hand and choose a card from it. The player discards that card.\n{B}{B}: Return this enchantment to its owner's hand.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/6/3672010d-7293-4906-b76d-759112c89c51.jpg?1783919209","artUrl":"https://cards.scryfall.io/art_crop/front/3/6/3672010d-7293-4906-b76d-759112c89c51.jpg?1783919209","commanderLegal":"legal","set":"sld","releasedAt":"2022-11-28","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const fanatic = (): CardDef => ({"oracleId":"18543bb3-14f9-45a0-8ed3-5f11832527d9","name":"Cheering Fanatic","manaCost":"{1}{R}","cmc":2,"typeLine":"Creature — Goblin","supertypes":[],"types":["Creature"],"subtypes":["Goblin"],"oracleText":"Whenever this creature attacks, choose a card name. Spells with the chosen name cost {1} less to cast this turn.","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/8/88cf8e2b-482e-4d40-a8d7-1a74cec3d983.jpg?1783934859","artUrl":"https://cards.scryfall.io/art_crop/front/8/8/88cf8e2b-482e-4d40-a8d7-1a74cec3d983.jpg?1783934859","commanderLegal":"legal","set":"bbd","releasedAt":"2018-06-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const djinn = (): CardDef => ({"oracleId":"a34c3012-f787-4998-93c7-89c4decaa1ba","name":"Djinn of Wishes","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Creature — Djinn","supertypes":[],"types":["Creature"],"subtypes":["Djinn"],"oracleText":"Flying\nThis creature enters with three wish counters on it.\n{2}{U}{U}, Remove a wish counter from this creature: Reveal the top card of your library. You may play that card without paying its mana cost. If you don't, exile it.","power":"4","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/3/e/3e3b0949-17e1-4f12-8999-d4638d32dd3e.jpg?1783942393","artUrl":"https://cards.scryfall.io/art_crop/front/3/e/3e3b0949-17e1-4f12-8999-d4638d32dd3e.jpg?1783942393","commanderLegal":"legal","set":"m10","releasedAt":"2009-07-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const brain = (): CardDef => ({"oracleId":"321dbd10-1d48-49fc-ba6a-1df241a53338","name":"Brain in a Jar","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{1}, {T}: Put a charge counter on this artifact, then you may cast an instant or sorcery spell with mana value equal to the number of charge counters on this artifact from your hand without paying its mana cost.\n{3}, {T}, Remove X charge counters from this artifact: Scry X.","colors":[],"colorIdentity":[],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/8/8/88ecfcbe-e8db-4f08-aa8b-5b7b3e6c6ce7.jpg?1783937708","artUrl":"https://cards.scryfall.io/art_crop/front/8/8/88ecfcbe-e8db-4f08-aa8b-5b7b3e6c6ce7.jpg?1783937708","commanderLegal":"legal","set":"soi","releasedAt":"2016-04-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const mask = (): CardDef => ({"oracleId":"bcc797b9-d2e5-4fde-8d80-c890c871f344","name":"Jester's Mask","manaCost":"{5}","cmc":5,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"This artifact enters tapped.\n{1}, {T}, Sacrifice this artifact: Target opponent puts the cards from their hand on top of their library. Search that player's library for that many cards. That player puts those cards into their hand, then shuffles.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/a/daa1ba0c-cb89-4bb2-8a35-6a4a4eecccf7.jpg?1783947458","artUrl":"https://cards.scryfall.io/art_crop/front/d/a/daa1ba0c-cb89-4bb2-8a35-6a4a4eecccf7.jpg?1783947458","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const mindbender = (): CardDef => ({"oracleId":"36d32194-d547-4e2d-894f-f4bf13cf7da6","name":"Distended Mindbender","manaCost":"{8}","cmc":8,"typeLine":"Creature — Eldrazi Insect","supertypes":[],"types":["Creature"],"subtypes":["Eldrazi","Insect"],"oracleText":"Emerge {5}{B}{B} (You may cast this spell by sacrificing a creature and paying the emerge cost reduced by that creature's mana value.)\nWhen you cast this spell, target opponent reveals their hand. You choose from it a nonland card with mana value 3 or less and a card with mana value 4 or greater. That player discards those cards.","power":"5","toughness":"5","colors":[],"colorIdentity":["B"],"keywords":["Emerge"],"imageUrl":"https://cards.scryfall.io/normal/front/8/b/8b5d1e41-fb0b-4866-912a-2a7d49542428.jpg?1783937528","artUrl":"https://cards.scryfall.io/art_crop/front/8/b/8b5d1e41-fb0b-4866-912a-2a7d49542428.jpg?1783937528","commanderLegal":"legal","set":"emn","releasedAt":"2016-07-22","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const festival = (): CardDef => ({"oracleId":"de21b90f-a268-46d6-b977-d5b0856176f3","name":"Goblin Festival","manaCost":"{1}{R}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"{2}: This enchantment deals 1 damage to any target. Flip a coin. If you lose the flip, choose one of your opponents. That player gains control of this enchantment.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/c/ac067eb8-427f-4bfa-b392-0bb41ac8370e.jpg?1783946069","artUrl":"https://cards.scryfall.io/art_crop/front/a/c/ac067eb8-427f-4bfa-b392-0bb41ac8370e.jpg?1783946069","commanderLegal":"legal","set":"uds","releasedAt":"1999-06-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const tgt = (id: string) => ({ kind: "object" as const, id });
const ply = (id: PlayerId) => ({ kind: "player" as const, id });
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Everyone passes, answering the end-of-turn questions, until `active`'s `step`; stops at any other question. */
const goUntil = (s: GameState, step: GameState["step"], active: PlayerId, max = 3000) => {
  for (let i = 0; i < max; i++) {
    if (s.step === step && s.activePlayer === active) return s;
    const pid = waitingOn(s)!;
    const pend = s.pending;
    if (pend?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (pend?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (pend?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, pend.count) });
    else if (pend) return s;
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error(`never reached ${step}`);
};
const toZone = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone === "hand" ? "hand" : "graveyard"].push(id);
  invalidateCharacteristics(s);
  return id;
};
const others = (s: GameState, ap: PlayerId) => {
  const i = s.turnOrder.indexOf(ap);
  return [1, 2, 3].map((k) => s.turnOrder[(i + k) % 4]!);
};
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
const lines = (s: GameState) => s.log.map((l) => l.text);
const forestOf = (s: GameState, pid: PlayerId) => s.battlefield.find((id) => controllerOf(s, s.objects[id]!) === pid && characteristics(s, s.objects[id]!).subtypes.includes("Forest"))!;
const shock = () => card("Test Shock", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Test Shock deals 2 damage to any target." });
const growth = () => card("Test Growth", "Sorcery", "{G}", { cmc: 1, colors: ["G"], oracleText: "Draw a card." });
const ogre = (mv: number, name = `Ogre ${mv}`) => card(name, "Creature — Ogre", `{${mv - 1}}{R}`, { cmc: mv, colors: ["R"], power: "3", toughness: "3" });

describe("Lane B round B158", () => {
  it("compiles the cards", () => supported(woodcaller(), currency(), sigil(), fanatic(), djinn(), brain(), mask(), mindbender(), festival()));

  it("Woodcaller Automaton prototyped: the land it untaps becomes a 3/3 Treefolk creature with haste for good, still a land", () => {
    const { s: s0, ap, ids } = setup([woodcaller()]);
    s0.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 2, C: 2 };
    const land = forestOf(s0, ap);
    s0.objects[land]!.tapped = true;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { alt: "prototype" })));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(land)] }));
    const o = s.objects[land]!;
    expect(o.tapped).toBe(false);
    const ch = characteristics(s, o);
    expect(ch.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(ch.subtypes).toEqual(expect.arrayContaining(["Forest", "Treefolk"]));
    expect([power(s, o), toughness(s, o)]).toEqual([3, 3]);
    expect(objHasKeyword(s, o, "Haste")).toBe(true);
    // For the rest of the game (no duration): still a creature on the next turn.
    s = goUntil(s, "upkeep", others(s, ap)[0]!);
    expect(characteristics(s, s.objects[land]!).types).toContain("Creature");
    expect(power(s, s.objects[land]!)).toBe(3);
  });

  it("Woodcaller Automaton cast for {10}: an 8/8 land; its power and toughness are locked in as the trigger resolves (rulings)", () => {
    const { s: s0, ap, ids } = setup([woodcaller()]);
    s0.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 10 };
    const land = forestOf(s0, ap);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(land)] }));
    expect([power(s, s.objects[land]!), toughness(s, s.objects[land]!)]).toEqual([8, 8]);
    // A later boost to Woodcaller doesn't change the land.
    s.objects[ids[0]!]!.counters["+1/+1"] = 2;
    invalidateCharacteristics(s);
    expect(power(s, s.objects[ids[0]!]!)).toBe(10);
    expect(power(s, s.objects[land]!)).toBe(8);
  });

  it("Woodcaller Automaton put onto the battlefield without being cast doesn't trigger", () => {
    const { s: s0, ap } = setup([]);
    const w = toZone(s0, ap, woodcaller(), "graveyard");
    const reanimate = card("Test Reanimate", "Sorcery", "{B}", { cmc: 1, colors: ["B"], oracleText: "Return target creature card from your graveyard to the battlefield." });
    const r = toZone(s0, ap, reanimate, "hand");
    s0.players[ap]!.manaPool = { W: 0, U: 0, B: 1, R: 0, G: 0, C: 0 };
    const s = settle(run(s0, planCast(s0, ap, r, [tgt(w)])));
    expect(zone(s, w)).toBe("battlefield");
    expect(s.pending).toBeNull();
    expect(s.stack.length).toBe(0);
  });

  it("Conjured Currency: at your upkeep you may exchange it for a permanent another player owns and controls; not one you own", () => {
    const { s: s0, ap } = setup([]);
    const [o1, o2] = others(s0, ap);
    const cc = putOnBattlefield(s0, ap, currency());
    const theirs = putOnBattlefield(s0, o1!, bear({ name: "Their Bear" }));
    // Owned by you but controlled by an opponent: not a legal target (you own it).
    const mineThere = putOnBattlefield(s0, ap, bear({ name: "My Lent Bear" }));
    s0.objects[mineThere]!.controller = o2!;
    invalidateCharacteristics(s0);
    let s = goUntil(s0, "upkeep", o1!);
    s = goUntil(s, "upkeep", ap);
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(mineThere)] })).toThrow();
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(cc)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(theirs)] }));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
    expect(controllerOf(s, s.objects[cc]!)).toBe(o1);
  });

  it("Leshrac's Sigil: when an opponent casts a green spell you may pay {B}{B} to see their hand and pick the discard; unpaid, nothing", () => {
    for (const pay of [true, false]) {
      const { s: s0, ap } = setup([]);
      const [o1] = others(s0, ap);
      putOnBattlefield(s0, ap, sigil());
      let s = goUntil(s0, "main1", o1!);
      const g = toZone(s, o1!, growth(), "hand");
      const kept = toZone(s, o1!, bear({ name: "Kept Bear" }), "hand");
      const lost = toZone(s, o1!, ogre(4, "Lost Ogre"), "hand");
      s.players[o1!]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 1, C: 0 };
      s.players[ap]!.manaPool = { W: 0, U: 0, B: pay ? 2 : 0, R: 0, G: 0, C: 0 };
      s = run(s, planCast(s, o1!, g));
      for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
      if (!pay) {
        // Without {B}{B} there's nothing to pay with: the trigger does nothing.
        if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: ap, yes: false });
        s = settle(s);
        expect(zone(s, kept)).toBe("hand");
        expect(zone(s, lost)).toBe("hand");
        continue;
      }
      expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
      s = act(s, { type: "chooseMay", player: ap, yes: true });
      expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, hand: o1 });
      s = settle(act(s, { type: "searchLibrary", player: ap, found: [lost] }));
      expect(zone(s, lost)).toBe("graveyard");
      expect(zone(s, kept)).toBe("hand");
      expect(s.players[ap]!.manaPool.B).toBe(0);
    }
  });

  it("Leshrac's Sigil doesn't trigger on a nongreen spell or on your own green spell", () => {
    const { s: s0, ap, ids } = setup([growth()]);
    const [o1] = others(s0, ap);
    putOnBattlefield(s0, ap, sigil());
    s0.players[ap]!.manaPool = { W: 0, U: 0, B: 2, R: 0, G: 1, C: 0 };
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeNull();
    s = goUntil(s, "main1", o1!);
    const sh = toZone(s, o1!, shock(), "hand");
    s.players[o1!]!.manaPool = { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 };
    s = settle(run(s, planCast(s, o1!, sh, [ply(ap)])));
    expect(s.pending).toBeNull();
  });

  it("Cheering Fanatic: when it attacks you name a card; spells with that name cost {1} less this turn, anyone's, generic only", () => {
    const { s: s0, ap } = setup([]);
    const [o1] = others(s0, ap);
    const f = putOnBattlefield(s0, ap, fanatic());
    const mine = toZone(s0, ap, ogre(3, "Test Brute"), "hand");
    let s = goUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: f, defender: o1! }] });
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "cardName" });
    // The bot names a spell in its hand.
    expect(botActions(s, ap)[0]).toMatchObject({ type: "chooseOption", choice: "Test Brute" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Test Brute" }));
    for (let i = 0; i < 400 && s.step !== "main2"; i++) {
      if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    // {2}{R} costs {1}{R} now; {R} alone isn't enough.
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 };
    for (const id of s.battlefield) if (characteristics(s, s.objects[id]!).types.includes("Land")) s.objects[id]!.tapped = true;
    expect(planCast(s, ap, mine)).toBeNull();
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 1, G: 0, C: 1 };
    s = settle(run(s, planCast(s, ap, mine)));
    expect(zone(s, mine)).toBe("battlefield");
    // An opponent's spell with that name costs less too (this turn).
    const theirs = toZone(s, o1!, ogre(3, "Test Brute"), "hand");
    const flash = card("Test Brute", "Creature — Ogre", "{2}{R}", { cmc: 3, colors: ["R"], power: "3", toughness: "3", keywords: ["Flash"], oracleText: "Flash" });
    s.cards[s.objects[theirs]!.cardId] = { ...flash, oracleId: s.objects[theirs]!.cardId };
    invalidateCharacteristics(s);
    s.players[o1!]!.manaPool = { W: 0, U: 0, B: 0, R: 1, G: 0, C: 1 };
    for (let i = 0; i < 10 && waitingOn(s) !== o1; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(planCast(s, o1!, theirs)).not.toBeNull();
    // Next turn it's over.
    s = goUntil(s, "main1", o1!);
    s.players[o1!]!.manaPool = { W: 0, U: 0, B: 0, R: 1, G: 0, C: 1 };
    expect(planCast(s, o1!, theirs)).toBeNull();
  });

  it("Djinn of Wishes: enters with three wish counters; the revealed card may be played free now, otherwise it's exiled", () => {
    for (const play of [true, false]) {
      const { s: s0, ap } = setup([]);
      const [o1] = others(s0, ap);
      const dj = putOnBattlefield(s0, ap, djinn());
      s0.objects[dj]!.counters.wish = 3;
      const top = toZone(s0, ap, shock(), "library");
      s0.players[ap]!.manaPool = { W: 0, U: 2, B: 0, R: 0, G: 0, C: 2 };
      let s = settle(run(s0, planActivate(s0, ap, dj, 0)));
      expect(s.objects[dj]!.counters.wish).toBe(2);
      expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: top });
      if (play) {
        s = act(s, { type: "castSpell", player: ap, objectId: top, targets: [ply(o1!)] });
        expect(zone(s, top)).toBe("stack");
        const life = s.players[o1!]!.life;
        s = settle(s);
        expect(s.players[o1!]!.life).toBe(life - 2);
        expect(zone(s, top)).toBe("graveyard");
      } else {
        s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
        expect(zone(s, top)).toBe("exile");
      }
    }
  });

  it("Djinn of Wishes: a land is played only on your turn with a land play left; otherwise it's exiled", () => {
    const { s: s0, ap } = setup([]);
    const dj = putOnBattlefield(s0, ap, djinn());
    s0.objects[dj]!.counters.wish = 3;
    const land = toZone(s0, ap, card("Test Wastes", "Land", "", { oracleText: "{T}: Add {C}." }), "library");
    s0.players[ap]!.manaPool = { W: 0, U: 4, B: 0, R: 0, G: 0, C: 4 };
    let s = settle(run(s0, planActivate(s0, ap, dj, 0)));
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(zone(s, land)).toBe("battlefield");
    expect(s.players[ap]!.landsPlayedThisTurn).toBe(1);
    // A second land this turn can't be played: exiled.
    const land2 = toZone(s, ap, card("Test Wastes Two", "Land", "", { oracleText: "{T}: Add {C}." }), "library");
    s = settle(run(s, planActivate(s, ap, dj, 0)));
    expect(s.pending).toBeNull();
    expect(zone(s, land2)).toBe("exile");
  });

  it("Brain in a Jar: a charge counter, then an instant or sorcery with mana value exactly the counters, free from your hand", () => {
    const { s: s0, ap } = setup([]);
    const [o1] = others(s0, ap);
    const b = putOnBattlefield(s0, ap, brain());
    const one = toZone(s0, ap, shock(), "hand");
    const two = toZone(s0, ap, card("Test Blast", "Instant", "{1}{R}", { cmc: 2, colors: ["R"], oracleText: "Test Blast deals 3 damage to any target." }), "hand");
    s0.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 };
    let s = settle(run(s0, planActivate(s0, ap, b, 0)));
    expect(s.objects[b]!.counters.charge).toBe(1);
    // Only the mana value 1 spell is offered.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromHand", prompt: "cast an instant or sorcery spell with mana value 1 from your hand without paying its mana cost?" });
    const opts = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    expect(opts).toContain(one);
    expect(opts).not.toContain(two);
    s = act(s, { type: "chooseOption", player: ap, choice: one });
    if (s.pending?.kind === "castFree") s = act(s, { type: "castSpell", player: ap, objectId: one, targets: [ply(o1!)] });
    const life = s.players[o1!]!.life;
    s = settle(s);
    expect(s.players[o1!]!.life).toBe(life - 2);
    // Next turn, two counters: now the mana value 2 one.
    s = goUntil(s, "upkeep", o1!);
    s = goUntil(s, "main1", ap);
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 };
    s = settle(run(s, planActivate(s, ap, b, 0)));
    expect(s.objects[b]!.counters.charge).toBe(2);
    const opts2 = s.pending?.kind === "chooseOption" ? s.pending.options : s.pending?.kind === "castFree" ? [s.pending.objectId] : [];
    expect(opts2).toEqual(expect.arrayContaining([two]));
  });
  it("Jester's Mask: the opponent puts their hand on top in an order they choose, you search for that many cards and they go to that hand", () => {
    const { s: s0, ap } = setup([]);
    const [o1] = others(s0, ap);
    const m = putOnBattlefield(s0, ap, mask());
    const hand = [toZone(s0, o1!, ogre(5, "Big Ogre"), "hand"), toZone(s0, o1!, shock(), "hand"), toZone(s0, o1!, bear({ name: "Their Bear" }), "hand")];
    s0.players[o1!]!.hand = [...hand];
    const libBefore = s0.players[o1!]!.library.length;
    s0.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 };
    let s = settle(run(s0, planActivate(s0, ap, m, 0, [ply(o1!)])));
    expect(zone(s, m)).toBe("graveyard");
    // They order the cards (CR 401.4).
    expect(s.pending).toMatchObject({ kind: "handToTop", player: o1, count: 3 });
    s = act(s, { type: "handToTop", player: o1!, objectIds: [hand[1]!, hand[0]!, hand[2]!] });
    expect(s.players[o1!]!.hand).toEqual([]);
    expect(s.players[o1!]!.library.length).toBe(libBefore + 3);
    // You search their library for exactly three cards (any cards; the ones just put there too).
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 3, max: 3 });
    const cards = s.pending?.kind === "searchLibrary" ? s.pending.cards : [];
    expect(cards).toEqual(expect.arrayContaining(hand));
    const forests = cards.filter((id) => !hand.includes(id)).slice(0, 2);
    // The bot gives them the cards it rates lowest (lands before the 5-drop).
    const bot = botActions(s, ap)[0];
    expect(bot).toMatchObject({ type: "searchLibrary" });
    expect((bot as { found: string[] }).found).not.toContain(hand[0]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [...forests, hand[2]!] }));
    expect(s.players[o1!]!.hand.sort()).toEqual([...forests, hand[2]!].sort());
    expect(zone(s, hand[0]!)).toBe("library");
    expect(s.players[o1!]!.library.length).toBe(libBefore);
  });

  it("Jester's Mask on an opponent with an empty hand: nothing is put on top, and the search is for no cards", () => {
    const { s: s0, ap } = setup([]);
    const [o1] = others(s0, ap);
    const m = putOnBattlefield(s0, ap, mask());
    s0.players[o1!]!.hand = [];
    s0.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 };
    let s = settle(run(s0, planActivate(s0, ap, m, 0, [ply(o1!)])));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 0 });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    expect(s.pending).toBeNull();
    expect(s.players[o1!]!.hand).toEqual([]);
  });

  it("Distended Mindbender: when cast you choose a nonland card with mana value 3 or less and a card with mana value 4 or greater; both are discarded", () => {
    const { s: s0, ap, ids } = setup([mindbender()]);
    const [o1] = others(s0, ap);
    const land = toZone(s0, o1!, card("Test Wastes", "Land", ""), "hand");
    const cheap = toZone(s0, o1!, shock(), "hand");
    const big = toZone(s0, o1!, ogre(5, "Big Ogre"), "hand");
    const mid = toZone(s0, o1!, ogre(3, "Mid Ogre"), "hand");
    s0.players[o1!]!.hand = [land, cheap, big, mid];
    s0.players[ap]!.manaPool = { W: 0, U: 0, B: 2, R: 0, G: 0, C: 6 };
    let s = run(s0, planCast(s0, ap, ids[0]!, [ply(o1!)]));
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [ply(o1!)] });
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    // First the nonland card with mana value 3 or less (not the land).
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, hand: o1 });
    const first = s.pending?.kind === "searchLibrary" ? s.pending.cards : [];
    expect(first.sort()).toEqual([cheap, mid].sort());
    s = act(s, { type: "searchLibrary", player: ap, found: [mid] });
    // Then the card with mana value 4 or greater.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    expect(s.pending?.kind === "searchLibrary" ? s.pending.cards : []).toEqual([big]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [big] }));
    expect(zone(s, mid)).toBe("graveyard");
    expect(zone(s, big)).toBe("graveyard");
    expect(zone(s, cheap)).toBe("hand");
    expect(zone(s, land)).toBe("hand");
    expect(zone(s, ids[0]!)).toBe("battlefield");
  });

  it("Distended Mindbender: with only one kind of card there, only that one is discarded (rulings)", () => {
    const { s: s0, ap, ids } = setup([mindbender()]);
    const [o1] = others(s0, ap);
    const big = toZone(s0, o1!, ogre(5, "Big Ogre"), "hand");
    const land = toZone(s0, o1!, card("Test Wastes", "Land", ""), "hand");
    s0.players[o1!]!.hand = [big, land];
    s0.players[ap]!.manaPool = { W: 0, U: 0, B: 2, R: 0, G: 0, C: 6 };
    let s = run(s0, planCast(s0, ap, ids[0]!, [ply(o1!)]));
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [ply(o1!)] });
    for (let i = 0; i < 20 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 1 });
    expect(s.pending?.kind === "searchLibrary" ? s.pending.cards : []).toEqual([big]);
    // The bot picks too.
    for (const a of botActions(s, ap)) s = act(s, a);
    s = settle(s);
    expect(zone(s, big)).toBe("graveyard");
    expect(zone(s, land)).toBe("hand");
  });

  it("Goblin Festival: 1 damage, then a flip; lost, an opponent you choose gains control of it; won, you keep it", () => {
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 16 && outcomes.size < 2; seed++) {
      const { s: s0, ap } = setup([], seed);
      const [o1, o2] = others(s0, ap);
      const gf = putOnBattlefield(s0, ap, festival());
      s0.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 };
      const life = s0.players[o1!]!.life;
      let s = settle(run(s0, planActivate(s0, ap, gf, 0, [ply(o1!)])));
      expect(s.players[o1!]!.life).toBe(life - 1);
      if (s.pending) {
        expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "opponent" });
        s = settle(act(s, { type: "chooseOption", player: ap, choice: String(o2!) }));
        expect(controllerOf(s, s.objects[gf]!)).toBe(o2);
        expect(lines(s).some((l) => /loses the flip/.test(l))).toBe(true);
        outcomes.add("lost");
      } else {
        expect(controllerOf(s, s.objects[gf]!)).toBe(ap);
        outcomes.add("won");
      }
    }
    expect([...outcomes].sort()).toEqual(["lost", "won"]);
  });
});
