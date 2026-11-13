// Lane B round B196: Brass Herald ("As this creature enters, choose a creature type." "When this creature enters, reveal
// the top four cards of your library. Put all creature cards of the chosen type revealed this way into your hand and the
// rest on the bottom of your library in any order." "Creatures of the chosen type get +1/+1."), Ether ("{T}, Exile this
// artifact: Add {U}. When you next cast an instant or sorcery spell this turn, copy that spell. You may choose new targets
// for the copy."), Munda, Ambush Leader (rally: "you may look at the top four cards of your library. If you do, reveal any
// number of Ally cards from among them, then put those cards on top of your library in any order and the rest on the bottom
// in any order."), Wurmquake ("Create an X/X green Phyrexian Wurm creature token with trample and toxic 1, where X is the
// amount of mana spent to cast this spell. Then for each opponent with three or more poison counters, you create another
// one of those tokens."), Tunnel Vision ("Choose a card name. Target player reveals cards from the top of their library
// until a card with that name is revealed. If it is, that player puts the rest of the revealed cards into their graveyard
// and puts the card with the chosen name on top of their library. Otherwise, the player shuffles."), Reroute ("Change the
// target of target activated ability with a single target." "Draw a card."), Muck Drubb ("When this creature enters,
// change the target of target spell that targets only a single creature to this creature.") and Meticulous Excavation
// ("{2}{W}: Return target permanent you control to its owner's hand. If it has unearth, instead exile it, then return that
// card to its owner's hand. Activate only during your turn.").

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, compileCard, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

// Real card data (Scryfall).
const herald = (): CardDef => ({"oracleId":"ea9b2e3d-2de4-4cde-b233-6d0ba5797c20","name":"Brass Herald","manaCost":"{6}","cmc":6,"typeLine":"Artifact Creature — Golem","supertypes":[],"types":["Artifact","Creature"],"subtypes":["Golem"],"oracleText":"As this creature enters, choose a creature type.\nWhen this creature enters, reveal the top four cards of your library. Put all creature cards of the chosen type revealed this way into your hand and the rest on the bottom of your library in any order.\nCreatures of the chosen type get +1/+1.","power":"2","toughness":"2","colors":[],"colorIdentity":[],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/8/9/89bd60a7-2ba4-4fce-bf74-2ea9b8fd4dbe.jpg?1783945327","artUrl":"https://cards.scryfall.io/art_crop/front/8/9/89bd60a7-2ba4-4fce-bf74-2ea9b8fd4dbe.jpg?1783945327","commanderLegal":"legal","set":"apc","releasedAt":"2001-06-04","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const ether = (): CardDef => ({"oracleId":"566533af-5e67-463f-ac33-dfcf1ec735c9","name":"Ether","manaCost":"{3}{U}","cmc":4,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}, Exile this artifact: Add {U}. When you next cast an instant or sorcery spell this turn, copy that spell. You may choose new targets for the copy.","colors":["U"],"colorIdentity":["U"],"keywords":[],"producedMana":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/8/9/896ee6e9-15a9-4974-b576-50f4759fac38.jpg?1783906637","artUrl":"https://cards.scryfall.io/art_crop/front/8/9/896ee6e9-15a9-4974-b576-50f4759fac38.jpg?1783906637","commanderLegal":"legal","set":"fin","releasedAt":"2025-06-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const munda = (): CardDef => ({"oracleId":"4d5da73a-f22a-4446-b5f9-504dfabf1d52","name":"Munda, Ambush Leader","manaCost":"{2}{R}{W}","cmc":4,"typeLine":"Legendary Creature — Kor Ally","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Kor","Ally"],"oracleText":"Haste\nRally — Whenever Munda or another Ally you control enters, you may look at the top four cards of your library. If you do, reveal any number of Ally cards from among them, then put those cards on top of your library in any order and the rest on the bottom in any order.","power":"3","toughness":"4","colors":["R","W"],"colorIdentity":["R","W"],"keywords":["Rally","Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/d/8/d8ee09fe-46d7-492b-a2f3-3fb0c3f83f07.jpg?1783938179","artUrl":"https://cards.scryfall.io/art_crop/front/d/8/d8ee09fe-46d7-492b-a2f3-3fb0c3f83f07.jpg?1783938179","commanderLegal":"legal","set":"bfz","releasedAt":"2015-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const wurmquake = (): CardDef => ({"oracleId":"0eeb9a62-1b36-42f5-8820-3331fa5ca3a6","name":"Wurmquake","manaCost":"{4}{G}{G}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Corrupted — Create an X/X green Phyrexian Wurm creature token with trample and toxic 1, where X is the amount of mana spent to cast this spell. Then for each opponent with three or more poison counters, you create another one of those tokens.\nFlashback {8}{G}{G} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["G"],"colorIdentity":["G"],"keywords":["Corrupted","Flashback"],"imageUrl":"https://cards.scryfall.io/normal/front/9/4/94f0a15e-9437-4aa9-86c5-482008124617.jpg?1783918157","artUrl":"https://cards.scryfall.io/art_crop/front/9/4/94f0a15e-9437-4aa9-86c5-482008124617.jpg?1783918157","commanderLegal":"legal","set":"onc","releasedAt":"2023-02-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const tunnel = (): CardDef => ({"oracleId":"0e134040-1fe3-410c-aac5-94ae1bd17637","name":"Tunnel Vision","manaCost":"{5}{U}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Choose a card name. Target player reveals cards from the top of their library until a card with that name is revealed. If it is, that player puts the rest of the revealed cards into their graveyard and puts the card with the chosen name on top of their library. Otherwise, the player shuffles.","colors":["U"],"colorIdentity":["U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/e/ae3eba31-02eb-449a-8a36-899ada5664bc.jpg?1783943676","artUrl":"https://cards.scryfall.io/art_crop/front/a/e/ae3eba31-02eb-449a-8a36-899ada5664bc.jpg?1783943676","commanderLegal":"legal","set":"rav","releasedAt":"2005-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const reroute = (): CardDef => ({"oracleId":"997f5a5a-9ee1-4b66-9ffc-d1a2e996e615","name":"Reroute","manaCost":"{1}{R}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Change the target of target activated ability with a single target. (Mana abilities can't be targeted.)\nDraw a card.","colors":["R"],"colorIdentity":["R"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/4/2/42794e10-ddcd-4d2d-ab0c-a6b99b6d4662.jpg?1783943648","artUrl":"https://cards.scryfall.io/art_crop/front/4/2/42794e10-ddcd-4d2d-ab0c-a6b99b6d4662.jpg?1783943648","commanderLegal":"legal","set":"rav","releasedAt":"2005-10-07","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const drubb = (): CardDef => ({"oracleId":"032a5616-bbaf-4659-86c4-43edf29b9788","name":"Muck Drubb","manaCost":"{3}{B}{B}","cmc":5,"typeLine":"Creature — Beast","supertypes":[],"types":["Creature"],"subtypes":["Beast"],"oracleText":"Flash\nWhen this creature enters, change the target of target spell that targets only a single creature to this creature.\nMadness {2}{B} (If you discard this card, discard it into exile. When you do, cast it for its madness cost or put it into your graveyard.)","power":"3","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":["Madness","Flash"],"imageUrl":"https://cards.scryfall.io/normal/front/e/5/e5bda3fc-89e8-44c2-bcfb-d17064bbc391.jpg?1783943155","artUrl":"https://cards.scryfall.io/art_crop/front/e/5/e5bda3fc-89e8-44c2-bcfb-d17064bbc391.jpg?1783943155","commanderLegal":"legal","set":"plc","releasedAt":"2007-02-02","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const excavation = (): CardDef => ({"oracleId":"6dff1d15-604f-4eea-9b7a-0c0ba6afbbac","name":"Meticulous Excavation","manaCost":"{W}","cmc":1,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"{2}{W}: Return target permanent you control to its owner's hand. If it has unearth, instead exile it, then return that card to its owner's hand. Activate only during your turn.","colors":["W"],"colorIdentity":["W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/e/8/e811461a-6a90-416f-940c-c9579659ae0c.jpg?1783920127","artUrl":"https://cards.scryfall.io/art_crop/front/e/8/e811461a-6a90-416f-940c-c9579659ae0c.jpg?1783920127","commanderLegal":"legal","set":"bro","releasedAt":"2022-11-18","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Puts these cards on top of `pid`'s library, the first one on top. */
const stackTop = (s: GameState, pid: PlayerId, defs: CardDef[]) => [...defs].reverse().map((d) => into(s, pid, d, "library")).reverse();
/** Everyone passes until the stack is empty, answering trigger targets with `targets`; stops at any other question. */
const settle = (s: GameState, opts: { targets?: TargetChoice[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes until `pid` has priority again, with the stack as it is. */
const priorityTo = (s: GameState, pid: PlayerId) => {
  if (waitingOn(s) === pid) s = act(s, { type: "passPriority", player: pid });
  for (let i = 0; i < 4 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const logged = (s: GameState, re: RegExp) => s.log.some((e) => re.test(e.text));
const ptOf = (s: GameState, id: ObjectId) => `${characteristics(s, s.objects[id]!).power}/${characteristics(s, s.objects[id]!).toughness}`;
const zoneOf = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const stackTarget = (s: GameState, re: RegExp): TargetChoice => ({ kind: "stack", id: s.stack.find((x) => re.test(x.description))!.id });

const elf = (name: string) => card(name, "Creature — Elf", "{G}", { cmc: 1, power: "1", toughness: "1" });
const goblin = (name: string) => card(name, "Creature — Goblin", "{R}", { cmc: 1, power: "1", toughness: "1" });
const shapeshifter = card("Test Changeling", "Creature — Shapeshifter", "{2}", { cmc: 2, power: "2", toughness: "2", oracleText: "Changeling (This card is every creature type.)", keywords: ["Changeling"] });
const elfLand = card("Test Elf Grove", "Land");
const tribal = card("Test Elf Rite", "Sorcery", "{G}", { cmc: 1, oracleText: "Draw a card." });
const ally = (name: string) => card(name, "Creature — Human Ally", "{W}", { cmc: 1, power: "1", toughness: "1" });
const bolt = card("Test Bolt", "Instant", "{R}", { cmc: 1, oracleText: "Test Bolt deals 3 damage to any target." });
const divination = card("Test Divination", "Sorcery", "{2}{U}", { cmc: 3, oracleText: "Draw two cards." });
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { cmc: 3, power: "3", toughness: "5" });
const pinger = card("Test Pinger", "Creature — Human Wizard", "{2}{R}", { cmc: 3, power: "1", toughness: "1", oracleText: "{T}: Test Pinger deals 1 damage to any target." });
const twoTargets = card("Test Double Shot", "Instant", "{R}", { cmc: 1, oracleText: "Test Double Shot deals 1 damage to each of two target creatures." });
const growth = card("Test Growth", "Instant", "{G}", { cmc: 1, oracleText: "Target creature gets +3/+3 until end of turn." });
const unearther = card("Test Unearther", "Creature — Zombie", "{1}{B}", { cmc: 2, power: "2", toughness: "1", oracleText: "Unearth {B}", keywords: ["Unearth"] });

describe("Round B196 cards are supported", () => {
  it("compiles all eight", () => supported(herald(), ether(), munda(), wurmquake(), tunnel(), reroute(), drubb(), excavation()));
  it("Ether's ability is a mana ability (rulings), Reroute and Tunnel Vision have one target each", () => {
    expect(compileCard(ether()).activated[0]).toMatchObject({ mana: true, tap: true, exileSelf: true });
    expect(compileCard(reroute()).spell?.targets).toHaveLength(1);
    expect(compileCard(tunnel()).spell?.targets).toEqual([expect.objectContaining({ kind: "player" })]);
  });
});

describe("Brass Herald: the creature cards of the chosen type among the top four into your hand, the rest on the bottom in any order", () => {
  const enter = (top: CardDef[], type = "Elf") => {
    const { s: s0, ap, ids } = setup([herald()]);
    const cards = stackTop(s0, ap, top);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "creatureType" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: type }));
    return { s, ap, cards, herald: ids[0]! };
  };
  it("takes every Elf creature card revealed (a changeling too, CR 702.73a), not other cards, and the rest go to the bottom in the order chosen", () => {
    const { s: s0, ap, cards, herald: h } = enter([elf("Elf A"), goblin("Goblin A"), shapeshifter, tribal]);
    expect(s0.pending).toMatchObject({ kind: "arrangeTop", how: "bottom", player: ap });
    expect(s0.pending?.kind === "arrangeTop" && [...s0.pending.cards].sort()).toEqual([cards[1]!, cards[3]!].sort());
    const s = settle(act(s0, { type: "arrangeTop", player: ap, top: [cards[3]!, cards[1]!], away: [] }));
    expect(s.players[ap]!.hand).toEqual(expect.arrayContaining([cards[0]!, cards[2]!]));
    expect(s.players[ap]!.library.slice(-2).sort()).toEqual([cards[1]!, cards[3]!].sort());
    expect(zoneOf(s, h)).toBe("battlefield");
    // Its own type isn't Elf: the static pumps only the chosen type.
    expect(ptOf(s, h)).toBe("2/2");
  });
  it("creatures of the chosen type get +1/+1, whoever controls them", () => {
    const { s: s0, ap, opp, ids } = setup([herald()]);
    const mine = putOnBattlefield(s0, ap, elf("Elf B"));
    const theirs = putOnBattlefield(s0, opp, elf("Elf C"));
    const gob = putOnBattlefield(s0, opp, goblin("Goblin B"));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Elf" }));
    if (s.pending?.kind === "arrangeTop") s = settle(act(s, { type: "arrangeTop", player: ap, top: s.pending.cards, away: [] }));
    expect([ptOf(s, mine), ptOf(s, theirs), ptOf(s, gob)]).toEqual(["2/2", "2/2", "1/1"]);
  });
  it("with none of the chosen type, all four go to the bottom", () => {
    const { s: s0, ap, cards } = enter([goblin("Goblin C"), elfLand, tribal, goblin("Goblin D")]);
    const hand = s0.players[ap]!.hand.length;
    const s = s0.pending?.kind === "arrangeTop" ? settle(act(s0, { type: "arrangeTop", player: ap, top: [...s0.pending.cards], away: [] })) : s0;
    expect(s.players[ap]!.hand.length).toBe(hand);
    expect(s.players[ap]!.library.slice(-4).sort()).toEqual([...cards].sort());
  });
});

describe("Ether: a mana ability that exiles it; the next instant or sorcery spell you cast this turn is copied", () => {
  const activateEther = () => {
    const { s: s0, ap, opp, ids } = setup([bolt, divination, bolt]);
    const e = putOnBattlefield(s0, ap, ether());
    const s = run(s0, planActivate(s0, ap, e, 0, undefined, undefined, undefined, undefined, undefined, { mana: "U" }));
    return { s, ap, opp, ids, ether: e };
  };
  it("adds {U} at once, without the stack, and Ether is exiled as the cost", () => {
    const { s, ap, ether: e } = activateEther();
    expect(s.stack).toHaveLength(0);
    expect(s.players[ap]!.manaPool.U).toBe(1);
    expect(zoneOf(s, e)).toBe("exile");
  });
  it("the next instant is copied (the copy isn't cast), the copy may get a new target; the one after isn't", () => {
    const { s: s0, ap, opp, ids } = activateEther();
    const third = s0.turnOrder[(s0.turnOrder.indexOf(opp) + 1) % 4]!;
    const life = [s0.players[opp]!.life, s0.players[third]!.life];
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    expect(s.stack.length + s.triggerQueue.length).toBe(2);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "copyTargets" });
    s = settle(act(s, { type: "copyTargets", player: ap, targets: [{ kind: "player", id: third }] } as Action));
    expect([s.players[opp]!.life, s.players[third]!.life]).toEqual([life[0]! - 3, life[1]! - 3]);
    expect(s.castThisTurn?.filter((x) => x.player === ap)).toHaveLength(1);
    const t = settle(run(s, planCast(s, ap, ids[2]!, [{ kind: "player", id: opp }])));
    expect(t.pending).toBeNull();
    expect(t.players[opp]!.life).toBe(life[0]! - 6);
  });
  it("a sorcery counts too, whether or not Ether's mana paid for it (rulings)", () => {
    const { s: s0, ap, ids } = activateEther();
    s0.players[ap]!.manaPool.U = 0;
    const hand = s0.players[ap]!.hand.length;
    let s = run(s0, planCast(s0, ap, ids[1]!));
    s = settle(s);
    // Divination draws two, its copy two more; it left the hand itself.
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 4);
  });
  it("it ends with the turn", () => {
    const { s: s0, ap, opp, ids } = activateEther();
    let s = passUntil(s0, "upkeep", opp);
    s = passUntil(s, "main1", ap);
    const id = ids[0]!;
    s = settle(run(s, planCast(s, ap, id, [{ kind: "player", id: opp }])));
    expect(s.pending).toBeNull();
    expect(s.stack).toHaveLength(0);
    expect(s.log.filter((l) => /Test Bolt deals 3 damage/.test(l.text))).toHaveLength(1);
  });
});

describe("Munda, Ambush Leader: rally, look at the top four, any number of Ally cards back on top in any order, the rest on the bottom", () => {
  const enter = (top: CardDef[]) => {
    const { s: s0, ap, ids } = setup([munda()]);
    const cards = stackTop(s0, ap, top);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    return { s, ap, cards, munda: ids[0]! };
  };
  it("you may look; Ally cards chosen go on top in the order chosen, the others on the bottom in the order chosen", () => {
    const { s: s0, ap, cards } = enter([goblin("Goblin E"), ally("Ally A"), tribal, ally("Ally B"), elf("Elf D")]);
    expect(s0.pending).toMatchObject({ kind: "chooseMay", player: ap });
    let s = act(s0, { type: "chooseMay", player: ap, yes: true } as Action);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const options = s.pending?.kind === "searchLibrary" ? s.pending.cards : [];
    expect([...options].sort()).toEqual([cards[1]!, cards[3]!].sort());
    s = act(s, { type: "searchLibrary", player: ap, found: [cards[1]!, cards[3]!] });
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "order" });
    s = act(s, { type: "arrangeTop", player: ap, top: [cards[3]!, cards[1]!], away: [] });
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "bottom" });
    s = settle(act(s, { type: "arrangeTop", player: ap, top: [cards[2]!, cards[0]!], away: [] }));
    const lib = s.players[ap]!.library;
    expect(lib.slice(0, 2)).toEqual([cards[3]!, cards[1]!]);
    expect(lib.slice(2, 3)).toEqual([cards[4]!]); // the fifth card is untouched
    expect(lib.slice(-2).sort()).toEqual([cards[0]!, cards[2]!].sort());
  });
  it("revealing none puts all four on the bottom; declining to look changes nothing", () => {
    const { s: s0, ap, cards } = enter([ally("Ally C"), goblin("Goblin F"), tribal, elfLand]);
    let s = act(s0, { type: "chooseMay", player: ap, yes: true } as Action);
    s = act(s, { type: "searchLibrary", player: ap, found: [] });
    if (s.pending?.kind === "arrangeTop") s = settle(act(s, { type: "arrangeTop", player: ap, top: [...s.pending.cards], away: [] }));
    expect(s.players[ap]!.library.slice(-4).sort()).toEqual([...cards].sort());
    const t = settle(act(s0, { type: "chooseMay", player: ap, yes: false } as Action));
    expect(t.players[ap]!.library.slice(0, 4)).toEqual(cards);
  });
  it("another Ally entering triggers it too; a non-Ally doesn't", () => {
    const { s: s0, ap, ids } = setup([ally("Ally D"), goblin("Goblin G")]);
    putOnBattlefield(s0, ap, munda());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseMay" });
    const t = settle(run(s0, planCast(s0, ap, ids[1]!)));
    expect(t.pending).toBeNull();
  });
  it("a bot keeps Ally cards on top", () => {
    const { s: s0, ap, cards } = enter([goblin("Goblin H"), ally("Ally E"), tribal, elfLand]);
    let s = s0;
    for (let i = 0; i < 6 && s.pending; i++) s = settle(run(s, botActions(s, ap)));
    expect(s.players[ap]!.library[0]).toBe(cards[1]);
  });
});

describe("Wurmquake: an X/X Wurm for the mana spent, then another for each opponent with three or more poison counters", () => {
  const wurms = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid);
  it("6 mana spent: one 6/6 with trample and toxic 1, plus one more for each poisoned opponent", () => {
    const { s: s0, ap, ids } = setup([wurmquake()]);
    const opps = s0.turnOrder.filter((p) => p !== ap);
    s0.players[opps[0]!]!.poison = 3;
    s0.players[opps[1]!]!.poison = 5;
    s0.players[opps[2]!]!.poison = 2;
    s0.players[ap]!.poison = 9; // yours doesn't count
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const w = wurms(s, ap);
    expect(w).toHaveLength(3);
    for (const id of w) {
      expect(ptOf(s, id)).toBe("6/6");
      expect(characteristics(s, s.objects[id]!).keywords).toEqual(expect.arrayContaining(["Trample", "Toxic 1"]));
    }
  });
  it("with no poisoned opponent, one; cast with flashback for {8}{G}{G}, a 10/10, then it's exiled", () => {
    const { s: s0, ap } = setup([]);
    const w0 = into(s0, ap, wurmquake(), "graveyard");
    s0.players[ap]!.manaPool.C = 8;
    const s = settle(run(s0, planCast(s0, ap, w0, undefined, undefined, undefined, undefined, { via: "flashback" })));
    const w = wurms(s, ap);
    expect(w).toHaveLength(1);
    expect(ptOf(s, w[0]!)).toBe("10/10");
    expect(zoneOf(s, w0)).toBe("exile");
  });
});

describe("Tunnel Vision: reveal until the named card; found, the cards above it go to the graveyard and it stays on top; otherwise shuffle", () => {
  const castAt = (top: CardDef[], extra: CardDef[] = []) => {
    const { s: s0, ap, opp, ids } = setup([tunnel()]);
    for (const d of extra) into(s0, opp, d, "library");
    const cards = stackTop(s0, opp, top);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "cardName", player: ap });
    return { s, ap, opp, cards, spell: ids[0]! };
  };
  it("the cards above the named one go to its owner's graveyard; it's left on top, no shuffle", () => {
    const { s: s0, opp, ap, cards } = castAt([goblin("Goblin I"), tribal, ogre, elf("Elf E")]);
    const below = s0.players[opp]!.library.slice(4);
    const s = settle(act(s0, { type: "chooseOption", player: ap, choice: "Test Ogre" }));
    expect(s.players[opp]!.graveyard).toEqual(expect.arrayContaining([cards[0]!, cards[1]!]));
    expect(s.players[opp]!.library[0]).toBe(cards[2]);
    expect(s.players[opp]!.library.slice(1)).toEqual([cards[3]!, ...below]);
  });
  it("the named card already on top: nothing goes to the graveyard", () => {
    const { s: s0, opp, ap, cards } = castAt([ogre, tribal]);
    const yard = s0.players[opp]!.graveyard.length;
    const s = settle(act(s0, { type: "chooseOption", player: ap, choice: "Test Ogre" }));
    expect(s.players[opp]!.graveyard.length).toBe(yard);
    expect(s.players[opp]!.library[0]).toBe(cards[0]);
  });
  it("not found: the whole library is revealed, nothing goes to the graveyard, and it's shuffled (rulings)", () => {
    const { s: s0, opp, ap } = castAt([goblin("Goblin J"), tribal]);
    const yard = s0.players[opp]!.graveyard.length;
    const lib = [...s0.players[opp]!.library];
    const s = settle(act(s0, { type: "chooseOption", player: ap, choice: "Tunnel Vision" }));
    expect(s.players[opp]!.graveyard.length).toBe(yard);
    expect([...s.players[opp]!.library].sort()).toEqual([...lib].sort());
    expect(s.players[opp]!.library).not.toEqual(lib);
    expect(logged(s, /shuffles their library/)).toBe(true);
  });
  it("the name is asked for as it resolves, about the target player's library (for bots)", () => {
    const { s: s0, ap, opp } = castAt([goblin("Goblin K"), tribal, ogre]);
    expect(s0.pending).toMatchObject({ purpose: "inLibrary", of: opp });
    expect(botActions(s0, ap)[0]?.type).toBe("chooseOption");
  });
});

describe("Reroute: change the target of target activated ability with a single target, then draw a card", () => {
  it("the ability's target changes to another legal one; you draw", () => {
    const { s: s0, ap, opp, ids } = setup([reroute()]);
    const pinger0 = putOnBattlefield(s0, opp, pinger);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(opp) + 1) % 4]!;
    s0.activePlayer = s0.activePlayer;
    // The opponent pings you; you respond with Reroute.
    s0.priority = opp;
    let s = run(s0, planActivate(s0, opp, pinger0, 0, [{ kind: "player", id: ap }]));
    s = priorityTo(s, ap);
    const hand = s.players[ap]!.hand.length;
    s = run(s, planCast(s, ap, ids[0]!, [stackTarget(s, /Test Pinger/)]));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "changeTarget", player: ap });
    s = settle(act(s, { type: "changeTarget", player: ap, target: { kind: "player", id: third } }));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
    expect(s.players[third]!.life).toBe(39);
    expect(s.players[ap]!.life).toBe(40);
  });
  it("a spell isn't a legal target, nor an ability with two targets", () => {
    const { s: s0, ap, ids } = setup([bolt, reroute()]);
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: ap }]));
    expect(planCast(s, ap, ids[1]!, [stackTarget(s, /Test Bolt/)])).toBeNull();
  });
});

describe("Muck Drubb: as it enters, a spell that targets only a single creature is changed to target it", () => {
  const respond = (spell: CardDef, targets: (s: GameState, ap: PlayerId, opp: PlayerId, mine: ObjectId) => TargetChoice[]) => {
    const { s: s0, ap, opp, ids } = setup([spell, drubb()]);
    const mine = putOnBattlefield(s0, ap, ogre);
    const other = putOnBattlefield(s0, ap, ogre);
    let s = run(s0, planCast(s0, ap, ids[0]!, targets(s0, ap, opp, mine).map((t) => (t.kind === "object" && t.id === "other" ? tgt(other) : t))));
    s = run(s, planCast(s, ap, ids[1]!));
    s = settle(s);
    return { s, ap, opp, mine, other, drubb: ids[1]! };
  };
  it("Test Bolt aimed at your creature hits Muck Drubb instead", () => {
    const { s: s0, mine, drubb: d } = respond(bolt, (_s, _ap, _opp, mine) => [tgt(mine)]);
    expect(s0.pending).toMatchObject({ kind: "chooseTargets" });
    const s = settle(act(s0, { type: "chooseTargets", player: s0.pending!.player, targets: [stackTarget(s0, /Test Bolt/)] }));
    expect(s.objects[mine]!.damage ?? 0).toBe(0);
    expect(zoneOf(s, d)).toBe("graveyard");
    expect(logged(s, /changes the target of Test Bolt to Muck Drubb/)).toBe(true);
  });
  it("a spell that targets a player, or two different creatures, can't be targeted (rulings)", () => {
    const a = respond(bolt, (_s, _ap, opp) => [{ kind: "player", id: opp }]);
    expect(a.s.pending).toBeNull();
    const b = respond(twoTargets, (_s, _ap, _opp, mine) => [tgt(mine), tgt("other")]);
    expect(b.s.pending).toBeNull();
    expect(b.s.objects[b.mine]!.damage).toBe(1);
    expect(b.s.objects[b.other]!.damage).toBe(1);
  });
  it("Muck Drubb must be a legal target for that spell: a spell that only targets creatures you don't control stays", () => {
    const enemyOnly = card("Test Enemy Shot", "Instant", "{R}", { cmc: 1, oracleText: "Test Enemy Shot deals 2 damage to target creature an opponent controls." });
    const { s: s0, ap, opp, ids } = setup([enemyOnly, drubb()]);
    const theirs = putOnBattlefield(s0, opp, ogre);
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(theirs)]));
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [stackTarget(s, /Test Enemy Shot/)] }));
    expect(s.objects[theirs]!.damage).toBe(2);
    expect(logged(s, /can't become the target of Test Enemy Shot/)).toBe(true);
  });
  it("the same creature targeted by every target changes them all (rulings)", () => {
    const twice = card("Test Twin Growth", "Instant", "{G}", { cmc: 1, oracleText: "Target creature gets +1/+1 until end of turn. Target creature gets +1/+1 until end of turn." });
    const { s: s0, ap, ids } = setup([twice, drubb()]);
    const mine = putOnBattlefield(s0, ap, ogre);
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(mine), tgt(mine)]));
    s = settle(run(s, planCast(s, ap, ids[1]!)));
    expect(s.pending).toMatchObject({ kind: "chooseTargets" });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [stackTarget(s, /Test Twin Growth/)] }));
    expect(ptOf(s, ids[1]!)).toBe("5/5");
    expect(ptOf(s, mine)).toBe("3/5");
  });
});

describe("Meticulous Excavation: return target permanent you control to its owner's hand; one with unearth is exiled and then returned", () => {
  it("a permanent without unearth simply returns; only during your turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const ex = putOnBattlefield(s0, ap, excavation());
    const o = putOnBattlefield(s0, ap, ogre);
    const s = settle(run(s0, planActivate(s0, ap, ex, 0, [tgt(o)])));
    expect(zoneOf(s, o)).toBe("hand");
    const t0 = passUntil(s0, "upkeep", opp);
    expect(planActivate(t0, ap, ex, 0, [tgt(o)])).toBeNull();
  });
  it("an unearthed creature, whose leaving would exile it, ends up in its owner's hand (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const ex = putOnBattlefield(s0, ap, excavation());
    const z = into(s0, ap, unearther, "graveyard");
    let s = settle(run(s0, planActivate(s0, ap, z, 0)));
    expect(zoneOf(s, z)).toBe("battlefield");
    s = settle(run(s, planActivate(s, ap, ex, 0, [tgt(z)])));
    expect(zoneOf(s, z)).toBe("hand");
    expect(s.players[ap]!.hand).toContain(z);
  });
  it("a creature card with unearth that wasn't unearthed goes the same way, through exile", () => {
    const { s: s0, ap } = setup([]);
    const ex = putOnBattlefield(s0, ap, excavation());
    const z = putOnBattlefield(s0, ap, unearther);
    const s = settle(run(s0, planActivate(s0, ap, ex, 0, [tgt(z)])));
    expect(zoneOf(s, z)).toBe("hand");
    expect(logged(s, /exile/i)).toBe(true);
  });
  it("without the exile, unearth's replacement would have exiled it: a plain bounce of an unearthed creature exiles it", () => {
    const bounce = card("Test Unsummon", "Instant", "{U}", { cmc: 1, oracleText: "Return target creature to its owner's hand." });
    const { s: s0, ap, ids } = setup([bounce]);
    const z = into(s0, ap, unearther, "graveyard");
    let s = settle(run(s0, planActivate(s0, ap, z, 0)));
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(z)])));
    expect(zoneOf(s, z)).toBe("exile");
  });
});
