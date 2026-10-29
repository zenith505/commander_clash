// Round 210: Teval (spells you cast have delve), Hogaak (no mana spent: convoke and delve pay it), Saheeli, the Gifted
// (the next spell has affinity for artifacts) and others.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { evalAmount } from "../src/amounts";
import { abilitiesOf, applyAction, controllerOf, castProblem, destroyPermanent, gameEndBlocked, loseLife, characteristics, spellCost, invalidateCharacteristics, isFullySupported, planActivate, planCast, power, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

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
const rock = (n = "Test Rock", mv = 3) => card(n, "Artifact", `{${mv}}`, { cmc: mv });
const land = (n = "Test Land") => card(n, "Land");

// Real oracle text (Scryfall).
const tevalArbiterOfVirtue = card("Teval, Arbiter of Virtue", "Legendary Creature — Spirit Dragon", "{2}{B}{G}{U}", {"cmc": 5, "power": "6", "toughness": "6", "keywords": ["Flying", "Lifelink"], "oracleText": "Flying, lifelink\nSpells you cast have delve. (Each card you exile from your graveyard while casting those spells pays for {1}.)\nWhenever you cast a spell, you lose life equal to its mana value.", "colors": ["B", "G", "U"], "colorIdentity": ["B", "G", "U"], "layout": "normal"});
const hogaakArisenNecropolis = card("Hogaak, Arisen Necropolis", "Legendary Creature — Avatar", "{5}{B/G}{B/G}", {"cmc": 7, "power": "8", "toughness": "8", "keywords": ["Delve", "Trample", "Convoke"], "oracleText": "You can't spend mana to cast this spell.\nConvoke, delve (Each creature you tap while casting this spell pays for {1} or one mana of that creature's color. Each card you exile from your graveyard pays for {1}.)\nYou may cast this card from your graveyard.\nTrample", "colors": ["B", "G"], "colorIdentity": ["B", "G"], "layout": "normal"});
const saheeliTheGifted = card("Saheeli, the Gifted", "Legendary Planeswalker — Saheeli", "{2}{U}{R}", {"cmc": 4, "loyalty": "4", "keywords": [], "oracleText": "+1: Create a 1/1 colorless Servo artifact creature token.\n+1: The next spell you cast this turn has affinity for artifacts. (It costs {1} less to cast for each artifact you control as you cast it.)\n−7: For each artifact you control, create a token that's a copy of it. Those tokens gain haste. Exile those tokens at the beginning of the next end step.\nSaheeli, the Gifted can be your commander.", "colors": ["R", "U"], "colorIdentity": ["R", "U"], "layout": "normal"});
const raphaelTagTeamTough = card("Raphael, Tag Team Tough", "Legendary Creature — Mutant Ninja Turtle", "{4}{R}{R}", {"cmc": 6, "power": "5", "toughness": "6", "keywords": ["Menace"], "oracleText": "Menace (This creature can't be blocked except by two or more creatures.)\nWhenever Raphael deals combat damage to a player for the first time each turn, untap all attacking creatures. After this combat phase, there is an additional combat phase.", "colors": ["R"], "colorIdentity": ["R"], "layout": "normal"});
const aloySaviorOfMeridian = card("Aloy, Savior of Meridian", "Legendary Creature — Human Warrior", "{3}{G}{U}", {"cmc": 5, "power": "3", "toughness": "5", "keywords": ["Reach", "Vigilance", "Discover", "In You, All Things Are Possible"], "oracleText": "Vigilance, reach\nIn You, All Things Are Possible — Whenever one or more artifact creatures you control attack, discover X, where X is the greatest power among them. (Exile cards from the top of your library until you exile a nonland card with that mana value or less. Cast it without paying its mana cost or put it into your hand. Put the rest on the bottom in a random order.)", "colors": ["G", "U"], "colorIdentity": ["G", "U"], "layout": "normal"});
const sarulfRealmEater = card("Sarulf, Realm Eater", "Legendary Creature — Wolf", "{1}{B}{G}", {"cmc": 3, "power": "3", "toughness": "3", "keywords": [], "oracleText": "Whenever a permanent an opponent controls is put into a graveyard from the battlefield, put a +1/+1 counter on Sarulf.\nAt the beginning of your upkeep, if Sarulf has one or more +1/+1 counters on it, you may remove all of them. If you do, exile each other nonland permanent with mana value less than or equal to the number of counters removed this way.", "colors": ["B", "G"], "colorIdentity": ["B", "G"], "layout": "normal"});
const anowonTheRuinThief = card("Anowon, the Ruin Thief", "Legendary Creature — Vampire Rogue", "{2}{U}{B}", {"cmc": 4, "power": "2", "toughness": "4", "keywords": ["Mill"], "oracleText": "Other Rogues you control get +1/+1.\nWhenever one or more Rogues you control deal combat damage to a player, that player mills a card for each 1 damage dealt to them. If the player mills at least one creature card this way, you draw a card. (To mill a card, a player puts the top card of their library into their graveyard.)", "colors": ["B", "U"], "colorIdentity": ["B", "U"], "layout": "normal"});
const tuktukScrapper = card("Tuktuk Scrapper", "Creature — Goblin Artificer Ally", "{3}{R}", {"cmc": 4, "power": "2", "toughness": "2", "keywords": [], "oracleText": "Whenever this creature or another Ally you control enters, you may destroy target artifact. If that artifact is put into a graveyard this way, this creature deals damage to that artifact's controller equal to the number of Allies you control.", "colors": ["R"], "colorIdentity": ["R"], "layout": "normal"});
const martyrsBond = card("Martyr's Bond", "Enchantment", "{4}{W}{W}", {"cmc": 6, "keywords": [], "oracleText": "Whenever this enchantment or another nonland permanent you control is put into a graveyard from the battlefield, each opponent sacrifices a permanent of their choice that shares a card type with it.", "colors": ["W"], "colorIdentity": ["W"], "layout": "normal"});
const dredgeTheMire = card("Dredge the Mire", "Sorcery", "{3}{B}", {"cmc": 4, "keywords": [], "oracleText": "Each opponent chooses a creature card in their graveyard. Put those cards onto the battlefield under your control.", "colors": ["B"], "colorIdentity": ["B"], "layout": "normal"});
const gideonOfTheTrials = card("Gideon of the Trials", "Legendary Planeswalker — Gideon", "{1}{W}{W}", {"cmc": 3, "loyalty": "3", "keywords": [], "oracleText": "+1: Until your next turn, prevent all damage target permanent would deal.\n0: Until end of turn, Gideon becomes a 4/4 Human Soldier creature with indestructible that's still a planeswalker. Prevent all damage that would be dealt to him this turn.\n0: You get an emblem with \"As long as you control a Gideon planeswalker, you can't lose the game and your opponents can't win the game.\"", "colors": ["W"], "colorIdentity": ["W"], "layout": "normal"});

const big = card("Test Giant", "Creature — Giant", "{4}{G}", { cmc: 5, power: "5", toughness: "5" });

describe("spells you cast have delve; you lose life equal to its mana value", () => {
  it("compile", () => supported(tevalArbiterOfVirtue));

  it("Teval: a spell without delve can exile cards from your graveyard for its generic mana, and you lose life for its mana value", () => {
    const { s: s0, ap } = setup([big]);
    const g = s0.players[ap]!.hand.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Test Giant")!;
    const yard = [0, 1, 2, 3].map(() => into(s0, ap, bear(), "graveyard"));
    expect(planCast(s0, ap, g, [], undefined, undefined, undefined, { delve: yard })).toBeNull();
    putOnBattlefield(s0, ap, tevalArbiterOfVirtue);
    const life = s0.players[ap]!.life;
    let s = run(s0, planCast(s0, ap, g, [], undefined, undefined, undefined, { delve: yard }));
    expect(yard.every((id) => s.objects[id]!.zone === "exile")).toBe(true);
    s = settle(s);
    expect(s.objects[g]!.zone).toBe("battlefield");
    expect(s.players[ap]!.life).toBe(life - 5);
  });
});

describe("you can't spend mana to cast this spell; convoke, delve", () => {
  it("compile", () => supported(hogaakArisenNecropolis));

  it("Hogaak: cast from the graveyard, paid only by creatures tapped for convoke and cards exiled for delve", () => {
    const { s: s0, ap } = setup([]);
    const h = into(s0, ap, hogaakArisenNecropolis, "graveyard");
    const yard = [0, 1, 2, 3, 4].map(() => into(s0, ap, land(`Yard Land ${Math.random()}`), "graveyard"));
    const bears = [0, 1].map(() => putOnBattlefield(s0, ap, bear()));
    s0.players[ap]!.manaPool.G = 10;
    // Mana alone, or too few creatures and cards, can't pay for it.
    const via = { via: "permission" as const };
    expect(castProblem(s0, ap, h, [], undefined, undefined, undefined, undefined, via)).toMatch(/not enough mana/);
    expect(planCast(s0, ap, h, [], undefined, "auto", undefined, via)).toBeNull();
    expect(planCast(s0, ap, h, [], undefined, "auto", undefined, { ...via, delve: yard.slice(0, 4) })).toBeNull();
    // Five cards for {5}, two green creatures for {B/G}{B/G}.
    const plan = planCast(s0, ap, h, [], undefined, "auto", undefined, { ...via, delve: yard });
    expect(plan?.some((a) => a.type === "castSpell" && a.convoke?.length === 2)).toBe(true);
    let s = run(s0, plan);
    expect(s.players[ap]!.manaPool.G).toBe(10);
    expect(bears.every((id) => s.objects[id]!.tapped)).toBe(true);
    s = settle(s);
    expect(s.objects[h]!.zone).toBe("battlefield");
  });
});

describe("the next spell you cast this turn has affinity for artifacts", () => {
  it("compile", () => supported(saheeliTheGifted));

  it("Saheeli, the Gifted: the next spell costs {1} less for each artifact you control as it's cast, then the reduction is gone", () => {
    const { s: s0, ap } = setup([rock("Test Rock", 5), rock("Other Rock", 5)]);
    const [r1, r2] = s0.players[ap]!.hand.slice(-2);
    const sa = putOnBattlefield(s0, ap, saheeliTheGifted);
    s0.objects[sa]!.counters.loyalty = 4;
    for (let i = 0; i < 3; i++) putOnBattlefield(s0, ap, rock(`Board Rock ${i}`, 1));
    let s = run(s0, planActivate(s0, ap, sa, 1));
    s = settle(s);
    expect(spellCost(s, ap, s.objects[r1!]!).extra).toBe(2);
    s = run(s, planCast(s, ap, r1!));
    s = settle(s);
    // Four artifacts now, but the reduction was used up.
    expect(spellCost(s, ap, s.objects[r2!]!).extra).toBe(5);
  });
});

/** Cards put on top of `pid`'s library, the first one on top. */
const onTop = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  const ids = defs.map((d) => into(s, pid, d, "library"));
  const lib = s.players[pid]!.library;
  lib.splice(0, ids.length);
  lib.unshift(...ids);
  return ids;
};
const rogue = (n = "Test Rogue") => card(n, "Creature — Human Rogue", "{1}{B}", { cmc: 2, power: "2", toughness: "2" });
const artifactCreature = (n = "Test Construct", p = "3") => card(n, "Artifact Creature — Construct", "{3}", { cmc: 3, power: p, toughness: p });

describe("deals combat damage to a player for the first time each turn: untap all attacking creatures, another combat", () => {
  it("compile", () => supported(raphaelTagTeamTough));

  it("Raphael: the first hit untaps the attackers and adds a combat; its second hit that turn doesn't", () => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, raphaelTagTeamTough);
    const b = putOnBattlefield(s0, ap, bear());
    const life = s0.players[opp]!.life;
    let s = attack(s0, ap, opp, [r, b]);
    s = passUntil(s, "combatDamage", ap);
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 7);
    expect(s.objects[r]!.tapped).toBe(false);
    expect(s.objects[b]!.tapped).toBe(false);
    // The additional combat: attack again with Raphael alone.
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: r, defender: opp }] });
    s = passUntil(s, "combatDamage", ap);
    s = settle(s);
    expect(s.players[opp]!.life).toBe(life - 12);
    expect(s.objects[r]!.tapped).toBe(true);
    s = passUntil(s, "main2", ap);
    expect(s.step).toBe("main2");
  });
});

describe("whenever one or more artifact creatures you control attack, discover X, the greatest power among them", () => {
  it("compile", () => supported(aloySaviorOfMeridian));

  it("Aloy: X is the greatest power among the artifact creatures that attacked", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, aloySaviorOfMeridian);
    const a1 = putOnBattlefield(s0, ap, artifactCreature("Small Construct", "1"));
    const a3 = putOnBattlefield(s0, ap, artifactCreature("Big Construct", "3"));
    const [, big, hit] = onTop(s0, ap, [land(), rock("Pricey Rock", 4), rock("Cheap Rock", 3)]);
    let s = attack(s0, ap, opp, [a1, a3]);
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: hit, how: "discover" });
    expect(s.objects[big!]!.zone).toBe("exile");
  });
});

describe("if ~ has +1/+1 counters, you may remove all of them; if you do, exile each other nonland permanent with mana value up to that", () => {
  it("compile", () => supported(sarulfRealmEater));

  for (const yes of [true, false])
    it(`Sarulf: removing two counters exiles the other nonland permanents with mana value 2 or less (${yes ? "yes" : "no"})`, () => {
      const { s: s0, ap, opp } = setup([]);
      const sa = putOnBattlefield(s0, ap, sarulfRealmEater);
      s0.objects[sa]!.counters["+1/+1"] = 2;
      const mine = putOnBattlefield(s0, ap, bear());
      const two = putOnBattlefield(s0, opp, rock("Two Rock", 2));
      const three = putOnBattlefield(s0, opp, rock("Three Rock", 3));
      const l = putOnBattlefield(s0, opp, land());
      invalidateCharacteristics(s0);
      let s = passUntil(s0, "upkeep", ap);
      s = settle(s, { may: yes });
      expect(s.objects[mine]!.zone).toBe(yes ? "exile" : "battlefield");
      expect(s.objects[two]!.zone).toBe(yes ? "exile" : "battlefield");
      expect(s.objects[three]!.zone).toBe("battlefield");
      expect(s.objects[l]!.zone).toBe("battlefield");
      expect(s.objects[sa]!.zone).toBe("battlefield");
      expect(s.objects[sa]!.counters["+1/+1"] ?? 0).toBe(yes ? 0 : 2);
    });

  it("Sarulf: with no +1/+1 counters it doesn't trigger", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, sarulfRealmEater);
    const two = putOnBattlefield(s0, opp, rock("Two Rock", 0));
    let s = passUntil(s0, "upkeep", ap);
    s = settle(s, { may: true });
    expect(s.objects[two]!.zone).toBe("battlefield");
  });
});

describe("that player mills a card for each 1 damage; if a creature card is milled, you draw a card", () => {
  it("compile", () => supported(anowonTheRuinThief));

  for (const creature of [true, false])
    it(`Anowon: the Rogues' damage is how many are milled, and one draw ${creature ? "for a creature card" : "only with a creature card"}`, () => {
      const { s: s0, ap, opp } = setup([]);
      emptyHand(s0, ap);
      putOnBattlefield(s0, ap, anowonTheRuinThief);
      const r = putOnBattlefield(s0, ap, rogue());
      const top = onTop(s0, opp, [land("Top Land"), land("Second Land"), creature ? bear() : land("Third Land"), land("Fourth Land")]);
      let s = attack(s0, ap, opp, [r]);
      s = passUntil(s, "combatDamage", ap);
      s = settle(s);
      expect(top.map((id) => s.objects[id]!.zone)).toEqual(["graveyard", "graveyard", "graveyard", "library"]);
      expect(s.players[ap]!.hand.length).toBe(creature ? 1 : 0);
    });
});

describe("you may destroy target artifact; if it's put into a graveyard this way, damage to its controller", () => {
  it("compile", () => supported(tuktukScrapper));

  it("Tuktuk Scrapper: damage equal to the Allies you control; none for an artifact that isn't destroyed", () => {
    for (const tough of [false, true]) {
      const { s: s0, ap, opp } = setup([tuktukScrapper]);
      const ts = s0.players[ap]!.hand.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === tuktukScrapper.name)!;
      putOnBattlefield(s0, ap, card("Test Ally", "Creature — Human Ally", "{1}", { cmc: 1, power: "1", toughness: "1" }));
      const r = putOnBattlefield(s0, opp, tough ? card("Tough Rock", "Artifact", "{2}", { cmc: 2, keywords: ["Indestructible"], oracleText: "Indestructible" }) : rock());
      const life = s0.players[opp]!.life;
      let s = run(s0, planCast(s0, ap, ts));
      s = settle(s, { may: true, targets: [tgt(r)] });
      expect(s.objects[r]!.zone).toBe(tough ? "battlefield" : "graveyard");
      expect(s.players[opp]!.life).toBe(tough ? life : life - 2);
    }
  });
});

describe("each opponent sacrifices a permanent that shares a card type with it", () => {
  it("compile", () => supported(martyrsBond));

  it("Martyr's Bond: an artifact of yours dies, so each opponent sacrifices an artifact", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, martyrsBond);
    const mine = putOnBattlefield(s0, ap, rock("My Rock", 2));
    const opps = s0.turnOrder.filter((p) => p !== ap);
    const theirs = opps.map((p) => [putOnBattlefield(s0, p, rock(`Rock ${p}`, 2)), putOnBattlefield(s0, p, bear())] as const);
    destroyPermanent(s0, s0.objects[mine]!, "test", false, ap);
    const s = settle(s0);
    for (const [r, b] of theirs) {
      expect(s.objects[r]!.zone).toBe("graveyard");
      expect(s.objects[b]!.zone).toBe("battlefield");
    }
  });
});

describe("each opponent chooses a creature card in their graveyard; put those onto the battlefield under your control", () => {
  it("compile", () => supported(dredgeTheMire));

  it("Dredge the Mire: each opponent's choice, all entering under your control", () => {
    const { s: s0, ap } = setup([dredgeTheMire]);
    const dm = s0.players[ap]!.hand.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === dredgeTheMire.name)!;
    const [o1, o2, o3] = s0.turnOrder.filter((p) => p !== ap) as [PlayerId, PlayerId, PlayerId];
    const one = into(s0, o1, bear({ name: "Only Bear" }), "graveyard");
    const two = [into(s0, o2, bear({ name: "Bear A" }), "graveyard"), into(s0, o2, bear({ name: "Bear B" }), "graveyard")];
    into(s0, o3, land(), "graveyard");
    let s = run(s0, planCast(s0, ap, dm));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: o2, fromGraveyard: "battlefield" });
    s = act(s, { type: "searchLibrary", player: o2, found: [two[1]!] });
    s = settle(s);
    for (const id of [one, two[1]!]) {
      expect(s.objects[id]!.zone).toBe("battlefield");
      expect(s.objects[id]!.controller).toBe(ap);
    }
    expect(s.objects[two[0]!]!.zone).toBe("graveyard");
  });
});

describe("until your next turn, prevent all damage target permanent would deal; a can't-lose emblem while you control a Gideon", () => {
  it("compile", () => supported(gideonOfTheTrials));

  it("Gideon of the Trials: the permanent deals no damage until your next turn; the emblem works only with a Gideon", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, gideonOfTheTrials);
    s0.objects[g]!.counters.loyalty = 3;
    const b = putOnBattlefield(s0, opp, bear());
    let s = run(s0, planActivate(s0, ap, g, 0, [tgt(b)]));
    s = settle(s);
    const effect = s.effects.find((e) => e.affected.includes(b));
    expect(effect?.duration).toBe("yourNextTurn");

    const { s: t0, ap: ap2 } = setup([]);
    const g2 = putOnBattlefield(t0, ap2, gideonOfTheTrials);
    t0.objects[g2]!.counters.loyalty = 3;
    let t = run(t0, planActivate(t0, ap2, g2, 2));
    t = settle(t);
    expect((t.emblems ?? []).length).toBe(1);
    expect(gameEndBlocked(t, ap2, "lose")).toBe(true);
    expect(gameEndBlocked(t, t.turnOrder.find((p) => p !== ap2)!, "win")).toBe(true);
    loseLife(t, ap2, 50);
    t = settle(t);
    expect(t.players[ap2]!.lost).toBe(false);
    // Without a Gideon planeswalker, it does nothing (rulings).
    destroyPermanent(t, t.objects[g2]!, "test", false, ap2);
    t = act(t, { type: "passPriority", player: waitingOn(t)! });
    expect(gameEndBlocked(t, ap2, "lose")).toBe(false);
    expect(t.players[ap2]!.lost).toBe(true);
  });
});

const yennettCrypticSovereign = card("Yennett, Cryptic Sovereign", "Legendary Creature — Sphinx", "{2}{W}{U}{B}", {"cmc": 5, "power": "3", "toughness": "5", "keywords": ["Flying", "Vigilance", "Menace"], "oracleText": "Flying, vigilance, menace\nWhenever Yennett attacks, reveal the top card of your library. You may cast it without paying its mana cost if its mana value is odd. If you don't cast it, draw a card.", "colors": ["B", "U", "W"], "colorIdentity": ["B", "U", "W"], "layout": "normal"});
const nissaWorldwaker = card("Nissa, Worldwaker", "Legendary Planeswalker — Nissa", "{3}{G}{G}", {"cmc": 5, "loyalty": "3", "keywords": [], "oracleText": "+1: Target land you control becomes a 4/4 Elemental creature with trample. It's still a land.\n+1: Untap up to four target Forests.\n−7: Search your library for any number of basic land cards, put them onto the battlefield, then shuffle. Those lands become 4/4 Elemental creatures with trample. They're still lands.", "colors": ["G"], "colorIdentity": ["G"], "layout": "normal"});

describe("reveal the top card; cast it free if its mana value is odd; if you don't cast it, draw a card", () => {
  it("compile", () => supported(yennettCrypticSovereign));

  it("Yennett: an odd mana value card is cast for free; declined, you draw it", () => {
    const { s: s0, ap, opp } = setup([]);
    const y = putOnBattlefield(s0, ap, yennettCrypticSovereign);
    const [r] = onTop(s0, ap, [rock("Odd Rock", 3)]);
    let s = settle(attack(s0, ap, opp, [y]));
    expect(s.pending?.kind === "chooseOption" && s.pending.what === "castFromAmong" && s.pending.options.includes(r!)).toBe(true);
    s = act(s, { type: "chooseOption", player: ap, choice: r! });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: r });
    s = settle(act(s, { type: "castSpell", player: ap, objectId: r!, targets: [] }));
    expect(s.objects[r!]!.zone).toBe("battlefield");

    const { s: t0, ap: ap2, opp: opp2 } = setup([]);
    const y2 = putOnBattlefield(t0, ap2, yennettCrypticSovereign);
    const [r2] = onTop(t0, ap2, [rock("Odd Rock", 3)]);
    let t = settle(attack(t0, ap2, opp2, [y2]));
    t = settle(act(t, { type: "chooseOption", player: ap2, choice: "none" }));
    expect(t.objects[r2!]!.zone).toBe("hand");
  });

  it("Yennett: an even mana value card can't be cast; you draw it", () => {
    const { s: s0, ap, opp } = setup([]);
    const y = putOnBattlefield(s0, ap, yennettCrypticSovereign);
    const [b, l] = onTop(s0, ap, [bear(), land()]);
    const hand = s0.players[ap]!.hand.length;
    const s = settle(attack(s0, ap, opp, [y]));
    expect(s.pending).toBeFalsy();
    expect(s.objects[b!]!.zone).toBe("hand");
    expect(s.objects[l!]!.zone).toBe("library");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });
});

describe("search for any number of basic lands onto the battlefield; those lands become 4/4 Elemental creatures", () => {
  it("compile", () => supported(nissaWorldwaker));

  it("Nissa, Worldwaker: −7 animates every basic land found, and they stay lands; +1 untaps Forests", () => {
    const { s: s0, ap } = setup([]);
    const n = putOnBattlefield(s0, ap, nissaWorldwaker);
    s0.objects[n]!.counters.loyalty = 7;
    const forest = card("Forest", "Basic Land — Forest");
    const lands = [into(s0, ap, forest, "library"), into(s0, ap, forest, "library")];
    const old = putOnBattlefield(s0, ap, land("Old Land"));
    let s = run(s0, planActivate(s0, ap, n, 2));
    s = settle(s);
    if (s.pending?.kind === "searchLibrary") s = settle(act(s, { type: "searchLibrary", player: ap, found: lands }));
    for (const id of lands) {
      expect(s.objects[id]!.zone).toBe("battlefield");
      const c = characteristics(s, s.objects[id]!);
      expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
      expect(c.subtypes).toEqual(expect.arrayContaining(["Forest", "Elemental"]));
      expect(c.keywords).toContain("Trample");
      expect([power(s, s.objects[id]!), toughness(s, s.objects[id]!)]).toEqual([4, 4]);
    }
    expect(characteristics(s, s.objects[old]!).types).not.toContain("Creature");
  });
});

const shieldBroker = card("Shield Broker", "Creature — Octopus Advisor", "{3}{U}{U}", {"cmc": 5, "power": "3", "toughness": "3", "keywords": [], "oracleText": "When this creature enters, put a shield counter on target noncommander creature you don't control. You gain control of that creature for as long as it has a shield counter on it. (If it would be dealt damage or destroyed, remove a shield counter from it instead.)", "colors": ["U"], "colorIdentity": ["U"], "layout": "normal"});
const holyAvenger = card("Holy Avenger", "Artifact — Equipment", "{2}{W}", {"cmc": 3, "keywords": ["Equip"], "oracleText": "Equipped creature has double strike.\nWhenever equipped creature deals combat damage, you may put an Aura card from your hand onto the battlefield attached to it.\nEquip {2}{W}", "colors": ["W"], "colorIdentity": ["W"], "layout": "normal"});
const testAura = card("Test Aura", "Enchantment — Aura", "{1}{W}", { cmc: 2, oracleText: "Enchant creature\nEnchanted creature gets +1/+1." });

describe("put a shield counter on target creature; gain control of it for as long as it has a shield counter", () => {
  it("compile", () => supported(shieldBroker));

  it("Shield Broker: you control the creature until its shield counter is gone", () => {
    const { s: s0, ap, opp } = setup([shieldBroker]);
    const sb = s0.players[ap]!.hand.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Shield Broker")!;
    const b = putOnBattlefield(s0, opp, bear());
    s0.players[ap]!.manaPool.U = 5;
    let s = run(s0, planCast(s0, ap, sb));
    s = settle(s, { targets: [tgt(b)] });
    expect(s.objects[b]!.counters.shield).toBe(1);
    expect(controllerOf(s, s.objects[b]!)).toBe(ap);
    s.objects[b]!.counters.shield = 0;
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(controllerOf(s, s.objects[b]!)).toBe(opp);
  });
});

describe("whenever equipped creature deals combat damage, you may put an Aura card from your hand onto the battlefield attached to it", () => {
  it("compile", () => supported(holyAvenger));

  it("Holy Avenger: the Aura enters enchanting the equipped creature", () => {
    const { s: s0, ap, opp } = setup([testAura]);
    emptyHand(s0, ap);
    const aura = into(s0, ap, testAura, "hand");
    const c = putOnBattlefield(s0, ap, bear());
    const eq = putOnBattlefield(s0, ap, holyAvenger);
    s0.objects[eq]!.attachedTo = c;
    invalidateCharacteristics(s0);
    const life = s0.players[opp]!.life;
    let s = attack(s0, ap, opp, [c]);
    for (let i = 0; i < 50 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    if (s.pending?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: s.pending.player, blocks: [] });
    for (let i = 0; i < 50 && !s.pending; i++) s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }), { may: true });
    expect(s.pending?.kind).toBe("searchLibrary");
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [aura] }));
    expect(s.objects[aura]!.zone).toBe("battlefield");
    expect(s.objects[aura]!.attachedTo).toBe(c);
    expect([power(s, s.objects[c]!), toughness(s, s.objects[c]!)]).toEqual([3, 3]);
    // First strike damage, then regular damage with the Aura's +1/+1 (CR 702.4b).
    s = settle(passUntil(s, "main2", ap));
    expect(s.players[opp]!.life).toBe(life - 5);
  });
});

const yuffieMateriaHunter = card("Yuffie, Materia Hunter", "Legendary Creature — Human Ninja", "{2}{R}", {"cmc": 3, "power": "3", "toughness": "3", "keywords": ["Ninjutsu"], "oracleText": "Ninjutsu {1}{R} ({1}{R}, Return an unblocked attacker you control to hand: Put this card onto the battlefield from your hand tapped and attacking.)\nWhen Yuffie enters, gain control of target noncreature artifact for as long as you control Yuffie. Then you may attach an Equipment you control to Yuffie.", "colors": ["R"], "colorIdentity": ["R"], "layout": "normal"});
const testSword = card("Test Sword", "Artifact — Equipment", "{1}", { cmc: 1, oracleText: "Equipped creature gets +2/+0.\nEquip {1}" });

describe("gain control of target noncreature artifact for as long as you control ~; then you may attach an Equipment you control to ~", () => {
  it("compile", () => supported(yuffieMateriaHunter, testSword));

  it("Yuffie: the opponent's Equipment is yours, and you may attach it to her", () => {
    const { s: s0, ap, opp } = setup([yuffieMateriaHunter]);
    const y = s0.players[ap]!.hand.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Yuffie, Materia Hunter")!;
    const sword = putOnBattlefield(s0, opp, testSword);
    s0.players[ap]!.manaPool.R = 3;
    let s = run(s0, planCast(s0, ap, y));
    s = settle(s, { targets: [tgt(sword)] });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "attach", count: 1, min: 0, options: [sword] });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [sword] }));
    expect(s.objects[sword]!.attachedTo).toBe(y);
    expect(controllerOf(s, s.objects[sword]!)).toBe(ap);
    expect(power(s, s.objects[y]!)).toBe(5);
  });

  it("Yuffie: attaching is optional", () => {
    const { s: s0, ap, opp } = setup([yuffieMateriaHunter]);
    const y = s0.players[ap]!.hand.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Yuffie, Materia Hunter")!;
    const rockId = putOnBattlefield(s0, opp, rock());
    const mine = putOnBattlefield(s0, ap, testSword);
    s0.players[ap]!.manaPool.R = 3;
    let s = run(s0, planCast(s0, ap, y));
    s = settle(s, { targets: [tgt(rockId)] });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", options: [mine] });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [] }));
    expect(s.objects[mine]!.attachedTo).toBeUndefined();
    expect(controllerOf(s, s.objects[rockId]!)).toBe(ap);
  });
});

const altarOfThePantheon = card("Altar of the Pantheon", "Artifact", "{3}", {"cmc": 3, "keywords": [], "oracleText": "Your devotion to each color and each combination of colors is increased by one.\n{T}: Add one mana of any color. If you control a God, a Demigod, or a legendary enchantment, you gain 1 life.", "colors": [], "colorIdentity": [], "layout": "normal"});

describe("your devotion to each color and each combination of colors is increased by one; mana with a life rider", () => {
  it("compile", () => supported(altarOfThePantheon));

  it("Altar of the Pantheon: one more devotion to a color and to two colors together, even with no symbols of them", () => {
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, card("Green Elf", "Creature — Elf", "{1}{G}{G}", { cmc: 3, power: "2", toughness: "2" }));
    const dev = (colors: ("W" | "U" | "B" | "R" | "G")[]) => evalAmount(s, { count: { kind: "devotion", colors } }, { controller: ap });
    expect(dev(["G"])).toBe(2);
    putOnBattlefield(s, ap, altarOfThePantheon);
    expect(dev(["G"])).toBe(3);
    expect(dev(["R", "G"])).toBe(3);
    expect(dev(["W"])).toBe(1);
  });

  it("Altar of the Pantheon: you gain 1 life only while you control a God, a Demigod, or a legendary enchantment", () => {
    const { s: s0, ap } = setup([]);
    const a = putOnBattlefield(s0, ap, altarOfThePantheon);
    const life = s0.players[ap]!.life;
    let s = act(s0, { type: "activateAbility", player: ap, objectId: a, index: 0, mana: "W" });
    expect(s.players[ap]!.manaPool.W).toBe(1);
    expect(s.players[ap]!.life).toBe(life);
    const { s: t0, ap: ap2 } = setup([]);
    const a2 = putOnBattlefield(t0, ap2, altarOfThePantheon);
    putOnBattlefield(t0, ap2, card("Test Saga", "Legendary Enchantment", "{2}", { cmc: 2 }));
    const life2 = t0.players[ap2]!.life;
    s = act(t0, { type: "activateAbility", player: ap2, objectId: a2, index: 0, mana: "B" });
    expect(s.players[ap2]!.manaPool.B).toBe(1);
    expect(s.players[ap2]!.life).toBe(life2 + 1);
  });
});

const nicolBolasPlaneswalker = card("Nicol Bolas, Planeswalker", "Legendary Planeswalker — Bolas", "{4}{U}{B}{B}{R}", {"cmc": 8, "loyalty": "5", "keywords": [], "oracleText": "+3: Destroy target noncreature permanent.\n−2: Gain control of target creature.\n−9: Nicol Bolas, Planeswalker deals 7 damage to target player or planeswalker. That player or that planeswalker's controller discards seven cards, then sacrifices seven permanents of their choice.", "colors": ["B", "R", "U"], "colorIdentity": ["B", "R", "U"], "layout": "normal"});

describe("deals 7 damage to target player or planeswalker; that player or that planeswalker's controller discards seven, then sacrifices seven permanents", () => {
  it("compile", () => supported(nicolBolasPlaneswalker));

  it("Nicol Bolas, Planeswalker: aimed at a planeswalker, its controller discards and sacrifices", () => {
    const { s: s0, ap, opp } = setup([]);
    const nb = putOnBattlefield(s0, ap, nicolBolasPlaneswalker);
    s0.objects[nb]!.counters.loyalty = 9;
    const pw = putOnBattlefield(s0, opp, card("Test Walker", "Legendary Planeswalker — Test", "{3}", { cmc: 3, loyalty: "10" }));
    s0.objects[pw]!.counters.loyalty = 10;
    const bears = [putOnBattlefield(s0, opp, bear()), putOnBattlefield(s0, opp, bear())];
    emptyHand(s0, opp);
    for (let i = 0; i < 3; i++) into(s0, opp, bear(), "hand");
    const mine = putOnBattlefield(s0, ap, bear());
    let s = run(s0, planActivate(s0, ap, nb, 2, [tgt(pw)]));
    s = settle(s);
    expect(s.objects[pw]!.zone).toBe("graveyard");
    expect(bears.every((id) => s.objects[id]!.zone === "graveyard")).toBe(true);
    expect(s.players[opp]!.hand.length).toBe(0);
    expect(s.objects[mine]!.zone).toBe("battlefield");
  });
});

const chandraAcolyteOfFlame = card("Chandra, Acolyte of Flame", "Legendary Planeswalker — Chandra", "{1}{R}{R}", {"cmc": 3, "loyalty": "4", "keywords": [], "oracleText": "0: Put a loyalty counter on each red planeswalker you control.\n0: Create two 1/1 red Elemental creature tokens. They gain haste. Sacrifice them at the beginning of the next end step.\n−2: You may cast target instant or sorcery card with mana value 3 or less from your graveyard. If that spell would be put into your graveyard, exile it instead.", "colors": ["R"], "colorIdentity": ["R"], "layout": "normal"});
const testShock = card("Test Shock", "Instant", "{R}", { cmc: 1, oracleText: "Test Shock deals 2 damage to any target." });

describe("you may cast target instant or sorcery card with mana value 3 or less from your graveyard; exile it after", () => {
  it("compile", () => supported(chandraAcolyteOfFlame, testShock));

  it("Chandra, Acolyte of Flame: cast the instant from the graveyard as −2 resolves, paying for it; then it's exiled", () => {
    const { s: s0, ap, opp } = setup([]);
    const c = putOnBattlefield(s0, ap, chandraAcolyteOfFlame);
    s0.objects[c]!.counters.loyalty = 4;
    const shock = into(s0, ap, testShock, "graveyard");
    const big = into(s0, ap, card("Big Sorcery", "Sorcery", "{3}{R}", { cmc: 4, oracleText: "Draw two cards." }), "graveyard");
    expect(planActivate(s0, ap, c, 2, [tgt(big)])).toBeNull();
    s0.players[ap]!.manaPool.R = 1;
    const life = s0.players[opp]!.life;
    let s = run(s0, planActivate(s0, ap, c, 2, [tgt(shock)]));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: shock, how: "paid" });
    s = settle(act(s, { type: "castSpell", player: ap, objectId: shock, targets: [{ kind: "player", id: opp }] }));
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(s.objects[shock]!.zone).toBe("exile");
    expect(s.players[ap]!.manaPool.R ?? 0).toBe(0);
  });
});

const stillnessInMotion = card("Stillness in Motion", "Enchantment", "{1}{U}", {"cmc": 2, "keywords": [], "oracleText": "At the beginning of your upkeep, mill three cards. Then if your library has no cards in it, exile this enchantment and put five cards from your graveyard on top of your library in any order.", "colors": ["U"], "colorIdentity": ["U"], "layout": "normal"});

describe("mill three; then if your library is empty, exile ~ and put five cards from your graveyard on top in any order", () => {
  it("compile", () => supported(stillnessInMotion));

  it("Stillness in Motion: the library runs out, so five chosen cards go back on top in the order you pick", () => {
    const { s: s0, ap } = setup([]);
    const st = putOnBattlefield(s0, ap, stillnessInMotion);
    const lib = s0.players[ap]!.library;
    for (const id of lib.splice(3)) {
      s0.objects[id]!.zone = "exile";
      s0.players[ap]!.exile.push(id);
    }
    const yard = [0, 1, 2].map((i) => into(s0, ap, bear({ name: `Yard Bear ${i}` }), "graveyard"));
    let s = passUntil(s0, "upkeep", s0.turnOrder.find((p) => p !== ap));
    s = settle(passUntil(s, "upkeep", ap));
    expect(s.objects[st]!.zone).toBe("exile");
    expect(s.pending).toMatchObject({ kind: "searchLibrary", min: 5, max: 5 });
    const before = s.players[ap]!.graveyard.length;
    const picked = [...yard, ...s.players[ap]!.graveyard.filter((id) => !yard.includes(id)).slice(0, 2)];
    s = act(s, { type: "searchLibrary", player: ap, found: picked });
    expect(s.pending).toMatchObject({ kind: "arrangeTop", how: "order" });
    const order = [yard[2]!, yard[0]!, yard[1]!, picked[3]!, picked[4]!];
    s = settle(act(s, { type: "arrangeTop", player: ap, top: order, away: [] }));
    expect(s.players[ap]!.library).toEqual(order);
    expect(s.players[ap]!.graveyard).toHaveLength(before - 5);
  });
});

// Cards the round's new text also covers.
const winterSoldierIcyAssassin = card("Winter Soldier, Icy Assassin", "Legendary Creature — Human Assassin Villain", "{W}{B}", {"cmc": 2, "power": "2", "toughness": "2", "keywords": ["Vigilance", "Menace"], "oracleText": "Vigilance, menace\nWinter Soldier gets +2/+0 for each Equipment attached to him.\n{3}{W}{B}: Return this card from your graveyard to the battlefield with a finality counter on him. Then you may attach an Equipment you control to him. (If a creature with a finality counter on it would die, exile it instead.)", "colors": ["B", "W"], "colorIdentity": ["B", "W"], "layout": "normal"});
const fendeepSummoner = card("Fendeep Summoner", "Creature — Treefolk Shaman", "{4}{B}", {"cmc": 5, "power": "3", "toughness": "5", "keywords": [], "oracleText": "{T}: Up to two target Swamps each become 3/5 Treefolk Warrior creatures in addition to their other types until end of turn.", "colors": ["B"], "colorIdentity": ["B"], "layout": "normal"});
const inTheEyeOfChaos = card("In the Eye of Chaos", "World Enchantment", "{2}{U}", {"cmc": 3, "keywords": [], "oracleText": "Whenever a player casts an instant spell, counter it unless that player pays {X}, where X is its mana value.", "colors": ["U"], "colorIdentity": ["U"], "layout": "normal"});

describe("other cards the round's text covers", () => {
  it("compile", () => supported(winterSoldierIcyAssassin, fendeepSummoner, inTheEyeOfChaos));

  it("Winter Soldier: returned from the graveyard, then an Equipment you control attached to him", () => {
    const { s: s0, ap } = setup([]);
    const w = into(s0, ap, winterSoldierIcyAssassin, "graveyard");
    const sword = putOnBattlefield(s0, ap, testSword);
    Object.assign(s0.players[ap]!.manaPool, { W: 2, B: 2, C: 1 });
    const i = abilitiesOf(s0, s0.objects[w]!).activated.findIndex((a) => /from your graveyard/.test(a.text));
    let s = run(s0, planActivate(s0, ap, w, i));
    s = settle(s);
    expect(s.objects[w]!.zone).toBe("battlefield");
    expect(s.objects[w]!.counters.finality).toBe(1);
    expect(s.pending).toMatchObject({ kind: "pickPermanents", action: "attach", options: [sword] });
    s = settle(act(s, { type: "pickPermanents", player: ap, ids: [sword] }));
    expect(s.objects[sword]!.attachedTo).toBe(w);
    expect(power(s, s.objects[w]!)).toBe(6);
  });
});
