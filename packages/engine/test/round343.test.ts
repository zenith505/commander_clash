// Round 343 (Lane A): casting a card as an instruction resolves "by paying [a cost] rather than paying its mana cost"
// (CastPay, an alternative cost, CR 118.9, 608.2g): The Infamous Cruelclaw ("by discarding a card"), Bismuth Mindrender
// ("by paying life equal to the spell's mana value"), Amped Raptor ("by paying an amount of {E} equal to its mana value",
// "Then if you cast it from your hand"), Anrakyr the Traveller ("an artifact spell from your hand or graveyard by paying
// life equal to its mana value") and Blue Mage's Cane ("You may cast the copy by paying {3}").

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, castProblem, characteristics, invalidateCharacteristics, isFullySupported, moveObject, planCast, waitingOn, type Action, type CardDef, type GameState, type PendingDecision, type PlayerId } from "../src";

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
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const pend = <K extends PendingDecision["kind"]>(s: GameState, kind: K) => {
  expect(s.pending?.kind).toBe(kind);
  return s.pending as Extract<PendingDecision, { kind: K }>;
};
const name = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
/** A copy of `def` in `pid`'s `zone` (hand, graveyard or library, on top). */
const put = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "hand") s.players[pid]!.hand.push(id);
  else if (zone === "graveyard") s.players[pid]!.graveyard.push(id);
  else s.players[pid]!.library.unshift(id);
  invalidateCharacteristics(s);
  return id;
};
/** `ap` attacks `defender` with `attackers`, nobody blocks; stops at a question of `me`'s or once the attack is done. */
const attack = (s: GameState, ap: PlayerId, attackers: string[], defender: PlayerId, me?: PlayerId) => {
  s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender })) });
  return settle(s, me);
};
/** `ap` attacks `defender` with `attackers`, nobody blocks, until combat damage's triggers; stops at a question of `me`'s. */
const hit = (s: GameState, ap: PlayerId, attackers: string[], defender: PlayerId, me?: PlayerId) => settle(passUntil(attack(s, ap, attackers, defender), "combatDamage", ap), me);
const untappedLands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && !s.objects[id]!.tapped && s.cards[s.objects[id]!.cardId]!.types.includes("Land")).length;

// Real oracle text (Scryfall).
const cruelclaw = (): CardDef => ({"oracleId":"e229d55c-9513-437d-bd67-015ac46aaa18","name":"The Infamous Cruelclaw","manaCost":"{1}{B}{R}","cmc":3,"typeLine":"Legendary Creature — Weasel Mercenary","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Weasel","Mercenary"],"oracleText":"Menace\nWhenever The Infamous Cruelclaw deals combat damage to a player, exile cards from the top of your library until you exile a nonland card. You may cast that card by discarding a card rather than paying its mana cost.","power":"3","toughness":"3","colors":["B","R"],"colorIdentity":["B","R"],"keywords":["Menace"],"imageUrl":"https://cards.scryfall.io/normal/front/d/c/dc6c9196-6d28-4cc2-9748-60e9632a502b.jpg?1783910796","artUrl":"https://cards.scryfall.io/art_crop/front/d/c/dc6c9196-6d28-4cc2-9748-60e9632a502b.jpg?1783910796","commanderLegal":"legal","set":"blb","releasedAt":"2024-08-02","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const bismuth = (): CardDef => ({"oracleId":"12b859f8-36f3-43cd-b537-6e07857b247e","name":"Bismuth Mindrender","manaCost":"{3}{B}","cmc":4,"typeLine":"Creature — Eldrazi","supertypes":[],"types":["Creature"],"subtypes":["Eldrazi"],"oracleText":"Devoid (This card has no color.)\nMenace\nWhenever this creature deals combat damage to a player, that player exiles cards from the top of their library until they exile a nonland card. You may cast that card by paying life equal to the spell's mana value rather than paying its mana cost.","power":"4","toughness":"3","colors":[],"colorIdentity":["B"],"keywords":["Devoid","Menace"],"imageUrl":"https://cards.scryfall.io/normal/front/d/1/d1ee8ead-df6a-4c02-83f7-2902d97132b8.jpg?1783911423","artUrl":"https://cards.scryfall.io/art_crop/front/d/1/d1ee8ead-df6a-4c02-83f7-2902d97132b8.jpg?1783911423","commanderLegal":"legal","set":"m3c","releasedAt":"2024-06-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const raptor = (): CardDef => ({"oracleId":"3ed14ea7-ee62-4604-af3b-deafb00108c3","name":"Amped Raptor","manaCost":"{1}{R}","cmc":2,"typeLine":"Creature — Dinosaur","supertypes":[],"types":["Creature"],"subtypes":["Dinosaur"],"oracleText":"First strike\nWhen this creature enters, you get {E}{E} (two energy counters). Then if you cast it from your hand, exile cards from the top of your library until you exile a nonland card. You may cast that card by paying an amount of {E} equal to its mana value rather than paying its mana cost.","power":"2","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":["First strike"],"imageUrl":"https://cards.scryfall.io/normal/front/1/a/1ac0e78b-0fdd-44f9-8b7b-c4f28a32782e.jpg?1783911274","artUrl":"https://cards.scryfall.io/art_crop/front/1/a/1ac0e78b-0fdd-44f9-8b7b-c4f28a32782e.jpg?1783911274","commanderLegal":"legal","set":"mh3","releasedAt":"2024-06-14","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const anrakyr = (): CardDef => ({"oracleId":"32476743-c9d4-49ca-bec2-0669c215841b","name":"Anrakyr the Traveller","manaCost":"{4}{B}","cmc":5,"typeLine":"Legendary Artifact Creature — Necron","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Necron"],"oracleText":"Lord of the Pyrrhian Legions — Whenever Anrakyr the Traveller attacks, you may cast an artifact spell from your hand or graveyard by paying life equal to its mana value rather than paying its mana cost.","power":"4","toughness":"4","colors":["B"],"colorIdentity":["B"],"keywords":["Lord of the Pyrrhian Legions"],"imageUrl":"https://cards.scryfall.io/normal/front/6/e/6ea09406-c65e-4ee4-9c74-0553e5110837.jpg?1783920932","artUrl":"https://cards.scryfall.io/art_crop/front/6/e/6ea09406-c65e-4ee4-9c74-0553e5110837.jpg?1783920932","commanderLegal":"legal","set":"40k","releasedAt":"2022-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const cane = (): CardDef => ({"oracleId":"6290233b-b015-4909-8aba-bf8d65cc37b5","name":"Blue Mage's Cane","manaCost":"{2}{U}","cmc":3,"typeLine":"Artifact — Equipment","supertypes":[],"types":["Artifact"],"subtypes":["Equipment"],"oracleText":"Job select\nEquipped creature gets +0/+2, is a Wizard in addition to its other types, and has \"Whenever this creature attacks, exile up to one target instant or sorcery card from defending player's graveyard. If you do, copy it. You may cast the copy by paying {3} rather than paying its mana cost.\"\nSpirit of the Whalaqee — Equip {2}","colors":["U"],"colorIdentity":["U"],"keywords":["Job select","Spirit of the Whalaqee","Equip"],"imageUrl":"https://cards.scryfall.io/normal/front/9/b/9b3cfc13-db4e-4ec3-8444-f715bcd43be6.jpg?1783906363","artUrl":"https://cards.scryfall.io/art_crop/front/9/b/9b3cfc13-db4e-4ec3-8444-f715bcd43be6.jpg?1783906363","commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const mindStone = (): CardDef => ({"oracleId":"c97361b5-af16-4a7b-af85-a429dbaf4ad2","name":"Mind Stone","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237","artUrl":"https://cards.scryfall.io/art_crop/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237","commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const fireball = (): CardDef => ({"oracleId":"aa7714b0-2bfb-458a-8ebf-37ec2c53383e","name":"Fireball","manaCost":"{X}{R}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"This spell costs {1} more to cast for each target beyond the first.\nFireball deals X damage divided evenly, rounded down, among any number of targets.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/2/82a97aae-d8a7-4451-a47e-ea878dea6e4c.jpg?1783922638","artUrl":"https://cards.scryfall.io/art_crop/front/8/2/82a97aae-d8a7-4451-a47e-ea878dea6e4c.jpg?1783922638","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/760b41a1-c087-4b11-b8a0-fb01d8a4c0c6.jpg?1783905334","commanderLegal":"legal","set":"spm","releasedAt":"2025-09-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const everflowingChalice = (): CardDef => ({"oracleId":"0a79237e-0811-4a8a-bd4d-db3ca91bff22","name":"Everflowing Chalice","manaCost":"{0}","cmc":0,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Multikicker {2} (You may pay an additional {2} any number of times as you cast this spell.)\nThis artifact enters with a charge counter on it for each time it was kicked.\n{T}: Add {C} for each charge counter on this artifact.","colors":[],"colorIdentity":[],"keywords":["Multikicker"],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/5/d/5d659b0c-dc93-464f-847f-2af075caf145.jpg?1783906240","artUrl":"https://cards.scryfall.io/art_crop/front/5/d/5d659b0c-dc93-464f-847f-2af075caf145.jpg?1783906240","commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const forestCard = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","artUrl":"https://cards.scryfall.io/art_crop/front/c/7/c7f9daf0-dbfd-45b2-be35-9c2de9d1a56e.jpg?1783935025","commanderLegal":"legal","set":"dom","releasedAt":"2018-04-27","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const kickerSpell = (): CardDef => ({"oracleId":"ac2086fe-98ee-4280-9c7c-c5c2d6548a8b","name":"Burst Lightning","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Kicker {4} (You may pay an additional {4} as you cast this spell.)\nBurst Lightning deals 2 damage to any target. If this spell was kicked, it deals 4 damage instead.","colors":["R"],"colorIdentity":["R"],"keywords":["Kicker"],"imageUrl":"https://cards.scryfall.io/normal/front/f/9/f98b402a-ecdb-432f-a050-65945c8c415d.jpg?1783903920","artUrl":"https://cards.scryfall.io/art_crop/front/f/9/f98b402a-ecdb-432f-a050-65945c8c415d.jpg?1783903920","commanderLegal":"legal","set":"soa","releasedAt":"2026-04-24","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

describe("round 343: compiles", () => {
  it("every card of the round", () => supported(cruelclaw(), bismuth(), raptor(), anrakyr(), cane()));
});

describe("round 343: The Infamous Cruelclaw", () => {
  it("exiles to a nonland card, cast now by discarding a card rather than paying its mana cost", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const claw = putOnBattlefield(s, ap, cruelclaw());
    const bolt = put(s, ap, lightningBolt(), "hand");
    const bears = put(s, ap, grizzlyBears(), "library");
    const land = put(s, ap, forestCard(), "library");
    const lands = untappedLands(s, ap);
    s = hit(s, ap, [claw], opp, ap);
    const p = pend(s, "castFree");
    expect(p.objectId).toBe(bears);
    expect(p.pay).toEqual({ kind: "discard", n: 1 });
    expect(s.objects[land]!.zone).toBe("exile");
    // A card must be discarded: a cast that doesn't say which can't skip the cost (CR 601.2h).
    expect(() => run(s, planCast(s, ap, bears))).toThrow(/additional cost/);
    s = run(s, planCast(s, ap, bears, undefined, undefined, undefined, undefined, { discard: [bolt] }));
    expect(s.objects[bolt]!.zone).toBe("graveyard");
    expect(s.stack.some((x) => x.objectId === bears)).toBe(true);
    expect(untappedLands(s, ap)).toBe(lands);
    s = settle(s, ap);
    expect(s.objects[bears]).toMatchObject({ zone: "battlefield", controller: ap });
    expect(s.log.some((l) => /by discarding a card rather than paying its mana cost/.test(l.text))).toBe(true);
  });
});

describe("round 343: The Infamous Cruelclaw, costs", () => {
  it("with no card in hand it can't be cast and stays in exile; X is 0; a kicker is still paid", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const claw = putOnBattlefield(s, ap, cruelclaw());
    const bears = put(s, ap, grizzlyBears(), "library");
    // An empty hand: nothing to discard.
    for (const id of s.players[ap]!.hand.splice(0)) {
      s.objects[id]!.zone = "library";
      s.players[ap]!.library.push(id);
    }
    s = hit(s, ap, [claw], opp, ap);
    expect(s.pending).toBeNull();
    expect(s.objects[bears]!.zone).toBe("exile");
    expect(s.log.some((l) => /Grizzly Bears can't be cast/.test(l.text))).toBe(true);

    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    let t = t0;
    const claw2 = putOnBattlefield(t, ap2, cruelclaw());
    const shock2 = put(t, ap2, shock(), "hand");
    const ball = put(t, ap2, fireball(), "library");
    t = hit(t, ap2, [claw2], opp2, ap2);
    expect(pend(t, "castFree").objectId).toBe(ball);
    // An alternative cost with no {X}: X is 0 (CR 107.3b, rulings).
    expect(castProblem(t, ap2, ball, [{ kind: "player", id: opp2 }], undefined, undefined, undefined, 3, { discard: [shock2] })).toMatch(/X is 0/);
    expect(castProblem(t, ap2, ball, [{ kind: "player", id: opp2 }], undefined, undefined, undefined, 0, { discard: [shock2] })).toBeNull();

    const { s: u0, ap: ap3, opp: opp3 } = setup([]);
    let u = u0;
    const claw3 = putOnBattlefield(u, ap3, cruelclaw());
    const shock3 = put(u, ap3, shock(), "hand");
    const burst = put(u, ap3, kickerSpell(), "library");
    u = hit(u, ap3, [claw3], opp3, ap3);
    expect(pend(u, "castFree").objectId).toBe(burst);
    const lands = untappedLands(u, ap3);
    const life = u.players[opp3]!.life;
    // Kicker is an additional cost: paid on top of the discard (rulings).
    u = run(u, planCast(u, ap3, burst, [{ kind: "player", id: opp3 }], undefined, undefined, undefined, { discard: [shock3], kicks: [0] }));
    expect(untappedLands(u, ap3)).toBe(lands - 4);
    u = settle(u, ap3);
    expect(u.players[opp3]!.life).toBe(life - 4);
    expect(u.objects[shock3]!.zone).toBe("graveyard");
  });
});

describe("round 343: Bismuth Mindrender", () => {
  it("that player's nonland card, cast by you for life equal to its mana value; not enough life, not cast", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const rend = putOnBattlefield(s, ap, bismuth());
    const bears = put(s, opp, grizzlyBears(), "library");
    put(s, opp, forestCard(), "library");
    const lands = untappedLands(s, ap);
    s = hit(s, ap, [rend], opp, ap);
    const p = pend(s, "castFree");
    expect(p).toMatchObject({ objectId: bears, player: ap, pay: { kind: "lifeMv" } });
    const life = s.players[ap]!.life;
    s = settle(run(s, planCast(s, ap, bears)), ap);
    expect(s.players[ap]!.life).toBe(life - 2);
    expect(untappedLands(s, ap)).toBe(lands);
    expect(s.objects[bears]).toMatchObject({ zone: "battlefield", controller: ap, owner: opp });

    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    let t = t0;
    const rend2 = putOnBattlefield(t, ap2, bismuth());
    const bears2 = put(t, opp2, grizzlyBears(), "library");
    t.players[ap2]!.life = 1;
    t = hit(t, ap2, [rend2], opp2, ap2);
    // Life can't be paid beyond what you have (CR 119.4): it stays in exile (rulings).
    expect(t.pending).toBeNull();
    expect(t.objects[bears2]!.zone).toBe("exile");
  });

  it("a bot pays the life only while it would keep 15 or more (as for any life cost)", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const rend = putOnBattlefield(s, ap, bismuth());
    const bears = put(s, opp, grizzlyBears(), "library");
    s = hit(s, ap, [rend], opp, ap);
    pend(s, "castFree");
    s.players[ap]!.life = 16;
    expect(botActions(s, ap)).toEqual([{ type: "chooseMay", player: ap, yes: false }]);
    s.players[ap]!.life = 17;
    const plan = botActions(s, ap);
    expect(plan.some((a) => a.type === "castSpell" && a.objectId === bears)).toBe(true);
  });
});

describe("round 343: Amped Raptor", () => {
  it("cast from your hand: {E}{E}, then a nonland card cast for that many {E}", () => {
    const { s: s0, ap, ids } = setup([raptor()]);
    let s = s0;
    const bears = put(s, ap, grizzlyBears(), "library");
    put(s, ap, forestCard(), "library");
    s = settle(run(s, planCast(s, ap, ids[0]!)), ap);
    expect(s.players[ap]!.energy).toBe(2);
    expect(pend(s, "castFree")).toMatchObject({ objectId: bears, pay: { kind: "energyMv" } });
    const lands = untappedLands(s, ap);
    s = settle(run(s, planCast(s, ap, bears)), ap);
    expect(s.players[ap]!.energy ?? 0).toBe(0);
    expect(untappedLands(s, ap)).toBe(lands);
    expect(s.objects[bears]!.zone).toBe("battlefield");
  });

  it("not enough {E}: the card stays in exile; not cast from a hand: only the energy", () => {
    const { s: s0, ap, ids } = setup([raptor()]);
    let s = s0;
    const div = put(s, ap, divination(), "library");
    s = settle(run(s, planCast(s, ap, ids[0]!)), ap);
    expect(s.players[ap]!.energy).toBe(2);
    expect(s.pending).toBeNull();
    expect(s.objects[div]!.zone).toBe("exile");

    const { s: t0, ap: ap2 } = setup([]);
    let t = t0;
    const top = put(t, ap2, grizzlyBears(), "library");
    // Put onto the battlefield, not cast: only the energy, the library untouched.
    const id = put(t, ap2, raptor(), "hand");
    moveObject(t, id, "battlefield", { controller: ap2 });
    t = settle(t, ap2);
    expect(t.objects[id]!.zone).toBe("battlefield");
    expect(t.players[ap2]!.energy).toBe(2);
    expect(t.objects[top]!.zone).toBe("library");
    expect(t.players[ap2]!.library[0]).toBe(top);
  });
});

describe("round 343: Anrakyr the Traveller", () => {
  it("as it attacks, an artifact spell from your hand or graveyard for life equal to its mana value", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const anr = putOnBattlefield(s, ap, anrakyr());
    const stone = put(s, ap, mindStone(), "hand");
    const ring = put(s, ap, solRing(), "graveyard");
    const bolt = put(s, ap, lightningBolt(), "hand");
    const lands = untappedLands(s, ap);
    s = attack(s, ap, [anr], opp, ap);
    // Artifacts only, from both zones; Lightning Bolt isn't one.
    const p = pend(s, "chooseOption");
    expect(p.options).toEqual([stone, ring, "none"]);
    expect(p.prompt).toMatch(/artifact spell from your hand or graveyard by paying life equal to its mana value rather than paying its mana cost/);
    s = act(s, { type: "chooseOption", player: ap, choice: stone });
    expect(pend(s, "castFree")).toMatchObject({ objectId: stone, pay: { kind: "lifeMv" } });
    const life = s.players[ap]!.life;
    s = settle(run(s, planCast(s, ap, stone)), ap);
    expect(s.players[ap]!.life).toBe(life - 2);
    expect(untappedLands(s, ap)).toBe(lands);
    expect(s.objects[stone]!.zone).toBe("battlefield");
    // One spell only: Sol Ring stays in the graveyard.
    expect(s.objects[ring]!.zone).toBe("graveyard");
    expect(s.objects[bolt]!.zone).toBe("hand");
  });

  it("a card from the graveyard for 1 life; declined, nothing is cast", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const anr = putOnBattlefield(s, ap, anrakyr());
    const ring = put(s, ap, solRing(), "graveyard");
    s = attack(s, ap, [anr], opp, ap);
    if (s.pending?.kind === "chooseOption") s = act(s, { type: "chooseOption", player: ap, choice: ring });
    const life = s.players[ap]!.life;
    s = settle(run(s, planCast(s, ap, ring)), ap);
    expect(s.players[ap]!.life).toBe(life - 1);
    expect(s.objects[ring]!.zone).toBe("battlefield");

    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    let t = t0;
    const anr2 = putOnBattlefield(t, ap2, anrakyr());
    const ring2 = put(t, ap2, solRing(), "graveyard");
    t = attack(t, ap2, [anr2], opp2, ap2);
    if (t.pending?.kind === "chooseOption") t = act(t, { type: "chooseOption", player: ap2, choice: "none" });
    else t = act(t, { type: "chooseMay", player: ap2, yes: false });
    t = settle(t, ap2);
    expect(t.objects[ring2]!.zone).toBe("graveyard");
  });
});

describe("round 343: Blue Mage's Cane", () => {
  it("the equipped creature attacks: a copy of an instant from defending player's graveyard, cast for {3}", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const bear = putOnBattlefield(s, ap, grizzlyBears());
    const staff = putOnBattlefield(s, ap, cane());
    s.objects[staff]!.attachedTo = bear;
    invalidateCharacteristics(s);
    const bolt = put(s, opp, lightningBolt(), "graveyard");
    const lands = untappedLands(s, ap);
    s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: bear, defender: opp }] });
    pend(s, "chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: bolt }] }), ap);
    expect(s.objects[bolt]!.zone).toBe("exile");
    // Which exiled card to copy and cast (only the one).
    const pick = pend(s, "chooseOption");
    expect(pick.options).toEqual([bolt, "none"]);
    expect(pick.prompt).toMatch(/by paying \{3\} rather than paying its mana cost/);
    s = act(s, { type: "chooseOption", player: ap, choice: bolt });
    const p = pend(s, "castFree");
    expect(p).toMatchObject({ how: "paid", pay: { kind: "mana", mana: "{3}" } });
    const copy = p.objectId;
    expect(copy).not.toBe(bolt);
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, copy, [{ kind: "player", id: opp }])), ap);
    expect(untappedLands(s, ap)).toBe(lands - 3);
    expect(s.players[opp]!.life).toBe(life - 3);
    // The card itself stays exiled; the copy is gone (CR 707.12, 704.5e).
    expect(s.objects[bolt]!.zone).toBe("exile");
    expect(s.objects[copy]?.zone ?? "gone").not.toBe("graveyard");
  });

  it("no target chosen: nothing is copied; the copy not cast ceases to exist", () => {
    const { s: s0, ap, opp } = setup([]);
    let s = s0;
    const bear = putOnBattlefield(s, ap, grizzlyBears());
    const staff = putOnBattlefield(s, ap, cane());
    s.objects[staff]!.attachedTo = bear;
    invalidateCharacteristics(s);
    const bolt = put(s, opp, lightningBolt(), "graveyard");
    s = act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks: [{ attacker: bear, defender: opp }] });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "none" }] }), ap);
    expect(s.pending).toBeNull();
    expect(s.objects[bolt]!.zone).toBe("graveyard");

    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    let t = t0;
    const bear2 = putOnBattlefield(t, ap2, grizzlyBears());
    const staff2 = putOnBattlefield(t, ap2, cane());
    t.objects[staff2]!.attachedTo = bear2;
    invalidateCharacteristics(t);
    const bolt2 = put(t, opp2, lightningBolt(), "graveyard");
    t = act(passUntil(t, "declareAttackers", ap2), { type: "declareAttackers", player: ap2, attacks: [{ attacker: bear2, defender: opp2 }] });
    t = settle(act(t, { type: "chooseTargets", player: ap2, targets: [{ kind: "object", id: bolt2 }] }), ap2);
    t = act(t, { type: "chooseOption", player: ap2, choice: bolt2 });
    const copy = pend(t, "castFree").objectId;
    t = settle(act(t, { type: "chooseMay", player: ap2, yes: false }), ap2);
    expect(t.objects[bolt2]!.zone).toBe("exile");
    expect(t.objects[copy]?.zone ?? "gone").not.toBe("exile");
    expect(t.players[ap2]!.exile.includes(copy)).toBe(false);
  });
});
