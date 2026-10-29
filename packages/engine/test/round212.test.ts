// Round 212: manifest-dread Rooms, Triskaidekaphobia, Timber Paladin, Kianne, Eligeth, Revel in Silence, Katara's
// Reversal and others (fresh cards around EDHREC ranks 5,600 to 13,300).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { abilitiesOf, applyAction, botActions, abilityProblem, castProblem, characteristics, compileCard, controllerOf, maxHandSize, objHasKeyword, planActivate, planCast, power, toughness, invalidateCharacteristics, isFullySupported, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const none: TargetChoice = { kind: "none" };
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
const emptyHand = (s: GameState, pid: PlayerId) => {
  for (const id of s.players[pid]!.hand.splice(0)) {
    s.objects[id]!.zone = "library";
    s.players[pid]!.library.push(id);
  }
};
const pt = (s: GameState, id: ObjectId) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;

// Real oracle text (Scryfall).
const underwaterTunnel = scry("split", [{"name": "Underwater Tunnel", "type_line": "Enchantment — Room", "mana_cost": "{U}", "oracle_text": "When you unlock this door, surveil 2. (Look at the top two cards of your library, then put any number of them into your graveyard and the rest on top of your library in any order.)\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)"}, {"name": "Slimy Aquarium", "type_line": "Enchantment — Room", "mana_cost": "{3}{U}", "oracle_text": "When you unlock this door, manifest dread, then put a +1/+1 counter on that creature.\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)"}], { keywords: ["Surveil", "Manifest", "Manifest dread"], color_identity: ["U"] });
const molderingGym = scry("split", [{"name": "Moldering Gym", "type_line": "Enchantment — Room", "mana_cost": "{2}{G}", "oracle_text": "When you unlock this door, search your library for a basic land card, put it onto the battlefield tapped, then shuffle.\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)"}, {"name": "Weight Room", "type_line": "Enchantment — Room", "mana_cost": "{5}{G}", "oracle_text": "When you unlock this door, manifest dread, then put three +1/+1 counters on that creature.\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)"}], { keywords: ["Manifest", "Manifest dread"], color_identity: ["G"] });
const experimentalLab = scry("split", [{"name": "Experimental Lab", "type_line": "Enchantment — Room", "mana_cost": "{3}{G}", "oracle_text": "When you unlock this door, manifest dread, then put two +1/+1 counters and a trample counter on that creature.\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)"}, {"name": "Staff Room", "type_line": "Enchantment — Room", "mana_cost": "{2}{G}", "oracle_text": "Whenever a creature you control deals combat damage to a player, turn that creature face up or put a +1/+1 counter on it.\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)"}], { keywords: ["Manifest", "Manifest dread"], color_identity: ["G"] });

describe("manifest dread, then counters on that creature (Slimy Aquarium, Weight Room, Experimental Lab); Staff Room", () => {
  it("compile", () => supported(underwaterTunnel, molderingGym, experimentalLab));

  const unlock = (room: CardDef, unlocked: number[], door: number, mana: Partial<Record<"C" | "G" | "U", number>>) => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, room);
    s0.objects[r]!.unlocked = unlocked;
    invalidateCharacteristics(s0);
    const top = into(s0, ap, bear({ name: "Top Bear" }), "library");
    const second = into(s0, ap, card("Second Card", "Instant", "{U}"), "library");
    Object.assign(s0.players[ap]!.manaPool, mana);
    let s = act(s0, { type: "unlockDoor", player: ap, objectId: r, door });
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "searchLibrary" });
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [top] }));
    return { s, ap, opp, r, top, second };
  };

  it("Weight Room: the manifested 2/2 gets three +1/+1 counters, the other card goes to the graveyard", () => {
    const { s, top, second } = unlock(molderingGym, [0], 1, { C: 5, G: 1 });
    expect(s.objects[top]!.faceDown).toBe("manifest");
    expect(s.objects[top]!.counters["+1/+1"]).toBe(3);
    expect(pt(s, top)).toBe("5/5");
    expect(zone(s, second)).toBe("graveyard");
  });

  it("Slimy Aquarium: one +1/+1 counter on it", () => {
    const { s, top } = unlock(underwaterTunnel, [0], 1, { C: 3, U: 1 });
    expect(pt(s, top)).toBe("3/3");
  });

  it("Experimental Lab: two +1/+1 counters and a trample counter on it", () => {
    const { s, top } = unlock(experimentalLab, [1], 0, { C: 3, G: 1 });
    expect(pt(s, top)).toBe("4/4");
    expect(objHasKeyword(s, s.objects[top]!, "Trample")).toBe(true);
  });

  const staffRoom = (faceDown: boolean) => {
    const { s: s0, ap, opp } = setup([]);
    const r = putOnBattlefield(s0, ap, experimentalLab);
    s0.objects[r]!.unlocked = [1];
    const c = putOnBattlefield(s0, ap, bear());
    if (faceDown) s0.objects[c]!.faceDown = "manifest";
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: c, defender: opp }] });
    s = settle(passUntil(s, "combatDamage", ap));
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseOption"; i++) s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    return { s, ap, c };
  };

  it("Staff Room: a face-down creature that deals combat damage may be turned face up", () => {
    const { s: s0, ap, c } = staffRoom(true);
    expect(s0.pending).toMatchObject({ kind: "chooseOption", what: "either", labels: ["Turn it face up", "Put a +1/+1 counter on it"] });
    const s = settle(act(s0, { type: "chooseOption", player: ap, choice: "0" }));
    expect(s.objects[c]!.faceDown).toBeUndefined();
    expect(s.objects[c]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("Staff Room: or it gets a +1/+1 counter", () => {
    const { s: s0, ap, c } = staffRoom(false);
    const s = settle(act(s0, { type: "chooseOption", player: ap, choice: "1" }));
    expect(s.objects[c]!.counters["+1/+1"]).toBe(1);
  });
});

const triskaidekaphobia = card("Triskaidekaphobia", "Enchantment", "{3}{B}", {"cmc": 4, "keywords": [], "oracleText": "At the beginning of your upkeep, choose one —\n• Each player with exactly 13 life loses the game, then each player gains 1 life.\n• Each player with exactly 13 life loses the game, then each player loses 1 life.", "colors": ["B"], "colorIdentity": ["B"], "layout": "normal"});
const timberPaladin = card("Timber Paladin", "Artifact Creature — Knight", "{1}{G}", {"cmc": 2, "keywords": [], "oracleText": "As long as this creature is enchanted by exactly one Aura, it has base power and toughness 3/3.\nAs long as this creature is enchanted by exactly two Auras, it has base power and toughness 5/5 and vigilance.\nAs long as this creature is enchanted by three or more Auras, it has base power and toughness 10/10, vigilance, and trample.", "power": "1", "toughness": "1", "colors": ["G"], "colorIdentity": ["G"], "layout": "normal"});
const kianneCorruptedMemory = card("Kianne, Corrupted Memory", "Legendary Creature — Illusion", "{2}{G}{U}", {"cmc": 4, "keywords": [], "oracleText": "As long as Kianne's power is even, you may cast noncreature spells as though they had flash.\nAs long as Kianne's power is odd, you may cast creature spells as though they had flash.\nWhenever you draw a card, put a +1/+1 counter on Kianne.", "power": "2", "toughness": "2", "colors": ["G", "U"], "colorIdentity": ["G", "U"], "layout": "normal"});
const eligethCrossroadsAugur = card("Eligeth, Crossroads Augur", "Legendary Creature — Sphinx", "{4}{U}{U}", {"cmc": 6, "keywords": ["Flying", "Partner"], "oracleText": "Flying\nIf you would scry a number of cards, draw that many cards instead.\nPartner (You can have two commanders if both have partner.)", "power": "5", "toughness": "6", "colors": ["U"], "colorIdentity": ["U"], "layout": "normal"});

describe("each player with exactly 13 life loses the game (Triskaidekaphobia)", () => {
  it("compile", () => supported(triskaidekaphobia));

  const upkeep = (mode: number) => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, triskaidekaphobia);
    for (const p of s0.players) emptyHand(s0, p.id);
    s0.players[opp]!.life = 13;
    let s = passUntil(s0, "upkeep", ap);
    for (let i = 0; i < 20 && s.pending?.kind !== "chooseModes"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "chooseModes" });
    s = settle(act(s, { type: "chooseModes", player: ap, modes: [mode] }));
    return { s, ap, opp };
  };

  it("first mode: the player at 13 loses, then each other player gains 1 life", () => {
    const { s, ap, opp } = upkeep(0);
    expect(s.players[opp]!.lost).toBe(true);
    expect(s.players[ap]!.life).toBe(41);
    expect(s.players.filter((p) => !p.lost && p.id !== ap).every((p) => p.life === 41)).toBe(true);
  });

  it("second mode: the player at 13 loses, then each other player loses 1 life", () => {
    const { s, ap, opp } = upkeep(1);
    expect(s.players[opp]!.lost).toBe(true);
    expect(s.players[ap]!.life).toBe(39);
  });
});

describe("as long as it's enchanted by exactly N Auras (Timber Paladin)", () => {
  it("compile", () => supported(timberPaladin));

  it("1/1, 3/3 with one Aura, 5/5 and vigilance with two, 10/10, vigilance and trample with three", () => {
    const { s, ap } = setup([]);
    const p = putOnBattlefield(s, ap, timberPaladin);
    const aura = card("Test Aura", "Enchantment — Aura", "{W}", { oracleText: "Enchant creature" });
    expect(pt(s, p)).toBe("1/1");
    const expected = [["3/3", false, false], ["5/5", true, false], ["10/10", true, true], ["10/10", true, true]] as const;
    for (const [ptNow, vig, tr] of expected) {
      const a = putOnBattlefield(s, ap, aura);
      s.objects[a]!.attachedTo = p;
      invalidateCharacteristics(s);
      expect(pt(s, p)).toBe(ptNow);
      expect(objHasKeyword(s, s.objects[p]!, "Vigilance")).toBe(vig);
      expect(objHasKeyword(s, s.objects[p]!, "Trample")).toBe(tr);
    }
  });

  it("an Equipment doesn't count", () => {
    const { s, ap } = setup([]);
    const p = putOnBattlefield(s, ap, timberPaladin);
    const e = putOnBattlefield(s, ap, card("Test Gear", "Artifact — Equipment", "{1}", { oracleText: "Equip {1}" }));
    s.objects[e]!.attachedTo = p;
    invalidateCharacteristics(s);
    expect(pt(s, p)).toBe("1/1");
  });
});

describe("flash by the parity of its power (Kianne, Corrupted Memory)", () => {
  it("compile", () => supported(kianneCorruptedMemory));

  it("power 2: noncreature spells as though they had flash, not creature spells; power 3: the other way round", () => {
    const { s: s0, ap } = setup([]);
    const k = putOnBattlefield(s0, ap, kianneCorruptedMemory);
    const sorcery = into(s0, ap, card("Test Sorcery", "Sorcery", "{1}", { oracleText: "Draw a card." }), "hand");
    const creature = into(s0, ap, bear(), "hand");
    const s = passUntil(s0, "beginCombat", ap);
    // The lands it has pay (planCast is null when the spell can't be cast now).
    expect(planCast(s, ap, sorcery, [])).not.toBeNull();
    expect(planCast(s, ap, creature, [])).toBeNull();
    s.objects[k]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s);
    expect(planCast(s, ap, sorcery, [])).toBeNull();
    expect(planCast(s, ap, creature, [])).not.toBeNull();
  });

  it("only its controller's spells", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, kianneCorruptedMemory);
    const sorcery = into(s0, ap, card("Test Sorcery", "Sorcery", "{1}", { oracleText: "Draw a card." }), "hand");
    const s = passUntil(s0, "beginCombat", ap);
    expect(planCast(s, ap, sorcery, [])).toBeNull();
    expect(planCast(s0, ap, sorcery, [])).not.toBeNull();
  });
});

describe("if you would scry, draw that many instead (Eligeth, Crossroads Augur)", () => {
  it("compile", () => supported(eligethCrossroadsAugur));
  const opt = card("Test Scry", "Sorcery", "{U}", { oracleText: "Scry 2." });

  it("scry 2 becomes draw 2: no scry choice, two cards drawn", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, eligethCrossroadsAugur);
    emptyHand(s0, ap);
    const sc = into(s0, ap, opt, "hand");
    const top = s0.players[ap]!.library.slice(0, 2);
    s0.players[ap]!.manaPool.U = 1;
    const s = settle(run(s0, planCast(s0, ap, sc, [])));
    expect(s.pending).toBeNull();
    expect(top.every((id) => zone(s, id) === "hand")).toBe(true);
    expect(s.players[ap]!.hand.length).toBe(2);
  });

  it("an opponent's Eligeth doesn't change your scry", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, opp, eligethCrossroadsAugur);
    const sc = into(s0, ap, opt, "hand");
    s0.players[ap]!.manaPool.U = 1;
    const s = settle(run(s0, planCast(s0, ap, sc, [])));
    expect(s.pending).toMatchObject({ kind: "arrangeTop" });
  });
});

const flamescrollCelebrant = scry("modal_dfc", [{"name": "Flamescroll Celebrant", "type_line": "Creature — Human Shaman", "mana_cost": "{1}{R}", "oracle_text": "Whenever an opponent activates an ability that isn't a mana ability, this creature deals 1 damage to that player.\n{1}{R}: This creature gets +2/+0 until end of turn.", "power": "2", "toughness": "1"}, {"name": "Revel in Silence", "type_line": "Instant", "mana_cost": "{W}{W}", "oracle_text": "Your opponents can't cast spells or activate planeswalkers' loyalty abilities this turn.\nExile Revel in Silence."}], { keywords: [], color_identity: ["R", "W"] });
const katarasReversal = card("Katara's Reversal", "Instant", "{2}{U}{U}", {"cmc": 4, "keywords": [], "oracleText": "Counter up to four target spells and/or abilities.\nUntap up to four target artifacts and/or creatures.", "colors": ["U"], "colorIdentity": ["U"], "layout": "normal"});
const syrGwynHeroOfAshvale = card("Syr Gwyn, Hero of Ashvale", "Legendary Creature — Human Knight", "{3}{R}{W}{B}", {"cmc": 6, "keywords": ["Vigilance", "Menace"], "oracleText": "Vigilance, menace\nWhenever an equipped creature you control attacks, you draw a card and you lose 1 life.\nEquipment you control have equip Knight {0}.", "power": "5", "toughness": "5", "colors": ["B", "R", "W"], "colorIdentity": ["B", "R", "W"], "layout": "normal"});
const jayaBallard = card("Jaya Ballard", "Legendary Planeswalker — Jaya", "{2}{R}{R}{R}", {"cmc": 5, "keywords": [], "oracleText": "+1: Add {R}{R}{R}. Spend this mana only to cast instant or sorcery spells.\n+1: Discard up to three cards, then draw that many cards.\n−8: You get an emblem with \"You may cast instant and sorcery spells from your graveyard. If a spell cast this way would be put into your graveyard, exile it instead.\"", "loyalty": "5", "colors": ["R"], "colorIdentity": ["R"], "layout": "normal"});

describe("your opponents can't cast spells or activate loyalty abilities this turn (Revel in Silence)", () => {
  it("compile", () => supported(flamescrollCelebrant));

  it("cast in an opponent's main phase: that player can't cast a spell or activate a loyalty ability this turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const walker = putOnBattlefield(s0, opp, card("Test Walker", "Legendary Planeswalker — Testa", "{2}", { oracleText: "+1: Draw a card.", loyalty: "3" }));
    s0.objects[walker]!.counters.loyalty = 3;
    const revel = into(s0, ap, flamescrollCelebrant, "hand");
    const instant = into(s0, opp, card("Test Instant", "Instant", "{0}", { oracleText: "Draw a card." }), "hand");
    let s = passUntil(s0, "main1", opp);
    s = act(s, { type: "passPriority", player: opp });
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = settle(run(s, planCast(s, ap, revel, [], undefined, undefined, undefined, { face: 1 })));
    expect(s.activePlayer).toBe(opp);
    expect(s.step).toBe("main1");
    expect(zone(s, revel)).toBe("exile");
    expect(abilityProblem(s, opp, walker, 0)).toMatch(/loyalty abilities/);
    expect(castProblem(s, opp, instant, [])).toMatch(/can't cast/);
    // Its own controller isn't stopped.
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.step).toBe("main1");
    expect(castProblem(s, ap, into(s, ap, card("Mine", "Instant", "{0}", { oracleText: "Draw a card." }), "hand"), [])).toBeNull();
  });
});

describe("counter up to four target spells and/or abilities, untap up to four artifacts and/or creatures (Katara's Reversal)", () => {
  it("compile", () => supported(katarasReversal));

  it("counters a spell and an activated ability, and untaps two of your creatures", () => {
    const { s: s0, ap, opp } = setup([]);
    const kr = into(s0, ap, katarasReversal, "hand");
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, card("Test Rock", "Artifact", "{2}"));
    s0.objects[a]!.tapped = true;
    s0.objects[b]!.tapped = true;
    const pinger = putOnBattlefield(s0, opp, card("Test Pinger", "Artifact", "{1}", { oracleText: "{0}: Each player loses 1 life." }));
    const spell = into(s0, opp, card("Test Draw", "Instant", "{0}", { oracleText: "Draw a card." }), "hand");
    let s = act(s0, { type: "passPriority", player: ap });
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = run(s, planCast(s, opp, spell, []));
    s = run(s, planActivate(s, opp, pinger, 0, []));
    expect(s.stack.length).toBe(2);
    while (waitingOn(s) !== ap) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const [first, second] = s.stack.map((i) => i.id);
    const life = s.players[ap]!.life;
    s = settle(run(s, planCast(s, ap, kr, [{ kind: "stack", id: first! }, { kind: "stack", id: second! }, none, none, tgt(a), tgt(b), none, none])));
    expect(s.stack.length).toBe(0);
    expect(zone(s, spell)).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life);
    expect(s.objects[a]!.tapped).toBe(false);
    expect(s.objects[b]!.tapped).toBe(false);
  });
});

describe("Equipment you control have equip Knight {0} (Syr Gwyn, Hero of Ashvale)", () => {
  it("compile", () => supported(syrGwynHeroOfAshvale));

  it("an Equipment attaches to a Knight for {0}, not to a creature that isn't a Knight", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, syrGwynHeroOfAshvale);
    const knight = putOnBattlefield(s0, ap, card("Test Knight", "Creature — Human Knight", "{W}", { power: "2", toughness: "2" }));
    const other = putOnBattlefield(s0, ap, bear());
    const gear = putOnBattlefield(s0, ap, card("Test Gear", "Artifact — Equipment", "{1}", { oracleText: "Equipped creature gets +1/+1.\nEquip {3}" }));
    invalidateCharacteristics(s0);
    const abs = abilitiesOf(s0, s0.objects[gear]!).activated.findIndex((a) => a.text === "Equip Knight {0}");
    expect(abs).toBeGreaterThan(0);
    expect(abilityProblem(s0, ap, gear, abs, [tgt(other)])).not.toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, gear, abs, [tgt(knight)])));
    expect(s.objects[gear]!.attachedTo).toBe(knight);
    expect(pt(s, knight)).toBe("3/3");
  });
});

describe("Jaya Ballard's emblem: cast instants and sorceries from your graveyard, exiled after", () => {
  it("compile", () => supported(jayaBallard));

  it("−8, then an instant in the graveyard is cast and exiled as it resolves", () => {
    const { s: s0, ap } = setup([]);
    const j = putOnBattlefield(s0, ap, jayaBallard);
    s0.objects[j]!.counters.loyalty = 8;
    const bolt = into(s0, ap, card("Test Bolt", "Instant", "{R}", { oracleText: "Test Bolt deals 3 damage to any target." }), "graveyard");
    let s = settle(run(s0, planActivate(s0, ap, j, 2, [])));
    expect(zone(s, j)).toBe("graveyard");
    s = settle(run(s, planCast(s, ap, bolt, [{ kind: "player", id: 1 as PlayerId }], undefined, undefined, undefined, { via: "permission" })));
    expect(zone(s, bolt)).toBe("exile");
    // A creature card isn't covered.
    const c = into(s, ap, bear(), "graveyard");
    expect(planCast(s, ap, c, [], undefined, undefined, undefined, { via: "permission" })).toBeNull();
  });
});

const theLongReachOfNight = scry("transform", [{"name": "The Long Reach of Night", "type_line": "Enchantment — Saga", "mana_cost": "{3}{B}", "oracle_text": "(As this Saga enters and after your draw step, add a lore counter.)\nI, II — Each opponent sacrifices a creature of their choice unless they discard a card.\nIII — Exile this Saga, then return it to the battlefield transformed under your control."}, {"name": "Animus of Night's Reach", "type_line": "Enchantment Creature — Spirit", "oracle_text": "Menace (This creature can't be blocked except by two or more creatures.)\nWhenever this creature attacks, it gets +X/+0 until end of turn, where X is the number of creature cards in defending player's graveyard.", "power": "0", "toughness": "4"}], { keywords: ["Transform", "Menace"], color_identity: ["B"] });
const moleModule = card("Mole Module", "Artifact — Vehicle", "{5}", {"cmc": 5, "keywords": ["Crew", "Menace", "Mill"], "oracleText": "Menace\nWhenever this Vehicle deals combat damage to a player, mill four cards. You may put a permanent card from among them onto the battlefield.\nCrew 2", "power": "6", "toughness": "6", "colors": [], "colorIdentity": [], "layout": "normal"});
const tenaciousUnderdog = card("Tenacious Underdog", "Creature — Human Warrior", "{1}{B}", {"cmc": 2, "keywords": ["Blitz"], "oracleText": "Blitz—{2}{B}{B}, Pay 2 life. (If you cast this spell for its blitz cost, it gains haste and \"When this creature dies, draw a card.\" Sacrifice it at the beginning of the next end step.)\nYou may cast this card from your graveyard using its blitz ability.", "power": "3", "toughness": "2", "colors": ["B"], "colorIdentity": ["B"], "layout": "normal"});
const sabinMasterMonk = card("Sabin, Master Monk", "Legendary Creature — Human Noble Monk", "{4}{R}", {"cmc": 5, "keywords": ["Blitz", "Double strike"], "oracleText": "Double strike\nBlitz—{2}{R}{R}, Discard a card. (If you cast this spell for its blitz cost, it gains haste and \"When this creature dies, draw a card.\" Sacrifice it at the beginning of the next end step.)\nYou may cast this card from your graveyard using its blitz ability.", "power": "4", "toughness": "3", "colors": ["R"], "colorIdentity": ["R"], "layout": "normal"});
const arterialAlchemy = card("Arterial Alchemy", "Enchantment", "{2}{R}", {"cmc": 3, "keywords": [], "oracleText": "When this enchantment enters, create a Blood token for each opponent you have. (It's an artifact with \"{1}, {T}, Discard a card, Sacrifice this token: Draw a card.\")\nBlood tokens you control are Equipment in addition to their other types and have \"Equipped creature gets +2/+0\" and equip {2}.", "colors": ["R"], "colorIdentity": ["R"], "layout": "normal"});
const armedWithProof = card("Armed with Proof", "Enchantment", "{2}{W}", {"cmc": 3, "keywords": ["Investigate"], "oracleText": "When this enchantment enters, investigate twice. (To investigate, create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")\nClues you control are Equipment in addition to their other types and have \"Equipped creature gets +2/+0\" and equip {2}.", "colors": ["W"], "colorIdentity": ["W"], "layout": "normal"});
const senatorPeacock = card("Senator Peacock", "Legendary Creature — Human Advisor", "{3}{U}{U}", {"cmc": 5, "keywords": [], "oracleText": "Artifacts you control are Clues in addition to their other types and have \"{2}, Sacrifice this artifact: Draw a card.\"\nWhenever you sacrifice a Clue, target creature can't be blocked this turn.", "power": "3", "toughness": "4", "colors": ["U"], "colorIdentity": ["U"], "layout": "normal"});
const danLewis = card("Dan Lewis", "Legendary Creature — Human", "{1}{R}", {"cmc": 2, "keywords": ["Doctor's companion"], "oracleText": "Noncreature, non-Equipment artifacts you control are Equipment in addition to their other types and have \"Equipped creature gets +1/+0\" and equip {1}.\nDoctor's companion (You can have two commanders if the other is the Doctor.)", "power": "2", "toughness": "2", "colors": ["R"], "colorIdentity": ["R"], "layout": "normal"});
const ragostDeftGastronaut = card("Ragost, Deft Gastronaut", "Legendary Creature — Lobster Citizen", "{R}{W}", {"cmc": 2, "keywords": [], "oracleText": "Artifacts you control are Foods in addition to their other types and have \"{2}, {T}, Sacrifice this artifact: You gain 3 life.\"\n{1}, {T}, Sacrifice a Food: Ragost deals 3 damage to each opponent.\nAt the beginning of each end step, if you gained life this turn, untap Ragost.", "power": "2", "toughness": "2", "colors": ["R", "W"], "colorIdentity": ["R", "W"], "layout": "normal"});
const gourmandsTalent = card("Gourmand's Talent", "Enchantment — Class", "{G}", {"cmc": 1, "keywords": [], "oracleText": "(Gain the next level as a sorcery to add its ability.)\nDuring your turn, artifacts you control are Foods in addition to their other types and have \"{2}, {T}, Sacrifice this artifact: You gain 3 life.\"\n{2}{G}: Level 2\nWhenever you gain life for the first time each turn, create a 3/3 green Raccoon creature token.\n{3}{G}: Level 3\nWhenever you gain life for the first time each turn, put a +1/+1 counter on each creature you control.", "colors": ["G"], "colorIdentity": ["G"], "layout": "class"});
const tetzimocPrimalDeath = card("Tetzimoc, Primal Death", "Legendary Creature — Elder Dinosaur", "{4}{B}{B}", {"cmc": 6, "keywords": ["Deathtouch"], "oracleText": "Deathtouch\n{B}, Reveal this card from your hand: Put a prey counter on target creature. Activate only during your turn.\nWhen Tetzimoc enters, destroy each creature your opponents control with a prey counter on it.", "power": "6", "toughness": "6", "colors": ["B"], "colorIdentity": ["B"], "layout": "normal"});
const norinSwiftSurvivalist = card("Norin, Swift Survivalist", "Legendary Creature — Human Coward", "{R}", {"cmc": 1, "keywords": [], "oracleText": "Norin can't block.\nWhenever a creature you control becomes blocked, you may exile it. You may play that card from exile this turn.", "power": "2", "toughness": "1", "colors": ["R"], "colorIdentity": ["R"], "layout": "normal"});
const winterMisanthropicGuide = card("Winter, Misanthropic Guide", "Legendary Creature — Human Warlock", "{1}{B}{R}{G}", {"cmc": 4, "keywords": ["Delirium", "Ward"], "oracleText": "Ward {2}\nAt the beginning of your upkeep, each player draws two cards.\nDelirium — As long as there are four or more card types among cards in your graveyard, each opponent's maximum hand size is equal to seven minus the number of those card types.", "power": "3", "toughness": "4", "colors": ["B", "G", "R"], "colorIdentity": ["B", "G", "R"], "layout": "normal"});

/** Drive the stack until it's empty: `answer` gives the test's own answer, bots answer any other question. */
const drive = (s: GameState, answer?: (s: GameState) => Action | undefined | null) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const pid = waitingOn(s)!;
    const mine = answer?.(s);
    if (mine === null) break;
    if (mine) s = act(s, mine);
    else if (s.pending) s = act(s, botActions(s, pid)[0]!);
    else s = act(s, { type: "passPriority", player: pid });
  }
  return s;
};

describe("each opponent sacrifices a creature unless they discard a card (The Long Reach of Night); Animus of Night's Reach", () => {
  it("compile", () => supported(theLongReachOfNight));

  it("chapter I: an opponent who discards keeps their creature, one with no cards in hand sacrifices", () => {
    const { s: s0, ap } = setup([]);
    const [p1, p2, p3] = s0.players.filter((p) => p.id !== ap).map((p) => p.id);
    const c1 = putOnBattlefield(s0, p1!, bear());
    const c2 = putOnBattlefield(s0, p2!, bear());
    const c3 = putOnBattlefield(s0, p3!, bear());
    emptyHand(s0, p2!);
    const saga = into(s0, ap, theLongReachOfNight, "hand");
    Object.assign(s0.players[ap]!.manaPool, { B: 1, C: 3 });
    const labels: Record<string, string[]> = {};
    const s = drive(run(s0, planCast(s0, ap, saga, [])), (x) => {
      if (x.pending?.kind !== "chooseOption" || x.pending.what !== "punisher") return undefined;
      labels[x.pending.player] = x.pending.labels ?? [];
      // p1 discards, p3 sacrifices.
      const i = x.pending.player === p1 ? 0 : x.pending.labels!.length - 1;
      return { type: "chooseOption", player: x.pending.player, choice: x.pending.options[i]! };
    });
    expect(labels[p1!]).toEqual(["Discard a card", "Sacrifice a creature"]);
    expect(zone(s, c1)).toBe("battlefield");
    expect(s.players[p1!]!.hand.length).toBe(6);
    expect(zone(s, c2)).toBe("graveyard");
    expect(zone(s, c3)).toBe("graveyard");
    expect(s.players[p3!]!.hand.length).toBe(7);
  });

  it("Animus gets +X/+0 as it attacks, X the creature cards in the defending player's graveyard", () => {
    const { s: s0, ap, opp } = setup([]);
    const a = putOnBattlefield(s0, ap, theLongReachOfNight);
    s0.objects[a]!.face = 1;
    invalidateCharacteristics(s0);
    expect(pt(s0, a)).toBe("0/4");
    into(s0, opp, bear(), "graveyard");
    into(s0, opp, bear({ name: "Other Bear" }), "graveyard");
    into(s0, opp, card("Test Instant", "Instant", "{U}"), "graveyard");
    into(s0, ap, bear({ name: "My Bear" }), "graveyard");
    let s = passUntil(s0, "declareAttackers", ap);
    s = drive(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }] }));
    expect(pt(s, a)).toBe("2/4");
  });
});

describe("whenever this Vehicle deals combat damage to a player, mill four and you may put a permanent card from among them onto the battlefield (Mole Module)", () => {
  it("compile", () => supported(moleModule));

  it("crewed, it connects, mills four and puts a land from among them onto the battlefield", () => {
    const { s: s0, ap, opp } = setup([]);
    const m = putOnBattlefield(s0, ap, moleModule);
    const crewer = putOnBattlefield(s0, ap, bear());
    const land = into(s0, ap, card("Test Land", "Land", ""), "library");
    const instant = into(s0, ap, card("Test Instant", "Instant", "{U}"), "library");
    const milled = s0.players[ap]!.library.slice(0, 4);
    expect(milled).toContain(land);
    let s = passUntil(s0, "beginCombat", ap);
    const crew = abilitiesOf(s, s.objects[m]!).activated.findIndex((x) => x.crew === 2);
    s = drive(act(s, { type: "activateAbility", player: ap, objectId: m, index: crew, tapCreatures: [crewer] }));
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: m, defender: opp }] });
    let options: string[] = [];
    s = drive(passUntil(s, "combatDamage", ap), (x) => {
      const p = x.pending;
      if (p?.player !== ap || p.kind === "chooseMay") return p?.kind === "chooseMay" ? { type: "chooseMay", player: ap, yes: true } : undefined;
      if (p.kind === "searchLibrary") {
        options = p.cards;
        return { type: "searchLibrary", player: ap, found: [land] };
      }
      return undefined;
    });
    expect(s.players[opp]!.life).toBe(34);
    expect(options).toContain(land);
    expect(options).not.toContain(instant);
    expect(zone(s, land)).toBe("battlefield");
    expect(zone(s, instant)).toBe("graveyard");
  });
});

describe("blitz from the graveyard with an extra cost (Tenacious Underdog, Sabin, Master Monk)", () => {
  it("compile", () => supported(tenaciousUnderdog, sabinMasterMonk));

  it("Tenacious Underdog: cast from the graveyard for {2}{B}{B} and 2 life, with haste; it can't be cast normally from there", () => {
    const { s: s0, ap } = setup([]);
    const u = into(s0, ap, tenaciousUnderdog, "graveyard");
    Object.assign(s0.players[ap]!.manaPool, { B: 2, C: 2 });
    expect(planCast(s0, ap, u, [], undefined, undefined, undefined, { via: "permission" })).toBeNull();
    const s = drive(run(s0, planCast(s0, ap, u, [], undefined, undefined, undefined, { via: "permission", alt: "blitz" })));
    expect(zone(s, u)).toBe("battlefield");
    expect(s.players[ap]!.life).toBe(38);
    expect(objHasKeyword(s, s.objects[u]!, "Haste")).toBe(true);
  });

  it("Sabin: blitz from hand discards a card as a cost", () => {
    const { s: s0, ap } = setup([]);
    emptyHand(s0, ap);
    const sabin = into(s0, ap, sabinMasterMonk, "hand");
    const other = into(s0, ap, card("Test Card", "Instant", "{U}"), "hand");
    Object.assign(s0.players[ap]!.manaPool, { R: 2, C: 2 });
    const s = drive(run(s0, planCast(s0, ap, sabin, [], undefined, undefined, undefined, { alt: "blitz", discard: [other] } as never)));
    expect(zone(s, sabin)).toBe("battlefield");
    expect(zone(s, other)).toBe("graveyard");
    expect(objHasKeyword(s, s.objects[sabin]!, "Haste")).toBe(true);
  });
});

const tokens = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => s.objects[id]!.controller === pid && s.cards[s.objects[id]!.cardId]!.name === name);
const abilityIndex = (s: GameState, id: ObjectId, text: string) => {
  const i = abilitiesOf(s, s.objects[id]!).activated.findIndex((a) => a.text === text);
  expect(i, text).toBeGreaterThanOrEqual(0);
  return i;
};
const rock = () => card("Test Rock", "Artifact", "{2}");

describe("artifacts of a kind are also Equipment, Clues or Foods (Arterial Alchemy, Armed with Proof, Senator Peacock, Dan Lewis, Ragost, Gourmand's Talent)", () => {
  it("compile", () => supported(arterialAlchemy, armedWithProof, senatorPeacock, danLewis, ragostDeftGastronaut, gourmandsTalent));

  it("Arterial Alchemy: a Blood token for each opponent; each is an Equipment with +2/+0 and equip {2}", () => {
    const { s: s0, ap } = setup([]);
    const aa = into(s0, ap, arterialAlchemy, "hand");
    const b = putOnBattlefield(s0, ap, bear());
    Object.assign(s0.players[ap]!.manaPool, { R: 1, C: 2 });
    let s = drive(run(s0, planCast(s0, ap, aa, [])));
    const blood = tokens(s, ap, "Blood Token");
    expect(blood.length).toBe(3);
    const c = characteristics(s, s.objects[blood[0]!]!);
    expect(c.types).toEqual(["Artifact"]);
    expect(c.subtypes).toEqual(expect.arrayContaining(["Blood", "Equipment"]));
    s.players[ap]!.manaPool.C = 2;
    s = drive(run(s, planActivate(s, ap, blood[0]!, abilityIndex(s, blood[0]!, "Equip {2}"), [tgt(b)])));
    expect(s.objects[blood[0]!]!.attachedTo).toBe(b);
    expect(pt(s, b)).toBe("4/2");
    // Another player's Blood token isn't one of "Blood tokens you control".
    expect(characteristics(s, s.objects[putOnBattlefield(s, 1 as PlayerId, card("Blood Token", "Token Artifact — Blood", ""))]!).subtypes).toEqual(["Blood"]);
  });

  it("Armed with Proof: investigates twice, and the Clues are Equipment that still draw", () => {
    const { s: s0, ap } = setup([]);
    const aw = into(s0, ap, armedWithProof, "hand");
    const b = putOnBattlefield(s0, ap, bear());
    Object.assign(s0.players[ap]!.manaPool, { W: 1, C: 2 });
    let s = drive(run(s0, planCast(s0, ap, aw, [])));
    const clues = tokens(s, ap, "Clue Token");
    expect(clues.length).toBe(2);
    s.players[ap]!.manaPool.C = 2;
    s = drive(run(s, planActivate(s, ap, clues[0]!, abilityIndex(s, clues[0]!, "Equip {2}"), [tgt(b)])));
    expect(pt(s, b)).toBe("4/2");
    const hand = s.players[ap]!.hand.length;
    s.players[ap]!.manaPool.C = 2;
    s = drive(run(s, planActivate(s, ap, clues[1]!, 0, [])));
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
  });

  it("Senator Peacock: an artifact is a Clue with the draw ability; sacrificing it makes a creature unblockable", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, senatorPeacock);
    const r = putOnBattlefield(s0, ap, rock());
    const b = putOnBattlefield(s0, ap, bear());
    expect(characteristics(s0, s0.objects[r]!).subtypes).toEqual(["Clue"]);
    s0.players[ap]!.manaPool.C = 2;
    const hand = s0.players[ap]!.hand.length;
    const s = drive(run(s0, planActivate(s0, ap, r, abilityIndex(s0, r, "{2}, Sacrifice ~: Draw a card."), [])), (x) =>
      x.pending?.kind === "chooseTargets" && x.pending.player === ap ? { type: "chooseTargets", player: ap, targets: [tgt(b)] } : undefined,
    );
    expect(zone(s, r)).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand + 1);
    expect(s.log.some((l) => /can't be blocked/.test(l.text))).toBe(true);
  });

  it("Dan Lewis: a noncreature, non-Equipment artifact becomes an Equipment with +1/+0 and equip {1}; an artifact creature or an Equipment doesn't", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, danLewis);
    const r = putOnBattlefield(s0, ap, rock());
    const golem = putOnBattlefield(s0, ap, card("Test Golem", "Artifact Creature — Golem", "{2}", { power: "2", toughness: "2" }));
    const gear = putOnBattlefield(s0, ap, card("Test Gear", "Artifact — Equipment", "{1}", { oracleText: "Equipped creature gets +1/+1.\nEquip {3}" }));
    const b = putOnBattlefield(s0, ap, bear());
    expect(characteristics(s0, s0.objects[r]!).subtypes).toEqual(["Equipment"]);
    expect(characteristics(s0, s0.objects[golem]!).subtypes).toEqual(["Golem"]);
    expect(abilitiesOf(s0, s0.objects[gear]!).activated.map((a) => a.text)).toEqual(["Equip {3}"]);
    s0.players[ap]!.manaPool.C = 1;
    const s = drive(run(s0, planActivate(s0, ap, r, abilityIndex(s0, r, "Equip {1}"), [tgt(b)])));
    expect(pt(s, b)).toBe("3/2");
  });

  it("Ragost: an artifact is a Food, and it pays Ragost's own 'Sacrifice a Food'", () => {
    const { s: s0, ap } = setup([]);
    const rg = putOnBattlefield(s0, ap, ragostDeftGastronaut);
    const r = putOnBattlefield(s0, ap, rock());
    expect(characteristics(s0, s0.objects[r]!).subtypes).toEqual(["Food"]);
    s0.players[ap]!.manaPool.C = 2;
    let s = drive(run(s0, planActivate(s0, ap, r, abilityIndex(s0, r, "{2}, {T}, Sacrifice ~: You gain 3 life."), [])));
    expect(s.players[ap]!.life).toBe(43);
    const r2 = putOnBattlefield(s, ap, rock());
    s.players[ap]!.manaPool.C = 1;
    s = drive(run(s, planActivate(s, ap, rg, 0, [], undefined, undefined, undefined, { sacrifice: [r2] })));
    expect(zone(s, r2)).toBe("graveyard");
    expect(s.players.filter((p) => p.id !== ap).every((p) => p.life === 37)).toBe(true);
  });

  it("Gourmand's Talent: artifacts are Foods only during your turn", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, gourmandsTalent);
    const r = putOnBattlefield(s0, ap, rock());
    expect(characteristics(s0, s0.objects[r]!).subtypes).toEqual(["Food"]);
    const s = passUntil(s0, "upkeep", opp);
    expect(characteristics(s, s.objects[r]!).subtypes).toEqual([]);
  });
});

describe("reveal this card from your hand: put a prey counter on target creature (Tetzimoc, Primal Death)", () => {
  it("compile", () => supported(tetzimocPrimalDeath));

  it("activated from hand during your turn, then it enters and destroys the opponents' creatures with prey counters", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = into(s0, ap, tetzimocPrimalDeath, "hand");
    const theirs = putOnBattlefield(s0, opp, bear());
    const other = putOnBattlefield(s0, opp, bear({ name: "Other Bear" }));
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const i = abilitiesOf(s0, s0.objects[t]!).activated.findIndex((a) => a.zone === "hand");
    expect(i).toBeGreaterThanOrEqual(0);
    s0.players[ap]!.manaPool.B = 1;
    let s = drive(run(s0, planActivate(s0, ap, t, i, [tgt(theirs)])));
    expect(zone(s, t)).toBe("hand");
    expect(s.objects[theirs]!.counters.prey).toBe(1);
    s.players[ap]!.manaPool.B = 1;
    s = drive(run(s, planActivate(s, ap, t, i, [tgt(mine)])));
    expect(s.objects[mine]!.counters.prey).toBe(1);
    Object.assign(s.players[ap]!.manaPool, { B: 2, C: 4 });
    s = drive(run(s, planCast(s, ap, t, [])));
    expect(zone(s, t)).toBe("battlefield");
    expect(zone(s, theirs)).toBe("graveyard");
    expect(zone(s, other)).toBe("battlefield");
    expect(zone(s, mine)).toBe("battlefield");
  });

  it("only during your turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = into(s0, opp, tetzimocPrimalDeath, "hand");
    putOnBattlefield(s0, ap, bear());
    const i = abilitiesOf(s0, s0.objects[t]!).activated.findIndex((a) => a.zone === "hand");
    s0.priority = opp;
    s0.players[opp]!.manaPool.B = 1;
    expect(abilityProblem(s0, opp, t, i, [tgt(s0.battlefield[s0.battlefield.length - 1]!)])).toMatch(/can't be activated now/);
  });
});

describe("whenever a creature you control becomes blocked, you may exile it and play it this turn (Norin, Swift Survivalist)", () => {
  it("compile", () => supported(norinSwiftSurvivalist));

  it("the blocked creature is exiled and can be cast again from exile in the second main phase", () => {
    const { s: s0, ap, opp } = setup([]);
    const n = putOnBattlefield(s0, ap, norinSwiftSurvivalist);
    const b = putOnBattlefield(s0, ap, bear());
    const blocker = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] });
    const answer = (x: GameState): Action | undefined => {
      const p = x.pending;
      if (p?.kind === "declareBlockers") return { type: "declareBlockers", player: p.player, blocks: p.player === opp ? [{ blocker, attacker: b }] : [] };
      if (p?.kind === "chooseMay" && p.player === ap) return { type: "chooseMay", player: ap, yes: true };
      return undefined;
    };
    for (let i = 0; i < 40 && zone(s, b) === "battlefield"; i++) s = drive(s.pending ? s : act(s, { type: "passPriority", player: waitingOn(s)! }), answer);
    expect(zone(s, b)).toBe("exile");
    s = passUntil(s, "main2", ap);
    s.players[ap]!.manaPool.G = 2;
    s = drive(run(s, planCast(s, ap, b, [])));
    expect(zone(s, b)).toBe("battlefield");
    expect(zone(s, n)).toBe("battlefield");
  });
});

describe("delirium: each opponent's maximum hand size is seven minus the card types in your graveyard (Winter, Misanthropic Guide)", () => {
  it("compile", () => supported(winterMisanthropicGuide));

  it("three types: no change; four: 3; five: 2; never your own", () => {
    const { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, winterMisanthropicGuide);
    into(s, ap, bear(), "graveyard");
    into(s, ap, card("Test Instant", "Instant", "{U}"), "graveyard");
    into(s, ap, card("Test Sorcery", "Sorcery", "{U}"), "graveyard");
    expect(maxHandSize(s, opp)).toBe(7);
    into(s, ap, rock(), "graveyard");
    expect(maxHandSize(s, opp)).toBe(3);
    into(s, ap, card("Test Land", "Land", ""), "graveyard");
    expect(maxHandSize(s, opp)).toBe(2);
    expect(maxHandSize(s, ap)).toBe(7);
    // Cards in an opponent's graveyard don't count.
    const { s: t } = setup([]);
    putOnBattlefield(t, ap, winterMisanthropicGuide);
    for (const d of [bear(), rock(), card("I", "Instant", "{U}"), card("S", "Sorcery", "{U}")]) into(t, opp, d, "graveyard");
    expect(maxHandSize(t, opp)).toBe(7);
  });
});
