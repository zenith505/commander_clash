// Round 159: the most played cards, in popularity order, starting with Trenzalore Clocktower.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, scry, setup } from "./helpers";
import { abilitiesOf, abilityProblem, castProblem, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, objIsType, planActivate, planCast, spellCost, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) => act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks });
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
const obj = (id: string): TargetChoice => ({ kind: "object", id });
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const nameOf = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const mine = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && nameOf(s, id) === name);
const others = (s: GameState, ap: PlayerId) => s.turnOrder.filter((p) => p !== ap);
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % s.turnOrder.length]!;

// Real oracle text (Scryfall).
const clocktower = card("Trenzalore Clocktower", "Legendary Land", "", {cmc: 0,oracleText: "{T}: Add {U}. Put a time counter on Trenzalore Clocktower.\n{1}{U}, {T}, Remove twelve time counters from Trenzalore Clocktower and exile it: Shuffle your graveyard and hand into your library, then draw seven cards. Activate only if you control a Time Lord."});
const quick = card("Quick Sliver", "Creature — Sliver", "{1}{G}", {cmc: 2,power: "1",toughness: "1",keywords: ["Flash"],oracleText: "Flash\nAny player may cast Sliver spells as though they had flash."});
const barracuda = card("Tidal Barracuda", "Creature — Fish", "{3}{U}", {cmc: 4,power: "3",toughness: "4",oracleText: "Any player may cast spells as though they had flash.\nYour opponents can't cast spells during your turn."});
const frodo = card("Frodo, Adventurous Hobbit", "Legendary Creature — Halfling Scout", "{W}{B}", {cmc: 2,power: "1",toughness: "3",keywords: ["Partner with","Vigilance","Partner"],oracleText: "Partner with Sam, Loyal Attendant\nVigilance\nWhenever Frodo attacks, if you gained 3 or more life this turn, the Ring tempts you. Then if Frodo is your Ring-bearer and the Ring has tempted you two or more times this game, draw a card."});
const prishe = card("Prishe's Wanderings", "Instant", "{2}{G}", {cmc: 3,oracleText: "Search your library for a basic land card or Town card, put it onto the battlefield tapped, then shuffle. When you search your library this way, put a +1/+1 counter on target creature you control."});
const plunder = card("Memory Plunder", "Instant", "{U/B}{U/B}{U/B}{U/B}", {cmc: 4,oracleText: "You may cast target instant or sorcery card from an opponent's graveyard without paying its mana cost."});
const heist = card("Arcane Heist", "Sorcery", "{2}{U}{U}", {cmc: 4,keywords: ["Cipher"],oracleText: "You may cast target instant or sorcery card from an opponent's graveyard without paying its mana cost. If that spell would be put into their graveyard, exile it instead.\nCipher (Then you may exile this spell card encoded on a creature you control. Whenever that creature deals combat damage to a player, its controller may cast a copy of the encoded card without paying its mana cost.)"});
const paladin = card("Paladin Class", "Enchantment — Class", "{W}", {cmc: 1,oracleText: "(Gain the next level as a sorcery to add its ability.)\nSpells your opponents cast during your turn cost {1} more to cast.\n{2}{W}: Level 2\nCreatures you control get +1/+1.\n{4}{W}: Level 3\nWhenever you attack, until end of turn, target attacking creature gets +1/+1 for each other attacking creature and gains double strike."});
const faramir = card("Faramir, Prince of Ithilien", "Legendary Creature — Human Noble", "{2}{W}{U}", {cmc: 4,power: "3",toughness: "3",oracleText: "At the beginning of your end step, choose an opponent. At the beginning of that player's next end step, you draw a card if they didn't attack you that turn. Otherwise, create three 1/1 white Human Soldier creature tokens."});
const elspeth = card("Elspeth Tirel", "Legendary Planeswalker — Elspeth", "{3}{W}{W}", {cmc: 5,loyalty: "4",oracleText: "+2: You gain 1 life for each creature you control.\n−2: Create three 1/1 white Soldier creature tokens.\n−5: Destroy all other permanents except for lands and tokens."});
const auntMay = card("Aunt May", "Legendary Creature — Human Citizen", "{W}", {cmc: 1,power: "0",toughness: "2",oracleText: "Whenever another creature you control enters, you gain 1 life. If it's a Spider, put a +1/+1 counter on it."});
const wand = card("Wand of Orcus", "Legendary Artifact — Equipment", "{2}{B}", {cmc: 3,keywords: ["Equip"],oracleText: "Whenever equipped creature attacks or blocks, it and Zombies you control gain deathtouch until end of turn.\nWhenever equipped creature deals combat damage to a player, create that many 2/2 black Zombie creature tokens.\nEquip {3}"});
const kroxa = card("Kroxa, Titan of Death's Hunger", "Legendary Creature — Elder Giant", "{B}{R}", {cmc: 2,power: "6",toughness: "6",keywords: ["Escape"],oracleText: "When Kroxa enters, sacrifice it unless it escaped.\nWhenever Kroxa enters or attacks, each opponent discards a card, then each opponent who didn't discard a nonland card this way loses 3 life.\nEscape—{B}{B}{R}{R}, Exile five other cards from your graveyard. (You may cast this card from your graveyard for its escape cost.)"});
const masterwork = card("Stoneforge Masterwork", "Artifact — Equipment", "{1}", {cmc: 1,keywords: ["Equip"],oracleText: "Equipped creature gets +1/+1 for each other creature you control that shares a creature type with it.\nEquip {2}"});
const heart = card("Glass-Cast Heart", "Artifact", "{2}{B}", {cmc: 3,oracleText: "Whenever one or more Vampires you control attack, create a Blood token. (It's an artifact with \"{1}, {T}, Discard a card, Sacrifice this token: Draw a card.\")\n{B}, {T}, Pay 1 life: Create a 1/1 white and black Vampire creature token with lifelink.\n{B}{B}, {T}, Sacrifice this artifact and thirteen Blood tokens: Each opponent loses 13 life and you gain 13 life."});
const kishla = card("Kishla Skimmer", "Creature — Bird Scout", "{G}{U}", {cmc: 2,power: "2",toughness: "2",keywords: ["Flying"],oracleText: "Flying\nWhenever a card leaves your graveyard during your turn, draw a card. This ability triggers only once each turn."});
const amoeboid = card("Amoeboid Changeling", "Creature — Shapeshifter", "{1}{U}", {cmc: 2,power: "1",toughness: "1",keywords: ["Changeling"],oracleText: "Changeling (This card is every creature type.)\n{T}: Target creature gains all creature types until end of turn.\n{T}: Target creature loses all creature types until end of turn."});
const urza = card("Urza, Chief Artificer", "Legendary Creature — Human Artificer", "{3}{W}{U}{B}", {cmc: 6,power: "4",toughness: "5",keywords: ["Affinity"],oracleText: "Affinity for artifact creatures (This spell costs {1} less to cast for each artifact creature you control.)\nArtifact creatures you control have menace.\nAt the beginning of your end step, create a 0/0 colorless Construct artifact creature token with \"This token gets +1/+1 for each artifact you control.\""});
const marchesa = card("Marchesa, the Black Rose", "Legendary Creature — Human Wizard", "{1}{U}{B}{R}", {cmc: 4,power: "3",toughness: "3",keywords: ["Dethrone"],oracleText: "Dethrone (Whenever this creature attacks the player with the most life or tied for most life, put a +1/+1 counter on it.)\nOther creatures you control have dethrone.\nWhenever a creature you control with a +1/+1 counter on it dies, return that card to the battlefield under your control at the beginning of the next end step."});
const archangel = card("Sublime Archangel", "Creature — Angel", "{2}{W}{W}", {cmc: 4,power: "4",toughness: "3",keywords: ["Flying","Exalted"],oracleText: "Flying\nExalted (Whenever a creature you control attacks alone, that creature gets +1/+1 until end of turn.)\nOther creatures you control have exalted. (If a creature has multiple instances of exalted, each triggers separately.)"});
const wanderer = card("The Wanderer", "Legendary Planeswalker", "{3}{W}", {cmc: 4,loyalty: "5",oracleText: "Prevent all noncombat damage that would be dealt to you and other permanents you control.\n−2: Exile target creature with power 4 or greater."});
const vernal = card("Vernal Equinox", "Enchantment", "{3}{G}", {cmc: 4,oracleText: "Any player may cast creature and enchantment spells as though they had flash."});
const chorus = card("Chorus of Might", "Instant", "{3}{G}", {cmc: 4,oracleText: "Until end of turn, target creature gets +1/+1 for each creature you control and gains trample."});
const egoErasure = card("Ego Erasure", "Kindred Instant — Shapeshifter", "{2}{U}", {cmc: 3,keywords: ["Changeling"],oracleText: "Changeling (This card is every creature type.)\nCreatures target player controls get -2/-0 and lose all creature types until end of turn."});
const nameless = card("Nameless Inversion", "Kindred Instant — Shapeshifter", "{1}{B}", {cmc: 2,keywords: ["Changeling"],oracleText: "Changeling (This card is every creature type.)\nTarget creature gets +3/-3 and loses all creature types until end of turn."});
const order = card("Order of Sacred Dusk", "Creature — Vampire Knight", "{6}{W}{B}", {cmc: 8,power: "5",toughness: "5",keywords: ["Flying","Lifelink","Exalted","Haste","Convoke"],oracleText: "Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nFlying, lifelink, haste\nExalted (Whenever a creature you control attacks alone, that creature gets +1/+1 until end of turn.)\nOther Vampires you control have exalted."});
const rammas = card("Rammas Echor, Ancient Shield", "Legendary Artifact", "{3}{W}", {cmc: 4,oracleText: "Whenever you cast your second spell each turn, draw a card, then create a 0/3 white Wall creature token with defender.\nAt the beginning of combat on your turn, creatures you control with defender gain exalted until end of turn. (Whenever a creature you control attacks alone, it gets +1/+1 until end of turn for each instance of exalted among permanents you control.)"});
const merchant = card("Merchant of Truth", "Creature — Angel Detective", "{2}{W}{W}", {cmc: 4,power: "2",toughness: "5",keywords: ["Flying","Investigate"],oracleText: "Flying\nWhenever a nontoken creature you control dies, investigate.\nClues you control have exalted. (Whenever a creature you control attacks alone, that creature gets +1/+1 until end of turn for each instance of exalted among permanents you control.)"});
const firstSliver = card("First Sliver's Chosen", "Creature — Sliver", "{4}{W}", {cmc: 5,power: "3",toughness: "3",oracleText: "Sliver creatures you control have exalted. (Whenever a creature you control attacks alone, it gets +1/+1 until end of turn for each instance of exalted among permanents you control.)"});
const getALegUp = card("Get a Leg Up", "Instant", "{G}", {cmc: 1,oracleText: "Until end of turn, target creature gets +1/+1 for each creature you control and gains reach."});
const harald = card("King Harald's Revenge", "Sorcery", "{2}{G}", {cmc: 3,oracleText: "Until end of turn, target creature gets +1/+1 for each creature you control and gains trample. It must be blocked this turn if able."});
const azusa = scry("transform", [
  { name: "Azusa's Many Journeys", mana_cost: "{1}{G}", type_line: "Enchantment — Saga", oracle_text: "(As this Saga enters and after your draw step, add a lore counter.)\nI — You may play an additional land this turn.\nII — You gain 3 life.\nIII — Exile this Saga, then return it to the battlefield transformed under your control." },
  { name: "Likeness of the Seeker", type_line: "Enchantment Creature — Human Monk", oracle_text: "Whenever this creature becomes blocked, untap up to three lands you control.", power: "3", toughness: "3", color_indicator: ["G"] },
], { keywords: ["Transform"] });

const shock = card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "Test Shock deals 2 damage to any target." });
const divination = card("Test Divination", "Sorcery", "{2}{U}", { cmc: 3, oracleText: "Draw two cards." });
const ogre = card("Test Ogre", "Creature — Ogre", "{3}{R}", { cmc: 4, power: "4", toughness: "4" });
const sliver = card("Test Sliver", "Creature — Sliver", "{1}{G}", { cmc: 2, power: "2", toughness: "2" });
const timeLord = card("Test Doctor", "Legendary Creature — Time Lord Doctor", "{2}{U}", { cmc: 3, power: "2", toughness: "3" });
const spider = card("Test Spider", "Creature — Spider", "{1}{G}", { cmc: 2, power: "1", toughness: "2" });
const zombie = card("Test Zombie", "Creature — Zombie", "{1}{B}", { cmc: 2, power: "2", toughness: "2" });
const town = card("Test Town", "Land — Town", "", { oracleText: "{T}: Add {C}." });
const golem = card("Test Golem", "Artifact Creature — Golem", "{3}", { cmc: 3, power: "3", toughness: "3" });
const charm = card("Test Charm", "Enchantment", "{1}{W}", { cmc: 2 });

describe("round 159 cards", () => {
  it("are fully supported", () => supported(clocktower, quick, barracuda, frodo, azusa, prishe, plunder, heist, paladin, faramir, elspeth, auntMay, wand, kroxa, masterwork, heart, kishla, amoeboid, urza, marchesa, archangel, wanderer));
  it("and these, from the same pieces", () => supported(vernal, chorus, egoErasure, nameless, order, rammas, merchant, firstSliver, getALegUp, harald));
});

describe("Trenzalore Clocktower", () => {
  it("its mana ability adds {U} and a time counter; with twelve and a Time Lord, it exiles itself, shuffles your hand and graveyard into your library and draws seven", () => {
    const { s: s0, ap } = setup([divination, shock]);
    const t = putOnBattlefield(s0, ap, clocktower);
    let s = act(s0, { type: "activateMana", player: ap, objectId: t, mana: "U" });
    expect(s.players[ap]!.manaPool.U).toBe(1);
    expect(s.objects[t]!.counters.time).toBe(1);
    s.objects[t]!.tapped = false;
    s.objects[t]!.counters.time = 12;
    // No Time Lord: it can't be activated (CR 602.5b).
    expect(planActivate(s, ap, t, 0)).toBeNull();
    putOnBattlefield(s, ap, timeLord);
    const yard = into(s, ap, ogre, "graveyard");
    const hand = [...s.players[ap]!.hand];
    const library = s.players[ap]!.library.length;
    s = resolveAll(run(s, planActivate(s, ap, t, 0)));
    expect(zone(s, t)).toBe("exile");
    expect(s.players[ap]!.graveyard).toEqual([]);
    expect(s.players[ap]!.hand.length).toBe(7);
    expect(s.players[ap]!.library.length).toBe(library + hand.length + 1 - 7);
    expect([yard, ...hand].every((id) => zone(s, id) === "library" || zone(s, id) === "hand")).toBe(true);
  });
  it("needs all twelve time counters", () => {
    const { s, ap } = setup([]);
    const t = putOnBattlefield(s, ap, clocktower);
    putOnBattlefield(s, ap, timeLord);
    s.objects[t]!.counters.time = 11;
    expect(planActivate(s, ap, t, 0)).toBeNull();
  });
});

describe("Quick Sliver, Tidal Barracuda, Vernal Equinox", () => {
  it("Quick Sliver: any player may cast Sliver spells any time they could cast an instant, but not other creatures", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    putOnBattlefield(s0, ap, quick);
    const theirSliver = into(s0, b, sliver, "hand");
    const theirOgre = into(s0, b, ogre, "hand");
    for (const l of ["Forest", "Mountain"]) for (let i = 0; i < 4; i++) putOnBattlefield(s0, b, card(l, `Basic Land — ${l}`));
    // A's main phase: A passes, so B has priority with an empty stack, on A's turn.
    const s = act(s0, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(b);
    expect(planCast(s, b, theirSliver)).not.toBeNull();
    expect(planCast(s, b, theirOgre)).toBeNull();
  });
  it("Tidal Barracuda: any player, its controller's opponents too, may cast spells as though they had flash; Vernal Equinox: creature and enchantment spells", () => {
    const { s: s0, ap, ids } = setup([ogre, divination, charm]);
    const b = next(s0, ap);
    // In A's beginning of combat step, A can't cast a creature or a sorcery...
    const s = passUntil(s0, "beginCombat", ap);
    expect(planCast(s, ap, ids[0]!)).toBeNull();
    // ... unless B controls Tidal Barracuda (its "can't cast during your turn" is about B's turn).
    const t = structuredClone(s);
    putOnBattlefield(t, b, barracuda);
    expect(planCast(t, ap, ids[0]!)).not.toBeNull();
    expect(planCast(t, ap, ids[1]!)).not.toBeNull();
    const u = structuredClone(s);
    putOnBattlefield(u, b, vernal);
    expect(planCast(u, ap, ids[0]!)).not.toBeNull();
    expect(planCast(u, ap, ids[2]!)).not.toBeNull();
    expect(planCast(u, ap, ids[1]!)).toBeNull();
  });
});

describe("Frodo, Adventurous Hobbit", () => {
  it("triggers only if you gained 3 or more life this turn; the Ring tempts you, then draws if Frodo is your Ring-bearer and you've been tempted twice", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    const f = putOnBattlefield(s0, ap, frodo);
    // 2 life gained: no trigger at all (rulings).
    const t0 = structuredClone(s0);
    t0.turnLog = { ...t0.turnLog, lifeGained: { [ap]: 2 } };
    let t = attack(t0, ap, [{ attacker: f, defender: b }]);
    expect(t.stack.length + t.triggerQueue.length).toBe(0);
    expect(t.players[ap]!.ring).toBeUndefined();
    // 3 life: tempted once, Frodo the only creature, so the Ring-bearer; once isn't twice, no card.
    const s1 = structuredClone(s0);
    s1.turnLog = { ...s1.turnLog, lifeGained: { [ap]: 3 } };
    const hand = s1.players[ap]!.hand.length;
    let s = resolveAll(attack(s1, ap, [{ attacker: f, defender: b }]));
    expect(s.players[ap]!.ring).toMatchObject({ tempted: 1, bearer: { id: f } });
    expect(s.players[ap]!.hand.length).toBe(hand);
    // Tempted before: the second time draws a card.
    const s2 = structuredClone(s1);
    s2.players[ap]!.ring = { tempted: 1, timestamp: s2.nextTimestamp++ };
    s = resolveAll(attack(s2, ap, [{ attacker: f, defender: b }]));
    expect(s.players[ap]!.ring).toMatchObject({ tempted: 2, bearer: { id: f } });
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
  it("draws nothing if another creature became the Ring-bearer", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    const f = putOnBattlefield(s0, ap, frodo);
    const other = putOnBattlefield(s0, ap, bear());
    s0.turnLog = { ...s0.turnLog, lifeGained: { [ap]: 5 } };
    s0.players[ap]!.ring = { tempted: 1, timestamp: s0.nextTimestamp++ };
    const hand = s0.players[ap]!.hand.length;
    let s = resolveAll(attack(s0, ap, [{ attacker: f, defender: b }]));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "ringBearer", player: ap });
    s = resolveAll(act(s, { type: "pickPermanents", player: ap, ids: [other] }));
    expect(s.players[ap]!.ring).toMatchObject({ tempted: 2, bearer: { id: other } });
    expect(s.players[ap]!.hand.length).toBe(hand);
  });
});

describe("Azusa's Many Journeys // Likeness of the Seeker", () => {
  it("Likeness of the Seeker: when it becomes blocked, untap up to three lands you control (only yours)", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    const l = putOnBattlefield(s0, ap, azusa);
    s0.objects[l]!.face = 1;
    invalidateCharacteristics(s0);
    expect(nameOf(s0, l)).toBe("Likeness of the Seeker");
    const blocker = putOnBattlefield(s0, b, bear());
    const theirLand = putOnBattlefield(s0, b, card("Forest", "Basic Land — Forest"));
    s0.objects[theirLand]!.tapped = true;
    const myLands = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && objIsType(s0, s0.objects[id]!, "Land"));
    for (const id of myLands) s0.objects[id]!.tapped = true;
    let s = attack(s0, ap, [{ attacker: l, defender: b }]);
    s = resolveAll(s);
    s = passUntil(s, "declareBlockers");
    s = act(s, { type: "declareBlockers", player: b, blocks: [{ blocker, attacker: l }] });
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "untap", player: ap, count: 3, min: 0 });
    expect((s.pending as { options: string[] }).options).not.toContain(theirLand);
    s = resolveAll(act(s, { type: "pickPermanents", player: ap, ids: myLands.slice(0, 3) }));
    expect(myLands.filter((id) => !s.objects[id]!.tapped).length).toBe(3);
  });
});

describe("Prishe's Wanderings", () => {
  it("puts a basic land or Town card onto the battlefield tapped; searching triggers a reflexive +1/+1 counter on target creature you control", () => {
    const { s: s0, ap, ids } = setup([prishe]);
    const b = putOnBattlefield(s0, ap, bear());
    const t = into(s0, ap, town, "library");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = act(s, { type: "searchLibrary", player: ap, found: [t] });
    expect(zone(s, t)).toBe("battlefield");
    expect(s.objects[t]!.tapped).toBe(true);
    s = resolveAll(s);
    if (s.pending?.kind === "chooseTargets") s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [obj(b)] }));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
  });
  it("triggers even if no card is found (rulings)", () => {
    const { s: s0, ap, ids } = setup([prishe]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    s = act(s, { type: "searchLibrary", player: ap, found: [] });
    s = resolveAll(s);
    if (s.pending?.kind === "chooseTargets") s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [obj(b)] }));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
  });
});

describe("Memory Plunder and Arcane Heist", () => {
  it("Memory Plunder: you may cast target instant or sorcery card from an opponent's graveyard free; it goes to its owner's graveyard after", () => {
    const { s: s0, ap, ids } = setup([plunder]);
    const b = next(s0, ap);
    const theirs = into(s0, b, divination, "graveyard");
    const hand = s0.players[ap]!.hand.length;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(theirs)])));
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: theirs });
    s = resolveAll(act(s, { type: "castSpell", player: ap, objectId: theirs }));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2);
    expect(zone(s, theirs)).toBe("graveyard");
    expect(s.players[b]!.graveyard).toContain(theirs);
  });
  it("can't target a card in your own graveyard", () => {
    const { s, ap, ids } = setup([plunder]);
    const own = into(s, ap, divination, "graveyard");
    expect(planCast(s, ap, ids[0]!, [obj(own)])).toBeNull();
  });
  it("Arcane Heist: the spell cast this way is exiled instead of going to their graveyard", () => {
    const { s: s0, ap, ids } = setup([heist]);
    const b = next(s0, ap);
    const theirs = into(s0, b, divination, "graveyard");
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(theirs)])));
    expect(s.pending).toMatchObject({ kind: "castFree", player: ap, objectId: theirs });
    s = resolveAll(act(s, { type: "castSpell", player: ap, objectId: theirs }));
    expect(zone(s, theirs)).toBe("exile");
  });
});

describe("Paladin Class", () => {
  it("spells your opponents cast during your turn cost {1} more; not during theirs", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    putOnBattlefield(s0, ap, paladin);
    const theirs = into(s0, b, shock, "hand");
    expect(spellCost(s0, b, s0.objects[theirs]!).extra).toBe(1);
    const s = passUntil(s0, "main1", b);
    expect(spellCost(s, b, s.objects[theirs]!).extra).toBe(0);
  });
  it("level 3: whenever you attack, target attacking creature gets +1/+1 for each other attacking creature and gains double strike", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    const p = putOnBattlefield(s0, ap, paladin);
    s0.objects[p]!.classLevel = 3;
    invalidateCharacteristics(s0);
    const [x, y, z] = [bear(), bear(), bear()].map((d) => putOnBattlefield(s0, ap, d));
    // Level 2's +1/+1 too.
    expect(pt(s0, x!)).toBe("3/3");
    let s = attack(structuredClone(s0), ap, [x!, y!, z!].map((attacker) => ({ attacker, defender: b })));
    s = resolveAll(s);
    if (s.pending?.kind === "chooseTargets") s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [obj(x!)] }));
    const boosted = [x!, y!, z!].find((id) => objHasKeyword(s, s.objects[id]!, "Double strike"))!;
    expect(pt(s, boosted)).toBe("5/5");
    // Attacking alone: double strike, no bonus (rulings).
    s = attack(structuredClone(s0), ap, [{ attacker: x!, defender: b }]);
    s = resolveAll(s);
    if (s.pending?.kind === "chooseTargets") s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [obj(x!)] }));
    expect(objHasKeyword(s, s.objects[x!]!, "Double strike")).toBe(true);
    expect(pt(s, x!)).toBe("3/3");
  });
});

describe("Faramir, Prince of Ithilien", () => {
  const ready = () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, faramir);
    let s = passUntil(s0, "end", ap);
    s = resolveAll(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "opponent", player: ap });
    const b = next(s, ap);
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: String(b) }));
    return { s, ap, b };
  };
  it("at the chosen opponent's next end step, you draw a card if they didn't attack you that turn", () => {
    const { s: s1, ap, b } = ready();
    let s = passUntil(s1, "end", b);
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(mine(s, ap, "Human Soldier Token")).toHaveLength(0);
    // Only once.
    s = passUntil(s, "end", next(s, b));
    const hand2 = s.players[ap]!.hand.length;
    s = resolveAll(s);
    expect(s.players[ap]!.hand.length).toBe(hand2);
  });
  it("otherwise, three 1/1 Human Soldiers; attacking another player doesn't count", () => {
    const { s: s1, ap, b } = ready();
    const attacker = putOnBattlefield(s1, b, bear());
    let s = attack(s1, b, [{ attacker, defender: ap }]);
    s = passUntil(s, "end", b);
    s = resolveAll(s);
    expect(mine(s, ap, "Human Soldier Token")).toHaveLength(3);
    // B attacking C instead: a card.
    const { s: t1, ap: ap2, b: b2 } = ready();
    const c = next(t1, b2);
    const other = putOnBattlefield(t1, b2, bear());
    let t = attack(t1, b2, [{ attacker: other, defender: c }]);
    t = passUntil(t, "end", b2);
    const hand = t.players[ap2]!.hand.length;
    t = resolveAll(t);
    expect(t.players[ap2]!.hand.length).toBe(hand + 1);
    expect(mine(t, ap2, "Human Soldier Token")).toHaveLength(0);
  });
});

describe("Elspeth Tirel", () => {
  it("−5: destroys all other permanents except lands and tokens", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    const e = putOnBattlefield(s0, ap, elspeth);
    s0.objects[e]!.counters.loyalty = 6;
    const mine1 = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, b, golem);
    const ench = putOnBattlefield(s0, b, charm);
    const land = putOnBattlefield(s0, b, card("Forest", "Basic Land — Forest"));
    const soldier = putOnBattlefield(s0, ap, card("Soldier", "Token Creature — Soldier", "", { power: "1", toughness: "1" }));
    s0.objects[soldier]!.isToken = true;
    const s = resolveAll(run(s0, planActivate(s0, ap, e, 2)));
    expect(zone(s, mine1)).toBe("graveyard");
    expect(zone(s, theirs)).toBe("graveyard");
    expect(zone(s, ench)).toBe("graveyard");
    expect(zone(s, land)).toBe("battlefield");
    expect(zone(s, soldier)).toBe("battlefield");
    expect(zone(s, e)).toBe("battlefield");
    expect(s.objects[e]!.counters.loyalty).toBe(1);
  });
});

describe("Aunt May", () => {
  it("another creature entering gains 1 life; a Spider also gets a +1/+1 counter", () => {
    const { s: s0, ap, ids } = setup([spider, bear()]);
    putOnBattlefield(s0, ap, auntMay);
    const life = s0.players[ap]!.life;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.players[ap]!.life).toBe(life + 1);
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(s.players[ap]!.life).toBe(life + 2);
    expect(s.objects[ids[1]!]!.counters["+1/+1"] ?? 0).toBe(0);
  });
  it("a changeling is a Spider too", () => {
    const { s: s0, ap, ids } = setup([card("Test Changeling", "Creature — Shapeshifter", "{1}", { cmc: 1, power: "1", toughness: "1", keywords: ["Changeling"], oracleText: "Changeling" })]);
    putOnBattlefield(s0, ap, auntMay);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
  });
});

describe("Wand of Orcus", () => {
  it("whenever equipped creature attacks, it and Zombies you control gain deathtouch; combat damage to a player makes that many Zombies", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    const w = putOnBattlefield(s0, ap, wand);
    const o = putOnBattlefield(s0, ap, ogre);
    const z = putOnBattlefield(s0, ap, zombie);
    const theirZombie = putOnBattlefield(s0, b, zombie);
    s0.objects[w]!.attachedTo = o;
    invalidateCharacteristics(s0);
    let s = resolveAll(attack(s0, ap, [{ attacker: o, defender: b }]));
    expect(objHasKeyword(s, s.objects[o]!, "Deathtouch")).toBe(true);
    expect(objHasKeyword(s, s.objects[z]!, "Deathtouch")).toBe(true);
    expect(objHasKeyword(s, s.objects[theirZombie]!, "Deathtouch")).toBe(false);
    s = resolveAll(passUntil(s, "combatDamage"));
    s = resolveAll(passUntil(s, "endCombat"));
    expect(mine(s, ap, "Zombie Token")).toHaveLength(4);
  });
});

describe("Kroxa, Titan of Death's Hunger", () => {
  it("cast from hand: sacrificed; each opponent discards, and those who discarded a land or nothing lose 3 life", () => {
    const { s: s0, ap, ids } = setup([kroxa]);
    const [b, c, d] = others(s0, ap) as [PlayerId, PlayerId, PlayerId];
    for (const p of [b, c, d]) s0.players[p]!.hand = [];
    into(s0, b, shock, "hand");
    into(s0, c, card("Forest", "Basic Land — Forest"), "hand");
    const life = [b, c, d].map((p) => s0.players[p]!.life);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    for (let i = 0; i < 6 && s.pending?.kind === "discard"; i++) s = resolveAll(act(s, { type: "discard", player: s.pending.player, objectIds: s.players[s.pending.player]!.hand.slice(0, 1) }));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.players[b]!.life).toBe(life[0]);
    expect(s.players[c]!.life).toBe(life[1]! - 3);
    expect(s.players[d]!.life).toBe(life[2]! - 3);
  });
});

describe("Stoneforge Masterwork", () => {
  it("equipped creature gets +1/+1 for each other creature you control that shares a creature type with it, once each", () => {
    const { s, ap } = setup([]);
    const b = next(s, ap);
    const m = putOnBattlefield(s, ap, masterwork);
    const host = putOnBattlefield(s, ap, card("Test Shaman", "Creature — Human Shaman", "{1}", { power: "1", toughness: "1" }));
    putOnBattlefield(s, ap, card("Test Warrior", "Creature — Human Warrior", "{1}", { power: "1", toughness: "1" }));
    putOnBattlefield(s, ap, card("Test Goblin", "Creature — Goblin Shaman", "{1}", { power: "1", toughness: "1" }));
    putOnBattlefield(s, ap, card("Test Shaman 2", "Creature — Human Shaman", "{1}", { power: "1", toughness: "1" }));
    putOnBattlefield(s, ap, bear());
    putOnBattlefield(s, b, card("Their Human", "Creature — Human", "{1}", { power: "1", toughness: "1" }));
    s.objects[m]!.attachedTo = host;
    invalidateCharacteristics(s);
    expect(pt(s, host)).toBe("4/4");
  });
});

describe("Glass-Cast Heart", () => {
  it("sacrifice it and thirteen Blood tokens: each opponent loses 13 life and you gain 13", () => {
    const { s: s0, ap } = setup([]);
    const h = putOnBattlefield(s0, ap, heart);
    const blood = card("Blood", "Token Artifact — Blood", "", { oracleText: "{1}, {T}, Discard a card, Sacrifice this token: Draw a card." });
    const tokens = Array.from({ length: 12 }, () => putOnBattlefield(s0, ap, blood));
    for (const t of tokens) s0.objects[t]!.isToken = true;
    // Twelve, and a Blood artifact that isn't a token: not enough.
    putOnBattlefield(s0, ap, card("Test Blood", "Artifact — Blood", "{1}"));
    expect(abilityProblem(s0, ap, h, 1)).toMatch(/Blood/);
    const last = putOnBattlefield(s0, ap, blood);
    s0.objects[last]!.isToken = true;
    const life = s0.turnOrder.map((p) => s0.players[p]!.life);
    const s = resolveAll(run(s0, planActivate(s0, ap, h, 1, [], undefined, undefined, undefined, { sacrifice: [...tokens, last] })));
    expect(zone(s, h)).toBe("graveyard");
    expect([...tokens, last].every((t) => !s.battlefield.includes(t))).toBe(true);
    s0.turnOrder.forEach((p, i) => expect(s.players[p]!.life).toBe(life[i]! + (p === ap ? 13 : -13)));
  });
});

describe("Kishla Skimmer", () => {
  it("whenever a card leaves your graveyard during your turn, draw a card, only once each turn; not during other turns", () => {
    const { s: s0, ap, ids } = setup([card("Test Raise", "Sorcery", "{B}", { cmc: 1, oracleText: "Return up to two target creature cards from your graveyard to your hand." })]);
    putOnBattlefield(s0, ap, kishla);
    const [x, y] = [bear(), bear()].map((d) => into(s0, ap, d, "graveyard"));
    const hand = s0.players[ap]!.hand.length;
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(x!), obj(y!)])));
    expect(zone(s, x!)).toBe("hand");
    // Two cards left (two triggers' worth), but it triggers only once this turn: -1 Raise, +2 cards, +1 draw.
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 2 + 1);
  });
  it("doesn't trigger during an opponent's turn", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    putOnBattlefield(s0, ap, kishla);
    const x = into(s0, ap, bear(), "graveyard");
    let s = passUntil(s0, "main1", b);
    const raise = into(s, b, card("Test Exhume Theirs", "Instant", "{B}", { cmc: 1, oracleText: "Exile target card from a graveyard." }), "hand");
    putOnBattlefield(s, b, card("Swamp", "Basic Land — Swamp"));
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(run(s, planCast(s, b, raise, [obj(x)])));
    expect(zone(s, x)).toBe("exile");
    expect(s.players[ap]!.hand.length).toBe(hand);
  });
});

describe("Amoeboid Changeling, Nameless Inversion", () => {
  it("target creature loses all creature types until end of turn, changeling's too; a type gained later is kept (rulings)", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, amoeboid);
    const target = putOnBattlefield(s0, ap, card("Test Elf", "Creature — Elf Warrior", "{1}", { power: "1", toughness: "1" }));
    let s = resolveAll(run(s0, planActivate(s0, ap, a, 1, [obj(target)])));
    expect(characteristics(s, s.objects[target]!).subtypes).toEqual([]);
    // Amoeboid's other ability, later: all creature types again.
    s.objects[a]!.tapped = false;
    s = resolveAll(run(s, planActivate(s, ap, a, 0, [obj(target)])));
    expect(characteristics(s, s.objects[target]!).allCreatureTypes).toBe(true);
    // On a changeling: none.
    const t0 = structuredClone(s0);
    const other = putOnBattlefield(t0, ap, amoeboid);
    const t = resolveAll(run(t0, planActivate(t0, ap, a, 1, [obj(other)])));
    expect(characteristics(t, t.objects[other]!).allCreatureTypes).toBe(false);
    expect(characteristics(t, t.objects[other]!).subtypes).toEqual([]);
    // Gone at end of turn.
    const u = passUntil(t, "upkeep", next(t, ap));
    expect(characteristics(u, u.objects[other]!).allCreatureTypes).toBe(true);
  });
});

describe("Urza, Chief Artificer", () => {
  it("affinity for artifact creatures: {1} less for each artifact creature you control", () => {
    const { s, ap, ids } = setup([urza]);
    const before = spellCost(s, ap, s.objects[ids[0]!]!).extra;
    putOnBattlefield(s, ap, golem);
    putOnBattlefield(s, ap, golem);
    putOnBattlefield(s, ap, card("Test Rock", "Artifact", "{2}"));
    putOnBattlefield(s, ap, bear());
    expect(before - spellCost(s, ap, s.objects[ids[0]!]!).extra).toBe(2);
  });
});

describe("Marchesa, Sublime Archangel: granted dethrone and exalted", () => {
  it("Marchesa: another creature you control attacking the player with the most life gets a +1/+1 counter", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    putOnBattlefield(s0, ap, marchesa);
    const x = putOnBattlefield(s0, ap, bear());
    s0.players[b]!.life = 50;
    const s = resolveAll(attack(s0, ap, [{ attacker: x, defender: b }]));
    expect(s.objects[x]!.counters["+1/+1"]).toBe(1);
  });
  it("Sublime Archangel: each instance among your creatures triggers when one attacks alone", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    putOnBattlefield(s0, ap, archangel);
    const x = putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, next(s0, b), bear());
    const s = resolveAll(attack(s0, ap, [{ attacker: x, defender: b }]));
    // Archangel's own exalted and both bears': +3/+3.
    expect(pt(s, x)).toBe("5/5");
  });
});

describe("The Wanderer", () => {
  it("prevents noncombat damage to you and your other permanents, not to itself, and not combat damage", () => {
    const { s: s0, ap } = setup([]);
    const b = next(s0, ap);
    const w = putOnBattlefield(s0, ap, wanderer);
    s0.objects[w]!.counters.loyalty = 5;
    const x = putOnBattlefield(s0, ap, bear());
    const life = s0.players[ap]!.life;
    let s = passUntil(s0, "main1", b);
    const bolts = [shock, shock, shock].map((d) => into(s, b, d, "hand"));
    for (const l of ["Mountain", "Mountain", "Mountain"]) putOnBattlefield(s, b, card(l, `Basic Land — ${l}`));
    s = resolveAll(run(s, planCast(s, b, bolts[0]!, [player(ap)])));
    s = resolveAll(run(s, planCast(s, b, bolts[1]!, [obj(x)])));
    s = resolveAll(run(s, planCast(s, b, bolts[2]!, [obj(w)])));
    expect(s.players[ap]!.life).toBe(life);
    expect(s.objects[x]!.damage).toBe(0);
    expect(s.objects[w]!.counters.loyalty).toBe(3);
    const attacker = putOnBattlefield(s, b, bear());
    s = attack(s, b, [{ attacker, defender: ap }]);
    s = resolveAll(passUntil(s, "endCombat"));
    expect(s.players[ap]!.life).toBe(life - 2);
  });
});
