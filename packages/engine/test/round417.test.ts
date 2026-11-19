// Round 417 (Lane A): Helm of Kaldra ("{1}: If you control Equipment named Helm of Kaldra, Sword of Kaldra, and Shield of
// Kaldra, create Kaldra, a legendary 4/4 colorless Avatar creature token. Attach those Equipment to it.", CR 701.3),
// Arcee, Sharpshooter // Arcee, Acrobatic Coupe ("Remove one or more +1/+1 counters from Arcee: It deals that much damage
// to target creature. Convert Arcee." and "Whenever you cast a spell that targets one or more creatures or Vehicles you
// control, put that many +1/+1 counters on Arcee. Convert Arcee.", CR 701.28) and Lodestone Bauble ("Put up to four target
// basic land cards from a player's graveyard on top of their library in any order. That player draws a card at the
// beginning of the next turn's upkeep.": a player chosen even with no target, rulings).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { invalidateCharacteristics } from "../src/layers";
import { applyAction, botActions, characteristics, isFullySupported, objHasKeyword, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type CostChoices, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const helm = (): CardDef => ({"oracleId":"38a3c87f-006e-4fc2-8c67-77b5bbb0471f","name":"Helm of Kaldra","manaCost":"{3}","cmc":3,"typeLine":"Legendary Artifact — Equipment","supertypes":["Legendary"],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature has first strike, trample, and haste.\n{1}: If you control Equipment named Helm of Kaldra, Sword of Kaldra, and Shield of Kaldra, create Kaldra, a legendary 4/4 colorless Avatar creature token. Attach those Equipment to it.\nEquip {2}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/f/7/f76514aa-3cc1-4d5f-ba33-d933a36920a4.jpg?1783944379","artUrl":"https://cards.scryfall.io/art_crop/front/f/7/f76514aa-3cc1-4d5f-ba33-d933a36920a4.jpg?1783944379","commanderLegal":"legal","set":"5dn","releasedAt":"2004-06-04","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const sword = (): CardDef => ({"oracleId":"35f63c60-b0a1-459d-bf51-a8549fb06930","name":"Sword of Kaldra","manaCost":"{4}","cmc":4,"typeLine":"Legendary Artifact — Equipment","supertypes":["Legendary"],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +5/+5.\nWhenever equipped creature deals damage to a creature, exile that creature. (Exile it only if it's still on the battlefield.)\nEquip {4} ({4}: Attach to target creature you control. Equip only as a sorcery.)","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/3/a/3a665bff-b57a-450c-9310-932b0686a03e.jpg?1783944501","artUrl":"https://cards.scryfall.io/art_crop/front/3/a/3a665bff-b57a-450c-9310-932b0686a03e.jpg?1783944501","commanderLegal":"legal","set":"mrd","releasedAt":"2003-10-02","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const shield = (): CardDef => ({"oracleId":"4fdd570f-dbe0-486f-9843-f77f80956307","name":"Shield of Kaldra","manaCost":"{4}","cmc":4,"typeLine":"Legendary Artifact — Equipment","supertypes":["Legendary"],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipment named Sword of Kaldra, Shield of Kaldra, and Helm of Kaldra have indestructible.\nEquipped creature has indestructible. (Damage and effects that say \"destroy\" don't destroy it.)\nEquip {4}","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/d/3/d3e09c8a-6c55-491b-96e9-6cf05f673ac3.jpg?1783944420","artUrl":"https://cards.scryfall.io/art_crop/front/d/3/d3e09c8a-6c55-491b-96e9-6cf05f673ac3.jpg?1783944420","commanderLegal":"legal","set":"dst","releasedAt":"2004-02-06","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const arcee = (): CardDef => ({"oracleId":"9fba3097-d53f-4ea4-b5d2-8adddaa09524","name":"Arcee, Sharpshooter // Arcee, Acrobatic Coupe","manaCost":"{1}{R}{W}","cmc":3,"typeLine":"Legendary Artifact Creature — Robot // Legendary Artifact — Vehicle","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Robot"],"oracleText":"More Than Meets the Eye {R}{W} (You may cast this card converted for {R}{W}.)\nFirst strike\n{1}, Remove one or more +1/+1 counters from Arcee: It deals that much damage to target creature. Convert Arcee.","power":"2","toughness":"2","colors":["R","W"],"colorIdentity":["R","W"],"keywords":["Living metal","First strike","Convert","More Than Meets the Eye"],"imageUrl":"https://cards.scryfall.io/normal/front/2/1/21462db4-7739-4853-845f-0c2aa38fd2a6.jpg?1783919906","artUrl":"https://cards.scryfall.io/art_crop/front/2/1/21462db4-7739-4853-845f-0c2aa38fd2a6.jpg?1783919906","commanderLegal":"legal","set":"bot","releasedAt":"2022-11-18","rarity":"mythic","layout":"transform","gameChanger":false,"faces":[{"name":"Arcee, Sharpshooter","manaCost":"{1}{R}{W}","typeLine":"Legendary Artifact Creature — Robot","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Robot"],"oracleText":"More Than Meets the Eye {R}{W} (You may cast this card converted for {R}{W}.)\nFirst strike\n{1}, Remove one or more +1/+1 counters from Arcee: It deals that much damage to target creature. Convert Arcee.","power":"2","toughness":"2","colors":["R","W"],"imageUrl":"https://cards.scryfall.io/normal/front/2/1/21462db4-7739-4853-845f-0c2aa38fd2a6.jpg?1783919906","artUrl":"https://cards.scryfall.io/art_crop/front/2/1/21462db4-7739-4853-845f-0c2aa38fd2a6.jpg?1783919906"},{"name":"Arcee, Acrobatic Coupe","manaCost":"","typeLine":"Legendary Artifact — Vehicle","supertypes":["Legendary"],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"Living metal (During your turn, this Vehicle is also a creature.)\nWhenever you cast a spell that targets one or more creatures or Vehicles you control, put that many +1/+1 counters on Arcee. Convert Arcee.","power":"2","toughness":"2","colors":["R","W"],"colorIndicator":["R","W"],"imageUrl":"https://cards.scryfall.io/normal/back/2/1/21462db4-7739-4853-845f-0c2aa38fd2a6.jpg?1783919906","artUrl":"https://cards.scryfall.io/art_crop/back/2/1/21462db4-7739-4853-845f-0c2aa38fd2a6.jpg?1783919906"}]} as CardDef);
const bauble = (): CardDef => ({"oracleId":"6048b9ac-7d5e-4486-a89a-30adb45aab27","name":"Lodestone Bauble","manaCost":"{0}","cmc":0,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{1}, {T}, Sacrifice this artifact: Put up to four target basic land cards from a player's graveyard on top of their library in any order. That player draws a card at the beginning of the next turn's upkeep.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/4/84d88a33-3990-4044-a5fe-4123d5781f18.jpg?1783947163","artUrl":"https://cards.scryfall.io/art_crop/front/8/4/84d88a33-3990-4044-a5fe-4123d5781f18.jpg?1783947163","commanderLegal":"legal","set":"all","releasedAt":"1996-06-10","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const growth = (): CardDef => ({"oracleId":"5748ebf1-24e3-499d-ab7c-c2cebd462a24","name":"Giant Growth","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +3/+3 until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const forest = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const plains = (): CardDef => ({"oracleId":"bc71ebf6-2056-41f7-be35-b2e5c34afa99","name":"Plains","manaCost":"","cmc":0,"typeLine":"Basic Land — Plains","supertypes":["Basic"],"types":["Land"],"subtypes":["Plains"],"oracleText":"({T}: Add {W}.)","colors":[],"colorIdentity":["W"],"keywords":[],"producedMana":["W"],"imageUrl":"https://cards.scryfall.io/normal/front/0/9/09b3c8bb-10ca-4b9f-8507-db6e8c52a918.jpg?1785981636","artUrl":"https://cards.scryfall.io/art_crop/front/0/9/09b3c8bb-10ca-4b9f-8507-db6e8c52a918.jpg?1785981636","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const travel = (): CardDef => ({"oracleId":"8432729e-5fd4-4661-8b79-e41b1d03eb7b","name":"Travel Preparations","manaCost":"{1}{G}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Put a +1/+1 counter on each of up to two target creatures.\nFlashback {1}{W} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["G"],"colorIdentity":["G","W"],"keywords":["Flashback"],"imageUrl":"https://cards.scryfall.io/normal/front/e/9/e9654ae7-af2c-4956-be3a-68befa33f523.jpg?1783940907","artUrl":"https://cards.scryfall.io/art_crop/front/e/9/e9654ae7-af2c-4956-be3a-68befa33f523.jpg?1783940907","commanderLegal":"legal","set":"isd","releasedAt":"2011-09-30","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const jousting = (): CardDef => ({"oracleId":"ab747483-2aa1-4b25-b2fa-cf7372a1b1dc","name":"Jousting Lance","manaCost":"{2}","cmc":2,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Equipped creature gets +2/+0.\nDuring your turn, equipped creature has first strike.\nEquip {3} ({3}: Attach to target creature you control. Equip only as a sorcery.)","colors":[],"colorIdentity":[],"keywords":["Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/4/4/446579ab-5e36-44e2-84d7-cfa537619146.jpg?1783934958","artUrl":"https://cards.scryfall.io/art_crop/front/4/4/446579ab-5e36-44e2-84d7-cfa537619146.jpg?1783934958","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const mirrorGallery = (): CardDef => ({"oracleId":"7c9c3060-ca9d-4868-84c6-2a95b0fa8885","name":"Mirror Gallery","manaCost":"{5}","cmc":5,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"The \"legend rule\" doesn't apply.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/0/00beba34-54cc-4a30-8424-71a1215647a6.jpg?1783944177","artUrl":"https://cards.scryfall.io/art_crop/front/0/0/00beba34-54cc-4a30-8424-71a1215647a6.jpg?1783944177","commanderLegal":"legal","set":"bok","releasedAt":"2005-02-04","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false} as CardDef);

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
const activateNow = (s: GameState, pid: PlayerId, id: ObjectId, index: number, targets?: TargetChoice[], x?: number, costs?: CostChoices) => settle(run(s, planActivate(s, pid, id, index, targets, undefined, undefined, x, costs)));
const castNow = (s: GameState, pid: PlayerId, id: ObjectId, targets?: TargetChoice[]) => settle(run(s, planCast(s, pid, id, targets, undefined, "auto")));
const name = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).name;
const order = (s: GameState, ap: PlayerId) => s.turnOrder.slice(s.turnOrder.indexOf(ap)).concat(s.turnOrder.slice(0, s.turnOrder.indexOf(ap))) as [PlayerId, PlayerId, PlayerId, PlayerId];
/** A fresh copy of `def` in `pid`'s graveyard (as the top card). */
function toYard(s: GameState, pid: PlayerId, def: CardDef): ObjectId {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
}
const kaldraOf = (s: GameState) => s.battlefield.filter((id) => s.objects[id]!.isToken && name(s, id) === "Kaldra");

describe("round 417: the cards compile", () => {
  it("are fully supported", () => {
    for (const d of [helm(), sword(), shield(), arcee(), bauble(), growth(), travel(), bolt()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("round 417: Helm of Kaldra", () => {
  function kaldraGame(pieces: CardDef[] = [helm(), sword(), shield()]) {
    const { s, ap } = setup([]);
    const ids = pieces.map((d) => putOnBattlefield(s, ap, d));
    return { s, ap, ids, helmId: ids[0]! };
  }

  it("with all three Kaldra Equipment: creates Kaldra, a legendary 4/4 colorless Avatar token, with all three attached", () => {
    const { s: s0, ap, ids, helmId } = kaldraGame();
    const s = activateNow(s0, ap, helmId, 0);
    const k = kaldraOf(s);
    expect(k).toHaveLength(1);
    const c = characteristics(s, s.objects[k[0]!]!);
    expect(c.supertypes).toContain("Legendary");
    expect(c.subtypes).toContain("Avatar");
    expect(c.colors).toEqual([]);
    for (const id of ids) expect(s.objects[id]!.attachedTo).toBe(k[0]);
    // 4/4, +5/+5 from the Sword, first strike, trample, haste (Helm) and indestructible (Shield).
    expect(`${power(s, s.objects[k[0]!]!)}/${toughness(s, s.objects[k[0]!]!)}`).toBe("9/9");
    for (const kw of ["First strike", "Trample", "Haste", "Indestructible"]) expect(objHasKeyword(s, s.objects[k[0]!]!, kw), kw).toBe(true);
  });

  it("without one of them, the ability does nothing", () => {
    const { s: s0, ap, helmId } = kaldraGame([helm(), sword()]);
    const s = activateNow(s0, ap, helmId, 0);
    expect(kaldraOf(s)).toHaveLength(0);
  });

  it("checks as it resolves: the Shield leaving in response means no token (rulings)", () => {
    const { s: s0, ap, ids, helmId } = kaldraGame();
    let s = run(s0, planActivate(s0, ap, helmId, 0));
    expect(s.stack).toHaveLength(1);
    // The Shield leaves the battlefield before the ability resolves.
    const shieldId = ids[2]!;
    s.battlefield.splice(s.battlefield.indexOf(shieldId), 1);
    s.objects[shieldId]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(shieldId);
    invalidateCharacteristics(s);
    s = settle(s);
    expect(kaldraOf(s)).toHaveLength(0);
    expect(s.objects[ids[1]!]!.attachedTo).toBeUndefined();
  });

  it("an opponent's Sword of Kaldra doesn't count: Equipment you control", () => {
    const { s: s0, ap } = setup([]);
    const [, b] = order(s0, ap);
    const helmId = putOnBattlefield(s0, ap, helm());
    putOnBattlefield(s0, ap, shield());
    const theirs = putOnBattlefield(s0, b, sword());
    const s = activateNow(s0, ap, helmId, 0);
    expect(kaldraOf(s)).toHaveLength(0);
    expect(s.objects[theirs]!.attachedTo).toBeUndefined();
  });

  it("Equipment attached elsewhere move onto the new Kaldra", () => {
    const { s: s0, ap, ids, helmId } = kaldraGame();
    const bearId = putOnBattlefield(s0, ap, bears());
    s0.objects[ids[1]!]!.attachedTo = bearId;
    invalidateCharacteristics(s0);
    const s = activateNow(s0, ap, helmId, 0);
    const k = kaldraOf(s)[0]!;
    expect(s.objects[ids[1]!]!.attachedTo).toBe(k);
    expect(`${power(s, s.objects[bearId]!)}/${toughness(s, s.objects[bearId]!)}`).toBe("2/2");
  });
});

describe("round 417: Arcee", () => {
  it("Sharpshooter: removing two +1/+1 counters deals 2 damage to target creature, then Arcee converts", () => {
    const { s: s0, ap } = setup([]);
    const [, b] = order(s0, ap);
    const a = putOnBattlefield(s0, ap, arcee());
    s0.objects[a]!.counters["+1/+1"] = 3;
    const bearId = putOnBattlefield(s0, b, bears());
    invalidateCharacteristics(s0);
    const s = activateNow(s0, ap, a, 0, [target(bearId)], 2);
    expect(s.objects[bearId]!.zone).toBe("graveyard");
    expect(s.objects[a]!.counters["+1/+1"]).toBe(1);
    expect(name(s, a)).toBe("Arcee, Acrobatic Coupe");
    expect(s.log.some((l) => /Arcee, Sharpshooter deals 2 damage/.test(l.text))).toBe(true);
  });

  it("Sharpshooter: one counter at least (\"one or more\")", () => {
    const { s: s0, ap } = setup([]);
    const [, b] = order(s0, ap);
    const a = putOnBattlefield(s0, ap, arcee());
    s0.objects[a]!.counters["+1/+1"] = 1;
    const bearId = putOnBattlefield(s0, b, bears());
    invalidateCharacteristics(s0);
    expect(planActivate(s0, ap, a, 0, [target(bearId)], undefined, undefined, 0)).toBeNull();
  });

  /** Arcee with its back face up (Arcee, Acrobatic Coupe) on the active player's battlefield, and a Travel Preparations in hand. */
  function coupeGame() {
    const { s, ap, ids } = setup([travel()]);
    const a = putOnBattlefield(s, ap, arcee());
    s.objects[a]!.face = 1;
    invalidateCharacteristics(s);
    return { s, ap, a, tp: ids[0]! };
  }

  it("Acrobatic Coupe: a spell targeting it and another creature you control puts two counters on it, then it converts", () => {
    const { s: s0, ap, a, tp } = coupeGame();
    const bearId = putOnBattlefield(s0, ap, bears());
    expect(name(s0, a)).toBe("Arcee, Acrobatic Coupe");
    const s = castNow(s0, ap, tp, [target(a), target(bearId)]);
    // Two from the trigger, then one from Travel Preparations itself.
    expect(s.objects[a]!.counters["+1/+1"]).toBe(3);
    expect(name(s, a)).toBe("Arcee, Sharpshooter");
  });

  it("Acrobatic Coupe: only the creatures you control count (an opponent's doesn't)", () => {
    const { s: s0, ap, a, tp } = coupeGame();
    const [, b] = order(s0, ap);
    const theirs = putOnBattlefield(s0, b, bears());
    let s = run(s0, planCast(s0, ap, tp, [target(a), target(theirs)], undefined, "auto"));
    // The trigger resolves before the spell.
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 10 && s.stack.length > 1 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[a]!.counters["+1/+1"]).toBe(1);
  });

  it("Acrobatic Coupe: the number is fixed as it's cast; the target gone in response still counts", () => {
    const { s: s0, ap, a, tp } = coupeGame();
    const bearId = putOnBattlefield(s0, ap, bears());
    let s = run(s0, planCast(s0, ap, tp, [target(a), target(bearId)], undefined, "auto"));
    expect(s.stack.length).toBe(2);
    // The Bears leaves before the trigger resolves.
    s.battlefield.splice(s.battlefield.indexOf(bearId), 1);
    s.objects[bearId]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(bearId);
    invalidateCharacteristics(s);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 10 && s.stack.length > 1 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[a]!.counters["+1/+1"]).toBe(2);
  });

  it("Acrobatic Coupe: a spell that targets none of them doesn't trigger it", () => {
    const { s: s0, ap, a } = coupeGame();
    const [, b] = order(s0, ap);
    const theirs = putOnBattlefield(s0, b, bears());
    const g = putOnBattlefield(s0, ap, growth());
    s0.battlefield.splice(s0.battlefield.indexOf(g), 1);
    s0.objects[g]!.zone = "hand";
    s0.players[ap]!.hand.push(g);
    invalidateCharacteristics(s0);
    const s = castNow(s0, ap, g, [target(theirs)]);
    expect(s.objects[a]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(name(s, a)).toBe("Arcee, Acrobatic Coupe");
  });
});

describe("round 417: Lodestone Bauble", () => {
  function baubleGame() {
    const { s, ap } = setup([]);
    const [, b, c] = order(s, ap);
    const id = putOnBattlefield(s, ap, bauble());
    const lands = [forest(), plains(), forest()].map((d) => toYard(s, b, d));
    const cLand = toYard(s, c, forest());
    return { s, ap, b, c, id, lands, cLand };
  }

  it("puts the basic land cards on top of their owner's library in the order they choose; that player draws one at the next upkeep", () => {
    const { s: s0, ap, b, id, lands } = baubleGame();
    let s = activateNow(s0, ap, id, 0, [target(lands[0]!), target(lands[1]!), { kind: "none" }, { kind: "none" }]);
    // "In any order": put there at the same time, their owner arranges them (CR 401.4).
    expect(s.pending).toMatchObject({ kind: "orderLibrary", player: b });
    s = settle(act(s, { type: "orderLibrary", player: b, order: [lands[1]!, lands[0]!] }));
    expect(s.objects[id]!.zone).toBe("graveyard");
    expect(s.players[b]!.library.slice(0, 2)).toEqual([lands[1], lands[0]]);
    expect(s.players[b]!.graveyard).toContain(lands[2]);
    const top = s.players[b]!.library[0]!;
    const handBefore = s.players[b]!.hand.length;
    // The next turn is b's: at the beginning of its upkeep b draws a card (and then one more in the draw step).
    s = passUntil(s, "upkeep", b);
    s = settle(s);
    expect(s.players[b]!.hand).toContain(top);
    expect(s.players[b]!.hand.length).toBe(handBefore + 1);
  });

  it("the cards must come from a single graveyard", () => {
    const { s, ap, id, lands, cLand } = baubleGame();
    expect(planActivate(s, ap, id, 0, [target(lands[0]!), target(cLand), { kind: "none" }, { kind: "none" }])).toBeNull();
  });

  it("with no target, a player is still chosen as it's activated, and that player draws (rulings)", () => {
    const { s: s0, ap, c, id } = baubleGame();
    const none: TargetChoice[] = [{ kind: "none" }, { kind: "none" }, { kind: "none" }, { kind: "none" }];
    // Not without choosing one.
    expect(() => run(s0, planActivate(s0, ap, id, 0, none))).toThrow(/choose a player/);
    let s = activateNow(s0, ap, id, 0, none, undefined, { yardPlayer: c });
    expect(s.objects[id]!.zone).toBe("graveyard");
    const handBefore = s.players[c]!.hand.length;
    s = passUntil(s, "upkeep");
    s = settle(s);
    expect(s.players[c]!.hand.length).toBe(handBefore + 1);
    expect(s.log.some((l) => /draws a card/.test(l.text))).toBe(true);
  });

  it("with targets, the player is their owner, whatever was chosen", () => {
    const { s: s0, ap, b, c, id, lands } = baubleGame();
    let s = run(s0, planActivate(s0, ap, id, 0, [target(lands[0]!), { kind: "none" }, { kind: "none" }, { kind: "none" }], undefined, undefined, undefined, { yardPlayer: c }));
    expect(s.stack[s.stack.length - 1]!.yardPlayer).toBe(b);
    s = settle(s);
    const cHand = s.players[c]!.hand.length;
    s = passUntil(s, "upkeep", b);
    s = settle(s);
    expect(s.players[c]!.hand.length).toBe(cHand);
  });

  it("a bot uses it at the end of the turn before an opponent's, on that opponent's basic lands", () => {
    const { s: s0, ap, b, id, lands } = baubleGame();
    let s = passUntil(s0, "end", ap);
    // Pass priority around until it's the bot's (the Bauble's controller's) turn to act.
    for (let i = 0; i < 8 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const acts = botActions(s, ap);
    const use = acts.find((a) => a.type === "activateAbility" && a.objectId === id);
    expect(use).toBeDefined();
    const ts = (use as Extract<Action, { type: "activateAbility" }>).targets!.filter((t) => t.kind === "object").map((t) => (t as { id: ObjectId }).id);
    expect(ts.length).toBeGreaterThanOrEqual(2);
    for (const t of ts) expect(lands).toContain(t);
    expect(b).toBe(order(s0, ap)[1]);
  });
});
