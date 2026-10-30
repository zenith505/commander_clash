// Round 218: Bleeding Effect, Super-Adaptoid, Aberrant Mind Sorcerer, Zimone's Experiment, Last Laugh, Weftwalking, Bane,
// Lord of Darkness, Seize the Storm, Prized Amalgam (the "next fresh candidates" after round 217) and fresh cards from
// EDHREC rank 6,000 on.

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { nextRandom } from "../src/rng";
import { moveObject } from "../src/game";
import { altCostsFor, applyAction, botActions, castProblem, invalidateCharacteristics, isFullySupported, objHasKeyword, planCast, power, runStateBasedActions, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

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

describe("round 218 cards", () => {
  it("compile", () => supported(bleedingEffect, superadaptoid, aberrantMindSo, zimonesExperim, lastLaugh, weftwalking, baneLordOfDark, seizeTheStorm, prizedAmalgam));
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
