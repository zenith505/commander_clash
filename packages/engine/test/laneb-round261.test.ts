// Lane B round B261: Mangara's Equity (a creature of the chosen color dealing damage to you or a white creature you control,
// once for each recipient, rulings on Flameblade Angel and Elesh Norn), Turf War (a target land for each player, CR 601.2c,
// 603.3d; control gained on combat damage, CR 603.4) and Aetherplasm (a creature put onto the battlefield blocking, CR 509.4).

import { describe, expect, it } from "vitest";
import { act, addEffect, forest, mountain, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, controllerOf, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const mangarasEquity = (): CardDef => ({"oracleId":"c7986014-30e0-4999-ab95-b86620471419","name":"Mangara's Equity","manaCost":"{1}{W}{W}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"As this enchantment enters, choose black or red.\nAt the beginning of your upkeep, sacrifice this enchantment unless you pay {1}{W}.\nWhenever a creature of the chosen color deals damage to you or a white creature you control, this enchantment deals that much damage to that creature.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/d/6d796153-3f7f-4d94-8ad4-5a4b2c8e09bb.jpg?1783947119","artUrl":"https://cards.scryfall.io/art_crop/front/6/d/6d796153-3f7f-4d94-8ad4-5a4b2c8e09bb.jpg?1783947119","layout":"normal"});
const turfWar = (): CardDef => ({"oracleId":"8e1b84d7-b0ae-4e9d-bc1a-c84832fea9f9","name":"Turf War","manaCost":"{4}{R}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"When this enchantment enters, for each player, put a contested counter on target land that player controls.\nWhenever a creature deals combat damage to a player, if that player controls one or more lands with contested counters on them, that creature's controller gains control of one of those lands of their choice and untaps it.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/e/5e7fecbd-66f6-44b7-8fe4-b9b5bfce3e2c.jpg?1783923358","artUrl":"https://cards.scryfall.io/art_crop/front/5/e/5e7fecbd-66f6-44b7-8fe4-b9b5bfce3e2c.jpg?1783923358","layout":"normal"});
const aetherplasm = (): CardDef => ({"oracleId":"0cd99210-8d34-4112-8e41-7e8c5d2a95b9","name":"Aetherplasm","manaCost":"{2}{U}{U}","cmc":4,"typeLine":"Creature — Illusion","supertypes":[],"types":["Creature"],"subtypes":["Illusion"],"oracleText":"Whenever this creature blocks a creature, you may return this creature to its owner's hand. If you do, you may put a creature card from your hand onto the battlefield blocking that creature.","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/5/95bee334-c56e-4221-97ed-bea73a61b812.jpg?1783943523","artUrl":"https://cards.scryfall.io/art_crop/front/9/5/95bee334-c56e-4221-97ed-bea73a61b812.jpg?1783943523","layout":"normal"});
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","layout":"normal"});
const savannahLions = (): CardDef => ({"oracleId":"60ba93eb-39e6-4af2-9c66-cd38f72daff2","name":"Savannah Lions","manaCost":"{W}","cmc":1,"typeLine":"Creature — Cat","supertypes":[],"types":["Creature"],"subtypes":["Cat"],"oracleText":"","power":"2","toughness":"1","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/9/a9757246-e782-4d7a-8273-d9efe284edaf.jpg?1783935189","artUrl":"https://cards.scryfall.io/art_crop/front/a/9/a9757246-e782-4d7a-8273-d9efe284edaf.jpg?1783935189","layout":"normal"});
const walkingCorpse = (): CardDef => ({"oracleId":"fea95888-e16a-4209-9cd4-623f7f4d2f67","name":"Walking Corpse","manaCost":"{1}{B}","cmc":2,"typeLine":"Creature — Zombie","supertypes":[],"types":["Creature"],"subtypes":["Zombie"],"oracleText":"","power":"2","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8e033384-3334-4082-9541-f2443d3bc424.jpg?1783940945","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8e033384-3334-4082-9541-f2443d3bc424.jpg?1783940945","layout":"normal"});
const crawWurm = (): CardDef => ({"oracleId":"6a462a69-3e42-41de-a3aa-a488d9f38d69","name":"Craw Wurm","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"","power":"6","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","layout":"normal"});
const kolaghanAspirant = (): CardDef => ({"oracleId":"334178f6-cf4b-4ea6-a24f-c7375d1b38de","name":"Kolaghan Aspirant","manaCost":"{1}{R}","cmc":2,"typeLine":"Creature — Human Warrior","supertypes":[],"types":["Creature"],"subtypes":["Human","Warrior"],"oracleText":"Whenever this creature becomes blocked by a creature, this creature deals 1 damage to that creature.","power":"2","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/a/aa17972e-c16b-4dec-a108-1c3fb0138a4e.jpg?1783938589","artUrl":"https://cards.scryfall.io/art_crop/front/a/a/aa17972e-c16b-4dec-a108-1c3fb0138a4e.jpg?1783938589","layout":"normal"});
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","layout":"normal"});
const rakdosCackler = (): CardDef => ({"oracleId":"763a2d27-52a8-43d9-b649-0f6c0cf87a07","name":"Rakdos Cackler","manaCost":"{B/R}","cmc":1,"typeLine":"Creature — Devil","supertypes":[],"types":["Creature"],"subtypes":["Devil"],"oracleText":"Unleash (You may have this creature enter with a +1/+1 counter on it. It can't block as long as it has a +1/+1 counter on it.)","power":"1","toughness":"1","colors":["B","R"],"colorIdentity":["B","R"],"keywords":["Unleash"],"imageUrl":"https://cards.scryfall.io/normal/front/5/f/5f873c0b-e779-4f09-8e9c-94a1765eb5da.jpg?1783940326","artUrl":"https://cards.scryfall.io/art_crop/front/5/f/5f873c0b-e779-4f09-8e9c-94a1765eb5da.jpg?1783940326","layout":"normal"});
const typhoidRats = (): CardDef => ({"oracleId":"d6ee6cc1-902d-4f56-afa5-6fa4813bfbbc","name":"Typhoid Rats","manaCost":"{B}","cmc":1,"typeLine":"Creature — Rat","supertypes":[],"types":["Creature"],"subtypes":["Rat"],"oracleText":"Deathtouch (Any amount of damage this deals to a creature is enough to destroy it.)","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Deathtouch"],"imageUrl":"https://cards.scryfall.io/normal/front/d/1/d13cb90b-50c3-46ef-83f8-812dfb7ff881.jpg?1783938691","artUrl":"https://cards.scryfall.io/art_crop/front/d/1/d13cb90b-50c3-46ef-83f8-812dfb7ff881.jpg?1783938691","layout":"normal"});

const supported = (...ds: CardDef[]) => ds.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Passes priority (no attacks or blocks) until `done`; stops at any other question. */
const until = (s: GameState, done: (s: GameState) => boolean, max = 600) => {
  for (let i = 0; i < max; i++) {
    if (done(s)) return s;
    const pid = waitingOn(s)!;
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (s.pending?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, s.pending.count) });
    else if (s.pending) throw new Error(`unexpected question ${s.pending.kind}`);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never done");
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
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(l.text));
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
/** A fresh copy of `def` in `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** `attacker`'s controller attacks `defender` with `ats`; `defender` declares `blocks`. Stops at the first question after. */
const attack = (s0: GameState, attacker: PlayerId, defender: PlayerId, ats: string[], blocks: [string, string][] = []) => {
  let s = passUntil(s0, "declareAttackers", attacker);
  s = act(s, { type: "declareAttackers", player: attacker, attacks: ats.map((a) => ({ attacker: a, defender })) } as Action);
  s = until(s, (x) => x.pending?.kind === "declareBlockers" && x.pending.player === defender);
  s = act(s, { type: "declareBlockers", player: defender, blocks: blocks.map(([blocker, at]) => ({ blocker, attacker: at })) } as Action);
  return s;
};

describe("Mangara's Equity", () => {
  it("is supported", () => supported(mangarasEquity()));

  it("as it enters, its controller chooses black or red", () => {
    const { s: s0, ap, ids } = setup([mangarasEquity()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending?.kind).toBe("chooseOption");
    if (s.pending?.kind !== "chooseOption") return;
    expect(s.pending.options).toEqual(["Black", "Red"]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Red" }));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.objects[ids[0]!]!.chosen?.color).toBe("R");
  });

  /** `ap` controls Mangara's Equity with `color` chosen; `opp` attacks `ap` with `ats`. */
  const equity = (color: "B" | "R", attackers: CardDef[], blockers: CardDef[] = []) => {
    const { s: s0, ap, opp } = setup([]);
    const me = putOnBattlefield(s0, ap, mangarasEquity());
    s0.objects[me]!.chosen = { color };
    const ats = attackers.map((d) => putOnBattlefield(s0, opp, d));
    const bls = blockers.map((d) => putOnBattlefield(s0, ap, d));
    invalidateCharacteristics(s0);
    return { s0, ap, opp, me, ats, bls };
  };

  it("a red creature that deals combat damage to you is dealt that much damage", () => {
    const { s0, ap, opp, ats } = equity("R", [hillGiant()]);
    let s = attack(s0, opp, ap, ats);
    s = until(s, (x) => x.step === "end");
    expect(s.players[ap]!.life).toBe(37);
    expect(zone(s, ats[0]!)).toBe("graveyard");
    expect(logged(s, /Mangara's Equity deals 3 damage to Hill Giant/)).toBe(true);
  });

  it("damage to a white creature you control counts; to a creature that isn't white it doesn't", () => {
    const { s0, ap, opp, ats, bls } = equity("R", [hillGiant(), kolaghanAspirant()], [savannahLions(), grizzlyBears()]);
    let s = attack(s0, opp, ap, ats, [[bls[0]!, ats[0]!], [bls[1]!, ats[1]!]]);
    s = until(s, (x) => x.step === "end");
    // Hill Giant (3/3) dealt 3 to Savannah Lions: 3 back, plus the Lions' 2.
    expect(logged(s, /Mangara's Equity deals 3 damage to Hill Giant/)).toBe(true);
    expect(zone(s, ats[0]!)).toBe("graveyard");
    // Kolaghan Aspirant's damage went to Grizzly Bears, a green creature: nothing.
    expect(logged(s, /Mangara's Equity deals \d+ damage to Kolaghan Aspirant/)).toBe(false);
  });

  it("only creatures of the chosen color: a black creature isn't one with red chosen; a black and red one is", () => {
    const { s0, ap, opp, ats } = equity("R", [walkingCorpse(), rakdosCackler()]);
    let s = attack(s0, opp, ap, ats);
    s = until(s, (x) => x.step === "end");
    expect(s.players[ap]!.life).toBe(37);
    expect(zone(s, ats[0]!)).toBe("battlefield");
    expect(logged(s, /Mangara's Equity deals 1 damage to Rakdos Cackler/)).toBe(true);
    expect(zone(s, ats[1]!)).toBe("graveyard");
  });

  it("damage to you and a white creature at once: once for each, that much each (rulings on Flameblade Angel)", () => {
    const { s0, ap, opp, ats, bls } = equity("R", [hillGiant()], [savannahLions()]);
    // A 3/9 trampler, so it survives both.
    addEffect(s0, opp, [ats[0]!], [{ kind: "addKeywords", keywords: ["Trample"] }, { kind: "modifyPT", power: 0, toughness: 6 }], "game");
    let s = attack(s0, opp, ap, ats, [[bls[0]!, ats[0]!]]);
    // The attacker's controller assigns trample damage: lethal to the Lions (1), the rest (2) to the player.
    for (let i = 0; i < 50 && s.step !== "end"; i++) {
      if (s.pending && s.pending.kind !== "declareBlockers" && s.pending.kind !== "declareAttackers") for (const a of botActions(s, s.pending.player)) s = act(s, a);
      else s = until(s, (x) => x.step === "end" || (!!x.pending && x.pending.kind !== "declareBlockers" && x.pending.kind !== "declareAttackers"));
    }
    expect(s.players[ap]!.life).toBe(38);
    expect(logged(s, /Mangara's Equity deals 1 damage to Hill Giant/)).toBe(true);
    expect(logged(s, /Mangara's Equity deals 2 damage to Hill Giant/)).toBe(true);
    expect(s.objects[ats[0]!]!.damage).toBe(5);
  });

  it("nothing for a creature no longer on the battlefield as it resolves (CR 400.7)", () => {
    const { s0, ap, opp, me } = equity("B", []);
    const rats = putOnBattlefield(s0, opp, typhoidRats());
    const lions = putOnBattlefield(s0, ap, savannahLions());
    expect(controllerOf(s0, s0.objects[me]!)).toBe(ap);
    let s = attack(s0, opp, ap, [rats], [[lions, rats]]);
    s = until(s, (x) => x.step === "end");
    // The Rats dealt 1 to the Lions and died to the Lions' 2: Mangara's Equity has no creature to deal damage to.
    expect(zone(s, rats)).toBe("graveyard");
    expect(zone(s, lions)).toBe("graveyard");
    expect(logged(s, /Mangara's Equity deals 1 damage to Typhoid Rats/)).toBe(false);
  });
});

describe("Turf War", () => {
  it("is supported", () => supported(turfWar()));

  it("one target land for each player, its controller's first; each gets a contested counter", () => {
    const { s: s0, ap, ids } = setup([turfWar()]);
    const lands: Partial<Record<PlayerId, string>> = { [ap]: s0.battlefield.find((id) => s0.objects[id]!.controller === ap && s0.objects[id]!.cardId === mountain.oracleId)! };
    for (const pid of s0.turnOrder) if (pid !== ap) lands[pid] = putOnBattlefield(s0, pid, mountain);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending?.kind).toBe("chooseTargets");
    if (s.pending?.kind !== "chooseTargets") return;
    const order = s.pending.specs.map((sp) => sp.controlledBy);
    expect(order[0]).toBe(ap);
    expect(new Set(order).size).toBe(4);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: order.map((pid) => tgt(lands[pid!]!)) }));
    for (const pid of s.turnOrder) expect(s.objects[lands[pid]!]!.counters.contested).toBe(1);
  });

  it("with a player who controls no land, the ability has no legal targets and is removed (rulings on Vaevictis Asmadi)", () => {
    const { s: s0, ap, ids } = setup([turfWar()]);
    const [b, c] = s0.turnOrder.filter((pid) => pid !== ap);
    putOnBattlefield(s0, b!, mountain);
    putOnBattlefield(s0, c!, mountain);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeFalsy();
    expect(logged(s, /Turf War's ability has no legal targets/)).toBe(true);
    expect(s.battlefield.some((id) => (s.objects[id]!.counters.contested ?? 0) > 0)).toBe(false);
  });

  /** `ap` controls Turf War; `marked` of `ap`'s lands have contested counters; `opp` has a Hill Giant. */
  const war = (marked = 1) => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, turfWar());
    const mine = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && s0.objects[id]!.cardId === forest.oracleId).slice(0, marked);
    for (const id of mine) s0.objects[id]!.counters.contested = 1;
    const giant = putOnBattlefield(s0, opp, hillGiant());
    invalidateCharacteristics(s0);
    return { s0, ap, opp, mine, giant };
  };

  it("a creature that deals combat damage to a player takes one of that player's contested lands for its controller, untapped", () => {
    const { s0, ap, opp, mine, giant } = war();
    s0.objects[mine[0]!]!.tapped = true;
    let s = attack(s0, opp, ap, [giant]);
    s = until(s, (x) => x.step === "end");
    expect(s.players[ap]!.life).toBe(37);
    expect(controllerOf(s, s.objects[mine[0]!]!)).toBe(opp);
    expect(s.objects[mine[0]!]!.tapped).toBe(false);
    expect(s.objects[mine[0]!]!.counters.contested).toBe(1);
  });

  it("with two contested lands, the creature's controller chooses which", () => {
    const { s0, ap, opp, mine, giant } = war(2);
    let s = attack(s0, opp, ap, [giant]);
    s = until(s, (x) => x.step === "end" || x.pending?.kind === "pickPermanents");
    expect(s.pending?.kind).toBe("pickPermanents");
    if (s.pending?.kind !== "pickPermanents") return;
    expect(s.pending.player).toBe(opp);
    expect(s.pending.prompt).toBe(`click one of ${s.players[ap]!.name}'s lands with a contested counter on it: you gain control of it and untap it`);
    expect([...s.pending.options].sort()).toEqual([...mine].sort());
    s = act(s, { type: "pickPermanents", player: opp, ids: [mine[1]!] });
    s = until(s, (x) => x.step === "end");
    expect(controllerOf(s, s.objects[mine[1]!]!)).toBe(opp);
    expect(controllerOf(s, s.objects[mine[0]!]!)).toBe(ap);
  });

  it("no contested land, no trigger (an intervening if, CR 603.4)", () => {
    const { s0, ap, opp, giant } = war(0);
    let s = attack(s0, opp, ap, [giant]);
    s = until(s, (x) => x.step === "end");
    expect(s.players[ap]!.life).toBe(37);
    expect(logged(s, /Turf War's ability triggers/)).toBe(false);
  });
});

describe("Aetherplasm", () => {
  it("is supported", () => supported(aetherplasm()));

  /** `ap` attacks `opp` with `attacker`; `opp` blocks it with Aetherplasm and has `hand` in hand. At the "may" question. */
  const blocked = (attacker: CardDef, hand: CardDef[]) => {
    const { s: s0, ap, opp } = setup([]);
    const at = putOnBattlefield(s0, ap, attacker);
    const ae = putOnBattlefield(s0, opp, aetherplasm());
    const cards = hand.map((d) => inHand(s0, opp, d));
    let s = attack(s0, ap, opp, [at], [[ae, at]]);
    s = until(s, (x) => !!x.pending);
    return { s, ap, opp, at, ae, cards };
  };

  it("returns to its owner's hand and a creature card from the hand enters blocking the attacker", () => {
    const { s: s0, opp, at, ae, cards } = blocked(hillGiant(), [crawWurm()]);
    expect(s0.pending?.kind).toBe("chooseMay");
    let s = act(s0, { type: "chooseMay", player: opp, yes: true });
    expect(zone(s, ae)).toBe("hand");
    expect(s.pending?.kind).toBe("searchLibrary");
    if (s.pending?.kind !== "searchLibrary") return;
    expect(s.pending.cards).toContain(cards[0]);
    expect(s.pending.cards).toContain(ae);
    s = act(s, { type: "searchLibrary", player: opp, found: [cards[0]!] });
    expect(zone(s, cards[0]!)).toBe("battlefield");
    expect(s.objects[cards[0]!]!.blocking).toEqual([at]);
    expect(s.objects[at]!.blockedBy).toContain(cards[0]);
    s = until(s, (x) => x.step === "end");
    // Craw Wurm (6/4) kills Hill Giant (3/3) and survives; Aetherplasm stays in the hand.
    expect(zone(s, at)).toBe("graveyard");
    expect(zone(s, cards[0]!)).toBe("battlefield");
    expect(s.objects[cards[0]!]!.damage).toBe(3);
    expect(zone(s, ae)).toBe("hand");
  });

  it("returned with nothing put: the attacker is still blocked and deals no combat damage (rulings)", () => {
    const { s: s0, opp, at, ae } = blocked(hillGiant(), [crawWurm()]);
    let s = act(s0, { type: "chooseMay", player: opp, yes: true });
    s = act(s, { type: "searchLibrary", player: opp, found: [] });
    expect(zone(s, ae)).toBe("hand");
    s = until(s, (x) => x.step === "end");
    expect(s.players[opp]!.life).toBe(40);
    expect(zone(s, at)).toBe("battlefield");
  });

  it("not returned: nothing else happens, it stays blocking", () => {
    const { s: s0, opp, at, ae, cards } = blocked(hillGiant(), [crawWurm()]);
    let s = act(s0, { type: "chooseMay", player: opp, yes: false });
    expect(s.pending).toBeFalsy();
    expect(zone(s, ae)).toBe("battlefield");
    expect(zone(s, cards[0]!)).toBe("hand");
    expect(s.objects[ae]!.blocking).toEqual([at]);
  });

  it("can put itself back blocking; entering blocking, its own ability doesn't trigger again (CR 509.3b, rulings)", () => {
    const { s: s0, opp, at, ae } = blocked(hillGiant(), []);
    let s = act(s0, { type: "chooseMay", player: opp, yes: true });
    expect(s.pending?.kind).toBe("searchLibrary");
    s = act(s, { type: "searchLibrary", player: opp, found: [ae] });
    expect(zone(s, ae)).toBe("battlefield");
    expect(s.objects[ae]!.blocking).toEqual([at]);
    s = until(s, (x) => x.step === "end" || !!x.pending);
    expect(s.pending).toBeFalsy();
    expect(s.log.filter((l) => /Aetherplasm's ability triggers/.test(l.text)).length).toBe(1);
  });

  it("the attacker's \"becomes blocked by a creature\" triggers for the creature put onto the battlefield blocking it (CR 509.3d)", () => {
    const { s: s0, opp, at, cards } = blocked(kolaghanAspirant(), [crawWurm()]);
    const before = s0.log.filter((l) => /Kolaghan Aspirant's ability triggers/.test(l.text)).length;
    let s = act(s0, { type: "chooseMay", player: opp, yes: true });
    s = act(s, { type: "searchLibrary", player: opp, found: [cards[0]!] });
    s = until(s, (x) => x.step === "end" || !!x.pending);
    expect(s.log.filter((l) => /Kolaghan Aspirant's ability triggers/.test(l.text)).length).toBe(before + 1);
    expect(logged(s, /Kolaghan Aspirant deals 1 damage to Craw Wurm/)).toBe(true);
    expect(zone(s, at)).toBe("graveyard");
  });

  it("bots return it for a creature card that wins the fight, and put that one in", () => {
    const { s: s0, opp, at, ae, cards } = blocked(hillGiant(), [grizzlyBears(), crawWurm()]);
    let s = s0;
    for (let i = 0; i < 6 && s.pending; i++) for (const a of botActions(s, s.pending.player)) s = act(s, a);
    expect(zone(s, ae)).toBe("hand");
    expect(s.objects[cards[1]!]!.blocking).toEqual([at]);
    expect(zone(s, cards[0]!)).toBe("hand");
  });

  it("bots put nothing in when no creature card would survive the attacker, and keep the attacker blocked", () => {
    const { s: s0, opp, at, ae, cards } = blocked(hillGiant(), [grizzlyBears()]);
    let s = s0;
    for (let i = 0; i < 6 && s.pending; i++) for (const a of botActions(s, s.pending.player)) s = act(s, a);
    expect(zone(s, ae)).toBe("hand");
    expect(zone(s, cards[0]!)).toBe("hand");
    s = until(s, (x) => x.step === "end");
    expect(s.players[opp]!.life).toBe(40);
    expect(zone(s, at)).toBe("battlefield");
  });
});

describe("Mangara's Equity bots", () => {
  it("a bot chooses the color its opponents' creatures have", () => {
    const { s: s0, ap, ids, opp } = setup([mangarasEquity()]);
    putOnBattlefield(s0, opp, walkingCorpse());
    putOnBattlefield(s0, opp, typhoidRats());
    putOnBattlefield(s0, opp, hillGiant());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending?.kind).toBe("chooseOption");
    for (const a of botActions(s, ap)) s = act(s, a);
    expect(s.objects[ids[0]!]!.chosen?.color).toBe("B");
  });
});

describe("Mangara's Equity bots, red", () => {
  it("a bot facing red creatures chooses red", () => {
    const { s: s0, ap, ids, opp } = setup([mangarasEquity()]);
    putOnBattlefield(s0, opp, hillGiant());
    putOnBattlefield(s0, opp, kolaghanAspirant());
    putOnBattlefield(s0, opp, typhoidRats());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    for (const a of botActions(s, ap)) s = act(s, a);
    expect(s.objects[ids[0]!]!.chosen?.color).toBe("R");
  });
});

describe("Turf War bots", () => {
  it("a bot casts it and targets a land of each player's, one of its own too", () => {
    const { s: s0, ap, ids } = setup([turfWar()]);
    for (const pid of s0.turnOrder) if (pid !== ap) putOnBattlefield(s0, pid, mountain);
    let s = s0;
    for (let i = 0; i < 40 && zone(s, ids[0]!) !== "battlefield"; i++) {
      const pid = s.pending ? s.pending.player : waitingOn(s)!;
      const as = botActions(s, pid);
      for (const a of as) s = act(s, a);
    }
    s = settle(s);
    for (let i = 0; i < 10 && s.pending; i++) for (const a of botActions(s, s.pending.player)) s = act(s, a);
    s = settle(s);
    expect(zone(s, ids[0]!)).toBe("battlefield");
    for (const pid of s.turnOrder) expect(s.battlefield.filter((id) => s.objects[id]!.controller === pid && (s.objects[id]!.counters.contested ?? 0) > 0).length).toBe(1);
  });

  it("a bot that takes a land picks one of those lands", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, turfWar());
    const mine = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && s0.objects[id]!.cardId === forest.oracleId).slice(0, 2);
    for (const id of mine) s0.objects[id]!.counters.contested = 1;
    const giant = putOnBattlefield(s0, opp, hillGiant());
    invalidateCharacteristics(s0);
    let s = attack(s0, opp, ap, [giant]);
    s = until(s, (x) => x.step === "end" || x.pending?.kind === "pickPermanents");
    for (const a of botActions(s, opp)) s = act(s, a);
    s = until(s, (x) => x.step === "end");
    expect(mine.filter((id) => controllerOf(s, s.objects[id]!) === opp).length).toBe(1);
  });
});
