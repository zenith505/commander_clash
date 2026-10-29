// Round 208: The Royal Scions, Mosswood Dreadknight, Hildibrand Manderville, Abigale, Transmogrant's Crown, Kaya, Origin of
// Spider-Man, Captain America, Kolodin, Guidelight Matrix, Tariel, Slimefoot and Squee, Hazoret, bloodthirst X, Omarthis, The
// Balrog, Zimone, Glamdring, Cantankerous Keepers, Blitzwing.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, potentialAttackers, power, runStateBasedActions, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Everyone passes until the stack is empty, answering "you may" with `may` and trigger targets with `targets`; stops at any other question. */
const settle = (s: GameState, opts: { may?: boolean; targets?: TargetChoice[] } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets ?? [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const attack = (s: GameState, ap: PlayerId, defender: PlayerId, attackers: ObjectId[]) => {
  s = passUntil(s, "declareAttackers", ap);
  return act(s, { type: "declareAttackers", player: ap, attacks: attackers.map((attacker) => ({ attacker, defender })) });
};
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of s.players[pid]!.hand.splice(0)) {
    s.objects[id]!.zone = "library";
    s.players[pid]!.library.push(id);
  }
};
const named = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === name);
const kill = card("Test Kill", "Instant", "{B}", { cmc: 1, oracleText: "Destroy target creature." });
const rock = (n = "Test Rock") => card(n, "Artifact", "{2}", { cmc: 2 });
const zombie = (n = "Test Zombie") => card(n, "Creature — Zombie", "{1}{B}", { cmc: 2, power: "2", toughness: "2" });

// Real oracle text (Scryfall).
const theRoyalScions = card("The Royal Scions", "Legendary Planeswalker — Will Rowan", "{1}{U}{R}", {"cmc":3,"loyalty":"5","keywords":[],"oracleText":"+1: Draw a card, then discard a card.\n+1: Target creature gets +2/+0 and gains first strike and trample until end of turn.\n−8: Draw four cards. When you do, The Royal Scions deals damage to any target equal to the number of cards in your hand.","colors":["R","U"],"colorIdentity":["R","U"],"layout":"normal"});

describe("draw four cards. When you do, ...", () => {
  it("compile", () => supported(theRoyalScions));

  it("The Royal Scions −8: four cards drawn, then damage equal to the cards in hand to the target chosen after the draw", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHand(s0, ap);
    const rs = putOnBattlefield(s0, ap, theRoyalScions);
    s0.objects[rs]!.counters = { loyalty: 8 };
    into(s0, ap, bear(), "hand");
    const life = s0.players[opp]!.life;
    let s = run(s0, planActivate(s0, ap, rs, 2));
    s = settle(s, { targets: [{ kind: "player", id: opp }] });
    expect(s.players[ap]!.hand.length).toBe(5);
    expect(s.players[opp]!.life).toBe(life - 5);
  });

  it("The Royal Scions −8: with three cards in the library it doesn't trigger (and its controller loses for drawing from an empty library)", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHand(s0, ap);
    for (const id of s0.players[ap]!.library.splice(3)) {
      s0.objects[id]!.zone = "exile";
      s0.players[ap]!.exile.push(id);
    }
    const rs = putOnBattlefield(s0, ap, theRoyalScions);
    s0.objects[rs]!.counters = { loyalty: 8 };
    const life = s0.players[opp]!.life;
    let s = run(s0, planActivate(s0, ap, rs, 2));
    s = settle(s, { targets: [{ kind: "player", id: opp }] });
    expect(s.players[ap]!.hand.length).toBe(3);
    expect(s.players[opp]!.life).toBe(life);
  });
});

const mosswoodDreadknight = scry("adventure", [{"name":"Mosswood Dreadknight","type_line":"Creature — Human Knight","mana_cost":"{1}{G}","oracle_text":"Trample\nWhen this creature dies, you may cast it from your graveyard as an Adventure until the end of your next turn.","power":"3","toughness":"2"},{"name":"Dread Whispers","type_line":"Sorcery — Adventure","mana_cost":"{1}{B}","oracle_text":"You draw a card and you lose 1 life. (Then exile this card. You may cast the creature later from exile.)"}], { keywords: ["Trample"], color_identity: ["B","G"] });
const hildibrandManderville = scry("adventure", [{"name":"Hildibrand Manderville","type_line":"Legendary Creature — Human Detective","mana_cost":"{1}{W}","oracle_text":"Creature tokens you control get +1/+1.\nWhen Hildibrand Manderville dies, you may cast it from your graveyard as an Adventure until the end of your next turn.","power":"2","toughness":"2"},{"name":"Gentleman's Rise","type_line":"Instant — Adventure","mana_cost":"{2}{B}","oracle_text":"Create a 2/2 black Zombie creature token. (Then exile this card. You may cast the creature later from exile.)"}], { keywords: [], color_identity: ["B","W"] });
const abigaleEloquentFirstyear = card("Abigale, Eloquent First-Year", "Legendary Creature — Bird Bard", "{W/B}{W/B}", {"cmc":2,"power":"1","toughness":"1","keywords":["Flying","Lifelink","First strike"],"oracleText":"Flying, first strike, lifelink\nWhen Abigale enters, up to one other target creature loses all abilities. Put a flying counter, a first strike counter, and a lifelink counter on that creature.","colors":["B","W"],"colorIdentity":["B","W"],"layout":"normal"});
const transmograntsCrown = card("Transmogrant's Crown", "Artifact — Equipment", "{2}", {"cmc":2,"keywords":["Equip"],"oracleText":"Equipped creature gets +2/+0.\nWhenever equipped creature dies, draw a card.\nEquip {2} or {B}","colors":[],"colorIdentity":["B"],"layout":"normal"});

/** Destroys the creature by lethal damage and lets its dies triggers resolve. */
const dies = (s: GameState, id: ObjectId) => {
  s.objects[id]!.damage = 99;
  runStateBasedActions(s);
  return settle(s);
};
const asAdventure = { via: "permission" as const, face: 1 };

describe("when ~ dies, you may cast it from your graveyard as an Adventure until the end of your next turn", () => {
  it("compile", () => supported(mosswoodDreadknight, hildibrandManderville));

  it("Mosswood Dreadknight: its Adventure from the graveyard, not the creature; then the creature from exile", () => {
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, mosswoodDreadknight);
    let s = passUntil(s0, "main1", ap);
    expect(planCast(s, ap, m, undefined, undefined, undefined, undefined, asAdventure)).toBeNull(); // on the battlefield
    s = dies(s, m);
    expect(s.objects[m]!.zone).toBe("graveyard");
    s.players[ap]!.manaPool.B = 2;
    s.players[ap]!.manaPool.G = 2;
    expect(planCast(s, ap, m, undefined, undefined, undefined, undefined, { via: "permission" })).toBeNull();
    const hand = s.players[ap]!.hand.length;
    const life = s.players[ap]!.life;
    s = settle(run(s, planCast(s, ap, m, undefined, undefined, undefined, undefined, asAdventure)));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.players[ap]!.life).toBe(life - 1);
    // It went on an adventure: the creature may now be cast from exile.
    expect(s.objects[m]!.zone).toBe("exile");
    s = settle(run(s, planCast(s, ap, m)));
    expect(s.objects[m]!.zone).toBe("battlefield");
  });

  it("Mosswood Dreadknight: through its controller's next turn, gone after it; only if it died", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, mosswoodDreadknight);
    let s = dies(passUntil(s0, "main1", ap), m);
    s = passUntil(passUntil(s, "upkeep", opp), "main1", ap); // the next turn of ours
    s.players[ap]!.manaPool.B = 2;
    expect(planCast(s, ap, m, undefined, undefined, undefined, undefined, asAdventure)).not.toBeNull();
    s.players[ap]!.manaPool.B = 0;
    s = passUntil(passUntil(s, "upkeep", opp), "main1", ap); // the turn after that
    s.players[ap]!.manaPool.B = 2;
    expect(planCast(s, ap, m, undefined, undefined, undefined, undefined, asAdventure)).toBeNull();
    // Put into the graveyard some other way, there's no permission.
    const { s: t0, ap: p } = setup([]);
    const other = into(t0, p, mosswoodDreadknight, "graveyard");
    const t = passUntil(t0, "main1", p);
    t.players[p]!.manaPool.B = 2;
    expect(planCast(t, p, other, undefined, undefined, undefined, undefined, asAdventure)).toBeNull();
  });

  it("Hildibrand Manderville: its instant Adventure in an opponent's turn; the bot casts it too", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, hildibrandManderville);
    let s = dies(passUntil(s0, "main1", ap), h);
    s = passUntil(s, "upkeep", opp);
    s.players[ap]!.manaPool.B = 3;
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(run(s, planCast(s, ap, h, undefined, undefined, undefined, undefined, asAdventure)));
    expect(named(s, ap, "Zombie Token").length).toBe(1);
    expect(s.objects[h]!.zone).toBe("exile");
    // A bot whose Hildibrand died casts Gentleman's Rise from its graveyard.
    const { s: b0, ap: bp } = setup([]);
    emptyHand(b0, bp);
    b0.players[bp]!.command = [];
    const bh = putOnBattlefield(b0, bp, hildibrandManderville);
    let b = dies(passUntil(b0, "main1", bp), bh);
    b.players[bp]!.manaPool.B = 3;
    const acts = botActions(b, bp);
    expect(acts.some((a) => a.type === "castSpell" && a.objectId === bh && a.face === 1)).toBe(true);
  });
});

describe("loses all abilities, then keyword counters", () => {
  it("compile", () => supported(abigaleEloquentFirstyear));

  it("Abigale: the target loses its abilities for good and gets flying, first strike and lifelink counters", () => {
    const { s: s0, ap, opp } = setup([abigaleEloquentFirstyear]);
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Test Knight", keywords: ["Vigilance", "Trample"], oracleText: "Vigilance, trample" }));
    let s = passUntil(s0, "main1", ap);
    s.players[ap]!.manaPool.W = 2;
    const a = s.players[ap]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Abigale, Eloquent First-Year")!;
    s = settle(run(s, planCast(s, ap, a)), { targets: [tgt(theirs)] });
    const o = s.objects[theirs]!;
    expect(objHasKeyword(s, o, "Vigilance")).toBe(false);
    expect(objHasKeyword(s, o, "Trample")).toBe(false);
    expect(objHasKeyword(s, o, "Flying")).toBe(true);
    expect(objHasKeyword(s, o, "First strike")).toBe(true);
    expect(objHasKeyword(s, o, "Lifelink")).toBe(true);
    // It doesn't end with the turn, nor when Abigale leaves (rulings).
    s = dies(s, a);
    s = passUntil(s, "upkeep", opp);
    expect(objHasKeyword(s, s.objects[theirs]!, "Trample")).toBe(false);
    expect(objHasKeyword(s, s.objects[theirs]!, "Flying")).toBe(true);
  });
});

describe("equip {2} or {B}", () => {
  it("compile", () => supported(transmograntsCrown));

  it("Transmogrant's Crown: equips for {B} or for {2}", () => {
    const { s: s0, ap } = setup([]);
    const c = putOnBattlefield(s0, ap, transmograntsCrown);
    const b = putOnBattlefield(s0, ap, bear());
    let s = passUntil(s0, "main1", ap);
    expect(s.objects[c] && [0, 1].map((i) => planActivate(s, ap, c, i, [tgt(b)]) !== null)).toEqual([true, true]);
    s.players[ap]!.manaPool.B = 1;
    s = settle(run(s, planActivate(s, ap, c, 1, [tgt(b)])));
    expect(s.objects[c]!.attachedTo).toBe(b);
    expect(power(s, s.objects[b]!)).toBe(4);
    const b2 = putOnBattlefield(s, ap, bear({ name: "Other Bear" }));
    s.players[ap]!.manaPool.C = 2;
    s = settle(run(s, planActivate(s, ap, c, 0, [tgt(b2)])));
    expect(s.objects[c]!.attachedTo).toBe(b2);
  });
});

const kayaIntangibleSlayer = card("Kaya, Intangible Slayer", "Legendary Planeswalker — Kaya", "{3}{W}{W}{B}{B}", {"cmc":7,"loyalty":"6","keywords":["Hexproof","Scry"],"oracleText":"Hexproof\n+2: Each opponent loses 3 life and you gain 3 life.\n0: You draw two cards. Then each opponent may scry 1.\n−3: Exile target creature or enchantment. If it wasn't an Aura, create a token that's a copy of it, except it's a 1/1 white Spirit creature with flying in addition to its other types.","colors":["B","W"],"colorIdentity":["B","W"],"layout":"normal"});
const originOfSpiderman = card("Origin of Spider-Man", "Enchantment — Saga", "{1}{W}", {"cmc":2,"keywords":[],"oracleText":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Create a 2/1 green Spider creature token with reach.\nII — Put a +1/+1 counter on target creature you control. It becomes a legendary Spider Hero in addition to its other types.\nIII — Target creature you control gains double strike until end of turn.","colors":["W"],"colorIdentity":["W"],"layout":"saga"});
const captainAmericaSupersoldier = card("Captain America, Super-Soldier", "Legendary Creature — Human Soldier Hero", "{1}{W}{W}", {"cmc":3,"power":"3","toughness":"2","keywords":["First strike"],"oracleText":"First strike\nCaptain America enters with a shield counter on him. (If he would be dealt damage or destroyed, remove a shield counter from him instead.)\nAs long as Captain America has a shield counter on him, you and other Heroes you control have hexproof.","colors":["W"],"colorIdentity":["W"],"layout":"normal"});
const kolodinTriumphCaster = card("Kolodin, Triumph Caster", "Legendary Creature — Human Pilot", "{R}{W}", {"cmc":2,"power":"2","toughness":"3","keywords":[],"oracleText":"Mounts and Vehicles you control have haste.\nWhenever a Mount you control enters, it becomes saddled until end of turn.\nWhenever a Vehicle you control enters, it becomes an artifact creature until end of turn.","colors":["R","W"],"colorIdentity":["R","W"],"layout":"normal"});
const tarielReckonerOfSouls = card("Tariel, Reckoner of Souls", "Legendary Creature — Angel", "{4}{R}{W}{B}", {"cmc":7,"power":"4","toughness":"7","keywords":["Flying","Vigilance"],"oracleText":"Flying, vigilance\n{T}: Choose a creature card at random from target opponent's graveyard. Put that card onto the battlefield under your control.","colors":["B","R","W"],"colorIdentity":["B","R","W"],"layout":"normal"});
const slimefootAndSquee = card("Slimefoot and Squee", "Legendary Creature — Fungus Goblin", "{B}{R}{G}", {"cmc":3,"power":"3","toughness":"3","keywords":[],"oracleText":"Whenever Slimefoot and Squee enters or attacks, create a 1/1 green Saproling creature token.\n{1}{B}{R}{G}, Sacrifice a Saproling: Return this card and up to one other target creature card from your graveyard to the battlefield. Activate only as a sorcery.","colors":["B","G","R"],"colorIdentity":["B","G","R"],"layout":"normal"});
const hazoretGodseeker = card("Hazoret, Godseeker", "Legendary Creature — God", "{1}{R}", {"cmc":2,"power":"5","toughness":"3","keywords":["Indestructible","Haste","Start your engines!"],"oracleText":"Indestructible, haste\nStart your engines! (If you have no speed, it starts at 1. It increases once on each of your turns when an opponent loses life. Max speed is 4.)\n{1}, {T}: Target creature with power 2 or less can't be blocked this turn.\nHazoret can't attack or block unless you have max speed.","colors":["R"],"colorIdentity":["R"],"layout":"normal"});
const indoraptorThePerfectHybrid = card("Indoraptor, the Perfect Hybrid", "Legendary Creature — Dinosaur Mutant", "{1}{B/G}{R}", {"cmc":3,"power":"3","toughness":"1","keywords":["Enrage","Bloodthirst","Menace"],"oracleText":"Bloodthirst X (This creature enters with X +1/+1 counters on it, where X is the damage dealt to your opponents this turn.)\nMenace\nEnrage — Whenever Indoraptor is dealt damage, choose an opponent at random. Indoraptor deals damage equal to its power to that player unless they sacrifice a nontoken creature of their choice.","colors":["B","G","R"],"colorIdentity":["B","G","R"],"layout":"normal"});
const bloodlordOfVaasgoth = card("Bloodlord of Vaasgoth", "Creature — Vampire Warrior", "{3}{B}{B}", {"cmc":5,"power":"3","toughness":"3","keywords":["Flying","Bloodthirst"],"oracleText":"Bloodthirst 3 (If an opponent was dealt damage this turn, this creature enters with three +1/+1 counters on it.)\nFlying\nWhenever you cast a Vampire creature spell, it gains bloodthirst 3.","colors":["B"],"colorIdentity":["B"],"layout":"normal"});

describe("exile target creature or enchantment. If it wasn't an Aura, create a token copy", () => {
  it("compile", () => supported(kayaIntangibleSlayer));

  it("Kaya −3: a creature is exiled and comes back as a 1/1 white Spirit token copy with flying", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kayaIntangibleSlayer);
    s0.objects[k]!.counters = { loyalty: 6 };
    const theirs = putOnBattlefield(s0, opp, card("Test Ogre", "Creature — Ogre", "{2}{R}", { cmc: 3, power: "3", toughness: "3" }));
    let s = passUntil(s0, "main1", ap);
    s = settle(run(s, planActivate(s, ap, k, 2, [tgt(theirs)])));
    expect(s.objects[theirs]!.zone).toBe("exile");
    const [copy] = named(s, ap, "Test Ogre");
    expect(copy).toBeDefined();
    const c = characteristics(s, s.objects[copy!]!);
    expect([c.power, c.toughness]).toEqual([1, 1]);
    expect(c.subtypes).toEqual(expect.arrayContaining(["Ogre", "Spirit"]));
    expect(c.colors).toEqual(["W"]);
    expect(objHasKeyword(s, s.objects[copy!]!, "Flying")).toBe(true);
  });

  it("Kaya −3: an Aura is only exiled", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kayaIntangibleSlayer);
    s0.objects[k]!.counters = { loyalty: 6 };
    const host = putOnBattlefield(s0, opp, bear({ name: "Host Bear" }));
    const aura = putOnBattlefield(s0, opp, card("Test Aura", "Enchantment — Aura", "{W}", { cmc: 1, oracleText: "Enchant creature\nEnchanted creature gets +1/+1." }));
    s0.objects[aura]!.attachedTo = host;
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "main1", ap);
    s = settle(run(s, planActivate(s, ap, k, 2, [tgt(aura)])));
    expect(s.objects[aura]!.zone).toBe("exile");
    expect(named(s, ap, "Test Aura").length).toBe(0);
  });
});

describe("it becomes a legendary Spider Hero in addition to its other types", () => {
  it("compile", () => supported(originOfSpiderman));

  it("Origin of Spider-Man II: a +1/+1 counter, and the creature is a legendary Spider Hero for good", () => {
    const { s: s0, ap } = setup([]);
    const saga = putOnBattlefield(s0, ap, originOfSpiderman);
    s0.objects[saga]!.counters = { lore: 1 };
    const b = putOnBattlefield(s0, ap, bear());
    let s = passUntil(passUntil(s0, "end", ap), "main1", ap);
    s = settle(s, { targets: [tgt(b)] });
    const c = characteristics(s, s.objects[b]!);
    expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
    expect(c.supertypes).toContain("Legendary");
    expect(c.subtypes).toEqual(expect.arrayContaining(["Bear", "Spider", "Hero"]));
  });
});

describe("as long as ~ has a shield counter on him, you and other Heroes you control have hexproof", () => {
  it("compile", () => supported(captainAmericaSupersoldier));

  it("Captain America: you and your other Heroes can't be targeted by opponents while the shield counter is there", () => {
    const { s: s0, ap, opp } = setup([]);
    const cap = putOnBattlefield(s0, ap, captainAmericaSupersoldier);
    s0.objects[cap]!.counters = { shield: 1 };
    const hero = putOnBattlefield(s0, ap, bear({ name: "Test Hero", typeLine: "Creature — Human Hero", subtypes: ["Human", "Hero"] }));
    invalidateCharacteristics(s0);
    const shock = card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "Test Shock deals 2 damage to any target." });
    let s = passUntil(s0, "main1", opp);
    const sh = into(s, opp, shock, "hand");
    s.players[opp]!.manaPool.R = 1;
    expect(planCast(s, opp, sh, [{ kind: "player", id: ap }])).toBeNull();
    expect(planCast(s, opp, sh, [tgt(hero)])).toBeNull();
    expect(objHasKeyword(s, s.objects[cap]!, "Hexproof")).toBe(false); // "other" Heroes
    expect(planCast(s, opp, sh, [tgt(cap)])).not.toBeNull();
    s.objects[cap]!.counters = {};
    invalidateCharacteristics(s);
    expect(planCast(s, opp, sh, [{ kind: "player", id: ap }])).not.toBeNull();
    expect(planCast(s, opp, sh, [tgt(hero)])).not.toBeNull();
  });
});

const guidelightMatrix = card("Guidelight Matrix", "Artifact", "{2}", {"cmc":2,"keywords":[],"oracleText":"When this artifact enters, draw a card.\n{2}, {T}: Target Mount you control becomes saddled until end of turn. Activate only as a sorcery.\n{2}, {T}: Target Vehicle you control becomes an artifact creature until end of turn.","colors":[],"colorIdentity":[],"layout":"normal"});
const petrifiedWoodkin = card("Petrified Wood-Kin", "Creature — Elemental Warrior", "{6}{G}", {"cmc":7,"power":"3","toughness":"3","keywords":["Bloodthirst","Protection"],"oracleText":"This spell can't be countered.\nBloodthirst X (This creature enters with X +1/+1 counters on it, where X is the damage dealt to your opponents this turn.)\nProtection from instants","colors":["G"],"colorIdentity":["G"],"layout":"normal"});

describe("whenever a Mount you control enters, it becomes saddled until end of turn", () => {
  it("compile", () => supported(kolodinTriumphCaster, guidelightMatrix));

  it("Guidelight Matrix: target Mount you control becomes saddled", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, guidelightMatrix);
    const m = putOnBattlefield(s0, ap, card("Test Mount", "Creature — Horse Mount", "{1}{W}", { cmc: 2, power: "2", toughness: "2", keywords: ["Saddle"], oracleText: "Saddle 1" }));
    let s = passUntil(s0, "main1", ap);
    s.players[ap]!.manaPool.C = 2;
    s = settle(run(s, planActivate(s, ap, g, 0, [tgt(m)])));
    expect(s.objects[m]!.saddled).toBe(true);
  });

  it("Kolodin: a Mount entering is saddled (and has haste) this turn", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, kolodinTriumphCaster);
    const mount = card("Test Mount", "Creature — Horse Mount", "{1}{W}", { cmc: 2, power: "2", toughness: "2", keywords: ["Saddle"], oracleText: "Whenever this creature attacks while saddled, you gain 2 life.\nSaddle 1" });
    let s = passUntil(s0, "main1", ap);
    const m = into(s, ap, mount, "hand");
    s.players[ap]!.manaPool.W = 2;
    s = settle(run(s, planCast(s, ap, m)));
    expect(s.objects[m]!.saddled).toBe(true);
    const life = s.players[ap]!.life;
    s = settle(attack(s, ap, s.turnOrder.find((p) => p !== ap)!, [m]));
    expect(s.players[ap]!.life).toBe(life + 2);
  });
});

describe("a creature card at random from target opponent's graveyard onto the battlefield under your control", () => {
  it("compile", () => supported(tarielReckonerOfSouls));

  it("Tariel: one of that opponent's creature cards, under your control; not a noncreature card", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, tarielReckonerOfSouls);
    const z = into(s0, opp, zombie("Their Zombie"), "graveyard");
    into(s0, opp, rock("Their Rock"), "graveyard");
    let s = passUntil(s0, "main1", ap);
    s = settle(run(s, planActivate(s, ap, t, 0, [{ kind: "player", id: opp }])));
    expect(s.objects[z]!.zone).toBe("battlefield");
    expect(s.objects[z]!.controller).toBe(ap);
    expect(s.objects[z]!.owner).toBe(opp);
  });
});

describe("return ~ and up to one other target creature card from your graveyard to the battlefield", () => {
  it("compile", () => supported(slimefootAndSquee));

  it("Slimefoot and Squee: with a creature card, or alone", () => {
    const { s: s0, ap } = setup([]);
    const sl = into(s0, ap, slimefootAndSquee, "graveyard");
    const z = into(s0, ap, zombie(), "graveyard");
    const sap = putOnBattlefield(s0, ap, card("Saproling Token", "Token Creature — Saproling", "", { power: "1", toughness: "1" }));
    s0.objects[sap]!.isToken = true;
    const sap2 = putOnBattlefield(s0, ap, card("Saproling Token", "Token Creature — Saproling", "", { power: "1", toughness: "1" }));
    s0.objects[sap2]!.isToken = true;
    let s = passUntil(s0, "main1", ap);
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, B: 1, R: 1, G: 2 };
    expect(planActivate(s, ap, sl, 0, [tgt(sl)], undefined, undefined, undefined, { sacrifice: [sap] })).toBeNull(); // "other"
    s = settle(run(s, planActivate(s, ap, sl, 0, [tgt(z)], undefined, undefined, undefined, { sacrifice: [sap] })));
    expect(s.objects[sl]!.zone).toBe("battlefield");
    expect(s.objects[z]!.zone).toBe("battlefield");
    const { s: t0, ap: p } = setup([]);
    const sl2 = into(t0, p, slimefootAndSquee, "graveyard");
    const tok = putOnBattlefield(t0, p, card("Saproling Token", "Token Creature — Saproling", "", { power: "1", toughness: "1" }));
    t0.objects[tok]!.isToken = true;
    let t = passUntil(t0, "main1", p);
    t.players[p]!.manaPool = { ...t.players[p]!.manaPool, B: 1, R: 1, G: 2 };
    t = settle(run(t, planActivate(t, p, sl2, 0, [{ kind: "none" }], undefined, undefined, undefined, { sacrifice: [tok] })));
    expect(t.objects[sl2]!.zone).toBe("battlefield");
  });
});

describe("~ can't attack or block unless you have max speed", () => {
  it("compile", () => supported(hazoretGodseeker));

  it("Hazoret, Godseeker: attacks only at speed 4", () => {
    const { s: s0, ap } = setup([]);
    const h = putOnBattlefield(s0, ap, hazoretGodseeker);
    s0.players[ap]!.speed = 3;
    const s = passUntil(s0, "main1", ap);
    expect(potentialAttackers(s, ap).some((o) => o.id === h)).toBe(false);
    s.players[ap]!.speed = 4;
    invalidateCharacteristics(s);
    expect(potentialAttackers(s, ap).some((o) => o.id === h)).toBe(true);
  });
});

describe("bloodthirst X; a spell gains bloodthirst 3", () => {
  it("compile", () => supported(indoraptorThePerfectHybrid, bloodlordOfVaasgoth, petrifiedWoodkin));

  it("Indoraptor: enters with a +1/+1 counter for each damage the opponents were dealt this turn", () => {
    const { s: s0, ap, opp } = setup([indoraptorThePerfectHybrid]);
    let s = passUntil(s0, "main1", ap);
    const third = s.turnOrder.find((p) => p !== ap && p !== opp)!;
    s.damageThisTurn = { [opp]: 3, [third]: 2, [ap]: 4 };
    s.damagedThisTurn = [opp, third, ap];
    const i = s.players[ap]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.name.startsWith("Indoraptor"))!;
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, B: 1, R: 1, C: 1 };
    s = settle(run(s, planCast(s, ap, i)));
    expect(s.objects[i]!.counters["+1/+1"]).toBe(5);
  });

  it("Bloodlord of Vaasgoth: a Vampire creature spell gains bloodthirst 3, on top of its own", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, bloodlordOfVaasgoth);
    const vamp = card("Test Vampire", "Creature — Vampire", "{1}{B}", { cmc: 2, power: "2", toughness: "2", keywords: ["Bloodthirst"], oracleText: "Bloodthirst 1" });
    let s = passUntil(s0, "main1", ap);
    s.damagedThisTurn = [opp];
    const v = into(s, ap, vamp, "hand");
    const bearCard = into(s, ap, bear(), "hand");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, B: 2, G: 2 };
    s = settle(run(s, planCast(s, ap, v)));
    expect(s.objects[v]!.counters["+1/+1"]).toBe(4);
    s = settle(run(s, planCast(s, ap, bearCard)));
    expect(s.objects[bearCard]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

const omarthisGhostfireInitiate = card("Omarthis, Ghostfire Initiate", "Legendary Creature — Spirit Snake", "{X}{X}", {"cmc":0,"power":"0","toughness":"0","keywords":["Manifest"],"oracleText":"Omarthis enters with X +1/+1 counters on it.\nWhenever you put one or more +1/+1 counters on another colorless creature, you may put a +1/+1 counter on Omarthis.\nWhen Omarthis dies, manifest a number of cards from the top of your library equal to the number of counters on it.","colors":[],"colorIdentity":[],"layout":"normal"});

describe("when ~ dies, manifest a number of cards equal to the number of counters on it", () => {
  it("compile", () => supported(omarthisGhostfireInitiate));

  it("Omarthis: counts every counter it had as it died (CR 608.2h) and manifests that many", () => {
    const { s: s0, ap } = setup([]);
    const o = putOnBattlefield(s0, ap, omarthisGhostfireInitiate);
    s0.objects[o]!.counters = { "+1/+1": 2, flying: 1 };
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "main1", ap);
    const lib = s.players[ap]!.library.length;
    s = dies(s, o);
    expect(s.objects[o]!.zone).toBe("graveyard");
    const fd = s.battlefield.filter((id) => s.objects[id]!.controller === ap && s.objects[id]!.faceDown === "manifest");
    expect(fd).toHaveLength(3);
    expect(s.players[ap]!.library.length).toBe(lib - 3);
  });
});

const theBalrogDurinsBane = card("The Balrog, Durin's Bane", "Legendary Creature — Avatar Demon", "{5}{B}{R}", {"cmc":7,"power":"7","toughness":"5","keywords":["Haste"],"oracleText":"This spell costs {1} less to cast for each permanent sacrificed this turn.\nHaste\nThe Balrog can't be blocked except by legendary creatures.\nWhen The Balrog dies, destroy target artifact or creature an opponent controls.","colors":["B","R"],"colorIdentity":["B","R"],"layout":"normal"});

describe("~ costs {1} less to cast for each permanent sacrificed this turn", () => {
  it("compile", () => supported(theBalrogDurinsBane));

  it("The Balrog: counts the permanents every player sacrificed this turn", () => {
    const { s: s0, ap, opp } = setup([theBalrogDurinsBane]);
    let s = passUntil(s0, "main1", ap);
    const b = s.players[ap]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.name.startsWith("The Balrog"))!;
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap) s.objects[id]!.tapped = true;
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, B: 1, R: 1, C: 2 };
    expect(planCast(s, ap, b)).toBeNull();
    s.turnLog = { ...(s.turnLog ?? {}), sacrificed: [{ player: opp, types: ["Creature"], subtypes: [] }, { player: opp, types: ["Artifact"], subtypes: ["Treasure"], token: true }, { player: ap, types: ["Land"], subtypes: [] }] };
    s = settle(run(s, planCast(s, ap, b)));
    expect(s.objects[b]!.zone).toBe("battlefield");
  });
});

const zimoneInfiniteAnalyst = card("Zimone, Infinite Analyst", "Legendary Creature — Human Wizard", "{1}{G}{U}", {"cmc":3,"power":"0","toughness":"4","keywords":[],"oracleText":"The first spell you cast with {X} in its mana cost each turn costs {1} less to cast for each +1/+1 counter on Zimone.\nWhenever you cast your first spell with {X} in its mana cost each turn, put two +1/+1 counters on Zimone.","colors":["G","U"],"colorIdentity":["G","U"],"layout":"normal"});

describe("the first spell you cast with {X} in its mana cost each turn costs {1} less for each +1/+1 counter on ~", () => {
  it("compile", () => supported(zimoneInfiniteAnalyst));

  it("Zimone: only the first {X} spell each turn, by the counters before its own trigger", () => {
    const { s: s0, ap } = setup([]);
    const z = putOnBattlefield(s0, ap, zimoneInfiniteAnalyst);
    s0.objects[z]!.counters = { "+1/+1": 3 };
    invalidateCharacteristics(s0);
    const xs = card("Test X Draw", "Sorcery", "{X}{U}", { cmc: 1, oracleText: "Draw X cards." });
    let s = passUntil(s0, "main1", ap);
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap) s.objects[id]!.tapped = true;
    const a = into(s, ap, xs, "hand");
    const b = into(s, ap, xs, "hand");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, U: 1 };
    // X=3: {3}{U}, three less.
    s = settle(run(s, planCast(s, ap, a, [], undefined, undefined, 3)));
    expect(s.objects[a]!.zone).toBe("graveyard");
    expect(s.objects[z]!.counters["+1/+1"]).toBe(5);
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, U: 1 };
    expect(planCast(s, ap, b, [], undefined, undefined, 1)).toBeNull();
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, U: 1, C: 1 };
    expect(planCast(s, ap, b, [], undefined, undefined, 1)).not.toBeNull();
  });
});

const glamdringFoehammer = scry("adventure", [{"name":"Glamdring, Foe-hammer","type_line":"Legendary Artifact — Equipment","mana_cost":"{2}","oracle_text":"Instant and sorcery spells you cast cost {X} less to cast, where X is equipped creature's power.\nEquip {2}"},{"name":"Gleam of Death","type_line":"Sorcery — Adventure","mana_cost":"{3}{U}","oracle_text":"Mill six cards, then put all instant and sorcery cards from among them into your hand. (Then exile this card. You may cast the artifact later from exile.)"}], { keywords: ["Equip","Mill"], color_identity: ["U"] });

const cantankerousKeepers = card("Cantankerous Keepers", "Creature — Elf Soldier", "{5}{G}", {"cmc":6,"power":"4","toughness":"3","keywords":["Affinity","Mill"],"oracleText":"Affinity for Elves (This spell costs {1} less to cast for each Elf you control.)\nWhen this creature enters, mill four cards, then put all Elf cards from among them into your hand.","colors":["G"],"colorIdentity":["G"],"layout":"normal"});

describe("spells cost {X} less, where X is equipped creature's power; put all ... cards from among the milled ones into your hand", () => {
  it("compile", () => supported(glamdringFoehammer, cantankerousKeepers));

  it("Cantankerous Keepers: the Elf cards among the four milled go to your hand", () => {
    const { s: s0, ap } = setup([cantankerousKeepers]);
    let s = passUntil(s0, "main1", ap);
    const k = s.players[ap]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Cantankerous Keepers")!;
    const elf = into(s, ap, card("Test Elf", "Creature — Elf Druid", "{G}", { cmc: 1, power: "1", toughness: "1" }), "library");
    const other = into(s, ap, bear(), "library");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, G: 1, C: 5 };
    s = settle(run(s, planCast(s, ap, k)));
    expect([s.objects[elf]!.zone, s.objects[other]!.zone]).toEqual(["hand", "graveyard"]);
  });

  it("Glamdring: instants and sorceries cost {1} less for each point of the equipped creature's power, generic only", () => {
    const { s: s0, ap } = setup([]);
    const g = putOnBattlefield(s0, ap, glamdringFoehammer);
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[b]!.counters = { "+1/+1": 1 };
    let s = passUntil(s0, "main1", ap);
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap) s.objects[id]!.tapped = true;
    const big = card("Test Big Draw", "Sorcery", "{4}{U}", { cmc: 5, oracleText: "Draw a card." });
    const spell = into(s, ap, big, "hand");
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, U: 1, C: 1 };
    expect(planCast(s, ap, spell)).toBeNull(); // not equipped
    s.objects[g]!.attachedTo = b;
    invalidateCharacteristics(s);
    s = settle(run(s, planCast(s, ap, spell)));
    expect(s.objects[spell]!.zone).toBe("graveyard");
  });

  it("Gleam of Death: every instant and sorcery card it milled goes to your hand, nothing else", () => {
    const { s: s0, ap } = setup([glamdringFoehammer]);
    let s = passUntil(s0, "main1", ap);
    const g = s.players[ap]!.hand.find((id) => s.cards[s.objects[id]!.cardId]!.name.startsWith("Glamdring"))!;
    const old = into(s, ap, card("Test Old Bolt", "Instant", "{R}", { cmc: 1, oracleText: "Draw a card." }), "graveyard");
    // On top of the library: the six cards milled are these four and two more.
    const top = [card("Test Bolt", "Instant", "{R}", { cmc: 1, oracleText: "Draw a card." }), card("Test Rite", "Sorcery", "{B}", { cmc: 1, oracleText: "Draw a card." }), bear(), rock()].map((d) => into(s, ap, d, "library"));
    s.players[ap]!.manaPool = { ...s.players[ap]!.manaPool, U: 1, C: 3 };
    s = settle(run(s, planCast(s, ap, g, [], undefined, "auto", undefined, { face: 1 })));
    expect(s.players[ap]!.hand).toEqual(expect.arrayContaining([top[0], top[1]]));
    expect([s.objects[top[2]!]!.zone, s.objects[top[3]!]!.zone, s.objects[old]!.zone]).toEqual(["graveyard", "graveyard", "graveyard"]);
    expect(s.objects[g]!.zone).toBe("exile");
  });
});

const blitzwingCruelTormentor = scry("transform", [{"name":"Blitzwing, Cruel Tormentor","type_line":"Legendary Artifact Creature — Robot","mana_cost":"{5}{B}","oracle_text":"More Than Meets the Eye {3}{B} (You may cast this card converted for {3}{B}.)\nAt the beginning of your end step, target opponent loses life equal to the life that player lost this turn. If no life is lost this way, convert Blitzwing.","power":"6","toughness":"5"},{"name":"Blitzwing, Adaptive Assailant","type_line":"Legendary Artifact — Vehicle","oracle_text":"Living metal (During your turn, this Vehicle is also a creature.)\nAt the beginning of combat on your turn, choose flying or indestructible at random. Blitzwing gains that ability until end of turn.\nWhenever Blitzwing deals combat damage to a player, convert it.","power":"3","toughness":"5"}], { keywords: ["Living metal","Convert","More Than Meets the Eye"], color_identity: ["B"] });

describe("if no life is lost this way, convert ~; choose flying or indestructible at random", () => {
  it("compile", () => supported(blitzwingCruelTormentor));

  const endStep = (lost: number) => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, blitzwingCruelTormentor);
    let s = passUntil(s0, "main1", ap);
    s.players[opp]!.life -= lost;
    s.turnLog = { ...(s.turnLog ?? {}), lifeLost: { [opp]: lost } };
    s = passUntil(s, "end", ap);
    s = settle(s, { targets: [{ kind: "player", id: opp }] });
    return { s, b, opp };
  };

  it("Blitzwing, Cruel Tormentor: the opponent loses as much again; it stays", () => {
    const { s, b, opp } = endStep(3);
    expect(s.players[opp]!.life).toBe(34);
    expect(s.objects[b]!.face ?? 0).toBe(0);
  });

  it("Blitzwing, Cruel Tormentor: no life lost this way, so it converts", () => {
    const { s, b, opp } = endStep(0);
    expect(s.players[opp]!.life).toBe(40);
    expect(s.objects[b]!.face).toBe(1);
  });

  it("Blitzwing, Adaptive Assailant: flying or indestructible until end of turn, one of them, at random", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const { s: s0, ap } = setup([]);
      s0.rngState = seed * 7919;
      const b = putOnBattlefield(s0, ap, blitzwingCruelTormentor);
      s0.objects[b]!.face = 1;
      invalidateCharacteristics(s0);
      let s = passUntil(s0, "main1", ap);
      s = settle(passUntil(s, "beginCombat", ap));
      const fly = objHasKeyword(s, s.objects[b]!, "Flying");
      const ind = objHasKeyword(s, s.objects[b]!, "Indestructible");
      expect(fly !== ind).toBe(true);
      seen.add(fly ? "Flying" : "Indestructible");
    }
    expect([...seen].sort()).toEqual(["Flying", "Indestructible"]);
  });
});
