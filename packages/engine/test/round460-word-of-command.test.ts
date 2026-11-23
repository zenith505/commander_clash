// Round 460: Word of Command. Its controller looks at the target opponent's hand and chooses a card, controls that player
// while it resolves (CR 723.2, 723.5), and has them play the card if able: a land only on their turn with a land play left
// (CR 305.2, 305.3), a spell with its timing ignored (CR 608.2g) and its costs paid, an alternative cost too (rulings),
// with only their lands' mana abilities, whose mana goes only to that card or to their lands' mana abilities. If it's cast,
// the controller controls that player again while the spell resolves.

import { describe, expect, it } from "vitest";
import { act, cast, island, mountain, passAll, passUntil, putOnBattlefield, setup, swamp } from "./helpers";
import { applyAction, botActions, characteristics, deciderOf, isFullySupported, manaAbilityProblem, parseManaCost, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";
import { canPayFromPool } from "../src/spend";
import { commandCastable } from "../src/effects/run-round460";

// Real card data (Scryfall).
const word = (): CardDef => ({"oracleId":"e8ad3a77-b293-4d69-b080-27ca9f95d443","name":"Word of Command","manaCost":"{B}{B}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Look at target opponent's hand and choose a card from it. You control that player until Word of Command finishes resolving. The player plays that card if able. While doing so, the player can activate mana abilities only if they're from lands that player controls and only if mana they produce is spent to activate other mana abilities of lands the player controls and/or to play that card. If the chosen card is cast as a spell, you control the player while that spell is resolving.","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"}) as CardDef;
const bolt = (): CardDef => ({"oracleId":"4457ed35-7c10-48c8-9776-456485fdf070","name":"Lightning Bolt","manaCost":"{R}","cmc":1,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Lightning Bolt deals 3 damage to any target.","colors":["R"],"colorIdentity":["R"],"keywords":[],"layout":"normal"}) as CardDef;
const whisper = (): CardDef => ({"oracleId":"7ffae8f8-3006-4969-a339-6d30678f87ea","name":"Night's Whisper","manaCost":"{1}{B}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"You draw two cards and lose 2 life.","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"}) as CardDef;
const tutor = (): CardDef => ({"oracleId":"82004860-e589-4e38-8d61-8c0210e4ea39","name":"Demonic Tutor","manaCost":"{1}{B}","cmc":2,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Search your library for a card, put that card into your hand, then shuffle.","colors":["B"],"colorIdentity":["B"],"keywords":[],"layout":"normal"}) as CardDef;
const gush = (): CardDef => ({"oracleId":"16d8ee99-8ec8-429f-9ba7-818a74b6f910","name":"Gush","manaCost":"{4}{U}","cmc":5,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"You may return two Islands you control to their owner's hand rather than pay this spell's mana cost.\nDraw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"normal"}) as CardDef;
const solRing = (): CardDef => ({"oracleId":"6ad8011d-3471-4369-9d68-b264cc027487","name":"Sol Ring","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{T}: Add {C}{C}.","colors":[],"colorIdentity":[],"keywords":[],"layout":"normal"}) as CardDef;
const tomb = (): CardDef => ({"oracleId":"23467047-6dba-4498-b783-1ebc4f74b8c2","name":"Ancient Tomb","manaCost":"","cmc":0,"typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"{T}: Add {C}{C}. This land deals 2 damage to you.","colors":[],"colorIdentity":[],"keywords":[],"layout":"normal"}) as CardDef;
const seaGate = (): CardDef => ({"oracleId":"4a8d41fe-e04d-484b-a7d1-19be311e6ca7","name":"Sea Gate Restoration // Sea Gate, Reborn","manaCost":"{4}{U}{U}{U}","cmc":7,"typeLine":"Sorcery // Land","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw cards equal to the number of cards in your hand plus one. You have no maximum hand size for the rest of the game.","colors":["U"],"colorIdentity":["U"],"keywords":[],"layout":"modal_dfc","faces":[{"name":"Sea Gate Restoration","manaCost":"{4}{U}{U}{U}","typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Draw cards equal to the number of cards in your hand plus one. You have no maximum hand size for the rest of the game.","colors":["U"]},{"name":"Sea Gate, Reborn","manaCost":"","typeLine":"Land","supertypes":[],"types":["Land"],"subtypes":[],"oracleText":"As this land enters, you may pay 3 life. If you don't, it enters tapped.\n{T}: Add {U}.","colors":[]}]}) as CardDef;
const bears = (): CardDef => ({"oracleId":"14c8f55d-d177-4c25-a931-ebeb9e6062a0","name":"Grizzly Bears","manaCost":"{1}{G}","cmc":2,"typeLine":"Creature — Bear","supertypes":[],"types":["Creature"],"subtypes":["Bear"],"oracleText":"","power":"2","toughness":"2","colors":["G"],"colorIdentity":["G"],"keywords":[],"layout":"normal"}) as CardDef;

/** Put a fresh copy of `def` into `pid`'s hand. */
function toHand(s: GameState, pid: PlayerId, def: CardDef): string {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "hand";
  s.players[pid]!.hand.push(id);
  return id;
}

/** `ap` casts Word of Command at `opp` (it resolves) and chooses `card` from their hand. */
function command(s: GameState, ap: PlayerId, wordId: string, opp: PlayerId, card: string): GameState {
  s = cast(s, ap, wordId, [{ kind: "player", id: opp }]);
  const p = s.pending;
  if (p?.kind !== "chooseOption" || p.what !== "commandCard") throw new Error(`no card question: ${JSON.stringify(p)?.slice(0, 300)}`);
  expect(p.player).toBe(ap);
  expect(p.options).toContain(card);
  return act(s, { type: "chooseOption", player: ap, choice: card });
}

/** Everyone passes until `ap` has priority (the stack empty, during another player's turn). */
function priorityTo(s: GameState, ap: PlayerId): GameState {
  for (let i = 0; i < 4 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(waitingOn(s)).toBe(ap);
  return s;
}

describe("Word of Command (round 460)", () => {
  it("is fully supported", () => {
    expect(isFullySupported(word())).toBe(true);
  });

  it("makes the opponent cast the chosen spell, choices yours, only with their lands' mana", () => {
    const { s: s0, ap, ids, opp } = setup([word()]);
    const mtn = putOnBattlefield(s0, opp, mountain);
    const ring = putOnBattlefield(s0, opp, solRing());
    const boltId = toHand(s0, opp, bolt());
    const life = s0.players[opp]!.life;
    let s = command(s0, ap, ids[0]!, opp, boltId);
    const p = s.pending;
    expect(p?.kind === "castFree" && p.how === "commanded" && p.player === opp && p.must).toBe(true);
    // You control the opponent while Word of Command resolves (CR 723.5).
    expect(deciderOf(s, opp)).toBe(ap);
    expect(s.log.some((l) => /controls B|controls C|controls D|controls A/.test(l.text) && /until Word of Command finishes resolving/.test(l.text))).toBe(true);
    // Only mana abilities of lands they control (CR 723.7): not Sol Ring's.
    expect(manaAbilityProblem(s, opp, s.objects[ring]!, 0)).toMatch(/only mana abilities of lands/);
    expect(manaAbilityProblem(s, opp, s.objects[mtn]!, 0)).toBeNull();
    expect(() => applyAction(s, { type: "activateMana", player: opp, objectId: ring, mana: "C" })).toThrow();
    // It must be cast if able (rulings).
    expect(() => applyAction(s, { type: "chooseMay", player: opp, yes: false })).toThrow(/must be cast/);
    // The targets are chosen for them: at the opponent themselves.
    const plan = planCast(s, opp, boltId, [{ kind: "player", id: opp }]);
    expect(plan).not.toBeNull();
    for (const a of plan!) s = act(s, a);
    expect(s.objects[mtn]!.tapped).toBe(true);
    expect(s.objects[ring]!.tapped).toBe(false);
    expect(s.stack.some((x) => x.objectId === boltId)).toBe(true);
    // Word of Command has finished resolving: no control until the Bolt resolves.
    expect(deciderOf(s, opp)).toBe(opp);
    expect(s.resolveControls?.map((c) => c.item)).toEqual([s.stack.find((x) => x.objectId === boltId)!.id]);
    s = passAll(s);
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.resolveControls).toBeUndefined();
  });

  it("casts a sorcery at instant speed, and you control the player while it resolves", () => {
    const { s: s0, ap, ids, opp } = setup([word()]);
    putOnBattlefield(s0, opp, swamp);
    putOnBattlefield(s0, opp, mountain);
    const tutorId = toHand(s0, opp, tutor());
    let s = command(s0, ap, ids[0]!, opp, tutorId);
    // Not the opponent's turn, a spell on the stack: timing is ignored as it's cast during the resolution (CR 608.2g).
    const plan = planCast(s, opp, tutorId);
    expect(plan).not.toBeNull();
    for (const a of plan!) s = act(s, a);
    expect(s.stack.at(-1)?.objectId).toBe(tutorId);
    s = passAll(s);
    // The search is the opponent's, decided by you (CR 723.5).
    const p = s.pending;
    expect(p?.kind === "searchLibrary" && p.player === opp).toBe(true);
    expect(deciderOf(s, opp)).toBe(ap);
    expect(deciderOf(s, ap)).toBe(ap);
    const pick = p?.kind === "searchLibrary" ? p.cards[0]! : "";
    s = act(s, { type: "searchLibrary", player: opp, found: [pick] });
    s = passAll(s);
    expect(s.players[opp]!.hand).toContain(pick);
    expect(deciderOf(s, opp)).toBe(opp);
    expect(s.resolveControls).toBeUndefined();
  });

  it("does nothing more with a card that can't be played; a decline is allowed only when it can't be cast", () => {
    const { s: s0, ap, ids, opp } = setup([word()]);
    putOnBattlefield(s0, opp, solRing());
    const boltId = toHand(s0, opp, bolt());
    // Sol Ring's mana can't pay for it, and a land can't be played on another player's turn (CR 305.3).
    let s = command(s0, ap, ids[0]!, opp, boltId);
    expect(s.pending).toBeNull();
    expect(s.players[opp]!.hand).toContain(boltId);
    expect(s.log.some((l) => /can't play the chosen card/.test(l.text))).toBe(true);
    const { s: s1, ap: ap1, ids: ids1, opp: opp1 } = setup([word()]);
    const land = toHand(s1, opp1, mountain);
    s = command(s1, ap1, ids1[0]!, opp1, land);
    expect(s.pending).toBeNull();
    expect(s.players[opp1]!.hand).toContain(land);
  });

  it("makes the opponent play a land on their turn, as their land play", () => {
    const { s: s0, ap, ids, opp } = setup([word()]);
    const land = toHand(s0, opp, mountain);
    let s = passUntil(s0, "main1", opp);
    s = priorityTo(s, ap);
    s = command(s, ap, ids[0]!, opp, land);
    expect(s.objects[land]!.zone).toBe("battlefield");
    expect(s.objects[land]!.controller).toBe(opp);
    expect(s.players[opp]!.landsPlayedThisTurn).toBe(1);
  });

  it("asks how a card is played when it can be a land or a spell, and the land's own choice as it enters", () => {
    const { s: s0, ap, ids, opp } = setup([word()]);
    for (let i = 0; i < 7; i++) putOnBattlefield(s0, opp, island);
    const gate = toHand(s0, opp, seaGate());
    let s = passUntil(s0, "main1", opp);
    s = priorityTo(s, ap);
    s = command(s, ap, ids[0]!, opp, gate);
    let p = s.pending;
    expect(p?.kind === "chooseOption" && p.what === "commandPlay" && p.player === opp).toBe(true);
    expect(p?.kind === "chooseOption" ? p.options : []).toEqual(["land:1", "cast"]);
    expect(deciderOf(s, opp)).toBe(ap);
    s = act(s, { type: "chooseOption", player: opp, choice: "land:1" });
    // Sea Gate, Reborn: "As this land enters, you may pay 3 life" (CR 614.12), chosen for them.
    p = s.pending;
    expect(p?.kind).toBe("chooseMay");
    const life = s.players[opp]!.life;
    s = act(s, { type: "chooseMay", player: opp, yes: true });
    expect(s.objects[gate]!.zone).toBe("battlefield");
    expect(characteristics(s, s.objects[gate]!).name).toBe("Sea Gate, Reborn");
    expect(s.objects[gate]!.tapped).toBe(false);
    expect(s.players[opp]!.life).toBe(life - 3);
  });

  it("an alternative cost counts: Gush with its Islands tapped must be cast by returning them", () => {
    const { s: s0, ap, ids, opp } = setup([word()]);
    const isl = [putOnBattlefield(s0, opp, island), putOnBattlefield(s0, opp, island)];
    for (const i of isl) s0.objects[i]!.tapped = true;
    const gushId = toHand(s0, opp, gush());
    const hand = s0.players[opp]!.hand.length;
    let s = command(s0, ap, ids[0]!, opp, gushId);
    expect(commandCastable(s, opp, gushId)).toBe(true);
    expect(() => applyAction(s, { type: "chooseMay", player: opp, yes: false })).toThrow(/must be cast/);
    const plan = planCast(s, opp, gushId, undefined, undefined, "auto", undefined, { alt: "alternative", returnToHand: isl });
    expect(plan).not.toBeNull();
    for (const a of plan!) s = act(s, a);
    s = passAll(s);
    expect(isl.every((i) => s.objects[i]!.zone === "hand")).toBe(true);
    // Gush and the two Islands left and came back, then two cards were drawn.
    expect(s.players[opp]!.hand.length).toBe(hand - 1 + 2 + 2);
  });

  it("the lands' mana left over can't be spent on anything but that card", () => {
    const { s: s0, ap, ids, opp } = setup([word()]);
    const t = putOnBattlefield(s0, opp, tomb());
    const ringCard = toHand(s0, opp, solRing());
    let s = command(s0, ap, ids[0]!, opp, ringCard);
    s = act(s, { type: "activateMana", player: opp, objectId: t, mana: "C" });
    const lot = s.players[opp]!.manaLots?.find((l) => l.only?.commanded);
    expect(lot?.n).toBe(2);
    s = act(s, { type: "castSpell", player: opp, objectId: ringCard });
    expect(s.stack.at(-1)?.objectId).toBe(ringCard);
    // {C} left, kept for Sol Ring or mana abilities of their lands only.
    expect(s.players[opp]!.manaPool.C).toBe(1);
    expect(canPayFromPool(s, opp, parseManaCost("{1}"), "other")).toBe(false);
    expect(canPayFromPool(s, opp, parseManaCost("{1}"), { spell: bolt() })).toBe(false);
  });

  it("bots choose the costliest card the opponent can cast, and cast a card they're made to", () => {
    const { s: s0, ap, ids, opp } = setup([word()]);
    putOnBattlefield(s0, opp, swamp);
    putOnBattlefield(s0, opp, mountain);
    const boltId = toHand(s0, opp, bolt());
    const tutorId = toHand(s0, opp, tutor());
    toHand(s0, opp, bears());
    let s = cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]);
    const pick = botActions(s, ap);
    expect(pick).toEqual([{ type: "chooseOption", player: ap, choice: tutorId }]);
    s = act(s, pick[0]!);
    for (const a of botActions(s, opp)) s = act(s, a);
    expect(s.stack.at(-1)?.objectId).toBe(tutorId);
    expect(s.players[opp]!.hand).toContain(boltId);
  });
});
