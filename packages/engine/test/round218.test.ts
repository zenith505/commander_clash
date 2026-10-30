// Round 218: Bleeding Effect, Super-Adaptoid, Aberrant Mind Sorcerer, Zimone's Experiment, Last Laugh, Weftwalking, Bane,
// Lord of Darkness, Seize the Storm, Prized Amalgam (the "next fresh candidates" after round 217) and fresh cards from
// EDHREC rank 6,000 on.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { nextRandom } from "../src/rng";
import { moveObject } from "../src/game";
import { altCostsFor, applyAction, characteristics, controllerOf, planActivate, botActions, castProblem, invalidateCharacteristics, isFullySupported, objHasKeyword, planCast, power, runStateBasedActions, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const ply = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const into = (s: GameState, pid: PlayerId, def: CardDef, z: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = z;
  if (z === "library") s.players[pid]!.library.unshift(id);
  else s.players[pid]![z].push(id);
  invalidateCharacteristics(s);
  return id;
};
/**
 * Everyone passes until the stack is empty, answering "you may" with `may` and trigger targets with `targets`; other
 * players' questions are answered as the bots would. Stops at any other question of `me`'s.
 */
const settle = (s: GameState, opts: { may?: boolean; targets?: TargetChoice[]; me?: PlayerId } = {}) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && opts.me !== undefined && p.player !== opts.me) s = act(s, botActions(s, p.player)[0]!);
    else if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: opts.may ?? true });
    else if (p?.kind === "chooseTargets") s = act(s, { type: "chooseTargets", player: p.player, targets: opts.targets ?? [] });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** The next dice rolled come up `values`, in order (the game's seeded random numbers, CR 706.1b). */
function rig(s: GameState, sides: number, values: number[]) {
  for (let st = 1; st < 50_000_000; st++) {
    const t = { rngState: st };
    if (values.every((v) => 1 + Math.floor(nextRandom(t) * sides) === v)) {
      s.rngState = st;
      return;
    }
  }
  throw new Error("no such seed");
}
const pt = (s: GameState, id: ObjectId) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const emptyHand = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.splice(0).forEach((id) => (s.objects[id]!.zone = "exile"));

// Real oracle text (Scryfall).
const bleedingEffect = card("Bleeding Effect", "Enchantment", "{2}{W}{B}", {"cmc":4,"oracleText":"At the beginning of combat on your turn, creatures you control gain flying until end of turn if a creature card in your graveyard has flying. The same is true for first strike, double strike, deathtouch, hexproof, indestructible, lifelink, menace, reach, trample, and vigilance.","keywords":[],"layout":"normal"});
const superadaptoid = card("Super-Adaptoid", "Legendary Artifact Creature — Robot Villain", "{2}", {"cmc":2,"oracleText":"Super-Adaptoid's power is equal to the number of legendary creatures you control.\nWhenever Super-Adaptoid enters or attacks, choose another target creature. If that creature has haste and Super-Adaptoid doesn't, put a haste counter on Super-Adaptoid. Do the same for flying, first strike, double strike, deathtouch, indestructible, lifelink, menace, reach, trample, and vigilance.","power":"*","toughness":"2","keywords":[],"layout":"normal"});
const aberrantMindSo = card("Aberrant Mind Sorcerer", "Creature — Human Elf Shaman Sorcerer", "{4}{U}", {"cmc":5,"oracleText":"Psionic Spells — When this creature enters, choose target instant or sorcery card in your graveyard, then roll a d20.\n1—9 | You may put that card on top of your library.\n10—20 | Return that card to your hand.","power":"3","toughness":"4","keywords":[],"layout":"normal"});
const zimonesExperim = card("Zimone's Experiment", "Sorcery", "{3}{G}", {"cmc":4,"oracleText":"Look at the top five cards of your library. You may reveal up to two creature and/or land cards from among them, then put the rest on the bottom of your library in a random order. Put all land cards revealed this way onto the battlefield tapped and put all creature cards revealed this way into your hand.","keywords":[],"layout":"normal"});
const lastLaugh = card("Last Laugh", "Enchantment", "{2}{B}{B}", {"cmc":4,"oracleText":"Whenever a permanent other than this enchantment is put into a graveyard from the battlefield, this enchantment deals 1 damage to each creature and each player.\nWhen no creatures are on the battlefield, sacrifice this enchantment.","keywords":[],"layout":"normal"});
const weftwalking = card("Weftwalking", "Enchantment", "{4}{U}{U}", {"cmc":6,"oracleText":"When this enchantment enters, if you cast it, shuffle your hand and graveyard into your library, then draw seven cards.\nThe first spell each player casts during each of their turns may be cast without paying its mana cost.","keywords":[],"layout":"normal"});
const baneLordOfDark = card("Bane, Lord of Darkness", "Legendary Creature — God", "{1}{W}{U}{B}", {"cmc":4,"oracleText":"As long as your life total is less than or equal to half your starting life total, Bane has indestructible.\nWhenever another nontoken creature you control dies, target opponent may have you draw a card. If they don't, you may put a creature card with equal or lesser toughness from your hand onto the battlefield.","power":"5","toughness":"2","keywords":[],"layout":"normal"});
const seizeTheStorm = card("Seize the Storm", "Sorcery", "{4}{R}", {"cmc":5,"oracleText":"Create a red Elemental creature token with trample and \"This token's power and toughness are each equal to the number of instant and sorcery cards in your graveyard plus the number of cards with flashback you own in exile.\"\nFlashback {6}{R} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","keywords":["Flashback"],"layout":"normal"});
const prizedAmalgam = card("Prized Amalgam", "Creature — Zombie", "{1}{U}{B}", {"cmc":3,"oracleText":"Whenever a creature enters, if it entered from your graveyard or you cast it from your graveyard, return this card from your graveyard to the battlefield tapped at the beginning of the next end step.","power":"3","toughness":"3","keywords":[],"layout":"normal"});
const nyamiclassMoth = card("N'Yami-Class Mother Ship", "Artifact — Vehicle", "{6}", {"cmc":6,"oracleText":"Flying, vigilance, haste\nWhenever this Vehicle deals combat damage to a player, look at the top card of your library. If it's a permanent card, you may put it onto the battlefield. If you don't put it onto the battlefield, put it into your hand.\nCrew 3","power":"5","toughness":"7","keywords":["Flying","Vigilance","Haste","Crew"],"layout":"normal"});
const zaffaiAndTheTe = card("Zaffai and the Tempests", "Legendary Creature — Human Bard Sorcerer", "{5}{U}{R}", {"cmc":7,"oracleText":"Once during each of your turns, you may cast an instant or sorcery spell from your hand without paying its mana cost.","power":"5","toughness":"7","keywords":[],"layout":"normal"});
const hideInPlainSig = card("Hide in Plain Sight", "Sorcery", "{3}{G}", {"cmc":4,"oracleText":"Look at the top five cards of your library, cloak two of them, and put the rest on the bottom of your library in a random order. (To cloak a card, put it onto the battlefield face down as a 2/2 creature with ward {2}. Turn it face up any time for its mana cost if it's a creature card.)","keywords":["Cloak"],"layout":"normal"});
const counterpoint = card("Counterpoint", "Instant", "{3}{U}{B}", {"cmc":5,"oracleText":"Counter target spell. You may cast a creature, instant, sorcery, or planeswalker spell from your graveyard with mana value less than or equal to that spell's mana value without paying its mana cost.","keywords":[],"layout":"normal"});
const pumpkinBombs = card("Pumpkin Bombs", "Artifact", "{1}{R}", {"cmc":2,"oracleText":"{T}, Discard two cards: Draw three cards, then put a fuse counter on this artifact. It deals damage equal to the number of fuse counters on it to target opponent. They gain control of this artifact.","keywords":[],"layout":"normal"});
const pirsWhim = card("Pir's Whim", "Sorcery", "{3}{G}", {"cmc":4,"oracleText":"For each player, choose friend or foe. Each friend searches their library for a land card, puts it onto the battlefield tapped, then shuffles. Each foe sacrifices an artifact or enchantment of their choice.","keywords":[],"layout":"normal"});
const virtussManeuve = card("Virtus's Maneuver", "Sorcery", "{2}{B}", {"cmc":3,"oracleText":"For each player, choose friend or foe. Each friend returns a creature card from their graveyard to their hand. Each foe sacrifices a creature of their choice.","keywords":[],"layout":"normal"});
const khorvathsFury = card("Khorvath's Fury", "Sorcery", "{4}{R}", {"cmc":5,"oracleText":"For each player, choose friend or foe. Each friend discards all cards from their hand, then draws that many cards plus one. Khorvath's Fury deals damage to each foe equal to the number of cards in their hand.","keywords":[],"layout":"normal"});

describe("round 218 cards", () => {
  it("compile", () => supported(bleedingEffect, superadaptoid, aberrantMindSo, zimonesExperim, lastLaugh, weftwalking, baneLordOfDark, seizeTheStorm, prizedAmalgam));
  it("compile (2)", () => supported(nyamiclassMoth, zaffaiAndTheTe, hideInPlainSig, counterpoint, pumpkinBombs, pirsWhim, virtussManeuve, khorvathsFury));
});

describe("Bleeding Effect", () => {
  it("gives your creatures the listed keywords creature cards in your graveyard have, as it resolves", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, bleedingEffect);
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    into(s0, ap, bear({ name: "Flying Bear", keywords: ["Flying"], oracleText: "Flying" }), "graveyard");
    into(s0, ap, bear({ name: "Hexproof Bear", keywords: ["Hexproof from"], oracleText: "Hexproof from white" }), "graveyard");
    // Not a creature card, and not in your graveyard: neither counts.
    into(s0, ap, card("Lifelink Thing", "Artifact", "{2}", { keywords: ["Lifelink"], oracleText: "Lifelink" }), "graveyard");
    into(s0, opp, bear({ name: "Their Trampler", keywords: ["Trample"], oracleText: "Trample" }), "graveyard");
    let s = passUntil(s0, "declareAttackers", ap);
    const o = s.objects[mine]!;
    expect(objHasKeyword(s, o, "Flying")).toBe(true);
    expect(objHasKeyword(s, o, "Hexproof from white")).toBe(true);
    expect(objHasKeyword(s, o, "Lifelink")).toBe(false);
    expect(objHasKeyword(s, o, "Trample")).toBe(false);
    expect(objHasKeyword(s, s.objects[theirs]!, "Flying")).toBe(false);
    // Fixed as it resolved (rulings): a creature card put into the graveyard later doesn't add trample.
    into(s, ap, bear({ name: "Late Trampler", keywords: ["Trample"], oracleText: "Trample" }), "graveyard");
    s = act(s, { type: "declareAttackers", player: ap, attacks: [] });
    expect(objHasKeyword(s, s.objects[mine]!, "Trample")).toBe(false);
  });
});

describe("Super-Adaptoid", () => {
  it("gets a counter for each listed keyword the target has and it doesn't", () => {
    const { s: s0, ap, ids, opp } = setup([superadaptoid]);
    const other = putOnBattlefield(s0, opp, bear({ name: "Flying Haste Bear", keywords: ["Flying", "Haste"], oracleText: "Flying, haste" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap, targets: [tgt(other)] });
    const a = ids[0]!;
    expect(zone(s, a)).toBe("battlefield");
    expect(s.objects[a]!.counters.flying).toBe(1);
    expect(s.objects[a]!.counters.haste).toBe(1);
    expect(s.objects[a]!.counters.trample ?? 0).toBe(0);
    // Its power is the number of legendary creatures you control: only itself.
    expect(pt(s, a)).toBe("1/2");
    // Attacking: it already has flying and haste, so no more of those.
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] });
    s = settle(s, { me: ap, targets: [tgt(other)] });
    expect(s.objects[a]!.counters.flying).toBe(1);
    expect(s.objects[a]!.counters.haste).toBe(1);
  });
});

describe("Aberrant Mind Sorcerer", () => {
  it("returns the target instant or sorcery card to your hand on 10-20, or may put it on top on 1-9", () => {
    for (const [roll, may] of [[15, true], [5, true], [5, false]] as const) {
      const { s: s0, ap, ids } = setup([aberrantMindSo]);
      const bolt = into(s0, ap, card("Yard Bolt", "Instant", "{R}", { oracleText: "Yard Bolt deals 3 damage to any target." }), "graveyard");
      rig(s0, 20, [roll]);
      const s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap, targets: [tgt(bolt)], may });
      if (roll >= 10) expect(zone(s, bolt)).toBe("hand");
      else if (may) expect(s.players[ap]!.library[0]).toBe(bolt);
      else expect(zone(s, bolt)).toBe("graveyard");
    }
  });
});

describe("Zimone's Experiment", () => {
  it("puts the revealed land cards onto the battlefield tapped and the creature cards into your hand, the rest on the bottom", () => {
    const { s: s0, ap, ids } = setup([zimonesExperim]);
    const top = [
      into(s0, ap, card("Spare Sorcery", "Sorcery", "{1}", { oracleText: "Draw a card." }), "library"),
      into(s0, ap, bear({ name: "Top Bear" }), "library"),
      into(s0, ap, card("Top Forest", "Basic Land — Forest"), "library"),
      into(s0, ap, bear({ name: "Other Bear" }), "library"),
      into(s0, ap, card("Other Forest", "Basic Land — Forest"), "library"),
    ];
    const [, land, bearCard, , sorcery] = [...top].reverse();
    void land;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
    expect(s.pending?.kind).toBe("searchLibrary");
    if (s.pending?.kind !== "searchLibrary") return;
    expect(s.pending.cards).not.toContain(sorcery);
    expect(s.pending.max).toBe(2);
    const forestId = top[4]!;
    const bearId = top[3]!;
    void bearCard;
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [forestId, bearId] }), { me: ap });
    expect(zone(s, forestId)).toBe("battlefield");
    expect(s.objects[forestId]!.tapped).toBe(true);
    expect(zone(s, bearId)).toBe("hand");
    const lib = s.players[ap]!.library;
    for (const id of [top[0]!, top[1]!, top[2]!]) expect(lib.slice(-3)).toContain(id);
  });
});

describe("Last Laugh", () => {
  it("deals 1 damage to each creature and each player whenever another permanent goes to a graveyard, and is sacrificed with no creatures", () => {
    const { s: s0, ap, opp } = setup([]);
    const laugh = putOnBattlefield(s0, ap, lastLaugh);
    const big = putOnBattlefield(s0, opp, bear({ name: "Big Bear", power: "4", toughness: "4" }));
    const small = putOnBattlefield(s0, ap, bear({ name: "Small Bear", power: "1", toughness: "1" }));
    const art = putOnBattlefield(s0, ap, card("Some Artifact", "Artifact", "{1}"));
    const life = s0.players[opp]!.life;
    moveObject(s0, art, "graveyard");
    // The artifact goes: 1 damage kills Small Bear, whose death deals 1 more.
    let s = settle(s0, { me: ap });
    expect(zone(s, small)).toBe("graveyard");
    expect(s.objects[big]!.damage).toBe(2);
    expect(s.players[opp]!.life).toBe(life - 2);
    expect(zone(s, laugh)).toBe("battlefield");
    // With no creatures on the battlefield, it's sacrificed.
    moveObject(s, big, "exile");
    runStateBasedActions(s);
    s = settle(s, { me: ap });
    expect(zone(s, laugh)).toBe("graveyard");
  });
});

describe("Weftwalking", () => {
  it("lets each player cast their first spell during their own turn without paying its mana cost", () => {
    const { s: s0, ap, ids, opp } = setup([bear({ name: "First Bear", manaCost: "{5}{G}" }), bear({ name: "Second Bear" })]);
    putOnBattlefield(s0, ap, weftwalking);
    const theirs = into(s0, opp, card("Their Bolt", "Instant", "{R}", { oracleText: "Their Bolt deals 3 damage to any target." }), "hand");
    const free = { alt: "payZero" as const };
    // Not the opponent's turn: no free spell for them.
    expect(altCostsFor(s0, opp, s0.objects[theirs]!).some((a) => a.kind === "payZero")).toBe(false);
    expect(altCostsFor(s0, ap, s0.objects[ids[0]!]!).some((a) => a.kind === "payZero")).toBe(true);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, free)), { me: ap });
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.battlefield.filter((id) => s.objects[id]!.tapped).length).toBe(0);
    // The second spell this turn isn't the first.
    expect(castProblem(s, ap, ids[1]!, undefined, undefined, undefined, undefined, undefined, free)).toMatch(/nothing lets you pay \{0\}/);
    // A spell cast before Weftwalking was there still counts as the first one.
    const { s: t0, ap: ap2, ids: ids2 } = setup([bear({ name: "Early Bear" }), bear({ name: "Later Bear" })]);
    let t = settle(run(t0, planCast(t0, ap2, ids2[0]!)), { me: ap2 });
    putOnBattlefield(t, ap2, weftwalking);
    expect(altCostsFor(t, ap2, t.objects[ids2[1]!]!).some((a) => a.kind === "payZero")).toBe(false);
    // On the opponent's own turn, their first spell is free.
    s = passUntil(s, "main1", opp);
    expect(altCostsFor(s, opp, s.objects[theirs]!).some((a) => a.kind === "payZero")).toBe(true);
    void t;
  });
});

describe("Bane, Lord of Darkness", () => {
  it("draws if the target opponent lets you; otherwise you may put a creature card with equal or lesser toughness onto the battlefield", () => {
    for (const draw of [true, false]) {
      const { s: s0, ap, opp } = setup([]);
      putOnBattlefield(s0, ap, baneLordOfDark);
      const dying = putOnBattlefield(s0, ap, bear({ name: "Dying Bear", power: "1", toughness: "3" }));
      emptyHand(s0, ap);
      const fits = into(s0, ap, bear({ name: "Fitting Bear", toughness: "3" }), "hand");
      const tooBig = into(s0, ap, bear({ name: "Tough Bear", toughness: "4" }), "hand");
      moveObject(s0, dying, "graveyard");
      let s = settle(s0, { targets: [ply(opp)], may: draw });
      if (draw) {
        expect(s.players[ap]!.hand.length).toBe(3);
        continue;
      }
      expect(s.pending?.kind).toBe("searchLibrary");
      if (s.pending?.kind !== "searchLibrary") continue;
      expect(s.pending.cards).toEqual([fits]);
      expect(s.pending.cards).not.toContain(tooBig);
      s = settle(act(s, { type: "searchLibrary", player: ap, found: [fits] }), { me: ap });
      expect(zone(s, fits)).toBe("battlefield");
      expect(s.players[ap]!.hand.length).toBe(1);
    }
  });
});

describe("Seize the Storm", () => {
  it("makes an Elemental as big as your instants and sorceries in the graveyard plus your cards with flashback in exile", () => {
    const { s: s0, ap, ids, opp } = setup([seizeTheStorm]);
    into(s0, ap, card("Yard Bolt", "Instant", "{R}", { oracleText: "Yard Bolt deals 3 damage to any target." }), "graveyard");
    into(s0, ap, card("Yard Bear", "Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }), "graveyard");
    into(s0, ap, card("Gone Flashback", "Sorcery", "{R}", { keywords: ["Flashback"], oracleText: "Draw a card.\nFlashback {1}{R}" }), "exile");
    into(s0, ap, card("Gone Plain", "Sorcery", "{R}", { oracleText: "Draw a card." }), "exile");
    into(s0, opp, card("Their Flashback", "Sorcery", "{R}", { keywords: ["Flashback"], oracleText: "Draw a card.\nFlashback {1}{R}" }), "exile");
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
    const token = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Elemental Token")!;
    // Yard Bolt and Seize the Storm itself in the graveyard, Gone Flashback in exile.
    expect(pt(s, token)).toBe("3/3");
    expect(objHasKeyword(s, s.objects[token]!, "Trample")).toBe(true);
  });
});

describe("Prized Amalgam", () => {
  it("returns from your graveyard at the next end step when a creature enters from your graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    const amalgam = into(s0, ap, prizedAmalgam, "graveyard");
    const back = into(s0, ap, bear({ name: "Back Bear" }), "graveyard");
    const theirs = into(s0, opp, bear({ name: "Their Back Bear" }), "graveyard");
    void theirs;
    moveObject(s0, back, "battlefield");
    let s = settle(s0, { me: ap });
    s = settle(s, { me: ap });
    expect(zone(s, amalgam)).toBe("graveyard");
    s = passUntil(s, "end", ap);
    s = settle(s, { me: ap });
    expect(zone(s, amalgam)).toBe("battlefield");
    expect(s.objects[amalgam]!.tapped).toBe(true);
  });
  it("doesn't trigger for a creature cast from your hand or one from another player's graveyard", () => {
    const { s: s0, ap, ids, opp } = setup([bear({ name: "Hand Bear" })]);
    const amalgam = into(s0, ap, prizedAmalgam, "graveyard");
    const theirs = into(s0, opp, bear({ name: "Their Back Bear" }), "graveyard");
    moveObject(s0, theirs, "battlefield", { controller: ap });
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
    s = passUntil(s, "end", ap);
    s = settle(s, { me: ap });
    expect(zone(s, amalgam)).toBe("graveyard");
  });
});

describe("N'Yami-Class Mother Ship", () => {
  for (const [what, top, may, where] of [
    ["a permanent card you choose to put onto the battlefield", card("Top Forest", "Basic Land — Forest"), true, "battlefield"],
    ["a permanent card you don't put onto the battlefield", card("Top Forest", "Basic Land — Forest"), false, "hand"],
    ["a card that isn't a permanent card", card("Top Bolt", "Instant", "{R}", { oracleText: "Top Bolt deals 3 damage to any target." }), true, "hand"],
  ] as const)
    it(`puts ${what} into the right zone after combat damage to a player`, () => {
      const { s: s0, ap, opp } = setup([]);
      const ship = putOnBattlefield(s0, ap, nyamiclassMoth);
      const crew = [0, 1].map((i) => putOnBattlefield(s0, ap, bear({ name: `Crew Bear ${i}` })));
      const id = into(s0, ap, top, "library");
      let s = settle(run(s0, planActivate(s0, ap, ship, 0, undefined, undefined, crew)), { me: ap });
      expect(characteristics(s, s.objects[ship]!).types).toContain("Creature");
      s = passUntil(s, "declareAttackers", ap);
      s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: ship, defender: opp }] });
      s = passUntil(s, "combatDamage", ap);
      s = settle(s, { me: ap, may });
      expect(s.players[opp]!.life).toBe(35);
      expect(zone(s, id)).toBe(where);
    });
});

describe("Zaffai and the Tempests", () => {
  it("lets you cast one instant or sorcery from your hand free during each of your turns, even after other spells", () => {
    const bolt = (n: string) => card(n, "Instant", "{1}{R}", { oracleText: `${n} deals 3 damage to any target.` });
    const { s: s0, ap, ids, opp } = setup([bolt("Paid Bolt"), bolt("Free Bolt"), bolt("Third Bolt"), bear({ name: "Free Bear?" })]);
    putOnBattlefield(s0, ap, zaffaiAndTheTe);
    const free = { alt: "payZero" as const };
    expect(altCostsFor(s0, ap, s0.objects[ids[3]!]!).some((a) => a.kind === "payZero")).toBe(false);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [ply(opp)])), { me: ap });
    expect(altCostsFor(s, ap, s.objects[ids[1]!]!).some((a) => a.kind === "payZero")).toBe(true);
    const untapped = s.battlefield.filter((id) => !s.objects[id]!.tapped).length;
    s = settle(run(s, planCast(s, ap, ids[1]!, [ply(opp)], undefined, "auto", undefined, free)), { me: ap });
    expect(s.battlefield.filter((id) => !s.objects[id]!.tapped).length).toBe(untapped);
    expect(s.players[opp]!.life).toBe(34);
    // Once each turn.
    expect(castProblem(s, ap, ids[2]!, [ply(opp)], undefined, undefined, undefined, undefined, free)).toMatch(/nothing lets you pay \{0\}/);
  });
});

describe("Hide in Plain Sight", () => {
  it("cloaks two of the top five cards and puts the rest on the bottom", () => {
    const { s: s0, ap, ids } = setup([hideInPlainSig]);
    const top = [0, 1, 2, 3, 4].map((i) => into(s0, ap, bear({ name: `Deep Bear ${i}` }), "library"));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
    expect(s.pending?.kind).toBe("searchLibrary");
    if (s.pending?.kind !== "searchLibrary") return;
    expect(s.pending.min).toBe(2);
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [top[0]!, top[4]!] }), { me: ap });
    for (const id of [top[0]!, top[4]!]) {
      expect(zone(s, id)).toBe("battlefield");
      expect(s.objects[id]!.faceDown).toBe("cloak");
      expect(pt(s, id)).toBe("2/2");
      expect(objHasKeyword(s, s.objects[id]!, "Ward")).toBe(true);
    }
    const lib = s.players[ap]!.library;
    for (const id of [top[1]!, top[2]!, top[3]!]) expect(lib.slice(-3)).toContain(id);
  });
});

describe("Counterpoint", () => {
  it("counters the spell, then you may cast a creature, instant, sorcery or planeswalker spell from your graveyard with no greater mana value free", () => {
    const { s: s0, ap, ids, opp } = setup([bear({ name: "Countered Bear", manaCost: "{1}{G}" }), counterpoint]);
    const cheap = into(s0, ap, card("Yard Shock", "Instant", "{R}", { oracleText: "Yard Shock deals 2 damage to any target." }), "graveyard");
    const big = into(s0, ap, card("Yard Blast", "Sorcery", "{2}{R}", { oracleText: "Yard Blast deals 5 damage to any target." }), "graveyard");
    const ench = into(s0, ap, card("Yard Charm", "Enchantment", "{W}", { oracleText: "" }), "graveyard");
    let s = run(s0, planCast(s0, ap, ids[0]!));
    const spell = s.stack[s.stack.length - 1]!.id;
    s = run(s, planCast(s, ap, ids[1]!, [{ kind: "stack", id: spell }]));
    s = settle(s, { me: ap });
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromHand" });
    if (s.pending?.kind !== "chooseOption") return;
    expect(s.pending.options).toContain(cheap);
    expect(s.pending.options).toContain(ids[0]);
    expect(s.pending.options).not.toContain(big);
    expect(s.pending.options).not.toContain(ench);
    s = act(s, { type: "chooseOption", player: ap, choice: cheap });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: cheap });
    s = settle(run(s, planCast(s, ap, cheap, [ply(opp)])), { me: ap });
    expect(s.players[opp]!.life).toBe(38);
    // Not exiled: it goes back to the graveyard.
    expect(zone(s, cheap)).toBe("graveyard");
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });
});

describe("Pumpkin Bombs", () => {
  it("draws three, adds a fuse counter, deals that much damage to the target opponent and gives them control of it", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHand(s0, ap);
    const discards = [0, 1].map((i) => into(s0, ap, bear({ name: `Spare Bear ${i}` }), "hand"));
    const bombs = putOnBattlefield(s0, ap, pumpkinBombs);
    s0.objects[bombs]!.counters.fuse = 2;
    const s = settle(run(s0, planActivate(s0, ap, bombs, 0, [ply(opp)], undefined, undefined, undefined, { discard: discards })), { me: ap });
    expect(discards.every((id) => zone(s, id) === "graveyard")).toBe(true);
    expect(s.players[ap]!.hand.length).toBe(3);
    expect(s.objects[bombs]!.counters.fuse).toBe(3);
    expect(s.players[opp]!.life).toBe(37);
    expect(controllerOf(s, s.objects[bombs]!)).toBe(opp);
  });
});

/** Answers this one's "choose friend or foe" questions: `foes` are foes, everyone else a friend. */
const friendOrFoe = (s: GameState, me: PlayerId, foes: PlayerId[]) => {
  const asked: PlayerId[] = [];
  while (s.pending?.kind === "chooseOption" && s.pending.what === "word" && s.pending.player === me) {
    const of = s.pending.of!;
    asked.push(of);
    s = act(s, { type: "chooseOption", player: me, choice: foes.includes(of) ? "foe" : "friend" });
  }
  return { s, asked };
};

describe("friend or foe", () => {
  it("Pir's Whim: you choose for each player; friends get a tapped land, foes sacrifice an artifact or enchantment", () => {
    const { s: s0, ap, ids, opp } = setup([pirsWhim]);
    const [friend, foe2] = s0.turnOrder.filter((p) => p !== opp && p !== ap);
    const charm = (n: string) => card(n, "Enchantment", "{W}", { oracleText: "" });
    const oppCharm = putOnBattlefield(s0, opp, charm("Foe Charm"));
    const foe2Charm = putOnBattlefield(s0, foe2!, charm("Foe Two Charm"));
    const friendCharm = putOnBattlefield(s0, friend!, charm("Friend Charm"));
    const myCharm = putOnBattlefield(s0, ap, charm("My Charm"));
    const lands = (pid: PlayerId) => s0.battlefield.filter((id) => controllerOf(s0, s0.objects[id]!) === pid && s0.cards[s0.objects[id]!.cardId]!.typeLine.includes("Land")).length;
    const before = { ap: lands(ap), friend: lands(friend!), opp: lands(opp) };
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
    const r = friendOrFoe(s, ap, [opp, foe2!]);
    s = r.s;
    expect(r.asked.sort()).toEqual([...s0.turnOrder].sort());
    s = settle(s, { me: ap });
    expect(s.pending?.kind).toBe("searchLibrary");
    if (s.pending?.kind !== "searchLibrary") return;
    const land = s.pending.cards.find((id) => s.cards[s.objects[id]!.cardId]!.typeLine.includes("Land"))!;
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [land] }), { me: ap });
    expect(zone(s, land)).toBe("battlefield");
    expect(s.objects[land]!.tapped).toBe(true);
    const now = (pid: PlayerId) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && s.cards[s.objects[id]!.cardId]!.typeLine.includes("Land")).length;
    expect(now(ap)).toBe(before.ap + 1);
    expect(now(friend!)).toBe(before.friend + 1);
    expect(now(opp)).toBe(before.opp);
    expect(zone(s, oppCharm)).toBe("graveyard");
    expect(zone(s, foe2Charm)).toBe("graveyard");
    expect(zone(s, friendCharm)).toBe("battlefield");
    expect(zone(s, myCharm)).toBe("battlefield");
  });

  it("Virtus's Maneuver: friends return a creature card from their graveyard, foes sacrifice a creature", () => {
    const { s: s0, ap, ids, opp } = setup([virtussManeuve]);
    const back = into(s0, ap, bear({ name: "Back Bear" }), "graveyard");
    const theirBack = into(s0, opp, bear({ name: "Their Back Bear" }), "graveyard");
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
    s = friendOrFoe(s, ap, [opp]).s;
    s = settle(s, { me: ap });
    // Your only creature card in the graveyard is returned without asking.
    expect(s.pending).toBeFalsy();
    expect(zone(s, back)).toBe("hand");
    expect(zone(s, theirBack)).toBe("graveyard");
    expect(zone(s, mine)).toBe("battlefield");
    expect(zone(s, theirs)).toBe("graveyard");
  });

  it("Khorvath's Fury: friends discard their hands and draw one more; foes take damage equal to their hand size", () => {
    const { s: s0, ap, ids, opp } = setup([khorvathsFury]);
    const others = s0.turnOrder.filter((p) => p !== ap && p !== opp);
    for (const p of [ap, opp, ...others]) emptyHand(s0, p);
    s0.players[ap]!.hand.push(ids[0]!);
    s0.objects[ids[0]!]!.zone = "hand";
    const mine = [0, 1].map((i) => into(s0, ap, bear({ name: `My Bear ${i}` }), "hand"));
    [0, 1, 2, 3].forEach((i) => into(s0, opp, bear({ name: `Their Bear ${i}` }), "hand"));
    into(s0, others[1]!, bear({ name: "Foe Bear" }), "hand");
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
    s = friendOrFoe(s, ap, [opp, others[1]!]).s;
    s = settle(s, { me: ap });
    expect(mine.every((id) => zone(s, id) === "graveyard")).toBe(true);
    expect(s.players[ap]!.hand.length).toBe(3);
    // A friend with no cards draws one (rulings).
    expect(s.players[others[0]!]!.hand.length).toBe(1);
    expect(s.players[opp]!.life).toBe(36);
    expect(s.players[opp]!.hand.length).toBe(4);
    expect(s.players[others[1]!]!.life).toBe(39);
    expect(s.players[ap]!.life).toBe(40);
  });
});
