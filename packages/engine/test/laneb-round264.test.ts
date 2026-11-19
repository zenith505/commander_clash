// Lane B round B264: Soul Echo (an opponent's choice to have damage to you replaced by removing echo counters, CR 614.1a),
// Close Encounter (a creature you control or a warped card in exile chosen as an additional cost, CR 702.185b) and Bend or
// Break (each player's lands in two piles, one chosen by an opponent of their choice, CR 700.3).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, castProblem, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const soulEcho = (): CardDef => ({"oracleId":"8bc5546e-554f-430d-80b1-99578b5ea188","name":"Soul Echo","manaCost":"{X}{W}{W}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"This enchantment enters with X echo counters on it.\nYou don't lose the game for having 0 or less life.\nAt the beginning of your upkeep, sacrifice this enchantment if there are no echo counters on it. Otherwise, target opponent may choose that for each 1 damage that would be dealt to you until your next upkeep, you remove an echo counter from this enchantment instead.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/b/cb6f9427-ef5c-49fd-81e1-ddf130d69da0.jpg?1783947116","artUrl":"https://cards.scryfall.io/art_crop/front/c/b/cb6f9427-ef5c-49fd-81e1-ddf130d69da0.jpg?1783947116","layout":"normal"});
const closeEncounter = (): CardDef => ({"oracleId":"032fdd08-2ea7-442e-8162-0a8e5a585253","name":"Close Encounter","manaCost":"{1}{G}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"As an additional cost to cast this spell, choose a creature you control or a warped creature card you own in exile.\nClose Encounter deals damage equal to the power of the chosen creature or card to target creature.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/8/a8a77351-9115-470f-8141-222c1916b337.jpg?1783905941","artUrl":"https://cards.scryfall.io/art_crop/front/a/8/a8a77351-9115-470f-8141-222c1916b337.jpg?1783905941","layout":"normal"});
const bendOrBreak = (): CardDef => ({"oracleId":"4362efe4-339d-40e1-bd72-3cc9e41bf93f","name":"Bend or Break","manaCost":"{3}{R}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each player separates all nontoken lands they control into two piles. For each player, one of their piles is chosen by one of their opponents of their choice. Destroy all lands in the chosen piles. Tap all lands in the other piles.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/7/b76b6660-d4b2-44de-a1a7-8d00811f90f6.jpg?1783945687","artUrl":"https://cards.scryfall.io/art_crop/front/b/7/b76b6660-d4b2-44de-a1a7-8d00811f90f6.jpg?1783945687","layout":"normal"});
const bygoneColossus = (): CardDef => ({"oracleId":"1bd584d5-4e11-428c-b51e-462e4292b07f","name":"Bygone Colossus","manaCost":"{9}","cmc":9,"typeLine":"Artifact Creature — Robot Giant","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Robot","Giant"],"oracleText":"Warp {3} (You may cast this card from your hand for its warp cost. Exile this creature at the beginning of the next end step, then you may cast it from exile on a later turn.)","power":"9","toughness":"9","colors":[],"colorIdentity":[],"keywords":["Warp"],"imageUrl":"https://cards.scryfall.io/normal/front/4/b/4bb8f2ef-4398-4a07-9130-5005356a3b4a.jpg?1783905921","artUrl":"https://cards.scryfall.io/art_crop/front/4/b/4bb8f2ef-4398-4a07-9130-5005356a3b4a.jpg?1783905921","layout":"normal"});
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","layout":"normal"});
const lavaAxe = (): CardDef => ({"oracleId":"387b6b07-a283-412d-94c3-f7f1dc76e858","name":"Lava Axe","manaCost":"{4}{R}","cmc":5,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Lava Axe deals 5 damage to target player or planeswalker.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/1/e11ec278-46f5-4970-ad0b-f6718c73de6c.jpg?1783946235","artUrl":"https://cards.scryfall.io/art_crop/front/e/1/e11ec278-46f5-4970-ad0b-f6718c73de6c.jpg?1783946235","layout":"normal"});
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","layout":"normal"});
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","layout":"normal"});
const volcanicHammer = (): CardDef => ({"oracleId":"98fa5a06-0553-40fd-999c-bc31c9b3f4db","name":"Volcanic Hammer","manaCost":"{1}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Volcanic Hammer deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/8/58c0489d-b073-4ad4-b044-447fcc865b6c.jpg?1783946459","artUrl":"https://cards.scryfall.io/art_crop/front/5/8/58c0489d-b073-4ad4-b044-447fcc865b6c.jpg?1783946459","layout":"normal"});
const strategicPlanning = (): CardDef => ({"oracleId":"02b5acf3-47cb-4d39-9307-e02656f1879b","name":"Strategic Planning","manaCost":"{1}{U}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Look at the top three cards of your library. Put one of them into your hand and the rest into your graveyard.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/9/29306305-cb71-4fef-bf86-f5deb4e7e561.jpg?1783928255","artUrl":"https://cards.scryfall.io/art_crop/front/2/9/29306305-cb71-4fef-bf86-f5deb4e7e561.jpg?1783928255","layout":"normal"});
const stoneRain = (): CardDef => ({"oracleId":"6e880df6-fc00-43d2-a9c8-f575f40b78c6","name":"Stone Rain","manaCost":"{2}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Destroy target land.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/6/f60687e5-9384-4453-833e-2c76f25bfac5.jpg?1783927429","artUrl":"https://cards.scryfall.io/art_crop/front/f/6/f60687e5-9384-4453-833e-2c76f25bfac5.jpg?1783927429","layout":"normal"});

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
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ptgt = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const leftOf = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % s.turnOrder.length]!;
/** A fresh copy of `def` in `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Answers every question with the bots' answers until none is left (at most `max`). */
const bots = (s: GameState, max = 30) => {
  for (let i = 0; i < max && s.pending; i++) for (const a of botActions(s, s.pending.player)) s = act(s, a);
  return s;
};
/** To `pid`'s next upkeep, with its triggers waiting for targets. */
const nextUpkeep = (s: GameState, pid: PlayerId) => passUntil(passUntil(s, "upkeep", leftOf(s, pid)), "upkeep", pid);
/** Soul Echo's upkeep trigger targets `opp`, then resolves up to its question (or the end). */
const echoTrigger = (s: GameState, ap: PlayerId, opp: PlayerId) => {
  s = nextUpkeep(s, ap);
  expect(s.pending?.kind).toBe("chooseTargets");
  return settle(act(s, { type: "chooseTargets", player: ap, targets: [ptgt(opp)] }));
};

describe("Soul Echo", () => {
  it("is supported", () => supported(soulEcho(), closeEncounter(), bendOrBreak()));

  it("enters with X echo counters; the targeted opponent may have each 1 damage to you remove a counter instead, as many as there are", () => {
    const { s: s0, ap, ids, opp } = setup([soulEcho(), lavaAxe(), shock()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, 3)));
    const echo = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Soul Echo")!;
    expect(s.objects[echo]!.counters.echo).toBe(3);
    s = echoTrigger(s, ap, opp);
    expect(s.pending?.kind).toBe("chooseMay");
    if (s.pending?.kind !== "chooseMay") return;
    expect(s.pending.player).toBe(opp);
    expect(s.pending.prompt).toMatch(/dealt to .+'s controller until their next upkeep, they remove an echo counter from Soul Echo instead/);
    s = settle(act(s, { type: "chooseMay", player: opp, yes: true }));
    expect(zone(s, echo)).toBe("battlefield");
    s = passUntil(s, "main1", ap);
    const life = s.players[ap]!.life;
    // 5 damage: all of it replaced, 3 counters removed (all there are).
    s = settle(run(s, planCast(s, ap, ids[1]!, [ptgt(ap)])));
    expect(s.players[ap]!.life).toBe(life);
    expect(s.objects[echo]!.counters.echo ?? 0).toBe(0);
    expect(logged(s, /Soul Echo: 5 damage from Lava Axe to .+ isn't dealt; 5 echo counters are removed from Soul Echo instead/)).toBe(true);
    // With none left, it still replaces the damage (rulings).
    s = settle(run(s, planCast(s, ap, ids[2]!, [ptgt(ap)])));
    expect(s.players[ap]!.life).toBe(life);
    // The next upkeep: no echo counters, so it's sacrificed.
    s = echoTrigger(s, ap, opp);
    expect(zone(s, echo)).toBe("graveyard");
    expect(s.pending).toBeNull();
  });

  it("declined, damage is dealt as usual; the effect lasts until your next upkeep, and damage before the trigger resolves is dealt (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([soulEcho(), lavaAxe(), shock(), shock()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, 2)));
    const echo = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Soul Echo")!;
    s = echoTrigger(s, ap, opp);
    s = settle(act(s, { type: "chooseMay", player: opp, yes: false }));
    s = passUntil(s, "main1", ap);
    const life = s.players[ap]!.life;
    s = settle(run(s, planCast(s, ap, ids[1]!, [ptgt(ap)])));
    expect(s.players[ap]!.life).toBe(life - 5);
    expect(s.objects[echo]!.counters.echo).toBe(2);
    // Chosen at the next upkeep: it applies from then on, and only until the upkeep after.
    s = echoTrigger(s, ap, opp);
    s = settle(act(s, { type: "chooseMay", player: opp, yes: true }));
    expect(s.damageMods?.length).toBe(1);
    s = passUntil(s, "main1", ap);
    s = settle(run(s, planCast(s, ap, ids[2]!, [ptgt(ap)])));
    expect(s.players[ap]!.life).toBe(life - 5);
    expect(s.objects[echo]!.counters.echo ?? 0).toBe(0);
    // Its next turn begins: the effect is over, so damage dealt in that upkeep before the trigger resolves is dealt.
    s = nextUpkeep(s, ap);
    expect(s.damageMods).toBeUndefined();
    expect(s.pending?.kind).toBe("chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [ptgt(opp)] });
    // A Shock in response, before the trigger resolves: dealt as usual.
    const before = s.players[ap]!.life;
    s = settle(run(s, planCast(s, ap, ids[3]!, [ptgt(ap)])));
    expect(s.players[ap]!.life).toBe(before - 2);
    // Then no echo counters: it's sacrificed.
    expect(zone(s, echo)).toBe("graveyard");
  });

  it("a bot opponent chooses it only while the controller's life is 0 or less (they can't lose to damage then)", () => {
    const { s: s0, ap, ids, opp } = setup([soulEcho()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [], undefined, undefined, 2)));
    let t = echoTrigger(structuredClone(s), ap, opp);
    expect(botActions(t, opp)).toEqual([{ type: "chooseMay", player: opp, yes: false }]);
    s.players[ap]!.life = 0;
    t = echoTrigger(s, ap, opp);
    expect(t.players[ap]!.lost).toBeFalsy();
    expect(botActions(t, opp)).toEqual([{ type: "chooseMay", player: opp, yes: true }]);
  });
});

/** Casts Bygone Colossus for its warp cost and passes to the next turn, when it's a warped card in exile. */
const warped = (s: GameState, ap: PlayerId, id: string) => {
  s = settle(run(s, planCast(s, ap, id, undefined, undefined, undefined, undefined, { alt: "warp" })));
  expect(zone(s, id)).toBe("battlefield");
  s = passUntil(s, "upkeep", leftOf(s, ap));
  expect(zone(s, id)).toBe("exile");
  return s;
};

describe("Close Encounter", () => {
  it("deals damage equal to the power of a creature you control chosen as it's cast", () => {
    const { s: s0, ap, ids, opp } = setup([closeEncounter()]);
    const giant = putOnBattlefield(s0, ap, hillGiant());
    const theirs = putOnBattlefield(s0, opp, hillGiant());
    s0.players[ap]!.manaPool.G = 2;
    // Not a creature another player controls.
    expect(castProblem(s0, ap, ids[0]!, [tgt(theirs)], undefined, undefined, undefined, undefined, { reveal: [theirs] })).toMatch(/choose a creature you control or a warped creature card you own in exile/);
    s0.players[ap]!.manaPool.G = 0;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(theirs)], undefined, undefined, undefined, { reveal: [giant] })));
    expect(zone(s, theirs)).toBe("graveyard");
    expect(zone(s, giant)).toBe("battlefield");
    expect(logged(s, /chooses Hill Giant\./)).toBe(true);
  });

  it("or a warped creature card you own in exile, its power there; not a card exiled another way, nor another player's", () => {
    const { s: s0, ap, ids, opp } = setup([closeEncounter(), bygoneColossus()]);
    let s = warped(s0, ap, ids[1]!);
    expect(s.objects[ids[1]!]!.warpedZc).toBe(s.objects[ids[1]!]!.zoneChanges);
    s = passUntil(s, "main1", ap);
    const theirs = putOnBattlefield(s, opp, bygoneColossus());
    // Another card in exile isn't warped.
    const other = putOnBattlefield(s, ap, hillGiant());
    s.battlefield.splice(s.battlefield.indexOf(other), 1);
    s.objects[other]!.zone = "exile";
    s.players[ap]!.exile.push(other);
    s.players[ap]!.manaPool.G = 2;
    expect(castProblem(s, ap, ids[0]!, [tgt(theirs)], undefined, undefined, undefined, undefined, { reveal: [other] })).not.toBeNull();
    expect(castProblem(s, ap, ids[0]!, [tgt(theirs)], undefined, undefined, undefined, undefined, { reveal: [ids[1]!] })).toBeNull();
    s.players[ap]!.manaPool.G = 0;
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(theirs)], undefined, undefined, undefined, { reveal: [ids[1]!] })));
    expect(zone(s, theirs)).toBe("graveyard");
    // The warped card stays in exile (it's only chosen), still castable later.
    expect(zone(s, ids[1]!)).toBe("exile");
    expect(logged(s, /chooses Bygone Colossus \(a warped card in exile\)/)).toBe(true);
  });

  it("a creature that left before it resolves: its power as it last existed (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([closeEncounter(), shock(), shock()]);
    const bear = putOnBattlefield(s0, ap, grizzlyBears());
    const theirs = putOnBattlefield(s0, opp, grizzlyBears());
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(theirs)], undefined, undefined, undefined, { reveal: [bear] }));
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(bear)])));
    expect(zone(s, bear)).toBe("graveyard");
    expect(zone(s, theirs)).toBe("graveyard");
  });

  it("a bot chooses its strongest creature or warped card", () => {
    const { s: s0, ap, ids, opp } = setup([closeEncounter(), bygoneColossus()]);
    let s = warped(s0, ap, ids[1]!);
    s = passUntil(s, "main1", ap);
    putOnBattlefield(s, ap, grizzlyBears());
    const theirs = putOnBattlefield(s, opp, bygoneColossus());
    s.players[ap]!.hand = [ids[0]!];
    s.players[ap]!.landsPlayedThisTurn = 1;
    // Too little mana left to cast the Colossus itself from exile.
    for (const id of landsOf(s, ap).slice(0, 6)) s.objects[id]!.tapped = true;
    s.players[ap]!.command = []; // (not its commander instead)
    const acts = botActions(s, ap);
    const cast = acts.find((a) => a.type === "castSpell" && a.objectId === ids[0]);
    expect(cast?.type === "castSpell" ? cast.reveal : undefined).toEqual([ids[1]!]);
    expect(cast?.type === "castSpell" ? cast.targets : undefined).toEqual([tgt(theirs)]);
  });
});

/** A plain nonbasic land (no abilities), named. */
const land = (name: string): CardDef => ({ oracleId: `land-${name}`, name, manaCost: "", cmc: 0, typeLine: "Land", supertypes: [], types: ["Land"], subtypes: [], oracleText: "", colors: [], colorIdentity: [], keywords: [], imageUrl: "", artUrl: "", layout: "normal" }) as CardDef;
const landsOf = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land"));

describe("Bend or Break", () => {
  it("each player separates their nontoken lands; an opponent of their choice picks the pile destroyed; the rest are tapped", () => {
    const { s: s0, ap, ids } = setup([bendOrBreak()]);
    const order = [ap, leftOf(s0, ap), leftOf(s0, leftOf(s0, ap)), leftOf(s0, leftOf(s0, leftOf(s0, ap)))];
    for (const pid of order.slice(1)) for (let i = 0; i < 3; i++) putOnBattlefield(s0, pid, land(`Land ${pid}-${i}`));
    // A land token isn't in either pile.
    const token = putOnBattlefield(s0, order[1]!, land("Token Land"));
    s0.objects[token]!.isToken = true;
    let s = run(s0, planCast(s0, ap, ids[0]!, []));
    s = settle(s);
    // The caster first, then in turn order (APNAP, CR 101.4).
    expect(s.pending?.kind).toBe("pickPermanents");
    if (s.pending?.kind !== "pickPermanents") return;
    expect(s.pending.player).toBe(ap);
    expect([...s.pending.options].sort()).toEqual(landsOf(s, ap).sort());
    const keep = landsOf(s, ap).slice(0, 2);
    const first = landsOf(s, ap).filter((id) => !keep.includes(id));
    s = act(s, { type: "pickPermanents", player: ap, ids: first });
    for (const pid of order.slice(1)) {
      expect(s.pending?.kind).toBe("pickPermanents");
      if (s.pending?.kind !== "pickPermanents") return;
      expect(s.pending.player).toBe(pid);
      expect(s.pending.options).not.toContain(token);
      expect(s.pending.options.length).toBe(3);
      s = act(s, { type: "pickPermanents", player: pid, ids: s.pending.options.slice(0, 1) });
    }
    // We choose an opponent to choose our pile: the last player.
    expect(s.pending?.kind).toBe("chooseOption");
    if (s.pending?.kind !== "chooseOption") return;
    expect(s.pending.what).toBe("opponent");
    expect([...s.pending.options].sort()).toEqual(order.slice(1).map(String).sort());
    s = act(s, { type: "chooseOption", player: ap, choice: String(order[3]) });
    expect(s.pending?.kind).toBe("chooseOption");
    if (s.pending?.kind !== "chooseOption") return;
    expect(s.pending.what).toBe("pile");
    expect(s.pending.player).toBe(order[3]);
    // They choose our first pile (the big one) to be destroyed.
    s = act(s, { type: "chooseOption", player: order[3]!, choice: "0" });
    // The others: bots answer (an opponent each, and a pile).
    s = settle(bots(s));
    expect(s.pending).toBeNull();
    for (const id of first) expect(zone(s, id)).toBe("graveyard");
    for (const id of keep) {
      expect(zone(s, id)).toBe("battlefield");
      expect(s.objects[id]!.tapped).toBe(true);
    }
    expect(zone(s, token)).toBe("battlefield");
    expect(s.objects[token]!.tapped).toBe(false);
    for (const pid of order.slice(1)) {
      const left = landsOf(s, pid).filter((id) => id !== token);
      expect(left.length === 1 || left.length === 2).toBe(true);
      for (const id of left) expect(s.objects[id]!.tapped).toBe(true);
    }
    expect(logged(s, /separates their lands into two piles/)).toBe(true);
  });

  it("a player with no lands has nothing to separate; a bot splits its lands into even piles and picks the bigger pile to destroy", () => {
    const { s: s0, ap, ids } = setup([bendOrBreak()]);
    const second = leftOf(s0, ap);
    for (let i = 0; i < 4; i++) putOnBattlefield(s0, second, land(`L ${i}`));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [])));
    // All our lands in the first pile, none in the second (CR 700.3d).
    s = act(s, { type: "pickPermanents", player: ap, ids: landsOf(s, ap) });
    expect(s.pending?.kind === "pickPermanents" ? s.pending.player : undefined).toBe(second);
    const [split] = botActions(s, second);
    expect(split?.type === "pickPermanents" ? split.ids.length : -1).toBe(2);
    s = act(s, split!);
    // The other two players have no lands: no question for them.
    expect(s.pending?.kind === "chooseOption" ? s.pending.what : s.pending?.kind).toBe("opponent");
    s = act(s, { type: "chooseOption", player: ap, choice: String(second) });
    expect(s.pending?.kind === "chooseOption" ? s.pending.player : undefined).toBe(second);
    const [pick] = botActions(s, second);
    expect(pick).toEqual({ type: "chooseOption", player: second, choice: "0" });
    s = settle(bots(act(s, pick!)));
    expect(landsOf(s, ap)).toEqual([]);
    expect(landsOf(s, second).length).toBe(2);
  });
});
