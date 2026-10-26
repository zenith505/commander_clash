// Round 171: the most played cards, in popularity order, after round 170 (from Haakon, Stromgald Scourge, rank 7,022, on).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, island, passAll, passUntil, pt, putOnBattlefield, scry, setup, swamp } from "./helpers";
import { draw, compileCard, attackProblem, moveObject, loseLife, spellCost, potentialAttackers, abilityProblem, blockProblem, botActions, controllerOf, parseManaCost, planMana, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

const supported = (...defs: CardDef[]) => defs.forEach((d) => expect(isFullySupported(d), d.name).toBe(true));
const run = (s: GameState, plan: Action[] | null) => {
  if (!plan) throw new Error("no plan");
  for (const a of plan) s = act(s, a);
  return s;
};
/** Says yes (or no) to a "you may" question, paying its mana first. */
const may = (s: GameState, yes: boolean) => {
  if (s.pending?.kind !== "chooseMay") throw new Error("no question");
  const pid = s.pending.player;
  if (yes && s.pending.pay?.mana) for (const a of planMana(s, pid, parseManaCost(s.pending.pay.mana))!) s = act(s, a);
  return act(s, { type: "chooseMay", player: pid, yes });
};
/** Everyone passes until the stack is empty; "you may" questions get `yes`. Stops at any other question. */
const resolveAll = (s: GameState, yes = true) => {
  for (let i = 0; i < 80 && (s.stack.length || s.triggerQueue.length || s.pending?.kind === "chooseMay"); i++) {
    if (s.pending?.kind === "chooseMay") s = may(s, yes);
    else if (s.pending) break;
    else s = act(s, { type: "passPriority", player: waitingOn(s)! });
  }
  return s;
};
/** A card put straight into a zone, not from the battlefield. */
const into = (s: GameState, pid: PlayerId, def: CardDef, zone: "graveyard" | "hand" | "library" | "exile") => {
  const id = putOnBattlefield(s, pid, def);
  s.battlefield.splice(s.battlefield.indexOf(id), 1);
  s.objects[id]!.zone = zone;
  if (zone === "library") s.players[pid]!.library.unshift(id);
  else if (zone !== "exile") s.players[pid]![zone].push(id);
  invalidateCharacteristics(s);
  return id;
};
/** Like `resolveAll`, and other players' questions are answered by the bot. */
const settle = (s: GameState, me: PlayerId, yes = true) => {
  for (let i = 0; i < 40; i++) {
    s = resolveAll(s, yes);
    if (!s.pending || s.pending.player === me) return s;
    s = run(s, botActions(s, s.pending.player));
  }
  return s;
};
const zone = (s: GameState, id: string) => s.objects[id]?.zone;
const next = (s: GameState, pid: PlayerId) => s.turnOrder[(s.turnOrder.indexOf(pid) + 1) % s.turnOrder.length]!;
const attack = (s: GameState, ap: PlayerId, attacks: { attacker: string; defender: PlayerId }[]) => act(passUntil(s, "declareAttackers", ap), { type: "declareAttackers", player: ap, attacks });
const tgt = (id: string): TargetChoice => ({ kind: "object", id });
const kw = (s: GameState, id: string, k: string) => objHasKeyword(s, s.objects[id]!, k);
const pending = <T = Record<string, unknown>>(s: GameState) => s.pending as unknown as T;
const named = (s: GameState, id: string) => characteristics(s, s.objects[id]!).name;
/** Players pass until `pid` has priority, in this step. */
const priorityTo = (s: GameState, pid: PlayerId) => {
  for (let i = 0; i < 8 && waitingOn(s) !== pid; i++) s = act(s, { type: "passPriority", player: waitingOn(s)! });
  expect(waitingOn(s)).toBe(pid);
  return s;
};
void [bear, card, pt, characteristics, kw, settle, zone, next, attack, tgt, pending, named, abilityProblem, passAll];

// Real oracle text (Scryfall).

// Real oracle text (Scryfall).
const handOf = (s: GameState, pid: PlayerId) => s.players[pid]!.hand;
const lifeOf = (s: GameState, pid: PlayerId) => s.players[pid]!.life;
const mine = (s: GameState, pid: PlayerId, name: string) => s.battlefield.filter((id) => controllerOf(s, s.objects[id]!) === pid && named(s, id) === name);
void [handOf, lifeOf, mine, swamp, forest, loseLife, moveObject, spellCost, blockProblem, potentialAttackers];

const josu = card("Josu Vess, Lich Knight", "Legendary Creature — Zombie Knight", "{2}{B}{B}", {cmc: 4,power: "4",toughness: "5",keywords: ["Menace","Kicker"],oracleText: "Kicker {5}{B} (You may pay an additional {5}{B} as you cast this spell.)\nMenace\nWhen Josu Vess enters, if he was kicked, create eight 2/2 black Zombie Knight creature tokens with menace."});
const kefnet = card("Kefnet the Mindful", "Legendary Creature — God", "{2}{U}", {cmc: 3,power: "5",toughness: "5",keywords: ["Flying","Indestructible"],oracleText: "Flying, indestructible\nKefnet can't attack or block unless you have seven or more cards in hand.\n{3}{U}: Draw a card, then you may return a land you control to its owner's hand."});
const rienne = card("Rienne, Angel of Rebirth", "Legendary Creature — Angel", "{2}{R}{G}{W}", {cmc: 5,power: "5",toughness: "4",keywords: ["Flying"],oracleText: "Flying\nOther multicolored creatures you control get +1/+0.\nWhenever another multicolored creature you control dies, return it to its owner's hand at the beginning of the next end step."});
const muYanling = card("Mu Yanling, Wind Rider", "Legendary Creature — Human Wizard Pilot", "{2}{U}{U}", {cmc: 4,power: "2",toughness: "4",oracleText: "When Mu Yanling enters, create a 3/2 colorless Vehicle artifact token with crew 1.\nVehicles you control have flying.\nWhenever one or more creatures you control with flying deal combat damage to a player, draw a card."});
const broodmother = card("Dragon Broodmother", "Creature — Dragon", "{2}{R}{R}{R}{G}", {cmc: 6,power: "4",toughness: "4",keywords: ["Flying"],oracleText: "Flying\nAt the beginning of each upkeep, create a 1/1 red and green Dragon creature token with flying and devour 2. (As the token enters, you may sacrifice any number of creatures. It enters with twice that many +1/+1 counters on it.)"});
const akros = card("Colossus of Akros", "Artifact Creature — Golem", "{8}", {cmc: 8,power: "10",toughness: "10",keywords: ["Indestructible","Monstrosity","Defender"],oracleText: "Defender, indestructible\n{10}: Monstrosity 10. (If this creature isn't monstrous, put ten +1/+1 counters on it and it becomes monstrous.)\nAs long as this creature is monstrous, it has trample and can attack as though it didn't have defender."});
const ambusher = card("Nightkin Ambusher", "Creature — Mutant Warrior", "{2}{U}{B}", {cmc: 4,power: "4",toughness: "4",keywords: ["Ward"],oracleText: "Ward {2} (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {2}.)\nWhen this creature enters, target player gets four rad counters.\nThis creature can't be blocked as long as defending player has a rad counter."});
const grimoire = card("Marina Vendrell's Grimoire", "Legendary Artifact — Book", "{5}{U}", {cmc: 6,oracleText: "When Marina Vendrell's Grimoire enters, if you cast it, draw five cards.\nYou have no maximum hand size and don't lose the game for having 0 or less life.\nWhenever you gain life, draw that many cards.\nWhenever you lose life, discard that many cards. Then if you have no cards in hand, you lose the game."});
const debaser = card("Rakshasa Debaser", "Creature — Demon", "{4}{B}{B}", {cmc: 6,power: "6",toughness: "6",keywords: ["Encore"],oracleText: "Whenever this creature attacks, put target creature card from defending player's graveyard onto the battlefield under your control.\nEncore {6}{B}{B} ({6}{B}{B}, Exile this card from your graveyard: For each opponent, create a token copy that attacks that opponent this turn if able. They gain haste. Sacrifice them at the beginning of the next end step. Activate only as a sorcery.)"});
const skimmer = card("Voracious Tome-Skimmer", "Creature — Faerie Rogue", "{U/B}{U/B}{U/B}", {cmc: 3,power: "2",toughness: "3",keywords: ["Flying"],oracleText: "Flying\nWhenever you cast a spell during an opponent's turn, you may pay 1 life. If you do, draw a card."});
const liliana = card("Liliana, Untouched by Death", "Legendary Planeswalker — Liliana", "{2}{B}{B}", {cmc: 4,loyalty: "4",keywords: ["Mill"],oracleText: "+1: Mill three cards. If at least one Zombie card is milled this way, each opponent loses 2 life and you gain 2 life.\n−2: Target creature gets -X/-X until end of turn, where X is the number of Zombies you control.\n−3: You may cast Zombie spells from your graveyard this turn."});
const bounty = card("Bounty Agent", "Creature — Human Soldier", "{1}{W}", {cmc: 2,power: "2",toughness: "2",keywords: ["Vigilance"],oracleText: "Vigilance\n{T}, Sacrifice this creature: Destroy target legendary permanent that's an artifact, creature, or enchantment."});
const danse = card("Paladin Danse, Steel Maverick", "Legendary Artifact Creature — Synth Knight", "{2}{W}", {cmc: 3,power: "3",toughness: "3",keywords: ["Lifelink","Vigilance"],oracleText: "Vigilance, lifelink\nExile Paladin Danse: Each creature you control that's an artifact or Human gains indestructible until end of turn."});

describe("Round 171, first cards", () => {
  it("are fully supported", () => supported(josu, kefnet, rienne, muYanling, broodmother, akros, ambusher, grimoire, debaser, skimmer, liliana, bounty, danse));
});

describe("Josu Vess, Lich Knight", () => {
  it("kicked: eight 2/2 black Zombie Knights with menace", () => {
    let { s, ap, ids } = setup([josu]);
    for (let i = 0; i < 4; i++) putOnBattlefield(s, ap, swamp);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, undefined, undefined, "auto", undefined, { kicks: [0] })));
    const tokens = mine(s, ap, "Zombie Knight Token");
    expect(tokens.length).toBe(8);
    expect(pt(s, tokens[0]!)).toBe("2/2");
    expect(kw(s, tokens[0]!, "Menace")).toBe(true);
  });
  it("not kicked: no tokens", () => {
    let { s, ap, ids } = setup([josu]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(mine(s, ap, "Zombie Knight Token").length).toBe(0);
  });
});

describe("Kefnet the Mindful", () => {
  it("can't attack unless you have seven or more cards in hand", () => {
    let { s, ap } = setup([]);
    const k = putOnBattlefield(s, ap, kefnet);
    while (handOf(s, ap).length > 6) moveObject(s, handOf(s, ap)[0]!, "library");
    invalidateCharacteristics(s);
    const can = () => potentialAttackers(s, ap).some((o) => o.id === k);
    expect(can()).toBe(false);
    into(s, ap, bear(), "hand");
    expect(handOf(s, ap).length).toBe(7);
    expect(can()).toBe(true);
  });
  it("can't block unless you have seven or more cards in hand", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const k = putOnBattlefield(s, opp, kefnet);
    const b = putOnBattlefield(s, ap, bear());
    while (handOf(s, opp).length > 6) moveObject(s, handOf(s, opp)[0]!, "library");
    s = attack(s, ap, [{ attacker: b, defender: opp }]);
    expect(blockProblem(s, s.objects[k]!, s.objects[b]!)).not.toBeNull();
    while (handOf(s, opp).length < 7) into(s, opp, bear(), "hand");
    invalidateCharacteristics(s);
    expect(blockProblem(s, s.objects[k]!, s.objects[b]!)).toBeNull();
  });
});

describe("Rienne, Angel of Rebirth", () => {
  it("other multicolored creatures you control get +1/+0, not monocolored ones or an opponent's", () => {
    const { s, ap } = setup([]);
    const r = putOnBattlefield(s, ap, rienne);
    const multi = putOnBattlefield(s, ap, card("Gold Bear", "Creature — Bear", "{G}{W}", { power: "2", toughness: "2" }));
    const mono = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, next(s, ap), card("Gold Bear", "Creature — Bear", "{G}{W}", { power: "2", toughness: "2" }));
    expect([pt(s, r), pt(s, multi), pt(s, mono), pt(s, theirs)]).toEqual(["5/4", "3/2", "2/2", "2/2"]);
  });
});

describe("Mu Yanling, Wind Rider", () => {
  it("creates a 3/2 colorless Vehicle artifact token with crew 1, which a creature crews", () => {
    let { s, ap, ids } = setup([muYanling]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    const [v] = mine(s, ap, "Vehicle Token");
    expect(v).toBeDefined();
    const c = characteristics(s, s.objects[v!]!);
    expect(c.types).toEqual(["Artifact"]);
    expect(c.subtypes).toEqual(["Vehicle"]);
    expect(c.colors).toEqual([]);
    const pilot = putOnBattlefield(s, ap, bear());
    s = resolveAll(act(s, { type: "activateAbility", player: ap, objectId: v!, index: 0, tapCreatures: [pilot] }));
    expect(characteristics(s, s.objects[v!]!).types).toContain("Creature");
    expect(pt(s, v!)).toBe("3/2");
    // Vehicles you control have flying.
    expect(kw(s, v!, "Flying")).toBe(true);
  });
});

describe("Dragon Broodmother", () => {
  it("each upkeep: a 1/1 red and green Dragon with flying and devour 2", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, broodmother);
    const fodder = putOnBattlefield(s, ap, bear());
    const opp = next(s, ap);
    s = passUntil(s, "upkeep", opp);
    s = resolveAll(s);
    // Devour as the token enters (CR 702.82a): sacrifice the bear for two +1/+1 counters.
    expect(s.pending?.kind).toBe("pickPermanents");
    s = resolveAll(act(s, { type: "pickPermanents", player: ap, ids: [fodder] }));
    const [d] = mine(s, ap, "Dragon Token");
    expect(d).toBeDefined();
    expect(zone(s, fodder)).toBe("graveyard");
    expect(pt(s, d!)).toBe("3/3");
    expect(kw(s, d!, "Flying")).toBe(true);
    expect(characteristics(s, s.objects[d!]!).colors.sort()).toEqual(["G", "R"]);
  });
});

describe("Colossus of Akros", () => {
  it("monstrous: trample and attacks despite defender", () => {
    let { s, ap } = setup([]);
    const c = putOnBattlefield(s, ap, akros);
    const can = () => potentialAttackers(s, ap).some((o) => o.id === c);
    expect(kw(s, c, "Trample")).toBe(false);
    expect(can()).toBe(false);
    s.objects[c]!.monstrous = true;
    invalidateCharacteristics(s);
    expect(kw(s, c, "Trample")).toBe(true);
    expect(can()).toBe(true);
  });
});

describe("Nightkin Ambusher", () => {
  it("can't be blocked while the defending player has a rad counter", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const n = putOnBattlefield(s, ap, ambusher);
    const b = putOnBattlefield(s, opp, bear());
    s.players[opp]!.rad = 1;
    s = attack(s, ap, [{ attacker: n, defender: opp }]);
    expect(blockProblem(s, s.objects[b]!, s.objects[n]!)).not.toBeNull();
    s.players[opp]!.rad = 0;
    invalidateCharacteristics(s);
    expect(blockProblem(s, s.objects[b]!, s.objects[n]!)).toBeNull();
  });
});

describe("Marina Vendrell's Grimoire", () => {
  it("you don't lose for having 0 or less life, and have no maximum hand size", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, grimoire);
    s.players[ap]!.life = 0;
    invalidateCharacteristics(s);
    s = passAll(s);
    expect(s.players[ap]!.lost).toBeFalsy();
  });
  it("without it, you do", () => {
    let { s, ap } = setup([]);
    s.players[ap]!.life = 0;
    s = passAll(s);
    expect(s.players[ap]!.lost).toBe(true);
  });
});

describe("Rakshasa Debaser", () => {
  it("attacks: a creature card from the defending player's graveyard onto the battlefield under your control", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const d = putOnBattlefield(s, ap, debaser);
    const theirs = into(s, opp, bear(), "graveyard");
    const other = into(s, next(s, opp), bear(), "graveyard");
    s = attack(s, ap, [{ attacker: d, defender: opp }]);
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(other)] })).toThrow();
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(theirs)] }));
    const back = mine(s, ap, "Grizzly Bears");
    expect(back.length).toBe(1);
    expect(zone(s, other)).toBe("graveyard");
  });
});

describe("Voracious Tome-Skimmer", () => {
  it("cast a spell during an opponent's turn: pay 1 life to draw", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    putOnBattlefield(s, ap, skimmer);
    const bolt = into(s, ap, card("Shock", "Instant", "{R}", { cmc: 1, oracleText: "Shock deals 2 damage to any target." }), "hand");
    s = passUntil(s, "upkeep", opp);
    s = priorityTo(s, ap);
    const hand = handOf(s, ap).length;
    const life = lifeOf(s, ap);
    s = run(s, planCast(s, ap, bolt, [{ kind: "player", id: opp }]));
    s = resolveAll(s);
    expect(lifeOf(s, ap)).toBe(life - 1);
    expect(handOf(s, ap).length).toBe(hand); // cast one, drew one
  });
  it("not on your own turn", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, skimmer);
    const bolt = into(s, ap, card("Shock", "Instant", "{R}", { cmc: 1, oracleText: "Shock deals 2 damage to any target." }), "hand");
    const life = lifeOf(s, ap);
    s = resolveAll(run(s, planCast(s, ap, bolt, [{ kind: "player", id: next(s, ap) }])));
    expect(lifeOf(s, ap)).toBe(life);
  });
});

describe("Liliana, Untouched by Death", () => {
  it("+1: mill three; a Zombie card among them drains each opponent for 2", () => {
    let { s, ap } = setup([]);
    const l = putOnBattlefield(s, ap, liliana);
    s.objects[l]!.counters.loyalty = 4;
    into(s, ap, card("Walking Corpse", "Creature — Zombie", "{1}{B}", { power: "2", toughness: "2" }), "library");
    const opp = next(s, ap);
    const [life, theirs] = [lifeOf(s, ap), lifeOf(s, opp)];
    s = resolveAll(run(s, planActivate(s, ap, l, 0)));
    expect(lifeOf(s, ap)).toBe(life + 2);
    expect(lifeOf(s, opp)).toBe(theirs - 2);
  });
  it("+1: no Zombie card, nothing more", () => {
    let { s, ap } = setup([]);
    const l = putOnBattlefield(s, ap, liliana);
    s.objects[l]!.counters.loyalty = 4;
    const life = lifeOf(s, ap);
    s = resolveAll(run(s, planActivate(s, ap, l, 0)));
    expect(lifeOf(s, ap)).toBe(life);
  });
});

describe("Bounty Agent", () => {
  it("destroys a legendary artifact, creature, or enchantment, not a nonlegendary one or a legendary land", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const a = putOnBattlefield(s, ap, bounty);
    const legend = putOnBattlefield(s, opp, card("Legend Bear", "Legendary Creature — Bear", "{1}{G}", { power: "2", toughness: "2" }));
    const plain = putOnBattlefield(s, opp, bear());
    const land = putOnBattlefield(s, opp, card("Legend Land", "Legendary Land"));
    expect(abilityProblem(s, ap, a, 0, [tgt(plain)])).not.toBeNull();
    expect(abilityProblem(s, ap, a, 0, [tgt(land)])).not.toBeNull();
    s = resolveAll(run(s, planActivate(s, ap, a, 0, [tgt(legend)])));
    expect(zone(s, legend)).toBe("graveyard");
    expect(zone(s, a)).toBe("graveyard");
  });
});

describe("Paladin Danse, Steel Maverick", () => {
  it("exile it: each creature you control that's an artifact or Human gains indestructible", () => {
    let { s, ap } = setup([]);
    const p = putOnBattlefield(s, ap, danse);
    const human = putOnBattlefield(s, ap, card("Villager", "Creature — Human", "{W}", { power: "1", toughness: "1" }));
    const golem = putOnBattlefield(s, ap, card("Golem", "Artifact Creature — Golem", "{2}", { power: "2", toughness: "2" }));
    const b = putOnBattlefield(s, ap, bear());
    s = resolveAll(run(s, planActivate(s, ap, p, 0)));
    expect(zone(s, p)).toBe("exile");
    expect([kw(s, human, "Indestructible"), kw(s, golem, "Indestructible"), kw(s, b, "Indestructible")]).toEqual([true, true, false]);
  });
});
const thundermaw = card("Thundermaw Hellkite", "Creature — Dragon", "{3}{R}{R}", {cmc: 5,power: "5",toughness: "5",keywords: ["Flying","Haste"],oracleText: "Flying\nHaste (This creature can attack and {T} as soon as it comes under your control.)\nWhen this creature enters, it deals 1 damage to each creature with flying your opponents control. Tap those creatures."});
const fadingHope = card("Fading Hope", "Instant", "{U}", {cmc: 1,keywords: ["Scry"],oracleText: "Return target creature to its owner's hand. If its mana value was 3 or less, scry 1. (Look at the top card of your library. You may put that card on the bottom.)"});
const brackish = card("Brackish Blunder", "Instant", "{1}{U}", {cmc: 2,keywords: ["Explore"],oracleText: "Return target creature to its owner's hand. If it was tapped, create a Map token. (It's an artifact with \"{1}, {T}, Sacrifice this token: Target creature you control explores. Activate only as a sorcery.\")"});
const desculpting = card("Desculpting Blast", "Instant", "{1}{U}", {cmc: 2,oracleText: "Return target nonland permanent to its owner's hand. If it was attacking, create a 1/1 colorless Drone artifact creature token with flying and \"This token can block only creatures with flying.\""});
const samut = card("Samut, Vizier of Naktamun", "Legendary Creature — Human Warrior Cleric", "{1}{R}{G}", {cmc: 3,power: "2",toughness: "3",keywords: ["Vigilance","First strike","Haste"],oracleText: "First strike, vigilance, haste\nWhenever a creature you control deals combat damage to a player, if that creature entered this turn, draw a card."});
const rayFillet = card("Ray Fillet, Wave Warrior", "Legendary Creature — Fish Mutant", "{2}{U}", {cmc: 3,power: "0",toughness: "2",keywords: ["Flying","Evolve"],oracleText: "Flying\nEvolve (Whenever a creature you control enters, if that creature has greater power or toughness than this creature, put a +1/+1 counter on this creature.)\nWhenever a creature you control with a counter on it deals combat damage to a player, draw a card."});
const raphael = card("Raphael, the Muscle", "Legendary Creature — Mutant Ninja Turtle", "{4}{R}", {cmc: 5,power: "4",toughness: "4",keywords: ["Partner","Double"],oracleText: "Double all damage that creatures you control with counters on them would deal.\nWhen Raphael enters, create a Mutagen token.\nPartner—Character select (You can have two commanders if both have this ability.)"});
const archon = card("Blazing Archon", "Creature — Archon", "{6}{W}{W}{W}", {cmc: 9,power: "5",toughness: "6",keywords: ["Flying"],oracleText: "Flying\nCreatures can't attack you."});
const malignus = card("Malignus", "Creature — Elemental Spirit", "{3}{R}{R}", {cmc: 5,power: "*",toughness: "*",oracleText: "Malignus's power and toughness are each equal to half the highest life total among your opponents, rounded up.\nDamage that would be dealt by this creature can't be prevented."});
const greedily = card("Too Greedily, Too Deep", "Sorcery", "{5}{B}{R}", {cmc: 7,oracleText: "Put target creature card from a graveyard onto the battlefield under your control. That creature deals damage equal to its power to each other creature."});
const keyrune = card("Dimir Keyrune", "Artifact", "{3}", {cmc: 3,oracleText: "{T}: Add {U} or {B}.\n{U}{B}: This artifact becomes a 2/2 blue and black Horror artifact creature until end of turn and can't be blocked this turn."});
const meek = card("Sword of the Meek", "Artifact — Equipment", "{2}", {cmc: 2,keywords: ["Equip"],oracleText: "Equipped creature gets +1/+2.\nEquip {2}\nWhenever a 1/1 creature you control enters, you may return this card from your graveyard to the battlefield, then attach it to that creature."});
const shroud = card("Smoke Shroud", "Enchantment — Aura", "{1}{U}", {cmc: 2,keywords: ["Enchant"],oracleText: "Enchant creature\nEnchanted creature gets +1/+1 and has flying.\nWhen a Ninja you control enters, you may return this card from your graveyard to the battlefield attached to that creature."});
const hit = (s: GameState, ap: PlayerId, attackers: string[], defender: PlayerId) => passUntil(attack(s, ap, attackers.map((attacker) => ({ attacker, defender }))), "endCombat", ap);

describe("Round 171, second cards", () => {
  it("are fully supported", () => supported(thundermaw, fadingHope, brackish, desculpting, samut, rayFillet, raphael, archon, malignus, greedily, keyrune, meek, shroud));
});

describe("Thundermaw Hellkite", () => {
  it("1 damage to each creature with flying your opponents control, and taps them", () => {
    let { s, ap, ids } = setup([thundermaw]);
    const opp = next(s, ap);
    const bird = putOnBattlefield(s, opp, card("Big Bird", "Creature — Bird", "{3}{W}", { power: "3", toughness: "3", keywords: ["Flying"], oracleText: "Flying" }));
    const walker = putOnBattlefield(s, opp, bear());
    const mine0 = putOnBattlefield(s, ap, card("My Bird", "Creature — Bird", "{3}{W}", { power: "3", toughness: "3", keywords: ["Flying"], oracleText: "Flying" }));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[bird]!.damage).toBe(1);
    expect(s.objects[bird]!.tapped).toBe(true);
    expect([s.objects[walker]!.damage, s.objects[walker]!.tapped]).toEqual([0, false]);
    expect([s.objects[mine0]!.damage, s.objects[mine0]!.tapped]).toEqual([0, false]);
  });
});

describe("Fading Hope and the other bounce-then-if spells", () => {
  it("Fading Hope: scry 1 if its mana value was 3 or less", () => {
    let { s, ap, ids } = setup([fadingHope]);
    const b = putOnBattlefield(s, next(s, ap), bear());
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    expect(zone(s, b)).toBe("hand");
    expect(s.pending?.kind).toBe("arrangeTop");
  });
  it("Fading Hope: no scry for a bigger creature", () => {
    let { s, ap, ids } = setup([fadingHope]);
    const big = putOnBattlefield(s, next(s, ap), card("Big", "Creature — Beast", "{3}{G}{G}", { cmc: 5, power: "5", toughness: "5" }));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(big)])));
    expect(zone(s, big)).toBe("hand");
    expect(s.pending).toBeFalsy();
  });
  it("Brackish Blunder: a Map token only if it was tapped", () => {
    let { s, ap, ids } = setup([brackish, brackish]);
    const opp = next(s, ap);
    const t = putOnBattlefield(s, opp, bear());
    s.objects[t]!.tapped = true;
    const u = putOnBattlefield(s, opp, bear());
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(t)])));
    expect(mine(s, ap, "Map Token").length).toBe(1);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!, [tgt(u)])));
    expect(zone(s, u)).toBe("hand");
    expect(mine(s, ap, "Map Token").length).toBe(1);
  });
  it("Desculpting Blast: a Drone only if it was attacking", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    const blast = into(s, opp, desculpting, "hand");
    for (const l of [island, island]) putOnBattlefield(s, opp, l);
    const b = putOnBattlefield(s, ap, bear());
    s = attack(s, ap, [{ attacker: b, defender: opp }]);
    s = priorityTo(s, opp);
    s = resolveAll(run(s, planCast(s, opp, blast, [tgt(b)])));
    expect(zone(s, b)).toBe("hand");
    expect(mine(s, opp, "Drone Token").length).toBe(1);
  });
});

describe("Samut, Vizier of Naktamun", () => {
  it("draws for a creature that entered this turn dealing combat damage to a player, not for an older one", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    putOnBattlefield(s, ap, samut);
    const old = putOnBattlefield(s, ap, bear());
    const fresh = putOnBattlefield(s, ap, card("Hasty Bear", "Creature — Bear", "{1}{R}", { power: "2", toughness: "2", keywords: ["Haste"], oracleText: "Haste" }));
    s.objects[fresh]!.controlledSinceTurn = s.turn;
    s.objects[fresh]!.enteredTurn = s.turn;
    invalidateCharacteristics(s);
    const hand = handOf(s, ap).length;
    s = hit(s, ap, [old, fresh], opp);
    expect(handOf(s, ap).length).toBe(hand + 1);
  });
});

describe("Ray Fillet, Wave Warrior", () => {
  it("draws for each creature with a counter on it that deals combat damage to a player", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    putOnBattlefield(s, ap, rayFillet);
    const a = putOnBattlefield(s, ap, bear());
    s.objects[a]!.counters.charge = 1;
    const b = putOnBattlefield(s, ap, bear());
    const c = putOnBattlefield(s, ap, bear());
    s.objects[c]!.counters["+1/+1"] = 1;
    invalidateCharacteristics(s);
    const hand = handOf(s, ap).length;
    s = hit(s, ap, [a, b, c], opp);
    expect(handOf(s, ap).length).toBe(hand + 2);
  });
});

describe("Raphael, the Muscle", () => {
  it("doubles the damage creatures you control with counters on them would deal", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    putOnBattlefield(s, ap, raphael);
    const a = putOnBattlefield(s, ap, bear());
    s.objects[a]!.counters.shield = 0;
    s.objects[a]!.counters.charge = 1;
    const b = putOnBattlefield(s, ap, bear());
    invalidateCharacteristics(s);
    const life = lifeOf(s, opp);
    s = hit(s, ap, [a, b], opp);
    expect(lifeOf(s, opp)).toBe(life - 4 - 2);
  });
});

describe("Blazing Archon", () => {
  it("creatures can't attack you, but can attack your planeswalkers", () => {
    let { s, ap } = setup([]);
    const opp = next(s, ap);
    putOnBattlefield(s, opp, archon);
    const pw = putOnBattlefield(s, opp, card("Test Walker", "Legendary Planeswalker — Test", "{3}", { loyalty: "3" }));
    s.objects[pw]!.counters.loyalty = 3;
    const b = putOnBattlefield(s, ap, bear());
    invalidateCharacteristics(s);
    expect(attackProblem(s, s.objects[b]!, opp)).not.toBeNull();
    expect(attackProblem(s, s.objects[b]!, opp, true, pw)).toBeNull();
    expect(attackProblem(s, s.objects[b]!, next(s, opp))).toBeNull();
  });
});

describe("Malignus", () => {
  it("is half the highest life total among your opponents, rounded up", () => {
    const { s, ap } = setup([]);
    const m = putOnBattlefield(s, ap, malignus);
    const opps = s.turnOrder.filter((p) => p !== ap);
    s.players[opps[0]!]!.life = 13;
    s.players[opps[1]!]!.life = 25;
    s.players[opps[2]!]!.life = 7;
    s.players[ap]!.life = 99;
    invalidateCharacteristics(s);
    expect(pt(s, m)).toBe("13/13");
  });
});

describe("Too Greedily, Too Deep", () => {
  it("returns a creature card from a graveyard under your control; it deals damage equal to its power to each other creature", () => {
    let { s, ap, ids } = setup([greedily]);
    const opp = next(s, ap);
    const giant = into(s, opp, card("Hill Giant", "Creature — Giant", "{3}{R}", { cmc: 4, power: "3", toughness: "3" }), "graveyard");
    const b = putOnBattlefield(s, ap, bear());
    const big = putOnBattlefield(s, opp, card("Wall", "Creature — Wall", "{3}", { power: "0", toughness: "5" }));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(giant)])));
    const [g] = mine(s, ap, "Hill Giant");
    expect(g).toBeDefined();
    expect(s.objects[g!]!.damage).toBe(0);
    expect(zone(s, b)).toBe("graveyard");
    expect(s.objects[big]!.damage).toBe(3);
  });
});

describe("Dimir Keyrune", () => {
  it("becomes a 2/2 blue and black Horror artifact creature that can't be blocked this turn", () => {
    let { s, ap } = setup([]);
    const k = putOnBattlefield(s, ap, keyrune);
    s = resolveAll(run(s, planActivate(s, ap, k, 0)));
    const c = characteristics(s, s.objects[k]!);
    expect(c.types).toEqual(expect.arrayContaining(["Artifact", "Creature"]));
    expect(c.subtypes).toEqual(["Horror"]);
    expect(c.colors.sort()).toEqual(["B", "U"]);
    expect(pt(s, k)).toBe("2/2");
    const opp = next(s, ap);
    const blocker = putOnBattlefield(s, opp, bear());
    s = attack(s, ap, [{ attacker: k, defender: opp }]);
    expect(blockProblem(s, s.objects[blocker]!, s.objects[k]!)).not.toBeNull();
  });
});

describe("Sword of the Meek", () => {
  it("a 1/1 creature you control enters: return it from your graveyard and attach it", () => {
    let { s, ap } = setup([]);
    const sword = into(s, ap, meek, "graveyard");
    const elf = into(s, ap, card("Llanowar Elves", "Creature — Elf Druid", "{G}", { cmc: 1, power: "1", toughness: "1" }), "hand");
    s = resolveAll(run(s, planCast(s, ap, elf)));
    expect(zone(s, sword)).toBe("battlefield");
    expect(s.objects[sword]!.attachedTo).toBe(elf);
    expect(pt(s, elf)).toBe("2/3");
  });
  it("not for a 2/2", () => {
    let { s, ap } = setup([]);
    const sword = into(s, ap, meek, "graveyard");
    const b = into(s, ap, bear(), "hand");
    s = resolveAll(run(s, planCast(s, ap, b)));
    expect(zone(s, sword)).toBe("graveyard");
  });
});

describe("Smoke Shroud", () => {
  it("a Ninja you control enters: return it from your graveyard attached to that Ninja", () => {
    let { s, ap } = setup([]);
    const aura = into(s, ap, shroud, "graveyard");
    const ninja = into(s, ap, card("Ninja", "Creature — Human Ninja", "{1}{U}", { cmc: 2, power: "1", toughness: "1" }), "hand");
    s = resolveAll(run(s, planCast(s, ap, ninja)));
    expect(zone(s, aura)).toBe("battlefield");
    expect(s.objects[aura]!.attachedTo).toBe(ninja);
    expect(kw(s, ninja, "Flying")).toBe(true);
  });
});

const revolt = card("Aether Revolt", "Enchantment", "{2}{R}{R}", {cmc: 4,keywords: ["Revolt"],oracleText: "Revolt — As long as a permanent left the battlefield under your control this turn, if a source you control would deal noncombat damage to an opponent or a permanent an opponent controls, it deals that much damage plus 2 instead.\nWhenever you get one or more {E}, this enchantment deals that much damage to any target."});
const colossus = card("Salvation Colossus", "Artifact Creature — Construct", "{6}{W}{W}", {cmc: 8,power: "9",toughness: "9",keywords: ["Flying","Vigilance","Unearth","Trample"],oracleText: "Flying, vigilance, trample\nWhenever you attack, other creatures you control get +2/+2 and gain indestructible until end of turn.\nUnearth—Pay eight {E}. (Pay eight energy counters: Return this card from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step or if it would leave the battlefield. Unearth only as a sorcery.)"});
const imskir = card("Imskir Iron-Eater", "Legendary Creature — Demon", "{6}{B}{R}", {cmc: 8,power: "5",toughness: "5",keywords: ["Affinity"],oracleText: "Affinity for artifacts (This spell costs {1} less to cast for each artifact you control.)\nWhen Imskir enters, you draw X cards and you lose X life, where X is half the number of artifacts you control, rounded down.\n{3}{R}, Sacrifice an artifact: Imskir deals damage equal to the sacrificed artifact's mana value to any target."});
const witch = card("Witch-king, Bringer of Ruin", "Legendary Creature — Wraith Noble", "{4}{B}{B}", {cmc: 6,power: "5",toughness: "3",keywords: ["Flying"],oracleText: "Flying\nWhenever Witch-king attacks, defending player sacrifices a creature with the least power among creatures they control."});
const gorma = card("Gorma, the Gullet", "Legendary Creature — Pest Frog", "{1}{B}{G}", {cmc: 3,power: "1",toughness: "1",keywords: ["Lifelink"],oracleText: "Lifelink\nWhenever another creature you control dies, put a +1/+1 counter on Gorma.\nNontoken creatures you control enter with an additional +1/+1 counter on them for each creature that died under your control this turn."});
const baldric = card("Multiclass Baldric", "Artifact — Equipment", "{1}", {cmc: 1,keywords: ["Equip"],oracleText: "Equipped creature has lifelink if you control a Cleric, deathtouch if you control a Rogue, haste if you control a Warrior, and flying if you control a Wizard.\nAs long as you have a full party, prevent all damage that would be dealt to equipped creature.\nEquip {2}"});
const insight = card("Embodiment of Insight", "Creature — Elemental", "{4}{G}", {cmc: 5,power: "4",toughness: "4",keywords: ["Vigilance","Landfall"],oracleText: "Vigilance\nLand creatures you control have vigilance.\nLandfall — Whenever a land you control enters, you may have target land you control become a 3/3 Elemental creature with haste until end of turn. It's still a land."});
const detective = card("Dogged Detective", "Creature — Human Rogue", "{1}{B}", {cmc: 2,power: "2",toughness: "1",keywords: ["Surveil"],oracleText: "When this creature enters, surveil 2. (Look at the top two cards of your library, then put any number of them into your graveyard and the rest on top of your library in any order.)\nWhenever an opponent draws their second card each turn, you may return this card from your graveyard to your hand."});
const tower = card("Avengers Tower", "Land", "", {cmc: 0,oracleText: "{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a Hero spell or to activate an ability of a Hero source.\n{4}, {T}: Look at the top three cards of your library. You may reveal a Hero card from among them and put it into your hand. Put the rest on the bottom of your library in any order."});
const barbara = card("Barbara Wright", "Legendary Creature — Human Advisor", "{1}{W}", {cmc: 2,power: "1",toughness: "3",keywords: ["History Teacher","Doctor's companion"],oracleText: "History Teacher — Sagas you control have read ahead. (As a Saga enters, choose a chapter and start with that many lore counters. Skipped chapters don't trigger.)\nDoctor's companion (You can have two commanders if the other is the Doctor.)"});
const siphoner = card("Glint-Sleeve Siphoner", "Creature — Human Rogue", "{1}{B}", {cmc: 2,power: "2",toughness: "1",keywords: ["Menace"],oracleText: "Menace\nWhenever this creature enters or attacks, you get {E} (an energy counter).\nAt the beginning of your upkeep, you may pay {E}{E}. If you do, you draw a card and you lose 1 life."});
const eldest = card("The Eldest Reborn", "Enchantment — Saga", "{4}{B}", {cmc: 5,oracleText: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — Each opponent sacrifices a creature or planeswalker of their choice.\nII — Each opponent discards a card.\nIII — Put target creature or planeswalker card from a graveyard onto the battlefield under your control."});
const ornament = card("Ornament", "Artifact", "{1}", { cmc: 1 });
const plain = (name: string, type: string, p = "2", t = "2") => card(name, `Creature — ${type}`, "{1}", { cmc: 1, power: p, toughness: t });

describe("Aether Revolt", () => {
  it("whenever you get energy it deals that much damage to any target; with revolt, 2 more to an opponent", () => {
    supported(revolt, siphoner);
    let { s, ap, opp } = setup([]);
    putOnBattlefield(s, ap, revolt);
    const sip = into(s, ap, siphoner, "hand");
    s = resolveAll(run(s, planCast(s, ap, sip)));
    expect(s.players[ap]!.energy).toBe(1);
    expect(s.pending?.kind).toBe("chooseTargets");
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(lifeOf(s, opp)).toBe(39);
    // A permanent left the battlefield under your control: revolt (CR 207.2c ability word).
    const orn = putOnBattlefield(s, ap, ornament);
    moveObject(s, orn, "graveyard");
    const sip2 = into(s, ap, siphoner, "hand");
    s = resolveAll(run(s, planCast(s, ap, sip2)));
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [{ kind: "player", id: opp }] }));
    expect(lifeOf(s, opp)).toBe(36);
  });
});

describe("Salvation Colossus", () => {
  it("unearth by paying eight energy", () => {
    supported(colossus);
    let { s, ap } = setup([]);
    const c = into(s, ap, colossus, "graveyard");
    s.players[ap]!.energy = 7;
    expect(planActivate(s, ap, c, 0)).toBeNull();
    s.players[ap]!.energy = 8;
    s = resolveAll(run(s, planActivate(s, ap, c, 0)));
    expect(zone(s, c)).toBe("battlefield");
    expect(s.players[ap]!.energy).toBe(0);
    expect(kw(s, c, "Haste")).toBe(true);
  });
  it("whenever you attack, other creatures get +2/+2 and indestructible", () => {
    let { s, ap, opp } = setup([]);
    const c = putOnBattlefield(s, ap, colossus);
    const b = putOnBattlefield(s, ap, bear());
    s = resolveAll(attack(s, ap, [{ attacker: c, defender: opp }]));
    expect(pt(s, b)).toBe("4/4");
    expect(kw(s, b, "Indestructible")).toBe(true);
    expect(pt(s, c)).toBe("9/9");
  });
});

describe("Imskir Iron-Eater", () => {
  it("enters: you draw X and lose X life, X half your artifacts rounded down", () => {
    supported(imskir);
    let { s, ap } = setup([]);
    for (let i = 0; i < 5; i++) putOnBattlefield(s, ap, ornament);
    const im = into(s, ap, imskir, "hand");
    const hand = handOf(s, ap).length;
    s = resolveAll(run(s, planCast(s, ap, im)));
    expect(handOf(s, ap).length).toBe(hand - 1 + 2);
    expect(lifeOf(s, ap)).toBe(38);
  });
  it("{3}{R}, sacrifice an artifact: damage equal to its mana value", () => {
    let { s, ap, opp } = setup([]);
    const im = putOnBattlefield(s, ap, imskir);
    const big = putOnBattlefield(s, ap, card("Big Rock", "Artifact", "{4}", { cmc: 4 }));
    s = resolveAll(run(s, planActivate(s, ap, im, 0, [{ kind: "player", id: opp }], undefined, undefined, undefined, { sacrifice: [big] })));
    expect(zone(s, big)).toBe("graveyard");
    expect(lifeOf(s, opp)).toBe(36);
  });
});

describe("Witch-king, Bringer of Ruin", () => {
  it("attacks: defending player sacrifices the creature with the least power", () => {
    supported(witch);
    let { s, ap, opp } = setup([]);
    const w = putOnBattlefield(s, ap, witch);
    const big = putOnBattlefield(s, opp, bear());
    const small = putOnBattlefield(s, opp, plain("Squire", "Human Soldier", "1", "2"));
    s = settle(attack(s, ap, [{ attacker: w, defender: opp }]), ap);
    expect(zone(s, small)).toBe("graveyard");
    expect(zone(s, big)).toBe("battlefield");
  });
});

describe("Gorma, the Gullet", () => {
  it("nontoken creatures enter with a +1/+1 counter for each creature that died under your control this turn", () => {
    supported(gorma);
    let { s, ap } = setup([]);
    const g = putOnBattlefield(s, ap, gorma);
    const b1 = putOnBattlefield(s, ap, bear());
    const b2 = putOnBattlefield(s, ap, bear());
    moveObject(s, b1, "graveyard");
    moveObject(s, b2, "graveyard");
    s = resolveAll(s);
    expect(pt(s, g)).toBe("3/3");
    const b3 = into(s, ap, bear(), "hand");
    s = resolveAll(run(s, planCast(s, ap, b3)));
    expect(pt(s, b3)).toBe("4/4");
  });
});

describe("Multiclass Baldric", () => {
  it("each keyword only while you control its class", () => {
    supported(baldric);
    let { s, ap } = setup([]);
    const eq = putOnBattlefield(s, ap, baldric);
    const b = putOnBattlefield(s, ap, bear());
    s.objects[eq]!.attachedTo = b;
    invalidateCharacteristics(s);
    expect(kw(s, b, "Lifelink")).toBe(false);
    putOnBattlefield(s, ap, plain("Acolyte", "Human Cleric"));
    expect(kw(s, b, "Lifelink")).toBe(true);
    expect(kw(s, b, "Deathtouch")).toBe(false);
    putOnBattlefield(s, ap, plain("Thief", "Human Rogue"));
    expect(kw(s, b, "Deathtouch")).toBe(true);
    expect(kw(s, b, "Haste")).toBe(false);
    expect(kw(s, b, "Flying")).toBe(false);
  });
});

describe("Embodiment of Insight", () => {
  it("landfall: a land becomes a 3/3 haste Elemental, still a land, and has vigilance", () => {
    supported(insight);
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, insight);
    const land = into(s, ap, forest, "hand");
    s = act(s, { type: "playLand", player: ap, objectId: land });
    expect(s.pending?.kind).toBe("chooseTargets");
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(land)] }));
    expect(pt(s, land)).toBe("3/3");
    const c = characteristics(s, s.objects[land]!);
    expect(c.types).toEqual(expect.arrayContaining(["Land", "Creature"]));
    expect(kw(s, land, "Haste")).toBe(true);
    expect(kw(s, land, "Vigilance")).toBe(true);
  });
});

describe("Dogged Detective", () => {
  it("an opponent draws their second card this turn: you may return it from your graveyard to your hand", () => {
    supported(detective);
    let { s, ap, opp } = setup([]);
    const d = into(s, ap, detective, "graveyard");
    draw(s, opp, 1);
    s = resolveAll(s);
    expect(zone(s, d)).toBe("graveyard");
    draw(s, opp, 1);
    s = resolveAll(s);
    expect(zone(s, d)).toBe("hand");
  });
  it("not for your own second card", () => {
    let { s, ap } = setup([]);
    const d = into(s, ap, detective, "graveyard");
    draw(s, ap, 2);
    s = resolveAll(s);
    expect(zone(s, d)).toBe("graveyard");
  });
});

describe("Avengers Tower", () => {
  it("its colored mana is only for Hero spells or abilities of Hero sources", () => {
    supported(tower);
    const m = compileCard(tower).mana[1]!;
    expect(m.spendOnly).toMatchObject({ spells: { subtypes: ["Hero"] }, abilities: { subtypes: ["Hero"] } });
  });
});

describe("Barbara Wright", () => {
  it("Sagas you control have read ahead", () => {
    supported(barbara);
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, barbara);
    const saga = into(s, ap, eldest, "hand");
    s = settle(run(s, planCast(s, ap, saga)), ap);
    expect(s.pending?.kind).toBe("chooseOption");
    expect(pending(s).what).toBe("readAhead");
    s = settle(act(s, { type: "chooseOption", player: ap, choice: "2" }), ap);
    expect(s.objects[saga]!.counters.lore).toBe(2);
  });
  it("without her, a Saga starts at chapter I", () => {
    let { s, ap } = setup([]);
    const saga = into(s, ap, eldest, "hand");
    s = settle(run(s, planCast(s, ap, saga)), ap);
    expect(s.objects[saga]!.counters.lore).toBe(1);
  });
});
