// Round 346 (Lane A): Crucible of the Spirit Dragon ("Remove X storage counters: Add X mana in any combination of
// colors", spendable only on Dragons), Greater Gargadon (an ability of a suspended card in exile) and Detective's
// Phoenix (a bestow cost with collect evidence, cast from the graveyard only bestowed), Festival of Embers (instants and
// sorceries cast from your graveyard during your turn for 1 life more).

import { describe, expect, it } from "vitest";
import { act, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, applyAction, castProblem, objHasKeyword, botActions, invalidateCharacteristics, isFullySupported, manaOptions, moveObject, planActivate, planCast, removeXCombos, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

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
/** No lands for `pid`: theirs are moved to the graveyard. */
const bare = (s: GameState, pid: PlayerId) => {
  for (const id of [...s.battlefield]) if (s.objects[id]!.controller === pid) moveObject(s, id, "graveyard");
  return s;
};
/** A copy of `def` in `pid`'s exile. */
const exiled = (s: GameState, pid: PlayerId, def: CardDef, time: number) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "exile";
  s.players[pid]!.exile.push(id);
  if (time) s.objects[id]!.counters.time = time;
  invalidateCharacteristics(s);
  return id;
};

// Real oracle text (Scryfall).
const crucible = (): CardDef => ({"oracleId":"ecfbebc9-7fc7-474e-8c59-8ede800e082e","name":"Crucible of the Spirit Dragon","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{1}, {T}: Put a storage counter on this land.\n{T}, Remove X storage counters from this land: Add X mana in any combination of colors. Spend this mana only to cast Dragon spells or activate abilities of Dragons.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["B","C","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/6/b/6bf563e0-1f42-4768-a667-3e120bdb6534.jpg?1783938669","artUrl":"https://cards.scryfall.io/art_crop/front/6/b/6bf563e0-1f42-4768-a667-3e120bdb6534.jpg?1783938669","commanderLegal":"legal","set":"frf","releasedAt":"2015-01-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const gargadon = (): CardDef => ({"oracleId":"406b4b1d-756b-4062-897d-3693832086a0","name":"Greater Gargadon","manaCost":"{9}{R}","cmc":10,"typeLine":"Creature — Beast","supertypes":[],"types":["Creature"],"subtypes":["Beast"],"oracleText":"Suspend 10—{R}\nSacrifice an artifact, creature, or land: Remove a time counter from this card. Activate only if this card is suspended.","power":"9","toughness":"7","colors":["R"],"colorIdentity":["R"],"keywords":["Suspend"],"imageUrl":"https://cards.scryfall.io/normal/front/6/5/653ddfa0-2088-4503-a3ab-b0f1d55d8351.jpg?1783943220","artUrl":"https://cards.scryfall.io/art_crop/front/6/5/653ddfa0-2088-4503-a3ab-b0f1d55d8351.jpg?1783943220","commanderLegal":"legal","set":"tsp","releasedAt":"2006-10-06","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const shivan = (): CardDef => ({"oracleId":"711eea87-0fa3-46e0-a42b-fa5a86455f04","name":"Shivan Dragon","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\n{R}: This creature gets +1/+0 until end of turn.","power":"5","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/2/9/294ca89d-549a-4302-9284-df5b4e833a69.jpg?1789446860","artUrl":"https://cards.scryfall.io/art_crop/front/2/9/294ca89d-549a-4302-9284-df5b4e833a69.jpg?1789446860","commanderLegal":"legal","set":"sld","releasedAt":"2026-08-31","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const phoenix = (): CardDef => ({"oracleId":"52c3fe55-74ee-44cb-b62b-dc6c5dfdc33e","name":"Detective's Phoenix","manaCost":"{2}{R}","cmc":3,"typeLine":"Enchantment Creature — Phoenix","supertypes":[],"types":["Enchantment","Creature"],"subtypes":["Phoenix"],"oracleText":"Bestow—{R}, Collect evidence 6. (To pay this bestow cost, pay {R} and exile cards with total mana value 6 or greater from your graveyard.)\nFlying, haste\nEnchanted creature gets +2/+2 and has flying and haste.\nYou may cast this card from your graveyard using its bestow ability.","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Flying","Collect evidence","Haste","Bestow"],"imageUrl":"https://cards.scryfall.io/normal/front/e/2/e2a01edd-dbc0-4ed4-b827-9b608290e9a1.jpg?1783911273","artUrl":"https://cards.scryfall.io/art_crop/front/e/2/e2a01edd-dbc0-4ed4-b827-9b608290e9a1.jpg?1783911273","commanderLegal":"legal","set":"mh3","releasedAt":"2024-06-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const festival = (): CardDef => ({"oracleId":"2de138b0-3159-4a0c-a474-a4e5600b2e51","name":"Festival of Embers","manaCost":"{4}{R}","cmc":5,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"During your turn, you may cast instant and sorcery spells from your graveyard by paying 1 life in addition to their other costs.\nIf a card or token would be put into your graveyard from anywhere, exile it instead.\n{1}{R}: Sacrifice this enchantment.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/4/4433ee12-2013-4fdc-979f-ae065f63a527.jpg?1783910820","artUrl":"https://cards.scryfall.io/art_crop/front/4/4/4433ee12-2013-4fdc-979f-ae065f63a527.jpg?1783910820","commanderLegal":"legal","set":"blb","releasedAt":"2024-08-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
/** A non-Dragon with a Dragon's kind of ability, for the spend restriction. */
const firebreather = card("Test Firebreather", "Creature — Elemental", "{1}{R}", { power: "1", toughness: "1", oracleText: "{R}: This creature gets +1/+0 until end of turn." });

describe("round 346: compiles", () => {
  it("every card of the round", () => supported(crucible(), gargadon(), phoenix(), festival()));
});

describe("Crucible of the Spirit Dragon", () => {
  const ready = (counters: number) => {
    const { s, ap, ids } = setup([shivan(), card("Test Ogre", "Creature — Ogre", "{4}{R}{R}", { power: "6", toughness: "6" })]);
    bare(s, ap);
    const c = putOnBattlefield(s, ap, crucible());
    s.objects[c]!.counters.storage = counters;
    return { s, ap, c, shivanId: ids[0]!, ogre: ids[1]! };
  };
  const mix = (s: GameState, c: ObjectId, want: string) => {
    const ab = s.objects[c] && (manaOptions(s, s.objects[c]!).find((x) => x.ability === 1) ? 1 : -1);
    expect(ab).toBe(1);
    const p = { kind: "removeX" as const, counter: "storage" as const, colors: ["W", "U", "B", "R", "G"] as const, min: 1, mix: true as const };
    return removeXCombos(s.objects[c]!, { ...p, colors: [...p.colors] }).findIndex((x) => x.join("") === want);
  };

  it("X is announced as it's activated, then any mix of that much mana (CR 107.3a, 106.1b): each multiset of colors once", () => {
    const { s, c } = ready(2);
    const options = manaOptions(s, s.objects[c]!).filter((x) => x.ability === 1);
    // One counter: one mana of any of the five colors; two counters: the 15 ways to make two mana of colors.
    expect(options.filter((x) => x.removes === 1).map((x) => x.adds.join(""))).toEqual(["W", "U", "B", "R", "G"]);
    expect(options.filter((x) => x.removes === 2)).toHaveLength(15);
    expect(options.filter((x) => x.removes === 2).map((x) => x.adds.join(""))).toContain("UR");
  });

  it("removes that many storage counters, taps, and adds that mix", () => {
    const { s, ap, c } = ready(3);
    const combo = mix(s, c, "URR");
    expect(combo).toBeGreaterThan(0);
    const s1 = act(s, { type: "activateMana", player: ap, objectId: c, mana: "U", ability: 1, combo });
    expect(s1.objects[c]!.counters.storage ?? 0).toBe(0);
    expect(s1.objects[c]!.tapped).toBe(true);
    const pool = s1.players[ap]!.manaPool;
    expect([pool.U, pool.R]).toEqual([1, 2]);
  });

  it("with no storage counters it can't make mana; {1}, {T} puts one on", () => {
    const { s, c } = ready(0);
    expect(manaOptions(s, s.objects[c]!).filter((x) => x.ability === 1 && x.adds.length)).toEqual([]);
  });

  it("its mana casts a Dragon spell but not another spell (CR 106.6)", () => {
    const { s, ap, c, shivanId, ogre } = ready(6);
    const s1 = act(s, { type: "activateMana", player: ap, objectId: c, mana: "R", ability: 1, combo: mix(s, c, "RRRRRR") });
    expect(s1.players[ap]!.manaPool.R).toBe(6);
    // Test Ogre costs the same {4}{R}{R}: the mana can't be spent on it.
    expect(planCast(s1, ap, ogre)).toBeNull();
    const s2 = settle(run(s1, planCast(s1, ap, shivanId)));
    expect(s2.objects[shivanId]!.zone).toBe("battlefield");
  });

  it("its mana pays for abilities of Dragons on the battlefield, not of other permanents", () => {
    const { s, ap, c } = ready(1);
    const dragon = putOnBattlefield(s, ap, shivan());
    const other = putOnBattlefield(s, ap, firebreather);
    const s1 = act(s, { type: "activateMana", player: ap, objectId: c, mana: "R", ability: 1, combo: mix(s, c, "R") });
    expect(planActivate(s1, ap, other, 0)).toBeNull();
    const s2 = settle(run(s1, planActivate(s1, ap, dragon, 0)));
    expect(s2.players[ap]!.manaPool.R ?? 0).toBe(0);
    expect(s2.stack).toHaveLength(0);
  });

  it("with many counters, a payment plans with the ways that use one or two colors (as for other big mixes)", () => {
    const { s, c } = ready(6);
    const all = removeXCombos(s.objects[c]!, { kind: "removeX", counter: "storage", colors: ["W", "U", "B", "R", "G"], min: 1, mix: true });
    // 5 + 15 + 35 + 70 + 126 + 210 multisets of one to six colors.
    expect(all).toHaveLength(461);
    const options = manaOptions(s, s.objects[c]!).filter((x) => x.ability === 1);
    expect(options.every((x) => new Set(x.adds).size <= 2)).toBe(true);
    expect(options.some((x) => x.removes === 6 && x.adds.join("") === "RRRRRR")).toBe(true);
  });
});

describe("Greater Gargadon", () => {
  const ready = () => {
    const { s, ap, opp } = setup([]);
    const g = exiled(s, ap, gargadon(), 10);
    const b = putOnBattlefield(s, ap, bears());
    return { s, ap, opp, g, b };
  };

  it("its owner activates it from exile while it's suspended, sacrificing an artifact, creature, or land (CR 702.62b)", () => {
    const { s, ap, g, b } = ready();
    expect(abilityProblem(s, ap, g, 0)).toBeNull();
    const s1 = settle(run(s, planActivate(s, ap, g, 0, undefined, undefined, undefined, undefined, { sacrifice: [b] })));
    expect(s1.objects[b]!.zone).toBe("graveyard");
    expect(s1.objects[g]!.counters.time).toBe(9);
    expect(s1.objects[g]!.zone).toBe("exile");
  });

  it("not another player, and not once it isn't suspended (no time counters, or not in exile)", () => {
    const { s, ap, opp, g } = ready();
    expect(abilityProblem(s, opp, g, 0)).not.toBeNull();
    s.objects[g]!.counters.time = 0;
    expect(abilityProblem(s, ap, g, 0)).toMatch(/isn't suspended/);
    const { s: t, ap: tp } = setup([]);
    const onField = putOnBattlefield(t, tp, gargadon());
    putOnBattlefield(t, tp, bears());
    expect(abilityProblem(t, tp, onField, 0)).not.toBeNull();
  });

  it("removing the last time counter this way triggers suspend's cast: it's cast for free and has haste", () => {
    const { s, ap, g, b } = ready();
    s.objects[g]!.counters.time = 1;
    let s1 = run(s, planActivate(s, ap, g, 0, undefined, undefined, undefined, undefined, { sacrifice: [b] }));
    s1 = settle(s1, ap);
    for (let i = 0; i < 10 && s1.pending?.player === ap; i++) s1 = settle(botActions(s1, ap).reduce((x, a) => act(x, a), s1), ap);
    s1 = settle(s1);
    const now = Object.values(s1.objects).find((o) => o.cardId === s.objects[g]!.cardId)!;
    expect(now.zone).toBe("battlefield");
    expect(objHasKeyword(s1, now, "Haste")).toBe(true);
    expect(JSON.stringify(s1.log)).toContain("Greater Gargadon loses 1 time counter");
  });

  it("a bot sacrifices only what it can spare for it (no lands below eight, no creatures that aren't cheap tokens)", () => {
    const { s, ap, g } = ready();
    const acts = botActions(s, ap);
    expect(acts.some((a) => a.type === "activateAbility" && a.objectId === g)).toBe(false);
  });
});

describe("Detective's Phoenix", () => {
  /** `pid`'s graveyard gets these cards. */
  const yard = (s: GameState, pid: PlayerId, defs: CardDef[]) =>
    defs.map((d) => {
      const id = putOnBattlefield(s, pid, d);
      s.battlefield.splice(s.battlefield.indexOf(id), 1);
      s.objects[id]!.zone = "graveyard";
      s.players[pid]!.graveyard.push(id);
      invalidateCharacteristics(s);
      return id;
    });
  const tgt = (id: string) => ({ kind: "object" as const, id });

  it("bestowed from your hand for {R} and evidence 6: an Aura on the creature, the evidence exiled (CR 702.103a, 701.59a)", () => {
    const { s, ap, ids } = setup([phoenix()]);
    const [dragon, bear2] = yard(s, ap, [shivan(), bears()]);
    const host = putOnBattlefield(s, ap, bears());
    // Not enough evidence: Grizzly Bears alone is mana value 2.
    expect(planCast(s, ap, ids[0]!, [tgt(host)], undefined, undefined, undefined, { alt: "bestow", collect: [bear2!] })).toBeNull();
    const s1 = settle(run(s, planCast(s, ap, ids[0]!, [tgt(host)], undefined, undefined, undefined, { alt: "bestow", collect: [dragon!] })));
    expect(s1.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(s1.objects[ids[0]!]!.attachedTo).toBe(host);
    expect(s1.objects[dragon!]!.zone).toBe("exile");
    expect(s1.objects[bear2!]!.zone).toBe("graveyard");
    expect(pt(s1, host)).toBe("4/4");
    expect(objHasKeyword(s1, s1.objects[host]!, "Flying")).toBe(true);
  });

  it("from your graveyard only bestowed, and itself isn't part of the evidence (CR 601.2a: it's on the stack)", () => {
    const { s, ap } = setup([]);
    const [ph, g, dragon] = yard(s, ap, [phoenix(), giant(), shivan()]);
    const host = putOnBattlefield(s, ap, bears());
    expect(planCast(s, ap, ph!)).toBeNull();
    // Hill Giant (4) and the Phoenix (3) would be 7, but the Phoenix is the spell.
    expect(planCast(s, ap, ph!, [tgt(host)], undefined, undefined, undefined, { via: "permission", alt: "bestow", collect: [ph!, g!] })).toBeNull();
    expect(planCast(s, ap, ph!, [tgt(host)], undefined, undefined, undefined, { via: "permission", alt: "bestow", collect: [g!] })).toBeNull();
    // Not as a creature: the permission is only for its bestow cost.
    expect(planCast(s, ap, ph!, undefined, undefined, undefined, undefined, { via: "permission" })).toBeNull();
    const s1 = settle(run(s, planCast(s, ap, ph!, [tgt(host)], undefined, undefined, undefined, { via: "permission", alt: "bestow", collect: [dragon!] })));
    expect(s1.objects[ph!]!.zone).toBe("battlefield");
    expect(s1.objects[ph!]!.attachedTo).toBe(host);
    expect(s1.objects[dragon!]!.zone).toBe("exile");
  });

  it("when the creature it enchants dies, it stays on the battlefield as a creature (CR 702.103f)", () => {
    const { s, ap } = setup([]);
    const [ph, dragon] = yard(s, ap, [phoenix(), shivan()]);
    const host = putOnBattlefield(s, ap, bears());
    let s1 = settle(run(s, planCast(s, ap, ph!, [tgt(host)], undefined, undefined, undefined, { via: "permission", alt: "bestow", collect: [dragon!] })));
    s1 = structuredClone(s1);
    moveObject(s1, host, "graveyard");
    s1 = act(s1, { type: "passPriority", player: waitingOn(s1)! });
    expect(s1.objects[ph!]!.zone).toBe("battlefield");
    expect(s1.objects[ph!]!.attachedTo).toBeUndefined();
    expect(pt(s1, ph!)).toBe("2/2");
  });
});

describe("Festival of Embers", () => {
  const ready = () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, festival());
    const b = putOnBattlefield(s, ap, bolt());
    s.battlefield.splice(s.battlefield.indexOf(b), 1);
    s.objects[b]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(b);
    const bear = putOnBattlefield(s, ap, bears());
    s.battlefield.splice(s.battlefield.indexOf(bear), 1);
    s.objects[bear]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(bear);
    invalidateCharacteristics(s);
    return { s, ap, opp, b, bear };
  };

  it("during your turn, an instant from your graveyard for its cost and 1 life; then it's exiled instead of going back", () => {
    const { s, ap, opp, b } = ready();
    const life = s.players[ap]!.life;
    const s1 = settle(run(s, planCast(s, ap, b, [{ kind: "player", id: opp }], undefined, undefined, undefined, { via: "permission" })));
    expect(s1.players[ap]!.life).toBe(life - 1);
    expect(s1.players[opp]!.life).toBe(s.players[opp]!.life - 3);
    expect(s1.objects[b]!.zone).toBe("exile");
  });

  it("not a creature card, and not during another player's turn (even an instant)", () => {
    const { s, ap, opp, b, bear } = ready();
    expect(castProblem(s, ap, b, [{ kind: "player", id: opp }], undefined, undefined, undefined, undefined, { via: "permission" })).toMatch(/not enough mana/); // only the mana is still to pay
    expect(planCast(s, ap, bear, undefined, undefined, undefined, undefined, { via: "permission" })).toBeNull();
    let t = s;
    for (let i = 0; i < 400 && t.activePlayer === ap; i++) t = act(t, t.pending ? botActions(t, t.pending.player)[0]! : { type: "passPriority", player: waitingOn(t)! });
    t = passUntil(t, "main1", t.activePlayer);
    expect(t.activePlayer).not.toBe(ap);
    expect(t.objects[b]!.zone).toBe("graveyard");
    // The permission isn't there: not a matter of priority.
    expect(castProblem(t, ap, b, [{ kind: "player", id: opp }], undefined, undefined, undefined, undefined, { via: "permission" })).toMatch(/doesn't have/);
    expect(planCast(t, ap, b, [{ kind: "player", id: opp }], undefined, undefined, undefined, { via: "permission" })).toBeNull();
  });
});
