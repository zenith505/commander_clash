// Round 279: earlier skips from the top of the popularity list. "Put +1/+1 counters on that creature equal to its power"
// (Experiment Twelve), all damage to you and your permanents redirected to one chosen permanent (Gideon's Sacrifice,
// Heroic Sacrifice, with a delayed trigger that has a target of its own), "choose a number. Flip that many coins"
// (Yusri, Fortune's Flame), "you may choose a creature. ~ deals 3 damage to each creature not chosen this way"
// (Thunderwave), a granted "whenever this creature is dealt damage" with "that creature's controller may have ~ deal 1
// damage to it" (Requiem Monolith) and "any opponent may have you put that card into your graveyard" asked until one
// does (Sin Prodder).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, controllerOf, dealDamageBatch, invalidateCharacteristics, isFullySupported, objectSource, planActivate, planCast, planTurnFaceUp, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Everyone passes until the stack is empty, answering trigger targets with `targets` and "you may"s with `may`; stops at any other question. */
const settle = (s: GameState, opts: { targets?: TargetChoice[]; may?: boolean } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets });
    else if (p?.kind === "chooseMay" && opts.may !== undefined) s = act(s, { type: "chooseMay", player: p.player, yes: opts.may });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const nextOpp = (s: GameState, ap: PlayerId, n: number) => s.turnOrder[(s.turnOrder.indexOf(ap) + n) % s.turnOrder.length]!;
const hit = (s: GameState, from: ObjectId, to: { object: ObjectId } | { player: PlayerId }, n: number) => dealDamageBatch(s, [{ src: objectSource(s, s.objects[from]!), to, n }]);

// Real oracle text (Scryfall).
const twelve = (): CardDef => ({"oracleId":"67a10da3-76f2-4f4a-90d1-e77abb5842fe","name":"Experiment Twelve","manaCost":"{3}{G}","cmc":4,"typeLine":"Creature — Elf Lizard Warrior","supertypes":[],"types":["Creature"],"subtypes":["Elf","Lizard","Warrior"],"oracleText":"Trample\nWhenever this creature or another creature you control is turned face up, put +1/+1 counters on that creature equal to its power.\nDisguise {4}{G} (You may cast this card face down for {3} as a 2/2 creature with ward {2}. Turn it face up any time for its disguise cost.)","power":"4","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":["Trample","Disguise"],"imageUrl":"https://cards.scryfall.io/normal/front/7/d/7d76089e-b21a-4d89-9562-957c18474967.jpg?1783913042","artUrl":"https://cards.scryfall.io/art_crop/front/7/d/7d76089e-b21a-4d89-9562-957c18474967.jpg?1783913042","commanderLegal":"legal","set":"mkc","releasedAt":"2024-02-09","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const gideon = (): CardDef => ({"oracleId":"1af63a5e-2bec-4f8d-a373-d9ce43a7d242","name":"Gideon's Sacrifice","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose a creature or planeswalker you control. All damage that would be dealt this turn to you and permanents you control is dealt to the chosen permanent instead (if it's still on the battlefield).","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/4/849c79ad-8bfc-4512-ab41-f213b6b285ab.jpg?1783933481","artUrl":"https://cards.scryfall.io/art_crop/front/8/4/849c79ad-8bfc-4512-ab41-f213b6b285ab.jpg?1783933481","commanderLegal":"legal","set":"war","releasedAt":"2019-05-03","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const heroic = (): CardDef => ({"oracleId":"03c47f1c-02a7-428c-a126-9e85325ebc71","name":"Heroic Sacrifice","manaCost":"{1}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose target creature you control. Until end of turn, all damage that would be dealt to you and creatures you control is dealt to the chosen creature instead (if it's still on the battlefield). When that creature dies this turn, put its counters on up to one target creature you control and draw a card.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/c/ec7bd155-1dd6-4fc3-870f-e0905f8c6d42.jpg?1783903298","artUrl":"https://cards.scryfall.io/art_crop/front/e/c/ec7bd155-1dd6-4fc3-870f-e0905f8c6d42.jpg?1783903298","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const yusri = (): CardDef => ({"oracleId":"2c0a0a7d-b12f-47c8-a6a6-d046f999ec6b","name":"Yusri, Fortune's Flame","manaCost":"{1}{U}{R}","cmc":3,"typeLine":"Legendary Creature — Efreet","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Efreet"],"oracleText":"Flying\nWhenever Yusri attacks, choose a number between 1 and 5. Flip that many coins. For each flip you win, draw a card. For each flip you lose, Yusri deals 2 damage to you. If you won five flips this way, you may cast spells from your hand this turn without paying their mana costs.","power":"2","toughness":"3","colors":["R","U"],"colorIdentity":["R","U"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/e/c/ecc06edb-d7dd-40e4-abbb-03ec2d467193.jpg?1783926706","artUrl":"https://cards.scryfall.io/art_crop/front/e/c/ecc06edb-d7dd-40e4-abbb-03ec2d467193.jpg?1783926706","commanderLegal":"legal","set":"mh2","releasedAt":"2021-06-18","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const thunder = (): CardDef => ({"oracleId":"43de944b-e630-45f0-bce4-c66803e8b5c1","name":"Thunderwave","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Roll a d20.\n1—9 | Thunderwave deals 3 damage to each creature.\n10—19 | You may choose a creature. Thunderwave deals 3 damage to each creature not chosen this way.\n20 | Thunderwave deals 6 damage to each creature your opponents control.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/9/e9531098-63ea-4568-81e9-80e00a5f8995.jpg?1783922727","artUrl":"https://cards.scryfall.io/art_crop/front/e/9/e9531098-63ea-4568-81e9-80e00a5f8995.jpg?1783922727","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const monolith = (): CardDef => ({"oracleId":"13a8b19b-23bd-4e45-81ff-23371665e4fc","name":"Requiem Monolith","manaCost":"{2}{B}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Until end of turn, target creature gains \"Whenever this creature is dealt damage, you draw that many cards and lose that much life.\" That creature's controller may have this artifact deal 1 damage to it. Activate only as a sorcery.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/3/837d710a-652f-4c60-a52d-d786231160a4.jpg?1783905963","artUrl":"https://cards.scryfall.io/art_crop/front/8/3/837d710a-652f-4c60-a52d-d786231160a4.jpg?1783905963","commanderLegal":"legal","set":"eoe","releasedAt":"2025-08-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const prodder = (): CardDef => ({"oracleId":"745efa76-7063-4971-9d1b-b2b4cb336a57","name":"Sin Prodder","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Devil","supertypes":[],"types":["Creature"],"subtypes":["Devil"],"oracleText":"Menace\nAt the beginning of your upkeep, reveal the top card of your library. Any opponent may have you put that card into your graveyard. If a player does, this creature deals damage to that player equal to that card's mana value. Otherwise, put that card into your hand.","power":"3","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Menace"],"imageUrl":"https://cards.scryfall.io/normal/front/c/e/cefeb031-9dda-4717-a8d1-e2c21551e43a.jpg?1783937742","artUrl":"https://cards.scryfall.io/art_crop/front/c/e/cefeb031-9dda-4717-a8d1-e2c21551e43a.jpg?1783937742","commanderLegal":"legal","set":"soi","releasedAt":"2016-04-08","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const edgar = (): CardDef => ({"oracleId":"264efed9-65ab-40ad-877f-c6c25ca0281e","name":"Edgar, King of Figaro","manaCost":"{4}{U}{U}","cmc":6,"typeLine":"Legendary Creature — Human Artificer Noble","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Artificer","Noble"],"oracleText":"When Edgar enters, draw a card for each artifact you control.\nTwo-Headed Coin — The first time you flip one or more coins each turn, those coins come up heads and you win those flips.","power":"4","toughness":"5","colors":["U"],"colorIdentity":["U"],"keywords":["Two-Headed Coin"],"imageUrl":"https://cards.scryfall.io/normal/front/9/5/950ee302-5512-43c5-ac7c-b2b06f4177bf.jpg?1783906638","artUrl":"https://cards.scryfall.io/art_crop/front/9/5/950ee302-5512-43c5-ac7c-b2b06f4177bf.jpg?1783906638","commanderLegal":"legal","set":"fin","releasedAt":"2025-06-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

const vanilla = () => bear({ name: "Test Bear" });
const big = card("Test Giant", "Creature — Giant", "{3}{R}", { cmc: 4, colors: ["R"], power: "4", toughness: "4" });
const walker = card("Test Walker", "Legendary Planeswalker — Test", "{3}", { cmc: 3, loyalty: "5", oracleText: "+1: You gain 1 life." });
const disguised = card("Disguise Test", "Creature — Beast", "{3}{G}", { cmc: 4, colors: ["G"], power: "3", toughness: "3", oracleText: "Disguise {2}{G}", keywords: ["Disguise"] });

describe("round 279", () => {
  it("every card of the round compiles fully", () => {
    supported(twelve(), gideon(), heroic(), yusri(), thunder(), monolith(), prodder());
  });
});

describe("Experiment Twelve: +1/+1 counters equal to its power when turned face up", () => {
  const faceDown = (s: GameState, ap: PlayerId, id: ObjectId) => settle(run(s, planCast(s, ap, id, undefined, undefined, "auto", undefined, { faceDown: true })));
  it("itself: turned face up as a 4/4, it gets four counters", () => {
    const { s: s0, ap, ids } = setup([twelve()]);
    let s = faceDown(s0, ap, ids[0]!);
    expect(pt(s, ids[0]!)).toBe("2/2");
    s = settle(run(s, planTurnFaceUp(s, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(4);
    expect(pt(s, ids[0]!)).toBe("8/8");
  });

  it("another creature you control turned face up gets counters equal to its own power; not an opponent's", () => {
    const { s: s0, ap, ids } = setup([disguised]);
    const twelveId = putOnBattlefield(s0, ap, twelve());
    let s = faceDown(s0, ap, ids[0]!);
    s = settle(run(s, planTurnFaceUp(s, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(3);
    expect(pt(s, ids[0]!)).toBe("6/6");
    expect(s.objects[twelveId]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("Gideon's Sacrifice: damage to you and your permanents dealt to the chosen permanent", () => {
  it("chosen as it resolves among your creatures and planeswalkers; damage to you and your other permanents goes to it", () => {
    const { s: s0, ap, opp, ids } = setup([gideon()]);
    const wall = putOnBattlefield(s0, ap, big);
    const pw = putOnBattlefield(s0, ap, walker);
    s0.objects[pw]!.counters.loyalty = 5;
    const other = putOnBattlefield(s0, ap, vanilla());
    const theirs = putOnBattlefield(s0, opp, vanilla());
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "choose" });
    expect(s.pending?.kind === "pickPermanents" && [...s.pending.options].sort()).toEqual([wall, pw, other].sort());
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [wall] }));
    const life = s.players[ap]!.life;
    hit(s, theirs, { player: ap }, 2);
    expect(s.players[ap]!.life).toBe(life);
    expect(s.objects[wall]!.damage).toBe(2);
    hit(s, theirs, { object: other }, 1);
    expect(s.objects[other]!.damage ?? 0).toBe(0);
    expect(s.objects[wall]!.damage).toBe(3);
    // Damage dealt to the chosen creature itself stays there; an opponent's creature isn't covered.
    hit(s, theirs, { object: wall }, 1);
    expect(s.objects[wall]!.damage).toBe(4);
    hit(s, other, { object: theirs }, 1);
    expect(s.objects[theirs]!.damage).toBe(1);
  });

  it("once the chosen permanent is gone, the damage isn't redirected", () => {
    const { s: s0, ap, opp, ids } = setup([gideon()]);
    const wall = putOnBattlefield(s0, ap, vanilla());
    const theirs = putOnBattlefield(s0, opp, big);
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(s);
    hit(s, theirs, { object: wall }, 1);
    hit(s, theirs, { player: ap }, 3);
    expect(s.objects[wall]!.damage).toBe(4);
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(zone(s, wall)).toBe("graveyard");
    const life = s.players[ap]!.life;
    hit(s, theirs, { player: ap }, 2);
    expect(s.players[ap]!.life).toBe(life - 2);
  });
});

describe("Heroic Sacrifice: redirect to the target, then its counters and a card when it dies", () => {
  it("damage to you and your creatures goes to the target; when it dies, its counters go on up to one target creature and you draw", () => {
    const { s: s0, ap, opp, ids } = setup([heroic()]);
    const hero = putOnBattlefield(s0, ap, vanilla());
    s0.objects[hero]!.counters["+1/+1"] = 2;
    const heir = putOnBattlefield(s0, ap, vanilla());
    const theirs = putOnBattlefield(s0, opp, big);
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(hero)])));
    const life = s.players[ap]!.life;
    hit(s, theirs, { player: ap }, 2);
    hit(s, theirs, { object: heir }, 2);
    expect(s.players[ap]!.life).toBe(life);
    expect(s.objects[heir]!.damage ?? 0).toBe(0);
    expect(s.objects[hero]!.damage).toBe(4);
    const hand = s.players[ap]!.hand.length;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(zone(s, hero)).toBe("graveyard");
    s = settle(s, { targets: [tgt(heir)] });
    expect(s.objects[heir]!.counters["+1/+1"]).toBe(2);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("with no target chosen for the counters, you still draw", () => {
    const { s: s0, ap, opp, ids } = setup([heroic()]);
    const hero = putOnBattlefield(s0, ap, vanilla());
    const theirs = putOnBattlefield(s0, opp, big);
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(hero)])));
    hit(s, theirs, { player: ap }, 5);
    const hand = s.players[ap]!.hand.length;
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }), { targets: [{ kind: "none" }] });
    expect(zone(s, hero)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
});

describe("Yusri, Fortune's Flame: choose a number, flip that many coins", () => {
  const attack = (seed: number, extra: CardDef[] = []) => {
    const { s: s0, ap, opp } = setup([], seed);
    const y = putOnBattlefield(s0, ap, yusri());
    for (const d of extra) putOnBattlefield(s0, ap, d);
    s0.players[ap]!.hand = [];
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: y, defender: opp }] });
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "number", numberRange: { min: 1, max: 5 } });
    return { s, ap, opp };
  };

  it("a card for each flip won, 2 damage to you for each flip lost", () => {
    for (const seed of [1, 2, 3, 4]) {
      const { s: s1, ap } = attack(seed);
      const life = s1.players[ap]!.life;
      const s = settle(act(s1, { type: "chooseOption", player: ap, choice: "3" }));
      const won = s.players[ap]!.hand.length;
      expect(won, `seed ${seed}`).toBeLessThanOrEqual(3);
      expect(s.players[ap]!.life, `seed ${seed}`).toBe(life - 2 * (3 - won));
      expect(s.turnRules?.some((r) => r.rule === "castFromHandFree") ?? false).toBe(false);
    }
  });

  it("five flips won (Edgar rigs them): you may cast spells from your hand this turn without paying their mana costs", () => {
    const { s: s1, ap } = attack(7, [edgar()]);
    const life = s1.players[ap]!.life;
    let s = settle(act(s1, { type: "chooseOption", player: ap, choice: "5" }));
    expect(s.players[ap]!.hand.length).toBe(5);
    expect(s.players[ap]!.life).toBe(life);
    // A Giant from hand, for nothing.
    const g = into(s, ap, big, "hand");
    s = passUntil(s, "main2", ap);
    for (const id of s.battlefield) if (controllerOf(s, s.objects[id]!) === ap) s.objects[id]!.tapped = true;
    const plan = planCast(s, ap, g, undefined, undefined, "auto", undefined, { alt: "omniscience" });
    expect(plan).not.toBeNull();
    s = settle(run(s, plan));
    expect(zone(s, g)).toBe("battlefield");
  });
});

describe("Thunderwave: a d20", () => {
  const cast = (seed: number) => {
    const { s: s0, ap, opp, ids } = setup([thunder()], seed);
    const mine = putOnBattlefield(s0, ap, big);
    const small = putOnBattlefield(s0, ap, vanilla());
    const theirs = putOnBattlefield(s0, opp, big);
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const roll = Number(/rolls? (?:a d20[^:]*: )?(\d+)/.exec([...s.log].reverse().find((l) => /d20/.test(l.text))?.text ?? "")?.[1]);
    return { s, ap, mine, small, theirs, roll };
  };

  it("1-9: 3 to each creature; 10-19: you may choose a creature, 3 to each other one; 20: 6 to each creature your opponents control", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40 && seen.size < 2; seed++) {
      let { s, ap, mine, small, theirs, roll } = cast(seed);
      expect(roll, `seed ${seed}`).toBeGreaterThanOrEqual(1);
      if (roll <= 9) {
        seen.add("low");
        expect([s.objects[mine]!.damage, s.objects[theirs]!.damage]).toEqual([3, 3]);
        expect(zone(s, small)).toBe("graveyard");
      } else if (roll <= 19) {
        seen.add("mid");
        expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "choose", min: 0, count: 1 });
        // Anyone's creature can be chosen.
        expect(s.pending?.kind === "pickPermanents" && s.pending.options).toContain(theirs);
        s = settle(act(s, { type: "pickPermanents", player: ap, ids: [small] }));
        expect(zone(s, small)).toBe("battlefield");
        expect(s.objects[small]!.damage ?? 0).toBe(0);
        expect([s.objects[mine]!.damage, s.objects[theirs]!.damage]).toEqual([3, 3]);
      } else {
        expect(roll).toBe(20);
        expect(s.objects[mine]!.damage ?? 0).toBe(0);
        expect(zone(s, theirs)).toBe("graveyard");
      }
    }
    expect([...seen].sort()).toEqual(["low", "mid"]);
  });

  it("10-19 with none chosen: every creature is dealt 3", () => {
    for (let seed = 1; seed <= 40; seed++) {
      let { s, mine, small, theirs, roll, ap } = cast(seed);
      if (roll < 10 || roll > 19) continue;
      s = settle(act(s, { type: "pickPermanents", player: ap, ids: [] }));
      expect([s.objects[mine]!.damage, s.objects[theirs]!.damage]).toEqual([3, 3]);
      expect(zone(s, small)).toBe("graveyard");
      return;
    }
    throw new Error("no roll from 10 to 19");
  });
});

describe("Requiem Monolith: dealt damage, its controller draws that many and loses that much life", () => {
  it("its controller may have ~ deal 1 damage to it: they draw 1 and lose 1; later damage draws that many", () => {
    const { s: s0, ap, opp } = setup([]);
    const mono = putOnBattlefield(s0, ap, monolith());
    const victim = putOnBattlefield(s0, opp, big);
    const theirs = putOnBattlefield(s0, ap, vanilla());
    invalidateCharacteristics(s0);
    const [hand, life] = [s0.players[opp]!.hand.length, s0.players[opp]!.life];
    let s = settle(run(s0, planActivate(s0, ap, mono, 0, [tgt(victim)])));
    // That creature's controller decides.
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    s = settle(act(s, { type: "chooseMay", player: opp, yes: true }));
    expect(s.objects[victim]!.damage).toBe(1);
    expect(s.players[opp]!.hand.length).toBe(hand + 1);
    expect(s.players[opp]!.life).toBe(life - 1);
    hit(s, theirs, { object: victim }, 2);
    s = settle(s);
    expect(s.players[opp]!.hand.length).toBe(hand + 3);
    expect(s.players[opp]!.life).toBe(life - 3);
    // Until end of turn only.
    s = passUntil(s, "upkeep", nextOpp(s, ap, 1));
    s = settle(s);
    const h2 = s.players[opp]!.hand.length;
    hit(s, theirs, { object: victim }, 1);
    s = settle(s);
    expect(s.players[opp]!.hand.length).toBe(h2);
  });

  it("declined: no damage, nothing drawn", () => {
    const { s: s0, ap } = setup([]);
    const mono = putOnBattlefield(s0, ap, monolith());
    const mine = putOnBattlefield(s0, ap, vanilla());
    invalidateCharacteristics(s0);
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planActivate(s0, ap, mono, 0, [tgt(mine)])));
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }));
    expect(s.objects[mine]!.damage ?? 0).toBe(0);
    expect(s.players[ap]!.hand.length).toBe(hand);
  });
});

describe("Sin Prodder: any opponent may have you put the revealed card into your graveyard", () => {
  const upkeep = (top: CardDef) => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, prodder());
    const s1 = passUntil(s0, "end", ap);
    // The next turn of the same player: their upkeep, after the other three.
    let s = s1;
    for (let i = 0; i < 4; i++) s = passUntil(settle(s), "upkeep", nextOpp(s, ap, i + 1 === 4 ? 0 : i + 1));
    const card0 = into(s, ap, top, "library");
    s = settle(s);
    return { s, ap, card0 };
  };

  it("asked in turn order from the next opponent; the first who does is dealt its mana value and no one else is asked", () => {
    const { s: s1, ap, card0 } = upkeep(big);
    let s = s1;
    const [o1, o2, o3] = [1, 2, 3].map((n) => nextOpp(s, ap, n));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "punisher", player: o1 });
    s = act(s, { type: "chooseOption", player: o1!, choice: "none" });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "punisher", player: o2 });
    const life = s.players[o2!]!.life;
    s = settle(act(s, { type: "chooseOption", player: o2!, choice: "0" }));
    expect(s.pending?.kind === "chooseOption" && s.pending.player === o3).toBe(false);
    expect(zone(s, card0)).toBe("graveyard");
    expect(s.players[o2!]!.life).toBe(life - 4);
  });

  it("no one does: the card goes to your hand", () => {
    const { s: s1, ap, card0 } = upkeep(big);
    let s = s1;
    for (let i = 0; i < 3 && s.pending?.kind === "chooseOption"; i++) s = act(s, { type: "chooseOption", player: s.pending.player, choice: "none" });
    s = settle(s);
    expect(zone(s, card0)).toBe("hand");
    expect(s.players[ap]!.hand).toContain(card0);
  });
});

describe("round 279 bots", () => {
  it("Thunderwave's 10-19: the bot spares its own best creature", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { s: s0, ap, opp, ids } = setup([thunder()], seed);
      const mine = putOnBattlefield(s0, ap, big);
      putOnBattlefield(s0, ap, vanilla());
      putOnBattlefield(s0, opp, big);
      invalidateCharacteristics(s0);
      const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
      if (s.pending?.kind !== "pickPermanents") continue;
      expect(botActions(s, ap)).toEqual([{ type: "pickPermanents", player: ap, ids: [mine] }]);
      return;
    }
    throw new Error("no roll from 10 to 19");
  });

  it("Yusri: the bot flips five coins with plenty of life, one when low", () => {
    const { s: s0, ap, opp } = setup([]);
    const y = putOnBattlefield(s0, ap, yusri());
    let s = passUntil(s0, "declareAttackers", ap);
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: y, defender: opp }] }));
    expect(botActions(s, ap)).toEqual([{ type: "chooseOption", player: ap, choice: "5" }]);
    s.players[ap]!.life = 8;
    expect(botActions(s, ap)).toEqual([{ type: "chooseOption", player: ap, choice: "1" }]);
  });

  it("Sin Prodder: an opponent bot takes a little damage to deny a card, not a lot", () => {
    for (const [top, yes] of [[vanilla(), true], [card("Test Titan", "Creature — Giant", "{7}", { cmc: 8, power: "8", toughness: "8" }), false]] as const) {
      const { s: s0, ap } = setup([]);
      putOnBattlefield(s0, ap, prodder());
      let s = passUntil(s0, "end", ap);
      for (let i = 1; i <= 4; i++) s = passUntil(settle(s), "upkeep", nextOpp(s, ap, i % 4));
      into(s, ap, top, "library");
      s = settle(s);
      expect(s.pending).toMatchObject({ kind: "chooseOption", what: "punisher" });
      const p = s.pending!.kind === "chooseOption" ? s.pending.player : ap;
      expect(botActions(s, p), top.name).toEqual([{ type: "chooseOption", player: p, choice: yes ? "0" : "none" }]);
    }
  });
});
