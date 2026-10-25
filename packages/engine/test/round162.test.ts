// Round 162: the most played cards, in popularity order (now past rank 5,000), starting with Lord of Atlantis.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, island, passUntil, pt, putOnBattlefield, setup, swamp } from "./helpers";
import { abilitiesOf, botActions, characteristics, compileCard, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, potentialAttackers, tapAbilitySick, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % s.turnOrder.length]!;
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) => act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks });
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const kw = (s: GameState, id: string, k: string) => objHasKeyword(s, s.objects[id]!, k);

// Real oracle text (Scryfall).
const lordOfAtlantis = card("Lord of Atlantis", "Creature — Merfolk", "{U}{U}", { cmc: 2, power: "2", toughness: "2", oracleText: "Other Merfolk get +1/+1 and have islandwalk. (They can't be blocked as long as defending player controls an Island.)" });
const slash = card("Slash the Ranks", "Sorcery", "{3}{W}{W}", { cmc: 5, oracleText: "Destroy all creatures and planeswalkers except for commanders." });
const sentence = card("Suspended Sentence", "Instant", "{3}{B}", { cmc: 4, keywords: ["Suspend"], oracleText: "Destroy target creature an opponent controls. That player loses 3 life. Exile Suspended Sentence with three time counters on it.\nSuspend 3—{1}{B} (Rather than cast this card from your hand, you may pay {1}{B} and exile it with three time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost.)" });
const knuckles = card("Brass Knuckles", "Artifact — Equipment", "{4}", { cmc: 4, keywords: ["Equip"], oracleText: "When you cast this spell, copy it.\nEquipped creature has double strike as long as two or more Equipment are attached to it.\nEquip {1}" });
const swarmlord = card("Phyrexian Swarmlord", "Creature — Phyrexian Insect Horror", "{4}{G}{G}", { cmc: 6, power: "4", toughness: "4", keywords: ["Infect"], oracleText: "Infect (This creature deals damage to creatures in the form of -1/-1 counters and to players in the form of poison counters.)\nAt the beginning of your upkeep, create a 1/1 green Phyrexian Insect creature token with infect for each poison counter your opponents have." });
const darien = card("King Darien XLVIII", "Legendary Creature — Human Soldier", "{1}{G}{W}", { cmc: 3, power: "2", toughness: "3", oracleText: "Other creatures you control get +1/+1.\n{3}{G}{W}: Put a +1/+1 counter on King Darien and create a 1/1 white Soldier creature token.\nSacrifice King Darien: Creature tokens you control gain hexproof and indestructible until end of turn." });
const hauler = card("Hoard Hauler", "Artifact — Vehicle", "{2}{R}", { cmc: 3, power: "4", toughness: "4", keywords: ["Crew"], oracleText: "Whenever this Vehicle deals combat damage to a player, create a Treasure token for each artifact they control.\nCrew 2 (Tap any number of untapped creatures you control with total power 2 or more: This Vehicle becomes an artifact creature until end of turn.)" });
const sazh = card("Sazh Katzroy", "Legendary Creature — Human Pilot", "{3}{G}", { cmc: 4, power: "3", toughness: "3", oracleText: "When Sazh Katzroy enters, you may search your library for a Bird or basic land card, reveal it, put it into your hand, then shuffle.\nWhenever Sazh Katzroy attacks, put a +1/+1 counter on target creature, then double the number of +1/+1 counters on that creature." });
const surveyor = card("Aerial Surveyor", "Artifact — Vehicle", "{2}{W}", { cmc: 3, power: "2", toughness: "3", keywords: ["Flying", "Crew"], oracleText: "Flying\nWhenever this Vehicle attacks, if defending player controls more lands than you, search your library for a basic Plains card, put it onto the battlefield tapped, then shuffle.\nCrew 2" });
const perplex = card("Perplex", "Instant", "{1}{U}{B}", { cmc: 3, keywords: ["Transmute"], oracleText: "Counter target spell unless its controller discards their hand.\nTransmute {1}{U}{B} ({1}{U}{B}, Discard this card: Search your library for a card with the same mana value as this card, reveal it, put it into your hand, then shuffle. Transmute only as a sorcery.)" });
const instill = card("Instill Energy", "Enchantment — Aura", "{G}", { cmc: 1, keywords: ["Enchant"], oracleText: "Enchant creature\nEnchanted creature can attack as though it had haste.\n{0}: Untap enchanted creature. Activate only during your turn and only once each turn." });
const valkas = card("Ring of Valkas", "Artifact — Equipment", "{2}", { cmc: 2, keywords: ["Equip"], oracleText: "Equipped creature has haste. (It can attack and {T} no matter when it came under your control.)\nAt the beginning of your upkeep, put a +1/+1 counter on equipped creature if it's red.\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)" });
const anvil = card("Anvil of Bogardan", "Artifact", "{2}", { cmc: 2, oracleText: "Players have no maximum hand size.\nAt the beginning of each player's draw step, that player draws an additional card, then discards a card." });
const rhetTomb = card("Rhet-Tomb Mystic", "Creature — Zombie Bird Wizard", "{1}{U}", { cmc: 2, power: "1", toughness: "2", keywords: ["Flying"], oracleText: "Flying\nEach creature card in your hand has cycling {1}{U}. ({1}{U}, Discard that card: Draw a card.)" });
const jo = card("Jo Grant", "Legendary Creature — Human Soldier", "{2}{W}", { cmc: 3, power: "2", toughness: "3", oracleText: "Each historic card in your hand has cycling {2}{W}. ({2}{W}, Discard that card: Draw a card.)\nWhenever you cycle a card, put a +1/+1 counter on Jo Grant.\nDoctor's companion (You can have two commanders if the other is the Doctor.)" });
const questcaller = card("Valley Questcaller", "Legendary Creature — Rabbit Warrior", "{1}{W}", { cmc: 2, power: "2", toughness: "3", oracleText: "Whenever one or more other Rabbits, Bats, Birds, and/or Mice you control enter, scry 1.\nOther Rabbits, Bats, Birds, and Mice you control get +1/+1." });
const packLeader = card("Pack Leader", "Creature — Dog", "{1}{W}", { cmc: 2, power: "2", toughness: "2", oracleText: "Other Dogs you control get +1/+1.\nWhenever this creature attacks, prevent all combat damage that would be dealt this turn to Dogs you control." });
const goShintai = card("Go-Shintai of Life's Origin", "Legendary Enchantment Creature — Shrine", "{3}{G}", { cmc: 4, power: "1", toughness: "4", oracleText: "{W}{U}{B}{R}{G}, {T}: Return target enchantment card from your graveyard to the battlefield.\nWhenever Go-Shintai of Life's Origin or another nontoken Shrine you control enters, create a 1/1 colorless Shrine enchantment creature token." });
const zuko = card("Zuko, Firebending Master", "Legendary Creature — Human Noble Ally", "{1}{R}", { cmc: 2, power: "2", toughness: "2", keywords: ["First strike", "Firebending"], oracleText: "First strike\nFirebending X, where X is the number of experience counters you have. (Whenever this creature attacks, add X {R}. This mana lasts until end of combat.)\nWhenever you cast a spell during combat, you get an experience counter." });
const hammerskull = card("Pugnacious Hammerskull", "Creature — Dinosaur", "{2}{G}", { cmc: 3, power: "6", toughness: "6", oracleText: "Whenever this creature attacks while you don't control another Dinosaur, put a stun counter on it. (If a permanent with a stun counter would become untapped, remove one from it instead.)" });
const awakening = card("Sylvan Awakening", "Sorcery", "{2}{G}", { cmc: 3, oracleText: "Until your next turn, all lands you control become 2/2 Elemental creatures with reach, indestructible, and haste. They're still lands." });
const nissa = card("Nissa, Vital Force", "Legendary Planeswalker — Nissa", "{3}{G}{G}", { cmc: 5, loyalty: "5", oracleText: "+1: Untap target land you control. Until your next turn, it becomes a 5/5 Elemental creature with haste. It's still a land.\n−3: Return target permanent card from your graveyard to your hand.\n−6: You get an emblem with \"Whenever a land you control enters, you may draw a card.\"" });

const rydia = card("Rydia, Summoner of Mist", "Legendary Creature — Human Shaman", "{R}{G}", { cmc: 2, power: "1", toughness: "2", oracleText: "Landfall — Whenever a land you control enters, you may discard a card. If you do, draw a card.\nSummon — {X}, {T}: Return target Saga card with mana value X from your graveyard to the battlefield with a finality counter on it. It gains haste until end of turn. Activate only as a sorcery." });
const saga = card("Test Saga", "Enchantment — Saga", "{1}{W}", { cmc: 2, oracleText: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after II.)\nI — You gain 3 life.\nII — You gain 1 life." });

const merfolk = card("Test Merfolk", "Creature — Merfolk Wizard", "{U}", { cmc: 1, power: "1", toughness: "1" });
const goblin = card("Test Goblin", "Creature — Goblin", "{R}", { cmc: 1, power: "1", toughness: "1" });
const mouse = card("Test Mouse", "Creature — Mouse", "{W}", { cmc: 1, power: "1", toughness: "1" });
const dog = card("Test Dog", "Creature — Dog", "{W}", { cmc: 1, power: "2", toughness: "2" });
const dino = card("Test Dinosaur", "Creature — Dinosaur", "{G}", { cmc: 1, power: "1", toughness: "1" });
const shrine = card("Test Shrine", "Enchantment — Shrine", "{W}", { cmc: 1 });
const walker = card("Test Walker", "Legendary Planeswalker — Ajani", "{3}", { cmc: 3, loyalty: "3" });
const sword = card("Test Sword", "Artifact — Equipment", "{1}", { cmc: 1, keywords: ["Equip"], oracleText: "Equip {1}" });
const shock = card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "Test Shock deals 2 damage to any target." });
const rock = card("Test Rock", "Artifact", "{1}", { cmc: 1 });
const relic = card("Test Relic", "Legendary Artifact", "{1}", { cmc: 1 });
const tapper = card("Test Tapper", "Creature — Human", "{1}", { cmc: 1, power: "1", toughness: "1", oracleText: "{T}: You gain 1 life." });

describe("round 162 cards", () => {
  it("are fully supported", () =>
    supported(rydia, lordOfAtlantis, slash, sentence, knuckles, swarmlord, darien, hauler, sazh, surveyor, perplex, instill, valkas, anvil, rhetTomb, jo, questcaller, packLeader, goShintai, zuko, hammerskull, awakening, nissa));
});

describe("Lord of Atlantis", () => {
  it("gives every other Merfolk +1/+1 and islandwalk, an opponent's too, but not itself or a non-Merfolk", () => {
    const { s, ap, opp } = setup([]);
    const lord = putOnBattlefield(s, ap, lordOfAtlantis);
    const mine = putOnBattlefield(s, ap, merfolk);
    const theirs = putOnBattlefield(s, opp, merfolk);
    const gob = putOnBattlefield(s, ap, goblin);
    expect(pt(s, mine)).toBe("2/2");
    expect(pt(s, theirs)).toBe("2/2");
    expect(kw(s, theirs, "Islandwalk")).toBe(true);
    expect(pt(s, lord)).toBe("2/2");
    expect(kw(s, lord, "Islandwalk")).toBe(false);
    expect(pt(s, gob)).toBe("1/1");
  });
});

describe("Slash the Ranks", () => {
  it("destroys every creature and planeswalker but the commanders", () => {
    const { s: s0, ap, opp, ids } = setup([slash]);
    const cmdr = putOnBattlefield(s0, opp, bear(), { commander: true });
    const b = putOnBattlefield(s0, ap, bear());
    const w = putOnBattlefield(s0, opp, walker);
    const r = putOnBattlefield(s0, ap, rock);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, cmdr)).toBe("battlefield");
    expect(zone(s, b)).toBe("graveyard");
    expect(zone(s, w)).toBe("graveyard");
    expect(zone(s, r)).toBe("battlefield");
  });
});

describe("Suspended Sentence", () => {
  it("destroys an opponent's creature, its controller loses 3 life, and it's exiled with three time counters", () => {
    const { s: s0, ap, opp, ids } = setup([sentence]);
    const b = putOnBattlefield(s0, opp, bear());
    const life = s0.players[opp]!.life;
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(zone(s, b)).toBe("graveyard");
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.players[ap]!.life).toBe(s0.players[ap]!.life);
    expect(zone(s, ids[0]!)).toBe("exile");
    expect(s.objects[ids[0]!]!.counters.time).toBe(3);
  });

  it("can't target your own creature", () => {
    const { s: s0, ap, ids } = setup([sentence]);
    const b = putOnBattlefield(s0, ap, bear());
    expect(planCast(s0, ap, ids[0]!, [tgt(b)])).toBeNull();
  });
});

describe("Brass Knuckles", () => {
  it("gives double strike only while two or more Equipment are attached to the creature", () => {
    const { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, bear());
    const k = putOnBattlefield(s, ap, knuckles);
    s.objects[k]!.attachedTo = b;
    invalidateCharacteristics(s);
    expect(kw(s, b, "Double strike")).toBe(false);
    const sw = putOnBattlefield(s, ap, sword);
    s.objects[sw]!.attachedTo = b;
    invalidateCharacteristics(s);
    expect(kw(s, b, "Double strike")).toBe(true);
    // Equipment on another creature doesn't count.
    const other = putOnBattlefield(s, ap, bear());
    s.objects[sw]!.attachedTo = other;
    invalidateCharacteristics(s);
    expect(kw(s, b, "Double strike")).toBe(false);
    expect(kw(s, other, "Double strike")).toBe(false);
  });
});

describe("Phyrexian Swarmlord", () => {
  it("makes an infect Insect for each poison counter all your opponents have together", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, swarmlord);
    s0.players[opp]!.poison = 2;
    s0.players[next(s0, opp)]!.poison = 1;
    s0.players[ap]!.poison = 4; // yours don't count
    let s = passUntil(s0, "upkeep", ap);
    s = resolveAll(s);
    const insects = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Insect"));
    expect(insects.length).toBe(3);
    expect(kw(s, insects[0]!, "Infect")).toBe(true);
  });
});

describe("King Darien XLVIII", () => {
  it("reads \"King Darien\" as itself: a counter on it and a Soldier, and it can be sacrificed for its tokens", () => {
    const { s: s0, ap } = setup([]);
    const k = putOnBattlefield(s0, ap, darien);
    let s = resolveAll(run(s0, planActivate(s0, ap, k, 0)));
    expect(s.objects[k]!.counters["+1/+1"]).toBe(1);
    const soldier = s.battlefield.find((id) => s.objects[id]!.isToken)!;
    expect(characteristics(s, s.objects[soldier]!).subtypes).toContain("Soldier");
    expect(pt(s, soldier)).toBe("2/2");
    s = resolveAll(run(s, planActivate(s, ap, k, 1)));
    expect(zone(s, k)).toBe("graveyard");
    expect(kw(s, soldier, "Indestructible")).toBe(true);
    expect(kw(s, soldier, "Hexproof")).toBe(true);
  });
});

describe("Hoard Hauler", () => {
  it("makes a Treasure for each artifact the damaged player controls", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, hauler);
    s0.effects.push({ id: "crew", timestamp: s0.nextTimestamp++, controller: ap, sourceName: "test", duration: "endOfTurn", affected: [h], mods: [{ kind: "addTypes", types: ["Creature"], subtypes: [] }] });
    putOnBattlefield(s0, opp, rock);
    putOnBattlefield(s0, opp, rock);
    putOnBattlefield(s0, ap, rock);
    invalidateCharacteristics(s0);
    let s = attack(s0, ap, [{ attacker: h, defender: opp }]);
    s = resolveAll(passUntil(s, "combatDamage", ap));
    s = resolveAll(s);
    const treasures = s.battlefield.filter((id) => s.objects[id]!.isToken && characteristics(s, s.objects[id]!).subtypes.includes("Treasure") && s.objects[id]!.controller === ap);
    expect(treasures.length).toBe(2);
  });
});

describe("Sazh Katzroy", () => {
  it("finds a Bird card or a basic land card", () => {
    const enters = compileCard(sazh).triggers[0]!.body.effects;
    const search = JSON.stringify(enters);
    expect(search).toContain('"anyOf"');
    expect(search).toContain('"Bird"');
    expect(search).toContain('"Basic"');
  });
});

describe("Aerial Surveyor", () => {
  it("fetches a Plains only when the defending player controls more lands, as it attacks and resolves", () => {
    const plainsCard = card("Plains", "Basic Land — Plains");
    for (const more of [true, false]) {
      const { s: s0, ap, opp } = setup([]);
      const v = putOnBattlefield(s0, ap, surveyor);
      s0.effects.push({ id: "crew", timestamp: s0.nextTimestamp++, controller: ap, sourceName: "test", duration: "endOfTurn", affected: [v], mods: [{ kind: "addTypes", types: ["Creature"], subtypes: [] }] });
      // The active player has 14 lands (setup).
      for (let i = 0; i < (more ? 15 : 3); i++) putOnBattlefield(s0, opp, forest);
      const p = into(s0, ap, plainsCard, "library");
      invalidateCharacteristics(s0);
      let s = attack(s0, ap, [{ attacker: v, defender: opp }]);
      expect(s.triggerQueue.length + s.stack.length > 0).toBe(more);
      s = resolveAll(s);
      if (s.pending?.kind === "searchLibrary") s = act(s, { type: "searchLibrary", player: ap, found: [p] });
      s = resolveAll(s);
      expect(zone(s, p)).toBe(more ? "battlefield" : "library");
      if (more) expect(s.objects[p]!.tapped).toBe(true);
    }
  });
});

describe("Perplex", () => {
  /** `ap` casts a bear; the next player answers with Perplex. */
  const perplexed = (handCards: number) => {
    const { s: s0, ap, opp } = setup([bear()]);
    const spell = s0.players[ap]!.hand.at(-1)!;
    // Only the bear in hand.
    s0.players[ap]!.library.push(...s0.players[ap]!.hand.filter((id) => id !== spell).map((id) => ((s0.objects[id]!.zone = "library"), id)));
    s0.players[ap]!.hand = [spell];
    for (const l of [island, island, swamp]) putOnBattlefield(s0, opp, l);
    const p = into(s0, opp, perplex, "hand");
    // Leave `handCards` cards in the caster's hand once the bear is cast.
    for (let i = 0; i < handCards; i++) into(s0, ap, goblin, "hand");
    let s = run(s0, planCast(s0, ap, spell));
    s = act(s, { type: "passPriority", player: ap });
    expect(waitingOn(s)).toBe(opp);
    s = run(s, planCast(s, opp, p, [{ kind: "stack", id: s.stack[0]!.id } as TargetChoice]));
    for (let i = 0; i < 8 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    return { s, ap, opp, spell };
  };

  it("lets the spell's controller discard their hand to keep it", () => {
    const { s: s1, ap, spell } = perplexed(2);
    expect(s1.pending).toMatchObject({ kind: "payUnless", player: ap, discardHand: true });
    let s = act(s1, { type: "payUnless", player: ap, pay: true });
    expect(s.players[ap]!.hand.length).toBe(0);
    expect(s.players[ap]!.graveyard.length).toBe(2);
    s = resolveAll(s);
    expect(zone(s, spell)).toBe("battlefield");
  });

  it("counters it if they don't", () => {
    const { s: s1, ap, spell } = perplexed(2);
    const s = resolveAll(act(s1, { type: "payUnless", player: ap, pay: false }));
    expect(zone(s, spell)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(2);
  });

  it("can be answered with an empty hand (rulings), and a bot does that", () => {
    const { s: s1, ap, spell } = perplexed(0);
    expect(s1.pending).toMatchObject({ kind: "payUnless", player: ap, discardHand: true });
    expect(botActions(s1, ap)).toEqual([{ type: "payUnless", player: ap, pay: true }]);
    const s = resolveAll(act(s1, { type: "payUnless", player: ap, pay: true }));
    expect(zone(s, spell)).toBe("battlefield");
  });

  it("a bot with a bigger hand lets the spell go", () => {
    const { s, ap } = perplexed(3);
    expect(botActions(s, ap)).toEqual([{ type: "payUnless", player: ap, pay: false }]);
  });
});

describe("Instill Energy", () => {
  it("lets the creature attack the turn it arrives, but not use its {T} abilities", () => {
    const { s, ap } = setup([]);
    const t = putOnBattlefield(s, ap, tapper, { sick: true });
    expect(potentialAttackers(s, ap).some((o) => o.id === t)).toBe(false);
    const aura = putOnBattlefield(s, ap, instill);
    s.objects[aura]!.attachedTo = t;
    invalidateCharacteristics(s);
    expect(potentialAttackers(s, ap).some((o) => o.id === t)).toBe(true);
    expect(tapAbilitySick(s, s.objects[t]!)).toBe(true);
    expect(kw(s, t, "Haste")).toBe(false);
  });
});

describe("Ring of Valkas", () => {
  it("puts a counter on the equipped creature at your upkeep only if it's red", () => {
    for (const red of [true, false]) {
      const { s: s0, ap } = setup([]);
      const c = putOnBattlefield(s0, ap, red ? goblin : bear());
      const ring = putOnBattlefield(s0, ap, valkas);
      s0.objects[ring]!.attachedTo = c;
      invalidateCharacteristics(s0);
      expect(kw(s0, c, "Haste")).toBe(true);
      let s = passUntil(s0, "upkeep", ap);
      s = resolveAll(s);
      expect(s.objects[c]!.counters["+1/+1"] ?? 0).toBe(red ? 1 : 0);
    }
  });
});

describe("Anvil of Bogardan", () => {
  it("each player draws an extra card in their draw step, then discards one", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, anvil);
    const opp = next(s0, ap);
    let s = passUntil(s0, "draw", opp);
    const hand = s.players[opp]!.hand.length; // after the normal draw
    const yard = s.players[opp]!.graveyard.length;
    s = resolveAll(s);
    if (s.pending?.kind === "discard") s = act(s, { type: "discard", player: opp, objectIds: [s.players[opp]!.hand[0]!] });
    s = resolveAll(s);
    expect(s.players[opp]!.hand.length).toBe(hand);
    expect(s.players[opp]!.graveyard.length).toBe(yard + 1);
  });
});

describe("Rhet-Tomb Mystic and Jo Grant", () => {
  it("give the creature (or historic) cards in your hand cycling", () => {
    const { s: s0, ap } = setup([bear(), shock, relic]);
    const [b, sh, r] = s0.players[ap]!.hand.slice(-3) as [string, string, string];
    putOnBattlefield(s0, ap, rhetTomb);
    const cycling = (s: GameState, id: string) => abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => a.cycling);
    expect(cycling(s0, b)).toBeGreaterThanOrEqual(0);
    expect(cycling(s0, sh)).toBe(-1);
    expect(cycling(s0, r)).toBe(-1);
    const hand = s0.players[ap]!.hand.length;
    const s = resolveAll(run(s0, planActivate(s0, ap, b, cycling(s0, b))));
    expect(zone(s, b)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand); // one card discarded, one drawn
    // Jo Grant: a legendary artifact is historic (CR 700.6); a cycled card puts a counter on Jo.
    const j = putOnBattlefield(s, ap, jo);
    expect(cycling(s, r)).toBeGreaterThanOrEqual(0);
    const s2 = resolveAll(run(s, planActivate(s, ap, r, cycling(s, r))));
    expect(zone(s2, r)).toBe("graveyard");
    expect(s2.objects[j]!.counters["+1/+1"]).toBe(1);
  });

  it("not another player's cards", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, rhetTomb);
    const theirs = into(s, opp, bear(), "hand");
    expect(abilitiesOf(s, s.objects[theirs]!).activated.some((a) => a.cycling)).toBe(false);
  });
});

describe("Valley Questcaller", () => {
  it("counts Mice (a Mouse) among its creature types", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, questcaller);
    const m = putOnBattlefield(s, ap, mouse);
    const g = putOnBattlefield(s, ap, goblin);
    expect(pt(s, m)).toBe("2/2");
    expect(pt(s, g)).toBe("1/1");
  });
});

describe("Pack Leader", () => {
  it("prevents the combat damage dealt to your Dogs this turn once it attacks", () => {
    const { s: s0, ap, opp } = setup([]);
    const leader = putOnBattlefield(s0, ap, packLeader);
    const d = putOnBattlefield(s0, ap, dog);
    const blocker = putOnBattlefield(s0, opp, card("Test Ogre", "Creature — Ogre", "{2}", { power: "5", toughness: "5" }));
    let s = attack(s0, ap, [{ attacker: leader, defender: opp }, { attacker: d, defender: opp }]);
    s = resolveAll(s);
    s = passUntil(s, "declareBlockers", ap);
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker, attacker: d }] });
    s = resolveAll(passUntil(s, "endCombat", ap));
    expect(zone(s, d)).toBe("battlefield");
    expect(s.objects[d]!.damage).toBe(0);
  });
});

describe("Go-Shintai of Life's Origin", () => {
  it("makes a 1/1 Shrine enchantment creature token when it or another nontoken Shrine enters, not for the token", () => {
    const { s: s0, ap, ids } = setup([goShintai, shrine]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    const tokens = () => s.battlefield.filter((id) => s.objects[id]!.isToken);
    expect(tokens().length).toBe(1);
    const c = characteristics(s, s.objects[tokens()[0]!]!);
    expect(c.types).toEqual(expect.arrayContaining(["Enchantment", "Creature"]));
    expect(c.subtypes).toEqual(["Shrine"]);
    expect(c.colors).toEqual([]);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(tokens().length).toBe(2);
  });
});

describe("Zuko, Firebending Master", () => {
  it("gives you an experience counter for a spell cast during combat, not in a main phase", () => {
    const { s: s0, ap, ids } = setup([shock, shock]);
    putOnBattlefield(s0, ap, zuko);
    const opp = next(s0, ap);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp } as TargetChoice])));
    expect(s.players[ap]!.experience ?? 0).toBe(0);
    s = passUntil(s, "beginCombat", ap);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: opp } as TargetChoice])));
    expect(s.players[ap]!.experience).toBe(1);
  });
});

describe("Pugnacious Hammerskull", () => {
  it("gets a stun counter when it attacks with no other Dinosaur, judged as it attacks", () => {
    for (const other of [false, true]) {
      const { s: s0, ap, opp } = setup([]);
      const h = putOnBattlefield(s0, ap, hammerskull);
      if (other) putOnBattlefield(s0, ap, dino);
      const s = resolveAll(attack(s0, ap, [{ attacker: h, defender: opp }]));
      expect(s.objects[h]!.counters.stun ?? 0).toBe(other ? 0 : 1);
    }
  });
});

describe("Sylvan Awakening and Nissa, Vital Force", () => {
  it("turn your lands into creatures until your next turn: through the others' turns, not after", () => {
    const { s: s0, ap, ids } = setup([awakening]);
    const land = s0.battlefield.find((id) => s0.objects[id]!.controller === ap && characteristics(s0, s0.objects[id]!).types.includes("Land"))!;
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    const c = () => characteristics(s, s.objects[land]!);
    expect(c().types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(pt(s, land)).toBe("2/2");
    expect(kw(s, land, "Indestructible")).toBe(true);
    s = passUntil(s, "main1", next(s, ap));
    expect(c().types).toContain("Creature");
    s = passUntil(s, "main1", ap);
    expect(c().types).not.toContain("Creature");
  });

  it("Nissa's +1 untaps the land and makes it a 5/5 haste Elemental until your next turn", () => {
    const { s: s0, ap } = setup([]);
    const n = putOnBattlefield(s0, ap, nissa);
    s0.objects[n]!.counters.loyalty = 5;
    const land = s0.battlefield.find((id) => s0.objects[id]!.controller === ap && characteristics(s0, s0.objects[id]!).types.includes("Land"))!;
    s0.objects[land]!.tapped = true;
    let s = resolveAll(run(s0, planActivate(s0, ap, n, 0, [tgt(land)])));
    expect(s.objects[land]!.tapped).toBe(false);
    expect(pt(s, land)).toBe("5/5");
    expect(kw(s, land, "Haste")).toBe(true);
    expect(characteristics(s, s.objects[land]!).subtypes).toEqual(expect.arrayContaining(["Elemental"]));
    s = passUntil(s, "main1", next(s, ap));
    expect(pt(s, land)).toBe("5/5");
    s = passUntil(s, "main1", ap);
    expect(characteristics(s, s.objects[land]!).types).not.toContain("Creature");
  });
});

describe("Rydia, Summoner of Mist", () => {
  it("returns a Saga card with mana value X with a finality counter: chapter I triggers, and it's exiled after its last chapter", () => {
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, rydia);
    const sg = into(s0, ap, saga, "graveyard");
    const other = into(s0, ap, bear(), "graveyard");
    // Only a Saga card, and only one with mana value X.
    expect(planActivate(s0, ap, r, 0, [tgt(other)], undefined, undefined, 2)).toBeNull();
    expect(planActivate(s0, ap, r, 0, [tgt(sg)], undefined, undefined, 1)).toBeNull();
    const life = s0.players[ap]!.life;
    let s = resolveAll(run(s0, planActivate(s0, ap, r, 0, [tgt(sg)], undefined, undefined, 2)));
    expect(zone(s, sg)).toBe("battlefield");
    expect(s.objects[sg]!.counters.finality).toBe(1);
    expect(s.objects[sg]!.counters.lore).toBe(1);
    expect(s.players[ap]!.life).toBe(life + 3);
    // Chapter II after the next draw step, then it's sacrificed: exiled instead (finality counter).
    s = resolveAll(passUntil(s, "main1", next(s, s.turnOrder[(s.turnOrder.indexOf(ap) + 2) % 4]!)));
    s = resolveAll(passUntil(s, "main1", ap));
    s = resolveAll(s);
    expect(s.players[ap]!.life).toBe(life + 4);
    expect(zone(s, sg)).toBe("exile");
  });
});
