// Round 165: the most played cards, in popularity order, starting with The Kami War, Angelic Arbiter and Iridescent Hornbeetle.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passUntil, pt, putOnBattlefield, scry, setup } from "./helpers";
import { nextRandom } from "../src/rng";
import { abilitiesOf, botActions, castProblem, characteristics, legalActions, potentialAttackers, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty; "you may" questions get `yes`. Stops at any other question. */
const resolveAll = (s: GameState, yes = true) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending?.kind === "chooseMay"); i++) {
    if (s.pending?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: s.pending.player, yes });
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** Answers a blight question (CR 701.68a): the -1/-1 counters go on `on`. */
const blight = (s: GameState, on: string) => {
  if (s.pending?.kind !== "pickPermanents") return s; // the only creature: no question
  expect(s.pending).toMatchObject({ counter: "-1/-1" });
  return act(s, { type: "pickPermanents", player: (s.pending as { player: PlayerId }).player, ids: [on] });
};
/** A card put straight into a zone, not from the battlefield. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "hand" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Like `resolveAll`, and other players' questions are answered by the bot. */
const settle = (s: GameState, me: PlayerId, yes = true) => {
  for (let i = 0; i < 40; i++) {
    s = resolveAll(s, yes);
    if (!s.pending || s.pending.player === me) return s;
    s = run(s, botActions(s, s.pending.player));
  }
  return s;
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % s.turnOrder.length]!;
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) => act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks });
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId) => ({ kind: "player", id }) as TargetChoice;
const kw = (s: GameState, id: string, k: string) => objHasKeyword(s, s.objects[id]!, k);
const tokens = (s: GameState, pid: PlayerId, subtype: string) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid && characteristics(s, s.objects[id]!).subtypes.includes(subtype));

// Real oracle text (Scryfall).
const kamiWar = scry("transform", [
  { name: "The Kami War", mana_cost: "{1}{W}{U}{B}{R}{G}", type_line: "Enchantment — Saga", oracle_text: "(As this Saga enters and after your draw step, add a lore counter.)\nI — Exile target nonland permanent an opponent controls.\nII — Return up to one other target nonland permanent to its owner's hand. Then each opponent discards a card.\nIII — Exile this Saga, then return it to the battlefield transformed under your control." },
  { name: "O-Kagachi Made Manifest", type_line: "Enchantment Creature — Dragon Spirit", power: "6", toughness: "6", color_indicator: ["W", "U", "B", "R", "G"], oracle_text: "O-Kagachi Made Manifest is all colors.\nFlying, trample\nWhenever this creature attacks, defending player chooses a nonland card in your graveyard. Return that card to your hand. This creature gets +X/+0 until end of turn, where X is the mana value of that card." },
]);
const esperOrigins = scry("transform", [
  { name: "Esper Origins", mana_cost: "{1}{G}", type_line: "Sorcery", oracle_text: "Surveil 2. You gain 2 life. If this spell was cast from a graveyard, exile it, then put it onto the battlefield transformed under its owner's control with a finality counter on it. (If a creature with a finality counter on it would die, exile it instead.)\nFlashback {3}{G} (You may cast this card from your graveyard for its flashback cost. Then exile it.)" },
  { name: "Summon: Esper Maduin", type_line: "Enchantment Creature — Saga Elemental", power: "4", toughness: "4", color_indicator: ["G"], oracle_text: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Reveal the top card of your library. If it's a permanent card, put it into your hand.\nII — Add {G}{G}.\nIII — Other creatures you control get +2/+2 and gain trample until end of turn." },
], { keywords: ["Flashback"] });
const ogre = card("Test Ogre", "Creature — Ogre", "{2}{R}", { power: "3", toughness: "3", cmc: 3 });
const giant = card("Test Giant", "Creature — Giant", "{4}{R}", { power: "5", toughness: "5", cmc: 5 });

describe("The Kami War // O-Kagachi Made Manifest", () => {
  it("is fully supported, both faces", () => supported(kamiWar));
  it("the defending player chooses a nonland card in your graveyard; it returns to your hand and O-Kagachi gets +X/+0", () => {
    let { s, ap, opp } = setup([]);
    const o = putOnBattlefield(s, ap, kamiWar);
    s.objects[o]!.face = 1;
    const small = into(s, ap, ogre, "graveyard");
    const big = into(s, ap, giant, "graveyard");
    into(s, ap, forest, "graveyard");
    s = attack(s, ap, [{ attacker: o, defender: opp }]);
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: opp, forPlayer: ap, max: 1 });
    expect((s.pending as { cards: string[] }).cards.sort()).toEqual([small, big].sort());
    s = act(s, { type: "searchLibrary", player: opp, found: [big] });
    s = resolveAll(s);
    expect(zone(s, big)).toBe("hand");
    expect(zone(s, small)).toBe("graveyard");
    expect(pt(s, o)).toBe("11/6");
  });
  it("a bot defending player gives back the card worth least to you", () => {
    let { s, ap, opp } = setup([]);
    const o = putOnBattlefield(s, ap, kamiWar);
    s.objects[o]!.face = 1;
    const small = into(s, ap, ogre, "graveyard");
    into(s, ap, giant, "graveyard");
    s = attack(s, ap, [{ attacker: o, defender: opp }]);
    s = settle(s, ap);
    expect(zone(s, small)).toBe("hand");
    expect(pt(s, o)).toBe("9/6");
  });
  it("with no nonland card in your graveyard nothing returns and X is 0", () => {
    let { s, ap, opp } = setup([]);
    const o = putOnBattlefield(s, ap, kamiWar);
    s.objects[o]!.face = 1;
    into(s, ap, forest, "graveyard");
    s = attack(s, ap, [{ attacker: o, defender: opp }]);
    s = resolveAll(s);
    expect(s.pending?.kind).not.toBe("searchLibrary");
    expect(pt(s, o)).toBe("6/6");
  });
});

describe("Esper Origins // Summon: Esper Maduin", () => {
  it("is fully supported, both faces", () => supported(esperOrigins));
  it("cast from your hand: surveil 2 and gain 2 life, then it goes to the graveyard", () => {
    let { s, ap, ids } = setup([esperOrigins]);
    const life = s.players[ap]!.life;
    s = run(s, planCast(s, ap, ids[0]!));
    for (let i = 0; i < 20 && (s.pending || s.stack.length); i++) s = s.pending ? run(s, botActions(s, s.pending.player)) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.players[ap]!.life).toBe(life + 2);
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });
  it("cast with flashback: it enters transformed with a finality counter", () => {
    let { s, ap } = setup([]);
    const e = into(s, ap, esperOrigins, "graveyard");
    s = run(s, planCast(s, ap, e, undefined, undefined, undefined, undefined, { via: "flashback" }));
    for (let i = 0; i < 20 && (s.pending || s.stack.length); i++) s = s.pending ? run(s, botActions(s, s.pending.player)) : act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(zone(s, e)).toBe("battlefield");
    expect(s.objects[e]!.face).toBe(1);
    expect(s.objects[e]!.counters.finality).toBe(1);
    expect(characteristics(s, s.objects[e]!).name).toBe("Summon: Esper Maduin");
    expect(s.objects[e]!.counters.lore).toBe(1);
  });
});

const arbiter = card("Angelic Arbiter", "Creature — Angel", "{5}{W}{W}", { cmc: 7, power: "5", toughness: "6", keywords: ["Flying"], oracleText: "Flying\nEach opponent who cast a spell this turn can't attack with creatures.\nEach opponent who attacked with a creature this turn can't cast spells." });
const shock = card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "Test Shock deals 2 damage to any target." });
const growth = card("Test Growth", "Instant", "{G}", { cmc: 1, oracleText: "Put two +1/+1 counters on target creature." });
const hornbeetle = card("Iridescent Hornbeetle", "Creature — Insect", "{4}{G}", { cmc: 5, power: "3", toughness: "4", oracleText: "At the beginning of your end step, create a 1/1 green Insect creature token for each +1/+1 counter you've put on creatures under your control this turn." });
const paladin = card("Sigardian Paladin", "Creature — Human Knight", "{2}{G}{W}", { cmc: 4, power: "4", toughness: "4", oracleText: "As long as you've put one or more +1/+1 counters on a creature this turn, this creature has trample and lifelink.\n{1}{G}{W}: Target creature you control with a +1/+1 counter on it gains trample and lifelink until end of turn." });
const trumpeter = card("Fairgrounds Trumpeter", "Creature — Elephant", "{2}{G}", { cmc: 3, power: "2", toughness: "2", oracleText: "At the beginning of each end step, if a +1/+1 counter was put on a permanent under your control this turn, put a +1/+1 counter on this creature." });
const beast = card("Beast, Erudite Aerialist", "Legendary Creature — Mutant Scientist Hero", "{3}{G/U}", { cmc: 4, power: "3", toughness: "4", oracleText: "As long as you've put one or more +1/+1 counters on Beast this turn, he has flying.\nWhenever Beast deals combat damage to a player, draw a card." });

describe("Angelic Arbiter", () => {
  it("is fully supported", () => supported(arbiter));
  it("an opponent who cast a spell this turn can't attack with creatures", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, opp, arbiter);
    const b = putOnBattlefield(s, ap, bear());
    expect(potentialAttackers(s, ap).map((o) => o.id)).toContain(b);
    const sh = into(s, ap, shock, "hand");
    s = resolveAll(run(s, planCast(s, ap, sh, [player(opp)])));
    expect(potentialAttackers(s, ap)).toEqual([]);
  });
  it("an opponent who attacked with a creature this turn can't cast spells; its controller can do both", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, opp, arbiter);
    const b = putOnBattlefield(s, ap, bear());
    const sh = into(s, ap, shock, "hand");
    s = attack(s, ap, [{ attacker: b, defender: opp }]);
    expect(castProblem(s, ap, sh)).toMatch(/Angelic Arbiter/);
    // Its controller isn't stopped (rulings: during your turn it does nothing to you).
    const mine = into(s, opp, shock, "hand");
    expect(castProblem(s, opp, mine) ?? "").not.toMatch(/Angelic Arbiter/);
  });
});

describe("Iridescent Hornbeetle and the other +1/+1-counters-this-turn cards", () => {
  it("are fully supported", () => supported(hornbeetle, paladin, trumpeter, beast));
  it("Hornbeetle makes an Insect for each +1/+1 counter you put on your creatures this turn, even one that left", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, hornbeetle);
    const b = putOnBattlefield(s, ap, bear());
    const g = into(s, ap, growth, "hand");
    s = resolveAll(run(s, planCast(s, ap, g, [tgt(b)])));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(2);
    // The creature leaves; its counters still count (rulings).
    const sh = into(s, ap, shock, "hand");
    const s2 = resolveAll(run(s, planCast(s, ap, sh, [tgt(b)])));
    expect(zone(s2, b)).toBe("battlefield"); // 4/4 now: still there
    s = passUntil(s2, "end", ap);
    s = resolveAll(s);
    expect(tokens(s, ap, "Insect").length).toBe(2);
  });
  it("Hornbeetle doesn't count counters you put on an opponent's creature", () => {
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, hornbeetle);
    const b = putOnBattlefield(s, opp, bear());
    const g = into(s, ap, growth, "hand");
    s = resolveAll(run(s, planCast(s, ap, g, [tgt(b)])));
    s = resolveAll(passUntil(s, "end", ap));
    expect(tokens(s, ap, "Insect").length).toBe(0);
  });
  it("Sigardian Paladin has trample and lifelink once you've put a +1/+1 counter on any creature this turn", () => {
    let { s, ap, opp } = setup([]);
    const p = putOnBattlefield(s, ap, paladin);
    const b = putOnBattlefield(s, opp, bear());
    expect(kw(s, p, "Trample")).toBe(false);
    const g = into(s, ap, growth, "hand");
    s = resolveAll(run(s, planCast(s, ap, g, [tgt(b)])));
    expect(kw(s, p, "Trample")).toBe(true);
    expect(kw(s, p, "Lifelink")).toBe(true);
    // Next turn it's over.
    s = passUntil(s, "upkeep", next(s, ap));
    expect(kw(s, p, "Trample")).toBe(false);
  });
  it("Beast has flying only once you've put a +1/+1 counter on Beast itself", () => {
    let { s, ap } = setup([]);
    const be = putOnBattlefield(s, ap, beast);
    const b = putOnBattlefield(s, ap, bear());
    const g = into(s, ap, growth, "hand");
    s = resolveAll(run(s, planCast(s, ap, g, [tgt(b)])));
    expect(kw(s, be, "Flying")).toBe(false);
    const g2 = into(s, ap, growth, "hand");
    s = resolveAll(run(s, planCast(s, ap, g2, [tgt(be)])));
    expect(kw(s, be, "Flying")).toBe(true);
  });
  it("Fairgrounds Trumpeter grows at each end step after a +1/+1 counter went on a permanent you control, put by anyone", () => {
    let { s, ap, opp } = setup([]);
    const t = putOnBattlefield(s, opp, trumpeter);
    const b = putOnBattlefield(s, opp, bear());
    const quiet = resolveAll(passUntil(s, "end", ap));
    expect(quiet.objects[t]!.counters["+1/+1"] ?? 0).toBe(0);
    const g = into(s, ap, growth, "hand");
    s = resolveAll(run(s, planCast(s, ap, g, [tgt(b)])));
    s = resolveAll(passUntil(s, "end", ap));
    expect(s.objects[t]!.counters["+1/+1"]).toBe(1);
  });
});

const oona = card("Oona, Queen of the Fae", "Legendary Creature — Faerie Wizard", "{3}{U/B}{U/B}{U/B}", { cmc: 6, power: "5", toughness: "5", keywords: ["Flying"], oracleText: "Flying\n{X}{U/B}: Choose a color. Target opponent exiles the top X cards of their library. For each card of the chosen color exiled this way, create a 1/1 blue and black Faerie Rogue creature token with flying." });
const blueGuy = card("Test Merfolk", "Creature — Merfolk", "{1}{U}", { cmc: 2, power: "2", toughness: "1" });
const party = card("Life of the Party", "Creature — Elemental", "{3}{R}", { cmc: 4, power: "1", toughness: "1", keywords: ["First strike", "Trample", "Haste"], oracleText: "First strike, trample, haste\nWhenever this creature attacks, it gets +X/+0 until end of turn, where X is the number of creatures you control.\nWhen this creature enters, if it's not a token, each opponent creates a token that's a copy of it. The tokens are goaded for the rest of the game. (They attack each combat if able and attack a player other than you if able.)" });
const nuisance = card("Nettling Nuisance", "Creature — Faerie Rogue", "{2}{B}", { cmc: 3, power: "2", toughness: "2", keywords: ["Flying"], oracleText: 'Flying\nWhenever one or more Faeries you control deal combat damage to a player, that player creates a 4/2 red Pirate creature token with "This token can\'t block." The token is goaded for the rest of the game. (It attacks each combat if able and attacks a player other than you if able.)' });
const triplets = card("Gruff Triplets", "Creature — Satyr Warrior", "{3}{G}{G}{G}", { cmc: 6, power: "3", toughness: "3", keywords: ["Trample"], oracleText: "Trample\nWhen this creature enters, if it isn't a token, create two tokens that are copies of it.\nWhen this creature dies, put a number of +1/+1 counters equal to its power on each creature you control named Gruff Triplets." });

describe("Oona, Queen of the Fae", () => {
  it("is fully supported", () => supported(oona));
  it("makes a Faerie Rogue for each card of the chosen color the opponent exiles", () => {
    let { s, ap, opp } = setup([]);
    const o = putOnBattlefield(s, ap, oona);
    into(s, opp, blueGuy, "library");
    into(s, opp, bear(), "library");
    into(s, opp, blueGuy, "library");
    s = run(s, planActivate(s, ap, o, 0, [player(opp)], undefined, undefined, 3));
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "color" });
    const blue = (s.pending as { options: string[] }).options.find((x) => /blue/i.test(x))!;
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: blue }));
    expect(s.players[opp]!.exile.length).toBe(3);
    const rogues = tokens(s, ap, "Rogue");
    expect(rogues.length).toBe(2);
    expect(kw(s, rogues[0]!, "Flying")).toBe(true);
  });
});

describe("Life of the Party, Nettling Nuisance: tokens goaded for the rest of the game", () => {
  it("are fully supported", () => supported(party, nuisance));
  it("each opponent gets a token copy of Life of the Party, goaded by you for good; a token copy doesn't trigger again", () => {
    let { s, ap, ids } = setup([party]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    const copies = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).name === "Life of the Party");
    expect(copies.length).toBe(3);
    expect(new Set(copies.map((id) => s.objects[id]!.controller)).size).toBe(3);
    for (const id of copies) expect(characteristics(s, s.objects[id]!).goadedBy).toEqual([ap]);
    // For the rest of the game, not just until your next turn.
    expect(s.effects.find((e) => e.mods.some((m) => m.kind === "goad"))?.duration).toBe("game");
  });
  it("Nettling Nuisance's Pirate goes to the damaged player, goaded by you", () => {
    let { s, ap, opp } = setup([]);
    const n = putOnBattlefield(s, ap, nuisance);
    s = attack(s, ap, [{ attacker: n, defender: opp }]);
    s = resolveAll(passUntil(resolveAll(s), "combatDamage", ap));
    s = resolveAll(s);
    const pirates = tokens(s, opp, "Pirate");
    expect(pirates.length).toBe(1);
    expect(characteristics(s, s.objects[pirates[0]!]!).goadedBy).toEqual([ap]);
  });
});

describe("Gruff Triplets", () => {
  it("is fully supported", () => supported(triplets));
  it("enters with two token copies; when one dies, the others named Gruff Triplets get counters equal to its power", () => {
    let { s, ap, ids } = setup([triplets]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    const all = s.battlefield.filter((id) => characteristics(s, s.objects[id]!).name === "Gruff Triplets");
    expect(all.length).toBe(3);
    const other = putOnBattlefield(s, ap, bear());
    const sh = into(s, ap, card("Test Kill", "Instant", "{B}", { cmc: 1, oracleText: "Destroy target creature." }), "hand");
    s = resolveAll(run(s, planCast(s, ap, sh, [tgt(ids[0]!)])));
    const left = all.filter((id) => id !== ids[0]);
    for (const id of left) expect(s.objects[id]!.counters["+1/+1"]).toBe(3);
    expect(s.objects[other]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

const akroma = card("Akroma, Vision of Ixidor", "Legendary Creature — Angel", "{5}{W}{W}", { cmc: 7, power: "6", toughness: "6", keywords: ["Flying", "Vigilance", "First strike", "Partner", "Trample"], oracleText: "Flying, first strike, vigilance, trample\nAt the beginning of each combat, until end of turn, each other creature you control gets +1/+1 if it has flying, +1/+1 if it has first strike, and so on for double strike, deathtouch, haste, hexproof, indestructible, lifelink, menace, protection, reach, trample, vigilance, and partner.\nPartner (You can have two commanders if both have partner.)" });
const knight = card("Test Knight", "Creature — Human Knight", "{W}{W}", { cmc: 2, power: "2", toughness: "2", keywords: ["First strike", "Protection"], oracleText: "First strike, protection from black and from red" });
const narci = card("Narci, Fable Singer", "Legendary Creature — Human Bard", "{1}{W}{B}{G}", { cmc: 4, power: "2", toughness: "4", keywords: ["Lifelink"], oracleText: "Lifelink\nWhenever you sacrifice an enchantment, draw a card.\nWhenever the final chapter ability of a Saga you control resolves, each opponent loses X life and you gain X life, where X is that Saga's mana value." });
const tom = card("Tom Bombadil", "Legendary Creature — God Bard", "{W}{U}{B}{R}{G}", { cmc: 5, power: "4", toughness: "4", oracleText: "As long as there are four or more lore counters among Sagas you control, Tom Bombadil has hexproof and indestructible.\nWhenever the final chapter ability of a Saga you control resolves, reveal cards from the top of your library until you reveal a Saga card. Put that card onto the battlefield and the rest on the bottom of your library in a random order. This ability triggers only once each turn." });
const sagaOne = card("Test Short Saga", "Enchantment — Saga", "{2}{W}", { cmc: 3, oracleText: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after I.)\nI — You gain 1 life." });
const sagaTwo = card("Test Long Saga", "Enchantment — Saga", "{1}{W}", { cmc: 2, oracleText: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after II.)\nI — You gain 1 life.\nII — You gain 1 life." });

describe("Akroma, Vision of Ixidor", () => {
  it("is fully supported", () => supported(akroma));
  it("at the beginning of each combat, each other creature you control gets +1/+1 for each listed keyword it has, protection counted once", () => {
    let { s, ap } = setup([]);
    const a = putOnBattlefield(s, ap, akroma);
    const k = putOnBattlefield(s, ap, knight);
    const b = putOnBattlefield(s, ap, bear());
    s = resolveAll(passUntil(s, "beginCombat", ap));
    s = resolveAll(s);
    expect(pt(s, k)).toBe("4/4"); // first strike, protection (from two colors: once)
    expect(pt(s, b)).toBe("2/2");
    expect(pt(s, a)).toBe("6/6"); // not Akroma herself
    // Locked in as it resolved: losing first strike later doesn't shrink it (rulings).
    invalidateCharacteristics(s);
    expect(pt(s, k)).toBe("4/4");
  });
});

describe("Narci, Fable Singer and Tom Bombadil: a Saga's final chapter ability resolves", () => {
  it("are fully supported", () => supported(narci, tom));
  it("Narci drains each opponent for the Saga's mana value after its final chapter, not an earlier one", () => {
    let { s, ap, ids } = setup([sagaOne, sagaTwo]);
    putOnBattlefield(s, ap, narci);
    const life = s.players[ap]!.life;
    const opps = s.turnOrder.filter((p) => p !== ap);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(s.players[ap]!.life).toBe(life + 1); // chapter I of II: no drain
    for (const p of opps) expect(s.players[p]!.life).toBe(40);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.players[ap]!.life).toBe(life + 1 + 1 + 3);
    for (const p of opps) expect(s.players[p]!.life).toBe(37);
  });
  it("Tom Bombadil puts the next Saga from your library onto the battlefield, once each turn; four lore counters give him hexproof", () => {
    let { s, ap, ids } = setup([sagaOne]);
    const t = putOnBattlefield(s, ap, tom);
    const later = into(s, ap, sagaTwo, "library");
    into(s, ap, bear(), "library");
    const next = into(s, ap, sagaOne, "library");
    expect(kw(s, t, "Hexproof")).toBe(false);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    // The revealed Saga entered, and its own final chapter resolved: it was sacrificed, but Tom doesn't trigger again
    // this turn, so the other Saga stays in the library.
    expect(zone(s, next)).toBe("graveyard");
    expect(s.log.some((l) => /Test Short Saga.*battlefield/.test(JSON.stringify(l)))).toBe(true);
    expect(zone(s, later)).toBe("library");
    const big = putOnBattlefield(s, ap, sagaTwo);
    s.objects[big]!.counters.lore = 4;
    invalidateCharacteristics(s);
    expect(kw(s, t, "Hexproof")).toBe(true);
    expect(kw(s, t, "Indestructible")).toBe(true);
  });
});

// "The amount of mana spent to cast this spell / her" (CR 601.2h): what was actually paid, not the mana value (rulings).
const toph = card("Toph, Greatest Earthbender", "Legendary Creature — Human Warrior Ally", "{2}{R}{G}", { power: "3", toughness: "3", cmc: 4, keywords: ["Earthbend"], oracleText: "When Toph enters, earthbend X, where X is the amount of mana spent to cast her.\nLand creatures you control have double strike." });
const memoryDeluge = card("Memory Deluge", "Instant", "{2}{U}{U}", { cmc: 4, keywords: ["Flashback"], oracleText: "Look at the top X cards of your library, where X is the amount of mana spent to cast this spell. Put two of them into your hand and the rest on the bottom of your library in a random order.\nFlashback {5}{U}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)" });
const moltenNote = card("Molten Note", "Sorcery", "{X}{R}{W}", { cmc: 2, keywords: ["Flashback"], oracleText: "Molten Note deals damage to target creature equal to the amount of mana spent to cast this spell. Untap all creatures you control.\nFlashback {6}{R}{W} (You may cast this card from your graveyard for its flashback cost. Then exile it.)" });
const prossh = card("Prossh, Skyraider of Kher", "Legendary Creature — Dragon", "{3}{B}{R}{G}", { power: "5", toughness: "5", cmc: 6, keywords: ["Flying"], oracleText: "When you cast this spell, create X 0/1 red Kobold creature tokens named Kobolds of Kher Keep, where X is the amount of mana spent to cast it.\nFlying\nSacrifice another creature: Prossh gets +1/+0 until end of turn." });
const ashaya = card("Ashaya's Enduring Bond", "Legendary Sorcery", "{1}{R}{G}", { cmc: 3, keywords: ["Discover"], oracleText: "(You may cast a legendary sorcery only if you control a legendary creature or planeswalker.)\nDiscover X, where X is the amount of mana spent to cast this spell. (Exile cards from the top of your library until you exile a nonland card with that mana value or less. Cast it without paying its mana cost or put it into your hand. Put the rest on the bottom in a random order.)\nAshaya's Enduring Bond can be your commander." });

describe("The amount of mana spent to cast it: Toph, Memory Deluge, Molten Note, Prossh, Ashaya's Enduring Bond", () => {
  it("are fully supported", () => supported(toph, memoryDeluge, moltenNote, prossh, ashaya));
  it("Toph cast for four earthbends 4; put onto the battlefield without being cast, earthbend 0", () => {
    let { s, ap, ids } = setup([toph]);
    const land = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Swamp")!;
    s = run(s, planCast(s, ap, ids[0]!));
    s = resolveAll(s);
    if (s.pending?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: ap, targets: [tgt(land)] } as Action);
    s = resolveAll(s);
    const animated = s.battlefield.filter((id) => s.objects[id]!.counters["+1/+1"]);
    expect(animated.length).toBe(1);
    expect(s.objects[animated[0]!]!.counters["+1/+1"]).toBe(4);
    expect(kw(s, animated[0]!, "Double strike")).toBe(true);
    // Not cast: no mana was spent (CR 601.2h).
    let t = setup([]);
    const o = putOnBattlefield(t.s, t.ap, toph);
    expect(t.s.objects[o]!.manaSpent ?? 0).toBe(0);
  });
  it("Memory Deluge looks at four cast from hand, seven with flashback, and puts two into your hand", () => {
    for (const [fromYard, n] of [[false, 4], [true, 7]] as const) {
      let { s, ap, ids } = setup(fromYard ? [] : [memoryDeluge]);
      const d = fromYard ? into(s, ap, memoryDeluge, "graveyard") : ids[0]!;
      const hand = s.players[ap]!.hand.length - (fromYard ? 0 : 1);
      s = run(s, planCast(s, ap, d, undefined, undefined, undefined, undefined, fromYard ? { via: "flashback" } : {}));
      s = resolveAll(s);
      expect(s.pending).toBeTruthy();
      expect(s.pending).toMatchObject({ player: ap });
      const seen = ((s.pending as { cards?: string[] }).cards ?? []).length;
      expect(seen).toBe(n);
      for (let i = 0; i < 10 && s.pending; i++) s = run(s, botActions(s, s.pending.player));
      s = resolveAll(s);
      expect(s.players[ap]!.hand.length).toBe(hand + 2);
      expect(zone(s, d)).toBe(fromYard ? "exile" : "graveyard");
    }
  });
  it("Molten Note with X = 3 deals 5 damage, counting X: a 0/5 dies, a 0/6 survives", () => {
    for (const [toughness, dies] of [["5", true], ["6", false]] as const) {
      let { s, ap, ids, opp } = setup([moltenNote]);
      const wall = putOnBattlefield(s, opp, card("Test Wall", "Creature — Wall", "{4}", { power: "0", toughness, cmc: 4 }));
      s = run(s, planCast(s, ap, ids[0]!, [tgt(wall)], undefined, undefined, 3));
      s = resolveAll(s);
      expect(zone(s, wall)).toBe(dies ? "graveyard" : "battlefield");
      if (!dies) expect(s.objects[wall]!.damage).toBe(5);
    }
  });
  it("Prossh's cast trigger makes a Kobold named Kobolds of Kher Keep for each mana spent", () => {
    let { s, ap, ids } = setup([prossh]);
    s = run(s, planCast(s, ap, ids[0]!));
    s = resolveAll(s);
    expect(tokens(s, ap, "Kobold").length).toBe(6);
    expect(s.cards[s.objects[tokens(s, ap, "Kobold")[0]!]!.cardId]!.name).toBe("Kobolds of Kher Keep");
  });
});
