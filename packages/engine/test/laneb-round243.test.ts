// Lane B round B243: Monastery Raid (an {X} freerunning cost, CR 702.173a, 107.3a, and "if this spell's freerunning cost
// was paid ... instead", CR 118.9) and Ecological Appreciation (a search of the library and graveyard together for creature
// cards with different names and mana value X or less, CR 701.23; an opponent chooses two to shuffle back, the rest enter)
// and Serum Powder (exiling the hand and drawing that many at a time its owner would declare a mulligan, CR 103.5b).

import { describe, expect, it } from "vitest";
import { act, bear, card, commander, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, castProblem, createGame, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const raid = (): CardDef => ({"oracleId":"62f4a2db-6d7c-487b-be37-22f06c1e779e","name":"Monastery Raid","manaCost":"{2}{R}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Freerunning {X}{R} (You may cast this spell for its freerunning cost if you dealt combat damage to a player this turn with an Assassin or commander.)\nExile the top two cards of your library. If this spell's freerunning cost was paid, exile the top X cards of your library instead. You may play the exiled cards until the end of your next turn.","colors":["R"],"colorIdentity":["R"],"keywords":["Freerunning"],"imageUrl":"https://cards.scryfall.io/normal/front/3/0/30933821-a64e-4c15-a7aa-e13cb89f46f5.jpg?1783910917","artUrl":"https://cards.scryfall.io/art_crop/front/3/0/30933821-a64e-4c15-a7aa-e13cb89f46f5.jpg?1783910917","commanderLegal":"legal","set":"acr","releasedAt":"2024-07-05","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const eco = (): CardDef => ({"oracleId":"0635ab65-fc1a-4e43-9e11-3a1ad3093830","name":"Ecological Appreciation","manaCost":"{X}{2}{G}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Search your library and graveyard for up to four creature cards with different names that each have mana value X or less and reveal them. An opponent chooses two of those cards. Shuffle the chosen cards into your library and put the rest onto the battlefield. Exile Ecological Appreciation.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/1/115f3d72-1aaf-4237-91b9-389256e5e5c8.jpg?1783927344","artUrl":"https://cards.scryfall.io/art_crop/front/1/1/115f3d72-1aaf-4237-91b9-389256e5e5c8.jpg?1783927344","commanderLegal":"legal","set":"stx","releasedAt":"2021-04-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const llanowar = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","artUrl":"https://cards.scryfall.io/art_crop/front/e/e/ee1a40dc-30dc-4dda-9001-aa7fb0b43bb3.jpg?1785224528","commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const elvishMystic = (): CardDef => ({"oracleId":"3f3b2c10-21f8-4e13-be83-4ef3fa36e123","name":"Elvish Mystic","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"imageUrl":"https://cards.scryfall.io/normal/front/a/c/acbe8763-1373-49f8-b4a6-dd5984b1d25f.jpg?1783911494","artUrl":"https://cards.scryfall.io/art_crop/front/a/c/acbe8763-1373-49f8-b4a6-dd5984b1d25f.jpg?1783911494","commanderLegal":"legal","set":"sld","releasedAt":"2024-05-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const powder = (): CardDef => ({"oracleId":"4e734493-9cb8-4409-8a30-cc15d519a27e","name":"Serum Powder","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}.\nAny time you could mulligan and this card is in your hand, you may exile all the cards from your hand, then draw that many cards. (You can do this in addition to taking mulligans.)","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"imageUrl":"https://cards.scryfall.io/normal/front/8/3/8330afd6-f43a-4955-a704-8f2b963cd0c6.jpg?1783944420","artUrl":"https://cards.scryfall.io/art_crop/front/8/3/8330afd6-f43a-4955-a704-8f2b963cd0c6.jpg?1783944420","commanderLegal":"legal","set":"dst","releasedAt":"2004-02-06","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const craw = (): CardDef => ({"oracleId":"6a462a69-3e42-41de-a3aa-a488d9f38d69","name":"Craw Wurm","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Creature — Wurm","supertypes":[],"types":["Creature"],"subtypes":["Wurm"],"oracleText":"","power":"6","toughness":"4","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","artUrl":"https://cards.scryfall.io/art_crop/front/b/f/bfed1a95-bd67-4e16-a781-81866028af2f.jpg?1783948678","commanderLegal":"legal","set":"lea","releasedAt":"1993-08-05","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...ds: CardDef[]) => ds.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
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
/** A card put into `pid`'s library (on top) or graveyard. */
const into = (s: GameState, pid: PlayerId, def: CardDef, where: "library" | "graveyard") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = where;
  if (where === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]!.graveyard.push(id);
  return id;
};
const untappedLands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && !s.objects[id]!.tapped && s.cards[s.objects[id]!.cardId]!.types.includes("Land")).length;
const FREE = { alt: "freerunning" as const };

describe("Lane B round B243", () => {
  it("are fully supported", () => {
    supported(raid(), eco(), powder());
  });
});

describe("Lane B round B243: Monastery Raid", () => {
  it("cast for its mana cost: the top two cards are exiled, playable until the end of your next turn", () => {
    const { s: s0, ap, ids } = setup([raid()]);
    const top = s0.players[ap]!.library.slice(0, 3);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto")));
    expect(top.slice(0, 2).map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile"]);
    expect(s.objects[top[2]!]!.zone).toBe("library");
    for (const id of top.slice(0, 2)) expect(s.objects[id]!.mayPlay).toMatchObject({ player: ap, until: "nextTurn", turn: s0.turn });
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("freerunning only after an Assassin or commander of yours dealt combat damage to a player this turn", () => {
    const { s, ap, ids } = setup([raid()]);
    expect(castProblem(s, ap, ids[0]!, undefined, undefined, undefined, undefined, 3, FREE)).toMatch(/Assassin or commander/);
  });

  it("cast for freerunning {X}{R}: X is announced, paid, and the top X cards are exiled instead", () => {
    const { s: s0, ap, ids, opp } = setup([raid()]);
    // A commander of ours dealt combat damage to a player this turn.
    const cmd = putOnBattlefield(s0, ap, bear({ name: "My Commander" }), { commander: true });
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: cmd, defender: opp }] });
    for (let i = 0; i < 60 && s.step !== "main2"; i++) {
      const p = s.pending;
      s = act(s, p?.kind === "declareBlockers" ? { type: "declareBlockers", player: p.player, blocks: [] } : { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.freerunningThisTurn).toContain(ap);
    const top = s.players[ap]!.library.slice(0, 5);
    const lands = untappedLands(s, ap);
    s = settle(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", 4, FREE)));
    // {4}{R}: five mana.
    expect(lands - untappedLands(s, ap)).toBe(5);
    expect(top.slice(0, 4).map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile", "exile", "exile"]);
    expect(s.objects[top[4]!]!.zone).toBe("library");
    for (const id of top.slice(0, 4)) expect(s.objects[id]!.mayPlay).toMatchObject({ player: ap, until: "nextTurn" });
  });

  it("freerunning with X 0 exiles nothing; cast for its mana cost, X can't be announced", () => {
    const { s: s0, ap, ids } = setup([raid()]);
    s0.freerunningThisTurn = [ap];
    const top = s0.players[ap]!.library[0]!;
    expect(castProblem(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, 2)).not.toBeNull();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 0, FREE)));
    expect(s.objects[top]!.zone).toBe("library");
    expect(s.objects[ids[0]!]!.zone).toBe("graveyard");
  });

  it("a bot casts it for freerunning when it may", () => {
    const { s, ap, ids } = setup([raid()]);
    s.freerunningThisTurn = [ap];
    s.players[ap]!.hand = [ids[0]!];
    const a = botActions(s, ap).find((x) => x.type === "castSpell");
    expect(a?.type === "castSpell" && a.alt === "freerunning").toBe(true);
  });
});

describe("Lane B round B243: Ecological Appreciation", () => {
  const game = () => {
    const g = setup([eco()]);
    const s = g.s;
    // Cards with mana value 2 or less in the library and in the graveyard, a second Grizzly Bears, and a Craw Wurm.
    const elves = into(s, g.ap, llanowar(), "library");
    const wurm = into(s, g.ap, craw(), "library");
    const mystic = into(s, g.ap, elvishMystic(), "graveyard");
    const yardBears = into(s, g.ap, bear(), "graveyard");
    const giant = into(s, g.ap, card("Test Giant", "Creature — Giant", "{1}{R}", { power: "3", toughness: "1" }), "graveyard");
    return { ...g, elves, wurm, mystic, yardBears, giant };
  };

  it("searches the library and graveyard together; the opponent's two are shuffled into the library, the rest enter", () => {
    const { s: s0, ap, ids, elves, wurm, mystic, yardBears, giant } = game();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 2)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 4 });
    const offered = s.pending?.kind === "searchLibrary" ? s.pending.cards : [];
    // One of each name in each zone: a Grizzly Bears from the library and the one in the graveyard.
    expect(offered).toEqual(expect.arrayContaining([elves, mystic, yardBears, giant]));
    const libBear = offered.find((id) => s.objects[id]!.zone === "library" && s.cards[s.objects[id]!.cardId]!.name === "Grizzly Bears")!;
    expect(libBear).toBeDefined();
    expect(offered).toHaveLength(5);
    expect(s.pending).toMatchObject({ distinctNames: true });
    // Mana value X or less: not the Craw Wurm.
    expect(offered).not.toContain(wurm);
    // Different names: not both Grizzly Bears.
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [libBear, yardBears] })).toThrow(/different names/);
    s = act(s, { type: "searchLibrary", player: ap, found: [libBear, elves, mystic, giant] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "opponent" });
    const opp = s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!;
    s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp, min: 2, max: 2 });
    s = settle(act(s, { type: "searchLibrary", player: opp, found: [elves, giant] }));
    // The graveyard's Test Giant is shuffled into the library too.
    expect(s.objects[elves]!.zone).toBe("library");
    expect(s.objects[giant]!.zone).toBe("library");
    expect(s.players[ap]!.library).toContain(giant);
    expect(s.objects[libBear]!.zone).toBe("battlefield");
    expect(s.objects[mystic]!.zone).toBe("battlefield");
    expect(s.objects[mystic]!.controller).toBe(ap);
    expect(s.objects[yardBears]!.zone).toBe("graveyard");
    // Then it exiles itself.
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
  });

  it("with two cards found, both are shuffled back and nothing enters (rulings)", () => {
    const { s: s0, ap, ids, elves, mystic } = game();
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 1)));
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [elves, mystic] }));
    expect(s.objects[elves]!.zone).toBe("library");
    expect(s.objects[mystic]!.zone).toBe("library");
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
  });

  it("with X 1, only cards with mana value 1 or less are offered", () => {
    const { s: s0, ap, ids, elves, mystic, giant } = game();
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", 1)));
    const offered = s.pending?.kind === "searchLibrary" ? s.pending.cards : [];
    expect([...offered].sort()).toEqual([elves, mystic].sort());
    expect(offered).not.toContain(giant);
  });
});

describe("Lane B round B243: Serum Powder", () => {
  /** A game with the mulligan process, half of each deck Serum Powders. */
  const game = (seed = 7) =>
    createGame(
      ["Ana", "Ben", "Cy", "Dee"].map((name, i) => ({ name, commander: commander(`Cmdr ${i}`), deck: [...Array.from({ length: 50 }, () => powder()), ...Array.from({ length: 49 }, () => forest)] })),
      seed,
      { mulligans: true },
    );
  const powderName = (s: GameState, id: string) => s.cards[s.objects[id]!.cardId]!.name === "Serum Powder";

  it("as its owner would declare a mulligan, it exiles the whole hand and draws that many; then they declare", () => {
    let s = game();
    const first = s.activePlayer;
    expect(s.pending).toMatchObject({ kind: "mulligan", player: first, taken: 0 });
    const hand = [...s.players[first]!.hand];
    const powders = hand.filter((id) => powderName(s, id));
    expect(powders.length).toBeGreaterThan(0);
    expect(s.pending?.kind === "mulligan" && [...(s.pending.exileHandWith ?? [])].sort()).toEqual([...powders].sort());
    // A card that isn't a Serum Powder can't do it.
    const other = hand.find((id) => !powderName(s, id));
    if (other) expect(() => act(s, { type: "exileOpeningHand", player: first, objectId: other })).toThrow();
    s = act(s, { type: "exileOpeningHand", player: first, objectId: powders[0]! });
    for (const id of hand) expect(s.objects[id]!.zone).toBe("exile");
    expect(s.players[first]!.hand).toHaveLength(7);
    expect(s.players[first]!.hand.some((id) => hand.includes(id))).toBe(false);
    // It isn't a mulligan; the same player now declares, without exiling again (CR 103.5b).
    expect(s.pending).toMatchObject({ kind: "mulligan", player: first, taken: 0, bottomIfKept: 0 });
    expect(s.pending?.kind === "mulligan" && s.pending.exileHandWith).toBeUndefined();
    expect(() => act(s, { type: "exileOpeningHand", player: first, objectId: s.players[first]!.hand.find((id) => powderName(s, id)) ?? hand[0]! })).toThrow();
    // A mulligan afterwards doesn't bring the exiled cards back (rulings).
    s = act(s, { type: "mulligan", player: first, keep: false });
    while (s.pending?.kind === "mulligan" && s.pending.player !== first) s = act(s, { type: "mulligan", player: waitingOn(s)!, keep: true });
    for (const id of hand) expect(s.objects[id]!.zone).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "mulligan", player: first, taken: 1 });
    // A Serum Powder in the new hand may be used at this declaration too (rulings).
    const again = s.players[first]!.hand.filter((id) => powderName(s, id));
    if (again.length) expect(s.pending?.kind === "mulligan" && s.pending.exileHandWith?.length).toBe(again.length);
  });

  it("a bot uses it instead of a mulligan that would count", () => {
    let s = game();
    const first = s.activePlayer;
    // Its free mulligan first (a hand of Powders and Forests may be kept, so force it).
    s = act(s, { type: "mulligan", player: first, keep: false });
    while (s.pending?.kind === "mulligan" && s.pending.player !== first) s = act(s, { type: "mulligan", player: waitingOn(s)!, keep: true });
    // A hand with no land: the bot wants a new one.
    const p = s.players[first]!;
    for (const id of [...p.hand]) if (!powderName(s, id)) {
      const swap = p.library.find((l) => powderName(s, l))!;
      p.library.splice(p.library.indexOf(swap), 1, id);
      p.hand.splice(p.hand.indexOf(id), 1, swap);
      s.objects[id]!.zone = "library";
      s.objects[swap]!.zone = "hand";
    }
    s.pending = { kind: "mulligan", player: first, taken: 1, bottomIfKept: 0, canMulligan: true, exileHandWith: [...p.hand] };
    const a = botActions(s, first);
    expect(a).toEqual([{ type: "exileOpeningHand", player: first, objectId: p.hand[0] }]);
    s = act(s, a[0]!);
    expect(s.players[first]!.hand).toHaveLength(7);
    expect(s.pending).toMatchObject({ kind: "mulligan", player: first, taken: 1 });
  });

  it("not outside the mulligan process", () => {
    const { s, ap } = setup([powder()]);
    const id = s.players[ap]!.hand[0]!;
    expect(() => act(s, { type: "exileOpeningHand", player: ap, objectId: id })).toThrow();
  });
});
