// Round 93, more popular cards: Sphere of Safety and Collective Restraint (attack taxes counted now, Sphere's for your
// planeswalkers too, CR 508.1g-h), Archivist of Oghma (an opponent searching their own library, rulings), Puresteel
// Paladin (Equipment you control have equip {0}), Emry (cast that artifact card from your graveyard this turn) and
// Mangara / Everett K. Ross (an opponent attacking you with two or more creatures; Mangara's intervening if, CR 603.4).

import { describe, expect, it } from "vitest";
import { act, activate, bear, card, passAll, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { abilitiesOf, attackTax, graveyardWays, isFullySupported, parseManaCost, planActivate, planCast, planMana, waitingOn, type Action, type GameState, type PlayerId } from "../src";

// Real oracle text (Scryfall).
const sphere = card("Sphere of Safety", "Enchantment", "{4}{W}", { oracleText: "Creatures can't attack you or planeswalkers you control unless their controller pays {X} for each of those creatures, where X is the number of enchantments you control." });
const restraint = card("Collective Restraint", "Enchantment", "{3}{U}", { oracleText: "Domain — Creatures can't attack you unless their controller pays {X} for each creature they control that's attacking you, where X is the number of basic land types among lands you control." });
const archivist = card("Archivist of Oghma", "Creature — Halfling Cleric", "{1}{W}", { power: "2", toughness: "2", keywords: ["Flash"], oracleText: "Flash\nWhenever an opponent searches their library, you gain 1 life and draw a card." });
const paladin = card("Puresteel Paladin", "Creature — Human Knight", "{W}{W}", { power: "2", toughness: "2", keywords: ["Metalcraft"], oracleText: "Whenever an Equipment you control enters, you may draw a card.\nMetalcraft — Equipment you control have equip {0} as long as you control three or more artifacts." });
const emry = card("Emry, Lurker of the Loch", "Legendary Creature — Merfolk Wizard", "{2}{U}", { power: "1", toughness: "2", keywords: ["Affinity", "Mill"], oracleText: "Affinity for artifacts (This spell costs {1} less to cast for each artifact you control.)\nWhen Emry enters, mill four cards.\n{T}: Choose target artifact card in your graveyard. You may cast that card this turn. (You still pay its costs. Timing rules still apply.)" });
const mangara = card("Mangara, the Diplomat", "Legendary Creature — Human Cleric", "{3}{W}", { power: "2", toughness: "4", keywords: ["Lifelink"], oracleText: "Lifelink\nWhenever an opponent attacks with creatures, if two or more of those creatures are attacking you and/or planeswalkers you control, draw a card.\nWhenever an opponent casts their second spell each turn, draw a card." });
const tomik = card("Tomik, Wielder of Law", "Legendary Creature — Human Advisor", "{1}{W}{B}", { power: "2", toughness: "4", keywords: ["Flying", "Affinity", "Vigilance"], oracleText: "Affinity for planeswalkers (This spell costs {1} less to cast for each planeswalker you control.)\nFlying, vigilance\nWhenever an opponent attacks with creatures, if two or more of those creatures are attacking you and/or planeswalkers you control, that opponent loses 3 life and you draw a card." });
const everett = card("Everett K. Ross, Hapless Attaché", "Legendary Creature — Human Advisor", "{2}{W}", { power: "1", toughness: "3", oracleText: "Commander creatures you control get +1/+1 and have lifelink.\nWhenever an opponent attacks you with two or more creatures, draw a card." });
const wilds = card("Evolving Wilds", "Land", "", { oracleText: "{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle." });
const pact = card("Test Enchantment", "Enchantment", "{1}");
const vraska = card("Vraska, Regal Gorgon", "Legendary Planeswalker — Vraska", "{5}{B}{G}", { loyalty: "5", oracleText: "+2: Put a +1/+1 counter on up to one target creature. That creature gains menace until end of turn.\n−3: Destroy target creature.\n−10: For each creature card in your graveyard, put a +1/+1 counter on each creature you control." });
const sword = card("Bonesplitter", "Artifact — Equipment", "{1}", { oracleText: "Equipped creature gets +2/+0.\nEquip {1}" });
const mace = card("Heavy Mace", "Artifact — Equipment", "{1}", { oracleText: "Equipped creature gets +1/+0.\nEquip {4}" });
const stone = card("Mind Stone", "Artifact", "{2}", { oracleText: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." });
const plainsCard = card("Plains", "Basic Land — Plains");
const islandCard = card("Island", "Basic Land — Island");

const settle = (s: GameState) => {
  for (let i = 0; i < 40 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  expect(plan).not.toBeNull();
  for (const a of plan!) s = act(s, a);
  return s;
};
const hand = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.length;

describe("Sphere of Safety, Collective Restraint", () => {
  it("parse", () => {
    for (const d of [sphere, restraint]) expect(isFullySupported(d), d.name).toBe(true);
  });

  it("Sphere: {X} per creature attacking you or your planeswalkers, X the enchantments you control, counted now", () => {
    const { s: s0, ap, opp } = setup([]);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    putOnBattlefield(s0, opp, sphere);
    putOnBattlefield(s0, opp, pact);
    const v = putOnBattlefield(s0, opp, vraska);
    s0.objects[v]!.counters.loyalty = 5;
    const [b1, b2, b3] = [0, 1, 2].map((i) => putOnBattlefield(s0, ap, bear({ name: `Bear ${i}` })));
    const s = passUntil(s0, "declareAttackers", ap);
    const attacks = [
      { attacker: b1!, defender: opp },
      { attacker: b2!, defender: opp, planeswalker: v },
      { attacker: b3!, defender: third },
    ];
    expect(attackTax(s, attacks)).toBe(4);
    expect(() => act(s, { type: "declareAttackers", player: ap, attacks })).toThrow(/costs \{4\}/);
    const after = run(s, [...planMana(s, ap, parseManaCost("{4}"))!, { type: "declareAttackers", player: ap, attacks }]);
    expect(after.objects[b2!]!.attacking).toBe(opp);
    // A third enchantment: {3} each.
    putOnBattlefield(s, opp, pact);
    expect(attackTax(s, attacks)).toBe(6);
  });

  it("Collective Restraint: X is the basic land types among its controller's lands; not their planeswalkers", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, restraint);
    putOnBattlefield(s0, opp, plainsCard);
    putOnBattlefield(s0, opp, islandCard);
    const v = putOnBattlefield(s0, opp, vraska);
    s0.objects[v]!.counters.loyalty = 5;
    const b1 = putOnBattlefield(s0, ap, bear());
    const s = passUntil(s0, "declareAttackers", ap);
    const forests = s.battlefield.filter((id) => s.objects[id]!.controller === opp && s.cards[s.objects[id]!.cardId]!.name === "Forest").length;
    expect(attackTax(s, [{ defender: opp }])).toBe(forests ? 3 : 2);
    expect(attackTax(s, [{ defender: opp, planeswalker: v }])).toBe(0);
  });
});

describe("Archivist of Oghma", () => {
  it("parse", () => expect(isFullySupported(archivist)).toBe(true));

  it("an opponent searching their library: you gain 1 life and draw; your own search doesn't", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, archivist);
    const w = putOnBattlefield(s0, ap, wilds);
    const life = s0.players[opp]!.life;
    const cards = hand(s0, opp);
    let s = run(s0, planActivate(s0, ap, w, 0));
    s = passAll(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = act(s, { type: "searchLibrary", player: ap, found: s.pending!.kind === "searchLibrary" ? s.pending.cards.slice(0, 1) : [] });
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life + 1);
    expect(hand(s, opp)).toBe(cards + 1);
    // The Archivist's controller searching: nothing.
    const mine = putOnBattlefield(s, opp, wilds);
    s = act(s, { type: "passPriority", player: ap });
    s = run(s, planActivate(s, opp, mine, 0));
    s = passAll(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp });
    s = settle(act(s, { type: "searchLibrary", player: opp, found: [] }));
    expect(s.players[opp]!.life).toBe(life + 1);
    expect(hand(s, opp)).toBe(cards + 1);
  });
});

describe("Puresteel Paladin", () => {
  it("parse", () => expect(isFullySupported(paladin)).toBe(true));

  it("with three or more artifacts, Equipment you control have equip {0} too", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, paladin);
    const m = putOnBattlefield(s0, ap, mace);
    const b = putOnBattlefield(s0, ap, bear());
    const equips = (s: GameState) => abilitiesOf(s, s.objects[m]!).activated.filter((a) => a.equip).map((a) => a.manaCost);
    putOnBattlefield(s0, ap, sword);
    expect(equips(s0)).toEqual(["{4}"]);
    putOnBattlefield(s0, ap, stone);
    expect(equips(s0)).toEqual(["{4}", "{0}"]);
    const untapped = s0.battlefield.filter((id) => !s0.objects[id]!.tapped).length;
    const s = settle(activate(s0, ap, m, 1, [target(b)]));
    expect(s.objects[m]!.attachedTo).toBe(b);
    expect(s.battlefield.filter((id) => !s.objects[id]!.tapped).length).toBe(untapped);
  });
});

describe("Emry, Lurker of the Loch", () => {
  it("parse", () => expect(isFullySupported(emry)).toBe(true));

  it("{T}: you may cast that artifact card from your graveyard this turn, paying its costs", () => {
    const { s: s0, ap, ids } = setup([stone]);
    const e = putOnBattlefield(s0, ap, emry);
    const p = s0.players[ap]!;
    p.hand.splice(p.hand.indexOf(ids[0]!), 1);
    p.graveyard.push(ids[0]!);
    s0.objects[ids[0]!]!.zone = "graveyard";
    expect(graveyardWays(s0, s0.objects[ids[0]!]!)).toEqual([]);
    let s = settle(activate(s0, ap, e, 0, [target(ids[0]!)]));
    expect(graveyardWays(s, s.objects[ids[0]!]!).map((g) => g.kind)).toEqual(["permission"]);
    s = settle(passAll(run(s, planCast(s, ap, ids[0]!, undefined, undefined, undefined, undefined, { via: "permission" }))));
    expect(s.objects[ids[0]!]!.zone).toBe("battlefield");
  });

  it("the permission ends with the turn", () => {
    const { s: s0, ap, ids } = setup([stone]);
    const e = putOnBattlefield(s0, ap, emry);
    const p = s0.players[ap]!;
    p.hand.splice(p.hand.indexOf(ids[0]!), 1);
    p.graveyard.push(ids[0]!);
    s0.objects[ids[0]!]!.zone = "graveyard";
    let s = settle(activate(s0, ap, e, 0, [target(ids[0]!)]));
    const next = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    s = passUntil(s, "upkeep", next);
    expect(graveyardWays(s, s.objects[ids[0]!]!)).toEqual([]);
  });
});

describe("Mangara, Tomik, Everett K. Ross", () => {
  it("parse", () => {
    for (const d of [mangara, tomik, everett]) expect(isFullySupported(d), d.name).toBe(true);
  });

  const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId; planeswalker?: string }[]) => act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks });

  it("Mangara: one at you and one at your planeswalker is two; Everett counts only you", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, mangara);
    putOnBattlefield(s0, opp, everett);
    const v = putOnBattlefield(s0, opp, vraska);
    s0.objects[v]!.counters.loyalty = 5;
    const [b1, b2] = [0, 1].map((i) => putOnBattlefield(s0, ap, bear({ name: `Bear ${i}` })));
    const cards = hand(s0, opp);
    const s = settle(attack(s0, ap, [{ attacker: b1!, defender: opp }, { attacker: b2!, defender: opp, planeswalker: v }]));
    expect(hand(s, opp)).toBe(cards + 1);
    expect(s.log.some((l) => /Mangara/.test(l.text) && /draw/.test(l.text))).toBe(true);
  });

  it("Everett: two attacking you; one creature, or attackers at another player, don't count", () => {
    const { s: s0, ap, opp } = setup([]);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    putOnBattlefield(s0, opp, everett);
    const [b1, b2, b3] = [0, 1, 2].map((i) => putOnBattlefield(s0, ap, bear({ name: `Bear ${i}` })));
    const cards = hand(s0, opp);
    let s = settle(attack(s0, ap, [{ attacker: b1!, defender: opp }, { attacker: b2!, defender: third }, { attacker: b3!, defender: third }]));
    expect(hand(s, opp)).toBe(cards);
    s = settle(attack(s0, ap, [{ attacker: b1!, defender: opp }, { attacker: b2!, defender: opp }]));
    expect(hand(s, opp)).toBe(cards + 1);
  });

  it("Tomik: that opponent loses 3 life; removed from combat before it resolves, it does nothing (CR 603.4)", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, tomik);
    const [b1, b2] = [0, 1].map((i) => putOnBattlefield(s0, ap, bear({ name: `Bear ${i}` })));
    const life = s0.players[ap]!.life;
    let s = settle(attack(s0, ap, [{ attacker: b1!, defender: opp }, { attacker: b2!, defender: opp }]));
    expect(s.players[ap]!.life).toBe(life - 3);
    // Again, but one leaves combat (still on the battlefield) while the trigger waits.
    s = attack(s0, ap, [{ attacker: b1!, defender: opp }, { attacker: b2!, defender: opp }]);
    for (let i = 0; i < 10 && !s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack.length).toBe(1);
    s.objects[b2!]!.attacking = undefined;
    s = settle(s);
    expect(s.players[ap]!.life).toBe(life);
  });
});
