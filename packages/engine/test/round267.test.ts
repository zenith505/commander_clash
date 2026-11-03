// Round 267, from the top of the popularity list: Kotis, the Fangkeeper (exile the top X of the damaged player's library,
// X the combat damage, and cast any number with mana value X or less), Olivia, Crimson Bride (a creature returned
// tapped and attacking gains a state trigger about legendary Vampires), Heartless Conscription (play each card exiled
// this way, mana of any type), Crabomination (the top card of a library, one at random from the graveyard and one from
// the hand), Dream Harvest (each opponent exiles until a total mana value of 5, cast them free this turn), Kaervek, the
// Punisher (cast a copy from your graveyard, then lose 2 life), Chandra, Legacy of Fire (a loyalty counter off each of
// any number of permanents, that many cards to play this turn), Tranquil Frillback and Hawkeye, Master Marksman (pay up
// to three times, then choose up to that many modes).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, applyAction, botActions, castProblem, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, runStateBasedActions, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; stops at any question but blockers (none declared). */
const settle = (s: GameState) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Passes until a question of this kind, declaring no attackers or blockers on the way. */
const passTo = (s: GameState, kind: string, max = 80) => {
  for (let i = 0; i < max && s.pending?.kind !== kind; i++) {
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: waitingOn(s)!, blocks: [] });
    else if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: waitingOn(s)!, attacks: [] });
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const opps = (s: GameState, ap: PlayerId) => [1, 2, 3].map((k) => s.turnOrder[(s.turnOrder.indexOf(ap) + k) % s.turnOrder.length]!);
const zone = (s: GameState, id: ObjectId) => s.objects[id]?.zone;
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
const indexOf = (s: GameState, id: ObjectId, text: RegExp) => {
  const i = abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => text.test(a.text));
  if (i < 0) throw new Error(`no ability ${text}`);
  return i;
};
const options = (s: GameState) => (s.pending?.kind === "chooseOption" ? s.pending.options : []);
const sorcery = (name: string, cost: string, cmc: number, text = "Draw a card.") => card(name, "Sorcery", cost, { cmc, oracleText: text });

const kotis = (): CardDef => ({"oracleId":"2eb2f6a2-e31a-4d3e-93ce-100394899014","name":"Kotis, the Fangkeeper","manaCost":"{1}{B}{G}{U}","cmc":4,"typeLine":"Legendary Creature — Zombie Warrior","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Zombie","Warrior"],"oracleText":"Indestructible\nWhenever Kotis deals combat damage to a player, exile the top X cards of their library, where X is the amount of damage dealt. You may cast any number of spells with mana value X or less from among them without paying their mana costs.","power":"2","toughness":"1","colors":["B","G","U"],"colorIdentity":["B","G","U"],"keywords":["Indestructible"],"imageUrl":"https://cards.scryfall.io/normal/front/d/3/d3736f17-f80b-4b2c-b919-2c963bc14682.jpg?1783907308","artUrl":"https://cards.scryfall.io/art_crop/front/d/3/d3736f17-f80b-4b2c-b919-2c963bc14682.jpg?1783907308","commanderLegal":"legal","set":"tdm","releasedAt":"2025-04-11","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const olivia = (): CardDef => ({"oracleId":"8922a91e-3d15-4351-8d77-e0d6bc4de82e","name":"Olivia, Crimson Bride","manaCost":"{4}{B}{R}","cmc":6,"typeLine":"Legendary Creature — Vampire Noble","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Vampire","Noble"],"oracleText":"Flying, haste\nWhenever Olivia attacks, return target creature card from your graveyard to the battlefield tapped and attacking. It gains \"When you don't control a legendary Vampire, exile this creature.\"","power":"3","toughness":"4","colors":["B","R"],"colorIdentity":["B","R"],"keywords":["Flying","Haste"],"imageUrl":"https://cards.scryfall.io/normal/front/2/b/2b3b9c19-c563-4c83-a586-3d7a8b081b64.jpg?1783924150","artUrl":"https://cards.scryfall.io/art_crop/front/2/b/2b3b9c19-c563-4c83-a586-3d7a8b081b64.jpg?1783924150","commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;
const conscription = (): CardDef => ({"oracleId":"cb9b317b-bb31-4c19-8b78-0fb9a61324b3","name":"Heartless Conscription","manaCost":"{6}{B}{B}","cmc":8,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Exile all creatures. For each card exiled this way, you may play that card for as long as it remains exiled, and mana of any type can be spent to cast that spell. Exile Heartless Conscription.","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/2/52fc4862-b57b-42d7-be8b-d9915a0bb4fd.jpg?1783911966","artUrl":"https://cards.scryfall.io/art_crop/front/5/2/52fc4862-b57b-42d7-be8b-d9915a0bb4fd.jpg?1783911966","commanderLegal":"legal","set":"otc","releasedAt":"2024-04-19","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const crab = (): CardDef => ({"oracleId":"5c26c30b-bc4a-4d20-8406-ef9022256e0d","name":"Crabomination","manaCost":"{4}{B}{B}","cmc":6,"typeLine":"Creature — Crab Demon","supertypes":[],"types":["Creature"],"subtypes":["Crab","Demon"],"oracleText":"Emerge from artifact {5}{B}{B} (You may cast this spell by sacrificing an artifact and paying the emerge cost reduced by that artifact's mana value.)\nWhen this creature enters, target opponent exiles the top card of their library, a card at random from their graveyard, and a card at random from their hand. You may cast a spell from among cards exiled this way without paying its mana cost.","power":"5","toughness":"5","colors":["B"],"colorIdentity":["B"],"keywords":["Emerge"],"imageUrl":"https://cards.scryfall.io/normal/front/f/3/f328d6e0-d808-4abe-b6a2-cc557b27c329.jpg?1783911283","artUrl":"https://cards.scryfall.io/art_crop/front/f/3/f328d6e0-d808-4abe-b6a2-cc557b27c329.jpg?1783911283","commanderLegal":"legal","set":"mh3","releasedAt":"2024-06-14","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const harvest = (): CardDef => ({"oracleId":"70b9497f-0dd6-4b66-9675-57c7041fe3c0","name":"Dream Harvest","manaCost":"{5}{U/B}{U/B}","cmc":7,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Each opponent exiles cards from the top of their library until they have exiled cards with total mana value 5 or greater this way. Until end of turn, you may cast cards exiled this way without paying their mana costs.","colors":["B","U"],"colorIdentity":["B","U"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/a/4/a4ebc0e7-02d7-4d38-9376-a39963e6d3fa.jpg?1783904413","artUrl":"https://cards.scryfall.io/art_crop/front/a/4/a4ebc0e7-02d7-4d38-9376-a39963e6d3fa.jpg?1783904413","commanderLegal":"legal","set":"ecl","releasedAt":"2026-01-23","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const kaervek = (): CardDef => ({"oracleId":"fa9a6083-75ab-41ae-b607-39d21d9a3d3a","name":"Kaervek, the Punisher","manaCost":"{1}{B}{B}","cmc":3,"typeLine":"Legendary Creature — Human Warlock","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Warlock"],"oracleText":"Whenever you commit a crime, exile up to one target black card from your graveyard and copy it. You may cast the copy. If you do, you lose 2 life. (Targeting opponents, anything they control, and/or cards in their graveyards is a crime. Copies of permanent spells become tokens.)","power":"3","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/7/f/7f3affc1-be42-48c7-89ff-b59550ff278c.jpg?1783911831","artUrl":"https://cards.scryfall.io/art_crop/front/7/f/7f3affc1-be42-48c7-89ff-b59550ff278c.jpg?1783911831","commanderLegal":"legal","set":"otj","releasedAt":"2024-04-19","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const chandra = (): CardDef => ({"oracleId":"8dfa789d-ae1c-4f18-a55c-f49a363a5e33","name":"Chandra, Legacy of Fire","manaCost":"{4}{R}","cmc":5,"typeLine":"Legendary Planeswalker — Chandra","supertypes":["Legendary"],"types":["Planeswalker"],"subtypes":["Chandra"],"oracleText":"At the beginning of your end step, Chandra deals X damage to each opponent, where X is the number of planeswalkers you control.\n+1: Add {R} for each planeswalker you control.\n0: Remove a loyalty counter from each of any number of permanents you control. Exile that many cards from the top of your library. You may play them this turn.","loyalty":"3","colors":["R"],"colorIdentity":["R"],"keywords":[],"producedMana":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/6/b/6b764e0d-ded0-4036-83b1-de49c6ee8f7e.jpg?1783915480","artUrl":"https://cards.scryfall.io/art_crop/front/6/b/6b764e0d-ded0-4036-83b1-de49c6ee8f7e.jpg?1783915480","commanderLegal":"legal","set":"cmm","releasedAt":"2023-08-04","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const frillback = (): CardDef => ({"oracleId":"e87a4461-f3d1-443f-ad4c-dba91a993809","name":"Tranquil Frillback","manaCost":"{2}{G}","cmc":3,"typeLine":"Creature — Dinosaur","supertypes":[],"types":["Creature"],"subtypes":["Dinosaur"],"oracleText":"When this creature enters, you may pay {G} up to three times. When you pay this cost one or more times, choose up to that many —\n• Destroy target artifact or enchantment.\n• Exile target player's graveyard.\n• You gain 4 life.","power":"3","toughness":"3","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/3/8/38c3a774-986d-4702-81c3-915138d3d718.jpg?1783916446","artUrl":"https://cards.scryfall.io/art_crop/front/3/8/38c3a774-986d-4702-81c3-915138d3d718.jpg?1783916446","commanderLegal":"legal","set":"mat","releasedAt":"2023-05-12","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const hawkeye = (): CardDef => ({"oracleId":"6b59bb1f-f2d4-4d47-bd57-23927d588381","name":"Hawkeye, Master Marksman","manaCost":"{1}{R}","cmc":2,"typeLine":"Legendary Creature — Human Archer Hero","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Archer","Hero"],"oracleText":"Reach, first strike\nTrick Arrows — Whenever Hawkeye becomes tapped, you may pay {1} up to three times. When you do, choose up to that many —\n• Net — Target creature can't block this turn.\n• Explosive — Hawkeye deals 2 damage to target player.\n• Boomerang — Discard a card, then draw a card.","power":"2","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["Explosive","Reach","First strike","Trick Arrows","Boomerang","Net"],"imageUrl":"https://cards.scryfall.io/normal/front/9/9/9991b684-0ae0-4aa4-8f22-a9c473f5d69c.jpg?1783902931","artUrl":"https://cards.scryfall.io/art_crop/front/9/9/9991b684-0ae0-4aa4-8f22-a9c473f5d69c.jpg?1783902931","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;

/** Answers a castFromAmong choice with this card, if one is asked. */
const pickCast = (s: GameState, pid: PlayerId, id: ObjectId) => (s.pending?.kind === "chooseOption" && s.pending.what === "castFromAmong" ? act(s, { type: "chooseOption", player: pid, choice: id }) : s);
/** Attacks `defender` with `attacker` and passes until the first question after combat damage. */
const hit = (s: GameState, ap: PlayerId, attacker: ObjectId, defender: PlayerId) => {
  s = passUntil(s, "declareAttackers", ap);
  if (s.pending?.kind !== "declareAttackers") throw new Error("no attack");
  s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker, defender }] });
  for (let i = 0; i < 80 && !(s.pending && s.pending.kind !== "declareBlockers"); i++) {
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: waitingOn(s)!, blocks: [] });
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};

describe("Kotis, the Fangkeeper", () => {
  it("is fully supported", () => {
    expect(isFullySupported(kotis())).toBe(true);
  });

  it("exiles the top X cards of the damaged player's library, X the damage, and casts any number with mana value X or less free", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.hand = [];
    s0.players[ap]!.command = [];
    const opp = opps(s0, ap)[0]!;
    const k = putOnBattlefield(s0, ap, kotis());
    s0.objects[k]!.counters["+1/+1"] = 2;
    invalidateCharacteristics(s0);
    const below = into(s0, opp, sorcery("Test Below", "{1}", 1), "library");
    const five = into(s0, opp, sorcery("Test Five", "{4}{B}", 5), "library");
    const land = into(s0, opp, forest, "library");
    const three = into(s0, opp, sorcery("Test Three", "{2}{B}", 3), "library");
    const two = into(s0, opp, sorcery("Test Two", "{1}{B}", 2), "library");
    const life = s0.players[opp]!.life;
    let s = hit(s0, ap, k, opp);
    expect(s.players[opp]!.life).toBe(life - 4);
    // 4 damage: the top four exiled; the one below stays.
    expect([zone(s, two), zone(s, three), zone(s, land), zone(s, five), zone(s, below)]).toEqual(["exile", "exile", "exile", "exile", "library"]);
    expect(options(s)).toEqual(expect.arrayContaining([two, three]));
    expect(options(s)).not.toContain(five);
    expect(options(s)).not.toContain(land);
    s = pickCast(s, ap, two);
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: two });
    s = run(s, planCast(s, ap, two, []));
    s = pickCast(s, ap, three);
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: three });
    s = settle(run(s, planCast(s, ap, three, [])));
    // Both cast (their owner's graveyard after resolving); the others stay exiled (rulings).
    expect([zone(s, two), zone(s, three)]).toEqual(["graveyard", "graveyard"]);
    expect(s.players[opp]!.graveyard).toEqual(expect.arrayContaining([two, three]));
    expect([zone(s, land), zone(s, five)]).toEqual(["exile", "exile"]);
  });
});

describe("Olivia, Crimson Bride", () => {
  it("is fully supported", () => {
    expect(isFullySupported(olivia())).toBe(true);
  });

  const toAttack = (s0: GameState, ap: PlayerId, o: ObjectId, opp: PlayerId, back: ObjectId) => {
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: o, defender: opp }] });
    s = passTo(s, "chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: back }] });
    for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "chooseOption" && s.pending.what === "attackWhom") s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
    return s;
  };

  it("returns a creature card tapped and attacking; it's exiled once you control no legendary Vampire (CR 603.8)", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.hand = [];
    s0.players[ap]!.command = [];
    const opp = opps(s0, ap)[0]!;
    const o = putOnBattlefield(s0, ap, olivia());
    const back = into(s0, ap, bear({ name: "Test Returned Bear" }), "graveyard");
    let s = toAttack(s0, ap, o, opp, back);
    expect(zone(s, back)).toBe("battlefield");
    expect(s.objects[back]!.tapped).toBe(true);
    expect(s.objects[back]!.attacking).toBe(opp);
    expect(abilitiesOf(s, s.objects[back]!).triggers.some((t) => t.event === "state")).toBe(true);
    // Olivia is a legendary Vampire: nothing happens while she stays.
    s = settle(s);
    expect(zone(s, back)).toBe("battlefield");
    // Without her, the state trigger exiles it.
    s.objects[o]!.zone = "graveyard";
    s.battlefield.splice(s.battlefield.indexOf(o), 1);
    s.players[ap]!.graveyard.push(o);
    invalidateCharacteristics(s);
    runStateBasedActions(s);
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(zone(s, back)).toBe("exile");
  });

  it("another legendary Vampire you control keeps it, and a returned legendary Vampire counts for itself", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.hand = [];
    s0.players[ap]!.command = [];
    const opp = opps(s0, ap)[0]!;
    const o = putOnBattlefield(s0, ap, olivia());
    const vamp = card("Test Vampire Lord", "Legendary Creature — Vampire", "{2}{B}", { power: "2", toughness: "2" });
    const back = into(s0, ap, vamp, "graveyard");
    let s = toAttack(s0, ap, o, opp, back);
    expect(zone(s, back)).toBe("battlefield");
    s.objects[o]!.zone = "graveyard";
    s.battlefield.splice(s.battlefield.indexOf(o), 1);
    s.players[ap]!.graveyard.push(o);
    invalidateCharacteristics(s);
    runStateBasedActions(s);
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(zone(s, back)).toBe("battlefield");
  });
});

describe("Heartless Conscription", () => {
  it("is fully supported", () => {
    expect(isFullySupported(conscription())).toBe(true);
  });

  it("exiles all creatures; you may play each card exiled this way, mana of any type for spells; a token is gone; it exiles itself", () => {
    const { s: s0, ap, ids } = setup([conscription()]);
    const opp = opps(s0, ap)[0]!;
    const theirs = putOnBattlefield(s0, opp, card("Test Blue Drake", "Creature — Drake", "{1}{U}{U}", { power: "2", toughness: "2" }));
    const mine = putOnBattlefield(s0, ap, bear());
    const token = putOnBattlefield(s0, opp, bear({ name: "Test Token Bear" }));
    s0.objects[token]!.isToken = true;
    const land = putOnBattlefield(s0, opp, card("Test Dryad Arbor", "Land Creature — Forest Dryad", "", { power: "1", toughness: "1" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect([zone(s, theirs), zone(s, mine), zone(s, land)]).toEqual(["exile", "exile", "exile"]);
    expect(s.objects[token]).toBeUndefined();
    expect(zone(s, ids[0]!)).toBe("exile");
    expect(s.objects[theirs]!.mayPlay).toMatchObject({ player: ap, until: "exiled", anyType: true });
    expect(s.objects[theirs]!.mayPlay?.castOnly).toBeUndefined();
    // Cast the opponent's blue creature with black mana only: mana of any type can be spent (CR 609.4b).
    for (const id of [...s.battlefield]) if (controllerOf(s, s.objects[id]!) === ap) s.objects[id]!.tapped = true;
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 3, R: 0, G: 0, C: 0 };
    s = settle(run(s, planCast(s, ap, theirs, [])));
    expect(zone(s, theirs)).toBe("battlefield");
    expect(controllerOf(s, s.objects[theirs]!)).toBe(ap);
    // The land card is played with a land play (rulings).
    s = act(s, { type: "playLand", player: ap, objectId: land });
    expect(zone(s, land)).toBe("battlefield");
    expect(controllerOf(s, s.objects[land]!)).toBe(ap);
  });
});

describe("Crabomination", () => {
  it("is fully supported", () => {
    expect(isFullySupported(crab())).toBe(true);
  });

  it("the opponent exiles their top card, one at random from their graveyard and one from their hand; you may cast a spell from among them free", () => {
    const { s: s0, ap } = setup([]);
    const opp = opps(s0, ap)[0]!;
    s0.players[opp]!.hand = [];
    const top = into(s0, opp, sorcery("Test Top Spell", "{3}{B}", 4), "library");
    const yard = into(s0, opp, forest, "graveyard");
    const hand = into(s0, opp, sorcery("Test Hand Spell", "{5}{B}", 6), "hand");
    const c = into(s0, ap, crab(), "hand");
    s0.players[ap]!.manaPool.B = 6;
    let s = run(s0, planCast(s0, ap, c));
    s = passTo(s, "chooseTargets");
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    s = settle(s);
    expect([zone(s, top), zone(s, yard), zone(s, hand)]).toEqual(["exile", "exile", "exile"]);
    // The land can't be cast (rulings).
    expect(options(s)).toEqual(expect.arrayContaining([top, hand]));
    expect(options(s)).not.toContain(yard);
    s = pickCast(s, ap, hand);
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: hand });
    s = settle(run(s, planCast(s, ap, hand, [])));
    expect(zone(s, hand)).toBe("graveyard");
    // Only one: the other stays exiled.
    expect([zone(s, top), zone(s, yard)]).toEqual(["exile", "exile"]);
  });

  it("with an empty graveyard and hand, only the top card", () => {
    const { s: s0, ap } = setup([]);
    const opp = opps(s0, ap)[0]!;
    s0.players[opp]!.hand = [];
    s0.players[opp]!.graveyard = [];
    const top = into(s0, opp, forest, "library");
    const c = into(s0, ap, crab(), "hand");
    s0.players[ap]!.manaPool.B = 6;
    let s = run(s0, planCast(s0, ap, c));
    s = passTo(s, "chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(zone(s, top)).toBe("exile");
    expect(s.pending).toBeFalsy();
  });
});

describe("Dream Harvest", () => {
  it("is fully supported", () => {
    expect(isFullySupported(harvest())).toBe(true);
  });

  it("each opponent exiles until a total mana value of 5 or more; you may cast those cards free this turn, not lands", () => {
    const { s: s0, ap, ids } = setup([harvest()]);
    const [o1, o2, o3] = opps(s0, ap);
    // o1: 2, land, 3 (total 5 at the third card); the card below stays.
    const below = into(s0, o1!, sorcery("Test Below", "{1}", 1), "library");
    const three = into(s0, o1!, sorcery("Test Three", "{2}{R}", 3), "library");
    const land = into(s0, o1!, forest, "library");
    const two = into(s0, o1!, card("Test Two", "Instant", "{1}{R}", { cmc: 2, oracleText: "Draw a card." }), "library");
    // o2: a 6 alone.
    const six = into(s0, o2!, sorcery("Test Six", "{5}{G}", 6), "library");
    // o3: an empty library.
    s0.players[o3!]!.library = [];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect([zone(s, two), zone(s, land), zone(s, three), zone(s, below), zone(s, six)]).toEqual(["exile", "exile", "exile", "library", "exile"]);
    expect(s.objects[six]!.mayPlay).toMatchObject({ player: ap, until: "thisTurn", castOnly: true, free: true });
    // Cast free, with no mana.
    for (const id of [...s.battlefield]) if (controllerOf(s, s.objects[id]!) === ap) s.objects[id]!.tapped = true;
    s.players[ap]!.manaPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
    s = settle(run(s, planCast(s, ap, six, [])));
    expect(zone(s, six)).toBe("graveyard");
    expect(() => act(s, { type: "playLand", player: ap, objectId: land })).toThrow();
    // An instant could be cast now; next turn, the permission is gone.
    expect(planCast(s, ap, two, [])).not.toBeNull();
    s = passUntil(s, "upkeep", o1);
    expect(planCast(s, ap, two, [])).toBeNull();
  });
});

describe("Kaervek, the Punisher", () => {
  const ping = () => card("Test Ping", "Instant", "{R}", { cmc: 1, oracleText: "Test Ping deals 1 damage to target player." });
  const dark = () => card("Test Dark Insight", "Sorcery", "{1}{B}", { cmc: 2, oracleText: "Draw two cards." });
  it("is fully supported", () => {
    expect(isFullySupported(kaervek())).toBe(true);
  });

  const crime = (decline: boolean) => {
    const { s: s0, ap, ids } = setup([ping()]);
    const opp = opps(s0, ap)[0]!;
    putOnBattlefield(s0, ap, kaervek());
    const d = into(s0, ap, dark(), "graveyard");
    s0.players[ap]!.manaPool = { W: 0, U: 0, B: 2, R: 1, G: 0, C: 0 };
    // Targeting an opponent is a crime.
    let s = run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    s = passTo(s, "chooseTargets");
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: d }] }));
    expect(zone(s, d)).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", options: [d, "none"] });
    if (decline) return { s: settle(act(s, { type: "chooseOption", player: ap, choice: "none" })), ap, copy: "", d };
    s = pickCast(s, ap, d);
    expect(s.pending).toMatchObject({ kind: "castFree", how: "paid" });
    const copy = s.pending?.kind === "castFree" ? s.pending.objectId : "";
    expect(copy).not.toBe(d);
    return { s, ap, copy, d };
  };

  it("exiles a black card from your graveyard and copies it; casting the copy, paying its cost, loses you 2 life", () => {
    const { s: s1, ap, copy, d } = crime(false);
    const life = s1.players[ap]!.life;
    const hand = s1.players[ap]!.hand.length;
    let s = run(s1, planCast(s1, ap, copy, []));
    s = settle(s);
    expect(s.players[ap]!.life).toBe(life - 2);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(s.objects[copy]).toBeUndefined();
    expect(zone(s, d)).toBe("exile");
  });

  it("declining the copy: no life lost, nothing left over", () => {
    const { s, ap, d } = crime(true);
    expect(s.pending).toBeFalsy();
    expect(s.players[ap]!.life).toBe(40);
    expect(zone(s, d)).toBe("exile");
    expect(s.players[ap]!.exile).toEqual([d]);
  });

  it("declining at the cast itself: no life lost, the copy ceases to exist", () => {
    const { s: s1, ap, copy } = crime(false);
    const life = s1.players[ap]!.life;
    const s = settle(act(s1, { type: "chooseMay", player: ap, yes: false }));
    expect(s.players[ap]!.life).toBe(life);
    expect(s.objects[copy]).toBeUndefined();
  });
});

describe("Chandra, Legacy of Fire", () => {
  const walker = () => card("Test Walker", "Legendary Planeswalker — Test", "{2}", { cmc: 2, loyalty: "3", oracleText: "+1: You gain 1 life." });
  it("is fully supported", () => {
    expect(isFullySupported(chandra())).toBe(true);
  });

  it("0: a loyalty counter off each of any number of your permanents, that many cards exiled to play this turn", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, chandra());
    s0.objects[c]!.counters.loyalty = 3;
    const w = putOnBattlefield(s0, ap, walker());
    s0.objects[w]!.counters.loyalty = 3;
    const b = putOnBattlefield(s0, ap, bear());
    const lib = s0.players[ap]!.library.slice(0, 3);
    let s = run(s0, planActivate(s0, ap, c, indexOf(s0, c, /^0:/)));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [c, w, b] }));
    // The bear had none: two removed, two cards.
    expect(s.objects[c]!.counters.loyalty).toBe(2);
    expect(s.objects[w]!.counters.loyalty).toBe(2);
    expect([zone(s, lib[0]!), zone(s, lib[1]!), zone(s, lib[2]!)]).toEqual(["exile", "exile", "library"]);
    expect(s.objects[lib[0]!]!.mayPlay).toMatchObject({ player: ap, until: "thisTurn" });
  });

  it("a bot keeps every planeswalker alive: only those with two or more loyalty counters", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, chandra());
    s0.objects[c]!.counters.loyalty = 1;
    const w = putOnBattlefield(s0, ap, walker());
    s0.objects[w]!.counters.loyalty = 3;
    let s = settle(run(s0, planActivate(s0, ap, c, indexOf(s0, c, /^0:/))));
    expect(s.pending?.kind).toBe("pickPermanents");
    const a = botActions(s, ap)[0];
    expect(a).toMatchObject({ type: "pickPermanents", ids: [w] });
  });
});

describe("Tranquil Frillback and Hawkeye, Master Marksman: pay up to three times, then up to that many modes", () => {
  it("are fully supported", () => {
    expect(isFullySupported(frillback())).toBe(true);
    expect(isFullySupported(hawkeye())).toBe(true);
  });

  it("Frillback: at most three payments, as many as can be paid; two paid, two modes", () => {
    const { s: s0, ap } = setup([]);
    const opp = opps(s0, ap)[0]!;
    const f = into(s0, ap, frillback(), "hand");
    const relic = putOnBattlefield(s0, opp, card("Test Relic", "Artifact", "{2}"));
    into(s0, opp, bear(), "graveyard");
    // Plenty of green: the payment is capped at three.
    s0.players[ap]!.manaPool.G = 10;
    s0.players[ap]!.manaPool.C = 3;
    let s = settle(run(s0, planCast(s0, ap, f)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payX" });
    expect(options(s)).toEqual(["none", "1", "2", "3"]);
    s = act(s, { type: "chooseOption", player: ap, choice: "2" });
    expect(s.pending?.kind).toBe("chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseModes", player: ap });
    const pend = s.pending;
    expect(pend?.kind === "chooseModes" ? pend.max : 0).toBe(2);
    // Three modes is too many.
    expect(() => act(s, { type: "chooseModes", player: ap, modes: [0, 1, 2] })).toThrow();
    const life = s.players[ap]!.life;
    s = act(s, { type: "chooseModes", player: ap, modes: [0, 2] });
    s = settle(s);
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "object", id: relic }] }));
    expect(zone(s, relic)).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life + 4);
  });

  it("Hawkeye: becoming tapped by attacking, as many payments as the mana allows; one paid, one mode", () => {
    const { s: s0, ap } = setup([]);
    s0.players[ap]!.hand = [];
    s0.players[ap]!.command = [];
    const opp = opps(s0, ap)[0]!;
    const h = putOnBattlefield(s0, ap, hawkeye());
    for (const id of [...s0.battlefield]) if (id !== h && controllerOf(s0, s0.objects[id]!) === ap) s0.objects[id]!.tapped = true;
    let s = passUntil(s0, "declareAttackers", ap);
    s.players[ap]!.manaPool.C = 2;
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: h, defender: opp }] });
    s = passTo(s, "chooseOption");
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payX" });
    expect(options(s)).toEqual(["none", "1", "2"]);
    s = act(s, { type: "chooseOption", player: ap, choice: "1" });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseModes", player: ap });
    expect(s.pending?.kind === "chooseModes" ? s.pending.max : 0).toBe(1);
    expect(() => act(s, { type: "chooseModes", player: ap, modes: [1, 2] })).toThrow();
    s = act(s, { type: "chooseModes", player: ap, modes: [1] });
    s = passTo(s, "chooseTargets");
    const life = s.players[opp]!.life;
    s = act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] });
    for (let i = 0; i < 10 && s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[opp]!.life).toBe(life - 2);
  });

  it("Frillback: not paid, nothing happens", () => {
    const { s: s0, ap } = setup([]);
    const f = into(s0, ap, frillback(), "hand");
    s0.players[ap]!.manaPool.G = 4;
    let s = settle(run(s0, planCast(s0, ap, f)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payX" });
    const life = s.players[ap]!.life;
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }));
    expect(s.pending).toBeFalsy();
    expect(s.players[ap]!.life).toBe(life);
  });
});
