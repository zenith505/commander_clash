// Round 432: Jacob Hauken, Inspector // Hauken's Insight ("{T}: Draw a card, then exile a card from your hand face down. You
// may look at that card for as long as it remains exiled. You may pay {4}{U}{U}. If you do, transform Jacob Hauken." //
// "At the beginning of your upkeep, exile the top card of your library face down. You may look at that card for as long as
// it remains exiled." and "Once during each of your turns, you may play a land or cast a spell from among the cards exiled
// with this permanent without paying its mana cost.").
import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, canPlayLandNow, characteristics, faceDef, invalidateCharacteristics, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const jacob = (): CardDef => ({"oracleId":"16d2a56a-7181-4ef3-866b-10dd8615d9e9","name":"Jacob Hauken, Inspector // Hauken's Insight","manaCost":"{1}{U}","cmc":2,"typeLine":"Legendary Creature — Human Advisor // Legendary Enchantment","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Advisor"],"oracleText":"{T}: Draw a card, then exile a card from your hand face down. You may look at that card for as long as it remains exiled. You may pay {4}{U}{U}. If you do, transform Jacob Hauken.","power":"0","toughness":"2","colors":["U"],"colorIdentity":["U"],"keywords":["Transform"],"imageUrl":"https://cards.scryfall.io/normal/front/8/2/823a764f-76b5-4340-bdaf-df9ca1d0ffd2.jpg?1783924280","artUrl":"https://cards.scryfall.io/art_crop/front/8/2/823a764f-76b5-4340-bdaf-df9ca1d0ffd2.jpg?1783924280","layout":"transform","faces":[{"name":"Jacob Hauken, Inspector","manaCost":"{1}{U}","typeLine":"Legendary Creature — Human Advisor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Advisor"],"oracleText":"{T}: Draw a card, then exile a card from your hand face down. You may look at that card for as long as it remains exiled. You may pay {4}{U}{U}. If you do, transform Jacob Hauken.","power":"0","toughness":"2","colors":["U"],"imageUrl":"https://cards.scryfall.io/normal/front/8/2/823a764f-76b5-4340-bdaf-df9ca1d0ffd2.jpg?1783924280","artUrl":"https://cards.scryfall.io/art_crop/front/8/2/823a764f-76b5-4340-bdaf-df9ca1d0ffd2.jpg?1783924280"},{"name":"Hauken's Insight","manaCost":"","typeLine":"Legendary Enchantment","supertypes":["Legendary"],"types":["Enchantment"],"subtypes":[],"oracleText":"At the beginning of your upkeep, exile the top card of your library face down. You may look at that card for as long as it remains exiled.\nOnce during each of your turns, you may play a land or cast a spell from among the cards exiled with this permanent without paying its mana cost.","colors":["U"],"colorIndicator":["U"],"imageUrl":"https://cards.scryfall.io/normal/back/8/2/823a764f-76b5-4340-bdaf-df9ca1d0ffd2.jpg?1783924280","artUrl":"https://cards.scryfall.io/art_crop/back/8/2/823a764f-76b5-4340-bdaf-df9ca1d0ffd2.jpg?1783924280"}]}) as CardDef;
const divination = (): CardDef => ({"oracleId":"273b339c-964b-4a18-8eb5-ceb8abcdfd9e","name":"Divination","manaCost":"{2}{U}","cmc":3,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const cradle = (): CardDef => ({"oracleId":"7c427c3d-ecd8-45ef-bebd-8f10f4a311db","name":"Gaea's Cradle","manaCost":"","cmc":0,"typeLine":"Legendary Land","supertypes":["Legendary"],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {G} for each creature you control.","colors":[],"colorIdentity":["G"],"keywords":[],"producedMana":["G"],"layout":"normal"}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"producedMana":["C"],"layout":"normal"}) as CardDef;
const free = { alt: "linkedFree" as const };

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty or `me` is asked something; bots answer the others. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** A new card for `def` in `pid`'s hand. */
const inHand = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  invalidateCharacteristics(s);
  return id;
};
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const name = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).name;
/** Jacob on the battlefield with Divination, Gaea's Cradle and Sol Ring in hand. */
const board = () => {
  const { s, ap, opp } = setup([]);
  const j = putOnBattlefield(s, ap, jacob());
  const div = inHand(s, ap, divination());
  const cr = inHand(s, ap, cradle());
  const ring = inHand(s, ap, solRing());
  return { s, ap, opp, j, div, cr, ring };
};
/** Jacob's ability, exiling `card` and paying for the transform or not. */
const inspect = (s: GameState, ap: PlayerId, j: ObjectId, card: ObjectId, pay: boolean) => {
  s = act(s, { type: "activateAbility", player: ap, objectId: j, index: 0 });
  s = settle(s, ap);
  expect(s.pending?.kind).toBe("searchLibrary");
  s = settle(act(s, { type: "searchLibrary", player: ap, found: [card] }), ap);
  expect(s.pending?.kind).toBe("chooseMay");
  // {4}{U}{U} in the pool, as if lands had been tapped for it.
  if (pay) Object.assign(s.players[ap]!.manaPool, { U: 2, C: 4 });
  s = act(s, { type: "chooseMay", player: ap, yes: pay });
  return settle(s, ap);
};

describe("round 432: Jacob Hauken, Inspector", () => {
  it("both faces are fully supported", () => {
    expect(isFullySupported(jacob())).toBe(true);
    expect(isFullySupported(faceDef(jacob(), 1))).toBe(true);
  });

  it("draws, exiles a card from your hand face down that you may look at, and transforms if you pay {4}{U}{U}", () => {
    const r = board();
    const hand = r.s.players[r.ap]!.hand.length;
    const s = inspect(r.s, r.ap, r.j, r.div, true);
    expect(zone(s, r.div)).toBe("exile");
    expect(s.objects[r.div]!.hiddenExile?.seen).toEqual([r.ap]);
    expect(s.players[r.ap]!.hand.length).toBe(hand);
    expect(name(s, r.j)).toBe("Hauken's Insight");
    expect(characteristics(s, s.objects[r.j]!).types).toEqual(["Enchantment"]);
  });

  it("not paying, it stays Jacob Hauken", () => {
    const r = board();
    const s = inspect(r.s, r.ap, r.j, r.div, false);
    expect(zone(s, r.div)).toBe("exile");
    expect(name(s, r.j)).toBe("Jacob Hauken, Inspector");
  });

  it("transformed, you cast a card the front face exiled without paying its mana cost, once during your turn", () => {
    const r = board();
    let s = inspect(r.s, r.ap, r.j, r.div, true);
    // A second card exiled with it: Sol Ring, exiled by the front face earlier (put there as it would have been).
    s.players[r.ap]!.hand = s.players[r.ap]!.hand.filter((id) => id !== r.ring);
    s.objects[r.ring]!.zone = "exile";
    s.objects[r.ring]!.hiddenExile = { by: r.j, seen: [r.ap], label: "Face down", at: 0 };
    s.players[r.ap]!.exile.push(r.ring);
    s.linkedExile![`${r.j}@${s.objects[r.j]!.zoneChanges ?? 0}`]!.push({ id: r.ring, zc: s.objects[r.ring]!.zoneChanges ?? 0 });
    invalidateCharacteristics(s);
    // Paying for it is no way to cast it.
    expect(planCast(s, r.ap, r.div)).toBeNull();
    const plan = planCast(s, r.ap, r.div, undefined, undefined, undefined, undefined, free);
    expect(plan).not.toBeNull();
    const untapped = s.battlefield.filter((id) => s.objects[id]!.controller === r.ap && !s.objects[id]!.tapped).length;
    const hand = s.players[r.ap]!.hand.length;
    s = settle(run(s, plan), r.ap);
    expect(zone(s, r.div)).toBe("graveyard");
    expect(s.players[r.ap]!.hand.length).toBe(hand + 2);
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === r.ap && !s.objects[id]!.tapped).length).toBe(untapped);
    // Once: Sol Ring waits for your next turn.
    expect(planCast(s, r.ap, r.ring, undefined, undefined, undefined, undefined, free)).toBeNull();
    s = passUntil(s, "main1", r.opp);
    expect(planCast(s, r.ap, r.ring, undefined, undefined, undefined, undefined, free)).toBeNull();
    s = passUntil(s, "main1", r.ap);
    expect(planCast(s, r.ap, r.ring, undefined, undefined, undefined, undefined, free)).not.toBeNull();
  });

  it("plays an exiled land as the turn's land play, which uses up its once", () => {
    const r = board();
    let s = inspect(r.s, r.ap, r.j, r.cr, true);
    expect(canPlayLandNow(s, r.ap, r.cr)).toBe(true);
    const played = s.players[r.ap]!.landsPlayedThisTurn;
    s = act(s, { type: "playLand", player: r.ap, objectId: r.cr });
    expect(zone(s, r.cr)).toBe("battlefield");
    expect(s.players[r.ap]!.landsPlayedThisTurn).toBe(played + 1);
    expect(s.objects[r.j]!.linkedFreeOnceUsed?.turn).toBe(s.turn);
  });

  it("its upkeep trigger exiles your top card face down, linked to it", () => {
    const r = board();
    let s = inspect(r.s, r.ap, r.j, r.div, true);
    s = passUntil(s, "main1", r.opp);
    s = passUntil(s, "upkeep", r.ap);
    const top = s.players[r.ap]!.library[0]!;
    s = settle(s, r.ap);
    expect(zone(s, top)).toBe("exile");
    expect(s.objects[top]!.hiddenExile?.seen).toEqual([r.ap]);
    expect(s.linkedExile![`${r.j}@${s.objects[r.j]!.zoneChanges ?? 0}`]!.map((l) => l.id)).toEqual(expect.arrayContaining([r.div, top]));
  });

  it("a bot activates it and answers its prompts", () => {
    const r = board();
    let s = act(r.s, { type: "activateAbility", player: r.ap, objectId: r.j, index: 0 });
    s = settle(s);
    expect(s.pending).toBeFalsy();
    expect(s.players[r.ap]!.exile.length).toBe(1);
  });
});
