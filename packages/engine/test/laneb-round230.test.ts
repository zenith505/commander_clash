// Lane B round B230: Bone Shaman (creatures it dealt damage to this turn can't be regenerated), Sea Troll (regenerate only
// if it blocked or was blocked by a blue creature this turn), Glyph of Reincarnation (the creatures a Wall blocked this turn
// destroyed, creature cards returned from their controllers' graveyards) and Infinite Authority (destroy the creature at end
// of combat, then a +1/+1 counter if it was destroyed).

import { describe, expect, it } from "vitest";
import { act, bear, forest, island, putOnBattlefield, setup, swamp, target } from "./helpers";
import { botActions, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const boneShaman = (): CardDef => ({"oracleId":"690ba846-964e-44ba-8637-9a1ce62f5931","name":"Bone Shaman","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Creature — Giant Shaman","supertypes":[],"types":["Creature"],"subtypes":["Giant","Shaman"],"oracleText":"{B}: Until end of turn, this creature gains \"Creatures dealt damage by this creature this turn can't be regenerated this turn.\"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["B","R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/a/0a5e3d54-4dc4-482b-8ecc-bb819ba03d2c.jpg?1783947492","artUrl":"https://cards.scryfall.io/art_crop/front/0/a/0a5e3d54-4dc4-482b-8ecc-bb819ba03d2c.jpg?1783947492","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const seaTroll = (): CardDef => ({"oracleId":"feabe30a-3c28-43a1-b538-b0207758520c","name":"Sea Troll","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Troll","supertypes":[],"types":["Creature"],"subtypes":["Troll"],"oracleText":"{U}: Regenerate this creature. Activate only if this creature blocked or was blocked by a blue creature this turn.","power":"2","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":["Regenerate"],"imageUrl":"https://cards.scryfall.io/normal/front/b/7/b7da23d4-f9fb-40a5-8395-51b47a064600.jpg?1783947293","artUrl":"https://cards.scryfall.io/art_crop/front/b/7/b7da23d4-f9fb-40a5-8395-51b47a064600.jpg?1783947293","commanderLegal":"legal","set":"hml","releasedAt":"1995-10-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const glyph = (): CardDef => ({"oracleId":"93d9a1c6-9f6f-487f-a46c-bfd80946ccdf","name":"Glyph of Reincarnation","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Cast this spell only after combat.\nDestroy all creatures that were blocked by target Wall this turn. They can't be regenerated. For each creature that died this way, put a creature card from the graveyard of the player who controlled that creature the last time it became blocked by that Wall onto the battlefield under its owner's control.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/6/a67e8214-a192-4143-9d5e-d0e254e1bf6e.jpg?1783948047","artUrl":"https://cards.scryfall.io/art_crop/front/a/6/a67e8214-a192-4143-9d5e-d0e254e1bf6e.jpg?1783948047","commanderLegal":"legal","set":"leg","releasedAt":"1994-06-01","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const authority = (): CardDef => ({"oracleId":"b4faba1a-23db-4678-9ce6-a7816105f22a","name":"Infinite Authority","manaCost":"{W}{W}{W}","cmc":3,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nWhenever enchanted creature blocks or becomes blocked by a creature with toughness 3 or less, destroy the other creature at end of combat. At the beginning of the next end step, if that creature was destroyed this way, put a +1/+1 counter on the first creature.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/d/c/dc60077f-d577-4a6c-a78f-697317024c40.jpg?1783948085","artUrl":"https://cards.scryfall.io/art_crop/front/d/c/dc60077f-d577-4a6c-a78f-697317024c40.jpg?1783948085","commanderLegal":"legal","set":"leg","releasedAt":"1994-06-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const skeletons = (): CardDef => ({"oracleId":"c180ed02-07f4-4538-9bea-8c249234a8e2","name":"Drudge Skeletons","manaCost":"{1}{B}","cmc":2,"typeLine":"Creature — Skeleton","supertypes":[],"types":["Creature"],"subtypes":["Skeleton"],"oracleText":"{B}: Regenerate this creature. (The next time this creature would be destroyed this turn, instead tap it, remove it from combat, and heal all damage on it.)","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Heal","Regenerate"],"imageUrl":"https://cards.scryfall.io/normal/front/4/2/425836be-f5cd-4584-a2ff-a8cf166eccc0.jpg?1783942382","artUrl":"https://cards.scryfall.io/art_crop/front/4/2/425836be-f5cd-4584-a2ff-a8cf166eccc0.jpg?1783942382","commanderLegal":"legal","set":"m10","releasedAt":"2009-07-17","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const merfolk = (): CardDef => ({"oracleId":"218d9277-c179-4de3-9c7f-79b5a6d4fa38","name":"Merfolk of the Pearl Trident","manaCost":"{U}","cmc":1,"typeLine":"Creature — Merfolk","supertypes":[],"types":["Creature"],"subtypes":["Merfolk"],"oracleText":"","power":"1","toughness":"1","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/2/92ff7380-ac9c-46c4-9544-da6554cb0819.jpg?1783915734","artUrl":"https://cards.scryfall.io/art_crop/front/9/2/92ff7380-ac9c-46c4-9544-da6554cb0819.jpg?1783915734","commanderLegal":"legal","set":"sld","releasedAt":"2023-08-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const wallOfWood = (): CardDef => ({"oracleId":"aa5e6894-8c97-46f8-a0fd-07c6db51e9a7","name":"Wall of Wood","manaCost":"{G}","cmc":1,"typeLine":"Creature — Wall","supertypes":[],"types":["Creature"],"subtypes":["Wall"],"oracleText":"Defender (This creature can't attack.)","power":"0","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":["Defender"],"imageUrl":"https://cards.scryfall.io/normal/front/1/8/1864e25e-f940-47e5-9439-ab721049c690.jpg?1783942988","artUrl":"https://cards.scryfall.io/art_crop/front/1/8/1864e25e-f940-47e5-9439-ab721049c690.jpg?1783942988","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const dayOfJudgment = (): CardDef => ({"oracleId":"d057289d-5e28-43d5-8ff3-4a1bc723477d","name":"Day of Judgment","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Destroy all creatures.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/6/6/66be885f-a319-4c17-b909-0467fe66cf3b.jpg?1783908991","artUrl":"https://cards.scryfall.io/art_crop/front/6/6/66be885f-a319-4c17-b909-0467fe66cf3b.jpg?1783908991","commanderLegal":"legal","set":"fdn","releasedAt":"2024-11-15","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const run = (s: GameState, plan: ReturnType<typeof planCast>) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return s;
};
/** Everyone passes (questions answered the way a bot would, blocks and attacks declared empty) until `stop`. */
const goUntil = (s: GameState, stop: (s: GameState) => boolean) => {
  for (let i = 0; i < 3000; i++) {
    if (stop(s)) return s;
    const p = s.pending;
    const pid = waitingOn(s)!;
    if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: pid });
  }
  throw new Error("never stopped");
};
const attackWith = (s: GameState, attackers: string[], defender: PlayerId) => {
  s = goUntil(s, (x) => x.pending?.kind === "declareAttackers");
  s = act(s, { type: "declareAttackers", player: s.activePlayer, attacks: attackers.map((attacker) => ({ attacker, defender })) });
  return goUntil(s, (x) => x.pending?.kind === "declareBlockers");
};
const block = (s: GameState, pid: PlayerId, blocks: { blocker: string; attacker: string }[]) => {
  s = act(s, { type: "declareBlockers", player: pid, blocks });
  for (let i = 0; i < 50 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** Passes until `pid` has priority. */
const priorityTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 8 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(waitingOn(s)).toBe(pid);
  return s;
};
const toGraveyard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
};
const shield = (s: GameState, id: string) => {
  s.objects[id]!.regenShields = 1;
};

describe("round B230 cards", () => {
  it("are fully supported", () => supported(boneShaman(), seaTroll(), glyph(), authority()));
});

describe("Bone Shaman", () => {
  const blocked = (activate: boolean) => {
    const { s: s0, ap, opp } = setup([]);
    const shaman = putOnBattlefield(s0, ap, boneShaman());
    const sk = putOnBattlefield(s0, opp, skeletons());
    let s = block(attackWith(s0, [shaman], opp), opp, [{ blocker: sk, attacker: shaman }]);
    shield(s, sk);
    if (activate) {
      s = priorityTo(s, ap);
      s = run(s, planActivate(s, ap, shaman, 0));
    }
    s = goUntil(s, (x) => x.step === "main2");
    return { s, sk, shaman };
  };
  it("without its ability, a creature it dealt lethal damage to regenerates", () => {
    const { s, sk } = blocked(false);
    expect(zone(s, sk)).toBe("battlefield");
    expect(s.objects[sk]!.tapped).toBe(true);
  });
  it("with it, a creature it dealt damage to this turn can't be regenerated", () => {
    const { s, sk } = blocked(true);
    expect(zone(s, sk)).toBe("graveyard");
  });
  it("counts when Bone Shaman dies to the same combat damage (state-based actions happen at once)", () => {
    const { s: s0, ap, opp } = setup([]);
    const shaman = putOnBattlefield(s0, ap, boneShaman());
    const sk = putOnBattlefield(s0, opp, skeletons());
    let s = block(attackWith(s0, [shaman], opp), opp, [{ blocker: sk, attacker: shaman }]);
    shield(s, sk);
    s.objects[shaman]!.damage = 2;
    s = priorityTo(s, ap);
    s = run(s, planActivate(s, ap, shaman, 0));
    s = goUntil(s, (x) => x.step === "main2");
    expect([zone(s, shaman), zone(s, sk)]).toEqual(["graveyard", "graveyard"]);
  });
  it("applies to a destroy-all spell that destroys Bone Shaman at the same time, damage dealt before it gained the ability too, not to creatures it didn't damage", () => {
    const { s: s0, ap, ids, opp } = setup([dayOfJudgment()]);
    const sk = putOnBattlefield(s0, opp, skeletons());
    const other = putOnBattlefield(s0, opp, skeletons());
    // Bone Shaman first on the battlefield: destroyed before the others, all at once.
    const shaman = putOnBattlefield(s0, ap, boneShaman());
    expect(s0.battlefield.indexOf(shaman)).toBeLessThan(s0.battlefield.indexOf(sk));
    let s = block(attackWith(s0, [shaman], opp), opp, [{ blocker: sk, attacker: shaman }]);
    shield(s, sk);
    s = goUntil(s, (x) => x.step === "main2" && waitingOn(x) === ap);
    // It regenerated from the combat damage (no ability yet).
    expect(zone(s, sk)).toBe("battlefield");
    shield(s, sk);
    shield(s, other);
    s = run(s, planActivate(s, ap, shaman, 0));
    s = goUntil(s, (x) => !x.stack.length);
    s = goUntil(run(s, planCast(s, ap, ids[0]!)), (x) => !x.stack.length);
    expect([zone(s, shaman), zone(s, sk), zone(s, other)]).toEqual(["graveyard", "graveyard", "battlefield"]);
  });
});

describe("Sea Troll", () => {
  it("regenerates only if it blocked or was blocked by a blue creature this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const troll = putOnBattlefield(s0, ap, seaTroll());
    const m = putOnBattlefield(s0, opp, merfolk());
    expect(planActivate(s0, ap, troll, 0)).toBeNull();
    let s = block(attackWith(s0, [troll], opp), opp, [{ blocker: m, attacker: troll }]);
    s = priorityTo(s, ap);
    expect(planActivate(s, ap, troll, 0)).not.toBeNull();
  });
  it("not if the creature in the block is green", () => {
    const { s: s0, ap, opp } = setup([]);
    const troll = putOnBattlefield(s0, ap, seaTroll());
    const b = putOnBattlefield(s0, opp, bear());
    let s = block(attackWith(s0, [troll], opp), opp, [{ blocker: b, attacker: troll }]);
    s = priorityTo(s, ap);
    expect(planActivate(s, ap, troll, 0)).toBeNull();
  });
  it("as a blocker too, and the creature's color as it blocked counts", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, merfolk());
    const troll = putOnBattlefield(s0, opp, seaTroll());
    putOnBattlefield(s0, opp, island);
    let s = block(attackWith(s0, [m], opp), opp, [{ blocker: troll, attacker: m }]);
    s = priorityTo(s, opp);
    expect(planActivate(s, opp, troll, 0)).not.toBeNull();
    s = run(s, planActivate(s, opp, troll, 0));
    s = goUntil(s, (x) => !x.stack.length);
    expect(s.objects[troll]!.regenShields).toBe(1);
  });
});

describe("Glyph of Reincarnation", () => {
  const scene = () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, bear({ name: "Blocked Bear" }));
    const free = putOnBattlefield(s0, ap, bear({ name: "Unblocked Bear" }));
    const w = putOnBattlefield(s0, opp, wallOfWood());
    putOnBattlefield(s0, opp, forest);
    const g = putOnBattlefield(s0, opp, glyph());
    s0.battlefield.splice(s0.battlefield.indexOf(g), 1);
    s0.objects[g]!.zone = "hand";
    s0.players[opp]!.hand.push(g);
    const big = toGraveyard(s0, ap, bear({ name: "Graveyard Giant", power: "6", toughness: "6" }));
    let s = block(attackWith(s0, [a, free], opp), opp, [{ blocker: w, attacker: a }]);
    return { s, ap, opp, a, free, w, g, big };
  };
  it("can't be cast during combat", () => {
    const { s: s1, opp, w, g } = scene();
    const s = priorityTo(s1, opp);
    expect(planCast(s, opp, g, [target(w)])).toBeNull();
  });
  it("destroys the creatures the Wall blocked; you choose that many creature cards in their controller's graveyard, which enter under their owner's control", () => {
    const { s: s1, ap, opp, a, free, w, g, big } = scene();
    let s = goUntil(s1, (x) => x.step === "main2");
    s = priorityTo(s, opp);
    s = run(s, planCast(s, opp, g, [target(w)]));
    s = goUntil(s, (x) => !!x.pending || !x.stack.length);
    expect(zone(s, a)).toBe("graveyard");
    expect(zone(s, free)).toBe("battlefield");
    // The destroyed creature can be chosen too (rulings).
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp, min: 1, max: 1, fromGraveyard: "battlefield", forPlayer: ap });
    expect([...(s.pending as { cards: string[] }).cards].sort()).toEqual([a, big].sort());
    s = act(s, { type: "searchLibrary", player: opp, found: [big] });
    s = goUntil(s, (x) => !x.stack.length && !x.pending);
    expect(zone(s, big)).toBe("battlefield");
    expect(controllerOf(s, s.objects[big]!)).toBe(ap);
    expect(zone(s, a)).toBe("graveyard");
    expect(zone(s, w)).toBe("battlefield");
  });
  it("a bot choosing for an opponent picks the card that helps them least", () => {
    const { s: s1, opp, a, w, g, big } = scene();
    let s = goUntil(s1, (x) => x.step === "main2");
    s = priorityTo(s, opp);
    s = run(s, planCast(s, opp, g, [target(w)]));
    s = goUntil(s, (x) => !!x.pending || !x.stack.length);
    const [answer] = botActions(s, opp);
    expect(answer).toEqual({ type: "searchLibrary", player: opp, found: [a] });
    s = act(s, answer!);
    expect([zone(s, a), zone(s, big)]).toEqual(["battlefield", "graveyard"]);
  });
  it("destroys a blocked creature with a regeneration shield too (it can't be regenerated)", () => {
    const { s: s1, opp, a, w, g } = scene();
    let s = goUntil(s1, (x) => x.step === "main2");
    shield(s, a);
    s = priorityTo(s, opp);
    s = run(s, planCast(s, opp, g, [target(w)]));
    s = goUntil(s, (x) => !!x.pending || !x.stack.length);
    expect(zone(s, a)).toBe("graveyard");
    expect(s.pending?.kind).toBe("searchLibrary");
  });
});

describe("Infinite Authority", () => {
  const scene = (attackerToughness: string, regen = false) => {
    const { s: s0, ap, opp } = setup([]);
    const at = putOnBattlefield(s0, ap, bear({ name: "Attacker", toughness: attackerToughness, power: "2" }));
    const w = putOnBattlefield(s0, opp, wallOfWood());
    const aura = putOnBattlefield(s0, opp, authority());
    s0.objects[aura]!.attachedTo = w;
    invalidateCharacteristics(s0);
    let s = block(attackWith(s0, [at], opp), opp, [{ blocker: w, attacker: at }]);
    s = goUntil(s, (x) => !x.stack.length && !x.triggerQueue.length);
    if (regen) shield(s, at);
    return { s, at, w };
  };
  it("destroys a creature with toughness 3 or less it blocks at end of combat, then puts a +1/+1 counter on the enchanted creature at the end step", () => {
    const { s: s1, at, w } = scene("3");
    let s = goUntil(s1, (x) => x.step === "endCombat" && !x.stack.length);
    expect(zone(s, at)).toBe("graveyard");
    expect(s.objects[w]!.counters["+1/+1"] ?? 0).toBe(0);
    s = goUntil(s, (x) => x.step === "end" && !x.stack.length && !x.triggerQueue.length);
    expect(s.objects[w]!.counters["+1/+1"]).toBe(1);
  });
  it("doesn't trigger for a creature with toughness 4", () => {
    const { s: s1, at, w } = scene("4");
    const s = goUntil(s1, (x) => x.step === "cleanup");
    expect(zone(s, at)).toBe("battlefield");
    expect(s.objects[w]!.counters["+1/+1"] ?? 0).toBe(0);
  });
  it("no counter when the creature wasn't destroyed (it regenerated)", () => {
    const { s: s1, at, w } = scene("3", true);
    const s = goUntil(s1, (x) => x.step === "cleanup");
    expect(zone(s, at)).toBe("battlefield");
    expect(s.objects[w]!.counters["+1/+1"] ?? 0).toBe(0);
  });
  it("puts the counter on the creature it enchanted as it triggered, even if the Aura has moved", () => {
    const { s: s1, at, w } = scene("3");
    const aura = s1.battlefield.find((id) => s1.cards[s1.objects[id]!.cardId]!.name === "Infinite Authority")!;
    const other = putOnBattlefield(s1, s1.objects[w]!.controller, bear({ name: "New Host" }));
    s1.objects[aura]!.attachedTo = other;
    invalidateCharacteristics(s1);
    const s = goUntil(s1, (x) => x.step === "end" && !x.stack.length && !x.triggerQueue.length);
    expect(zone(s, at)).toBe("graveyard");
    expect([s.objects[w]!.counters["+1/+1"], s.objects[other]!.counters["+1/+1"] ?? 0]).toEqual([1, 0]);
  });
});
