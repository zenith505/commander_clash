// Round 170: the most played cards, in popularity order, after round 169 (from Carth the Lion, rank 6,377, on).

import { describe, expect, it } from "vitest";
import { act, bear, card, passAll, passUntil, pt, putOnBattlefield, setup, swamp } from "./helpers";
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
const handOf = (s: GameState, pid: PlayerId) => s.players[pid]!.hand;
const lifeOf = (s: GameState, pid: PlayerId) => s.players[pid]!.life;

const purse = card("Noble's Purse", "Artifact", "{2}", { cmc: 2, oracleText: "This artifact enters tapped and with three coin counters on it.\n{T}, Remove a coin counter from this artifact: Create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")" });

describe("Noble's Purse", () => {
  it("is fully supported", () => supported(purse));
  it("enters tapped with three coin counters", () => {
    let { s, ap, ids } = setup([purse]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(zone(s, ids[0]!)).toBe("battlefield");
    expect(s.objects[ids[0]!]!.tapped).toBe(true);
    expect(s.objects[ids[0]!]!.counters.coin).toBe(3);
  });
});

const edge = card("Edge of Autumn", "Sorcery", "{1}{G}", { cmc: 2, oracleText: "If you control four or fewer lands, search your library for a basic land card, put it onto the battlefield tapped, then shuffle.\nCycling—Sacrifice a land. (Sacrifice a land, Discard this card: Draw a card.)" });

describe("Edge of Autumn", () => {
  it("is fully supported", () => supported(edge));
  it("cycling: sacrifice a land and discard it to draw a card", () => {
    let { s, ap, ids } = setup([edge]);
    const lands = () => s.battlefield.filter((id) => s.objects[id]!.controller === ap && characteristics(s, s.objects[id]!).types.includes("Land")).length;
    const before = lands();
    const hand = handOf(s, ap).length;
    const land = s.battlefield.find((id) => s.objects[id]!.controller === ap && named(s, id) === "Forest")!;
    s = run(s, planActivate(s, ap, ids[0]!, 0, [], undefined, undefined, undefined, { sacrifice: [land] }));
    s = resolveAll(s);
    expect(zone(s, ids[0]!)).toBe("graveyard");
    expect(zone(s, land)).toBe("graveyard");
    expect(lands()).toBe(before - 1);
    expect(handOf(s, ap).length).toBe(hand);
  });
});

const oloro = card("Oloro, Ageless Ascetic", "Legendary Creature — Giant Soldier", "{3}{W}{U}{B}", { cmc: 6, power: "4", toughness: "5", oracleText: "At the beginning of your upkeep, you gain 2 life.\nWhenever you gain life, you may pay {1}. If you do, draw a card and each opponent loses 1 life.\nAt the beginning of your upkeep, if Oloro is in the command zone, you gain 2 life." });

describe("Oloro, Ageless Ascetic", () => {
  it("is fully supported", () => supported(oloro));
  it("in the command zone: you gain 2 life at the beginning of your upkeep (and only that ability works there)", () => {
    let { s, ap } = setup([]);
    s.cards[oloro.oracleId] = oloro;
    s.objects[s.players[ap]!.command[0]!]!.cardId = oloro.oracleId;
    invalidateCharacteristics(s);
    s = passUntil(passUntil(s, "end", ap), "upkeep", ap);
    const life = lifeOf(s, ap);
    s = resolveAll(s, false);
    expect(lifeOf(s, ap)).toBe(life + 2);
  });
  it("on the battlefield: only the first ability gains life (2, not 4)", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, oloro);
    s = passUntil(passUntil(s, "end", ap), "upkeep", ap);
    const life = lifeOf(s, ap);
    s = resolveAll(s, false);
    expect(lifeOf(s, ap)).toBe(life + 2);
  });
});

const truth = card("See the Truth", "Sorcery", "{1}{U}", { cmc: 2, oracleText: "Look at the top three cards of your library. Put one of those cards into your hand and the rest on the bottom of your library in any order. If this spell was cast from anywhere other than your hand, put each of those cards into your hand instead." });

describe("See the Truth", () => {
  it("is fully supported", () => supported(truth));
  it("cast from your hand: one of the three cards", () => {
    let { s, ap, ids } = setup([truth]);
    const hand = handOf(s, ap).length;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.pending?.kind).toBe("searchLibrary");
    const p = pending<{ cards: string[] }>(s);
    s = resolveAll(act(s, { type: "searchLibrary", player: ap, found: [p.cards[0]!] }));
    expect(handOf(s, ap).length).toBe(hand);
  });
  it("cast from anywhere else: all three cards", () => {
    let { s, ap, ids } = setup([truth]);
    const hand = handOf(s, ap).length;
    const top = s.players[ap]!.library.slice(0, 3);
    s = run(s, planCast(s, ap, ids[0]!));
    s.objects[ids[0]!]!.castFrom = "graveyard";
    s = resolveAll(s);
    expect(s.pending).toBeNull();
    expect(handOf(s, ap).length).toBe(hand + 2);
    for (const id of top) expect(zone(s, id)).toBe("hand");
  });
});

/** Everyone passes (no blocks) until a trigger asks for its targets. */
const untilTargets = (s: GameState) => {
  for (let i = 0; i < 40 && s.pending?.kind !== "chooseTargets"; i++) {
    const pid = waitingOn(s)!;
    s = s.pending?.kind === "declareBlockers" ? act(s, { type: "declareBlockers", player: pid, blocks: [] }) : act(s, { type: "passPriority", player: pid });
  }
  return s;
};
/** `attackers` attack `defender`; no blocks; everyone passes until the end of combat (triggers resolve on the way). */
const hit = (s: GameState, ap: PlayerId, attackers: string[], defender: PlayerId) => passUntil(attack(s, ap, attackers.map((attacker) => ({ attacker, defender }))), "endCombat", ap);

const mantle = card("Celestial Mantle", "Enchantment — Aura", "{3}{W}{W}{W}", { cmc: 6, oracleText: "Enchant creature\nEnchanted creature gets +3/+3.\nWhenever enchanted creature deals combat damage to a player, double its controller's life total.", keywords: ["Enchant"] });

describe("Celestial Mantle", () => {
  it("is fully supported", () => supported(mantle));
  it("doubles the enchanted creature's controller's life total", () => {
    let { s, ap, opp } = setup([]);
    const b = putOnBattlefield(s, ap, bear());
    const m = putOnBattlefield(s, ap, mantle);
    s.objects[m]!.attachedTo = b;
    invalidateCharacteristics(s);
    s.players[ap]!.life = 14;
    s = hit(s, ap, [b], opp);
    expect(lifeOf(s, opp)).toBe(40 - 5);
    expect(lifeOf(s, ap)).toBe(28);
  });
});

const stealEnchantment = card("Steal Enchantment", "Enchantment — Aura", "{U}{U}", { cmc: 2, oracleText: "Enchant enchantment\nYou control enchanted enchantment.", keywords: ["Enchant"] });

describe("Steal Enchantment", () => {
  it("is fully supported", () => supported(stealEnchantment));
  it("you control the enchanted enchantment", () => {
    let { s, ap, ids, opp } = setup([stealEnchantment]);
    const e = putOnBattlefield(s, opp, card("Test Enchantment", "Enchantment", "{1}"));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(e)])));
    expect(controllerOf(s, s.objects[e]!)).toBe(ap);
  });
});

const leveler = card("Leveler", "Artifact Creature — Juggernaut", "{5}", { cmc: 5, power: "10", toughness: "10", oracleText: "When this creature enters, exile all cards from your library." });

describe("Leveler", () => {
  it("is fully supported", () => supported(leveler));
  it("exiles all cards from your library as it enters", () => {
    let { s, ap, ids, opp } = setup([leveler]);
    const theirs = s.players[opp]!.library.length;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.players[ap]!.library.length).toBe(0);
    expect(s.players[opp]!.library.length).toBe(theirs);
  });
});

const medomai = card("Medomai the Ageless", "Legendary Creature — Sphinx", "{4}{W}{U}", { cmc: 6, power: "4", toughness: "4", oracleText: "Flying\nWhenever Medomai deals combat damage to a player, take an extra turn after this one.\nMedomai can't attack during extra turns.", keywords: ["Flying"] });

describe("Medomai the Ageless", () => {
  it("is fully supported", () => supported(medomai));
  it("can attack in a normal turn, not in the extra turn it gives", () => {
    let { s, ap, opp } = setup([]);
    const m = putOnBattlefield(s, ap, medomai);
    s = passUntil(s, "declareAttackers", ap);
    expect(potentialAttackers(s, ap).map((o) => o.id)).toContain(m);
    s = hit(s, ap, [m], opp);
    s = passUntil(s, "main1", ap);
    expect(s.extraTurn).toBeDefined();
    expect(potentialAttackers(s, ap).map((o) => o.id)).not.toContain(m);
  });
});

const ambusher = card("Nightpack Ambusher", "Creature — Wolf", "{2}{G}{G}", { cmc: 4, power: "4", toughness: "4", oracleText: "Flash\nOther Wolves and Werewolves you control get +1/+1.\nAt the beginning of your end step, if you didn't cast a spell this turn, create a 2/2 green Wolf creature token.", keywords: ["Flash"] });

describe("Nightpack Ambusher", () => {
  it("is fully supported", () => supported(ambusher));
  const wolves = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid).length;
  it("a Wolf at your end step if you didn't cast a spell this turn", () => {
    let { s, ap } = setup([]);
    putOnBattlefield(s, ap, ambusher);
    s = resolveAll(passUntil(s, "end", ap));
    expect(wolves(s, ap)).toBe(1);
  });
  it("none if you cast one (Ambusher itself)", () => {
    let { s, ap, ids } = setup([ambusher]);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    s = resolveAll(passUntil(s, "end", ap));
    expect(wolves(s, ap)).toBe(0);
  });
});

const glimmerpost = card("Glimmerpost", "Land — Locus", "", { cmc: 0, oracleText: "When this land enters, you gain 1 life for each Locus on the battlefield.\n{T}: Add {C}." });
const cloudpost = card("Cloudpost", "Land — Locus", "", { cmc: 0, oracleText: "This land enters tapped.\n{T}: Add {C} for each Locus on the battlefield." });

describe("Glimmerpost and Cloudpost", () => {
  it("are fully supported", () => supported(glimmerpost, cloudpost));
  it("Glimmerpost: 1 life for each Locus on the battlefield, anyone's", () => {
    let { s, ap, ids, opp } = setup([glimmerpost]);
    putOnBattlefield(s, opp, cloudpost);
    const life = lifeOf(s, ap);
    s = resolveAll(act(s, { type: "playLand", player: ap, objectId: ids[0]! }));
    expect(lifeOf(s, ap)).toBe(life + 2);
  });
});

const ravager = card("Dire Fleet Ravager", "Creature — Orc Pirate Wizard", "{3}{B}{B}", { cmc: 5, power: "4", toughness: "4", oracleText: "Menace, deathtouch\nWhen this creature enters, each player loses a third of their life, rounded up.", keywords: ["Menace", "Deathtouch"] });

describe("Dire Fleet Ravager", () => {
  it("is fully supported", () => supported(ravager));
  it("each player loses a third of their life, rounded up", () => {
    let { s, ap, ids, opp } = setup([ravager]);
    s.players[ap]!.life = 13;
    s.players[opp]!.life = 1;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(lifeOf(s, ap)).toBe(8);
    expect(lifeOf(s, opp)).toBe(0);
    for (const p of s.turnOrder.filter((p) => p !== ap && p !== opp)) expect(lifeOf(s, p)).toBe(40 - 14);
  });
});

const breathe = card("Breathe Your Last", "Instant", "{1}{B}{B}", { cmc: 3, oracleText: "Destroy target creature or planeswalker. You gain 1 life for each of its colors." });

describe("Breathe Your Last", () => {
  it("is fully supported", () => supported(breathe));
  it("you gain 1 life for each of its colors, as it last existed", () => {
    let { s, ap, ids, opp } = setup([breathe]);
    const gold = putOnBattlefield(s, opp, card("Gold Bear", "Creature — Bear", "{W}{U}{B}", { power: "2", toughness: "2" }));
    const life = lifeOf(s, ap);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(gold)])));
    expect(zone(s, gold)).toBe("graveyard");
    expect(lifeOf(s, ap)).toBe(life + 3);
  });
});

const virulent = card("Virulent Sliver", "Creature — Sliver", "{G}", { cmc: 1, power: "1", toughness: "1", oracleText: "All Sliver creatures have poisonous 1. (Whenever a Sliver deals combat damage to a player, that player gets a poison counter. A player with ten or more poison counters loses the game.)" });
const snakeCult = card("Snake Cult Initiation", "Enchantment — Aura", "{3}{B}", { cmc: 4, oracleText: "Enchant creature\nEnchanted creature has poisonous 3. (Whenever it deals combat damage to a player, that player gets three poison counters. A player with ten or more poison counters loses the game.)", keywords: ["Enchant"] });

describe("Virulent Sliver and Snake Cult Initiation (poisonous)", () => {
  it("are fully supported", () => supported(virulent, snakeCult));
  it("each Virulent Sliver gives every Sliver another poisonous 1", () => {
    let { s, ap, opp } = setup([]);
    const a = putOnBattlefield(s, ap, virulent);
    putOnBattlefield(s, ap, virulent);
    const other = putOnBattlefield(s, opp, virulent);
    void other;
    s = hit(s, ap, [a], opp);
    expect(s.players[opp]!.poison ?? 0).toBe(3);
  });
  it("Snake Cult Initiation: three poison counters", () => {
    let { s, ap, opp } = setup([]);
    const b = putOnBattlefield(s, ap, bear());
    const aura = putOnBattlefield(s, ap, snakeCult);
    s.objects[aura]!.attachedTo = b;
    invalidateCharacteristics(s);
    s = hit(s, ap, [b], opp);
    expect(s.players[opp]!.poison ?? 0).toBe(3);
  });
});

const needle = card("Needle Drop", "Instant", "{R}", { cmc: 1, oracleText: "Needle Drop deals 1 damage to any target that was dealt damage this turn.\nDraw a card." });

describe("Needle Drop", () => {
  it("is fully supported", () => supported(needle));
  it("targets only a player or permanent dealt damage this turn", () => {
    let { s, ap, ids, opp } = setup([needle]);
    const b = putOnBattlefield(s, opp, bear());
    expect(planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])).toBeNull();
    expect(planCast(s, ap, ids[0]!, [tgt(b)])).toBeNull();
    s = hit(s, ap, [putOnBattlefield(s, ap, bear())], opp);
    const life = lifeOf(s, opp);
    const hand = handOf(s, ap).length;
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [{ kind: "player", id: opp }])));
    expect(lifeOf(s, opp)).toBe(life - 1);
    expect(handOf(s, ap).length).toBe(hand);
  });
});

const scoreboard = card("Racers' Scoreboard", "Artifact", "{4}", { cmc: 4, oracleText: "Start your engines! (If you have no speed, it starts at 1. It increases once on each of your turns when an opponent loses life. Max speed is 4.)\nWhen this artifact enters, draw two cards, then discard a card.\nMax speed — Spells you cast cost {1} less to cast.", keywords: ["Max speed", "Start your engines!"] });

describe("Racers' Scoreboard", () => {
  it("is fully supported", () => supported(scoreboard));
  it("spells you cast cost {1} less only at max speed", () => {
    const { s, ap, ids } = setup([bear()]);
    putOnBattlefield(s, ap, scoreboard);
    s.players[ap]!.speed = 3;
    expect(spellCost(s, ap, s.objects[ids[0]!]!).extra).toBe(1);
    s.players[ap]!.speed = 4;
    invalidateCharacteristics(s);
    expect(spellCost(s, ap, s.objects[ids[0]!]!).extra).toBe(0);
  });
});

const maze = card("Lost in the Maze", "Enchantment", "{X}{U}{U}", { cmc: 2, oracleText: "Flash\nWhen this enchantment enters, tap X target creatures. Put a stun counter on each of those creatures you don't control. (If a permanent with a stun counter would become untapped, remove one from it instead.)\nTapped creatures you control have hexproof.", keywords: ["Flash"] });

describe("Lost in the Maze", () => {
  it("is fully supported", () => supported(maze));
  it("taps X target creatures; a stun counter only on those you don't control", () => {
    let { s, ap, ids, opp } = setup([maze]);
    const mine = putOnBattlefield(s, ap, bear());
    const theirs = putOnBattlefield(s, opp, bear());
    s = run(s, planCast(s, ap, ids[0]!, undefined, undefined, undefined, 2));
    s = resolveAll(s);
    expect(s.pending?.kind).toBe("chooseTargets");
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(mine), tgt(theirs)] }));
    expect(s.objects[mine]!.tapped).toBe(true);
    expect(s.objects[theirs]!.tapped).toBe(true);
    expect(s.objects[mine]!.counters.stun ?? 0).toBe(0);
    expect(s.objects[theirs]!.counters.stun).toBe(1);
  });
});

const skullsnatcher = card("Skullsnatcher", "Creature — Rat Ninja", "{1}{B}", { cmc: 2, power: "2", toughness: "1", oracleText: "Ninjutsu {B} ({B}, Return an unblocked attacker you control to hand: Put this card onto the battlefield from your hand tapped and attacking.)\nWhenever this creature deals combat damage to a player, exile up to two target cards from that player's graveyard.", keywords: ["Ninjutsu"] });

describe("Skullsnatcher", () => {
  it("is fully supported", () => supported(skullsnatcher));
  it("exiles up to two cards from the graveyard of the player it hit, not another's", () => {
    let { s, ap, opp } = setup([]);
    const sn = putOnBattlefield(s, ap, skullsnatcher);
    const a = into(s, opp, bear(), "graveyard");
    const b = into(s, opp, bear(), "graveyard");
    const other = into(s, next(s, opp), bear(), "graveyard");
    s = attack(s, ap, [{ attacker: sn, defender: opp }]);
    s = untilTargets(s);
    expect(s.pending?.kind).toBe("chooseTargets");
    expect(() => act(s, { type: "chooseTargets", player: ap, targets: [tgt(other), { kind: "none" }] })).toThrow();
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [tgt(a), tgt(b)] }));
    expect(zone(s, a)).toBe("exile");
    expect(zone(s, b)).toBe("exile");
    expect(zone(s, other)).toBe("graveyard");
  });
});

const gev = card("Gev, Scaled Scorch", "Legendary Creature — Lizard Mercenary", "{B}{R}", { cmc: 2, power: "3", toughness: "2", oracleText: "Ward—Pay 2 life.\nOther creatures you control enter with an additional +1/+1 counter on them for each opponent who lost life this turn.\nWhenever you cast a Lizard spell, Gev deals 1 damage to target opponent.", keywords: ["Ward"] });

describe("Gev, Scaled Scorch", () => {
  it("is fully supported", () => supported(gev));
  it("other creatures enter with a +1/+1 counter for each opponent who lost life this turn", () => {
    let { s, ap, ids, opp } = setup([bear(), bear()]);
    putOnBattlefield(s, ap, gev);
    s = resolveAll(run(s, planCast(s, ap, ids[0]!)));
    expect(s.objects[ids[0]!]!.counters["+1/+1"] ?? 0).toBe(0);
    for (const p of [opp, next(s, opp)]) loseLife(s, p, 1);
    s = resolveAll(run(s, planCast(s, ap, ids[1]!)));
    expect(s.objects[ids[1]!]!.counters["+1/+1"]).toBe(2);
  });
});

const kasmina = card("Kasmina, Enigmatic Mentor", "Legendary Planeswalker — Kasmina", "{3}{U}", { cmc: 4, loyalty: "5", oracleText: "Spells your opponents cast that target a creature or planeswalker you control cost {2} more to cast.\n−2: Create a 2/2 blue Wizard creature token. Draw a card, then discard a card." });

describe("Kasmina, Enigmatic Mentor", () => {
  it("is fully supported", () => supported(kasmina));
  it("opponents' spells that target a creature or planeswalker of yours cost {2} more", () => {
    const { s, ap, ids, opp } = setup([card("Shock", "Instant", "{R}", { cmc: 1, oracleText: "Shock deals 2 damage to any target." })]);
    putOnBattlefield(s, opp, kasmina);
    const theirs = putOnBattlefield(s, opp, bear());
    const mine = putOnBattlefield(s, ap, bear());
    const o = s.objects[ids[0]!]!;
    expect(spellCost(s, ap, o, 0, [], { targets: [tgt(theirs)] }).extra).toBe(2);
    expect(spellCost(s, ap, o, 0, [], { targets: [tgt(mine)] }).extra).toBe(0);
    expect(spellCost(s, ap, o, 0, [], { targets: [{ kind: "player", id: opp }] }).extra).toBe(0);
  });
});

const plum = card("Mastermind Plum", "Legendary Creature — Human Wizard", "{2}{B}", { cmc: 3, power: "2", toughness: "2", oracleText: "Whenever Mastermind Plum attacks, exile up to one target card from a graveyard. If an artifact card was exiled this way, create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")\nWhenever you cast a spell, if mana from a Treasure was spent to cast it, you draw a card and you lose 1 life.", keywords: ["Treasure"] });

describe("Mastermind Plum", () => {
  it("is fully supported", () => supported(plum));
  const plumAttack = (exiled: CardDef | null) => {
    let { s, ap, opp } = setup([]);
    const p = putOnBattlefield(s, ap, plum);
    const c = exiled ? into(s, opp, exiled, "graveyard") : undefined;
    s = untilTargets(attack(s, ap, [{ attacker: p, defender: opp }]));
    s = resolveAll(act(s, { type: "chooseTargets", player: ap, targets: [c ? tgt(c) : { kind: "none" }] }));
    if (c) expect(zone(s, c)).toBe("exile");
    return s.battlefield.filter((id) => s.objects[id]!.controller === ap && named(s, id) === "Treasure Token").length;
  };
  it("an artifact card exiled: a Treasure", () => expect(plumAttack(purse)).toBe(1));
  it("another card exiled: none", () => expect(plumAttack(bear())).toBe(0));
  it("no card chosen: none", () => expect(plumAttack(null)).toBe(0));
});

const haldir = card("Haldir, Lórien Lieutenant", "Legendary Creature — Elf Soldier", "{X}{G}", { cmc: 1, power: "0", toughness: "0", oracleText: "Haldir enters with X +1/+1 counters on it.\nVigilance\n{5}{G}: Until end of turn, other Elves you control gain vigilance and get +1/+1 for each +1/+1 counter on Haldir.", keywords: ["Vigilance"] });

describe("Haldir, Lórien Lieutenant", () => {
  it("is fully supported", () => supported(haldir));
  it("other Elves you control gain vigilance and +1/+1 for each +1/+1 counter on Haldir", () => {
    let { s, ap } = setup([]);
    const h = putOnBattlefield(s, ap, haldir);
    s.objects[h]!.counters["+1/+1"] = 3;
    const elf = putOnBattlefield(s, ap, card("Llanowar Elves", "Creature — Elf Druid", "{G}", { power: "1", toughness: "1" }));
    const notElf = putOnBattlefield(s, ap, bear());
    invalidateCharacteristics(s);
    s = resolveAll(run(s, planActivate(s, ap, h, 0)));
    expect(pt(s, elf)).toBe("4/4");
    expect(kw(s, elf, "Vigilance")).toBe(true);
    expect(pt(s, notElf)).toBe("2/2");
    expect(pt(s, h)).toBe("3/3");
  });
});

const suki = card("Suki, Courageous Rescuer", "Legendary Creature — Human Warrior Ally", "{1}{W}{W}", { cmc: 3, power: "2", toughness: "4", oracleText: "Other creatures you control get +1/+0.\nWhenever another permanent you control leaves the battlefield during your turn, create a 1/1 white Ally creature token. This ability triggers only once each turn." });

describe("Suki, Courageous Rescuer", () => {
  it("is fully supported", () => supported(suki));
  const allies = (s: GameState, pid: PlayerId) => s.battlefield.filter((id) => s.objects[id]!.isToken && s.objects[id]!.controller === pid).length;
  it("once each turn, during your turn only", () => {
    let { s, ap, ids } = setup([card("Two Bolts", "Sorcery", "{R}", { oracleText: "Destroy two target creatures." })]);
    putOnBattlefield(s, ap, suki);
    const a = putOnBattlefield(s, ap, bear());
    const b = putOnBattlefield(s, ap, bear());
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(a), tgt(b)])));
    expect(zone(s, a)).toBe("graveyard");
    expect(allies(s, ap)).toBe(1);
    // An opponent's turn: nothing.
    s = passUntil(s, "main1", next(s, ap));
    const c = putOnBattlefield(s, ap, bear());
    moveObject(s, c, "graveyard");
    s = resolveAll(s);
    expect(allies(s, ap)).toBe(1);
  });
});

const galvanic = card("Galvanic Discharge", "Instant", "{R}", { cmc: 1, oracleText: "Choose target creature or planeswalker. You get {E}{E}{E} (three energy counters), then you may pay any amount of {E}. Galvanic Discharge deals that much damage to that permanent." });
const harnessed = card("Harnessed Lightning", "Instant", "{1}{R}", { cmc: 2, oracleText: "Choose target creature. You get {E}{E}{E} (three energy counters), then you may pay any amount of {E}. Harnessed Lightning deals that much damage to that creature." });
const dieYoung = card("Die Young", "Sorcery", "{1}{B}", { cmc: 2, oracleText: "Choose target creature. You get {E}{E} (two energy counters), then you may pay any amount of {E}. The creature gets -1/-1 until end of turn for each {E} paid this way." });

describe("Galvanic Discharge, Harnessed Lightning and Die Young (pay any amount of energy)", () => {
  it("are fully supported", () => supported(galvanic, harnessed, dieYoung));
  it("Galvanic Discharge: get three energy, pay any amount, that much damage", () => {
    let { s, ap, ids, opp } = setup([galvanic]);
    s.players[ap]!.energy = 2;
    const big = putOnBattlefield(s, opp, card("Big", "Creature — Beast", "{4}", { power: "5", toughness: "5" }));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(big)])));
    expect(s.pending).toMatchObject({ kind: "chooseOption", what: "payEnergy", numberRange: { min: 0, max: 5 } });
    expect(() => act(s, { type: "chooseOption", player: ap, choice: "6" })).toThrow();
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: "4" }));
    expect(s.objects[big]!.damage).toBe(4);
    expect(s.players[ap]!.energy).toBe(1);
  });
  it("paying 0: no damage, the energy is kept", () => {
    let { s, ap, ids, opp } = setup([harnessed]);
    const b = putOnBattlefield(s, opp, bear());
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: "0" }));
    expect(s.objects[b]!.damage).toBe(0);
    expect(s.players[ap]!.energy).toBe(3);
  });
  it("Die Young: -1/-1 for each energy paid", () => {
    let { s, ap, ids, opp } = setup([dieYoung]);
    const big = putOnBattlefield(s, opp, card("Big", "Creature — Beast", "{4}", { power: "5", toughness: "5" }));
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(big)])));
    s = resolveAll(act(s, { type: "chooseOption", player: ap, choice: "2" }));
    expect(pt(s, big)).toBe("3/3");
    expect(s.players[ap]!.energy ?? 0).toBe(0);
  });
  it("a bot pays enough to kill an opponent's creature", () => {
    let { s, ap, ids, opp } = setup([galvanic]);
    const b = putOnBattlefield(s, opp, bear());
    s = resolveAll(run(s, planCast(s, ap, ids[0]!, [tgt(b)])));
    s = resolveAll(run(s, botActions(s, ap)));
    expect(zone(s, b)).toBe("graveyard");
    expect(s.players[ap]!.energy).toBe(1);
  });
  it("an illegal target: nothing, not even the energy", () => {
    let { s, ap, ids, opp } = setup([galvanic]);
    const b = putOnBattlefield(s, opp, bear());
    s = run(s, planCast(s, ap, ids[0]!, [tgt(b)]));
    moveObject(s, b, "graveyard");
    s = resolveAll(s);
    expect(s.pending).toBeNull();
    expect(s.players[ap]!.energy ?? 0).toBe(0);
  });
});

describe("Cloudpost", () => {
  it("adds {C} for each Locus on the battlefield", () => {
    let { s, ap, opp } = setup([]);
    const cp = putOnBattlefield(s, ap, cloudpost);
    putOnBattlefield(s, opp, glimmerpost);
    const before = s.players[ap]!.manaPool.C ?? 0;
    s = run(s, planActivate(s, ap, cp, 0));
    expect(s.players[ap]!.manaPool.C).toBe(before + 2);
  });
});
