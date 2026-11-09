// Round 323 (Lane A, skip-list cards): a triggered mana ability that also deals damage, to the player who tapped the land
// (Overabundance, even when the land made no mana) or from the land itself while ~ is tapped (Barbflare Gremlin); exactly
// three quest counters removed from among permanents you control, then a reflexive trigger (Overseer of Vault 76); a cost
// of two creature cards from one player's graveyard (Night Soil); an Aura that makes its creature a legendary Soldier and
// attaches Equipment to it as it attacks or blocks (Super-Soldier Serum); counters equal to the mana spent on a spell, then
// a transform at seven (Smoldering Egg); a draw for noncombat damage equal to a creature's toughness, and noncombat damage
// plus X for the turn (Taii Wakeen, Perfect Shot).

import { describe, expect, it } from "vitest";
import { act, card, forest, passUntil, putOnBattlefield, setup, target } from "./helpers";
import { abilityProblem, applyAction, botActions, characteristics, invalidateCharacteristics, isFullySupported, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = applyAction(s, a);
  return s;
};
/** Everyone passes until the stack is empty; other players' questions as the bots would. Stops at any question of `me`'s. */
const settle = (s: GameState, me?: PlayerId) => {
  for (let i = 0; i < 300 && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p && p.player !== me) s = act(s, botActions(s, p.player)[0]!);
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** A copy of `def` in `pid`'s graveyard. */
const inYard = (s: GameState, pid: PlayerId, def: CardDef) => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = "graveyard";
  s.players[pid]!.graveyard.push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Only these permanents of `pid` are untapped. */
const only = (s: GameState, pid: PlayerId, ids: string[]) => {
  for (const id of s.battlefield) if (s.objects[id]!.controller === pid && !ids.includes(id)) s.objects[id]!.tapped = true;
};
const pool = (s: GameState, pid: PlayerId) => Object.fromEntries(Object.entries(s.players[pid]!.manaPool).filter(([, n]) => n > 0));
const logged = (s: GameState, re: RegExp) => s.log.some((l) => re.test(typeof l === "string" ? l : (l as { text: string }).text));
const bear = (name: string, extra: Partial<CardDef> = {}) => card(name, "Creature — Bear", "{1}{G}", { cmc: 2, power: "2", toughness: "2", ...extra });

// Real oracle text (Scryfall).
const overabundance = (): CardDef => ({"oracleId":"b1ee0503-be92-4a06-89cd-5dfa937930d3","name":"Overabundance","manaCost":"{1}{R}{G}","cmc":3,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"Whenever a player taps a land for mana, that player adds one mana of any type that land produced, and this enchantment deals 1 damage to the player.","colors":["G","R"],"colorIdentity":["G","R"],"keywords":[],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/4/1/4183e73d-609a-4292-b173-e39eb51949f3.jpg?1783945660","artUrl":"https://cards.scryfall.io/art_crop/front/4/1/4183e73d-609a-4292-b173-e39eb51949f3.jpg?1783945660","commanderLegal":"legal","set":"inv","releasedAt":"2000-10-02","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const gremlin = (): CardDef => ({"oracleId":"bd7accec-ca8a-49c7-9ae4-fe97d99b4a34","name":"Barbflare Gremlin","manaCost":"{3}{R}","cmc":4,"typeLine":"Creature — Gremlin","supertypes":[],"types":["Creature"],"subtypes":["Gremlin"],"oracleText":"First strike, haste\nWhenever a player taps a land for mana, if this creature is tapped, that player adds one mana of any type that land produced. Then that land deals 1 damage to that player.","power":"3","toughness":"2","colors":["R"],"colorIdentity":["R"],"keywords":["First strike","Haste"],"producedMana":["B","G","R","U","W"],"imageUrl":"https://cards.scryfall.io/normal/front/8/2/825f509c-272e-4c91-a139-da3c67bd6b33.jpg?1783909657","artUrl":"https://cards.scryfall.io/art_crop/front/8/2/825f509c-272e-4c91-a139-da3c67bd6b33.jpg?1783909657","commanderLegal":"legal","set":"dsc","releasedAt":"2024-09-27","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const overseer = (): CardDef => ({"oracleId":"84f32a1d-3861-418e-a3c2-7e731a2cd55c","name":"Overseer of Vault 76","manaCost":"{2}{W}","cmc":3,"typeLine":"Legendary Creature — Human Advisor","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Advisor"],"oracleText":"First Contact — Whenever Overseer of Vault 76 or another creature you control with power 3 or less enters, put a quest counter on Overseer of Vault 76.\nAt the beginning of combat on your turn, you may remove three quest counters from among permanents you control. When you do, put a +1/+1 counter on each creature you control and they gain vigilance until end of turn.","power":"3","toughness":"3","colors":["W"],"colorIdentity":["W"],"keywords":["First Contact"],"imageUrl":"https://cards.scryfall.io/normal/front/3/5/35848917-d658-4c3b-b675-4f0185f76dc4.jpg?1783912418","artUrl":"https://cards.scryfall.io/art_crop/front/3/5/35848917-d658-4c3b-b675-4f0185f76dc4.jpg?1783912418","commanderLegal":"legal","set":"pip","releasedAt":"2024-03-08","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const nightSoil = (): CardDef => ({"oracleId":"3165fe8f-52d7-40f7-bb14-8f4300a564e6","name":"Night Soil","manaCost":"{G}{G}","cmc":2,"typeLine":"Enchantment","supertypes":[],"types":["Enchantment"],"subtypes":[],"oracleText":"{1}, Exile two creature cards from a single graveyard: Create a 1/1 green Saproling creature token.","colors":["G"],"colorIdentity":["G"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/5/2/52a0eca1-f936-4f5a-820b-fa12542c593d.jpg?1783939659","artUrl":"https://cards.scryfall.io/art_crop/front/5/2/52a0eca1-f936-4f5a-820b-fa12542c593d.jpg?1783939659","commanderLegal":"legal","set":"c13","releasedAt":"2013-11-01","rarity":"common","layout":"normal","gameChanger":false} as CardDef);
const serum = (): CardDef => ({"oracleId":"6f2ba142-5e7c-4709-ae03-e028cb2a9872","name":"Super-Soldier Serum","manaCost":"{1}{W}","cmc":2,"typeLine":"Enchantment — Aura","supertypes":[],"types":["Enchantment"],"subtypes":["Aura"],"oracleText":"Enchant creature\nEnchanted creature gets +2/+2, has first strike and vigilance, and is a legendary Soldier in addition to its other types.\nWhenever enchanted creature attacks or blocks, attach any number of target Equipment you control to it.","colors":["W"],"colorIdentity":["W"],"keywords":["Enchant"],"imageUrl":"https://cards.scryfall.io/normal/front/8/4/845b0be1-4f85-4a8c-8205-dc85c8cf9a61.jpg?1783902965","artUrl":"https://cards.scryfall.io/art_crop/front/8/4/845b0be1-4f85-4a8c-8205-dc85c8cf9a61.jpg?1783902965","commanderLegal":"legal","set":"msh","releasedAt":"2026-06-26","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const egg = (): CardDef => ({"oracleId":"7493d78c-26c4-402e-bec5-6449773d0344","name":"Smoldering Egg // Ashmouth Dragon","manaCost":"{1}{R}","cmc":2,"typeLine":"Creature — Dragon Egg // Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon","Egg"],"oracleText":"Defender\nWhenever you cast an instant or sorcery spell, put a number of ember counters on this creature equal to the amount of mana spent to cast that spell. Then if this creature has seven or more ember counters on it, remove them and transform this creature.","power":"0","toughness":"4","colors":["R"],"colorIdentity":["R"],"keywords":["Flying","Transform","Defender"],"imageUrl":"https://cards.scryfall.io/normal/front/8/f/8ffb9873-4fb1-4644-9dd9-f2eb5f9617ac.jpg?1783924389","artUrl":"https://cards.scryfall.io/art_crop/front/8/f/8ffb9873-4fb1-4644-9dd9-f2eb5f9617ac.jpg?1783924389","commanderLegal":"legal","set":"dbl","releasedAt":"2022-01-28","rarity":"rare","layout":"transform","gameChanger":false,"faces":[{"name":"Smoldering Egg","manaCost":"{1}{R}","typeLine":"Creature — Dragon Egg","supertypes":[],"types":["Creature"],"subtypes":["Dragon","Egg"],"oracleText":"Defender\nWhenever you cast an instant or sorcery spell, put a number of ember counters on this creature equal to the amount of mana spent to cast that spell. Then if this creature has seven or more ember counters on it, remove them and transform this creature.","power":"0","toughness":"4","colors":["R"],"imageUrl":"https://cards.scryfall.io/normal/front/8/f/8ffb9873-4fb1-4644-9dd9-f2eb5f9617ac.jpg?1783924389","artUrl":"https://cards.scryfall.io/art_crop/front/8/f/8ffb9873-4fb1-4644-9dd9-f2eb5f9617ac.jpg?1783924389"},{"name":"Ashmouth Dragon","manaCost":"","typeLine":"Creature — Dragon","supertypes":[],"types":["Creature"],"subtypes":["Dragon"],"oracleText":"Flying\nWhenever you cast an instant or sorcery spell, this creature deals 2 damage to any target.","power":"4","toughness":"4","colors":["R"],"colorIndicator":["R"],"imageUrl":"https://cards.scryfall.io/normal/back/8/f/8ffb9873-4fb1-4644-9dd9-f2eb5f9617ac.jpg?1783924389","artUrl":"https://cards.scryfall.io/art_crop/back/8/f/8ffb9873-4fb1-4644-9dd9-f2eb5f9617ac.jpg?1783924389"}]} as CardDef);
const taii = (): CardDef => ({"oracleId":"17327d50-be12-423d-9d37-d6bae519f50c","name":"Taii Wakeen, Perfect Shot","manaCost":"{R}{W}","cmc":2,"typeLine":"Legendary Creature — Human Mercenary","supertypes":["Legendary"],"types":["Creature"],"subtypes":["Human","Mercenary"],"oracleText":"Whenever a source you control deals noncombat damage to a creature equal to that creature's toughness, draw a card.\n{X}, {T}: If a source you control would deal noncombat damage to a permanent or player this turn, it deals that much damage plus X instead.","power":"2","toughness":"3","colors":["R","W"],"colorIdentity":["R","W"],"keywords":[],"imageUrl":"https://cards.scryfall.io/normal/front/1/6/1643af0b-fcbf-4636-8c50-77ec77eaa34d.jpg?1783911784","artUrl":"https://cards.scryfall.io/art_crop/front/1/6/1643af0b-fcbf-4636-8c50-77ec77eaa34d.jpg?1783911784","commanderLegal":"legal","set":"otj","releasedAt":"2024-04-19","rarity":"rare","layout":"normal","gameChanger":false} as CardDef);
const cradle = card("Gaea's Cradle", "Legendary Land", "", { oracleText: "{T}: Add {G} for each creature you control." });
const shock = card("Shock", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Shock deals 2 damage to any target." });
const divination = card("Divination", "Sorcery", "{2}{U}", { cmc: 3, colors: ["U"], oracleText: "Draw two cards." });
const boneSaw = card("Bone Saw", "Artifact — Equipment", "{0}", { oracleText: "Equipped creature gets +1/+0.\nEquip {1}" });
const shovel = card("Shovel", "Artifact — Equipment", "{1}", { cmc: 1, oracleText: "Equipped creature gets +0/+1.\nEquip {1}" });

describe("round 323", () => {
  it("are fully supported", () => supported(overabundance(), gremlin(), overseer(), nightSoil(), serum(), egg(), taii()));
});

describe("round 323: Overabundance and Barbflare Gremlin", () => {
  it("Overabundance: one more mana of the land's type, and 1 damage to the player who tapped it, opponents too", () => {
    const { s: s0, ap, opp } = setup([]);
    putOnBattlefield(s0, ap, overabundance());
    const f = s0.battlefield.find((id) => s0.objects[id]!.controller === ap && characteristics(s0, s0.objects[id]!).name === "Forest")!;
    const of = putOnBattlefield(s0, opp, forest);
    const life = s0.players[ap]!.life;
    let s = act(s0, { type: "activateMana", player: ap, objectId: f, mana: "G" });
    expect(pool(s, ap)).toEqual({ G: 2 });
    expect(s.players[ap]!.life).toBe(life - 1);
    // The opponent, once they have priority.
    const theirs = s.players[opp]!.life;
    s = act(s, { type: "passPriority", player: ap });
    s = act(s, { type: "activateMana", player: opp, objectId: of, mana: "G" });
    expect(pool(s, opp)).toEqual({ G: 2 });
    expect(s.players[opp]!.life).toBe(theirs - 1);
    expect(s.players[ap]!.life).toBe(life - 1);
  });

  it("Overabundance: the damage even when the land made no mana (rulings)", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, overabundance());
    const c = putOnBattlefield(s0, ap, cradle);
    const life = s0.players[ap]!.life;
    const s = act(s0, { type: "activateMana", player: ap, objectId: c, mana: "G" });
    expect(pool(s, ap)).toEqual({});
    expect(s.players[ap]!.life).toBe(life - 1);
  });

  it("Overabundance pays for a spell, the damage dealt as the land is tapped", () => {
    const { s: s0, ap, ids } = setup([divination]);
    putOnBattlefield(s0, ap, overabundance());
    const lands = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && characteristics(s0, s0.objects[id]!).name === "Island").slice(0, 2);
    only(s0, ap, lands);
    const life = s0.players[ap]!.life;
    const s = run(s0, planCast(s0, ap, ids[0]!));
    expect(s.stack.at(-1)?.kind).toBe("spell");
    expect(s.players[ap]!.life).toBe(life - 2);
  });

  it("Barbflare Gremlin: only while it's tapped; then the land deals 1 damage to the player who tapped it", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, opp, gremlin());
    const lands = s0.battlefield.filter((id) => s0.objects[id]!.controller === ap && characteristics(s0, s0.objects[id]!).name === "Forest");
    const life = s0.players[ap]!.life;
    let s = act(s0, { type: "activateMana", player: ap, objectId: lands[0]!, mana: "G" });
    expect(pool(s, ap)).toEqual({ G: 1 });
    expect(s.players[ap]!.life).toBe(life);
    s.objects[g]!.tapped = true;
    s = act(s, { type: "activateMana", player: ap, objectId: lands[1]!, mana: "G" });
    expect(pool(s, ap)).toEqual({ G: 3 });
    expect(s.players[ap]!.life).toBe(life - 1);
    expect(logged(s, /Forest deals 1 damage/)).toBe(true);
    expect(s.players[opp]!.life).toBe(40);
  });
});

describe("round 323: Overseer of Vault 76", () => {
  const scene = (onOverseer: number, onRock: number) => {
    const { s, ap } = setup([]);
    const o = putOnBattlefield(s, ap, overseer());
    s.objects[o]!.counters.quest = onOverseer;
    const rock = putOnBattlefield(s, ap, card("Quest Rock", "Artifact", "{2}", { cmc: 2 }));
    s.objects[rock]!.counters.quest = onRock;
    const b = putOnBattlefield(s, ap, bear("Vault Bear"));
    invalidateCharacteristics(s);
    return { s, ap, o, rock, b };
  };

  it("you may remove exactly three quest counters from among permanents you control; when you do, +1/+1 counters and vigilance", () => {
    const { s: s0, ap, o, rock, b } = scene(2, 2);
    let s = settle(passUntil(s0, "beginCombat"), ap);
    expect(s.pending).toMatchObject({ kind: "chooseMay", player: ap });
    s = settle(act(s, { type: "chooseMay", player: ap, yes: true }), ap);
    expect(s.pending).toMatchObject({ kind: "distribute", player: ap, total: 3, remove: true, exact: true });
    expect(() => act(s, { type: "distribute", player: ap, parts: { [o]: 2 } })).toThrow(/exactly 3/);
    s = settle(act(s, { type: "distribute", player: ap, parts: { [o]: 1, [rock]: 2 } }), ap);
    expect(s.objects[o]!.counters.quest).toBe(1);
    expect(s.objects[rock]!.counters.quest ?? 0).toBe(0);
    for (const id of [o, b]) {
      expect(s.objects[id]!.counters["+1/+1"]).toBe(1);
      expect(characteristics(s, s.objects[id]!).keywords).toContain("Vigilance");
    }
  });

  it("with fewer than three quest counters it can't be done: no question, nothing happens", () => {
    const { s: s0, ap, o, b } = scene(1, 1);
    const s = settle(passUntil(s0, "beginCombat"), ap);
    expect(s.pending).toBeNull();
    expect(s.objects[o]!.counters.quest).toBe(1);
    expect(s.objects[b]!.counters["+1/+1"] ?? 0).toBe(0);
  });

  it("First Contact: a quest counter for it and each other creature with power 3 or less entering", () => {
    const { s: s0, ap, ids } = setup([bear("Small Bear")]);
    const o = putOnBattlefield(s0, ap, overseer());
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.objects[o]!.counters.quest).toBe(1);
  });
});

describe("round 323: Night Soil", () => {
  it("exile two creature cards from a single graveyard, an opponent's too: a Saproling", () => {
    const { s: s0, ap, opp } = setup([]);
    const soil = putOnBattlefield(s0, ap, nightSoil());
    const [a, b] = [inYard(s0, opp, bear("Their Bear A")), inYard(s0, opp, bear("Their Bear B"))];
    const mine = inYard(s0, ap, bear("My Bear"));
    inYard(s0, opp, card("Their Land", "Land"));
    // Not from two graveyards, and not a noncreature card.
    expect(planActivate(s0, ap, soil, 0, [], undefined, undefined, undefined, { exileCards: [a, mine] })).toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, soil, 0, [], undefined, undefined, undefined, { exileCards: [a, b] })), ap);
    expect([a, b].map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile"]);
    expect(s.battlefield.some((id) => characteristics(s, s.objects[id]!).name === "Saproling Token")).toBe(true);
    expect(logged(s, new RegExp(`exiles Their Bear A, Their Bear B from ${s.players[opp]!.name}'s graveyard`))).toBe(true);
  });

  it("can't be activated without two creature cards in one graveyard (rulings)", () => {
    const { s, ap, opp } = setup([]);
    const soil = putOnBattlefield(s, ap, nightSoil());
    inYard(s, opp, bear("Their Bear"));
    inYard(s, ap, bear("My Bear"));
    expect(abilityProblem(s, ap, soil, 0)).toMatch(/2 creature cards from a single graveyard/);
  });

  it("a bot exiles an opponent's creature cards", () => {
    const { s: s0, ap, opp } = setup([]);
    const soil = putOnBattlefield(s0, opp, nightSoil());
    const theirs = [inYard(s0, ap, bear("Ken's Bear A")), inYard(s0, ap, bear("Ken's Bear B"))];
    inYard(s0, opp, bear("Bot Bear A"));
    inYard(s0, opp, bear("Bot Bear B"));
    putOnBattlefield(s0, opp, forest);
    // Nothing else to spend the mana on: no commander, no cards in hand.
    s0.players[opp]!.command = [];
    for (const id of s0.players[opp]!.hand) s0.objects[id]!.zone = "library";
    s0.players[opp]!.library.push(...s0.players[opp]!.hand);
    s0.players[opp]!.hand = [];
    invalidateCharacteristics(s0);
    let s = s0;
    for (let i = 0; i < 400 && !theirs.every((id) => s.objects[id]!.zone === "exile") && s.turn < s0.turn + 3; i++) {
      const p = s.pending;
      if (p?.kind === "declareAttackers") s = act(s, { type: "declareAttackers", player: p.player, attacks: [] });
      else if (p?.kind === "declareBlockers") s = act(s, { type: "declareBlockers", player: p.player, blocks: [] });
      else if (p) s = act(s, botActions(s, p.player)[0]!);
      else if (waitingOn(s) === opp && s.activePlayer === opp) s = act(s, botActions(s, opp)[0]!);
      else s = act(s, { type: "passPriority", player: waitingOn(s)! });
    }
    expect(theirs.map((id) => s.objects[id]!.zone)).toEqual(["exile", "exile"]);
    void soil;
  });
});

describe("round 323: Super-Soldier Serum", () => {
  it("enchanted creature gets +2/+2, first strike and vigilance, and is a legendary Soldier", () => {
    const { s, ap } = setup([]);
    const b = putOnBattlefield(s, ap, bear("Serum Bear"));
    const a = putOnBattlefield(s, ap, serum());
    s.objects[a]!.attachedTo = b;
    invalidateCharacteristics(s);
    const c = characteristics(s, s.objects[b]!);
    expect([c.power, c.toughness]).toEqual([4, 4]);
    expect(c.keywords).toEqual(expect.arrayContaining(["First strike", "Vigilance"]));
    expect(c.supertypes).toContain("Legendary");
    expect(c.subtypes).toEqual(expect.arrayContaining(["Bear", "Soldier"]));
  });

  it("whenever it attacks, any number of target Equipment you control become attached to it", () => {
    const { s: s0, ap, opp } = setup([]);
    const b = putOnBattlefield(s0, ap, bear("Serum Bear"));
    const other = putOnBattlefield(s0, ap, bear("Other Bear"));
    const a = putOnBattlefield(s0, ap, serum());
    s0.objects[a]!.attachedTo = b;
    const saw = putOnBattlefield(s0, ap, boneSaw);
    const sh = putOnBattlefield(s0, ap, shovel);
    s0.objects[sh]!.attachedTo = other;
    invalidateCharacteristics(s0);
    let s = passUntil(s0, "declareAttackers");
    s = settle(act(s, { type: "declareAttackers", player: ap, attacks: [{ attacker: b, defender: opp }] }), ap);
    expect(s.pending).toMatchObject({ kind: "chooseTargets", player: ap });
    s = settle(act(s, { type: "chooseTargets", player: ap, targets: [target(saw), target(sh)] }), ap);
    expect(s.objects[saw]!.attachedTo).toBe(b);
    expect(s.objects[sh]!.attachedTo).toBe(b);
    const c = characteristics(s, s.objects[b]!);
    expect([c.power, c.toughness]).toEqual([5, 5]);
  });
});

describe("round 323: Smoldering Egg", () => {
  it("ember counters equal to the mana spent on an instant or sorcery; at seven, they're removed and it transforms", () => {
    const { s: s0, ap, ids } = setup([divination, shock]);
    const e = putOnBattlefield(s0, ap, egg());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)), ap);
    expect(s.objects[e]!.counters.ember).toBe(3);
    s.objects[e]!.counters.ember = 6;
    s = settle(run(s, planCast(s, ap, ids[1]!, [{ kind: "player", id: s.turnOrder[1]! }])), ap);
    expect(s.objects[e]!.counters.ember ?? 0).toBe(0);
    expect(characteristics(s, s.objects[e]!).name).toBe("Ashmouth Dragon");
  });
});

describe("round 323: Taii Wakeen, Perfect Shot", () => {
  it("noncombat damage from a source you control equal to a creature's toughness draws a card, damage already on it not counting", () => {
    const { s: s0, ap, opp, ids } = setup([shock, card("Shock Two", "Instant", "{R}", { cmc: 1, colors: ["R"], oracleText: "Shock Two deals 2 damage to any target." })]);
    putOnBattlefield(s0, ap, taii());
    const small = putOnBattlefield(s0, opp, bear("Small Bear"));
    const big = putOnBattlefield(s0, opp, card("Big Bear", "Creature — Bear", "{2}{G}", { cmc: 3, power: "3", toughness: "3" }));
    s0.objects[small]!.damage = 1;
    const hand = s0.players[ap]!.hand.length;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [target(big)])), ap);
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
    s = settle(run(s, planCast(s, ap, ids[1]!, [target(small)])), ap);
    expect(s.objects[small]!.zone).toBe("graveyard");
    expect(s.players[ap]!.hand.length).toBe(hand - 1);
  });

  it("{X}, {T}: this turn, noncombat damage from a source you control is that much plus X", () => {
    const { s: s0, ap, opp, ids } = setup([shock]);
    const t = putOnBattlefield(s0, ap, taii());
    let s = settle(run(s0, planActivate(s0, ap, t, 0, [], undefined, undefined, 2)), ap);
    const life = s.players[opp]!.life;
    s = settle(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])), ap);
    expect(s.players[opp]!.life).toBe(life - 4);
  });
});
