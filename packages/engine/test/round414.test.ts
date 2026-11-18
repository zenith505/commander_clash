// Round 414 (Lane A): Elrond of the White Council (a secret council vote: "For each fellowship vote, the voter chooses a
// creature they control. You gain control of each creature chosen this way, and they gain "This creature can't attack its
// owner." Then for each aid vote, put a +1/+1 counter on each creature you control."), Boltbender ("When this creature is
// turned face up, you may choose new targets for any number of other spells and/or abilities.", CR 115.7d) and Confusion
// in the Ranks ("its controller chooses target permanent another player controls that shares a card type with it.
// Exchange control of those permanents.", CR 603.3d, 701.12).

import { describe, expect, it } from "vitest";
import { act, mountain, putOnBattlefield, setup } from "./helpers";
import { controllerOf, invalidateCharacteristics } from "../src/layers";
import { attackProblem, moveObject } from "../src/game";
import { legalTargets } from "../src/effects";
import { applyAction, botActions, isFullySupported, planActivate, planCast, planTurnFaceUp, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const elrond = (): CardDef => ({"oracleId":"5ae4a172-b846-4ec2-8178-a8b762134bfe","name":"Elrond of the White Council","manaCost":"{3}{G}{U}","cmc":5,"typeLine":"Legendary Creature — Elf Noble","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Elf","Noble"],"oracleText":"Secret council — When Elrond enters, each player secretly votes for fellowship or aid, then those votes are revealed. For each fellowship vote, the voter chooses a creature they control. You gain control of each creature chosen this way, and they gain \"This creature can't attack its owner.\" Then for each aid vote, put a +1/+1 counter on each creature you control.","power":"3","toughness":"3","colors":["G","U"],"colorIdentity":["G","U"],"keywords":["Secret council"],"imageUrl":"https://cards.scryfall.io/normal/front/4/c/4cdfb792-fe55-4aa0-88df-4296db794bc5.jpg?1783916020","artUrl":"https://cards.scryfall.io/art_crop/front/4/c/4cdfb792-fe55-4aa0-88df-4296db794bc5.jpg?1783916020","commanderLegal":"legal","set":"ltc","releasedAt":"2023-06-23","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const boltbender = (): CardDef => ({"oracleId":"055e1799-8188-48f4-854e-d3e28363084f","name":"Boltbender","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Goblin Wizard","supertypes":[],"types":["Creature"],"subtypes":["Goblin","Wizard"],"oracleText":"Disguise {1}{R} (You may cast this card face down for {3} as a 2/2 creature with ward {2}. Turn it face up any time for its disguise cost.)\nWhen this creature is turned face up, you may choose new targets for any number of other spells and/or abilities.","power":"4","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Disguise"],"imageUrl":"https://cards.scryfall.io/normal/front/f/0/f0a18bd1-1741-4231-a312-aed1373a96dd.jpg?1783913044","artUrl":"https://cards.scryfall.io/art_crop/front/f/0/f0a18bd1-1741-4231-a312-aed1373a96dd.jpg?1783913044","commanderLegal":"legal","set":"mkc","releasedAt":"2024-02-09","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const confusion = (): CardDef => ({"oracleId":"e477abb9-9b99-48a8-8c09-07b120b72540","name":"Confusion in the Ranks","manaCost":"{3}{R}{R}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever an artifact, creature, or enchantment enters, its controller chooses target permanent another player controls that shares a card type with it. Exchange control of those permanents.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/d/9d46aca2-4714-4d2c-9466-5f1c043b8726.jpg?1783944542","artUrl":"https://cards.scryfall.io/art_crop/front/9/d/9d46aca2-4714-4d2c-9466-5f1c043b8726.jpg?1783944542","commanderLegal":"legal","set":"mrd","releasedAt":"2003-10-02","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const murder = (): CardDef => ({"oracleId":"938b4e2c-88d9-4637-bc00-e228920c9a78","name":"Murder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const angel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const thopter = (): CardDef => ({"oracleId":"a3a98bc9-caa0-49b7-951c-fe4e4f54e4ba","name":"Ornithopter","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Thopter","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Thopter"],"oracleText":"Flying","power":"0","toughness":"2","colors":[],"colorIdentity":[],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddb96645-44d2-426c-90cb-3186297a8728.jpg?1783936724","commanderLegal":"legal","set":"aer","releasedAt":"2017-01-20","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const citadel = (): CardDef => ({"oracleId":"8dc067bf-f78f-4ac4-b6e7-b305c42cf0bc","name":"Darksteel Citadel","manaCost":"","cmc":0,"typeLine":"Artifact Land","supertypes":[],"types":["Artifact","Land"],"subtypes":[],"oracleText":"Indestructible\n{T}: Add {C}.","colors":[],"colorIdentity":[],"keywords":["Indestructible"],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/c/d/cdfafa38-e7db-4a42-99b8-fc65ab41c572.jpg?1783925163","artUrl":"https://cards.scryfall.io/art_crop/front/c/d/cdfafa38-e7db-4a42-99b8-fc65ab41c572.jpg?1783925163","commanderLegal":"legal","set":"sld","releasedAt":"2021-10-15","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const scalesDef = (): CardDef => ({"oracleId":"a1f3da21-af6d-450e-bf0b-985d158418e6","name":"Hardened Scales","manaCost":"{G}","cmc":1,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/2/1219d294-22b3-45de-91d9-8d80e27c2fd6.jpg?1783906258","artUrl":"https://cards.scryfall.io/art_crop/front/1/2/1219d294-22b3-45de-91d9-8d80e27c2fd6.jpg?1783906258","commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const forked = (): CardDef => ({"oracleId":"e0548f0d-4aec-4c39-8c34-52bfa2bf7c60","name":"Forked Bolt","manaCost":"{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Forked Bolt deals 2 damage divided as you choose among one or two targets.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/6/06127297-fdaa-45bf-a82e-4fc61315e0e2.jpg?1783941975","artUrl":"https://cards.scryfall.io/art_crop/front/0/6/06127297-fdaa-45bf-a82e-4fc61315e0e2.jpg?1783941975","commanderLegal":"legal","set":"roe","releasedAt":"2010-04-23","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const growth = (): CardDef => ({"oracleId":"5748ebf1-24e3-499d-ab7c-c2cebd462a24","name":"Giant Growth","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +3/+3 until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const brago = (): CardDef => ({"oracleId":"8877b896-8458-4828-9ff6-9e0ecc180cf7","name":"Brago's Representative","manaCost":"{2}{W}","cmc":3,"typeLine":"Creature — Human Advisor","supertypes":[],"types":["Creature"],"subtypes":["Human","Advisor"],"oracleText":"While voting, you get an additional vote. (The votes can be for different choices or for the same choice.)","power":"1","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bfa2b59c-eaeb-4946-80e0-f937a206aa0c.jpg?1783939378","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bfa2b59c-eaeb-4946-80e0-f937a206aa0c.jpg?1783939378","commanderLegal":"legal","set":"cns","releasedAt":"2014-06-06","rarity":"common","layout":"normal","gameChanger":false} as CardDef);

const sealOf = (): CardDef => ({"oracleId":"a75dbe70-7e3e-446f-9a76-9fbb414f2e7c","name":"Seal of Cleansing","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Sacrifice this enchantment: Destroy target artifact or enchantment.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/a/fa7e69e8-a527-44b8-a8d8-79e09b92c7b2.jpg?1783937626","artUrl":"https://cards.scryfall.io/art_crop/front/f/a/fa7e69e8-a527-44b8-a8d8-79e09b92c7b2.jpg?1783937626","commanderLegal":"legal","set":"ema","releasedAt":"2016-06-10","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty or a question comes up. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
function inHand(s: GameState, pid: PlayerId, def: CardDef): ObjectId {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
}
/** Everyone passes until `pid` has priority (nothing resolves on the way). */
const passTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 4 && waitingOn(s) !== pid && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(waitingOn(s)).toBe(pid);
  return s;
};
/** The legal targets the pending target choice offers. */
const legalOf = (s: GameState) => {
  const p = s.pending;
  if (p?.kind !== "chooseTargets") return [];
  return legalTargets(s, p.specs[0]!, p.controller ?? p.player).flatMap((t) => (t.kind === "object" ? [t.id] : []));
};
const log = (s: GameState) => s.log.map((e) => e.text).join("\n");
const counters = (s: GameState, id: ObjectId) => s.objects[id]!.counters["+1/+1"] ?? 0;
/** Clears a player's battlefield of creatures (setup gives no one any, but bots' commanders could be cast). */
const ofCard = (s: GameState, def: CardDef) => s.battlefield.filter((id) => s.objects[id]!.cardId === def.oracleId);

describe("round 414: the cards compile", () => {
  it("are fully supported", () => {
    for (const d of [elrond(), boltbender(), confusion()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("round 414: Elrond of the White Council", () => {
  /** The active player casts Elrond; each of the others controls a Grizzly Bears (two for the next player). */
  function elrondGame() {
    const { s: s0, ap, ids } = setup([elrond()]);
    const order = s0.turnOrder.slice(s0.turnOrder.indexOf(ap)).concat(s0.turnOrder.slice(0, s0.turnOrder.indexOf(ap)));
    const [, b, c, d] = order as [PlayerId, PlayerId, PlayerId, PlayerId];
    const bear1 = putOnBattlefield(s0, b, bears());
    const bear2 = putOnBattlefield(s0, b, angel());
    const bear3 = putOnBattlefield(s0, c, bears());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    const el = ids[0]!;
    return { s, ap, b, c, d, el, bear1, bear2, bear3 };
  }
  /** Answers the votes in order with these words, checking who is asked. */
  function vote(s: GameState, votes: [PlayerId, string][]) {
    for (const [pid, w] of votes) {
      expect(s.pending).toMatchObject({ kind: "chooseOption", what: "vote", player: pid });
      s = act(s, { type: "chooseOption", player: pid, choice: w });
    }
    return s;
  }

  it("each player votes in secret; fellowship voters give a creature to Elrond's controller, then a counter for each aid vote", () => {
    let { s, ap, b, c, d, el, bear1, bear2, bear3 } = elrondGame();
    s = vote(s, [[ap, "aid"], [b, "fellowship"]]);
    // Secret: the next voter doesn't see the earlier votes, and the log doesn't say them yet (CR 701.38, rulings).
    expect(s.pending?.kind === "chooseOption" && s.pending.prompt).not.toMatch(/fellowship\)|aid\)/);
    expect(log(s)).not.toMatch(/\b[A-D] votes for/);
    s = vote(s, [[c, "fellowship"], [d, "aid"]]);
    expect(log(s)).toMatch(/The votes are revealed/);
    // In APNAP order: b first, choosing between their two creatures; then c, whose only creature is still their choice.
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: b, options: expect.arrayContaining([bear1, bear2]) });
    s = act(s, { type: "pickPermanents", player: b, ids: [bear2] });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: c, options: [bear3] });
    s = act(s, { type: "pickPermanents", player: c, ids: [bear3] });
    s = settle(s);
    expect(controllerOf(s, s.objects[bear2]!)).toBe(ap);
    expect(controllerOf(s, s.objects[bear3]!)).toBe(ap);
    expect(controllerOf(s, s.objects[bear1]!)).toBe(b);
    // Two aid votes: two +1/+1 counters on each creature Elrond's controller controls then, the gained ones too.
    expect([counters(s, el), counters(s, bear2), counters(s, bear3), counters(s, bear1)]).toEqual([2, 2, 2, 0]);
    // "This creature can't attack its owner.": the Angel can't attack b, but can attack c.
    s.objects[bear2]!.controlledSinceTurn = -1;
    s.objects[bear3]!.controlledSinceTurn = -1;
    expect(attackProblem(s, s.objects[bear2]!, b)).toMatch(/can't attack its owner/);
    expect(attackProblem(s, s.objects[bear2]!, c)).toBeNull();
    expect(attackProblem(s, s.objects[bear3]!, c)).toMatch(/can't attack its owner/);
  });

  it("no fellowship votes: nothing changes hands; no aid votes: no counters", () => {
    let { s, ap, b, c, d, el, bear1 } = elrondGame();
    s = vote(s, [[ap, "aid"], [b, "aid"], [c, "aid"], [d, "aid"]]);
    s = settle(s);
    expect(s.pending).toBeNull();
    expect(counters(s, el)).toBe(4);
    expect(controllerOf(s, s.objects[bear1]!)).toBe(b);
    ({ s, ap, b, c, d, el } = elrondGame());
    // d controls no creature: their fellowship vote gives nothing, and they aren't asked.
    s = vote(s, [[ap, "fellowship"], [b, "fellowship"], [c, "fellowship"], [d, "fellowship"]]);
    // Elrond's controller votes fellowship too and chooses one of their own (Elrond, their only creature).
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, options: [el] });
    s = act(s, { type: "pickPermanents", player: ap, ids: [el] });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: b });
    s = act(s, { type: "pickPermanents", player: b, ids: [(s.pending as { options: string[] }).options[0]!] });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: c });
    s = act(s, { type: "pickPermanents", player: c, ids: [(s.pending as { options: string[] }).options[0]!] });
    s = settle(s);
    expect(s.pending).toBeNull();
    expect(counters(s, el)).toBe(0);
    expect(s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === ap && s.cards[s.objects[id]!.cardId]!.types.includes("Creature")).length).toBe(3);
  });

  it("a player with an extra vote who votes fellowship twice chooses twice, the same creature allowed", () => {
    let { s, ap, b, c, d, bear1, bear2 } = elrondGame();
    putOnBattlefield(s, b, brago());
    s = vote(s, [[ap, "aid"], [b, "fellowship"], [b, "fellowship"], [c, "aid"], [d, "aid"]]);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: b });
    expect(s.pending?.kind === "pickPermanents" && s.pending.prompt).toMatch(/2 such votes left/);
    s = act(s, { type: "pickPermanents", player: b, ids: [bear1] });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: b });
    s = act(s, { type: "pickPermanents", player: b, ids: [bear1] });
    s = settle(s);
    expect(controllerOf(s, s.objects[bear1]!)).toBe(ap);
    expect(controllerOf(s, s.objects[bear2]!)).toBe(b);
    expect(counters(s, bear1)).toBe(3);
  });

  it("a bot voting fellowship gives the creature it values least", () => {
    let { s, ap, b, c, d, bear1, bear2 } = elrondGame();
    s = vote(s, [[ap, "aid"], [b, "fellowship"], [c, "aid"], [d, "aid"]]);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: b });
    s.players[b]!.isBot = true;
    s = run(s, botActions(s, b));
    s = settle(s);
    // The Bears, not the Serra Angel.
    expect(controllerOf(s, s.objects[bear1]!)).toBe(ap);
    expect(controllerOf(s, s.objects[bear2]!)).toBe(b);
  });

  it("the counters for all the aid votes go on each creature at once (one event: Hardened Scales adds one)", () => {
    let { s, ap, b, c, d, el } = elrondGame();
    putOnBattlefield(s, ap, scalesDef());
    s = vote(s, [[ap, "aid"], [b, "aid"], [c, "aid"], [d, "fellowship"]]);
    s = settle(s);
    expect(counters(s, el)).toBe(4);
  });

  it("bots vote: the controller for aid; an opponent with no creature for fellowship", () => {
    let { s, ap, b, d } = elrondGame();
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "vote", player: ap });
    s.players[ap]!.isBot = true;
    expect(botActions(s, ap)[0]).toMatchObject({ choice: "aid" });
    s = act(s, { type: "chooseOption", player: ap, choice: "aid" });
    s = act(s, { type: "chooseOption", player: b, choice: "aid" });
    s = act(s, { type: "chooseOption", player: s.pending!.player, choice: "aid" });
    expect(s.pending).toMatchObject({ player: d });
    s.players[d]!.isBot = true;
    expect(botActions(s, d)[0]).toMatchObject({ choice: "fellowship" });
  });
});

describe("round 414: Boltbender", () => {
  /** b has a face-down Boltbender and {1}{R} to turn it up; b, the active player and c each control a Grizzly Bears. */
  function boltGame(extra: CardDef[] = []) {
    const { s: s0, ap, ids } = setup([murder(), ...extra]);
    const order = s0.turnOrder.slice(s0.turnOrder.indexOf(ap)).concat(s0.turnOrder.slice(0, s0.turnOrder.indexOf(ap)));
    const [, b, c] = order as [PlayerId, PlayerId, PlayerId];
    const bb = putOnBattlefield(s0, b, boltbender());
    s0.objects[bb]!.faceDown = "disguise";
    putOnBattlefield(s0, b, mountain);
    putOnBattlefield(s0, b, mountain);
    const theirBear = putOnBattlefield(s0, b, bears());
    const myBear = putOnBattlefield(s0, ap, bears());
    const cBear = putOnBattlefield(s0, c, bears());
    invalidateCharacteristics(s0);
    return { s: s0, ap, b, c, ids, bb, theirBear, myBear, cBear };
  }
  /** b turns Boltbender face up while it has priority; then everyone passes until its trigger asks. */
  function flip(s: GameState, b: PlayerId, bb: ObjectId) {
    expect(waitingOn(s)).toBe(b);
    s = run(s, planTurnFaceUp(s, b, bb));
    for (let i = 0; i < 8 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return s;
  }

  it("turned face up: its controller chooses new targets for another spell (CR 115.7d), legal for that spell's controller", () => {
    let { s, ap, b, ids, bb, theirBear, myBear } = boltGame();
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: theirBear }]));
    s = act(s, { type: "passPriority", player: ap });
    s = flip(s, b, bb);
    expect(s.pending).toMatchObject({ kind: "newTargets", player: b, spell: expect.stringContaining("Murder") });
    s = act(s, { type: "newTargets", player: b, targets: [{ kind: "object", id: myBear }] });
    expect(log(s)).toMatch(/changes the targets of Murder/);
    s = settle(s);
    expect(s.objects[myBear]!.zone).toBe("graveyard");
    expect(s.objects[theirBear]!.zone).toBe("battlefield");
  });

  it("any number of them: each spell and ability on the stack is asked about, top first; any may be kept", () => {
    let { s, ap, b, c, ids, bb, theirBear, myBear, cBear } = boltGame([shock()]);
    // Murder at b's Bears, then Shock (on top) at c's Bears.
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: theirBear }]));
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: cBear }]));
    s = act(s, { type: "passPriority", player: ap });
    s = flip(s, b, bb);
    expect(s.pending).toMatchObject({ kind: "newTargets", spell: expect.stringContaining("Shock") });
    // Keep Shock's target.
    s = act(s, { type: "newTargets", player: b });
    expect(s.pending).toMatchObject({ kind: "newTargets", spell: expect.stringContaining("Murder") });
    s = act(s, { type: "newTargets", player: b, targets: [{ kind: "object", id: myBear }] });
    s = settle(s);
    expect([s.objects[cBear]!.zone, s.objects[myBear]!.zone, s.objects[theirBear]!.zone]).toEqual(["graveyard", "graveyard", "battlefield"]);
    expect(s.players[c]!.life).toBe(40);
  });

  it("a divided spell keeps its division, only the targets change (rulings); a spell without targets isn't asked about", () => {
    let { s, ap, b, ids, bb, theirBear, myBear } = boltGame([forked(), growth()]);
    s.players[ap]!.hand = s.players[ap]!.hand.filter((x) => x !== ids[0]);
    // Forked Bolt: 1 to b's Bears, 1 to b.
    const plan = planCast(s, ap, ids[1]!, [{ kind: "object", id: theirBear, amount: 1 }, { kind: "player", id: b, amount: 1 }]);
    s = run(s, plan);
    s = act(s, { type: "passPriority", player: ap });
    s = flip(s, b, bb);
    expect(s.pending).toMatchObject({ kind: "newTargets", spell: expect.stringContaining("Forked Bolt") });
    s = act(s, { type: "newTargets", player: b, targets: [{ kind: "object", id: myBear }, { kind: "player", id: ap }] });
    s = settle(s);
    expect(s.objects[theirBear]!.zone).toBe("battlefield");
    expect(s.objects[myBear]!.damage).toBe(1);
    expect(s.players[ap]!.life).toBe(39);
    expect(s.players[b]!.life).toBe(40);
  });

  it("an activated ability's targets can be changed too", () => {
    let { s, ap, b, bb } = boltGame();
    const seal = putOnBattlefield(s, ap, sealOf());
    const theirRing = putOnBattlefield(s, b, solRing());
    const myRing = putOnBattlefield(s, ap, solRing());
    s = run(s, planActivate(s, ap, seal, 0, [{ kind: "object", id: theirRing }]));
    s = act(s, { type: "passPriority", player: ap });
    s = flip(s, b, bb);
    expect(s.pending).toMatchObject({ kind: "newTargets", player: b });
    s = act(s, { type: "newTargets", player: b, targets: [{ kind: "object", id: myRing }] });
    s = settle(s);
    expect([s.objects[myRing]!.zone, s.objects[theirRing]!.zone]).toEqual(["graveyard", "battlefield"]);
  });

  it("with nothing else on the stack, nothing is asked", () => {
    let { s, b, bb } = boltGame();
    s = passTo(s, b);
    s = run(s, planTurnFaceUp(s, b, bb));
    s = settle(s);
    expect(s.pending).toBeNull();
    expect(s.objects[bb]!.faceDown).toBeFalsy();
  });

  it("a bot moves a removal spell aimed at its creature to an opponent's", () => {
    let { s, ap, b, ids, bb, theirBear, myBear, cBear } = boltGame();
    s = run(s, planCast(s, ap, ids[0]!, [{ kind: "object", id: theirBear }]));
    s = act(s, { type: "passPriority", player: ap });
    s = flip(s, b, bb);
    s.players[b]!.isBot = true;
    s = run(s, botActions(s, b));
    s = settle(s);
    expect(s.objects[theirBear]!.zone).toBe("battlefield");
    // Moved to one of an opponent's: the caster's Bears or c's.
    expect([myBear, cBear].filter((id) => s.objects[id]!.zone === "graveyard").length).toBe(1);
    expect(log(s)).toMatch(/changes the targets of Murder/);
  });
});

describe("round 414: Confusion in the Ranks", () => {
  function ranksGame(extra: CardDef[] = []) {
    const { s: s0, ap, ids } = setup([confusion(), ...extra]);
    const order = s0.turnOrder.slice(s0.turnOrder.indexOf(ap)).concat(s0.turnOrder.slice(0, s0.turnOrder.indexOf(ap)));
    const [, b, c] = order as [PlayerId, PlayerId, PlayerId];
    return { s: s0, ap, b, c, ids };
  }
  /** Puts `def` onto the battlefield from `pid`'s hand under their control (an enters event), then lets triggers go on the stack. */
  function enters(s: GameState, pid: PlayerId, def: CardDef) {
    const id = inHand(s, pid, def);
    moveObject(s, id, "battlefield");
    invalidateCharacteristics(s);
    return { s: act(s, { type: "passPriority", player: waitingOn(s)! }), id };
  }

  it("it triggers on itself: its controller exchanges it for an enchantment another player controls", () => {
    let { s, ap, b, c, ids } = ranksGame();
    const scales = putOnBattlefield(s, b, scalesDef());
    putOnBattlefield(s, c, bears());
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    // Only b's enchantment shares a card type with it (not c's creature, not ap's own permanents).
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    const p = s.pending as { specs: { types: string[] }[] };
    expect(p.specs[0]!.types).toEqual(["Enchantment"]);
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: scales }] });
    s = settle(s);
    expect(controllerOf(s, s.objects[scales]!)).toBe(ap);
    expect(controllerOf(s, s.objects[ids[0]!]!)).toBe(b);
  });

  it("another player's creature entering: its controller chooses the target, and the two are exchanged", () => {
    let { s, ap, b, c, ids } = ranksGame();
    const conf = putOnBattlefield(s, ap, confusion());
    s.players[ap]!.hand = s.players[ap]!.hand.filter((x) => x !== ids[0]);
    const myAngel = putOnBattlefield(s, ap, angel());
    const cBear = putOnBattlefield(s, c, bears());
    let id: ObjectId;
    ({ s, id } = enters(s, b, bears()));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: b, controller: ap });
    const opts = legalOf(s);
    expect(opts).toEqual(expect.arrayContaining([myAngel, cBear]));
    expect(opts).not.toContain(conf);
    s = act(s, { type: "chooseTargets", player: b, targets: [{ kind: "object", id: myAngel }] });
    s = settle(s);
    expect(controllerOf(s, s.objects[myAngel]!)).toBe(b);
    expect(controllerOf(s, s.objects[id]!)).toBe(ap);
    // Confusion's controller controls the trigger, but b chose (CR 603.3d): the log names the exchange.
    expect(log(s)).toMatch(/exchange control of Grizzly Bears and Serra Angel/);
  });

  it("an artifact land entering can be exchanged for a land (rulings); with no legal target the trigger is removed", () => {
    let { s, ap, b, ids } = ranksGame();
    putOnBattlefield(s, ap, confusion());
    s.players[ap]!.hand = s.players[ap]!.hand.filter((x) => x !== ids[0]);
    const forest = s.battlefield.find((x) => s.cards[s.objects[x]!.cardId]!.name === "Forest" && s.objects[x]!.controller === ap)!;
    const bForest = putOnBattlefield(s, b, s.cards[s.objects[forest]!.cardId]!);
    let id: ObjectId;
    ({ s, id } = enters(s, ap, citadel()));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    expect(legalOf(s)).toEqual([bForest]);
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: bForest }] });
    s = settle(s);
    expect(controllerOf(s, s.objects[id]!)).toBe(b);
    expect(controllerOf(s, s.objects[bForest]!)).toBe(ap);
    // b's Ornithopter: no other player controls an artifact or a creature, so the trigger has no legal target.
    const before = s.log.length;
    ({ s } = enters(s, b, thopter()));
    s = settle(s);
    expect(s.pending).toBeNull();
    expect(s.log.slice(before).map((e) => e.text).join("\n")).toMatch(/no legal targets|is removed|no target/i);
  });

  it("no exchange if the permanent that entered has left the battlefield by then", () => {
    let { s, ap, b, ids } = ranksGame();
    putOnBattlefield(s, ap, confusion());
    s.players[ap]!.hand = s.players[ap]!.hand.filter((x) => x !== ids[0]);
    const myAngel = putOnBattlefield(s, ap, angel());
    let id: ObjectId;
    ({ s, id } = enters(s, b, bears()));
    s = settle(s);
    s = act(s, { type: "chooseTargets", player: b, targets: [{ kind: "object", id: myAngel }] });
    moveObject(s, id, "graveyard");
    s = settle(s);
    expect(controllerOf(s, s.objects[myAngel]!)).toBe(ap);
    expect(log(s)).toMatch(/has left the battlefield, so nothing is exchanged/);
  });

  it("a bot choosing the target takes the most valuable permanent it can", () => {
    let { s, ap, b, c, ids } = ranksGame();
    putOnBattlefield(s, ap, confusion());
    s.players[ap]!.hand = s.players[ap]!.hand.filter((x) => x !== ids[0]);
    const myAngel = putOnBattlefield(s, ap, angel());
    putOnBattlefield(s, c, bears());
    ({ s } = enters(s, b, bears()));
    s = settle(s);
    s.players[b]!.isBot = true;
    const acts = botActions(s, b);
    expect(acts[0]).toMatchObject({ type: "chooseTargets", targets: [{ kind: "object", id: myAngel }] });
  });

  it("a bot whose own Confusion triggers on itself takes another player's enchantment", () => {
    let { s, ap, b, ids } = ranksGame();
    const scales = putOnBattlefield(s, b, scalesDef());
    s = run(s, planCast(s, ap, ids[0]!));
    s = settle(s);
    s.players[ap]!.isBot = true;
    s = run(s, botActions(s, ap));
    s = settle(s);
    expect(controllerOf(s, s.objects[scales]!)).toBe(ap);
  });
});
