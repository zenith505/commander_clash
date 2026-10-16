// Cards exiled face down with a permanent and used later (CR 406.3, 607.2a): Jester's Scepter's cost puts one of them into
// its owner's graveyard, and "that card" is the one put there (any spell can be targeted; only one with the same name is
// countered, rulings). Rogue Class level 3: "You may play cards exiled with this Class, and you may spend mana as though
// it were mana of any color to cast those spells" (CR 609.4b), a Class level's permission (CR 716.2c).

import { describe, expect, it } from "vitest";
import { act, card, setup } from "./helpers";
import { abilitiesOf, compileCard, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";
import { linkedExileCards, mayPlayFromExile, moveObject } from "../src/game";
import { putOnBattlefield } from "./helpers";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 60 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
/** A new copy of `def` on top of `pid`'s library. */
function onTop(s: GameState, pid: PlayerId, def: CardDef) {
  const id = putOnBattlefield(s, pid, def);
  moveObject(s, id, "library");
  const lib = s.players[pid]!.library;
  lib.splice(lib.indexOf(id), 1);
  lib.unshift(id);
  return id;
}

// Real oracle text (Scryfall).
const scepter = card("Jester's Scepter", "Artifact", "{3}", { oracleText: "When this artifact enters, exile the top five cards of target player's library face down. You may look at those cards for as long as they remain exiled.\n{2}, {T}, Put a card exiled with this artifact into its owner's graveyard: Counter target spell if it has the same name as that card." });
const rogue = card("Rogue Class", "Enchantment — Class", "{U}{B}", { oracleText: "(Gain the next level as a sorcery to add its ability.)\nWhenever a creature you control deals combat damage to a player, exile the top card of that player's library face down. You may look at it for as long as it remains exiled.\n{1}{U}{B}: Level 2\nCreatures you control have menace.\n{2}{U}{B}: Level 3\nYou may play cards exiled with this Class, and you may spend mana as though it were mana of any color to cast those spells." });

const peek = card("Test Peek", "Instant", "{U}", { oracleText: "Draw a card." });
const other = card("Test Other", "Sorcery", "{1}", { oracleText: "Draw a card." });
const paladin = card("Test Paladin", "Creature — Human Knight", "{W}{W}{W}{W}{W}", { power: "5", toughness: "5" });

describe("Jester's Scepter", () => {
  /** Scepter cast, its trigger aimed at `at`, whose top five are Peek and four Others. */
  function scepterOn(at: "you" | "opponent") {
    const { s: s0, ap, ids, opp } = setup([scepter, peek]);
    const who = at === "you" ? ap : opp;
    for (let i = 0; i < 4; i++) onTop(s0, who, other);
    const exiledPeek = onTop(s0, who, peek);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: who }] }));
    return { s, ap, opp, who, scepterId: ids[0]!, peekInHand: ids[1]!, exiledPeek };
  }

  it("parse", () => {
    supported(scepter, rogue);
    const ab = compileCard(scepter).activated[0]!;
    expect(ab.costs).toEqual([{ kind: "exileFromGraveyard", n: 1, linked: true }]);
    expect(ab.body.effects).toEqual([{ type: "counterSpell", index: 0, ifCostCardName: true }]);
    expect(compileCard(rogue).playLinkedIf).toEqual({ kind: "classLevel", min: 3 });
  });

  it("counters a spell with the same name as the card put into its owner's graveyard", () => {
    const { s: s0, ap, who, scepterId, peekInHand, exiledPeek } = scepterOn("opponent");
    expect(linkedExileCards(s0, s0.objects[scepterId]!)).toHaveLength(5);
    expect(s0.objects[exiledPeek]!.hiddenExile).toMatchObject({ seen: [ap] });
    // Cast Peek, then with priority still ours, activate the Scepter at it.
    let s = run(s0, planCast(s0, ap, peekInHand));
    const spell = s.stack.at(-1)!;
    s = run(s, planActivate(s, ap, scepterId, 0, [{ kind: "stack", id: spell.id }], undefined, undefined, undefined, { exileCards: [exiledPeek] }));
    expect(s.objects[exiledPeek]!.zone).toBe("graveyard");
    expect(s.players[who]!.graveyard).toContain(exiledPeek);
    expect(linkedExileCards(s, s.objects[scepterId]!)).toHaveLength(4);
    s = settle(s);
    expect(s.objects[peekInHand]!.zone).toBe("graveyard");
    expect(s.log.some((l) => /counter/i.test(l.text) && l.text.includes("Test Peek"))).toBe(true);
  });

  it("a card with another name: any spell can be targeted, it isn't countered (rulings)", () => {
    const { s: s0, ap, scepterId, peekInHand } = scepterOn("you");
    const otherCard = linkedExileCards(s0, s0.objects[scepterId]!).find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Test Other")!;
    let s = run(s0, planCast(s0, ap, peekInHand));
    const spell = s.stack.at(-1)!;
    s = run(s, planActivate(s, ap, scepterId, 0, [{ kind: "stack", id: spell.id }], undefined, undefined, undefined, { exileCards: [otherCard] }));
    s = settle(s);
    expect(s.objects[otherCard]!.zone).toBe("graveyard");
    expect(s.log.some((l) => l.text.includes("doesn't have the same name as that card"))).toBe(true);
    // Peek resolved: it drew a card and went to the graveyard as a resolved instant.
    expect(s.log.some((l) => / counters /.test(l.text))).toBe(false);
  });

  it("only a card exiled with it pays the cost, and only with one there", () => {
    const { s: s0, ap, scepterId, peekInHand } = scepterOn("you");
    let s = run(s0, planCast(s0, ap, peekInHand));
    const spell = s.stack.at(-1)!;
    expect(planActivate(s, ap, scepterId, 0, [{ kind: "stack", id: spell.id }], undefined, undefined, undefined, { exileCards: [s.players[ap]!.hand[0]!] })).toBeNull();
    for (const id of linkedExileCards(s, s.objects[scepterId]!)) moveObject(s, id, "graveyard");
    expect(planActivate(s, ap, scepterId, 0, [{ kind: "stack", id: spell.id }])).toBeNull();
  });
});

describe("Rogue Class", () => {
  it("level 3: play the cards exiled with it, spending mana as though it were any color", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, rogue);
    const top = onTop(s0, opp, paladin);
    // Its first ability, as a creature of ours deals combat damage to that opponent.
    s0.triggerQueue.push({ sourceId: r, sourceCardId: rogue.oracleId, controller: ap, index: 0, sourceZc: 0, event: { player: opp } });
    let s = settle(s0);
    expect(s.objects[top]!.zone).toBe("exile");
    expect(s.objects[top]!.hiddenExile).toMatchObject({ seen: [ap] });
    // Level 1: only looking.
    expect(mayPlayFromExile(s, s.objects[top]!, ap)).toBe(false);
    s.objects[r]!.classLevel = 3;
    expect(mayPlayFromExile(s, s.objects[top]!, ap)).toBe(true);
    expect(mayPlayFromExile(s, s.objects[top]!, opp)).toBe(false);
    // Five white symbols with only three Plains: the rest paid with other colors.
    s = run(s, planCast(s, ap, top));
    s = settle(s);
    expect(s.objects[top]).toMatchObject({ zone: "battlefield", controller: ap });
    expect(abilitiesOf(s, s.objects[r]!).playLinkedIf).toBeDefined();
  });

  it("not once the Class has left: the permission is linked to that object (CR 607.2a, 400.7)", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, rogue);
    s0.objects[r]!.classLevel = 3;
    const top = onTop(s0, opp, paladin);
    s0.triggerQueue.push({ sourceId: r, sourceCardId: rogue.oracleId, controller: ap, index: 0, sourceZc: 0, event: { player: opp } });
    const s = settle(s0);
    expect(mayPlayFromExile(s, s.objects[top]!, ap)).toBe(true);
    moveObject(s, r, "graveyard");
    expect(mayPlayFromExile(s, s.objects[top]!, ap)).toBe(false);
  });
});
