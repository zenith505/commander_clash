// "One or more" triggers (CR 603.2c): an ability triggers only once each time its trigger event occurs, however many
// objects the event moves. One event is one instruction of a resolving spell or ability, one pass of state-based
// actions, or one cost paid (rulings on Conspiracy Unraveler: each cost is its own event, and so is a card leaving the
// graveyard as it's cast, CR 601.2a). Leaving the battlefield or a graveyard looks back in time (CR 603.10a), so a
// permanent leaving at the same time sees it; "put into your graveyard from anywhere" doesn't (rulings on Sefris).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, cast, passAll, putOnBattlefield, setup, swamp, target } from "./helpers";
import { botActions, compileCard, isFullySupported, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    s = act(s, s.pending ? botActions(s, pid)[0]! : { type: "passPriority", player: pid });
  }
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return settle(s);
};
const triggered = (s: GameState, name: string) => s.log.filter((l) => l.text.startsWith(`${name}'s ability triggers`)).length;
const counters = (s: GameState, id: string) => s.objects[id]!.counters["+1/+1"] ?? 0;
const clues = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === "Clue Token").length;
/** Put a copy of `def` into `pid`'s graveyard, or on top of their library. */
function put(s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "library") {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "graveyard") s.players[pid]!.graveyard.push(id);
  else s.players[pid]!.library.unshift(id);
  return id;
}

// Real oracle text (Scryfall).
const mascot = card("Spirit Mascot", "Creature — Spirit Ox", "{R}{W}", { power: "2", toughness: "2", oracleText: "Whenever one or more cards leave your graveyard, put a +1/+1 counter on this creature." });
const vizier = card("Rakshasa Vizier", "Creature — Demon", "{2}{B}{G}{U}", { power: "4", toughness: "4", oracleText: "Whenever one or more cards are put into exile from your graveyard, put that many +1/+1 counters on this creature." });
const excavator = card("Garrison Excavator", "Creature — Orc Sorcerer", "{3}{R}", { power: "3", toughness: "4", oracleText: "Menace (This creature can't be blocked except by two or more creatures.)\nWhenever one or more cards leave your graveyard, create a 2/2 red and white Spirit creature token." });
const opportunist = card("Morbid Opportunist", "Creature — Human Rogue", "{2}{B}", { power: "1", toughness: "3", oracleText: "Whenever one or more other creatures die, draw a card. This ability triggers only once each turn." });
const bee = card("Great Fierce Bee", "Creature — Insect", "{2}{B}", { power: "2", toughness: "2", oracleText: "Flying\nWhenever one or more other creatures die, scry 1. (Look at the top card of your library. You may put that card on the bottom.)" });
const champion = card("Woodland Champion", "Creature — Elf Scout", "{1}{G}", { power: "2", toughness: "2", oracleText: "Whenever one or more tokens you control enter, put that many +1/+1 counters on this creature." });
const vampire = card("Welcoming Vampire", "Creature — Vampire", "{2}{W}", { power: "2", toughness: "3", oracleText: "Flying\nWhenever one or more other creatures you control with power 2 or less enter, draw a card. This ability triggers only once each turn." });
const portMage = card("Dour Port-Mage", "Creature — Frog Wizard", "{1}{U}", { power: "1", toughness: "3", oracleText: "Whenever one or more other creatures you control leave the battlefield without dying, draw a card.\n{1}{U}, {T}: Return another target creature you control to its owner's hand." });
const sally = card("Sally Sparrow", "Legendary Creature — Human Detective", "{2}{W}{U}", { power: "2", toughness: "3", oracleText: "You may cast creature spells as though they had flash.\nWhenever one or more other creatures you control leave the battlefield, investigate. This ability triggers only once each turn. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")" });
const brood = card("Voracious Brood", "Creature — Alien Insect", "{2}{G}", { power: "1", toughness: "1", oracleText: "This creature enters with a +1/+1 counter on it for each creature card in your graveyard.\nWhenever one or more creature cards are put into your graveyard from anywhere, put that many +1/+1 counters on this creature." });
const sefris = card("Sefris of the Hidden Ways", "Legendary Creature — Human Wizard", "{W}{U}{B}", { power: "2", toughness: "3", oracleText: "Whenever one or more creature cards are put into your graveyard from anywhere, venture into the dungeon. This ability triggers only once each turn. (To venture into the dungeon, enter the first room or advance to the next room.)\nCreate Undead — Whenever you complete a dungeon, return target creature card from your graveyard to the battlefield." });
const mako = card("Marauding Mako", "Creature — Shark Pirate", "{R}", { power: "1", toughness: "1", oracleText: "Whenever you discard one or more cards, put that many +1/+1 counters on this creature.\nCycling {2} ({2}, Discard this card: Draw a card.)" });
const rielle = card("Rielle, the Everwise", "Legendary Creature — Human Wizard", "{1}{U}{R}", { power: "0", toughness: "3", oracleText: "Rielle gets +1/+0 for each instant and sorcery card in your graveyard.\nWhenever you discard one or more cards for the first time each turn, draw that many cards." });
const hostile = card("Hostile Investigator", "Creature — Ogre Rogue Detective", "{3}{B}", { power: "4", toughness: "3", oracleText: "When this creature enters, target opponent discards a card.\nWhenever one or more players discard one or more cards, investigate. This ability triggers only once each turn. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")" });

const crypt = card("Tormod's Crypt", "Artifact", "{0}", { oracleText: "{T}, Sacrifice this artifact: Exile target player's graveyard." });
const judgment = card("Day of Judgment", "Sorcery", "{2}{W}{W}", { oracleText: "Destroy all creatures." });
const alarm = card("Raise the Alarm", "Instant", "{1}{W}", { oracleText: "Create two 1/1 white Soldier creature tokens." });
const boomerang = card("Boomerang", "Instant", "{U}{U}", { oracleText: "Return target permanent to its owner's hand." });
const murder = card("Murder", "Instant", "{1}{B}{B}", { oracleText: "Destroy target creature." });
const looting = card("Faithless Looting", "Sorcery", "{R}", { oracleText: "Draw two cards, then discard two cards.\nFlashback {2}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)" });
const mindRot = card("Mind Rot", "Sorcery", "{2}{B}", { oracleText: "Target player discards two cards." });
const scour = card("Thought Scour", "Instant", "{U}", { oracleText: "Target player mills two cards.\nDraw a card." });
const torpor = card("Torpor Orb", "Artifact", "{2}", { oracleText: "Creatures entering don't cause abilities to trigger." });
const satyr = card("Satyr's Cunning", "Sorcery", "{R}", { oracleText: "Create a 1/1 red Satyr creature token with \"This token can't block.\"\nEscape—{2}{R}, Exile two other cards from your graveyard. (You may cast this card from your graveyard for its escape cost.)" });
const cruise = card("Treasure Cruise", "Sorcery", "{7}{U}", { oracleText: "Delve (Each card you exile from your graveyard while casting this spell pays for {1}.)\nDraw three cards." });
const thinkTwice = card("Think Twice", "Instant", "{1}{U}", { oracleText: "Draw a card.\nFlashback {2}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)" });

describe("one or more: parsing", () => {
  it("compiles the batch triggers", () => {
    supported(mascot, vizier, excavator, opportunist, bee, champion, vampire, portMage, sally, brood, sefris, mako, rielle, hostile);
    expect(compileCard(vizier).triggers[0]).toMatchObject({ event: "batch", batch: { what: "leavesGraveyard", whose: "you", to: "exile" } });
    expect(compileCard(portMage).triggers[0]).toMatchObject({ event: "batch", batch: { what: "leaves", other: true, notDies: true } });
    expect(compileCard(sefris).triggers[0]).toMatchObject({ event: "batch", oncePerTurn: true, batch: { what: "toGraveyard", filter: { kind: "card", types: ["Creature"] } } });
    expect(compileCard(rielle).triggers[0]).toMatchObject({ event: "batch", batch: { what: "discards", first: true } });
  });

  it("leaves out what the event moved as a group ('those cards', 'one of them')", () => {
    const roots = card("Group Test", "Enchantment", "{G}", { oracleText: "Whenever one or more creature cards leave your graveyard, return one of them to your hand." });
    const greatest = card("Greatest Test", "Enchantment", "{G}", { oracleText: "Whenever one or more cards leave your graveyard, you gain life equal to the greatest mana value among those cards." });
    expect(isFullySupported(roots)).toBe(false);
    expect(isFullySupported(greatest)).toBe(false);
  });
});

describe("cards leaving a graveyard", () => {
  it("exiling a whole graveyard triggers once; 'that many' counts the cards", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, mascot);
    const v = putOnBattlefield(s0, ap, vizier);
    const e = putOnBattlefield(s0, ap, excavator);
    for (let i = 0; i < 3; i++) put(s0, ap, bear(), "graveyard");
    const c = putOnBattlefield(s0, ap, crypt);
    const s = settle(activate(s0, ap, c, 0, [{ kind: "player", id: ap }]));
    // The Crypt itself went to the graveyard as a cost, a different event, before its ability exiled it with the rest.
    expect(s.players[ap]!.graveyard).toHaveLength(0);
    expect(counters(s, m)).toBe(1);
    expect(counters(s, v)).toBe(4);
    expect(triggered(s, "Spirit Mascot")).toBe(1);
    expect(s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Spirit Token").length).toBe(1);
    expect(s.objects[e]!.zone).toBe("battlefield");
  });

  it("an opponent's graveyard isn't yours", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, mascot);
    put(s0, opp, bear(), "graveyard");
    const c = putOnBattlefield(s0, ap, crypt);
    const s = settle(activate(s0, ap, c, 0, [{ kind: "player", id: opp }]));
    expect(counters(s, m)).toBe(0);
  });

  it("escape: the card leaving as it's cast and the cards exiled to pay for it are two events", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, mascot);
    const v = putOnBattlefield(s0, ap, vizier);
    const sc = put(s0, ap, satyr, "graveyard");
    const others = [put(s0, ap, bear(), "graveyard"), put(s0, ap, bear(), "graveyard")];
    const s = run(s0, planCast(s0, ap, sc, undefined, undefined, undefined, undefined, { via: "escape", exileCards: others }));
    expect(others.map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile"]);
    expect(counters(s, m)).toBe(2);
    expect(counters(s, v)).toBe(2); // the escaping card went to the stack, not exile
  });

  it("delve exiles its cards all at once; flashback leaves the graveyard once", () => {
    const { s: s0, ap, ids } = setup([cruise]);
    const m = putOnBattlefield(s0, ap, mascot);
    const v = putOnBattlefield(s0, ap, vizier);
    const yard = [put(s0, ap, bear(), "graveyard"), put(s0, ap, bear(), "graveyard"), put(s0, ap, bear(), "graveyard")];
    const tt = put(s0, ap, thinkTwice, "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { delve: yard }));
    expect(counters(s, m)).toBe(1);
    expect(counters(s, v)).toBe(3);
    s = run(s, planCast(s, ap, tt, undefined, undefined, undefined, undefined, { via: "flashback" }));
    expect(s.objects[tt]!.zone).toBe("exile"); // from the stack: not from the graveyard
    expect(counters(s, m)).toBe(2);
    expect(counters(s, v)).toBe(3);
  });
});

describe("creatures dying or leaving", () => {
  it("a board wipe triggers Morbid Opportunist once, even as it dies too (CR 603.10a)", () => {
    const { s: s0, ap, ids } = setup([judgment]);
    putOnBattlefield(s0, ap, opportunist);
    putOnBattlefield(s0, ap, bee);
    putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, ap, bear());
    const hand = s0.players[ap]!.hand.length;
    const s = settle(cast(s0, ap, ids[0]!));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
    expect(triggered(s, "Morbid Opportunist")).toBe(1);
    expect(triggered(s, "Great Fierce Bee")).toBe(1);
  });

  it("'triggers only once each turn': a second death that turn doesn't draw again", () => {
    const { s: s0, ap, ids } = setup([murder]);
    putOnBattlefield(s0, ap, opportunist);
    const b1 = putOnBattlefield(s0, ap, bear());
    const b2 = putOnBattlefield(s0, ap, bear());
    let s = settle(cast(s0, ap, ids[0]!, [target(b1)]));
    expect(triggered(s, "Morbid Opportunist")).toBe(1);
    s.objects[b2]!.damage = 2; // lethal damage: it dies as state-based actions are next checked

    s = settle(passAll(s));
    expect(s.objects[b2]!.zone).toBe("graveyard");
    expect(triggered(s, "Morbid Opportunist")).toBe(1);
  });

  it("Dour Port-Mage: bounced, not died; Sally Sparrow sees creatures leave with her", () => {
    const { s: s0, ap, ids } = setup([boomerang, murder]);
    putOnBattlefield(s0, ap, portMage);
    const b1 = putOnBattlefield(s0, ap, bear());
    const b2 = putOnBattlefield(s0, ap, bear());
    const hand = s0.players[ap]!.hand.length;
    let s = settle(cast(s0, ap, ids[0]!, [target(b1)]));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1 + 1); // Boomerang gone, the bear back, a card drawn
    s = settle(cast(s, ap, ids[1]!, [target(b2)]));
    expect(triggered(s, "Dour Port-Mage")).toBe(1);

    const { s: t0, ap: p, ids: w } = setup([judgment]);
    putOnBattlefield(t0, p, sally);
    putOnBattlefield(t0, p, bear());
    const t = settle(cast(t0, p, w[0]!));
    expect(clues(t, p)).toBe(1);
  });
});

describe("permanents entering", () => {
  it("two tokens at once: one trigger, that many counters; Torpor Orb stops creature tokens", () => {
    const { s: s0, ap, ids } = setup([alarm, alarm]);
    const ch = putOnBattlefield(s0, ap, champion);
    let s = settle(cast(s0, ap, ids[0]!));
    expect(counters(s, ch)).toBe(2);
    expect(triggered(s, "Woodland Champion")).toBe(1);
    putOnBattlefield(s, ap, torpor);
    s = settle(cast(s, ap, ids[1]!));
    expect(counters(s, ch)).toBe(2);
  });

  it("Welcoming Vampire draws once for two small creatures, and once each turn", () => {
    const { s: s0, ap, ids } = setup([alarm, alarm]);
    putOnBattlefield(s0, ap, vampire);
    const hand = s0.players[ap]!.hand.length;
    let s = settle(cast(s0, ap, ids[0]!));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 1);
    s = settle(cast(s, ap, ids[1]!));
    expect(s.players[ap]!.hand.length).toBe(hand - 2 + 1);
  });
});

describe("cards put into a graveyard", () => {
  it("Voracious Brood: milled creature cards and a dying creature count; tokens aren't cards", () => {
    const { s: s0, ap, ids } = setup([scour, alarm, judgment]);
    const b = putOnBattlefield(s0, ap, brood);
    put(s0, ap, bear(), "library");
    put(s0, ap, bear(), "library");
    let s = settle(cast(s0, ap, ids[0]!, [{ kind: "player", id: ap }]));
    expect(counters(s, b)).toBe(2);
    expect(triggered(s, "Voracious Brood")).toBe(1);
    s = settle(cast(s, ap, ids[1]!));
    s = settle(cast(s, ap, ids[2]!));
    // Brood died with the tokens: it doesn't look back (rulings on Sefris), and tokens aren't cards anyway.
    expect(triggered(s, "Voracious Brood")).toBe(1);
  });

  it("Sefris ventures once for creature cards milled; not as it dies with others", () => {
    const { s: s0, ap, ids } = setup([scour]);
    putOnBattlefield(s0, ap, sefris);
    put(s0, ap, bear(), "library");
    put(s0, ap, bear(), "library");
    const s = settle(cast(s0, ap, ids[0]!, [{ kind: "player", id: ap }]));
    expect(triggered(s, "Sefris of the Hidden Ways")).toBe(1);
    expect(s.players[ap]!.dungeon).toBeDefined();

    const { s: t0, ap: p, ids: w } = setup([judgment]);
    putOnBattlefield(t0, p, sefris);
    putOnBattlefield(t0, p, bear());
    const t = settle(cast(t0, p, w[0]!));
    expect(triggered(t, "Sefris of the Hidden Ways")).toBe(0);
    expect(t.players[p]!.dungeon).toBeUndefined();
  });
});

describe("discarding one or more cards", () => {
  it("Marauding Mako gets that many counters for one discard of two", () => {
    const { s: s0, ap, ids } = setup([looting]);
    const m = putOnBattlefield(s0, ap, mako);
    const s = settle(cast(s0, ap, ids[0]!));
    expect(counters(s, m)).toBe(2);
    expect(triggered(s, "Marauding Mako")).toBe(1);
  });

  it("Rielle draws that many the first time each turn only", () => {
    const { s: s0, ap, ids } = setup([looting, mindRot, bear(), bear(), bear()]);
    putOnBattlefield(s0, ap, rielle);
    const hand = s0.players[ap]!.hand.length;
    let s = settle(cast(s0, ap, ids[0]!));
    // Looting: -1, +2 drawn, -2 discarded, +2 from Rielle.
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2 - 2 + 2);
    s = settle(cast(s, ap, ids[1]!, [{ kind: "player", id: ap }]));
    expect(triggered(s, "Rielle, the Everwise")).toBe(1);
  });

  it("Hostile Investigator: any player's discard, once each turn", () => {
    const { s: s0, ap, opp, ids } = setup([hostile, mindRot]);
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, swamp);
    let s = settle(cast(s0, ap, ids[0]!));
    s = settle(s);
    expect(clues(s, ap)).toBe(1);
    s = settle(cast(s, ap, ids[1]!, [{ kind: "player", id: opp }]));
    expect(clues(s, ap)).toBe(1);
  });
});
