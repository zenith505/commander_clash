// Lane B round B215: Reweave (its controller sacrifices the target, then reveals until a permanent card sharing a card
// type with it, which enters under their control), Necrotic Plague (when the enchanted creature dies, its controller
// chooses a creature one of their opponents controls, and the Plague returns attached to it under its controller's
// control), Cleansing (each player in turn may pay 1 life for any of the lands; every land no one pays for is
// destroyed) and Hypergenesis (Eureka with artifact, creature, enchantment or land cards only).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const reweave = (): CardDef => ({"oracleId":"744d6daa-2f93-43e1-88c0-0d9d5f9d111b","name":"Reweave","manaCost":"{5}{U}","cmc":6,"typeLine":"Instant — Arcane","supertypes":[],"types":["Instant"],"subtypes":["Arcane"],"oracleText":"Target permanent's controller sacrifices it. If the player does, they reveal cards from the top of their library until they reveal a permanent card that shares a card type with the sacrificed permanent, put that card onto the battlefield, then shuffle.\nSplice onto Arcane {2}{U}{U} (As you cast an Arcane spell, you may reveal this card from your hand and pay its splice cost. If you do, add this card's effects to that spell.)","colors":["U"],"colorIdentity":["U"],"keywords":["Splice"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4ff68016-80b4-4801-b796-5c5fdbc8faa1.jpg?1783944322","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4ff68016-80b4-4801-b796-5c5fdbc8faa1.jpg?1783944322","commanderLegal":"legal","set":"chk","releasedAt":"2004-10-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const necroticPlague = (): CardDef => ({"oracleId":"9d637892-26d7-46f1-bd7d-89bda523f649","name":"Necrotic Plague","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature has \"At the beginning of your upkeep, sacrifice this creature.\"\nWhen enchanted creature dies, its controller chooses target creature one of their opponents controls. Return this card from its owner's graveyard to the battlefield attached to that creature.","colors":["B"],"colorIdentity":["B"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/2/e/2e7573a8-be2b-46a5-8862-db0980968088.jpg?1783941813","artUrl":"https://cards.scryfall.io/art_crop/front/2/e/2e7573a8-be2b-46a5-8862-db0980968088.jpg?1783941813","commanderLegal":"legal","set":"m11","releasedAt":"2010-07-16","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const cleansing = (): CardDef => ({"oracleId":"46b83657-1699-4162-a4bb-b792da396fe6","name":"Cleansing","manaCost":"{W}{W}{W}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"For each land, destroy that land unless any player pays 1 life.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/c/fc1973a3-1410-4c6d-9b09-bd9d18646a1e.jpg?1783947949","artUrl":"https://cards.scryfall.io/art_crop/front/f/c/fc1973a3-1410-4c6d-9b09-bd9d18646a1e.jpg?1783947949","commanderLegal":"legal","set":"drk","releasedAt":"1994-08-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const serraAngel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const island = (): CardDef => ({"oracleId":"b2c6aa39-2d2a-459c-a555-fb48ba993373","name":"Island","manaCost":"","cmc":0,"typeLine":"Basic Land — Island","supertypes":["Basic"],"types":["Land"],"subtypes":["Island"],"oracleText":"({T}: Add {U}.)","colors":[],"colorIdentity":["U"],"keywords":[],"producedMana":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const mountain = (): CardDef => ({"oracleId":"a3fb7228-e76b-4e96-a40e-20b5fed75685","name":"Mountain","manaCost":"","cmc":0,"typeLine":"Basic Land — Mountain","supertypes":["Basic"],"types":["Land"],"subtypes":["Mountain"],"oracleText":"({T}: Add {R}.)","colors":[],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666","artUrl":"https://cards.scryfall.io/art_crop/front/2/a/2a844b96-6616-4c39-8f4f-5d14a3b2bd55.jpg?1785981666","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","artUrl":"https://cards.scryfall.io/art_crop/front/8/e/8ee443cc-e17a-493b-9c93-1f9e141a30e4.jpg?1789644446","commanderLegal":"legal","set":"frc","releasedAt":"2026-10-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const hypergenesis = (): CardDef => ({"oracleId":"cf288b0a-a343-4ef7-ba02-4f83a6dabeaf","name":"Hypergenesis","manaCost":"","cmc":0,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Suspend 3—{1}{G}{G}\nStarting with you, each player may put an artifact, creature, enchantment, or land card from their hand onto the battlefield. Repeat this process until no one puts a card onto the battlefield.","colors":["G"],"colorIdentity":["G"],"keywords":["Suspend"],"imageUrl":"https://cards.scryfall.io/normal/front/d/a/da4d6969-e579-4b28-a76b-5a99c7488f15.jpg?1783943211","artUrl":"https://cards.scryfall.io/art_crop/front/d/a/da4d6969-e579-4b28-a76b-5a99c7488f15.jpg?1783943211","commanderLegal":"legal","set":"tsp","releasedAt":"2006-10-06","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ajaniGoldmane = (): CardDef => ({"oracleId":"dfb5f660-fd8b-4b7b-934c-6a71cd182f15","name":"Ajani Goldmane","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Legendary Planeswalker — Ajani","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Ajani"],"oracleText":"+1: You gain 2 life.\n−1: Put a +1/+1 counter on each creature you control. Those creatures gain vigilance until end of turn.\n−6: Create a white Avatar creature token. It has \"This token's power and toughness are each equal to your life total.\"","loyalty":"4","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/a/2a1470a6-d09d-4a2a-84a6-d56e32ed237a.jpg?1783942919","artUrl":"https://cards.scryfall.io/art_crop/front/2/a/2a1470a6-d09d-4a2a-84a6-d56e32ed237a.jpg?1783942919","commanderLegal":"legal","set":"lrw","releasedAt":"2007-10-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Passes and lets bots answer until the stack is empty or one of `me` has a question. */
const settle = (s: GameState, me: PlayerId[] = []) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && !me.includes(p.player)) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const life = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const nextOf = (s: GameState, pid: PlayerId, k: number) => s.turnOrder[(s.turnOrder.indexOf(pid) + k) % s.turnOrder.length]!;
const castNow = (s: GameState, pid: PlayerId, id: string, targets: TargetChoice[] = []) => run(s, planCast(s, pid, id, targets));
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === name);
const landsOf = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.types.includes("Land"));

describe("Lane B round B215", () => {
  it("are fully supported", () => {
    supported(reweave(), necroticPlague(), cleansing(), hypergenesis());
  });

  it("Reweave: the target's controller sacrifices it, then reveals until a permanent card sharing a card type with it, which enters under their control", () => {
    const { s: s0, ap, ids } = setup([reweave()]);
    const b = nextOf(s0, ap, 1);
    const giant = putOnBattlefield(s0, b, hillGiant());
    const before = s0.players[b]!.library.length;
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(giant)]));
    expect(zone(s, giant)).toBe("graveyard");
    // The libraries are Forests and Bears: the first creature card revealed enters under B's control.
    const fresh = s.battlefield.filter((id) => s.objects[id]!.controller === b && id !== giant);
    expect(fresh).toHaveLength(1);
    expect(s.cards[s.objects[fresh[0]!]!.cardId]!.types).toContain("Creature");
    expect(s.objects[fresh[0]!]!.owner).toBe(b);
    expect(s.players[b]!.library.length).toBe(before - 1);
  });

  it("Reweave: with no permanent card sharing a card type (an artifact against Forests and Bears), nothing enters and the library is all revealed", () => {
    const { s: s0, ap, ids } = setup([reweave()]);
    const b = nextOf(s0, ap, 1);
    const ring = putOnBattlefield(s0, b, solRing());
    const before = s0.players[b]!.library.length;
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(ring)]));
    expect(zone(s, ring)).toBe("graveyard");
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === b)).toHaveLength(0);
    expect(s.players[b]!.library.length).toBe(before);
  });

  it("Reweave: its own controller's permanent works too (a land sacrificed finds a land)", () => {
    const { s: s0, ap, ids } = setup([reweave()]);
    const isl = named(s0, ap, "Island")[0]!;
    const lands0 = landsOf(s0, ap).length;
    const s = settle(castNow(s0, ap, ids[0]!, [tgt(isl)]));
    expect(zone(s, isl)).toBe("graveyard");
    expect(landsOf(s, ap).length).toBe(lands0);
    expect(named(s, ap, "Forest").length).toBe(named(s0, ap, "Forest").length + 1);
  });

  it("Necrotic Plague: when the enchanted creature dies, its controller chooses a creature one of their opponents controls, and the Plague returns attached to it under its own controller's control", () => {
    const { s: s0, ap, ids } = setup([necroticPlague(), lightningBolt()]);
    const b = nextOf(s0, ap, 1);
    const c = nextOf(s0, ap, 2);
    const bears = putOnBattlefield(s0, b, grizzlyBears());
    const bOther = putOnBattlefield(s0, b, serraAngel());
    const cGiant = putOnBattlefield(s0, c, hillGiant());
    const mine = putOnBattlefield(s0, ap, grizzlyBears());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(bears)]));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(bears);
    s = settle(castNow(s, ap, ids[1]!, [tgt(bears)]), [b]);
    expect(zone(s, bears)).toBe("graveyard");
    // B, the dead creature's controller, chooses the target: one of their opponents' creatures (A's are fine too).
    const p = s.pending;
    expect(p?.kind === "chooseTargets" && p.player).toBe(b);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(() => applyAction(s, { type: "chooseTargets", player: b, targets: [tgt(bOther)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: b, targets: [tgt(cGiant)] }));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.objects[ids[0]!]!.attachedTo).toBe(cGiant);
    expect(s.objects[ids[0]!]!.controller).toBe(ap);
    expect(zone(s, mine)).toBe("battlefield");
  });

  it("Necrotic Plague: a bot choosing aims it at its opponents' most valuable creature; with no creature to choose, the Plague stays in the graveyard", () => {
    const { s: s0, ap, ids } = setup([necroticPlague(), lightningBolt()]);
    const b = nextOf(s0, ap, 1);
    const bears = putOnBattlefield(s0, b, grizzlyBears());
    const angel = putOnBattlefield(s0, nextOf(s0, ap, 3), serraAngel());
    putOnBattlefield(s0, nextOf(s0, ap, 2), grizzlyBears());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(bears)]));
    s = settle(castNow(s, ap, ids[1]!, [tgt(bears)]));
    expect(s.objects[ids[0]!]!.attachedTo).toBe(angel);

    const { s: t0, ap: a2, ids: ids2 } = setup([necroticPlague(), lightningBolt()]);
    const b2 = nextOf(t0, a2, 1);
    const lone = putOnBattlefield(t0, b2, grizzlyBears());
    let t = settle(castNow(t0, a2, ids2[0]!, [tgt(lone)]));
    t = settle(castNow(t, a2, ids2[1]!, [tgt(lone)]));
    expect(zone(t, lone)).toBe("graveyard");
    expect(zone(t, ids2[0]!)).toBe("graveyard");
  });

  it("Necrotic Plague: the enchanted creature's controller sacrifices it at their upkeep", () => {
    const { s: s0, ap, ids } = setup([necroticPlague()]);
    const b = nextOf(s0, ap, 1);
    const bears = putOnBattlefield(s0, b, grizzlyBears());
    const giant = putOnBattlefield(s0, ap, hillGiant());
    let s = settle(castNow(s0, ap, ids[0]!, [tgt(bears)]));
    for (let i = 0; i < 2000 && !(s.activePlayer === b && zone(s, bears) === "graveyard"); i++) {
      const p = s.pending;
      if (p) for (const a of botActions(s, p.player)) s = act(s, a);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    s = settle(s);
    expect(zone(s, bears)).toBe("graveyard");
    // B's only opponent creature is A's Hill Giant: the Plague comes back on it, still A's.
    expect(s.objects[ids[0]!]!.attachedTo).toBe(giant);
    expect(s.objects[ids[0]!]!.controller).toBe(ap);
  });

  it("Cleansing: each player in turn pays 1 life for any of the lands not paid for yet; the rest are destroyed at once", () => {
    const { s: s0, ap, ids } = setup([cleansing()]);
    const b = nextOf(s0, ap, 1);
    const c = nextOf(s0, ap, 2);
    const bIsl = putOnBattlefield(s0, b, island());
    const bMtn = putOnBattlefield(s0, b, mountain());
    const myIslands = named(s0, ap, "Island");
    const myMtn = named(s0, ap, "Mountain")[0]!;
    let s = settle(castNow(s0, ap, ids[0]!), [ap, b, c, nextOf(s0, ap, 3)]);
    // The caster is the active player: first.
    let p = s.pending;
    expect(p?.kind === "pickPermanents" && p.player).toBe(ap);
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: myIslands }), [ap, b, c, nextOf(s0, ap, 3)]);
    p = s.pending;
    expect(p?.kind === "pickPermanents" && p.player).toBe(b);
    // Lands already paid for aren't offered again; anyone's lands are.
    expect(p?.kind === "pickPermanents" && p.options.some((id) => myIslands.includes(id))).toBe(false);
    expect(p?.kind === "pickPermanents" && p.options.includes(myMtn)).toBe(true);
    s = settle(act(s, { type: "pickPermanents", player: b, ids: [bIsl, myMtn] }), [ap, b, c, nextOf(s0, ap, 3)]);
    for (const pid of [c, nextOf(s0, ap, 3)]) {
      p = s.pending;
      expect(p?.kind === "pickPermanents" && p.player).toBe(pid);
      s = settle(act(s, { type: "pickPermanents", player: pid, ids: [] }), [ap, b, c, nextOf(s0, ap, 3)]);
    }
    expect(s.pending).toBeNull();
    expect(life(s, ap)).toBe(life(s0, ap) - myIslands.length);
    expect(life(s, b)).toBe(life(s0, b) - 2);
    expect(landsOf(s, ap).sort()).toEqual([...myIslands, myMtn].sort());
    expect(landsOf(s, b)).toEqual([bIsl]);
    expect(zone(s, bMtn)).toBe("graveyard");
  });

  it("Cleansing: no more lands than the life a player can pay; bots pay only for their own lands and keep 6 life", () => {
    const { s: s0, ap, ids } = setup([cleansing()]);
    const b = nextOf(s0, ap, 1);
    for (let i = 0; i < 4; i++) putOnBattlefield(s0, b, island());
    s0.players[ap]!.life = 3;
    s0.players[b]!.life = 8;
    let s = settle(castNow(s0, ap, ids[0]!), [ap]);
    const p = s.pending;
    expect(p?.kind === "pickPermanents" && p.player === ap && p.count).toBe(3);
    expect(() => applyAction(s, { type: "pickPermanents", player: ap, ids: landsOf(s, ap).slice(0, 4) })).toThrow();
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [] }));
    // B paid for two of its Islands (8 life down to 6), and no one else's.
    expect(life(s, b)).toBe(6);
    expect(landsOf(s, b)).toHaveLength(2);
    expect(landsOf(s, ap)).toHaveLength(0);
  });

  it("Hypergenesis: cast from suspend, each player in turn may put an artifact, creature, enchantment or land card from their hand onto the battlefield, not a planeswalker", () => {
    const { s: s0, ap } = setup([]);
    // Opponents' hands emptied into their libraries.
    for (const pid of s0.turnOrder.filter((p) => p !== ap)) {
      const pl = s0.players[pid]!;
      for (const id of pl.hand) s0.objects[id]!.zone = "library";
      pl.library.push(...pl.hand);
      pl.hand = [];
    }
    const hyper = putOnBattlefield(s0, ap, hypergenesis());
    s0.battlefield.splice(s0.battlefield.indexOf(hyper), 1);
    s0.objects[hyper]!.zone = "exile";
    s0.players[ap]!.exile.push(hyper);
    s0.objects[hyper]!.counters.time = 1;
    const toHand = (def: CardDef) => {
      const id = putOnBattlefield(s0, ap, def);
      s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
      s0.objects[id]!.zone = "hand";
      s0.players[ap]!.hand.push(id);
      return id;
    };
    for (const id of [...s0.players[ap]!.hand]) {
      s0.objects[id]!.zone = "library";
      s0.players[ap]!.library.push(id);
    }
    s0.players[ap]!.hand = [];
    const giant = toHand(hillGiant());
    const ajani = toHand(ajaniGoldmane());
    const bolt = toHand(lightningBolt());
    invalidateCharacteristics(s0);
    let s = s0;
    // To your next upkeep: the last time counter comes off and you may cast it for free.
    for (let i = 0; i < 3000 && !(s.pending?.kind === "castFree" && s.pending.player === ap); i++) {
      const p = s.pending;
      if (p) for (const a of botActions(s, p.player)) s = act(s, a);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.pending?.kind).toBe("castFree");
    s = act(s, { type: "castSpell", player: ap, objectId: hyper, targets: [] });
    for (let i = 0; i < 50 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const p = s.pending;
    expect(p).toMatchObject({ kind: "searchLibrary", player: ap, fromHand: true, max: 1 });
    // Hill Giant is offered; Ajani Goldmane (a planeswalker card) and Lightning Bolt aren't.
    expect(p?.kind === "searchLibrary" && p.cards).toEqual([giant]);
    s = act(s, { type: "searchLibrary", player: ap, found: [giant] });
    expect(zone(s, giant)).toBe("battlefield");
    // The others have nothing to put, and the next time around neither do you: it's over.
    s = settle(s);
    expect(zone(s, ajani)).toBe("hand");
    expect(zone(s, bolt)).toBe("hand");
    expect(zone(s, hyper)).toBe("graveyard");
  });
});
