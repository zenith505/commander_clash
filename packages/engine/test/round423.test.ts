// Round 423: Dermotaxi (an imprint from any graveyard as it enters, CR 614.12a; a copy of that linked card as printed
// until end of turn, CR 607.2a, 707.2, 707.9b), Verrak, Warped Sengir ("if life was paid to activate it": its costs, Phyrexian mana paid with life too, CR
// 602.2b, 107.4f, 603.4; "pay that much life again", CR 119.4; the copy, CR 707.10) and Mirror of the Forebears (a copy
// of a creature of the chosen type until end of turn, CR 707.2, 611.2; the type chosen for the Mirror isn't the copy's,
// rulings).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const verrak = (): CardDef => ({"oracleId":"04853f06-3fd2-445d-9b0d-d68d0f116635","name":"Verrak, Warped Sengir","manaCost":"{1}{W}{B}","cmc":3,"typeLine":"Legendary Creature — Vampire","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Vampire"],"oracleText":"Flying, deathtouch, lifelink\nWhenever you activate an ability that isn't a mana ability, if life was paid to activate it, you may pay that much life again. If you do, copy that ability. You may choose new targets for the copy.","power":"2","toughness":"2","colors":["B","W"],"colorIdentity":["B","W"],"keywords":["Deathtouch","Flying","Lifelink"],"imageUrl":"https://cards.scryfall.io/normal/front/8/c/8ca7f49a-ab5a-49de-b07b-96c803daaf7d.jpg?1783921470","artUrl":"https://cards.scryfall.io/art_crop/front/8/c/8ca7f49a-ab5a-49de-b07b-96c803daaf7d.jpg?1783921470","commanderLegal":"legal","set":"dmc","releasedAt":"2022-09-09","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const greed = (): CardDef => ({"oracleId":"1ff62220-be95-4901-b8d8-812b9a1a1b0a","name":"Greed","manaCost":"{3}{B}","cmc":4,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"{B}, Pay 2 life: Draw a card.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/6/86ee3699-7fbb-4662-ba36-a1a7e19d161d.jpg?1783921568","artUrl":"https://cards.scryfall.io/art_crop/front/8/6/86ee3699-7fbb-4662-ba36-a1a7e19d161d.jpg?1783921568","commanderLegal":"legal","set":"sld","releasedAt":"2022-08-11","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const dragon = (): CardDef => ({"oracleId":"dc2d67bb-29b3-43d7-8ebf-2100c5287bbf","name":"Moltensteel Dragon","manaCost":"{4}{R/P}{R/P}","cmc":6,"typeLine":"Artifact Creature — Phyrexian Dragon","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Phyrexian","Dragon"],"oracleText":"({R/P} can be paid with either {R} or 2 life.)\nFlying\n{R/P}: This creature gets +1/+0 until end of turn.","power":"4","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"imageUrl":"https://cards.scryfall.io/normal/front/1/3/13b78018-bfbe-43fa-809f-9b52a155e11c.jpg?1783941307","artUrl":"https://cards.scryfall.io/art_crop/front/1/3/13b78018-bfbe-43fa-809f-9b52a155e11c.jpg?1783941307","commanderLegal":"legal","set":"nph","releasedAt":"2011-05-13","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const confluence = (): CardDef => ({"oracleId":"d0ee5bdc-2b69-4b73-9a20-ffcc18783b29","name":"Mana Confluence","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}, Pay 1 life: Add one mana of any color.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/4/e/4eafa4f8-3b9b-4e20-97bf-8f547e970752.jpg?1783937931","artUrl":"https://cards.scryfall.io/art_crop/front/4/e/4eafa4f8-3b9b-4e20-97bf-8f547e970752.jpg?1783937931","commanderLegal":"legal","set":"exp","releasedAt":"2016-01-22","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const mirror = (): CardDef => ({"oracleId":"9eaeb54b-73a8-43cc-b4d8-ed8b5eb19646","name":"Mirror of the Forebears","manaCost":"{2}","cmc":2,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"As this artifact enters, choose a creature type.\n{1}: Until end of turn, this artifact becomes a copy of target creature you control of the chosen type, except it's an artifact in addition to its other types.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/2/82e96f29-ce98-4e2d-8035-da3994ab66db.jpg?1783935931","artUrl":"https://cards.scryfall.io/art_crop/front/8/2/82e96f29-ce98-4e2d-8035-da3994ab66db.jpg?1783935931","commanderLegal":"legal","set":"c17","releasedAt":"2017-08-25","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const automaton = (): CardDef => ({"oracleId":"53c730c6-2f8c-4af8-b400-b9d573a71e60","name":"Adaptive Automaton","manaCost":"{3}","cmc":3,"typeLine":"Artifact Creature — Construct","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Construct"],"oracleText":"As this creature enters, choose a creature type.\nThis creature is the chosen type in addition to its other types.\nOther creatures you control of the chosen type get +1/+1.","power":"2","toughness":"2","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/f/2f038672-d03c-4349-9261-1b76ae4594c6.jpg?1783919213","artUrl":"https://cards.scryfall.io/art_crop/front/2/f/2f038672-d03c-4349-9261-1b76ae4594c6.jpg?1783919213","commanderLegal":"legal","set":"sld","releasedAt":"2022-11-28","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const archdruid = (): CardDef => ({"oracleId":"6e2c2423-d854-4478-99e6-64f29851f026","name":"Elvish Archdruid","manaCost":"{1}{G}{G}","cmc":3,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"Other Elf creatures you control get +1/+1.\n{T}: Add {G} for each Elf you control.","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/1/e/1eb230a8-08d6-46a8-87fb-3c1614550f16.jpg?1783935093","artUrl":"https://cards.scryfall.io/art_crop/front/1/e/1eb230a8-08d6-46a8-87fb-3c1614550f16.jpg?1783935093","commanderLegal":"legal","set":"ddu","releasedAt":"2018-04-06","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);

const dermotaxi = (): CardDef => ({"oracleId":"b065ef1d-5cba-41f2-a4b4-a6ae479323d3","name":"Dermotaxi","manaCost":"{2}","cmc":2,"typeLine":"Artifact — Vehicle","supertypes":[],"types":["Artifact"],"subtypes":["Vehicle"],"oracleText":"Imprint — As this Vehicle enters, exile a creature card from a graveyard.\nTap two untapped creatures you control: Until end of turn, this Vehicle becomes a copy of the exiled card, except it's a Vehicle artifact in addition to its other types.","power":"0","toughness":"0","colors":[],"colorIdentity":[],"keywords":["Imprint"],"imageUrl":"https://cards.scryfall.io/normal/front/4/3/43a37428-e969-4c0c-8e1c-55d1adf9c171.jpg?1783926805","artUrl":"https://cards.scryfall.io/art_crop/front/4/3/43a37428-e969-4c0c-8e1c-55d1adf9c171.jpg?1783926805","commanderLegal":"legal","set":"mh2","releasedAt":"2021-06-18","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const angel = (): CardDef => ({"oracleId":"4b7ac066-e5c7-43e6-9e7e-2739b24a905d","name":"Serra Angel","manaCost":"{3}{W}{W}","cmc":5,"typeLine":"Creature — Angel","supertypes":[],"types":["Creature"],"subtypes":["Angel"],"oracleText":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","power":"4","toughness":"4","colors":["W"],"colorIdentity":["W"],"keywords":["Flying","Vigilance"],"imageUrl":"https://cards.scryfall.io/normal/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","artUrl":"https://cards.scryfall.io/art_crop/front/c/a/cad4c850-097e-4909-87ec-a33ef8f2ba34.jpg?1783914759","commanderLegal":"legal","set":"sld","releasedAt":"2023-10-02","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  return plan.reduce((x, a) => applyAction(x, a), s);
};
const settleBots = (s: GameState) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    s = s.pending ? botActions(s, pid).reduce((x, a) => act(x, a), s) : act(s, { type: "passPriority", player: pid });
  }
  return s;
};
/** Answers Verrak's "may" with `yes`, keeps a copy's targets, passes otherwise; how many times it was asked. */
const resolveAll = (s: GameState, ap: PlayerId, yes: boolean) => {
  let asked = 0;
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") {
      expect(p.player).toBe(ap);
      asked++;
      s = act(s, { type: "chooseMay", player: ap, yes });
    } else if (p?.kind === "copyTargets") s = act(s, { type: "copyTargets", player: p.player });
    else if (p) s = botActions(s, waitingOn(s)!).reduce((x, a) => act(x, a), s);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return { s, asked };
};
/** Taps every untapped land `pid` controls that could make red mana (so {R/P} is paid with life). */
const tapRed = (s: GameState, pid: PlayerId) => {
  for (const id of s.battlefield) {
    const o = s.objects[id]!;
    if (o.controller === pid && characteristics(s, o).subtypes.includes("Mountain")) o.tapped = true;
  }
};

describe("round 423: Verrak, Warped Sengir", () => {
  it("is fully supported", () => {
    expect(isFullySupported(verrak())).toBe(true);
  });

  it("Greed's ability, 2 life paid: pay 2 more to copy it (two cards); declined, one", () => {
    for (const yes of [true, false]) {
      const { s: s0, ap } = setup([]);
      putOnBattlefield(s0, ap, verrak());
      const g = putOnBattlefield(s0, ap, greed());
      const life = s0.players[ap]!.life;
      const hand = s0.players[ap]!.hand.length;
      const { s, asked } = resolveAll(run(s0, planActivate(s0, ap, g, 0)), ap, yes);
      expect(asked).toBe(1);
      expect(s.players[ap]!.life).toBe(life - (yes ? 4 : 2));
      expect(s.players[ap]!.hand.length).toBe(hand + (yes ? 2 : 1));
    }
  });

  it("Phyrexian mana paid with life counts (that much: 2); paid with red mana, no trigger", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, verrak());
    const d = putOnBattlefield(s0, ap, dragon());
    tapRed(s0, ap);
    const life = s0.players[ap]!.life;
    const r1 = resolveAll(run(s0, planActivate(s0, ap, d, 0)), ap, true);
    expect(r1.asked).toBe(1);
    expect(r1.s.players[ap]!.life).toBe(life - 4);
    expect(power(r1.s, r1.s.objects[d]!)).toBe(6);
    // Red mana for it: no life paid, so nothing.
    const { s: s1, ap: ap1 } = setup([]);
    putOnBattlefield(s1, ap1, verrak());
    const d1 = putOnBattlefield(s1, ap1, dragon());
    const life1 = s1.players[ap1]!.life;
    s1.players[ap1]!.manaPool.R = 1;
    const r2 = resolveAll(act(s1, { type: "activateAbility", player: ap1, objectId: d1, index: 0 }), ap1, true);
    expect(r2.asked).toBe(0);
    expect(r2.s.players[ap1]!.life).toBe(life1);
    expect(power(r2.s, r2.s.objects[d1]!)).toBe(5);
  });

  it("not for a mana ability that paid life, nor an opponent's ability", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, verrak());
    const conf = putOnBattlefield(s0, ap, confluence());
    let s = run(s0, [{ type: "activateMana", player: ap, objectId: conf, mana: "B" }]);
    expect(s.triggerQueue.length + s.stack.length).toBe(0);
    expect(s.pending).toBeNull();
    const g = putOnBattlefield(s, opp, greed());
    s.priority = opp;
    s.players[opp]!.manaPool.B = 1;
    const plan = planActivate(s, opp, g, 0);
    expect(plan).not.toBeNull();
    const r = resolveAll(run(s, plan), ap, true);
    expect(r.asked).toBe(0);
  });

  it("with less life than that left, it can't be paid: not asked, not copied", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, verrak());
    const g = putOnBattlefield(s0, ap, greed());
    s0.players[ap]!.life = 3;
    const hand = s0.players[ap]!.hand.length;
    const { s, asked } = resolveAll(run(s0, planActivate(s0, ap, g, 0)), ap, true);
    expect(asked).toBe(0);
    expect(s.players[ap]!.life).toBe(1);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("bots answer it", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, verrak());
    const g = putOnBattlefield(s0, ap, greed());
    const hand = s0.players[ap]!.hand.length;
    const s = settleBots(run(s0, planActivate(s0, ap, g, 0)));
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.hand.length).toBeGreaterThan(hand);
  });
});

describe("round 423: Mirror of the Forebears", () => {
  /** Mirror of the Forebears with `type` chosen as it entered, and its id. */
  const mirrorWith = (s: GameState, pid: PlayerId, type: string) => {
    const m = putOnBattlefield(s, pid, mirror());
    s.objects[m]!.chosen = { type };
    invalidateCharacteristics(s);
    return m;
  };
  const pass = (s: GameState) => {
    for (let i = 0; i < 50 && (s.stack.length || s.triggerQueue.length || s.pending); i++) s = s.pending ? botActions(s, waitingOn(s)!).reduce((x, a) => act(x, a), s) : act(s, { type: "passPriority", player: waitingOn(s)! });
    return s;
  };
  const pt = (s: GameState, id: ObjectId) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;

  it("is fully supported", () => {
    expect(isFullySupported(mirror())).toBe(true);
  });

  it("becomes a copy of an Elf until end of turn, an artifact too; then a Mirror with its type again", () => {
    const { s: s0, ap } = setup([]);
    const m = mirrorWith(s0, ap, "Elf");
    const druid = putOnBattlefield(s0, ap, archdruid());
    const elf = putOnBattlefield(s0, ap, elves());
    // Only a creature you control of the chosen type: not a Vampire.
    const vamp = putOnBattlefield(s0, ap, verrak());
    expect(planActivate(s0, ap, m, 0, [{ kind: "object", id: vamp }])).toBeNull();
    let s = pass(run(s0, planActivate(s0, ap, m, 0, [{ kind: "object", id: druid }])));
    const c = characteristics(s, s.objects[m]!);
    expect(c.name).toBe("Elvish Archdruid");
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    // Two Archdruids: each gets +1/+1 from the other; the Llanowar Elves +2/+2.
    expect(pt(s, m)).toBe("3/3");
    expect(pt(s, elf)).toBe("3/3");
    s = passUntil(s, "cleanup");
    s = passUntil(s, "upkeep");
    expect(characteristics(s, s.objects[m]!).name).toBe("Mirror of the Forebears");
    expect(s.objects[m]!.chosen?.type).toBe("Elf");
    expect(pt(s, elf)).toBe("2/2");
  });

  it("a copy of a creature that reads the chosen type finds none chosen (not the Mirror's)", () => {
    const { s: s0, ap } = setup([]);
    const m = mirrorWith(s0, ap, "Elf");
    const auto = putOnBattlefield(s0, ap, automaton());
    s0.objects[auto]!.chosen = { type: "Elf" };
    const elf = putOnBattlefield(s0, ap, elves());
    invalidateCharacteristics(s0);
    expect(pt(s0, elf)).toBe("2/2");
    const s = pass(run(s0, planActivate(s0, ap, m, 0, [{ kind: "object", id: auto }])));
    const c = characteristics(s, s.objects[m]!);
    expect(c.name).toBe("Adaptive Automaton");
    // The copy has no type chosen: not an Elf, no bonus for Elves; the real Automaton's +1/+1 alone.
    expect(c.subtypes).not.toContain("Elf");
    expect(pt(s, elf)).toBe("2/2");
    expect(pt(s, m)).toBe("2/2");
  });

  it("activated twice in response: each target checked by the type chosen as it was activated; the last to resolve wins", () => {
    const { s: s0, ap } = setup([]);
    const m = mirrorWith(s0, ap, "Elf");
    const druid = putOnBattlefield(s0, ap, archdruid());
    const elf = putOnBattlefield(s0, ap, elves());
    let s = run(s0, planActivate(s0, ap, m, 0, [{ kind: "object", id: druid }]));
    s = run(s, planActivate(s, ap, m, 0, [{ kind: "object", id: elf }]));
    expect(s.stack.length).toBe(2);
    // The second resolves first: a copy of the Llanowar Elves; then the first still finds the Archdruid a legal target.
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (let i = 0; i < 10 && s.stack.length === 2; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(characteristics(s, s.objects[m]!).name).toBe("Llanowar Elves");
    s = pass(s);
    expect(characteristics(s, s.objects[m]!).name).toBe("Elvish Archdruid");
  });
});

describe("round 423: Dermotaxi", () => {
  /** A card of `def` into `pid`'s graveyard; its id. */
  const toYard = (s: GameState, pid: PlayerId, def: CardDef) => {
    const id = putOnBattlefield(s, pid, def);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "graveyard";
    s.players[pid]!.graveyard.push(id);
    return id;
  };
  const pass = (s: GameState) => {
    for (let i = 0; i < 50 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
      if (s.pending) throw new Error(`unexpected ${s.pending.kind}`);
      s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    return s;
  };

  it("is fully supported", () => {
    expect(isFullySupported(dermotaxi())).toBe(true);
  });

  it("exiles the creature card chosen from an opponent's graveyard as it enters, then becomes a copy of it until end of turn", () => {
    const { s: s0, ap, opp, ids } = setup([dermotaxi()]);
    const mine = toYard(s0, ap, bears());
    const theirs = toYard(s0, opp, angel());
    const b1 = putOnBattlefield(s0, ap, bears());
    const b2 = putOnBattlefield(s0, ap, bears());
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 20 && !s.pending && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const p = s.pending;
    expect(p?.kind === "chooseOption" && p.what).toBe("exileFromYard");
    if (p?.kind !== "chooseOption") throw new Error("no choice");
    expect(p.options).toEqual(expect.arrayContaining([mine, theirs]));
    expect(p.labels?.[p.options.indexOf(theirs)]).toContain("graveyard");
    s = act(s, { type: "chooseOption", player: ap, choice: theirs });
    s = pass(s);
    const d = ids[0]!;
    expect(s.objects[d]!.zone).toBe("battlefield");
    expect(s.objects[theirs]!.zone).toBe("exile");
    expect(s.objects[mine]!.zone).toBe("graveyard");
    expect(characteristics(s, s.objects[d]!).types).not.toContain("Creature");
    s = pass(run(s, planActivate(s, ap, d, 0, undefined, undefined, undefined, undefined, { tap: [b1, b2] })));
    const c = characteristics(s, s.objects[d]!);
    expect(c.name).toBe("Serra Angel");
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(c.subtypes).toEqual(expect.arrayContaining(["Vehicle", "Angel"]));
    expect(`${power(s, s.objects[d]!)}/${toughness(s, s.objects[d]!)}`).toBe("4/4");
    expect(s.objects[b1]!.tapped && s.objects[b2]!.tapped).toBe(true);
    s = passUntil(s, "cleanup");
    s = passUntil(s, "upkeep");
    expect(characteristics(s, s.objects[d]!).name).toBe("Dermotaxi");
    expect(characteristics(s, s.objects[d]!).types).not.toContain("Creature");
  });

  it("the only creature card in any graveyard is exiled without a question; once it's left exile, the ability does nothing", () => {
    const { s: s0, ap, opp, ids } = setup([dermotaxi()]);
    const theirs = toYard(s0, opp, angel());
    const b1 = putOnBattlefield(s0, ap, bears());
    const b2 = putOnBattlefield(s0, ap, bears());
    const s1 = pass(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s1.objects[theirs]!.zone).toBe("exile");
    const d = ids[0]!;
    // The card leaves exile (to its owner's hand): a new object, not the exiled card (CR 400.7).
    const o = s1.objects[theirs]!;
    s1.players[opp]!.exile = s1.players[opp]!.exile.filter((x) => x !== theirs);
    o.zone = "hand";
    o.zoneChanges = (o.zoneChanges ?? 0) + 1;
    s1.players[opp]!.hand.push(theirs);
    invalidateCharacteristics(s1);
    const s = pass(run(s1, planActivate(s1, ap, d, 0, undefined, undefined, undefined, undefined, { tap: [b1, b2] })));
    expect(characteristics(s, s.objects[d]!).name).toBe("Dermotaxi");
  });

  it("with no creature card in any graveyard it enters with nothing exiled; bots don't cast it then", () => {
    const { s: s0, ap, ids } = setup([dermotaxi()]);
    const s = pass(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(botActions(s0, ap).some((a) => a.type === "castSpell" && a.objectId === ids[0])).toBe(false);
  });

  it("bots play a turn with it without getting stuck", () => {
    const { s: s0, ap, opp, ids } = setup([dermotaxi()]);
    toYard(s0, opp, angel());
    putOnBattlefield(s0, ap, bears());
    putOnBattlefield(s0, ap, bears());
    let s = s0;
    for (let i = 0; i < 300 && s.activePlayer === ap; i++) {
      const pid = waitingOn(s)!;
      const acts = botActions(s, pid);
      s = acts.length ? acts.reduce((x, a) => act(x, a), s) : act(s, { type: "passPriority", player: pid });
    }
    expect(s.activePlayer).not.toBe(ap);
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
  });
});
