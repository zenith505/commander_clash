// "Into its owner's library third from the top": under the top two cards, or on the bottom of a library with fewer than
// three cards (rulings on Enigma Sphinx, Long-Term Plans, Lost Hours, Bookwurm). The God-Eternals: "When ~ dies or is put
// into exile from the battlefield" (CR 700.4), the card where it went, only while it's still there (CR 400.7).

import { describe, expect, it } from "vitest";
import { act, activate, card, cast, putOnBattlefield, setup, target } from "./helpers";
import { isFullySupported, planCast, waitingOn, type CardDef, type GameState, type PlayerId } from "../src";
import { moveObject } from "../src/game";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const untilPending = (s: GameState, kind: string) => {
  for (let i = 0; i < 20 && s.pending?.kind !== kind; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const third = (s: GameState, pid: PlayerId) => s.players[pid]!.library[2];

// Real oracle text (Scryfall).
const oketra = card("God-Eternal Oketra", "Legendary Creature — Zombie God", "{3}{W}{W}", { power: "3", toughness: "6", keywords: ["Double strike"], oracleText: "Double strike\nWhenever you cast a creature spell, create a 4/4 black Zombie Warrior creature token with vigilance.\nWhen God-Eternal Oketra dies or is put into exile from the battlefield, you may put it into its owner's library third from the top." });
const sphinx = card("Enigma Sphinx", "Artifact Creature — Sphinx", "{4}{W}{U}{B}", { power: "5", toughness: "4", keywords: ["Cascade", "Flying"], oracleText: "Flying\nWhen this creature is put into your graveyard from the battlefield, put it into your library third from the top.\nCascade (When you cast this spell, exile cards from the top of your library until you exile a nonland card that costs less. You may cast it without paying its mana cost. Put the exiled cards on the bottom in a random order.)" });
const plans = card("Long-Term Plans", "Instant", "{2}{U}", { oracleText: "Search your library for a card, then shuffle and put that card third from the top." });
const lostHours = card("Lost Hours", "Sorcery", "{1}{B}", { oracleText: "Target player reveals their hand. You choose a nonland card from it. That player puts that card into their library third from the top." });
const ego = card("Shattered Ego", "Enchantment — Aura", "{U}", { keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature gets -3/-0.\n{3}{U}{U}: Put enchanted creature into its owner's library third from the top." });
const bookwurm = card("Bookwurm", "Creature — Wurm", "{7}{G}", { power: "7", toughness: "7", keywords: ["Trample"], oracleText: "Trample\nWhen this creature enters, you gain 3 life and draw a card.\n{2}{G}: Put this card from your graveyard into your library third from the top." });
const gearhulk = card("Riptide Gearhulk", "Artifact Creature — Construct", "{1}{W}{W}{U}{U}", { power: "2", toughness: "5", keywords: ["Prowess", "Double strike"], oracleText: "Double strike\nProwess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)\nWhen this creature enters, for each opponent, put up to one target nonland permanent that player controls into its owner's library third from the top." });
const blast = card("Test Blast", "Instant", "{R}", { oracleText: "Test Blast deals 7 damage to any target." });
const banish = card("Test Banish", "Instant", "{W}", { oracleText: "Exile target creature." });

/** The active player casts `spell` at the opponent's `def`; returns the game once the creature has left. */
function remove(def: CardDef, spell: CardDef) {
  const { s: s0, ap, ids, opp } = setup([spell]);
  const victim = putOnBattlefield(s0, opp, def);
  let s = s0;
  for (const a of planCast(s, ap, ids[0]!, [target(victim)])!) s = act(s, a);
  for (let i = 0; i < 4 && s.objects[victim]!.zone === "battlefield"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return { s, ap, opp, victim };
}

describe("third from the top", () => {
  it("parse", () => supported(oketra, sphinx, plans, lostHours, ego, bookwurm, gearhulk));

  it("God-Eternal Oketra: when it dies, its owner may put it third from the top", () => {
    const { s: s0, opp, victim } = remove(oketra, blast);
    expect(s0.objects[victim]!.zone).toBe("graveyard");
    let s = untilPending(s0, "chooseMay");
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: opp });
    const no = settle(act(s, { type: "chooseMay", player: opp, yes: false }));
    expect(no.objects[victim]!.zone).toBe("graveyard");
    s = settle(act(s, { type: "chooseMay", player: opp, yes: true }));
    expect(third(s, opp)).toBe(victim);
  });

  it("God-Eternal Oketra: when it's exiled from the battlefield too", () => {
    const { s: s0, opp, victim } = remove(oketra, banish);
    expect(s0.objects[victim]!.zone).toBe("exile");
    const s = settle(act(untilPending(s0, "chooseMay"), { type: "chooseMay", player: opp, yes: true }));
    expect(third(s, opp)).toBe(victim);
  });

  it("if the card left its new zone first, it stays where it went (CR 400.7)", () => {
    const { s: s0, opp, victim } = remove(oketra, blast);
    moveObject(s0, victim, "exile");
    let s = s0;
    for (let i = 0; i < 20 && (s.stack.length || s.triggerQueue.length); i++) s = s.pending?.kind === "chooseMay" ? act(s, { type: "chooseMay", player: opp, yes: true }) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[victim]!.zone).toBe("exile");
  });

  it("Enigma Sphinx goes third from the top of its owner's library", () => {
    const { s: s0, opp, victim } = remove(sphinx, blast);
    const s = settle(s0);
    expect(third(s, opp)).toBe(victim);
  });

  it("Enigma Sphinx: with only one other card in the library, it goes on the bottom (rulings)", () => {
    const { s: s0, opp, victim } = remove(sphinx, blast);
    const lib = s0.players[opp]!.library;
    for (const id of lib.splice(1)) moveObject(s0, id, "exile");
    expect(s0.players[opp]!.library.length).toBe(1);
    const s = settle(s0);
    expect(s.players[opp]!.library).toEqual([lib[0], victim]);
  });

  it("Enigma Sphinx owned by another player doesn't trigger: it isn't put into your graveyard (rulings)", () => {
    const { s: s0, ids, opp, ap } = setup([blast]);
    const stolen = putOnBattlefield(s0, opp, sphinx);
    s0.objects[stolen]!.controller = ap;
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [target(stolen)])!) s = act(s, a);
    s = settle(s);
    expect(s.players[opp]!.graveyard).toContain(stolen);
  });

  it("Long-Term Plans: the found card goes third from the top, after the shuffle", () => {
    const { s: s0, ap, ids } = setup([plans]);
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!)!) s = act(s, a);
    s = untilPending(s, "searchLibrary");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    const want = s.players[ap]!.library.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Grizzly Bears")!;
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [want] }));
    expect(third(s, ap)).toBe(want);
  });

  it("Lost Hours: the chosen card goes third from the top of that player's library", () => {
    const { s: s0, ap, ids, opp } = setup([lostHours]);
    const inHand = s0.players[opp]!.hand.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Grizzly Bears")!;
    expect(inHand).toBeTruthy();
    let s = s0;
    for (const a of planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])!) s = act(s, a);
    s = untilPending(s, "searchLibrary");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, hand: opp });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [inHand] }));
    expect(third(s, opp)).toBe(inHand);
  });

  it("Shattered Ego puts the enchanted creature third from the top", () => {
    const { s: s0, ap, opp } = setup([]);
    const bear = putOnBattlefield(s0, opp, card("Grizzly Bears", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    const aura = putOnBattlefield(s0, ap, ego);
    s0.objects[aura]!.attachedTo = bear;
    const s = settle(activate(s0, ap, aura, 0));
    expect(third(s, opp)).toBe(bear);
    expect(s.objects[aura]!.zone).toBe("graveyard");
  });

  it("Bookwurm: from your graveyard, third from the top", () => {
    const { s: s0, ap } = setup([]);
    const wurm = putOnBattlefield(s0, ap, bookwurm);
    moveObject(s0, wurm, "graveyard");
    const s = settle(activate(s0, ap, wurm, 0));
    expect(third(s, ap)).toBe(wurm);
  });
});
