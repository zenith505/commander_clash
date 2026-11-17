// Round 393 (Lane A): a revealed card put onto the battlefield with a manifestation counter, an enchantment in addition to
// its other types (Arbiter of the Ideal), an exchange of control between a nonland permanent you control and one an
// opponent controls that shares a card type with it (Daring Thief), and a permanent another player of your choice may
// gain control of after you draw (Stardew Valley).

import { describe, expect, it } from "vitest";
import { act, card, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";
import { legalTargets } from "../src/effects/targeting";

// Real card data (Scryfall).
const arbiter = (): CardDef => ({"oracleId":"a6cefecd-459e-439a-a62c-689c2919b689","name":"Arbiter of the Ideal","manaCost":"{4}{U}{U}","cmc":6,"typeLine":"Creature — Sphinx","supertypes":[],"types":["Creature"],"subtypes":["Sphinx"],"oracleText":"Flying\nInspired — Whenever this creature becomes untapped, reveal the top card of your library. If it's an artifact, creature, or land card, you may put it onto the battlefield with a manifestation counter on it. That permanent is an enchantment in addition to its other types.","power":"4","toughness":"5","colors":["U"],"colorIdentity":["U"],"keywords":["Flying","Inspired"],"imageUrl":"https://cards.scryfall.io/normal/front/3/2/32e58ba3-4202-4f91-b27f-7528d27c1d5c.jpg?1783939573","artUrl":"https://cards.scryfall.io/art_crop/front/3/2/32e58ba3-4202-4f91-b27f-7528d27c1d5c.jpg?1783939573","commanderLegal":"legal","set":"bng","releasedAt":"2014-02-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const thief = (): CardDef => ({"oracleId":"e01289ea-634b-4be5-8b8e-5e1179761a9b","name":"Daring Thief","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Human Rogue","supertypes":[],"types":["Creature"],"subtypes":["Human","Rogue"],"oracleText":"Inspired — Whenever this creature becomes untapped, you may exchange control of target nonland permanent you control and target permanent an opponent controls that shares a card type with it.","power":"2","toughness":"3","colors":["U"],"colorIdentity":["U"],"keywords":["Inspired"],"imageUrl":"https://cards.scryfall.io/normal/front/c/9/c9d9378d-e553-48b5-8a23-59a35329eda2.jpg?1783939448","artUrl":"https://cards.scryfall.io/art_crop/front/c/9/c9d9378d-e553-48b5-8a23-59a35329eda2.jpg?1783939448","commanderLegal":"legal","set":"jou","releasedAt":"2014-05-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const stardew = (): CardDef => ({"oracleId":"6a4ee425-b3b8-487d-866c-9e2d73682466","name":"Stardew Valley","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{2}, {T}, Tap an untapped creature you control: Create a Food token.\n{3}, {T}: Choose target permanent you control. Draw a card, then another player of your choice may gain control of that permanent. Activate only as a sorcery.","colors":[],"colorIdentity":[],"keywords":["Food"],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/9/9/9979db80-83f6-41ed-aea2-0c222e923add.jpg?1785322037","artUrl":"https://cards.scryfall.io/art_crop/front/9/9/9979db80-83f6-41ed-aea2-0c222e923add.jpg?1785322037","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-27","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const eidolon = (): CardDef => ({"oracleId":"77ccbea1-70af-4194-adad-39a904221c75","name":"Eidolon of Blossoms","manaCost":"{2}{G}{G}","cmc":4,"typeLine":"Enchantment Creature — Spirit","supertypes":[],"types":["Enchantment","Creature"],"subtypes":["Spirit"],"oracleText":"Constellation — Whenever this creature or another enchantment you control enters, draw a card.","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":["Constellation"],"imageUrl":"https://cards.scryfall.io/normal/front/8/d/8dbb2112-85b9-49cf-9ed5-9273829c34f1.jpg?1783939415","artUrl":"https://cards.scryfall.io/art_crop/front/8/d/8dbb2112-85b9-49cf-9ed5-9273829c34f1.jpg?1783939415","commanderLegal":"legal","set":"jou","releasedAt":"2014-05-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const memnite = (): CardDef => ({"oracleId":"7663ac7c-1de3-4250-b96a-fae9dbd66a27","name":"Memnite","manaCost":"{0}","cmc":0,"typeLine":"Artifact Creature — Construct","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Construct"],"oracleText":"","power":"1","toughness":"1","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/6/469cc4e0-49c0-4009-97ea-28e44addec69.jpg?1783941703","artUrl":"https://cards.scryfall.io/art_crop/front/4/6/469cc4e0-49c0-4009-97ea-28e44addec69.jpg?1783941703","commanderLegal":"legal","set":"som","releasedAt":"2010-10-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const citadel = (): CardDef => ({"oracleId":"8dc067bf-f78f-4ac4-b6e7-b305c42cf0bc","name":"Darksteel Citadel","manaCost":"","cmc":0,"typeLine":"Artifact Land","supertypes":[],"types":["Artifact","Land"],"subtypes":[],"oracleText":"Indestructible\n{T}: Add {C}.","colors":[],"colorIdentity":[],"keywords":["Indestructible"],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/c/d/cdfafa38-e7db-4a42-99b8-fc65ab41c572.jpg?1783925163","artUrl":"https://cards.scryfall.io/art_crop/front/c/d/cdfafa38-e7db-4a42-99b8-fc65ab41c572.jpg?1783925163","commanderLegal":"legal","set":"sld","releasedAt":"2021-10-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const forestCard = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const unsummon = (): CardDef => ({"oracleId":"837182db-1bf3-4a2c-bd01-1af9d9873561","name":"Unsummon","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Return target creature to its owner's hand.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/d/ddad9f16-52d5-49de-82b0-b1a5294a9c44.jpg?1789556722","artUrl":"https://cards.scryfall.io/art_crop/front/d/d/ddad9f16-52d5-49de-82b0-b1a5294a9c44.jpg?1789556722","commanderLegal":"legal","set":"fra","releasedAt":"2026-10-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const pacifism = (): CardDef => ({"oracleId":"5f5e0b10-c8cf-450c-bfd3-bcb0528ec330","name":"Pacifism","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't attack or block.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/433eed50-81af-4a59-b624-57b6f5f1bb0f.jpg?1783903091","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const burst = (): CardDef => ({"oracleId":"b795ecfd-31ac-4a2a-9679-97b088932d93","name":"Burst of Energy","manaCost":"{W}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Untap target permanent.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/43d590d2-cfa3-43d1-9e65-bc68b5a2a3ee.jpg?1783946253","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/43d590d2-cfa3-43d1-9e65-bc68b5a2a3ee.jpg?1783946253","commanderLegal":"legal","set":"ulg","releasedAt":"1999-02-15","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

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
const moveTo = (zone: "graveyard" | "hand" | "library") => (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const toHand = moveTo("hand");
const toTop = moveTo("library");
const zone = (s: GameState, id: ObjectId) => s.objects[id]?.zone;
const types = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).types;
/** Takes `id` off the battlefield into its owner's graveyard (a new object, CR 400.7). */
const bury = (s: GameState, id: ObjectId) => {
  const o = s.objects[id]!;
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  o.zone = "graveyard";
  o.zoneChanges = (o.zoneChanges ?? 0) + 1;
  s.players[o.owner]!.graveyard.push(id);
  invalidateCharacteristics(s);
};

describe("round 393: compiles", () => {
  it("every card of the round is fully supported", () => {
    for (const d of [arbiter(), thief(), stardew()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

/** `ap` casts Burst of Energy untapping `id` (tapped first); its inspired trigger waits for `ap`'s first question. */
const untapWith = (s0: GameState, ap: PlayerId, id: ObjectId, burstId: ObjectId) => {
  s0.objects[id]!.tapped = true;
  let s = run(s0, planCast(s0, ap, burstId, [{ kind: "object", id }]));
  s = settle(s, ap);
  return s;
};

describe("Arbiter of the Ideal", () => {
  it("an artifact, creature or land card revealed: you may put it onto the battlefield with a manifestation counter, an enchantment as it enters (constellation sees it) and after the counter is gone", () => {
    const { s: s0, ap, ids } = setup([burst()]);
    const a = putOnBattlefield(s0, ap, arbiter());
    putOnBattlefield(s0, ap, eidolon());
    const m = toTop(s0, ap, memnite());
    const hand = s0.players[ap]!.hand.length;
    let s = untapWith(s0, ap, a, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap, card: m });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(zone(s, m)).toBe("battlefield");
    expect(s.objects[m]!.counters.manifestation).toBe(1);
    expect(types(s, m)).toEqual(expect.arrayContaining(["Artifact", "Creature", "Enchantment"]));
    // Eidolon of Blossoms' constellation: the Memnite entered as an enchantment (rulings). Burst of Energy left the hand.
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
    // The counter is only a reminder (rulings).
    s.objects[m]!.counters = {};
    invalidateCharacteristics(s);
    expect(types(s, m)).toContain("Enchantment");
  });

  it("an instant revealed stays on top; a land you decline stays on top too, and the reveal isn't optional", () => {
    const t1 = setup([burst()]);
    const a1 = putOnBattlefield(t1.s, t1.ap, arbiter());
    const b = toTop(t1.s, t1.ap, bolt());
    let s = untapWith(t1.s, t1.ap, a1, t1.ids[0]!);
    expect(s.pending).toBeNull();
    expect(s.players[t1.ap]!.library[0]).toBe(b);
    expect(s.log.some((l) => /reveals Lightning Bolt/.test(l.text))).toBe(true);

    const t2 = setup([burst()]);
    const a2 = putOnBattlefield(t2.s, t2.ap, arbiter());
    const f = toTop(t2.s, t2.ap, forestCard());
    s = untapWith(t2.s, t2.ap, a2, t2.ids[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: t2.ap, card: f });
    s = settle(act(s, { type: "chooseMay", player: t2.ap, yes: false }), t2.ap);
    expect(s.players[t2.ap]!.library[0]).toBe(f);
  });

  it("an artifact creature put onto the battlefield this way is an enchantment too; once it leaves it's a new object, no longer an enchantment", () => {
    const { s: s0, ap, ids } = setup([burst(), unsummon()]);
    const a = putOnBattlefield(s0, ap, arbiter());
    const m = toTop(s0, ap, memnite());
    let s = untapWith(s0, ap, a, ids[0]!);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(types(s, m)).toContain("Enchantment");
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "object", id: m }])), ap);
    expect(zone(s, m)).toBe("hand");
    s = settle(run(s, planCast(s, ap, m)), ap);
    expect(zone(s, m)).toBe("battlefield");
    expect(types(s, m)).not.toContain("Enchantment");
  });

  it("a bot puts the card onto the battlefield", () => {
    const { s: s0, ap, ids } = setup([burst()]);
    const a = putOnBattlefield(s0, ap, arbiter());
    const m = toTop(s0, ap, memnite());
    const s = settle(untapWith(s0, ap, a, ids[0]!));
    expect(zone(s, m)).toBe("battlefield");
    expect(types(s, m)).toContain("Enchantment");
  });
});

describe("Daring Thief", () => {
  it("targets a nonland permanent you control and a permanent an opponent controls that shares a card type with it (an artifact land for an artifact, rulings); you may exchange them", () => {
    const { s: s0, ap, ids, opp } = setup([burst()]);
    const th = putOnBattlefield(s0, ap, thief());
    const ring = putOnBattlefield(s0, ap, solRing());
    const cit = putOnBattlefield(s0, opp, citadel());
    const theirBears = putOnBattlefield(s0, opp, bears());
    let s = untapWith(s0, ap, th, ids[0]!);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    if (s.pending?.kind !== "chooseTargets") return;
    // No land of yours as the first target.
    const first = legalTargets(s, s.pending.specs[0]!, ap).flatMap((t) => (t.kind === "object" ? [t.id] : []));
    expect(first).toContain(ring);
    expect(first.some((id) => characteristics(s, s.objects[id]!).types.includes("Land"))).toBe(false);
    // Grizzly Bears shares no card type with Sol Ring.
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: ring }, { kind: "object", id: theirBears }] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: ring }, { kind: "object", id: cit }] }), ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(controllerOf(s, s.objects[ring]!)).toBe(opp);
    expect(controllerOf(s, s.objects[cit]!)).toBe(ap);
  });

  it("with one target illegal as it resolves, nothing changes control; declining changes nothing either", () => {
    const { s: s0, ap, ids, opp } = setup([burst()]);
    const th = putOnBattlefield(s0, ap, thief());
    const mine = putOnBattlefield(s0, ap, bears());
    const theirs = putOnBattlefield(s0, opp, memnite());
    let s = untapWith(s0, ap, th, ids[0]!);
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: mine }, { kind: "object", id: theirs }] });
    bury(s, theirs);
    s = settle(s, ap);
    if (s.pending?.kind === "chooseMay") s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(controllerOf(s, s.objects[mine]!)).toBe(ap);

    const t = setup([burst()]);
    const th2 = putOnBattlefield(t.s, t.ap, thief());
    const mine2 = putOnBattlefield(t.s, t.ap, bears());
    const theirs2 = putOnBattlefield(t.s, t.opp, memnite());
    let u = untapWith(t.s, t.ap, th2, t.ids[0]!);
    u = settle(act(u, { type: "chooseTargets", player: t.ap, targets: [{ kind: "object", id: mine2 }, { kind: "object", id: theirs2 }] }), t.ap);
    u = settle(act(u, { type: "chooseMay", player: t.ap, yes: false }), t.ap);
    expect(controllerOf(u, u.objects[mine2]!)).toBe(t.ap);
    expect(controllerOf(u, u.objects[theirs2]!)).toBe(t.opp);
  });

  it("the exchange lasts after Daring Thief leaves (rulings)", () => {
    const { s: s0, ap, ids, opp } = setup([burst()]);
    const th = putOnBattlefield(s0, ap, thief());
    const mine = putOnBattlefield(s0, ap, bears());
    const theirs = putOnBattlefield(s0, opp, memnite());
    let s = untapWith(s0, ap, th, ids[0]!);
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: mine }, { kind: "object", id: theirs }] }), ap);
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    bury(s, th);
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
    expect(controllerOf(s, s.objects[mine]!)).toBe(opp);
  });
});

describe("Daring Thief: bots", () => {
  it("a bot picks a legal pair and only swaps for something worth more", () => {
    const { s: s0, ap, ids, opp } = setup([burst()]);
    const th = putOnBattlefield(s0, ap, thief());
    const ring = putOnBattlefield(s0, ap, solRing());
    const big = putOnBattlefield(s0, opp, card("Juggernaut Test", "Artifact Creature — Juggernaut", "{4}", { power: "5", toughness: "3" }));
    const s = settle(untapWith(s0, ap, th, ids[0]!));
    expect(s.pending).toBeNull();
    // Either it swapped the Sol Ring for the 5/3 artifact creature, or nothing changed hands.
    const swapped = controllerOf(s, s.objects[big]!) === ap;
    expect(controllerOf(s, s.objects[ring]!)).toBe(swapped ? opp : ap);
  });
});

describe("Stardew Valley", () => {
  /** Stardew Valley on `ap`'s battlefield; its third ability activated targeting `target`. */
  const activateValley = (s0: GameState, ap: PlayerId, valley: ObjectId, target: ObjectId) => run(s0, planActivate(s0, ap, valley, 1, [{ kind: "object", id: target }]));

  it("you draw a card, then choose another player, who may gain control of the target permanent for the rest of the game", () => {
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, ap, stardew());
    const b = putOnBattlefield(s0, ap, bears());
    const hand = s0.players[ap]!.hand.length;
    let s = settle(activateValley(s0, ap, v, b), ap);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "opponent", player: ap });
    if (s.pending?.kind !== "chooseOption") return;
    expect(s.pending.options).not.toContain(String(ap));
    s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    s = settle(act(s, { type: "chooseMay", player: opp, yes: true }), ap);
    expect(controllerOf(s, s.objects[b]!)).toBe(opp);
  });

  it("the chosen player may decline; with the target gone as it resolves, you don't draw", () => {
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, ap, stardew());
    const b = putOnBattlefield(s0, ap, bears());
    let s = settle(activateValley(s0, ap, v, b), ap);
    s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    s = settle(act(s, { type: "chooseMay", player: opp, yes: false }), ap);
    expect(controllerOf(s, s.objects[b]!)).toBe(ap);

    const t = setup([]);
    const v2 = putOnBattlefield(t.s, t.ap, stardew());
    const b2 = putOnBattlefield(t.s, t.ap, bears());
    const hand = t.s.players[t.ap]!.hand.length;
    let u = activateValley(t.s, t.ap, v2, b2);
    bury(u, b2);
    u = settle(u, t.ap);
    expect(u.pending).toBeNull();
    expect(u.players[t.ap]!.hand.length).toBe(hand);
  });

  it("only as a sorcery", () => {
    const { s: s0, ap } = setup([]);
    const v = putOnBattlefield(s0, ap, stardew());
    const b = putOnBattlefield(s0, ap, bears());
    s0.step = "upkeep";
    expect(planActivate(s0, ap, v, 1, [{ kind: "object", id: b }])).toBeNull();
  });

  it("a bot doesn't give away a creature of its own, and a bot offered a permanent takes it", () => {
    const { s: s0, ap } = setup([]);
    const v = putOnBattlefield(s0, ap, stardew());
    putOnBattlefield(s0, ap, bears());
    // No token: the bot doesn't activate the third ability.
    const acts = botActions(s0, ap);
    expect(acts.some((a) => a.type === "activateAbility" && a.objectId === v && a.index === 1)).toBe(false);
    // A bot chosen as the other player takes the permanent.
    const w = setup([]);
    const v3 = putOnBattlefield(w.s, w.ap, stardew());
    const b3 = putOnBattlefield(w.s, w.ap, bears());
    let x = settle(run(w.s, planActivate(w.s, w.ap, v3, 1, [{ kind: "object", id: b3 }])), w.ap);
    x = settle(act(x, { type: "chooseOption", player: w.ap, choice: String(w.opp) }), w.ap);
    expect(controllerOf(x, x.objects[b3]!)).toBe(w.opp);
  });
});
