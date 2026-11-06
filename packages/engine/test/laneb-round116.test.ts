// Lane B round B116: Celestial Kirin and Skyfire Kirin ("with that spell's mana value" in a cast trigger), Ichorid (a
// graveyard upkeep trigger paid by exiling another black creature card), Nether Shadow ("three or more creature cards above
// it"), Rowdy Crew (two cards discarded at random that share a card type), Cinderheart Giant (damage to a creature chosen at
// random, not targeted), Definitely Not a Turtle ("a land or legendary Turtle card"), Advice from the Fae (two cards if you
// control the most creatures), Petals of Insight (all three looked-at cards to the bottom, or draw three), Dawn Evangel ("if
// an Aura you controlled was attached to it"), Teferi's Response (counter an opponent's spell or ability that targets your
// land, destroying the ability's source).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { botActions, characteristics, controllerOf, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; questions of the players in `me` stop it, others the bots answer. */
const settle = (s: GameState, opts: { me?: PlayerId[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me?.includes(p.player)) return s;
    else if (p) for (const a of botActions(s, p.player)) s = act(s, a);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const next = (s: GameState, p: PlayerId, n = 1) => s.turnOrder[(s.turnOrder.indexOf(p) + n) % 4]!;
const zone = (s: GameState, id: string) => s.objects[id]!.zone;
/** Moves a new card for `def` from the battlefield into `pid`'s `zone` (on top of a library, or of a graveyard). */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "hand" | "graveyard" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Takes `pid`'s lands off the battlefield and leaves exactly `pool` to pay with. */
const poolOnly = (s: GameState, pid: PlayerId, pool: Partial<Record<"W" | "U" | "B" | "R" | "G" | "C", number>>) => {
  for (const id of s.battlefield.filter((x) => s.objects[x]!.controller === pid && characteristics(s, s.objects[x]!).types.includes("Land"))) {
    s.battlefield.splice(s.battlefield.indexOf(id), 1);
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  s.players[pid]!.manaPool = { ...s.players[pid]!.manaPool, ...pool };
  invalidateCharacteristics(s);
};
/** Passes priority (bots answering their questions) until `pid` has a question of `kind`. */
const toPending = (s: GameState, pid: PlayerId, kind: string) => {
  for (let i = 0; i < 300 && !(s.pending?.kind === kind && s.pending.player === pid); i++) {
    const p = s.pending;
    if (p && p.player !== pid) for (const a of botActions(s, p.player)) s = act(s, a);
    else if (p) throw new Error(`${pid} was asked ${p.kind}, not ${kind}`);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  if (!(s.pending?.kind === kind && s.pending.player === pid)) throw new Error(`no ${kind} for ${pid}`);
  return s;
};
const toUpkeep = (s: GameState, pid: PlayerId) => passUntil(passUntil(s, "end", s.activePlayer), "upkeep", pid);
/** Empties `pid`'s hand into exile, so no card is discarded to hand size into the graveyard on the way. */
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of s.players[pid]!.hand) {
    s.objects[id]!.zone = "exile";
    s.players[pid]!.exile.push(id);
  }
  s.players[pid]!.hand = [];
};

// Real oracle text (Scryfall).
const celestial = (): CardDef => ({"oracleId":"a5f7967e-d357-4ab6-96ac-77262864f280","name":"Celestial Kirin","manaCost":"{2}{W}{W}","cmc":4,"typeLine":"Legendary Creature — Kirin Spirit","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Kirin","Spirit"],"oracleText":"Flying\nWhenever you cast a Spirit or Arcane spell, destroy all permanents with that spell's mana value.","power":"3","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":["Flying"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const skyfire = (): CardDef => ({"oracleId":"169c468e-0e17-450b-8954-df47d78ad8f8","name":"Skyfire Kirin","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Legendary Creature — Kirin Spirit","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Kirin","Spirit"],"oracleText":"Flying\nWhenever you cast a Spirit or Arcane spell, you may gain control of target creature with that spell's mana value until end of turn.","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":["Flying"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const ichorid = (): CardDef => ({"oracleId":"5261ba70-b641-461d-9d9f-fce17764ad67","name":"Ichorid","manaCost":"{3}{B}","cmc":4,"typeLine":"Creature — Horror","supertypes":[],"types":["Creature"],"subtypes":["Horror"],"oracleText":"Haste\nAt the beginning of the end step, sacrifice this creature.\nAt the beginning of your upkeep, if this card is in your graveyard, you may exile a black creature card other than this card from your graveyard. If you do, return this card to the battlefield.","power":"3","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Haste"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const shadow = (): CardDef => ({"oracleId":"c358b9e2-524c-434b-b3fa-74d2aa6d1df7","name":"Nether Shadow","manaCost":"{B}{B}","cmc":2,"typeLine":"Creature — Spirit","supertypes":[],"types":["Creature"],"subtypes":["Spirit"],"oracleText":"Haste\nAt the beginning of your upkeep, if this card is in your graveyard with three or more creature cards above it, you may put this card onto the battlefield.","power":"1","toughness":"1","colors":["B"],"colorIdentity":["B"],"keywords":["Haste"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const crew = (): CardDef => ({"oracleId":"3d1d30e1-8934-4451-9b32-c6db2167fc2e","name":"Rowdy Crew","manaCost":"{2}{R}{R}","cmc":4,"typeLine":"Creature — Human Pirate","supertypes":[],"types":["Creature"],"subtypes":["Human","Pirate"],"oracleText":"Trample\nWhen this creature enters, draw three cards, then discard two cards at random. If two cards that share a card type are discarded this way, put two +1/+1 counters on this creature.","power":"3","toughness":"3","colors":["R"],"colorIdentity":["R"],"keywords":["Trample"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const cinderheart = (): CardDef => ({"oracleId":"13efba9f-aedd-4ec0-a387-60c09b887341","name":"Cinderheart Giant","manaCost":"{5}{R}{R}","cmc":7,"typeLine":"Creature — Giant Berserker","supertypes":[],"types":["Creature"],"subtypes":["Giant","Berserker"],"oracleText":"Trample\nWhen this creature dies, it deals 7 damage to a creature an opponent controls chosen at random.","power":"7","toughness":"6","colors":["R"],"colorIdentity":["R"],"keywords":["Trample"],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const turtle = (): CardDef => ({"oracleId":"3d8dfd57-7d26-4a3b-a9c3-33077c85b3db","name":"Definitely Not a Turtle","manaCost":"{3}","cmc":3,"typeLine":"Creature — Mutant Ninja Turtle","supertypes":[],"types":["Creature"],"subtypes":["Mutant","Ninja","Turtle"],"oracleText":"When this creature dies, look at the top six cards of your library. You may reveal a land or legendary Turtle card from among them and put it into your hand. Put the rest on the bottom of your library in a random order.","power":"3","toughness":"2","colors":[],"colorIdentity":[],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const advice = (): CardDef => ({"oracleId":"5063f015-bd1c-4e14-9888-63e202be2ac8","name":"Advice from the Fae","manaCost":"{2/U}{2/U}{2/U}","cmc":6,"typeLine":"Sorcery","supertypes":[],"types":["Sorcery"],"subtypes":[],"oracleText":"({2/U} can be paid with any two mana or with {U}. This card's mana value is 6.)\nLook at the top five cards of your library. If you control more creatures than each other player, put two of those cards into your hand. Otherwise, put one of them into your hand. Then put the rest on the bottom of your library in any order.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const petals = (): CardDef => ({"oracleId":"1eb88d87-e024-47fe-bd63-0eac69c106f6","name":"Petals of Insight","manaCost":"{4}{U}","cmc":5,"typeLine":"Sorcery — Arcane","supertypes":[],"types":["Sorcery"],"subtypes":["Arcane"],"oracleText":"Look at the top three cards of your library. You may put those cards on the bottom of your library in any order. If you do, return Petals of Insight to its owner's hand. Otherwise, draw three cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const evangel = (): CardDef => ({"oracleId":"4d6e38f6-480b-4f81-a5d4-342fc45e39b0","name":"Dawn Evangel","manaCost":"{2}{W}","cmc":3,"typeLine":"Enchantment Creature — Human Cleric","supertypes":[],"types":["Enchantment","Creature"],"subtypes":["Human","Cleric"],"oracleText":"Whenever a creature dies, if an Aura you controlled was attached to it, return target creature card with mana value 2 or less from your graveyard to your hand.","power":"2","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;
const response = (): CardDef => ({"oracleId":"b2faa8b6-e433-4171-9774-9170484530c4","name":"Teferi's Response","manaCost":"{1}{U}","cmc":2,"typeLine":"Instant","supertypes":[],"types":["Instant"],"subtypes":[],"oracleText":"Counter target spell or ability an opponent controls that targets a land you control. If a permanent's ability is countered this way, destroy that permanent.\nDraw two cards.","colors":["U"],"colorIdentity":["U"],"keywords":[],"commanderLegal":"legal","layout":"normal"}) as CardDef;

// Test cards.
const arcane = card("Test Arcane Insight", "Instant — Arcane", "{1}{U}", { cmc: 2, colors: ["U"], oracleText: "Draw a card." });
const arcaneX = card("Test Arcane Blast", "Sorcery — Arcane", "{X}{R}", { cmc: 1, colors: ["R"], oracleText: "Test Arcane Blast deals X damage to target player." });
const spirit = card("Test Spirit", "Creature — Spirit", "{1}{W}", { cmc: 2, power: "1", toughness: "1", colors: ["W"] });
const plainSpell = card("Test Plain Insight", "Instant", "{1}{U}", { cmc: 2, colors: ["U"], oracleText: "Draw a card." });
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { cmc: 3, power: "3", toughness: "3", colors: ["R"] });
const rock = card("Test Rock", "Artifact", "{2}", { cmc: 2 });
const zombie = card("Test Zombie", "Creature — Zombie", "{1}{B}", { cmc: 2, power: "2", toughness: "2", colors: ["B"] });
const redGob = card("Test Goblin", "Creature — Goblin", "{R}", { cmc: 1, power: "1", toughness: "1", colors: ["R"] });
const shot = card("Test Shot", "Sorcery", "{R}", { cmc: 1, colors: ["R"], oracleText: "Draw a card." });
const bolt = card("Test Bolt", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Test Bolt deals 1 damage to target creature." });
const wall = card("Test Wall", "Creature — Wall", "{1}{W}", { cmc: 2, power: "0", toughness: "8", colors: ["W"] });
const legendTurtle = card("Test Legendary Turtle", "Legendary Creature — Turtle", "{2}{G}", { cmc: 3, power: "2", toughness: "4", colors: ["G"], supertypes: ["Legendary"] });
const plainTurtle = card("Test Turtle", "Creature — Turtle", "{2}{G}", { cmc: 3, power: "2", toughness: "4", colors: ["G"] });
const isle = card("Test Island", "Land — Island");
const aura = card("Test Aura", "Enchantment — Aura", "{W}", { cmc: 1, colors: ["W"], oracleText: "Enchant creature\nEnchanted creature gets +1/+1." });
const doom = card("Test Doom", "Instant", "{B}", { cmc: 1, colors: ["B"], oracleText: "Destroy target creature." });
const quake = card("Test Land Shot", "Sorcery", "{R}", { cmc: 1, colors: ["R"], oracleText: "Destroy target land." });
const pinger = card("Test Land Pinger", "Artifact", "{1}", { cmc: 1, oracleText: "{T}: Tap target land." });

describe("Lane B round B116", () => {
  it("all eleven cards are supported", () => supported(celestial(), skyfire(), ichorid(), shadow(), crew(), cinderheart(), turtle(), advice(), petals(), evangel(), response()));

  it("Celestial Kirin: an Arcane spell destroys all permanents with its mana value, before the spell resolves", () => {
    let { s, ap, ids } = setup([arcane]);
    const opp = next(s, ap);
    putOnBattlefield(s, ap, celestial());
    const b1 = putOnBattlefield(s, opp, bear());
    const b2 = putOnBattlefield(s, ap, bear());
    const r = putOnBattlefield(s, next(s, ap, 2), rock);
    const o = putOnBattlefield(s, opp, ogre);
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    for (const id of [b1, b2, r]) expect(zone(s, id)).toBe("graveyard");
    expect(zone(s, o)).toBe("battlefield");
    // Lands have mana value 0: none destroyed.
    expect(s.battlefield.filter((id) => s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).types.includes("Land")).length).toBe(14);
  });

  it("Celestial Kirin: a Spirit creature spell counts too, and X is part of a spell's mana value on the stack (rulings)", () => {
    let { s, ap, ids } = setup([spirit, arcaneX]);
    const opp = next(s, ap);
    putOnBattlefield(s, ap, celestial());
    const b = putOnBattlefield(s, opp, bear());
    const o = putOnBattlefield(s, opp, ogre);
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(zone(s, b)).toBe("graveyard");
    expect(zone(s, o)).toBe("battlefield");
    // The Spirit was on the stack as its own trigger resolved: it entered afterwards.
    expect(zone(s, ids[0]!)).toBe("battlefield");
    // {X}{R} with X = 2 is mana value 3: the Ogre (and nothing with 2).
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp }], undefined, undefined, 2)));
    expect(zone(s, o)).toBe("graveyard");
    expect(zone(s, ids[0]!)).toBe("battlefield");
  });

  it("Celestial Kirin: a spell that's neither Spirit nor Arcane doesn't trigger it", () => {
    let { s, ap, ids } = setup([plainSpell]);
    putOnBattlefield(s, ap, celestial());
    const b = putOnBattlefield(s, next(s, ap), bear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(zone(s, b)).toBe("battlefield");
  });

  it("Skyfire Kirin: gain control of a creature with the spell's mana value until end of turn; others aren't legal targets", () => {
    let { s, ap, ids } = setup([arcane]);
    const opp = next(s, ap);
    putOnBattlefield(s, ap, skyfire());
    const b = putOnBattlefield(s, opp, bear());
    const o = putOnBattlefield(s, opp, ogre);
    s = run(s, planCast(s, ap, ids[0]!, []));
    s = toPending(s, ap, "chooseTargets");
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(o)] })).toThrow();
    s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(b)] });
    s = toPending(s, ap, "chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: [ap] });
    expect(controllerOf(s, s.objects[b]!)).toBe(ap);
    s = passUntil(s, "upkeep", next(s, ap));
    expect(controllerOf(s, s.objects[b]!)).toBe(opp);
  });

  it("Ichorid: at your upkeep, exile another black creature card from your graveyard to return it", () => {
    let { s, ap } = setup([]);
    emptyHand(s, ap);
    const ich = into(s, ap, ichorid(), "graveyard");
    const z = into(s, ap, zombie, "graveyard");
    into(s, ap, redGob, "graveyard");
    s = toUpkeep(s, ap);
    s = toPending(s, ap, "chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    // Only the black creature card other than Ichorid is offered.
    const p = s.pending;
    expect(p?.kind === "searchLibrary" && p.cards).toEqual([z]);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [z] }), { me: [ap] });
    expect(zone(s, z)).toBe("exile");
    expect(zone(s, ich)).toBe("battlefield");
    // It has haste, and is sacrificed at the beginning of the end step.
    s = passUntil(s, "end", ap);
    s = settle(s);
    expect(zone(s, ich)).toBe("graveyard");
  });

  it("Ichorid: with no other black creature card there, nothing happens", () => {
    let { s, ap } = setup([]);
    emptyHand(s, ap);
    const ich = into(s, ap, ichorid(), "graveyard");
    into(s, ap, redGob, "graveyard");
    s = toUpkeep(s, ap);
    s = settle(s, { me: [ap] });
    expect(s.pending?.kind === "chooseMay" && s.pending.player === ap).toBe(false);
    expect(zone(s, ich)).toBe("graveyard");
  });

  it("Ichorid: one that exiles another Ichorid stops that one's ability (rulings)", () => {
    let { s, ap } = setup([]);
    emptyHand(s, ap);
    const a = into(s, ap, ichorid(), "graveyard");
    const b = into(s, ap, ichorid(), "graveyard");
    s = toUpkeep(s, ap);
    s = toPending(s, ap, "chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    const p = s.pending;
    if (p?.kind !== "searchLibrary") throw new Error("no pick");
    expect(p.cards).toHaveLength(1);
    const other = p.cards[0]!;
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [other] }), { me: [ap] });
    const back = other === a ? b : a;
    expect(zone(s, other)).toBe("exile");
    expect(zone(s, back)).toBe("battlefield");
    expect(s.pending?.kind === "chooseMay" && s.pending.player === ap).toBe(false);
  });

  it("Nether Shadow: returns only with three or more creature cards put into the graveyard after it", () => {
    let { s, ap } = setup([]);
    emptyHand(s, ap);
    const ns = into(s, ap, shadow(), "graveyard");
    into(s, ap, zombie, "graveyard");
    into(s, ap, isle, "graveyard");
    into(s, ap, redGob, "graveyard");
    s = toUpkeep(s, ap);
    s = settle(s, { me: [ap] });
    expect(zone(s, ns)).toBe("graveyard");
    // A creature card under it doesn't count; a third one above it does.
    s.players[ap]!.graveyard.unshift(s.players[ap]!.graveyard.splice(s.players[ap]!.graveyard.indexOf(into(s, ap, ogre, "graveyard")), 1)[0]!);
    s = toUpkeep(s, ap);
    s = settle(s, { me: [ap] });
    expect(zone(s, ns)).toBe("graveyard");
    into(s, ap, ogre, "graveyard");
    s = toUpkeep(s, ap);
    s = toPending(s, ap, "chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), { me: [ap] });
    expect(zone(s, ns)).toBe("battlefield");
  });

  it("Rowdy Crew: two random discards that share a card type give it two +1/+1 counters", () => {
    let { s, ap, ids } = setup([crew()]);
    emptyHand(s, ap);
    s.objects[ids[0]!]!.zone = "hand";
    s.players[ap]!.hand = [ids[0]!];
    s.players[ap]!.exile = s.players[ap]!.exile.filter((id) => id !== ids[0]);
    s.players[ap]!.library = s.players[ap]!.library.filter((id) => characteristics(s, s.objects[id]!).types.includes("Land"));
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    // Three lands drawn: the two discarded share a card type.
    expect(s.players[ap]!.hand).toHaveLength(1);
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(2);
  });

  it("Rowdy Crew: two random discards with no card type in common give none", () => {
    let { s, ap, ids } = setup([crew()]);
    emptyHand(s, ap);
    s.objects[ids[0]!]!.zone = "hand";
    s.players[ap]!.hand = [ids[0]!];
    s.players[ap]!.exile = s.players[ap]!.exile.filter((id) => id !== ids[0]);
    // A land, a creature and a sorcery drawn: any two of them share no card type.
    const top = [into(s, ap, isle, "library"), into(s, ap, ogre, "library"), into(s, ap, shot, "library")];
    s = settle(run(s, planCast(s, ap, ids[0]!, [])));
    expect(s.players[ap]!.hand).toHaveLength(1);
    expect(top.filter((id) => zone(s, id) === "graveyard")).toHaveLength(2);
    expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Cinderheart Giant: dies, deals 7 damage to a creature an opponent controls chosen at random, hexproof included", () => {
    let { s, ap, ids } = setup([bolt]);
    const opp = next(s, ap);
    const g = putOnBattlefield(s, ap, cinderheart());
    s.objects[g]!.damage = 5;
    const w = putOnBattlefield(s, opp, card("Test Hexproof Wall", "Creature — Wall", "{1}{W}", { cmc: 2, power: "0", toughness: "8", keywords: ["Hexproof"], oracleText: "Hexproof" }));
    const mine = putOnBattlefield(s, ap, bear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(g)])));
    expect(zone(s, g)).toBe("graveyard");
    // The only creature an opponent controls: chosen though it has hexproof (rulings), and not yours.
    expect(s.objects[w]!.damage).toBe(7);
    expect(s.objects[mine]!.damage).toBe(0);
    expect(s.log.some((l) => /chooses Test Hexproof Wall at random/.test(l.text))).toBe(true);
  });

  it("Cinderheart Giant: with no creature an opponent controls, nothing is dealt damage", () => {
    let { s, ap, ids } = setup([bolt]);
    const g = putOnBattlefield(s, ap, cinderheart());
    s.objects[g]!.damage = 5;
    const mine = putOnBattlefield(s, ap, bear());
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(g)])));
    expect(zone(s, g)).toBe("graveyard");
    expect(zone(s, mine)).toBe("battlefield");
    expect(s.objects[mine]!.damage).toBe(0);
  });

  it("Definitely Not a Turtle: dies, offers a land or a legendary Turtle among the top six, the rest to the bottom", () => {
    let { s, ap, ids } = setup([bolt]);
    const t = putOnBattlefield(s, ap, turtle());
    s.objects[t]!.damage = 1;
    const plain = into(s, ap, plainTurtle, "library");
    const legend = into(s, ap, legendTurtle, "library");
    const z = into(s, ap, zombie, "library");
    const l = into(s, ap, isle, "library");
    const z2 = into(s, ap, zombie, "library");
    const z3 = into(s, ap, zombie, "library");
    s = run(s, planCast(s, ap, ids[0]!, [tgt(t)]));
    s = toPending(s, ap, "searchLibrary");
    const p = s.pending;
    if (p?.kind !== "searchLibrary") throw new Error("no pick");
    expect([...p.cards].sort()).toEqual([legend, l].sort());
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [legend] }), { me: [ap] });
    expect(zone(s, legend)).toBe("hand");
    const lib = s.players[ap]!.library;
    expect(lib.slice(-5).sort()).toEqual([plain, z, l, z2, z3].sort());
  });

  it("Advice from the Fae: two cards with more creatures than each other player, one otherwise", () => {
    let { s, ap, ids } = setup([advice(), advice()]);
    const opp = next(s, ap);
    putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, opp, bear());
    const hand = s.players[ap]!.hand.length;
    s = run(s, planCast(s, ap, ids[0]!, []));
    s = toPending(s, ap, "searchLibrary");
    let p = s.pending;
    expect(p?.kind === "searchLibrary" && p.max).toBe(2);
    if (p?.kind !== "searchLibrary") throw new Error("no pick");
    s = act(s, { type: "searchLibrary", player: ap, found: p.cards.slice(0, 2) });
    s = settle(s, { me: [ap] });
    if (s.pending?.kind === "arrangeTop") s = settle(act(s, { type: "arrangeTop", player: ap, top: s.pending.cards, away: [] }), { me: [ap] });
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
    // Tied: one card only (rulings).
    putOnBattlefield(s, opp, bear());
    s = run(s, planCast(s, ap, ids[1]!, []));
    s = toPending(s, ap, "searchLibrary");
    p = s.pending;
    expect(p?.kind === "searchLibrary" && p.max).toBe(1);
  });

  it("Petals of Insight: put the three looked-at cards on the bottom and it returns to your hand", () => {
    let { s, ap, ids } = setup([petals()]);
    const top = s.players[ap]!.library.slice(0, 3);
    s = run(s, planCast(s, ap, ids[0]!, []));
    s = toPending(s, ap, "arrangeTop");
    const look = s.pending;
    expect(look?.kind === "arrangeTop" && look.how).toBe("look");
    expect(look?.kind === "arrangeTop" && look.cards).toEqual(top);
    s = act(s, { type: "arrangeTop", player: ap, top, away: [] });
    s = toPending(s, ap, "chooseMay");
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    // Ordered by you (CR 401.4).
    expect(s.pending?.kind === "arrangeTop" && s.pending.how).toBe("bottom");
    const order = [top[2]!, top[0]!, top[1]!];
    s = settle(act(s, { type: "arrangeTop", player: ap, top: order, away: [] }), { me: [ap] });
    expect(s.players[ap]!.library.slice(-3)).toEqual(order);
    expect(zone(s, ids[0]!)).toBe("hand");
    expect(s.players[ap]!.graveyard).not.toContain(ids[0]);
  });

  it("Petals of Insight: keep them on top and draw those three cards instead", () => {
    let { s, ap, ids } = setup([petals()]);
    const top = s.players[ap]!.library.slice(0, 3);
    s = run(s, planCast(s, ap, ids[0]!, []));
    s = toPending(s, ap, "arrangeTop");
    s = act(s, { type: "arrangeTop", player: ap, top, away: [] });
    s = toPending(s, ap, "chooseMay");
    s = settle(act(s, { type: "chooseMay", player: ap, yes: false }), { me: [ap] });
    for (const id of top) expect(zone(s, id)).toBe("hand");
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });

  it("Dawn Evangel: a creature dies with your Aura on it, any player's: return a creature card with mana value 2 or less", () => {
    let { s, ap, ids } = setup([doom]);
    const opp = next(s, ap);
    putOnBattlefield(s, ap, evangel());
    const g = into(s, ap, redGob, "graveyard");
    const b = putOnBattlefield(s, opp, bear({ toughness: "1" }));
    const a = putOnBattlefield(s, ap, aura);
    s.objects[a]!.attachedTo = b;
    invalidateCharacteristics(s);
    s = run(s, planCast(s, ap, ids[0]!, [tgt(b)]));
    s = toPending(s, ap, "chooseTargets");
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [tgt(g)] }), { me: [ap] });
    expect(zone(s, b)).toBe("graveyard");
    expect(zone(s, g)).toBe("hand");
  });

  it("Dawn Evangel: not for a creature with no Aura, or only another player's Aura", () => {
    let { s, ap, ids } = setup([doom, doom]);
    const opp = next(s, ap);
    putOnBattlefield(s, ap, evangel());
    const g = into(s, ap, redGob, "graveyard");
    const b1 = putOnBattlefield(s, opp, bear({ toughness: "1" }));
    const b2 = putOnBattlefield(s, opp, bear({ toughness: "1" }));
    const a = putOnBattlefield(s, opp, aura);
    s.objects[a]!.attachedTo = b2;
    invalidateCharacteristics(s);
    s = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b1)])), { me: [ap] });
    s = settle(run(s, planCast(s, ap, ids[1]!, [tgt(b2)])), { me: [ap] });
    expect(zone(s, b1)).toBe("graveyard");
    expect(zone(s, b2)).toBe("graveyard");
    expect(zone(s, g)).toBe("graveyard");
  });

  it("Teferi's Response: counters an opponent's spell that targets your land, then you draw two", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const land = s.battlefield.find((id) => s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).types.includes("Land"))!;
    s = passUntil(s, "main1", opp);
    const q = into(s, opp, quake, "hand");
    const r = into(s, ap, response(), "hand");
    s.players[opp]!.manaPool = { ...s.players[opp]!.manaPool, R: 1 };
    s = run(s, planCast(s, opp, q, [tgt(land)]));
    for (let i = 0; i < 10 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const stackId = s.stack.at(-1)!.id;
    const hand = s.players[ap]!.hand.length;
    s = settle(run(s, planCast(s, ap, r, [{ kind: "stack", id: stackId }])));
    expect(zone(s, q)).toBe("graveyard");
    expect(zone(s, land)).toBe("battlefield");
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
  });

  it("Teferi's Response: an ability is countered and its permanent destroyed; your own spells and other targets aren't legal", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const land = s.battlefield.find((id) => s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).types.includes("Land"))!;
    const pg = putOnBattlefield(s, opp, pinger);
    s = passUntil(s, "main1", opp);
    const r = into(s, ap, response(), "hand");
    s = run(s, planActivate(s, opp, pg, 0, [tgt(land)]));
    for (let i = 0; i < 10 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const stackId = s.stack.at(-1)!.id;
    s = settle(run(s, planCast(s, ap, r, [{ kind: "stack", id: stackId }])));
    expect(s.stack).toHaveLength(0);
    expect(zone(s, pg)).toBe("graveyard");
    expect(s.objects[land]!.tapped).toBeFalsy();
  });

  it("Teferi's Response: a spell that targets an opponent's land, or a creature, can't be targeted", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const theirLand = putOnBattlefield(s, opp, isle);
    const w = putOnBattlefield(s, ap, wall);
    s = passUntil(s, "main1", opp);
    const q = into(s, opp, quake, "hand");
    const bl = into(s, opp, bolt, "hand");
    const r = into(s, ap, response(), "hand");
    s.players[opp]!.manaPool = { ...s.players[opp]!.manaPool, R: 2 };
    s = run(s, planCast(s, opp, q, [tgt(theirLand)]));
    for (let i = 0; i < 10 && waitingOn(s) !== opp; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planCast(s, opp, bl, [tgt(w)]));
    for (let i = 0; i < 10 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    for (const item of s.stack) expect(planCast(s, ap, r, [{ kind: "stack", id: item.id }])).toBeNull();
  });
});
