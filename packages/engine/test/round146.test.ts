// Round 146: the most played cards, in popularity order, starting with Evendo Brushrazer.

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, mountain, passUntil, pt, putOnBattlefield, setup, swamp } from "./helpers";
import { abilitiesOf, botActions, characteristics, compileCard, invalidateCharacteristics, isFullySupported, loseLife, moveObject, objIsType, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Everyone passes until the stack is empty or something asks a player to choose. */
const resolveAll = (s: GameState) => {
  for (let i = 0; i < 60 && !s.pending && (s.stack.length || s.triggerQueue.length); i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  return s;
};
/** A card put straight into a zone, not from the battlefield. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "hand" | "exile" | "library") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else if (zone !== "exile") s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
const player = (id: PlayerId): TargetChoice => ({ kind: "player", id });
const obj = (id: string): TargetChoice => ({ kind: "object", id });

// Real oracle text (Scryfall).
const banefire = card("Banefire", "Sorcery", "{X}{R}", { oracleText: "Banefire deals X damage to any target.\nIf X is 5 or more, this spell can't be countered and the damage can't be prevented." });
const urzasArmor = card("Urza's Armor", "Artifact", "{6}", { oracleText: "If a source would deal damage to you, prevent 1 of that damage." });
const cancel = card("Cancel", "Instant", "{1}{U}{U}", { oracleText: "Counter target spell." });

describe("Banefire", () => {
  const castAt = (x: number) => {
    const { s: s0, ap, opp, ids } = setup([banefire]);
    putOnBattlefield(s0, opp, urzasArmor);
    const c = into(s0, opp, cancel, "hand");
    let s = run(s0, planCast(s0, ap, ids[0]!, [player(opp)], undefined, undefined, x));
    // Each player passes until the opponent with Cancel has priority, who counters it.
    while (waitingOn(s) !== opp) s = act(s, { type: "passPriority", player: waitingOn(s)! });
    s.players[opp]!.manaPool.U = 3;
    s = run(s, planCast(s, opp, c, [{ kind: "stack", id: s.stack[0]!.id } as TargetChoice]));
    return { s: resolveAll(s), ap, opp, id: ids[0]! };
  };

  it("is fully supported; with X 5 or more it can't be countered and the damage can't be prevented", () => {
    supported(banefire);
    const { s, opp } = castAt(5);
    expect(s.players[opp]!.life).toBe(35);
  });

  it("with X less than 5, it can be countered, and the damage can be prevented", () => {
    const { s, opp, id } = castAt(4);
    expect(s.players[opp]!.life).toBe(40);
    expect(s.objects[id]!.zone).toBe("graveyard");
    // Not countered: Urza's Armor prevents 1.
    const { s: s0, ap, opp: o2, ids } = setup([banefire]);
    putOnBattlefield(s0, o2, urzasArmor);
    const t = resolveAll(run(s0, planCast(s0, ap, ids[0]!, [player(o2)], undefined, undefined, 4)));
    expect(t.players[o2]!.life).toBe(37);
  });
});

const emberwilde = card("Emberwilde Captain", "Creature — Djinn Pirate", "{3}{R}", { power: "4", toughness: "3", oracleText: "When this creature enters, you become the monarch.\nWhenever an opponent attacks you while you're the monarch, this creature deals damage to that player equal to the number of cards in their hand." });

describe("Emberwilde Captain", () => {
  it("is fully supported; an opponent attacking you while you're the monarch is dealt damage equal to the cards in their hand", () => {
    supported(emberwilde);
    const { s: s0, ap, ids } = setup([emberwilde]);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.monarch).toBe(ap);
    const next = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    const attacker = putOnBattlefield(s, next, bear());
    s = passUntil(s, "declareAttackers", next);
    const hand = s.players[next]!.hand.length;
    expect(hand).toBeGreaterThan(0);
    s = act(s, { type: "declareAttackers", player: next, attacks: [{ attacker, defender: ap }] });
    s = resolveAll(s);
    expect(s.players[next]!.life).toBe(40 - hand);
  });

  it("doesn't trigger when you aren't the monarch", () => {
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, emberwilde);
    const next = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 1) % 4]!;
    s0.monarch = next;
    const attacker = putOnBattlefield(s0, next, bear());
    let s = passUntil(s0, "declareAttackers", next);
    s = resolveAll(act(s, { type: "declareAttackers", player: next, attacks: [{ attacker, defender: ap }] }));
    expect(s.players[next]!.life).toBe(40);
  });
});

const contract = card("Liliana's Contract", "Enchantment", "{3}{B}{B}", { oracleText: "When this enchantment enters, you draw four cards and you lose 4 life.\nAt the beginning of your upkeep, if you control four or more Demons with different names, you win the game." });
const demon = (name: string) => card(name, "Creature — Demon", "{3}{B}", { power: "4", toughness: "4" });

describe("Liliana's Contract", () => {
  it("is fully supported; four Demons with different names at the beginning of your upkeep win the game", () => {
    supported(contract);
    const { s: s0, ap } = setup([]);
    putOnBattlefield(s0, ap, contract);
    for (const n of ["Demon A", "Demon B", "Demon C"]) putOnBattlefield(s0, ap, demon(n));
    // Three different names and a second Demon A: not enough.
    putOnBattlefield(s0, ap, demon("Demon A"));
    let s = passUntil(s0, "upkeep", ap, 4000);
    s = resolveAll(s);
    expect(s.over).toBeFalsy();
    putOnBattlefield(s, ap, demon("Demon D"));
    s = resolveAll(passUntil(passUntil(s, "main1", ap, 4000), "upkeep", ap, 4000));
    expect(s.winner).toBe(ap);
  });
});

const squeak = card("Sword of the Squeak", "Artifact — Equipment", "{2}", { oracleText: "Equipped creature gets +1/+1 for each creature you control with base power or toughness 1.\nWhenever a Hamster, Mouse, Rat, or Squirrel you control enters, you may attach this Equipment to that creature.\nEquip {2}" });

describe("Sword of the Squeak", () => {
  it("is fully supported; counts creatures you control with base power or base toughness 1, not modified power", () => {
    supported(squeak);
    const { s: s0, ap, opp } = setup([]);
    const big = putOnBattlefield(s0, ap, bear());
    const sword = putOnBattlefield(s0, ap, squeak);
    s0.objects[sword]!.attachedTo = big;
    putOnBattlefield(s0, ap, card("Test Mouse", "Creature — Mouse", "{W}", { power: "1", toughness: "1" }));
    putOnBattlefield(s0, ap, card("Test Wall", "Creature — Wall", "{W}", { power: "0", toughness: "1" }));
    const pumped = putOnBattlefield(s0, ap, card("Test Elf", "Creature — Elf", "{G}", { power: "1", toughness: "2" }));
    putOnBattlefield(s0, opp, card("Their Mouse", "Creature — Mouse", "{W}", { power: "1", toughness: "1" }));
    invalidateCharacteristics(s0);
    expect(pt(s0, big)).toBe("5/5");
    // A +1/+1 counter doesn't change base power: still counted.
    s0.objects[pumped]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s0);
    expect(pt(s0, big)).toBe("5/5");
  });
});

const dion = card("Dion, Bahamut's Dominant", "Legendary Creature — Human Noble Knight", "{3}{W}", { power: "3", toughness: "3", oracleText: "Dragonfire Dive — During your turn, Dion and other Knights you control have flying.\nWhen Dion enters, create a 2/2 white Knight creature token." });

describe("Dion, Bahamut's Dominant", () => {
  it("during your turn, Dion and other Knights you control have flying", () => {
    expect(compileCard(dion).unsupported).toEqual([]);
    const { s: s0, ap, opp } = setup([]);
    const d = putOnBattlefield(s0, ap, dion);
    const k = putOnBattlefield(s0, ap, card("Test Knight", "Creature — Human Knight", "{W}", { power: "2", toughness: "2" }));
    const theirs = putOnBattlefield(s0, opp, card("Their Knight", "Creature — Human Knight", "{W}", { power: "2", toughness: "2" }));
    const flies = (s: GameState, id: string) => characteristics(s, s.objects[id]!).keywords.includes("Flying");
    expect([flies(s0, d), flies(s0, k), flies(s0, theirs)]).toEqual([true, true, false]);
    const s = passUntil(s0, "main1", opp);
    expect([flies(s, d), flies(s, k)]).toEqual([false, false]);
  });
});

const beacon = card("Interplanar Beacon", "Land", "", { oracleText: "Whenever you cast a planeswalker spell, you gain 1 life.\n{T}: Add {C}.\n{1}, {T}: Add two mana of different colors. Spend this mana only to cast planeswalker spells." });

describe("Interplanar Beacon", () => {
  it("is fully supported; {1}, {T} adds one of the ten pairs of different colors, only for planeswalker spells", () => {
    supported(beacon);
    const { s: s0, ap } = setup([]);
    const b = putOnBattlefield(s0, ap, beacon);
    const ab = abilitiesOf(s0, s0.objects[b]!).mana[1]!;
    expect(ab.produces).toMatchObject({ kind: "combos" });
    expect((ab.produces as { options: string[][] }).options).toHaveLength(10);
    expect((ab.produces as { options: string[][] }).options.every((o) => o.length === 2 && o[0] !== o[1])).toBe(true);
    expect(ab.spendOnly?.spells).toMatchObject({ types: ["Planeswalker"] });
  });
});

const scroll = card("Scroll of Fate", "Artifact", "{3}", { oracleText: "{T}: Manifest a card from your hand. (Put that card onto the battlefield face down as a 2/2 creature. Turn it face up any time for its mana cost if it's a creature card.)" });

describe("Scroll of Fate", () => {
  it("is fully supported; {T}: a card you choose from your hand enters face down as a 2/2", () => {
    supported(scroll);
    const ogre = card("Gray Ogre", "Creature — Ogre", "{2}{R}", { power: "2", toughness: "2" });
    const { s: s0, ap, ids } = setup([ogre, forest]);
    const sc = putOnBattlefield(s0, ap, scroll);
    let s = resolveAll(run(s0, planActivate(s0, ap, sc, 0)));
    expect(s.pending).toMatchObject({ kind: "searchLibrary", player: ap, fromHand: true, manifest: true, min: 1, max: 1 });
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [ids[1]!] }));
    expect(s.objects[ids[1]!]!.zone).toBe("battlefield");
    expect(s.objects[ids[1]!]!.faceDown).toBe("manifest");
    expect(pt(s, ids[1]!)).toBe("2/2");
    expect(s.objects[ids[0]!]!.zone).toBe("hand");
  });
});

const afterlife = card("Afterlife from the Loam", "Sorcery", "{5}{B}{B}{B}", { keywords: ["Delve"], oracleText: "Delve (Each card you exile from your graveyard while casting this spell pays for {1}.)\nFor each player, choose up to one target creature card in that player's graveyard. Put those cards onto the battlefield under your control. They're Zombies in addition to their other types." });

describe("Afterlife from the Loam", () => {
  it("is fully supported; up to one creature card from each player's graveyard, yours too, enters under your control as a Zombie", () => {
    supported(afterlife);
    const { s: s0, ap, opp, ids } = setup([afterlife]);
    const mine = into(s0, ap, bear({ name: "My Bear" }), "graveyard");
    const theirs = into(s0, opp, card("Their Ogre", "Creature — Ogre", "{2}{R}", { power: "2", toughness: "2" }), "graveyard");
    const third = s0.turnOrder[(s0.turnOrder.indexOf(ap) + 2) % 4]!;
    const notCreature = into(s0, third, card("Their Shock", "Instant", "{R}", { oracleText: "Shock deals 2 damage to any target." }), "graveyard");
    // One target in each graveyard, yours first; a noncreature card can't be chosen.
    expect(planCast(s0, ap, ids[0]!, [obj(mine), obj(notCreature), { kind: "none" }, { kind: "none" }])).toBeNull();
    expect(planCast(s0, ap, ids[0]!, [obj(theirs), { kind: "none" }, { kind: "none" }, { kind: "none" }])).toBeNull();
    const targets: TargetChoice[] = s0.turnOrder.map((_, i) => ({ kind: "none" }) as TargetChoice);
    const seat = (pid: PlayerId) => [ap, ...s0.turnOrder.slice(s0.turnOrder.indexOf(ap) + 1), ...s0.turnOrder.slice(0, s0.turnOrder.indexOf(ap))].indexOf(pid);
    targets[seat(ap)] = obj(mine);
    targets[seat(opp)] = obj(theirs);
    putOnBattlefield(s0, ap, swamp);
    const s = resolveAll(run(s0, planCast(s0, ap, ids[0]!, targets)));
    for (const id of [mine, theirs]) {
      expect(s.objects[id]!.zone).toBe("battlefield");
      expect(s.objects[id]!.controller).toBe(ap);
      expect(characteristics(s, s.objects[id]!).subtypes).toContain("Zombie");
    }
    expect(s.objects[notCreature]!.zone).toBe("graveyard");
  });
});

const cosmic = card("Cosmic Intervention", "Instant", "{3}{W}", { keywords: ["Foretell"], oracleText: "If a permanent you control would be put into a graveyard from the battlefield this turn, exile it instead. Return it to the battlefield under its owner's control at the beginning of the next end step.\nForetell {1}{W} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)" });
const wrath = card("Wrath of God", "Sorcery", "{2}{W}{W}", { oracleText: "Destroy all creatures. They can't be regenerated." });

describe("Cosmic Intervention", () => {
  it("is fully supported; your permanents are exiled instead, each returns at the next end step, tokens don't, others' die", () => {
    supported(cosmic);
    const { s: s0, ap, opp, ids } = setup([cosmic, wrath]);
    const mine = putOnBattlefield(s0, ap, bear({ name: "My Bear" }));
    const theirs = putOnBattlefield(s0, opp, bear({ name: "Their Bear" }));
    const stolen = putOnBattlefield(s0, opp, bear({ name: "Borrowed Bear" }));
    s0.objects[stolen]!.controller = ap; // controlled by us, owned by them
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    const token = putOnBattlefield(s, ap, bear({ name: "Token Bear" }));
    s.objects[token]!.isToken = true;
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(s.objects[mine]!.zone).toBe("exile");
    expect(s.objects[stolen]!.zone).toBe("exile");
    expect(s.objects[theirs]!.zone).toBe("graveyard");
    expect(s.objects[token]?.zone === "battlefield").toBe(false);
    s = passUntil(s, "end", ap);
    s = resolveAll(s);
    expect(s.objects[mine]!.zone).toBe("battlefield");
    expect(s.objects[mine]!.controller).toBe(ap);
    // Under its owner's control.
    expect(s.objects[stolen]!.zone).toBe("battlefield");
    expect(s.objects[stolen]!.controller).toBe(opp);
    // Next turn, a creature dying goes to the graveyard as usual.
    s = passUntil(s, "main1", opp);
    const later = putOnBattlefield(s, ap, bear({ name: "Later Bear" }));
    s.objects[later]!.damage = 5;
    invalidateCharacteristics(s);
    s = act(s, { type: "passPriority", player: waitingOn(s)! });
    expect(s.objects[later]!.zone).toBe("graveyard");
  });
});

const evendo = card("Evendo Brushrazer", "Creature — Insect Warrior", "{2}{R}", { power: "3", toughness: "2", oracleText: "Whenever you sacrifice a nontoken permanent, exile the top card of your library.\nDuring your turn, as long as you've sacrificed a nontoken permanent this turn, you may play cards exiled with this creature.\n{T}, Sacrifice a land: Add {R}{R}." });

describe("Evendo Brushrazer", () => {
  it("is fully supported; sacrificing a nontoken permanent exiles the top card, playable during your turn after that sacrifice", () => {
    supported(evendo);
    const { s: s0, ap } = setup([]);
    const e = putOnBattlefield(s0, ap, evendo);
    const top = into(s0, ap, card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." }), "library");
    const land = s0.battlefield.find((id) => objIsType(s0, s0.objects[id]!, "Land"))!;
    const i = abilitiesOf(s0, s0.objects[e]!).activated.findIndex((a) => a.mana);
    let s = resolveAll(act(s0, { type: "activateAbility", player: ap, objectId: e, index: i, costs: { sacrifice: [land] } }));
    expect(s.objects[top]!.zone).toBe("exile");
    expect(s.players[ap]!.manaPool.R).toBeGreaterThanOrEqual(2);
    // Playable now: you've sacrificed a nontoken permanent this turn.
    expect(planCast(s, ap, top, [player(s.turnOrder.find((p) => p !== ap)!)])).not.toBeNull();
    // Not during another player's turn.
    const opp = s.turnOrder[(s.turnOrder.indexOf(ap) + 1) % 4]!;
    const t = passUntil(s, "main1", opp);
    expect(planCast(t, ap, top, [player(opp)])).toBeNull();
    // Your next turn: no nontoken permanent sacrificed yet that turn, so not playable.
    const u = passUntil(t, "main1", ap, 4000);
    expect(s.objects[top]!.zone).toBe("exile");
    expect(planCast(u, ap, top, [player(opp)])).toBeNull();
  });

  it("sacrificing a token doesn't trigger it or count for playing the cards", () => {
    const { s: s0, ap } = setup([]);
    const e = putOnBattlefield(s0, ap, evendo);
    const top = into(s0, ap, card("Test Shock", "Instant", "{R}", { oracleText: "Test Shock deals 2 damage to any target." }), "library");
    const token = putOnBattlefield(s0, ap, forest);
    s0.objects[token]!.isToken = true;
    const i = abilitiesOf(s0, s0.objects[e]!).activated.findIndex((a) => a.mana);
    const s = resolveAll(act(s0, { type: "activateAbility", player: ap, objectId: e, index: i, costs: { sacrifice: [token] } }));
    expect(s.objects[top]!.zone).toBe("library");
    expect(s.turnLog?.sacrificed?.[0]).toMatchObject({ player: ap, token: true });
  });
});

const calamity = card("Invoke Calamity", "Instant", "{1}{R}{R}{R}{R}", { oracleText: "You may cast up to two instant and/or sorcery spells with total mana value 6 or less from your graveyard and/or hand without paying their mana costs. If those spells would be put into your graveyard, exile them instead. Exile Invoke Calamity." });
const divination = card("Divination", "Sorcery", "{2}{U}", { oracleText: "Draw two cards." });
const blaze = card("Lava Axe", "Sorcery", "{4}{R}", { oracleText: "Lava Axe deals 5 damage to target player or planeswalker." });
const zap = card("Test Zap", "Instant", "{1}{R}", { oracleText: "Test Zap deals 2 damage to any target." });

describe("Invoke Calamity", () => {
  it("is fully supported; up to two instants and sorceries from your hand and graveyard, total mana value 6 or less, exiled after", () => {
    supported(calamity);
    const { s: s0, ap, opp, ids } = setup([calamity, divination, blaze]);
    const yard = into(s0, ap, zap, "graveyard");
    const ogre = into(s0, ap, bear({ name: "Hand Bear" }), "hand");
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, ap, mountain);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    expect(s.pending).toMatchObject({ kind: "chooseOption", player: ap, what: "castFromAmong" });
    // Only instants and sorceries: not the creature card.
    const opts = (s.pending as { options: string[] }).options;
    expect(opts).toEqual(expect.arrayContaining([ids[1]!, ids[2]!, yard, "none"]));
    expect(opts).not.toContain(ogre);
    // Lava Axe (5) first: then only a spell with mana value 1 or less fits, so neither Divination (3) nor Test Zap (2).
    s = act(s, { type: "chooseOption", player: ap, choice: ids[2]! });
    expect(s.pending?.kind).toBe("castFree");
    s = run(s, planCast(s, ap, ids[2]!, [player(opp)]));
    expect(s.pending).toBeNull();
    s = resolveAll(s);
    expect(s.players[opp]!.life).toBe(35);
    expect(s.objects[ids[2]!]!.zone).toBe("exile");
    expect(s.objects[ids[0]!]!.zone).toBe("exile");
    expect(s.objects[ids[1]!]!.zone).toBe("hand");
  });

  it("casts a card from the graveyard, then a second; both are exiled when they resolve", () => {
    const { s: s0, ap, opp, ids } = setup([calamity, divination]);
    const yard = into(s0, ap, zap, "graveyard");
    for (let i = 0; i < 2; i++) putOnBattlefield(s0, ap, mountain);
    let s = resolveAll(run(s0, planCast(s0, ap, ids[0]!)));
    s = act(s, { type: "chooseOption", player: ap, choice: yard });
    s = run(s, planCast(s, ap, yard, [player(opp)]));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "castFromAmong" });
    expect((s.pending as { prompt: string }).prompt).toMatch(/total mana value 4 left/);
    s = act(s, { type: "chooseOption", player: ap, choice: ids[1]! });
    s = run(s, planCast(s, ap, ids[1]!));
    // The one cast second resolves first (rulings): on top, above Test Zap, above Invoke Calamity.
    expect(s.stack.map((x) => x.objectId).slice(-2)).toEqual([yard, ids[1]!]);
    const hand = s.players[ap]!.hand.length;
    s = resolveAll(s);
    expect(s.players[ap]!.hand.length).toBe(hand + 2);
    expect(s.players[opp]!.life).toBe(38);
    for (const id of [yard, ids[1]!, ids[0]!]) expect(s.objects[id]!.zone).toBe("exile");
  });
});

const yuna = card("Yuna, Hope of Spira", "Legendary Creature — Human Cleric", "{3}{G}{W}", { power: "3", toughness: "5", oracleText: "During your turn, Yuna and enchantment creatures you control have trample, lifelink, and ward {2}.\nAt the beginning of your end step, return up to one target enchantment card from your graveyard to the battlefield with a finality counter on it. (If a permanent with a finality counter on it would be put into a graveyard from the battlefield, exile it instead.)" });

describe("Yuna, Hope of Spira", () => {
  it("is fully supported; during your turn, Yuna and enchantment creatures you control have trample, lifelink and ward", () => {
    supported(yuna);
    const { s: s0, ap, opp } = setup([]);
    const y = putOnBattlefield(s0, ap, yuna);
    const ench = putOnBattlefield(s0, ap, card("Test Nymph", "Enchantment Creature — Nymph", "{1}{G}", { power: "2", toughness: "2" }));
    const plain = putOnBattlefield(s0, ap, bear());
    const kw = (s: GameState, id: string) => characteristics(s, s.objects[id]!).keywords;
    for (const id of [y, ench]) expect(kw(s0, id)).toEqual(expect.arrayContaining(["Trample", "Lifelink"]));
    expect(kw(s0, plain)).not.toContain("Trample");
    // On an opponent's turn (put onto the battlefield after the turn passes, so its end step trigger doesn't ask).
    const s = passUntil(setup([]).s, "main1", opp);
    const y2 = putOnBattlefield(s, ap, yuna);
    const e2 = putOnBattlefield(s, ap, card("Test Nymph", "Enchantment Creature — Nymph", "{1}{G}", { power: "2", toughness: "2" }));
    expect(kw(s, y2)).not.toContain("Trample");
    expect(kw(s, e2)).not.toContain("Lifelink");
  });
});

const jenova = card("Jenova, Ancient Calamity", "Legendary Creature — Alien", "{2}{B}{G}", { power: "1", toughness: "3", oracleText: "At the beginning of combat on your turn, put a number of +1/+1 counters equal to Jenova's power on up to one other target creature. That creature becomes a Mutant in addition to its other types.\nWhenever a Mutant you control dies during your turn, you draw cards equal to its power." });

describe("Jenova, Ancient Calamity", () => {
  const mutant = card("Test Mutant", "Creature — Mutant", "{1}{G}", { power: "3", toughness: "3" });

  it("is fully supported; a Mutant you control dying during your turn draws cards equal to its power", () => {
    supported(jenova);
    const { s, ap } = setup([]);
    putOnBattlefield(s, ap, jenova);
    const m = putOnBattlefield(s, ap, mutant);
    const hand = s.players[ap]!.hand.length;
    moveObject(s, m, "graveyard");
    const t = resolveAll(s);
    expect(t.players[ap]!.hand.length).toBe(hand + 3);
  });

  it("doesn't draw when the Mutant dies during another player's turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const s = passUntil(s0, "main1", opp);
    putOnBattlefield(s, ap, jenova);
    const m = putOnBattlefield(s, ap, mutant);
    const hand = s.players[ap]!.hand.length;
    moveObject(s, m, "graveyard");
    const t = resolveAll(s);
    expect(t.players[ap]!.hand.length).toBe(hand);
  });
});

const vogar = card("Vogar, Necropolis Tyrant", "Legendary Creature — Zombie Giant", "{3}{B}{B}", { power: "4", toughness: "4", oracleText: "Menace\nWhenever another creature dies during your turn, put a +1/+1 counter on Vogar.\nWhen Vogar dies, draw a card for each +1/+1 counter on it." });

describe("Vogar, Necropolis Tyrant", () => {
  it("is fully supported; another creature dying during your turn, anyone's, puts a +1/+1 counter on it; not on others' turns", () => {
    supported(vogar);
    const { s: s0, ap, opp } = setup([]);
    const v = putOnBattlefield(s0, ap, vogar);
    moveObject(s0, putOnBattlefield(s0, opp, bear()), "graveyard");
    let s = resolveAll(s0);
    expect(pt(s, v)).toBe("5/5");
    s = passUntil(s, "main1", opp);
    moveObject(s, putOnBattlefield(s, opp, bear()), "graveyard");
    s = resolveAll(s);
    expect(pt(s, v)).toBe("5/5");
  });
});

const korlis = card("Children of Korlis", "Creature — Human Rebel Cleric", "{W}", { power: "1", toughness: "1", oracleText: "Sacrifice this creature: You gain life equal to the life you've lost this turn. (Damage causes loss of life.)" });

describe("Children of Korlis", () => {
  it("is fully supported; sacrificing it gains the life you've lost this turn", () => {
    supported(korlis);
    const { s, ap } = setup([]);
    const k = putOnBattlefield(s, ap, korlis);
    loseLife(s, ap, 7);
    expect(s.players[ap]!.life).toBe(33);
    const t = resolveAll(run(s, planActivate(s, ap, k, 0)));
    expect(t.players[ap]!.life).toBe(40);
  });
});
