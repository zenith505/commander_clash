// Round 225: the unsupported cards no round had written down, from the top of the popularity list. Oko, the Ringleader
// ("If you've committed a crime this turn ... Otherwise"), Garruk Relentless ("When ~ has two or fewer loyalty counters
// on him, transform him"; a back face with no loyalty box, as Arlinn Kord's too), Kytheon, Hero of Akros ("if ~ and at least two other creatures attacked this combat"; its
// back face's "attacks ~ during its controller's next turn if able"), Gideon Jura ("creatures that player controls attack
// ~ if able"), Decree
// of Annihilation ("all cards from all hands"), Parallel Evolution ("its controller creates a token that's a copy of
// that creature"), Sinister Waltz ("Return two of them at random"), Chorale of the Void ("under your control tapped and
// attacking"), Venom, Deadly Devourer ("When you do, ... where X is the exiled card's toughness"), Ingenious Mastery and Devastating Mastery ("an opponent ..." if the alternative cost was paid), Krang, the
// All-Powerful ("If a player drawing a card causes a triggered ability ... to trigger") and Cursed Wombat ("put an
// additional +1/+1 counter on it").

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

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
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const emptyHand = (s: GameState, pid: PlayerId) => s.players[pid]!.hand.splice(0).forEach((id) => (s.objects[id]!.zone = "exile"));
/**
 * Attack with `attacks`; `blocks` decides the blocks; `me`'s trigger targets are answered with `targets`, "what does it
 * attack" with `whom`; other players answer as bots do. Runs until combat is over or `me` has another question.
 */
const attack = (s: GameState, me: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId }[], blocks: { blocker: ObjectId; attacker: ObjectId }[] = [], opts: { targets?: TargetChoice[]; whom?: PlayerId } = {}) => {
  s = act(s, { type: "declareAttackers", player: me, attacks });
  for (let i = 0; i < 160 && s.step !== "main2"; i++) {
    const p = s.pending;
    if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: blocks.filter((b) => s.objects[b.blocker]!.controller === p.player) });
    else if (p && p.player === me && p.kind === "chooseTargets" && opts.targets) s = act(s, { type: "chooseTargets", player: me, targets: opts.targets });
    else if (p && p.player === me && p.kind === "chooseOption" && p.what === "attackWhom" && opts.whom !== undefined) s = act(s, { type: "chooseOption", player: me, choice: String(opts.whom) });
    else if (p && p.player === me) return s;
    else if (p) s = act(s, botActions(s, p.player)[0]!);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const toAttack = (s: GameState, ap: PlayerId) => {
  for (const p of s.players) if (p.id !== ap) emptyHand(s, p.id);
  return passUntil(s, "declareAttackers", ap);
};
const nameNow = (s: GameState, id: ObjectId) => characteristics(s, s.objects[id]!).name;
const tokensOf = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid);

// Real oracle text (Scryfall).
const oko = card("Oko, the Ringleader", "Legendary Planeswalker — Oko", "{2}{G}{U}", {"loyalty": "3", "oracleText": "At the beginning of combat on your turn, Oko becomes a copy of up to one target creature you control until end of turn, except he has hexproof.\n+1: Draw two cards. If you've committed a crime this turn, discard a card. Otherwise, discard two cards.\n−1: Create a 3/3 green Elk creature token.\n−5: For each other nonland permanent you control, create a token that's a copy of that permanent."});
const garruk = scry("transform", [{"name": "Garruk Relentless", "type_line": "Legendary Planeswalker — Garruk", "mana_cost": "{3}{G}", "oracle_text": "When Garruk has two or fewer loyalty counters on him, transform him.\n0: Garruk deals 3 damage to target creature. That creature deals damage equal to its power to him.\n0: Create a 2/2 green Wolf creature token.", "loyalty": "3"}, {"name": "Garruk, the Veil-Cursed", "type_line": "Legendary Planeswalker — Garruk", "oracle_text": "+1: Create a 1/1 black Wolf creature token with deathtouch.\n−1: Sacrifice a creature. If you do, search your library for a creature card, reveal it, put it into your hand, then shuffle.\n−3: Creatures you control gain trample and get +X/+X until end of turn, where X is the number of creature cards in your graveyard.", "color_indicator": ["B", "G"]}], { keywords: ["Transform"] });
const kytheon = scry("transform", [{"name": "Kytheon, Hero of Akros", "type_line": "Legendary Creature — Human Soldier", "mana_cost": "{W}", "oracle_text": "At end of combat, if Kytheon and at least two other creatures attacked this combat, exile Kytheon, then return him to the battlefield transformed under his owner's control.\n{2}{W}: Kytheon gains indestructible until end of turn.", "power": "2", "toughness": "1"}, {"name": "Gideon, Battle-Forged", "type_line": "Legendary Planeswalker — Gideon", "oracle_text": "+2: Up to one target creature an opponent controls attacks Gideon during its controller's next turn if able.\n+1: Until your next turn, target creature gains indestructible. Untap that creature.\n0: Until end of turn, Gideon becomes a 4/4 Human Soldier creature with indestructible that's still a planeswalker. Prevent all damage that would be dealt to him this turn.", "loyalty": "3", "color_indicator": ["W"]}], { keywords: ["Transform"] });
const arlinn = scry("transform", [{"name": "Arlinn Kord", "type_line": "Legendary Planeswalker — Arlinn", "mana_cost": "{2}{R}{G}", "oracle_text": "+1: Until end of turn, up to one target creature gets +2/+2 and gains vigilance and haste.\n0: Create a 2/2 green Wolf creature token. Transform Arlinn Kord.", "loyalty": "3"}, {"name": "Arlinn, Embraced by the Moon", "type_line": "Legendary Planeswalker — Arlinn", "oracle_text": "+1: Creatures you control get +1/+1 and gain trample until end of turn.\n−1: Arlinn deals 3 damage to any target. Transform Arlinn.\n−6: You get an emblem with \"Creatures you control have haste and '{T}: This creature deals damage equal to its power to any target.'\"", "color_indicator": ["G", "R"]}], { keywords: ["Transform"] });
const jura = card("Gideon Jura", "Legendary Planeswalker — Gideon", "{3}{W}{W}", {"loyalty": "6", "oracleText": "+2: During target opponent's next turn, creatures that player controls attack Gideon Jura if able.\n−2: Destroy target tapped creature.\n0: Until end of turn, Gideon Jura becomes a 6/6 Human Soldier creature that's still a planeswalker. Prevent all damage that would be dealt to him this turn."});
const decree = card("Decree of Annihilation", "Sorcery", "{8}{R}{R}", {"keywords": ["Cycling"], "oracleText": "Exile all artifacts, creatures, and lands from the battlefield, all cards from all graveyards, and all cards from all hands.\nCycling {5}{R}{R} ({5}{R}{R}, Discard this card: Draw a card.)\nWhen you cycle this card, destroy all lands."});
const evolution = card("Parallel Evolution", "Sorcery", "{3}{G}{G}", {"keywords": ["Flashback"], "oracleText": "For each creature token on the battlefield, its controller creates a token that's a copy of that creature.\nFlashback {4}{G}{G}{G} (You may cast this card from your graveyard for its flashback cost. Then exile it.)"});
const waltz = card("Sinister Waltz", "Sorcery", "{3}{B}{R}", {"oracleText": "Choose three target creature cards in your graveyard. Return two of them at random to the battlefield and put the other on the bottom of your library."});
const chorale = card("Chorale of the Void", "Enchantment — Aura", "{3}{B}", {"keywords": ["Enchant", "Void"], "oracleText": "Enchant creature you control\nWhenever enchanted creature attacks, put target creature card from defending player's graveyard onto the battlefield under your control tapped and attacking.\nVoid — At the beginning of your end step, sacrifice this Aura unless a nonland permanent left the battlefield this turn or a spell was warped this turn."});
const venom = card("Venom, Deadly Devourer", "Legendary Creature — Symbiote Villain", "{2}{B}{G}", {"power": "4", "toughness": "4", "keywords": ["Vigilance", "Menace"], "oracleText": "Vigilance, menace\n{3}: Exile target creature card from a graveyard. When you do, put X +1/+1 counters on target Symbiote, where X is the exiled card's toughness."});
const ingenious = card("Ingenious Mastery", "Sorcery", "{X}{2}{U}", {"keywords": ["Treasure", "Scry"], "oracleText": "You may pay {2}{U} rather than pay this spell's mana cost.\nIf the {2}{U} cost was paid, you draw three cards, then an opponent creates two Treasure tokens and they scry 2. If that cost wasn't paid, you draw X cards."});
const devastating = card("Devastating Mastery", "Sorcery", "{2}{W}{W}{W}{W}", {"oracleText": "You may pay {2}{W}{W} rather than pay this spell's mana cost.\nIf the {2}{W}{W} cost was paid, an opponent chooses up to two nonland permanents they control and returns them to their owner's hand.\nDestroy all nonland permanents."});
const krang = card("Krang, the All-Powerful", "Legendary Artifact Creature — Utrom Robot", "{4}{U}", {"power": "3", "toughness": "3", "oracleText": "If a player drawing a card causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.\nWhenever a player draws their second card each turn, put a +1/+1 counter on Krang."});
const wombat = card("Cursed Wombat", "Creature — Nightmare Wombat", "{B}{G}", {"power": "2", "toughness": "3", "keywords": ["Adapt"], "oracleText": "{2}{B}{G}: Adapt 2. (If this creature has no +1/+1 counters on it, put two +1/+1 counters on it.)\nPermanents you control have \"Whenever one or more +1/+1 counters are put on this permanent, put an additional +1/+1 counter on it. This ability triggers only once each turn.\""});

describe("round 225", () => {
  it("parse", () => supported(oko, garruk, arlinn, kytheon, jura, decree, evolution, waltz, chorale, venom, ingenious, devastating, krang, wombat));

  it("Oko, the Ringleader: +1 draws two, then discards one after a crime this turn, two otherwise", () => {
    for (const crime of [false, true]) {
      const { s: s0, ap } = setup([]);
      const before = s0.players[ap]!.hand.length;
      const o = putOnBattlefield(s0, ap, oko);
      s0.objects[o]!.counters.loyalty = 3;
      if (crime) s0.players[ap]!.crimeTurn = s0.turn;
      let s = settle(run(s0, planActivate(s0, ap, o, 0)), { me: ap });
      expect(s.pending?.kind).toBe("discard");
      if (s.pending?.kind !== "discard") return;
      expect(s.pending.count).toBe(crime ? 1 : 2);
      s = act(s, { type: "discard", player: ap, objectIds: s.players[ap]!.hand.slice(0, s.pending.count) });
      expect(s.players[ap]!.hand).toHaveLength(before + 2 - (crime ? 1 : 2));
      expect(s.objects[o]!.counters.loyalty).toBe(4);
    }
  });

  it("Garruk Relentless: at two or fewer loyalty counters he transforms, and no loyalty ability again this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, garruk);
    s0.objects[g]!.counters.loyalty = 3;
    const b = putOnBattlefield(s0, opp, bear());
    let s = settle(run(s0, planActivate(s0, ap, g, 0, [tgt(b)])), { me: ap });
    expect(zone(s, b)).toBe("graveyard");
    // The Bear dealt 2 damage back: one loyalty counter left, so the state trigger transformed him (CR 603.8).
    expect(s.objects[g]!.counters.loyalty).toBe(1);
    expect(nameNow(s, g)).toBe("Garruk, the Veil-Cursed");
    // The same permanent: its one loyalty ability this turn is used (rulings).
    expect(planActivate(s, ap, g, 0)).toBeNull();
  });

  it("Garruk Relentless: with three or more loyalty counters he stays as he is", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, garruk);
    s0.objects[g]!.counters.loyalty = 3;
    const b = putOnBattlefield(s0, opp, card("Test Mite", "Creature — Insect", "{1}", { power: "0", toughness: "1" }));
    const s = settle(run(s0, planActivate(s0, ap, g, 0, [tgt(b)])), { me: ap });
    expect(s.objects[g]!.counters.loyalty).toBe(3);
    expect(nameNow(s, g)).toBe("Garruk Relentless");
  });

  it("Arlinn Kord: 0 makes a Wolf and transforms her, loyalty unchanged; her back face's −1 deals 3 and transforms her back", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, arlinn);
    s0.objects[a]!.counters.loyalty = 3;
    let s = settle(run(s0, planActivate(s0, ap, a, 1)), { me: ap });
    expect(tokensOf(s, ap).map((id) => nameNow(s, id))).toEqual(["Wolf Token"]);
    // A back face with no loyalty box keeps the counters she has (rulings, CR 712.18).
    expect(nameNow(s, a)).toBe("Arlinn, Embraced by the Moon");
    expect(s.objects[a]!.counters.loyalty).toBe(3);
    expect(planActivate(s, ap, a, 1, [{ kind: "player", id: opp }])).toBeNull(); // one loyalty ability a turn (rulings)
    s = passUntil(passUntil(s, "end", ap), "main1", ap);
    const life = s.players[opp]!.life;
    s = settle(run(s, planActivate(s, ap, a, 1, [{ kind: "player", id: opp }])), { me: ap });
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(nameNow(s, a)).toBe("Arlinn Kord");
    expect(s.objects[a]!.counters.loyalty).toBe(2);
  });

  it("Kytheon: attacking with two other creatures, he returns transformed at end of combat; with one, he doesn't", () => {
    for (const others of [2, 1]) {
      const { s: s0, ap, opp } = setup([]);
      const k = putOnBattlefield(s0, ap, kytheon);
      const bears = Array.from({ length: others }, (_, i) => putOnBattlefield(s0, ap, bear({ name: `Bear ${i}` })));
      let s = toAttack(s0, ap);
      s = attack(s, ap, [k, ...bears].map((attacker) => ({ attacker, defender: opp })));
      s = settle(s, { me: ap });
      if (others === 2) {
        // A new object (CR 400.7), the planeswalker face up, with its loyalty (rulings).
        const gideon = s.battlefield.find((id) => nameNow(s, id) === "Gideon, Battle-Forged");
        expect(gideon).toBeDefined();
        expect(s.objects[gideon!]!.counters.loyalty).toBe(3);
      } else {
        expect(nameNow(s, k)).toBe("Kytheon, Hero of Akros");
        expect(zone(s, k)).toBe("battlefield");
      }
    }
  });

  it("Kytheon: a creature that attacked and died before end of combat still counts (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kytheon);
    const b1 = putOnBattlefield(s0, ap, bear({ name: "Bear 1" }));
    const b2 = putOnBattlefield(s0, ap, bear({ name: "Bear 2" }));
    const wall = putOnBattlefield(s0, opp, card("Test Spiked Wall", "Creature — Wall", "{3}", { power: "3", toughness: "5", keywords: ["Defender"], oracleText: "Defender" }));
    let s = toAttack(s0, ap);
    s = attack(s, ap, [k, b1, b2].map((attacker) => ({ attacker, defender: opp })), [{ blocker: wall, attacker: b1 }]);
    s = settle(s, { me: ap });
    expect(zone(s, b1)).toBe("graveyard");
    expect(s.battlefield.some((id) => nameNow(s, id) === "Gideon, Battle-Forged")).toBe(true);
  });

  it("Gideon, Battle-Forged: +2, the target creature attacks him during its controller's next turn if able; others needn't", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kytheon);
    const bears = [0, 1].map((i) => putOnBattlefield(s0, ap, bear({ name: `Bear ${i}` })));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const other = putOnBattlefield(s0, opp, bear({ name: "Other Bear" }));
    let s = toAttack(s0, ap);
    s = settle(attack(s, ap, [k, ...bears].map((attacker) => ({ attacker, defender: opp }))), { me: ap });
    const g = s.battlefield.find((id) => nameNow(s, id) === "Gideon, Battle-Forged")!;
    expect(g).toBeDefined();
    s = settle(run(s, planActivate(s, ap, g, 0, [{ kind: "object", id: theirs }])), { me: ap });
    expect(s.objects[g]!.counters.loyalty).toBe(5);
    s = passUntil(s, "declareAttackers", opp);
    expect(s.pending?.kind).toBe("declareAttackers");
    const at = (id: ObjectId, pw?: ObjectId) => ({ attacker: id, defender: ap, ...(pw ? { planeswalker: pw } : {}) });
    expect(() => applyAction(s, { type: "declareAttackers", player: opp, attacks: [] })).toThrow(/Their Bear must attack Gideon, Battle-Forged if able/);
    expect(() => applyAction(s, { type: "declareAttackers", player: opp, attacks: [at(theirs)] })).toThrow(/must attack Gideon, Battle-Forged/);
    expect(() => applyAction(s, { type: "declareAttackers", player: opp, attacks: [at(theirs, g)] })).not.toThrow();
    const bot = botActions(s, opp).find((a) => a.type === "declareAttackers");
    expect(bot?.type === "declareAttackers" && bot.attacks.find((a) => a.attacker === theirs)?.planeswalker).toBe(g);
    expect(bot?.type === "declareAttackers" && bot.attacks.some((a) => a.attacker === other && a.planeswalker === g)).toBe(false);
  });

  it("Gideon, Battle-Forged: gone before that turn, the creature may attack anyone or not at all (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const k = putOnBattlefield(s0, ap, kytheon);
    const bears = [0, 1].map((i) => putOnBattlefield(s0, ap, bear({ name: `Bear ${i}` })));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    let s = toAttack(s0, ap);
    s = settle(attack(s, ap, [k, ...bears].map((attacker) => ({ attacker, defender: opp }))), { me: ap });
    const g = s.battlefield.find((id) => nameNow(s, id) === "Gideon, Battle-Forged")!;
    s = settle(run(s, planActivate(s, ap, g, 0, [{ kind: "object", id: theirs }])), { me: ap });
    s.objects[g]!.counters.loyalty = 0; // dies to state-based actions (CR 704.5i)
    s = passUntil(s, "declareAttackers", opp);
    expect(zone(s, g)).toBe("graveyard");
    expect(() => applyAction(s, { type: "declareAttackers", player: opp, attacks: [] })).not.toThrow();
  });

  it("Gideon Jura: +2, during that opponent's next turn every creature they control attacks him if able, one gained later too (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, jura);
    s0.objects[g]!.counters.loyalty = 6;
    const b1 = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    let s = settle(run(s0, planActivate(s0, ap, g, 0, [{ kind: "player", id: opp }])), { me: ap });
    expect(s.objects[g]!.counters.loyalty).toBe(8);
    const b2 = putOnBattlefield(s, opp, bear({ name: "Later Bear" }));
    s = passUntil(s, "declareAttackers", opp);
    expect(s.pending?.kind).toBe("declareAttackers");
    const at = (id: ObjectId, pw?: ObjectId) => ({ attacker: id, defender: ap, ...(pw ? { planeswalker: pw } : {}) });
    expect(() => applyAction(s, { type: "declareAttackers", player: opp, attacks: [at(b1, g)] })).toThrow(/Later Bear must attack Gideon Jura if able/);
    expect(() => applyAction(s, { type: "declareAttackers", player: opp, attacks: [at(b1, g), at(b2)] })).toThrow(/must attack Gideon Jura/);
    expect(() => applyAction(s, { type: "declareAttackers", player: opp, attacks: [at(b1, g), at(b2, g)] })).not.toThrow();
    const bot = botActions(s, opp).find((a) => a.type === "declareAttackers");
    expect(bot?.type === "declareAttackers" && bot.attacks.map((a) => a.planeswalker)).toEqual([g, g]);
  });

  it("Gideon Jura: a tapped creature doesn't have to attack, and the turn after it's over (rulings)", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, jura);
    s0.objects[g]!.counters.loyalty = 6;
    const b1 = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    let s = settle(run(s0, planActivate(s0, ap, g, 0, [{ kind: "player", id: opp }])), { me: ap });
    s = passUntil(s, "declareAttackers", opp);
    const tapped = structuredClone(s);
    tapped.objects[b1]!.tapped = true;
    expect(() => applyAction(tapped, { type: "declareAttackers", player: opp, attacks: [] })).not.toThrow();
    s = act(s, { type: "declareAttackers", player: opp, attacks: [{ attacker: b1, defender: ap, planeswalker: g }] });
    s = passUntil(passUntil(s, "main2", opp), "declareAttackers", opp);
    expect(s.turn).toBeGreaterThan(5);
    expect(() => applyAction(s, { type: "declareAttackers", player: opp, attacks: [] })).not.toThrow();
  });

  it("Decree of Annihilation: exiles artifacts, creatures, lands, every graveyard and every hand", () => {
    const { s: s0, ap, opp, ids } = setup([decree]);
    const theirBear = putOnBattlefield(s0, opp, bear());
    const relic = putOnBattlefield(s0, opp, card("Test Relic", "Artifact", "{1}"));
    const aura = putOnBattlefield(s0, opp, card("Test Anthem", "Enchantment", "{2}", { oracleText: "Creatures you control get +1/+1." }));
    const theirCard = into(s0, opp, bear({ name: "Hand Bear" }), "hand");
    const yard = into(s0, opp, bear({ name: "Yard Bear" }), "graveyard");
    const mine = into(s0, ap, bear({ name: "My Hand Bear" }), "hand");
    const myLand = s0.battlefield.find((id) => s0.objects[id]!.controller === ap)!;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
    for (const id of [theirBear, relic, theirCard, yard, mine, myLand]) expect(zone(s, id), id).toBe("exile");
    expect(zone(s, aura)).toBe("battlefield");
    expect(s.turnOrder.every((p) => s.players[p]!.hand.length === 0)).toBe(true);
    // The spell itself goes to the graveyard after it resolves (CR 608.2n).
    expect(zone(s, ids[0]!)).toBe("graveyard");
  });

  it("Parallel Evolution: each creature token's controller creates a copy of it", () => {
    const { s: s0, ap, opp, ids } = setup([evolution]);
    const mine = putOnBattlefield(s0, ap, bear({ name: "Bear Token" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Token" }));
    s0.objects[mine]!.isToken = true;
    s0.objects[theirs]!.isToken = true;
    const real = putOnBattlefield(s0, opp, bear({ name: "Real Bear" }));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
    expect(tokensOf(s, ap).map((id) => nameNow(s, id)).sort()).toEqual(["Bear Token", "Bear Token"]);
    expect(tokensOf(s, opp).map((id) => nameNow(s, id)).sort()).toEqual(["Their Token", "Their Token"]);
    expect(s.battlefield.filter((id) => nameNow(s, id) === "Real Bear")).toEqual([real]);
  });

  it("Sinister Waltz: two of the three targets at random onto the battlefield, the other on the bottom of the library", () => {
    const { s: s0, ap, ids } = setup([waltz]);
    const cards = ["A Bear", "B Bear", "C Bear"].map((name) => into(s0, ap, bear({ name }), "graveyard"));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, cards.map(tgt))), { me: ap });
    expect(cards.filter((id) => zone(s, id) === "battlefield")).toHaveLength(2);
    const bottom = cards.filter((id) => zone(s, id) === "library");
    expect(bottom).toHaveLength(1);
    expect(s.players[ap]!.library.at(-1)).toBe(bottom[0]);
  });

  it("Sinister Waltz: with only two targets still legal, both return (rulings)", () => {
    const { s: s0, ap, ids } = setup([waltz]);
    const cards = ["A Bear", "B Bear", "C Bear"].map((name) => into(s0, ap, bear({ name }), "graveyard"));
    let s = run(s0, planCast(s0, ap, ids[0]!, cards.map(tgt)));
    // One of them leaves the graveyard in response.
    s.players[ap]!.graveyard.splice(s.players[ap]!.graveyard.indexOf(cards[0]!), 1);
    s.objects[cards[0]!]!.zone = "exile";
    s.objects[cards[0]!]!.zoneChanges = (s.objects[cards[0]!]!.zoneChanges ?? 0) + 1;
    s.players[ap]!.exile.push(cards[0]!);
    s = settle(s, { me: ap });
    expect(zone(s, cards[1]!)).toBe("battlefield");
    expect(zone(s, cards[2]!)).toBe("battlefield");
  });

  it("Chorale of the Void: a creature card from the defending player's graveyard enters under your control tapped and attacking", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bear());
    const aura = putOnBattlefield(s0, ap, chorale);
    s0.objects[aura]!.attachedTo = b;
    const dead = into(s0, opp, card("Test Ogre", "Creature — Ogre", "{3}", { power: "3", toughness: "3" }), "graveyard");
    invalidateCharacteristics(s0);
    let s = toAttack(s0, ap);
    s = attack(s, ap, [{ attacker: b, defender: opp }], [], { targets: [tgt(dead)], whom: opp });
    expect(zone(s, dead)).toBe("battlefield");
    expect(s.objects[dead]!.controller).toBe(ap);
    expect(s.objects[dead]!.tapped).toBe(true);
    // It attacked too: 2 from the Bear and 3 from the Ogre.
    expect(s.players[opp]!.life).toBe(35);
  });

  it("Venom: exiling a creature card puts X +1/+1 counters on target Symbiote, X its toughness", () => {
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, ap, venom);
    const dead = into(s0, opp, card("Test Wall", "Creature — Wall", "{2}", { power: "0", toughness: "5" }), "graveyard");
    s0.players[ap]!.manaPool.C = 3;
    let s = run(s0, planActivate(s0, ap, v, 0, [tgt(dead)]));
    s = settle(s, { me: ap, targets: [tgt(v)] });
    expect(zone(s, dead)).toBe("exile");
    expect(s.objects[v]!.counters["+1/+1"]).toBe(5);
  });

  it("Ingenious Mastery: for {2}{U} you draw three, then an opponent creates two Treasures and scries 2; otherwise X cards", () => {
    for (const alt of [true, false]) {
      const { s: s0, ap, opp, ids } = setup([ingenious]);
      emptyHand(s0, ap);
      s0.players[ap]!.hand.push(ids[0]!);
      s0.objects[ids[0]!]!.zone = "hand";
      let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, alt ? undefined : 2, alt ? { alt: "alternative" } : undefined));
      for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
        const p = s.pending;
        if (p?.kind === "chooseOption" && p.what === "opponent") s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
        else if (p && p.player !== ap) s = act(s, botActions(s, p.player)[0]!);
        else if (p) throw new Error(`unexpected ${p.kind}`);
        else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
      expect(s.players[ap]!.hand).toHaveLength(alt ? 3 : 2);
      expect(tokensOf(s, opp).map((id) => nameNow(s, id))).toEqual(alt ? ["Treasure Token", "Treasure Token"] : []);
    }
  });

  it("Devastating Mastery: for {2}{W}{W} an opponent returns up to two nonland permanents first; then all nonland permanents are destroyed", () => {
    for (const alt of [true, false]) {
      const { s: s0, ap, opp, ids } = setup([devastating]);
      const bs = ["A Bear", "B Bear", "C Bear"].map((name) => putOnBattlefield(s0, opp, bear({ name })));
      const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
      s0.players[ap]!.manaPool.W = 4;
      s0.players[ap]!.manaPool.C = 2;
      let s = run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, undefined, undefined, alt ? { alt: "alternative" } : undefined));
      for (let i = 0; i < 100 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
        const p = s.pending;
        if (p?.kind === "chooseOption" && p.what === "opponent") s = act(s, { type: "chooseOption", player: ap, choice: String(opp) });
        else if (p?.kind === "pickPermanents" && p.player === opp) s = act(s, { type: "pickPermanents", player: opp, ids: [bs[0]!, bs[1]!] });
        else if (p) throw new Error(`unexpected ${p.kind}`);
        else s = act(s, { type: "passPriority", player: waitingOn(s)! });
      }
      expect(bs.map((id) => zone(s, id))).toEqual(alt ? ["hand", "hand", "graveyard"] : ["graveyard", "graveyard", "graveyard"]);
      expect(zone(s, mine)).toBe("graveyard");
    }
  });

  it("Krang: a player drawing a card makes your permanents' draw triggers trigger an additional time", () => {
    const watcher = card("Test Watcher", "Enchantment", "{1}", { oracleText: "Whenever a player draws a card, you gain 1 life." });
    for (const withKrang of [true, false]) {
      const { s: s0, ap, ids } = setup([card("Test Divination", "Sorcery", "{U}", { oracleText: "Draw two cards." })]);
      putOnBattlefield(s0, ap, watcher);
      const k = withKrang ? putOnBattlefield(s0, ap, krang) : undefined;
      const s = settle(run(s0, planCast(s0, ap, ids[0]!)), { me: ap });
      expect(s.players[ap]!.life).toBe(40 + (withKrang ? 4 : 2));
      // Its own "second card each turn" trigger is caused by a draw too.
      if (k) expect(s.objects[k]!.counters["+1/+1"]).toBe(2);
    }
  });

  it("Cursed Wombat: the first time +1/+1 counters are put on a permanent you control each turn, one more", () => {
    const { s: s0, ap } = setup([]);
    const w = putOnBattlefield(s0, ap, wombat);
    const b = putOnBattlefield(s0, ap, bear());
    s0.players[ap]!.manaPool.B = 1;
    s0.players[ap]!.manaPool.G = 1;
    s0.players[ap]!.manaPool.C = 2;
    let s = settle(run(s0, planActivate(s0, ap, w, 0)), { me: ap });
    expect(s.objects[w]!.counters["+1/+1"]).toBe(3);
    const grow = card("Test Growth", "Instant", "{G}", { oracleText: "Put a +1/+1 counter on target creature." });
    for (let i = 0; i < 2; i++) {
      const g = into(s, ap, grow, "hand");
      s.players[ap]!.manaPool.G = 1;
      s = settle(run(s, planCast(s, ap, g, [tgt(b)])), { me: ap });
    }
    // 1 + 1 the first time, then only 1 (once each turn).
    expect(s.objects[b]!.counters["+1/+1"]).toBe(3);
  });
});
