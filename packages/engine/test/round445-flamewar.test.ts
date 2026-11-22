// Round 445 (Lane A): Flamewar, Brash Veteran // Flamewar, Streetwise Operative ("Sacrifice another artifact: Put a +1/+1
// counter on Flamewar and convert it. Activate only as a sorcery.", "{1}, Discard your hand: Put all exiled cards you own
// with intel counters on them into your hand." and "Whenever Flamewar deals combat damage to a player, exile that many
// cards from the top of your library face down. Put an intel counter on each of them. Convert Flamewar.": CR 701.28,
// 406.3, 122.1, 510.2; rulings).

import { describe, expect, it } from "vitest";
import { act, activate, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, compileCard, faceDef, invalidateCharacteristics, isFullySupported, restingDef, waitingOn, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const flamewar = (): CardDef => ({"oracleId":"cf812f1e-f48a-4375-8d2c-f6e3cb82e067","name":"Flamewar, Brash Veteran // Flamewar, Streetwise Operative","manaCost":"{1}{B}{R}","cmc":3,"typeLine":"Legendary Artifact Creature — Robot // Legendary Artifact — Vehicle","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Robot"],"oracleText":"More Than Meets the Eye {B}{R} (You may cast this card converted for {B}{R}.)\nSacrifice another artifact: Put a +1/+1 counter on Flamewar and convert it. Activate only as a sorcery.\n{1}, Discard your hand: Put all exiled cards you own with intel counters on them into your hand.","power":"3","toughness":"2","colors":["B","R"],"colorIdentity":["B","R"],"keywords":["Living metal","Convert","Menace","More Than Meets the Eye","Deathtouch"],"imageUrl":"https://cards.scryfall.io/normal/front/8/7/876d9732-9201-4327-8748-7c87ec55453f.jpg?1783919904","artUrl":"https://cards.scryfall.io/art_crop/front/8/7/876d9732-9201-4327-8748-7c87ec55453f.jpg?1783919904","commanderLegal":"legal","set":"bot","releasedAt":"2022-11-18","rarity":"mythic","layout":"transform","gameChanger":false,"faces":[{"name":"Flamewar, Brash Veteran","manaCost":"{1}{B}{R}","typeLine":"Legendary Artifact Creature — Robot","supertypes":["Legendary"],"types":["Artifact","Creature"],"subtypes":["Robot"],"oracleText":"More Than Meets the Eye {B}{R} (You may cast this card converted for {B}{R}.)\nSacrifice another artifact: Put a +1/+1 counter on Flamewar and convert it. Activate only as a sorcery.\n{1}, Discard your hand: Put all exiled cards you own with intel counters on them into your hand.","power":"3","toughness":"2","colors":["B","R"],"imageUrl":"https://cards.scryfall.io/normal/front/8/7/876d9732-9201-4327-8748-7c87ec55453f.jpg?1783919904","artUrl":"https://cards.scryfall.io/art_crop/front/8/7/876d9732-9201-4327-8748-7c87ec55453f.jpg?1783919904"},{"name":"Flamewar, Streetwise Operative","manaCost":"","typeLine":"Legendary Artifact — Vehicle","supertypes":["Legendary"],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"Living metal (During your turn, this Vehicle is also a creature.)\nMenace, deathtouch\nWhenever Flamewar deals combat damage to a player, exile that many cards from the top of your library face down. Put an intel counter on each of them. Convert Flamewar.","power":"2","toughness":"1","colors":["B","R"],"colorIndicator":["B","R"],"imageUrl":"https://cards.scryfall.io/normal/back/8/7/876d9732-9201-4327-8748-7c87ec55453f.jpg?1783919904","artUrl":"https://cards.scryfall.io/art_crop/back/8/7/876d9732-9201-4327-8748-7c87ec55453f.jpg?1783919904"}]}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

/** A new card for `def` in `pid`'s exile, with these counters on it, face down or not. */
const inExile = (s: GameState, pid: PlayerId, def: CardDef, counters: Record<string, number>, faceDown = false) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "exile";
  s.objects[id]!.counters = { ...counters };
  if (faceDown) s.objects[id]!.hiddenExile = { by: "test", seen: [], label: "Face down" };
  s.players[pid]!.exile.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** A new card for `def` in `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Everyone passes until the stack is empty or `me` is asked something; bots answer the others. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const name = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).name;

describe("round 445: Flamewar, Brash Veteran", () => {
  it("is fully supported, both faces", () => {
    expect(isFullySupported(flamewar())).toBe(true);
    const d = restingDef(flamewar());
    const front = compileCard(faceDef(d, 0));
    expect(front.unsupported).toEqual([]);
    expect(front.activated.map((a) => a.body.effects.map((e) => e.type))).toEqual([["counters", "transform"], ["exiledWithCounterToHand"]]);
    expect(front.activated[0]).toMatchObject({ sorcerySpeed: true, costs: [{ kind: "sacrifice", other: true, filter: { types: ["Artifact"] } }] });
    expect(front.activated[1]).toMatchObject({ manaCost: "{1}", discardHand: true });
    const back = compileCard(faceDef(d, 1));
    expect(back.unsupported).toEqual([]);
    expect(back.triggers[0]).toMatchObject({ event: "selfDealsCombatDamageToPlayer", body: { effects: [{ type: "exileFaceDown", from: "top", n: { count: { kind: "eventAmount" } }, counter: "intel" }, { type: "transform", convert: true }] } });
  });

  it("sacrificing another artifact puts a +1/+1 counter on it and converts it", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, flamewar());
    const ring = putOnBattlefield(s0, ap, solRing());
    expect(name(s0, f)).toBe("Flamewar, Brash Veteran");
    const s = settle(act(s0, { type: "activateAbility", player: ap, objectId: f, index: 0, costs: { sacrifice: [ring] } }), ap);
    expect(s.objects[ring]!.zone).toBe("graveyard");
    expect(s.objects[f]!.counters["+1/+1"]).toBe(1);
    expect(s.objects[f]!.face).toBe(1);
    expect(name(s, f)).toBe("Flamewar, Streetwise Operative");
    // Living metal: a creature during its controller's turn (CR 702.161a), with the counter (rulings: counters stay).
    expect(characteristics(s, s.objects[f]!).types).toContain("Creature");
  });

  it("can't be activated with no other artifact to sacrifice", () => {
    const { s, ap } = setup([]);
    const f = putOnBattlefield(s, ap, flamewar());
    expect(() => activate(s, ap, f, 0)).toThrow();
  });

  it("dealing combat damage exiles that many cards face down with intel counters, then converts back", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, flamewar());
    s0.objects[f]!.face = 1;
    s0.objects[f]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    const top = s0.players[ap]!.library.slice(0, 4);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: f, defender: opp }] });
    // No blocks (a 3/2 with menace and deathtouch); the trigger resolves.
    s = settle(s, ap);
    for (let i = 0; i < 20 && s.step !== "endCombat" && s.step !== "main2"; i++) s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }), ap);
    expect(s.players[opp]!.life).toBe(37);
    // That many: the 3 damage dealt (CR 510.2).
    const exiled = top.slice(0, 3);
    for (const id of exiled) {
      const o = s.objects[id]!;
      expect(o.zone).toBe("exile");
      expect(o.counters.intel).toBe(1);
      // Nobody may look at them, its controller included (rulings).
      expect(o.hiddenExile?.seen).toEqual([]);
    }
    expect(s.objects[top[3]!]!.zone).toBe("library");
    expect(s.objects[f]!.face ?? 0).toBe(0);
    expect(name(s, f)).toBe("Flamewar, Brash Veteran");
    expect(s.objects[f]!.counters["+1/+1"]).toBe(1);
  });

  it("{1}, Discard your hand: every exiled card you own with an intel counter, face down too, goes to your hand", () => {
    const { s: s0, ap, opp } = setup([]);
    const f = putOnBattlefield(s0, ap, flamewar());
    const kept = inHand(s0, ap, bolt());
    const a = inExile(s0, ap, bolt(), { intel: 1 }, true);
    const b = inExile(s0, ap, solRing(), { intel: 2 });
    const plain = inExile(s0, ap, solRing(), {});
    const theirs = inExile(s0, opp, bolt(), { intel: 1 }, true);
    const s = settle(activate(s0, ap, f, 1), ap);
    expect(s.objects[kept]!.zone).toBe("graveyard");
    expect(s.objects[a]!.zone).toBe("hand");
    expect(s.objects[a]!.hiddenExile).toBeUndefined();
    expect(s.objects[b]!.zone).toBe("hand");
    expect(s.objects[plain]!.zone).toBe("exile");
    expect(s.objects[theirs]!.zone).toBe("exile");
    expect(s.players[ap]!.hand).toEqual(expect.arrayContaining([a, b]));
    expect(s.players[ap]!.hand.length).toBe(2);
    // The face-down card's name stays hidden from the other players.
    expect(s.log.filter((l) => l.to === undefined).some((l) => l.text.includes("a face-down card") && !l.text.includes("Lightning Bolt"))).toBe(true);
  });

  it("with an empty hand and no intel cards, it can still be activated and does nothing", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, flamewar());
    const s = settle(activate(s0, ap, f, 1), ap);
    expect(s.players[ap]!.hand.length).toBe(0);
  });

  it("bots: back to hand in their second main phase once that's two more cards than their hand; never sacrifice a nontoken artifact", () => {
    const { s: s0, ap } = setup([]);
    const f = putOnBattlefield(s0, ap, flamewar());
    putOnBattlefield(s0, ap, solRing());
    for (let i = 0; i < 3; i++) inExile(s0, ap, bolt(), { intel: 1 }, true);
    s0.players[ap]!.hand = [];
    /** The bot's actions in this step until it passes with the stack empty: did it activate this ability? */
    const uses = (s: GameState, index: number) => {
      let used = false;
      for (let i = 0; i < 40; i++) {
        if (s.pending) {
          for (const a of botActions(s, s.pending.player)) s = act(s, a);
          continue;
        }
        const acts = botActions(s, waitingOn(s)!);
        if (acts.some((a) => a.type === "activateAbility" && a.objectId === f && a.index === index)) used = true;
        if (!s.stack.length && acts[0]?.type === "passPriority" && waitingOn(s) === ap) return used;
        for (const a of acts) s = act(s, a);
      }
      return used;
    };
    expect(uses(s0, 0)).toBe(false);
    expect(uses(s0, 1)).toBe(false);
    const s1 = passUntil(s0, "main2", ap);
    s1.players[ap]!.hand = [];
    expect(uses(s1, 1)).toBe(true);
  });
});
