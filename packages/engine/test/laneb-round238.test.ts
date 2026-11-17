// Lane B round B238: Captured by the Consulate (a single-target spell redirected to the creature it enchants), Piracy
// (tapping other players' lands for mana, spent only on spells) and Infernal Denizen (two Swamps each upkeep, or an
// opponent takes a creature).

import { describe, expect, it } from "vitest";
import { moveObject } from "../src/game";
import { controllerOf } from "../src/layers";
import { act, mountain, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, isFullySupported, power, manaAbilityProblem, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const capturedByTheConsulate = (): CardDef => ({"oracleId":"da164485-c985-42fa-819e-42f0d33237c5","name":"Captured by the Consulate","manaCost":"{3}{W}","cmc":4,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature you don't control\nEnchanted creature can't attack.\nWhenever an opponent casts a spell, if it has a single target, change the target to enchanted creature if able.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/e/0/e0c20018-4446-4c2b-bdc5-53fcf1fbc3bf.jpg?1783937235","artUrl":"https://cards.scryfall.io/art_crop/front/e/0/e0c20018-4446-4c2b-bdc5-53fcf1fbc3bf.jpg?1783937235","commanderLegal":"legal","set":"kld","releasedAt":"2016-09-30","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const piracy = (): CardDef => ({"oracleId":"131acf69-fa5c-4ce7-9e39-2677af4f8907","name":"Piracy","manaCost":"{U}{U}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Until end of turn, you may tap lands you don't control for mana. Spend this mana only to cast spells.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/d/a/daeab88f-2bfc-4f40-8eed-ee44a9e90bd7.jpg?1783946485","artUrl":"https://cards.scryfall.io/art_crop/front/d/a/daeab88f-2bfc-4f40-8eed-ee44a9e90bd7.jpg?1783946485","commanderLegal":"legal","set":"p02","releasedAt":"1998-06-24","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const infernalDenizen = (): CardDef => ({"oracleId":"2f33aced-c737-4b3c-ba25-aff7b340c2d7","name":"Infernal Denizen","manaCost":"{7}{B}","cmc":8,"typeLine":"Creature — Demon","supertypes":[],"types":["Creature"],"subtypes":["Demon"],"oracleText":"At the beginning of your upkeep, sacrifice two Swamps. If you can't, tap this creature, and an opponent may gain control of a creature you control of their choice for as long as this creature remains on the battlefield.\n{T}: Gain control of target creature for as long as this creature remains on the battlefield.","power":"5","toughness":"7","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/6/b63ac9a6-aaa5-4659-97d1-c5f6b0d5ccfe.jpg?1783947501","artUrl":"https://cards.scryfall.io/art_crop/front/b/6/b63ac9a6-aaa5-4659-97d1-c5f6b0d5ccfe.jpg?1783947501","commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const giantGrowth = (): CardDef => ({"oracleId":"5748ebf1-24e3-499d-ab7c-c2cebd462a24","name":"Giant Growth","manaCost":"{G}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Target creature gets +3/+3 until end of turn.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","artUrl":"https://cards.scryfall.io/art_crop/front/f/d/fd1f95bf-48ea-455a-8a6c-0249b11c8900.jpg?1783902918","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const naturalize = (): CardDef => ({"oracleId":"bdb3ca68-ec1f-4e16-81cc-d23f8f52c728","name":"Naturalize","manaCost":"{1}{G}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target artifact or enchantment.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/0/c/0c187d05-0df4-48b6-8e75-690e725b8bcf.jpg?1783935285","artUrl":"https://cards.scryfall.io/art_crop/front/0/c/0c187d05-0df4-48b6-8e75-690e725b8bcf.jpg?1783935285","commanderLegal":"legal","set":"rix","releasedAt":"2018-01-19","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const arcTrail = (): CardDef => ({"oracleId":"f1c26b25-371e-4fbf-a43d-7fd59a364d3a","name":"Arc Trail","manaCost":"{1}{R}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Arc Trail deals 2 damage to any target and 1 damage to any other target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/4/445e3a0a-29a7-4dc0-80fe-569b9e751db3.jpg?1783941727","artUrl":"https://cards.scryfall.io/art_crop/front/4/4/445e3a0a-29a7-4dc0-80fe-569b9e751db3.jpg?1783941727","commanderLegal":"legal","set":"som","releasedAt":"2010-10-01","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const wildGrowth = (): CardDef => ({"oracleId":"706ae742-1807-44b7-a4fa-f2e26f61519a","name":"Wild Growth","manaCost":"{G}","cmc":1,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}.","colors":["G"],"colorIdentity":["G"],"keywords":["Enchant"],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/1/6/16fdfa77-424a-4f83-bb48-1c43b6c84b17.jpg?1783912353","artUrl":"https://cards.scryfall.io/art_crop/front/1/6/16fdfa77-424a-4f83-bb48-1c43b6c84b17.jpg?1783912353","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const crystalVein = (): CardDef => ({"oracleId":"616d6013-24f4-4999-9bf3-5b0764e52fa6","name":"Crystal Vein","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{T}, Sacrifice this land: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/1/a/1afb6e29-058e-44c5-a3fa-56c462f070a0.jpg?1783947037","artUrl":"https://cards.scryfall.io/art_crop/front/1/a/1afb6e29-058e-44c5-a3fa-56c462f070a0.jpg?1783947037","commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const mindStone = (): CardDef => ({"oracleId":"c97361b5-af16-4a7b-af85-a429dbaf4ad2","name":"Mind Stone","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237","artUrl":"https://cards.scryfall.io/art_crop/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237","commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const forest = (): CardDef => ({"oracleId":"b34bb2dc-c1af-4d77-b0b3-a0fb342a5fc6","name":"Forest","manaCost":"","cmc":0,"typeLine":"Basic Land — Forest","supertypes":["Basic"],"types":["Land"],"subtypes":["Forest"],"oracleText":"({T}: Add {G}.)","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","artUrl":"https://cards.scryfall.io/art_crop/front/4/f/4fae200d-5757-4924-8cf4-ab2a5ef2ccc0.jpg?1785981689","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const swamp = (): CardDef => ({"oracleId":"56719f6a-1a6c-4c0a-8d21-18f7d7350b68","name":"Swamp","manaCost":"","cmc":0,"typeLine":"Basic Land — Swamp","supertypes":["Basic"],"types":["Land"],"subtypes":["Swamp"],"oracleText":"({T}: Add {B}.)","colors":[],"colorIdentity":["B"],"keywords":[],"producedMana":["B"],"imageUrl":"https://cards.scryfall.io/normal/front/2/1/214a9e76-b7fd-4cc9-89e7-104a71919a84.jpg?1785981656","artUrl":"https://cards.scryfall.io/art_crop/front/2/1/214a9e76-b7fd-4cc9-89e7-104a71919a84.jpg?1785981656","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty or a question is asked; bots answer the questions of anyone but `me`. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && me !== undefined && p.player === me) return s;
    if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
/** A card in `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};

describe("Lane B round B238", () => {
  it("are fully supported", () => supported(capturedByTheConsulate(), piracy(), infernalDenizen()));
});

describe("Lane B round B238: Captured by the Consulate", () => {
  /** You (the active player) control the Aura, on the next player's Bears; that player has a Mountain and a Forest. */
  const game = () => {
    const { s, ap, opp } = setup([]);
    const bears = putOnBattlefield(s, opp, grizzlyBears());
    const aura = putOnBattlefield(s, ap, capturedByTheConsulate());
    s.objects[aura]!.attachedTo = bears;
    putOnBattlefield(s, opp, mountain);
    putOnBattlefield(s, opp, forest());
    putOnBattlefield(s, opp, forest());
    // The active player passes: the next player has priority in your main phase.
    const s1 = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s1)).toBe(opp);
    return { s: s1, ap, opp, bears, aura };
  };

  it("an opponent's Lightning Bolt at you is redirected to the enchanted creature", () => {
    const { s: s0, ap, opp, bears } = game();
    const bolt = inHand(s0, opp, lightningBolt());
    const life = s0.players[ap]!.life;
    let s = run(s0, planCast(s0, opp, bolt, [{ kind: "player", id: ap }]));
    s = settle(s);
    expect(zone(s, bears)).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life);
    expect(s.log.some((l) => l.text.includes("Captured by the Consulate changes the target of Lightning Bolt"))).toBe(true);
  });

  it("an opponent's Giant Growth on their other creature goes to the enchanted one instead", () => {
    const { s: s0, opp, bears } = game();
    const other = putOnBattlefield(s0, opp, grizzlyBears());
    const growth = inHand(s0, opp, giantGrowth());
    const s = settle(run(s0, planCast(s0, opp, growth, [tgt(other)])));
    expect(s.objects[bears]!.zone).toBe("battlefield");
    expect(power(s, s.objects[bears]!)).toBe(5);
    expect(power(s, s.objects[other]!)).toBe(2);
  });

  it("a spell the enchanted creature can't be a target of keeps its target (if able)", () => {
    const { s: s0, ap, opp, aura } = game();
    const growth = inHand(s0, opp, naturalize());
    // Naturalize at your Aura: the Bears aren't an artifact or enchantment.
    const s = settle(run(s0, planCast(s0, opp, growth, [tgt(aura)])));
    expect(zone(s, aura)).toBe("graveyard");
    expect(s.players[ap]!.life).toBeGreaterThan(0);
    expect(s.log.some((l) => l.text.includes("can't become the target of Naturalize"))).toBe(true);
  });

  it("a spell with two targets doesn't trigger it", () => {
    const { s: s0, ap, opp, bears } = game();
    const other = putOnBattlefield(s0, opp, grizzlyBears());
    const trail = inHand(s0, opp, arcTrail());
    // Arc Trail is a sorcery: on the next player's own turn.
    let s = passUntil(s0, "main1", opp);
    const life = s.players[ap]!.life;
    s = run(s, planCast(s, opp, trail, [{ kind: "player", id: ap }, tgt(other)]));
    expect(s.stack.length).toBe(1);
    expect(s.triggerQueue.length).toBe(0);
    s = settle(s);
    expect(s.players[ap]!.life).toBe(life - 2);
    expect(s.objects[other]!.damage).toBe(1);
    expect(s.objects[bears]!.damage).toBe(0);
  });

  it("your own spells don't trigger it", () => {
    const { s, ap: me, opp } = setup([lightningBolt()]);
    const bears = putOnBattlefield(s, opp, grizzlyBears());
    const other = putOnBattlefield(s, opp, grizzlyBears());
    const aura = putOnBattlefield(s, me, capturedByTheConsulate());
    s.objects[aura]!.attachedTo = bears;
    const bolt = s.players[me]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Lightning Bolt")!;
    const after = settle(run(s, planCast(s, me, bolt, [tgt(other)])));
    expect(zone(after, other)).toBe("graveyard");
    expect(zone(after, bears)).toBe("battlefield");
  });

  it("enchants only a creature you don't control", () => {
    const { s, ap, opp } = setup([capturedByTheConsulate()]);
    const mine = putOnBattlefield(s, ap, grizzlyBears());
    const theirs = putOnBattlefield(s, opp, grizzlyBears());
    const id = s.players[ap]!.hand.at(-1)!;
    expect(planCast(s, ap, id, [tgt(mine)])).toBeNull();
    const after = settle(run(s, planCast(s, ap, id, [tgt(theirs)])));
    expect(after.objects[id]!.attachedTo).toBe(theirs);
  });
});

describe("Lane B round B238: Piracy", () => {
  /** You have cast Piracy; the next player has two Forests and a Crystal Vein. */
  const game = (cast = true) => {
    const { s, ap, opp, ids } = setup([piracy(), grizzlyBears(), mindStone()]);
    const forests = [putOnBattlefield(s, opp, forest()), putOnBattlefield(s, opp, forest())];
    const vein = putOnBattlefield(s, opp, crystalVein());
    const s1 = cast ? settle(run(s, planCast(s, ap, ids[0]!))) : s;
    // Your own lands are all tapped now.
    for (const id of s1.battlefield) if (s1.objects[id]!.controller === ap) s1.objects[id]!.tapped = true;
    return { s: s1, ap, opp, forests, vein, bears: ids[1]!, stone: ids[2]! };
  };
  const tapFor = (pid: PlayerId, objectId: string, mana: "G" | "C", ability = 0): Action => ({ type: "activateMana", player: pid, objectId, mana, ability });

  it("without it, you can't tap another player's land for mana", () => {
    const { s, ap, forests } = game(false);
    expect(manaAbilityProblem(s, ap, s.objects[forests[0]!]!, 0)).toMatch(/don't control/);
  });

  it("until end of turn you may tap their lands; the mana is yours, only for spells", () => {
    const { s: s0, ap, opp, forests, bears, stone } = game();
    expect(manaAbilityProblem(s0, ap, s0.objects[forests[0]!]!, 0)).toBeNull();
    let s = act(s0, tapFor(ap, forests[0]!, "G"));
    expect(s.objects[forests[0]!]!.tapped).toBe(true);
    expect(s.objects[forests[0]!]!.controller).toBe(opp);
    expect(s.players[ap]!.manaPool.G).toBe(1);
    expect(s.players[ap]!.manaLots?.some((l) => l.mana === "G" && l.only?.spells)).toBe(true);
    expect(s.log.some((l) => l.text.includes("taps") && l.text.includes("'s Forest for {G}, to spend only on spells"))).toBe(true);
    // A spell: Grizzly Bears, paid with both Forests.
    s = act(s, tapFor(ap, forests[1]!, "G"));
    const plan = planCast(s, ap, bears);
    expect(plan).not.toBeNull();
    s = settle(run(s, plan));
    expect(zone(s, bears)).toBe("battlefield");
    expect(s.objects[bears]!.controller).toBe(ap);
    expect(s.players[ap]!.manaPool.G).toBe(0);
    expect(zone(s, stone)).toBe("hand");
  });

  it("its mana can't pay for an ability", () => {
    const { s: s0, ap, forests } = game();
    const stone = putOnBattlefield(s0, ap, mindStone());
    // Mind Stone's "{1}, {T}, Sacrifice": only the pirated Forest's mana is in the pool, and the other lands can't help.
    const s = act(s0, tapFor(ap, forests[0]!, "G"));
    expect(planActivate(s, ap, stone, 0)).toBeNull();
    // A spell can still use it.
    expect(s.players[ap]!.manaPool.G).toBe(1);
    // With one of your own lands untapped, the ability is paid with that land.
    const island = s.battlefield.find((id) => s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.name === "Island")!;
    s.objects[island]!.tapped = false;
    const plan = planActivate(s, ap, stone, 0);
    expect(plan).not.toBeNull();
    expect(plan!.filter((a) => a.type === "activateMana").map((a) => (a as { objectId: string }).objectId)).toEqual([island]);
  });

  it("automatic payment taps their lands for your spells", () => {
    const { s: s0, ap, opp, bears } = game();
    const plan = planCast(s0, ap, bears);
    expect(plan).not.toBeNull();
    expect(plan!.some((a) => a.type === "activateMana" && s0.objects[a.objectId]!.controller === opp)).toBe(true);
    const s = settle(run(s0, plan));
    expect(zone(s, bears)).toBe("battlefield");
  });

  it("a land sacrificed for its mana gives restricted mana too (Crystal Vein)", () => {
    const { s: s0, ap, opp, vein } = game();
    const s = act(s0, tapFor(ap, vein, "C", 1));
    expect(zone(s, vein)).toBe("graveyard");
    expect(s.objects[vein]!.owner).toBe(opp);
    expect(s.players[ap]!.manaPool.C).toBe(2);
    expect(s.players[ap]!.manaLots?.filter((l) => l.mana === "C" && l.only?.spells).reduce((a, l) => a + l.n, 0)).toBe(2);
  });

  it("not a land a triggered mana ability would add to (Wild Growth): not modeled, so not offered", () => {
    const { s, ap, opp, forests } = game();
    const growth = putOnBattlefield(s, opp, wildGrowth());
    s.objects[growth]!.attachedTo = forests[0]!;
    expect(manaAbilityProblem(s, ap, s.objects[forests[0]!]!, 0)).toMatch(/don't control/);
    expect(manaAbilityProblem(s, ap, s.objects[forests[1]!]!, 0)).toBeNull();
  });

  it("only this turn", () => {
    const { s: s0, ap, forests } = game();
    const s = passUntil(s0, "upkeep", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]);
    expect(manaAbilityProblem(s, ap, s.objects[forests[0]!]!, 0)).toMatch(/don't control/);
  });
});

describe("Lane B round B238: Infernal Denizen", () => {
  /** Your Denizen with `swamps` Swamps (your other lands aren't Swamps), at the beginning of your next upkeep. */
  const game = (swamps: number) => {
    const { s, ap, opp } = setup([]);
    for (const id of [...s.battlefield]) if (s.objects[id]!.controller === ap && s.cards[s.objects[id]!.cardId]!.name === "Swamp") {
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      s.objects[id]!.zone = "exile";
      s.players[ap]!.exile.push(id);
    }
    const sw = Array.from({ length: swamps }, () => putOnBattlefield(s, ap, swamp()));
    const denizen = putOnBattlefield(s, ap, infernalDenizen());
    const bears = putOnBattlefield(s, ap, grizzlyBears());
    const s1 = passUntil(passUntil(s, "main2", ap), "upkeep", ap);
    return { s: s1, ap, opp, sw, denizen, bears };
  };

  it("with two Swamps, both are sacrificed and nothing else happens", () => {
    const { s: s0, ap, sw, denizen, bears } = game(2);
    const s = settle(s0, ap);
    expect(s.pending).toBeFalsy();
    for (const id of sw) expect(zone(s, id)).toBe("graveyard");
    expect(s.objects[denizen]!.tapped).toBe(false);
    expect(controllerOf(s, s.objects[bears]!)).toBe(ap);
  });

  it("with three, you choose the two", () => {
    const { s: s0, ap, sw } = game(3);
    let s = settle(s0, ap);
    expect(s.pending?.kind).toBe("pickPermanents");
    s = act(s, { type: "pickPermanents", player: ap, ids: [sw[0]!, sw[2]!] });
    s = settle(s, ap);
    expect(sw.map((id) => zone(s, id))).toEqual(["graveyard", "battlefield", "graveyard"]);
  });

  it("with one, it's sacrificed, ~ is tapped, and the opponent you choose may take a creature of yours", () => {
    const { s: s0, ap, sw, denizen } = game(1);
    let s = settle(s0, ap);
    expect(zone(s, sw[0]!)).toBe("graveyard");
    expect(s.objects[denizen]!.tapped).toBe(true);
    // You choose the opponent.
    const pend = s.pending!;
    expect(pend.kind === "chooseOption" && pend.what === "opponent" && pend.player === ap).toBe(true);
    const them = s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!;
    s = act(s, { type: "chooseOption", player: ap, choice: String(them) });
    // They choose: may take any creature of yours, ~ too; the bot takes the best one.
    const pick = s.pending!;
    expect(pick.kind === "pickPermanents" && pick.player === them && pick.min === 0 && pick.options.includes(denizen)).toBe(true);
    s = settle(s, ap);
    expect(controllerOf(s, s.objects[denizen]!)).toBe(them);
    expect(s.log.some((l) => l.text.includes("for as long as Infernal Denizen remains on the battlefield"))).toBe(true);
  });

  it("they may take nothing; what they take comes back when ~ leaves the battlefield", () => {
    const { s: s0, ap, denizen, bears } = game(0);
    let s = settle(s0, ap);
    const them = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s = act(s, { type: "chooseOption", player: ap, choice: String(them) });
    // Nothing taken.
    let none = act(s, { type: "pickPermanents", player: them, ids: [] });
    none = settle(none, ap);
    expect(controllerOf(none, none.objects[denizen]!)).toBe(ap);
    expect(controllerOf(none, none.objects[bears]!)).toBe(ap);
    // The Bears taken; then ~ leaves (destroyed), and they come back.
    s = act(s, { type: "pickPermanents", player: them, ids: [bears] });
    s = settle(s, ap);
    expect(controllerOf(s, s.objects[bears]!)).toBe(them);
    moveObject(s, denizen, "graveyard");
    expect(zone(s, denizen)).toBe("graveyard");
    expect(controllerOf(s, s.objects[bears]!)).toBe(ap);
  });

  it("{T}: gain control of target creature for as long as ~ remains on the battlefield", () => {
    const { s, ap, opp } = setup([]);
    const denizen = putOnBattlefield(s, ap, infernalDenizen());
    const theirs = putOnBattlefield(s, opp, grizzlyBears());
    const after = settle(run(s, planActivate(s, ap, denizen, 0, [tgt(theirs)])), ap);
    expect(controllerOf(after, after.objects[theirs]!)).toBe(ap);
  });
});
