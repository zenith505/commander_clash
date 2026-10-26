// Round 171: the most played cards, in popularity order, after round 170 (from Haakon, Stromgald Scourge, rank 7,022, on).

import { describe, expect, it } from "vitest";
import { act, bear, card, forest, passAll, passUntil, pt, putOnBattlefield, scry, setup, swamp } from "./helpers";
import { moveObject, loseLife, spellCost, potentialAttackers, abilityProblem, blockProblem, botActions, controllerOf, parseManaCost, planMana, characteristics, invalidateCharacteristics, isFullySupported, objHasKeyword, planActivate, planCast, waitingOn, type Action, type CardDef, type GameState, type PlayerId, type TargetChoice } from "../src";

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
