// Lane B round B122: mana abilities that remove a chosen number of counters (Kyren Toy, Petalmane Baku, Haruspex,
// Rasputin, the Oneiromancer), artifacts becoming tapped or their abilities activated without {T} (Haunting Wind,
// Powerleech, Artifact Possession), "can't be enchanted by other Auras" (Anti-Magic Aura, Consecrate Land), a ward with a
// choice of costs (Titania, Rugged Rumbler), noncombat damage to opponents during your turn once each turn (Molten
// Lavamancer) and a granted attack and block tax counting Clerics (Whipgrass Entangler).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, invalidateCharacteristics, isFullySupported, manaOptions, moveObject, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions of the players in `me` stop it, others the bots answer. */
const settle = (s: GameState, opts: { me?: PlayerId[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const life = (s: GameState, p: PlayerId) => s.players[p]!.life;
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
const pool = (s: GameState, pid: PlayerId, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  s.players[pid]!.manaPool = { ...s.players[pid]!.manaPool, ...mana };
};
/** Moves a new card for `def` into `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Only these cards in `pid`'s hand: the rest go to the library. */
const handOnly = (s: GameState, pid: PlayerId, keep: string[]) => {
  const p = s.players[pid]!;
  for (const id of p.hand.filter((x) => !keep.includes(x))) {
    s.objects[id]!.zone = "library";
    p.library.push(id);
  }
  p.hand = p.hand.filter((x) => keep.includes(x));
};
/** The active player passes; the next player gets priority with this mana (the stack is empty). */
const giveOpp = (s: GameState, ap: PlayerId, opp: PlayerId, mana: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  s = act(s, { type: "passPriority", player: ap });
  expect(waitingOn(s)).toBe(opp);
  pool(s, opp, mana);
  return s;
};

// Real oracle text (Scryfall).
const kyren = (): CardDef => ({"oracleId":"f1a0d112-9e1b-4354-bd7f-0051bff8f904","name":"Kyren Toy","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{1}, {T}: Put a charge counter on this artifact.\n{T}, Remove X charge counters from this artifact: Add an amount of {C} equal to X plus one.","colors":[],"colorIdentity":[],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const baku = (): CardDef => ({"oracleId":"f73f8eca-55fe-418f-a244-29ef82cfc47c","name":"Petalmane Baku","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Spirit","supertypes":[],"types":["Creature"],"subtypes":["Spirit"],"oracleText":"Whenever you cast a Spirit or Arcane spell, you may put a ki counter on this creature.\n{1}, Remove X ki counters from this creature: Add X mana of any one color.","power":"1","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const haruspex = (): CardDef => ({"oracleId":"2309436e-3442-46d7-8ffc-9dc4a2314ae9","name":"Haruspex","manaCost":"{3}{G}","cmc":4,"typeLine":"Creature — Tyranid","supertypes":[],"types":["Creature"],"subtypes":["Tyranid"],"oracleText":"Rapacious Hunger — Whenever another creature dies, put a +1/+1 counter on this creature.\nDevouring Monster — {T}, Remove X +1/+1 counters from this creature: Add X mana of any one color.","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":["Rapacious Hunger","Devouring Monster"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const rasputin = (): CardDef => ({"oracleId":"c16fd2b9-9147-43bc-aa08-6d1bddf1d3e8","name":"Rasputin, the Oneiromancer","manaCost":"{1}{W}{U}","cmc":3,"typeLine":"Legendary Creature — Human Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"When Rasputin enters, put a dream counter on it for each opponent you have. Each opponent creates a 1/1 red Goblin creature token.\n{T}, Remove one or more dream counters from Rasputin: Add that much {C}.\n{T}, Remove a dream counter from Rasputin: Create a 2/2 white Knight creature token with protection from red.","power":"4","toughness":"1","colors":["U","W"],"colorIdentity":["U","W"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const wind = (): CardDef => ({"oracleId":"cbd2d38b-6402-44b7-ba27-d854268e31d0","name":"Haunting Wind","manaCost":"{3}{B}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever an artifact becomes tapped or a player activates an artifact's ability without {T} in its activation cost, this enchantment deals 1 damage to that artifact's controller.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const leech = (): CardDef => ({"oracleId":"877d42be-f74d-4521-87b7-bb59824d0acc","name":"Powerleech","manaCost":"{G}{G}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever an artifact an opponent controls becomes tapped or an opponent activates an artifact's ability without {T} in its activation cost, you gain 1 life.","colors":["G"],"colorIdentity":["G"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const possession = (): CardDef => ({"oracleId":"5c641df8-97d7-484b-8d0e-790279fd6177","name":"Artifact Possession","manaCost":"{2}{B}","cmc":3,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant artifact\nWhenever enchanted artifact becomes tapped or a player activates an ability of enchanted artifact without {T} in its activation cost, this Aura deals 2 damage to that artifact's controller.","colors":["B"],"colorIdentity":["B"],"keywords":["Enchant"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const antiMagic = (): CardDef => ({"oracleId":"6f78c1e2-e38f-431b-8864-8aad982e9912","name":"Anti-Magic Aura","manaCost":"{2}{U}","cmc":3,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature can't be the target of spells and can't be enchanted by other Auras.","colors":["U"],"colorIdentity":["U"],"keywords":["Enchant"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const consecrate = (): CardDef => ({"oracleId":"4627691c-4ed4-4add-9cc3-2e019be2f9fd","name":"Consecrate Land","manaCost":"{W}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant land\nEnchanted land has indestructible and can't be enchanted by other Auras.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const titania = (): CardDef => ({"oracleId":"e380e37d-926b-4a4b-a275-7844bf4956d5","name":"Titania, Rugged Rumbler","manaCost":"{2}{B/G}","cmc":3,"typeLine":"Legendary Creature — Human Villain","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Villain"],"oracleText":"As an additional cost to cast this spell, discard a card or pay {2}.\nWard—Discard a card or pay {2}. (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player discards a card or pays {2}.)","power":"5","toughness":"5","colors":["B","G"],"colorIdentity":["B","G"],"keywords":["Ward"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const lavamancer = (): CardDef => ({"oracleId":"5fc60833-6e03-4bfa-833f-7d51c696db93","name":"Molten Lavamancer","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Elemental Warlock Villain","supertypes":[],"types":["Creature"],"subtypes":["Elemental","Warlock","Villain"],"oracleText":"Prowess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)\nWhenever a source you control deals noncombat damage to one or more of your opponents during your turn, you create a 1/1 red Elemental creature token. This ability triggers only once each turn.","power":"2","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":["Prowess"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const whipgrass = (): CardDef => ({"oracleId":"098bbee7-df65-4167-9c65-ffa14fc0c6cc","name":"Whipgrass Entangler","manaCost":"{2}{W}","cmc":3,"typeLine":"Creature — Human Cleric","supertypes":[],"types":["Creature"],"subtypes":["Human","Cleric"],"oracleText":"{1}{W}: Until end of turn, target creature gains \"This creature can't attack or block unless its controller pays {1} for each Cleric on the battlefield.\"","power":"1","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const shock = (): CardDef => ({"oracleId":"a9d288b8-cdc1-4e55-a0c9-d6edfc95e65d","name":"Shock","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Shock deals 2 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const holy = (): CardDef => ({"oracleId":"9357de36-f8be-4f49-b2c8-9fe9eaf82b07","name":"Holy Strength","manaCost":"{W}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature gets +1/+2.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const cleric = (): CardDef => ({"oracleId":"84a2a592-0e31-434f-b3b4-f2013d86f29d","name":"Cleric of the Forward Order","manaCost":"{1}{W}","cmc":2,"typeLine":"Creature — Human Cleric","supertypes":[],"types":["Creature"],"subtypes":["Human","Cleric"],"oracleText":"When this creature enters, you gain 2 life for each creature you control named Cleric of the Forward Order.","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const spellbomb = (): CardDef => ({"oracleId":"4b033a0a-c1ae-44d7-9662-72cbbfda024b","name":"Aether Spellbomb","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{U}, Sacrifice this artifact: Return target creature to its owner's hand.\n{1}, Sacrifice this artifact: Draw a card.","colors":[],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const prism = (): CardDef => ({"oracleId":"72e8d67a-41e6-4074-bcbd-b54ead995237","name":"Pentad Prism","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"Sunburst (This artifact enters with a charge counter on it for each color of mana spent to cast it.)\nRemove a charge counter from this artifact: Add one mana of any color.","colors":[],"colorIdentity":[],"keywords":["Sunburst"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const wildGrowth = (): CardDef => ({"oracleId":"706ae742-1807-44b7-a4fa-f2e26f61519a","name":"Wild Growth","manaCost":"{G}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}.","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const hourglass = (): CardDef => ({"oracleId":"7c59ad65-ad1f-4dc4-bcf2-ea6b2b48fad8","name":"Infinite Hourglass","manaCost":"{4}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"At the beginning of your upkeep, put a time counter on this artifact.\nAll creatures get +1/+0 for each time counter on this artifact.\n{3}: Remove a time counter from this artifact. Any player may activate this ability but only during any upkeep step.","colors":[],"colorIdentity":[],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;

describe("Lane B round B122", () => {
  it("compiles", () => supported(kyren(), baku(), haruspex(), rasputin(), wind(), leech(), possession(), antiMagic(), consecrate(), titania(), lavamancer(), whipgrass()));

  describe("removing X counters for mana (CR 107.3a, 605.1a)", () => {
    it("Kyren Toy: X charge counters for X plus one {C}, X from 0", () => {
      const { s, ap } = setup([]);
      const k = putOnBattlefield(s, ap, kyren());
      s.objects[k]!.counters.charge = 2;
      const options = manaOptions(s, s.objects[k]!).filter((x) => x.ability === 0);
      expect(options.map((x) => [x.removes, x.adds.join("")])).toEqual([[0, "C"], [1, "CC"], [2, "CCC"]]);
      const s1 = act(s, { type: "activateMana", player: ap, objectId: k, mana: "C", ability: 0, combo: 2 });
      expect(s1.players[ap]!.manaPool.C).toBe(3);
      expect(s1.objects[k]!.counters.charge ?? 0).toBe(0);
      expect(s1.objects[k]!.tapped).toBe(true);
      // Its other ability stores the counters: {1}, {T}.
      const s2 = act(s1, { type: "passPriority", player: ap });
      expect(s2.objects[k]!.counters.charge ?? 0).toBe(0);
    });

    it("Petalmane Baku: {1} and X ki counters for X mana of one color, without tapping", () => {
      const { s, ap } = setup([]);
      const b = putOnBattlefield(s, ap, baku());
      s.objects[b]!.counters.ki = 2;
      const options = manaOptions(s, s.objects[b]!).filter((x) => x.ability === 0);
      expect(options.map((x) => x.adds.join(""))).toEqual(["W", "U", "B", "R", "G", "WW", "UU", "BB", "RR", "GG"]);
      pool(s, ap, { C: 1 });
      const gg = options.find((x) => x.adds.join("") === "GG")!;
      const s1 = act(s, { type: "activateMana", player: ap, objectId: b, mana: gg.mana, ability: 0, combo: gg.combo });
      expect(s1.players[ap]!.manaPool).toMatchObject({ G: 2, C: 0 });
      expect(s1.objects[b]!.counters.ki ?? 0).toBe(0);
      expect(s1.objects[b]!.tapped).toBeFalsy();
      // No ki counters: nothing to activate.
      expect(manaOptions(s1, s1.objects[b]!).filter((x) => x.ability === 0)).toEqual([]);
    });

    it("Haruspex: its +1/+1 counters for mana of one color, and it shrinks", () => {
      const { s, ap } = setup([]);
      const h = putOnBattlefield(s, ap, haruspex(), { sick: false });
      s.objects[h]!.counters["+1/+1"] = 3;
      invalidateCharacteristics(s);
      const rrr = manaOptions(s, s.objects[h]!).find((x) => x.adds.join("") === "RRR")!;
      const s1 = act(s, { type: "activateMana", player: ap, objectId: h, mana: rrr.mana, ability: 0, combo: rrr.combo });
      expect(s1.players[ap]!.manaPool.R).toBe(3);
      expect(characteristics(s1, s1.objects[h]!).power).toBe(2);
      expect(s1.objects[h]!.tapped).toBe(true);
    });

    it("Rasputin: a dream counter for each opponent, one or more removed for that much {C}", () => {
      const { s, ap, ids } = setup([rasputin()]);
      let s1 = settle(run(s, planCast(s, ap, ids[0]!)));
      const r = ids[0]!;
      expect(s1.objects[r]!.counters.dream).toBe(3);
      s1.objects[r]!.controlledSinceTurn = -1;
      const options = manaOptions(s1, s1.objects[r]!).filter((x) => x.ability === 0);
      expect(options.map((x) => x.adds.join(""))).toEqual(["C", "CC", "CCC"]);
      s1 = act(s1, { type: "activateMana", player: ap, objectId: r, mana: "C", ability: 0, combo: 1 });
      expect(s1.players[ap]!.manaPool.C).toBe(2);
      expect(s1.objects[r]!.counters.dream).toBe(1);
    });
  });

  describe("artifacts tapped or activated without {T}", () => {
    it("Haunting Wind: tapping an artifact for mana, and an ability without {T}, each 1 damage to its controller", () => {
      const { s, ap, opp } = setup([]);
      putOnBattlefield(s, ap, wind());
      const ring = putOnBattlefield(s, opp, solRing());
      const myRing = putOnBattlefield(s, ap, solRing());
      const before = life(s, opp);
      // The opponent's Sol Ring, tapped for mana by its controller.
      let s1 = giveOpp(s, ap, opp, {});
      s1 = act(s1, { type: "activateMana", player: opp, objectId: ring, mana: "C", ability: 0 });
      expect(s1.triggerQueue).toHaveLength(1);
      s1 = settle(s1);
      expect(life(s1, opp)).toBe(before - 1);
      // My own too: anyone's artifact, damage to its controller.
      const mine = life(s1, ap);
      s1 = settle(act(s1, { type: "activateMana", player: waitingOn(s1)!, objectId: myRing, mana: "C", ability: 0 }));
      expect(life(s1, ap)).toBe(waitingOn(s) === ap ? mine - 1 : mine);
    });

    it("Haunting Wind: a {T} ability triggers it once (tapping), one without {T} once (activating), mana abilities too", () => {
      const { s, ap } = setup([]);
      putOnBattlefield(s, ap, wind());
      const bomb = putOnBattlefield(s, ap, spellbomb());
      const prism0 = putOnBattlefield(s, ap, prism());
      s.objects[prism0]!.counters.charge = 2;
      const before = life(s, ap);
      // Pentad Prism: "Remove a charge counter: Add one mana of any color", a mana ability without {T}.
      let s1 = act(s, { type: "activateMana", player: ap, objectId: prism0, mana: "R", ability: 0 });
      expect(s1.triggerQueue).toHaveLength(1);
      s1 = settle(s1);
      expect(life(s1, ap)).toBe(before - 1);
      // Aether Spellbomb: "{1}, Sacrifice this artifact: Draw a card": the artifact is gone, its controller as it last
      // existed is dealt the damage (CR 608.2h).
      pool(s1, ap, { C: 1 });
      s1 = run(s1, planActivate(s1, ap, bomb, 1));
      expect(zone(s1, bomb)).toBe("graveyard");
      s1 = settle(s1);
      expect(life(s1, ap)).toBe(before - 2);
    });

    it("Haunting Wind: a token sacrificed for its ability still hurts its last controller", () => {
      const { s, ap, opp } = setup([]);
      putOnBattlefield(s, ap, wind());
      const bomb = putOnBattlefield(s, opp, spellbomb());
      s.objects[bomb]!.isToken = true;
      const before = life(s, opp);
      let s1 = giveOpp(s, ap, opp, { C: 1 });
      s1 = run(s1, planActivate(s1, opp, bomb, 1));
      s1 = settle(s1);
      expect(s1.objects[bomb]?.zone ?? "gone").not.toBe("battlefield");
      expect(life(s1, opp)).toBe(before - 1);
    });

    it("Haunting Wind: an ability any player may activate hurts the artifact's controller, not the activator", () => {
      const { s, ap, opp } = setup([]);
      putOnBattlefield(s, ap, wind());
      const glass = putOnBattlefield(s, ap, hourglass());
      s.objects[glass]!.counters.time = 2;
      s.step = "upkeep";
      const [mine, theirs] = [life(s, ap), life(s, opp)];
      let s1 = giveOpp(s, ap, opp, { C: 3 });
      s1 = run(s1, planActivate(s1, opp, glass, 0));
      s1 = settle(s1);
      expect(s1.objects[glass]!.counters.time).toBe(1);
      expect(life(s1, ap)).toBe(mine - 1);
      expect(life(s1, opp)).toBe(theirs);
    });

    it("Powerleech: only an opponent's artifact tapped, or an opponent activating without {T}", () => {
      const { s, ap, opp } = setup([]);
      putOnBattlefield(s, ap, leech());
      const myRing = putOnBattlefield(s, ap, solRing());
      const theirRing = putOnBattlefield(s, opp, solRing());
      const theirPrism = putOnBattlefield(s, opp, prism());
      s.objects[theirPrism]!.counters.charge = 1;
      const before = life(s, ap);
      let s1 = settle(act(s, { type: "activateMana", player: ap, objectId: myRing, mana: "C", ability: 0 }));
      expect(life(s1, ap)).toBe(before);
      s1 = giveOpp(s1, ap, opp, {});
      s1 = act(s1, { type: "activateMana", player: opp, objectId: theirRing, mana: "C", ability: 0 });
      s1 = act(s1, { type: "activateMana", player: opp, objectId: theirPrism, mana: "G", ability: 0 });
      expect(s1.triggerQueue).toHaveLength(2);
      s1 = settle(s1);
      expect(life(s1, ap)).toBe(before + 2);
    });

    it("Artifact Possession: only the enchanted artifact, 2 damage to its controller", () => {
      const { s, ap, opp, ids } = setup([possession()]);
      const ring = putOnBattlefield(s, opp, solRing());
      const other = putOnBattlefield(s, opp, solRing());
      let s1 = settle(run(s, planCast(s, ap, ids[0]!, [tgt(ring)])));
      expect(s1.objects[ids[0]!]!.attachedTo).toBe(ring);
      const before = life(s1, opp);
      s1 = giveOpp(s1, ap, opp, {});
      s1 = act(s1, { type: "activateMana", player: opp, objectId: other, mana: "C", ability: 0 });
      expect(s1.triggerQueue).toHaveLength(0);
      s1 = settle(act(s1, { type: "activateMana", player: opp, objectId: ring, mana: "C", ability: 0 }));
      expect(life(s1, opp)).toBe(before - 2);
    });

    it("Artifact Possession: a bot puts it on an opponent's artifact", () => {
      const { s, ap, opp } = setup([]);
      const mine = putOnBattlefield(s, opp, solRing());
      const yours = putOnBattlefield(s, ap, solRing());
      const id = inHand(s, opp, possession());
      handOnly(s, opp, [id]);
      s.players[ap]!.hand = [];
      let s1 = passUntil(act(s, { type: "passPriority", player: ap }), "main1", opp);
      handOnly(s1, opp, [id]);
      pool(s1, opp, { B: 1, C: 2 });
      for (let i = 0; i < 60 && s1.objects[id]!.zone === "hand" && s1.activePlayer === opp && s1.step === "main1"; i++) {
        const p = s1.pending?.player ?? waitingOn(s1)!;
        for (const a of botActions(s1, p)) s1 = act(s1, a);
      }
      s1 = settle(s1);
      expect(s1.objects[id]!.zone).toBe("battlefield");
      expect(s1.objects[id]!.attachedTo).not.toBe(mine);
      expect(s1.objects[id]!.attachedTo === yours || s1.objects[s1.objects[id]!.attachedTo!]!.controller !== opp).toBe(true);
    });
  });

  describe("can't be enchanted by other Auras (CR 303.4, 704.5m)", () => {
    it("Anti-Magic Aura: other Auras already there go to the graveyard; it can't be the target of spells", () => {
      const { s, ap, ids } = setup([antiMagic(), shock()]);
      const c = putOnBattlefield(s, ap, card2("Grizzly Bears"));
      const h = putOnBattlefield(s, ap, holy());
      s.objects[h]!.attachedTo = c;
      invalidateCharacteristics(s);
      let s1 = settle(run(s, planCast(s, ap, ids[0]!, [tgt(c)])));
      expect(s1.objects[ids[0]!]!.attachedTo).toBe(c);
      expect(zone(s1, h)).toBe("graveyard");
      expect(zone(s1, ids[0]!)).toBe("battlefield");
      expect(planCast(s1, ap, ids[1]!, [tgt(c)])).toBeNull();
    });

    it("Consecrate Land: indestructible; an Aura put onto it without a spell can't choose it", () => {
      const { s, ap, ids } = setup([consecrate()]);
      const land = s.battlefield.find((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.name === "Plains")!;
      const wg = putOnBattlefield(s, ap, wildGrowth());
      s.objects[wg]!.attachedTo = land;
      invalidateCharacteristics(s);
      let s1 = settle(run(s, planCast(s, ap, ids[0]!, [tgt(land)])));
      expect(s1.objects[ids[0]!]!.attachedTo).toBe(land);
      expect(zone(s1, wg)).toBe("graveyard");
      expect(characteristics(s1, s1.objects[land]!).keywords).toContain("Indestructible");
      // Another Aura cast at it: a legal target (only the enchanting is barred), put into the graveyard once it resolves.
      const wg2 = inHand(s1, ap, wildGrowth());
      s1 = settle(run(s1, planCast(s1, ap, wg2, [tgt(land)])));
      expect(zone(s1, wg2)).toBe("graveyard");
      expect(s1.objects[ids[0]!]!.attachedTo).toBe(land);
    });
  });

  describe("Titania, Rugged Rumbler: Ward—Discard a card or pay {2}", () => {
    /** The opponent Shocks Titania (mine) with `cards` other cards in hand. */
    function shockTitania(cards: number) {
      const { s, ap, opp } = setup([]);
      const t = putOnBattlefield(s, ap, titania());
      const sh = inHand(s, opp, shock());
      const fillers = Array.from({ length: cards }, () => inHand(s, opp, holy()));
      handOnly(s, opp, [sh, ...fillers]);
      let s1 = giveOpp(s, ap, opp, { R: 1, C: 2 });
      s1 = run(s1, planCast(s1, opp, sh, [tgt(t)]));
      s1 = settle(s1, { me: [opp] });
      return { s: s1, ap, opp, t, sh, fillers };
    }

    it("the spell's controller chooses: pay {2}", () => {
      let { s, opp, t } = shockTitania(1);
      expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "unlessWay", options: ["0", "1", "none"], labels: ["Discard a card", "Pay {2}", "Pay neither"] });
      s = act(s, { type: "chooseOption", player: opp, choice: "1" });
      expect(s.pending).toMatchObject({ kind: "payUnless", player: opp, cost: "{2}" });
      s = settle(act(s, { type: "payUnless", player: opp, pay: true }));
      expect(s.objects[t]!.damage).toBe(2);
      expect(s.players[opp]!.hand).toHaveLength(1);
    });

    it("discard a card instead, or neither (countered); with no cards only the mana is offered", () => {
      let { s, opp, t, fillers } = shockTitania(1);
      s = act(s, { type: "chooseOption", player: opp, choice: "0" });
      expect(s.pending).toMatchObject({ kind: "payUnless", player: opp, discard: 1 });
      // Their only card: nothing to choose.
      s = settle(act(s, { type: "payUnless", player: opp, pay: true }));
      expect(zone(s, fillers[0]!)).toBe("graveyard");
      expect(s.objects[t]!.damage).toBe(2);
      let n = shockTitania(1);
      const s2 = settle(act(n.s, { type: "chooseOption", player: n.opp, choice: "none" }));
      expect(s2.objects[n.t]!.damage).toBe(0);
      expect(zone(s2, n.sh)).toBe("graveyard");
      n = shockTitania(0);
      expect(n.s.pending).toMatchObject({ kind: "chooseOption", what: "unlessWay", options: ["1", "none"] });
    });

    it("a bot pays the mana when it can", () => {
      let { s, opp, t } = shockTitania(1);
      s = settle(s);
      expect(s.objects[t]!.damage).toBe(2);
      expect(s.players[opp]!.hand).toHaveLength(1);
    });
  });

  describe("Molten Lavamancer", () => {
    it("noncombat damage to an opponent during your turn: one token, only once each turn", () => {
      const { s, ap, opp, ids } = setup([shock(), shock()]);
      putOnBattlefield(s, ap, lavamancer());
      const elementals = (st: GameState) => st.battlefield.filter((id) => st.objects[id]!.controller === ap && /Elemental/.test(st.cards[st.objects[id]!.cardId]!.name)).length;
      let s1 = settle(run(s, planCast(s, ap, ids[0]!, [player(opp)])));
      expect(elementals(s1)).toBe(1);
      s1 = settle(run(s1, planCast(s1, ap, ids[1]!, [player(opp)])));
      expect(elementals(s1)).toBe(1);
    });

    it("not during an opponent's turn, nor for damage to yourself", () => {
      const { s, ap, opp, ids } = setup([shock()]);
      putOnBattlefield(s, opp, lavamancer());
      const theirs = (st: GameState) => st.battlefield.filter((id) => st.objects[id]!.controller === opp && st.objects[id]!.isToken).length;
      // The opponent's Shock on my turn: their source, but not their turn.
      const sh = inHand(s, opp, shock());
      let s1 = giveOpp(s, ap, opp, { R: 1 });
      s1 = settle(run(s1, planCast(s1, opp, sh, [player(ap)])));
      expect(theirs(s1)).toBe(0);
      // Mine at their face does nothing for them either.
      s1 = settle(run(s1, planCast(s1, ap, ids[0]!, [player(opp)])));
      expect(theirs(s1)).toBe(0);
    });
  });

  describe("Whipgrass Entangler", () => {
    it("the creature costs {1} for each Cleric on the battlefield to attack or block, and twice is twice", () => {
      const { s, ap, opp } = setup([]);
      const w = putOnBattlefield(s, ap, whipgrass(), { sick: false });
      putOnBattlefield(s, opp, cleric());
      const bear = putOnBattlefield(s, opp, card2("Grizzly Bears"));
      pool(s, ap, { W: 2, C: 2 });
      let s1 = settle(run(s, planActivate(s, ap, w, 0, [tgt(bear)])));
      let c = characteristics(s1, s1.objects[bear]!);
      expect([c.ownAttackTax, c.ownBlockTax]).toEqual([2, 2]);
      s1 = settle(run(s1, planActivate(s1, ap, w, 0, [tgt(bear)])));
      c = characteristics(s1, s1.objects[bear]!);
      expect([c.ownAttackTax, c.ownBlockTax]).toEqual([4, 4]);
      // Counted as it applies: one Cleric fewer, {1} less each.
      moveObject(s1, w, "graveyard");
      invalidateCharacteristics(s1);
      c = characteristics(s1, s1.objects[bear]!);
      expect([c.ownAttackTax, c.ownBlockTax]).toEqual([2, 2]);
    });
  });
});

function card2(name: string): CardDef {
  return { oracleId: `test-${name}`, name, manaCost: "{1}{G}", cmc: 2, typeLine: "Creature — Bear", supertypes: [], types: ["Creature"], subtypes: ["Bear"], oracleText: "", power: "2", toughness: "2", colors: ["G"], colorIdentity: ["G"], keywords: [], commanderLegal: "legal", layout: "normal" } as CardDef;
}
