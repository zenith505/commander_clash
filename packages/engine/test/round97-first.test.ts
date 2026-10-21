// Round 97: "whenever you put one or more counters on ..." (Terrasymbiosis, Nest of Scarabs, Inspired Tethermage: the
// player who puts them, CR 122.6 and the rulings on Generous Patron), Inkshield ("for each 1 damage prevented this way",
// CR 615.5), High Tide (a triggered mana ability until end of turn, CR 605.1b), Urza, Lord High Artificer (play that card
// without paying its mana cost, CR 118.9), Etali, Primal Conqueror, Mizzix's Mastery (copies cast as it resolves, CR
// 707.12), Ashaya (creatures that are Forest lands, CR 305.6), Bloodletter of Aclazotz (CR 614.1a, 120.3a), Beseech the
// Mirror (bargained, CR 702.166b) and Scrap Trawler ("with lesser mana value", as the one that died last existed).

import { describe, expect, it } from "vitest";
import { act, bear, card, cast, passAll, putOnBattlefield, setup, target } from "./helpers";
import { compileCard, isFullySupported, legalTargets, moveObject, planActivate, planCast, power, toughness, waitingOn, objIsType, type Action, type CardDef, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const terrasymbiosis = card("Terrasymbiosis", "Enchantment", "{2}{G}", { oracleText: "Whenever you put one or more +1/+1 counters on a creature you control, you may draw that many cards. Do this only once each turn." });
const nest = card("Nest of Scarabs", "Enchantment", "{2}{B}", { oracleText: "Whenever you put one or more -1/-1 counters on a creature, create that many 1/1 black Insect creature tokens." });
const tethermage = card("Inspired Tethermage", "Creature — Elf Warrior", "{2}{G}", { power: "1", toughness: "1", oracleText: "Whenever you put one or more loyalty counters on a planeswalker, put a +1/+1 counter on this creature.\n{6}: Empower Jace 2. (Put two loyalty counters on a Jace token you control. If you don't control one, first create a blue Jace planeswalker token with \"[−1]: Surveil 1\" and \"[−3]: Draw a card.\")" });
const inkshield = card("Inkshield", "Instant", "{3}{W}{B}", { oracleText: "Prevent all combat damage that would be dealt to you this turn. For each 1 damage prevented this way, create a 2/1 white and black Inkling creature token with flying." });
const highTide = card("High Tide", "Instant", "{U}", { oracleText: "Until end of turn, whenever a player taps an Island for mana, that player adds an additional {U}." });
const urza = card("Urza, Lord High Artificer", "Legendary Creature — Human Artificer", "{2}{U}{U}", { power: "1", toughness: "4", oracleText: "When Urza enters, create a 0/0 colorless Construct artifact creature token with \"This token gets +1/+1 for each artifact you control.\"\nTap an untapped artifact you control: Add {U}.\n{5}: Shuffle your library, then exile the top card. Until end of turn, you may play that card without paying its mana cost." });
const etali = card("Etali, Primal Conqueror", "Legendary Creature — Elder Dinosaur", "{5}{R}{R}", { power: "7", toughness: "7", keywords: ["Trample"], oracleText: "Trample\nWhen Etali enters, each player exiles cards from the top of their library until they exile a nonland card. You may cast any number of spells from among the nonland cards exiled this way without paying their mana costs." });
const mizzix = card("Mizzix's Mastery", "Sorcery", "{3}{R}", { keywords: ["Overload"], oracleText: "Exile target card that's an instant or sorcery from your graveyard. For each card exiled this way, copy it, and you may cast the copy without paying its mana cost. Exile Mizzix's Mastery.\nOverload {5}{R}{R}{R} (You may cast this spell for its overload cost. If you do, change \"target\" in its text to \"each.\")" });
const ashaya = card("Ashaya, Soul of the Wild", "Legendary Creature — Elemental", "{3}{G}{G}", { power: "*", toughness: "*", oracleText: "Ashaya's power and toughness are each equal to the number of lands you control.\nNontoken creatures you control are Forest lands in addition to their other types. (They're still affected by summoning sickness.)" });
const bloodletter = card("Bloodletter of Aclazotz", "Creature — Vampire Demon", "{1}{B}{B}{B}", { power: "2", toughness: "4", keywords: ["Flying"], oracleText: "Flying\nIf an opponent would lose life during your turn, they lose twice that much life instead. (Damage causes loss of life.)" });
const beseech = card("Beseech the Mirror", "Sorcery", "{1}{B}{B}{B}", { keywords: ["Bargain"], oracleText: "Bargain (You may sacrifice an artifact, enchantment, or token as you cast this spell.)\nSearch your library for a card, exile it face down, then shuffle. If this spell was bargained, you may cast the exiled card without paying its mana cost if that spell's mana value is 4 or less. Put the exiled card into your hand if it wasn't cast this way." });
const trawler = card("Scrap Trawler", "Artifact Creature — Construct", "{3}", { power: "3", toughness: "2", oracleText: "Whenever this creature dies or another artifact you control is put into a graveyard from the battlefield, return to your hand target artifact card in your graveyard with lesser mana value." });

const growth = card("Grow Strong", "Sorcery", "{G}", { oracleText: "Put three +1/+1 counters on target creature." });
const battlegrowth = card("Battlegrowth", "Instant", "{G}", { oracleText: "Put a +1/+1 counter on target creature." });
const wilt = card("Wilt Away", "Sorcery", "{B}", { oracleText: "Put two -1/-1 counters on target creature." });
const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
const ponder = card("Peek", "Instant", "{U}", { oracleText: "Draw a card." });
const walker = card("Test Walker", "Legendary Planeswalker — Jace", "{2}{U}", { loyalty: "3", oracleText: "+1: Draw a card.\n−2: Draw two cards." });
const trinket = (mv: number, name = `Trinket ${mv}`) => card(name, "Artifact", mv ? `{${mv}}` : "", { cmc: mv });
const swampCard = card("Swamp", "Basic Land — Swamp");
const sprout = card("Sprout Token Maker", "Sorcery", "{G}", { oracleText: "Create a 1/1 green Saproling creature token." });

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  return plan!.reduce((x, a) => act(x, a), s);
};
const settle = (s: GameState) => {
  for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const nextAfter = (s: GameState, p: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(p) + 1) % 4]!;
function to(s: GameState, pid: PlayerId, zone: "graveyard" | "library" | "hand", def: CardDef, top = true) {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library[top ? "unshift" : "push"](id);
  else s.players[pid]![zone].push(id);
  return id;
}
const tokens = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === `${name} Token`).length;

describe("round 97, first cards", () => {
  it("parse", () => {
    supported(terrasymbiosis, nest, tethermage, inkshield, highTide, urza, etali, mizzix, ashaya, bloodletter, beseech, trawler);
    expect(compileCard(terrasymbiosis).triggers[0]).toMatchObject({ event: "permanentCountersPut", countersKind: "+1/+1", countersByYou: true });
    expect(compileCard(bloodletter).opponentsLoseDouble).toBe(true);
  });

  it("Terrasymbiosis: counters you put draw that many, only once each turn; an opponent's counters don't trigger it", () => {
    const { s: s0, ap, ids } = setup([growth, battlegrowth]);
    putOnBattlefield(s0, ap, terrasymbiosis);
    const b = putOnBattlefield(s0, ap, bear());
    const hand = s0.players[ap]!.hand.length;
    let s = cast(s0, ap, ids[0]!, [target(b)]);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3);
    // Done once this turn: it doesn't trigger again.
    s = settle(cast(s, ap, ids[1]!, [target(b)]));
    expect(s.pending).toBeNull();
    expect(s.objects[b]!.counters["+1/+1"]).toBe(4);
  });

  it("Terrasymbiosis: counters an opponent puts on your creature aren't yours", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextAfter(s0, ap);
    putOnBattlefield(s0, ap, terrasymbiosis);
    const b = putOnBattlefield(s0, ap, bear());
    const g = to(s0, opp, "hand", battlegrowth);
    for (const l of [card("Forest", "Basic Land — Forest")]) putOnBattlefield(s0, opp, l);
    let s = act(s0, { type: "passPriority", player: ap });
    s = run(s, planCast(s, opp, g, [target(b)]));
    s = settle(s);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    expect(s.pending).toBeNull();
    expect(s.triggerQueue).toHaveLength(0);
  });

  it("Nest of Scarabs: -1/-1 counters you put on any creature make that many Insects", () => {
    const { s: s0, ap, ids } = setup([wilt]);
    putOnBattlefield(s0, ap, nest);
    const theirs = putOnBattlefield(s0, nextAfter(s0, ap), card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" }));
    const s = settle(cast(s0, ap, ids[0]!, [target(theirs)]));
    expect(tokens(s, ap, "Insect")).toBe(2);
  });

  it("Inspired Tethermage: a planeswalker's + loyalty ability puts loyalty counters on it (a cost, CR 606.4)", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, tethermage);
    const w = putOnBattlefield(s0, ap, walker);
    s0.objects[w]!.counters.loyalty = 3;
    const s = settle(run(s0, planActivate(s0, ap, w, 0)));
    expect(s.objects[w]!.counters.loyalty).toBe(4);
    expect(s.objects[t]!.counters["+1/+1"]).toBe(1);
  });

  it("Inkshield prevents the combat damage dealt to you and makes an Inkling for each 1 prevented", () => {
    const { s: s0, ap } = setup([]);
    const opp = nextAfter(s0, ap);
    const giant = putOnBattlefield(s0, opp, card("Hill Giant", "Creature — Giant", "{3}{R}", { power: "3", toughness: "3" }));
    const ink = to(s0, ap, "hand", inkshield);
    let s = s0;
    // To the opponent's declare attackers step.
    for (let i = 0; i < 400 && !(s.activePlayer === opp && s.pending?.kind === "declareAttackers"); i++) {
      const pid = waitingOn(s)!;
      if (s.pending?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: pid, attacks: [] });
      else if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: pid, blocks: [] });
      else if (s.pending?.kind === "discardToHandSize") s = act(s, { type: "discard", player: pid, objectIds: s.players[pid]!.hand.slice(0, s.pending.count) });
      else s = act(s, { type: "passPriority", player: pid });
    }
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: giant, defender: ap }] });
    for (let i = 0; i < 20 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap) s.objects[id]!.tapped = false;
    s = run(s, planCast(s, ap, ink));
    const life = s.players[ap]!.life;
    for (let i = 0; i < 60 && s.step !== "endCombat"; i++) {
      const pid = waitingOn(s)!;
      s = act(s, s.pending?.kind === "declareBlockers" ? { type: "declareBlockers", player: pid, blocks: [] } : { type: "passPriority", player: pid });
    }
    expect(s.players[ap]!.life).toBe(life);
    expect(tokens(s, ap, "Inkling")).toBe(3);
  });

  it("High Tide: each Island tapped for mana adds an additional {U} this turn, then no more", () => {
    const { s: s0, ap, ids } = setup([highTide]);
    let s = cast(s0, ap, ids[0]!);
    const isl = s.battlefield.find((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped && s.cards[s.objects[id]!.cardId]!.name === "Island")!;
    s = act(s, { type: "activateMana", player: ap, objectId: isl, mana: "U" });
    expect(s.players[ap]!.manaPool.U).toBe(2);
    expect(s.manaTriggersThisTurn).toHaveLength(1);
    s = settle(s);
  });

  it("Urza: shuffle, exile the top card, and play it this turn without paying its mana cost", () => {
    const { s: s0, ap } = setup([]);
    const u = putOnBattlefield(s0, ap, urza);
    const lib = s0.players[ap]!.library;
    s0.players[ap]!.library = lib.filter((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Grizzly Bears").slice(0, 5);
    expect(compileCard(urza).activated).toHaveLength(1);
    let s = settle(run(s0, planActivate(s0, ap, u, 0)));
    const ex = s.players[ap]!.exile.find((id) => s.objects[id]!.mayPlay?.free);
    expect(ex).toBeDefined();
    const untapped = s.battlefield.filter((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped).length;
    s = settle(run(s, planCast(s, ap, ex!)));
    expect(s.objects[ex!]!.zone).toBe("battlefield");
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && !s.objects[id]!.tapped).length).toBe(untapped + 1);
  });

  it("Etali, Primal Conqueror: each player exiles down to a nonland card; cast any of them free", () => {
    const { s: s0, ap, ids } = setup([etali]);
    const opp = nextAfter(s0, ap);
    const peek = to(s0, opp, "library", ponder);
    to(s0, opp, "library", card("Forest", "Basic Land — Forest"));
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 40 && !(s.pending?.kind === "chooseOption" && s.pending.what === "castFromAmong"); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong" });
    const options = s.pending!.kind === "chooseOption" ? s.pending.options : [];
    expect(options).toContain(peek);
    // Each other player exiled their land too, but only nonland cards are offered.
    expect(options.every((id) => id === "none" || !objIsType(s, s.objects[id]!, "Land"))).toBe(true);
    expect(s.objects[peek]!.zone).toBe("exile");
    expect(s.players[opp]!.exile.length).toBe(2);
    s = act(s, { type: "chooseOption", player: ap, choice: peek });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: peek });
    s = run(s, planCast(s, ap, peek));
    expect(s.stack.some((x) => x.objectId === peek)).toBe(true);
  });

  it("Mizzix's Mastery: a copy of the target card is cast free; the card stays exiled", () => {
    const { s: s0, ap, ids } = setup([mizzix]);
    const d = to(s0, ap, "graveyard", divination);
    const hand = s0.players[ap]!.hand.length;
    let s = run(s0, planCast(s0, ap, ids[0]!, [target(d)]));
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong", options: [d, "none"] });
    s = act(s, { type: "chooseOption", player: ap, choice: d });
    expect(s.pending?.kind).toBe("castFree");
    const copy = s.pending!.kind === "castFree" ? s.pending.objectId : "";
    expect(copy).not.toBe(d);
    s = run(s, planCast(s, ap, copy));
    s = settle(s);
    expect(s.objects[d]!.zone).toBe("exile");
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    expect(s.objects[copy]).toBeUndefined();
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
  });

  it("Mizzix's Mastery overloaded: a copy of each, cast in the order you choose", () => {
    const { s: s0, ap, ids } = setup([mizzix]);
    for (const l of [card("Mountain", "Basic Land — Mountain"), card("Mountain", "Basic Land — Mountain")]) putOnBattlefield(s0, ap, l);
    const d = to(s0, ap, "graveyard", divination);
    const p = to(s0, ap, "graveyard", ponder);
    const hand = s0.players[ap]!.hand.length;
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { alt: "overload" }));
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong" });
    expect(s.pending!.kind === "chooseOption" && s.pending.options).toEqual(expect.arrayContaining([d, p, "none"]));
    s = act(s, { type: "chooseOption", player: ap, choice: p });
    s = run(s, planCast(s, ap, s.pending!.kind === "castFree" ? s.pending.objectId : ""));
    expect(s.pending).toMatchObject({ kind: "chooseOption", options: [d, "none"] });
    s = act(s, { type: "chooseOption", player: ap, choice: d });
    s = run(s, planCast(s, ap, s.pending!.kind === "castFree" ? s.pending.objectId : ""));
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3);
    expect([d, p].map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile"]);
  });

  it("Ashaya: nontoken creatures you control are Forest lands that tap for {G}, and count for its power", () => {
    const { s: s0, ap, ids } = setup([sprout]);
    const a = putOnBattlefield(s0, ap, ashaya);
    const b = putOnBattlefield(s0, ap, bear());
    let s = cast(s0, ap, ids[0]!);
    const sap = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    expect(objIsType(s, s.objects[b]!, "Land")).toBe(true);
    expect(objIsType(s, s.objects[sap]!, "Land")).toBe(false);
    const lands = s.battlefield.filter((id) => s.objects[id]!.controller === ap && objIsType(s, s.objects[id]!, "Land")).length;
    expect(power(s, s.objects[a]!)).toBe(lands);
    expect(toughness(s, s.objects[a]!)).toBe(lands);
    s = act(s, { type: "activateMana", player: ap, objectId: b, mana: "G" });
    expect(s.objects[b]!.tapped).toBe(true);
    expect(s.players[ap]!.manaPool.G).toBe(1);
  });

  it("Ashaya: a creature that just came under your control still can't tap for mana (CR 302.6)", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, ashaya);
    const b = putOnBattlefield(s, ap, bear(), { sick: true });
    expect(() => act(s, { type: "activateMana", player: ap, objectId: b, mana: "G" })).toThrow();
  });

  it("Bloodletter: opponents lose twice the life during your turn, damage included, but lifelink gains only the damage", () => {
    const { s: s0, ap, ids } = setup([bolt]);
    putOnBattlefield(s0, ap, bloodletter);
    const opp = nextAfter(s0, ap);
    const life = s0.players[opp]!.life;
    const s = settle(cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    expect(s.players[opp]!.life).toBe(life - 6);
  });

  it("Bloodletter: not during another player's turn, and not for you", () => {
    const { s: s0, ap, ids } = setup([bolt]);
    const opp = nextAfter(s0, ap);
    putOnBattlefield(s0, opp, bloodletter);
    const life = s0.players[opp]!.life;
    const mine = s0.players[ap]!.life;
    let s = settle(cast(s0, ap, ids[0]!, [{ kind: "player", id: opp }]));
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.players[ap]!.life).toBe(mine);
  });

  it("Beseech the Mirror bargained: cast the found card free if its mana value is 4 or less", () => {
    const { s: s0, ap, ids } = setup([beseech]);
    putOnBattlefield(s0, ap, swampCard);
    const art = putOnBattlefield(s0, ap, trinket(1));
    const target4 = to(s0, ap, "library", bear({ name: "Library Bear" }), false);
    let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { bargain: art }));
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, min: 1, max: 1 });
    s = act(s, { type: "searchLibrary", player: ap, found: [target4] });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: target4 });
    // Face down in exile: hidden from the others.
    expect(s.objects[target4]!.hiddenExile?.seen).toEqual([ap]);
    s = settle(run(s, planCast(s, ap, target4)));
    expect(s.objects[target4]!.zone).toBe("battlefield");
  });

  it("Beseech the Mirror not bargained: the card goes to your hand", () => {
    const { s: s0, ap, ids } = setup([beseech]);
    putOnBattlefield(s0, ap, swampCard);
    const found = to(s0, ap, "library", bear({ name: "Library Bear" }), false);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "searchLibrary", player: ap, found: [found] });
    s = settle(s);
    expect(s.pending).toBeNull();
    expect(s.objects[found]!.zone).toBe("hand");
  });

  it("Scrap Trawler: another artifact goes to the graveyard; return one with lesser mana value", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, trawler);
    const two = putOnBattlefield(s0, ap, trinket(2, "Dying Trinket"));
    const one = to(s0, ap, "graveyard", trinket(1));
    const zero = to(s0, ap, "graveyard", trinket(0));
    const two2 = to(s0, ap, "graveyard", trinket(2));
    const three = to(s0, ap, "graveyard", trinket(3));
    moveObject(s0, two, "graveyard");
    let s = s0;
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending?.kind).toBe("chooseTargets");
    const spec = s.pending!.kind === "chooseTargets" ? s.pending.specs[0]! : null;
    const offered = legalTargets(s, spec!, ap).map((t) => ("id" in t ? t.id : ""));
    expect(offered).toEqual(expect.arrayContaining([one, zero]));
    expect(offered).not.toContain(two2);
    expect(offered).not.toContain(three);
    s = act(s, { type: "chooseTargets", player: ap, targets: [target(one)] });
    s = settle(s);
    expect(s.objects[one]!.zone).toBe("hand");
  });

  it("Scrap Trawler dying itself returns one with mana value less than 3", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, trawler);
    const two = to(s0, ap, "graveyard", trinket(2));
    const three = to(s0, ap, "graveyard", trinket(3));
    moveObject(s0, t, "graveyard");
    let s = s0;
    for (let i = 0; i < 10 && s.pending?.kind !== "chooseTargets"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const spec = s.pending!.kind === "chooseTargets" ? s.pending.specs[0]! : null;
    const offered = legalTargets(s, spec!, ap).map((x) => ("id" in x ? x.id : ""));
    expect(offered).toContain(two);
    expect(offered).not.toContain(three);
  });
});
