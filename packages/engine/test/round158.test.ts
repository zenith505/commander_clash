// Round 158: the most played cards, in popularity order, starting with Phyrexian Scriptures.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, pt, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, blockProblem, botActions, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, objIsType, planActivate, planCast, potentialAttackers, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
/** Passes until the stack and the trigger queue are empty, stopping at any question. */
const settle = (s: GameState) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length) && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
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
const nameOf = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const mine = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && nameOf(s, id) === name);
/** An attacker for block checks: a bear of `pid`'s, attacking. */
const bear0 = (s: GameState, pid: PlayerId) => putOnBattlefield(s, pid, bear());
const others = (s: GameState, ap: PlayerId) => s.turnOrder.filter((p) => p !== ap);
const lands = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && objIsType(s, s.objects[id]!, "Land"));
/** Taps every land `pid` controls except `keep` of them named `name`. */
const tapAllBut = (s: GameState, pid: PlayerId, name: string, keep: number) => {
  let left = keep;
  for (const id of lands(s, pid)) {
    if (nameOf(s, id) === name && left > 0) left--;
    else s.objects[id]!.tapped = true;
  }
};

// Real oracle text (Scryfall).
const scriptures = card("Phyrexian Scriptures", "Enchantment — Saga", "{2}{B}{B}", {cmc: 4, oracleText: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Put a +1/+1 counter on up to one target creature. That creature becomes an artifact in addition to its other types.\nII — Destroy all nonartifact creatures.\nIII — Exile all opponents' graveyards."});
const garnet = card("Garnet, Princess of Alexandria", "Legendary Creature — Human Noble Cleric", "{G}{W}", {cmc: 2, power: "2", toughness: "2", keywords: ["Lifelink"], oracleText: "Lifelink\nWhenever Garnet attacks, you may remove a lore counter from each of any number of Sagas you control. Put a +1/+1 counter on Garnet for each lore counter removed this way."});
const dinosaurs = card("Displaced Dinosaurs", "Creature — Dinosaur", "{5}{G}{G}", {cmc: 7, power: "7", toughness: "7", oracleText: "As a historic permanent you control enters, it becomes a 7/7 Dinosaur creature in addition to its other types. (Artifacts, legendaries, and Sagas are historic.)"});
const radagast = card("Radagast of Rhosgobel", "Legendary Creature — Avatar Wizard", "{2}{G}{G}", {cmc: 4, power: "2", toughness: "5", oracleText: "The first creature spell you cast each turn costs {2} less to cast and can be cast as though it had flash."});
const hawk = card("Cartographer's Hawk", "Creature — Bird", "{1}{W}", {cmc: 2, power: "2", toughness: "1", keywords: ["Flying"], oracleText: "Flying\nWhen this creature deals combat damage to a player who controls more lands than you, return it to its owner's hand. If you do, you may search your library for a Plains card, put it onto the battlefield tapped, then shuffle."});
const theater = card("Theater of Horrors", "Enchantment", "{1}{B}{R}", {cmc: 3, oracleText: "At the beginning of your upkeep, exile the top card of your library.\nDuring your turn, if an opponent lost life this turn, you may play lands and cast spells from among cards exiled with this enchantment.\n{3}{R}: This enchantment deals 1 damage to target opponent or planeswalker."});
const olorin = card("Olórin's Searing Light", "Instant", "{2}{R}{W}", {cmc: 4, keywords: ["Spell mastery"], oracleText: "Each opponent exiles a creature with the greatest power among creatures that player controls.\nSpell mastery — If there are two or more instant and/or sorcery cards in your graveyard, Olórin's Searing Light deals damage to each opponent equal to the power of the creature they exiled."});
const felisa = card("Felisa, Fang of Silverquill", "Legendary Creature — Vampire Wizard", "{2}{W}{B}", {cmc: 4, power: "3", toughness: "2", keywords: ["Flying","Mentor"], oracleText: "Flying\nMentor (Whenever this creature attacks, put a +1/+1 counter on target attacking creature with lesser power.)\nWhenever a nontoken creature you control dies, if it had counters on it, create X tapped 2/1 white and black Inkling creature tokens with flying, where X is the number of counters it had on it."});
const raven = card("The Raven Man", "Legendary Creature — Human Wizard", "{1}{B}", {cmc: 2, power: "2", toughness: "1", oracleText: "At the beginning of each end step, if a player discarded a card this turn, create a 1/1 black Bird creature token with flying and \"This token can't block.\"\n{3}{B}, {T}: Each opponent discards a card. Activate only as a sorcery."});
const anthem = card("Marshal's Anthem", "Enchantment", "{2}{W}{W}", {cmc: 4, keywords: ["Multikicker"], oracleText: "Multikicker {1}{W} (You may pay an additional {1}{W} any number of times as you cast this spell.)\nCreatures you control get +1/+1.\nWhen this enchantment enters, return up to X target creature cards from your graveyard to the battlefield, where X is the number of times this enchantment was kicked."});
const reject = card("Reject Imperfection", "Instant", "{1}{U}{U}", {cmc: 3, keywords: ["Proliferate"], oracleText: "Counter target spell. If that spell's mana value was 3 or less, proliferate. (Choose any number of permanents and/or players, then give each another counter of each kind already there.)"});
const brew = card("Deadly Brew", "Sorcery", "{B}{G}", {cmc: 2, oracleText: "Each player sacrifices a creature or planeswalker of their choice. If you sacrificed a permanent this way, you may return another permanent card from your graveyard to your hand."});
const arsenal = card("Machinist's Arsenal", "Artifact — Equipment", "{4}{W}", {cmc: 5, keywords: ["Machina","Job select","Equip"], oracleText: "Job select (When this Equipment enters, create a 1/1 colorless Hero creature token, then attach this to it.)\nEquipped creature gets +2/+2 for each artifact you control and is an Artificer in addition to its other types.\nMachina — Equip {4} ({4}: Attach to target creature you control. Equip only as a sorcery.)"});
const titan = card("Towering Titan", "Creature — Giant", "{4}{G}{G}", {cmc: 6, power: "0", toughness: "0", oracleText: "This creature enters with X +1/+1 counters on it, where X is the total toughness of other creatures you control.\nSacrifice a creature with defender: All creatures gain trample until end of turn."});
const cutDown = card("Cut Down", "Instant", "{B}", {cmc: 1, oracleText: "Destroy target creature with total power and toughness 5 or less."});
const presence = card("Death's Presence", "Enchantment", "{5}{G}", {cmc: 6, oracleText: "Whenever a creature you control dies, put X +1/+1 counters on target creature you control, where X is the power of the creature that died."});
const highScore = card("High Score", "Enchantment", "{2}{G}", {cmc: 3, oracleText: "If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead.\nAt the beginning of your end step, draw a card if you control a creature with the greatest power among creatures on the battlefield."});
const bridge = card("Ensnaring Bridge", "Artifact", "{3}", {cmc: 3, oracleText: "Creatures with power greater than the number of cards in your hand can't attack."});
const animus = card("Ancient Animus", "Instant", "{1}{G}", {cmc: 2, keywords: ["Fight"], oracleText: "Put a +1/+1 counter on target creature you control if it's legendary. Then it fights target creature an opponent controls. (Each deals damage equal to its power to the other.)"});
const gyome = card("Gyome, Master Chef", "Legendary Creature — Troll Warlock", "{2}{B}{G}", {cmc: 4, power: "5", toughness: "3", keywords: ["Food","Trample"], oracleText: "Trample\nAt the beginning of your end step, create a number of Food tokens equal to the number of nontoken creatures you had enter the battlefield under your control this turn.\n{1}, Sacrifice a Food: Target creature gains indestructible until end of turn. Tap it."});
const fade = card("Fade from History", "Sorcery", "{2}{G}{G}", {cmc: 4, oracleText: "Each player who controls an artifact or enchantment creates a 2/2 green Bear creature token. Then destroy all artifacts and enchantments."});

const rock = card("Test Rock", "Artifact", "{2}", { cmc: 2, oracleText: "{T}: Add {C}." });
const charm = card("Test Charm", "Enchantment", "{1}{W}", { cmc: 2 });
const lord = card("Test Lord", "Legendary Creature — Human", "{1}{W}", { cmc: 2, power: "2", toughness: "2" });
const ogre = card("Test Ogre", "Creature — Ogre", "{3}{R}", { cmc: 4, power: "4", toughness: "4" });
const saga = card("Test Saga", "Enchantment — Saga", "{1}{U}", { cmc: 2, oracleText: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Draw a card.\nII — Draw a card.\nIII — Draw two cards." });
const bolt = card("Test Bolt", "Instant", "{R}", { cmc: 1, oracleText: "Test Bolt deals 3 damage to any target." });
const shock = card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "Test Shock deals 2 damage to any target." });
const murder = card("Test Murder", "Instant", "{B}", { cmc: 1, oracleText: "Destroy target creature." });
const divination = card("Test Divination", "Sorcery", "{2}{U}", { cmc: 3, oracleText: "Draw two cards." });
const wall = card("Test Wall", "Creature — Wall", "{1}{W}", { cmc: 2, power: "0", toughness: "4", keywords: ["Defender"], oracleText: "Defender" });

describe("round 158 cards", () => {
  it("are fully supported", () => supported(scriptures, garnet, dinosaurs, radagast, hawk, theater, olorin, felisa, raven, anthem));
  it("and these, from the same pieces", () => supported(reject, brew, arsenal, titan, cutDown, presence, highScore, bridge, animus, gyome, fade));
});

describe("Phyrexian Scriptures", () => {
  it("I: a +1/+1 counter on up to one target creature, which becomes an artifact; II: destroys all nonartifact creatures; III: exiles all opponents' graveyards", () => {
    const { s: s0, ap, ids } = setup([scriptures]);
    const opp = others(s0, ap)[0]!;
    const b = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, opp, ogre);
    const art = putOnBattlefield(s0, opp, card("Test Golem", "Artifact Creature — Golem", "{3}", { power: "3", toughness: "3" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [obj(b)] }));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    expect(characteristics(s, s.objects[b]!).types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(characteristics(s, s.objects[b]!).subtypes).toEqual(["Bear"]);
    // Chapter II after the next draw step: the bear, now an artifact, and the Golem survive.
    const yardCard = into(s, opp, bolt, "graveyard");
    s = settle(passUntil(passUntil(s, "upkeep", opp), "main1", ap, 4000));
    expect(s.objects[ids[0]!]!.counters.lore).toBe(2);
    expect(zone(s, b)).toBe("battlefield");
    expect(zone(s, art)).toBe("battlefield");
    expect(zone(s, theirs)).toBe("graveyard");
    // Chapter III: the opponents' graveyards are exiled, not ours.
    const ownCard = into(s, ap, bolt, "graveyard");
    s = settle(passUntil(passUntil(s, "upkeep", opp), "main1", ap, 4000));
    expect(zone(s, yardCard)).toBe("exile");
    expect(zone(s, theirs)).toBe("exile");
    expect(zone(s, ownCard)).toBe("graveyard");
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });
});

describe("Garnet, Princess of Alexandria", () => {
  it("removes a lore counter from each of any number of Sagas you control and gets a +1/+1 counter for each removed", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, garnet);
    const a = putOnBattlefield(s0, ap, saga);
    const b = putOnBattlefield(s0, ap, saga);
    const c = putOnBattlefield(s0, ap, saga);
    s0.objects[a]!.counters.lore = 2;
    s0.objects[b]!.counters.lore = 1;
    // An opponent's Saga isn't ours to choose.
    const theirs = putOnBattlefield(s0, others(s0, ap)[0]!, saga);
    s0.objects[theirs]!.counters.lore = 1;
    let s = settle(attack(s0, ap, [{ attacker: g, defender: others(s0, ap)[0]! }]));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, anyNumber: true });
    const p = s.pending as Extract<GameState["pending"], { kind: "pickPermanents" }>;
    expect(p.options).toEqual(expect.arrayContaining([a, b, c]));
    expect(p.options).not.toContain(theirs);
    const none = settle(act(structuredClone(s), { type: "pickPermanents", player: ap, ids: [] }));
    expect(none.objects[g]!.counters["+1/+1"] ?? 0).toBe(0);
    // Saga c has no lore counter to remove: only two are removed.
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [a, b, c] }));
    expect(s.objects[a]!.counters.lore).toBe(1);
    expect(s.objects[b]!.counters.lore ?? 0).toBe(0);
    expect(s.objects[g]!.counters["+1/+1"]).toBe(2);
    expect(pt(s, g)).toBe("4/4");
  });

  it("the bot picks each of its Sagas that has a lore counter", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, garnet);
    const a = putOnBattlefield(s0, ap, saga);
    // One with no lore counter on it: nothing to remove.
    putOnBattlefield(s0, ap, saga);
    s0.objects[a]!.counters.lore = 2;
    const s = settle(attack(s0, ap, [{ attacker: g, defender: others(s0, ap)[0]! }]));
    expect(botActions(s, ap)).toEqual([{ type: "pickPermanents", player: ap, ids: [a] }]);
  });

  it("lets a Saga's chapter trigger again after the next draw step", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, garnet);
    const a = putOnBattlefield(s0, ap, saga);
    s0.objects[a]!.counters.lore = 1;
    let s = settle(attack(s0, ap, [{ attacker: g, defender: others(s0, ap)[0]! }]));
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [a] }));
    expect(s.objects[a]!.counters.lore ?? 0).toBe(0);
    s = passUntil(s, "draw", ap, 4000);
    const hand = s.players[ap]!.hand.length;
    s = settle(passUntil(s, "main1", ap));
    // The draw step's card, then chapter I again (CR 714.2c, 714.3b).
    expect(s.objects[a]!.counters.lore).toBe(1);
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
});

describe("Displaced Dinosaurs", () => {
  it("makes each historic permanent you control a 7/7 Dinosaur creature as it enters, in addition to its other types", () => {
    const { s: s0, ap, ids } = setup([rock, lord, bear()]);
    putOnBattlefield(s0, ap, dinosaurs);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    const ch = characteristics(s, s.objects[ids[0]!]!);
    expect(ch.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(ch.subtypes).toContain("Dinosaur");
    expect(pt(s, ids[0]!)).toBe("7/7");
    // A legendary creature: a 7/7 Human Dinosaur.
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(pt(s, ids[1]!)).toBe("7/7");
    expect(characteristics(s, s.objects[ids[1]!]!).subtypes).toEqual(expect.arrayContaining(["Human", "Dinosaur"]));
    // A bear isn't historic.
    s = resolveAll(run(s, planCast(s, ap, ids[2]!)));
    expect(pt(s, ids[2]!)).toBe("2/2");
  });

  it("doesn't change an opponent's artifact, nor one already on the battlefield, and the change lasts after the Dinosaurs leave", () => {
    const { s: s0, ap, ids } = setup([rock, murder]);
    const opp = others(s0, ap)[0]!;
    const before = putOnBattlefield(s0, ap, rock);
    const d = putOnBattlefield(s0, ap, dinosaurs);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    putOnBattlefield(s, opp, rock);
    expect(s.battlefield.filter((id) => objIsType(s, s.objects[id]!, "Creature") && nameOf(s, id) === "Test Rock")).toEqual([ids[0]]);
    expect(objIsType(s, s.objects[before]!, "Creature")).toBe(false);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [obj(d)])));
    expect(zone(s, d)).toBe("graveyard");
    expect(pt(s, ids[0]!)).toBe("7/7");
  });
});

describe("Radagast of Rhosgobel", () => {
  it("the first creature spell you cast each turn costs {2} less and can be cast as though it had flash", () => {
    const { s: s0, ap, ids } = setup([ogre, bear()]);
    putOnBattlefield(s0, ap, radagast);
    // Only two Mountains untapped: the Ogre costs {1}{R}.
    const s1 = structuredClone(s0);
    tapAllBut(s1, ap, "Mountain", 2);
    let s = resolveAll(run(s1, planCast(s1, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    // The second one pays full price.
    tapAllBut(s, ap, "Forest", 1);
    expect(planCast(s, ap, ids[1]!)).toBeNull();
    // Flash: in the end step, the first creature spell of the turn.
    const t = passUntil(structuredClone(s0), "end", ap);
    expect(planCast(t, ap, ids[1]!)).not.toBeNull();
  });

  it("doesn't count only the spells after it: a creature cast before Radagast was the first", () => {
    const { s: s0, ap, ids } = setup([bear(), radagast, ogre]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    s = passUntil(s, "end", ap);
    expect(planCast(s, ap, ids[2]!)).toBeNull();
  });
});

describe("Cartographer's Hawk", () => {
  const ready = (extraLands: number) => {
    const { s: s0, ap } = setup([bolt]);
    const opp = others(s0, ap)[0]!;
    const h = putOnBattlefield(s0, ap, hawk);
    for (let i = 0; i < lands(s0, ap).length + extraLands; i++) putOnBattlefield(s0, opp, card("Forest", "Basic Land — Forest"));
    const pl = into(s0, ap, card("Plains", "Basic Land — Plains"), "library");
    return { s0, ap, opp, h, pl };
  };
  const hit = (s: GameState, ap: PlayerId, opp: PlayerId, h: string) => settle(passUntil(attack(s, ap, [{ attacker: h, defender: opp }]), "combatDamage", ap));

  it("returns to its owner's hand after hitting a player with more lands, then may fetch a Plains tapped", () => {
    const { s0, ap, opp, h, pl } = ready(1);
    let s = hit(s0, ap, opp, h);
    expect(zone(s, h)).toBe("hand");
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = act(s, { type: "chooseMay", player: ap, yes: true });
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [pl] }));
    expect(zone(s, pl)).toBe("battlefield");
    expect(s.objects[pl]!.tapped).toBe(true);
  });

  it("doesn't trigger against a player with as many lands as you", () => {
    const { s0, ap, opp, h } = ready(0);
    const s = hit(s0, ap, opp, h);
    expect(zone(s, h)).toBe("battlefield");
    expect(s.pending).toBeNull();
  });

  it("doesn't search if it didn't return: killed in response", () => {
    const { s0, ap, opp, h, pl } = ready(1);
    let s = passUntil(attack(s0, ap, [{ attacker: h, defender: opp }]), "combatDamage", ap);
    for (let i = 0; i < 10 && !s.stack.length; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.stack).toHaveLength(1);
    const boltId = s.players[ap]!.hand.find((id) => nameOf(s, id) === "Test Bolt")!;
    s = settle(run(s, planCast(s, ap, boltId, [obj(h)])));
    expect(zone(s, h)).toBe("graveyard");
    expect(s.pending).toBeNull();
    expect(zone(s, pl)).toBe("library");
  });
});

describe("Theater of Horrors", () => {
  it("exiles the top card each upkeep; you may play it during your turn only if an opponent lost life this turn", () => {
    const { s: s0, ap, ids } = setup([bolt]);
    const opp = others(s0, ap)[0]!;
    putOnBattlefield(s0, ap, theater);
    let s = passUntil(s0, "upkeep", opp);
    const top = into(s, ap, ogre, "library");
    s = settle(passUntil(s, "upkeep", ap, 4000));
    expect(zone(s, top)).toBe("exile");
    s = passUntil(s, "main1", ap);
    expect(planCast(s, ap, top)).toBeNull();
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(planCast(s, ap, top)).not.toBeNull();
    s = resolveAll(run(s, planCast(s, ap, top)));
    expect(zone(s, top)).toBe("battlefield");
  });

  it("deals 1 damage to target opponent for {3}{R}", () => {
    const { s: s0, ap } = setup([]);
    const opp = others(s0, ap)[0]!;
    const t = putOnBattlefield(s0, ap, theater);
    const life = s0.players[opp]!.life;
    const i = abilitiesOf(s0, s0.objects[t]!).activated.findIndex((a) => /damage/.test(a.text));
    const s = resolveAll(run(s0, planActivate(s0, ap, t, i, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 1);
    expect(planActivate(s0, ap, t, i, [{ kind: "player", id: ap }])).toBeNull();
  });
});

describe("Olórin's Searing Light", () => {
  const ready = () => {
    const { s: s0, ap, ids } = setup([olorin]);
    const [b, c, d] = others(s0, ap);
    const big = putOnBattlefield(s0, b!, ogre);
    const small = putOnBattlefield(s0, b!, bear());
    const t1 = putOnBattlefield(s0, c!, bear());
    const t2 = putOnBattlefield(s0, c!, bear());
    const own = putOnBattlefield(s0, ap, ogre);
    return { s0, ap, ids, b: b!, c: c!, d: d!, big, small, t1, t2, own };
  };

  it("each opponent exiles a creature with the greatest power among theirs, choosing among ties", () => {
    const { s0, ap, ids, b, c, d, big, small, t1, t2, own } = ready();
    const life = [b, c, d].map((p) => s0.players[p]!.life);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: c, action: "exile" });
    expect((s.pending as { options: string[] }).options.sort()).toEqual([t1, t2].sort());
    s = settle(act(s, { type: "pickPermanents", player: c, ids: [t2] }));
    expect(zone(s, big)).toBe("exile");
    expect(zone(s, small)).toBe("battlefield");
    expect(zone(s, t1)).toBe("battlefield");
    expect(zone(s, t2)).toBe("exile");
    expect(zone(s, own)).toBe("battlefield");
    // Without spell mastery, no damage.
    expect([b, c, d].map((p) => s.players[p]!.life)).toEqual(life);
  });

  it("spell mastery: deals each opponent damage equal to the power their exiled creature had", () => {
    const { s0, ap, ids, b, c, d, big, t1 } = ready();
    into(s0, ap, bolt, "graveyard");
    into(s0, ap, divination, "graveyard");
    s0.objects[big]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    const life = [b, c, d].map((p) => s0.players[p]!.life);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(act(s, { type: "pickPermanents", player: c, ids: [t1] }));
    expect([b, c, d].map((p) => s.players[p]!.life)).toEqual([life[0]! - 5, life[1]! - 2, life[2]!]);
  });
});

describe("Felisa, Fang of Silverquill", () => {
  it("when a nontoken creature you control with counters dies, creates that many tapped 2/1 flying Inklings", () => {
    const { s: s0, ap, ids } = setup([murder, murder, murder]);
    putOnBattlefield(s0, ap, felisa);
    putOnBattlefield(s0, ap, card("Swamp", "Basic Land — Swamp"));
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[b]!.counters = { "+1/+1": 2, flying: 1 };
    const plain = putOnBattlefield(s0, ap, bear());
    const tok = putOnBattlefield(s0, ap, bear({ name: "Bear Token" }));
    s0.objects[tok]!.isToken = true;
    s0.objects[tok]!.counters = { "+1/+1": 1 };
    invalidateCharacteristics(s0);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(b)])));
    const inklings = () => s.battlefield.filter((id) => s.objects[id]!.isToken && nameOf(s, id).includes("Inkling"));
    expect(inklings()).toHaveLength(3);
    for (const id of inklings()) {
      expect(pt(s, id)).toBe("2/1");
      expect(s.objects[id]!.tapped).toBe(true);
    }
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [obj(plain)])));
    s = resolveAll(run(s, planCast(s, ap, ids[2]!, [obj(tok)])));
    expect(inklings()).toHaveLength(3);
  });
});

describe("The Raven Man", () => {
  it("each end step, if a player discarded a card this turn, makes a 1/1 flying Bird that can't block", () => {
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, raven);
    const birds = (s: GameState) => s.battlefield.filter((id) => s.objects[id]!.isToken && nameOf(s, id).includes("Bird"));
    // No discard: no Bird.
    let t = settle(passUntil(structuredClone(s0), "end", ap));
    expect(birds(t)).toHaveLength(0);
    // Each opponent discards.
    const i = abilitiesOf(s0, s0.objects[r]!).activated.findIndex((a) => /discards/.test(a.text));
    let s = run(s0, planActivate(s0, ap, r, i));
    for (let k = 0; k < 40 && (s.stack.length || s.pending); k++) {
      const p = s.pending;
      if (p?.kind === "discard") s = act(s, { type: "discard", player: p.player, objectIds: s.players[p.player]!.hand.slice(0, p.count) });
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(s.turnLog?.discards?.length).toBeGreaterThan(0);
    s = settle(passUntil(s, "end", ap));
    expect(birds(s)).toHaveLength(1);
    const bird = birds(s)[0]!;
    expect(pt(s, bird)).toBe("1/1");
    expect(blockProblem(s, s.objects[bird]!, s.objects[bear0(s, others(s, ap)[0]!)]!, ap)).toMatch(/can't block/);
    // Activate only as a sorcery.
    expect(planActivate(s, ap, r, i)).toBeNull();
  });
});

describe("Marshal's Anthem", () => {
  it("returns up to X creature cards from your graveyard, X the number of times it was kicked", () => {
    const { s: s0, ap, ids } = setup([anthem]);
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, ap, card("Plains", "Basic Land — Plains"));
    const yard = [into(s0, ap, bear(), "graveyard"), into(s0, ap, ogre, "graveyard"), into(s0, ap, wall, "graveyard")];
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { kicks: [0, 0] })));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", x: 2 });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: yard.map(obj) })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [obj(yard[0]!), obj(yard[1]!)] }));
    expect(zone(s, yard[0]!)).toBe("battlefield");
    expect(zone(s, yard[1]!)).toBe("battlefield");
    expect(zone(s, yard[2]!)).toBe("graveyard");
    // Creatures you control get +1/+1.
    expect(pt(s, yard[0]!)).toBe("3/3");
  });

  it("unkicked, returns nothing", () => {
    const { s: s0, ap, ids } = setup([anthem]);
    const b = into(s0, ap, bear(), "graveyard");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeNull();
    expect(zone(s, b)).toBe("graveyard");
  });
});

describe("Reject Imperfection", () => {
  it("counters target spell and proliferates if its mana value was 3 or less", () => {
    const { s: s0, ap, ids } = setup([divination, reject, ogre, reject]);
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, card("Island", "Basic Land — Island"));
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[b]!.counters["+1/+1"] = 1;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: s.stack[0]!.id }])));
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.objects[b]!.counters["+1/+1"]).toBe(2);
    // A 4-mana spell: countered, no proliferate.
    s = run(s, planCast(s, ap, ids[2]!));
    s = settle(run(s, planCast(s, ap, ids[3]!, [{ kind: "stack", id: s.stack[0]!.id }])));
    expect(zone(s, ids[2]!)).toBe("graveyard");
    expect(s.objects[b]!.counters["+1/+1"]).toBe(2);
  });
});

describe("Deadly Brew", () => {
  it("each player sacrifices a creature or planeswalker; then you may return another permanent card from your graveyard", () => {
    const { s: s0, ap, ids } = setup([brew]);
    const [b, c] = others(s0, ap);
    const mineBear = putOnBattlefield(s0, ap, bear());
    const theirs = putOnBattlefield(s0, b!, ogre);
    const art = putOnBattlefield(s0, c!, rock);
    const ch = into(s0, ap, charm, "graveyard");
    const spell = into(s0, ap, bolt, "graveyard");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    for (let k = 0; k < 10 && s.pending?.kind === "pickPermanents"; k++) {
      const p = s.pending as Extract<GameState["pending"], { kind: "pickPermanents" }>;
      expect(p.kind).toBe("pickPermanents");
      s = act(s, { type: "pickPermanents", player: p.player, ids: p.options.slice(0, p.count) });
    }
    expect(zone(s, mineBear)).toBe("graveyard");
    expect(zone(s, theirs)).toBe("graveyard");
    expect(zone(s, art)).toBe("battlefield");
    // The bear sacrificed this way isn't "another" permanent card, nor is an instant a permanent card.
    const p = s.pending as Extract<GameState["pending"], { kind: "searchLibrary" }>;
    expect(p).toMatchObject({ kind: "searchLibrary", player: ap });
    expect(p.cards).toContain(ch);
    expect(p.cards).not.toContain(mineBear);
    expect(p.cards).not.toContain(spell);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [ch] }));
    expect(zone(s, ch)).toBe("hand");
  });

  it("returns nothing if you sacrificed nothing", () => {
    const { s: s0, ap, ids } = setup([brew]);
    putOnBattlefield(s0, others(s0, ap)[0]!, ogre);
    const ch = into(s0, ap, charm, "graveyard");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toBeNull();
    expect(zone(s, ch)).toBe("graveyard");
  });
});

describe("Machinist's Arsenal", () => {
  it("job select: a 1/1 Hero equipped with it, +2/+2 for each artifact you control, and an Artificer", () => {
    const { s: s0, ap, ids } = setup([arsenal]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    const hero = s.objects[ids[0]!]!.attachedTo!;
    expect(s.objects[hero]!.isToken).toBe(true);
    expect(pt(s, hero)).toBe("3/3");
    expect(characteristics(s, s.objects[hero]!).subtypes).toEqual(expect.arrayContaining(["Hero", "Artificer"]));
    putOnBattlefield(s, ap, rock);
    putOnBattlefield(s, others(s, ap)[0]!, rock);
    expect(pt(s, hero)).toBe("5/5");
  });
});

describe("Towering Titan", () => {
  it("enters with +1/+1 counters equal to the total toughness of other creatures you control", () => {
    const { s: s0, ap, ids } = setup([titan]);
    putOnBattlefield(s0, ap, bear());
    const w = putOnBattlefield(s0, ap, wall);
    putOnBattlefield(s0, others(s0, ap)[0]!, ogre);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(6);
    expect(pt(s, ids[0]!)).toBe("6/6");
    // Sacrifice a creature with defender: all creatures gain trample.
    const b = s.battlefield.find((id) => nameOf(s, id) === "Grizzly Bears")!;
    expect(planActivate(s, ap, ids[0]!, 0, undefined, undefined, undefined, undefined, { sacrifice: [b] })).toBeNull();
    s = resolveAll(run(s, planActivate(s, ap, ids[0]!, 0, undefined, undefined, undefined, undefined, { sacrifice: [w] })));
    expect(zone(s, w)).toBe("graveyard");
    const ogreId = s.battlefield.find((id) => nameOf(s, id) === "Test Ogre")!;
    expect(objHasKeyword(s, s.objects[ids[0]!]!, "Trample")).toBe(true);
    expect(objHasKeyword(s, s.objects[ogreId]!, "Trample")).toBe(true);
    // No creature with defender left: it can't be activated.
    expect(planActivate(s, ap, ids[0]!, 0)).toBeNull();
  });
});

describe("Cut Down", () => {
  it("destroys only a creature with total power and toughness 5 or less", () => {
    const { s: s0, ap, ids } = setup([cutDown]);
    const opp = others(s0, ap)[0]!;
    const b = putOnBattlefield(s0, opp, bear());
    const big = putOnBattlefield(s0, opp, bear());
    s0.objects[big]!.counters["+1/+1"] = 1;
    const three = putOnBattlefield(s0, opp, card("Test Raider", "Creature — Human", "{2}{R}", { power: "3", toughness: "2" }));
    invalidateCharacteristics(s0);
    expect(planCast(s0, ap, ids[0]!, [obj(big)])).toBeNull();
    expect(planCast(s0, ap, ids[0]!, [obj(three)])).not.toBeNull();
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(b)])));
    expect(zone(s, b)).toBe("graveyard");
  });
});

describe("Death's Presence", () => {
  it("puts +1/+1 counters equal to the dead creature's power on target creature you control", () => {
    const { s: s0, ap, ids } = setup([murder]);
    putOnBattlefield(s0, ap, presence);
    const o = putOnBattlefield(s0, ap, ogre);
    s0.objects[o]!.counters["+1/+1"] = 1;
    const b = putOnBattlefield(s0, ap, bear());
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [obj(o)])));
    if (s.pending?.kind === "chooseTargets") s = settle(act(s, { type: "chooseTargets", player: ap, targets: [obj(b)] }));
    expect(s.objects[b]!.counters["+1/+1"]).toBe(5);
  });
});

describe("High Score", () => {
  it("puts one more +1/+1 counter on a creature you control", () => {
    const { s: s0, ap, ids } = setup([animus]);
    putOnBattlefield(s0, ap, highScore);
    const l = putOnBattlefield(s0, ap, lord);
    const theirs = putOnBattlefield(s0, others(s0, ap)[0]!, bear());
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(l), obj(theirs)])));
    expect(s.objects[l]!.counters["+1/+1"]).toBe(2);
  });

  it("draws at your end step if you control a creature with the greatest power, a tie included", () => {
    const { s: s0, ap } = setup([]);
    const opp = others(s0, ap)[0]!;
    putOnBattlefield(s0, ap, highScore);
    putOnBattlefield(s0, ap, ogre);
    const theirs = putOnBattlefield(s0, opp, ogre);
    const draws = (s: GameState) => {
      const t = passUntil(s, "end", ap);
      const hand = t.players[ap]!.hand.length;
      return settle(t).players[ap]!.hand.length - hand;
    };
    expect(draws(structuredClone(s0))).toBe(1);
    s0.objects[theirs]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    expect(draws(structuredClone(s0))).toBe(0);
  });
});

describe("Ensnaring Bridge", () => {
  it("creatures with power greater than the number of cards in its controller's hand can't attack", () => {
    const { s: s0, ap } = setup([]);
    const opp = others(s0, ap)[0]!;
    const br = putOnBattlefield(s0, opp, bridge);
    const b = putOnBattlefield(s0, ap, bear());
    const o = putOnBattlefield(s0, ap, ogre);
    s0.players[opp]!.hand = s0.players[opp]!.hand.slice(0, 2);
    const able = (s: GameState) => potentialAttackers(s, ap).map((x) => x.id);
    expect(able(s0)).toContain(b);
    expect(able(s0)).not.toContain(o);
    // Our own hand size doesn't matter; theirs does.
    s0.players[opp]!.hand = [];
    expect(able(s0)).not.toContain(b);
    s0.battlefield.splice(s0.battlefield.indexOf(br), 1);
    delete s0.objects[br];
    invalidateCharacteristics(s0);
    expect(able(s0)).toEqual(expect.arrayContaining([b, o]));
  });
});

describe("Ancient Animus", () => {
  it("puts a +1/+1 counter on your creature only if it's legendary, then it fights", () => {
    const { s: s0, ap, ids } = setup([animus, animus]);
    const opp = others(s0, ap)[0]!;
    const l = putOnBattlefield(s0, ap, lord);
    const b = putOnBattlefield(s0, ap, bear());
    const t1 = putOnBattlefield(s0, opp, bear());
    const t2 = putOnBattlefield(s0, opp, bear());
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [obj(l), obj(t1)])));
    expect(s.objects[l]!.counters["+1/+1"]).toBe(1);
    expect(zone(s, t1)).toBe("graveyard");
    expect(zone(s, l)).toBe("battlefield");
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [obj(b), obj(t2)])));
    expect(s.objects[b]?.counters["+1/+1"] ?? 0).toBe(0);
    expect(zone(s, b)).toBe("graveyard");
    expect(zone(s, t2)).toBe("graveyard");
  });
});

describe("Gyome, Master Chef", () => {
  it("makes a Food at your end step for each nontoken creature you had enter this turn", () => {
    const { s: s0, ap, ids } = setup([gyome, bear()]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    s = settle(passUntil(s, "end", ap));
    const foods = s.battlefield.filter((id) => s.objects[id]!.isToken && /Food/.test(nameOf(s, id)));
    expect(foods).toHaveLength(2);
    // {1}, Sacrifice a Food: target creature gains indestructible until end of turn and is tapped.
    const g = ids[0]!;
    const i = abilitiesOf(s, s.objects[g]!).activated.findIndex((a) => /Food/.test(a.text));
    s = resolveAll(run(s, planActivate(s, ap, g, i, [obj(ids[1]!)], undefined, undefined, undefined, { sacrifice: [foods[0]!] })));
    expect(zone(s, foods[0]!)).toBeUndefined();
    expect(s.objects[ids[1]!]!.tapped).toBe(true);
    expect(objHasKeyword(s, s.objects[ids[1]!]!, "Indestructible")).toBe(true);
  });
});

describe("Fade from History", () => {
  it("each player who controls an artifact or enchantment makes a 2/2 Bear, then all artifacts and enchantments are destroyed", () => {
    const { s: s0, ap, ids } = setup([fade]);
    const [b, c] = others(s0, ap);
    const r = putOnBattlefield(s0, ap, rock);
    const e = putOnBattlefield(s0, b!, charm);
    putOnBattlefield(s0, c!, bear());
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(zone(s, r)).toBe("graveyard");
    expect(zone(s, e)).toBe("graveyard");
    const tokens = (p: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === p);
    expect(tokens(ap)).toHaveLength(1);
    expect(tokens(b!)).toHaveLength(1);
    expect(tokens(c!)).toHaveLength(0);
    expect(pt(s, tokens(ap)[0]!)).toBe("2/2");
  });
});

describe("Gyome, Master Chef (tokens)", () => {
  it("doesn't count a creature token that entered", () => {
    const { s: s0, ap, ids } = setup([gyome, fade]);
    putOnBattlefield(s0, ap, rock);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken && nameOf(s, id).includes("Bear"))).toHaveLength(1);
    s = settle(passUntil(s, "end", ap));
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken && /Food/.test(nameOf(s, id)))).toHaveLength(1);
  });
});

// Supported now too, from the same pieces.
const transmogrant = card("Ashnod's Transmogrant", "Artifact", "{1}", { cmc: 1, oracleText: "{T}, Sacrifice this artifact: Put a +1/+1 counter on target nonartifact creature. That creature becomes an artifact in addition to its other types." });
const depopulate = card("Depopulate", "Sorcery", "{2}{W}{W}", { cmc: 4, oracleText: "Each player who controls a multicolored creature draws a card. Then destroy all creatures." });
const disorder = card("Disorder", "Sorcery", "{1}{R}", { cmc: 2, oracleText: "Disorder deals 2 damage to each white creature and each player who controls a white creature." });
const memnarch = card("Memnarch", "Legendary Artifact Creature — Wizard", "{7}", { cmc: 7, power: "4", toughness: "5", oracleText: "{1}{U}{U}: Target permanent becomes an artifact in addition to its other types. (This effect lasts indefinitely.)\n{3}{U}: Gain control of target artifact. (This effect lasts indefinitely.)" });
const shatter = card("Shatter the Sky", "Sorcery", "{2}{W}{W}", { cmc: 4, oracleText: "Each player who controls a creature with power 4 or greater draws a card. Then destroy all creatures." });
const trumpets = card("Sound the Trumpets", "Instant", "{1}{W}{U}", { cmc: 3, oracleText: "Counter target spell. If that spell's mana value was 2 or less, recruit. (Draw a card, then discard a card. If you discarded a nonland card, create a 1/1 white Human Soldier creature token.)" });
const drake = card("Voyager Drake", "Creature — Drake", "{3}{U}", { cmc: 4, power: "3", toughness: "3", keywords: ["Multikicker", "Flying"], oracleText: "Multikicker {U} (You may pay an additional {U} any number of times as you cast this spell.)\nFlying\nWhen this creature enters, up to X target creatures gain flying until end of turn, where X is the number of times this creature was kicked." });
const eomer = card("Éomer of the Riddermark", "Legendary Creature — Human Knight", "{4}{R}", { cmc: 5, power: "5", toughness: "4", keywords: ["Haste"], oracleText: "Haste\nWhenever Éomer attacks, if you control a creature with the greatest power among creatures on the battlefield, create a 1/1 white Human Soldier creature token." });

describe("round 158: from the same pieces", () => {
  it("are fully supported", () => supported(transmogrant, depopulate, disorder, memnarch, shatter, trumpets, drake, eomer));

  it("Shatter the Sky: each player who controls a creature with power 4 or greater draws, then all creatures are destroyed", () => {
    const { s: s0, ap, ids } = setup([shatter]);
    const [b, c] = others(s0, ap);
    putOnBattlefield(s0, b!, ogre);
    const bb = putOnBattlefield(s0, c!, bear());
    const hands = [ap, b!, c!].map((p) => s0.players[p]!.hand.length);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect([ap, b!, c!].map((p) => s.players[p]!.hand.length)).toEqual([hands[0]! - 1, hands[1]! + 1, hands[2]!]);
    expect(zone(s, bb)).toBe("graveyard");
  });

  it("Voyager Drake: up to X target creatures gain flying, X the times it was kicked", () => {
    const { s: s0, ap, ids } = setup([drake]);
    const b = putOnBattlefield(s0, ap, bear());
    const o = putOnBattlefield(s0, ap, ogre);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, { kicks: [0] })));
    expect(s.pending).toMatchObject({ kind: "chooseTargets", x: 1 });
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [obj(b), obj(o)] })).toThrow();
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [obj(b)] }));
    expect(objHasKeyword(s, s.objects[b]!, "Flying")).toBe(true);
    expect(objHasKeyword(s, s.objects[o]!, "Flying")).toBe(false);
  });

  it("Éomer of the Riddermark: a Soldier when it attacks only if you control a creature with the greatest power", () => {
    const { s: s0, ap } = setup([]);
    const [b, c] = others(s0, ap);
    const e = putOnBattlefield(s0, ap, eomer);
    putOnBattlefield(s0, b!, ogre);
    const soldiers = (s: GameState) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === ap);
    const big = structuredClone(s0);
    expect(soldiers(settle(attack(big, ap, [{ attacker: e, defender: c! }])))).toHaveLength(1);
    // A 6-power creature elsewhere: no token.
    const small = structuredClone(s0);
    putOnBattlefield(small, b!, card("Test Giant", "Creature — Giant", "{5}{R}", { power: "6", toughness: "6" }));
    expect(soldiers(settle(attack(small, ap, [{ attacker: e, defender: c! }])))).toHaveLength(0);
  });

  it("Sound the Trumpets: recruits only after countering a spell with mana value 2 or less", () => {
    const { s: s0, ap, ids } = setup([bear(), trumpets, ogre, trumpets]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: s.stack[0]!.id }]));
    s = settle(s);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(s.pending).toMatchObject({ kind: "discard", player: ap });
    s = settle(act(s, { type: "discard", player: ap, objectIds: [ids[2]!] }));
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken && nameOf(s, id).includes("Soldier"))).toHaveLength(1);
    // A 4-mana spell: countered, nothing else.
    const u0 = structuredClone(s0);
    let u = run(u0, planCast(u0, ap, ids[2]!));
    u = settle(run(u, planCast(u, ap, ids[3]!, [{ kind: "stack", id: u.stack[0]!.id }])));
    expect(zone(u, ids[2]!)).toBe("graveyard");
    expect(u.pending).toBeNull();
  });
});
