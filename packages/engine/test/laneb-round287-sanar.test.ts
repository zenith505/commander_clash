// Lane B round B287: Sanar, Innovative First-Year's "Vivid — At the beginning of your first main phase, reveal cards from
// the top of your library until you reveal X nonland cards, where X is the number of colors among permanents you control.
// For each of those colors, you may exile a card of that color from among the revealed cards. Then shuffle. You may cast
// the exiled cards this turn." (X counted once, rulings; CR 701.20a, 105.2; the casts pay their costs, rulings).

import { describe, expect, it } from "vitest";
import { act, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const sanarInnovativeFirstYear = (): CardDef => ({"oracleId":"2676ba6d-e7a7-48cf-9c86-6e2a11f03096","name":"Sanar, Innovative First-Year","manaCost":"{2}{U/R}{U/R}","cmc":4,"typeLine":"Legendary Creature — Goblin Sorcerer","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Goblin","Sorcerer"],"oracleText":"Vivid — At the beginning of your first main phase, reveal cards from the top of your library until you reveal X nonland cards, where X is the number of colors among permanents you control. For each of those colors, you may exile a card of that color from among the revealed cards. Then shuffle. You may cast the exiled cards this turn.","power":"2","toughness":"4","colors":["R","U"],"colorIdentity":["R","U"],"keywords":["Vivid"],"imageUrl":"https://cards.scryfall.io/normal/front/1/1/11215561-bbcd-4564-a2e4-a1d77d177a1d.jpg?1783904403","artUrl":"https://cards.scryfall.io/art_crop/front/1/1/11215561-bbcd-4564-a2e4-a1d77d177a1d.jpg?1783904403","commanderLegal":"legal","set":"ecl","releasedAt":"2026-01-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const lightningBolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","artUrl":"https://cards.scryfall.io/art_crop/front/7/6/7673784e-db4b-43a1-8d55-1bb9fc1e284f.jpg?1783903008","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const lightningHelix = (): CardDef => ({"oracleId":"800c258a-cfc4-4a54-a667-065ea8dea69e","name":"Lightning Helix","manaCost":"{R}{W}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Helix deals 3 damage to any target and you gain 3 life.","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/1/4101e3fe-b0e7-4f0f-b9ac-9b61a4d628b3.jpg?1783912843","artUrl":"https://cards.scryfall.io/art_crop/front/4/1/4101e3fe-b0e7-4f0f-b9ac-9b61a4d628b3.jpg?1783912843","commanderLegal":"legal","set":"mkm","releasedAt":"2024-02-09","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const opt = (): CardDef => ({"oracleId":"713332c1-5bd8-400f-bfff-c1ca0697a043","name":"Opt","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","commanderLegal":"legal","set":"sld","releasedAt":"2025-07-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const grizzlyBears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","artUrl":"https://cards.scryfall.io/art_crop/front/2/4/24a5e5fb-d1d4-4f09-9593-f2b25d0dcabf.jpg?1787745798","commanderLegal":"legal","set":"slz","releasedAt":"2026-09-02","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const dryadArbor = (): CardDef => ({"oracleId":"e996cd67-739c-40f4-b276-0042acf26c71","name":"Dryad Arbor","manaCost":"","cmc":0,"typeLine":"Land Creature — Forest Dryad","supertypes":[],"types":["Land","Creature"],"subtypes":["Forest","Dryad"],"oracleText":"(This land isn't a spell, it's affected by summoning sickness, and it has \"{T}: Add {G}.\")","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/5/c/5c4fb7f9-a551-4253-a46e-f6284d355388.jpg?1783904262","artUrl":"https://cards.scryfall.io/art_crop/front/5/c/5c4fb7f9-a551-4253-a46e-f6284d355388.jpg?1783904262","commanderLegal":"legal","set":"sld","releasedAt":"2026-02-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const island = (): CardDef => ({"oracleId":"b2c6aa39-2d2a-459c-a555-fb48ba993373","name":"Island","manaCost":"","cmc":0,"typeLine":"Basic Land — Island","supertypes":["Basic"],"types":["Land"],"subtypes":["Island"],"oracleText":"({T}: Add {U}.)","colors":[],"colorIdentity":["U"],"keywords":[],"producedMana":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a44efa5f-8fbb-43e0-adc4-d05f4be6b9a6.jpg?1785981646","commanderLegal":"legal","set":"trk","releasedAt":"2026-11-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Fresh copies of `defs` on top of `pid`'s library, in that order (the first on top). */
const onTop = (s: GameState, pid: PlayerId, defs: CardDef[]) =>
  defs.map((def) => {
    const id = putOnBattlefield(s, pid, def);
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "library";
    return id;
  }).map((id, i, all) => {
    if (i === all.length - 1) s.players[pid]!.library.unshift(...all);
    invalidateCharacteristics(s);
    return id;
  });
/**
 * Sanar (and `others`) on the battlefield, `top` on top of the library under a Forest that the next draw step takes; then
 * on to the next first main phase, the trigger resolving until the question.
 */
const toTrigger = (top: CardDef[], others: CardDef[] = []) => {
  const { s: s0, ap } = setup([]);
  const sanar = putOnBattlefield(s0, ap, sanarInnovativeFirstYear());
  for (const d of others) putOnBattlefield(s0, ap, d);
  const ids = onTop(s0, ap, [forest, ...top]).slice(1);
  let s = passUntil(passUntil(s0, "upkeep", s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!), "main1", ap);
  s = settle(s);
  return { s, ap, sanar, ids };
};

describe("Sanar, Innovative First-Year", () => {
  it("compiles", () => expect(isFullySupported(sanarInnovativeFirstYear())).toBe(true));

  it("blue and red: reveals until two nonland cards, exiles one of each color, shuffles, and they may be cast this turn", () => {
    let { s, ap, ids } = toTrigger([island(), lightningBolt(), island(), opt(), hillGiant()]);
    const [i1, bolt, i2, o, giant] = ids;
    // Reveals Island, Bolt, Island, Opt (two nonland cards): the Bolt and the Opt are the cards of those colors.
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, colorsToCast: true, min: 0, max: 2 });
    const pend = s.pending as { cards: string[]; dig: { looked: string[] } };
    expect([...pend.cards].sort()).toEqual([bolt, o].sort());
    expect(pend.dig.looked).toEqual([i1, bolt, i2, o]);
    expect(giant).toBeDefined();
    const size = s.players[ap]!.library.length;
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [bolt!, o!] }));
    expect(s.objects[bolt!]!.zone).toBe("exile");
    expect(s.objects[o!]!.zone).toBe("exile");
    expect(s.players[ap]!.library.length).toBe(size - 2);
    expect(s.players[ap]!.library).toEqual(expect.arrayContaining([i1, i2, giant]));
    // Cast from exile, paying {R} (rulings: all costs paid).
    const plan = planCast(s, ap, bolt!, [{ kind: "player", id: s.turnOrder.find((p) => p !== ap)! }]);
    expect(plan).not.toBeNull();
    expect(plan!.some((a) => a.type === "activateMana" || a.type === "castSpell")).toBe(true);
    s = settle(run(s, plan));
    expect(s.objects[bolt!]!.zone).toBe("graveyard");
    // The Opt not cast this turn can't be cast later.
    s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!);
    expect(planCast(s, ap, o!)).toBeNull();
    expect(s.objects[o!]!.zone).toBe("exile");
  });

  it("a multicolored card stands for one of its colors only: not two red cards for red and blue", () => {
    let { s, ap, ids } = toTrigger([lightningBolt(), lightningHelix()]);
    const [bolt, helix] = ids;
    expect([...(s.pending as { cards: string[] }).cards].sort()).toEqual([bolt, helix].sort());
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [bolt!, helix!] })).toThrow();
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [helix!] }));
    expect(s.objects[helix!]!.zone).toBe("exile");
    expect(s.objects[bolt!]!.zone).toBe("library");
  });

  it("you may exile none: everything stays and is shuffled in", () => {
    let { s, ap, ids } = toTrigger([lightningBolt(), opt()]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [] }));
    expect(ids.every((id) => s.objects[id]!.zone === "library")).toBe(true);
    expect(s.pending).toBeFalsy();
  });

  it("a green permanent makes it three colors: a green land revealed may be exiled for green, but it can't be cast", () => {
    let { s, ap, ids } = toTrigger([dryadArbor(), lightningBolt(), opt(), grizzlyBears(), hillGiant()], [grizzlyBears()]);
    const [arbor, bolt, o, bears, giant] = ids;
    const pend = s.pending as { cards: string[]; dig: { looked: string[] }; max: number };
    // Dryad Arbor is a land: three nonland cards are the Bolt, Opt and Bears; the Hill Giant isn't revealed.
    expect(pend.dig.looked).toEqual([arbor, bolt, o, bears]);
    expect([...pend.cards].sort()).toEqual([arbor, bolt, o, bears].sort());
    expect(pend.max).toBe(3);
    expect(giant).toBeDefined();
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [arbor!, bolt!, o!] }));
    expect([s.objects[arbor!]!.zone, s.objects[bolt!]!.zone, s.objects[o!]!.zone, s.objects[bears!]!.zone]).toEqual(["exile", "exile", "exile", "library"]);
    expect(planCast(s, ap, arbor!)).toBeNull();
  });

  it("a bot exiles the nonland cards it can cast, one for each color", () => {
    const { s, ap, ids } = toTrigger([island(), lightningHelix(), opt()]);
    const [, helix, o] = ids;
    const acts = botActions(s, ap);
    expect(acts).toHaveLength(1);
    expect([...(acts[0] as { found: string[] }).found].sort()).toEqual([helix, o].sort());
    // Two red cards: only one of them, the greater mana value.
    const t = toTrigger([lightningBolt(), lightningHelix()]);
    expect((botActions(t.s, t.ap)[0] as { found: string[] }).found).toEqual([t.ids[1]]);
  });
});
