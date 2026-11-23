// Lane B round B306: The Celestial Toymaker ("Whenever ~ attacks, look at the top three cards of your library. Exile any
// number of them in a face-down pile and the rest in a face-up pile. Defending player chooses one of those piles. Put that
// pile into your hand." and "At the beginning of each end step, each opponent loses 2 life for each spell or ability that
// caused one or more players to guess or to group cards or permanents into a pile this turn.").

import { describe, expect, it } from "vitest";
import { act, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real card data (Scryfall).
const toymaker = (): CardDef => ({"oracleId":"388fe92a-0bc0-4c0a-a7c6-910c5e71e342","name":"The Celestial Toymaker","manaCost":"{W}{U}{B}","cmc":3,"typeLine":"Legendary Creature — Rogue Artificer","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Rogue","Artificer"],"oracleText":"Whenever The Celestial Toymaker attacks, look at the top three cards of your library. Exile any number of them in a face-down pile and the rest in a face-up pile. Defending player chooses one of those piles. Put that pile into your hand.\nAt the beginning of each end step, each opponent loses 2 life for each spell or ability that caused one or more players to guess or to group cards or permanents into a pile this turn.","power":"2","toughness":"4","colors":["B","U","W"],"colorIdentity":["B","U","W"],"keywords":[],"commanderLegal":"legal","set":"sld","releasedAt":"2023-12-11","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const factOrFiction = (): CardDef => ({"oracleId":"437b2dab-15e0-4b9a-a204-58622d37a3b3","name":"Fact or Fiction","manaCost":"{3}{U}","cmc":4,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Reveal the top five cards of your library. An opponent separates those cards into two piles. Put one pile into your hand and the other into your graveyard.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","set":"dmr","releasedAt":"2023-01-13","rarity":"uncommon","layout":"normal","gameChanger":false}) as CardDef;
const pendulum = (): CardDef => ({"oracleId":"4f88ddfa-5478-426a-a978-dfc64c687db1","name":"Liar's Pendulum","manaCost":"{1}","cmc":1,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{2}, {T}: Choose a card name. Target opponent guesses whether a card with that name is in your hand. You may reveal your hand. If you do and your opponent guessed wrong, draw a card.","colors":[],"colorIdentity":[],"keywords":[],"commanderLegal":"legal","set":"mrd","releasedAt":"2003-10-02","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const portal = (): CardDef => ({"oracleId":"1a3ce329-ee48-4abc-b820-b43e9e68eae9","name":"Phyrexian Portal","manaCost":"{3}","cmc":3,"typeLine":"Artifact","supertypes":[],"types":["Artifact"],"subtypes":[],"oracleText":"{3}: If your library has ten or more cards in it, target opponent looks at the top ten cards of your library and separates them into two face-down piles. Exile one of those piles. Search the other pile for a card, put it into your hand, then shuffle the rest of that pile into your library.","colors":[],"colorIdentity":[],"keywords":[],"commanderLegal":"legal","set":"all","releasedAt":"1996-06-10","rarity":"rare","layout":"normal","gameChanger":false}) as CardDef;
const conscription = (): CardDef => ({"oracleId":"3bf20e68-0e19-4242-bfba-a8a1bb244685","name":"Ghastly Conscription","manaCost":"{5}{B}{B}","cmc":7,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"Exile all creature cards from target player's graveyard in a face-down pile, shuffle that pile, then manifest those cards. (To manifest a card, put it onto the battlefield face down as a 2/2 creature. Turn it face up any time for its mana cost if it's a creature card.)","colors":["B"],"colorIdentity":["B"],"keywords":["Manifest"],"commanderLegal":"legal","set":"frf","releasedAt":"2015-01-23","rarity":"mythic","layout":"normal","gameChanger":false}) as CardDef;

const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Passes and lets bots answer until the stack is empty or one of `me` has a question. */
const settle = (s: GameState, me: PlayerId[] = []) => {
  for (let i = 0; i < 400 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && !me.includes(p.player)) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const toLibraryTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "library";
  s.players[pid]!.library.unshift(id);
  invalidateCharacteristics(s);
  return id;
};
const named = (name: string, mv: number): CardDef => ({ oracleId: `b306-${name}`, name, manaCost: `{${mv}}`, cmc: mv, typeLine: "Sorcery", supertypes: [], types: ["Sorcery"], subtypes: [], oracleText: "Draw a card.", colors: [], colorIdentity: [], keywords: [], commanderLegal: "legal", set: "tst", releasedAt: "2000-01-01", rarity: "common", layout: "normal" }) as CardDef;
const attack = (s0: GameState, pid: PlayerId, attackers: string[], defender: PlayerId) => {
  let s = passUntil(s0, "declareAttackers", pid);
  s = act(s, { type: "declareAttackers", player: pid, attacks: attackers.map((attacker) => ({ attacker, defender })) });
  return s;
};
const others = (s: GameState, pid: PlayerId) => s.turnOrder.filter((p) => p !== pid);
const life = (s: GameState) => Object.fromEntries(s.players.map((p) => [p.id, p.life]));
const counted = (s: GameState) => s.turnLog?.pileOrGuess?.length ?? 0;

describe("Lane B round B306: The Celestial Toymaker", () => {
  it("is fully supported", () => {
    expect(isFullySupported(toymaker())).toBe(true);
  });

  it("attacking: you split the top three into a face-down and a face-up pile, both exiled; the defending player picks one for your hand", () => {
    const { s: s0, ap } = setup([]);
    const toy = putOnBattlefield(s0, ap, toymaker());
    // Gamma on top, then Beta, then Alpha.
    const [a, b, c] = ["Alpha", "Beta", "Gamma"].map((n, i) => toLibraryTop(s0, ap, named(n, i + 1))).reverse() as [string, string, string];
    expect(s0.players[ap]!.library.slice(0, 3)).toEqual([a, b, c]);
    // The defending player is the one it attacks: here the third player in turn order, not the next.
    const defender = others(s0, ap)[1]!;
    const before = s0.log.length;
    let s = settle(attack(s0, ap, [toy], defender), [ap, defender]);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, piles: true, min: 0, max: 3, cards: [a, b, c], dig: { to: "for the face-down pile", rest: "form the face-up pile; both piles are exiled" } });
    // Only looked at: no names in the log.
    const logged = () => s.log.slice(before).map((l) => l.text).join("\n");
    expect(logged()).toContain("looks at the top 3 cards of their library");
    expect(logged()).not.toMatch(/Alpha|Beta|Gamma/);
    s = act(s, { type: "searchLibrary", player: ap, found: [a] });
    expect([a, b, c].map((id) => zone(s, id))).toEqual(["exile", "exile", "exile"]);
    // The face-down card is hidden (only its exiler saw it); the face-up ones aren't.
    expect(s.objects[a]!.hiddenExile).toMatchObject({ seen: [ap] });
    expect(s.objects[b]!.hiddenExile).toBeUndefined();
    expect(logged()).toContain("exiles 1 card in a face-down pile and Beta, Alpha in a face-up pile");
    expect(logged()).not.toContain("Gamma");
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: defender, what: "pile", pileMode: "faceDown", of: ap, piles: [[a], [b, c]], labels: ["Face-down pile: 1 card", "Face-up pile: Beta, Alpha"] });
    s = settle(act(s, { type: "chooseOption", player: defender, choice: "1" }), [ap, defender]);
    expect([b, c].map((id) => zone(s, id))).toEqual(["hand", "hand"]);
    // The other pile stays in exile, still face down.
    expect(zone(s, a)).toBe("exile");
    expect(s.objects[a]!.hiddenExile).toBeDefined();
  });

  it("the face-down pile chosen goes into your hand; all three may go face down and the face-up pile is empty", () => {
    const { s: s0, ap, opp } = setup([]);
    const toy = putOnBattlefield(s0, ap, toymaker());
    const top = ["Alpha", "Beta", "Gamma"].map((n, i) => toLibraryTop(s0, ap, named(n, i + 1))).reverse();
    let s = settle(attack(s0, ap, [toy], opp), [ap, opp]);
    s = act(s, { type: "searchLibrary", player: ap, found: [...top] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, labels: ["Face-down pile: 3 cards", "Face-up pile: no cards"] });
    s = settle(act(s, { type: "chooseOption", player: opp, choice: "0" }), [ap, opp]);
    expect(top.map((id) => zone(s, id))).toEqual(["hand", "hand", "hand"]);
    expect(top.every((id) => !s.objects[id]!.hiddenExile)).toBe(true);
  });

  it("bots split the cards and choose a pile", () => {
    const { s: s0, ap, opp } = setup([]);
    const toy = putOnBattlefield(s0, ap, toymaker());
    const top = ["Alpha", "Beta", "Gamma"].map((n, i) => toLibraryTop(s0, ap, named(n, i + 1))).reverse();
    const hand = s0.players[ap]!.hand.length;
    const s = settle(attack(s0, ap, [toy], opp));
    const inHand = top.filter((id) => zone(s, id) === "hand").length;
    expect(s.players[ap]!.hand.length).toBe(hand + inHand);
    expect(top.filter((id) => zone(s, id) === "exile").length).toBe(3 - inHand);
    expect(counted(s)).toBe(1);
  });

  it("at each end step, each opponent loses 2 life for each spell or ability that made piles this turn: its own attack trigger and Fact or Fiction", () => {
    const { s: s0, ap, opp, ids } = setup([factOrFiction()]);
    const toy = putOnBattlefield(s0, ap, toymaker());
    // Fact or Fiction: an opponent separates, you choose: one spell, counted once.
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(counted(s)).toBe(1);
    s = settle(attack(s, ap, [toy], opp));
    expect(counted(s)).toBe(2);
    s = passUntil(s, "end", ap);
    const was = life(s);
    s = settle(s);
    const now = life(s);
    expect(now[ap]).toBe(was[ap]);
    for (const o of others(s, ap)) expect(was[o]! - now[o]!).toBe(4);
  });

  it("it triggers on other players' end steps too, and the count starts again each turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const toy = putOnBattlefield(s0, ap, toymaker());
    let s = settle(attack(s0, ap, [toy], opp));
    s = passUntil(s, "end", ap);
    s = settle(s);
    // The next player's turn: nothing grouped or guessed, so nobody loses life at its end step.
    s = passUntil(s, "main1", opp);
    expect(counted(s)).toBe(0);
    const at = s.log.length;
    s = passUntil(s, "end", opp);
    const was = life(s);
    s = settle(s);
    expect(s.log.slice(at).some((l) => l.text.includes("The Celestial Toymaker's ability triggers"))).toBe(true);
    expect(life(s)).toEqual(was);
  });

  it("a guess counts (Liar's Pendulum), an exile in a face-down pile counts (Ghastly Conscription), and Phyrexian Portal only once its library check passes", () => {
    const { s: s0, ap, opp, ids } = setup([conscription()]);
    putOnBattlefield(s0, ap, toymaker());
    const pend = putOnBattlefield(s0, ap, pendulum());
    let s = settle(run(s0, planActivate(s0, ap, pend, 0, [{ kind: "player", id: opp }])));
    expect(counted(s)).toBe(1);
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(counted(s)).toBe(2);
    // Portal with fewer than ten cards in the library does nothing: no piles.
    const p = putOnBattlefield(s, ap, portal());
    const lib = s.players[ap]!.library;
    for (const id of lib.splice(9)) s.objects[id]!.zone = "exile";
    s = settle(run(s, planActivate(s, ap, p, 0, [{ kind: "player", id: opp }])));
    expect(counted(s)).toBe(2);
  });
});
