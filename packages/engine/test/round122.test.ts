// Round 122: round 121's gaps (bots foraging for mana, tokens entering attacking, damage redirected to a creature),
// then the most played cards.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, mountain, passUntil, putOnBattlefield, scry, setup } from "./helpers";
import { altCostsFor, botActions, castProblem, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";
import { characteristics, invalidateCharacteristics } from "../src/layers";
import { loseLife, moveObject, topVisible } from "../src/game";
import { proliferate } from "../src/effects/run-permanents";
import { nextRandom } from "../src/rng";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const settle = (s: GameState, yes = true) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes });
    else if (p) s = botActions(s, p.player).reduce((x, a) => act(x, a), s);
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};

// Real oracle text (Scryfall).
const bolt = card("Lightning Bolt", "Instant", "{R}", { oracleText: "Lightning Bolt deals 3 damage to any target." });
const pariah = card("Pariah", "Enchantment — Aura", "{2}{W}", { oracleText: "Enchant creature\nAll damage that would be dealt to you is dealt to enchanted creature instead." });
const giant = card("Palisade Giant", "Creature — Giant Soldier", "{4}{W}{W}", { power: "2", toughness: "7", oracleText: "All damage that would be dealt to you and other permanents you control is dealt to this creature instead." });
const adamantoise = card("Ancient Adamantoise", "Creature — Turtle", "{5}{G}{G}{G}", { power: "8", toughness: "20", keywords: ["Vigilance", "Ward"], oracleText: "Vigilance, ward {3}\nDamage isn't removed from this creature during cleanup steps.\nAll damage that would be dealt to you and other permanents you control is dealt to this creature instead.\nWhen this creature dies, exile it and create ten tapped Treasure tokens." });
const martyrs = card("Martyrs of Korlis", "Creature — Human", "{3}{W}{W}", { power: "1", toughness: "6", oracleText: "As long as this creature is untapped, all damage that would be dealt to you by artifacts is dealt to this creature instead." });
const rodCard = card("Rod of Ruin", "Artifact", "{4}", { oracleText: "{3}, {T}: Rod of Ruin deals 1 damage to any target." });
const shield = card("Pariah's Shield", "Artifact — Equipment", "{5}", { oracleText: "All damage that would be dealt to you is dealt to equipped creature instead.\nEquip {3}" });

describe("damage dealt to you is dealt to a creature instead (CR 614.9)", () => {
  it("Pariah: Lightning Bolt at its controller is dealt to the enchanted creature, an opponent's here", () => {
    supported(pariah, giant, adamantoise, martyrs, shield);
    const { s: s0, ap, ids, opp } = setup([bolt]);
    const theirs = putOnBattlefield(s0, ap, bear());
    const p = putOnBattlefield(s0, opp, pariah);
    s0.objects[p]!.attachedTo = theirs;
    invalidateCharacteristics(s0);
    const life = s0.players[opp]!.life;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life);
    expect(s.objects[theirs]!.zone).toBe("graveyard"); // 3 damage to a 2/2
  });

  it("Palisade Giant: damage to you and your other creatures is dealt to it; still combat damage", () => {
    const { s: s0, ap, opp } = setup([]);
    const att = putOnBattlefield(s0, ap, bear({ power: "3", toughness: "3" }));
    const g = putOnBattlefield(s0, opp, giant);
    const mine = putOnBattlefield(s0, opp, bear());
    invalidateCharacteristics(s0);
    const life = s0.players[opp]!.life;
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: att, defender: opp }] });
    s = passUntil(s, "declareBlockers");
    s = act(s, { type: "declareBlockers", player: opp, blocks: [{ blocker: mine, attacker: att }] });
    s = passUntil(s, "endCombat");
    // The bear's 2 damage to the attacker is its own; the attacker's 3 to the bear goes to the Giant.
    expect(s.objects[mine]!.zone).toBe("battlefield");
    expect(s.objects[g]!.damage).toBe(3);
    expect(s.objects[att]!.damage).toBe(2);
    expect(s.players[opp]!.life).toBe(life);
  });

  it("Ancient Adamantoise keeps its damage through the cleanup step", () => {
    const { s: s0, ap, ids } = setup([bolt]);
    const a = putOnBattlefield(s0, ap, adamantoise);
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: ap }])));
    expect(s.objects[a]!.damage).toBe(3);
    s = passUntil(s, "upkeep");
    expect(s.objects[a]!.damage).toBe(3);
  });

  it("Martyrs of Korlis: only damage from artifacts, and only while it's untapped", () => {
    const { s: s0, ap, ids, opp } = setup([bolt]);
    const m = putOnBattlefield(s0, opp, martyrs);
    invalidateCharacteristics(s0);
    const life = s0.players[opp]!.life;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.players[opp]!.life).toBe(life - 3);
    expect(s.objects[m]!.damage).toBe(0);
    // An artifact's damage goes to the Martyrs; tapped, they no longer take it.
    const rod = putOnBattlefield(s, ap, rodCard);
    invalidateCharacteristics(s);
    let t = settle(run(s, planActivate(s, ap, rod, 0, [{ kind: "player", id: opp }])));
    expect(t.players[opp]!.life).toBe(life - 3);
    expect(t.objects[m]!.damage).toBe(1);
    t.objects[m]!.tapped = true;
    t.objects[rod]!.tapped = false;
    t = settle(run(t, planActivate(t, ap, rod, 0, [{ kind: "player", id: opp }])));
    expect(t.players[opp]!.life).toBe(life - 4);
  });
});

const brimaz = card("Brimaz, King of Oreskos", "Legendary Creature — Cat Soldier", "{1}{W}{W}", { power: "3", toughness: "4", keywords: ["Vigilance"], oracleText: "Vigilance\nWhenever Brimaz attacks, create a 1/1 white Cat Soldier creature token with vigilance that's attacking.\nWhenever Brimaz blocks a creature, create a 1/1 white Cat Soldier creature token with vigilance that's blocking that creature." });
const hero = card("Hero of Bladehold", "Creature — Human Knight", "{2}{W}{W}", { power: "3", toughness: "4", keywords: ["Battle cry"], oracleText: "Battle cry (Whenever this creature attacks, each other attacking creature gets +1/+0 until end of turn.)\nWhenever this creature attacks, create two 1/1 white Soldier creature tokens that are tapped and attacking." });
const walker = card("Test Walker", "Legendary Planeswalker — Jace", "{3}", { loyalty: "5", oracleText: "+1: Draw a card." });

describe("tokens put onto the battlefield attacking (CR 508.4)", () => {
  it("Brimaz: its controller chooses whom (or which planeswalker) the token attacks, not necessarily Brimaz's", () => {
    supported(brimaz, hero);
    const { s: s0, ap, opp } = setup([]);
    const bz = putOnBattlefield(s0, ap, brimaz);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    const pw = putOnBattlefield(s0, third, walker);
    s0.objects[pw]!.counters.loyalty = 5;
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: bz, defender: opp }] });
    for (let i = 0; i < 6 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const p = s.pending;
    expect(p?.kind === "chooseOption" && p.what).toBe("attackWhom");
    if (p?.kind !== "chooseOption") return;
    expect(p.player).toBe(ap);
    expect(p.options[0]).toBe(String(opp)); // Brimaz's defender first
    expect(p.options).toContain(`${third}:${pw}`);
    s = act(s, { type: "chooseOption", player: ap, choice: `${third}:${pw}` });
    const token = s.battlefield.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Cat Soldier Token")!;
    expect(s.objects[token]!.attacking).toBe(third);
    expect(s.objects[token]!.attackingPermanent?.id).toBe(pw);
    expect(s.objects[token]!.tapped).toBe(false); // vigilance isn't relevant: it's created untapped
  });

  it("Hero of Bladehold: asked for each of the two tokens", () => {
    const { s: s0, ap, opp } = setup([]);
    const h = putOnBattlefield(s0, ap, hero);
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: h, defender: opp }] });
    const asked: string[] = [];
    for (let i = 0; i < 20 && s.stack.length + s.triggerQueue.length > 0 || s.pending; i++) {
      const p = s.pending;
      if (p?.kind === "chooseOption" && p.what === "attackWhom") {
        asked.push(p.prompt ?? "");
        s = act(s, { type: "chooseOption", player: ap, choice: asked.length === 1 ? String(opp) : String(third) });
      } else if (p) s = botActions(s, p.player).reduce((x, a) => act(x, a), s);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(asked).toHaveLength(2);
    expect(asked[1]).toMatch(/2 of 2/);
    const tokens = s.battlefield.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Soldier Token");
    expect(tokens.map((id) => s.objects[id]!.attacking).sort()).toEqual([opp, third].sort());
  });
});

const thornvault = card("Thornvault Forager", "Creature — Squirrel Ranger", "{1}{G}", { power: "2", toughness: "2", keywords: ["Forage"], oracleText: "{T}: Add {G}.\n{T}, Forage: Add two mana in any combination of colors. (To forage, exile three cards from your graveyard or sacrifice a Food.)\n{3}{G}, {T}: Search your library for a Squirrel card, reveal it, put it into your hand, then shuffle." });

describe("bots forage for mana", () => {
  it("a bot with nothing else to cast forages with Thornvault Forager for the two mana a card needs", () => {
    const { s: s0, ap, ids } = setup([card("Test Ox", "Creature — Ox", "{1}{W}", { power: "2", toughness: "3" })]);
    for (const id of s0.battlefield) s0.objects[id]!.tapped = true;
    for (const id of s0.players[ap]!.hand.filter((x) => x !== ids[0])) moveObject(s0, id, "library");
    const tv = putOnBattlefield(s0, ap, thornvault);
    const yard = [0, 1, 2].map(() => {
      const id = putOnBattlefield(s0, ap, bear());
      moveObject(s0, id, "graveyard");
      return id;
    });
    invalidateCharacteristics(s0);
    const plan = botActions(s0, ap);
    expect(plan).toEqual([expect.objectContaining({ type: "activateAbility", objectId: tv, index: 0, costs: { exileCards: yard } })]);
    let s = run(s0, plan);
    for (let i = 0; i < 4 && s.pending; i++) s = run(s, botActions(s, ap));
    expect(s.players[ap]!.manaPool.W ?? 0).toBeGreaterThanOrEqual(1);
    s = run(s, botActions(s, ap));
    // It casts what the mana was for (the Ox, or its commander, which costs as much).
    expect(s.stack).toHaveLength(1);
  });
});

const gwenom = card("Gwenom, Remorseless", "Legendary Creature — Symbiote Spider Hero", "{3}{B}{B}", { power: "4", toughness: "4", keywords: ["Deathtouch", "Lifelink"], oracleText: "Deathtouch, lifelink\nWhenever Gwenom attacks, until end of turn, you may look at the top card of your library any time and you may play cards from the top of your library. If you cast a spell this way, pay life equal to its mana value rather than pay its mana cost." });
const ogre4 = card("Hill Ogre", "Creature — Ogre", "{3}{R}", { power: "3", toughness: "3" });
const onTop = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  moveObject(s, id, "library");
  const lib = s.players[pid]!.library;
  lib.splice(lib.indexOf(id), 1);
  lib.unshift(id);
  return id;
};

describe("Gwenom, Remorseless", () => {
  it("after it attacks, the top card can be seen and cast for life until end of turn, not before or after", () => {
    supported(gwenom);
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, gwenom);
    const top = onTop(s0, ap, ogre4);
    invalidateCharacteristics(s0);
    expect(topVisible(s0, ap, ap)).toBe(false);
    expect(altCostsFor(s0, ap, s0.objects[top]!).map((a) => a.kind)).toEqual([]);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: g, defender: opp }] });
    s = settle(s);
    expect(topVisible(s, ap, ap)).toBe(true);
    expect(topVisible(s, ap, opp)).toBe(false);
    s = passUntil(s, "main2", ap);
    expect(castProblem(s, ap, top)).toMatch(/paying life/);
    const life = s.players[ap]!.life;
    s = run(s, planCast(s, ap, top, undefined, undefined, "auto", undefined, { alt: "citadel" }));
    expect(s.players[ap]!.life).toBe(life - 4);
    expect(s.objects[top]!.zone).toBe("stack");
    // The next turn: no longer.
    const next = onTop(s, ap, ogre4);
    s = passUntil(settle(s), "upkeep");
    expect(topVisible(s, ap, ap)).toBe(false);
    expect(altCostsFor(s, ap, s.objects[next]!).map((a) => a.kind)).toEqual([]);
  });
});

const struggle = card("Struggle for Project Purity", "Enchantment", "{3}{U}", { oracleText: "As this enchantment enters, choose Brotherhood or Enclave.\n• Brotherhood — At the beginning of your upkeep, each opponent draws a card. You draw a card for each card drawn this way.\n• Enclave — Whenever a player attacks you with one or more creatures, that player gets twice that many rad counters." });
const nightkin = card("Nightkin Ambusher", "Creature — Mutant Warrior", "{2}{U}", { power: "3", toughness: "2", oracleText: "When this creature enters, target player gets four rad counters." });

describe("rad counters (CR 728) and Struggle for Project Purity", () => {
  it("Enclave: a player attacking you with two creatures gets four rad counters; at their precombat main they mill four, lose 1 life and a rad counter per nonland card", () => {
    supported(struggle);
    const { s: s0, ap, opp } = setup([]);
    const st = putOnBattlefield(s0, opp, struggle);
    s0.objects[st]!.chosen = { anchor: "Enclave" };
    const a1 = putOnBattlefield(s0, ap, bear());
    const a2 = putOnBattlefield(s0, ap, bear());
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a1, defender: opp }, { attacker: a2, defender: opp }] });
    s = settle(s);
    expect(s.players[ap]!.rad).toBe(4);
    // Next time it's their precombat main phase: the library's top four, two bears and two forests.
    s = passUntil(s, "end", ap);
    s = passUntil(s, "upkeep", ap);
    const lib = s.players[ap]!.library;
    const lands = lib.filter((id) => s.cards[s.objects[id]!.cardId]!.name === "Forest").slice(0, 3);
    const nonland = lib.filter((id) => s.cards[s.objects[id]!.cardId]!.name !== "Forest").slice(0, 2);
    // The first is drawn in the draw step.
    lib.splice(0, lib.length, ...lands, ...nonland, ...lib.filter((id) => !lands.includes(id) && !nonland.includes(id)));
    lands.shift();
    s = passUntil(s, "main1", ap);
    expect(s.triggerQueue.length + s.stack.length).toBeGreaterThan(0);
    const life = s.players[ap]!.life;
    s = settle(s);
    expect([...lands, ...nonland].every((id) => s.objects[id]!.zone === "graveyard")).toBe(true);
    expect(s.players[ap]!.life).toBe(life - 2);
    expect(s.players[ap]!.rad).toBe(2);
  });

  it("Brotherhood: each opponent draws, then you draw one for each card they drew", () => {
    const { s: s0, ap } = setup([]);
    const st = putOnBattlefield(s0, ap, struggle);
    s0.objects[st]!.chosen = { anchor: "Brotherhood" };
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "end", ap);
    s = passUntil(s, "upkeep", ap);
    const hands = s.players.map((p) => p.hand.length);
    s = settle(s);
    expect(s.players.map((p) => p.hand.length - hands[p.id]!)).toEqual(s.players.map((p) => (p.id === ap ? 3 : 1)));
  });

  it("Nightkin Ambusher gives four; proliferate adds one to an opponent's", () => {
    supported(nightkin);
    const { s: s0, ap, ids } = setup([nightkin]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    const hit = s.players.find((p) => (p.rad ?? 0) === 4)!;
    expect(hit.id).not.toBe(ap); // a bot aims it at an opponent
    proliferate(s, ap, "test");
    expect(s.players[hit.id]!.rad).toBe(5);
  });
});

const gisa = card("Gisa, Glorious Resurrector", "Legendary Creature — Human Wizard", "{2}{B}{B}", { power: "4", toughness: "4", oracleText: "If a creature an opponent controls would die, exile it instead.\nAt the beginning of your upkeep, put all creature cards exiled with Gisa onto the battlefield under your control. They gain decayed. (A creature with decayed can't block. When it attacks, sacrifice it at end of combat.)" });

describe("Gisa, Glorious Resurrector", () => {
  it("an opponent's creature that would die is exiled; in your upkeep it comes back under your control with decayed", () => {
    supported(gisa);
    const { s: s0, ap, ids, opp } = setup([bolt]);
    putOnBattlefield(s0, ap, gisa);
    const victim = putOnBattlefield(s0, opp, bear({ name: "Victim Bear" }));
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "object", id: victim }])));
    expect(s.objects[victim]!.zone).toBe("exile");
    s.objects[mine]!.damage = 5; // our own creature dies normally
    s = settle(act(s, { type: "passPriority", player: waitingOn(s)! }));
    expect(s.objects[mine]!.zone).toBe("graveyard");
    s = passUntil(s, "end", ap);
    s = passUntil(s, "upkeep", ap);
    s = settle(s);
    expect(s.objects[victim]!.zone).toBe("battlefield");
    expect(s.objects[victim]!.controller).toBe(ap);
    expect(characteristics(s, s.objects[victim]!).keywords).toContain("Decayed");
  });
});

const kefka = scry("transform", [
  { name: "Kefka, Court Mage", mana_cost: "{2}{U}{B}{R}", type_line: "Legendary Creature — Human Wizard", power: "4", toughness: "5", oracle_text: "Whenever Kefka enters or attacks, each player discards a card. Then you draw a card for each card type among cards discarded this way.\n{8}: Each opponent sacrifices a permanent of their choice. Transform Kefka. Activate only as a sorcery." },
  { name: "Kefka, Ruler of Ruin", type_line: "Legendary Creature — Avatar Wizard", power: "5", toughness: "7", color_indicator: ["U", "B", "R"], oracle_text: "Flying\nWhenever an opponent loses life during your turn, you draw that many cards." },
], { keywords: ["Transform"] });
const relic = card("Test Relic", "Artifact", "{1}");

/** `pid`'s hand is exactly these cards now. */
const handOf = (s: GameState, pid: PlayerId, defs: CardDef[]) => {
  for (const id of [...s.players[pid]!.hand]) moveObject(s, id, "library");
  return defs.map((d) => {
    const id = putOnBattlefield(s, pid, d);
    moveObject(s, id, "hand");
    return id;
  });
};

describe("Kefka, Court Mage // Kefka, Ruler of Ruin", () => {
  it("enters: each player discards, then you draw a card for each card type among the discarded cards", () => {
    supported(kefka);
    const { s: s0, ap } = setup([]);
    const [k] = handOf(s0, ap, [kefka, bolt]);
    const [a, b, c] = s0.turnOrder.filter((p) => p !== ap);
    handOf(s0, a!, [forest]);
    handOf(s0, b!, [bear()]);
    handOf(s0, c!, [relic]);
    invalidateCharacteristics(s0);
    const s = settle(run(s0, planCast(s0, ap, k!)));
    // Instant, land, creature, artifact: four card types, so four cards.
    expect(s.players[ap]!.hand).toHaveLength(4);
    expect(s.players[ap]!.graveyard.some((id) => s.cards[s.objects[id]!.cardId]!.name === "Lightning Bolt")).toBe(true);
  });

  it("Ruler of Ruin: an opponent losing life during your turn draws you that many; not during theirs", () => {
    const { s: s0, ap, ids, opp } = setup([bolt]);
    const k = putOnBattlefield(s0, ap, kefka);
    s0.objects[k]!.face = 1;
    invalidateCharacteristics(s0);
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3);
    s = passUntil(s, "upkeep", opp);
    const before = s.players[ap]!.hand.length;
    loseLife(s, opp, 2);
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(before);
  });
});

const jodah = card("Jodah, the Unifier", "Legendary Creature — Human Wizard", "{W}{U}{B}{R}{G}", { power: "5", toughness: "5", oracleText: "Legendary creatures you control get +X/+X, where X is the number of legendary creatures you control.\nWhenever you cast a legendary spell from your hand, exile cards from the top of your library until you exile a legendary nonland card with lesser mana value. You may cast that card without paying its mana cost. Put the rest on the bottom of your library in a random order." });

describe("Jodah, the Unifier", () => {
  it("a legendary spell from hand exiles past nonlegendary cards and a legendary land to a cheaper legendary card", () => {
    supported(jodah);
    const legend = card("Test Legend", "Legendary Creature — Human", "{2}{G}", { power: "2", toughness: "2" });
    const cheap = card("Test Small Legend", "Legendary Creature — Elf", "{1}{G}", { power: "1", toughness: "1" });
    const plain = card("Test Small Bear", "Creature — Bear", "{1}", { power: "1", toughness: "1" });
    const legendLand = card("Test Legendary Land", "Legendary Land", "");
    const { s: s0, ap, ids } = setup([legend]);
    putOnBattlefield(s0, ap, jodah);
    const hit = onTop(s0, ap, cheap);
    const land = onTop(s0, ap, legendLand);
    const small = onTop(s0, ap, plain);
    invalidateCharacteristics(s0);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    for (let i = 0; i < 10 && s.pending?.kind !== "castFree"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "castFree", objectId: hit });
    expect(s.objects[small]!.zone).toBe("exile");
    expect(s.objects[land]!.zone).toBe("exile");
  });

  it("a nonlegendary spell doesn't trigger it", () => {
    const { s: s0, ap, ids } = setup([bear()]);
    putOnBattlefield(s0, ap, jodah);
    invalidateCharacteristics(s0);
    const s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.stack).toHaveLength(1);
  });
});

const acrobatics = card("Lae'zel's Acrobatics", "Instant", "{3}{W}", { oracleText: "Exile all nontoken creatures you control, then roll a d20.\n1—9 | Return those cards to the battlefield under their owner's control at the beginning of the next end step.\n10—20 | Return those cards to the battlefield under their owner's control, then exile them again. Return those cards to the battlefield under their owner's control at the beginning of the next end step." });
const healer = card("Test Healer", "Creature — Cleric", "{1}{W}", { power: "1", toughness: "1", oracleText: "When this creature enters, you gain 1 life." });

/** The next die rolls give these results. */
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

describe("Lae'zel's Acrobatics", () => {
  for (const [roll, now] of [[5, 0], [15, 1]] as const) {
    it(`rolled ${roll}: ${now ? "back, enters, exiled again, then" : "exiled until"} the next end step`, () => {
      supported(acrobatics, healer);
      const { s: s0, ap, ids } = setup([acrobatics]);
      const h = putOnBattlefield(s0, ap, healer);
      const token = putOnBattlefield(s0, ap, bear());
      s0.objects[token]!.isToken = true;
      invalidateCharacteristics(s0);
      rig(s0, 20, [roll]);
      const life = s0.players[ap]!.life;
      let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
      expect(s.objects[h]!.zone).toBe("exile");
      expect(s.objects[token]!.zone).toBe("battlefield"); // nontoken creatures only
      expect(s.players[ap]!.life).toBe(life + now);
      s = settle(passUntil(s, "end", ap));
      expect(s.objects[h]!.zone).toBe("battlefield");
      expect(s.players[ap]!.life).toBe(life + now + 1);
    });
  }
});

const ROOM = "\n(You may cast either half. That door unlocks on the battlefield. As a sorcery, you may pay the mana cost of a locked door to unlock it.)";
const annex = scry("split", [
  { name: "Unholy Annex", mana_cost: "{2}{B}", type_line: "Enchantment — Room", oracle_text: `At the beginning of your end step, draw a card. If you control a Demon, each opponent loses 2 life and you gain 2 life. Otherwise, you lose 2 life.${ROOM}` },
  { name: "Ritual Chamber", mana_cost: "{3}{B}{B}", type_line: "Enchantment — Room", oracle_text: `When you unlock this door, create a 6/6 black Demon creature token with flying.${ROOM}` },
]);
const foyer = scry("split", [
  { name: "Charred Foyer", mana_cost: "{3}{R}", type_line: "Enchantment — Room", oracle_text: `At the beginning of your upkeep, exile the top card of your library. You may play it this turn.${ROOM}` },
  { name: "Warped Space", mana_cost: "{4}{R}{R}", type_line: "Enchantment — Room", oracle_text: `Once each turn, you may pay {0} rather than pay the mana cost for a spell you cast from exile.${ROOM}` },
]);
const demon = card("Test Demon", "Creature — Demon", "{3}{B}", { power: "4", toughness: "4" });

describe("Rooms: Unholy Annex, Warped Space", () => {
  for (const withDemon of [true, false]) {
    it(`Unholy Annex at your end step: draw, then ${withDemon ? "drain 2 with a Demon" : "lose 2 without one"}`, () => {
      supported(annex, foyer);
      const { s: s0, ap } = setup([]);
      const r = putOnBattlefield(s0, ap, annex);
      s0.objects[r]!.unlocked = [0];
      if (withDemon) putOnBattlefield(s0, ap, demon);
      invalidateCharacteristics(s0);
      const opps = s0.turnOrder.filter((p) => p !== ap);
      const life = s0.players[ap]!.life;
      const s = settle(passUntil(s0, "end", ap));
      expect(s.players[ap]!.life).toBe(life + (withDemon ? 2 : -2));
      for (const o of opps) expect(s.players[o]!.life).toBe(withDemon ? 38 : 40);
    });
  }

  it("Warped Space: once each turn, a spell cast from exile for {0}", () => {
    const { s: s0, ap } = setup([]);
    const r = putOnBattlefield(s0, ap, foyer);
    s0.objects[r]!.unlocked = [1];
    const exiled = [ogre4, ogre4].map((d) => {
      const id = putOnBattlefield(s0, ap, d);
      moveObject(s0, id, "exile");
      s0.objects[id]!.mayPlay = { player: ap, zc: s0.objects[id]!.zoneChanges ?? 0, until: "thisTurn", turn: s0.turn };
      return id;
    });
    const fromHand = handOf(s0, ap, [bear()])[0]!;
    invalidateCharacteristics(s0);
    expect(altCostsFor(s0, ap, s0.objects[fromHand]!).some((a) => a.kind === "payZero")).toBe(false);
    expect(altCostsFor(s0, ap, s0.objects[exiled[0]!]!).some((a) => a.kind === "payZero")).toBe(true);
    for (const id of s0.battlefield) if (s0.objects[id]!.controller === ap && id !== r) s0.objects[id]!.tapped = true; // no mana
    let s = settle(run(s0, planCast(s0, ap, exiled[0]!, undefined, undefined, undefined, undefined, { alt: "payZero" })));
    expect(s.objects[exiled[0]!]!.zone).toBe("battlefield");
    expect(altCostsFor(s, ap, s.objects[exiled[1]!]!).some((a) => a.kind === "payZero")).toBe(false);
  });
});

const hydaelyn = scry("transform", [
  { name: "Venat, Heart of Hydaelyn", mana_cost: "{1}{W}{W}", type_line: "Legendary Creature — Elder Wizard", power: "3", toughness: "3", oracle_text: "Whenever you cast a legendary spell, draw a card. This ability triggers only once each turn.\nHero's Sundering — {7}, {T}: Exile target nonland permanent. Transform Venat. Activate only as a sorcery." },
  { name: "Hydaelyn, the Mothercrystal", type_line: "Legendary Creature — God", power: "4", toughness: "4", color_indicator: ["W"], oracle_text: "Indestructible\nBlessing of Light — At the beginning of combat on your turn, put a +1/+1 counter on another target creature you control. Until your next turn, it gains indestructible. If that creature is legendary, draw a card." },
], { keywords: ["Transform"] });
const tamiyo = card("Tamiyo, Field Researcher", "Legendary Planeswalker — Tamiyo", "{1}{G}{W}{U}", { loyalty: "4", oracleText: "+1: Choose up to two target creatures. Until your next turn, whenever either of those creatures deals combat damage, you draw a card.\n−2: Tap up to two target nonland permanents. They don't untap during their controller's next untap step.\n−7: Draw three cards. You get an emblem with \"You may cast spells from your hand without paying their mana costs.\"" });

describe("Hydaelyn, Tamiyo", () => {
  for (const legendary of [true, false]) {
    it(`Hydaelyn: a counter and indestructible until your next turn${legendary ? ", and a card for a legendary creature" : ""}`, () => {
      supported(hydaelyn, tamiyo);
      const { s: s0, ap } = setup([]);
      const h = putOnBattlefield(s0, ap, hydaelyn);
      s0.objects[h]!.face = 1;
      const b = putOnBattlefield(s0, ap, legendary ? card("Test Hero", "Legendary Creature — Human", "{1}", { power: "1", toughness: "1" }) : bear());
      invalidateCharacteristics(s0);
      const hand = s0.players[ap]!.hand.length;
      let s = settle(passUntil(s0, "beginCombat", ap));
      expect(s.objects[b]!.counters["+1/+1"]).toBe(1);
      expect(characteristics(s, s.objects[b]!).keywords).toContain("Indestructible");
      expect(s.players[ap]!.hand.length).toBe(hand + (legendary ? 1 : 0));
      s = passUntil(s, "upkeep", s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % s.turnOrder.length]!);
      expect(characteristics(s, s.objects[b]!).keywords).toContain("Indestructible");
      s = passUntil(s, "upkeep", ap);
      expect(characteristics(s, s.objects[b]!).keywords).not.toContain("Indestructible");
    });
  }

  it("Tamiyo +1: each of the two creatures dealing combat damage draws a card, until your next turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const t = putOnBattlefield(s0, ap, tamiyo);
    s0.objects[t]!.counters.loyalty = 4;
    const a = putOnBattlefield(s0, ap, bear());
    const b = putOnBattlefield(s0, ap, bear());
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "main1", ap);
    s = settle(run(s, planActivate(s, ap, t, 0, [{ kind: "object", id: a }, { kind: "object", id: b }])));
    expect(s.objects[t]!.counters.loyalty).toBe(5);
    const hand = s.players[ap]!.hand.length;
    s = passUntil(s, "declareAttackers", ap);
    s = act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: a, defender: opp }, { attacker: b, defender: opp }] });
    s = settle(passUntil(s, "combatDamage"));
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
  });

  it("Tamiyo −7: an emblem that lets you cast spells from your hand without paying their mana costs", () => {
    const { s: s0, ap } = setup([]);
    const t = putOnBattlefield(s0, ap, tamiyo);
    s0.objects[t]!.counters.loyalty = 7;
    const [o] = handOf(s0, ap, [ogre4]);
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "main1", ap);
    s = settle(run(s, planActivate(s, ap, t, 2)));
    expect(s.objects[t]!.zone).toBe("graveyard");
    for (const id of s.battlefield) if (s.objects[id]!.controller === ap) s.objects[id]!.tapped = true; // no mana
    expect(altCostsFor(s, ap, s.objects[o!]!).some((x) => x.kind === "omniscience")).toBe(true);
    s = settle(run(s, planCast(s, ap, o!, undefined, undefined, undefined, undefined, { alt: "omniscience" })));
    expect(s.objects[o!]!.zone).toBe("battlefield");
  });
});

const blessing = card("Lifestream's Blessing", "Instant", "{4}{G}{G}", { keywords: ["Foretell"], oracleText: "Draw X cards, where X is the greatest power among creatures you controlled as you cast this spell. If this spell was cast from exile, you gain twice X life.\nForetell {4}{G} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)" });

describe("Lifestream's Blessing", () => {
  it("X is the greatest power as it was cast, even if that creature is gone when it resolves", () => {
    supported(blessing);
    const { s: s0, ap, ids } = setup([blessing]);
    const big = putOnBattlefield(s0, ap, ogre4);
    invalidateCharacteristics(s0);
    const hand = s0.players[ap]!.hand.length;
    const life = s0.players[ap]!.life;
    let s = run(s0, planCast(s0, ap, ids[0]!));
    moveObject(s, big, "graveyard");
    invalidateCharacteristics(s);
    s = settle(s);
    expect(s.players[ap]!.hand.length).toBe(hand - 1 + 3);
    expect(s.players[ap]!.life).toBe(life); // not cast from exile
  });
});

const washAway = card("Wash Away", "Instant", "{U}", { keywords: ["Cleave"], oracleText: "Cleave {1}{U}{U} (You may cast this spell for its cleave cost. If you do, remove the words in square brackets.)\nCounter target spell [that wasn't cast from its owner's hand]." });
const peril = card("Path of Peril", "Sorcery", "{1}{B}{B}", { keywords: ["Cleave"], oracleText: "Cleave {4}{W}{B} (You may cast this spell for its cleave cost. If you do, remove the words in square brackets.)\nDestroy all creatures [with mana value 2 or less]." });

describe("cleave (CR 702.148)", () => {
  it("Wash Away: only a spell not cast from its owner's hand, unless cast for its cleave cost", () => {
    supported(washAway, peril);
    const { s: s0, ap, opp } = setup([]);
    const [wash] = handOf(s0, ap, [washAway]);
    const [b] = handOf(s0, opp, [bolt]);
    putOnBattlefield(s0, opp, mountain);
    let s = passUntil(s0, "main1", opp);
    s = run(s, planCast(s, opp, b!, [{ kind: "player", id: ap }]));
    for (let i = 0; i < 4 && waitingOn(s) !== ap; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const target = [{ kind: "stack" as const, id: s.stack.find((x) => x.kind === "spell")!.id }];
    expect(castProblem(s, ap, wash!, target)).toBeTruthy();
    expect(altCostsFor(s, ap, s.objects[wash!]!).some((a) => a.kind === "cleave")).toBe(true);
    const life = s.players[ap]!.life;
    s = settle(run(s, planCast(s, ap, wash!, target, undefined, undefined, undefined, { alt: "cleave" })));
    expect(s.objects[b!]!.zone).toBe("graveyard");
    expect(s.players[ap]!.life).toBe(life);
    expect(s.log.some((l) => /Wash Away.*for its cleave cost/.test(l.text))).toBe(true);
  });

  it("Path of Peril: the creatures with mana value 2 or less; cleaved, all of them", () => {
    for (const alt of [undefined, "cleave" as const]) {
      const { s: s0, ap } = setup([peril]);
      const small = putOnBattlefield(s0, s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!, bear());
      const big = putOnBattlefield(s0, s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!, ogre4);
      invalidateCharacteristics(s0);
      const s = settle(run(s0, planCast(s0, ap, s0.players[ap]!.hand.find((id) => s0.cards[s0.objects[id]!.cardId]!.name === "Path of Peril")!, undefined, undefined, undefined, undefined, alt ? { alt } : {})));
      expect(s.objects[small]!.zone).toBe("graveyard");
      expect(s.objects[big]!.zone).toBe(alt ? "graveyard" : "battlefield");
    }
  });
});

const mazesEnd = card("Maze's End", "Land", "", { oracleText: "This land enters tapped.\n{T}: Add {C}.\n{3}, {T}, Return this land to its owner's hand: Search your library for a Gate card, put it onto the battlefield, then shuffle. If you control ten or more Gates with different names, you win the game." });
const derevi = card("Derevi, Empyrial Tactician", "Legendary Creature — Bird Wizard", "{G}{W}{U}", { power: "2", toughness: "3", keywords: ["Flying"], oracleText: "Flying\nWhen Derevi enters and whenever a creature you control deals combat damage to a player, you may tap or untap target permanent.\n{1}{G}{W}{U}: Put Derevi onto the battlefield from the command zone." });

describe("Maze's End, Derevi", () => {
  it("Maze's End: the tenth differently named Gate wins the game", () => {
    supported(mazesEnd, derevi);
    const { s: s0, ap } = setup([]);
    const m = putOnBattlefield(s0, ap, mazesEnd);
    for (let i = 1; i <= 9; i++) putOnBattlefield(s0, ap, card(`Test Gate ${i}`, "Land — Gate", ""));
    putOnBattlefield(s0, ap, card("Test Gate 1", "Land — Gate", "")); // the same name again doesn't count twice
    onTop(s0, ap, card("Test Gate 10", "Land — Gate", ""));
    invalidateCharacteristics(s0);
    let s = run(s0, planActivate(s0, ap, m, 0));
    for (let i = 0; i < 20 && s.pending?.kind !== "searchLibrary"; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    const gate = s.players[ap]!.library.find((id) => s.cards[s.objects[id]!.cardId]!.name === "Test Gate 10")!;
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [gate] }));
    expect(s.objects[gate]!.zone).toBe("battlefield");
    expect(s.winner).toBe(ap);
  });

  it("Derevi: put onto the battlefield from the command zone, not cast (no tax); not from anywhere else", () => {
    const { s: s0, ap } = setup([]);
    const d = putOnBattlefield(s0, ap, derevi);
    s0.battlefield.splice(s0.battlefield.indexOf(d), 1);
    Object.assign(s0.objects[d]!, { zone: "command", isCommander: true });
    s0.players[ap]!.command.push(d);
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planActivate(s0, ap, d, 0)), false);
    expect(s.objects[d]!.zone).toBe("battlefield");
    expect(s.players[ap]!.commanderCasts[d] ?? 0).toBe(0);
    expect(s.log.some((l) => /Derevi.*cast/i.test(l.text) && !/activates/.test(l.text))).toBe(false);
    expect(planActivate(s, ap, d, 0)).toBeNull();
  });

  it("a bot puts Derevi in with the ability once the tax makes casting it dearer", () => {
    const { s: s0, ap } = setup([]);
    for (const id of [...s0.players[ap]!.hand]) moveObject(s0, id, "library");
    const d = putOnBattlefield(s0, ap, derevi);
    s0.battlefield.splice(s0.battlefield.indexOf(d), 1);
    Object.assign(s0.objects[d]!, { zone: "command", isCommander: true });
    s0.players[ap]!.command = [d];
    s0.players[ap]!.commanderCasts[d] = 2;
    invalidateCharacteristics(s0);
    const plan = botActions(s0, ap);
    expect(plan.some((a) => a.type === "activateAbility" && a.objectId === d)).toBe(true);
  });
});

const lotv = card("Liliana of the Veil", "Legendary Planeswalker — Liliana", "{1}{B}{B}", { loyalty: "3", oracleText: "+1: Each player discards a card.\n−2: Target player sacrifices a creature.\n−6: Separate all permanents target player controls into two piles. That player sacrifices all permanents in the pile of their choice." });
const enchanted = card("Rancor", "Enchantment — Aura", "{G}", { oracleText: "Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen Rancor is put into a graveyard from the battlefield, return Rancor to its owner's hand." });

describe("Liliana of the Veil −6: two piles of permanents (CR 700.3)", () => {
  it("you separate the player's permanents (an Aura apart from its creature, rulings); they sacrifice the pile they choose", () => {
    supported(lotv);
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, lotv);
    s0.objects[l]!.counters.loyalty = 6;
    const big = putOnBattlefield(s0, opp, bear({ power: "6", toughness: "6" }));
    const aura = putOnBattlefield(s0, opp, enchanted);
    s0.objects[aura]!.attachedTo = big;
    const small = putOnBattlefield(s0, opp, bear());
    const land = putOnBattlefield(s0, opp, forest);
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "main1", ap);
    s = run(s, planActivate(s, ap, l, 2, [{ kind: "player", id: opp }]));
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.pending).toMatchObject({ kind: "pickPermanents", player: ap, action: "pile", of: opp });
    expect([...(s.pending as { options: string[] }).options].sort()).toEqual([big, aura, small, land].sort());
    s = act(s, { type: "pickPermanents", player: ap, ids: [big, small] });
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: opp, what: "pile", sacrificePile: true });
    expect((s.pending as { piles: string[][] }).piles.map((p) => [...p].sort())).toEqual([[big, small].sort(), [aura, land].sort()]);
    s = act(s, { type: "chooseOption", player: opp, choice: "1" });
    s = settle(s);
    expect(s.objects[aura]!.zone).not.toBe("battlefield"); // sacrificed (Rancor's trigger returns it to hand)
    expect(s.objects[land]!.zone).toBe("graveyard");
    expect(s.objects[big]!.zone).toBe("battlefield");
    expect(s.objects[small]!.zone).toBe("battlefield");
    expect(s.objects[l]!.zone).toBe("graveyard"); // 0 loyalty
  });

  it("an empty pile can be chosen, and nothing is sacrificed; bots split evenly and sacrifice the lesser pile", () => {
    const { s: s0, ap, opp } = setup([]);
    const l = putOnBattlefield(s0, ap, lotv);
    s0.objects[l]!.counters.loyalty = 7;
    const a = putOnBattlefield(s0, opp, bear());
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "main1", ap);
    s = run(s, planActivate(s, ap, l, 2, [{ kind: "player", id: opp }]));
    for (let i = 0; i < 10 && !s.pending; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s = act(s, { type: "pickPermanents", player: ap, ids: [a] });
    // The bot chooses the empty pile.
    s = botActions(s, opp).reduce((x, y) => act(x, y), s);
    s = settle(s);
    expect(s.objects[a]!.zone).toBe("battlefield");
    // A bot separating: both piles worth about the same.
    const { s: t0, ap: bp, opp: bo } = setup([]);
    const l2 = putOnBattlefield(t0, bp, lotv);
    t0.objects[l2]!.counters.loyalty = 6;
    const mine = [putOnBattlefield(t0, bo, bear({ power: "4", toughness: "4" })), putOnBattlefield(t0, bo, bear({ power: "4", toughness: "4" })), putOnBattlefield(t0, bo, forest), putOnBattlefield(t0, bo, forest)];
    invalidateCharacteristics(t0);
    let t = passUntil(t0, "main1", bp);
    t = run(t, planActivate(t, bp, l2, 2, [{ kind: "player", id: bo }]));
    for (let i = 0; i < 10 && !t.pending; i++) t = act(t, { type: "passPriority", player: waitingOn(t)! });
    t = botActions(t, bp).reduce((x, y) => act(x, y), t);
    t = settle(t);
    expect(mine.filter((id) => t.objects[id]!.zone === "battlefield")).toHaveLength(2);
  });
});
