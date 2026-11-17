// Round 400 (Lane A): permanents gaining all activated abilities of another until end of turn (CR 611.2c: the abilities
// it has as the ability resolves; CR 613.1f: a layer 6 effect). Quicksilver Elemental ("{U}: ~ gains all activated
// abilities of target creature until end of turn", blue mana spent as though it were any color for its abilities, CR
// 609.4b), Grell Philosopher (each Horror you control gains an opponent's artifact's activated abilities, blue mana for
// those) and Havengul Lich (a creature card cast from a graveyard, then its activated abilities).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";
import { abilitiesOf } from "../src/cards";
import { manaAbilitiesOn } from "../src/manaabilities";

// Real card data (Scryfall).
const quicksilver = (): CardDef => ({"oracleId":"c88e3aff-c539-4e8b-8ee1-a43b3d0962b4","name":"Quicksilver Elemental","manaCost":"{3}{U}{U}","cmc":5,"typeLine":"Creature — Elemental","supertypes":[],"types":["Creature"],"subtypes":["Elemental"],"oracleText":"{U}: This creature gains all activated abilities of target creature until end of turn. (If any of the abilities use that creature's name, use this creature's name instead.)\nYou may spend blue mana as though it were mana of any color to pay the activation costs of this creature's abilities.","power":"3","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/8/38f55ec6-18f1-4924-ae0e-9ec88699e805.jpg?1787745844","artUrl":"https://cards.scryfall.io/art_crop/front/3/8/38f55ec6-18f1-4924-ae0e-9ec88699e805.jpg?1787745844","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const grell = (): CardDef => ({"oracleId":"d5dc00cb-1510-4ce9-8dd9-0722f65d34b4","name":"Grell Philosopher","manaCost":"{2}{U}","cmc":3,"typeLine":"Creature — Horror Wizard","supertypes":[],"types":["Creature"],"subtypes":["Horror","Wizard"],"oracleText":"Aberrant Tinkering — When this creature enters and at the beginning of your upkeep, each Horror you control gains all activated abilities of target artifact an opponent controls until end of turn. You may spend blue mana as though it were mana of any color to activate those abilities.","power":"1","toughness":"4","colors":["U"],"colorIdentity":["U"],"keywords":["Aberrant Tinkering"],"imageUrl":"https://cards.scryfall.io/normal/front/e/1/e18bb373-a0bb-4e3c-b7db-83f747820fcd.jpg?1783922509","artUrl":"https://cards.scryfall.io/art_crop/front/e/1/e18bb373-a0bb-4e3c-b7db-83f747820fcd.jpg?1783922509","commanderLegal":"legal","set":"clb","releasedAt":"2022-06-10","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const shivan = (): CardDef => ({"oracleId":"711eea87-0fa3-46e0-a42b-fa5a86455f04","name":"Shivan Dragon","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\n{R}: This creature gets +1/+0 until end of turn.","power":"5","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/2/9/294ca89d-549a-4302-9284-df5b4e833a69.jpg?1789446860","artUrl":"https://cards.scryfall.io/art_crop/front/2/9/294ca89d-549a-4302-9284-df5b4e833a69.jpg?1789446860","commanderLegal":"legal","set":"sld","releasedAt":"2026-08-31","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const capsule = (): CardDef => ({"oracleId":"c9cd266c-7ecf-4beb-b9da-69b88f33abd3","name":"Executioner's Capsule","manaCost":"{B}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{1}{B}, {T}, Sacrifice this artifact: Destroy target nonblack creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/8/48185059-fff9-47b0-9774-ad37dee345ed.jpg?1783942567","artUrl":"https://cards.scryfall.io/art_crop/front/4/8/48185059-fff9-47b0-9774-ad37dee345ed.jpg?1783942567","commanderLegal":"legal","set":"ala","releasedAt":"2008-10-03","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const pyromancer = (): CardDef => ({"oracleId":"29b3cb3e-aeb1-43eb-8095-9f7881aa34bd","name":"Prodigal Pyromancer","manaCost":"{2}{R}","cmc":3,"typeLine":"Creature — Human Wizard","supertypes":[],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"{T}: This creature deals 1 damage to any target.","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/9/7/97787109-408e-42d3-acc5-300f5f5bf2ff.jpg?1783943143","artUrl":"https://cards.scryfall.io/art_crop/front/9/7/97787109-408e-42d3-acc5-300f5f5bf2ff.jpg?1783943143","commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const mindStone = (): CardDef => ({"oracleId":"c97361b5-af16-4a7b-af85-a429dbaf4ad2","name":"Mind Stone","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237","artUrl":"https://cards.scryfall.io/art_crop/front/7/f/7fdef0b6-a3b9-4752-bce6-53c0140a1693.jpg?1783906237","commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const murder = (): CardDef => ({"oracleId":"938b4e2c-88d9-4637-bc00-e228920c9a78","name":"Murder","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","artUrl":"https://cards.scryfall.io/art_crop/front/2/c/2c249609-9cf7-46f1-b94c-9329add966bb.jpg?1783909477","commanderLegal":"legal","set":"dsk","releasedAt":"2024-09-27","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const grizzly = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const lich = (): CardDef => ({"oracleId":"1fb02bad-0d1f-437f-a269-f51cc19b280f","name":"Havengul Lich","manaCost":"{3}{U}{B}","cmc":5,"typeLine":"Creature — Zombie Wizard","supertypes":[],"types":["Creature"],"subtypes":["Zombie","Wizard"],"oracleText":"{1}: You may cast target creature card in a graveyard this turn. When you cast it this turn, this creature gains all activated abilities of that card until end of turn.","power":"4","toughness":"4","colors":["B","U"],"colorIdentity":["B","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/2/321077a4-e468-4e74-94f7-80c83790e0d9.jpg?1783940797","artUrl":"https://cards.scryfall.io/art_crop/front/3/2/321077a4-e468-4e74-94f7-80c83790e0d9.jpg?1783940797","commanderLegal":"legal","set":"dka","releasedAt":"2012-02-03","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
/** Everyone passes until the stack is empty; `me`'s trigger targets are `targets`. Other players answer as the bots would. */
const settle = (s: GameState, me?: PlayerId, opts: { may?: boolean; targets?: TargetChoice[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets ?? [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const ch = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!);
const pt = (s: GameState, id: ObjectId) => `${ch(s, id).power}/${ch(s, id).toughness}`;
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const inHand = (s: GameState, pid: PlayerId, def: CardDef): ObjectId => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
const abilityIndex = (s: GameState, id: ObjectId, re: RegExp) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => re.test(a.text));
/** Taps every land `pid` controls, so only the mana in their pool can pay. */
const tapLands = (s: GameState, pid: PlayerId) => {
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid && ch(s, id).types.includes("Land")) s.objects[id]!.tapped = true;
};
/** Activates Quicksilver Elemental's own ability on `target` and lets it resolve. */
const steal = (s: GameState, pid: PlayerId, q: ObjectId, target: ObjectId) => settle(run(s, planActivate(s, pid, q, abilityIndex(s, q, /gains all activated abilities/), [tgt(target)])), pid);

describe("round 400: parse", () => {
  it("every card of the round is fully supported", () => {
    for (const d of [quicksilver(), grell(), lich()]) expect(isFullySupported(d), d.name).toBe(true);
  });
});

describe("round 400: Quicksilver Elemental", () => {
  it("gains a creature's activated abilities, '~' in them being Quicksilver, and keeps them after that creature leaves (CR 611.2c)", () => {
    const { s: s0, ap, opp } = setup([]);
    const q = putOnBattlefield(s0, ap, quicksilver());
    const pyro = putOnBattlefield(s0, opp, pyromancer());
    expect(abilityIndex(s0, q, /deals 1 damage/)).toBe(-1);
    let s = steal(s0, ap, q, pyro);
    const i = abilityIndex(s, q, /deals 1 damage/);
    expect(i).toBeGreaterThan(-1);
    // The Pyromancer dies: Quicksilver keeps the ability it gained.
    Object.assign(s.players[ap]!.manaPool, { B: 2, C: 1 });
    s = settle(run(s, planCast(s, ap, inHand(s, ap, murder()), [tgt(pyro)])), ap);
    expect(zone(s, pyro)).toBe("graveyard");
    const j = abilityIndex(s, q, /deals 1 damage/);
    expect(j).toBeGreaterThan(-1);
    const life = s.players[opp]!.life;
    s = settle(run(s, planActivate(s, ap, q, j, [{ kind: "player", id: opp }])), ap);
    expect(s.players[opp]!.life).toBe(life - 1);
    // "{T}: This creature deals 1 damage": Quicksilver is the one tapped (rulings).
    expect(s.objects[q]!.tapped).toBe(true);
  });

  it("gains mana abilities too, and loses everything it gained at end of turn", () => {
    const { s: s0, ap } = setup([]);
    const q = putOnBattlefield(s0, ap, quicksilver());
    const elf = putOnBattlefield(s0, ap, elves());
    expect(manaAbilitiesOn(s0, s0.objects[q]!).length).toBe(0);
    let s = steal(s0, ap, q, elf);
    expect(manaAbilitiesOn(s, s.objects[q]!).map((m) => m.text)).toEqual(["{T}: Add {G}."]);
    s = act(s, { type: "activateMana", player: ap, objectId: q, mana: "G" });
    expect(s.players[ap]!.manaPool.G).toBe(1);
    expect(s.objects[q]!.tapped).toBe(true);
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(manaAbilitiesOn(s, s.objects[q]!).length).toBe(0);
  });

  it("collects abilities from several creatures, and the same creature twice gives two instances (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const q = putOnBattlefield(s0, ap, quicksilver());
    const pyro = putOnBattlefield(s0, opp, pyromancer());
    const dragon = putOnBattlefield(s0, opp, shivan());
    let s = steal(s0, ap, q, pyro);
    s = steal(s, ap, q, dragon);
    s = steal(s, ap, q, dragon);
    const texts = abilitiesOf(s, s.objects[q]!).activated.map((a) => a.text);
    expect(texts.filter((t) => /deals 1 damage/.test(t)).length).toBe(1);
    expect(texts.filter((t) => /gets \+1\/\+0/.test(t)).length).toBe(2);
  });

  it("pays its abilities' {R} with blue mana (CR 609.4b), but blue mana doesn't pay another creature's {R}", () => {
    const { s: s0, ap } = setup([]);
    const q = putOnBattlefield(s0, ap, quicksilver());
    const dragon = putOnBattlefield(s0, ap, shivan());
    let s = steal(s0, ap, q, dragon);
    tapLands(s, ap);
    s.players[ap]!.manaPool.U = 2;
    const firebreathing = abilityIndex(s, q, /gets \+1\/\+0/);
    const before = pt(s, q);
    s = settle(run(s, planActivate(s, ap, q, firebreathing)), ap);
    expect(pt(s, q)).toBe("4/4");
    expect(before).toBe("3/4");
    expect(s.players[ap]!.manaPool.U).toBe(1);
    // The Dragon's own {R}: blue mana can't pay it.
    expect(planActivate(s, ap, dragon, abilityIndex(s, dragon, /gets \+1\/\+0/))).toBeNull();
  });

  it("doesn't resolve if its target is gone (CR 608.2b)", () => {
    const { s: s0, ap, opp } = setup([]);
    const q = putOnBattlefield(s0, ap, quicksilver());
    const pyro = putOnBattlefield(s0, opp, pyromancer());
    let s = run(s0, planActivate(s0, ap, q, abilityIndex(s0, q, /gains all activated abilities/), [tgt(pyro)]));
    // In response, the Pyromancer dies.
    Object.assign(s.players[ap]!.manaPool, { B: 2, C: 1 });
    s = run(s, planCast(s, ap, inHand(s, ap, murder()), [tgt(pyro)]));
    s = settle(s, ap);
    expect(zone(s, pyro)).toBe("graveyard");
    expect(abilityIndex(s, q, /deals 1 damage/)).toBe(-1);
  });
});

describe("round 400: Grell Philosopher", () => {
  it("each Horror you control gains an opponent's artifact's abilities as it enters; blue mana pays them", () => {
    const { s: s0, ap, opp } = setup([]);
    const cap = putOnBattlefield(s0, opp, capsule());
    const stone = putOnBattlefield(s0, opp, mindStone());
    const bear = putOnBattlefield(s0, ap, grizzly());
    const victim = putOnBattlefield(s0, opp, grizzly());
    const g0 = inHand(s0, ap, grell());
    let s = settle(run(s0, planCast(s0, ap, g0)), ap, { targets: [tgt(cap)] });
    const g = s.battlefield.find((id) => s.objects[id]!.cardId === grell().oracleId)!;
    expect(abilityIndex(s, g, /Destroy target nonblack creature/)).toBeGreaterThan(-1);
    // Not the Bears (not a Horror), and not the Mind Stone's (not the target).
    expect(abilityIndex(s, bear, /Destroy target nonblack creature/)).toBe(-1);
    expect(manaAbilitiesOn(s, s.objects[g]!).length).toBe(0);
    // "{1}{B}, {T}, Sacrifice this artifact": paid with blue mana; Grell is the one sacrificed (rulings).
    s.objects[g]!.controlledSinceTurn = -1;
    tapLands(s, ap);
    s.players[ap]!.manaPool.U = 2;
    s = settle(run(s, planActivate(s, ap, g, abilityIndex(s, g, /Destroy target nonblack creature/), [tgt(victim)])), ap);
    expect(zone(s, victim)).toBe("graveyard");
    expect(zone(s, g)).toBe("graveyard");
    expect(zone(s, cap)).toBe("battlefield");
    void stone;
  });

  it("at the beginning of your upkeep too, and an opponent's Horror gains nothing", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, grell());
    const theirs = putOnBattlefield(s0, opp, grell());
    const stone = putOnBattlefield(s0, opp, mindStone());
    let s = passUntil(s0, "upkeep", ap);
    s = settle(s, ap, { targets: [tgt(stone)] });
    expect(manaAbilitiesOn(s, s.objects[g]!).map((m) => m.text)).toEqual(["{T}: Add {C}."]);
    expect(abilityIndex(s, g, /Draw a card/)).toBeGreaterThan(-1);
    expect(manaAbilitiesOn(s, s.objects[theirs]!).length).toBe(0);
  });
});

/** A card put into `pid`'s graveyard. */
/** Casting a card from a graveyard with a permission for this turn. */
const yardCast = (s: GameState, pid: PlayerId, id: ObjectId) => planCast(s, pid, id, undefined, undefined, "auto", undefined, { via: "turnPermission" });
const inYard = (s: GameState, pid: PlayerId, def: CardDef): ObjectId => {
  const id = inHand(s, pid, def);
  s.players[pid]!.hand.splice(s.players[pid]!.hand.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
};

describe("round 400: Havengul Lich", () => {
  it("lets you cast a creature card from an opponent's graveyard; as you cast it, the Lich gains its activated abilities first", () => {
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, lich());
    const pyro = putOnBattlefield(s0, opp, pyromancer());
    s0.battlefield.splice(s0.battlefield.indexOf(pyro), 1);
    s0.objects[pyro]!.zone = "graveyard";
    s0.players[opp]!.graveyard.push(pyro);
    invalidateCharacteristics(s0);
    // Not castable before.
    expect(yardCast(s0, ap, pyro)).toBeNull();
    let s = settle(run(s0, planActivate(s0, ap, l, abilityIndex(s0, l, /^\{1\}: You may cast/), [tgt(pyro)])), ap);
    expect(abilityIndex(s, l, /deals 1 damage/)).toBe(-1);
    s = run(s, yardCast(s, ap, pyro));
    expect(zone(s, pyro)).toBe("stack");
    // The delayed trigger goes on the stack above the spell and resolves first (rulings).
    s = settle(s, ap);
    expect(abilityIndex(s, l, /deals 1 damage/)).toBeGreaterThan(-1);
    expect(zone(s, pyro)).toBe("battlefield");
    expect(s.objects[pyro]!.controller).toBe(ap);
    expect(s.objects[pyro]!.owner).toBe(opp);
    const life = s.players[opp]!.life;
    s = settle(run(s, planActivate(s, ap, l, abilityIndex(s, l, /deals 1 damage/), [{ kind: "player", id: opp }])), ap);
    expect(s.players[opp]!.life).toBe(life - 1);
    expect(s.objects[l]!.tapped).toBe(true);
    // Until end of turn.
    s = passUntil(s, "upkeep", opp);
    expect(abilityIndex(s, l, /deals 1 damage/)).toBe(-1);
  });

  it("gains nothing if the card isn't cast, and the permission is for that card only", () => {
    const { s: s0, ap } = setup([]);
    const l = putOnBattlefield(s0, ap, lich());
    const pyro = inYard(s0, ap, pyromancer());
    const elf = inYard(s0, ap, elves());
    let s = settle(run(s0, planActivate(s0, ap, l, abilityIndex(s0, l, /^\{1\}: You may cast/), [tgt(pyro)])), ap);
    expect(yardCast(s, ap, elf)).toBeNull();
    expect(yardCast(s, ap, pyro)).not.toBeNull();
    s = passUntil(s, "main2", ap);
    expect(abilityIndex(s, l, /deals 1 damage/)).toBe(-1);
    // The next turn, the permission is gone.
    s = passUntil(s, "main1", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]);
    expect(yardCast(s, ap, pyro)).toBeNull();
  });

  it("a mana ability of the card is gained too (CR 605.1a)", () => {
    const { s: s0, ap } = setup([]);
    const l = putOnBattlefield(s0, ap, lich());
    const elf = inYard(s0, ap, elves());
    let s = settle(run(s0, planActivate(s0, ap, l, abilityIndex(s0, l, /^\{1\}: You may cast/), [tgt(elf)])), ap);
    s = settle(run(s, yardCast(s, ap, elf)), ap);
    expect(zone(s, elf)).toBe("battlefield");
    expect(manaAbilitiesOn(s, s.objects[l]!).map((m) => m.text)).toEqual(["{T}: Add {G}."]);
  });
});
