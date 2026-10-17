// Names chosen as a spell or ability resolves (CR 201.4, 608.2d) and what's done with them: discarding (Cabal Therapy),
// searching a player's graveyard, hand and library (Memoricide, CR 701.23), revealing until one (Demonic Consultation),
// guessing (Diviner's Lockbox, Cursed Scroll, Predict), banning it for a while (Conjurer's Ban); a target's name
// (Counterbore, Surgical Extraction, Reflector Mage); "cards named ~ in all graveyards" (Kindle).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passAll, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { botActions } from "../src/bot";
import { castProblem, invalidateCharacteristics, isFullySupported, legalActions, planActivate, planCast, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const therapy = card("Cabal Therapy", "Sorcery", "{B}", { keywords: ["Flashback"], oracleText: "Choose a nonland card name. Target player reveals their hand and discards all cards with that name.\nFlashback—Sacrifice a creature. (You may cast this card from your graveyard for its flashback cost. Then exile it.)" });
const memoricide = card("Memoricide", "Sorcery", "{3}{B}", { oracleText: "Choose a nonland card name. Search target player's graveyard, hand, and library for any number of cards with that name and exile them. Then that player shuffles." });
const cranial = card("Cranial Extraction", "Sorcery — Arcane", "{3}{B}", { oracleText: "Choose a nonland card name. Search target player's graveyard, hand, and library for all cards with that name and exile them. Then that player shuffles." });
const ego = card("Unmoored Ego", "Sorcery", "{1}{U}{B}", { oracleText: "Choose a card name. Search target opponent's graveyard, hand, and library for up to four cards with that name and exile them. That player shuffles, then draws a card for each card exiled from their hand this way." });
const necromentia = card("Necromentia", "Sorcery", "{1}{B}{B}", { oracleText: "Choose a card name other than a basic land card name. Search target opponent's graveyard, hand, and library for any number of cards with that name and exile them. That player shuffles, then creates a 2/2 black Zombie creature token for each card exiled from their hand this way." });
const counterbore = card("Counterbore", "Instant", "{3}{U}{U}", { oracleText: "Counter target spell. Search its controller's graveyard, hand, and library for all cards with the same name as that spell and exile them. Then that player shuffles." });
const talents = card("Test of Talents", "Instant", "{1}{U}", { oracleText: "Counter target instant or sorcery spell. Search its controller's graveyard, hand, and library for any number of cards with the same name as that spell and exile them. That player shuffles, then draws a card for each card exiled from their hand this way." });
const surgical = card("Surgical Extraction", "Instant", "{B/P}", { oracleText: "({B/P} can be paid with either {B} or 2 life.)\nChoose target card in a graveyard other than a basic land card. Search its owner's graveyard, hand, and library for any number of cards with the same name as that card and exile them. Then that player shuffles." });
const consultation = card("Demonic Consultation", "Instant", "{B}", { oracleText: "Choose a card name. Exile the top six cards of your library, then reveal cards from the top of your library until you reveal a card with the chosen name. Put that card into your hand and exile all other cards revealed this way." });
const spoils = card("Spoils of the Vault", "Instant", "{B}", { oracleText: "Choose a card name. Reveal cards from the top of your library until you reveal a card with that name, then put that card into your hand. Exile all other cards revealed this way, and you lose 1 life for each of the exiled cards." });
const lockbox = card("Diviner's Lockbox", "Artifact", "{4}", { oracleText: "{1}, {T}: Choose a card name, then reveal the top card of your library. If that card has the chosen name, sacrifice this artifact and draw three cards. Activate only as a sorcery." });
const scroll = card("Cursed Scroll", "Artifact", "{1}", { oracleText: "{3}, {T}: Choose a card name, then reveal a card at random from your hand. If that card has the chosen name, this artifact deals 2 damage to any target." });
const predict = card("Predict", "Instant", "{1}{U}", { keywords: ["Mill"], oracleText: "Choose a card name, then target player mills a card. If a card with the chosen name was milled this way, you draw two cards. Otherwise, you draw a card." });
const ban = card("Conjurer's Ban", "Sorcery", "{W}{B}", { oracleText: "Choose a card name. Until your next turn, spells with the chosen name can't be cast and lands with the chosen name can't be played.\nDraw a card." });
const reflector = card("Reflector Mage", "Creature — Human Wizard", "{1}{W}{U}", { power: "2", toughness: "3", oracleText: "When this creature enters, return target creature an opponent controls to its owner's hand. That creature's owner can't cast spells with the same name as that creature until your next turn." });
const kindle = card("Kindle", "Instant", "{1}{R}", { oracleText: "Kindle deals X damage to any target, where X is 2 plus the number of cards named Kindle in all graveyards." });
const knowledge = card("Accumulated Knowledge", "Instant", "{1}{U}", { oracleText: "Draw a card, then draw cards equal to the number of cards named Accumulated Knowledge in all graveyards." });
const servant = card("Undead Servant", "Creature — Zombie", "{3}{B}", { power: "3", toughness: "2", oracleText: "When this creature enters, create a 2/2 black Zombie creature token for each card named Undead Servant in your graveyard." });
const splinter = card("Splinter", "Sorcery", "{2}{G}{G}", { oracleText: "Exile target artifact. Search its controller's graveyard, hand, and library for all cards with the same name as that artifact and exile them. Then that player shuffles." });
const stone = card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." });
const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
const opt = card("Opt", "Instant", "{U}", { oracleText: "Scry 1.\nDraw a card." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const named = (s: GameState, ids: string[], name: string) => ids.filter((id) => s.cards[s.objects[id]!.cardId]!.name === name);

/** Put a new copy of `def` into `pid`'s `zone` (a library's top). */
function place(s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library"): string {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  const p = s.players[pid]!;
  if (zone === "library") p.library.unshift(id);
  else if (zone === "hand") p.hand.push(id);
  else if (zone === "graveyard") p.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
}

/** Answer the card-name question the spell or ability is waiting on. */
function nameIt(s: GameState, pid: PlayerId, name: string): GameState {
  expect(s.pending).toMatchObject({ kind: "chooseOption", player: pid, what: "cardName" });
  return act(s, { type: "chooseOption", player: pid, choice: name });
}

describe("choosing a card name as it resolves", () => {
  it("compiles them", () => supported(splinter, therapy, memoricide, cranial, ego, necromentia, counterbore, talents, surgical, consultation, spoils, lockbox, scroll, predict, ban, reflector, kindle, knowledge, servant));

  it("Cabal Therapy: the target discards every card with the chosen name, after the name is chosen", () => {
    let { s, ap, opp, ids } = setup([therapy]);
    const bolts = [place(s, opp, bolt, "hand"), place(s, opp, bolt, "hand")];
    const other = place(s, opp, opt, "hand");
    s = cast(s, ap, ids[0]!, [{ kind: "player", id: opp }]);
    // Named as it resolves (rulings): a nonland card name, so no land is offered.
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "cardName", prompt: "choose a nonland card name", purpose: "theirs", of: opp });
    s = nameIt(s, ap, "Lightning Bolt");
    expect(bolts.map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard"]);
    expect(s.objects[other]!.zone).toBe("hand");
  });

  it("Memoricide: the caster finds any number of them in the graveyard, hand and library, then that player shuffles", () => {
    let { s, ap, opp, ids } = setup([memoricide]);
    const yard = place(s, opp, bolt, "graveyard");
    const hand = place(s, opp, bolt, "hand");
    const lib = place(s, opp, bolt, "library");
    s = cast(s, ap, ids[0]!, [{ kind: "player", id: opp }]);
    s = nameIt(s, ap, "Lightning Bolt");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 0, max: 3, zonesOf: opp });
    const pend = s.pending!.kind === "searchLibrary" ? s.pending : null;
    expect([...pend!.cards].sort()).toEqual([yard, hand, lib].sort());
    // "Any number": one may be left (rulings).
    s = act(s, { type: "searchLibrary", player: ap, found: [hand, lib] });
    expect([yard, hand, lib].map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "exile", "exile"]);
    expect(s.log.some((l) => l.text === `${s.players[opp]!.name} shuffles their library.`)).toBe(true);
  });

  it("Cranial Extraction: \"all\" takes the graveyard's without asking; the hidden hand's and library's may be left (CR 701.23b)", () => {
    let { s, ap, opp, ids } = setup([cranial]);
    const yard = place(s, opp, bolt, "graveyard");
    const hand = place(s, opp, bolt, "hand");
    s = cast(s, ap, ids[0]!, [{ kind: "player", id: opp }]);
    s = nameIt(s, ap, "Lightning Bolt");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", cards: [hand], also: [yard] });
    s = act(s, { type: "searchLibrary", player: ap, found: [] });
    expect(s.objects[yard]!.zone).toBe("exile");
    expect(s.objects[hand]!.zone).toBe("hand");
  });

  it("a name with no card to find: nothing is asked, the library is still shuffled", () => {
    let { s, ap, opp, ids } = setup([memoricide, bolt]);
    s = cast(s, ap, ids[0]!, [{ kind: "player", id: opp }]);
    s = nameIt(s, ap, "Lightning Bolt");
    expect(s.pending).toBeNull();
    expect(s.objects[ids[1]!]!.zone).toBe("hand");
    expect(s.stack).toHaveLength(0);
  });

  it("Unmoored Ego: up to four, and that player draws a card for each one exiled from their hand", () => {
    let { s, ap, opp, ids } = setup([ego]);
    const hand = [place(s, opp, bolt, "hand"), place(s, opp, bolt, "hand")];
    const lib = [place(s, opp, bolt, "library"), place(s, opp, bolt, "library"), place(s, opp, bolt, "library")];
    const handSize = s.players[opp]!.hand.length;
    s = cast(s, ap, ids[0]!, [{ kind: "player", id: opp }]);
    s = nameIt(s, ap, "Lightning Bolt");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", max: 4 });
    expect(() => act(s, { type: "searchLibrary", player: ap, found: [...hand, ...lib] })).toThrow(/at most 4/);
    s = act(s, { type: "searchLibrary", player: ap, found: [...hand, lib[0]!, lib[1]!] });
    expect([...hand, ...lib].map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile", "exile", "exile", "library"]);
    // Two exiled from the hand, two drawn.
    expect(s.players[opp]!.hand.length).toBe(handSize);
  });

  it("Necromentia: that player creates a 2/2 Zombie for each card exiled from their hand", () => {
    let { s, ap, opp, ids } = setup([necromentia]);
    place(s, opp, bolt, "hand");
    place(s, opp, bolt, "graveyard");
    s = cast(s, ap, ids[0]!, [{ kind: "player", id: opp }]);
    // "Other than a basic land card name": no basic land is offered.
    expect(s.pending?.kind === "chooseOption" && s.pending.options.includes("Forest")).toBe(false);
    s = nameIt(s, ap, "Lightning Bolt");
    const all = s.pending!.kind === "searchLibrary" ? s.pending.cards : [];
    s = act(s, { type: "searchLibrary", player: ap, found: all });
    const zombies = s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === opp);
    expect(zombies).toHaveLength(1);
  });

  it("a bot takes every card it can, the ones in the hand last", () => {
    let { s, ap, opp, ids } = setup([ego]);
    const hand = place(s, opp, bolt, "hand");
    const lib = [1, 2, 3, 4].map(() => place(s, opp, bolt, "library"));
    s = cast(s, ap, ids[0]!, [{ kind: "player", id: opp }]);
    s = nameIt(s, ap, "Lightning Bolt");
    const [a] = botActions(s, ap);
    expect(a).toMatchObject({ type: "searchLibrary" });
    expect(a!.type === "searchLibrary" && [...a!.found].sort()).toEqual([...lib].sort());
    expect(hand).toBeTruthy();
  });

  it("Counterbore: counters the spell, then exiles every other card with its name from its controller's zones", () => {
    let { s, ap, opp, ids } = setup([bolt]);
    const spare = place(s, ap, bolt, "library");
    // The next player holds Counterbore and the Islands to cast it.
    const cb = place(s, opp, counterbore, "hand");
    for (let i = 0; i < 5; i++) putOnBattlefield(s, opp, card("Island", "Basic Land — Island"));
    for (const a of planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])!) s = act(s, a);
    s = act(s, { type: "passPriority", player: ap });
    expect(s.priority).toBe(opp);
    for (const a of planCast(s, opp, cb, [{ kind: "stack", id: s.stack[0]!.id }])!) s = act(s, a);
    s = passAll(s);
    // The countered Bolt is in its owner's graveyard: found without a choice ("all", a public zone).
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp, cards: [spare], also: [ids[0]], zonesOf: ap });
    s = act(s, { type: "searchLibrary", player: opp, found: [spare] });
    expect([ids[0]!, spare].map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile"]);
  });

  it("Test of Talents: its controller draws a card for each one exiled from their hand", () => {
    let { s, ap, opp, ids } = setup([bolt, bolt]);
    const tt = place(s, opp, talents, "hand");
    for (let i = 0; i < 2; i++) putOnBattlefield(s, opp, card("Island", "Basic Land — Island"));
    for (const a of planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])!) s = act(s, a);
    s = act(s, { type: "passPriority", player: ap });
    for (const a of planCast(s, opp, tt, [{ kind: "stack", id: s.stack[0]!.id }])!) s = act(s, a);
    s = passAll(s);
    const hand = s.players[ap]!.hand.length;
    s = act(s, { type: "searchLibrary", player: opp, found: [ids[0]!, ids[1]!] });
    expect(s.objects[ids[1]!]!.zone).toBe("exile");
    expect(s.players[ap]!.hand.length).toBe(hand);
  });

  it("Splinter: the exiled artifact's name, as it last was on the battlefield, and its controller's zones", () => {
    let { s, ap, opp, ids } = setup([splinter]);
    const rock = putOnBattlefield(s, opp, stone);
    const yard = place(s, opp, stone, "graveyard");
    const lib = place(s, opp, stone, "library");
    s = cast(s, ap, ids[0]!, [target(rock)]);
    expect(s.objects[rock]!.zone).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", cards: [lib], also: [yard], zonesOf: opp });
    s = act(s, { type: "searchLibrary", player: ap, found: [lib] });
    expect([yard, lib].map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile"]);
  });

  it("Surgical Extraction: targets a card in a graveyard, not a basic land, and finds the others with its name", () => {
    let { s, ap, opp, ids } = setup([surgical]);
    const dead = place(s, opp, bolt, "graveyard");
    const land = place(s, opp, card("Forest", "Basic Land — Forest"), "graveyard");
    const more = place(s, opp, bolt, "hand");
    expect(castProblem(s, ap, ids[0]!, [target(land)])).not.toBeNull();
    s = cast(s, ap, ids[0]!, [target(dead)]);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", zonesOf: opp });
    s = act(s, { type: "searchLibrary", player: ap, found: [dead, more] });
    expect([dead, more].map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile"]);
  });

  it("Demonic Consultation: six exiled, then cards revealed until one with the name, which goes to the hand", () => {
    let { s, ap, ids } = setup([consultation]);
    const lib = s.players[ap]!.library;
    const top6 = lib.slice(0, 6);
    const wanted = place(s, ap, bolt, "library");
    // Seventh from the top, two cards after the six exiled.
    lib.splice(lib.indexOf(wanted), 1);
    lib.splice(8, 0, wanted);
    const between = lib.slice(6, 8);
    s = cast(s, ap, ids[0]!);
    s = nameIt(s, ap, "Lightning Bolt");
    s = passAll(s);
    expect(s.objects[wanted]!.zone).toBe("hand");
    expect([...top6, ...between].every((id) => s.objects[id]!.zone === "exile")).toBe(true);
  });

  it("Demonic Consultation naming a card in the top six: the whole library is exiled (rulings)", () => {
    let { s, ap, ids } = setup([consultation]);
    place(s, ap, bolt, "library");
    s = cast(s, ap, ids[0]!);
    s = nameIt(s, ap, "Lightning Bolt");
    expect(s.players[ap]!.library).toHaveLength(0);
  });

  it("Spoils of the Vault: 1 life for each card exiled", () => {
    let { s, ap, ids } = setup([spoils]);
    const lib = s.players[ap]!.library;
    const wanted = place(s, ap, bolt, "library");
    lib.splice(lib.indexOf(wanted), 1);
    lib.splice(3, 0, wanted);
    const life = s.players[ap]!.life;
    s = cast(s, ap, ids[0]!);
    s = nameIt(s, ap, "Lightning Bolt");
    expect(s.objects[wanted]!.zone).toBe("hand");
    expect(s.players[ap]!.life).toBe(life - 3);
  });

  it("Diviner's Lockbox: naming the top card sacrifices it and draws three; a miss does nothing", () => {
    let { s, ap } = setup([]);
    const box = putOnBattlefield(s, ap, lockbox);
    place(s, ap, bolt, "library");
    const hand = s.players[ap]!.hand.length;
    s = activate(s, ap, box, 0);
    s = nameIt(s, ap, "Grizzly Bears");
    expect(s.objects[box]!.zone).toBe("battlefield");
    expect(s.players[ap]!.hand.length).toBe(hand);
    s.objects[box]!.tapped = false;
    s = activate(s, ap, box, 0);
    s = nameIt(s, ap, "Lightning Bolt");
    expect(s.objects[box]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 3);
  });

  it("Cursed Scroll: with one card in hand, naming it deals 2 damage to the target chosen as it was activated", () => {
    let { s, ap, opp, ids } = setup([bolt]);
    const sc = putOnBattlefield(s, ap, scroll);
    // Only the Bolt in hand.
    const p = s.players[ap]!;
    for (const id of p.hand.filter((x) => x !== ids[0])) {
      p.hand.splice(p.hand.indexOf(id), 1);
      p.library.push(id);
      s.objects[id]!.zone = "library";
    }
    const life = s.players[opp]!.life;
    s = activate(s, ap, sc, 0, [{ kind: "player", id: opp }]);
    // A bot guesses the most common name in its hand.
    expect(botActions(s, ap)[0]).toEqual({ type: "chooseOption", player: ap, choice: "Lightning Bolt" });
    s = nameIt(s, ap, "Lightning Bolt");
    expect(s.players[opp]!.life).toBe(life - 2);
  });

  it("Predict: two cards if the milled card has the name, else one", () => {
    let { s, ap, opp, ids } = setup([predict, predict, opt]);
    place(s, opp, bolt, "library");
    const hand = s.players[ap]!.hand.length;
    s = cast(s, ap, ids[0]!, [{ kind: "player", id: opp }]);
    s = nameIt(s, ap, "Lightning Bolt");
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
    place(s, opp, bolt, "library");
    s = cast(s, ap, ids[1]!, [{ kind: "player", id: opp }]);
    s = nameIt(s, ap, "Opt");
    expect(s.players[ap]!.hand.length).toBe(hand - 2 + 2 + 1);
  });

  it("Conjurer's Ban: nobody can cast it or play it as a land until its caster's next turn", () => {
    let { s, ap, opp, ids } = setup([ban, bolt]);
    const theirs = place(s, opp, bolt, "hand");
    s = cast(s, ap, ids[0]!);
    s = nameIt(s, ap, "Lightning Bolt");
    expect(castProblem(s, ap, ids[1]!, [{ kind: "player", id: opp }])).toMatch(/can't be cast until/);
    expect(castProblem(s, opp, theirs, [{ kind: "player", id: ap }])).toMatch(/can't be cast until/);
    // Still banned on the next player's turn; over as its caster's next turn begins.
    s = passUntil(s, "main1", opp);
    expect(planCast(s, opp, theirs, [{ kind: "player", id: ap }])).toBeNull();
    s = passUntil(s, "upkeep", ap);
    expect(s.namedBansUntil).toBeUndefined();
  });

  it("Conjurer's Ban naming a land: it can't be played", () => {
    let { s, ap, ids } = setup([ban, card("Mountain", "Basic Land — Mountain")]);
    s = cast(s, ap, ids[0]!);
    s = nameIt(s, ap, "Mountain");
    expect(legalActions(s, ap).some((a) => a.type === "playLand" && a.objectId === ids[1])).toBe(false);
    expect(() => act(s, { type: "playLand", player: ap, objectId: ids[1]! })).toThrow(/can't be played/);
  });

  it("Reflector Mage: the bounced creature's owner can't cast spells with its name until your next turn", () => {
    let { s, ap, opp, ids } = setup([reflector]);
    const elves = putOnBattlefield(s, opp, bear({ name: "Llanowar Elves" }));
    s = cast(s, ap, ids[0]!);
    // The enters trigger targets the Elves.
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [target(elves)] });
    s = passAll(s);
    expect(s.objects[elves]!.zone).toBe("hand");
    expect(castProblem(s, opp, elves)).toMatch(/spells named Llanowar Elves can't be cast by you until/);
    // Only its owner: the active player could cast one.
    expect(s.namedBansUntil).toEqual([expect.objectContaining({ name: "Llanowar Elves", players: [opp] })]);
  });

  it("Kindle and Accumulated Knowledge count the cards with their name in all graveyards, not themselves on the stack", () => {
    let { s, ap, opp, ids } = setup([kindle, knowledge]);
    place(s, ap, kindle, "graveyard");
    place(s, opp, kindle, "graveyard");
    place(s, opp, knowledge, "graveyard");
    const life = s.players[opp]!.life;
    s = cast(s, ap, ids[0]!, [{ kind: "player", id: opp }]);
    expect(s.players[opp]!.life).toBe(life - 4);
    const hand = s.players[ap]!.hand.length;
    s = cast(s, ap, ids[1]!);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
  });

  it("Undead Servant: a Zombie for each card named Undead Servant in your graveyard", () => {
    let { s, ap, ids } = setup([servant]);
    place(s, ap, servant, "graveyard");
    place(s, ap, servant, "graveyard");
    s = cast(s, ap, ids[0]!);
    s = passAll(s);
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap)).toHaveLength(2);
  });
});
