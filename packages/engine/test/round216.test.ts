// Round 216: Khalni Hydra, Vanish into Eternity, Nurturing Pixie, Essence Reliquary, Sneaky Snacker, Urborg Lhurgoyf, Blood
// Tyrant, Oath of Kaya, Act of Authority, Gimli, Avacyn, Seraphic Greatsword, Magitek Scythe, Systems Override, Vraska and
// others (fresh cards from EDHREC rank 14,000 on).

import { describe, expect, it } from "vitest";
import { act, bear, card, passUntil, putOnBattlefield, setup } from "./helpers";
import { abilitiesOf, applyAction, characteristics, controllerOf, dealDamage, draw, invalidateCharacteristics, isFullySupported, objectSource, objHasKeyword, planActivate, planCast, playerLoses, power, runStateBasedActions, spellCost, toughness, waitingOn, type Action, type CardDef, type GameState, type ObjectId, type PlayerId, type TargetChoice } from "../src";

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
/** Passes until a trigger asks for its targets (or the stack is empty). */
const untilTargets = (s: GameState) => {
  for (let i = 0; i < 50 && s.pending?.kind !== "chooseTargets" && (s.stack.length || s.triggerQueue.length || s.pending); i++) {
    const p = s.pending;
    if (p?.kind === "chooseMay") s = act(s, { type: "chooseMay", player: p.player, yes: true });
    else if (p) return s;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
const pt = (s: GameState, id: ObjectId) => `${power(s, s.objects[id]!)}/${toughness(s, s.objects[id]!)}`;
const zone = (s: GameState, id: ObjectId) => s.objects[id]!.zone;
const nameOf = (s: GameState, id: ObjectId) => s.cards[s.objects[id]!.cardId]!.name;
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: ObjectId; defender: PlayerId; planeswalker?: ObjectId }[]) => {
  s = passUntil(s, "declareAttackers", ap);
  return act(s, { type: "declareAttackers", player: ap, attacks });
};
const greens = (s: GameState, pid: PlayerId, n: number) => Array.from({ length: n }, (_, i) => putOnBattlefield(s, pid, card(`Green Elf ${i}`, "Creature — Elf", "{G}", { power: "1", toughness: "1" })));
const walker = (name: string) => card(name, "Legendary Planeswalker — Test", "{3}", { loyalty: "5", oracleText: "+1: You gain 1 life." });
const emptyHands = (s: GameState) => s.players.forEach((p) => p.hand.splice(0).forEach((id) => (s.objects[id]!.zone = "exile")));

// Real oracle text (Scryfall).
const khalniHydra = card("Khalni Hydra", "Creature — Hydra", "{G}{G}{G}{G}{G}{G}{G}{G}", {"cmc":8,"oracleText":"This spell costs {G} less to cast for each green creature you control.\nTrample","power":"8","toughness":"8","keywords":["Trample"]});
const vanishIntoEter = card("Vanish into Eternity", "Instant", "{2}{W}", {"cmc":3,"oracleText":"This spell costs {3} more to cast if it targets a creature.\nExile target nonland permanent.","keywords":[]});
const nurturingPixie = card("Nurturing Pixie", "Creature — Faerie Rogue", "{W}", {"cmc":1,"oracleText":"Flying\nWhen this creature enters, return up to one target non-Faerie, nonland permanent you control to its owner's hand. If a permanent was returned this way, put a +1/+1 counter on this creature.","power":"1","toughness":"1","keywords":["Flying"]});
const essenceReliqua = card("Essence Reliquary", "Artifact", "{2}{W}", {"cmc":3,"oracleText":"{T}: Return another target permanent you control and all Auras you control attached to it to their owner's hand. Activate only during your turn.","keywords":[]});
const sneakySnacker = card("Sneaky Snacker", "Creature — Faerie Rogue", "{U}{B}", {"cmc":2,"oracleText":"Flying\nWhen you draw your third card in a turn, return this card from your graveyard to the battlefield tapped.","power":"2","toughness":"1","keywords":["Flying"]});
const urborgLhurgoyf = card("Urborg Lhurgoyf", "Creature — Lhurgoyf", "{1}{G}", {"cmc":2,"oracleText":"Kicker {U} and/or {B} (You may pay an additional {U} and/or {B} as you cast this spell.)\nAs this creature enters, mill three cards for each time it was kicked.\nUrborg Lhurgoyf's power is equal to the number of creature cards in your graveyard and its toughness is equal to that number plus 1.","power":"*","toughness":"1+*","keywords":["Mill","Kicker"]});
const bloodTyrant = card("Blood Tyrant", "Creature — Vampire", "{4}{U}{B}{R}", {"cmc":7,"oracleText":"Flying, trample\nAt the beginning of your upkeep, each player loses 1 life. Put a +1/+1 counter on this creature for each 1 life lost this way.\nWhenever a player loses the game, put five +1/+1 counters on this creature.","power":"5","toughness":"5","keywords":["Flying","Trample"]});
const oathOfKaya = card("Oath of Kaya", "Legendary Enchantment", "{1}{W}{B}", {"cmc":3,"oracleText":"When Oath of Kaya enters, it deals 3 damage to any target and you gain 3 life.\nWhenever an opponent attacks a planeswalker you control with one or more creatures, Oath of Kaya deals 2 damage to that player and you gain 2 life.","keywords":[]});
const actOfAuthority = card("Act of Authority", "Enchantment", "{1}{W}{W}", {"cmc":3,"oracleText":"When this enchantment enters, you may exile target artifact or enchantment.\nAt the beginning of your upkeep, you may exile target artifact or enchantment. If you do, its controller gains control of this enchantment.","keywords":[]});
const gimliMournfulA = card("Gimli, Mournful Avenger", "Legendary Creature — Dwarf Warrior", "{1}{R}{G}", {"cmc":3,"oracleText":"Gimli has indestructible as long as two or more creatures died under your control this turn.\nWhenever another creature you control dies, put a +1/+1 counter on Gimli. When this ability resolves for the third time this turn, Gimli fights up to one target creature you don't control.","power":"3","toughness":"2","keywords":["Fight"]});
const avacynGuardian = card("Avacyn, Guardian Angel", "Legendary Creature — Angel", "{2}{W}{W}{W}", {"cmc":5,"oracleText":"Flying, vigilance\n{1}{W}: Prevent all damage that would be dealt to another target creature this turn by sources of the color of your choice.\n{5}{W}{W}: Prevent all damage that would be dealt to target player or planeswalker this turn by sources of the color of your choice.","power":"5","toughness":"4","keywords":["Flying","Vigilance"]});
const seraphicGreats = card("Seraphic Greatsword", "Artifact — Equipment", "{1}{W}", {"cmc":2,"oracleText":"Equipped creature gets +2/+2.\nWhenever equipped creature attacks the player with the most life or tied for most life, create a 4/4 white Angel creature token with flying that's tapped and attacking that player.\nEquip {4}","keywords":["Equip"]});
const magitekScythe = card("Magitek Scythe", "Artifact — Equipment", "{4}", {"cmc":4,"oracleText":"A Test of Your Reflexes! — When this Equipment enters, you may attach it to target creature you control. If you do, that creature gains first strike until end of turn and must be blocked this turn if able.\nEquipped creature gets +2/+1.\nEquip {2}","keywords":["Equip","A Test of Your Reflexes!"]});
const systemsOverrid = card("Systems Override", "Sorcery", "{2}{R}", {"cmc":3,"oracleText":"Gain control of target artifact or creature until end of turn. Untap that permanent. It gains haste until end of turn. If it's a Spacecraft, put ten charge counters on it. If you do, remove ten charge counters from it at the beginning of the next end step.","keywords":[]});
const vraskaSoulOfSt = card("Vraska, Soul of Stone", "Legendary Creature — Gorgon Wizard", "{U}{R}{W}", {"cmc":3,"oracleText":"Artifact creatures you control have vigilance.\nWhenever you cast a noncreature spell, create a 1/1 colorless Sculpture Treasure artifact creature token with \"{T}, Sacrifice this token: Add one mana of any color.\"","power":"3","toughness":"3","keywords":["Treasure"]});
const stolenVitality = card("Stolen Vitality", "Instant", "{1}{R}", {"cmc":2,"oracleText":"Target creature gets +3/+1 until end of turn. If it's your turn, that creature gains trample until end of turn. Otherwise, it gains first strike until end of turn. (A creature with trample can deal excess combat damage to the player or planeswalker it's attacking. A creature with first strike deals combat damage before creatures without first strike.)","keywords":[]});
const mercyKilling = card("Mercy Killing", "Instant", "{2}{G/W}", {"cmc":3,"oracleText":"Target creature's controller sacrifices it, then creates X 1/1 green and white Elf Warrior creature tokens, where X is that creature's power.","keywords":[]});
const pathToTheFesti = card("Path to the Festival", "Sorcery", "{2}{G}", {"cmc":3,"oracleText":"Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle. Then if there are three or more basic land types among lands you control, scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nFlashback {4}{G} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","keywords":["Flashback","Scry"]});
const collisionCours = card("Collision Course", "Sorcery", "{1}{W}", {"cmc":2,"oracleText":"Choose one —\n• Collision Course deals X damage to target creature, where X is the number of permanents you control that are creatures and/or Vehicles.\n• Destroy target artifact.","keywords":[]});
const assassinsInk = card("Assassin's Ink", "Instant", "{2}{B}{B}", {"cmc":4,"oracleText":"This spell costs {1} less to cast if you control an artifact and {1} less to cast if you control an enchantment.\nDestroy target creature or planeswalker.","keywords":[]});
const delightfulDisc = card("Delightful Discovery", "Instant", "{4}{U}", {"cmc":5,"oracleText":"This spell costs {1} less to cast for each spell your opponents have cast this turn.\nScry 2, then draw two cards. (To scry 2, look at the top two cards of your library, then put any number of them on the bottom and the rest on top in any order.)","keywords":["Scry"]});
const howlOfTheHunt = card("Howl of the Hunt", "Enchantment — Aura", "{2}{G}", {"cmc":3,"oracleText":"Flash\nEnchant creature\nWhen this Aura enters, if enchanted creature is a Wolf or Werewolf, untap that creature.\nEnchanted creature gets +2/+2 and has vigilance.","keywords":["Enchant","Flash"]});
const sphinxboneWand = card("Sphinx-Bone Wand", "Artifact", "{7}", {"cmc":7,"oracleText":"Whenever you cast an instant or sorcery spell, you may put a charge counter on this artifact. If you do, this artifact deals damage equal to the number of charge counters on it to any target.","keywords":[]});
const grevenPredator = card("Greven, Predator Captain", "Legendary Creature — Phyrexian Human Warrior", "{3}{B}{R}", {"cmc":5,"oracleText":"Menace\nGreven gets +X/+0, where X is the amount of life you've lost this turn.\nWhenever Greven attacks, you may sacrifice another creature. If you do, you draw cards equal to that creature's power and you lose life equal to that creature's toughness.","power":"5","toughness":"5","keywords":["Menace"]});
const sonicShrieker = card("Sonic Shrieker", "Creature — Dragon", "{2}{R}{W}{B}", {"cmc":5,"oracleText":"Flying\nWhen this creature enters, it deals 2 damage to any target and you gain 2 life. If a player is dealt damage this way, they discard a card.","power":"4","toughness":"4","keywords":["Flying"]});

describe("round 216 cards", () => {
  it("compile", () =>
    supported(khalniHydra, vanishIntoEter, nurturingPixie, essenceReliqua, sneakySnacker, urborgLhurgoyf, bloodTyrant, oathOfKaya, actOfAuthority, gimliMournfulA, avacynGuardian, seraphicGreats, magitekScythe, systemsOverrid, vraskaSoulOfSt, stolenVitality, mercyKilling, pathToTheFesti, collisionCours, assassinsInk, delightfulDisc, howlOfTheHunt, sphinxboneWand, grevenPredator, sonicShrieker));
});

describe("cost changes", () => {
  const greenSymbols = (c: { cost: { symbols: { kind: string; color?: string }[] } }) => c.cost.symbols.filter((x) => x.kind === "colored" && x.color === "G").length;

  it("Khalni Hydra costs {G} less for each green creature you control, never below nothing", () => {
    const { s, ap, ids, opp } = setup([khalniHydra]);
    const hydra = s.objects[ids[0]!]!;
    expect(greenSymbols(spellCost(s, ap, hydra))).toBe(8);
    greens(s, ap, 3);
    putOnBattlefield(s, ap, bear({ name: "Plain Bear", colors: [] }));
    greens(s, opp, 2);
    expect(greenSymbols(spellCost(s, ap, hydra))).toBe(5);
    expect(spellCost(s, ap, hydra).extra).toBe(0);
    greens(s, ap, 7);
    expect(greenSymbols(spellCost(s, ap, hydra))).toBe(0);
    expect(spellCost(s, ap, hydra).extra).toBe(0);
    const s2 = run(s, planCast(s, ap, ids[0]!));
    expect(s2.stack.some((x) => x.objectId === ids[0])).toBe(true);
  });

  it("Vanish into Eternity costs {3} more if it targets a creature", () => {
    const { s, ap, ids, opp } = setup([vanishIntoEter]);
    const b = putOnBattlefield(s, opp, bear());
    const relic = putOnBattlefield(s, opp, card("Their Relic", "Artifact", "{2}"));
    const v = s.objects[ids[0]!]!;
    expect(spellCost(s, ap, v, 0, [], { targets: [tgt(relic)] }).extra).toBe(2);
    expect(spellCost(s, ap, v, 0, [], { targets: [tgt(b)] }).extra).toBe(5);
    const s2 = settle(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    expect(zone(s2, b)).toBe("exile");
    expect(s2.battlefield.filter((id) => s2.objects[id]!.tapped && controllerOf(s2, s2.objects[id]!) === ap).length).toBe(6);
  });

  it("Assassin's Ink costs {1} less with an artifact and {1} less with an enchantment", () => {
    const { s, ap, ids } = setup([assassinsInk]);
    const ink = s.objects[ids[0]!]!;
    expect(spellCost(s, ap, ink).extra).toBe(2);
    putOnBattlefield(s, ap, card("My Relic", "Artifact", "{2}"));
    expect(spellCost(s, ap, ink).extra).toBe(1);
    putOnBattlefield(s, ap, card("My Charm", "Enchantment", "{2}"));
    expect(spellCost(s, ap, ink).extra).toBe(0);
  });

  it("Delightful Discovery costs {1} less for each spell your opponents have cast this turn, not yours", () => {
    const { s, ap, ids, opp } = setup([delightfulDisc]);
    const dd = s.objects[ids[0]!]!;
    expect(spellCost(s, ap, dd).extra).toBe(4);
    s.castThisTurn = [{ player: opp, card: s.objects[ids[0]!]!.cardId, from: "hand" }, { player: opp, card: s.objects[ids[0]!]!.cardId, from: "hand" }, { player: ap, card: s.objects[ids[0]!]!.cardId, from: "hand" }] as GameState["castThisTurn"];
    expect(spellCost(s, ap, dd).extra).toBe(2);
  });
});

describe("Nurturing Pixie", () => {
  it("returns up to one non-Faerie nonland permanent you control; a +1/+1 counter only if one was returned", () => {
    const { s: s0, ap, ids } = setup([nurturingPixie, nurturingPixie]);
    const relic = putOnBattlefield(s0, ap, card("My Relic", "Artifact", "{2}"));
    let s = untilTargets(run(s0, planCast(s0, ap, ids[0]!)));
    const faerie = putOnBattlefield(s, ap, card("Other Faerie", "Creature — Faerie", "{U}", { power: "1", toughness: "1" }));
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(faerie)] })).toThrow();
    s = settle(s, { targets: [tgt(relic)] });
    expect(zone(s, relic)).toBe("hand");
    expect(s.objects[ids[0]!]!.counters["+1/+1"]).toBe(1);
    s = untilTargets(run(s, planCast(s, ap, ids[1]!)));
    s = settle(s, { targets: [{ kind: "none" }] });
    expect(zone(s, ids[1]!)).toBe("battlefield");
    expect(s.objects[ids[1]!]!.counters["+1/+1"] ?? 0).toBe(0);
  });
});

describe("Essence Reliquary", () => {
  it("returns another permanent you control and the Auras you control on it, only during your turn", () => {
    const { s: s0, ap, opp } = setup([]);
    const rel = putOnBattlefield(s0, ap, essenceReliqua);
    const b = putOnBattlefield(s0, ap, bear());
    const mine = putOnBattlefield(s0, ap, card("Mine Aura", "Enchantment — Aura", "{W}", { oracleText: "Enchant creature" }));
    const theirs = putOnBattlefield(s0, opp, card("Their Aura", "Enchantment — Aura", "{W}", { oracleText: "Enchant creature" }));
    s0.objects[mine]!.attachedTo = b;
    s0.objects[theirs]!.attachedTo = b;
    invalidateCharacteristics(s0);
    expect(planActivate(s0, ap, rel, 0, [tgt(rel)])).toBeNull();
    const s = settle(run(s0, planActivate(s0, ap, rel, 0, [tgt(b)])));
    expect(zone(s, b)).toBe("hand");
    expect(zone(s, mine)).toBe("hand");
    expect(zone(s, theirs)).toBe("graveyard");
    // Not during an opponent's turn.
    const t = passUntil(s, "upkeep", opp);
    t.objects[rel]!.tapped = false;
    const other = putOnBattlefield(t, ap, bear({ name: "Other Bear" }));
    expect(planActivate(t, ap, rel, 0, [tgt(other)])).toBeNull();
  });
});

describe("Sneaky Snacker", () => {
  it("returns from your graveyard tapped when you draw your third card in a turn", () => {
    const { s: s0, ap } = setup([]);
    const sn = into(s0, ap, sneakySnacker, "graveyard");
    s0.players[ap]!.draws = { turn: s0.turn, n: 0 };
    draw(s0, ap);
    draw(s0, ap);
    let s = settle(s0);
    expect(zone(s, sn)).toBe("graveyard");
    draw(s, ap);
    s = settle(s);
    expect(zone(s, sn)).toBe("battlefield");
    expect(s.objects[sn]!.tapped).toBe(true);
  });
});

describe("Urborg Lhurgoyf", () => {
  it("mills three cards for each time it was kicked as it enters", () => {
    for (const kicks of [[], [0], [0, 1]]) {
      const { s: s0, ap, ids } = setup([urborgLhurgoyf]);
      const lib = s0.players[ap]!.library.length;
      const s = settle(run(s0, planCast(s0, ap, ids[0]!, undefined, undefined, "auto", undefined, { kicks })));
      expect(zone(s, ids[0]!)).toBe("battlefield");
      expect(s.players[ap]!.library.length).toBe(lib - 3 * kicks.length);
      const creatures = s.players[ap]!.graveyard.filter((id) => s.cards[s.objects[id]!.cardId]!.types.includes("Creature")).length;
      expect(pt(s, ids[0]!)).toBe(`${creatures}/${creatures + 1}`);
    }
  });
});

describe("Blood Tyrant", () => {
  it("upkeep: each player loses 1 life and it gets a counter for each 1 life lost, its controller's included", () => {
    const { s: s0, opp } = setup([]);
    emptyHands(s0);
    const bt = putOnBattlefield(s0, opp, bloodTyrant);
    let s = passUntil(s0, "upkeep", opp);
    s = settle(s);
    expect(s.players.map((p) => p.life)).toEqual([39, 39, 39, 39]);
    expect(s.objects[bt]!.counters["+1/+1"]).toBe(4);
  });

  it("whenever a player loses the game, five +1/+1 counters", () => {
    const { s: s0, ap, opp } = setup([]);
    const bt = putOnBattlefield(s0, ap, bloodTyrant);
    playerLoses(s0, opp, "test");
    const s = settle(s0);
    expect(s.objects[bt]!.counters["+1/+1"]).toBe(5);
  });
});

describe("Oath of Kaya", () => {
  it("triggers once for each of your planeswalkers an opponent attacks: 2 damage to that player and you gain 2 life", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHands(s0);
    const oath = putOnBattlefield(s0, opp, oathOfKaya);
    const w1 = putOnBattlefield(s0, opp, walker("Walker One"));
    const w2 = putOnBattlefield(s0, opp, walker("Walker Two"));
    s0.objects[w1]!.counters.loyalty = 5;
    s0.objects[w2]!.counters.loyalty = 5;
    const a = putOnBattlefield(s0, ap, bear({ name: "Bear A" }));
    const b = putOnBattlefield(s0, ap, bear({ name: "Bear B" }));
    const c = putOnBattlefield(s0, ap, bear({ name: "Bear C" }));
    let s = attack(s0, ap, [{ attacker: a, defender: opp, planeswalker: w1 }, { attacker: b, defender: opp, planeswalker: w2 }, { attacker: c, defender: opp }]);
    expect(s.stack.filter((x) => x.sourceId === oath).length + s.triggerQueue.filter((x) => x.sourceId === oath).length).toBe(2);
    s = settle(s);
    expect(s.players[ap]!.life).toBe(36);
    expect(s.players[opp]!.life).toBe(44);
  });

  it("no trigger when only you are attacked", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHands(s0);
    putOnBattlefield(s0, opp, oathOfKaya);
    const a = putOnBattlefield(s0, ap, bear({ name: "Bear A" }));
    const s = settle(attack(s0, ap, [{ attacker: a, defender: opp }]));
    expect(s.players[ap]!.life).toBe(40);
  });
});

describe("Act of Authority", () => {
  it("upkeep: you may exile target artifact or enchantment; if you do, its controller gains control of Act of Authority", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHands(s0);
    const aoa = putOnBattlefield(s0, opp, actOfAuthority);
    const relic = putOnBattlefield(s0, ap, card("Their Relic", "Artifact", "{2}"));
    let s = untilTargets(passUntil(s0, "upkeep", opp));
    s = settle(s, { targets: [tgt(relic)], may: true });
    expect(zone(s, relic)).toBe("exile");
    expect(controllerOf(s, s.objects[aoa]!)).toBe(ap);
  });

  it("declined: you keep it", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHands(s0);
    const aoa = putOnBattlefield(s0, opp, actOfAuthority);
    const relic = putOnBattlefield(s0, ap, card("Their Relic", "Artifact", "{2}"));
    let s = untilTargets(passUntil(s0, "upkeep", opp));
    s = settle(s, { targets: [tgt(relic)], may: false });
    expect(zone(s, relic)).toBe("battlefield");
    expect(controllerOf(s, s.objects[aoa]!)).toBe(opp);
  });
});

describe("Gimli, Mournful Avenger", () => {
  it("a counter for each other creature of yours that dies; the third resolution this turn fights up to one creature you don't control; indestructible with two deaths", () => {
    const { s: s0, ap, opp } = setup([]);
    const g = putOnBattlefield(s0, ap, gimliMournfulA);
    const mine = [0, 1, 2].map((i) => putOnBattlefield(s0, ap, bear({ name: `My Bear ${i}` })));
    const theirs = putOnBattlefield(s0, opp, card("Their Ogre", "Creature — Ogre", "{2}", { power: "3", toughness: "5" }));
    const pinger = putOnBattlefield(s0, opp, card("Pinger", "Artifact", "{1}"));
    let s = s0;
    for (const [i, id] of mine.entries()) {
      dealDamage(s, objectSource(s, s.objects[pinger]!), { object: s.objects[id]! }, 5);
      runStateBasedActions(s);
      s = i < 2 ? settle(s) : untilTargets(s);
      if (i === 0) expect(objHasKeyword(s, s.objects[g]!, "Indestructible")).toBe(false);
    }
    expect(objHasKeyword(s, s.objects[g]!, "Indestructible")).toBe(true);
    expect(s.pending?.kind).toBe("chooseTargets");
    s = settle(s, { targets: [tgt(theirs)] });
    expect(s.objects[g]!.counters["+1/+1"]).toBe(3);
    expect(zone(s, theirs)).toBe("graveyard");
    expect(s.objects[g]!.damage).toBe(3);
  });
});

describe("Avacyn, Guardian Angel", () => {
  it("prevents all damage to another target creature this turn by sources of the color chosen as it resolves", () => {
    const { s: s0, ap, opp } = setup([]);
    const av = putOnBattlefield(s0, ap, avacynGuardian);
    const b = putOnBattlefield(s0, ap, bear({ name: "Guarded Bear", toughness: "9" }));
    const red = putOnBattlefield(s0, opp, card("Red Pinger", "Artifact Creature — Golem", "{R}", { power: "1", toughness: "1", colors: ["R"] }));
    const green = putOnBattlefield(s0, opp, card("Green Pinger", "Artifact Creature — Golem", "{G}", { power: "1", toughness: "1", colors: ["G"] }));
    expect(planActivate(s0, ap, av, 0, [tgt(av)])).toBeNull();
    let s = run(s0, planActivate(s0, ap, av, 0, [tgt(b)]));
    s = settle(s);
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "color" });
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Red" }));
    dealDamage(s, objectSource(s, s.objects[red]!), { object: s.objects[b]! }, 3);
    expect(s.objects[b]!.damage ?? 0).toBe(0);
    dealDamage(s, objectSource(s, s.objects[green]!), { object: s.objects[b]! }, 2);
    expect(s.objects[b]!.damage).toBe(2);
    dealDamage(s, objectSource(s, s.objects[red]!), { object: s.objects[av]! }, 1);
    expect(s.objects[av]!.damage).toBe(1);
  });

  it("the second ability protects a player from sources of the chosen color", () => {
    const { s: s0, ap, opp } = setup([]);
    const av = putOnBattlefield(s0, ap, avacynGuardian);
    const red = putOnBattlefield(s0, opp, card("Red Pinger", "Artifact Creature — Golem", "{R}", { power: "1", toughness: "1", colors: ["R"] }));
    let s = settle(run(s0, planActivate(s0, ap, av, 1, [{ kind: "player", id: ap }])));
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "Red" }));
    dealDamage(s, objectSource(s, s.objects[red]!), { player: ap }, 3);
    expect(s.players[ap]!.life).toBe(40);
  });
});

describe("Seraphic Greatsword", () => {
  it("equipped creature attacking the player with the most life makes a 4/4 Angel tapped and attacking that player", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHands(s0);
    const sw = putOnBattlefield(s0, ap, seraphicGreats);
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[sw]!.attachedTo = b;
    invalidateCharacteristics(s0);
    expect(pt(s0, b)).toBe("4/4");
    s0.players[opp]!.life = 45;
    let s = settle(attack(s0, ap, [{ attacker: b, defender: opp }]));
    const angels = s.battlefield.filter((id) => nameOf(s, id).startsWith("Angel"));
    expect(angels).toHaveLength(1);
    expect(pt(s, angels[0]!)).toBe("4/4");
    expect(s.objects[angels[0]!]!.attacking).toBe(opp);
    expect(s.objects[angels[0]!]!.tapped).toBe(true);
  });

  it("nothing when the player attacked doesn't have the most life", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHands(s0);
    const sw = putOnBattlefield(s0, ap, seraphicGreats);
    const b = putOnBattlefield(s0, ap, bear());
    s0.objects[sw]!.attachedTo = b;
    invalidateCharacteristics(s0);
    s0.players[opp]!.life = 30;
    const s = settle(attack(s0, ap, [{ attacker: b, defender: opp }]));
    expect(s.battlefield.filter((id) => nameOf(s, id).startsWith("Angel"))).toHaveLength(0);
  });
});

describe("Magitek Scythe", () => {
  it("you may attach it as it enters; if you do, that creature gains first strike and must be blocked this turn", () => {
    for (const yes of [true, false]) {
      const { s: s0, ap, ids } = setup([magitekScythe]);
      const b = putOnBattlefield(s0, ap, bear());
      let s = untilTargets(run(s0, planCast(s0, ap, ids[0]!)));
      s = settle(s, { targets: [tgt(b)], may: yes });
      expect(s.objects[ids[0]!]!.attachedTo).toBe(yes ? b : undefined);
      expect(objHasKeyword(s, s.objects[b]!, "First strike")).toBe(yes);
      expect(pt(s, b)).toBe(yes ? "4/3" : "2/2");
      expect(characteristics(s, s.objects[b]!).mustBeBlocked ?? false).toBe(yes);
    }
  });
});

describe("Systems Override", () => {
  it("gains control of an artifact or creature until end of turn, untaps it, and gives it haste", () => {
    const { s: s0, ap, ids, opp } = setup([systemsOverrid]);
    const b = putOnBattlefield(s0, opp, bear());
    s0.objects[b]!.tapped = true;
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(controllerOf(s, s.objects[b]!)).toBe(ap);
    expect(s.objects[b]!.tapped).toBe(false);
    expect(objHasKeyword(s, s.objects[b]!, "Haste")).toBe(true);
    expect(s.objects[b]!.counters.charge ?? 0).toBe(0);
  });

  it("a Spacecraft gets ten charge counters, removed at the beginning of the next end step", () => {
    const { s: s0, ap, ids, opp } = setup([systemsOverrid]);
    const ship = putOnBattlefield(s0, opp, card("Their Ship", "Artifact — Spacecraft", "{3}"));
    s0.objects[ship]!.counters.charge = 2;
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(ship)])));
    expect(s.objects[ship]!.counters.charge).toBe(12);
    s = settle(passUntil(s, "end", ap));
    expect(s.objects[ship]!.counters.charge).toBe(2);
  });
});

describe("Vraska, Soul of Stone", () => {
  it("each noncreature spell you cast makes a 1/1 Sculpture Treasure artifact creature with a Treasure's ability; artifact creatures have vigilance", () => {
    const { s: s0, ap, ids } = setup([card("Quick Draw", "Instant", "{U}", { oracleText: "Draw a card." })]);
    putOnBattlefield(s0, ap, vraskaSoulOfSt);
    const s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const tokens = s.battlefield.filter((id) => s.objects[id]!.isToken);
    expect(tokens).toHaveLength(1);
    const t = s.objects[tokens[0]!]!;
    const c = characteristics(s, t);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(c.subtypes).toEqual(expect.arrayContaining(["Sculpture", "Treasure"]));
    expect(pt(s, t.id)).toBe("1/1");
    expect(objHasKeyword(s, t, "Vigilance")).toBe(true);
    expect(abilitiesOf(s, t).mana.length + abilitiesOf(s, t).activated.length).toBeGreaterThan(0);
  });
});

describe("Stolen Vitality", () => {
  it("+3/+1, and trample on your turn or first strike otherwise", () => {
    const { s: s0, ap, ids, opp } = setup([stolenVitality]);
    const b = putOnBattlefield(s0, ap, bear());
    let s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(b)])));
    expect(pt(s, b)).toBe("5/3");
    expect(objHasKeyword(s, s.objects[b]!, "Trample")).toBe(true);
    expect(objHasKeyword(s, s.objects[b]!, "First strike")).toBe(false);
    // On an opponent's turn, cast by the player whose turn it isn't.
    const { s: t0, ap: tp, ids: tids } = setup([stolenVitality]);
    const tb = putOnBattlefield(t0, tp, bear());
    const other = t0.turnOrder[(t0.turnOrder.indexOf(tp) + 1) % 4]!;
    emptyHands(t0);
    t0.players[tp]!.hand.push(tids[0]!);
    t0.objects[tids[0]!]!.zone = "hand";
    let t = passUntil(t0, "upkeep", other);
    for (const id of t.battlefield) if (controllerOf(t, t.objects[id]!) === tp) t.objects[id]!.tapped = false;
    while (waitingOn(t) !== tp) t = act(t, { type: "passPriority", player: waitingOn(t)! });
    t = settle(run(t, planCast(t, tp, tids[0]!, [tgt(tb)])));
    expect(pt(t, tb)).toBe("5/3");
    expect(objHasKeyword(t, t.objects[tb]!, "First strike")).toBe(true);
    expect(objHasKeyword(t, t.objects[tb]!, "Trample")).toBe(false);
    void opp;
  });
});

describe("Mercy Killing", () => {
  it("the creature's controller sacrifices it and creates X 1/1 Elf Warriors, X its power as it last existed", () => {
    const { s: s0, ap, ids, opp } = setup([mercyKilling]);
    const big = putOnBattlefield(s0, opp, card("Their Ogre", "Creature — Ogre", "{2}", { power: "4", toughness: "5" }));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(big)])));
    expect(zone(s, big)).toBe("graveyard");
    const elves = s.battlefield.filter((id) => s.objects[id]!.isToken && controllerOf(s, s.objects[id]!) === opp);
    expect(elves).toHaveLength(4);
    expect(characteristics(s, s.objects[elves[0]!]!).subtypes).toEqual(["Elf", "Warrior"]);
    expect(s.battlefield.filter((id) => s.objects[id]!.isToken && controllerOf(s, s.objects[id]!) === ap)).toHaveLength(0);
  });
});

describe("Path to the Festival", () => {
  it("fetches a basic land tapped, then scry 1 with three or more basic land types among your lands", () => {
    const { s: s0, ap, ids } = setup([pathToTheFesti]);
    let s = run(s0, planCast(s0, ap, ids[0]!));
    s = settle(s);
    expect(s.pending?.kind).toBe("searchLibrary");
    const pick = (s.pending as { cards: string[] }).cards[0]!;
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [pick] }));
    expect(zone(s, pick)).toBe("battlefield");
    expect(s.objects[pick]!.tapped).toBe(true);
    expect(s.pending?.kind).toBe("arrangeTop");
  });

  it("no scry with fewer than three basic land types", () => {
    const { s: s0, ap, ids } = setup([pathToTheFesti]);
    for (const id of [...s0.battlefield]) {
      const n = nameOf(s0, id);
      if (n === "Island" || n === "Plains" || n === "Swamp") {
        s0.battlefield.splice(s0.battlefield.indexOf(id), 1);
        s0.objects[id]!.zone = "exile";
      }
    }
    invalidateCharacteristics(s0);
    let s = settle(run(s0, planCast(s0, ap, ids[0]!)));
    const pick = (s.pending as { cards: string[] }).cards[0]!;
    s = settle(act(s, { type: "searchLibrary", player: ap, found: [pick] }));
    expect(zone(s, pick)).toBe("battlefield");
    expect(s.pending ?? null).toBeNull();
  });
});

describe("Collision Course", () => {
  it("X damage, X the permanents you control that are creatures and/or Vehicles", () => {
    const { s: s0, ap, ids, opp } = setup([collisionCours]);
    putOnBattlefield(s0, ap, bear());
    putOnBattlefield(s0, ap, bear({ name: "Bear Two" }));
    putOnBattlefield(s0, ap, card("My Wagon", "Artifact — Vehicle", "{2}", { power: "3", toughness: "3", oracleText: "Crew 1" }));
    putOnBattlefield(s0, ap, card("My Relic", "Artifact", "{2}"));
    const target = putOnBattlefield(s0, opp, card("Their Ogre", "Creature — Ogre", "{2}", { power: "3", toughness: "9" }));
    const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(target)], [0])));
    expect(s.objects[target]!.damage).toBe(3);
  });
});

describe("Howl of the Hunt", () => {
  it("untaps the creature it enters attached to only if it's a Wolf or Werewolf", () => {
    for (const type of ["Wolf", "Bear"]) {
      const { s: s0, ap, ids } = setup([howlOfTheHunt]);
      const c = putOnBattlefield(s0, ap, card(`My ${type}`, `Creature — ${type}`, "{1}{G}", { power: "2", toughness: "2" }));
      s0.objects[c]!.tapped = true;
      const s = settle(run(s0, planCast(s0, ap, ids[0]!, [tgt(c)])));
      expect(s.objects[ids[0]!]!.attachedTo).toBe(c);
      expect(pt(s, c)).toBe("4/4");
      expect(s.objects[c]!.tapped).toBe(type !== "Wolf");
    }
  });
});

describe("Sphinx-Bone Wand", () => {
  it("you may put a charge counter on it; if you do, it deals damage equal to its charge counters to any target", () => {
    const shock = card("Quick Draw", "Instant", "{U}", { oracleText: "Draw a card." });
    const { s: s0, ap, ids, opp } = setup([shock, shock, shock]);
    const w = putOnBattlefield(s0, ap, sphinxboneWand);
    let s = untilTargets(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(s, { targets: [{ kind: "player", id: opp }], may: true });
    expect(s.objects[w]!.counters.charge).toBe(1);
    expect(s.players[opp]!.life).toBe(39);
    s = untilTargets(run(s, planCast(s, ap, ids[1]!)));
    s = settle(s, { targets: [{ kind: "player", id: opp }], may: true });
    expect(s.objects[w]!.counters.charge).toBe(2);
    expect(s.players[opp]!.life).toBe(37);
    s = untilTargets(run(s, planCast(s, ap, ids[2]!)));
    s = settle(s, { targets: [{ kind: "player", id: opp }], may: false });
    expect(s.objects[w]!.counters.charge).toBe(2);
    expect(s.players[opp]!.life).toBe(37);
  });
});

describe("Greven, Predator Captain", () => {
  it("attacks: you may sacrifice another creature to draw cards equal to its power and lose life equal to its toughness", () => {
    const { s: s0, ap, opp } = setup([]);
    emptyHands(s0);
    const g = putOnBattlefield(s0, ap, grevenPredator);
    const fodder = putOnBattlefield(s0, ap, card("Big Fodder", "Creature — Beast", "{3}", { power: "3", toughness: "2" }));
    let s = attack(s0, ap, [{ attacker: g, defender: opp }]);
    s = settle(s, { may: true });
    if (s.pending?.kind === "chooseOption" || s.pending?.kind === "pickPermanents") s = settle(act(s, { type: s.pending.kind, player: ap, choice: fodder, ids: [fodder] } as unknown as Action));
    expect(zone(s, fodder)).toBe("graveyard");
    expect(s.players[ap]!.hand).toHaveLength(3);
    expect(s.players[ap]!.life).toBe(38);
  });
});

describe("Sonic Shrieker", () => {
  it("2 damage to any target and you gain 2 life; a player dealt damage this way discards a card", () => {
    const { s: s0, ap, ids, opp } = setup([sonicShrieker, sonicShrieker]);
    const theirHand = s0.players[opp]!.hand.length;
    let s = untilTargets(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(s, { targets: [{ kind: "player", id: opp }] });
    if (s.pending?.kind === "discard") s = settle(act(s, { type: "discard", player: opp, objectIds: [s.players[opp]!.hand[0]!] }));
    expect(s.players[opp]!.life).toBe(38);
    expect(s.players[ap]!.life).toBe(42);
    expect(s.players[opp]!.hand.length).toBe(theirHand - 1);
  });

  it("no discard when it hits a creature", () => {
    const { s: s0, ap, ids, opp } = setup([sonicShrieker]);
    const b = putOnBattlefield(s0, opp, bear());
    const theirHand = s0.players[opp]!.hand.length;
    let s = untilTargets(run(s0, planCast(s0, ap, ids[0]!)));
    s = settle(s, { targets: [tgt(b)] });
    expect(zone(s, b)).toBe("graveyard");
    expect(s.players[opp]!.hand.length).toBe(theirHand);
  });
});
