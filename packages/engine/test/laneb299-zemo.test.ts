// Round B299 (Lane B): Baron Helmut Zemo's boast, "Exile any number of black cards from your graveyard with fifteen or more
// black mana symbols among their mana costs: Copy those exiled cards. You may cast up to three of the copies without paying
// their mana costs." (CR 702.142a, 602.2b, 107.4e, 707.12, 704.5e).

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilityProblem, applyAction, botActions, evidenceValue, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real card data (Scryfall).
const zemo = (): CardDef => ({"oracleId":"0fe6c042-1182-4392-8938-fee36149d74f","name":"Baron Helmut Zemo","manaCost":"{B}{B}{B}","cmc":3,"typeLine":"Legendary Creature — Human Noble Villain","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Noble","Villain"],"oracleText":"Whenever you cast a black spell from your hand, Baron Helmut Zemo connives.\nBoast — Exile any number of black cards from your graveyard with fifteen or more black mana symbols among their mana costs: Copy those exiled cards. You may cast up to three of the copies without paying their mana costs. (Activate only if this creature attacked this turn and only once each turn.)","power":"3","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":["Boast","Connive"],"commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const obliterator = (): CardDef => ({"oracleId":"41820f91-27cf-41c0-bb5e-9adf6845a6a4","name":"Phyrexian Obliterator","manaCost":"{B}{B}{B}{B}","cmc":4,"typeLine":"Creature — Phyrexian Horror","supertypes":[],"types":["Creature"],"subtypes":["Phyrexian","Horror"],"oracleText":"Trample\nWhenever a source deals damage to this creature, that source's controller sacrifices that many permanents of their choice.","power":"5","toughness":"5","colors":["B"],"colorIdentity":["B"],"keywords":["Trample"],"commanderLegal":"legal","set":"one","releasedAt":"2023-02-10","rarity":"mythic","layout":"normal","gameChanger":false} as CardDef);
const necro = (): CardDef => ({"oracleId":"94a844d2-0574-45a7-b347-e0e329767c42","name":"Necropotence","manaCost":"{B}{B}{B}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Skip your draw step.\nWhenever you discard a card, exile that card from your graveyard.\nPay 1 life: Exile the top card of your library face down. Put that card into your hand at the beginning of your next end step.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"wot","releasedAt":"2023-09-08","rarity":"mythic","layout":"normal","gameChanger":true} as CardDef);
const liege = (): CardDef => ({"oracleId":"f779754a-3de9-4621-b190-cf32949da0e8","name":"Ashenmoor Liege","manaCost":"{1}{B/R}{B/R}{B/R}","cmc":4,"typeLine":"Creature — Elemental Knight","supertypes":[],"types":["Creature"],"subtypes":["Elemental","Knight"],"oracleText":"Other black creatures you control get +1/+1.\nOther red creatures you control get +1/+1.\nWhenever this creature becomes the target of a spell or ability an opponent controls, that player loses 4 life.","power":"4","toughness":"1","colors":["B","R"],"colorIdentity":["B","R"],"keywords":[],"commanderLegal":"legal","set":"shm","releasedAt":"2008-05-02","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const sign = (): CardDef => ({"oracleId":"c6207f6a-a624-4754-88f5-dbe700c841ff","name":"Sign in Blood","manaCost":"{B}{B}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Target player draws two cards and loses 2 life.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"sta","releasedAt":"2021-04-23","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const dismember = (): CardDef => ({"oracleId":"fd74f8eb-0253-42dd-8277-186d4934da38","name":"Dismember","manaCost":"{1}{B/P}{B/P}","cmc":3,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"({B/P} can be paid with either {B} or 2 life.)\nTarget creature gets -5/-5 until end of turn.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"soa","releasedAt":"2026-04-24","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const whisper = (): CardDef => ({"oracleId":"7ffae8f8-3006-4969-a339-6d30678f87ea","name":"Night's Whisper","manaCost":"{1}{B}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"You draw two cards and lose 2 life.","colors":["B"],"colorIdentity":["B"],"keywords":[],"commanderLegal":"legal","set":"msc","releasedAt":"2026-06-26","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const sludge = (): CardDef => ({"oracleId":"dd05294b-2c5b-48c2-a9f6-8a528baa3dff","name":"Sludge Crawler","manaCost":"{B}","cmc":1,"typeLine":"Creature — Eldrazi Drone","supertypes":[],"types":["Creature"],"subtypes":["Eldrazi","Drone"],"oracleText":"Devoid (This card has no color.)\nIngest (Whenever this creature deals combat damage to a player, that player exiles the top card of their library.)\n{2}: This creature gets +1/+1 until end of turn.","power":"1","toughness":"1","colors":[],"colorIdentity":["B"],"keywords":["Devoid","Ingest"],"commanderLegal":"legal","set":"bfz","releasedAt":"2015-10-02","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const rakdos = (): CardDef => ({"oracleId":"5e62b51d-faec-4aa0-9504-cf2c282d08ea","name":"Rakdos Charm","manaCost":"{B}{R}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Choose one —\n• Exile target player's graveyard.\n• Destroy target artifact.\n• Each creature deals 1 damage to its controller.","colors":["B","R"],"colorIdentity":["B","R"],"keywords":[],"commanderLegal":"legal","set":"rtr","releasedAt":"2012-10-05","rarity":"uncommon","layout":"normal","gameChanger":false} as CardDef);
const rider = (): CardDef => ({"oracleId":"1080c5b5-6651-4c6a-93e6-099fbe389e26","name":"Murderous Rider // Swift End","manaCost":"{1}{B}{B} // {1}{B}{B}","cmc":3,"typeLine":"Creature — Zombie Knight // Instant — Adventure","supertypes":[],"types":["Creature"],"subtypes":["Zombie","Knight"],"oracleText":"Lifelink\nWhen this creature dies, put it on the bottom of its owner's library.","power":"2","toughness":"3","colors":["B"],"colorIdentity":["B"],"keywords":["Lifelink"],"commanderLegal":"legal","set":"fic","releasedAt":"2025-06-13","rarity":"rare","layout":"adventure","gameChanger":false,"faces":[{"name":"Murderous Rider","manaCost":"{1}{B}{B}","typeLine":"Creature — Zombie Knight","supertypes":[],"types":["Creature"],"subtypes":["Zombie","Knight"],"oracleText":"Lifelink\nWhen this creature dies, put it on the bottom of its owner's library.","power":"2","toughness":"3","colors":["B"]},{"name":"Swift End","manaCost":"{1}{B}{B}","typeLine":"Instant — Adventure","supertypes":[],"types":["Instant"],"subtypes":["Adventure"],"oracleText":"Destroy target creature or planeswalker. You lose 2 life. (Then exile this card. You may cast the creature later from exile.)","colors":["B"]}]} as CardDef);

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions are answered as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
/** A card put into `pid`'s graveyard. */
const inYard = (s: GameState, pid: PlayerId, d: CardDef) => {
  const id = putOnBattlefield(s, pid, d);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  return id;
};

/** Ap's Zemo with these cards in ap's graveyard; with `attack`, it attacked this turn and it's ap's second main phase. */
function game(cards: (() => CardDef)[], attack = true) {
  const { s: s0, ap, opp } = setup([]);
  const z = putOnBattlefield(s0, ap, zemo());
  const ids = cards.map((d) => inYard(s0, ap, d()));
  let s = s0;
  if (attack) {
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: z, defender: opp }] });
    s = passUntil(s, "main2", ap);
  }
  return { s, ap, opp, z, ids };
}
const FIFTEEN = [obliterator, necro, liege, sign, dismember, whisper]; // 4 + 3 + 3 (hybrid) + 2 + 2 (Phyrexian) + 1

describe("round B299: parse", () => {
  it("Baron Helmut Zemo is fully supported", () => {
    expect(isFullySupported(zemo())).toBe(true);
  });
});

describe("round B299: Baron Helmut Zemo's boast", () => {
  it("counts black mana symbols: hybrid and Phyrexian ones once each, an adventurer card by its own cost only", () => {
    const { s, ap, ids } = game([...FIFTEEN, rider, sludge], false);
    expect(ids.slice(0, 6).map((id) => evidenceValue(s, [id], "B"))).toEqual([4, 3, 3, 2, 2, 1]);
    // Murderous Rider's {1}{B}{B}; Swift End's cost isn't the card's in a graveyard (CR 715.4).
    expect(evidenceValue(s, [ids[6]!], "B")).toBe(2);
    expect(s.players[ap]!.graveyard.length).toBe(8);
  });

  it("only if Zemo attacked this turn (CR 702.142a)", () => {
    const { s, ap, z, ids } = game(FIFTEEN, false);
    expect(abilityProblem(s, ap, z, 0, undefined, undefined, undefined, undefined, { collect: ids })).not.toBeNull();
  });

  it("needs fifteen black mana symbols among the cards chosen, all of them black cards", () => {
    const { s, ap, z, ids } = game([...FIFTEEN, sludge]);
    expect(abilityProblem(s, ap, z, 0, undefined, undefined, undefined, undefined, { collect: ids.slice(0, 6) })).toBeNull();
    // Fourteen without Night's Whisper.
    expect(abilityProblem(s, ap, z, 0, undefined, undefined, undefined, undefined, { collect: ids.slice(0, 5) })).toMatch(/15 or more black mana symbols/);
    // Sludge Crawler is devoid: colorless, though its cost is {B} (CR 702.114a).
    expect(abilityProblem(s, ap, z, 0, undefined, undefined, undefined, undefined, { collect: [...ids.slice(0, 5), ids[6]!] })).not.toBeNull();
  });

  it("can't be activated with fewer than fifteen black mana symbols in the graveyard", () => {
    const { s, ap, z } = game([obliterator, necro, liege, sign, dismember, sludge]);
    expect(abilityProblem(s, ap, z, 0)).toMatch(/15 or more black mana symbols/);
    expect(planActivate(s, ap, z, 0)).toBeNull();
  });

  it("copies the exiled cards and casts up to three copies free, one at a time in the order chosen; the cards stay exiled", () => {
    const { s: s0, ap, z, ids } = game(FIFTEEN);
    const [obl, nec, , sig, , whi] = ids as [ObjectId, ObjectId, ObjectId, ObjectId, ObjectId, ObjectId];
    let s = run(s0, planActivate(s0, ap, z, 0, undefined, undefined, undefined, undefined, { collect: ids }));
    for (const id of ids) expect(zone(s, id)).toBe("exile");
    s = settle(s, ap);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", player: ap });
    expect(s.pending?.kind === "chooseOption" ? s.pending.options : []).toEqual(expect.arrayContaining([...ids, "none"]));
    const hand0 = s.players[ap]!.hand.length;
    const life0 = s.players[ap]!.life;
    // Sign in Blood's copy, aimed at ap.
    s = act(s, { type: "chooseOption", player: ap, choice: sig });
    expect(s.pending).toMatchObject({ kind: "castFree" });
    let copy = s.pending?.kind === "castFree" ? s.pending.objectId : "";
    s = run(s, planCast(s, ap, copy, [{ kind: "player", id: ap }]));
    // Then Night's Whisper's, then Necropotence's.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong" });
    expect(s.pending?.kind === "chooseOption" ? s.pending.options : []).not.toContain(sig);
    s = act(s, { type: "chooseOption", player: ap, choice: whi });
    copy = s.pending?.kind === "castFree" ? s.pending.objectId : "";
    s = run(s, planCast(s, ap, copy, []));
    s = act(s, { type: "chooseOption", player: ap, choice: nec });
    copy = s.pending?.kind === "castFree" ? s.pending.objectId : "";
    s = run(s, planCast(s, ap, copy, []));
    // Three cast: no fourth is offered, and the ability is done.
    expect(s.pending?.kind === "chooseOption" && s.pending.what === "castFromAmong").toBe(false);
    expect(s.stack.length).toBe(3); // the three copies; the ability has finished resolving
    s = settle(s, ap);
    expect(s.players[ap]!.hand.length).toBe(hand0 + 4);
    expect(s.players[ap]!.life).toBe(life0 - 4);
    // Necropotence's copy became a token (CR 608.3f, 111.1), the card itself still in exile.
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken && s.cards[s.objects[id]!.cardId]?.name === "Necropotence");
    expect(tokens.length).toBe(1);
    for (const id of ids) expect(zone(s, id)).toBe("exile");
    expect(zone(s, obl)).toBe("exile");
    // No copy is left behind in exile (CR 704.5e).
    expect(s.players[ap]!.exile.filter((id) => s.objects[id]?.spellCopy).length).toBe(0);
  });

  it("casting none leaves only the exiled cards; once each turn (CR 702.142a)", () => {
    const { s: s0, ap, z, ids } = game([...FIFTEEN, obliterator, necro, liege, sign, dismember, whisper]);
    let s = settle(run(s0, planActivate(s0, ap, z, 0, undefined, undefined, undefined, undefined, { collect: ids.slice(0, 6) })), ap);
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "none" }), ap);
    expect(s.pending).toBeFalsy();
    expect(s.stack.length).toBe(0);
    expect(s.players[ap]!.exile.filter((id) => s.objects[id]?.spellCopy).length).toBe(0);
    // Fifteen more symbols in the graveyard, but boast works only once each turn.
    expect(abilityProblem(s, ap, z, 0, undefined, undefined, undefined, undefined, { collect: ids.slice(6) })).not.toBeNull();
  });

  it("the cards exiled are the ones chosen: the fewest that make fifteen when none are picked", () => {
    const { s: s0, ap, z, ids } = game([...FIFTEEN, obliterator]);
    const s = run(s0, planActivate(s0, ap, z, 0));
    const gone = ids.filter((id) => zone(s, id) === "exile");
    expect(evidenceValue(s, gone, "B")).toBeGreaterThanOrEqual(15);
    expect(gone.length).toBeLessThan(7);
  });
});
