// Round 382 (Lane A): a permanent with the activated abilities of every land on the battlefield, paid for with mana of any
// color (Manascape Refractor); draws from the bottom of the library and a trigger on an opponent's scry, surveil or search
// (River Song); a Saga goading every creature with a name chosen for it (Day of the Moon).

import { describe, expect, it } from "vitest";
import { act, island, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { abilitiesOf, applyAction, botActions, characteristics, isFullySupported, legalActions, manaAbilitiesOn, manaChoices, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty, stopping at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 200 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const tapAll = (s: GameState, pid: PlayerId, but: ObjectId[] = []) => {
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid && !but.includes(id)) s.objects[id]!.tapped = true;
};

// Real oracle text (Scryfall).
const refractor = (): CardDef => ({"oracleId":"ae3517db-bb96-4c29-91dc-5bd68683dced","name":"Manascape Refractor","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"This artifact enters tapped.\nThis artifact has all activated abilities of all lands on the battlefield.\nYou may spend mana as though it were mana of any color to pay the activation costs of this artifact's abilities.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/f/7f164226-99e4-474e-a67d-b3fbff015a64.jpg?1783931207","artUrl":"https://cards.scryfall.io/art_crop/front/7/f/7f164226-99e4-474e-a67d-b3fbff015a64.jpg?1783931207","commanderLegal":"legal","set":"c20","releasedAt":"2020-04-17","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const riverSong = (): CardDef => ({"oracleId":"418ecbb7-b809-4639-a531-070b58b5b85e","name":"River Song","manaCost":"{1}{U}{R}","cmc":3,"typeLine":"Legendary Creature — Human Time Lord Rogue","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Time Lord","Rogue"],"oracleText":"Meet in Reverse — You draw cards from the bottom of your library rather than the top.\nSpoilers — Whenever an opponent scries, surveils, or searches their library, put a +1/+1 counter on River Song. Then River Song deals damage to that player equal to its power.","power":"2","toughness":"2","colors":["R","U"],"colorIdentity":["R","U"],"keywords":["Meet in Reverse","Spoilers"],"imageUrl":"https://cards.scryfall.io/normal/front/c/b/cb6b98f9-5317-4fd9-944e-c1fd5e7f6d3f.jpg?1783914529","artUrl":"https://cards.scryfall.io/art_crop/front/c/b/cb6b98f9-5317-4fd9-944e-c1fd5e7f6d3f.jpg?1783914529","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const dayOfTheMoon = (): CardDef => ({"oracleId":"7ec3aaa4-8b6a-4046-b599-654f9844ca6c","name":"Day of the Moon","manaCost":"{2}{R}","cmc":3,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II, III — Choose a creature card name, then goad all creatures with a name chosen for this enchantment. (Until your next turn, they attack each combat if able and attack a player other than you if able.)","colors":["R"],"colorIdentity":["R"],"keywords":["Goad"],"imageUrl":"https://cards.scryfall.io/normal/front/a/d/adc53534-f362-4871-a594-9855a4923cd0.jpg?1783914658","artUrl":"https://cards.scryfall.io/art_crop/front/a/d/adc53534-f362-4871-a594-9855a4923cd0.jpg?1783914658","commanderLegal":"legal","set":"who","releasedAt":"2023-10-13","rarity":"rare","layout":"saga","gameChanger":false}) as CardDef;
const wolfRun = (): CardDef => ({"oracleId":"c6911265-54ef-4c16-bcf2-1ffb24b7d426","name":"Kessig Wolf Run","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{X}{R}{G}, {T}: Target creature gets +X/+0 and gains trample until end of turn.","colors":[],"colorIdentity":["G","R"],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/b/c/bcb4e64b-e978-49ba-8e3e-4792f975fb61.jpg?1783925165","artUrl":"https://cards.scryfall.io/art_crop/front/b/c/bcb4e64b-e978-49ba-8e3e-4792f975fb61.jpg?1783925165","commanderLegal":"legal","set":"sld","releasedAt":"2021-10-15","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const cairns = (): CardDef => ({"oracleId":"5004b84a-33b7-4f6f-b2c2-7086b9087535","name":"Graven Cairns","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}.\n{B/R}, {T}: Add {B}{B}, {B}{R}, or {R}{R}.","colors":[],"colorIdentity":["B","R"],"keywords":[],"producedMana":["B","C","R"],"imageUrl":"https://cards.scryfall.io/normal/front/7/f/7f33cce1-1484-43da-a825-b090eb5403a4.jpg?1783906217","artUrl":"https://cards.scryfall.io/art_crop/front/7/f/7f33cce1-1484-43da-a825-b090eb5403a4.jpg?1783906217","commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const thrivingGrove = (): CardDef => ({"oracleId":"a8052556-8962-4130-86a8-6fb7b6a324f7","name":"Thriving Grove","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"This land enters tapped. As it enters, choose a color other than green.\n{T}: Add {G} or one mana of the chosen color.","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/eef65ebc-12d6-4438-a908-2a0c28329124.jpg?1783903090","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/eef65ebc-12d6-4438-a908-2a0c28329124.jpg?1783903090","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const opt = (): CardDef => ({"oracleId":"713332c1-5bd8-400f-bfff-c1ca0697a043","name":"Opt","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Scry"],"imageUrl":"https://cards.scryfall.io/normal/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","artUrl":"https://cards.scryfall.io/art_crop/front/f/1/f1de6f4a-ec3f-4bdb-902f-2e04f36ad7f4.jpg?1783906078","commanderLegal":"legal","set":"sld","releasedAt":"2025-07-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const wilds = (): CardDef => ({"oracleId":"a75445d3-1303-4bb5-89ad-26ea93fecd48","name":"Evolving Wilds","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/c/0/c0318a48-30e4-4ef7-be3d-5e561c5ce428.jpg?1783903203","artUrl":"https://cards.scryfall.io/art_crop/front/c/0/c0318a48-30e4-4ef7-be3d-5e561c5ce428.jpg?1783903203","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const hillGiant = (): CardDef => ({"oracleId":"342199e0-15b6-4824-83da-25caef2592b3","name":"Hill Giant","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Giant","supertypes":[],"types":["Creature"],"subtypes":["Giant"],"oracleText":"","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","artUrl":"https://cards.scryfall.io/art_crop/front/1/4/14c2be6a-9ca6-4d3a-8dd0-db4ea40799f8.jpg?1783943018","commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const crawWurm = (): CardDef => ({"oracleId":"6a462a69-3e42-41de-a3aa-a488d9f38d69","name":"Craw Wurm","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"","power":"6","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const consider = (): CardDef => ({"oracleId":"4c9bcba6-87b5-4fb3-97ee-6fe5b739337d","name":"Consider","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Surveil 1. (Look at the top card of your library. You may put it into your graveyard.)\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":["Surveil"],"imageUrl":"https://cards.scryfall.io/normal/front/8/f/8fcce60c-6baa-4f55-907a-4acc2a597030.jpg?1790866133","artUrl":"https://cards.scryfall.io/art_crop/front/8/f/8fcce60c-6baa-4f55-907a-4acc2a597030.jpg?1790866133","commanderLegal":"legal","set":"spg","releasedAt":"2026-10-02","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const kangDynasty = (): CardDef => ({"oracleId":"4e420f43-a4a3-44bb-9a4e-a943f93a3534","name":"Kang Dynasty","manaCost":"{3}{U}","cmc":4,"typeLine":"Enchantment — Saga","supertypes":[],"types":["Enchantment"],"subtypes":["Saga"],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II — For each opponent, tap up to one target creature that player controls. Goad those creatures. Until your next turn, whenever any of those creatures deals combat damage to a player, draw a card.\nIII — Target creature you control gets +1/+1 until end of turn for each card in your hand and can't be blocked this turn.","colors":["U"],"colorIdentity":["U"],"keywords":["Goad"],"imageUrl":"https://cards.scryfall.io/normal/front/5/e/5e4223df-c9fc-410a-913a-17bbfd054b57.jpg?1783903292","artUrl":"https://cards.scryfall.io/art_crop/front/5/e/5e4223df-c9fc-410a-913a-17bbfd054b57.jpg?1783903292","commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"rare","layout":"saga","gameChanger":false}) as CardDef;
const elves = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

describe("round 382: compiles", () => {
  it("Manascape Refractor, River Song, Day of the Moon and Kang Dynasty", () => {
    for (const def of [refractor(), riverSong(), dayOfTheMoon(), kangDynasty()]) expect(isFullySupported(def), def.name).toBe(true);
  });
});

describe("Manascape Refractor", () => {
  it("has the activated abilities of every land on the battlefield, anyone's, but not their triggered ones (rulings)", () => {
    const { s, ap, opp } = setup([]);
    const r = putOnBattlefield(s, ap, refractor());
    putOnBattlefield(s, opp, cairns());
    putOnBattlefield(s, opp, wolfRun());
    const o = s.objects[r]!;
    const mana = manaAbilitiesOn(s, o).map((a) => a.text);
    // Lands with a basic land type have its mana ability (rulings): the setup's basics give one of each color.
    for (const t of ["{T}: Add {C}.", "{B/R}, {T}: Add {B}{B}, {B}{R}, or {R}{R}.", "{T}: Add {W}.", "{T}: Add {U}.", "{T}: Add {B}.", "{T}: Add {R}.", "{T}: Add {G}."]) expect(mana).toContain(t);
    // The same ability from several lands is one ability of the Refractor.
    expect(mana.filter((t) => t === "{T}: Add {G}.")).toHaveLength(1);
    expect(abilitiesOf(s, o).activated.map((a) => a.text)).toEqual(["{X}{R}{G}, {T}: Target creature gets +X/+0 and gains trample until end of turn."]);
  });

  it("enters tapped; its borrowed mana ability taps it and adds the mana", () => {
    const { s: s0, ap, ids } = setup([refractor()]);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]).toMatchObject({ zone: "battlefield", tapped: true });
    s.objects[ids[0]!]!.tapped = false;
    const i = manaAbilitiesOn(s, s.objects[ids[0]!]!).findIndex((a) => a.text === "{T}: Add {U}.");
    const before = s.players[ap]!.manaPool.U;
    s = act(s, { type: "activateMana", player: ap, objectId: ids[0]!, mana: "U", ability: i });
    expect(s.players[ap]!.manaPool.U).toBe(before + 1);
    expect(s.objects[ids[0]!]!.tapped).toBe(true);
  });

  it("a mana ability's cost is paid with mana of any color (CR 609.4b): white mana for Graven Cairns' {B/R}", () => {
    const { s, ap, opp } = setup([]);
    const r = putOnBattlefield(s, ap, refractor());
    const realCairns = putOnBattlefield(s, ap, cairns());
    putOnBattlefield(s, opp, cairns());
    tapAll(s, ap, [r, realCairns]);
    s.players[ap]!.manaPool.W = 1;
    const i = manaAbilitiesOn(s, s.objects[r]!).findIndex((a) => a.text.startsWith("{B/R}"));
    const cairnsAt = (id: ObjectId) => legalActions(s, ap).filter((a) => a.type === "activateMana" && a.objectId === id && (id !== r || a.ability === i));
    // Graven Cairns itself can't use white mana; the Refractor can.
    expect(cairnsAt(realCairns).filter((a) => a.type === "activateMana" && a.combo !== undefined)).toHaveLength(0);
    expect(cairnsAt(r).length).toBeGreaterThan(0);
    const t = act(s, { type: "activateMana", player: ap, objectId: r, mana: "R", ability: i, combo: 2 });
    expect(t.players[ap]!.manaPool).toMatchObject({ W: 0, R: 2 });
  });

  it("its borrowed Kessig Wolf Run ability is paid with any color: {X}{R}{G} with white and blue mana", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, refractor());
    putOnBattlefield(s0, opp, wolfRun());
    const giant = putOnBattlefield(s0, ap, hillGiant());
    tapAll(s0, ap, [r, giant]);
    s0.players[ap]!.manaPool.W = 2;
    s0.players[ap]!.manaPool.U = 1;
    let s = run(s0, planActivate(s0, ap, r, 0, [target(giant)], undefined, undefined, 1));
    s = settle(s);
    expect(s.players[ap]!.manaPool).toMatchObject({ W: 0, U: 0 });
    expect(characteristics(s, s.objects[giant]!)).toMatchObject({ power: 4 });
    expect(characteristics(s, s.objects[giant]!).keywords).toContain("Trample");
  });

  it("an ability linked to a land's non-activated ability isn't linked on the Refractor (rulings): Thriving Grove gives only {G}", () => {
    const { s, ap, opp } = setup([]);
    const r = putOnBattlefield(s, ap, refractor());
    const tg = putOnBattlefield(s, opp, thrivingGrove());
    s.objects[tg]!.chosen = { color: "U" };
    const o = s.objects[r]!;
    const grove = manaAbilitiesOn(s, o).find((a) => a.text === "{T}: Add {G} or one mana of the chosen color.")!;
    expect(manaChoices(s, o, grove)).toEqual(["G"]);
    expect(manaChoices(s, s.objects[tg]!, manaAbilitiesOn(s, s.objects[tg]!)[0]!)).toEqual(["G", "U"]);
  });
});

describe("River Song", () => {
  it("its controller draws from the bottom of their library, every draw (rulings)", () => {
    const { s: s0, ap, ids } = setup([opt()]);
    putOnBattlefield(s0, ap, riverSong());
    const lib = s0.players[ap]!.library;
    const top = lib[0]!;
    const bottom = lib[lib.length - 1]!;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    // Opt: scry 1 looks at the top card, then the draw is from the bottom.
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: ap, cards: [top] });
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [top], away: [] }));
    expect(s.players[ap]!.hand).toContain(bottom);
    expect(s.players[ap]!.library[0]).toBe(top);
  });

  it("an opponent's draws are from the top as usual", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, riverSong());
    const top = s0.players[opp]!.library[0]!;
    const s = passUntil(s0, "draw", opp);
    const t = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(t.players[opp]!.hand).toContain(top);
  });

  /** River Song under A; B gets Islands and `card` in hand, and A passes priority to B in A's main phase. */
  const oppReady = (card: CardDef) => {
    const { s: s0, ap, opp } = setup([]);
    const rs = putOnBattlefield(s0, ap, riverSong());
    putOnBattlefield(s0, opp, island);
    putOnBattlefield(s0, opp, island);
    const id = putOnBattlefield(s0, opp, card);
    s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
    s0.objects[id]!.zone = "hand";
    s0.players[opp]!.hand.push(id);
    let s = act(s0, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    return { s, ap, opp, rs, id };
  };

  it("an opponent's scry: a +1/+1 counter, then damage equal to its power to that player", () => {
    let { s, opp, rs, id } = oppReady(opt());
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, opp, id)));
    expect(s.pending).toMatchObject({ kind: "arrangeTop", player: opp });
    s = settle(act(s, { type: "arrangeTop", player: opp, top: s.pending?.kind === "arrangeTop" ? s.pending.cards : [], away: [] }));
    expect(s.objects[rs]!.counters["+1/+1"]).toBe(1);
    expect(s.players[opp]!.life).toBe(life - 3);
  });

  it("an opponent's surveil triggers it too", () => {
    let { s, opp, rs, id } = oppReady(consider());
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, opp, id)));
    s = settle(act(s, { type: "arrangeTop", player: opp, top: [], away: s.pending?.kind === "arrangeTop" ? s.pending.cards : [] }));
    expect(s.objects[rs]!.counters["+1/+1"]).toBe(1);
    expect(s.players[opp]!.life).toBe(life - 3);
  });

  it("an opponent searching their library triggers it (Evolving Wilds)", () => {
    const { s: s0, ap, opp } = setup([]);
    const rs = putOnBattlefield(s0, ap, riverSong());
    const w = putOnBattlefield(s0, opp, wilds());
    const life = s0.players[opp]!.life;
    let s = act(s0, { type: "passPriority", player: ap });
    s = run(s, planActivate(s, opp, w, 0));
    s = settle(s);
    // The search's own question (which basic land) answered as a bot would.
    for (let i = 0; i < 5 && s.pending; i++) s = settle(run(s, botActions(s, waitingOn(s)!)));
    expect(s.objects[rs]!.counters["+1/+1"]).toBe(1);
    expect(s.players[opp]!.life).toBe(life - 3);
  });

  it("its controller's own scry doesn't trigger it", () => {
    const { s: s0, ap, ids } = setup([opt()]);
    const rs = putOnBattlefield(s0, ap, riverSong());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "arrangeTop", player: ap, top: s.pending?.kind === "arrangeTop" ? s.pending.cards : [], away: [] }));
    expect(s.objects[rs]!.counters["+1/+1"]).toBeUndefined();
  });
});

describe("Day of the Moon", () => {
  /** A casts the Saga; chapter I asks for a creature card name. */
  const ready = () => {
    const { s: s0, ap, opp, ids } = setup([dayOfTheMoon()]);
    const theirGiant = putOnBattlefield(s0, opp, hillGiant());
    const myGiant = putOnBattlefield(s0, ap, hillGiant());
    const wurm = putOnBattlefield(s0, opp, crawWurm());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    return { s, ap, opp, saga: ids[0]!, theirGiant, myGiant, wurm };
  };

  it("chapter I asks for a creature card name, as it resolves (CR 608.2d)", () => {
    const { s, ap } = ready();
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "cardName", player: ap });
    const opts = s.pending?.kind === "chooseOption" ? s.pending.options : [];
    expect(opts).toContain("Hill Giant");
    expect(opts).toContain("Craw Wurm");
    expect(opts).not.toContain("Day of the Moon");
    expect(opts).not.toContain("Forest");
  });

  it("goads every creature with the chosen name, whoever controls it, by you (CR 701.15a)", () => {
    let { s, ap, theirGiant, myGiant, wurm } = ready();
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Hill Giant" }));
    expect(characteristics(s, s.objects[theirGiant]!)).toMatchObject({ goaded: true, goadedBy: [ap] });
    expect(characteristics(s, s.objects[myGiant]!)).toMatchObject({ goaded: true, goadedBy: [ap] });
    expect(characteristics(s, s.objects[wurm]!).goaded).toBeFalsy();
  });

  it("a later chapter goads the creatures with every name chosen for it, a creature entering later too", () => {
    let { s, ap, opp, saga, theirGiant, wurm } = ready();
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Hill Giant" }));
    // Chapter II, as if after A's next draw step: a lore counter added (CR 714.3b).
    const late = putOnBattlefield(s, opp, hillGiant());
    s.effects = s.effects.filter((e) => !e.mods.some((m) => m.kind === "goad"));
    s.objects[saga]!.counters.lore = 2;
    s.triggerQueue.push({ sourceId: saga, sourceZc: s.objects[saga]!.zoneChanges ?? 0, sourceCardId: s.objects[saga]!.cardId, controller: ap, index: 1, body: (abilitiesOf(s, s.objects[saga]!).triggers[1]!).body });
    s = settle(act(s, { type: "passPriority", player: ap }));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "cardName" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Craw Wurm" }));
    for (const id of [theirGiant, late, wurm]) expect(characteristics(s, s.objects[id]!).goaded, s.cards[s.objects[id]!.cardId]!.name).toBe(true);
    expect(s.namesChosenFor?.[`${saga}@${s.objects[saga]!.zoneChanges ?? 0}`]).toEqual(["Hill Giant", "Craw Wurm"]);
  });

  it("a bot picks the name of an opponent's biggest creature it doesn't share", () => {
    const { s, ap } = ready();
    const acts = botActions(s, ap);
    expect(acts[0]).toMatchObject({ type: "chooseOption", choice: "Craw Wurm" });
  });
});

describe("Kang Dynasty", () => {
  /** A casts the Saga with a Hill Giant under each opponent; chapter I asks for its targets. */
  const ready = () => {
    const { s: s0, ap, ids } = setup([kangDynasty()]);
    const opps = s0.turnOrder.filter((p) => p !== ap);
    const giants = opps.map((p) => putOnBattlefield(s0, p, hillGiant()));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    return { s, ap, opps, giants, saga: ids[0]! };
  };

  it("chapter I taps and goads up to one target creature for each opponent (CR 601.2c, 701.15a)", () => {
    let { s, ap, giants } = ready();
    if (s.pending) s = settle(run(s, botActions(s, waitingOn(s)!)));
    expect(s.pending).toBeFalsy();
    for (const g of giants) {
      expect(s.objects[g]!.tapped).toBe(true);
      expect(characteristics(s, s.objects[g]!)).toMatchObject({ goaded: true, goadedBy: [ap] });
    }
    expect(s.floatingTriggers?.filter((f) => f.about && giants.includes(f.about.id))).toHaveLength(3);
  });

  it("until your next turn, each of those creatures dealing combat damage to a player draws you a card", () => {
    let { s, ap, opps, giants } = ready();
    if (s.pending) s = settle(run(s, botActions(s, waitingOn(s)!)));
    const hand = () => s.players[ap]!.hand.length;
    // The next opponent's turn: its goaded Hill Giant attacks someone other than A (CR 701.15b); no one blocks.
    const opp = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    const giant = giants[opps.indexOf(opp)]!;
    for (let i = 0; i < 3000 && !(s.turn > 1 && s.activePlayer === opp && s.step === "combatDamage"); i++) {
      const pid = waitingOn(s)!;
      const pend = s.pending;
      if (pend?.kind === "declareAttackers") s = run(s, botActions(s, pid));
      else if (pend?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
      else if (pend) s = run(s, botActions(s, pid));
      else s = act(s, { type: "passPriority", player: pid });
      if (s.activePlayer === ap && s.turn > 1) throw new Error("back to A");
    }
    expect(s.objects[giant]!.attacking).toBeDefined();
    expect(s.objects[giant]!.attacking).not.toBe(ap);
    const before = hand();
    s = settle(s);
    for (let i = 0; i < 20 && s.step === "combatDamage" && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(hand()).toBe(before + 1);
  });
});
