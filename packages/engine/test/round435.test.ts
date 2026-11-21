// Round 435 (Lane A): March from Velis Vel (lands of a chosen nonbasic land type become copies of a creature until end of
// turn, with haste; CR 205.3i, 611.2c, 707.2) and Ludevic, Necrogenius // Olag, Ludevic's Hubris (a cost exiling X creature
// cards, linked to the back face, CR 607.1b, 607.2a; Olag a copy of one of them as it transforms, CR 712.20, rulings).

import { describe, expect, it } from "vitest";
import { act, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf } from "../src/cards";
import { applyAction, botActions, characteristics, defOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const march = (): CardDef => ({"oracleId":"25ba6f57-3d50-4c3e-ab55-284e91d684a6","name":"March from Velis Vel","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose a nonbasic land type. Each land you control of that type becomes a copy of target creature you control until end of turn and gains haste until end of turn.\nFlashback {4}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["U"],"colorIdentity":["U"],"keywords":["Flashback"],"imageUrl":"https://cards.scryfall.io/normal/front/4/e/4ef5716a-5f4d-4e51-a91f-6990a2f8413f.jpg?1783911410","artUrl":"https://cards.scryfall.io/art_crop/front/4/e/4ef5716a-5f4d-4e51-a91f-6990a2f8413f.jpg?1783911410","commanderLegal":"legal","set":"m3c","releasedAt":"2024-06-14","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const ludevic = (): CardDef => ({"oracleId":"f6f684f6-0c8a-4676-ba4e-d3e064293128","name":"Ludevic, Necrogenius // Olag, Ludevic's Hubris","manaCost":"{U}{B}","cmc":2,"typeLine":"Legendary Creature — Human Wizard // Legendary Creature — Zombie","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"Whenever Ludevic enters or attacks, mill a card.\n{X}{U}{U}{B}{B}, Exile X creature cards from your graveyard: Transform Ludevic. X can't be 0. Activate only as a sorcery.","power":"2","toughness":"3","colors":["B","U"],"colorIdentity":["B","U"],"keywords":["Transform","Mill"],"imageUrl":"https://cards.scryfall.io/normal/front/6/1/61a15b38-30f9-4d8e-9511-57a1c11304d0.jpg?1783924344","artUrl":"https://cards.scryfall.io/art_crop/front/6/1/61a15b38-30f9-4d8e-9511-57a1c11304d0.jpg?1783924344","commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"rare","layout":"transform","gameChanger":false,"faces":[{"name":"Ludevic, Necrogenius","manaCost":"{U}{B}","typeLine":"Legendary Creature — Human Wizard","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Wizard"],"oracleText":"Whenever Ludevic enters or attacks, mill a card.\n{X}{U}{U}{B}{B}, Exile X creature cards from your graveyard: Transform Ludevic. X can't be 0. Activate only as a sorcery.","power":"2","toughness":"3","colors":["B","U"],"imageUrl":"https://cards.scryfall.io/normal/front/6/1/61a15b38-30f9-4d8e-9511-57a1c11304d0.jpg?1783924344","artUrl":"https://cards.scryfall.io/art_crop/front/6/1/61a15b38-30f9-4d8e-9511-57a1c11304d0.jpg?1783924344"},{"name":"Olag, Ludevic's Hubris","manaCost":"","typeLine":"Legendary Creature — Zombie","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Zombie"],"oracleText":"As this creature transforms into Olag, Ludevic's Hubris, it becomes a copy of a creature card exiled with it, except its name is Olag, Ludevic's Hubris, it's 4/4, and it's a legendary blue and black Zombie in addition to its other colors and types. Put a number of +1/+1 counters on Olag equal to the number of creature cards exiled with it.","power":"4","toughness":"4","colors":["B","U"],"colorIndicator":["B","U"],"imageUrl":"https://cards.scryfall.io/normal/back/6/1/61a15b38-30f9-4d8e-9511-57a1c11304d0.jpg?1783924344","artUrl":"https://cards.scryfall.io/art_crop/back/6/1/61a15b38-30f9-4d8e-9511-57a1c11304d0.jpg?1783924344"}]} as CardDef);
const azorius = (): CardDef => ({"oracleId":"ad1712d8-809f-410c-8b91-ffe6fb8a69a1","name":"Azorius Guildgate","manaCost":"","cmc":0,"typeLine":"Land — Gate","supertypes":[],"types":["Land"],"subtypes":["Gate"],"oracleText":"This land enters tapped.\n{T}: Add {W} or {U}.","colors":[],"colorIdentity":["U","W"],"keywords":[],"producedMana":["U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/9/3/93cf5412-c711-41b4-ab3b-7788a0a22228.jpg?1783933620","artUrl":"https://cards.scryfall.io/art_crop/front/9/3/93cf5412-c711-41b4-ab3b-7788a0a22228.jpg?1783933620","commanderLegal":"legal","set":"rna","releasedAt":"2019-01-25","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const simic = (): CardDef => ({"oracleId":"e8705df9-6439-4930-91b6-229f818559af","name":"Simic Guildgate","manaCost":"","cmc":0,"typeLine":"Land — Gate","supertypes":[],"types":["Land"],"subtypes":["Gate"],"oracleText":"This land enters tapped.\n{T}: Add {G} or {U}.","colors":[],"colorIdentity":["G","U"],"keywords":[],"producedMana":["G","U"],"imageUrl":"https://cards.scryfall.io/normal/front/6/2/62537433-3c49-417d-89ef-c12d5288bb6f.jpg?1783933612","artUrl":"https://cards.scryfall.io/art_crop/front/6/2/62537433-3c49-417d-89ef-c12d5288bb6f.jpg?1783933612","commanderLegal":"legal","set":"rna","releasedAt":"2019-01-25","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const urzasMine = (): CardDef => ({"oracleId":"33e85a8a-86df-4cdc-a9cc-8cbabe92c3c0","name":"Urza's Mine","manaCost":"","cmc":0,"typeLine":"Land — Urza's Mine","supertypes":[],"types":["Land"],"subtypes":["Urza's","Mine"],"oracleText":"{T}: Add {C}. If you control an Urza's Power-Plant and an Urza's Tower, add {C}{C} instead.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/5/4/546e0452-5304-41fa-9e3a-a3fa5a571315.jpg?1783930064","artUrl":"https://cards.scryfall.io/art_crop/front/5/4/546e0452-5304-41fa-9e3a-a3fa5a571315.jpg?1783930064","commanderLegal":"legal","set":"2xm","releasedAt":"2020-08-07","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const shivan = (): CardDef => ({"oracleId":"711eea87-0fa3-46e0-a42b-fa5a86455f04","name":"Shivan Dragon","manaCost":"{4}{R}{R}","cmc":6,"typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\n{R}: This creature gets +1/+0 until end of turn.","power":"5","toughness":"5","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/2/9/294ca89d-549a-4302-9284-df5b4e833a69.jpg?1789446860","artUrl":"https://cards.scryfall.io/art_crop/front/2/9/294ca89d-549a-4302-9284-df5b4e833a69.jpg?1789446860","commanderLegal":"legal","set":"sld","releasedAt":"2026-08-31","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const giant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false} as CardDef);

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
/** Everyone passes (no attacks, no blocks; a bot answers anything else) until `done` holds. */
const passTill = (s: GameState, done: (s: GameState) => boolean) => {
  for (let i = 0; i < 4000 && !done(s); i++) {
    const pid = waitingOn(s)!;
    if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
    else if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
    else if (s.pending?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, s.pending.count) });
    else if (s.pending) s = run(s, botActions(s, pid));
    else s = act(s, { type: "passPriority", player: pid });
  }
  if (!done(s)) throw new Error("never got there");
  return s;
};
/** A card of `def` owned by `pid`, put into `where`. */
const place = (s: GameState, pid: PlayerId, def: CardDef, where: "graveyard" | "hand") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  s.players[pid]![where].push(id);
  invalidateCharacteristics(s);
  return id;
};
const ch = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!);
const pt = (s: GameState, id: ObjectId) => `${ch(s, id).power}/${ch(s, id).toughness}`;
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const choose = (s: GameState, pid: PlayerId, choice: string) => act(s, { type: "chooseOption", player: pid, choice });

describe("round 435: compiles", () => {
  it("both cards, both of Ludevic's faces", () => {
    expect(isFullySupported(march())).toBe(true);
    expect(isFullySupported(ludevic())).toBe(true);
  });
});

describe("March from Velis Vel", () => {
  const scene = () => {
    const { s, ap, opp, ids } = setup([march()]);
    const dragon = putOnBattlefield(s, ap, shivan());
    const gates = [putOnBattlefield(s, ap, azorius(), { sick: true }), putOnBattlefield(s, ap, simic())];
    const mine = putOnBattlefield(s, ap, urzasMine());
    const theirGate = putOnBattlefield(s, opp, azorius());
    return { s, ap, opp, m: ids[0]!, dragon, gates, mine, theirGate };
  };

  it("the type is chosen as it resolves, among the nonbasic land types; each land you control of it becomes a copy with haste", () => {
    const { s: s0, ap, m, dragon, gates, mine, theirGate } = scene();
    s0.objects[dragon]!.counters["+1/+1"] = 2;
    s0.objects[dragon]!.tapped = true;
    let s = settle(run(s0, planCast(s0, ap, m, [{ kind: "object", id: dragon }])), ap);
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("landType");
    const opts = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    expect(opts).toContain("Gate");
    expect(opts).toContain("Urza's");
    expect(opts).not.toContain("Forest");
    expect(opts).toHaveLength(12);
    expect(() => choose(s, ap, "Island")).toThrow();
    s = settle(choose(s, ap, "Gate"), ap);
    for (const g of gates) {
      expect(ch(s, g).name).toBe("Shivan Dragon");
      expect(ch(s, g).types).toEqual(["Creature"]);
      // Its copiable values only: no counters, not tapped (rulings).
      expect(pt(s, g)).toBe("5/5");
      expect(s.objects[g]!.tapped).toBe(false);
      expect(ch(s, g).keywords).toContain("Flying");
      expect(ch(s, g).keywords).toContain("Haste");
    }
    // Not a Gate it doesn't control, nor its Urza's land, nor the creature itself.
    expect(ch(s, theirGate).name).toBe("Azorius Guildgate");
    expect(ch(s, mine).name).toBe("Urza's Mine");
    expect(pt(s, dragon)).toBe("7/7");
    expect(zone(s, m)).toBe("graveyard");
  });

  it("the lands are fixed as it resolves, and are lands again at end of turn", () => {
    const { s: s0, ap, m, dragon, gates } = scene();
    let s = settle(run(s0, planCast(s0, ap, m, [{ kind: "object", id: dragon }])), ap);
    s = settle(choose(s, ap, "Gate"), ap);
    // A Gate that arrives later isn't affected.
    const later = putOnBattlefield(s, ap, azorius());
    expect(ch(s, later).name).toBe("Azorius Guildgate");
    // The copies have haste even though one came under its control this turn.
    expect(ch(s, gates[0]!).keywords).toContain("Haste");
    s = passTill(s, (x) => x.turn !== s0.turn);
    for (const g of gates) {
      expect(ch(s, g).types).toEqual(["Land"]);
      expect(ch(s, g).keywords).not.toContain("Haste");
    }
    expect(ch(s, gates[0]!).name).toBe("Azorius Guildgate");
  });

  it("a chosen type you control no land of does nothing; an illegal target counters it before any choice", () => {
    const { s: s0, ap, m, dragon, gates } = scene();
    let s = settle(run(s0, planCast(s0, ap, m, [{ kind: "object", id: dragon }])), ap);
    s = settle(choose(s, ap, "Desert"), ap);
    expect(ch(s, gates[0]!).name).toBe("Azorius Guildgate");
    expect(JSON.stringify(s.log)).toMatch(/controls no Desert/);
    const { s: t0, ap: ap2, m: m2, dragon: d2 } = scene();
    let t = run(t0, planCast(t0, ap2, m2, [{ kind: "object", id: d2 }]));
    t.objects[d2]!.zone = "graveyard";
    t.battlefield.splice(t.battlefield.indexOf(d2), 1);
    t.players[ap2]!.graveyard.push(d2);
    t.objects[d2]!.zoneChanges = (t.objects[d2]!.zoneChanges ?? 0) + 1;
    invalidateCharacteristics(t);
    t = settle(t, ap2);
    expect(t.pending).toBeNull();
    expect(zone(t, m2)).toBe("graveyard");
  });

  it("can be cast with flashback from the graveyard, then exiled", () => {
    const { s: s0, ap, m, dragon, mine } = scene();
    s0.objects[m]!.zone = "graveyard";
    s0.players[ap]!.hand.splice(s0.players[ap]!.hand.indexOf(m), 1);
    s0.players[ap]!.graveyard.push(m);
    let s = settle(run(s0, planCast(s0, ap, m, [{ kind: "object", id: dragon }], undefined, undefined, undefined, { via: "flashback" })), ap);
    s = settle(choose(s, ap, "Urza's"), ap);
    expect(ch(s, mine).name).toBe("Shivan Dragon");
    expect(zone(s, m)).toBe("exile");
  });

  it("bots choose the type they control the most lands of", () => {
    const { s: s0, ap, m, dragon, gates } = scene();
    let s = settle(run(s0, planCast(s0, ap, m, [{ kind: "object", id: dragon }])), ap);
    const pick = botActions(s, ap)[0];
    expect(pick?.type === "chooseOption" && pick.choice).toBe("Gate");
    s = settle(act(s, pick!), ap);
    expect(ch(s, gates[1]!).name).toBe("Shivan Dragon");
  });
});

describe("Ludevic, Necrogenius // Olag, Ludevic's Hubris", () => {
  const scene = () => {
    const { s, ap, opp } = setup([]);
    const lud = putOnBattlefield(s, ap, ludevic());
    const yard = [place(s, ap, shivan(), "graveyard"), place(s, ap, giant(), "graveyard"), place(s, ap, bears(), "graveyard")];
    const land = place(s, ap, azorius(), "graveyard");
    const index = abilitiesOf(s, s.objects[lud]!).activated.findIndex((a) => /Transform/.test(a.text));
    return { s, ap, opp, lud, yard, land, index };
  };

  it("X creature cards exiled as a cost; Olag becomes a copy of the one chosen as it transforms, with that many +1/+1 counters", () => {
    const { s: s0, ap, lud, yard, index } = scene();
    let s = run(s0, planActivate(s0, ap, lud, index, undefined, undefined, undefined, 2, { exileCards: [yard[0]!, yard[1]!] }));
    expect(zone(s, yard[0]!)).toBe("exile");
    expect(zone(s, yard[1]!)).toBe("exile");
    s = settle(s, ap);
    expect(s.pending?.kind === "chooseOption" && s.pending.what).toBe("transformCopy");
    expect(s.pending?.kind === "chooseOption" && s.pending.labels).toEqual(["Shivan Dragon", "Hill Giant"]);
    s = settle(choose(s, ap, yard[0]!), ap);
    const c = ch(s, lud);
    expect(c.name).toBe("Olag, Ludevic's Hubris");
    expect(pt(s, lud)).toBe("6/6");
    expect(s.objects[lud]!.counters["+1/+1"]).toBe(2);
    expect(c.supertypes).toContain("Legendary");
    expect(c.subtypes).toEqual(expect.arrayContaining(["Dragon", "Zombie"]));
    expect([...c.colors].sort()).toEqual(["B", "R", "U"]);
    expect(c.keywords).toContain("Flying");
    // Shivan Dragon's firebreathing came with the copy.
    expect(abilitiesOf(s, s.objects[lud]!).activated.some((a) => /gets \+1\/\+0/.test(a.text))).toBe(true);
    // It stays a copy once that card leaves exile (rulings).
    s.objects[yard[0]!]!.zone = "graveyard";
    s.players[ap]!.graveyard.push(yard[0]!);
    invalidateCharacteristics(s);
    expect(ch(s, lud).name).toBe("Olag, Ludevic's Hubris");
    expect(ch(s, lud).subtypes).toContain("Dragon");
  });

  it("with one card nothing is asked; X can't be 0, only creature cards, only as a sorcery", () => {
    const { s: s0, ap, lud, yard, land, index } = scene();
    expect(planActivate(s0, ap, lud, index, undefined, undefined, undefined, 0, { exileCards: [] })).toBeNull();
    expect(planActivate(s0, ap, lud, index, undefined, undefined, undefined, 1, { exileCards: [land] })).toBeNull();
    let s = settle(run(s0, planActivate(s0, ap, lud, index, undefined, undefined, undefined, 1, { exileCards: [yard[1]!] })), ap);
    expect(s.pending).toBeNull();
    expect(ch(s, lud).name).toBe("Olag, Ludevic's Hubris");
    expect(pt(s, lud)).toBe("5/5");
    expect(ch(s, lud).subtypes).toEqual(expect.arrayContaining(["Giant", "Zombie"]));
    const { s: t0, ap: ap2, lud: l2, yard: y2, index: i2 } = scene();
    t0.step = "beginCombat";
    expect(planActivate(t0, ap2, l2, i2, undefined, undefined, undefined, 1, { exileCards: [y2[1]!] })).toBeNull();
  });

  it("with the cards gone from exile as it resolves, Olag is its own 4/4 with no counters (rulings)", () => {
    const { s: s0, ap, lud, yard, index } = scene();
    let s = run(s0, planActivate(s0, ap, lud, index, undefined, undefined, undefined, 2, { exileCards: [yard[0]!, yard[1]!] }));
    for (const id of [yard[0]!, yard[1]!]) {
      s.objects[id]!.zone = "graveyard";
      s.objects[id]!.zoneChanges = (s.objects[id]!.zoneChanges ?? 0) + 1;
      s.players[ap]!.graveyard.push(id);
    }
    s = settle(s, ap);
    expect(s.pending).toBeNull();
    expect(ch(s, lud).name).toBe("Olag, Ludevic's Hubris");
    expect(pt(s, lud)).toBe("4/4");
    expect(s.objects[lud]!.counters["+1/+1"] ?? 0).toBe(0);
    expect(ch(s, lud).subtypes).toEqual(["Zombie"]);
  });

  it("a bot copies the biggest creature card", () => {
    const { s: s0, ap, lud, yard, index } = scene();
    let s = settle(run(s0, planActivate(s0, ap, lud, index, undefined, undefined, undefined, 3, { exileCards: [yard[2]!, yard[1]!, yard[0]!] })), ap);
    const pick = botActions(s, ap)[0];
    expect(pick?.type === "chooseOption" && pick.choice).toBe(yard[0]);
    s = settle(act(s, pick!), ap);
    expect(pt(s, lud)).toBe("7/7");
  });
});
