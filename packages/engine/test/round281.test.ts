// Round 281: text-changing effects (CR 612, layer 3): Sleight of Mind, Alter Reality, Glamerdye, Mind Bend, Magical Hack,
// Crystal Spray, Whim of Volrath, Trait Doctoring, Spectral Shift, Artificial Evolution, New Blood.

import { describe, expect, it } from "vitest";
import { act, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { applyAction, botActions, characteristics, controllerOf, defOf, isFullySupported, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
/** Everyone passes until the stack is empty; stops at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    if (s.pending) return s;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Answers the two word questions of a text change: the old word, then the new one (if asked). */
const words = (s: GameState, from: string, to?: string) => {
  let p = s.pending;
  if (p?.kind !== "chooseOption" || p.what !== "textFrom") throw new Error(`no word asked for: ${JSON.stringify(p)}`);
  s = act(s, { type: "chooseOption", player: p.player, choice: from });
  if (to === undefined) return settle(s);
  p = s.pending;
  if (p?.kind !== "chooseOption" || p.what !== "textTo") throw new Error(`no new word asked for: ${JSON.stringify(p)}`);
  return settle(act(s, { type: "chooseOption", player: p.player, choice: to }));
};
const kw = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).keywords;
const subtypes = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).subtypes;
const pt = (s: GameState, id: ObjectId) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const inHand = (s: GameState, pid: number, d: CardDef) => {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
};

// Real oracle text (Scryfall).
const sleight = (): CardDef => ({"oracleId":"99dba614-40d3-41c1-a3b2-edc8777b010f","name":"Sleight of Mind","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Change the text of target spell or permanent by replacing all instances of one color word with another. (For example, you may change \"target black spell\" to \"target blue spell.\" This effect lasts indefinitely.)","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"ice","releasedAt":"1995-06-03","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const alter = (): CardDef => ({"oracleId":"054c00b4-c940-455a-ad88-b8aa35931ecf","name":"Alter Reality","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Change the text of target spell or permanent by replacing all instances of one color word with another. (This effect lasts indefinitely.)\nFlashback {1}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","colors":["U"],"colorIdentity":["U"],"keywords":["Flashback"],"commanderLegal":"legal","set":"tor","releasedAt":"2002-02-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const glamerdye = (): CardDef => ({"oracleId":"570a5e60-ed0f-4c14-8cc3-af819648030b","name":"Glamerdye","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Change the text of target spell or permanent by replacing all instances of one color word with another.\nRetrace (You may cast this card from your graveyard by discarding a land card in addition to paying its other costs.)","colors":["U"],"colorIdentity":["U"],"keywords":["Retrace"],"commanderLegal":"legal","set":"eve","releasedAt":"2008-07-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const mindBend = (): CardDef => ({"oracleId":"d8377869-f8f7-4b4b-93ad-3ad3c4826b1a","name":"Mind Bend","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Change the text of target permanent by replacing all instances of one color word with another or one basic land type with another. (For example, you may change \"nonblack creature\" to \"nongreen creature\" or \"forestwalk\" to \"islandwalk.\" This effect lasts indefinitely.)","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"mir","releasedAt":"1996-10-08","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const hack = (): CardDef => ({"oracleId":"cba229fa-9035-405b-b091-3798898a37ee","name":"Magical Hack","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Change the text of target spell or permanent by replacing all instances of one basic land type with another. (For example, you may change \"swampwalk\" to \"plainswalk.\" This effect lasts indefinitely.)","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"sld","releasedAt":"2025-12-01","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const spray = (): CardDef => ({"oracleId":"fe371e3a-976f-41d8-ad58-4b3b61415d71","name":"Crystal Spray","manaCost":"{2}{U}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Change the text of target spell or permanent by replacing all instances of one color word with another or one basic land type with another until end of turn.\nDraw a card.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"inv","releasedAt":"2000-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const whim = (): CardDef => ({"oracleId":"51a20c9f-68d2-471b-8622-67d481b53b92","name":"Whim of Volrath","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Buyback {2} (You may pay an additional {2} as you cast this spell. If you do, put this card into your hand as it resolves.)\nChange the text of target permanent by replacing all instances of one color word with another or one basic land type with another until end of turn. (For example, you may change \"nonred creature\" to \"nongreen creature\" or \"plainswalk\" to \"swampwalk.\")","colors":["U"],"colorIdentity":["U"],"keywords":["Buyback"],"commanderLegal":"legal","set":"tmp","releasedAt":"1997-10-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const doctoring = (): CardDef => ({"oracleId":"3b5b926b-ee8f-4c7a-8737-1de7d18ca60d","name":"Trait Doctoring","manaCost":"{U}","cmc":1,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Change the text of target permanent by replacing all instances of one color word with another or one basic land type with another until end of turn.\nCipher (Then you may exile this spell card encoded on a creature you control. Whenever that creature deals combat damage to a player, its controller may cast a copy of the encoded card without paying its mana cost.)","colors":["U"],"colorIdentity":["U"],"keywords":["Cipher"],"commanderLegal":"legal","set":"dgm","releasedAt":"2013-05-03","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const shift = (): CardDef => ({"oracleId":"99eb4f63-841f-4b6b-9794-82bc2ed7b758","name":"Spectral Shift","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose one —\n• Change the text of target spell or permanent by replacing all instances of one basic land type with another. (This effect lasts indefinitely.)\n• Change the text of target spell or permanent by replacing all instances of one color word with another. (This effect lasts indefinitely.)\nEntwine {2} (Choose both if you pay the entwine cost.)","colors":["U"],"colorIdentity":["U"],"keywords":["Entwine"],"commanderLegal":"legal","set":"5dn","releasedAt":"2004-06-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const evolution = (): CardDef => ({"oracleId":"c5ab6dc9-34af-434f-ae8e-b2389ee6c5ae","name":"Artificial Evolution","manaCost":"{U}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Change the text of target spell or permanent by replacing all instances of one creature type with another. The new creature type can't be Wall. (This effect lasts indefinitely.)","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"ons","releasedAt":"2002-10-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const newBlood = (): CardDef => ({"oracleId":"021d654e-b731-40d0-a18e-eaff43f9fdb9","name":"New Blood","manaCost":"{2}{B}{B}","cmc":4,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"As an additional cost to cast this spell, tap an untapped Vampire you control.\nGain control of target creature. Change the text of that creature by replacing all instances of one creature type with Vampire.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"c17","releasedAt":"2017-08-25","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const whiteKnight = (): CardDef => ({"oracleId":"ddb021df-ae4a-4ac1-8353-d0b375761714","name":"White Knight","manaCost":"{W}{W}","cmc":2,"typeLine":"Creature — Human Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"First strike (This creature deals combat damage before creatures without first strike.)\nProtection from black (This creature can't be blocked, targeted, dealt damage, or enchanted by anything black.)","power":"2","toughness":"2","colors":["W"],"colorIdentity":["W"],"keywords":["First strike","Protection"],"commanderLegal":"legal","set":"m10","releasedAt":"2009-07-17","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const doomBlade = (): CardDef => ({"oracleId":"59e7f2ae-4535-4191-98be-3e65b6b2befa","name":"Doom Blade","manaCost":"{1}{B}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Destroy target nonblack creature.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const bogWraith = (): CardDef => ({"oracleId":"508248d1-09a4-4e41-a4c9-286618e5061e","name":"Bog Wraith","manaCost":"{3}{B}","cmc":4,"typeLine":"Creature — Wraith","supertypes":[],"types":["Creature"],"subtypes":["Wraith"],"oracleText":"Swampwalk (This creature can't be blocked as long as defending player controls a Swamp.)","power":"3","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":["Landwalk","Swampwalk"],"commanderLegal":"legal","set":"10e","releasedAt":"2007-07-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const goblinKing = (): CardDef => ({"oracleId":"d236b3fc-0d3f-4d99-875d-e32a33fe5767","name":"Goblin King","manaCost":"{1}{R}{R}","cmc":3,"typeLine":"Creature — Goblin","supertypes":[],"types":["Creature"],"subtypes":["Goblin"],"oracleText":"Other Goblins get +1/+1 and have mountainwalk.","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":[],"commanderLegal":"legal","set":"sld","releasedAt":"2019-12-07","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const llanowar = (): CardDef => ({"oracleId":"68954295-54e3-4303-a6bc-fc4547a4e3a3","name":"Llanowar Elves","manaCost":"{G}","cmc":1,"typeLine":"Creature — Elf Druid","supertypes":[],"types":["Creature"],"subtypes":["Elf","Druid"],"oracleText":"{T}: Add {G}.","power":"1","toughness":"1","colors":["G"],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"commanderLegal":"legal","set":"sld","releasedAt":"2026-07-13","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const ragingGoblin = (): CardDef => ({"oracleId":"30997b43-fc13-41d3-8064-1ccc2cb6fd2b","name":"Raging Goblin","manaCost":"{R}","cmc":1,"typeLine":"Creature — Goblin Berserker","supertypes":[],"types":["Creature"],"subtypes":["Goblin","Berserker"],"oracleText":"Haste (This creature can attack and {T} as soon as it comes under your control.)","power":"1","toughness":"1","colors":["R"],"colorIdentity":["R"],"keywords":["Haste"],"commanderLegal":"legal","set":"p02","releasedAt":"1998-06-24","rarity":"common","layout":"normal","gameChanger":false}) as CardDef;
const blackKnight = (): CardDef => ({"oracleId":"9456c5b6-946d-403a-8ed0-dff9f921d98c","name":"Black Knight","manaCost":"{B}{B}","cmc":2,"typeLine":"Creature — Human Knight","supertypes":[],"types":["Creature"],"subtypes":["Human","Knight"],"oracleText":"First strike (This creature deals combat damage before creatures without first strike.)\nProtection from white (This creature can't be blocked, targeted, dealt damage, or enchanted by anything white.)","power":"2","toughness":"2","colors":["B"],"colorIdentity":["B"],"keywords":["First strike","Protection"],"commanderLegal":"legal","set":"m10","releasedAt":"2009-07-17","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const vampire = () => card("Test Vampire", "Creature — Vampire", "{1}{B}", { power: "2", toughness: "2" });

describe("round 281: text-changing effects", () => {
  it("every card of the round compiles fully", () => {
    supported(sleight(), alter(), glamerdye(), mindBend(), hack(), spray(), whim(), doctoring(), shift(), evolution(), newBlood());
  });

  it("Sleight of Mind changes a color word on a permanent, not its name: White Knight gets protection from red", () => {
    const { s: s0, ap, ids, opp } = setup([sleight()]);
    const knight = putOnBattlefield(s0, opp, whiteKnight());
    expect(kw(s0, knight)).toContain("Protection from black");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(knight)])));
    const p = s.pending;
    expect(p?.kind === "chooseOption" && p.what === "textFrom" && p.player === ap && p.about === knight).toBe(true);
    // Any color word, even one the text doesn't have (rulings); then a different one.
    expect(p?.kind === "chooseOption" && p.options).toEqual(["white", "blue", "black", "red", "green"]);
    s = act(s, { type: "chooseOption", player: ap, choice: "black" });
    const q = s.pending;
    expect(q?.kind === "chooseOption" && q.what === "textTo" && q.options).toEqual(["white", "blue", "red", "green"]);
    expect(() => act(s, { type: "chooseOption", player: ap, choice: "black" })).toThrow();
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "red" }));
    expect(kw(s, knight)).toContain("Protection from red");
    expect(kw(s, knight)).not.toContain("Protection from black");
    expect(kw(s, knight)).toContain("First strike");
    // Its name is a card name, not a color word (CR 612.2).
    expect(characteristics(s, s.objects[knight]!).name).toBe("White Knight");
    // It lasts indefinitely.
    s = passUntil(s, "upkeep", opp);
    expect(kw(s, knight)).toContain("Protection from red");
  });

  it("a text change ends when the permanent leaves the battlefield (CR 400.7)", () => {
    const { s: s0, ap, ids, opp } = setup([alter()]);
    const knight = putOnBattlefield(s0, opp, whiteKnight());
    let s = words(settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(knight)]))), "black", "green");
    expect(kw(s, knight)).toContain("Protection from green");
    expect(s.objects[knight]!.textChanges).toHaveLength(1);
    // Bounced and put back: a new object with its printed text.
    s = structuredClone(s);
    s.battlefield.splice(s.battlefield.indexOf(knight), 1);
    s.objects[knight]!.zone = "hand";
    s.players[opp]!.hand.push(knight);
    expect(s.objects[knight]!.textChanges).toHaveLength(1);
    const back = putOnBattlefield(s, opp, whiteKnight());
    expect(kw(s, back)).toContain("Protection from black");
  });

  it("a text change on a spell can make its target illegal: Doom Blade's nonblack becomes nongreen", () => {
    const { s: s0, ap, ids, opp } = setup([doomBlade(), glamerdye()]);
    const elves = putOnBattlefield(s0, opp, llanowar());
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(elves)]));
    const blade = s.stack[s.stack.length - 1]!;
    // Holding priority, a text change on Doom Blade on the stack.
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: blade.id }])));
    s = words(s, "black", "green");
    // "Destroy target nongreen creature": the Elves are an illegal target now, so it does nothing (CR 608.2b).
    expect(s.objects[elves]!.zone).toBe("battlefield");
    expect(s.stack).toHaveLength(0);
  });

  it("a permanent spell keeps its text change on the battlefield (CR 400.7a)", () => {
    const { s: s0, ap, ids } = setup([whiteKnight(), sleight()]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const spell = s.stack[s.stack.length - 1]!;
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: spell.id }])));
    s = words(s, "black", "blue");
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
    expect(kw(s, ids[0]!)).toContain("Protection from blue");
  });

  it("Magical Hack changes a land's basic land type on its type line, so its mana ability, not its name", () => {
    const { s: s0, ap, ids, opp } = setup([hack()]);
    const land = putOnBattlefield(s0, opp, card("Swamp", "Basic Land — Swamp"));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(land)])));
    const p = s.pending;
    expect(p?.kind === "chooseOption" && p.options).toEqual(["Plains", "Island", "Swamp", "Mountain", "Forest"]);
    s = words(s, "Swamp", "Island");
    expect(subtypes(s, land)).toEqual(["Island"]);
    expect(characteristics(s, s.objects[land]!).name).toBe("Swamp");
    expect(defOf(s, s.objects[land]!).typeLine).toBe("Basic Land — Island");
  });

  it("Mind Bend changes swampwalk to islandwalk; Bog Wraith is still a Wraith", () => {
    const { s: s0, ap, ids, opp } = setup([mindBend()]);
    const wraith = putOnBattlefield(s0, opp, bogWraith());
    expect(kw(s0, wraith)).toContain("Swampwalk");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(wraith)])));
    // A color word or a basic land type: both kinds are offered, then one of the same kind.
    const p = s.pending;
    expect(p?.kind === "chooseOption" && p.options).toEqual(["white", "blue", "black", "red", "green", "Plains", "Island", "Swamp", "Mountain", "Forest"]);
    s = act(s, { type: "chooseOption", player: ap, choice: "Swamp" });
    const q = s.pending;
    expect(q?.kind === "chooseOption" && q.options).toEqual(["Plains", "Island", "Mountain", "Forest"]);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Island" }));
    expect(kw(s, wraith)).toContain("Islandwalk");
    expect(kw(s, wraith)).not.toContain("Swampwalk");
    expect(subtypes(s, wraith)).toEqual(["Wraith"]);
  });

  it("Crystal Spray's change lasts until end of turn, and it draws a card", () => {
    const { s: s0, ap, ids, opp } = setup([spray()]);
    const knight = putOnBattlefield(s0, opp, blackKnight());
    const hand = s0.players[ap]!.hand.length;
    let s = words(settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(knight)]))), "white", "red");
    expect(kw(s, knight)).toContain("Protection from red");
    expect(s.players[ap]!.hand.length).toBe(hand); // cast one, drew one
    s = passUntil(s, "upkeep", opp);
    expect(kw(s, knight)).toContain("Protection from white");
    expect(s.objects[knight]!.textChanges).toBeUndefined();
  });

  it("Whim of Volrath with buyback returns to its owner's hand; its change lasts until end of turn", () => {
    const { s: s0, ap, ids, opp } = setup([whim()]);
    const land = putOnBattlefield(s0, opp, card("Forest", "Basic Land — Forest"));
    let s = run(s0, planCast(s0, ap, ids[0]!, [tgt(land)], undefined, undefined, undefined, { buyback: true }));
    s = words(settle(s), "Forest", "Mountain");
    expect(subtypes(s, land)).toEqual(["Mountain"]);
    expect(s.players[ap]!.hand).toContain(ids[0]!);
    s = passUntil(s, "upkeep", opp);
    expect(subtypes(s, land)).toEqual(["Forest"]);
  });

  it("Trait Doctoring changes the text of target permanent until end of turn", () => {
    const { s: s0, ap, ids, opp } = setup([doctoring()]);
    const knight = putOnBattlefield(s0, opp, whiteKnight());
    const s = words(settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(knight)]))), "black", "white");
    expect(kw(s, knight)).toContain("Protection from white");
  });

  it("Spectral Shift entwined: a basic land type and a color word, each chosen in turn", () => {
    const { s: s0, ap, ids, opp } = setup([shift()]);
    const wraith = putOnBattlefield(s0, opp, bogWraith());
    const knight = putOnBattlefield(s0, opp, whiteKnight());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(wraith), tgt(knight)], [0, 1])));
    s = words(s, "Swamp", "Forest");
    s = words(s, "black", "white");
    expect(kw(s, wraith)).toContain("Forestwalk");
    expect(kw(s, knight)).toContain("Protection from white");
  });

  it("Artificial Evolution changes a creature type in the text and on the type line; never to Wall", () => {
    const { s: s0, ap, ids, opp } = setup([evolution()]);
    const king = putOnBattlefield(s0, opp, goblinKing());
    const goblin = putOnBattlefield(s0, opp, ragingGoblin());
    const elves = putOnBattlefield(s0, opp, llanowar());
    expect(pt(s0, goblin)).toBe("2/2");
    expect(kw(s0, goblin)).toContain("Mountainwalk");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(king)])));
    s = act(s, { type: "chooseOption", player: ap, choice: "Goblin" });
    const q = s.pending;
    expect(q?.kind === "chooseOption" && q.what === "textTo" && q.options.includes("Wall")).toBe(false);
    expect(q?.kind === "chooseOption" && q.options.includes("Goblin")).toBe(false);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Elf" }));
    // "Other Elves get +1/+1 and have mountainwalk", and Goblin King is an Elf.
    expect(pt(s, goblin)).toBe("1/1");
    expect(pt(s, elves)).toBe("2/2");
    expect(kw(s, elves)).toContain("Mountainwalk");
    expect(subtypes(s, king)).toEqual(["Elf"]);
  });

  it("New Blood gains control of the creature and makes its creature type Vampire", () => {
    const { s: s0, ap, ids, opp } = setup([newBlood()]);
    const vamp = putOnBattlefield(s0, ap, vampire());
    const king = putOnBattlefield(s0, opp, goblinKing());
    // "Tap an untapped Vampire you control" is chosen as it's cast (CR 601.2h).
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(king)], undefined, undefined, undefined, { tap: [vamp] })));
    expect(s.objects[vamp]!.tapped).toBe(true);
    const p = s.pending;
    expect(p?.kind === "chooseOption" && p.what === "textFrom").toBe(true);
    s = words(s, "Goblin");
    expect(controllerOf(s, s.objects[king]!)).toBe(ap);
    expect(subtypes(s, king)).toEqual(["Vampire"]);
    // "Other Vampires get +1/+1 and have mountainwalk."
    expect(pt(s, vamp)).toBe("3/3");
  });

  it("a bot answers both word questions with words that change something", () => {
    const { s: s0, ap, ids, opp } = setup([mindBend()]);
    const wraith = putOnBattlefield(s0, opp, bogWraith());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(wraith)])));
    for (let i = 0; i < 3 && s.pending; i++) s = settle(run(s, botActions(s, ap)));
    expect(s.objects[wraith]!.textChanges?.[0]?.from).toBe("Swamp");
    expect(kw(s, wraith)).not.toContain("Swampwalk");
  });
});
